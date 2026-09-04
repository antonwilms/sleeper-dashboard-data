# Per-game nflverse stats ingest — `gamelogs` (Session 1 plan)

**Status:** planned 2026-06-28, awaiting Session 2 (sonnet) implementation.
**Model discipline:** this file is the only artifact of Session 1. No source edits here.

Goal: stand up a **broad, view-only, PER-GAME** nflverse stats ingest beside the existing
season-level receiving-only `advstats` file — a database/training layer (Track A). New path,
new subcommand, new served file; the live `nflverse/advstats/<year>.json` contract is **untouched**.

---

## Part 1 — Live data inventory (fetched 2026-06-28, not from memory)

All sizes/coverage below were observed by fetching real release assets and counting rows.
Source families enumerated; join id and per-field/per-season coverage are honest.

### A. Base per-game player stats — `player_stats` release, `stats_player_week_<year>.csv`
- **URL:** `https://github.com/nflverse/nflverse-data/releases/download/player_stats/stats_player_week_<year>.csv`
  (the same asset the existing `advstats` ingest already fetches via `fetchPlayerStatsCsv`).
- **Grain:** one row per player per game (per-game / weekly). Carries `season_type` ∈ {REG, POST}.
- **Join id:** `player_id` = **gsis** (`00-00xxxxx`) → joins via the existing `nflverse/playerids.json`
  crosswalk with **zero changes**. (Confirmed: a 2024 WR row keys `00-0030035`.)
- **Header is identical 2012 ↔ 2024** (verified). Column families:
  - identity/meta: `player_id, player_name, player_display_name, position, position_group, season, week, season_type, team, opponent_team`
  - passing: `completions, attempts, passing_yards, passing_tds, passing_interceptions, sacks_suffered, sack_yards_lost, sack_fumbles, sack_fumbles_lost, passing_air_yards, passing_yards_after_catch, passing_first_downs, passing_epa, passing_cpoe, passing_2pt_conversions, pacr`
  - rushing: `carries, rushing_yards, rushing_tds, rushing_fumbles, rushing_fumbles_lost, rushing_first_downs, rushing_epa, rushing_2pt_conversions`
  - receiving: `receptions, targets, receiving_yards, receiving_tds, receiving_fumbles, receiving_fumbles_lost, receiving_air_yards, receiving_yards_after_catch, receiving_first_downs, receiving_epa, receiving_2pt_conversions, racr, target_share, air_yards_share, wopr`
  - scoring: `fantasy_points, fantasy_points_ppr` (nflverse default scoring — NOT Sleeper/app scoring)
  - out-of-scope families also present: `special_teams_tds, def_* (IDP), misc_yards, fumble_recovery_*, penalties, penalty_yards, punt_returns, kickoff_returns, fg_*/pat_*/gwfg_* (kicking)`
- **Per-field / per-season coverage (honest):**
  - EPA fields populated **1999+**.
  - Air-yards / YAC / depth fields (`*_air_yards`, `*_yards_after_catch`, `racr`, `target_share`,
    `air_yards_share`, `wopr`, `pacr`, `passing_cpoe`) are reliably populated only in the **charting
    era (~2006+)**. Verified: **1999** WR rows show `receiving_air_yards=0`, `yac=0` — the source
    **zero-fills** these pre-charting (NOT `NA`). This is a fabrication hazard if backfilled blindly.
  - Cross-position fields are **empty strings** (not 0) when inapplicable: a WR row has
    `passing_epa=""`, `pacr=""`, etc. → these become `null` (correctly absent), while `carries=0`
    stays a real `0`. This empty-vs-zero distinction is the key to honest null handling (see Part 3).
- **Volume (counted, not estimated):** offensive (QB/RB/WR/TE/FB) player-game rows ≈ **6224 (2024)**,
  **5811 (2012)**; distinct offensive players ≈ **601 (2024)**, **572 (2012)**.

> **SUPERSEDED 2026-07-03 by `data-completeness-audit.md`.** Slice 1 (base per-game gamelogs) is
> **SHIPPED**; the NGS/PFR/FTN follow-up conclusions below are stale (notably NGS is now
> `.csv.gz`-accessible, contradicting the parquet-only finding here). Use the audit's backlog
> (B8 NGS, PFR season, FTN DEFER) for sequencing.

### B. PFR advanced — `pfr_advstats` release
- **CSV assets:** combined season `advstats_season_{pass,rush,rec,def}.csv`, **and** per-year weekly
  `advstats_week_{pass,rush,rec,def}_<year>.csv` — but weekly CSVs exist **only 2018+** (verified:
  earliest weekly asset is `_2018`).
