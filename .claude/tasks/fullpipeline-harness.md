# D6 — full-pipeline retrospective harness

**Model:** sonnet implements this file exactly. **Status:** planned (opus, 2026-09-06). **Slice:** D6, Arc B of the stellar-data batch. **Repo:** data only.
**Base:** `d188b2a` on `main`. **Plan gate:** plan-reviewer has not run on this file yet.
**Precedent:** `.claude/tasks/r3fit-exponent-harness.md`, `r3fit-ordering.md`, `r3fit-panel-scale-fix.md`. Read all three before starting — this file assumes their conventions rather than restating them.
**Dependencies, all landed:** D2 (crosswalk v2 — `birthdate`, draft capital), D4 (`nflverse/snaps` 2013–2025), D5 (`nflverse/depth` 2013–2025 with `week1Qb1` and `qb1Changed`).

**Goal.** Grade the veteran pipeline **as shipped, all thirteen steps, on 2013–2025**, one pinned basis, rookies in a separate panel. The output is the calibration constants and factor verdicts the analysis needs, instead of waiting for January 2027.

**Not in this slice.** Activating anything in the app, and changing any served family. Constants and verdicts are inputs to the calibration arc, not changes to it.

---

## Step 0 — verified against live source, 2026-09-06

**The panel reconstructs seven factors today**, registered in `FACTOR_RECONSTRUCTORS` (`lib/projectionFactors.mjs`): `momentum`, `regression`, `trajectory`, `shareTrend`, `snapShare`, `rzUsage`, `teamRzShare`, plus `reconstructBasePPG` as the anchor. The registry comment calls itself "the single extension point", so the six additions go there rather than into new plumbing.

**All six port sources exist and were located.** The brief names `findCareerComps`, which is not in `compsIntegration.js` — it lives in `careerComps.js` and is imported from there, so Step 9 is a **two-file** port, not one:

| step | factor | app-side source | size |
|---|---|---|---|
| 2 | age curve | `computeEmpiricalAgeCurves` in `src/utils/dynastyScore.js` + `src/utils/ageCurve.js` | 25 lines for the curve module |
| 5e | efficiency | `src/utils/efficiencyMetrics.js` | 185 |
| 7 | team offense | `computeTeamContext` in `src/utils/teamContext.js` | — |
| 7b | QB1 quality | `computeQBQualityByTeam`, same file | — |
| 8 | depth | no port; reads D5's served family | — |
| 9 | comp blend | `computeCompBlend` in `src/utils/compsIntegration.js` **and** `findCareerComps`/`compsProjectedPPG` in `src/utils/careerComps.js` | 66 + 128 |

**The basis problem is already documented in this repo, so item 2 is confirmed rather than speculative.** `grading/2026-08-09-r3fit-verdict.md` says in its own words that the E-0a baseline "runs a different basis (custom) and attribution (current-team), so its MAEs are not directly comparable to this fit's arms". R3-FIT ran `half_ppr` with per-season-team attribution. Pinning `half_ppr` therefore aligns with the newer of the two, not against both.

**`grading/anchor-policy.md` does not exist.** `.claude/tasks/anchor-policy.md` does, and is a task file rather than a policy record. The brief asks for the basis decision to live in the former, so this slice creates it.

**Two things the panel already has, which change what must be built.** Season-blocked evaluation exists (`trainYears` versus a single `evalYear`), as does a training-only standardization and imputation guard described in its own comment as the leakage guard. And `qualifyingSeasons` is already computed per row, which is the confidence-tier input item 3(d) needs. None of that has to be invented.

### Findings that change the slice

**1. This is two slices, not one, and the split is not arbitrary.** The brief says "1–2 slices; the reconstruction of six steps is the bulk". Split on the seam the work already has:

- **D6a — reconstruction.** The six factors into `FACTOR_RECONSTRUCTORS`, the basis pin, parity against the snapshot, and the leakage tests. Nothing is graded; the deliverable is a panel that computes all thirteen steps and agrees with the app.
- **D6b — verdicts.** The calibration sweeps, the Step 4 verdict, factor ablation, the rookie panel, and the verdict file.

The reason to split here rather than anywhere else: **D6b's numbers are worthless if D6a's parity is wrong**, and parity is checkable on its own. Landing them together means a reviewer has to judge six ports and six statistical outputs in one diff, and the failure mode is a calibration constant derived from a subtly wrong reconstruction. Everything below is marked **[D6a]** or **[D6b]**.

**2. Step 8 reads a year the app does not have, and it must be stated rather than assumed.** D5 established there is no preseason in the source at all, so "week 1 of Y+1 preseason" cannot be built. The available analogue is **Y+1 week 1 REG**. That is not leakage relative to the outcome — the app projects during the offseason using the then-current chart, and a week-1 chart is known before any Y+1 game is played — but it *looks* like leakage and will be challenged. Write the justification into the code, not just the task file.

