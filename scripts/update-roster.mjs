/**
 * scripts/update-roster.mjs — nflverse season roster writer.
 *
 * Fetches roster_<year>.csv from the nflverse rosters release asset, normalises
 * to a sleeper_id-keyed JSON, and writes to nflverse/roster/<year>.json.
 *
 * Key behaviours:
 *   - 404/504: year not yet published → log and exit 0 (app probe falls back to year-1).
 *   - Sparsity gate: rowCount < MIN_ROSTER_IDS → preliminary file, skip.
 *   - Content-hash dedup: if players identical to existing file → write
 *     nflverse/last-checked-roster.json only, no data write, no manifest touch.
 *   - --force: required to overwrite a completed past-season file (year < currentSeason).
 *     Current/upcoming season writes freely (it's the mutable weekly one).
 *   - inProgress: ALWAYS false — deliberate deviation from season-totals convention.
 *     The app has no live fallback for roster; it MUST get it from the store.
 *     Weekly mutability is handled by content-hash dedup + app lastModified check.
 *
 * @param {object} opts
 * @param {number|null} opts.year     Season year; null = current season (from Sleeper API)
 * @param {boolean}     opts.dryRun   Fetch + validate, print plan, no writes
 * @param {boolean}     opts.force    Overwrite a completed past-season file
 */

import crypto from 'crypto';
import { fetchRosterCsv, parseRosterCsv, MIN_ROSTER_IDS } from '../lib/nflverse.mjs';
import { readJson, writeJsonStable, setStepOutput } from '../lib/io.mjs';
import { updateManifestEntry } from '../lib/manifest.mjs';
import { validateRoster } from '../lib/validate.mjs';
import { fetchCurrentNflSeason } from '../lib/sleeper.mjs';

const LAST_CHECKED_PATH = 'nflverse/last-checked-roster.json';

export function playersHash(players) {
  // Sort keys for a stable hash regardless of insertion order
  const sorted = Object.keys(players).sort();
  const stable = Object.fromEntries(sorted.map(k => [k, players[k]]));
  return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

export async function updateRoster({ year: yearOpt = null, dryRun = false, force = false }) {
  // 1. Resolve year
  const currentSeason = await fetchCurrentNflSeason();
  const year = yearOpt ?? currentSeason;
  const isPast = year < currentSeason;

  console.log(`[roster] year=${year} | currentSeason=${currentSeason}`);
  // Surface the resolved NFL season to the Actions purge step (no-op locally).
  setStepOutput('season', year);

  // 2. Fetch — graceful skip on 404/504 (file not yet published)
  console.log(`[roster] Fetching roster_${year}.csv…`);
  const csv = await fetchRosterCsv(year);

  if (csv === null) {
    console.log(`[roster] year=${year} not published yet — skipping`);
    return;
  }

  // 3. Parse
  const { season, players, rowCount } = parseRosterCsv(csv);
  console.log(`[roster] Parsed ${rowCount} id-bearing players`);

  // 4. Sparsity gate — preliminary/offseason files have far fewer rows; skip cleanly
  if (rowCount < MIN_ROSTER_IDS) {
    console.log(
      `[roster] year=${year} only ${rowCount} id-bearing rows ` +
      `(< MIN_ROSTER_IDS=${MIN_ROSTER_IDS}) — treating as preliminary, skipping`
    );
    return;
  }

  // 5. Validate shape (throws on format drift → red CI)
  validateRoster(players, { year });
  console.log('[roster] Validation passed');

  const dataPath = `nflverse/roster/${year}.json`;
  const existing = readJson(dataPath);

  // 6. Content-hash dedup — compare sorted players objects
  const newHash  = playersHash(players);
  const lastHash = existing?.players ? playersHash(existing.players) : null;

  if (newHash === lastHash) {
    console.log(`[roster] Content identical to existing ${dataPath} — no write needed.`);
    if (!dryRun) {
      writeJsonStable(LAST_CHECKED_PATH, {
        checkedAt: new Date().toISOString(),
        year,
        identical: true,
      });
      console.log('[roster] Wrote nflverse/last-checked-roster.json (no change)');
    } else {
      console.log('[roster] [dry-run] would write last-checked-roster.json (no change)');
    }
    return;
  }

  // 7. Force gate: completed past seasons need --force to overwrite
  if (isPast && existing && !force) {
    throw new Error(
      `[roster] ${dataPath} already exists for completed season ${year}. ` +
      `Use --force to overwrite.`
    );
  }

  // 8. Dry-run exit
  if (dryRun) {
    console.log(`[roster] [dry-run] would write ${dataPath}: ${rowCount} players`);
    return;
  }

  // 9. Write data file
  const output = {
    schemaVersion: 1,
    season:        season ?? year,
    generatedAt:   new Date().toISOString(),
    rowCount,
    players,
  };
  writeJsonStable(dataPath, output);
  console.log(`[roster] Wrote ${dataPath} (${rowCount} players)`);

  // 10. Update manifest
  // inProgress: false — deliberate deviation (see module header + CLAUDE.md invariant)
  updateManifestEntry({
    path:         dataPath,
    recordCount:  rowCount,
    inProgress:   false,
    schemaVersion: 1,
  });
  console.log('[roster] Manifest updated');

  // 11. Update last-checked marker
  writeJsonStable(LAST_CHECKED_PATH, {
    checkedAt: new Date().toISOString(),
    year,
    identical: false,
    file:      dataPath,
  });
  console.log('[roster] Wrote nflverse/last-checked-roster.json');
}
