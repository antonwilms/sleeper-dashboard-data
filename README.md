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
  raw/                        — Everything else exported from IndexedDB
                                (league data, player map, weekly stats, etc.)
```

---

## File schemas

### `nfl/season-totals/<year>.json`

Object keyed by Sleeper `player_id`. Each value is an object of aggregated season stats.

```json
{
  "<player_id>": {
    "gp": 16,
    "pts_ppr": 312.4,
    "pts_half_ppr": 298.1,
    "pts_std": 283.8,
    "rec": 104,
    "rec_yd": 1236,
    "rec_td": 8,
    "rush_att": 12,
    "rush_yd": 48,
    ...
  }
}
```

Source: Sleeper stats/projections API (`api.sleeper.com`). Fields vary by position — skill players include `rec_yd`, `rush_yd`, `pass_yd`; kickers include `fgm_*`; etc. The `gp` (games played) field is authoritative for career aggregation.

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
      "originalKey": "season-totals/2024",
      "recordCount": 2708,
      "inProgress":  true
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

## Data sources and attribution

| Data | Source | Terms |
|---|---|---|
| NFL player stats | [Sleeper API](https://docs.sleeper.com/) | Personal use, read-only |
| Dynasty market values | [KeepTradeCut](https://keeptradecut.com/) | Personal use |
| College stats | [College Football Data API](https://collegefootballdata.com/) | Non-commercial / personal use |

This repo is for personal dynasty fantasy football analysis only. It is not affiliated with, endorsed by, or licensed by any of the above services.
