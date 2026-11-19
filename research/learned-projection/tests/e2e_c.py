"""LP-2b-2a end-to-end helpers: ONE synthetic panel (2012-2021), the 2b-1a caches and the two development stand-ins built with `LAST_SEASON` = L0 = 2020, so season 2021
is the stand-in held season (F9). Everything lives in temporary folders; no real cache or candidate file is read or written. `registry.require` is patched
wherever a run reaches a registered fold (temporary candidates are untracked — the `e2e_w` rule)."""
import json
import os
import tempfile
from unittest import mock

import numpy as np
import pandas as pd
from threadpoolctl import threadpool_limits

import run_confirm as rc
import run_weekly_inputs as rwi
import run_weekly_models as rwm
from lp import asof, evaluate, registry, registry_w, season_models, weekly_data as wd
from tests import e2e_w
from tests import synth_season as ss
from tests import synth_weekly as sw
from tests import synth_wmodels as swm

_LIMIT = threadpool_limits(limits=1)             # G fits run in one thread (the runner pins the same way)
L0 = 2020
PANEL_TO = 2021
SEASON_FOLDS = (2018, 2019, L0)
_C = {}


def weekly_spec_c(name):
    s = swm.small_spec_w(name)
    s["lastSeason"] = L0
    return s


def season_spec_c(name):
    return e2e_w.season_spec(name)


def fake_require_c(name, T, layer="season", env=None):
    return {"spec": weekly_spec_c(name)} if layer == "weekly" else {"spec": season_spec_c(name)}


def make_base_c():
    """`e2e_w.make_base()` with `e2e_w.weekly_spec` patched to `weekly_spec_c` (no copy)."""
    with mock.patch.object(e2e_w, "weekly_spec", weekly_spec_c):
        return e2e_w.make_base()


def _write_rows(path, rows):
    with open(path, "w") as f:
        for r in rows:
            f.write(json.dumps(r, sort_keys=True) + "\n")


def build():
    """Built once per process: panel, caches, benchw, the season dev stand-in (`season-preds.jsonl` + s2a panel) and the weekly dev stand-in (preds, fits, s2b1b panel)."""
    if _C:
        return _C
    R, t, panel = sw.make_weekly_panel()
    root = tempfile.mkdtemp()
    caches = os.path.join(root, "caches")
    deps = rwi.Deps(load_cache=lambda: panel, load_teamctx=lambda: t.teamctx, load_extras=lambda: t.extras, load_spec=sw.small_spec, anchor=ss.ANCHOR, season_preds_sha=None,
                    section_sha=None, entries_path=None, cache_dir=caches, out_dir=root, runlog=False)
    with mock.patch.object(registry, "require", lambda *a, **k: None), mock.patch.object(wd, "LAST_SEASON", L0):
        assert rwi.main(["--check"], deps=deps) == 0
    full = asof.Tables.from_panel_full(panel, t.teamctx, t.extras)
    tables_l0 = wd.trim(full, last=L0)
    wkrows = t.weeks[t.weeks["inUniverse"].astype(bool)][["pid", "S", "w"]].copy()
    rng = np.random.RandomState(4)
    wkrows["cond"] = rng.uniform(3, 18, len(wkrows))
    wkrows["uncond"] = wkrows["cond"] * rng.uniform(0.5, 0.95, len(wkrows))
    benchw = wkrows.reset_index(drop=True)                                   # every panel season, 2021 included
    bpath, mpath = os.path.join(root, "benchw.jsonl"), os.path.join(root, "benchw.meta.json")
    _write_rows(bpath, benchw.to_dict("records"))
    bmeta = {"panelGeneratedAt": ss.ANCHOR, "checks": {k: {"pass": True} for k in ("c2", "c3", "c6")}}
    with open(mpath, "w") as f:
        json.dump(bmeta, f)
    # the season dev stand-in
    base = make_base_c()
    specs = {n: season_spec_c(n) for n in registry.NAMES}
    with mock.patch.object(registry, "require", lambda *a, **k: None), mock.patch.object(wd, "LAST_SEASON", L0):
        store = season_models.Store(tables_l0, panel.meta["keys"], panel.meta["weights"], specs["H"])
        frames, details = {"h": [], "g": []}, {"h": {}, "g": {}}
        for T in SEASON_FOLDS:
            for n in registry.NAMES:
                fr, out = season_models.fold(store, n, specs[n], T)
                frames[n.lower()].append(fr)
                details[n.lower()][T] = out["details"]
    cand = {c: pd.concat(v, ignore_index=True) for c, v in frames.items()}
    sf = evaluate.build_frame(tables_l0, SEASON_FOLDS, cand)
    res = evaluate.evaluate(sf, SEASON_FOLDS, 60, details=details)
    sp_path = os.path.join(root, "season-preds.jsonl")
    _write_rows(sp_path, [{"cand": c, **{k: (int(v) if isinstance(v, np.integer) else (None if isinstance(v, float) and not np.isfinite(v) else v)) for k, v in r.items()}}
                          for c, df in cand.items() for r in df.to_dict("records")])
    s2a = os.path.join(root, "s2a-dev-panel.json")
    with open(s2a, "w") as f:
        json.dump({"results": rwm._clean(res)}, f)
    # the weekly dev stand-in
    wout = os.path.join(root, "wdev")
    wdeps = rwm.Deps(anchor=ss.ANCHOR, load_meta=lambda: {"generatedAt": ss.ANCHOR}, load_benchw_meta=lambda: dict(bmeta), load_cache=lambda: panel, load_teamctx=lambda: t.teamctx,
                     load_extras=lambda: t.extras, load_benchw=lambda: (benchw.copy(), dict(bmeta)), inputs_path=os.path.join(caches, "weekly-inputs.pkl"),
                     inputs_sha=registry.sha_file(os.path.join(caches, "weekly-inputs.pkl")), prior_path=os.path.join(caches, "season-prior.jsonl"),
                     prior_sha=registry.sha_file(os.path.join(caches, "season-prior.jsonl")),
                     env=registry.Env(base=base, repo=base, prereg=e2e_w.report_hash()), env_w=registry_w.weekly_env(base=base, repo=base, prereg=e2e_w.report_hash(), data_fn=lambda: {}),
                     section_sha=None, s2b1a_artifact=None, benchw_path=bpath, benchw_meta_path=mpath, cache_dir=wout, out_dir=wout, verdict_dir=wout)
    with mock.patch.object(registry, "require", fake_require_c), mock.patch.object(wd, "LAST_SEASON", L0):
        assert rwm.main(["--dev", "--write", "--date", "2026-01-01", "--resamples", "60"], deps=wdeps) == 0
    s2b = os.path.join(wout, "2026-01-01-learned-s2b1b-dev-panel.json")
    _C.update(root=root, panel=panel, t=t, full=full, tables_l0=tables_l0, caches=caches, inputs=os.path.join(caches, "weekly-inputs.pkl"), prior=os.path.join(caches, "season-prior.jsonl"),
              benchw=benchw, bpath=bpath, mpath=mpath, bmeta=bmeta, season_preds=sp_path, s2a=s2a, s2b=s2b, preds=os.path.join(wout, "weekly-preds.jsonl"),
              fits=os.path.join(wout, "weekly-fits.pkl"), season_cand=cand, season_res=res)
    return _C


