# Team-context pack ingest (audit B2) — pbp-derived team/game-context features — Session 1 plan

**Status:** planned 2026-07-04. Session 1 = this file only — NO source edits, NO ingest runs.
**Session 2 (sonnet):** implement exactly this; read the cited line anchors, not whole files.
**Slice origin:** `.claude/tasks/data-completeness-audit.md` §4 B2 — promoted to priority-2 as the
cross-position-context substrate the projection-engine refactor consumes. HEAVIEST slice on the
board; the features are DERIVED (defined computations over play-by-play), not raw-column fetches.
**Doctrine:** view-only/capture-only — this pack must NEVER be wired into projection/scoring/
grading in this slice. Append-only, honest nulls, manifest + write-gate + schemaVersion + Action
conventions by name. Ad-blocker-safe naming throughout (`teamcontext` carries no
`adv`/`ad`/`ads`/`analytics`/`tracking` token).

---

## 0. Source verification (live fetches, 2026-07-04 — not memory)

Fetched and fully parsed four seasons of `play_by_play_<year>.csv.gz` from the nflverse `pbp`
release (`https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_<year>.csv.gz`):

| Season | gz size | rows | cols | notes |
|---|---|---|---|---|
| 2024 | 19.4 MB | 49,492 | 372 | recent |
| 2013 | 18.3 MB | 48,158 | 372 | older; identical header |
| 2006 | 17.5 MB | 46,299 | 372 | xpass boundary (first year WITH) |
| 2005 | 14.4 MB | 46,823 | 372 | xpass boundary (last year WITHOUT) |

Per-column fill (share of all rows with a non-empty, non-`NA` cell; quote-aware full-file scan):

| Column | 2024 | 2013 | 2006 | 2005 | verdict |
|---|---|---|---|---|---|
| `xpass` / `pass_oe` | 76.1 / 73.9% | 75.8 / 73.8% | 75.9 / 73.5% | **0.0 / 0.0%** | **boundary = 2006** (nflfastR xpass model). Moot at our 2012 floor but MUST stay honest-null if the floor ever widens |
| `epa` / `success` | 98.8% | 98.9% | 98.8% | 98.8% | full at any plausible floor |
| `wp` / `vegas_wp` | 99.4% | 99.4% | 99.4% | 99.4% | full |
| `yardline_100` | 92.8% | 93.2% | 93.0% | 93.1% | full on scrimmage rows (nulls are kickoffs/timeouts/END rows) |
| `game_seconds_remaining` / `half_seconds_remaining` | 100% | 99.9% | 99.9% | 99.9% | full |
| `fixed_drive` | 100% | 100% | 100% | 100% | full |
| `fixed_drive_result` | — | — | — | — | **100% on scrimmage rows** (verified in prototype run, 2024 + 2013) |
| `pass` / `rush` / `play` | 100% | 100% | 100% | 100% | 0/1 indicators, never NA |
| `posteam`/`defteam` | 94.5% | 94.9% | 94.8% | 94.9% | null on kickoffs/game-admin rows — the natural scrimmage filter |
| `total_home_score`/`total_away_score` | 100% | 100% | 100% | 100% | full |

Structural findings (each verified against the fetched files, not assumed):

1. **Header is unusually stable: 372 columns, byte-identical column set 2005→2024.** Column
   lookup is still by name (repo convention), never by index.
2. **xpass/pass_oe start at 2006 exactly** (2005 = 0.0%). At the chosen 2012 floor every feature
   is fully available; the boundary is documented for any future widening toward pbp's 1999 floor.
3. **Team-abbr trap (load-bearing):** pbp team COLUMNS (`posteam`/`defteam`/`home_team`/
   `away_team`) are normalized to CURRENT franchise codes in every season — fetched 2013 shows
   `LA LAC LV`, never `STL SD OAK`. But this repo's join domain (schedule `homeTeam`/`awayTeam`,
   season-totals per-season `team`) is ERA-ACCURATE. Verified against on-disk schedule files:
   2013/2015 = `STL SD OAK`; 2016 = `LA` + `SD OAK`; 2017 = `LAC` + `OAK`; 2020 = `LV`.
   → ingest must remap: `LA→STL` for season ≤ 2015, `LAC→SD` ≤ 2016, `LV→OAK` ≤ 2019.
4. **`game_id` is already era-accurate** (`2013_01_ARI_STL`, 267 distinct ids, zero containing
   LA/LAC/LV in 2013) and equals schedule `gameId` verbatim — a clean cross-family join with no
   remap. Only the team columns need remapping.
5. **Play-basis facts:** kneels/spikes carry `pass=0, rush=0` (0 of 36,725 pass|rush rows in 2024
   were kneels) — structurally outside every basis below, no filter needed. `no_play`
   (penalty-negated) rows DO carry `pass|rush=1` (1,675 rows in 2024) and DO carry `xpass`
   (1,667/1,675) — must be excluded explicitly. `two_point_attempt=1` rows sit inside pass|rush
   (148 in 2024) and never carry `xpass` (0/148) — excluded explicitly (they'd otherwise pollute
   RZ pass-rate).
6. **`season_type` ∈ {REG, POST}**; POST weeks continue the `week` numbering (2024: 19–22).
   Schedule's finer `gameType` (WC/DIV/CON/SB) is reachable via the `gameId` join.

Prototype run (full aggregation implemented in scratch, 2024 + 2013) — sanity results:

