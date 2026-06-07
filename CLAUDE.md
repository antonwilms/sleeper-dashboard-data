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

# Flags (any subcommand):
#   --dry-run    fetch + validate, no writes
#   --force      overwrite completed-season files (nfl/cfbd only)
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

### Smoke & validation

```sh
npm run smoke               # dry-run nfl+cfbd+ktc for 2023, validate:enrichment, grade --self-test
npm run validate:enrichment # alias for: node bin/enrich.mjs validate
```

---

## Navigation map

| Path | Purpose |
|---|---|
| `bin/update.mjs` | CLI dispatcher → nfl / cfbd / ktc / snapshots subcommands |
| `bin/enrich.mjs` | Enrichment overlay CLI → add / validate / list / remove |
| `bin/import-snapshot.mjs` | One-command projection-snapshot import: ~/Downloads ZIP → snapshots/ → manifest → commit + push |
| `lib/validate.mjs` | Schema validators; contains `NFL_SENTINELS` and `KTC_TOP_QB_SENTINELS` |
| `lib/cfbd.mjs` | CFBD API fetch helpers |
| `lib/enrichment.mjs` | Enrichment schema validation helpers |
| `lib/io.mjs` | File I/O utilities |
| `lib/ktc.mjs` | KTC scraper helpers |
| `lib/manifest.mjs` | manifest.json read/write helpers |
| `lib/sleeper.mjs` | Sleeper API fetch helpers |
| `scripts/update-nfl.mjs` | NFL season-totals update logic |
| `scripts/update-cfbd.mjs` | CFBD college stats update logic |
| `scripts/update-ktc.mjs` | KTC snapshot capture logic |
| `scripts/register-snapshots.mjs` | Snapshot manifest registration |
| `scripts/grade-snapshot.mjs` | Snapshot adapter — loads snapshot + outcomes, builds GradeInput, orchestrates `gradeSnapshot()`, `runSelfTest()`, `formatHumanReport()` |
| `scripts/update-enrichment.mjs` | Enrichment upsert/validate/remove logic |
| `bin/grade.mjs` | Grading harness CLI — parses flags, dispatches to `gradeSnapshot()` or `runSelfTest()` |
| `lib/grade.mjs` | Pure scorer — `mae`, `bias`, `pearson`, `scoreProjections`; source-agnostic `GradeInput → GradeReport`; no I/O |
| `nfl/season-totals/` | NFL per-season aggregate files (schemaVersion 2) |
| `college/passing/` | CFBD passing stats, one file per year |
| `college/receiving/` | CFBD receiving stats, one file per year |
| `college/rushing/` | CFBD rushing stats, one file per year |
| `ktc/` | KTC dynasty value snapshots (schemaVersion 1) |
| `enrichment/` | Hand-authored overlay: coaching.json, scheme.json, injuries.json, notes.json |
| `snapshots/` | Projection snapshots imported from the app export ZIP, keyed by UTC date (see [snapshot-workflow.md](snapshot-workflow.md)) |
| `grading/` | Grading reports written by `bin/grade.mjs --write`, one JSON per snapshot date |
| `raw/` | Unprocessed Sleeper API responses and CFBD player manifests |
| `manifest.json` | Index of every script-written file with metadata |
| `.github/workflows/weekly-ktc.yml` | Weekly KTC snapshot automation |
| `.github/workflows/smoke-test.yml` | Smoke test CI |

---

## Invariants

1. **Append-only for historical data.** Completed past seasons are never overwritten except to correct an error (requires a committed diff explaining why). Files with `inProgress: true` in manifest.json are in-season and may be re-exported.

2. **Never hand-edit primary data files** (`nfl/`, `college/`, `ktc/`, `snapshots/`). They are script-produced. Only `enrichment/` is hand-authored, and only via `bin/enrich.mjs`—direct JSON edits bypass validation.

3. **manifest.json is the index.** Every script-written file must be registered with `recordCount`, `schemaVersion`, `lastModified`, and `inProgress` maintained. Treat manifest field names as a public API (see Cross-repo contracts).

4. **schemaVersion discipline.** NFL season-totals are at v2 (Phase 5). KTC snapshots are at v1. Bump `schemaVersion` only on an incompatible layout change and keep it in sync with the app's `MAX_SUPPORTED_SCHEMA`.

5. **Snapshots are permanent.** Keyed by UTC date; never overwritten within a day (first-league-of-the-day-wins). KTC snapshots are append-only with content-hash dedup—no commit when content is unchanged.

6. **Enrichment schemas are contracts.** Each file has required fields per entry. `injuries.segmentStartWeek` must match an absence segment in the matching season-totals file. `add` is an upsert keyed by natural key. Orphaned entries (no matching season-totals player/team) are flagged by `validate`; the app silently ignores them.

