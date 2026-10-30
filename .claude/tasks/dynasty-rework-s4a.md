# S4a · Veteran dynasty score rework — candidates, fit, out-of-sample verdict

**Status:** plan, Revision 2 (Session 1, parent folder, 2026-10-30). Folds in all 21 flags from the full plan review of Revision 1 (Anton: "fold them in"); §15 records how each was resolved. QB rule decided by Anton (§5.10, §14). Light plan review of Revision 2 run; its 12 mechanical flags folded without another round (§15). **Approved by Anton 2026-10-30** for commit and Session 2; Session 2 pins the hash (§5.13).
**Review depth: full** — scoring-affecting decision (it chooses the dynasty score S4b would ship) and holds a pre-registration.
**Session 2:** **sonnet**, effort **high**. Run it **inside `sleeper-dashboard-data/`** (data-repo-only slice; no app file is touched). Read that repo's CLAUDE.md first.
**Anchors:** data `main` @ `95b9f15` (S3b signed off and pushed); app `main` @ `b6fcb54` (app dynasty code unchanged since the mirror's pin `95ba1e1`). S3 panel: `backtests/2026-10-30-dynasty-history-panel.json` (prereg `dbeff355…`, data rev `a791db0`).
**Dates:** verdict signed off by **Fri 2026-11-06**; S4b (only on `S4A-WIN`) live by Fri 2026-11-13; league trade deadline Thu 2026-11-19 (week 11). Targets: plan approved 2026-11-02, pinned run by 2026-11-04, verification 2026-11-05.

---

## 0. What this is, for Anton

S3 showed the veteran dynasty score ranks players well but **loses to a plain two-year points average** at RB, WR and TE, ties it at QB, and leans toward veterans (under-rates ≤24, over-rates 31+). S4a tries three small, fixed reworks of the score plus a re-weighting of today's score. The data picks the weights and one of these — but only ever on seasons the result is **not** then judged on. The report says whether the winner beats the two-year average and removes the age lean. Offline research; nothing reaches the app. If it wins, S4b wires it in. If not, the verdict says so and Session 1 proposes the display-only fallback instead of forcing a rework.

**Caveats, stated in the verdict:**
- The candidates were designed after reading S3's results on all eight cohorts. The fold design (§5.4) keeps the *fitting and choosing* off the judged seasons; it cannot un-see S3. No completed-season cohort is untouched; the only truly fresh test is forward (captured 2026+ scores), which this slice does not do.
- When a test cohort comes before its fit cohorts (e.g. test 2015, fit 2018–2022), the fit cohorts' inputs and their age curves include the test cohort's outcome seasons. No test outcome is ever a fit *target*, but the fit has seen those seasons as inputs.
- The bootstrap holds each fold's fitted weights fixed, so the CIs leave out fit variance.
- `sleeper` games only (S3 gave identical labels under both games definitions).
- K3 (the mover candidate) uses next-season team information and is therefore report-only (§5.2).

---

## 1. Scope

**In:** a pure module of candidate components, grid fit, fold plan and decision rule (`lib/dynastyRework.mjs`); an adapter that builds rows, checks them against the S3 panel, runs the folds and writes the verdict (`scripts/dynasty-rework-run.mjs`); the `--dynasty-rework` CLI mode; tests; docs.

**Out:** any app change (S4b); any change to S3a/S3b modules (`lib/dynastyMirror.mjs`, `scripts/dynasty-asof.mjs`, `lib/ageCurveVariants.mjs`, `scripts/dynasty-history-run.mjs`) — a needed change is a §10 stop; the `snaps` games mode; prospects (Path A); KTC; the QB-quality modifier; label bands; any registry, manifest, catalog or snapshot change.

---

## 2. Touch list

| File | What |
|---|---|
| `lib/dynastyRework.mjs` **(new)** | Pure: `CANDIDATES`, `SELECTABLE` (= K0, K1, K2), `BETA_GRID`, `weightGrid(k)`, `candidateComponents(row, candidateId, beta)`, `composeCandidate(row, candidateId, weights, beta)`, `fitCandidate(rows, candidateId, fitCohorts, position)`, `foldPlan(kind)`, `selectCandidate(fitsByCandidate)`, `ageTilt(items)`, `decide(summary)`, and the private copies listed in §3. No I/O. |
| `scripts/dynasty-rework-run.mjs` **(new)** | Adapter: `DYNASTY_REWORK_LOAD`, `TASK_FILE`, `DYNASTY_REWORK_PREREG_SHA256`, `preregHash(text)`, `assertPrereg(load)`, `readQbFloor(load)`, `buildReworkRows`, `checkS3Parity`, `runFolds`, `computeReworkMetrics`, `runDynastyRework`, `buildDynastyReworkVerdictMarkdown`, `writeDynastyReworkArtifacts`, `runProbe`, `dynastyReworkMain`. Stops thrown as `DynastyReworkStop`. |
| `bin/backtest.mjs` | `--dynasty-rework` dispatch + header doc line |
| `test/dynasty-rework.test.mjs` **(new)** | §8 |
| `backtests/<date>-dynasty-rework-panel.json`, `grading/<date>-dynasty-rework-verdict.md` **(new, generated)** | §6, unregistered (the documented Invariant 3 exception) |
| `README.md` (Module notes, backtest modes), `CLAUDE.md` (Commands Backtest row; `lib/backtest.mjs` nav row) | §9 |

Nothing else.

---

## 3. Inputs (as merged at data `95b9f15`; imported, never modified)

**Imported (exported today):**
- `scripts/dynasty-asof.mjs`: `DYNASTY_ASOF_LOAD`, `buildAsOfInputs(load, S, { curveAgeMode: 'birthdate', gamesMode: 'sleeper' })`, `outcomeLoad`, `readTeamS1`, `isChanger`, `franchise`, `SKILL`, `LAST_COMPLETED_SEASON`.
- `lib/leagueBasis.mjs:154`: `leagueBasisLoad(load, { scoringSettings, positionOf })` — outcomes are read through it, as `buildRows` does (`scripts/dynasty-history-run.mjs:338`).
- `lib/ageCurveVariants.mjs`: `guardedAgeCurves(careerStats, playersMap, { currentYear: S + 1 })` → `{ bundle }` (H's curve bundle).
- `lib/dynastyMirror.mjs`: `dynastyScoreMirror(...)` (its `raw` on Paths B/C), `composeDynastyScore`, `DYNASTY_WEIGHTS`, `pickDynastyLabelMirror`; the `shareTrendBoostOff` seam. `interpolateAgeCurve` from `lib/projectionFactors.mjs`.
- `scripts/dynasty-history-run.mjs`: `realisedValue`, `cohortStats`, `percentileBias`, `hitRate`, `labelBaseline`, `labelBias`, `labelRho`, `pathOf`, `metricKey`, `parseMetricKey`. `clusteredBootstrap` from `lib/inSeasonEvidence.mjs:283`.

**Copied into `lib/dynastyRework.mjs` or the adapter (private today), each with a comment naming its source file and lines. Copy verbatim except for the changes listed against each item; no other change:**
- `lib/dynastyMirror.mjs:67` `percentileRank` — verbatim.
- `scripts/dynasty-history-run.mjs`, verbatim: `mirrorCall` (:199), `guardedManifestCheck` (:281 — the in-progress-season stop), `sc` (:519), `val` (:520), `ageBand` (:521), `makeCtx` (:524), `validItems` (:526 — **the paired-row mask lives here, in its `b` argument**), `cohortMap` (:540), `combine` (:550 — averages per-cohort statistics over cohorts and counts `n`; no masking of its own), `meanOf` (:581), `ciOf` (:583), `bootstrapSpecs` (:591 — one shared draw sequence across specs, which "paired on the same resample" depends on).
- `biasItems` (:566) — one permitted change: a `subject` parameter replaces the literal `'H'` in its `validItems` call (and joins its cache key), so bias and tilt can be computed for P, H and B2.
- The `assemble` closure inside `computeMetrics` (:759) — lifted to module level with its closure variables made parameters.
- **Row build** — the cohort loop body of `buildRows` that S4a's §4 needs, sleeper only: the years_exp ≥ 2 stop (:395-398), the birthdate-coverage < 95% stop (:400-410, headline cohorts), `cohortContext` and `regWeeks` as `buildRows` uses them, the `guardedManifestCheck` window list, the per-row block (:461-512: `teamS1`/`changer`, `ppgAt`, `B1 = pS ?? pS1`, `B2` = mean of the qualifying {S−1, S}, the `realisedValue` window loop through the outcome loader `og`). Permitted changes: drop the `snaps` mode, the S3 variants other than H, `psWeeks` and `ageSleeper`; add the §4 S4a-only fields.
- **Delta pairing:** S4a always uses the paired form — `cohortMap(ctx, m, k, a, b)` against `cohortMap(ctx, m, k, b, a)` — for every `~` comparison; it does not use S3's `sameMask` branch.
- If any other S3 private is needed, that is a §10 stop, not an improvised re-implementation.

**In-memory row shape** (what the copied helpers read; `m` = `'sleeper'`): `{ pid, S, position, age, path: { sleeper }, scores: { H, P, 'K0-oof', 'K1-oof', 'K2-oof', 'K3-oof': { sleeper } }, B1: { sleeper }, B2: { sleeper }, outcome: { sleeper: { M1, M2, h } }, raw, signals, teamS, teamS1, changer, …§5.2 fields }`. `sc(row, 'sleeper', 'P')` therefore reads `row.scores.P.sleeper`. The §6 panel's flat `rows[]` is a separate serialization step.

**`DYNASTY_REWORK_LOAD`** = `DYNASTY_ASOF_LOAD` plus: `taskFileText`, `gitRev`, `now` (as `DYNASTY_HISTORY_LOAD` at :89-95), `loadS3Panel` (reads `backtests/2026-10-30-dynasty-history-panel.json`; injectable so tests pass synthetic panels), and `gitShow(rev, path)` — the exec seam — `child_process.execFileSync('git', ['show', `${rev}:${path}`], { cwd: repoPath('.'), maxBuffer: 1 << 30 })` (the raw players blob is 18.9 MB; precedent `scripts/migrate-absence-role.mjs:75-76`). **Pinned inputs for parity (see §4):** `loadPlayerIds` and `loadRawPlayers` are replaced by loaders that parse `gitShow('a791db0', 'nflverse/playerids.json')` and `gitShow('a791db0', 'raw/-players-nfl.json')` once and cache them. Every other loader reads completed-season or fixed files (append-only by Invariant 1). Reason: the playerids workflow refreshes on Wednesdays (next: 2026-11-04, the planned run day) and one birthdate change moves the guarded curves and many H scores.

The S3 panel file is committed analysis output; reading it is allowed by Invariant 10.

---

## 4. Row set and S3 parity

For each S ∈ 2015…2024, run exactly S3's H configuration under `sleeper` games, on `DYNASTY_REWORK_LOAD`: `buildAsOfInputs(load, S, { curveAgeMode: 'birthdate', gamesMode: 'sleeper' })`, curve bundle replaced by `guardedAgeCurves(...).bundle`, `mirrorCall` with pick/KTC/`inSeasonLevel`/`prospectLevel` null and `options` `{}`. A row is `(pid, S)` with Path B or C (S3b §5). Store per row: `pid`, `S`, `position`, `age` (integer birthdate age on (S+1)-06-01, i.e. the player's age in season S+1 under the curves' binning, `lib/ageCurveVariants.mjs:85-86`), `path`, `raw` (all keys), `signals` (for labels), H score, B1, B2, outcome `{ M1, M2, h }` (S3b §6, `sleeper`, read through `leagueBasisLoad` with the same `scoringSettings`/`positionOf`, `guardedManifestCheck` on every window season), `teamS`, `teamS1`, `changer` (S3b §8.6 A-ST-chg rule: `isChanger(teamS, readTeamS1(load, S, pid))`).

**Parity (stop on any difference):** `checkS3Parity(rows, panel, cohorts)` takes the cohort list — the pinned run passes 2015…2024, the probe passes [2015, 2018]. For every S in that list the row set (`pid`, `S`) equals the S3 panel's rows with `path.sleeper ∈ {B, C}`, and per row `scores.H.sleeper`, `B1.sleeper`, `B2.sleeper`, `outcome.sleeper` (M1, M2, h), `age`, `changer` are equal. This is what "measured on the S3 history panels" means: same population, same outcomes, same reference score. On a mismatch the stop message carries counts per cohort × field only (no pid, no value).

Per row, S4a also computes the §5.2 quantities: `level2`, `currentLevel2Score`, `ageAdj2Score`, the curve ratios `r1, r2, r3`, `peakPPG`, and `opportunityScoreChg` (a second `mirrorCall` per cohort with `options.shareTrendBoostOff` built from a per-cohort `Map` pid → `changer`, as S3's A-ST-chg does at :248; its `raw.opportunityScore`).

**Preview cohort S = 2025** (outcome-free, §5.11): same build; no outcome, no S3 parity (S3 has no 2025 cohort); `changer` = false for all rows (2026 is in progress and never read).

---

## 5. Pre-registration

Fixed before any real-data result is computed. The hash (§5.13) covers §4 and this section: the row set, the parity rule and the per-row quantities are part of what is pre-registered.

### 5.1 Data and measures
- Population: §4 rows. Games: `sleeper` only. Headline cohorts S = 2015–2022 (h = 3). S = 2023 (h = 2) and 2024 (h = 1) are report-only (§5.11).
- Ranking measure: within-cohort Spearman ρ between score and **M1** (S3b §6), averaged over cohorts with equal weight; a cohort contributes for a position only with ≥ 20 rows evaluable for M1.
- Age measure: percentile bias on **M2** (S3b §8.4): within each position-cohort p(x) = (average rank − 0.5) / n × 100; bias = p(score) − p(M2); bands by `age` via `ageBand`: `le24`, `25-27`, `28-30`, `ge31`.

### 5.2 Candidates (fixed; exactly four; K3 report-only)

Shared definitions, per row (`age` is the season-S+1 age, §4; `level2` is measured on seasons S−1 and S, ages `age − 2` and `age − 1`):
- `level2` = mean PPG of the qualifying seasons (gamesPlayed ≥ 8) among {S−1, S} — the B2 value.
- `currentLevel2Score` = `percentileRank(pool, level2)`, where `pool` is built exactly as the mirror builds `positionRankingPPGs` (`lib/dynastyMirror.mjs`, block "C. Current level": entries of the season-S `careerStats` whose `playersMap[id].position` — the league position file's position, as the mirror uses — equals the row's position, with gamesPlayed ≥ 8; value > 0; sorted ascending), but each pool member's value is its own `level2` instead of `recencyWeightedPPG`.
- `ageAdj2Score` = the mirror's ageAdjusted formula with `levelPPG := level2`: `clamp(50 × (level2 / peakPPG) / ageFactor, 0, 100)`, `ageFactor = expectedMedianPPG / peakPPG`, `expectedMedianPPG = interpolateAgeCurve(curve, age)` or `peakPPG × 0.7` when age is null, `rawRatio = 0` when `ageFactor ≤ 0` (the mirror's own age convention, unchanged).
- Curve ratios: `c(x) = interpolateAgeCurve(H curve[position], x)`. Base age `a0 = age − 1` (season S, the latest `level2` season). `r_k = c(age + k − 1) / c(a0)` for k = 1, 2, 3 — the ages of outcome seasons S+1, S+2, S+3. If `age` is null or `c(a0) ≤ 0`, every `r_k = 1`.
- `ageFwdScore(β) = clamp(50 × level2 × F / peakPPG, 0, 100)`, `F = (1/3) Σ_{k=1..3} r_k × (1 − β)^max(0, age + k − 30)`; null age → `F = 1`. `peakPPG` = H's `positionPeakPPG[position]`. The exponent counts the outcome seasons played at age 30 or older (outcome season k is at age `age + k − 1`; it is ≥ 30 iff `age + k − 30 ≥ 1`, and each such season adds one more year of extra decline).
- `opportunityScoreChg` per §4.
- Composition: `weights` is an array of numbers in the candidate's component order (below). `component = Math.round(Σ_i weights[i] × comp_i)`, summed left to right in that order (for K0 this is `composeDynastyScore`'s term order, so K0 with `DYNASTY_WEIGHTS` reproduces it bit for bit). Path B rule, unchanged from the app: if `raw.seasonsOfData ≤ 2`, score = `Math.round(raw.prospectScore × 0.4 + component × 0.6)`, else score = component.

| id | components (in this order) | extra parameter | in selection |
|---|---|---|---|
| `K0` reweight | `raw.ageAdjScore`, `raw.trajectoryScore`, `raw.currentLevelScore`, `raw.effectiveReliability`, `raw.opportunityScore` | — | yes |
| `K1` no trajectory, two-year level | `ageAdj2Score`, `currentLevel2Score`, `raw.effectiveReliability`, `raw.opportunityScore` | — | yes |
| `K2` K1 + forward aging | `ageFwdScore(β)`, `currentLevel2Score`, `raw.effectiveReliability`, `raw.opportunityScore` | β ∈ `BETA_GRID` = {0, 0.04, 0.08, 0.12, 0.16, 0.20} | yes |
| `K3` K2 + no share-trend for movers | `ageFwdScore(β)`, `currentLevel2Score`, `raw.effectiveReliability`, `opportunityScoreChg` | β as K2 | **no — report-only** |

Birthdate ages and the guarded peak (S3b §8.11) are in every candidate (they are in H). Trajectory is dropped in K1–K3 rather than rebuilt: it hurt at every position in S3, K0 lets the fit set its weight to zero, and a rebuilt trajectory would be an untested design with more freedom. **K3 is never selectable:** its mover flag reads the S+1 season-totals team, which reflects in-season S+1 moves and is null (non-mover) for anyone with no S+1 row — both outcome-window information. It is fitted per fold and reported as `K3-oof` (§5.5) only, labelled with that sentence.

### 5.3 Fit (per candidate, per position, per fit set)
- Weights: `weightGrid(k)` = every vector of non-negative integers summing to 20 over k components (10,626 vectors for k = 5, 1,771 for k = 4); the weights used are those integers ÷ 20. For K2/K3 crossed with `BETA_GRID` (10,626 pairs).
- Objective: equal-weight mean over the fit cohorts of within-cohort ρ(score, M1) for that position, contributing cohorts only (§5.1). A fit set with no contributing cohort for a position → that fit is `insufficient`.
- Choice: highest objective; ties (objectives within 1e-12) → smallest L1 distance to the reference weights (distances within 1e-9 count as equal), then smaller β, then the lexicographically smallest integer vector. Reference weights: K0 = `DYNASTY_WEIGHTS` in component order; K1–K3 = `DYNASTY_WEIGHTS` without trajectory, each divided by 0.75 (age term → the candidate's age component, opportunity term → the candidate's opportunity component).

### 5.4 Folds (primary: buffered leave-one-cohort-out)
For each test cohort T ∈ 2015…2022, fit set = { F ∈ 2015…2022 : |F − T| ≥ 3 }. Reason: cohort F's outcome seasons are F+1…F+3, so |F − T| ≥ 3 means no fit row's outcome season is a test row's outcome season. (A split such as fit 2015–2019 / test 2020–2022 would share outcome seasons — 2019's window is 2020–2022 — so it is not used.) Resulting fit sets: 2015→{2018…2022}, 2016→{2019…2022}, 2017→{2020…2022}, 2018→{2015, 2021, 2022}, 2019→{2015, 2016, 2022}, 2020→{2015…2017}, 2021→{2015…2018}, 2022→{2015…2019}.

