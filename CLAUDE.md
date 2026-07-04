# sleeper-dashboard-data

Script-driven longitudinal data store consumed by the sleeper-dashboard React app via jsDelivr. See [README.md](README.md) for full context.

---

## Commands

**Requires Node ≥ 20** (uses native fetch). Install and env setup:

```sh
npm install
cp .env.example .env   # then set CFBD_API_KEY=<your key>
```

`CFBD_API_KEY` is required only for `cfbd` subcommand; all others run unauthenticated.

### Update CLI — `bin/update.mjs`

```sh
node bin/update.mjs nfl  --year YYYY              # NFL season totals from Sleeper
node bin/update.mjs cfbd --year YYYY              # CFBD college stats (all categories)
node bin/update.mjs cfbd --year YYYY --category passing|receiving|rushing
node bin/update.mjs ktc                           # KTC dynasty snapshot for today
node bin/update.mjs snapshots                     # Register untracked snapshots/*.json in manifest
node bin/update.mjs roster                        # nflverse season roster (current year, keyed by sleeper_id)
node bin/update.mjs roster --year YYYY            # nflverse season roster for a specific year
node bin/update.mjs draft                         # nflverse combined draft picks (all years ≥ 2010)
node bin/update.mjs playerids                     # gsis_id→sleeper_id crosswalk (DynastyProcess)
node bin/update.mjs advstats --year YYYY          # nflverse advanced receiving stats (WR/TE/RB), sleeper_id-keyed
node bin/update.mjs schedule                      # nflverse NFL schedules + results (current season)
node bin/update.mjs schedule --year YYYY          # schedule for a specific season
node bin/update.mjs schedule --all                # backfill every season (≥ 1999)
node bin/update.mjs gamelogs --year YYYY          # nflverse per-game player stats (QB/RB/WR/TE/FB), sleeper_id-keyed
node bin/update.mjs gamelogs --all                # backfill every season (≥ 2012)
node bin/update.mjs teamcontext                   # pbp-derived team/game context (PROE, pace, RZ, defense-faced), team-week
node bin/update.mjs teamcontext --year YYYY       # Team context for a specific season
node bin/update.mjs teamcontext --all             # Backfill every season (≥ 2012)

# Flags (any subcommand):
#   --dry-run    fetch + validate, no writes
#   --force      overwrite completed-season files (nfl/cfbd/roster/advstats/schedule/gamelogs/teamcontext)
#   --all        backfill all seasons (schedule/gamelogs/teamcontext subcommands)
```

npm shortcuts: `npm run update:nfl`, `npm run update:cfbd`, `npm run update:ktc`, `npm run import:snapshot`.

### Enrichment CLI — `bin/enrich.mjs`

```sh
node bin/enrich.mjs coaching add --year YYYY --team ABBR --role HC|OC|DC --name "Name"
node bin/enrich.mjs scheme   add --year YYYY --team ABBR --offense "wide zone"
node bin/enrich.mjs injuries add --player ID --year YYYY --segment-start N --type ACL
node bin/enrich.mjs notes    add --player ID --year YYYY --body "text" [--tag scheme]
node bin/enrich.mjs notes    add --team ABBR  --year YYYY --body "text"

node bin/enrich.mjs validate                      # validate all four enrichment files
node bin/enrich.mjs list <type> [--year YYYY]     # print entries for a type
node bin/enrich.mjs remove <id>                   # remove entry by id

# Flags: --dry-run, --force
```

npm shortcuts: `npm run enrich`, `npm run validate:enrichment`.

### Grading CLI — `bin/grade.mjs`

```sh
node bin/grade.mjs <snapshotDate>                       # human report to stdout
node bin/grade.mjs <snapshotDate> --json                # machine-readable GradeReport
node bin/grade.mjs <snapshotDate> --write               # persist grading/<snapshotDate>.json + manifest
node bin/grade.mjs <snapshotDate> --target-season YYYY  # override derived target season
node bin/grade.mjs <snapshotDate> --strict-basis        # skip non-half_ppr snapshots
node bin/grade.mjs --self-test                          # fixture self-check (used by smoke)

# Flags: --dry-run, --json, --write, --strict-basis, --target-season YYYY
```

