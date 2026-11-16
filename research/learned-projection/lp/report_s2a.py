"""LP-2a (§11): the verdict markdown. Every label is printed unconfirmed; nothing here says a candidate passed."""
from .evaluate import CANDS, UNCONFIRMED
from .report import fm, table

POSITIONS = ("QB", "RB", "WR", "TE")
NAMES = {"h": "H (partial pooling)", "g": "G (gradient-boosted trees)"}
BENCH_TXT = {"B2": "the two-year average (B2)", "B1c": "the recalibrated current model (B1c)", "RIDGE": "RIDGE"}


def _par(pos, cand, res):
    c = res[pos][cand]
    parts = []
    for b in ("B2", "B1c"):
        x = c["labels"][b]
        parts.append("vs %s %+.1f points (%+.1f%% on %d rows; CI %s) — %s %s" % (BENCH_TXT[b], x["d"]["value"], -100 * x["pct"] if x["pct"] is not None else float("nan"), x["n"],
                                                                                   "[%.1f, %.1f]" % tuple(x["d"]["ci"]), x["label"], UNCONFIRMED))
    r = c["reportOnly"]["headline"].get("RIDGE")
    if r:
        parts.append("vs RIDGE %+.1f points (%+.1f%%; CI [%.1f, %.1f]) — report-only, no gate" % (r["d"]["value"], -100 * r["pct"], r["d"]["ci"][0], r["d"]["ci"][1]))
    return "- **%s · %s.** Season-total MAE difference (candidate minus benchmark; negative is better): " % (pos, cand.upper()) + "; ".join(parts) + "."


