# Task: nflverse advanced receiving stats ingest (`bin/update.mjs advstats --year YYYY`)

**Repo:** sleeper-dashboard-data
**Phase:** 1a of the nflverse advanced-stats initiative. Phase 0a already serves the
`gsis_id → sleeper_id` crosswalk at `nflverse/playerids.json` (commit `6d7827b`).
**Implementer:** sonnet. This is a planning-only opus task — **do not edit source from the opus session**.

---

## 0. Why this exists (context)

nflverse pre-aggregated weekly player stats carry season-relevant **advanced receiving** metrics —
`target_share`, `air_yards_share`, `wopr`, `racr` (initiative Bucket A). These retire the documented
Sleeper aDOT calibration defect (the app's `factors.adot` is computed from Sleeper `rec_air_yd`, which
runs ~½ industry magnitude — see the app's `docs/projection.md` §"aDOT factors (capture-only)",
"Calibration caveat", and the data-repo CLAUDE.md `rec_air_yd` contract row).

We ingest the weekly stats, **recompute correct season-level ratios** (avoiding the ratio-aggregation
trap), **re-key to `sleeper_id` server-side** using the local Phase-0a crosswalk (so the app never does
a gsis join — exactly as roster is served sleeper-keyed), and serve per-season files
`nflverse/advstats/<year>.json`. The app (Phase 1b, later) consumes them as **capture-only** `factors`
for retrospective backtesting; that is why historical backfill matters.

Mirror the **roster ingest pattern** end-to-end (`scripts/update-roster.mjs`, `lib/nflverse.mjs`
fetch/parse helpers, `lib/validate.mjs` validator, per-year files, sparsity gate, content-hash dedup,
manifest registration, weekly Action + CDN purge). Do not re-list CLAUDE.md invariants — this plan
points at them (esp. invariant 5: roster/draft/playerids `inProgress:false` deviation, which this
extends to advstats).

---

## 1. Source verification (done — live fetch 2026-06-14)

**Asset (confirmed reachable server-side; CORS-blocked in browser like all nflverse release assets):**

```
https://github.com/nflverse/nflverse-data/releases/download/player_stats/stats_player_week_<year>.csv
```

This is the asset `nflreadr::load_player_stats()` wraps. (`player_stats_<year>.csv` and the
`stats_player` tag also 200, but `player_stats/stats_player_week_<year>.csv` is the current canonical
weekly-grain file — use it.) The file follows release-asset 302 redirects; reuse the existing
`fetchRelease()` helper (returns `null` on 404/504 = year not yet published).

**Columns confirmed present (resolve by name via `header.indexOf`, never hardcode index):**

| Need | Column |
|---|---|
| join key (= gsis_id) | `player_id` |
| season / week | `season`, `week` |
| per-week team | `team` |
| position | `position` (values incl. `WR`,`TE`,`RB`,`QB`,`FB`) |
| name (debug) | `player_display_name` |
| summable components | `targets`, `receiving_air_yards`, `receiving_yards`, `receptions` |
| nflverse's weekly ratios (DO NOT aggregate — see §2 decision 1) | `target_share`, `air_yards_share`, `wopr`, `racr` |

**Empirically verified (2012 & 2023 files):**
- 2012 file: HTTP 200, all needed columns present → **backfill floor 2012 is supported** (decision 6).
- `player_id` for WR/TE rows is **100% in `00-00xxxxx` GSIS format** → joins the crosswalk directly.
- Crosswalk coverage: **349/350 (99.7%)** of 2023 WR/TE gsis ids map to a `sleeper_id`; ~0–1 unmapped
  per season (newest rookies not yet in DynastyProcess) — drop + log, exactly like roster's ~14% skip.
- Emitted WR/TE players ≈ **313–329 per season** → informs the sparsity gate (decision 7).
- Recompute sanity: CeeDee Lamb 2023 = `198 targets / 663 team targets = 0.2986` target share
  (matches his real league-leading share); `racr = 0.965`. **Only 6 WR/TE were traded in 2023 (~1.8%)** —
  the traded-player edge case (decision 2) is rare but must be handled.

