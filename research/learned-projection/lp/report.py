"""Evaluation and reporting (task §5.4, §5.5, §9, §10): metric tables with clustered-bootstrap CIs, cohorts, drift, coverage, the
aggregate artifact and the verdict markdown. LP-1a makes no claim about learned models: RIDGE is a baseline."""
import hashlib
import json
import re

import numpy as np
import pandas as pd

from . import bootstrap as bs
from . import metrics as M
from . import splits
from .baselines import POSITIONS, RELEVANT_K

FOLDS = splits.TEST_SEASONS
NF = len(FOLDS)
FIDX = {T: i for i, T in enumerate(FOLDS)}
P_CLIP = 0.01

SEASON_BENCH = [("B1", "b1"), ("B1c", "b1c"), ("B2", "b2"), ("RIDGE", "ridge")]
WEEKLY_BENCH = [("STD", "std"), ("B2", "b2w"), ("RIDGE", "ridge"), ("B4", "b4")]
WEEKLY_B1 = [("B1", "b1w"), ("B1c", "b1cw")]            # LP-1b: appended to WEEKLY_BENCH when the column is present
UNCOND_COL = {"b1w": "b1w_uncond", "b1cw": "b1cw_uncond"}


def weekly_bench(wk):
    """WEEKLY_BENCH, with B1 / B1c appended when the frame carries the replay's columns. `common` (WEEKLY_BENCH[:3]) never sees them."""
    return WEEKLY_BENCH + (WEEKLY_B1 if "b1w" in wk.columns else [])
SEASON_SETS = ["headline", "V", "N", "deep"]


def _num(v):
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return None
    return float(v)


def _metric(m):
    return {"value": _num(m["value"]), "ci": [_num(m["ci"][0]), _num(m["ci"][1])]}


# LP-1a §8's pinned hash (task .claude/tasks/learned-projection-1a-harness.md): `run_benchmarks.py` stops on a mismatch in every mode.
PREREG_HASH = "7ff9087fc4848b0df90383fc5e4397d3d4b085466c228b430211a63ad6e24e5a"


def prereg_hash(task_text):
    """SHA-256 of the UTF-8 bytes of §8: from the line beginning `## 8.` up to, excluding, the line beginning `## 9.` (LF)."""
    text = task_text.replace("\r\n", "\n")
    a = re.search(r"^## 8\.", text, re.M).start()
    b = re.search(r"^## 9\.", text, re.M).start()
    section = text[a:b]
    return hashlib.sha256(section.encode("utf-8")).hexdigest(), section


# ── season layer ───────────────────────────────────────────────────────────────────────────────────────────
def season_set_mask(df, name):
    if name == "headline":
        return df["headline"]
    if name == "V":
        return df["stratum"] == "V"
    if name == "N":
        return df["stratum"] == "N"
    return ~df["headline"]


def season_eval(sf, B=bs.B_DEFAULT):
    out = {}
    for pos in POSITIONS:
        d = sf[sf["position"] == pos].reset_index(drop=True)
        rs = bs.Resampler(d["pid"], B=B)
        res = {}
        for sname in SEASON_SETS:
            ds = d[season_set_mask(d, sname)]
            cell = {}
            for bname, col in SEASON_BENCH:
                rows = ds[ds[col].notna() & ds["ridge"].notna()]
                if bname in ("B1", "B1c"):
                    rows = rows[rows["b1_covered"]]
                if len(rows) == 0:
                    continue
                f = rows["T"].map(FIDX).to_numpy()
                pi = rs.idx(rows["pid"])
                err = (rows[col] - rows["actual"]).to_numpy()
                e_r = (rows["ridge"] - rows["actual"]).to_numpy()
                mae = M.mae_pooled(err, f, NF, rs, pi)
                entry = {"n": int(len(rows)), "mae": _metric(mae), "bias": _metric(M.signed_pooled(err, f, NF, rs, pi)),
                         "spearman": _metric(M.spearman_pooled(rows[col].to_numpy(), rows["actual"].to_numpy(), f, NF, rs, pidx=pi))}
                pf, bf = rs.per_fold_mean(np.abs(err), f, NF, pi)
                entry["maeByFold"] = {str(T): _num(pf[i]) for i, T in enumerate(FOLDS)}
                entry["drift"] = M.drift(pf, bf, list(FOLDS)) if np.isfinite(pf).all() else None
                if bname != "RIDGE":
                    d_ = M.diff_pooled(np.abs(e_r), np.abs(err), f, NF, rs, pi)
                    sp_r = M.spearman_pooled(rows["ridge"].to_numpy(), rows["actual"].to_numpy(), f, NF, rs, pidx=pi)
                    sp_b = M.spearman_pooled(rows[col].to_numpy(), rows["actual"].to_numpy(), f, NF, rs, pidx=pi)
                    sp_d = sp_r["boot"] - sp_b["boot"]
                    entry["ridgeMinusBench"] = {
                        "ridgeMae": _num(np.mean([np.abs(e_r)[f == k].mean() for k in range(NF) if (f == k).any()])),
                        "dMae": _metric(d_), "dSpearman": {"value": _num(sp_r["value"] - sp_b["value"]), "ci": bs.ci95(sp_d)},
                        "pctImprovement": _num(-d_["value"] / mae["value"]),
                    }
                cell[bname] = entry
            res[sname] = cell
        # common-row comparison (the hardest-benchmark summary): headline rows where every benchmark has a value
        h = d[d["headline"] & d["b1_covered"] & d["b2"].notna() & d["ridge"].notna()]
        if len(h):
            f = h["T"].map(FIDX).to_numpy()
            pi = rs.idx(h["pid"])
            res["common"] = {"n": int(len(h)), "mae": {b: _metric(M.mae_pooled((h[c] - h["actual"]).to_numpy(), f, NF, rs, pi)) for b, c in SEASON_BENCH}}
        out[pos] = res
    return out