- 2024: **570 team-game rows** (= 285 games × 2 = schedule 2024 `rowCount` ✓), 32 teams,
  17 REG games each; 2013: 534 rows, 16 REG each, era-remapped `STL SD OAK` present ✓.
- League plays/team-game 64.5 (2024, before the no_play/2pt exclusions → ≈61.5 after — matches
  official plays/game), pass (dropback) rate .610, RZ trips 3.35/game, league-mean PROE ≈ 0 ✓.
- **Season PROE from summed components, 2024: CIN +.089, KC +.056, MIN +.047 top; PHI −.078,
  GB −.076, IND −.075 bottom — matches published PROE tables' ordering.** 2013 top = NO +.089
  (Payton/Brees) — plausible era check.
- Serialized team-week season file: **710 KB pretty-printed (374 KB minified)** for 2024 with a
  41-field row; the final 49-field row (§4) lands ≈ 0.8–0.9 MB pretty.

---

## 1. Grain decision: team-week (team-game), decided with sizes

**Decision: team-week (one row per team per game), the finest grain.** Season is always derivable
from weekly by summing components; weekly is never derivable from season — the gamelogs-slice
discipline. The size argument *for* the fallback does not materialize:

| Artifact | per-season size (pretty) | family total |
|---|---|---|
| **teamcontext @ team-week (measured prototype + margin)** | **≈ 0.8–0.9 MB** | ≈ 12 MB (2012–2025) |
| teamcontext @ team-season (fallback, not needed) | ≈ 50 KB | ≈ 0.7 MB |
| existing `nflverse/gamelogs/<year>.json` | 8.1 MB | 106 MB |
| existing `nfl/season-totals/<year>.json` | 3.5 MB | — |
| existing `nflverse/advstats/<year>.json` | 188 KB | — |
| existing `nflverse/schedule/<year>.json` | 104 KB | — |

A teamcontext season file is ~10% of a gamelogs season file; the whole family is ~11% of the
gamelogs family; jsDelivr's per-file ceiling (20 MB) is 20× away. Repo/CDN health is a non-issue
at team-week. The heavy part of this slice is the **Action-side fetch** (~15–19 MB gz per season,
decompressing to ~140 MB of CSV text) — a derive-and-discard cost, never committed.

**C4 aggregation-trap discipline (binding for every rate below):** each row stores the raw
components (counts/sums) AND the rate valid at row grain. Consumers derive season figures by
summing components and recomputing — **never by summing or averaging the per-game rates**.
Explicit recipes in §4.3.

---

## 2. Feature definitions (the heart — derived, not fetched)

### 2.0 Shared bases

- **Scrimmage row:** `posteam` non-empty/non-`NA` AND (`pass == 1` OR `rush == 1`).
  (Kneels/spikes are structurally excluded — verified §0.5.)
- **Countable play** (the denominator basis for every feature): scrimmage row AND
  `play_type !== 'no_play'` AND `two_point_attempt != 1`.
- **Cell parsing:** every numeric cell through `numOrNull` (lib/nflverse.mjs:103) — `''`/`'NA'`
  → null, `'0'` → 0. A null cell never contributes to a numerator, denominator, or sum
  (honest-null; nothing is zero-filled).
- **Team keys:** `eraTeam(abbr, season)` remap (§0.3) applied to `posteam`/`defteam`/
  `home_team`/`away_team` before any keying, so served team keys live in the schedule/
  season-totals abbr domain.
- **Row identity:** `(team, gameId)`; carried fields `week` (pbp `week`), `seasonType`
  (pbp `season_type`, verbatim REG/POST), `gameId`, `opponent` (remapped defteam/posteam).

### 2.1 PROE — pass rate over expected  *(cross-position: conditions the WR/TE-vs-RB volume tilt)*

- **Columns:** `pass`, `xpass`, plus the countable-play basis columns.
- **Basis:** countable plays where `xpass` is non-null (`proePlays`).
- **Components stored:** `proePlays`, `proePassPlays` (basis rows with `pass == 1`),
  `proeXpassSum` (Σ xpass, 3 dp).
- **Rate stored:** `proe = (proePassPlays − proeXpassSum) / proePlays`, 3 dp; **null when
  `proePlays == 0`** — which is every row of a pre-2006 season (honest null, never 0) and any
  team-game where xpass is absent.
- We do NOT consume `pass_oe` (it is 100·(pass − xpass) per play; recomputing from `xpass`
  keeps the components sum-safe). No neutral-script filter: `xpass` already conditions on down/
  distance/score/clock, which is the entire point of "over expected" — neutral filters apply to
  raw pace, not to PROE.
- **Availability: 2006+ (verified §0.2); full at the 2012 floor.**
- `pass == 1` is the DROPBACK indicator (sacks + scrambles included) — correct for intent; the
  same basis is used for `passRate` so off-splits are internally consistent.

### 2.2 Pace  *(cross-position: raw volume prior for every position)*

Two measures, both stored as components + rate:

- **Play volume:** `plays` (countable plays), `passPlays`, `rushPlays`,
  `passRate = passPlays / plays` (3 dp, null if `plays == 0`). Plays-per-game is consumer-side:
  Σ plays ÷ games (the `games[]` length at whatever seasonType filter the consumer wants).
