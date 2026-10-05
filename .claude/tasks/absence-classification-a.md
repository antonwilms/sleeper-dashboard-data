# Absence classification — Stage A: weekly roster status family + classifier (L5)

Session 1 (opus, parent-folder session by Anton's instruction), 2026-10-05. Item L5 of
`../future_plans/in-season-notes-plan.md` → "Sign-off 2026-10-05 — L1; new item L5". It is planned
against data `4f469cc` and app `d627562`, both clean and level with `origin/main`. **Three task files,
run in order, each verified before the next starts:**

| Stage | File | Repo(s) | Changes served season-totals? |
|---|---|---|---|
| **A** (this file) | `absence-classification-a.md` | data | no — a new internal family plus a pure classifier |
| **B** | `absence-classification-b.md` | data | no — an offline graded before/after check and verdict; **Anton's gate** |
| **C** | `absence-classification-c.md` + `-c2.md` (one change, split for size) | data + app (parent folder) | yes — forward wiring, the Invariant-1 correction of 2016–2025, app tile switch, CR-28 |

Sonnet implements. **Stage A changes nothing the app reads.** `nfl/season-totals/` is untouched.

## 0. Problem and fixed decisions (shared by A–C)

`aggregateWeeks` (`lib/sleeper.mjs:244-375`) marks a week `'D'` only when Sleeper's weekly response
holds the player with `gp ≠ 1`. A player Sleeper leaves out of a week entirely stays `'X'` ("no game
recorded"), even when his team played that week. Session 1 measured this on the committed files,
QB/RB/WR/TE only (positions from `raw/-players-nfl.json`). It counts `'X'` slots whose weekly-roster
team completed a game that week.

| season | existing `'D'` | `'X'` that become `'D'` (D1) | `'X'` that stay (DEV/CUT/…) | no roster row (stay) | player-seasons newly at `gp<10 && dnp≥3` |
|---|---|---|---|---|---|
| 2012–2015 | 1,171–1,654 | **0 — below the classification floor (D4)**; raw match would be 10, 0, 0, 0 | 0 | 603–1,973 | 0 |
| 2016 | 1,690 | 692 | 21 | 1,198 | 57 |
| 2017–2020 | 1,511–1,619 | 589–845 | 1,338–1,510 | 62–285 | 46–60 per season |
| 2021–2025 | 4,666–5,273 | 829–1,119 | 153–220 | 1,031–1,280 | 9–38 per season |

- **2016–2020:** the new misses are mostly `RES` (injured reserve).
- **2021+:** mostly `INA` (gameday inactive). From 2021 Sleeper already returns most inactives with
  `gp 0`, which is why existing `'D'` roughly triples.
- **2012–2015:** the weekly status is not week-accurate (D4). Those seasons stay unchanged.

**D1 — status mapping.** An `'X'` slot becomes `'D'` only when the player has a weekly-roster row for
that REG week whose `status ∈ {ACT, INA, RES, PUP}` and whose team played that week (D2).
- These **stay `'X'`:** `DEV` (practice squad), `CUT`, `RET`, `EXE`, `SUS`, `RSN`, `RSR`, `NWT`,
  `TRC`/`TRD`/`TRT`, `UDF`/`UFA`/`RFA`, `E01`/`E14`, empty, and any code not in the list.
- `SUS`/`RSN` (suspension codes, used through 2022) stay `'X'`, because a suspension is not an
  availability signal. Modern seasons file most suspensions under `RES`, which counts; that is a
  known, small inconsistency, reported.
- *Alternative for Anton:* count `SUS`/`RSN` as missed. That is a one-line change, but only in the
  widening direction. Narrowing the set after Stage C needs a forced Sleeper re-fetch of every season
  (CR-28 Mirror), because the correction is one-way (`'X'` → `'D'` only).

**D2 — "team played week w" is read from the season file's own `TEAM_*` rows.** Team T played week w
⇔ the `TEAM_*` row whose `team === T` has `weeklyStatus[w-1] === 'P'`. Session 1 checked 2012, 2015,
2016, 2020, 2021 and 2025 against the schedule's completed REG games: 0 mismatches. Why not the
schedule:
- `nflverse/schedule` lists unplayed games;
- it refreshes Friday only (`nflverse-schedule.yml` `35 13 * * 5`), so Monday's and Tuesday's
  season-totals runs would not yet see Sunday's scores.

`TEAM_*` rows exist identically in the forward path and in a stored file, so the Stage C migration
and a fresh re-aggregation compute the same thing. A team on bye has no `'P'`, so a bye week never
becomes `'D'`. During the Friday–Tuesday partial week, a team yet to play has no `'P'` either (CR-21's
partial-week rule holds).

One known edge: 2022 week 17, the suspended BUF–CIN game. `TEAM_BUF`/`TEAM_CIN` are `'P'` that week,
because the game started, but there is no completed schedule row. Omitted BUF/CIN players listed
`ACT`/`INA`/`RES`/`PUP` therefore become `'D'`. That is accepted: the game was played in part, and
their players were genuinely unavailable or inactive.

**D3 — only `'X'` → `'D'`.** `'P'`, `'D'` and `'B'` are never touched, `TEAM_*` rows are never
touched, and no row is ever created. A player absent from every Sleeper week has no row and stays
absent. `dnpWeeks` gains one per converted slot. `availability` is recomputed with the existing
`computeAvailability`. `gamesPlayed`, `byeWeeks`, `stats`, `team` and `weeklyPoints` never change.

**D4 — no classification before 2016: `MIN_ABSENCE_CLASSIFY_SEASON = 2016`.** In 2012–2015 the
weekly `status` is a season-level value copied onto every week, not a weekly list:
- measured `RES` rows that fall on a `'P'` (played) slot: 918 (2012), 917 (2013), 1,594 (2015);
- from 2016 on: ≤ 19 per season.

So `classifyAbsences` returns its input unchanged for `season < 2016`. The family is still ingested
from 2012, to cover the source, but the pre-2016 rows get no fallback (D1 has no "blanket rule"
escape hatch).

**D5 — this family is internal.** The app never reads it. It feeds `scripts/update-nfl.mjs` and the
Stage C migration. It is manifest-registered (Invariant 3) and a `data-catalog.md` row says
"internal-only", as `nflverse/playerids.json` does.

## 1. Findings against live source (data `4f469cc`)

1. **Upstream.** `https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_<year>.csv`
   returns HTTP 200 for 2012–2026; 2026 currently holds REG weeks 1–4. Columns include `season`,
   `team`, `position`, `status`, `gsis_id`, `sleeper_id`, `week` and `game_type`.
   - REG weeks: 1–17 through 2020, 1–18 from 2021.
   - Smallest REG week: 1,612 rows (2016).
   - From 2016, teams on bye are not listed that week (fewest teams in a REG week: 26). 2012–2015
     list all 32 teams every week.
   - **Refresh timing (one observation, so treat it as such):**
     - the `weekly_rosters` release asset `roster_weekly_2026.csv` was updated at
       2026-10-05T06:02:48Z;
     - it already listed the current week (Sleeper's `/state/nfl` week 4, on the Monday of week 4's
       games);
     - Jayden Daniels (11566) reads `ACT`, `ACT`, `INA`, `INA` for weeks 1–4, so his omitted week 3
       becomes `'D'`.
2. **Team codes.**
   - 2012–2015 use NFL GSIS codes: `ARZ`, `BLT`, `CLV`, `HST`, `SL`, beside `OAK`/`SD`.
   - 2016+ use the schedule domain (`LA`, `SD`/`LAC`, `OAK`/`LV`) and never `LAR`.
   - Season-totals `TEAM_*` rows carry `team` in the same schedule domain (`TEAM_LAR` has
     `team: 'LA'`).
   - So the five GSIS codes need an alias, and nothing else does (§2.1). This is a new, data-only
     alias, beside CR-16's `SCHEDULE_TEAM_ALIAS` (`lib/sleeper.mjs:22`).
3. **Join.** The key is the row's own `sleeper_id`, else `nflverse/playerids.json`
   `.ids[row.gsis_id]?.sleeperId`. `.ids` is already a gsis → `{ sleeperId, … }` index (6,197 entries,
   0 disagreements with reversed `.bySleeper`), and the existing `rekeyBySleeper`
   (`lib/nflverse.mjs:892`) uses it. It is a plain object, not a Map.
   - Join rate over *roster rows* at QB/RB/WR/TE: 0.74 (2012), 0.88 (2013), 0.87–1.0 (2014–2025),
     0.90 (2026).
   - Over *season-totals played weeks* at QB/RB/WR/TE: ≥ 0.992 every season. Unjoined roster rows
     are fringe players Sleeper has no stats row for.
4. **Duplicates.** (player, week) pairs with more than one row: 414–1,538 per season in 2012–2015
   (each differing in team or status), 0 from 2016. All are kept (§2.2). They fall below the D4
   floor, so classification never reads them.
5. **Pattern to copy.** `scripts/update-snaps.mjs`: a `runSeasonKeyedIngest` spine
   (`lib/seasonIngest.mjs`, hard-coded `inProgress: false`, `schemaVersion: 1`), a below-floor
   `--year` rejected before the spine, a crosswalk read once, and a join rate checked in the
   validator.
6. **Cron slots.** `nfl-season-totals.yml` runs `13 6 * * 1,2,5`, and `cron-deadman.yml` runs
   `19 5 * * *` (commits nothing). `scripts/check-crons.mjs` derives the expected-job set from the
   workflow files themselves, so a new workflow needs no registration.
7. **CLAUDE.md** is 24,897 / 25,000 bytes (`test/claudeMdSize.test.mjs`). Adding the subcommand
   and floors forces a prune in the same commit (§6).

## 2. `lib/nflverse.mjs`

### 2.1 Constants (next to the other coverage floors, CR-18 trigger sites)

```js
const ROSTER_WEEKLY_BASE = 'https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters';
// Weekly roster status is listed from 2012; reserve lists are listed week by week only from 2016
// (absence-classification-a.md D4) — the floor is the file's coverage, not the classifier's.
export const MIN_ROSTERWEEKLY_SEASON = 2012;
// Smallest observed REG week is 1,612 rows (2016); bye teams are absent from their bye week, so a
// week lists 24–32 teams (max six byes observed; 24 leaves room for eight).
export const MIN_ROSTERWEEKLY_WEEK_ROWS = 1500;
export const MIN_ROSTERWEEKLY_WEEK_TEAMS = 24;
// Share of QB/RB/WR/TE roster rows that join to a sleeper_id. Observed 0.74 (2012) – 1.0; this
// guards a broken crosswalk, not fringe-player coverage.
export const ROSTERWEEKLY_JOIN_RATE_MIN = 0.70;
// 2012–2015 files use NFL GSIS team codes; everything else is already the schedule domain.
export const ROSTER_WEEKLY_TEAM_ALIAS = { ARZ: 'ARI', BLT: 'BAL', CLV: 'CLE', HST: 'HOU', SL: 'STL' };
```

### 2.2 Functions

```js
export async function fetchRosterWeeklyCsv(year) {
  return fetchRelease(`${ROSTER_WEEKLY_BASE}/roster_weekly_${year}.csv`);
}

```

`parseRosterWeekly(csv, { season, idsByGsis })` returns
`{ players, weeks, rowCount, unmapped, skillRows, skillJoined, teamsByWeek, rowsByWeek }`:
- **Filter:** keep only `game_type === 'REG'` rows. Use the CSV parser this file already uses for
  the other nflverse families (read it; do not add a dependency).
- **Key:** `row.sleeper_id` if non-empty, else `idsByGsis[row.gsis_id]?.sleeperId` (`idsByGsis` = `playerids.json` `.ids`). If neither resolves,
  `unmapped++` and drop the row.
- **Team:** `ROSTER_WEEKLY_TEAM_ALIAS[row.team] ?? row.team`.
- **Players shape:** `players[sleeperId][week]` is an array of `[team, status]` pairs, sorted by
  team then status. Duplicates are kept (§1.4). `week` is the string key of the integer REG week.
  `status` is stored verbatim; an empty string stays `''`.
- **Counts:** `rowCount` counts REG rows (mapped and unmapped). `skillRows`/`skillJoined` count
  REG rows with `position ∈ {QB, RB, WR, TE}` and how many of them joined. `teamsByWeek[w]` and
  `rowsByWeek[w]` are counts over all REG rows.
- `weeks` is the sorted list of REG weeks present.

### 2.3 `lib/validate.mjs` — `validateRosterWeekly(derived, { year, currentSeason })`

Throws (message prefixed `[rosterweekly]`) when any of the following fails:
- `year >= MIN_ROSTERWEEKLY_SEASON`.
- `weeks` is contiguous from 1.
- A completed season (`year < currentSeason`) has exactly 17 weeks (`year <= 2020`) or 18
  (`year >= 2021`). An in-progress season has `1..n` with `n <= 18`.
- Every week has `rowsByWeek[w] >= MIN_ROSTERWEEKLY_WEEK_ROWS` and
  `teamsByWeek[w] >= MIN_ROSTERWEEKLY_WEEK_TEAMS`. For an **in-progress** season this applies to
  every week except the highest listed one: upstream's append granularity within a week is
  unmeasured, so a partly appended newest week must not freeze the file.
- Every stored team ∈ `SCHEDULE_TEAMS` (module-private in `lib/validate.mjs:39`, same file). Also
  explicitly reject `LAR` and every `ROSTER_WEEKLY_TEAM_ALIAS` key. **Do not** read
  `nflverse/schedule` here.
- `skillJoined / skillRows >= ROSTERWEEKLY_JOIN_RATE_MIN`.

## 3. `lib/absence.mjs` (new, pure, no I/O)

```js
import { computeAvailability } from './sleeper.mjs';

// absence-classification-a.md D1 — roster statuses that make a team-played 'X' week a missed game.
export const MISSED_ROSTER_STATUSES = new Set(['ACT', 'INA', 'RES', 'PUP']);
// D4 — before 2016 the weekly status is a season value copied onto every week; never classify it.
export const MIN_ABSENCE_CLASSIFY_SEASON = 2016;

// D2 — team → Set of 0-based week indices the team played, from the season file's TEAM_* rows.
export function teamPlayedWeeks(totals) { … }   // keys: row.team of every id starting 'TEAM_' with an array weeklyStatus

/**
 * D1–D3. Returns { totals, changedSlots, changedRows, byStatus } — `totals` is a new object: rows
 * that change are shallow-cloned with a fresh weeklyStatus array, dnpWeeks and availability;
 * every other row is the same reference. Input is never mutated.
 * rosterWeekly is the `players` map of nflverse/rosterweekly/<year>.json.
 */
export function classifyAbsences(totals, rosterWeekly, { season }) { … }
```

Rules (exact):
- A non-integer `season` throws. For `season < MIN_ABSENCE_CLASSIFY_SEASON`, return
  `{ totals, changedSlots: 0, changedRows: 0, byStatus: {} }` with the **same** `totals` reference,
  before any other check (so `rosterWeekly` may be null there).
- Skip ids starting `TEAM_`, and rows whose `weeklyStatus` is not an array.
- For each index `i` with `weeklyStatus[i] === 'X'`, convert to `'D'` iff some pair
  `[team, status]` in `rosterWeekly[id]?.[String(i + 1)] ?? []` has
  `MISSED_ROSTER_STATUSES.has(status)` and `played.get(team)?.has(i)`.
- `byStatus` counts conversions by the first qualifying status.
- A changed row gets `dnpWeeks: (row.dnpWeeks ?? 0) + n` and
  `availability: computeAvailability(newWeeklyStatus)`.
- `changedSlots` and `changedRows` are totals across all rows.
- A `null` or `undefined` `rosterWeekly` **throws** (`classifyAbsences: rosterWeekly is required`).
  The callers decide what a missing file means (Stage C).

## 4. `scripts/update-rosterweekly.mjs` + CLI + workflow

- **Script.** Copy `scripts/update-snaps.mjs`'s structure. Header doc names this file, D5 (internal)
  and the D1 status set's home (`lib/absence.mjs`).
  - **Seasons:** `--all` processes `MIN_ROSTERWEEKLY_SEASON..currentSeason`. `--year` below the
    floor throws before the spine. The default is `currentSeason`.
  - **Crosswalk:** read `nflverse/playerids.json` once; throw if `.ids` is missing (dry-run warns
    and returns, as snaps does).
  - `dataPath: s => \`nflverse/rosterweekly/${s}.json\``. `derive` returns `null` when the fetch
    returns `null`. `gateRowCount: o => o.rowCount`. `minRows: 1` (snaps' rationale; the validator
    is the real gate).
  - `validate` calls `validateRosterWeekly(o, { year, currentSeason })`.
  - Hash `stableHash(o.players, deepSortKeys)`. Nested week keys arrive in CSV order, so a shallow
    sort would make an upstream reorder look like a change.
  - Write minified: pass the spine `deps.writeJsonStable: (p, body) => d.writeJsonStable(p, body, { minify: true })`.
    `lib/seasonIngest.mjs:163` calls it with two arguments. Pretty-printed, the files are
    1.3–2.7 MB per season; minified, 0.34–0.73 MB.
  - Envelope `{ schemaVersion: 1, season, generatedAt, rowCount, playerCount, unmapped, weeks, players }`.
    `manifestRecordCount: o => o.rowCount`. Messages are modelled on snaps, prefix `[rosterweekly]`.
- **CLI.** `bin/update.mjs`: `rosterweekly` subcommand with `--year`/`--all`/`--force`/`--dry-run`,
  plus help lines in the existing block's style. `lib/args.mjs`: add `'rosterweekly'` to
  `ALL_SUBCOMMANDS` and to its doc comment.
- **Workflow** `.github/workflows/nflverse-rosterweekly.yml` (a caller of `_ingest.yml`; copy
  `nflverse-depth.yml`):
  - `cron: "23 6 * * *"` (daily). The comment says why:
    - upstream's asset was observed updating at ~06:02 UTC (one observation, 2026-10-05);
    - this runs after it every day and commits only on change;
    - `nfl-season-totals.yml` (06:13 Mon/Tue/Fri) therefore classifies against the previous
      morning's refresh, so a week's gameday inactives (`INA`) reach `'D'` one season-totals run
      after the games — Sunday's on Tuesday, Monday night's on Friday;
    - clear of `nfl-season-totals` (06:13) and `registry-mirror` (06:41, commits nothing).
  - `sparse-paths: nflverse/rosterweekly` + `nflverse/playerids.json`.
  - `commit-scope: "nflverse/"`, `commit-message: "nflverse: rosterweekly"`,
    `purge-path: "nflverse/rosterweekly/<season>.json"`, `season-keyed: true`.
- **Invariant 8:** add `nflverse/rosterweekly` to the season-keyed purge list in CLAUDE.md's
  Invariant 8 (§6).
- **`npm run smoke`:** append `&& node bin/update.mjs rosterweekly --year 2016 --dry-run`.

## 5. Backfill (in this stage's commit set)

Run `node bin/update.mjs rosterweekly --all` and commit `nflverse/rosterweekly/2012.json` …
`2026.json` with their manifest entries, as a separate commit after the code commit. Report each
season's `rowCount`, `playerCount`, `unmapped`, join rate and file size. If any season fails the
validator, stop and report rather than loosening a floor.

## 6. Docs (code commit)

- **`data-catalog.md`:** new `nflverse/rosterweekly` row (source URL, grain player × REG week,
  sleeper-keyed, coverage 2012+ with the 2012–2015 reserve-list caveat, gates §2.3, cadence
  daily 06:23 UTC, **internal-only — never read by the app; consumed by `scripts/update-nfl.mjs`
  from absence-classification-c**). Phrase the consumer as Stage C's, since Stage A ships first;
  Stage C re-words it to present tense.
- **`README.md`:** an Update-scripts entry, a File-schemas entry (the envelope in §4), and a
  Module-notes entry for `lib/absence.mjs` (D1–D3 stated as mechanism).
- **`CLAUDE.md`:**
  - Commands table: add `rosterweekly` to the Update subcommand list.
  - Navigation: the `lib/nflverse.mjs` coverage-floors list gains `MIN_ROSTERWEEKLY_SEASON`,
    `MIN_ROSTERWEEKLY_WEEK_ROWS`, `MIN_ROSTERWEEKLY_WEEK_TEAMS` and `ROSTERWEEKLY_JOIN_RATE_MIN`.
  - The `lib/args.mjs` row's `ALL_SUBCOMMANDS` list gains `rosterweekly`.
  - Add `rosterweekly` to the `scripts/update-{…}.mjs` row.
  - Stale counts, fixed in the same pass:
    - the `lib/seasonIngest.mjs` row: "the five season-keyed family ingests (`schedule`,
      `teamcontext`, `oline`, `gamelogs`, `advstats`)" → "the eight season-keyed family ingests
      (`schedule`, `teamcontext`, `oline`, `gamelogs`, `advstats`, `snaps`, `depth`, `rosterweekly`)";
    - the `.github/workflows/` row: "Ten uniform ingest jobs" → "Eleven";
    - the Commands paragraph's `--force` and `--all` family lists: add `rosterweekly`.
  - Invariant 8's list gains `nflverse/rosterweekly`.
  - Add a one-line `lib/absence.mjs` row: "pure weekly-roster absence classifier (`classifyAbsences`)
    for season-totals `weeklyStatus`".
  - **Prune** to stay ≤ 25,000 bytes. First candidate: replace
    "(2013 — **not** the 2012 floor its nflverse siblings share; `snap_counts_2012.csv` exists
    upstream but is header-only)" with "(2013 — the 2012 upstream file is header-only)". If more is
    needed, shorten the `.github/workflows/` row's standalone list by pointing to README for the
    names. `test/claudeMdSize.test.mjs` must pass.
