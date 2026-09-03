/**
 * scripts/update-cfbd.mjs — Annual CFBD college stats writer.
 *
 * Fetches receiving, rushing, and passing stats from the College Football
 * Data API for a given year and writes them to:
 *   college/receiving/<year>.json
 *   college/rushing/<year>.json
 *   college/passing/<year>.json  (if --category is not specified)
 *
 * The API still returns long-form rows; this script pivots them before writing, so the
 * output is the pivoted envelope (college-pivot-phase-b.md §1.3/§2.2):
 *   { schemaVersion: 2, season, category, generatedAt, rowCount, playerCount, players }
 * `rowCount` is the fetched row count; `playerCount` is the pivoted map size — this repo's
 * rowCount-means-source-rows convention, matching gamelogs/teamcontext/oline.
 *
 * The CFBD_API_KEY environment variable must be set (loaded from .env via dotenv,
 * or set as a GitHub Actions secret).
 *
 * @param {object} opts
 * @param {number}  opts.year      CFBD year (required)
 * @param {string}  opts.category  One of 'receiving'|'rushing'|'passing', or null for all three
 * @param {boolean} opts.force     Overwrite completed files
 * @param {boolean} opts.dryRun    Fetch + validate but don't write
 */

import { fetchCfbdCategory, pivotCfbdRows } from '../lib/cfbd.mjs';
import { readJson, writeJsonStable, stableHash, deepSortKeys } from '../lib/io.mjs';
import { readManifest, updateManifestEntry } from '../lib/manifest.mjs';
import { validateCfbdCategory } from '../lib/validate.mjs';

// Deliberately order-sensitive by default — no normaliser (stable-hash.md §1.1/§2.1). Callers
// that need order-insensitivity (the pivoted-players dedup below) pass deepSortKeys explicitly;
// the default stays identity so other callers/tests keep their order-sensitive guarantee.
export const cfbdHash = (value, normalize) => stableHash(value, normalize);

const ALL_CATEGORIES = ['receiving', 'rushing', 'passing'];

export async function updateCfbd({ year, category, force, dryRun }) {
  if (!year) throw new Error('--year is required for the cfbd subcommand');

  const categories = category ? [category] : ALL_CATEGORIES;
  const manifest = readManifest();

  for (const cat of categories) {
    const dataPath = `college/${cat}/${year}.json`;
    const existingEntry = manifest.files[dataPath];
    const existing = readJson(dataPath);
    const existingPlayers = existing?.players ?? null;

    console.log(`\n[cfbd] Processing ${cat} ${year}…`);

    // 1. Fetch from CFBD API (still long-form)
    const rows = await fetchCfbdCategory(year, cat);

    // 2. Pivot, then validate the pivoted envelope (college-pivot-phase-b.md §2.2 — the
    // validator now rejects the raw array, so this must run AFTER the pivot and BEFORE every
    // dry-run branch below, or `cfbd --dry-run` throws instead of reporting).
    const players = pivotCfbdRows(rows);
    const playerCount = Object.keys(players).length;
    const envelope = {
      schemaVersion: 2,
      season: year,
      category: cat,
      generatedAt: new Date().toISOString(),
      rowCount: rows.length,
      playerCount,
      players,
    };
    validateCfbdCategory(envelope, cat, year);
    console.log(`[cfbd] ${cat} ${year}: validation passed (${rows.length} rows, ${playerCount} players)`);

    // 3. Idempotency / dry-run checks
    if (existing) {
      // Log any player count change for informational purposes
      if (existingPlayers && Object.keys(existingPlayers).length !== playerCount) {
        console.log(`[cfbd] ${dataPath}: player count changed ${Object.keys(existingPlayers).length} → ${playerCount}`);
      }

      // Dry-run: show what we would do and exit cleanly
      if (dryRun) {
        console.log(`[cfbd] [dry-run] would write ${dataPath}: ${rows.length} rows, ${playerCount} players`);
        continue;
      }

      // Completed file without --force: refuse
      if (existingEntry && !existingEntry.inProgress && !force) {
        console.error(
          `[cfbd] ${dataPath} already exists for a completed year. ` +
          `Existing: ${existingPlayers ? Object.keys(existingPlayers).length : '?'} players, new: ${playerCount} players. ` +
          'Pass --force to overwrite.'
        );
        process.exit(1);
      }

      // Content hash dedup — after force gate so --force always rewrites. Compares pivoted to
      // pivoted (§1.4.2) — comparing the on-disk pivoted envelope against a freshly-fetched
      // long-form array can never match. deepSortKeys neutralises both the playerId insertion
      // order and each record's statType key order, both inherited from CFBD's row order, so
      // two identical-content fetches returned in a different order don't hash differently and
      // trigger a spurious rewrite/commit/CDN purge.
      if (existingPlayers && cfbdHash(existingPlayers, deepSortKeys) === cfbdHash(players, deepSortKeys)) {
        console.log(`[cfbd] ${dataPath}: content unchanged — skipping.`);
        continue;
      }
    }

    // 4. Dry-run exit (no existing file case)
    if (dryRun) {
      console.log(`[cfbd] [dry-run] would write ${dataPath}: ${rows.length} rows, ${playerCount} players`);
      continue;
    }

    // 5. Write
    writeJsonStable(dataPath, envelope);
    console.log(`[cfbd] Wrote ${dataPath} (${rows.length} rows, ${playerCount} players)`);

    // 6. Update manifest (CFBD files for completed years are not in-progress)
    updateManifestEntry({
      path: dataPath,
      recordCount: playerCount,
      inProgress: false,
      schemaVersion: 2,
    });
    console.log(`[cfbd] Manifest updated for ${dataPath}`);
  }
}
