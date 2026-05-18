/**
 * scripts/update-nfl.mjs — Annual NFL season totals writer.
 *
 * Fetches all 18 regular-season weeks from Sleeper, aggregates into
 * per-player season totals, validates, and writes to
 * nfl/season-totals/<year>.json.
 *
 * Safe-by-default:
 *   - Completed-season file (inProgress: false in manifest): refuses unless --force.
 *   - In-progress year: silently overwrites (that's the point of inProgress: true).
 *   - Identical output: no-op (no write, no manifest touch).
 *   - --dry-run: fetch + validate + print diff, no writes.
 *
 * @param {object} opts
 * @param {number}  opts.year     NFL season year (required)
 * @param {boolean} opts.force    Overwrite completed-season files
 * @param {boolean} opts.dryRun   Fetch/validate but don't write
 */

import { fetchSeasonWeeks, aggregateWeeks, fetchCurrentNflSeason } from '../lib/sleeper.mjs';
import { readJson, writeJsonStable, diffSummary } from '../lib/io.mjs';
import { readManifest, updateManifestEntry } from '../lib/manifest.mjs';
import { validateNflSeason } from '../lib/validate.mjs';

export async function updateNfl({ year, force, dryRun }) {
  if (!year) throw new Error('--year is required for the nfl subcommand');

  const dataPath = `nfl/season-totals/${year}.json`;
  const manifest = readManifest();
  const existingEntry = manifest.files[dataPath];
  const existing = readJson(dataPath);

  const currentSeason = await fetchCurrentNflSeason();
  const inProgress = year >= currentSeason;

  console.log(`[nfl] Year: ${year} | inProgress: ${inProgress} | currentSeason: ${currentSeason}`);

  // 1. Fetch 18 weeks from Sleeper
  const weekData = await fetchSeasonWeeks(year);

  // 2. Aggregate into player totals
  const totals = aggregateWeeks(weekData);
  console.log(`[nfl] Aggregated: ${Object.keys(totals).length} players`);

  // 3. Validate (throws on failure → non-zero exit → red CI)
  validateNflSeason(totals, { year });
  console.log('[nfl] Validation passed');

  // 4. Idempotency / dry-run checks
  if (existing) {
    const summary = diffSummary(existing, totals);
    if (summary.identical) {
      console.log(`[nfl] No change for ${dataPath} — skipping write.`);
      return;
    }

    // Always show the diff summary
    console.log(`[nfl] Diff vs existing:\n${summary.text}`);

    // Dry-run: show what we would do and exit cleanly (bypass force requirement)
    if (dryRun) {
      console.log(`[nfl] [dry-run] would write ${dataPath}: ${Object.keys(totals).length} players`);
      return;
    }

    // Completed season: refuse unless --force (only applies when actually writing)
    if (existingEntry && !existingEntry.inProgress && !force) {
      console.error(`\n[nfl] ${dataPath} already exists for a completed season.`);
      console.error('Pass --force to overwrite.\n');
      process.exit(1);
    }
  }

  // 5. Dry-run exit (no existing file case)
  if (dryRun) {
    console.log(`[nfl] [dry-run] would write ${dataPath}: ${Object.keys(totals).length} players`);
    return;
  }

  // 6. Write
  writeJsonStable(dataPath, totals);
  console.log(`[nfl] Wrote ${dataPath} (${Object.keys(totals).length} players)`);

  // 7. Update manifest
  updateManifestEntry({
    path: dataPath,
    recordCount: Object.keys(totals).length,
    inProgress,
  });
  console.log(`[nfl] Manifest updated (inProgress=${inProgress})`);
}
