# P12a — Rookie QB starter level (offline backtest)

Session 1 (planning, opus), 2026-10-04, against data `c2e3ce8` and app `692df1e` (read for facts only). Source
plan: parent folder `future_plans/in-season-notes-plan.md` §P12 / §P12a. **Offline analysis only**: no ingest
run, no served-family write, no manifest entry, no app change. The output is pinned constants plus a provenance
fixture and a verdict, consumed later by P12b (the wiring, a separate parent-folder task).

Pattern: P6a (`.claude/tasks/qb-takeover-research.md`) — pure logic in a new `lib/`, adapter in a new
`scripts/`, a new `bin/backtest.mjs` mode, LOSO comparisons, team-free player-cluster bootstrap CIs. Every
rule below is pre-registered; Session 2 applies it **without tuning after seeing results**.

---

## 0. Goal and fixed decisions

**Product question (Anton, P12).** The app's starter level for a rookie QB (`factors.qbStarterPPG`, yearsExp 0)
is too high — Fernando Mendoza (sleeper id `13269`, 2026 #1 pick, LV) at 23.2 PPG against Dak Prescott's 22.9
ROS. Since P6b, ROS for a QB is Σ P(start) × starter PPG, so the starter level must mean **PPG in games he
actually starts**. Measure that from history, by draft group, and compare it with what the app produces.

**How the app builds the level today** (app `src/utils/seasonProjection.js` `rookieProjection`, l.321–451):
`13 (ROOKIE_BASELINE_PPG.QB) × basisScale × clamp(ageMult × ktcMult × collegeContribution × nflDraftMultiplier,
0.45, 1.85) × rookieCalibrationMult`, then the soft ceiling `ROOKIE_CEILING.QB` (knee 17.80, asymptote 21.90,
both × basisScale); `qbStarterPPG = ceiledPPG`. `basisScale` is captured as `factors.rookieBasisScale` (1.114
for QB in this league). The data repo already mirrors this path with `ktcMult` and `collegeContribution` held at
1.0: `rookiePriorFor` (`scripts/inseason-run.mjs:202`) → `reconstructShippedRookieProjection`
(`lib/rookieMirror.mjs`, CR-15). Mendoza's snapshot row: product 1.785 (0.95 age × 1.156 KTC × 1.25 college ×
1.30 draft), just under the 1.85 clamp; 13 × 1.114 × 1.785 = 25.84 = `rookieCeilingPPGPre`, and the **soft
ceiling** (knee 19.83, asymptote 24.40 league) compresses that to 23.2. His ktc-neutral reconstruction is 16.1.

**Probe facts (Session 1, read-only scratch script over the committed store, 2013–2025, P6a `primaryPassers`):**

| group | rookies | primary games | half-PPR PPG (Σ/Σ) | ktc-neutral shipped level (mean over rookies) |
|---|---|---|---|---|
| top12 | 30 | 349 | 15.80 | 16.29 |
| r1 | 9 | 81 | 14.35 | 13.66 |
| day2 | 17 | 124 | 13.30 | 10.32 |
| day3+ | 34 | 136 | 12.34 | 7.78 |

- Total 690 games / 90 rookies. Exclusions: 1 non-QB rookie primary (2020 DEN wk12, a WR), 1 primary game
  with no `weeklyPoints` key (2016 OAK wk17).
- 2012 is **not** usable: its primary-passer coverage is 0.977 < the 0.99 stop. Seasons stay 2013–2025.
- The 2026-10-03 snapshot holds 14 rookie-route 2026 QBs (`projection.confidence === 'rookie'`): top12 ×1
  (23.2), r1 ×1 (20.6), day2 ×2, day3 ×6, udfa ×4.
- Season-ratio league scoring (§3.5) runs ≈1.11× half-PPR for these rookies, matching the captured 1.114.

So the ktc-neutral reconstruction is near the top-12 actual, but the live levels (with KTC and college) sit well
above it. Day-2/day-3 rookies who start score far above their shipped level — selection: only the good ones
start. The verdict must show both directions; it does not choose between cap and replace (P12b's call).

### Fixed decisions

- **D1 Basis: half-PPR pinned, league reported.** The store's `weeklyPoints` are half-PPR; the app scales every
  rookie constant (`ROOKIE_BASELINE_PPG`, `ROOKIE_CEILING`) by the runtime `positionBasisScale`, so it serves
  any league. The pinned values are half-PPR (`basis: 'half_ppr'`); every table also shows league-scored figures
  two ways: × the snapshot's captured `rookieBasisScale` (the app's own method), and per-player season-ratio
  rescoring (§3.5) as a cross-check. A league-only constant would tie the app to this league or double-scale.
- **D2 Groups are round-based**, not P6a's `draftOvr` bins, so P12b can build them from the app's own draft match
  (`round`, within-round `pick`): `top12` = round 1, pick ≤ 12; `r1` = round 1, pick ≥ 13; `day2` = rounds 2–3;
  `day3+` = rounds 4–7 or `undrafted === true`. A drafted player with null round or (round 1) null pick → no
  group (excluded, counted). This deviates from P6a's `dg` on purpose (late round-3 compensatory picks have
  `draftOvr` > 100); the verdict says so.
- **D3 "Started" = primary passer** of the team-game (P6a §3.1, `primaryPassers` imported unchanged): the same
  definition as the chain's P(start), so ROS = share × level is internally consistent. A rookie knocked out
  early is not that game's primary; his replacement is.
- **D4 Estimator = game-weighted mean** Σ points ÷ Σ primary games per group, the per-started-game expectation
  ROS needs. Player-weighted means and quantiles are reported beside it, never pinned.
- **D5 No pooling rule.** Every group pins its own value. A group with < 10 rookies carries `thin: true` (a flag
  for P12b, not a pooling trigger). Incumbent quality is **not** a split: it governs P(start), which the P6a
  chain already models; the plan made it optional. Start origin (game-1 starter vs takeover) is reported instead.
- **D6 Privacy (CR-09).** Nothing gamelogs-derived is emitted per player. The fixture is keyed by group only (no
  season), every report cell with < 3 rookies shows `n` only (value `null`, rendered `—`), suppression is
  complementary inside any published partition (Q2), quantiles need ≥ 7 rookies, and nothing per-season or
  per-fold is emitted — so no suppressed value is recoverable by subtraction (plan gate flag 1). The live 2026
  table carries app snapshot outputs per player (not gamelogs-derived), keyed by sleeper id.
- **D7 Snapshot pinned:** `snapshots/2026-10-03.json` (fixed in defaults, never "latest"), so a re-run is
  reproducible. It predates P6b's push, which did not change the rookie level (`qbStarterPPG = ceiledPPG`); §3.6
  reads either capture shape.

