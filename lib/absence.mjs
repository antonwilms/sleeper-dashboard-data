/**
 * lib/absence.mjs — pure weekly-roster absence classifier (no I/O).
 *
 * One roster predicate decides 'X' ("no game recorded") vs 'D' (did not play) in both directions
 * (D-76). From 2016, for week i with `pairs` = the player's nflverse roster listings that week and
 * `missed` = some pair has a MISSED_ROSTER_STATUSES status on a team that played week i:
 *   - 'X' with pairs non-empty and missed → 'D'  (Sleeper omitted a player who was on the roster);
 *   - 'D' with pairs non-empty and not missed → 'X'  (a role week — practice squad, cut, exempt,
 *     trade/transfer — that Sleeper returned with gp 0; not a missed game).
 * `pairs` empty (no listing) leaves the slot as Sleeper wrote it, in both directions: the roster file
 * admits weeks with as few as MIN_ROSTERWEEKLY_WEEK_TEAMS teams, so "no listing" can mean "team
 * missing from the file", not "not on a roster". 'P' and 'B' are never touched.
 * See absence-classification-a.md D1–D4 and d76-absence-role.md D1–D2.
 */

import { computeAvailability } from './sleeper.mjs';

// D1 — roster statuses that make a team-played 'X' week a missed game.
export const MISSED_ROSTER_STATUSES = new Set(['ACT', 'INA', 'RES', 'PUP']);
// D4 — before 2016 the weekly status is a season value copied onto every week; never classify it.
export const MIN_ABSENCE_CLASSIFY_SEASON = 2016;

/**
 * D2 — team → Set of 0-based week indices the team played, read from the season file's own
 * TEAM_* rows ('P' in weeklyStatus). A bye or a not-yet-played week has no 'P'.
 */
export function teamPlayedWeeks(totals) {
  const played = new Map();
  for (const [id, row] of Object.entries(totals)) {
    if (!id.startsWith('TEAM_') || !Array.isArray(row?.weeklyStatus)) continue;
    const set = played.get(row.team) ?? new Set();
    row.weeklyStatus.forEach((s, i) => { if (s === 'P') set.add(i); });
    played.set(row.team, set);
  }
  return played;
}

/**
 * D-76 — the single roster predicate: some listing is a MISSED status on a team that played week i.
 */
function missedOnRoster(pairs, played, i) {
  return pairs.some(([team, status]) => MISSED_ROSTER_STATUSES.has(status) && played.get(team)?.has(i));
}

/**
 * Returns { totals, changedSlots, changedRows, byStatus, promotedSlots, demotedSlots,
 * demotedByStatus }. `totals` is a new object: rows that change are shallow-cloned with a fresh
 * weeklyStatus array, dnpWeeks and availability; every other row is the same reference. The input is
 * never mutated. `changedSlots` = promotedSlots + demotedSlots. `byStatus` keys promotions by the
 * matching MISSED status; `demotedByStatus` keys demotions by the slot's distinct statuses, sorted
 * and '+'-joined (e.g. "CUT+DEV"). `rosterWeekly` is the `players` map of
 * nflverse/rosterweekly/<year>.json.
 */
export function classifyAbsences(totals, rosterWeekly, { season }) {
  if (!Number.isInteger(season)) {
    throw new Error(`classifyAbsences: season must be an integer, got ${season}`);
  }
  if (season < MIN_ABSENCE_CLASSIFY_SEASON) {
    return {
      totals, changedSlots: 0, changedRows: 0, byStatus: {},
      promotedSlots: 0, demotedSlots: 0, demotedByStatus: {},
    };
  }
  if (rosterWeekly == null) throw new Error('classifyAbsences: rosterWeekly is required');

  const played = teamPlayedWeeks(totals);
  const out = {};
  const byStatus = {};
  const demotedByStatus = {};
  let promotedSlots = 0;
  let demotedSlots = 0;
  let changedRows = 0;

  for (const [id, row] of Object.entries(totals)) {
    out[id] = row;
    if (id.startsWith('TEAM_') || !Array.isArray(row?.weeklyStatus)) continue;

    let next = null;
    let promoted = 0;
    let demoted = 0;
    row.weeklyStatus.forEach((s, i) => {
      if (s !== 'X' && s !== 'D') return;
      const pairs = rosterWeekly[id]?.[String(i + 1)] ?? [];
      if (pairs.length === 0) return;
      const missed = missedOnRoster(pairs, played, i);
      if (s === 'X' && missed) {
        next ??= [...row.weeklyStatus];
        next[i] = 'D';
        promoted++;
        const hit = pairs.find(([team, status]) => MISSED_ROSTER_STATUSES.has(status) && played.get(team)?.has(i));
        byStatus[hit[1]] = (byStatus[hit[1]] ?? 0) + 1;
      } else if (s === 'D' && !missed) {
        next ??= [...row.weeklyStatus];
        next[i] = 'X';
        demoted++;
        const key = [...new Set(pairs.map(([, status]) => status))].sort().join('+');
        demotedByStatus[key] = (demotedByStatus[key] ?? 0) + 1;
      }
    });

    if (next) {
      out[id] = { ...row, weeklyStatus: next, dnpWeeks: (row.dnpWeeks ?? 0) + promoted - demoted,
        availability: computeAvailability(next) };
      promotedSlots += promoted;
      demotedSlots += demoted;
      changedRows++;
    }
  }
  return {
    totals: out, changedSlots: promotedSlots + demotedSlots, changedRows, byStatus,
    promotedSlots, demotedSlots, demotedByStatus,
  };
}
