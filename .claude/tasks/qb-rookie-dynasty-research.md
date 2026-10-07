# L4 · Rookie QB level in the dynasty prior (P12c) + sat-longer discount (D-60) + 2c on the current QB model (D-64) — `qb-rookie-dynasty-research`

**Plan item:** `future_plans/in-season-notes-plan.md` → Leftovers round → L4 (P12c, D-60), plus D-64 (added at the
2026-10-07 sign-off). **Session type:** parent-folder (the plan names L4 a parent-folder slice). **This file is Stage A
only** — offline research in the data repo. Wiring is planned by a fresh Session 1 **after Anton reads the verdict**
(the P12a → P12b pattern): which app files move depends on the decisions this run takes. **Session 1:** 2026-10-07, opus.
**Bases:** data `148f432`, app `8f4420e` (both clean, pushed; registries byte-identical by the anchored `sed` diff).
**Companion:** `qb-rookie-dynasty-research-registry.md` (same folder) — the registry entries this slice touches, their
verbatim `Mirror` texts, and the drafted edits the wiring stage applies.

Flow: **A1** (code + tests, one commit) → **A2** (the run, one commit) → verify (V-0…V-5, implementation-reviewer) →
push data → **Anton's gate** (reads the verdict, picks the wiring) → wiring Session 1 (app + registry, parent folder).

---

## 0. What this slice answers

1. **D-64.** `--inseason --dynasty` still assembles rows with the legacy QB prior and reads the 2a k of
   `2026-09-26`. Re-run it on the starter QB prior with the k the app now pins (`2026-10-07`), and record what moves.
2. **P12c.** Should the rookie QB level that the dynasty prior (arm B) starts from be a calibrated draft-group level
   instead of the rookie-path level? Tested on held-out S+1 (decision) and S+2 (confirmation) PPG for **all** rookie
   QBs of a draft group — not only the ones who started, which is what P12a's group values describe. The same test
   answers for the rookie route's `projectedPPG` as far as history can (§1 F6).
3. **D-60.** Replicate P6a Q5 on the app's own sat-longer definition (week-1 chart, rookie season, the residual the
   app computes at each checkpoint) and either replace `QB_SAT_LONGER_DISCOUNT` (0.90, PROVISIONAL) with a researched
   value or keep it and say why. Also: does the effect persist into year 2 (the app drops the discount at
   `yearsExp` 1)?

Nothing served changes. No app file changes in Stage A.

---

## 1. Facts established in planning (read-only scratch runs at data `148f432`)

- **F1 — 2c still reproduces.** `runInSeasonDyn({})` (21 s) deep-equals `backtests/2026-09-27-inseason-dyn-constants.json`
  (every key but `source`/`generatedAt`; key order differs only) and the committed panel's `q1`/`q2`/`q3` (0 differing
  leaves). L5's `weeklyStatus` rewrite moved nothing here.
- **F2 — D-64 moves nothing pinned.** With `assembleSeason` on `qbPrior: 'starter'` (+ `qbChainModels`) and the
  `2026-10-07` 2a file loaded: constants file 0 diffs; `q1` 0 diffs; `q3` 0 diffs; `q2` exactly 6 leaves:
  `pooled.Proj.delta.mean` 0.0241 → 0.023, `pooled.Proj.delta.ci95` [−0.0237, 0.0743] → [−0.0237, 0.0722],
  `pooled.deltaHP.mean` −0.085 → −0.0833, `pooled.deltaHP.ci95` [−0.1933, 0.0221] → [−0.1946, 0.0241], and the two
  `decision.deltaHP` copies of those. Why: rookie rows' `pointsPriorNext` is the ceiled level under both QB priors
  (L3 D2), and the 2c entries read only `.k` from the 2a file, where every `K_DYN_*` `k` is unchanged. Only X-short
  QB rows' projection prior moves (depth model `qb-takeover`). The reuse entries' `source` string is a literal
  (`PINNED_2A_SOURCE`, `scripts/inseason-dyn-run.mjs:45`) and does not yet follow the loaded file — fixed in A1.1.
- **F3 — the app's sat-longer definition** (`src/utils/inSeasonScoring.js:500-511` at app `8f4420e`): only a
  `years_exp` 0 QB whose preseason chain role (`buildPreseasonQbShares`) is `'backup'`; at the current team-game
  index g (games his current team has played), `residual = starts − Σ_{i<g} preseason.perGame[i] (?? 0)`, starts =
  every team-game where he was the primary passer (any team); `satLonger = residual < −QB_SAT_LONGER_BAND` (band 1;
  −1 exactly is not). `buildProspectLevel` (`:349-358`) multiplies a `'projection'`-kind QB's dynasty prior by 0.90
  while the flag is true; the posterior then blends it with `n = gamesPlayed` at `K_DYN_POINTS_ROOKIE0`. It is
  re-evaluated every load, so a rookie can enter and leave the flag. Nothing applies at `yearsExp` 1.
- **F4 — the dynasty prior has no takeover input.** `App.jsx:575-590` builds `rookieDynastyPriors` without
  `qbTakeover`, so `computeNextSeasonProjection`'s rookie path returns the ceiled level (`seasonProjection.js:494`,
  `qbStartShare` null). The data mirror is `rookiePriorFor` (legacy rookie model; `projectedPPG` does not depend on
  the rookie QB model). The rookie route's live `projectedPPG` for a non-`chain` rookie QB is the same level ×
  `ktcMult` × `collegeContribution`.
