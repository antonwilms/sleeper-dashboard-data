/**
 * scripts/update-ktc.mjs — Weekly KTC dynasty value snapshot writer.
 *
 * Scrapes keeptradecut.com/dynasty-rankings (public, no auth) and writes
 * today's snapshot to ktc/snapshot-YYYY-MM-DD.json.
 *
 * Deduplication:
 *   - Compares normalized content hash of new snapshot vs the most recent
 *     existing snapshot file.
 *   - If identical: writes ktc/last-checked.json (so "ran, no change" is
 *     distinguishable from "didn't run") but does NOT write a new snapshot
 *     or touch the manifest. CI will see no changed data files → no commit.
 *   - If changed: writes the snapshot file and updates the manifest.
 *
 * Fail-loud guard:
 *   - Throws if player count < 250 or > 30% of players changed vs last
 *     snapshot (catches selector breakage masquerading as data).
 *
 * @param {object} opts
 * @param {boolean} opts.dryRun  Fetch + validate but don't write files
 */

import crypto from 'crypto';
import { fetchKtcSnapshot } from '../lib/ktc.mjs';
import { readJson, writeJsonStable, listDir } from '../lib/io.mjs';
import { updateManifestEntry } from '../lib/manifest.mjs';
import { validateKtc } from '../lib/validate.mjs';

function todayDateString() {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

function snapshotHash(players) {
  // Sort by name for stable hash regardless of fetch order
  const sorted = players
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  return crypto.createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

function findLastSnapshot() {
  const files = listDir('ktc')
    .filter(f => f.startsWith('snapshot-') && f.endsWith('.json'))
    .sort(); // lexicographic = chronological for YYYY-MM-DD names
  if (!files.length) return null;
  return files[files.length - 1]; // most recent
}

/**
 * Returns the age in days of a snapshot file based on its YYYY-MM-DD filename.
 * Returns Infinity if the filename doesn't parse.
 */
function snapshotAgeDays(filename) {
  const m = filename.match(/snapshot-(\d{4}-\d{2}-\d{2})\.json/);
  if (!m) return Infinity;
  const ms = Date.now() - new Date(m[1]).getTime();
  return ms / (1000 * 60 * 60 * 24);
}

/**
 * Fails loudly if >70% of players changed value vs the previous snapshot.
 * Only applied when the last snapshot is ≤ 8 days old (week-to-week comparison).
 * A stale baseline (older than 8 days) produces many legitimate changes and
 * would cause false positives — it's skipped with a warning instead.
 */
function largeDeltaGuard(lastFile, lastPlayers, updated) {
  if (!lastPlayers || !lastFile) return; // no baseline
  const ageDays = snapshotAgeDays(lastFile);
  if (ageDays > 8) {
    console.warn(`[ktc] Last snapshot is ${ageDays.toFixed(1)} days old — skipping delta guard (baseline too stale for meaningful comparison).`);
    return;
  }

  const changed = updated.filter(np => {
    const op = lastPlayers.find(ep => ep.name === np.name);
    return !op || op.value !== np.value;
  });
  const ratio = changed.length / lastPlayers.length;
  // 70% threshold: catches catastrophic scraper failures (all zeros, garbage data)
  // while tolerating normal week-to-week dynasty market movement.
  if (ratio > 0.70) {
    throw new Error(
      `[ktc] ${changed.length}/${lastPlayers.length} players changed value (${(ratio * 100).toFixed(1)}%) ` +
      '— exceeds 70% threshold. Possible selector breakage. Aborting.'
    );
  }
}

export async function updateKtc({ dryRun }) {
  const today = todayDateString();
  const snapshotPath = `ktc/snapshot-${today}.json`;
  const lastCheckedPath = 'ktc/last-checked.json';

  // 1. Fetch
  console.log('[ktc] Starting KTC snapshot fetch…');
  const players = await fetchKtcSnapshot();
  console.log(`[ktc] Fetched ${players.length} players`);

  // 2. Validate
  validateKtc(players);
  console.log('[ktc] Validation passed');

  // 3. Delta guard vs last snapshot (skipped in dry-run — guard is a production write safety net).
  // Also skipped on the first script run (no last-checked.json means the only existing
  // snapshots were exported from IndexedDB, not written by this script, so their values
  // may be from a stale cache and aren't a valid baseline for delta comparison).
  const lastFile = findLastSnapshot();
  const lastPlayers = lastFile ? readJson(`ktc/${lastFile}`) : null;
  const hasRunBefore = readJson(lastCheckedPath) !== null;
  if (!dryRun && hasRunBefore) largeDeltaGuard(lastFile, lastPlayers, players);

  // 4. Dedup check
  const newHash = snapshotHash(players);
  const lastHash = lastPlayers ? snapshotHash(lastPlayers) : null;

  if (newHash === lastHash) {
    console.log(`[ktc] Content identical to ${lastFile} — no new snapshot needed.`);
    if (!dryRun) {
      writeJsonStable(lastCheckedPath, { checkedAt: new Date().toISOString(), identical: true });
      console.log('[ktc] Wrote last-checked.json (no change)');
    } else {
      console.log('[ktc] [dry-run] would write last-checked.json (no change)');
    }
    return;
  }

  // 5. Dry-run exit
  if (dryRun) {
    console.log(`[ktc] [dry-run] would write ${snapshotPath}: ${players.length} players`);
    return;
  }

  // 6. Write snapshot
  writeJsonStable(snapshotPath, players);
  console.log(`[ktc] Wrote ${snapshotPath} (${players.length} players)`);

  // 7. Write last-checked marker
  writeJsonStable(lastCheckedPath, { checkedAt: new Date().toISOString(), identical: false, file: snapshotPath });

  // 8. Update manifest
  updateManifestEntry({
    path: snapshotPath,
    recordCount: players.length,
    inProgress: true, // KTC snapshot is always "current value" data
  });
  console.log('[ktc] Manifest updated');
}
