### Capturing & publishing a projection snapshot

Snapshots are born in the browser (the app computes projections in IndexedDB)
and published to this repo. Two manual actions remain — clicking **Export** in
the app and running one import command — because the snapshot only exists in
your browser until you export it. Everything else is automatic.

**0. One-time setup.** App on current `main`; `.env.local` has
`VITE_DATA_STORE_URL` set (so the career load is fast). `git pull` this repo.

**1. Capture (automatic).** Open the app, select your league, and wait until
career stats, KTC values, and projections have all finished loading. The app
writes today's snapshot to IndexedDB on its own — watch the console for
`[snapshot] wrote projection-snapshots/<date> (… bytes)`.
- It captures **once per UTC day** (skip-if-exists). To force a re-capture the
  same day, delete the `projection-snapshots/<date>` key in DevTools →
  Application → IndexedDB → `sleeper-dashboard` → `cache`, then reload.
- (Optional) verify it's v2: that record's `data.schemaVersion === 2` with a
  populated `scoringSettings` and numeric `targetSeason`.

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