- **F5 — P12c populations** (rookie QBs by `playerids` `ids[].position === 'QB'` and `bySleeper.draftYear === S`,
  S 2014–2024, groups by `rookieGroup`; every one has a group and a finite B0; PPG = season-totals half-PPR with
  `gamesPlayed ≥ 6`):

  | group | rookies | y0 (season S) | y1 (S+1) | y2 (S+2) |
  |---|---|---|---|---|
  | top12 | 30 | 26 | 29 | 21 |
  | r1 | 8 | 5 | 7 | 2 |
  | day2 | 22 | 9 | 9 | 7 |
  | day3+ | 128 | 11 | 17 | 8 |
  | **all** | 188 | 51 | **62** | 38 |

  Mean S+1 PPG among those with one sits **above** the mean B0 in every group (S 2013–2024 probe: top12 17.3 vs
  16.3, day2 13.9 vs 10.5, day3+ 10.6 vs 7.7; r1 12.3 vs 13.7 the exception). That is survivor selection — the 2c
  verdict found the same arm-B pessimism for every position (prior scale c 1.16–1.32). A QB-only level fitted to it
  would raise QB rookies against the other positions. Hence the position control (Q4d) and its gate.
- **F6 — what history cannot test.** KTC history starts 2026-05-18 and the reconstruction holds `ktcMult` and college
  at 1.0, so the live `projectedPPG` excess for top picks (Mendoza 20.8 half-PPR live vs 16.1 neutral, P12a Q4) is
  out of reach of any held-out test until a completed season has KTC values (~2027). This slice tests the neutral
  level only and says so.
- **F7 — D-60 populations** (week-1 chart, `reconstructQbPreseasonShares` with the pinned chain, S 2014–2024; rookie
  roles: backup 89, incumbent 18, no-chart 1): 89 preseason-backup rookies; 31 ever flagged at a W 1–12 checkpoint;
  **13 of them have an S+1 PPG (66 flagged checkpoint rows)**; 25 flagged at their last checkpoint, of whom **6 have an
  S+2 PPG** (S ≤ 2023); 25 never-flagged backups have an S+1 PPG. Survival to an S+1 PPG is about equal (13/31 flagged
  vs 25/58 never flagged). All S ≤ 2024 are legacy-era charts (pre-game; `DEPTH_ESPN_FROM_SEASON` 2025).
- **F8 — QB YE0 rows in the 2c Q1 panel:** 494 rows / 48 players (the committed panel), n > 0 only.

**Consequence for Anton, stated now:** with the floors pre-registered in §2 (D6), Q5a (13 < 20 players) and Q5b
(6 < 20) will return `insufficient` — the run keeps 0.90 and documents the estimate, which is the "keep it and say
why" branch of the plan. Q4c (17 week-1 incumbents) is report-only for the same reason. The one open decision is Q4a.

---

## 2. Decisions (Session 1)

- **D1 — one harness, no new mode.** Q4 and Q5 are added to `--inseason --dynasty` (the CR-25 dynasty machinery the
  plan says L4 rides on). Pure logic goes into `lib/inSeasonEvidence.mjs` (already the 2c pure home), so the data
  CLAUDE.md (24,982 of 25,000 bytes) needs no edit; README → Module notes takes the detail.
- **D2 — the QB prior and the 2a file travel together.** `DYN_2A_PIN = { legacy: 2026-09-26 @ a071bdb, starter:
  2026-10-07 @ f2c3b83 }` — each k file was fitted under that QB model. `runInSeasonDyn` **requires** `qbPrior`
  (throws when absent/unknown, like `assembleSeason`), loads the matching file, and writes its pinned ref into the
  reuse entries. The CLI runs `starter`. `legacy` reproduces 2026-09-27 (V-1).
- **D3 — Q4 is YE0 only.** The draft group exists only at `yearsExp` 0 in the app (`resolveRookieQbStarterLevel`);
  YE1's arm-B prior is out of scope. Unit: one row per rookie QB-season; the pre-kickoff prior is evaluated
  prior-only (n = 0), so rookies who never play in S count — the "all rookies, not only starters" requirement.
- **D4 — Q4 candidates.** B0 = shipped neutral level (`rookiePriorFor`). GS = P12a's "if he starts" level
  (`backtests/2026-10-04-qb-rookie-level-constants.json` `starterPPG[group].value`; it saw the test seasons' starts —
  a different outcome season, stated). GC = calibrated group level: mean y1 over the training seasons' rookies of the
  group. RC = B0 × (Σy1 / ΣB0) over the training seasons' rookies of the group (keeps the within-group order). GC/RC
  are always calibrated on y1 and evaluated leave-one-season-out on y1, y2 and the posterior panel. A group with
  fewer than 5 training players falls back to B0 for that row (counted).
- **D5 — Q4 decision rule (pre-registered).** `insufficient` (keep B0) if the pooled y1 panel has < 30 players. A
  candidate is **eligible** iff its prior-only y1 ΔMAE vs B0 is BEATS, its y2 label is not WORSE, and its posterior
  (Q4b) label is not WORSE. **Position gate (Q4d):** a candidate whose pooled mean (candidate / B0) over the y1 rows is
  > 1 is eligible only if the QB − (RB ∪ WR ∪ TE) difference in y1 ratio (Σy1/ΣB0, YE0 survivors) has a 95% CI wholly
  above 0; mean < 1 needs a CI wholly below 0. Pick the eligible candidate with the lowest y1 MAE; none → `keep`. A
  gate-only failure records `keep-not-qb-specific`.
