#!/usr/bin/env python3
"""LP-1a scoreboard runner (research only — never run by npm test, smoke or CI).

    python3 research/learned-projection/run_benchmarks.py [--write] [--date YYYY-MM-DD] [--weekly-bench]

Reads the Node exporter's cache (`node bin/learned.mjs export`) and the Sleeper projection cache, runs the §9 hard stops, builds
every baseline through `asof.view`, evaluates all seven folds with clustered-bootstrap CIs and — with --write — writes
backtests/<date>-learned-s1a-panel.json (aggregates only) and grading/<date>-learned-s1a-verdict.md. Nothing else is written.

LP-1b: `--weekly-bench` also reads benchw.jsonl / benchw.meta.json (`node bin/learned.mjs export-weekly`), fills the weekly B1 / B1c columns and
writes backtests/<date>-learned-s1b-panel.json and grading/<date>-learned-s1b-verdict.md instead. The FIRST step of every mode recomputes the
LP-1a §8 hash and stops (exit 2) when it differs from `report.PREREG_HASH`.
"""
import argparse
import json
import os
import sys
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from lp import asof, baselines, bootstrap, io, report, score, sleeper, splits  # noqa: E402

TASK_FILE = os.path.join(REPO, ".claude", "tasks", "learned-projection-1a-harness.md")
TEAM_OFFENSE_NOTE = ("confirmed in `buildFactorContext`/`attachFactorMultipliers` (lib/panel.mjs): teamOffense resolves a player's team through "
                     "`teamKeyResolver('current-team', totalsByYear, toYear = S)`, i.e. the season-totals **S** `team` (the team he played for in S), "
                     "applied to the S−1 team-offence ranks — a mild look-ahead on moves, in the incumbent's favour.")


