# Docs-drift reconcile — findings (Session 1)

**Status:** findings written 2026-07-04. Planning only — NO doc or source edits happened; Session 2
applies the list below mechanically.
**Method:** docs read = CLAUDE.md, README.md, data-catalog.md, manifest.json. Source read = only
files surfaced by `git log --name-only -20` (b705176 … c0c87d8, 2026-06-21 → 2026-07-03) **plus the
uncommitted B1 working tree** (`git status`: M lib/nflverse.mjs, M scripts/update-advstats.mjs,
M scripts/update-gamelogs.mjs, A data-catalog.md, A 13 data files, UU manifest.json) — the working
tree is the live source the docs must match.
**Not audited (sources not in the log):** README's Enrichment entry-schema, Grading harness, and
Analysis/Backtesting sections; `bin/grade.mjs`/`lib/grade.mjs`/`bin/backtest.mjs`/`bin/enrich.mjs`
and their docs claims. No findings are asserted there either way.

---

## ⚠️ Repo-state precondition (blocks one finding, Session 2 must handle first)

`manifest.json` and `nflverse/last-checked-roster.json` are in **unresolved merge-conflict state**
(`git status` shows `UU`; markers `<<<<<<< HEAD` / `>>>>>>> c9c6c5e (feat: data gapfill and catalog
ingest)` at manifest.json:804/810/882 and 888/890/892). `JSON.parse(manifest.json)` fails. The B1
branch (`c9c6c5e`) was based on a ~2026-06-28 checkout; HEAD gained three Action commits it lacks:
`ktc/snapshot-2026-06-29.json` (b9633a3), `nflverse/playerids.json` recordCount **6146** (b1e7426,
2026-07-01), `nflverse/schedule/2026.json` lastModified 2026-07-03 (b705176).

**Resolution is a union** (verified by parsing both sides via `git show :2:` / `:3:`):
keep HEAD's three newer entries AND the B1 side's 13 new entries
(advstats/gamelogs 2019+2025, roster 2016–2023); keep the newer (B1) top-level `generatedAt`;
for `nflverse/last-checked-roster.json` keep either side (run marker — next Tuesday Action
overwrites it). Neither side's data files conflict — only the manifest index and the marker.
This is repo state, not doc drift, but finding D1 cannot be verified until it is resolved.

---

## CLAUDE.md

**C1 — CHANGE:** § Navigation map, `bin/update.mjs` row —
from `| bin/update.mjs | CLI dispatcher → nfl / cfbd / ktc / snapshots subcommands |`
to `| bin/update.mjs | CLI dispatcher → nfl / cfbd / ktc / snapshots / roster / draft / playerids / advstats / schedule / gamelogs subcommands |`
— proof: `bin/update.mjs` dispatch `switch (subcommand)` at line 133 with cases through
`case 'gamelogs'` at line 161; the six missing subcommands landed in commits 40bcf33, c272d44,
f588ec5 (all touched bin/update.mjs) but the row was never widened.

**C2 — CHANGE:** § Commands, Update CLI flags comment —
from `#   --force      overwrite completed-season files (nfl/cfbd/roster/advstats/gamelogs)`
to `#   --force      overwrite completed-season files (nfl/cfbd/roster/advstats/schedule/gamelogs)`
— proof: `scripts/update-schedule.mjs:93-94` throws "Use --force to overwrite" for existing
completed past seasons (module header line 16 states it); README's own force example block already
shows `schedule --year 2023 --force` (README line 678).

**C3 — CHANGE:** § Invariants, Invariant 5 second paragraph —
from "**nflverse roster/draft/playerids/advstats are script-produced primary data and must never be
hand-edited.**" … "Roster/draft/playerids/advstats files are registered **`inProgress: false`** even
while the current-season file mutates"
to "**nflverse roster/draft/playerids/advstats/schedule/gamelogs are script-produced primary data
and must never be hand-edited.**" … "Roster/draft/playerids/advstats/schedule/gamelogs files are
registered **`inProgress: false`** even while the current-season file mutates"
— proof: `scripts/update-schedule.mjs:104` and `scripts/update-gamelogs.mjs:164` both register
`inProgress: false` primary data; README §gamelogs (line 509) even cites "deliberate deviation
(CLAUDE.md Invariant 5)" for gamelogs, but the invariant's own family list predates both families
(schedule landed c272d44, gamelogs f588ec5).

