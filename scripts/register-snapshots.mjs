/**
 * scripts/register-snapshots.mjs — Manifest registration for snapshot files.
 *
 * Scans snapshots/*.json and calls updateManifestEntry for any file that is
 * either absent from the manifest or whose manifest lastModified predates the
 * file's mtime (indicating the file was updated since last registration).
 *
 * No fetching, no validation beyond the required top-level fields.
 * Use after: extracting the export ZIP, copying snapshots/<date>.json into
 * this repo, then running `node bin/update.mjs snapshots` (or `npm run update`).
 *
 * Manual workflow:
 *   1. Click "Export data" in the app.
 *   2. Unzip the download.
 *   3. Copy snapshots/<date>.json → <this repo>/snapshots/<date>.json
 *   4. node bin/update.mjs snapshots
 *   5. git add snapshots/<date>.json manifest.json && git commit -m "..."
 *
 * @param {object} opts
 * @param {boolean} opts.dryRun  Print what would be registered, no writes.
 */

import { readJson, listDir } from '../lib/io.mjs';
import { readManifest, updateManifestEntry } from '../lib/manifest.mjs';

/**
 * Returns true when a snapshot should be skipped because its content fingerprint
 * (recordCount + schemaVersion) matches the existing manifest entry.
 * Snapshots are immutable, so matching both ⟹ file is unchanged.
 * This is robust to fresh-clone/CI checkout where all mtimes equal checkout time.
 */
export function shouldSkipSnapshot(existing, recordCount, schemaVersion) {
  return existing != null &&
    existing.recordCount === recordCount &&
    existing.schemaVersion === schemaVersion;
}

export function registerSnapshots({ dryRun = false } = {}) {
  const snapshotDir = 'snapshots';
  const files = listDir(snapshotDir).filter(f => f.endsWith('.json'));

  if (files.length === 0) {
    console.log('[snapshots] No snapshot files found in snapshots/');
    return;
  }

  const manifest = readManifest();

  let registered = 0;
  let skipped = 0;

  for (const filename of files.sort()) {
    const relPath = `${snapshotDir}/${filename}`;
    const existing = manifest.files[relPath];

    // Parse first to get the content fingerprint (recordCount + schemaVersion).
    const parsed = readJson(relPath);
    if (!parsed) {
      console.warn(`[snapshots] Could not parse ${relPath} — skipping`);
      skipped++;
      continue;
    }

    // Minimal shape check: must have schemaVersion and capturedAt.
    if (typeof parsed.schemaVersion !== 'number' || !parsed.capturedAt) {
      console.warn(`[snapshots] ${relPath} missing schemaVersion or capturedAt — skipping`);
      skipped++;
      continue;
    }

    const recordCount = typeof parsed.players === 'object' && parsed.players !== null
      ? Object.keys(parsed.players).length
      : 0;

    // Skip if already registered with a matching content fingerprint.
    if (shouldSkipSnapshot(existing, recordCount, parsed.schemaVersion)) {
      console.log(`[snapshots] Already current: ${relPath}`);
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`[snapshots] [dry-run] would register ${relPath} (${recordCount} players, schemaVersion ${parsed.schemaVersion})`);
      registered++;
      continue;
    }

    updateManifestEntry({
      path:          relPath,
      recordCount,
      inProgress:    false,
      schemaVersion: parsed.schemaVersion ?? 1,
    });

    console.log(`[snapshots] Registered ${relPath} (${recordCount} players)`);
    registered++;
  }

  console.log(`[snapshots] Done: ${registered} registered, ${skipped} skipped.`);
}
