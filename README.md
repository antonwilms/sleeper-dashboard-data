# sleeper-dashboard-data

Longitudinal data store for [Sleeper Dashboard](https://github.com/antonwilms/sleeper-dashboard) — a personal dynasty fantasy football analysis tool.

This repo holds serialised snapshots of data fetched from the Sleeper, KeepTradeCut, and College Football Data (CFBD) APIs. The data is exported from the app's IndexedDB cache and committed here so it can be loaded as static JSON over CDN, reducing API traffic and enabling historical comparisons across seasons.

**Last updated:** 2026-05-18

---

## Why this repo exists

The app fetches data from three external APIs and caches it in the browser's IndexedDB. That cache is ephemeral — it lives in one browser profile and is lost on a clear. This repo makes the data:

- **Portable** — accessible from any device without re-fetching
- **Historical** — past seasons are locked in; corrections are tracked via git history
- **Fast** — served over jsDelivr CDN instead of live API calls
- **Auditable** — every update is a dated commit

---

## Folder structure

```
sleeper-dashboard-data/
  manifest.json               — Index of all files with metadata
  nfl/
    season-totals/            — Sleeper per-player season aggregates (2012–present)
      2024.json
      ...
  college/
    passing/                  — CFBD passing stats per player per season (2017–2024)
      2023.json
      ...
    receiving/                — CFBD receiving stats per player per season
    rushing/                  — CFBD rushing stats per player per season
  ktc/
    snapshot-<date>.json      — KeepTradeCut dynasty values at a point in time
  enrichment/
    coaching.json             — Hand-curated coaching staff entries
    scheme.json               — Offensive/defensive scheme entries
    injuries.json             — Injury type/severity for known absence segments
    notes.json                — Free-form player/team notes
  snapshots/
    <YYYY-MM-DD>.json         — Daily projection snapshots (one per UTC day)
  grading/
    <YYYY-MM-DD>.json         — Grading reports (one per snapshot date, written by bin/grade.mjs --write)
  nflverse/
    roster/                   — nflverse season rosters (sleeper_id join), one file per year
      2025.json
    draft/                    — nflverse combined draft picks (all years in one file)
      draft_picks.json
    playerids.json            — gsis_id→sleeper_id crosswalk (DynastyProcess), all players historically
    advstats/                 — nflverse advanced receiving stats (WR/TE/RB), one file per year, keyed by sleeper_id
      2023.json
  raw/                        — Everything else exported from IndexedDB
                                (league data, player map, weekly stats, etc.)
```

---

## File schemas

### `nfl/season-totals/<year>.json`

Object keyed by Sleeper `player_id`. Each value is an aggregated per-player season record with raw stats, the canonical half-PPR fantasy point total, weekly-points for each played week, and a length-18 weekly participation array plus derived availability aggregates. Manifest entries for these files are at `schemaVersion: 2` as of Phase 5. Publish-time validation additionally rejects any record containing a non-finite numeric (`NaN`/`Infinity`/`-Infinity`) in any field, so every completed-season file is guaranteed wholly finite.

```json
{
  "<player_id>": {
    "stats":         { "rec": 104, "rec_yd": 1236, "rush_yd": 48, "...": "..." },
    "gamesPlayed":   16,
    "gamesStarted":  16,
    "byeWeeks":      1,
    "dnpWeeks":      0,
    "weeklyPoints":  { "1": 18.4, "2": 22.1, "...": "..." },
    "fantasyPoints": 298.1,
    "scoringBasis":  "half_ppr",
    "weeklyStatus":  ["P","P","P","P","P","P","P","P","B","P","P","P","P","P","P","P","P","X"],
    "availability": {
      "longestAbsence":      0,
      "absenceSegments":     [],
      "firstWeek":           1,
      "lastWeek":            17,
      "returnedFromAbsence": false,
      "absenceCause":        "unknown"
    }
  }
}
```

Source: Sleeper stats/projections API (`api.sleeper.com`). Fields vary by position — skill players include `rec_yd`, `rush_yd`, `pass_yd`; kickers include `fgm_*`; etc. The `gp` (games played) field on each per-week response is the authoritative participation signal.

**`weeklyStatus` codes** (one character per week, 1-indexed by array position):

| Code | Meaning |
|------|---------|
| `P` | Played — `gp === 1` in the per-week response |
| `D` | DNP — `gp === 0` and the player's team had other players with `gp === 1` that week |
| `B` | Bye — `gp === 0` and no player on the team appeared in that week's response |
| `X` | Absent — player not in the per-week response at all |

Pre-2021 NFL had 17 regular-season weeks. Those seasons store `X` at week 18 for every player; consumers may hide it from week-by-week visualisations.

`availability.absenceCause` is always `"unknown"` in Phase 5. It exists as a placeholder for future cause-of-absence enrichment (injury report scrape, manual annotation). An absence run ≥ 3 weeks is *suggestive* of injury but not labelled as such by this script — Sleeper stats alone cannot distinguish injury from suspension, healthy scratch, or personal absence.

**Snap & red-zone field coverage:** `off_snp`, `tm_off_snp`, `rec_rz_tgt`, `rush_rz_att`, `pass_rz_att` are present in Sleeper data from ~2021 onward; seasons before then omit them. They flow through the generic sum-all-keys aggregation unchanged — the app degrades the dependent projection factors to neutral for older seasons (see sibling repo `usageMetrics.js` / `teamRzShare.js` / `durabilitySignals.js`).

---

### `college/<category>/<year>.json`

Array of raw stat rows from the CFBD bulk player stats endpoint. One row per player per `statType`.

```json
[
  {
    "season":     2023,
    "playerId":   "4801717",
    "player":     "Noah Fifita",
    "position":   "QB",
    "team":       "Arizona",
    "conference": "Pac-12",
    "category":   "passing",
    "statType":   "YDS",
    "stat":       "2869"
  }
]
```

Categories: `passing`, `receiving`, `rushing`.

**Confirmed `statType` values by category:**

| Category | statTypes |
|---|---|
| `passing` | `YDS`, `TD`, `YPA`, `COMPLETIONS`, `INT`, `PCT`, `ATT` |
| `receiving` | `YDS`, `TD`, `REC`, `YPR`, `LONG` |
| `rushing` | `YDS`, `TD`, `CAR`, `YPC`, `LONG` |

Multiple rows per player — one row per statType. The app pivots these into flat player objects at runtime using `pivotStatRows()` in `src/api/cfbd.js`.

Source: [College Football Data API](https://collegefootballdata.com/). Requires a CFBD API key.

---

### `ktc/snapshot-<date>.json`

Array of dynasty market values scraped from KeepTradeCut at the snapshot date.

```json
[
  {
    "name":     "Josh Allen",
    "team":     "BUF",
    "value":    9999,
    "position": "QB"
  }
]
```

Values are KTC's proprietary 0–9999 scale. Matched to Sleeper player IDs at runtime using `src/utils/ktcMatch.js`. Snapshots are append-only — old snapshots are never deleted, enabling trend analysis.

---

### `snapshots/<date>.json`

Daily projection snapshot produced by the app's pipeline, capturing the contemporaneous inputs and outputs used for season projections. One file per UTC date. Used for future backtesting — no consumer UI in v1.

**First-league-of-the-day-wins:** if multiple leagues are opened in the same UTC day, the first one to complete the projection pipeline is captured; subsequent leagues are silently skipped. The `leagueId` field makes this detectable after the fact.

```json
{
  "schemaVersion":   2,
  "capturedAt":      "2026-05-19T14:23:11.812Z",
  "scoringBasis":    "half_ppr",
  "targetSeason":    2026,
  "currentSeason":   2025,
  "scoringSettings": { "rec": 0.5, "bonus_rec_rb": 0, "pass_td": 4, "...": "..." },
  "leagueId":        "1312015497465716736",
  "teamDepthCharts": {
    "BUF": {
      "QB": [{ "playerId": "4984", "fullName": "Josh Allen",  "depthOrder": 1, "status": "Active" }],
      "RB": [{ "playerId": "9509", "fullName": "James Cook",  "depthOrder": 1, "status": "Active" }],
      "WR": [],
      "TE": []
    }
  },
  "players": {
    "4984": {
      "nfl_team":        "BUF",
      "status":          "Active",
      "depthChartOrder": 1,
      "ktc": { "value": 9800, "positionPercentile": 99 },
      "projection": {
        "projectedPPG":      22.4,
        "projectedTotalPts": 380.8,
        "confidence":        "high",
        "adjustmentSummary": ["Age curve peak", "Elite KTC ↑"]
      }
    }
  }
}
```

**Per-player inclusion rule:** included iff `seasonProjections[player_id]` exists AND `playerMap[player_id].team` is non-null (active NFL roster). Players without a team or without a projection are excluded.

**`scoringBasis` values:** `half_ppr` · `ppr` · `standard` · `te_premium` · `custom` · `unknown`.

**`targetSeason`** is the NFL season the projection forecasts (= `currentSeason` + 1). Written explicitly by the app at v2; the grading harness reads it directly and skips the `capturedAt` heuristic.

**`currentSeason`** is the last completed season in the app's `careerStats` cache — the data basis the projection was computed from.

**`scoringSettings`** is the league's raw `scoring_settings` object captured verbatim from the Sleeper API. Enables in-basis grading for non-half_ppr leagues in a future data-repo task. Not consumed by the current grading harness.

**v2 is additive.** Existing v1 snapshots remain valid — `targetSeason`, `currentSeason`, and `scoringSettings` are simply absent. The grading harness falls back to the `capturedAt` heuristic (`deriveTargetSeason()`) for v1 snapshots.

**`ktc`** is `null` if the player isn't in the KTC map; otherwise `{ value, positionPercentile }`.

**`projection`** is the verbatim output of `computeNextSeasonProjection` — no field whitelist.

**Import workflow:**
1. Click "Export data" in the app (wait for the projection pipeline to finish first).
2. From this repo's root, run `npm run import:snapshot`.

`bin/import-snapshot.mjs` finds the newest `sleeper-dashboard-export*.zip` in `~/Downloads`
and imports **every** `snapshots/<date>.json` not yet committed — in one commit. The ZIP
normally contains many days' snapshots because the app accumulates one per UTC day. Already-present
dates are skipped; re-running is a no-op. Registers each file in `manifest.json`
(via the same `snapshots` registration as `bin/update.mjs snapshots`), then commits
and pushes. If `git push` is rejected (e.g. the weekly KTC action pushed first) it
runs `git pull --rebase` and retries once.

The manual path still works if you prefer it: copy `snapshots/<date>.json` into this
repo's `snapshots/`, run `node bin/update.mjs snapshots`, then commit.

Snapshots are permanent (never overwritten by the app within a UTC day). Old snapshots accumulate — no retention policy in v1.

See [snapshot-workflow.md](snapshot-workflow.md) for the full step-by-step.

---

### `grading/<date>.json`

Grading report produced by `bin/grade.mjs --write` for a given snapshot date. Stores the full `GradeReport` — accuracy metrics, calibration check, games block, and factor correlations — as computed at `meta.gradedAt`. One file per snapshot date; only written on demand (not automatically after every snapshot import).

```json
{
  "meta": {
    "targetSeason":       2026,
    "snapshotDate":       "2026-05-19",
    "capturedAt":         "2026-05-19T14:23:11.812Z",
    "scoringBasis":       "custom",
    "outcomeBasis":       "half_ppr",
    "basisMatch":         false,
    "source":             "snapshot",
    "gradedAt":           "2027-02-15T10:00:00.000Z",
    "harnessVersion":     1
  },
  "counts":     { "projected": 757, "graded": 498, "dnp": 82, "absent": 177 },
  "overall":    { "n": 498, "maePPG": 3.2, "biasPPG": 1.1, "maeTotal": null, "biasTotal": null },
  "byPosition": { "QB": {}, "RB": {}, "WR": {}, "TE": {}, "UNK": {} },
  "byConfidence": { "high": {}, "medium": {}, "low": {}, "rookie": {} },
  "calibration":  { "order": ["high","medium","low"], "maeByBucket": {}, "monotonic": true, "note": "…" },
  "games":          { "mae": 1.4, "bias": -0.2, "n": 580 },
  "factorDiagnostics": [ { "factor": "durabilityFactor", "n": 498, "r": -0.18, "note": "" } ],
  "caveats":    [ "Basis mismatch: …" ]
}
```

**`meta.basisMatch`** is `false` for all current snapshots (they use `custom` scoring basis; outcomes are `half_ppr`). When false, absolute PPG metrics are affected by basis offset; confidence-bucket ordering and the games block are still valid. See [Grading harness](#grading-harness) below.

---

### `nflverse/roster/<year>.json`

Season roster produced by `bin/update.mjs roster [--year YYYY]`, sourced from the nflverse `rosters` release asset (`https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_<year>.csv`). The CSV is CORS-blocked in the browser; ingest runs server-side in this repo and serves the result via jsDelivr.

```json
{
  "schemaVersion": 1,
  "season": 2025,
  "generatedAt": "2026-06-08T12:00:00.000Z",
  "rowCount": 2141,
  "players": {
    "4984": { "team": "BUF", "position": "QB", "status": "ACT", "fullName": "Josh Allen" }
  }
}
```

`players` is keyed by **`sleeper_id`** — a direct join to Sleeper player IDs used by the app. Rows without a `sleeper_id` in the source CSV are silently skipped (~14% of skill rows). Status filtering (removing `OUT_STATUSES`) is **app-side**, so raw status values are emitted here.

**Sparsity gate (`MIN_ROSTER_IDS = 1500`):** preliminary offseason files have far fewer id-bearing rows. The ingest script refuses to write if `rowCount < 1500`; the app re-asserts the same gate on `rowCount` when reading from the store. If either side changes this constant, change both.

**`inProgress: false` (deliberate deviation):** unlike `nfl/season-totals` files (where `inProgress: true` means "don't serve, fetch live from Sleeper"), the current-season roster has **no live app fallback**. It must be read from the store. Weekly mutability is handled by SHA-256 content-hash dedup (write only when changed) + `lastModified`-driven cache invalidation in the app. Do not change this to `inProgress: true`.

**Weekly refresh:** the `weekly-nflverse-roster.yml` GitHub Action runs every Tuesday and re-ingests the current season. A `nflverse/last-checked-roster.json` marker is written on every run (even no-change runs) so "ran, no change" is distinguishable from "didn't run".

---

### `nflverse/draft/draft_picks.json`

Combined multi-year draft picks produced by `bin/update.mjs draft`, sourced from the nflverse `draft_picks` release asset (`https://github.com/nflverse/nflverse-data/releases/download/draft_picks/draft_picks.csv`). Filtered to seasons ≥ 2010 (a generous superset of the app's `DRAFT_YEARS`). Supplemental picks and rows with non-integer rounds are skipped.

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-06-08T12:00:00.000Z",
  "sourceLastUpdated": "2026-05-05 03:26:29 EDT",
  "count": 4350,
  "picksByYear": {
    "2024": [
      { "year": 2024, "round": 1, "pick": 1, "team": "CHI",
        "fullName": "Caleb Williams", "position": "QB", "college": "USC", "age": 22 }
    ]
  }
}
```

`DraftPick = { year, round, pick, team, fullName, position, college, age|null }`. The `picksByYear` object mirrors the exact shape `matchNflDraftToSleeper` consumes — only the data source changes, not the app's matching logic.

**Yearly refresh:** the `nflverse-draft.yml` GitHub Action runs on May 1 each year (after the NFL draft). Content-hash dedup ensures no commit if nothing changed.

---

### `nflverse/playerids.json`

Historical `gsis_id → sleeper_id` crosswalk produced by `bin/update.mjs playerids`, sourced from
DynastyProcess's `db_playerids.csv` (`https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv`,
the file `nflreadr::load_ff_playerids()` wraps). CORS-blocked in the browser; ingested server-side
and served via jsDelivr. This is the Phase-0 join key: nflverse advanced stats (`stats_player_week`,
NGS) are keyed by `gsis_id`, which roster files do not carry.

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-06-14T12:00:00.000Z",
  "sourceSeason": 2026,
  "rowCount": 6143,
  "ids": {
    "00-0034796": { "sleeperId": "4984", "name": "Josh Allen", "position": "QB" }
  }
}
```

`ids` is keyed by **`gsis_id`**; the value carries `sleeperId` (the join payload) plus `name`/`position`
(debug/validation only). Rows where either id is empty or `NA` in the source are skipped (cannot join).
Duplicate `gsis_id`s use keep-last (confirmed lossless — colliding rows share the same `sleeperId`).

**Forward map only.** The map is a bijection (`gsis_id` and `sleeper_id` each unique), so the app
derives any reverse `sleeper_id → gsis_id` lookup by inverting `ids` in-memory. No reverse index is served.

**Sparsity gate (`MIN_PLAYERID_ROWS = 5000`):** the ingest refuses to write if fewer than 5000
crosswalk rows parse; the app re-asserts the same gate on `rowCount`. If either side changes this
constant, change both.

**`inProgress: false`:** like roster/draft, the app has no live fallback — it must read the crosswalk
from the store. Content-hash dedup means no commit when unchanged.

**Weekly refresh:** the `nflverse-playerids.yml` GitHub Action runs every Wednesday and re-ingests
the crosswalk so newly-active players become joinable within a week.

---

### `nflverse/advstats/<year>.json`

Per-season advanced receiving stats produced by `bin/update.mjs advstats --year YYYY`, sourced from
the nflverse `player_stats` weekly asset
(`https://github.com/nflverse/nflverse-data/releases/download/player_stats/stats_player_week_<year>.csv`,
the file `nflreadr::load_player_stats()` wraps). CORS-blocked in browsers; fetched and processed
server-side. **Re-keyed to `sleeper_id` server-side** using `nflverse/playerids.json` so the app
does no gsis join.

```json
{
  "schemaVersion": 1,
  "season": 2023,
  "generatedAt": "2026-06-14T12:00:00.000Z",
  "rowCount": 327,
  "unmapped": 1,
  "players": {
    "1234": {
      "gsisId": "00-0033921",
      "name": "CeeDee Lamb",
      "position": "WR",
      "team": "DAL",
      "targetShare": 0.299,
      "airYardsShare": 0.31,
      "wopr": 0.666,
      "racr": 0.965,
      "components": { "targets": 198, "airYards": 1903, "recYards": 1837, "receptions": 135, "weeks": 17 }
    }
  }
}
```

**Position scope:** WR, TE, and RB are emitted. Team denominators (`teamTargets`/`teamAirYards`)
include all positions' weekly rows — only the emitted player set is filtered. Note: for RBs,
`air_yards_share` and `wopr` reflect their (often negative) air yards; `racr` is `null` when season
`receiving_air_yards ≤ 0` (behind-LOS targets produce net-negative totals, making the ratio
nonsensical). `target_share` is the primary meaningful metric for RBs.

**Ratios recomputed season-level — never aggregated weekly.** Each ratio is computed once from
summed raw components (the ratio-aggregation trap). Formulas:

```
targetShare    = Σ_t (playerTargets[t] / teamTargets[t]) · playerTargets[t]  /  Σ_t playerTargets[t]
airYardsShare  = Σ_t (playerAirYards[t] / teamAirYards[t]) · playerAirYards[t] / Σ_t playerAirYards[t]
wopr           = 1.5 · targetShare + 0.7 · airYardsShare
racr           = receivingYards / receivingAirYards
```

Ratios are 3-decimal numbers or `null` (zero denominator). If `targetShare` or `airYardsShare` is
`null`, `wopr` is `null`.

**Traded players** use week-restricted per-team denominators (the weeks the player was on each team,
not the team's full-season totals) and a volume-weighted per-team share blend. Traded players carry
`traded: true` and `teams: [...]` (sorted by player targets desc).

**Sparsity gate (`MIN_ADVSTATS_ROWS = 250`):** ingest refuses to write if fewer than 250 players
survive re-keying; the app re-asserts the same gate on `rowCount`.

**`inProgress: false`:** there is no live app fallback for these metrics (Sleeper does not expose
them). Weekly mutability of the current season is handled by content-hash dedup + `lastModified`.

**Weekly Thursday refresh:** `nflverse-advstats.yml` runs Thursday 13:41 UTC — after the Wednesday
playerids Action — so it re-keys against the freshest crosswalk committed to main.

```sh
node bin/update.mjs advstats --year 2023        # write 2023 (past season needs --force after first write)
node bin/update.mjs advstats --year 2023 --dry-run
node bin/update.mjs advstats                    # current season
```

---

### `raw/<name>.json`

Miscellaneous IndexedDB entries that don't fit a named category: league data, roster snapshots, the Sleeper player map, weekly stats, etc. Filenames are derived from the original cache key with `/` replaced by `-`.

---

## `manifest.json` shape

```json
{
  "exportedAt":    "2026-05-18T13:51:37.583Z",
  "schemaVersion": 1,
  "repo":          "sleeper-dashboard-data",
  "description":   "Longitudinal data store for Sleeper Dashboard",
  "source":        "indexeddb",
  "files": {
    "nfl/season-totals/2024.json": {
      "originalKey":   "season-totals/2024",
      "recordCount":   2708,
      "inProgress":    false,
      "schemaVersion": 2,
      "lastModified":  "2026-05-19T18:32:11.123Z"
    }
  }
}
```

| Field | Meaning |
|---|---|
| `exportedAt` | ISO timestamp of the export that produced this manifest |
| `schemaVersion` | Incremented when the file structure changes incompatibly |
| `repo` | Identifies this repo (useful when manifest is fetched standalone) |
| `description` | Human-readable description |
| `source` | Always `"indexeddb"` — where the data came from |
| `files` | Map from ZIP path → file metadata |
| `files[*].originalKey` | The IndexedDB cache key the data came from |
| `files[*].recordCount` | Number of top-level entries in the file (array length or object key count) |
| `files[*].inProgress` | `true` if this season/snapshot may still receive updates; `false` if completed |
| `files[*].schemaVersion` | Schema version of this specific file (written by update scripts). NFL season-totals files are at `2` after Phase 5; KTC snapshots remain at `1`. |
| `files[*].lastModified` | ISO timestamp when this file was last written by an update script |

---

## Update scripts

The `bin/update.mjs` CLI keeps data files current. Scripts run via Node.js 20+ and use native `fetch` — no browser required.

### Setup

```bash
cd sleeper-dashboard-data
npm install
cp .env.example .env          # fill in CFBD_API_KEY
```

### Subcommands

```bash
# Fetch NFL season totals (18 weeks from Sleeper, aggregated into player totals)
node bin/update.mjs nfl --year 2024

# Fetch all three CFBD college stat categories for a season
node bin/update.mjs cfbd --year 2023

# Fetch a single CFBD category
node bin/update.mjs cfbd --year 2023 --category receiving

# Scrape today's KTC dynasty values and write a dated snapshot
node bin/update.mjs ktc

# Fetch the current-season nflverse roster (keyed by sleeper_id)
node bin/update.mjs roster
node bin/update.mjs roster --year 2024

# Fetch combined nflverse draft picks (all years ≥ 2010)
node bin/update.mjs draft

# Fetch the gsis_id→sleeper_id crosswalk (DynastyProcess db_playerids)
node bin/update.mjs playerids

# Fetch nflverse advanced receiving stats (WR/TE/RB), re-keyed to sleeper_id
node bin/update.mjs advstats --year 2023
node bin/update.mjs advstats           # current season

# Dry-run any subcommand (fetch + validate, no writes)
node bin/update.mjs nfl --year 2024 --dry-run
node bin/update.mjs cfbd --year 2023 --dry-run
node bin/update.mjs ktc --dry-run
node bin/update.mjs roster --year 2024 --dry-run
node bin/update.mjs draft --dry-run
node bin/update.mjs playerids --dry-run
node bin/update.mjs advstats --year 2023 --dry-run

# Force overwrite of a completed-season file (nfl/cfbd/roster/advstats)
node bin/update.mjs nfl --year 2023 --force
node bin/update.mjs roster --year 2024 --force
node bin/update.mjs advstats --year 2023 --force
```

### Environment variables

| Variable | Required for | Description |
|---|---|---|
| `CFBD_API_KEY` | `cfbd` subcommand | CFBD API key from [collegefootballdata.com](https://collegefootballdata.com/) |

Loaded from `.env` via dotenv when running locally. In CI, set as a GitHub Actions secret.

### Smoke test

```bash
npm run smoke
```

Runs dry-run checks for nfl/cfbd/ktc/roster/draft/playerids/advstats (no writes), validates enrichment, and runs the grade self-test. Used by the smoke-test CI workflow on pull requests.

### GitHub Actions

| Workflow | Trigger | What it does |
|---|---|---|
| `weekly-ktc.yml` | Monday 13:17 UTC + `workflow_dispatch` | Runs `node bin/update.mjs ktc`, commits new snapshot if values changed |
| `weekly-nflverse-roster.yml` | Tuesday 13:23 UTC + `workflow_dispatch` | Runs `node bin/update.mjs roster`, commits if content hash changed, purges jsDelivr CDN cache for changed files |
| `nflverse-draft.yml` | May 1 12:00 UTC + `workflow_dispatch` | Runs `node bin/update.mjs draft`, commits if content changed, purges jsDelivr CDN cache |
| `nflverse-playerids.yml` | Wednesday 13:29 UTC + `workflow_dispatch` | Runs `node bin/update.mjs playerids`, commits if content hash changed, purges jsDelivr CDN cache |
| `nflverse-advstats.yml` | Thursday 13:41 UTC + `workflow_dispatch` | Runs `node bin/update.mjs advstats` (after playerids), commits if content changed, purges jsDelivr CDN cache |
| `smoke-test.yml` | PR touching `bin/`, `lib/`, `scripts/`, `package.json`, or `.github/workflows/` | Runs the nfl/cfbd/ktc/playerids/advstats dry-runs and npm test (unit validators) |

The weekly KTC workflow commits only when content changes (SHA256 hash dedup). If values are identical to the last snapshot, it writes `ktc/last-checked.json` only and produces no commit.

### Yearly maintenance

At the start of each NFL season, update `lib/validate.mjs`:

1. **`NFL_SENTINELS`** — add an entry for the new year with 2–3 high-usage players and their expected `minGames`.
2. **`KTC_TOP_QB_SENTINELS`** — update if the dynasty QB landscape shifts significantly (the comment in the file explains the current state).

---

## How the data is consumed

Files are served via [jsDelivr](https://www.jsdelivr.com/) CDN:

```
https://cdn.jsdelivr.net/gh/<github-username>/sleeper-dashboard-data@main/<path>
```

Example — fetch the 2023 NFL season totals:

```
https://cdn.jsdelivr.net/gh/<github-username>/sleeper-dashboard-data@main/nfl/season-totals/2023.json
```

jsDelivr caches aggressively. After pushing an update, use `https://purge.jsdelivr.net/gh/...` to bust the CDN cache for a specific file.

---

## Versioning policy

- **Append-only for historical data.** Past completed seasons are never overwritten unless correcting a data error.
- **In-progress seasons** are re-exported and committed whenever the app's cache is refreshed during the active season. `inProgress: true` in the manifest flags these.
- **KTC snapshots** accumulate by date. Old snapshots are retained.
- **Git history is the audit trail.** Corrections are committed with a message explaining what changed and why.
- **`schemaVersion`** in `manifest.json` is incremented when the file layout changes incompatibly (e.g. a new top-level folder, a renamed field).

---

## Enrichment overlay

The `enrichment/` directory holds hand-curated data that no API provides. Unlike primary data files (which are produced by deterministic scripts and must never be hand-edited), enrichment files are authored by the human and validated by the CLI.

### Structure

```
enrichment/
  coaching.json   — coaching staff entries (HC/OC/DC per team per year)
  scheme.json     — offensive/defensive scheme entries (per team per year)
  injuries.json   — injury type/severity for known absence segments
  notes.json      — free-form notes (per player_id or per team)
  README.md       — short pointer + CLI reminder
```

Each file shares a top-level wrapper:

```json
{
  "schemaVersion": 1,
  "updatedAt": "ISO8601",
  "entries": [ … ]
}
```

### Entry schemas

#### Coaching (`coaching.json`)

One entry per `(year, team, role)`. `role ∈ {HC, OC, DC}`.

```json
{
  "id":          "coach-2024-SF-HC-1a2b",
  "year":         2024,
  "team":         "SF",
  "role":         "HC",
  "name":         "Kyle Shanahan",
  "tenureStart":  2017,
  "isNew":        false,
  "predecessor":  null,
  "source":       "team site, 2024-01-15",
  "notes":        ""
}
```

Required: `id`, `year`, `team`, `role`, `name`.

#### Scheme (`scheme.json`)

One entry per `(year, team)`. Dominant offensive/defensive philosophy, free-form strings.

```json
{
  "id":              "scheme-2024-MIA-4c8d",
  "year":             2024,
  "team":             "MIA",
  "offense":          "wide zone / play-action",
  "defense":          "vic-fangio-tree zone",
  "tempo":            "fast",
  "changedFromPrev":  false,
  "source":           "PFF preview 2024",
  "notes":            ""
}
```

Required: `id`, `year`, `team`. At least one of `offense`/`defense`/`tempo` must be set.

#### Injuries (`injuries.json`)

One entry per known injury event. `segmentStartWeek` must match an absence segment in `nfl/season-totals/<year>.json` for that player.

```json
{
  "id":               "inj-6803-2023-w2-9e1f",
  "playerId":         "6803",
  "year":              2023,
  "segmentStartWeek":  2,
  "segmentEndWeek":    18,
  "type":              "ACL",
  "bodyPart":          "knee",
  "severity":          "season-ending",
  "dateInjured":       "2023-09-11",
  "dateReturned":      null,
  "source":            "team announcement 2023-09-11",
  "notes":             ""
}
```

Required: `id`, `playerId`, `year`, `segmentStartWeek`. Everything else optional.  
`severity` suggestions: `season-ending` · `multi-week` · `single-game` · `playing-through` (open enum).

#### Notes (`notes.json`)

Catch-all. Scoped to exactly one of `playerId` or `team`, with optional `year`.

```json
{
  "id":       "note-4034-2024-2f3a",
  "playerId":  "4034",
  "team":      null,
  "year":      2024,
  "tag":       "usage",
  "body":      "Slot-heavy alignment in 11-personnel through Week 6.",
  "source":    "PFF article, 2024-10-22"
}
```

Required: `id`, `body`, exactly one of `playerId`/`team`.

### CLI

```bash
# Add entries
node bin/enrich.mjs coaching add --year 2025 --team SF --role HC --name "Kyle Shanahan"
node bin/enrich.mjs scheme   add --year 2024 --team MIA --offense "wide zone"
node bin/enrich.mjs injuries add --player 6803 --year 2023 --segment-start 2 \
    --type ACL --body-part knee --severity season-ending --date-injured 2023-09-11
node bin/enrich.mjs notes    add --player 4034 --year 2024 --body "Slot-heavy..."

# Maintenance
node bin/enrich.mjs validate              # validate all four files (also runs in npm run smoke)
node bin/enrich.mjs list injuries         # list all injury entries
node bin/enrich.mjs list coaching --year 2025
node bin/enrich.mjs remove <id>           # remove by id (any file)

# npm shortcuts
npm run validate:enrichment
```

**`add` is an upsert** — running with identical fields is a no-op; running with the same natural key (year+team+role for coaching, etc.) but different fields prints a diff and exits 1 without `--force`.

### Orphaned entries

If `nfl/season-totals/<year>.json` is regenerated and absence segments shift, an injury entry's `segmentStartWeek` may no longer match. The app silently ignores orphaned entries; `node bin/enrich.mjs validate` flags them on the next run.

### App consumption

`src/api/enrichment.js → loadEnrichment()` fetches all four files on mount and stores them in `enrichmentMap` state. Currently consumed only by `AvailabilityHistory`'s `D`-cell tooltips (Phase 6). Other consumers (coaching/scheme display, notes) are deferred.

---

## Grading harness

`bin/grade.mjs` joins a captured projection snapshot to the following season's outcomes (from `nfl/season-totals/<year>.json`) and emits accuracy diagnostics.

### Usage

```bash
node bin/grade.mjs <snapshotDate>                       # human report to stdout
node bin/grade.mjs <snapshotDate> --json                # machine-readable GradeReport JSON
node bin/grade.mjs <snapshotDate> --write               # persist grading/<snapshotDate>.json
node bin/grade.mjs <snapshotDate> --target-season YYYY  # override derived target season
node bin/grade.mjs <snapshotDate> --strict-basis        # skip non-half_ppr snapshots
node bin/grade.mjs --self-test                          # fixture self-check (used by smoke)

# npm shortcut
npm run grade -- 2026-05-19
```

Exit codes: `0` = success, nothing-to-grade (missing outcome file, strict-basis skip), or self-test passed; `1` = real error.

### Architecture

Three layers, each with a clean interface:

| Layer | File | Contract |
|---|---|---|
| Pure scorer | `lib/grade.mjs` | `scoreProjections(GradeInput) → GradeReport`; no I/O, no snapshot knowledge |
| Snapshot adapter | `scripts/grade-snapshot.mjs` | Loads snapshot + outcomes, builds `GradeInput`, orchestrates `gradeSnapshot()` |
| CLI | `bin/grade.mjs` | Parses flags, dispatches, exits cleanly |

### Target season heuristic

`deriveTargetSeason(capturedAtISO)` in `scripts/grade-snapshot.mjs`:
- Jan–Aug capture → target = year of `capturedAt` (offseason, projecting the coming season)
- Sep–Dec capture → target = year + 1 (in-season, still projecting the coming completed season)

Override with `--target-season YYYY` if the heuristic is wrong.

### In-basis grading (v2 snapshots)

For **v2 snapshots** (those with a `scoringSettings` field), the harness grades **in-basis**: it recomputes each player's actual target-season PPG by running a dot-product of the season-totals `stats` object against the snapshot's stored `scoringSettings` (via `lib/fantasyPoints.mjs`). This means absolute MAE/bias are **authoritative** — the actuals are computed under the same scoring weights as the projections, so no half_ppr basis offset distorts the numbers. The report shows:
- `Scored keys`: the number of non-zero scoring keys that exist in the season-totals stats universe.
- `Dropped`: scored keys absent from season-totals (omitted from actuals; in-basis totals undercount by these terms).
- `Rate-excluded`: non-additive rate keys (e.g. `rec_ypr`) stripped from `scoringSettings` before the dot-product (defensive guard; these never appear in real Sleeper `scoringSettings`).

**v1 snapshots** (no `scoringSettings`) continue to grade in half_ppr with the indicative-only basis-mismatch caveat. `--strict-basis` skips v1 non-half_ppr snapshots; it has no effect on v2 (in-basis makes it moot).

### Basis mismatch (v1 only)

v1 snapshots have `scoringBasis: "custom"` (league-specific settings) but outcomes are canonical `half_ppr`. As a result:
- Absolute PPG MAE/bias reflects basis offset as well as projection error — treat as indicative.
- Confidence-bucket relative ordering and the games block are **basis-independent** and reliable.
- Use `--strict-basis` to skip non-half_ppr v1 snapshots entirely.

### Self-test

`--self-test` runs `scripts/grade-snapshot.mjs::runSelfTest()`, which loads `test/fixtures/grade-snapshot.json` + `test/fixtures/grade-outcomes-2026.json`, scores them, and asserts hand-computed expected metrics (QB MAE=2.0, high-confidence MAE=2.5, games block n=4/MAE=0.5/bias=0, etc.). Also run by `npm run smoke`.

### Not yet available

Until `nfl/season-totals/2026.json` exists (expected early 2027), running `grade` for any 2026 snapshot prints "outcome not available yet" and exits 0. This is the expected state for all current snapshots.

---

## Analysis / Backtesting

`bin/backtest.mjs` is an offline, read-only retrospective analysis tool that measures the predictive value of the Phase-1a advstats metrics (`targetShare`, `airYardsShare`, `wopr`, `racr`) against next-season PPG. It is **not** the snapshot grader, writes no served file, has no manifest entry, and has no production path.

### Inputs

- **Predictors** — `nflverse/advstats/<year>.json` (WR/TE/RB, 2012+), joined on `sleeper_id`
- **Outcome + controls** — `nfl/season-totals/<year>.json` (outcome = Y+1 PPG, gated to `gamesPlayed ≥ 6`; controls = `overallShare`, `snapShare`, `rzOwnRate`)

### Methodology

Each row is a `(player, Y→Y+1)` pair pooled across 2012–2024 (predictor) → 2013–2025 (outcome). Per-position separate models (WR, TE, RB). Regression is **standardized OLS** via normal equations — z-score all columns, fit without intercept, solve `(XᵀX)β = Xᵀy` via Gauss-Jordan. Outputs: **standardized partial β** (the candidate's incremental contribution after removing the three controls), raw Pearson r, quintile response, R², and pairwise collinearity against each control.

**Collinearity framing** (decision 4): `targetShare` (advstats) ≈ `overallShare` (the control). Its partial β is expected near zero — meaning "already captured by volume," not "unrelated to PPG." The new-signal candidates are `airYardsShare` / `wopr` / `racr`.

**Non-independence caveat** (in every report): recurring players across Y→Y+1 pairs mean rows are not independent; standard errors are optimistic. βs are effect-size estimates, not significance tests.

**Note on `snapShare` coverage / effective panel:** `off_snp` is not tracked before 2020 in Sleeper data. Rows from pre-2020 seasons are listwise-dropped from any model using `snapShare` as a control (all metric runs and `--validate`). The **effective panel is ~2020–2024**; `meta.predictorYears` in each report reflects only the years that actually contributed surviving rows. The 2019 advstats file is also absent from disk (write failed; re-run `node bin/update.mjs advstats --year 2019 --force` to fill it — but its rows would be dropped anyway for missing `off_snp`, so it has no impact on results).

### D3 self-validation (`--validate`)

`--validate` is a **qualitative trust check** — not a numeric gate. It runs the D3 team-RZ-share regression on the ~2020–2024 snap-available panel and checks four criteria: team-share β > 0, own-rate β < 0, monotonic quintiles, raw r > 0. If WR/TE PASSes, the regression machinery is trustworthy.

**The D3 app-side numeric anchors (+0.17 WR/TE, +0.20 RB) are not numerically reproducible from season-totals here.** They were measured on the app's `historicalTeamTotals` over all rostered players (2012–2025, with snap-share neutralized pre-2020). The equivalent β on this tool's snap-available 2020–2024 panel is ≈ +0.52 (controls: rzOwnRate, snapShare — without overallShare, which is collinear with the WR/TE predictor and would invert the partial). Do not widen tolerances or adjust controls to force the numeric match.

**Prerequisite** — advstats files must be on disk before `--validate`:
```sh
for y in $(seq 2012 2025); do node bin/update.mjs advstats --year "$y" --force; done
```

### Backtest CLI

```sh
node bin/backtest.mjs                              # all metrics × all positions, pooled 2012→2025
node bin/backtest.mjs --metric target_share --position WR   # snake_case canonical; camelCase accepted
node bin/backtest.mjs --metric air_yards_share --position WR
node bin/backtest.mjs --metric all --position RB --from 2015 --to 2024
node bin/backtest.mjs --min-games 8               # override outcome games floor (default 6)
node bin/backtest.mjs --validate                  # qualitative D3 trust check (β>0, own-rate β<0, monotonic, raw r>0)
node bin/backtest.mjs --json                      # machine-readable BacktestReport(s)
node bin/backtest.mjs --write                     # persist backtests/<date>-<metric>-<pos>.json
node bin/backtest.mjs --by-season                 # per-season breakout in addition to pooled

# npm shortcut
npm run backtest
```

**Flags:** `--metric target_share|air_yards_share|wopr|racr|all` (snake_case canonical; camelCase also accepted) · `--position WR|TE|RB|all` · `--from YYYY` · `--to YYYY` · `--min-games N` · `--validate` · `--json` · `--write` · `--by-season`

Reports are written to `backtests/<YYYY-MM-DD>-<metric>-<position>.json` (analysis only — no manifest entry).

---

## Data sources and attribution

| Data | Source | Terms |
|---|---|---|
| NFL player stats | [Sleeper API](https://docs.sleeper.com/) | Personal use, read-only |
| Dynasty market values | [KeepTradeCut](https://keeptradecut.com/) | Personal use |
| College stats | [College Football Data API](https://collegefootballdata.com/) | Non-commercial / personal use |

This repo is for personal dynasty fantasy football analysis only. It is not affiliated with, endorsed by, or licensed by any of the above services.
