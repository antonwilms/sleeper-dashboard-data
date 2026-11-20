#!/usr/bin/env python3
"""LP-2b-2a confirmation-path runner (research only — never run by npm test, smoke or CI).

    python3 research/learned-projection/run_confirm.py --rehearse [--write] [--date YYYY-MM-DD] [--resamples N] [--again "<reason>"]

--rehearse  runs the held-season path (`lp/confirm.run_held`) with the LAST development season (2024) as the held season and compares every product with the locked
            development outputs: H exact, G within 5% with the same chosen settings (R1-R3). R4 for G is report-only; R4c re-fits G on the cached season inputs and matches exactly.
            G's weekly forecasts inherit its season-forecast variation (up to 16.6% at RB in the rehearsal); a same-input re-fit is exact (Anton, 2026-11-20). It writes no cache, no marker, no verdict. With --write it writes
            `backtests/<date>-learned-s2b2a-rehearsal.json`. A second --rehearse is refused unless --again gives a reason (Anton's ruling).
There is NO option that names a season: the held season is `weekly_data.LAST_SEASON` here (LP-2b-2b adds `--confirm`, which reuses `run_held`).
The FIRST step recomputes the LP-1a §8 hash; the SECOND checks the anchors (panel, benchw meta, the five caches and the two development artifacts by SHA-256) — both
before any registry access, any cache read or any fit."""
import os
import sys

# Every G (gradient-boosted trees) fit runs on ONE thread (COPY of run_weekly_models.py:16-35 — T-R-8; Anton's rulings 2026-11-17): set before numpy/sklearn is imported.
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
import run_weekly_models as rwm  # noqa: E402
from lp import asof, confirm, evaluate_w, extra, io, registry, registry_w, report, report_s2b, season_models, season_prior, spec_w, spec_wm, splits, weekly_data  # noqa: E402

MODELS_DIR = os.path.join(registry.HERE, ".cache", "models")
PANEL_DIR = os.path.join(registry.HERE, ".cache", "panel")
SHAS = {"weekly-inputs.pkl": "2431b3978d5a078fb2256e3553ca513f17c62160ec56ac72fb657486f43a1fb2", "season-prior.jsonl": "55c55e200ce18d549d522ee007e284bbe180ff98209378c4c355a47a9643c56a",
        "weekly-preds.jsonl": "44d7132a8418b892c150eb70b7b93394de6c5c2fb01f5b6dbcee9f99196aab29", "weekly-fits.pkl": "4c6738bbb28502f3c4436f8715c89d95378662739403bda89a12bafe06d9f9b3",
        "season-preds.jsonl": "b2fafc889c05b27d2b89c7eea2b710739db5c2ee36f12d924fab1d20768a46a2"}
DEV_S2A = os.path.join(REPO, "backtests", "2026-11-16-learned-s2a-dev-panel.json")
DEV_S2A_SHA = "b41169fbeefa2fab2d8a8d6f500590fb65f7b2465353ce67193941322e9995d7"
DEV_S2B1B = os.path.join(REPO, "backtests", "2026-11-18-learned-s2b1b-dev-panel.json")
DEV_S2B1B_SHA = "3a0dcb5148f8720d1ec77c714ed02d3f2f729830645e190c550c1f3f078c6386"
BUDGET_H = 2
REPORT_ONLY = {("R4", "g"), ("R6", "g"), ("R7", "g")}      # the slots `lp/confirm` records without failing (console text only)
ARTIFACT_LIMIT = 1024 * 1024
LABEL = "rehearsal — 2024 re-run through the confirmation path; not a result"
STATED_LIMITS = list(report_s2b.LIMITS) + [
    "G is reproducible only approximately, even with every thread pool pinned and PYTHONHASHSEED=0; H is exact (Anton, 2026-11-17).",
    "Season lambda for RB under H was still falling at the grid edge in training error (6/6 folds, mean 1.19%): a training-error drop, not a test result (Anton, 2026-11-19).",
    "Season alpha / k-multiple / delta edges have no recorded error; wider season grids belong to the off-season model work, tested on the 2026 season (Anton, 2026-11-19).",
    "G's weekly forecasts inherit its season-forecast variation (up to 16.6% at RB in the rehearsal); a same-input re-fit is exact (Anton, 2026-11-20).",
    "R6 and R7 are a wiring check of the one-fold scoring; this artifact prints no label and no gate and this slice writes no verdict."]


