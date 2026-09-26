# In-season evidence — Phase 2a: graded backtest (offline)

Session 1 (opus), 2026-09-26. Implementation: Session 2 (sonnet). **Offline analysis only.**

## 0. Goal and fixed decisions

Anton decided (do not reopen) that the live season counts on the dynasty side. Phase 1 shipped
view-only in the app (`src/utils/inSeasonEvidence.js`, Market "In-season" tab) using k constants
from an out-of-repo study. This slice reproduces that study in-repo against the **real
reconstructed pre-season projection**, re-fits k out of sample, answers Q1–Q8 below, and emits a
constants table + provenance fixture that Phase 2b (app, later) pins when it switches scoring on.

**Never write** `nfl/`, `nflverse/`, `college/`, `ktc/`, `snapshots/`, `enrichment/`,
`manifest.json`, `cross-repo-registry.md` or `.github/workflows/`. Outputs go to `backtests/` and
`grading/` only (unregistered — the documented Invariant 3 exception for analysis output).

**Basis: pinned `half_ppr`.** Fitting a dimensionless k on the half-PPR panel is acceptable and
the verdict states it; a league-basis refit belongs to the existing custom-basis backlog item.

### The study (for side-by-side reporting — `STUDY_K`, §3.1)

Population: skill players with ≥ 8 prior-season games, 2012–2025, half-PPR. Prior = raw
last-season PPG. `w = n/(n+k)`. Opportunity = targets + carries (QB: attempts + carries).

| cell | QB | RB | WR | TE |
|---|---|---|---|---|
| ROS points | 6 | 3 | 4.5 | 5.5 |
| ROS opportunity | 5 | 2 | 2.5 | 2.5 |
| ROS target share | — | — | 2.3 | 2 |
| Next points | 7.5 | 4.5 | 6.5 | 6.5 |
| Next opportunity | 5.5 | 3.5 | 4.5 | 4 |
| ROS points, weak prior | — | 3 | 3.5 | 4 |
| ROS points, strong prior | — | 3 | 5 | 6 |

### Questions (the verdict answers each with a measured result, or says plainly why not)

Q1 k per signal × position × horizon with the real reconstructed projection as prior ·
Q2 does opportunity+points beat points-only out of sample · Q3 weak/strong split at the
next-season horizon, and projection confidence as the scaling variable · Q4 rookies and players
with no ≥ 8-game prior season, prior = rookie-path projection · Q5 baseline lookback: last season
vs last season with ≥ 4 games · Q6 a cross-position-fair usage-shift sort measure · Q7 depth-chart
double count: freeze the prior or accept · Q8 which k set drives the dynasty score, which the
season projection.

### Session 1 decisions (each with its reason)

| # | Decision | Reason |
|---|---|---|
| D1 | New mode **`bin/backtest.mjs --inseason`**, adapter `scripts/inseason-run.mjs`, pure logic `lib/inSeasonEvidence.mjs` — not a `bin/panel.mjs` mode | The rookie prior must be the **shipped (corrected)** projection — that is what the app blends. `reconstructShippedRookieProjection` lives in `lib/rookieMirror.mjs`, which `test/rookie-mirror.test.mjs` T-RM1 forbids anywhere in `bin/panel.mjs`'s import closure. `bin/backtest.mjs` is an existing analysis CLI outside that closure. No rookie constant is fitted here, so the re-fit trap does not apply (§6 CR-15). |
| D2 | Own population enumeration; **not** `assemblePanel`'s rows | `buildPanelRow` gates on ≥ 6 predictor games, volume gates and ≥ 6 outcome-season games. That drops early-injured players, low-volume backups and returning starters — the Q4/Q5 populations. Rows go straight to `attachFactorMultipliers` with a context built by an extracted helper (§2.1). |
| D3 | Primary checkpoint = **calendar week W ∈ 1..12**, n = games played in weeks 1..W | This is what the app sees: `n` = live `gamesPlayed` (CR-21 Invariant). A study-reproduction arm keeps the study's "first n played games" framing (§3.3 arm S). |
| D4 | Primary points prior = projection **frozen at the season's week-1 depth chart**; a live-depth prior is the Q7 comparison | The design doc's mechanism says the prior is frozen; week 1 is the nearest historical proxy for a pre-season capture. The pinned constants follow Q7's pre-registered rule (§4 Q7). |
| D5 | Opportunity and target-share cells use the **raw last-season baseline** as prior | The app has no projected-volume prior (parent file finding 2). Q1 says so for those cells rather than inventing one. |
| D6 | Weekly opportunities come from `nflverse/gamelogs` (REG only); **weekly points from `nfl/season-totals` `weeklyPoints`** | Season-totals has no weekly opportunity split. Gamelogs is used as a weekly decomposition of season-totals stats only, behind a reconciliation gate (§3.2). No gamelogs value reaches the app. See §6 CR-09. |
| D7 | k fitted by grid over integer tenths 0.0–40.0, squared-error loss, rows equal weight; pinned value rounded to nearest 0.5 | Sufficient statistics make the fit exactly re-derivable from a small fixture (§5.2). CIs will exceed 0.5, so finer pins would be false precision. |
| D8 | Validation = **leave-one-season-out** (LOSO) over outcome season S; CIs = player-clustered bootstrap, 4000 resamples, seed 12345, **mulberry32** (integer-safe, `Math.imul`) — **not** `runStep4Verdict`'s LCG | Brief allows LOSO; 12 folds beat forward-chain's ~9. The Step 4 LCG multiplies past 2^53 in doubles: from seed 12345 it falls into a 10,466-state cycle at draw 5,937, 99.6% even (measured). Resample count and seed follow Step 4; the generator must not. The Step 4 defect is pre-existing and out of scope here. |

**Grounding probe (Session 1, scratchpad, read-only, 2026-09-26).** Two facts Session 2 relies on:
(a) gamelogs REG opportunity sums reconcile with season-totals `stats` on **7,020 / 7,021**
player-seasons (gp ≥ 4, tolerance `max(2, 3%)`); (b) the study's ROS-points k reproduces from the
store under arm S's exact definition (§3.3): **QB 5.0, RB 3.0, WR 4.2, TE 4.5** (study 6 / 3 / 4.5 /
5.5). (b) is a regression pin on Session 2's code (§7 test 3), not a finding to report as new.

---

## 1. Touch list

| File | Change |
|---|---|
| `lib/panel.mjs` | `attachFactorMultipliers` ctx gains two optional keys, defaults byte-identical (§2.2) |
| `scripts/panel-run.mjs` | extract `loadFactorInputs` + `buildFactorContext` from `assemblePanel`; `assemblePanel` calls them (§2.1). No other change. |
| `lib/inSeasonEvidence.mjs` | **new**, pure (§3) |
| `scripts/inseason-run.mjs` | **new**, adapter, injectable `load` (§4) |
| `bin/backtest.mjs` | `--inseason` mode (§4.6) |
| `package.json` | script `"backtest:inseason": "node bin/backtest.mjs --inseason"` |
| `test/inseason.test.mjs` | **new** (§7) |
| `README.md` | new `### In-season evidence k-fit (bin/backtest.mjs --inseason)` under Analysis / Backtesting; `lib/panel.mjs` Module-notes sentence moved in (§8) |
| `CLAUDE.md` | Backtest row + two nav rows; prune to stay ≤ 25,000 bytes (§8) |
| `backtests/`, `grading/` | artifacts from `--write`, separate commit (§9) |

---

## 2. Changes to existing code (CR-15 triggers — §6)

### 2.1 `scripts/panel-run.mjs` — extract, don't fork

