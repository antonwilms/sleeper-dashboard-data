#!/usr/bin/env node
/**
 * bin/import-snapshot.mjs — One-command projection snapshot import.
 *
 * Collapses the manual export → unzip → copy → register → commit → push
 * workflow into a single command: npm run import:snapshot
 *
 * Usage:
 *   npm run import:snapshot
 *   node bin/import-snapshot.mjs
 *
 * Requirements: unzip (/usr/bin/unzip), git, Node ≥ 20.
 * No new npm dependencies.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { repoPath, listDir, readJson } from '../lib/io.mjs';
import { registerSnapshots } from '../scripts/register-snapshots.mjs';

// ─── Pure helpers (exported for unit tests) ───────────────────────────────────

const EXPORT_ZIP_RE = /^sleeper-dashboard-export.*\.zip$/i;

/**
 * Given an array of {name, mtimeMs} entries, return the entry with the
 * highest mtimeMs whose name matches the sleeper-dashboard-export*.zip pattern.
 * Returns null if no matching entry exists.
 *
 * @param {{ name: string, mtimeMs: number }[]} entries
 * @returns {{ name: string, mtimeMs: number } | null}
 */
export function pickLatestExportZip(entries) {
  const matches = entries.filter(e => EXPORT_ZIP_RE.test(e.name));
  if (matches.length === 0) return null;
  return matches.reduce((best, e) => (e.mtimeMs > best.mtimeMs ? e : best));
}

/**
 * Given a zip entry path (e.g. "snapshots/2026-06-07.json"), return the
 * YYYY-MM-DD date string, or null if the path doesn't match the expected shape.
 *
 * @param {string} entryPath
 * @returns {string | null}
 */
export function parseSnapshotDateFromEntry(entryPath) {
  const m = /^snapshots\/(\d{4}-\d{2}-\d{2})\.json$/.exec(entryPath);
  return m ? m[1] : null;
}

/**
 * Returns true iff s is a strict YYYY-MM-DD calendar date.
 *
 * @param {string} s
 * @returns {boolean}
 */
export function isValidSnapshotDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [year, month, day] = s.split('-').map(Number);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  // Leverage Date to catch impossible dates (e.g. Feb 30).
  const d = new Date(s);
  return !isNaN(d.getTime()) &&
    d.getUTCFullYear() === year &&
    d.getUTCMonth() + 1 === month &&
    d.getUTCDate() === day;
}

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
    const date = parseSnapshotDateFromEntry(e);
    if (!date || !isValidSnapshotDate(date)) continue;
    if (existingDates.has(date) || seen.has(date)) continue;
    seen.add(date);
    out.push({ entry: e, date });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

// ─── Git helper ───────────────────────────────────────────────────────────────

function git(...args) {
  try {
    return execFileSync('git', args, { cwd: repoPath(), encoding: 'utf8' });
  } catch (e) {
    throw new Error('git ' + args.join(' ') + ' failed: ' + (e.stderr || e.message));
  }
}

// ─── Human-readable file size ─────────────────────────────────────────────────

function humanSize(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return Math.round(bytes / 1024) + ' KB';
}

// ─── Main (only runs when invoked directly, not when imported) ────────────────