def _default_load_meta():
    with open(os.path.join(PANEL_DIR, "meta.json")) as f:
        return json.load(f)


def _default_load_benchw_meta():
    with open(os.path.join(PANEL_DIR, "benchw.meta.json")) as f:
        return json.load(f)


@dataclass
class Deps:
    """Every outside dependency of `main`, each replaceable by a test. The locks are NOT members: every check goes through the module attribute
    `registry.require` (also inside `lp/confirm.run_held` and `weekly_models.fold_w`)."""
    task_file: str = run_season_models.LP1A_TASK_FILE
    anchor: str = run_season_models.ANCHOR_GENERATED_AT
    load_meta: Callable = _default_load_meta
    load_benchw_meta: Callable = _default_load_benchw_meta
    load_cache: Callable = io.load_cache
    load_teamctx: Callable = io.load_teamctx
    load_extras: Callable = lambda last: extra.build_extras(last=last)
    load_benchw: Callable = io.load_benchw
    inputs_path: str = os.path.join(MODELS_DIR, "weekly-inputs.pkl")
    inputs_sha: str = SHAS["weekly-inputs.pkl"]
    prior_path: str = os.path.join(MODELS_DIR, "season-prior.jsonl")
    prior_sha: str = SHAS["season-prior.jsonl"]
    preds_path: str = os.path.join(MODELS_DIR, "weekly-preds.jsonl")
    preds_sha: str = SHAS["weekly-preds.jsonl"]
    fits_path: str = os.path.join(MODELS_DIR, "weekly-fits.pkl")
    fits_sha: str = SHAS["weekly-fits.pkl"]
    season_preds_path: str = os.path.join(MODELS_DIR, "season-preds.jsonl")
    season_preds_sha: str = SHAS["season-preds.jsonl"]
    dev_s2a_path: str = DEV_S2A
    dev_s2a_sha: str = DEV_S2A_SHA
    dev_s2b1b_path: str = DEV_S2B1B
    dev_s2b1b_sha: str = DEV_S2B1B_SHA
    env: object = field(default_factory=registry.Env)
    env_w: object = field(default_factory=registry_w.weekly_env)
    section_sha: Optional[dict] = field(default_factory=lambda: dict(registry_w.SECTION_SHA))
    expected_last: int = splits.CONFIRM_FOLD - 1
    panel_to: int = splits.CONFIRM_FOLD
    out_dir: str = os.path.join(REPO, "backtests")
    runlog: bool = True


def _stop(msg):
    print("[run] STOP: %s" % msg, file=sys.stderr)
    return 2


def _threads():
    """COPY (§11, T-R-8) of `run_weekly_models._threads`, reading THIS module's pre-import flags."""
    return {**{v: os.environ.get(v) for v in THREAD_VARS}, "PYTHONHASHSEED": os.environ.get("PYTHONHASHSEED"), "setBeforeSklearnImport": not _SKLEARN_PRELOADED,
            "numpyPreloaded": _NUMPY_PRELOADED, "cpuCount": os.cpu_count()}


def _sha_or_none(path):
    return registry.sha_file(path) if os.path.exists(path) else None


_CAUGHT = (AssertionError, ValueError, KeyError, registry.NotRegistered, registry.ConfirmationHeld, spec_wm.NoTrainingRows, confirm.RehearsalMismatch, confirm.CheckError,
           season_prior.PriorCheckError)


