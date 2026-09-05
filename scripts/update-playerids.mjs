/**
 * scripts/update-playerids.mjs — nflverse gsis_id→sleeper_id crosswalk writer.
 *
 * Fetches db_playerids.csv from DynastyProcess (the file nflreadr::load_ff_playerids()
 * wraps), normalises to a gsis_id-keyed `ids` index plus a sleeper_id-keyed
 * `bySleeper` index, and writes both to nflverse/playerids.json (minified — D2,
 * schemaVersion 2).
 *
 * Key behaviours:
 *   - Content-hash dedup: if both `ids` and `bySleeper` are identical to the
 *     existing file → no write (D2 — a hash over `ids` alone would miss a week
 *     where only the 199 sleeper-only rows change).
 *   - Sparsity gate: rowCount < MIN_PLAYERID_ROWS → log + return (no write).
 *   - --dry-run: fetch + validate, print plan, no writes.
 *   - inProgress: false — internal-only family, no app loader (the loader was
 *     cut; see README.md's playerids `> *Note:*` and data-catalog.md's
 *     playerids row). This is convention parity with sibling nflverse
 *     ingests, not a live app dependency.
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

export const idsHash       = ids       => stableHash(ids, sortObjectKeys);
export const bySleeperHash = bySleeper => stableHash(bySleeper, sortObjectKeys);

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
  const { ids, bySleeper, rowCount, sleeperRowCount, sourceSeason } = parsePlayerIdsCsv(csv);
  console.log(`[playerids] Parsed ${rowCount} crosswalk rows (${sleeperRowCount} bySleeper)`);

  // 3. Sparsity gate — treat a truncated/partial fetch as preliminary, skip cleanly
  if (rowCount < MIN_PLAYERID_ROWS) {
    console.log(
      `[playerids] Only ${rowCount} crosswalk rows ` +
      `(< MIN_PLAYERID_ROWS=${MIN_PLAYERID_ROWS}) — treating as preliminary/partial, skipping`
    );
    return;
  }

  // 4. Validate shape (throws on format drift → red CI)
  validatePlayerIds(ids, bySleeper);
  console.log('[playerids] Validation passed');

  // 5. Content-hash dedup — compare both indexes. Hashing `ids` alone would miss
  // a week where only the sleeper-only rows change, leaving bySleeper to drift
  // from upstream with no write and no failing gate (D2 §D1).
  const existing = readJson(PLAYERIDS_PATH);
  const newIdsHash       = idsHash(ids);
  const newBySleeperHash = bySleeperHash(bySleeper);
  const lastIdsHash       = existing?.ids       ? idsHash(existing.ids)             : null;
  const lastBySleeperHash = existing?.bySleeper ? bySleeperHash(existing.bySleeper) : null;

  if (newIdsHash === lastIdsHash && newBySleeperHash === lastBySleeperHash) {
    console.log(`[playerids] Content identical to existing ${PLAYERIDS_PATH} — no change.`);
    return;
  }

  // 6. Dry-run exit
  if (dryRun) {
    console.log(`[playerids] [dry-run] would write ${PLAYERIDS_PATH}: ${rowCount} crosswalk rows, ${sleeperRowCount} bySleeper`);
    return;
  }

  // 7. Write (minified — v2 is a sevenfold size increase over v1; see D2 findings)
  const output = {
    schemaVersion: 2,
    generatedAt:   new Date().toISOString(),
    sourceSeason:  sourceSeason ?? null,
    rowCount,
    sleeperRowCount,
    ids,
    bySleeper,
  };
  writeJsonStable(PLAYERIDS_PATH, output, { minify: true });
  console.log(`[playerids] Wrote ${PLAYERIDS_PATH} (${rowCount} crosswalk rows, ${sleeperRowCount} bySleeper)`);

  // 8. Update manifest (inProgress: false — internal-only, no app loader)
  updateManifestEntry({
    path:          PLAYERIDS_PATH,
    recordCount:   rowCount,
    inProgress:    false,
    schemaVersion: 2,
  });
  console.log('[playerids] Manifest updated');
}
