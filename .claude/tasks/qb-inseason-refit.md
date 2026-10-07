# L3 · QB in-season re-fit (D-59) — `qb-inseason-refit`

**Plan item:** `future_plans/in-season-notes-plan.md` → Leftovers round → L3 (app backlog D-59), plus the
stale line anchors in CR-04/05/12/13 (L2 sign-off, 2026-10-05). **Session type:** parent-folder (both repos;
the plan names L3 a parent-folder slice). **Session 1:** 2026-10-05, opus. **Bases:** data `4f469cc`, app
`d627562` (both clean, pushed). **Companion:** `qb-inseason-refit-registry.md` (same folder) — the exact
registry edits, the verbatim `Mirror` texts, and the signal-registry row edit.

Three stages, each verified before the next: **A** (data: mirror + re-fit) → verify → push data → **B** (app:
re-pin + registry) → **C** (data: registry byte copy) → verify → push app, then data, same day.

---

## 0. What this slice does

Since P6b (QB start share, boundary 5) and P12b (rookie QB starter level, boundary 6) the app's QB `K_*` are
stale: `PRIOR_MODEL_FROM` was bumped, but nothing was re-fitted. This slice:

1. Mirrors both mechanisms into the data repo's reconstruction as **new models, never overwrites** (CR-15):
   the QB depth step (`lib/projectionFactors.mjs`, model `qb-takeover`), the preseason start share
   (`reconstructQbPreseasonShares`, same file), and the rookie QB starter level (`lib/rookieMirror.mjs`, model
   `rookie-qb-level`).
2. Re-runs `bin/backtest.mjs --inseason` with the QB prior the app actually blends from, and adds the starts-based
   QB arm (Q9, report-only) and the `buildConstants` pin-write test D-59 also carries.
3. Re-pins the app's k from the new constants file with a byte-identical provenance fixture (CR-25).
4. Updates registry entries CR-15/25/27 and refreshes the stale anchors in CR-04/05/12/13, in both repos.

No projection output changes in either repo: `projectedPPG`/`projectedGames` are untouched, so
`PRIOR_MODEL_FROM` stays `'2026-10-06'`. Only the in-season posteriors move (by whatever the re-fit moves).

---

## 1. Facts established in planning (read-only, reproduced)

- **F1 — the harness reproduces its pins today.** A read-only `runInSeason({})` at data `4f469cc` (44 s)
  reproduces `backtests/2026-09-26-inseason-constants.json` exactly: all 46 entries (`k`, `kFit`, `rows`,
  `basis`) and the whole `fixture`. `runInSeasonDyn({})` (23 s) reproduces
  `backtests/2026-09-27-inseason-dyn-constants.json` exactly (every key but `source`/`generatedAt`). The only
  input change since `a071bdb` is `nflverse/playerids.json` (`46d3e42`), which moved nothing. **So every
  difference in the new run is attributable to the QB change** — V-1/V-2 below re-assert this after the code lands.
- **F2 — every app QB posterior blends from the starter prior, never the share-weighted `projectedPPG` — with one
  exception (plan gate flag 1).**
  `src/utils/inSeasonScoring.js` `buildScoringPosteriors`: `starterPrior` = frozen `starterPPG` → live
  `factors.qbStarterPPG` → `projPrior` (`:216-228`); a start-chain QB blends `starterPrior` over his starts
  (`:234-245`); a non-chain QB's `nonStartPrior` is `starterPrior` on a `chain` row and `projPrior` (=
  `qbStarterPPG`, since only `chain` rows are share-weighted) otherwise (`:247-253`); a preseason-`chain` QB with
  no live state gets no record (`:231`); a QB's `next` projection prior is `starterPrior` (`:269`). **Exception:**
  `starterPrior` ≠ `projPrior` only for a `yearsExp` 0 QB with capital (`:217-218`). Such a rookie who is his team's
  game-1 primary passer and incumbent is `kind: 'original'` (`:483`), gets no `startState`, and his ROS prior is
  `projPrior` = the ceiled level (`seasonProjection.js:494`). Every other rookie QB with a live state is on the
  start chain and blends from the group level.
- **F3 — the app's veteran QB depth factor reduces to one rule on a D5 chart.** `seasonProjection.js:935-943`:
  stale → 1.00; a takeover `backup` → 1.00; order 1 → 1.05; any other QB → 1.00. A `backup` at order 1 needs a
  tie at order 1 (`qbTakeover.js:143`), which `depthOrderIndex` cannot produce (one index per array slot). So on
  D5: **QB ×1.05 iff order 1 and not stale, else ×1.00**; non-QB rows are unchanged. The rookie path has no
  depth factor in either repo.