def main(argv=None, deps=None):
    ap = argparse.ArgumentParser(allow_abbrev=False)
    ap.add_argument("--rehearse", action="store_true", required=True)
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--date", default=date.today().isoformat())
    ap.add_argument("--resamples", type=int, default=2000)
    ap.add_argument("--again", default=None)
    args = ap.parse_args(argv)
    deps = deps or Deps()
    log = lambda m: print("[run] " + m, flush=True)
    names = registry.NAMES
    t_all = time.time()

    # (1) FIRST, before any load: the pre-registered bar is unchanged
    with open(deps.task_file, encoding="utf-8") as f:
        h, _section8 = report.prereg_hash(f.read())
    if h != report.PREREG_HASH:
        return _stop("LP-1a §8 hash %s differs from the pinned %s — the pre-registered bar was edited" % (h, report.PREREG_HASH))

    # (2) anchors, before any registry access or cache read
    meta0 = deps.load_meta()
    if meta0.get("generatedAt") != deps.anchor:
        return _stop("panel generatedAt %s differs from the anchor %s" % (meta0.get("generatedAt"), deps.anchor))
    if meta0.get("to") != deps.panel_to:
        return _stop("panel meta `to` %s differs from %s" % (meta0.get("to"), deps.panel_to))
    bmeta = deps.load_benchw_meta()
    if bmeta.get("panelGeneratedAt") != deps.anchor:
        return _stop("benchw.meta.panelGeneratedAt %s differs from the anchor %s" % (bmeta.get("panelGeneratedAt"), deps.anchor))
    failed = [k for k in ("c2", "c3", "c6") if not (bmeta.get("checks") or {}).get(k, {}).get("pass")]
    if failed:
        return _stop("benchw run-time check(s) %s did not pass" % ", ".join(failed))
    for label, path, want in (("weekly-inputs.pkl", deps.inputs_path, deps.inputs_sha), ("season-prior.jsonl", deps.prior_path, deps.prior_sha),
                              ("weekly-preds.jsonl", deps.preds_path, deps.preds_sha), ("weekly-fits.pkl", deps.fits_path, deps.fits_sha),
                              ("season-preds.jsonl", deps.season_preds_path, deps.season_preds_sha), ("s2a dev panel", deps.dev_s2a_path, deps.dev_s2a_sha),
                              ("s2b1b dev panel", deps.dev_s2b1b_path, deps.dev_s2b1b_sha)):
        got = _sha_or_none(path)
        if got != want:
            return _stop("%s SHA-256 %s differs from its anchor %s — a cache is never regenerated here (a stop for Anton)" % (label, got, want))

    # (3) the locks, before any cache read
    specs_w = {}
    try:
        for n in names:
            if deps.section_sha is not None and registry_w.section_hash(deps.env_w, n) != deps.section_sha[n]:
                return _stop("candidate %s: the canonical season section differs from the anchor" % n)
        for n in names:
            for T in [T for T in splits.DEV_FOLDS if T <= weekly_data.LAST_SEASON]:
                registry.require(n, T, "season", deps.env)
                lay = registry.require(n, T, "weekly", deps.env_w)
            specs_w[n] = lay["spec"]
    except (registry.NotRegistered, registry.ConfirmationHeld) as e:
        return _stop(str(e))
    held = weekly_data.LAST_SEASON
    if held != deps.expected_last:
        return _stop("weekly_data.LAST_SEASON %s differs from %s" % (held, deps.expected_last))
    for n in names:
        if specs_w[n]["lastSeason"] != held or specs_w[n]["trainFrom"] != spec_w.TRAIN_FROM:
            return _stop("%s: the spec's lastSeason / trainFrom differ from the module constants" % n)
    if any(e.get("mode") == "confirm-rehearsal" for e in registry.runlog_entries(deps.env_w)) and not args.again:
        return _stop("a confirm-rehearsal run-log entry exists — a second rehearsal needs --again \"<reason>\" after Anton's ruling")

    try:
        # (4) load and trim at the held season
        t0 = time.time()
        panel = deps.load_cache()
        meta = panel.meta                                       # feeds `parity` and the Store's keys and weights (load_meta only fed the anchor)
        tables = weekly_data.trim(asof.Tables.from_panel_full(panel, deps.load_teamctx(), deps.load_extras(held)), last=held)
        del panel
        gc.collect()
        weekly_data.assert_trimmed(tables, last=held)
        n_par, bad = confirm.parity(tables, meta)
        log("scoring parity (trimmed): %d / %d played rows exact" % (n_par - len(bad), n_par))
        if len(bad):
            return _stop("scoring parity failed on %d rows" % len(bad))
        benchw = weekly_data.trim_frame(deps.load_benchw()[0], last=held)
        # (5) the cache (its SHA-256 matched in step 2)
        cache = pd.read_pickle(deps.inputs_path)
        specs_s = {n: registry.load(deps.env, n)["layers"]["season"]["spec"] for n in names}
        store = season_models.Store(tables, meta["keys"], meta["weights"], specs_s["H"])
        load_secs = round(time.time() - t0, 1)
        # (6) the run-log entry, then the held-season path
        if deps.runlog:
            registry.runlog_append(deps.env_w, {"mode": "confirm-rehearsal", "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "date": args.date, "held": held,
                                                "threads": _threads(), "again": args.again})
        res = confirm.run_held(tables, store, {n: cache[n] for n in names}, specs_s, specs_w, held, benchw, deps.env, deps.env_w, args.resamples, log=log)
        # (7) the same-input G re-fit on the cached frame (R4c), then the rehearsal comparisons R1-R7
        t0 = time.time()
        p_cached, _ = confirm.refit_cached(cache["G"], held, store, specs_w["G"], res.rel, res.hist, deps.env, deps.env_w)
        res.seconds["fit G cached"] = round(time.time() - t0, 1)
        t0 = time.time()
        ck = confirm.Checker()
        season_preds = rwm._read_prior(deps.season_preds_path)
        prior_file = rwm._read_prior(deps.prior_path)
        preds_file = rwm._read_prior(deps.preds_path)
        with open(deps.dev_s2a_path) as f:
            dev_results = json.load(f)["results"]
        with open(deps.dev_s2b1b_path) as f:
            dev_fit = json.load(f)["fit"]
        entries = season_prior.dev_entries(deps.dev_s2a_path)
        confirm.compare_season(ck, res.derived, season_preds, prior_file, entries, held)
        confirm.compare_inputs(ck, res.rows, res.cache_held, spec_w.inputs_spec())
        confirm.compare_preds(ck, res.preds, preds_file, held)
        confirm.compare_cached_refit(ck, p_cached, preds_file, held)
        facts = {n: {P: rwm._clean(pf.facts) for P, pf in res.fits[n].pos.items()} for n in names}
        confirm.compare_fits(ck, facts, dev_fit, held)
        confirm.compare_season_labels(ck, res.season, dev_results, held)
        dev_preds = {n: preds_file[(preds_file["cand"] == n.lower()) & (preds_file["T"] == held)] for n in names}
        weekly_dev = evaluate_w.labels(confirm.merge_preds(res.wk_base, dev_preds), (held,), args.resamples)
        confirm.compare_weekly_labels(ck, res.weekly, weekly_dev, held)
        summary = ck.summary()
        cmp_secs = round(time.time() - t0, 1)
        for r in sorted(summary):
            for cand in sorted(summary[r]):
                worst = max((v["maxRel"] if v["maxRel"] is not None else float("inf")) for v in summary[r][cand].values())
                log("%s %s: max relative %.3g over %d position(s)%s" % (r, cand, worst, len(summary[r][cand]), " (report-only)" if (r, cand) in REPORT_ONLY else ""))
        ck.finish()
    except _CAUGHT as e:
        extra_msg = ""
        if isinstance(e, confirm.RehearsalMismatch) and e.results:
            extra_msg = "\n[run] every maximum: " + json.dumps(e.results, sort_keys=True, default=str)
        print(extra_msg, file=sys.stderr) if extra_msg else None
        return _stop("%s: %s" % (type(e).__name__, e))

    # (8) budget
    secs = {"load+trim": load_secs, **res.seconds, "compare": cmp_secs}
    secs["total"] = round(time.time() - t_all, 1)
    if secs["total"] / 3600 > BUDGET_H:
        return _stop("the rehearsal took over %d hours" % BUDGET_H)

    # (9) output
    import numpy, pandas, scipy, sklearn
    sha = {**{k: _sha_or_none(p) for k, p in (("weekly-inputs.pkl", deps.inputs_path), ("season-prior.jsonl", deps.prior_path), ("weekly-preds.jsonl", deps.preds_path),
                                              ("weekly-fits.pkl", deps.fits_path), ("season-preds.jsonl", deps.season_preds_path), ("s2a dev panel", deps.dev_s2a_path),
                                              ("s2b1b dev panel", deps.dev_s2b1b_path))},
           **{"candidates/%s.json" % n: registry.sha_file(registry.cand_path(deps.env_w, n)) for n in names}}
    if any(sha[k] != want for k, want in (("weekly-inputs.pkl", deps.inputs_sha), ("season-prior.jsonl", deps.prior_sha), ("weekly-preds.jsonl", deps.preds_sha),
                                          ("weekly-fits.pkl", deps.fits_sha), ("season-preds.jsonl", deps.season_preds_sha))):
        return _stop("a cache changed during the run")
    side = {"R5": {cand: {P: {"run": {k: v for k, v in facts[cand.upper()][P].items() if k in ("cW", "phi", "targets")}, "dev": {k: v for k, v in dev_fit[cand][str(held)][P].items() if k in ("cW", "phi", "targets")}}
                          for P in facts[cand.upper()]} for cand in ("h", "g")},
            "R6": {pos: {cand: {b: {"run": res.season[pos][cand]["labels"][b]["d"]["value"], "dev": dev_results[pos][cand]["labels"][b]["dByFold"][str(held)]} for b in ("B2", "B1c")}
                         for cand in ("h", "g")} for pos in spec_w.POSITIONS},
            "R7": {cand: {pos: {b: {"run": {k: res.weekly[cand][pos][b][k] if k == "n" else res.weekly[cand][pos][b][k]["value"] for k in ("n", "candMae", "benchMae", "d")},
                                    "dev": {k: weekly_dev[cand][pos][b][k] if k == "n" else weekly_dev[cand][pos][b][k]["value"] for k in ("n", "candMae", "benchMae", "d")}}
                                for b in confirm.BENCH_W if b in res.weekly[cand][pos]} for pos in spec_w.POSITIONS if pos in res.weekly[cand]} for cand in ("h", "g")}}
    chosen = {n.lower(): {pos: {"era": g["era"].iloc[0], "lam": float(g["lam"].iloc[0]), "g": g["g"].iloc[0]} for pos, g in res.derived[n].groupby("position")} for n in names}
    aggregate = {"slice": "LP-2b-2a", "date": args.date, "preregHash": h, "held": held, "label": LABEL, "checks": summary, "chosenSettings": chosen, "sideBySide": side,
                 "composeGap": {"%s %d %s" % k: v for k, v in res.gaps.items()}, "seconds": secs, "threads": _threads(),
                 "versions": {"python": sys.version.split()[0], "numpy": numpy.__version__, "pandas": pandas.__version__, "scikit-learn": sklearn.__version__, "scipy": scipy.__version__},
                 "sha256": sha, "registration": rwm._registration(deps.env_w, names), "statedLimits": STATED_LIMITS, "bootstrap": {"resamples": args.resamples, "seed": 12345, "clusterBy": "player"}}
    body = json.dumps(rwm._clean(aggregate), indent=1)
    if len(body) > ARTIFACT_LIMIT:
        return _stop("the artifact exceeds 1 MB")
    log("rehearsal passed: R1\u2013R3, R4 H, R4c, R5 within tolerance; R4 G, R6 G, R7 G report-only; total %.0fs; threads %s" % (secs["total"], json.dumps(_threads(), sort_keys=True)))
    if args.write:
        os.makedirs(deps.out_dir, exist_ok=True)
        p = os.path.join(deps.out_dir, "%s-learned-s2b2a-rehearsal.json" % args.date)
        with open(p, "w") as f:
            f.write(body + "\n")
        log("wrote %s (%.0f KB)" % (os.path.relpath(p, REPO) if p.startswith(REPO) else p, len(body) / 1024))
    return 0


if __name__ == "__main__":
    sys.exit(main())