7. **Yearly maintenance.** At each season start, update `NFL_SENTINELS` and `KTC_TOP_QB_SENTINELS` in `lib/validate.mjs` to reflect the current player landscape.

8. **Grading reads are never recomputed.** `bin/grade.mjs` joins captured projections to captured outcomes — it never re-runs the projection pipeline. The GradeReport is fully determined by the snapshot and outcome files at read time.

---

## Cross-repo contracts (with sleeper-dashboard)

This repo cannot edit the app. Any change affecting these must be called out in the task summary so the sibling repo can be updated to match.

| Contract | This repo | App counterpart |
|---|---|---|
| **Snapshot shape** | `snapshots/<date>.json` imported via `node bin/update.mjs snapshots`; `projection` field is verbatim `computeNextSeasonProjection` output | `src/utils/projectionSnapshot.js` (writer); `exportData.js` `classifyKey` (router) |
| **season-totals schemaVersion** | Writes v2 | `src/api/dataStore.js` advertises `MAX_SUPPORTED_SCHEMA=2`; bumping needs both repos |
| **Enrichment schemas** | Writes/validates `enrichment/*.json` | `src/api/enrichment.js` (`loadEnrichment`); `src/utils/enrichmentLookup.js`; field add/rename must be mirrored |
| **Manifest contract** | manifest.json field names/shape | `dataStore.js` `getManifestEntry` / validators gate on `schemaVersion`, `inProgress`, `lastModified` |
| **CFBD statType keys** | Row per `statType`; confirmed sets per category stored here | App pivots via `pivotStatRows`; statType set is a shared contract |
| **Snap & RZ usage stat keys** | `off_snp`, `tm_off_snp`, `rec_rz_tgt`, `rush_rz_att`, `pass_rz_att` aggregated from Sleeper stats response and preserved as-is in `nfl/season-totals/<year>.json`; never stripped or filtered in any schema operation | `src/utils/usageMetrics.js` reads these fields; projection degrades silently to neutral if absent, so the dependency is invisible at runtime — do not remove or rename |
| **`pass_cmp` stat key (QB passer rating)** | Preserved through season-totals aggregation; never stripped (flows through the generic sum-all-keys path in `lib/sleeper.mjs`). Note: stored `pass_rtg` and `cmp_pct` fields are weekly sums (not reliable season-level metrics) and are NOT consumed by the app — preserve as-is, no action needed | `src/utils/efficiencyMetrics.js` computes canonical NFL passer rating from `pass_cmp`, `pass_att`, `pass_yd`, `pass_td`, `pass_int`; `pass_cmp` is the new dependency (the latter four were previously implicit). Missing `pass_cmp` produces neutral `efficiencyFactor` (1.0); no errors, no schema bump required |
| **`rec_air_yd` stat key (aDOT diagnostic)** | Preserved through season-totals aggregation; never stripped (same generic sum-all-keys path in `lib/sleeper.mjs`). Confirmed present 2012–present. Calibration note: values run ~½ industry aDOT magnitude (likely air yards on completed receptions only, not all targets) — ranking is preserved, absolute magnitude is not industry-standard; this is the app's concern, not the data repo's | `src/utils/seasonProjection.js` reads `rec_air_yd` and `rec_tgt` to compute `factors.adot` (WR/TE capture-only diagnostic; does **not** affect `projectedPPG`). Missing `rec_air_yd` produces `factors.adot: null`; no errors, no schema bump required (aDOT batch) |
| **Snapshot target season** | `capturedAt` ISO timestamp in `snapshots/<date>.json`; `deriveTargetSeason()` in `scripts/grade-snapshot.mjs` maps Jan–Aug → same year, Sep–Dec → year+1 (override: `--target-season YYYY`) | Capturing the league's raw `scoringSettings` in the snapshot is **needed** for in-basis grading of non-half_ppr leagues (all current snapshots are custom-basis); without it, PPG MAE/bias conflates basis offset with projection error |

---

## Sibling repo

`sleeper-dashboard` is the React app that consumes this repo's files and produces the snapshots imported here. Its README documents the projection pipeline and data-store consumption. See Cross-repo contracts above.

---

## Done-definition

Before reporting a task complete:
1. Run `npm run smoke` — fix any red.
2. For enrichment changes, run `npm run validate:enrichment` — fix any red.
3. For any change touching a data file, confirm `manifest.json` is updated.

---

## Self-maintenance

Keep this file current as part of every task's done-definition. If a change adds/renames a `bin/` subcommand, a `package.json` script, a data folder, a manifest field, or an enrichment/snapshot schema, update the relevant section in the same change. If a change affects a Cross-repo contract, state that explicitly in your task summary so the sibling repo can be updated to match.

Keep this file thin — a navigation-and-rules layer, not a second README; push deep detail into README.md and link to it.
