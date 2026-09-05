### Capturing & publishing a projection snapshot

**Primary path (D1b): `.github/workflows/daily-snapshot.yml`.** It builds and runs the app
headlessly (Playwright, `localStorage`-seeded — no manual browser step), reads the snapshot it
wrote to IndexedDB, and — only if the snapshot passes the commit gate (`lib/snapshot-capture.mjs`)
— registers, commits and pushes `snapshots/<date>.json`.

**Phase 1 status: `workflow_dispatch` only, no `cron:` line yet.** See CR-22 in the [Cross-repo
contract registry](README.md#cross-repo-contract-registry-with-sleeper-dashboard) — the cron
switch-on is gated on that coupling landing in both repos' registries, not merely on one green
dispatch. Until then, run it manually (Actions tab → "Daily projection snapshot capture" → Run
workflow) or use the manual fallback below.

**When the job fails its gate, read the rejection reason — do not just re-run it.** The job's
`Capture snapshot` step logs `::error::Snapshot rejected — <reason>` and exits non-zero; no
snapshot is written or committed (a rejected snapshot never enters the series unlabelled). Reasons
and what each means:

| Reason | What it means |
|---|---|
| `missing-record` | The app never wrote a record for today's UTC date — the console marker didn't fire, or IndexedDB read failed. Check the job's piped console log first. |
| `schema-version-below-3` | The app build being run predates D1a (schemaVersion < 3, no `inputStatus`). Check the `app_ref` input actually points at a build with D1a. |
| `college-not-loaded` / `nfldraft-not-loaded` / `ktc-not-loaded` | One of the three gated loaders didn't resolve with data this run — a real degraded capture, not a bug in the gate. |
| `nfldraft-target-year-missing` | The upcoming draft class's picks aren't in the data store yet — expected before `nflverse-draft.yml`'s May 1 ingest; unexpected afterward. |
| `ktc-below-floor` | KTC's live scrape (the one input fetched from a third party inside the run, not the data store) came back thin — a blocked request, a changed page, or a genuine market-data outage. This is the gate most likely to fire on a CI runner. |
| `depthchart-below-floor` / `players-below-floor` | The roster/depth-chart load or the overall player set came back thin — investigate the app build/data store before re-running. |

A rejection almost always means re-running immediately will fail the same way (the inputs haven't
changed) — investigate first, then either fix and re-dispatch, or fall back to a manual capture
for today so the day isn't lost while the job is being fixed.

---

### Fallback: manual capture

Snapshots are born in the browser (the app computes projections in IndexedDB)
and published to this repo. Two manual actions remain — clicking **Export** in
the app and running one import command — because the snapshot only exists in
your browser until you export it. Everything else is automatic. Use this path
when the daily Action is broken, or to backfill/correct a specific date.

**0. One-time setup.** App on current `main`; `.env.local` has
`VITE_DATA_STORE_URL` set (so the career load is fast). `git pull` this repo.

**1. Capture (automatic).** Open the app, select your league, and wait until
career stats, KTC values, and projections have all finished loading. The app
writes today's snapshot to IndexedDB on its own — watch the console for
`[snapshot] wrote projection-snapshots/<date> (… bytes)`.
- It captures **once per UTC day** (skip-if-exists). To force a re-capture the
  same day, delete the `projection-snapshots/<date>` key in DevTools →
  Application → IndexedDB → `sleeper-dashboard` → `cache`, then reload.
- (Optional) verify it's v3: that record's `data.schemaVersion === 3` with a
  populated `scoringSettings`, numeric `targetSeason`, and an `inputStatus`
  block. The manual path registers the shape as-is — it does **not** run the
  Action's commit gate, so a manually-imported snapshot with a degraded
  `inputStatus` still lands; check it yourself before importing if that matters.

**2. Export (manual — one click).** Click **"Export data"** (bottom of the
panel). A `sleeper-dashboard-export-<date>.zip` lands in `~/Downloads`. The ZIP
contains every snapshot still in your browser, plus the full data store — this
is expected.

**3. Import (manual — one command).** In this repo:
```sh
npm run import:snapshot
```
It picks the newest export ZIP in `~/Downloads`, imports **every**
`snapshots/<date>.json` not yet committed (one commit), updates `manifest.json`,
and pushes. Already-present dates are skipped; re-running is a no-op.

**Manual fallback** (if the import command ever errors): extract the specific
file and use the register path directly —
```sh
unzip -o -j ~/Downloads/sleeper-dashboard-export-<date>.zip snapshots/<date>.json -d snapshots/
node bin/update.mjs snapshots
git add snapshots/<date>.json manifest.json && git commit -m "snapshot: <date>" && git push
```

**What's automatic vs manual:** capture (automatic), registration + manifest +
commit + push (automatic, inside `import:snapshot`). Manual: the **Export
click** (irreducible — the snapshot lives only in your browser) and **running
`npm run import:snapshot`**.
