# D5 — historical depth charts 2013+ (skill positions)

**Model:** sonnet implements this file exactly. **Status:** planned (opus, 2026-09-06). **Slice:** D5 of the stellar-data batch. **Repo:** data only.
**Base:** `7bc5a1d` on `main`. **D4 is in flight on a local branch and none of its symbols are on `main`** — re-verify every anchor before relying on it. **Size:** the brief says one slice. It is one slice only if the era-reconciliation decision in §B is taken as written; see finding 1.
**Plan gate:** plan-reviewer run 2026-09-06, seventeen flags, all folded in. One was design-breaking: the served schedule family carries no date, so this file's original week-reconciliation decision was not implementable at all.
**Unblocks:** the depth factor (Step 8) and QB1 identity become gradable back to 2013, both of which have no history today. D6 consumes both.

**Problem.** `docs/signal-registry.md` classifies `depth_chart_order` as *ephemeral, never reconstructable*, so Step 8's multiplier and the QB-change flag cannot be graded at all. nflverse publishes depth charts from 2001. `scripts/update-oline.mjs` already reads the 2025+ asset and deliberately scopes out everything earlier (`MIN_OLINE_SEASON = 2025`).

**Capture-only.** Nothing here feeds projection, scoring or grading until a registry entry says so. This slice serves a family and reclassifies a registry row. It wires no factor.

---

## Step 0 — both eras fetched and measured, 2026-09-06

The brief requires verifying both headers live. Done, against the `depth_charts` release.

**Both headers are exactly as the brief describes.** Legacy is 15 columns (`season, club_code, week, game_type, depth_team, last_name, first_name, football_name, formation, gsis_id, jersey_number, position, elias_id, depth_position, full_name`). ESPN is 12 (`dt, team, player_name, espn_id, gsis_id, pos_grp_id, pos_grp, pos_id, pos_name, pos_abb, pos_slot, pos_rank`). **The break is exactly at 2025**: 2024 is legacy, 2025 and 2026 are ESPN.

| season | schema | size | rows | REG+Offense skill rows | distinct skill `gsis_id` | join to a `sleeper_id` |
|---|---|---|---|---|---|---|
| 2013 | legacy | 3.4 MB | 37,066 | 8,612 | 578 | **0.853** |
| 2016 | legacy | 3.4 MB | 36,612 | 8,653 | 599 | 0.998 |
| 2024 | legacy | 3.4 MB | 37,312 | 8,629 | 581 | 0.995 |
| 2025 | ESPN | 52.9 MB | 554,215 | 144,517 | — | `gsis_id` 0.986, `espn_id` 1.000 |
| 2026 | ESPN | 47.4 MB | — | — | — | — |

Legacy `gsis_id` is **100% populated** in every season measured, so the join is deterministic through the crosswalk with no name matching anywhere. `depth_team` is the depth order (values 1, 2, 3). `formation` partitions Offense / Defense / Special Teams. `game_type` is REG plus playoff rounds.

### Findings that change the slice

**1. The two eras share no week key, and the obvious bridge does not exist.** Legacy carries `week` (1–21, plus ~240 rows a season with an empty week, which are the `SBBYE` rows). The ESPN asset has **no week column at all** — only `dt` timestamps, 219 distinct days for 2025 spanning 2025-08-03 to 2026-03-14, producing 1,056 `(team, ISO week)` buckets.

An earlier draft of this file resolved that by reading `nflverse/schedule/<season>.json`. **That does not work: the served schedule carries no date.** Its games hold `gameId, season, week, gameType, homeTeam, awayTeam, homeScore, awayScore, result, spreadLine, totalLine, roof, surface, temp, wind` and `parseSchedulesCsv` never reads `gameday`. Adding one would be a shape change to a `Direction: both` family whose Invariant pins the served field list — a two-repo change, for a slice that should touch one.

**Decision, §A: fetch the upstream schedule CSV directly.** `fetchSchedulesCsv()` and `SCHEDULES_URL` already exist in `lib/nflverse.mjs` and the raw asset carries `season`, `game_type`, `week` and `gameday`. Build a `gameday → (week, gameType)` map for the season in-script and bucket ESPN rows by it. **No served contract changes and CR-08 is not touched** — this reads the upstream asset, not the family. The alternative of ISO-week keys for 2025+ gives two incompatible key spaces either side of 2025 and defeats the point of a single 2013-to-now series.

