# W2 — Provenance and record items: D-9, D-10, D-12, D-14, D-54

**Session 1, 2026-10-10 (opus), parent-folder read of both repos.** Baselines: data `b4472ad`, app `c318487`. Both
are W1's commits. They are **unpushed** and await Anton's sign-off. W2 stacks on them, so nothing in W2 is pushed
before W1 is. Source: `../future_plans/in-season-notes-plan.md` → "Close-out programme (2026-10-10)" → W2. Input list:
`../sleeper-dashboard/.claude/tasks/data-repo-backlog.md`. D-50 is planned separately in
`snapshot-model-marker-d50.md`, because it changes the app's capture first.

**Rules (Anton):** one commit per item, and **no score changes**. No app `projectedPPG`, `projectedGames`, dynasty
score or pinned constant moves. Every re-run below is gated on that.

**Route.** **Stage A** is a data-repo session (sonnet), commits A1–A4. **Stage B** is an app-repo session (sonnet),
commits B1–B5, specified in `provenance-records-w2-app.md`. B needs A's SHAs and the run date. Two exceptions to "one commit per item": an item with work in
both repos gets one commit per repo, and A2 is a separate prerequisite commit for D-12 (the pin fix stands on its own). **No registry edit** (§5), so there is no CR-24 red window. Push order
after sign-off: W1 first (app, then data), then W2 data, then W2 app, all on the same day.

---

## 1. Triage (verified 2026-10-10 against live source)

Four of the five entries were mostly delivered in the data repo on 2026-09-11/12 and never struck in the app
backlog. Data `4534898`/`f0a7d07` built the rookie-outcome panels (D-8, D-9, D-12, D-13), and data `be514ca` built
the rookie mirror (D-14, D-10). What is actually left:

| id | state | what W2 does |
|---|---|---|
| D-9 | **Delivered.** §B of `grading/2026-09-12-rookie-verdict.md` gives the six-state breakdown per group × position. The entry's open question was whether to keep or retire the ≤ 1.00 clamp on `day3:QB`. Its row answers it: of 251 rows, 31 played ≥ 6 games, 84 played 1–5, 74 were rostered with zero games and 62 were absent (8 + 24 + 30). So the cell is survivor-selected, and the clamp stays. | B1: one doc sentence in the app, then strike. |
| D-10 | **Delivered on both sides.** The data side has `data-catalog.md:167` (be514ca). The app side has `docs/signal-registry.md:64` (the crosswalk row's "fitted to exactly the population `bySleeper.undrafted` defines"). Both cite `lib/nflverse.mjs:548`, which is stale: the derivation is now `undrafted: draftRound === null` at `:573`, inside `parsePlayerIdsCsv` (`:493`). | A1 and B2 fix the anchor, then strike. |
| D-12 | **Not delivered.** A panel is committed, but it does **not** reproduce the app's constants (§2). | A2 and A3 fix it and re-run. B3 adds the provenance pointer, then strike. |
| D-14 | **Delivered.** §G re-derives all eight quantiles with exact matches (`41f277e` constants), and `test/rookie-mirror.test.mjs` T-RM11 pins them. A3's re-run re-confirms them as a gate. | B4: strike only. |
| D-54 | Parts (b) and (d) are done (CR-25 App side, verified 2026-10-04). Parts (a), (c) and (e) are open (§3). | A4: mirror and harness. B5: strike. |

**Found in passing (not W2):**
- **D-13 is also already delivered.** Verdict §E (`4534898`) shows the PPG × games product is right within a few
  percent at group level. Every cell outside ±5% is a thin QB cell, and its finding says "do not re-fit". W3 lists
  D-13. Its planner should close it with that evidence rather than build a panel.
- **D-68** (boundary-7 cross-check) is open and runnable, but it is not in W2's list. It is untouched here.
- **The CLI's §A reproduction pin fails at HEAD today** (§2.3). A2 fixes it.

---

## 2. D-12: why the committed availability panel does not reproduce the app

### 2.1 Measured (Session 1, read-only scratch runs at data `b4472ad`)

The app ladder has 74 cells (`seasonProjection.js` `ROOKIE_GAMES_GPE/GE/GP/G/U` at app `c318487`). Compared with
the committed `backtests/2026-09-12-rookie-panel.json` `rookiePathAll.coverage.byRungCell`:
- Rung 4 matches.
- **20 cells move when rounded to whole games.** They are concentrated in the `2+` bucket: for example, rung 2
  `undrafted|2+` is 2.04 against 4.2, and `day3|2+` is 2.34 against 3.4.
- **All 16 rung-U cells are missing.**

Three faults cause this:

1. **The double-zero rule is the wrong rule, with the wrong window.** The app's recipe is stated verbatim in
   `../sleeper-dashboard/src/__fixtures__/rookie-games-panel-2026-09-09.json` `source.predicate`: "skip emitting a
   row at years_exp >= 2 when the player recorded zero games in both the target season and the season immediately
   prior … the walk itself continues past a skipped row, it does not stop there."
   `lib/panel.mjs:2036` (`enumerateEntryCohortRows`) instead **stops** the walk when `gamesOf(T−1)` and
   `gamesOf(T−2)` are both zero. `rookie-outcome-panels.md` §5 risk 1 worked from a paraphrase in the app task
   file, not from that source block. Its rejected "skip-and-continue" reading (9/46/278/469) also used the
   `T−1/T−2` window. That is why skip-and-continue looked wrong there.
2. **Rung U is accumulated over `draftGroup === 'unknown'` rows only** (`lib/panel.mjs:2194-2202`). The app's U
   ladder is "position × experience over the whole rookie-path population, pooled across all four groups"
   (`docs/projection.md` → Projected games). The entry cohort has no unknown-group rows today (assembled
   3,941 = the four groups' sum), so U came out empty.
3. Not a fault, a comparison rule: **the app stores each cell at one decimal and then rounds to whole games**. Five
   shipped cells sit on `.5` (r1|QB|0 11.5, day2|WR|0 13.5, day3|RB|1 3.5, r1|QB 10.5, U|QB|2+ 2.5). A comparison of
   `Math.round(unroundedMean)` against `Math.round(appValue)` therefore reports false moves (11.49 → 11 against
   11.5 → 12). The consequential comparison is `Math.round(Math.round(mean × 10) / 10)` against
   `Math.round(appValue)`.

**With 1 and 2 fixed (scratch prototype of exactly §4.2):**
- `rookiePathAll` assembles **3,848** rows with zero delta in every group × bucket cell.
- Every one of the 16 U cells matches.
- Over the 74 cells: **8 cells differ in n by one, 1 cell differs at one decimal (`undrafted|WR|0`: 2.85 → 2.9
  against 2.8), and 0 cells move in whole games.**
- All 9 differences come from the weekly crosswalk refresh `cde2d06` (2026-10-07). It added `12079` (undrafted TE,
  3 games in 2025, previously not position-resolved) and dropped `13001` (undrafted WR, 0 games, 2025 entry). The
  fixture was cut against the 2026-09-09 crosswalk.

### 2.2 Decision

Implement the app's stated recipe. This is not "tuning to a number", which `rookie-outcome-panels.md` rightly
refused. It corrects a misread of a recipe that is written down verbatim, and D-12's own text asks for the panel
"under the app's own routing predicate (… skip a row at `years_exp ≥ 2` on a double-zero-game gap)".
- The crosswalk drift stays visible in §D as a reported difference. The panel is a live, re-fittable panel, so it
  reads the live crosswalk.
- **No app constant changes**, since no cell moves in whole games. Re-fitting the ladder on the corrected panel is
  not owed.

### 2.3 The §A pin fails at HEAD, independent of D-12

`node bin/panel.mjs --rookie` today prints **§A FAIL**: legacy `assembled` 2564 against 2563, and `noOutcome` 1508
against 1507. The same refresh `cde2d06` added `12079`, a predictor-2024 row whose `draftYear` is 2025, the F12
late-draftYear case. `test/panel-fit.test.mjs` §6 test 1 was already moved onto a frozen crosswalk for exactly this
reason (`test/fixtures/rookie-pin-crosswalk-2026-09-06.json`, built by
`scripts/fixtures/build-rookie-pin-crosswalk.mjs`, data `924461b` era). `runRookiePanels` was not moved with it.
With the pin assembled on that fixture, the scratch prototype gives **PASS** (rows and coverage match), and §G still
matches at all four positions. A rerun with `--write` must not commit a FAIL, so A2 ports the test's approach into
the CLI.

**Also changed since 2026-09-12 (report-only):** L5 rewrote historical `dnpWeeks` (500 legacy rows and 685
`rookiePathAll` rows differ). README `:1336` already says post-L5 panels are not comparable on that field.

---

## 3. D-54: what (a), (c) and (e) mean in this repo

- **(a) Cap placement.** Since app `8ab6a5e`, `computeProspectScore` (`src/utils/dynastyScore.js:585`) caps the
  **starting value**: `start = hasMarketSignal ? startPPG : min(startPPG, 0.35 × max(peak, 1))`. The live posterior
  enters after the cap, uncapped. The data side's Q3 (`scripts/inseason-dyn-run.mjs` `buildQ3Items`/`q3Metrics`,
  `:501-562`) measures the cap **on the posterior score** (`capOf35.shareOver35` = the share of
  `modelScore(xn, p) > 35`), and it starts every row from the uncapped prior. CR-25 (app copy, §E of
  `in-season-evidence-2c-wiring-registry.md`) records "its Q3 prospect path caps after evidence".
  `PROSPECT_MIRROR`'s comment (`lib/inSeasonEvidence.mjs:625`) still says "FROZEN mirror … as of app 4b5e8e1".
  Its values are unchanged at `c318487` (`POSITION_PRIOR_PPG` 14/12/9/7, the age and draft tables, `NO_MARKET_CAP`
  35, prior weight 8, evidence cap 12, verified this session). Only the placement statement is missing.
- **(c) SHORT slot.** The app's `historyRowOf` (`src/utils/inSeasonScoring.js:141-151`) reads
  `careerStats[dataSeason − 1]` for a SHORT player. In-season `dataSeason = S − 1`, so that is season `S − 2`,
  exactly `historyPriorOf`'s `L = S − 2` (Q2's primary population). The app states this. The data mirror's docstring
  (`lib/inSeasonEvidence.mjs:706-710`) does not.