# ── weekly layer ───────────────────────────────────────────────────────────────────────────────────────────
def expected_points(rows, col):
    """Unconditional expected points of benchmark column `col`: p_plays × col; for B1 / B1c the replay's own `<col>_uncond` where it has one."""
    exp = (rows["p_plays"] * rows[col]).to_numpy(float)
    if col in UNCOND_COL:
        un = rows[UNCOND_COL[col]].to_numpy(float)
        exp = np.where(np.isfinite(un), un, exp)
    return exp


def weekly_eval(wk, B=bs.B_DEFAULT):
    out = {}
    for pos in POSITIONS:
        d = wk[wk["position"] == pos].reset_index(drop=True)
        rs = bs.Resampler(d["pid"], B=B)
        gid = {k: i for i, k in enumerate(sorted(set(zip(d["T"], d["w"]))))}
        d["g"] = [gid[k] for k in zip(d["T"], d["w"])]
        g_fold = np.zeros(len(gid), int)
        for (T, w), i in gid.items():
            g_fold[i] = FIDX[T]
        res = {"cond": {}, "uncond": {}}
        rel = d[d["relevant"]]
        cond = rel[rel["played"]]
        for bname, col in weekly_bench(wk):
            rows = cond[cond[col].notna() & cond["ridge"].notna()]
            if not len(rows):
                continue
            f, pi = rows["T"].map(FIDX).to_numpy(), rs.idx(rows["pid"])
            err = (rows[col] - rows["pts"]).to_numpy()
            e_r = (rows["ridge"] - rows["pts"]).to_numpy()
            mae = M.mae_pooled(err, f, NF, rs, pi)
            sp = M.spearman_weekly(rows[col].to_numpy(), rows["pts"].to_numpy(), rows["g"].to_numpy(), g_fold, NF, rs, pidx=pi)
            e = {"n": int(len(rows)), "mae": _metric(mae), "bias": _metric(M.signed_pooled(err, f, NF, rs, pi)), "spearman": _metric(sp)}
            pf, bf = rs.per_fold_mean(np.abs(err), f, NF, pi)
            e["maeByFold"] = {str(T): _num(pf[i]) for i, T in enumerate(FOLDS)}
            e["drift"] = M.drift(pf, bf, list(FOLDS)) if np.isfinite(pf).all() else None
            # RIDGE minus each benchmark (RIDGE vs STD for the RIDGE row)
            if bname != "RIDGE":
                d_ = M.diff_pooled(np.abs(e_r), np.abs(err), f, NF, rs, pi)
                sp_r = M.spearman_weekly(rows["ridge"].to_numpy(), rows["pts"].to_numpy(), rows["g"].to_numpy(), g_fold, NF, rs, pidx=pi)
                e["ridgeMinusBench"] = {"dMae": _metric(d_), "dSpearman": {"value": _num(sp_r["value"] - sp["value"]), "ci": bs.ci95(sp_r["boot"] - sp["boot"])},
                                        "pctImprovement": _num(-d_["value"] / mae["value"])}
            res["cond"][bname] = e
        # unconditional: expected points (p_plays x cond) vs actual points with 0 for a non-played team-game week, relevant set
        for bname, col in weekly_bench(wk):
            rows = rel[rel[col].notna() & rel["ridge"].notna()]
            if not len(rows):
                continue
            f, pi = rows["T"].map(FIDX).to_numpy(), rs.idx(rows["pid"])
            exp = expected_points(rows, col)                    # unclipped: the clip is for log-loss only
            err = exp - rows["actual0"].to_numpy()
            res["uncond"][bname] = {"n": int(len(rows)), "mae": _metric(M.mae_pooled(err, f, NF, rs, pi)), "bias": _metric(M.signed_pooled(err, f, NF, rs, pi))}
        # P(plays): Brier and log-loss over weekly-universe rows
        u = d
        p_raw = u["p_plays"].to_numpy(float)
        p = np.clip(p_raw, P_CLIP, 1 - P_CLIP)            # log-loss only
        y = u["played"].astype(float).to_numpy()
        f, pi = u["T"].map(FIDX).to_numpy(), rs.idx(u["pid"])
        res["pPlays"] = {"n": int(len(u)),
                         "brier": _metric(M.signed_pooled((p_raw - y) ** 2, f, NF, rs, pi)),
                         "logLoss": _metric(M.signed_pooled(-(y * np.log(p) + (1 - y) * np.log(1 - p)), f, NF, rs, pi)),
                         "clip": P_CLIP}
        # common rows (hardest-benchmark summary): relevant played rows with STD, B2, RIDGE all present
        c = cond[cond["b2w"].notna()]
        if len(c):
            f, pi = c["T"].map(FIDX).to_numpy(), rs.idx(c["pid"])
            res["common"] = {"n": int(len(c)), "mae": {b: _metric(M.mae_pooled((c[col] - c["pts"]).to_numpy(), f, NF, rs, pi)) for b, col in WEEKLY_BENCH[:3]}}
        if "b1w" not in wk.columns:
            res["pending1b"] = {"B1": "pending-1b", "B1c": "pending-1b"}
        out[pos] = res
    return out


