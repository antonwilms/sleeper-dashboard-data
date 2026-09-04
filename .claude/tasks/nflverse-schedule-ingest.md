# Task: nflverse schedules ingest (`bin/update.mjs schedule [--year YYYY] [--all]`)

**Repo:** sleeper-dashboard-data
**Implementer:** sonnet. This is a planning-only opus task — **do not edit source from the opus session.**

Serve nflverse NFL schedules + results (the `load_schedules()` / `games.csv` dataset)
as per-season JSON at `nflverse/schedule/<year>.json`, mirroring the roster file layout.
This is a **backfill + weekly-refresh** dataset (schedules/results/Vegas lines are
reconstructable, not capture-only): backfill every historical season once, refresh the
current season weekly in-season.

This plan **reuses the existing nflverse ingest mechanism** — it does not invent a parallel
one. Fetch + parse mirror the **draft** path (one combined CSV → grouped by season);
output, sparsity gate, content-hash dedup, season-keyed CDN purge, and the weekly Action
mirror the **roster/advstats** path (per-season files keyed by NFL season). Do not duplicate
or fork shared helpers (`fetchRelease`, `readJson`/`writeJsonStable`/`setStepOutput`,
`updateManifestEntry`, `splitCsvLine`).

Do not re-list CLAUDE.md invariants or commands here — this plan points at them. The one that
matters most: **invariant 5** (roster/draft/playerids/advstats are script-produced primary data,
`inProgress:false` deviation, never hand-edited) — schedule extends it. And **invariant 8**
(season-keyed CDN purge URLs come from the node step's `season` output, never `date -u +%Y`).

---

## 1. Source verification (done — live fetch 2026-06-21)

**Source (single combined CSV, all seasons 1999→present; this is the file
`nflreadr::load_schedules()` wraps):**

```
https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv
```

This is a **raw.githubusercontent.com** URL on the `nfldata` repo's `master` branch — *not* a
release asset like roster/draft/advstats. It is still CORS-blocked in the browser (raw GitHub
sets no permissive CORS for fetch from another origin), so server-side ingest + jsDelivr serving
is required exactly as for the release-asset sources. Reuse `fetchRelease()` (it follows redirects
and returns `null` on 404/504) — the URL just isn't a release asset; the helper is URL-agnostic.

**Header confirmed (resolve every column by name via `header.indexOf` — never hardcode an index):**

```
game_id,season,game_type,week,gameday,weekday,gametime,away_team,away_score,home_team,
home_score,location,result,total,overtime,old_game_id,gsis,nfl_detail_id,pfr,pff,espn,ftn,
away_rest,home_rest,away_moneyline,home_moneyline,spread_line,away_spread_odds,
home_spread_odds,total_line,under_odds,over_odds,div_game,roof,surface,temp,wind,
away_qb_id,home_qb_id,away_qb_name,home_qb_name,away_coach,home_coach,referee,stadium_id,stadium
```

Columns this ingest consumes (the rest are dropped): `game_id, season, game_type, week,
away_team, away_score, home_team, home_score, result, spread_line, total_line, roof, surface,
temp, wind`.

**Empirically verified (live, 2026-06-21):**
- Total ≈ 7548 game rows, seasons 1999→2026.
- Per-season counts: 2019=267, 2020=269, 2021–2025=284–285, **2026 (current) = 272** (REG only;
  playoff rows fill in later). Pre-2021 REG seasons are 256 games + playoffs ≈ 267. → informs
  the sparsity gate (§2, decision 4).
- **Current-season in-progress edge case is real:** all 272 of the 2026 rows have **empty
  `result`/`home_score`/`away_score`** (games not played) **but `spread_line`/`total_line`
  already populated** (e.g. `2026_01_NE_SEA` → spread `3.5`, total `44.5`). The parser must emit
  `null` scores/result while keeping the lines. `temp`/`wind` are empty for future games.
- **Dome null-weather edge case confirmed:** `2026_01_SF_LA` has `roof=dome`, empty `temp`/`wind`
  → both serialize to `null`. Older seasons also lack weather columns for many games.
- `result` is the **home margin** (`home_score − away_score`): e.g. `1999_01_KC_CHI` away KC 17,
  home CHI 20 → `result = 3`. A tie is `result = 0` — the parser must keep `0`, not coerce to null.

---

## 2. Decisions (each with recommendation + justification)

### Decision 1 — Output layout: per-season files keyed by NFL season
Serve `nflverse/schedule/<year>.json`, one file per season, exactly like
`nflverse/roster/<year>.json` and `nflverse/advstats/<year>.json`. **Not** a single combined
file (despite the single combined source CSV) — per-season files give the app cheap per-season
fetches, append-only historical immutability, and let the weekly Action rewrite only the current
season. The combined-CSV→grouped-by-season parse is the *draft* pattern; the per-season *write* is
the *roster* pattern. This is the deliberate hybrid.

### Decision 2 — Served field names: camelCase (repo convention), not nflverse snake_case
Every served contract in this repo camelCases its keys (`fullName`, `gsisId`, `targetShare`,
`airYardsShare`, `picksByYear`). Follow it: `gameId, homeTeam, spreadLine, …`. The source→served
mapping is documented in the README field table (§Docs) so the snake_case origin stays traceable.

### Decision 3 — Per-game shape is exactly the 15 contract fields; nothing more (for now)
Carry precisely: `gameId, season, week, gameType, homeTeam, awayTeam, homeScore, awayScore,
result, spreadLine, totalLine, roof, surface, temp, wind`. This keeps the cross-repo contract
surface minimal. **Deliberately excluded** (present in source, add only in a later slice if the app
needs them): `gameday`, `gametime`, `total` (actual combined points — distinct from `totalLine`),
`overtime`, `div_game`, moneyline/odds columns, QB/coach/referee/stadium. Note the exclusion so a
future reader knows it was a choice, not an oversight.

### Decision 4 — Sparsity gate `MIN_SCHEDULE_GAMES = 200`
A published season has its full slate at once (REG rows appear at schedule release with null
scores; playoff rows fill later). Lowest observed completed season is 256 REG (pre-2021) ≈ 267
with playoffs; current 2026 already has 272. `200` comfortably passes any fully-published season
while catching a truncated fetch. A season with **0** parsed rows = not-yet-published → log + skip
(the roster-404 analogue). A season with `0 < count < 200` → "preliminary" → skip. The app
re-asserts the same `MIN_SCHEDULE_GAMES` constant on `rowCount` (cross-repo constant — change both).

### Decision 5 — Season floor `MIN_SCHEDULE_SEASON = 1999`
`games.csv` begins in 1999, so this is effectively "include everything available" (the floor is an
explicit guard against a stray malformed/blank `season` cell, mirroring `MIN_DRAFT_YEAR`'s role).
Backfill all seasons; they are static once final.

### Decision 6 — `result` and lines passed through verbatim (parse-to-number, never recompute)
Take `result` straight from the `result` column (= home margin). Do **not** recompute it from
scores — preserve the source value as-is (same ethos as the season-totals "preserve stat keys"
contract). `spreadLine`/`totalLine` likewise passed through from `spread_line`/`total_line`
(home-relative spread per nflverse: positive = home favored). Numeric coercion via a shared
`numOrNull` helper: empty string or `NA` → `null`; everything else → `Number(x)`. The helper must
treat `"0"` as `0` (tie game; not null) — test it (§Tests).

### Decision 7 — `inProgress: false` always (extends invariant 5)
Same deviation as roster/advstats: the app has **no live fallback** for historical schedules — it
must read them from the store. The current-season file mutates weekly (scores fill in); that
mutability is handled by SHA-256 content-hash dedup (write only when changed) + `lastModified`-driven
app cache invalidation, **not** by `inProgress: true`. Do not set `inProgress: true`. (CLAUDE.md
invariant 5.)

### Decision 8 — Weekly Action cadence: Friday 13:35 UTC
NFL games land Thu/Sun/Mon (Sat in playoffs); by Friday the prior week's `result`/scores are
settled and the upcoming week's lines are posted. Friday also sits clear of the other weekly
committers (KTC Mon 13:17, roster Tue 13:23, playerids Wed 13:29, advstats Thu 13:41) — distinct
day, off-hour minute `:35`. cron `35 13 * * 5`. The Action runs the **default** (current-season)
mode only; `--all` backfill is manual.

---

## 3. Edits grouped by file

> Anchors are line numbers as of this plan. Read narrowly around them; do not open whole files.
> Function signatures are normative.

### File: `lib/nflverse.mjs` (fetch + parse helpers)

**Edit 3.1 — add sparsity/floor constants.** In the "Shared constants" block (currently ends at the
`MIN_ADVSTATS_ROWS` export, **line 33**), append two exports:

```js
/** Earliest NFL season present in nfldata games.csv; floor guard for parseSchedulesCsv. */
export const MIN_SCHEDULE_SEASON = 1999;

/**
 * Minimum game rows for a season's schedule file to ship. A fully-published season
 * has its whole slate at once (≈256–285 games incl. playoffs); 200 catches a
 * truncated fetch while passing any published season. The app re-asserts this on rowCount.
 */
export const MIN_SCHEDULE_GAMES = 200;
```

**Edit 3.2 — add the source URL.** In the "Source URLs" block (`ROSTER_BASE … STATS_BASE`,
**lines 37–40**), add:

```js
const SCHEDULES_URL = 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv';
```

**Edit 3.3 — add a `numOrNull` helper.** Place it just under `splitCsvLine` (after **line 76**),
exported so the validator/tests can reuse it:

```js
/**
 * Coerce a CSV cell to a finite number or null. Empty string and the literal 'NA'
 * → null; otherwise Number(x). Returns null (not NaN) for unparseable values.
 * NOTE: '0' → 0 (preserve tie-game result / zero scores), never null.
 * @param {string|undefined} raw
 * @returns {number|null}
 */
export function numOrNull(raw) {
  const s = (raw ?? '').trim();
  if (s === '' || s === 'NA') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
```

**Edit 3.4 — add `fetchSchedulesCsv` + `parseSchedulesCsv`.** Append a new
`// ─── Schedules ───` section at the **end of the file (after line 616, after `rekeyBySleeper`)**.
(End-of-file append avoids renumbering the middle; logically it is a sibling of the draft combined-CSV
helpers and may alternatively be placed after `parseDraftCsv` at line 273 — implementer's choice,
end-of-file preferred for minimal churn.)

```js
/**
 * Fetch the combined nfldata games.csv (all seasons 1999→present).
 * Returns CSV text, or null on 404/504 (same convention as fetchRelease).
 * @returns {Promise<string|null>}
 */
export async function fetchSchedulesCsv() {
  return fetchRelease(SCHEDULES_URL);
}

/**
 * Parse the combined schedules CSV into per-season game arrays.
 *
 * Required columns (throws if any missing — fail-loud on upstream format change):
 *   game_id, season, home_team, away_team.
 * Rows with NaN season or season < minSeason are skipped.
 * Numeric fields (scores, result, lines, temp, wind) use numOrNull: empty/'NA' → null,
 * '0' preserved as 0. String fields (gameType, roof, surface) → trimmed string or null.
 *
 * @param {string} csv  Raw CSV text from fetchSchedulesCsv
 * @param {object} [opts]
 * @param {number} [opts.minSeason=MIN_SCHEDULE_SEASON]
 * @returns {{ gamesBySeason: object, count: number }}
 *   gamesBySeason: { [year: string]: Game[] }
 *   Game: { gameId, season, week, gameType, homeTeam, awayTeam, homeScore, awayScore,
 *           result, spreadLine, totalLine, roof, surface, temp, wind }
 */
export function parseSchedulesCsv(csv, { minSeason = MIN_SCHEDULE_SEASON } = {}) {
  const lines = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) return { gamesBySeason: {}, count: 0 };

  const header   = splitCsvLine(lines[0]);
  const iGameId  = header.indexOf('game_id');
  const iSeason  = header.indexOf('season');
  const iWeek    = header.indexOf('week');
  const iType    = header.indexOf('game_type');
  const iHome    = header.indexOf('home_team');
  const iAway    = header.indexOf('away_team');
  const iHomeSc  = header.indexOf('home_score');
  const iAwaySc  = header.indexOf('away_score');
  const iResult  = header.indexOf('result');
  const iSpread  = header.indexOf('spread_line');
  const iTotal   = header.indexOf('total_line');
  const iRoof    = header.indexOf('roof');
  const iSurface = header.indexOf('surface');
  const iTemp    = header.indexOf('temp');
  const iWind    = header.indexOf('wind');

  if (iGameId === -1 || iSeason === -1 || iHome === -1 || iAway === -1) {
    throw new Error(
      `[nflverse] parseSchedulesCsv: required columns missing — ` +
      `game_id=${iGameId !== -1}, season=${iSeason !== -1}, ` +
      `home_team=${iHome !== -1}, away_team=${iAway !== -1}. Possible upstream CSV format change.`
    );
  }

  const str = (f, i) => (i !== -1 ? (f[i]?.trim() || null) : null);
  const gamesBySeason = {};

  for (let i = 1; i < lines.length; i++) {
    const f = splitCsvLine(lines[i]);
    const season = parseInt(f[iSeason], 10);
    if (isNaN(season) || season < minSeason) continue;

    const game = {
      gameId:    f[iGameId]?.trim() || null,
      season,
      week:      iWeek !== -1 ? (parseInt(f[iWeek], 10) || null) : null,
      gameType:  str(f, iType),
      homeTeam:  str(f, iHome),
      awayTeam:  str(f, iAway),
      homeScore: numOrNull(f[iHomeSc]),
      awayScore: numOrNull(f[iAwaySc]),
      result:    numOrNull(f[iResult]),
      spreadLine: numOrNull(f[iSpread]),
      totalLine:  numOrNull(f[iTotal]),
      roof:      str(f, iRoof),
      surface:   str(f, iSurface),
      temp:      numOrNull(f[iTemp]),
      wind:      numOrNull(f[iWind]),
    };
    if (!game.gameId || !game.homeTeam || !game.awayTeam) continue; // skip malformed rows

    const key = String(season);
    (gamesBySeason[key] ??= []).push(game);
  }

  const count = Object.values(gamesBySeason).reduce((s, arr) => s + arr.length, 0);
  return { gamesBySeason, count };
}
```

### File: `lib/validate.mjs` (validator)

**Edit 3.5 — extend the constants import.** The `import { MIN_ROSTER_IDS, MIN_PLAYERID_ROWS,
MIN_ADVSTATS_ROWS } from './nflverse.mjs';` at **line 267** → add `MIN_SCHEDULE_GAMES`.

**Edit 3.6 — add `validateSchedule`.** Insert a new `// ─── nflverse schedule ───` section after
`validateAdvStats` (ends **line 394**), before the enrichment section (line 396):

```js
/**
 * Validates a parsed schedule games array for one season (defence-in-depth after the
 * sparsity gate in scripts/update-schedule.mjs). Throws on clearly bad data.
 *
 * @param {Array} games  Game[] from parseSchedulesCsv (one season)
 * @param {object} opts
 * @param {number} opts.year
 */
export function validateSchedule(games, { year }) {
  if (!Array.isArray(games)) {
    throw new Error(`[validate] schedule ${year}: expected array, got ${typeof games}`);
  }
  if (games.length < MIN_SCHEDULE_GAMES) {
    throw new Error(
      `[validate] schedule ${year}: only ${games.length} games — ` +
      `expected ≥ ${MIN_SCHEDULE_GAMES}. Possible truncated/preliminary fetch.`
    );
  }
  // Format-drift guard: every game needs a gameId + both teams. >50% missing → column drift.
  let missing = 0;
  for (const g of games) {
    if (!g.gameId || !g.homeTeam || !g.awayTeam) missing++;
  }
  if (missing > games.length * 0.5) {
    throw new Error(
      `[validate] schedule ${year}: ${missing}/${games.length} games missing gameId/home/away — ` +
      `possible upstream CSV format change.`
    );
  }
}
```

### File: `scripts/update-schedule.mjs` (NEW — the writer)

Model on `scripts/update-roster.mjs` (season resolution, `setStepOutput('season', …)`, sparsity gate,
content-hash dedup, force gate, `inProgress:false` manifest write) and `scripts/update-draft.mjs`
(combined-CSV fetch; a `gamesHash` mirroring `picksByYearHash`). Export `updateSchedule` and `gamesHash`.

```js
/**
 * scripts/update-schedule.mjs — nflverse schedules (games.csv) writer.
 *
 * Fetches the single combined nfldata games.csv, groups by season, and writes
 * per-season nflverse/schedule/<year>.json files.
 *
 * Modes:
 *   default              → write current season only (the weekly Action's mode).
 *   --year YYYY          → write that one season.
 *   --all                → backfill every season ≥ MIN_SCHEDULE_SEASON (manual).
 *
 * Key behaviours (mirror roster/advstats):
 *   - 0 rows for a season → "not published yet" → skip.
 *   - rowCount < MIN_SCHEDULE_GAMES → preliminary → skip.
 *   - Content-hash dedup per season: identical games → no write, no manifest touch.
 *   - --force required to overwrite a completed past season (year < currentSeason).
 *   - inProgress: ALWAYS false (CLAUDE.md invariant 5 — no app live fallback).
 *
 * @param {object} opts
 * @param {number|null} opts.year   Season; null = current (unless all).
 * @param {boolean}     opts.all    Backfill all seasons.
 * @param {boolean}     opts.dryRun Fetch + validate, print plan, no writes.
 * @param {boolean}     opts.force  Overwrite completed past-season files.
 */
import crypto from 'crypto';
import { fetchSchedulesCsv, parseSchedulesCsv, MIN_SCHEDULE_GAMES } from '../lib/nflverse.mjs';
import { readJson, writeJsonStable, setStepOutput } from '../lib/io.mjs';
import { updateManifestEntry } from '../lib/manifest.mjs';
import { validateSchedule } from '../lib/validate.mjs';
import { fetchCurrentNflSeason } from '../lib/sleeper.mjs';

export function gamesHash(games) {
  // Sort by gameId for a stable hash regardless of CSV row order.
  const stable = [...games].sort((a, b) => (a.gameId < b.gameId ? -1 : a.gameId > b.gameId ? 1 : 0));
  return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

export async function updateSchedule({ year: yearOpt = null, all = false, dryRun = false, force = false } = {}) {
  const currentSeason = await fetchCurrentNflSeason();

  // Fetch once (combined CSV); throw on null — games.csv should always be published (draft analogue).
  console.log('[schedule] Fetching games.csv…');
  const csv = await fetchSchedulesCsv();
  if (csv === null) {
    throw new Error(
      '[schedule] games.csv returned 404/504 — unexpected (file should always be published). ' +
      'Check https://github.com/nflverse/nfldata/blob/master/data/games.csv'
    );
  }

  const { gamesBySeason } = parseSchedulesCsv(csv);

  // Resolve target seasons
  let seasons;
  if (all)              seasons = Object.keys(gamesBySeason).map(Number).sort((a, b) => a - b);
  else if (yearOpt)     seasons = [yearOpt];
  else                  seasons = [currentSeason];

  // Surface the season to the Actions purge step (single-season modes only; no-op locally).
  // The weekly Action always runs default mode → this is currentSeason.
  if (!all) setStepOutput('season', seasons[0]);

  for (const season of seasons) {
    const games = gamesBySeason[String(season)] ?? [];
    const isPast = season < currentSeason;

    if (games.length === 0) {
      console.log(`[schedule] season ${season} not published yet — skipping`);
      continue;
    }
    if (games.length < MIN_SCHEDULE_GAMES) {
      console.log(`[schedule] season ${season} only ${games.length} games (< ${MIN_SCHEDULE_GAMES}) — preliminary, skipping`);
      continue;
    }

    validateSchedule(games, { year: season });

    const dataPath = `nflverse/schedule/${season}.json`;
    const existing = readJson(dataPath);
    const newHash  = gamesHash(games);
    const lastHash = existing?.games ? gamesHash(existing.games) : null;

    if (newHash === lastHash) {
      console.log(`[schedule] season ${season}: identical to ${dataPath} — no change.`);
      continue;
    }
    if (isPast && existing && !force) {
      throw new Error(`[schedule] ${dataPath} exists for completed season ${season}. Use --force to overwrite.`);
    }
    if (dryRun) {
      console.log(`[schedule] [dry-run] would write ${dataPath}: ${games.length} games`);
      continue;
    }

    writeJsonStable(dataPath, {
      schemaVersion: 1,
      season,
      generatedAt:   new Date().toISOString(),
      rowCount:      games.length,
      games,
    });
    updateManifestEntry({ path: dataPath, recordCount: games.length, inProgress: false, schemaVersion: 1 });
    console.log(`[schedule] Wrote ${dataPath} (${games.length} games) + manifest`);
  }
}
```

### File: `bin/update.mjs` (CLI dispatcher)

**Edit 3.7 — import.** After the `updateAdvStats` import (**line 38**), add:
`import { updateSchedule } from '../scripts/update-schedule.mjs';`

**Edit 3.8 — `--all` flag + opts.** At the flag block (`const force = flag('--force');`, **line 55**)
add `const all = flag('--all');`. At the opts object (**line 113**)
`const opts = { year, category, force, dryRun };` → add `all`: `{ year, category, force, dryRun, all }`.

**Edit 3.9 — dispatch case.** In the `switch (subcommand)` (the `advstats` case ends **line 141**),
add before `default`:

```js
      case 'schedule':
        await updateSchedule(opts);
        break;
```

**Edit 3.10 — help text.** In `printHelp` SUBCOMMANDS (after the `advstats` line, **~line 80**) add:
```
  schedule                    nflverse NFL schedules + results (per-season; current season by default)
  schedule --year YYYY        Schedule for a specific season
  schedule --all              Backfill every season (≥ 1999)
```
In the OPTIONS block (**~line 82–85**) add a line documenting `--all` (schedule subcommand: backfill
all seasons). In EXAMPLES (after the advstats examples, **~line 102**) add:
```
  node bin/update.mjs schedule
  node bin/update.mjs schedule --year 2023 --dry-run
  node bin/update.mjs schedule --all
```

### File: `package.json`

**Edit 3.11 — smoke chain.** Append to the `smoke` script (**line 14**), after the advstats dry-run:
```
 && node bin/update.mjs schedule --year 2023 --dry-run
```
(2023 is a completed season → deterministic 285-game count; mirrors the advstats `--year 2023`
choice. Live-fetches the combined CSV like the draft/playerids smoke steps.)

### File: `.github/workflows/nflverse-schedule.yml` (NEW)

Copy `nflverse-advstats.yml` verbatim and change: the `name`, the cron, the fetch command, the
commit message, and the purge path. Full file:

```yaml
name: Weekly nflverse schedule

on:
  schedule:
    # Friday 13:35 UTC — after the week's Thu/Sun/Mon results settle and next week's
    # lines post. Off-hour :35, distinct day from KTC (Mon), roster (Tue), playerids
    # (Wed), advstats (Thu) so weekly committers don't race the push to main.
    - cron: "35 13 * * 5"
  workflow_dispatch: {}   # manual trigger for backfill / corrections

permissions:
  contents: write

jobs:
  schedule:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - name: Install dependencies
        run: npm ci
      - name: Fetch nflverse schedule
        id: fetch
        run: node bin/update.mjs schedule
      - name: Commit and purge if changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          if [[ -n "$(git status --porcelain)" ]]; then
            git add nflverse/ manifest.json
            git commit -m "nflverse: schedule $(date -u +%Y-%m-%d)"
            git push || (git pull --rebase && git push)
            # SEASON = NFL season resolved by the node step (the year the file is keyed by),
            # NOT the calendar year — they diverge Jan–Feb. See scripts/update-schedule.mjs
            # (setStepOutput) and CLAUDE.md invariant 8.
            SEASON="${{ steps.fetch.outputs.season }}"
            curl -sf "https://purge.jsdelivr.net/gh/${{ github.repository_owner }}/sleeper-dashboard-data@main/manifest.json" || true
            if [[ -n "$SEASON" ]]; then
              curl -sf "https://purge.jsdelivr.net/gh/${{ github.repository_owner }}/sleeper-dashboard-data@main/nflverse/schedule/${SEASON}.json" || true
            else
              echo "WARN: season step-output empty; skipped season-keyed schedule purge"
            fi
          else
            echo "No changes to commit."
          fi
```

### Backfill (one-time, manual after merge — not an edit)
Run `node bin/update.mjs schedule --all` once locally to write `nflverse/schedule/1999.json …
2026.json` + manifest entries, then commit. (The weekly Action only ever refreshes the current season.)

---

## 4. Served file path + exact per-game JSON shape (the cross-repo contract)

**Path:** `nflverse/schedule/<year>.json`
**CDN:** `https://cdn.jsdelivr.net/gh/<owner>/sleeper-dashboard-data@main/nflverse/schedule/<year>.json`

```json
{
  "schemaVersion": 1,
  "season": 2023,
  "generatedAt": "2026-06-21T12:00:00.000Z",
  "rowCount": 285,
  "games": [
    {
      "gameId": "2023_01_DET_KC",
      "season": 2023,
      "week": 1,
      "gameType": "REG",
      "homeTeam": "KC",
      "awayTeam": "DET",
      "homeScore": 20,
      "awayScore": 21,
      "result": -1,
      "spreadLine": 4.5,
      "totalLine": 53.0,
      "roof": "outdoors",
      "surface": "grass",
      "temp": 70,
      "wind": 8
    }
  ]
}
```

**Per-game field contract** (source column → served field, with null rules):

| Served field | Type | Source column | `null` when |
|---|---|---|---|
| `gameId` | string | `game_id` | never (required; row skipped / parse throws if column absent) |
| `season` | number | `season` | never |
| `week` | number\|null | `week` | unparseable (defensive only) |
| `gameType` | string\|null | `game_type` | source empty (values: `REG`,`WC`,`DIV`,`CON`,`SB`) |
| `homeTeam` | string | `home_team` | never (required) |
| `awayTeam` | string | `away_team` | never (required) |
| `homeScore` | number\|null | `home_score` | **game not yet played** (future/in-progress) |
| `awayScore` | number\|null | `away_score` | **game not yet played** |
| `result` | number\|null | `result` | **game not yet played**; `0` for a **tie** (NOT null) — home margin = home−away |
| `spreadLine` | number\|null | `spread_line` | line unavailable (older seasons); **present for future games** |
| `totalLine` | number\|null | `total_line` | line unavailable; **present for future games** |
| `roof` | string\|null | `roof` | source empty (`outdoors`/`dome`/`closed`/`open`) |
| `surface` | string\|null | `surface` | source empty |
| `temp` | number\|null | `temp` | **dome/closed roof**, future game, or older season w/o weather |
| `wind` | number\|null | `wind` | **dome/closed roof**, future game, or older season w/o weather |

Envelope fields mirror roster: `schemaVersion:1`, `season`, `generatedAt`, `rowCount`
(= `games.length`), `games` (array, parse order ≈ chronological).

---

## 5. Manifest entry

Written by `updateManifestEntry()` per season file (script-maintained — never hand-edit; CLAUDE.md
invariant 3). One entry per season:

```json
"nflverse/schedule/2023.json": {
  "schemaVersion": 1,
  "recordCount": 285,
  "inProgress": false,
  "lastModified": "2026-06-21T12:00:00.000Z"
}
```

`recordCount` = game count for the season. `inProgress: false` even for the mutating current
season (decision 7 / invariant 5). `lastModified` drives app cache invalidation.

---

## 6. Docs updates

There is no `docs/` in this repo. Update `README.md` and `CLAUDE.md` only.

### README.md

**6.1 — New served-file section.** Insert after the advstats section, immediately before
`## manifest.json shape` (**before line 443**; the advstats `--force` example block ends line 433,
then `---` then `### raw/<name>.json` at 437 — insert the new section between advstats (ends ~435)
and `### raw/<name>.json` (437), i.e. a new `### nflverse/schedule/<year>.json` with its own `---`):

> ```
> ### `nflverse/schedule/<year>.json`
>
> Per-season NFL schedule + results produced by `bin/update.mjs schedule [--year YYYY] [--all]`,
> sourced from the combined nflverse `nfldata` games file
> (`https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv`, the file
> `nflreadr::load_schedules()` wraps). One combined CSV (all seasons) is fetched, grouped by season,
> and served as one file per year. CORS-blocked in the browser; ingested server-side and served via
> jsDelivr.
>
> ```json
> { "schemaVersion": 1, "season": 2023, "generatedAt": "…", "rowCount": 285,
>   "games": [ { "gameId": "2023_01_DET_KC", "season": 2023, "week": 1, "gameType": "REG",
>     "homeTeam": "KC", "awayTeam": "DET", "homeScore": 20, "awayScore": 21, "result": -1,
>     "spreadLine": 4.5, "totalLine": 53.0, "roof": "outdoors", "surface": "grass",
>     "temp": 70, "wind": 8 } ] }
> ```
>
> `games` is an array, one record per game. `result` is the **home margin** (`homeScore − awayScore`):
> positive = home win, `0` = tie, negative = away win; passed through from the source, never recomputed.
> `gameType` ∈ `REG`,`WC`,`DIV`,`CON`,`SB`. Field names are camelCased from the source columns
> (`game_id → gameId`, `spread_line → spreadLine`, …).
>
> **Null fields:** future / in-progress games have `null` `homeScore`/`awayScore`/`result` but keep
> `spreadLine`/`totalLine` (lines post before kickoff). Dome / closed-roof games and pre-weather
> seasons have `null` `temp`/`wind`.
>
> **Sparsity gate (`MIN_SCHEDULE_GAMES = 200`):** a published season has its full slate at once
> (≈256–285 games incl. playoffs); the ingest skips any season with fewer than 200 rows (truncated
> fetch) and skips a not-yet-published season (0 rows). The app re-asserts the same gate on `rowCount`.
> If either side changes this constant, change both.
>
> **`inProgress: false` (deliberate deviation):** like roster/advstats, the app has no live fallback —
> it must read schedules from the store. Current-season weekly mutation is handled by SHA-256
> content-hash dedup + `lastModified`-driven app cache invalidation. Do not set `inProgress: true`.
>
> **Weekly refresh:** `nflverse-schedule.yml` runs Friday 13:35 UTC and re-ingests the current
> season (default mode). Historical seasons are static once final; backfill them once with
> `schedule --all`.
> ```

**6.2 — Subcommands code block (~lines 509–537).** Add, after the advstats lines:
- under the fetch group (after line 521): `node bin/update.mjs schedule` (current) and
  `node bin/update.mjs schedule --year 2023` and `node bin/update.mjs schedule --all`
- under the dry-run group (after line 532): `node bin/update.mjs schedule --year 2023 --dry-run`
- under the force group (after line 537): `node bin/update.mjs schedule --year 2023 --force`

**6.3 — Smoke description (line 554).** Change the list to include schedule:
- Before: "Runs dry-run checks for nfl/cfbd/ktc/roster/draft/playerids/advstats (no writes), …"
- After: "Runs dry-run checks for nfl/cfbd/ktc/roster/draft/playerids/advstats/schedule (no writes), …"

**6.4 — GitHub Actions table (lines 558–565).** Add a row after the advstats row (line 564):
```
| `nflverse-schedule.yml` | Friday 13:35 UTC + `workflow_dispatch` | Runs `node bin/update.mjs schedule` (current season), commits if content hash changed, purges jsDelivr CDN cache |
```

**6.5 — Season-keyed purge note (line 569).** Change `(roster, advstats)` →
`(roster, advstats, schedule)`.

**6.6 — Data sources & attribution table (lines 869–873).** nflverse is currently **absent** from
this table (pre-existing gap — Sleeper/KTC/CFBD only). Add a row for the new source:
```
| NFL schedules, results & Vegas lines | [nflverse / nfldata](https://github.com/nflverse/nfldata) | Public domain (CC0-style); attribution requested |
```

### CLAUDE.md

**6.7 — Update CLI block (under `### Update CLI — bin/update.mjs`).** After the `advstats` line, add:
```
node bin/update.mjs schedule                      # nflverse NFL schedules + results (current season)
node bin/update.mjs schedule --year YYYY          # schedule for a specific season
node bin/update.mjs schedule --all                # backfill every season (≥ 1999)
```
And in the `# Flags` comment under that block, note `--all` (schedule only: backfill all seasons).

**6.8 — Smoke section.** In the `npm run smoke` description line, change
`…+playerids+advstats for smoke…` → `…+playerids+advstats+schedule for smoke…`.

**6.9 — Navigation map table.** Add rows (alphabetical-ish, next to the other nflverse rows):
```
| `scripts/update-schedule.mjs` | nflverse schedules ingest — fetch combined games.csv, group by season, write `nflverse/schedule/<year>.json` |
| `nflverse/schedule/` | nflverse NFL schedules + results, one JSON per year (`<year>.json`); `games[]` keyed-by-array |
| `.github/workflows/nflverse-schedule.yml` | Friday weekly nflverse schedule refresh (current season), content-hash dedup, CDN purge |
```
Also update the `lib/nflverse.mjs` row to add the new exports:
`…exports MIN_ROSTER_IDS, MIN_DRAFT_YEAR, MIN_PLAYERID_ROWS, MIN_ADVSTATS_ROWS, MIN_SCHEDULE_SEASON, MIN_SCHEDULE_GAMES…`

**6.10 — Invariant 8 (season-keyed CDN purge).** Change the file list
`(`nflverse/roster`, `nflverse/advstats`)` → `(`nflverse/roster`, `nflverse/advstats`,
`nflverse/schedule`)`.

**6.11 — Cross-repo contracts table.** Add a row:
```
| **nflverse schedule** | `nflverse/schedule/<year>.json`: `{ schemaVersion:1, season, generatedAt, rowCount, games[] }`; each game `{ gameId, season, week, gameType, homeTeam, awayTeam, homeScore, awayScore, result, spreadLine, totalLine, roof, surface, temp, wind }`; `inProgress:false`; `MIN_SCHEDULE_GAMES = 200` shared sparsity constant; written by `bin/update.mjs schedule` | **New app loader** (e.g. `src/api/nflSchedule.js`) reads via `tryDataStore`/`getManifestEntry`, same pattern as `nflRoster.js`. Served shape + `MIN_SCHEDULE_GAMES` are the contract — change both repos together |
```

**6.12 — Self-maintenance ingested-source list.** Add `schedule` to the parenthetical list
`(nfl/cfbd/ktc/roster/draft/advstats/playerids/enrichment)` → include `schedule`. (Flag the signal
registry for update — see Cross-repo impact §8.)

---

## 7. Tests to add

Smoke/validation coverage only (`node --test` and `npm run smoke`) — **no Vitest**.

### A. Parser/validator unit tests — append to `test/nflverse.test.mjs`

Add `parseSchedulesCsv`, `numOrNull`, `validateSchedule` to the import from `../lib/nflverse.mjs` /
`../lib/validate.mjs` (lines 20–25). Add a `SCHED_HEADER` + `makeSchedCsv(...rows)` fixture helper
(mirror `ROSTER_HEADER`/`makeRosterCsv`, lines 29–33). Use a header with **all 15 consumed columns
in a scrambled order plus a couple of unused columns** to prove `indexOf`-by-name resolution.

| # | Test | Input | Expected |
|---|---|---|---|
| 1 | happy path — game shape + grouping | 2 rows, seasons 2023 & 2024, completed games | `count=2`; `gamesBySeason['2023'][0]` deep-equals the full 15-field object; numbers are numbers, strings strings |
| 2 | in-progress game → null scores, lines kept | one 2026 row: empty `home_score`/`away_score`/`result`, `spread_line=3.5`,`total_line=44.5`, empty `temp`/`wind` | `homeScore`/`awayScore`/`result`/`temp`/`wind` all `null`; `spreadLine===3.5`, `totalLine===44.5` |
| 3 | tie game → `result` is `0`, not null | row with `result=0`, scores `17`/`17` | `result === 0` (strict); `homeScore===17` |
| 4 | dome → null weather | row `roof=dome`, empty `temp`/`wind` | `roof==='dome'`, `temp===null`, `wind===null` |
| 5 | `minSeason` filter | rows for 1998 & 2020, `parseSchedulesCsv(csv,{minSeason:1999})` | only 2020 emitted; `count===1`; no `'1998'` key |
| 6 | missing required column → throws | header without `game_id` | `assert.throws(() => parseSchedulesCsv(csv))` |
| 7 | CRLF handling | header + one row joined with `\r\n` | `count===1` |
| 8 | malformed row skipped | one good row + one row with empty `home_team` | only the good game emitted |
| 9 | `numOrNull` direct | `''`,`'NA'`,`'0'`,`'-3'`,`'4.5'`,`'x'` | `null`,`null`,`0`,`-3`,`4.5`,`null` |
| 10 | `validateSchedule` happy | array of `MIN_SCHEDULE_GAMES` (200) valid stub games | does not throw |
| 11 | `validateSchedule` below floor | array of 199 stub games | throws (`/expected ≥ 200/`) |
| 12 | `validateSchedule` format drift | 200 games, >50% missing `homeTeam` | throws (`/format change/`) |

(A `makeGames(n)` stub helper — `{ gameId:`g${i}`, homeTeam:'KC', awayTeam:'BUF', … }` — mirrors the
existing `makePlayers(count)` at lines 42–51 for tests 10–12.)

### B. Content-hash unit test — NEW `test/update-schedule.test.mjs`

Mirror `test/update-draft.test.mjs` (the `picksByYearHash` precedent):
- `gamesHash`: two arrays differing **only in row order** hash **identically**.
- `gamesHash`: arrays differing in one field value (e.g. `homeScore`) hash **differently**.

### C. Smoke integration

`npm run smoke` gains `node bin/update.mjs schedule --year 2023 --dry-run` (edit 3.11). Verifies, end
to end against live data: fetch the combined CSV → parse → filter to 2023 → `validateSchedule` passes
(285 games) → "[dry-run] would write" → exit 0, no files written, no manifest touch.

### D. Edge cases explicitly covered (mapped to the above)
- **Current-season in-progress (null result/score):** test 2 (parser) + the live 2026 path exercised
  whenever the Action runs default mode.
- **Idempotent re-run = no change:** `gamesHash` order-independence (B) is the unit guarantee;
  end-to-end, a second real run with unchanged source hits `newHash === lastHash` → no write/commit
  (same mechanism as roster/draft, already covered by their suites).
- **Manifest entry present + valid:** `updateManifestEntry` is the shared, already-tested writer
  (`test/manifest.test.mjs`); no new manifest test needed — note it in the task summary instead.
- **Missing weather (domes / older seasons):** tests 2 & 4.
- **Not-yet-published season (0 rows):** covered by the script's `games.length === 0` skip; assert via
  test 5's filtering behaviour (a season absent from `gamesBySeason` yields `[]` → skip path).

---

## 8. Cross-repo impact (this IS a cross-repo contract change)

A **new served file** is added. The sibling app repo (`sleeper-dashboard`) must mirror it to consume
it. **Do not edit the app repo from this task** — state the following in the task summary so it can
be updated to match:

1. **New manifest key:** `nflverse/schedule/<year>.json` entries appear in `manifest.json` with
   `{ schemaVersion:1, recordCount, inProgress:false, lastModified }`. The app's `dataStore.js`
   `getManifestEntry` / validators already key on these fields — no manifest-shape change, just new keys.
2. **New served path:** `nflverse/schedule/<year>.json` (per-season, jsDelivr). The app needs a new
   loader (suggested `src/api/nflSchedule.js`) following the `nflRoster.js` pattern
   (`tryDataStore` + `getManifestEntry`, sparsity re-assert on `rowCount`).
3. **Per-game field shape (contract):** the 15-field object in §4, plus the
   `MIN_SCHEDULE_GAMES = 200` sparsity constant. If the data repo changes either the served shape or
   the constant, both repos change together (add the matching row to the app's contracts and this
   repo's CLAUDE.md Cross-repo table — edit 6.11).
4. **Null semantics the app must handle:** `homeScore`/`awayScore`/`result` are `null` for unplayed
   games (current season mid-stream); `temp`/`wind` `null` for domes/old seasons; `result` is the
   home margin with `0` = tie.

**Signal registry (app repo `docs/signal-registry.md`):** a new ingested source/feature is added.
Per CLAUDE.md self-maintenance, flag it for a new row — **Source:** nflverse `nfldata` games.csv;
**Historical coverage:** 1999→present (per-season); **Reconstructable vs ephemeral:**
**reconstructable** (schedules/results/lines are static once final and re-derivable from the source).
Note this in the task summary so the app repo adds the row.

---

## 9. Step sequence for the implementer (sonnet)

1. `lib/nflverse.mjs` — edits 3.1–3.4 (constants, URL, `numOrNull`, `fetchSchedulesCsv`,
   `parseSchedulesCsv`).
2. `lib/validate.mjs` — edits 3.5–3.6 (import + `validateSchedule`).
3. `scripts/update-schedule.mjs` — NEW (edit 3.x writer).
4. `bin/update.mjs` — edits 3.7–3.10 (import, `--all`, dispatch, help).
5. `package.json` — edit 3.11 (smoke chain).
6. `.github/workflows/nflverse-schedule.yml` — NEW.
7. Tests — §7 A (append `test/nflverse.test.mjs`) + B (NEW `test/update-schedule.test.mjs`).
8. Docs — §6 (README 6.1–6.6, CLAUDE.md 6.7–6.12).
9. `npm test` then `npm run smoke` — both green (done-definition step 1).
10. One-time backfill: `node bin/update.mjs schedule --all`, then commit
    `nflverse/schedule/*.json` + `manifest.json`.
11. Task summary must call out: the **cross-repo contract** (§8 items 1–4 for the app repo) and the
    **signal-registry row** (§8) for `docs/signal-registry.md`.
