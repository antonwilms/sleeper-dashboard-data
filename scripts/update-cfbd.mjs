/**
 * scripts/update-cfbd.mjs — Annual CFBD college stats writer.
 *
 * Fetches receiving, rushing, and passing stats from the College Football
 * Data API for a given year and writes them to:
 *   college/receiving/<year>.json
 *   college/rushing/<year>.json
 *   college/passing/<year>.json  (if --category is not specified)
 *
 * Output is a raw row array matching the shape stored by the app:
 *   [{ season, playerId, player, position, team, conference, category, statType, stat }]
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

import { fetchCfbdCategory } from '../lib/cfbd.mjs';
import { readJson, writeJsonStable } from '../lib/io.mjs';
import { readManifest, updateManifestEntry } from '../lib/manifest.mjs';
import { validateCfbdCategory } from '../lib/validate.mjs';

const ALL_CATEGORIES = ['receiving', 'rushing', 'passing'];

export async function updateCfbd({ year, category, force, dryRun }) {
  if (!year) throw new Error('--year is required for the cfbd subcommand');

  const categories = category ? [category] : ALL_CATEGORIES;
  const manifest = readManifest();

  for (const cat of categories) {
    const dataPath = `college/${cat}/${year}.json`;
    const existingEntry = manifest.files[dataPath];
    const existing = readJson(dataPath);

    console.log(`\n[cfbd] Processing ${cat} ${year}…`);

    // 1. Fetch from CFBD API
    const rows = await fetchCfbdCategory(year, cat);

    // 2. Validate
    validateCfbdCategory(rows, cat, year);
    console.log(`[cfbd] ${cat} ${year}: validation passed (${rows.length} rows)`);

    // 3. Idempotency / dry-run checks
    if (existing) {
      // Simple row-count comparison for CFBD (rows don't have a canonical "identity" diff)
      if (existing.length === rows.length) {
        console.log(`[cfbd] ${dataPath}: same row count (${rows.length}) — skipping.`);
        continue;
      }

      // Log the delta
      console.log(`[cfbd] ${dataPath}: row count changed ${existing.length} → ${rows.length}`);

      // Dry-run: show what we would do and exit cleanly
      if (dryRun) {
        console.log(`[cfbd] [dry-run] would write ${dataPath}: ${rows.length} rows`);
        continue;
      }

      // Completed file without --force: refuse
      if (existingEntry && !existingEntry.inProgress && !force) {
        console.error(
          `[cfbd] ${dataPath} already exists for a completed year. ` +
          `Existing: ${existing.length} rows, new: ${rows.length} rows. ` +
          'Pass --force to overwrite.'
        );
        process.exit(1);
      }
    }

    // 4. Dry-run exit (no existing file case)
    if (dryRun) {
      console.log(`[cfbd] [dry-run] would write ${dataPath}: ${rows.length} rows`);
      continue;
    }

    // 5. Write
    writeJsonStable(dataPath, rows);
    console.log(`[cfbd] Wrote ${dataPath} (${rows.length} rows)`);

    // 6. Update manifest (CFBD files for completed years are not in-progress)
    updateManifestEntry({
      path: dataPath,
      recordCount: rows.length,
      inProgress: false,
    });
    console.log(`[cfbd] Manifest updated for ${dataPath}`);
  }
}
