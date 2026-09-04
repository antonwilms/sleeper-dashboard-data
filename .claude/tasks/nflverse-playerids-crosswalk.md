# Task: nflverse playerids crosswalk (`bin/update.mjs playerids`)

**Repo:** sleeper-dashboard-data
**Phase:** Phase 0 of the nflverse advanced-stats initiative — the `gsis_id → sleeper_id` join key.
**Implementer:** sonnet (this is a planning-only opus task; do not edit source from the opus session).

---

## 0. Why this exists (context)

nflverse advanced stats (`stats_player_week`, NGS) are keyed by **`gsis_id`**, not `sleeper_id`.
Our served `nflverse/roster/<year>.json` drops `gsis_id` and only covers current-season actives, so
it cannot be the historical join. We need a dedicated, historical `gsis_id → sleeper_id` crosswalk
served as its own file: `nflverse/playerids.json`.

This task mirrors the **roster/draft ingest pattern** exactly. Do not invent a new pattern. See
[CLAUDE.md](../../CLAUDE.md) for the invariants (append-only, manifest-as-index, schemaVersion
discipline, never hand-edit primary data) and the Cross-repo contracts table — those are not
re-listed here; this plan points at them.

---

## 1. Source verification (done — live fetch on 2026-06-14)

**Canonical source (confirmed reachable server-side, CORS-blocked in browser like roster/draft):**

```
https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv
```

This is the file `nflreadr::load_ff_playerids()` wraps. Header (35 columns):

```
mfl_id, sportradar_id, fantasypros_id, gsis_id, pff_id, sleeper_id, nfl_id, espn_id,
yahoo_id, fleaflicker_id, cbs_id, pfr_id, cfbref_id, rotowire_id, rotoworld_id, ktc_id,
stats_id, stats_global_id, fantasy_data_id, swish_id, name, merge_name, position, team,
birthdate, age, draft_year, draft_round, draft_pick, draft_ovr, twitter_username, height,
weight, college, db_season
```

We need columns: **`gsis_id`** (idx 3), **`sleeper_id`** (idx 5), **`name`** (idx 20),
**`position`** (idx 22). Resolve by `header.indexOf(...)`, never hardcode indices.

**Population (treating the literal string `NA` as missing — same convention as the draft parser):**

| Metric | Value |
|---|---|
| Total data rows | 12,462 |
| Rows with **both** `gsis_id` AND `sleeper_id` (NA-excluded) | **6,148** |
| Distinct `gsis_id` keys among those | **6,143** |
| Distinct `sleeper_id` values among those | **6,143** |
| `gsis_id` in canonical `00-00xxxxx` format | 5,965 |
| `gsis_id` in MFL-placeholder format (e.g. `MEN516487`) | 183 |
| Duplicate `gsis_id` (→ 2 sleeper rows) | 5 — **all collapse to the same `sleeper_id`** (keep-last is lossless) |
| `sleeper_id` mapping to >1 `gsis_id` | 0 |

**Conclusions that shape the design:**
- Skip any row where `gsis_id` or `sleeper_id` is empty or `=== 'NA'` (cannot join). This yields ~6,148 rows.
- The 5 duplicate `gsis_id`s are historical name-collision artifacts in the source; in every case both
  rows carry the **same `sleeper_id`**, so **keep-last drops no information**. No special handling beyond keep-last.
- The 183 MFL-placeholder `gsis_id`s are rookies/college players without a real GSIS id yet. They are
  harmless dead keys (no advanced-stat row will ever carry them). **Do not regex-filter them out** —
  a format filter is fragile and couples us to nflverse id formatting. The parser's only gate is
  "both ids present and not NA".
- The map is a clean **bijection** (gsis↔sleeper both unique after dedup) → the app can invert it
  losslessly for a reverse lookup. **This is the basis for not serving a reverse index** (§3).

No `timestamp.json` sidecar exists for this source (unlike `draft_picks`). The CSV carries a
`db_season` column (all `2026` in the current file); capture its modal value as a best-effort
`sourceSeason` staleness field. Do **not** invent a `sourceLastUpdated`.

---

## 2. Reverse-index decision (recommendation + justification)

**Recommendation: serve the forward map only (`gsis_id → {sleeperId,...}`). Do NOT serve a reverse
`sleeper_id → gsis_id` index. Reverse lookup is the app's concern, built by inverting the forward map.**

Justification:
1. **The primary join is forward.** The Phase-0 consumer iterates advanced-stat rows (each keyed by
   `gsis_id`) and resolves each to a `sleeper_id`. That is exactly `ids[row.gsis_id].sleeperId`.
