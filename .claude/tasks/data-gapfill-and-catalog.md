# Gap-fill + data-catalog seed (B1) — Session 1 plan

**Status:** planned 2026-07-03, awaiting Session 2 (sonnet) implementation.
**Model discipline:** Session 1 = this task file only; NO source edits, NO ingest runs happened.
All upstream facts below were **live-verified 2026-07-03** (curl status codes, GitHub release-asset
API listings, header diffs, roster sleeper_id fill counts) — not taken from the audit or memory.
**Parent:** backlog item B1 in `data-completeness-audit.md` (§1 inventory, §4 B1 row, §5 catalog shape).

---

## 0. Verdicts at a glance

| Gap | Audit's belief | **Verified verdict** | Session-2 action |
|---|---|---|---|
| advstats 2019 | re-runnable write failure (`--force` re-run) | **RECOVERABLE — but NOT by re-running as-is.** The fetch 404s and gracefully skips; recoverable after a one-line source-URL fix | fix `STATS_BASE`, then `advstats --year 2019` |
| gamelogs 2019 | upstream-absent (permanent gap) | **RECOVERABLE — verdict overturned.** Absent only under the *frozen legacy release tag* the code fetches; present + downloadable under the current tag | same fix, then `gamelogs --year 2019` |
| advstats 2025 | benign offseason-not-yet-published, fills on cadence | **RECOVERABLE — verdict overturned.** 2025 season is complete, asset is final (2026-02-12), and no cadence will *ever* re-fetch 2025 (weekly Actions fetch current season = 2026 only) | `advstats --year 2025` after the fix |
| gamelogs 2025 | same | same | `gamelogs --year 2025` after the fix |
| roster 2016–2023 | backfillable | **RECOVERABLE — cheap re-run pattern, fold into B1.** All 8 years pass `MIN_ROSTER_IDS` (measured 1,539–2,331 distinct sleeper_ids) | `roster --year 2016` … `--year 2023` |
| roster 2012–2015 | backfillable | **BLOCKED — split into its own slice.** Sparsity gate fails *honestly*: 602 / 776 / 971 / 1,158 distinct sleeper_ids < 1,500. Gate is a shared cross-repo contract; overriding it is a product decision, not a gap-fill | document as absent in catalog; see §6 |

**Incidental discovery (raises B1 urgency):** the legacy release tag is frozen (last touched
2025-05-06, missing 2025 entirely). Without the source-URL fix, the Thursday/Saturday Actions will
fetch `stats_player_week_2026.csv` from the frozen tag all through the 2026 season → perpetual 404 →
**advstats and gamelogs would silently never update in-season 2026**. The fix is needed before
September 2026 regardless of the backfill.

**Deviation from the B1 brief, stated plainly:** the brief said "do NOT force a 2025 write; document
as benign." That instruction was premised on the audit's offseason-not-yet-published diagnosis, which
the live check disconfirms (evidence in §1.3). Filling 2025 uses **no `--force` flag** and writes
final, complete, upstream-published season data — it is a normal fill of a missing completed season,
not a forced write of preliminary data. If the product owner still wants 2025 deferred, Session 2
can simply skip the two 2025 commands in §3 step 4 without affecting anything else.

---

## 1. Root-cause diagnosis (evidence, per family)

### 1.1 Shared mechanics

Both families fetch the **same asset via the same function**: `fetchPlayerStatsCsv(year)` in
`lib/nflverse.mjs` (~line 396), which builds `${STATS_BASE}/stats_player_week_${year}.csv` from

```js
const STATS_BASE = 'https://github.com/nflverse/nflverse-data/releases/download/player_stats';  // lib/nflverse.mjs:55
```

`player_stats` is nflverse's **legacy** release tag; nflverse migrated the weekly player-stats
assets to the **`stats_player`** release tag and partially mirrored them back. So the audit's
"per-family, not a shared cause" framing was wrong: one cause, two symptoms.

On 404/504 the shared `fetchRelease` helper (lib/nflverse.mjs:114-121) returns `null`, and both
writers log "not published yet — skipping" and exit 0 (update-advstats.mjs:52-56;
update-gamelogs.mjs:91-95). That graceful skip is why the 2026-06-14 advstats backfill and the
2026-06-28 gamelogs backfill silently produced no 2019/2025 files and no red CI — there was never a
"write failure"; there was a quiet upstream 404.

### 1.2 2019 — live evidence (2026-07-03)

Direct download of `releases/download/player_stats/stats_player_week_2019.csv`: **HTTP 404**
(3 retries; 2018 and 2020 under the same tag: HTTP 206). But the GitHub release-asset API lists the
2019 asset under `player_stats` with **`"state": "starter"`** (asset id 250655523, 6,298,929 bytes,
updated 2025-04-30) — a failed/incomplete upload. GitHub never serves "starter" assets; the download
URL 404s permanently. The legacy tag also lacks 2002 entirely (below our 2012 floor — irrelevant)
and its assets were last touched 2025-05-06 (frozen).