**1b. Rows outside the regular-season window need a stated disposition.** The 2025 asset starts 2025-08-03 and ends 2026-03-14 — roughly five weeks before week 1 and five after the Super Bowl. The legacy parser filters `game_type === 'REG'`, so without a matching filter the ESPN side would admit playoff weeks the legacy side excludes, and the key space would differ across the boundary. **Map only `dt` falling inside the REG window; count everything else into a served `outOfWindow` field rather than dropping it silently.** A number nobody reads is still better than a silent drop, and it is the tripwire if the upstream cadence changes.

**2. There is no preseason in the legacy asset.** `game_type` is REG, WC, DIV, CON, SB and SBBYE — no PRE. The brief's grading-use bullet asks for `depthOrder(Y, week 1 of Y+1 preseason)`, which cannot be built for any legacy season. Its other bullet already says *week 1 REG*, which is correct and is what this slice serves. **Use week 1 REG throughout and drop every reference to preseason.**

**3. The join rate collapses at the floor season, and it is real attrition rather than a fault.** 0.853 at 2013 against 0.998 at 2016 and 0.995 at 2024. The crosswalk is bounded by Sleeper's player universe, so a 2013 skill player who retired before Sleeper existed has no `sleeper_id` and never will. **Set the join floor at 0.80, not the 0.85 D4 uses** — 2013 would fail an 0.85 gate on correct data. Say in the catalog that pre-2015 rows are thinner by construction so nobody later reads it as a bug.

**3b. The `espn_id` fallback resolves nothing as the repo stands.** `nflverse/playerids.json` on disk is still `schemaVersion: 1` with no `bySleeper` index: D2 landed the v2 writer but deliberately did not regenerate the data file, and the Wednesday Action has not run since. With `gsis_id` at 98.6% on ESPN rows, a completely dead fallback still clears the 0.80 floor, so nothing would reveal it. **Two requirements: the crosswalk must be regenerated to v2 before an ESPN-era season is ingested, and the ingest must hard-error when `bySleeper` is absent or empty while processing an ESPN season** rather than quietly using the primary path alone. Name the regeneration as a prerequisite in the hand-back.

**4. Team codes are already era-accurate, exactly as in D4.** 2013 carries `OAK`/`SD`/`STL`, 2016 carries `LA`/`OAK`/`SD`, 2024 and 2025 carry `LA`/`LAC`/`LV`. **Do not call `eraTeam`** — it maps modern codes backwards and would corrupt a source that is already correct. Use D4's remedy: per-year assertions in the validator covering the three boundary pairs, in `validateTeamContext`'s style.

**5. The proposed QB gate is correctly calibrated, and 32 would have been wrong.** At week 1 REG, teams with a depth-1 QB: **31 in 2013**, 32 in 2016, 32 in 2024. The brief's "≥ 30 teams" holds with one to spare at the floor season; a gate of 32 would fail 2013 on correct data.

**6. Legacy `depth_team` is not a total order within a position, so "array position is the depth order" is undefined pre-2025.** Measured on 2013: 2,125 of 6,342 `(club, week, position)` groups contain at least two rows sharing a `depth_team`, up to four. One Atlanta week-1 receiver group ranks 3, 1, 2, 1, 2. The reason is that legacy ranks are **within `depth_position`** — the slot — while ESPN's `pos_rank` is a rank within `pos_abb`, the position. The two eras are therefore not measuring the same thing, and no tie-break makes them identical.

**Serve the grain rather than pretending it away.** Legacy entries carry their `depthPosition` alongside the ordered array, ordered by `(depth_team asc, depthPosition, input order)` so the sequence is at least deterministic. Record the cross-era semantic difference in the catalog and in the CR-18 row, because D6 will otherwise compare a per-slot rank against a per-position rank and read the discontinuity at 2025 as a real change in the world.

---

## Design

### A. Ingest — one subcommand, two parsers behind one interface

New family `nflverse/depth/<year>.json`, `scripts/update-depth.mjs`, subcommand `depth`, on the `runSeasonKeyedIngest` spine like every other season-keyed family. `MIN_DEPTH_SEASON = 2013`.

Two parsers in `lib/nflverse.mjs`, selected by season against a single `DEPTH_ESPN_FROM_SEASON = 2025` boundary, both returning the same intermediate shape so the aggregator downstream is era-blind:

