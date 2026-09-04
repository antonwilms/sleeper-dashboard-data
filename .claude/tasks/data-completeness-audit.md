# Data-completeness audit — inventory, capture backlog, toss list (Session 1)

**Status:** audit written 2026-07-03. Inventory only — NO code, NO ingest, NO docs edits.
**Model discipline:** this file is the only artifact of Session 1. No source edits here.
**Docs updates: none (backlog items carry their own).**
**Tests to add: none (backlog items carry their own).**

Thesis (from the task): the app's core edge is a large, high-quality dataset on NFL players and
fantasy performance. This audit inventories what we have, catalogs what we could capture, and
applies the KEEP/TOSS/DEFER rule — predictive value NOT required; well-populated + reliable +
(conditions fantasy outcomes directly or as team/game context, OR enables drill-down) = KEEP.
Everything below marked "verified" was checked against **live data fetched 2026-07-03** (a recent
and an older season per family, real row counts and per-field fill rates) — not from memory.

---

## 1. Current-state inventory (what we ingest today)

| Source | Grain | Coverage | Served path | Notes |
|---|---|---|---|---|
| Sleeper season totals | player-season (+ weeklyPoints/weeklyStatus) | 2012–2025 | `nfl/season-totals/<year>.json` | schemaVersion 3; per-season `team`; snap/RZ keys ≈2020/2021+ only |
| KTC dynasty values | player, dated snapshot | 2026-05-18 → present (weekly Mon) | `ktc/snapshot-<date>.json` | 4 snapshots so far; Spearman ordering guard + quarantine |
| CFBD college stats | player-season stat rows | 2017–2025 | `college/{passing,receiving,rushing}/<year>.json` | 3 categories only |
| nflverse rosters | player-season | **2024–2026 only** | `nflverse/roster/<year>.json` | sleeper_id-keyed; 2012–2023 NOT backfilled |
| nflverse draft picks | pick | 2010–present | `nflverse/draft/draft_picks.json` | yearly refresh |
| nflverse schedules | game | 1999–2026 | `nflverse/schedule/<year>.json` | incl. lines, roof/surface/temp/wind |
| nflverse adv. receiving | player-season (WR/TE/RB) | 2012–2024, **missing 2019 + 2025** | `nflverse/advstats/<year>.json` | targetShare/airYardsShare/wopr/racr |
| nflverse per-game stats | player-game (QB/RB/WR/TE/FB) | 2012–2024, **missing 2019 + 2025** | `nflverse/gamelogs/<year>.json` | view-only; omit-on-null contract |
| gsis↔sleeper crosswalk | player | all (12,467 source rows; 6,143 served) | `nflverse/playerids.json` | internal-only; forward map gsis→sleeper |
| Projection snapshots | player, dated | 2026-05-19 → present (daily) | `snapshots/<date>.json` | v2 envelope (scoringSettings) |
| Grading reports | snapshot-date | on demand | `grading/<date>.json` | |
| Enrichment overlay | hand-authored | coaching 95 entries; **scheme/injuries/notes = 0** | `enrichment/*.json` | injuries file empty — see nflverse injuries (B5) |
| Raw IndexedDB dumps | misc | one-time export | `raw/*.json` | 252 `raw/stats-*` dumps already slated for retirement (separate task) |

Immediate completeness holes in ALREADY-SHIPPED families (no new source needed):
1. `advstats` and `gamelogs` both missing **2019 and 2025** on disk and in the manifest
   (source asset `stats_player_week_2019.csv` exists — verified in the release listing — so the gap
   is repo-side, not source-side; 2025 likewise available).
2. `roster` covers only 2024–2026; nflverse `rosters` release goes back decades (era-accurate
   rosters for drill-down join sanity).
3. CFBD stops at 2017; earlier seasons exist upstream (thinner coverage — note-only, see §2 CFBD).
4. KTC history starts 2026-05-18; no backfill path exists (see DEFER).

---

## 2. Candidate catalog (per source/table, sample-verified)

Legend: grain / coverage / join / verdict. "Cross-position context" flags fields that condition
OTHER positions' fantasy output (kicking→RZ equity archetype). All nflverse assets are release
CSVs at `https://github.com/nflverse/nflverse-data/releases/download/<tag>/<asset>` unless noted.

### A. Crosswalk substrate (read this first — it reprices several verdicts)

**A1. DynastyProcess `db_playerids.csv` (already our playerids source).** Verified 2026-07-03:
12,467 rows; columns include `pfr_id` (77% fill), `espn_id` (65%), `cbs_id`, `stats_id`,
`ktc_id` (4% — too sparse to use). **6,000 rows carry both sleeper_id+pfr_id; 6,198 carry
sleeper_id+espn_id.** The pfr and espn crosswalks the PFR/QBR families need are a *widening of the
existing playerids ingest*, not a new source. This retires the prior task's "new pfr_id crosswalk"
blocker to "small extension".

