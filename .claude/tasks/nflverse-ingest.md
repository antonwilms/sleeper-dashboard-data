# Task: nflverse ingest — serve rosters + draft picks via the data store

nflverse moved its datasets to **GitHub release assets**, which are CORS-blocked
in the browser (302 → `release-assets.githubusercontent.com`, signed URL, no
`Access-Control-Allow-Origin`) and which jsDelivr does **not** proxy. Two app
loaders broke:

- `src/api/nflRoster.js` — fetches the release URL directly → CORS-blocked →
  inert (`rosterYear=null`, relevance filter always `'unknown'`).
- `src/api/nflDraft.js` — points at the dead `@master` jsDelivr path
  (`…/nflverse-data@master/data/draft_picks/draft_picks.csv`, which no longer
  serves data) → silently fails → rookie draft-slot multiplier defaults to `1.0`
  for everyone.

**Fix:** ingest the nflverse CSVs server-side in this repo (Node `fetch`, no
CORS), normalize to JSON, serve via jsDelivr, and repoint the app loaders at the
data store. **Only the data SOURCE changes** — the `sleeper_id` join,
`nflDraftMatch`, per-year IndexedDB cache, `MIN_ROSTER_IDS` gate, the
season-probe, and graceful degradation all stay.

This is the **plan only**. Implementation is two independently-shippable parts;
**data repo (Part 1) first**, app (Part 2) second. **Do not edit source while
planning.**

---

## Pre-flight findings (probed live + verified against both repos)

