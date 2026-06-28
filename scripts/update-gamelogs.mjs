/**
 * scripts/update-gamelogs.mjs — nflverse per-game player stats (gamelogs) writer.
 *
 * Fetches stats_player_week_<year>.csv from the nflverse player_stats release asset
 * (same source as advstats — reuses fetchPlayerStatsCsv), parses per-game rows for
 * QB/RB/WR/TE/FB, re-keys to sleeper_id via the local nflverse/playerids.json crosswalk,
 * and writes nflverse/gamelogs/<year>.json.
 *
 * Key behaviours:
 *   - Position scope: QB, RB, WR, TE, FB. def_* / ST / kicking out of scope.
 *   - Per-game grain: one games[] element per player per game row.
 *   - Honest nulls (omit-on-null): empty string / 'NA' → null → key omitted; '0' → 0 kept.
 *   - Per-game rate fields (targetShare, wopr, etc.) stored verbatim — never sum them;
 *     to get a season figure, recompute from components (the pass_rtg/cmp_pct trap).
 *   - fantasyPoints* are nflverse default scoring — NOT Sleeper/app scoring; never feed
 *     grading/projection.
 *   - Coverage floor: MIN_GAMELOG_SEASON (2012) — charting era; aligns with advstats.
 *   - 404/504: year not yet published → log and skip.
 *   - Sparsity gate: total game rows < MIN_PLAYERGAME_ROWS → preliminary, skip.
 *   - Content-hash dedup: identical players → no write, no manifest touch.
 *   - --force: required to overwrite completed past seasons.
 *   - inProgress: ALWAYS false (no app live fallback — CLAUDE.md invariant 5).
 *   - Missing crosswalk: throws in real runs (action-ordering bug); non-fatal in --dry-run.
 *
 * @param {object}      opts
 * @param {number|null} opts.year    Season year; null = current season (from Sleeper API)
 * @param {boolean}     opts.all     Backfill every season ≥ MIN_GAMELOG_SEASON
 * @param {boolean}     opts.dryRun  Fetch + validate, print plan, no writes
 * @param {boolean}     opts.force   Overwrite a completed past-season file
 */

import crypto from 'crypto';
import {
  fetchPlayerStatsCsv, parsePlayerGameLogs, rekeyGameLogsBySleeper,
  MIN_PLAYERGAME_ROWS, MIN_GAMELOG_SEASON,
} from '../lib/nflverse.mjs';
import { readJson, writeJsonStable, setStepOutput } from '../lib/io.mjs';
import { updateManifestEntry } from '../lib/manifest.mjs';
import { validateGameLogs } from '../lib/validate.mjs';
import { fetchCurrentNflSeason } from '../lib/sleeper.mjs';

function playersHash(players) {
  const sorted = Object.keys(players).sort();
  const stable = Object.fromEntries(sorted.map(k => [k, players[k]]));
  return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

export async function updateGameLogs({ year: yearOpt = null, all = false, dryRun = false, force = false } = {}) {
  const currentSeason = await fetchCurrentNflSeason();

  // Resolve target seasons
  let seasons;
  if (all) {
    seasons = Array.from(
      { length: currentSeason - MIN_GAMELOG_SEASON + 1 },
      (_, i) => MIN_GAMELOG_SEASON + i
    );
  } else if (yearOpt) {
    seasons = [yearOpt];
  } else {
    seasons = [currentSeason];
  }

  // Read crosswalk once before the loop (runs Wednesday; gamelogs Action runs Saturday)
  const cw = readJson('nflverse/playerids.json');
  if (!cw?.ids) {
    if (dryRun) {
      console.warn(
        '[gamelogs] [dry-run] WARNING: nflverse/playerids.json missing — ' +
        'crosswalk re-key skipped; parse-only plan reported above.'
      );
      return;
    }
    throw new Error(
      '[gamelogs] nflverse/playerids.json not found on disk. ' +
      "Run 'node bin/update.mjs playerids' first; the gamelogs Action runs Saturday, " +
      'after the Wednesday playerids Action.'
    );
  }

  // Surface the season to the Actions purge step (single-season mode only — schedule pattern).
  // --all is a manual backfill; no season output (and no purge) needed.
  if (!all) setStepOutput('season', seasons[0]);

  for (const season of seasons) {
    console.log(`[gamelogs] season=${season} | currentSeason=${currentSeason}`);
    const isPast = season < currentSeason;

    // Fetch — graceful skip on 404/504 (year not yet published)
    console.log(`[gamelogs] Fetching stats_player_week_${season}.csv…`);
    const csv = await fetchPlayerStatsCsv(season);
    if (csv === null) {
      console.log(`[gamelogs] season=${season} not published yet — skipping`);
      continue;
    }

    // Parse — per-game rows for QB/RB/WR/TE/FB
    const { byGsis, season: parsed, rowCount: parsedRowCount } = parsePlayerGameLogs(csv);
    console.log(`[gamelogs] Parsed ${parsedRowCount} game rows for season ${season}`);

    // Re-key gsis → sleeper_id
    const { players, unmapped } = rekeyGameLogsBySleeper(byGsis, cw.ids);
    if (unmapped > 0) console.log(`[gamelogs] ${unmapped} players had no crosswalk mapping — skipped`);

    const playerCount = Object.keys(players).length;
    const rowCount    = Object.values(players).reduce((s, p) => s + p.games.length, 0);

    // Sparsity gate (on parsed total — catches truncated fetches regardless of crosswalk gaps)
    if (parsedRowCount < MIN_PLAYERGAME_ROWS) {
      console.log(
        `[gamelogs] season=${season} only ${parsedRowCount} game rows ` +
        `(< MIN_PLAYERGAME_ROWS=${MIN_PLAYERGAME_ROWS}) — treating as preliminary/partial, skipping`
      );
      continue;
    }

    // Validate
    validateGameLogs(players, { year: season });
    console.log('[gamelogs] Validation passed');

    const dataPath = `nflverse/gamelogs/${season}.json`;
    const existing = readJson(dataPath);

    // Content-hash dedup
    const newHash  = playersHash(players);
    const lastHash = existing?.players ? playersHash(existing.players) : null;
    if (newHash === lastHash) {
      console.log(`[gamelogs] Content identical to existing ${dataPath} — no change.`);
      continue;
    }

    // Dry-run exit
    if (dryRun) {
      const needsForce = isPast && existing && !force;
      console.log(
        `[gamelogs] [dry-run] would write ${dataPath}: ${rowCount} game rows, ` +
        `${playerCount} players (${unmapped} unmapped)` +
        (needsForce ? ' (past season — needs --force to write for real)' : '')
      );
      continue;
    }

    // Force gate: completed past seasons require --force to overwrite
    if (isPast && existing && !force) {
      throw new Error(
        `[gamelogs] ${dataPath} already exists for completed season ${season}. ` +
        'Use --force to overwrite.'
      );
    }

    // Write
    writeJsonStable(dataPath, {
      schemaVersion: 1,
      season:        parsed ?? season,
      generatedAt:   new Date().toISOString(),
      rowCount,
      playerCount,
      unmapped,
      players,
    });
    console.log(`[gamelogs] Wrote ${dataPath} (${rowCount} game rows, ${playerCount} players)`);

    // Manifest (inProgress: false — CLAUDE.md invariant 5, extended to gamelogs)
    updateManifestEntry({ path: dataPath, recordCount: rowCount, inProgress: false, schemaVersion: 1 });
    console.log('[gamelogs] Manifest updated');
  }
}
