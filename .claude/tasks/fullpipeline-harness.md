# D6 — full-pipeline retrospective harness

**Model:** sonnet implements this file exactly. **Status:** planned (opus, 2026-09-06), **rewritten after plan-reviewer**. **Slice:** D6, Arc B. **Repo:** data only.
**Base:** `684a638` on `main`. **Plan gate:** plan-reviewer run 2026-09-06, sixteen flags. **Two were fatal to the first draft's design** — it built on a registry nothing reads, and assumed a 2013–2025 panel the position sources cannot currently produce. This file is the rewrite, not a patch.
**Precedent:** `.claude/tasks/r3fit-exponent-harness.md`, `r3fit-ordering.md`, `r3fit-panel-scale-fix.md`. Read all three first.
**Dependencies, all landed:** D2, D4, D5.

**Goal.** Grade the veteran pipeline **as shipped, all thirteen steps**, on one pinned basis, rookies in a separate panel — producing calibration constants and factor verdicts instead of waiting for January 2027.

**Not in this slice.** Activating anything in the app, and changing any served family.

---

## Step 0 — verified against live source, 2026-09-06

**The panel reconstructs seven factors today**: `momentum`, `regression`, `trajectory`, `shareTrend`, `snapShare`, `rzUsage`, `teamRzShare`, plus `reconstructBasePPG`.

**Port sources, all located.** `findCareerComps` lives in `careerComps.js`, not `compsIntegration.js`, so Step 9 is a two-file port: `computeCompBlend` (66 lines) plus `findCareerComps`/`compsProjectedPPG` (128). Age is `computeEmpiricalAgeCurves` in `dynastyScore.js` plus `ageCurve.js` (25). Efficiency is `efficiencyMetrics.js` (185). Team offense and QB1 quality are `computeTeamContext` and `computeQBQualityByTeam` in `teamContext.js`. Depth needs no port; it reads D5.

**The basis claim holds.** `grading/2026-08-09-r3fit-verdict.md:225` states in its own words that the E-0a baseline runs a different basis and attribution "so its MAEs are not directly comparable".

### Findings that change the slice

**1. `FACTOR_RECONSTRUCTORS` is not an extension point, and the first draft was built on the belief that it is.** Its only references are its own definition (`lib/projectionFactors.mjs:331`) and one test assertion (`test/panel-fit.test.mjs:707-711`). **Nothing in production reads it.** The live wiring is `FULL_FACTORS[position]` plus a hand-written `if (fullFactors.includes(...))` chain in `attachFactorMultipliers` (`lib/panel.mjs:1105-1163`), each branch doing its own input extraction, `sentinelHit` bookkeeping and `fitCoverage` counting.

So each of the six costs a branch, its inputs threaded into `attachFactorMultipliers`' `ctx` — which today carries only totals, teamTotals, ppg, advstats and roster, so **no depth, no birthdate, no college** — plus a `FULL_FACTORS` entry and a sentinel rule. Update the registry too, but as documentation and to keep its test honest, not as the mechanism.

**2. A 2013–2025 panel cannot resolve positions today, and the failure is silent.** `resolvePosition` (`lib/panel.mjs:107-113`) reads advstats first, then roster. `nflverse/roster/` starts at **2016**, and advstats carries only WR/TE/RB — 2013 has `{WR:174, TE:107, RB:118}` and **no QB at all**. `readJson` returns null on a missing file rather than throwing, so 2013–2015 would drop every QB into the `UNK` bucket and truncate the other three positions to the ~400 players advstats covers, with no error anywhere.

**Fix, and it is small: add the crosswalk as a third fallback.** `nflverse/playerids.json`'s `ids` map carries `position` alongside `sleeperId`, giving **2,709 skill players** keyed by Sleeper id, season-independent. It is already loaded for the age curve. D5's depth family is a viable second source (2013 gives QB 85, RB 117, WR 176, TE 115) but is per-season and narrower; prefer the crosswalk and keep depth as a cross-check. **Add a test asserting a 2013 QB resolves**, because the current failure mode is a silent bucket, not an exception.

**3. D4 is not wired, so `snapShare` is neutral for every pre-2020 row.** `DEFAULT_LOAD.loadSnapShare` is still `null`. Widening is the three-edit change D4's own plan documented: re-point that loader at `nflverse/snaps/<year>.json`, flip `PANEL_DEFAULTS.fromYear` from 2020 to 2013, and revisit the pre-2020-undroppable assertions at `lib/backtest.mjs:290` and `bin/backtest.mjs:119`. **All three belong in D6a**, and the cross-validation that gates them already passed at r ≥ 0.998 per position. Without this the harness grades a factor that is structurally 1.0 across two-thirds of its own panel.

