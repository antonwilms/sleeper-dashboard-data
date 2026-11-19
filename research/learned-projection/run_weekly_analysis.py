#!/usr/bin/env python3
"""LP-2b-1c-i weekly-analysis runner (research only — never run by npm test, smoke or CI; report-only, writes no cache, no run-log entry, no candidate file).

    python3 research/learned-projection/run_weekly_analysis.py [--write] [--date YYYY-MM-DD] [--resamples 2000]

Without --write it prints the §0a rule outcomes and the report and writes nothing. With --write it writes `backtests/<date>-learned-s2b1c1-analysis.json` and
`grading/<date>-learned-s2b1c1-report.md`. Every cache is read only after its SHA-256 matches its anchor; 2025 stays out of every frame; no G model is fitted."""
import argparse
import gc
import json
import os
import pickle
import sys
import time
from dataclasses import dataclass, field
from datetime import date
from typing import Callable

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import run_weekly_models as rwm  # noqa: E402  — the FIRST non-stdlib import: it sets the four thread variables before numpy / sklearn load (imported, not copied)
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import run_season_models  # noqa: E402
from lp import analysis_w, asof, baselines, extra, io, registry, registry_w, report, report_s2b1c, score, season_models, spec_w, splits, weekly_data, weekly_h, weekly_models  # noqa: E402

REPO = rwm.REPO
MODELS_DIR, PANEL_DIR = rwm.MODELS_DIR, rwm.PANEL_DIR
INPUTS_SHA, PRIOR_SHA = rwm.INPUTS_SHA, rwm.PRIOR_SHA
PREDS_SHA = "44d7132a8418b892c150eb70b7b93394de6c5c2fb01f5b6dbcee9f99196aab29"
FITS_SHA = "4c6738bbb28502f3c4436f8715c89d95378662739403bda89a12bafe06d9f9b3"
BENCHW_SHA = "4ec9ba99d7bc4de7220f776d10fd12c0c448134f1be1513c7922c3a037c175b7"
ART_2B1B_SHA = "3a0dcb5148f8720d1ec77c714ed02d3f2f729830645e190c550c1f3f078c6386"
ART_2A_SHA = "b41169fbeefa2fab2d8a8d6f500590fb65f7b2465353ce67193941322e9995d7"
CONSTANTS_SHA = "7bee9946ba78b988e74921186fa779dd46f09e189e335338e8c990a8b8da830b"
ARTIFACT_LIMIT = 5 * 1024 * 1024
TOTAL_LIMIT_MIN = 60
TOL = 1e-9
BENCH_COLS = ("n", "k", "kind", "population")


def _default_art(name):
    return os.path.join(REPO, "backtests", name)


@dataclass
class Deps:
    """Every outside dependency of `main`, each replaceable by a test (defaults mirror `run_weekly_models.Deps`). The locks go through the module attribute `registry.require`."""
    task_file: str = run_season_models.LP1A_TASK_FILE
    anchor: str = run_season_models.ANCHOR_GENERATED_AT
    load_meta: Callable = rwm._default_load_meta
    load_benchw_meta: Callable = rwm._default_load_benchw_meta
    load_cache: Callable = io.load_cache
    load_teamctx: Callable = io.load_teamctx
    load_extras: Callable = lambda: extra.build_extras(last=weekly_data.LAST_SEASON)
    load_benchw: Callable = io.load_benchw
    inputs_path: str = os.path.join(MODELS_DIR, "weekly-inputs.pkl")
    inputs_sha: str = INPUTS_SHA
    prior_path: str = os.path.join(MODELS_DIR, "season-prior.jsonl")
    prior_sha: str = PRIOR_SHA
    preds_path: str = os.path.join(MODELS_DIR, "weekly-preds.jsonl")
    preds_sha: str = PREDS_SHA
    fits_path: str = os.path.join(MODELS_DIR, "weekly-fits.pkl")
    fits_sha: str = FITS_SHA
    benchw_path: str = os.path.join(PANEL_DIR, "benchw.jsonl")
    benchw_sha: str = BENCHW_SHA
    art_2b1b_path: str = _default_art("2026-11-18-learned-s2b1b-dev-panel.json")
    art_2b1b_sha: str = ART_2B1B_SHA
    art_2a_path: str = _default_art("2026-11-16-learned-s2a-dev-panel.json")
    art_2a_sha: str = ART_2A_SHA
    constants_path: str = _default_art("2026-10-07-inseason-constants.json")
    constants_sha: str = CONSTANTS_SHA
    env: object = field(default_factory=registry.Env)
    env_w: object = field(default_factory=registry_w.weekly_env)
    out_dir: str = os.path.join(REPO, "backtests")
    verdict_dir: str = os.path.join(REPO, "grading")