**A2. nflverse `players` release, `players.csv`.** Master id/bio table: 25,033 rows, one per
gsis_id; ids `pfr_id` (90%), `espn_id` (67%), `otc_id` (37% — concentrated in contract-era
players), `esb_id`, `smart_id`; bio `birth_date`/`height`/`weight` (100%), college, draft
year/round/pick, `rookie_season`/`last_season`/`latest_team`. **KEEP** — it is both a capture
(player bio/anthro drill-down) and the id bridge that unblocks contracts (otc_id) and any future
espn/pfr join. Marquee: birth_date, height/weight, draft triplet, id set.

### B. nflverse — team/game context

**B1. Play-by-play (`pbp` release, `play_by_play_<year>.csv.gz`).** Play grain; 1999–2025.
Verified 2024: 49,492 plays × **372 cols**; 2013: 48,158 × 372 (identical header — unusually
stable). Fill (2024 ≈ 2013): `epa`/`wp`/`success` 99%, `xpass`/`pass_oe` 74–76% (scrimmage plays),
`roof`/`surface` ~100%, `temp`/`wind` 64–73% (outdoor games only — honest nulls indoors),
`kick_distance` 15% (kicks only), `field_goal_result` 2% (FG attempts only), `yardline_100` 93%.
~25 MB gz per season. Join: `game_id` (= schedule `gameId`), team abbrs, gsis ids on player cols.
**KEEP — as derivation substrate, not as a served file.** Raw pbp is far too large to serve via
jsDelivr and the app has no play-level surface; the keep-worthy artifact is **derived team/game
context aggregates** (pace/plays, PROE via `xpass`/`pass_oe`, red-zone tendencies via
`yardline_100`, kicking frequency/distance via `field_goal_attempt`/`kick_distance`, defense-faced
EPA splits). **Cross-position context: this is THE archetype source** — team kicking tendencies
(RZ equity stolen from TD-scorers), pace (raw play volume for all positions), PROE (pass-rate →
WR/TE vs RB tilt), defense-faced (opponent context for every position). See backlog B2.

**B2. Team weekly stats (`stats_team` release, `stats_team_week_<year>.csv`).** Team-game grain;
1999–2025. Verified: 570 rows (2024), 534 (2012); same header both — full offense families
(incl. `passing_epa`/`rushing_epa`, air yards), defense (`def_*`), kicking (`fg_*`, distance
buckets), penalties, `timeouts`. Join: `team`+`season`+`week` → schedule; opponent column present.
**KEEP** — the cheapest defensible "defense-faced / team environment" capture: one small CSV per
season gives opponent-allowed volume and team pace/volume without touching pbp. Marquee:
`passing_epa`, `def_sacks`, `fg_att`/`fg_made_*` buckets, penalties. **Cross-position context:**
opponent defense rows condition every position's weekly output; team `fg_att` is the kicking-
tendency signal at team grain.

**B3. FTN charting (`ftn_charting_<year>.csv`).** Play grain; **2022+ only**. Verified 2024:
48,031 rows; fields `n_pass_rushers`, `n_blitzers`, `is_play_action`, `is_rpo`, `is_screen_pass`,
`is_motion`, `is_drop`, `is_catchable_ball`, `n_defense_box`, … **No player id** — attribution
requires a pbp join (`nflverse_game_id`+`nflverse_play_id`). License verified (nflreadr docs):
**CC-BY-SA 4.0, attribution "FTN Data via nflverse"** — usable with attribution; share-alike
applies to redistribution. **DEFER** — keep-worthy (routes/pressure/scheme context) but blocked on
a pbp-join pipeline that doesn't exist yet + short coverage + license care. Revisit after B2.
(Note: FTN "routes/YPRR" from the parked follow-up list does NOT exist in this file — there is no
route-count or YPRR field here; routes exist only via participation `route` (see B4) or paid FTN.)

**B4. Participation (`pbp_participation_<year>.csv`).** Play grain with per-play personnel +
player-id lists; 2016–2025 (assets verified present for 2024/2025 — the "discontinued after 2023"
belief is stale). **Era split verified:** 2016–2023 (NGS-sourced): `offense_personnel`/
`defense_personnel`/`defenders_in_box` ~74–76% of rows (scrimmage plays), `ngs_air_yards`/
`time_to_throw`/`was_pressure`/`route`/`defense_man_zone_type` ~37–43% (pass plays). 2024+
(new source): personnel 100%, `was_pressure` 100%, `route` 42%, man/zone 49%, but
**`ngs_air_yards` = 0% (dead)** and six new name/position/number columns. 45–48k rows/season.
Join: play-level; `offense_players` = semicolon-joined gsis list (91–100% fill). **DEFER** —
keep-worthy (snap-weighted personnel usage, routes-run per player-game would come from here) but
blocked on the same play→player attribution pipeline as FTN, plus a real era-consistency problem.
Revisit with/after B2; a derived "routes-run per player-game" table is the marquee unlock (YPRR).