- **F4 — exact parity against the two boundary captures is achievable** (scratch script, read-only):
  - depth: every veteran QB row (QB set = ids whose `qbTakeoverBasis` ≠ `'none'` in `snapshots/2026-10-04.json`;
    58 veteran rows in each capture) matches `legacy` on `2026-10-03.json` (orders: 28 × 1.05, 7 × 0.88, 3 null ×
    1.00, 20 stale × 1.00) and `qb-takeover` on `2026-10-04.json`, 58/58 each, using the captured
    `depthChartOrder` and `factors.depthStale` as the stale input;
  - share: all 54 `chain` rows of `2026-10-04.json` (10 veteran, 44 rookie-path) reproduce `qbStartShare` to 4 dp
    with incumbent = smallest id at captured order 1 per `nfl_team`, `dp` from `depthChartOrder`, `rk` read from
    the capture (`confidence === 'rookie'` and `factors.rookieGamesBasis` ending `|0` — three undrafted 2026
    rookies have no `playerids` entry, so the crosswalk cannot supply it), and `iq` from 2025 season-totals
    rescored with `calculateFantasyPoints(stats, snapshot.scoringSettings)` / `gamesPlayed` (gp ≥ 4). Under
    half-PPR `iq`, 52/54 agree (two LAC rows cross the strong cut). Basis counts: veteran `stale` 20,
    `incumbent` 28, `chain` 10; rookie-path `chain` 44, `incumbent` 4.
- **F5 — `K_DYN_POINTS_ROOKIE0` has two app consumers with two different QB priors.** `buildProspectLevel`
  (the dynasty score) blends it over `buildRookieDynastyPriors` — the ceiled rookie-path level, no takeover
  input; `buildScoringPosteriors`' rookie `next` record (snapshot-only; no `src/` renderer reads `inSeason.next`)
  blends it over `starterPrior`, which for a `yearsExp` 0 QB with capital is the pinned group level. The entry
  is a pooled-across-positions cell (all four positions pin `K_DYN_POINTS_ROOKIE0|ALL`).
- **F6 — rookie rows enter only Q4.** `classifyArm`: rookie route → `X-rookie0`/`X-rookie1p`; Q1–Q3, Q5–Q8 and
  the S+2 fit read `popP` (arm `P`, veterans only). So a rookie-only prior split touches Q4 cells alone.
- **F7 — two other harnesses read this prior and must not move.** `scripts/inseason-dyn-run.mjs:111` reads
  `row.pointsPrior` as its arm-B projection prior (via `assembleSeason`); `scripts/qb-rookie-level-run.mjs:192,220`
  reads `rookiePriorFor` as its ktc-neutral comparator. Both committed verdicts depend on the legacy values.
- **F8 — QB rows the change can reach in the fit:** arm `P` needs S−1 gp ≥ 8, so most QB2s there are
  `depthStale` (gamesStarted ≥ 8) and already ×1.00; the affected veteran rows sit mostly in `X-short`, a pooled
  cell. `yearsExp` 0 rookie QBs reach `X-rookie0` (pooled for QB/RB/TE on the ROS horizon). The QB k may
  therefore move little or not at all — D3 re-pins regardless.

---

## 2. Decisions (Session 1)