- **Join id:** `pfr_player_id` (e.g. `RiceRa01`) — **NOT gsis**. The weekly files carry **no gsis**
  (header: `game_id, pfr_game_id, season, week, game_type, team, opponent, pfr_player_name, pfr_player_id, …`).
  Joining to sleeper_id needs a **pfr_id → sleeper_id** map, which the existing crosswalk does not
  expose (it is gsis-keyed only). The DynastyProcess source `db_playerids.csv` **does** carry a
  `pfr_id` column, so a crosswalk extension is feasible — but it is net-new plumbing (see Slice 2).
- **Grain / fields (verified weekly headers, 2024):**
  - `advstats_week_rec_<year>`: `rushing_broken_tackles, receiving_broken_tackles, passing_drops,
    passing_drop_pct, receiving_drop, receiving_drop_pct, receiving_int, receiving_rat`.
    **Important:** the rich receiving fields **YBC / YAC / aDOT are NOT in the weekly rec file** —
    they exist only in the **season** file (`advstats_season_rec.csv`: `ybc, ybc_r, yac, yac_r, adot,
    brk_tkl, …`, coverage 2018+). So PFR's headline receiving metrics are **season-grain only**.
  - `advstats_week_rush_<year>`: `carries, rushing_yards_before_contact(_avg), rushing_yards_after_contact(_avg),
    rushing_broken_tackles, receiving_broken_tackles` → rushing YBC/YAC **is** per-game.
  - `advstats_week_pass_<year>`: `passing_drops, passing_bad_throws(_pct), times_sacked, times_blitzed,
    times_hurried, times_hit, times_pressured(_pct), def_*` → pressure/sack context **is** per-game.
- **Coverage:** weekly 2018+ only.

### C. Next Gen Stats — `nextgen_stats` release
- **No CSV at all.** Assets are `.qs`/`.rds`/`.parquet` only (verified: `ngs_2024_receiving.csv`
  → **HTTP 404**). Per-year, per-type (`ngs_<year>_{passing,receiving,rushing}`), **2016+**.
- **Consequence:** this repo's ingest is **CSV-only** (`lib/nflverse.mjs` has a CSV parser, no
  parquet/qs reader). NGS requires a new non-CSV decode path → heavier follow-up.
- **Join id:** NGS files carry `player_gsis_id` (joins via existing crosswalk) once decoded.

### D. FTN charting — `ftn_charting` release
- **CSV present** (`ftn_charting_<year>.csv`), **2022+** only.
- **Grain: play-level, NOT player-level.** Header keys on `ftn_game_id, nflverse_game_id, ftn_play_id,
  nflverse_play_id` and has **no player id** (fields: `is_no_huddle, is_motion, is_play_action,
  is_screen_pass, is_rpo, is_qb_out_of_pocket, is_drop, n_blitzers, n_pass_rushers, …`).
- **Consequence:** to attribute FTN to players you must first join to play-by-play (`load_pbp`) to map
  plays → players. That is a much larger pipeline (no pbp ingest exists here yet). Lowest priority.

### Inventory verdict
The task's suggested default ("PFR advanced family + per-game base counting stats") does **not**
survive the live data: PFR's marquee receiving metrics (YBC/YAC/aDOT) are **season-grain only**, PFR
weekly is **2018+** and needs a **new pfr_id crosswalk**, NGS has **no CSV**, and FTN is **play-level
with no player id**. The one coherent source that is **per-game, full-CSV, gsis-joinable via the
existing crosswalk, and 2012-aligned with the rest of the repo** is the **base `stats_player_week`**
file — which the existing ingest already fetches but mines for only 4 receiving ratios. It natively
carries air yards, YAC, EPA, first downs, cpoe, target/air-yards share, wopr/racr/pacr at per-game
grain across pass/rush/rec.

**→ Recommended starting slice = the base per-game player stats (Slice 1 below).** It is broader,
lower-risk, and longer-coverage than the PFR-first option. PFR weekly, NGS, and FTN are sequenced
follow-ups with the caveats above.

---

## Part 2 — Slice plan (this task implements Slice 1 only)

| Slice | Source | Grain | Join | Coverage | New plumbing | Status |
|---|---|---|---|---|---|---|
| **1 (this task)** | `stats_player_week_<year>.csv` | per-game | gsis → existing crosswalk | 2012+ | none (reuse `fetchPlayerStatsCsv`) | **implement now** |
| 2 | `advstats_week_{pass,rush,rec}_<year>.csv` (PFR) | per-game | **pfr_id** → crosswalk extension | 2018+ | extend `playerids` to emit a `pfrIds` map; new parser per family | follow-up |
| 3 | `nextgen_stats` (NGS) | per-game | gsis | 2016+ | **parquet/qs decoder** (no CSV) | follow-up |
| 4 | `ftn_charting_<year>.csv` + pbp | play→player | via pbp | 2022+ | pbp ingest + play→player attribution | follow-up |