def main(argv=None, task_file=TASK_FILE):
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--date", default=date.today().isoformat())
    ap.add_argument("--resamples", type=int, default=2000)
    ap.add_argument("--weekly-bench", action="store_true")
    args = ap.parse_args(argv)

    log = lambda m: print("[run] " + m, flush=True)
    # §9 check 4 (LP-1b) — the bar is unchanged: the FIRST step, before the cache is read, in every mode
    with open(task_file, encoding="utf-8") as f:
        task_text = f.read()
    h, section8 = report.prereg_hash(task_text)
    if h != report.PREREG_HASH:
        print("[run] STOP: LP-1a §8 hash %s differs from the pinned %s — the pre-registered bar was edited" % (h, report.PREREG_HASH), file=sys.stderr)
        return 2
    panel = io.load_cache()
    meta = panel.meta
    benchw = benchw_meta = None
    if args.weekly_bench:
        try:
            benchw, benchw_meta = io.load_benchw()
        except FileNotFoundError as e:
            print("[run] STOP: %s" % e, file=sys.stderr)
            return 2
        if benchw_meta.get("panelGeneratedAt") != meta.get("generatedAt"):
            print("[run] STOP: benchw.meta.panelGeneratedAt %s != panel generatedAt %s — re-run export-weekly" % (benchw_meta.get("panelGeneratedAt"), meta.get("generatedAt")), file=sys.stderr)
            return 2
        failed = [k for k in ("c2", "c3", "c6") if not benchw_meta.get("checks", {}).get(k, {}).get("pass")]
        if failed:
            print("[run] STOP: benchw run-time check(s) %s did not pass" % ", ".join(failed), file=sys.stderr)
            return 2
    # §9.1 hard stop — scoring parity on 100% of played rows
    n, bad = score.parity(panel.Xw, panel.weeks["pts"].to_numpy(), panel.weights)
    log("scoring parity: %d / %d played rows exact" % (n - len(bad), n))
    if len(bad):
        print("[run] STOP: scoring parity failed on %d rows" % len(bad), file=sys.stderr)
        return 2
    tables = asof.Tables.from_panel(panel)

    log("season forecasts")
    sf = pd.concat([baselines.season_forecasts(tables, T) for T in splits.TEST_SEASONS], ignore_index=True)
    log("weekly inputs (as-of views)")
    wf = baselines.build_weekly_frame(tables, log=log)
    proj_dir = os.path.join(io.CACHE_ROOT, "sleeper-proj")
    b4 = sleeper.load_projections(proj_dir, panel.weight_keys, panel.weights)
    wk = pd.concat([baselines.weekly_forecasts(wf, T, b4, benchw) for T in splits.TEST_SEASONS], ignore_index=True)
    b4cov = {int(S): float(g["b4"].notna().mean()) for S, g in wk[wk["relevant"]].groupby("S")}
    coverage = c_weekly = None
    if benchw is not None:
        # §9 check 1 — share of the weekly relevant-set rows with b1.covered whose b1w is non-null, per position and test season
        cov_b = panel.bench[["pid", "S", "b1_covered"]]
        rel = wk[wk["relevant"]].merge(cov_b, on=["pid", "S"], how="left")
        rel = rel[rel["b1_covered"].fillna(False).astype(bool)]
        coverage, low = {}, []
        for S in splits.TEST_SEASONS:
            coverage[S] = {}
            for pos in baselines.POSITIONS:
                g = rel[(rel["S"] == S) & (rel["position"] == pos)]
                share = float(g["b1w"].notna().mean()) if len(g) else None
                coverage[S][pos] = {"n": int(len(g)), "covered": int(g["b1w"].notna().sum()), "share": share}
                if share is None or share < 0.6:
                    low.append("%d %s: %s" % (S, pos, share))
        if low:
            print("[run] STOP: §9.1 weekly B1 coverage under 60%% in %s" % "; ".join(low), file=sys.stderr)
            return 2
        c_weekly = {pos: {int(T): (None if not np.isfinite(g["c_weekly"].iloc[0]) else float(g["c_weekly"].iloc[0])) for T, g in wk[wk["position"] == pos].groupby("T")} for pos in baselines.POSITIONS}

    B = args.resamples
    bs_seed = bootstrap.SEED
    log("season evaluation")
    season = report.season_eval(sf, B)
    log("weekly evaluation")
    weekly = report.weekly_eval(wk, B)
    log("cohorts")
    cohorts = report.cohort_eval(wk, panel.weeks, B)
    res = {"season": season, "weekly": weekly, "cohorts": cohorts}

    with open(os.path.join(proj_dir, "index.json")) as f:
        index = json.load(f)
    import fetch_sleeper_projections as fetch
    cov = fetch.coverage(2021, set(meta["keys"]))
    cov2021 = {p: min(c[p] for c in cov.values()) for p in fetch.SKILL}
    ctx = {"date": args.date, "meta": meta, "index": index, "prereg": h, "section8": section8, "task_text": task_text,
           "facts": report._fact_table(task_text), "parity": (n, len(bad)), "b4cov": b4cov, "cov2021": cov2021,
           "team_offense_note": TEAM_OFFENSE_NOTE, "resamples": B, "seed": bs_seed}
    if benchw is not None:
        ctx.update({"benchw": {"meta": benchw_meta, "coverage": coverage}, "c_weekly": c_weekly, "erratum": report.erratum_counts(panel.weeks)})
    verdict = report.build_verdict(res, ctx)
    aggregate = {
        "slice": "LP-1b" if benchw is not None else "LP-1a", "date": args.date, "preregHash": h, "panelMeta": {k: meta[k] for k in ("generatedAt", "dataRev", "from", "to", "scoringFixture", "keys", "spikeSd", "counts")},
        "checks": meta["checks"], "parity": {"rows": n, "mismatches": int(len(bad))}, "b4": {"combinedSha256": index["combinedSha256"], "fetchDate": index["fetchDate"],
        "updatedAtNonNullShare": index["updatedAtNonNullShare"], "coverage2021MinPerPosition": cov2021, "relevantSetCoverage": b4cov},
        "bootstrap": {"resamples": B, "seed": bs_seed, "clusterBy": "player"}, "folds": {"test": list(splits.TEST_SEASONS), "development": list(splits.DEV_FOLDS), "confirmation": splits.CONFIRM_FOLD},
        "results": res,
    }
    if benchw is not None:
        aggregate["benchwMeta"] = benchw_meta
        aggregate["weeklyC"] = c_weekly
        aggregate["weeklyB1Coverage"] = {str(S): v for S, v in coverage.items()}
        aggregate["erratum"] = ctx["erratum"]

    def clean(o):
        if isinstance(o, dict):
            return {str(k): clean(v) for k, v in o.items()}
        if isinstance(o, (list, tuple)):
            return [clean(v) for v in o]
        if isinstance(o, (np.floating, float)):
            return None if not np.isfinite(o) else float(o)
        if isinstance(o, (np.integer,)):
            return int(o)
        if isinstance(o, np.bool_):
            return bool(o)
        return o

    body = json.dumps(clean(aggregate), indent=1)
    log("aggregate %.0f KB, verdict %.0f KB, preregHash %s" % (len(body) / 1024, len(verdict) / 1024, h))
    if len(body) > 5 * 1024 * 1024:
        print("[run] STOP: aggregate artifact exceeds 5 MB", file=sys.stderr)
        return 2
    if args.write:
        tag = "s1b" if benchw is not None else "s1a"
        p1 = os.path.join(REPO, "backtests", "%s-learned-%s-panel.json" % (args.date, tag))
        p2 = os.path.join(REPO, "grading", "%s-learned-%s-verdict.md" % (args.date, tag))
        with open(p1, "w") as f:
            f.write(body + "\n")
        with open(p2, "w", encoding="utf-8") as f:
            f.write(verdict)
        log("wrote %s and %s" % (os.path.relpath(p1, REPO), os.path.relpath(p2, REPO)))
    else:
        print(verdict[:3000])
    return 0


if __name__ == "__main__":
    sys.exit(main())
