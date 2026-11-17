#!/usr/bin/env python3
"""LP-2b-1a weekly-inputs runner (research only — never run by npm test, smoke or CI).

    python3 research/learned-projection/run_weekly_inputs.py --check [--write] [--date YYYY-MM-DD]

--check  trims the held season (2025) out of every table before anything is built, re-derives both candidates' season-layer prior for 2018-2024
         (hard-checked against the season layer's own prediction file), builds the weekly rows, targets, as-of features and in-season era blend,
         writes `.cache/models/season-prior.jsonl` + `weekly-inputs.pkl` (git-ignored) and prints the facts. With --write also
         backtests/<date>-learned-s2b1a-inputs.json (facts only). Fits no weekly model, registers nothing, compares no forecast with an outcome.
The FIRST step recomputes the LP-1a §8 hash and returns 2 when it differs from `report.PREREG_HASH` — before the cache is read.
"""
import argparse
import gc
import json
import os
import sys
import time
from dataclasses import dataclass, field
from datetime import date
from typing import Callable, Optional

# Every G (gradient-boosted trees) fit runs on ONE thread: sklearn's HistGradientBoosting is not bit-reproducible across OpenMP thread counts
# (nor, at two threads, between identical runs). Set before sklearn is imported (Anton's ruling 2026-11-17); `main` records the count.
_SKLEARN_PRELOADED = "sklearn" in sys.modules
_NUMPY_PRELOADED = "numpy" in sys.modules
THREAD_VARS = ("OMP_NUM_THREADS", "VECLIB_MAXIMUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS")
for _v in THREAD_VARS:
    os.environ[_v] = "1"                  # every thread pool of numpy / sklearn, set before either is imported (Anton, 2026-11-17, second ruling)


def _ensure_hash_seed(execv=os.execv):
    """A G fit also varies ACROSS processes with PYTHONHASHSEED (string-set iteration order reaches the fit's row order: RB 2022 `c` 0.98933 at seeds
    0 and 1, 1.00021 at a random seed, all at one thread). A fresh interpreter cannot change its own seed, so the CLI re-executes itself once with seed 0."""
    if os.environ.get("PYTHONHASHSEED") != "0":
        os.environ["PYTHONHASHSEED"] = "0"
        execv(sys.executable, [sys.executable] + sys.argv)


if __name__ == "__main__":
    _ensure_hash_seed()

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import run_season_models  # noqa: E402
from lp import asof, baselines, era_w, extra, io, registry, report, score, season_models, season_prior, spec_w, weekly_data  # noqa: E402

SEASON_PREDS_SHA = "b2fafc889c05b27d2b89c7eea2b710739db5c2ee36f12d924fab1d20768a46a2"
SECTION_SHA = {"H": "572792a2214653ac6d09be5f375113160d5a157461b141c63255951cc087301c", "G": "12bd9025530022eab79bc27cafc93e94cfd7d497ee715b87f872196b01090500"}
DERIVE_LIMIT_H = 2
CHECK_LIMIT_H = 3
ARTIFACT_LIMIT = 1024 * 1024
MU_NS = (4, 8, 16)
MODELS_DIR = os.path.join(registry.HERE, ".cache", "models")
DEV_PANEL = os.path.join(REPO, "backtests", "2026-11-16-learned-s2a-dev-panel.json")
STATED_LIMITS = [
    "LP-2a's G development predictions (season-preds.jsonl) came from an unrecorded thread count and differ from one-thread refits by up to about 2% on RB "
    "(2022 c; 2024 kv_bonus_fd_rb); the G prior here is the one-thread refit, checked against the file for the same chosen entry and at most 5% relative difference. "
    "G fits also vary across processes with PYTHONHASHSEED, so the runner re-executes itself with seed 0. "
    "G is reproducible only approximately, even with every thread pool pinned and `PYTHONHASHSEED=0`. In three pinned real runs on 2026-11-17, G's re-derived prior matched LP-2a's `season-preds.jsonl` exactly in two and differed in one by up to 4.84% relative (2024 RB; 2022 RB 1.10%). This artifact's own gaps are in `vsSeasonPreds` and `composeGap`. H is exact."]


