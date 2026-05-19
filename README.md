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
  raw/                        — Everything else exported from IndexedDB
                                (league data, player map, weekly stats, etc.)
```

---

## File schemas

### `nfl/season-totals/<year>.json`

Object keyed by Sleeper `player_id`. Each value is an aggregated per-player season record with raw stats, the canonical half-PPR fantasy point total, weekly-points for each played week, and a length-18 weekly participation array plus derived availability aggregates. Manifest entries for these files are at `schemaVersion: 2` as of Phase 5.

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

# Dry-run any subcommand (fetch + validate, no writes)
node bin/update.mjs nfl --year 2024 --dry-run
node bin/update.mjs cfbd --year 2023 --dry-run
node bin/update.mjs ktc --dry-run

# Force overwrite of a completed-season file
node bin/update.mjs nfl --year 2023 --force
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

Runs all three subcommands with `--dry-run` (no writes). Used by the smoke-test CI workflow on pull requests.

### GitHub Actions

| Workflow | Trigger | What it does |
|---|---|---|
| `weekly-ktc.yml` | Monday 13:17 UTC + `workflow_dispatch` | Runs `node bin/update.mjs ktc`, commits new snapshot if values changed |
| `smoke-test.yml` | PR touching `bin/`, `lib/`, `scripts/`, `package.json`, or `.github/workflows/` | Runs `npm run smoke` (all three dry-runs) |

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

## Data sources and attribution

| Data | Source | Terms |
|---|---|---|
| NFL player stats | [Sleeper API](https://docs.sleeper.com/) | Personal use, read-only |
| Dynasty market values | [KeepTradeCut](https://keeptradecut.com/) | Personal use |
| College stats | [College Football Data API](https://collegefootballdata.com/) | Non-commercial / personal use |

This repo is for personal dynasty fantasy football analysis only. It is not affiliated with, endorsed by, or licensed by any of the above services.