### Questions (the verdict answers each with numbers and n)

- **Q1 Level.** Per group and pooled: pinned value, 95% CI, rookies, games, thin flag; player-weighted mean and
  p25/p50/p75/p90 (rookies with ≥ 4 primary games, shown only when ≥ 7 such rookies); league ×scale and
  league by ratio.
- **Q2 Splits (report-only).** Within each group and pooled: by era (2013–2018 / 2019–2025), by start origin
  (`g1` / `takeover`), by season half (team-game index ≤ 8 / ≥ 9). Each split is a two-way partition of a
  published cell, so suppression is **complementary**: if either side has < 3 rookies, both sides are suppressed
  (otherwise subtraction from the group total recovers the small side). No app-draft-tier split: tiers cross the
  group lines (picks 9–15 span top12 and r1), so they would be differenceable against Q1 (plan gate flag 1).
- **Q3 Held-out vs the shipped level.** LOSO by season on rookie-season units with ≥ 3 primary games (§4.3).
  Comparators: A = shipped ktc-neutral level, B = pooled rookie mean, C = group mean, D = min(A, C) (a cap).
  Labels: C vs A, C vs B, D vs A. Plus mean signed error of A per group (shows over/under-statement).
- **Q4 Live 2026 vs the fit.** Per 2026 rookie QB in the pinned snapshot: captured level (league and half-PPR),
  the ktc-neutral reconstruction, `ktcMult`, `collegeContribution`, the group's pinned value and CI, and a
  classification `ABOVE` / `WITHIN` / `BELOW` the CI (§5.2 step 6). This is the direct answer on Mendoza.

---

## 1. Touch list

| File | Change |
|---|---|
| `lib/qbRookieLevel.mjs` | **new**, pure, no I/O (§3, §4) |
| `scripts/qb-rookie-level-run.mjs` | **new**, adapter with injectable loaders (§5) |
| `bin/backtest.mjs` | add `--qb-rookie-level` mode: import, dispatch, header usage block (§5.4). **CR-25 + CR-27 trigger** (§8) |
| `package.json` | add `"backtest:qb-rookie-level": "node bin/backtest.mjs --qb-rookie-level"` after `backtest:qb-takeover` |
| `test/qb-rookie-level.test.mjs` | **new** (§7) |
| `backtests/<date>-qb-rookie-level-{panel,constants}.json`, `grading/<date>-qb-rookie-level-verdict.md` | run output, committed (§6). Unregistered — the documented Invariant 3 analysis-output exception |
| `README.md` | §9 |
| `CLAUDE.md` | §9 (24,843 / 25,000 bytes: the named prune lands in the same commit) |

**Do not edit:** `lib/qbTakeover.mjs`, `scripts/qb-takeover-run.mjs`, `scripts/inseason-run.mjs`,
`lib/inSeasonEvidence.mjs`, `lib/rookieMirror.mjs`, `lib/projectionFactors.mjs`, `lib/fantasyPoints.mjs`,
`lib/nflverse.mjs`, `cross-repo-registry.md`, `data-catalog.md`, any served file, `manifest.json`, or any P6a
artifact. **Imports allowed (only these):** from `lib/qbTakeover.mjs` — `primaryPassers`, `coverageFor`,
`QB_TAKEOVER_DEFAULTS`; from `scripts/qb-takeover-run.mjs` — `CoverageStop`; from `scripts/inseason-run.mjs` —
`INSEASON_LOAD`, `guardLoad`, `rookiePriorFor`; from `lib/inSeasonEvidence.mjs` — `IN_SEASON_DEFAULTS`,
`clusteredBootstrap`, `bootstrapPairedMean`, `compareLabel`, `bySeason`; from `lib/fantasyPoints.mjs` —
`calculateFantasyPoints`, `RATE_KEYS`.

---

## 2. Definitions

- **Seasons** S = 2013–2025 (`QB_ROOKIE_DEFAULTS.seasons`). Never read season-totals, gamelogs or schedule for a
  year outside it; never read `nflverse/depth` at all.
- **Rookie**: `bySleeper[pid].draftYear === S` (undrafted entries carry their entry year in `draftYear`; probe
  confirmed). Same as P6a `rk`.
- **QB**: `positionOf[pid] === 'QB'`, where `positionOf` is built from `playerIds.ids` (`entry.sleeperId` →
  `entry.position`), the `crosswalkFrom` convention in `scripts/inseason-run.mjs:82`. Not gamelogs `position` —
  CR-09 sanctions only `team`/`week`/`seasonType`/`attempts`/`sacksSuffered` for this read.
- **Rookie primary game**: a REG team-game key `"${T}|${week}"` in `primaryPassers(gamelogs[S], S)` whose `pid`
  is a rookie QB with a group (D2). Points = `seasonTotals[S][pid].weeklyPoints[week]` (half-PPR). **Never**
  gamelogs `fantasyPoints`.