PFR **season** YBC/YAC/aDOT (the receiving fields fantasy folks want) are a possible **Slice 2b**:
a season-grain companion (`advstats_season_rec.csv`, 2018+, pfr_id join) — but it is season-grain, so
it belongs beside `advstats/`, not in the per-game file. Out of scope here; noted for sequencing.

---

## Part 3 — Slice 1 design (the served artifact)

### Naming (ad-blocker-safe — avoids `adv`/`ad`/`ads`/`analytics`/`tracking`)
- **Served path:** `nflverse/gamelogs/<year>.json`  ("gamelogs" contains none of the banned tokens).
- **Subcommand:** `gamelogs`
- **Script:** `scripts/update-gamelogs.mjs`, export `updateGameLogs({ year, all, dryRun, force })`
- **Lib (in `lib/nflverse.mjs`):** reuse `fetchPlayerStatsCsv`; add `parsePlayerGameLogs`,
  `rekeyGameLogsBySleeper`, constants `MIN_PLAYERGAME_ROWS`, `MIN_GAMELOG_SEASON`.
- **Validator (in `lib/validate.mjs`):** `validateGameLogs(players, { year })`.
- **Action:** `.github/workflows/nflverse-gamelogs.yml`.
- **Ad-blocker observation (do NOT change here):** the **existing** `nflverse/advstats/` path contains
  the tokens `adv`/`ad` and **is itself at ad-blocker risk** today. Flag only — out of scope.

### Served shape — `nflverse/gamelogs/<year>.json`
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

Key semantics:
- **Keyed by `sleeper_id`** at the top level (app joins directly, like `advstats`/`roster`). Each
  player carries a `games[]` array, one element per game (per-game grain).
- **`rowCount` = total per-game rows** (the grain count — the schedule precedent counts the grain,
  `games`). **`playerCount` = `Object.keys(players).length`.** Manifest `recordCount` = `rowCount`.
- **`unmapped`** = distinct gsis ids dropped for having no crosswalk entry (mirrors `advstats.unmapped`).
- **Trades are free:** each game row carries its own `team`/`opponent`, so a mid-season trade is just
  rows with different `team` — none of the season-aggregation traded-player machinery is needed.
- **Honest nulls via omit-on-null (the empty-vs-zero rule):** for every mapped stat column compute
  `v = numOrNull(cell)`; **if `v === null`, OMIT the key**; else store `v`. Because the source uses
  empty string for inapplicable cross-position fields and `'0'` for real zeros, a WR row keeps
  `carries: 0` (real) but omits `passingEpa` (absent), and a pre-charting season omits
  `receivingAirYards` rather than fabricating `0`. **Absent key ≡ stat not recorded for that game
  (null); never zero-filled.** Identity fields (`week`, `seasonType`, `team`, `opponent`) are always
  present. This also keeps files compact (sparse rows).
- **Per-game RATE fields are stored verbatim as that game's value** (`racr`, `targetShare`,
  `airYardsShare`, `wopr`, `pacr`, `passingCpoe`). They are single-game rates — **never sum them**;
  to get a season figure, recompute from components (as `advstats` does). Documented loudly; this is
  the `pass_rtg`/`cmp_pct` aggregation trap the mandate calls out, avoided by per-game storage.
- **`fantasyPoints`/`fantasyPointsPpr`** are **nflverse's** default scoring, captured for
  display/training only. They are NOT Sleeper/app scoring and must **never** feed grading/projection.

### Position scope
QB, RB, WR, TE, FB (offensive skill set). Capture the **pass + rush + receiving + scoring** families
(every column listed in Part 1.A under those families) — no field pruned for "predictive value".
The `def_*` (IDP), special-teams-return, and kicking (`fg_*/pat_*/gwfg_*`) families are **out of
scope** for this slice: they are structurally empty for offensive players (a quality/relevance call,
not a predictive-value prune) and a future slice can widen the position filter + column map to add
them. Document this explicitly.

### Coverage floor
`MIN_GAMELOG_SEASON = 2012` — aligns with `nfl/season-totals` and `advstats`, and sits inside the
charting era so every captured field is genuinely populated. The source goes back to 1999, but
pre-2006 air-yards/YAC are source-zero-filled (Part 1.A) — do **not** backfill below 2012 without
treating those zeros as absent. (`schedule` floors at 1999 because its fields are charting-independent;
`gamelogs` cannot, hence the higher floor.)

### Sparsity / quality write-gate
`MIN_PLAYERGAME_ROWS = 3000` — ≈50% of a full ~6000-row season (mirrors the `MIN_ADVSTATS_ROWS`
"≈50% floor" reasoning). Passes 2012 (5811) and 2024 (6224); catches a half-truncated fetch. Gate on
**`rowCount` (total game rows)**. Below the floor → "preliminary/partial, skip" (no write, no manifest).