- **(e) Cap-placement comparison.** The comparison is in the evidence file
  (`../sleeper-dashboard/.claude/tasks/in-season-evidence-2c-wiring-evidence.md` §1) and was promised "backfilled as
  a committed artifact by D-54". **Reproduced exactly at HEAD this session, on both QB priors:** 12,527 rows,
  844 players.

| slice | rows | MAE after | MAE before | Δ before − after | Δ no-cap − before |
|---|---|---|---|---|---|
| pooled | 12527 | 41.36 | 25.11 | BEATS −16.25 [−18.03, −14.44] | BEATS −3.27 [−4.52, −2.01] |
| YE0 | 4944 | 37.58 | 28.15 | BEATS −9.43 [−11.30, −7.54] | BEATS −3.74 [−5.92, −1.62] |
| YE1 | 7583 | 43.82 | 23.13 | BEATS −20.69 [−23.04, −18.31] | BEATS −2.97 [−4.34, −1.58] |
| n 1–4 | 5916 | 39.77 | 29.28 | BEATS −10.49 [−12.03, −8.95] | BEATS −4.71 [−6.48, −2.97] |
| n 5–8 | 4480 | 42.04 | 22.64 | BEATS −19.41 [−21.57, −17.23] | BEATS −2.33 [−3.43, −1.19] |
| n 9–40 | 2131 | 44.33 | 18.74 | BEATS −25.59 [−28.34, −22.78] | BEATS −1.27 [−2.24, −0.26] |

**Reproducibility gate (measured):** `node bin/backtest.mjs --inseason --dynasty --json` at `b4472ad` reproduces
`backtests/2026-10-07-inseason-dyn-panel.json` and `-constants.json` exactly. The only differences are
`meta.generatedAt`/`runtimeMs` and the constants' `source`/`generatedAt`. A4 must keep that true for every key
except `q3`.

**Expected re-mirrored Q3, pooled (scratch prototype of §4.4 exactly):**
- rows 14994, realisedMovement 36.63, updateModelShare 23.1457, leftOnTable 13.8874 (share 0.3791), capturedShare
  0.3841, rankAgreement 0.5886, clampShareXn 0.2729.
- capOf35: rowShare 0.8355, **startBindShare 0.9473**, meanStartCutScore 41.36, shareOver35 0.5783, meanExcessXn
  22.3281, meanExcessY 35.3562.
- YE0 rows 7411 and YE1 rows 7583, both arm B.
- The 'own'/'pooled' predictor branches are **not reached** in the real run: all eight Q1 ladders pick `fixed`
  (`ladders.q1` in the 2026-10-07 panel). The self-check and those branches are therefore covered only by unit
  tests (§4.4 step 5).

---

## 4. Stage A — data repo (sonnet). Four commits, in this order

