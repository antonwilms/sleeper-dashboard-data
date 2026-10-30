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
    rosterweekly/             — nflverse weekly roster status (REG), one file per year, keyed by sleeper_id, internal-only
      2016.json
  raw/                        — Everything else exported from IndexedDB
                                (league data, player map, etc.)
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
    "weeklyStats":   { "1": { "rec": 7, "rec_yd": 98, "...": 0 }, "...": {} },
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

**`weeklyStats`** (weekly-scoring-keys, D-47; no `schemaVersion` bump) — on every non-`TEAM_*` row with `gamesPlayed > 0`: for each `'P'` week, that week's non-zero stat values, so a consumer can score any week under any league's `scoringSettings`. It is a **denylist** (CR-02 stance): every `stats` key except `idp_*`/`punt*`, `RATE_KEYS`/`*_lng`, `pts_half_ppr`/`pts_ppr`/`pts_std`/`pts_idp`, `pos_rank_*`, `fan_pts_allow*`, `gp`/`gs`/`gms_active`/`snp`, `*_snp` and `rec_ypt` (`lib/sleeper.mjs` `isWeeklyStatsExcluded`; `pts_allow*`/`yds_allow*` are kept — DEF scoring). A played week with no kept value is omitted (zero points); for every kept key the weeks sum to the season `stats` value. `weeklyPoints` stays `pts_half_ppr` and `scoringBasis` stays `'half_ppr'`, so every data-side fit keeps its input. `TEAM_*` rows never carry it. Absent field = not covered. 2012–2025 were backfilled by `scripts/migrate-weekly-stats.mjs` (Invariant-1 rewrite #4, below); `update-nfl.mjs` writes it forward and validates it with `requireWeeklyStats`. The grade that gated wiring is `bin/backtest.mjs --weekly-basis --weeks-cache <dir>` (`scripts/weekly-basis-run.mjs`; verdict `grading/2026-10-15-weekly-basis-verdict.md`).

**`weeklyStatus` codes** (one character per week, 1-indexed by array position):

| Code | Meaning |
|------|---------|
| `P` | Played — `gp === 1` in the per-week response |
| `D` | DNP — `gp === 0` and the player's team had other players with `gp === 1` that week; **since absence-classification (2016+) also** a week Sleeper omitted the player while `nflverse/rosterweekly` lists him `ACT`/`INA`/`RES`/`PUP` on a team that played (CR-28) |
| `B` | Bye — `gp === 0` and no player on the team appeared in that week's response |
| `X` | Absent — player not in the per-week response at all, and (2016+) not on the weekly roster with an availability status for a team that played |

Pre-2021 NFL had 17 regular-season weeks. Those seasons store `X` at week 18 for every player; consumers may hide it from week-by-week visualisations.

`availability.absenceCause` is always `"unknown"` in Phase 5. It exists as a placeholder for future cause-of-absence enrichment (injury report scrape, manual annotation). An absence run ≥ 3 weeks is *suggestive* of injury but not labelled as such by this script — Sleeper stats alone cannot distinguish injury from suspension, healthy scratch, or personal absence.

**Snap field coverage:** `off_snp`/`tm_off_snp` are present in Sleeper data from ~2020 onward; seasons before then omit them (widened for analysis via `nflverse/snaps`, 2013+, see that family's row — the app itself still degrades to neutral pre-2020). **Red-zone field coverage — corrected 2026-09-07 (D6b):** the claim that `rec_rz_tgt`/`rush_rz_att`/`pass_rz_att` are absent before ~2021 does not hold against live `nfl/season-totals/` — all three carry real nonzero values back to 2013 (measured: 100% of qualifying RB rows in 2013 carry `rush_rz_att`; counts grow gradually with overall roster/data completeness, no discrete 2021 cutoff). They flow through the generic sum-all-keys aggregation unchanged; the app still degrades the dependent projection factors to neutral only under their own real per-row gates (see sibling repo `usageMetrics.js` / `teamRzShare.js` / `durabilitySignals.js`), not a year-coverage gap.

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

**Integrity guards.** Each scrape is validated per-row (finite integer value in 0–9999, non-empty name, known position or null for rookie picks, count 250–600) and checked for aggregate breakage via a Spearman rank correlation against the last good snapshot (joined on player name). Legitimate market recalibration preserves ordering (ρ ≈ 0.998); a selector/parse break collapses it. A separate landscape check (≥ `KTC_MIN_TOP_QBS` = 8 QBs, by scraped position, in the top `KTC_LANDSCAPE_TOP_N` = 50 — `checkKtcLandscape`, `lib/validate.mjs`) catches a wrong-format scrape: the superflex board holds 13–16 QBs in its top 50, the 1QB board 3. It reads no name list, so normal QB movement cannot trip it, and it never throws. Below ρ = 0.90, or on a landscape miss, the snapshot is **quarantined** to `ktc/quarantine/` (committed for review but not registered in the manifest, so the app never reads it) and the weekly workflow fails for manual review — a false trip never permanently loses a day.

---

### `snapshots/<date>.json`

Daily projection snapshot produced by the app's pipeline, capturing the contemporaneous inputs and outputs used for season projections. One file per UTC date. Used for future backtesting — no consumer UI in v1.

**Two capture paths as of D1b.** The primary path is `.github/workflows/daily-snapshot.yml` — a
headless build+run of the app, gated on `lib/snapshot-capture.mjs` before it commits (phase 1:
`workflow_dispatch` only, see the [GitHub Actions](#github-actions) table and CR-22 below). The
manual browser+export path (below) remains the documented fallback and is **not** gated the same
way — see [snapshot-workflow.md](snapshot-workflow.md).

**First-league-of-the-day-wins:** if multiple leagues are opened in the same UTC day, the first one to complete the projection pipeline is captured; subsequent leagues are silently skipped. The `leagueId` field makes this detectable after the fact.

```json
{
  "schemaVersion":   3,
  "capturedAt":      "2026-05-19T14:23:11.812Z",
  "scoringBasis":    "half_ppr",
  "targetSeason":    2026,
  "currentSeason":   2025,
  "scoringSettings": { "rec": 0.5, "bonus_rec_rb": 0, "pass_td": 4, "...": "..." },
  "leagueId":        "1312015497465716736",
  "inputStatus": {
    "college":            { "loaded": true,  "count": 312, "detail": { "years": [] } },
    "nflDraft":           { "loaded": true,  "count": 257, "detail": { "years": [2024, 2025, 2026], "matched": 41 } },
    "ktc":                { "loaded": true,  "count": 441, "detail": { "rows": 500 } },
    "priorSnapshotTeams": { "loaded": false, "count": 0 },
    "depthChart":         { "loaded": true,  "count": 671 },
    "careerStats":        { "loaded": true,  "count": 14, "detail": { "seasons": ["2012", "...", "2025"], "provenance": { "2025": "data-store" } } },
    "playerIds":          { "loaded": true,  "count": 6400, "detail": { "generatedAt": "2026-10-21T18:07:53.362Z" } }
  },
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

**`inputStatus` (v3, D1a/D1b).** Seven labels for the gated projection inputs that would
otherwise fail *silently neutral* — `college`, `nflDraft`, `ktc`, `priorSnapshotTeams`,
`depthChart`, `careerStats`, `playerIds` (the crosswalk the app's KTC/draft/college joins used; additive, no
reader here) — each `{ loaded: boolean, count: number|null, detail?: object }`.
This is a **label only**: the app's own write gate never refuses to write on a `false` (see
`docs/architecture.md` → *Smoke-testing* in the app repo), so a v3 snapshot with a degraded
input still exists — it is simply detectable. `priorSnapshotTeams.loaded` is legitimately
`false` on the very first snapshot ever captured (no prior day to compare against); `nflDraft`
is legitimately `false`/absent-from-`detail.years` in the January–April window before that
year's draft class exists. v3 is additive — every v2 field keeps its name, type and meaning.
**D1b's commit gate reads this block** to decide whether the daily Action's capture is safe to
register at all (see [GitHub Actions](#github-actions) and `lib/snapshot-capture.mjs`); the
manual import path does not run that gate.

**`projectionModelFrom` (D-50, still v3 — additive, no bump).** The app's `PRIOR_MODEL_FROM` at capture: a
`YYYY-MM-DD` string naming the projection model the capture ran on. The app's frozen-prior gate compares it
(CR-26). Absent on captures made by code that predates D-50. A grader may segment app-model boundaries by
it; served-data corrections and row-detectable axes are segmented as `grading/anchor-policy.md` says.
Importers and the commit gate pass it through untouched.

**`players[id].inSeason` (in-season-evidence-2b-1, still v3 — additive, no bump).** The in-season posterior at capture:
`{ season, n, population, frozen, priorSource, notFrozenReason, ros: { prior, k, weight, value }, next: { priorKind, prior, k, weight, value } }`.
Absent when there is no usable live season or the player is ineligible. `projection` stays the unmodified prior (never a
posterior), so grading continuity holds; graders that ignore unknown per-player keys need no change. Snapshots are read back by
the app through `tryDataStore` (CR-26), so any future `schemaVersion` bump needs the app's `MAX_SUPPORTED_SCHEMA` raised first (CR-01).

**`players[id].dynasty` (still v3 — additive, no bump).** The final dynasty score at capture, kept because its KTC-dependent
paths cannot be rebuilt later: `null | { score, label, confidence, components, qbQualityScore, qbModifierApplied, dynastyScoreBase? }`.
`components` is `null` or `{ ageAdjusted, trajectory, currentLevel, reliability, opportunityQuality }`, each `{ value, weight }`.
The key is always present — `null` when the player has no finite score — so a missing key means the capture predates the field.
`score` is post-QB-modifier. `qbQualityScore` / `qbModifierApplied` (percent) are `null` when no modifier applied.
Recovering the pre-modifier score from `score`, `opportunityQuality.value`, `qbQualityScore` and `qbModifierApplied` is approximate
(about ±1 point when nothing clamps; the app rounds each stored value). When the modifier clamps opportunity quality at 100 or
the score at 0/100 the pre-modifier value is not recoverable. A QB's `score` carries the live in-season level while
`dynastyScoreBase` (present only on such a QB) holds the level-free score in the same compact form, without `qb*` fields.
The commit gate does not require it; graders ignore it.

**`ktc`** is `null` if the player isn't in the KTC map; otherwise `{ value, positionPercentile }`.

**`projection`** is the verbatim output of `computeNextSeasonProjection` — no field whitelist.

**Import workflow (manual fallback — see `daily-snapshot.yml` for the primary, automatic path):**
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

**schemaVersion 2 (D2, 2026-09-05 — additive, minified).** `ids` is unchanged in shape and population.
A new `bySleeper` index is added — the file is served minified (`{ minify: true }`) since v2 is roughly
a threefold size increase over v1 (measured: 0.67 MB v1 → 2.02 MB v2 minified, re-measured against the
shipped shape per Fix pass 1 item 2 — the earlier 2.79 MB and 1.68 MB figures both predate the shipped
`bySleeper` shape and are superseded).

```json
{
  "schemaVersion": 2,
  "generatedAt": "2026-09-05T12:00:00.000Z",
  "sourceSeason": 2026,
  "rowCount": 6193,
  "sleeperRowCount": 6392,
  "ids": {
    "00-0034796": { "sleeperId": "4984", "name": "Josh Allen", "position": "QB" }
  },
  "bySleeper": {
    "4984": {
      "gsisId": "00-0034796", "pfrId": "AlleJo02", "ktcId": "4984", "cfbrefId": "allen-josh",
      "birthdate": "1996-05-21", "draftYear": 2018, "draftRound": 1, "draftPick": 7,
      "draftOvr": 7, "undrafted": false, "espnId": "3918298", "college": "Wyoming", "team": "BUF"
    }
  }
}
```

`ids` is keyed by **`gsis_id`**; the value carries `sleeperId` (the join payload) plus `name`/`position`
(debug/validation only). Rows where `gsis_id` or `sleeper_id` is empty or `NA` in the source are
excluded from `ids`. Duplicate `gsis_id`s use keep-last (pinned by test, not just comment —
`test/nflverse.test.mjs` §D — confirmed lossless: colliding rows share the same `sleeperId`).

`bySleeper` is keyed by **`sleeper_id`**, and is the **reverse** index — it exists precisely because
`ids` is not invertible in general (see next paragraph). A row is excluded from `bySleeper` only when
`sleeper_id` itself is empty or `NA`; unlike `ids`, a missing `gsis_id` does not exclude a row —
`gsisId` is simply `null` (~199 such rows measured 2026-09-05). Duplicate `sleeper_id`s prefer
whichever row carries a `gsis_id` over one that doesn't (one measured conflict, sleeper `133`); when
neither or both rows have one, last-wins. `draft_round`/`draft_pick`/`draft_ovr` are `null` for
undrafted players — verified against `nflverse/draft/draft_picks.json`, not inferred — and `undrafted`
is emitted explicitly so a consumer never has to read that null as "unknown." `ktc_id` is served but
only 7% populated upstream; do not plan a join on it. `espnId`, `college` and `team` round out the
eleven parsed columns — all three are plain strings, `null` when empty or the literal `NA`, same as
every other id/string field here. The app reads `ids[gsisId].name` (KTC's spelling) and `bySleeper`'s
`draftYear`/`draftOvr`/`undrafted`/`espnId`/`college` to join KTC, the NFL draft and CFBD college stats
(CR-31 in the [cross-repo index](../sleeper-dashboard/docs/cross-repo-registry.md)); `draftOvr` is the overall
pick (`draft_picks.json` `pick`), `espnId` is the CFBD athlete id.

**Not a bijection, and no longer forward-map-only.** Measured 2026-09-05: the source data has 5
duplicated `gsis_id` values (harmless — colliding rows share the same `sleeper_id`) and 6 duplicated
`sleeper_id` values, one of which conflicts (sleeper `133`, resolved as described above). `ids` and
`bySleeper` are two independently-built indexes over the same rows, not a forward map plus an
in-memory inversion of it — a consumer needing the reverse lookup should read `bySleeper` directly
rather than inverting `ids`.

**Sparsity gate (`MIN_PLAYERID_ROWS = 5000`):** the ingest refuses to write if fewer than 5000
`ids` rows parse (unchanged, unaffected by `bySleeper`'s wider population); the app's `isValidPlayerIds`
only checks `schemaVersion === 2` and the two blocks (CR-31). Two further internal
gates apply to `bySleeper`: `birthdate` fill rate ≥ 0.95 and `pfr_id` fill rate ≥ 0.85 (measured
0.998/0.944). No gate exists for `draft_round`/`draft_pick`/`draft_ovr` (null means undrafted, not
sparse) or `ktc_id` (genuinely 7% populated) — a fill-rate floor on either would fire on correct data.

**`inProgress: false`:** the app loads this family through `tryDataStore` (`src/api/playerIds.js`, CR-31);
the flag is convention parity with the sibling nflverse ingests. Content-hash dedup means no commit when unchanged; the dedup hash now covers
both `ids` and `bySleeper`, so a week where only sleeper-only rows change still produces a write.

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

**Weekly refresh:** `nflverse-playerstats.yml` runs Tuesday 10:47 + Saturday 13:47 UTC. Saturday runs after the Wednesday
playerids Action, so it re-keys against the freshest crosswalk committed to main; the Tuesday run re-keys against the PREVIOUS Wednesday's crosswalk, so a player first mapped by this week's playerids run is skipped (logged) until Saturday. As of
playerstats-single-fetch.md (2026-08-31), this and the gamelogs family below are derived from a
single fetch of `stats_player_week_<year>.csv` (`node bin/update.mjs playerstats`), so the two
families can no longer diverge across a day boundary within the same week. This moved advstats from
its former Thursday slot; the standalone `advstats` subcommand below is unaffected and still fetches
independently when invoked directly.

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
- **Refresh:** Tuesday 10:47 + Saturday 13:47 UTC (`nflverse-playerstats.yml`, same single-fetch orchestrator as
  advstats — see above), after Wednesday playerids so the gsis re-key hits the freshest crosswalk.
  The standalone `gamelogs` subcommand below is unaffected and still fetches independently when
  invoked directly (`--all` backfill always fetches per season, regardless of the orchestrator).

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

### `nflverse/snaps/<year>.json`

PFR-sourced offensive snap-share forward capture (R1-SNAPS), produced by `bin/update.mjs snaps
[--year YYYY] [--all]`, sourced from `snap_counts_<year>.csv` in the nflverse `snap_counts`
release. Exists to widen the panel/backtest's snap-share predictor past Sleeper's own
`off_snp`/`tm_off_snp`, which are only populated from 2020 — see [Analysis /
Backtesting](#analysis--backtesting).

**`MIN_SNAPS_SEASON = 2013`, not the 2012 floor its sibling nflverse families share:**
`snap_counts_2012.csv` exists upstream (HTTP 200) but is header-only, zero data rows — 2013 is
the first season with real data.

**Position scope:** QB, RB, WR, TE, FB — mirrors `nflverse/gamelogs`' default. **REG only**, same
rule as advstats/gamelogs.

**Served shape:**
```json
{
  "schemaVersion": 1,
  "season": 2016,
  "generatedAt": "2026-09-06T01:31:07.000Z",
  "rowCount": 6397,
  "playerCount": 582,
  "unmapped": 11,
  "players": {
    "19": {
      "pfrId": "FlacJo00",
      "name": "Joe Flacco",
      "position": "QB",
      "team": "BAL",
      "games": 16,
      "offSnaps": 1111,
      "teamOffSnaps": 1134,
      "offPct": 0.98
    }
  },
  "byPfr": {
    "GronGl01": {
      "pfrId": "GronGl01",
      "name": "Glenn Gronkowski",
      "position": "FB",
      "team": "BUF",
      "games": 1,
      "offSnaps": 8,
      "teamOffSnaps": 49,
      "offPct": 0.163
    }
  }
}
```

**Field semantics:**
- `players` is keyed by `sleeper_id`, joined from the source's `pfr_player_id` via the D2 crosswalk
  (`nflverse/playerids.json` `.bySleeper[*].pfrId`, reversed in memory — there is no natural
  pfrId-keyed index on disk).
- **`byPfr` — a deliberate departure from the advstats/gamelogs house pattern.** Those two families
  drop unmapped rows to a bare `unmapped` count; at this family's ~99% join rate the residue is
  small and worth retaining (the rows that fail to join are the interesting ones), so unmapped
  entries are kept here, keyed by their original `pfr_player_id`, same record shape as `players`.
- **Team-snap denominator is an assumption:** a team's offensive snaps for a game is the **MAX**
  `offense_snaps` across every player who appears for that team in that game (computed over ALL
  positions on the roster that game, including OL — not just the emitted skill positions). Holds
  because an offensive lineman who never leaves the field makes "max" a good proxy for the team's
  true offensive-play count.
- **Team codes pass through unchanged.** This source is already historically team-coded per season
  (2016 carries `LA`/`SD`/`OAK`, matching each franchise's real 2016 name) — `eraTeam()` (used by
  `nflverse/teamcontext`, whose pbp source normalizes to *current*-franchise codes) must never be
  applied here; it would be a no-op today but wrong intent for the next person to reason from.
- **Traded players** (`traded: true`, `teams[]` sorted by snaps descending) get **week-restricted
  per-team-stint denominators** — mirrors `nflverse/advstats`' traded-player treatment: each stint's
  denominator sums only the team-game maxima for the weeks the player actually has a row with that
  team, never the team's season-wide total. `offPct` is Σ`offSnaps` ÷ Σ(per-stint)`teamOffSnaps` — a
  straight ratio of two honestly-summed components, never an average of a stored per-game rate.

**Sparsity gate:** `MIN_SNAPS_ROWS = 3000` (skill-position REG rows, zero-snap rows included) is
enforced as a hard throw in `lib/validate.mjs` `validateSnaps` — **not** the season-keyed spine's
own skip-and-continue sparsity check, which this family deliberately sets low. Every season this
family backfills is already complete/published, so a shortfall is a truncated fetch, not an
unpublished season, and gets a loud failure rather than a silent skip. Join-rate floor
`SNAPS_JOIN_RATE_MIN = 0.85` over skill-position players is enforced the same way.

**Capture-only, banked disabled.** `scripts/panel-run.mjs`'s `DEFAULT_LOAD.loadSnapShare` seam
stays `null` — see [Analysis / Backtesting](#analysis--backtesting) for the cross-validation this
family exists to support and why the fallback is not enabled yet.

**Yearly refresh:** `nflverse-snaps.yml` runs mid-February (post-season; no in-season weekly
refresh for this family).

```sh
node bin/update.mjs snaps --year 2016
node bin/update.mjs snaps --year 2016 --dry-run
node bin/update.mjs snaps            # current season
node bin/update.mjs snaps --all      # backfill every season ≥ 2013
```

---

### `nflverse/depth/<year>.json`

Historical depth-chart capture (D5), produced by `bin/update.mjs depth [--year YYYY] [--all]`,
sourced from `depth_charts_<year>.csv` in the nflverse `depth_charts` release. Reclassifies
`depth_chart_order`/QB1 identity from "ephemeral, never reconstructable" to reconstructable back to
2013 — the prerequisite for a later slice's depth-order multiplier and QB-change flag, neither of
which has any history today. **Capture-only: wires no factor.** No app, projection, grading,
backtest, or panel path reads this family.

**Two schemas share one release, split at `DEPTH_ESPN_FROM_SEASON = 2025`:** legacy (2013–2024,
`aggregateDepthLegacy`) and ESPN (2025+, the same `dt` schema `nflverse/oline` reads,
`aggregateDepthEspn`). The ESPN-era NFL week is derived from the **upstream** nfldata `games.csv`
directly (`fetchSchedulesCsv` → `buildGamedayIndex`) — never the served `nflverse/schedule` family,
which carries no date column. ESPN rows are reduced from a near-daily snapshot cadence to one chart
per (team, NFL week), keeping only the rows at that bucket's max `dt` (shares `addToLatestDtBucket`
with `nflverse/oline`'s own reduction).

**`MIN_DEPTH_SEASON = 2013`** — a floor chosen for join/gate defensibility, not upstream absence
(the `depth_charts` release itself goes back to 2001); a below-floor `--year` is rejected before the
spine ever sees it, since pre-2013 assets carry real rows (unlike snaps' header-only 2012) and would
not naturally route through the "not published" skip.

**Position scope:** QB, RB, WR, TE.

**Served shape:**
```json
{
  "schemaVersion": 1,
  "season": 2013,
  "generatedAt": "2026-09-06T11:05:46.048Z",
  "rowCount": 7718,
  "playerCount": 493,
  "unmapped": 85,
  "outOfWindow": 0,
  "weeks": {
    "1": {
      "ATL": {
        "QB": ["24", null],
        "RB": ["57", "949", "609", "215", null],
        "WR": ["947", "4", "247", null, "945"],
        "TE": [null, "352", "1642"],
        "depthPositions": {
          "QB": ["QB", "QB"],
          "RB": ["RB", "RB", "RB", "RB", "RB"],
          "WR": ["WR", "WR", "WR", "WR", "WR"],
          "TE": ["TE", "TE", "TE"]
        }
      }
    }
  },
  "week1Qb1": { "ATL": "24" },
  "qb1Changed": null
}
```
(ESPN-era team entries — 2025+ — carry `dt`/`date` instead of `depthPositions`; see below.)

**Field semantics:**
- `weeks[week][team][position]` is an ordered array — **array position is the depth order** — but
  unlike every sibling family's `players`/`byPfr` maps, an entry that fails to join is kept as
  **`null` at its original index**, never dropped. Dropping would shift every later entry down a
  slot, silently promoting a depth-2 player into the depth-1 slot whenever the true depth-1 player
  fails to join — verified against a live measurement: with position preserved, 2013 has exactly 31
  teams with a joined depth-1 QB; a drop-and-reindex implementation measures 32 (crediting a team
  whose *backup* QB happens to have joined instead).
- **Legacy `depth_team` is not a total order within a position.** Measured on 2013: 2,125 of 6,342
  `(club, week, position)` groups share a `depth_team` value, because legacy ranks **within
  `depth_position`** (the slot) while ESPN's `pos_rank` ranks **within `pos_abb`** (the position) —
  the two eras measure different things, not the same rank on different schemas. The served array is
  still deterministic (`depth_team asc, depth_position asc, input order`), but a per-team
  `depthPositions` sibling — parallel-indexed (nulls included) to each position's id array — is
  emitted **only when at least one entry carries a non-null `depthPosition`**, i.e. only on
  legacy-era files; ESPN-era files carry `dt`/`date` (the winning snapshot moment for that
  team-week's reduction) in that slot instead, and never `depthPositions`.
- `rowCount`/`playerCount` count resolved (non-null) entries only.
- `unmapped`/`outOfWindow` are honest counts: `unmapped` is distinct skill-position ids with no
  crosswalk mapping (the join-rate denominator's other half); `outOfWindow` (ESPN-era only) counts
  `dt` timestamps whose date falls outside the REG-season window rather than dropping them silently.
- `week1Qb1: { [team]: sleeperId|null }` is the depth-1 QB at week 1 REG — index 0 of the QB array,
  not "any QB present that week".
- `qb1Changed: { [team]: boolean } | null` compares `week1Qb1` against the **prior season's served
  file**. `null` at `MIN_DEPTH_SEASON` (no prior season exists); a later season with a missing prior
  file **throws** rather than silently yielding `null`, which would be indistinguishable from the
  floor season's legitimate one. Two consequences of reading a prior served file rather than
  recomputing: a correction to season Y−1 can never propagate into Y once Y is `--force`-gated
  under Invariant 1, and a relocation year (e.g. 2016's `STL`→`LA`) reads as `qb1Changed: true` for
  the new team code even when the same QB started both seasons, since the comparison is keyed by
  team code with no era-remap.

**Join:** `gsis_id` via the crosswalk's `.ids` map is primary (100% populated on legacy, 98.6% on
ESPN skill rows); ESPN rows whose `gsis_id` is empty fall back to `espn_id` via
`crosswalkFromBySleeper(bySleeper, 'espnId')` — generalizes `nflverse/snaps`' `pfrId` inversion
pattern rather than duplicating it. **Prerequisite:** an ESPN-era season hard-errors if the
crosswalk's `bySleeper` is absent or empty — regenerate to schemaVersion 2 first
(`node bin/update.mjs playerids`).

**Gates, all enforced as a hard throw in `lib/validate.mjs` `validateDepth`** (mirrors
`nflverse/snaps`'s pattern — the spine's own sparsity skip is deliberately near-inert for this
family; completed seasons get `MIN_DEPTH_ROWS`, the in-progress season a per-week floor):
- `MIN_DEPTH_ROWS = 3500` over joined (non-null) skill rows.
  - In-progress season only: `MIN_DEPTH_ROWS_PER_WEEK = 200` × `max(1, weeks − 1)` (latest week may be partial; lowest full week measured 423), plus a shrink guard — fewer weeks than the served current-season file throws.
- 30–32 teams present at week 1 (exactly 32 in every season measured except 2017, which has 30 —
  the MIA@TB week-1 game was postponed to week 11 that season for Hurricane Irma).
- A depth-1 QB present for ≥ `MIN_DEPTH_QB1_TEAMS = 30` teams at week 1.
- Skill-position join rate ≥ `DEPTH_JOIN_RATE_MIN = 0.80`, computed over **distinct** ids (not row
  occurrences — an occurrence count inflates the rate and would defeat this floor's calibration).
- Per-year team-code assertions at the three boundary pairs (`STL`↔`LA` 2015/2016, `SD`↔`LAC`
  2016/2017, `OAK`↔`LV` 2019/2020) — this source is already historically team-coded, like
  `nflverse/snaps`; `eraTeam()` must never be applied to it.

**Weekly in-season refresh:** `nflverse-depth.yml` runs Saturdays (unlike `nflverse/snaps`'
yearly-only cadence) — current-season QB1-change capture is the point of this family.

```sh
node bin/update.mjs depth --year 2013
node bin/update.mjs depth --year 2013 --dry-run
node bin/update.mjs depth            # current season
node bin/update.mjs depth --all      # backfill every season ≥ 2013
```

---

### `nflverse/rosterweekly/<year>.json`

Weekly roster status (absence classification, L5 Stage A), produced by
`bin/update.mjs rosterweekly [--year YYYY] [--all]` from `roster_weekly_<year>.csv` in the nflverse
`weekly_rosters` release. **Internal-only — the app never reads it.** It is consumed by
`scripts/update-nfl.mjs` through `lib/absence.mjs`.

```json
{
  "schemaVersion": 1, "season": 2025, "generatedAt": "…", "rowCount": 0, "playerCount": 0,
  "unmapped": 0, "weeks": [1, 2, 3],
  "players": { "11566": { "1": [["WAS", "ACT"]], "3": [["WAS", "INA"]] } }
}
```

`players[sleeperId][week]` is an array of `[team, status]` pairs sorted by team then status
(`status` verbatim from nflverse, `''` when empty). `rowCount` counts REG rows (mapped and
unmapped); `unmapped` counts rows with no resolvable `sleeper_id`. Files are written minified.
2012–2015 team codes are mapped to the schedule domain; those seasons' `status` is season-level
(see the catalog row), so they are ingested but never classified.

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

# Fetch nflverse PFR-sourced offensive snap shares (QB/RB/WR/TE/FB), re-keyed to sleeper_id
node bin/update.mjs snaps --year 2016
node bin/update.mjs snaps               # current season
node bin/update.mjs snaps --all         # backfill ≥ 2013

# Fetch nflverse weekly roster status (REG), keyed by sleeper_id — internal-only
node bin/update.mjs rosterweekly --year 2016
node bin/update.mjs rosterweekly        # current season
node bin/update.mjs rosterweekly --all  # backfill ≥ 2012

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
node bin/update.mjs snaps --year 2016 --dry-run
node bin/update.mjs rosterweekly --year 2016 --dry-run

# Force overwrite of a completed-season file (nfl/cfbd/roster/advstats/schedule/gamelogs/teamcontext/oline/snaps/rosterweekly)
node bin/update.mjs nfl --year 2023 --force
node bin/update.mjs roster --year 2024 --force
node bin/update.mjs advstats --year 2023 --force
node bin/update.mjs schedule --year 2023 --force
node bin/update.mjs gamelogs --year 2023 --force
node bin/update.mjs teamcontext --year 2023 --force
node bin/update.mjs oline --year 2025 --force
node bin/update.mjs snaps --year 2016 --force
```

### Module notes

Per-file behaviour that a session needs only when editing that file. The one-line index is
[CLAUDE.md → Navigation map](CLAUDE.md#navigation-map).

#### Ingest re-keying and `lib/io.mjs`

- **Re-keying.** `teamcontext`, `oline` and `playerstate` are TEAM- or date-keyed and read no crosswalk. The other
  uniform family ingests re-key to `sleeper_id`: `snaps` via `pfrId`, `depth` via `gsisId` primary with an `espnId`
  fallback on ESPN-era seasons, and the rest via `gsisId`.
- **`lib/io.mjs` exports:** `readJson`, `writeJsonStable`, `writeJsonStableAt` (same bytes at an absolute path), `setStepOutput`, `repoPath`, `stableHash`,
  `sortObjectKeys` (shallow) / `deepSortKeys` (recursive).

#### Analysis CLI flags

Neither analysis CLI is wired into `npm run smoke`, and neither is the snapshot grader.

`bin/backtest.mjs` — `--metric target_share|air_yards_share|wopr|racr|all` (camelCase also
accepted), `--position P`, `--from YYYY`, `--to YYYY`, `--min-games N`, `--controls`,
`--by-season`, `--json`, `--write`, `--validate`, `--inseason` (takes only `--json`/`--write`/`--dynasty`;
rejects every other flag — the windows and basis are pinned; `--dynasty` requires `--inseason`),
`--qb-takeover` (takes only `--json`/`--write`; rejects every other flag, `--dynasty` included), `--qb-rookie-level` (takes only `--json`/`--write`), `--absence` (takes only `--json`/`--write`), `--age-curve-gap` (offline; report-only; reads no outcome season; takes only `--json`/`--write`), `--dynasty-history` (S3b; offline analysis, not the snapshot grader; takes only `--json`/`--write`; rejects every other flag; `--write` persists `backtests/<date>-dynasty-history-panel.json` + `grading/<date>-dynasty-history-verdict.md`, unregistered; exit 1 on a stop — pre-registration hash mismatch, birthdate coverage < 95% in a headline cohort, an in-progress outcome season, a missing snaps file 2013–2025, a measured peak age off §8.11's table, a panel > 15 MB), `--dynasty-rework` (S4a; offline research, not the snapshot grader; takes only `--json`/`--write`/`--probe`; rejects every other flag; four fixed candidate reworks of the veteran dynasty score fitted out of sample on the S3 panel's rows, with a pre-registered `S4A-WIN`/`S4A-NO-WIN` verdict; reads `nflverse/playerids.json` and `raw/-players-nfl.json` from rev `a791db0` through `git show`; `--probe` is allowed only once the hash is pinned and prints counts and timings only; `--write` is run once and persists `backtests/<date>-dynasty-rework-panel.json` + `grading/<date>-dynasty-rework-verdict.md`, unregistered; exit 1 on a stop — prereg hash mismatch, S3 parity difference, birthdate coverage < 95% in a headline cohort, an in-progress outcome season, a panel > 15 MB), `--games-calibration [--cause | --short]` (takes only `--cause`/`--short`/`--json`/`--write`; `--cause` or `--short` alone is rejected; `--cause` and `--short` are mutually exclusive).

`bin/panel.mjs` — `--from/--to YYYY`, `--attribution current-team|per-season-team`,
`--basis in-basis|half_ppr|league` (`league` is `--fit` only, report-only), `--scoring-from YYYY-MM-DD`, `--min-games N`, `--ridge X`,
`--flip-gate`, `--fit`, `--alpha X`, `--json`, `--write`, `--fullpipeline`, `--rookie`,
`--regression-model legacy|step4-upside` (with `--fit`/`--fullpipeline` only; default
`step4-upside`). `--fit` defaults `--basis` to
`half_ppr` (the pre-switch basis of store-served `careerStats`) while every other mode keeps
`in-basis`, and it **rejects an explicit `--attribution`** because it pins `per-season-team` —
the app's live default, load-bearing for the reconstruction.

Writes land in `backtests/` (`<date>-<metric>-<pos>.json`, `<date>-e0a-{panel,fit}.json`,
`<date>-r2flip-*`, `<date>-r3fit-*`, `<date>-inseason-{panel,constants}.json`,
`<date>-inseason-dyn-{panel,constants}.json`, `<date>-qb-takeover-{panel,constants}.json`, `<date>-qb-rookie-level-{panel,constants}.json`, `<date>-absence-panel.json`, `<date>-games-calibration-{panel,constants}.json`, `<date>-games-cause-{panel,constants}.json`, `<date>-games-short-{panel,constants}.json`) and `grading/`
(`<date>-*-verdict.md`, incl. `<date>-inseason-verdict.md`, `<date>-inseason-dyn-verdict.md`, `<date>-qb-takeover-verdict.md`, `<date>-qb-rookie-level-verdict.md`, `<date>-absence-verdict.md`, `<date>-games-calibration-verdict.md`, `<date>-games-cause-verdict.md`, `<date>-games-short-verdict.md`, `<date>-age-curve-gap.md`, `<date>-dynasty-history-verdict.md`, `<date>-dynasty-rework-verdict.md`).
Methodology: [Analysis / Backtesting](#analysis--backtesting).

#### `lib/panel.mjs` — dispatch lists and the in-season seams

`D6_NEW_FACTORS`/`FULL_FACTORS_D6`/`ENVELOPE_FACTORS_D6_ADDITIONS` are `attachFactorMultipliers`' OWN dispatch list for six D6a-added factors (age/depth/teamOffense/qbQuality/efficiency/compBlend) — deliberately NOT folded into `FULL_FACTORS`/`ENVELOPE_FACTORS` (those stay the R3-FIT calibration engine's 7-factor set).

`attachFactorMultipliers`' ctx carries two optional in-season backtest seams (`bin/backtest.mjs --inseason`): `requirePositiveOutcome` (default `true`; `false` skips only the `nonPositiveOutcome` drop) and `depthOrderOf(pid, position, lastQSeason, lastQTeam)` (default `null`; replaces the Step 8 depth-order lookup, with the sentinel/coverage bookkeeping unchanged). The two in-season seams' defaults reproduce every committed artifact byte-for-byte; `depthModel` (below) is the exception. `scripts/panel-run.mjs`'s `loadFactorInputs` / `buildFactorContext` are the loading and ctx blocks of `assemblePanel`, extracted so `scripts/inseason-run.mjs` reuses them rather than forking. `resolvePosition` gains a season-independent crosswalk fallback (D6a finding 2); `resolveSnapCounts` is the R1-SNAPS fallback (finding 3). `compBlend` is a stated architecture deviation — a synthetic ratio factor, since the app's comp blend is a post-hoc convex combination, not a multiplier. The ctx also carries `depthModel` (qb-inseason-refit; `legacy` | `qb-takeover`, default `qb-takeover`, unknown throws, stamped into `fitCoverage.depthModel` like `regressionModel`): `legacy` is the flat 1.05/0.88/0.68 depth step at every position, `qb-takeover` makes a QB at order 1 ×1.05 and any other QB ×1.00. `scripts/panel-run.mjs` threads it through `buildFactorContext`/`assemblePanel`/`runFit`/`runFullPipeline` (stamped `meta.depthModel`) and `bin/panel.mjs` gains `--depth-model` (`--fit`/`--fullpipeline` only); `legacy` reproduces artifacts committed before the flag.

`scripts/panel-run.mjs` panels (R3-FIT, D-12 and the rest) re-run on the corrected season-totals read the new `dnpWeeks`/`absenceSegments` (`lib/panel.mjs:1606,1967`, `scripts/panel-run.mjs:1371`), so their outputs are not comparable with verdicts dated before absence-classification.

#### The poisoned-snapshot window (2026-07-16 → 2026-07-18)

App snapshots written in this window carry ~½-scale `teamRzShare` and `shareVolatility`, captured
before the share-denominator fix (app, 2026-07-18) corrected the doubled `TEAM_*` denominator.
Those fields are unreliable at absolute scale in that window; exclude or correct them in the 2026
grading run.

The same doubled-denominator root cause was present in `lib/panel.mjs`'s
`buildTeamTotalsForSeason` and was corrected separately on 2026-08-08 (entity filter). The
retrospective E-0a/flip panels reconstruct from season-totals rather than snapshots, so that fix
corrects the panel builder — **not** the snapshot window, which remains a forward-grading
exclusion.

#### `lib/validate.mjs` — self-calibrating full-season floor

`validateNflSeason`'s full-season floor is not a fixed constant. It computes
`fullSeasonThreshold = Math.max(1, maxGames - 3)`, where `maxGames` is the season file's own
observed maximum `gamesPlayed`, and requires at least 30 players at or above it
(`lib/validate.mjs:123–127`). A complete season (`maxGames = 17`) yields a threshold of 14 —
numerically identical to the old fixed floor — while a partial in-season file yields a lower
threshold instead of throwing on every run before week 14. Rationale:
`sleeper-dashboard/.claude/tasks/in-season-season-totals.md` §2.1 (sibling repo).

#### `scripts/update-nfl.mjs` — the two scheduled-path guards

Both are pure and exported for direct unit testing.

- `hasNoData(weekData)` — Sleeper serves 0 entries across all 18 weeks before a season starts.
  The guard exits cleanly rather than letting the <400-player floor throw (§2.2).
- `shouldSkipCompletedSeason({ inProgress, force, dryRun })` — a completed season on the
  scheduled path **skips** rather than risking the write path. The older refusal guard tested the
  manifest's stale `existingEntry.inProgress` and could still write a sealing regression on the
  first run after `state.season` rolls over; see the fix's own header comment in the file.
  `--force` still overrides for a deliberate interactive correction, and `--dry-run` stays exempt
  so a completed season can be previewed without `--force` (§2.3).

**Absence classification (CR-28).** After `aggregateWeeks`, every run — in-progress, `--force` and
`--dry-run` — reads `nflverse/rosterweekly/<year>.json` and applies `lib/absence.mjs`'s
`classifyAbsences` (seasons ≥ 2016 only; below that the file is never read). A run without it would
turn already-classified `'D'` back into `'X'`, so a missing roster file **throws** for a completed
season, for `--force`, and for an in-progress season whose file already exists; only an in-progress
season's first file (no season file yet) warns and writes unclassified. The bye inference above stays
forward-only; classification does not.

`--year` is optional: when omitted the live season resolves via `fetchCurrentNflSeason()` and is
surfaced with `setStepOutput('season', …)` for the workflow's Invariant 8 purge URL — matching
`update-teamcontext.mjs` and `update-schedule.mjs` (§2.4). `DEFAULT_DEPS` is an injectable
I/O + fetch surface mirroring `scripts/panel-run.mjs`'s `DEFAULT_LOAD` pattern, so
`updateNfl({ …, deps })` can be control-flow-tested without touching the network or the real repo
file tree. Section references are to
`sleeper-dashboard/.claude/tasks/in-season-season-totals.md` (sibling repo).

#### `lib/absence.mjs` — weekly-roster absence classification

Pure, no I/O. `classifyAbsences(totals, rosterWeekly, { season })` decides `'X'` vs `'D'` with one
roster predicate, in both directions (D-76). For a slot with at least one `nflverse/rosterweekly`
listing that week, `missed` = some listing has a status in `MISSED_ROSTER_STATUSES` (`ACT`, `INA`,
`RES`, `PUP`) on a team that played. An `'X'` slot with `missed` becomes `'D'` (Sleeper's weekly
response omitted a rostered player); a `'D'` slot without `missed` becomes `'X'` (a role week —
practice squad `DEV`, `CUT`, `EXE`, `E01`, `E14`, `TRC`, `TRD` — that Sleeper returned with `gp 0`; not a
missed game). A slot with **no** listing that week is left as Sleeper wrote it in both directions:
`validateRosterWeekly` admits a week with as few as 24 teams, so "no listing" can mean "team missing from
the file". "Played" is read from the season file's own `TEAM_*` rows (`'P'` in `weeklyStatus`), not the
schedule, so a bye or a not-yet-played week never converts. `'P'`/`'B'`, `TEAM_*` rows and every stat
field are untouched. A changed row gets `dnpWeeks` ± per slot and a recomputed `availability`; the input
is never mutated and unchanged rows keep their reference. Returns `{ totals, changedSlots, changedRows,
byStatus, promotedSlots, demotedSlots, demotedByStatus }` (`changedSlots` = promoted + demoted; `byStatus`
keys promotions by the matching missed status; `demotedByStatus` keys demotions by the slot's distinct
statuses, sorted and `+`-joined, e.g. `CUT+DEV`). Seasons before `MIN_ABSENCE_CLASSIFY_SEASON = 2016`
return the input as-is (the weekly status is season-level there). A missing `rosterWeekly` throws — the
caller decides what an absent file means.

#### `lib/dynastyMirror.mjs` — offline mirror of the app's dynasty score (CR-32)

Pure, no I/O. Ports, at app `95ba1e1`, `computeDynastyScore` (all paths A–A4, B, C), `computeEmpiricalAgeCurves`,
`computeTeamContext` / `computeHistoricalTeamTotals` / `computeHistoricalShares` / `computeShareTrend`, the prospect
score, the label, momentum, consistency, the breakout / bounce-back / TD-reliance flags and the QB-quality modifier;
`composeDynastyScore(raw)` recomposes a Path B/C score from the additive `raw` key. It reuses `lib/durabilityMirror.mjs`
(`classifyInjurySeason`) and `lib/projectionFactors.mjs` (`interpolateAgeCurve`). Deliberate differences: the curve builder
takes `currentYear` instead of the wall clock; per-season-team `teamContextMirror` skips `TEAM_*` ids (the app never runs
that mode); `options` carries three ablation seams (`targetShareOverride`, `shareTrendBoostOff`, `reliabilityMix`), all
defaulting to the app. `test/dynasty-mirror.test.mjs` (T-G1) proves parity against goldens made by the app's own code
(`test/fixtures/dynasty-mirror-parity/`, built by the app's `scripts/verify/dynasty-golden.mjs`; inputs by
`scripts/fixtures/build-dynasty-mirror-inputs.mjs`). Offline analysis: no served file reads it.

#### `scripts/dynasty-asof.mjs` — as-of-season-S inputs for the mirror

`buildAsOfInputs(load, S, { curveAgeMode, gamesMode })` rebuilds what the app would have had at the end of S. Every
season-keyed read goes through `asOfLoad(load, S)`, which throws `LookAheadError` for a year above S; S = 2026 is refused
(in progress). Deliberate differences from the app, each reported with the results that use them: left-truncated history
(2012…S); true ages on `(S+1)-06-01` from `nflverse/playerids.json` birthdates (Sleeper's `age` is stale for players without
a team); derived `years_exp` (draftYear, else first season with games); the 2026 positions applied to every S; per-season-team
attribution; the end-of-regular-season depth chart; no draft pick, KTC or live level. `curveAgeMode: 'app-sleeper'` rebuilds
the curves from the 2026-05-18 Sleeper ages (carries post-S information); `gamesMode: 'snaps'` substitutes nflverse snap
games under the D-77 name guard. `readTeamS1` is the one S+1 read, and returns only a team string.

#### `scripts/age-curve-gap-run.mjs` — `--age-curve-gap`

Report-only (`bin/backtest.mjs --age-curve-gap [--json] [--write]`; reads no outcome season): today's app age curves
(Sleeper ages) against the same curves from birthdates, the row-level age gap, and how many current players' age-adjusted
component and mirror score would move under (a) app today, (b) curve fix only, (c) full fix. `--write` persists
`grading/<date>-age-curve-gap.md` (unregistered). No recommendation: the priority of the age fix is Anton's decision.

#### `scripts/dynasty-history-run.mjs` — `--dynasty-history`

S3b, the dynasty score's first historical test (task `.claude/tasks/dynasty-history-backtest.md`). For S = 2015–2024 it
rebuilds every veteran's score from S3a's as-of inputs (`scripts/dynasty-asof.mjs`, `lib/dynastyMirror.mjs`; neither is
changed) under both games definitions (Sleeper `gamesPlayed`, season-level snaps), grades it against the next three
seasons' league-rescored PPG (M1 = mean over qualifying seasons, M2 = missed seasons as 0), and reports per-position
within-cohort Spearman, HR@12/@24, the baselines B1/B2, age-band bias, leave-one-component-out, ablations, the age-curve
comparisons, the practice-squad diagnostic and per-cohort tables, with player-clustered bootstrap CIs (4,000, seed 12345).
The §8 pre-registration is hashed from the task file and pinned as `DYNASTY_HISTORY_PREREG_SHA256`; a run stops on a
mismatch. The verdict uses only the §8.9 labels and never proposes a weight, constant or curve. Offline: no served file,
no manifest entry, nothing reaches the app. Exports: `DYNASTY_HISTORY_LOAD`, `preregHash`, `metricKey`/`parseMetricKey`,
`buildRows`, `computeMetrics`, `runDynastyHistory`, `buildDynastyHistoryVerdictMarkdown`, `buildBacklogAppends`,
`writeDynastyHistoryArtifacts`, `dynastyHistoryMain`. A full run takes ~30 minutes.

#### `lib/dynastyRework.mjs` and `scripts/dynasty-rework-run.mjs` — `--dynasty-rework`

S4a, the veteran dynasty score rework (task `.claude/tasks/dynasty-rework-s4a.md`; §4–§5 hashed and pinned as
`DYNASTY_REWORK_PREREG_SHA256`, checked first by every real-data entry point). `lib/dynastyRework.mjs` is pure: the four
candidate scores (K0 reweight of today's components; K1 two-year level without trajectory; K2 K1 + forward aging with a
β-grid; K3 K2 + no share-trend boost for movers, report-only and never selectable), the integer-twentieths weight grid
fit, the fold plans, selection, age tilt and the decision rule. The adapter rebuilds S3's H rows for S = 2015–2024
(`sleeper` games; playerids and raw players pinned to rev `a791db0`), stops unless they match the S3 history panel row
for row, runs buffered leave-one-cohort-out folds (fit cohorts at least 3 seasons from the test cohort), scores each
test cohort out of fold, and reports ρ vs the baselines, the age tilt, exploratory candidate rows, the fold table, the
in-sample final model, forward-only and short-horizon robustness and an outcome-free 2025 preview. Uncertainty: 4,000
player-clustered resamples, seed 12345, with fitted weights held fixed per fold. Offline research: no app file, no
registry entry, no manifest entry. `--probe` builds cohorts 2015 and 2018, prints counts and timings only and a runtime
projection; `--write` is run once. Exports: `DYNASTY_REWORK_LOAD`, `makeReworkLoad`, `preregHash`, `assertPrereg`,
`readQbFloor`, `buildReworkRows`, `checkS3Parity`, `runFolds`, `runFinal`, `computeReworkMetrics`, `runDynastyRework`,
`runProbe`, `buildDynastyReworkVerdictMarkdown`, `writeDynastyReworkArtifacts`, `dynastyReworkMain`.

#### `lib/ageCurveVariants.mjs` — S3b's guarded and within-player age curves

Pure, no I/O. `guardedAgeCurves` is `empiricalAgeCurvesMirror`'s loop with one change: the derived peak age ignores age
buckets under `PEAK_GUARD_MIN_ROWS` (30) rows (with `minRows: 0` it deep-equals the mirror). `deltaAgeCurves` builds the
A-AGE-DELTA curve: the mean year-to-year PPG change by age, chained from H's best-populated age. Both return the four-key
curve bundle the mirror takes, plus counts / fallback / floored diagnostics.

#### `lib/durabilityMirror.mjs` — offline mirror of the app's durability rules

Pure, no I/O; used only by `bin/backtest.mjs --absence` (`scripts/absence-run.mjs`), `--games-calibration`, `--games-calibration --cause` and `--games-calibration --short`. It mirrors, at
app `d627562` (CR-28), the veteran projected-games rule (`src/utils/durabilitySignals.js`;
`seasonProjection.js` Step 1 qualifying seasons/weights and Step 6), the bounce-back predicate
(`projectionSignals.js` `computeBounceBackFlag`) and the dynasty `injurySeasonCount`
(`dynastyScore.js`). Every function takes a `throughSeason` and reads a season-filtered view of
`careerStats`, so as-of-S+1 the app's missing S+1 row reads as absent. The contributor test follows
the app **code** (any one of snap share, starts, volume suffices — a below-floor snap share falls
through), not its header comment. `test/durability-mirror.test.mjs` pins parity against
`test/fixtures/durability-parity-2026-10-04.json` (pre-correction inputs at data `4f469cc`, built by
`scripts/fixtures/build-durability-parity.mjs`): ≥ 99% of the 2026-10-04 snapshot's veteran rows must
match on `projectedGames`, `injurySeasons` and `absenceShapeFactor` (compared at the app's own
`Math.round(x·1000)/1000`). A change to those four app sites stales the mirror silently.
`projectedGamesFor` also returns `avgGames`, the value just before `Math.round(clamp(…, 8, 17))`
(DM-4 pins that); `--games-calibration` calibrates it. It also returns `recent` — the qualifying seasons
behind the weighted base (`{ season, gamesPlayed, w }`) — an offline-only additive field the L6b season-length
factor reads; `projectedGames`, `avgGamesBase` and `avgGames` are unchanged by it.

#### `lib/gamesCalibration.mjs` — projected-games decomposition and held-out calibration

Pure, no I/O; the fit core of `bin/backtest.mjs --games-calibration`
(`scripts/games-calibration-run.mjs`, L6). Offline analysis only: no served file, no manifest entry,
no registry entry. It answers two questions about the mirrored veteran `projectedGames` rule on
Stage B's panel (`buildPanel`, before = after = the post-correction store). **Q-A:** `accountWeeks`
classifies each team-game week of S+1 (the week sits in the S+1 `TEAM_*` rows' played set) as played
or by the player's rosterweekly status — reserve, inactive, active-not-playing, practice squad, other
status, off roster — so `pred − outcome` splits exactly into schedule, composition, role, injury list
and a reconciliation term. **Q-B:** multiplicative-scale candidates `round(clamp(avgGames × k, floor, 17))`,
k fitted per cell (position; × age bucket; × S-row state; both; floor 8 or 0) on training SSE over an
integer-hundredths grid, forward-chained over predictor season, compared to the app rule on pooled
out-of-sample rows with a player-clustered paired bootstrap. `decide` applies the pre-registered
rule under both squared error and MAE and prints W / N / S per rule; the choice stays with Anton, and
a wiring slice (an app `seasonProjection.js` Step 6 change, CR-28) is planned separately.
`--write` persists `backtests/<date>-games-calibration-{panel,constants}.json` and
`grading/<date>-games-calibration-verdict.md`. Exit 1 if DM-1 parity falls below 99% or the snapshot
is missing (nothing written).

**L6b — `--games-calibration --cause`** (`scripts/games-cause-run.mjs`; offline, no served file).
L6's winner (C3f0) cut injured starters, so L6b splits the short S season by *cause* and adds relevance and
season length as fit dimensions. `causeStates` gives three pre-registered definitions: **K1** app-native
(`short-inj` = the mirrored `classifyInjurySeason` as of S, else `short-oth`), **K2** roster-only (S-season
slots by rosterweekly status: injured = RES/PUP, bench = INA + ACT-not-playing, cut = DEV + off roster +
other) and **K3** (K2, but a contributor's INA/ACT-not-playing slots count as injury); K2/K3 are `unk` for
S < 2016. `rel3Of` marks top-N in any of S, S−1, S−2; the judged cohorts are `relevant`, `star` (rel3 and
S-state ≠ qual) and R\* (their union). `avgGamesSeasonLength` rescales each recent qualifying season to the
outcome season's length (16 vs 17 games). `CAUSE_CANDIDATES` (K1f0 … RK3f0L, plus the no-fit L0 and L6's
C3f0 as a reference) share the generalised `cellKey` chain machinery; `causeEligibility` applies gates
G1–G5 at δ ∈ {0.10, 0.25, 0.50} of relevant-MAE non-inferiority and `decideCause` walks `CAUSE_TIERS`
(app-native before roster-cause; a later tier needs a paired R\* ΔMAE CI below 0; C3f0 is never picked).
`--write` persists `backtests/<date>-games-cause-{panel,constants}.json` (constants nested by level) and
`grading/<date>-games-cause-verdict.md`. A K2/K3 pick would need a new served roster-cause signal (the app
never reads rosterweekly); the choice stays with Anton.

**L6c — `--games-calibration --short`** (`scripts/games-short-run.mjs`; offline, no served file). L6b showed
the fitted candidates' gain sits on short-season rows (star MAE 7.00 → ~5.3) and their loss on qualifying ones
(relevant ΔMAE +0.40…+0.53). L6c keeps the **app prediction (`r.pred`) on every qualifying S-season** and fits k
only on **non-qualifying** rows, at floor 0: `SOf0` (position × S-state `short`/`none`) and `SOK1f0` (the same with
L6b's K1 `short-inj`/`short-oth`/`none`). The chain's root `pos` is the pooled non-qualifying k, so thin cells never
fall back to an all-rows k. Rows, folds, cohorts, δ ∈ {0.10, 0.25, 0.50} and the bootstrap are L6b's
(`buildCauseRows`, `causeVeterans`); C3f0 and K1f0 are refitted on all rows in the same folds as tabled references
and never picked. Gates: **G1** relevant ΔMAE CI upper bound ≤ δ, **G3** star ΔMAE CI upper bound **< 0**
(strict), **G4** all-veteran ΔMSE CI upper bound < 0, **G5** no position whose relevant ΔMAE CI lower bound > δ;
**G2 (relevant bias) is reported, not gated** (qualifying rows are untouched by construction). `decideShort`
walks SOf0 < SOK1f0 (K1 replaces SOf0 only on a paired R\* ΔMAE CI below 0); (W) recommends a wiring slice, (N)
recommends closing L6 with no change. `--write` persists `backtests/<date>-games-short-{panel,constants}.json`
and `grading/<date>-games-short-verdict.md`. Not an independent confirmation: the candidates and gates came from
L6b's breakdown of the same panel; the first clean test is forward grading.

#### `lib/nflverse.mjs` — floors vs. bands

The `MIN_*` constants are **coverage floors** and encode historical coverage — they are CR-18
trigger sites, so changing one is a signal-registry event. `AY_PER_TARGET_MIN` / `MAX` are
different: an air-yards-per-target plausibility **band** shared by `validateAdvStats` and
`validateGameLogs`, not a coverage floor. `lib/args.mjs`'s `MIN_CLI_YEAR = 1999` is a third thing
again — a CLI typo-sanity bound, deliberately not imported from here.

#### `lib/cfbd.mjs` — deterministic pivot output

`pivotCfbdRows` is the long-form→pivoted-envelope transform, shared by `scripts/update-cfbd.mjs`
(ingest) and `scripts/migrate-college-pivot.mjs` (the one-shot rewrite) so the two cannot drift
apart. It re-keys `players` into **ascending-numeric `playerId` order**, which makes the written
bytes deterministic regardless of the order CFBD returns the rows in: a byte-identical dataset
fetched in a different row order must not produce a spurious rewrite, commit and CDN purge. This
is separate from `update-cfbd.mjs`'s `cfbdHash` dedup, which is already order-insensitive because
it hashes through `deepSortKeys`. Stated as JSDoc at `lib/cfbd.mjs:63-66`.

#### `scripts/migrate-*.mjs` — one-shot rewrites

An in-place rewrite of a completed `nfl/season-totals` file triggers CR-30 — bump the app's `SEASON_TOTALS_CACHE_REVISION` and push it after the purge verifies and raw GitHub serves the new bytes ([git-workflow.md](git-workflow.md) step 5); a new season-totals `migrate-*` adds itself to CR-30's Data field.

- `migrate-f24-prune.mjs` — drops `idp_*`/`punt*` from every completed season file, minifies,
  bumps the manifest to `schemaVersion` 4. Invariant 1 exception; rationale in commit `2b06c5b`.
- `migrate-absence-roster.mjs` — Invariant-1 correction #3 (absence-classification, CR-28): for every
  completed 2016+ `nfl/season-totals/<year>.json` runs `classifyAbsences` against its
  `nflverse/rosterweekly/<year>.json` and rewrites **only** `weeklyStatus` `'X'` → `'D'`, `dnpWeeks`
  and `availability`, in place (never a Sleeper re-fetch — that would also pull unrelated stat
  corrections and re-run CR-02's dominant-team rule). Guards throw on any other field change, any
  non-`'X'`→`'D'` slot change, a `dnpWeeks` mismatch or a `validateNflSeason` failure; manifest entries
  of changed seasons get `schemaVersion: 4`. `--dry-run` reports only; idempotent; skips `inProgress`
  seasons (the next `update-nfl` run classifies those). One-way — the Sleeper-only baseline is gone, so
  narrowing the status set needs a forced re-fetch. Superseded by `migrate-absence-role.mjs` (#5): once #5
  is on disk a re-run is a no-op; against files not yet rewritten it throws at its `'X'`→`'D'`-only guard.
- `migrate-absence-role.mjs` — Invariant-1 rewrite #5 (D-76, CR-28/CR-30; entry point `migrateAbsenceRole`):
  runs the two-direction `classifyAbsences` over every completed 2016+ season and rewrites **only**
  `weeklyStatus` `'D'` → `'X'` (role weeks), `dnpWeeks` and `availability`, in place. Eight guards
  (`assertRoleGuards`: id set, other fields deep-equal, only `'D'`→`'X'`, independent roster
  re-derivation, `dnpWeeks` delta, derived `availability`, `validateNflSeason`, idempotence). Three
  modes, each requiring `--report <basePath>` (relative → under `verification/`, absolute → outside the
  repo; refuses to overwrite): `--dry-run --out-dir <abs dir outside repo>` writes would-be season files
  there and no repo data; bare `--report` rewrites in place + manifest (Stage B); `--report-only
  --before-rev <rev>` writes only the report (before = `git show`). The report is a field-level leaf diff,
  `{ meta, seasons, totals }` JSON + MD.
- `migrate-weekly-stats.mjs` — Invariant-1 rewrite #4 (weekly-scoring-keys, D-47): re-fetches 2012–2025
  through a required `--weeks-cache <dir>` (outside the repo; the same raw weeks the `--weekly-basis`
  grade scored) and adds `weeklyStats` **only**. `attachWeeklyStats` attaches a fresh row's field iff it
  exists, its `'P'` weeks and `weeklyPoints` equal the stored row's and the kept keys sum to the stored
  `stats`; otherwise the row is left unchanged (reason `missing`/`weeks`/`points`/`sums`). Guards throw
  on a changed id set, any non-`weeklyStats` field change, > 0.5% omitted rows, a `validateNflSeason`
  failure, or a non-idempotent re-derivation. `recordCount` and `schemaVersion: 4` unchanged;
  `--dry-run` reports only. Ran 2026-10-15: 28,151/28,151 rows attached.
- `migrate-college-pivot.mjs` — rewrites all 27 `college/{passing,receiving,rushing}/<year>.json`
  files from a long-form row array to the pivoted player-keyed envelope via `lib/cfbd.mjs`
  `pivotCfbdRows`, bumping `schemaVersion` to 2 and setting `recordCount` to the player count.
  Idempotent (skips an already-pivoted file); a pure local transform with no network.
  `scripts/verify-college-pivot-roundtrip.mjs` is the one-shot proof script — deliberately not a
  committed test, because its **output** is committed instead, at
  `verification/college-pivot-phase-b-roundtrip-proof.txt`. Full accounting: the CFBD college
  stats row in [data-catalog.md](data-catalog.md), which is where Invariant 1 points.

#### `scripts/update-playerstats.mjs` — single-fetch orchestration

Fetches `stats_player_week_<year>.csv` once and drives both `updateAdvStats` and `updateGameLogs`
off the shared csv/`currentSeason` (each script's §3.1 injection seam), isolating a per-family
throw so neither blocks the other, and surfacing `advstats_ok` / `gamelogs_ok` step outputs for
the workflow's path-scoped commit. See `.claude/tasks/playerstats-single-fetch.md` §3.3.

#### `scripts/purge-cdn.mjs` — verified jsDelivr purge

`purgeAndVerify` purges `@main/<path>` then checks the CDN serves what was pushed. Freshness: a path
passes when the CDN body's SHA-256 equals the local file's. `manifest.json` is **not** purged or
verified and is rejected as a path (the app reads it from raw GitHub, CR-29); at least one family
path is required. Schedule: up to 5 attempts with sleeps of
15/30/60/90/120 s before each verify; later attempts re-purge only still-failing paths. A final
unconditional re-purge sweep covers any stale fill from the push→purge gap (failure there only
warns). Missing local family files are skipped with a warning; anything unverified ends the run
red. `bin/purge-cdn.mjs` is the CLI. See `.claude/tasks/cdn-purge-verify.md`.

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

**Only test files live under `test/`.** `npm test` is bare `node --test`, which executes every `.mjs` under `test/` as a test file, not just `*.test.mjs`. Test helpers go in `test-support/`; fixture builders go in `scripts/fixtures/` (they read `git show <rev>`, which a shallow CI checkout cannot serve) and write their output into `test/fixtures/`. `test/test-layout.test.mjs` enforces this.

### GitHub Actions

| Workflow | Trigger | What it does |
|---|---|---|
| `weekly-ktc.yml` | Monday 13:17 UTC, retries Tue + Wed 13:17 + `workflow_dispatch` | A scheduled run first checks `ktc/last-checked.json` (`ktcWeekStep`) and no-ops if this week (Monday 00:00 UTC on) already has a clean, non-quarantined check, so the retries only capture when Monday did not. Runs `node bin/update.mjs ktc`; per-row + Spearman-ordering + QB-count landscape integrity guards; commits the new snapshot (or a quarantined one under ktc/quarantine/ for review) if changed, purges jsDelivr CDN cache; fails the run if a snapshot was quarantined |
| `weekly-nflverse-roster.yml` | Tuesday 13:23 UTC + `workflow_dispatch` | Runs `node bin/update.mjs roster`, commits if content hash changed, purges jsDelivr CDN cache for changed files |
| `nfl-season-totals.yml` | Fri, Mon, Tue 06:13 UTC + `workflow_dispatch` | Runs `node bin/update.mjs nfl` (no `--year` — the live season is resolved inside the script via `fetchCurrentNflSeason()`), commits if content hash changed, purges jsDelivr CDN cache; delegates to `_ingest.yml`. Each run lands a game window hours after it ends; between Friday and Tuesday the file holds a partly played current week (CR-21); its sparse-checkout cone includes `nflverse/schedule` for D-1's in-season bye inference |
| `nflverse-draft.yml` | May 1 12:00 UTC + `workflow_dispatch` | Runs `node bin/update.mjs draft`, commits if content changed, purges jsDelivr CDN cache |
| `nflverse-playerids.yml` | Wednesday 13:29 UTC + `workflow_dispatch` | Runs `node bin/update.mjs playerids`, commits if content hash changed, purges jsDelivr CDN cache |
| `nflverse-schedule.yml` | Friday 13:35 UTC + `workflow_dispatch` | Runs `node bin/update.mjs schedule` (current season), commits if content hash changed, purges jsDelivr CDN cache |
| `nflverse-playerstats.yml` | Tuesday 10:47 + Saturday 13:47 UTC + `workflow_dispatch` | Runs `node bin/update.mjs playerstats` (current season, after playerids) — fetches `stats_player_week_<year>.csv` ONCE and drives both advstats + gamelogs off it; per-family error isolation, path-scoped commit (only the families that completed), purges jsDelivr CDN cache for the committed families |
| `nflverse-teamcontext.yml` | Sunday 13:53 UTC + `workflow_dispatch` | Runs `node bin/update.mjs teamcontext` (current season), commits if content hash changed, purges jsDelivr CDN cache |
| `weekly-playerstate.yml` | Saturday 14:11 UTC + `workflow_dispatch` | Runs `node bin/update.mjs playerstate`; content-hash dedup (excluding churning `newsUpdated`/`searchRank` fields); commits the new dated snapshot if changed, purges jsDelivr CDN cache |
| `nflverse-oline.yml` | Saturday 14:37 UTC + `workflow_dispatch` | Runs `node bin/update.mjs oline` (current season), commits if content hash changed, purges jsDelivr CDN cache |
| `nflverse-snaps.yml` | Feb 15 14:05 UTC + `workflow_dispatch` | Runs `node bin/update.mjs snaps` (current season) — yearly, post-season; no in-season weekly refresh for this family. Commits if content hash changed, purges jsDelivr CDN cache; delegates to `_ingest.yml` |
| `nflverse-depth.yml` | Saturday 14:50 UTC + `workflow_dispatch` | Runs `node bin/update.mjs depth` (current season) — weekly, in-season (unlike `nflverse-snaps.yml`'s yearly cadence: current-season QB1-change capture is the point). After the Wednesday playerids job (crosswalk) and the Friday schedule job (upstream week derivation, ESPN-era). Commits if content hash changed, purges jsDelivr CDN cache; delegates to `_ingest.yml` |
| `nflverse-rosterweekly.yml` | Daily 06:23 UTC + `workflow_dispatch` | Runs `node bin/update.mjs rosterweekly` (current season) — daily, after upstream's observed ~06:02 UTC refresh of `roster_weekly_<year>.csv`. Internal-only family (never read by the app); `scripts/update-nfl.mjs` classifies absences against it from absence-classification-c (CR-28), so the 06:13 Mon/Tue/Fri season-totals run reads the previous morning's file. Commits if content hash changed, purges jsDelivr CDN cache; delegates to `_ingest.yml` |
| `cron-deadman.yml` | Daily 05:19 UTC + push to `main` + `workflow_dispatch` | Runs `node bin/deadman.mjs`; monitoring only — no writes, no manifest touch |
| `smoke-test.yml` | PR touching `bin/`, `lib/`, `scripts/`, `package.json`, `enrichment/`, or `.github/workflows/` | Runs the nfl/cfbd/ktc/playerids/advstats/gamelogs dry-runs, validates enrichment, and npm test (unit validators) |
| `daily-snapshot.yml` (D1b, phase 1) | `workflow_dispatch` only — **no `cron:` line yet**, see CR-22 below | Checks out this repo plus a pinned ref of `antonwilms/sleeper-dashboard` into `app/`, builds and `vite preview`s the app headlessly, drives it with Playwright (localStorage-seeded, no UI interaction), reads the projection snapshot it wrote to IndexedDB, runs it through the commit gate (`lib/snapshot-capture.mjs`) and writes+registers+commits `snapshots/<date>.json` only on acceptance; purges and verifies the new snapshot path on jsDelivr (the capture's `snapshotPath` step output; `manifest.json` is not purged, CR-29). Rejects loudly (non-zero exit, no commit) rather than writing a neutral snapshot — see Cross-repo impact CR-01 below and `.claude/tasks/daily-snapshot-capture.md` |
| `_ingest.yml` | `workflow_call` (reusable — no schedule of its own) | Shared body for the eleven uniform ingest jobs: sparse checkout (per-caller cone input), `npm ci`, `node bin/update.mjs <subcommand>`, commit + CDN purge. Callers: `weekly-nflverse-roster.yml`, `nfl-season-totals.yml`, `nflverse-draft.yml`, `nflverse-playerids.yml`, `nflverse-schedule.yml`, `nflverse-teamcontext.yml`, `nflverse-oline.yml`, `nflverse-snaps.yml`, `nflverse-depth.yml`, `nflverse-rosterweekly.yml`, `weekly-playerstate.yml`. Not used by `nflverse-playerstats.yml`, `weekly-ktc.yml`, or `daily-snapshot.yml` — see the file's own header for why |

The weekly KTC workflow commits only when content changes (SHA256 hash dedup). If values are identical to the last snapshot, it writes `ktc/last-checked.json` only and produces no commit. If the ordering guard or the QB-count landscape check trips, the scrape is written to `ktc/quarantine/` with a `.reason.json` sidecar instead of `ktc/`, and the run fails so it can be reviewed and promoted manually.

Every committing workflow purges through `bin/purge-cdn.mjs`, and a CDN that still serves old bytes after ~5 min of retries per phase fails the run (family files only: `manifest.json` is not purged, the app reads it from raw GitHub, CR-29).

*Season-keyed purges (roster, advstats, schedule, gamelogs, teamcontext) derive the file's NFL season from the node update step via a `season` step-output (`GITHUB_OUTPUT`), not `date -u +%Y` — the two diverge in the Jan–Feb rollover window, so calendar year would purge the wrong season's file.*

**Why five workflows are standalone rather than `_ingest.yml` callers.**

- `nflverse-playerstats.yml` — per-family conditional staging. One CSV fetch drives two families,
  and each is staged only if its own step output says it succeeded; the reusable template has no
  seam for that. This is an Invariant 3 safeguard: a failed family must not be registered.
- `weekly-ktc.yml` — its quarantine-alarm step runs after the ingest and inspects
  `ktc/quarantine/`. A `uses:` job body cannot carry additional steps, so delegating would drop
  the alarm.
- `cron-deadman.yml` — monitoring, not ingest. It writes no data file.
- `smoke-test.yml` — CI, not ingest. It writes no data file.
- `daily-snapshot.yml` (D1b) — it runs a headless browser against a second repo's own build
  (`npm ci && npm run build && npm run preview` in a cross-repo checkout, then Playwright), a
  shape `_ingest.yml`'s single-subcommand `node bin/update.mjs <subcommand>` body cannot express
  at all.

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
markdown table in the run's step summary. **Capture-only workflows also open a GitHub issue**
(`fileCaptureIssues`, `CAPTURE_ONLY_WORKFLOWS` in `scripts/check-crons.mjs` — today `weekly-ktc.yml`):
a missed KTC week is lost for good, and a red detector run alone is easy to miss when another
workflow already keeps it red (2026-10-05's KTC failure sat in seven consecutive red runs unseen).
One issue per workflow, titled `Capture missed: <file>`; none is opened while one is open, and none
is closed automatically. The workflow carries `issues: write` for this.

**Limitations:**
- **Self-monitoring.** The detector runs inside the same system it monitors (GitHub Actions). Mitigated by: daily cadence (a missed scheduler tick self-heals the next day); the `push` trigger on `main`, so any human push re-arms the check even if every cron is dead (note: pushes made with `GITHUB_TOKEN`, like the capture workflows' own commits, do not trigger `push` workflows — this is documented GitHub behavior and desirable here, it avoids recursion); and check 2 catching the auto-disable state directly. A total, silent, multi-day Actions-scheduler outage with no human push in between is the residual, accepted risk.
- **Self-exemption from check 4.** The detector's own workflow (`cron-deadman.yml`) is excluded from the healthy/conclusion check only — checks 1–3 (registered, enabled, recent) still apply to it. This is deliberate: the detector exits non-zero by design whenever it surfaces a real finding, so its own latest-run `conclusion` is `failure` exactly when it is working correctly; without the exemption every genuine miss would also self-report as a redundant "detector failed" finding, and a by-design exit couldn't be told apart from a real detector breakage.
- **Out of scope.** Staleness of the manual projection-snapshot import (`snapshots/` — `bin/import-snapshot.mjs` is user-run, not a cron) is not covered; that is a separate concern from monitoring scheduled Actions.

### Yearly maintenance

At the start of each NFL season, update `lib/validate.mjs`:

1. **`NFL_SENTINELS`** — add an entry for the new year with 2–3 high-usage players and their expected `minGames`.

The KTC landscape check needs no yearly update — it counts QBs by position (`KTC_MIN_TOP_QBS`).

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

jsDelivr caches `@main` for 12 h at the edge and tells browsers to cache for 7 days. Workflows purge and verify family files with `node bin/purge-cdn.mjs <paths>`; `manifest.json` is not purged (the app reads it from raw GitHub, CR-29). Manual sessions use `GITHUB_REPOSITORY=antonwilms/sleeper-dashboard-data node bin/purge-cdn.mjs <paths>`.

---

## Versioning policy

- **Append-only for historical data.** Past completed seasons are never overwritten unless correcting a data error.
- **In-progress seasons** are re-exported and committed whenever the app's cache is refreshed during the active season. `inProgress: true` in the manifest flags these.
- **KTC snapshots** accumulate by date. Old snapshots are retained.
- **Git history is the audit trail.** Corrections are committed with a message explaining what changed and why.
- **`schemaVersion`** in `manifest.json` is incremented when the file layout changes incompatibly (e.g. a new top-level folder, a renamed field).

---

## Cross-repo contract registry (with sleeper-dashboard)

Shared contracts are indexed in the app repo: [../sleeper-dashboard/docs/cross-repo-registry.md](../sleeper-dashboard/docs/cross-repo-registry.md).

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

### Outcome-basis routing (D-44)

`resolveOutcomeBasis(snapshot)` in `scripts/grade-snapshot.mjs` decides which outcome basis a capture's projections are comparable to; `gradeSnapshot` always uses it and passes the result to `buildGradeInputFromSnapshot` as `outcomeBasis` (so `meta.basisMatch` is `true` on a routed grade).

| Capture | `inputStatus.careerStats.detail.provenance` | Outcomes | `meta.basisClassification` |
|---|---|---|---|
| v1 (no `scoringSettings`) | — | half-PPR | `half_ppr` |
| `projectionBasis` absent / `'half_ppr'` | none (v2) | half-PPR, caveat "provenance unrecorded" | `half_ppr` |
| same | every season `'data-store'` | half-PPR | `half_ppr` |
| same | any season ≠ `'data-store'` | **skipped** (exit 0, seasons logged) | `mixed` |
| `'league'` (from 2026-09-25) | any | league-rescored (`buildLeagueOutcomes` → `rescoreSeasonRowsLeague`, the capture's `scoringSettings`); a non-`data-store` season adds a caveat only (CR-01) | `league` |
| anything else | any | **skipped** | `unknown` |

The league position lookup is `load.loadPositionOf()` (default `raw/-players-nfl.json`), falling back to the capture's depth charts; per-source counts land in `meta.positionSource`. `meta` also carries `outcomeModel`, `basisClassification` and `provenance` (additive; `schemaVersion` stays 1). The pre-D-44 behaviour (every `scoringSettings` capture dot-producted against its own settings through `buildInBasisOutcomes`) is no longer reached by `gradeSnapshot`; the builder stays for the self-test.

### In-basis grading (v2 snapshots)

For **v2 snapshots** (those with a `scoringSettings` field), the harness grades **in-basis**: it recomputes each player's actual target-season PPG by running a dot-product of the season-totals `stats` object against the snapshot's stored `scoringSettings` (via `lib/fantasyPoints.mjs`). This means absolute MAE/bias are **authoritative** — the actuals are computed under the same scoring weights as the projections, so no half_ppr basis offset distorts the numbers. The report shows:
- `Scored keys`: the number of non-zero scoring keys that exist in the season-totals stats universe.
- `Dropped`: scored keys absent from season-totals (omitted from actuals; in-basis totals undercount by these terms).
- `Rate-excluded`: non-additive rate keys (e.g. `rec_ypr`) stripped from `scoringSettings` before the dot-product (defensive guard; these never appear in real Sleeper `scoringSettings`).

**Pre-D-44 behaviour (historical):** v2 snapshots were graded in-basis via the dot-product above. **v1 snapshots** (no `scoringSettings`) continue to grade in half_ppr with the indicative-only basis-mismatch caveat. `--strict-basis` skips v1 non-half_ppr snapshots; it has no effect on v2 (in-basis makes it moot).

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

**Basis: half-PPR, not the E-0a/flip default.** The app's projection ppg series reads store-served `careerStats[s][pid].fantasyPoints` verbatim, and this repo writes that field as half-PPR — so `--fit` defaults `--basis` to `half_ppr` (exact parity with captures before 2026-09-25, no scoring snapshot read), while every other panel mode keeps `in-basis`. `--basis league` (D-46) runs the same fit on rows rescored as the app's `rescoreSeasonTotals` does — report-only, no exponent is activated. History loads to a `2012` floor (the app's own `loadCareerHistory` floor) instead of the stock `[fromYear-2..]` window, so multi-season factors (`basePPG`/momentum/regression/trajectory/shareTrend) see the app's real qualifying history.

**The model form — RMS-scaled ridge toward `w=1`.** Per position, `y(r) = log(outcomePPG) − log(anchorBasePPG) − Σ log fᵢ(r)` (the hand-stack log-residual, no intercept). Raw regressors `x_i = log fᵢ` are rescaled per fold, train-rows-only, by an uncentered RMS scale `s_i` before ridge fitting with `ridgeLambda = α·nTrain` — this is what makes the dimensionless shrinkage knob `α` scale- and `n`-independent, so a `shareTrend` column (large log-variance) and a `teamRzShare` column (small) shrink by the *same fraction* `1/(1+α)`, not by wildly different amounts under one raw-column λ. That uniformity holds exactly only under column orthogonality — the fitted factors are correlated (the usage trio; momentum/trajectory), so real shrinkage is slightly non-uniform, a second-order and unavoidable effect. Map back `δ_i = β_i/s_i`, `w_i = 1 + δ_i`; ridge toward `β=0` is ridge toward `w=1` — "empirically dead" vs "hand-tuned was right."

**The two-clamp prediction form (`predictWithExponents`, `lib/panel.mjs`) — both arms, identical rows/folds/product set.** The app does not multiply a flat product into `rawPPG`: ten factors form `combinedNewFactorRaw`, clamped to **`[0.67, 1.50]`** (the *inner* clamp), before joining the un-enveloped terms and only then hitting the outer **`[0, 40]`** clamp on `rawPPG`. Of the seven fitted factors, five sit inside the envelope (`momentum`, `trajectory`, `snapShare`, `rzUsage`, `teamRzShare`); `shareTrend` and `regression` multiply in directly, outside it. The fit target `y` is deliberately the **unclamped** log-residual — the clamp is a non-linear post-transform that would break the log-linear OLS form if folded into the target, so the fit is unconstrained in log space and constrained only at scoring (`inner`/`outer` composed in order, never merged).

*Known limitation, stated not hidden:* the reconstructed envelope wraps a **reduced 5-factor** sub-product where production wraps **10** (the other five envelope members — `qbQuality`, `breakout`, `bounceBack`, `tdReliance`, `efficiency` — are HELD-OMITTED). This makes the reconstruction a **conservative approximation of the app's clamp, not a faithful one**: the reduced hand-arm inner product tops out well inside `[0.67, 1.50]`, so `clampHits.hand` is 0 **by construction**, not because production's envelope is inert on real players. It still catches the fitted arm's own inflation (exponents `>1` can push the reduced product past where the hand product ever reaches), which is the risk the envelope exists to guard against — it just doesn't reproduce full production clamp incidence. `clampHits` per arm are reported in the verdict precisely so a CLEARS driven by heavy fitted-arm clamping is visible.

*Cancellation caveat:* a held, pinned, held-in-arm, or fold-neutralized factor's identical-in-both-arms term cancels in ΔMAE — but **only on rows where neither arm's inner product hits the clamp**. On a row where one arm truncates and the other does not, the clamp is a non-linear transform applied after summing, so the shared factor no longer cancels post-clamp — that is the *real* clamped difference between the two predictions, not a defect in the pin/hold arithmetic.

**CV, verdict, and the identifiability guard.** Season-blocked forward-chaining CV, same convention as E-0a. Verdict rules run on two channels: rule 0 (`nToParam = nEvalRows / |F_p^fit| < 20` → **INSUFFICIENT-POWER**, deferred, no fit — `nEvalRows` is the **pooled eval-row** count the gate was calibrated on, not the larger all-predictor-years fit-row count, which is reported alongside but never gates) short-circuits before any fit runs; rules 1–4 (`decideFitVerdict`) then produce **DEGRADES** / **CLEARS** (pooled ΔMAE<0, ΔSpearman≥0, ≥2-of-3 eval years improved, α-stability across `{0.25,0.5,1}`, **and** a thin-position guard — `sign(wFinal_i − 1)` must agree between `α=0.5` and `α=2` for every estimated factor) / **NO-GAIN** / **UNSTABLE**. A separate sensitivity re-run (excluding a debut-year-minus-1 cohort — a `years_exp` boundary ambiguity) overrides to **UNSTABLE** whenever the base and sensitivity labels disagree.

The **identifiability guard** (rule 0b) is one `selectFitFactors` call per position, over that position's full fit-row set, ranging only over the estimable candidates (never the held-in-arm ones): any factor flat-1.0 (`|log fᵢ| < 1e-12`) on ≥90% of rows is **pinned** at `w=1` in both arms — data-driven, not config, and computed once so the shipped refit and every scored CV fold draw from an **identical factor support** (support-identity, not vector-identity — `wFinal` is an all-rows refit no fold scored out of sample). A retained factor can still be **~100% flat on one fold's train subset** even though it isn't globally flat (a fold's train years are a proper subset); that case degrades **gracefully per fold** — the factor is neutralized for that one fold, never aborting the run — rather than either ignoring the degeneracy or crashing.

*Is the guard load-bearing or inert?* Reported, not assumed: the verdict's guard-instrumentation block prints, per position, the pinned set (with each one's flat-1.0 rate), **every** fit candidate's flat-1.0 rate (not just the pinned ones — a retained factor sitting near 0.90 is the interesting number), how often per-fold graceful neutralization fired (by factor and reason), and the per-fold `max|w−1|` explosion tripwire. The first real run is what answers whether this guard is doing real work or is inert across every position — if inert everywhere, it becomes a candidate for removal in a later slice.

**Panel size is the binding constraint.** Reading `grading/2026-08-08-e0a-verdict.md`'s pooled eval n: WR 339 (comfortable), RB 197 (adequate), TE 164 (marginal — lean on the WR+TE pool fallback), QB 92 (underpowered — expect NO-GAIN, the gate working as intended, not a failure). The `n:p<20` deferral, the identifiability guard, and the α-stability check are all levers that make a thin/noisy panel self-protecting rather than overfit. `roadmap.md` R1-SNAPS (panel width) is **banked, not yet enabled**: `nflverse/snaps/<year>.json` (2013–2025) now exists and its 2020–2024 overlap against Sleeper's own `off_snp`/`tm_off_snp` clears the cross-validation gate comfortably (RB/WR/TE, the real `snapShare` cohort scope: n=2,643, Pearson r=0.9995, MAD=0.0017 — see [data-catalog.md](data-catalog.md)'s snap-counts row). **The panel stays 2020+ (`PANEL_DEFAULTS.fromYear`) regardless** — enabling the fallback is a separate three-edit change (re-point `scripts/panel-run.mjs`'s `loadSnapShare`, flip `fromYear` to 2013, and revisit the pre-2020-undroppable assertions at `lib/backtest.mjs:290`/`bin/backtest.mjs:119`, plus a CR-15 re-fit before further exponent activation) that a passing cross-validation authorizes but does not itself perform — the harness is panel-width-agnostic and re-runs unchanged (config only, `--from 2013`) once that change lands, roughly tripling every position's n.

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

**Step 4 regression model.** The mirror reproduces two versions of the app's Step 4 regression bucket: `legacy` (up-side ×1.12/×1.05 at every position — what the app shipped until `7b5b055`) and `step4-upside` (up-side QB-only, RB/WR/TE ×1.00). `--fit` and `--fullpipeline` default to the app's current model and stamp `meta.regressionModel`; an artifact without that stamp predates the versioning and was computed under `legacy`, which `--regression-model legacy` reproduces. `runStep4Verdict` grades the up-side of whichever model assembled the panel, so under `step4-upside` its RB/WR/TE ΔMAE is 0 by construction. T-F10 pins `legacy` against the 2026-07-05 capture; `test/step4-mirror.test.mjs` pins both models' bucket tables. Parity against the captures either side of the boundary: `test/step4-mirror.test.mjs` T-S4-1…6 (`grading/anchor-policy.md`, boundary 4).

**Depth models and the QB start share (qb-inseason-refit, CR-15).** `lib/projectionFactors.mjs` reproduces the app's Step 8 depth step as two versioned models, `legacy` (every capture before boundary 5) and `qb-takeover` (a QB at order 1 ×1.05, any other QB ×1.00 — the app's takeover `backup` branch needs a tie at order 1, which a D5 chart cannot produce). It also mirrors the app's g = 1 preseason start share: `pinnedQbChainModels(file)` turns a `--qb-takeover` constants file into the `{ keys, coef }` models (refusing a hazard feature outside `dp/og/rk/iq/ps/bn/wk` or a stickiness feature outside `st/dq`), and `reconstructQbPreseasonShares({ qbs, priorOf, models, games })` is a verbatim port of the app's `buildPreseasonQbShares` over plain inputs (`qbs` = `{ id, team, order, rookie }`; `priorOf` is the caller's incumbent S−1 PPG). History has no capture, so callers use the D5 week-1 chart and half-PPR PPG — a stand-in; `test/qb-mirror.test.mjs` T-QB-2/T-QB-3 hold both exact against `snapshots/2026-10-03.json` / `2026-10-04.json` (the share parity uses league-rescored PPG and the capture's `rk`; under half-PPR 2 of the 54 shares cross an `iq` cut). The share composes `lib/qbTakeover.mjs` (`expectedStarts`, `dpCode`, `iqCode`); it is not composed into a `chain` row's `projectedPPG` here (no data-side consumer yet).

This unit **builds and commits the fit only** — it activates nothing. Shipping a CLEARS position's exponents into `seasonProjection.js` is a separate, app-repo unit (`r3fit-activation.md`), gated on the committed verdict here.

### D-8/D-9/D-12/D-13 rookie outcome panels (`bin/panel.mjs --rookie`)

Turns the rookie panel from one survivor-gated second-season PPG panel into one harness that also grades a **debut** season, an **ungated** outcome, and **realised total points** — see `.claude/tasks/rookie-outcome-panels.md`. One row shape, **two** predictors, one per purpose (see below), one extracted predicate (`rookiePathStateAt`).

**Three assemblies, one call each to `assembleRookiePanel`:** `legacy` (`season-presence` enumerator, gate 6, predictor years 2013–2024) — the pre-existing reproduction pin, plus an ungated pass that classifies every row into a six-state `outcomeClass` (D-9); `debut` (`entry-cohort` enumerator, `debutOnly`, no gate, entry/target 2013–2025) — grades the entry season itself (D-8); `rookiePathAll` (`entry-cohort`, no gate, same years) — every rookie-path season per entrant, feeding the games-ladder reconciliation (D-12) and the total-points residual (D-13).

**Artifacts** (`--write`, unregistered — same convention as `backtests/` generally): `backtests/<date>-rookie-panel.json`, `grading/<date>-rookie-verdict.md`.

```sh
node bin/panel.mjs --rookie                # analysis-only
node bin/panel.mjs --rookie --write        # persist both artifacts above
```

`--rookie` rejects `--from`/`--to`/`--attribution`/`--basis`/`--min-games` — the three assemblies carry three different year semantics, the basis is pinned `half_ppr`, and the outcome gate (`minOutcomeGames`, accepting only `6` or `null`) is structural, not a knob.

**The re-fit trap (CR-15), and the two predictors.** `reconstructRookieProjection` (`lib/projectionFactors.mjs`) is the permanent **uncorrected fit predictor** and declares `appliedCorrections: []`; `assembleRookiePanel` throws if a predictor's declaration is missing or non-empty, so the app's rookie calibration/games-ladder/ceiling constants can never re-enter a panel regenerated for fitting. The **corrected** predictor, `reconstructShippedRookieProjection` (`lib/rookieMirror.mjs`), composes the uncorrected one's `cappedProduct` and applies all three shipped rookie mechanisms — it is deliberately kept out of the fit path's import closure (never imported by `bin/panel.mjs`, `scripts/panel-run.mjs`, `lib/panel.mjs`, `lib/backtest.mjs` or `lib/projectionFactors.mjs`), which `test/rookie-mirror.test.mjs`'s import-graph assertion enforces statically. `lib/panel.mjs`'s two guard error messages carry the three correction tokens (`rookieCalibration`/`rookieGames`/`rookieCeiling`) as literals rather than importing them, for the same reason. `assembleRookiePanel` also stamps `coverage.predictorCorrections` onto every assembly — provenance for a reader of the committed panel JSON, not a second guard (the per-row throw already fires before the stamp is ever written).

**Rookie total model (rookie-total-wiring, boundary 9).** `ROOKIE_TOTAL_MODELS` = `legacy` | `rookie-total` (`CURRENT_ROOKIE_TOTAL_MODEL`): under `rookie-total` `reconstructShippedRookieProjection` multiplies `projectedTotalPts` by `ROOKIE_TOTAL_FACTOR` (day-3 0.796, undrafted 0.835, RB/WR/TE; `resolveRookieTotalFactor`) inside the one rounding and declares `rookieTotal`; `legacy` reproduces pre-boundary captures. `--rookie-total` (`composeRookieRow`) is pinned to `legacy`, the composition its verdict measured. `projectedPPG` and `projectedGames` do not move.

**Rookie QB model (qb-inseason-refit, boundary 6).** `lib/rookieMirror.mjs` versions the rookie QB starter level: `ROOKIE_QB_MODELS` = `legacy` | `rookie-qb-level` (`CURRENT_ROOKIE_QB_MODEL`), `QB_ROOKIE_STARTER_PPG` (a copy of `backtests/2026-10-04-qb-rookie-level-constants.json` `starterPPG`, held equal by `test/qb-mirror.test.mjs` T-QB-4) and `resolveRookieQbStarterLevel` (the app's group rule, half-PPR). `reconstructShippedRookieProjection({ …, rookieQbModel })` gains additive `qbStarterPPG`, `qbStarterBasis` (`null` / `'projection'` / `'rookie:<group>'`) and `rookieQbGroup` (always `null` under `legacy`); `projectedPPG`, `projectedTotalPts`, `projectedGames` and `appliedCorrections` do not move (the level is not a correction of `projectedPPG`).

`--rookie` also renders **§G**, an independent re-derivation of the app's eight shipped rookie-ceiling quantiles (knee = p90, asymptote = p99 of realised debut PPG) from this repo's own `debut` assembly — a reproduction pin against the app's constants (`41f277e`), not out-of-sample validation, since both sides consume the same rows.

§A pins the reproduction on the crosswalk frozen at `f27bc71` (`test/fixtures/rookie-pin-crosswalk-2026-09-06.json`, via `pinCrosswalkMaps`), exactly as `test/panel-fit.test.mjs` §6 test 1 does: the weekly crosswalk refresh `cde2d06` added `12079`, which moves the live legacy `assembled` 2563 → 2564 without touching the 2026-09-06 artifact. §B–§G and the written artifact still read the live crosswalk.

**D-12 reproduces the app's games ladder (provenance-records-w2).** The entry-cohort walk now follows the app fixture's recipe (`rookie-games-panel-2026-09-09.json` `source.predicate`): at `years_exp ≥ 2` a row with zero games in the target season `T` and in `T−1` is skipped and the walk keeps going (it previously stopped on a `T−1`/`T−2` window). Rung U is accumulated over the four known groups, as the app's U ladder is; an unknown-group row feeds no rung. §D compares all 74 of the app's cells (`APP_ROOKIE_GAMES_CELLS`, `compareRookieGamesCells`) under the app's own rounding — one decimal, then `Math.round` — and lists only the non-matching cells. The weekly crosswalk refresh `cde2d06` (added `12079`, dropped `13001`) shows as n differences against the 2026-09-09 fixture, not as moves in whole games.

§E's cell-mean residual is not the shipped composition; `--rookie-total` measures that (research-arms-w3).

Reproduce: `node bin/panel.mjs --rookie --write`.

### In-season evidence k-fit (`bin/backtest.mjs --inseason`)

Phase 2a of the in-season evidence work (`.claude/tasks/in-season-evidence-2a-backtest.md`). Offline analysis only: it re-fits the shrinkage constant `k` (`w = n/(n+k)`, blending a pre-season prior with `n` games of in-season evidence) against the **real reconstructed pre-season projection**, out of sample, and answers eight questions (k per signal × position × horizon; whether opportunity adds to points; weak/strong and confidence splits; rookies and short-history players; baseline lookback; a cross-position usage-shift sort measure; the depth-chart double count; which k drives the dynasty score versus the season projection). Basis is pinned `half_ppr`.

| Arm | Population | Points prior | Checkpoint |
|---|---|---|---|
| **P** (primary) | veteran path at Y = S-1 and S-1 gp ≥ 8 | frozen projection (S week-1 depth chart) | calendar week W = 1–12 |
| **L** | as P | live projection (depth chart of S week W+1) | calendar W |
| **R** | S-1 gp ≥ 8, any path | raw S-1 PPG | calendar W |
| **S** | S-1 gp ≥ 8, crosswalk position | raw S-1 PPG | first n played games, n = 1–8 (study reproduction) |
| **X** | everything not in P: rookie0 / rookie1p / short | shipped rookie projection, or frozen projection | calendar W |

`n` is games played (`weeklyPoints` keys). Weekly opportunities and target share come from `nflverse/gamelogs` (REG only) as a weekly decomposition behind a **reconciliation stop**: gamelogs opportunity sums must agree with season-totals `stats` on ≥ 99% of skill player-seasons (tolerance `max(2, 3%)`), or the run exits 1 and writes nothing. No gamelogs value reaches the app — only dimensionless constants do. Validation is leave-one-season-out; CIs are player-clustered bootstrap (4000 resamples, seed 12345, `mulberry32` — deliberately not `runStep4Verdict`'s LCG, which multiplies past 2^53). `k` is fitted over integer tenths 0.0–40.0 from sufficient statistics, so every fitted value re-derives exactly from the constants file's fixture. The pure logic is `lib/inSeasonEvidence.mjs`; the adapter is `scripts/inseason-run.mjs`.

**Why not a `bin/panel.mjs` mode:** the rookie prior must be the *shipped* (corrected) projection, which lives in `lib/rookieMirror.mjs`, and `test/rookie-mirror.test.mjs` T-RM1 forbids that file anywhere in `bin/panel.mjs`'s import closure. `bin/backtest.mjs` is outside that closure. `--inseason` fits no rookie constant and never calls `assembleRookiePanel`, so the CR-15 re-fit trap does not apply.

**QB prior (qb-inseason-refit).** `assembleSeason(S, env)` requires `env.qbPrior` ∈ `QB_PRIOR_MODELS` = `legacy` | `starter` (it throws when absent — no caller inherits a QB prior silently). `runInSeason` defaults to `starter`: QB rows blend the **starter level** the app blends from — depth model `qb-takeover` (no share), and for a `yearsExp` 0 rookie QB with draft capital the pinned rookie level, **unless** he was his team's game-1 primary passer (the app's `original` kind keeps the ceiled rookie-path level; `primaryPassers` and `coverageFor` ≥ 0.99 per season decide it, recorded in `coverage.qbStart`). A rookie without a group keeps the rounded `projectedPPG`. Rows carry `pointsPriorNext` (the ceiled rookie-path level for rookies, = `pointsPrior` for veterans): `SPEC.pointsNext.prior` reads it, so the next-season horizon keeps the arm-B rookie prior the dynasty update blends. `runInSeason({ qbPrior: 'legacy' })` reproduces the committed `2026-09-26` constants exactly. **Q9** (report-only, pins nothing) fits the QB ROS k with n = **starts** on the non-`original` QB population (`startsArmRows`), compared per row with that arm's pinned QB k. `coverage.qbStart` also reports the preseason start share rebuilt from the week-1 chart (teams, incumbent / chain / stale / no-chart counts, median chain share). `writeQ4Pin` is buildConstants' Q4 NO-GAIN pin write (own vs pooled), extracted so it can be tested. Since qb-rookie-dynasty-research `scripts/inseason-dyn-run.mjs` takes `qbPrior` as a required argument (the CLI runs `starter`; `legacy` re-runs 2026-09-27) — see the dynasty-side k-fit section.

**Artifacts** (`--write`, unregistered — the Invariant 3 analysis-output exception): `backtests/<date>-inseason-panel.json` (aggregate tables and per-fold results, no per-row data), `backtests/<date>-inseason-constants.json` (the table the app pins, plus the sufficient-statistics fixture Phase 2b copies into `src/__fixtures__/`), `grading/<date>-inseason-verdict.md`.

```sh
node bin/backtest.mjs --inseason           # verdict markdown to stdout
node bin/backtest.mjs --inseason --json    # the result object
node bin/backtest.mjs --inseason --write   # persist the three artifacts above
```

Reproduce: `node bin/backtest.mjs --inseason --write`.

### In-season dynasty-side k-fit (`bin/backtest.mjs --inseason --dynasty`)

Phase 2c (`.claude/tasks/in-season-evidence-2c-dynasty-backtest.md`). Offline analysis only, reusing
2a's row assembly unchanged. Answers three questions the dynasty score's prospect/SHORT-veteran paths
never got a fitted weight for: **Q1** which prior the prospect side should use — arm A, the app's own
`computeProspectScore` heuristic prior (position × age × draft-capital multipliers, blended 8:min(gp,12)
with any partial S-1 season), or arm B, the reconstructed rookie/veteran projection; **Q2** the
history-prior k for SHORT veterans (last season < 8 games); **Q3** how much of the KTC-anchored 60% of
the prospect score the model share leaves on the table (report only — KTC itself may already react to
in-season evidence, which is unmeasurable until KTC history has a full season behind it, ~Jan 2027).
Basis is pinned `half_ppr`; horizon is next-season only (the dynasty horizon).

Populations: **YE0/YE1** (years of experience since `draftYear`, from `nflverse/playerids.json`) on the
app's prospect path; **SHORT-recent** (last qualifying season = S-2) and **SHORT-stale** (≤ S-3,
reported only) on the veteran path. A **D4 pick proxy** (12-team, 5-round rookie draft, ranked by
`draftOvr`) stands in for the league's own rookie draft, which is not reconstructable; **D5** notes a
real app quirk — `selectRookieDraft` reads only the most recent rookie draft, so YE1 prospects always
get `pick = null` in arm A. **D6** ages players at kickoff (`${S}-09-01`), not Sleeper's stored integer
age. Every pinned k runs a **pre-registered ladder** (2a-pinned k → subgroup-pooled refit → own-position
refit for arm B and SHORT-history; subgroup-pooled → own-position for arm A), so a cell that does not
beat a simpler rung reuses it rather than pinning a noisier fit — `reuse` entries in the constants file
name what was reused instead of writing a new constant. The pure logic (prospect-prior mirror,
history-prior, the ladder) is additive in `lib/inSeasonEvidence.mjs`; the adapter is
`scripts/inseason-dyn-run.mjs`.

**QB prior and the Q4/Q5 questions (qb-rookie-dynasty-research, L4).** `runInSeasonDyn` **requires** `qbPrior`
(`legacy` | `starter`; it throws before reading any loader when absent or unknown). The CLI runs `starter`: rows are
assembled on the prior the app blends from, with the 2a k file fitted under it — each prior is paired with its file in
`DYN_2A_PIN` (`legacy` → `2026-09-26 @ a071bdb`, `starter` → `2026-10-07 @ f2c3b83`), and every reuse entry's `source`
follows the loaded file. `legacy` reproduces `2026-09-27` exactly. On `starter` the result also carries `d64`
(`diffDynConstants` against `2026-09-27`: every 2c constant, reuse entry and decision) and two held-out questions.
**Q4** (P12c): should a `yearsExp` 0 QB's arm-B prior start from a calibrated draft-group level instead of the
rookie-path level B0? One row per rookie QB-season (`draftYear === S`, S 2014–2024), whether or not he played; candidates
GS (P12a's starter level), GC (leave-one-class-out group mean of S+1 PPG) and RC (B0 × the group's Σy/Σprior), scored
prior-only on S+1 (decision) and S+2 (confirmation) and as the posterior on the 2c Q1 YE0 QB rows at the pinned rookie k.
A **position control** (Σ S+1 PPG / Σ B0 for QB vs RB∪WR∪TE) gates any candidate that raises or lowers the QB level
(arm B is pessimistic for every position, so a QB-only level fitted to survivors would be selection, not signal).
Decision rule `decideQ4`: `insufficient` below 30 players, `keep`, `keep-not-qb-specific`, or the lowest-MAE eligible
candidate. Q4c (report-only) tabulates the season-S level by week-1 chart role. **Q5** (D-60): the app's own
sat-longer rule (`satLongerAt`: a `years_exp` 0 chart-backup QB whose starts trail the preseason chain by more than 1
game at a checkpoint) replicated on the week-1 chart over checkpoints 1–12; Q5a fits the discount `d` on S+1 PPG of the
flagged rows (`fitDiscount`/`discountLoso`, grid 0.50–1.20) against the shipped 0.90 and against none, Q5b asks whether
the effect persists into year 2, Q5c is a report-only flagged/never-flagged split. Floors: 20 players for Q5a/Q5b
(below it the decision is `insufficient` and 0.90 stays). Q5 reads gamelogs primary passers, so every Q5 output is an
aggregate (counts, MAE, labels, CIs, the full-sample `d`); any mean/MAE/ratio over fewer than 3 players is `null`.
The constants file gains `qbRookieDynasty` and `qbSatLonger` decision blocks (nothing is pinned from them here).
Pure helpers: `QB_DYN_RESEARCH`, `satLongerAt`, `fitDiscount`, `discountLoso`, `calibrateGroup`, `fullCalibration`,
`ratioDiffBootstrap`, `decideQ4`, `decideQ5a`, `decideQ5b`, `diffDynConstants`, `satLongerAggregates`
(`lib/inSeasonEvidence.mjs`).

**Artifacts** (`--write`): `backtests/<date>-inseason-dyn-panel.json`, `backtests/<date>-inseason-dyn-constants.json`
(the app's pinned-vs-reused table plus the sufficient-statistics fixture), `grading/<date>-inseason-dyn-verdict.md`.

```sh
node bin/backtest.mjs --inseason --dynasty           # verdict markdown to stdout
node bin/backtest.mjs --inseason --dynasty --json    # the result object
node bin/backtest.mjs --inseason --dynasty --write   # persist the three artifacts above
```

Q3 mirrors the app's cap placement (app `8ab6a5e`): the no-market cap bounds the *starting* value and the live evidence enters after it, uncapped (`capStartPPG`); `q3.capOf35` therefore also reports `startBindShare` and `meanStartCutScore`. `q3.capPlacement` is the committed cap-after / cap-before / no-cap comparison on the Q1 cap rows (D-54), with the paired-bootstrap deltas.

Reproduce: `node bin/backtest.mjs --inseason --dynasty --write`.

**D-55 / D-56 (research-arms-w3).** `runS2ArmComparison` reports the two-season arm comparison on every Q1
row with an S+2 outcome, admitted with or without an S+1 outcome; its `kind` (WORSE → position baseline) is
what the app's `PROSPECT_PRIOR_KIND` must equal, recorded as `prospectPriorKind` in the constants file. When
YE1 chooses arm B, `runQ1` also runs arm A's two-rung ladder and emits `K_DYN_PROSPECT_A_YE1`, which D-64's
diff excludes (its 2026-09-27 baseline predates the name). `lib/rookieCapturedLevel.mjs` re-composes a
capture's rookie level from its own factors; its neutral `dynastyPrior` (the ceiled level, never the QB chain)
is the app's dynasty-side rookie prior, so no snapshot field carries it. It imports only
`lib/projectionFactors.mjs`, so the grader can reach it (`test/rookie-captured-level.test.mjs`).

### League-basis graded before/after (`bin/backtest.mjs --league-basis`)

D-46 (`.claude/tasks/league-basis-mirror.md`). Since the app's season rescore (live from the 2026-09-25 capture) every season-totals row is rescored at load under the league's `scoringSettings` and `positionBasisScale` multiplies the rookie constants, while the served rows stay half-PPR. `lib/leagueBasis.mjs` is the data-side mirror: a scoring-basis **model** `league` beside the pinned `half_ppr` (never an overwrite — CR-15). `rescoreSeasonRowsLeague` ports `rescoreSeasonTotals`; `reconstructPositionBasisScale` ports the as-of scale; `leagueBasisLoad` wraps a loader so every reader of `fantasyPoints`/`weeklyPoints` moves with no edit to fit code. Scoring settings are the pinned `test/fixtures/league-scoring-2026-10-14.json`; positions come from `raw/-players-nfl.json`. `lib/rookieMirror.mjs` and the prospect prior take `basisScale` (default 1, byte-identical).

`--inseason [--dynasty] --basis half_ppr|league` picks the model (default `half_ppr`, which reproduces every committed constants file); `--inseason --dynasty --basis league` requires `--inseason-2a <path>`, the paired 2a constants file. A league constants file adds one top-level `basisDetail` key. `--fit` accepts `--basis league` (report-only). Every other mode still rejects `--basis`.

`--league-basis [--json] [--write]` is a hand-run (several minutes, never a test): **G1** mirror fidelity against the 2026-09-24/09-25/10-14 captures (a gate; T-RM16 and T-F10L pin its rookie and veteran rows on committed slim fixtures), **G2** the k re-fit (emitted `k` of the league files vs the shipped 2026-10-07 / 2026-10-11 files, a pre-registered `wire`/`do-not-wire` rule with a pooled-delta guard), **G3** R3-FIT transport. `--write` persists `backtests/<date>-league-basis-panel.json` and `grading/<date>-league-basis-verdict.md`. The 2026-10-16 run: G1 PASS; both constants files `do-not-wire` (the pooled points delta for 2a is NO-GAIN), so no k moved; G3 found one label that differs under league basis (QB `sensitivityVerdict`). `grading/anchor-policy.md` boundary 4a records the switch.

### League-basis refit of the rookie and prior constants (D-45)

`node bin/backtest.mjs --rookie-basis [--json] [--write]` is a hand-run (several minutes, never a test) graded refit of five constant families on league-basis outcomes, each by its own committed recipe and compared out of sample against today's interim (half-PPR x as-of `positionBasisScale`) under a pre-registered rule: **F1** rookie baseline + calibration, **F2** rookie ceiling, **F3** rookie QB starter level, **F4** total-points factor, **F5** position prior. D-45 also admits `--basis half_ppr|league` (default `half_ppr`) on `--qb-rookie-level`, `--rookie-total` (needs `--rookie-panel <path>`, a `bin/panel.mjs --rookie --basis league --json` result), `bin/panel.mjs --rookie` and `bin/panel.mjs --fullpipeline` (both report-only under league), and `--rookie-constants <file>` (the league rookie-constants file; with `--inseason [--dynasty]` or `--rookie-total`, only under `--basis league`). `--write` persists `backtests/<date>-rookie-basis-panel.json`, `backtests/<date>-rookie-league-constants.json` and `grading/<date>-rookie-basis-verdict.md`. The 2026-10-17 run (`grading/2026-10-17-rookie-basis-verdict.md`): all five families `do-not-wire`, so no constant moved.

### QB takeover fit (`bin/backtest.mjs --qb-takeover`)

P6a (`.claude/tasks/qb-takeover-research.md`). Offline analysis only: no ingest, no served family, no manifest entry. For a QB who is not his team's starter it fits the chance he is the starter in each remaining game, as a two-state weekly Markov chain over the team's game sequence — a **hazard** `pUp` (a non-starter is the primary passer in game g) and a **stickiness** `pStay` (a backup-origin starter stays) — then composes them into an expected remaining-start fraction (an exact recursion over 54 states). **Primary passer** = max `attempts + sacksSuffered` per team-game (REG; ties on attempts, then pid) from `nflverse/gamelogs`; gamelogs `team` is mapped to the schedule/depth era codes with `eraTeam` (STL/SD/OAK). **Checkpoint timing:** the chart known before game g — legacy seasons read chart(week of g), ESPN-era seasons (≥ `DEPTH_ESPN_FROM_SEASON`) read chart(week of g − 1), else the previous team game's chart. Both models are ridge-logistic (λ = 1) over **categorical** features, so the per-pattern (trials, events) table is the exact set of sufficient statistics and every pinned coefficient re-derives from the constants file's fixture. Features are chosen by a pre-registered forward ladder on leave-one-season-out log-loss; a candidate is adopted only when the paired team-season cluster bootstrap (4000 resamples, seed 12345, `mulberry32`) labels it BEATS. The run stops (exit 1, nothing written) if any season's primary-passer coverage is below 0.99 of REG team-games. No gamelogs points are read — weekly points come from season-totals `weeklyPoints`. The pure logic is `lib/qbTakeover.mjs`; the adapter is `scripts/qb-takeover-run.mjs`.

**Artifacts** (`--write`, unregistered — the Invariant 3 analysis-output exception): `backtests/<date>-qb-takeover-panel.json` (aggregate tables only, no per-player rows), `backtests/<date>-qb-takeover-constants.json` (the pinned coefficients plus the pattern-table fixture P6b copies), `grading/<date>-qb-takeover-verdict.md`.

```sh
node bin/backtest.mjs --qb-takeover           # verdict markdown to stdout
node bin/backtest.mjs --qb-takeover --json    # the result object
node bin/backtest.mjs --qb-takeover --write   # persist the three artifacts above
```

Reproduce: `node bin/backtest.mjs --qb-takeover --write`.

### Rookie QB starter level (`bin/backtest.mjs --qb-rookie-level`)

P12a (`.claude/tasks/qb-rookie-level-research.md`). Offline analysis only: no ingest, no served family, no manifest entry. It measures the PPG a rookie QB scores **in the games he starts**, by draft group, 2013–2025, and compares it with the shipped ktc-neutral rookie level (`rookiePriorFor` → `lib/rookieMirror.mjs`) and with the live snapshot's rookie QBs. Pure logic is `lib/qbRookieLevel.mjs`; the adapter is `scripts/qb-rookie-level-run.mjs`.

- **Started** = primary passer of the REG team-game (`primaryPassers`, reused unchanged from the QB takeover fit: max `attempts + sacksSuffered`). Points are season-totals `weeklyPoints[week]` (half-PPR) — no gamelogs points are read.
- **Groups are round-based**: `top12` = round 1 pick ≤ 12, `r1` = round 1 pick ≥ 13, `day2` = rounds 2–3, `day3+` = rounds 4–7 or undrafted (within-round `draftPick`; deliberately not the takeover fit's `draftOvr` bins).
- **Estimator** = game-weighted mean (Σ points ÷ Σ primary games) per group; 95% CIs are a rookie-season-cluster bootstrap (4000 resamples, seed 12345). Pinned values are half-PPR; the app multiplies by its runtime `positionBasisScale`.
- **Held out**: leave-one-season-out on rookie-seasons with ≥ 3 primary games, group mean vs the shipped ktc-neutral level, vs the pooled rookie mean, and a cap (`min(shipped, group)`) vs shipped.
- **Stops**: exit 1 if primary-passer coverage is < 0.99 in any season (`CoverageStop`) or the snapshot is unusable (`SnapshotStop`: absent, no `scoringSettings`/`players`, `targetSeason` ≤ 2025, or a non-zero `bonus_fd_qb`). The live comparison reads the pinned `snapshots/2026-10-03.json`.
- **Disclosure**: nothing gamelogs-derived is emitted per player or per season; report cells under 3 rookies are `null`, and split cells are suppressed in complementary pairs.

**Artifacts** (`--write`, unregistered — the Invariant 3 analysis-output exception): `backtests/<date>-qb-rookie-level-panel.json` (aggregate tables; Q4 rows are app snapshot outputs), `backtests/<date>-qb-rookie-level-constants.json` (the pinned per-group values, CIs and the provenance fixture P12b re-derives from) and `grading/<date>-qb-rookie-level-verdict.md`.

```sh
node bin/backtest.mjs --qb-rookie-level           # verdict markdown to stdout
node bin/backtest.mjs --qb-rookie-level --json    # the result object
node bin/backtest.mjs --qb-rookie-level --write   # persist the three artifacts above
```

Reproduce: `node bin/backtest.mjs --qb-rookie-level --write`.

### D-13 composed rookie total points (`bin/backtest.mjs --rookie-total`)

research-arms-w3 (`.claude/tasks/research-arms-w3-d13.md`). Offline analysis only: no ingest, no served family, no manifest entry, no score moves. The population is W2's committed availability panel (`backtests/2026-10-10-rookie-panel.json` `rookiePathAll.rows` @ `7e900fc`, 3,848 rows, pinned in `ROOKIE_TOTAL_PIN`); each row gets the **shipped** composition — `reconstructShippedRookieProjection(...).projectedTotalPts`, the calibrated, ceiled PPG × the games ladder, with `ageAtDraft` from `nflverse/playerids.json` — and is compared with `outcomeTotalPts` (absent rows count as zero). The run stops if the row count differs from the pin, a birthdate is missing, or the uncorrected reconstruction does not reproduce a row's own `projectedPPG` (parity). The module `lib/rookieTotalPoints.mjs` and its adapter `scripts/rookie-total-run.mjs` sit **outside `bin/panel.mjs`'s closure** because they reach `lib/rookieMirror.mjs` (T-RM1). Rule (pre-registered, §7.2 of the task file): on the non-QB RB/WR/TE rows of `day3` and `undrafted`, a group is `correct` when Σpred / Σreal is ≥ 1.05 with the player-clustered CI above 1 (or ≤ 0.95 with the CI below 1) **and** a leave-one-target-season-out per-group multiplier gives a `BEATS` ΔMAE; the verdict is `recommend` when either group is `correct`, else `close`. Bias is the primary metric; MAE only confirms the correction does not hurt out of sample.

**Artifacts** (`--write`, unregistered — the Invariant 3 analysis-output exception): `backtests/<date>-rookie-total-panel.json` (aggregate tables, no per-row data), `grading/<date>-rookie-total-verdict.md`.

```sh
node bin/backtest.mjs --rookie-total           # verdict markdown to stdout
node bin/backtest.mjs --rookie-total --json    # the result object
node bin/backtest.mjs --rookie-total --write   # persist the two artifacts above
```

Reproduce: `node bin/backtest.mjs --rookie-total --write`.

---

### January season grade (`bin/season-grade.mjs`)

P3 slice A (`.claude/tasks/january-grading-run-a.md`). One command for the grades parked until the 2026 regular season ends; **report-only** — numbers and labels, never a constant or a wiring recommendation. Offline analysis, not the snapshot grader (Invariant 9): the veteran replay **recomposes** projections.

```sh
node bin/season-grade.mjs --rehearse        # end to end on today's partial data; bypasses G-SEASON, writes nothing
node bin/season-grade.mjs                   # the January run (Fri 2027-01-15, ≥ 14:00 UTC); G-SEASON is a hard stop
node bin/season-grade.mjs --write           # + grading/<captureDate>.json (registered), backtests/<runDate>-season-grade.json, grading/<runDate>-season-grade-verdict.md (unregistered)
node bin/season-grade.mjs --only vet-calibration --json
npm run grade:season -- --rehearse
```

- **Registry:** `scripts/season-grade-run.mjs` exports `STEPS` — `season-gate`, `inventory`, `d44`, `vet-calibration` (Slice A), then Slice B's `ros`, `games-l6`, `override`, `rookie`, `d60`, `listed`. Each step after the gate runs in its own try/catch; exit 1 if any failed.
- **Gate:** G-SEASON = 272 scored REG games; week-18 `'P'` ≥ 0.85 × the median of weeks 1–17; `weeklyStats` on every played row; season-totals manifest `lastModified` ≥ schedule's − 24 h.
- **Segments:** `lib/seasonGrade.mjs` `VETERAN_SEGMENTS` (mirrored byte-for-byte as a JSON block in [grading/anchor-policy.md](grading/anchor-policy.md)); `KICKOFF_2026_UTC` = 2026-09-10T00:20:00Z (`games.csv` `2026_01_NE_SEA`, Wed 2026-09-09 20:20 ET). K = the last capture before it (`2026-09-09`); L0…L6 are the first capture of each post-kickoff veteran segment (leaky); S is the composite of per-player source rows (leaky). A capture outside its segment's date range, an unpinned `projectionModelFrom`, or a newest capture not in the last segment **stops** the run — a new veteran boundary goes into the JSON block and `VETERAN_SEGMENTS` first.
- **Replay R** (`lib/vetReplay.mjs`): the shipping model recomposed on pre-kickoff (K) inputs by delta-form substitution into the newest-segment capture S(i) — K's `teamFactor` and `qbQualityFactor` tables, depth (`reconstructDepthFactor` + `qbRole`), the QB start share from K's rooms, S's age table at K's age, the breakout age rule. Gates: G1 identity, G2 depth, G3 tables, **G-MECH** (A's inputs replayed onto B's rows over fixed pairs M1–M9 plus the bounded window pair M10 must match within display rounding), G5 QB chain, G6 age table; the boundary-equality guard stops on a changed boundary. R is the headline iff G1–G3 and G-MECH pass, else K ("not the shipping model"); R and K are always both reported, with R − K. Drift Q (Q-within, Q-cross) is printed under the headline and never decides.
- **Metrics:** `R_ppg`, `R_tot` per position and pooled, 95% player-cluster bootstrap (4,000 resamples, seed 12345), labels `optimistic|within-CI|pessimistic`, `consistent-with-history`, `agrees|differs`, heterogeneity (per-position difference from pooled + a 4,000-permutation test).
- **CR-15:** `lib/vetReplay.mjs` mirrors the app's veteran composition (`seasonProjection.js:1013-1054`, `:964`, `projectionSignals.js:31-35`); G1/G2/G-MECH fail loudly if an app change goes unsynced.

**Slice B** (`.claude/tasks/january-grading-run-b.md`) — the D-52 / D-16 / D-75 grades, same report-only rule. Pre-registered rules are frozen in the task file's §6–§9 and §13 (amendment §13a, 2026-10-25).

- **`ros`** (D-52 `inSeason.ros`): checkpoints c = 3…17 on a fixed calendar (week 1's Thursday `2026-09-10` + 7(c−1) d; week c closes Thursday + 5 d 06:00Z; capture = first inside [close, next Thursday 23:00Z) else `late`, none → `no-capture`; c = 1, 2 are `no-inSeason-capture`). Per checkpoint × position: MAE, bias and paired Δ|err| (player-cluster bootstrap) of `ros.value` against `ros.prior` and against observed-to-date PPG, for per-game rows (a) and QB start rows (b, team-game basis; `inSeason.n = 0` → comparator 0). A checkpoint whose n-th `'P'` week is ≤ c+1 for under 99% of rows is `n-inconsistent` and excluded. Cells under 30 players print numbers, no label. On 2026 live-prior rows `ros.prior` is the current, leaky projection (printed caveat); the frozen/live split prints only when both groups exist.
- **`games-l6`** / **`override`**: need `vet-calibration` in the same run (`ctx.shared.S`); without it they return `graded: false` and exit 0. L6 compares `projectedGames` with `factors.projectedGamesBase` against 2026 `gamesPlayed` by short-season state and the rel3 star flag; `override` runs `inSeasonCheck` and also records, with no dependency, the count of rows carrying an `inSeason.next` block per checkpoint × position (the `next` grade needs 2027 outcomes). **`--only games-l6`/`override` therefore needs `vet-calibration` in the same list**, or it reports `graded: false`.
- **`rookie`**: `runRookiePanels({ basis, entryToYear: 2026 })` for `half_ppr` and `league` → D-16 (2026-class debut counts, ceiling reconciliation vs `APP_ROOKIE_CEILING`, leave-one-class-year-out QB asymptote, QB debuts above the ceiling; label `moved` iff the 2013–2026 asymptote is outside [20.50, 21.95]) and D-75 (`runRookieTotal({ …, evaluateTargetSeason: 2026 })` on the in-memory league panel: both arms are `predTotal × factor`, shipped `ROOKIE_TOTAL_FACTOR` vs the league F4 `totalFactor` in `backtests/2026-10-17-rookie-league-constants.json`). `--write` adds the unregistered `backtests/<runDate>-rookie-panel.json` and `…-rookie-league-panel.json` (no verdict md). Numbers only — never a constant.
- **`d60`**: deferred. D-60 is **not counted** in January (2026 `season-totals` is still `inProgress` until Sleeper's post-Super-Bowl rollover and the in-progress guard refuses it); recount at the first run where 2026 is `inProgress: false`. **`listed`**: D-79 / D-80 / D-85 inputs, text only.
- **No-throw rule:** a Slice B step failing in the real `--write` run degrades to a `⚠ NOT COMPUTED` section with `computed: false` in `steps[].data`, so Slice A's aggregate is still written; under `--rehearse` (with or without `--write`) and in a plain run the error is re-thrown and the exit is 1.
- **Adapter parameters** (defaults byte-identical, checked against `test/fixtures/season-grade/rookie-golden-pre-b.json`): `runRookiePanels({ entryToYear })`, `runRookieTotal({ evaluateTargetSeason })` (adds an in-memory `result.evaluate`, never written).

## Data sources and attribution

| Data | Source | Terms |
|---|---|---|
| NFL player stats | [Sleeper API](https://docs.sleeper.com/) | Personal use, read-only |
| Dynasty market values | [KeepTradeCut](https://keeptradecut.com/) | Personal use |
| College stats | [College Football Data API](https://collegefootballdata.com/) | Non-commercial / personal use |
| NFL schedules, results & Vegas lines | [nflverse / nfldata](https://github.com/nflverse/nfldata) | Public domain (CC0-style); attribution requested |
| NFL play-by-play (team-context derivation) | [nflverse / nflverse-data](https://github.com/nflverse/nflverse-data) | CC-BY 4.0-style; attribution requested |

This repo is for personal dynasty fantasy football analysis only. It is not affiliated with, endorsed by, or licensed by any of the above services.
