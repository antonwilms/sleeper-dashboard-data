# Data catalog

The storage registry of every served data family in this repo: what it is, where it lives, how it
refreshes, what joins it, and what's honestly missing. One section per family; `manifest.json`
stays the machine-readable index — this doc adds the semantics. The *signal* registry (how the app
consumes fields) lives in the app repo at `docs/signal-registry.md`; link, don't merge.

**Doctrine:** all banked data is capture-only/view-only unless an entry in the Cross-repo contract
registry (README.md) says otherwise — it never silently feeds projection/scoring/grading. Gaps are honest: an
upstream-absent year stays absent and documented; nothing is zero-filled, fabricated, or
back-dated. Served paths follow the ad-blocker-safe naming rule (no `adv`/`ad`/`ads`/`analytics`/
`tracking` tokens; the legacy `nflverse/advstats/` path is a known parked violation — do not
propagate the pattern).

**Append convention:** every slice that adds or changes a served family MUST add/update its row
here in the same commit (CLAUDE.md Done-definition). Coverage cells must match `manifest.json`.

**Provenance note (B1, 2026-07-03):** `lib/nflverse.mjs`'s `STATS_BASE` constant switched from the
nflverse legacy `player_stats` release tag (frozen 2025-05-06; missing a valid 2019 asset and all
2025+ assets) to the current `stats_player` tag on **2026-07-03**. This affects the two families
that share `fetchPlayerStatsCsv` — advstats (§10) and gamelogs (§12). Their pre-B1 shipped seasons
(2012–2018, 2020–2024) were fetched from the frozen legacy tag before the switch; the 2019 and 2025
seasons added by B1 were fetched from the live `stats_player` tag after it. Both eras are
header-compatible (column lookup by name; 2025 adds one additive `game_id` column) so the split
does not affect served shape — it is recorded here so provenance stays honest, not silent. See each
family's Source + provenance field below for the per-family detail.

_Last reconciled against manifest.json: 2026-08-24_

---

## Sleeper season totals
- **Served path / subcommand / refresh:** `nfl/season-totals/<year>.json`; `bin/update.mjs nfl` (`--year` optional, defaults to the live season); **`.github/workflows/nfl-season-totals.yml`, Tuesday weekly (in-season-season-totals.md, 2026-08-28)** — in-season files (`inProgress: true`) are re-exported weekly; the validator's full-season floor is self-calibrating (`lib/validate.mjs` `validateNflSeason`, §2.1) so a partial in-season file no longer fails it; a completed season on the scheduled path SKIPS rather than writes (§2.3 — the old manifest-based refusal could still write a sealing regression on the very first run after the season closes; `--force` remains for a deliberate interactive correction)
- **Source + provenance:** Sleeper stats API, aggregated server-side (`lib/sleeper.mjs`)
- **Grain:** player-season + `weeklyPoints`/`weeklyStatus` arrays
- **Join id(s):** sleeper_id (native key)
- **Coverage:** 2012–2025; snap/RZ usage keys ≈2020/2021+ only; per-season `team` (schemaVersion 3); Market Efficiency-set keys (`pass_sack`, `pass_air_yd`, `rush_yac`, `rec_drop`) 2012+, `rush_btkl` 2015+ (zero finite rows 2012–2014) — app-side contract CR-19, view-only; forward bye inference (`weeklyStatus` code `'B'`, D-1) applies **only** to the current/future season's ingest from 2026-08-24 on — every completed 2012–2025 file keeps `'X'` at every bye, permanently (Invariant 1: no re-derivation)
- **schemaVersion:** 4 (app `MAX_SUPPORTED_SCHEMA=4`) — F-24 (2026-08-24) bumped 3→4: `idp_*` (17 keys) and `punt*` (6 keys) dropped from every non-`TEAM_*` row's `stats`; files also minified (`nfl/season-totals/` only — every other served family stays pretty-printed)
- **Sparsity gate:** none — sentinel validation (`NFL_SENTINELS`) + finiteness sweep instead
- **Null semantics:** keys preserved as-is from Sleeper; `pass_rtg`/`cmp_pct` are weekly sums, never season-valid (rate-trap note)
- **Consumption:** app-consumed (`src/api/dataStore.js`)
- **Keep-rationale:** the canonical outcome/actuals store
- **Row composition:** each season-totals file's entries are not uniformly player rows — numeric `sleeper_id` player rows; one `TEAM_<abbr>` whole-team aggregate pseudo-row per team (full stat keys, `gamesPlayed`, per-season `team` field; present since 2026-05-19, commit `135d8ac`); `<abbr>` DEF entries (team defenses; no offensive stat keys); and rare legacy suffixed ids (e.g. `1339z`, seen in 2021). **Contract: consumers must exclude `TEAM_*` rows from any cross-player summation** (the app does this via `teamContext.isTeamAggregateId`). The `TEAM_` prefix is a cross-repo contract — renaming or reformatting it is a breaking change to the app's denominator filter. Analysis consumers (`lib/panel.mjs`) exclude `TEAM_*` via `isTeamAggregateId` (mirrored in `lib/backtest.mjs`, 2026-08-08). `TEAM_*` rows are exempt from the F-24 prune (preserved entire, including a `punts` key some of them carry).
- **`team` (v3+, per-season):** scoring-load-bearing in the app since the R2 flip (2026-07-11) — projection attribution consumes it; the `aggregateWeeks` dominant-team rule is a silent-scoring-change surface (see README.md → Cross-repo contract registry). F-24's in-place field delete never moves `team` (verified empty diff across all 14 seasons at migration time); D-1's bye inference reads `team` but never writes it.