### inProgress semantics
**`inProgress: false` always** — same deliberate deviation as roster/advstats/schedule (CLAUDE.md
Invariant 5): the app has no live fallback for these, so it must read them from the store. Current-
season weekly mutation is handled by SHA-256 content-hash dedup + `lastModified` cache invalidation.

### Modes (mirror advstats + schedule)
- default: current season (from `fetchCurrentNflSeason`).
- `--year YYYY`: that season.
- `--all`: backfill `MIN_GAMELOG_SEASON … currentSeason` (loop years; each fetches its own per-year
  CSV; past-season existing files require `--force`).
- `--dry-run`, `--force`: as elsewhere.

---

## Part 4 — Edits, grouped by file (with anchors)

### File: `lib/nflverse.mjs` (read narrowly around the cited anchors)
Mirror the existing parser idioms exactly (quote-aware split, `numOrNull`, fail-loud header guard).

1. **Add sparsity/floor constants** next to `MIN_ADVSTATS_ROWS` (lib/nflverse.mjs:28-33) and
   `MIN_SCHEDULE_SEASON`/`MIN_SCHEDULE_GAMES` (lib/nflverse.mjs:35-43):
   ```js
   /** Minimum per-game rows for a gamelogs season file to ship (≈50% of a ~6000-row season). */
   export const MIN_PLAYERGAME_ROWS = 3000;
   /** Earliest season to ingest gamelogs (charting era; aligns with nfl/season-totals + advstats). */
   export const MIN_GAMELOG_SEASON = 2012;
   ```

2. **Add `parsePlayerGameLogs(csv, { positions } )`** after `aggregateAdvReceiving`
   (ends lib/nflverse.mjs:616) / `rekeyBySleeper` (ends lib/nflverse.mjs:641). Reuse
   `splitCsvLine` (lib/nflverse.mjs:62) and `numOrNull` (lib/nflverse.mjs:96).
   ```js
   /**
    * Parse stats_player_week_<year>.csv into per-game logs grouped by gsis id.
    * Offensive positions only (default QB/RB/WR/TE/FB). One games[] element per row.
    * Honest nulls: each stat cell → numOrNull; null-valued keys are OMITTED (empty-vs-zero rule).
    * Throws if required columns missing (fail-loud on upstream format change).
    *
    * @param {string} csv
    * @param {{positions?: string[]}} [opts]
    * @returns {{ byGsis: Record<string, {gsisId,name,position,games:object[]}>,
    *             season: number|null, rowCount: number }}   rowCount = total game rows
    */
   export function parsePlayerGameLogs(csv, { positions = ['QB','RB','WR','TE','FB'] } = {}) { … }
   ```
   Implementation notes:
   - Required columns (throw if any `=== -1`): `player_id`, `position`, `season`, `week`.
   - Build an explicit **source→served camelCase map** for the pass/rush/rec/scoring families
     (Part 1.A). Suggested constant inside the module:
     ```js
     const GAMELOG_STAT_COLS = {
       completions:'completions', attempts:'attempts', passing_yards:'passingYards',
       passing_tds:'passingTds', passing_interceptions:'passingInterceptions',
       sacks_suffered:'sacksSuffered', sack_yards_lost:'sackYardsLost',
       sack_fumbles:'sackFumbles', sack_fumbles_lost:'sackFumblesLost',
       passing_air_yards:'passingAirYards', passing_yards_after_catch:'passingYardsAfterCatch',
       passing_first_downs:'passingFirstDowns', passing_epa:'passingEpa',
       passing_cpoe:'passingCpoe', passing_2pt_conversions:'passing2ptConversions', pacr:'pacr',
       carries:'carries', rushing_yards:'rushingYards', rushing_tds:'rushingTds',
       rushing_fumbles:'rushingFumbles', rushing_fumbles_lost:'rushingFumblesLost',
       rushing_first_downs:'rushingFirstDowns', rushing_epa:'rushingEpa',
       rushing_2pt_conversions:'rushing2ptConversions',
       receptions:'receptions', targets:'targets', receiving_yards:'receivingYards',
       receiving_tds:'receivingTds', receiving_fumbles:'receivingFumbles',
       receiving_fumbles_lost:'receivingFumblesLost', receiving_air_yards:'receivingAirYards',
       receiving_yards_after_catch:'receivingYardsAfterCatch',
       receiving_first_downs:'receivingFirstDowns', receiving_epa:'receivingEpa',
       receiving_2pt_conversions:'receiving2ptConversions', racr:'racr',
       target_share:'targetShare', air_yards_share:'airYardsShare', wopr:'wopr',
       fantasy_points:'fantasyPoints', fantasy_points_ppr:'fantasyPointsPpr',
     };
     ```
   - Resolve each mapped column's index once from the header (skip columns absent from an older
     header gracefully — though the header is stable 2012+, a missing column just yields no key).
   - Per data row: read `position`; skip if not in `positions`. Build `game = { week, seasonType,
     team, opponent }` (identity always present; `week`=parseInt, others trimmed-string-or-null).
     For each `[src, dst]` in `GAMELOG_STAT_COLS`: `const v = numOrNull(fields[idx]); if (v !== null)
     game[dst] = v;` (omit-on-null). Push to `byGsis[gsis].games`.
   - Capture `name` (`player_display_name`, last non-empty wins) and `position` (last non-empty wins)
     at the player level, like `aggregateAdvReceiving` (lib/nflverse.mjs:492-493).
   - `season` from first parseable `season` cell. `rowCount` = sum of `games.length`.

