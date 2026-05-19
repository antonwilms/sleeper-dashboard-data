/**
 * lib/sleeper.mjs — Sleeper API fetches for NFL season data.
 *
 * Mirrors the weekly-aggregation logic in the app's getSeasonTotals
 * (src/api/sleeperStats.js), adapted for Node:
 *   - No IndexedDB cache; fetches live every run.
 *   - Uses pts_half_ppr directly instead of calculateFantasyPoints,
 *     per Phase 4 decision 2 (zero shared code, canonical half-PPR).
 *   - 200ms delay between week requests, matching app behaviour.
 *   - Team field comes from each stat entry's top-level `team` property
 *     (confirmed present in Sleeper API responses), so no player-map
 *     fetch is needed for bye/DNP disambiguation.
 */

const STATS_BASE = 'https://api.sleeper.com';
const STATE_BASE = 'https://api.sleeper.app/v1';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetches the current NFL state from Sleeper to determine the current season.
 * Falls back to calendar-year inference if the API is unreachable.
 *
 * @returns {Promise<number>}  Current NFL season year (e.g. 2025)
 */
export async function fetchCurrentNflSeason() {
  try {
    const res = await fetch(`${STATE_BASE}/state/nfl`);
    if (!res.ok) throw new Error(`Sleeper state HTTP ${res.status}`);
    const state = await res.json();
    return parseInt(state.season, 10);
  } catch (err) {
    console.warn('[sleeper] Could not fetch NFL state, inferring from date:', err.message);
    const now = new Date();
    // NFL season rolls over in ~March; if we're in Jan–Feb we're still in the prior year's cycle
    return now.getMonth() <= 1 ? now.getFullYear() - 1 : now.getFullYear();
  }
}

/**
 * Fetches all 18 regular-season weeks for a given year.
 * Returns an array of per-week entry arrays (some weeks may be empty on error).
 *
 * Each entry: { player_id, team, stats: { gp, gs, pts_half_ppr, ... } }
 * The `team` field is taken from the top-level entry field (not from stats).
 *
 * @param {number} year  NFL season year
 * @returns {Promise<Array<{ week: number, entries: Array }>>}
 */
export async function fetchSeasonWeeks(year) {
  console.log(`[sleeper] Fetching ${year} regular season (18 weeks)…`);
  const results = [];

  for (let week = 1; week <= 18; week++) {
    const url = `${STATS_BASE}/stats/nfl/${year}/${week}?season_type=regular`;
    process.stdout.write(`  Week ${week}/18…`);

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rawList = await res.json();

      // Normalise: keep entries that have player_id and stats
      const entries = rawList
        .filter(e => e.player_id && e.stats)
        .map(e => ({
          player_id: e.player_id,
          team: e.team ?? null,           // top-level team field from Sleeper response
          stats: e.stats,
        }));

      results.push({ week, entries });
      process.stdout.write(` ${entries.length} players\n`);
    } catch (err) {
      process.stdout.write(` FAILED (${err.message}) — skipping\n`);
      results.push({ week, entries: [] });
    }

    if (week < 18) await delay(200);
  }

  return results;
}

/**
 * Aggregates per-week entry arrays into per-player season totals.
 * Output shape matches the app's season-totals format, plus the
 * scoringBasis sentinel from Phase 4 and the weeklyStatus / availability
 * fields from Phase 5.
 *
 * Output per player:
 *   {
 *     stats:        { [stat_key]: number }  — summed raw stats across all played weeks
 *     gamesPlayed:  number
 *     gamesStarted: number
 *     byeWeeks:     number
 *     dnpWeeks:     number
 *     weeklyPoints: { [week]: number }      — pts_half_ppr per played week
 *     fantasyPoints: number                 — sum of weeklyPoints
 *     scoringBasis: "half_ppr"              — Phase 4 sentinel
 *     weeklyStatus: Array<'P'|'D'|'B'|'X'>  — Phase 5; length 18, 1-indexed by week
 *     availability: object                  — Phase 5; see computeAvailability()
 *   }
 *
 * gp logic (mirrors app):
 *   gp === 1  → player played; contributes to gamesPlayed, weeklyPoints, stats (weeklyStatus 'P')
 *   gp === 0  → in response but did not play
 *     → if player's team was not playing this week → byeWeeks (weeklyStatus 'B')
 *     → else → dnpWeeks (weeklyStatus 'D')
 *   absent    → not in the response; no contribution (weeklyStatus stays 'X')
 *
 * @param {Array} weekData  Output of fetchSeasonWeeks()
 * @returns {{ [player_id]: object }}
 */