Start from `b4472ad`. Run `npm test` before you start; the baseline is 1431 tests, 4 skipped, 0 failures.

### 4.1 A1 — D-10 anchor (`data-catalog.md` only)

In `data-catalog.md:167`, replace `` `lib/nflverse.mjs:548` `` with
`` `parsePlayerIdsCsv` in `lib/nflverse.mjs` (`:573`) ``. Nothing else changes.

Commit: `D-10: data-catalog anchor — bySleeper.undrafted derivation is parsePlayerIdsCsv (lib/nflverse.mjs:573) (provenance-records-w2)`.

### 4.2 A2 — §A pin on the frozen crosswalk (prerequisite to A3; `scripts/panel-run.mjs`, tests, README)

1. `DEFAULT_LOAD` (`scripts/panel-run.mjs:77`) gains
   `loadRookiePinCrosswalk: () => readJson('test/fixtures/rookie-pin-crosswalk-2026-09-06.json')`, beside
   `loadRookiePinArtifact` (`:95`). Precedent for a script reading `test/fixtures/`: `scripts/absence-run.mjs:34`.
2. In `runRookiePanels` (`:1889-1890`), when `typeof load.loadRookiePinCrosswalk === 'function'`:
   - Add `export function pinCrosswalkMaps(fx) → { crosswalk, birthdateBySleeper, draftInfoBySleeper }`, moving
     the map-building loop from `test/panel-fit.test.mjs:2597-2609` into it verbatim. Test 1 then calls it, so the
     two never diverge.
   - Assemble a separate **pin-only** `legacyGated` with `assembleRookiePanel({ totalsByYear, ppgByYear, positionOf:
     (pid, y) => resolvePosition(pid, advstatsByYear[y], rosterByYear[y], pinCrosswalk), birthdateOf, draftInfoOf,
     fromYear: legacyFromYear, toYear: legacyToYear, minOutcomeGames: 6, rosterByYear })`.
   - Pass it to `checkReproductionPin`.

   Otherwise, pass the live `legacyGated` (today's behaviour, for injected test loads). Add
   `pin.crosswalk = 'frozen' | 'live'`. The live `legacyGated`/`legacyUngated` still feed §B, §E and the artifact,
   so **only the pin changes input.**
3. §A markdown (`:2083`): when `pin.crosswalk === 'frozen'`, append
   `` on the crosswalk frozen at `f27bc71` (`test/fixtures/rookie-pin-crosswalk-2026-09-06.json`); §B–§G read the live crosswalk. ``
4. Test, in `test/panel-fit.test.mjs` beside §6 test 1: `runRookiePanels()` on `DEFAULT_LOAD` returns
   `pin.pass === true` and `pin.crosswalk === 'frozen'`, and its `legacy.gated.coverage.assembled` is **not**
   asserted (it tracks the live crosswalk). Add a second test with a load lacking `loadRookiePinCrosswalk` (spread
   `DEFAULT_LOAD` and delete the key): `pin.crosswalk === 'live'`.
5. README → the D-8/D-9/D-12/D-13 section (`:2017`): one sentence saying §A pins on the frozen crosswalk, and why
   (`cde2d06`).

Commit: `rookie panels: §A reproduction pin reads the frozen crosswalk, as §6 test 1 does (cde2d06 drift; provenance-records-w2)`.

### 4.3 A3 — D-12 (`lib/panel.mjs`, `lib/rookieMirror.mjs`, `scripts/panel-run.mjs`, tests, README, artifacts)

1. **Walk rule** (`lib/panel.mjs:2036`). Replace
   `if (T - entryYear >= 2 && gamesOf(sleeperId, T - 1) === 0 && gamesOf(sleeperId, T - 2) === 0) break;` with
   `if (T - entryYear >= 2 && gamesOf(sleeperId, T) === 0 && gamesOf(sleeperId, T - 1) === 0) continue;`.
   - It stays after the `hasQualifying` stop and before the emit.
   - Rewrite the function's docstring (`:1999-2012`) and §2.2g's reading accordingly. It must say: skip the row,
     keep walking; window `{T, T−1}`; source the app fixture's `source.predicate`; absence counts as zero games, as
     before.
2. **Rung U** (`lib/panel.mjs:2194-2202`). Inside the `draftGroup !== 'unknown'` branch, after the four group
   bumps, add `bumpRung(`U|${position}|${cand.experienceBucket}`, …)` and `bumpRung(`U|${position}`, …)`.
   - The `else` (unknown-group) branch bumps **no** rung. Add a comment: "the app's U ladder is fitted over the
     four known groups (its fixture recipe skips rows with no group); none occur in the entry cohort today".
3. **Export the five mirrored tables** (`lib/rookieMirror.mjs:52,65,72,79,81`): change `const ROOKIE_GAMES_GPE`
   etc. to `export const`. CR-15 already lists "the five `ROOKIE_GAMES_*` tables". **Do not import
   `lib/rookieMirror.mjs` from `scripts/panel-run.mjs`**: T-RM1 forbids the fit path reaching the mirror.
4. **`scripts/panel-run.mjs`:**
   - Add `export const APP_ROOKIE_GAMES_SOURCE = 'app src/utils/seasonProjection.js ROOKIE_GAMES_* @ c318487 (values); n from src/__fixtures__/rookie-games-panel-2026-09-09.json (3,848 rows)'`.
   - Add `export const APP_ROOKIE_GAMES_CELLS = Object.freeze({ … })` with exactly the 74 entries in §4.3a, keyed
     like `byRungCell`.
   - Add `export function compareRookieGamesCells(byRungCell, appCells = APP_ROOKIE_GAMES_CELLS)`. It returns
     `{ cells: { [key]: { appValue, appN, n, mean, value, nDelta, valueMatch, wholeApp, whole, moved, missing } }, summary: { cells, nMismatch, valueMismatch, moved, missing } }`:
     - `value = Math.round(mean * 10) / 10`, `whole = Math.round(value)`, `wholeApp = Math.round(appValue)`,
       `moved = whole !== wholeApp`.
     - `nDelta = n − appN`; `valueMatch = value === appValue`.
     - A key absent from `byRungCell` gives `missing: true, moved: true, n: 0, nDelta: −appN, valueMatch: false`,
       and `mean`/`value`/`whole` are `null`. A missing cell counts only in `summary.missing` and `summary.moved`,
       never in `nMismatch`/`valueMismatch`.
     - Pure, no I/O.
   - `computeAvailabilityReconciliation` (`:2017`) takes `byRungCell` as a second argument and adds
     `ladder: compareRookieGamesCells(byRungCell)`. Call it with `rookiePathAll.coverage.byRungCell` (`:1906`).
     Keep `rung4Moved`, but label its §D table "(raw-mean rounding; superseded by the full-ladder table below)".
   - Rewrite the §D markdown (`:2133-2167`):
     - The first line becomes `` Assembled: N (invalidEntryYear excluded: M) against the app's 3848 (the app's
       recipe — `rookie-games-panel-2026-09-09.json` `source.predicate`: at years_exp ≥ 2 skip a row with zero
       games in the target season and the one before, and keep walking). ``
     - Keep the bucket table and the rung-4 table.
     - **Replace** the "computable for rung 4 alone …" paragraph with "**Full ladder** (all 74 app cells, rungs 1–4
       and U; app `c318487`): X cells differ in n, Y at one decimal, **Z move in whole games** (the app's rounding:
       one decimal, then `Math.round`)."
     - Follow it with a table of the non-matching cells only (`cell | app n | n | app value | value | whole app →
       whole | moved?`), and "Cells not listed match on n and one-decimal value."
     - If the summary is all-zero, print "All 74 cells match." and no table.