npm shortcut: `npm run grade`.

### Backtest CLI — `bin/backtest.mjs`

```sh
node bin/backtest.mjs                         # standardized partial β of advstats metrics vs Y+1 PPG
node bin/backtest.mjs --metric M --position P # M: target_share|air_yards_share|wopr|racr|all (camelCase also accepted)
node bin/backtest.mjs --validate              # qualitative D3 trust check
node bin/backtest.mjs --write                 # persist backtests/<date>-<metric>-<pos>.json
# Flags: --from YYYY, --to YYYY, --min-games N, --controls, --by-season, --json, --write, --validate
```

Offline analysis (read-only over advstats + season-totals); **not** wired into smoke; not the snapshot grader (`bin/grade.mjs`). npm shortcut: `npm run backtest`. Methodology, `--controls` semantics, and the β-basis caveats: README → [Analysis / Backtesting](README.md#analysis--backtesting).

### Smoke & validation

```sh
npm run smoke               # dry-run nfl+cfbd+ktc+roster+draft+playerids+advstats+schedule+gamelogs+teamcontext for smoke, validate:enrichment, grade --self-test
npm run validate:enrichment # alias for: node bin/enrich.mjs validate
```

---

## Navigation map

| Path | Purpose |
|---|---|
| `bin/update.mjs` | CLI dispatcher → nfl / cfbd / ktc / snapshots / roster / draft / playerids / advstats / schedule / gamelogs / teamcontext subcommands |
| `bin/enrich.mjs` | Enrichment overlay CLI → add / validate / list / remove |
| `bin/import-snapshot.mjs` | One-command projection-snapshot import (newest ~/Downloads export ZIP → manifest → commit + push); see [snapshot-workflow.md](snapshot-workflow.md) |
| `lib/validate.mjs` | Schema validators (incl. season-totals finiteness sweep, `findNonFinite`); contains `NFL_SENTINELS` and `KTC_TOP_QB_SENTINELS` |
| `lib/fantasyPoints.mjs` | Scoring dot-product (`calculateFantasyPoints`, `RATE_KEYS`); used by the grading in-basis path — see Cross-repo contracts |
| `lib/cfbd.mjs` | CFBD API fetch helpers |
| `lib/enrichment.mjs` | Enrichment schema validation helpers |
| `lib/io.mjs` | File I/O utilities (`readJson`, `writeJsonStable`, `setStepOutput`) |
| `lib/ktc.mjs` | KTC scraper helpers |
| `lib/manifest.mjs` | manifest.json read/write helpers |
| `lib/sleeper.mjs` | Sleeper API fetch helpers |
| `scripts/update-nfl.mjs` | NFL season-totals update logic |
| `scripts/update-cfbd.mjs` | CFBD college stats update logic |
| `scripts/update-ktc.mjs` | KTC snapshot capture logic; exports spearmanRho / ktcOrderingGuard (Spearman ordering guard) + KTC_ORDERING_THRESHOLD |
| `scripts/register-snapshots.mjs` | Snapshot manifest registration |
| `scripts/update-roster.mjs` | nflverse season roster ingest — fetch, parse, dedup, write `nflverse/roster/<year>.json` |
| `scripts/update-draft.mjs` | nflverse draft picks ingest — fetch, parse, dedup, write `nflverse/draft/draft_picks.json` |
| `scripts/update-playerids.mjs` | nflverse gsis↔sleeper crosswalk ingest — fetch, parse, dedup, write `nflverse/playerids.json` |
| `scripts/update-advstats.mjs` | nflverse advanced receiving stats ingest — fetch weekly, recompute season ratios, re-key to sleeper_id, write `nflverse/advstats/<year>.json` |
| `scripts/update-schedule.mjs` | nflverse schedules ingest — fetch combined games.csv, group by season, write `nflverse/schedule/<year>.json` |
| `scripts/update-gamelogs.mjs` | nflverse per-game player stats ingest — fetch weekly CSV, parse per-game logs, re-key to sleeper_id, write `nflverse/gamelogs/<year>.json` |
| `scripts/update-teamcontext.mjs` | pbp-derived team-context ingest — fetch gz, derive, write `nflverse/teamcontext/<year>.json` (no crosswalk read — team-keyed family) |
| `lib/nflverse.mjs` | nflverse fetch + CSV-parse helpers (roster / draft / playerids / advstats / gamelogs / teamcontext); exports `MIN_ROSTER_IDS`, `MIN_DRAFT_YEAR`, `MIN_PLAYERID_ROWS`, `MIN_ADVSTATS_ROWS`, `MIN_SCHEDULE_SEASON`, `MIN_SCHEDULE_GAMES`, `parsePlayerGameLogs`, `rekeyGameLogsBySleeper`, `MIN_PLAYERGAME_ROWS`, `MIN_GAMELOG_SEASON`, `MIN_TEAMCONTEXT_ROWS`, `MIN_TEAMCONTEXT_SEASON`, `fetchPbpCsv`, `aggregateTeamContext`, `eraTeam` sparsity constants + pbp-derivation exports |
| `scripts/grade-snapshot.mjs` | Snapshot adapter — loads snapshot + outcomes, builds GradeInput, orchestrates `gradeSnapshot()` / `runSelfTest()` / `formatHumanReport()` |
| `scripts/backtest-run.mjs` | Backtest orchestration adapter (injectable loader; mirrors `scripts/grade-snapshot.mjs`) |
| `scripts/update-enrichment.mjs` | Enrichment upsert/validate/remove logic |
| `bin/grade.mjs` | Grading harness CLI — parses flags, dispatches to `gradeSnapshot()` or `runSelfTest()` |
| `lib/grade.mjs` | Pure scorer — `scoreProjections(GradeInput) → GradeReport`; no I/O |
| `bin/backtest.mjs` | Thin CLI over `scripts/backtest-run.mjs` — parses flags, dispatches `assembleCohort`/`runMetric`/`runValidate`, formats reports, `--write` to `backtests/` |
| `lib/backtest.mjs` | Pure backtest stats (standardized OLS, quintiles, team totals); reuses `pearson` from `lib/grade.mjs`; no I/O |
| `backtests/` | Backtest reports written by `bin/backtest.mjs --write`, one JSON per metric/position run (analysis only — no manifest entry) |
| `nfl/season-totals/` | NFL per-season aggregate files (schemaVersion 3) |
| `college/passing/` | CFBD passing stats, one file per year |
| `college/receiving/` | CFBD receiving stats, one file per year |
| `college/rushing/` | CFBD rushing stats, one file per year |
| `ktc/` | KTC dynasty value snapshots (schemaVersion 1) |
| `ktc/quarantine/` | Snapshots rejected by the ordering guard (script-produced, NOT manifest-registered, NOT app-read); review + promote manually |
| `enrichment/` | Hand-authored overlay: coaching.json, scheme.json, injuries.json, notes.json |
| `snapshots/` | Projection snapshots imported from the app export ZIP, keyed by UTC date (see [snapshot-workflow.md](snapshot-workflow.md)) |
| `grading/` | Grading reports written by `bin/grade.mjs --write`, one JSON per snapshot date |
| `nflverse/roster/` | nflverse season rosters, one JSON per year (`<year>.json`), keyed by `sleeper_id` |
| `nflverse/draft/` | nflverse combined draft picks (`draft_picks.json`), all years ≥ 2010 |
| `nflverse/playerids.json` | nflverse gsis_id→sleeper_id crosswalk (DynastyProcess), all players — **internal-only**: consumed server-side by `scripts/update-advstats.mjs` and `scripts/update-gamelogs.mjs`, not by the app directly |
| `nflverse/advstats/` | nflverse advanced receiving stats (WR/TE/RB), one JSON per year, keyed by `sleeper_id` |
| `nflverse/schedule/` | nflverse NFL schedules + results, one JSON per year (`<year>.json`); `games[]` keyed-by-array |
| `nflverse/gamelogs/` | nflverse per-game player stats (QB/RB/WR/TE/FB), one JSON per year (`<year>.json`), keyed by `sleeper_id`; `players[sid].games[]` |
| `nflverse/teamcontext/` | pbp-derived team/game context, one JSON per year, TEAM-keyed (not sleeper_id); `teams[abbr].games[]` |
| `.github/workflows/weekly-nflverse-roster.yml` | Tuesday weekly nflverse roster refresh, content-hash dedup, CDN purge |
| `.github/workflows/nflverse-draft.yml` | Yearly (May 1) nflverse draft picks update, content-hash dedup, CDN purge |
| `.github/workflows/nflverse-playerids.yml` | Wednesday weekly gsis↔sleeper crosswalk refresh, content-hash dedup, CDN purge |
| `.github/workflows/nflverse-advstats.yml` | Thursday weekly advstats refresh (after playerids), content-hash dedup, CDN purge |
| `.github/workflows/nflverse-schedule.yml` | Friday weekly nflverse schedule refresh (current season), content-hash dedup, CDN purge |
| `.github/workflows/nflverse-gamelogs.yml` | Saturday weekly nflverse gamelogs refresh (after playerids), content-hash dedup, CDN purge |
| `.github/workflows/nflverse-teamcontext.yml` | Sunday weekly team-context refresh, content-hash dedup, CDN purge |
| `raw/` | Unprocessed Sleeper API responses and CFBD player manifests |
| `manifest.json` | Index of every script-written file with metadata |
| `.github/workflows/weekly-ktc.yml` | Weekly KTC snapshot automation |
| `.github/workflows/smoke-test.yml` | Smoke test CI (dry-runs + npm test unit validators) |
| `data-catalog.md` | Living dataset index — one section per served family (path/source/grain/join/coverage/gate); every ingest slice updates its row (Done-definition) |

---

## Invariants

1. **Append-only for historical data.** Completed past seasons are never overwritten except to correct an error (requires a committed diff explaining why). Files with `inProgress: true` in manifest.json are in-season and may be re-exported (exception: KTC snapshots always register `inProgress: true` as a "current-value" marker yet remain append-only and are never re-exported — see Invariant 5).

2. **Never hand-edit primary data files** (`nfl/`, `college/`, `ktc/`, `snapshots/`). They are script-produced. Only `enrichment/` is hand-authored, and only via `bin/enrich.mjs`—direct JSON edits bypass validation.

3. **manifest.json is the index.** Every script-written file must be registered with `recordCount`, `schemaVersion`, `lastModified`, and `inProgress` maintained. Treat manifest field names as a public API (see Cross-repo contracts).

4. **schemaVersion discipline.** NFL season-totals are at v3 (per-season `team`). KTC snapshots are at v1. Projection snapshots are at v2 (new envelope fields: `targetSeason`, `currentSeason`, `scoringSettings`). Bump `schemaVersion` only on an incompatible layout change. Snapshot schemaVersion is independent of the app's `MAX_SUPPORTED_SCHEMA`, which gates only season-totals files.

5. **Snapshots are permanent.** Keyed by UTC date; never overwritten within a day (first-league-of-the-day-wins). KTC snapshots are append-only with content-hash dedup—no commit when content is unchanged. A scrape that fails the Spearman ordering guard is written to `ktc/quarantine/` (script-produced, unregistered, app-ignored) rather than `ktc/`, so a false trip never permanently loses data; it is not "primary data" under Invariant 2.

   **nflverse roster/draft/playerids/advstats/schedule/gamelogs/teamcontext are script-produced primary data and must never be hand-edited.** The current-season roster mutates weekly and is re-ingested by the Tuesday Action; content-hash dedup ensures no commit when unchanged. Roster/draft/playerids/advstats/schedule/gamelogs/teamcontext files are registered **`inProgress: false` even while the current-season file mutates** — deliberate deviation from the `nfl/season-totals` convention. The app has no live fallback for any of these (unlike season-totals where Sleeper is the live source); it must get them from the store. Weekly mutability is handled by content-hash dedup (here) + `lastModified`-driven cache invalidation (app-side). Do not change this to `inProgress: true`.

6. **Enrichment schemas are contracts.** Each file has required fields per entry. `injuries.segmentStartWeek` must match an absence segment in the matching season-totals file. `add` is an upsert keyed by natural key. Orphaned entries (no matching season-totals player/team) are flagged by `validate`; the app silently ignores them.

7. **Yearly maintenance.** At each season start, update `NFL_SENTINELS` and `KTC_TOP_QB_SENTINELS` in `lib/validate.mjs` to reflect the current player landscape.

8. **CDN purge URLs for season-keyed files (`nflverse/roster`, `nflverse/advstats`, `nflverse/schedule`, `nflverse/gamelogs`, `nflverse/teamcontext`) must be built from the NFL season surfaced by the node step (`setStepOutput('season', …)` → `${{ steps.fetch.outputs.season }}`), never `date -u +%Y`. Calendar year and resolved season diverge Jan–Feb; KTC is exempt (date-keyed).**

8. **Grading reads are never recomputed.** `bin/grade.mjs` joins captured projections to captured outcomes — it never re-runs the projection pipeline. The GradeReport is fully determined by the snapshot and outcome files at read time. *Clarification: grading MAY recompute actual fantasy points from stored season-totals `stats` under the snapshot's `scoringSettings` (a deterministic dot-product); it never re-runs the projection pipeline.*

---

## Cross-repo contracts (with sleeper-dashboard)

This repo cannot edit the app. Any change affecting these must be called out in the task summary so the sibling repo can be updated to match.

| Contract | This repo | App counterpart |
|---|---|---|
| **Snapshot shape** | `snapshots/<date>.json` imported via `node bin/update.mjs snapshots`; `projection` field is verbatim `computeNextSeasonProjection` output; at schemaVersion 2 the envelope also carries top-level `targetSeason`, `currentSeason`, and verbatim `scoringSettings` | `src/utils/projectionSnapshot.js` (writer); `exportData.js` `classifyKey` (router) |
| **season-totals schemaVersion** | Writes v3 | `src/api/dataStore.js` advertises `MAX_SUPPORTED_SCHEMA=3`; bumping needs both repos. Each record carries an additive per-season `team` (schedule-domain abbr, or `null`); the app joins game logs on `careerStats[season][pid].team` instead of current team. |
| **Enrichment schemas** | Writes/validates `enrichment/*.json` | `src/api/enrichment.js` (`loadEnrichment`); `src/utils/enrichmentLookup.js`; field add/rename must be mirrored |
| **Manifest contract** | manifest.json field names/shape | `dataStore.js` `getManifestEntry` / validators gate on `schemaVersion`, `inProgress`, `lastModified` |
| **CFBD statType keys** | Row per `statType`; confirmed sets per category stored here | App pivots via `pivotStatRows`; statType set is a shared contract |
| **Snap & RZ usage stat keys** | `off_snp`, `tm_off_snp`, `rec_rz_tgt`, `rush_rz_att`, `pass_rz_att` aggregated from Sleeper stats response and preserved as-is in `nfl/season-totals/<year>.json`; never stripped or filtered in any schema operation | `src/utils/usageMetrics.js` reads these fields; projection degrades silently to neutral if absent, so the dependency is invisible at runtime — do not remove or rename |
| **`pass_cmp` stat key (QB passer rating)** | Preserved through season-totals aggregation; never stripped (flows through the generic sum-all-keys path in `lib/sleeper.mjs`). Note: stored `pass_rtg` and `cmp_pct` fields are weekly sums (not reliable season-level metrics) and are NOT consumed by the app — preserve as-is, no action needed | `src/utils/efficiencyMetrics.js` computes canonical NFL passer rating from `pass_cmp`, `pass_att`, `pass_yd`, `pass_td`, `pass_int`; `pass_cmp` is the new dependency (the latter four were previously implicit). Missing `pass_cmp` produces neutral `efficiencyFactor` (1.0); no errors, no schema bump required |
| **`rec_air_yd` stat key (aDOT diagnostic)** | Preserved through season-totals aggregation; never stripped (same generic sum-all-keys path in `lib/sleeper.mjs`). Confirmed present 2012–present. Calibration note: values run ~½ industry aDOT magnitude (likely air yards on completed receptions only, not all targets) — ranking is preserved, absolute magnitude is not industry-standard; this is the app's concern, not the data repo's | `src/utils/seasonProjection.js` reads `rec_air_yd` and `rec_tgt` to compute `factors.adot` (WR/TE capture-only diagnostic; does **not** affect `projectedPPG`). Missing `rec_air_yd` produces `factors.adot: null`; no errors, no schema bump required (aDOT batch) |
| **nflverse roster/draft** | `nflverse/roster/<year>.json` (keyed by `sleeper_id`; `{ team, position, status, fullName }` per player; `inProgress: false`, `schemaVersion: 1`) + `nflverse/draft/draft_picks.json` (`{ picksByYear: { [year]: DraftPick[] }, count }`) written by `bin/update.mjs roster`/`draft`; `MIN_ROSTER_IDS = 1500` is the shared sparsity constant | `src/api/nflRoster.js` reads roster via `tryDataStore`/`getManifestEntry` (Part 2); `src/api/nflDraft.js` reads draft picks the same way. The served JSON shapes + `MIN_ROSTER_IDS` constant are the contract — if either changes, update both repos |
| **nflverse advstats (advanced receiving)** | `nflverse/advstats/<year>.json` keyed by `sleeper_id`; `{ gsisId, name, position, team, targetShare, airYardsShare, wopr, racr, components }` per player; WR/TE/RB; ratios recomputed season-level (never aggregated weekly); `inProgress:false`, `schemaVersion:1`; `MIN_ADVSTATS_ROWS = 250` shared sparsity constant; written by `bin/update.mjs advstats` | `src/api/advStats.js` reads via `tryDataStore`/`getManifestEntry` (Phase 1b); `seasonProjection.js` records `targetShare`/`airYardsShare`/`wopr`/`racr` as capture-only `factors` (WR/TE), retiring the Sleeper-aDOT calibration defect. Served shape + `MIN_ADVSTATS_ROWS` are the contract — change both repos together |
| **nflverse schedule** | `nflverse/schedule/<year>.json`: `{ schemaVersion:1, season, generatedAt, rowCount, games[] }`; each game `{ gameId, season, week, gameType, homeTeam, awayTeam, homeScore, awayScore, result, spreadLine, totalLine, roof, surface, temp, wind }`; `inProgress:false`; `MIN_SCHEDULE_GAMES = 200` shared sparsity constant; written by `bin/update.mjs schedule` | **New app loader** (e.g. `src/api/nflSchedule.js`) reads via `tryDataStore`/`getManifestEntry`, same pattern as `nflRoster.js`. Served shape + `MIN_SCHEDULE_GAMES` are the contract — change both repos together |
| **nflverse gamelogs (per-game player stats)** | `nflverse/gamelogs/<year>.json`: `{ schemaVersion:1, season, generatedAt, rowCount, playerCount, unmapped, players }`; `players` keyed by `sleeper_id`, each `{ gsisId, name, position, games[] }`; each game `{ week, seasonType, team, opponent, …per-game stats (sparse: absent key = null, never 0) }`. QB/RB/WR/TE/FB; 2012+; per-game grain; per-game rate fields are single-game values (never sum); `fantasyPoints*` are nflverse scoring (not app scoring). `inProgress:false`; `MIN_PLAYERGAME_ROWS = 3000` shared sparsity constant; written by `bin/update.mjs gamelogs`. **View-only — must never feed projection/scoring/grading.** Served shape + `MIN_PLAYERGAME_ROWS` are the contract — change both repos together | **New app loader** `src/api/nflGameLogs.js` reads via `tryDataStore`/`getManifestEntry`, same pattern as `nflRoster.js`; gates on `MAX_SUPPORTED_SCHEMA` (schemaVersion 1) and re-asserts `rowCount ≥ MIN_PLAYERGAME_ROWS`. Display/training only; must never import into `seasonProjection.js` or any scoring/grading path |
| **nflverse teamcontext (team-context pack)** | `nflverse/teamcontext/<year>.json`: `{ schemaVersion:1, season, generatedAt, rowCount, teamCount, teams }`; `teams` keyed by **era-accurate team abbr** (schedule/season-totals domain — the pbp `eraTeam` remap exists precisely so this key matches), each `{ games[] }`; each game `{ week, seasonType, gameId, opponent, off:{...}, def:{...} }` (PROE, pace, red-zone tendencies, EPA/success, points — components + rate, per §4.3 aggregation recipes: never sum/average the stored per-game rates). `inProgress:false`; `MIN_TEAMCONTEXT_ROWS = 60` shared sparsity constant; written by `bin/update.mjs teamcontext`. **First TEAM-keyed served family** (every other family is `sleeper_id`-keyed) — no crosswalk dependency. **View-only — must never feed projection/scoring/grading.** Served shape + `MIN_TEAMCONTEXT_ROWS` are the contract — change both repos together | **New app loader** `src/api/teamContext.js` — `tryDataStore`/`getManifestEntry` pattern (same precedent as `nflGameLogs.js`); gates on `MAX_SUPPORTED_SCHEMA` and re-asserts `rowCount ≥ MIN_TEAMCONTEXT_ROWS`. **Chosen contract term (not an omission):** teamcontext ships `schemaVersion 1`, so no `MAX_SUPPORTED_SCHEMA` bump is needed to consume it — same gate the gamelogs row uses. First TEAM-keyed loader — its cache key is `(season, team)`, not `sleeper_id`; do not force it through the player-keyed loader helpers. Must never import into `seasonProjection.js` or any scoring/grading path |
| **Snapshot target season** | At schemaVersion 2, the app writes `targetSeason` explicitly in the snapshot envelope; `gradeSnapshot()` reads it directly. `deriveTargetSeason()` in `scripts/grade-snapshot.mjs` is the fallback for v1 snapshots only (maps Jan–Aug → same year, Sep–Dec → year+1; override: `--target-season YYYY`) | `scoringSettings` is captured verbatim in the snapshot envelope as of v2; **implemented**: `lib/fantasyPoints.mjs` + `buildInBasisOutcomes`; grades v2 snapshots in-basis |
| **`calculateFantasyPoints` port** | `lib/fantasyPoints.mjs` must mirror the app's `src/utils/fantasyPoints.js` `calculateFantasyPoints` formula: loop `scoringSettings` keys, skip null multiplier/stat, 2-dp round. If the app changes its scoring math, mirror it here or in-basis grades diverge from how the app actually scored | `src/utils/fantasyPoints.js` — the source of truth; low churn (the dot-product is stable), but any change there must be reflected here |

> *Note: `nflverse/playerids.json` (the `gsis_id → sleeper_id` crosswalk) is **internal to this repo** — consumed server-side by `scripts/update-advstats.mjs` and `scripts/update-gamelogs.mjs` to re-key gsis-keyed stats. It is not a cross-repo contract (the planned `src/api/playerIds.js` app loader was cut). `MIN_PLAYERID_ROWS` remains an internal sparsity constant.*

---

## Sibling repo

`sleeper-dashboard` is the React app that consumes this repo's files and produces the snapshots imported here. Its README documents the projection pipeline and data-store consumption. See Cross-repo contracts above.

The canonical signal/feature registry — classifying every raw source, computed factor, and ephemeral capture by layer, coverage, and reconstructable-vs-ephemeral status — lives in the app repo at `docs/signal-registry.md`.

---

## Done-definition

Before reporting a task complete:
1. Run `npm run smoke` — fix any red.
2. For enrichment changes, run `npm run validate:enrichment` — fix any red.
3. For any change touching a data file, confirm `manifest.json` is updated.
4. Plan review: invoke the plan-reviewer subagent on the task file at the end of Session 1, before Session 2.
5. For any change that adds a served family or alters a family's coverage/schema/gate, update its `data-catalog.md` row in the same change.

---

## Session git workflow

Every session that modifies tracked files ends by committing and pushing its own work — no uncommitted work is left between sessions. Uncommitted local work colliding with a scheduled Action's push to main (Invariant 8's workflows) is a known failure mode this sequence exists to prevent. Read-only sessions (planning that produces no tracked change) do nothing here.