## CFBD college stats
- **Served path / subcommand / refresh:** `college/{passing,receiving,rushing}/<year>.json`; `bin/update.mjs cfbd --year [--category]`; no Action
- **Source + provenance:** CFBD API (key required)
- **Grain:** player-season stat rows (row per statType)
- **Join id(s):** app-side matching via `pivotStatRows` (statType keys are a cross-repo contract)
- **Coverage:** 2017–2025; pre-2017 exists upstream, unbackfilled (audit B18)
- **schemaVersion:** 1
- **Sparsity gate:** none — category/statType validation
- **Null semantics:** absent statTypes absent
- **Consumption:** app-consumed
- **Keep-rationale:** prospect college drill-down

## KTC dynasty values
- **Served path / subcommand / refresh:** `ktc/snapshot-<date>.json`; `bin/update.mjs ktc`; Monday Action
- **Source + provenance:** KeepTradeCut scrape
- **Grain:** player, dated snapshot
- **Join id(s):** name-based app-side, matched to Sleeper IDs at runtime via `src/utils/ktcMatch.js` (app repo)
- **Coverage:** 2026-05-18 → present, weekly; no pre-history exists or can be backfilled (audit DEFER)
- **schemaVersion:** 1
- **Sparsity gate:** per-row validation (finite int 0–9999, non-empty name, known-or-null position, count 250–600) + Spearman ordering guard (ρ < 0.90 → `ktc/quarantine/`, unregistered, app-ignored)
- **Manifest registration:** every snapshot registers `inProgress: true` (deliberate "current-value" marker — `scripts/update-ktc.mjs`); snapshots remain append-only and permanent regardless (the marker does not mean re-exportable).
- **Null semantics:** position null permitted for rookie picks; rejected otherwise
- **Consumption:** app-consumed
- **Keep-rationale:** market-value time series

## Projection snapshots
- **Served path / subcommand / refresh:** `snapshots/<date>.json`; `bin/import-snapshot.mjs` + `bin/update.mjs snapshots`; daily via app export
- **Source + provenance:** app-side export (`src/utils/projectionSnapshot.js` writer), imported verbatim
- **Grain:** player, dated
- **Join id(s):** sleeper_id
- **Coverage:** 2026-05-19 → present
- **schemaVersion:** 2 (envelope: `targetSeason`, `currentSeason`, `scoringSettings`)
- **Sparsity gate:** none — registration validates shape
- **Null semantics:** `projection` field is verbatim app output; no null-handling policy at this layer
- **Consumption:** capture-only (grading input; never re-fed to projection)
- **Keep-rationale:** the graded record of what the app predicted

