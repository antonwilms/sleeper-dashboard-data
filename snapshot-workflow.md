# Snapshot import workflow

Importing a projection snapshot from the app into this repo is two steps.

## 1. Export from the app

Click **Export data** in the sleeper-dashboard app. Make sure a league is open and
the projection pipeline has finished first — otherwise the export ZIP won't contain
a `snapshots/<date>.json` and the import will fail with a clear message.

This downloads `sleeper-dashboard-export-<date>.zip` to your `~/Downloads` folder.
(If a previous export is still there, the browser names it
`sleeper-dashboard-export-<date> (1).zip`, etc. — the import always uses the most
recently modified one.)

## 2. Import

From the root of this repo:

```sh
npm run import:snapshot
```

That command:
1. Finds the newest `sleeper-dashboard-export*.zip` in `~/Downloads`.
2. Extracts `snapshots/<YYYY-MM-DD>.json` from it.
3. Skips with a message if that date is already imported (safe to re-run).
4. Copies the file into `snapshots/`.
5. Registers it in `manifest.json` (same logic as `node bin/update.mjs snapshots`).
6. Commits `snapshot: <date>` and pushes (auto `git pull --rebase` + retry once
   if the push is rejected).

### Success looks like

```
[import] Using sleeper-dashboard-export-2026-06-07.zip (modified 2026-06-07T…, 631 KB)
[import] Copied → snapshots/2026-06-07.json (631 KB)
[snapshots] Registered snapshots/2026-06-07.json (612 players)
[snapshots] Done: 1 registered, 1 skipped.
[import] ✓ Snapshot imported
         date:   2026-06-07
         file:   snapshots/2026-06-07.json (631 KB)
         commit: a1b2c3d
         pushed to origin.
```

### If it fails

- **"No sleeper-dashboard-export*.zip found in ~/Downloads"** — export from the app first.
- **"The ZIP has no snapshots/ folder"** — the export ran before projections
  finished. Open a league, let projections complete, re-export, retry.

The old manual path (copy file → `node bin/update.mjs snapshots` → commit) still
works if you ever need it.