Move the loading block of `assemblePanel` (years list, `buildOutcomeMaps`, `inputsByYear`,
`playerIds` → `crosswalk`/`birthdateBySleeper`, `snapsByYear`) into
`export function loadFactorInputs({ fromYear, toYear, basis, scoringFrom, load, withFactorMultipliers, historyFloor })`
returning `{ years, scoring, basisMeta, outcomeMapsByYear, inputsByYear, crosswalk, birthdateBySleeper, snapsByYear }`.
Move the `withFactorMultipliers` ctx construction (`totalsByYear`, `ppgByYear`, `advstatsByYear`,
`rosterByYear`, `teamOf`, `teamTotalsByYear`, `depthByYear`, `birthdateOf`) into
`export function buildFactorContext(inputs, { attribution, fromYear, toYear, regressionModel, load })`
returning exactly the object `assemblePanel` passes to `attachFactorMultipliers` today.
`assemblePanel` calls both; its signature, return value and every field are unchanged.
**Byte-identity is the acceptance test** (§7 test 1).

### 2.2 `lib/panel.mjs` — two ctx seams on `attachFactorMultipliers`

Destructure two new optional keys from `ctx`:

- `requirePositiveOutcome = true` — when `false`, skip only the `nonPositiveOutcome` drop
  (`if (!(row.outcomePPG > 0))`); `nonPositiveAnchor` stays. In-season rows carry
  `outcomePPG: null` (the outcome differs per checkpoint and horizon and is attached later).
- `depthOrderOf = null` — when a function, Step 8 calls
  `depthOrderOf(pid, position, lastQSeason, lastQTeam)` instead of the inner `resolveDepthOrder`;
  it returns an order (1-based) or `null`, and the existing `sentinelHit`/coverage bookkeeping
  runs unchanged on its result. `resolveQb1` is **not** touched (qbQuality is a flat 50 on the
  whole panel — `fitCoverage.qbQuality.ungraded`).

Add a short header comment on each: in-season backtest seams, defaults reproduce every
committed artifact.

---

## 3. `lib/inSeasonEvidence.mjs` (pure, no I/O)

### 3.1 Constants

```js
export const IN_SEASON_DEFAULTS = {
  seasons: { from: 2014, to: 2025 },        // outcome season S (ROS); veteran prior needs Y = S-1 >= 2013
  nextTo: 2024, plus2To: 2023,              // next-season horizon S <= 2024; S+2 diagnostic S <= 2023
  maxLoadSeason: 2025,                      // never read a season-totals/gamelogs file above this
  checkpoints: [1,2,3,4,5,6,7,8,9,10,11,12],
  minRosGames: 4, nextMinGames: 6,           // 6 = OUTCOME_PLAYED_THRESHOLD
  kGridMaxTenths: 400,
  minCellPlayers: 60, minCellRows: 300,
  bootstrap: { resamples: 4000, seed: 12345 },
  minPriorGames: 8,                          // study population / Phase 1 MIN_PRIOR_GAMES
  minBaselineGames: 4, minBaselineOpp: 2.0,  // Phase 1 MIN_BASELINE_GAMES / MIN_BASELINE_OPP
  lookbackSeasons: 3,                        // Q5 arm B: S-1..S-3
  roleChangeRel: 0.5,                        // Q2 secondary subgroup
  q6Checkpoints: [3,4,5,6],
};
export const STUDY_K = { /* §0 table verbatim; keys ros.points, ros.opp, ros.share, next.points, next.opp, ros.pointsWeak, ros.pointsStrong */ };
// FROZEN historical comparator: app src/utils/inSeasonEvidence.js as shipped in Phase 1 (read by Session 1
// 2026-09-26). Never update it to later app values. Q4's comparator is the rule Phase 1 applied to THAT row:
// S-1 gp < 8 (extrapolated) → RB/WR/TE rosWeak, QB rosPoints.QB; S-1 gp ≥ 8 (e.g. second-year players in
// X-rookie1p) → the band rule (rosWeak/rosStrong by band, QB rosPoints.QB). Next horizon: dynPoints always.
export const PHASE1_K = {
  rosPoints: { QB: 6, RB: 3, WR: 4.5, TE: 5.5 },
  rosWeak:   { RB: 3, WR: 3.5, TE: 4 },  rosStrong: { RB: 3, WR: 5, TE: 6 },
  rosOpp:    { QB: 5, RB: 2, WR: 2.5, TE: 2.5 },
  dynPoints: { QB: 7.5, RB: 4.5, WR: 6.5, TE: 6.5 },
  dynOpp:    { QB: 5.5, RB: 3.5, WR: 4.5, TE: 4 },
};
```

### 3.2 Evidence primitives

- `opportunities(game, position)` — QB `attempts + carries`, else `targets + carries`; absent
  key = 0.
- `reconcileOpportunities(gamelogsPlayer, seasonTotalsRow, position)` → `{ ok, diff }`, tolerance
  `|diff| ≤ max(2, 0.03·total)` over REG games vs `stats.{pass_att|rec_tgt} + stats.rush_att`.
  **Gate population:** season-totals rows 2012–2025, non-`TEAM_`, position ∈ QB/RB/WR/TE via
  `resolvePosition` (§4.1 step 2's resolver), gp ≥ 4, **and present in that season's gamelogs**
  (the probe's 7,020/7,021 is over crosswalk position + gamelogs presence; Session 2 reports its
  own count). **Stop (non-zero exit, no artifacts) if the pass rate is < 0.99.** Report
  separately: skill player-seasons absent from gamelogs (their opportunity/share cells are `null`;
  counted in §4.3) and each season's gamelogs `unmapped` count (team-target denominators omit
  those rows — a stated limitation).
- `buildCheckpoints({ weeklyPoints, teamGameWeeks, oppByWeek, targetsByWeek, teamTargetsByWeek, checkpoints })`
  → one entry per W: `{ W, n, obsPPG, obsOpp, O, obsShare, missedInWindow, rosGames, rosPPG, rosOpp, rosShare }`.
  Played weeks = keys of `weeklyPoints` (numeric, sorted). `n` = played weeks ≤ W. `O` = window
  opportunities. `missedInWindow` = (weeks ≤ W in which the player's season-totals S `team` has a
  REG game in `nflverse/schedule/<S>.json`) − n > 0. **Not** `weeklyStatus`: historical `'X'`
  means "absent from Sleeper's response" (`lib/sleeper.mjs` header) and so covers IR/unrostered
  weeks as well as byes. `team` and schedule codes are both era-accurate (CR-16). For a mid-season
  mover (> 1 distinct gamelogs `team` in S) `missedInWindow = null` and the row is left out of the
  Q1(c) diagnostic only. ROS = played weeks > W. `obsShare`/`rosShare` = Σ player targets / Σ team
  targets over the player's own played weeks in that window (team totals are gamelogs sums per
  `(team, week)` in gamelogs' own `team` domain — never mixed with season-totals codes, CR-16).
  A played week in `weeklyPoints` with no gamelogs REG row contributes points but no opportunity;
  count those (`oppMissingWeeks`) and set `obsOpp`/`obsShare` to `null` for any window containing one.

### 3.3 Arms (the population/prior combinations)

Rows are `(pid, S, W)` with `n ≥ 1`; n = 0 rows carry no evidence and are counted, not fitted.

