# P3 Slice B — January grading run: D-52 ROS and games grades, D-16, D-75 (D-60 deferred)

**Review depth: full** — it grades shipped scoring rules (L6c, the in-season override, ROOKIE_TOTAL_FACTOR, the rookie ceiling) for decision input, and it adds parameters to two committed analysis adapters whose committed outputs must stay byte-identical.

**Session 1:** opus, data repo. Rev 0 was read against data `12c769b` / app `f7ebfa8`. Revisions 1–3 were re-read against data `bea5dd5` (Slice A merged) / app `f7ebfa8` (registry and in-season writers unchanged at app `06d432a`). **Session 2: sonnet**, effort high. **Starts only after Anton approves Revision 3.** Slice A is signed off at `bea5dd5`. Its facts (§1), trigger and G-SEASON (§2), K/P/S(i) (§5.1–5.3), CI method and `--rehearse` are A's and are not repeated here. Section numbers are kept from the pre-split plan.

**Goal.** Plug six steps into Slice A's `STEPS` registry: `ros`, `games-l6`, `override`, `rookie`, `d60` (which reports "not counted"; §8), plus `listed` (the §9 table, text only). Numbers only: no constant, no wiring recommendation.

## Revision 3 (2026-10-25)

This revision folds in Anton's answers to the Round-4 review: the step-local catch-all and six null guards (§10a); the start-row comparator amendment, dated and hashed (§6.1, §13a); and every mechanical flag and nit (§3, §5a, §6, §10–§12, §14, §16). There is no further plan-review round; Anton reviews it. The per-flag table and all earlier revisions are in `january-grading-run-reviews.md`. The rule text of §6–§9 and §13 is rev 0's except the Q1 decision (§8) and the 2026-10-25 amendment (§13a).

---

## 3. Touch list (Slice B)

| File | Change |
|---|---|
| `lib/seasonGrade.mjs` | pure, additive (§6–§7): `ROS_WEEK1_THURSDAY`, `ROS_CHECKPOINTS`, `rosCalendar`, `pickCheckpointCapture`, `buildRosRows`, `rosCheckpointReport`, `rosLabel`, `gamesL6Report`, `l6Label`, `d75Label`, `d16Label`, `ROS_MIN`/`L6_MIN`/`D75_MIN`. Imports only `lib/inSeasonEvidence.mjs` (as today); never `lib/rookieTotalPoints.mjs` or `lib/rookieMirror.mjs` |
| `scripts/season-grade-run.mjs` | append the six step functions and their `STEPS` entries after `vet-calibration`; add `DEFAULT_LOAD` keys (§5a); add `qbAsymptoteLoco` and `rookieTotalArms`. **Never edit A's steps, `decideHeadline`, `runSeasonGrade` or `formatVerdict`** |
| `scripts/panel-run.mjs` | `runRookiePanels({ …, entryToYear = ROOKIE_ENTRY_YEARS.toYear })`. `entryToYear` replaces the destructured constant in `maxYear` (:1940) and in the `debut` and `rookiePathAll` assemblies, and `meta.entryYears` becomes `{ fromYear, toYear: entryToYear }`. Default → byte-identical |
| `scripts/rookie-total-run.mjs` | `runRookieTotal({ …, evaluateTargetSeason = null })`; non-null adds `result.evaluate` (§7). Null → byte-identical (no `evaluate` key) |
| `bin/season-grade.mjs` | help text: B's step ids and artifacts |
| `scripts/fixtures/build-season-grade-inseason-fixture.mjs` **(new, one-off, committed)** | builds the trimmed `snap-2026-10-06.json` (§11); precedent `scripts/fixtures/build-rookie-pin-crosswalk.mjs` |
| `test/season-grade-b.test.mjs` **(new)**; `test/fixtures/season-grade/snap-2026-10-06.json` **(new, trimmed)**; `test/fixtures/season-grade/rookie-golden-pre-b.json` **(new)**; `test/helpers/rookie-basis-fixtures.mjs` **(new: `memLoad`, `leagueStub`, `row` hoisted unchanged from `test/rookie-basis-panels.test.mjs`)**; `test/rookie-basis-panels.test.mjs` (imports the helpers; byte-identity cases) | §11 |
| `scripts/fixtures/build-rookie-golden-pre-b.mjs` **(new, one-off, committed)** | generates `rookie-golden-pre-b.json` from the **pre-edit** adapters (§11) |
| `test/season-grade.test.mjs` | the one assertion at :315 becomes the ten ids in order: `season-gate`, `inventory`, `d44`, `vet-calibration`, `ros`, `games-l6`, `override`, `rookie`, `d60`, `listed`. Nothing else in A's tests changes |
| `README.md` | the "January season grade" section (:2286) gains B's steps, artifacts, the D-60 deferral and the `--only` dependency note |
| `data-catalog.md` | `grading/` row: the two unregistered rookie panels |
| `.claude/tasks/app-repo-backlog.md` | one new entry (§12 + §16). **Amend A's open entry** "January grading run (P3 slice A)": drop D-60 from its item (1) and add "D-60: see P3 Slice B §16 (post-rollover trigger)" |

Untouched: every committed artifact, every pinned constant, A's steps, `lib/vetReplay.mjs`, `scripts/games-short-run.mjs` (`inSeasonCheck` is called, not changed), `scripts/inseason-dyn-run.mjs`, `scripts/inseason-run.mjs`, `manifest.json`.

## 5a. Slice A seams B reuses (as built at `bea5dd5`)

