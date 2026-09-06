/**
 * scripts/update-snaps.mjs — nflverse PFR-sourced offensive snap-count writer.
 *
 * Fetches snap_counts_<year>.csv from the nflverse snap_counts release asset, aggregates
 * per-player season offensive-snap-share components for QB/RB/WR/TE/FB, re-keys to sleeper_id
 * via the D2 pfrId crosswalk (nflverse/playerids.json `.bySleeper`), and writes
 * nflverse/snaps/<year>.json.
 *
 * Key behaviours:
 *   - Position scope: QB, RB, WR, TE, FB — mirrors parsePlayerGameLogs' default.
 *   - REG only (aggregateSnapCounts' own filter).
 *   - Team-game denominator: MAX offense_snaps across ALL of a team's players in that game
 *     (finding 4 — an assumption, documented in lib/nflverse.mjs and data-catalog.md).
 *   - Team codes pass through unchanged — this source is already historically coded; eraTeam()
 *     must never be applied here (finding 3; validateSnaps asserts the three era boundaries).
 *   - Traded players: week-restricted per-team-stint denominators, mirroring aggregateAdvReceiving.
 *   - `byPfr` retains the unmapped residue (a departure from the advstats/gamelogs house
 *     pattern of dropping unmapped rows to a bare count — deliberate, see lib/nflverse.mjs).
 *   - Coverage floor: MIN_SNAPS_SEASON (2013 — snap_counts_2012.csv exists upstream but is
 *     header-only with zero data rows; see lib/nflverse.mjs).
 *   - Sparsity: the spine's own `minRows` is set to 1 here, DELIBERATELY not MIN_SNAPS_ROWS —
 *     every season this family backfills is already complete/published, so a genuine shortfall
 *     is a truncated fetch, not an unpublished season. `lib/validate.mjs` `validateSnaps` is
 *     the real MIN_SNAPS_ROWS gate and throws (task finding 3/§C). A 404/504 (unpublished
 *     future season) is still caught upstream of this by `runSeasonKeyedIngest`'s own
 *     "not published" branch (derive() returns null), which does not depend on `minRows`.
 *   - Join-rate gate: SNAPS_JOIN_RATE_MIN (0.85) over skill-position players, enforced in
 *     validateSnaps.
 *   - Content-hash dedup: identical players+byPfr → no write, no manifest touch.
 *   - --force: required to overwrite completed past seasons.
 *   - inProgress: ALWAYS false (no app live fallback — CLAUDE.md invariant 5).
 *
 * @param {object}      opts
 * @param {number|null} opts.year          Season year; null = current season (from Sleeper API)
 * @param {boolean}     opts.all           Backfill every season ≥ MIN_SNAPS_SEASON
 * @param {boolean}     opts.dryRun        Fetch + validate, print plan, no writes
 * @param {boolean}     opts.force         Overwrite a completed past-season file
 * @param {object}      [opts.deps]        Injectable I/O + fetch surface for tests — see
 *   DEFAULT_DEPS.
 */

import {
  fetchSnapCountsCsv, aggregateSnapCounts, pfrCrosswalkFromBySleeper, rekeySnapsByPfr,
  MIN_SNAPS_SEASON,
} from '../lib/nflverse.mjs';
import { readJson, writeJsonStable, setStepOutput, stableHash, sortObjectKeys } from '../lib/io.mjs';
import { updateManifestEntry } from '../lib/manifest.mjs';
import { validateSnaps } from '../lib/validate.mjs';
import { fetchCurrentNflSeason } from '../lib/sleeper.mjs';
import { runSeasonKeyedIngest } from '../lib/seasonIngest.mjs';

// Deliberately low — see the "Sparsity" note in the file doc above. The real gate is
// validateSnaps' MIN_SNAPS_ROWS throw, not this skip-and-continue floor.
const SPINE_MIN_ROWS = 1;

export const playersHash = players => stableHash(players, sortObjectKeys);
export const byPfrHash   = byPfr   => stableHash(byPfr, sortObjectKeys);

export const DEFAULT_DEPS = {
  fetchCurrentNflSeason,
  fetchSnapCountsCsv,
  readJson,
  writeJsonStable,
  updateManifestEntry,
  setStepOutput,
};