2. **The inversion is lossless and trivial.** §1 proves `sleeper_id` is unique among emitted rows, so
   `Object.fromEntries(Object.entries(ids).map(([g,v]) => [v.sleeperId, g]))` is a complete, collision-free
   reverse map. The app builds it once at load and memoizes it — O(n) over ~6k rows, negligible.
3. **Serving both doubles the bytes and creates a consistency/validation burden** (two structures to
   keep in sync, two things to hash/validate) for zero information gain.

State this explicitly in the served-file README section and in the app's `playerIds.js` so the app
author knows the reverse map is theirs to derive.

---

## 3. Resolved served-file shape — `nflverse/playerids.json`

Single combined file (not year-partitioned — like `draft/draft_picks.json`, unlike `roster/<year>.json`).

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

- **Keyed by `gsis_id`.** Value is `{ sleeperId, name, position }`.
  - `sleeperId` is the join payload (the field the app actually needs).
  - `name`, `position` are **debug/validation-only** sanity fields (mirrors the brief's "minimal sanity fields").
- **Field naming note (deliberate):** value uses `name`/`position` to mirror the source columns, not
  roster's `fullName`. These are debug-only; the divergence is intentional and documented. The join
  payload field is `sleeperId` (camelCase, consistent with roster's `fullName`).
- `rowCount` = `Object.keys(ids).length` (distinct gsis keys after keep-last dedup ≈ 6,143).
- `sourceSeason` = modal `db_season` from the CSV (best-effort staleness aid; `null` if column absent).
- `schemaVersion: 1`, **independent** of season-totals `MAX_SUPPORTED_SCHEMA` (like roster/draft — invariant 4).
- Manifest entry written with **`inProgress: false`** — the app has no live fallback to reconstruct a
  gsis↔sleeper crosswalk; it must read it from the store (same rationale as roster/draft, invariant 5).
- **No `last-checked-playerids.json` marker.** Mirror the *draft* pattern (single combined file, no
  marker), not the roster pattern. The GitHub Action run history already answers "did it run?";
  a marker file would add churn for a single-file ingest. Deliberate choice.

---

## 4. Sparsity gate — `MIN_PLAYERID_ROWS`

```js
// lib/nflverse.mjs — shared cross-repo constant
export const MIN_PLAYERID_ROWS = 5000;
```

- Observed distinct-key count is ~6,143. `5000` is ~81% of that — comfortable headroom for natural
  source shrinkage/cleanup, yet high enough that a truncated/partial fetch (a few hundred rows) fails
  loudly rather than shipping a gutted crosswalk.
- Re-asserted **app-side** in Phase 0b (`src/api/playerIds.js`) on the served `rowCount`. **If either
  side changes this constant, change both** — it is the shared contract value (analogous to `MIN_ROSTER_IDS`).
- Enforced in two places here, mirroring roster: (a) a `rowCount < MIN_PLAYERID_ROWS` skip in
  `scripts/update-playerids.mjs` (treat as preliminary/partial, log + return, no write), and
  (b) a hard throw in `validatePlayerIds` (defence-in-depth — should never fire after the skip gate).

---

## 5. Implementation — files & step sequence

### 5.1 `lib/nflverse.mjs` (add to existing file)

1. Add shared constant near `MIN_ROSTER_IDS` / `MIN_DRAFT_YEAR`:
   ```js
   /** Minimum gsis↔sleeper crosswalk rows required for playerids.json to ship. */
   export const MIN_PLAYERID_ROWS = 5000;
   ```
2. Add source URL near the `ROSTER_BASE` / `DRAFT_BASE` block:
   ```js
   const PLAYERIDS_URL = 'https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv';
   ```
3. Add `fetchPlayerIdsCsv()` — reuse the existing `fetchRelease(url)` helper (returns `null` on
   404/504; the script throws on `null` because this file should always exist, exactly like
   `fetchDraftCsv` + `update-draft`):
   ```js
   export async function fetchPlayerIdsCsv() {
     return fetchRelease(PLAYERIDS_URL);
   }
   ```
4. Add `parsePlayerIdsCsv(csv)` — same skeleton as `parseRosterCsv`:
   - Normalize CRLF/CR → LF, split, drop blank lines.
   - `header = splitCsvLine(lines[0])`; resolve `iGsis = header.indexOf('gsis_id')`,
     `iSleeper = header.indexOf('sleeper_id')`, `iName = header.indexOf('name')`,
     `iPos = header.indexOf('position')`, `iSeason = header.indexOf('db_season')`.
   - If `iGsis === -1 || iSleeper === -1` → **throw** (fail-loud; upstream format change — red CI),
     mirroring `parseRosterCsv`'s required-column guard.
   - Per row: `gsis = fields[iGsis]?.trim()`, `sleeperId = fields[iSleeper]?.trim()`.
     **Skip** if `!gsis || gsis === 'NA' || !sleeperId || sleeperId === 'NA'` (the literal-`NA`
     handling matches the draft parser).
   - Keep-last on duplicate `gsis`:
     `ids[gsis] = { sleeperId, name: fields[iName]?.trim() || null, position: fields[iPos]?.trim() || null }`.
   - Capture `sourceSeason` from the first row with a parseable `db_season` (or modal — first-row is fine; document).
   - Return `{ ids, rowCount: Object.keys(ids).length, sourceSeason }`.

### 5.2 `lib/validate.mjs` (add `validatePlayerIds`)

Add after `validateDraft`, and extend the existing `import { MIN_ROSTER_IDS } from './nflverse.mjs';`
line to also import `MIN_PLAYERID_ROWS`:

```js
export function validatePlayerIds(ids) {
  const count = Object.keys(ids).length;
  if (count < MIN_PLAYERID_ROWS) {
    throw new Error(
      `[validate] playerids: only ${count} crosswalk rows — ` +
      `expected ≥ ${MIN_PLAYERID_ROWS}. Possible truncated/partial source.`
    );
  }
  // Every emitted entry must carry a sleeperId (parser guarantees it; this catches parser regressions).
  let missingSleeper = 0, missingName = 0;
  for (const v of Object.values(ids)) {
    if (!v.sleeperId) missingSleeper++;
    if (!v.name)      missingName++;
  }
  if (missingSleeper > 0) {
    throw new Error(`[validate] playerids: ${missingSleeper}/${count} rows missing sleeperId — parser regression.`);
  }
  // Format-drift guard (mirrors roster's >50% missing-status guard).
  if (missingName > count * 0.5) {
    throw new Error(
      `[validate] playerids: ${missingName}/${count} rows missing name — possible upstream CSV format change.`
    );
  }
}
```

### 5.3 `scripts/update-playerids.mjs` (new — model on `update-draft.mjs`)

Single-file ingest, so follow the **draft** writer's structure (no year arg, no `--force` past-season
gate, no last-checked marker). Steps:

1. `console.log('[playerids] Fetching db_playerids.csv…')`; `const csv = await fetchPlayerIdsCsv();`
2. If `csv === null` → **throw** (`db_playerids.csv` should always be published; 404/504 is unexpected —
   point at the source URL in the message), exactly like `update-draft`.
3. `const { ids, rowCount, sourceSeason } = parsePlayerIdsCsv(csv);`
   `console.log('[playerids] Parsed N crosswalk rows')`.
4. **Sparsity gate:** if `rowCount < MIN_PLAYERID_ROWS` → log "treating as preliminary/partial, skipping" and `return`.
5. `validatePlayerIds(ids)` → `console.log('[playerids] Validation passed')`.
6. **Content-hash dedup:** `idsHash(ids)` = SHA-256 of `JSON.stringify` over **sorted keys** (copy
   `playersHash` from `update-roster.mjs` — sort keys for stable hash). Compare to
   `existing?.ids ? idsHash(existing.ids) : null`. If equal → log "Content identical — no change" and `return`.
7. **Dry-run exit:** if `dryRun` → log "[dry-run] would write …" and `return`.
8. **Write** `nflverse/playerids.json` via `writeJsonStable` with the §3 envelope.
9. **Manifest:** `updateManifestEntry({ path: 'nflverse/playerids.json', recordCount: rowCount, inProgress: false, schemaVersion: 1 })`.

Accept `{ dryRun = false, force = false } = {}` for API consistency (`force` unused, like draft).

### 5.4 `bin/update.mjs` (wire the subcommand)

1. Add import: `import { updatePlayerIds } from '../scripts/update-playerids.mjs';`
2. Add to `printHelp()` SUBCOMMANDS block, after the `draft` line:
   ```
   playerids                   Fetch nflverse gsis_id→sleeper_id crosswalk (DynastyProcess)
   ```
3. Add an EXAMPLES line: `node bin/update.mjs playerids` and `node bin/update.mjs playerids --dry-run`.
4. Add the dispatch case:
   ```js
   case 'playerids':
     await updatePlayerIds(opts);
     break;
   ```

### 5.5 `package.json` smoke script

Append ` && node bin/update.mjs playerids --dry-run` to the existing `"smoke"` script value
(after the `draft --dry-run` term).

### 5.6 `.github/workflows/nflverse-playerids.yml` (new)

Copy `weekly-nflverse-roster.yml` and adapt:
- `name: Weekly nflverse playerids`
- **Cron: `"29 13 * * 3"` — Wednesday 13:29 UTC.** Justification: advanced stats publish weekly
  in-season; a newly-active player's `gsis_id↔sleeper_id` mapping must enter the crosswalk within a
  week or the advanced-stat join silently drops them. Weekly cadence keeps pace; content-hash dedup
  makes no-change weeks a zero-cost no-op commit. Staggered onto **Wednesday** (off-hour `:29`) so it
  never races KTC (Mon 13:17) or roster (Tue 13:23) on the push to `main`.
- Step: `run: node bin/update.mjs playerids`
- Commit step: `git add nflverse/ manifest.json`; commit message `nflverse: playerids $(date -u +%Y-%m-%d)`.
- CDN purge: purge `manifest.json` and `nflverse/playerids.json` (no `${YEAR}` interpolation — single
  fixed path):
  ```
  curl -sf "https://purge.jsdelivr.net/gh/${{ github.repository_owner }}/sleeper-dashboard-data@main/manifest.json" || true
  curl -sf "https://purge.jsdelivr.net/gh/${{ github.repository_owner }}/sleeper-dashboard-data@main/nflverse/playerids.json" || true
  ```

---

## 6. Tests to add

### 6.1 `test/nflverse.test.mjs` (extend existing file — `node --test` style)

Add imports: `parsePlayerIdsCsv`, `MIN_PLAYERID_ROWS` from `../lib/nflverse.mjs`; `validatePlayerIds`
from `../lib/validate.mjs`. Add a `PLAYERIDS_HEADER` fixture helper:

```js
const PLAYERIDS_HEADER =
  'mfl_id,gsis_id,sleeper_id,name,position,db_season';
function makePlayerIdsCsv(...rows) { return [PLAYERIDS_HEADER, ...rows].join('\n'); }
```
*(A minimal header subset is fine — the parser resolves columns by name via `indexOf`, so only the
referenced columns need to exist. If you prefer realism, use the full 35-column header.)*

**Section D — `parsePlayerIdsCsv`:**

| Test | Synthetic input | Expected |
|---|---|---|
| happy path — keyed by gsis_id | two clean rows (`00-0034796`/`4984`/Josh Allen/QB, `00-0033873`/`6794`/Justin Jefferson/WR) | `rowCount === 2`; `ids['00-0034796']` deep-equals `{ sleeperId:'4984', name:'Josh Allen', position:'QB' }` |
| row missing gsis_id skipped | one good row + one with empty gsis | `rowCount === 1`, only the good key present |
| row with `NA` gsis_id skipped | one good row + one with `NA` in gsis col | `rowCount === 1` |
| row missing/`NA` sleeper_id skipped | one good row + one with `NA` sleeper | `rowCount === 1` |
| keep-last on duplicate gsis_id | two rows, same gsis, different sleeper | `rowCount === 1`; value is the **last** row's sleeperId |
| missing `gsis_id` column → throws | header without `gsis_id` | `assert.throws(...)` |
| missing `sleeper_id` column → throws | header without `sleeper_id` | `assert.throws(...)` |
| CRLF line endings handled | header+row joined with `\r\n` | `rowCount === 1` |
| quoted name with comma preserved | `..."Smith, Jr."...` | name === `'Smith, Jr.'` |

**Section E — `validatePlayerIds`:** add a `makeIds(count)` helper (generates `count` entries with
synthetic gsis keys + valid `{sleeperId,name,position}`):

| Test | Input | Expected |
|---|---|---|
| passes on valid input | `makeIds(MIN_PLAYERID_ROWS)` | `assert.doesNotThrow` |
| throws below gate (truncated source) | `makeIds(100)` | `assert.throws` |
| throws when an entry lacks sleeperId | `MIN_PLAYERID_ROWS` entries, one with `sleeperId: ''` | `assert.throws` |
| throws when >50% missing name | `MIN_PLAYERID_ROWS` entries, all `name: null` | `assert.throws` |

### 6.2 Smoke (CI)

- `package.json` `smoke` script gains `playerids --dry-run` (§5.5) — picked up by `npm run smoke`
  and the `smoke-test.yml` workflow's `npm run smoke` path. **Also add an explicit step** to
  `.github/workflows/smoke-test.yml` after the KTC dry-run step, for parity with the other ingests:
  ```yaml
  - name: Smoke test — playerids dry-run
    run: node bin/update.mjs playerids --dry-run
  ```
  *(Note: the current `smoke-test.yml` runs `npm test` + individual nfl/cfbd/ktc dry-runs and does
  not yet list roster/draft as discrete steps even though `npm run smoke` covers them. Adding the
  explicit playerids step is optional but recommended; the `npm run smoke` path is the load-bearing one.)*

---

## 7. Docs updates (mechanical)

No `docs/` in this repo. Edit **README.md** and **CLAUDE.md** as below. Where a quoted "before"
can't be matched verbatim, edit the real text to the specified end state.

### 7.1 README.md

**(a) Directory tree (lines ~48–52).** Before:
```
  nflverse/
    roster/                   — nflverse season rosters (sleeper_id join), one file per year
      2025.json
    draft/                    — nflverse combined draft picks (all years in one file)
      draft_picks.json
```
After — add a `playerids.json` line under `nflverse/`:
```
  nflverse/
    roster/                   — nflverse season rosters (sleeper_id join), one file per year
      2025.json
    draft/                    — nflverse combined draft picks (all years in one file)
      draft_picks.json
    playerids.json            — gsis_id→sleeper_id crosswalk (DynastyProcess), all players historically
```

**(b) New "File schemas" section.** Insert a new `### nflverse/playerids.json` subsection
immediately after the `### nflverse/draft/draft_picks.json` block (after its "Yearly refresh" line,
before the `---` that precedes `### raw/<name>.json`). Content:

> Historical `gsis_id → sleeper_id` crosswalk produced by `bin/update.mjs playerids`, sourced from
> DynastyProcess's `db_playerids.csv` (`https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv`,
> the file `nflreadr::load_ff_playerids()` wraps). CORS-blocked in the browser; ingested server-side
> and served via jsDelivr. This is the Phase-0 join key: nflverse advanced stats (`stats_player_week`,
> NGS) are keyed by `gsis_id`, which roster files do not carry.
>
> ```json
> {
>   "schemaVersion": 1,
>   "generatedAt": "2026-06-14T12:00:00.000Z",
>   "sourceSeason": 2026,
>   "rowCount": 6143,
>   "ids": {
>     "00-0034796": { "sleeperId": "4984", "name": "Josh Allen", "position": "QB" }
>   }
> }
> ```
>
> `ids` is keyed by **`gsis_id`**; the value carries `sleeperId` (the join payload) plus `name`/`position`
> (debug/validation only). Rows where either id is empty or `NA` in the source are skipped (cannot join).
> Duplicate `gsis_id`s use keep-last (confirmed lossless — colliding rows share the same `sleeperId`).
>
> **Forward map only.** The map is a bijection (`gsis_id` and `sleeper_id` each unique), so the app
> derives any reverse `sleeper_id → gsis_id` lookup by inverting `ids` in-memory. No reverse index is served.
>
> **Sparsity gate (`MIN_PLAYERID_ROWS = 5000`):** the ingest refuses to write if fewer than 5000
> crosswalk rows parse; the app re-asserts the same gate on `rowCount`. If either side changes this
> constant, change both.
>
> **`inProgress: false`:** like roster/draft, the app has no live fallback — it must read the crosswalk
> from the store. Content-hash dedup means no commit when unchanged.
>
> **Weekly refresh:** the `nflverse-playerids.yml` GitHub Action runs every Wednesday and re-ingests
> the crosswalk so newly-active players become joinable within a week.