# ── cohorts ────────────────────────────────────────────────────────────────────────────────────────────────
def cohort_eval(wk, weeks, B=bs.B_DEFAULT):
    """a: catch-up lag; b: mean signed error in the fill-in's first two played weeks after the return; c: mean signed error in the
    next played week after a spike. Test seasons only; cells < 30 rows are INSUFFICIENT."""
    models = [("STD", "std"), ("B2", "b2w"), ("RIDGE", "ridge"), ("B4", "b4")]
    w = weeks[weeks["S"].isin(FOLDS)][["pid", "S", "w", "played", "pts", "cohort", "position"]]
    proj = wk.set_index(["pid", "S", "w"])
    out = {"a": {}, "b": {}, "c": {}}
    fl = w[w["cohort"].map(len) > 0]
    # a — role riser
    risers = fl[fl["cohort"].map(lambda c: "a" in c)]
    byp = {k: g for k, g in w.groupby(["pid", "S"])}
    for name, col in models:
        lags = []
        for r in risers.itertuples():
            g = byp[(r.pid, r.S)]
            win = g[(g["w"] >= r.w) & (g["w"] <= r.w + 7) & g["played"]]
            if not len(win):
                continue
            L = win["pts"].mean()
            series = {}
            for k in range(0, 8):
                key = (r.pid, r.S, r.w + k)
                if key in proj.index:
                    v = proj.loc[key, col]
                    if np.isfinite(v):
                        series[r.w + k] = float(v)
            lag, cens = M.catch_up_lag(series, r.w, L)
            if lag is not None:
                lags.append((lag, cens))
        n = len(lags)
        out["a"][name] = {"n": n, "status": M.cell(n)}
        if n:
            out["a"][name].update({"medianLag": float(np.median([l for l, _ in lags])), "shareCensored": float(np.mean([c for _, c in lags]))})
    # b / c — signed errors
    def signed(rows_iter, col):
        vals, pids = [], []
        for pid, S, wk_, pts in rows_iter:
            key = (pid, S, wk_)
            if key in proj.index:
                v = proj.loc[key, col]
                if np.isfinite(v):
                    vals.append(float(v) - pts)
                    pids.append(pid)
        return vals, pids
    brows = [(r.pid, r.S, r.w, r.pts) for r in fl[fl["cohort"].map(lambda c: "b" in c)].itertuples()]
    crows = []
    for r in fl[fl["cohort"].map(lambda c: "c" in c)].itertuples():
        g = byp[(r.pid, r.S)]
        nxt = g[(g["w"] > r.w) & g["played"]].head(1)
        if len(nxt):
            crows.append((r.pid, r.S, int(nxt["w"].iloc[0]), float(nxt["pts"].iloc[0])))
    for key, rows_ in (("b", brows), ("c", crows)):
        for name, col in models:
            vals, pids = signed(rows_, col)
            n = len(vals)
            e = {"n": n, "status": M.cell(n)}
            if n:
                rs = bs.Resampler(pids, B=B)
                pt, boot = rs.per_fold_mean(np.array(vals), np.zeros(n, int), 1)
                e["meanSignedError"] = {"value": float(pt[0]), "ci": bs.ci95(boot[:, 0])}
            out[key][name] = e
    return out


# ── markdown ───────────────────────────────────────────────────────────────────────────────────────────────
def fm(m, d=2):
    if m is None or m.get("value") is None:
        return "—"
    lo, hi = m["ci"]
    return "%.*f [%.*f, %.*f]" % (d, m["value"], d, lo, d, hi)