5. **Tests** (`test/panel-fit.test.mjs`):
   - §6 test 7: replace (b) and (c).
     - (b): entrant 2020, totals `2020: 0, 2021: 0, 2022: 0, 2023: 5` (present rows), with ppg maps to match
       (2023: `actualPPG 4, actualGames 5`). `toTarget 2024`. Expect target seasons `[2020, 2021, 2023, 2024]`.
       2022 is skipped (zero in 2022 and 2021), 2023 is emitted after the skip, and 2024 is emitted with 0 games
       because 2023 > 0. Neither ye0 nor ye1 is ever skipped.
     - (c): the same, but 2020–2022 and 2024 are **absent** from `totalsByYear`, so only 2023 is present. Expect the
       identical result.
     - (a) and (d) are unchanged. Rename the describe to drop "stops".
   - §6 test 15: p1/p2 are r1 QBs and p3 is unknown-group RB. Replace the `U|RB` assertions with:
     - `U|QB|0` n 2, mean 4, rounded 4.
     - `U|QB|1` n 2, mean 7.5 (p1 12, p2 3), rounded 8.
     - `U|QB|2+` n 1, mean 3.
     - `U|QB` n 5, mean 5.2.
     - `rc['U|RB'] === undefined` and `rc['U|RB|0'] === undefined` (an unknown-group row feeds no rung).
     - **Delete** the presence loop `for (const key of ['U|RB|0', 'U|RB']) assert.ok(...)` (`:3189-3191`); it
       fails under the new rule.
     - Update the hand-computation comment.
   - New `compareRookieGamesCells` test, synthetic:
     - `{a: {n:41, meanOutcomeGames: 11.49}}` against `{a: {value: 11.5, n: 41}}` gives value 11.5, valueMatch,
       not moved.
     - `{b: {n:468, meanOutcomeGames: 2.8504}}` against `{b: {value: 2.8, n: 469}}` gives nDelta −1, value 2.9,
       `valueMatch: false`, whole 3 against 3, not moved.
     - `{c: {n:469, meanOutcomeGames: 2.04}}` against `{c: {value: 4.2, n: 396}}` gives moved.
     - A fourth key `d` (app `{ value: 3.0, n: 50 }`) absent from `byRungCell` gives missing.
     - Expected summary: `{ cells: 4, nMismatch: 2, valueMismatch: 2, moved: 2, missing: 1 }`.
   - New test in `test/rookie-mirror.test.mjs` (test files may import both modules): every key of
     `APP_ROOKIE_GAMES_CELLS` maps to the same `value` in the exported mirror tables. Rung-1 keys map to
     `ROOKIE_GAMES_GPE[key]`, rung-2 to `GE`, rung-3 `g|p` to `GP[g][p]`, rung-4 to `G[g]`, `U|p|b` to `U[p][b]`
     and `U|p` to `U[p].pooled`. The key count is 74 and the rung-4 n sums to 3848.
6. **README** (`:2017` section): one paragraph covering the corrected walk rule, U over the four groups, the 74-cell
   comparison and its rounding rule, and the fact that the crosswalk drift shows as n differences.
7. **Run:** `node bin/panel.mjs --rookie --write`. It writes `backtests/<D>-rookie-panel.json` and
   `grading/<D>-rookie-verdict.md`, where `<D>` is the run's UTC date. **Gates (stop and report if any fails):**
   - §A **PASS**.
   - §D assembled **3848** with every bucket delta **0**.
   - Ladder summary `moved === 0` and `missing === 0`.
   - `nMismatch` 8, exactly: `undrafted|TE|0` 204→205, `undrafted|WR|0` 469→468, `undrafted|WR` 1006→1005,
     `undrafted|TE` 456→457, `U|WR|0` 874→873, `U|WR` 1579→1578, `U|TE|0` 397→398, `U|TE` 736→737.
     `valueMismatch` 1: `undrafted|WR|0` 2.8→2.9. Any other cell is drift; stop and report.
   - §G match at all four positions.
   - §B and §E identical to `grading/2026-09-12-rookie-verdict.md` except exactly these (all from `12079`; `13001`
     touches neither):
     - §B: Assembled 2563→2564, `played1to5` 467→468, row `undrafted|TE` 47/268 → 48/269, experience
       `negative` 8→9.
     - §E: population n 2563→2564; group `undrafted` 1240→1241 (mean games 4.126→4.125, mean pts 10.25→10.24,
       error −0.84%→−0.78%); cell `undrafted|TE` 268→269.
     - Not gated, expected: §C `undrafted|TE` 204→205 and `undrafted|WR` 469→468; §F "31 of 2564".
8. `npm test` and `npm run smoke` green.

Commit (code, tests, README and both artifacts together):
`D-12: rookie availability panel reproduces the app's ladder — skip-and-continue double-zero rule, U over all groups, 74-cell comparison (provenance-records-w2)`.

#### 4.3a `APP_ROOKIE_GAMES_CELLS`: the literal (values from app `c318487`, n from the app fixture)