End-of-session sequence:
1. Stage and commit this session's changes with a descriptive message (planning: `plan: <feature>`; implementation: `feat: <feature>` / `fix: <feature>`).
2. `git pull --rebase origin main` **before** pushing — the weekly/scheduled Actions push to main on cron and will reject a stale push.
3. Resolve any rebase conflicts safely — they are almost always machine-generated bookkeeping files:
   - `manifest.json`: resolve as a **union** — keep every entry from both sides. Never resolve by preferring one side wholesale; that silently drops the other side's entries (a real data-visibility loss even though the file still parses). After resolving, verify `python3 -m json.tool manifest.json` parses **and** that the entries this session wrote are still present (grep their full-path keys, e.g. `nflverse/advstats/2019.json` — full path with extension, not a bare fragment).
   - Watermark files (`nflverse/last-checked-*.json` and similar): keep the later timestamp.
   - If a conflict is not a clean union — the same entry edited incompatibly on both sides — stop and report for a human decision; do not guess.
4. `git push origin main` — plain push, never `--force`. If still rejected, an Action pushed during the rebase: pull --rebase again and retry; never force.
5. If this session wrote served data files (anything under `nflverse/`, `ktc/`, `cfbd/`, etc. + `manifest.json`), purge the jsDelivr CDN for exactly those changed files (manifest.json first, then the data files) — see README → [How the data is consumed](README.md#how-the-data-is-consumed) for the purge method — so the app sees fresh data instead of stale cache.

---

## Self-maintenance

Keep this file current as part of every task's done-definition. If a change adds/renames a `bin/` subcommand, a `package.json` script, a data folder, a manifest field, or an enrichment/snapshot schema, update the relevant section in the same change. When a change adds, removes, or alters the historical coverage of an ingested field, stat key, or data source (`nfl`/`cfbd`/`ktc`/`roster`/`draft`/`advstats`/`playerids`/`schedule`/`gamelogs`/`teamcontext`/`enrichment`), flag the canonical signal registry for update: it lives in the app repo at `docs/signal-registry.md`. The same trigger updates the family's row in `data-catalog.md` (this repo — storage registry). Note the change (Source / Historical coverage / Reconstructable-vs-ephemeral) in your task summary so the app repo updates the row. If a change affects a Cross-repo contract, state that explicitly in your task summary so the sibling repo can be updated to match.

Keep this file thin — a navigation-and-rules layer, not a second README; push deep detail into README.md and link to it.