**C4 — CHANGE:** § Invariants, Invariant 1 —
from "Files with `inProgress: true` in manifest.json are in-season and may be re-exported."
to "Files with `inProgress: true` in manifest.json are in-season and may be re-exported (exception:
KTC snapshots always register `inProgress: true` as a 'current-value' marker yet remain append-only
and are never re-exported — see Invariant 5)."
— proof: `scripts/update-ktc.mjs:212` — `inProgress: true, // KTC snapshot is always "current
value" data`; all five `ktc/snapshot-*.json` manifest entries carry `inProgress: true` (HEAD side,
`git show :2:manifest.json`). The code behavior is deliberate and no doc records it; as written,
Invariant 1 misclassifies every KTC snapshot as re-exportable.

**C5 — CHANGE:** § Self-maintenance, first paragraph —
from "…data source (`nfl`/`cfbd`/`ktc`/`roster`/`draft`/`advstats`/`playerids`/`schedule`/`enrichment`), flag the canonical signal registry…"
to "…data source (`nfl`/`cfbd`/`ktc`/`roster`/`draft`/`advstats`/`playerids`/`schedule`/`gamelogs`/`enrichment`), flag the canonical signal registry…"
— proof: gamelogs is an ingested data source with historical coverage
(`scripts/update-gamelogs.mjs`, subcommand at `bin/update.mjs:161`, landed f588ec5) — exactly the
kind of coverage change this paragraph exists to catch (B1 just altered its coverage), yet the
trigger list omits it.

**C6 — CHANGE:** § Navigation map, `nflverse/playerids.json` row —
from "— **internal-only**: consumed server-side by `scripts/update-advstats.mjs`, not by the app directly"
to "— **internal-only**: consumed server-side by `scripts/update-advstats.mjs` and `scripts/update-gamelogs.mjs`, not by the app directly"
— proof: `scripts/update-gamelogs.mjs:65` — `const cw = readJson('nflverse/playerids.json');`
(crosswalk read landed with gamelogs, f588ec5).

**C7 — CHANGE:** § Cross-repo contracts, trailing note below the table —
from "consumed server-side by `scripts/update-advstats.mjs` to re-key advanced stats"
to "consumed server-side by `scripts/update-advstats.mjs` and `scripts/update-gamelogs.mjs` to
re-key gsis-keyed stats"
— proof: same as C6 (`scripts/update-gamelogs.mjs:65` + `rekeyGameLogsBySleeper` call at line 102).

Verified accurate in CLAUDE.md (no edits): the B1 doc edits are correctly applied — Navigation-map
`data-catalog.md` row, Done-definition step 5, Self-maintenance catalog sentence; the Smoke &
validation description matches `package.json:14`; Invariant 8 (CDN purge) correctly lists all four
season-keyed families incl. gamelogs; the advstats/gamelogs/schedule Cross-repo contract rows match
the served shapes in `scripts/update-{advstats,gamelogs,schedule}.mjs`; the `lib/nflverse.mjs`
nav-row export list matches the module's exports.

---

## README.md

**R1 — CHANGE:** § header (line 7) —
from `**Last updated:** 2026-05-18`
to `**Last updated:** 2026-07-03`
— proof: README itself was modified in commits eb2ee2d/1d1b748 (06-21), c272d44 (06-22),
5e3fc6f (06-26), 610a539 (06-27), f588ec5 (06-28) and by the uncommitted B1 edits (07-03); the
header has drifted through all of them. (Alternative: REMOVE the line — a self-dating header
re-drifts by construction; Session 2 may pick either, default = CHANGE.)

**R2 — CHANGE:** § intro (line 5) —
from "This repo holds serialised snapshots of data fetched from the Sleeper, KeepTradeCut, and
College Football Data (CFBD) APIs. The data is exported from the app's IndexedDB cache and
committed here so it can be loaded as static JSON over CDN, reducing API traffic and enabling
historical comparisons across seasons."
to "This repo holds serialised data from the Sleeper, KeepTradeCut, and College Football Data
(CFBD) APIs plus nflverse/DynastyProcess/nfldata release assets. Most families are fetched
server-side by this repo's own ingest scripts (`bin/update.mjs`); projection snapshots are exported
from the app's IndexedDB cache. Everything is committed as static JSON served over CDN, reducing
API traffic and enabling historical comparisons across seasons."
— proof: six of the twelve served families never pass through the app or IndexedDB —
`lib/nflverse.mjs` module header ("All network calls use Node native fetch (no CORS constraints
server-side)") and `scripts/update-{roster,draft,playerids,advstats,schedule,gamelogs}.mjs` (all in
the log); README's own family sections say "CORS-blocked in the browser; ingest runs server-side"
(lines 286, 339, 380-381, 530), contradicting this intro.