**4. Two factors have no data for most of the panel, which would make the ablation lie.** `README.md:121` records that `rec_rz_tgt`, `rush_rz_att` and `pass_rz_att` appear from ~2021, so `rzUsage` and `teamRzShare` sentinel to 1.0 across roughly two-thirds of a 2013–2025 panel. §E's ablation would then report both as prune candidates because they are **structurally neutral**, not because they lack signal. **Every factor gets an explicit eligible-year window, and the ablation reports within it.** A verdict that prunes a factor on absent data is worse than no verdict.

**5. The basis pin and the parity gate cannot both be naive.** `snapshots/2026-09-05.json` and the pinned `2026-07-05` both carry `scoringBasis: "custom"`. Three of the six new factors are PPG-denominated and therefore basis-dependent. **The parity fixture stays in-basis while the fit stays `half_ppr`** — state that explicitly, or the implementer meets a universal mismatch and loosens the tolerance until the gate is decorative.

**6. The parity test runs off committed fixtures and self-skips when they are absent.** T-F10 reads four files under `test/fixtures/r3fit-parity-2025/`, not `snapshots/<date>.json`. Retargeting means **building a new fixture set**, and a missing set leaves the gate green and silent. **Assert fixture presence explicitly** so absence fails rather than skips.

**7. The attribution instruction in the first draft was wrong, and the README is why.** It said the app pins current-team. CR-02's Mirror states per-season `team` has been scoring-load-bearing in the app since the R2 flip, via `resolveAttributedTeam`, consumed inside `computeTeamContext`'s own loops — the exact function Step 7 ports. `README.md:2022` still says otherwise and is **stale against the registry**, which is the authority. **Use per-season-team**, matching R3-FIT's own `attribution: 'per-season-team'`, or Step 7 is reconstructed under the older rule and comparability with R3-FIT breaks.

**8. The age curve needs a stated missing-birthdate policy.** Birthdate resolves for only **79–84%** of gp ≥ 8 rows across 2013–2025. Whether a missing age is a neutral 1.0 (the documented convention — sentinels are never drops) or a listwise drop changes both panel size and the calibration constant. **Choose neutral, matching the convention, and record the coverage rate per year in the verdict.**

**9. The rookie panel's bound is worse than the first draft claimed.** KTC is neutral before 2026-05-18, and `college/` starts at **2017**, so for classes whose college seasons precede 2017 the college term is neutral too — **three of five inputs, not four**, for roughly 2013–2017. A finding whose purpose is honesty about what the panel measures must not itself overstate coverage.

**10. The repo has no leave-one-year-out builder, and asking for one contradicts this file's own leakage rule.** The only fold builder is `forwardChainFolds` (`lib/panel.mjs:410-419`), expanding-window: `trainYears = sorted.slice(0, i)`. LOYO would put years *after* the eval year into training, which is precisely what §A forbids for the age curve and comp blend, and would yield a constant the app could not have used at the time. **Use `forwardChainFolds`.** Delete the phrase "leave-one-year-out".

**11. Step 8's justification answers leakage but not fidelity.** A Y+1 week-1 chart is post-camp, post-cuts and post-preseason-injury; the app projects in the offseason off the then-current chart. That is **strictly more information than shipped**, and it biases the constant optimistically. Record it as a fidelity deviation in the same comment, distinct from the leakage argument. Also: 2017 week 1 has only 30 teams, and there are 1,278 nulls in the position arrays across 2013–2025, 150 of them at depth 1 — so Step 8 needs a **missing-team → neutral** rule beside the null rule.

---

## Design

### A. The six reconstructions — [D6a]

Per finding 1, each is a branch in `attachFactorMultipliers` with its inputs threaded into `ctx`, a `FULL_FACTORS` entry, a sentinel rule and a `fitCoverage` counter — plus a registry entry for documentation. Port the app's arithmetic exactly; where the app reads state the panel cannot see, state the deviation in the branch's own comment.

- **Age (Step 2)** — `computeEmpiricalAgeCurves` + `ageCurve.js`. Age from D2 `birthdate`, missing → neutral per finding 8. **Curves built per predictor year from ≤ Y data only.**
- **Depth (Step 8)** — D5, per findings 11 and the null rule: `null` is unknown → neutral, never re-indexed; a missing team is neutral. `depthPositions` carries the legacy per-slot grain; do not compare eras' ordinals as one measurement.
- **Team offense (Step 7)** — `computeTeamContext` rank, **per-season-team attribution** per finding 7.
- **QB1 quality (Step 7b)** — D5 QB1 identity plus the app's PPG fallback. The dynasty-score branch is not reconstructable; the fallback is what the app itself uses when it is absent. Record the deviation.
- **Efficiency (Step 5e)** — `efficiencyMetrics.js`. Inputs are served season-totals keys.
- **Comp blend (Step 9)** — two-file port, computed against **≤ Y careers only**.