**3. The served depth arrays contain `null`, and the wrong reading silently promotes a backup.** D5 preserves an unresolved id as `null` at its original index precisely so the depth-1 slot stays true. Step 8's reconstruction must treat `null` as **unknown → neutral multiplier**, never as "no one", and must never re-index around it. The served block also carries `depthPositions`, the legacy per-slot grain, because legacy ranks within the slot while the ESPN era ranks within the position — do not compare the two eras' ordinals as if they were the same measurement.

**4. The rookie panel is bounded by KTC's absence, and the bound is most of its history.** KTC is ephemeral before 2026-05-18, so the brief holds it at 1.0. For 2013–2024 the rookie panel therefore grades baseline × age × college × draft with the market term neutral — four of five inputs. Say so in the verdict rather than presenting it as a full reconstruction, because the headline question it answers, whether the top rookie can outrank every veteran, is exactly the case where the market term would have mattered most.

---

## Design

### A. The six reconstructions — [D6a]

Each goes into `FACTOR_RECONSTRUCTORS` with its `positions` and `kind`, matching the seven already there. Port the app's arithmetic exactly; where the app reads state the panel cannot see, state the deviation in the function's own comment.

- **Age (Step 2).** Port `computeEmpiricalAgeCurves` plus `ageCurve.js` interpolation. Age at season comes from D2's `birthdate`. **Build the curves per predictor year from ≤ Y data only.** This is the leakage rule that matters most here: a curve fitted on all seasons and applied to 2014 knows the future.
- **Depth (Step 8).** From D5, per finding 2 and 3. Reconstruct the staleness guard as the app documents it.
- **Team offense (Step 7).** Port `computeTeamContext`'s rank from season-totals. The app pins current-team attribution here; the panel's default is per-season-team. **Follow the app, and say so** — the point is to grade what ships.
- **QB1 quality (Step 7b).** D5's QB1 identity plus the app's PPG fallback path. `computeQBQualityByTeam`'s dynasty-score branch is not reconstructable; use the fallback, which is what the app itself uses when the branch is absent, and record the deviation.
- **Efficiency (Step 5e).** Port `computeEfficiencyFactor`. Every input is a season-totals key already served.
- **Comp blend (Step 9).** Two-file port per Step 0. Compute against **≤ Y careers only** — the same leakage rule as the age curve, and the same test shape.

### B. One basis — [D6a]

Pin `half_ppr` for every panel and verdict. Either retire the `custom`-basis E-0a comparison or re-run it on `half_ppr`; do not leave two baselines whose MAEs cannot be compared, which is the state the R3-FIT verdict already complains about. Record the decision and its reason in a new `grading/anchor-policy.md`.

### C. Parity — [D6a], and the gate on D6b

Extend the T-F10 parity test to **every** factor against `snapshots/2026-09-05.json`, the first snapshot with the rookie path running as documented. For veterans any post-2026-07-18 snapshot is valid. **Parity is the precondition for D6b**: if a reconstructed factor does not agree with the app's own recorded value on the same player-season, the calibration built on it is not measuring the shipped pipeline.

### D. Calibration outputs — [D6b]

Per position, season-blocked leave-one-year-out over 2013–2024 predicting 2014–2025:

1. Median and mean of `outcome / fullPipelinePPG`.
2. MAE of pipeline versus pipeline × c, for c from 0.80 to 1.00 in steps of 0.02.
3. Shrinkage sweep `anchor' = (1−k)·anchor + k·positionMean`, k in {0, 0.1, 0.2, 0.3}.
4. All of the above split by qualifying-season count (1–2, 3–4, 5+), which is the confidence tier and is already on the row.

### E. Verdicts — [D6b]

- **Step 4.** ΔMAE and ΔSpearman from removing the up-side (`outlierRatio < 0.85`) branches versus shipped, per position, plus the injury-gated variant using `classifyInjurySeason` on the down year.
- **Factor pruning.** Per-factor ablation on the full stack: ΔMAE and ΔSpearman with each factor held at 1.0, reported next to the R3-FIT exponents. A factor whose removal improves both is a prune candidate. **Report, do not act.**
- **Rookie panel.** Rows are rookie-path players in Y. Predictor is the reconstructed rookie projection subject to finding 4. Outcome is Y+1 PPG at gp ≥ 6. Report realised PPG by draft tier and position, the ratio to projected, the share hitting the 1.85 cap, and the rank of the top projected rookie among all projected players that year against where he actually finished.
- **Files.** `grading/<date>-fullpipeline-verdict.md` in the R3-FIT format, and `backtests/<date>-fullpipeline-panel.json`.

---

## Cross-repo impact

### CR-15 · R3-FIT factor-multiplier mirror — the entry this slice is about

