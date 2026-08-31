/**
 * scripts/update-playerids.mjs — nflverse gsis_id→sleeper_id crosswalk writer.
 *
 * Fetches db_playerids.csv from DynastyProcess (the file nflreadr::load_ff_playerids()
 * wraps), normalises to a gsis_id-keyed JSON, and writes to nflverse/playerids.json.
 *
 * Key behaviours:
 *   - Content-hash dedup: if ids identical to existing file → no write.
 *   - Sparsity gate: rowCount < MIN_PLAYERID_ROWS → log + return (no write).
 *   - --dry-run: fetch + validate, print plan, no writes.
 *   - inProgress: false (cross-repo contract — app reads it unconditionally).
 *   - No last-checked marker (mirrors draft pattern, not roster pattern).
 *
 * @param {object} opts
 * @param {boolean} opts.dryRun  Fetch + validate, print plan, no writes
 * @param {boolean} opts.force   (accepted for API consistency; not used)
 */

import { fetchPlayerIdsCsv, parsePlayerIdsCsv, MIN_PLAYERID_ROWS } from '../lib/nflverse.mjs';
import { readJson, writeJsonStable, stableHash, sortObjectKeys } from '../lib/io.mjs';
import { updateManifestEntry } from '../lib/manifest.mjs';
import { validatePlayerIds } from '../lib/validate.mjs';

const PLAYERIDS_PATH = 'nflverse/playerids.json';

export const idsHash = ids => stableHash(ids, sortObjectKeys);

export async function updatePlayerIds({ dryRun = false, force = false } = {}) {
  // 1. Fetch CSV (file should always exist — 404/504 is unexpected, throw)
  console.log('[playerids] Fetching db_playerids.csv…');
  const csv = await fetchPlayerIdsCsv();

  if (csv === null) {
    throw new Error(
      '[playerids] db_playerids.csv returned 404/504 — unexpected (file should always be published). ' +
      'Check https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv'
    );
  }

  // 2. Parse
  const { ids, rowCount, sourceSeason } = parsePlayerIdsCsv(csv);
  console.log(`[playerids] Parsed ${rowCount} crosswalk rows`);

  // 3. Sparsity gate — treat a truncated/partial fetch as preliminary, skip cleanly
  if (rowCount < MIN_PLAYERID_ROWS) {
    console.log(
      `[playerids] Only ${rowCount} crosswalk rows ` +
      `(< MIN_PLAYERID_ROWS=${MIN_PLAYERID_ROWS}) — treating as preliminary/partial, skipping`
    );
    return;
  }

  // 4. Validate shape (throws on format drift → red CI)
  validatePlayerIds(ids);
  console.log('[playerids] Validation passed');

  // 5. Content-hash dedup — compare sorted ids objects
  const existing = readJson(PLAYERIDS_PATH);
  const newHash  = idsHash(ids);
  const lastHash = existing?.ids ? idsHash(existing.ids) : null;

  if (newHash === lastHash) {
    console.log(`[playerids] Content identical to existing ${PLAYERIDS_PATH} — no change.`);
    return;
  }

  // 6. Dry-run exit
  if (dryRun) {
    console.log(`[playerids] [dry-run] would write ${PLAYERIDS_PATH}: ${rowCount} crosswalk rows`);
    return;
  }

  // 7. Write
  const output = {
    schemaVersion: 1,
    generatedAt:   new Date().toISOString(),
    sourceSeason:  sourceSeason ?? null,
    rowCount,
    ids,
  };
  writeJsonStable(PLAYERIDS_PATH, output);
  console.log(`[playerids] Wrote ${PLAYERIDS_PATH} (${rowCount} crosswalk rows)`);

  // 8. Update manifest (inProgress: false — cross-repo contract)
  updateManifestEntry({
    path:          PLAYERIDS_PATH,
    recordCount:   rowCount,
    inProgress:    false,
    schemaVersion: 1,
  });
  console.log('[playerids] Manifest updated');
}