```js
  // rung 1
  'r1|QB|0': { value: 11.5, n: 41 }, 'r1|WR|0': { value: 13.1, n: 54 },
  'day2|RB|0': { value: 12.3, n: 71 }, 'day2|TE|0': { value: 12.6, n: 61 }, 'day2|WR|0': { value: 13.5, n: 117 },
  'day3|QB|0': { value: 1.9, n: 77 }, 'day3|QB|1': { value: 2.2, n: 64 }, 'day3|QB|2+': { value: 2.0, n: 103 },
  'day3|RB|0': { value: 9.9, n: 204 }, 'day3|RB|1': { value: 3.5, n: 65 }, 'day3|RB|2+': { value: 4.0, n: 34 },
  'day3|TE|0': { value: 8.6, n: 117 }, 'day3|TE|1': { value: 5.8, n: 47 },
  'day3|WR|0': { value: 8.2, n: 234 }, 'day3|WR|1': { value: 4.7, n: 98 }, 'day3|WR|2+': { value: 3.8, n: 53 },
  'undrafted|QB|0': { value: 0.9, n: 73 }, 'undrafted|QB|1': { value: 0.7, n: 66 }, 'undrafted|QB|2+': { value: 2.8, n: 52 },
  'undrafted|RB|0': { value: 4.4, n: 290 }, 'undrafted|RB|1': { value: 2.6, n: 205 }, 'undrafted|RB|2+': { value: 4.9, n: 69 },
  'undrafted|TE|0': { value: 3.9, n: 204 }, 'undrafted|TE|1': { value: 3.8, n: 151 }, 'undrafted|TE|2+': { value: 4.7, n: 101 },
  'undrafted|WR|0': { value: 2.8, n: 469 }, 'undrafted|WR|1': { value: 2.3, n: 363 }, 'undrafted|WR|2+': { value: 4.1, n: 174 },
  // rung 2
  'r1|0': { value: 12.8, n: 127 }, 'day2|0': { value: 12.3, n: 276 }, 'day2|1': { value: 6.9, n: 44 }, 'day2|2+': { value: 4.0, n: 40 },
  'day3|0': { value: 8.0, n: 632 }, 'day3|1': { value: 4.0, n: 274 }, 'day3|2+': { value: 3.4, n: 213 },
  'undrafted|0': { value: 3.3, n: 1036 }, 'undrafted|1': { value: 2.5, n: 785 }, 'undrafted|2+': { value: 4.2, n: 396 },
  // rung 3
  'r1|QB': { value: 10.5, n: 57 }, 'r1|RB': { value: 13.8, n: 18 }, 'r1|WR': { value: 12.8, n: 61 }, 'r1|TE': { value: 14.6, n: 16 },
  'day2|QB': { value: 4.7, n: 65 }, 'day2|RB': { value: 10.8, n: 91 }, 'day2|WR': { value: 13.1, n: 127 }, 'day2|TE': { value: 11.5, n: 77 },
  'day3|QB': { value: 2.1, n: 244 }, 'day3|RB': { value: 7.9, n: 303 }, 'day3|WR': { value: 6.7, n: 385 }, 'day3|TE': { value: 7.7, n: 187 },
  'undrafted|QB': { value: 1.3, n: 191 }, 'undrafted|RB': { value: 3.8, n: 564 }, 'undrafted|WR': { value: 2.9, n: 1006 }, 'undrafted|TE': { value: 4.0, n: 456 },
  // rung 4
  'r1': { value: 12.2, n: 152 }, 'day2': { value: 10.7, n: 360 }, 'day3': { value: 6.2, n: 1119 }, 'undrafted': { value: 3.2, n: 2217 },
  // rung U (position x experience over all four groups; `U|<pos>` = pooled)
  'U|QB|0': { value: 3.9, n: 218 }, 'U|QB|1': { value: 2.3, n: 155 }, 'U|QB|2+': { value: 2.5, n: 184 }, 'U|QB': { value: 3.0, n: 557 },
  'U|RB|0': { value: 7.6, n: 582 }, 'U|RB|1': { value: 3.0, n: 282 }, 'U|RB|2+': { value: 4.5, n: 112 }, 'U|RB': { value: 5.9, n: 976 },
  'U|WR|0': { value: 6.3, n: 874 }, 'U|WR|1': { value: 3.0, n: 474 }, 'U|WR|2+': { value: 4.1, n: 231 }, 'U|WR': { value: 5.0, n: 1579 },
  'U|TE|0': { value: 7.0, n: 397 }, 'U|TE|1': { value: 4.5, n: 209 }, 'U|TE|2+': { value: 5.2, n: 130 }, 'U|TE': { value: 6.0, n: 736 },
```

Session 1 derived every n from the app fixture's rows. For rungs 1–3 they equal the app's own `// n=` comments
(`seasonProjection.js:94-145`) cell for cell. Rung 4 equals `docs/projection.md`'s 152/360/1119/2217, which sum to
3848. The rung-U n values have no app comment; the app states only "every cell n ≥ 112", which holds (minimum 112).

### 4.4 A4 — D-54 (`lib/inSeasonEvidence.mjs`, `scripts/inseason-dyn-run.mjs`, tests, README, artifacts)

1. **Mirror statements, comments only, no value change.**
   - (a) `lib/inSeasonEvidence.mjs:625`: replace "FROZEN mirror of app src/utils/dynastyScore.js as of app 4b5e8e1
     (read by Session 1 2026-09-27). CR-25." with: "Mirror of app src/utils/dynastyScore.js (POSITION_PRIOR_PPG,
     ageMultiplier, draftMultiplier, the 8:min(gp,12) blend, NO_MARKET_CAP); values re-verified unchanged at app
     c318487 (2026-10-10). Since app 8ab6a5e the cap bounds the STARTING value only — start = min(start, noMarketCap/100
     × max(peak, 1)) for a row with no KTC and no premium (round ≤ 2) pick — and the live evidence enters after it,
     uncapped; Q3 mirrors that (D-54). CR-25."
   - (c) `historyPriorOf`'s docstring (`:706-710`): append "L = S-2 is the app's SHORT-recent slot: historyRowOf
     (src/utils/inSeasonScoring.js) reads careerStats[dataSeason − 1], and in-season dataSeason = S − 1 (D-54)."