3. **Add `rekeyGameLogsBySleeper(byGsis, crosswalkIds)`** modeled on `rekeyBySleeper`
   (lib/nflverse.mjs:628-641):
   ```js
   /** Re-key gamelogs byGsis → sleeper_id via crosswalk .ids. Returns { players, unmapped }.
    *  unmapped counts DISTINCT gsis ids with no mapping (whole player dropped). */
   export function rekeyGameLogsBySleeper(byGsis, crosswalkIds) { … }  // same loop as rekeyBySleeper:631-639
   ```

### File: `lib/validate.mjs`
4. **Extend the import** at lib/validate.mjs:295 to add the new constant:
   ```js
   import { MIN_ROSTER_IDS, MIN_PLAYERID_ROWS, MIN_ADVSTATS_ROWS, MIN_SCHEDULE_GAMES,
            MIN_PLAYERGAME_ROWS } from './nflverse.mjs';
   ```
5. **Add `validateGameLogs(players, { year })`** after `validateSchedule` (ends lib/validate.mjs:455),
   modeled on `validateAdvStats` (lib/validate.mjs:406-422) + the finiteness sweep `findNonFinite`
   (lib/validate.mjs:69):
   ```js
   export function validateGameLogs(players, { year }) {
     const entries = Object.values(players);
     const totalRows = entries.reduce((s, p) => s + (p.games?.length || 0), 0);
     if (totalRows < MIN_PLAYERGAME_ROWS)
       throw new Error(`[validate] gamelogs ${year}: only ${totalRows} game rows — expected ≥ ${MIN_PLAYERGAME_ROWS}. Possible truncated fetch.`);
     // format-drift guard: >50% players with empty games[] → column drift
     const empty = entries.filter(p => !p.games || p.games.length === 0).length;
     if (empty > entries.length * 0.5)
       throw new Error(`[validate] gamelogs ${year}: ${empty}/${entries.length} players have no game rows — possible column drift.`);
     // finiteness (numOrNull never yields NaN, but defend in depth)
     const nf = findNonFinite(players);
     if (nf) throw new Error(`[validate] gamelogs ${year}: non-finite numeric at ${nf.path} (=${String(nf.value)}).`);
     // per-game targetShare must be in [0,1] where present (airYardsShare may be negative — skip)
     for (const p of entries) for (const g of (p.games || []))
       if (g.targetShare != null && (g.targetShare < 0 || g.targetShare > 1))
         throw new Error(`[validate] gamelogs ${year}: targetShare out of [0,1] for ${p.gsisId} wk${g.week} (=${g.targetShare}).`);
   }
   ```

### File: `scripts/update-gamelogs.mjs` (new — model on `update-advstats.mjs` + `update-schedule.mjs`)
6. Create the writer. Structure mirrors `updateAdvStats` (scripts/update-advstats.mjs:40-144) for the
   per-year join/dedup/gate, and `updateSchedule` (scripts/update-schedule.mjs:38-107) for `--all`
   looping. Header docstring in the house style (cite the inventory + invariant 5).
   ```js
   import crypto from 'crypto';
   import { fetchPlayerStatsCsv, parsePlayerGameLogs, rekeyGameLogsBySleeper,
            MIN_PLAYERGAME_ROWS, MIN_GAMELOG_SEASON } from '../lib/nflverse.mjs';
   import { readJson, writeJsonStable, setStepOutput } from '../lib/io.mjs';
   import { updateManifestEntry } from '../lib/manifest.mjs';
   import { validateGameLogs } from '../lib/validate.mjs';
   import { fetchCurrentNflSeason } from '../lib/sleeper.mjs';

   function playersHash(players) { /* copy verbatim from update-advstats.mjs:34-38 */ }

   export async function updateGameLogs({ year: yearOpt = null, all = false, dryRun = false, force = false } = {}) {
     const currentSeason = await fetchCurrentNflSeason();
     // resolve seasons: all → MIN_GAMELOG_SEASON..currentSeason ; else [yearOpt ?? currentSeason]
     // read crosswalk ONCE before the loop (readJson('nflverse/playerids.json')); same dry-run-tolerant
     //   missing-crosswalk handling as update-advstats.mjs:64-77 (warn+return in dry-run, else throw).
     // if (!all) setStepOutput('season', seasons[0]);   // Actions purge (invariant 8)
     for (const season of seasons) {
       // fetchPlayerStatsCsv(season); null → "not published yet" → continue
       // const { byGsis, season: parsed, rowCount: parsedRows } = parsePlayerGameLogs(csv);
       // const { players, unmapped } = rekeyGameLogsBySleeper(byGsis, cw.ids);
       // rowCount = Σ games ; if rowCount < MIN_PLAYERGAME_ROWS → preliminary, continue
       // validateGameLogs(players, { year: season });
       // content-hash dedup (playersHash) vs existing nflverse/gamelogs/<season>.json
       // past-season force gate (isPast && existing && !force) → throw (or dry-run note)
       // write { schemaVersion:1, season:parsed??season, generatedAt, rowCount, playerCount, unmapped, players }
       // updateManifestEntry({ path, recordCount: rowCount, inProgress: false, schemaVersion: 1 })
     }
   }
   ```
   - `playerCount = Object.keys(players).length`; `rowCount` = total game rows; manifest
     `recordCount = rowCount`.

