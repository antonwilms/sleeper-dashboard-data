"""LP-2b-1c-i (§9): the report markdown. Report-only: no label, no gate, every arm and band printed exploratory with its spec hash; the file prints hashes, never a
commit id of its own. Section 0 ("Answers for Anton") is written by Session 2 from the §0a lines this module prints; the runner leaves it a marked placeholder."""
from .analysis_w import BANDS, EXPLORATORY, POSITIONS
from .report import fm, table

# Anton's ruling of 2026-11-19, item 1 (verbatim; T-C-9 compares it with the task file).
RULING_31 = ("1. Split approved: 1c-i as proposed (incl. H vs B1c by week band), 1c-ii outline only, planned after 1c-i is verified. Both override-speed routes approved. "
             "(b) conditions: every output labelled exploratory with its own spec hash, never a candidate; nothing from it feeds a label, gate or LP-2b-2; if a widened H clearly "
             "beats the registered H, report it as a finding for Anton, no substitution. Addition to 1c-i: from the cached season-layer fits (no refit), report the training-error "
             "surface at the season α / k-multiple / δ grid edges, i.e. how much error was still falling at the edge, per position. If it is still clearly falling at RB or WR, flag "
             "it as a stop for Anton before LP-2b-2 is planned. Write the 1c-i task file, set the review depth, run plan-reviewer, report flags with triage.")
PLACEHOLDER = "(Section 0 is written by Session 2 from the §0a lines below, after the run.)"
LIMITS = [
    "Everything here is report-only: no label, no gate, no candidate, and the 2025 season is held.",
    "Arm numbers are on the development folds the registered fits were evaluated on, so a setting chosen from them has been selected on them; this is not clean evidence.",
    "Route (a) keeps every context term as fitted at s = 1 on the counted targets; only the evidence weight k changes.",
    "The season layer's α / k-multiple / δ training-error surfaces are not recorded (no season fits cache; `model_h.fit_target` keeps only the argmin) — only the λ surface is.",
    "B1c rows are outcome-conditioned (the s1b limits).",
    "Fold 2019 has one training season: H carries no context term there by construction (α defaults, not fitted).",
    "No G model was fitted in this slice; G's numbers are the cached 2b-1b predictions.",
    "The LP-2b-1b limits apply (G is reproducible only approximately; positions are a static 2026 capture; form-sum weeks outside the weekly universe count as evidence but are never scored).",
]


def _pc(x):
    return "—" if x is None else "%.1f%%" % (100 * x)


def _cell(r):
    if r is None:
        return "—"
    return "%s (%s; n %d)" % (fm(r["d"], 3), _pc(r["pct"]), r["n"])


def _edge_tables(ge):
    L = []
    rows = []
    for s in ge["shares"]:
        if s["setting"] in ("era", "g"):
            continue
        rows.append([s["cand"].upper(), s["layer"], s["setting"], s["pos"], s["cells"], s["defaultCells"], ", ".join("%s %.0f%%" % (k, 100 * v) for k, v in sorted(s["share"].items()))])
    L += table(["cand", "layer", "setting", "pos", "fitted cells", "default cells", "class shares"], rows)
    key = [k for k in ge if k.startswith("atEdgeIn")][0]
    L += ["", "Targets (or position-level settings) at an edge in at least four folds (%s):" % key, ""]
    L += table(["cand", "layer", "setting", "pos", "target", "folds", "ends"], [[x["cand"].upper(), x["layer"], x["setting"], x["pos"], x["target"] or "—", x["folds"], "/".join(x["ends"])] for x in ge[key]]) if ge[key] else ["(none)"]
    L += ["", ge["gNote"] + "."]
    return L


