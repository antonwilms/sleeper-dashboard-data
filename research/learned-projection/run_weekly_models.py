#!/usr/bin/env python3
"""LP-2b-1b weekly-models runner (research only — never run by npm test, smoke or CI).

    python3 research/learned-projection/run_weekly_models.py --init-weekly
    python3 research/learned-projection/run_weekly_models.py --smoke
    python3 research/learned-projection/run_weekly_models.py --register-weekly
    python3 research/learned-projection/run_weekly_models.py --dev --write [--date YYYY-MM-DD] [--resamples 2000]

--init-weekly      writes the UNSTAMPED weekly layer (the spec) into candidates/H.json and G.json; the season sections stay byte-identical.
--smoke            fits 2018 only (weeks 1-9 -> weeks 10+), unregistered; prints the label arithmetic, writes nothing.
--register-weekly  stamps the weekly layer of both candidates atomically (run after Commit 1, then commit the two files). No re-registration path.
--dev              requires both layers of both candidates for every development fold 2019..2024 FIRST, fits H and G on those folds only — never 2025 —
                   appends ONE `weekly-dev` run-log entry (a second --dev is refused) and writes weekly-preds.jsonl, weekly-fits.pkl, the artifact and the verdict.
The FIRST step of every mode recomputes the LP-1a §8 hash; the SECOND checks the anchors (panel, benchw meta, both 2b-1a caches by SHA-256) — both before
any registry access, any cache read or any fit. Nothing here writes either 2b-1a cache."""
import os
import sys

# Every G (gradient-boosted trees) fit runs on ONE thread (COPY of run_weekly_inputs.py — T-B-15; Anton's rulings 2026-11-17): set before numpy/sklearn is imported.
_SKLEARN_PRELOADED = "sklearn" in sys.modules
_NUMPY_PRELOADED = "numpy" in sys.modules
THREAD_VARS = ("OMP_NUM_THREADS", "VECLIB_MAXIMUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS")
for _v in THREAD_VARS:
    os.environ[_v] = "1"


def _ensure_hash_seed(execv=os.execv):
    """A G fit also varies ACROSS processes with PYTHONHASHSEED; a fresh interpreter cannot change its own seed, so the CLI re-executes itself once with seed 0."""
    if os.environ.get("PYTHONHASHSEED") != "0":
        os.environ["PYTHONHASHSEED"] = "0"
        execv(sys.executable, [sys.executable] + sys.argv)


if __name__ == "__main__":
    _ensure_hash_seed()

import argparse  # noqa: E402
import gc  # noqa: E402
import json  # noqa: E402
import pickle  # noqa: E402
import time  # noqa: E402
from dataclasses import dataclass, field  # noqa: E402
from datetime import date  # noqa: E402
from typing import Callable, Optional  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import run_season_models  # noqa: E402
from lp import asof, baselines, evaluate_w, extra, io, registry, registry_w, report, report_s2b, score, season_models, spec_w, splits, weekly_data, weekly_h, weekly_models  # noqa: E402

INPUTS_SHA = "2431b3978d5a078fb2256e3553ca513f17c62160ec56ac72fb657486f43a1fb2"          # .cache/models/weekly-inputs.pkl (2b-1a final run)
PRIOR_SHA = "55c55e200ce18d549d522ee007e284bbe180ff98209378c4c355a47a9643c56a"           # .cache/models/season-prior.jsonl (2b-1a final run)
MODELS_DIR = os.path.join(registry.HERE, ".cache", "models")
PANEL_DIR = os.path.join(registry.HERE, ".cache", "panel")
S2B1A_ARTIFACT = os.path.join(REPO, "backtests", "2026-11-17-learned-s2b1a-inputs.json")
SMOKE_FOLD = 2018
SMOKE_SPLIT_WEEK = 10
FOLD_LIMIT_MIN = 60
DEV_LIMIT_H = 6
ARTIFACT_LIMIT = 5 * 1024 * 1024
FITS_LIMIT = 2 * 1024 ** 3
TOL = 1e-9


def _default_load_meta():
    with open(os.path.join(PANEL_DIR, "meta.json")) as f:
        return json.load(f)


def _default_load_benchw_meta():
    with open(os.path.join(PANEL_DIR, "benchw.meta.json")) as f:
        return json.load(f)


