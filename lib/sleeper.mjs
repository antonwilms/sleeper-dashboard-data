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
 * Output shape matches the app's season-totals format, plus the new
 * scoringBasis sentinel introduced in Phase 4.
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
 *   }
 *
 * gp logic (mirrors app):
 *   gp === 1  → player played; contributes to gamesPlayed, weeklyPoints, stats
 *   gp === 0  → in response but did not play
 *     → if player's team was not playing this week → byeWeeks
 *     → else → dnpWeeks
 *   absent    → not in the response; no contribution
 *
 * @param {Array} weekData  Output of fetchSeasonWeeks()
 * @returns {{ [player_id]: object }}
 */
export function aggregateWeeks(weekData) {
  const totals = {};

  for (const { week, entries } of weekData) {
    if (!entries.length) continue;

    // Build the set of teams that had at least one player with gp === 1 this week.
    // Used to distinguish bye weeks from DNPs.
    const teamsPlaying = new Set();
    for (const { team, stats } of entries) {
      if (stats.gp === 1 && team) teamsPlaying.add(team);
    }

    for (const { player_id, team, stats } of entries) {
      if (!totals[player_id]) {
        totals[player_id] = {
          stats: {},
          gamesPlayed: 0,
          gamesStarted: 0,
          byeWeeks: 0,
          dnpWeeks: 0,
          weeklyPoints: {},
        };
      }

      const p = totals[player_id];

      if (stats.gp === 1) {
        p.gamesPlayed++;
        if (stats.gs === 1) p.gamesStarted++;
        // pts_half_ppr ?? 0 per the Phase 4 decision (canonical half-PPR scoring)
        p.weeklyPoints[week] = stats.pts_half_ppr ?? 0;

        // Sum all raw stat fields (same as app)
        for (const [key, val] of Object.entries(stats)) {
          if (val != null) p.stats[key] = (p.stats[key] ?? 0) + val;
        }
      } else {
        // gp === 0: player was in the response but did not play
        if (team && !teamsPlaying.has(team)) {
          p.byeWeeks++;
        } else {
          p.dnpWeeks++;
        }
      }
    }
  }

  // Compute fantasyPoints and attach scoringBasis sentinel
  for (const p of Object.values(totals)) {
    p.fantasyPoints = Math.round(
      Object.values(p.weeklyPoints).reduce((a, b) => a + b, 0) * 100
    ) / 100;
    p.scoringBasis = 'half_ppr';
  }

  return totals;
}
