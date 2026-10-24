# P3 Slice B — January grading run: D-52 ROS and games grades, D-16, D-75, D-60 recount

**Review depth: full** — it grades shipped scoring rules (L6c, the in-season override, ROOKIE_TOTAL_FACTOR, the rookie ceiling) for decision input, and it adds parameters to three committed analysis adapters whose committed outputs must stay byte-identical.

**Session 1:** opus, data repo, read against data `12c769b` / app `f7ebfa8`; **Revision 1** re-read against data `bea5dd5` (Slice A merged) / app `f7ebfa8`. **Session 2: sonnet**, effort high. **Starts only after Anton approves Revision 1** (Slice A is signed off at `bea5dd5`). Its facts (§1), trigger and G-SEASON (§2), K/P/S(i) (§5.1–5.3), CI method and `--rehearse` are A's and are not repeated here. Section numbers are kept from the pre-split plan.

**Goal.** Plug six steps into Slice A's `STEPS` registry: `ros`, `games-l6`, `override`, `rookie`, `d60`, plus `listed` (the §9 table, text only). Numbers only: no constant, no wiring recommendation.

## Revision 1 (2026-10-24, Session 1) — fitted to Slice A as built

Rules unchanged: §6–§9's grading definitions, §13 and every label rule are verbatim from rev 0. Everything new is under a **Seams (Rev 1)** heading or in §3, §5a, §10–§12, §14–§15.