- **Step contract:** `{ id, run(ctx) → Promise<{ section: { id, title, placement: 'top'|'main'|'appendix', md, data }, artifacts: [{ path, registered? }] }> }`. B's sections use `placement: 'main'`, so `formatVerdict` prints them after `vet-calibration` in registry order. `hardStop` is G-SEASON's alone; B never sets it.
- **`ctx`** (`makeContext`, :49-71) provides:
  - `ctx.load`, `ctx.rehearse`, `ctx.write` (already false under `--rehearse`), `ctx.runDate`, `ctx.log`;
  - `ctx.snapshot(date)` (LRU of 4) and `ctx.totals(year)` (memoised);
  - `ctx.inventory()`, lazy and available without `vet-calibration`: `{ entries[{ date, capturedAt, era, segment, index, sEligible, … }], kDate, kPrevDate, segments[{ id, first, last, n, captures }] }`;
  - `stampOf(ctx)` (module-private; B's steps live in the same file).
- **`ctx.shared`.** Before `vet-calibration` it already holds `inventory`, `leaguePos`, `roster` and `seasonGate` (:70, :116-117, :309). After a **successful** `vet-calibration` it gains (:590-601):
  - `K = { date, capture }`;
  - `P = { id → pos }` over every replay row (replayed, imputed and, under a G5 failure, dropped), K-style position, `'UNK'` possible;
  - `classification = { captureDate → segment id | 'pre-kickoff' | 'other' }`;
  - `S = { id → S(i) capture date }`, replayed rows only;
  - `replay = { R: { id → { p, G, T, imputed } }, K: { id → { p, G, T } } }`. Imputed rows carry K's captured p/G/T with `imputed: true`, **before ρ** (ρ lives only in `materializeRows`); dropped rows are absent from `R`. B never reads `replay.R` values as projections.

  B's dependency test is `ctx.shared.S !== undefined`, never a test on `ctx.shared` itself.
- **Helpers in the same file:** `makePositionOf(snapshot, ctx)`, `resolvePositionOf(sRef, ctx.load)`, `fmt`, `fmtCI`.
- **Reused from `lib/seasonGrade.mjs`:** `POSITIONS`, `BOOT` (4,000 / 12345), `bootCI`, `medianOf`. Paired differences use `bootstrapPairedMean(ids, diffs, BOOT)` (`lib/inSeasonEvidence.mjs`; player-clustered, as A §13). A's own labels are not reused; §13 has B's.
- **`DEFAULT_LOAD` additions** (additive keys; A's keys unchanged):
  - `rookiePanelLoad: () => PANEL_DEFAULT_LOAD`, with `import { DEFAULT_LOAD as PANEL_DEFAULT_LOAD } from './panel-run.mjs'`;
  - `rookieTotalLoad: () => ROOKIE_TOTAL_LOAD`;
  - `loadRookieLeagueConstants: () => readJson('backtests/2026-10-17-rookie-league-constants.json')`.

  Tests inject all three.
- **Import graph (T-RM1):** `scripts/season-grade-run.mjs` may reach `lib/rookieMirror.mjs` (it is not a fit entry point). No file in `FIT_ENTRY_POINTS`' closure may import it, and `lib/seasonGrade.mjs` stays mirror-free (§3).

## 6. D-52

### 6.1 ROS grade by checkpoint (`inSeason.ros`)

- **Calendar:** `T_c` = week c's Thursday = **2026-09-10 (a fixed literal, week 1's Thursday)** + 7(c−1) days. It is *not* derived from `KICKOFF_2026_UTC`: the opener was Wed 2026-09-09, Slice A §5.1. Week c **closes** at `T_c` + 5 days, 06:00 UTC (the Tuesday after Monday night).
- **Checkpoint c's capture:** the first capture with `capturedAt` in [close_c, `T_{c+1}` 23:00 UTC). Otherwise it is the first capture after close_c, flagged `late`.
- **Checkpoints:** c = 3…17. The first `inSeason` capture is 09-27, inside week 3. c = 1 and 2 are listed as `no-inSeason-capture`. Week 18 has no ROS.
- **Rows** with `inSeason.season === 2026`:
  - **(a) per-game rows** (no `start`): prediction `ros.value`. Realised = league points over the player's `'P'` weeks after his n-th `'P'` week (`n = inSeason.n`) ÷ the count of those weeks. Graded if ≥ `IN_SEASON_DEFAULTS.minRosGames` (4).
  - **(b) start rows** (QB `start` present): prediction `ros.value` per team game. Realised = league points over the team's last `start.remaining` scheduled games ÷ `start.remaining`; weeks not played count 0.
- **n-consistency check:** per capture, the share of rows whose n-th `'P'` week ≤ c+1 must be ≥ 99%. Below that, the checkpoint is `n-inconsistent` and excluded.
- **Weekly points:** `rescoreSeasonRowsLeague(2026, S.scoringSettings, positionOf).weeklyPoints` (D-71 → `exact`). Count `scaled` rows.
- **Metrics per checkpoint × position, (a) and (b) separately:**
  - MAE and bias of `value`.
  - Paired Δ|err| (value − comparator) via `bootstrapPairedMean`, against `ros.prior` and against observed-to-date PPG: (a) rows with `inSeason.n ≥ 1`; (b) start rows on the team-game basis, **every row, with `inSeason.n = 0` → comparator 0** *(amended 2026-10-25, §13a)*.
  - Caveat to print: on live-prior rows `ros.prior` is the current, leaky projection.
- **Empty cells:**
  - a cell with 0 graded players → `empty` (row printed) *(wording amended 2026-10-25: "cell size", not `inSeason.n`)*.
  - a cell with fewer graded players than the minimum → `insufficient` (numbers printed, no label).
  - The frozen/live split is reported only when both groups are non-empty. Otherwise it prints one line: "split degenerate: all rows priorSource live (notFrozenReason counts …)". This is the expected state for 2026.

**Seams.**
- **Calendar.** `ROS_WEEK1_THURSDAY = '2026-09-10'` and `ROS_CHECKPOINTS = [3…17]`. `rosCalendar() → [{ c, thursday, closeUtc, windowEndUtc }]` for c = 1…17, where `closeUtc = thursday + 5 d, 06:00:00Z` and `windowEndUtc = thursday(c+1), 23:00:00Z`.
- **Capture pick.** `pickCheckpointCapture(cal_c, entries) → { c, date|null, status }` runs over `ctx.inventory().entries` with `targetSeason === 2026`, ascending. Status is one of:
  - `ok` — inside the window;
  - `late` — the first capture after close_c;
  - `no-capture` — nothing after close_c;
  - `no-inSeason-capture` — c = 1, 2, fixed.

  A chosen capture with no `inSeason` row yields `empty` cells.
- **Weekly data.** Week w's status is `weeklyStatus[w − 1]`. Its points are `weeklyPoints[String(w)] ?? 0` from the rescored row. A player with no 2026 row has no `'P'` weeks: (a) is not graded, and (b) scores 0 points.
- **n-th `'P'` week:** n = 0 counts as consistent; a row with fewer than n `'P'` weeks counts as inconsistent.
- **Scoring and positions.**
  - "S.scoringSettings" is `sRef.scoringSettings`, with `sRef = ctx.snapshot(ctx.inventory().segments.at(-1).first)` (A's `sRef`, :373). S itself is a composite.
  - The rescore is `rescoreSeasonRowsLeague(ctx.totals(2026), sRef.scoringSettings, resolvePositionOf(sRef, ctx.load).positionOf)[id]`, and `scaled` means `weeklyPointsMethod === 'scaled'`. That count is taken over the non-`TEAM_*` rows of the rescored 2026 file and printed once per run.
  - A row's cell position is `makePositionOf(checkpointCapture, ctx)`. A null result is **UNK**: counted, not graded.
- **Start rows.** The team is the capture row's `nfl_team` through `SCHEDULE_TEAM_ALIAS` (`lib/sleeper.mjs:25`; captures say `LAR`, the schedule says `LA`). The **caller** (`stepRos`) applies the alias and passes the mapped code into `buildRosRows`; `lib/seasonGrade.mjs` does not import `lib/sleeper.mjs`. Its REG weeks come from `ctx.load.loadSchedule(2026)` (home or away), ascending, and the last `start.remaining` of them are used. Rows are excluded and counted when:
  - `nfl_team` is null → `no-team`;
  - the team has fewer scheduled games than `remaining` → `schedule-short`;
  - the schedule is null → `no-schedule`, and every (b) cell is `empty`.

  (b) cells are QB only.
- **Observed-to-date.**
  - (a): the league points over the first n `'P'` weeks ÷ n.
  - (b) (Q3, team-game basis): the player's league points over his team's scheduled REG weeks ≤ c, ÷ the count of those weeks. Weeks he did not play count 0. **No `inSeason.n ≥ 1` filter** (§13a): a row with `inSeason.n = 0` has comparator 0. Only a **team-week count** of 0 leaves the comparator undefined, excluding the row from that Δ only; this cannot happen for c ≥ 3.
- **`buildRosRows(capture, { rescored, schedule, positionOf, c }) → { perGame[], start[], nConsistency: { share, n }, counts: { unk, noTeam, scheduleShort, noSchedule, noRow } }`.** Each row is `{ id, pos, value, prior, observed, realised, nGames, frozen, priorSource, notFrozenReason }`.
- **`rosCheckpointReport(rows, { min = ROS_MIN }) → per pos { n, mae, bias, vsPrior: { mean, ci, label }, vsObserved: { … } }`.**
  - The frozen/live split keys on **`inSeason.frozen === true`**. The app writes `priorSource: 'snapshot:<dateKey>'` on frozen rows and `'live'` otherwise (app `src/utils/inSeasonScoring.js:205-216`). Otherwise the report returns the degenerate line with `notFrozenReason` counts.
  - `rosLabel(ci, cmp)` → `value-beats-<cmp>` | `no-difference` | `insufficient`.
  - `ROS_MIN = 30` distinct players.

### 6.2 L6 games check

- **Rows:** P's veterans, using S(i)'s `projectedGames`, `factors.projectedGamesBase` and `factors.shortSeasonState` (leak-free).
- **Grade:** vs 2026 `gamesPlayed`, by state (`short`/`none`/`qual`) and for rel3 (`rel3Of`, S = 2025, rank index built as in `games-cause-run.mjs`).
- **Metrics:** MAE, bias, and paired Δ|err| (L6c − base) with CI.
- Imputed players are excluded and counted.

**Seams.**
- **Rows.** The rows are `Object.keys(ctx.shared.P)`. A row with `ctx.shared.S[id]` reads `ctx.snapshot(ctx.shared.S[id]).players[id].projection`. Rows with no S(i) are excluded and counted by kind:
  - `imputed` — `ctx.shared.replay.R[id]?.imputed === true`;
  - `dropped` (Q2) — absent from `replay.R`; this happens only under a G5 failure, as veteran backup/chain QBs.
- **Fields.** `L6c = projectedGames`, `base = factors.projectedGamesBase`, `state = factors.shortSeasonState`. Realised = `ctx.totals(2026)[id]?.gamesPlayed ?? 0` (A §5.1's no-row-is-0 rule). The cells are by state and by rel3 only, with no position dimension, so UNK needs no handling here.
- **Missing fields (Flag 6).** Read with optional chaining (`proj?.factors?.…`). A row whose S(i) projection, or its `factors`, lacks `projectedGames`, `projectedGamesBase` or `shortSeasonState` is counted `missingField` and excluded, with no stop. Measured on 2026-10-22/23: 0 such rows.
- **rel3 (Flag 8).** `rel3Of({ id, S: 2025, position: crosswalkPositionOf[id] }, rankIndex, GAMES_CAL_DEFAULTS)`, where:
  - `rankIndex = buildRankIndex({ 2023, 2024, 2025: ctx.totals(y) }, crosswalkPositionOf, [2023, 2024, 2025], POSITIONS)`;
  - `crosswalkPositionOf` is the object built from `ctx.load.loadPlayerIds().ids` as at `games-cause-run.mjs:310-311`.

  A row with no crosswalk position is not rel3 and is counted `rel3NoPosition`.
- **`gamesL6Report(rows, { min = L6_MIN }) → { byState: { short, none, qual }, rel3, excluded: { imputed, dropped, missingField, rel3NoPosition } }`.** Each cell is `{ n, mae: { l6c, base }, bias: { l6c, base }, delta: { mean, ci, label } }`. `l6Label(ci)` follows §13; `L6_MIN = 20`.
- **Dependency.** If `ctx.shared.S` is undefined (`vet-calibration` did not run, or failed), the step **returns normally** with `data: { graded: false, reason: 'needs vet-calibration (ctx.shared.S absent)' }` and a one-line section. It does not throw (§10a).

### 6.3 In-season healthy override

`inSeasonCheck` (`scripts/games-short-run.mjs`, export unchanged), with rows `{ id, S: 2025, sState, star: rel3, p: { SOf0: projectedGames, C0: projectedGamesBase } }` and `store = { 2026: season-totals 2026 }`. Report the groups × checkpoints and `inSeasonRule` verbatim.

**Seams.**
- Rows are §6.2's graded rows: imputed, dropped (Q2) and `missingField` rows are excluded and counted.
- `sState = factors.shortSeasonState`; `star` = §6.2's rel3.
- The store is `{ 2026: ctx.totals(2026) }`, with the default `IN_SEASON_CHECKPOINTS` [1, 2, 4, 6, 8, 10, 12]. `noRow` is printed.
- The dependency behaviour is §6.2's: return normally with `graded: false`.

### 6.4 `inSeason.next` — recorded, not built

The `next` grade needs 2027 outcomes (≥ 2028-01). The artifact records the count of rows with a `next` block per position × checkpoint.

**Seams.** The counts are taken in the `override` step, on the checkpoint captures that `pickCheckpointCapture` re-picks, using §6.1's position source; `ros`'s output is not read. They need no `ctx.shared`, so they are reported even when `graded: false`.

## 7. D-16 and D-75

- **Panels:** `runRookiePanels({ basis, entryToYear: 2026 })` for `half_ppr` and `league`.
- **D-16** reports:
  - (i) 2026-class debut rows by position × draft group, with outcome classes;
  - (ii) `computeCeilingReconciliation` over classes 2013–2026 vs `APP_ROOKIE_CEILING` (half-PPR);
  - (iii) the QB asymptote leave-one-class-year-out range over 14 classes;
  - (iv) 2026-class QB debuts (gp ≥ 8) above 21.90 (half-PPR) and above 21.90 × `basisScaleOf(load, 2026, 'QB')` (league).
  - Label: `moved` iff the 2013–2026 asymptote is outside [20.50, 21.95]; else `within-fold-spread`.
- **D-75:** `runRookieTotal({ basis: 'league', panelPath, evaluateTargetSeason: 2026 })`, with the league panel injected via `loadLeaguePanel`.
  - Rows: `targetSeason === 2026`, groups `day3`/`undrafted`, positions RB/WR/TE.
  - **Both arms = `predTotal × factor`**, where `predTotal` is `composeRookieRow`'s legacy, pre-factor total at `basisScaleOf(load, 2026, pos)`. Shipped factor 0.796/0.835. League factor read from `backtests/2026-10-17-rookie-league-constants.json` `families.F4.constants.totalFactor`.
  - Bias: `Σpred ÷ Σreal` per group, with cluster-bootstrap CI.
  - Guard: paired Δ|error| (league − shipped) CI lower bound ≤ 0.
  - Label: `league-better-calibrated` iff `|ratio_L − 1| < |ratio_H − 1|` and the guard passes; else `shipped-stands`. Below 30 rows: `insufficient`.

**Seams — D-16.**
- With `panelLoad = ctx.load.rookiePanelLoad()`, the step runs `half = runRookiePanels({ load: panelLoad, basis: 'half_ppr', entryToYear: 2026 })` and `league = runRookiePanels({ load: panelLoad, basis: 'league', entryToYear: 2026 })`.
- (i) `half.debut.rows` with `entryYear === 2026`, counted by `position` × `draftGroup` × `outcomeClass`. The classes count games, so they are basis-free; league counts are printed only if they differ.
- (ii) `half.ceiling`: observed, `.expected`, delta and match per position.
- (iii) `qbAsymptoteLoco(half.debut.rows)` (in `scripts/season-grade-run.mjs`). For each class year y in 2013…2026 present in the rows:
  - take the QB rows with `outcomeGames >= 8 && outcomePPG != null && entryYear !== y`, sorted;
  - apply `quantile(…, 0.99)` (imported from `scripts/panel-run.mjs`);
  - round to 2 dp, as `computeCeilingReconciliation` does.

  It returns `{ folds: [{ y, asymptote, n }], min, max, classes }`. If `classes !== 14`, the step **prints** `classes = N (expected 14)` beside the range. Print-only (Flag 10).
- (iv) Two counts, never ids (aggregates only):
  - half: in `half.debut.rows`, 2026-class QBs with gp ≥ 8 and `outcomePPG > half.ceiling.expected.QB.asymptote`;
  - league: the same filter on `league.debut.rows`, against `expected.QB.asymptote × basisScaleOf(leagueBasisLoad(panelLoad, leagueLoadArgs(panelLoad)), 2026, 'QB')`. The scale is printed.
- `d16Label(asymptote)` → `moved` iff `asymptote < 20.50 || asymptote > 21.95`, else `within-fold-spread`. The input is `half.ceiling.observed.QB.asymptote`.
- **Artifacts (only when `ctx.write`):** `writeJsonStable('backtests/<runDate>-rookie-panel.json', half)` and `writeJsonStable('backtests/<runDate>-rookie-league-panel.json', league)`. The naming follows `writeRookieArtifacts`, `scripts/panel-run.mjs:2445-2448`. Both are unregistered (README §Analysis), listed in `artifacts`, and get no verdict md.

**Seams — D-75.**
- **Call.** `runRookieTotal({ load: { ...ctx.load.rookieTotalLoad(), loadLeaguePanel: () => league }, basis: 'league', panelPath: '<in-memory league rookie panel, runDate>', evaluateTargetSeason: 2026 })`. The panel is injected, nothing is read from disk, and `--rehearse` works.
- **`result.evaluate`.** A non-null `evaluateTargetSeason` adds `result.evaluate = { targetSeason, rows: [{ sleeperId, position, draftGroup, predTotal, predPPG, outcomeTotalPts, outcomeGames }] }`:
  - the rows are the composed rows with `targetSeason === evaluateTargetSeason`, in panel order;
  - `predTotal` is the already-composed `composeRookieRow(...).predTotal` (legacy, pre-factor, at `basisScaleOf(leagueLoad, 2026, pos)` via the existing league path);
  - the parity stop and every existing field are unchanged;
  - `evaluate.rows` stay in memory and are never written to an artifact.
- **`rookieTotalArms(rows, { shipped, league })`** (in `scripts/season-grade-run.mjs`, Flag 2) → per group `{ n, players, ratioH: { value, ci }, ratioL: { value, ci }, delta: { mean, ci }, label }`:
  - rows are filtered to `ROOKIE_TOTAL.decisionGroups` × `ROOKIE_TOTAL.decisionPositions`;
  - each ratio is `biasSummary` on rows with `predTotal` replaced by its arm;
  - Δ is `bootstrapPairedMean(sleeperIds, |armL − real| − |armH − real|, ROOKIE_TOTAL.bootstrap)`;
  - `label = d75Label({ n, ratioH, ratioL, deltaCi })`, a pure function in `lib/seasonGrade.mjs` with `D75_MIN = 30` rows per group.
- **Inputs.** `shipped = ROOKIE_TOTAL_FACTOR` (imported from `lib/rookieMirror.mjs`). `league = ctx.load.loadRookieLeagueConstants().families.F4.constants.totalFactor`. If that lacks `day3` or `undrafted`, the D-75 part prints `D-75 not computed — F4 totalFactor incomplete` and is counted (§10a).
- Measured 2026-10-24: all 234 `draftYear === 2026` crosswalk entries carry a birthdate, so `runRookieTotal`'s birthdate stop (:72) should not fire.

## 8. D-60 — recount only

- New export `countSatLongerFlagged({ load, seasonsTo = DYN_DEFAULTS.seasons.to, maxLoadSeason = IN_SEASON_DEFAULTS.maxLoadSeason })`.
- It threads both ceilings as parameters through `weekOneRoles`, `ppgFrom`, the Q5 checkpoint-row path, and the hard-coded `guardLoad(load, { maxLoadSeason: 2025 })` at `scripts/inseason-dyn-run.mjs:1068`, for the count path only.
- `obsBy` feeds only `obs`, so no k-fit assembly is needed. The stop condition below is not expected to fire.
- January calls it with `seasonsTo: 2025, maxLoadSeason: 2026` and reports `flaggedWithY1`.
- At ≥ 20 it reports "D-60 re-run owed" (a follow-up slice). The full re-run is not done in January.
- **Stop condition:** if the count needs anything beyond the Q5 path, stop and report. D-60 then leaves the January run; it is not blocking.

**Revision 2 — Anton's Q1 decision (b): the stop applies, and D-60 leaves the January run. This supersedes the five bullets above for Slice B.**
- **Why.** On 2027-01-15, `nfl/season-totals/2026.json` will still be `inProgress: true`:
  - `scripts/update-nfl.mjs:94` sets `inProgress = year >= currentSeason`, and Sleeper's season rolls over only after the Super Bowl (CR-01);
  - `guardLoad` refuses in-progress season-totals by design (`scripts/inseason-run.mjs:91-92`, citing CR-21).

  No bypass is added.
- **Nothing is built for the count.** No `countSatLongerFlagged`, and no edit to `scripts/inseason-dyn-run.mjs`.
- **`stepD60`** reads nothing and returns normally. It never throws. Its section prints the reason; its `data` is `{ counted: false, reason: "2026 season-totals still inProgress until Sleeper's post-Super-Bowl rollover; recount then" }`.
- **Deferred:** recount D-60 at the first season-totals run where 2026 is `inProgress: false` (§16).

## 9. Listed, not built

| Item | Does January produce its input? |
|---|---|
| D-79 `SHORT_SEASON_K` refit | Partly. The refit needs no 2026 data. §6.2 is its first out-of-sample season. |
| D-80 durability constants | No. It needs a data-rev comparison mode; §6.2 is a symptom check only. |
| D-85 healthy-cut override | Partly. §6.3 grades it on 2026 with post-D-76 `'D'`; the historical re-run is still owed. |

## 10. Orchestrator hooks (Slice B)

- Steps append in this order: `ros` (§6.1), `games-l6` (§6.2), `override` (§6.3, plus §6.4's `next` counts), `rookie` (§7), `d60` (§8), `listed` (§9). Verdict sections follow A's, in step order.

**Seams.**
- **Registry.** `STEPS` gains `{ id: 'ros', run: stepRos }`, `{ id: 'games-l6', run: stepGamesL6 }`, `{ id: 'override', run: stepOverride }`, `{ id: 'rookie', run: stepRookie }`, `{ id: 'd60', run: stepD60 }` and `{ id: 'listed', run: stepListed }`, after `vet-calibration`. `--only` accepts these ids; `season-gate` still runs first.
- **Reads.** `ros`, `rookie`, `d60` and `listed` need only `ctx.load`, `ctx.inventory()`, `ctx.snapshot()` and `ctx.totals()`. `games-l6` and `override` also need `ctx.shared.P`, `.S` and `.replay`. No B step reads `ctx.shared.K` or `.classification`.
- **Aggregates.** Each step's `section.data` lands in `backtests/<runDate>-season-grade.json` as `steps[i].data`, with `steps[i].id` = the step id (A's layout, :641). It holds aggregates only.
- **Artifacts.** The league panel is named `backtests/<runDate>-rookie-league-panel.json`. Both panels are written by `stepRookie` itself when `ctx.write`. As with A's `d44`, they are written even if another step fails.
- **Rehearsal.** Each B section starts with `**${stampOf(ctx)}**` when rehearsing.
- **`stepListed`** prints §9's table verbatim; its `data` is `{ items: ['D-79', 'D-80', 'D-85'] }`.

### 10a. No-throw rule (Anton, Revisions 2–3)

**Nothing in Slice B may throw in a way that blocks Slice A's aggregate write** (`scripts/season-grade-run.mjs:643`, `if (write && !rehearse && !failed)`). Every new check prints and counts.

- **Step-local catch-all.** Each B step function wraps its whole body in `try { … } catch (e) { return degradeOrThrow(ctx, stepId, e) }`.
  - `degradeOrThrow` is a module-private helper in `scripts/season-grade-run.mjs`.
  - **If `ctx.write === true && ctx.rehearse !== true`** (the real January `--write` run; the same condition as A's own write at :643, `write && !rehearse`, stated explicitly even though `ctx.write` is already false under `--rehearse`), it returns `{ section: { id, title, placement: 'main', md: '**⚠ NOT COMPUTED — <stepId>: <e.message>**' + stamp, data: { computed: false, error: e.message } }, artifacts: [] }`. The banner is the section's first line, and `computed:false` lands in `steps[i].data` of `season-grade.json`.
  - **Otherwise** (`--rehearse` with or without `--write`, a plain run, every test), it **re-throws** `e`. A's per-step isolation then fails the step, so the exit is non-zero and the bug surfaces now, not in January.
  - **Part level:** the same helper wraps each part inside `rookie` (D-16 half, D-16 league, D-75) and each `writeJsonStable`, so one failed part does not hide the others in January.
- **`computed: false` is reserved for caught errors.** Designed statuses are not errors and never fail a rehearsal: `empty`, `insufficient`, `no-capture`, `late`, `n-inconsistent`, the exclusion counts, `graded: false` for a missing `vet-calibration` dependency, and D-60's `counted: false`.
- **The six null guards** give designed messages; each states its message:
  1. `bootstrapPairedMean(…)` returning `null`, i.e. no finite diffs (`lib/inSeasonEvidence.mjs:335`), gives `{ mean: null, ci: null, label: 'insufficient' }` in `rosCheckpointReport`, `gamesL6Report` and `rookieTotalArms`. A group with 0 rows gives `n: 0, label: 'insufficient'`, with no `biasSummary` call.
  2. `panelLoad = ctx.load.rookiePanelLoad()` sits **inside** the D-16 half part's try.
  3. Each `writeJsonStable` (both rookie panels) sits inside its own part-level try. It degrades as an artifact error when `ctx.write`, and never runs otherwise.
  4. `loadRookieLeagueConstants()` returning null raises `Error('league constants file missing: backtests/2026-10-17-rookie-league-constants.json')`. Missing `families?.F4?.constants?.totalFactor?.day3` or `undrafted` raises `Error('F4 totalFactor incomplete')`. Both go through the part-level helper.
  5. `ctx.inventory().segments.at(-1)?.first == null` raises `Error('no capture in the last veteran segment')` inside `ros`, through the helper.
  6. §6.2 reads the projection with optional chaining, so a missing `factors` counts as `missingField` (§6.2).
- **Tests** (§11): each of guards 1–6; `degradeOrThrow` returning `computed:false` with `ctx.write = true` and re-throwing with `ctx.write = false`; and `runSeasonGrade({ rehearse: true, … })` with a B step forced to throw gives `exitCode` 1.

## 11. Tests (Slice B; Invariant 10 as in Slice A)

- **`test/season-grade-b.test.mjs`** on fixtures:
  - the calendar (close times, the `late` flag, `no-inSeason-capture` for c = 1, 2);
  - the n-split and the n-consistency flag;
  - start-row team-game realisation;
  - `empty` / `insufficient`;
  - the degenerate frozen split line;
  - L6 cells and rel3;
  - the `inSeasonCheck` row shape;
  - the D-75 arms (`predTotal × factor`, the league factor read from the constants file) and its label rule;
  - the D-16 label rule.
- **Byte-identity, on memLoad fixtures** (the `test/rookie-basis-panels.test.mjs` precedent):
  - `runRookiePanels` default ≡ explicit `entryToYear: 2025`;
  - `runRookieTotal` with `evaluateTargetSeason: null` ≡ omitted;

**Seams — fixtures and placement.**
- **Synthetic, built in `test/season-grade-b.test.mjs`.** No fixture here reads `nfl/`, `nflverse/`, `ktc/` or `snapshots/`.
  - A 2026 season-totals object: non-`TEAM_*` rows with `weeklyStatus`, `weeklyStats`, `weeklyPoints`, `stats`, `fantasyPoints` and `gamesPlayed`. One row's weekly sums miss, so it scores `scaled`.
  - A schedule with an `LA` team, a bye, and a team short of games.
  - In-memory captures with `inSeason` blocks: per-game rows at chosen `n`; start rows with `remaining`, one with `nfl_team: null`; `next` blocks; `frozen: false, priorSource: 'live'` everywhere, plus one variant with a group at `frozen: true, priorSource: 'snapshot:2026-09-09'` (Flag 7).
  - A `ctx` from `makeContext({ load })` with a stub load.
- **New trimmed fixture** `test/fixtures/season-grade/snap-2026-10-06.json`, built and committed by `scripts/fixtures/build-season-grade-inseason-fixture.mjs`:
  - a completed dated capture: c = 4's `ok` capture, not the newest;
  - about 40 players, `inSeason` blocks kept, at least 5 `start` rows.

  It pins the real field names; `buildRosRows` must read it with no `undefined` field.
- **A's fixture reused.** `snap-2026-10-22.json` (L5 veterans carry `projectedGamesBase`/`shortSeasonState`) drives the §6.2 field read. It runs with a stub `ctx.shared`: `P`; `S` → `'2026-10-22'`; `replay.R` with one imputed id and one id absent, i.e. dropped.
- **Assertions:**
  - `rosCalendar()[2]` (c = 3) closes at `2026-09-29T06:00:00Z`, with its window ending at `2026-10-01T23:00:00Z`.
  - `rosCalendar()[0].thursday === '2026-09-10'` (the literal, not kickoff-derived).
  - (b)'s observed-to-date uses team weeks ≤ c, with unplayed weeks counted as 0 (Q3).
  - `no-team`, `schedule-short` and `no-schedule` are counted separately.
  - The frozen split appears only with both groups present, keyed on `frozen`.
  - rel3 uses the crosswalk position: a row whose P position differs from its crosswalk position takes the crosswalk top-N.
  - `missingField` rows are counted and excluded; the step still returns.
  - Imputed, dropped and missingField exclusions are counted separately in `games-l6` and `override`.
  - `runSeasonGrade({ only: ['games-l6'], rehearse: true, load })` gives `games-l6` `graded: false` and `exitCode` 0 (Flag 12).
  - `stepD60` returns `{ counted: false, reason }` and its `exitCode` contribution is 0.
  - §10a: guards 1–6; `degradeOrThrow` with `ctx.write` true and `ctx.rehearse` false (degrade), `ctx.write` false (re-throw), and `ctx.write` true with `ctx.rehearse` true (re-throw); a rehearse run with a forced B throw gives `exitCode` 1; **`--write --rehearse` with a forced B throw gives `exitCode` 1** (approved fix, 2026-10-25).
  - (b) start rows with `inSeason.n = 0` enter the observed-to-date Δ with comparator 0 (§13a); (a) rows with `n = 0` do not.
  - `STEPS` ids equal the ten in order (the updated `test/season-grade.test.mjs:315`).
  - A `--rehearse` run of a stubbed `rookie` step writes nothing.
  - `steps[].data` carries B's aggregates under the step ids.
  - `qbAsymptoteLoco` on a synthetic 3-class set gives hand-computed folds, and `classes ≠ 14` prints rather than throws.
  - Labels at their boundaries: D-16 at 20.49 / 20.50 / 21.95 / 21.96; D-75 with `ratio_L` closer and guard pass / guard fail / fewer than 30 rows; L6 at CI upper < 0 / lower > 0 / straddling; ROS at CI upper < 0 / ≥ 0.
- **Byte-identity (Flag 4: against a golden captured before the edit).**
  - **Golden.** Before editing either adapter, Session 2 makes two commits. The first hoists `memLoad`, `leagueStub` and `row` from `test/rookie-basis-panels.test.mjs` into `test/helpers/rookie-basis-fixtures.mjs`, unchanged, with `npm test` green. The second runs `node scripts/fixtures/build-rookie-golden-pre-b.mjs`, which imports those helpers and the **unedited** adapters, and commits `test/fixtures/season-grade/rookie-golden-pre-b.json`. It holds the outputs of `runRookiePanels({ load: memLoad() })`, `runRookiePanels({ load: memLoad(), basis: 'league' })` and `runRookieTotal({ load: leagueStub(rows), basis: 'league', panelPath: 'p.json' })` at the pre-edit commit, with `generatedAt` stripped. The hand-back names the golden commit, and it must predate every adapter edit.
  - **Golden test.** After the edit, the same calls (default arguments) and the explicit `entryToYear: 2025` / `evaluateTargetSeason: null` calls must all `deepStrictEqual` the golden.
  - **Growth (Flag 5).** On a local memLoad variant adding a 2026 season and a 2026 entrant, `entryToYear: 2026` adds that entrant's debut and rookiePathAll rows, and sets `meta.entryYears.toYear` to 2026.
  - **Evaluate rows.** On a stub panel including target-2026 rows, `evaluateTargetSeason: 2026` returns exactly those rows, with `predTotal` equal to the composed row's.

## 12. Cross-repo (Slice B)

- **New couplings, none indexed today.** The registry has no entry for these fields (CR-01 is envelope-only; CR-15's Data sites are `lib/projectionFactors.mjs`/`lib/panel.mjs`).
  - **§6.1** reads the per-player `inSeason` block of app-written snapshots: `season`, `n`, `frozen`, `priorSource`, `notFrozenReason`, `ros.value`, `ros.prior`, `start.remaining`, `next`. Writer: app `src/utils/inSeasonScoring.js` (`buildScoringPosteriors`, :184), attached in `src/utils/projectionSnapshot.js` (:163-164).
  - **§6.2/§6.3** read the **values** of `projectedGames`, `factors.projectedGamesBase` and `factors.shortSeasonState`. Writer: app `src/utils/seasonProjection.js` (`computeNextSeasonProjection`). Slice A reads `shortSeasonState` only for presence, as a detector, and left that read unindexed too.
- **Backlog entry.** Session 2 adds one `.claude/tasks/app-repo-backlog.md` entry (blocking: no; land after the data commit) proposing **CR-01** as the single registry entry:
  - Invariant += the per-player `inSeason` fields above, plus the values of `projectedGames`, `factors.projectedGamesBase` and `factors.shortSeasonState`;
  - App += `src/utils/inSeasonScoring.js` (`buildScoringPosteriors`). CR-15 already lists `src/utils/seasonProjection.js`;
  - Data += `lib/seasonGrade.mjs` (`buildRosRows`) and `scripts/season-grade-run.mjs` (`stepGamesL6`, the actual reading site of the three projection fields).

  This also closes A's unindexed presence-read. The entry is flagged in the hand-back, and no app file is edited.
- No other coupling changes: `inSeasonCheck`, `runRookiePanels` and `runRookieTotal` are data-internal analysis adapters.

## 13. Pre-registration (Slice B; frozen at this commit)

| Item | Rule |
|---|---|
| CI | as Slice A §13 |
| Minimum sample | ROS ≥ 30 players per cell; L6 state ≥ 20; D-75 ≥ 30 rows; below → `insufficient` (numbers printed, no label) |
| ROS | `value-beats-<cmp>` iff Δ\|err\| CI upper < 0 |
| L6 | `l6c-beats-base` iff CI upper < 0; `base-beats-l6c` iff CI lower > 0; else `no-difference` |
| D-16 / D-75 / D-60 | §7 / §7 / §8 |
| Amendments | 2026-10-25 (§13a) |
| Never output | a constant, a multiplier, or a recommendation to wire |

### 13a. Pre-registration amendment, 2026-10-25 (Anton)

- **What.** For (b) start rows on the team-game basis, the observed-to-date comparator applies to every row: `inSeason.n = 0` → comparator 0. It is no longer limited to `n ≥ 1`. Wording only: the cell-size "n" in the empty/insufficient rule is renamed, to stop it being confused with `inSeason.n`.
- **Why.** Under the Q3 team-game basis the comparator is defined at `n = 0`. The `n ≥ 1` filter would drop most start rows (52 of 76 on 2026-10-06; 45 of 78 on 2026-10-20) and push the QB (b) cells below `ROS_MIN`. **Decided on row counts only; no 2026 outcome or graded result was seen.**
- **Hash.** SHA-256 over the pre-registration text: the §6.1 rule block (from `- **Calendar:**` to the line before `**Seams.**`), then `\n`, then the `|` lines of §13, UTF-8.
  - before (Revision 2, `c9e2de0`): `9bff0187dd1338eead10bc6ef7c1f5407c651cc6636708b8639b435cdf9d6378`
  - after (Revision 3): `1d8d69632ad7ed19f48823e680603ea9c7255ded60003c4712111d5973d4adde`

## 14. Done-definition and hand-back (Slice B)

1. `npm test` and `npm run smoke` green.
2. `node bin/season-grade.mjs --rehearse` runs all steps on today's partial data; paste B's sections.
3. README updated.
4. Commit; push only after Anton's sign-off.
5. Hand-back: SHA range, files touched, deviations, what each test asserts, and the golden-capture commit (it must predate the adapter edits).

**Revision 2 notes.**
- **Item 1.** `test/registry.test.mjs` fails in a worktree only because it looks for the sibling repo at `.claude/worktrees/sleeper-dashboard`. Report it as that and nothing else.
- **Item 2.** A's sections must still reproduce M1–M10 and every gate result unchanged. The rehearsal `exitCode` must be 0; any B error now fails it (§10a). `ros` shows `no-capture` for c ≥ 7 today, and `d60` prints `counted: false`.
- **Item 3** also covers the `data-catalog.md` row, the `bin/season-grade.mjs` help, the new app-repo-backlog entry, and the amendment to A's open entry (§12, §16).
- **Item 4.** Do not push or merge without Anton's sign-off.

Flags from both review rounds that land in B: 1-9 (§6.1), 1-14 (§7), 1-16 (§8, now deferred). The full map is in `january-grading-run-reviews.md`.

## 15. Questions for Anton

None open. Q1–Q3 were answered on 2026-10-24, and the Revision 2 review on 2026-10-25 (Revision 3).

## 16. App-side edits for a later parent-folder session (not made here)

1. **D-60.** In app `.claude/tasks/data-repo-backlog.md`, under `### D-60 · Replicate Q5 on the app's sat-longer definition`, set its trigger to:

   > recount at the first `nfl/season-totals` run where `nfl/season-totals/2026.json` is `inProgress: false` (after Sleeper's post-Super-Bowl rollover). The January run (P3 Slice B) deliberately does not count it: the in-progress guard refuses 2026 (Anton, 2026-10-24). Recipe: the existing `--inseason --dynasty` path cannot reach the 2025 class's S+1 until `guardLoad(load, { maxLoadSeason: 2025 })` (`scripts/inseason-dyn-run.mjs:1068`) and `DYN_DEFAULTS.seasons.to` (2024, `lib/inSeasonEvidence.mjs:631`) are lifted by a planned slice; re-run only at ≥ 20 flagged-with-S+1 players.

   This **replaces** D-60's part of the open data-side entry "January grading run (P3 slice A)", which Session 2 amends (§3), so the two cannot be applied in the wrong order. D-60's only backlog entry is app-side; this repo has none. Cite this task file.
2. **The §12 CR-01 edit.**
3. Session 2's one new `.claude/tasks/app-repo-backlog.md` entry carries 1 and 2. It is flagged in the hand-back.


## Fix pass 1

Session 1 triage (2026-10-25) of the full-depth implementation review of `6c2931b..950face`. The fix-applier implements exactly this section on branch `claude/p3-slice-b-build-7301cb`, commits there and **does not push**.

**Change:**
1. **§13a comparator, should-fix.** `lib/seasonGrade.mjs` `buildRosRows`, (b) start rows. When `inSeason.n === 0`, set `observed = 0` exactly, as the frozen §6.1/§13a text says. Otherwise keep the team-week formula. The team-week-count-0 exclusion is unchanged. Update the test in `test/season-grade-b.test.mjs` (≈:160): the q1 row with `ins(0, …)` must give `observed === 0`, even though it has league points in weeks ≤ c, and its title no longer says "0-or-more". Add a case: an `n ≥ 1` start row keeps the team-week value.
2. **D-16 (i) league counts, should-fix.** `scripts/season-grade-run.mjs` `stepRookie`. Compute the league panel's 2026-class debut counts with the same `position` × `draftGroup` × `outcomeClass` grouping as the half part.
   - If every cell equals half's, print one line: "league class counts identical to half-PPR".
   - Otherwise print the league table, plus a line listing the differing cells.
   - Record `data.d16League.classCountsDiffer` (boolean) and the counts.

   Test: identical counts → the one line; a differing stub → the table and `classCountsDiffer: true`.
3. **Nit, test honesty.** In the `rookieTotalArms` null-guard test, add a group whose diffs are all non-finite and assert `delta.mean === null && delta.ci === null && label === 'insufficient'`, or retitle the test to what it asserts. In the `gamesL6Report` guard-1 case, assert `delta.mean === null` and `delta.ci === null`.
4. **Nit, non-Error throws.** In `degradeOrThrow` and `part`, read the message as `e instanceof Error ? e.message : String(e)`. Test: `throw undefined` degrades on a real write, with `error: 'undefined'`.
5. **Nit, alias default.** `buildRosRows`'s `teamOf` option becomes **required**: no default; a missing `teamOf` is a programming error, so a plain `TypeError` is fine. Update its doc comment. `stepRos` already passes it.
6. **Nit, cross-repo.** In `.claude/tasks/app-repo-backlog.md`, P3 slice B entry, item (2), add the actual reading sites: `scripts/season-grade-run.mjs` `stepOverride` (`next`) and `l6RowsOf` (the three projection fields), next to `buildRosRows`/`stepGamesL6`.

**Leave alone:**
- The byte-identity cases living in `test/season-grade-b.test.mjs` instead of `test/rookie-basis-panels.test.mjs` (review nit 3): accepted as built, recorded here.
- Session 2's disclosed deviations 1–6: accepted.
- Everything else in the diff.

**Done:**
- `npm test` green; the 2 `registry.test` failures from the missing sibling are expected, so state them.
- `node bin/season-grade.mjs --rehearse` exits 0, with no `NOT COMPUTED`; A's sections are unchanged.
- One commit on the branch; no push.

## Fix pass 2

Anton, 2026-10-25, at Slice B sign-off. The re-review nit: when the half-PPR part fails, the D-16 league comparison flag claims a difference that was never measured. No review round follows this pass.

**Change** (`scripts/season-grade-run.mjs` `stepRookie`, the D-16 league part, ~:926 `const differ = hc ? diffs.length > 0 : true`):
- When the half part failed (no half counts), set `data.d16League.classCountsDiffer = 'not compared'` (the literal string) instead of `true`.
- Print `(i, league) not compared — half-PPR part failed` and then the league table, with no "Differing cells" line.
- With half counts present, behaviour is unchanged (`true` or `false`).
- **Test** (`test/season-grade-b.test.mjs`): a stub whose half `runRookiePanels` throws while the league call succeeds, run with `ctx.write === true` so the half part degrades. Assert `classCountsDiffer === 'not compared'`, that the "not compared" line and the league table are printed, and that no "Differing cells" line appears.

**Leave alone:** everything else.

**Done:** `npm test` green (the 2 `registry.test` failures from the missing sibling are expected); one commit; no push.
