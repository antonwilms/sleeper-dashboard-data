/**
 * scripts/update-depth.mjs — nflverse historical depth-chart writer (2013+, both eras).
 *
 * Fetches depth_charts_<year>.csv from the nflverse depth_charts release, parses it through
 * whichever of the two era-specific parsers the season selects (aggregateDepthLegacy for
 * 2013–2024, aggregateDepthEspn for 2025+ — DEPTH_ESPN_FROM_SEASON), joins to sleeper_id via
 * the D2/D4-generalized crosswalk inversion, and writes nflverse/depth/<year>.json.
 *
 * Key behaviours:
 *   - Position scope: QB, RB, WR, TE (DEPTH_SKILL_POSITIONS).
 *   - Legacy (2013–2024): filters formation === 'Offense', game_type === 'REG'; week comes
 *     straight from the CSV; ties within (club, week, position) — real, not a fault (finding 6)
 *     — are broken by (depth_team asc, depth_position asc, input order) and `depthPosition`
 *     survives on the served row so a consumer can see the grain it's getting.
 *   - ESPN (2025+): week is derived from the UPSTREAM nfldata games.csv (fetchSchedulesCsv),
 *     never the served nflverse/schedule family, which carries no date (finding 1; CR-08 is not
 *     touched). A `dt` whose date falls outside the REG window is counted in `outOfWindow`,
 *     never dropped silently (finding 1b). Reduced from ESPN's near-daily cadence to one chart
 *     per (team, NFL week) by keeping only the rows at that bucket's max `dt` (aggregateDepthEspn).
 *   - Join: gsis_id via the crosswalk's `ids` map is primary; the ESPN remainder falls back to
 *     espn_id via `crosswalkFromBySleeper(bySleeper, 'espnId')` (generalizes D4's pfrId
 *     inversion pattern rather than duplicating it). An unresolved entry is kept as `null` AT
 *     ITS ORIGINAL INDEX (joinDepthToSleeper) — never dropped, which would silently promote a
 *     backup into the depth-1 slot.
 *   - Prerequisite (finding 3b): an ESPN-era season HARD-ERRORS if the crosswalk's `bySleeper`
 *     is absent or empty — a season below DEPTH_ESPN_FROM_SEASON never needs it and never checks
 *     for it.
 *   - Coverage floor: MIN_DEPTH_SEASON (2013). A below-floor `--year` is rejected here, before
 *     the spine ever sees it — unlike snaps' 2012 (header-only upstream), nflverse depth_charts
 *     actually carries real pre-2013 rows (the release goes back to 2001), so without this
 *     explicit rejection a below-floor year would not hit the spine's "not published" branch at
 *     all and would silently widen this family's coverage.
 *   - Sparsity: the spine's own `minRows` is 1, DELIBERATELY not MIN_DEPTH_ROWS — every season
 *     this family backfills is already complete/published, so a genuine shortfall is a
 *     truncated fetch, not an unpublished season. `lib/validate.mjs` `validateDepth` is the real
 *     MIN_DEPTH_ROWS gate and throws (§C, mirrors scripts/update-snaps.mjs exactly).
 *   - `week1Qb1`: the depth-1 QB per team at week 1 REG (index 0 of the joined QB array).
 *   - `qb1Changed`: compares this season's `week1Qb1` against the PRIOR SEASON'S SERVED FILE.
 *     `null` at MIN_DEPTH_SEASON (no prior season exists). A missing prior file for any other
 *     season THROWS — indistinguishable from the floor season's legitimate `null` otherwise.
 *   - Content-hash dedup: identical `weeks` → no write, no manifest touch.
 *   - --force: required to overwrite completed past seasons.
 *   - inProgress: ALWAYS false (no app live fallback — CLAUDE.md invariant 5).
 *   - Capture-only: this script wires no factor and is read by no other script.
 *
 * @param {object}      opts
 * @param {number|null} opts.year          Season year; null = current season (from Sleeper API)
 * @param {boolean}     opts.all           Backfill every season ≥ MIN_DEPTH_SEASON
 * @param {boolean}     opts.dryRun        Fetch + validate, print plan, no writes
 * @param {boolean}     opts.force         Overwrite a completed past-season file
 * @param {object}      [opts.deps]        Injectable I/O + fetch surface for tests — see
 *   DEFAULT_DEPS.
 */

import {
  fetchDepthChartsCsv, fetchSchedulesCsv, aggregateDepthLegacy, aggregateDepthEspn,
  buildGamedayIndex, joinDepthToSleeper, crosswalkFromBySleeper,
  MIN_DEPTH_SEASON, DEPTH_ESPN_FROM_SEASON, DEPTH_SKILL_POSITIONS,
} from '../lib/nflverse.mjs';
import { readJson, writeJsonStable, setStepOutput, stableHash, sortObjectKeys } from '../lib/io.mjs';
import { updateManifestEntry } from '../lib/manifest.mjs';
import { validateDepth } from '../lib/validate.mjs';
import { fetchCurrentNflSeason } from '../lib/sleeper.mjs';
import { runSeasonKeyedIngest } from '../lib/seasonIngest.mjs';

