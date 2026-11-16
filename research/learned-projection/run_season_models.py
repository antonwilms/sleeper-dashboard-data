#!/usr/bin/env python3
"""LP-2a season-layer runner (research only — never run by npm test, smoke or CI).

    python3 research/learned-projection/run_season_models.py --smoke
    python3 research/learned-projection/run_season_models.py --register [--reregister "<reason>"]
    python3 research/learned-projection/run_season_models.py --dev [--write] [--date YYYY-MM-DD] [--resamples 2000]

--smoke  predicts 2018 only (needs no registration), evaluates and prints the verdict; writes nothing.
--register stamps the `season` layer of candidates/H.json and G.json (run after Commit 1, then commit the two files).
--dev    requires both candidates for every development fold 2019..2024 FIRST, appends a `dev` run-log entry, then fits H, G and the
         exploratory arms on those folds only — never 2025 (R1). With --write: backtests/<date>-learned-s2a-dev-panel.json and
         grading/<date>-learned-s2a-dev-verdict.md.
The FIRST step of every mode recomputes the LP-1a §8 hash and returns 2 when it differs from `report.PREREG_HASH` — before the cache is read.
"""
import argparse
import json
import os
import subprocess
import sys
import time
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from lp import asof, baselines, evaluate, extra, features, io, registry, report, report_s2a, score, season_models, spec as spec_mod, splits  # noqa: E402

LP1A_TASK_FILE = os.path.join(REPO, ".claude", "tasks", "learned-projection-1a-harness.md")
ANCHOR_GENERATED_AT = "2026-11-12T23:44:16.940Z"
SMOKE_FOLDS = (2018,)
FOLD_LIMIT_MIN = 60
DEV_LIMIT_H = 6


