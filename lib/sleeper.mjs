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

import fs from 'node:fs';
import path from 'node:path';

const STATS_BASE = 'https://api.sleeper.com';
const STATE_BASE = 'https://api.sleeper.app/v1';

// Sleeper weekly team-abbr → nflverse schedule team-abbr domain.
// Empirically (2012–2025) the only divergence is the Rams; everything else
// (SD/STL/OAK/LV/LAC/WAS/JAX) already matches the schedule verbatim and is era-accurate.
// Mirrors the app's src/utils/nflStats.js SCHEDULE_TEAM_ALIAS exactly.
export const SCHEDULE_TEAM_ALIAS = { LAR: 'LA' };

/** @param {string|null|undefined} team @returns {string|null} */
export function normalizeTeamForSchedule(team) {
  if (!team) return null;
  return SCHEDULE_TEAM_ALIAS[team] ?? team;
}

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
 * @param {object} [opts]  `cacheDir` (optional, must be outside process.cwd()): week w is read from
 *   `<cacheDir>/<year>-<w>.json` when present, else fetched and the raw response array written there.
 * @returns {Promise<Array<{ week: number, entries: Array, failed?: true }>>}
 */
export async function fetchSeasonWeeks(
  year,
  { dryRun = false, fetchImpl = fetch, delayMs = 200, retryDelayMs = 2000, cacheDir = null } = {},
) {
  if (!dryRun) console.log(`[sleeper] Fetching ${year} regular season (18 weeks)…`);
  const results = [];

  // weekly-scoring-keys A2: optional raw-response cache so the grade and the migration score the
  // SAME fetched bytes. Must live outside the repo (the only non-repo write of that slice).
  let cacheAbs = null;
  if (cacheDir) {
    cacheAbs = path.resolve(cacheDir);
    const cwd = process.cwd();
    const rel = path.relative(cwd, cacheAbs);
    if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
      throw new Error(`[sleeper] cacheDir ${cacheAbs} is inside the repo (${cwd}) — it must resolve outside it.`);
    }
    fs.mkdirSync(cacheAbs, { recursive: true });
  }
  const normalise = rawList => rawList
    .filter(e => e.player_id && e.stats)
    .map(e => ({
      player_id: e.player_id,
      team: e.team ?? null,           // top-level team field from Sleeper response
      stats: e.stats,
    }));

  for (let week = 1; week <= 18; week++) {
    const url = `${STATS_BASE}/stats/nfl/${year}/${week}?season_type=regular`;
    if (!dryRun) process.stdout.write(`  Week ${week}/18…`);

    let entries = null;
    let lastErr = null;
    const cacheFile = cacheAbs ? path.join(cacheAbs, `${year}-${week}.json`) : null;
    if (cacheFile && fs.existsSync(cacheFile)) {
      entries = normalise(JSON.parse(fs.readFileSync(cacheFile, 'utf8')));
    }
    for (let attempt = 1; !entries && attempt <= 2; attempt++) {
      try {
        const res = await fetchImpl(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const rawList = await res.json();

        // Normalise: keep entries that have player_id and stats
        entries = normalise(rawList);
        if (cacheFile) fs.writeFileSync(cacheFile, JSON.stringify(rawList), 'utf8');   // success only
        break;
      } catch (err) {
        lastErr = err;
        if (attempt < 2) await delay(retryDelayMs);
      }
    }

    if (entries) {
      results.push({ week, entries });
      if (!dryRun) process.stdout.write(` ${entries.length} players\n`);
    } else {
      console.warn(`[sleeper] Week ${week}/18 FAILED after 2 attempts (${lastErr.message}) — skipping`);
      results.push({ week, entries: [], failed: true });
    }

    if (week < 18) await delay(delayMs);
  }

  return results;
}

/**
 * Fetches the full Sleeper players map (GET /v1/players/nfl, ~15 MB).
 * Returns the raw parsed object { [sleeper_id]: playerRecord }.
 * Throws on non-OK response or non-object payload.
 *
 * @param {object} opts
 * @param {boolean} opts.dryRun  Only quiets progress logging
 * @returns {Promise<object>}
 */