Also in D6a: finding 2's position fallback, and finding 3's three snap-widening edits.

### B. One basis — [D6a]

Pin `half_ppr` for every panel and verdict, with the parity carve-out in finding 5. Retire the `custom`-basis E-0a comparison or re-run it on `half_ppr`. Record the decision and its reason; see the Docs note on where.

### C. Parity — [D6a], and the gate on D6b

Extend T-F10 to every factor, building the new fixture set per finding 6 and asserting its presence. **Parity is the precondition for D6b.** CR-15 records a known parity gap for `shareTrend` and `teamRzShare`; `snapshots/2026-09-05.json` is post-2026-07-18 and carries 297 and 236 non-neutral values respectively across its 425 veteran rows, so this is the first chance to close it. Say whether it closed.

### D. Calibration outputs — [D6b]

Per position, over `forwardChainFolds` (finding 10), within each factor's eligible window (finding 4):

1. Median and mean `outcome / fullPipelinePPG`.
2. MAE of pipeline versus pipeline × c, c from 0.80 to 1.00 step 0.02.
3. Shrinkage sweep `anchor' = (1−k)·anchor + k·positionMean`, k in {0, 0.1, 0.2, 0.3}.
4. All of the above by qualifying-season count (1–2, 3–4, 5+) — already on the row.

### E. Verdicts — [D6b]

- **Step 4** — ΔMAE and ΔSpearman of removing the up-side (`outlierRatio < 0.85`) branches versus shipped, per position, plus the injury-gated variant.
- **Factor pruning** — per-factor ablation, each held at 1.0, **reported within its eligible window** and alongside the R3-FIT exponents. Report, do not act.
- **Rookie panel** — rookie-path rows in Y, predictor the reconstructed rookie projection subject to finding 9, outcome Y+1 PPG at gp ≥ 6. Report realised PPG by draft tier and position, ratio to projected, share hitting the 1.85 cap, and the top projected rookie's rank against where he finished.
- **Files** — `grading/<date>-fullpipeline-verdict.md` and `backtests/<date>-fullpipeline-panel.json`.

---

## Cross-repo impact

### CR-15 · R3-FIT factor-multiplier mirror — and this slice reverses its scope note

> **Mirror:** Re-mirror the changed constant/gate/branch and **re-fit before any further exponent activation** — otherwise the fit reconstructs a factor the app no longer produces and the committed verdict in `.claude/tasks/r3fit-exponent-harness.md` stops transporting. Which positions a factor is gated to is itself part of the mirror. Note the known parity gap: `shareTrend` and `teamRzShare` have no end-to-end app-ground-truth check until a post-2026-07-18 snapshot is imported. **Nothing app-side fails when this drifts.** Scope note, verified by grep so it need not be re-derived: `dynastyScore.js` is named in `lib/projectionFactors.mjs:110` only as a *contrast* (its `weightedLinearRegression` copy is unfloored where the mirrored one floors the denominator at 4) — it is **not** mirrored and is deliberately not a trigger.

This takes the mirror from seven factors to thirteen. **It is more than an extension:** the entry's own scope note says `dynastyScore.js` is *deliberately* not a trigger, and §A Step 2 ports `computeEmpiricalAgeCurves` out of it. `ageCurve.js`, `efficiencyMetrics.js`, `compsIntegration.js` and `careerComps.js` are likewise absent from its app side. That is five new app-side surfaces plus a reversed decision. **Say so plainly in the hand-back** rather than presenting it as a trigger-list top-up.

### CR-01 · Projection snapshot envelope

> **Mirror:** State the new envelope shape and whether the snapshot `schemaVersion` bumped. On a bump, `scripts/register-snapshots.mjs` expectations, `scripts/grade-snapshot.mjs` reads and the README snapshot section all need updating in the data repo. **`scoringSettings` has a second reader beyond grading** — `scripts/panel-run.mjs` `resolveScoring` pins the fit's basis from a committed snapshot, so dropping or renaming that envelope field breaks the R3-FIT path (CR-15) as well as in-basis grading. This snapshot `schemaVersion` is independent of `dataStore.js` `MAX_SUPPORTED_SCHEMA` (a ceiling on every family read through `tryDataStore`, not season-totals-scoped — snapshots have no `tryDataStore` reader in the first place). Additive `factors` keys (`isTeamChange`/`prevTeam`/`newTeam`/`depthStale`) do **not** bump the version.

§B touches basis resolution and §C reads the snapshot's `factors`. The Mirror is directly on point about `resolveScoring` being a second `scoringSettings` reader that pins the fit's basis.

### CR-14 · `calculateFantasyPoints` port