// Deliberately low — see the "Sparsity" note in the file doc above. The real gate is
// validateDepth's MIN_DEPTH_ROWS throw, not this skip-and-continue floor.
const SPINE_MIN_ROWS = 1;

export const weeksHash = weeks => stableHash(weeks, sortObjectKeys);

export const DEFAULT_DEPS = {
  fetchCurrentNflSeason,
  fetchDepthChartsCsv,
  fetchSchedulesCsv,
  readJson,
  writeJsonStable,
  updateManifestEntry,
  setStepOutput,
};

/** week1Qb1: { [team]: sleeperId|null } — the depth-1 QB per team at week 1 REG. */
function buildWeek1Qb1(weeks) {
  const week1 = weeks['1'] || {};
  const out = {};
  for (const [team, posMap] of Object.entries(week1)) {
    out[team] = (posMap.QB || [])[0] ?? null;
  }
  return out;
}

export async function updateDepth({
  year: yearOpt = null, all = false, dryRun = false, force = false,
  deps = {},
} = {}) {
  const d = { ...DEFAULT_DEPS, ...deps };
  const currentSeason = await d.fetchCurrentNflSeason();

  let seasons;
  if (all) {
    seasons = Array.from(
      { length: currentSeason - MIN_DEPTH_SEASON + 1 },
      (_, i) => MIN_DEPTH_SEASON + i
    );
  } else if (yearOpt) {
    // Reject a below-floor --year here, before the spine ever sees it. Unlike snaps' 2012 (a
    // header-only upstream asset that naturally routes through the spine's "not published"
    // branch), nflverse depth_charts carries real pre-2013 rows — a below-floor year would
    // otherwise fetch, parse, and potentially WRITE, silently widening this family's coverage.
    if (yearOpt < MIN_DEPTH_SEASON) {
      throw new Error(
        `[depth] --year ${yearOpt} is below MIN_DEPTH_SEASON=${MIN_DEPTH_SEASON} — refusing to ` +
        'ingest.'
      );
    }
    seasons = [yearOpt];
  } else {
    seasons = [currentSeason];
  }

  // Read the crosswalk once before the loop (mirrors snaps). `ids` (gsis_id-keyed) is the
  // primary join path for every era; `bySleeper` (for the espn_id fallback) is required only
  // when an ESPN-era season is actually being processed (finding 3b), checked per-season below.
  const cw = d.readJson('nflverse/playerids.json');
  if (!cw?.ids) {
    if (dryRun) {
      console.warn(
        '[depth] [dry-run] WARNING: nflverse/playerids.json missing (or missing .ids) — ' +
        'crosswalk re-key skipped; parse-only plan reported above.'
      );
      return;
    }
    throw new Error(
      '[depth] nflverse/playerids.json not found (or missing .ids) on disk. ' +
      "Run 'node bin/update.mjs playerids' first."
    );
  }

  let espnToSleeper = null; // built lazily, once, only if an ESPN-era season is processed
  let scheduleCsv;          // fetched lazily, once, only if an ESPN-era season is processed
  let scheduleCsvFetched = false;

  if (!all) d.setStepOutput('season', seasons[0]);

  await runSeasonKeyedIngest({
    family: 'depth',
    seasons,
    currentSeason,
    dryRun,
    force,
    deps: { readJson: d.readJson, writeJsonStable: d.writeJsonStable, updateManifestEntry: d.updateManifestEntry },
    dataPath: season => `nflverse/depth/${season}.json`,
    derive: async season => {
      console.log(`[depth] season=${season} | currentSeason=${currentSeason}`);

      console.log(`[depth] Fetching depth_charts_${season}.csv…`);
      const csv = await d.fetchDepthChartsCsv(season);
      if (csv === null) return null;

      const isEspnEra = season >= DEPTH_ESPN_FROM_SEASON;
      let rawWeeks, parsedRowCount, outOfWindow = 0;

      if (isEspnEra) {
        if (!cw.bySleeper || Object.keys(cw.bySleeper).length === 0) {
          throw new Error(
            `[depth] season=${season}: nflverse/playerids.json is missing bySleeper (or it is ` +
            'empty) — required for the espn_id fallback join on an ESPN-era season (finding ' +
            "3b). Regenerate the crosswalk to schemaVersion 2 first ('node bin/update.mjs playerids')."
          );
        }
        if (!espnToSleeper) espnToSleeper = crosswalkFromBySleeper(cw.bySleeper, 'espnId');

        if (!scheduleCsvFetched) {
          console.log('[depth] Fetching upstream games.csv for the gameday→week index…');
          scheduleCsv = await d.fetchSchedulesCsv();
          scheduleCsvFetched = true;
        }
        if (!scheduleCsv) {
          throw new Error(
            `[depth] season=${season}: upstream games.csv fetch failed (fetchSchedulesCsv ` +
            'returned null) — cannot derive NFL week for an ESPN-era season.'
          );
        }

        const gamedayIndex = buildGamedayIndex(scheduleCsv, { season });
        const espn = aggregateDepthEspn(csv, { season, gamedayIndex });
        rawWeeks = espn.weeks;
        parsedRowCount = espn.rowCount;
        outOfWindow = espn.outOfWindow;
      } else {
        const legacy = aggregateDepthLegacy(csv, { season });
        rawWeeks = legacy.weeks;
        parsedRowCount = legacy.rowCount;
      }

      console.log(`[depth] Parsed ${parsedRowCount} skill-position rows for season ${season} (era=${isEspnEra ? 'ESPN' : 'legacy'})`);

      const { weeks, mapped, unmapped } = joinDepthToSleeper(rawWeeks, { ids: cw.ids, espnToSleeper: espnToSleeper ?? {} });
      const joinRate = (mapped + unmapped) > 0 ? mapped / (mapped + unmapped) : 0;
      if (unmapped > 0) console.log(`[depth] ${unmapped} distinct skill-position ids had no crosswalk mapping (join rate ${joinRate.toFixed(4)})`);

      const week1Qb1 = buildWeek1Qb1(weeks);

      let qb1Changed;
      if (season === MIN_DEPTH_SEASON) {
        qb1Changed = null; // no prior season exists by definition
      } else {
        const prior = d.readJson(`nflverse/depth/${season - 1}.json`);
        if (!prior || !prior.week1Qb1) {
          throw new Error(
            `[depth] season=${season}: missing prior season file nflverse/depth/${season - 1}.json ` +
            '(or its week1Qb1) — qb1Changed cannot be derived and a silent null here would be ' +
            `indistinguishable from ${MIN_DEPTH_SEASON}'s legitimate one. Ingest ${season - 1} first.`
          );
        }
        qb1Changed = {};
        for (const team of Object.keys(week1Qb1)) {
          qb1Changed[team] = week1Qb1[team] !== (prior.week1Qb1[team] ?? null);
        }
      }

      let rowCount = 0;
      const playerSet = new Set();
      for (const teams of Object.values(weeks)) {
        for (const posMap of Object.values(teams)) {
          for (const pos of DEPTH_SKILL_POSITIONS) {
            for (const id of posMap[pos] || []) {
              if (id) { rowCount++; playerSet.add(id); }
            }
          }
        }
      }

      return {
        weeks, parsedRowCount, rowCount, playerCount: playerSet.size, unmapped, joinRate,
        outOfWindow, week1Qb1, qb1Changed,
      };
    },
    gateRowCount: o => o.parsedRowCount,
    minRows: SPINE_MIN_ROWS,
    validate: (o, { year }) => {
      validateDepth(o.weeks, { year, joinRate: o.joinRate });
      console.log('[depth] Validation passed');
    },
    hash: o => weeksHash(o.weeks),
    existingHash: existing => (existing?.weeks ? weeksHash(existing.weeks) : null),
    envelope: (season, o) => ({
      schemaVersion: 1,
      season,
      generatedAt:   new Date().toISOString(),
      rowCount:      o.rowCount,
      playerCount:   o.playerCount,
      unmapped:      o.unmapped,
      outOfWindow:   o.outOfWindow,
      weeks:         o.weeks,
      week1Qb1:      o.week1Qb1,
      qb1Changed:    o.qb1Changed,
    }),
    manifestRecordCount: o => o.rowCount,
    messages: {
      notPublished: season => `[depth] season=${season} not published yet — skipping`,
      sparsity: (season, rc) =>
        `[depth] season=${season} only ${rc} skill-position rows — treating as preliminary/partial, skipping`,
      dedup: (season, path) => `[depth] Content identical to existing ${path} — no change.`,
      dryRun: (season, path, o, needsForce) =>
        `[depth] [dry-run] would write ${path}: ${o.rowCount} joined rows, ` +
        `${o.playerCount} players (${o.unmapped} unmapped, join rate ${o.joinRate.toFixed(4)}, ` +
        `outOfWindow ${o.outOfWindow})` +
        (needsForce ? ' (past season — needs --force to write for real)' : ''),
      forceGate: (season, path) =>
        `[depth] ${path} already exists for completed season ${season}. Use --force to overwrite.`,
      afterWrite: (season, path, o) =>
        `[depth] Wrote ${path} (${o.rowCount} joined rows, ${o.playerCount} players)`,
      afterManifest: () => '[depth] Manifest updated',
    },
  });
}