- **D1 — the QB prior in the k-fit is the starter level.** Veteran QB: `predictFullPipeline(row).predicted`
  under depth model `qb-takeover` (no share). Rookie QB: the pinned group level (`yearsExp` 0 with capital) **only when he was not his team's game-1
  primary passer** (the app's non-`original` rookie); a game-1 starter, and every rookie without a group, keeps the
  ceiled level. Reason: F2 and its exception.
  The share is mirrored and reported (coverage, parity) but never enters a fitted prior.
- **D2 — the next-season horizon keeps the arm-B rookie prior.** Rows carry `pointsPrior` (ROS) and
  `pointsPriorNext`; they differ only on a `yearsExp` 0 QB rookie row with a group, where `pointsPriorNext` is
  the ceiled level. `SPEC.pointsNext.prior` reads `pointsPriorNext`. Reason: F5 — the dynasty update is the
  consequential consumer of `K_DYN_POINTS_ROOKIE0`, and the 2c verdict reused that k on exactly this prior. The
  residual (a `yearsExp` 0 QB's snapshot-only `next` record blends a prior that k was not fitted on) is stated in
  CR-25, not fixed. Veteran rows: `pointsPriorNext === pointsPrior` (app `next` for SHORT-stale uses
  `starterPrior` too).
- **D3 — re-pin even if no k moves.** The fixture then documents that the k were fitted on the current model and
  closes CR-25's carve-outs (Anton's L3 wording: "re-pin the app constants with a provenance fixture"; it
  supersedes D-59's "the app re-pins only if a QB k moves").
- **D4 — versioned like Step 4.** `DEPTH_MODELS = ['legacy', 'qb-takeover']`, `CURRENT_DEPTH_MODEL =
  'qb-takeover'` (the harness default, as CR-15's Mirror says); `ROOKIE_QB_MODELS = ['legacy',
  'rookie-qb-level']`, `CURRENT_ROOKIE_QB_MODEL = 'rookie-qb-level'`. The in-season harness takes one switch,
  `qbPrior` ∈ `QB_PRIOR_MODELS = ['legacy', 'starter']`; `assembleSeason` **requires** it (throws when absent
  or unknown — like `resolveRegressionBucket`'s required model) so no caller inherits a QB prior silently.
  `runInSeason` passes `'starter'` by default; `runInSeasonDyn` passes `'legacy'` (F7; re-fitting 2c on the new
  QB priors belongs to L4/P12c → backlog D-64). `rookiePriorFor` keeps its exact behaviour.
- **D5 — Q9 (starts arm) is report-only.** It measures the population the app applies the QB ROS k to with
  n = starts (non-original QBs); it pins nothing and adds no app constant. Its result fills CR-25's carve-out.
- **D6 — no CLAUDE.md edits in the data repo** (24,897 of 25,000 bytes); per-file detail goes to README →
  Module notes.

---

## 3. Stage A1 — data code (one commit)

All paths relative to `sleeper-dashboard-data/`. Run `npm test` before touching anything and record the
pass count.

### A1.1 `lib/projectionFactors.mjs`

- Import `expectedStarts`, `dpCode`, `iqCode` from `./qbTakeover.mjs` (no cycle: it imports
  `inSeasonEvidence.mjs`/`nflverse.mjs` only; `test/rookie-mirror.test.mjs` T-RM1 Assert 1 must stay green —
  `lib/rookieMirror.mjs` stays unreachable from the fit closure).
- `export const DEPTH_MODELS = Object.freeze(['legacy', 'qb-takeover']);` and
  `export const CURRENT_DEPTH_MODEL = 'qb-takeover';` next to the regression-model constants.
- `reconstructDepthFactor(depthOrder, recentStarterEvidence, { position = null, model = CURRENT_DEPTH_MODEL } = {})`
  — unknown `model` throws (`[projectionFactors] unknown depth model …`). `model === 'qb-takeover' &&
  position === 'QB'`: stale (order ≥ 2 and evidence) → 1.00; order 1 → 1.05; else 1.00. Every other case: the
  current body unchanged. Update the comment block above it (`:490-501`) to describe both models and F3's
  no-tie argument. Existing two-argument callers keep the legacy values (position `null`).
- `export function pinnedQbChainModels(file)` → `{ hazard: { keys, coef }, stick: { keys, coef }, source }`
  from a `--qb-takeover` constants file (`keys` = `file.hazard.features` / `file.stickiness.features`,
  `source` = `file.source`). Throws when a hazard feature is outside `['dp', 'og', 'rk', 'iq', 'ps', 'bn', 'wk']`
  or a stick feature outside `['st', 'dq']` — the features this mirror plus `expectedStarts` build (the app's
  `inSeasonScoring.js:22-27` guard, same intent: refuse a pin that adds an unbuilt feature).
- `export function reconstructQbPreseasonShares({ qbs, priorOf, models, games = 17 })` — a verbatim port of the
  app's `buildPreseasonQbShares` (`src/utils/qbTakeover.js:129-172`) over plain inputs:
  - `qbs`: `[{ id, team, order, rookie }]` (`order` = 1-based depth order or `null`; `rookie` boolean);
  - `team` null or `'FA'` → `{ role: 'no-team', team, incumbentId: null }`;
  - per team: order-1 ids sorted by string compare; none → every QB `{ role: 'no-chart', … }`; else incumbent =
    first; `incPrior` = `priorOf(incumbentId)`; median over all teams' non-null `incPrior` (even count → mean of
    the middle two, as `qbTakeover.js` `medianOf`);
  - incumbent → `{ role: 'incumbent', team, incumbentId }`; every other QB → `codes = { dp: dpCode(order),
    og: 0, rk: rookie ? 1 : 0, iq: iqCode(incPrior, median) }`, `r = expectedStarts({ hazard: models.hazard,
    stick: models.stick, start: { role: 'B', ps: 0, c: 0, g: 1, hazardCodes: codes, stickCodes: {} },
    remaining: games })`, `{ role: 'backup', team, incumbentId, codes, share: r.fraction, perGame: r.perGame,
    games }`.
  - `priorOf` is the caller's: half-PPR S−1 `priorPPG` in history, league-rescored in the parity test (F4).
- Add the three new functions to the module's export comment; `FACTOR_RECONSTRUCTORS.depth` stays as is.

### A1.2 `lib/panel.mjs`, `scripts/panel-run.mjs`

- `attachFactorMultipliers` ctx gains `depthModel = CURRENT_DEPTH_MODEL` (import it with `DEPTH_MODELS`);
  unknown → throw like `regressionModel` (`:1146`). Step 8 (`:1497`) becomes
  `reconstructDepthFactor(depthOrder, recentStarterEvidence, { position, model: depthModel })`.
  `fitCoverage.depthModel = depthModel` next to `regressionModel`. Extend the seam comment (`:1140-1143`).
- `buildFactorContext(inputs, { …, depthModel = CURRENT_DEPTH_MODEL, … })` returns it in the ctx.
- Thread `depthModel` exactly as `regressionModel` is threaded (data plan gate flag 2): `assemblePanel`
  (`:245`, `:263`, stamp `meta.depthModel` beside `:283`), `runFit` (`:984-1046`), `runFullPipeline`
  (`:1328-1357`), and `bin/panel.mjs` gains `--depth-model legacy|qb-takeover` (same validation and
  `--fit`/`--fullpipeline`-only rule as `--regression-model`, `:23`, `:136-147`, `:170`, `:191`). The help line
  says `legacy` reproduces artifacts committed before this flag. Extend the regressionModel stamp tests in
  `test/panel-integration.test.mjs` (`:535-607`) with `depthModel`.
- If a pre-existing test reds **only** because a QB fixture row at order ≥ 2 now gets 1.00: if the test's subject
  is not the depth step, pass `depthModel: 'legacy'` in that test's ctx; never change an expected number. List
  every such test in the hand-back. Any other red: stop and report.

### A1.3 `lib/rookieMirror.mjs`

- `export const QB_ROOKIE_STARTER_PPG = { top12: 15.801, r1: 14.355, day2: 13.303, 'day3+': 12.341 };` with a
  source comment (`backtests/2026-10-04-qb-rookie-level-constants.json` `starterPPG.*.value` @ `a443ea7`; app
  `seasonProjection.js:75-81`).
- `export const ROOKIE_QB_MODELS = Object.freeze(['legacy', 'rookie-qb-level']);`,
  `export const CURRENT_ROOKIE_QB_MODEL = 'rookie-qb-level';`.
- `export function resolveRookieQbStarterLevel({ position, yearsExp, draftCapitalStatus, draftRound, draftPick })`
  — verbatim port of `seasonProjection.js:341-354` with `basisScale` fixed at 1 (half-PPR) and `draftPick`
  within-round (equal to the app's overall pick in round 1, the only round whose pick is read — CR-27).
- `reconstructShippedRookieProjection({ …, rookieQbModel = CURRENT_ROOKIE_QB_MODEL })` (unknown → throw) gains
  **additive** output fields only: `qbStarterPPG` (non-QB `null`; QB: `legacy` → `ceiledPPG`; `rookie-qb-level`
  → the group level if one resolves, else `ceiledPPG` — unrounded, like the app's internal value),
  `qbStarterBasis` (`null` / `'projection'` / `'rookie:<group>'`), `rookieQbGroup` (the resolved group under
  `rookie-qb-level`; **always `null` under `legacy`**). `projectedPPG`,
  `projectedTotalPts`, `projectedGames` and `appliedCorrections` are unchanged (the level is not a correction
  of `projectedPPG`; `ROOKIE_CORRECTIONS` stays three tokens).

### A1.4 `scripts/inseason-run.mjs`

- `export const QB_PRIOR_MODELS = Object.freeze(['legacy', 'starter']);`
- `export function rookieRecordFor(pid, position, S, playerIds, { rookieQbModel })` — the body of today's
  `rookiePriorFor` returning the whole mirror output; `rookiePriorFor(pid, position, S, playerIds)` becomes
  `rookieRecordFor(…, { rookieQbModel: 'legacy' }).projectedPPG` (identical values; F7).
- `assembleSeason(S, env)`: `env.qbPrior` must be in `QB_PRIOR_MODELS`, else throw
  `[inseason] assembleSeason needs env.qbPrior (legacy|starter)`. Map: `legacy` → `depthModel: 'legacy'`,
  `rookieQbModel: 'legacy'`; `starter` → `'qb-takeover'`, `'rookie-qb-level'`. Pass `depthModel` to
  `buildFactorContext` (so arm P and the Q7 arm-L re-runs both use it).
- Rookie prior: `rec = rookieRecordFor(pid, position, S, playerIds, { rookieQbModel })`; `pointsPrior =
  rec.qbStarterBasis?.startsWith('rookie:') && !isGame1Primary(pid) ? rec.qbStarterPPG : rec.projectedPPG`, where
  `isGame1Primary` uses the same primaries / first-team-game rule as Q9 below (compute `primaryPassers` once per
  season and share it; the app's injured-original edge case is not reproducible from history — state it). Run
  `coverageFor(schedule, primaries)` (`lib/qbTakeover.mjs`) per season under `qbPrior: 'starter'` and throw below
  `QB_TAKEOVER_DEFAULTS.coverageMin` (0.99), as `qb-takeover-run.mjs:231` does — a missing primary must never
  silently make a rookie non-original or drop Q9 starts; record the per-season coverage in `coverage.qbStart`; `pointsPriorNext = rec.projectedPPG` (D2).
  Only a group-level row may differ from today's value: a rookie QB without a group keeps the **rounded**
  `projectedPPG` (the unrounded `qbStarterPPG` would shift every rookie-path QB row by up to 0.05 and move
  `X-rookie1p`), and under `legacy` no group resolves, so the legacy run stays byte-identical (V-1).
- Veteran rows: `pointsPriorNext = pointsPrior`. Add `pointsPriorNext` to each checkpoint row (next to
  `pointsPrior`) and to `playerSeasons`. `SPEC.pointsNext.prior` → `'pointsPriorNext'`. Nothing else switches
  (F6).
- Share coverage (report-only): per S, build `qbs` from the week-1 chart (`depthFile.weeks[1][T].QB`,
  `order = i + 1`, null slots skipped as `depthOrderIndex` does), `rookie = playerIds.bySleeper[pid]?.draftYear
  === S`, `priorOf = (pid) => priorPPG(totalsByYear[S - 1]?.[pid])` (`lib/qbTakeover.mjs`, half-PPR), models
  from `env.qbChainModels`. Record per season `{ teams, incumbent, chain, stale, noChart, medianChainShare }`
  where a veteran backup with `depthStale` counts as `stale` (the app's basis), into `coverage.qbStart`. Only
  under `qbPrior: 'starter'`; `env.qbChainModels` is loaded once in `runInSeason`, **after `runReconciliation`**
  (two existing tests, `test/inseason.test.mjs:436-438` and `:452-455`, call `runInSeason` with stub loads and
  assert earlier errors), throwing `[inseason] qbPrior 'starter' needs load.loadQbTakeoverConstants` when the
  loader is absent, from
  `backtests/2026-10-03-qb-takeover-constants.json` through `load.loadQbTakeoverConstants` (add to
  `INSEASON_LOAD`; injectable like the other loaders).
- **Q9 — starts arm (report-only).** `export function startsArmRows({ S, gamelogsFile, scheduleIdx, totalsS,
  priorRows, checkpoints, minRosGames })` → rows `{ sleeperId, S, W, n, position: 'QB', arm, pointsPrior,
  startObs, startRos }`:
  - `primaries = primaryPassers(gamelogsFile, S)` (`lib/qbTakeover.mjs`; keys `${eraTeam(team, S)}|${week}`);
  - a QB player-season is in the population iff it has a finite `pointsPrior` and is **not** the primary passer
    of his team's first REG game (team = `eraTeam` of his first REG gamelog game; first game = min week in
    `scheduleIdx(S).get(team)`) — the app's non-`original` QB;
  - his starts = his REG gamelog weeks `w` with `primaries.get(`${eraTeam(g.team, S)}|${w}`)?.pid === pid`,
    points = `totalsS[pid].weeklyPoints[w]` (count and skip a missing week as `missingPoints`);
  - per checkpoint W with ≥ 1 start through W: `n` = starts ≤ W, `startObs` = their mean, `startRos` = mean over
    starts > W when there are ≥ `minRosGames` of them, else `null`.
  `runQ9` (after `buildConstants`): `runCell(store, 'q9|QB', rows, { prior: 'pointsPrior', obs: 'startObs',
  outcome: 'startRos' }, { studyK: (r) => <this run's pinned k for r.arm: P → K_ROS_POINTS.QB, X-short →
  K_ROS_POINTS_SHORT.QB, X-rookie0 → K_ROS_POINTS_ROOKIE0.QB, X-rookie1p → K_ROS_POINTS_ROOKIE1P.QB> })`;
  `result.q9 = { ...slimCell(a), population: { playerSeasons, rows, byArm }, excluded: { missingPoints, noSchedule } }`.
  Q9 never enters `constants`/`fixture`. If `runCell`'s per-row `studyK` path does not accept these rows as
  is, stop and report rather than re-plumbing it.
- **`writeQ4Pin` (D-59 / D-49 residual).** Extract buildConstants' Q4 branch body after the decision into
  `export function writeQ4Pin(P, { name, pos, choice, own, pooled, p1, cell })` (writes the `own` or the pooled
  entry exactly as today: `pinDecision`, `fixtureKey`, `note`, `fixture`, `pinnedFrom`,
  `pinnedToPooledUnderNoGainRule`); `buildConstants` calls `decideOwnVsPooled` then `writeQ4Pin`. Pure refactor —
  V-1 proves it.
- `runInSeason({ load, defaults, log, qbPrior = 'starter' })`: `env.qbPrior = qbPrior`; `meta` gains
  `qbPrior`, `depthModel`, `rookieQbModel`; the constants file's `fit` gains
  `qbPrior: { model, ros: '<one sentence: QB rows blend the starter level — depth model qb-takeover, no share; a yearsExp-0 rookie QB with draft capital takes the pinned rookie starter level (half-PPR)>', next: '<one sentence: veterans as ros; rookies keep the ceiled rookie-path level (arm B), the prior the dynasty update blends>' }`
  under `starter` only (under `legacy` the `fit` object is unchanged, so V-1 stays exact).
- Verdict markdown: a one-line summary bullet for Q9, a `## Q9 — QB starts arm (report-only)` section (k,
  CI, rows/players, verdict, Δ vs the pinned k with label, the population definition, `missingPoints`), the
  QB-prior sentence in Limitations (next to the depth-chart sentence at `:1568`), and the `coverage.qbStart`
  table.

### A1.5 `scripts/inseason-dyn-run.mjs`

Set `qbPrior: 'legacy'` in the env it hands `assemble`, with a comment citing D-64, and switch `augmentRow`'s
arm-B prior (`:111`) from `row.pointsPrior` to `row.pointsPriorNext` (identical under `legacy`, so V-2 stays
exact; under a later starter re-run it keeps arm B on the ceiled level, D2). Nothing else.

### A1.6 Tests

New `test/qb-mirror.test.mjs`:
- **T-QB-1** `reconstructDepthFactor` table: both models × {QB, RB, null position} × orders {null, 1, 2, 3, 7} ×
  stale {true, false}; unknown model throws; two-argument call equals `legacy`.
- **T-QB-2** depth parity, F4's definitions: 58 veteran QB rows on `snapshots/2026-10-03.json` under `legacy`
  and 58 on `snapshots/2026-10-04.json` under `qb-takeover`, all equal; pinned counts (10-03: 28 × 1.05,
  7 × 0.88, 23 × 1.00). Fixture presence asserted, never skipped (T-S4-1 precedent).
- **T-QB-3** share parity on `snapshots/2026-10-04.json`, F4's construction (league-rescored `iq`, `rk` from the
  capture): every `chain` row's `qbStartShare` equals `round4(share)` — 54 of 54; every captured `incumbent` is
  the computed incumbent; captured basis vs computed role: `incumbent`↔`incumbent`, `chain`↔`backup`, veteran
  `stale`↔`backup` with `depthStale`. Pinned counts as in F4.
