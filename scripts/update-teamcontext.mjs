/**
 * scripts/update-teamcontext.mjs — pbp-derived team-context (PROE, pace, RZ, defense-faced) writer.
 *
 * Fetches play_by_play_<year>.csv.gz from the nflverse pbp release, derives team-week context
 * via aggregateTeamContext (lib/nflverse.mjs), and writes nflverse/teamcontext/<year>.json.
 *
 * Key behaviours:
 *   - TEAM-keyed (not sleeper_id) — this repo's first team-keyed served family. No crosswalk
 *     read, no Action-ordering dependency (contrast update-gamelogs.mjs).
 *   - Team-week grain: one row per (team, gameId); each game emits an offense-view row and a
 *     defense-view row sharing the same underlying plays.
 *   - Era remap: pbp's current-franchise team codes are remapped to the era-accurate
 *     schedule/season-totals domain (eraTeam, lib/nflverse.mjs) — asserted by validateTeamContext.
 *   - Honest nulls: a rate is null on zero denominator, never fabricated; a bye week is simply
 *     an absent week (no placeholder row).
 *   - Coverage floor: MIN_TEAMCONTEXT_SEASON (2012) — aligns with season-totals/advstats/gamelogs.
 *   - 404/504: year not yet published → log and skip.
 *   - Sparsity gate: total team-game rows < MIN_TEAMCONTEXT_ROWS → preliminary, skip.
 *   - Wrong-asset guard: aggregateTeamContext throws if the CSV's own season column disagrees
 *     with the requested season (remap correctness depends on it) — season is asserted, not
 *     adopted (contrast gamelogs' `parsed ?? season` fallback).
 *   - Content-hash dedup: identical teams → no write, no manifest touch.
 *   - --force: required to overwrite completed past seasons.
 *   - inProgress: ALWAYS false (no app live fallback — CLAUDE.md invariant 5).
 *
 * @param {object}      opts
 * @param {number|null} opts.year    Season year; null = current season (from Sleeper API)
 * @param {boolean}     opts.all     Backfill every season ≥ MIN_TEAMCONTEXT_SEASON
 * @param {boolean}     opts.dryRun  Fetch + validate, print plan, no writes
 * @param {boolean}     opts.force   Overwrite a completed past-season file
 */

import crypto from 'crypto';
import {
  fetchPbpCsv, aggregateTeamContext, MIN_TEAMCONTEXT_ROWS, MIN_TEAMCONTEXT_SEASON,
} from '../lib/nflverse.mjs';
import { readJson, writeJsonStable, setStepOutput } from '../lib/io.mjs';
import { updateManifestEntry } from '../lib/manifest.mjs';
import { validateTeamContext } from '../lib/validate.mjs';
import { fetchCurrentNflSeason } from '../lib/sleeper.mjs';

function teamsHash(teams) {
  const sorted = Object.keys(teams).sort();
  const stable = Object.fromEntries(sorted.map(k => [k, teams[k]]));
  return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

export async function updateTeamContext({ year: yearOpt = null, all = false, dryRun = false, force = false } = {}) {
  const currentSeason = await fetchCurrentNflSeason();

  // Resolve target seasons
  let seasons;
  if (all) {
    seasons = Array.from(
      { length: currentSeason - MIN_TEAMCONTEXT_SEASON + 1 },
      (_, i) => MIN_TEAMCONTEXT_SEASON + i
    );
  } else if (yearOpt) {
    seasons = [yearOpt];
  } else {
    seasons = [currentSeason];
  }

  // No crosswalk read — team-keyed family, no Action-ordering dependency (contrast gamelogs).
  // Surface the season to the Actions purge step (single-season mode only — schedule pattern).
  if (!all) setStepOutput('season', seasons[0]);

  for (const season of seasons) {
    console.log(`[teamcontext] season=${season} | currentSeason=${currentSeason}`);
    const isPast = season < currentSeason;

    // Fetch — graceful skip on 404/504 (year not yet published)
    console.log(`[teamcontext] Fetching play_by_play_${season}.csv.gz…`);
    const csv = await fetchPbpCsv(season);
    if (csv === null) {
      console.log(`[teamcontext] season=${season} not published yet — skipping`);
      continue;
    }

    // Derive — throws on header drift or wrong-asset season mismatch
    const { teams, rowCount, teamCount } = aggregateTeamContext(csv, { season });
    console.log(`[teamcontext] Derived ${rowCount} team-game rows for season ${season}`);

    // Sparsity gate
    if (rowCount < MIN_TEAMCONTEXT_ROWS) {
      console.log(
        `[teamcontext] season=${season} only ${rowCount} team-game rows ` +
        `(< MIN_TEAMCONTEXT_ROWS=${MIN_TEAMCONTEXT_ROWS}) — treating as preliminary/partial, skipping`
      );
      continue;
    }

    // Validate
    validateTeamContext(teams, { year: season });
    console.log('[teamcontext] Validation passed');

    const dataPath = `nflverse/teamcontext/${season}.json`;
    const existing = readJson(dataPath);

    // Content-hash dedup
    const newHash  = teamsHash(teams);
    const lastHash = existing?.teams ? teamsHash(existing.teams) : null;
    if (newHash === lastHash) {
      console.log(`[teamcontext] Content identical to existing ${dataPath} — no change.`);
      continue;
    }

    // Dry-run exit
    if (dryRun) {
      const needsForce = isPast && existing && !force;
      console.log(
        `[teamcontext] [dry-run] would write ${dataPath}: ${rowCount} team-game rows, ` +
        `${teamCount} teams` +
        (needsForce ? ' (past season — needs --force to write for real)' : '')
      );
      continue;
    }

    // Force gate: completed past seasons require --force to overwrite
    if (isPast && existing && !force) {
      throw new Error(
        `[teamcontext] ${dataPath} already exists for completed season ${season}. ` +
        'Use --force to overwrite.'
      );
    }

    // Write
    writeJsonStable(dataPath, {
      schemaVersion: 1,
      season,
      generatedAt: new Date().toISOString(),
      rowCount,
      teamCount,
      teams,
    });
    console.log(`[teamcontext] Wrote ${dataPath} (${rowCount} team-game rows, ${teamCount} teams)`);

    // Manifest (inProgress: false — CLAUDE.md invariant 5, extended to teamcontext)
    updateManifestEntry({ path: dataPath, recordCount: rowCount, inProgress: false, schemaVersion: 1 });
    console.log('[teamcontext] Manifest updated');
  }
}
