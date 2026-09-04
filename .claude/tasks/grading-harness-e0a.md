# E-0a — Committed grading baseline + standing-candidate audit (R1-HARNESS)

**Type:** Session-1 implementation plan (planning only — no source edited this session). Analysis-only: no served-asset shape change, no ingest change, no manifest schema change, no scoring change. This is the gate instrument (roadmap R1-HARNESS); it grades candidates, it activates nothing.
**Date:** 2026-07-06.
**Data HEAD at planning:** `733ef8425f1a803d3fd02130ed0a2374891499fd` ("snapshot: import 9 (2026-06-22…2026-07-05)") — local HEAD = `origin/main` tip, verified via GitHub MCP `list_commits` this session. Every line anchor below is grounded at this SHA.
**Substrate (reference, not re-derived):** app `projection-model-assessment.md` (§A.2 factor stack, §D candidates, §F1/F6 "never committed"), app `roadmap.md` (R1-HARNESS row, D-1/D-3), app `projection-reanchor-per-season-team.md` §7 (dual-mode gate semantics — NOT implemented here; see §9), data `README.md` → Analysis/Backtesting, `data-catalog.md`.

**Why this exists:** `backtests/` and `grading/` hold only `.gitkeep` at HEAD — no numeric grading verdict has ever been committed (assessment §F1/F3/F7). Every scoring-affecting downstream item (R3-FIT, R3-EFFACT, R3-KTCMOM, R2's flip gate) waits on this instrument. Deliverable = committed, reproducible artifacts: the feature→outcome panel, the fit/CV results, and a human-readable verdict on the two standing candidates (`air_yards_share` first, share-level anchor second), each graded for **incremental** held-out value over the reconstructable baseline feature set, per position.

**Hard constraints carried from the assessment:**
- Transparency-as-moat: the joint model is **ridge-regularized linear regression on standardized features** — legible per-feature coefficients. **No GBM, no black box** (GBM is a future offline challenger, explicitly out of E-0a).
- C4 aggregation discipline: every rate feature is recomputed from summed season components; never averaged from per-game values. (Season-totals `stats` are already season sums — ratios of those sums are C4-safe. Cross-season recency *weighting* of per-season PPGs is a deliberate feature definition mirroring app Step 1, not aggregation-of-convenience; within-season aggregation is where C4 bites.)
- View-only fences: `nflverse/gamelogs/` and `nflverse/teamcontext/` **must never feed grading** (both contracts say so verbatim in CLAUDE.md). The panel reads ONLY `nfl/season-totals/` (v3), `nflverse/advstats/`, `nflverse/roster/` (position lookup for QB), and one committed snapshot (scoring settings). It does not touch gamelogs/teamcontext/ktc.
- No activation: a CLEARS verdict does not wire anything into app scoring — activation is R3-EFFACT, app-side, separately gated.

---

## 0. Scope and non-goals

In scope: new three-layer harness (`lib/panel.mjs` pure → `scripts/panel-run.mjs` adapter → `bin/panel.mjs` CLI), two small additive edits to `lib/backtest.mjs`, one `package.json` script, tests, docs, and the three committed artifacts.

Non-goals (do not build):
- **Per-season-team attribution mode** and the before/after comparison run — that is R2-REANCHOR's activation slice (§9 names the seam it attaches to).
- **Fitted production weights / exponents** — R3-FIT. E-0a's ridge fit is a measuring instrument; its coefficients are never shipped.
- **QB EPA/CPOE candidates** — R1-EFF (no effstats family exists yet).
- **Uncertainty bands** — E-0b/R1-BANDS consumes this panel later.
- **Snapshot grading** — `bin/grade.mjs` is untouched.
- **Pseudo-projection reconstruction of the app's 13-step pipeline** — the baseline here is a compact reconstructable feature set (§2), not a port of `seasonProjection.js`.

---

## 1. Design overview

Mirrors the established grade/backtest split (CLAUDE.md navigation map):

| Layer | File | Role |
|---|---|---|
| Pure | `lib/panel.mjs` (new) | feature builders, folds, ridge CV, metrics, verdict logic — no I/O |
| Adapter | `scripts/panel-run.mjs` (new) | injectable loaders, panel assembly orchestration, report/artifact shapes, markdown verdict |
| CLI | `bin/panel.mjs` (new) | flag parsing, dispatch, `--write` |
| Shared stats | `lib/backtest.mjs` (edited) | `solveOLS` gains optional ridge; `rankTransform` + `spearman` added |

**Row grain:** one row per (player, predictor season Y), outcome = next-season (Y+1) fantasy PPG. Join predictor→outcome by `sleeper_id` only, never team (inherited from `buildInBasisOutcomes` / `scripts/grade-snapshot.mjs` — the grader's outcome-join approach, reused directly).

**Outcome basis (default: in-basis).** Outcomes AND all PPG-denominated features are computed through `lib/fantasyPoints.mjs` via the existing `buildInBasisOutcomes(seasonTotals, scoringSettings)` (`scripts/grade-snapshot.mjs:87`) — dot-product over season-total `stats`, RATE_KEYS excluded, droppedTerms reported. This is the sanctioned recompute path (data CLAUDE.md Invariant 8 clarification). `scoringSettings` come from a **pinned committed v2 snapshot**: `DEFAULT_SCORING_SNAPSHOT = '2026-07-05'` (`snapshots/2026-07-05.json`, `schemaVersion: 2`, carries verbatim `scoringSettings`), overridable via `--scoring-from`. A `--basis half_ppr` escape hatch uses `buildHalfPprOutcomes` (`grade-snapshot.mjs:70`, stored `fantasyPoints`) for comparability with the existing `bin/backtest.mjs` βs. The committed verdict runs in-basis (the basis the app's projections are actually consumed in). Same builder applied to predictor years keeps features and outcome in one basis.
- Note: `consistencyCV` is the one basis exception — it derives from `weeklyPoints` (stored half_ppr weekly points, the only per-week series in the store). CV is scale-relative; flag as a half_ppr-basis proxy in methodology notes, don't convert.

**Attribution mode (the R2 seam — §9).** All share/team-derived features are computed through a single team resolver taking `attribution` (default `'current-team'`). Only the default path is implemented and exercised this session; `'per-season-team'` is accepted by validation and **throws** `"per-season-team mode is reserved for the R2-REANCHOR gate slice"` — fails loud, can't silently mis-attribute.
- `'current-team'` semantics per reanchor §7's old-mode stand-in: the app's "current team" is not archived pre-2026, so the reconstructable stand-in is **the player's season-Y (anchor) team applied to ALL his seasons** — `totalsByYear[anchorYear][pid].team` (season-totals v3, era-accurate/schedule domain, dominant-team semantics inherited opaquely from `lib/sleeper.mjs` `aggregateWeeks` lines 198–239: most played weeks, ties → later stint). This faithfully reproduces the app's mis-attribution mechanism, including the retired-player denominator undercount (players with no season-Y record vanish from historical team totals).
- Consequence worth stating in the verdict's methodology notes: for **season-Y features** (`teamRzShare`, `rzOwnRate`, share level) the anchor team IS the season-Y team, so current-team and per-season modes coincide; the modes diverge only on multi-season history features (`shareTrend`'s Y−1 leg and historical denominators). advstats' own `team` field is NOT used for attribution (season-totals v3 `team` is canonical for the panel; advstats supplies metric values + WR/TE/RB position only).

**Panel window (D-3).** Default predictor years **2020–2024** (outcomes 2021–2025) — the control-complete window (`off_snp` is 2020+; pre-2020 rows would listwise-drop on `snapShare` anyway). The range is a config: `PANEL_DEFAULTS.fromYear/toYear` in `lib/panel.mjs` + `--from/--to` flags. The post-R1-SNAPS re-run is: flip `fromYear` 2020→2013 (one line) + swap the `loadSnapShare` loader (one function in the adapter's `DEFAULT_LOAD`, isolated for exactly this purpose — §4.3).

---

## 2. The feature panel

### 2.1 Mapping: assessment §A.2 factor stack → panel features (or omission-with-reason)

| §A.2 stack element | Panel feature | Status |
|---|---|---|
| Step 1 base PPG (50/30/20 recency) | `basePPG` | reconstructed |
| Step 2 age curve | — | **omitted, flagged**: no in-repo age join. `draft_picks.json` rows carry `age` but no `sleeper_id` (fields: year/round/pick/team/fullName/position/college/age — name-only; the fuzzy matcher is app-side `nflDraftMatch.js`); roster files store only `{team, position, status, fullName}`. Porting a fuzzy matcher is out of scope. Future paths: R0-SLEEPER players-state family (birth date) or an additive roster-field slice. The verdict must state the baseline is age-blind. |
| Step 3 share trend | `shareTrend` (WR/TE/RB) | reconstructed, **mode-seamed** |
| Step 4 regression + consistency dampener | `consistencyCV` | reconstructed (proxy) |
| Step 5 momentum | `momentum` | reconstructed |
| 5c breakout/bounce-back/TD-reliance | — | omitted, flagged: bucketed signals depending on age curves + injury classification ports; low marginal value for candidate grading |
| 5d trajectory | — | omitted (largely spanned by `momentum` + `basePPG`); flagged |
| 5e efficiency composite | `ypt` (WR/TE/RB), `ypa`/`tdRate`/`intRate` (QB) | reconstructed (component proxies, ratios of season sums) |
| 5f snap share | `snapShare` | reconstructed 2020+ (data hole → listwise, §2.4) |
| 5g RZ own-rate | `rzOwnRate` | reconstructed |
| 5h team-RZ-share | `teamRzShare` | reconstructed, mode-seamed denominator |
| Step 6 durability / projectedGames | `gamesPlayedY` | reconstructed (proxy; the games model itself is out of scope — outcome is PPG, not totals) |
| Step 7/7b team offense + QB quality | — | omitted, flagged: requires forward team environment (ephemeral pre-snapshot era) |
| Step 8 depth chart | — | omitted, flagged: ephemeral (assessment E-0a: "ephemeral inputs held neutral and flagged") |
| Step 9 comp blend; KTC/market | — | omitted, flagged: kNN port out of scope / KTC ephemeral+short history |
| Rookie path | — | out of scope: rows require a qualifying season Y, so the panel is veterans by construction |

The verdict's headline is therefore phrased as: "incremental value over the **reconstructable baseline**" — not over the full app stack. This is E-0a's designed interim form (assessment §A.4/§F6).

### 2.2 Feature formulas (all from `nfl/season-totals/<year>.json` v3 unless noted)

Let `ppg(s) = pointsInBasis(s) / gamesPlayed(s)` from the outcome builder applied to season `s`; qualifying season = `gamesPlayed ≥ 6`.

Common (QB/RB/WR/TE):
- `basePPG` — recency-weighted mean of `ppg` over qualifying seasons among {Y, Y−1, Y−2}, weights 50/30/20 renormalized over the qualifying subset (Y must qualify for the row to exist; mirrors app Step 1).
- `momentum` — `ppg(Y) − ppg(Y−1)` if Y−1 qualifies, else **0** (neutral prior — mirrors the app's missing-signal-→-neutral convention; no indicator column).
- `gamesPlayedY` — `gamesPlayed(Y)`.
- `consistencyCV` — population SD ÷ mean of season-Y `weeklyPoints` values over played weeks (`weeklyStatus[w] === 'P'`); null if mean ≤ 0 or played weeks < 4 → **impute training-cohort (position) mean** (§2.4).

WR/TE/RB (share family; `T = teamOf(pid)` via the mode resolver; team totals per §2.3):
- `share(s)` — WR/TE: `stats.rec_tgt / teamTotals(s)[T].recTgt`; RB: `stats.rush_att / teamTotals(s)[T].rushAtt`. Null if the denominator < `TEAM_DENOM_MIN` (= 20, reuse from `lib/backtest.mjs:6`).
- `shareTrend` — `share(Y) − share(Y−1)`; if `share(Y−1)` is null/absent → **0** (neutral). `share(Y)` null → row dropped (dropReason `noTeamDenominator`, rare).
- `snapShare` — `stats.off_snp / stats.tm_off_snp` when both > 0, else null (identical rule to `lib/backtest.mjs:242-245`). Null → **listwise drop** (data hole, §2.4).
- `rzOwnRate` — WR/TE: `rec_rz_tgt / rec_tgt`; RB: `rush_rz_att / rush_att` (denominators guaranteed > 0 by the opportunity gates).
- `teamRzShare` — WR/TE: `rec_rz_tgt / teamTotals(Y)[T].recRzTgt`; RB: `rush_rz_att / teamTotals(Y)[T].rushRzAtt`; null if denominator < `TEAM_DENOM_MIN` → listwise drop (dropReason `noTeamDenominator`).
- `ypt` — WR/TE: `rec_yd / rec_tgt`; RB: `(rush_yd + rec_yd) / (rush_att + rec)`.

QB only:
- `ypa` — `pass_yd / pass_att`; `tdRate` — `pass_td / pass_att`; `intRate` — `pass_int / pass_att`; `rushYd` — `rush_yd ?? 0` (QB rushing volume matters and is additive).

Candidates (graded one-at-a-time on top of the baseline, never stacked):
- `airYardsShare` — `nflverse/advstats/<Y>.json` `players[pid].airYardsShare`, verbatim (season-level recomputed ratio per that family's contract). Graded for WR and TE; RB reported as diagnostic-only (mirrors `runValidate`'s diagnostic convention).
- `shareLevel` — `share(Y)` from §2.2 (the level, not the trend; the app stack has no level term — assessment C-3/D-3). Graded for WR/TE/RB. Expected reconciliation: decision 4 measured `target_share` partial β ≈ 0 vs volume controls; the verdict must explicitly reconcile with that expectation.

Position resolution order: `advstats[Y].players[pid].position` (WR/TE/RB, 2012–2025 complete) → else `roster[Y].players[pid].position` (QB; roster served 2016–2026). Player-seasons with neither source → dropped, dropReason `noPositionSource` (only affects pre-2016 QB rows on a future widened panel — report the count so it's visible). FB excluded.

Eligibility gates (predictor season Y): `gamesPlayed(Y) ≥ 6` AND opportunity gate — reuse `DEFAULT_GATES` (`lib/backtest.mjs:7`: RB `rush_att ≥ 30`, WR/TE `rec_tgt ≥ 20`) + new `QB: { pass_att: 100 }` (defined in `lib/panel.mjs`, not added to backtest's `DEFAULT_GATES`). Outcome gate: `gamesPlayed(Y+1) ≥ 6` and `actualPPG` finite (existing backtest convention; survivorship caveat inherited and restated in the verdict).

Mover flag: `mover = teamOf_v3(Y) != null && teamOf_v3(Y−1) != null && teamOf_v3(Y) !== teamOf_v3(Y−1)` where `teamOf_v3(s) = totalsByYear[s]?.[pid]?.team` (direct v3 read — the mover *label* is attribution-independent ground truth; only *features* go through the mode resolver). Missing prior season → `mover: false`.

### 2.3 Team totals under the mode resolver

`buildTeamTotalsForSeason(totalsSeason, teamOf)` sums `rec_tgt`, `rush_att`, `rec_rz_tgt`, `rush_rz_att` over **every** record in season `s`'s file, grouped by `teamOf(pid)`; records where `teamOf(pid)` is null are skipped and counted. Under `'current-team'`, `teamOf(pid) = totalsByYear[anchorYear][pid]?.team ?? null` — so totals are **anchor-year-dependent** (recomputed per anchor year Y) and players absent from the anchor-year file drop from denominators, reproducing the app's undercount by design. (This deliberately does NOT reuse `computeTeamTotals` from `lib/backtest.mjs:181`, which groups by advstats `team` over the advstats cohort only — different attribution semantics and no QB volume; leave it untouched.)

### 2.4 Null policy (one rule per null class — state verbatim in the verdict)

| Null class | Policy |
|---|---|
| Data hole (`snapShare` pre-2020; a missing predictor/outcome year file; `teamRzShare`/`share(Y)` below `TEAM_DENOM_MIN`) | **listwise exclusion**, counted per dropReason per (position × year) |
| Structural absence (`momentum`/`shareTrend` with no qualifying Y−1) | **impute 0** (neutral), no indicator |
| Degenerate stat (`consistencyCV` undefined) | **impute training-fold position mean** (recomputed per fold from training rows only — no leakage) |

Missing year file (e.g. a future re-run hitting an unfilled year): warn + skip the whole predictor year, record in `coverage.skippedYears` — same behavior as `assembleCohort` (`scripts/backtest-run.mjs:97-111`). Note: the 2019 advstats hole named in older docs is **filled at this HEAD** (`nflverse/advstats/2019.json` on disk + manifest, B1 gap-fill; data-catalog reconcile output lists 2012–2025) — the README sentence claiming otherwise is stale and is corrected in Docs item D-2.

### 2.5 Per-year panel N (explicit coverage requirement)

The panel artifact and verdict MUST include, per (position × predictor year): rows assembled, rows surviving listwise, drop counts by reason (`belowGates`, `noOutcome`, `outcomeBelowMinGames`, `missingSnap`, `noTeamDenominator`, `noPositionSource`, `noTeam`), and mover count. This is what makes the control-complete claim auditable and what the post-R1-SNAPS re-run diffs against.

---

## 3. Methodology (pre-registered in this plan; the verdict may not move these goalposts)

**Season-blocked forward-chaining CV:** folds = `{ trainYears: [from..Y−1], evalYear: Y }` for every predictor year Y with at least `MIN_TRAIN_SEASONS = 2` earlier panel years. Default window → eval years 2022, 2023, 2024. No future leakage: standardization means/SDs AND imputation means are computed from **training rows only** and applied to eval rows.

**Model:** per position, ridge regression on standardized features, no intercept (outcome standardized on training stats; predictions de-standardized back to PPG via training outcome mean/SD before computing MAE). `ridgeLambda` default **1.0**; sensitivity sweep over `{0, 0.5, 1, 2, 4}` always computed and reported.

**Metrics:** MAE (PPG units, pooled over all held-out rows and per eval year) and Spearman rank correlation (computed **within** each eval year × position, reported per year + n-weighted mean — never pooled across years, since cross-year pooling conflates year-level scoring environment with skill ordering). **Mover cohort** (§2.2 flag) reported separately on the pooled held-out rows (MAE + n; Spearman only if mover n ≥ 10 in a year). Spearman guard: null when n < 3 or either side is constant.

**Candidate grading:** for each candidate × eligible position: fit baseline (features §2.2) and augmented (baseline + candidate) on **identical rows and folds** (rows must survive listwise for the candidate too, so the baseline is re-fit on the candidate-complete row set — deltas are apples-to-apples; report both the candidate-complete n and the full-baseline n). Report ΔMAE (augmented − baseline; negative = improvement), ΔSpearman (n-weighted mean), the candidate's standardized ridge coefficient per fold and on a final descriptive all-years fit, and the λ-sweep stability of the deltas' signs.

**Verdict labels (ordered rules, per candidate × position):**
1. `DEGRADES` — pooled ΔMAE > 0.
2. `CLEARS` — pooled ΔMAE < 0 AND mean ΔSpearman ≥ 0 AND ΔMAE < 0 in ≥ 2 of 3 eval years AND ΔMAE sign stable at λ ∈ {0.5, 1, 2}.
3. `NO-GAIN` — |pooled ΔMAE| / baseline MAE < 0.5% (the decision-4 "already captured by volume" outcome).
4. `UNSTABLE` — everything else (improves somewhere, unstable across years/λ).

**Standing caveats restated in every artifact:** recurring players across Y→Y+1 pairs → rows non-independent, deltas are effect-size estimates not significance tests (existing backtest caveat, `scripts/backtest-run.mjs:146-152`); outcome gate `gp ≥ 6` → survivorship; baseline is age-blind and depth/market-blind (§2.1); attribution is `'current-team'` matching the app's live `DEFAULT_ATTRIBUTION` (the verdict's numbers describe the shipped attribution semantics).

---

## 4. Edits, grouped by file

### 4.1 `lib/backtest.mjs` (two additive edits, no behavior change to existing callers)

1. **`solveOLS` ridge option** — signature at line 24: `export function solveOLS(X, y)` → `export function solveOLS(X, y, { ridgeLambda = 0 } = {})`. After the Gram-matrix build loop (lines 31–38), insert: `if (ridgeLambda > 0) { for (let j = 0; j < k; j++) G[j][j] += ridgeLambda; }`. Existing call site (`standardizedRegression`, line 133) unchanged — default 0 preserves byte-identical behavior (regression-guarded by test T-6).
2. **`rankTransform` + `spearman`** — append after `quintileResponse` (ends line 178):
   ```js
   // Average-rank transform (ties share the mean rank). Used by spearman().
   export function rankTransform(values) → number[]
   // Spearman rank correlation. Reuses pearson (lib/grade.mjs, already imported line 1).
   // Returns null when n < 3 or either side is constant.
   export function spearman(xs, ys) → number | null
   ```
   Note: `scripts/update-ktc.mjs:69` has a private `rankTransform` sibling — do NOT touch that file (guard-critical); the duplication is accepted and noted in a one-line comment.

### 4.2 `lib/panel.mjs` (new, pure — no I/O, no console)

```js
export const PANEL_DEFAULTS = {
  fromYear: 2020, toYear: 2024,          // predictor years; outcomes Y+1 (flip fromYear→2013 post-R1-SNAPS)
  minOutcomeGames: 6, minPredictorGames: 6,
  minTrainSeasons: 2,
  ridgeLambda: 1.0, ridgeSweep: [0, 0.5, 1, 2, 4],
};
export const PANEL_POSITIONS = ['QB', 'RB', 'WR', 'TE'];
export const PANEL_GATES = { QB: { pass_att: 100 }, RB: { rush_att: 30 }, WR: { rec_tgt: 20 }, TE: { rec_tgt: 20 } };
export const ATTRIBUTION_MODES = ['current-team', 'per-season-team'];
export const BASELINE_FEATURES = {
  QB: ['basePPG', 'momentum', 'gamesPlayedY', 'consistencyCV', 'ypa', 'tdRate', 'intRate', 'rushYd'],
  RB: ['basePPG', 'momentum', 'gamesPlayedY', 'consistencyCV', 'shareTrend', 'snapShare', 'rzOwnRate', 'teamRzShare', 'ypt'],
  WR: [...same as RB...], TE: [...same as RB...],
};
export const CANDIDATES = {
  airYardsShare: { positions: ['WR', 'TE'], diagnosticPositions: ['RB'], source: 'advstats' },
  shareLevel:    { positions: ['WR', 'TE', 'RB'], diagnosticPositions: [], source: 'derived' },
};

// THE R2 SEAM (§9): sole team-resolution point for share/team features.
// mode 'current-team' → (pid) => totalsByYear[anchorYear]?.[pid]?.team ?? null
// mode 'per-season-team' → throws Error('per-season-team mode is reserved for the R2-REANCHOR gate slice')
// unknown mode → throws.
export function teamKeyResolver(mode, totalsByYear, anchorYear) → (pid) => string|null

export function buildTeamTotalsForSeason(totalsSeason, teamOf)
  → { totals: { [team]: { recTgt, rushAtt, recRzTgt, rushRzAtt } }, unattributed: number }

export function computeSeasonPoints(rec, outcomes)        // helper: ppg lookup wrapper over prebuilt outcome maps
export function buildPanelRow({ pid, position, anchorYear, totalsByYear, ppgByYear, advstatsY, teamOf, teamTotalsByYear, config })
  → { row } | { dropReason }                              // row per §2.2; dropReason per §2.4/§2.5 enumeration

export function assemblePanelRows(inputsByYear, config)   // orchestrates rows + coverage over the year range
  → { rows: PanelRow[], coverage: CoverageBlock }

export function forwardChainFolds(years, minTrainSeasons) → [{ trainYears: number[], evalYear: number }]
export function standardizeTrainApply(trainRows, evalRows, featureNames)  // training-only scaler + imputation
  → { XTrain, yTrain, XEval, yEval, scaler }
export function fitAndScoreFold(trainRows, evalRows, featureNames, { ridgeLambda })
  → { evalYear, n, mae, spearman, coefficients: { [feature]: number }, predictions: [{ pid, predicted, actual, mover }] }
export function evaluateModel(rows, folds, featureNames, opts)
  → { perEvalYear: [...], pooled: { n, mae, spearmanMean }, movers: { n, mae, spearmanByYear }, describeFit: { coefficients } }
export function gradeCandidate(rows, folds, position, candidateName, candidateFeature, opts)
  → { position, candidate, nCandidateComplete, baseline: {...}, augmented: {...},
      deltas: { maePooled, maePerYear, spearmanMean }, coefficient: {...}, sweep: [{ lambda, dMae, dSpearman }],
      verdict: 'CLEARS'|'NO-GAIN'|'DEGRADES'|'UNSTABLE' }
export function decideVerdict(deltas, sweep, baselineMae) → verdict  // §3 ordered rules, pure + unit-testable
```

`PanelRow` shape: `{ sleeperId, position, predictorYear, team, mover, features: { …numbers, post-imputation nulls resolved per fold — raw nulls preserved in the committed panel with imputation applied at fit time }, candidates: { airYardsShare, shareLevel }, outcomePPG }`. Commit the **raw** (pre-imputation) values in the panel artifact; imputation happens inside folds (it's training-fold-dependent by design).

### 4.3 `scripts/panel-run.mjs` (new — adapter, mirrors `scripts/backtest-run.mjs`)

```js
import { readJson, writeJsonStable } from '../lib/io.mjs';
import { buildInBasisOutcomes, buildHalfPprOutcomes } from './grade-snapshot.mjs';  // reuse — grade-snapshot.mjs is side-effect-free on import
import { … } from '../lib/panel.mjs';

export const DEFAULT_SCORING_SNAPSHOT = '2026-07-05';
export const DEFAULT_LOAD = {
  loadSeasonTotals: (year) => readJson(`nfl/season-totals/${year}.json`),
  loadAdvstats:     (year) => readJson(`nflverse/advstats/${year}.json`),
  loadRoster:       (year) => readJson(`nflverse/roster/${year}.json`),
  loadSnapshot:     (date) => readJson(`snapshots/${date}.json`),
  // Isolated on purpose: R1-SNAPS re-points THIS ONE FUNCTION at nflverse/snaps/<year>.json.
  loadSnapShare:    null,   // null = derive from season-totals off_snp/tm_off_snp (the 2020+ path)
};

export function resolveScoring({ basis, scoringFrom, load })      // → { scoringSettings|null, basisMeta }
export function buildOutcomeMaps(years, scoring, load)            // → { [year]: { outcomes: Map, droppedTerms, excludedRateKeys, scoredKeyCount } }
export function assemblePanel({ fromYear, toYear, attribution, basis, scoringFrom, minOutcomeGames, load })
  → { rows, coverage, meta }                                      // meta echoes config + basis + attribution + generatedAt
export function runBaseline(panel, opts)   → BaselineReport       // evaluateModel per position
export function runCandidates(panel, opts) → CandidateReport[]    // gradeCandidate per CANDIDATES × position (+diagnostic rows)
export function buildFitReport(panel, baseline, candidates, opts) → FitReport
export function buildVerdictMarkdown(panel, fitReport) → string   // §5 artifact 3
export function writeArtifacts({ panel, fitReport, verdictMd })   // three writes, date-stamped (§5); NO manifest calls
```

### 4.4 `bin/panel.mjs` (new — thin CLI, clone the `bin/backtest.mjs` arg-parsing pattern lines 44–58)

```
node bin/panel.mjs                          # assemble + fit + human verdict to stdout, no writes
  --from YYYY --to YYYY                     # predictor-year range (default 2020–2024)
  --attribution current-team                # seam flag; 'per-season-team' throws (reserved for R2)
  --basis in-basis|half_ppr                 # default in-basis
  --scoring-from YYYY-MM-DD                 # scoring-source snapshot (default 2026-07-05)
  --min-games N                             # outcome gate (default 6)
  --ridge X                                 # default 1.0 (sweep always reported)
  --json                                    # machine-readable FitReport to stdout
  --write                                   # persist the three artifacts (§5)
```
Exit 0 on success (verdicts are findings, not pass/fail); exit 1 on config/data errors. `isMain` guard identical to `bin/backtest.mjs:146-147`.

### 4.5 `package.json`

Line 15 area (scripts block): add `"panel": "node bin/panel.mjs",` after `"backtest"`. **Deliberately NOT added to `npm run smoke`** (line 14) — mirrors the backtest's chosen scope ("not wired into smoke", CLAUDE.md Backtest section); unit tests run via `npm test`.

---

## 5. Committed artifacts (the deliverable)

Written by `--write`, date-stamped per the existing backtests naming convention:

1. **`backtests/<YYYY-MM-DD>-e0a-panel.json`** — `{ meta: { generatedAt, panelYears, attribution, basis: { type, scoringSource, perYear: { droppedTerms, excludedRateKeys, scoredKeyCount } }, gates, minOutcomeGames, minTrainSeasons }, coverage: §2.5 block, rows: PanelRow[] }` (~1,000–1,500 rows expected; a few hundred KB — fine to commit). No headSha field — the commit containing the artifact is its provenance.
2. **`backtests/<YYYY-MM-DD>-e0a-fit.json`** — `{ meta (echo + ridgeLambda + ridgeSweep + evalYears + featureNames per position), baseline: BaselineReport, candidates: CandidateReport[] }`.
3. **`grading/<YYYY-MM-DD>-e0a-verdict.md`** — human-readable: header (date, config, reproduce command `node bin/panel.mjs --write`), per-year panel-N coverage table, baseline accuracy table (per position: pooled MAE, per-year Spearman + mean, mover-cohort block), one section per candidate × position (deltas, coefficient, sweep table, **verdict label**, and for `shareLevel` the explicit decision-4 reconciliation sentence), methodology notes (§3 caveats verbatim, §2.1 omissions, attribution-mode statement + R2 seam pointer).

**Manifest stance (deliberate, documented):** none of the three artifacts gets a manifest entry. `backtests/` is already the documented unregistered-analysis precedent (CLAUDE.md navigation map row, data-catalog "Non-served artifacts"); the e0a verdict .md in `grading/` extends that convention — it is not the `bin/grade.mjs --write` JSON family (which stays registered). Docs items D-4/D-6 write this down so Invariant 3's "every script-written file" has a stated exception boundary. No manifest write → no app-visible change → **no CDN purge owed**.

---

## 6. Step sequence for the implementer

1. `lib/backtest.mjs`: ridge option on `solveOLS` (§4.1.1) + `rankTransform`/`spearman` (§4.1.2). Run existing `test/backtest.test.mjs` — must stay green untouched.
2. `lib/panel.mjs`: constants + `teamKeyResolver` + team totals + row/panel builders (§4.2, §2).
3. `lib/panel.mjs`: folds, scaler/imputation, fit/eval, `gradeCandidate`, `decideVerdict` (§3).
4. `scripts/panel-run.mjs`: loaders, scoring resolution, orchestration, report + markdown builders (§4.3).
5. `bin/panel.mjs` + `package.json` script (§4.4/§4.5).
6. Tests (§8) — write T-1…T-12 alongside steps 2–5, not after.
7. Docs (§7).
8. `npm test` green; `npm run smoke` green (should be untouched — verifies no accidental smoke coupling).
9. **The run:** `node bin/panel.mjs --write` → inspect the verdict → commit source + docs + the three artifacts.
10. Per the Session git workflow (CLAUDE.md): commit (`feat: e0a grading harness + first committed baseline verdict`), `git pull --rebase origin main` before pushing (weekly Actions push to main on cron; resolve manifest conflicts as union per the standing rule — this session's changes don't touch manifest.json, so any conflict is other-side-only), `git push origin main`. No CDN purge (no served file changed).
11. Task summary must state: verdict labels per candidate × position; the R2 seam location (§9); the age-blind/depth-blind baseline caveat; cross-repo note (§10).

---

## 7. Docs updates

**D-1 — `README.md` → Analysis / Backtesting (§ starts line 1087):** add a new subsection after the existing Backtest CLI block (after line 1136 "Reports are written to…"), titled **"E-0a grading baseline (`bin/panel.mjs`)"**, containing: purpose (first committed numeric verdict; the gate instrument for scoring-affecting activations), inputs (season-totals v3 + advstats + roster-position + pinned scoring snapshot; explicitly NOT gamelogs/teamcontext — view-only fence), methodology (forward-chaining season-blocked CV, training-only standardization/imputation, ridge default λ=1.0 + sweep, MAE + within-year Spearman, mover cohort, verdict rules), the attribution-mode statement (current-team, per §9's seam; per-season reserved for R2), artifact paths + "reproduce: `node bin/panel.mjs --write`", and the null-policy table (§2.4). Keep it ~40 lines; mirror the register of the existing section.

**D-2 — `README.md:1104`** — the stale sentence "The 2019 advstats file is also absent from disk (write failed; re-run `node bin/update.mjs advstats --year 2019 --force` to fill it — but its rows would be dropped anyway for missing `off_snp`, so it has no impact on results)." → replace with: "The 2019 advstats file was backfilled by the B1 gap-fill (2026-07-03) and is on disk/manifest; its rows still listwise-drop from snap-controlled models for missing `off_snp`."

**D-3 — `CLAUDE.md` Commands section** — after the "Backtest CLI — `bin/backtest.mjs`" block (lines 81–91), add a sibling block:
```
### Panel CLI — `bin/panel.mjs`

node bin/panel.mjs                        # E-0a baseline + candidate grading (analysis-only)
node bin/panel.mjs --write                # persist backtests/<date>-e0a-{panel,fit}.json + grading/<date>-e0a-verdict.md
# Flags: --from/--to YYYY, --attribution current-team, --basis in-basis|half_ppr,
#        --scoring-from YYYY-MM-DD, --min-games N, --ridge X, --json, --write

Offline analysis (read-only over season-totals + advstats + roster + one snapshot); not wired
into smoke; not the snapshot grader. Methodology: README → Analysis / Backtesting.
npm shortcut: `npm run panel`.
```

**D-4 — `CLAUDE.md` Navigation map** — add three rows (near the backtest rows, lines 130–136): `bin/panel.mjs` ("Thin CLI over `scripts/panel-run.mjs` — E-0a panel assembly + candidate grading, `--write` to `backtests/` + `grading/`"), `scripts/panel-run.mjs` ("Panel orchestration adapter (injectable loaders; mirrors `scripts/backtest-run.mjs`); attribution-mode seam for R2"), `lib/panel.mjs` ("Pure panel/fit logic — feature builders, forward-chain CV, ridge, spearman; no I/O"). Update the `backtests/` row (line 136): append "; also `<date>-e0a-{panel,fit}.json` from `bin/panel.mjs --write`". Update the `grading/` row (line 145): append "; plus unregistered `<date>-e0a-verdict.md` analysis reports from `bin/panel.mjs --write` (backtests-style exception to Invariant 3 — deliberate)".

**D-5 — `CLAUDE.md` lib row** (line 135, `lib/backtest.mjs`): append "; `solveOLS` accepts `{ ridgeLambda }`; exports `rankTransform`/`spearman`".

**D-6 — `data-catalog.md` → Non-served artifacts (line 191 block):** extend the `backtests/` bullet: "…not the snapshot grader; also the E-0a panel/fit artifacts (`<date>-e0a-*.json`) from `bin/panel.mjs --write`." Add one bullet: "**`grading/<date>-e0a-verdict.md`** — human-readable E-0a verdict written by `bin/panel.mjs --write`; unregistered analysis report (the registered `grading/<date>.json` family from `bin/grade.mjs` is unchanged)."

**D-7 — `data-catalog.md` → Grading reports section (line 81):** add one clarifying line at the end of the section: "- **Note:** `grading/` also holds unregistered `<date>-e0a-verdict.md` analysis reports (see Non-served artifacts) — not part of this family."

No other README/CLAUDE sections need editing (commands, invariants, cross-repo contract tables are untouched — verified: no served shape, no manifest field, no scoring math, no new subcommand on `bin/update.mjs`).

---

## 8. Tests to add

New files `test/panel.test.mjs` (pure-lib units) and `test/panel-integration.test.mjs` (injectable-loader end-to-end, mirroring `test/backtest-integration.test.mjs`), plus small fixtures under `test/fixtures/`. All `node --test`, run by existing `npm test`.

- **T-1 feature builders (C4 discipline):** fixture season where per-game averaging would differ from ratio-of-sums (e.g. weekly target counts 2 and 10 vs team 10 and 10) — assert `share`, `ypt`, `rzOwnRate` equal ratios of summed components, not averaged per-game rates. Assert `basePPG` 50/30/20 weighting incl. renormalization with 1 and 2 qualifying seasons; `momentum` imputes 0 with no qualifying Y−1; `consistencyCV` from `weeklyPoints`/`weeklyStatus` played weeks only, null on <4 played weeks.
- **T-2 attribution seam:** `teamKeyResolver('current-team', …)` returns anchor-year team for every season queried; `'per-season-team'` throws the reserved-mode error; unknown mode throws. **Mover fixture:** player with `team: 'A'` in Y−1 file, `'B'` in Y file → `shareTrend`'s Y−1 leg is computed against team-B totals (the faithful wrong-attribution reproduction) and `mover === true`.
- **T-3 undercount reproduction:** a retired player present in season Y−1's file but absent from Y's → excluded from Y−1 team totals under current-team mode (counted in `unattributed`).
- **T-4 data-hole listwise + coverage:** a pre-2020-style row (`off_snp` absent) → dropped with `missingSnap` counted; a missing advstats year (loader returns null) → year skipped + `coverage.skippedYears`; `teamRzShare` denominator < 20 → `noTeamDenominator`; coverage block per (position × year) matches hand-counted fixture expectations.
- **T-5 folds + leakage guard:** `forwardChainFolds([2020..2024], 2)` → eval {2022, 2023, 2024} with correct train sets; scaler/imputation asserted to use training rows only (add an eval-year outlier and assert the training scaler is unchanged).
- **T-6 ridge:** `solveOLS(X, y)` (no options) byte-equal to pre-change results on the existing backtest test fixtures (regression guard); `ridgeLambda > 0` shrinks coefficients on a crafted collinear design; a singular design becomes solvable with `ridgeLambda > 0`.
- **T-7 spearman/rankTransform:** ties get averaged ranks; monotone → 1; reversed → −1; n<3 or constant input → null.
- **T-8 de-standardization:** predictions returned in PPG units (fit on a known linear system, assert MAE computed on raw scale).
- **T-9 verdict rules:** table-driven over `decideVerdict` — one case per label incl. the ordering edges (ΔMAE>0 wins over everything; NO-GAIN threshold boundary; λ-sweep sign flip → UNSTABLE).
- **T-10 outcome basis:** in-basis path calls `buildInBasisOutcomes` with the pinned snapshot's `scoringSettings` (assert droppedTerms/excludedRateKeys surfaced into meta); `--basis half_ppr` path matches stored `fantasyPoints/gamesPlayed`.
- **T-11 integration:** synthetic 4-year, 3-position dataset (incl. one mover, one hole year, one QB) via injectable `load` → full `assemblePanel` → `runBaseline` → `runCandidates` → assert FitReport well-formedness (every §5 key present, per-position blocks complete, candidate verdict ∈ the four labels) and `buildVerdictMarkdown` contains the coverage table + verdict lines.
- **T-12 committed-artifact well-formedness:** a test that globs `backtests/*-e0a-panel.json` / `*-e0a-fit.json` / `grading/*-e0a-verdict.md`; **skips (t.skip) when none exist** (pre-run CI must stay green) and otherwise validates schema: meta keys, attribution === 'current-team', coverage per-year rows, every panel row has finite `outcomePPG` and the position's feature keys, fit verdicts ∈ labels.

---

## 9. The R2 attachment seam (name it, don't build it)

R2-REANCHOR's flip-gate slice (reanchor task §7) attaches at exactly two points, both created here:

1. **`lib/panel.mjs` `teamKeyResolver(mode, totalsByYear, anchorYear)`** — R2 adds the `'per-season-team'` branch: `(pid, season) => totalsByYear[season]?.[pid]?.team ?? null` (note: that branch is per-(pid, season), so R2 also generalizes the resolver's call signature from `(pid)` to `(pid, season)`; current-team mode ignores `season`. Implementer: write the internal call sites as `teamOf(pid, season)` NOW, with the current-team resolver ignoring the second argument — then R2's change is resolver-only).
2. **`scripts/panel-run.mjs` `assemblePanel({ attribution })` + `bin/panel.mjs --attribution`** — R2 unlocks the flag value, runs the assembler twice (both modes, identical rows/folds/neutralization semantics), and adds the before/after residual-diff report per §7's clearing criterion (no worse overall + no worse on movers). The mover cohort segmentation R2 needs is already reported (§3).

Everything else (folds, metrics, artifacts) is reused as-is. R2 must NOT re-architect the assembler — if it needs a change beyond the two points above, that's a design smell to report.

---

## 10. Cross-repo impact

**Contracts: none.** No served file shape, no manifest field/schema, no scoring math (`lib/fantasyPoints.mjs` untouched; `buildInBasisOutcomes` reused read-only), no `bin/update.mjs` subcommand, nothing the app loads changes. The artifacts are new, unregistered, analysis-only.

**Coordination notes for the task summary (informational, not contract):**
1. The app repo's planning docs (`roadmap.md` R1-HARNESS row, `projection-model-assessment.md` §F1 "never committed") become satisfiable/stale once the verdict commits — the app-side doc pass (R3-DOCS) should cite the committed verdict path; no app code change.
2. R2-REANCHOR's gate slice depends on §9's seam — its task file already anticipates this ("R1-HARNESS must implement the dual-mode panel semantics… before the gate can run"); point its implementer at §9.
3. The committed verdict runs under `'current-team'` attribution, matching the app's live `DEFAULT_ATTRIBUTION` — state this equivalence in the summary so nobody reads the baseline as post-flip numbers.