**B5. Officials (`officials.csv`).** Game-official grain; 2015–2025 verified (21,900 rows,
100% name/id fill). Referee crews condition penalties/pace only weakly and the app has no
plausible drill-down surface for them. **TOSS** (see §3).

### C. nflverse — player performance

**C1. Next Gen Stats (`nextgen_stats` release, `ngs_{passing,receiving,rushing}.csv.gz`).**
Player-week grain with a week-0 season-aggregate row per player; **2016–2025**, gsis join
(`player_gsis_id`). **The prior "no CSV" blocker is stale — verified `.csv.gz` assets exist and
parse.** Two live gotchas verified: (a) the **per-year 2024/2025 assets are header-only stubs**
(9 and 5 rows) — ingest MUST use the combined all-season files (passing 5,933 rows; receiving
14,731; rushing 6,059; every season 2016–2025 densely populated); (b) rows are **NGS-qualifier
gated** (~60–83 receivers per week, ~129 per season-row year) — structural sparsity by design,
must be documented as qualifier-gated, not zero-filled. Marquee fields: receiving `avg_separation`,
`avg_cushion`, `avg_yac_above_expectation`, `percent_share_of_intended_air_yards`; passing
`avg_time_to_throw`, `completion_percentage_above_expectation`, `aggressiveness`,
`avg_air_yards_to_sticks`; rushing `rush_yards_over_expected`, `efficiency`. **KEEP** — player
drill-down gold, decodes with a gunzip (zlib built into Node). Parked follow-up now unblocked.

**Supersedes** the NGS conclusion in `perfgame-nflverse-stats-ingest.md` (recorded 2026-06-28 as
`.qs`/`.rds`/`.parquet`-only, csv 404). Re-verified 2026-07-03: NGS `.csv.gz` combined all-season
assets exist and gunzip via node zlib; per-year 2024/2025 assets are header-only stubs, so ingest
must slice the combined all-season files.

**C2. PFR advanced, season grain (`advstats_season_{rec,pass,rush,def}.csv`).** Player-season;
**2018–2025** verified (rec: 4,130 rows, ~510/season, all seasons present); join `pfr_id` → A1
widening. Marquee (rec): `ybc`/`ybc_r`, `yac`/`yac_r`, **`adot`**, `brk_tkl`, `drop`/
`drop_percent`, `rat`. This is the **industry-calibrated aDOT** that fixes the known Sleeper
`rec_air_yd` half-magnitude calibration defect (README notes it). Pass file: pressure/blitz/
hurry/hit + bad-throw%; rush: YBC/YAC per carry, broken tackles. **KEEP** (rec/pass/rush).
def file: **TOSS** for now — IDP out of scope, no app surface (revisit if IDP ever lands).

**C3. PFR advanced, weekly grain (`advstats_week_{rec,rush,pass}_<year>.csv`).** Player-game;
**2018+ only**; join `pfr_player_id` (+ `pfr_game_id`). Verified 2024 rec: 4,453 rows; header
carries drops/broken-tackles/int-when-targeted/rating — **YBC/YAC/aDOT are NOT in the weekly rec
file** (season-only, confirmed again). Rush weekly DOES carry per-game YBC/YAC. Pass weekly
carries per-game pressures/blitzes/hurries/hits. **KEEP** — per-game pressure & contact context,
sequenced after C2 (same crosswalk, finer grain, less marquee value).

**C4. Snap counts (`snap_counts_<year>.csv`).** Player-game; **2012–2025** (PFR-sourced);
verified 26,615 rows (2024) / 23,799 (2013), `pfr_player_id` 100%, `offense_snaps`/`offense_pct`
100%. Also `defense_snaps`, `st_snaps`. **KEEP** — backfills snap data to 2012 at per-game grain
(Sleeper `off_snp` only exists ≈2020/2021+ and only as our season aggregate); snap% is the
canonical opportunity denominator. **Cross-position context:** team snap totals define pace at
player grain; ST snaps explain kicker/return usage.