2. **Q3 re-mirror, (a)** (`scripts/inseason-dyn-run.mjs`):
   - Export `predictorFor` (for tests).
   - Add `export function capStartPPG(startPPG, peak)` returning
     `Math.min(startPPG, PROSPECT_MIRROR.noMarketCap / 100 * Math.max(peak, 1))`. `PROSPECT_MIRROR` is already
     imported.
   - `predictorFor` (`:486-499`) returns `(row, prior) => …`, which blends from the supplied `prior`:
     - `'fixed'`: `blend(prior, row.obsPPG, row.n, kFixedOf(row))`.
     - `'pooled'`: `blend(prior, row.obsPPG, row.n, foldKOf.get(row.S))`.
     - `'own'`: build `ownFoldKOf` from `res.own.folds` (`{ S, k }`; `analyzeKCell`'s held-out prediction is
       `blend(prior, obs, n, fold k)`, `lib/inSeasonEvidence.mjs:405-409`). Keep the existing `byKey` map of
       `res.own.heldOut` as a **self-check**: if `blend(row[spec.prior], row.obsPPG, row.n, ownFoldKOf.get(row.S))`
       differs from the held-out prediction by more than `1e-9`, throw
       `[inseason-dyn] Q3 own-rung fold-k reconstruction mismatch`. A row absent from `byKey` returns `null`, as
       today.
   - `buildQ3Items` (`:501-518`), per row:
     - `x0raw = row[spec.prior]`; `capped = row.draftTier !== 'premium'`.
     - `x0 = capped ? capStartPPG(x0raw, row.peak) : x0raw`.
     - `xn = predictors[pos](row, x0)`.
     - The item gains `x0raw` and `startCapBinds: capped && x0raw > PROSPECT_MIRROR.noMarketCap / 100 * Math.max(row.peak, 1)`.
       `x0` is now the capped start.
   - Export `q3Metrics`. Its `capOf35` block **keeps** `rowShare`, `shareOver35`, `meanExcessXn` and `meanExcessY`
     with their formulas unchanged; they now read the capped-start `xn`. It **adds** the following, and
     `EMPTY_Q3_METRICS.capOf35` gains both as `null`:
     - `startBindShare`: the mean of `startCapBinds` over cap rows.
     - `meanStartCutScore`: the mean over cap rows of `modelScore(x0raw, p) − modelScore(x0, p)`.
   - `q3Line` appends
     `start cap binds on ${pct(startBindShare)} of cap rows (mean cut ${f(meanStartCutScore, 1)} score points)`.
3. **Cap-placement comparison, (e).**
   - Add `export function capPlacementComparison(q1Rows)` (pure). Its population is `q1Rows` filtered to
     `draftTier !== 'premium'` with finite `peak`, `k2a`, `projPrior`, `obsPPG` and `nextPPG`. Count rows dropped for
     a non-finite `k2a` as `excludedNoK`; it is 0 today.
   - Target: `modelScore(nextPPG, peak)`.
   - Predictions per row:
     - `after = Math.min(modelScore(blend(projPrior, obsPPG, n, k2a), peak), 35)`.
     - `before = modelScore(blend(capStartPPG(projPrior, peak), obsPPG, n, k2a), peak)`.
     - `noCap = modelScore(blend(projPrior, obsPPG, n, k2a), peak)`.
   - Slices: `pooled`, `YE0`, `YE1`, `n1-4`, `n5-8` and `n9-40` (`DYN_DEFAULTS.nBands`).
   - Per slice: `{ rows, players, maeAfter, maeBefore, maeNoCap, beforeVsAfter: deltaOut(pairedDelta(rs, after, before)), noCapVsBefore: deltaOut(pairedDelta(rs, before, noCap)) }`,
     with the MAE values passed through `r4`.
   - Return `{ definition, rows, players, excludedNoK, slices }`, where `definition` is a one-line string
     restating the three formulas.
   - `runQ3` sets `out.capPlacement = capPlacementComparison(q1Rows)`.
4. **Verdict** (`buildInSeasonDynVerdictMarkdown`, §Q3 block `:1139-1145`). After the band lines, add
   `### Cap placement (D-54; app in-season-evidence-2c-wiring §1)`:
   - The definition line.
   - A six-row table: `slice | rows | MAE cap-after | MAE cap-before | Δ before − after | MAE no cap | Δ no-cap − before`.
     Δ cells render as `LABEL mean [lo, hi]` at 2 decimals; an empty slice or a null delta renders `—`.
   - Three caveat bullets:
     - Survivors only, which favours looser caps.
     - The cap population is an upper bound, because KTC is unknown historically.
     - Every row starts from arm B at the 2a k, as the wiring decision measured. Second-year WRs, which the app
       starts from arm A, are not measured separately.
   - "No cap at all also beats cap-before (§10.1 of the wiring file). Reported, not acted on."

   In Limitations (`:1158`), change "the cap of 35" to "the cap of 35 on the starting value".
5. **Tests** (`test/inseason-dyn.test.mjs`, new describe `19: D-54`):
   - `predictorFor` with synthetic `res` objects (`spec = SPEC_B`-shaped `{ prior: 'projPrior', obs: 'obsPPG' }`):
     - `'pooled'` (`refitPooled.folds = [{ S: 2020, k: 4 }]`): `(row, 7)` equals `blend(7, obs, n, 4)`, not the
       row's own prior.
     - `'own'` with `folds`/`heldOut`/`orderedRows` consistent: `(row, 7)` equals `blend(7, obs, n, foldK)`.
     - `'own'` with one `heldOut[i].pred` tampered by +1: throws `Q3 own-rung fold-k reconstruction mismatch`.
   - `capStartPPG(20, 40)` is 14, `(10, 40)` is 10, and `(5, 0.5)` is 0.35.
   - `q3Metrics` on two hand items:
     - Capped: `x0raw 20, x0 14, p 40, xn 16, y 18, draftTier 'none', startCapBinds true, n 4`.
     - Premium: `x0raw 30, x0 30, p 40, xn 31, y 28, draftTier 'premium', startCapBinds false, n 4`.
     - Expect `rowShare` 0.5, `startBindShare` 1 and `meanStartCutScore` 15 (50 − 35), with every other field
       hand-computed in the test's comment.
   - `capPlacementComparison` on a synthetic population of 30 players × 2 rows:
     - `draftTier 'none'`, `peak 20`, `projPrior 14` (above the 7.0 cap), `obsPPG 6`, `n 4`, `k2a 4`,
       `nextPPG 6`, ye split 0/1.
     - Plus 5 `premium` rows and 1 row with `k2a: null`.
     - Assert pooled rows 60, `excludedNoK` 1, premium excluded, and `beforeVsAfter.label === 'BEATS'` (the capped
       start is nearer the outcome). Assert the slice key set.
   - Extend test 12's CLI test only if its fixture yields a non-INSUFFICIENT Q1. Otherwise do not; the real run
     below is the gate.
6. **README** (`:2075` paragraph): one sentence covering Q3's capped start and the `capPlacement` block.
7. **Run:** `node bin/backtest.mjs --inseason --dynasty --write`. It writes `backtests/<D>-inseason-dyn-panel.json`,
   `-constants.json` and `grading/<D>-inseason-dyn-verdict.md`. **Gates (stop and report on any failure):**
   - With the comparison script in §4.4a against the 2026-10-07 pair: the constants are equal except
     `source`/`generatedAt`, and every panel key except `q3` is equal (`meta` minus `generatedAt`/`runtimeMs`).
   - `q3.capPlacement.slices` reproduce §3's table at 2 decimals as rendered by the verdict's `f(v, 2)` (labels, means, CIs and MAEs), with rows 12527
     and players 844.
   - `q3.pooled` equals §3's expected values.
   - `npm test` and `npm run smoke` green.

   The app keeps pinning the 2026-10-07 files. **No re-pin is owed**, because the constants are identical.