- **D6 — Q5 decision rules (pre-registered).** Floors: 20 players (P6a Q5's n = 15 was judged too thin to act on, so
  the floor sits above it). Q5a on flagged rows with y1: < 20 players → `insufficient` (0.90 kept); else LOSO-fitted d
  BEATS shipped 0.90 → `round(dFull, 0.05)`: equal to 0.90 → `keep`; ≥ 1.00 → `drop` (1.0 — the app never applies a
  premium); otherwise `fitted`; else d = 1.0 BEATS 0.90 → `drop` (1.0); else `keep`. Q5b (YE1 persistence, prior-only, flagged at the last rookie checkpoint, y2): < 20 → `insufficient`;
  LOSO d BEATS d = 1.0 **and** dFull < 1 → `extend`; else `stops-at-ye1`. `extend` is a recommendation only (the app has no rookie-season
  live state at `yearsExp` 1 — a design question for the wiring Session 1).
- **D7 — Q4c (season-S `projectedPPG`) is report-only.** 17 week-1 incumbents can't decide anything, and P12a Q3 already
  measured the group level vs the neutral level on starts (BEATS). It reports B0 vs GS on y0 by week-1 role.
- **D8 — disclosure (CR-09).** Q5's flags come from gamelogs primary passers, so its outputs are aggregates only:
  counts, MAE, labels, CIs, `dFull`. **Never** per-player rows, per-rookie-season values, per-fold d, or quantiles. Player
  **counts** are published (P12a's `nullify` keeps `players`/`games`, `lib/qbRookieLevel.mjs:167-175`); every **mean,
  MAE or ratio** over fewer than 3 players is `null`. Two-way splits (Q5c flagged-ever / never-flagged) use
  `suppressPair`. Q4c's group × role table publishes per-cell means only — no row or column totals of the same
  statistic — so a suppressed cell cannot be recovered by differencing. No two published values of the same statistic may sit on nested
  populations that differ by fewer than 3 players (P12a fix-pass lesson). Q4 reads season-totals and the depth chart
  only, but it follows the same aggregate-only rule.
- **D9 — no app re-pin is decided here.** The constants file carries `qbRookieDynasty` and `qbSatLonger` decision
  blocks so the wiring stage can pin by byte copy. Wiring branches are in §7.

---

## 3. Stage A1 — code (one commit)

All paths are relative to `sleeper-dashboard-data/`. Run `npm test` first and record the pass count.

### A1.1 `scripts/inseason-dyn-run.mjs`

1. Replace `PINNED_2A_SOURCE` (`:45`) with an exported
   ```js
   export const DYN_2A_PIN = Object.freeze({
     legacy:  Object.freeze({ path: 'backtests/2026-09-26-inseason-constants.json', commit: 'a071bdb324976203ed915e14a57b88fb740fb0b6' }),
     starter: Object.freeze({ path: 'backtests/2026-10-07-inseason-constants.json', commit: 'f2c3b83b31acc589dac78b6d61a704ac02a57477' }),
   });
   export const pinnedSourceOf = (qbPrior) => `${DYN_2A_PIN[qbPrior].path} @ ${DYN_2A_PIN[qbPrior].commit}`;
   ```
   `pinnedSourceOf('legacy')` must equal the old literal byte for byte. Thread `pinnedSource` from `runInSeasonDyn`
   through `runQ1`/`runQ2` into `writeThreeRungEntry` (both `source:` writes, `:239`, `:253`) and into the two thrown
   messages (`:237`, `:251`), which become `…is absent from the loaded ${pinnedSource}`.
2. `INSEASON_DYN_LOAD`: `loadInSeasonConstants: (qbPrior) => readJson(DYN_2A_PIN[qbPrior].path)`; add
   `loadQbRookieLevelConstants: () => readJson('backtests/2026-10-04-qb-rookie-level-constants.json')` and
   `loadDynBaseline: () => readJson('backtests/2026-09-27-inseason-dyn-constants.json')`. (`INSEASON_LOAD` already
   carries `loadQbTakeoverConstants`, `loadDepth`, `loadGameLogs`, `loadSchedule`.)
3. `runInSeasonDyn({ load, log, assemble, onRows, qbPrior, qbResearch = qbPrior === 'starter' })`:
   - first statement: `if (!QB_PRIOR_MODELS.includes(qbPrior)) throw new Error('[inseason-dyn] runInSeasonDyn needs qbPrior legacy|starter')`
     (`QB_PRIOR_MODELS` from `./inseason-run.mjs`);
   - keep `guardLoad` → `runReconciliation` first (its stop still wins on stub loads); **after** it,
     `env.qbPrior = qbPrior`, and if `starter`, `env.qbChainModels = loadQbChainModels(g)`; replace the `:632-634`
     comment with one line naming D-64;
   - `constants2a = load.loadInSeasonConstants(qbPrior)`; `pinnedSource = pinnedSourceOf(qbPrior)`;
   - build `obsBy` = `Map("${sleeperId}|${S}|${W}" → { n, obsPPG })` from `preFilterRows` with `position === 'QB'`
     (all assembled rows, before the `nextPPG` filter);
   - after Q1–Q3: if `qbResearch`, run §A1.3 (Q4) and §A1.4 (Q5); else `q4 = q5 = null`;
   - if `qbPrior === 'starter'` and `load.loadDynBaseline` is a function, `d64 = diffDynConstants(constantsFile, load.loadDynBaseline())`
     (§A1.2), else `d64 = null`;
   - `meta` gains `qbPrior`, `inSeasonConstants: pinnedSource`; `constantsFile.fit` gains the same two keys; when
     `qbResearch`, `constantsFile` gains `qbRookieDynasty` and `qbSatLonger` (§A1.5); the result gains `d64`, `q4`, `q5`.
4. `inSeasonDynMain({ …, qbPrior = 'starter' })` passes `qbPrior` through.
5. `buildInSeasonDynVerdictMarkdown`: add the sections of §A1.5 after Q3, and amend the header line so it names the QB
   prior and the 2a file. Pre-existing sections are untouched.

### A1.2 `lib/inSeasonEvidence.mjs` (pure, no I/O)

Add, with a header comment naming this task file:

- `QB_DYN_RESEARCH = Object.freeze({ satLongerBand: 1, shippedDiscount: 0.90, dGridCents: [50, 120], floors: { q4a: 30, q5a: 20, q5b: 20 }, minGroupTrainPlayers: 5, minCellPlayers: 3, ratioBootstrap: IN_SEASON_DEFAULTS.bootstrap })`.
  Header line for the band and 0.90: "mirrors app `QB_SAT_LONGER_BAND`/`QB_SAT_LONGER_DISCOUNT` (`src/utils/qbTakeoverConstants.js`) at app 8f4420e (CR-27)".
- `satLongerAt({ starts, perGame, g, band })` → `{ expectedSoFar, residual, satLonger }` — `expectedSoFar = Σ_{i<g}
  (perGame[i] ?? 0)`, `satLonger = residual < -band` (F3, exact).
- `fitDiscount(rows, { cents = QB_DYN_RESEARCH.dGridCents })` — rows `{ prior, obs, n, k, y }`; d over the integer
  cents grid /100; loss Σ|blend(d·prior, obs, n, k) − y|; ties → smaller |d − 1|, then smaller d. → `{ d, mae, rows }`;
  empty rows → `{ d: 1, mae: null, rows: 0 }`.
- `discountLoso(rows, opts)` — rows also carry `S`, `sleeperId`. `full = fitDiscount(rows)`; for each season S present,
  `dS = fitDiscount(rows with r.S !== S).d` (an empty training set gives 1.0, counted in `emptyFolds`); `preds[i] =
  { pred: blend(dS·prior, obs, n, k), actual: y }`. → `{ full, preds, folds: number, emptyFolds }` (fold d values are
  internal — D8).
- `calibrateGroup({ train, test, kind, minTrainPlayers })` — train/test rows `{ sleeperId, S, group, prior, y }`
  (test `y` may be null). For each test row, training = train rows with `S !== test.S`, same `group`, finite `y`; if
  their distinct players < `minTrainPlayers` → value = `prior`, `fallback: true`; `kind 'level'` → mean y; `'ratio'` →
  `prior × Σy / Σprior`. → `{ values: number[], fallbacks }`. Also `fullCalibration({ train, kind, minTrainPlayers })`
  → `{ [group]: number | null }` on all train rows (null below the floor), rounded to 3 dp.
- `ratioDiffBootstrap(rowsA, rowsB, opts)` — rows `{ sleeperId, prior, y }`; statistic Σy_A/Σprior_A − Σy_B/Σprior_B;
  resample players within each group independently with one `mulberry32(opts.seed)` stream (A's draw, then B's,
  per resample); percentile 95% CI. → `{ diff, ci95, direction }` with `direction` ∈ `'above' | 'below' | 'none'` (CI wholly above 0 /
  wholly below 0 / straddles). No `label` field.
- `decideQ4({ players, candidates, gate })` and `decideQ5a({ players, vsShipped, noneVsShipped, dFull })`,
  `decideQ5b({ players, vsNone })` — the D5/D6 rules, returning `{ decision, … }` objects as named in §A1.5.
- `diffDynConstants(file, baseline)` — deep compare of `constants`, `reuse` (ignoring each entry's `source`) and
  `decisions`; → `{ changed: [{ path, before, after }], equal: boolean }` (paths like `constants.K_DYN_PROSPECT_A_YE1.QB.k`).

### A1.3 Q4 — rookie QB level in the dynasty prior (adapter, `scripts/inseason-dyn-run.mjs`)

`runQbRookieDynasty({ g, playerIds, constants2a, q1Rows, allRows, roles })`, run only when `qbResearch`:

1. **Panel (Q4a).** `positionOf` = export `positionOfFrom` from `scripts/qb-rookie-level-run.mjs:41` (no behaviour
   change) and import it. For S in `DYN_DEFAULTS.seasons` (2014–2024), every pid with `positionOf[pid] === 'QB'` and
   `bySleeper[pid].draftYear === S`: `group = rookieGroup(bySleeper[pid])` (null → `excluded.noGroup`); `prior =
   rookiePriorFor(pid, 'QB', S, playerIds)` (non-finite → `excluded.noPrior`); `y0/y1/y2` = season-totals S/S+1/S+2
   `fantasyPoints / gamesPlayed` when `gamesPlayed ≥ IN_SEASON_DEFAULTS.nextMinGames` and the season ≤ 2025. `guardLoad` **throws** on a season above 2025 (`scripts/inseason-run.mjs:85`), so test the
   season bound **before** calling `g.loadSeasonTotals` (y2 for S = 2024 is null without a call). V-3 pins the counts to F5.
2. **Prior-only (Q4a).** On rows with finite y1: preds of B0, GS (`levels[group]`), GC and RC (`calibrateGroup` with
   train = test = the y1 rows). On rows with finite y2: B0, GS, and GC/RC with train = the y1 rows, test = the y2 rows.
   `pairedDelta(rows, predsB0, predsX)` for X ∈ {GS, GC, RC} on y1 and y2. Report MAE per arm and fallbacks.
3. **Posterior (Q4b).** Rows = `q1Rows` with `ye === 0 && position === 'QB'` (finite `projPrior`, `obsPPG`,
   `nextPPG`). Assert `|row.projPrior − rookiePriorFor(row.sleeperId, 'QB', row.S, playerIds)| < 1e-9` for each (throw
   `[inseason-dyn] Q4b prior drift` otherwise). `k = constants2a.constants.K_DYN_POINTS_ROOKIE0.QB.k`. Candidate value
   per row from `calibrateGroup` (train = the Q4a y1 rows, test = these rows, group from `bySleeper`), GS as above;
   pred = `blend(value, obsPPG, n, k)`; `pairedDelta` vs B0 per candidate.
4. **Position control (Q4d).** Same panel construction for RB/WR/TE (`rookiePriorFor(pid, pos, S, playerIds)`), y1
   rows only. `ratioDiffBootstrap(QB y1 rows, non-QB y1 rows)`. Report Σy1/ΣB0 per position (players, ratio).
5. **k check (report).** If the decision is a candidate: `analyzeKCell` over `allRows` with `arm === 'X-rookie0'`,
   spec `{ prior: r => r.position === 'QB' && r.ye === 0 ? <candidate value for r> : r.projPrior, obs: 'obsPPG', outcome:
   'nextPPG' }`; report `kFit.k`, `kPin` against the pinned `K_DYN_POINTS_ROOKIE0` (6.5). No constant is written from it.
6. **Q4c (report-only).** On Q4a rows with finite y0: role from `roles` (§A1.4 step 1; a rookie not on the week-1 chart
   → `'not-on-chart'`). Table by group × role: players, mean y0, mean B0, mean GS (cells < 3 suppressed). For role
   `incumbent`: MAE of B0 and GS vs y0 and `pairedDelta` (labelled report-only).
7. `decideQ4` per D5 → `{ decision: 'keep'|'insufficient'|'keep-not-qb-specific'|'GS'|'GC'|'RC', players, … }`.

### A1.4 Q5 — sat-longer (adapter, same file)

`runQbSatLonger({ g, env, playerIds, constants2a, obsBy })`:

1. **Week-1 roles** (also feeds Q4c). For S 2014–2024: chart = `g.loadDepth(S).weeks[1]`; build `qbs` exactly as
   `qbShareCoverage` does (`scripts/inseason-run.mjs:558-570`: first appearance per pid, `order = index + 1`, `rookie =
   bySleeper[pid]?.draftYear === S`); `shares = reconstructQbPreseasonShares({ qbs, priorOf: pid => priorPPG(totals(S−1)[pid]),
   models: env.qbChainModels })`. Do not change `qbShareCoverage`.
2. **Primaries.** `primaries = primaryPassers(g.loadGameLogs(S), S)`; `assertPrimaryCoverage(S, coverageFor(g.loadSchedule(S),
   primaries))` (same stop as `assembleSeason`). Team weeks = `env.scheduleIdx(S).get(team)` (the existing `makeScheduleIndex`: REG weeks per era-coded team), sorted
   ascending — no second schedule parser. The `g.loadSchedule(S)` call for `coverageFor` is a new direct schedule read
   (CR-08, companion §A.6).
3. **Rows.** Population = rookies with `role === 'backup'`. For each W in `IN_SEASON_DEFAULTS.checkpoints`: `gW` = chart
   team's REG weeks ≤ W (skip if 0); `starts` = primaries entries with `pid === x` and week ≤ W (any team key);
   `satLongerAt({ starts, perGame: shares[x].perGame, g: gW, band })`; `{ n, obsPPG }` from `obsBy` (absent → n 0, obs
   null); `prior = rookiePriorFor(x, 'QB', S, playerIds)`; y1, y2 as Q4. Keep each player's last row's flag as
   `flaggedAtEnd`.
4. **Q5a.** Rows = flagged rows with finite y1, `k = K_DYN_POINTS_ROOKIE0.QB.k`. Arms: d 1.0, d 0.90, LOSO
   (`discountLoso`). `pairedDelta(rows, preds0.90, predsLOSO)` (= vsShipped), `pairedDelta(rows, preds0.90, preds1.0)`
   (= noneVsShipped), `pairedDelta(rows, preds1.0, predsLOSO)`. `decideQ5a`.
5. **Q5b.** Players with `flaggedAtEnd` and S ≤ 2023 and finite y2; one prior-only row each with `prior =
   rookiePriorFor(x, 'QB', S + 1, playerIds)`, `n = 0`, `y = y2`. LOSO d vs d 1.0. `decideQ5b`.
   **Limitation (state it in the verdict):** this is the rookie-path level at `yearsExp` 1. A flagged rookie who played
   enough in S to be veteran-routed at S + 1 (`rookiePathStateAt`) gets the veteran projection as his arm-B prior, in
   `assembleSeason` and in the app, so Q5b over-covers. It is `insufficient` by F7 (6 < 20) either way.
6. **Q5c (report).** Partition the population into flagged-ever / never-flagged: players; players with y1; mean y1/prior
   (players with y1); S+1 primary-passer share = S+1 primary games / max REG team-games in S+1 (`primaryPassers` on
   S+1 gamelogs; S + 1 ≤ 2025 holds for S ≤ 2024, but guard the call the same way), the P6a Q5 measure. `suppressPair` on each two-way row.

### A1.5 Outputs

- **Constants file** (`formatConstantsJson` order unchanged for existing keys; new keys appended):
  - `qbRookieDynasty`: `{ decision, horizon: 'S+1', confirm: 'S+2', players: { y1, y2 }, maeY1: { B0, GS, GC, RC }, labels:
    { y1: {…}, y2: {…}, posterior: {…} }, gate: { qbRatio, otherRatio, diff, ci95, direction }, levels: <GC or RC full
    calibration when chosen, else null>, starterLevelsRef: 'backtests/2026-10-04-qb-rookie-level-constants.json' }`;
  - `qbSatLonger`: `{ decision, discount, band: 1, shippedDiscount: 0.9, players: { flaggedWithY1, flaggedAtEndWithY2 },
    dFull, maeQ5a: { d100, d090, loso }, labels: {…}, persistence: { decision, players, dFull, label } }`.
- **Panel**: `d64`, `q4`, `q5` (aggregates only — D8), plus `meta.qbPrior`/`meta.inSeasonConstants`.
- **Verdict** — new sections, in order: `## D-64 — 2c on the current QB model` (the `diffDynConstants` table; "no change"
  when equal, plus the six Q2 leaves of F2 quoted from the panel), `## Q4 — Rookie QB level in the dynasty prior
  (P12c)` (Q4a table: arm × y1/y2 MAE and Δ labels; Q4b; Q4d; k check; Q4c; the F6 sentence verbatim in substance;
  decision), `## Q5 — Sat-longer discount (D-60)` (definition per F3 incl. its transport notes: week-1 chart team vs
  the app's current team, `draftYear === S` vs `years_exp 0`; P6a Q5's definition and why it differs; Q5a/Q5b/Q5c;
  decisions), `## For wiring` (§7's branch that each decision selects, one line each).

### A1.6 Tests (`test/inseason-dyn.test.mjs`)

- Existing calls: add `qbPrior: 'legacy'` to every `runInSeasonDyn(` (8) and `inSeasonDynMain(` (3: `:561`, `:564`, `:572`) call — they test
  2c routing/ladders/CLI on stub loads, which carry no takeover constants. Nothing else in them changes.
- New: `runInSeasonDyn` throws on missing and on unknown `qbPrior` (message match), **before** reading any loader (use a
  load whose every function throws).
- New: `pinnedSourceOf('legacy') === 'backtests/2026-09-26-inseason-constants.json @ a071bdb324976203ed915e14a57b88fb740fb0b6'`;
  `INSEASON_DYN_LOAD.loadInSeasonConstants` is called with the run's `qbPrior` (spy load) and the reuse `source`
  follows it (a legacy stub run's reuse sources all equal `pinnedSourceOf('legacy')`).
- New, pure (`lib/inSeasonEvidence.mjs`): `satLongerAt` residual −0.9 / −1.0 / −1.2 → false/false/true and a `perGame`
  shorter than g (missing slots count 0); `fitDiscount` recovers d = 0.80 on n = 0 rows with y = 0.8·prior, the tie rule,
  grid bounds; `discountLoso` — two seasons with true d 0.6 and 1.0: season A's held-out pred uses d fitted on B only, an
  empty training fold gives 1.0 and is counted; `calibrateGroup` level/ratio values, the S-exclusion, the fallback below
  the floor; `fullCalibration` nulls a thin group; `ratioDiffBootstrap` direction on a clear above / below / straddle
  fixture and determinism under the seed; `decideQ4` — insufficient, keep, lowest-MAE pick among two eligible, y2-WORSE
  ineligible, posterior-WORSE ineligible, gate failure → `keep-not-qb-specific` (raising candidate, straddling CI) and gate
  pass; `decideQ5a` — insufficient, fitted, fitted-rounds-to-0.90 → keep, drop, keep; `decideQ5b` — insufficient, extend,
  stops-at-ye1; `diffDynConstants` ignores reuse `source` and catches a changed k.
- New: a disclosure test — run the pure Q5 aggregate builder (§A1.4 steps 4–6 factored as a pure function over
  pre-built rows) on a synthetic population with recognisable ids (`'qx1'`…) and assert `JSON.stringify(result)`
  contains none of them, and a two-player cell is `null`.

### A1.7 Docs (data)

- README → Module notes, `### In-season dynasty-side k-fit`: one paragraph on `qbPrior` (required; CLI `starter`; the
  2a file pairing; `legacy` reproduces 2026-09-27), Q4 and Q5 (definitions, floors, decisions, aggregate-only output).
  Amend the end of the `**QB prior (qb-inseason-refit).**` paragraph (`:2000`), whose last sentence says the dyn harness
  holds `legacy`.
- `bin/backtest.mjs` header (`:48-51`): add "the rookie QB level in the dynasty prior (Q4) and the sat-longer discount
  (Q5); runs on the starter QB prior".
- No CLAUDE.md edit (D1). No `data-catalog.md` change (no served family).

### A1.8 Gates before committing A1

`npm test` (record count; only the additions above change it), `npm run smoke`. Commit A1 with both task files.

---

## 4. Stage A2 — the run (one commit)

`node bin/backtest.mjs --inseason --dynasty --write` → `backtests/<date>-inseason-dyn-{panel,constants}.json`,
`grading/<date>-inseason-dyn-verdict.md`. Commit the three artifacts alone. If any V gate below fails, stop and report;
do not commit A2.

---

## 5. Verification gates (Session 2 records results here; Session 1 re-runs them)

- **V-0** `npm test` count before/after; `npm run smoke` green.
- **V-1 (legacy reproduces).** `runInSeasonDyn({ qbPrior: 'legacy' })` deep-equals `2026-09-27-inseason-dyn-constants.json`
  on every key that file has (ignoring `source`, `generatedAt`, and `fit.qbPrior`/`fit.inSeasonConstants`) and the
  committed panel's `q1`/`q2`/`q3`; `q4`/`q5` are null.
- **V-2 (D-64 attribution).** The A2 constants file equals 2026-09-27 on the same keys, except every reuse `source` is
  `pinnedSourceOf('starter')`. The panel's `q1`/`q2` also carry `reuse` maps: ignoring every `reuse.*.source` leaf (each
  must equal `pinnedSourceOf('starter')`), `q2` differs from 2026-09-27 in exactly the six leaves of F2, and `q1`, `q3`
  are equal.
  `d64.equal === true`.
- **V-3 (Q4 population).** F5's table, exactly: 188 rookies, y1 62 / y2 38 players; groups as tabled; posterior rows 494 / 48
  players (F8).
- **V-4 (Q5 population).** 89 backups; 31 flagged-ever; 13 flagged with y1 (66 rows); 25 flagged at end, 6 with y2.
- **V-5 (disclosure).** Scratch script, not committed: walk the whole A2 panel and constants JSON (every key and every
  string value) and the verdict's backtick- or quote-delimited tokens for exact matches of every sleeper id in the Q4 and
  Q5 populations. Zero matches. Never a bare substring `grep`: ids are 3–5 digits and match inside decimals.

---

## 6. Verification and push

Session 1 runs implementation-reviewer on A1..A2, re-runs V-1…V-5, then: `git pull --rebase origin main`, `git push origin
main` (data only — nothing served changes, no CDN purge). Then Anton reads the verdict.

---

## 7. Wiring branches (for the post-verdict Session 1 — not built here)

- **Always (W0):** registry edits in the companion (§A), app first, data byte copy; app backlog: D-64 resolved (cite A1/A2),
  D-60 resolved or re-scoped per Q5; app re-pins `IN_SEASON_DYN_PANEL_SOURCE` + fixture to the A2 panel by byte copy
  (`K_DYN_PROSPECT_A_YE1` must re-derive unchanged — F2), so the provenance names the current QB model.
- **Q5 `insufficient`/`keep`:** `qbTakeoverConstants.js:58` and `inSeasonScoring.js:355,509` keep 0.90 with the
  `PROVISIONAL(heuristic)` basis re-cited to the A2 verdict ("Q5 replication n = 13, insufficient"); no score moves.
  **`fitted`/`drop`:** pin the value from `qbSatLonger.discount` with a constants fixture; dynasty scores of flagged rookie
  QBs move (no `projectedPPG` change → no `PRIOR_MODEL_FROM` bump). **Q5b `extend`:** a design question first (needs last
  season's flag at `yearsExp` 1).
- **Q4 `keep`/`insufficient`/`keep-not-qb-specific`:** CR-25/CR-27 text only. **`GC`/`RC`/`GS`:** the dynasty prior for
  `yearsExp` 0 QBs with a group takes the pinned level in `buildRookieDynastyPriors` (dynasty-only scope keeps
  `projectedPPG` and the 2a k untouched); whether `projectedPPG` follows is Anton's call (F6) — if yes, that is a CR-15
  rookie-mirror model, a `PRIOR_MODEL_FROM` bump, an anchor-policy boundary and a 2a `--inseason` re-fit of
  `K_*_ROOKIE0`, a slice of its own. Either way `K_DYN_POINTS_ROOKIE0` gets the k check of Q4b step 5 re-run as a fit.

---

## Cross-repo impact

Touched entries: **CR-08** (a new direct schedule read for `coverageFor`), **CR-15** (its data side says the dyn harness
holds the legacy QB prior, which stops being true; Q5 calls `reconstructQbPreseasonShares`, Q4d calls `rookiePriorFor` for
all four positions), **CR-09** (a new analytical read of gamelogs primary passers in `scripts/inseason-dyn-run.mjs`), **CR-16**
(that read joins era-coded primaries to schedule/depth teams), **CR-25** (the 2c harness's QB prior, its 2a file, Q4/Q5),
**CR-27** (`QB_SAT_LONGER_*` gain a data-side replication; the P12a level file gains a reader). All six `Mirror` texts are
quoted verbatim in the companion §M; the exact edits are drafted in companion §A and applied in the wiring stage (app first,
then the data byte copy, same day). Stage A changes no app file and no served shape. Signal registry: no row changes in Stage
A (CR-18: no new served signal); the wiring stage re-checks `docs/signal-registry.md` rows for the dynasty prospect prior.

## Out of scope

YE1 rookie priors (D3); KTC/college in the dynasty prior (F6); the position-wide survivor pessimism of arm B (2c's c — a
re-fit of every rookie k, its own slice); D-54/D-55/D-56; L6 (projected games).

## Gate results (Session 2, 2026-10-07)

Stage A1 = `02642a0`; A2 = the commit after it (three artifacts `backtests/2026-10-07-inseason-dyn-{panel,constants}.json`,
`grading/2026-10-07-inseason-dyn-verdict.md`). Checks ran on the committed A2 files; V-1 on a fresh `runInSeasonDyn({ qbPrior: 'legacy' })`.

- **V-0** `npm test`: before 1365 tests / 1361 pass / 4 skipped / 0 fail; after 1388 / 1384 / 4 / 0 (+23 tests, all in
  `test/inseason-dyn.test.mjs`). `npm run smoke` exit 0. CLAUDE.md size test green (no edit).
- **V-1** PASS. The legacy run deep-equals `2026-09-27-inseason-dyn-constants.json` on every key (including `fixture`;
  ignoring `source`, `generatedAt`, `fit.qbPrior`, `fit.inSeasonConstants`, and each reuse `source`, which equals
  `pinnedSourceOf('legacy')`), and the committed panel's `q1`/`q2`/`q3` leaf for leaf; `q4`/`q5` are `null`.
- **V-2** PASS. A2 constants file equals 2026-09-27 on the same keys (all 12 reuse `source` = `pinnedSourceOf('starter')`);
  `d64.equal === true`, 0 changed. Panel: all 12 reuse `source` leaves in `q1`/`q2` equal `pinnedSourceOf('starter')`;
  `q1`, `q3` 0 differing leaves; `q2` exactly the six F2 leaves (`pooled.Proj.delta.mean` 0.0241 → 0.023 and its ci95,
  `pooled.deltaHP.mean` −0.085 → −0.0833 and its ci95, and the two `decision.deltaHP` copies).
- **V-3** PASS. 188 rookies; S+1 62 / S+2 38 players; top12 30/26/29/21, r1 8/5/7/2, day2 22/9/9/7, day3+ 128/11/17/8
  (rookies/y0/y1/y2); posterior 494 rows / 48 players. No rookie excluded for group or prior.
- **V-4** PASS. 89 backups (roles seen among chart rookies: 89 backup, 18 incumbent, 1 no-chart); 31 flagged ever;
  13 flagged with an S+1 PPG (66 checkpoint rows); 25 flagged at the last checkpoint, 6 of them with an S+2 PPG.
- **V-5** PASS with a note. Exact walk of every key and string value in the A2 panel and constants, plus the verdict's
  backtick/quote-delimited tokens and table cells, against all 1,792 sleeper ids of 2014–2024 rookie QB/RB/WR/TE (a superset of
  the Q4 and Q5 populations). 8 matches, all the **season-year keys** `2019/2023/2024/2025` under the pre-existing
  `panel.reconciliation.{absentFromGamelogs,unmapped}` — four-digit sleeper ids that coincide with calendar years, not
  player references. Zero matches in `q4`, `q5`, `constants.qbRookieDynasty`, `constants.qbSatLonger` or the verdict.

**Verdicts (for Anton):** Q4 `keep` — GS/GC/RC all NO-GAIN vs B0 on S+1 (MAE 4.455 → 3.960 / 4.108 / 4.318), S+2 and the
posterior; the position gate reads QB 1.124 vs other positions 1.101 (diff 0.023, CI [−0.092, 0.143], not above 0), so
the arm-B pessimism is position-wide (2c's c), not QB-specific. Q5a `insufficient` (13 < 20 players; 0.90 stays; the data
lean the other way — d = 1.0 BEATS 0.90 and dFull 1.09 — but under the floor); Q5b `insufficient` (6 < 20).

## Review record

**Plan gate 2026-10-07** — data plan-reviewer, full depth. It ran as a general-purpose agent carrying the mandate in
`.claude/agents/plan-reviewer.md`; the first attempt hit a rate limit.

What the reviewer confirmed:
- F5 and F7 reproduce exactly.
- Every reused helper's signature and every line anchor matches live source.
- `npm test`: 1361 pass, 0 fail.
- §M matches the live registry byte for byte.

It raised ten flags. All ten were verified against live source and applied:
1. V-2 ignored reuse `source` only in the constants file, but the panel's `q1`/`q2` carry reuse maps too. V-2 now
   ignores `reuse.*.source` in the panel as well, and asserts the value of each one.
2. There are three `inSeasonDynMain(` calls, not two, and `:564` would reach `loadQbChainModels` on the stub. All three
   now pass `legacy`.
3. The `ratioDiffBootstrap` spec contradicted itself. It now returns `direction` only.
4. The Q5 rules ignored d > 1. A fitted d ≥ 1.00 now maps to `drop`, and `extend` needs dFull < 1.
5. Q5b's prior is wrong for rookies who are veteran-routed at S + 1. Stated as a limitation; Q5b is `insufficient`
   either way.
6. A bare `grep` in V-5 would match inside decimals. V-5 now does an exact JSON walk over every output, Q4 ids included.
7. `nullify` keeps counts, and Q4c has more than two roles. Counts are published; means, MAE and ratios over fewer than
   3 players are suppressed; Q4c publishes no totals.
8. `guardLoad` throws above 2025 rather than returning null. The season bound is now checked before the call.
9. CR-15's data side would go stale. The edit is drafted in companion §A.7 (W0), with the Mirror in §M.
10. The plan added a direct schedule read (CR-08). Team weeks now reuse `env.scheduleIdx`; the remaining `coverageFor`
    read is registered in companion §A.6, with the Mirror in §M.
