# Task: `bin/import-snapshot.mjs` — one-command projection snapshot import

Collapse the manual projection-snapshot workflow (export → unzip → copy →
register → commit → push) into a single command: `npm run import:snapshot`.

This is the **plan only**. Implementation happens in the sonnet session.

---

## Pre-flight findings (verified against the repo)

| Item | Finding | Consequence for the plan |
|---|---|---|
| `bin/update.mjs snapshots` | Dispatches to `registerSnapshots({ dryRun })` imported from `scripts/register-snapshots.mjs` (named export). | **Import the function directly** — cleaner than shelling out, same as `update.mjs` does. |
| `registerSnapshots()` | Scans `snapshots/*.json`, registers any untracked/stale file in `manifest.json`. Idempotent (skips already-current). Takes `{ dryRun }`. No return value; logs to console. | Call it once after copying the file in. It will pick up the new file and skip the existing `2026-05-19.json`. |
| Zip library | **None** in `node_modules` (no adm-zip/jszip/yauzl). `package.json` deps are only `cheerio`, `dotenv`. | Use system `unzip` via `child_process` (confirmed at `/usr/bin/unzip`). No new npm deps. |
| `unzip` | Present at `/usr/bin/unzip`. | OK on macOS/Linux. |
| Node | `v24.2.0` (engines requires `>=20`). | Native APIs only; top-level await fine. |
| `snapshots/` | Contains `.gitkeep` + `2026-05-19.json`. | Filter to `*.json` and ignore `.gitkeep` when checking existence. |
| `snapshot-workflow.md` | **Does not exist.** The 6-step process lives in `README.md` (lines 199–204) and the `register-snapshots.mjs` header comment. | **Create** `snapshot-workflow.md` (2-step) and rewrite the README block. (Brief assumed the file existed.) |
| Git remote | `origin` → GitHub HTTPS. ⚠️ **The URL in `.git/config` embeds a `ghp_…` Personal Access Token.** | Out of scope for this task, but **flag to the user** (see Security note). Do not print the remote URL in script output. |
| `lib/io.mjs` | `repoPath(...parts)` resolves repo-relative → absolute (handles spaces in the repo path via `fileURLToPath`). | Reuse `repoPath` for repo paths; the repo lives under a path with spaces, so never hand-build absolute paths with string concat. |

---

## Script structure & logic flow

File: `bin/import-snapshot.mjs`. ESM, `#!/usr/bin/env node`, top-level await,
console output in the existing `[tag] message` style (use `[import]`).

### Imports
```js
#!/usr/bin/env node
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { repoPath, listDir } from '../lib/io.mjs';
import { registerSnapshots } from '../scripts/register-snapshots.mjs';
```
Note: use `execFileSync` (not `execSync`) for `unzip`/`git` so arguments with
spaces and the spaces in the repo path are passed safely without shell quoting.
Run git with `cwd: repoPath()` so it operates on this repo regardless of where
node is invoked from.

### Pure helpers (exported for unit tests — see Tests section)

```js
// Given an array of dirents/names + their mtimeMs, return the newest entry
// whose name matches /^sleeper-export.*\.zip$/i (handles "sleeper-export (1).zip").
export function pickLatestExportZip(entries) { /* entries: [{name, mtimeMs}] */ }

// Given a zip entry path like "snapshots/2026-06-07.json", return "2026-06-07"
// or null if it doesn't match snapshots/<YYYY-MM-DD>.json.
export function parseSnapshotDateFromEntry(entryPath) { /* → 'YYYY-MM-DD' | null */ }

// True iff s is a real calendar date in strict YYYY-MM-DD form.
export function isValidSnapshotDate(s) { /* → boolean */ }
```

### Main flow (top-level await, wrapped so failures print a clean message)

1. **Locate the export ZIP.**
   - `downloads = path.join(os.homedir(), 'Downloads')`.
   - Read it; build `[{name, mtimeMs}]` via `fs.statSync`. Filter with the
     regex, pass to `pickLatestExportZip`.
   - If none: **fail** —
     `No sleeper-export*.zip found in ~/Downloads. Export from the app first (click "Export data"), then re-run npm run import:snapshot.`
   - Log: `[import] Using <name> (modified <ISO>, <size>)`.

