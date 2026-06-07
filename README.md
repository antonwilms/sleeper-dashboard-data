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

### `snapshots/<date>.json`

Daily projection snapshot produced by the app's pipeline, capturing the contemporaneous inputs and outputs used for season projections. One file per UTC date. Used for future backtesting — no consumer UI in v1.

**First-league-of-the-day-wins:** if multiple leagues are opened in the same UTC day, the first one to complete the projection pipeline is captured; subsequent leagues are silently skipped. The `leagueId` field makes this detectable after the fact.

```json
{
  "schemaVersion": 1,
  "capturedAt":    "2026-05-19T14:23:11.812Z",
  "scoringBasis":  "half_ppr",
  "leagueId":      "1312015497465716736",
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

**`ktc`** is `null` if the player isn't in the KTC map; otherwise `{ value, positionPercentile }`.

**`projection`** is the verbatim output of `computeNextSeasonProjection` — no field whitelist.

**Import workflow:**
1. Click "Export data" in the app (wait for the projection pipeline to finish first).
2. From this repo's root, run `npm run import:snapshot`.

`bin/import-snapshot.mjs` finds the newest `sleeper-dashboard-export*.zip` in `~/Downloads`,
extracts `snapshots/<date>.json`, copies it in, registers it in `manifest.json`
(via the same `snapshots` registration as `bin/update.mjs snapshots`), then commits
and pushes `snapshot: <date>`. It is idempotent — if the date is already present it
prints a message and exits without committing. If `git push` is rejected (e.g. the
weekly KTC action pushed first) it runs `git pull --rebase` and retries once.

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

### Basis mismatch

All current snapshots have `scoringBasis: "custom"` (league-specific settings). Outcomes are canonical `half_ppr`. As a result:
- Absolute PPG MAE/bias reflects basis offset as well as projection error — treat as indicative.
- Confidence-bucket relative ordering and the games block are **basis-independent** and reliable.
- Use `--strict-basis` to skip non-half_ppr snapshots entirely.
- Capturing the league's raw `scoringSettings` in the snapshot (planned) would enable in-basis grading.

### Self-test

`--self-test` runs `scripts/grade-snapshot.mjs::runSelfTest()`, which loads `test/fixtures/grade-snapshot.json` + `test/fixtures/grade-outcomes-2026.json`, scores them, and asserts hand-computed expected metrics (QB MAE=2.0, high-confidence MAE=2.5, games block n=4/MAE=0.5/bias=0, etc.). Also run by `npm run smoke`.

### Not yet available

Until `nfl/season-totals/2026.json` exists (expected early 2027), running `grade` for any 2026 snapshot prints "outcome not available yet" and exits 0. This is the expected state for all current snapshots.

---

## Data sources and attribution

| Data | Source | Terms |
|---|---|---|
| NFL player stats | [Sleeper API](https://docs.sleeper.com/) | Personal use, read-only |
| Dynasty market values | [KeepTradeCut](https://keeptradecut.com/) | Personal use |
| College stats | [College Football Data API](https://collegefootballdata.com/) | Non-commercial / personal use |

This repo is for personal dynasty fantasy football analysis only. It is not affiliated with, endorsed by, or licensed by any of the above services.
