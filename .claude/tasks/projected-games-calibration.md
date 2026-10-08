# Projected-games over-projection — decomposition + held-out calibration (L6)

Session 1 (opus), 2026-10-08. Item L6 of `../future_plans/in-season-notes-plan.md`. Planned against
data `8e61ecb` (+ the cron commits since) and app `ac26e0b`. Sonnet implements, in one Session 2.

**Offline research only:**
- no served file changes;
- no manifest entry;
- `nfl/`, `nflverse/` and `snapshots/` are read-only;
- the app is untouched.

The output is a verdict that **Anton reads before any wiring slice is planned**. Wiring happens
only if a candidate beats the current rule on held-out seasons (§5).

## 0. Question and decisions

The L5 Stage B verdict (`grading/2026-10-06-absence-verdict.md` §3) found the veteran
`projectedGames` runs high:
- mean signed error +3.43 games (after the correction), over 4,362 player-seasons;
- by position: QB +4.46, RB +3.16, WR +3.65, TE +2.83.

`projectedTotalPts = projectedPPG × projectedGames` (`seasonProjection.js:1015-1017`), so every
veteran season total inherits that bias. The one exception is a QB on the `chain` basis, whose
total uses `qbStartShare × qbEntry.games` and not `projectedGames`.

**Q-A, decomposition.** How much of the +3.4 is panel composition, and how much is the durability
model itself? Composition means players who leave an NFL roster during S+1: cut, practice squad,
unsigned or retired. Under the panel rule those players score outcome 0 or a short season. The
durability model is the recency-weighted games over qualifying seasons, the injury multipliers,
the absence shape and the clamp [8, 17].

**Q-B, calibration.** Does a held-out calibration of `projectedGames`, by position and age, beat
the current rule on seasons it was not fitted on?