Commit (code, tests, README and the three artifacts together):
`D-54: Q3 caps the starting value (app 8ab6a5e), cap-placement comparison in --inseason --dynasty, mirror statements (a)(c) (provenance-records-w2)`.

#### 4.4a Comparison script (scratch, not committed)

```js
// node cmp.mjs backtests/<D>-inseason-dyn-panel.json backtests/<D>-inseason-dyn-constants.json
import fs from 'fs';
const [p, c] = process.argv.slice(2).map(f => JSON.parse(fs.readFileSync(f, 'utf8')));
const P0 = JSON.parse(fs.readFileSync('backtests/2026-10-07-inseason-dyn-panel.json', 'utf8'));
const C0 = JSON.parse(fs.readFileSync('backtests/2026-10-07-inseason-dyn-constants.json', 'utf8'));
const strip = (o) => JSON.parse(JSON.stringify(o, (k, v) => (['generatedAt', 'runtimeMs', 'source'].includes(k) ? undefined : v)));
const a = strip(c), b = strip(C0);
console.log('constants equal:', JSON.stringify(Object.keys(a).sort().map(k => [k, a[k]])) === JSON.stringify(Object.keys(b).sort().map(k => [k, b[k]])));
for (const k of new Set([...Object.keys(p), ...Object.keys(P0)])) if (k !== 'q3') console.log(k, JSON.stringify(strip(p[k])) === JSON.stringify(strip(P0[k])));
```


### 4.5 Hand-back (Stage A)

Report:
- The four SHAs.
- The run date `<D>`.
- Every file touched.
- Every deviation.
- What each new or changed test asserts.
- The A3 §D ladder summary and its non-matching cell table.
- The A4 comparison-script output.

---

## 5. Cross-repo impact

**No registry edit.** The mirrored span does not change in either repo, so there is no CR-24 red window.

- **CR-15** (A2, A3 touch `assembleRookiePanel`/`runRookiePanels`/`lib/rookieMirror.mjs`). Its Mirror says: "A
  change to any of the four app-side rookie mechanisms, or to their ordering, re-mirrors here; the mirror must never
  become reachable from the fit path, which `test/rookie-mirror.test.mjs`'s import-graph assertion enforces." → No
  app rookie mechanism changes. `scripts/panel-run.mjs` does not import the mirror; the new parity test lives in
  `test/**`, which T-RM1 excludes as an entry point. The five tables become exports under names CR-15's Data side
  already lists. No app action.
- **CR-25** (A4 touches `scripts/inseason-dyn-run.mjs` and comments in `lib/inSeasonEvidence.mjs`). Its Mirror
  says: "…The no-market cap's placement (starting value only) was chosen on the 2c Q1 cap rows (cap-before BEATS
  cap-after, pooled −16.3 score points): a change to the cap or its placement re-runs that comparison." → The
  comparison is now a committed harness output (`q3.capPlacement`), reproduced exactly. The constants are identical
  to the pinned 2026-10-07 file. No app action, no re-pin.
  - `capStartPPG` is the data mirror of the app's `NO_MARKET_CAP` placement, so it **is** contract surface, and
    `blend` (`lib/inSeasonEvidence.mjs:170`, the mirror of `posteriorOf`) is already unlisted. Both files are
    whole-file triggers, so nothing goes undetected and no edit is needed now. The list additions are filed as
    backlog D-69 (B5), not left as a pending note.
  - The phrase "its Q3 prospect path caps after evidence" appears only in the app task file
    `in-season-evidence-2c-wiring-registry.md` §E. It is not in the mirrored span (grepped in both copies), so no
    registry sentence goes stale when A4 lands.
- **CR-18** (A1 edits `data-catalog.md`; B2 edits `docs/signal-registry.md`). Its Mirror: "When a data-repo change
  adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or
  reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make …" →
  Neither edit changes a field, source, coverage or status; both refresh a line anchor. No action.
- **CR-11** (`lib/panel.mjs` is a whole-file data trigger; A3 edits it). Its Mirror: "Do not remove, rename or
  filter these keys. **The projection degrades silently to neutral when they are absent** …" → A3 touches no stat
  key read. No action.
- **CR-15 Data-side cache:** `enumerateEntryCohortRows`, and the app-value copies in `scripts/panel-run.mjs`
  (`APP_ROOKIE_GAMES_CELLS`, `APP_RUNG4_POOLED`, `APP_AVAILABILITY_RECONCILE`, `APP_ROOKIE_CEILING`), are
  unlisted. Both files are whole-file triggers and the new parity test reds on divergence, so no edit is needed now.
  Filed in D-69.
- **App line anchors (Stage B).** B3's `seasonProjection.js` edit is **line-count-neutral**. The registry anchors
  `seasonProjection.js:11, :824-825, :868`, and data `lib/rookieMirror.mjs` cites `:66-95` etc., so no anchor
  shifts. `docs/projection.md`, `docs/signal-registry.md` and the backlog carry no registry anchors (grepped).

---

## 6. Stage B — app repo

Specified in the companion `provenance-records-w2-app.md` (split for size). Five commits, B1–B5.

---

## 7. Verification (Session 1)

- Run implementation-reviewer on each stage's diff.
- Check A3's and A4's committed artifacts against the §4.3 and §4.4 gates **by re-running the comparisons**, not by
  reading the hand-back.
- After sign-off, commit this task file in the data repo with the verification record.

## Review record

**Plan gate, 2026-10-10 (plan-reviewer, 16 flags; it prototyped §4.2–§4.4 and reproduced every headline number).
All verified; all applied, with 14 and 15 filed rather than queued.**
- 1 (n 5–8 renders −19.41): confirmed (`-19.405` → `toFixed(2)`). §3 is corrected and the gate names the renderer.
- 2 (self-check unreached): confirmed; all eight Q1 ladders are `fixed`. §3 is reworded. `predictorFor` is
  exported, with three synthetic-`res` tests (pooled, own, tampered own).