Under the current **`stats_player`** tag, `stats_player_week_<year>.csv` exists for **every season
1999–2025**, all `state: "uploaded"`; 2019 verified downloadable (HTTP 206 ranged GET; 6,295,331
bytes, updated 2025-09-26).

**Header compatibility verified:** the current-tag 2019 header is **byte-identical** to the
legacy-tag 2018 header our shipped files were built from (114 columns, same order). The current-tag
2025 file adds exactly one column, `game_id` (115 columns). All parsers resolve columns by name from
the header (`header.indexOf(...)` in `aggregateAdvReceiving` at lib/nflverse.mjs:430-440 and
`parsePlayerGameLogs` at lib/nflverse.mjs:695-720), so an additive column is ignored. All required
columns (`player_id`, `position`, `season`, `week`, `team`, `targets`, `receiving_air_yards`,
`receiving_yards`, `receptions`, `season_type`, `opponent_team`, `player_display_name`) are present
in both eras.

**Answers to the brief's specific questions:**
- *advstats 2019 a re-runnable write failure?* **No.** The runbook in
  `backtest-cohort-fix.md` §6 ("re-run `advstats --year 2019 --force`") does not work under current
  code: the fetch 404s and the script exits before any write path. `--force` is irrelevant — the
  force gate (update-advstats.mjs:111, `isPast && existing && !force`) only guards overwriting an
  *existing* file, and none exists. This plan supersedes that runbook note; do not retro-edit the
  old task file (session artifact).
- *Does the gamelogs `--all` enumeration skip 2019?* **No.** `updateGameLogs`
  (scripts/update-gamelogs.mjs:53-57) builds an inclusive range
  `MIN_GAMELOG_SEASON..currentSeason` (2012..2026); 2019 is enumerated. Not an enumeration bug.
- *Is the 2019 upstream asset genuinely absent?* **No.** Absent (broken "starter" state) only under
  the legacy tag; present and healthy under the current tag. The audit's 404-vs-403 check was run
  against the legacy-tag URL the code uses, which is exactly why it looked upstream-absent. An
  alternate upstream exists and it is the *same asset name under the correct tag* — the fix is one
  constant, not a new source or parser.

### 1.3 2025 — live evidence (2026-07-03)

- Legacy tag: `stats_player_week_2025.csv` **does not exist at all** (404; absent from the tag's
  full 1,831-asset listing). It will never appear — the tag is frozen.
- Current tag: exists, `state: "uploaded"`, 7,311,978 bytes, **updated 2026-02-12** — after the
  2025 season (including Super Bowl) completed. The data is final, not preliminary.
- Cadence check: `nflverse-advstats.yml:32` runs bare `node bin/update.mjs advstats` and
  `nflverse-gamelogs.yml:32` runs bare `node bin/update.mjs gamelogs` — both resolve
  `fetchCurrentNflSeason()` → **2026** and fetch only that year. Nothing ever re-requests 2025.
  "Fills on cadence" is impossible; without B1, 2025 stays absent forever.

Verdict: **recoverable, in scope.** No `--force` (no existing file). Not a fabrication risk: the
sparsity gates (≥250 advstats rows, ≥3,000 gamelog rows) and validators run as on any ingest.

### 1.4 Roster backfill — live evidence (2026-07-03)

`roster_<year>.csv` exists under the `rosters` release for every sampled year 2012–2023 (HTTP 206).
The constraint is not availability but **sleeper_id fill**, which decays with age. Measured distinct
non-empty/non-`NA` `sleeper_id` counts per year (the exact quantity `parseRosterCsv` keys on and
`MIN_ROSTER_IDS = 1500` gates):

| year | distinct sleeper_id | gate ≥ 1500 |
|---|---|---|
| 2012 | 602 | FAIL |
| 2013 | 776 | FAIL |
| 2014 | 971 | FAIL |
| 2015 | 1,158 | FAIL |
| 2016 | 1,539 | PASS (thin margin) |
| 2017 | 1,784 | PASS |
| 2018 | 2,100 | PASS |
| 2019 | 2,225 | PASS |
| 2020 | 2,331 | PASS |
| 2021 | 2,244 | PASS |
| 2022 | 2,075 | PASS |
| 2023 | 2,102 | PASS |

All years carry the `sleeper_id` and `status` columns (no format drift; `parseRosterCsv` and
`validateRoster` work unchanged).