export function aggregateWeeks(weekData) {
  const totals = {};

  for (const { week, entries } of weekData) {
    if (!entries.length) continue;

    // Sleeper occasionally returns duplicate entries for the same player_id in a week
    // (observed in old seasons e.g. 2015 W1/W14). Collapse to first-seen so per-week
    // counts stay 1:1 with the weeklyStatus slot. Mirrors how the app's normalizeStatsResponse
    // builds a player_id → stats map, which inherently dedupes.
    // Dedup affects ALL fields: gamesPlayed, gamesStarted, byeWeeks, dnpWeeks,
    // weeklyPoints, raw stats, and weeklyStatus — the collapsed list is used exclusively.
    const seen = new Set();
    const uniqueEntries = [];
    const dupeIds = [];
    for (const e of entries) {
      if (seen.has(e.player_id)) { dupeIds.push(e.player_id); continue; }
      seen.add(e.player_id);
      uniqueEntries.push(e);
    }
    if (dupeIds.length) {
      console.warn(`  [dedup] W${week}: ${dupeIds.length} duplicate(s) removed — player_ids: ${dupeIds.join(', ')}`);
    }

    // Build the set of teams that had at least one player with gp === 1 this week.
    // Used to distinguish bye weeks from DNPs.
    const teamsPlaying = new Set();
    for (const { team, stats } of uniqueEntries) {
      if (stats.gp === 1 && team) teamsPlaying.add(team);
    }

    for (const { player_id, team, stats } of uniqueEntries) {
      if (!totals[player_id]) {
        totals[player_id] = {
          stats: {},
          gamesPlayed: 0,
          gamesStarted: 0,
          byeWeeks: 0,
          dnpWeeks: 0,
          weeklyPoints: {},
          weeklyStatus: Array(18).fill('X'),
        };
      }

      const p = totals[player_id];

      if (stats.gp === 1) {
        p.gamesPlayed++;
        if (stats.gs === 1) p.gamesStarted++;
        // pts_half_ppr ?? 0 per the Phase 4 decision (canonical half-PPR scoring)
        p.weeklyPoints[week] = stats.pts_half_ppr ?? 0;
        p.weeklyStatus[week - 1] = 'P';

        // Sum all raw stat fields (same as app)
        for (const [key, val] of Object.entries(stats)) {
          if (val != null) p.stats[key] = (p.stats[key] ?? 0) + val;
        }
      } else {
        // gp === 0: player was in the response but did not play
        if (team && !teamsPlaying.has(team)) {
          p.byeWeeks++;
          p.weeklyStatus[week - 1] = 'B';
        } else {
          p.dnpWeeks++;
          p.weeklyStatus[week - 1] = 'D';
        }
      }
    }
  }

  // Compute fantasyPoints, scoringBasis, and per-player availability aggregates.
  for (const p of Object.values(totals)) {
    p.fantasyPoints = Math.round(
      Object.values(p.weeklyPoints).reduce((a, b) => a + b, 0) * 100
    ) / 100;
    p.scoringBasis = 'half_ppr';
    p.availability = computeAvailability(p.weeklyStatus);
  }

  return totals;
}

/**
 * Derives the small availability aggregates we attach to each player record.
 * See phase-5 task file for rationale and edge-case semantics.
 *
 * @param {Array<'P'|'D'|'B'|'X'>} weeklyStatus  Length 18
 * @returns {{
 *   longestAbsence: number,
 *   absenceSegments: Array<{ start: number, end: number, length: number }>,
 *   firstWeek: number | null,
 *   lastWeek: number | null,
 *   returnedFromAbsence: boolean,
 *   absenceCause: "unknown",
 * }}
 */
export function computeAvailability(weeklyStatus) {
  let firstWeek = null;
  let lastWeek = null;
  for (let i = 0; i < weeklyStatus.length; i++) {
    if (weeklyStatus[i] === 'P') {
      if (firstWeek === null) firstWeek = i + 1;
      lastWeek = i + 1;
    }
  }

  if (firstWeek === null) {
    return {
      longestAbsence: 0,
      absenceSegments: [],
      firstWeek: null,
      lastWeek: null,
      returnedFromAbsence: false,
      absenceCause: 'unknown',
    };
  }

  // Scan the window bracketed by firstWeek..lastWeek (1-based, inclusive).
  // Group consecutive 'D' weeks into segments; 'B' and 'X' break a run.
  const segments = [];
  let runStart = null;
  for (let week = firstWeek; week <= lastWeek; week++) {
    const code = weeklyStatus[week - 1];
    if (code === 'D') {
      if (runStart === null) runStart = week;
    } else if (runStart !== null) {
      segments.push({ start: runStart, end: week - 1, length: week - runStart });
      runStart = null;
    }
  }
  if (runStart !== null) {
    segments.push({ start: runStart, end: lastWeek, length: lastWeek - runStart + 1 });
  }

  const longestAbsence = segments.reduce((m, s) => Math.max(m, s.length), 0);
  const returnedFromAbsence = segments.some(s => s.end < lastWeek);

  return {
    longestAbsence,
    absenceSegments: segments,
    firstWeek,
    lastWeek,
    returnedFromAbsence,
    absenceCause: 'unknown',
  };
}