> **Mirror:** Any change to the scoring math must be ported to `lib/fantasyPoints.mjs` in the same cycle, or in-basis grades silently diverge from how the app actually scored — **and so does the R3-FIT panel** (CR-15), which builds its outcome column from the same port. **Nothing app-side fails when this drifts** — the divergence appears only as wrong grades and a wrong fit. Low churn (the dot-product is stable), which is exactly why the drift would go unnoticed. Note one deliberate asymmetry: `RATE_KEYS` (`lib/fantasyPoints.mjs:29`) is a data-side-only defensive guard excluding non-additive keys from the dot-product; it has **no app counterpart** and must not be "mirrored back" into the app.

§D's outcome column runs through this port, and §B's E-0a decision reaches `buildInBasisOutcomes`.

### CR-11 and CR-02 — read, not changed

> **CR-11 Mirror:** Do not remove, rename or filter these keys. **The projection degrades silently to neutral when they are absent** — no error, no test failure, no visible symptom. The blast radius is wider than the projection: `durabilitySignals` mis-classifies contributor seasons, `teamContext`'s RZ denominators go to zero (so `teamRzShare` sentinels out), the Outlook snap% column empties, and — since dp-v2 Slice 5b — Market's Efficiency `SNAP%`/`RZ SH` columns go blank the same way, and the data repo's own panel/backtest reconstructions drift the same way. The dependency is invisible at runtime; this registry entry is the only thing recording it.

> **CR-02 Mirror:** A version bump needs both repos. **Per-season `team` is scoring-load-bearing in the app since the R2 flip (2026-07-11)** — it feeds projection Steps 3/5h attribution via `resolveAttributedTeam`, so any edit to the `aggregateWeeks` dominant-team rule (most played weeks; ties → later stint; zero played → last seen; schedule-domain normalization) changes app projections **with no app-side diff**. Treat such edits as scoring changes and route them through a graded gate. Renaming the `TEAM_` pseudo-id scheme is breaking. **F-24 (2026-08-24), schemaVersion 3→4:** `idp_*`/`punt*` are dropped from every non-`TEAM_*` row's `stats` — a denylist, never an allowlist; CR-11/12/13/19's keys, kicking and `bonus_*` are unaffected, and no `schemaVersion` key is ever written into the season file itself (manifest-only). **D-1, same change, forward-only:** `aggregateWeeks` now also infers a single-team row's bye week(s) from the schedule and writes `'B'` into an `'X'` slot (history keeps `'X'`; a slot already `'D'` is left alone) — this **falsifies a written app-side assumption with no app-side diff**: `src/utils/availabilityGrid.js:4` states the served season-totals *"never emit `'B'`"*, and `src/utils/gameLog.js:130-160` already renders a `kind: 'bye'` row straight off served `weeklyStatus` — so forward seasons now produce real bye rows in `dp/GameLogSection.jsx` with no app-side code change at all. Correct the app comment in the same change.

No keys and no row composition change. **`[registry-stale]`, report only:** CR-02's near-side triggers omit `teamKeyResolver` (`lib/panel.mjs:63,66`) and `loadTeamLookup` (`scripts/panel-run.mjs:395-404`), and `scripts/panel-run.mjs` appears nowhere in its data-side list. Finding 7's attribution decision runs straight through the first of those.

### Do not touch the mirrored region

It is already three edits out of sync, queued in the parent folder's `PARKED.md`. **Emit CR-15's edit as hand-back output and add it to that entry.**

---

## Docs/README updates

- **The basis record** from §B. `grading/` is defined in CLAUDE.md as output from `--write`, and Invariant 3's exception is scoped to `<date>-*-verdict.md` reports, so an undated hand-authored policy file does not belong there as written. **Put it with the task files, or state the extension of the exception explicitly in the same change.**
- **`README.md:2022`** — stale attribution claim, per finding 7. Correct it.
- **`README.md:121`** — already correct on rz-key coverage; cite it in the catalog note for finding 4.

## Tests to add

**[D6a]** Per-factor parity with an explicit fixture-presence assertion (findings 5, 6). Leakage guards for the age curve and comp blend: **shift Y and assert the curve changes**. A 2013 QB resolves to `QB` (finding 2). A `null` at depth 1 yields neutral and never promotes index 1; a missing team yields neutral (finding 11). Basis pin.

**[D6b]** Rookie panel assembly. Ablation symmetry: holding an already-neutral factor at 1.0 reproduces the shipped number. Eligible-window enforcement: a factor is not reported outside its window (finding 4).

## Risks

- **Parity is the whole slice**, which is why D6b is gated on it.
- **Four of the six new factors depend on data with narrower coverage than the panel.** Findings 2, 3, 4, 8 and 9 are all the same shape: a factor that looks computed but is structurally neutral for part of the window. Every one needs its coverage stated in the verdict.
- **Do not activate anything.** No app change, no served-family change, no factor pruned on this run.
