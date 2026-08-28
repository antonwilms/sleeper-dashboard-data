# sleeper-dashboard-data

Longitudinal data store for [Sleeper Dashboard](https://github.com/antonwilms/sleeper-dashboard) — a personal dynasty fantasy football analysis tool.

This repo holds serialised data from the Sleeper, KeepTradeCut, and College Football Data (CFBD) APIs plus nflverse/DynastyProcess/nfldata release assets. Most families are fetched server-side by this repo's own ingest scripts (`bin/update.mjs`); projection snapshots are exported from the app's IndexedDB cache. Everything is committed as static JSON served over CDN, reducing API traffic and enabling historical comparisons across seasons.

**Last updated:** 2026-07-04

---

## Why this repo exists

The app fetches Sleeper/CFBD/KTC data and caches it in the browser's IndexedDB; the nflverse families are ingested directly by this repo (never by the app). That cache is ephemeral — it lives in one browser profile and is lost on a clear. This repo makes the data:

- **Portable** — accessible from any device without re-fetching
- **Historical** — past seasons are locked in; corrections are tracked via git history
- **Fast** — served over jsDelivr CDN instead of live API calls
- **Auditable** — every update is a dated commit

`data-catalog.md` is the index of every served family — grain, coverage, joins, gates, and honest
gaps.

---

## Folder structure

```
sleeper-dashboard-data/
  manifest.json               — Index of all files with metadata
  data-catalog.md             — Living dataset index: one section per served family (see Done-definition)
  nfl/
    season-totals/            — Sleeper per-player season aggregates (2012–present)
      2024.json
      ...
    players-state/            — weekly Sleeper players-state snapshots (status/injury/depth), date-keyed, capture-only
      2026-07-18.json
      ...
  college/
    passing/                  — CFBD passing stats per player per season (2017–2025)
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
    gamelogs/                 — nflverse per-game player stats (QB/RB/WR/TE/FB), one file per year, keyed by sleeper_id
      2024.json
    teamcontext/              — pbp-derived team/game context (PROE, pace, RZ tendencies, defense-faced), one file per year, TEAM-keyed
      2024.json
    oline/                    — nflverse OL composition per team-week (ESPN depth charts), one file per year, TEAM-keyed, capture-only
      2025.json
  raw/                        — Everything else exported from IndexedDB
                                (league data, player map, CFBD player manifests, etc.)
```

---

## File schemas

### `nfl/season-totals/<year>.json`

Object keyed by Sleeper `player_id`. Each value is an aggregated per-player season record with raw stats, the canonical half-PPR fantasy point total, weekly-points for each played week, and a length-18 weekly participation array plus derived availability aggregates. Manifest entries for these files are at `schemaVersion: 3`. Each record also carries a per-season **`team`** — the player's primary NFL team that season (most played weeks; ties → most-recent), normalized to the schedule's `homeTeam`/`awayTeam` abbreviation domain (`api.sleeper.com` weekly `team`, with `LAR → LA`; era-accurate, so 2012–2016 Rams = `STL`, etc.). `null` when no team can be resolved. This lets consumers join each game to the correct opponent without relying on a player's current team. Mid-season trades collapse to the primary team (a documented residual). Publish-time validation additionally rejects any record containing a non-finite numeric (`NaN`/`Infinity`/`-Infinity`) in any field, so every completed-season file is guaranteed wholly finite.

```json
{
  "<player_id>": {
    "stats":         { "rec": 104, "rec_yd": 1236, "rush_yd": 48, "...": "..." },
    "team":          "STL",
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

### `nfl/players-state/<date>.json`

Weekly capture of Sleeper's current-state-only `status`/`injury`/depth-chart fields. Sleeper
serves no history for this endpoint and nothing server-side snapshots it, so every week that
passes without capture permanently loses that week's state. **Capture-only:** no app, projection,
grading, or backtest path reads this family; activation requires a graded gate.

```json
{
  "schemaVersion": 1,
  "date": "2026-07-18",
  "capturedAt": "2026-07-18T14:11:32.000Z",
  "source": "sleeper:v1/players/nfl",
  "positions": ["QB", "RB", "WR", "TE", "FB", "K"],
  "playerCount": 1012,
  "players": {
    "4046": {
      "name": "Patrick Mahomes",
      "team": "KC",
      "position": "QB",
      "fantasyPositions": ["QB"],
      "status": "Active",
      "injuryStatus": null,
      "injuryBodyPart": null,
      "injuryStartDate": null,
      "injuryNotes": null,
      "practiceParticipation": null,
      "practiceDescription": null,
      "depthChartPosition": "QB",
      "depthChartOrder": 1,
      "active": true,
      "teamChangedAt": null,
      "newsUpdated": 1774912523407,
      "searchRank": 3
    }
  }
}
```

**Membership filter:** include a player iff `active === true` AND `team !== null` AND
(`position` ∈ `{QB, RB, WR, TE, FB, K}` or its `fantasy_positions` intersect that set). This
excludes OL (Sleeper carries no depth-chart order for OL — see `data-catalog.md`), DEF
pseudo-players, and the teamless-active tail (mostly retired/unsigned noise).

**Included fields, condensed:** `name` (join/debug convenience, not load-bearing), `team`
(membership key), `position`, `fantasyPositions`, `status`, `injuryStatus`, `injuryBodyPart`,
`injuryStartDate`, `injuryNotes`, `practiceParticipation`, `practiceDescription`,
`depthChartPosition`, `depthChartOrder`, `active`, `teamChangedAt` (team-churn-aligned),
`newsUpdated`/`searchRank` (cheap market-relevance signals). Every key is written explicitly,
`null` when upstream is null/absent — absence never means "not captured". Excluded: biographical/
static fields, external crosswalk IDs, Sleeper-internal `metadata`/`competitions`.

**Dedup semantics:** an unchanged week writes nothing — content-hash deduped against the most
recent prior snapshot (KTC pattern), excluding the near-continuously-churning `newsUpdated` and
`searchRank` fields from the hash so genuine offseason weeks with no roster/status change produce
no commit. Absence of a date in this folder means either "no change that week" or "not yet
captured" — run-evidence liveness lives in the A2 detector, not a marker file here. A same-day
re-run with changed upstream overwrites that day's file, mirroring the KTC capture (first-write
does not lock the day).

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

**Integrity guards.** Each scrape is validated per-row (finite integer value in 0–9999, non-empty name, known position or null for rookie picks, count 250–600) and checked for aggregate breakage via a Spearman rank correlation against the last good snapshot (joined on player name). Legitimate market recalibration preserves ordering (ρ ≈ 0.998); a selector/parse break collapses it. Below ρ = 0.90 the snapshot is **quarantined** to `ktc/quarantine/` (committed for review but not registered in the manifest, so the app never reads it) and the weekly workflow fails for manual review — a false trip never permanently loses a day.

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
the nflverse `stats_player` weekly asset
(`https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_<year>.csv`,
the file `nflreadr::load_player_stats()` wraps). The legacy `player_stats` release tag is frozen
(broken 2019 upload, no 2025+); this repo fetched it until 2026-07 — do not revert. CORS-blocked in browsers; fetched and processed
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

### `nflverse/gamelogs/<year>.json`

Per-game player stats produced by `bin/update.mjs gamelogs [--year YYYY] [--all]`, sourced from
`stats_player_week_<year>.csv` in the nflverse `stats_player` release (the same CSV the `advstats`
ingest already fetches, now mined for per-game grain).

**Served shape:**
```json
{
  "schemaVersion": 1,
  "season": 2024,
  "generatedAt": "2026-06-28T12:00:00.000Z",
  "rowCount": 6224,
  "playerCount": 601,
  "unmapped": 12,
  "players": {
    "1234": {
      "gsisId": "00-0033921",
      "name": "CeeDee Lamb",
      "position": "WR",
      "games": [
        {
          "week": 1, "seasonType": "REG", "team": "DAL", "opponent": "CLE",
          "carries": 0,
          "receptions": 9, "targets": 13, "receivingYards": 110, "receivingTds": 1,
          "receivingAirYards": 142, "receivingYardsAfterCatch": 41, "receivingFirstDowns": 6,
          "receivingEpa": 7.42, "racr": 0.77, "targetShare": 0.31, "airYardsShare": 0.45,
          "wopr": 0.78, "fantasyPoints": 11.0, "fantasyPointsPpr": 20.0
        }
      ]
    }
  }
}
```

**Key semantics:**

- **Per-game grain, keyed by `sleeper_id`.** Each player entry carries a `games[]` array, one
  element per game row; the app joins directly via `sleeper_id` (same as `advstats`/`roster`).
- **`rowCount` = total per-game rows** (the grain count). **`playerCount` = `Object.keys(players).length`**.
  **`unmapped`** = distinct gsis ids dropped for having no crosswalk entry.
  Manifest `recordCount = rowCount`.
- **Omit-on-null (empty-vs-zero rule):** for every mapped stat column, `v = numOrNull(cell)`;
  if `v === null`, the key is **omitted** (never zero-filled). Because the source uses empty
  string for inapplicable cross-position fields and `'0'` for real zeros, a WR row keeps
  `carries: 0` (real) but omits `passingEpa` (absent). A pre-charting season omits
  `receivingAirYards` rather than fabricating `0`. **Absent key ≡ stat not recorded for
  that game.** Identity fields (`week`, `seasonType`, `team`, `opponent`) are always present.
- **Per-game rate fields are single-game values — never sum them** (`targetShare`, `airYardsShare`,
  `wopr`, `racr`, `passingCpoe`, `pacr`). To get a season figure, recompute from components.
  Summing weekly rates produces an inflated nonsense number, the same trap as `pass_rtg`/`cmp_pct`.
- **`fantasyPoints` / `fantasyPointsPpr`** are **nflverse** default scoring — NOT Sleeper/app
  scoring. Captured for display/training only. Must **never** feed grading/projection/scoring.
- **Position scope:** QB, RB, WR, TE, FB (offensive skill). `def_*` (IDP), special-teams-return,
  and kicking (`fg_*/pat_*/gwfg_*`) families are out of scope — structurally empty for offensive
  players. A future slice can widen the position filter.
- **Coverage floor: 2012** (`MIN_GAMELOG_SEASON`). The source goes back to 1999, but pre-2006
  `receivingAirYards`/YAC fields are source-zero-filled (not `NA`) — backfilling below 2012 would
  fabricate zeros as real data. `schedule` floors at 1999 (charting-independent); `gamelogs`
  cannot.
- **Sparsity gate:** `MIN_PLAYERGAME_ROWS = 3000` (~50% of a ~6000-row season). Catches
  truncated fetches. The app should re-assert `rowCount >= MIN_PLAYERGAME_ROWS` on read.
- **`inProgress: false` always** — deliberate deviation (CLAUDE.md Invariant 5): the app has
  no live fallback; it must read from the store. Weekly mutation is handled by SHA-256 content-hash
  dedup + `lastModified` cache invalidation.
- **Refresh:** Saturday 13:47 UTC (`nflverse-gamelogs.yml`), after Wednesday playerids so the
  gsis re-key hits the freshest crosswalk.

```sh
node bin/update.mjs gamelogs --year 2023
node bin/update.mjs gamelogs --year 2023 --dry-run
node bin/update.mjs gamelogs            # current season
node bin/update.mjs gamelogs --all      # backfill ≥ 2012
```

---

### `nflverse/schedule/<year>.json`

Per-season NFL schedule + results produced by `bin/update.mjs schedule [--year YYYY] [--all]`,
sourced from the combined nflverse `nfldata` games file
(`https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv`, the file
`nflreadr::load_schedules()` wraps). One combined CSV (all seasons) is fetched, grouped by season,
and served as one file per year. CORS-blocked in the browser; ingested server-side and served via
jsDelivr.

```json
{ "schemaVersion": 1, "season": 2023, "generatedAt": "…", "rowCount": 285,
  "games": [ { "gameId": "2023_01_DET_KC", "season": 2023, "week": 1, "gameType": "REG",
    "homeTeam": "KC", "awayTeam": "DET", "homeScore": 20, "awayScore": 21, "result": -1,
    "spreadLine": 4.5, "totalLine": 53.0, "roof": "outdoors", "surface": "grass",
    "temp": 70, "wind": 8 } ] }
```

`games` is an array, one record per game. `result` is the **home margin** (`homeScore − awayScore`):
positive = home win, `0` = tie, negative = away win; passed through from the source, never recomputed.
`gameType` ∈ `REG`,`WC`,`DIV`,`CON`,`SB`. Field names are camelCased from the source columns
(`game_id → gameId`, `spread_line → spreadLine`, …).

**Null fields:** future / in-progress games have `null` `homeScore`/`awayScore`/`result` but keep
`spreadLine`/`totalLine` (lines post before kickoff). Dome / closed-roof games and pre-weather
seasons have `null` `temp`/`wind`.

**Sparsity gate (`MIN_SCHEDULE_GAMES = 200`):** a published season has its full slate at once
(≈256–285 games incl. playoffs); the ingest skips any season with fewer than 200 rows (truncated
fetch) and skips a not-yet-published season (0 rows). The app re-asserts the same gate on `rowCount`.
If either side changes this constant, change both.

**`inProgress: false` (deliberate deviation):** like roster/advstats, the app has no live fallback —
it must read schedules from the store. Current-season weekly mutation is handled by SHA-256
content-hash dedup + `lastModified`-driven app cache invalidation. Do not set `inProgress: true`.

**Weekly refresh:** `nflverse-schedule.yml` runs Friday 13:35 UTC and re-ingests the current
season (default mode). Historical seasons are static once final; backfill them once with
`schedule --all`.

---

### `nflverse/teamcontext/<year>.json`

pbp-derived team/game context produced by `bin/update.mjs teamcontext [--year YYYY] [--all]`,
sourced from `play_by_play_<year>.csv.gz` in the nflverse `pbp` release (derive-and-discard — the
~140MB decompressed CSV is never committed; only the derived team-week rows are). This is the
repo's **first team-keyed served family** — every other family is `sleeper_id`-keyed. Derived
features only (PROE, pace, red-zone tendencies, defense-faced, game script) — not a raw-column
passthrough.

**Served shape:**
```json
{
  "schemaVersion": 1,
  "season": 2024,
  "generatedAt": "2026-07-04T12:00:00.000Z",
  "rowCount": 570,
  "teamCount": 32,
  "teams": {
    "KC": {
      "games": [
        {
          "week": 1, "seasonType": "REG", "gameId": "2024_01_BAL_KC", "opponent": "BAL",
          "off": {
            "plays": 62, "passPlays": 38, "rushPlays": 24, "passRate": 0.613,
            "epaSum": 4.213, "epaPlays": 62, "epaPerPlay": 0.068,
            "passEpaSum": 5.1, "passEpaPlays": 38, "passEpaPerPlay": 0.134,
            "rushEpaSum": -0.887, "rushEpaPlays": 24, "rushEpaPerPlay": -0.037,
            "successes": 29, "successPlays": 62, "successRate": 0.468,
            "proePlays": 60, "proePassPlays": 37, "proeXpassSum": 33.94, "proe": 0.051,
            "rzTrips": 4, "rzPlays": 11, "rzPassPlays": 6, "rzRushPlays": 5,
            "rzPassRate": 0.545, "rzTdTrips": 2, "rzFgTrips": 1,
            "neutralSeconds": 1240, "neutralGaps": 41, "neutralSecPerPlay": 30.244,
            "pointsScored": 27
          },
          "def": {
            "plays": 65, "passPlays": 41, "rushPlays": 24,
            "epaSum": -2.1, "epaPlays": 65, "epaPerPlay": -0.032,
            "passEpaSum": -1.2, "passEpaPlays": 41, "passEpaPerPlay": -0.029,
            "rushEpaSum": -0.9, "rushEpaPlays": 24, "rushEpaPerPlay": -0.038,
            "successes": 27, "successPlays": 65, "successRate": 0.415,
            "rzTripsAllowed": 3, "rzTdTripsAllowed": 1,
            "pointsAllowed": 20
          }
        }
      ]
    }
  }
}
```

**Feature definitions (summary — the derivation is defined computations over play-by-play, not a
raw-column fetch):**

- **Basis:** a "scrimmage row" is `posteam` present AND (`pass==1` OR `rush==1`); a "countable
  play" (the denominator for every feature below) is a scrimmage row that is not
  `play_type=='no_play'` and not `two_point_attempt==1`.
- **`proe`** (pass rate over expected) — `(proePassPlays − proeXpassSum) / proePlays`, from
  countable plays where `xpass` is non-null. Null when `proePlays==0` (every row of a pre-2006
  season, or any team-game where `xpass` is absent — **honest null, never fabricated**).
- **Pace** — `plays`/`passPlays`/`rushPlays`/`passRate` (raw volume) plus
  `neutralSecPerPlay` (situation-neutral seconds-per-snap: consecutive countable plays in the
  same drive where both endpoints have `wp` ∈ [0.2, 0.8], `qtr ≤ 3`, `half_seconds_remaining >
  120`; gaps clamped to [5, 45]s; any intervening non-countable row breaks the chain). Null when
  `neutralGaps==0` (a wire-to-wire blowout has no neutral snaps).
- **Red-zone tendencies** — `rzTrips` (distinct `(gameId, fixed_drive)` with ≥1 countable RZ
  play, `yardline_100 ≤ 20`), `rzPlays`/`rzPassPlays`/`rzRushPlays`/`rzPassRate`, `rzTdTrips`/
  `rzFgTrips` from the drive's `fixed_drive_result`.
- **Defense-faced / offense quality** — `epaPerPlay`/`passEpaPerPlay`/`rushEpaPerPlay`/
  `successRate` mirrored on both `off` (this team's offense) and `def` (this team's defense,
  i.e. what it allowed) blocks; `pointsScored`/`pointsAllowed` from the game's final score.

**Consumer aggregation recipes (the C4 contract — components + rate stored together; NEVER sum
or average the stored per-game rates; recompute season figures from summed components):**
```
seasonProe          = (Σ proePassPlays − Σ proeXpassSum) / Σ proePlays
seasonEpaPerPlay     = Σ epaSum / Σ epaPlays          (same for pass/rush/def variants)
seasonRzPassRate     = Σ rzPassPlays / (Σ rzPassPlays + Σ rzRushPlays)
seasonRzTdRate       = Σ rzTdTrips / Σ rzTrips        (settle rate: Σ rzFgTrips / Σ rzTrips)
seasonNeutralPace    = Σ neutralSeconds / Σ neutralGaps
playsPerGame         = Σ plays / count(games)         (after the consumer's seasonType filter)
```

**Era remap (load-bearing — the opposite direction from gamelogs):** pbp's team columns
(`posteam`/`defteam`/`home_team`/`away_team`) are normalized to **current**-franchise codes in
every season (2013 pbp shows `LA`/`LAC`/`LV`, never `STL`/`SD`/`OAK`). This repo's join domain
(schedule `homeTeam`/`awayTeam`, season-totals per-season `team`) is **era-accurate**, so
ingest remaps `LA→STL` (season ≤ 2015), `LAC→SD` (≤ 2016), `LV→OAK` (≤ 2019) before keying —
`eraTeam()` in `lib/nflverse.mjs`. **This is the INVERSE of the `nflverse/gamelogs` per-season
`team` decision**, which deliberately keeps the nflverse (current-franchise) domain — the two
families have different join targets; do not "fix" one to match the other.

**Null semantics:** a bye week is simply an absent week in `games[]` (no fabricated row, no
null-stuffed placeholder). Every rate is null on a zero denominator, per feature above. `xpass`
(and therefore `proe`) is a genuine upstream-absent boundary before 2006 (moot at this family's
2012 floor, documented for any future widening).

**Sparsity gate (`MIN_TEAMCONTEXT_ROWS = 60`):** a full season has 534–570 team-game rows; the
gate is deliberately low (≈2 weeks) relative to gamelogs' ~50%-of-season floor — a truncated gz
download fails `gunzipSync` loudly (CRC), so the gate only needs to catch an empty/header-only
asset, and a team-context pack consumed weekly should serve from week 2, not wait to week 9.

**`inProgress: false` (deliberate deviation):** like the other nflverse families, the app has no
live fallback — weekly mutation is handled by SHA-256 content-hash dedup + `lastModified`-driven
app cache invalidation.

**Weekly refresh:** `nflverse-teamcontext.yml` runs Sunday 13:53 UTC (before Sunday kickoffs, so
week N lands complete on the *following* Sunday — pbp for Monday Night Football settles Tuesday).
No crosswalk dependency (team-keyed family) — unlike gamelogs, no Action-ordering constraint on
the playerids Action.

```sh
node bin/update.mjs teamcontext --year 2023
node bin/update.mjs teamcontext --year 2023 --dry-run
node bin/update.mjs teamcontext            # current season
node bin/update.mjs teamcontext --all      # backfill ≥ 2012
```

---

### `nflverse/oline/<year>.json`

OL composition forward capture produced by `bin/update.mjs oline [--year YYYY] [--all]`, sourced
from `depth_charts_<year>.csv` in the nflverse `depth_charts` release (ESPN feed). This repo's
**second team-keyed served family** (after teamcontext). **Capture-only — no consumer,
enrichment, or scoring path reads it.**

**ESPN-era floor:** `depth_charts_2024.csv` and earlier use a different legacy NFL-feed schema
entirely (`season,club_code,week,…,depth_position`); the ESPN `dt` schema begins with the 2025
file. `MIN_OLINE_SEASON = 2025` — pre-2025 backfill is out of scope (reconstructable later, zero
loss risk; upstream retains the full daily chart history).

**Weekly reduction:** upstream publishes near-daily. One state per (team, ISO-week): rows are
bucketed by `isoWeekKey(dt)`, and only rows from the bucket's **max `dt`** (the week's latest
chart) are kept — loss-free, since the daily grain stays recoverable upstream.

**Served shape:**
```json
{
  "schemaVersion": 1,
  "season": 2026,
  "generatedAt": "2026-07-18T14:37:20.000Z",
  "source": "nflverse depth_charts (ESPN feed)",
  "rowCount": 6812,
  "teamCount": 32,
  "stateCount": 544,
  "teams": {
    "SF": {
      "states": [
        {
          "week": "2026-W29",
          "date": "2026-07-18",
          "dt": "2026-07-18T08:46:51Z",
          "ol": [
            { "slot": "LT", "rank": 1, "name": "Trent Williams",  "gsisId": "00-0027857", "espnId": "3116365" },
            { "slot": "LG", "rank": 1, "name": "Robert Jones",    "gsisId": "00-0036596", "espnId": "4051305" },
            { "slot": "C",  "rank": 1, "name": "Jake Brendel",    "gsisId": "00-0032701", "espnId": "2578355" },
            { "slot": "RG", "rank": 1, "name": "Dominick Puni",   "gsisId": "00-0039351", "espnId": "4429795" },
            { "slot": "RT", "rank": 1, "name": "Colton McKivitz", "gsisId": "00-0036256", "espnId": "3921690" },
            { "slot": "LT", "rank": 2, "name": "Austen Pleasants","gsisId": "00-0035829", "espnId": "3912092" }
          ]
        }
      ]
    }
  }
}
```

**Field semantics:**
- `week` — ISO-8601 week key of `dt` (`YYYY-Www`); `date`/`dt` — the chosen (max) upstream
  timestamp for that week. States sorted ascending by `dt`; `ol` sorted slot order
  (LT,LG,C,RG,RT) then `rank`.
- Captured rows: upstream offense rows with `pos_abb ∈ {LT, LG, C, RG, RT}` — all ranks kept
  (starters and depth; rank is data, never pre-filtered). Skill/defense/ST rows are dropped —
  loss-free, upstream archives the full chart.
- **`gsisId`/`espnId` — verbatim strings, format NOT validated:** UDFAs carry non-gsis
  placeholder ids upstream (observed `"WIL597533"`, `"CRU840186"`). Null when upstream empty.
- **No sleeper_id re-key** — OL are largely absent from the DynastyProcess crosswalk
  (fantasy-oriented); joins are name/gsis-based later if ever needed. Keeps the family free of
  the playerids Action-ordering dependency (teamcontext precedent).

**Sparsity gate (`MIN_OLINE_ROWS = 160`):** ≈430 OL entries per full week across 32 teams; 160 ≈
one thin week — high enough to catch a truncated/preliminary fetch.

**`inProgress: false` (always — Invariant 5):** like the other nflverse families, the app has no
live fallback; weekly mutation is handled by content-hash dedup + `lastModified`-driven cache
invalidation. **Capture-only: no loader exists or is planned today.**

**Weekly refresh:** `nflverse-oline.yml` runs Saturday 14:37 UTC (pre-Sunday state, off-the-hour
— gamelogs Sat 13:47, playerstate Sat 14:11).

```sh
node bin/update.mjs oline --year 2025
node bin/update.mjs oline --year 2025 --dry-run
node bin/update.mjs oline            # current season
node bin/update.mjs oline --all      # backfill ESPN-era seasons ≥ 2025
```

---

### `raw/<name>.json`

Miscellaneous IndexedDB entries that don't fit a named category: league data, roster snapshots, the Sleeper player map, etc. Filenames are derived from the original cache key with `/` replaced by `-`.

---

## `manifest.json` shape

```json
{
  "generatedAt":   "2026-06-21T12:00:00.000Z",
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
      "schemaVersion": 3,
      "lastModified":  "2026-05-19T18:32:11.123Z"
    }
  }
}
```

| Field | Meaning |
|---|---|
| `generatedAt` | ISO timestamp rewritten on every `updateManifestEntry()` call; reflects when any update script last ran. Does not drive app freshness — the app gates on per-file `lastModified` |
| `exportedAt` | Static ISO timestamp from the original IndexedDB export that seeded this manifest; not updated by scripts. Does not drive app freshness |
| `schemaVersion` | Incremented when the file structure changes incompatibly |
| `repo` | Identifies this repo (useful when manifest is fetched standalone) |
| `description` | Human-readable description |
| `source` | Always `"indexeddb"` — where the data came from |
| `files` | Map from ZIP path → file metadata |
| `files[*].originalKey` | The IndexedDB cache key the data came from |
| `files[*].recordCount` | Number of top-level entries in the file (array length or object key count) |
| `files[*].inProgress` | `true` if this season/snapshot may still receive updates; `false` if completed. Exception: KTC snapshots always register `true` (dated "current-value" marker) despite being permanent |
| `files[*].schemaVersion` | Schema version of this specific file (written by update scripts). NFL season-totals files are at `3` (note `team` added); KTC snapshots remain at `1`. |
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

# Fetch nflverse NFL schedules + results (per-season)
node bin/update.mjs schedule
node bin/update.mjs schedule --year 2023
node bin/update.mjs schedule --all

# Fetch nflverse per-game player stats (QB/RB/WR/TE/FB), re-keyed to sleeper_id
node bin/update.mjs gamelogs --year 2023
node bin/update.mjs gamelogs            # current season
node bin/update.mjs gamelogs --all      # backfill ≥ 2012

# Fetch pbp-derived team/game context (PROE, pace, RZ tendencies, defense-faced), TEAM-keyed
node bin/update.mjs teamcontext --year 2023
node bin/update.mjs teamcontext         # current season
node bin/update.mjs teamcontext --all   # backfill ≥ 2012

# Capture a weekly Sleeper players-state snapshot (status/injury/depth), date-keyed
node bin/update.mjs playerstate

# Fetch nflverse OL composition per team-week (ESPN depth charts), TEAM-keyed
node bin/update.mjs oline --year 2025
node bin/update.mjs oline               # current season
node bin/update.mjs oline --all         # backfill ESPN-era seasons ≥ 2025

# Dry-run any subcommand (fetch + validate, no writes)
# --dry-run also suppresses per-iteration fetch progress (the NFL week loop and
#   KTC page loop); real (non-dry-run) ingests still print full progress.
node bin/update.mjs nfl --year 2024 --dry-run
node bin/update.mjs cfbd --year 2023 --dry-run
node bin/update.mjs ktc --dry-run
node bin/update.mjs roster --year 2024 --dry-run
node bin/update.mjs draft --dry-run
node bin/update.mjs playerids --dry-run
node bin/update.mjs advstats --year 2023 --dry-run
node bin/update.mjs schedule --year 2023 --dry-run
node bin/update.mjs gamelogs --year 2023 --dry-run
node bin/update.mjs teamcontext --year 2023 --dry-run
node bin/update.mjs playerstate --dry-run
node bin/update.mjs oline --year 2025 --dry-run

# Force overwrite of a completed-season file (nfl/cfbd/roster/advstats/schedule/gamelogs/teamcontext/oline)
node bin/update.mjs nfl --year 2023 --force
node bin/update.mjs roster --year 2024 --force
node bin/update.mjs advstats --year 2023 --force
node bin/update.mjs schedule --year 2023 --force
node bin/update.mjs gamelogs --year 2023 --force
node bin/update.mjs teamcontext --year 2023 --force
node bin/update.mjs oline --year 2025 --force
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

Runs dry-run checks for nfl/cfbd/ktc/roster/draft/playerids/advstats/schedule/gamelogs/teamcontext/playerstate/oline (no writes), validates enrichment, and runs the grade self-test. The smoke-test CI workflow runs a subset on pull requests (`npm test` + nfl/cfbd/ktc/playerids/advstats/gamelogs dry-runs + enrichment validation), not `npm run smoke` itself.

### GitHub Actions

| Workflow | Trigger | What it does |
|---|---|---|
| `weekly-ktc.yml` | Monday 13:17 UTC + `workflow_dispatch` | Runs `node bin/update.mjs ktc`; per-row + Spearman-ordering integrity guards; commits the new snapshot (or a quarantined one under ktc/quarantine/ for review) if changed, purges jsDelivr CDN cache; fails the run if a snapshot was quarantined |
| `weekly-nflverse-roster.yml` | Tuesday 13:23 UTC + `workflow_dispatch` | Runs `node bin/update.mjs roster`, commits if content hash changed, purges jsDelivr CDN cache for changed files |
| `nflverse-draft.yml` | May 1 12:00 UTC + `workflow_dispatch` | Runs `node bin/update.mjs draft`, commits if content changed, purges jsDelivr CDN cache |
| `nflverse-playerids.yml` | Wednesday 13:29 UTC + `workflow_dispatch` | Runs `node bin/update.mjs playerids`, commits if content hash changed, purges jsDelivr CDN cache |
| `nflverse-advstats.yml` | Thursday 13:41 UTC + `workflow_dispatch` | Runs `node bin/update.mjs advstats` (after playerids), commits if content changed, purges jsDelivr CDN cache |
| `nflverse-schedule.yml` | Friday 13:35 UTC + `workflow_dispatch` | Runs `node bin/update.mjs schedule` (current season), commits if content hash changed, purges jsDelivr CDN cache |
| `nflverse-gamelogs.yml` | Saturday 13:47 UTC + `workflow_dispatch` | Runs `node bin/update.mjs gamelogs` (current season, after playerids), commits if content hash changed, purges jsDelivr CDN cache |
| `nflverse-teamcontext.yml` | Sunday 13:53 UTC + `workflow_dispatch` | Runs `node bin/update.mjs teamcontext` (current season), commits if content hash changed, purges jsDelivr CDN cache |
| `weekly-playerstate.yml` | Saturday 14:11 UTC + `workflow_dispatch` | Runs `node bin/update.mjs playerstate`; content-hash dedup (excluding churning `newsUpdated`/`searchRank` fields); commits the new dated snapshot if changed, purges jsDelivr CDN cache |
| `nflverse-oline.yml` | Saturday 14:37 UTC + `workflow_dispatch` | Runs `node bin/update.mjs oline` (current season), commits if content hash changed, purges jsDelivr CDN cache |
| `cron-deadman.yml` | Daily 05:19 UTC + push to `main` + `workflow_dispatch` | Runs `node bin/deadman.mjs`; monitoring only — no writes, no manifest touch |
| `smoke-test.yml` | PR touching `bin/`, `lib/`, `scripts/`, `package.json`, `enrichment/`, or `.github/workflows/` | Runs the nfl/cfbd/ktc/playerids/advstats/gamelogs dry-runs, validates enrichment, and npm test (unit validators) |

The weekly KTC workflow commits only when content changes (SHA256 hash dedup). If values are identical to the last snapshot, it writes `ktc/last-checked.json` only and produces no commit. If the ordering guard trips, the scrape is written to `ktc/quarantine/` with a `.reason.json` sidecar instead of `ktc/`, and the run fails so it can be reviewed and promoted manually.

*Season-keyed purges (roster, advstats, schedule, gamelogs, teamcontext) derive the file's NFL season from the node update step via a `season` step-output (`GITHUB_OUTPUT`), not `date -u +%Y` — the two diverge in the Jan–Feb rollover window, so calendar year would purge the wrong season's file.*

#### Cron dead-man detector (`cron-deadman.yml`)

Protects every scheduled capture (all crons above, automatically) from silent loss — a job that
stops running with no error, no trace. The expected-job set is not a separate registry: the
detector enumerates `.github/workflows/*.yml`, extracts every `cron:` line (quoted or unquoted —
a `cron:` value it cannot parse is never silently skipped, it is surfaced as a `malformed-cron`
finding), and cross-checks each scheduled workflow against the GitHub Actions API. Any new
workflow with a `cron:` line is covered on merge — do not add a parallel job registry.

For each scheduled workflow, all four must hold or the run goes red:

1. **Registered** — the local workflow file has a matching Actions-API workflow (matched on `path`).
2. **Enabled** — API `state === "active"`; catches GitHub's 60-day `disabled_inactivity` auto-disable and manual disables.
3. **Recent** — the latest run (any event, including a manual `workflow_dispatch`) has `created_at` within the cron's max-age window; a workflow with no runs at all is red once its own `created_at` exceeds the window (bootstrap grace for freshly added jobs).
4. **Healthy** — that latest run's `conclusion` is `success` or `null` (in progress). A KTC quarantine trip deliberately fails its run (see above) — the detector re-flags it daily until resolved, which is correct: a quarantine needs human review.

Cadence (max age before a job is considered missed), derived from the cron's day-of-week /
day-of-month / month fields:

| Pattern | Kind | Max age |
|---|---|---|
| day-of-week field ≠ `*` | weekly | 8 days |
| day-of-month ≠ `*` and month ≠ `*` | yearly | 368 days |
| day-of-month ≠ `*` | monthly | 33 days |
| otherwise | daily | 2 days |

A finding surfaces as a non-zero exit (red run), `::error::` annotations per finding, and a
markdown table in the run's step summary — no auto-issues, no external services.

**Limitations:**
- **Self-monitoring.** The detector runs inside the same system it monitors (GitHub Actions). Mitigated by: daily cadence (a missed scheduler tick self-heals the next day); the `push` trigger on `main`, so any human push re-arms the check even if every cron is dead (note: pushes made with `GITHUB_TOKEN`, like the capture workflows' own commits, do not trigger `push` workflows — this is documented GitHub behavior and desirable here, it avoids recursion); and check 2 catching the auto-disable state directly. A total, silent, multi-day Actions-scheduler outage with no human push in between is the residual, accepted risk.
- **Self-exemption from check 4.** The detector's own workflow (`cron-deadman.yml`) is excluded from the healthy/conclusion check only — checks 1–3 (registered, enabled, recent) still apply to it. This is deliberate: the detector exits non-zero by design whenever it surfaces a real finding, so its own latest-run `conclusion` is `failure` exactly when it is working correctly; without the exemption every genuine miss would also self-report as a redundant "detector failed" finding, and a by-design exit couldn't be told apart from a real detector breakage.
- **Out of scope.** Staleness of the manual projection-snapshot import (`snapshots/` — `bin/import-snapshot.mjs` is user-run, not a cron) is not covered; that is a separate concern from monitoring scheduled Actions.

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

## Cross-repo contract registry (with sleeper-dashboard)

This repo cannot edit the app. The registry below is the **complete enumerated list** of contracts the two repos share, and it is byte-identical to the copy in `sleeper-dashboard/docs/cross-repo-registry.md` — `sleeper-dashboard` owns the format definition; this repo mirrors it exactly. (The app keeps its copy under `docs/`; this repo has no `docs/` tree and keeps it here, per CLAUDE.md's push-detail-into-README rule. Only the host file differs — the format and every entry are identical.) It is the sole authority for what the app must mirror; the plan-reviewer subagent checks against this list and never reads the sibling tree. Its **data-side** trigger lists are a maintained cache this repo's reviewer re-verifies against live `lib/`/`scripts/`/`bin/` on every review; the **app-side** lists are frozen authority here, since `src/` is unreachable from this repo.

**Rule.** Any change touching a listed contract **must emit that entry's `Mirror` text as Session 1 output**, in a `## Cross-repo impact` section of the task file, quoting the `CR-NN` id.

**A coupling that is not listed here does not exist for review purposes.** Introducing a genuinely new cross-repo coupling is the one residual case that routes to the Claude.ai project — see CLAUDE.md → Workflow convention.

Everything between the two sentinel comments below is the **mirrored region**, byte-identical to `sleeper-dashboard/docs/cross-repo-registry.md`; the drift check diffs exactly that span. Repo-specific text — this framing, the non-entry notes that follow, the next heading — stays outside the sentinels.

<!-- CR-REGISTRY-BEGIN -->

## Entry format

Field order is fixed; no field is optional.

```
#### CR-NN · <short contract name>
- **App side:** <files / symbols / constants in sleeper-dashboard>
- **Data side:** <files / scripts / served paths in sleeper-dashboard-data>
- **Invariant:** <the single thing that must stay true across both repos>
- **Direction:** app→data | data→app | both
- **Triggers:** <app-side paths/symbols>  ‖  <data-side paths/symbols>
- **Mirror:** <instruction to emit for the other repo when this entry is touched>
```

- **Ids are permanent.** Never renumbered, never reused. A retired contract keeps its id and starts its `Invariant` with `**RETIRED (<date>):**`. An id present in one repo's registry and absent from the other *is* the drift signal.
- **`Direction`** — `app→data`: the app defines, the data repo mirrors. `data→app`: the data repo defines, the app follows. `both`: a shared constant or shape; neither leads, both change together.
- **`Triggers`** — app-side list, then `‖`, then data-side list. Each repo's reviewer evaluates **only its own side**; that is what makes the check possible without cross-repo reads. Triggers are always concrete paths, exported symbols, constant names or served JSON paths — never a category.
- **`Direction: app→data` entries are the silent ones** — nothing app-side fails when they drift. Their `Mirror` text says so.
- **`Triggers` must name definition sites, not just call sites.** A shared constant's *definition* (`lib/nflverse.mjs MIN_SCHEDULE_GAMES`) and a shape's *validator* (`lib/validate.mjs validateSchedule`, `src/api/dataStore.js isValidSchedule`) are triggers in their own right. Where a value flows through a generic path that never names it — season-totals aggregation is a sum-all-keys loop — the **loop** is the trigger, because the key name greps to nothing.
- **The two sides carry different completeness burdens.** Each repo's reviewer can read its own tree and cannot read the other one, so:
  - **The far side of `‖` is frozen authority.** A reviewer cannot fall back on live source for the repo it cannot read, so a trigger missing there is invisible. Far-side triggers must be correct in this registry and are kept correct by the both-repos-same-change rule — never by re-deriving them at review time.
  - **The near side of `‖` is a maintained cache.** The reviewer re-verifies it against live source on every review (see the plan-reviewer mandate) and flags consumers the entry does not list. So the near-side list should be accurate, but it is not required to be provably exhaustive at any one point in time — a gap in it is self-healing rather than silent, because the standing re-verification duty catches it at the next relevant review. That does not make the near side low-stakes: it is the *far*-side authority for the sibling repo's reviewer, which cannot read this side's live source at all.

  Read from `sleeper-dashboard`, "near" is the app side and "far" is the data side; read from `sleeper-dashboard-data`, it is the reverse. The wording is deliberately perspective-neutral so this bullet mirrors byte-for-byte like the rest of the registry.
- New coupling → new highest-numbered entry, added to **both** repos in the same change.

#### CR-01 · Projection snapshot envelope
- **App side:** `src/utils/projectionSnapshot.js` (writer, `schemaVersion: 2`), `src/utils/exportData.js` `classifyKey` (routes `projection-snapshots/<date>` → `snapshots/<date>.json`), `src/utils/seasonProjection.js` (the verbatim `projection` payload)
- **Data side:** `snapshots/<date>.json`, `bin/update.mjs snapshots`, `scripts/register-snapshots.mjs`, `scripts/grade-snapshot.mjs` (`deriveTargetSeason:34` is the v1-only fallback; envelope reads at `:168`/`:231`/`:316`), `lib/grade.mjs` (scores the snapshot payload), `scripts/panel-run.mjs` `resolveScoring` (`:70-77`, reads `snapshot.scoringSettings`), `bin/import-snapshot.mjs`, README snapshot section
- **Invariant:** the snapshot envelope the app writes is byte-compatible with what the importer and grader expect — at v2 that includes top-level `targetSeason`, `currentSeason` and verbatim `scoringSettings`, with `projection` as unmodified `computeNextSeasonProjection` output.
- **Direction:** app→data
- **Triggers:** `src/utils/projectionSnapshot.js`, `classifyKey` in `src/utils/exportData.js`, the `factors` object shape in `src/utils/seasonProjection.js`  ‖  `scripts/register-snapshots.mjs`, `scripts/grade-snapshot.mjs`, `lib/grade.mjs`, `resolveScoring` in `scripts/panel-run.mjs`, `bin/import-snapshot.mjs`
- **Mirror:** State the new envelope shape and whether the snapshot `schemaVersion` bumped. On a bump, `scripts/register-snapshots.mjs` expectations, `scripts/grade-snapshot.mjs` reads and the README snapshot section all need updating in the data repo. **`scoringSettings` has a second reader beyond grading** — `scripts/panel-run.mjs` `resolveScoring` pins the fit's basis from a committed snapshot, so dropping or renaming that envelope field breaks the R3-FIT path (CR-15) as well as in-basis grading. This snapshot `schemaVersion` is independent of `dataStore.js` `MAX_SUPPORTED_SCHEMA` (a ceiling on every family read through `tryDataStore`, not season-totals-scoped — snapshots have no `tryDataStore` reader in the first place). Additive `factors` keys (`isTeamChange`/`prevTeam`/`newTeam`/`depthStale`) do **not** bump the version.

#### CR-02 · season-totals schemaVersion & row composition
- **App side:** `src/api/dataStore.js` `MAX_SUPPORTED_SCHEMA = 4` and `isValidSeasonTotals:102` (the family's shape validator); `src/api/sleeperStats.js` — the season-totals loader itself, not previously named here (the `nfl/season-totals/<season>.json` path `:146`, the `tryDataStore` call `:147`, the `entry.schemaVersion` read `:152`, and the `weeklyStatus` staleness sniff `:112`); **`loadCurrentSeasonTotals` in the same file (in-season-app-read.md §2)** — a second season-totals reader, the live (in-progress) season's own `nfl/season-totals/<season>.json` path and `tryDataStore` call, `allowInProgress: true` scoped to this one call; `src/utils/teamContext.js` `isTeamAggregateId`, `src/utils/playerTeam.js` `resolvePlayerTeam` (season grain reads `careerStats[season][pid].team`)
- **Data side:** `nfl/season-totals/<year>.json` (written v4 — F-24, 2026-08-24: `idp_*`/`punt*` pruned from every non-`TEAM_*` row's `stats`, minified), `lib/sleeper.mjs` `aggregateWeeks:231` (dominant-team derivation) and `normalizeTeamForSchedule` at `:342` (writes the per-season `team`), `scripts/update-nfl.mjs` (the writer, `:93`; aggregate call `:54`, validate call `:58`), `lib/validate.mjs` `validateNflSeason:100`, `lib/backtest.mjs` `isTeamAggregateId` (the data-side `TEAM_` filter), `lib/panel.mjs` `buildTeamTotalsForSeason` (`:75`, applies that filter), `data-catalog.md` season-totals row
- **Invariant:** the app's supported-schema ceiling covers what the data repo writes, and the served row set is player rows **plus** `TEAM_<abbr>` whole-team aggregate pseudo-rows **plus** `<abbr>` DEF rows — consumers must exclude `TEAM_*` from any cross-player summation.
- **Direction:** both
- **Triggers:** `MAX_SUPPORTED_SCHEMA` in `src/api/dataStore.js`; `isValidSeasonTotals` in `src/api/dataStore.js`; the season-totals loader in `src/api/sleeperStats.js` (`dsPath:146`, the `tryDataStore` call `:147`, the `entry.schemaVersion` read `:152`, the `weeklyStatus` sniff `:112`); `loadCurrentSeasonTotals` in the same file (its own `dsPath`/`tryDataStore` call, `allowInProgress: true`); `isTeamAggregateId` in `src/utils/teamContext.js`; the per-season-`team` readers `resolvePlayerTeam` (`src/utils/playerTeam.js:53-63`) and `resolveAttributedTeam` (`src/utils/teamContext.js:18`, consumed at `:164`/`:195`/`:247`/`:281`, `src/utils/teamRzShare.js:85`, `src/utils/seasonProjection.js:488`); the cross-row summers `computeTeamContext` (`src/utils/teamContext.js:154`, loops `:161`/`:192` — a separate summer from `computeHistoricalShares` that does **not** apply `isTeamAggregateId`; see its own note `:148-152`), `computeHistoricalShares` (`:269`, row loop `:275`), `computeHistoricalTeamTotals` (`:240` — `[registry-stale]`, was `:242-246`, corrected here), `buildTeamShareTotals` (`src/utils/outlookPositionStats.js:36` — `[registry-stale]`, was `:38-40`, corrected here), `buildPerSeasonTeamShares` (`src/utils/outlookPositionStats.js:72`, row loop `:78` — `[registry-stale]`, a second cross-row reader of the served row set omitted here until fpa-defense-ranking.md, corrected here), `computeEmpiricalAgeCurves` (`src/utils/dynastyScore.js:63-64`) and `buildSeasonPositionRanks` (`src/utils/seasonRanks.js:20`); `src/utils/opponentStrength.js` (`collectSeasonFpaRates:69`, iterates the served row set — now takes a row map, either a `careerStats[season]` slice or a live season's `currentSeasonTotals.players`; `isDefenseRowId:32`, depends on bare-abbr DEF rows existing in it — `[registry-stale]`, omitted here until in-season-season-totals.md, corrected here); `src/utils/availabilityGrid.js:4` (the comment asserting served season-totals never emit `'B'`) and `src/utils/gameLog.js:130-160` (`buildGameLogRows`, the `kind: 'bye'` row it emits off served `weeklyStatus`); `src/utils/outlookConsistency.js:18` (`extractGamePoints`, the served `weeklyPoints` reader — `[registry-stale]`, this list named `weeklyStatus` readers but no `weeklyPoints` reader until in-season-season-totals.md, corrected here)  ‖  `aggregateWeeks` in `lib/sleeper.mjs`, `scripts/update-nfl.mjs`, `validateNflSeason` in `lib/validate.mjs`, `isTeamAggregateId` in `lib/backtest.mjs`, `buildTeamTotalsForSeason` in `lib/panel.mjs`
- **Mirror:** A version bump needs both repos. **Per-season `team` is scoring-load-bearing in the app since the R2 flip (2026-07-11)** — it feeds projection Steps 3/5h attribution via `resolveAttributedTeam`, so any edit to the `aggregateWeeks` dominant-team rule (most played weeks; ties → later stint; zero played → last seen; schedule-domain normalization) changes app projections **with no app-side diff**. Treat such edits as scoring changes and route them through a graded gate. Renaming the `TEAM_` pseudo-id scheme is breaking. **F-24 (2026-08-24), schemaVersion 3→4:** `idp_*`/`punt*` are dropped from every non-`TEAM_*` row's `stats` — a denylist, never an allowlist; CR-11/12/13/19's keys, kicking and `bonus_*` are unaffected, and no `schemaVersion` key is ever written into the season file itself (manifest-only). **D-1, same change, forward-only:** `aggregateWeeks` now also infers a single-team row's bye week(s) from the schedule and writes `'B'` into an `'X'` slot (history keeps `'X'`; a slot already `'D'` is left alone) — this **falsifies a written app-side assumption with no app-side diff**: `src/utils/availabilityGrid.js:4` states the served season-totals *"never emit `'B'`"*, and `src/utils/gameLog.js:130-160` already renders a `kind: 'bye'` row straight off served `weeklyStatus` — so forward seasons now produce real bye rows in `dp/GameLogSection.jsx` with no app-side code change at all. Correct the app comment in the same change.

#### CR-03 · Enrichment schemas
- **App side:** `src/api/enrichment.js` (`loadEnrichment:44`, called from `src/App.jsx:268`), `src/utils/enrichmentLookup.js` (`findInjuryForWeek`, `getCoaching`, `getScheme`, `getNotes`). **No UI consumer as of 1b Slice viii** — `src/components/AvailabilityHistory.jsx`, the injury-payload consumer, was deleted with the Explorer; the loader and lookups are untouched, but nothing currently calls the lookups or renders their output.
- **Data side:** `enrichment/*.json`, `bin/enrich.mjs`, `lib/enrichment.mjs` (`validateEntry:164`, `validateAll:259`), `lib/validate.mjs` `validateEnrichmentShape:747`, `npm run validate:enrichment`
- **Invariant:** every field the app's null-safe lookups read exists, with the same name and shape, in the enrichment files the data repo authors and validates.
- **Direction:** data→app
- **Triggers:** `src/api/enrichment.js`, `src/utils/enrichmentLookup.js`  ‖  `enrichment/*.json`, `bin/enrich.mjs`, `lib/enrichment.mjs`, `validateEnrichmentShape` in `lib/validate.mjs`
- **Mirror:** Any field add, rename or removal must be mirrored in the app's loader and lookups. `injuries.segmentStartWeek` must continue to match an absence segment in the matching season-totals file; orphaned entries are validator-flagged and silently ignored app-side.

#### CR-04 · Manifest contract
- **App side:** `src/api/dataStore.js` — `getManifestEntry:65` plus every validator gating on `schemaVersion` / `inProgress` / `lastModified` (nine `src/api/*` modules go through the accessor; the field names are the contract, so the definition site is the surface). **Plus one accessor bypass:** `src/utils/ktcHistory.js` `loadKtcHistory:92-126` reads the manifest **object** directly — `getCache('data-store/manifest')`, then `Object.keys(manifest.files)` and `manifest.files[path].lastModified` — so it depends on the top-level `files` map and the per-entry `lastModified` by name, not through `getManifestEntry`. The module's own header (`:4-6`) flags this as a deliberate "Coupling note".
- **Data side:** `manifest.json`, `lib/manifest.mjs` (`readManifest:19`, `updateManifestEntry:34`) — 12 of the 13 `scripts/update-*.mjs` writers register through `updateManifestEntry` (`update-enrichment.mjs` does **not**), plus three non-`update-*` registrars: `scripts/register-snapshots.mjs`, `scripts/grade-snapshot.mjs`, and `lib/enrichment.mjs`
- **Invariant:** manifest field names and shape are a public API; the app keys entries by served path and must ignore unknown families — and the `files` map plus per-entry `lastModified` are readable directly, not only through the app's accessor.
- **Direction:** data→app
- **Triggers:** `getManifestEntry` and the validator block in `src/api/dataStore.js`, the direct `manifest.files` / `lastModified` reads in `src/utils/ktcHistory.js` (`:92-126`)  ‖  `updateManifestEntry` / `readManifest` in `lib/manifest.mjs`, `manifest.json`
- **Mirror:** New families are additive and need no app change (the app already keys by path). Renaming or removing `recordCount` / `schemaVersion` / `lastModified` / `inProgress` is breaking and needs both repos. **Renaming the top-level `files` map, or the per-entry `lastModified`, breaks a second app-side reader that `getManifestEntry` does not shield** — `ktcHistory.js` enumerates `Object.keys(manifest.files)` to discover KTC snapshots and compares `lastModified` for cache invalidation (CR-17); it degrades to an empty history with no error. Note the `inProgress` convention split: nflverse families register `inProgress: false` even while the current season mutates; KTC's `inProgress: true` is a legacy current-value marker, not a pattern to propagate (CR-17). **A second `allowInProgress: true` opt-in exists since in-season-app-read.md — `loadCurrentSeasonTotals` (CR-02) — and it is NOT the same situation as KTC's.** KTC's `inProgress: true` is a mislabel: a KTC snapshot is a completed, immutable capture registered with a "current value" flag that is wrong about the file. An in-progress season-totals file genuinely *is* incomplete and genuinely *should* be read while incomplete — that is the entire point of reading it. The convention this Mirror warns against is using `inProgress` to mean "latest"; season-totals uses it to mean "not finished," which is its actual, documented meaning. Do not read this Mirror's "not a pattern to propagate" line as blocking a genuinely-incomplete family from opting in the same way — read it as blocking a *mislabeled* one.

#### CR-05 · CFBD statType keys
- **App side:** `src/api/cfbd.js` `pivotStatRows:85`, `src/api/dataStore.js` `isValidCFBDRows:107` (gates on `playerId` / `statType`), `src/utils/collegeMatch.js:125-127` (pivots all three categories), `src/utils/collegeMetrics.js:69-124` (reads the literals `YDS`, `TD`, `ATT` — dominator rating and the QB score). **`src/components/PlayersTab.jsx`'s `PCT`/`COMPLETIONS`/`YDS`/`TD`/`INT`/`CAR`/`REC` reads were removed in 1b Slice viii** — that file (the Player Profile college stat line's renderer) was deleted with the Explorer; `collegeMetrics.js`'s reads are now the *only* live consumer.
- **Data side:** `scripts/update-cfbd.mjs`, `lib/cfbd.mjs`, `lib/validate.mjs` `validateCfbdCategory:204`, `college/<category>/<year>.json`
- **Invariant:** the confirmed `statType` set stored per category is exactly the set the app's pivot expects.
- **Direction:** both
- **Triggers:** `pivotStatRows` in `src/api/cfbd.js`, `isValidCFBDRows` in `src/api/dataStore.js`, `src/utils/collegeMatch.js`, the `YDS`/`TD`/`ATT` reads in `src/utils/collegeMetrics.js`  ‖  `scripts/update-cfbd.mjs`, `lib/cfbd.mjs`, `validateCfbdCategory` in `lib/validate.mjs`
- **Mirror:** Adding or removing a `statType` must be coordinated — the pivot silently drops unknown types and yields empty columns for missing ones. Renaming one is worse than dropping it: `YDS`/`TD`/`ATT` are read by name in `src/utils/collegeMetrics.js:69-124`, so renaming those nulls the dominator rating and the QB college score, with no error and no test failure. (Note the name list in `collegeMetrics.js:57-59` is a *comment* recording the confirmed 2023 field names; it is documentation, not a read.)

#### CR-06 · nflverse roster & draft
- **App side:** `src/api/nflRoster.js` `loadCurrentRoster:55` (`MIN_ROSTER_IDS = 1500` at `:38`), `src/api/nflDraft.js` `loadNflDraftPicks:50`, `src/api/dataStore.js` `isValidRoster:113` / `isValidDraft:118`, `src/utils/nflDraftMatch.js`, `src/utils/relevance.js` (consumes the roster-id Set for the stale-team gate)
- **Data side:** `nflverse/roster/<year>.json`, `nflverse/draft/draft_picks.json`, `bin/update.mjs roster` / `draft`, `scripts/update-roster.mjs`, `scripts/update-draft.mjs`, `lib/nflverse.mjs` `MIN_ROSTER_IDS:18` (**the definition**), `lib/validate.mjs` `validateRoster:307` / `validateDraft:339`
- **Invariant:** the served shapes (`players` keyed by `sleeper_id`; `rowCount`; `picksByYear`) and the shared `MIN_ROSTER_IDS = 1500` sparsity gate match on both sides.
- **Direction:** both
- **Triggers:** `src/api/nflRoster.js`, `src/api/nflDraft.js`, `MIN_ROSTER_IDS` in `src/api/nflRoster.js`, `isValidRoster` / `isValidDraft` in `src/api/dataStore.js`, `src/utils/relevance.js`  ‖  `scripts/update-roster.mjs`, `scripts/update-draft.mjs`, `MIN_ROSTER_IDS` in `lib/nflverse.mjs`, `validateRoster` / `validateDraft` in `lib/validate.mjs`
- **Mirror:** Shape or sparsity-constant changes land in both repos together. **`MIN_ROSTER_IDS` is declared twice** — `lib/nflverse.mjs:18` (data) and `src/api/nflRoster.js:38` (app) — with no shared source; editing one and not the other is the whole failure mode this entry exists for. The app has no live fallback for either family — it must get them from the store.

#### CR-07 · nflverse advstats (view-only)
- **App side:** `src/api/advStats.js` `loadAdvStats:46` (`MIN_ADVSTATS_ROWS = 250` at `:35`), `src/api/dataStore.js` `isValidAdvStats:122`, `src/App.jsx:878` (the call site — `[registry-stale]`, was `:857`, corrected here), `src/hooks/usePlayerProfile.js:172-173` (reads `advStats?.byId?.[playerId]` / `advStats?.year`), guarded by `src/__tests__/advStatsViewOnly.test.js`. **Rendered since dp-v2 Slice 5b** — `market/Market.jsx`'s Efficiency column set (`RACR`, WR/TE only, `advStats?.byId?.[id]?.racr` gated on `advStats.complete`) is the family's first UI consumer; `AdvancedStatsPanel.jsx`, the Explorer's original renderer, was deleted in 1b Slice viii, and `usePlayerProfile.js`'s own read still reaches no component (`dp/PlayerDetailModal.jsx` doesn't reference it) — `targetShare`/`airYardsShare`/`wopr` remain unrendered.
- **Data side:** `nflverse/advstats/<year>.json`, `bin/update.mjs advstats`, `scripts/update-advstats.mjs`, `lib/nflverse.mjs` `MIN_ADVSTATS_ROWS:35` (**the definition**), `lib/validate.mjs` `validateAdvStats:407`
- **Invariant:** served shape (`players` keyed by `sleeper_id`; per-player `targetShare`/`airYardsShare`/`wopr`/`racr`/`components`; `rowCount`; `schemaVersion: 1`; `inProgress: false`) and the shared `MIN_ADVSTATS_ROWS = 250` gate match, and the family stays out of projection/scoring on both sides.
- **Direction:** both
- **Triggers:** `src/api/advStats.js`, `MIN_ADVSTATS_ROWS` in `src/api/advStats.js`, `isValidAdvStats` in `src/api/dataStore.js`, `src/hooks/usePlayerProfile.js`, and (dp-v2 Slice 5b) `market/Market.jsx`'s `advStats?.byId?.[id]?.racr` read  ‖  `scripts/update-advstats.mjs`, `MIN_ADVSTATS_ROWS` in `lib/nflverse.mjs`, `validateAdvStats` in `lib/validate.mjs`
- **Mirror:** Served-shape or sparsity-gate changes need the app loader updated in the same cycle. **Now breaks a visible surface, not just a silent loader** — Market's `RACR` column would go blank for every WR/TE with no error. Ratios are recomputed season-level and never aggregated weekly. Activation into projection is parked — see the advstats grading-findings doc.

#### CR-08 · nflverse schedule (read-only)
- **App side:** `src/api/nflSchedule.js` `loadNflSchedule:60`, `src/api/dataStore.js` `isValidSchedule:135` + `MIN_SCHEDULE_GAMES = 200` (`:130`), guarded by `src/__tests__/scheduleViewOnly.test.js`. **Loaded into `App.jsx` state as of dp-v2 Slice 2** (`loadNflSchedule` call site `App.jsx:930` — `[registry-stale]`, was `:915`, corrected here — `nflScheduleByYear`, dataSeason-keyed, exposed via `ProfileDataContext.jsx` / `App.jsx:584`). `NflStatsTab`'s game log, the loader's original call site, and `buildGameLog` in `src/utils/nflStats.js` (its only consumer) were both deleted with the Explorer in 1b Slice viii; **relit with a new consumer in dp-v2 Slice 4a** — `dp/GameLogSection.jsx`'s per-game context block (OPP/RESULT/SPREAD/TOTAL/ROOF/WEATHER), joined via `src/utils/playerTeam.js` `resolvePlayerTeam`.
- **Data side:** `nflverse/schedule/<year>.json`, `bin/update.mjs schedule`, `scripts/update-schedule.mjs` (← nflverse `nfldata` `games.csv`), `lib/nflverse.mjs` `MIN_SCHEDULE_GAMES:45` (**the definition**), `lib/validate.mjs` `validateSchedule:435`
- **Invariant:** served shape (`{ schemaVersion: 1, season, generatedAt, rowCount, games[] }`, each game carrying the 15 named fields; null `homeScore`/`awayScore`/`result`/`temp`/`wind` and `result === 0` are valid) and the shared `MIN_SCHEDULE_GAMES = 200` floor match on both sides.
- **Direction:** both
- **Triggers:** `src/api/nflSchedule.js`, `isValidSchedule` + `MIN_SCHEDULE_GAMES` in `src/api/dataStore.js`  ‖  `scripts/update-schedule.mjs`, `MIN_SCHEDULE_GAMES` in `lib/nflverse.mjs`, `validateSchedule` in `lib/validate.mjs`, and (D-1, F-24 batch, 2026-08-24) `aggregateWeeks` in `lib/sleeper.mjs` (`computeTeamByeWeeks`, threading the schedule's `games` into bye inference) and `scripts/update-nfl.mjs` (the `inProgress`-gated read of `nflverse/schedule/<year>.json`) — the first read-side consumer of this family from **inside** the data repo, not only the app
- **Mirror:** Shape or floor changes land in both repos together. Read-only on the app side — not wired into projection/scoring. Rendered since dp-v2 Slice 4a (`dp/GameLogSection.jsx`) — a shape or floor change now breaks a visible surface, not just a silent loader. **Since D-1 (2026-08-24), `gameType`/`homeTeam`/`awayTeam` are also load-bearing data-side** — `scripts/update-nfl.mjs` reads this family (while `inProgress`) to derive each team's bye week(s) for `nfl/season-totals`; a missing schedule file degrades silently (no byes, no throw), but a `gameType`/`homeTeam`/`awayTeam` rename or reshape would silently stop byes from ever being written, with no validator to catch it (this family stays read-only/view-only on the app side regardless).

#### CR-09 · nflverse gamelogs (view-only)
- **App side:** `src/api/nflGameLogs.js`, `src/api/dataStore.js` `isValidGameLogs` + `MIN_PLAYERGAME_ROWS = 3000`, `src/utils/playerTeam.js` `resolvePlayerTeam` (week grain reads `games[].week` and `games[].team`), guarded by `src/__tests__/gameLogsViewOnly.test.js`. **Loaded into `App.jsx` state as of dp-v2 Slice 2** (`loadNflGameLogs` call site `App.jsx:915` — `[registry-stale]`, was `:900`, corrected here — `gameLogsByYear`, dataSeason-keyed, exposed via `ProfileDataContext.jsx` / `App.jsx:583`, also corrected from `:579`). **Rendered since dp-v2 Slice 4a** — `dp/GameLogSection.jsx`'s per-position production columns (`src/utils/gameLog.js`). **Second consumer since dp-v2 Slice 5b** — `market/Market.jsx`'s Efficiency set via the new `src/utils/seasonEfficiency.js` (first app-side reader of `passingEpa`/`passingCpoe`/`rushingEpa`/`receivingEpa`/`attempts`/`carries`/`targets`); also the first non-`dp/GameLogSection.jsx` consumer of `resolvePlayerTeam`'s week grain, and the first to pre-filter its input to REG games (that helper's `games.find(g => g.week === week)` is seasonType-blind). `[registry-stale]`, pre-existing: this entry's app-side list has never named `dp/GameLogSection.jsx` or `src/utils/gameLog.js` despite both being live since 4a — reported, not fixed here (§8.2 of the 5b task file).
- **Data side:** `nflverse/gamelogs/<year>.json`, `bin/update.mjs gamelogs`, `scripts/update-gamelogs.mjs`, `lib/nflverse.mjs` `MIN_PLAYERGAME_ROWS:48` (**the definition**) + `parsePlayerGameLogs` / `rekeyGameLogsBySleeper`, `lib/validate.mjs` `validateGameLogs:467`
- **Invariant:** served shape (`{ schemaVersion: 1, season, generatedAt, rowCount, playerCount, unmapped, players }`; `players` keyed by `sleeper_id` → `{ gsisId, name, position, games[] }`; each game carrying `week`, `seasonType`, `team`, `opponent` plus sparse per-game stats where an absent key is null and a present `0` is a real zero) and the shared `MIN_PLAYERGAME_ROWS = 3000` floor match on both sides.
- **Direction:** both
- **Triggers:** `src/api/nflGameLogs.js`, `isValidGameLogs` + `MIN_PLAYERGAME_ROWS` in `src/api/dataStore.js`, `resolvePlayerTeam` in `src/utils/playerTeam.js`, and (dp-v2 Slice 5b) `src/utils/seasonEfficiency.js`  ‖  `scripts/update-gamelogs.mjs`, `MIN_PLAYERGAME_ROWS` / `parsePlayerGameLogs` / `rekeyGameLogsBySleeper` in `lib/nflverse.mjs`, `validateGameLogs` in `lib/validate.mjs`
- **Mirror:** Shape or floor changes land in both repos together. The per-game `week` and `team` keys are load-bearing beyond display: `resolvePlayerTeam`'s week-grain path matches on `g.week === week` and reads `g.team`, and returns `null` rather than throwing — renaming either key empties every week-grain team join **silently**. Per-game `team` is the **current-franchise** domain in all seasons and is era-remapped app-side (CR-16); do not "fix" it to era-accurate upstream without changing both repos. Per-game rate fields (`racr`/`targetShare`/`airYardsShare`/`wopr`/`pacr`/`passingCpoe`) are single-game values and must never be summed — `passingCpoe` specifically is now also attempt-weighted by a second consumer (`seasonEfficiency.js`'s `CPOE` column), not merely "never summed". `fantasyPoints`/`fantasyPointsPpr` are nflverse default scoring and are never reconciled with `src/utils/fantasyPoints.js` (see CR-14). View-only on both sides — must never feed projection/scoring/grading. 2019 is absent upstream (known gap; degrades to the empty shape).

#### CR-10 · nflverse teamcontext (view-only)
- **App side:** `src/api/teamContext.js` (loader — distinct from `src/utils/teamContext.js`) incl. the shape-reading lookups `getTeamSeasonRows:121` / `getTeamWeekRow:131`, `src/api/dataStore.js` `isValidTeamContext:171` + `MIN_TEAMCONTEXT_ROWS = 60` (`:164`), `src/utils/playerTeam.js` (join), guarded by `src/__tests__/teamContextViewOnly.test.js`. **Loaded into `App.jsx` state across a five-season window as of dp-v2 Slice 4c** (widened from dataSeason-only in Slice 2 — `loadTeamContext` call site `App.jsx:902` — `[registry-stale]`, was `:899`, corrected here (dp-v2 Slice 6b re-verified against live `src/`) — `Promise.allSettled`-batched, `teamContextByYear`, exposed via `ProfileDataContext.jsx` / `App.jsx:585` — `[registry-stale]`, was `:582`, corrected here). **Rendered since dp-v2 Slice 4c** — `dp/EnvironmentSection.jsx` + `src/utils/environment.js` (`computeTeamSeasonMetrics`, `computeLeagueStanding`), the family's first reader anywhere in `src/` of the served `off.*`/`def.*` game-row shape; `src/components/dp/PlayerDetailModal.jsx:72,512` is a live pass-through consumer in between — it reads `teamContextByYear` off `ProfileDataContext` (`:72`) and threads it into `EnvironmentSection` (`:512`) — `[registry-stale]`, pre-existing: omitted from this list since 4c, corrected here. **Second consumer since dp-v2 Slice 5b** — `market/Market.jsx`'s Efficiency set (`CARRY SH`, via `src/utils/seasonEfficiency.js`) is the **first app-side reader anywhere of `off.rushPlays` specifically** — it is not even in `environment.js`'s `OFF_SUM_FIELDS`. **Third use since dp-v2 Slice 5c** — `market/Market.jsx`'s four environment filters (Team PROE/pace/off. EPA-play/RZ TD rate) are a **league-rank derivation** over the family, via a new additive `environment.js` export (`buildLeagueRankTable`, over `FILTER_METRICS` — `epaPerPlay` among them), memoised once per `dataSeason` and passed into `applyMarketFilters`; `computeLeagueStanding` (the pop-up's single-team-per-render helper) is unchanged. **Fourth consumer since dp-v2 Slice 6a** — `teams/Teams.jsx` (`buildTeamMetricsTable(teamContextForSeason)`, `environment.js:172`) — `[registry-stale]`, pre-existing: this list omitted 6a's own consumer entirely (`docs/signal-registry.md:58` already recorded it; this list did not), corrected here (dp-v2 Slice 6b). **Fifth use since dp-v2 Slice 6b** — `teams/TeamDetail.jsx` reads the family across its own full **14-season** window, loaded **on demand** (not eagerly) via the new `src/hooks/useTeamHistoryLoader.js`; this is also the first app-side call site to resolve the per-season key through `eraTeam(abbr, season)` in a loop over the whole window, since a route param is one fixed current code across seasons where the underlying franchise key changes.
- **Data side:** `nflverse/teamcontext/<year>.json`, `bin/update.mjs teamcontext`, `scripts/update-teamcontext.mjs` (← nflverse pbp), `lib/nflverse.mjs` `MIN_TEAMCONTEXT_ROWS:53` (**the definition**) + `aggregateTeamContext`, `lib/validate.mjs` `validateTeamContext:504` (incl. the era-domain guard at `:515`)
- **Invariant:** served shape (`{ schemaVersion: 1, season, generatedAt, rowCount, teamCount, teams }`; `teams` keyed by **era-accurate** team abbr → `{ games[] }`; each game `{ week, seasonType, gameId, opponent, off:{…}, def:{…} }`; weeks continuous REG→POST) and the shared `MIN_TEAMCONTEXT_ROWS = 60` floor match on both sides.
- **Direction:** both
- **Triggers:** `src/api/teamContext.js` (incl. `getTeamSeasonRows` / `getTeamWeekRow`), `isValidTeamContext` + `MIN_TEAMCONTEXT_ROWS` in `src/api/dataStore.js`, `src/utils/playerTeam.js`, the `loadTeamContext` call site `App.jsx:902` and the `ProfileDataContext` provider key `App.jsx:585`, `dp/PlayerDetailModal.jsx:72,512` (`[registry-stale]` — omitted since 4c, corrected here), `dp/EnvironmentSection.jsx` + `src/utils/environment.js` (dp-v2 Slice 4c's `off.*`/`def.*` field readers, plus 5c's `buildLeagueRankTable`/`FILTER_METRICS`), `src/utils/seasonEfficiency.js`'s `off.rushPlays` read (dp-v2 Slice 5b), (dp-v2 Slice 5c) `market/Market.jsx`'s `rankTable` memo + `src/utils/marketFilters.js`'s environment-filter predicate, `teams/Teams.jsx`'s `buildTeamMetricsTable` call (dp-v2 Slice 6a — `[registry-stale]`, previously omitted, corrected here), and (dp-v2 Slice 6b) `teams/TeamDetail.jsx`'s per-season `eraTeam` loop + `src/hooks/useTeamHistoryLoader.js`'s on-demand load  ‖  `scripts/update-teamcontext.mjs`, `MIN_TEAMCONTEXT_ROWS` / `aggregateTeamContext` in `lib/nflverse.mjs`, `validateTeamContext` in `lib/validate.mjs`
- **Mirror:** Shape or floor changes land in both repos together. **First TEAM-keyed family** — row identity is `(team, week)`, not `sleeper_id`; do not force it through player-keyed loader helpers. Per-week rates are single-game values: aggregate the `*Sum`/`*Plays` components, never sum or average stored rates. **`rushPlays` is a counting component, not a rate — safe to sum directly across weeks**, unlike its rate siblings. View-only on both sides. Team-key domain is CR-16.

#### CR-11 · Snap & red-zone usage stat keys *(reconciliation — new to this repo's list, already tracked by the sibling)*
- **App side:** `src/utils/usageMetrics.js` `computeUsageFactors` (`RZ_CONFIG:59-61`, snap share `:87-88`/`:141-142` — reads `off_snp`, `tm_off_snp`, `rec_rz_tgt`, `rush_rz_att`, `pass_rz_att`), `src/utils/teamRzShare.js` (`RZ_SHARE_CONFIG:45-46`), `src/utils/durabilitySignals.js:34-35` (`off_snp`/`tm_off_snp` → contributor-season classification; imported by `seasonProjection.js`, `dynastyScore.js`, `projectionSignals.js`), `src/utils/teamContext.js:254-255` (accumulates `rush_rz_att`/`rec_rz_tgt` into the `rushRz`/`recRz` denominators `teamRzShare.js` divides by), `src/utils/outlookUsage.js:62-63` (view-only per-season snap%)
- **Data side:** the generic sum-all-keys loop in `lib/sleeper.mjs` `aggregateWeeks` (`Object.entries(stats)` at `:297`) writing `nfl/season-totals/<year>.json` — these keys are preserved as-is and never stripped or filtered by any schema operation, including F-24's `idp_*`/`punt*` denylist (`prunePlayerStats`, applied after this loop — none of these five keys are `idp_`/`punt`-prefixed). Data-side **consumers** of the same keys: `lib/panel.mjs` (`:87-88`, `:179`, `:191`/`:206`, `RZ_CONFIG`-equivalents `:874-886`, `:911-912`, `:1131-1132`), `lib/backtest.mjs` (`:225-226`, `:274-275`, `:284-297`), `lib/projectionFactors.mjs`
- **Invariant:** the five usage stat keys survive season-totals aggregation unmodified, and both repos read them under the same names.
- **Direction:** data→app
- **Triggers:** `src/utils/usageMetrics.js`, `src/utils/teamRzShare.js`, `src/utils/durabilitySignals.js`, the RZ denominator block in `src/utils/teamContext.js`, `src/utils/outlookUsage.js`, and (`[registry-stale]` — added a slice behind; dp-v2 Slice 4b's readers were never recorded here) `src/hooks/usePlayerProfile.js:179` (`snapShare` from `projection.factors.snapShare`), `src/utils/usageEfficiency.js:81` (the `off_snp ÷ tm_off_snp` field-expression string) plus `:87,93,148,157` (dp-v2 Slice 4c — `buildRzShareSeries` reads `rush_rz_att`/`rec_rz_tgt` directly off `careerStats[season][pid].stats`), `dp/UsageEfficiencySection.jsx:38,44` (the `buildUsageHistory`/`buildRzShareSeries` call sites), and (dp-v2 Slice 5b) `market/Market.jsx`'s new Efficiency-set call sites for the same two functions (`SNAP%`/`RZ SH` columns) — `[registry-stale]`, pre-existing: this list has never named Market's own OLDER `buildUsageHistory`/`buildPositionStatSeries` calls for the Outlook set either (reported, not fixed here, §8.2 of the 5b task file)  ‖  the `Object.entries(stats)` sum loop in `lib/sleeper.mjs` `aggregateWeeks:297`, the writer `scripts/update-nfl.mjs:93`, `validateNflSeason` / `findNonFinite:69` in `lib/validate.mjs`, `RATE_KEYS` in `lib/fantasyPoints.mjs:21` (the sole *read-side* key filter — as of F-24, 2026-08-24, `prunePlayerStats` in `lib/sleeper.mjs` is a second, write-side filter dropping `idp_*`/`punt*`; neither filter touches these five keys), `lib/panel.mjs`, `lib/backtest.mjs`, `lib/projectionFactors.mjs`
- **Mirror:** Do not remove, rename or filter these keys. **The projection degrades silently to neutral when they are absent** — no error, no test failure, no visible symptom. The blast radius is wider than the projection: `durabilitySignals` mis-classifies contributor seasons, `teamContext`'s RZ denominators go to zero (so `teamRzShare` sentinels out), the Outlook snap% column empties, and — since dp-v2 Slice 5b — Market's Efficiency `SNAP%`/`RZ SH` columns go blank the same way, and the data repo's own panel/backtest reconstructions drift the same way. The dependency is invisible at runtime; this registry entry is the only thing recording it.

#### CR-12 · `pass_cmp` stat key (QB passer rating) *(reconciliation — new to this repo's list, already tracked by the sibling)*
- **App side:** `src/utils/efficiencyMetrics.js` `passerRating` (`:37`, `:178` — `pass_cmp`, `pass_att`, `pass_yd`, `pass_td`, `pass_int`), reused view-only by `src/utils/outlookPositionStats.js`, and `src/utils/nflStats.js:28` (`compPct` recomputed as `pass_cmp/pass_att`, never the stored `cmp_pct`)
- **Data side:** the generic sum-all-keys loop in `lib/sleeper.mjs` `aggregateWeeks` (`:297`) into `nfl/season-totals/<year>.json`. **`pass_cmp` appears nowhere in `lib/`, `scripts/` or `bin/`** — the key is carried by a loop that never names it, which is exactly why the loop, not the key, is the data-side trigger. F-24's `idp_*`/`punt*` denylist (`prunePlayerStats`, applied after this loop) does not touch `pass_cmp`.
- **Invariant:** `pass_cmp` is preserved through season-totals aggregation.
- **Direction:** data→app
- **Triggers:** `passerRating` in `src/utils/efficiencyMetrics.js`, the `compPct` line in `src/utils/nflStats.js`  ‖  the `Object.entries(stats)` sum loop in `lib/sleeper.mjs` `aggregateWeeks:297`, the writer `scripts/update-nfl.mjs:93`, `validateNflSeason` in `lib/validate.mjs`, `RATE_KEYS` in `lib/fantasyPoints.mjs:21` (read-side; unrelated to F-24's write-side `idp_*`/`punt*` denylist)
- **Mirror:** Preserve `pass_cmp`. Missing `pass_cmp` yields a neutral `efficiencyFactor` (1.0) **and** a null `Cmp%` cell in the NFL-stats table — silent in both, no errors, no schema bump. Stored `pass_rtg` and `cmp_pct` are weekly sums, are **not** consumed by the app (both surfaces recompute from counting stats), and must be preserved as-is rather than "fixed".

#### CR-13 · `rec_air_yd` stat key (aDOT diagnostic) *(reconciliation — new to this repo's list, already tracked by the sibling)*
- **App side:** `src/utils/seasonProjection.js:445`/`:453` — reads `rec_air_yd` and `rec_tgt` to compute the capture-only `factors.adot` (WR/TE); `src/utils/outlookPositionStats.js:51` (per-season-team air-yards denominator), `:153` (AY share), `:141` (the aDOT cell)
- **Data side:** the generic sum-all-keys loop in `lib/sleeper.mjs` `aggregateWeeks` (`:297`) into `nfl/season-totals/<year>.json`; confirmed present 2012–present. **`rec_air_yd` appears nowhere in `lib/`, `scripts/` or `bin/`** — same generic-path situation as CR-12. F-24's `idp_*`/`punt*` denylist (`prunePlayerStats`, applied after this loop) does not touch `rec_air_yd`.
- **Invariant:** `rec_air_yd` is preserved through season-totals aggregation.
- **Direction:** data→app
- **Triggers:** the aDOT block in `src/utils/seasonProjection.js`, the air-yards denominator / AY-share / aDOT builders in `src/utils/outlookPositionStats.js`  ‖  the `Object.entries(stats)` sum loop in `lib/sleeper.mjs` `aggregateWeeks:297`, the writer `scripts/update-nfl.mjs:93`, `validateNflSeason` in `lib/validate.mjs`, `RATE_KEYS` in `lib/fantasyPoints.mjs:21` (read-side; unrelated to F-24's write-side `idp_*`/`punt*` denylist)
- **Mirror:** Preserve `rec_air_yd`. Missing → `factors.adot: null` **and** empty AY-share / aDOT cells on the Outlook tab; no errors, no schema bump. Values run ~½ industry aDOT magnitude (likely air yards on completed receptions only) — ranking is preserved, absolute magnitude is not industry-standard; that calibration is the app's concern, not the data repo's. `factors.adot` is capture-only and must not move `projectedPPG`.

#### CR-14 · `calculateFantasyPoints` port *(reconciliation — new to this repo's list, already tracked by the sibling)*
- **App side:** `src/utils/fantasyPoints.js` `calculateFantasyPoints(stats, scoringSettings):12` — the source of truth. (`src/App.jsx:788`/`:790`/`:795` and `src/api/sleeperStats.js:199` call it but do not define the math, so they are not triggers.)
- **Data side:** `lib/fantasyPoints.mjs` — a hand-maintained mirror (`calculateFantasyPoints:9`, plus `RATE_KEYS:21`); imported by `scripts/grade-snapshot.mjs:20`, which defines `buildInBasisOutcomes:87` (applying the port at `:90`/`:109`); that builder is consumed by in-basis grading (`scripts/grade-snapshot.mjs:131`/`:431`) **and** by `scripts/panel-run.mjs:92` on the R3-FIT path
- **Invariant:** the data repo's port reproduces the app's scoring formula exactly — loop `scoringSettings` keys, skip null multiplier or stat, round to 2 dp.
- **Direction:** app→data
- **Triggers:** `src/utils/fantasyPoints.js`  ‖  `lib/fantasyPoints.mjs`, `buildInBasisOutcomes` in `scripts/grade-snapshot.mjs`, its call site in `scripts/panel-run.mjs`
- **Mirror:** Any change to the scoring math must be ported to `lib/fantasyPoints.mjs` in the same cycle, or in-basis grades silently diverge from how the app actually scored — **and so does the R3-FIT panel** (CR-15), which builds its outcome column from the same port. **Nothing app-side fails when this drifts** — the divergence appears only as wrong grades and a wrong fit. Low churn (the dot-product is stable), which is exactly why the drift would go unnoticed. Note one deliberate asymmetry: `RATE_KEYS` (`lib/fantasyPoints.mjs:21`) is a data-side-only defensive guard excluding non-additive keys from the dot-product; it has **no app counterpart** and must not be "mirrored back" into the app.

#### CR-15 · R3-FIT factor-multiplier mirror *(reconciliation — new to this repo's list, already tracked by the sibling)*
- **App side:** `src/utils/momentum.js`, `src/utils/regressionSignals.js`, `src/utils/teamContext.js` (`computeShareTrend`, `computeHistoricalShares`, `computeHistoricalTeamTotals`, `resolveAttributedTeam`), `src/utils/usageMetrics.js`, `src/utils/teamRzShare.js`, `src/utils/seasonProjection.js` (qualifying-season builder, rookie-vs-veteran routing, basePPG per-length weight table, label→factor maps, forward-mover neutralization, `combinedNewFactorRaw` membership and its `[0.67, 1.50]` clamp)
- **Data side:** `lib/projectionFactors.mjs`, `lib/panel.mjs` (`predictWithExponents:962`, `attachFactorMultipliers:998`, `buildCohortPools:895`, `selectFitFactors:1206`), `scripts/panel-run.mjs` (`runFit:878`, the `attachFactorMultipliers` call at `:166`), `bin/panel.mjs --fit`, parity-guarded by `test/panel-fit.test.mjs`
- **Invariant:** every mirrored constant, gate, shrinkage K, qualifying threshold, routing condition, sentinel branch, series-construction branch, denominator accumulator, cohort reference season, position gating, and the `combinedNewFactorRaw` membership/clamp range reproduce the app's behaviour exactly.
- **Direction:** app→data
- **Triggers:** any of the six listed `src/utils/` modules  ‖  `lib/projectionFactors.mjs`, `lib/panel.mjs`, `scripts/panel-run.mjs`, `test/panel-fit.test.mjs`
- **Mirror:** Re-mirror the changed constant/gate/branch and **re-fit before any further exponent activation** — otherwise the fit reconstructs a factor the app no longer produces and the committed verdict in `.claude/tasks/r3fit-exponent-harness.md` stops transporting. Which positions a factor is gated to is itself part of the mirror. Note the known parity gap: `shareTrend` and `teamRzShare` have no end-to-end app-ground-truth check until a post-2026-07-18 snapshot is imported. **Nothing app-side fails when this drifts.** Scope note, verified by grep so it need not be re-derived: `dynastyScore.js` is named in `lib/projectionFactors.mjs:110` only as a *contrast* (its `weightedLinearRegression` copy is unfloored where the mirrored one floors the denominator at 4) — it is **not** mirrored and is deliberately not a trigger.

#### CR-16 · Era-accurate team-code remap *(reconciliation — was buried in the teamcontext prose)*
- **App side:** `src/utils/playerTeam.js` `eraTeam(abbr, season):32` — LA→STL ≤2015, SD/LAC ≤2016, OAK/LV ≤2019 — **and** `src/utils/nflStats.js` `SCHEDULE_TEAM_ALIAS:2` (`{ LAR: 'LA' }`) + `normalizeTeamForSchedule:4`, which `playerTeam.js:63` composes with `eraTeam`
- **Data side:** `lib/nflverse.mjs` `eraTeam:958` (**the definition**), applied to pbp at `:1084-1087`; `lib/sleeper.mjs` `SCHEDULE_TEAM_ALIAS:22` + `normalizeTeamForSchedule:25` (the data-side mirror of the app's alias, applied at `:342` to produce the season-totals `team`, whose already-normalized value D-1 (2026-08-24, `:346`) then joins against the schedule's bye-week map); `lib/validate.mjs:537` era-domain guard
- **Invariant:** both repos map franchise abbreviations to the same era-accurate code for the same season **through the same two-stage composition** (schedule-domain alias, then era remap), so team keys join across teamcontext, schedule and season-totals.
- **Direction:** both
- **Triggers:** `eraTeam` in `src/utils/playerTeam.js`, `SCHEDULE_TEAM_ALIAS` / `normalizeTeamForSchedule` in `src/utils/nflStats.js`  ‖  `eraTeam` in `lib/nflverse.mjs`, `SCHEDULE_TEAM_ALIAS` / `normalizeTeamForSchedule` in `lib/sleeper.mjs`, the era-domain guard in `lib/validate.mjs`
- **Mirror:** A future franchise move (or any change to an existing mapping) updates **both repos in the same change** — and there are **two** mirrored constants here, not one: the era remap *and* the schedule-domain alias (`lib/sleeper.mjs:21` says so in a comment: *"Mirrors the app's `src/utils/nflStats.js` `SCHEDULE_TEAM_ALIAS` exactly"*). A one-sided edit to either produces silently empty joins rather than an error — the team key simply never matches. Note `scripts/update-teamcontext.mjs` is **not** a trigger despite owning the teamcontext ingest: it names `eraTeam` only in a header comment (`:13`) and calls it via `aggregateTeamContext`, so grepping it for the remap finds nothing. **D-1 (2026-08-24) is a new consumer of this composition, not a new mapping** — `aggregateWeeks` joins a single-team row's already-normalized `team` against the nflverse schedule's bye weeks, so a future franchise move that isn't mirrored here silently loses that team's bye inference (degrades to `'X'`, no throw) in addition to the pre-existing teamcontext/schedule join failures this entry already covers.

#### CR-17 · KTC value snapshots *(new — found by the completeness sweep, absent from both repos)*
- **App side:** `src/utils/ktcHistory.js` — `isValidKtcSnapshot:27`, the `SNAPSHOT_RE` manifest enumeration `/^ktc\/snapshot-(\d{4}-\d{2}-\d{2})\.json$/` (`:19`), the `tryDataStore(s.path, { validate: isValidKtcSnapshot, allowInProgress: true })` fetch (`:147`), and the downstream extractor `computeKtcSignals` (consumed by `src/utils/seasonProjection.js:11`/`:307` for the `ktcHist*` capture factors, and — **since dp-v2 Slice 5a** — by `src/components/market/Market.jsx`'s `trendByPlayer` memo, which reads the already-computed `factors.ktcHistDelta`/`ktcHistWindowSpanDays`/`ktcHistConfidence` for its TREND gutter's delta/window/band, plus `ktcHistory.series[id]` directly, threaded to Market as an explicit `ktcHistory` prop, for the gutter's sparkline); `src/api/dataStore.js` `tryDataStore:72` `allowInProgress` opt-in (`:80`); `src/utils/ktcMatch.js` `matchKTCToSleeper:64` (consumes `name`/`team`/`position`), called on the store path at `ktcHistory.js:176` and on the live path at `src/App.jsx:249`; `src/api/ktc.js:51` — the app's own DOM scraper, which emits the **identical** `{ name, team, value, position }` record. **`computeKtcRecentDelta` was deleted in 1b Slice viii** — its only consumer, the Explorer's ~30-day KTC Δ cell, was deleted with that surface. **Extended in dp-v2 Slice 7** — `src/utils/ktcPicks.js` (`parseKtcPickRows`/`pickPrice`) is the **first consumer of the 36 pick rows** the live KTC record shape has always carried alongside player rows (`position: null`, `team: "FA"`, distinguished only by `name`) — `matchKTCToSleeper` silently drops them at Strategy 2 (name+team) as unmatched, and this is a deliberate second, parallel parse path, not a widening of that function. Its `App.jsx` call site (`getKTCValues().then()`, the same callback `ktcMap` is built in) is the second app-side reader of the live scrape's raw rows, alongside `matchKTCToSleeper` itself. `src/utils/coverageBand.js` mirrors `computeKtcSignals`' confidence-band thresholds (`n>=7 'high'`/`n>=4 'medium'`/else `'low'` vs. its own `coverageBand(n)`, diverging deliberately at `n=1`, per that file's own header comment) — a live coupling to this entry's trigger that was not previously named on the app side; **staleness fix, corrected here**.
- **Data side:** `ktc/snapshot-<YYYY-MM-DD>.json`, `scripts/update-ktc.mjs` (`updateKtc:131`, `ktcOrderingGuard:114`, `KTC_ORDERING_THRESHOLD`, `snapshotHash:39` for content-hash dedup, the `updateManifestEntry({ inProgress: true })` call at `:208-213`), `lib/ktc.mjs` `fetchKtcSnapshot:76`, `lib/validate.mjs` `validateKtc:237` + `KTC_TOP_QB_SENTINELS`, `bin/update.mjs ktc`, `.github/workflows/weekly-ktc.yml`, `ktc/quarantine/` (script-produced, unregistered, app-ignored)
- **Invariant:** a served KTC snapshot is a **bare top-level JSON array** of `{ name, team, value, position }` objects satisfying `isValidKtcSnapshot` (non-empty array whose first element has a string `name` and a numeric `value`), published at exactly `ktc/snapshot-<YYYY-MM-DD>.json` and registered with `schemaVersion: 1` and `inProgress: true` — the one family the app's read path opts into via `allowInProgress: true`. **Added, dp-v2 Slice 7:** the snapshot's 36 pick rows (3 years × 3 tiers × 4 rounds) are distinguished **only** by `name` — `position` is `null` and `team` is `"FA"` on every one — and the app parses that name against `^(20\d\d) (Early|Mid|Late) (1st|2nd|3rd|4th)$`. **That format originates upstream at keeptradecut.com — neither repo produces it.** A change to the scrape's name derivation, its dedup key, or any filtering that drops rows silently unprices every pick while every existing validator still passes (`validateKtc` asserts total count and per-position floors, nothing about pick rows specifically — see D-4 below). The app must fail **visibly** (render the pick unpriced) rather than substitute a number: an unparsed row's price is `null`, never `0`.
- **Direction:** both
- **Triggers:** `isValidKtcSnapshot`, `SNAPSHOT_RE`, the `allowInProgress: true` call site, `computeKtcSignals` in `src/utils/ktcHistory.js`, `matchKTCToSleeper` in `src/utils/ktcMatch.js`, the record shape emitted by `src/api/ktc.js`, the `allowInProgress` branch of `tryDataStore` in `src/api/dataStore.js`, (since dp-v2 Slice 5a) `src/components/market/Market.jsx`'s `trendByPlayer` memo, and (dp-v2 Slice 7) `src/utils/ktcPicks.js` (`parseKtcPickRows`/`pickPrice`), its `App.jsx` call site, `src/components/portfolio/Portfolio.jsx`'s pick-pricing reads, and `src/utils/coverageBand.js` (staleness fix — always coupled to `computeKtcSignals`' thresholds, not previously named here)  ‖  `scripts/update-ktc.mjs` (incl. `ktcOrderingGuard`, `snapshotHash` and the `updateManifestEntry({ inProgress: true })` call), `fetchKtcSnapshot` in `lib/ktc.mjs`, `validateKtc` in `lib/validate.mjs`, `.github/workflows/weekly-ktc.yml`
- **Mirror:** Keep the snapshot a **bare array** — wrapping it in the `{ schemaVersion, generatedAt, … }` envelope every other family uses fails `isValidKtcSnapshot`, and the whole `ktcHist*` capture family degrades to empty with **no error and no test failure**. **Updated, dp-v2 Slice 5a:** the earlier note here said the Explorer's ~30-day KTC Δ cell was the only other thing that degraded and that it was gone, making `ktcHist*` "the only thing that degrades" — that is now stale twice over. First, `ktcHist*` was never only a diagnostic: `market/Market.jsx`'s TREND gutter is a second, real rendering consumer of both `computeKtcSignals`'s output and the raw `series`. Second, and more than bookkeeping, **the failure mode itself changed**: before this slice a bad/empty snapshot produced a silent gap in `factors` with no visible symptom anywhere; now it also produces a **visibly blank TREND column on Market, the app's primary surface** (every row's gutter renders `—`, the `band: 'none'` state) — something a user watching the app would actually notice, not just something a diagnostic dump would show. Keep the `ktc/snapshot-YYYY-MM-DD.json` path exactly: the app enumerates candidates by regex over manifest keys, so a path change makes every snapshot invisible rather than broken. Renaming `name`/`team`/`value`/`position` breaks `matchKTCToSleeper` the same silent way — and note the record shape is constrained **twice** on the app side, since `src/api/ktc.js` scrapes the same KTC DOM into the same four fields for the live path; the two scrapers are independent implementations of one shape, so a KTC markup change can break them separately. Flipping the manifest entry to `inProgress: false` is breaking in the unusual direction — the app deliberately opts this path in, so the change must be paired with revisiting `allowInProgress: true` app-side. Quarantined scrapes must stay in `ktc/quarantine/` and **must never be manifest-registered**: a registered quarantine file enters the app's 8-snapshot window as if it were good data.

#### CR-18 · Signal registry rows (`docs/signal-registry.md`) *(new — found by the completeness sweep, absent from both repos)*
- **App side:** `docs/signal-registry.md` (the canonical rows), the signal-registry sentence in `CLAUDE.md` → *Self-maintenance*
- **Data side:** the signal-registry sentence in `CLAUDE.md` → *Self-maintenance*, the Sibling-repo pointer in `CLAUDE.md` → *Sibling repo*, `data-catalog.md` (data-side storage index — its header explicitly says the app's registry is the field-level index and to *"link, don't merge"*), and any ingest that adds/removes/reclassifies a field, stat key or source — `scripts/update-*.mjs`, `lib/sleeper.mjs`, `lib/nflverse.mjs`
- **Invariant:** every ingested field, stat key and source in the data repo has a current row in the app repo's `docs/signal-registry.md`, with its layer, source, historical coverage, reconstructable-vs-ephemeral status and current use accurate as of the change that touched it.
- **Direction:** data→app
- **Triggers:** `docs/signal-registry.md`  ‖  `data-catalog.md`, the signal-registry and Sibling-repo pointers in `CLAUDE.md`, the ingest scripts `scripts/update-{nfl,cfbd,ktc,roster,draft,playerids,advstats,schedule,gamelogs,teamcontext,playerstate,oline}.mjs`, the field-producing parsers/aggregators in `lib/nflverse.mjs` (`parseRosterCsv:164`, `parseDraftCsv:258`, `parsePlayerIdsCsv:350`, `aggregateAdvReceiving:476`, `parsePlayerGameLogs:741`, `parseSchedulesCsv:866`, `aggregateTeamContext:1012`, `aggregateOlineStates:1307`), `aggregateWeeks` in `lib/sleeper.mjs`, `lib/cfbd.mjs`, `lib/ktc.mjs`, and the **coverage-floor constants that encode historical coverage** — `MIN_DRAFT_YEAR:25`, `MIN_SCHEDULE_SEASON:38`, `MIN_GAMELOG_SEASON:50`, `MIN_TEAMCONTEXT_SEASON:55`, `MIN_OLINE_SEASON:60` in `lib/nflverse.mjs`
- **Mirror:** This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

#### CR-19 · Market Efficiency stat keys
- **App side:** `src/components/market/Market.jsx`'s Efficiency column set — `dropbacks:596`,
  `sackPct:597`, `ayPerAtt:598`, `yac:605`, `btkl:606`, `drops:616`; the `field:` expressions in
  `src/utils/usageEfficiency.js` `METRIC_META` (`:39`, `:115`, `:121`, `:145`, `:151`, `:169`);
  **and `src/utils/outlookPositionStats.js:128`** (`computeMetricValue`'s `sacks` metric), a second
  `pass_sack` reader rendered by `dp/UsageEfficiencySection.jsx` and Market's *Outlook* set.
  Enforced by `EFFICIENCY_SET_KEYS` in `src/__tests__/statKeysContract.test.js`.
- **Data side:** `nfl/season-totals/<year>.json`, written by the generic sum-all-keys loop in
  `lib/sleeper.mjs` `aggregateWeeks` (`Object.entries(stats)` at `:297`) via the writer
  `scripts/update-nfl.mjs:93`; `findNonFinite:69` in `lib/validate.mjs`; `RATE_KEYS` in
  `lib/fantasyPoints.mjs:21` (the sole *read-side* key filter — none of these five is in it). As of
  F-24 (2026-08-24), `prunePlayerStats` in `lib/sleeper.mjs` is a second, **write-side** filter
  (drops `idp_*`/`punt*`, applied after the sum loop) — none of these five is `idp_`/`punt`-prefixed
  either, so it does not touch them.
- **Invariant:** all five are season-total **counting** stats, sparsely populated by position and
  games played (2025: `pass_sack` 102, `pass_air_yd` 117, `rush_btkl` 179, `rush_yac` 303,
  `rec_drop` 308 rows). **Sparsity is normal and is not a signal of breakage; absence of the key
  across the whole corpus is.** Sleeper omits zero-valued counting stats, so a present `0` does not
  occur — "absent" and "genuinely zero" are indistinguishable at the row level, which is why the
  corpus-wide check is the only real guard.
- **Direction:** data→app
- **Triggers:** `market/Market.jsx`'s Efficiency-set call sites, `utils/usageEfficiency.js`'s
  `METRIC_META` field strings, `utils/outlookPositionStats.js:128`, `EFFICIENCY_SET_KEYS` in
  `src/__tests__/statKeysContract.test.js`  ‖  the `Object.entries(stats)` sum loop in
  `lib/sleeper.mjs` `aggregateWeeks:297`, the writer `scripts/update-nfl.mjs:93`, `findNonFinite:69`
  in `lib/validate.mjs`, `RATE_KEYS` in `lib/fantasyPoints.mjs:21`, `prunePlayerStats` in
  `lib/sleeper.mjs` (F-24, 2026-08-24 — the write-side `idp_*`/`punt*` denylist)
- **Mirror:** Do not remove, rename or filter `pass_sack`, `pass_air_yd`, `rush_yac`, `rush_btkl`
  or `rec_drop`. They drive five columns of Market's Efficiency set plus the Outlook `sacks` metric,
  and **nothing in either repo fails when they vanish** — no error, no test failure. `rush_yac`,
  `rush_btkl` and `rec_drop` degrade to `—`, which reads as "this player has no data" rather than
  "the pipeline broke." `pass_sack` and `pass_air_yd` were worse until this entry was written: their
  call sites divided by a denominator that survives the key's absence, so a missing key rendered a
  confident **`0.0`** rather than blanking. Both were hardened in the same change; the hazard is
  recorded because the *shape* invites the identical bug in any future consumer that divides by a
  surviving denominator. These keys are **view-only** — unlike CR-11/12/13 they never touch
  `projectedPPG`, the dynasty score or any `factors` entry, so changes need no graded gate; the cost
  of losing them is silent display corruption, not silent scoring drift.

#### CR-20 · `fan_pts_allow_*` DEF-row key preservation *(new — fpa-defense-ranking.md, 2026-08-25, CR-11 family style)*
- **App side:** `src/utils/opponentStrength.js` (`FPA_POSITIONS`, `computeFpaPerGame`'s `fan_pts_allow_${pos}` reads, `isDefenseRowId`), `teams/Teams.jsx`'s four FPA columns, `docs/signal-registry.md`'s `fan_pts_allow_*` row
- **Data side:** the generic sum-all-keys loop in `lib/sleeper.mjs` `aggregateWeeks` (`Object.entries(stats)` at `:297`) writing `nfl/season-totals/<year>.json` — `fan_pts_allow_{qb,rb,wr,te,k,def}` plus the row total are preserved as-is by that loop, same generic-path situation as CR-11/12/13. **Unlike CR-11/12/13, the *row itself* also needs a guard, not just the keys**: `prunePlayerStats` (F-24, `lib/sleeper.mjs`) exempts `TEAM_*` explicitly by id prefix, and bare-abbr DEF rows survive today only because defenses never produce `idp_`/`punt` output — there is no deliberate guard keeping them, per that function's own comment (`"are untouched by the denylist itself... so need no separate guard"`). A future widened denylist (or an allowlist rewrite) could drop `fan_pts_allow_*` keys, or the DEF row itself, with **no app-side diff**.
- **Invariant:** every bare-abbr DEF row, and its seven `fan_pts_allow_*` keys, survive season-totals aggregation and pruning unmodified.
- **Direction:** data→app
- **Triggers:** `FPA_POSITIONS` and the `fan_pts_allow_${pos}` read in `src/utils/opponentStrength.js`'s `computeFpaPerGame`, `isDefenseRowId` in the same file  ‖  the `Object.entries(stats)` sum loop in `lib/sleeper.mjs` `aggregateWeeks:297`, the writer `scripts/update-nfl.mjs:93`, `validateNflSeason` in `lib/validate.mjs`, `prunePlayerStats` in `lib/sleeper.mjs` (F-24, 2026-08-24 — the `TEAM_*`-only denylist exemption whose comment documents DEF rows as unguarded-by-coincidence)
- **Mirror:** Do not remove, rename or filter `fan_pts_allow_qb`/`_rb`/`_wr`/`_te`/`_k`/`_def`/(total), and do not widen `prunePlayerStats`'s denylist (or replace it with an allowlist) without an explicit DEF-row exemption alongside the existing `TEAM_*` one. **`teams/Teams.jsx`'s FPA QB/RB/WR/TE columns degrade silently to `—` across all 32 teams** if either the keys or the rows vanish — no error, no test failure, indistinguishable from the API-only-mode degraded state already shown for an unrelated reason (§6 of the task file). This is the exact silent-degradation shape CR-11/12/13/19 exist to record, for a *row*, not merely a key.

#### CR-21 · In-progress season-totals reads *(new — in-season-app-read.md, 2026-08-28)*
- **App side:** `loadCurrentSeasonTotals` in `src/api/sleeperStats.js` (the `allowInProgress: true` call and its `lastModified` freshness compare), the `currentSeasonTotals` state and effect in `src/App.jsx`, `buildFpaTable`'s `currentRows` parameter in `src/utils/opponentStrength.js`
- **Data side:** the weekly workflow's own cadence (`.github/workflows/nfl-season-totals.yml`), and `scripts/update-nfl.mjs`'s `hasNoData` / `shouldSkipCompletedSeason` / the `inProgress = year >= currentSeason` marking — scoped to what is genuinely this entry's own; the underlying writer and validator are CR-02's triggers (and CR-20's, for the DEF rows specifically), not re-listed here, so a shared-script edit does not fire three entries for one change
- **Invariant:** a season-totals file marked `inProgress: true` is **incomplete by design** and is read as such. It carries the same shape as a completed season — the only signals that it is partial are the manifest's `inProgress` flag and the rows' own `gamesPlayed`. The app must never present an in-progress season as a completed one, and must never let it reach the scoring pipeline.
- **Direction:** both
- **Triggers:** `loadCurrentSeasonTotals` and its `allowInProgress: true` call site in `src/api/sleeperStats.js`, the `currentSeasonTotals` effect in `src/App.jsx`, `buildFpaTable`'s `currentRows` parameter in `src/utils/opponentStrength.js` — the app-side shape validator is `isValidSeasonTotals` (`src/api/dataStore.js`), already a CR-02 trigger; referenced here, not re-listed, for the same reason the data-side script/validator are not duplicated below  ‖  the `inProgress` marking, `hasNoData`, `shouldSkipCompletedSeason` in `scripts/update-nfl.mjs`, `.github/workflows/nfl-season-totals.yml`'s cadence; `validateNflSeason`'s self-calibrating full-season floor in `lib/validate.mjs` is a CR-02 trigger, referenced not re-listed
- **Mirror:** If the weekly job stops running, starts writing partial weeks under a different marking, or the `inProgress` flag's meaning changes, **the app has no way to tell** — it will render a half-season's rates as though they were a season's, with no error and no test failure. The floor in `validateNflSeason` is deliberately self-calibrating (`max(1, maxGames - 3)`) so a partial season validates; that means **the validator no longer distinguishes "early season" from "broken scrape" by games played alone**, and the app-side consumer must not assume it does. Any change to the job's cadence, the `inProgress` marking, or that floor is a both-repos change. See CR-04's Mirror for why this family's `inProgress: true` opt-in is a legitimate exception to that entry's "not a pattern to propagate" line — its `inProgress` flag is accurate, not a mislabel.

<!-- CR-REGISTRY-END -->

> *Note: `nflverse/playerids.json` (the `gsis_id → sleeper_id` crosswalk) is **internal to this repo** — consumed server-side by `scripts/update-advstats.mjs` and `scripts/update-gamelogs.mjs` to re-key gsis-keyed stats. It is not a cross-repo contract (the planned `src/api/playerIds.js` app loader was cut). `MIN_PLAYERID_ROWS` remains an internal sparsity constant.*

> *Note: `nflverse/oline/<year>.json` (OL composition per team-week, ESPN depth charts) is **capture-only** — no app loader exists or is planned; there is no live consumer to keep in sync. It is not a cross-repo contract. `MIN_OLINE_ROWS` remains an internal sparsity constant (same precedent as `MIN_PLAYERID_ROWS` above). If a consumer is ever built, it must follow the teamcontext loader's pattern and stay out of projection/scoring/grading without a graded gate.*

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

**Note on `snapShare` coverage / effective panel:** `off_snp` is not tracked before 2020 in Sleeper data. Rows from pre-2020 seasons are listwise-dropped from any model using `snapShare` as a control (all metric runs and `--validate`). The **effective panel is ~2020–2024**; `meta.predictorYears` in each report reflects only the years that actually contributed surviving rows. The 2019 advstats file was backfilled by the B1 gap-fill (2026-07-03) and is on disk/manifest; its rows still listwise-drop from snap-controlled models for missing `off_snp`.

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

**Flags:** `--metric target_share|air_yards_share|wopr|racr|all` (snake_case canonical; camelCase also accepted) · `--position WR|TE|RB|all` · `--from YYYY` · `--to YYYY` · `--min-games N` · `--controls overallShare|snapShare|rzOwnRate` (comma-separated subset; default: all three; dropping `snapShare` recovers pre-2020 seasons at the cost of one control; `--metric` only, not `--validate`) · `--validate` · `--json` · `--write` · `--by-season`

Reports are written to `backtests/<YYYY-MM-DD>-<metric>-<position>.json` (analysis only — no manifest entry).

### E-0a grading baseline (`bin/panel.mjs`)

The first committed numeric grading verdict (roadmap R1-HARNESS) — the gate instrument every scoring-affecting downstream item (R3-FIT, R3-EFFACT, R3-KTCMOM, R2's flip gate) waits on. It builds a feature→outcome panel, fits a ridge-regularized linear baseline per position, and grades the standing candidates (`airYardsShare`, `shareLevel`) for **incremental** held-out value over a reconstructable baseline — not the full app projection stack.

**Inputs:** `nfl/season-totals/<year>.json` (v3), `nflverse/advstats/<year>.json` (WR/TE/RB position + `airYardsShare`), `nflverse/roster/<year>.json` (QB position fallback), and one pinned committed projection snapshot for `scoringSettings` (default `2026-07-05`). **Explicitly excluded** (view-only fence, CLAUDE.md Invariant): `nflverse/gamelogs/` and `nflverse/teamcontext/` must never feed this panel.

**Methodology:** season-blocked forward-chaining CV (train on years before the eval year only); training-only standardization and imputation (no leakage — the training-fold position mean is recomputed per fold for the one degenerate-null feature, `consistencyCV`); ridge regression (no intercept, no GBM — legible per-feature coefficients only), default λ=1.0 with a `{0, 0.5, 1, 2, 4}` sensitivity sweep always reported; metrics are MAE (PPG units) and within-year Spearman rank correlation (never pooled across years); a mover cohort (team-change flag) is reported separately. Verdict labels (`CLEARS`/`NO-GAIN`/`DEGRADES`/`UNSTABLE`) follow ordered rules — see `.claude/tasks/grading-harness-e0a.md` §3 for the exact thresholds.

**Attribution mode:** all share/team-derived features resolve teams through a single seam (`lib/panel.mjs` `teamKeyResolver`), default `'current-team'` — the reconstructable stand-in for the app's live `DEFAULT_ATTRIBUTION` (a player's season-Y team applied to all of his seasons, including his prior-season stats — this deliberately reproduces the app's mis-attribution mechanism, undercount included). `'per-season-team'` attributes each historical season to that season's own v3 team (era-accurate) — implemented for the R2-REANCHOR flip gate; see the R2 flip gate subsection below.

**Null policy:** data holes (`snapShare` pre-2020, a missing predictor/outcome year file, `teamRzShare`/share level below the team-denominator floor) → listwise exclusion, counted per dropReason; structural absence (`momentum`/`shareTrend` with no qualifying prior season) → impute 0 (neutral); degenerate `consistencyCV` → impute the training-fold position mean.

**Artifacts** (`--write`): `backtests/<date>-e0a-panel.json` (the row-level panel), `backtests/<date>-e0a-fit.json` (baseline + candidate fit reports), `grading/<date>-e0a-verdict.md` (human-readable verdict). None of the three gets a manifest entry — same unregistered-analysis convention as `backtests/` generally.

```sh
node bin/panel.mjs                        # E-0a baseline + candidate grading (analysis-only)
node bin/panel.mjs --write                 # persist the three artifacts above
# npm shortcut
npm run panel
```

Reproduce: `node bin/panel.mjs --write`.

### R2 flip gate (`--flip-gate`) — dual-mode attribution comparison

The activation gate for the app's `DEFAULT_ATTRIBUTION` flip (roadmap R2-REANCHOR): it assembles the E-0a panel under both attribution modes and reports the before/after — it **recommends, it never flips** (`DEFAULT_ATTRIBUTION` stays `'current-team'` app-side; the flip is a separate app-repo activation commit gated on this verdict).

**What diverges and why:** season-Y features are mode-identical by construction; the sole divergent quantity is `shareTrend`'s Y−1 leg, because `current-team` re-buckets a player's prior-season stats under his *anchor-year* team while `per-season-team` uses that season's own v3 team. Row sets, drops, and folds are therefore identical between modes (a paired design) — only `shareTrend` moves. QB touches no team key and is used as a runtime canary: its pooled MAE/Spearman must be byte-identical across modes or the gate throws.

**The attribution-sensitive cohort** is row-grain, not the offseason-mover cohort the app's neutralization targets (forward movers team(Y+1)≠team(Y) — their panel features don't differ between modes at all, since attribution reads only Y and Y−1). The sensitive cohort is `historical-mover ∪ ym1-team-null` — rows whose own {Y−1, Y} team window spans more than one resolvable team. Each sensitive row is additionally flagged `forwardMover`: `false` is the app-realizable projection-path slice; `true` is a direct proxy for the ungated dynasty share-boost exposure (no neutralization there).

**Verdict labels** (ordered, pre-registered `FLIP_THRESHOLDS`): **UNDERPOWERED** if pooled sensitive-cohort N (WR+RB+TE) < 60; **FLIP-DEGRADES** if any share position's overall relΔMAE > +0.005, or ΔSpearman < −0.01, or pooled sensitive-cohort relΔMAE > +0.02; **FLIP-CLEARS** otherwise.

**Artifacts** (`--write`, unregistered — same convention as `backtests/` generally): `backtests/<date>-r2flip-panel.json` (merged both-mode panel — only `shareTrend` diverges, so one file, not two), `backtests/<date>-r2flip-fit.json` (the FlipReport), `grading/<date>-r2flip-verdict.md`.

Reproduce: `node bin/panel.mjs --flip-gate --write` (dry-run without `--write`).

Age-blindness note: unlike E-0a's candidate verdicts, this within-panel A/B is not discounted for age-blindness — both arms are equally age-blind, and attribution accuracy is orthogonal to the age omission.

### R3-FIT fitted exponents (`bin/panel.mjs --fit`)

Offline analysis extending the E-0a panel harness with a log-space exponent fit over reconstructed app factor multipliers (`lib/projectionFactors.mjs`). It re-weights the app's own transparent multiplicative stack (`Πfᵢ^{wᵢ}`) — no GBM, no new served model — and only *authorizes* an app-repo activation commit; it ships nothing itself. Baseline of record for every comparison in this unit: `grading/2026-08-08-e0a-verdict.md`.

**Input-pipeline parity is the governing requirement.** A fitted exponent transports onto the app's own multiplier only if the reconstruction is fidelity-verified, not merely leaf-transform-identical — each of the seven fitted factors (`shareTrend`, `regressionFactor`, `momentumFactor`, `trajectoryFactor`, `snapShareFactor`, `rzUsageFactor`, `teamRzShareFactor`) is walked to its full input pipeline (transform → series/cohort construction → upstream aggregation → terminal source file), not just its top-level formula. See `.claude/tasks/r3fit-exponent-harness.md` §3.0 for the closed enumeration.

**The fittable set, held factors split three ways:**
- **HELD-OMITTED** (age, depth, team, qbQuality, efficiency, comp, bounceBack, tdReliance, breakout) — out of **both** arms. This is the reduced-pipeline limitation E-0a already carries.
- **Structural QB sentinels** (`shareTrend`, `snapShare`, `teamRzShare`) — the app itself neutralizes these for QB (no share series, `SNAP_POSITIONS` gate, no `RZ_SHARE_CONFIG.QB` entry), so their absence from QB's product set is fidelity, not reduction.
- **HELD-IN-ARM** (QB `rzUsageFactor`) — the app applies this to QB unposition-gated; it is reconstructed and carried in **both** QB arms at `wᵢ = 1`, never a fit candidate. QB's product set is therefore length 4, not 3.

**Basis: half-PPR, not the E-0a/flip default.** The app's projection ppg series reads store-served `careerStats[s][pid].fantasyPoints` verbatim, and this repo writes that field as half-PPR — so `--fit` pins `--basis half_ppr` (exact parity by construction, no scoring snapshot read), while every other panel mode keeps `in-basis`. History loads to a `2012` floor (the app's own `loadCareerHistory` floor) instead of the stock `[fromYear-2..]` window, so multi-season factors (`basePPG`/momentum/regression/trajectory/shareTrend) see the app's real qualifying history.

**The model form — RMS-scaled ridge toward `w=1`.** Per position, `y(r) = log(outcomePPG) − log(anchorBasePPG) − Σ log fᵢ(r)` (the hand-stack log-residual, no intercept). Raw regressors `x_i = log fᵢ` are rescaled per fold, train-rows-only, by an uncentered RMS scale `s_i` before ridge fitting with `ridgeLambda = α·nTrain` — this is what makes the dimensionless shrinkage knob `α` scale- and `n`-independent, so a `shareTrend` column (large log-variance) and a `teamRzShare` column (small) shrink by the *same fraction* `1/(1+α)`, not by wildly different amounts under one raw-column λ. That uniformity holds exactly only under column orthogonality — the fitted factors are correlated (the usage trio; momentum/trajectory), so real shrinkage is slightly non-uniform, a second-order and unavoidable effect. Map back `δ_i = β_i/s_i`, `w_i = 1 + δ_i`; ridge toward `β=0` is ridge toward `w=1` — "empirically dead" vs "hand-tuned was right."

**The two-clamp prediction form (`predictWithExponents`, `lib/panel.mjs`) — both arms, identical rows/folds/product set.** The app does not multiply a flat product into `rawPPG`: ten factors form `combinedNewFactorRaw`, clamped to **`[0.67, 1.50]`** (the *inner* clamp), before joining the un-enveloped terms and only then hitting the outer **`[0, 40]`** clamp on `rawPPG`. Of the seven fitted factors, five sit inside the envelope (`momentum`, `trajectory`, `snapShare`, `rzUsage`, `teamRzShare`); `shareTrend` and `regression` multiply in directly, outside it. The fit target `y` is deliberately the **unclamped** log-residual — the clamp is a non-linear post-transform that would break the log-linear OLS form if folded into the target, so the fit is unconstrained in log space and constrained only at scoring (`inner`/`outer` composed in order, never merged).

*Known limitation, stated not hidden:* the reconstructed envelope wraps a **reduced 5-factor** sub-product where production wraps **10** (the other five envelope members — `qbQuality`, `breakout`, `bounceBack`, `tdReliance`, `efficiency` — are HELD-OMITTED). This makes the reconstruction a **conservative approximation of the app's clamp, not a faithful one**: the reduced hand-arm inner product tops out well inside `[0.67, 1.50]`, so `clampHits.hand` is 0 **by construction**, not because production's envelope is inert on real players. It still catches the fitted arm's own inflation (exponents `>1` can push the reduced product past where the hand product ever reaches), which is the risk the envelope exists to guard against — it just doesn't reproduce full production clamp incidence. `clampHits` per arm are reported in the verdict precisely so a CLEARS driven by heavy fitted-arm clamping is visible.

*Cancellation caveat:* a held, pinned, held-in-arm, or fold-neutralized factor's identical-in-both-arms term cancels in ΔMAE — but **only on rows where neither arm's inner product hits the clamp**. On a row where one arm truncates and the other does not, the clamp is a non-linear transform applied after summing, so the shared factor no longer cancels post-clamp — that is the *real* clamped difference between the two predictions, not a defect in the pin/hold arithmetic.

**CV, verdict, and the identifiability guard.** Season-blocked forward-chaining CV, same convention as E-0a. Verdict rules run on two channels: rule 0 (`nToParam = nEvalRows / |F_p^fit| < 20` → **INSUFFICIENT-POWER**, deferred, no fit — `nEvalRows` is the **pooled eval-row** count the gate was calibrated on, not the larger all-predictor-years fit-row count, which is reported alongside but never gates) short-circuits before any fit runs; rules 1–4 (`decideFitVerdict`) then produce **DEGRADES** / **CLEARS** (pooled ΔMAE<0, ΔSpearman≥0, ≥2-of-3 eval years improved, α-stability across `{0.25,0.5,1}`, **and** a thin-position guard — `sign(wFinal_i − 1)` must agree between `α=0.5` and `α=2` for every estimated factor) / **NO-GAIN** / **UNSTABLE**. A separate sensitivity re-run (excluding a debut-year-minus-1 cohort — a `years_exp` boundary ambiguity) overrides to **UNSTABLE** whenever the base and sensitivity labels disagree.

The **identifiability guard** (rule 0b) is one `selectFitFactors` call per position, over that position's full fit-row set, ranging only over the estimable candidates (never the held-in-arm ones): any factor flat-1.0 (`|log fᵢ| < 1e-12`) on ≥90% of rows is **pinned** at `w=1` in both arms — data-driven, not config, and computed once so the shipped refit and every scored CV fold draw from an **identical factor support** (support-identity, not vector-identity — `wFinal` is an all-rows refit no fold scored out of sample). A retained factor can still be **~100% flat on one fold's train subset** even though it isn't globally flat (a fold's train years are a proper subset); that case degrades **gracefully per fold** — the factor is neutralized for that one fold, never aborting the run — rather than either ignoring the degeneracy or crashing.

*Is the guard load-bearing or inert?* Reported, not assumed: the verdict's guard-instrumentation block prints, per position, the pinned set (with each one's flat-1.0 rate), **every** fit candidate's flat-1.0 rate (not just the pinned ones — a retained factor sitting near 0.90 is the interesting number), how often per-fold graceful neutralization fired (by factor and reason), and the per-fold `max|w−1|` explosion tripwire. The first real run is what answers whether this guard is doing real work or is inert across every position — if inert everywhere, it becomes a candidate for removal in a later slice.

**Panel size is the binding constraint.** Reading `grading/2026-08-08-e0a-verdict.md`'s pooled eval n: WR 339 (comfortable), RB 197 (adequate), TE 164 (marginal — lean on the WR+TE pool fallback), QB 92 (underpowered — expect NO-GAIN, the gate working as intended, not a failure). The `n:p<20` deferral, the identifiability guard, and the α-stability check are all levers that make a thin/noisy panel self-protecting rather than overfit. `roadmap.md` R1-SNAPS (panel width) is still open — the harness is panel-width-agnostic and re-runs unchanged (config only, `--from 2013`) once it lands, roughly tripling every position's n.

**Parity coverage: 5 of 7, named gap on the other 2.** `momentum`, `regression`, `trajectory`, `snapShare`, `rzUsage` are checked against a real committed snapshot's app-computed factors (half-PPR basis, through the same exported `buildCohortPools`/reconstruct* functions the fit itself calls). `shareTrend` and `teamRzShare` have **no** end-to-end app-ground-truth check yet — no committed snapshot exists in the per-season-team + entity-filtered regime (the store's snapshots predate both the R2 flip and the 2026-08-08 denominator fix). They rest on construction-level tests instead (golden fixtures, series-construction parity, synthetic isolation, neutralization, usage-season anchoring). Closure path: extend the parity check to these two once a post-2026-07-18 snapshot is imported (roadmap R0-BANK) — a one-line change.

**Reduced-pipeline / provisional caveat.** Same standing limitation as E-0a: the gate compares fitted-`w` vs hand-`w` on the reconstructable pipeline only, with HELD-OMITTED factors out of both arms. A reduced-pipeline CLEARS is the pre-registered pre-2027 activation criterion (roadmap D-1) — provisional, re-validated by forward grading once real outcomes exist (R4).

**Artifacts** (`--write`, unregistered — same convention as `backtests/` generally): `backtests/<date>-r3fit-panel.json` (row-level panel with reconstructed multipliers), `backtests/<date>-r3fit-fit.json` (the FitReport — per-position + WR+TE pool verdicts, fidelity block, sensitivity block), `grading/<date>-r3fit-verdict.md`.

```sh
node bin/panel.mjs --fit                  # analysis-only
node bin/panel.mjs --fit --write          # persist the three artifacts above
node bin/panel.mjs --fit --alpha 1        # override the shipped shrinkage knob (default 0.5)
# npm shortcut
npm run panel:fit
```

Reproduce: `node bin/panel.mjs --fit --write`.

This unit **builds and commits the fit only** — it activates nothing. Shipping a CLEARS position's exponents into `seasonProjection.js` is a separate, app-repo unit (`r3fit-activation.md`), gated on the committed verdict here.

---

## Data sources and attribution

| Data | Source | Terms |
|---|---|---|
| NFL player stats | [Sleeper API](https://docs.sleeper.com/) | Personal use, read-only |
| Dynasty market values | [KeepTradeCut](https://keeptradecut.com/) | Personal use |
| College stats | [College Football Data API](https://collegefootballdata.com/) | Non-commercial / personal use |
| NFL schedules, results & Vegas lines | [nflverse / nfldata](https://github.com/nflverse/nfldata) | Public domain (CC0-style); attribution requested |
| NFL play-by-play (team-context derivation) | [nflverse / nflverse-data](https://github.com/nflverse/nflverse-data) | CC-BY 4.0-style; attribution requested |

This repo is for personal dynasty fantasy football analysis only. It is not affiliated with, endorsed by, or licensed by any of the above services.