**Robustness (report-only):** forward-only folds, T ∈ 2018…2022, fit set = {2015 … T−3} — the procedure as it could have run in real time.

### 5.5 Selection (nested in each fold)
In each fold, fit all four candidates (§5.3) on the fit set. The fold's chosen candidate is the one **among K0, K1, K2** with the highest Σ over the four positions of its fitted objective (an `insufficient` fit counts 0 for every candidate); tie → lower index (K0 < K1 < K2). The chosen candidate's per-position weights (and β) score that fold's test-cohort rows. The resulting out-of-fold score is **P** (the procedure). Each candidate's own out-of-fold score (fitted per fold, no selection) is also kept as `K0-oof` … `K3-oof` (exploratory). Where a fold × position fit is `insufficient`, that fold's test rows of that position get P = null (and `K*-oof` = null for that candidate) and drop out of every comparison involving that score, by the paired-row intersection rule (`combine`).

### 5.6 Test statistics (primary)
On the eight test cohorts, per position, ρ(M1) of P, H, B1, B2 and `K*-oof`, each the equal-weight average over cohorts. Paired differences: `P~B2` (the pre-specified test), `P~B1`, `P~H`, `K*-oof~B2`, `K*-oof~H`. HR@12 / HR@24 (S3b §8.2 rules, minimums 36 / 72 rows) reported for P, H, B2, labelled, not gating.