export async function updateSnaps({
  year: yearOpt = null, all = false, dryRun = false, force = false,
  deps = {},
} = {}) {
  const d = { ...DEFAULT_DEPS, ...deps };
  const currentSeason = await d.fetchCurrentNflSeason();

  let seasons;
  if (all) {
    seasons = Array.from(
      { length: currentSeason - MIN_SNAPS_SEASON + 1 },
      (_, i) => MIN_SNAPS_SEASON + i
    );
  } else if (yearOpt) {
    seasons = [yearOpt];
  } else {
    seasons = [currentSeason];
  }

  // Read crosswalk once before the loop (mirrors gamelogs; the reverse pfrId index is built
  // once, not per season).
  const cw = d.readJson('nflverse/playerids.json');
  if (!cw?.bySleeper) {
    if (dryRun) {
      console.warn(
        '[snaps] [dry-run] WARNING: nflverse/playerids.json missing bySleeper — ' +
        'crosswalk re-key skipped; parse-only plan reported above.'
      );
      return;
    }
    throw new Error(
      '[snaps] nflverse/playerids.json not found (or missing bySleeper) on disk. ' +
      "Run 'node bin/update.mjs playerids' first."
    );
  }
  const pfrToSleeper = pfrCrosswalkFromBySleeper(cw.bySleeper);

  if (!all) d.setStepOutput('season', seasons[0]);

  await runSeasonKeyedIngest({
    family: 'snaps',
    seasons,
    currentSeason,
    dryRun,
    force,
    deps: { readJson: d.readJson, writeJsonStable: d.writeJsonStable, updateManifestEntry: d.updateManifestEntry },
    dataPath: season => `nflverse/snaps/${season}.json`,
    derive: async season => {
      console.log(`[snaps] season=${season} | currentSeason=${currentSeason}`);

      console.log(`[snaps] Fetching snap_counts_${season}.csv…`);
      const csv = await d.fetchSnapCountsCsv(season);
      if (csv === null) return null;

      const { byPfrId, season: parsed, rowCount: parsedRowCount } = aggregateSnapCounts(csv);
      console.log(`[snaps] Parsed ${parsedRowCount} skill-position rows for season ${season}`);

      const { players, byPfr, unmapped } = rekeySnapsByPfr(byPfrId, pfrToSleeper);
      const mapped = Object.keys(players).length;
      const joinRate = (mapped + unmapped) > 0 ? mapped / (mapped + unmapped) : 0;
      if (unmapped > 0) console.log(`[snaps] ${unmapped} players had no pfrId crosswalk mapping — retained in byPfr`);

      const playerCount = mapped;
      const rowCount    = Object.values(players).reduce((s, p) => s + p.games, 0);

      return { players, byPfr, parsed, parsedRowCount, playerCount, rowCount, unmapped, joinRate };
    },
    gateRowCount: o => o.parsedRowCount,
    minRows: SPINE_MIN_ROWS,
    validate: (o, { year }) => {
      validateSnaps(o.players, { year, joinRate: o.joinRate });
      console.log('[snaps] Validation passed');
    },
    hash: o => `${playersHash(o.players)}|${byPfrHash(o.byPfr)}`,
    existingHash: existing => (existing?.players
      ? `${playersHash(existing.players)}|${byPfrHash(existing.byPfr ?? {})}`
      : null),
    envelope: (season, o) => ({
      schemaVersion: 1,
      season:        o.parsed ?? season,
      generatedAt:   new Date().toISOString(),
      rowCount:      o.rowCount,
      playerCount:   o.playerCount,
      unmapped:      o.unmapped,
      players:       o.players,
      byPfr:         o.byPfr,
    }),
    manifestRecordCount: o => o.rowCount,
    messages: {
      notPublished: season => `[snaps] season=${season} not published yet — skipping`,
      sparsity: (season, rc) =>
        `[snaps] season=${season} only ${rc} skill-position rows — treating as preliminary/partial, skipping`,
      dedup: (season, path) => `[snaps] Content identical to existing ${path} — no change.`,
      dryRun: (season, path, o, needsForce) =>
        `[snaps] [dry-run] would write ${path}: ${o.rowCount} player-game rows, ` +
        `${o.playerCount} players (${o.unmapped} unmapped, join rate ${o.joinRate.toFixed(3)})` +
        (needsForce ? ' (past season — needs --force to write for real)' : ''),
      forceGate: (season, path) =>
        `[snaps] ${path} already exists for completed season ${season}. Use --force to overwrite.`,
      afterWrite: (season, path, o) =>
        `[snaps] Wrote ${path} (${o.rowCount} player-game rows, ${o.playerCount} players)`,
      afterManifest: () => '[snaps] Manifest updated',
    },
  });
}