**(c) Subcommands block (~lines 393–399).** After the draft fetch lines, add:
```bash
# Fetch the gsis_id→sleeper_id crosswalk (DynastyProcess db_playerids)
node bin/update.mjs playerids
```
And in the dry-run group (~lines 400–405) add: `node bin/update.mjs playerids --dry-run`.

**(d) Smoke test prose (~line 426).** Before: "Runs dry-run checks for nfl/cfbd/ktc/roster/draft …".
After: "Runs dry-run checks for nfl/cfbd/ktc/roster/draft/playerids …".

**(e) GitHub Actions table (~lines 430–434).** Add a row after the `nflverse-draft.yml` row:
```
| `nflverse-playerids.yml` | Wednesday 13:29 UTC + `workflow_dispatch` | Runs `node bin/update.mjs playerids`, commits if content hash changed, purges jsDelivr CDN cache |
```

### 7.2 CLAUDE.md

**(a) Commands → Update CLI block.** After the `draft` line, add:
```
node bin/update.mjs playerids                     # gsis_id→sleeper_id crosswalk (DynastyProcess)
```

**(b) Smoke & validation block.** Update the `npm run smoke` comment to include `playerids` in the
dry-run list (end state: "dry-run nfl+cfbd+ktc+roster+draft+playerids for smoke").

