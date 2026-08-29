/**
 * scripts/migrate-manifest-truth.mjs — one-shot manifest backfill (C5).
 *
 * 38 manifest.json entries (14 raw/*, 24 college/*) were written before this repo's
 * migration to updateManifestEntry and carry no `lastModified` or `schemaVersion`.
 * updateManifestEntry cannot write a historical value — it always stamps `lastModified: now`
 * (lib/manifest.mjs) — so this script mutates the manifest object directly: readManifest(),
 * edit the 38 entries in place, writeJsonStable('manifest.json', manifest). No data file is
 * read or written; this is manifest-only.
 *
 * Follows scripts/migrate-f24-prune.mjs for structure only (one-shot, --dry-run, explicit
 * before/after guards, left in the tree) — NOT for its manifest write, which goes through
 * updateManifestEntry. That is the exact call this script must not use.
 *
 * What it writes, to the 38 entries selected on a strictly falsy `lastModified`:
 *   - lastModified: "2026-05-18T14:05:14.000Z" (UTC-normalized date of the single import
 *     commit all 38 share — verified 2026-08-29). This is honest about what the value means:
 *     "entered the repo on 2026-05-18", not per-file precision. Sufficient for its only
 *     consumer (src/api/cfbd.js:48 needs a valid date strictly older than any future refresh).
 *   - schemaVersion: 1 (matches the correctly-formed sibling entries and updateManifestEntry's
 *     own default).
 * Plus, on exactly the three named entries:
 *   - college/{passing,receiving,rushing}/2024.json: inProgress true → false (that season is
 *     complete; the 2025 trio is already correctly false with real timestamps).
 *
 * Usage:
 *   node scripts/migrate-manifest-truth.mjs            # rewrite + commit-ready write
 *   node scripts/migrate-manifest-truth.mjs --dry-run   # report only, no writes
 */

import { readManifest } from '../lib/manifest.mjs';
import { writeJsonStable } from '../lib/io.mjs';

const BACKFILL_LAST_MODIFIED = '2026-05-18T14:05:14.000Z';
const COLLEGE_2024_UNFLAG = [
  'college/passing/2024.json',
  'college/receiving/2024.json',
  'college/rushing/2024.json',
];

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const manifest = readManifest();

  const entryCountBefore = Object.keys(manifest.files).length;
  const before = JSON.parse(JSON.stringify(manifest.files));

  const targets = Object.entries(manifest.files).filter(([, entry]) => !entry.lastModified);
  console.log(`[migrate-manifest-truth] Found ${targets.length} entries with no lastModified.`);

  for (const [path, entry] of targets) {
    entry.lastModified = BACKFILL_LAST_MODIFIED;
    entry.schemaVersion = 1;
    if (dryRun) {
      console.log(`[migrate-manifest-truth] [dry-run] ${path}: would set lastModified + schemaVersion:1`);
    }
  }

  for (const path of COLLEGE_2024_UNFLAG) {
    const entry = manifest.files[path];
    if (!entry) {
      throw new Error(`[migrate-manifest-truth] ${path} not found in manifest — refusing to write.`);
    }
    if (entry.inProgress !== true) {
      throw new Error(`[migrate-manifest-truth] ${path}: expected inProgress:true before the flip, found ${entry.inProgress} — refusing to write.`);
    }
    entry.inProgress = false;
    if (dryRun) {
      console.log(`[migrate-manifest-truth] [dry-run] ${path}: would set inProgress false`);
    }
  }

  // Guards — enforced whether or not this is a dry run, against the in-memory result.
  const entryCountAfter = Object.keys(manifest.files).length;
  if (entryCountAfter !== entryCountBefore) {
    throw new Error(`[migrate-manifest-truth] entry count changed: ${entryCountBefore} → ${entryCountAfter} — refusing to write.`);
  }

  for (const [path, entry] of Object.entries(manifest.files)) {
    const wasBackfilled = targets.some(([p]) => p === path);
    if (!wasBackfilled) {
      // Untouched entries must be byte-identical.
      if (JSON.stringify(entry) !== JSON.stringify(before[path])) {
        throw new Error(`[migrate-manifest-truth] ${path}: was not selected for backfill but changed — refusing to write.`);
      }
      continue;
    }
    const beforeEntry = before[path];
    if (entry.recordCount !== beforeEntry.recordCount) {
      throw new Error(`[migrate-manifest-truth] ${path}: recordCount changed — refusing to write.`);
    }
    if (entry.originalKey !== beforeEntry.originalKey) {
      throw new Error(`[migrate-manifest-truth] ${path}: originalKey changed — refusing to write.`);
    }
    const expectedInProgress = COLLEGE_2024_UNFLAG.includes(path) ? false : beforeEntry.inProgress;
    if (entry.inProgress !== expectedInProgress) {
      throw new Error(`[migrate-manifest-truth] ${path}: inProgress changed unexpectedly — refusing to write.`);
    }
  }

  console.log(
    `[migrate-manifest-truth] ${targets.length} entries backfilled (lastModified + schemaVersion), ` +
    `${COLLEGE_2024_UNFLAG.length} college/2024 entries unflagged. Entry count unchanged at ${entryCountAfter}.`
  );

  if (dryRun) {
    console.log('[migrate-manifest-truth] [dry-run] no write performed.');
    return;
  }

  manifest.generatedAt = new Date().toISOString();
  writeJsonStable('manifest.json', manifest);
  console.log('[migrate-manifest-truth] manifest.json written.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
