/**
 * scripts/migrate-college-pivot.mjs — E2 Phase B one-shot college-stats rewrite.
 *
 * Rewrites every college/{passing,receiving,rushing}/<year>.json from today's long-form
 * row array into the pivoted envelope (college-pivot-phase-b.md §1.3/§2.1):
 *
 *   { schemaVersion: 2, season, category, generatedAt, rowCount, playerCount, players }
 *
 * `rowCount` is the SOURCE row count (this repo's convention — rowCount always means source
 * rows; see gamelogs/teamcontext/oline, which pair it with their own *Count key). `playerCount`
 * is the pivoted map size. Keeping rowCount preserves the original long-form row count as
 * provenance inside the file, which is otherwise lost the moment the textually-lossy pivot
 * (§1.1a) runs.
 *
 * Pure local transform of bytes already on disk — no network, no CFBD_API_KEY. Re-running the
 * live ingest across 27 files would need a key and would conflate this shape change with
 * whatever CFBD has revised since each file was written (§1.2) — the same confound the
 * advstats slice hit. This script never fetches.
 *
 * Idempotent: a file already at the pivoted envelope shape (schemaVersion 2, a `players` key)
 * is detected and skipped, not re-pivoted.
 *
 * Usage:
 *   node scripts/migrate-college-pivot.mjs             # rewrite + update manifest
 *   node scripts/migrate-college-pivot.mjs --dry-run    # report per-file before/after, no writes
 */

import { readJson, writeJsonStable, listDir } from '../lib/io.mjs';
import { readManifest, updateManifestEntry } from '../lib/manifest.mjs';
import { pivotCfbdRows } from '../lib/cfbd.mjs';

const CATEGORIES = ['passing', 'receiving', 'rushing'];

function isAlreadyPivoted(parsed) {
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    && typeof parsed.players === 'object' && parsed.players !== null;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const manifest = readManifest();

  const files = [];
  for (const category of CATEGORIES) {
    for (const name of listDir(`college/${category}`).filter(f => f.endsWith('.json')).sort()) {
      const year = Number(name.replace('.json', ''));
      files.push({ category, year, relPath: `college/${category}/${name}` });
    }
  }
  console.log(`[migrate-college-pivot] Found ${files.length} college file(s).`);

  let migrated = 0;
  let skipped = 0;

  for (const { category, year, relPath } of files) {
    const before = readJson(relPath);
    if (!before) {
      console.warn(`[migrate-college-pivot] ${relPath} missing — skipping`);
      continue;
    }

    if (isAlreadyPivoted(before)) {
      console.log(`[migrate-college-pivot] ${relPath}: already pivoted — skipping (idempotent).`);
      skipped++;
      continue;
    }

    const rowCount = before.length;
    const players = pivotCfbdRows(before);
    const playerCount = Object.keys(players).length;

    const envelope = {
      schemaVersion: 2,
      season: year,
      category,
      generatedAt: new Date().toISOString(),
      rowCount,
      playerCount,
      players,
    };

    if (dryRun) {
      console.log(`[migrate-college-pivot] [dry-run] ${relPath}: ${rowCount} rows → ${playerCount} players`);
      migrated++;
      continue;
    }

    writeJsonStable(relPath, envelope);

    const existingEntry = manifest.files[relPath] ?? {};
    updateManifestEntry({
      path: relPath,
      recordCount: playerCount,
      inProgress: existingEntry.inProgress ?? false,
      schemaVersion: 2,
    });

    console.log(`[migrate-college-pivot] ${relPath}: ${rowCount} rows → ${playerCount} players, schemaVersion → 2`);
    migrated++;
  }

  console.log(`[migrate-college-pivot] Done. ${migrated} file(s) migrated, ${skipped} already pivoted.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