def _default_load_spec(name):
    return registry.load(registry.Env(), name)["layers"]["season"]["spec"]


@dataclass
class Deps:
    """Every outside dependency of `main`, each replaceable by a test. The season lock is NOT a member: every check goes through the module
    attribute `registry.require` (also inside `season_models.fold`)."""
    task_file: str = run_season_models.LP1A_TASK_FILE
    anchor: str = run_season_models.ANCHOR_GENERATED_AT
    load_cache: Callable = io.load_cache
    load_teamctx: Callable = io.load_teamctx
    load_extras: Callable = lambda: extra.build_extras(last=weekly_data.LAST_SEASON)
    load_spec: Callable = _default_load_spec
    env: object = field(default_factory=registry.Env)
    season_preds_path: str = os.path.join(MODELS_DIR, "season-preds.jsonl")
    season_preds_sha: Optional[str] = SEASON_PREDS_SHA
    entries_path: Optional[str] = DEV_PANEL
    section_sha: Optional[dict] = field(default_factory=lambda: dict(SECTION_SHA))
    cache_dir: str = MODELS_DIR
    out_dir: str = os.path.join(REPO, "backtests")
    check_parity: bool = True
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


def _alpha_share(frame, spec_w_):
    """Per position: share of that position's season-target cells (plus gamesShare) whose H partial-pooling alpha is the top of its grid (1000);
    None where the candidate has no alpha (G) or the position has no rows."""
    out = {}
    for pos in spec_w.POSITIONS:
        sub = frame[frame["position"] == pos]
        if not len(sub):
            continue
        cells = [float(sub["alpha_" + t].iloc[0]) for t in spec_w_["targetsByPos"][pos] + ["gamesShare"] if "alpha_" + t in sub.columns]
        cells = [a for a in cells if np.isfinite(a)]
        out[pos] = float(np.mean([a == 1000.0 for a in cells])) if cells else None
    return out


def _write_prior(path, frames):
    with open(path, "w") as f:
        for name, df in frames.items():
            for r in df.to_dict("records"):
                f.write(json.dumps({k: (None if isinstance(v, float) and not np.isfinite(v) else (int(v) if isinstance(v, np.integer) else v)) for k, v in r.items()}, sort_keys=True) + "\n")


def _nan_facts(frame, spec_w_):
    feats = spec_w.feature_names(spec_w_) + spec_w_["priorCols"]
    pooled = {}
    for pos in spec_w.POSITIONS:
        sub = frame[frame["position"] == pos]
        if len(sub):
            for c in feats:
                pooled.setdefault(c, {})[pos] = round(float(sub[c].isna().mean()), 4)
    per_season = {}
    names = [c for c in feats if c.startswith(("rwPrev_", "retShare", "o", "age", "exp", "isRookie")) and not c.startswith(("ex_", "opp"))]
    for S, sub in frame.groupby("S"):
        per_season[int(S)] = {c: round(float(sub[c].isna().mean()), 4) for c in names}
    return pooled, per_season