def _ensure_seed(execv=os.execv):
    """`rwm._ensure_hash_seed`: re-execute once with PYTHONHASHSEED=0 (the seed applies at interpreter start; the `rwm` import has loaded numpy etc. already, which is harmless)."""
    return rwm._ensure_hash_seed(execv=execv)


if __name__ == "__main__":
    _ensure_seed(os.execv)


def _threads():
    return rwm._threads()


def _stop(msg):
    return rwm._stop(msg)


def _read_json(path):
    with open(path) as f:
        return json.load(f)


def _read_preds(path):
    with open(path) as f:
        rows = [json.loads(line) for line in f if line.strip()]
    df = pd.DataFrame(rows)
    df["pid"] = df["pid"].astype(str)
    return df


def _rel(a, b):
    a, b = np.asarray(a, float), np.asarray(b, float)
    if (np.isnan(a) != np.isnan(b)).any():
        return float("inf")
    d = np.where(np.isnan(a), 0.0, np.abs(a - b) / (1.0 + np.abs(np.where(np.isnan(b), 0.0, b))))
    return float(d.max()) if len(d) else 0.0


def _key(df):
    return pd.MultiIndex.from_frame(df[["pid", "S", "w"]])


def _aligned(cached, df, col):
    """`cached[col]` (indexed on (pid, S, w)) reindexed to the rows of `df`."""
    return cached.set_index(["pid", "S", "w"])[col].reindex(_key(df)).to_numpy(float)


def _targets_equal(fa, fb):
    """Every target's (kMult, rho, alpha) of two H `Fits` identical."""
    for P in fa.pos:
        for t, ia in fa.pos[P].targets.items():
            ib = fb.pos[P].targets[t]
            if (ia["kMult"], ia["rho"], ia["alpha"]) != (ib["kMult"], ib["rho"], ib["alpha"]):
                return False
    return True