---

## 2. Decisions 1–9 (each with recommendation + justification)

### Decision 1 — Season aggregation must avoid the C4 ratio-aggregation trap
**Never sum or average the weekly `target_share`/`air_yards_share`/`wopr`/`racr` columns.** Recompute
each **once at season level** from summed raw components. Formulas (explicit):

```
# Per (team, season): sum across ALL players' weekly rows for that team (every position counts
# toward team opportunity — a RB's targets are part of team targets):
teamTargets[team]   = Σ_rows(team)  targets
teamAirYards[team]  = Σ_rows(team)  receiving_air_yards

# Per player (WR/TE), accumulate components across all their weekly rows, split by the team
# they were on each week (handles trades — see decision 2):
playerTargets[team]   = Σ_player_rows(team)  targets
playerAirYards[team]  = Σ_player_rows(team)  receiving_air_yards
playerRecYards        = Σ_player_rows         receiving_yards     # team-agnostic (own ratio)
playerRecAirYards     = Σ_player_rows         receiving_air_yards # team-agnostic (own ratio)

target_share    = Σ_t (playerTargets[t]/teamTargets[t]) · playerTargets[t]  /  Σ_t playerTargets[t]
air_yards_share = Σ_t (playerAirYards[t]/teamAirYards[t]) · playerAirYards[t] / Σ_t playerAirYards[t]
wopr            = 1.5·target_share + 0.7·air_yards_share
racr            = playerRecYards / playerRecAirYards
```