2. **Unzip into a temp dir & find the snapshot entry.**
   - `tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sleeper-import-'))`.
   - List entries: `execFileSync('unzip', ['-Z1', zipAbs], {encoding:'utf8'})`
     → split lines. Find the first matching `snapshots/<YYYY-MM-DD>.json` via
     `parseSnapshotDateFromEntry`.
   - If no `snapshots/` entries at all: **fail** —
     `The ZIP has no snapshots/ folder. This usually means the app export ran before the projection pipeline finished. Open a league in the app, let projections complete, re-export, then retry.`
   - If a `snapshots/` folder exists but no `.json` inside: **fail** with the
     same remedy text (mention "no <date>.json inside snapshots/").
   - Extract just that entry:
     `execFileSync('unzip', ['-o', '-j', zipAbs, entryPath, '-d', tmp])`
     (`-j` junks the path so the file lands directly in `tmp`).
   - `extracted = path.join(tmp, '<date>.json')`.
   - Clean up `tmp` in a `finally` (`fs.rmSync(tmp, {recursive:true, force:true})`).

3. **Idempotency check — does the date already exist in the repo?**
   - `destRel = 'snapshots/' + date + '.json'`.
   - If `listDir('snapshots').includes(date + '.json')`: log
     `[import] snapshots/<date>.json already exists — nothing to do.` and
     **exit 0**. (Honors "Snapshots are permanent / first-of-day-wins".)

4. **Copy into the repo.**
   - `fs.copyFileSync(extracted, repoPath(destRel))`.
   - Record `size = fs.statSync(repoPath(destRel)).size`.
   - Log `[import] Copied → <destRel> (<size>)`.

5. **Register in the manifest.**
   - `registerSnapshots({ dryRun: false });` (direct import; writes manifest.json).
   - This also re-validates shape (it warns + skips if `schemaVersion`/`capturedAt`
     missing). After the call, verify the entry landed:
     re-read `manifest.json` (via `readJson`) and confirm `files[destRel]` exists;
     if not, **fail** —
     `Copied the file but manifest registration skipped it (likely missing schemaVersion/capturedAt). The export may be malformed — re-export and retry.`
     (Leave the copied file in place; the next run is still idempotent.)

6. **Stage, commit, push (with one rebase retry).**
   - `git('add', destRel, 'manifest.json')`.
   - If nothing staged (defensive): `git diff --cached --quiet` → if clean,
     log `[import] No changes to commit.` and exit 0.
   - `git('commit', '-m', 'snapshot: ' + date)`.
   - `sha = git('rev-parse', '--short', 'HEAD').trim()`.
   - **Push with retry:**
     ```
     try { git('push'); }
     catch (e) {
       console.log('[import] Push rejected — pulling --rebase and retrying once…');
       git('pull', '--rebase');
       git('push');   // if this throws, let it propagate to the error handler
     }
     ```
     The first failure is almost always the weekly KTC action having pushed
     while we worked; `pull --rebase` replays our snapshot commit on top.

7. **Success summary.**
   ```
   [import] ✓ Snapshot imported
            date:   <date>
            file:   snapshots/<date>.json (<human size, e.g. 617 KB>)
            commit: <sha>
            pushed to origin.
   ```

### Error handling shape
Wrap steps 1–6 in `try/catch`. On catch:
`console.error('[import] ' + err.message)` then `process.exit(1)`. Include
`if (process.env.DEBUG) console.error(err.stack)` to match `update.mjs`.
Every thrown error message is a full human sentence with a remedy (texts above).
A small `git(...args)` wrapper does
`execFileSync('git', args, { cwd: repoPath(), encoding: 'utf8' })` and on
failure throws `new Error('git ' + args.join(' ') + ' failed: ' + (e.stderr||e.message))`.

---

## How it hooks into `bin/update.mjs snapshots`

**Direct import, not shell-out.** `bin/import-snapshot.mjs` imports
`registerSnapshots` from `../scripts/register-snapshots.mjs` — exactly what
`bin/update.mjs` already does (line 34). Rationale:
- No second `node` process / startup cost.
- No path-quoting issues (the repo path contains spaces).
- Same in-process error surface; `registerSnapshots` already logs in our style.
- `update.mjs` and `register-snapshots.mjs` are **not modified** (constraint met).

The standalone `node bin/update.mjs snapshots` command remains fully usable.

---

## Exact `package.json` change

Add one line to `scripts` (after the existing `update:ktc` entry):

```diff
   "scripts": {
     "update": "node bin/update.mjs",
     "update:nfl": "node bin/update.mjs nfl",
     "update:cfbd": "node bin/update.mjs cfbd",
     "update:ktc": "node bin/update.mjs ktc",
+    "import:snapshot": "node bin/import-snapshot.mjs",
     "enrich": "node bin/enrich.mjs",
     "validate:enrichment": "node bin/enrich.mjs validate",
     "smoke": "node bin/update.mjs nfl --year 2023 --dry-run && node bin/update.mjs cfbd --year 2023 --dry-run && node bin/update.mjs ktc --dry-run && node bin/enrich.mjs validate"
   },
```