### File: `bin/update.mjs`
7. **Import** beside the other script imports (bin/update.mjs:31-39):
   `import { updateGameLogs } from '../scripts/update-gamelogs.mjs';`
8. **Dispatch case** in the `switch` (bin/update.mjs:126-153), after the `schedule` case:
   ```js
   case 'gamelogs':
     await updateGameLogs(opts);
     break;
   ```
   (`opts` at bin/update.mjs:122 already carries `{ year, category, force, dryRun, all }` — `all` is
   parsed at bin/update.mjs:57.)
9. **Help text** — add to `printHelp()` SUBCOMMANDS (bin/update.mjs:71-85) and EXAMPLES
   (bin/update.mjs:93-112):
   ```
   gamelogs                    nflverse per-game player stats (QB/RB/WR/TE/FB), keyed by sleeper_id
   gamelogs --year YYYY        Per-game logs for a specific season
   gamelogs --all              Backfill every season (≥ 2012)
   ```
   ```
   node bin/update.mjs gamelogs --year 2023
   node bin/update.mjs gamelogs --year 2023 --dry-run
   node bin/update.mjs gamelogs --all
   ```

### File: `package.json`
10. **Append the gamelogs dry-run to the `smoke` script** (package.json:14), at the end of the chain:
    `… && node bin/update.mjs schedule --year 2023 --dry-run && node bin/update.mjs gamelogs --year 2023 --dry-run`

### File: `.github/workflows/nflverse-gamelogs.yml` (new — clone `nflverse-advstats.yml`)
11. Copy `nflverse-advstats.yml` verbatim and change: `name: Weekly nflverse gamelogs`; cron to a
    **free distinct slot — Saturday 13:47 UTC** (`cron: "47 13 * * 6"`; Mon=KTC, Tue=roster,
    Wed=playerids, Thu=advstats, Fri=schedule are taken). Run **after** Wed playerids so the gsis
    re-key hits the freshest crosswalk (base player_stats settle Tue/Wed post-games; Saturday is safe).
    Step: `run: node bin/update.mjs gamelogs`. Purge block identical to advstats (manifest +
    `nflverse/gamelogs/${SEASON}.json`, `SEASON` from `steps.fetch.outputs.season` — invariant 8;
    never `date -u +%Y`). `git add nflverse/ manifest.json`.

### File: `.github/workflows/smoke-test.yml`
12. **Add an explicit dry-run step** after the advstats step (smoke-test.yml:49-50):
    ```yaml
    - name: Smoke test — gamelogs 2023 dry-run
      run: node bin/update.mjs gamelogs --year 2023 --dry-run
    ```

### Backfill (one-time, manual, Session 2 run step — not committed code)
13. After merge, run `node bin/update.mjs gamelogs --all --force` once to populate 2012…current, then
    commit `nflverse/gamelogs/*.json` + `manifest.json`. **Size watch (ops note):** ~6000 rows ×
    ~20 non-null fields, pretty-printed (`writeJsonStable` 2-space) → multi-MB per season. Sparse
    omit-on-null keeps it bounded, but the implementer should eyeball the largest file; if a season
    file is implausibly large for jsDelivr/repo health, a **schemaVersion-2 compact encoding**
    (array-of-arrays + `columns` header) is the documented escape hatch — do not adopt it in Slice 1
    (stay on the readable keyed shape per repo convention).

---

## Docs updates (apply mechanically)

### `README.md`
1. **Folder structure** (README.md:48-55, inside the `nflverse/` block): add a line after the
   `advstats/` line (README.md:54-55):
   ```
       gamelogs/                 — nflverse per-game player stats (QB/RB/WR/TE/FB), one file per year, keyed by sleeper_id
         2024.json
   ```