def main(argv=None, deps=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", required=True)
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--date", default=date.today().isoformat())
    args = ap.parse_args(argv)
    deps = deps or Deps()
    log = lambda m: print("[run] " + m, flush=True)
    secs = {}
    t_all = time.time()
    # (1) FIRST, before the cache is read: the pre-registered bar is unchanged
    with open(deps.task_file, encoding="utf-8") as f:
        h, _section8 = report.prereg_hash(f.read())
    if h != report.PREREG_HASH:
        return _stop("LP-1a §8 hash %s differs from the pinned %s — the pre-registered bar was edited" % (h, report.PREREG_HASH))
    # (2) load, trim, assert, drop every untrimmed reference
    t0 = time.time()
    panel = deps.load_cache()
    meta = panel.meta
    tables = asof.Tables.from_panel_full(panel, deps.load_teamctx(), deps.load_extras())
    T = weekly_data.trim(tables)
    del panel, tables
    gc.collect()
    try:
        weekly_data.assert_trimmed(T)
    except AssertionError as e:
        return _stop("trim: %s" % e)
    secs["load+trim"] = round(time.time() - t0, 1)
    log("trimmed to season <= %d: weeks %d, teams %d, seasons %d, teamctx %d, extras %d" % (weekly_data.LAST_SEASON, len(T.weeks), len(T.teams), len(T.seasons), len(T.teamctx), len(T.extras)))
    # (3) anchor and scoring parity, on the trimmed tables only
    if meta.get("generatedAt") != deps.anchor:
        return _stop("panel generatedAt %s differs from the anchor %s" % (meta.get("generatedAt"), deps.anchor))
    parity = None
    if deps.check_parity:
        order = [meta["keys"].index(k) for k in meta["weights"]]
        Xw = T.X[T.weeks["rid"].to_numpy()][:, order]
        n, bad = score.parity(Xw, T.weeks["pts"].to_numpy(), [meta["weights"][k] for k in meta["weights"]])
        log("scoring parity (trimmed): %d / %d played rows exact" % (n - len(bad), n))
        if len(bad):
            return _stop("scoring parity failed on %d rows" % len(bad))
        parity = {"rows": int(n), "mismatches": int(len(bad))}
    # (4) specs and the season lock, for every season before any fit
    seas = list(weekly_data.seasons())
    names = registry.NAMES
    specs = {nme: deps.load_spec(nme) for nme in names}
    for nme in names:
        if specs[nme]["features"] != specs["H"]["features"] or specs[nme]["targets"] != specs["H"]["targets"]:
            return _stop("H and G specs disagree on features/targets")
    try:
        for nme in names:
            for Tn in [x for x in seas if x >= registry.EVAL_START]:
                registry.require(nme, Tn, "season", deps.env)
    except (registry.NotRegistered, registry.ConfirmationHeld) as e:
        return _stop(str(e))
    section = {}
    for nme in names:
        sec = registry.load(deps.env, nme)["layers"]["season"]
        section[nme] = registry.sha_bytes(json.dumps(sec, indent=1, sort_keys=True).encode("utf-8"))
        if deps.section_sha is not None and section[nme] != deps.section_sha[nme]:
            return _stop("candidate %s: the canonical season section %s differs from the anchor %s" % (nme, section[nme], deps.section_sha[nme]))
    # (5) the season prior, both candidates
    store = season_models.Store(T, meta["keys"], meta["weights"], specs["H"])
    t0 = time.time()
    derived, compose_gaps = {}, {}
    try:
        for nme in names:
            parts = []
            for Tn in seas:
                t1 = time.time()
                parts.append(season_prior.derive(store, nme, specs[nme], Tn, env=deps.env, gaps=compose_gaps))
                log("prior %s T=%d done in %.0fs" % (nme, Tn, time.time() - t1))
                if (time.time() - t0) / 3600 > DERIVE_LIMIT_H:
                    return _stop("the prior derivation exceeded %d hours" % DERIVE_LIMIT_H)
            derived[nme] = pd.concat(parts, ignore_index=True)
        deltas = None
        if deps.season_preds_sha is not None:
            entries = season_prior.dev_entries(deps.entries_path) if deps.entries_path else None
            deltas = season_prior.check_against_file(pd.concat(list(derived.values()), ignore_index=True), deps.season_preds_path, deps.season_preds_sha, entries=entries)
            log("season prior vs season-preds.jsonl: H max relative %.3g (exact), G max relative %.3g (limit %g)" % (
                max(v["maxRel"] for k, v in deltas.items() if k[0] == "h"), max(v["maxRel"] for k, v in deltas.items() if k[0] == "g"), season_prior.G_REL_LIMIT))
    except season_prior.PriorCheckError as e:
        return _stop(str(e))
    secs["prior"] = round(time.time() - t0, 1)
    log("same-run compose check: H max relative %.3g, G max relative %.3g" % tuple(max([v["maxRel"] for k, v in compose_gaps.items() if k[0] == c] or [0.0]) for c in ("h", "g")))
    # (6) the weekly inputs
    spec_w_ = spec_w.inputs_spec()
    t0 = time.time()
    outs = {nme: [] for nme in names}
    fb_facts, mu_range = {}, {}
    for S in seas:
        fb = season_prior.fallback(T, store, S)
        fb_facts[S] = fb
        sc = asof.view(T, S, 0).schedule
        sc = sc[sc["inUniverse"].astype(bool)]
        bio = weekly_data.bio_block(T, store, S, sorted(set(sc["pid"])))
        for w in sorted(int(x) for x in sc["w"].unique()):
            n = w - 1
            mu = era_w.mu_std(T, store, S, n)
            fr = weekly_data.inputs_at(T, store, S, n, spec_w_, bio)
            tg = weekly_data.targets_at(T, fr[["pid", "S", "w", "position"]], store)
            for nme in names:
                fp = weekly_data.attach_prior(fr, derived[nme], fb, mu, store, spec_w_)
                outs[nme].append(pd.concat([fp, tg.drop(columns=["pid", "S", "w"])], axis=1))
            if n in MU_NS:
                for P in spec_w.POSITIONS:
                    for q in spec_w_["targetsByPos"][P]:
                        mu_range.setdefault(n, {}).setdefault("%s:%s" % (P, q), []).append(era_w.ratio(mu, store, S, P, q))
        log("weekly inputs S=%d done" % S)
    frames = {nme: pd.concat(parts, ignore_index=True) for nme, parts in outs.items()}
    secs["inputs"] = round(time.time() - t0, 1)
    # §10 row set: the same (pid, S, w) rows as the LP-1a weekly frame, per season
    wf = baselines.build_weekly_frame(T, seasons=seas)
    for S in seas:
        a = set(zip(frames["H"].loc[frames["H"]["S"] == S, "pid"], frames["H"].loc[frames["H"]["S"] == S, "w"]))
        b = set(zip(wf.loc[wf["S"] == S, "pid"], wf.loc[wf["S"] == S, "w"]))
        if a != b:
            return _stop("season %d: the weekly row set differs from baselines.build_weekly_frame (%d only here, %d only there)" % (S, len(a - b), len(b - a)))
    # (7) the held season is still out of every table and frame
    try:
        weekly_data.assert_trimmed(T, frames=[derived[n] for n in names] + [frames[n] for n in names])
    except AssertionError as e:
        return _stop("final trim check: %s" % e)
    os.makedirs(deps.cache_dir, exist_ok=True)
    prior_path, pkl_path = os.path.join(deps.cache_dir, "season-prior.jsonl"), os.path.join(deps.cache_dir, "weekly-inputs.pkl")
    _write_prior(prior_path, {n: derived[n] for n in names})
    pd.to_pickle({n: frames[n] for n in names}, pkl_path)
    pooled, per_season = _nan_facts(frames["H"], spec_w_)
    pooled_g, _ = _nan_facts(frames["G"], spec_w_)
    prior_facts = {}
    for nme in names:
        d = derived[nme]
        for Tn in seas:
            for pos in spec_w.POSITIONS:
                sub = d[(d["T"] == Tn) & (d["position"] == pos)]
                if len(sub):
                    ent = {"priorRows": int(len(sub)), "era": sub["era"].iloc[0], "lam": float(sub["lam"].iloc[0]), "g": sub["g"].iloc[0], "c": float(sub["c"].iloc[0]),
                           "composeGap": compose_gaps.get((nme.lower(), Tn, pos)), "vsSeasonPreds": (deltas or {}).get((nme.lower(), Tn, pos))}
                    prior_facts.setdefault(nme, {}).setdefault(str(Tn), {})[pos] = ent
    alpha = {nme: {str(Tn): _alpha_share(derived[nme][derived[nme]["T"] == Tn], spec_w_) for Tn in seas} for nme in names}
    no_prior = {}
    for nme in names:
        for S in seas:
            for pos in spec_w.POSITIONS:
                sub = frames[nme][(frames[nme]["S"] == S) & (frames[nme]["position"] == pos)]
                if len(sub):
                    n_played = int(sub["played"].astype(bool).sum())
                    k = int((sub["noPrior"] == 1).sum())
                    no_prior.setdefault(nme, {}).setdefault(str(S), {})[pos] = {"rows": k, "shareOfPlayedRows": (k / n_played if n_played else None)}
    ref = np.zeros(len(T.X), dtype=bool)
    ref[T.weeks["rid"].to_numpy().astype(int)] = True
    x_outside = int(np.isfinite(T.X[~ref]).sum())
    counts = {str(S): {pos: int((frames["H"][(frames["H"]["S"] == S)]["position"] == pos).sum()) for pos in spec_w.POSITIONS} for S in seas}
    secs["total"] = round(time.time() - t_all, 1)
    if secs["total"] / 3600 > CHECK_LIMIT_H:
        return _stop("--check exceeded %d hours" % CHECK_LIMIT_H)
    import numpy, pandas, scipy, sklearn
    facts = {
        "slice": "LP-2b-1a", "date": args.date, "preregHash": h, "lastSeason": weekly_data.LAST_SEASON, "seasons": seas,
        "panelMeta": {k: meta.get(k) for k in ("generatedAt", "dataRev", "from", "to", "scoringFixture")},
        "trimmed": {n: (int(getattr(T, n)["S"].max()) if getattr(T, n) is not None and len(getattr(T, n)) else None) for n in weekly_data.TABLE_NAMES},
        "xFiniteOutsideWeeks": x_outside, "parity": parity,
        "priors": prior_facts, "alphaShareAt1000": alpha, "noPriorRows": no_prior,
        "fallback": {str(S): {"values": fb_facts[S].val.round(6).where(fb_facts[S].val.notna(), None).to_dict("index"), "rows": fb_facts[S].cnt.to_dict("index")} for S in seas},
        "weeklyRows": counts, "nanSharePooledH": pooled, "nanSharePooledG": {c: v for c, v in pooled_g.items() if c in spec_w_["priorCols"]}, "nanSharePerSeasonH": per_season,
        "muRatioRange": {str(n): {k: [round(min(v), 4), round(max(v), 4)] for k, v in d.items()} for n, d in mu_range.items()},
        "seconds": secs,
        "threads": {**{v: os.environ.get(v) for v in THREAD_VARS}, "PYTHONHASHSEED": os.environ.get("PYTHONHASHSEED"), "setBeforeSklearnImport": not _SKLEARN_PRELOADED, "numpyPreloaded": _NUMPY_PRELOADED, "cpuCount": os.cpu_count()},
        "statedLimits": STATED_LIMITS,
        "sha256": {"dev-panel entries": (registry.sha_file(deps.entries_path) if deps.entries_path and os.path.exists(deps.entries_path) else None), "season-preds.jsonl": registry.sha_file(deps.season_preds_path) if os.path.exists(deps.season_preds_path) else None, "season-prior.jsonl": registry.sha_file(prior_path),
                   "weekly-inputs.pkl": registry.sha_file(pkl_path), **{"candidates/%s.json" % n: registry.sha_file(registry.cand_path(deps.env, n)) for n in names},
                   **{"canonicalSeasonSection %s" % n: section[n] for n in names}},
        "versions": {"python": sys.version.split()[0], "numpy": numpy.__version__, "pandas": pandas.__version__, "scikit-learn": sklearn.__version__, "scipy": scipy.__version__},
    }
    body = json.dumps(_clean(facts), indent=1)
    log("facts %.0f KB; frames H %s, G %s; prior %.0fs, inputs %.0fs, total %.0fs" % (len(body) / 1024, frames["H"].shape, frames["G"].shape, secs["prior"], secs["inputs"], secs["total"]))
    if len(body) > ARTIFACT_LIMIT:
        return _stop("the facts artifact exceeds 1 MB")
    if deps.runlog:
        registry.runlog_append(deps.env, {"mode": "weekly-inputs-check", "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "date": args.date, "threads": facts["threads"],
                                         "lastSeason": weekly_data.LAST_SEASON})
    if args.write:
        os.makedirs(deps.out_dir, exist_ok=True)
        p = os.path.join(deps.out_dir, "%s-learned-s2b1a-inputs.json" % args.date)
        with open(p, "w") as f:
            f.write(body + "\n")
        log("wrote %s" % os.path.relpath(p, REPO))
    else:
        print(body[:3000])
    return 0


if __name__ == "__main__":
    sys.exit(main())