def table(headers, rows):
    return ["| " + " | ".join(headers) + " |", "|" + "|".join("---" for _ in headers) + "|"] + ["| " + " | ".join(str(c) for c in r) + " |" for r in rows]


def plain_summary(season, weekly):
    lines = []
    for pos in POSITIONS:
        s = season[pos].get("common")
        w = weekly[pos].get("common")
        txt = "- **%s.** " % pos
        if s:
            maes = {b: m["value"] for b, m in s["mae"].items()}
            nonridge = {b: v for b, v in maes.items() if b != "RIDGE"}
            hardest = min(nonridge, key=nonridge.get)
            others = sorted(v for b, v in nonridge.items() if b != hardest)
            txt += "Season totals (headline set, %d rows where B1, B2 and RIDGE all exist): hardest benchmark %s at MAE %.1f (next %.1f; RIDGE %.1f). " % (
                s["n"], hardest, nonridge[hardest], others[0], maes["RIDGE"])
        if w:
            maes = {b: m["value"] for b, m in w["mae"].items()}
            nonridge = {b: v for b, v in maes.items() if b != "RIDGE"}
            hardest = min(nonridge, key=nonridge.get)
            txt += "Weekly points given he plays (relevant set, %d rows): hardest benchmark %s at MAE %.2f (RIDGE %.2f)." % (
                w["n"], hardest, nonridge[hardest], maes["RIDGE"])
            b1, b1c = weekly[pos]["cond"].get("B1"), weekly[pos]["cond"].get("B1c")
            if b1 and b1c:
                txt += " Weekly B1 (the app's in-season model) %.2f and B1c %.2f on their own B1-covered rows (%d / %d)." % (b1["mae"]["value"], b1c["mae"]["value"], b1["n"], b1c["n"])
            else:
                txt += " B1 weekly: pending-1b."
        lines.append(txt)
    return lines


def _fact_table(task_text):
    m = re.search(r"^## 2\..*?$(.*?)^## 3\.", task_text, re.M | re.S)
    return m.group(1).strip() if m else ""


def erratum_counts(weeks):
    """LP-1a §9.3 rewritten from counts on the `weeks` table: played rows failing the check (`teamFirstChoice` false), split into
    rows whose first-choice team has no schedule game that week (`noGame`; the row is kept on that team) and rows resolved to a
    different team, each by `teamSource`."""
    p = weeks[weeks["played"].astype(bool)]
    bad = p[~p["teamFirstChoice"].astype(bool)]
    no_game = bad[bad["noGame"].astype(bool)]
    other = bad[~bad["noGame"].astype(bool)]
    return {"played": int(len(p)), "failing": int(len(bad)),
            "noGameKept": {str(k): int(v) for k, v in no_game.groupby("teamSource").size().items()},
            "resolvedElsewhere": {str(k): int(v) for k, v in other.groupby("teamSource").size().items()}}