### 5.7 Age tilt
Per position and score id, tilt = mean bias(`ge31`) − mean bias(`le24`) (§5.1, pooled over the eight test cohorts). Two statistics per position: `tilt(P)` and the paired reduction `tilt(H) − tilt(P)` (key `H~P`). Both, and the band means of P and H, are computed on the same rows: those where P is non-null and M2 is evaluable (percentile bias depends on the row set, so `tilt(H)` is not taken over rows P lacks). Band means for every band are also reported for P, H, B2.

### 5.8 Uncertainty
95% percentile CIs (`ciOf`), player-clustered bootstrap (clusters = `pid` within position; `bootstrapSpecs` over `clusteredBootstrap`, 4,000 resamples, seed 12345), copies of a drawn player as distinct rows (S3b §8.2 row identity). Fitted weights and chosen candidates are **fixed per fold**: the bootstrap resamples test rows and their out-of-fold scores; it does not re-fit. Each resample recomputes per-cohort statistics and their cohort average; differences are paired on the same resample. No multiplicity correction; the verdict calls the §5.10 conditions per position (`P~B2` ρ M1, the tilt criterion, and at QB also `P~B1` and the point-estimate floor) the pre-specified tests and everything else exploratory.

### 5.9 Minimum samples (below → `insufficient`, numbers still printed)
- ρ: ≥ 20 rows per cohort; a position's test result needs ≥ 6 of the 8 test cohorts contributing and ≥ 160 rows; a resample with fewer than 6 contributing cohorts is dropped (counted in `used`).
- Tilt: on the original data each of `le24` and `ge31` needs ≥ 30 M2-evaluable rows pooled over the test cohorts. A resample in which either band has < 30 rows is dropped for that tilt cell (counted in `used`): the tilt spec's `eval` returns `{ v: null }` on a short band (so `bootstrapSpecs`' non-finite check drops it) and carries `minC: 0` (no cohort minimum for tilt). A tilt cell with `used` < 2,000 is `insufficient`.
- Forward-only robustness: ≥ 4 of 5 test cohorts and ≥ 100 rows. Short horizons: per-cohort minimum only.