- **Legacy (2013–2024).** Filter to `formation === 'Offense'` and `game_type === 'REG'`, keep `position ∈ {QB,RB,WR,TE}`, order by `depth_team` ascending. Week comes straight from `week`; skip rows with an empty week. **Assert the CSV's own `season` column matches the requested season** — `aggregateOlineStates` throws when a `dt` year falls outside `{season, season+1}` and `aggregateTeamContext` asserts season the same way. Under Invariant 1 a season filed under the wrong year is permanent, so this guard is cheap insurance, not ceremony.
- **ESPN (2025+).** Filter to `pos_abb ∈ {QB,RB,WR,TE}`, order by `pos_rank` ascending. **Reduce to one chart per (team, NFL week) by keeping only the rows at the bucket's maximum `dt`**, the same weekly reduction `aggregateOlineStates` performs — 554k raw rows is roughly 15× the legacy volume because ESPN is snapshotted many times a week. Derive the NFL week from the upstream schedule CSV per finding 1, and apply the REG-window filter per finding 1b.

**Do not fork what `aggregateOlineStates` already owns.** Header-name lookup, `dt` normalisation (`normalizeDt`, currently module-private in `lib/nflverse.mjs`) and the max-`dt` reduction all exist there for this same upstream asset. Lift the shared pieces into helpers both call rather than writing a second copy. Note the reduction is **not** identical: oline buckets on `isoWeekKey`, this family buckets on NFL week. Two families derived from the same rows would then carry incompatible week keys, so **the depth envelope must retain the winning `dt` per bucket** — oline's states already carry `week`/`date`/`dt` — or the two can never be reconciled.

Header lookup by name with a hard throw on a missing required column, matching `aggregateOlineStates`' drift tripwire. The legacy parser's required set must include `formation` and `game_type`, since those two are what make the filter meaningful and their absence would otherwise silently widen the row set.

**Join to `sleeper_id`.** `gsis_id` through the crosswalk's `ids` map is the primary path and is sufficient for every legacy season (100% populated) and for 98.6% of ESPN skill rows. For the ESPN remainder, fall back to `espn_id`, which is 100% populated and which **D2 added to the crosswalk's `bySleeper`**. That fallback needs an `espn_id → sleeper_id` index built once per run by inverting `bySleeper`, subject to finding 3b's hard error. **If D4 has landed by then, generalize the inversion it introduces rather than adding a second ad-hoc one** — its `pfrCrosswalkFromBySleeper` does exactly this shape with a documented keep-first collision policy. If D4 has not landed, write this one so that helper can absorb it later. Note D4 is in flight and none of its symbols are on `main` yet, so re-verify before depending on any of them. State the collision policy explicitly; an inversion without one is a silent last-wins.

### B. Served shape — `nflverse/depth/<year>.json`, `schemaVersion: 1`

`{ schemaVersion, season, generatedAt, rowCount, playerCount, unmapped, weeks: { [week]: { [team]: { QB: [sleeper_id…], RB: […], WR: […], TE: […] } } }, preseasonQb1, qb1Changed }`

Arrays are ordered; position in the array **is** the depth order. `generatedAt` and `unmapped` match the sibling families' names — D2's review caught an earlier plan inventing both, so take them as settled.

`week1Qb1: { [team]: sleeper_id }` is the depth-1 QB at **week 1 REG**. The name is deliberate: an earlier draft called it `preseasonQb1`, which finding 2 disproves, and that misnomer would have been carried into `docs/signal-registry.md` by the CR-18 row and from there into D6. `qb1Changed: { [team]: boolean }` compares that against the prior season's file. **`qb1Changed` is therefore undefined for `MIN_DEPTH_SEASON` itself** — 2013 has no 2012 to compare against. Serve it as `null` for that season rather than `false`, which would assert continuity nobody measured.

Two consequences of reading a prior *served file* rather than recomputing. A later correction to season Y−1 can never propagate into Y, because Y is completed and `--force`-gated under Invariant 1, so the derived flag goes stale with nothing to detect it — say so in the catalog. And a **missing** prior file for a non-floor season must **throw**, not yield `null`: a silent `null` there is indistinguishable from the floor season's legitimate one.

### C. Gates

- `MIN_DEPTH_ROWS` per season — measure on the first real run and pin with the observed number in the comment, as D2 and D4 do. Legacy REG+Offense skill rows sit near 8,600; do not pin from that figure alone, because the ESPN era's post-reduction count will differ.
- All 32 teams present at week 1. Measured 32 in every season checked.
- A depth-1 QB for **≥ 30** teams at week 1 (finding 5).
- Join rate **≥ 0.80** over skill rows (finding 3).
- Per-year team-code assertions covering 2015/2016 `STL`↔`LA`, 2016/2017 `SD`↔`LAC`, 2019/2020 `OAK`↔`LV` (finding 4).