**C5. Kicking (player grain).** Two routes verified: legacy `player_stats_kicking.csv`
(1999–2024, 13,300 rows, appears frozen at 2024) and the **new `stats_player` release weekly file
(`stats_player_week_<year>.csv`) which carries the full kicking family for K rows: `fg_made/att/
missed/blocked`, per-distance-bucket makes/misses (`fg_made_0_19` … `fg_made_60_`), `fg_long`,
`fg_made_distance`/`fg_missed_distance` (summed yards), `fg_made_list` (per-kick distances!),
`pat_*`, `gwfg_*`** — same asset the gamelogs ingest already fetches, join gsis via existing
crosswalk. **KEEP** — kicker per-game logs are (a) a missing position in `gamelogs` (current
filter: QB/RB/WR/TE/FB) and (b) **the cross-position RZ-equity signal**: a team whose kicker eats
short FGs is stealing TDs from its RB/WR/TE (kicking→RZ equity archetype). Use the new release,
not the frozen legacy file.

**C6. ESPN QBR (`espn_data` release, `qbr_{week,season}_level.csv`).** QB-week + QB-season;
**2006–2025** verified (10,709 week rows, 1,523 season rows); join `player_id` = **espn_id** →
A1 widening (6,198 sleeper+espn rows). Marquee: `qbr_total`, `epa_total`, `pts_added`, component
decomposition (pass/run/sack/penalty). **KEEP** — opponent-adjusted QB quality view-only metric;
also team-context for that QB's pass-catchers (a WR attached to a rising QBR situation).
Cross-position context flag: QB quality conditions WR/TE/RB receiving output.