@dataclass
class Deps:
    """Every outside dependency of `main`, each replaceable by a test. The locks are NOT members: every check goes through the module attribute
    `registry.require` (also inside `weekly_models.fold_w`)."""
    task_file: str = run_season_models.LP1A_TASK_FILE
    anchor: str = run_season_models.ANCHOR_GENERATED_AT
    load_meta: Callable = _default_load_meta
    load_benchw_meta: Callable = _default_load_benchw_meta
    load_cache: Callable = io.load_cache
    load_teamctx: Callable = io.load_teamctx
    load_extras: Callable = lambda: extra.build_extras(last=weekly_data.LAST_SEASON)
    load_benchw: Callable = io.load_benchw
    inputs_path: str = os.path.join(MODELS_DIR, "weekly-inputs.pkl")
    inputs_sha: str = INPUTS_SHA
    prior_path: str = os.path.join(MODELS_DIR, "season-prior.jsonl")
    prior_sha: str = PRIOR_SHA
    env: object = field(default_factory=registry.Env)
    env_w: object = field(default_factory=registry_w.weekly_env)
    section_sha: Optional[dict] = field(default_factory=lambda: dict(registry_w.SECTION_SHA))
    benchw_path: str = os.path.join(PANEL_DIR, "benchw.jsonl")
    benchw_meta_path: str = os.path.join(PANEL_DIR, "benchw.meta.json")
    s2b1a_artifact: Optional[str] = S2B1A_ARTIFACT
    cache_dir: str = MODELS_DIR
    out_dir: str = os.path.join(REPO, "backtests")
    verdict_dir: str = os.path.join(REPO, "grading")
    runlog: bool = True


def _stop(msg):
    print("[run] STOP: %s" % msg, file=sys.stderr)
    return 2


def _clean(o):
    if isinstance(o, dict):
        return {str(k): _clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_clean(v) for v in o]
    if isinstance(o, (np.floating, float)):
        return None if not np.isfinite(o) else float(o)
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, np.bool_):
        return bool(o)
    return o


def _read_prior(path):
    with open(path) as f:
        rows = [json.loads(line) for line in f if line.strip()]
    df = pd.DataFrame(rows)
    df["pid"] = df["pid"].astype(str)
    return df


def _combo(d):
    """Combined SHA-256 over the sorted `path:hash` lines of a code / harness group."""
    return registry.sha_bytes("\n".join("%s:%s" % (k, d[k]) for k in sorted(d)).encode("utf-8"))


def _data_sha(d):
    return registry.sha_bytes(json.dumps(d, sort_keys=True, separators=(",", ":")).encode("utf-8"))


def _registration(env, names):
    out = {}
    for n in names:
        lays = registry.load(env, n)["layers"]
        out[n] = {}
        for layer in ("season", "weekly"):
            lay = lays.get(layer) or {}
            out[n][layer] = {"specSha256": lay.get("specSha256"), "codeSha256": _combo(lay["code"]) if lay.get("code") else None,
                             "harnessSha256": _combo(lay["harness"]) if lay.get("harness") else None, "dataSha256": _data_sha(lay["data"]) if lay.get("data") else None,
                             "registeredAt": lay.get("registeredAt")}
    return out


def _threads():
    return {**{v: os.environ.get(v) for v in THREAD_VARS}, "PYTHONHASHSEED": os.environ.get("PYTHONHASHSEED"), "setBeforeSklearnImport": not _SKLEARN_PRELOADED,
            "numpyPreloaded": _NUMPY_PRELOADED, "cpuCount": os.cpu_count()}


def _task_sha(env):
    return registry.sha_file(env.task_file)


