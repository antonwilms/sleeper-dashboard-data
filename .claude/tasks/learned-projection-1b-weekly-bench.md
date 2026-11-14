# LP-1b · Learned projection research — weekly current-model benchmark

**Status:** plan, **Revision 4** (Session 1, parent folder, 2026-11-13; fable by Anton's opt-in for this planning session only). Revised against LP-1a as built (`f2e1fc9`, `89f0638`); folds in the full reviews of Revisions 2 and 3 and rulings R1–R5. Revision 4's light review (7 flags, the last plan-review round) is folded in. **Approved by Anton 2026-11-13.**
**Review depth: full** — copies app scoring logic across repos (CR-25, CR-27).
**Session 2:** **sonnet**, effort **high**, from the **parent folder**. Read both repos' CLAUDE.md first; name the repo for every edit; run git/npm inside the repo. **No file under `app:src/utils`, `src/api`, `src/components`, `src/hooks`, `src/context` or `src/App.jsx` is edited** (§7's red demonstrations are temporary and reverted).
**Anchors:** data `main` @ `bb5dd12`; app `main` @ `2c3578b`. Paths are data-repo unless prefixed `app:`.
**Series:** LP-1a → **LP-1b** → LP-2 → LP-3 (§13).

---

## 0. What this is, for Anton

LP-1a's scoreboard has one empty column: what today's app would have projected for each player each week. This slice fills it by replaying the app's real in-season logic week by week through 2014–2025, and proves it matches the app on shared test cases both repos pin. Its definition and the pass/fail bar were frozen in LP-1a; this slice cannot move them and checks it has not. Nothing ships.

## 1. Scope

**In (data repo):** the replay in `lib/learnedBench.mjs`; `bin/learned.mjs export-weekly` writing `benchw.jsonl` + `benchw.meta.json` into the git-ignored cache; a scenario helper and a fixture builder; Node and Python tests; the Python wiring of weekly B1/B1c; the 1b verdict and aggregate. **In (app repo):** a byte copy of the fixture, one parity test file, the CR-25/CR-27 index lines and cap, two doc lines.

**Out (each a §11 stop if needed):** any change to LP-1a §8, its populations, splits or cache tables beyond adding the two `benchw` files; re-running `node bin/learned.mjs export`; any edit to a file LP-1a §1 lists as import-only, to the LP-1a task file or its 2026-11-13 artifacts; any write under a served folder (`snapshots/`, `nfl/`, `nflverse/`, `college/`, `ktc/`, `enrichment/`) or to `manifest.json`; any `bin/update.mjs` or `fetch_sleeper_projections.py` run; any network request other than `npm run smoke`; any app behaviour change.

## 2. Facts (re-derived by the plan reviews; cache built at `3e7d693`)

- **G1 · 1a as built.** Cache `research/learned-projection/.cache/panel/`: `meta.json`, `weeks.jsonl`, `teams.jsonl`, `seasons.jsonl`, `bench.jsonl` (row `{ pid, S, position, b1: { covered, arm, ppg, ppgWeekly, starterPPG, … }, b2 }`, S ∈ [2014, 2025]). `weeks.jsonl` rows also carry `teamFirstChoice`, `noGame`; `seasons.jsonl` rows `draftYear`. `runExport` resolves its directory through `repoPath` and replaces the whole dir.
- **G2 · Priors.** Veteran-routed (`b1.arm` `P`/`X-short`): `b1.ppg === b1.ppgWeekly`, share-free; `b1.starterPPG` `null`. Rookie-routed: `b1.ppg` = `rec.projectedPPG` (never share-weighted); `b1.starterPPG` = `rec.qbStarterPPG`.
- **G3 · The 29 rows.** Played rows with `teamFirstChoice` false: 29, **all** `noGame: true` on the first-choice team; none was resolved to a fallback team. The 1a verdict's wording and its verification note are both wrong; the check's value is correct.
- **G4 · Routing agreement** (§4.1 vs `classifyArm`, every `b1.covered` (pid, S)): 7,124 / 7,196 = 99.00%; worst position TE 98.58%. All 72 disagreements are `X-rookie1p` vs app `standard`.
- **G5 · App sources @ `2c3578b`** (§4 transposes them). `app:src/utils/inSeasonScoring.js`: `buildScoringPosteriors` `:183` (private `ROS_K`; omission on the **live** basis `:239`; prior choice `:258-260`), `buildQbLiveStates` `:419`. `app:src/utils/seasonProjection.js`: `qbTakeoverBasis` `:1036-1040` (rookie path `:499-502`, no stale case), `depthStale` on the most recent qualifying season `:684-703, :815-816, :968-972`. `app:src/utils/qbTakeover.js:129` `buildPreseasonQbShares` (`games` defaults to 17). `seasonProjection.js` fails in plain Node (`import.meta.env`) and runs under Vitest: the review drove `computeNextSeasonProjection` via `makeVet`/`makeRookie` (`app:src/__fixtures__/factories.js`; they default `years_exp`, `depth_chart_order`, `team`) with a `qbTakeover` map and `depthMap`.
- **G6.** The other app modules load in Node via a resolve hook retrying an extensionless relative specifier with `.js` (probed).
- **G7.** `reconstructQbPreseasonShares` is a verbatim port of the app function (its `iq` median spans one call's teams); `assertPrimaryCoverage` throws below 0.99; `primaryPassers(gamelogsFile, S)` returns **every** REG week; `loadQbChainModels(load)` → `{ hazard, stick, source }`. BUF and CIN have 16 games in 2022. Data `blend` has other null rules than `posteriorOf` and is not used. `K_ROS_POINTS*` differ between the 2026-10-07 file and `2026-10-16-inseason-league-constants.json` only at QB standard and TE standard/SHORT. The index is 12,990 bytes (cap 13,000); §6 adds 706.

## 3. Rulings (Anton, 2026-11-13; LP-1a §3 rulings 7 and 9 carry over)

- **R1.** Parent-folder slice: both sides of CR-25/CR-27 land together.
- **R2.** Index cap `CAP_BYTES` 13,000 → **14,200**, header-comment literal included.
- **R3.** Weekly `c`: each fold's training relevant set is ranked on that fold's own training STD (§5).
- **R4.** The chain rule is verified against the real app by an app-side Vitest test running `seasonProjection.js` and `buildPreseasonQbShares` on the parity scenarios (T-APP-2); no app source change. **If Vitest cannot load `seasonProjection.js` or produce the flags, stop and report before choosing any other route.**
- **R5.** The live room role follows the app's rule (§4.3). Real per-season game counts stay (§4.5), with a 16-game scenario case. T-APP-2 also asserts the preseason product.

## 4. Design (data repo)

This section transposes LP-1a §8's frozen definition. Where it and the app disagree, the app wins and Session 2 stops (§11) — **except** the stand-ins and the two game-count departures of §4.5.

**Vocabulary for (pid, S, w).** `rows` = the player's season-S `weeks.jsonl` rows. `n`, `obsPPG` = count and mean `pts` of his rows with `played` and week < w. `b1` = his `bench.jsonl` row. `yearsExp = draftYear > 0 ? S − draftYear : null`. `careerStats` = league-rescored season-totals 2012…S−1 (guarded load). `appVet` = `population ∈ {standard, SHORT}`. Nothing of week ≥ w is read except the identity (`team`, `inUniverse`) of his own week-w row and, for w = 1 only, the week-1 depth chart (§10).

### 4.1 Population and k

`appPopulationAsOf({ pid, careerStats, S, yearsExp })` — **copy** of `classifyInSeasonPopulation` with `dataSeason = S−1`: over every season key of `careerStats`, `anyRow` = a non-null row exists, `qualifying` = rows with finite `gamesPlayed ≥ 8` and finite `fantasyPoints`; `qualifying === 0 || (yearsExp != null && yearsExp <= 1)` → `anyRow ? 'ROOKIE1P' : 'ROOKIE0'`; else finite `gamesPlayed(S−1) ≥ 8` → `'standard'`, else `'SHORT'`.

`ROS_TABLE = { standard: 'K_ROS_POINTS', SHORT: 'K_ROS_POINTS_SHORT', ROOKIE0: 'K_ROS_POINTS_ROOKIE0', ROOKIE1P: 'K_ROS_POINTS_ROOKIE1P' }` — **copy** of the app's `ROS_K` keying. `rosK(constantsFile, population, position)` = `constantsFile.constants[ROS_TABLE[population]][position].k`, throwing when not finite. `constantsFile` = `backtests/2026-10-07-inseason-constants.json`, read through a new `LEARNED_LOAD` loader `loadInSeasonConstants` (added to `NOT_SEASON_KEYED`, or T-LP-2 reds). `backtests/2026-10-16-inseason-league-constants.json` is never read.

`posteriorValue(prior, obs, n, k)` — **copy** of `posteriorOf(...).value`, null rules in order: `prior` non-finite → `null`; `n` not an integer ≥ 0 or `k` not finite ≥ 0 → `null`; `n === 0` → `prior`; `obs` non-finite → `null`; else `(prior·k + obs·n)/(k + n)` (non-finite → `null`).

k and every route-dependent rule follow the app's population; the **prior** follows `b1.arm` (1a's export). `ARM_POPULATION = { P: 'standard', 'X-short': 'SHORT', 'X-rookie0': 'ROOKIE0', 'X-rookie1p': 'ROOKIE1P' }`; a row with `ARM_POPULATION[b1.arm] !== population` carries `routeMismatch: true`.