> **Mirror:** Re-mirror the changed constant/gate/branch and **re-fit before any further exponent activation** — otherwise the fit reconstructs a factor the app no longer produces and the committed verdict in `.claude/tasks/r3fit-exponent-harness.md` stops transporting. Which positions a factor is gated to is itself part of the mirror. Note the known parity gap: `shareTrend` and `teamRzShare` have no end-to-end app-ground-truth check until a post-2026-07-18 snapshot is imported. **Nothing app-side fails when this drifts.** Scope note, verified by grep so it need not be re-derived: `dynastyScore.js` is named in `lib/projectionFactors.mjs:110` only as a *contrast* (its `weightedLinearRegression` copy is unfloored where the mirrored one floors the denominator at 4) — it is **not** mirrored and is deliberately not a trigger.

This slice takes the mirror from seven factors to thirteen. Every ported reconstruction is a new mirrored surface, and the entry's warning is the operative one: nothing app-side fails when this drifts. **Extend the entry's own text to say the mirror now covers all thirteen steps**, and name each new reconstruction in the near-side triggers. The parity gate in §C is what keeps the claim honest.

Note the entry's known parity gap for `shareTrend` and `teamRzShare`. `snapshots/2026-09-05.json` is post-2026-07-18, so §C's extension is also the first opportunity to close it — do that, and say whether it closed.

### CR-11 · Snap & red-zone usage stat keys — read, not changed

> **Mirror:** Do not remove, rename or filter these keys. **The projection degrades silently to neutral when they are absent** — no error, no test failure, no visible symptom. The blast radius is wider than the projection: `durabilitySignals` mis-classifies contributor seasons, `teamContext`'s RZ denominators go to zero (so `teamRzShare` sentinels out), the Outlook snap% column empties, and — since dp-v2 Slice 5b — Market's Efficiency `SNAP%`/`RZ SH` columns go blank the same way, and the data repo's own panel/backtest reconstructions drift the same way. The dependency is invisible at runtime; this registry entry is the only thing recording it.

The reconstructions read these keys and change none of them. Record the conclusion.

### CR-02 · season-totals row composition — read, not changed

> **Mirror:** A version bump needs both repos. **Per-season `team` is scoring-load-bearing in the app since the R2 flip (2026-07-11)** — it feeds projection Steps 3/5h attribution via `resolveAttributedTeam`, so any edit to the `aggregateWeeks` dominant-team rule (most played weeks; ties → later stint; zero played → last seen; schedule-domain normalization) changes app projections **with no app-side diff**. Treat such edits as scoring changes and route them through a graded gate. Renaming the `TEAM_` pseudo-id scheme is breaking. **F-24 (2026-08-24), schemaVersion 3→4:** `idp_*`/`punt*` are dropped from every non-`TEAM_*` row's `stats` — a denylist, never an allowlist; CR-11/12/13/19's keys, kicking and `bonus_*` are unaffected, and no `schemaVersion` key is ever written into the season file itself (manifest-only). **D-1, same change, forward-only:** `aggregateWeeks` now also infers a single-team row's bye week(s) from the schedule and writes `'B'` into an `'X'` slot (history keeps `'X'`; a slot already `'D'` is left alone) — this **falsifies a written app-side assumption with no app-side diff**: `src/utils/availabilityGrid.js:4` states the served season-totals *"never emit `'B'`"*, and `src/utils/gameLog.js:130-160` already renders a `kind: 'bye'` row straight off served `weeklyStatus` — so forward seasons now produce real bye rows in `dp/GameLogSection.jsx` with no app-side code change at all. Correct the app comment in the same change.

Steps 5e and 7 read season-totals heavily. No row composition changes. Record the conclusion, and note that the current-team attribution choice in §A is an app-fidelity decision rather than a contract change.

### Registry drift — do not touch the mirrored region

The `CR-REGISTRY` region is **already three edits out of sync** with the app repo, recorded in the parent folder's `PARKED.md`. CR-15's text needs extending, which is a far-side-relevant change a data-repo session cannot mirror. **Emit the CR-15 edit as hand-back output and add it to the parked entry rather than writing it into the region.** That entry is now the queue for a parent-folder session.

---

## Docs/README updates

- **`grading/anchor-policy.md`** — new, per §B.
- **`data-catalog.md`** — no new served family; note the panel's new inputs if the catalog records harness inputs.
- **`.claude/tasks/data-repo-backlog.md`** does not exist in this repo; app-side asks go through the hand-back.

## Tests to add

**[D6a]** Parity per factor against the snapshot (§C). Leakage guards for the age curve and comp blend: **shift Y and assert the curve changes** — a test that passes with a leaked curve is worse than none. Basis pin. Null-handling in Step 8: a `null` at depth 1 yields a neutral multiplier and never promotes index 1.

**[D6b]** Rookie panel assembly. Ablation harness symmetry: holding a factor at 1.0 reproduces the shipped number when that factor is already 1.0 for every row.

## Risks

- **Parity is the whole slice.** A reconstruction that is subtly wrong produces a calibration constant that later changes scoring. This is why D6a lands first and D6b is gated on it.
- **The age curve and comp blend are the leakage-prone pair.** Both fit on history and both are easy to build once over all seasons. The test that shifts Y is the guard.
- **Do not activate anything.** The verdicts are inputs to the calibration arc. No app change, no served-family change, no factor pruned on the strength of this run.