**C7. Injuries (`injuries_<year>.csv`).** Player-week official report; **2009–2025**; gsis join.
Verified 2024: 6,263 rows; `report_status` distribution Questionable 1,512 / Out 1,115 / Doubtful
194 / empty 3,436 (empty = practice-report-only listings — honest, keep as null); practice status
+ primary/secondary body part. 2013 file same header (5,070 rows). **KEEP** — directly fills the
season-totals `absenceCause: "unknown"` placeholder and the empty hand-authored
`enrichment/injuries.json` (which has 0 entries after a year — the manual path demonstrably
doesn't happen); pure drill-down value ("why did he miss weeks 3–7?").

**C8. Weekly rosters (`weekly_rosters` release, `roster_weekly_<year>.csv`).** Player-week status;
2002–2025; verified 2024: 46,579 rows; **carries `sleeper_id` natively** (plus gsis/espn/pfr…),
`status`/`status_description_abbr` per week (ACT/RES/PUP/practice-squad etc.). **KEEP** — weekly
transaction/IR timeline at zero crosswalk cost; complements C7 (report says Questionable; this
says he was moved to IR week 5). Lower priority than C7 (bulkier, overlapping signal).

**C9. Combine (`combine.csv`).** Player-event; **2000–2026** verified (8,968 rows; fill: forty
90%, bench 60%, `pfr_id` 83%, `cfb_id` 83%). Join pfr_id → A1. **KEEP** — athletic-testing bio
for prospect drill-down beside CFBD college stats; honest-null the missing drills. Sparse-fill is
event-truth (players skip drills), not source rot.

**C10. Contracts (OTC via `contracts` release, `historical_contracts.csv.gz`).** Contract grain;
31,893 rows, all eras; join `otc_id` → **bridge via A2 players.csv** (no gsis in file — verified).
Marquee: `apy`, `guaranteed`, `apy_cap_pct`, `year_signed`/`years`, inflated variants. Caveat
verified: the `season_history` column is empty in the CSV export (nested data lives only in
rds/parquet — do not pretend to serve it). **KEEP** — team investment is real usage context
(draft capital + contract = opportunity prior) and dynasty-relevant drill-down. Sequenced late:
otc_id fill is 37% overall (concentrated in modern players — fine for its use).

**C11. Depth charts (`depth_charts_<year>.csv`).** Team-week-slot; 2001–2026. **Schema break
verified at 2025:** 2001–2024 share one header (`season,club_code,week,…,gsis_id,depth_position`,
37,779 rows in 2024, 23 distinct weeks); **2025+ is a different daily-snapshot feed**
(`dt,team,player_name,espn_id,gsis_id,…,pos_slot,pos_rank`; 554,215 rows in 2025 — one row per
player per DAY). **KEEP (historical 2001–2024) / DEFER (2025+ format)** — historical weekly depth
is drill-down context the Sleeper point-in-time snapshot can't reconstruct; the new feed needs its
own reduction decision (e.g. weekly downsample) before it's servable. Ship the stable era first.

**C12. Trades (`trades.csv`).** Trade grain, 2002–2026 (4,975 rows). **TOSS** (see §3).

**C13. Misc release (pfr_rosters, espn_draft_probs, multiple_lateral_yards, pbp_patch_ids).**
**TOSS** (see §3).

### D. Sleeper API (beyond season-totals)

**D1. Weekly projections (`api.sleeper.com/projections/nfl/<year>/<week>?season_type=regular`).**
Player-week projections incl. `pts_half_ppr/ppr/std` and full stat-line projection. Verified
retention: rows exist for all years but **real values only 2018+** (with-pts rows per week: 2018:
520, 2020: 775, 2022: 850, 2024: 823; 2013/2016: 0 — placeholder rows). **KEEP** — a
market-consensus weekly prior, backfillable 2018–2025 today; capture-only (never feeds our
projection); provenance guard against Sleeper dropping history. Cross-position: none (per-player).

**D2. Weekly stats (`api.sleeper.com/stats/nfl/<year>/<week>?season_type=regular`).** Player-week
actuals — the exact rows season-totals aggregates then discards. Verified 2024 wk5: 2,074 rows;
carries **weekly `off_snp`/`tm_off_snp`/`tm_def_snp`/`tm_st_snp`, `pass_rz_att`/`rec_rz_tgt`/
`rush_rz_att`, `pass_air_yd`, pos_rank_* and Sleeper-basis `pts_*`** — none of which nflverse
gamelogs carries (different stat vocabulary, Sleeper-native scoring). **KEEP** — weekly grain of
our own canonical stat vocabulary; enables week-drill-down in the app's own units and preserves
the grain the retire-raw-stats task is deleting (those dumps are unversioned exports; this would
be a proper schema'd ingest — no conflict, but say so in the slice). Field-era caveat: snap/RZ
keys ≈2020/2021+ as in season-totals.

**D3. Trending (`api.sleeper.app/v1/players/nfl/trending/{add,drop}`).** Point-in-time attention
counts (24h lookback); verified live. No history endpoint — value accrues only forward.
**KEEP (low priority)** — cheap dated capture beside KTC as a second market-attention signal;
honest framing: an archive built from now on, thin until it accumulates.

**D4. Sleeper depth chart / injury status re-capture.** Point-in-time fields on `/players/nfl`
(already captured daily in projection snapshots' `teamDepthCharts`). **TOSS as a separate
capture** — dominated by C7/C11 on both provenance and history (see §3).

### E. CFBD and KTC — gaps only (per task scope)

- **CFBD pre-2017:** upstream supports earlier seasons; our files start 2017. Backfill 2012–2016
  would align college coverage with the NFL floor. Quality thins with age — sample before
  committing (same bulk endpoint, so a small slice). Also uningested: other stat categories
  (defense, kicking/punting) — no app surface today; leave unlisted until wanted.
- **KTC:** history begins 2026-05-18 (4 snapshots on disk); no public backfill for past values —
  per-player history exists on KTC player pages but is a different, heavier scrape. **DEFER**
  (blocked: no sanctioned bulk-history source). Forward accumulation already automated.

---

## 3. Toss list (explicit — for product-owner approval, not silently dropped)

**APPROVED 2026-07-03 by product owner — these items are out of scope; not on the backlog.
Any later need re-enters as a new candidate.**

| Item | Reason (one line) |
|---|---|
| Officials (`officials.csv`) | Referee crews condition fantasy outcomes only marginally and have no drill-down surface — fails both KEEP legs. |
| NFL trades (`trades.csv`) | Team transaction log (mostly pick swaps); doesn't condition player fantasy output and duplicates draft-capital info we already serve. |
| PFR advanced **def** files (season + weekly) | IDP is out of app scope; structurally unrelated to current fantasy surface (revisit only if IDP lands). |
| `misc` release (pfr_rosters, espn draft probs, lateral yards, pbp patch ids) | Niche one-offs: duplicates of ingested data at equal/coarser grain or football-trivia with no conditioning value. |
| nfldata `teams.csv` (colors/logos) | App presentation asset, not football data; the app can vendor it directly if ever wanted. |
| Sleeper depth-chart/injury-status re-capture (D4) | Pure duplicate of nflverse depth charts + injuries at worse provenance and no history. |
| Legacy `player_stats` release assets (incl. frozen `player_stats_kicking.csv`) | Superseded duplicate of the `stats_player` release at equal grain (kicking file frozen at 2024). |
| NGS per-year 2024/2025 assets | Verified header-only stubs (9/5 rows) — stale duplicates; combined files are authoritative. |

---

## 4. Prioritized capture backlog (each item = a future two-session feature)

Ordering = value-per-effort with dependencies respected, **except B1** (foundation gap-fill,
sequenced first regardless of effort) **and B2** (pbp-derived team-context pack, pulled forward
from its value-per-effort slot because the projection-engine refactor consumes it as a pre-step).
Every slice inherits: **ad-blocker-safe
served paths** (no `adv`/`ad`/`ads`/`analytics`/`tracking` tokens — all names below checked;
NB the existing `nflverse/advstats/` path already violates this, a known parked flag, do not
propagate the pattern) and **capture-only/view-only framing** (decoupled from projection/scoring/
grading; honest nulls, never zero-filled or fabricated; manifest + schemaVersion + sparsity gate +
content-hash-dedup Action per repo convention).

| # | Slice | Source / grain | Why (incl. context value) | Size | Deps / blockers | Coverage caveats |
|---|---|---|---|---|---|---|
| B1 | **Gap-fill + data-catalog seed** | re-run existing ingests: `advstats`+`gamelogs` 2019 & 2025, `roster --year` 2012–2023 backfill; **create `data-catalog.md` (§5)** | Closes known holes in shipped families before adding new ones; catalog doc starts here | S | none — assets verified present upstream | **2025 gap = offseason-not-yet-published for both advstats and gamelogs (benign; fills on cadence, not a bug). The 2019 gap is PER-FAMILY, not a shared cause: gamelogs 2019 is confirmed upstream-absent (`stats_player_week_2019.csv` → HTTP 404 while 2018/2020 → 403, verified 2026-07-03), so re-running the same fetch won't recover it (needs an alternate asset/source, if one exists); advstats 2019 was logged as a backfill write-failure (findings §6.8), likely re-runnable via `advstats --year 2019 --force`. Before concluding upstream-absent, confirm the `--all` season enumeration (`MIN_GAMELOG_SEASON` in `lib/nflverse.mjs`) does not itself skip 2019. Investigate the two families separately.** |
| B2 | **pbp-derived team context pack** | `play_by_play_<year>.csv.gz` (server-side derive-and-discard) → `nflverse/teamcontext/<year>.json`; team-week | Pace/plays, **PROE** (`xpass`/`pass_oe` verified 1999+), RZ tendencies, **kicking freq/distance**, defense-faced EPA splits — the audit thesis's flagship **cross-position** slice | L | none technically; design doc for metric definitions; ~25 MB gz/season fetch in Action | derived-values-only served (raw pbp never committed); weather cols null indoors (honest). **Promoted from value-per-effort ordering to priority-2 because this pack is the cross-position context substrate the projection-engine refactor consumes (its stated pre-step). Caveat: this is the HEAVIEST slice on the board — play-by-play is the largest nflverse artifact, and PROE/pace/defense-faced are DERIVED features requiring a defined computation, not raw-column fetches. Expect an S1-heavy task file; do not scope it as a quick slice.** |
| B3 | **Team weekly stats** | `stats_team_week_<year>.csv` → `nflverse/teamstats/<year>.json`; team-game | Cheapest defensible defense-faced + team-environment capture; kicking counts at team grain (**cross-position**) | S | none (gsis-free; team+week join to schedule) | 1999+; EPA fields are nflverse-modeled values |
| B4 | **Kicker gamelogs** | `stats_player_week` K rows (same asset as gamelogs) → sibling `nflverse/kicking/<year>.json` **only** | Missing position; per-kick distance lists; **kicking→RZ equity is the archetype cross-position signal** | S | none (existing fetch + crosswalk) | kicking fields sparse pre-charting era; K rows only. **Ingest as a SIBLING file `nflverse/kicking/<year>.json`. Do NOT widen the existing `gamelogs` position filter: that would add K rows to already-shipped append-only gamelogs files, change `rowCount`/`recordCount` for existing seasons, and risk the app loader's `rowCount >= MIN_PLAYERGAME_ROWS` re-assert (`nflGameLogs.js`) — an append-only + cross-repo-contract violation.** |
| B5 | **Injury reports** | `injuries_<year>.csv` → `nflverse/injuries/<year>.json`; player-week | Fills `absenceCause:"unknown"` + the empty hand-authored injuries overlay; pure drill-down | S–M | none (gsis crosswalk exists) | 2009+; ~55% of rows are practice-report-only listings (status null — keep honest). Reconstructable historical nflverse injury-report feed — distinct from the ephemeral current-week injury designation banked app-side at snapshot time (same reconstructable-vs-ephemeral split as B15). The empty status bucket (~55%) is practice-report-only listings — honest, keep as null. |
| B6 | **Crosswalk widening + players master** | extend `playerids` ingest to also emit `pfrIds`/`espnIds` maps (same source CSV, verified cols) + ingest `players.csv` → `nflverse/players.json` | Unblocks B7/B8/B9-pass/B10/B12; bio/anthro + otc bridge is itself a KEEP capture | M | none | otc_id 37% fill (modern-era concentrated); document per-id fill in catalog. **Done-definition must EMIT an `otc_id`→`sleeper_id` bridge and `pfr_id`/`espn_id` maps, not merely serve `players.csv` as an internal bio file. B13 consumes both (contracts join via `otc_id`, combine via `pfr_id`); if B6 ships `players.csv` unindexed, B13 is blocked.** |
| B7 | **Snap counts** | `snap_counts_<year>.csv` → `nflverse/snapcounts/<year>.json`; player-game | Snap% = canonical opportunity denominator, backfills to 2012 (Sleeper has ≈2020+ only, season-grain) | M | B6 (pfr join) | 2012+; PFR-sourced; includes def/ST snaps |
| B8 | **PFR season advanced (rec/pass/rush)** | `advstats_season_{rec,pass,rush}.csv` → `nflverse/pfrseason/<year>.json` | Industry-calibrated **aDOT/YBC/YAC** (fixes Sleeper aDOT calibration defect as view-only truth); QB pressure context | M | B6 (pfr join) | **2018+ only**; def file tossed |
| B9 | **Next Gen Stats** | combined `ngs_{passing,receiving,rushing}.csv.gz` → `nflverse/ngs/<year>.json`; player-week + week-0 season rows | Separation/cushion/xYAC/TTT/CPOE — marquee player drill-down; parked follow-up now **unblocked** (csv.gz verified) | M | none (gsis join; gunzip via node zlib) | **2016+; qualifier-gated rows (~60–80/wk) — document as gated, don't infer absence=zero; must slice combined files (per-year 2024/25 assets are stubs). Supersedes the NGS conclusion in `perfgame-nflverse-stats-ingest.md` (see §2 C1).** |
| B10 | **ESPN QBR** | `qbr_{week,season}_level.csv` → `nflverse/qbr/<year>.json` | Opponent-adjusted QB quality; conditions pass-catcher context (**cross-position**) | S | B6 (espn join) | 2006+; QB-only; ESPN model values |
| B11 | **Sleeper weekly projections archive** | `api.sleeper.com/projections/nfl/<y>/<w>` → `sleeper/projections/<year>.json`; player-week | Market-consensus prior, backfillable 2018–2025 **today**; provenance hedge against API history loss | M | none | **real values 2018+ only (verified; earlier years are placeholders)**; capture-only — never feeds our projection |
| B12 | **Sleeper weekly stats archive** | `api.sleeper.com/stats/nfl/<y>/<w>` → `sleeper/weekly/<year>.json`; player-week | Weekly grain of our canonical stat vocabulary (weekly snaps/RZ/air-yds, Sleeper-basis pts) that season-totals aggregates away; distinct from retire-raw-stats (schema'd ingest vs unversioned dumps — state this in the slice) | M | none | snap/RZ keys ≈2020/2021+; 18 fetches/season × 14 seasons on backfill. **Rate-stat trap: store Sleeper-basis counting stats and per-week rates verbatim; NEVER sum weekly rate keys (`pass_rtg`, `cmp_pct`) into a season figure — recompute season rates from components (`pass_cmp`/`att`/`yd`/`td`/`int`). Same C4 aggregation trap CLAUDE.md documents for season-totals.** |
| B13 | **Contracts + combine (market/athleticism pack)** | `historical_contracts.csv.gz` + `combine.csv` → `nflverse/contracts.json` + `nflverse/combine.json` | Team investment prior (apy_cap_pct) + athletic testing; dynasty drill-down | M | **B6 — blocked without B6's `otc_id`/`pfr_id` bridge maps (contracts join via `otc_id`, combine via `pfr_id`); a players.csv-only B6 does not unblock B13** | otc_id 37% overall; combine drills skipped by players (bench 60%) — honest nulls; `season_history` unavailable in CSV (do not fabricate) |
| B14 | **Weekly roster status timeline** | `roster_weekly_<year>.csv` → `nflverse/rosterweeks/<year>.json`; player-week | IR/PUP/practice-squad timeline; **native sleeper_id** (zero crosswalk) | M | none | 2002+; ~46k rows/season — consider slimming to status-change events |
| B15 | **Depth charts (historical era)** | `depth_charts_<year>.csv` 2001–2024 → `nflverse/depthcharts/<year>.json`; team-week-slot | Historical weekly depth context the Sleeper point-in-time capture can't reconstruct | M | none for 2001–2024 | **2025+ schema break verified (daily feed, different cols) — explicitly out of this slice; DEFER until a downsample design exists.** This is the reconstructable historical nflverse weekly depth-chart feed — distinct from, and not a substitute for, the ephemeral snapshot-time depth order banked app-side by `context-instability-capture.md` (`teamDepthCharts[...].depthOrder`). Do not conflate; do not backfill the ephemeral signal from this feed. |
| B16 | **PFR weekly advanced (rec/rush/pass)** | `advstats_week_{rec,rush,pass}_<year>.csv` → `nflverse/pfrweeks/<year>.json`; player-game | Per-game pressures/drops/broken-tackles/rush-YBC-YAC | M | B6 (pfr join); after B8 | **2018+; YBC/YAC/aDOT receiving are NOT weekly (season-only — re-verified)** |
| B17 | **Sleeper trending archive** | trending add/drop endpoints → `sleeper/trending/<date>.json`; dated snapshot | Second market-attention signal beside KTC; forward-only accumulation | S | none | no backfill exists; thin value until history accrues |
| B18 | **CFBD pre-2017 backfill** | existing `cfbd` subcommand, years 2012–2016 | Aligns college floor with NFL floor (2012) | S | CFBD key (have) | sample coverage per year before committing; thinner data with age |

**DEFER (blocked — keep-worthy, do not schedule yet):**
- **FTN charting** — needs pbp play→player attribution + CC-BY-SA share-alike care; 2022+ only. Revisit after B2 exists.
- **Participation raw** — same attribution pipeline; era-split (NGS-era vs 2024+ source) needs a consistency design; the derived routes-run/YPRR table is the prize. Revisit after B2.
- **Depth charts 2025+ feed** — daily-grain firehose (554k rows/season) needs a downsample decision.
- **KTC historical values** — no sanctioned bulk source; per-player page scrape is heavy and fragile.

---

## 5. Proposed data-catalog doc (created by B1 — shape only, not written here)

`data-catalog.md` at repo root, one section per served family, each row auto-checkable against
manifest.json. Proposed columns per family:

- **Path / subcommand / Action** (where it lives, how it refreshes)
- **Source + provenance** (upstream asset URL, license/attribution if any — FTN-style terms land here)
- **Grain** (player-season / player-game / team-week / dated snapshot)
- **Join id(s)** (sleeper_id native? via which crosswalk?)
- **Coverage** (year floor/ceiling + per-field era caveats, e.g. "snap keys 2021+", "qualifier-gated")
- **Null semantics** (omit-on-null? what does absent mean?)
- **Consumption status** (app-consumed via which loader / **banked view-only** / internal-only)
- **Cross-position context flags** (kicking→RZ equity style notes)

Plus a short header stating the capture-only doctrine (banked data never silently feeds
projection/scoring) and the ad-blocker naming rule. Each subsequent backlog slice appends its own
row as part of its done-definition (this keeps the growing dataset documented without a separate
docs task). The existing `docs/signal-registry.md` in the app repo stays the *signal* registry;
`data-catalog.md` is the *storage* registry — link them, don't merge them.

---

## Cross-repo impact (anticipated app-side loaders/contracts — NOT planned here)

Backlog items that will later require a `sleeper-dashboard` loader/contract mirror (per the
`nflRoster.js`/`nflGameLogs.js` pattern: `tryDataStore`/`getManifestEntry`, schema gate, sparsity
re-assert):
- **B3 teamstats**, **B4 kicker gamelogs** (ships as a **new** loader for the sibling
  `nflverse/kicking/<year>.json` file — does NOT modify the `nflGameLogs` contract),
  **B5 injuries**, **B7 snapcounts**, **B8 pfrseason**, **B9 ngs**, **B2 teamcontext**,
  **B10 qbr**, **B12 sleeper weekly stats**, **B13 contracts/combine**, **B14 rosterweeks**,
  **B15 depthcharts** — each ships a served-shape + sparsity-constant contract row in CLAUDE.md
  when implemented.
- **B6 crosswalk widening** is internal-only (like playerids today) unless the app later wants
  the bio table (`nflverse/players.json` would then need a loader).
- **B11 sleeper projections archive** and **B17 trending** are bank-only until a UI surface asks.
- **B1 gap-fill** has NO app impact (existing contracts, more seasons).
- The audit itself changes nothing app-side.

---

## Sample-verification appendix (what was fetched 2026-07-03)

Recent + older season per family, from live release assets: pbp 2024/2013 (49,492/48,158 rows ×
372 cols); stats_team_week 2024/2012 (570/534); NGS combined passing/receiving/rushing (5,933/
14,731/6,059 rows, 2016–2025) + per-year 2024 stubs (9/5 rows); PFR season rec (4,130 rows,
2018–2025) + weekly rec 2024 (4,453); FTN 2024 (48,031); snap counts 2024/2013 (26,615/23,799);
participation 2024/2018 (45,919/47,875); depth charts 2024/2005 (same header) + 2025 (new schema,
554,215 rows); injuries 2024/2013 (6,263/5,070); combine (8,968, 2000–2026); contracts (31,893);
officials (21,900, 2015–2025); QBR week/season (10,709/1,523, 2006–2025); players.csv (25,033);
roster_weekly 2024 (46,579); trades (4,975); db_playerids (12,467; pfr 77%/espn 65%/ktc 4%);
Sleeper projections weeks sampled 2013/2016/2018/2020/2022/2024 (real values 2018+); Sleeper
weekly stats 2024-wk5 (2,074 rows); Sleeper trending (live). Field-fill percentages quoted in §2
come from quote-aware full-file scans of these samples, not head-row eyeballing.