- **Situation-neutral seconds-per-snap:** on consecutive COUNTABLE plays within the same
  `(gameId, posteam, fixed_drive)`, where BOTH endpoints pass the neutral filter
  (`wp` ∈ [0.2, 0.8] AND `qtr ≤ 3` AND `half_seconds_remaining > 120`), take
  `gap = gsr_prev − gsr_curr` from `game_seconds_remaining`; keep gaps in **[5, 45] s**
  (a >45 s gap is a stoppage — timeout/review/injury; <5 s is clock anomaly). Any intervening
  non-countable row (penalty no_play, timeout row, etc.) breaks the chain — deliberate, so
  stoppage-contaminated gaps never enter.
  **Components:** `neutralSeconds` (Σ kept gaps, integer), `neutralGaps` (count).
  **Rate:** `neutralSecPerPlay = neutralSeconds / neutralGaps` (3 dp, **null when
  `neutralGaps == 0`** — real case: a wire-to-wire blowout has no neutral snaps; honest null).
  Prototype league means: 33.6 s (2024) vs 31.4 s (2013) — internally consistent with the known
  league-wide pace slowdown; absolute level depends on the clamp/filter and is documented as
  this pack's own definition, not a claim to match any third-party pace stat.
- **Columns:** `game_seconds_remaining`, `wp`, `qtr`, `half_seconds_remaining`, `fixed_drive` +
  basis columns. **Availability: 1999+ (fills verified ≥99.9% in 2005); full at floor.**

### 2.3 Red-zone tendencies  *(cross-position: THE kicking→RZ-equity archetype, generalized —
a team's RZ pass rate conditions its WR/TE vs RB TD equity; its FG-settle rate conditions
kicker volume vs TD-scorer equity)*

- **RZ boundary:** `yardline_100 ≤ 20` (the standard red-zone definition).
- **Trip identity:** distinct `(gameId, fixed_drive)` with ≥ 1 countable play at
  `yardline_100 ≤ 20` — one trip per drive no matter how many RZ snaps (Set-dedup).
- **Trip outcome:** the drive's `fixed_drive_result` (100% filled on scrimmage rows, §0):
  `'Touchdown'` → TD trip, `'Field goal'` → FG-settle trip. (An opponent scoop-and-score is
  `'Opp touchdown'` and counts as neither — correct.)
- **Components stored (off):** `rzTrips`, `rzPlays` (countable plays inside the RZ),
  `rzPassPlays`, `rzRushPlays`, `rzTdTrips`, `rzFgTrips`.
- **Rate stored:** `rzPassRate = rzPassPlays / (rzPassPlays + rzRushPlays)` (3 dp, **null when
  the team had zero RZ countable plays that game** — a real, common occurrence, not an error).
  TD/FG settle rates are consumer-side from components (`rzTdTrips/rzTrips`, `rzFgTrips/rzTrips`)
  — deliberately not stored per-game because trip counts of 0–5 make per-game rates noise.
- **Columns:** `yardline_100`, `fixed_drive`, `fixed_drive_result` + basis columns.
  **Availability: 1999+; full at floor.** Two-point tries are excluded from RZ splits (§0.5).

### 2.4 Defense-faced  *(cross-position: conditions EVERY opposing position's output; the
pass-EPA/rush-EPA split identifies pass-funnel vs run-funnel defenses → WR-vs-RB tilt against
that opponent)*

- **Decision: EPA-allowed + success-allowed + points-allowed, served at team-week grain** in a
  `def` block on the same row (each game emits two rows — offense view and defense view — so
  "defense-faced" is a lookup of the OPPONENT's `def` context, aggregated over whatever window
  the consumer wants; this repo serves the substrate, not a smoothed rating).