def main(argv=None, deps=None):
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--init-weekly", action="store_true")
    g.add_argument("--smoke", action="store_true")
    g.add_argument("--register-weekly", action="store_true")
    g.add_argument("--dev", action="store_true")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--date", default=date.today().isoformat())
    ap.add_argument("--resamples", type=int, default=2000)
    args = ap.parse_args(argv)
    deps = deps or Deps()
    log = lambda m: print("[run] " + m, flush=True)
    names = registry.NAMES
    secs = {}
    t_all = time.time()

    # (1) FIRST, before any load: the pre-registered bar is unchanged
    with open(deps.task_file, encoding="utf-8") as f:
        h, section8 = report.prereg_hash(f.read())
    if h != report.PREREG_HASH:
        return _stop("LP-1a §8 hash %s differs from the pinned %s — the pre-registered bar was edited" % (h, report.PREREG_HASH))

    # (2) anchors, before any registry access (flag 4): the panel, the benchw replay, both 2b-1a caches by SHA-256 (before any pickle is read)
    meta = deps.load_meta()
    if meta.get("generatedAt") != deps.anchor:
        return _stop("panel generatedAt %s differs from the anchor %s" % (meta.get("generatedAt"), deps.anchor))
    bmeta = deps.load_benchw_meta()
    if bmeta.get("panelGeneratedAt") != deps.anchor:
        return _stop("benchw.meta.panelGeneratedAt %s differs from the anchor %s — re-run export-weekly" % (bmeta.get("panelGeneratedAt"), deps.anchor))
    failed = [k for k in ("c2", "c3", "c6") if not (bmeta.get("checks") or {}).get(k, {}).get("pass")]
    if failed:
        return _stop("benchw run-time check(s) %s did not pass" % ", ".join(failed))
    for label, path, want in (("weekly-inputs.pkl", deps.inputs_path, deps.inputs_sha), ("season-prior.jsonl", deps.prior_path, deps.prior_sha)):
        got = registry.sha_file(path) if os.path.exists(path) else None
        if got != want:
            return _stop("%s SHA-256 %s differs from the 2b-1a anchor %s — a cache is never regenerated here (a stop for Anton)" % (label, got, want))

    # (3) mode
    if args.init_weekly:
        try:
            lays = registry_w.init_weekly(deps.env_w, names, section_sha=deps.section_sha)
        except registry.NotRegistered as e:
            return _stop(str(e))
        for n in names:
            log("wrote the unstamped weekly layer of %s: specSha256 of the spec %s" % (n, registry.spec_sha(lays[n]["spec"])))
        return 0
    if args.register_weekly:
        try:
            done = registry_w.register_weekly(deps.env, deps.env_w, names, section_sha=deps.section_sha)
        except registry.NotRegistered as e:
            return _stop(str(e))
        for n in names:
            log("registered the weekly layer of %s: specSha256 %s" % (n, done[n]["specSha256"]))
        return 0
    folds = (SMOKE_FOLD,)
    specs = {}
    if args.smoke:
        for n in names:
            specs[n] = registry.load(deps.env_w, n)["layers"]["weekly"]["spec"]
    else:
        if not args.write:
            return _stop("--dev needs --write: the run is single-use")
        try:
            for n in names:
                for T in splits.DEV_FOLDS:
                    registry.require(n, T, "season", deps.env)
                    lay = registry.require(n, T, "weekly", deps.env_w)
                specs[n] = lay["spec"]
        except (registry.NotRegistered, registry.ConfirmationHeld) as e:
            return _stop(str(e))
        if any(e.get("mode") == "weekly-dev" for e in registry.runlog_entries(deps.env_w)):
            return _stop("a weekly-dev run-log entry exists — a second --dev is a stop for Anton (G is not reproducible run to run)")
        folds = tuple(T for T in splits.DEV_FOLDS if T <= weekly_data.LAST_SEASON)
    for n in names:
        if specs[n]["lastSeason"] != weekly_data.LAST_SEASON or specs[n]["trainFrom"] != spec_w.TRAIN_FROM:
            return _stop("%s: the spec's lastSeason / trainFrom differ from the module constants" % n)

    # (4) load, trim, assert, drop every untrimmed reference; scoring parity on the trimmed tables
    t0 = time.time()
    panel = deps.load_cache()
    tables = asof.Tables.from_panel_full(panel, deps.load_teamctx(), deps.load_extras())
    T_trim = weekly_data.trim(tables)
    pmeta = panel.meta
    del panel, tables
    gc.collect()
    try:
        weekly_data.assert_trimmed(T_trim)
    except AssertionError as e:
        return _stop("trim: %s" % e)
    order = [pmeta["keys"].index(k) for k in pmeta["weights"]]
    n_par, bad = score.parity(T_trim.X[T_trim.weeks["rid"].to_numpy()][:, order], T_trim.weeks["pts"].to_numpy(), [pmeta["weights"][k] for k in pmeta["weights"]])
    log("scoring parity (trimmed): %d / %d played rows exact" % (n_par - len(bad), n_par))
    if len(bad):
        return _stop("scoring parity failed on %d rows" % len(bad))
    secs["load+trim"] = round(time.time() - t0, 1)

    # (5) build: the 2b-1a caches (SHA verified above), the store, the history, the LP-1a weekly frame
    t0 = time.time()
    frames = pd.read_pickle(deps.inputs_path)                                # our own cache: its SHA-256 was verified against the 2b-1a anchor in step 2
    prior = _read_prior(deps.prior_path)
    store = season_models.Store(T_trim, pmeta["keys"], pmeta["weights"], registry.load(deps.env, "H")["layers"]["season"]["spec"])
    hist = weekly_h.history(T_trim, store, weekly_data.seasons())
    wf = baselines.build_weekly_frame(T_trim, seasons=range(splits.FIRST_TRAIN_SEASON, weekly_data.LAST_SEASON + 1))
    secs["build"] = round(time.time() - t0, 1)

    # (6) the held season is still out of every table and frame (benchw included)
    benchw = weekly_data.trim_frame(deps.load_benchw()[0])
    try:
        weekly_data.assert_trimmed(T_trim, frames=[benchw, frames["H"], frames["G"], wf, hist])
    except AssertionError as e:
        return _stop("trim check: %s" % e)

    # (7) runtime checks — a miss returns 2 before any fit and before the run-log entry
    t0 = time.time()
    n0 = {}
    for n in names:
        n0[n] = weekly_models.n0_check(frames[n], prior[prior["cand"] == n.lower()], store, TOL)
        if not n0[n] <= TOL:
            return _stop("check (a): the n = 0 identity differs for %s (max relative %.3g > %g)" % (n, n0[n], TOL))
    cross = {}
    for n in names:
        cross[n] = weekly_h.crosscheck(frames[n], hist)
        if not max(cross[n].values()) <= TOL:
            return _stop("check (b): the form-sum cross-check differs for %s (%s)" % (n, cross[n]))
    log("checks: n = 0 identity max %s; form cross-check max %s" % ({k: "%.2g" % v for k, v in n0.items()}, {k: {a: "%.2g" % b for a, b in v.items()} for k, v in cross.items()}))
    secs["checks"] = round(time.time() - t0, 1)

    # (8) fit
    preds, fits_all, wks, fit_facts, fold_secs = {n: [] for n in names}, {}, [], {"h": {}, "g": {}}, {}
    t_fit = time.time()
    if args.dev and deps.runlog:
        registry.runlog_append(deps.env_w, {"mode": "weekly-dev", "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "folds": list(folds), "date": args.date, "threads": _threads()})
    for T in folds:
        wk_T = baselines.weekly_forecasts(wf, T, None, benchw)
        if args.smoke:
            rel = wk_T[["pid", "S", "w", "relevant"]]
        else:
            rel = weekly_models.train_relevant(wf, T)
        wks.append(wk_T)
        for n in names:
            t1 = time.time()
            fr = frames[n]
            if args.smoke:
                tr, pr = ((fr["S"] == T) & (fr["w"] < SMOKE_SPLIT_WEEK)).to_numpy(), ((fr["S"] == T) & (fr["w"] >= SMOKE_SPLIT_WEEK)).to_numpy()
            else:
                tr = pr = None
            p, fits = weekly_models.fold_w(fr, T, store, n, specs[n], rel, hist, train=tr, pred=pr, env=deps.env, env_w=deps.env_w)
            preds[n].append(p)
            fits_all[(n.lower(), T)] = fits
            dt = time.time() - t1
            fold_secs["%s %d" % (n, T)] = round(dt, 1)
            fit_facts[n.lower()][T] = {P: {**pf.facts, "seconds": round(dt, 1)} for P, pf in fits.pos.items()}
            log("fold %d %s done in %.0fs" % (T, n, dt))
            if dt / 60 > FOLD_LIMIT_MIN:
                return _stop("fold %d %s took over %d minutes" % (T, n, FOLD_LIMIT_MIN))
        if (time.time() - t_fit) / 3600 > DEV_LIMIT_H:
            return _stop("the run exceeded %d hours" % DEV_LIMIT_H)
    secs["fit"] = round(time.time() - t_fit, 1)
    secs.update(fold_secs)

    # (9) labels
    wk = pd.concat(wks, ignore_index=True)
    for n in names:
        d = pd.concat(preds[n], ignore_index=True)[["pid", "S", "w", "cond", "p"]].rename(columns={"cond": n.lower(), "p": n.lower() + "_p"})
        wk = wk.merge(d, on=["pid", "S", "w"], how="left")
    if args.smoke:
        wk = wk[wk["w"] >= SMOKE_SPLIT_WEEK].reset_index(drop=True)
    res = evaluate_w.labels(wk, folds, args.resamples)
    if args.smoke:
        print("\n".join(report_s2b.label_lines(res)))
        _smoke_check(wk)
        return 0

    # (10) outputs
    os.makedirs(deps.cache_dir, exist_ok=True)
    preds_path = os.path.join(deps.cache_dir, "weekly-preds.jsonl")
    with open(preds_path, "w") as f:
        for n in names:
            for r in pd.concat(preds[n], ignore_index=True).to_dict("records"):
                f.write(json.dumps({k: (None if isinstance(v, float) and not np.isfinite(v) else (int(v) if isinstance(v, np.integer) else v)) for k, v in r.items()}, sort_keys=True) + "\n")
    fits_path = os.path.join(deps.cache_dir, "weekly-fits.pkl")
    with open(fits_path, "wb") as f:
        pickle.dump(fits_all, f, protocol=4)
    if os.path.getsize(fits_path) > FITS_LIMIT:
        return _stop("weekly-fits.pkl exceeds 2 GB")
    alpha = None
    if deps.s2b1a_artifact and os.path.exists(deps.s2b1a_artifact):
        with open(deps.s2b1a_artifact) as f:
            alpha = json.load(f).get("alphaShareAt1000", {}).get("H")
    import numpy, pandas, scipy, sklearn
    sha = {"weekly-inputs.pkl": registry.sha_file(deps.inputs_path), "season-prior.jsonl": registry.sha_file(deps.prior_path), "weekly-preds.jsonl": registry.sha_file(preds_path),
           "weekly-fits.pkl": registry.sha_file(fits_path), **{"candidates/%s.json" % n: registry.sha_file(registry.cand_path(deps.env_w, n)) for n in names},
           "benchw.jsonl": registry.sha_file(deps.benchw_path), "benchw.meta.json": registry.sha_file(deps.benchw_meta_path),
           "task file": _task_sha(deps.env_w)}
    if deps.s2b1a_artifact and os.path.exists(deps.s2b1a_artifact):
        sha["2b-1a artifact"] = registry.sha_file(deps.s2b1a_artifact)
    versions = {"python": sys.version.split()[0], "numpy": numpy.__version__, "pandas": pandas.__version__, "scikit-learn": sklearn.__version__, "scipy": scipy.__version__}
    reg = _registration(deps.env_w, names)
    secs["total"] = round(time.time() - t_all, 1)
    aggregate = {"slice": "LP-2b-1b", "date": args.date, "preregHash": h, "folds": list(folds), "confirmation": evaluate_w.UNCONFIRMED_W, "results": res, "fit": fit_facts,
                 "alphaShareInheritedFromSeasonLayer": alpha, "checks": {"n0IdentityMaxRelative": n0, "formCrossCheckMaxRelative": cross}, "seconds": secs, "threads": _threads(),
                 "versions": versions, "limits": report_s2b.LIMITS, "sha256": sha, "registration": reg, "bootstrap": {"resamples": args.resamples, "seed": 12345, "clusterBy": "player"},
                 "panelMeta": {k: pmeta.get(k) for k in ("generatedAt", "dataRev", "from", "to", "scoringFixture")}}
    body = json.dumps(_clean(aggregate), indent=1)
    if len(body) > ARTIFACT_LIMIT:
        return _stop("the artifact exceeds 5 MB")
    hashes = [("preregHash", h)] + [("%s %s %s" % (n, layer, k), v) for n in names for layer in ("season", "weekly") for k, v in reg[n][layer].items() if k != "registeredAt"] + \
             [("sha256 " + k, v) for k, v in sha.items()]
    run = [("run times (s)", json.dumps(secs)), ("threads", json.dumps(_threads())), ("versions", json.dumps(versions)), ("check maxima", json.dumps(_clean({"n0": n0, "formCross": cross})))]
    verdict = report_s2b.build_verdict(res, {"date": args.date, "mode": "dev", "prereg": h, "section8": section8, "fit": fit_facts, "hashes": hashes, "run": run})
    os.makedirs(deps.out_dir, exist_ok=True)
    os.makedirs(deps.verdict_dir, exist_ok=True)
    p1 = os.path.join(deps.out_dir, "%s-learned-s2b1b-dev-panel.json" % args.date)
    p2 = os.path.join(deps.verdict_dir, "%s-learned-s2b1b-dev-verdict.md" % args.date)
    with open(p1, "w") as f:
        f.write(body + "\n")
    with open(p2, "w", encoding="utf-8") as f:
        f.write(verdict)
    log("artifact %.0f KB, verdict %.0f KB" % (len(body) / 1024, len(verdict) / 1024))
    log("wrote %s and %s" % (os.path.relpath(p1, REPO), os.path.relpath(p2, REPO)))
    return 0


def _smoke_check(wk):
    """Report (never tune): per candidate, the positions where its conditional MAE exceeds STD's on the smoke rows."""
    base = wk[wk["relevant"].astype(bool) & wk["played"].astype(bool)]
    for c in ("h", "g"):
        worse = []
        for pos in baselines.POSITIONS:
            d = base[base["position"] == pos]
            if len(d) and np.abs(d[c] - d["pts"]).mean() > np.abs(d["std"] - d["pts"]).mean():
                worse.append(pos)
        print("[run] smoke: %s's conditional MAE is above STD's at %d of 4 positions %s" % (c.upper(), len(worse), worse))


if __name__ == "__main__":
    sys.exit(main())