No dependency changes.

---

## Docs updates (concrete before/after)

### 1. `README.md` — "Manual import workflow" block (lines 199–206)

**Before:**
```markdown
**Manual import workflow:**
1. Click "Export data" in the app.
2. Unzip the download.
3. Copy `snapshots/<date>.json` → `<this repo>/snapshots/<date>.json`.
4. `node bin/update.mjs snapshots` (or `node bin/update.mjs snapshots --dry-run` to preview).
5. `git add snapshots/<date>.json manifest.json && git commit -m "snapshot: <date>"`

Snapshots are permanent (never overwritten by the app within a UTC day). Old snapshots accumulate — no retention policy in v1.
```

**After:**
```markdown
**Import workflow:**
1. Click "Export data" in the app (wait for the projection pipeline to finish first).
2. From this repo's root, run `npm run import:snapshot`.

`bin/import-snapshot.mjs` finds the newest `sleeper-export*.zip` in `~/Downloads`,
extracts `snapshots/<date>.json`, copies it in, registers it in `manifest.json`
(via the same `snapshots` registration as `bin/update.mjs snapshots`), then commits
and pushes `snapshot: <date>`. It is idempotent — if the date is already present it
prints a message and exits without committing. If `git push` is rejected (e.g. the
weekly KTC action pushed first) it runs `git pull --rebase` and retries once.

The manual path still works if you prefer it: copy `snapshots/<date>.json` into this
repo's `snapshots/`, run `node bin/update.mjs snapshots`, then commit.

Snapshots are permanent (never overwritten by the app within a UTC day). Old snapshots accumulate — no retention policy in v1.

See [snapshot-workflow.md](snapshot-workflow.md) for the full step-by-step.
```

### 2. `snapshot-workflow.md` — **create** (root of data repo)

The brief said to "replace the current 6-step manual process" in this file, but
the file does not exist. Create it with the 2-step process:

```markdown
# Snapshot import workflow

Importing a projection snapshot from the app into this repo is two steps.

## 1. Export from the app
Click **Export data** in the sleeper-dashboard app. Make sure a league is open and
the projection pipeline has finished first — otherwise the export ZIP won't contain
a `snapshots/<date>.json` and the import will fail with a clear message.

This downloads `sleeper-export.zip` to your `~/Downloads` folder. (If a previous
export is still there, the browser names it `sleeper-export (1).zip`, etc. — the
import always uses the most recently modified one.)

## 2. Import
From the root of this repo:

```sh
npm run import:snapshot
```

That command:
1. Finds the newest `sleeper-export*.zip` in `~/Downloads`.
2. Extracts `snapshots/<YYYY-MM-DD>.json` from it.
3. Skips with a message if that date is already imported (safe to re-run).
4. Copies the file into `snapshots/`.
5. Registers it in `manifest.json` (same logic as `node bin/update.mjs snapshots`).
6. Commits `snapshot: <date>` and pushes (auto `git pull --rebase` + retry once
   if the push is rejected).

### Success looks like
```
[import] Using sleeper-export.zip (modified 2026-06-07T…, 631 KB)
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
- **"No sleeper-export*.zip found in ~/Downloads"** — export from the app first.
- **"The ZIP has no snapshots/ folder"** — the export ran before projections
  finished. Open a league, let projections complete, re-export, retry.