- **Components stored (def):** `plays`, `passPlays`, `rushPlays` (countable plays faced),
  `epaSum`/`epaPlays`, `passEpaSum`/`passEpaPlays`, `rushEpaSum`/`rushEpaPlays` (EPA sums are
  3 dp; `*Plays` count rows where `epa` was non-null), `successes`/`successPlays`,
  `rzTripsAllowed`, `rzTdTripsAllowed` (same trip logic as §2.3 from the defense's side),
  `pointsAllowed` (final opposing score — see §2.5).
- **Rates stored:** `epaPerPlay`, `passEpaPerPlay`, `rushEpaPerPlay`, `successRate`
  (each 3 dp, null on zero denominator).
- **Columns:** `defteam`, `epa`, `success` + §2.3 columns. **Availability: 1999+ (`epa`/`success`
  ≈ 98.8% fill in every probed season; the missing rows are non-scrimmage); full at floor.**

### 2.5 Offense quality + game script (same components mirrored on the `off` block)

- `epaSum`/`epaPlays`/`epaPerPlay`, `passEpaSum`/`passEpaPlays`/`passEpaPerPlay`,
  `rushEpaSum`/`rushEpaPlays`/`rushEpaPerPlay`, `successes`/`successPlays`/`successRate` —
  identical definitions to §2.4 from the offense's side.
- `pointsScored` / `pointsAllowed`: the game's final `total_home_score`/`total_away_score`
  (last row of the game), assigned by home/away after era remap; null only if the source rows
  were unparseable (never observed; defensive honesty).  *(cross-position: game-script prior —
  positive script → RB carry volume, negative script → pass volume.)*

### 2.6 Explicit cross-position conditioning map (why the refactor wants this pack)

| Feature | Conditions |
|---|---|
| `proe` | own WR/TE target volume vs own RB carry volume (team pass tilt) |
| `plays` / `neutralSecPerPlay` | raw opportunity volume for ALL own positions |
| `rzPassRate` | own WR/TE TD equity vs own RB goal-line TD equity |
| `rzTdTrips` vs `rzFgTrips` | own kicker FG volume vs own TD-scorer equity (the audit's kicking→RZ-equity archetype at drive-outcome grain) |
| `def.passEpaPerPlay` vs `def.rushEpaPerPlay` | OPPONENT WR/QB vs RB output (pass-funnel/run-funnel) |
| `def.rzTdTripsAllowed` | opponent TD-scorer equity in the RZ |
| `pointsScored`/`pointsAllowed` | game-script prior for both rosters |

---

## 3. Coverage decision

- **`MIN_TEAMCONTEXT_SEASON = 2012`** — aligns with the floor of every join target
  (season-totals, advstats, gamelogs all floor at 2012). pbp itself reaches 1999 and every
  feature except PROE is available there (PROE 2006+, §0.2); widening later = raise the
  constant + `--all --force` backfill + catalog-row coverage edit, no schema change. The 2006
  xpass boundary is therefore **documented but moot** at ship time.
- Backfill set: 2012–2025 (14 seasons; 2025 pbp verified present upstream by the audit).
  Current-season (2026) file appears in-season via the weekly Action.

---

## 4. Served artifact design

### 4.1 Path, key, and the join-key first-class point

- **Path: `nflverse/teamcontext/<year>.json`** — ad-blocker-safe (no
  `adv`/`ad`/`ads`/`analytics`/`tracking` substring; checked letter-wise), sibling of the other
  per-year nflverse families. Subcommand `teamcontext`, lib `lib/teamcontext.mjs`, script
  `scripts/update-teamcontext.mjs`, workflow `nflverse-teamcontext.yml` — all safe names.
- **This is the repo's FIRST team-keyed served family.** Every existing player family is
  `sleeper_id`-keyed; teamcontext is keyed by era-accurate team abbr (schedule domain, thanks to
  the §0.3 remap) + week. There is **no crosswalk dependency** — no playerids read, no Action
  ordering constraint (contrast update-gamelogs.mjs:64-79, which the implementer should NOT copy).
  The app joins players to this pack via each player's per-season team:
  `careerStats[season][pid].team` (season-totals v3) at season grain, or gamelogs
  `players[sid].games[].team`/`opponent` at week grain — both already live in the same
  era-accurate abbr domain. Spelled out again in Cross-repo impact (§9).

### 4.2 File shape

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

- `rowCount` = total team-game rows (= 2 × games; full season 534–570 incl. POST); manifest
  `recordCount = rowCount`. `teamCount` = `Object.keys(teams).length` (mirrors gamelogs'
  `playerCount` companion-count convention).
- `games[]` includes REG + POST rows, `seasonType` verbatim; consumers filter. **A bye week is
  simply an absent week in `games[]` — no fabricated row, no null-stuffed placeholder**
  (honest-null discipline at row grain).
- Every rate: 3 dp, null on zero denominator per §2. Sums: 3 dp. Counts: integers.

### 4.3 Consumer aggregation recipes (documented with the family; the C4 contract)

```
seasonProe          = (Σ proePassPlays − Σ proeXpassSum) / Σ proePlays
seasonEpaPerPlay    = Σ epaSum / Σ epaPlays          (same for pass/rush/def variants)
seasonRzPassRate    = Σ rzPassPlays / (Σ rzPassPlays + Σ rzRushPlays)
seasonRzTdRate      = Σ rzTdTrips / Σ rzTrips        (settle rate: Σ rzFgTrips / Σ rzTrips)
seasonNeutralPace   = Σ neutralSeconds / Σ neutralGaps
playsPerGame        = Σ plays / count(games)         (after the consumer's seasonType filter)
NEVER sum or average the stored per-game rates.
```

### 4.4 Gate, dedup, manifest, inProgress

- **Sparsity gate: `MIN_TEAMCONTEXT_ROWS = 60`** (≈ 2 full weeks × 32 rows). Rationale for a low
  floor vs gamelogs' ~50%: (a) a truncated gz download fails `gunzipSync` loudly (CRC), so the
  gate only needs to catch an empty/header-only asset; (b) a 50%-style floor would delay
  in-season serving to ~week 9 — a team-context pack consumed weekly should serve from week 2.
  Cross-repo constant: the app loader re-asserts `rowCount ≥ MIN_TEAMCONTEXT_ROWS`.
- **Wrong-asset guard:** the CSV's own `season` column (first parsed row) must equal the
  requested season, else throw (stronger than gamelogs' `parsed ?? season` fallback — remap
  correctness depends on the season, §0.3).
- **Content-hash dedup** on the `teams` object (stable team-key sort), SHA-256 — identical →
  no write, no manifest touch (mirrors `playersHash`, update-gamelogs.mjs:42-46).
- **`--force`** required to overwrite a completed past season (Invariant 1 append-only; the
  weekly Action only ever runs default = current season). Upstream nflfastR occasionally
  re-derives model columns (epa/xpass) for historical seasons; **policy: we do NOT chase
  re-derivations** — completed-season files are frozen at ingest; corrections only via the
  Invariant-1 committed-diff exception.
- **`inProgress: false` always** — the Invariant-5 deliberate deviation, same as every nflverse
  family: the app has no live fallback; weekly mutability = content-hash dedup + `lastModified`.
- **Manifest:** `updateManifestEntry({ path, recordCount: rowCount, inProgress: false,
  schemaVersion: 1 })` (lib/manifest.mjs:34) — no manifest-shape change.
- **schemaVersion: 1** (new family).

---

## 5. Implementation steps, grouped by file (Session 2)

### 5.1 `lib/nflverse.mjs` — constants + gz fetch (3 edits)

1. **After `MIN_GAMELOG_SEASON` (line 48):** add, with doc comments in the house style:
   ```js
   /** Minimum team-game rows for a teamcontext file to ship (≈2 full weeks × 32; gz CRC catches truncation). */
   export const MIN_TEAMCONTEXT_ROWS = 60;
   /** Earliest season to derive teamcontext (aligns with season-totals/advstats/gamelogs join floor; pbp reaches 1999, xpass 2006). */
   export const MIN_TEAMCONTEXT_SEASON = 2012;
   ```
2. **After `STATS_BASE` (line 57):** `const PBP_BASE = 'https://github.com/nflverse/nflverse-data/releases/download/pbp';`
3. **Next to `fetchPlayerStatsCsv` (line 398):** a gz-aware fetch. `fetchRelease` (line 116)
   returns `res.text()` and CANNOT be reused for binary gz — new sibling helper:
   ```js
   /** Fetch a gzipped release asset; 404/504 → null; gunzip via node:zlib. */
   async function fetchReleaseGz(url) { /* fetch → status checks as fetchRelease → Buffer.from(await res.arrayBuffer()) → zlib.gunzipSync(...).toString('utf8') */ }
   /** Fetch play_by_play_<year>.csv.gz from the nflverse pbp release. @returns {Promise<string|null>} */
   export async function fetchPbpCsv(year) { return fetchReleaseGz(`${PBP_BASE}/play_by_play_${year}.csv.gz`); }
   ```
   (adds `import zlib from 'zlib';` at top of file). Memory note: ~19 MB gz → ~140 MB string —
   fine on ubuntu-latest and local Node ≥ 20; `--all` processes seasons serially so nothing
   accumulates.

### 5.2 `lib/teamcontext.mjs` — NEW file, pure derivation (no I/O; the lib/grade.mjs layering)

```js
import { splitCsvLine, numOrNull } from './nflverse.mjs';

/** pbp team columns are normalized to current-franchise codes in ALL seasons (verified);
 *  remap to the era-accurate schedule/season-totals abbr domain. */
export function eraTeam(abbr, season) {
  if (abbr === 'LA'  && season <= 2015) return 'STL';
  if (abbr === 'LAC' && season <= 2016) return 'SD';
  if (abbr === 'LV'  && season <= 2019) return 'OAK';
  return abbr;
}

/**
 * Derive the team-week context pack from a season's pbp CSV.
 * Pure function — fetch/validate/write live in the caller.
 * Throws if required header columns are missing (fail-loud on upstream format change)
 * or if the CSV's season column contradicts `season` (wrong-asset guard).
 *
 * @param {string} csv
 * @param {{season:number}} opts
 * @returns {{ teams: object, season: number, rowCount: number, teamCount: number }}
 */
export function aggregateTeamContext(csv, { season }) { ... }
```

Internals (single pass over rows, mirroring the §2 definitions exactly):

- **Required header columns (throw if any missing):** `game_id, week, season_type, posteam,
  defteam, home_team, away_team, pass, rush, play_type, two_point_attempt, xpass, epa, success,
  wp, qtr, half_seconds_remaining, game_seconds_remaining, yardline_100, fixed_drive,
  fixed_drive_result, total_home_score, total_away_score` (header-present in all probed seasons;
  cells stay null-tolerant via `numOrNull`).
- Accumulator keyed `(team, gameId)`; per-row: countable-play filter (§2.0) → off/def component
  bumps (§2.1–2.5); RZ trip Sets keyed `gameId|fixed_drive` (dedup within the row accumulator,
  serialized as counts); pace chain state `(gameId, posteam, fixed_drive, prevGsr, prevNeutral)`
  reset on any non-countable row; final-score map from every row's `total_*_score` (last write
  wins = final).
- Emission: teams sorted alphabetically, `games[]` sorted by week — deterministic output for
  stable content-hashing and diffs; rates computed once from components at emission (3 dp,
  null-on-zero-denominator).

### 5.3 `lib/validate.mjs` — `validateTeamContext` (insert after `validateGameLogs`, ~line 505)

```js
export function validateTeamContext(teams, { year }) { ... }
```
Checks (defence-in-depth after the gate, mirroring validateGameLogs' structure at line 467):
1. total rows ≥ `MIN_TEAMCONTEXT_ROWS`; `Object.keys(teams).length ≤ 32`.
2. **Era-domain guard (the §0.3 regression trap, both directions):** for `year ≤ 2015` the key
   `LA` must not appear and for `year ≥ 2016` `STL` must not; likewise `LAC`/`SD` at 2016/2017
   and `LV`/`OAK` at 2019/2020.
3. **Honest-null guard:** if `year < 2006`, every `off.proe` must be null (dormant at the 2012
   floor; guards a future widening from silently fabricating PROE).
4. Rate ranges where non-null: `passRate`/`rzPassRate`/`successRate` ∈ [0,1]; `proe` ∈ [−0.5,0.5];
   `neutralSecPerPlay` ∈ [5,45]; `off.plays` ∈ [25,120] per row (plausibility).
5. `findNonFinite(teams)` (line 69) — no NaN/Infinity anywhere.

### 5.4 `scripts/update-teamcontext.mjs` — NEW orchestrator (template: update-gamelogs.mjs)

```js
export async function updateTeamContext({ year = null, all = false, dryRun = false, force = false } = {}) { ... }
function teamsHash(teams) { ... }  // stable-key SHA-256, mirrors playersHash (update-gamelogs.mjs:42)
```
Step sequence (per season), copying update-gamelogs.mjs anchors with two deliberate differences:
1. `fetchCurrentNflSeason()`; seasons = `--all` → `MIN_TEAMCONTEXT_SEASON..current` | `--year` |
   `[current]` (update-gamelogs.mjs:51-62).
2. **NO crosswalk read** — skip the update-gamelogs.mjs:64-79 block entirely (team-keyed family;
   difference #1).
3. `if (!all) setStepOutput('season', seasons[0])` (update-gamelogs.mjs:83 — Invariant 8's
   season-keyed purge contract).
4. `fetchPbpCsv(season)` → null → "not published yet — skipping" (update-gamelogs.mjs:91-95).
5. `aggregateTeamContext(csv, { season })` — throws on header drift / wrong season
   (difference #2: season is asserted, not adopted).
6. Gate: `rowCount < MIN_TEAMCONTEXT_ROWS` → "preliminary/partial, skipping"
   (update-gamelogs.mjs:109-115).
7. `validateTeamContext(teams, { year: season })`.
8. Content-hash dedup vs existing `nflverse/teamcontext/<season>.json`
   (update-gamelogs.mjs:121-130).
9. Dry-run print + continue; past-season `--force` gate (update-gamelogs.mjs:133-149).
10. `writeJsonStable` the §4.2 envelope; `updateManifestEntry({ path, recordCount: rowCount,
    inProgress: false, schemaVersion: 1 })` (update-gamelogs.mjs:152-165).

### 5.5 `bin/update.mjs` — dispatcher wiring (4 edits)

1. **Import (after line 40):** `import { updateTeamContext } from '../scripts/update-teamcontext.mjs';`
2. **Help SUBCOMMANDS (after the gamelogs lines 87-89):**
   ```
   teamcontext                 pbp-derived team/game context (PROE, pace, RZ, defense-faced), team-week
   teamcontext --year YYYY     Team context for a specific season
   teamcontext --all           Backfill every season (≥ 2012)
   ```
3. **Help OPTIONS (lines 93, 95):** add `teamcontext` to the `--force` family list; `--all`
   line becomes "(schedule/gamelogs/teamcontext subcommands)". **Also fix in passing:** line 93's
   `--force` list currently omits `schedule` vs README's list — bring both to
   `nfl/cfbd/roster/advstats/schedule/gamelogs/teamcontext`.
4. **Dispatch (after `case 'gamelogs'` lines 161-163):** `case 'teamcontext': await updateTeamContext(opts); break;`
   plus EXAMPLES lines after line 118.

### 5.6 `.github/workflows/nflverse-teamcontext.yml` — NEW (template: nflverse-gamelogs.yml, whole file)

- Cron **`53 13 * * 0` (Sunday 13:53 UTC)** — the only free weekday slot
  (Mon KTC / Tue roster / Wed playerids / Thu advstats / Fri schedule / Sat gamelogs); runs
  before Sunday kickoffs, so week N lands complete on the FOLLOWING Sunday (pbp for MNF settles
  Tue — any day ≥ Wed has the full prior week; acceptable one-week latency for a weekly pack).
  No ordering dependency on playerids (no crosswalk — unlike the gamelogs comment block, lines 5-8).
- Steps mirror nflverse-gamelogs.yml:20-55: checkout / node 20 / `npm ci` /
  `node bin/update.mjs teamcontext` (id: fetch) / commit-if-changed + purge `manifest.json` then
  `nflverse/teamcontext/${SEASON}.json` with `SEASON="${{ steps.fetch.outputs.season }}"`
  (Invariant 8 — season step-output, never `date -u +%Y`).
- `workflow_dispatch: {}` for manual runs.

### 5.7 `package.json` — smoke (1 edit, line 14)

Append to the `smoke` chain: `&& node bin/update.mjs teamcontext --year 2023 --dry-run`.
(~19 MB gz fetch + parse — comparable to the existing advstats/gamelogs smoke fetches.)

### 5.8 Backfill runbook (implementer, once, after code lands)

```sh
node bin/update.mjs teamcontext --all            # 2012–2025; ~250 MB total download, serial
# spot-check: node -e assert on 2024 rowCount === 570 and 2013 teams include STL/SD/OAK
```
Then the Session-git-workflow sequence (CLAUDE.md lines 230-243): commit, pull --rebase (manifest
= union), push, purge manifest.json + each `nflverse/teamcontext/<year>.json`.

---

## 6. Docs updates (every enumeration list that historically lags — concrete before/after)

**CLAUDE.md:**
1. Commands block (after line 35): add the three `teamcontext` usage lines (§5.5.2 text).
2. Flags comment (line 39-40): `--force ... (nfl/cfbd/roster/advstats/schedule/gamelogs)` →
   `(nfl/cfbd/roster/advstats/schedule/gamelogs/teamcontext)`; `--all ... (schedule/gamelogs
   subcommands)` → `(schedule/gamelogs/teamcontext subcommands)`.
3. Smoke description (line 93): `...advstats+schedule+gamelogs for smoke` →
   `...advstats+schedule+gamelogs+teamcontext for smoke`.
4. Navigation map: line 103 dispatcher row `... / schedule / gamelogs subcommands` → `... /
   schedule / gamelogs / teamcontext subcommands`; line 124 lib/nflverse.mjs row: append
   `MIN_TEAMCONTEXT_ROWS`, `MIN_TEAMCONTEXT_SEASON`, `fetchPbpCsv` to the exports list; new rows
   after line 123 (`scripts/update-gamelogs.mjs`): `lib/teamcontext.mjs` ("pure pbp→team-context
   derivation — eraTeam remap + aggregateTeamContext; no I/O") and `scripts/update-teamcontext.mjs`
   ("pbp-derived team-context ingest — fetch gz, derive, write nflverse/teamcontext/<year>.json");
   new row after line 147: `nflverse/teamcontext/` ("pbp-derived team/game context, one JSON per
   year, TEAM-keyed (not sleeper_id); teams[abbr].games[]"); new row after line 153:
   `.github/workflows/nflverse-teamcontext.yml` ("Sunday weekly team-context refresh,
   content-hash dedup, CDN purge").
5. Invariant 5 (line 174), BOTH sentences: `nflverse roster/draft/playerids/advstats/schedule/
   gamelogs are script-produced...` → insert `/teamcontext`; `Roster/draft/playerids/advstats/
   schedule/gamelogs files are registered inProgress: false...` → insert `/teamcontext`.
6. Invariant 8-CDN (line 180): purge list `(nflverse/roster, nflverse/advstats,
   nflverse/schedule, nflverse/gamelogs)` → add `nflverse/teamcontext`.
7. Cross-repo contracts table (after the gamelogs row, line 203): new row **nflverse teamcontext
   (team-context pack)** — served shape summary (§4.2), `MIN_TEAMCONTEXT_ROWS = 60` shared
   constant, **TEAM-keyed join note** (first non-sleeper_id family; app joins via per-season
   `team`), view-only sentence ("must never feed projection/scoring/grading"), "change both
   repos together".
8. Self-maintenance (line 248): source enumeration `(nfl/cfbd/ktc/roster/draft/advstats/
   playerids/schedule/gamelogs/enrichment)` → insert `teamcontext`.

**README.md:**
9. Folder structure (after line 61, gamelogs): `teamcontext/ — pbp-derived team/game context
   (PROE, pace, RZ tendencies, defense-faced), one file per year, TEAM-keyed` + example year.
10. New File-schemas section **`nflverse/teamcontext/<year>.json`** after the schedule section
    (~line 562, before `raw/`): the §4.2 shape, §2 feature definitions in summary, the §4.3
    aggregation recipes verbatim, the era-remap note, bye-week = absent-row semantics, the
    2006 xpass boundary note, gate + inProgress + refresh paragraphs in the family-section
    house style.
11. Update-scripts subcommand block (after line 659): the three teamcontext command lines;
    dry-run list (line ~672) + `--force` list (line ~674-679): add teamcontext examples.
12. Smoke paragraph (line 693-696): add teamcontext to the dry-run enumeration (npm run smoke
    only — see §7 on CI).
13. GitHub Actions table (after line 708): `nflverse-teamcontext.yml | Sunday 13:53 UTC +
    workflow_dispatch | Runs node bin/update.mjs teamcontext (current season), commits if
    content hash changed, purges jsDelivr CDN cache`; season-keyed purge footnote (line 713):
    add teamcontext to the family list.
14. Data sources table (line ~1013-1019): new row `NFL play-by-play (team-context derivation) |
    nflverse / nflverse-data | CC-BY 4.0-style; attribution requested` (currently only nfldata
    is credited; the pbp release is nflverse-data proper).
15. `**Last updated:**` (line 7): bump.

**data-catalog.md:**
16. New family section after "nflverse per-game stats" (line 175, before Non-served artifacts):
    all standard fields — Path/subcommand/refresh (`teamcontext`; Sunday Action), Source +
    provenance (nflverse `pbp` release, derive-and-discard, raw pbp never committed), Grain
    (**team-week; TEAM-keyed — the first non-player family**), Join ids (era-accurate team abbr →
    season-totals per-season `team` / gamelogs `games[].team` / schedule teams; `gameId` →
    schedule), Coverage (2012–2025 backfill + current; **xpass/PROE upstream boundary 2006,
    moot at floor**; era remap LA/LAC/LV documented), schemaVersion 1, Sparsity gate
    (`MIN_TEAMCONTEXT_ROWS = 60`, cross-repo), Null semantics (rates null on zero denominator;
    bye = absent row; **components+rate stored, rates never summable** — §4.3 recipes),
    Consumption (banked view-only until the app loader ships; projection-engine refactor consumes
    later under its own task), Keep-rationale (cross-position context substrate; the §2.6 table's
    headline entries).
17. Reconcile one-liner (line 198): `["advstats","gamelogs","roster"]` →
    `["advstats","gamelogs","roster","teamcontext"]`; refresh the recorded output block
    (lines 204-210) when the backfill lands.

**App repo (flag only, not edited here):** `docs/signal-registry.md` needs a row for the new
source family (Self-maintenance trigger, CLAUDE.md line 248) — state in the Session-2 task summary.

---

## 7. Tests to add

**Unit (`npm test` → node --test; new file `test/teamcontext.test.mjs`, precedent
`test/update-schedule.test.mjs`):** synthetic inline pbp-CSV fixtures (a dozen rows each), exact
expected outputs hand-computed:
1. **Happy path:** 2 games, known xpass/epa/yardline values → assert every off/def component and
   rate (PROE from `(proePassPlays − proeXpassSum)/proePlays`, epaPerPlay, successRate).
2. **Basis exclusions:** a `no_play` row with `pass=1,xpass=0.6` and a `two_point_attempt=1` row
   → excluded from `plays`, PROE basis, and RZ splits.
3. **RZ trip dedup:** 3 RZ plays in one `fixed_drive` → `rzTrips=1`, `rzPlays=3`;
   `fixed_drive_result='Touchdown'` → `rzTdTrips=1`; `'Field goal'` → `rzFgTrips=1`;
   `'Opp touchdown'` → neither.
4. **Pace:** consecutive neutral snaps with gsr deltas 30/50/8 → only 30 and 8 kept (clamp
   [5,45]); a non-countable row between snaps breaks the chain; zero neutral gaps →
   `neutralSecPerPlay: null`.
5. **Era remap:** season 2013 rows with `LA`/`LAC`/`LV` → keys `STL`/`SD`/`OAK`; season 2024
   unchanged; `validateTeamContext` throws on `LA` in a 2015 output and on `STL` in a 2016 output.
6. **Pre-xpass honest null:** all xpass cells `NA` → every `proe: null`, `proePlays: 0`, all
   other features computed (the pre-2006 shape); `validateTeamContext({year: 2005})` accepts it,
   and rejects a fabricated non-null proe.
7. **Bye week:** team absent from a week's rows → no fabricated `games[]` entry.
8. **Empty/sparse:** header-only CSV → `rowCount 0`; `validateTeamContext` throws under
   `MIN_TEAMCONTEXT_ROWS`; wrong-season CSV (season column ≠ requested) → `aggregateTeamContext`
   throws; missing required header column → throws.
9. **Non-finite guard:** smuggled `Infinity` in a component → `validateTeamContext` throws
   (findNonFinite).

**Smoke (`npm run smoke`):** the §5.7 dry-run (`teamcontext --year 2023 --dry-run`) — live
fetch + derive + validate + would-write plan, no writes. Expected: "would write
nflverse/teamcontext/2023.json: 570 team-game rows, 32 teams" against the already-on-disk file →
content-identical → "no change" line on re-runs after backfill.

**PR CI (`.github/workflows/smoke-test.yml`): deliberately NOT added** — mirrors the existing
schedule omission (smoke-test.yml:37-56 runs a subset; teamcontext's unit tests run there via
`npm test`, and the full dry-run runs in `npm run smoke` locally). State this in the PR
description so the omission reads as chosen, not forgotten.

`validate:enrichment` — unaffected (no enrichment change).

---

## 8. What this slice does NOT do (scope guards)

- No raw pbp committed anywhere (derive-and-discard; the 372-col CSV never touches the repo).
- No projection/scoring/grading wiring — the projection-engine refactor consumes this pack
  LATER under its own task, app-side.
- No change to any existing served family, loader contract, or manifest shape.
- No kicking-distance features (`kick_distance`/`field_goal_result` verified 15%/2% fill —
  kick-grain, belongs to audit B4 kicker gamelogs, not team grain; only drive-outcome
  `rzFgTrips` lands here).
- No FTN/participation columns (separate DEFERred slices; different join pipeline).
- No 1999–2011 backfill (floor decision §3; widening is a follow-up constant bump).

## 9. Cross-repo impact (sleeper-dashboard — named now, NOT edited here)

1. **New Cross-repo contract row** (this repo's CLAUDE.md, §6.7) to be mirrored in the app's
   CLAUDE.md when the loader ships: served shape §4.2 + `MIN_TEAMCONTEXT_ROWS = 60` + view-only.
2. **New app loader `src/api/teamContext.js`** — `tryDataStore`/`getManifestEntry` pattern
   (nflRoster.js precedent), gating on `schemaVersion 1` and re-asserting
   `rowCount ≥ MIN_TEAMCONTEXT_ROWS`. **First TEAM-keyed loader** — its cache key is
   `(season, team)`, not `sleeper_id`; do not force it through the player-keyed loader helpers.
3. **Player→team join:** season grain via `careerStats[season][pid].team` (season-totals v3,
   era-accurate domain — the §0.3 remap exists precisely so this join is exact for STL/SD/OAK
   eras); week grain via gamelogs `players[sid].games[].team` and `opponent` →
   `teams[opponent].games` for defense-faced context; `gameId` joins teamcontext rows to
   schedule rows verbatim.
4. **View-only enforcement app-side:** must not import into `seasonProjection.js` or any
   scoring/grading path — same contract sentence as the gamelogs row. The §4.3 aggregation
   recipes travel with the contract (rates never summed).
5. `docs/signal-registry.md` (app repo) gains the family's row — flagged per Self-maintenance.

## 10. Risks / open notes for Session 2

- **Era remap is the highest-severity correctness risk** (silent wrong-team context for
  2012–2019 STL/SD/OAK if dropped) — covered by validator check §5.3.2 and unit test §7.5;
  do not skip either.
- Neutral-pace absolute level is definition-dependent (clamp + filter); it is documented as
  this pack's own metric. Do not "calibrate" it to third-party pace tables (the D3 lesson:
  never tune to force a numeric match).
- Upstream re-derivation drift (nflfastR model re-runs) is deliberately not chased —
  append-only wins; noted in §4.4.
- Sunday Action means week N context lands the following Sunday (one-week latency); acceptable
  for a weekly pack, noted so nobody "fixes" it into the Saturday gamelogs slot where the
  crosswalk-ordering comment would wrongly imply a playerids dependency.
- 2016 LA special case: 2016 Rams are `LA` in BOTH domains (schedule 2016 verified `LA`) —
  the remap boundary is `≤ 2015`, not `≤ 2016`; the boundary table in §0.3 is authoritative.