def main(argv=None, task_file=LP1A_TASK_FILE, env=None):
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--smoke", action="store_true")
    g.add_argument("--register", action="store_true")
    g.add_argument("--dev", action="store_true")
    ap.add_argument("--reregister", default=None)
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--date", default=date.today().isoformat())
    ap.add_argument("--resamples", type=int, default=2000)
    args = ap.parse_args(argv)
    log = lambda m: print("[run] " + m, flush=True)
    # FIRST step, before the cache is read: the pre-registered bar is unchanged
    with open(task_file, encoding="utf-8") as f:
        task_text = f.read()
    h, section8 = report.prereg_hash(task_text)
    if h != report.PREREG_HASH:
        print("[run] STOP: LP-1a §8 hash %s differs from the pinned %s — the pre-registered bar was edited" % (h, report.PREREG_HASH), file=sys.stderr)
        return 2
    env = env or registry.Env()
    if args.register:
        try:
            new = registry.register(env, reregister=args.reregister)
        except registry.NotRegistered as e:
            print("[run] STOP: %s" % e, file=sys.stderr)
            return 2
        for n, o in new.items():
            log("registered %s: specSha256 %s" % (n, o["layers"]["season"]["specSha256"]))
        return 0
    panel = io.load_cache()
    meta = panel.meta
    if meta.get("generatedAt") != ANCHOR_GENERATED_AT:
        print("[run] STOP: panel generatedAt %s differs from the anchor %s" % (meta.get("generatedAt"), ANCHOR_GENERATED_AT), file=sys.stderr)
        return 2
    n, bad = score.parity(panel.Xw, panel.weeks["pts"].to_numpy(), panel.weights)
    log("scoring parity: %d / %d played rows exact" % (n - len(bad), n))
    if len(bad):
        print("[run] STOP: scoring parity failed on %d rows" % len(bad), file=sys.stderr)
        return 2
    tc = io.load_teamctx()
    ex = extra.build_extras()
    tables = asof.Tables.from_panel_full(panel, tc, ex)
    specs = {}
    if args.smoke:
        for nme in registry.NAMES:
            specs[nme] = registry.load(env, nme)["layers"]["season"]["spec"]
    folds = SMOKE_FOLDS if args.smoke else splits.DEV_FOLDS
    if args.dev:
        # every fold of both candidates is required BEFORE the first fit and before the run-log entry
        try:
            for nme in registry.NAMES:
                lay = None
                for T in folds:
                    lay = registry.require(nme, T, "season", env)
                specs[nme] = lay["spec"]
        except (registry.NotRegistered, registry.ConfirmationHeld) as e:
            print("[run] STOP: %s" % e, file=sys.stderr)
            return 2
        registry.runlog_append(env, {"mode": "dev", "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "folds": list(folds), "date": args.date})
    for nme in registry.NAMES:
        if specs[nme]["features"] != specs["H"]["features"] or specs[nme]["targets"] != specs["H"]["targets"]:
            print("[run] STOP: H and G specs disagree on features/targets", file=sys.stderr)
            return 2
    store = season_models.Store(tables, panel.keys, meta["weights"], specs["H"])
    t_start = time.time()
    frames = {"h": [], "g": []}
    details = {"h": {}, "g": {}}
    arms = {}
    secs = {}
    for T in folds:
        for nme in registry.NAMES:
            c = nme.lower()
            t0 = time.time()
            fr, out = season_models.fold(store, nme, specs[nme], T, env, arms=args.dev, log=log)
            frames[c].append(fr)
            details[c][T] = out["details"]
            for (pos, an), a in out.get("arms", {}).items():
                arms.setdefault((c, pos, an), []).append(a)
            secs["%s %d" % (nme, T)] = round(time.time() - t0, 1)
            log("fold %d %s done in %.0fs" % (T, nme, time.time() - t0))
            if (time.time() - t0) / 60 > FOLD_LIMIT_MIN:
                print("[run] STOP: fold %d %s took over %d minutes" % (T, nme, FOLD_LIMIT_MIN), file=sys.stderr)
                return 2
        if (time.time() - t_start) / 3600 > DEV_LIMIT_H:
            print("[run] STOP: the run exceeded %d hours" % DEV_LIMIT_H, file=sys.stderr)
            return 2
    cand = {c: pd.concat(v, ignore_index=True) for c, v in frames.items()}
    arms = {k: pd.concat(v, ignore_index=True) for k, v in arms.items()}
    sf = evaluate.build_frame(tables, folds, {c: cand[c] for c in cand})
    actual_keys = []
    for T in folds:
        ps = store.ps(T + 1)
        a = ps[ps["s"] == T][["pid"] + store.keys].copy()
        a["T"] = T
        actual_keys.append(a)
    actual_keys = pd.concat(actual_keys, ignore_index=True)
    res = evaluate.evaluate(sf, folds, args.resamples, details=details, arms=arms, comps=cand, actual_keys=actual_keys)
    preds_path = os.path.join(registry.HERE, ".cache", "models", "season-preds.jsonl")
    preds_sha = None
    if args.dev:
        os.makedirs(os.path.dirname(preds_path), exist_ok=True)
        with open(preds_path, "w") as f:
            for c, df in cand.items():
                for r in df.to_dict("records"):
                    f.write(json.dumps({"cand": c, **{k: (int(v) if isinstance(v, np.integer) else (None if isinstance(v, float) and not np.isfinite(v) else v)) for k, v in r.items()}}, sort_keys=True) + "\n")
            for (c, pos, an), df in arms.items():
                for r in df.to_dict("records"):
                    f.write(json.dumps({"cand": c, "arm": an, "position": pos, "pid": r["pid"], "T": int(r["T"]), "total": float(r["total"])}, sort_keys=True) + "\n")
        preds_sha = registry.sha_file(preds_path)
    facts = _facts(env, tables, folds, details, secs, preds_sha, args)
    ctx = {"date": args.date, "mode": "smoke" if args.smoke else "dev", "prereg": h, "section8": section8, "facts": facts}
    verdict = report_s2a.build_verdict(res, ctx)
    if args.smoke:
        _smoke_check(sf)
        print(verdict)
        return 0
    aggregate = {"slice": "LP-2a", "date": args.date, "preregHash": h, "folds": list(folds), "confirmation": evaluate.UNCONFIRMED,
                 "panelMeta": {k: meta[k] for k in ("generatedAt", "dataRev", "from", "to", "scoringFixture", "keys", "counts")},
                 "registration": {n: registry.load(env, n)["layers"]["season"] for n in registry.NAMES}, "seasonPredsSha256": preds_sha,
                 "bootstrap": {"resamples": args.resamples, "seed": 12345, "clusterBy": "player"}, "seconds": secs, "results": res}

    def clean(o):
        if isinstance(o, dict):
            return {str(k): clean(v) for k, v in o.items()}
        if isinstance(o, (list, tuple)):
            return [clean(v) for v in o]
        if isinstance(o, (np.floating, float)):
            return None if not np.isfinite(o) else float(o)
        if isinstance(o, np.integer):
            return int(o)
        if isinstance(o, np.bool_):
            return bool(o)
        return o

    body = json.dumps(clean(aggregate), indent=1)
    log("aggregate %.0f KB, verdict %.0f KB" % (len(body) / 1024, len(verdict) / 1024))
    if len(body) > 5 * 1024 * 1024:
        print("[run] STOP: aggregate artifact exceeds 5 MB", file=sys.stderr)
        return 2
    if args.write:
        p1 = os.path.join(REPO, "backtests", "%s-learned-s2a-dev-panel.json" % args.date)
        p2 = os.path.join(REPO, "grading", "%s-learned-s2a-dev-verdict.md" % args.date)
        with open(p1, "w") as f:
            f.write(body + "\n")
        with open(p2, "w", encoding="utf-8") as f:
            f.write(verdict)
        log("wrote %s and %s" % (os.path.relpath(p1, REPO), os.path.relpath(p2, REPO)))
    else:
        print(verdict[:3000])
    return 0


def _smoke_check(sf):
    worse = 0
    for pos in baselines.POSITIONS:
        d = sf[(sf["position"] == pos) & sf["headline"] & (sf["stratum"] == "V")]
        for c in ("h", "g"):
            if c in d and np.abs(d[c] - d["actual"]).mean() > np.abs(d["b2"] - d["actual"]).mean():
                worse += 1
    print("[run] smoke: candidate-position pairs with 2018 headline-V MAE above B2's: %d of 8" % worse)


def _git(*a):
    r = subprocess.run(["git"] + list(a), cwd=HERE, capture_output=True, text=True)
    return r.stdout.strip()


def _facts(env, tables, folds, details, secs, preds_sha, args):
    facts = []
    for n in registry.NAMES:
        try:
            o = registry.load(env, n)["layers"]["season"]
            facts.append(("candidate %s" % n, "specSha256 `%s`, registeredAt %s, commit `%s`, reregistrations %d, python %s" % (o.get("specSha256"), o.get("registeredAt"), _git("log", "-1", "--format=%h", "--", "candidates/%s.json" % n) or "—", len(o.get("reregistrations") or []), o.get("python"))))
        except Exception as e:  # smoke before registration
            facts.append(("candidate %s" % n, "not stamped (%s)" % type(e).__name__))
    facts.append(("code commit (HEAD)", _git("rev-parse", "--short", "HEAD") or "—"))
    fb = {}
    for T in folds:
        v = asof.view(tables, T, 0)
        u = features.universe(tables, T)
        k = features.kickoff(v, u)
        sched = set(v.schedule["pid"])
        fb[T] = {"universe": len(u), "noScheduleRow": int(sum(1 for p in u if p not in sched)), "noTeam": int(k["team_k"].isna().sum())}
    facts.append(("kickoff fallbacks (universe rows without a schedule row → season-row team; no team at all)", json.dumps(fb)))
    raw = sorted({x for c in details.values() for T in c.values() for p in T.values() for x in p["fallback"]})
    facts.append(("raw-fallback quantities (E1 unusable)", ", ".join(raw) or "none"))
    facts.append(("run times (s)", json.dumps(secs)))
    if preds_sha:
        facts.append(("season-preds.jsonl SHA-256", preds_sha))
    import numpy, pandas, scipy, sklearn
    facts.append(("versions", "python %s, numpy %s, pandas %s, scikit-learn %s, scipy %s" % (sys.version.split()[0], numpy.__version__, pandas.__version__, sklearn.__version__, scipy.__version__)))
    return facts


if __name__ == "__main__":
    sys.exit(main())