- **No registry edit in Stage A.** The family has no app reader, and the new coupling lands with
  its first served effect in Stage C (CR-28). Session 2 does not touch `cross-repo-registry.md`.

## 7. Tests (`test/rosterweekly.test.mjs`, `test/absence.test.mjs`, `test/update-rosterweekly.test.mjs`)

- **R-1 parse:** a CSV fixture string with REG + WC rows, a GSIS-coded team (`HST`), a row with only
  `gsis_id`, an unmappable row and a duplicate (player, week). Assert:
  - WC is dropped;
  - `HST` → `HOU`;
  - the gsis row is keyed via the crosswalk;
  - `unmapped === 1`;
  - the duplicate keeps both pairs, sorted;
  - the skill counts are correct.
- **R-2 validate:** each throw in §2.3 fires on a minimal failing input (one case per rule), and a
  passing 17-week completed season and a 4-week in-progress season do not throw.
- **R-3 update script:** with injected deps (snaps test pattern), assert:
  - a below-floor `--year` throws before any fetch;
  - a dedup hit makes no write;
  - a completed season without `--force` hits the force gate;
  - the envelope shape is §4's.
- **A-1 classify basics:**
  - `X` + `[['KC','INA']]`, with KC played that week, becomes `'D'`;
  - `X` + `DEV` stays `'X'`;
  - `X` + `ACT` on a team on bye stays `'X'`;
  - `X` with no roster entry stays `'X'`;
  - `'B'` with an `ACT` entry is untouched;
  - `'P'` and `'D'` are untouched;
  - a `TEAM_*` row is untouched.