The old manual path (copy file → `node bin/update.mjs snapshots` → commit) still
works if you ever need it.
```

### 3. `CLAUDE.md` — Navigation map

Add a row under the `bin/enrich.mjs` row:

**Before:**
```markdown
| `bin/update.mjs` | CLI dispatcher → nfl / cfbd / ktc / snapshots subcommands |
| `bin/enrich.mjs` | Enrichment overlay CLI → add / validate / list / remove |
```
**After:**
```markdown
| `bin/update.mjs` | CLI dispatcher → nfl / cfbd / ktc / snapshots subcommands |
| `bin/enrich.mjs` | Enrichment overlay CLI → add / validate / list / remove |
| `bin/import-snapshot.mjs` | One-command projection-snapshot import: ~/Downloads ZIP → snapshots/ → manifest → commit + push |
```

Also add the npm shortcut to the CLAUDE.md "Update CLI" section note and, if
desired, a `snapshot-workflow.md` link near the `snapshots/` description. (The
Self-maintenance rule requires updating CLAUDE.md when a `bin/` script or
`package.json` script is added — both apply here.)

---

## Tests to add

This is a CLI with side effects (filesystem, `unzip`, `git`, network push), so
the integration path is **smoke/manual** tested (see Usage). But three pure
helpers are extracted and unit-testable. The repo has no test runner configured;
keep it dependency-free using `node:assert` + `node:test` (built into Node 20+),
in `test/import-snapshot.test.mjs`, run via `node --test`. (Optional — the repo
currently has no `test` script; if adding one is undesirable, these can be
inline `assert` checks invoked manually. Confirm with maintainer before adding a
`test` npm script.)

| Helper | Input | Expected output |
|---|---|---|
| `pickLatestExportZip` | `[{name:'sleeper-export.zip',mtimeMs:100},{name:'sleeper-export (1).zip',mtimeMs:200},{name:'other.zip',mtimeMs:300}]` | the `sleeper-export (1).zip` entry (newest *matching*; `other.zip` ignored) |
| `pickLatestExportZip` | `[]` or no matches | `null` |
| `pickLatestExportZip` | case: `['Sleeper-Export.ZIP']` | matched (regex is case-insensitive) |
| `parseSnapshotDateFromEntry` | `'snapshots/2026-06-07.json'` | `'2026-06-07'` |
| `parseSnapshotDateFromEntry` | `'snapshots/'` or `'snapshots/foo.txt'` | `null` |
| `parseSnapshotDateFromEntry` | `'other/2026-06-07.json'` | `null` (must be under snapshots/) |
| `isValidSnapshotDate` | `'2026-06-07'` | `true` |
| `isValidSnapshotDate` | `'2026-13-40'` / `'2026-6-7'` / `'garbage'` | `false` |

The git/unzip/copy path is validated by running `npm run import:snapshot` against
a real export (manual smoke), plus the idempotency check (run twice — second run
must exit 0 with "already exists"). `npm run smoke` is unaffected (no change to
existing scripts) but should still be run per the done-definition.

---

## Cross-repo impact

**None.** This script only reads an export ZIP from `~/Downloads` and writes to
`snapshots/<date>.json` + `manifest.json` — both already part of the established
snapshot workflow and existing Cross-repo contracts (Snapshot shape, Manifest
contract). It introduces no new field, no schema change, and does not touch the
app. The snapshot file is produced verbatim by the app's existing export; we only
move and register it. No sibling-repo change required.

---

## Security note (out of scope, flag to user)

`.git/config`'s `origin` URL contains an embedded GitHub Personal Access Token
(`ghp_…`). Anyone who reads the repo's git config sees a live credential, and it
can leak into shell history / process listings on every push. Recommend the user
rotate that token and switch the remote to SSH or a credential helper:
`git remote set-url origin git@github.com:antonwilms/sleeper-dashboard-data.git`.
The new script must **not** print the remote URL in any output. This is unrelated
to the import feature — surfacing it, not fixing it here.

---

## Usage instructions (hand to user after implementation)

**One-time setup:** none. (Requires `unzip` and `git`, already present; Node ≥ 20.)

**Each time you want to save a snapshot:**
1. In the app, click **Export data** (with a league open and projections finished).
2. In a terminal at the repo root, run:
   ```sh
   npm run import:snapshot
   ```

**On success** you'll see the `[import] ✓ Snapshot imported` summary with the
date, file size, and commit SHA, and the commit is pushed to `origin`. Running it
again with no new export prints `… already exists — nothing to do.` and exits 0.

**Two most likely failures:**
- *"No sleeper-export*.zip found in ~/Downloads"* → you haven't exported yet (or
  cleared Downloads). Click **Export data** in the app, then re-run.
- *"The ZIP has no snapshots/ folder"* → the export ran before projections
  finished. Open a league, wait for projections to complete, re-export, re-run.

(If `git push` is rejected by a concurrent KTC commit, the script auto-runs
`git pull --rebase` and retries once — no action needed.)

---

## Implementation checklist (for the sonnet session)

- [ ] Create `bin/import-snapshot.mjs` per structure above (ESM, shebang, top-level await, `[import]` logging, exported pure helpers).
- [ ] Add `"import:snapshot"` to `package.json` scripts.
- [ ] Rewrite README "Manual import workflow" block → 2-step + link.
- [ ] Create `snapshot-workflow.md` at repo root.
- [ ] Add `bin/import-snapshot.mjs` row to CLAUDE.md navigation map (+ npm shortcut note).
- [ ] (Optional, confirm first) add `test/import-snapshot.test.mjs` + `"test": "node --test"`.
- [ ] Do NOT modify `bin/update.mjs`, `scripts/register-snapshots.mjs`, or any existing script.
- [ ] Verify: `node bin/import-snapshot.mjs` with no zip → clean error; with a real export → imports; run twice → idempotent.
- [ ] Run `npm run smoke` (done-definition) — must stay green.
- [ ] In the task summary, surface the leaked-PAT security note.
```