**Assessment:** 2016–2023 is exactly the cheap re-run pattern — same subcommand, no code change, no
`--force` (files absent) → **fold into B1** (8 commands). 2012–2015 is *not* a re-run away: the
sparsity gate refuses, and the gate is correct — e.g. 2012 has 602 sleeper-joinable players against
1,285 players in `nfl/season-totals/2012.json` (manifest recordCount), i.e. under half the
app-visible universe. Unblocking would mean changing `MIN_ROSTER_IDS` era-aware — a **shared
cross-repo contract** (CLAUDE.md Cross-repo contracts: `src/api/nflRoster.js` re-asserts the same
constant) → its own slice with a product decision. See §6. Do not balloon B1.

Note: 2016's margin is 39 ids. Upstream regenerates these CSVs; if a future regen dips 2016 below
1,500 the script refuses (correct behavior) — then move 2016 to the §6 slice and document.

---

## 2. Session-2 edits, grouped by file

Planning-only note: none of these edits were applied in Session 1.

### 2.1 `lib/nflverse.mjs`

**Edit A (the fix) — line 55**, `STATS_BASE` constant:

```js
// before
const STATS_BASE    = 'https://github.com/nflverse/nflverse-data/releases/download/player_stats';
// after
const STATS_BASE    = 'https://github.com/nflverse/nflverse-data/releases/download/stats_player';
```

Add a one-line comment above it stating the constraint the code can't show:

```js
// stats_player is the CURRENT release tag; the legacy player_stats tag is frozen
// (2019 asset broken "starter" upload, 2025+ never mirrored) — do not revert.
```

**Edit B — `fetchPlayerStatsCsv` JSDoc (~lines 389-395):** change "from the nflverse
`player_stats` release asset" → "from the nflverse `stats_player` release asset".

**No change** to `MIN_GAMELOG_SEASON` (2012 floor is this repo's charting-era policy, not an
upstream limit — the current tag goes back to 1999; widening coverage is NOT B1) or to any parser,
gate constant, or served shape.

### 2.2 `scripts/update-advstats.mjs`

**Edit C — header comment, line 4:** "Fetches stats_player_week_<year>.csv from the nflverse
player_stats release asset" → "… from the nflverse stats_player release asset".

**Edit D — reorder the dry-run exit above the force gate (lines 110-122).** Current order is
step 9 force-gate-throw, then step 10 dry-run exit. `update-gamelogs.mjs` deliberately does the
opposite (dry-run exit at lines 133-141 *before* the force gate at 144-149). Why this matters now:
`npm run smoke` runs `advstats --year 2023 --dry-run` (package.json:14). Today that passes only
because the legacy-tag 2023 asset is byte-identical to what built our file, so the content-hash
dedup (step 8) returns before the force gate. After the tag switch, the current-tag 2023 file
(regenerated 2025-09-26) may hash differently → dedup no longer short-circuits → the force gate
would **throw inside a dry-run** → red smoke. Mirror the gamelogs pattern:

```js
// after (step order: 8 dedup → 9 dry-run exit → 10 force gate → 11 write)
  // 9. Dry-run exit
  if (dryRun) {
    const needsForce = isPast && existing && !force;
    console.log(
      `[advstats] [dry-run] would write ${dataPath}: ${rowCount} players (${unmapped} unmapped)` +
      (needsForce ? ' (past season — needs --force to write for real)' : '')
    );
    return;
  }

  // 10. Force gate: completed past seasons require --force to overwrite
  if (isPast && existing && !force) {
    throw new Error(
      `[advstats] ${dataPath} already exists for completed season ${year}. ` +
      'Use --force to overwrite.'
    );
  }
```

Real-run behavior is unchanged (dry-run block is a no-op when `dryRun` is false); only dry-run
stops throwing on needs-force, matching gamelogs. Renumber the step comments (9/10/11/12) locally.

### 2.3 `scripts/update-gamelogs.mjs`

**Edit E — header comment, lines 4-5:** "from the nflverse player_stats release asset" → "from the
nflverse stats_player release asset". No logic change.

### 2.4 `README.md`, `CLAUDE.md`, `data-catalog.md`

See **Docs updates** section below (all before/after text there); catalog content in §5.

No other source files change. No schemaVersion bumps (all three families stay at 1; served shapes
untouched). No workflow edits (Actions already run the bare subcommands; the URL fix flows through).

---

## 3. Session-2 run sequence

Preconditions: clean git tree; Node ≥ 20; `nflverse/playerids.json` on disk (present, rowCount
6,143 — both stats fills re-key through it).

1. Apply edits A–E (§2).
2. `npm test` — the unit suite (`node --test`) is fixture-based; no test references `STATS_BASE`
   or the advstats step order (verified by grep). Expect green.