### 5.10 Decision rule (the only verdict on S4a)
Labels: `P~B2` → `beats-B2` (Δ CI lower > 0) · `loses-to-B2` (CI upper < 0) · `no-difference` · `insufficient`. Tilt → `tilt-removed` iff `tilt(P)` CI includes 0 **and** `tilt(H) − tilt(P)` CI lower > 0; else `tilt-remains`; `insufficient` if either tilt cell is `insufficient`.

`P~B1` is labelled the same way (`beats-B1` · `loses-to-B1` · `no-difference` · `insufficient`).

Per position, the position **passes** iff:
- **RB, WR, TE:** `P~B2` is `beats-B2` **and** tilt is `tilt-removed`.
- **QB:** all three of: (i) `P~B1` is neither `loses-to-B1` nor `insufficient`, and `P~B2` is neither `loses-to-B2` nor `insufficient`; (ii) the point estimate of `P~B2` (ρ, M1, `sleeper`, the eight test cohorts), **as stored in its Cell — rounded to 6 decimals by `assemble`** — is **`>=` `QB_B2_DELTA_FLOOR` = −0.052245**, the S3 panel's stored value of `h3|M1|sleeper|delta|H~B2|rho|QB|all` (displayed there as −0.052). `QB_B2_DELTA_FLOOR` is a constant in `lib/dynastyRework.mjs`, used by `decide`. The adapter's `readQbFloor(load)` reads that key through `load.loadS3Panel()` before any fold runs and throws `DynastyReworkStop` if its `value` is not exactly −0.052245; (iii) tilt is `tilt-removed`. (Anton, 2026-10-30.)