**(c) Navigation map table.** Add two rows:
```
| `scripts/update-playerids.mjs` | nflverse gsis↔sleeper crosswalk ingest — fetch, parse, dedup, write `nflverse/playerids.json` |
| `.github/workflows/nflverse-playerids.yml` | Wednesday weekly gsis↔sleeper crosswalk refresh, content-hash dedup, CDN purge |
```
And update the existing `lib/nflverse.mjs` row to list the new exports. End state for that row:
```
| `lib/nflverse.mjs` | nflverse fetch + CSV-parse helpers: `fetchRosterCsv`/`parseRosterCsv`, `fetchDraftCsv`/`parseDraftCsv`, `fetchDraftTimestamp`, `fetchPlayerIdsCsv`/`parsePlayerIdsCsv`; exports `MIN_ROSTER_IDS`, `MIN_DRAFT_YEAR`, `MIN_PLAYERID_ROWS` |
```
Also add a `nflverse/playerids.json` row to the data-folder portion of the table:
```
| `nflverse/playerids.json` | nflverse gsis_id→sleeper_id crosswalk (DynastyProcess), all players |
```

**(d) Cross-repo contracts table.** Add the new row (see §8 for the exact contract text).

---

## 8. Cross-repo impact (the new contract — precise)

This repo cannot edit the app. Call this out in the task summary so `sleeper-dashboard` is updated to match.