- **T-QB-4** rookie level: `QB_ROOKIE_STARTER_PPG` deep-equals the four `starterPPG.<group>.value` of
  `backtests/2026-10-04-qb-rookie-level-constants.json`; `resolveRookieQbStarterLevel` truth table (undrafted →
  `day3+`; round 1 pick 12/13/null → `top12`/`r1`/none; rounds 2–3 → `day2`; 4–7 → `day3+`; `yearsExp` 1 → none;
  RB → none; `unknown` capital → none); `reconstructShippedRookieProjection` for a matched round-1 pick-3 QB:
  `projectedPPG` identical under both models, `qbStarterPPG` = 15.801 / `qbStarterBasis 'rookie:top12'` under
  `rookie-qb-level`, = unrounded ceiled level / `'projection'` / `rookieQbGroup === null` under `legacy`; RB →
  `null`s; unknown model throws.
  Capture check: every `2026-10-04.json` row with `qbStarterBasis` `'rookie:<g>'` has `qbStarterPPG` ===
  `round3(QB_ROOKIE_STARTER_PPG[g] × rookieBasisScale)` (17 rows, D-62).
- **T-QB-5** `pinnedQbChainModels`: the 2026-10-03 file loads; a synthetic file with hazard feature `dg` throws.

`test/inseason.test.mjs` additions:
- `assembleSeason` throws without `env.qbPrior` and on `'x'` (assert the message; stub `load` enough to reach
  the check, or put the check first in the function).