def build_verdict(res, ctx):
    folds = res["folds"]
    smoke = ctx["mode"] == "smoke"
    L = ["# LP-2a — first learned models, season layer (%s)%s" % (ctx["date"], " — SMOKE (2018 only, nothing registered)" if smoke else ""), ""]
    L.append("Offline research; nothing here ships. Task file: `.claude/tasks/learned-projection-2a-season-models.md` (Revision 3.1). Two candidates — **H** (partial "
             "pooling) and **G** (gradient-boosted trees) — forecast next-season league points before week 1. Folds evaluated: %s. **The 2025 confirmation is held "
             "(R1): every label below is %s and no candidate has passed the gate.**" % (", ".join(map(str, folds)), UNCONFIRMED))
    L += ["", "## Summary by position and candidate", ""]
    for pos in POSITIONS:
        for cand in CANDS:
            if cand in res[pos]:
                L.append(_par(pos, cand, res))
    L += ["", "Provisional gate (`metrics.gate`, not a pass): " + ", ".join("%s %s" % (c.upper(), v) for c, v in res.get("gateProvisional", {}).items()), ""]
    L += ["## Label table (LP-1a §8, `lp/metrics.py` unchanged) — %s" % UNCONFIRMED, ""]
    rows = []
    for pos in POSITIONS:
        for cand in CANDS:
            if cand not in res[pos]:
                continue
            for b in ("B2", "B1c"):
                x = res[pos][cand]["labels"][b]
                rows.append([pos, cand.upper(), b, x["n"], fm({"value": x["benchMae"]["value"], "ci": x["benchMae"]["ci"]}), "%.2f" % x["candMae"], fm(x["d"]), "%.1f%%" % (100 * x["pct"]),
                             fm(x["dSpearman"], 3), x["label"]])
    L += table(["pos", "cand", "bench", "n", "bench MAE", "cand MAE", "d = cand − bench", "improvement", "Δ Spearman", "label (unconfirmed)"], rows)
    L += ["", "## Reported, not gated (report-only — no gate)", "", "### vs RIDGE and raw B1 (headline / V / N / deep)", ""]
    rows = []
    for pos in POSITIONS:
        for cand in CANDS:
            if cand not in res[pos]:
                continue
            for sname, cell in res[pos][cand]["reportOnly"].items():
                for b in ("RIDGE", "B1"):
                    x = cell.get(b)
                    if x:
                        rows.append([pos, cand.upper(), sname, b, x["n"], "%.2f" % x["candMae"], fm(x["benchMae"]), fm(x["d"]), "%.1f%%" % (100 * x["pct"]), fm(x["dSpearman"], 3), x["label"]])
    L += table(["pos", "cand", "set", "vs", "n", "cand MAE", "bench MAE", "d", "improvement", "Δ Spearman", "label arithmetic (report-only)"], rows)
    L += ["", "### Per candidate and set: MAE, bias, Spearman, MAE per fold, drift", ""]
    rows = []
    for pos in POSITIONS:
        for cand in CANDS:
            for sname, st in res[pos].get(cand, {}).get("sets", {}).items():
                if st:
                    dr = st["drift"]
                    rows.append([pos, cand.upper(), sname, st["n"], fm(st["mae"]), fm(st["bias"]), fm(st["spearman"], 3), ", ".join("%s: %.1f" % (k, v) for k, v in st["maeByFold"].items() if v is not None),
                                 "—" if not dr else "%.2f [%.2f, %.2f]" % (dr["slope"], dr["ci"][0], dr["ci"][1])])
    L += table(["pos", "cand", "set", "n", "MAE", "signed error", "Spearman", "MAE by fold", "drift slope"], rows)
    if len(folds) >= 3:
        L += ["", "### Per-fold d and its slope on T", ""]
        rows = []
        for pos in POSITIONS:
            for cand in CANDS:
                c = res[pos].get(cand)
                if not c:
                    continue
                for b, x in (("B2", c["labels"]["B2"]), ("B1c", c["labels"]["B1c"]), ("RIDGE", c["reportOnly"]["headline"].get("RIDGE"))):
                    if x and "dByFold" in x:
                        rows.append([pos, cand.upper(), b, ", ".join("%s: %+.1f" % (k, v) for k, v in x["dByFold"].items() if v is not None), fm(x["dSlope"], 2)])
        L += table(["pos", "cand", "vs", "d by fold", "slope of d on T"], rows)
    L += ["", "### Components (headline rows)", ""]
    rows = []
    for pos in POSITIONS:
        for cand in CANDS:
            co = res[pos].get(cand, {}).get("components")
            if co:
                kr = co.get("keyRatio") or {}
                top = ", ".join("%s %.2f" % (k, v) for k, v in sorted(kr.items()) if v is not None)
                rows.append([pos, cand.upper(), co["n"], "%.2f" % co["gamesMae"], "%.2f (%d)" % (co["ppgMae"], co["ppgRows"]), top])
    L += table(["pos", "cand", "n", "games MAE", "ppg MAE (rows ≥ 1 game)", "Σ predicted ÷ Σ actual per key"], rows)
    L += ["", "### Chosen entry per fold and position (era, λ[, g]) and calibration c; H: α, k multiple, δ per target", ""]
    rows = []
    for pos in POSITIONS:
        for cand in CANDS:
            for T, d in sorted(res[pos].get(cand, {}).get("chosen", {}).items()):
                e = d["entry"]
                ent = "%s, λ=%g%s" % (e["era"], e["lam"], (", " + e["g"]) if "g" in e else "")
                par = "; ".join("%s α=%g k×%g δ=%g" % (t, p["alpha"], p["kmult"], p["delta"]) for t, p in d["params"].items()) if d["params"] else "—"
                rows.append([pos, cand.upper(), T, ent, "%.3f (%d rows)" % (d["c"], d["cRows"]), par, "%.0fs" % d["seconds"]])
    L += table(["pos", "cand", "T", "entry", "c", "per-target parameters", "time"], rows)
    L += ["", "### H − G paired difference (headline rows; negative: H better)", ""]
    rows = [[pos, res[pos]["H_minus_G"]["n"], fm(res[pos]["H_minus_G"]["d"]), "%.1f%%" % (100 * res[pos]["H_minus_G"]["pct"])] for pos in POSITIONS if "H_minus_G" in res[pos]]
    L += table(["pos", "n", "d = MAE(H) − MAE(G)", "H over G"], rows)
    L += ["", "## Exploratory — not candidates, no label", "",
          "Each arm is the candidate's chosen entry with ONE change and c recomputed by one inner fit; the number is the change in pooled headline MAE against the candidate itself "
          "(negative: the change helped). Reported with its CI; never gated, never a candidate.", ""]
    rows = []
    for pos in POSITIONS:
        for cand in CANDS:
            for an, x in sorted(res[pos].get(cand, {}).get("arms", {}).items()):
                rows.append([pos, cand.upper(), an, x["n"], fm(x["armMae"]), fm(x["changeVsMain"])])
    L += table(["pos", "cand", "arm", "n", "arm MAE", "change vs candidate"], rows) if rows else ["(none in this mode)"]
    L += ["", "## Registration, data and run facts", ""]
    for k, v in ctx["facts"]:
        L.append("- **%s:** %s" % (k, v))
    L += ["", "## LP-1a §8 (verbatim) — pinned hash `%s`" % ctx["prereg"], "", "```", ctx["section8"].rstrip(), "```", "", "## Stated limits", ""]
    for t in ["2025 is held, so no label is final and no candidate has passed the gate.",
              "Benchmark numbers here are pooled over %d development fold(s) and differ from the seven-fold s1a/s1b tables." % len(folds),
              "The kickoff roster is the week-1 listing; `teamGames_k` counts games played (BUF, CIN 2022: 16), as B2's total does.",
              "2017 MIA and TB have no universe player (no week-1 game).",
              "Positions are a static 2026 capture.",
              "B1c's limits are as in the s1b verdict.",
              "2014–2015 universes rest on season-level statuses (membership only).",
              "No feature is asserted equal to an app factor."]:
        L.append("- " + t)
    return "\n".join(L) + "\n"