export async function fetchPlayersMap({ dryRun = false } = {}) {
  if (!dryRun) console.log('[sleeper] Fetching full players map…');
  const url = `${STATE_BASE}/players/nfl`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sleeper players HTTP ${res.status}`);
  const raw = await res.json();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('[sleeper] players/nfl: expected object payload');
  }
  if (!dryRun) console.log(`[sleeper] Fetched ${Object.keys(raw).length} raw player records`);
  return raw;
}

/**
 * Derives each schedule-domain team's regular-season bye week(s) from a season's
 * REG games. The REG week count (17 for 2012–2020, 18 from 2021 on) is read off
 * the schedule itself — never hard-coded — so a 17-week season never produces a
 * week-18 bye.
 *
 * @param {Array<{week:number, gameType:string, homeTeam:string, awayTeam:string}>|null|undefined} games
 * @returns {Map<string, Set<number>>}  team abbr (schedule domain) → set of bye weeks
 */
export function computeTeamByeWeeks(games) {
  const regGames = (games ?? []).filter(g => g.gameType === 'REG');
  const weeks = [...new Set(regGames.map(g => g.week))];
  const teamsByWeek = new Map();
  const allTeams = new Set();
  for (const g of regGames) {
    if (!teamsByWeek.has(g.week)) teamsByWeek.set(g.week, new Set());
    teamsByWeek.get(g.week).add(g.homeTeam);
    teamsByWeek.get(g.week).add(g.awayTeam);
    allTeams.add(g.homeTeam);
    allTeams.add(g.awayTeam);
  }

  const byeWeeksByTeam = new Map();
  for (const team of allTeams) {
    const byes = new Set();
    for (const week of weeks) {
      if (!teamsByWeek.get(week).has(team)) byes.add(week);
    }
    byeWeeksByTeam.set(team, byes);
  }
  return byeWeeksByTeam;
}

// F-24: keys dropped from every player row's `stats` (never TEAM_* rows — see below).
// A DENYLIST, never an allowlist — CR-11/12/13/19's keys, kicking (all 9 keys live in
// every snapshot's scoringSettings) and bonus_* must survive untouched, and an allowlist
// would silently strip exactly those load-bearing-with-no-visible-consumer keys.
function isPrunedStatKey(key) {
  return key.startsWith('idp_') || key.startsWith('punt');
}

/**
 * weekly-scoring-keys (D-47): keys NEVER served in a week's `weeklyStats`. A DENYLIST like F-24
 * (CR-02) — a new scoring key must survive by default. Beyond the prefix/suffix rules in
 * isWeeklyStatsExcluded(): participation counts, Sleeper's own computed points, a rate. The 29
 * RATE_KEYS are a FROZEN LITERAL COPY (not read live from lib/fantasyPoints.mjs) so a future CR-14
 * re-port that grows RATE_KEYS cannot silently change served bytes or break the migration's
 * idempotency guard; test/sleeper.test.mjs asserts copy ⊇ RATE_KEYS, and a failure there means a
 * deliberate CR-02 change.
 */
export const WEEKLY_STATS_EXCLUDED_EXACT = Object.freeze(new Set([
  'gp', 'gs', 'gms_active', 'snp', 'pts_half_ppr', 'pts_ppr', 'pts_std', 'pts_idp', 'rec_ypt',
  'cmp_pct', 'def_kr_lng', 'def_kr_ypa', 'def_pr_lng', 'def_pr_ypa', 'down_3_pct',
  'down_4_pct', 'fgm_lng', 'fgm_pct', 'g2g_pct', 'kr_lng', 'kr_ypa', 'pass_lng',
  'pass_rtg', 'pass_td_lng', 'pass_ypa', 'pass_ypc', 'pos_rank_half_ppr',
  'pos_rank_ppr', 'pos_rank_std', 'pr_lng', 'pr_ypa', 'rec_lng', 'rec_td_lng',
  'rec_ypr', 'rush_lng', 'rush_td_lng', 'rush_ypa', 'rz_pct',
]));

/** True when `key` must not appear in `weeklyStats` (see WEEKLY_STATS_EXCLUDED_EXACT). */
export function isWeeklyStatsExcluded(key) {
  return isPrunedStatKey(key)
    || key.endsWith('_lng')
    || key.endsWith('_snp')
    || key.startsWith('pos_rank_')
    || key.startsWith('fan_pts_allow')
    || WEEKLY_STATS_EXCLUDED_EXACT.has(key);
}

/** A week's `stats` → a new object of the kept keys whose value is a finite non-zero number. */
export function weeklyScoringStats(stats) {
  const out = {};
  for (const [key, val] of Object.entries(stats ?? {})) {
    if (typeof val !== 'number' || !Number.isFinite(val) || val === 0) continue;
    if (isWeeklyStatsExcluded(key)) continue;
    out[key] = val;
  }
  return out;
}

/**
 * Sleeper occasionally returns duplicate entries for the same player_id in a week (2015 W1/W14).
 * Collapses to first-seen. Shared by aggregateWeeks and the weekly-basis grade so both pick the same
 * duplicate.
 * @returns {{ uniqueEntries: Array, dupeIds: string[] }}
 */
export function firstSeenEntries(entries) {
  const seen = new Set();
  const uniqueEntries = [];
  const dupeIds = [];
  for (const e of entries) {
    if (seen.has(e.player_id)) { dupeIds.push(e.player_id); continue; }
    seen.add(e.player_id);
    uniqueEntries.push(e);
  }
  return { uniqueEntries, dupeIds };
}

/**
 * F-24: drops idp_ and punt-prefixed keys from every player row's `stats`, in place. Skips
 * `TEAM_*` whole-team aggregate pseudo-rows entirely — one of them carries a
 * `punts` key today (a team's punt count), and those rows must survive the prune
 * unmodified. `<abbr>` DEF rows are untouched by the denylist itself (defense
 * never produces idp_/punt output) so need no separate guard.
 *
 * Shared by the forward ingest path (aggregateWeeks) and the one-shot historical
 * migration (scripts/migrate-f24-prune.mjs) so the denylist has one definition.
 *
 * @param {{ [id]: { stats?: object } }} totals
 * @returns {typeof totals}
 */
export function prunePlayerStats(totals) {
  for (const [id, row] of Object.entries(totals)) {
    if (id.startsWith('TEAM_')) continue;
    const stats = row.stats;
    if (!stats) continue;
    for (const key of Object.keys(stats)) {
      if (isPrunedStatKey(key)) delete stats[key];
    }
  }
  return totals;
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
 *     weeklyStatus: Array<'P'|'D'|'B'|'X'>  — Phase 5 (+ D-1 forward byes); length 18, 1-indexed
 *     availability: object                  — Phase 5; see computeAvailability()
 *     weeklyStats:  { [week]: { [key]: number } } — weekly-scoring-keys (D-47): that 'P' week's
 *                   non-zero stat values, every key except isWeeklyStatsExcluded() ones; a played
 *                   week with no kept value is omitted; Σ over weeks === stats[key] for every kept
 *                   key. Non-TEAM_* rows with gamesPlayed > 0 only. weeklyPoints stays half-PPR.
 *   }
 *
 * gp logic (mirrors app):
 *   gp === 1  → player played; contributes to gamesPlayed, weeklyPoints, stats (weeklyStatus 'P')
 *   gp === 0  → in response but did not play
 *     → if player's team was not playing this week → byeWeeks (weeklyStatus 'B')
 *     → else → dnpWeeks (weeklyStatus 'D')
 *   absent    → not in the response; no contribution (weeklyStatus stays 'X')
 *
 * D-1 (forward-only, at ingest — see task file f24-prune-and-d1-byes.md §5): when `schedule`
 * is supplied, single-team rows (exactly one team in playedCounts) get their team's bye
 * week(s) flipped from 'X' to 'B', with `byeWeeks` incremented to match. Multi-team and
 * never-played rows are left alone. A slot already 'D' (a DNP entry under a different team
 * during what is otherwise this player's bye) is left as 'D', never overwritten. `schedule`
 * is normally omitted for a historical re-aggregation — passing it there would silently
 * diverge the aggregation from the once-migrated on-disk file and break the nflHash
 * dry-run skip; scripts/update-nfl.mjs only supplies it while `inProgress` is true.
 *
 * F-24: idp_ and punt-prefixed keys are pruned from every non-TEAM_* row's `stats` at the
 * very end, after the sum loop — see prunePlayerStats().
 *
 * @param {Array} weekData  Output of fetchSeasonWeeks()
 * @param {Array|null} [schedule]  A season's REG games (nflverse/schedule/<year>.json `games`),
 *   or null/omitted to skip D-1 bye inference entirely (no schedule → no byes, no throw).
 * @returns {{ [player_id]: object }}
 */
export function aggregateWeeks(weekData, schedule = null) {
  const totals = {};
  // Transient map: pid → { playedCounts: Map<team,{count,lastWeek}>, lastSeenWeek, lastSeenTeam }
  const teamTracking = {};
  const byeWeeksByTeam = schedule ? computeTeamByeWeeks(schedule) : null;

  for (const { week, entries } of weekData) {
    if (!entries.length) continue;

    // Sleeper occasionally returns duplicate entries for the same player_id in a week
    // (observed in old seasons e.g. 2015 W1/W14). Collapse to first-seen so per-week
    // counts stay 1:1 with the weeklyStatus slot. Mirrors how the app's normalizeStatsResponse
    // builds a player_id → stats map, which inherently dedupes.
    // Dedup affects ALL fields: gamesPlayed, gamesStarted, byeWeeks, dnpWeeks,
    // weeklyPoints, raw stats, and weeklyStatus — the collapsed list is used exclusively.
    const { uniqueEntries, dupeIds } = firstSeenEntries(entries);
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
          team: null,
          gamesPlayed: 0,
          gamesStarted: 0,
          byeWeeks: 0,
          dnpWeeks: 0,
          weeklyPoints: {},
          weeklyStatus: Array(18).fill('X'),
          ...(player_id.startsWith('TEAM_') ? {} : { weeklyStats: {} }),
        };
        teamTracking[player_id] = { playedCounts: new Map(), lastSeenWeek: null, lastSeenTeam: null };
      }

      const p = totals[player_id];
      const tt = teamTracking[player_id];

      // Track team presence for per-season team resolution
      if (team) {
        tt.lastSeenWeek = week;
        tt.lastSeenTeam = team;
      }

      if (stats.gp === 1) {
        p.gamesPlayed++;
        if (stats.gs === 1) p.gamesStarted++;
        // pts_half_ppr ?? 0 per the Phase 4 decision (canonical half-PPR scoring)
        p.weeklyPoints[week] = stats.pts_half_ppr ?? 0;
        p.weeklyStatus[week - 1] = 'P';

        // weekly-scoring-keys: that week's kept non-zero scoring keys (never TEAM_* rows)
        if (p.weeklyStats) {
          const ws = weeklyScoringStats(stats);
          if (Object.keys(ws).length) p.weeklyStats[week] = ws;
        }

        // Sum all raw stat fields (same as app)
        for (const [key, val] of Object.entries(stats)) {
          if (val != null) p.stats[key] = (p.stats[key] ?? 0) + val;
        }

        // Track played-weeks per team for primary-team resolution
        if (team) {
          const prev = tt.playedCounts.get(team) ?? { count: 0, lastWeek: 0 };
          tt.playedCounts.set(team, { count: prev.count + 1, lastWeek: week });
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

  // Compute fantasyPoints, scoringBasis, per-player availability, and resolved team.
  for (const [pid, p] of Object.entries(totals)) {
    if (p.weeklyStats && p.gamesPlayed === 0) delete p.weeklyStats;   // field means "covered"
    p.fantasyPoints = Math.round(
      Object.values(p.weeklyPoints).reduce((a, b) => a + b, 0) * 100
    ) / 100;
    p.scoringBasis = 'half_ppr';
    p.availability = computeAvailability(p.weeklyStatus);

    const tt = teamTracking[pid];
    let resolvedTeam = null;
    if (tt.playedCounts.size > 0) {
      // Most played weeks; ties → most-recent played week (highest lastWeek)
      let best = null;
      for (const [abbr, { count, lastWeek }] of tt.playedCounts) {
        if (!best || count > best.count || (count === best.count && lastWeek > best.lastWeek)) {
          best = { abbr, count, lastWeek };
        }
      }
      resolvedTeam = best.abbr;
    } else if (tt.lastSeenTeam) {
      // Zero played weeks but appeared with a team
      resolvedTeam = tt.lastSeenTeam;
    }
    p.team = normalizeTeamForSchedule(resolvedTeam);

    // D-1: forward-only bye inference — single-team rows only, 'X' slots only.
    if (byeWeeksByTeam && tt.playedCounts.size === 1 && p.team) {
      const byes = byeWeeksByTeam.get(p.team);
      if (byes) {
        for (const week of byes) {
          const idx = week - 1;
          if (p.weeklyStatus[idx] === 'X') {
            p.weeklyStatus[idx] = 'B';
            p.byeWeeks++;
          }
        }
      }
    }
  }

  prunePlayerStats(totals);

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