**`S4A-WIN`** iff all four positions pass. Otherwise **`S4A-NO-WIN`**, and the verdict states per position which condition passed or failed. On `S4A-NO-WIN` the verdict's last line is: "Per the S4 brief, Session 1 proposes the display-only fallback; no rework is forced."

### 5.11 Report-only outputs (never part of the decision)
- **Final model:** the procedure (§5.3 + §5.5) applied to all eight headline cohorts as one fit set — chosen candidate, per-position weights and β, in-sample objective — labelled "in-sample; the specification S4b would wire on `S4A-WIN`; not evidence". Printed under either outcome.
- **Fold table:** each fold's chosen candidate and weights (stability of the choice).
- **Forward-only robustness** (§5.4) and **short horizons** (T = 2023: fit {2015…2020}; T = 2024: fit {2015…2021}; M1 with h = 2 / 1; each its own table, "not pooled").
- **2025 preview** (outcome-free): final-model score vs H on the S = 2025 rows — per position, counts with |Δ| ≥ 5 and ≥ 10, and the count of label changes with `pickDynastyLabelMirror` fed the row's H `signals` and the new score (labels keep today's bands and today's `slope` input). Labelled "birthdate ages; not the app's current scores".

### 5.12 Vocabulary
The verdict prints only: `S4A-WIN`, `S4A-NO-WIN`, the §5.10 labels, S3b §8.9 labels for ρ (`predictive` …), baselines (`beats-B1` …) and bias cells (`overrates` …), and `insufficient`. Weights and β appear only in the §5.11 final-model and fold tables. No sentence recommends wiring; S4b is decided by Anton on the verdict.

### 5.13 Hash
SHA-256 over this task file's UTF-8 text split on LF: from the line after the first line that is exactly `## 4. Row set and S3 parity` up to (not including) the first later line that is exactly `## 6. Outputs`; whole-line equality (a mention inside a line, as here, does not count); rejoined with LF, no trimming. It covers §4 and every subsection of §5. Session 2 computes it once from the approved file as committed by Session 1 and pins it as `DYNASTY_REWORK_PREREG_SHA256`. `assertPrereg(load)` recomputes it from the file and **stops** on mismatch; it is the **first statement** of `runProbe` and `runDynastyRework`, before any loader is called (as S3 does at `scripts/dynasty-history-run.mjs:799`), so a placeholder constant blocks every real-data run. Printed in the verdict header and stored as `meta.preregSha256`.