2. **New schema section** — insert a `### `nflverse/gamelogs/<year>.json`` subsection between the
   `advstats` section (ends README.md:438 with its `---`) and the `schedule` section (starts
   README.md:440). Use the Part 3 shape JSON and document, in this order: per-game grain & sleeper_id
   keying; `rowCount`=game rows / `playerCount` / `unmapped`; **omit-on-null empty-vs-zero rule**;
   **per-game rates are single-game — never sum** (the `pass_rtg`/`cmp_pct` trap); `fantasyPoints*`
   are **nflverse** scoring (not Sleeper/app, not for grading); position scope QB/RB/WR/TE/FB and the
   out-of-scope def/ST/kicking families; coverage floor **2012** + the pre-2006 zero-fill caveat;
   `MIN_PLAYERGAME_ROWS = 3000` gate (app must re-assert on `rowCount`); `inProgress: false`
   deviation; Saturday 13:47 UTC `nflverse-gamelogs.yml` refresh + `--all` backfill. Include the
   command block:
   ```sh
   node bin/update.mjs gamelogs --year 2023
   node bin/update.mjs gamelogs --year 2023 --dry-run
   node bin/update.mjs gamelogs            # current season
   node bin/update.mjs gamelogs --all      # backfill ≥ 2012
   ```
3. **Update scripts → Subcommands** (README.md:538-570): add, after the `schedule` examples
   (README.md:567-570):
   ```sh
   # Fetch nflverse per-game player stats (QB/RB/WR/TE/FB), re-keyed to sleeper_id
   node bin/update.mjs gamelogs --year 2023
   node bin/update.mjs gamelogs            # current season
   node bin/update.mjs gamelogs --all      # backfill ≥ 2012
   ```
   and a dry-run line after README.md:582: `node bin/update.mjs gamelogs --year 2023 --dry-run`,
   and add `gamelogs` to the `--force` list note near README.md:584-588.

### `CLAUDE.md`
4. **Commands → Update CLI** (CLAUDE.md:30-34): add after the `advstats` line (CLAUDE.md:30) /
   `schedule` lines (CLAUDE.md:31-33):
   ```
   node bin/update.mjs gamelogs --year YYYY         # nflverse per-game player stats (QB/RB/WR/TE/FB), sleeper_id-keyed
   node bin/update.mjs gamelogs --all               # backfill every season (≥ 2012)
   ```
   and add `gamelogs` to the `--force` applies-to note at CLAUDE.md:37 (`nfl/cfbd/roster/advstats`
   → `nfl/cfbd/roster/advstats/gamelogs`).
5. **Smoke description** (CLAUDE.md:91): append `+gamelogs` to the dry-run list string.
6. **Navigation map** (CLAUDE.md:99-152): add three rows —
   - after the `update-schedule.mjs` row (CLAUDE.md:120):
     `| `scripts/update-gamelogs.mjs` | nflverse per-game player stats ingest — fetch weekly CSV, parse per-game logs, re-key to sleeper_id, write `nflverse/gamelogs/<year>.json` |`
   - update the `lib/nflverse.mjs` row (CLAUDE.md:121) exports list to add
     `parsePlayerGameLogs`/`rekeyGameLogsBySleeper`, `MIN_PLAYERGAME_ROWS`, `MIN_GAMELOG_SEASON`.
   - after the `nflverse/schedule/` row (CLAUDE.md:143):
     `| `nflverse/gamelogs/` | nflverse per-game player stats (QB/RB/WR/TE/FB), one JSON per year (`<year>.json`), keyed by `sleeper_id`; `players[sid].games[]` |`
   - after the schedule workflow row (CLAUDE.md:148):
     `| `.github/workflows/nflverse-gamelogs.yml` | Saturday weekly nflverse gamelogs refresh (after playerids), content-hash dedup, CDN purge |`
7. **Invariant 8 (CDN purge)** (CLAUDE.md:174): add `nflverse/gamelogs` to the season-keyed-files
   list: `(`nflverse/roster`, `nflverse/advstats`, `nflverse/schedule`, `nflverse/gamelogs`)`.
8. **Cross-repo contracts table** (CLAUDE.md:184-198): add a new row (see Cross-repo impact below).
9. **Self-maintenance / signal registry** (CLAUDE.md:222-224): the new source must be flagged for the
   app's `docs/signal-registry.md` (new Source row: per-game nflverse player stats; Historical
   coverage 2012+; Reconstructable — re-ingestable from nflverse). State this in the Session-2 task
   summary (cannot edit the app repo here).

(There are two invariants numbered "8" in CLAUDE.md today — the CDN-purge one at line 174 is the
intended target; leave the numbering bug alone, out of scope.)

---

## Tests to add

This repo's equivalents are **`node --test`** unit tests (`test/nflverse.test.mjs`) + the
**`npm run smoke`** dry-run chain. **Not Vitest.**