**R3 — CHANGE:** § Why this repo exists, first sentence (line 13) —
from "The app fetches data from three external APIs and caches it in the browser's IndexedDB."
to "The app fetches Sleeper/CFBD/KTC data and caches it in the browser's IndexedDB; the nflverse
families are ingested directly by this repo (never by the app)."
— proof: same as R2.

**R4 — CHANGE:** § Folder structure, `raw/` comment (lines 62-63) —
from "raw/                        — Everything else exported from IndexedDB
                                (league data, player map, weekly stats, etc.)"
to "raw/                        — Everything else exported from IndexedDB
                                (league data, player map, CFBD player manifests, etc.)"
— proof: the 252 `raw/stats-*.json` weekly dumps were deleted in commit eb2ee2d ("Retire
raw/stats-*.json weekly dumps"); `ls raw/` today shows 14 files, none weekly-stats; the
§`raw/<name>.json` schema section (line 567) already describes the post-retirement set without
"weekly stats" — the tree comment lags it.

**R5 — CHANGE:** § Update scripts → Subcommands, force comment (line 674) —
from `# Force overwrite of a completed-season file (nfl/cfbd/roster/advstats/gamelogs)`
to `# Force overwrite of a completed-season file (nfl/cfbd/roster/advstats/schedule/gamelogs)`
— proof: same as C2 (`scripts/update-schedule.mjs:93-94`); the example four lines below (line 678)
already runs `schedule --year 2023 --force`, contradicting the list above it.

**R6 — CHANGE:** § Update scripts → Smoke test (line 696) —
from "Runs dry-run checks for nfl/cfbd/ktc/roster/draft/playerids/advstats/schedule/gamelogs (no
writes), validates enrichment, and runs the grade self-test. Used by the smoke-test CI workflow on
pull requests."
to "Runs dry-run checks for nfl/cfbd/ktc/roster/draft/playerids/advstats/schedule/gamelogs (no
writes), validates enrichment, and runs the grade self-test. The smoke-test CI workflow runs a
subset on pull requests (`npm test` + nfl/cfbd/ktc/playerids/advstats/gamelogs dry-runs +
enrichment validation), not `npm run smoke` itself."
— proof: `.github/workflows/smoke-test.yml:32-56` runs `npm ci`, `npm test`, six individual
dry-runs (no roster/draft/schedule), and `bin/enrich.mjs validate` — it never invokes
`npm run smoke` and never runs the grade self-test, so "Used by the smoke-test CI workflow" is
false as written. (The Actions-table row at line 709 describes the workflow correctly; only this
sentence is wrong.)

**R7 — CHANGE:** § Update scripts → GitHub Actions, season-keyed purge note (line 713) —
from "*Season-keyed purges (roster, advstats, schedule) derive the file's NFL season …*"
to "*Season-keyed purges (roster, advstats, schedule, gamelogs) derive the file's NFL season …*"
— proof: `.github/workflows/nflverse-gamelogs.yml:43-51` purges
`nflverse/gamelogs/${SEASON}.json` from `steps.fetch.outputs.season`, fed by
`scripts/update-gamelogs.mjs:83` (`setStepOutput('season', seasons[0])`); CLAUDE.md Invariant 8
already lists gamelogs — README is behind it.

**R8 — CHANGE:** § `manifest.json` shape, field table `files[*].inProgress` row (line 604) —
from "`true` if this season/snapshot may still receive updates; `false` if completed"
to "`true` if this season/snapshot may still receive updates; `false` if completed. Exception: KTC
snapshots always register `true` (dated 'current-value' marker) despite being permanent"
— proof: same as C4 (`scripts/update-ktc.mjs:212`; all `ktc/` manifest entries `inProgress: true`).