## 6. Outputs

`node bin/backtest.mjs --dynasty-rework --write` writes, unregistered:

**`backtests/<date>-dynasty-rework-panel.json`** — `meta` { `generatedAt`, `dataRev`, `pinnedInputsRev: "a791db0"`, `s3Panel` (path + its `meta.preregSha256`), `preregSha256`, `foldPlan`, `forwardFoldPlan`, `parity` (rows checked, 0 mismatches), `gridSizes`, `runtimeMs` }; `rows[]` { `pid`, `S`, `position`, `age`, `path`, `H`, `B1`, `B2`, `outcome`, `changer`, `level2`, `currentLevel2Score`, `ageAdj2Score`, `r` [r1, r2, r3], `opportunityScoreChg`, `P` (out-of-fold, headline rows), `oof` { K0…K3 } }; `folds[]` { `T`, `fit`, `perCandidate` { K → { pos → { weights (integers of 20), beta, objective } | "insufficient" } }, `chosen` }; `forwardFolds[]`, `shortFolds[]` (same shape); `final` (same shape, no `T`); `metrics` — Cells `{ value, ci95, used, n, cohortsUsed, label }` keyed by the imported `metricKey`: `horizon` ∈ `h3`, `h3-fwd`, `h2-2023`, `h1-2024`; `measure` ∈ `M1`, `M2`; `mode` = `sleeper`; `kind` ∈ `level`, `delta`, `bias`, `tilt`; `level` subjects: `P`, `H`, `B1`, `B2`, `K0-oof`, `K1-oof`, `K2-oof`, `K3-oof`; `delta` subjects: `P~B2`, `P~B1`, `P~H`, and `K0-oof~B2` … `K3-oof~B2`, `K0-oof~H` … `K3-oof~H`; `bias` subjects: `P`, `H`, `B2`; for `tilt`, `subject` ∈ `P`, `H`, `B2`, `H~P` and `statistic` = `tilt`; `cell` = `all` for `level`, `delta` and `tilt`, the band name for `bias`; `summary` { pos → { b2Label, b1Label, b2Delta, tiltLabel, pass } }, `qbB2DeltaFloor` (−0.052245, as read from the S3 panel), `decision` (`S4A-WIN` | `S4A-NO-WIN`); `preview2025` (§5.11). Panel ≤ 15 MB (**stop** above).

**`grading/<date>-dynasty-rework-verdict.md`** — sections in order:
1. Header: date, data rev, pinned-inputs rev, S3 panel + its prereg hash, this prereg hash, "offline research; nothing ships".
2. **Decision** — the `S4A-WIN`/`S4A-NO-WIN` line, then one plain-language paragraph per position for Anton (the two pre-specified tests with numbers and labels), then one paragraph on what the exploratory `K*-oof` rows show (K3 with its report-only sentence), then the §0 caveats.
3. Primary table: ρ for P, H, B1, B2 and the Δs with labels, per position.
4. Age tilt table and band means (P, H, B2).
5. Exploratory: `K*-oof` vs B2 and H; HR@12/@24.
6. Fold table (chosen candidate per fold, weights). 7. Final model (§5.11 label). 8. Forward-only robustness. 9. Short horizons. 10. 2025 preview. 11. Parity record and row counts per cohort × position.

---

## 7. CLI and the real-data rule

`bin/backtest.mjs`: `--dynasty-rework` accepts only `--json`, `--write`, `--probe`; anything else → error "seasons, candidates, grids and folds are pinned by the task file, not knobs", exit 1 (copy the `--dynasty-history` reject block). Dispatch `process.exit(dynastyReworkMain({ write, asJson, probe }))`.

**Real-data rule (from the S4 brief; S3 had a disclosed lapse here):**
1. Until the commit that pins `DYNASTY_REWORK_PREREG_SHA256`, nothing runs against the real store — tests and development use synthetic in-memory loaders only. `assertPrereg` first (§5.13) makes this structural.
2. After that commit, `--probe` may run any number of times. In probe mode the progress log is a no-op. It builds rows for S = 2015 and S = 2018 only, runs the parity check on them, times one fit (K0, WR, fit set {2015, 2018}) and times 50 bootstrap resamples of the primary ρ and tilt specs on those two cohorts' rows (computed, not printed). It prints **only** lines matching `^[A-Za-z0-9_.-]+: \d+( ms)?$`: row counts, parity rows checked, mismatches, grid sizes, the timings, and `projected_total: <n> ms` from this formula — fit time × Σ over every fit set (8 primary, 5 forward, 2 short, 1 final) × 4 positions × 4 candidates of (that fit set's row count for the position ÷ the probe fit's row count) × (that candidate's grid size ÷ 10,626) + bootstrap time × (4,000 ÷ 50) × (headline row count ÷ probe row count) × (number of specs in the run ÷ number in the probe). Any thrown error prints `stop_<ErrorClassName>: 1` and exits 1, with no message text (messages can carry values). A parity mismatch prints its count and exits 1.
3. The pinned run (`--write`) is run **once**. A crash mid-run may be re-run after a code fix, disclosed in the hand-back with what changed; a completed run is never re-run to change a result.

---

## 8. Tests — `test/dynasty-rework.test.mjs` (synthetic loaders and hand-built rows only, except T-PATHB's committed fixtures and T-HASH's task file)