## Grading reports
- **Served path / subcommand / refresh:** `grading/<date>.json`; `bin/grade.mjs --write`; on demand
- **Source + provenance:** derived internally — joins a snapshot to its outcome season-totals file (`lib/grade.mjs`); no external upstream
- **Grain:** snapshot-date
- **Join id(s):** snapshot date ↔ outcome season-totals via sleeper_id
- **Coverage:** on-demand set
- **schemaVersion:** 1
- **Sparsity gate:** none — GradeReport is fully determined by inputs at read time
- **Null semantics:** n/a — derived report, not a sourced dataset
- **Consumption:** banked
- **Keep-rationale:** projection-quality audit trail
- **Note:** `grading/` also holds unregistered `<date>-e0a-verdict.md` and `<date>-r2flip-verdict.md` analysis reports (see Non-served artifacts) — not part of this family.

## Enrichment overlay
- **Served path / subcommand / refresh:** `enrichment/{coaching,scheme,injuries,notes}.json`; `bin/enrich.mjs`; hand-authored (the one non-script family)
- **Source + provenance:** hand-authored; no upstream API
- **Grain:** entry per natural key
- **Join id(s):** natural key (player id or team abbr + year); orphans (no matching season-totals player/team) flagged by `validate`, app silently ignores
- **Coverage (honest):** coaching 95 entries; scheme/injuries/notes **0 entries** — the manual path demonstrably doesn't fill them (audit B5 supersedes injuries)
- **schemaVersion:** 1
- **Sparsity gate:** `validate:enrichment`
- **Null semantics:** required fields per entry enforced by `validate`; missing required fields reject at write
- **Consumption:** app-consumed
- **Keep-rationale:** context the APIs can't provide

## nflverse rosters
- **Served path / subcommand / refresh:** `nflverse/roster/<year>.json`; `bin/update.mjs roster [--year]`; Tuesday Action (current season)
- **Source + provenance:** nflverse `rosters` release, `roster_<year>.csv`
- **Grain:** player-season
- **Join id(s):** sleeper_id (native column upstream)
- **Coverage:** **2016–2026**; **2012–2015 absent and documented** — upstream files exist but carry only 602–1,158 distinct sleeper_ids, under the shared `MIN_ROSTER_IDS` gate (see backlog slice §6 of `.claude/tasks/data-gapfill-and-catalog.md`)
- **schemaVersion:** 1
- **Sparsity gate:** `MIN_ROSTER_IDS = 1500` (cross-repo)
- **Null semantics:** rows without sleeper_id skipped
- **Consumption:** app-consumed (`src/api/nflRoster.js`)
- **Keep-rationale:** era-accurate team/status for join sanity + drill-down

## nflverse draft picks
- **Served path / subcommand / refresh:** `nflverse/draft/draft_picks.json`; `bin/update.mjs draft`; May 1 Action
- **Source + provenance:** nflverse `draft_picks` release
- **Grain:** pick
- **Join id(s):** name/team/year (app `matchNflDraftToSleeper`)
- **Coverage:** 2010 → present (`MIN_DRAFT_YEAR`)
- **schemaVersion:** 1
- **Sparsity gate:** none — `validateDraft` shape checks
- **Null semantics:** n/a — required fields enforced by shape validation
- **Consumption:** app-consumed (`src/api/nflDraft.js`)
- **Keep-rationale:** draft-capital prior

## gsis↔sleeper crosswalk
- **Served path / subcommand / refresh:** `nflverse/playerids.json`; `bin/update.mjs playerids`; Wednesday Action
- **Source + provenance:** DynastyProcess `db_playerids.csv`
- **Grain:** player
- **Join id(s):** IS the join (gsis_id → sleeperId, forward map only)
- **Coverage:** all-history; ~6.1k of ~12.5k source rows served (rows lacking either id skipped); exact count = manifest `recordCount`, refreshed by the Wednesday Action
- **schemaVersion:** 1
- **Sparsity gate:** `MIN_PLAYERID_ROWS = 5000` (internal)
- **Null semantics:** rows lacking either id skipped
- **Consumption:** **internal-only** (server-side re-key for advstats/gamelogs; no app loader)
- **Keep-rationale:** the id substrate every gsis-keyed ingest depends on. (Audit B6 will widen: pfr/espn maps.)