- 3 and 4 (gate lists): the exact cells and the exact §B/§E diffs are now in §4.3 step 7.
- 5 (`compareRookieGamesCells` definitions): defined, with the expected synthetic summary.
- 6 (test 15 presence loop): marked for deletion.
- 7 (describe number): now `19`.
- 8 (empty slice): renders `—`.
- 9 (A2 as an exception): named in Route.
- 10 (backlog gate wording): fixed.
- 11 (B3 parenthetical): appended "since delivered".
- 12 (five `.5` cells): fixed.
- 13 (CR-11/CR-18 Mirror lines): added to §5.
- 14 and 15 (registry-cache gaps: CR-15 `enumerateEntryCohortRows` and the app-value copies; CR-25 `blend` and
  `capStartPPG`): no edit now, because whole-file triggers and the parity test cover them. Filed as **D-69** in
  B5, per W1's lesson that "pending" lists go unfiled. §5's claim that `capStartPPG` is not contract surface is
  withdrawn.
- 16 (duplication): `pinCrosswalkMaps` is shared by the CLI and test 1, and `rung4Moved` is labelled superseded.
- Size: 43.5 KB after the fixes, so Stage B moved to the companion `provenance-records-w2-app.md`.

## Verification record (Session 1, 2026-10-11)

**Stage A** (`b4472ad..589c0ca`). Session 1 re-ran every gate from the committed artifacts and did not rely on the
hand-back:
- `2026-10-10-inseason-dyn-*` against the 2026-10-07 pair: the constants are equal, and no non-`q3` panel key
  differs.
- The `capPlacement` table equals §3, including n 5–8 −19.41. `q3.pooled` equals §3.
- The rookie panel: §A PASS on the frozen crosswalk; 3848 rows with zero bucket deltas; ladder `{74, 8, 1, 0, 0}`
  with exactly the eight listed cells; §G matches.

implementation-reviewer found 5 low flags. Flags 1–4 are test-only and go to Fix pass 1. Flag 5 is recorded only:
the §E `undrafted|TE` cell row also moves mean games 5.29→5.28, mean pts 6.80→6.77, predicted 6.82→6.81 and error
0.3%→0.5%. That is the mechanical consequence of `12079`, not drift. The four declared deviations are accepted.

**Stage B** (app `c318487..c537d72`). implementation-reviewer found no blocking flags. The backlog bodies were
moved verbatim; nothing was lost or duplicated. One advisory is recorded and not actioned: the D-9 evidence line
cites `4534898`, while projection.md cites the 2026-09-12 verdict. Both carry the identical day3|QB row.

## Fix pass 1 (Stage A tests only; no `lib/`, `scripts/` behaviour or artifact change)

1. **`buildQ3Items` and the `fixed` predictor branch** (`test/inseason-dyn.test.mjs`, describe 19). These are the
   only Q3 paths the real run reaches.
   - In `scripts/inseason-dyn-run.mjs:519`, change `function buildQ3Items` to `export function buildQ3Items`. Change
     nothing else in that file.
   - Test `predictorFor fixed`: `res = { ladder: { id: 'fixed' } }`, `kFixedOf = r => r.k2a`, and
     `row = { obsPPG: 10, n: 4, k2a: 4 }`.
     - `pred(row, 14) === blend(14, 10, 4, 4)`, which is 12.
     - `pred(row, 14) !== blend(99, 10, 4, 4)`.
   - Test `buildQ3Items caps the start of a no-market row and exempts a premium row`:
     - `q1Rows`, two YE0 WR rows:
       - `{ sleeperId: 'a', S: 2020, W: 4, ye: 0, position: 'WR', peak: 40, projPrior: 20, obsPPG: 10, n: 4, k2a: 4, nextPPG: 18, draftTier: 'none' }`
       - the same with `sleeperId: 'b'`, `projPrior: 30`, `draftTier: 'premium'`.
     - `q1Decisions = { YE0: { arm: 'B' }, YE1: { arm: 'B' } }`.
     - `resultsByPos = { YE0: { WR: { ladder: { id: 'fixed' } } }, YE1: {} }`.
     - Expect 2 items:
       - a: `x0raw` 20, `x0` 14, `startCapBinds` true, `xn` 12.
       - b: `x0raw` 30, `x0` 30, `startCapBinds` false, `xn` 20 (`blend(30, 10, 4, 4)`).
2. **Mirror parity, reverse direction** (`test/rookie-mirror.test.mjs:782`). In the same test, count the mirror
   tables' leaves and assert the total equals 74:
   - `Object.keys(ROOKIE_GAMES_GPE).length`, which is 28;
   - `GE` keys, which is 10;
   - `GP` leaves over its four groups, which is 16;
   - `G` keys, which is 4;
   - `U` leaves including `pooled`, which is 16.
   Also assert that every mirror leaf's key (built with the APP key convention) is in `APP_ROOKIE_GAMES_CELLS`.
3. **`q3Metrics` hand computation** (`test/inseason-dyn.test.mjs:897`).
   - Add `assert.equal(m.updateUnderAnchor, 1.5)`, `assert.equal(m.clampShareY, 0)` and
     `assert.equal(m.peakClampExcess, 0)`.
   - Rewrite the captured-share comment to: "captured = 1 − mean(|dr − du|) / mDr = 1 − 6.25 / 7.5 = 1/6", and
     note that y (18, 28) is below p 40, so `clampShareY` and the peak excess are 0.
4. **Misplaced comment** (`test/panel-fit.test.mjs:3145-3147`). Move the "Fix pass 1 item 4 — coverage.byRungCell
   has no test anywhere…" comment block down so that it sits directly above the test-15 describe again. Leave the
   `compareRookieGamesCells` describe where it is.

**Done:**
- `npm test` is green, with 1441 + 2 tests: one new `predictorFor` test and one new `buildQ3Items` test.
- `npm run smoke` is green.
- One commit: `Fix pass 1: W2 Stage A tests — fixed predictor + buildQ3Items cap, reverse mirror parity, q3Metrics fields (provenance-records-w2)`.

**Fix pass 1 applied:** data `10ba2cc` (fix-applier). `npm test` 1443 (1439 pass, 4 skipped), smoke green.
implementation-reviewer was re-run once on `589c0ca..10ba2cc`. All four items are exact. All new tests go red on
the failure they target: cap removed, premium exemption removed, supplied prior ignored, extra mirror cell. One low
flag survives and goes to Anton: the reverse parity check asserts the GPE/GE/G counts but not GP (16) and U (16)
individually. Detection is unaffected (the total of 74 plus the per-key lookup); only the failure message is less
specific. Recommendation: leave it.

**Status:** Stage A data `e6c1122..10ba2cc` and Stage B app `c318487..c537d72` are verified and awaiting Anton's
sign-off. Push order: W1 (app, then data), then W2 data, then W2 app. Commit this task file and its `-app`
companion with the data push.
