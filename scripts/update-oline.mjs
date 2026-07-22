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
 */

import crypto from 'crypto';
import {
  fetchDepthChartsCsv, aggregateOlineStates, MIN_OLINE_ROWS, MIN_OLINE_SEASON,
} from '../lib/nflverse.mjs';
import { readJson, writeJsonStable, setStepOutput } from '../lib/io.mjs';
import { updateManifestEntry } from '../lib/manifest.mjs';
import { validateOline } from '../lib/validate.mjs';
import { fetchCurrentNflSeason } from '../lib/sleeper.mjs';

function teamsHash(teams) {
  const sorted = Object.keys(teams).sort();
  const stable = Object.fromEntries(sorted.map(k => [k, teams[k]]));
  return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

export async function updateOline({ year: yearOpt = null, all = false, dryRun = false, force = false } = {}) {
  const currentSeason = await fetchCurrentNflSeason();

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
  if (!all) setStepOutput('season', seasons[0]);

  for (const season of seasons) {
    console.log(`[oline] season=${season} | currentSeason=${currentSeason}`);
    const isPast = season < currentSeason;

    // Fetch — graceful skip on 404/504 (year not yet published)
    console.log(`[oline] Fetching depth_charts_${season}.csv…`);
    const csv = await fetchDepthChartsCsv(season);
    if (csv === null) {
      console.log(`[oline] season=${season} not published yet — skipping`);
      continue;
    }

    // Derive — throws on header drift or wrong-asset dt-year mismatch
    const { teams, rowCount: preRowCount, stateCount } = aggregateOlineStates(csv, { season });
    console.log(`[oline] Derived ${preRowCount} ol rows across ${stateCount} states for season ${season}`);

    // Sparsity gate — pre-validation, fail-fast before doing further work. Uses the aggregator's
    // raw counts (not the post-drop counts below): a preliminary/truncated fetch should be
    // rejected on its own terms, before validateOline's drops are even applied.
    if (preRowCount < MIN_OLINE_ROWS) {
      console.log(
        `[oline] season=${season} only ${preRowCount} ol rows ` +
        `(< MIN_OLINE_ROWS=${MIN_OLINE_ROWS}) — treating as preliminary/partial, skipping`
      );
      continue;
    }

    // Validate — drops ragged per-record defects (e.g. empty player name) from `teams` in
    // place; capture proceeds rather than forfeiting the whole week.
    validateOline(teams, { year: season });
    console.log('[oline] Validation passed');

    // Recompute rowCount/teamCount AFTER validation so the envelope + manifest recordCount
    // reflect what the file actually holds post-drop, not the pre-drop derive counts above.
    // This family is append-only, so a stale (overstated) count would be permanent.
    // stateCount is unaffected by drops (states are never removed, only their ol[] entries).
    const teamCount = Object.keys(teams).length;
    const rowCount = Object.values(teams).reduce(
      (s, t) => s + (t.states || []).reduce((s2, st) => s2 + (st.ol || []).length, 0), 0
    );

    const dataPath = `nflverse/oline/${season}.json`;
    const existing = readJson(dataPath);

    // Content-hash dedup
    const newHash  = teamsHash(teams);
    const lastHash = existing?.teams ? teamsHash(existing.teams) : null;
    if (newHash === lastHash) {
      console.log(`[oline] Content identical to existing ${dataPath} — no change.`);
      continue;
    }

    // Dry-run exit
    if (dryRun) {
      const needsForce = isPast && existing && !force;
      console.log(
        `[oline] [dry-run] would write ${dataPath}: ${rowCount} ol rows, ` +
        `${teamCount} teams, ${stateCount} states` +
        (needsForce ? ' (past season — needs --force to write for real)' : '')
      );
      continue;
    }

    // Force gate: completed past seasons require --force to overwrite
    if (isPast && existing && !force) {
      throw new Error(
        `[oline] ${dataPath} already exists for completed season ${season}. ` +
        'Use --force to overwrite.'
      );
    }

    // Write
    writeJsonStable(dataPath, {
      schemaVersion: 1,
      season,
      generatedAt: new Date().toISOString(),
      source: 'nflverse depth_charts (ESPN feed)',
      rowCount,
      teamCount,
      stateCount,
      teams,
    });
    console.log(`[oline] Wrote ${dataPath} (${rowCount} ol rows, ${teamCount} teams, ${stateCount} states)`);

    // Manifest (inProgress: false — CLAUDE.md invariant 5, extended to oline)
    updateManifestEntry({ path: dataPath, recordCount: rowCount, inProgress: false, schemaVersion: 1 });
    console.log('[oline] Manifest updated');
  }
}