- **A-2 traded week:** two pairs in one week, `[['NYJ','TRD'],['KC','ACT']]`, with only KC played,
  becomes `'D'`, and `byStatus.ACT === 1`.
- **A-3 bookkeeping:**
  - `dnpWeeks` rises by exactly the converted count;
  - `availability` equals `computeAvailability(newStatus)`;
  - `gamesPlayed`/`byeWeeks`/`stats`/`team`/`weeklyPoints` are deep-equal to the input;
  - the input object is not mutated (deep-equal to a pre-call `structuredClone`);
  - an unchanged row is the same reference.
- **A-4 partial week:** a `TEAM_KC` row with `'P'` in weeks 1–3 only; a KC player with `X` in week
  4 and `ACT` in roster week 4 stays `'X'`.
- **A-5 missing roster:** `classifyAbsences(totals, null)` throws.
- **A-6 status set:** `MISSED_ROSTER_STATUSES` equals exactly `{ACT, INA, RES, PUP}`.
- **A-7 floor:** with `season: 2015`, a slot that would convert at 2016 stays `'X'`, the returned
  `totals` is the input reference, and `rosterWeekly: null` does not throw. With `season: 2016` it
  converts.
- **R-4 team domain:** a stored `LAR`, and a surviving `HST` (alias bypassed in the fixture), each
  throw.

