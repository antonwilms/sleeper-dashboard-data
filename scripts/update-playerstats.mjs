/**
 * scripts/update-playerstats.mjs — single-fetch orchestrator for the advstats + gamelogs
 * families (playerstats-single-fetch.md).
 *
 * Named for the upstream asset (stats_player_week_<year>.csv), not either consumer — it
 * belongs to neither family. Resolves the season and fetches the CSV ONCE, then drives
 * updateAdvStats() and updateGameLogs() off the shared csv/currentSeason (§3.1's injection
 * seam), each with its own filters (advstats REG-only, gamelogs REG+POST) unchanged.
 *
 * Failure isolation (§3.3): a throw from one family is caught and does NOT stop the other
 * from running. The two per-family outcomes are surfaced as step outputs so the Actions
 * workflow can stage only the families that actually completed — never `nflverse/` wholesale,
 * since both scripts write their data file before registering it in manifest.json (Invariant 3).
 * The orchestrator still exits non-zero (throws) if either family failed, so a silent partial
 * failure is never mistaken for a clean run.
 *
 * `--all` is a different mode (§1.5) and is not driven through this orchestrator — it stays on
 * gamelogs' standalone entry point.
 *
 * @param {object}      opts
 * @param {number|null} opts.year    Season year; null = current season (from Sleeper API)
 * @param {boolean}     opts.dryRun  Fetch + validate, print plan, no writes
 * @param {boolean}     opts.force   Overwrite a completed past-season file
 * @param {object}      [opts.deps]  Injectable { updateAdvStats, updateGameLogs } surface for
 *   tests — see DEFAULT_DEPS. Mirrors the DEFAULT_DEPS/DEFAULT_LOAD seam already used by
 *   scripts/update-nfl.mjs, scripts/panel-run.mjs and scripts/grade-snapshot.mjs.
 */

import { fetchPlayerStatsCsv } from '../lib/nflverse.mjs';
import { fetchCurrentNflSeason } from '../lib/sleeper.mjs';
import { setStepOutput } from '../lib/io.mjs';
import { updateAdvStats } from './update-advstats.mjs';
import { updateGameLogs } from './update-gamelogs.mjs';

// Injectable updater surface — lets §3.3's failure-isolation control flow be unit-tested with
// throwing stubs instead of network-touching real updaters (or experimental module mocking).
export const DEFAULT_DEPS = { updateAdvStats, updateGameLogs };

export async function updatePlayerStats({
  year: yearOpt = null, dryRun = false, force = false, deps = DEFAULT_DEPS,
} = {}) {
  const d = { ...DEFAULT_DEPS, ...deps };
  // 1-2. Resolve the season once.
  const currentSeason = await fetchCurrentNflSeason();
  const season = yearOpt ?? currentSeason;

  console.log(`[playerstats] season=${season} | currentSeason=${currentSeason}`);
  // The orchestrator owns this output (§1.4) — advstats/gamelogs still set it on their
  // standalone paths, which is harmless (same value); what matters is the orchestrator
  // does not rely on a callee to set it.
  setStepOutput('season', season);

  // 3. Fetch once — graceful skip on 404/504 (year not yet published), matching today's
  // per-family behaviour. Neither family is invoked in that case.
  console.log(`[playerstats] Fetching stats_player_week_${season}.csv…`);
  const csv = await fetchPlayerStatsCsv(season);
  if (csv === null) {
    console.log(`[playerstats] season=${season} not published yet — skipping both families`);
    setStepOutput('advstats_ok', true);
    setStepOutput('gamelogs_ok', true);
    return { advstatsOk: true, gamelogsOk: true };
  }

  // 4-5. Drive both families off the shared csv/currentSeason. Each failure is isolated
  // (§3.3) — a throw from one does not prevent the other from running.
  let advstatsOk = true;
  try {
    await d.updateAdvStats({ year: season, csv, currentSeason, dryRun, force });
  } catch (err) {
    advstatsOk = false;
    console.error(`[playerstats] advstats failed: ${err.message}`);
  }

  let gamelogsOk = true;
  try {
    await d.updateGameLogs({ year: season, csv, currentSeason, dryRun, force });
  } catch (err) {
    gamelogsOk = false;
    console.error(`[playerstats] gamelogs failed: ${err.message}`);
  }

  setStepOutput('advstats_ok', advstatsOk);
  setStepOutput('gamelogs_ok', gamelogsOk);

  if (!advstatsOk || !gamelogsOk) {
    throw new Error(
      `[playerstats] one or more families failed: ` +
      `advstats=${advstatsOk ? 'ok' : 'failed'} gamelogs=${gamelogsOk ? 'ok' : 'failed'}`
    );
  }

  return { advstatsOk, gamelogsOk };
}