def sha_of(path):
    return registry.sha_file(path)


def rehearse_deps(base=None, **over):
    """A `run_confirm.Deps` pointing every field at the stand-in files with their SHAs; `env`/`env_w` at a FRESH base on every call (pass `base=` for two runs on one)."""
    c = build()
    base = base or make_base_c()
    out = os.path.join(base, "out")
    kw = dict(anchor=ss.ANCHOR, load_meta=lambda: {"generatedAt": ss.ANCHOR, "to": PANEL_TO}, load_benchw_meta=lambda: dict(c["bmeta"]), load_cache=lambda: c["panel"],
              load_teamctx=lambda: c["t"].teamctx, load_extras=lambda last: c["t"].extras, load_benchw=lambda: (c["benchw"].copy(), dict(c["bmeta"])),
              inputs_path=c["inputs"], inputs_sha=sha_of(c["inputs"]), prior_path=c["prior"], prior_sha=sha_of(c["prior"]), preds_path=c["preds"], preds_sha=sha_of(c["preds"]),
              fits_path=c["fits"], fits_sha=sha_of(c["fits"]), season_preds_path=c["season_preds"], season_preds_sha=sha_of(c["season_preds"]),
              dev_s2a_path=c["s2a"], dev_s2a_sha=sha_of(c["s2a"]), dev_s2b1b_path=c["s2b"], dev_s2b1b_sha=sha_of(c["s2b"]),
              env=registry.Env(base=base, repo=base, prereg=e2e_w.report_hash()),
              env_w=registry_w.weekly_env(base=base, repo=base, prereg=e2e_w.report_hash(), data_fn=lambda: {}),
              section_sha=None, expected_last=L0, panel_to=PANEL_TO, out_dir=out, runlog=True)
    kw.update(over)
    d = rc.Deps(**kw)
    d.base = base
    return d


def run_rehearse(argv, deps, patches=()):
    """`run_confirm.main` under `LAST_SEASON = L0` and the fake `require` (plus any extra patches); returns the exit code."""
    ps = [mock.patch.object(registry, "require", fake_require_c), mock.patch.object(wd, "LAST_SEASON", L0), *patches]
    for p in ps:
        p.start()
    try:
        return rc.main(argv, deps=deps)
    finally:
        for p in reversed(ps):
            p.stop()


def _max_season(x):
    if isinstance(x, pd.DataFrame):
        col = "S" if "S" in x.columns else ("T" if "T" in x.columns else None)
        return int(x[col].max()) if col and len(x) else None
    if isinstance(x, asof.Tables):
        vals = [_max_season(getattr(x, n)) for n in wd.TABLE_NAMES]
        vals = [v for v in vals if v is not None]
        return max(vals) if vals else None
    if isinstance(x, season_models.Store):
        return _max_season(x.tables)
    return None


class RecC:
    """Wraps callables; records per call and per argument position / name the maximum season seen in that argument (a DataFrame's `S`, else `T`; an `asof.Tables`'
    tables; a `season_models.Store`'s `.tables`)."""

    def __init__(self):
        self.calls = []

    def wrap(self, name, fn):
        def inner(*a, **k):
            seen = {i: _max_season(x) for i, x in enumerate(a)}
            seen.update({kk: _max_season(x) for kk, x in k.items()})
            self.calls.append((name, seen))
            return fn(*a, **k)
        return inner

    def count(self, name):
        return sum(1 for n, _ in self.calls if n == name)

    def maxima(self, name):
        return [{k: v for k, v in seen.items() if v is not None} for n, seen in self.calls if n == name]