3. `npm run smoke` — expect green. **Expected output change:** the `advstats --year 2023 --dry-run`
   and `gamelogs --year 2023 --dry-run` lines may now print
   `would write … (past season — needs --force to write for real)` instead of
   `Content identical … — no change.` That is the current-tag regen hashing differently; it is
   expected, not a failure. Smoke asserts exit codes, not that wording.
4. Gap-fill runs, in this order (playerids already on disk, so order among these is free; keep it
   deterministic anyway). **No `--force` anywhere** — every target file is absent, and the force
   gate only guards overwrites. If any command demands `--force`, STOP: the file exists and
   something is off (append-only alarm).

   ```sh
   node bin/update.mjs advstats --year 2019
   node bin/update.mjs gamelogs --year 2019
   node bin/update.mjs advstats --year 2025
   node bin/update.mjs gamelogs --year 2025
   node bin/update.mjs roster --year 2016
   node bin/update.mjs roster --year 2017
   node bin/update.mjs roster --year 2018
   node bin/update.mjs roster --year 2019
   node bin/update.mjs roster --year 2020
   node bin/update.mjs roster --year 2021
   node bin/update.mjs roster --year 2022
   node bin/update.mjs roster --year 2023
   # optional, demonstrates the documented-absent boundary (exit 0, no write):
   node bin/update.mjs roster --year 2015 --dry-run
   ```

   Notes: the roster runs each rewrite `nflverse/last-checked-roster.json` (existing marker
   behavior; the Tuesday Action resets it to the current season — harmless). The `--year 2015`
   dry-run should log `only ~1158 id-bearing rows (< MIN_ROSTER_IDS=1500) — treating as
   preliminary, skipping` — that refusal IS the correct outcome, not an error.
5. Verify per §4.
6. Write `data-catalog.md` (§5) — **after** the fills, so coverage rows match disk/manifest.
7. Apply the README.md / CLAUDE.md docs edits (Docs updates section).
8. `npm run smoke` once more (post-fill), then commit everything in **one commit** (code fix +
   13 new data files + manifest + docs + catalog). Suggested message:
   `B1: fix frozen player_stats release tag; fill advstats+gamelogs 2019/2025 + roster 2016-2023; seed data-catalog.md`.
   CDN note: the 13 new file paths are cold on jsDelivr (no purge needed). `manifest.json` is
   cached; either purge it following the weekly-Action pattern
   (`https://purge.jsdelivr.net/gh/<owner>/sleeper-dashboard-data@main/manifest.json`) or accept
   natural cache expiry — manual imports have historically relied on expiry; no new mechanism.

---

## 4. Validation that proves each fill succeeded

Expected values (ranges bracketed by the adjacent shipped seasons; upstream regens shift them
slightly — assert the gates, sanity-check the ranges):

| File | internal `rowCount` expected | hard gate | manifest entry |
|---|---|---|---|
| `nflverse/advstats/2019.json` | ≈ 490–530 (2018: 502, 2020: 520) | ≥ `MIN_ADVSTATS_ROWS` 250 | recordCount = rowCount, schemaVersion 1, inProgress false |
| `nflverse/advstats/2025.json` | ≈ 480–560 (2024: 507) | ≥ 250 | same |
| `nflverse/gamelogs/2019.json` | ≈ 5,700–6,100 game rows (2018: 5,752, 2020: 5,950); playerCount ≈ 580–630 | parsed rows ≥ `MIN_PLAYERGAME_ROWS` 3,000 | recordCount = rowCount (game rows), schemaVersion 1, inProgress false |
| `nflverse/gamelogs/2025.json` | ≈ 6,000–6,500 (2024: 6,223) | ≥ 3,000 | same |
| `nflverse/roster/2016..2023.json` | ≈ the §1.4 measured counts (1,539 … 2,331) | ≥ `MIN_ROSTER_IDS` 1,500 | recordCount = rowCount, schemaVersion 1, inProgress false |

Checklist:
1. **Files + gates:** each command's own validator ran (`validateAdvStats`, `validateGameLogs`,
   `validateRoster` — they throw red on drift); console shows "Validation passed" and "Wrote …".
2. **Manifest:** 13 new entries exist with the fields above and fresh `lastModified`
   (`updateManifestEntry` writes them — lib/manifest.mjs:34-51). No existing entry's
   `recordCount`/`schemaVersion` changed.
3. **Append-only:** `git status --porcelain` shows ONLY: modified `lib/nflverse.mjs`,
   `scripts/update-advstats.mjs`, `scripts/update-gamelogs.mjs`, `manifest.json`, `README.md`,
   `CLAUDE.md`, `nflverse/last-checked-roster.json`; added `data-catalog.md` + the 13 new data
   files. **Zero modifications to any existing `nflverse/*/<year>.json`.**