### `test/nflverse.test.mjs` (extend; mirror sections F/G/H for advstats)
Add to the imports (test/nflverse.test.mjs:24-30): `parsePlayerGameLogs, rekeyGameLogsBySleeper,
MIN_PLAYERGAME_ROWS, MIN_GAMELOG_SEASON` and `validateGameLogs`.

- **`parsePlayerGameLogs` — happy path.** Input: a tiny CSV with the real header columns and 2
  players × 2 weeks (one WR with receiving cells + empty passing cells; one QB with passing cells).
  Expected: `byGsis` has both; WR game row **has** `receptions`/`targets`/`receivingYards` and
  **omits** `passingEpa`/`pacr` (empty→null→omitted); `carries:0` **present** (real zero); QB row has
  passing keys; `rowCount === 4`; `season` parsed.
- **omit-on-null / empty-vs-zero.** Assert a `'0'` cell → key present `=0`; an `''` cell → key
  **absent**; an `'NA'` cell → key **absent**.
- **position filter.** A `K`/`CB` row is excluded; QB/RB/WR/TE/FB included.
- **identity always present.** `week`/`seasonType`/`team`/`opponent` present even when all stat cells
  are empty.
- **missing required column → throws.** Drop `player_id` (or `week`) from the header → expect throw
  (fail-loud format-drift, like aggregateAdvReceiving:437-443).
- **`rekeyGameLogsBySleeper`.** Crosswalk maps gsis A→sleeper; gsis B unmapped. Expect
  `players` keyed by sleeper for A, `unmapped === 1`, B dropped. (mirror rekeyBySleeper test G.)
- **`validateGameLogs` edge cases:**
  - sparse season → total game rows < `MIN_PLAYERGAME_ROWS` → throws.
  - missing-field season (all rows omit air-yards keys) → does **not** throw (absent is legal).
  - `targetShare` = 1.0 → passes; `targetShare` = 1.4 → throws; `airYardsShare` = −0.2 → passes
    (negative allowed).
  - `> 50%` players with empty `games[]` → throws (column-drift guard).

### Smoke (already wired by the package.json + smoke-test.yml edits above)
- `node bin/update.mjs gamelogs --year 2023 --dry-run` must exit 0 and print a "would write …"
  plan (no files written). Confirms fetch + parse + crosswalk-tolerant dry-run path. The dry-run
  must tolerate a missing `nflverse/playerids.json` exactly like advstats (warn + return).

---

## Cross-repo impact (sleeper-dashboard app — do NOT edit here)

The app must later mirror this to consume the file. Name it in the Session-2 summary; do not touch
the app repo in this task.

1. **New CLAUDE.md Cross-repo contract row** (app side), to add beside the existing nflverse rows:
   > **nflverse gamelogs (per-game player stats)** — `nflverse/gamelogs/<year>.json`: `{ schemaVersion:1,
   > season, generatedAt, rowCount, playerCount, unmapped, players }`; `players` keyed by `sleeper_id`,
   > each `{ gsisId, name, position, games[] }`; each game `{ week, seasonType, team, opponent, …per-game
   > stats (sparse: absent key = null, never 0) }`. QB/RB/WR/TE/FB; 2012+; per-game grain; rates are
   > single-game (never sum); `fantasyPoints*` are nflverse scoring (not app scoring). `inProgress:false`,
   > `MIN_PLAYERGAME_ROWS = 3000` shared sparsity constant; written by `bin/update.mjs gamelogs`.
   > **View-only — must never feed projection/scoring/grading.** Served shape + `MIN_PLAYERGAME_ROWS`
   > are the contract — change both repos together.
2. **Future app loader** `src/api/nflGameLogs.js` — read via `tryDataStore`/`getManifestEntry`,
   same pattern as `src/api/nflRoster.js` / the planned `nflSchedule.js`; gate on
   `MAX_SUPPORTED_SCHEMA` (schemaVersion 1) and re-assert `rowCount ≥ MIN_PLAYERGAME_ROWS`.
   **Display/training only**; do not import into `seasonProjection.js` or any scoring/grading path.
3. **Signal registry** — add a Source row to the app's `docs/signal-registry.md`: per-game nflverse
   player stats; Historical coverage 2012+; Reconstructable (re-ingestable from nflverse releases).

No app code is changed in this task — these are mirror obligations for a later app-side slice.

---

## Done-definition (Session 2)
1. `npm run smoke` green (includes the new gamelogs dry-run).
2. `npm test` green (new `test/nflverse.test.mjs` cases).
3. `manifest.json` updated for every written `nflverse/gamelogs/<year>.json` (after backfill).
4. CLAUDE.md + README.md edits applied (sections above); Cross-repo + signal-registry obligations
   stated in the task summary so the app repo can mirror.
