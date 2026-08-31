/**
 * scripts/update-advstats.mjs — nflverse advanced receiving stats writer.
 *
 * Fetches stats_player_week_<year>.csv from the nflverse stats_player release asset,
 * recomputes season-level ratios from summed components (never aggregated weekly),
 * re-keys to sleeper_id via the local nflverse/playerids.json crosswalk, and writes
 * nflverse/advstats/<year>.json.
 *
 * Key behaviours:
 *   - Position scope: WR, TE, RB. Team denominators include all positions.
 *   - Week-restricted denominators for traded players (per-team, per-player-weeks).
 *   - 404/504: year not yet published → log and skip (like roster).
 *   - Sparsity gate: emitted count < MIN_ADVSTATS_ROWS → preliminary, skip.
 *   - Content-hash dedup: identical players → no write.
 *   - --force: required to overwrite completed past seasons.
 *   - inProgress: ALWAYS false (no app live fallback — CLAUDE.md invariant 5).
 *   - Missing crosswalk: throws in real runs (action-ordering bug); non-fatal in --dry-run.
 *
 * @param {object} opts
 * @param {number|null} opts.year          Season year; null = current season (from Sleeper API)
 * @param {boolean}     opts.dryRun        Fetch + validate, print plan, no writes
 * @param {boolean}     opts.force         Overwrite a completed past-season file
 * @param {string|null} opts.csv           Injected stats_player_week CSV text — skips the fetch
 *   when non-null (playerstats orchestrator single-fetch seam, §3.1). Standalone callers omit this.
 * @param {number|null} opts.currentSeason Injected current-season year — skips the Sleeper API call
 *   when non-null (same seam as `csv`; this script calls fetchCurrentNflSeason() unconditionally).
 */

import {
  fetchPlayerStatsCsv, aggregateAdvReceiving, rekeyBySleeper, MIN_ADVSTATS_ROWS,
} from '../lib/nflverse.mjs';
import { readJson, writeJsonStable, setStepOutput, stableHash, sortObjectKeys } from '../lib/io.mjs';
import { updateManifestEntry } from '../lib/manifest.mjs';
import { validateAdvStats } from '../lib/validate.mjs';
import { fetchCurrentNflSeason } from '../lib/sleeper.mjs';

export const playersHash = players => stableHash(players, sortObjectKeys);

export async function updateAdvStats({
  year: yearOpt = null, dryRun = false, force = false, csv: csvOpt = null, currentSeason: currentSeasonOpt = null,
} = {}) {
  // 1. Resolve year — currentSeason is injectable (playerstats orchestrator single-fetch seam, §3.1)
  const currentSeason = currentSeasonOpt ?? await fetchCurrentNflSeason();
  const year = yearOpt ?? currentSeason;
  const isPast = year < currentSeason;

  console.log(`[advstats] year=${year} | currentSeason=${currentSeason}`);
  // Surface the resolved NFL season to the Actions purge step (no-op locally).
  setStepOutput('season', year);

  // 2. Fetch — graceful skip on 404/504 (year not yet published). csv is injectable (§3.1);
  // an injected csv flows through the same null-skip branch as a fetched one.
  let csv = csvOpt;
  if (csv === null) {
    console.log(`[advstats] Fetching stats_player_week_${year}.csv…`);
    csv = await fetchPlayerStatsCsv(year);
  } else {
    console.log(`[advstats] Using injected stats_player_week_${year}.csv (single-fetch orchestrator)`);
  }
  if (csv === null) {
    console.log(`[advstats] year=${year} not published yet — skipping`);
    return;
  }

  // 3. Aggregate (WR/TE/RB, week-restricted denominators for traded players)
  const { byGsis, season, rowCount: aggCount } = aggregateAdvReceiving(csv);
  console.log(`[advstats] Aggregated ${aggCount} WR/TE/RB players from CSV`);

  // 4. Read crosswalk from disk (Phase 0a committed it; this Action runs Thursday, after Wednesday playerids)
  const cw = readJson('nflverse/playerids.json');
  if (!cw?.ids) {
    if (dryRun) {
      console.warn(
        '[advstats] [dry-run] WARNING: nflverse/playerids.json missing — ' +
        'crosswalk re-key skipped; aggregate-only plan reported above.'
      );
      return;
    }
    throw new Error(
      '[advstats] nflverse/playerids.json not found on disk. ' +
      "Run 'node bin/update.mjs playerids' first; the advstats Action runs Thursday, " +
      'after the Wednesday playerids Action.'
    );
  }

  // 5. Re-key gsis → sleeper_id
  const { players, unmapped } = rekeyBySleeper(byGsis, cw.ids);
  if (unmapped > 0) {
    console.log(`[advstats] ${unmapped} players had no crosswalk mapping — skipped`);
  }

  // 6. Sparsity gate
  const rowCount = Object.keys(players).length;
  if (rowCount < MIN_ADVSTATS_ROWS) {
    console.log(
      `[advstats] year=${year} only ${rowCount} players after re-key ` +
      `(< MIN_ADVSTATS_ROWS=${MIN_ADVSTATS_ROWS}) — treating as preliminary/partial, skipping`
    );
    return;
  }

  // 7. Validate
  validateAdvStats(players, { year });
  console.log('[advstats] Validation passed');

  const dataPath = `nflverse/advstats/${year}.json`;
  const existing = readJson(dataPath);

  // 8. Content-hash dedup
  const newHash  = playersHash(players);
  const lastHash = existing?.players ? playersHash(existing.players) : null;
  if (newHash === lastHash) {
    console.log(`[advstats] Content identical to existing ${dataPath} — no change.`);
    return;
  }

  // 9. Dry-run exit
  if (dryRun) {
    const needsForce = isPast && existing && !force;
    console.log(
      `[advstats] [dry-run] would write ${dataPath}: ${rowCount} players (${unmapped} unmapped)` +
      (needsForce ? ' (past season — needs --force to write for real)' : '')
    );
    return;
  }

  // 10. Force gate: completed past seasons require --force to overwrite
  if (isPast && existing && !force) {
    throw new Error(
      `[advstats] ${dataPath} already exists for completed season ${year}. ` +
      'Use --force to overwrite.'
    );
  }

  // 11. Write
  const output = {
    schemaVersion: 1,
    season:        season ?? year,
    generatedAt:   new Date().toISOString(),
    rowCount,
    unmapped,
    players,
  };
  writeJsonStable(dataPath, output);
  console.log(`[advstats] Wrote ${dataPath} (${rowCount} players)`);

  // 12. Update manifest (inProgress: false — CLAUDE.md invariant 5, extended to advstats)
  updateManifestEntry({
    path:          dataPath,
    recordCount:   rowCount,
    inProgress:    false,
    schemaVersion: 1,
  });
  console.log('[advstats] Manifest updated');
}