const isMain = process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {

let tmp = null;

try {
  // ── 1. Locate the export ZIP ──────────────────────────────────────────────

  const downloads = path.join(os.homedir(), 'Downloads');
  const dirEntries = fs.readdirSync(downloads).map(name => {
    const stat = fs.statSync(path.join(downloads, name));
    return { name, mtimeMs: stat.mtimeMs };
  });

  const zipEntry = pickLatestExportZip(dirEntries);
  if (!zipEntry) {
    throw new Error(
      'No sleeper-dashboard-export*.zip found in ~/Downloads. Export from the app first ' +
      '(click "Export data"), then re-run npm run import:snapshot.'
    );
  }

  const zipAbs = path.join(downloads, zipEntry.name);
  const zipStat = fs.statSync(zipAbs);
  console.log(
    `[import] Using ${zipEntry.name} (modified ${new Date(zipEntry.mtimeMs).toISOString()}, ${humanSize(zipStat.size)})`
  );

  // ── 2. List entries + guards ──────────────────────────────────────────────

  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sleeper-import-'));

  const zipListing = execFileSync('unzip', ['-Z1', zipAbs], { encoding: 'utf8' });
  const zipEntries = zipListing.split('\n').map(l => l.trim()).filter(Boolean);

  const snapshotEntries = zipEntries.filter(e => e.startsWith('snapshots/'));

  if (snapshotEntries.length === 0) {
    throw new Error(
      'The ZIP has no snapshots/ folder. This usually means the app export ran ' +
      'before the projection pipeline finished. Open a league in the app, let ' +
      'projections complete, re-export, then retry.'
    );
  }

  // Use selectMissingSnapshots with empty existing set to enumerate all valid dates.
  const allValidInZip = selectMissingSnapshots(zipEntries, new Set());
  if (allValidInZip.length === 0) {
    throw new Error(
      'The ZIP has a snapshots/ folder but no <date>.json inside it. ' +
      'This usually means the app export ran before the projection pipeline ' +
      'finished. Open a league in the app, let projections complete, re-export, ' +
      'then retry.'
    );
  }

  // ── 3. Compute the work set ───────────────────────────────────────────────

  const existing = new Set(
    listDir('snapshots').filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .map(f => f.slice(0, -'.json'.length))
  );
  const missing = selectMissingSnapshots(zipEntries, existing);

  // ── 4. Nothing to do ─────────────────────────────────────────────────────

  if (missing.length === 0) {
    console.log(`[import] All ${allValidInZip.length} snapshot(s) in the export are already present — nothing to do.`);
    process.exit(0);
  }

  // ── 5. Extract + copy each missing date ───────────────────────────────────

  const importedDates = [];
  const importedSizes = {};
  for (const { entry, date } of missing) {
    execFileSync('unzip', ['-o', '-j', zipAbs, entry, '-d', tmp]);
    const extracted = path.join(tmp, `${date}.json`);
    const destRel = `snapshots/${date}.json`;
    fs.copyFileSync(extracted, repoPath(destRel));
    const size = fs.statSync(repoPath(destRel)).size;
    importedDates.push(date);
    importedSizes[date] = size;
    console.log(`[import] Copied → ${destRel} (${humanSize(size)})`);
  }

  // ── 6. Register once ──────────────────────────────────────────────────────

  registerSnapshots({ dryRun: false });

  // ── 7. Verify each imported date is in manifest ───────────────────────────

  const manifest = readJson('manifest.json');
  for (const date of importedDates) {
    const destRel = `snapshots/${date}.json`;
    if (!manifest || !manifest.files || !manifest.files[destRel]) {
      throw new Error(
        'Copied the file but manifest registration skipped it (likely missing ' +
        'schemaVersion/capturedAt). The export may be malformed — re-export and retry.'
      );
    }
  }

  // ── 8. One commit, push with one rebase retry ─────────────────────────────

  git('add', ...importedDates.map(d => `snapshots/${d}.json`), 'manifest.json');

  // Defensive: nothing staged means files were already committed somehow.
  try {
    execFileSync('git', ['diff', '--cached', '--quiet'], { cwd: repoPath() });
    console.log('[import] No changes to commit.');
    process.exit(0);
  } catch {
    // Non-zero exit = there ARE staged changes — proceed.
  }

  const msg = importedDates.length === 1
    ? `snapshot: ${importedDates[0]}`
    : `snapshot: import ${importedDates.length} (${importedDates[0]}…${importedDates.at(-1)})`;
  git('commit', '-m', msg);
  const sha = git('rev-parse', '--short', 'HEAD').trim();

  try {
    git('push');
  } catch {
    console.log('[import] Push rejected — pulling --rebase and retrying once…');
    git('pull', '--rebase');
    git('push');
  }

  // ── 9. Success summary ────────────────────────────────────────────────────

  const dateLines = importedDates.map(d => `         • ${d} (${humanSize(importedSizes[d])})`).join('\n');
  console.log(
    `[import] ✓ ${importedDates.length} snapshot(s) imported\n` +
    `${dateLines}\n` +
    `         commit: ${sha}\n` +
    `         pushed to origin.`
  );

} catch (err) {
  console.error('[import] ' + err.message);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
} finally {
  if (tmp) {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

} // end if (isMain)