| # | Change | Why |
|---|---|---|
| R1-1 | New §5a: the A seams B reuses, with their real names (`ctx.shared.*`, `ctx.inventory()`, `ctx.snapshot()`, `ctx.totals()`, `stampOf`, `makePositionOf`, section `placement`) | rev 0 named A's ctx loosely ("K, P, S(i), classification, loads") |
| R1-2 | §10: aggregates land in `season-grade.json` as `steps[].data` keyed by step id, not under top-level keys `ros`, `gamesL6`, … | A's runner writes `{ runDate, rehearse, stamp, steps: [{ id, error, data }] }` (`scripts/season-grade-run.mjs:641`) |
| R1-3 | §10: steps write their own files when `ctx.write`; `artifacts` is a path list only | A's runner never writes a step's files (the `d44` precedent, :340-356); `ctx.write` is already `write && !rehearse` (:622) |
| R1-4 | §10: `games-l6` and `override` throw a named error when `ctx.shared.S` is absent | `ctx.shared` is set only at the end of a successful `vet-calibration` (:590-601); `--only games-l6` alone, or a guard stop, leaves it empty |
| R1-5 | §6.1 seam: `rescoreSeasonRowsLeague(ctx.totals(2026), scoringSettings, positionOf)[id].weeklyPoints`; `scaled` = `weeklyPointsMethod === 'scaled'` | rev 0's `rescoreSeasonRowsLeague(2026, …)` is not the signature (`lib/leagueBasis.mjs:51`) |
| R1-6 | §6.1 seam: "S's `scoringSettings`" = the first capture of the last segment (A's `sRef`, :373) | S is a composite, not a capture (A §5.2) |
| R1-7 | §6.1 seam: start-row team via `SCHEDULE_TEAM_ALIAS` (`lib/sleeper.mjs:25`) | captures say `LAR`, `nflverse/schedule` says `LA` (checked 2026-10-23) |
| R1-8 | §6.1 seam: week c's Thursday is the literal `ROS_WEEK1_THURSDAY = '2026-09-10'` in `lib/seasonGrade.mjs`, never derived from `KICKOFF_2026_UTC` (whose UTC date is also 09-10) | A's pin comment says "never derive a week calendar from it" (`lib/seasonGrade.mjs:18`) |
| R1-9 | §6.2/§6.3 seam: S(i) rows read through `ctx.shared.S` → `ctx.snapshot(date).players[id].projection`; the rank index is built as `games-cause-run.mjs:310-334` builds it | names the real lookup; `ctx.shared.replay.R` has no `projectedGamesBase`/`shortSeasonState` |
| R1-10 | §7 seam: D-75's evaluation splits — `runRookieTotal` returns 2026 rows only (`result.evaluate`); arms, ratios, guard and label are a pure helper | `runRookieTotal` returns "no per-row data" today (`scripts/rookie-total-run.mjs:6`), and the league factor file is not one of its loaders |
| R1-11 | §7 seam: shipped factor imported from `lib/rookieMirror.mjs` `ROOKIE_TOTAL_FACTOR`; 21.90 read from `computeCeilingReconciliation(...).expected.QB.asymptote` | no hard-coded copies; `APP_ROOKIE_CEILING` is not exported |
| R1-12 | §7 seam: the QB leave-one-class-year-out helper is new (none exists); placed in `scripts/season-grade-run.mjs` with `quantile` from `scripts/panel-run.mjs` | rev 0 named no site for it |
| R1-13 | §7 seam: league rookie panel file name `backtests/<runDate>-rookie-league-panel.json` | the existing convention (`writeRookieArtifacts`, `scripts/panel-run.mjs:2445-2448`); rev 0 said `-rookie-panel-league.json` |
| R1-14 | §8 seam: the count path skips the `constants2a` k check and `rookiePriorFor` | neither feeds `flaggedWithY1` (`scripts/inseason-dyn-run.mjs:832-879`); `runQbSatLonger` throws without 2a constants (:834) |
| R1-15 | §8: **open question Q1** — `guardLoad` refuses `season-totals/2026` while the manifest says `inProgress: true`, and it will still say so on 2027-01-15 | `scripts/inseason-run.mjs:93-95`; `scripts/update-nfl.mjs:94` (`inProgress = year >= currentSeason`, Sleeper's season rolls over after the Super Bowl; CR-01) |
| R1-16 | §3 touch list: adds `DEFAULT_LOAD` keys, `data-catalog.md`, `bin/season-grade.mjs` help, `test/rookie-basis-panels.test.mjs`, `test/inseason-dyn.test.mjs`, `.claude/tasks/app-repo-backlog.md`; names every new export | the rev 0 list could not be implemented without them |
| R1-17 | §11: fixtures named; one new trimmed checkpoint capture (`2026-10-06`); everything else synthetic in the test file; byte-identity tests placed in the files whose memLoad they reuse | A's fixtures carry no `inSeason` blocks (trimmed out); Invariant 10 |
| R1-18 | New §12 cross-repo: B reads the per-player `inSeason` block, a new coupling; one app-repo-backlog line | `../CLAUDE.md` → a new coupling gets an index entry |
| R1-19 | New §15: open questions Q1–Q3 | rules B cannot implement unambiguously against the built seams |

---

## 3. Touch list (Slice B)

| File | Change |
|---|---|
| `lib/seasonGrade.mjs` | pure, additive (§6): `ROS_WEEK1_THURSDAY`, `ROS_CHECKPOINTS`, `rosCalendar`, `pickCheckpointCapture`, `buildRosRows`, `rosCheckpointReport`, `rosLabel`, `gamesL6Report`, `l6Label`, `rookieTotalArms`, `d75Label`, `d16Label`, `ROS_MIN`/`L6_MIN`/`D75_MIN`. Imports only `lib/inSeasonEvidence.mjs` (as today) — never `lib/rookieMirror.mjs` |
| `scripts/season-grade-run.mjs` | append the six step functions and their `STEPS` entries after `vet-calibration`; add `DEFAULT_LOAD` keys (§5a); `qbAsymptoteLoco`. **Never edit A's steps, `decideHeadline`, `runSeasonGrade` or `formatVerdict`** |
| `scripts/panel-run.mjs` | `runRookiePanels({ …, entryToYear = ROOKIE_ENTRY_YEARS.toYear })` — `entryToYear` replaces the destructured constant in `maxYear` (:1940), the `debut` and `rookiePathAll` assemblies, and `meta.entryYears` = `{ fromYear, toYear: entryToYear }`. Default → byte-identical |
| `scripts/rookie-total-run.mjs` | `runRookieTotal({ …, evaluateTargetSeason = null })`; non-null adds `result.evaluate` (§7 seams). Null → the result object is byte-identical (no `evaluate` key) |
| `scripts/inseason-dyn-run.mjs` | new export `countSatLongerFlagged` (§8); `weekOneRoles` and `ppgFrom` gain trailing parameters with today's values as defaults. `runQbSatLonger` and `runInSeasonDyn` are untouched |
| `bin/season-grade.mjs` | help text: B's step ids and artifacts |
| `test/season-grade-b.test.mjs` **(new)**; `test/fixtures/season-grade/snap-2026-10-06.json` **(new, trimmed)**; `test/rookie-basis-panels.test.mjs`, `test/inseason-dyn.test.mjs` (byte-identity cases) | §11 |
| `README.md` | the "January season grade" section (:2286) gains B's steps, artifacts and the `--only` dependency note |
| `data-catalog.md` | `grading/` row: the two unregistered rookie panels |
| `.claude/tasks/app-repo-backlog.md` | one entry (§12) |

Untouched: every committed artifact, every pinned constant, A's steps, `lib/vetReplay.mjs`, `scripts/games-short-run.mjs` (`inSeasonCheck` is called, not changed), `scripts/inseason-run.mjs` (`guardLoad`), `manifest.json`.

## 5a. Slice A seams B reuses (as built at `bea5dd5`)

- **Step contract:** `{ id, run(ctx) → Promise<{ section: { id, title, placement: 'top'|'main'|'appendix', md, data }, artifacts: [{ path, registered? }] }> }`. B's sections use `placement: 'main'`, so `formatVerdict` prints them after `vet-calibration` in registry order. A throwing step may attach `err.section`; it is printed. `hardStop` is G-SEASON's alone; B never sets it.
- **`ctx`** (`makeContext`, :49-71): `ctx.load`, `ctx.rehearse`, `ctx.write` (already false under `--rehearse`), `ctx.runDate`, `ctx.log`, `ctx.snapshot(date)` (LRU of 4), `ctx.totals(year)` (memoised), `ctx.inventory()` (lazy, available without `vet-calibration`: `{ entries[{ date, capturedAt, era, segment, index, sEligible, … }], kDate, kPrevDate, segments[{ id, first, last, n, captures }] }`), `stampOf(ctx)` (module-private; B's steps live in the same file).
- **`ctx.shared`**, set only after `vet-calibration` succeeds (:590-601; Fix pass 1 item 5):
  - `K = { date, capture }`;
  - `P = { id → pos }` over every replay row (replayed, imputed and, under a G5 failure, dropped), K-style position, `'UNK'` possible;
  - `classification = { captureDate → segment id | 'pre-kickoff' | 'other' }`;
  - `S = { id → S(i) capture date }`, replayed rows only;
  - `replay = { R: { id → { p, G, T, imputed } }, K: { id → { p, G, T } } }`. **Imputed rows carry K's captured p/G/T with `imputed: true`, before ρ** (ρ is applied only inside `materializeRows`); dropped rows are absent from `R`. B never reads `replay.R` values as projections.
- **Helpers in the same file:** `makePositionOf(snapshot, ctx)` (chart → `raw/-players-nfl.json` → roster 2026, with `.src` counts), `resolvePositionOf(sRef, ctx.load)` (A's league-outcome position source), `fmt`, `fmtCI`.
- **`lib/seasonGrade.mjs` reused, not re-implemented:** `POSITIONS`, `BOOT` (4,000 / 12345), `bootCI`, `medianOf`. Paired differences use `bootstrapPairedMean(ids, diffs, BOOT)` from `lib/inSeasonEvidence.mjs` (player-clustered, as A §13). `calibrationLabel`/`agreeLabel` are A's labels and are **not** reused for B's rules (§13 has B's own).
- **`DEFAULT_LOAD` additions** (additive keys; A's keys unchanged): `rookiePanelLoad: () => PANEL_DEFAULT_LOAD` (`scripts/panel-run.mjs`), `rookieTotalLoad: () => ROOKIE_TOTAL_LOAD`, `loadRookieLeagueConstants: () => readJson('backtests/2026-10-17-rookie-league-constants.json')`, `inseasonDynLoad: () => INSEASON_DYN_LOAD`. Tests inject all four.
- **Import-graph constraint (T-RM1):** `scripts/season-grade-run.mjs` will reach `lib/rookieMirror.mjs` through `scripts/rookie-total-run.mjs`. That is allowed (it is not a fit entry point), but no file in `test/rookie-mirror.test.mjs`'s `FIT_ENTRY_POINTS` closure may import `scripts/season-grade-run.mjs` or `lib/seasonGrade.mjs`.

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
  - Paired Δ|err| (value − comparator) via `bootstrapPairedMean`, against `ros.prior` and against observed-to-date PPG (n ≥ 1).
  - Caveat to print: on live-prior rows `ros.prior` is the current, leaky projection.
- **Empty cells:**
  - n = 0 → `empty` (row printed).
  - n below the minimum → `insufficient` (numbers printed, no label).
  - The frozen/live split is reported only when both groups are non-empty. Otherwise it prints one line: "split degenerate: all rows priorSource live (notFrozenReason counts …)". This is the expected state for 2026.

**Seams (Rev 1).**
- `ROS_WEEK1_THURSDAY = '2026-09-10'`, `ROS_CHECKPOINTS = [3…17]`. `rosCalendar() → [{ c, thursday, closeUtc, windowEndUtc }]` for c = 1…17, with `closeUtc = thursday + 5 d, 06:00:00Z` and `windowEndUtc = thursday(c+1), 23:00:00Z`.
- `pickCheckpointCapture(cal_c, entries) → { c, date|null, status }`, over `ctx.inventory().entries` with `targetSeason === 2026` (ascending): status `ok` (inside the window), `late` (first after close_c), `no-capture` (none after close_c), or `no-inSeason-capture` (c = 1, 2, fixed). A chosen capture carrying no `inSeason` row yields `empty` cells.
- Week w's status is `weeklyStatus[w − 1]`; week w's points are `weeklyPoints[String(w)] ?? 0` from the rescored row. A player with no 2026 row has no `'P'` weeks (realised undefined → not graded for (a); 0 points for (b)).
- **n-th `'P'` week:** n = 0 counts as consistent; a row with fewer than n `'P'` weeks counts as inconsistent.
- **Scoring and positions:** the scoring is `sRef.scoringSettings`, where `sRef = ctx.snapshot(ctx.inventory().segments.at(-1).first)` (A's `sRef`). The rescore's `positionOf` is `resolvePositionOf(sRef, ctx.load).positionOf` (A's league-outcome source). A row's cell position is `makePositionOf(checkpointCapture, ctx)`; `UNK` is counted and not graded.
- **Start rows:** team = the capture row's `nfl_team` through `SCHEDULE_TEAM_ALIAS`; the team's REG weeks are taken from `ctx.load.loadSchedule(2026)` (home or away), ascending, and the last `start.remaining` are used. A team with fewer scheduled games than `remaining` is excluded and counted `schedule-short`. (b) cells are QB only.
- **Observed-to-date PPG for (a):** the league points over the first n `'P'` weeks ÷ n. For (b) see Q3.
- **`buildRosRows(capture, { rescored, schedule, positionOf, c }) → { perGame[], start[], nConsistency: { share, n }, counts: { scaled, unk, scheduleShort, noRow } }`.** Each row is `{ id, pos, value, prior, observed, realised, nGames, priorSource, notFrozenReason }`.
- **`rosCheckpointReport(rows, { min = ROS_MIN }) → per pos { n, mae, bias, vsPrior: { mean, ci, label }, vsObserved: { … } }`.** It also returns the frozen/live split or the degenerate line. `rosLabel(ci, cmp)` → `value-beats-<cmp>` | `no-difference` | `insufficient`. `ROS_MIN = 30` counts distinct players.
- `scaled` count = rows of the rescored 2026 file with `weeklyPointsMethod === 'scaled'` (non-`TEAM_*`), printed once per run.

### 6.2 L6 games check

- **Rows:** P's veterans, using S(i)'s `projectedGames`, `factors.projectedGamesBase` and `factors.shortSeasonState` (leak-free).
- **Grade:** vs 2026 `gamesPlayed`, by state (`short`/`none`/`qual`) and for rel3 (`rel3Of`, S = 2025, rank index built as in `games-cause-run.mjs`).
- **Metrics:** MAE, bias, and paired Δ|err| (L6c − base) with CI.
- Imputed players are excluded and counted.

**Seams (Rev 1).**
- The rows are `Object.keys(ctx.shared.P)`. A row with `ctx.shared.S[id]` reads `ctx.snapshot(ctx.shared.S[id]).players[id].projection`. A row without one is excluded and counted by kind: `imputed` (`ctx.shared.replay.R[id]?.imputed === true`) or `dropped` (absent from `replay.R`; G5 failure only, see Q2).
- `L6c = projectedGames`, `base = factors.projectedGamesBase`, `state = factors.shortSeasonState`. Realised = `ctx.totals(2026)[id]?.gamesPlayed ?? 0` (A §5.1's no-row-is-0 rule). Position = `ctx.shared.P[id]`.
- **rel3:** `rel3Of({ id, S: 2025, position }, rankIndex, GAMES_CAL_DEFAULTS)`. Here `rankIndex = buildRankIndex({ 2023, 2024, 2025: ctx.totals(y) }, crosswalkPositionOf, [2023, 2024, 2025], POSITIONS)`, and `crosswalkPositionOf` is the object built from `loadPlayerIds().ids` as at `games-cause-run.mjs:310-311`.
- **`gamesL6Report(rows, { min = L6_MIN }) → { byState: { short, none, qual }, rel3, excluded: { imputed, dropped, missingField } }`.** Each cell is `{ n, mae: { l6c, base }, bias: { l6c, base }, delta: { mean, ci, label } }`. `l6Label(ci)` follows §13; `L6_MIN = 20`. A row whose S(i) projection lacks `projectedGamesBase` or `shortSeasonState` is counted `missingField` and excluded. The step throws if more than 0 such rows appear on a last-segment S(i), since the L5 detector guarantees the key.
- **Dependency:** if `ctx.shared.S` is undefined, the step throws `games-l6 needs vet-calibration's ctx.shared (P, S) — it did not run or it failed`.

### 6.3 In-season healthy override

`inSeasonCheck` (`scripts/games-short-run.mjs`, export unchanged), with rows `{ id, S: 2025, sState, star: rel3, p: { SOf0: projectedGames, C0: projectedGamesBase } }` and `store = { 2026: season-totals 2026 }`. Report the groups × checkpoints and `inSeasonRule` verbatim.

**Seams (Rev 1).** The rows are §6.2's graded rows (same exclusions), with `sState = factors.shortSeasonState`. The store is `{ 2026: ctx.totals(2026) }`. The checkpoints are the default `IN_SEASON_CHECKPOINTS` ([1, 2, 4, 6, 8, 10, 12]). The `noRow` count is printed. The step has the same dependency throw as §6.2.

### 6.4 `inSeason.next` — recorded, not built

The `next` grade needs 2027 outcomes (≥ 2028-01). The artifact records the count of rows with a `next` block per position × checkpoint.

**Seams (Rev 1).** Counted on §6.1's checkpoint captures (one per c), with the §6.1 position source. This is computed in the `override` step (§10), which re-picks the checkpoint captures with `pickCheckpointCapture` and does not read `ros`'s output.

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

**Seams (Rev 1) — D-16.**
- `const panelLoad = ctx.load.rookiePanelLoad()`. The step calls `half = runRookiePanels({ load: panelLoad, basis: 'half_ppr', entryToYear: 2026 })` and `league = runRookiePanels({ load: panelLoad, basis: 'league', entryToYear: 2026 })`.
- (i) `half.debut.rows` filtered to `entryYear === 2026` → counts by `position` × `draftGroup` × `outcomeClass`. Outcome classes count games, so they are identical under both bases; the league counts are printed only if they differ.
- (ii) `half.ceiling` as returned, printing observed, expected (`.expected`), delta and match per position.
- (iii) `qbAsymptoteLoco(half.debut.rows)` in `scripts/season-grade-run.mjs`. For each class year y in 2013…2026 present in the rows, it takes the QB rows with `outcomeGames >= 8 && outcomePPG != null && entryYear !== y`, sorts them, applies `quantile(…, 0.99)` (imported from `scripts/panel-run.mjs`), and rounds to 2 dp as `computeCeilingReconciliation` does. It returns `{ folds: [{ y, asymptote, n }], min, max, classes }`. The step asserts `classes === 14`, or prints `classes ≠ 14` beside the range.
- (iv) half: `half.debut.rows`, 2026-class QBs with gp ≥ 8 and `outcomePPG > half.ceiling.expected.QB.asymptote`. League: `league.debut.rows`, same filter against `expected.QB.asymptote × basisScaleOf(leagueBasisLoad(panelLoad, leagueLoadArgs(panelLoad)), 2026, 'QB')`, with the scale printed. Counts only, never ids (aggregates-only convention).
- `d16Label(asymptote)` → `moved` iff `asymptote < 20.50 || asymptote > 21.95`, else `within-fold-spread`. Its input is `half.ceiling.observed.QB.asymptote`.
- **Artifacts (`ctx.write` only):** `writeJsonStable('backtests/<runDate>-rookie-panel.json', half)` and `writeJsonStable('backtests/<runDate>-rookie-league-panel.json', league)`. Both are unregistered (README §Analysis), listed in `artifacts`, and no verdict md is written. Under `--rehearse` nothing is written.

**Seams (Rev 1) — D-75.**
- `runRookieTotal({ load: { ...ctx.load.rookieTotalLoad(), loadLeaguePanel: () => league }, basis: 'league', panelPath: '<in-memory league rookie panel, runDate>', evaluateTargetSeason: 2026 })`. The panel object is injected; nothing is read from disk, so `--rehearse` works.
- **`evaluateTargetSeason` (non-null) adds** `result.evaluate = { targetSeason, rows: [{ sleeperId, position, draftGroup, predTotal, predPPG, outcomeTotalPts, outcomeGames }] }`. These are the composed rows with `targetSeason === evaluateTargetSeason`, in panel order, where `predTotal` is the already-composed `composeRookieRow(...).predTotal` (legacy, pre-factor, at `basisScaleOf(leagueLoad, 2026, pos)` via the existing league path). The parity stop and every existing field are unchanged. The step records per-row data in memory only and never writes `evaluate.rows` to an artifact (aggregates only).
- `rookieTotalArms(rows, { shipped: ROOKIE_TOTAL_FACTOR, league: constants.families.F4.constants.totalFactor }) → per group { n, players, ratioH: { value, ci }, ratioL: { value, ci }, delta: { mean, ci }, label }`, where:
  - rows are filtered to `ROOKIE_TOTAL.decisionGroups` × `ROOKIE_TOTAL.decisionPositions`;
  - each ratio is `biasSummary` (`lib/rookieTotalPoints.mjs`) on rows with `predTotal` replaced by the arm;
  - Δ is `bootstrapPairedMean(sleeperIds, |armL − real| − |armH − real|, ROOKIE_TOTAL.bootstrap)`;
  - `d75Label` follows §7, with `D75_MIN = 30` rows per group.
- `ROOKIE_TOTAL_FACTOR` is imported in `scripts/season-grade-run.mjs` (not in `lib/seasonGrade.mjs`, which stays mirror-free) and passed in. The constants object comes from `ctx.load.loadRookieLeagueConstants()`. The step throws if `families.F4.constants.totalFactor` lacks `day3` or `undrafted`.
- Measured 2026-10-24: all 234 `draftYear === 2026` crosswalk entries carry a birthdate, so `runRookieTotal`'s birthdate stop (:72) should not fire on the 2026 class.

## 8. D-60 — recount only

- New export `countSatLongerFlagged({ load, seasonsTo = DYN_DEFAULTS.seasons.to, maxLoadSeason = IN_SEASON_DEFAULTS.maxLoadSeason })`.
- It threads both ceilings as parameters through `weekOneRoles`, `ppgFrom`, the Q5 checkpoint-row path, and the hard-coded `guardLoad(load, { maxLoadSeason: 2025 })` at `scripts/inseason-dyn-run.mjs:1068`, for the count path only.
- `obsBy` feeds only `obs`, so no k-fit assembly is needed. The stop condition below is not expected to fire.
- January calls it with `seasonsTo: 2025, maxLoadSeason: 2026` and reports `flaggedWithY1`.
- At ≥ 20 it reports "D-60 re-run owed" (a follow-up slice). The full re-run is not done in January.
- **Stop condition:** if the count needs anything beyond the Q5 path, stop and report. D-60 then leaves the January run; it is not blocking.

**Seams (Rev 1).**
- Signatures: `weekOneRoles(g, env, playerIds, { from = DYN_DEFAULTS.seasons.from, to = DYN_DEFAULTS.seasons.to } = {})`, and `ppgFrom(g, season, pid, maxLoadSeason = IN_SEASON_DEFAULTS.maxLoadSeason)`. Existing callers pass nothing.
- `countSatLongerFlagged` runs on the same unwrapped loader `runInSeasonDyn`'s default basis uses. It builds:
  - `g = guardLoad(load, { maxLoadSeason })`;
  - `env = { load: g, scheduleIdx: makeScheduleIndex(g), qbChainModels: loadQbChainModels(g) }`;
  - `playerIds = g.loadPlayerIds()`;
  - `rolesBySeason = weekOneRoles(g, env, playerIds, { to: seasonsTo })`.
- It then repeats `runQbSatLonger`'s loop (:838-875) for S ≤ `seasonsTo`, keeping only what the count reads: `primaryPassers`/`assertPrimaryCoverage`, `startWeeks`, the team weeks, `satLongerAt` per checkpoint, and `y1 = ppgFrom(g, S + 1, pid, maxLoadSeason)`. It drops the `constants2a` k check, `rookiePriorFor`, `obsBy`, `y2`/`priorY2At` and the `primaries1` start share, none of which reaches `flaggedWithY1`.
- It returns `{ flaggedWithY1, flaggedPlayers, backupRookieQbs, excluded, seasonsTo, maxLoadSeason }`, counts only.
- Live default must give `flaggedWithY1 === 13`: every committed `backtests/*inseason-dyn*` artifact records 13.
- Basis: `flaggedWithY1` reads only `Number.isFinite(y1)` (gp ≥ 6 with finite points), so it is the same under half-PPR and league; the count needs no league wrap.
- **Blocking unknown (Q1).** `ppgFrom(g, 2026, …)` goes through `guardLoad`, which throws on any `inProgress: true` season-totals file. It is `true` today, and by `update-nfl.mjs:94` it stays `true` until Sleeper's season rolls over, after 2027-01-15. As specified, the January count therefore throws, which is §8's stop. Session 2 implements whatever Anton picks in Q1; until then, the `d60` step catches that specific error and reports `D-60 not counted — season-totals 2026 is inProgress (Q1)`. It is not blocking and exits 1 under per-step isolation, like any failed step.
- Stop condition unchanged: if anything else beyond the listed path is needed, Session 2 stops and reports.

## 9. Listed, not built

| Item | Does January produce its input? |
|---|---|
| D-79 `SHORT_SEASON_K` refit | Partly. The refit needs no 2026 data. §6.2 is its first out-of-sample season. |
| D-80 durability constants | No. It needs a data-rev comparison mode; §6.2 is a symptom check only. |
| D-85 healthy-cut override | Partly. §6.3 grades it on 2026 with post-D-76 `'D'`; the historical re-run is still owed. |

## 10. Orchestrator hooks (Slice B)

- Steps append in this order: `ros` (§6.1), `games-l6` (§6.2), `override` (§6.3, plus §6.4's `next` counts), `rookie` (§7), `d60` (§8), `listed` (§9).
- Each reads Slice A's `ctx` (K, P, S(i), classification, loads, `KICKOFF_2026_UTC`), and reruns nothing A computed.
- New artifacts: `backtests/<runDate>-rookie-panel.json` and `backtests/<runDate>-rookie-panel-league.json` (unregistered, README §Analysis). B's aggregates go into A's `season-grade.json` under keys `ros`, `gamesL6`, `override`, `rookie`, `d60`.
- Verdict sections follow A's, in step order.

**Seams (Rev 1) — supersede the two bullets above where they differ.**
- `STEPS` gains `{ id: 'ros', run: stepRos }`, `{ id: 'games-l6', run: stepGamesL6 }`, `{ id: 'override', run: stepOverride }`, `{ id: 'rookie', run: stepRookie }`, `{ id: 'd60', run: stepD60 }`, `{ id: 'listed', run: stepListed }`, appended after `vet-calibration`. `--only` accepts these ids, and `season-gate` still always runs first (A's runner).
- **What each step reads from A.** `ros`, `rookie`, `d60` and `listed` need only `ctx.load`, `ctx.inventory()`, `ctx.snapshot()` and `ctx.totals()`. `games-l6` and `override` need `ctx.shared.P`, `.S` and `.replay`, and throw the §6.2 dependency error without them. No B step reads `ctx.shared.K` or `ctx.shared.classification`; the classification B needs is `ctx.inventory()`'s.
- **Aggregates:** each step's `section.data` lands in `backtests/<runDate>-season-grade.json` as `steps[i].data` with `steps[i].id` = the step id. That is A's layout; B adds no top-level keys. Each `data` holds aggregates only, never per-player rows.
- **Artifacts:** `backtests/<runDate>-rookie-panel.json` and `backtests/<runDate>-rookie-league-panel.json`, written by `stepRookie` itself when `ctx.write`. As with A's `d44`, they are written even if a later step fails, while the season-grade json and verdict are not.
- **Rehearsal:** each B section starts with `**${stampOf(ctx)}**` when rehearsing, as A's do.
- `stepListed` prints §9's table verbatim; its `data` is `{ items: ['D-79', 'D-80', 'D-85'] }`.

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
  - `countSatLongerFlagged` default ≡ explicit `seasonsTo: 2024, maxLoadSeason: 2025`.
- **Live check (not a test):** the 13-player count is checked live once in Session 2's hand-back.

**Seams (Rev 1) — fixtures and placement.**
- **Synthetic, built in `test/season-grade-b.test.mjs`:**
  - a 2026 season-totals object (non-`TEAM_*` rows with `weeklyStatus`, `weeklyStats`, `weeklyPoints`, `stats`, `fantasyPoints`, `gamesPlayed`; one row whose weekly sums miss → `scaled`);
  - a schedule with a `LA` team, so the `LAR` alias is exercised;
  - in-memory captures with `inSeason` blocks (per-game rows at chosen `n`, start rows with `remaining`, `next` blocks, `priorSource: 'live'` everywhere plus one variant with a `frozen` group);
  - a `ctx` from `makeContext({ load })` with a stub load.
  - None of these reads `nfl/`, `nflverse/`, `ktc/` or `snapshots/`.
- **New trimmed fixture** `test/fixtures/season-grade/snap-2026-10-06.json`: a completed dated capture (c = 4's `ok` capture; not the newest), about 40 players, `inSeason` blocks kept, at least 5 `start` rows. It pins the real field names (`inSeason.{season, n, frozen, priorSource, notFrozenReason, ros.{value, prior}, start.{remaining}, next}`); `buildRosRows` must read it without `undefined` fields. It is built by a one-off script under `scripts/fixtures/` (the `build-rookie-pin-crosswalk.mjs` precedent), which is committed.
- **Existing A fixtures reused:** `snap-2026-10-22.json` has L5 veteran rows carrying `projectedGamesBase` and `shortSeasonState`. It drives the §6.2 field-read test, with a stub `ctx.shared` (`P`, `S` → `'2026-10-22'`, `replay.R` with one imputed id).
- **Assertions to include beyond rev 0's list:**
  - `rosCalendar()[2]` (c = 3) closes at `2026-09-29T06:00:00Z`, with its window ending `2026-10-01T23:00:00Z`;
  - `ROS_WEEK1_THURSDAY` is not computed from `KICKOFF_2026_UTC` (changing the kickoff literal in a copy leaves the calendar equal);
  - `games-l6`/`override` throw the dependency error when `ctx.shared.S` is undefined, and under `runSeasonGrade({ only: ['games-l6'] })` the run exits 1 with the step reported;
  - a `--rehearse` run of a stubbed `rookie` step writes nothing;
  - `steps[].data` carries B's aggregates under the step ids;
  - `qbAsymptoteLoco` on a synthetic 3-class set gives hand-computed fold values;
  - the D-16 label at 20.49 / 20.50 / 21.95 / 21.96;
  - the D-75 label at `ratio_L` closer and guard pass / guard fail / fewer than 30 rows;
  - the L6 label at CI upper < 0 / lower > 0 / straddling;
  - the ROS label at CI upper < 0 / ≥ 0;
  - imputed and dropped exclusions counted separately.
- **Byte-identity placement:**
  - `runRookiePanels` default vs explicit `entryToYear: 2025`, both bases, go in `test/rookie-basis-panels.test.mjs` on its `memLoad()`. `meta.generatedAt` is stripped before `deepStrictEqual`. Add one case that `entryToYear: 2021` adds the 2021 entrants and sets `meta.entryYears.toYear` to 2021.
  - `runRookieTotal` with `evaluateTargetSeason: null` vs omitted goes in the same file on `leagueStub(rows)`, comparing everything after stripping `generatedAt`. A non-null case returns exactly the rows of that `targetSeason`, with `predTotal` equal to the composed row's.
  - `countSatLongerFlagged` default vs explicit `{ seasonsTo: 2024, maxLoadSeason: 2025 }` goes in `test/inseason-dyn.test.mjs` on a new synthetic memLoad. The memLoad has a manifest with every file `inProgress: false`, `loadDepth`/`loadGameLogs`/`loadSchedule`/`loadSeasonTotals` for two seasons, `loadPlayerIds` with one rookie backup QB, and the QB chain constants. Also test: `maxLoadSeason: 2025` refuses S + 1 = 2026, and a manifest `inProgress: true` file throws the CR-21 message.

## 12. Cross-repo (Slice B)

- **New coupling.** B's ROS grader reads the per-player `inSeason` block of app-written snapshots (`season`, `n`, `frozen`, `priorSource`, `notFrozenReason`, `ros.value`, `ros.prior`, `start.remaining`, `next`). The app writes it in `src/utils/inSeasonScoring.js` (`buildScoringPosteriors`) via `src/utils/projectionSnapshot.js`. CR-01 covers only the envelope; no index entry covers these fields today.
- §6.2 reads `factors.projectedGamesBase`/`factors.shortSeasonState`; A already reads `shortSeasonState` as a detector, so that read is covered.
- Session 2 adds one `.claude/tasks/app-repo-backlog.md` entry (blocking: no; land after the data commit). It proposes CR-01 Invariant += the `inSeason` per-player fields above; App += `src/utils/inSeasonScoring.js` (`buildScoringPosteriors`); Data += `lib/seasonGrade.mjs` (`buildRosRows`). The entry is flagged in the hand-back. No app file is edited.
- No other coupling changes: `inSeasonCheck`, `runRookiePanels`, `runRookieTotal` and the Q5 path are data-internal analysis adapters.

## 13. Pre-registration (Slice B; frozen at this commit)

| Item | Rule |
|---|---|
| CI | as Slice A §13 |
| Minimum sample | ROS ≥ 30 players per cell; L6 state ≥ 20; D-75 ≥ 30 rows; below → `insufficient` (numbers printed, no label) |
| ROS | `value-beats-<cmp>` iff Δ\|err\| CI upper < 0 |
| L6 | `l6c-beats-base` iff CI upper < 0; `base-beats-l6c` iff CI lower > 0; else `no-difference` |
| D-16 / D-75 / D-60 | §7 / §7 / §8 |
| Never output | a constant, a multiplier, or a recommendation to wire |

## 14. Done-definition and hand-back (Slice B)

1. `npm test` and `npm run smoke` green.
2. `node bin/season-grade.mjs --rehearse` runs all steps on today's partial data; paste B's sections.
3. README updated.
4. Commit; push only after Anton's sign-off.
5. Hand-back: SHA range, files touched, deviations, what each test asserts, and the live `countSatLongerFlagged` default count (expected 13).

**Rev 1 additions.**
- Item 2: A's sections must still reproduce M1–M9 and every gate result unchanged. In rehearsal `d60` reports the Q1 line (season-totals 2026 is `inProgress: true` today) unless Anton's Q1 answer is implemented. `ros` will show late checkpoints `no-capture` (c ≥ 7 today).
- Item 3 also covers the `data-catalog.md` row, the `bin/season-grade.mjs` help, and the app-repo-backlog entry (§12).
- Item 4: do not push or merge without Anton's sign-off.
- Item 5 adds the live `countSatLongerFlagged({ seasonsTo: 2025, maxLoadSeason: 2026 })` result, or the Q1 error if unresolved.

Flags from both review rounds that land in B: 1-9 (§6.1), 1-14 (§7), 1-16 (§8). The full map is `january-grading-run-reviews.md`.

## 15. Open questions for Anton (Revision 1)

- **Q1 — D-60 and the in-progress flag (blocks §8's January count).** Today, and still on 2027-01-15, `nfl/season-totals/2026.json` is `inProgress: true` in the manifest: the flag flips only when Sleeper's season rolls over, after the Super Bowl. The D-60 loader refuses any in-progress season by design, so the frozen recount fails exactly as §8's stop describes.
  - **(a) Recommended:** `countSatLongerFlagged` takes `allowInProgress = []`, and January passes `[2026]` only after G-SEASON has passed (never under `--rehearse` without the gate). G-SEASON already certifies 2026 complete; the default stays byte-identical.
  - **(b)** Accept the stop: D-60 leaves the January run and is counted after the rollover.
- **Q2 — rows dropped under a G5 failure (§6.2/§6.3).** If G5 fails in January, A drops veteran backup/chain QBs from R, and they lose their S(i) link. The frozen rule excludes only imputed players. Recommended: exclude dropped rows too, counted separately. This is a no-op today, since G5 passes.
- **Q3 — "observed-to-date PPG" for (b) start rows (§6.1).** The comparator is defined per player-game; (b) predicts per team game. Recommended: the player's league points over the team's scheduled weeks ≤ c, ÷ that count. The alternative is to grade (b) against `ros.prior` only.

Not a question, recorded: `nflverse/gamelogs/2026.json` does not exist today (advstats 2026 does). B never needs it; Q5 tolerates a null file, and only the dropped start-share field reads it.