- **Team-game index** gIndex: position (1-based) of `week` in team T's sorted REG weeks from
  `schedule[S].games` (`gameType === 'REG'`, T as `homeTeam`/`awayTeam`; both era-coded like the primaries' keys).
- **Origin**: `g1` if the rookie is the primary of T's first REG game (gIndex 1) in S, else `takeover`. Per
  rookie-season-team; a rookie primary for two teams in one season keeps one origin per team.
- **Unit** (Q3): one rookie season (pid, S) with ≥ 3 primary games (`minUnitGames`); outcome y = his Σpts ÷
  games. Units are one per pid (a player is a rookie in one season), so the cluster id is `pid`.

---

## 3. `lib/qbRookieLevel.mjs` — primitives

### 3.1 `QB_ROOKIE_DEFAULTS`

```js
export const QB_ROOKIE_DEFAULTS = {
  seasons: { from: 2013, to: 2025 },
  snapshotDate: '2026-10-03',
  coverageMin: QB_TAKEOVER_DEFAULTS.coverageMin,   // 0.99, imported, not duplicated
  minUnitGames: 3, minQuantileGames: 4, minQuantilePlayers: 7,
  minCellPlayers: 3, thinPlayers: 10,
  eraSplitFrom: 2019, halfSplitAfter: 8,
  bootstrap: IN_SEASON_DEFAULTS.bootstrap,          // 4000 resamples, seed 12345
};
export const GROUPS = ['top12', 'r1', 'day2', 'day3+'];
```

### 3.2 `rookieGroup(entry) → 'top12'|'r1'|'day2'|'day3+'|null`

- `!entry` → null. `entry.undrafted === true` → `'day3+'`.
- `entry.draftRound == null` → null. Round 1 with `draftPick == null` → null.
- Group: round 1 → pick ≤ 12 ? `top12` : `r1`; round 2–3 → `day2`; round ≥ 4 → `day3+`.
- `draftPick` is **within-round** (`bySleeper` convention, `lib/rookieMirror.mjs` header). Never read
  `draftOvr` here.

### 3.3 `rookieStarterGames({ S, primaries, schedule, seasonTotals, bySleeper, positionOf }) → { games, excluded }`

- For each `[key, { pid }]` of `primaries` (the `primaryPassers` Map), checks in this order:
  - no `bySleeper[pid]` → `excluded.noCrosswalk++`, skip (counted over **all** primaries: it is the share of
    primaries whose rookie status is unknowable);
  - `draftYear !== S` → skip silently (not a rookie);
  - the key's week is absent from T's schedule REG weeks → `excluded.noScheduleGame++`, skip (expect 0);
  - `positionOf[pid] !== 'QB'` → `excluded.nonQB++`, skip;
  - `rookieGroup` null → `excluded.noDraftRound++`, skip;
  - `weeklyPoints?.[week]` not a finite number → `excluded.missingPoints++`, skip;
  - else push `{ pid, S, team, week, gIndex, group, origin, pts }`. Origin is decided from the **`primaries`
    Map, before any exclusion**: `g1` iff `primaries.get(`${T}|${firstRegWeek(T)}`)?.pid === pid`.
- Raw `games` never reach an artifact (§6.1).

### 3.4 Aggregates

- `aggregate(games, keyFn) → Map<key, { players, games, sumPts }>`; `players` = distinct `pid|S`.
- `levelTable(games) → { [group]: { players, games, sumPts, value }, pooled: {…} }`; `sumPts` rounded
  `Math.round(x * 100) / 100` **before** `value = round3(sumPts / games)` (`round3 = x => Math.round(x*1e3)/1e3`),
  so the value re-derives exactly from the fixture (§6.2). **Pooled is built from the group rows**:
  `pooled.sumPts = round2(Σ group sumPts)`, `pooled.games = Σ group games`, `pooled.players = Σ group players`,
  so it is exact by construction (plan gate flag 2).
- `levelCI(games, group|null)` → `clusteredBootstrap(clusters, s => Σsum/Σgames, bootstrap)` where each cluster
  is one rookie-season `{ sum, games }`; returns `ci95` (unrounded in the panel, `round3` in constants).
- `playerDistribution(games, group)` → over rookie-seasons with ≥ `minQuantileGames`: `{ n, mean, p25, p50, p75,
  p90 }`, quantiles by linear interpolation between order statistics at `(n−1)·f`; all `null` (n kept) when
  n < `minQuantilePlayers`.
- `suppress(cell)` → the same object with every numeric value `null` (keeping `players`/`games`) when
  `players < minCellPlayers`. `suppressPair(a, b)` → both suppressed if either is under `minCellPlayers`
  (complementary rule, Q2). No per-season aggregate reaches an artifact at all.

### 3.5 `leagueRatio(rec, scoringSettings) → number|null`

`stats` with every `RATE_KEYS` key removed, then `calculateFantasyPoints(stripped, scoringSettings) /
rec.fantasyPoints` when `rec.fantasyPoints > 0`, else null. This mirrors the app's season-ratio rescore
(`rescoreSeasonTotals`, `src/api/sleeperStats.js:310`: weekly points × the season's league/half-PPR ratio, with
non-additive keys stripped — CR-14 keeps `RATE_KEYS` ≡ the app's `NON_ADDITIVE_KEYS`). The app also derives
`bonus_fd_<pos>` for 2012–2021; this league scores no `bonus_fd_qb`, so the adapter **stops** (§5.2 step 0) if
`scoringSettings.bonus_fd_qb` is non-zero rather than port that derivation. A game's league points =
`pts × ratio`; a rookie-season with a null ratio is left out of league-by-ratio figures only (count reported).

### 3.6 `liveLevel(snapPlayer) → { level, source } | null`

- `projection.confidence !== 'rookie'` → null.
- `factors` has key `qbStarterPPG` (post-P6b capture): level = it if finite, else null; source `'qbStarterPPG'`.
- `factors` has neither `qbStarterPPG` nor `qbTakeoverBasis` (pre-P6b capture): level = `projection.projectedPPG`,
  source `'projectedPPG'` (then it equals `ceiledPPG`).
- `factors.qbTakeoverBasis` present but `qbStarterPPG` absent → null (inconsistent capture; counted).
- Half-PPR equivalent = level ÷ `factors.rookieBasisScale` (must be finite > 0, else the row is excluded and
  counted).

---

## 4. `lib/qbRookieLevel.mjs` — held-out comparison

### 4.1 `unitsFrom(games, minUnitGames) → [{ pid, S, group, games, y }]`

### 4.2 `losoCompare({ games, units, priorOf, bootstrap })`

- For each unit u, the training set is every game with `S !== u.S` (`bySeason` over units for the fold loop):
  - B = Σpts/Σgames over training games (all groups);
  - C = the same over training games of u's group; if that group has 0 training games, C = B and the unit is
    counted in `cFallback`;
  - A = `priorOf(u)` (§5.2 step 4), half-PPR, never fitted;
  - D = `Math.min(A, C)`.
- Per unit `err_X = |X − y|`, `bias_X = X − y`.
- Comparisons (new vs old), diff = `err_new − err_old`, CI = `bootstrapPairedMean(units.map(u => u.pid), diffs,
  bootstrap)`, label = `compareLabel(ci95)` (BEATS = new better): **C vs A**, **C vs B**, **D vs A**.
- Returns `{ units: n, unitsByGroup, mae: { A, B, C, D }, comparisons: [{ new, old, mean, ci95, label }], biasA:
  { [group]: { n, mean } }, cFallback }`. **No per-fold output**: a fold's training sums subtracted from the pooled
  sums would expose that season's rookie-primary total (plan gate flag 1).
- **Selection caveat** (verdict text): A is the ktc-neutral reconstruction. The live app multiplies by `ktcMult`
  (0.70–1.30) and `collegeContribution`; for top picks both run above 1, so live levels sit above A (Q4 shows
  by how much). Q3 therefore tests the reconstructable part of the shipped level, not the live number.

---

## 5. `scripts/qb-rookie-level-run.mjs`

### 5.1 Loaders

`QB_ROOKIE_LOAD = INSEASON_LOAD` (already carries `loadSeasonTotals`, `loadGameLogs`, `loadSchedule`,
`loadPlayerIds`, `loadManifest`, and `loadSnapshot` via `DEFAULT_LOAD`, `scripts/panel-run.mjs:81`). Wrap with
`guardLoad` (memoises; refuses `inProgress` season-totals/gamelogs and years above `maxLoadSeason`).

### 5.2 `runQbRookieLevel({ load = QB_ROOKIE_LOAD, defaults = QB_ROOKIE_DEFAULTS, log = () => {} })`

0. **Snapshot.** `load.loadSnapshot(defaults.snapshotDate)`. Throw `SnapshotStop` (new, exported, same shape as
   `CoverageStop`) if it is null, lacks `scoringSettings` or `players`, if `targetSeason` ≤ `seasons.to`, or if
   `scoringSettings.bonus_fd_qb` is a non-zero number.
1. **Coverage.** For each S: `coverageFor(schedule, primaryPassers(gamelogs, S))`. Throw `CoverageStop` (imported
   from `scripts/qb-takeover-run.mjs`) if any rate < `coverageMin`, the denominator is 0, or the rate is
   non-finite. Report per season either way.
2. **Games.** `rookieStarterGames` per S; concatenate; sum `excluded`.
3. **Q1 / Q2.** `levelTable`, `levelCI` per group and pooled, `playerDistribution`, league figures:
   × `scaleCaptured` (step 6) and by ratio (`leagueRatio` per rookie-season from `seasonTotals[S][pid]`). Q2
   splits via `aggregate` + `suppress`.
4. **Q3.** `priorOf(u) = rookiePriorFor(u.pid, 'QB', u.S, playerIds)` (rounded 1 dp, half-PPR, ktc/college
   neutral — the CR-15 corrected rookie reconstruction). Then `losoCompare`.
5. **Fixture + verification.** Build `fixture` (§6.2), recompute every pinned `value` from it, and throw
   (before any write) unless each equals the pinned value exactly.
6. **Q4.** For each `[pid, p]` of `snapshot.players` with `positionOf[pid] === 'QB'`, `bySleeper[pid]?.draftYear
   === snapshot.targetSeason` and a non-null `liveLevel(p)`:
   `{ pid, group, draftOvr, team: p.nfl_team, depthChartOrder: p.depthChartOrder, levelLeague, source,
   basisScale, levelHalf, reconHalf: rookiePriorFor(pid, 'QB', targetSeason, playerIds), ktcMult,
   collegeContribution, fitHalf, fitCI, fitLeague: fitHalf × basisScale, gapHalf: levelHalf − fitHalf, class }`;
   `fitHalf`/`fitCI` are the **constants' rounded** values (`round3`), so P12b reproduces `class` exactly;
   `class` = `ABOVE` if `levelHalf > fitCI[1]`, `BELOW` if `< fitCI[0]`, else `WITHIN`; a rookie with no group
   gets `class: null`. `scaleCaptured` = the distinct `rookieBasisScale` values over these rows (expect one;
   report all). Also a per-group summary (n, mean levelHalf, fitHalf, counts per class). Counts of excluded
   snapshot rows by reason.
7. Assemble `{ meta, coverage, excluded, q1, q2, q3, q4, constants, verdictInput }`.

### 5.3 Artifact writing

`writeQbRookieLevelArtifacts({ result, verdictMd, root = null, caps = ARTIFACT_CAPS })` copies
`writeQbTakeoverArtifacts` (`scripts/qb-takeover-run.mjs:524–543`) exactly: serialise all three → check caps
(panel 5 MB, constants 300 KB) → throw before writing anything if one trips → write. Constants text from a new
`formatQbRookieLevelConstantsJson(file)`: one line per top-level key, one line per `fixture.rows` entry.

### 5.4 `bin/backtest.mjs --qb-rookie-level`

- Dispatch **before** the `--qb-takeover` branch (`bin/backtest.mjs:180`). Reject list
  `['--qb-rookie-level', '--json', '--write']`: any other `--` flag → error naming the rejected flags, exit 1,
  before any load (so `--qb-rookie-level --dynasty` and `--qb-rookie-level --qb-takeover` both exit 1).
- Header usage block after the `--qb-takeover` one (l.32–36), same style.
- `scripts/qb-rookie-level-run.mjs` exports `QB_ROOKIE_LOAD`, `SnapshotStop`, `runQbRookieLevel`,
  `buildQbRookieLevelVerdictMarkdown(result)`, `formatQbRookieLevelConstantsJson`, `ARTIFACT_CAPS`,
  `writeQbRookieLevelArtifacts`, `qbRookieLevelMain`; the bin imports only `qbRookieLevelMain`.
- Seam: `export function qbRookieLevelMain({ load = QB_ROOKIE_LOAD, write = false, asJson = false,
  writeArtifacts = writeQbRookieLevelArtifacts, log = console.log, logErr = console.error })` — mirrors
  `qbTakeoverMain` (`scripts/qb-takeover-run.mjs:546–566`): always builds the verdict, writes only with `write`,
  returns 1 on `CoverageStop` **or** `SnapshotStop` (logged via `logErr`), 0 otherwise. The bin does
  `process.exit(qbRookieLevelMain({ write, asJson }))`.

---

## 6. Outputs (`--write`; `<date>` = UTC run date)

### 6.1 `backtests/<date>-qb-rookie-level-panel.json`

Coverage per season, excluded counts, Q1–Q4 tables (Q4 per-player rows are snapshot outputs), Q3 MAEs,
comparisons, bias and `cFallback`. **No gamelogs-derived per-player or per-rookie-season values**, no raw
`games`, no units, no per-fold or per-season point aggregates (D6).

### 6.2 `backtests/<date>-qb-rookie-level-constants.json` — the file P12b pins

```json
{
  "source": "sleeper-dashboard-data backtests/<date>-qb-rookie-level-constants.json (node bin/backtest.mjs --qb-rookie-level --write)",
  "generatedAt": "…", "basis": "half_ppr",
  "definitions": {
    "seasons": {"from": 2013, "to": 2025},
    "started": "primary passer of the REG team-game: max(attempts+sacksSuffered); ties attempts, then pid (P6a primaryPassers)",
    "rookie": "bySleeper.draftYear === S", "position": "playerids ids position QB",
    "groups": {"top12": "round 1, pick <= 12", "r1": "round 1, pick >= 13", "day2": "rounds 2-3", "day3+": "rounds 4-7 or undrafted"},
    "pickConvention": "within-round (bySleeper.draftPick)",
    "outcome": "season-totals weeklyPoints[week] (half_ppr) in each primary game; never gamelogs fantasyPoints",
    "estimator": "sum(points) / sum(primary games), game-weighted", "thinPlayers": 10,
    "leagueScaling": "multiply by the app's runtime positionBasisScale (as ROOKIE_CEILING)"
  },
  "starterPPG": {"top12": {"value": 0, "ci95": [0, 0], "players": 0, "games": 0, "thin": false}, "r1": {}, "day2": {}, "day3+": {}, "pooled": {}},
  "heldOut": {"units": 0, "mae": {"shippedKtcNeutral": 0, "pooled": 0, "group": 0, "cap": 0}, "groupVsShipped": {"mean": 0, "ci95": [0, 0], "label": "…"}, "groupVsPooled": {}, "capVsShipped": {}},
  "live": {"snapshot": "2026-10-03", "basisScale": [1.114], "byGroup": {}},
  "fixture": {"keys": ["group", "players", "games", "sumPts"], "rows": [["top12", 0, 0, 0]]},
  "verification": {"rederiveFromFixture": "exact"}
}
```

Placeholder values show shape only. `fixture.rows` has one row per group (no season key, D6); `pooled`
re-derives from their sums.

### 6.3 `grading/<date>-qb-rookie-level-verdict.md`

- Summary: the four pinned values with CI and n, Q3's three labels, and Q4's class counts, in plain words —
  including one line on Mendoza (`13269`).
- Coverage and exclusions; Q1–Q4 sections with n on every number; the D2 group-definition note; the Q3 selection
  caveat (§4.2); the selection note that day-2/day-3 starters are a selected subset, so a group value is
  "PPG **if** he starts", never a talent estimate for every rookie in the group.
- "For P12b" (§10) and "What this does not model": rookie development within the season beyond the Q2 half
  split, offensive environment, injuries shortening starts.
- `**Reproduce:** node bin/backtest.mjs --qb-rookie-level --write`.

---

## 7. Tests — `test/qb-rookie-level.test.mjs` (fixture loaders, except T10)

- **T1 rookieGroup.** R1 P12 → top12; R1 P13 → r1; R2 P1 → day2; R3 last pick with `draftOvr` 105 → day2
  (round-based, D2); R4 → day3+; `undrafted` → day3+;
  drafted with null round → null; R1 null pick → null; no entry → null.
- **T2 rookieStarterGames** on a synthetic two-team season with a bye: rookie primary rows collected with
  correct gIndex across the bye; a veteran primary ignored; `draftYear !== S` ignored; a rookie WR primary →
  `nonQB`; missing `weeklyPoints[week]` → `missingPoints`; no `bySleeper` → `noCrosswalk`; origin `g1` for the
  team's game-1 primary and `takeover` otherwise — including `g1` when that game-1 row itself was excluded as
  `missingPoints`; era codes: a 2015 gamelogs `LA` rookie keys as `STL|w` via
  `primaryPassers` and joins the `STL` schedule.
- **T3 levelTable + fixture.** value = round3(round2(Σpts)/Σgames); `players` counts distinct rookies;
  `pooled.sumPts` = round2(Σ group sumPts) on a case where that differs from round2(Σ all game pts); re-deriving from `fixture.rows` reproduces every value exactly.
- **T4 levelCI.** Clusters are rookie-seasons: a rookie's games resample together (with one 10-game rookie and
  two 1-game rookies, the cluster count is 3); same seed → identical CI.
- **T5 playerDistribution + suppress.** Quantile interpolation on a hand case; rookies under `minQuantileGames`
  excluded; all-null with n kept below `minQuantilePlayers` (7); `suppress` nulls values below `minCellPlayers` and
  keeps `players`/`games`; `suppressPair` with a 2-rookie and a 9-rookie side suppresses **both**.
- **T6 losoCompare.** Three synthetic seasons: fold means exclude the held-out season; units need ≥ 3 games;
  D = min(A, C); `cFallback` when a group has no training games; diff sign (BEATS = new better) checked on a
  case where C is exact and A is off; the return value has no `folds` (or any per-season) key.
- **T7 leagueRatio.** A `RATE_KEYS` key carrying a scoring weight is ignored; `fantasyPoints` 0 → null; a
  pass-TD-only league difference yields the hand-computed ratio.
- **T8 liveLevel.** Post-P6b shape → `qbStarterPPG`; pre-P6b shape → `projectedPPG`; `qbTakeoverBasis` without
  `qbStarterPPG` → null; non-rookie confidence → null; half-PPR = level ÷ `rookieBasisScale`.
- **T9 Loader ceiling.** A spy load: season-totals/gamelogs/schedule years ⊆ [2013, 2025]; no depth loader
  called; `loadSnapshot` called only with `'2026-10-03'`; a stub manifest marking a gamelogs year `inProgress`
  throws via `guardLoad`.
- **T10 Live smoke (read-only, the only live-store test).** `runQbRookieLevel()` completes; total rookie
  primary games within ±5% of 690 and rookies within ±5% of 90 (probe); `verification` exact; Q4 has ≥ 1 row
  and Mendoza `13269` is in group `top12`. Skip with a message if `snapshots/2026-10-03.json` is absent.
  `{ timeout: 600_000 }`; report the runtime in the hand-back.
- **T11 CLI.** Through `qbRookieLevelMain` with injected `load` and a spy `writeArtifacts`: `CoverageStop` → 1,
  no write; `SnapshotStop` (snapshot null; and `bonus_fd_qb: 0.5`) → 1, no write; success with `write: true` →
  0, spy called once. `spawnSync` of `bin/backtest.mjs --qb-rookie-level --dynasty`: exit 1, the reject message
  on stderr, empty stdout (P6a style; the in-process path covers "no load").
- **T14 Disclosure.** On a synthetic run with a season holding one rookie starter and a Q2 split with a 1-rookie
  side: the serialised panel and constants contain no per-season point aggregate, and the 1-rookie side and its
  complement are both `null`.
- **T12 Coverage stop edges.** A zero-denominator season and a NaN rate throw `CoverageStop`; exactly 0.99 passes.
- **T13 Writer.** A panel over the cap throws before **any** file is written (temp-dir `root`).

---

## 8. Cross-repo impact

Machine check (Session 1, `lib/registry.mjs` trigger lists vs the touch list): `bin/backtest.mjs` is a listed
data-side trigger of **CR-25** and **CR-27**. No CR-25 definition, k or fit rule changes, and no CR-27 feature,
bin or coefficient changes: the new mode only adds a dispatch branch, and `lib/qbTakeover.mjs` is imported
unchanged. Mirror texts, verbatim:

### CR-25 · In-season evidence definitions and fitted k — fires (`bin/backtest.mjs`)

> An app-side change to any mirrored definition stales every fitted k: mirror the definition into `lib/inSeasonEvidence.mjs` (never into the frozen `PHASE1_K`), re-run `node bin/backtest.mjs --inseason --write`, and re-pin from the new constants file — never hand-edit a `K_*`. The dynasty-side 2c k (`--inseason --dynasty`) also mirror the prospect prior and the SHORT history slot: a change to `POSITION_PRIOR_PPG`, the age or draft multipliers, the completed-season blend, the prospect-path gate, the rookie-draft pick source or `recencyWeightedPPG` re-fits them via `node bin/backtest.mjs --inseason --dynasty --write`. The data side approximates the league's rookie-draft pick from NFL draft order (skill-position rank into a 12-team, 5-round draft) and ages players on 1 September; both are stated in that constants file's `fit`, and neither is an app definition. A data-side change to the fit (grid, loss, rounding, checkpoints, arms, prior, the pin rules in `buildConstants`/`decideOwnVsPooled`/`ladderPick`) writes a new dated constants file; the app keeps its pinned copy until it deliberately re-pins by copying that file byte-for-byte with its data commit SHA, and a re-pin re-checks `PRIOR_MODEL_FROM` (a frozen prior captured before the current model is refused — CR-26). An app-side model change bumps `PRIOR_MODEL_FROM` at once; if it also changes a CR-15-mirrored factor, the k are stale until re-fitted — a bump is not a re-fit. The Q4 NO-GAIN pooled-pin *decision* (own k BEATS pooled out of sample) is taken and tested data-side; the app's provenance test checks only which fixture cell each `k` re-derives from. These k partly compensate for the projection's known optimism (c ≈ 0.80–0.86): correcting that optimism is a re-fit, not a re-pin. The definitions flow app→data and the constants data→app. **Nothing fails in either repo when this drifts** — the app blends with constants fitted under definitions it no longer uses. Later consumers (the rest-of-season posterior grader) extend this entry rather than adding another. Since in-season-evidence-2c-wiring the app applies the 2c verdict's reuse rows (arm B at the 2a rookie k, SHORT-recent at `K_DYN_POINTS_HISTORY`); a data-side run that pins `K_DYN_PROSPECT_B_*` or `K_DYN_POINTS_SHORT_HISTORY` as new constants transports only after a deliberate app re-pin. The app's dynasty-side rookie prior holds `ktcMult` and `collegeContribution` at 1.0 to equal the data side's arm-B prior: porting either into the data reconstruction changes arm B and re-fits these k. Which `yearsExp` × position cells start from the projection (`PROSPECT_PRIOR_KIND`) follows a two-season (S+2) arm comparison on the 2c Q1 rows — only a WORSE cell keeps the position baseline; a cell flips only on a committed re-run of it. The second-year-WR arm-A k are pinned from the 2c panel's pooled YE1 fit (`IN_SEASON_DYN_PANEL_SOURCE`), not from a constants file, until the data side emits them. The no-market cap's placement (starting value only) was chosen on the 2c Q1 cap rows (cap-before BEATS cap-after, pooled −16.3 score points): a change to the cap or its placement re-runs that comparison. **qb-takeover-wiring:** (a) it moves QB backups' `projectedPPG`, so `PRIOR_MODEL_FROM` was bumped; (b) it changes a CR-15-mirrored factor (Step 8, QB), so the QB `K_*` are stale until `--inseason` re-runs on the re-mirrored reconstruction (D-59) — a bump is not a re-fit; (c) the QB ROS posterior for a non-original starter uses n = starts at a k fitted on n = games played, which coincide for the starters that dominate that fit; (d) a rookie QB whose starts trail the preseason chain by more than one game has his prospect prior × 0.90 — the data side's arm-B prior has no such discount, so the 2c rookie k transport only for undiscounted rows.

### CR-27 · QB takeover constants — fires (`bin/backtest.mjs`)

> A change to any feature definition or bin on either side re-runs `node bin/backtest.mjs --qb-takeover --write` and the app re-pins by byte copy with the data commit SHA — never by hand-editing a coefficient. A re-pin that adopts a feature the app does not build (`bn`, `wk`, `wp`, `dg`, `ps` beyond its current exact build) throws app-side by design: build it first. `incPPG`'s k = 3 is this entry's own constant, not CR-25's. **Transport:** the app's `dp` is Sleeper `depth_chart_order` while the fit used nflverse charts (only measurement: QB depth-1 68.8%, n = 32, a cross-season upper bound on disagreement); the app's primary passer comes from Sleeper weekly rows while the fit used nflverse gamelogs (`attempts + sacksSuffered`); g = 1 is extrapolated (5.1% predicted vs 2.2% raw game-1 rate); a returning original starter reuses the backup-origin `pStay` with `dq = unknown`; the app holds a backup-origin starter's post-demotion codes at d2/unknown; the app's primary passer considers playerMap-`QB` rows only (the fit's `primaryPassers` considers every passer); `rk` is `years_exp === 0` (the fit: `draftYear === S`); live `iq` is a ratio of league-scored points (the fit: half-PPR `weeklyPoints`) — basis cancels to first order in the ratio at every checkpoint, not only g = 1. `QB_SAT_LONGER_*` are app heuristics (PROVISIONAL), not fitted. **Nothing fails in either repo when this drifts.**