| Arm | Population | Points prior | Checkpoint |
|---|---|---|---|
| **P** (primary) | veteran path at Y = S-1 **and** S-1 gp ≥ 8 | frozen projection (D4) | calendar W |
| **L** (Q7) | same as P | live projection: depth chart of S week `min(W+1, lastWeek)` | calendar W |
| **R** (study, calendar) | S-1 gp ≥ 8 (any path) | raw S-1 PPG | calendar W |
| **S** (study reproduction) | S-1 gp ≥ 8; position = `playerids.ids` crosswalk only; S 2013–2025 | raw S-1 PPG | first n played games, n = 1..8, requires ≥ n + 4 played games; ROS = the rest |
| **X** (Q4) | every row not in P: **X-rookie0** (rookie path, no season-totals appearance before S), **X-rookie1p** (rookie path with an earlier appearance — includes second-year players with S-1 gp ≥ 8, whom `rookiePathStateAt` routes to the rookie path exactly as the app's `yearsExp <= 1` does; reported as their own line too), **X-short** (veteran path, S-1 gp < 8) | rookie path: shipped rookie projection; veteran path: frozen projection | calendar W |

Arm P + arm X partition every candidate row with a prior; §4.3 accounts for the rest.

Opportunity cells use prior = S-1 opp/g from **season-totals S-1 `stats`** (`pass_att`/`rec_tgt` +
`rush_att`, ÷ gp) — what the app blends (CR-21) — eligible only when S-1 gp ≥ `minBaselineGames` and
S-1 opp/g ≥ `minBaselineOpp` (Phase 1 `hasBaseline`), except in Q5; Q3's band median and Q5's
lookback baselines use the same season-totals source. Only the in-season weekly split and target
share (prior and evidence) come from gamelogs.

### 3.4 Fitting

- `suffStats(rows, { prior, obs, outcome })` → `Map<n, { count, Saa, Sab, Sbb }>` with
  `a = prior − outcome`, `b = obs − prior`; loss(k) = Σₙ `Saa + 2w·Sab + w²·Sbb`, `w = n/(n+k)`.
  Also a per-cluster (sleeperId) version for the bootstrap.
- `fitK(stats)` → `{ kTenths, k, loss, boundary }`: argmin over integer tenths t ∈ [0, 400],
  `k = t/10`, ties → smaller t; `boundary` is `'low'` at t = 0, `'high'` at t = 400, else `null`.
  Never accumulate a float k in a loop (the probe did; this must not).
- `pinK(k)` → `Math.round(k * 2) / 2`.
- `loso(rowsBySeason, { fit, predict })` — for each S, fit on all other seasons, predict S. Returns
  per-fold `{ S, fitted, n, mae, rmse }`, pooled held-out MAE/RMSE, and the per-row held-out
  predictions (sleeperId, S, W, n, pred, actual) for paired comparisons.
- `mulberry32(seed)` — the standard 32-bit generator built on `Math.imul` and `>>> 0` (returns
  `[0, 1)`); never the `runStep4Verdict` LCG (D8).
- `clusteredBootstrap(clusters, statFn, { resamples, seed })` — `mulberry32(seed)`, resample
  clusters with replacement, 2.5/97.5 percentile CI. Used for (i) CI of fitted k (refit per resample from summed per-cluster
  stats) and (ii) CI of paired ΔMAE (mean of per-row `|errB| − |errA|`, same convention as
  Step 4 — never compared with `===` to a difference of MAEs).
- `cellVerdict({ rows, players })` — `INSUFFICIENT` when players < 60 or rows < 300; nothing is
  fitted or reported for an INSUFFICIENT cell except its counts.
- `compareLabel(ci)` — `BEATS` (CI entirely < 0), `WORSE` (entirely > 0), `NO-GAIN` (spans 0).

### 3.5 Combination forms (Q2)

Eligible rows: `hasBaseline` (§3.3). `effPrior = pointsPrior / oppPrior` (the projection's implied
points per opportunity), `effObs = window points / O`.

- **VE (volume × efficiency):** `pred = blend(oppPrior, obsOpp, n, kOpp) · blend(effPrior, effObs, O, kEff)`,
  `kEff` in opportunities. In-fold 2-D grid: kOpp ∈ {0, 0.5, …, 15}, kEff ∈ {0, 5, …, 300}; ties →
  smaller kOpp then smaller kEff.
- **G (opportunity increment):** `pred = pointsPost(kPts) + γ · (n/(n+kOpp)) · (obsOpp − oppPrior) · effPrior`,
  kPts and kOpp from their own in-fold single-signal fits, γ in-fold by closed-form least squares.
- Baseline arm: points-only with its in-fold kPts.

`blend(prior, obs, n, k)` is `prior + (n/(n+k))·(obs − prior)`, with k = 0 meaning `obs`.

---

## 4. `scripts/inseason-run.mjs` — `runInSeason({ load = DEFAULT_LOAD } = {})`

Imports `DEFAULT_LOAD`, `loadFactorInputs`, `buildFactorContext` from `./panel-run.mjs`;
`attachFactorMultipliers`, `predictFullPipeline`, `rookiePathStateAt`, `resolvePosition`,
`PANEL_POSITIONS`, `computeSeasonPoints` from `../lib/panel.mjs`; `reconstructShippedRookieProjection`
from `../lib/rookieMirror.mjs`. **Must not import `assembleRookiePanel`** (§7 test 10). `DEFAULT_LOAD`
has no gamelogs loader: add `loadGameLogs: (year) => readJson(\`nflverse/gamelogs/${year}.json\`)`
to this file's own `load` default (spread over `DEFAULT_LOAD`), not to `panel-run.mjs`.

### 4.1 Priors, per outcome season S

0. **In-progress guard:** read `manifest.json` (read-only) and throw if any season-totals or
   gamelogs file this run reads is `inProgress: true`, or if any read year exceeds
   `maxLoadSeason`. The next-season horizon stops at S = 2024 and S+2 at S = 2023 so the 2026
   in-progress file is never an outcome (CR-21 Invariant).
1. `loadFactorInputs({ fromYear: S-1, toYear: S-1, basis: 'half_ppr', withFactorMultipliers: true, historyFloor: HISTORY_FLOOR, load })`
   — load window is HISTORY_FLOOR..S, so `totalsByYear[S]` exists (needed for the current-team
   resolution below).
2. Candidates: every non-`TEAM_` pid in season-totals S with `gamesPlayed ≥ 1`, position =
   `resolvePosition(pid, advstats[S-1], roster[S-1], crosswalk)` ∈ `PANEL_POSITIONS`.
3. Route by `rookiePathStateAt(pid, S-1, …)`.
4. **Veteran:** `buildFactorContext(inputs, { attribution: 'per-season-team', fromYear: S-1, toYear: S, regressionModel: CURRENT_REGRESSION_MODEL, load })`
   — `toYear: S` makes teamOffense's current-team resolution the player's team in S, which is
   what the app sees in-season (the committed harness pins its own `toYear`; this is not a
   change to it). Rows `{ sleeperId, position, predictorYear: S-1, outcomePPG: null }`, ctx plus
   `requirePositiveOutcome: false` and `depthOrderOf` = lookup in the depth chart of **S week 1**
   (arm P) — search every team's `weeks[wk][team][position]` array for the pid, first team whose
   `indexOf ≥ 0`, order = index + 1, else `null`. Prior = `predictFullPipeline(row).predicted`.
   Also keep `confidence` = `qualifyingSeasons.length ≥ 5 ? 'high' : ≥ 3 ? 'medium' : 'low'`
   (the app's own tiers, `seasonProjection.js:913`). Any `rookiePath*` drop from
   `attachFactorMultipliers` on a row `rookiePathStateAt` called veteran is a drift → throw.
5. **Arm L:** re-run step 4 once per W with `depthOrderOf` reading S week `min(W+1, lastWeek)`.
   Report the count of rows whose depth order resolves differently from arm P, per W.
6. **Rookie path:** `reconstructShippedRookieProjection({ position, ageAtDraft, draftRound, draftPick, draftCapitalStatus, yearsExp })`
   from `playerids.bySleeper`: `draftCapitalStatus` = no entry → `'unknown'`, `undrafted: true`
   → `'undrafted'`, else `'matched'` (CR-15's mapping note); `ageAtDraft` as
   `assembleRookiePanel` computes it; `yearsExp = S − draftYear` (null when draftYear is null or
   ≤ 0 — it moves only `projectedGames`, never `projectedPPG`). Prior = `projectedPPG`. The X
   subgroup is decided by season-totals appearance (§3.3), never by `yearsExp`.
7. **Mid-season movers.** Season-totals S `team` is the season's *dominant* team (CR-02
   `aggregateWeeks`), and it reaches the prior twice: teamOffense's current-team resolution and
   forward-mover neutralization (`classifyAttributionCohort` reads `teamsByYear[S]`). For a player
   traded after W that is future information. Accepted, not fixed; count movers per S (> 1
   distinct gamelogs `team`) and report their share of arm-P rows.

### 4.2 Evidence and outcomes

Per candidate: season-totals S `weeklyPoints` and `team`; schedule S REG games (the team's game weeks); gamelogs S REG games for weekly
opportunities/targets; `buildCheckpoints`. Next-season outcome: season-totals S+1 PPG
(`computeSeasonPoints` over the half-PPR outcome map) with gp ≥ 6, opp/g from S+1 `stats`; share
from S+1 gamelogs. S+2 diagnostic outcome likewise.

### 4.3 Excluded-population report (always produced)

Per arm × position: player-seasons with n = 0 at every W; rows dropped for `rosGames < 4` (split:
last played week ≤ W+2 "season ended early" vs other); next-season rows without an S+1 outcome
(absent / gp < 6); rows with `missedInWindow`; veteran rows dropped by `attachFactorMultipliers`
(`nullAnchorBasePPG`, `nonPositiveAnchor`, by reason); skill player-seasons absent from gamelogs
(§3.2). For each: count, players, mean prior, mean n, mean `obs − prior`.

### 4.4 Analyses → answers (every comparison is LOSO held-out; every CI is the §3.4 bootstrap)

- **Q1.** For signals points (arm P), points (arm R), opportunity, share (WR/TE) × horizons ROS,
  next × positions: fitted k (0.1), pinned k (0.5), 95% CI, rows, players, `boundary`, LOSO fold
  k range, held-out MAE/RMSE for: prior-only, observed-only, study k, fitted k; ΔMAE(fitted vs
  study) with CI and `compareLabel`. Beside it: `STUDY_K`, arm-S k. Diagnostics (reported, never
  pinned): (a) **functional-form check** — arm P ROS points k fitted separately for n ∈ {1–2,
  3–4, 5–6, 7+}; (b) **prior-optimism check** — joint in-fold fit of `(c, k)` with prior × c,
  c ∈ {0.80, 0.82, …, 1.10}, reporting how far k moves (the D6b verdict found the projection
  runs optimistic, median realised/projected 0.85–0.91); (c) **exclusion bias** — k on rows
  without `missedInWindow` vs all rows, CI of the difference from a paired bootstrap.
- **Q2.** Per position × horizon: VE and G vs points-only, ΔMAE CI + label, on all eligible rows
  (primary) and on role-change rows (`|obsOpp − oppPrior| / oppPrior ≥ 0.5` and n ≥ 2;
  secondary, reported). Report the eligible-row share. Answer = BEATS on the primary, per position.
- **Q3.** Arm P, points, ROS and next: M0 (k per position) vs M1 (k per position × band; band =
  S-1 opp/g below the position's median over S-1 players with gp ≥ 8, Phase 1's definition; RB/WR/TE)
  vs M2 (k per position × confidence tier). Label each vs M0.
- **Q4.** Arm X subgroups × position (pooled across positions when a position cell is
  INSUFFICIENT), points ROS and next: fitted k and held-out ΔMAE vs Phase 1's rule (the weak-band
  k, QB flat 6 — `PHASE1_K`). Opportunity for these players has no prior the app holds — report
  "not measurable" (D5).
- **Q5.** Opportunity baseline arm A = S-1 (gp ≥ 4) vs arm B = most recent of S-1..S-3 with gp ≥ 4
  (both need opp/g ≥ 2.0). Population = rows where A and B differ. Prediction when an arm has no
  baseline = Phase 1's new-role shrink toward 0: `(n/(n+k))·obsOpp`. ROS opp/g held-out MAE per
  arm, CI, label; the count of Phase 1 "new role" flags arm B removes; k for arm-B-only rows
  vs pooled k (does a stale baseline need its own k).
- **Q6.** Rows at W ∈ {3,4,5,6} with a baseline. Measures: (a) raw shift `rosOppPost − oppPrior`;
  (b) relative shift `/ oppPrior`; (c) z = raw / in-fold SD of raw shift at the same (position, n);
  (d) points-equivalent = raw × effPrior. Target = `rosPPG − pointsPrior`. Report pooled
  cross-position Spearman(measure, target) and, per (S, W), the position mix of the top 50 by the
  measure vs top 50 by the target (mean absolute share gap). Answer = highest Spearman; within
  0.01 → smaller mix gap.
- **Q7.** Arms P vs L, points ROS, each with its own in-fold k: held-out MAE (Δ CI + label);
  mean held-out residual (pred − actual) on **promoted** rows (live order < week-1 order, or
  newly listed) and **demoted** rows, with CIs; fitted k of each arm.
- **Q8.** Cross-application matrix per position: kROS and kNext (arm P) each scored on ROS and on
  next-season outcomes (held-out MAE); S+2 diagnostic k; arm R's next-season k (the value that
  transports if Phase 2b feeds the dynasty score through its careerStats season history — companion §D).

### 4.5 Pre-registered decision rules (Session 2 applies; never tunes after seeing results)

| Q | Rule |
|---|---|
| Q1 | Pin the fitted k, except: fitted-vs-study **WORSE** → pin `STUDY_K` with `basis: 'study'`; `boundary: 'high'` → `k: null`, `basis: 'prior-only'` (the signal adds nothing in range — do not blend it); `boundary: 'low'` → `k: 0`, `basis: 'observed-only'`. A boundary rule takes precedence over the WORSE rule. |
| Q2 | Combine for a position/horizon only if VE or G is BEATS on the primary population; if both, the lower held-out MAE. Otherwise **opportunity stays display-only**. |
| Q3 | Adopt a split (band or tier) for a position/horizon only if BEATS vs M0; both BEATS → lower MAE. |
| Q4 | Pin the arm-X k where BEATS vs `PHASE1_K`; NO-GAIN → pin the fitted k anyway (it is measured, Phase 1's was not) and say so; WORSE → pin Phase 1's value and say so. |
| Q5 | Arm B if BEATS or NO-GAIN (it removes false "new role" flags at no measured cost); arm A only if B is WORSE. Arm-B-only rows get their own `K_ROS_OPP_STALE` (ROS only — Q5 measures no next-season stale k) only if that separate k is BEATS vs the pooled k on those rows; else they use the pooled k. |
| Q6 | As §4.4. |
| Q7 | **ACCEPT** (live prior; pin arm L's k) only if L's ΔMAE vs P is BEATS **and** L's promoted-row mean residual CI includes 0. Otherwise **FREEZE** (pin arm P's k). |
| Q8 | Season projection → kROS; dynasty → kNext. `K_DYN_POINTS` is arm P (projection prior); arm R's next-season k is pinned alongside as `K_DYN_POINTS_HISTORY` (raw last-season prior, companion §D.1). If both cross-application MAE penalties are < 1%, also state that one set would do. |
| all | An INSUFFICIENT cell pins nothing; the constants table falls back to the pooled-positions cell of the same group with `basis: 'pooled'`, else `null` with `basis: 'insufficient'`. |

### 4.6 `bin/backtest.mjs --inseason`

`--inseason [--json] [--write]`. Rejects every other `bin/backtest.mjs` flag with the
`--rookie`-style message (windows and basis are pinned). Exit 1 on the reconciliation stop,
else 0. Default output = verdict markdown; `--json` = the result object.

---

## 5. Outputs (`--write`)

`writeInSeasonArtifacts({ result, verdictMd })` in `scripts/inseason-run.mjs`, date =
`result.meta.generatedAt.slice(0, 10)`:

### 5.1 `backtests/<date>-inseason-panel.json`

`{ meta, reconciliation, coverage, excluded, q1 … q8, pinnedFrom }` — aggregate tables and
per-fold results. **No per-row data** (≈ 10⁵ rows). Cap 5 MB; state the size in the hand-back.

### 5.2 `backtests/<date>-inseason-constants.json` — the table the app pins, and its fixture

```json
{
  "source": "sleeper-dashboard-data backtests/<date>-inseason-constants.json (node bin/backtest.mjs --inseason --write)",
  "generatedAt": "…", "basis": "half_ppr",
  "fit": { "kTenths": [0, 400], "loss": "sum of squared error, rows equal weight", "tie": "smaller k",
           "pin": "Math.round(k*2)/2", "checkpoints": "calendar weeks 1-12, n = games played",
           "minRosGames": 4, "nextMinGames": 6, "prior": "frozen | live (Q7)", "opportunityBaseline": "A | B (Q5)" },
  "constants": { "<NAME>": { "<POS>[|<band or tier>]": { "k": 4.5, "kFit": 4.4, "ci95": [3.6, 5.3],
                   "rows": 0, "players": 0, "basis": "fitted | pooled | study | prior-only | observed-only | report-only | insufficient" } } },
  "combination": null,
  "sortMeasure": { "name": "…", "params": {} },
  "fixture": { "<NAME>|<POS>[|<band or tier>]": { "<S>": { "<n>": [count, Saa, Sab, Sbb] } } }
}
```

Constant names: `K_ROS_POINTS`, `K_DYN_POINTS`, `K_DYN_POINTS_HISTORY`, `K_ROS_OPP`, `K_DYN_OPP`,
`K_ROS_SHARE` (WR/TE); `K_ROS_OPP_STALE` when Q5 adopts it; when Q3 adopts a split, `K_ROS_POINTS_WEAK`/`_STRONG` or `K_ROS_POINTS_CONF` (and `DYN`
forms); Q4 → `K_ROS_POINTS_ROOKIE0`, `K_ROS_POINTS_ROOKIE1P`, `K_ROS_POINTS_SHORT` (and `DYN` forms).
`combination` is filled only if Q2 adopts a form (its fitted parameters and CIs; no fixture — it
is not a single-k cell). `fixture` holds sufficient stats for every single-k cell in
`constants`, so `kFit` re-derives exactly by the `fit` rule: pooled over all seasons, and per LOSO
fold by dropping one season. Cap 300 KB. **Phase 2b copies this file into the app's
`src/__fixtures__/` and appends the data commit SHA to `source`** — the rookie-calibration
precedent (`rookie-panel-2026-09-06.json`).

### 5.3 `grading/<date>-inseason-verdict.md`

First lines: one-line measured answer per Q1–Q8, then the constants table (name · cell · k · CI ·
basis · study/Phase 1 value). Then sections per question, the reconciliation result, the
excluded-population report, and a **Limitations** section that states: half-PPR basis; the prior
is the reconstruction (faithful in 9 of 13 steps, divergences per
`grading/2026-09-06-fullpipeline-verdict.md`) and not the app's live number; rookie prior has no
KTC multiplier historically; season-totals S `team` is the season's dominant team, which reaches
teamOffense and forward-mover neutralization (§4.1 step 7, with the mover count); team-target
denominators omit gamelogs `unmapped` rows; no injury-severity model. `Reproduce:` line as in the panel
verdicts.

---

## 6. Cross-repo impact

Four entries fire, one is created. **Session 2 edits no registry file.** The exact registry edits
(CR-09, CR-15) and the new CR-25 entry are in the companion
`.claude/tasks/in-season-evidence-2a-registry.md`, applied by the standard two-session route:
the app applies first, then a data session syncs byte-for-byte. **That sync must land after
Session 2's commit 1**, because `test/registry.test.mjs` resolves the new symbol claims against
`scripts/inseason-run.mjs` and `lib/inSeasonEvidence.mjs`. The daily mirror run is red between
the app apply and the data sync; keep that window same-day.

### CR-15 · R3-FIT factor-multiplier mirror — fires (`lib/panel.mjs` §2.2, `scripts/panel-run.mjs` §2.1)

> Re-mirror the changed constant/gate/branch and **re-fit before any further exponent activation** — otherwise the fit reconstructs a factor the app no longer produces and the committed verdict in `.claude/tasks/r3fit-exponent-harness.md` stops transporting. Which positions a factor is gated to is itself part of the mirror. Note the known parity gap: `shareTrend` and `teamRzShare` have no end-to-end app-ground-truth check until a post-2026-07-18 snapshot is imported. **Nothing app-side fails when this drifts.** **Scope note reversed (D6a, 2026-09-06):** `dynastyScore.js` was previously named in `lib/projectionFactors.mjs` (the comment above `weightedLinearRegressionSlope`) only as a *contrast* and marked deliberately not a trigger; D6a's age port (Step 2) draws `computeEmpiricalAgeCurves` straight out of it, so `dynastyScore.js` is now mirrored and is a trigger like the other ten app-side modules. The old contrast is still accurate as far as it goes — `weightedLinearRegression`'s copy in that file remains unfloored where the mirrored one floors the denominator at 4 — it just no longer means the whole file is out of scope. A change to any of the three app-side rookie mechanisms, or to their ordering, re-mirrors here; the mirror must never become reachable from the fit path, which `test/rookie-mirror.test.mjs`'s import-graph assertion enforces. **A gate change that captured snapshots already carry is added as a new model, never an overwrite (`7b5b055`, Step 4 up-side):** the retired behaviour stays reproducible for parity against pre-boundary captures and for re-running committed verdicts, the new model becomes the harness default, and the boundary gets a row in `grading/anchor-policy.md`.

**Under it.** No mirrored constant, gate, branch or ordering changes. Both edits are seams whose
defaults are byte-identical (§7 test 1), so nothing is owed app-side and no re-fit is triggered.
"The fit path" in the Mirror is the rookie-constant / exponent fitting path (`bin/panel.mjs` and
its closure), and T-RM1 holds unchanged. `--inseason` reaches `lib/rookieMirror.mjs`
deliberately, because it fits no rookie constant. It fits k over the prior the app actually
blends, and for rookies that prior is the corrected one. The re-fit trap is fitting rookie
constants through a reconstruction that already applies them, and `--inseason` never calls
`assembleRookiePanel` (§7 test 10). Registry edit: the companion's §A adds
`scripts/inseason-run.mjs` and the extracted `loadFactorInputs`/`buildFactorContext` to the data
side, and extends the Mirror to the in-season k.

### CR-11 · Snap & red-zone usage stat keys — fires (`lib/panel.mjs` is a whole-file data-side trigger)

> Do not remove, rename or filter these keys. **The projection degrades silently to neutral when they are absent** — no error, no test failure, no visible symptom. The blast radius is wider than the projection: `durabilitySignals` mis-classifies contributor seasons, `teamContext`'s RZ denominators go to zero (so `teamRzShare` sentinels out), the Outlook snap% column empties, and — since dp-v2 Slice 5b — Market's Efficiency `SNAP%`/`RZ SH` columns go blank the same way, and the data repo's own panel/backtest reconstructions drift the same way. The dependency is invisible at runtime; this registry entry is the only thing recording it.

**Under it.** No key is removed, renamed or filtered. `attachFactorMultipliers` still reads the
same keys through the same branches, and the §2.2 seams change nothing by default.

### CR-07 · nflverse advstats (view-only) — fires (`loadAdvstats` in `scripts/panel-run.mjs` moves into `loadFactorInputs`)

> Served-shape or sparsity-gate changes need the app loader updated in the same cycle. **Now breaks a visible surface, not just a silent loader** — Market's `RACR` column would go blank for every WR/TE with no error. Ratios are recomputed season-level and never aggregated weekly. Activation into projection is parked — see the advstats grading-findings doc.

**Under it.** The served shape and gates are unchanged. The call stays in
`scripts/panel-run.mjs`, so the registry's anchor stays true, and nothing is owed app-side.

### CR-09 · nflverse gamelogs (view-only) — no trigger edited; Mirror text amended (companion §B)

> Shape or floor changes land in both repos together. The per-game `week` and `team` keys are load-bearing beyond display: `resolvePlayerTeam`'s week-grain path matches on `g.week === week` and reads `g.team`, and returns `null` rather than throwing — renaming either key empties every week-grain team join **silently**. Per-game `team` is the **current-franchise** domain in all seasons and is era-remapped app-side (CR-16); do not "fix" it to era-accurate upstream without changing both repos. Per-game rate fields (`racr`/`targetShare`/`airYardsShare`/`wopr`/`pacr`/`passingCpoe`) are single-game values and must never be summed — `passingCpoe` specifically is now also attempt-weighted by a second consumer (`seasonEfficiency.js`'s `CPOE` column), not merely "never summed". `fantasyPoints`/`fantasyPointsPpr` are nflverse default scoring and are never reconciled with `src/utils/fantasyPoints.js` (see CR-14). View-only on both sides — must never feed projection/scoring/grading. 2019 was backfilled on 2026-07-03 (5,756 rows across 586 players) and is no longer a gap; the family is complete 2012–2025.

No CR-09 trigger is edited. But its Mirror is categorical: "View-only on both sides — must never
feed projection/scoring/grading". This slice fits constants on gamelogs weekly splits
(`K_*_OPP`, `K_ROS_SHARE`, any Q2 `combination`, the Q6 sort measure), and Phase 2b will switch
those constants into scoring. Session 1's call is to **amend the Mirror, not reinterpret it.** The
companion's §B adds one sanctioned analytical read. It is offline, behind the §3.2
reconciliation stop, and emits dimensionless constants only, never per-player values. If Anton
rejects §B, the fallback is that the gamelogs-derived outputs are reported but not pinned: the
share cells are pinned `null` with `basis: 'report-only'`, and `combination` and `sortMeasure`
are `null`. The S-1 opportunity baseline comes from season-totals, so `K_*_OPP` can still
be fitted, but its in-season evidence split is gamelogs-derived, so it is report-only too. The
points constants are unaffected.

### CR-25 · In-season evidence definitions and fitted k — **new** (companion §C)

`lib/inSeasonEvidence.mjs` mirrors app rules from `src/utils/inSeasonEvidence.js`:
`PHASE1_K`, `MIN_PRIOR_GAMES`, the baseline thresholds, the band median rule, the new-role shrink,
the opportunity definition and n = games played. The fitted k transport to the app only while
those stay equal. The pinned constants also flow the other way, from data to app, as a dated
fixture copy. The rookie-calibration precedent registered neither direction. Here the definitions
mirror is live from this slice on, so it gets an entry now rather than at Phase 2b.

### Not fired

CR-01 has no snapshot read or shape change; Phase 2b owns the additive posterior field. CR-02 and
CR-21 have no season-totals change, and n = games played is already CR-21's Invariant. CR-18 has
no ingested field change.

## 7. Tests — `test/inseason.test.mjs` (fixture loaders only; test 3 alone reads the live store, read-only)

1. **Refactor byte-identity (gate on the whole slice).** Before any edit, Session 2 saves to the
   scratchpad `node bin/panel.mjs --json` (default E-0a — the in-basis `resolveScoring` path
   through `loadFactorInputs`), `--flip-gate --json`, `--fit --json`, `--fullpipeline --json` and
   `--fullpipeline --regression-model legacy --json`; after the change the same five, with every
   `generatedAt` removed, are byte-identical. Hand-back reports the five diffs (expected empty). Plus a unit test: `attachFactorMultipliers` on a small fixture with ctx defaults vs
   ctx `{ requirePositiveOutcome: true, depthOrderOf: null }` → deep-equal; and a
   `depthOrderOf` stub returning a fixed order changes only `multipliers.depth` (and
   `compBlend`, which is order-dependent on it).
2. `fitK`: single-n synthetic stats whose closed-form optimum is `w* = −Sab/Sbb`,
   `k* = n(1−w*)/w*` = 3.7 → returns 3.7; t = 0 and t = 400 boundary flags; tie → smaller k.
3. **Arm S pin:** `runArmS({ load })` (exported from `scripts/inseason-run.mjs`; arm S only — no
   factor reconstruction, no bootstrap, so `npm test` stays fast) on the live store gives ROS
   points k = QB 5.0, RB 3.0, WR 4.2, TE 4.5 (±0.1). A failure means the arm drifted from the probe
   definition in §3.3 — fix the arm, never the pin.
4. `suffStats` loss equals row-wise squared-error loss for any k (property check over 5 k values).
5. `buildCheckpoints`: a fixture season with a team bye week, a week the team played and the
   player has no `weeklyPoints` key (whatever its `weeklyStatus`, `'X'` included) and a POST game →
   correct n, obs, ROS; the absent week counts as a miss, the bye does not; POST excluded;
   `rosGames < 4` handled; a mid-season mover gets `missedInWindow: null`.
6. `opportunities`: QB attempts + carries; WR targets + carries; absent keys = 0.
7. Target share uses team sums over the player's own played weeks only.
8. LOSO: an instrumented `fit` never sees a row of the held-out season.
9. `clusteredBootstrap`: same seed → identical CI; resamples clusters, not rows (a one-cluster
   input gives a zero-width CI). `mulberry32(12345)`, 10⁶ draws: > 999,000 distinct values (the
   Step 4 LCG gives ~10⁴) and the even share of `Math.floor(x·2³¹)` within 0.49–0.51.
13. In-progress guard: a fixture manifest marking a read season `inProgress: true` → throws.
14. Arms partition: on a fixture, every candidate with a prior is in exactly one of P,
    X-rookie0, X-rookie1p, X-short; a second-year player with S-1 gp ≥ 8 lands in X-rookie1p.
10. Static: `scripts/inseason-run.mjs` source does not reference `assembleRookiePanel`; T-RM1
    stays green (existing test, unchanged).
11. Constants file: every `kFit` in `constants` re-derives from `fixture` by the `fit` rule
    (run against a small synthetic constants object built by the same writer).
12. Reconciliation stop: a fixture with 2 of 100 player-seasons mismatched → `runInSeason` throws /
    CLI exits 1 and no artifact is written.

---

## 8. Docs

- **README** → Analysis / Backtesting: new `### In-season evidence k-fit (\`bin/backtest.mjs --inseason\`)`
  — purpose, arms table (short), the gamelogs reconciliation stop, artifacts, reproduce line,
  and the D1 sentence on why it is not a `bin/panel.mjs` mode.
- **README** → Module notes → `#### Analysis CLI flags`: add `--inseason` to the `bin/backtest.mjs`
  flag list and its three artifacts to the "Writes land in" list.
- **README** → Module notes: move CLAUDE.md's `lib/panel.mjs` sentence starting
  "`D6_NEW_FACTORS`/`FULL_FACTORS_D6`/`ENVELOPE_FACTORS_D6_ADDITIONS` are …" verbatim into a
  `lib/panel.mjs` bullet there; add one line on the two §2.2 seams.
- **CLAUDE.md** (ceiling 25,000 bytes; currently 24,971):
  - Backtest row → `offline analysis over advstats + season-totals; \`--inseason\` (in-season evidence k-fit)`.
  - `lib/panel.mjs` row: replace the moved sentence with `D6a dispatch lists: README → Module notes.`
  - `scripts/backtest-run.mjs` row → `Backtest adapters — \`scripts/backtest-run.mjs\` (advstats) and \`scripts/inseason-run.mjs\` (\`--inseason\`; the one analysis path that imports \`lib/rookieMirror.mjs\`, outside \`bin/panel.mjs\`'s closure)`.
  - `lib/backtest.mjs` row: append `; \`lib/inSeasonEvidence.mjs\` is \`--inseason\`'s pure k-fit`.
  - Commands shortcut list: add `backtest:inseason`.
  - `test/claudeMdSize.test.mjs` must pass; if still over, shorten the new text, never other rows.
- `data-catalog.md`: no change (no served family touched).

---

## 9. Done-definition and git

1. §7 test 1 baseline captured **before** the first edit.
2. `npm test` and `npm run smoke` green.
3. `node bin/backtest.mjs --inseason` runs; reconciliation passes; then `--write`.
4. Commit 1: code + tests + docs. Commit 2: the three artifacts. `git pull --rebase origin main`,
   plain `git push origin main`.
5. **Hand-back:** both SHAs; every file touched; deviations; what each test asserts; the §7 test 1
   diffs; runtime; artifact sizes; **the verdict's Q1–Q8 answer lines and the constants table
   pasted verbatim**; the excluded-population summary; any INSUFFICIENT cells.

**Stop and ask** if: the reconciliation stop fires; §7 test 1 shows any diff; a `rookiePath*` drop
occurs on a veteran-routed row; a pre-registered rule does not decide a case; or an artifact
exceeds its cap.

---

## 10. Findings for Phase 2b

Moved to the companion `.claude/tasks/in-season-evidence-2a-registry.md` §D (not for Session 2).

---

## Review record — plan gate round 1 (2026-09-26)

plan-reviewer, `full`, 16 flags. Session 1 checked each against live source (Anton delegates
review calls), and all 16 held.

| # | Flag | Decision |
|---|---|---|
| 1 | Step 4 LCG loses precision above 2^53. From seed 12345 it cycles at 10,466 states, 99.6% even (re-measured). | **Applied**: mulberry32 (D8, §3.4, test 9). The pre-existing Step 4 defect is out of scope and raised separately. |
| 2 | Second-year players (S-1 debut, gp ≥ 8) fall outside every points arm, and anchor drops are uncounted. | **Applied**: arm X is now defined by path and appearance (§3.3), plus partition test 14 and §4.3 counts. |
| 3 | Next/S+2 horizons would read the in-progress 2026 file. | **Applied**: `nextTo`/`plus2To`/`maxLoadSeason`, manifest guard §4.1 step 0, test 13. |
| 4 | `'X'` ≠ bye, so `missedInWindow` undercounts. | **Applied**: schedule-based misses (§3.2); movers get `null`. |
| 5 | Limitations text is wrong: `team` is the dominant team, and it leaks into forward-mover neutralization too. | **Applied**: §4.1 step 7 and §5.3. |
| 6 | Test 1 baseline misses default/`--flip-gate`, and `--rookie` proves nothing. | **Applied**: five modes, `--rookie` dropped. |
| 7 | `PHASE1_K` had no values. | **Applied**: values inlined (§3.1). |
| 8 | §4.5 left cases undecided. | **Applied**: Q1 row (WORSE/boundary), Q5 stale-k rule, Q8 `K_DYN_POINTS_HISTORY`. Null-`yearsExp` is resolved by the appearance-based X split. |
| 9 | Reconciliation population unspecified; gamelogs-absent rows and `unmapped` are unreported. | **Applied**: §3.2 gate population and §4.3. |
| 10 | Test 3 reads the live store and would run the full harness. | **Applied**: `runArmS` entry point; header fixed. |
| 11 | CR-11 fires. | **Applied**: §6, Mirror verbatim. |
| 12 | CR-07 fires. | **Applied**: §6, Mirror verbatim. |
| 13 | CR-09 is categorical; interpretation cannot settle it. | **Applied**: Mirror amendment drafted (companion §B), with a report-only fallback. |
| 14 | CR-15 edit text: missing symbols, non-unique anchor, rookie mechanisms uncovered, sync ordering. | **Applied**: companion §A with re-checked anchors; ordering stated. |
| 15 | `[registry-gap]`: definitions mirrored from the app's `inSeasonEvidence.js`. | **Applied**: CR-25 drafted (companion §C), per the brief's "draft the entry". |
| 16 | README "Analysis CLI flags" not updated. | **Applied**: §8. |

Size: the task file is ~44 KB, over the 40 KB signal. The registry text and the Phase 2b findings
moved to the companion. The rest is one analysis with eight questions that share one population
and one fitting core, so splitting it further would duplicate the harness spec.

## Review record — plan gate round 2 (2026-09-26)

10 flags. Nine were checked and applied; one goes to Anton.

| # | Flag | Decision |
|---|---|---|
| 1 | Slice size 44.5 KB, or 51.8 KB with the companion | **Anton decides.** Session 1 recommends not splitting (see round 1). |
| 2 | Test 5 and §4.2 still used `weeklyStatus` | **Applied**: both switched to schedule-based misses; the mover case is covered. |
| 3 | Q4 comparator wrong for second-year players with S-1 gp ≥ 8 | **Applied**: `PHASE1_K` comment now applies Phase 1's own per-row rule. |
| 4 | Boundary vs WORSE precedence undefined; `K_DYN_OPP_STALE` unmeasured | **Applied**: boundary takes precedence; the stale k is ROS only. |
| 5 | S-1 opp baseline should come from season-totals, as the app does | **Applied**: §3.3. This also narrows CR-09's reach. |
| 6 | Early app apply means a long red mirror window | **Applied** (companion): step 1 waits for commit 1. |
| 7 | CR-09 amendment wording, gate population, missing trigger | **Applied** (companion §B), with the fallback widened in §6. |
| 8 | CR-09's full Mirror was not quoted | **Applied**: §6. |
| 9 | CR-25 Invariant false until pinned; `PHASE1_K` invites overwrite | **Applied** (companion §C). |
| 10 | CR-25 drafted in-repo rather than via the Claude.ai project | **For Anton to confirm at approval.** The brief asked Session 1 to draft it; it has now taken two plan-review rounds. |

---

## Verification record (2026-09-26)

Session 2's commits were `373aa28` (code) and `a3262ec` (artifacts). implementation-reviewer
checked the diff and flagged 6 items. It also re-verified independently:
- §7 test 1 byte-identity, across all five panel modes, on both trees.
- Determinism against the committed artifacts.
- That all 46 `kFit` values re-derive from the fixture.
- That all 252 Q1 fold k match.
- That every §4.5 rule was applied as written.
- The touch-list scope.

Anton delegated the flag calls and reviewed the results himself (items A–D below).

**Ratified into §4.5 (Session 2's resolutions, reviewer flag 2 — accepted as written, no code change):**
- The Q1 boundary rule applies to every fitted cell, Q3 and Q4 included, and takes precedence
  over any WORSE rule.
- A Q4 WORSE result pins `PHASE1_SUBGROUP_VALUE`: RB/WR/TE `rosWeak` or `dynPoints`, and
  `rosPoints.QB` for QB.
- A Q3 split is not adoptable if any of its sub-cells is INSUFFICIENT.

**§4.5 Q4 is replaced (Anton, item 2; test chosen by Anton 2026-09-26):** Q4 cells that are
NO-GAIN against Phase 1 pin the pooled-positions value of the same subgroup × horizon, unless
the cell's own k **BEATS** that pooled k out of sample (paired held-out ΔMAE, bootstrap CI).
The old text "fitted k pinned anyway" is retired.

## Fix pass 1

Implement exactly this, then run the done-definition below. `lib/panel.mjs`,
`scripts/panel-run.mjs` and `lib/projectionFactors.mjs` must not change.

### 1. Q4 NO-GAIN pin rule (`scripts/inseason-run.mjs` `buildConstants`, Q4 loop ~L1005–1019)

For each Q4 position cell `own = store.get(\`q4|${group}|${horizon}|${pos}\`)` with
`own.verdict !== 'INSUFFICIENT'` and `own.delta?.label === 'NO-GAIN'`, and with
`pooled = store.get(\`q4|${group}|${horizon}|ALL\`)` not INSUFFICIENT:
- Compute pooled in-fold k per season: `kPooled(S) = fitK(stats of pooled.statsBySeason excluding S).k`.
- Compute `pooledPreds[i] = { pred: blend(r.<prior>, r.<obs>, r.n, kPooled(r.S)), actual: r.<outcome> }`
  over `own.orderedRows`, using that horizon's `SPEC`.
- Compute `vsPooled = pairedDelta(own.orderedRows, pooledPreds, own.heldOut)`. This is the same
  call shape as the Q5 stale-k comparison (~L811), so Δ = own − pooled and BEATS means own is better.
- If `vsPooled.label === 'BEATS'`, pin own (`pinDecision(own, p1)`) with note
  `NO-GAIN vs Phase 1; own k BEATS the pooled k out of sample → own k pinned`.
- Otherwise pin the pooled cell exactly as the INSUFFICIENT fallback does: `basis: 'pooled'`,
  `fixtureKey: '<NAME>|ALL'`, the pooled fixture, and `pinnedFrom` =
  `q4|…|ALL (pooled positions; own cell NO-GAIN vs Phase 1 and does not BEAT pooled)`. Add the
  note `NO-GAIN vs Phase 1; own k does not beat the pooled k out of sample → pooled value pinned`.

Cells that BEAT Phase 1, cells that are WORSE, and INSUFFICIENT fallbacks are unchanged. Store
`vsPooled` (`mean`, `ci95`, `label`) on the Q4 cell in the panel JSON. In the verdict, give the
§Q4 table a `vs pooled` column and state the new rule. The Q4 answer line adds
"N cells pinned to the pooled value under the NO-GAIN rule: <list>". Delete the old note string
everywhere.

### 2. Prior-optimism record (Anton, item 1 — do NOT pin c)

- **Constants file:** add `fit.priorOptimism`, an additive string. Its text is the paragraph
  below, with `<cLo>–<cHi>` computed from the min and max per-position pooled `c` of the Q1
  prior-optimism diagnostic in this run, formatted to 2 dp. Never hard-code the range.
- **Verdict:** add a section `## Prior optimism — read before using these k` directly after the
  answer lines and the constants table. It carries the same paragraph plus the per-position
  (c, k-with-c, k-without) table the diagnostic already computes.

> The reconstructed projection prior runs optimistic: the joint diagnostic puts the prior scale c at <cLo>–<cHi> across positions, consistent with `grading/2026-09-06-fullpipeline-verdict.md`, which STOPPED on live-state reconstruction limits — the same limit applies here, so c is reported, not pinned. The pinned k partly correct that optimism (evidence gets extra weight because the prior sits high). (a) These k MUST be re-fitted if the projection's optimism is ever corrected. (b) Phase 2b's in-season "what changed" display will skew below-prior early in the season for this reason and must say so.

### 3. Q7 frozen-prior source line (Anton, item 3)

In the verdict's §Q7, after the decision, add:
`FREEZE needs a frozen-prior source in the app — see .claude/tasks/in-season-evidence-2a-registry.md §D.4 (Phase 2b).`

### 4. Per-W depth-change counts (reviewer flag 1)

In `runQ7`, add to the pooled result `changedByW: { [W]: { rows, changed } }` (the §4.1 step 5
count), and render it in the verdict's §Q7 as one table row per W.

### 5. Fold re-derivation (reviewer flag 3)

Every non-null constants entry gains `foldK: { [S]: k }`, the drop-one-season `fitK` on the same
fixture the entry's `kFit` re-derives from (its own, or `<NAME>|ALL` for a pooled entry).
`verifyConstants` asserts that each re-derived fold k equals `e.foldK[S]` exactly. Extend test
11: a tampered `foldK` value is caught. The constants file must stay ≤ 300 KB.

### 6. POST filter test (reviewer flag 4)

Extract the inline `(glp?.games ?? []).filter(g => g.seasonType === 'REG')` (~L357) into an
exported `regGames(gamelogsPlayer)` in `lib/inSeasonEvidence.mjs`, and use it at that site and at
the reconciliation site if that one filters the same way. Test 5 asserts that a POST (and a
WILD/DIV) game is excluded while REG games are kept. Remove the test-5 case that passes
`weeklyStatus` to a function that ignores it.

### 7. CLI exit code on the reconciliation stop (reviewer flag 5)

Move the `--inseason` branch body of `bin/backtest.mjs` into an exported
`inSeasonMain({ load = INSEASON_LOAD, write, asJson, writeArtifacts = writeInSeasonArtifacts, log = console.log, logErr = console.error })`
in `scripts/inseason-run.mjs`. It returns the exit code: 1 on `ReconciliationStop`, else 0. The
flag rejection stays in the bin. The bin calls `process.exit(inSeasonMain(...))`. Extend test 12:
with a fixture that trips the stop and `write: true`, `inSeasonMain` returns 1 and a spy
`writeArtifacts` is never called.

### 8. Manifest guard (reviewer flag 6)

`guardLoad` throws when `load.loadManifest` is not a function, as it already does when it returns
`null`. Update any test fixture loaders that lack `loadManifest`. Extend test 13 with a load that
has no `loadManifest`, and assert that it throws.

### 9. Re-run and commit

- `npm test` and `npm run smoke` must be green.
- Then run `node bin/backtest.mjs --inseason --write`. On the same date this overwrites the three
  `2026-09-26-inseason-*` artifacts. On a later date the old ones stay (precedent: the rookie
  panels of 09-11 and 09-12) — state which happened.
- Run it a second time without `--write` and confirm the constants are identical.
- Make one commit containing the code, tests, docs (if touched), the artifacts, **and the two
  Session 1 task files** (Anton, item 4). Stage them explicitly:
  `git add .claude/tasks/in-season-evidence-2a-backtest.md .claude/tasks/in-season-evidence-2a-registry.md <files>`.
- Then `git pull --rebase origin main` and a plain `git push origin main`.

### Hand-back

Report:
- The SHA, every file touched, and any deviation.
- A **before → after table for every constants entry whose `k`, `basis` or `note` changed**,
  including the canary `K_DYN_POINTS_SHORT` WR stated explicitly, whatever it comes out as.
- The new Q4 answer line and the `priorOptimism` text as written.
- Test count and artifact sizes.

**Leave alone:**
- Every Q1/Q2/Q3/Q5/Q6/Q7/Q8 decision.
- The fit grid, rounding, and the arms.
- `lib/panel.mjs` and `scripts/panel-run.mjs`.
- The registry files.