def main(argv=None, deps=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--date", default=date.today().isoformat())
    ap.add_argument("--resamples", type=int, default=2000)
    args = ap.parse_args(argv)
    deps = deps or Deps()
    log = lambda m: print("[run] " + m, flush=True)
    B = args.resamples
    names = registry.NAMES
    secs = {}
    t_all = time.time()

    # (1) FIRST, before any load: the pre-registered bar is unchanged
    with open(deps.task_file, encoding="utf-8") as f:
        h, _section8 = report.prereg_hash(f.read())
    if h != report.PREREG_HASH:
        return _stop("LP-1a §8 hash %s differs from the pinned %s — the pre-registered bar was edited" % (h, report.PREREG_HASH))

    # (2) anchors, before any JSON, pickle or registry read: the panel meta, the benchw meta, then every input by SHA-256
    meta = deps.load_meta()
    if meta.get("generatedAt") != deps.anchor:
        return _stop("panel generatedAt %s differs from the anchor %s" % (meta.get("generatedAt"), deps.anchor))
    bmeta = deps.load_benchw_meta()
    if bmeta.get("panelGeneratedAt") != deps.anchor:
        return _stop("benchw.meta.panelGeneratedAt %s differs from the anchor %s — re-run export-weekly" % (bmeta.get("panelGeneratedAt"), deps.anchor))
    failed = [k for k in ("c2", "c3", "c6") if not (bmeta.get("checks") or {}).get(k, {}).get("pass")]
    if failed:
        return _stop("benchw run-time check(s) %s did not pass" % ", ".join(failed))
    shas = {}
    for label, path, want in (("weekly-inputs.pkl", deps.inputs_path, deps.inputs_sha), ("season-prior.jsonl", deps.prior_path, deps.prior_sha),
                              ("weekly-preds.jsonl", deps.preds_path, deps.preds_sha), ("weekly-fits.pkl", deps.fits_path, deps.fits_sha),
                              ("benchw.jsonl", deps.benchw_path, deps.benchw_sha), ("2b-1b artifact", deps.art_2b1b_path, deps.art_2b1b_sha),
                              ("2a artifact", deps.art_2a_path, deps.art_2a_sha), ("inseason-constants.json", deps.constants_path, deps.constants_sha)):
        got = registry.sha_file(path) if os.path.exists(path) else None
        if got != want:
            return _stop("%s SHA-256 %s differs from its anchor %s — a cache is never regenerated here (a stop for Anton)" % (label, got, want))
        shas[label] = got

    # (3) locks: both layers of both candidates for every fold (no run-log entry is written)
    folds = tuple(T for T in splits.DEV_FOLDS if T <= weekly_data.LAST_SEASON)
    wspec = {}
    try:
        for n in names:
            for T in folds:
                registry.require(n, T, "season", deps.env)
                lay = registry.require(n, T, "weekly", deps.env_w)
            wspec[n.lower()] = lay["spec"]
    except (registry.NotRegistered, registry.ConfirmationHeld) as e:
        return _stop(str(e))
    for n in names:
        if wspec[n.lower()]["lastSeason"] != weekly_data.LAST_SEASON or wspec[n.lower()]["trainFrom"] != spec_w.TRAIN_FROM:
            return _stop("%s: the spec's lastSeason / trainFrom differ from the module constants" % n)
    sspec = {n.lower(): registry.load(deps.env, n)["layers"]["season"]["spec"] for n in names}
    cand_sha = {"candidates/%s.json" % n: registry.sha_file(registry.cand_path(deps.env_w, n)) for n in names}
    art_2b1b, art_2a, constants = _read_json(deps.art_2b1b_path), _read_json(deps.art_2a_path), _read_json(deps.constants_path)["constants"]

    # (4) load, trim, build — exactly as run_weekly_models steps 4-6
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

    t0 = time.time()
    frames = pd.read_pickle(deps.inputs_path)                                # our own cache (never untrusted input): its SHA-256 matched its anchor in step 2
    store = season_models.Store(T_trim, pmeta["keys"], pmeta["weights"], sspec["h"])
    hist = weekly_h.history(T_trim, store, weekly_data.seasons())
    wf = baselines.build_weekly_frame(T_trim, seasons=range(splits.FIRST_TRAIN_SEASON, weekly_data.LAST_SEASON + 1))
    secs["build"] = round(time.time() - t0, 1)
    benchw = weekly_data.trim_frame(deps.load_benchw()[0])
    preds = _read_preds(deps.preds_path)
    try:
        weekly_data.assert_trimmed(T_trim, frames=[benchw, frames["H"], frames["G"], wf, hist, preds])
    except AssertionError as e:
        return _stop("trim check: %s" % e)
    if int(preds["T"].max()) > weekly_data.LAST_SEASON:
        return _stop("trim check: the preds file holds T %d beyond LAST_SEASON %d" % (int(preds["T"].max()), weekly_data.LAST_SEASON))
    missing = [c for c in BENCH_COLS if c not in benchw.columns]
    if missing:
        return _stop("benchw lacks the column(s) %s" % ", ".join(missing))
    with open(deps.fits_path, "rb") as f:
        fits_all = pickle.load(f)                                              # our own cache: its SHA-256 matched in step 2
    want = {(c, T) for c in ("h", "g") for T in folds}
    if set(fits_all) != want:
        return _stop("weekly-fits.pkl keys %s differ from the expected %s" % (sorted(fits_all), sorted(want)))
    fh = {T: fits_all[("h", T)] for T in folds}
    k_before = {T: [(P, t, i["k"]) for P, pf in fh[T].pos.items() for t, i in pf.targets.items()] for T in folds}
    hp, gp = preds[preds["cand"] == "h"], preds[preds["cand"] == "g"]
    rel = {}
    t_checks = time.time()

    # (5) runtime checks (a) and (b), per fold
    chk = {"a": 0.0, "b": 0.0, "bTargetsEqual": True}
    fold_secs = {}
    for T in folds:
        weekly_data.guard(T)
        t1 = time.time()
        frame_T = frames["H"][frames["H"]["S"] == T]
        rel[T] = weekly_models.train_relevant(wf, T)
        p1 = weekly_models.predict_w(analysis_w.scale_k(fh[T], 1.0), frame_T, hist, store)
        chk["a"] = max(chk["a"], _rel(p1["cond"], _aligned(hp[hp["T"] == T], p1, "cond")))
        if [(P, t, i["k"]) for P, pf in fh[T].pos.items() for t, i in pf.targets.items()] != k_before[T]:
            return _stop("check (a): the cached Fits changed")
        pb, fb = analysis_w.refit(frames["H"], T, store, wspec["h"], rel[T], hist, fh[T], env=deps.env, env_w=deps.env_w)
        chk["b"] = max(chk["b"], _rel(pb["cond"], _aligned(hp[hp["T"] == T], pb, "cond")))
        chk["bTargetsEqual"] = bool(chk["bTargetsEqual"] and _targets_equal(fb, fh[T]))
        fold_secs["check %d" % T] = round(time.time() - t1, 1)
    for k in ("a", "b"):
        if not chk[k] <= TOL:
            return _stop("check (%s): the %s differs from the cached h (max relative %.3g > %g)" % (k, "scale_k(1.0) prediction" if k == "a" else "no-change refit", chk[k], TOL))
    if not chk["bTargetsEqual"]:
        return _stop("check (b): a refit target's (kMult, rho, alpha) differs from the cached fit")
    secs["checks ab"] = round(time.time() - t_checks, 1)

    # the comparison frame: the weekly_forecasts test frames of the folds, the cached h / g, the benchw evidence columns
    wk = pd.concat([baselines.weekly_forecasts(wf, T, None, benchw) for T in folds], ignore_index=True)
    for c, src in (("h", hp), ("g", gp)):
        cols = ["pid", "S", "w", "cond"] + (["ppg"] if c == "h" else [])
        wk = wk.merge(src[cols].rename(columns={"cond": c, "ppg": "ppgH"}), on=["pid", "S", "w"], how="left")
    bx = benchw[["pid", "S", "w", "n", "k", "kind", "population"]].rename(columns={"n": "nB", "k": "kB"})
    wk = wk.merge(bx, on=["pid", "S", "w"], how="left")
    for c in ("h", "g"):
        if wk[c].isna().any():
            return _stop("candidate %s has %d null values on the comparison rows" % (c, int(wk[c].isna().sum())))

    # check (c): `paired` reproduces the 2b-1b artifact's results for h and g against STD and B1c
    t1 = time.time()
    folds5 = {c: {bn: analysis_w.paired(wk, c, bcol, analysis_w.all_rows, folds, B) for bn, bcol in (("STD", "std"), ("B1c", "b1cw"))} for c in ("h", "g")}
    c_max = 0.0
    for c in ("h", "g"):
        for bn in ("STD", "B1c"):
            for P, r in folds5[c][bn].items():
                ref = art_2b1b["results"][c][P][bn]
                if r["n"] != ref["n"]:
                    return _stop("check (c): n differs for %s %s %s (%d vs %d)" % (c, P, bn, r["n"], ref["n"]))
                for mine, theirs in ((r["aMae"], ref["candMae"]), (r["bMae"], ref["benchMae"]), (r["d"], ref["d"]), (r["dSpearman"], ref["dSpearman"])):
                    c_max = max(c_max, _rel([mine["value"]], [theirs["value"]]), _rel(mine["ci"], theirs["ci"]))
    chk["c"] = c_max
    if not c_max <= TOL:
        return _stop("check (c): `paired` differs from the 2b-1b artifact's results (max relative %.3g > %g)" % (c_max, TOL))
    secs["check c"] = round(time.time() - t1, 1)
    log("checks: (a) %.2g, (b) %.2g with every target equal, (c) %.2g" % (chk["a"], chk["b"], chk["c"]))

    # (6) the exploratory H arms
    arms = {}
    t1 = time.time()
    for s in analysis_w.SWEEP:                                                  # route (a): predict-only k scaling on a deep copy of the cached fits
        t2 = time.time()
        name = analysis_w.sweep_name(s)
        parts, counts = [], {}
        for T in folds:
            weekly_data.guard(T)
            fr = frames["H"][frames["H"]["S"] == T]
            parts.append(analysis_w.rename_arm(weekly_models.predict_w(analysis_w.scale_k(fh[T], s), fr, hist, store), name))
            counts[T] = analysis_w.cohort_counts(fh[T])
        wk = wk.merge(pd.concat(parts, ignore_index=True), on=["pid", "S", "w"], how="left")
        base = fh[folds[0]].specSha256
        arms[name] = {"exploratory": True, "route": "a", "kScale": s, "specSha256": base, "armSha256": analysis_w.arm_sha(base, {"kScale": s}), "cohortCounts": counts,
                      "what": "route (a): every target's k scaled by %g on a deep copy of the cached H fits, predict only; context terms stay as fitted at s = 1" % s}
        fold_secs["arm " + name] = round(time.time() - t2, 1)
    spec_b = analysis_w.widened_spec(wspec["h"])
    wide_parts, wide_chosen, wide_sha, nc_parts, extra_parts = [], {}, None, [], []
    for T in folds:                                                             # route (b) and the no-context arm: refits through the registered `fold_w` under fixedCalib
        weekly_data.guard(T)
        t2 = time.time()
        pw, fw = analysis_w.refit(frames["H"], T, store, spec_b, rel[T], hist, fh[T], env=deps.env, env_w=deps.env_w)
        wide_parts.append(analysis_w.rename_arm(pw, analysis_w.WIDE))
        wide_chosen[T] = analysis_w.arm_chosen(fw, top=max(wspec["h"]["kMultW"]))
        wide_sha = fw.specSha256
        fold_secs["wide %d" % T] = round(time.time() - t2, 1)
        t2 = time.time()
        pn, fn = analysis_w.refit(frames["H"], T, store, wspec["h"], rel[T], hist, fh[T], extra={"hContext": False}, env=deps.env, env_w=deps.env_w)
        if any(info["cohort"] is not None for pf in fn.pos.values() for info in pf.targets.values()):
            return _stop("the no-context arm holds a cohort at fold %d" % T)
        fr = frames["H"][frames["H"]["S"] == T]
        nc_parts.append(analysis_w.rename_arm(pn, analysis_w.NOCTX))
        extra_parts.append(pn[["pid", "S", "w", "ppg"]].rename(columns={"ppg": "ppgNC"}).merge(analysis_w.origin0_ppg(fn, fr, hist, store, "ppgNC0"), on=["pid", "S", "w"])
                           .merge(analysis_w.origin0_ppg(fh[T], fr, hist, store, "ppgH0"), on=["pid", "S", "w"]))
        fold_secs["noctx %d" % T] = round(time.time() - t2, 1)
    for parts in (wide_parts, nc_parts, extra_parts):
        wk = wk.merge(pd.concat(parts, ignore_index=True), on=["pid", "S", "w"], how="left")
    wk["c_w"] = [fh[T].pos[P].c_w for T, P in zip(wk["T"], wk["position"])]
    base = fh[folds[0]].specSha256
    arms[analysis_w.WIDE] = {"exploratory": True, "route": "b", "specSha256": wide_sha, "armSha256": analysis_w.arm_sha(wide_sha, {"kMultW": spec_b["kMultW"]}), "chosen": {str(T): v for T, v in wide_chosen.items()},
                             "aboveTop": {T: v["aboveTop"] for T, v in wide_chosen.items()},
                             "what": "route (b): H refitted through the registered fold_w with kMultW extended by %s, under the registered calibration (fixedCalib)" % list(analysis_w.KMULT_EXTRA)}
    arms[analysis_w.NOCTX] = {"exploratory": True, "route": "no-context", "specSha256": base, "armSha256": analysis_w.arm_sha(base, {"variant": {"hContext": False, "fixedCalib": "registered"}}),
                              "what": "H with no context term (hContext False), refitted through fold_w under the registered calibration"}
    secs["arms"] = round(time.time() - t1, 1)
    for name in arms:
        if wk[name].isna().any():
            return _stop("arm %s has %d null values on the comparison rows" % (name, int(wk[name].isna().sum())))

    # (7) the analyses
    t1 = time.time()
    ge = analysis_w.grid_edges(fits_all, art_2a, wspec, sspec, folds)
    ws = analysis_w.weekly_surface(fits_all, wspec["h"])
    ss = analysis_w.season_surface(art_2a, sspec, folds)
    rs = analysis_w.season_rs(ss)
    ot = analysis_w.override_targets(fits_all, sspec["h"]["targets"], constants, wspec["h"])
    rows = wk[wk["relevant"].astype(bool) & wk["played"].astype(bool)]
    ol = analysis_w.override_levels(rows, "ppgH", "ppgH0", "ppgNC", "ppgNC0")
    bands = {band: {c: {bn: analysis_w.paired(wk, c, bcol, analysis_w.band_rows(band), folds, B) for bn, bcol in (("STD", "std"), ("B1c", "b1cw"))} for c in ("h", "g")} for band in analysis_w.BANDS}
    h_minus_g = analysis_w.paired(wk, "h", "g", analysis_w.all_rows, folds, B)
    for name, a in arms.items():
        a["vsH"] = analysis_w.paired(wk, name, "h", analysis_w.all_rows, folds, B)
        a["vsB1c"] = analysis_w.paired(wk, name, "b1cw", analysis_w.all_rows, folds, B)
        a["vsSTD"] = analysis_w.paired(wk, name, "std", analysis_w.all_rows, folds, B)
    secs["analyses"] = round(time.time() - t1, 1)
    leak_in = {"all %s vs %s" % (c.upper(), bn): folds5[c][bn] for c in ("h", "g") for bn in ("STD", "B1c")}
    leak_in["all H vs G"] = h_minus_g
    for band in analysis_w.BANDS:
        for c in ("h", "g"):
            for bn in ("STD", "B1c"):
                leak_in["band %s %s vs %s" % (band, c.upper(), bn)] = bands[band][c][bn]
    for name, a in arms.items():
        for k in ("vsH", "vsB1c", "vsSTD"):
            leak_in["arm %s %s" % (name, k)] = a[k]
    leaks = analysis_w.leak_check(leak_in, analysis_w.LEAK_GAIN)
    if leaks:
        return _stop("a pooled gain above %d%% (a suspected leak — re-run 2b-1b's T-B-9 on real data and report): %s" % (100 * analysis_w.LEAK_GAIN, leaks))
    rules = analysis_w.rule_outcomes({a: arms[a]["vsH"] for a in arms if a != analysis_w.NOCTX}, {b: bands[b]["h"]["B1c"] for b in analysis_w.BANDS}, ws["medians"], rs, ge["shares"])
    secs["total"] = round(time.time() - t_all, 1)
    secs.update(fold_secs)
    if secs["total"] / 60 > TOTAL_LIMIT_MIN:
        return _stop("the run took over %d minutes" % TOTAL_LIMIT_MIN)

    # (8) outputs
    import scipy, sklearn
    versions = {"python": sys.version.split()[0], "numpy": np.__version__, "pandas": pd.__version__, "scikit-learn": sklearn.__version__, "scipy": scipy.__version__}
    res = {"slice": "LP-2b-1c-i", "date": args.date, "preregHash": h, "folds": list(folds), "reportOnly": True, "exploratory": True, "rules": rules, "f4": analysis_w.F4_SENTENCE,
           "gridEdges": ge, "weeklySurface": ws, "seasonSurface": ss, "seasonRS": rs, "overrideTargets": ot, "overrideLevels": ol, "bands": bands, "folds5": folds5, "hMinusG": h_minus_g, "arms": arms}
    for band in bands.values():
        band["exploratory"] = True
        band["specSha256"] = {c: fits_all[(c, folds[0])].specSha256 for c in ("h", "g")}
    body = {**res, "checks": {"scaleK1MaxRelative": chk["a"], "noChangeRefitMaxRelative": chk["b"], "noChangeRefitTargetsEqual": chk["bTargetsEqual"], "pairedVs2b1bMaxRelative": chk["c"]},
            "seconds": secs, "threads": _threads(), "versions": versions, "sha256": {**shas, **cand_sha}, "bootstrap": {"resamples": B, "seed": 12345, "clusterBy": "player"},
            "limits": report_s2b1c.LIMITS, "armSpecHashes": {a: {"specSha256": arms[a]["specSha256"], "armSha256": arms[a]["armSha256"]} for a in arms},
            "leakGainLimit": analysis_w.LEAK_GAIN, "maxPooledGain": max([r["pct"] for t in leak_in.values() for r in t.values() if r["pct"] is not None] + [0.0])}
    text = json.dumps(rwm._clean(body), indent=1)
    if len(text) > ARTIFACT_LIMIT:
        return _stop("the artifact exceeds 5 MB")
    hashes = [("preregHash", h)] + [("sha256 " + k, v) for k, v in {**shas, **cand_sha}.items()] + [("arm %s" % a, "spec %s; arm %s" % (arms[a]["specSha256"], arms[a]["armSha256"])) for a in arms]
    run = [("run times (s)", json.dumps(secs)), ("threads", json.dumps(_threads())), ("versions", json.dumps(versions)), ("check maxima", json.dumps(rwm._clean(body["checks"])))]
    md = report_s2b1c.build_report(res, {"date": args.date, "hashes": hashes, "run": run})
    print("\n".join(rules))
    log("checks: %s; max pooled gain %.4f; total %.0fs" % (body["checks"], body["maxPooledGain"], secs["total"]))
    if not args.write:
        print(md)
        return 0
    os.makedirs(deps.out_dir, exist_ok=True)
    os.makedirs(deps.verdict_dir, exist_ok=True)
    p1 = os.path.join(deps.out_dir, "%s-learned-s2b1c1-analysis.json" % args.date)
    p2 = os.path.join(deps.verdict_dir, "%s-learned-s2b1c1-report.md" % args.date)
    with open(p1, "w") as f:
        f.write(text + "\n")
    with open(p2, "w", encoding="utf-8") as f:
        f.write(md)
    log("artifact %.0f KB, report %.0f KB" % (len(text) / 1024, len(md) / 1024))
    log("wrote %s and %s" % (os.path.relpath(p1, REPO), os.path.relpath(p2, REPO)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