### New couplings — drafts in the companion `.claude/tasks/qb-rookie-level-research-registry.md`

This task edits no registry text. The companion holds the verbatim drafts routed through the two-session
registry sync (data emits → app applies → data syncs), landing with P12b:
- **CR-09** Mirror + Data-side + Triggers amendment: a third sanctioned analytical gamelogs read;
- **CR-01** Data-side append: a new offline snapshot reader (`scoringSettings`, `targetSeason`, and the rookie
  `projection` fields `confidence`/`projectedPPG`/`factors.qbStarterPPG`/`qbTakeoverBasis`/`rookieBasisScale`/
  `ktcMult`/`collegeContribution`);
- **CR-15** Data-side append: a new consumer of the corrected rookie reconstruction (via `rookiePriorFor`);
- **CR-14** Data-side append: a new `calculateFantasyPoints` call site (league cross-check);
- **CR-27** extension draft: rookie starter-level constants (P12b pins them; extend, don't add an entry);
- three signal-registry *Current use* row edits (CR-18) and the app backlog line.

Session 2 does not touch the companion.

### Not fired

CR-06/CR-18 data-side (no ingest, draft or playerids change), CR-16 (`eraTeam` is reached only inside the
unchanged `primaryPassers`), CR-21 (no live-season read; 2026 is read only from the snapshot), CR-26 (no app
read-back).

---

## 9. Docs

- **README → Analysis / Backtesting:** a new `### Rookie QB starter level (`bin/backtest.mjs --qb-rookie-level`)`
  section after the QB takeover section (before the `---` above "Data sources and attribution"), in the same
  shape: what it measures, the primary-passer definition (reused from P6a), the round-based groups, the
  game-weighted estimator, the rookie-season-cluster bootstrap (4000, seed 12345), LOSO on units with ≥ 3 games,
  the 0.99 coverage stop and `SnapshotStop`, the pinned snapshot, "no gamelogs points are read", artifacts, the
  three-command block, Reproduce line.
- **README → backtest flags** (l.1282): append `, `--qb-rookie-level` (takes only `--json`/`--write`)` before the
  closing period. **Writes** (l.1295–1296): add `<date>-qb-rookie-level-{panel,constants}.json` and
  `<date>-qb-rookie-level-verdict.md` to the two lists.
- **CLAUDE.md** (exact; `test/claudeMdSize.test.mjs` must pass):
  1. l.16 Backtest cell: `` `--qb-takeover` (QB takeover fit) `` → `` `--qb-takeover` (QB takeover fit);
     `--qb-rookie-level` (rookie QB starter PPG) ``.
  2. l.28: after `` `backtest:qb-takeover`, `` insert `` `backtest:qb-rookie-level`, ``.
  3. l.63: `` `inseason-dyn-run.mjs` (`--dynasty`) reach `` → `` `inseason-dyn-run.mjs` (`--dynasty`),
     `qb-rookie-level-run.mjs` (`--qb-rookie-level`) reach `` (it reaches `lib/rookieMirror.mjs` via
     `rookiePriorFor`).
  4. l.66: `` `lib/qbTakeover.mjs` is `--qb-takeover`'s pure fit `` → `` `lib/qbTakeover.mjs` is
     `--qb-takeover`'s pure fit, `lib/qbRookieLevel.mjs` `--qb-rookie-level`'s ``.
  5. **Prune** (l.47): delete `` `validateNflSeason`'s full-season floor self-calibrates: `Math.max(1, maxGames -
     3)`, ≥30 players at or above it`` together with the space before it, so the cell ends `(Invariant 7).`.
     Lossless: README → Module notes → "`lib/validate.mjs` — self-calibrating full-season floor" (l.1318) already
     states it in full. Net ≈ +60 B → ≈ 24,905.
- **`data-catalog.md`:** none (no family coverage, schema or gate change).

---

## 10. For P12b (carried forward, not acted on here)

1. `qbStarterPPG` is `ceiledPPG`, which is also the rookie route's `projectedPPG` for a non-chain QB — and
   `buildRookieDynastyPriors` (`src/utils/prospectPrior.js`, CR-01) reads that rookie-route `projectedPPG` (with
   `ktcMap: null, collegeStats: null`) as the dynasty prior. Changing the shared level moves the 2c dynasty arm-B
   prior (CR-25 re-fit). Scoping the change to `qbStarterPPG` alone, or accepting the re-fit, is P12b's call.
2. Groups map from the app's own draft match: `top12` = round 1 && pick ≤ 12, `r1` = round 1 && pick ≥ 13, `day2`
   = `DAY2_TIERS`, `day3+` = `DAY3_TIERS` ∪ `draftCapitalStatus === 'undrafted'`; `unknown` draft capital has no
   group (keep the current level).
3. "Replace" raises day-2/day-3 starter levels (selected starters score above their shipped level); "cap"
   (Q3's D) only lowers. Anton's direction ("too high") reads as a cap; Q3 measures both.
4. Any change re-mirrors `lib/rookieMirror.mjs` (CR-15), bumps `PRIOR_MODEL_FROM`, adds an anchor-policy
   boundary, and extends CR-27 (companion draft).
5. The pinned values are half-PPR; multiply by `positionBasisScale.QB` at runtime like `ROOKIE_CEILING`.

---

## 11. Done-definition and git

1. `npm test` green (new file + `test/claudeMdSize.test.mjs`); `npm run smoke` green.
2. `node bin/backtest.mjs --qb-rookie-level --write` exits 0. Commit code + tests + docs first, then the three
   artifacts as a separate commit; the artifacts commit SHA is what P12b pins.
3. `git diff --stat manifest.json` empty.
4. `git pull --rebase origin main`, then `git push origin main` (never `--force`).
5. Hand back: commit range, every file touched, every deviation, what each test asserts, coverage per season,
   excluded counts, the four pinned values with n, Q3's labels and MAEs, the Q4 table, T10 runtime.

**Stop and ask (do not improvise) if:** coverage < 0.99 in any season; `SnapshotStop` fires on the real store;
T10 counts fall outside ±5%; `rookiePriorFor` returns null for any unit (the ktc-neutral comparator must cover
every unit); any group has 0 rookies; `scaleCaptured` has more than one value.

---

## Review record — plan gate round 1 (2026-10-04)

plan-reviewer (full depth) raised 10 flags, none blocking. It re-ran the probe and reproduced every number
(690 games / 90 rookies; 68 units: top12 27, r1 8, day2 14, day3+ 19; 2013 coverage 0.9902), confirmed all
imports, line anchors, the CLAUDE.md byte math (24,843 → 24,897) and verbatim containment of both Mirror texts.
Anton delegates review calls; Session 1 checked each flag and **applied all 10**.

| # | Flag (short) | Decision |
|---|---|---|
| 1 | Suppression undone by subtraction (per-fold sums, tier splits crossing groups, p50 at n = 5) | Applied: no per-fold/per-season output; tier split dropped; complementary suppression for Q2 pairs (`suppressPair`); `minQuantilePlayers` 7; D6 reworded; T14 added |
| 2 | Pooled fixture re-derivation could trip on rounding | Applied: pooled built from the rounded group rows, exact by construction; T3 case |
| 3 | §0 said the 1.85 clamp binds for Mendoza | Applied: product 1.785; the soft ceiling does the compression (25.84 → 23.2) |
| 4 | No CR-08 append for the schedule read | Applied (companion) |
| 5 | CR-01 draft omitted `nfl_team`/`depthChartOrder` | Applied (companion) |
| 6 | CR-16 coverage of the gIndex/origin join | Applied: optional data-side append (companion) |
| 7 | Backlog line under-described CR-09 | Applied (companion) |
| 8 | Third gamelogs read unsanctioned until sync | Applied: companion routes to the **next registry batch**, not P12b |
| 9 | Three ambiguities (origin source, class CI rounding, `noScheduleGame` order) | Applied: origin from the `primaries` Map before exclusions; `class` uses the constants' round3 CI; `noScheduleGame` is the third check |
| 10 | T11 spawn can't spy loads; verdict builder / exports unnamed | Applied: spawn asserts exit/stderr/stdout; §5.4 lists the adapter's exports |

Pre-existing, out of scope: README l.1324 cites `lib/validate.mjs:123–127`; the live line is 131.

---

## Verification record — implementation review (2026-10-04)

implementation-reviewer on `c2e3ce8..849633a` (`df4edf6` code, `849633a` artifacts). Fidelity, scope, docs, CLAUDE.md
(24,897 B) all clean; artifacts reproduce byte-exactly; `npm test` 1282 pass / 0 fail, smoke green. The four
disclosed deviations are accepted. Five flags, all applied via Fix pass 1:

| # | Flag | Decision |
|---|---|---|
| 1 | HIGH — `q3.biasA` (n, mean) per group minus `q1.<grp>.playerDistribution` (n, mean) recovers the one 3-start rookie in top12, r1 and day2 exactly (reviewer matched three named rookie-seasons to 4 dp). A plan gap: §4.2 and §3.4 used different floors (3 vs 4 games) | Applied: one floor — the player distribution uses `minUnitGames` (3) so both stats cover the identical rookie set; disclosure test added |
| 2 | LOW — a quantile at an integer position is one rookie's exact PPG (r1 p50, day2 p25/p50/p75) | Applied: quantiles dropped; the distribution keeps `n` and the player-weighted `mean` only |
| 3 | LOW latent — `nullify` does not recurse (a thin Q1 cell would keep `leagueByRatio.value`) | Applied: recursive |
| 4 | LOW latent — Q2 complement across the pooled row | Applied: cross-group complementary rule |
| 5 | LOW — T12's "NaN rate" case is the zero-denominator branch | Applied: test renamed honestly; `coverageFor` yields NaN only at a zero denominator |

## Fix pass 1

Scope: `lib/qbRookieLevel.mjs`, `scripts/qb-rookie-level-run.mjs`, `test/qb-rookie-level.test.mjs`, `README.md` (only
if its new section mentions quantiles or p50/p75/p90), and the three artifacts. Nothing else. Leave the pinned
`starterPPG` values, the fixture, Q3's MAEs/comparisons and Q4 untouched — they must come out identical.

1. **One rookie set for Q1's distribution and Q3 (flag 1).** In `QB_ROOKIE_DEFAULTS` delete `minQuantileGames` and
   `minQuantilePlayers`. `playerDistribution(games, group, { minUnitGames = QB_ROOKIE_DEFAULTS.minUnitGames,
   minCellPlayers = QB_ROOKIE_DEFAULTS.minCellPlayers })` filters rookie-seasons with `games >= minUnitGames` —
   exactly the Q3 unit set — and returns `{ n, mean }`, with `mean: null` (n kept) when `n < minCellPlayers`.
   Update its JSDoc, the call at `scripts/qb-rookie-level-run.mjs:170`, and the verdict renderer (~l.329) to show
   `n` and mean only, with the column header saying "rookies with ≥ 3 starts".
2. **No quantiles (flag 2).** Remove `quantile` (if no other caller) and every p25/p50/p75/p90 field from code,
   verdict, panel and README.
3. **Recursive `nullify` (flag 3).** Numbers and arrays → null at any depth inside plain objects; `players`/`games`
   keys kept at every depth; strings/booleans/null unchanged.
4. **Cross-group complement in Q2 (flag 4).** In `runQ2`, per dimension, after the per-group `suppressPair`: let
   `G` = groups whose pair was suppressed. If `G` is non-empty and, summed over `G`, either side has
   `< minCellPlayers` rookies, also nullify the **pooled** pair for that dimension (pooled minus the published
   groups would otherwise recover the suppressed groups' combined side). Otherwise leave pooled as is.
5. **Tests.**
   - T5: replace the quantile assertions with the `{ n, mean }` shape at the 3-game floor and the
     `minCellPlayers` null; add a nested-object case for `suppress` (e.g. `{ players: 2, games: 9, value: 1,
     leagueByRatio: { value: 2, ci95: [1, 3], players: 2 } }` → every number null except the `players`/`games`).
   - T14 additions: (a) on a synthetic run, for every group, `q3.biasA[g].n === q1[g].playerDistribution.n`;
     (b) the subtraction `biasA.n·(meanA − biasA.mean) − pd.n·pd.mean` computed from the serialised panel equals 0
     (to 1e-9) for every group — i.e. it isolates nobody (compute `meanA` from the synthetic `priorOf`);
     (c) a Q2 dimension where exactly one group's pair is suppressed nulls the pooled pair; one where the
     suppressed groups' combined sides are both ≥ 3 keeps it; (d) no key named `p25`/`p50`/`p75`/`p90` anywhere in
     the serialised panel or constants.
   - T12: rename the third case to "an empty REG schedule (rate = 0/0, NaN) is a stop" — no behaviour change.
6. **Re-run and commit.** `npm test` and `npm run smoke` green; `node bin/backtest.mjs --qb-rookie-level --write`.
   - If the UTC date is still 2026-10-04 the three artifacts are overwritten in place. If it is later, `git rm` the
     three `2026-10-04-qb-rookie-level-*` artifacts in the same commit as the new dated set (they are superseded
     and disclose per-rookie values; history keeps them, nothing is force-pushed).
   - Two commits: code + tests (+ README), then artifacts. The artifacts commit message must say: "Correction: the
     849633a panel let biasA − playerDistribution recover individual rookie-season PPG (D6/CR-09); superseded."
   - Assert before committing: `starterPPG`, `fixture`, `heldOut` and Q4 are identical to `849633a`'s constants
     (diff the JSON ignoring `generatedAt`; report any difference and stop).
   - `git pull --rebase origin main`, `git push origin main` (never `--force`).
7. Hand back: the commit SHAs (the artifacts SHA replaces `849633a` as P12b's pin), files touched, the constants
   identity check result, the new `playerDistribution` n per group, and which Q2 pooled pairs (if any) the new
   rule nulled.

## Fix pass 1 — verification (2026-10-04)

fix-applier: `849633a..a443ea7` (`81bd492` code/tests, `a443ea7` artifacts, overwritten in place — same UTC date —
with the correction wording), pushed. Constants byte-identical to `849633a` except `generatedAt`; panel changed only
in `playerDistribution` (n 27/8/14/19/68 = Q3 units); the Q2 pooled rule nulled nothing on the real data. Disclosed
extra: `runQ2` exported for its test (accepted). `npm test` 1287 pass / 0 fail / 4 skipped; smoke green.

implementation-reviewer re-run (once): **clean, no blocking flags.** The old subtraction now recovers 0 for every
group; a wider linear-span attack over every published aggregate (Q1 sums, league ratio, distribution, all Q2 sides,
and MAEs given the true error signs) isolates no rookie-season or pair (positive control re-finds the three old
leaks). Two LOW test notes left as is: T14(a) would also pass on the old floor (the floor is covered by T5 and
T14(b)); T14(b) takes `pd` from a direct call rather than the serialised panel. Superseded `849633a` artifacts stay
in history (append-only; they disclose the same three rookie-seasons and nothing more). **P12b pins `a443ea7`.**