| Item | Finding | Consequence |
|---|---|---|
| **Roster release URL** | `https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_<year>.csv` (e.g. `roster_2024.csv`). Confirmed 302 → `release-assets.githubusercontent.com` signed URL, **no ACAO** → browser-blocked, Node-OK. | Data repo fetches it server-side; app never touches it. |
| **Roster columns** | `season, team, position, depth_chart_position, jersey_number, status, full_name, …, sleeper_id (col 22), years_exp, …`. **`sleeper_id` present** → direct join. | Emit one record per `sleeper_id`. |
| **Roster row multiplicity** | `roster_<year>.csv` (the season `rosters` release, not `weekly_rosters`) has **exactly one row per `sleeper_id`** (verified 2024: 2076 distinct ids, 0 duplicates). | No dedup needed; if a future file regresses, keep-last is the safe rule. |
| **Roster coverage** | ~86% of skill rows carry a `sleeper_id`; `roster_2025` ≈ 2141 id-bearing rows; preliminary offseason files are sparse / 504. | Keep the `MIN_ROSTER_IDS` sparsity gate (shared constant — see contract). |
| **Draft release URL** | `https://github.com/nflverse/nflverse-data/releases/download/draft_picks/draft_picks.csv` — single combined multi-year file. Plus `timestamp.json` (`{"last_updated":"2026-05-05 03:26:29 EDT"}`) for source freshness. | One ingest → one JSON file. |
| **Draft columns** | `season, round, pick, team, gsis_id, pfr_player_id, cfb_player_id, pfr_player_name (col 8), position, college, age, …`. **Note:** there is **no `cfb_player_name`** column (the app's current parser references it as a fallback; `iFallbk = -1`, so it already silently falls back to `pfr_player_name`). | Emit the `DraftPick` shape from `pfr_player_name`; drop the nonexistent `cfb_player_name` reference. |
| **App `tryDataStore` gate** | `src/api/dataStore.js`: returns `null` when the manifest entry is **`inProgress: true`**, or `schemaVersion > MAX_SUPPORTED_SCHEMA (2)`, or shape `validate` fails. Manifest cached `MANIFEST_TTL = 60` min. | Roster/draft entries **must be registered `inProgress: false`** to be served — see "inProgress deviation" below. |
| **App freshness** | Roster + draft are cached per-year with **permanent TTL (999999)**. Nothing currently re-fetches on update. | Add **`lastModified`-driven invalidation** (compare cached vs manifest entry) so the weekly roster refresh is picked up. |
| **Existing app tests** | `src/api/nflRoster.test.js` and `src/api/nflDraft.test.js` mock `global.fetch` + `../utils/cache` and exercise `parseRosterCsv`/`parseDraftCsv` + the loaders against raw nflverse URLs. `nflDraftMatch.test.js`, `relevance.test.js`, `dataStore.test.js` exist and are **unaffected** (consume unchanged shapes). | The two loader tests are rewritten to mock `../api/dataStore`; the CSV-parse tests **move to the data repo**. |
| **Data-repo patterns** | `bin/update.mjs` dispatcher → `scripts/update-*.mjs`; fetch helpers in `lib/*.mjs`; IO via `lib/io.mjs`; manifest via `lib/manifest.mjs`; validators in `lib/validate.mjs`; content-hash dedup + last-checked marker + fail-loud guard in `scripts/update-ktc.mjs`; weekly refresh Action `weekly-ktc.yml` (porcelain check → commit only on change). | Mirror exactly. |
| **Node** | `engines.node >= 20`, native fetch. | No new deps. |

---

## Cross-repo contract (the seam between Part 1 and Part 2)

Both parts must agree on these. Treat the JSON shapes + paths as a public API
(CLAUDE.md "Manifest contract" rules apply).

### New data-store files + manifest folders

| Manifest path | Produced by (Part 1) | Consumed by (Part 2) | inProgress | schemaVersion | recordCount |
|---|---|---|---|---|---|
| `nflverse/roster/<year>.json` | `bin/update.mjs roster --year <year>` | `src/api/nflRoster.js` | **`false`** (always) | 1 | id-bearing player count |
| `nflverse/draft/draft_picks.json` | `bin/update.mjs draft` | `src/api/nflDraft.js` | **`false`** | 1 | total pick count |

### Served JSON shapes

**`nflverse/roster/<year>.json`** — status filtering stays app-side, so emit raw
status (not a pre-filtered active set):
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
`players` is keyed by `sleeper_id`; each value mirrors the app's existing
`byId[*]` shape `{ team, position, status, fullName }` exactly. `rowCount` =
`Object.keys(players).length`.

**`nflverse/draft/draft_picks.json`** — `picksByYear` mirrors the exact object
`matchNflDraftToSleeper` consumes (`{ [year]: DraftPick[] }`):
```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-06-08T12:00:00.000Z",
  "sourceLastUpdated": "2026-05-05 03:26:29 EDT",
  "count": 3421,
  "picksByYear": {
    "2024": [
      { "year": 2024, "round": 1, "pick": 1, "team": "CHI",
        "fullName": "Caleb Williams", "position": "QB", "college": "USC", "age": 22 }
    ]
  }
}
```
`DraftPick = { year, round, pick, team, fullName, position, college, age|null }`.

### Shared constants / semantics

- **`MIN_ROSTER_IDS = 1500`** — the sparsity floor. The data repo refuses to
  write a roster file below it (preliminary/offseason); the app re-asserts it on
  `rowCount` as defence-in-depth. If either side changes it, change both.
- **inProgress deviation (call this out loudly):** unlike `nfl/season-totals`
  (where `inProgress: true` means "don't serve, fetch live from Sleeper"), the
  current-season roster has **no live app fallback** — the app must get it from
  the store. So roster/draft files are registered **`inProgress: false` even
  while the current-season file still mutates weekly.** Weekly mutability is
  handled by content-hash dedup (Part 1) + `lastModified` invalidation (Part 2),
  **not** by `inProgress`. Document this in both repos' manifest notes.

---

# PART 1 — Data repo (`sleeper-dashboard-data`)

## Architecture (mirrors existing ingest layers)

```
bin/update.mjs                         ← add 'roster' + 'draft' subcommands to the dispatcher
  ├─ scripts/update-roster.mjs  → updateRoster({ year, dryRun, force })
  └─ scripts/update-draft.mjs   → updateDraft({ dryRun, force })
lib/nflverse.mjs                       ← NEW: fetch + CSV-parse helpers (Node; mirrors app parsers, zero shared code)
  ├─ fetchRosterCsv(year) / parseRosterCsv(csv) → { season, players, rowCount }
  ├─ fetchDraftCsv() / parseDraftCsv(csv)       → { picksByYear, count }
  └─ fetchDraftTimestamp()                       → string|null
lib/validate.mjs                       ← add validateRoster(players,{year}) + validateDraft(picksByYear)
lib/io.mjs / lib/manifest.mjs          ← reuse as-is (readJson/writeJsonStable/listDir; updateManifestEntry)
nflverse/roster/<year>.json            ← NEW output folder
nflverse/draft/draft_picks.json        ← NEW output folder
nflverse/last-checked-roster.json      ← dedup marker (mirrors ktc/last-checked.json)
```

CSV parsing lives in `lib/nflverse.mjs` (server-side). Mirror the app's
`splitCsvLine` quote-aware splitter (a few lines; keep zero shared code across
repos, exactly as `lib/sleeper.mjs` mirrors the app's aggregation).

## Output shapes

As in the Cross-repo contract above. `parseRosterCsv` builds `players` keyed by
`sleeper_id` (skip rows with empty `sleeper_id`; keep `{team, position, status,
fullName}`; `rowCount` counts kept rows). `parseDraftCsv` filters to
`season >= MIN_DRAFT_YEAR` (default **2010** — a generous superset of the app's
`DRAFT_YEARS` so the app can widen its window without re-ingest), normalizes each
pick to `DraftPick`, groups by year.

## Subcommand logic

### `roster` (mirror `update-ktc.mjs` dedup + fail-loud)
1. `year = opts.year ?? await fetchCurrentNflSeason()` (reuse `lib/sleeper.mjs`).
2. Fetch `roster_<year>.csv`. On **404/504** (upcoming file unpublished in
   offseason): log `[roster] year=<year> not published yet — skipping` and
   **exit 0** (no write). The app probe falls back to `year-1`.
3. Parse → `{ season, players, rowCount }`.
4. **Fail-loud guard:** if the CSV was fetched but `sleeper_id`/`status` columns
   are missing → `throw` (format change, red CI). If `rowCount < MIN_ROSTER_IDS`
   → treat as preliminary: log + **exit 0 without writing** (keeps the store
   clean; app falls back).
5. `validateRoster(players, { year })` (throws on failure).
6. **Content-hash dedup** vs existing `nflverse/roster/<year>.json` (hash the
   sorted `players`). Identical → write `nflverse/last-checked-roster.json`
   marker only, no data write, no manifest touch (→ no CI commit). Changed →
   continue.
7. `--dry-run`: print plan, exit.
8. Write `nflverse/roster/<year>.json`; `updateManifestEntry({ path,
   recordCount: rowCount, inProgress: false, schemaVersion: 1 })`.
   - **`--force`** only needed to overwrite a **past** (completed) season file;
     current/upcoming season writes freely (it's the mutable one). Determine
     "past" as `year < fetchCurrentNflSeason()` and gate like `update-nfl.mjs`.

### `draft` (mirror dedup; no year)
1. Fetch `draft_picks.csv` + `timestamp.json` (`sourceLastUpdated`).
2. Parse → `{ picksByYear, count }` (≥ `MIN_DRAFT_YEAR`).
3. `validateDraft(picksByYear)` (throws if 0 picks or required fields absent).
4. Content-hash dedup vs existing `nflverse/draft/draft_picks.json` (hash
   `picksByYear`). Identical → log "no change", exit (no write).
5. `--dry-run`: print plan, exit.
6. Write `nflverse/draft/draft_picks.json`; `updateManifestEntry({ path,
   recordCount: count, inProgress: false, schemaVersion: 1 })`.

## `bin/update.mjs` dispatcher changes
- Import `updateRoster`, `updateDraft`.
- Add `case 'roster': await updateRoster(opts); break;` and
  `case 'draft': await updateDraft(opts); break;`.
- Extend `printHelp()` with both subcommands (roster takes `--year`/`--force`;
  draft takes neither but honors `--dry-run`).

## GitHub Actions

**`.github/workflows/weekly-nflverse-roster.yml`** — clone `weekly-ktc.yml`:
- `schedule: cron "23 13 * * 2"` (Tuesday, off-hour; staggered from KTC's Monday
  so the two weekly committers don't race the push) + `workflow_dispatch`.
- `permissions: contents: write`; checkout; setup-node 20; `npm ci`.
- `run: node bin/update.mjs roster` (defaults to current season).
- Commit-if-changed: `git add nflverse/ manifest.json` →
  `git commit -m "nflverse: roster $(date -u +%Y-%m-%d)"` → `git push`
  (porcelain guard → no commit on dedup no-op).
- **Add a CDN-purge step** (new vs KTC) so weekly freshness isn't stuck behind
  jsDelivr's @main cache: after push, `curl -s https://purge.jsdelivr.net/gh/<owner>/sleeper-dashboard-data@main/manifest.json`
  and the changed `nflverse/roster/<year>.json`. (Reads `<owner>` from the repo;
  best-effort, non-fatal.)

**`.github/workflows/nflverse-draft.yml`** — yearly + manual:
- `schedule: cron "0 12 1 5 *"` (May 1, after the NFL draft) + `workflow_dispatch`.
- Same scaffold; `run: node bin/update.mjs draft`; commit `nflverse/ manifest.json`;
  same purge step for `draft_picks.json` + manifest.

## Initial backfill (one-time, manual — note in docs, not automated)
```
node bin/update.mjs roster --year 2025
node bin/update.mjs roster --year 2024     # gives the app's probe a -1/-2 fallback
node bin/update.mjs draft
```

## Part 1 — Docs updates

### README.md
1. **Folder structure** tree (lines 24–48): add under the tree
   ```
     nflverse/
       roster/                   — nflverse season rosters (sleeper_id join), one file per year
         2025.json
       draft/                    — nflverse combined draft picks (all years in one file)
         draft_picks.json
   ```
2. **File schemas:** add `### nflverse/roster/<year>.json` and
   `### nflverse/draft/draft_picks.json` sections (use the Cross-repo contract
   shapes), noting: source release-asset URLs; `sleeper_id` direct join; the
   `MIN_ROSTER_IDS` sparsity rule; that the current-season roster is
   weekly-refreshed (`inProgress:false` but mutable, dedup'd by content hash);
   draft is combined/yearly.
3. **Update scripts → Subcommands:** add
   ```
   node bin/update.mjs roster                 # current season roster (Sleeper state)
   node bin/update.mjs roster --year 2024     # a specific season
   node bin/update.mjs draft                  # combined draft picks (all years)
   ```
   and `--dry-run`/`--force` notes (force = overwrite a completed-season roster).
4. **GitHub Actions** table: add `weekly-nflverse-roster.yml` (Tue, roster
   refresh, content-hash dedup, CDN purge) and `nflverse-draft.yml` (yearly May 1
   + dispatch).
5. **Smoke test** note: mention it now also dry-runs `roster`/`draft`.

### CLAUDE.md
1. **Commands → Update CLI:** add the `roster`/`draft` lines.
2. **Navigation map:** add rows —
   `scripts/update-roster.mjs` (nflverse roster ingest),
   `scripts/update-draft.mjs` (nflverse draft ingest),
   `lib/nflverse.mjs` (nflverse fetch + CSV-parse helpers),
   `nflverse/roster/` , `nflverse/draft/`,
   `.github/workflows/weekly-nflverse-roster.yml`,
   `.github/workflows/nflverse-draft.yml`.
3. **Invariants:** extend invariant 5 (or add 8): nflverse roster/draft are
   script-produced primary data; current-season roster is mutable-weekly via
   content-hash dedup but registered `inProgress:false` (deliberate deviation —
   the app has no live fallback for it).
4. **Cross-repo contracts table:** add a **nflverse roster/draft** row — this
   repo writes `nflverse/roster/<year>.json` + `nflverse/draft/draft_picks.json`
   (`inProgress:false`); app reads via `tryDataStore`/`getManifestEntry` in
   `nflRoster.js`/`nflDraft.js`; the served JSON shapes + `MIN_ROSTER_IDS` are
   the contract.

## Part 1 — Tests (repo convention: `node --test` units + `npm run smoke` dry-runs)

### `test/nflverse.test.mjs` (`node --test`) — pure parser units
Move the app's CSV-parse coverage here. Fixtures inline (tiny CSV strings):
- `parseRosterCsv`: happy path → `players` keyed by `sleeper_id`, `rowCount`
  correct; empty-`sleeper_id` rows skipped; quoted name with comma
  (`"Smith, Jr."`) intact; missing `sleeper_id`/`status` column → `throw` (or
  empty + flag, matching the chosen fail-loud contract — pick `throw` so CI is
  red on format drift).
- `parseDraftCsv`: minimal CSV → `picksByYear` with the `DraftPick` shape;
  rows < `MIN_DRAFT_YEAR` filtered; `supplemental`/`NA` rounds skipped; quoted
  names handled; `age` `NA` → `null`.
- `validateRoster` / `validateDraft`: pass on good input, throw on
  empty/short/missing-field input.

### `npm run smoke` — extend the script
Append `&& node bin/update.mjs roster --year 2024 --dry-run && node bin/update.mjs draft --dry-run`
to the `smoke` script (network dry-runs are already the smoke pattern — `nfl`/
`cfbd` dry-runs hit live APIs). These exercise the real release URLs end-to-end
without writing.

---

# PART 2 — App (`sleeper-dashboard`)

**Principle:** only the data SOURCE changes. Preserve the `sleeper_id` join,
`nflDraftMatch`, per-year IndexedDB cache, `MIN_ROSTER_IDS` gate, the
`season → −1 → −2` probe, and all graceful degradation. CSV parsing moves to the
data repo; the app now consumes JSON. `App.jsx`, `relevance.js`, and
`nflDraftMatch.js` are **unchanged** (same shapes flow in).

## Routing decision: go through `dataStore.js` (justified)

Route both loaders through `getManifestEntry` + `tryDataStore` rather than a raw
`fetch` to `${VITE_DATA_STORE_URL}/…`, because:
- **Manifest-driven freshness:** `getManifestEntry(path).lastModified` lets the
  app detect the weekly roster refresh and invalidate the permanent per-year
  cache — a raw jsDelivr fetch has no freshness signal and the permanent cache
  would pin stale data forever.
- **Free correctness gates:** `tryDataStore` already applies the
  `schemaVersion`/`inProgress`/timeout/shape-`validate` checks and the
  session-disable + log-once behavior, consistent with season-totals/CFBD.

## `src/api/dataStore.js`
Add two exported validators (mirror `isValidSeasonTotals`/`isValidCFBDRows`):
```js
export function isValidRoster(p) {
  return p && typeof p === 'object' && typeof p.players === 'object'
    && p.players !== null && typeof p.rowCount === 'number';
}
export function isValidDraft(p) {
  return p && typeof p === 'object' && p.picksByYear && typeof p.picksByYear === 'object';
}
```
No change to `tryDataStore`/`getManifestEntry`.

## `src/api/nflRoster.js`
- **Remove** `NFLVERSE_ROSTER_URL`, `splitCsvLine`, `parseRosterCsv`, and the raw
  `fetch`. Keep `OUT_STATUSES`, `MIN_ROSTER_IDS`, and `loadCurrentRoster`'s
  signature/return shape.
- Import `{ tryDataStore, getManifestEntry, isValidRoster }` from `./dataStore`.
- Rewrite `loadCurrentRoster(currentSeason)`; per probe year
  `[currentSeason, −1, −2]`:
  1. `entry = await getManifestEntry('nflverse/roster/<year>.json')`. If `!entry`
     → `continue` (treated like the old 504 — file not in store yet).
  2. **Cache check (lastModified-aware):** `rec = await
     getCacheRecord('nfl-roster/<year>')`. If `rec?.data.rowCount >=
     MIN_ROSTER_IDS` **and** `rec.data.lastModified === entry.lastModified` →
     rehydrate `activeIds` from `rec.data.byId` and return (no fetch).
  3. Else `json = await tryDataStore('nflverse/roster/<year>.json', { validate:
     isValidRoster })`. If `null` → `continue`.
  4. **Sparsity gate:** if `json.rowCount < MIN_ROSTER_IDS` → `continue` (don't
     cache — same policy as before).
  5. Build `byId = json.players`; `activeIds = new Set(ids where status ∉
     OUT_STATUSES)` (status filtering stays here).
  6. `setCacheWithMeta('nfl-roster/<year>', { byId, season: json.season,
     rowCount: json.rowCount, lastModified: entry.lastModified, activeIds:
     [...activeIds] }, 999999, {})`.
  7. `return { activeIds, year, complete: true, byId }`.
- On exhaustion: `return { activeIds: null, year: null, complete: false, byId:
  null }` (unchanged — relevance falls back to `'unknown'`).

## `src/api/nflDraft.js`
- **Remove** `NFLVERSE_DRAFT_URL`, `splitCsvLine`, `parseDraftCsv`, and the raw
  `fetch`. Keep `DRAFT_YEARS` and `loadNflDraftPicks`'s signature/return shape
  (`{ [year]: DraftPick[] }`).
- Import `{ tryDataStore, getManifestEntry, isValidDraft }` from `./dataStore`.
- Rewrite `loadNflDraftPicks()`:
  1. `entry = await getManifestEntry('nflverse/draft/draft_picks.json')`.
  2. **Cache check:** for each `DRAFT_YEARS` year, read `nfl-draft/<year>`; a
     cached year is valid only if its stored `lastModified === entry?.lastModified`.
     If all present + fresh → return from cache (no fetch).
  3. Else `json = await tryDataStore('nflverse/draft/draft_picks.json', {
     validate: isValidDraft })`. If `null` → return whatever cache exists
     (possibly `{}`) — graceful degradation → multiplier `1.0`.
  4. For each `DRAFT_YEARS` year: `data = json.picksByYear[year] ?? []`;
     `setCacheWithMeta('nfl-draft/<year>', { picks: data, lastModified:
     entry?.lastModified ?? null }, 999999, {})`; `result[year] = data`.
  5. Return `result`.
- (Cache value gains a `{ picks, lastModified }` wrapper so freshness is
  checkable; adjust the read accordingly.)

## App.jsx / consumers
No change. `loadCurrentRoster(nflState.season)` and `loadNflDraftPicks()` keep
the same call sites and return shapes; `matchNflDraftToSleeper`, `relevance.js`,
`rosterStatusOf` see identical inputs.

## Part 2 — Docs updates

### docs/integrations.md
- **`### src/api/nflDraft.js`** (≈line 289): change **Source** from the dead
  `@master` jsDelivr path to **the data store** —
  `${VITE_DATA_STORE_URL}/nflverse/draft/draft_picks.json` via
  `tryDataStore`/`getManifestEntry`; note ingest happens in
  `sleeper-dashboard-data` (`bin/update.mjs draft`, yearly Action); update the
  **Refresh** line (now manifest `lastModified`-driven, not cache-clear/release-tag).
- **`### src/api/nflRoster.js`** (≈line 298): change **Source** to
  `${VITE_DATA_STORE_URL}/nflverse/roster/<year>.json`; note the weekly Action +
  `lastModified` invalidation; keep the `MIN_ROSTER_IDS`/probe/failure-mode prose
  (still accurate). Add the CORS rationale (why direct nflverse is impossible in
  the browser).
- Add a one-line pointer to the data repo's nflverse sections as the source of
  truth for the served shapes.

### CLAUDE.md (app)
- **Navigation map:** update the `nflDraft.js`/`nflRoster.js` rows to say
  "via data store (`dataStore.js`)".
- **Cross-repo contracts** bullet list: add **nflverse roster/draft** — app reads
  `nflverse/roster/<year>.json` + `nflverse/draft/draft_picks.json` from the data
  store; shapes + `MIN_ROSTER_IDS` are the contract; data repo produces them.

## Part 2 — Tests (Vitest; mock the data store, not the network)

Both loader test files are rewritten to mock `../api/dataStore`
(`getManifestEntry`, `tryDataStore`) instead of `global.fetch`, and to drop the
CSV-parse describe blocks (parsing now lives in the data repo).

### `src/api/nflRoster.test.js`
`vi.mock('../api/dataStore', …)` + keep `vi.mock('../utils/cache', …)`.
- file not in store (`getManifestEntry → null`) for current year, present for
  `−1` → **falls back to prior year** (replaces the old 504 test).
- all years missing → `{ activeIds:null, year:null, complete:false }`.
- sparse file (`tryDataStore` returns `rowCount < MIN_ROSTER_IDS`) → not cached,
  falls through to next year.
- cache hit with **matching** `lastModified` → returns from cache, `tryDataStore`
  **not** called; `activeIds` rehydrated from `byId`.
- cache present but **stale** `lastModified` (≠ manifest) → re-fetches via
  `tryDataStore` and re-caches (new test — the freshness path).
- `OUT_STATUSES`: a `RET` player in `players` is excluded from `activeIds` but
  present in `byId` (port the existing status assertion to JSON input).

### `src/api/nflDraft.test.js`
`vi.mock('../api/dataStore', …)`.
- all years cached + fresh `lastModified` → returns from cache, `tryDataStore`
  not called.
- a year missing → `tryDataStore` fetched once, each `DRAFT_YEARS` year cached
  with `lastModified`.
- stale `lastModified` → refetch (new freshness test).
- `tryDataStore → null` (store down) → returns partial/empty cache (graceful;
  multiplier path stays `1.0`).
- shape passed to `nflDraftMatch` unchanged (a parsed `DraftPick` survives
  round-trip) — light integration assertion.

### Unaffected (assert no change)
`nflDraftMatch.test.js`, `relevance.test.js`, `dataStore.test.js` (add small
units for the two new validators `isValidRoster`/`isValidDraft`).

Done-definition (app): `npm test` green, `npm run build` clean.

---

## Sequencing & rollout

1. **Part 1 first.** Land the ingest, run the one-time backfill (`roster
   --year 2025`, `roster --year 2024`, `draft`), confirm the files + manifest
   entries are published and CDN-purged. The app keeps degrading gracefully
   (roster `unknown`, draft `1.0`) until Part 2 ships — no app regression.
2. **Part 2 second.** Repoint the loaders; with the store already populated they
   light up immediately. If the store is unreachable, both loaders degrade to
   exactly today's behavior.
3. **Enable the Actions** (weekly roster, yearly draft) once Part 1 is verified.

## Cross-repo impact summary (for the task report)
- **New manifest folders/shapes:** `nflverse/roster/<year>.json`,
  `nflverse/draft/draft_picks.json` — see Cross-repo contract. Both
  `inProgress:false`, `schemaVersion:1`.
- **Shared constant:** `MIN_ROSTER_IDS = 1500` (data repo write-gate ↔ app
  read-gate).
- **inProgress deviation** documented in both repos.
- **App-only:** new `isValidRoster`/`isValidDraft` in `dataStore.js`; loaders
  consume JSON via the store; CSV parsers + their tests removed (moved to data
  repo).