4. **Catalog-vs-manifest cross-check** (run after writing the catalog; also listed under Tests):

   ```sh
   node -e '
   const m = JSON.parse(require("fs").readFileSync("manifest.json","utf8")).files;
   for (const fam of ["advstats","gamelogs","roster"]) {
     const years = Object.keys(m).filter(k => k.startsWith(`nflverse/${fam}/`))
       .map(k => k.match(/(\d{4})\.json$/)?.[1]).filter(Boolean).sort();
     console.log(fam, years.join(","));
   }'
   # advstats: 2012..2025 no gaps; gamelogs: 2012..2025 no gaps; roster: 2016..2026 no gaps.
   # These MUST match the coverage cells written in data-catalog.md verbatim.
   ```
5. **Spot sanity (2019 truthiness):** in `nflverse/advstats/2019.json`, find the player named
   "Michael Thomas" (WR/NO): `components.targets` = 185, `targetShare` ≈ 0.32. In
   `nflverse/gamelogs/2019.json` the same player has ~16 REG games. (Name-lookup, don't hardcode a
   sleeper_id.)
6. **2025 untouched by force:** confirm no `--force` appears in the executed commands
   (session transcript / shell history).

---

## 5. PART B — `data-catalog.md` spec

### 5.1 Location + justification

**Repo root, beside `README.md`** (as the audit §5 proposed). The B1 brief flagged "adds a second
markdown doc to a README-only-doc repo" — that premise is stale: the root already carries
`snapshot-workflow.md` and `schedule-ingest-guide.md`, so a purpose-scoped root doc is established
practice here. Independent justification: the catalog is a *living index* that every future ingest
slice appends one row to; folding it into the 1,000-line README would make each slice's docs diff
noisy and the index hard to scan, and CLAUDE.md is explicitly a thin navigation-and-rules layer
("push deep detail into README.md") — a growing dataset inventory belongs in neither.
`manifest.json` remains the **machine-readable** source of truth; the catalog is the human layer on
top (grain/provenance/join/coverage semantics the manifest can't hold) and every coverage cell must
stay reconcilable against the manifest (§4 check 4).

### 5.2 Exact structure

Header block (verbatim, adjust nothing but the date):

```markdown
# Data catalog

The storage registry of every served data family in this repo: what it is, where it lives, how it
refreshes, what joins it, and what's honestly missing. One section per family; `manifest.json`
stays the machine-readable index — this doc adds the semantics. The *signal* registry (how the app
consumes fields) lives in the app repo at `docs/signal-registry.md`; link, don't merge.

**Doctrine:** all banked data is capture-only/view-only unless a Cross-repo contract in CLAUDE.md
says otherwise — it never silently feeds projection/scoring/grading. Gaps are honest: an
upstream-absent year stays absent and documented; nothing is zero-filled, fabricated, or
back-dated. Served paths follow the ad-blocker-safe naming rule (no `adv`/`ad`/`ads`/`analytics`/
`tracking` tokens; the legacy `nflverse/advstats/` path is a known parked violation — do not
propagate the pattern).

**Append convention:** every slice that adds or changes a served family MUST add/update its row
here in the same commit (CLAUDE.md Done-definition). Coverage cells must match `manifest.json`.

_Last reconciled against manifest.json: 2026-07-XX_
```

Then one `##` section per family, each a fixed field list (the audit-§5 columns plus the B1-brief
additions — schemaVersion, sparsity gate, keep-rationale):

```markdown
## <family name>
- **Served path / subcommand / refresh:** …
- **Source + provenance:** … (upstream URL; license/attribution if any)
- **Grain:** … (player-season / player-game / team-game / dated snapshot / …)
- **Join id(s):** … (sleeper_id native? via which crosswalk?)
- **Coverage:** … (year floor–ceiling; honest gaps; per-field era caveats)
- **schemaVersion:** …
- **Sparsity gate:** … (constant + value, or "none — <what validates instead>")
- **Null semantics:** …
- **Consumption:** app loader <file> / banked view-only / internal-only
- **Keep-rationale:** … (one line; cross-position context flags here)
```

### 5.3 Populated rows (write these; verify dynamic cells against manifest/README at write time)

1. **Sleeper season totals** — `nfl/season-totals/<year>.json`; `bin/update.mjs nfl --year`; no
   Action (manual per-season; in-season files `inProgress: true` re-exported). Source: Sleeper
   stats API, aggregated (lib/sleeper.mjs). Grain: player-season + `weeklyPoints`/`weeklyStatus`
   arrays. Join: sleeper_id (native key). Coverage: 2012–2025; snap/RZ keys ≈2020/2021+ only;
   per-season `team` (v3). schemaVersion **3** (app `MAX_SUPPORTED_SCHEMA=3`). Gate: none —
   sentinel validation (`NFL_SENTINELS`) + finiteness sweep instead. Nulls: keys preserved as-is
   from Sleeper; `pass_rtg`/`cmp_pct` are weekly sums, never season-valid (rate-trap note).
   Consumption: app-consumed (`src/api/dataStore.js`). Keep: the canonical outcome/actuals store.
2. **CFBD college stats** — `college/{passing,receiving,rushing}/<year>.json`;
   `bin/update.mjs cfbd --year [--category]`; no Action. Source: CFBD API (key required). Grain:
   player-season stat rows (row per statType). Join: app-side matching via `pivotStatRows`
   (statType keys are a cross-repo contract). Coverage: 2017–2025; pre-2017 exists upstream,
   unbackfilled (audit B18). schemaVersion 1. Gate: none — category/statType validation. Nulls:
   absent statTypes absent. Consumption: app-consumed. Keep: prospect college drill-down.
3. **KTC dynasty values** — `ktc/snapshot-<date>.json`; `bin/update.mjs ktc`; Monday Action.
   Source: KeepTradeCut scrape. Grain: player, dated snapshot. Join: name-based app-side (verify
   phrasing against README §ktc). Coverage: 2026-05-18 → present, weekly; **no pre-history exists
   or can be backfilled** (audit DEFER). schemaVersion 1. Gate: per-row validation + Spearman
   ordering guard (ρ < 0.90 → `ktc/quarantine/`, unregistered, app-ignored). Consumption:
   app-consumed. Keep: market-value time series.
4. **Projection snapshots** — `snapshots/<date>.json`; `bin/import-snapshot.mjs` +
   `bin/update.mjs snapshots`; daily via app export. Grain: player, dated. Join: sleeper_id.
   Coverage: 2026-05-19 → present. schemaVersion **2** (envelope: `targetSeason`,
   `currentSeason`, `scoringSettings`). Gate: none — registration validates shape. Consumption:
   capture-only (grading input; never re-fed to projection). Keep: the graded record of what the
   app predicted.
5. **Grading reports** — `grading/<date>.json`; `bin/grade.mjs --write`; on demand. Grain:
   snapshot-date. Coverage: on-demand set. schemaVersion 1. Consumption: banked. Keep:
   projection-quality audit trail.
6. **Enrichment overlay** — `enrichment/{coaching,scheme,injuries,notes}.json`; `bin/enrich.mjs`;
   hand-authored (the one non-script family). Grain: entry per natural key. Coverage (honest):
   coaching 95 entries; scheme/injuries/notes **0 entries** — the manual path demonstrably doesn't
   fill them (audit B5 supersedes injuries). schemaVersion 1. Gate: `validate:enrichment`.
   Consumption: app-consumed. Keep: context the APIs can't provide.
7. **nflverse rosters** — `nflverse/roster/<year>.json`; `bin/update.mjs roster [--year]`;
   Tuesday Action (current season). Source: nflverse `rosters` release, `roster_<year>.csv`.
   Grain: player-season. Join: sleeper_id (native column upstream). Coverage: **2016–2026**;
   **2012–2015 absent and documented** — upstream files exist but carry only 602–1,158 distinct
   sleeper_ids, under the shared `MIN_ROSTER_IDS` gate (see backlog slice §6 of the B1 task file).
   schemaVersion 1. Gate: `MIN_ROSTER_IDS = 1500` (cross-repo). Nulls: rows without sleeper_id
   skipped. Consumption: app-consumed (`src/api/nflRoster.js`). Keep: era-accurate team/status for
   join sanity + drill-down.
8. **nflverse draft picks** — `nflverse/draft/draft_picks.json`; `bin/update.mjs draft`; May 1
   Action. Grain: pick. Join: name/team/year (app `matchNflDraftToSleeper`). Coverage: 2010 →
   present (`MIN_DRAFT_YEAR`). schemaVersion 1. Gate: none — `validateDraft` shape checks.
   Consumption: app-consumed (`src/api/nflDraft.js`). Keep: draft-capital prior.
9. **gsis↔sleeper crosswalk** — `nflverse/playerids.json`; `bin/update.mjs playerids`; Wednesday
   Action. Source: DynastyProcess `db_playerids.csv`. Grain: player. Join: IS the join (gsis_id →
   sleeperId, forward map only). Coverage: all-history, 6,143 served of 12,467 source rows (rows
   lacking either id skipped). schemaVersion 1. Gate: `MIN_PLAYERID_ROWS = 5000` (internal).
   Consumption: **internal-only** (server-side re-key for advstats/gamelogs; no app loader).
   Keep: the id substrate every gsis-keyed ingest depends on. (Audit B6 will widen: pfr/espn maps.)
10. **nflverse advanced receiving** — `nflverse/advstats/<year>.json`;
    `bin/update.mjs advstats --year`; Thursday Action. Source: nflverse **`stats_player`** release,
    `stats_player_week_<year>.csv` (weekly rows aggregated season-level; ratios recomputed from
    components, never summed weekly). Grain: player-season (WR/TE/RB). Join: sleeper_id (re-keyed
    via crosswalk). Coverage: **2012–2025 complete** (2019/2025 filled by B1 after the frozen
    legacy-tag fix). schemaVersion 1. Gate: `MIN_ADVSTATS_ROWS = 250` (cross-repo). Nulls: ratios
    null on zero denominators; RB negatives emitted. Consumption: app-consumed
    (`src/api/advStats.js`; capture-only factors). Keep: opportunity-share truth
    (targetShare/WOPR/RACR). Path-naming: known ad-blocker-rule violation, parked.
11. **nflverse schedules** — `nflverse/schedule/<year>.json`; `bin/update.mjs schedule
    [--year|--all]`; Friday Action. Source: nfldata `games.csv`. Grain: game. Join: `gameId`, team
    abbrs (+ season-totals per-season `team`). Coverage: 1999–2026. schemaVersion 1. Gate:
    `MIN_SCHEDULE_GAMES = 200` (cross-repo). Nulls: numOrNull; temp/wind honestly null indoors.
    Consumption: app loader (`src/api/nflSchedule.js` pattern). Keep: game context (lines,
    roof/surface/weather) for every player-game join.
12. **nflverse per-game stats** — `nflverse/gamelogs/<year>.json`; `bin/update.mjs gamelogs
    [--year|--all]`; Saturday Action. Source: same `stats_player` weekly asset as advstats, mined
    per-game. Grain: player-game (QB/RB/WR/TE/FB). Join: sleeper_id. Coverage: **2012–2025
    complete** (2019/2025 filled by B1). schemaVersion 1. Gate: `MIN_PLAYERGAME_ROWS = 3000`
    (cross-repo). Nulls: omit-on-null (absent key = null, never 0); per-game rate fields verbatim,
    never summed; `fantasyPoints*` are nflverse scoring, never grading input. Consumption: app
    loader `src/api/nflGameLogs.js` — **view-only contract** (must never feed
    projection/scoring/grading). Keep: per-game drill-down grain.

Close with a short **Non-served artifacts** appendix (explicitly outside the catalog contract):
`backtests/` (analysis JSONs, no manifest entries), `raw/` (legacy one-time dumps; 252
`raw/stats-*` slated for retirement per `retire-raw-stats.md`), `ktc/quarantine/` (unregistered,
app-ignored), `ktc/last-checked.json` + `nflverse/last-checked-roster.json` (run markers).

### 5.4 Drift prevention

Three anchors, no new machinery: (1) the header's append convention line; (2) a CLAUDE.md
Done-definition step (Docs updates below) so no slice completes without its catalog row; (3) the §4
check-4 one-liner that reconciles coverage cells against `manifest.json` — cheap enough to run in
any session that touches served data. An automated reconciliation script is a possible later
nicety; explicitly out of B1 scope.

---

## 6. Roster 2012–2015 — recommended split (own backlog slice, not B1)

Recommendation: **accept documented-absent for now** (the catalog row states it plainly) and file a
separate backlog candidate rather than widening B1:

- **Slice sketch:** "Era-aware roster floor OR permanent pre-2016 absence — decide and implement."
  Options: (a) keep the single 1,500 floor → 2012–2015 permanently absent, documented (zero code);
  (b) era-keyed floor (e.g. `MIN_ROSTER_IDS_BY_ERA`) — a **cross-repo contract change**
  (`lib/nflverse.mjs:16` + app `src/api/nflRoster.js` re-assert) that must land in both repos in
  lockstep, plus a real product question: a 2012 file would cover 602 of the 1,285 app-visible 2012
  players (~47%) — is a half-coverage roster useful or misleading for join sanity?
- **Why split:** B1 is a gap-fill of *already-working* mechanisms; this needs a contract decision
  and dual-repo coordination — materially different risk class. Folding it in would balloon a
  small, safe slice.

---

## Docs updates

1. **README.md — `### nflverse/advstats/<year>.json` (lines 372-375):**
   before: "sourced from the nflverse `player_stats` weekly asset
   (`https://github.com/nflverse/nflverse-data/releases/download/player_stats/stats_player_week_<year>.csv`,
   the file `nflreadr::load_player_stats()` wraps)"
   after: "sourced from the nflverse `stats_player` weekly asset
   (`https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_<year>.csv`,
   the file `nflreadr::load_player_stats()` wraps). The legacy `player_stats` release tag is frozen
   (broken 2019 upload, no 2025+); this repo fetched it until 2026-07 — do not revert."
2. **README.md — `### nflverse/gamelogs/<year>.json` (lines 444-446):** change "in the nflverse
   `player_stats` release" → "in the nflverse `stats_player` release" (keep the "same CSV the
   `advstats` ingest already fetches" phrasing).
3. **README.md — Folder structure (after line 26 `manifest.json …`):** add
   `  data-catalog.md             — Living dataset index: one section per served family (see Done-definition)`.
4. **README.md — "Why this repo exists" (§ line 11, end of section):** add one sentence:
   "`data-catalog.md` is the index of every served family — grain, coverage, joins, gates, and
   honest gaps."
5. **CLAUDE.md — Navigation map:** add row
   `| data-catalog.md | Living dataset index — one section per served family (path/source/grain/join/coverage/gate); every ingest slice updates its row (Done-definition) |`.
6. **CLAUDE.md — Done-definition:** add step: "5. For any change that adds a served family or
   alters a family's coverage/schema/gate, update its `data-catalog.md` row in the same change."
7. **CLAUDE.md — Self-maintenance (first paragraph):** after the sentence flagging
   `docs/signal-registry.md`, append: "The same trigger updates the family's row in
   `data-catalog.md` (this repo — storage registry)."
8. **Do NOT retro-edit** `.claude/tasks/backtest-cohort-fix.md` §6 (stale `--force` runbook) or
   the audit's B1 row — task files are session artifacts; this file supersedes their 2019/2025
   conclusions.

Comment-only source-doc edits (JSDoc headers) are itemized as Edits B/C/E in §2, not repeated here.

---

## Tests to add

No new automated test files: the `node --test` suite is fixture-based against the parsers, and B1
changes no parser (one URL constant + a dry-run/force reorder that the suite doesn't exercise —
verified by grep for `STATS_BASE`/`player_stats` in `test/`). Coverage is smoke + a manual
checklist (this repo's convention; NOT Vitest):

1. `npm test` after §2 edits — expect green, unchanged.
2. `npm run smoke` after §2 edits (pre-fill) AND after the fills (post-fill) — expect green both
   times. Known wording change: advstats/gamelogs 2023 dry-runs may print
   "would write … (needs --force …)" instead of "Content identical" (§3 step 3). Edge case this
   specifically proves: the Edit-D reorder keeps the advstats dry-run from throwing on
   content-drift of an existing past season.
3. `npm run validate:enrichment` — untouched by B1, but part of done-definition; expect green.
4. Fill validation (§4 checklist): per-family gates (2019+2025 advstats ≥ 250; 2019+2025 gamelogs
   ≥ 3,000; roster 2016–2023 ≥ 1,500), manifest entries, append-only git check, Michael Thomas
   2019 spot check.
5. Edge cases, explicitly:
   - **2019 fills validate** (both families) — the previously "permanent" gap closes with real
     upstream data, not fabrication.
   - **2025 filled without `--force`** — no forced write occurred; if the owner vetoes 2025 (§0
     deviation note), instead verify both 2025 files are absent AND the catalog documents why.
   - **roster 2012–2015 correctly untouched** — `roster --year 2015 --dry-run` logs the
     ≥-1,500 refusal and exits 0; no files, no manifest entries.
   - **Catalog rows match manifest** — §4 check-4 one-liner output equals the catalog coverage
     cells (advstats 2012–2025, gamelogs 2012–2025, roster 2016–2026, no gaps).

---

## Cross-repo impact

- **Gap fills: additive, no app change required.** The app loaders (`src/api/advStats.js`,
  `src/api/nflGameLogs.js`, `src/api/nflRoster.js`) probe per-year via
  `tryDataStore`/`getManifestEntry`; a missing year yields the graceful empty shape, a present year
  yields data. New files ship schemaVersion 1 and rowCounts above the shared `MIN_*` constants, so
  every existing gate passes. No constant, shape, or schemaVersion changes.
- **Source-tag switch: internal.** Server-side fetch URL only; served shapes and all Cross-repo
  contract rows unchanged. No app counterpart.
- **Signal registry (app repo `docs/signal-registry.md`):** per CLAUDE.md Self-maintenance, the
  Session-2 task summary must flag coverage changes so the app repo updates its rows — advstats
  + gamelogs coverage becomes 2012–2025 (2019/2025 added), roster becomes 2016–2026 (2016–2023
  added, 2012–2015 documented-absent). Docs-only; no app code.
- **data-catalog.md ↔ signal-registry:** the catalog links to the app doc; an optional back-link
  from the app doc can ride along with the signal-registry row update. Nothing else crosses.