def build_verdict(res, ctx):
    """ctx: date, meta (panel meta), index (sleeper index.json), prereg (hash), section8, task_text, parity, b4cov, commit_note."""
    season, weekly, cohorts, meta = res["season"], res["weekly"], res["cohorts"], ctx["meta"]
    L = []
    b1b = ctx.get("benchw") is not None
    if b1b:
        L.append("# LP-1b — learned-projection scoreboard with the weekly current-model benchmark (%s)" % ctx["date"])
        L.append("")
        L.append("Offline research. **LP-1b makes no claim about learned models**: RIDGE is a baseline, and this slice fills only the weekly B1 / B1c columns "
                 "(the app's in-season model replayed week by week). Nothing here ships. Task files: `.claude/tasks/learned-projection-1b-weekly-bench.md` "
                 "(this slice) and `.claude/tasks/learned-projection-1a-harness.md` (the frozen definition and bar). Panel built from `%s` (data rev `%s`), "
                 "test seasons %d–%d, development folds 2019–2024, confirmation fold 2025." % (meta["scoringFixture"], meta.get("dataRev"), FOLDS[0], FOLDS[-1]))
    else:
        L.append("# LP-1a — learned-projection scoreboard (%s)" % ctx["date"])
        L.append("")
        L.append("Offline research. **LP-1a makes no claim about learned models**: RIDGE is a baseline. Nothing here ships. "
                 "Task file: `.claude/tasks/learned-projection-1a-harness.md`. Panel built from `%s` (data rev `%s`), test seasons %d–%d, "
                 "development folds 2019–2024, confirmation fold 2025." % (meta["scoringFixture"], meta.get("dataRev"), FOLDS[0], FOLDS[-1]))
    L.append("")
    L.append("## Summary by position")
    L.append("")
    L += plain_summary(season, weekly)
    L.append("")
    if b1b:
        L.append("Weekly B1 is the replay of the app's in-season posterior (`cond`); B1c is B1 × `c`, the per-position median of actual / B1 over the fold's own training rows "
                 "(relevant, played, both > 0; the relevant set ranked on that fold's own training STD). B4 (Sleeper) is report-only. "
                 "Every comparison against B1/B1c uses only rows where B1 has a value, for both sides — that set is **outcome-conditioned** "
                 "(`assembleSeason` enumerates only players with gamesPlayed ≥ 1 in S).")
    else:
        L.append("Weekly B1 / B1c columns read `pending-1b` (slice 1b builds the app's in-season routing replay). B4 (Sleeper) is report-only. "
                 "Every comparison against B1/B1c uses only B1-covered rows, for both sides — that set is **outcome-conditioned** "
                 "(`assembleSeason` enumerates only players with gamesPlayed ≥ 1 in S).")
    L.append("")
    L.append("## Facts (task §2, measured by Session 1)")
    L.append("")
    L.append(ctx["facts"])
    L.append("")
    L.append("## Run-time checks (§9)")
    L.append("")
    c = meta["checks"]
    L.append("1. Scoring parity: **%d / %d** played rows exact (hard stop otherwise)." % (ctx["parity"][0] - ctx["parity"][1], ctx["parity"][0]))
    L.append("2. Σ weekly `pts` = league season points within 0.05: **%d / %d** player-seasons (%.4f%%); misses: %s." % (
        c["c2"]["ok"], c["c2"]["players"], 100 * c["c2"]["rate"], json.dumps(c["c2"]["misses"]) if c["c2"]["misses"] else "none"))
    L.append("3. Played rows on the §4.3 first-choice team (the rosterweekly team if listed, else the season-totals team) **and** that team has a schedule game that week (`teamFirstChoice`): **%d / %d** (%.4f%%; threshold ≥ 99%%). Rows resolved by fallback (not first choice), by `teamSource`: %s; rows with a schedule game on the team used: %d / %d." % (
        c["c3"]["firstChoice"], c["c3"]["played"], 100 * c["c3"]["rate"], json.dumps(c["c3"]["byFallback"]) if c["c3"]["byFallback"] else "none", c["c3"]["withGame"], c["c3"]["played"]))
    L.append("")
    L += table(["season", "played rows", "first-choice team with game", "with schedule game"], [[S, v["played"], v["firstChoice"], v["withGame"]] for S, v in c["c3"]["bySeason"].items()])
    L.append("")
    L += table(["teamSource", "played rows", "first-choice team with game", "with schedule game"], [[k, v["played"], v["firstChoice"], v["withGame"]] for k, v in c["c3"]["bySource"].items()])
    L.append("")
    L.append("4. `b1.covered` share of the season headline set (stratum V ∪ drafted in S rounds 1–3), per position and test season (< 60%% anywhere would have stopped the run); `noGames` (veteran-routed rows with no qualifying season: total null, row kept) = **%d**." % meta["counts"]["noGames"])
    L.append("")
    L += table(["season"] + list(POSITIONS), [[S] + ["%d/%d = %.3f" % (v[p]["covered"], v[p]["n"], v[p]["share"]) for p in POSITIONS] for S, v in c["c4"].items()])
    L.append("")
    L.append("5. Per season: rosterweekly status vocabulary, share of depth team-weeks carrying `dt`, and B4 coverage of the weekly relevant set.")
    L.append("")
    rows = []
    for S, v in c["c5"].items():
        voc = ", ".join("%s %d" % (k, n) for k, n in sorted(v["rosterweeklyStatusVocabulary"].items(), key=lambda kv: -kv[1]))
        cov = ctx["b4cov"].get(int(S))
        rows.append([S, voc, "%d/%d" % (v["depthTeamWeeksWithDt"], v["depthTeamWeeks"]), ("%.3f" % cov) if cov is not None else "—"])
    L += table(["season", "rosterweekly statuses (rows)", "depth team-weeks with dt", "B4 coverage (relevant set)"], rows)
    L.append("")
    if b1b:
        bw = ctx["benchw"]
        L.append("### LP-1b run-time checks (§9)")
        L.append("")
        cv = bw["coverage"]
        L.append("1. **Coverage (Python).** Share of weekly relevant-set rows whose (pid, S) has `b1.covered` and whose weekly B1 (`b1w`) is non-null, per position and test season (< 60%% in any position-fold would have stopped the run). `condNull` = %d of %d benchw rows; QB rows omitted by the replay (live-chain QB with no state) = %d." % (
            bw["meta"]["counts"]["condNull"], bw["meta"]["counts"]["rows"], bw["meta"]["counts"]["qbOmitted"]))
        L.append("")
        L += table(["season"] + list(POSITIONS), [[S] + ["%d/%d = %.3f" % (v[p]["covered"], v[p]["n"], v[p]["share"]) if v[p]["n"] else "—" for p in POSITIONS] for S, v in cv.items()])
        L.append("")
        c2 = bw["meta"]["checks"]["c2"]
        L.append("2. **Routing agreement** (the data classifier's arm vs the app's population, every `b1.covered` (pid, S)): **%d / %d = %.2f%%** pooled (stop below 98%% pooled or 95%% at any position); per position: %s. Disagreements by cell: %s. Rows whose route differs (`routeMismatch`, every week row): %d." % (
            c2["agree"], c2["n"], 100 * c2["rate"], ", ".join("%s %.2f%% (%d/%d)" % (k, 100 * v["rate"], v["agree"], v["n"]) for k, v in sorted(c2["byPosition"].items())),
            json.dumps(c2["cells"]), bw["meta"]["counts"]["routeMismatch"]))
        c3 = bw["meta"]["checks"]["c3"]
        L.append("3. **Chain sanity.** Every `fraction` in [0, 1] (violations: %d); every `massPerGame` within 1e-9 of 1 (violations: %d; worst deviation %.2e); every QB row is exactly one of preseason / original / starter / backup / none / omitted. QB rows by kind: %s." % (
            c3["fractionBad"], c3["massBad"], c3["massMaxDev"], json.dumps(bw["meta"]["counts"]["byKind"])))
        L.append("4. **Bar unchanged.** `preregHash` recomputed over LP-1a §8 = `%s` (pinned; a mismatch stops every mode)." % ctx["prereg"])
        L.append("5. **Cache pairing.** `benchw.meta.panelGeneratedAt` = `%s` = panel `generatedAt`; the three Node checks passed; scoring parity on 100%% of played rows (above)." % bw["meta"]["panelGeneratedAt"])
        c6 = bw["meta"]["checks"]["c6"]["bySeason"]
        L.append("6. **Primary-passer coverage** (per season, stop below 0.99): " + "; ".join("%s %d/%d" % (S, v["withPrimary"], v["teamGames"]) for S, v in sorted(c6.items(), key=lambda kv: int(kv[0]))) + ".")
        L.append("")
        L.append("Constants: `%s` (SHA-256 `%s`); QB chain models: `%s`." % (bw["meta"]["constantsFile"], bw["meta"]["constantsSha256"], bw["meta"]["qbChainSource"]))
        L.append("")
        er = ctx["erratum"]
        L.append("### Erratum to the LP-1a verdict (§9.3)")
        L.append("")
        L.append("Counted on the `weeks` table: **%d** of %d played rows fail the first-choice-team-with-a-game check. Of these, **%d** have a first-choice team with no schedule game that week (`noGame`; the row is kept on that team), by `teamSource`: %s; **%d** were resolved to a different team, by `teamSource`: %s. "
                 "The 2026-11-13 LP-1a verdict called all 29 fallback-resolved although none was; its check value is correct and its wording was wrong. The committed LP-1a verdict is not edited." % (
                     er["failing"], er["played"], sum(er["noGameKept"].values()), json.dumps(er["noGameKept"]) if er["noGameKept"] else "none",
                     sum(er["resolvedElsewhere"].values()), json.dumps(er["resolvedElsewhere"]) if er["resolvedElsewhere"] else "none"))
        L.append("")
        L.append("### Weekly `c` (B1c) per position per fold")
        L.append("")
        L += table(["position"] + [str(T) for T in FOLDS], [[p] + [("%.4f" % ctx["c_weekly"][p][T]) if ctx["c_weekly"][p].get(T) is not None else "—" for T in FOLDS] for p in POSITIONS])
        L.append("")
    L.append("## Season forecast — metric tables (MAE / mean signed error = forecast − actual / Spearman; 95% clustered-bootstrap CI)")
    L.append("")
    for pos in POSITIONS:
        L.append("### %s" % pos)
        L.append("")
        for sname in SEASON_SETS:
            cell = season[pos][sname]
            if not cell:
                continue
            L.append("**%s set**" % sname)
            L.append("")
            rows = []
            for b in ("B1", "B1c", "B2", "RIDGE"):
                e = cell.get(b)
                if not e:
                    continue
                d = e.get("ridgeMinusBench")
                rows.append([b, e["n"], fm(e["mae"], 1), fm(e["bias"], 1), fm(e["spearman"], 3),
                             fm(d["dMae"], 2) if d else "—", ("%.1f%%" % (100 * d["pctImprovement"])) if d else "—",
                             fm(d["dSpearman"], 3) if d else "—"])
            L += table(["benchmark", "rows", "MAE", "bias", "Spearman", "RIDGE−bench ΔMAE", "RIDGE gain", "RIDGE−bench ΔSpearman"], rows)
            L.append("")
    L.append("## Weekly forecast — points given he plays (relevant set, played rows)")
    L.append("")
    for pos in POSITIONS:
        L.append("### %s (K = %d)" % (pos, RELEVANT_K[pos]))
        L.append("")
        rows = []
        for b in ("STD", "B2", "RIDGE", "B4", "B1", "B1c"):
            e = weekly[pos]["cond"].get(b)
            if not e:
                continue
            d = e.get("ridgeMinusBench")
            rows.append([b + (" (report-only)" if b == "B4" else " (own B1-covered rows)" if b in ("B1", "B1c") else ""), e["n"], fm(e["mae"], 3), fm(e["bias"], 3), fm(e["spearman"], 3),
                         fm(d["dMae"], 3) if d else "—", ("%.1f%%" % (100 * d["pctImprovement"])) if d else "—", fm(d["dSpearman"], 3) if d else "—"])
        if not b1b:
            rows.append(["B1 / B1c", "pending-1b", "pending-1b", "pending-1b", "pending-1b", "—", "—", "—"])
        L += table(["benchmark", "rows", "MAE", "bias", "Spearman (per week-group)", "RIDGE−bench ΔMAE", "RIDGE gain", "RIDGE−bench ΔSpearman"], rows)
        L.append("")
        L.append("Unconditional (expected points = P(plays) × cond, vs actual with 0 for a non-played team-game week, relevant set): " + "; ".join(
            "%s MAE %s (n=%d)" % (b, fm(e["mae"], 3), e["n"]) for b, e in weekly[pos]["uncond"].items()) + ". "
            "P(plays) baseline (probabilities clipped to [%.2f, %.2f] for log-loss only; expected points and Brier use the unclipped probability): Brier %s, log-loss %s over %d weekly-universe rows." % (
                P_CLIP, 1 - P_CLIP, fm(weekly[pos]["pPlays"]["brier"], 4), fm(weekly[pos]["pPlays"]["logLoss"], 4), weekly[pos]["pPlays"]["n"]))
        L.append("")
    L.append("## Drift — slope of per-season MAE on season (MAE points per year; 95% CI)")
    L.append("")
    rows = []
    for pos in POSITIONS:
        for b in ("B1", "B1c", "B2", "RIDGE"):
            e = season[pos]["headline"].get(b)
            if e and e.get("drift"):
                rows.append(["season", pos, b, "%.2f [%.2f, %.2f]" % (e["drift"]["slope"], *e["drift"]["ci"])] + [("%.1f" % e["maeByFold"][str(T)]) for T in FOLDS])
        for b in ("STD", "B2", "RIDGE", "B4", "B1", "B1c"):
            e = weekly[pos]["cond"].get(b)
            if e and e.get("drift"):
                rows.append(["weekly", pos, b, "%.3f [%.3f, %.3f]" % (e["drift"]["slope"], *e["drift"]["ci"])] + [("%.2f" % e["maeByFold"][str(T)]) for T in FOLDS])
    L += table(["layer", "position", "benchmark", "slope [CI]"] + [str(T) for T in FOLDS], rows)
    L.append("")
    L.append("## Cohorts (test seasons; cells under 30 rows are INSUFFICIENT)")
    L.append("")
    L.append("spikeSd (seasons 2012–2013 only): %s." % json.dumps({k: round(v, 3) for k, v in meta["spikeSd"].items()}))
    L.append("")
    names = {"a": "(a) Role riser — catch-up lag (weeks until the projection closes ≥ 50% of the gap to L; censored at 6)",
             "b": "(b) Injury fill-in — mean signed error (projection − actual), first two played weeks after the return",
             "c": "(c) One-week spike — mean signed error in the next played week"}
    for k in ("a", "b", "c"):
        L.append("**%s**" % names[k])
        L.append("")
        rows = []
        for m_, e in cohorts[k].items():
            if k == "a":
                rows.append([m_, e["n"], e["status"], "%.1f" % e["medianLag"] if "medianLag" in e else "—", "%.2f" % e["shareCensored"] if "shareCensored" in e else "—"])
            else:
                rows.append([m_, e["n"], e["status"], fm(e.get("meanSignedError"), 2)])
        L += table(["model", "rows", "status", "median lag", "share censored"] if k == "a" else ["model", "rows", "status", "mean signed error [CI]"], rows)
        L.append("")
    L.append("## Benchmark 4 — Sleeper weekly projections (report-only)")
    L.append("")
    ix = ctx["index"]
    L.append("Fetched %s from `%s/projections/nfl/<season>/<week>?%s` (seasons 2018–2025, %d files). Combined SHA-256 over the sorted `name:hash` lines: `%s`." % (
        ix["fetchDate"], ix["host"], ix["query"], ix["fileCount"], ix["combinedSha256"]))
    L.append("")
    L += table(["season", "share of rows with non-null `updated_at`"], [[s_, "%.4f" % v] for s_, v in ix["updatedAtNonNullShare"].items()])
    L.append("")
    L.append("2021 coverage check (rows whose `stats` carry a panel key, minimum per position over 18 weeks): %s." % json.dumps(ctx["cov2021"]))
    L.append("Threshold bonuses (`bonus_*_yd_100/200`) stay 0 in B4 (the projection carries no distribution); `bonus_rec_te = rec` for a TE; `bonus_fd_<pos>` = `rec_fd + rush_fd + pass_fd`. "
             "A row whose `stats` carry no panel key is uncovered. Pre-game timing of these projections is unverifiable (F7).")
    L.append("")
    L.append("## Stated limits of benchmark 1")
    L.append("")
    L.append("**Against the incumbent:** QB season totals use starter PPG × games for every QB (`qbChainApprox`); for non-starters this overstates the app's total (QB headline B1 bias and `c` show the size).")
    L.append("")
    L.append("**In the incumbent's favour or neutral:**")
    L.append("")
    L.append("- its constants and k were tuned on seasons that include the test seasons;")
    L.append("- the `starter` QB prior reads who started game 1 of S;")
    L.append("- veteran priors are frozen on the S week-1 depth chart (`depthIndex(1)`), stamped after week 1's games in 2025 and of unknown timing before (F3);")
    L.append("- the factor context is built with `toYear: S`; %s" % ctx["team_offense_note"])
    L.append("- coverage is conditional on `gamesPlayed ≥ 1` in S;")
    L.append("- residue: in training seasons 2014–2015 week-1 statuses are season-level (F4) — membership only, no test season;")
    if b1b:
        L.append("- the weekly limits follow.")
        L.append("")
        L.append("**Stated limits of the weekly benchmark (LP-1b):**")
        L.append("")
        L.append("- the four stand-ins of the replay — `depth_chart_order` read from the previous game's depth chart (the week-1 chart at w = 1), `injury_status` from the rosterweekly RES/INA/PUP pair of the previous game week (false for S ≤ 2015), `team` from the week-w universe row else the latest earlier row, `years_exp` = S − draft year — two more than LP-1a §8's sentence about \"the two live Sleeper fields\" names;")
        L.append("- the preseason chain set and every w = 1 QB value read the week-1 depth chart (stamped after game 1 in 2025, timing unknown before — LP-1a F3); this reaches the gated weekly B1c on the 2025 confirmation fold, in the incumbent's favour;")
        L.append("- the reconstructed prior replaces the app's frozen-snapshot prior;")
        L.append("- k and the chain models were fitted on seasons including the test seasons;")
        L.append("- two game-count departures (further additions to LP-1a §8's replaced-inputs sentence): the live remaining games are the team's real REG count (the app uses 17 − g) and the preseason room is called with the modal team games of the season (16 through 2020, 17 after; the app passes 17) — identities on a 17-game team-season (2014–2020; BUF and CIN 2022);")
        L.append("- on `routeMismatch` rows (%d week rows) the prior follows the data route, k and the chain rule the app's;" % ctx["benchw"]["meta"]["counts"]["routeMismatch"])
        L.append("- `uncond` on start-chain rows uses the chain's **average** share over the rest of the season, not the next game's start probability (frozen in LP-1a §8);")
        L.append("- coverage is conditional on `gamesPlayed ≥ 1` in S.")
        L.append("")
    else:
        L.append("- weekly limits are stated by slice 1b.")
        L.append("")
    L.append("## Method notes")
    L.append("")
    L.append("- Bootstrap: one draw of players with replacement per (layer, position) from the union of that position's players in the pooled folds; a drawn player brings all his rows in every fold; fold-equal weighting recomputed per resample; %d resamples, seed %d, 95%% percentile CI. Spearman is re-ranked inside every resample (midranks recomputed on the resampled multiset; a group under 8 resampled rows or with zero rank variance is NaN for that resample and left out of its average)." % (ctx["resamples"], ctx["seed"]))
    L.append("- The `lines` and `oracle-*` arms of §4.5 are enforced in `asof.py` and tested (T-PY-4) but are **not run** in 1a (not in §5.3).")
    L.append("- All three cohorts (a), (b), (c) are RB/WR/TE only: a QB has no opportunity share `os` → no `os0` → no label (§5.5).")
    L.append("- RIDGE training rows: season — headline-set rows of seasons 2014..T−1; weekly — played weekly-universe rows of seasons 2014..T−1; α by inner selection on the last two training seasons; medians and the stratum-N prior come from training rows only.")
    L.append("")
    L.append("## Pre-registered pass/fail bar (§8, verbatim) — `preregHash` `%s`" % ctx["prereg"])
    L.append("")
    L.append(ctx["section8"].rstrip())
    L.append("")
    return "\n".join(L) + "\n"