- **T-GRID:** `weightGrid(5)` has 10,626 vectors and `weightGrid(4)` 1,771; every vector is non-negative integers summing to 20.
- **T-COMP:** on hand-built rows: `level2` (both seasons qualify; only S qualifies; only S−1 qualifies); `currentLevel2Score` against a hand-sorted pool; `ageAdj2Score` incl. the null-age path; `ageFwdScore` with β = 0 equals the curve-only value with base `c(age − 1)` and ratios at ages `age`, `age + 1`, `age + 2`; with β = 0.1 at `age` = 30 applies (0.9)^1, (0.9)^2, (0.9)^3 to k = 1, 2, 3, at `age` = 29 applies 1, (0.9)^1, (0.9)^2, and at `age` = 27 applies nothing — hand-derived literals with the arithmetic in comments; null age → F = 1.
- **T-PATHB:** on `test/fixtures/dynasty-mirror-parity/inputs-2019.json`, run `dynastyScoreMirror` with `expected-2019.json`'s own curves and peaks (the golden's configuration, not H) to get `raw`; for every Path B and Path C row, `composeCandidate(row, 'K0', [0.28, 0.25, 0.22, 0.10, 0.15], null)` equals the golden `score` and equals `composeDynastyScore(raw)`.
- **T-FIT:** on a synthetic set where a known corner ranks perfectly (all weight on `currentLevel2Score`), `fitCandidate` finds it; tie-break order (L1 to reference with the 1e-9 tolerance, then β, then lexicographic) on a constructed tie whose L1 distances differ only by floating-point noise.
- **T-FOLD:** `foldPlan('loco')` equals the §5.4 list exactly, and no fit cohort is within 2 of its T; `foldPlan('forward')` equals T 2018…2022 with fit {2015…T−3}; perturbing a test cohort's outcomes leaves that fold's fitted weights unchanged.
- **T-SEL:** selection over K0–K2 by summed objective; K3 is never chosen even with the highest objective; `insufficient` counts 0; tie → lower index; an `insufficient` fold × position leaves P null for those test rows and they drop out of the paired comparison.
- **T-TILT:** tilt sign and value on hand-built bands; `tilt-removed` needs both conditions; a short band → `insufficient`; resamples with a short band are dropped and counted, and `used` < 2,000 → `insufficient`.
- **T-DEC:** `decide` returns `S4A-WIN` only when RB, WR, TE each have `beats-B2` and `tilt-removed` and QB passes §5.10's three conditions. Cases: RB/WR/TE `no-difference`, `loses-to-B2`, `insufficient` or `tilt-remains` → `S4A-NO-WIN`; QB `no-difference` on both with point Δ −0.05 and `tilt-removed` → passes; QB point Δ −0.06 → fails; QB point Δ exactly −0.052245 → passes; QB `loses-to-B1` → fails; QB `insufficient` on either baseline → fails; QB `tilt-remains` → fails. `readQbFloor` on a synthetic `loadS3Panel` whose QB key is not −0.052245 → `DynastyReworkStop`. `decide` compares the rounded Cell value (a raw −0.0522451 stored as −0.052245 passes).
- **T-BOOT:** paired bootstrap with P ≡ B2 gives Δ ≡ 0 and CI [0, 0]; weights stay fixed across resamples.
- **T-PARITY:** a synthetic S3 panel differing in one H score, one row, or one outcome makes `checkS3Parity` throw `DynastyReworkStop` whose message has counts only.
- **T-PIN:** `DYNASTY_REWORK_LOAD.loadPlayerIds` and `.loadRawPlayers` read rev `a791db0` through `gitShow` (assert the git arguments, `maxBuffer: 1 << 30` and `cwd` through the injectable exec seam; no store read).
- **T-GATE:** with a wrong pinned hash, `runProbe` and `runDynastyRework` throw `DynastyReworkStop` and a spy loader records **zero** calls.
- **T-PROBE:** `runProbe` on synthetic loaders emits only lines matching `^[A-Za-z0-9_.-]+: \d+( ms)?$`, including on a forced stop (`stop_DynastyReworkStop: 1`), and calls no logger other than its line printer.
- **T-HASH:** `preregHash` extracts exactly the §4–§5 span (a sample mentioning `## 6. Outputs` inside a line does not end it); a one-character change in §4 or §5 changes it, a change outside does not; the pinned constant equals the hash of the committed `.claude/tasks/dynasty-rework-s4a.md`.
- **T-CLI:** `--dynasty-rework --basis league` exits 1 with the pinned message.
- **T-KEYS:** every number the verdict prints has a `metrics` key or sits in `folds`/`final`/`preview2025`; keys round-trip through `parseMetricKey`.

---

## 9. Docs

- `README.md`: Module notes rows for `lib/dynastyRework.mjs` and `scripts/dynasty-rework-run.mjs`; backtest-modes list gains `--dynasty-rework` (outputs, stops, the pinned-inputs rev, the real-data rule, "offline; not the snapshot grader").
- `CLAUDE.md` (20,626 of 25,000 bytes today): Commands Backtest row gains `--dynasty-rework [--probe]`; `lib/backtest.mjs` nav row gains "`lib/dynastyRework.mjs` S4a's candidate scores, grid fit and folds". Nothing else.

---

## 10. Stops (report, never improvise)

