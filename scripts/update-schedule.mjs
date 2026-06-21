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
 */
import crypto from 'crypto';
import { fetchSchedulesCsv, parseSchedulesCsv, MIN_SCHEDULE_GAMES } from '../lib/nflverse.mjs';
import { readJson, writeJsonStable, setStepOutput } from '../lib/io.mjs';
import { updateManifestEntry } from '../lib/manifest.mjs';
import { validateSchedule } from '../lib/validate.mjs';
import { fetchCurrentNflSeason } from '../lib/sleeper.mjs';

export function gamesHash(games) {
  // Sort by gameId for a stable hash regardless of CSV row order.
  const stable = [...games].sort((a, b) => (a.gameId < b.gameId ? -1 : a.gameId > b.gameId ? 1 : 0));
  return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

export async function updateSchedule({ year: yearOpt = null, all = false, dryRun = false, force = false } = {}) {
  const currentSeason = await fetchCurrentNflSeason();

  // Fetch once (combined CSV); throw on null — games.csv should always be published (draft analogue).
  console.log('[schedule] Fetching games.csv…');
  const csv = await fetchSchedulesCsv();
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
  if (!all) setStepOutput('season', seasons[0]);

  for (const season of seasons) {
    const games = gamesBySeason[String(season)] ?? [];
    const isPast = season < currentSeason;

    if (games.length === 0) {
      console.log(`[schedule] season ${season} not published yet — skipping`);
      continue;
    }
    if (games.length < MIN_SCHEDULE_GAMES) {
      console.log(`[schedule] season ${season} only ${games.length} games (< ${MIN_SCHEDULE_GAMES}) — preliminary, skipping`);
      continue;
    }

    validateSchedule(games, { year: season });

    const dataPath = `nflverse/schedule/${season}.json`;
    const existing = readJson(dataPath);
    const newHash  = gamesHash(games);
    const lastHash = existing?.games ? gamesHash(existing.games) : null;

    if (newHash === lastHash) {
      console.log(`[schedule] season ${season}: identical to ${dataPath} — no change.`);
      continue;
    }
    if (dryRun) {
      const needsForce = isPast && existing && !force;
      console.log(`[schedule] [dry-run] would write ${dataPath}: ${games.length} games` +
        (needsForce ? ' (past season — needs --force to write for real)' : ''));
      continue;
    }
    if (isPast && existing && !force) {
      throw new Error(`[schedule] ${dataPath} exists for completed season ${season}. Use --force to overwrite.`);
    }

    writeJsonStable(dataPath, {
      schemaVersion: 1,
      season,
      generatedAt:   new Date().toISOString(),
      rowCount:      games.length,
      games,
    });
    updateManifestEntry({ path: dataPath, recordCount: games.length, inProgress: false, schemaVersion: 1 });
    console.log(`[schedule] Wrote ${dataPath} (${games.length} games) + manifest`);
  }
}
