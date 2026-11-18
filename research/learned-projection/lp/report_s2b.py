"""LP-2b-1b (§11): the verdict markdown. Every label is printed unconfirmed; the progression rule (Anton, 2026-11-16) comes first and verbatim; the
file prints hashes, never a commit id of its own (LP-2a flag 9)."""
from .evaluate_w import CANDS, LABELLED, POSITIONS, UNCONFIRMED_W
from .report import fm, table

NAMES = {"h": "H (partial pooling)", "g": "G (gradient-boosted trees)"}
BENCH_TXT = {"STD": "the season-to-date average (STD)", "B1c": "the recalibrated current in-season model (B1c)"}
RULE_DATE = "2026-11-16"
# Anton's progression ruling, item 1 of 2b-1a §3.1 (verbatim; T-B-15 compares it with that file).
RULE_TEXT = ("**Progression per position (replaces the outline's \"only a candidate that passed the season gate\").** LP-2a: neither H nor G passes the season gate "
             "(beats B2 and B1c at RB and WR only; QB beats B2, ties B1c; TE ties). For both candidates, the weekly layer is built for all four positions; weekly labels "
             "(LP-1a §8 per-position arithmetic, `preregHash` `7ff9087f…e24e5a` unchanged) are **labelled for RB and WR** and **report-only for QB and TE**. The overall "
             "weekly gate (3 of 4) is still computed and printed; it is expected to fail by construction and is not the product decision. State this rule and its date "
             "(2026-11-16, before any weekly or 2025 result) in the verdict.")
# Anton's pre-registration change to H's context term, ruled 2026-11-18 (task file §17.1; the reason as recorded there).
CTX_RULING = ("**H's context term gains an \"off\" option (Anton, 2026-11-18, before registration).** `ctxAlphas` = [1, 10, 100, 1000, \"off\"] (\"off\": no context term, alpha = infinity), "
              "chosen by the same leave-one-season-out rule; with fewer than 2 training seasons the default is \"off\" instead of 100, because the adjustment cannot be validated. "
              "Reason: decided before any development-fold result, prompted by the smoke diagnostic (H's context term made H worse than STD at every position on the one-season 2018 split); "
              "no value is fitted to 2018.")
GATE_NOTE = "expected to fail by construction; not the product decision"
LIMITS = [
    "2025 is held, so no label is final and no candidate has passed anything.",
    "Training starts in 2018, so fold 2019 has one training season.",
    "G is reproducible only approximately, even when fully pinned (one of four 2b-1a runs was off by up to 4.84%); H is exact.",
    "B1c rows are outcome-conditioned (the s1b limits).",
    "H's season-layer alpha is inherited at its grid top; the weekly context alpha is chosen by leave-one-season-out over a grid that includes 'off'.",
    "In folds with one training season (2019) H carries no context term by construction (alpha = 'off' by default: the adjustment cannot be validated).",
    "Form-sum weeks outside the weekly universe count as evidence but are never scored.",
    "Positions are a static 2026 capture.",
    "No feature is asserted to equal an app factor.",
    "After registration `registry.require(·, 2025)` no longer holds 2025 by itself; `weekly_data.guard` and LP-2b-2's marker do (flag 17).",
    "The tables (arms, cohorts, rest-of-season, probabilities against persistence) come in LP-2b-1c.",
]


def _alpha(a):
    """alpha as recorded: None (no context, `hContext: False`) -> "—", the string "off" -> "off", a number -> %g."""
    return "—" if a is None else (a if isinstance(a, str) else "%g" % a)


def _status(pos):
    return "labelled" if pos in LABELLED else "report-only (Anton, 2026-11-16)"


def _par(pos, cand, res):
    c = res[cand][pos]
    head = "%s · %s%s" % (pos, cand.upper(), "" if pos in LABELLED else " — report-only")
    parts = []
    for b in ("STD", "B1c"):
        x = c.get(b)
        if x:
            parts.append("against %s: %+.2f points per week (%+.1f%% on %d rows; CI [%.2f, %.2f]) — %s, %s" % (
                BENCH_TXT[b], x["d"]["value"], -100 * x["pct"] if x["pct"] is not None else float("nan"), x["n"], x["d"]["ci"][0], x["d"]["ci"][1], x["label"], UNCONFIRMED_W))
    return "- **%s.** Conditional MAE difference (candidate minus benchmark; negative is better), relevant played rows: " % head + "; ".join(parts) + "."