- A needed change to an S3a/S3b module or any app file, or an S3 private helper not listed in §3.
- S3 parity fails (§4) on the pinned inputs — stop; report the counts only.
- Prereg hash mismatch; panel > 15 MB; a window season `inProgress`; birthdate coverage < 95% in a headline cohort (S3b §5 rule); `git show a791db0:…` fails.
- A real-data run other than `--probe` before the pinned run, or a probe that would print a value (§7).
- `projected_total` from the probe above 3 hours — report the probe output; Session 1 decides (e.g. caching score vectors), never shrink the grid unilaterally.
- Any design question this file does not answer.

---

## 11. Done-definition and hand-back

0. Before Session 2: Session 1 commits the approved task file alone to data `main` (`tasks: S4a dynasty rework plan (approved)`). Session 2 checks it is unchanged from that commit before pinning.
1. `npm test` and `npm run smoke` green.
2. Commit 1: code + tests + docs with the pinned hash. Then optional `--probe` runs; paste their output.
3. `node bin/backtest.mjs --dynasty-rework --write` once on data `main`; commit both outputs (commit 2). Paste the verdict's §2 and §3 into the hand-back.
4. **Push only after Anton's sign-off** (`git pull --rebase origin main`, never `--force`).
5. Hand-back: SHA range, every file touched, every deviation, what each test asserts, the pinned hash, probe outputs, runtime, and any re-run (§7.3). Session 1 runs implementation-reviewer at full depth on the diff.

Session 1 records the sign-off and the decision in `future_plans/in-season-notes-plan.md` and strikes the calendar line.

---

## 12. S4b — outline only (not part of this slice; planned only on `S4A-WIN`)

Recorded so S4a's outputs carry what S4b needs. S4b gets its own task file and review.
- **Mirror parity first:** implement the final model in the data mirror and the app's `computeDynastyScore` in lockstep; regenerate the S3a goldens on the new app commit; a **new CR-32 parity check** for the new score path; registry entry updated in the same change (parent-folder session — it writes both repos). Whatever S4b wires from `lib/dynastyRework.mjs` moves into CR-32's Data sites (or into the mirror itself).
- **Birthdate ages and the peak guard in the app's dynasty path:** needs a `birthdate` field in the playerids index, a `PLAYER_ID_INDEX_VERSION` bump (`src/utils/playerIdCrosswalk.js:13`) and a CR-31 amendment that states whether `birthdate` is nullable (the data side's `validatePlayerIds` only counts entries with one today) and updates both sides.
- **No projection change (CR-15):** `computeEmpiricalAgeCurves` is also a CR-15 site feeding the projection path. S4b builds a **separate** guarded, birthdate-aged curve bundle for the dynasty score and leaves the projection's curve and age inputs untouched, so `projectedPPG` does not move and no `PRIOR_MODEL_FROM` bump is needed. If that separation proves impractical, the change becomes a projection-model change (stale-age backlog entry: bump required) and goes back to Anton.
- **Snapshots record dynasty scores** (`players[id].dynasty`): a dated note in `grading/anchor-policy.md` marking the dynasty-score boundary (dynasty only; projection segments unaffected). No CR-01 change (no data-side reader of `.dynasty` exists).
- **Labels move:** label bands and the `slope` input to `pickDynastyLabel` stay unless Anton decides otherwise on the 2025 preview (§5.11).
- Timeline: S4b plan 2026-11-07, live by 2026-11-13.

---

## 13. Cross-repo

No edit to a shared contract in S4a: no registry entry, no app read. `lib/dynastyRework.mjs` re-implements pieces of CR-32 app logic (the age-adjusted formula as `ageAdj2Score`, the Path B 0.4/0.6 blend, `percentileRank`). These are a one-shot research copy, frozen at data `95b9f15` (app dynasty code at `95ba1e1`), guarded for K0 by T-PATHB, and not a live coupling: nothing in the app or the store depends on them. The precedent is `lib/ageCurveVariants.mjs`, also unindexed. S4b indexes whatever it wires (§12).

---

## 14. Open for Anton before the hash is pinned

**Decided (Anton, 2026-10-30):** the QB rule in §5.10 — clear win over B2 at RB, WR and TE; at QB no loss to B1 or B2 and a `P~B2` point estimate at least S3's H (−0.052245); age-lean removal at all four. Nothing is open.

---

## 15. Revision 2 record (plan review of Revision 1, full depth, 21 flags)

1. T=2017 fit set corrected to {2020…2022} (§5.4). 2. `ageFwdScore` re-indexed to outcome-season ages (§5.2, T-COMP). 3. K3 report-only (§5.2, §5.5, T-SEL). 4. Parity inputs pinned to `a791db0` (§3, T-PIN). 5. T-PATHB reworded to the golden's own configuration. 6. Hash span extended to §4–§5 (§5.13). 7. S3 private helpers and `leagueBasisLoad` listed, copy-verbatim rule (§3). 8. `assertPrereg` first, T-GATE (§5.13, §8). 9. Probe logging and stop printing defined (§7). 10. Runtime projection formula (§7). 11. Integer-twentieths weights and L1 tolerance (§5.3). 12. `insufficient` fold × position → null P (§5.5). 13. Tilt per-resample minimum (§5.9). 14. `cell` values (§6). 15. `weights` type and term order (§5.2). 16. Pool position wording (§5.2). 17. Task-file commit owner (§11.0). 18. T<F input-overlap caveat (§0). 19. CR-32 copy rationale (§13). 20. CR-15 separation (§12). 21. CR-31 `birthdate` nullability (§12).

**Light review of Revision 2 (2026-10-30):** 12 flags, all mechanical, folded without another round (Anton) into §2, §3, §4, §5.7, §5.9, §5.10, §6 and §8 (T-DEC, T-PIN).