## 8. Touch list, done-definition, commit

Touch list:
- `lib/nflverse.mjs`, `lib/validate.mjs`, `lib/absence.mjs` (new), `scripts/update-rosterweekly.mjs`
  (new), `bin/update.mjs`, `lib/args.mjs`;
- `.github/workflows/nflverse-rosterweekly.yml` (new), `package.json` (smoke);
- `data-catalog.md`, `README.md`, `CLAUDE.md`;
- the three test files;
- `nflverse/rosterweekly/*.json` and `manifest.json` (backfill commit);
- this task file.

**Not touched:** `lib/sleeper.mjs`, `scripts/update-nfl.mjs`, `nfl/season-totals/`,
`cross-repo-registry.md`, anything in the app repo.

Done-definition (data CLAUDE.md): `npm test` and `npm run smoke` green; `manifest.json` carries the
15 new entries; the `data-catalog.md` row is present. Commits:
1. `Weekly roster status family + absence classifier (L5 Stage A)`, with the attribution trailer.
2. `nflverse: rosterweekly backfill 2012–2026`.

Push only after Session 1 verification (git-workflow.md: `git pull --rebase origin main` first;
`manifest.json` conflicts resolve as a union).

## Cross-repo impact (Stage A)

- **CR-04** (manifest contract) — the 15 new entries are additive. Mirror, quoted: "New families are
  additive and need no app change (the app already keys by path)." No CR-04 text change in A; its
  stale writer counts are corrected in Stage C §4.2.