**D1 — scoring rule (Anton's call; the harness reports both, so no re-run is needed).**
`projectedTotalPts` is an expected value: it is summed and compared across rosters, and that
needs an unbiased mean. MAE rewards the median instead, and the outcome distribution is skewed: a
mass at 16–17 games, with 513 of 4,362 rows at 0.

Session 1's in-sample probe on the current store shows the two rules disagree:
- shifting each position by its mean bias moves RMSE 6.68 → 5.75 but MAE 4.87 → 4.93;
- shifting by the median bias gives MAE 4.71 and RMSE 6.02.

**Default (recommended): squared error is primary.** The verdict uses ΔMSE and the bias for the
decision. Under the alternative rule, MAE primary, ΔMAE would decide. §5 computes both picks.
- The L5 verdict graded on MAE. This is a deliberate change, because L5 asked whether the corrected
  data predicted worse, while L6 asks whether totals are calibrated.

**D2 — panel.** The panel is Stage B's: `buildPanel` in `scripts/absence-run.mjs`, unchanged,
called with `before = after =` the committed store. The store is now post-correction, since L5
Stage C migrated it in place. Q-A adds two **alternative panel definitions** as a composition
sensitivity check (§3.3). The calibration (Q-B) uses the Stage B panel only.

**D3 — hold-out.** Folds are forward-chaining over predictor season S:
`forwardChainFolds([2015..2024], 3)` from `lib/panel.mjs`. That gives eval S = 2018 … 2024. Each
fold trains on `trainYears` = every S ≤ t − 1.
- **That uses no future data.** A training row with S = t − 1 has its outcome in season t. An
  eval-t prediction is made once season t is complete, so that outcome is already known when the
  prediction is made.
- Out-of-sample rows are pooled across folds for every metric.

**D4 — candidates are fixed here.** No candidate may be added after the first run. A post-hoc
idea becomes a "noted, not tested" line in the verdict.

## 1. Findings against live source

1. **The mirror is current.** App `git log d627562..ac26e0b` shows no change to
   `src/utils/durabilitySignals.js`, `src/utils/seasonProjection.js` or
   `src/utils/projectionSignals.js` in the lines CR-28 lists. `lib/durabilityMirror.mjs`
   (mirrored at `d627562`) therefore still equals the app, and its DM-1 test pins that.
   - Step 6 is at `seasonProjection.js:879-923`: `projectedGames = Math.round(clamp(avgGames, 8, 17))`
     at `:922`.
2. **`projectedGamesFor` does not return the unrounded final `avgGames`.** It returns
   `avgGamesBase`, the value before the injury and shape multipliers. Calibration must act on
   `avgGames` as it stands just before the round and clamp, because that is where a wiring change
   would sit. Hence §2.
3. **Weekly status in S+1.**
   - Season-totals `weeklyStatus` is per slot (index i = week i+1), with values `'P'`, `'D'`, `'X'`
     and `'B'`. Byes and week-18 slots are `'X'`, not `'B'`. Session 1's first probe miscounted
     byes as missed weeks before switching to team-played weeks.
   - Which weeks a team played comes from `teamPlayedWeeks(totals)` in `lib/absence.mjs`:
     `Map<team, Set<slotIndex>>` from the `TEAM_*` rows.
   - The weekly roster is `nflverse/rosterweekly/<y>.json` `.players[id][week] = [[team, status], …]`.
   - Before 2016 the status is season-level, so no week-level accounting is possible
     (`MIN_ABSENCE_CLASSIFY_SEASON`). The panel's outcome seasons are 2016–2025, so every outcome
     season is classifiable.
4. **Age:** `nflverse/playerids.json` `.bySleeper[id].birthdate`, read with `ageOnDate(birthdate,
   isoDate)` from `lib/inSeasonEvidence.mjs`. Session 1's probe found no panel row without a
   birthdate. The harness still counts missing ones and routes them to the position cell.
5. **Reusable helpers.** Read their bodies; do not re-implement:
   - `bootstrapPairedMean(ids, diffs, opts)`: player-clustered, `IN_SEASON_DEFAULTS.bootstrap`
     (4000, seed 12345);
   - `errorSummary`;
   - `spearman` (`lib/backtest.mjs`);
   - `forwardChainFolds`;
   - `ageOnDate`;
   - `buildPanel` and `parityReport` (`scripts/absence-run.mjs`);
   - `ABSENCE_LOAD`;
   - `guardLoad` (`scripts/inseason-run.mjs`), with `maxLoadSeason` 2025.

The adapter's load is `GAMES_CAL_LOAD = { ...ABSENCE_LOAD, gitRev: () => execSync('git rev-parse HEAD') }`,
trimmed. Add `gitRev` to `guardLoad`'s skip list only if its memoising wrapper breaks on a no-arg
call; read `guardLoad` to check. GC-7 stubs `gitRev`.

   `pairedDelta` in `lib/inSeasonEvidence.mjs` is absolute-error only, and it keys clusters on
   `r.sleeperId`, so it does not fit here. Build the squared-error and absolute-error diffs yourself
   and pass them to `bootstrapPairedMean`.
6. **Session 1 probe, for orientation only.** The harness reports its own numbers. On the current
   store the panel has 4,362 rows with bias +3.43.
   - Rows with no off-roster, practice-squad, cut or other-status team-played week in S+1:
     n ≈ 3,368, bias ≈ +1.8.
   - Rows whose S row has gp ≥ 8: bias ≈ +2.5. Rows with gp < 8 or no S row: n ≈ 977, bias ≈ +6.7.
   - QBs lose about 4.7 team-played weeks per row as active but not playing (backups).

   The probe's team-week rule was rough; §3.1 is the rule.

## 2. `lib/durabilityMirror.mjs` — one additive field

In `projectedGamesFor`, return `avgGames` as well: the value after `*= absenceShapeFactor` and
before `Math.round(clamp(…))`. The return becomes
`{ projectedGames, injurySeasons, absenceShapeFactor, avgGamesBase, avgGames }`.
- Change no other line.
- Update the JSDoc return line.

`test/durability-mirror.test.mjs` gains **DM-4**. Over every DM-1 fixture row that has a qualifying
season, assert `Math.round(Math.min(17, Math.max(8, r.avgGames))) === r.projectedGames`. This
proves the new field is the exact pre-round value.

DM-1, DM-2 and DM-3 stay unchanged and must stay green.

## 3. Harness — `bin/backtest.mjs --games-calibration`

New files:
- `lib/gamesCalibration.mjs`: pure, no I/O;
- `scripts/games-calibration-run.mjs`: the adapter, with an injectable `load`.

Follow `--absence`'s shape:
- reject any flag other than `--json`/`--write`;
- `--write` persists `backtests/<date>-games-calibration-panel.json`,
  `backtests/<date>-games-calibration-constants.json` and
  `grading/<date>-games-calibration-verdict.md`.

`GAMES_CAL_DEFAULTS` is exported and frozen:

```js
{
  seasons: { from: 2012, to: 2025 }, predictorSeasons: { from: 2015, to: 2024 },
  minTrainSeasons: 3, snapshotDate: '2026-10-07', parityMin: 0.99,
  bootstrap: IN_SEASON_DEFAULTS.bootstrap,
  ageBuckets: { QB: [26, 31, 35], other: [24, 27, 30] },   // upper bounds: ≤26 | 27–31 | 32–35 | 36+ ; ≤24 | 25–27 | 28–30 | 31+
  ageRefDate: (season) => `${season}-09-01`,               // age at Sep 1 of S+1
  relevantTopN: { QB: 32, RB: 60, WR: 84, TE: 32 },
  kGrid: { from: 0.50, to: 1.20, step: 0.01 },
  minCellTrainPlayers: 40,
  floors: [8, 0],
  biasGate: 1.0,
  reconcileTolerance: 0.05,
}
```

**Run order:**
1. `guardLoad(ABSENCE_LOAD-compatible load, { maxLoadSeason: 2025 })`.
2. `parityReport(loadParityFixture())`. Below 0.99, throw a `ParityStop` and write nothing. This
   reuses Stage B's gate, because the mirror is the predictor.
3. Load season-totals 2012–2025, rosterweekly 2012–2025, playerids, and
   `snapshots/<snapshotDate>.json`.
4. `buildPanel({ before: store, after: store, rosterByYear, positionOf, draftYearOf })`.
5. Enrich each row (§3.1).
6. Run Q-A (§3.2–3.3), then Q-B (§4), then build the verdict.

### 3.1 Row enrichment (pure, `enrichRow`)

For each panel row `{ id, S, position, after: pred, outcome }`, add the following fields.

- `avgGames`: from `projectedGamesFor(store, id, position, { throughSeason: S }).avgGames`.
  - Assert `Math.round(clamp(avgGames, 8, 17)) === pred` for every row. A mismatch throws.
- `age`: `ageOnDate(bySleeper[id].birthdate, ageRefDate(S+1))`, or `null`.
- `ageBucket`: from `ageBuckets`. It is `'unk'` when `age` is `null`.
- `sState`: `'qual'` when the S row has gp ≥ 8, `'short'` when the S row has gp < 8 (gp 0
  included), and `'none'` when there is no S row.
- `relevant`: the S row exists, and its `fantasyPoints` rank within position in season S is
  ≤ `relevantTopN[position]`.
  - The rank is computed over every non-`TEAM_*` row of S whose `positionOf` is that position and
    whose `fantasyPoints` is finite.
  - The sort is descending, with ties broken by id.
- `qbStarterS` (QB only): the S row has `gamesStarted` ≥ 8. This is descriptive. A `chain` QB's
  total does not use `projectedGames` (§0), and historical rows cannot be routed to `chain`.
- `weeks`: the S+1 accounting below.

**S+1 week accounting.** Let `played = teamPlayedWeeks(store[S+1])` and `rw = rosterweekly[S+1].players[id] ?? {}`.

For each slot i (0 … 17):
1. Find the player's candidate teams for week i+1:
   - first, the teams in `rw[i+1]` pairs;
   - if there are none, the S+1 row's `team`;
   - else the S row's `team`;
   - else none. A row with no team in any week is counted in `accountingSkipped` and excluded from
     the accounting tables only.
2. The slot is a **team game** iff some candidate team `t` has `played.get(t)?.has(i)`. Skip any
   other slot.
3. Classify each team-game slot:
   - **`played`**: the S+1 row exists and `weeklyStatus[i] === 'P'`.
   - Otherwise, by the statuses of the pairs whose team played that slot, highest priority first:
     - `RES` or `PUP` → **`reserve`**;
     - `INA` → **`inactive`**;
     - `ACT` → **`activeNoPlay`**;
     - `DEV` → **`practiceSquad`**;
     - any other status that is not `CUT` → **`otherStatus`** (for example `SUS`, `RSN`, `EXE`,
       `NWT`, `TRC`);
     - `CUT`, or no pair at all → **`offRoster`**.

   For a no-row outcome-0 player, every team-game slot goes through the same rule.

Per row, store `G` = the number of team-game slots and each category's count. **Reconciliation:**
`recon = played − outcome`. The plan gate's probe found recon = 0 on every live row, because `'P'` count equals `gamesPlayed` throughout 2016–2025.
- Report the mean, the count of rows with `recon ≠ 0`, and the five largest by |recon|.
- If |mean recon| > `reconcileTolerance`, the run continues, but §5 outcome (S) is forced.

The exact identity per row is:

`pred − outcome = (pred − G) + reserve + inactive + activeNoPlay + practiceSquad + otherStatus + offRoster + recon`

`lib/gamesCalibration.mjs` exports `accountWeeks({ s1Row, s0Row, rwPlayer, played })` as the pure
unit. **GC-1** (§6) tests it.

### 3.2 Q-A decomposition table

The groups:
- **schedule** = `pred − G`. This is usually negative: a 17-game season predicted from a 16-game
  history, or the clamp.
- **composition** = `offRoster + practiceSquad + otherStatus`: the player was not on a 53-man roster
  or reserve list.
- **role** = `activeNoPlay + inactive`. These are healthy but not playing. INA also includes injured
  gameday inactives: the injury report is not ingested (L5 known limitation), so label the column
  "inactive (mixed)".
- **injury list** = `reserve`.
- **recon** = `+recon`.

Below the all-rows table, print the per-status slot counts inside `otherStatus` (e.g. SUS, NWT,
RET, RSR, EXE, RSN, TRC, TRD, UFA, RFA). RSN and RSR are reserve designations counted here as
composition, and the counts let Anton see whether moving them would change the headline.

Each cell's contributions are mean per-row games, and they sum exactly to the cell's bias. Print
the cell's bias and n beside them.

Cells:
- all rows;
- by position;
- by `ageBucket` within position;
- by `sState`;
- `relevant` vs not;
- QB `qbStarterS` vs not;
- outcome season 2016–2020 vs 2021–2025.

**Era caveat (print it under the table).** The rosterweekly status vocabulary changes by era:
- INA is absent in 2016–2018, so gameday inactives land in `activeNoPlay`;
- DEV is nearly absent in 2016 (48 rows, against 2,924 in 2017), so practice-squad players count as
  `offRoster`.

The group totals hold across eras: role = ACT + INA, and composition = DEV + off + other. For
outcome seasons before 2019, read the individual category columns at group level only.

Then two **counterfactual biases**:
- **stayed:** rows with composition = 0, i.e. on a roster or reserve list every team game. This is
  the bias the durability model shows on players who stayed in the league all year.
- **stayed and available:** stayed, plus role = 0 and injury list = 0. The bias left here is pure
  `schedule + recon` plus model level.

The verdict's headline answer to Q-A is the sentence:
"Of the +X.XX bias, composition contributes C, role R, injury list I, schedule Sch."

Also give "stayed" bias by position and `sState`. That is the "durability model" figure L6 asks
for.

### 3.3 Composition sensitivity: alternative panels

Recompute bias and n under three panel rules, from the same predictor rows:
- **P-strict:** drop every no-S+1-row player, including the Stage B outcome-0 rows.
- **P-stageB:** the panel itself.
- **P-wide-active:** P-stageB, plus each excluded row whose player has an S season-totals row or
  any S rosterweekly listing. These are players active in S who vanished in S+1, which is the
  composition question proper.
- **P-wide:** every no-S+1-row player is included at outcome 0, including the 5,980 that Stage B
  excluded. This is the labelled outer bound only. `qualifyingSeasons` has no recency cut, so it is
  mostly long-retired players repeated for every later S.

P-wide needs `buildPanel`'s excluded rows. Build them in the adapter by re-running the same
eligibility loop: a predictor row that `buildPanel` counts as `excludedNoRowNoReserve`. Do not
modify `buildPanel`. Instead, export a small helper `panelEligibility` from
`scripts/games-calibration-run.mjs` that walks the same predicate.

`panelEligibility` copies the non-exported pieces of `buildPanel`'s predicate verbatim:
- `POSITIONS` (`scripts/absence-run.mjs:32`);
- `hasReserveListing` (`:125-126`, on the exported `MISSED_ROSTER_STATUSES`);
- the `firstSeason` scan over the store with `isTeamAggregateId`;
- the order of checks: `pb && pa`, then `draftYearOf[id] ?? firstSeason[id]`, then
  `rookieYear <= S − 1`, then the S+1 row / reserve listing.

Each copy carries a comment naming its source line.

**GC-2** asserts that `panelEligibility`'s P-stageB set equals `buildPanel`'s rows, as ids × S,
on the real store. Run it in the harness too: a mismatch throws.

## 4. Q-B held-out calibration

A candidate maps a row to a predicted games value. Each one uses a **multiplicative scale** on
`avgGames`, fitted per cell:

`pred_c(row) = Math.round(clamp(avgGames × k_cell, floor, 17))`.

**Fitting k for a cell** (`fitK(rows, floor, kGrid)`, pure):
- take the grid value that minimises training **SSE** of `pred_c − outcome`;
- ties go to the value closest to 1.00, then to the smaller value;
- build the grid as integer hundredths, `k = i / 100` for i = 50 … 120, never by accumulating
  `step`, so tie comparisons are exact.

Fit on SSE under both D1 rules, so a candidate is the same object whichever rule Anton picks. The
MAE-rule decision then judges the SSE-fitted candidates by ΔMAE. **Do not** fit a second, L1 set:
that would double the candidate count after the fact.

**Cell fallback:** a cell with fewer than `minCellTrainPlayers` distinct training players uses its
parent cell's k. The parent chain is:
- pos × age × sState → pos × sState → pos;
- pos × age → pos.

Record every fallback per fold.

| id | cells | floor |
|---|---|---|
| C0 | the app rule (`pred` from the mirror) | 8 |
| C1 | position | 8 |
| C2 | position × ageBucket | 8 |
| C3 | position × sState | 8 |
| C4 | position × ageBucket × sState | 8 |
| C1f0 … C4f0 | as C1–C4 | 0 |

The `f0` variants exist because the floor alone forces a minimum of 8 on rows that, in the probe,
reached 0 often enough (513 of 4,362) to matter. A wiring change would have to lower the app's
clamp. The verdict says so beside them.

**Held-out evaluation.** For each fold (D3), fit each candidate on the training rows and predict
the eval-season rows. Over the pooled out-of-sample rows (`oos`), report per candidate:
- n, bias, MAE, RMSE;
- Spearman (pred vs outcome) over all rows and the mean of the within-position values;
- **ΔMSE vs C0**: per-row `e_c² − e_0²`. Compute the mean directly over the rows, as `cellStats` in
  `absence-run.mjs` does. Take only `ci95` from `bootstrapPairedMean` (clustered on `id`); its
  return is `{ resamples, seed, clusters, used, ci95, pNegative }` with no point mean. Print `n/a`
  when it returns `null`;
- **ΔMAE vs C0**: the same with `|e|`.

The same tables are repeated for these cells:
- by position;
- by ageBucket within position;
- by sState;
- `relevant`;
- eval S 2020–2024, the 17-game outcome era.

Cells with fewer than 30 players print `n/a`, not a CI.

**Full-sample constants.** For each candidate, fit once more on every panel row (S 2015–2024).
This k table is what a wiring slice would pin. Write it to
`backtests/<date>-games-calibration-constants.json` as:

```
{ generatedAt, panelRev: <load.gitRev()>, candidates: { C1: { floor, k: { QB: …, … } }, C2: { floor, k: { 'QB|<=26': … } }, … }, fallbacks }
```

**2026 impact** (descriptive), for the §5 pick under each D1 rule, or "none":
- the population is the veteran QB/RB/WR/TE rows of `snapshots/<snapshotDate>.json` (`confidence`
  is not `'rookie'`; position from playerids);
- compute `projectedGamesFor(store, id, pos, { throughSeason: 2025 })`, then the candidate with the
  full-sample k;
- report the distribution of projectedGames before → after (counts 8…17, and 0–7 for f0);
- report the mean change per position;
- report the 15 largest |Δ|, with name from `raw/-players-nfl.json`, position, age bucket, sState,
  and before → after;
- for each position, give the number of QB/RB/WR/TE whose position rank by
  `projectedPPG × projectedGames` changes. **Read `projectedPPG` from the snapshot row's
  `projection.projectedPPG`.** The harness does not recompute PPG.

## 5. Decision rule (pre-registered, computed by the harness)

A candidate c ≠ C0 is **eligible** under the squared-error rule (the default D1) iff all four
hold:
1. the pooled `oos` ΔMSE CI upper bound is below 0;
2. |pooled `oos` bias| ≤ `biasGate` (1.0 game);
3. no position cell has a ΔMSE CI lower bound above 0, i.e. no position is made significantly
   worse;
4. the `relevant` cell's ΔMSE mean is ≤ 0.

**Pick.** The tiers, in total order, are:

C1 < C1f0 < {C2, C3} < {C2f0, C3f0} < C4 < C4f0

1. **Within a two-member tier,** keep only the eligible member with the lower pooled MSE (MAE under
   the alternative rule). Do this before the walk.
2. **Walk** upward from the lowest tier with an eligible member; that member is the incumbent.
3. A higher tier's member replaces the incumbent only when its paired ΔMSE **vs the incumbent**
   (same bootstrap, clustered on `id`) has a CI upper bound below 0. Under the alternative rule,
   ΔMAE plays the same role.

Under the MAE rule (D1 alternative), the picking procedure is identical with ΔMAE in place of
ΔMSE. Condition 2 is dropped: a median-calibrated rule is biased by design.

**Outcomes.** The verdict prints an outcome label for **each** D1 rule: W or N, or S for both.
- **(W) wire `<id>`:** an eligible pick exists under that rule. A wiring slice follows. It
  is an app change to `seasonProjection.js` Step 6 with pinned k constants and possibly the clamp
  floor, plus a CR-28 Mirror update and a re-mirror of `lib/durabilityMirror.mjs`. It is planned
  separately, after Anton reads this verdict.
- **(N) no change:** nothing is eligible. The decomposition stands as the explanation.
- **(S) stop:** |mean recon| > tolerance. Report the defect and make no recommendation.
- **Aborts, not verdicts:** a parity failure (`ParityStop`) or an `avgGames` assertion failure throws
  and writes nothing.

**The choice is Anton's.**

## 6. Tests

- **DM-4** (§2) in `test/durability-mirror.test.mjs`.
- `test/games-calibration.test.mjs`:
  - **GC-1 `accountWeeks`:** synthetic S+1 data with one slot of each kind:
    - P on a team-game week;
    - a bye (`'X'` with the team idle), which is not counted;
    - RES, INA, ACT-with-`'D'`, DEV, SUS;
    - CUT, and no listing, both → `offRoster`;
    - a traded week with two pairs, where only the second team played → classified by the second
      team's status.

    - one `'P'` slot on a week where no candidate team played, so it is not a team game and
      recon = −1. This tests the sign.

    Assert each count and that the §3.1 identity holds exactly.
  - **GC-2:** the `panelEligibility` P-stageB set equals `buildPanel` on a synthetic 3-season store
    that contains one row of each eligibility class.
  - **GC-3 `fitK`:**
    - a fixture whose rows make 0.80 the **unique** SSE minimiser at floor 0 returns 0.80. Choose
      rows where `avg × 0.795` and `avg × 0.805` fall either side of a .5 rounding boundary, and
      assert the uniqueness inside the test, i.e. SSE at 0.79 and at 0.81 is greater than at 0.80;
    - a tie returns the value closest to 1;
    - the floor 8 clamp is applied before the SSE.
  - **GC-4 fold leakage:** for each fold, assert that no training row has S ≥ t, and that the
    S = t − 1 rows are present. Build the folds from `forwardChainFolds`.
  - **GC-5 fallback:** a cell with fewer than `minCellTrainPlayers` training players takes its
    parent's k, and the fallback is recorded.
  - **GC-6 decision:**
    - synthetic candidate summaries reproduce each branch:
      - simplest-eligible;
      - upgrade on a paired CI below 0;
      - the C2/C3 within-tier resolution by pooled MSE;
      - the f8 → f0 step requiring a CI win;
      - the (N) branch;
      - (S) on recon;
    - the MAE rule drops the bias gate.
  - **GC-7 CLI:** an unknown flag is rejected. `--write` writes all three artifacts at the dated
    paths under a tmp root, following the `absence-run.test.mjs` pattern.

## 7. Verdict file — `grading/<date>-games-calibration-verdict.md`

Sections:
1. **What was compared.** Panel, store rev, folds, the D1 rule.
2. **Parity and reconciliation.** DM-1 rate, the `avgGames` assertion, recon mean / count /
   largest five, `accountingSkipped`.
3. **Q-A decomposition.**
   - the §3.2 table, with all rows first;
   - the headline sentence;
   - the stayed and stayed-available counterfactuals;
   - the §3.3 panel sensitivity (P-strict / P-stageB / P-wide).
4. **Q-B held-out results.**
   - the candidate table: n, bias, MAE, RMSE, ρ, ΔMSE [CI], ΔMAE [CI];
   - the cell tables;
   - the fallback counts.
5. **Full-sample k table** for every candidate.
6. **Decision.** Eligibility per candidate under each rule (which condition failed), the pick under
   each rule, and the outcome W/N/S.
7. **2026 impact** for each rule's pick.
8. **Limits.**
   - INA mixes healthy scratches with injuries.
   - `chain` QB totals do not read `projectedGames`.
   - The `relevant` rank uses served half-PPR `fantasyPoints`. §4's rank impact uses the
     snapshot's league-scored `projectedPPG` (`scoringBasis: "custom league"`).
   - Era caveat: see §3.2.
   - Rookies are out of scope: the rookie games ladder reads no history.

## 8. Touch list, done-definition, commits

**Touch list:**
- `lib/durabilityMirror.mjs` (§2: one returned field and its JSDoc);
- `lib/gamesCalibration.mjs` (new);
- `scripts/games-calibration-run.mjs` (new);
- `bin/backtest.mjs` (dispatch and help block);
- `package.json` (`backtest:games-calibration`);
- `test/durability-mirror.test.mjs` (DM-4);
- `test/games-calibration.test.mjs` (new);
- `README.md` → Module notes (`lib/gamesCalibration.mjs`, offline, no registry entry);
- `CLAUDE.md` (24,982 bytes now; the ceiling is 25,000), exactly these edits:
  - `:16`, the Backtest row: replace
    ``; `--inseason [--dynasty]` (in-season k-fits); `--qb-takeover` (QB takeover fit); `--qb-rookie-level` (rookie QB starter PPG); `--absence` (absence correction)``
    with
    ``; `--inseason [--dynasty]`, `--qb-takeover`, `--qb-rookie-level`, `--absence`, `--games-calibration` ``
    (no trailing space before the ` |`).
  - `:67`, the `lib/backtest.mjs` row:
    - replace ``Pure backtest stats (standardized OLS, quintiles, team totals); no I/O.`` with
      ``Pure backtest stats; no I/O.``;
    - after ``mirror of the app's durability rules (CR-28)`` append
      ``; `lib/gamesCalibration.mjs` `--games-calibration`'s pure fit``.

  The expected net is about −45 bytes. Report the final byte count. If the test still fails, stop
  and report;
- the run's three artifacts;
- this task file (hand-back record only).

**Not touched:**
- `nfl/`, `nflverse/`, `snapshots/`, `manifest.json`;
- `cross-repo-registry.md`;
- `scripts/absence-run.mjs` (import only);
- `lib/absence.mjs`;
- the app repo.

**Done-definition:**
- `npm test`: no new failures, and DM-1 … DM-4 and GC-1 … GC-7 green.
  - One failure is known and outside this slice:
    `test/panel-fit.test.mjs` "assembleRookiePanel … reproduces
    backtests/2026-09-06-fullpipeline-panel.json's rookiePanel exactly" (2563 vs 2564, after the
    2026-10-07 playerids refresh).
  - Do not touch it. Report the pass/fail counts;
