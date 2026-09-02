/**
 * scripts/update-oline.mjs — OL composition forward capture from nflverse depth charts.
 *
 * Fetches depth_charts_<year>.csv from the nflverse depth_charts release (ESPN feed), derives
 * per-team-week OL composition via aggregateOlineStates (lib/nflverse.mjs), and writes
 * nflverse/oline/<year>.json.
 *
 * Key behaviours:
 *   - TEAM-keyed (second team-keyed family after teamcontext) — no crosswalk read, no
 *     Action-ordering dependency.
 *   - Weekly reduction: one state per (team, ISO-week) — the week's latest upstream chart.
 *   - ESPN dt-schema era only: MIN_OLINE_SEASON = 2025 (pre-2025 assets use a legacy NFL-feed
 *     schema — different columns entirely, out of scope).
 *   - 404/504: year not yet published → log and skip.
 *   - Sparsity gate: total ol[] entries < MIN_OLINE_ROWS → preliminary, skip.
 *   - Wrong-asset guard: aggregateOlineStates throws if any row's dt year is outside
 *     {season, season+1}.
 *   - Content-hash dedup: identical teams → no write, no manifest touch.
 *   - --force: required to overwrite completed past seasons.
 *   - inProgress: ALWAYS false (no app live fallback — CLAUDE.md invariant 5).
 *   - Capture-only: no consumer, enrichment, or scoring path reads this family.
 *
 * @param {object}      opts
 * @param {number|null} opts.year    Season year; null = current season (from Sleeper API)
 * @param {boolean}     opts.all     Backfill every season ≥ MIN_OLINE_SEASON
 * @param {boolean}     opts.dryRun  Fetch + validate, print plan, no writes
 * @param {boolean}     opts.force   Overwrite a completed past-season file
 * @param {object}      [opts.deps]  Injectable I/O + fetch surface for tests — see DEFAULT_DEPS.
 */

import {
  fetchDepthChartsCsv, aggregateOlineStates, MIN_OLINE_ROWS, MIN_OLINE_SEASON,
} from '../lib/nflverse.mjs';
import { readJson, writeJsonStable, setStepOutput, stableHash, sortObjectKeys } from '../lib/io.mjs';
import { updateManifestEntry } from '../lib/manifest.mjs';
import { validateOline } from '../lib/validate.mjs';
import { fetchCurrentNflSeason } from '../lib/sleeper.mjs';
import { runSeasonKeyedIngest } from '../lib/seasonIngest.mjs';

export const teamsHash = teams => stableHash(teams, sortObjectKeys);

// Post-drop row count — validateOline mutates `teams` in place, dropping ragged per-record
// defects, so the envelope, the dry-run message and the manifest recordCount must all
// recompute from the (already-mutated) `teams` rather than reuse the aggregator's pre-drop
// count. One helper, called from all three places, so they cannot drift apart
// (season-ingest-oline.md §1.2/§2.1) — an append-only family carrying a stale, overstated
// count would be permanent, with no validator to catch it.
function olRowCount(teams) {
  return Object.values(teams).reduce(
    (s, t) => s + (t.states || []).reduce((s2, st) => s2 + (st.ol || []).length, 0), 0
  );
}

// Injectable I/O + fetch surface — mirrors scripts/update-nfl.mjs's DEFAULT_DEPS pattern
// (season-ingest-net.md §3.1).
export const DEFAULT_DEPS = {
  fetchCurrentNflSeason,
  fetchDepthChartsCsv,
  readJson,
  writeJsonStable,
  updateManifestEntry,
  setStepOutput,
};

export async function updateOline({ year: yearOpt = null, all = false, dryRun = false, force = false, deps = {} } = {}) {
  const d = { ...DEFAULT_DEPS, ...deps };
  const currentSeason = await d.fetchCurrentNflSeason();

  // Resolve target seasons
  let seasons;
  if (all) {
    seasons = Array.from(
      { length: currentSeason - MIN_OLINE_SEASON + 1 },
      (_, i) => MIN_OLINE_SEASON + i
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
    family: 'oline',
    seasons,
    currentSeason,
    dryRun,
    force,
    deps: { readJson: d.readJson, writeJsonStable: d.writeJsonStable, updateManifestEntry: d.updateManifestEntry },
    dataPath: season => `nflverse/oline/${season}.json`,
    derive: async season => {
      console.log(`[oline] season=${season} | currentSeason=${currentSeason}`);

      // Fetch — graceful skip on 404/504 (year not yet published)
      console.log(`[oline] Fetching depth_charts_${season}.csv…`);
      const csv = await d.fetchDepthChartsCsv(season);
      if (csv === null) return null;

      // Derive — throws on header drift or wrong-asset dt-year mismatch
      const { teams, rowCount: preRowCount, stateCount } = aggregateOlineStates(csv, { season });
      console.log(`[oline] Derived ${preRowCount} ol rows across ${stateCount} states for season ${season}`);
      return { teams, preRowCount, stateCount };
    },
    // PRE-drop — gate only. A preliminary/truncated fetch is rejected on its own terms,
    // before validateOline's drops are even applied. Every other callback below recomputes
    // from `o.teams` (post-mutation) via olRowCount — this is the one exception.
    rowCount: o => o.preRowCount,
    minRows: MIN_OLINE_ROWS,
    validate: (o, { year }) => {
      // Drops ragged per-record defects (e.g. empty player name) from `teams` in place;
      // capture proceeds rather than forfeiting the whole week.
      validateOline(o.teams, { year });
      console.log('[oline] Validation passed');
    },
    hash: o => teamsHash(o.teams),
    existingHash: existing => (existing?.teams ? teamsHash(existing.teams) : null),
    envelope: (season, o) => ({
      schemaVersion: 1,
      season,
      generatedAt: new Date().toISOString(),
      source: 'nflverse depth_charts (ESPN feed)',
      rowCount:   olRowCount(o.teams),
      teamCount:  Object.keys(o.teams).length,
      stateCount: o.stateCount,
      teams:      o.teams,
    }),
    manifestRecordCount: o => olRowCount(o.teams),
    messages: {
      notPublished: season => `[oline] season=${season} not published yet — skipping`,
      sparsity: (season, rc) =>
        `[oline] season=${season} only ${rc} ol rows ` +
        `(< MIN_OLINE_ROWS=${MIN_OLINE_ROWS}) — treating as preliminary/partial, skipping`,
      dedup: (season, path) => `[oline] Content identical to existing ${path} — no change.`,
      dryRun: (season, path, o, needsForce) =>
        `[oline] [dry-run] would write ${path}: ${olRowCount(o.teams)} ol rows, ` +
        `${Object.keys(o.teams).length} teams, ${o.stateCount} states` +
        (needsForce ? ' (past season — needs --force to write for real)' : ''),
      forceGate: (season, path) =>
        `[oline] ${path} already exists for completed season ${season}. Use --force to overwrite.`,
      afterWrite: (season, path, o) =>
        `[oline] Wrote ${path} (${olRowCount(o.teams)} ol rows, ${Object.keys(o.teams).length} teams, ${o.stateCount} states)`,
      afterManifest: () => '[oline] Manifest updated',
    },
  });
}