def _arm_tables(arms):
    L = []
    for name, a in arms.items():
        L += ["", "### %s — %s" % (name, EXPLORATORY), "", "- spec SHA-256: `%s`; arm SHA-256: `%s`" % (a.get("specSha256"), a.get("armSha256")), "- %s" % a.get("what", "")]
        if a.get("cohortCounts"):
            L.append("- targets keeping a context term (fitted at s = 1), by fold and position: %s" % "; ".join("%s: %s" % (T, v) for T, v in sorted(a["cohortCounts"].items())))
        if a.get("aboveTop") is not None:
            L.append("- targets choosing a kMult above 32, by fold: %s" % "; ".join("%s: %s" % (T, v) for T, v in sorted(a["aboveTop"].items())))
        rows = []
        for P in POSITIONS:
            rows.append([P, _cell(a["vsH"].get(P)), _cell(a["vsB1c"].get(P)), _cell(a["vsSTD"].get(P))])
        L += [""] + table(["pos", "vs registered H (d = arm − H)", "vs B1c", "vs STD"], rows)
    return L


def build_report(res, ctx):
    L = ["# LP-2b-1c-i — why the weekly layer ties B1c (%s) — report-only" % ctx["date"], ""]
    L.append("Offline research; nothing here ships and nothing is registered, labelled or gated. Task file: `.claude/tasks/learned-projection-2b1c1-weekly-analyses.md`. "
             "Folds evaluated: %s. **The 2025 season is held and appears in no frame.** Every arm and band below is *%s*." % (", ".join(map(str, res["folds"])), EXPLORATORY))
    L += ["", "## 0. Answers for Anton", "", PLACEHOLDER, "", "### 0a. Rule outcomes (printed by the runner; mechanical)", "", "```"] + res["rules"] + ["```", ""]
    L += ["## 1. The rulings (Anton, 2026-11-19, verbatim)", "", "> " + RULING_31, ""]
    L += ["## 2. Grid edges (§5)", ""] + _edge_tables(res["gridEdges"])
    ws = res["weeklySurface"]["medians"]
    L += ["", "## 3. Error surfaces at the edges (§6)", "", "### 3.1 Weekly H: last-step SSE drop at an edge (median over target-folds; report-only)", ""]
    L += table(["pos", "axis", "end", "target-folds", "median drop", "min", "max"], [[m["pos"], m["axis"], m["end"], m["n"], "%.4f" % m["median"], "%.4f" % m["min"], "%.4f" % m["max"]] for m in ws]) if ws else ["(no weekly edge)"]
    L += ["", "### 3.2 Season layer: λ surface at the chosen (era, g) — drop = (MAE at the next lower λ − MAE at the edge) / MAE at the edge", ""]
    rows = []
    for x in res["seasonRS"]:
        rows.append([x["pos"], x["cand"].upper(), "%d / %d" % (x["foldsEdgeAndFalling"], x["folds"]), "—" if x["meanDrop"] is None else "%.3f%%" % (100 * x["meanDrop"]), "yes" if x["holds"] else "no"])
    L += table(["pos", "cand", "folds at the edge and falling", "mean drop there", "R-S holds"], rows)
    L += ["", "Fold detail:", ""]
    L += table(["cand", "pos", "T", "era", "g", "λ", "at the edge", "drop"], [[r["cand"].upper(), r["pos"], r["T"], r["era"], r["g"] or "—", r["lam"], "yes" if r["edgeChosen"] else "no", "—" if r["drop"] is None else "%.3f%%" % (100 * r["drop"])] for r in res["seasonSurface"]])
    L += ["", "α / k-multiple / δ: " + res["f4"], ""]
    L += ["## 4. Override speeds (§7)", "", "### 4.1 H's kGames per target (median and range over folds) beside the app's constants; the share at the 32 edge cuts the range off", ""]
    L += table(["pos", "target", "class", "median kGames", "range", "at 32", "app K_ROS_POINTS", "app K_ROS_OPP"],
               [[o["pos"], o["target"], o["class"], "%.2f" % o["median"], "%.2f–%.2f" % (o["min"], o["max"]), "%d of %d" % (o["atTop"], o["folds"]), o["appKRosPoints"], o["appKRosOpp"]] for o in res["overrideTargets"]])
    L += ["", "### 4.2 Points-level evidence weight per (position, n): λ_H (registered H; its context ridge still reads the week-w to-date columns at origin 0, so it understates H's total response to the season so far), "
          "λ_H,nc (the shrinkage path alone — the headline override speed), λ_B1 (analytic, B1's n/(n+k) over plain rows)", ""]
    L += table(["pos", "n", "rows", "players", "λ_H", "λ_H,nc", "λ_B1", "B1 rows", "B1 excluded share", "B1 population share"],
               [[o["pos"], o["n"], o["rows"], o["players"], ("INSUFFICIENT" if o["status"] != "ok" else "%.3f" % o["lambdaH"]), ("INSUFFICIENT" if o["status"] != "ok" else "%.3f" % o["lambdaHnc"]),
                 "—" if o["lambdaB1"] is None else "%.3f" % o["lambdaB1"], o["b1Rows"], _pc(o["b1ExcludedShare"]), ", ".join("%s %.0f%%" % (k, 100 * v) for k, v in sorted(o["population"].items()))]
                for o in res["overrideLevels"]])
    qb = [o["b1ExcludedShare"] for o in res["overrideLevels"] if o["pos"] == "QB" and o["b1ExcludedShare"] is not None]
    L += ["", "QB note: B1's start-chain states (preseason, starter, backup) are excluded from λ_B1 whatever `liveChain` is; the mean excluded share over the QB cells is %s." % (_pc(sum(qb) / len(qb)) if qb else "—")]
    L += ["", "## 5. H and G against STD and B1c (§8.1) — %s" % EXPLORATORY, "", "### 5.1 By week band (origin n = w − 1)", ""]
    rows = []
    for band in BANDS:
        for cand in ("h", "g"):
            for bench in ("STD", "B1c"):
                byp = res["bands"][band][cand][bench]
                rows.append([band, cand.upper(), bench] + [_cell(byp.get(P)) for P in POSITIONS])
    L += table(["band", "cand", "bench"] + list(POSITIONS), rows)
    L += ["", "### 5.2 All bands: per-fold d and drift, and H − G", ""]
    rows = []
    for cand in ("h", "g"):
        for bench in ("STD", "B1c"):
            for P in POSITIONS:
                r = res["folds5"][cand][bench].get(P)
                if r:
                    rows.append([cand.upper(), bench, P, _cell(r)] + ["%+.3f" % r["perFold"][str(T)]["d"] for T in res["folds"]] + [("%+.4f [%+.4f, %+.4f]" % (r["drift"]["slope"], *r["drift"]["ci"])) if r["drift"] else "—"])
    for P in POSITIONS:
        r = res["hMinusG"].get(P)
        if r:
            rows.append(["H − G", "(a = H, b = G)", P, _cell(r)] + ["%+.3f" % r["perFold"][str(T)]["d"] for T in res["folds"]] + [("%+.4f [%+.4f, %+.4f]" % (r["drift"]["slope"], *r["drift"]["ci"])) if r["drift"] else "—"])
    L += table(["cand", "bench", "pos", "pooled d [CI] (improvement; n)"] + ["d %s" % T for T in res["folds"]] + ["drift of d per season"], rows)
    L += ["", "## 6. Exploratory H arms (§8.2) — %s" % EXPLORATORY] + _arm_tables(res["arms"])
    L += ["", "## 7. Checks, hashes, times, versions, threads", ""]
    for k, v in ctx.get("hashes", []):
        L.append("- **%s:** %s" % (k, v))
    for k, v in ctx.get("run", []):
        L.append("- **%s:** %s" % (k, v))
    L += ["", "## 8. Limits", ""] + ["- " + t for t in LIMITS]
    return "\n".join(L) + "\n"
