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
 * @param {object}      [opts.deps]  Injectable I/O + fetch surface for tests — see DEFAULT_DEPS.
 */

import {
  fetchPbpCsv, aggregateTeamContext, MIN_TEAMCONTEXT_ROWS, MIN_TEAMCONTEXT_SEASON,
} from '../lib/nflverse.mjs';
import { readJson, writeJsonStable, setStepOutput, stableHash, sortObjectKeys } from '../lib/io.mjs';
import { updateManifestEntry } from '../lib/manifest.mjs';
import { validateTeamContext } from '../lib/validate.mjs';
import { fetchCurrentNflSeason } from '../lib/sleeper.mjs';
import { runSeasonKeyedIngest } from '../lib/seasonIngest.mjs';

export const teamsHash = teams => stableHash(teams, sortObjectKeys);

// Injectable I/O + fetch surface — mirrors scripts/update-nfl.mjs's DEFAULT_DEPS pattern
// (season-ingest-net.md §3.1).
export const DEFAULT_DEPS = {
  fetchCurrentNflSeason,
  fetchPbpCsv,
  readJson,
  writeJsonStable,
  updateManifestEntry,
  setStepOutput,
};

export async function updateTeamContext({ year: yearOpt = null, all = false, dryRun = false, force = false, deps = {} } = {}) {
  const d = { ...DEFAULT_DEPS, ...deps };
  const currentSeason = await d.fetchCurrentNflSeason();

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
  if (!all) d.setStepOutput('season', seasons[0]);

  await runSeasonKeyedIngest({
    family: 'teamcontext',
    seasons,
    currentSeason,
    dryRun,
    force,
    deps: { readJson: d.readJson, writeJsonStable: d.writeJsonStable, updateManifestEntry: d.updateManifestEntry },
    dataPath: season => `nflverse/teamcontext/${season}.json`,
    derive: async season => {
      console.log(`[teamcontext] season=${season} | currentSeason=${currentSeason}`);

      // Fetch — graceful skip on 404/504 (year not yet published)
      console.log(`[teamcontext] Fetching play_by_play_${season}.csv.gz…`);
      const csv = await d.fetchPbpCsv(season);
      if (csv === null) return null;

      // Derive — throws on header drift or wrong-asset season mismatch
      const derived = aggregateTeamContext(csv, { season });
      console.log(`[teamcontext] Derived ${derived.rowCount} team-game rows for season ${season}`);
      return derived;
    },
    rowCount: derived => derived.rowCount,
    minRows: MIN_TEAMCONTEXT_ROWS,
    validate: (derived, { year }) => {
      validateTeamContext(derived.teams, { year });
      console.log('[teamcontext] Validation passed');
    },
    hash: derived => teamsHash(derived.teams),
    existingHash: existing => (existing?.teams ? teamsHash(existing.teams) : null),
    envelope: (season, derived) => ({
      schemaVersion: 1,
      season,
      generatedAt: new Date().toISOString(),
      rowCount:    derived.rowCount,
      teamCount:   derived.teamCount,
      teams:       derived.teams,
    }),
    manifestRecordCount: derived => derived.rowCount,
    messages: {
      notPublished: season => `[teamcontext] season=${season} not published yet — skipping`,
      sparsity: (season, rc) =>
        `[teamcontext] season=${season} only ${rc} team-game rows ` +
        `(< MIN_TEAMCONTEXT_ROWS=${MIN_TEAMCONTEXT_ROWS}) — treating as preliminary/partial, skipping`,
      dedup: (season, path) => `[teamcontext] Content identical to existing ${path} — no change.`,
      dryRun: (season, path, derived, needsForce) =>
        `[teamcontext] [dry-run] would write ${path}: ${derived.rowCount} team-game rows, ` +
        `${derived.teamCount} teams` +
        (needsForce ? ' (past season — needs --force to write for real)' : ''),
      forceGate: (season, path) =>
        `[teamcontext] ${path} already exists for completed season ${season}. Use --force to overwrite.`,
      afterWrite: (season, path, derived) =>
        `[teamcontext] Wrote ${path} (${derived.rowCount} team-game rows, ${derived.teamCount} teams)`,
      afterManifest: () => '[teamcontext] Manifest updated',
    },
  });
}
