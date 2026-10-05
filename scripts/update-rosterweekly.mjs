/**
 * scripts/update-rosterweekly.mjs — nflverse weekly roster status writer (internal family).
 *
 * Fetches roster_weekly_<year>.csv from the nflverse weekly_rosters release asset, keeps REG
 * rows, keys them by sleeper_id (the row's own sleeper_id, else nflverse/playerids.json `.ids`
 * by gsis_id), maps 2012–2015 GSIS team codes to the schedule domain, and writes
 * nflverse/rosterweekly/<year>.json: players[sleeperId][week] = [[team, status], …].
 *
 * Key behaviours:
 *   - INTERNAL (absence-classification-a.md D5): the app never reads this family. It feeds
 *     scripts/update-nfl.mjs and the Stage C migration through lib/absence.mjs
 *     `classifyAbsences`, which owns the D1 status set and the 2016 classification floor.
 *   - Coverage floor: MIN_ROSTERWEEKLY_SEASON (2012). A below-floor `--year` is rejected before
 *     the spine sees it.
 *   - Sparsity: the spine's `minRows` is 1 (as snaps); validateRosterWeekly is the real gate.
 *   - Content-hash dedup over a deep-key-sorted `players` — nested week keys arrive in CSV order.
 *   - Written minified (1.3–2.7 MB per season pretty-printed; 0.34–0.73 MB minified).
 *   - --force: required to overwrite completed past seasons. inProgress: ALWAYS false.
 *
 * @param {object}      opts
 * @param {number|null} opts.year    Season year; null = current season (from Sleeper API)
 * @param {boolean}     opts.all     Backfill every season ≥ MIN_ROSTERWEEKLY_SEASON
 * @param {boolean}     opts.dryRun  Fetch + validate, print plan, no writes
 * @param {boolean}     opts.force   Overwrite a completed past-season file
 * @param {object}      [opts.deps]  Injectable I/O + fetch surface for tests — see DEFAULT_DEPS.
 */

import { fetchRosterWeeklyCsv, parseRosterWeekly, MIN_ROSTERWEEKLY_SEASON } from '../lib/nflverse.mjs';
import { readJson, writeJsonStable, setStepOutput, stableHash, deepSortKeys } from '../lib/io.mjs';
import { updateManifestEntry } from '../lib/manifest.mjs';
import { validateRosterWeekly } from '../lib/validate.mjs';
import { fetchCurrentNflSeason } from '../lib/sleeper.mjs';
import { runSeasonKeyedIngest } from '../lib/seasonIngest.mjs';

const SPINE_MIN_ROWS = 1;

export const playersHash = players => stableHash(players, deepSortKeys);

export const DEFAULT_DEPS = {
  fetchCurrentNflSeason,
  fetchRosterWeeklyCsv,
  readJson,
  writeJsonStable,
  updateManifestEntry,
  setStepOutput,
};

export async function updateRosterWeekly({
  year: yearOpt = null, all = false, dryRun = false, force = false,
  deps = {},
} = {}) {
  const d = { ...DEFAULT_DEPS, ...deps };
  const currentSeason = await d.fetchCurrentNflSeason();

  let seasons;
  if (all) {
    seasons = Array.from(
      { length: currentSeason - MIN_ROSTERWEEKLY_SEASON + 1 },
      (_, i) => MIN_ROSTERWEEKLY_SEASON + i
    );
  } else if (yearOpt) {
    if (yearOpt < MIN_ROSTERWEEKLY_SEASON) {
      throw new Error(
        `[rosterweekly] --year ${yearOpt} is below MIN_ROSTERWEEKLY_SEASON=${MIN_ROSTERWEEKLY_SEASON} — refusing to ingest.`
      );
    }
    seasons = [yearOpt];
  } else {
    seasons = [currentSeason];
  }

  // Crosswalk read once (the `.ids` gsis → { sleeperId } index).
  const cw = d.readJson('nflverse/playerids.json');
  if (!cw?.ids) {
    if (dryRun) {
      console.warn(
        '[rosterweekly] [dry-run] WARNING: nflverse/playerids.json missing .ids — ' +
        'crosswalk join skipped; nothing to report.'
      );
      return;
    }
    throw new Error(
      '[rosterweekly] nflverse/playerids.json not found (or missing .ids) on disk. ' +
      "Run 'node bin/update.mjs playerids' first."
    );
  }

  if (!all) d.setStepOutput('season', seasons[0]);

  await runSeasonKeyedIngest({
    family: 'rosterweekly',
    seasons,
    currentSeason,
    dryRun,
    force,
    deps: { readJson: d.readJson, writeJsonStable: (p, body) => d.writeJsonStable(p, body, { minify: true }),
      updateManifestEntry: d.updateManifestEntry },
    dataPath: season => `nflverse/rosterweekly/${season}.json`,
    derive: async season => {
      console.log(`[rosterweekly] season=${season} | currentSeason=${currentSeason}`);
      console.log(`[rosterweekly] Fetching roster_weekly_${season}.csv…`);
      const csv = await d.fetchRosterWeeklyCsv(season);
      if (csv === null) return null;
      const parsed = parseRosterWeekly(csv, { season, idsByGsis: cw.ids });
      const playerCount = Object.keys(parsed.players).length;
      console.log(`[rosterweekly] Parsed ${parsed.rowCount} REG rows, ${playerCount} players (${parsed.unmapped} unmapped)`);
      return { ...parsed, playerCount };
    },
    gateRowCount: o => o.rowCount,
    minRows: SPINE_MIN_ROWS,
    validate: (o, { year }) => {
      validateRosterWeekly(o, { year, currentSeason });
      console.log('[rosterweekly] Validation passed');
    },
    hash: o => playersHash(o.players),
    existingHash: existing => (existing?.players ? playersHash(existing.players) : null),
    envelope: (season, o) => ({
      schemaVersion: 1,
      season,
      generatedAt:   new Date().toISOString(),
      rowCount:      o.rowCount,
      playerCount:   o.playerCount,
      unmapped:      o.unmapped,
      weeks:         o.weeks,
      players:       o.players,
    }),
    manifestRecordCount: o => o.rowCount,
    messages: {
      notPublished: season => `[rosterweekly] season=${season} not published yet — skipping`,
      sparsity: (season, rc) => `[rosterweekly] season=${season} only ${rc} rows — treating as preliminary/partial, skipping`,
      dedup: (season, path) => `[rosterweekly] Content identical to existing ${path} — no change.`,
      dryRun: (season, path, o, needsForce) =>
        `[rosterweekly] [dry-run] would write ${path}: ${o.rowCount} REG rows, ` +
        `${o.playerCount} players (${o.unmapped} unmapped), weeks 1–${o.weeks.length}` +
        (needsForce ? ' (past season — needs --force to write for real)' : ''),
      forceGate: (season, path) =>
        `[rosterweekly] ${path} already exists for completed season ${season}. Use --force to overwrite.`,
      afterWrite: (season, path, o) =>
        `[rosterweekly] Wrote ${path} (${o.rowCount} REG rows, ${o.playerCount} players)`,
      afterManifest: () => '[rosterweekly] Manifest updated',
    },
  });
}
