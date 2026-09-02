/**
 * scripts/update-schedule.mjs — nflverse schedules (games.csv) writer.
 *
 * Fetches the single combined nfldata games.csv, groups by season, and writes
 * per-season nflverse/schedule/<year>.json files.
 *
 * Modes:
 *   default              → write current season only (the weekly Action's mode).
 *   --year YYYY          → write that one season.
 *   --all                → backfill every season ≥ MIN_SCHEDULE_SEASON (manual).
 *
 * Key behaviours (mirror roster/advstats):
 *   - 0 rows for a season → "not published yet" → skip.
 *   - rowCount < MIN_SCHEDULE_GAMES → preliminary → skip.
 *   - Content-hash dedup per season: identical games → no write, no manifest touch.
 *   - --force required to overwrite a completed past season (year < currentSeason).
 *   - inProgress: ALWAYS false (CLAUDE.md invariant 5 — no app live fallback).
 *
 * @param {object} opts
 * @param {number|null} opts.year   Season; null = current (unless all).
 * @param {boolean}     opts.all    Backfill all seasons.
 * @param {boolean}     opts.dryRun Fetch + validate, print plan, no writes.
 * @param {boolean}     opts.force  Overwrite completed past-season files.
 * @param {object}      [opts.deps] Injectable I/O + fetch surface for tests — see DEFAULT_DEPS.
 */
import { fetchSchedulesCsv, parseSchedulesCsv, MIN_SCHEDULE_GAMES } from '../lib/nflverse.mjs';
import { readJson, writeJsonStable, setStepOutput, stableHash } from '../lib/io.mjs';
import { updateManifestEntry } from '../lib/manifest.mjs';
import { validateSchedule } from '../lib/validate.mjs';
import { fetchCurrentNflSeason } from '../lib/sleeper.mjs';
import { runSeasonKeyedIngest } from '../lib/seasonIngest.mjs';

// Sort by gameId for a stable hash regardless of CSV row order.
const byGameId = games => [...games].sort((a, b) => (a.gameId < b.gameId ? -1 : a.gameId > b.gameId ? 1 : 0));
export const gamesHash = games => stableHash(games, byGameId);

// Injectable I/O + fetch surface — mirrors scripts/update-nfl.mjs's DEFAULT_DEPS pattern
// (season-ingest-net.md §3.1). Structurally different from the other five: fetchSchedulesCsv
// takes no season argument and is called ONCE before the season loop (§3.1) — it fetches one
// combined games.csv, not a per-season asset.
export const DEFAULT_DEPS = {
  fetchCurrentNflSeason,
  fetchSchedulesCsv,
  readJson,
  writeJsonStable,
  updateManifestEntry,
  setStepOutput,
};

export async function updateSchedule({ year: yearOpt = null, all = false, dryRun = false, force = false, deps = {} } = {}) {
  const d = { ...DEFAULT_DEPS, ...deps };
  const currentSeason = await d.fetchCurrentNflSeason();

  // Fetch once (combined CSV); throw on null — games.csv should always be published (draft analogue).
  console.log('[schedule] Fetching games.csv…');
  const csv = await d.fetchSchedulesCsv();
  if (csv === null) {
    throw new Error(
      '[schedule] games.csv returned 404/504 — unexpected (file should always be published). ' +
      'Check https://github.com/nflverse/nfldata/blob/master/data/games.csv'
    );
  }

  const { gamesBySeason } = parseSchedulesCsv(csv);

  // Resolve target seasons
  let seasons;
  if (all)              seasons = Object.keys(gamesBySeason).map(Number).sort((a, b) => a - b);
  else if (yearOpt)     seasons = [yearOpt];
  else                  seasons = [currentSeason];

  // Surface the season to the Actions purge step (single-season modes only; no-op locally).
  // The weekly Action always runs default mode → this is currentSeason.
  if (!all) d.setStepOutput('season', seasons[0]);

  await runSeasonKeyedIngest({
    family: 'schedule',
    seasons,
    currentSeason,
    dryRun,
    force,
    deps: { readJson: d.readJson, writeJsonStable: d.writeJsonStable, updateManifestEntry: d.updateManifestEntry },
    dataPath: season => `nflverse/schedule/${season}.json`,
    derive: async season => gamesBySeason[String(season)] ?? [],
    rowCount: games => games.length,
    minRows: MIN_SCHEDULE_GAMES,
    minRowsLabel: 'games',
    validate: (games, { year }) => validateSchedule(games, { year }),
    hash: games => gamesHash(games),
    existingHash: existing => (existing?.games ? gamesHash(existing.games) : null),
    envelope: (season, games) => ({
      schemaVersion: 1,
      season,
      generatedAt:   new Date().toISOString(),
      rowCount:      games.length,
      games,
    }),
    manifestRecordCount: games => games.length,
  });
}