- **CR-18** (signal registry rows) — **fires.** Stage A adds an ingested source. Mirror, quoted:
  "This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a
  script the list above cannot already name. The listed sites are every one that exists today; a
  *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its
  own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo
  change adds, removes or reclassifies an ingested field, stat key or source — or alters its
  historical coverage or reconstructable-vs-ephemeral status — emit the exact
  `docs/signal-registry.md` row edit the app must make (layer · source · coverage ·
  reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the
  data side in the same change. **Nothing fails in either repo when this drifts** — the registry
  simply becomes wrong, and since it is the inventory that governs snapshot-capture and
  grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo
  cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable."

  **The emitted row edit (the deliverable).** Stage C applies it in the app, in the same program,
  because the family's only effect, served `'D'`, starts there. Insert a new row in
  `docs/signal-registry.md` directly after the fantasy-scoring-core row:
  - Signal: nflverse weekly roster status (`status` per player × REG week).
  - Layer: raw ingested data.
  - Source: data `nflverse/rosterweekly/<year>.json` ← nflverse `weekly_rosters`
    (`scripts/update-rosterweekly.mjs`), internal-only.
  - Coverage: **2012+** ingested; week-accurate and used for classification **2016+**
    (`MIN_ABSENCE_CLASSIFY_SEASON`).
  - Status: **Reconstructable**.
  - Current use: active→`projectedGames`/durability, the bounce-back flag, the dynasty
    injury-risk/bounce-back badges and reliability **only through served `weeklyStatus`/`dnpWeeks`**
    (classifies omitted weeks, CR-28); never read by the app.

  The `data-catalog.md` row is made in this stage (§6).
- **No other entry** is touched in A. The app reads nothing new and `nfl/season-totals` is
  unchanged. The new coupling (CR-28) and the CR-02/CR-16/CR-21 text changes land in Stage C, when
  `weeklyStatus` first changes meaning.

## Review record — plan gate round 1 (2026-10-05, all stages)

Two reviewers ran:
- the data repo's plan-reviewer mandate (general-purpose, opus, full depth) over A, B and C;
- the app's plan-reviewer over C's app side and B §0's app claims.

38 flags in total (5 high). Each was checked against live source. All were applied **except one,
rejected**.

| # | Flag (source) | Decision |
|---|---|---|
| 1 | (data, HIGH) Upstream appends a week days late, so C-D2's hard error halts week 1 | **Rejected (premise false):** on 2026-10-05 Sleeper's current week is 4 and the roster already lists week 4 (Daniels `INA` wk 3–4). The kept part, applied: C-D2 warns and writes unclassified for an in-progress season with no roster file and no season file yet |
| 2 | (data) Cron 05:43 runs before upstream's ~06:02 refresh | Applied: daily 06:23. A one-run lag for gameday inactives is stated in C-D3, CR-21 and CR-28 |
| 3 | (data+app, HIGH) DM-1 goes red once C rewrites the files | Applied: B DM-0 pre-correction fixture from `4f469cc` |
| 4 | (app, HIGH) `wasContributorSeason` falls through on below-floor snap share; B copied the comment, not the code | Applied: B §1.2 and DM-3 follow the code (`:70-79`) |
| 5 | (data) 2012–2015 weekly status is season-level (RES on played slots) | Applied: `MIN_ABSENCE_CLASSIFY_SEASON = 2016`; migration scope 2016–2025 |
| 6 | (data) The correction is one-way | Applied: C-D6; CR-28 Mirror rewritten; the SUS/RSN alternative is widening-only |
| 7 | (data) The new gsis helper duplicates `.ids` | Applied: join on `.ids[gsis].sleeperId`; helper dropped |
| 8 | (data) C step 2 compares with totals B never emits | Applied: B emits per-season all-row totals |
| 9 | (data) CR-18 fires in A | Applied: CR-18 quoted in A, row emitted there, applied in C2 |
| 10 | (data+app) CR-18 data-side triggers miss the new sites | Applied (C2 §4.2) |
| 11 | (data+app) CR-02 replacement drops the no-team gap; CR-28 Invariant contradicts it | Applied: gap kept, CR-28 Invariant restated |
| 12 | (app) CR-02 Triggers' Portfolio clause describes the deleted inference | Applied |
| 13 | (app) CR-28 Direction should be `both` (data-side mirror of app code) | Applied |
| 14 | (app) Missed consumers: badges, dynasty label, summary lines | Applied: B §0 and CR-28 App side |
| 15 | (data) CR-28 Data side misses `loadAbsenceSegments`, panel `dnpWeeks` reads | Applied; panel non-comparability note in C §2.4 |
| 16 | (data) CR-03 not quoted | Applied |
| 17 | (data) CR-04 counts delegated to a faulty grep | Applied: exact counts written (16/17, 8 spine, 6 non-update) |
| 18 | (app) CR-25 not reconciled with C-D4 | Applied: C-D4 states why it is not fired |
| 19 | (data+app) Push order should be data first | Applied, plus the 06:13 window and pull-before-run |
| 20–38 | Delete range `:589-603`; registry anchors (text, not line); sweep exclusions; `availabilityGrid.js:6-8` wording; drop the nonexistent app registry-test gate (use the drift command); smoke "before" from B's table; D-63 house style; `deepSortKeys`; minified writes; `SCHEDULE_TEAMS` domain check; in-progress newest-week floor exemption; duplicate/bye/2022 wk-17 facts; CLAUDE.md stale counts; B registry gap on verdict (c); B reads app at the pin via `git show`; CR-28 triggers named as symbols; `isValidSeasonTotals` referenced | All applied |

Sizes after the round: A ~27 KB, B ~17 KB, C 17 KB, C2 26 KB. C was split into C and C2 because
the round pushed it over 40 KB.
