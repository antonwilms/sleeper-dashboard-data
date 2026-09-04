# Task: fix `bin/import-snapshot.mjs` — import every new snapshot, not just the first

`npm run import:snapshot` silently fails to import fresh snapshots when the app
export ZIP contains more than one `snapshots/<date>.json`. It grabs the
**first** (alphabetically oldest) entry, finds it already committed, prints
`already exists — nothing to do`, and exits — never importing the newer ones.
This stranded six fresh v2 snapshots (`2026-06-08`…`2026-06-13`) in a single
export; they had to be imported by hand.

This is the **plan only** (data-repo session). Implementation is a sonnet task —
single-file bug fix with a clear repro. **Do not edit source while planning.**

---

## Root causes (verified)

1. **Importer selects one entry, oldest-first, exits-if-present.**
   `bin/import-snapshot.mjs` lines ~140‑150 loop `snapshotEntries`, take the
   **first** valid `snapshots/<YYYY-MM-DD>.json`, and `break`. Lines ~165‑170
   then `exit(0)` if that one date already exists in `snapshots/`. `unzip -Z1`
   lists entries sorted, so the first is the oldest date — which is almost always
   already committed. Newer dates are never examined.

2. **The export ZIP accumulates every daily snapshot.** The app captures one
   snapshot per UTC day (an automatic effect, `~2 yr` TTL each) and
   `exportData.js → exportAllData` dumps **all** live IndexedDB records. So the
   ZIP holds one `snapshots/<date>.json` per day captured since the records were
   last cleared (observed: `2026-06-06`…`2026-06-13`, 8 files), on top of the
   full season-totals/raw store (hence the 148 MB ZIP). Root cause #1 only
   manifests because the ZIP routinely carries multiple snapshots — which is the
   normal, expected state, not an anomaly.