- `npm run smoke` green;
- `node bin/backtest.mjs --games-calibration --write` run, and the three artifacts committed.

**Commits:**
1. `Games calibration: avgGames from the durability mirror + --games-calibration harness (L6)`.
2. `grading: games-calibration verdict <date>`.

Do not push; Session 1 verifies first.

**Hand back:**
- the verdict's §3 headline sentence;
- the §4 candidate table;
- §6 verbatim;
- every deviation from this file.

## Cross-repo impact

- **CR-28** is touched on its data side: `lib/durabilityMirror.mjs` is one of its listed data
  triggers. The change is additive (one new returned field). The mirrored app behaviour is
  unchanged, and DM-1 still pins it at app `d627562`.
  - CR-28 Mirror text, verbatim:

    > Changing the status set, the team-played source, the 2016 floor or the slot rule changes app `projectedGames`/`projectedTotalPts`, the ×1.05 bounce-back on `projectedPPG` for a few rows, dynasty reliability, the bounce-back/injury-risk badges and labels, and every games-missed display, **with no app-side diff** — add a `grading/anchor-policy.md` boundary. **The correction is one-way:** the stored files no longer hold the Sleeper-only baseline. A widening change can be graded with `bin/backtest.mjs --absence` and applied by re-running `scripts/migrate-absence-roster.mjs`; a narrowing change needs a forced Sleeper re-fetch of every affected season (with CR-02's dominant-team risk) and has no before/after harness. `lib/durabilityMirror.mjs` mirrors the app triggers above at a pinned app SHA; an app change to any of them silently stales that harness, so re-mirror and re-run its DM-1 parity test in the same change. A completed season re-aggregated with `--force` classifies against its own stored roster file, so editing or deleting that file changes a sealed season's `'D'` on the next forced run. The app's API-only mode keeps Sleeper-only `'D'`, so its games-missed counts and durability differ from the store's. In-season, a week's gameday inactives reach `'D'` one season-totals run after the games (the roster refresh runs daily at 06:23 UTC, after the 06:13 run).
  - **App action: none.** No app trigger changes, and DM-1 re-runs green in this change.
  - The registry's trigger list for CR-28 already names `lib/durabilityMirror.mjs`, so no
    registry edit is needed.
- **CR-15** is not touched: `lib/projectionFactors.mjs` does not move, and the new k constants are
  research output, not a mirror.
- No served contract changes, and no `grading/anchor-policy.md` boundary: nothing served moves.
- **If the verdict is (W),** the wiring slice is where CR-28's Mirror text becomes an app change.
  That slice changes `computeNextSeasonProjection` Step 6, an app-side CR-28 trigger, and therefore
  needs the parent-folder route (an app change plus a data re-mirror in one change). It **needs** a `grading/anchor-policy.md` boundary. The served snapshot fields `projectedGames`
  and `projectedTotalPts` (the CR-01 payload, read by `lib/grade.mjs`) shift for every veteran.
- **Registry staleness, owed at the next registry sync (two-session route; no edit in this slice).**
  Proposed D-66: CR-28's data-side Triggers should add two readers that classify rosterweekly
  statuses or call `teamPlayedWeeks` themselves, so that a status-set change does not silently stale
  them:
  - `scripts/absence-run.mjs` (`hasReserveListing`, `ABSENCE_LOAD.loadRosterWeekly`);
  - `scripts/games-calibration-run.mjs` / `lib/gamesCalibration.mjs` (`accountWeeks`).

## Plan gate (plan-reviewer, 2026-10-08) — decisions

15 flags. Session 1 verified the load-bearing ones against live source:
- CLAUDE.md is 24,982 bytes;
- `panel-fit` fails 1 test at HEAD;
- the 2017 rosterweekly file has no INA.

All 15 are applied.

| # | Flag | Decision |
|---|---|---|
| 1 | recon sign in the identity is inverted | Applied: `+ recon`; GC-1 adds a recon = −1 slot |
| 2 | GC-3 0.80 not a unique minimiser; float grid | Applied: unique-minimiser fixture asserted; integer-hundredths grid |
| 3 | P-wide is mostly long-retired repeats | Applied: P-wide-active added; P-wide kept as labelled outer bound |
| 4 | INA/DEV vocabulary changes by era | Applied: era caveat printed under §3.2 and in Limits |
| 5 | otherStatus hides RSN/RSR | Applied: per-status counts printed |
| 6 | CLAUDE.md has 18 bytes headroom | Applied: exact trims named in §8 (net ≈ −45) |
| 7 | pre-existing panel-fit failure | Applied: done-definition is "no new failures" |
| 8 | bootstrapPairedMean has no point mean | Applied |
| 9 | pick order ambiguous (f0, C2/C3) | Applied: one total order; within-tier resolved by pooled error first |
| 10 | parity/assertion (S) unreachable; W only for default rule | Applied: those abort; W/N printed per rule |
| 11 | snapshot PPG is league-scored | Applied |
| 12 | git shell-out in adapter | Applied: `load.gitRev()` |
| 13 | panelEligibility copies unnamed pieces | Applied: pieces named with source lines |
| 14 | CR-28 quote partial; W boundary is required | Applied: full Mirror text; boundary stated as required (CR-01) |
| 15 | CR-28 Triggers miss rosterweekly readers | Queued as proposed D-66 for the next registry sync |

## Verification record (Session 1, 2026-10-08, `58a0830..aac3d49`)

The implementation-reviewer ran at full depth. It found no blocking flags. Independently checked:
- `--games-calibration --json` reproduces both committed artifacts exactly (ignoring
  `generatedAt`/`panelRev`).
- The squared-error pick W C3f0 and the MAE pick N were recomputed in-process from the
  out-of-sample rows:
  - C3 is the incumbent;
  - C3f0 vs C3 CI [−1.285, −0.496] → upgrade;
  - C4 vs C3f0 CI [0.471, 1.284] → no upgrade;
  - C4f0 vs C3f0 CI [−0.179, 0.205] → no upgrade.
- The §3.1 identity holds on all 4,362 rows. Recon is 0 everywhere and 0 rows are skipped.
- No fold leakage.
- `npm test`: 1403 pass / 1 known fail (panel-fit) / 4 skipped. Smoke is green.
- CLAUDE.md edits are byte-exact (24,941 bytes). No change outside the touch list.

Session 2's deviations are all accepted:
- the task file is committed in commit 1;
- the README CLI-flag and write-list lines (they sit under Module notes);
- the DM-1 count of 431 is `parityReport`'s normal count;
- per-slot team fallback;
- the `ctx` memo;
- `relevant` = true rows for condition 4;
- display rounding.

`panelRev` in the committed artifacts reads `8e61ecb` (the run was from an uncommitted tree).
Fix pass 1 regenerates the artifacts, so the rev names a commit containing the harness.

| # | Flag | Decision |
|---|---|---|
| 1 | (low-med) CLAUDE.md:28 "Other shortcuts" omits `backtest:games-calibration` | Fix pass 1 item 1 (a plan gap) |
| 2 | (low) eligibility reads 3-dp-rounded mean/CI | Fix pass 1 item 2 |
| 3 | (low) `unk` age rows fall to `pos\|s` in C4, not `pos` as §1.4 says | Fix pass 1 item 3 |
| 4 | (low) `panelRev` = base commit | Fix pass 1 item 5 (regenerate) |
| 5 | (low-med) GC-1 traded week does not discriminate | Fix pass 1 item 4a |
| 6 | (low) four behaviours untested | Fix pass 1 items 4b–4e |

## Fix pass 1

**Scope:**
- `CLAUDE.md`;
- `lib/gamesCalibration.mjs`;
- `test/games-calibration.test.mjs`;
- the three dated artifacts (regenerated in place: same date `2026-10-08`).

Touch nothing else.

1. **CLAUDE.md:28.** Replace `backtest:{inseason,qb-takeover,qb-rookie-level,absence}` with
   `backtest:{inseason,qb-takeover,qb-rookie-level,absence,games-calibration}`.
   - Report the final byte count; it is expected at 24,959.
   - `test/claudeMdSize.test.mjs` must pass.
2. **Raw values for decisions.** `deltaStats` (`lib/gamesCalibration.mjs:~285-295`) must return the
   unrounded `mean` and `ci95`. Round to 3 dp only where tables and artifacts are rendered.
   `eligibility()` and the paired-upgrade test in the pick walk must read the unrounded values.
   - Any persisted JSON keeps 3-dp values: round at serialisation.
3. **`unk` age routing.** In `kFor`, when `r.ageBucket === 'unk'` and the candidate's levels include
   an age level (`pos|age` or `pos|age|s`), use only the `pos` level. This is §1.4: "routes them to
   the position cell". C2/C2f0 behaviour is unchanged by construction. Leave `cellKey` otherwise as is.
4. **Tests** (`test/games-calibration.test.mjs`):
   - **(a)** GC-1 traded week: change slot 9's pairs to `[['KC', 'RES'], ['CHI', 'ACT']]`. The
     expected classification stays `activeNoPlay`, and the expected counts are unchanged. Add a
     comment saying that classifying by all pairs would give `reserve`.
   - **(b)** Fallback step 3: a slot with no pairs and no S+1 row, where the S row's team played,
     is counted as a team game classified `offRoster`. A second case has the S row's team idle:
     not a team game.
   - **(c)** `fitK` second tie-break: a fixture where two grid values equidistant from 1.00 (e.g.
     0.95 and 1.05) tie on minimal SSE, and nothing nearer 1.00 does. Assert 0.95.
   - **(d)** C4 three-level chain:
     - a row whose `pos|age|s` cell is thin but whose `pos|s` cell is fitted gets the `pos|s` k;
     - a row where both are thin gets the `pos` k;
     - a row with `ageBucket 'unk'` gets the `pos` k even when `pos|s` is fitted (item 3).
   - **(e)** `--write` end to end: call `gamesCalibrationMain` with the GC-7 synthetic load,
     `write: true` and the real writer under a tmp root. Assert that the three dated files exist and
     that the verdict contains "## 6. Decision".
5. **Commit, then regenerate.**
   1. Commit items 1–4 first as
      `Fix pass 1: L6 — raw decision values, unk age routing, CLAUDE.md shortcut, tests`.
   2. Then run `node bin/backtest.mjs --games-calibration --write`. It overwrites the three
      2026-10-08 artifacts. If the run date is no longer 2026-10-08, stop and report rather than
      writing new dated files.
   3. Confirm with `git diff` that only `generatedAt` and `panelRev` change, and that `panelRev`
      now names the fix commit. If any number or decision changes, stop and report.
   4. Commit as `grading: games-calibration verdict 2026-10-08 regenerated (fix pass 1 rev)`.

**Done-definition:**
- `npm test`: no new failures; GC-1 … GC-7, the new tests and DM-1 … DM-4 green.
- `npm run smoke` green.

Use the attribution trailer. Do not push.

Re-review of `aac3d49..1c4320f` (fix pass 1): clean.
- All six items are confirmed.
- Each new test fails on the wrong implementation.
- The artifact JSON changes only `generatedAt`/`panelRev` (now `3bbc4fa`).
- The verdict changes 59 table cells by ≤ 0.01: the double rounding was removed. No decision line moved.
- `npm test`: 1407 pass / 1 known fail / 4 skipped.

Two low flags survive. Per the convention they go to Anton, with no third round. Session 1
recommends deferring both, since neither moves this run:
1. no test pins that the decisions read unrounded values (a `deltaStats` mean of 0.0004 case);
2. the within-tier sort still reads 3-dp pooled MSE (C3f0 29.905 vs C2f0 32.991 here).

Fold both into the wiring slice if one is planned.

**L6 research is verified.** It is unpushed (`58a0830`, `aac3d49`, `3bbc4fa`, `1c4320f`, plus this record),
awaiting Anton's D1 choice and push sign-off.
