"""LP-2b-1b end-to-end helpers: ONE synthetic panel, the two 2b-1a caches written by ONE `run_weekly_inputs` run (L = 2021, the panel's last season), a stand-in benchw
that also holds season L + 1, and temporary candidate folders. `registry.require` is always patched when a run reaches `fold_w` (T-B-10..T-B-16 say so)."""
import json
import os
import shutil
import tempfile
from unittest import mock

import numpy as np
import pandas as pd

import run_weekly_inputs as rwi
import run_weekly_models as rwm
from lp import baselines, evaluate_w, registry, registry_w, weekly_data as wd, weekly_models
from tests import synth_season as ss
from tests import synth_weekly as sw
from tests import synth_wmodels as swm

L = 2021
_CACHE = {}


def build():
    """Built once per process (about 90 s): panel, caches, benchw, shas."""
    if _CACHE:
        return _CACHE
    R, t, panel = sw.make_weekly_panel()
    root = tempfile.mkdtemp()
    caches = os.path.join(root, "caches")
    deps = rwi.Deps(load_cache=lambda: panel, load_teamctx=lambda: t.teamctx, load_extras=lambda: t.extras, load_spec=sw.small_spec, anchor=ss.ANCHOR, season_preds_sha=None,
                    section_sha=None, entries_path=None, cache_dir=caches, out_dir=root, runlog=False)
    with mock.patch.object(registry, "require", lambda *a, **k: None), mock.patch.object(wd, "LAST_SEASON", L):
        assert rwi.main(["--check"], deps=deps) == 0
    wkrows = t.weeks[t.weeks["inUniverse"].astype(bool)][["pid", "S", "w"]].copy()
    rng = np.random.RandomState(4)
    wkrows["cond"] = rng.uniform(3, 18, len(wkrows))
    wkrows["uncond"] = wkrows["cond"] * rng.uniform(0.5, 0.95, len(wkrows))
    late = wkrows[wkrows["S"] == L].copy()
    late["S"] = L + 1                                                       # the held season: benchw holds it (Fact of T-B-10)
    benchw = pd.concat([wkrows, late], ignore_index=True)
    bpath, mpath = os.path.join(root, "benchw.jsonl"), os.path.join(root, "benchw.meta.json")
    with open(bpath, "w") as f:
        for r in benchw.to_dict("records"):
            f.write(json.dumps(r) + "\n")
    bmeta = {"panelGeneratedAt": ss.ANCHOR, "checks": {k: {"pass": True} for k in ("c2", "c3", "c6")}}
    with open(mpath, "w") as f:
        json.dump(bmeta, f)
    _CACHE.update(root=root, panel=panel, t=t, caches=caches, inputs=os.path.join(caches, "weekly-inputs.pkl"), prior=os.path.join(caches, "season-prior.jsonl"),
                  benchw=benchw, bpath=bpath, mpath=mpath, bmeta=bmeta)
    _CACHE["inputs_sha"] = registry.sha_file(_CACHE["inputs"])
    _CACHE["prior_sha"] = registry.sha_file(_CACHE["prior"])
    return _CACHE


def season_spec(name):
    return sw.small_spec(name)


def weekly_spec(name):
    s = swm.small_spec_w(name)
    s["lastSeason"] = L
    return s


def make_base(layers=("season", "weekly")):
    """A temporary base folder with `candidates/H.json` and `G.json` (the small specs, unstamped) and a run-log home."""
    d = tempfile.mkdtemp()
    os.makedirs(os.path.join(d, "candidates"))
    os.makedirs(os.path.join(d, ".cache", "models"))
    for n in ("H", "G"):
        obj = {"name": n, "preregHash": report_hash(), "layers": {}}
        if "season" in layers:
            obj["layers"]["season"] = {"spec": season_spec(n)}
        if "weekly" in layers:
            obj["layers"]["weekly"] = {"spec": weekly_spec(n)}
        with open(os.path.join(d, "candidates", "%s.json" % n), "w") as f:
            f.write(json.dumps(obj, indent=1, sort_keys=True) + "\n")
    return d


def report_hash():
    from lp import report
    return report.PREREG_HASH


def fake_require(name, T, layer="season", env=None):
    return {"spec": weekly_spec(name)} if layer == "weekly" else {"spec": season_spec(name)}


def deps_for(base=None, **over):
    c = build()
    base = base or make_base()
    out = os.path.join(base, "out")
    kw = dict(anchor=ss.ANCHOR, load_meta=lambda: {"generatedAt": ss.ANCHOR}, load_benchw_meta=lambda: dict(c["bmeta"]), load_cache=lambda: c["panel"],
              load_teamctx=lambda: c["t"].teamctx, load_extras=lambda: c["t"].extras, load_benchw=lambda: (c["benchw"].copy(), dict(c["bmeta"])),
              inputs_path=c["inputs"], inputs_sha=c["inputs_sha"], prior_path=c["prior"], prior_sha=c["prior_sha"],
              env=registry.Env(base=base, repo=base, prereg=report_hash()), env_w=registry_w.weekly_env(base=base, repo=base, prereg=report_hash(), data_fn=lambda: {}),
              section_sha=None, s2b1a_artifact=None, benchw_path=c["bpath"], benchw_meta_path=c["mpath"], cache_dir=out, out_dir=out, verdict_dir=out)
    kw.update(over)
    d = rwm.Deps(**kw)
    d.base = base
    return d


class Rec:
    """Records the maximum season of every DataFrame argument of the wrapped callables."""

    def __init__(self):
        self.calls = []

    def wrap(self, name, fn):
        def inner(*a, **k):
            for x in list(a) + list(k.values()):
                if isinstance(x, pd.DataFrame) and len(x):
                    col = "S" if "S" in x.columns else ("T" if "T" in x.columns else None)
                    if col:
                        self.calls.append((name, int(x[col].max())))
            return fn(*a, **k)
        return inner


_DEV = {}


def dev_run():
    """ONE successful `--dev --write` (patched `registry.require`, LAST_SEASON = L), shared by the tests that read its outputs."""
    if _DEV:
        return _DEV
    base = make_base()
    deps = deps_for(base)
    rec = Rec()
    patches = [mock.patch.object(registry, "require", fake_require), mock.patch.object(wd, "LAST_SEASON", L),
               mock.patch.object(baselines, "weekly_forecasts", rec.wrap("weekly_forecasts", baselines.weekly_forecasts)),
               mock.patch.object(weekly_models, "fit_w", rec.wrap("fit_w", weekly_models.fit_w)), mock.patch.object(evaluate_w, "labels", rec.wrap("labels", evaluate_w.labels))]
    for p in patches:
        p.start()
    try:
        rc = rwm.main(["--dev", "--write", "--date", "2026-01-01", "--resamples", "60"], deps=deps)
    finally:
        for p in reversed(patches):
            p.stop()
    out = deps.cache_dir
    _DEV.update(rc=rc, base=base, deps=deps, rec=rec, out=out)
    return _DEV