Verified accurate in README.md (no edits): the B1 edits are correctly applied — §advstats source
paragraph (`stats_player` URL + frozen-legacy-tag warning, lines 376-380), §gamelogs source
sentence (`stats_player` release, lines 449-451), folder-structure `data-catalog.md` line (30), the
"Why this repo exists" catalog pointer (lines 20-21). Also checked and accurate: §season-totals
(team normalization, weeklyStatus, snap/RZ era — matches 5e3fc6f's lib/sleeper.mjs/update-nfl.mjs),
§KTC integrity guards (250–600 count, 0–9999 int, ρ=0.90 quarantine — matches lib/validate.mjs:
242-265 and update-ktc.mjs:59,158-173), §schedule, §roster, §playerids, §draft sections, the
Actions table (all seven cadence rows + smoke-test.yml row), and the Subcommands/dry-run blocks.

---

## data-catalog.md

**D1 — CHANGE:** § Catalog-vs-manifest reconcile, the "Current output" claim —
from "Current output (2026-07-03), matching the coverage cells above verbatim:" (+ the fenced
output block + header line "_Last reconciled against manifest.json: 2026-07-03_")
to: re-run the one-liner **after resolving the manifest merge conflict** (see precondition above)
and refresh both the output block and the "_Last reconciled_" date to the rerun date.
— proof: `manifest.json` currently fails `JSON.parse` (conflict markers at lines 804/810/882,
888/890/892), so the documented one-liner cannot produce this output today; the claim is
unverifiable as written. The expected post-resolution output is unchanged (advstats 2012–2025,
gamelogs 2012–2025, roster 2016–2026 — verified by parsing the B1 side via
`git show :3:manifest.json`), so the coverage **cells** need no edit — only re-verification and a
fresh date.

**D2 — CHANGE:** § gsis↔sleeper crosswalk, Coverage line —
from "all-history, 6,143 served of 12,467 source rows (rows lacking either id skipped)"
to "all-history; ~6.1k of ~12.5k source rows served (rows lacking either id skipped); exact count =
manifest `recordCount`, refreshed by the Wednesday Action"
— proof: HEAD manifest (`git show :2:manifest.json`) has `nflverse/playerids.json` recordCount
**6146** (lastModified 2026-07-01, commit b1e7426) — the hardcoded 6,143 was stale within days of
being written because the Wednesday Action mutates it weekly (README lines 369-370); an approximate
figure + manifest pointer is the drift-proof form.

**D3 — CHANGE:** § Non-served artifacts, `ktc/quarantine/` bullet —
from "script-produced when a KTC scrape trips the Spearman ordering guard; unregistered,
app-ignored; currently empty (no quarantined scrape on disk)"
to "script-produced when a KTC scrape trips the Spearman ordering guard; unregistered, app-ignored;
does not exist yet — created on demand by `scripts/update-ktc.mjs` on the first guard trip (no
scrape has been quarantined)"
— proof: `ls ktc/quarantine/` → "No such file or directory"; `scripts/update-ktc.mjs:159-161`
writes `ktc/quarantine/snapshot-<date>.json` + `.reason.json` via `writeJsonStable` only when the
guard trips. "Currently empty" implies an existing directory; none exists.

**D4 — ADD:** § KTC dynasty values, after the "Sparsity gate" line, insert —
"- **Manifest registration:** every snapshot registers `inProgress: true` (deliberate
'current-value' marker — `scripts/update-ktc.mjs`); snapshots remain append-only and permanent
regardless (the marker does not mean re-exportable)."
— proof: same as C4/R8 (`scripts/update-ktc.mjs:212`; all five `ktc/` manifest entries). The
catalog documents per-family manifest conventions for every other family (roster/advstats/gamelogs
inProgress:false is covered via CLAUDE.md Invariant 5) but is silent on KTC's deliberate deviation.

Verified accurate in data-catalog.md (no edits): the B1 provenance note and both provenance-split
paragraphs match the live `lib/nflverse.mjs` diff (STATS_BASE at line 57 now `stats_player`, with
the do-not-revert comment); the advstats/gamelogs/roster coverage cells match the B1 manifest side;
the KTC row's gate values match `lib/validate.mjs:242-265` and `KTC_ORDERING_THRESHOLD = 0.90`
(`scripts/update-ktc.mjs:59`); the `raw/` "14 files" count matches disk; the season-totals, CFBD,
draft, schedule, snapshots, grading, and enrichment rows match their sources as read.

---

## Out-of-scope observations (NOT doc edits — for awareness only)

1. **Unresolved merge conflict** in `manifest.json` + `nflverse/last-checked-roster.json` (see
   precondition). Until resolved, the manifest is unparseable — this also blocks any app fetch of a
   committed manifest if pushed as-is. Resolve before applying D1.
2. `bin/update.mjs` `printHelp()` OPTIONS text has the same stale enumerations as C2 (its `--force`
   line omits schedule; its `--year` line says "nfl, cfbd, roster subcommands" omitting
   advstats/schedule/gamelogs; its `--all` line says "schedule subcommand only" omitting gamelogs —
   contradicted by its own SUBCOMMANDS list and `scripts/update-gamelogs.mjs:48`). Code help-text,
   not a doc file — out of this task's output scope.
3. CLAUDE.md has two invariants numbered **8** (CDN purge; grading reads) — a numbering defect, not
   code drift, so no finding; flag for whoever next edits that section.
4. `.github/workflows/smoke-test.yml` runs no roster/draft/schedule dry-runs and no grade
   self-test — a CI-coverage gap vs `npm run smoke` (package.json:14), surfaced while verifying R6.
   Workflow change = code, out of scope here.