**Scope:** fix the importer (root cause #1) and make it robust to the
multi-snapshot ZIP (root cause #2's manifestation). The ZIP *size* and the
daily-capture cadence are app-side; named in **Cross-repo impact**, not built
here.

---

## The fix

### New pure helper (the testable core)

Add to `bin/import-snapshot.mjs`, exported alongside the existing pure helpers:

```js
/**
 * Given the ZIP's entry list and the set of snapshot dates already committed in
 * the repo, return the dates that need importing — valid snapshots/<date>.json
 * entries whose date is NOT already present — sorted ascending by date.
 *
 * @param {string[]} zipEntries        raw `unzip -Z1` lines
 * @param {Set<string>} existingDates  'YYYY-MM-DD' dates already in snapshots/
 * @returns {{ entry: string, date: string }[]}   sorted ascending
 */
export function selectMissingSnapshots(zipEntries, existingDates) {
  const seen = new Set();
  const out = [];
  for (const e of zipEntries) {
    const date = parseSnapshotDateFromEntry(e);          // existing helper
    if (!date || !isValidSnapshotDate(date)) continue;   // existing helper
    if (existingDates.has(date) || seen.has(date)) continue;
    seen.add(date);
    out.push({ entry: e, date });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));       // YYYY-MM-DD sorts lexically
  return out;
}
```

`pickLatestExportZip`, `parseSnapshotDateFromEntry`, `isValidSnapshotDate` are
unchanged (still exported, still tested).

### Rewritten main flow (`if (isMain)` block)

Replace the "find first / extract one / exit-if-exists / commit one" steps
(current lines ~129‑224) with:

1. **Locate ZIP** — unchanged (`pickLatestExportZip`, the not-found error, the
   `[import] Using …` log).
2. **List entries** — `unzip -Z1` → `zipEntries`. Keep the existing two guards:
   - no `snapshots/` entries at all → the "no snapshots/ folder … pipeline didn't
     finish" error.
   - `snapshots/` entries exist but none parse to a valid `<date>.json` → the
     "folder but no <date>.json" error.
3. **Compute the work set:**
   ```js
   const existing = new Set(
     listDir('snapshots').filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
       .map(f => f.slice(0, -'.json'.length))
   );
   const missing = selectMissingSnapshots(zipEntries, existing);
   ```
4. **Nothing to do:** if `missing.length === 0` →
   `console.log('[import] All N snapshot(s) in the export are already present — nothing to do.')`
   (N = count of valid snapshot dates in the ZIP), `exit(0)`.
5. **Extract + copy each missing date** into `snapshots/<date>.json`
   (`unzip -o -j zipAbs entry -d tmp` then `copyFileSync` → `repoPath`). Collect
   `importedDates` and their byte sizes for the summary.
6. **Register once:** `registerSnapshots({ dryRun: false })` — it scans
   `snapshots/*.json` and registers every untracked file in one manifest write
   (already its behavior; no change needed there).
7. **Verify** each imported date now has a `manifest.files['snapshots/<date>.json']`
   entry; if any is missing → throw the existing "manifest registration skipped"
   error (malformed export).
8. **One commit, then push with the existing single rebase-retry:**
   ```js
   git('add', ...importedDates.map(d => `snapshots/${d}.json`), 'manifest.json');
   // defensive: nothing staged → "No changes to commit." exit(0)  (keep)
   const msg = importedDates.length === 1
     ? `snapshot: ${importedDates[0]}`                                  // preserve existing convention
     : `snapshot: import ${importedDates.length} (${importedDates[0]}…${importedDates.at(-1)})`;
   git('commit', '-m', msg);
   // push + one pull --rebase retry  (unchanged)
   ```
9. **Summary** listing every imported date + file size, the commit sha, and
   "pushed to origin." Keep the `finally` temp-dir cleanup.

### Decisions baked in
- **Imports ALL not-yet-committed dates, schema-agnostic.** No filtering by
  `schemaVersion` — a v1 snapshot is still a valid, gradeable data point
  (`gradeSnapshot` handles v1 via `deriveTargetSeason` + half_ppr). Faithful to
  the append-only-corpus invariant: don't silently drop captured snapshots.
  (Consequence: a stale v1 like `2026-06-07` *would* be imported if still
  uncommitted. That's acceptable; it's a real snapshot. If the daily-duplicate
  volume ever becomes a nuisance, add a `--since YYYY-MM-DD` filter later — out
  of scope now.)
- **One commit for the batch** (atomic with the single manifest write), with the
  single-date message preserved for the common case so history reads the same as
  today.
- **Idempotent + re-runnable:** running twice is a no-op (everything now present).

---

## Edge cases
- ZIP with exactly one new snapshot → behaves like today (single-date commit).
- ZIP whose snapshots are all already committed → "nothing to do", exit 0.
- ZIP with mixed valid/invalid entries (`snapshots/`, `snapshots/foo.txt`,
  `snapshots/bad.json`) → invalids ignored by the parse/validate filter.
- Duplicate date entries in the listing (shouldn't happen) → de-duped via `seen`.
- Malformed snapshot that `registerSnapshots` skips (missing `schemaVersion`/
  `capturedAt`) → caught by the per-date manifest-verify in step 7.

---

## Tests (`test/import-snapshot.test.mjs`, `node --test`)

Keep all existing pure-helper tests. Add a `selectMissingSnapshots` block:
- **multi-snapshot, some present:** `zipEntries = ['snapshots/', 'snapshots/2026-06-06.json', …, 'snapshots/2026-06-13.json']`, `existing = {'2026-06-06'}` → returns `2026-06-07 … 2026-06-13` in ascending order, `2026-06-06` excluded. (This is the regression test for the actual bug.)
- **all present** → `[]`.
- **none present** → all dates, ascending.
- **ignores non-date/non-json entries** (`snapshots/`, `snapshots/notes.txt`, `snapshots/2026-13-40.json` invalid date) → excluded.
- **single new date** → one-element array.

The IO/git main flow stays behind `if (isMain)` (untested, as today); all new
logic lives in `selectMissingSnapshots`, which is fully unit-testable. Run
`npm test` and `npm run smoke` green before done (per CLAUDE.md done-definition).

---

## Docs updates

### `snapshot-workflow.md` — rewrite to the corrected end-to-end runbook
Replace its contents with the **Runbook** section below (this is the
user-facing "how to get a new snapshot everywhere it needs to be").

### `README.md`
- The snapshots import-workflow block (≈ lines 199‑215, "Import workflow" under
  `### snapshots/<date>.json`): update step 2 to state the importer now imports
  **every** not-yet-committed `snapshots/<date>.json` in the newest export ZIP
  (one commit), not just one; and that the ZIP normally contains many days'
  snapshots because the app accumulates them. Point to `snapshot-workflow.md` for
  the full runbook.

### `CLAUDE.md`
- Navigation-map row for `bin/import-snapshot.mjs`: change the description to
  "One-command projection-snapshot import: newest ~/Downloads export ZIP →
  imports **all untracked** `snapshots/<date>.json` → manifest → commit + push".

---

## Cross-repo impact (app-side — named, NOT built here)

The data-repo fix makes import robust, but two root-cause-#2 items live in the
app (`sleeper-dashboard`) and would shrink the manual surface further. Flag to
the user; out of scope for this task:

1. **Snapshots-only export option.** `exportData.js → exportAllData` dumps the
   entire IndexedDB store (≈148 MB, dominated by season-totals + raw weekly
   stats). A second export path / button that zips only `projection-snapshots/*`
   would make a ~MB ZIP and a near-instant import. App-side change to
   `exportData.js` + a UI control. Recommended; not required for correctness.
2. **Daily-capture cadence / IndexedDB retention.** The app writes a snapshot
   every UTC day and never prunes; that's why the ZIP accumulates near-duplicate
   offseason snapshots. This is an app *policy* decision (the daily cadence is
   arguably intended as the backtest corpus), not a bug. If the duplicate volume
   is unwanted, the fix is app-side (capture weekly, or prune old IndexedDB
   snapshot records on export). Mention only.

No data-repo cross-repo *contract* changes: the served snapshot shape, manifest
fields, and `register-snapshots` behavior are untouched. The importer is purely a
local convenience over the unchanged manual path.

---

## Runbook (content for `snapshot-workflow.md`) — "getting a new snapshot everywhere it needs to be"

> ### Capturing & publishing a projection snapshot
>
> Snapshots are born in the browser (the app computes projections in IndexedDB)
> and published to this repo. Two manual actions remain — clicking **Export** in
> the app and running one import command — because the snapshot only exists in
> your browser until you export it. Everything else is automatic.
>
> **0. One-time setup.** App on current `main`; `.env.local` has
> `VITE_DATA_STORE_URL` set (so the career load is fast). `git pull` this repo.
>
> **1. Capture (automatic).** Open the app, select your league, and wait until
> career stats, KTC values, and projections have all finished loading. The app
> writes today's snapshot to IndexedDB on its own — watch the console for
> `[snapshot] wrote projection-snapshots/<date> (… bytes)`.
> - It captures **once per UTC day** (skip-if-exists). To force a re-capture the
>   same day, delete the `projection-snapshots/<date>` key in DevTools →
>   Application → IndexedDB → `sleeper-dashboard` → `cache`, then reload.
> - (Optional) verify it's v2: that record's `data.schemaVersion === 2` with a
>   populated `scoringSettings` and numeric `targetSeason`.
>
> **2. Export (manual — one click).** Click **"Export data"** (bottom of the
> panel). A `sleeper-dashboard-export-<date>.zip` lands in `~/Downloads`. The ZIP
> contains every snapshot still in your browser, plus the full data store — this
> is expected.
>
> **3. Import (manual — one command).** In this repo:
> ```sh
> npm run import:snapshot
> ```
> It picks the newest export ZIP in `~/Downloads`, imports **every**
> `snapshots/<date>.json` not yet committed (one commit), updates `manifest.json`,
> and pushes. Already-present dates are skipped; re-running is a no-op.
>
> **Manual fallback** (if the import command ever errors): extract the specific
> file and use the register path directly —
> ```sh
> unzip -o -j ~/Downloads/sleeper-dashboard-export-<date>.zip snapshots/<date>.json -d snapshots/
> node bin/update.mjs snapshots
> git add snapshots/<date>.json manifest.json && git commit -m "snapshot: <date>" && git push
> ```
>
> **What's automatic vs manual:** capture (automatic), registration + manifest +
> commit + push (automatic, inside `import:snapshot`). Manual: the **Export
> click** (irreducible — the snapshot lives only in your browser) and **running
> `npm run import:snapshot`**.
