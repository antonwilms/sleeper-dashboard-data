# Codebase review — sleeper-dashboard-data (read-only audit)

**Date:** 2026-06-20 · **Scope:** ingest scripts, grading harness, manifest, enrichment, CI/workflows, cross-repo contracts.
**Method:** read live source for every `bin/`, `lib/`, `scripts/` file + all 6 workflows + manifest/enrichment data. Ran `npm test` (154 pass), `grade --self-test` (pass), `enrich validate` (clean). No source files edited.

**Bottom line:** the codebase is in good shape — the rate-aggregation hazard the brief called out is *contained by design* (see "Confirmed clean" §A), no orphaned backfill scripts exist, and the cross-repo scoring port is faithful. The real exposure is (1) the keystone aggregator has **zero direct test coverage**, (2) two write paths use **weak idempotency proxies** that can silently skip legitimate re-writes, and (3) several **CDN/CI inconsistencies** around the KTC path and the smoke surface.

Ranked ruthlessly; low-confidence items omitted. Effort: S ≈ <1h, M ≈ a few hours, L ≈ day+.

---

## HIGH

### H1 — `aggregateWeeks` / `computeAvailability` have no unit tests
- **Location:** `lib/sleeper.mjs:117` (`aggregateWeeks`), `lib/sleeper.mjs:213` (`computeAvailability`)
- **Category:** smoke-gap
- **Description:** The single most correctness-critical function in the repo — it produces `nfl/season-totals/<year>.json` (primary served data **and** the grading-outcomes basis) — has no direct test. Its bye-vs-DNP disambiguation, duplicate-entry dedup, `weeklyStatus` array, and absence-segment grouping are exercised only indirectly through `validate-finiteness.test.mjs`, which feeds the *validator* synthetic fixtures and never calls the aggregator. A regression here silently corrupts the repo's most important data and CI stays green.
- **Recommended action:** Add `test/sleeper.test.mjs` with table-driven cases: gp=1/0 split, bye (team absent that week) vs DNP (team present), the documented duplicate-player collapse, pre-2021 week-18 `X`, and `computeAvailability` segment/`returnedFromAbsence`/`longestAbsence` edges. Wire into `npm test` (already runs in CI).
- **Effort:** M

### H2 — NFL idempotency compares only `fantasyPoints`, can skip legitimate re-writes
- **Location:** `scripts/update-nfl.mjs:50` → `lib/io.mjs:56` (`diffSummary`)
- **Category:** correctness
- **Description:** `diffSummary` flags a player as "changed" only when `|Δ fantasyPoints| > 0.01` (plus add/remove of whole players). `update-nfl` treats `identical:true` as "skip write." So a re-fetch that revises **points-neutral but app-consumed** fields — `off_snp`/`tm_off_snp`/`rec_rz_tgt` (usage factors), `gamesStarted`, `weeklyStatus` D↔B, or a yardage reclassification that nets the same half-PPR — is silently **not republished**. Those snap/RZ keys are a live cross-repo contract (CLAUDE.md "Snap & RZ usage stat keys"; `usageMetrics.js`). Unlike roster/draft/playerids/advstats (full SHA-256 content hash), nfl uses this weak proxy. Reachable on any manual in-season re-run / correction.
- **Recommended action:** Gate the write on a full content hash of the aggregated object (mirror `playersHash` in `update-advstats.mjs`), keeping `diffSummary` only for the human-readable diff print. Don't let a points-equal diff short-circuit the write.
- **Effort:** S

---

## MEDIUM

### M1 — CFBD idempotency compares only row **count**
- **Location:** `scripts/update-cfbd.mjs:53` (`existing.length === rows.length`)
- **Category:** correctness
- **Description:** Same class as H2, weaker still: a stat correction or player reclassification that leaves the row count unchanged is treated as "skipping" and never written — even with `--force`, because the skip happens before the force gate. CFBD is mostly append-only so probability is lower than H2, but a genuine upstream correction with equal row count is undetectable.
- **Recommended action:** Compare a content hash (or at least a stable serialization) of the row array, not just `.length`. Move the equality check after, or fold it into, the force gate.
- **Effort:** S