**Put the floors where they can actually fire.** `runSeasonKeyedIngest` **logs and continues** below `minRows` (`lib/seasonIngest.mjs:129-132`) and treats `rc === 0` as "not published yet" (`:120-125`). Left at the spine, a legacy filter mistake would skip all twelve backfill seasons green — the exact silent success this arc exists to eliminate. `scripts/update-snaps.mjs` already resolved this for an all-published backfill: **spine `minRows: 1`, real floors thrown in the validator**. Follow it exactly, and put every gate above in `validateDepth`.

**Add `'depth'` to `ALL_SUBCOMMANDS` (`lib/args.mjs:14`).** This slice backfills with `--all`, and that list is the whitelist gating the `--all`-plus-`--year` conflict rejection. Without it, `--all --year 2016` validates and silently ignores the year.

### D. Invariant 8 — purge wiring

Season-keyed family through `_ingest.yml`: pass `season-keyed: true`, `purge-path: nflverse/depth/<season>.json`, **and `sparse-paths` naming `nflverse/playerids.json` and the schedule input** — this family reads outside its own cone, and `nflverse-snaps.yml` lists the crosswalk for exactly this reason. Omit it and the sparse checkout has neither file, and call `d.setStepOutput('season', seasons[0])` in single-season mode the way `scripts/update-gamelogs.mjs:103` does. Without the step output the purge is skipped with a warning rather than a failure. Add `nflverse/depth` to Invariant 8's family list in `CLAUDE.md`.

Workflow cadence: yearly backfill plus in-season weekly, since the current season is what matters for QB1-change capture. The cron slot has an ordering constraint, not just an availability one: it must run **after** the Wednesday `playerids` job, since the crosswalk is this family's join, and the in-season weekly must run after the schedule refresh. `nflverse-snaps.yml` states that same dependency in its cron comment. Pick a slot clear of the occupied set enumerated in `.claude/tasks/daily-snapshot-capture.md` §Step 0 (D1b took 16:29 daily) **and** satisfying both orderings.

### E. Snapshot parity — a measurement, not a gate

Compare the served week-1 2026 depth order against `teamDepthCharts` in `snapshots/2026-09-05.json` and report agreement per position in the hand-back. 2026 is published and is ESPN schema, so this is possible. **Expect well under 100%**: Sleeper and ESPN maintain different depth charts, and the disagreement rate is itself the finding. Do not gate on it and do not "fix" a mismatch.

---

## Cross-repo impact

### CR-18 · Signal registry rows — the headline deliverable (`Direction: data→app`)

> **Mirror:** This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

Two edits, and the second is the point of the slice. First, a new row for the `nflverse/depth` family. Second, **reclassify the existing depth-factor row from "ephemeral — never reconstructable" to "reconstructable 2013+ (nflverse depth charts; Sleeper `depth_chart_order` remains the live input)"**. That is a change in *reconstructable-vs-ephemeral status*, which is this entry's named trigger, and it is the fact D6 needs in order to know the feature exists. Emit both row edits literally in the hand-back; this repo cannot write that file.

Near-side maintenance in the same change: `scripts/update-depth.mjs`, the two new parsers in `lib/nflverse.mjs`, and `MIN_DEPTH_SEASON` belong in CR-18's data-side `Triggers`, which enumerates coverage-floor constants explicitly.

**`[registry-stale]` — report, do not fix.** Two, and the second is larger than previously reported. CR-18's data-side list still omits `scripts/update-playerstats.mjs`, which D2 and D4 both reported; this is the third slice to hit it. It also omits **the whole snaps family** once D4 lands — its ingest script, aggregator, rekey helper, crosswalk inversion and `MIN_SNAPS_SEASON`, which that entry enumerates coverage-floor constants explicitly. Separately, `CLAUDE.md`'s Invariant 8 family list already omits `nflverse/snaps` even though its workflow passes a season-keyed purge path; this slice edits that exact line to add `nflverse/depth`, so note the neighbour rather than silently stepping over it.

### CR-16 · Era-accurate team-code remap — touched by finding 4's remedy

> **Mirror:** A future franchise move (or any change to an existing mapping) updates **both repos in the same change** — and there are **two** mirrored constants here, not one: the era remap *and* the schedule-domain alias (`lib/sleeper.mjs:21` says so in a comment: *"Mirrors the app's `src/utils/nflStats.js` `SCHEDULE_TEAM_ALIAS` exactly"*). A one-sided edit to either produces silently empty joins rather than an error — the team key simply never matches. Note `scripts/update-teamcontext.mjs` is **not** a trigger despite owning the teamcontext ingest: it names `eraTeam` only in a header comment (`:13`) and calls it via `aggregateTeamContext`, so grepping it for the remap finds nothing. **D-1 (2026-08-24) is a new consumer of this composition, not a new mapping** — `aggregateWeeks` joins a single-team row's already-normalized `team` against the nflverse schedule's bye weeks, so a future franchise move that isn't mirrored here silently loses that team's bye inference (degrades to `'X'`, no throw) in addition to the pre-existing teamcontext/schedule join failures this entry already covers.