### 4.2 Priors

- `projPrior` = `b1.ppg`.
- `starterPrior` (QB only) = `b1.starterPPG` when finite, else `projPrior`.

### 4.3 Chain basis (QB only)

`chainBasis({ role, order, appVet, lastQualGamesStarted })` — **copy** of the app's `qbTakeoverBasis`: `appVet && order != null && order >= 2 && lastQualGamesStarted >= 8` → `'stale'`; `role == null` → `'not-evaluated'`; `role !== 'backup'` → `role`; else `'chain'`. `lastQualGamesStarted` = `gamesStarted ?? 0` of his most recent season ≤ S−1 with finite `gamesPlayed ≥ 8` and finite `fantasyPoints`.

- **Preseason** (the frozen capture's `qbChain`) — `preseasonChain({ S, depthFile, firstGameQbs, careerStats, draftYearOf, populationOf, models, games = modalTeamGames(S) })` → `Map<pid, { basis, share, order }>`. `qbs` = for each team T of `depthFile.weeks[1]`, each non-null pid of `T.QB` at 1-based slot (nulls keep their slot; a pid seen on an earlier team is skipped), `{ id, team: T, order, rookie: draftYear === S }`; plus every `firstGameQbs` entry (a QB with an `inUniverse` row on T in T's first REG game week) on no week-1 chart, `order: null`. **One** call `reconstructQbPreseasonShares({ qbs, priorOf: (id) => priorPPG(careerStats[S−1][id]), models, games })`. `basis = chainBasis({ role: shares[id]?.role, … })`; `preChain = basis === 'chain'`; `preShare = shares[id].share`.
- **Live at w** (the app's live `qbTakeoverBasis`; R5) — `liveChainAt({ S, w, qbIds, teamOf, orderOf, careerStats, draftYearOf, populationOf, models })` → `Map<pid, basis>`. `qbs` = **every** id of `qbIds` (all QBs with a season-S `weeks.jsonl` row), `{ id, team: teamOf(id) (§4.4 `T`, `null` when none), order: orderOf(id) (§4.5), rookie: draftYear === S }`. Roles come from the same imported port, one league-wide call with the preseason arguments — so, as in the app: `team` `null`/`'FA'` → `'no-team'`; a team's incumbent is the smallest-pid QB **whose own team is T** with `order === 1`; none → `'no-chart'` for the room; everyone else `'backup'`. A pid on T's chart whose own team is not T plays no part. `basis = chainBasis(...)`; `liveChain = g ≥ 1 && basis === 'chain'`.

### 4.4 QB live state — `qbLiveStatesAsOf` (**copy** of `buildQbLiveStates`, CR-27)

`qbLiveStatesAsOf({ S, w, qbIds, rowsOf, sched, primaries, careerM1, depthFile, rosterPlayers, draftYearOf, models })` → `Map<pid, { kind, team, g, remaining, expected, fraction, starts, startPoints, order, injured }>`. `sched` = `indexSchedule(...)`; `primaries` = the **whole-season** `primaryPassers(gamelogsFile, S)` map, of which this function ignores every key with week ≥ w; `careerM1` = `careerStats[S−1]`.

- Team of x (app: live `team`): `T` = `team` of his week-w row when that row is `inUniverse` (membership dates from the previous game week's roster); else `team` of his latest row with week < w; else `null` → no state.
- `G` = `sched.weeks(T)` filtered to < w; `g = G.length`; `g === 0` → no state (only at w = 1: every team plays week 1 in 2014–2025).
- For **every** team with ≥ 1 game before w: `inc` = primary of its last game before w; `incPPGByTeam[T] = incPPG({ prior: priorPPG(careerM1[inc]), obs })`, `obs` = `inc`'s `pts` over his played rows < w (any team). `median` over non-null values. `inc == null` for x's team → no state.
- `remaining = sched.teamGames(T) − g`; `≤ 0` → no state. (App: `17 − g` — departure, §4.5.)
- `P1` = primary of `G[0]`; `rk = yearsExp === 0 ? 1 : 0`; `starts` = weeks < w in which x is **any** team's primary; `startPoints` = Σ over those weeks of his row's `pts` (`null`/no row → 0).
- kind: `x === inc && x === P1` → `original`; `x === P1 && x !== inc && injured` → `original`; `x === inc` → `starter`, `s` = trailing consecutive games of `G` with x primary, `expectedStarts({ hazard: models.hazard, stick: models.stick, start: { role: 'S', ps: 1, c: 0, s, g: g + 1, hazardCodes: { dp: 0, og: 0, rk, iq: 3 }, stickCodes: {} }, remaining })`; else `backup`, `hazardCodes = { dp: dpCode(order), og: x === P1 ? 1 : 0, rk, iq: iqCode(incPPGByTeam[T], median) }`, `start: { role: 'B', ps: starts > 0 ? 1 : 0, c: 0, g: g + 1, hazardCodes, stickCodes: {} }`. `original` carries `expected = fraction = null`.

### 4.5 Input substitutions (named in the verdict)

The two of the frozen definition:
- `order` (app: live `depth_chart_order`) = 1-based index of x in `depth.weeks[G[g−1]][T].QB` (nulls keep their slot), `null` if absent; at g = 0 (w = 1) the chart is `depth.weeks[1][T].QB` — the stated week-1 read.
- `injured` (app: non-empty `injury_status`) = any rosterweekly pair of x for week `G[g−1]` with status ∈ `{RES, INA, PUP}`; `false` for S ≤ 2015.

Two further live identity fields have no history; the verdict names them beside the two above and says LP-1a §8's "the only inputs replaced are the two live Sleeper fields" understated this:
- `team` (app: live `team`; `null`/`'FA'` → no state) = `T` of §4.4. Residue: a QB who changed teams since his last game and is not in the new team's weekly universe is valued on his old team.
- `years_exp` (population, `rk`) = `S − draftYear`.

Two deliberate **departures** (R5), named in the verdict as further additions to LP-1a §8's replaced-inputs sentence (LP-1a's file is not edited): `remaining = sched.teamGames(T) − g` where the app uses `17 − g`; and the room calls pass `games: modalTeamGames(S)` (16 through 2020) where the app passes 17. Both are identities on a 17-game team-season.

### 4.6 Values

`b1wValue({ position, K, projPrior, starterPrior, n, obsPPG, teamKnown, g, state, preChain, preShare, liveChain })` → `{ kind, cond, uncond, omitted }`:

- **Non-QB:** `cond = posteriorValue(projPrior, obsPPG, n, K)`; `uncond = null`; `kind = null`.
- **QB, `teamKnown && g === 0`** (app: preseason projection): `cond = preChain ? starterPrior : projPrior`; `uncond = preChain ? starterPrior × preShare : null`; `kind = 'preseason'`.
- **QB, state `starter`/`backup`:** `p = posteriorValue(starterPrior, starts > 0 ? startPoints / starts : null, starts, K)`; `cond = p`; `uncond = p == null ? null : p × fraction`.
- **QB, state `original`:** `cond = posteriorValue((preChain || liveChain) ? starterPrior : projPrior, obsPPG, n, K)`; `uncond = null`.
- **QB, no state otherwise:** `liveChain` → `cond = uncond = null`, `omitted: 'chain-no-state'`; else as `original` with `kind = 'none'`.

### 4.7 Assembler, adapter and output

`buildBenchwSeason({ S, weekRows, bench, seasons, gamelogsFile, scheduleFile, depthFile, rosterweeklyFile, careerStats, constantsFile, models })` → `{ rows, checks }` — pure, in `lib/learnedBench.mjs`; `weekRows`/`bench`/`seasons` are that season's table rows. It builds `sched`, `primaries`, per (pid, w) `n`/`obsPPG`, per w every QB's `T`/`G`/`g`/`order`/`injured`, then `qbLiveStatesAsOf`, `preseasonChain`, `liveChainAt` and `b1wValue` (`teamKnown = T != null`), returning the rows below and the season's check tallies. Tests and the adapter both call it.

`runExportWeekly({ load = buildLearnedLoad(), panelDir = PANEL_DIR, seasons = 2014…2025, log })` in `scripts/learned-panel-run.mjs`; `bin/learned.mjs export-weekly`. `panelDir` is **repo-relative** (`repoPath`, as `runExport`'s `outDir`). It reads `meta.json`, streams `weeks.jsonl` (`pid, S, w, position, team, played, pts, inUniverse`), reads `bench.jsonl` and `seasons.jsonl`, and through the guarded load: season-totals 2012–2025, and per S `loadGameLogs`, `loadSchedule`, `loadDepth`, `loadRosterWeekly`; `loadQbChainModels(load)`, `loadInSeasonConstants()`. Requires `meta.from === 2014 && meta.to === 2025`, else throws. For each S of `seasons` (and only those) it runs `assertPrimaryCoverage(S, coverageFor(schedule, primaries))` (imported) and lets it throw — the app refuses a season with a missing week — then `buildBenchwSeason`. Writes are atomic and only:

- `benchw.jsonl` — one row per `weeks.jsonl` row (pid, S, w) of those seasons whose (pid, S) has `b1.covered`: `{ pid, S, w, position, population, k, routeMismatch, kind, cond, uncond, n, starts, fraction, team, order, injured, preChain, liveChain, omitted }` (QB-only fields `null` for non-QB; values unrounded).
- `benchw.meta.json` — `{ generatedAt, dataRev, panelGeneratedAt: meta.generatedAt, constantsFile, constantsSha256, qbChainSource: models.source, counts: { rows, condNull, byKind, qbOmitted, routeMismatch }, checks: { c2, c3, c6 } }` (§9; each with `pass`).

### 4.8 Scenario helper and parity fixture (one file, the same bytes in both repos)

`test-support/lp-scenario.mjs` (new; used by the builder and `test/learned-bench.test.mjs`):
- `SCENARIO` — hand-built: season 2023; six synthetic teams, five with **17** REG games over weeks 1–18 (one bye each); per team-week each QB's `{ attempts, sacks, pts, played }`; per-week QB chart arrays; rosterweekly statuses; careers (`gamesPlayed`, `gamesStarted`, `fantasyPoints` per season); `draftYear`; `b1` priors (`ppg`, `starterPPG`, `arm`); checkpoints w ∈ {1, 4, 9}. Required cases: a QB `original`; a `starter` after an in-season change; a `backup` who started game 1; a rookie `backup` with capital (`starterPPG ≠ ppg`); an injured game-1 starter; an `original` in the preseason chain set and one only in the live set; a live-chain QB with no state; a stale veteran backup with **exactly 8** starts in his last qualifying season, S−2 (S−1 has 3 games); an app-rookie-route QB with `order ≥ 2` and ≥ 8 starts; an uncharted first-game-universe QB; a QB with no team at a checkpoint; a team change whose old team's chart still lists the mover at slot 1; a `routeMismatch` QB (`b1.arm` `X-rookie1p`, population `standard`, `order ≥ 2`, ≥ 8 starts in his last qualifying season, so arm- and population-routing give different bases); one team with **16** REG games (a cancelled game) carrying a `starter` and a `backup`; a bye before a checkpoint; a week-w chart that differs from the previous game's; one non-QB per population × position with n ∈ {0, 3}, the `standard` ones including a player with S−1 `gamesPlayed` **exactly 8**, and TE standard, TE SHORT and QB standard present (G7).
- `scenarioToDataInputs(scenario)` → `buildBenchwSeason`'s inputs minus `constantsFile`/`models`, in the real files' shapes (the fields `primaryPassers`, `indexSchedule`, `depthSlot` and the rosterweekly pairs read).
- `scenarioToAppInputs(scenario, w, chain)` → the `buildQbLiveStates`/`buildScoringPosteriors` arguments, weeks < w only: `qbWeekly = { complete: true, failedWeeks: [], weeks: [{ week, rows }] }` with `TEAM_<T>` rows carrying `opponent`, player rows `{ team, stats: { pass_att, pass_sack, gp, fx: pts } }`; `scoringSettings = { fx: 1 }`; `playerMap[id] = { position, team: §4.4's T, years_exp, depth_chart_order: §4.5 order, injury_status }`; `seasonProjections[id] = { projectedPPG: projPrior, factors: { qbTakeoverBasis: chain.live[w][id] } }` (**no** `qbStarterPPG` on the live projection); `frozenPrior = { status: 'ok', dateKey: 'fixture', players: {id: projPrior}, starterPPG: {id: b1.starterPPG where finite}, qbChain: {id: true where chain.pre[id]?.basis === 'chain'} }`; `currentSeasonTotals = { season: 2023, complete: true, players: { id: { gamesPlayed, fantasyPoints, scoringBasis: 'league' } } }`; `projectionBasis: 'league'`.

`scripts/fixtures/build-inseason-routing-parity.mjs` (by hand; Node ≥ 20.6; absent sibling → exit 1):
1. Registers the G6 hook and imports `app:src/utils/inSeasonScoring.js` (`classifyInSeasonPopulation`, `posteriorOf`, `buildQbLiveStates`, `buildScoringPosteriors`) and `inSeasonConstants.js` (`K_ROS_POINTS*`).
2. Computes the chain bases with the **data** functions (`preseasonChain`, `liveChainAt`) — the builder holds no rule of its own; T-APP-2 proves these values against the app.
3. Runs the app functions per checkpoint and writes `test/fixtures/learned-panel/inseason-routing-parity-<YYYY-MM-DD>.json` (build date): `{ appRev, builtWith, scenario, chain: { pre: { id: { basis, role, share } }, pre16: { … }, live: { w: { id: basis } } }, chainInputs: { pre, pre16, live: { w } }, cases: [{ w, appInputs, app: { population, liveStates, posteriors: [[id, { population, ros: { k, value }, start }]], omitted } }], kTables, posteriorOf: [{ args, value }] }`. Each `chainInputs` entry = `{ dataSeason: 2022, games, careerStats, playerMap: { id: { position: 'QB', team, depth_chart_order, years_exp } } }`: `pre` — every id of the preseason `qbs`, with its chart team and week-1 slot, `games: 17`; `pre16` — the same room, `games: 16` (`chain.pre16` = `preseasonChain` with S = 2023 and `games: 16`); `live[w]` — **every scenario QB**, `team` = §4.4's `T` at w, `depth_chart_order` = §4.5's order at w, `games: 17`. `share` is stored for role `backup` only. An absent `team`, `depth_chart_order`, `years_exp` or `share` is written as an explicit `null`, never omitted.

Tests read only the committed fixture; Session 2 copies it byte-for-byte to `app:src/__fixtures__/` (same name) and pins its SHA-256 as a literal in both test files.

## 5. Python wiring (`research/learned-projection/`)

- `lp/io.py` — `load_benchw(panel_dir)` → `(DataFrame, meta)`; `pid` as `str`.
- `lp/report.py` — `PREREG_HASH = '7ff9087fc4848b0df90383fc5e4397d3d4b085466c228b430211a63ad6e24e5a'`.
- `lp/baselines.py` — the top-K rule moves into `mark_relevant(df)` (per (S, w, position): top `RELEVANT_K[pos]` by `std`, ties by `pid`), applied to the test frame as today and, with `benchw`, to the fold's training frame (R3). `weekly_forecasts(wf, T, b4=None, benchw=None)`: with `benchw`, left-merge `cond → b1w`, `uncond → b1w_uncond` on (pid, S, w) into train and test; per position `c` = median of `pts / b1w` over **training** rows with `relevant`, `played`, `b1w` non-null and both > 0 (none → NaN); `test['c_weekly'] = c`, `test['b1cw'] = c × b1w`, `test['b1cw_uncond'] = c × b1w_uncond`. Without `benchw` the frame is exactly today's.
- `lp/report.py` — `WEEKLY_BENCH` keeps its entries and order and **appends** `("B1", "b1w")`, `("B1c", "b1cw")` when the column is present, so `common` (`WEEKLY_BENCH[:3]`) and the "hardest benchmark" summary are unchanged; B1/B1c do **not** join it — `plain_summary` gains one sentence per position with B1 and B1c conditional MAE on their own B1-covered rows. B1/B1c are evaluated on rows where their column is non-null (both sides of a difference on the same rows); their unconditional expected points are `<col>_uncond` where non-null, else `p_plays × <col>`; `pending1b` is dropped.
- `run_benchmarks.py` — `main(argv=None, task_file=TASK_FILE)`; the **first** step, before `io.load_cache()`, reads `task_file`, computes the prereg hash and returns 2 when it differs from `PREREG_HASH` (every mode). New flag `--weekly-bench`: loads `benchw`; returns 2 if either file is absent, `benchw.meta.panelGeneratedAt !== meta.generatedAt`, or any `benchw.meta.checks.{c2,c3,c6}.pass` is false; runs §9 check 1; with `--write` writes `backtests/<date>-learned-s1b-panel.json` (`slice: 'LP-1b'`, full results with weekly B1/B1c, `benchwMeta`) and `grading/<date>-learned-s1b-verdict.md`. Without the flag, outputs are as in 1a.

## 6. Copied definitions and the index

| Copy (`lib/learnedBench.mjs`) | Original (`app:src/utils/`) | Index | Tests (data · app) |
|---|---|---|---|
| `appPopulationAsOf` | `inSeasonScoring.js` `classifyInSeasonPopulation` | CR-25 | T-LP-9 · T-APP-1 |
| `ROS_TABLE` + `rosK` | private `ROS_K` (seen through `buildScoringPosteriors(...).ros.k`) | CR-25 | T-LP-9 · T-APP-1 |
| `posteriorValue` | `posteriorOf` | CR-25 | T-LP-9 · T-APP-1 |
| `qbLiveStatesAsOf` | `buildQbLiveStates` | CR-27 | T-LP-10 · T-APP-1 |
| `b1wValue` QB branch | `buildScoringPosteriors` QB branch | CR-27 | T-LP-16 · T-APP-1 |
| `chainBasis`, `preseasonChain`, `liveChainAt`, `b1wValue`'s `'preseason'` product — and the fixture `chain` values the builder derives from them | `seasonProjection.js` `qbTakeoverBasis`, `depthStale`, last-qualifying-season rule, `projectedPPG = qbStarterPPG × qbStartShare`; `qbTakeover.js` `buildPreseasonQbShares` | CR-27 | T-LP-13 · **T-APP-2** |

Each copy's header names its original and tests. Imported, never copied: `expectedStarts`, `incPPG`, `priorPPG`, `dpCode`, `iqCode`, `primaryPassers`, `coverageFor`, `reconstructQbPreseasonShares`, `modalTeamGames`.

**Index edit (`app:docs/cross-repo-registry.md`):**
- CR-25 — Invariant → `Evidence definitions, population routing and the posterior match; each \`K_*\` equals its pinned file.`; App += `; \`src/utils/inSeasonScoring.js\` (\`classifyInSeasonPopulation\`, \`posteriorOf\`)`; Data += `; \`lib/learnedBench.mjs\` (\`appPopulationAsOf\`, \`posteriorValue\`)`; Tests += `; \`src/__tests__/inSeasonRoutingParity.test.js\`; \`test/learned-bench.test.mjs\``.
- CR-27 — Invariant → `QB features, coefficients and chain equal the pinned files; the data replay of live state, QB posterior and chain basis equals the app on one pinned fixture.`; App += `; \`src/utils/inSeasonScoring.js\` (\`buildQbLiveStates\`, \`buildScoringPosteriors\`); \`src/utils/seasonProjection.js\` (\`depthStale\`, \`qbTakeoverBasis\`); \`src/utils/qbTakeover.js\` (\`buildPreseasonQbShares\`)`; Data += `; \`lib/learnedBench.mjs\` (\`qbLiveStatesAsOf\`, \`b1wValue\`, \`chainBasis\`)`; Tests += the same two files.
- `app:src/__tests__/crossRepoIndex.test.js` `CAP_BYTES = 14200`; `13,000-byte cap` → `14,200-byte cap` in the header comment and the test title.

**App docs:** `app:docs/navigation.md` `__fixtures__/` row — reword the lead so it no longer says every other JSON is a constant-set provenance oracle, and add: "`inseason-routing-parity-<date>.json` is a parity fixture — a byte copy of the data repo's `test/fixtures/learned-panel/` file with LP-1b's routing cases and the app's outputs on them (`inSeasonRoutingParity.test.js`)". `app:CLAUDE.md` `src/__fixtures__/` row → "…every other JSON is a provenance oracle for a pinned constant set or a cross-repo parity fixture (listed in docs/navigation.md)" (stay under 25,000 bytes).

## 7. Tests (each shown red once, then restored)

Node, `test/learned-bench.test.mjs`, on the committed fixture, through `buildBenchwSeason(scenarioToDataInputs(fixture.scenario))` unless a part is named:
- **T-LP-5 non-QB value.** `b1wValue` for the non-QB cases equals `posteriorValue(projPrior, obsPPG, n, K)` computed by hand, K from the real 2026-10-07 file, one case per population, TE standard, TE SHORT and QB standard among them. Fails if a week ≥ w enters `obsPPG`, one k table serves every population, or the 2026-10-16 league file is read.
- **T-LP-9 population, k and posterior parity (CR-25).** `appPopulationAsOf` equals the fixture's app `population` for every player (the exactly-8 one included); `rosK` on the real file equals `kTables` for every population × position and each app record's `ros.k`; `posteriorValue` equals the fixture's `posteriorOf` values (1e-12) including `n = 0`, non-finite `obs`, non-finite `prior`. Fails on drift of a copy, the table keying or the pinned file.
- **T-LP-10 QB live-state parity (CR-27).** Per checkpoint, `qbLiveStatesAsOf` returns the app's `kind`, `team`, `gamesPlayed` (= `g`), `remaining`, `starts`, `startPoints`, `expected`, `fraction` (1e-9) for every QB, and no state exactly where the app has none. On the 16-game team `remaining` is the app's − 1 and `expected`/`fraction` equal `expectedStarts` called directly with it (the §4.5 departure); every other field equals the app's. Fails on any divergence (incumbent, streak, `og`, `iq` median, injured branch, team rule, bye indexing) or a hard-coded 17.
- **T-LP-12 QB priors.** The rookie `backup` blends from `b1.starterPPG`; an `original` in neither chain set from `projPrior`; one in the preseason set and one only in the live set from `starterPrior`; at w = 1 a non-chain QB returns `projPrior` with `uncond` null, a chain one `starterPrior` and `starterPrior × preShare`. Fails if one prior serves every QB kind.
- **T-LP-13 chain basis.** `preseasonChain` (S = 2023: default `games` → `chain.pre`, `games: 16` → `chain.pre16`; and its default is `modalTeamGames(S)`, 16 at S = 2019) and `liveChainAt` equal `fixture.chain` for every QB and checkpoint; named: the 8-start veteran `'stale'` (via S−2); the app-rookie-route QB with ≥ 8 starts `'chain'`; the uncharted first-game-universe QB `'chain'`; the `routeMismatch` QB is `'stale'` (by `population`; `'chain'` by `b1.arm`); the team-less QB is `'no-team'`; the mover's old room is `'no-chart'`; one league-wide call (a two-team subset changes an `iq` code — asserted). Fails if every `'backup'` is chain, S−1 is used, the route comes from the arm, the median is split, or the incumbent is read off the chart instead of the room.
- **T-LP-14 as-of, Node side.** For w ∈ {4, 9}: every week-w `benchw` row (a non-QB, a `starter`, a `backup`, an `original`, the team whose incumbent sets the median) is deep-equal across: as built; every gamelogs game, `pts`, `played`, rosterweekly status and depth chart of weeks ≥ w randomised (seeded); those deleted and every `weeks` row of week ≥ w removed except the identity fields of `inUniverse` rows. For w = 1: the same with `depth.weeks[1]` held fixed (the one stated week-≥-w read, §10), plus an assertion that changing `depth.weeks[1]` **does** change a w = 1 row, keeping the exception visible. Fails if any other input of week ≥ w reaches a value. Red: stop filtering `primaries` to week < w.
- **T-LP-15 substitutions.** `order` reads the chart of `G[g−1]` (the differing-chart case); `injured` reads week `G[g−1]`'s pair and is `false` on a 2015 copy of the scenario with `RES` listed; `T` prefers the `inUniverse` week-w row, then the latest earlier row. Fails on a same-week chart, an oracle status or the wrong team precedence.
- **T-LP-16 end-to-end parity (CR-27).** Per checkpoint and QB: `round2(uncond) === ros.value` and `round2(cond) === start.starterValue` on start-chain records; `round2(cond) === ros.value` on the others; the omitted ids equal the app's; on the 16-game team's start-chain QBs `uncond` is instead `cond ×` the data `fraction`. Fails if the composition (prior, evidence, k, share) differs from the app's.
- **T-LP-17 fixture pin and adapter.** SHA-256 of the fixture equals the literal; `runExportWeekly` with `panelDir = 'research/learned-projection/.cache/test-lp1b-<pid>'`, `seasons: [2023]` and an injected `load` (panel built from the scenario with `meta.from/to` 2014/2025; removed in `finally`) writes only the two `benchw` files, leaves the other files' bytes unchanged, throws on `meta.from !== 2014`, and throws when **two** team-games lack a primary passer (99/101 < 0.99). Fails on an unpinned rebuild, a stray write, or a missing coverage stop.

App, `app:src/__tests__/inSeasonRoutingParity.test.js`:
- **T-APP-1 routing, posterior and live-state parity (CR-25, CR-27).** SHA-256 of the fixture copy equals the same literal; for every case, re-running `classifyInSeasonPopulation`, `buildQbLiveStates`, `buildScoringPosteriors` on `appInputs` and `posteriorOf` on the listed args reproduces the stored `app` outputs (strings/integers exact, numbers 1e-12); `K_ROS_POINTS*` equal `kTables`. Fails if the app's routing, k keying, posterior or QB logic changes without the fixture (and so the data copy) being rebuilt. Red: `gp >= 8` → `gp >= 9` in `classifyInSeasonPopulation` (the exactly-8 player flips), revert.
- **T-APP-2 chain basis against the real app (CR-27, R4, R5).** For `chainInputs.pre`, `.pre16` and each `.live[w]`: `qbTakeover = buildPreseasonQbShares({ playerMap, careerStats, dataSeason, games })`; for each QB, `computeNextSeasonProjection` (options from `makeVet` for every QB — the app routes by itself — with `player`'s `position`, `team`, `depth_chart_order`, `years_exp` set from the entry so none of those defaults leaks, the scenario `careerStats`, `depthMap: { [id]: { depthOrder } }`, `qbTakeover`) returns a projection whose `factors.qbTakeoverBasis` equals the fixture's basis; `qbTakeover[id].role` equals its `role`; for role `backup` only, `qbTakeover[id].share` equals its `share` (1e-12); and for every preseason `'chain'` QB `factors.qbStartShare === round4(share)` and `|projectedPPG − factors.qbStarterPPG × factors.qbStartShare| ≤ 0.051` (the app rounds after multiplying), with `qbStartShare === null` on every other basis — the composition `uncond = starterPrior × preShare` copies. A `null` projection fails. Fails if `depthStale`, `qbTakeoverBasis`, the qualifying-season, room-role or product rule differs from the data copy. Red: `>= 8` → `>= 9` on `recentStarterEvidence` (`seasonProjection.js:968`; the exactly-8-starts veteran flips), revert. After both reds `git diff -- src/utils` is empty.

Python (`research/learned-projection/tests/`):
- **T-PY-12 (extended).** With a synthetic `benchw`, `b1w`, `c_weekly`, `b1cw` for test season T are unchanged when every outcome column of seasons ≥ T is randomised in the frame `weekly_forecasts` fits on. Fails if a row with S ≥ T reaches weekly `c`.
- **T-PY-13 prereg pin.** `report.prereg_hash` of the committed 1a task file equals `PREREG_HASH`; `run_benchmarks.main([], task_file=<temp copy with one §8 character changed>)` returns 2 while `io.load_cache` is patched to raise. Fails if §8 is edited, the stop is removed, or the check runs after the cache load.
- **T-PY-14 weekly `c`.** On a hand-built frame `c` is the median ratio over training rows that are relevant, played, covered and both > 0; adding a non-relevant, a `pts = 0`, an uncovered or a test-season row leaves it unchanged. Fails if `c` is taken over all rows or the test season.
- **T-PY-15 B1 rows, unconditional, summary.** B1/B1c metrics use only rows with `b1w` non-null; expected points are `uncond` where present, else `p_plays × cond`; `common` and the hardest-benchmark line are identical with and without `benchw`; a stale `benchw.meta` or a false `checks.*.pass` returns 2. Fails if uncovered rows score 0, B1 alters the common-row summary, or a bad cache pair is accepted.

## 8. Pre-registered bar — unchanged

LP-1a §8 is binding and not edited; `preregHash` stays `7ff9087fc4848b0df90383fc5e4397d3d4b085466c228b430211a63ad6e24e5a`. This slice fills the `pending-1b` weekly B1/B1c columns and nothing else.

## 9. Run-time checks (on failure: stop, write nothing)

1. **Coverage** (Python): share of weekly relevant-set rows with `b1.covered` (from `bench.jsonl`) whose `b1w` is non-null, per position and test season; under 60% in any position-fold stops. `condNull` by reason and `qbOmitted` reported.
2. **Routing agreement** (Node; `checks.c2`): over every `b1.covered` (pid, S), `appPopulationAsOf` vs `ARM_POPULATION[b1.arm]` — count, pooled and per-position rate, disagreement table by cell. **Stop below 98% pooled or below 95% at any position** (G4: 99.00%; worst 98.58%).
3. **Chain sanity** (Node; `checks.c3`): every `fraction` ∈ [0, 1]; every `massPerGame` within 1e-9 of 1; every QB row is exactly one of {`preseason`, `original`, `starter`, `backup`, `none`, omitted}; counts by kind and season.
4. **Bar unchanged** (Python, first step): computed `preregHash` equals `PREREG_HASH`.
5. **Cache pairing** (Python): `panelGeneratedAt` matches; the three Node checks passed; scoring parity on 100% of played rows (1a §9.1).
6. **Primary-passer coverage** (Node; `checks.c6`): §4.7's assertion, rate per season recorded.

## 10. Verdict (`grading/<date>-learned-s1b-verdict.md`, a full re-render)

1a's contents, plus the weekly B1/B1c rows in every table, weekly `c` per position per fold, the §9 numbers, LP-1a §8 verbatim with `preregHash`, and:

- **Erratum to the LP-1a verdict (§9.3).** `lp/report.py` rewrites the line from counts on the `weeks` table: rows failing the check, split into "first-choice team has no schedule game that week (row kept on it)" by `teamSource` and "resolved to a different team"; plus one sentence that the 2026-11-13 verdict called all 29 fallback-resolved although none was (G3). The committed 1a verdict is not edited.
- **Stated limits:**
  - the four stand-ins of §4.5 (depth order, injury status, team, years of experience) — two more than LP-1a §8's sentence names;
  - the preseason chain set and every w = 1 QB value read the week-1 depth chart (stamped after game 1 in 2025, timing unknown before — LP-1a F3); this reaches the gated weekly B1c on the 2025 confirmation fold, in the incumbent's favour;
  - the reconstructed prior replaces the app's frozen-snapshot prior;
  - k and the chain models were fitted on seasons including the test seasons;
  - the two game-count departures of §4.5 (2014–2020; BUF and CIN 2022);
  - on `routeMismatch` rows (count stated) the prior follows the data route, k and the chain rule the app's;
  - `uncond` on start-chain rows uses the chain's **average** share over the rest of the season, not the next game's start probability (frozen in LP-1a §8);
  - coverage is conditional on `gamesPlayed ≥ 1` in S.

## 11. Stops (report to Session 1, never improvise)

- Any need to touch §1's **Out**, or to change what an imported function returns.
- R4: Vitest cannot load `seasonProjection.js`; T-APP-2 cannot get a non-null projection for a scenario QB by adjusting filler inputs alone; or it disagrees with the fixture in a way correcting the data copy does not resolve.
- The builder cannot load the app modules, or the app's `src/utils/{inSeasonScoring,inSeasonConstants,qbTakeover,qbTakeoverConstants,fantasyPoints,seasonProjection}.js` differ from `2c3578b` — report the diff.
- T-LP-9/10/13/16 cannot be made to agree with the app's outputs by correcting the copy alone, or agreeing needs a rule this file does not state.
- A §9 check fails.
- The cache is absent or `meta.from/to` is not 2014/2025 (do not re-export).
- `export-weekly` exceeds 15 minutes; the index would exceed its cap.

## 12. Done-definition

1. data: `test-support/lp-scenario.mjs`, `lib/learnedBench.mjs`, adapter, builder → build the fixture.
2. app: copy the fixture; write `inSeasonRoutingParity.test.js` with the pinned hash; run it (T-APP-1, T-APP-2 green, each shown red). **A T-APP-2 disagreement is resolved here, before anything below.**
3. app: index + cap, `docs/navigation.md`, `CLAUDE.md`.
4. data: `npm test` green (`test/registry.test.mjs` now checks the new Data sites).
5. data: `node bin/learned.mjs export-weekly` → Python suite green, T-PY-1 not skipped → `python3 research/learned-projection/run_benchmarks.py --weekly-bench --write` (2,000 resamples) → `npm run smoke` green.
6. app: `npm test`, `npm run lint` (0 problems), `npm run build`.

Then — data: nothing changed under a served folder or `manifest.json`; CLAUDE.md (`export-weekly` in the Learned row; `test-support/lp-scenario.mjs` in the LP navigation row; under 25,000 bytes), README → Module notes, `data-catalog.md` → Non-served artifacts (the two s1b names) updated. App: only §1's files changed; no visible surface, no app smoke.

One local commit per repo, **no push**. Hand back: both SHAs; files touched per repo; deviations; the §9 numbers; fixture name, SHA-256 and app rev; index size; weekly `c` per position per fold; per new or changed test its assertion, defect and red confirmation; that `preregHash` is unchanged and no app source file differs from `2c3578b`.

## 13. Later

LP-2 (needs 1b verified) and LP-3 (needs LP-2's result) stay parked and are re-planned one at a time.

## Fix pass 1

Session 1, 2026-11-13, after the full implementation review of data `bb5dd12..a64e920` and app `2c3578b..d71f9c1` (0 blocking, 4 should-fix, 10 notes; approved by Anton). Apply exactly this section. **Do not touch** LP-1a's task file or artifacts, any import-only file, any file under the app's `src/utils`/`src/api`/`src/components`/`src/hooks`/`src/context`/`src/App.jsx` (red demonstrations there are temporary and reverted), or any rule of `lib/learnedBench.mjs` other than F5. No network except `npm run smoke`; do not run `node bin/learned.mjs export`. `preregHash` must stay `7ff9087f…e24e5a`. Each new or changed test is shown red once, then restored.

**F1 — constants path is tested (review flag 1).** `test/learned-bench.test.mjs`: new assertions inside T-LP-5 — `INSEASON_CONSTANTS_FILE === 'backtests/2026-10-07-inseason-constants.json'`; `LEARNED_LOAD.loadInSeasonConstants()` deep-equals that file parsed; and its `constants.K_ROS_POINTS.TE.k` differs from the same key of `backtests/2026-10-16-inseason-league-constants.json` (so the check is not vacuous). Red: point `INSEASON_CONSTANTS_FILE` at the league file.

**F2 — the league-wide preseason median is tested on the copy (flag 2).** `test-support/lp-scenario.mjs`: change the S−1 career of **one** preseason order-1 QB (a team where this breaks no required §4.8 case — TF's is suggested) so his `priorPPG` is below 0.85 × the median of the six incumbents' priors; update the header comment. T-LP-13: assert that team's preseason `backup` entry from `preseasonChain` has the `share` of a league-wide `reconstructQbPreseasonShares` call on the same `qbs`, and that this differs (> 1e-6) from the share of a call restricted to that one team. Red: make `preseasonChain` call the port once per team.

**F3 — 16-game backups are checked against an app-anchored value (flag 3).** T-LP-10, for every state on a 16-game team with `kind === 'backup'`: enumerate `hazardCodes` over `dp ∈ {0,1,2}`, `og ∈ {0,1}`, `rk ∈ {0,1}`, `iq ∈ {0,1,2,3}` and `ps ∈ {0,1}`; keep the combinations for which `expectedStarts({ hazard, stick, start: { role: 'B', ps, c: 0, g: g + 1, hazardCodes, stickCodes: {} }, remaining: <the app's remaining> }).expected` equals the fixture's app `expected` (1e-9) — at least one must; every kept combination must give the same value (1e-9) when called with the data `remaining`, and the data state's `expected`/`fraction` must equal it (1e-9). Keep the existing `starter` check. Red: force `og = 0` when `sched.teamGames(T) !== 17`.

**F4 — the exporter writes nothing when a Node check fails (flag 4).** `scripts/learned-panel-run.mjs` `runExportWeekly`: compute `c2.pass`, `c3.pass`, `c6.pass` **before** any rename; `c3.pass` additionally requires `kindBad === 0`, where `kindBad` counts QB rows that are not exactly one of {`preseason`, `original`, `starter`, `backup`, `none`, omitted} (tally it in `buildBenchwSeason`'s `checks.c3`). If any `pass` is false: remove the `.tmp` file, leave any existing `benchw.jsonl`/`benchw.meta.json` untouched, and throw `LearnedCheckStop` naming the check, with the check object as `detail`. T-LP-17: with a `bench` whose arms are altered so agreement falls below 98%, `runExportWeekly` throws `LearnedCheckStop` and the temp panel dir holds no `benchw` file. Red: remove the throw.

**F5 — omitted rows counted one way; null-posterior start-chain rows marked (flag 9).** `lib/learnedBench.mjs` `b1wValue`: a `starter`/`backup` whose posterior is `null` returns `{ kind: state.kind, cond: null, uncond: null, omitted: 'no-posterior' }` (the app drops that record). `runExportWeekly`: `counts.byKind` counts a row with `omitted` set under the key `'omitted'`, never under its kind — the same partition as `checks.c3.kinds`; `counts.qbOmitted` counts every omitted QB row. Add to T-LP-12: `b1wValue` with a non-finite `starterPrior` on a `backup` state returns `omitted: 'no-posterior'`. Red: return `omitted: null` there.

**F6 — T-PY-14 exercises `b1w > 0` (flag 10).** `research/learned-projection/tests/test_weekly_bench.py`: add to the excluded kinds a training row that is relevant, played and covered with `cond = 0` and one with `cond = −5` (each would move the median if it leaked); assert `c_weekly` is still 3.0. Remove the "a not-played row" claim from the docstring (its `pts` is NaN, so it proves nothing). Red: drop `(train["b1w"] > 0)` from `weekly_forecasts`.

**Accepted, no change:** flag 5 (cohort tables carry no B1/B1c — LP-1a's had no pending slot); flag 6 (two 16-game teams — the plan's 101 team-games was impossible; recorded as a deviation; T-LP-17's coverage case stays at three missing); flag 7 (`liveChainAt` signature — no effect on output); flag 11 (T-LP-14's delete variant keeps later-week identity; no leak found); flags 13, 14 (index does not name the builder or the smaller copies — T-APP-1/T-APP-2 fail on an app change). Flag 8 is corrected by the re-run below; flag 12 is Session 1's commit.

**Re-run and commit, in this order.**
1. data: edits F1–F6 → `node scripts/fixtures/build-inseason-routing-parity.mjs` (the scenario changed, so the fixture changes). If the build date gives a new file name, delete the old fixture in both repos and update the name in both test files and `app:docs/navigation.md`.
2. app: copy the fixture byte-for-byte; re-pin the SHA-256 literal in `src/__tests__/inSeasonRoutingParity.test.js` and in `test/learned-bench.test.mjs`; run the app parity test (T-APP-1, T-APP-2 green; re-show both reds). **If T-APP-2 disagrees with the rebuilt fixture, stop and report.**
3. data: `npm test` green. app: `npm test`, `npm run lint`, `npm run build` green.
4. **Commit 1 in each repo** (code, tests, fixture) — so the export below is stamped with the code that produced it.
5. data: `node bin/learned.mjs export-weekly` → Python suite green (T-PY-1 not skipped) → `python3 research/learned-projection/run_benchmarks.py --weekly-bench --write` (2,000 resamples). If the artifacts carry a new date, delete `backtests/2026-11-13-learned-s1b-panel.json` and `grading/2026-11-13-learned-s1b-verdict.md` and update dated mentions in README/`data-catalog.md`. → `npm run smoke` green.
6. data: **commit 2** (artifacts). No push in either repo.

Report: every SHA; files touched per repo; each new or changed test with its red confirmation; the new fixture name and SHA-256; `benchw.meta.json` `dataRev`, row count, `qbOmitted`, the three `pass` flags; and every verdict number that moved, before → after (none is expected to move except through the new `dataRev`/`generatedAt` stamps — say so explicitly if any metric does).

## Verification

Session 1, 2026-11-14. Data `bb5dd12..a3dfe27` (`a64e920` slice, `eac2f7b` fix pass 1 code/tests/fixture, `a3dfe27` fix pass 1 artifacts); app `2c3578b..9158f9d` (`d71f9c1` slice, `9158f9d` fix pass 1). All unpushed.

- **Implementation review (full, opus/high) on `a64e920` + `d71f9c1`:** 0 blocking, 4 should-fix, 10 notes. Every copy in `lib/learnedBench.mjs` matches its app original at `2c3578b` line by line apart from the §4.5 stand-ins and departures; no read of week ≥ w beyond the stated ones; no app source file changed; index lines match §6; `preregHash` unchanged. The reviewer demonstrated a red for every data, Python and app test in scratch copies (the implementation session had confirmed only the two app reds), and recomputed 3,639 sampled `cond` values independently with 0 mismatches. Should-fix flags 1–4 and notes 9, 10 → Fix pass 1 (F1–F6). Accepted without change: 5, 6, 7, 11, 13, 14; 8 corrected by the re-run; 12 is this commit.
- **Deviation recorded (flag 6):** the scenario has two 16-game teams (TE, TF; 100 team-games), not the "five of 17, one of 16" of §4.8 — that count is impossible (a cancelled game removes a game from both teams). T-LP-17's coverage stop is tested with three team-games lacking a primary passer.
- **Fix-pass re-review (light) on `a64e920..a3dfe27` + `d71f9c1..9158f9d`:** F1–F6 implemented as specified, nothing beyond the section; each new assertion shown to bite by mutation. The fixture was rebuilt (qF1's S−1 points 270 → 224; only qF2's two preseason shares moved) and re-pinned, SHA-256 `95c356fbd95b681b1b49bfc5b67e9d750e3206907d2db37a548db83707c52841`, byte-identical in both repos. The s1b verdict is byte-identical after the re-run; the panel aggregate changed only in `generatedAt`, `dataRev` (`eac2f7b`), `runtimeMs` and a new `kindBad: 0`. One improvisation by the fix-applier, judged sound and accepted: T-LP-17's normal-path case writes a panel `bench.jsonl` with the routeMismatch QB's arm set to `'P'`, because the scenario's 29/30 agreement is below F4's 98% stop. 4 notes survive, none affecting a number — to the human, no further round:
  1. `c3.pass`'s `kindBad === 0` clause has no test of its own.
  2. The exporter's `counts.byKind`/`qbOmitted` partition (F5) has no test of its own; the `b1wValue` half is tested.
  3. F3's oracle does not pin `ps` on 16-game backups (both values give the same `expected`); `ps` is pinned by the 17-game comparisons.
  4. The adapter is no longer run with a routeMismatch row present (the row's routing is still tested directly in T-LP-13–16).
- **Checks:** data `npm test` 2,150 pass / 0 fail / 1 skip; Python suite 21 pass, T-PY-1 not skipped; `npm run smoke` green; app `npm test` 3,504 pass, `npm run lint` 0 problems, `npm run build` clean (run by the fix-applier; the reviewers re-ran data and Python suites and the app parity test, not smoke, lint or build).
- **Run-time checks on the real data:** 102,636 `benchw` rows, 0 null `cond`, 0 omitted QBs, 997 `routeMismatch` rows (72 player-seasons); routing agreement 7,124/7,196 = 99.00% (worst position TE 98.58%); chain sanity and primary-passer coverage pass (2014: 509/512).
- **State:** nothing under a served folder or `manifest.json` changed; no app source file differs from `2c3578b`; research cache git-ignored. Artifacts: `backtests/2026-11-13-learned-s1b-panel.json`, `grading/2026-11-13-learned-s1b-verdict.md`. LP-1a's verdict and task file untouched.

Signed off by Anton 2026-11-14

Commit ids after the push-time rebase onto `acaab74`: `a64e920` → `f8607ee` (slice), `eac2f7b` → `693536c` (fix pass 1 code), `a3dfe27` → `5cba9a6` (fix pass 1 artifacts), `01c7bf9` → `391842b` (verification record). The panel artifact and `benchw.meta.json` record `dataRev` `eac2f7b…`, the pre-rebase id of the fix-pass code commit; content is identical. App ids are unchanged: `d71f9c1`, `9158f9d`.