- `writeQ4Pin`, both branches, on synthetic `own`/`pooled` cells (`verdict: 'OK'`, `kFit: { k }`, `kPin`,
  `ci95`, `rows`, `players`, `statsBySeason` maps — `fixtureFrom`'s input): `choice 'own'` → entry has no
  `fixtureKey`, `basis 'fitted'`, the keep-own note, `fixture['<name>|<pos>']`; `choice 'pooled'` →
  `fixtureKey '<name>|ALL'`, `basis 'pooled'`, the pooled note, `fixture['<name>|ALL']`,
  `cell.pinnedToPooledUnderNoGainRule === true`.
- `startsArmRows` on a two-team, five-week synthetic gamelogs/schedule/totals fixture: an `original` starter is
  excluded; a backup who starts weeks 3–5 yields W=3 (n 1), W=4 (n 2), W=5 (n 3) with the right means and
  `startRos` null below `minRosGames`; a missing weekly point is skipped and counted.
- `rookieRecordFor`/`rookiePriorFor`: `rookiePriorFor` equals `rookieRecordFor(…, legacy).projectedPPG` for a
  QB and an RB.

### A1.7 Docs (data)

- README → Module notes: `lib/projectionFactors.mjs` (depth models, the share mirror and its inputs/stand-ins),
  `lib/rookieMirror.mjs` (rookie QB model), the in-season section (`qbPrior`, `pointsPriorNext`, Q9,
  `coverage.qbStart`, dyn holds `legacy`), and the `attachFactorMultipliers` seam paragraph (`depthModel`).
- `grading/anchor-policy.md` → "QB rows — both paths" and "Rookie QB rows — boundary 6": one line each —
  executable check `test/qb-mirror.test.mjs` T-QB-2/T-QB-3 (boundary 5) and T-QB-4 (boundary 6).

### A1.8 Gates before committing A1

`npm test` green (count vs the pre-change count, new tests listed), `npm run smoke` green, then:
- **V-1 (attribution):** `runInSeason({ qbPrior: 'legacy' })` (scratch script, no write) — its constants file
  minus `source`/`generatedAt` deep-equals `backtests/2026-09-26-inseason-constants.json` minus the same.
  Must be `true`; else stop.
- **V-2 (2c unchanged):** `runInSeasonDyn({})` constants minus `source`/`generatedAt` deep-equal
  `backtests/2026-09-27-inseason-dyn-constants.json`. Must be `true`; else stop.

Commit A1 with this task file and its companion.

---

## 4. Stage A2 — the re-fit (one commit)

`node bin/backtest.mjs --inseason --write` → `backtests/<RUN_DATE>-inseason-{panel,constants}.json`,
`grading/<RUN_DATE>-inseason-verdict.md`, under `ARTIFACT_CAPS`. Then diff the new constants against
`2026-09-26` (scratch, no write) and put the table in the hand-back: every entry with old → new `k`, `kFit`,
`basis`, `rows`.

**Allowed to move** (cells whose rows carry a changed QB prior): `K_ROS_POINTS.QB`, `K_DYN_POINTS.QB`; every
position of `K_ROS_POINTS_ROOKIE0`, `K_ROS_POINTS_SHORT` and `K_DYN_POINTS_SHORT` (QB directly; the others
through the `ALL` cell or the Q4 own-vs-pooled decision that compares against it); and the fixture cells of
exactly those entries. Arms come from `classifyArm`'s `earlierAppearance`, not `yearsExp`, so a `yearsExp` 0 QB
can sit in `X-rookie1p` (e.g. 11376, S = 2024, a gp-0 2023 row): `K_ROS_POINTS_ROOKIE1P` may move **only** if the
hand-back traces it to such rows (list them); otherwise it is a stop.

**Stop and report, commit nothing** if any of: an entry outside that set changes (`K_DYN_POINTS_ROOKIE0`,
`K_DYN_POINTS_ROOKIE1P`, `K_ROS_POINTS_ROOKIE1P`, `K_DYN_POINTS_HISTORY`, `K_ROS_OPP`, `K_DYN_OPP`,
`K_ROS_SHARE` and the non-QB `K_ROS_POINTS`/`K_DYN_POINTS` must be identical — their own rows' priors did not
move; a non-QB `K_ROS_POINTS` could only move through Q7's pooled decision, which the `fit.prior` stop covers); the set of constant names or the entry count (46) changes; `fit.prior` ≠ `'frozen'`; `combination` ≠ `null`; `sortMeasure.name` ≠ `'relative'`;
`verifyConstants` fails.

Commit A2 (artifacts only). **Hand back to Session 1** (SHAs A1, A2; files; deviations; test assertions; V-1,
V-2; the diff table; the Q9 cell; `coverage.qbStart` totals). After verification is clean:
`git pull --rebase origin main`, `git push origin main`; record the **pushed** SHAs (a rebase over cron
commits rewrites them — Stage B pins the pushed A2).

---

## 5. Stage B — app re-pin (one commit, after the data push)

Paths relative to `sleeper-dashboard/`. Precondition: app `HEAD` is `d627562` or later with no change to the
files named in the companion's anchors (re-run the companion's §0 uniqueness check; any miss → stop).

1. `git -C ../sleeper-dashboard-data show <A2>:backtests/<RUN_DATE>-inseason-constants.json >
   src/__fixtures__/inseason-constants-<RUN_DATE>.json` (byte copy; check sha1 equals the data file's);
   `git rm src/__fixtures__/inseason-constants-2026-09-26.json`.
2. `src/utils/inSeasonConstants.js`: header comment (source file/commit; "re-fitted on the boundary-6 model by
   qb-inseason-refit"); `IN_SEASON_CONSTANTS_SOURCE` = `{ file, commit: <A2 full SHA>, generatedAt: <file
   value>, fixture }`; the nine `K_*` set from the file's pinned `k` (whatever they are — never hand-chosen);
   `PRIOR_MODEL_FROM` **unchanged**; in its comment **replace** the clause "…7b5b055, Step 4 up-side removal,
   2026-09-12 22:27 UTC, the model these k were fitted against" so it no longer calls 7b5b055 the fitted model,
   and state that the k were re-fitted against the current (boundary-6) model by qb-inseason-refit.
3. `src/__tests__/inSeasonConstants.test.js`: import + `FIXTURE_PATH`, `FIXTURE_SHA1`, byte length, the
   "byte-identical copy … at <A2 short>" title, the `source` assertion; add
   `expect(file.fit.qbPrior.model).toBe('starter')`. `STUDY_COMPARATOR` must list exactly the file's
   `basis: 'study'` entries, values from the verdict's constants-table comparator column, and its comment
   ("the only four") must state the new count. The Q4 two-branch tests keep their logic but pick their cells
   from the new file: the keep-own test needs a fitted own cell whose own pin ≠ its `ALL` pin (today
   `K_ROS_POINTS_ROOKIE0.WR`); the pooled test needs an entry carrying the pooled-pin note (today
   `K_ROS_POINTS_ROOKIE0.RB` — its own-vs-pooled decision can flip when the `ALL` cell moves). Update literals and,
   if a branch is now taken by a real cell, the comment "No real cell took the keep-own branch (0 of 14)". If no
   cell fits a test, stop.
4. Any other red test: acceptable only where a literal equals a pinned `K_*` that moved — replace the literal
   with the imported constant. Anything else: stop and report.
5. `docs/navigation.md:57` and `docs/nav/utils.md:47`: the fixture filename.
6. `docs/signal-registry.md` row 95 and `docs/cross-repo-registry.md`: exactly the companion's §B and §A edits
   (placeholders `<RUN_DATE>`, `<A1>`, `<A2>` = pushed short SHAs, `<Q9_CLAUSE>` per companion §A.3).
7. `.claude/tasks/data-repo-backlog.md`: strike D-59 (`✅ RESOLVED <date>` — data A1/A2, app B1 filled in a
   follow-up bookkeeping commit as L2 did, the moved-k list, the Q9 one-liner); add **D-64** (companion §C).
8. Done-definition: `npm test`, `npm run lint`, `npm run build`; smoke per `docs/architecture.md` → *Smoke-testing
   the running app* (Market → In-season set): one QB whose cell's k moved shows the posterior at the new k (or,
   if none moved, the page renders with no `NaN`/blank QB rows); stop the preview.

Commit B1. Do not push yet.

## 6. Stage C — data registry byte copy (one commit)

Copy the app span between the sentinels byte-for-byte into `cross-repo-registry.md`. Gate: the span differs
from the pre-copy data span in exactly **19** physical lines (companion §D lists them). Run
`REGISTRY_MIRROR=1 node --test test/registry-mirror.test.mjs` and `node --test test/registry.test.mjs` (every
new data-side symbol must resolve — A1 must be in the tree). Commit C1.

## 7. Verification and push

Hand back B1 + C1 to Session 1 (diffs, test output, smoke note). After clean verification:
app `git pull --rebase` + push, then data `git pull --rebase` + push, **same day** (CR-24's daily run is red
between them). Never `--force`.

---

## Cross-repo impact

Touched: **CR-09** and **CR-16** (a fourth gamelogs primary-passer read and era-key join, in
`scripts/inseason-run.mjs`, behind the 0.99 `coverageFor` stop), **CR-15** (mirror), **CR-25** (re-fit + re-pin), **CR-27** (the mirrors read both pinned QB files),
**CR-18** (signal-registry row 95), **CR-04 / CR-05 / CR-12 / CR-13** (anchor refresh, app side only).
Not touched: CR-01 (no envelope or factors change; the parity test is test-only, like
`test/step4-mirror.test.mjs`), CR-26 (no frozen-prior change), CR-21 (no live-season read; the harness's
`guardLoad` refuses in-progress files as before).

The exact edits and **every touched entry's `Mirror` text verbatim** are in `qb-inseason-refit-registry.md`
§A/§M; the signal-registry row edit (CR-18's deliverable) is §B; the data side of CR-18 needs no
`data-catalog.md` change (no ingest, no family change).

---

## Out of scope

- Re-fitting 2c (`--inseason --dynasty`) on the new QB priors, and the rookie QB level in the dynasty prior —
  L4/P12c (D-64).
- D-60 (sat-longer replication) — L4.
- Pinning a starts-based QB k in the app — Q9 reports only.
- Any projection change; `PRIOR_MODEL_FROM`/`GOLDEN` untouched.
- League-basis re-fit (D-45).

## Review record

**App-side plan gate (2026-10-05, 8 flags) — all verified against live source and applied:**
1. *shape* — rookie game-1 starters (`kind 'original'`) blend from the ceiled level, not the group level
   (`inSeasonScoring.js:217-218,252,483`). Applied: F2 exception, D1, A1.4 `isGame1Primary`.
2. *cross-repo* — E15-7/E25-3/S95-2 said "every QB row". Applied: reworded to the starter prior with the
   game-1-rookie exception.
3. *cross-repo* — E15-5 claimed `chain`-row `projectedPPG`/total points are reproduced; the mirror builds the
   depth factor and the share only. Applied: E15-5 says so; E15-8 keeps an explicit "not composed" hedge.
4. *registry-stale* — CR-25 app Triggers lack `buildScoringPosteriors`. Applied: E25-6 (+1 line).
5. *registry-stale* — CR-04 app Triggers lack `src/api/ktc.js`. Applied: E04-3 (+1 line). Gate 15 → 17.
6. *edge-case* — the Q4 pooled-branch test cell (RB) can flip. Applied: Stage B step 3 generalised.
7. *mechanical* — `PRIOR_MODEL_FROM` comment names 7b5b055 as the fitted model. Applied: replace, not append.
8. *mechanical* — row 95 Coverage cell. Applied: S95-0.

**Data-side plan gate (2026-10-05, retry after a rate-limit failure; 8 flags) — verified and applied:**
1. *mechanical* — `rookieQbGroup` under `legacy` undefined. Applied: always `null` under legacy, selector keyed on
   `qbStarterBasis`, T-QB-4 asserts it.
2. *strategy* — `--fit`/`--fullpipeline` would switch QB depth silently with no way back. Applied: thread
   `depthModel` like `regressionModel` + `--depth-model` flag + meta stamp.
3. *cross-repo* — new gamelogs primary-passer read untracked, no coverage stop. Applied: `coverageFor` ≥ 0.99 stop;
   CR-09 Mirror and CR-16 Data side edits (E09-1, E16-1). Gate 17 → 19.
4. *edge-case* — chain-model load order vs existing stub-load tests. Applied: load after reconciliation, named error.
5. *edge-case* — dyn arm B reads `pointsPrior`. Applied: `pointsPriorNext`.
6. *registry-stale* — CR-27 lacks `dpCode` and the in-season loader. Applied: E27-1/E27-2/E27-3 extended.
7. *cross-repo* — E15-2 prose on `priorPPG`. Applied.
8. *edge-case* — §4 rationale (X-rookie1p reachability, Q7 path, vacuous `sortMeasure.params`). Applied.