## nflverse advanced receiving
- **Served path / subcommand / refresh:** `nflverse/advstats/<year>.json`; `bin/update.mjs advstats --year`; Thursday Action
- **Source + provenance:** nflverse **`stats_player`** release (current tag, since 2026-07-03), `stats_player_week_<year>.csv` (weekly rows aggregated season-level; ratios recomputed from components, never summed weekly). **Provenance split:** seasons 2012–2018 and 2020–2024 were fetched from the legacy `player_stats` release tag (frozen 2025-05-06; this repo's `STATS_BASE` pointed at it until 2026-07-03). Seasons 2019 and 2025 were added by B1 on 2026-07-03 from the current `stats_player` tag, after the tag-switch fix — 2019's legacy-tag asset was a permanently broken "starter" upload, and 2025 was never mirrored to the legacy tag at all. Both eras are header-compatible (2025 adds one additive `game_id` column; parsers resolve columns by name).
- **Grain:** player-season (WR/TE/RB)
- **Join id(s):** sleeper_id (re-keyed via crosswalk)
- **Coverage:** **2012–2025 complete** (2019/2025 filled by B1 after the frozen legacy-tag fix)
- **schemaVersion:** 1
- **Sparsity gate:** `MIN_ADVSTATS_ROWS = 250` (cross-repo)
- **Null semantics:** ratios null on zero denominators; RB negatives emitted
- **Consumption:** app-consumed (`src/api/advStats.js`; capture-only factors)
- **Keep-rationale:** opportunity-share truth (targetShare/WOPR/RACR). Path-naming: known ad-blocker-rule violation, parked.

## nflverse schedules
- **Served path / subcommand / refresh:** `nflverse/schedule/<year>.json`; `bin/update.mjs schedule [--year|--all]`; Friday Action
- **Source + provenance:** nfldata `games.csv`
- **Grain:** game
- **Join id(s):** `gameId`, team abbrs (+ season-totals per-season `team`)
- **Coverage:** 1999–2026
- **schemaVersion:** 1
- **Sparsity gate:** `MIN_SCHEDULE_GAMES = 200` (cross-repo)
- **Null semantics:** numOrNull; temp/wind honestly null indoors
- **Consumption:** app loader (`src/api/nflSchedule.js` pattern)
- **Keep-rationale:** game context (lines, roof/surface/weather) for every player-game join

## nflverse per-game stats
- **Served path / subcommand / refresh:** `nflverse/gamelogs/<year>.json`; `bin/update.mjs gamelogs [--year|--all]`; Saturday Action
- **Source + provenance:** same `stats_player` weekly asset as advstats, mined per-game. **Provenance split** (same mechanism as advstats above): seasons 2012–2018/2020–2024 originate from the frozen legacy `player_stats` tag (used by this repo's `STATS_BASE` until 2026-07-03); seasons 2019 and 2025 were added by B1 on 2026-07-03 from the live `stats_player` tag.
- **Grain:** player-game (QB/RB/WR/TE/FB)
- **Join id(s):** sleeper_id
- **Coverage:** **2012–2025 complete** (2019/2025 filled by B1)
- **schemaVersion:** 1
- **Sparsity gate:** `MIN_PLAYERGAME_ROWS = 3000` (cross-repo)
- **Null semantics:** omit-on-null (absent key = null, never 0); per-game rate fields verbatim, never summed; `fantasyPoints*` are nflverse scoring, never grading input
- **Consumption:** app loader `src/api/nflGameLogs.js` — **view-only contract** (must never feed projection/scoring/grading)
- **Keep-rationale:** per-game drill-down grain

## nflverse team-context
- **Served path / subcommand / refresh:** `nflverse/teamcontext/<year>.json`; `bin/update.mjs teamcontext [--year|--all]`; Sunday Action
- **Source + provenance:** nflverse **`pbp`** release, `play_by_play_<year>.csv.gz` — derive-and-discard (the ~140MB decompressed CSV is never committed; only the derived team-week rows are). **Era-remap provenance note:** pbp's `posteam`/`defteam`/`home_team`/`away_team` columns are normalized to **current**-franchise codes in every season; this pack remaps them to the era-accurate domain (`LA→STL` ≤2015, `LAC→SD` ≤2016, `LV→OAK` ≤2019) via `eraTeam()` so keys match this repo's schedule/season-totals join domain. **This is the INVERSE of the `nflverse/gamelogs` per-season `team` decision**, which deliberately keeps the nflverse (current-franchise) domain — the two families have different join targets; do not "fix" one to match the other.
- **Grain:** **team-week — TEAM-keyed, the first non-player family** (every other served family is `sleeper_id`-keyed)
- **Join id(s):** era-accurate team abbr → season-totals per-season `team` / gamelogs `games[].team` / schedule teams; `gameId` → schedule (verbatim, no remap needed)
- **Coverage:** 2012–2025 backfill + current (`MIN_TEAMCONTEXT_SEASON`); xpass/PROE upstream boundary 2006 — moot at this family's 2012 floor, documented for any future widening; era remap LA/LAC/LV boundaries documented above
- **schemaVersion:** 1
- **Sparsity gate:** `MIN_TEAMCONTEXT_ROWS = 60` (cross-repo)
- **Null semantics:** rates null on zero denominator (never fabricated); a bye week is an absent row (no placeholder); components + rate both stored — rates never summable, only recomputed from summed components (season-figure recipes documented alongside the served family in README.md)
- **Consumption:** banked view-only until the app loader ships; the projection-engine refactor consumes it later under its own task
- **Keep-rationale:** cross-position context substrate — PROE (pass-tilt), pace, red-zone tendencies (kicker/TD-scorer equity), and defense-faced EPA splits (pass-funnel/run-funnel) condition every position's projection, not just one

## nflverse oline (OL composition, ESPN depth charts)
- **Served path / subcommand / refresh:** `nflverse/oline/<year>.json`; `bin/update.mjs oline [--year|--all]`; Saturday Action
- **Source + provenance:** nflverse `depth_charts` release (ESPN feed), `depth_charts_<year>.csv`. Pre-2025 assets (`depth_charts_2024.csv` and earlier) use a different legacy NFL-feed schema entirely (`season,club_code,week,…,depth_position`) and are deliberately unparsed
- **Grain:** team × ISO-week × slot-rank — one state per (team, ISO-week), reduced from upstream's near-daily cadence by keeping only the week's max-`dt` chart (loss-free; upstream retains the full daily history)
- **Join id(s):** team abbr (schedule-domain, current 32 codes only — ESPN era needs no historical era remap); `gsisId`/`espnId` verbatim per OL entry, no sleeper_id re-key (OL are largely absent from the DynastyProcess crosswalk)
- **Coverage:** 2025 → present (`MIN_OLINE_SEASON`); pre-2025 exists upstream in the legacy schema, unparsed, reconstructable later
- **schemaVersion:** 1
- **Sparsity gate:** `MIN_OLINE_ROWS = 160` (internal — see README.md → Cross-repo contract registry note; no app counterpart)
- **Null semantics:** absent week = no chart published that week (honest-null, never fabricated); `gsisId`/`espnId` null when upstream empty; placeholder ids (e.g. `"WIL597533"`) kept verbatim, format not validated
- **Consumption:** capture-only — no app, projection, grading, or backtest path reads this family
- **Keep-rationale:** forward-capture insurance for OL composition/depth signal; Sleeper cannot express OL slots (0 of 510 OL records carry a depth-chart slot), so this is the only mechanical source for this signal

## Sleeper players-state (weekly status/injury/depth capture)
- **Served path / subcommand / refresh:** `nfl/players-state/<date>.json`; `bin/update.mjs playerstate`; Saturday Action
- **Source + provenance:** Sleeper `/v1/players/nfl` (current-state only; no upstream history)
- **Grain:** player-week snapshot, date-keyed
- **Join id(s):** sleeper_id (native)
- **Coverage:** 2026-07 onward — no backfill possible, upstream is current-state only; this is the whole point of the capture
- **schemaVersion:** 1
- **Sparsity gate:** `MIN_PLAYERSTATE_ROWS = 600` + ≥28 distinct teams; per-record defects (empty/null name/team/position, `active !== true`, invalid `depthChartOrder`) are dropped with a warning rather than hard-thrown, so one malformed record never forfeits the whole capture week
- **Null semantics:** all keys explicit, `null` = upstream null/absent; `newsUpdated`/`searchRank` excluded from the dedup hash (both churn continuously) but still written verbatim
- **Consumption:** capture-only — no app, projection, grading, or backtest path reads this family; activation requires a graded gate
- **Keep-rationale:** the only Sleeper-sourced record of `status`/`injury_status`/depth-chart state over time; every uncaptured week is permanently lost (no server-side history exists)

---

## Non-served artifacts

Outside the catalog contract (not app-consumed; unregistered except where noted):

- **`backtests/`** — offline analysis JSONs written by `bin/backtest.mjs --write`; not wired into smoke, not the snapshot grader; also the E-0a panel/fit artifacts (`<date>-e0a-*.json`) from `bin/panel.mjs --write`, the R2 flip-gate artifacts (`<date>-r2flip-{panel,fit}.json`) from `bin/panel.mjs --flip-gate --write`, and the R3-FIT fitted-exponent artifacts (`<date>-r3fit-{panel,fit}.json`) from `bin/panel.mjs --fit --write`.
- **`grading/<date>-e0a-verdict.md`** — human-readable E-0a verdict written by `bin/panel.mjs --write`; unregistered analysis reports (`<date>-e0a-verdict.md`, `<date>-r2flip-verdict.md`, `<date>-r3fit-verdict.md`) (the registered `grading/<date>.json` family from `bin/grade.mjs` is unchanged).
- **`raw/`** — legacy one-time dumps (league/roster/user/player-state Sleeper snapshots + CFBD player manifests, 14 files). These 14 are registered in `manifest.json` (the only entries in this section that are) but are not a served family. The earlier 252 `raw/stats-*.json` dumps referenced by `.claude/tasks/retire-raw-stats.md` have already been retired and removed from disk.
- **`ktc/quarantine/`** — script-produced when a KTC scrape trips the Spearman ordering guard; unregistered, app-ignored; does not exist yet — created on demand by `scripts/update-ktc.mjs` on the first guard trip (no scrape has been quarantined).
- **`ktc/last-checked.json`** + **`nflverse/last-checked-roster.json`** — run markers, not data.

---

## Catalog-vs-manifest reconcile

Run after any change to a served family (§ drift prevention below):

```sh
node -e '
const m = JSON.parse(require("fs").readFileSync("manifest.json","utf8")).files;
for (const fam of ["advstats","gamelogs","roster","teamcontext"]) {
  const years = Object.keys(m).filter(k => k.startsWith(`nflverse/${fam}/`))
    .map(k => k.match(/(\d{4})\.json$/)?.[1]).filter(Boolean).sort();
  console.log(fam, years.join(","));
}'
```

Current output (2026-07-04), matching the coverage cells above verbatim:

```
advstats 2012,2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025
gamelogs 2012,2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025
roster 2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2026
teamcontext 2012,2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025
```

## Drift prevention

Three anchors, no new machinery: (1) the header's append convention line; (2) a CLAUDE.md
Done-definition step so no slice completes without its catalog row; (3) the reconcile one-liner
above, which compares coverage cells against `manifest.json` — cheap enough to run in any session
that touches served data. An automated reconciliation script is a possible later nicety; out of
scope for now.