Finding 4's per-year assertions land in `lib/validate.mjs`, which is CR-16's near-side trigger surface. `validateDepth` becomes the **third** live era-boundary guard there, and it belongs in that entry's data-side `Triggers` in the same change. The entry's own warning is why this matters: a one-sided edit produces silently empty joins rather than an error, so a guard that exists but is unlisted is a guard nobody knows to keep in step.

### CR-08 · nflverse schedule — considered, not touched

Finding 1 reads the **upstream** `games.csv` through the existing `fetchSchedulesCsv()`, not the served `nflverse/schedule/<season>.json`. No served field is read, no shape changes, and this does not become a consumer of the family. Record that conclusion explicitly — an earlier draft of this file did plan to read the served family, and the correction is the kind of thing a later reader will otherwise re-litigate.

### No new coupling yet

No app reader in this arc. When the app reads the family, that is a parent-folder session taking the next free `CR-NN` — **not CR-22, which D1b's plan claims**.

---

## Docs/README updates

- **`data-catalog.md`** — new `nflverse/depth` row: coverage 2013+, the two-era parse, the gates with measured values, the 0.80 join floor and why 2013 is thinner, and that `qb1Changed` is null at the floor season.
- **`README.md`** — a served-shape section for the family, plus the GitHub Actions table row for the new workflow.
- **`CLAUDE.md`** — Invariant 8's family list gains `nflverse/depth`.

## Tests to add

1. Legacy parser fixture: `formation`/`game_type` filtering, `depth_team` ordering, empty-week rows skipped, skill positions only.
2. ESPN parser fixture: `pos_rank` ordering, and the weekly reduction keeping only the max-`dt` rows for a `(team, week)` bucket where two charts exist in one week.
3. Era selection: a 2024 fixture routes to the legacy parser and a 2025 fixture to the ESPN one; a legacy-schema asset handed to the ESPN parser throws on the missing-column tripwire rather than producing empty output.
4. Join: `gsis_id` primary path, and an ESPN row with a missing `gsis_id` resolving through the `espn_id` fallback.
5. `qb1Changed` derivation: changed, unchanged, and **null at `MIN_DEPTH_SEASON`**.
6. Per-year team-code assertions across all three boundary pairs.
7. Gate tests: fewer than 30 teams with a depth-1 QB; join rate under 0.80; missing schedule file throws rather than falling back.
8. `lib/args.mjs`: `depth --all --year 2016` is rejected once `'depth'` is on `ALL_SUBCOMMANDS`.
9. Legacy tie handling: a `(club, week, position)` group with duplicate `depth_team` values produces a deterministic order and retains `depthPosition` (finding 6).
10. Wrong-asset guard: a CSV whose `season` column disagrees with the requested season throws.
11. Week derivation: a `dt` inside the REG window maps to the right NFL week; one before week 1 and one after the final week are counted into `outOfWindow` rather than dropped.
12. `bySleeper` absent or empty while ingesting an ESPN season throws (finding 3b).
13. A missing prior-season file for a non-floor season throws, and is distinguishable from the floor season's legitimate `null`.

## Risks

- **The ESPN asset is 50 MB a season and 15× the legacy row count.** The weekly reduction is what makes this tractable; do it while streaming rather than after materialising every row, and report the served file size in the hand-back.
- **The join floor is set from three measured seasons, none earlier than 2013.** 2013 is the floor and measured 0.853, so there is no unmeasured season below it — unlike D4, this one is bounded. If a middle season nonetheless trips 0.80, report it rather than lowering the floor.
- **Do not re-derive a completed season in place** without a named Invariant-1 exception. Backfill writes seasons that do not exist yet.
- **Prerequisite: the crosswalk must be at v2 with a populated `bySleeper` before any ESPN-era season is ingested** (finding 3b). Either wait for the Wednesday `playerids` job or run it manually first, and say which in the hand-back.
- **This slice wires no factor.** The panel work that consumes `depthOrder` and `qb1Changed` belongs to D6. Serving the family and reclassifying the registry row is the whole deliverable.