def label_lines(res):
    """The label table and the gate line (what `build_verdict` prints for sections 2-3)."""
    rows = []
    for pos in POSITIONS:
        for cand in CANDS:
            c = res[cand].get(pos)
            if not c:
                continue
            for b in ("STD", "B1c"):
                x = c.get(b)
                if x:
                    rows.append([pos, cand.upper(), b, x["n"], fm(x["benchMae"]), fm(x["candMae"]), fm(x["d"]), "%.1f%%" % (100 * x["pct"]), fm(x["dSpearman"], 3), x["label"], _status(pos)])
    L = table(["pos", "cand", "bench", "n", "bench MAE", "cand MAE", "d = cand − bench", "improvement", "Δ Spearman", "label (%s)" % UNCONFIRMED_W, "status"], rows)
    L += [""]
    for cand in CANDS:
        lp = res[cand].get("labelledPass", {})
        L.append("- %s: RB and WR (the labelled positions) pass: %s." % (cand.upper(), ", ".join("%s %s" % (p, "yes" if v else "no") for p, v in lp.items()) or "—"))
    for cand in CANDS:
        L.append("- overall weekly gate (3 of 4) for %s: %s — %s." % (cand.upper(), "passes" if res[cand]["gate"] else "fails", GATE_NOTE))
    return L


def build_verdict(res, ctx):
    smoke = ctx.get("mode") == "smoke"
    L = ["# LP-2b-1b — learned models, weekly layer, development folds (%s)%s" % (ctx["date"], " — SMOKE" if smoke else ""), ""]
    L.append("Offline research; nothing here ships. Task file: `.claude/tasks/learned-projection-2b1b-weekly-models.md`. Two candidates — **H** and **G** — forecast each week's "
             "points if he plays and the chance he plays, registered before any 2019–2024 weekly score existed. Folds evaluated: %s. **The 2025 fold is held: every label below "
             "is %s.**" % (", ".join(map(str, res["folds"])), UNCONFIRMED_W))
    L += ["", "## 1. The progression rule (Anton, %s — before any weekly or 2025 result)" % RULE_DATE, "", "> " + RULE_TEXT, "", CTX_RULING, ""]
    L += ["## 2. Per position and candidate", ""]
    for pos in POSITIONS:
        for cand in CANDS:
            if pos in res[cand]:
                L.append(_par(pos, cand, res))
    L += ["", "## 3. Label table (LP-1a §8, `lp/metrics.py` unchanged) and the gate line", ""] + label_lines(res)
    L += ["", "## 4. Fit facts", ""]
    rows = []
    for cand in CANDS:
        for T, byp in sorted(ctx.get("fit", {}).get(cand, {}).items()):
            for pos in POSITIONS:
                f = byp.get(pos)
                if f:
                    tg = "; ".join("%s k=%.3g ρ=%g α=%s" % (t, v["kGames"], v["rho"], _alpha(v["alpha"])) for t, v in f["targets"].items()) if cand == "h" else "—"
                    rows.append([cand.upper(), T, pos, f["rows"], f["noPriorRows"], "%.3f" % f["cW"], "%g" % f["phi"], "%.0fs" % f.get("seconds", 0.0), tg])
    L += table(["cand", "T", "pos", "rows", "noPrior rows", "c_w", "φ", "time", "H: k (games), ρ, α per target"], rows) if rows else ["(none in this mode)"]
    L += ["", "## 5. Registration, data and run facts (hashes only)", ""]
    for k, v in ctx.get("hashes", []):
        L.append("- **%s:** %s" % (k, v))
    L += ["", "## 6. Times, versions, threads", ""]
    for k, v in ctx.get("run", []):
        L.append("- **%s:** %s" % (k, v))
    L += ["", "## 7. LP-1a §8 (verbatim) — pinned hash `%s`" % ctx["prereg"], "", "```", ctx["section8"].rstrip(), "```", "", "## 8. Limits", ""]
    L += ["- " + t for t in LIMITS]
    return "\n".join(L) + "\n"