**The served contract:**
- **File:** `nflverse/playerids.json`, shape per §3 — `{ schemaVersion:1, generatedAt, sourceSeason,
  rowCount, ids: { [gsis_id]: { sleeperId, name, position } } }`.
- **Constant:** `MIN_PLAYERID_ROWS = 5000`, exported from `lib/nflverse.mjs`. The app must hold the
  same value and re-assert it on `rowCount` at read time.
- **Direction:** forward (`gsis_id → sleeperId`). The app derives the reverse map by inversion (lossless — §2).
- **`inProgress: false`** in the manifest entry — the app reads it unconditionally (no live fallback).

**App Phase-0b loader — `src/api/playerIds.js` (to be written by the app author):**
- Fetch `nflverse/playerids.json` via the same `tryDataStore` / `getManifestEntry` path that
  `src/api/nflRoster.js` and `src/api/nflDraft.js` use (Part 2 pattern).
- Re-assert `MIN_PLAYERID_ROWS` on the served `rowCount`; treat a sub-gate file as absent.
- Expose the forward map (`gsis → sleeperId`) and a memoized inverted map (`sleeperId → gsis`) built
  once from `ids`. Document that the reverse map is derived app-side, not served.
- Mirror `MIN_PLAYERID_ROWS` as a constant in the app (the shared contract value).