Round the four ratios to **3 d.p.** (matches the app's aDOT 3-d.p. convention). **Zero/empty
denominator → `null`** (`teamTargets ≤ 0`, `teamAirYards ≤ 0`, or `playerRecAirYards ≤ 0`). If
`target_share` or `air_yards_share` is `null`, `wopr` is `null`.

### Decision 2 — Traded-player team-share (resolved + justified)
A player whose weeks split across teams: **attribute each week's targets/air-yards to the team they
were on that week** (the `team` column already encodes this), then emit the season share as the
**volume-weighted average of their per-team season shares** (formula in decision 1; weight = the
player's own targets / air-yards on each team).

- For the ~98% non-traded case this reduces exactly to `playerTargets / teamTargets`.
- Justification: a target earned in KC must be divided by KC's opportunity pool, not Denver's;
  weighting by where the player actually saw volume avoids both (a) dividing total targets by a single
  team's denominator (distorts) and (b) dividing by summed full-team seasons (crushes the share).
  Validated on 2023: Van Jefferson (ATL 28/508=.055, LA 15/589=.025) → blended `target_share = .045`,
  which correctly leans toward ATL where he played more. **Rejected alternatives:** dominant-team-only
  (drops the other team's data); split into per-team rows (breaks the one-row-per-sleeper_id served
  shape the app expects). These are capture-only diagnostics — the principled blend is sufficient.
- Emit `traded: true` + `teams: ["ATL","LA"]` (sorted by targets desc) only when the player has >1
  team; otherwise `team` is the single team. This lets the app audit/handle trades downstream.

### Decision 3 — Re-key from the local crosswalk (read from disk, not re-fetch)
Read `nflverse/playerids.json` from disk via `readJson` (it is committed by the Phase-0a Action). Build
`gsis → sleeperId` from its `ids` object (`ids[gsis].sleeperId`). For each aggregated gsis player, look
up the sleeper id; **drop rows with no mapping and log the count** (`[advstats] N players had no
crosswalk mapping — skipped`), mirroring roster's silent-skip log. The re-key is a pure exported helper
`rekeyBySleeper(byGsis, crosswalkIds)` → `{ players, unmapped }` (unit-testable — §6).

**Action-ordering implication (see decision/Action cadence below):** the advstats Action must run
**after** the Wednesday `nflverse-playerids.yml` Action so it joins against the freshest crosswalk →
schedule **Thursday**.

If the crosswalk file is **missing** on disk: in a real (non-dry) run, **throw** with a clear hint
(`run 'node bin/update.mjs playerids' first; the advstats Action runs Thursday, after the Wednesday
playerids Action`). In `--dry-run`, a missing crosswalk is **non-fatal** — log a warning and report the
aggregate-only plan (so the CI smoke dry-run stays green before the crosswalk is committed).

### Decision 4 — `inProgress: false` even for the current season
Like roster/draft/playerids, there is **no app live fallback** (Sleeper does not expose these metrics),
so the app must read from the store. Register the manifest entry `inProgress: false` even while the
current-season file mutates weekly; weekly mutability is handled by content-hash dedup + `lastModified`.
**Do not** use the `nfl/season-totals` `inProgress: true` convention. This extends CLAUDE.md invariant 5
(roster/draft/playerids) to advstats — document there (§5 Docs).

### Decision 5 — Position scope
**Emit `WR` and `TE` only** (mirrors the app's aDOT Q3 resolution: WR/TE record values; RB/QB record
`null`). RB-receiving and QB are **not emitted** (RB receiving share is meaningful but the Phase-1b
consumer mirrors aDOT's WR/TE scope; adding RB later is additive — more rows, no schema bump).
**Critical:** team denominators (`teamTargets`/`teamAirYards`) are summed across **ALL positions'**
weekly rows; only the *emitted player set* is filtered to WR/TE. The emitted-position set is a
parameter (`positions = ['WR','TE']`) so widening scope later is a one-line change.

### Decision 6 — Historical backfill floor
**2012** (aligns with `nfl/season-totals` coverage 2012–2025 and the projection cohort). Confirmed the
asset supports 2012 with all columns. Per-year files; a **`--force` past-season gate like roster/nfl**
(completed-season file requires `--force` to overwrite; current/upcoming season writes freely). The
weekly Action ingests only the current season; historical years are a one-time manual backfill (runbook §7).

### Decision 7 — Sparsity gate
`MIN_ADVSTATS_ROWS = 150`, exported from `lib/nflverse.mjs`. Observed emitted WR/TE count is ~313–329;
150 (~½) leaves headroom for sparse/early seasons yet rejects a truncated fetch. Enforced twice
(mirrors roster): a post-re-key skip in the script (treat as preliminary, log + return) and a hard
throw in `validateAdvStats` (defence-in-depth). It is the **shared contract value** re-asserted app-side.

### Decision 8 — schemaVersion
`schemaVersion: 1`, **independent** of season-totals `MAX_SUPPORTED_SCHEMA` (CLAUDE.md invariant 4 —
like roster/draft/playerids).

### Decision 9 — Demote the playerids cross-repo contract row
Phase 0a added a "nflverse playerids crosswalk" row to the **data-repo** CLAUDE.md Cross-repo contracts
table pointing at a future `src/api/playerIds.js` (Phase 0b). **That app counterpart was cut** — the
crosswalk is now consumed **only by this repo's advstats ingest** (server-side). Move that row out of
the Cross-repo contracts table into a plain internal note (§5). The new cross-repo contract is the
advstats served file. *(The app's own CLAUDE.md never added a playerids contract row — verified — so no
app-side demotion is required.)*

---

## 3. Resolved served-file shape — `nflverse/advstats/<year>.json`

Per-season files (like roster), **keyed by `sleeper_id`**. Decision on raw components: **yes, emit the
summed components alongside the four ratios** — they make the file self-auditing and let the app apply
sample-size shrinkage in backtests (analogous to the app's `adotSampleSize`).

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

- Keyed by `sleeperId` (the join the app needs — **no gsis join app-side**). `gsisId` retained per row
  for audit/back-reference. `name`/`position` are debug/validation fields.
- `team` = primary team (max targets; tie → max air yards → alpha). Add `traded: true` + `teams: [...]`
  only for multi-team players (decision 2).
- Ratios are 3-d.p. numbers or `null` (decision 1). `components` are integer/float sums.
- `rowCount` = emitted (post-re-key) player count; `unmapped` = dropped-no-crosswalk count.
- `inProgress: false`, `schemaVersion: 1` in the manifest entry (decisions 4, 8).

---

## 4. Implementation — files & step sequence

### 4.1 `lib/nflverse.mjs` (extend)
1. Constant near the others: `export const MIN_ADVSTATS_ROWS = 150;`
2. Source base near `ROSTER_BASE`/`DRAFT_BASE`/`PLAYERIDS_URL`:
   `const STATS_BASE = 'https://github.com/nflverse/nflverse-data/releases/download/player_stats';`
3. `export async function fetchPlayerStatsCsv(year)` → `return fetchRelease(\`${STATS_BASE}/stats_player_week_${year}.csv\`);`
   (returns `null` on 404/504 = year not yet published — handled like roster).
4. `export function aggregateAdvReceiving(csv, { positions = ['WR','TE'] } = {})` → `{ byGsis, season, rowCount }`:
   - Normalize CRLF/CR→LF, split, drop blanks (same as the other parsers).
   - Resolve columns by name; if `player_id` or `team` or `targets` missing → **throw** (fail-loud, format drift).
   - One pass: accumulate `teamTargets[team]`, `teamAirYards[team]` over **all** rows; accumulate per
     `(gsis, team)` player `targets`/`receiving_air_yards`, and per-gsis `receiving_yards`/`receptions`/
     `weeks`/team-target tallies; capture `name`,`position` (last seen), `season` (first parseable).
   - Second pass over gsis players whose `position ∈ positions`: compute `targetShare`,`airYardsShare`,
     `wopr`,`racr` per the decision-1 formulas (3-d.p. round; `null` on zero/empty denom); pick primary
     `team`; set `traded`/`teams` when >1 team. Build `byGsis[gsis] = { gsisId, name, position, team,
     [traded, teams,] targetShare, airYardsShare, wopr, racr, components }`.
   - `rowCount = Object.keys(byGsis).length`. (Re-key to sleeper happens in the script — needs disk crosswalk.)
5. `export function rekeyBySleeper(byGsis, crosswalkIds)` → `{ players, unmapped }` (pure; testable):
   - For each gsis, `sleeperId = crosswalkIds[gsis]?.sleeperId`; if absent → `unmapped++`, skip.
   - `players[sleeperId] = byGsis[gsis]` (the per-player object already carries `gsisId`). Keep-last on
     the rare sleeper collision (crosswalk is a bijection — Phase 0a — so effectively never).

### 4.2 `lib/validate.mjs` (add `validateAdvStats`)
Extend the existing `import { MIN_ROSTER_IDS } from './nflverse.mjs';` to also import `MIN_ADVSTATS_ROWS`.

```js
export function validateAdvStats(players, { year }) {
  const count = Object.keys(players).length;
  if (count < MIN_ADVSTATS_ROWS) {
    throw new Error(`[validate] advstats ${year}: only ${count} players — expected ≥ ${MIN_ADVSTATS_ROWS}. Possible truncated fetch.`);
  }
  // Format-drift guard: if >50% have all-null ratios, components/columns likely drifted.
  let allNull = 0;
  for (const p of Object.values(players)) {
    if (p.targetShare == null && p.airYardsShare == null && p.wopr == null && p.racr == null) allNull++;
    if (p.targetShare != null && (p.targetShare < 0 || p.targetShare > 1)) {
      throw new Error(`[validate] advstats ${year}: targetShare out of [0,1] for ${p.gsisId} (=${p.targetShare}).`);
    }
  }
  if (allNull > count * 0.5) {
    throw new Error(`[validate] advstats ${year}: ${allNull}/${count} players all-null ratios — possible component/column drift.`);
  }
}
```

### 4.3 `scripts/update-advstats.mjs` (new — model on `update-roster.mjs`)
`export async function updateAdvStats({ year: yearOpt = null, dryRun = false, force = false })`:
1. `currentSeason = await fetchCurrentNflSeason()` (from `lib/sleeper.mjs`); `year = yearOpt ?? currentSeason`; `isPast = year < currentSeason`.
2. `csv = await fetchPlayerStatsCsv(year)`; if `null` → log "year not published yet — skipping" + `return` (like roster).
3. `const { byGsis, season, rowCount: aggCount } = aggregateAdvReceiving(csv);` log aggregated count.
4. Read crosswalk: `const cw = readJson('nflverse/playerids.json');`
   - If `!cw?.ids`: if `dryRun` → warn + report aggregate-only plan + `return`; else **throw** the Action-ordering hint (decision 3).
5. `const { players, unmapped } = rekeyBySleeper(byGsis, cw.ids);` log `unmapped`.
6. Sparsity gate: `if (Object.keys(players).length < MIN_ADVSTATS_ROWS)` → log "preliminary/partial, skipping" + `return`.
7. `validateAdvStats(players, { year });` log "Validation passed".
8. Content-hash dedup: `playersHash(players)` (copy roster's sorted-key hash) vs `existing?.players`; equal → log "identical — no change" + `return`.
9. Force gate: `if (isPast && existing && !force) throw` ("use --force to overwrite completed season").
10. `if (dryRun)` → log "[dry-run] would write …" + `return`.
11. Write `nflverse/advstats/${year}.json` with the §3 envelope (`rowCount = Object.keys(players).length`, `unmapped`).
12. `updateManifestEntry({ path: \`nflverse/advstats/${year}.json\`, recordCount, inProgress: false, schemaVersion: 1 });`

### 4.4 `bin/update.mjs` (wire subcommand)
- `import { updateAdvStats } from '../scripts/update-advstats.mjs';`
- `printHelp()` SUBCOMMANDS: add `advstats --year YYYY     nflverse advanced receiving stats (WR/TE), re-keyed to sleeper_id`.
- EXAMPLES: `node bin/update.mjs advstats --year 2023` and `… --dry-run`.
- `--force` help line: append `advstats` to the "nfl/cfbd/roster" list.
- Dispatch: `case 'advstats': await updateAdvStats(opts); break;`

### 4.5 `package.json` smoke script
Append ` && node bin/update.mjs advstats --year 2023 --dry-run` to `"smoke"`.

### 4.6 `.github/workflows/nflverse-advstats.yml` (new)
Copy `weekly-nflverse-roster.yml`; adapt:
- `name: Weekly nflverse advstats`
- **Cron `"41 13 * * 4"` — Thursday 13:41 UTC.** Justification: **must run after** the Wednesday
  `nflverse-playerids.yml` (13:29) so it re-keys against the freshest crosswalk committed to `main`
  (decision 3); also after roster (Tue 13:23). nflverse player-stats land Tue/Wed post-games, so
  Thursday is fresh on both inputs. Off-hour `:41`, distinct day → no race with the other weekly committers.
- Step: `run: node bin/update.mjs advstats` (no `--year` → current season only; historical backfill is manual, §7).
- Commit: `git add nflverse/ manifest.json`; message `nflverse: advstats $(date -u +%Y-%m-%d)`.
- CDN purge: `manifest.json` and `nflverse/advstats/${YEAR}.json` (`YEAR=$(date -u +%Y)`), same `|| true` pattern.

---

## 5. Docs updates (mechanical)

No `docs/` in this repo. Edit **README.md** and **CLAUDE.md**. Where a quoted "before" can't be matched
verbatim, edit the real text to the specified end state.

### 5.1 README.md
**(a) Directory tree** — under `nflverse/`, after the `draft/` block and `playerids.json` line, add:
```
    advstats/                 — nflverse advanced receiving stats (WR/TE), one file per year, keyed by sleeper_id
      2023.json
```
**(b) New File-schemas subsection** `### nflverse/advstats/<year>.json` (insert after the
`### nflverse/playerids.json` block, before the `### raw/<name>.json` block). Content: explain it is
produced by `bin/update.mjs advstats --year YYYY` from the nflverse `player_stats` weekly asset
(`https://github.com/nflverse/nflverse-data/releases/download/player_stats/stats_player_week_<year>.csv`),
**re-keyed to `sleeper_id` server-side via `nflverse/playerids.json`**; show the §3 JSON; state the four
ratios are **recomputed at season level from summed components (never aggregated weekly)** with the
decision-1 formulas; WR/TE only (team denominators include all positions); traded players use the
volume-weighted per-team blend; zero denominators → `null`; `MIN_ADVSTATS_ROWS = 150` sparsity gate
re-asserted app-side; `inProgress: false`; weekly Thursday refresh after the playerids Action.
**(c) Subcommands block** — add `node bin/update.mjs advstats --year 2023` and a dry-run line.
**(d) Smoke prose** (~"Runs dry-run checks for nfl/cfbd/ktc/roster/draft/playerids …") → append `/advstats`.
**(e) GitHub Actions table** — add a row after `nflverse-playerids.yml`:
```
| `nflverse-advstats.yml` | Thursday 13:41 UTC + `workflow_dispatch` | Runs `node bin/update.mjs advstats` (after playerids), commits if content changed, purges jsDelivr CDN cache |
```

### 5.2 CLAUDE.md
**(a) Commands → Update CLI block** — after the `playerids` line add:
```
node bin/update.mjs advstats --year YYYY          # nflverse advanced receiving stats (WR/TE), sleeper_id-keyed
```
and append `advstats` to the `--force` comment's "nfl/cfbd only" list (→ "nfl/cfbd/roster/advstats").
**(b) Smoke & validation** comment — add `advstats` to the dry-run list.
**(c) Navigation map** — add rows:
```
| `scripts/update-advstats.mjs` | nflverse advanced receiving stats ingest — fetch weekly, recompute season ratios, re-key to sleeper_id, write `nflverse/advstats/<year>.json` |
| `nflverse/advstats/` | nflverse advanced receiving stats (WR/TE), one JSON per year, keyed by `sleeper_id` |
| `.github/workflows/nflverse-advstats.yml` | Thursday weekly advstats refresh (after playerids), content-hash dedup, CDN purge |
```
and extend the `lib/nflverse.mjs` row to add `fetchPlayerStatsCsv`/`aggregateAdvReceiving`/`rekeyBySleeper`
and `MIN_ADVSTATS_ROWS` to its export list. Update the existing `nflverse/playerids.json` nav row to note
it is **internal-only** (consumed server-side by `scripts/update-advstats.mjs`, not by the app).
**(d) Invariant 5** — extend the parenthetical that enumerates "roster/draft" `inProgress:false` to include
**playerids and advstats** (end state lists all four as the deliberate `inProgress:false` deviation).
**(e) Cross-repo contracts table** — **two edits:**
  - **Add** the advstats row (§6 Cross-repo impact for exact text).
  - **Remove** the existing "nflverse playerids crosswalk" row (decision 9) and replace it with a one-line
    note immediately under the table, e.g.:
    > *Note: `nflverse/playerids.json` (the `gsis_id → sleeper_id` crosswalk) is **internal to this repo** —
    > consumed server-side by `scripts/update-advstats.mjs` to re-key advanced stats. It is not a cross-repo
    > contract (the planned `src/api/playerIds.js` app loader was cut). `MIN_PLAYERID_ROWS` remains an
    > internal sparsity constant.*

---

## 6. Tests to add

`smoke-test.yml` runs **per-subcommand dry-runs + `npm test`** (not `npm run smoke`), so the dry-run
step must be wired into **both** places.

### 6.1 `test/nflverse.test.mjs` (extend — `node --test` style)
Imports: `aggregateAdvReceiving`, `rekeyBySleeper`, `MIN_ADVSTATS_ROWS` from `../lib/nflverse.mjs`;
`validateAdvStats` from `../lib/validate.mjs`. Add a header helper:
```js
const ADV_HEADER = 'player_id,player_display_name,position,season,week,team,targets,receiving_air_yards,receiving_yards,receptions,target_share,air_yards_share,wopr,racr';
function makeAdvCsv(...rows){ return [ADV_HEADER, ...rows].join('\n'); }
```
*(Subset header is fine — columns resolve by name. Weekly ratio columns are present but the parser must
ignore them; include junk values there to prove they're not read.)*

**Section F — `aggregateAdvReceiving`:**

| Test | Synthetic input | Expected |
|---|---|---|
| clean multi-player team — share math | Team DAL, wk1+wk2: WR-A 6+4 targets / 60+40 air, WR-B 4+6 / 40+60; (so teamTargets=20, teamAir=200; A targets=10 air=100) | `byGsis[A].targetShare === 0.5`, `airYardsShare === 0.5`, `wopr === round(1.5*.5+0.7*.5,3)=1.1`, `racr === recYards/airYards` |
| recompute ignores weekly ratio columns | put absurd values (`9.9`) in `target_share`/`wopr` columns | output ratios match recomputed values, **not** 9.9 |
| traded player blend | same `player_id`, wk1 team ATL (28 tg / team 508), wk2 team LA (15 tg / team 589) — encode via multiple WR rows to set team totals | `targetShare ≈ 0.045` (volume-weighted per decision 2); `traded === true`, `teams === ['ATL','LA']` |
| zero denominator → null | a WR whose team has 0 receiving_air_yards | `airYardsShare === null`, `wopr === null` (targetShare may be non-null) |
| racr null on zero own air yards | WR with `receiving_air_yards` summing to 0 | `racr === null` |
| position filter | include an RB row (targets) + a QB row; only WR/TE emitted, but RB targets counted in team denom | RB/QB absent from `byGsis`; a WR's `targetShare` reflects the RB targets in the denominator |
| missing `player_id`/`team` column → throws | header without `team` | `assert.throws` |

**Section G — `rekeyBySleeper`:**

| Test | Input | Expected |
|---|---|---|
| maps known gsis | `byGsis={'00-0033921':{…}}`, `crosswalkIds={'00-0033921':{sleeperId:'1234'}}` | `players['1234']` present, `unmapped===0` |
| drops unmapped gsis | one mapped + one gsis absent from crosswalk | mapped player present, `unmapped===1` |

**Section H — `validateAdvStats`:** add a `makeAdvPlayers(count)` helper (valid ratio objects):

| Test | Input | Expected |
|---|---|---|
| passes on valid | `makeAdvPlayers(MIN_ADVSTATS_ROWS)` | `assert.doesNotThrow` |
| throws below gate (truncated) | `makeAdvPlayers(10)` | `assert.throws` |
| throws when >50% all-null ratios | `MIN_ADVSTATS_ROWS` players, all ratios null | `assert.throws` |
| throws on targetShare out of range | one player `targetShare: 1.5` | `assert.throws` |

### 6.2 Smoke (CI) — wire in BOTH places
- `package.json` `smoke` script: append `&& node bin/update.mjs advstats --year 2023 --dry-run` (§4.5).
- `.github/workflows/smoke-test.yml`: add an explicit step after the KTC dry-run step:
  ```yaml
  - name: Smoke test — advstats 2023 dry-run
    run: node bin/update.mjs advstats --year 2023 --dry-run
  ```
  (The advstats dry-run tolerates a missing crosswalk — decision 3 — so this stays green pre-backfill.)

---

## 7. Runbook (first deployment — for the implementer/operator)

1. Generate the crosswalk if not yet committed: `node bin/update.mjs playerids` → commit `nflverse/playerids.json`.
2. Backfill history (completed seasons need `--force`): loop `for y in $(seq 2012 <lastCompleted>); do
   node bin/update.mjs advstats --year "$y" --force; done`; then current season `node bin/update.mjs advstats`.
3. Commit `nflverse/advstats/*.json` + `manifest.json`; the Thursday Action maintains the current season thereafter.

---

## 8. Cross-repo impact

### (a) NEW advstats served contract (precise)
- **File:** `nflverse/advstats/<year>.json`, **keyed by `sleeper_id`**, per the §3 shape — value
  `{ gsisId, name, position, team, [traded, teams,] targetShare, airYardsShare, wopr, racr, components }`.
- **Direction:** sleeper-keyed — the app does **no gsis join** (the re-key is done server-side here).
- **Sparsity constant:** `MIN_ADVSTATS_ROWS = 150`, exported from `lib/nflverse.mjs`; the app re-asserts it on `rowCount`.
- **`inProgress: false`**, `schemaVersion: 1` (independent of `MAX_SUPPORTED_SCHEMA`).
- **Phase 1b (app, `sleeper-dashboard`) will consume it as:** a new loader `src/api/advStats.js` (modeled on
  `src/api/nflRoster.js`) reading via `tryDataStore`/`getManifestEntry`, `lastModified`-driven freshness,
  per-year permanent cache, sleeper-keyed. `src/utils/seasonProjection.js` records the four metrics as
  **capture-only `factors`** (`targetShare`, `airYardsShare`, `wopr`, `racr`) for WR/TE (null elsewhere) —
  these augment/retire the calibration-defective `factors.adot` block (app `docs/projection.md` §aDOT).
  Being capture-only, they **must not move `projectedPPG`** and add no `adjustmentSummary` lines (app
  invariant "Capture-only factors do not move projectedPPG"); the app must update the **factors contract
  count** in `src/__tests__/factorsSchema.test.js` (73 vet keys → grows by the number of new keys) and any
  `statKeysContract` coverage. **This is the new cross-repo contract** — the served shape + `MIN_ADVSTATS_ROWS`
  are the contract; if either changes, update both repos. New CLAUDE.md Cross-repo contracts row (data repo):

  | Contract | This repo | App counterpart |
  |---|---|---|
  | **nflverse advstats (advanced receiving)** | `nflverse/advstats/<year>.json` keyed by `sleeper_id`; `{ gsisId, name, position, team, targetShare, airYardsShare, wopr, racr, components }` per player; WR/TE only; ratios recomputed season-level (never aggregated weekly); `inProgress:false`, `schemaVersion:1`; `MIN_ADVSTATS_ROWS = 150` shared sparsity constant; written by `bin/update.mjs advstats` | `src/api/advStats.js` reads via `tryDataStore`/`getManifestEntry` (Phase 1b); `seasonProjection.js` records `targetShare`/`airYardsShare`/`wopr`/`racr` as capture-only `factors` (WR/TE), retiring the Sleeper-aDOT calibration defect. Served shape + `MIN_ADVSTATS_ROWS` are the contract — change both repos together |

### (b) Playerids-row demotion (decision 9)
Remove the "nflverse playerids crosswalk" row from the data-repo CLAUDE.md Cross-repo contracts table and
replace with the internal-only note (§5.2e). The crosswalk is consumed only by `scripts/update-advstats.mjs`;
the planned `src/api/playerIds.js` was cut. No app-side change (the app never added a playerids contract row).

---

## 9. Done-definition (per CLAUDE.md)
1. `npm run smoke` green (now includes `advstats --year 2023 --dry-run`).
2. `npm test` green (Sections F/G/H pass).
3. After a real backfill run, `manifest.json` lists `nflverse/advstats/<year>.json` entries; spot-check a
   star WR's `targetShare` against a known value (e.g. Lamb 2023 ≈ 0.299).
4. README.md + CLAUDE.md edits (§5) applied, including the playerids demotion.
5. Task summary explicitly flags the new advstats Cross-repo contract (§8a) for the sibling repo.

**Do not** hand-edit `nflverse/advstats/*.json` — script-produced primary data (invariant 5, extended here).