### M2 — `weekly-ktc.yml` never purges the jsDelivr CDN
- **Location:** `.github/workflows/weekly-ktc.yml` (Commit step, ~lines 31-39)
- **Category:** contract-drift (manifest freshness)
- **Description:** The KTC workflow commits an updated `manifest.json` (the app's discovery index for new snapshots) but, unlike all four nflverse workflows, has **no `purge.jsdelivr.net` step**. After each weekly snapshot the app keeps reading the stale cached manifest until jsDelivr's TTL expires, so the new `ktc/snapshot-<date>.json` is invisible to consumers for that window. Recurring on every KTC change.
- **Recommended action:** Add the same best-effort purge block the other workflows use — at minimum `manifest.json` and the new `ktc/snapshot-<date>.json`.
- **Effort:** S

### M3 — Roster/advstats CDN purge uses calendar year, not NFL season
- **Location:** `.github/workflows/weekly-nflverse-roster.yml:42-43` and `.github/workflows/nflverse-advstats.yml` (purge step), `YEAR=$(date -u +%Y)`
- **Category:** correctness (cache invalidation)
- **Description:** The data files are keyed by the **NFL season** from `fetchCurrentNflSeason()` (Sleeper's `state.nfl.season`, which rolls over ~March), but the purge URL is built from `date +%Y` (calendar year). In the Jan–Feb window these diverge: the job writes `…/roster/2026.json` while purging `…/roster/2027.json`, so the file that actually changed is never purged (manifest still is). The Tuesday roster job runs year-round, so this is a real seasonal mismatch; partially masked only if the app cache-busts off `manifest.lastModified`.
- **Recommended action:** Have the update script emit the resolved season (e.g. write it to the last-checked marker or stdout) and build the purge path from that, instead of `date +%Y`.
- **Effort:** M

### M4 — Enrichment validation has zero CI coverage
- **Location:** `lib/enrichment.mjs` (`validateAll`/`validateEntry`/`addEntry`); `.github/workflows/smoke-test.yml`
- **Category:** smoke-gap
- **Description:** `validate:enrichment` is in `npm run smoke` but is **not** a step in `smoke-test.yml`, and there is **no enrichment unit test** (no `test/enrichment.*`). So nothing in CI checks enrichment shape, duplicate keys, role enum, team validity, or injury-segment orphaning. Compounding it, the smoke workflow's `paths:` filter doesn't include `enrichment/**`, so editing those files doesn't even trigger CI. (Also note CI smoke has drifted from `npm run smoke` generally: it omits `roster`/`draft` dry-runs and `grade --self-test`; the grade scorer and nflverse parsers are still covered by `npm test`, but the enrichment path is the genuine hole.) Today's data is clean — coaching 95 entries valid, scheme/injuries/notes empty — so this is latent, not active.
- **Recommended action:** Add a `node bin/enrich.mjs validate` step to `smoke-test.yml` (and/or a small `test/enrichment.test.mjs` covering `validateAll` duplicate-id, bad-team, and injury-orphan cases). Optionally re-sync the CI steps with `npm run smoke`.
- **Effort:** S

---

## LOW

### L1 — `raw/stats-*.json` (252 files) have no in-repo reader
- **Location:** `raw/stats-<year>-<week>.json` (252 of 398 tracked files ≈ 63% of the repo); registered in `manifest.json`
- **Category:** obsolete (candidate — needs app-repo confirmation)
- **Description:** These frozen weekly Sleeper dumps from the original IndexedDB export are never read by any script here (`lib/sleeper.mjs` fetches weeks live; `nfl/season-totals/` holds the aggregates). Only `raw/-players-nfl.json` is consumed in-repo (`update-enrichment.mjs`). If the app no longer fetches `raw/stats-*` over jsDelivr, they're pure bloat and stale-by-construction (no writer keeps them current).
- **Recommended action:** Grep the app repo for `raw/stats-` / the `stats/<year>/<week>` cache key. If unused, retire them (and their manifest entries) in one commit; if used, document them as an app-served contract in CLAUDE.md. **Do not delete without that check.**
- **Effort:** S (after confirmation)

### L2 — Undocumented `manifest.generatedAt`
- **Location:** `lib/manifest.mjs:38`; `manifest.json` top level; README.md "manifest.json shape"
- **Category:** contract-drift (doc/code)
- **Description:** `updateManifestEntry` writes a top-level `generatedAt` on every run, but the README documents only `exportedAt` (now stale at 2026-05-18). Both keys exist in the file. An implementer reading the README would not know `generatedAt` is the live freshness field. Borderline with the out-of-scope doc-reconcile, but it's a code-written contract field the docs omit.
- **Recommended action:** Document `generatedAt` in the manifest-shape table (or drop it if `exportedAt` is meant to be canonical).
- **Effort:** S

### L3 — `weekly-ktc.yml` push has no rebase-retry
- **Location:** `.github/workflows/weekly-ktc.yml` (bare `git push`)
- **Category:** suboptimal
- **Description:** All four nflverse workflows and `import-snapshot.mjs` use `git push || (git pull --rebase && git push)`; KTC uses a bare `git push`. The system explicitly anticipates KTC racing other committers (README/import-snapshot mention "the weekly KTC action pushed first"), yet KTC itself can lose its push on a non-fast-forward and drop that week's snapshot. Low frequency (sole Monday committer).
- **Recommended action:** Use the same rebase-retry one-liner for consistency.
- **Effort:** S

### L4 — `largeDeltaGuard` threshold doc/code mismatch
- **Location:** `scripts/update-ktc.mjs:17` (header says ">30% of players changed") vs `:81` (code uses `ratio > 0.70`)
- **Category:** suboptimal (doc/code)
- **Description:** Module header advertises a 30% abort threshold; the implementation aborts at 70%. Misleads anyone tuning the scraper-breakage guard.
- **Recommended action:** Fix the header comment to 70% (or reconcile to the intended value).
- **Effort:** S

### L5 — `register-snapshots` change-detection relies on mtime
- **Location:** `scripts/register-snapshots.mjs:45-57`
- **Category:** suboptimal
- **Description:** Re-registration is gated on file mtime vs manifest `lastModified`. After a fresh `git clone`/CI checkout (all mtimes = checkout time), every snapshot looks "newer" and would be re-registered, bumping manifest timestamps with no content change. Harmless (snapshots are immutable, re-register is idempotent in content) and the path isn't run in CI, but mtime is not a reliable change signal.
- **Recommended action:** Skip when the manifest entry already exists with the same `recordCount`/`schemaVersion`, independent of mtime; or compare a content hash.
- **Effort:** S

### L6 — Draft dedup hash is order-sensitive
- **Location:** `scripts/update-draft.mjs:26-28` (`picksByYearHash` = `JSON.stringify(picksByYear)` unsorted)
- **Category:** suboptimal
- **Description:** Roster/playerids/advstats hashes sort keys for order-independence; the draft hash hashes the object as-built, so it depends on upstream CSV row order. A pure upstream reorder (same picks) would trigger a spurious rewrite/commit. Low risk (nflverse CSVs are stably ordered).
- **Recommended action:** Normalize before hashing (sort years, and picks within a year by round/pick) if churn is ever observed.
- **Effort:** S

---

## A. Confirmed clean / no action (verifies the brief's hazards)

- **Rate/derived-stat aggregation hazard — contained, no new instance.** `aggregateWeeks` (`lib/sleeper.mjs:171`) does sum *all* stat keys across weeks, including non-additive rates (`pass_rtg`, `cmp_pct`, `rec_ypr`, `pass_ypa`, …) and `pts_*`. This is the documented, accepted case: CLAUDE.md's `pass_cmp` contract row states these stored rates are "weekly sums … NOT consumed by the app — preserve as-is." It's safe because every consumer recomputes from components: the app derives passer rating from `pass_cmp`/`pass_att`/… , and the **in-basis grader iterates `scoringSettings` keys (never `stats` keys)** plus strips `RATE_KEYS` (`lib/fantasyPoints.mjs:21`, `scripts/grade-snapshot.mjs:89`), so the garbage season-rates are never read. The advstats path **correctly** recomputes season ratios from summed components rather than averaging weekly ratios (`lib/nflverse.mjs:393`, covered by `nflverse.test.mjs` "weekly ratio columns ignored"). No analogous un-contained aggregation found.
- **Cross-repo scoring port is faithful.** `lib/fantasyPoints.mjs` is a verbatim dot-product matching the CLAUDE.md contract (loop settings, skip null multiplier/stat, 2-dp round); rate-stripping is correctly adapter-side only. Covered by `fantasyPoints.test.mjs` + `grade-routing.test.mjs` (v1/v2 routing).
- **Enrichment overlay is clean.** `validate` green; coaching 95 valid entries, scheme/injuries/notes empty → no orphaned injury segments, duplicates, or invalid teams. Upsert/natural-key/segment-existence logic is sound.
- **No orphaned one-off scripts.** The 2024/2025 roster + draft backfill was done via CLI invocations (git `1fa762a`), not a committed throwaway script. Every `scripts/*` file is reachable from `bin/update.mjs`, `bin/enrich.mjs`, `bin/grade.mjs`, or `bin/backtest.mjs`. `bin/backtest.mjs` + `lib/backtest.mjs` + `scripts/backtest-run.mjs` are analysis-only (not in smoke) but are documented as such and covered by `backtest*.test.mjs` — not dead code.
- **Write-path safety is otherwise solid:** publish-time finiteness sweep on season-totals; sparsity gates + format-drift guards on all nflverse ingests; content-hash dedup on roster/draft/playerids/advstats/ktc; `import-snapshot` correctly imports *all* untracked dates and verifies manifest registration before commit.