**Both CLAUDE.md Cross-repo contracts tables (this repo + the app's) get a new row:**

| Contract | This repo | App counterpart |
|---|---|---|
| **nflverse playerids crosswalk** | `nflverse/playerids.json` (keyed by `gsis_id`; `{ sleeperId, name, position }` per row; `inProgress:false`, `schemaVersion:1`; forward map only) written by `bin/update.mjs playerids`; `MIN_PLAYERID_ROWS = 5000` is the shared sparsity constant | `src/api/playerIds.js` reads it via `tryDataStore`/`getManifestEntry` (Phase 0b), re-asserts `MIN_PLAYERID_ROWS`, and inverts `ids` in-memory for reverse lookups. The served shape + `MIN_PLAYERID_ROWS` are the contract — if either changes, update both repos |

---

## 9. Done-definition (per CLAUDE.md)

1. `npm run smoke` green (now includes `playerids --dry-run`).
2. `npm test` green (new Section D/E tests pass).
3. `manifest.json` shows the `nflverse/playerids.json` entry after a real (non-dry) run.
4. README.md + CLAUDE.md edits from §7 applied.
5. Task summary explicitly flags the new Cross-repo contract (§8) for the sibling repo.

**Do not** hand-edit `nflverse/playerids.json` — it is script-produced primary data (invariant 5).
