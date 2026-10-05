/**
 * lib/absence.mjs — pure weekly-roster absence classifier (no I/O).
 *
 * Sleeper's weekly response omits a player entirely for some weeks he missed, which
 * aggregateWeeks leaves as 'X' ("no game recorded"). classifyAbsences turns such an 'X' into
 * 'D' (did not play) when the nflverse weekly roster lists the player with an availability
 * status on a team that played that week. See absence-classification-a.md D1–D4.
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
 * D1–D3. Returns { totals, changedSlots, changedRows, byStatus }. `totals` is a new object:
 * rows that change are shallow-cloned with a fresh weeklyStatus array, dnpWeeks and
 * availability; every other row is the same reference. The input is never mutated.
 * `rosterWeekly` is the `players` map of nflverse/rosterweekly/<year>.json.
 */
export function classifyAbsences(totals, rosterWeekly, { season }) {
  if (!Number.isInteger(season)) {
    throw new Error(`classifyAbsences: season must be an integer, got ${season}`);
  }
  if (season < MIN_ABSENCE_CLASSIFY_SEASON) {
    return { totals, changedSlots: 0, changedRows: 0, byStatus: {} };
  }
  if (rosterWeekly == null) throw new Error('classifyAbsences: rosterWeekly is required');

  const played = teamPlayedWeeks(totals);
  const out = {};
  const byStatus = {};
  let changedSlots = 0;
  let changedRows = 0;

  for (const [id, row] of Object.entries(totals)) {
    out[id] = row;
    if (id.startsWith('TEAM_') || !Array.isArray(row?.weeklyStatus)) continue;

    let next = null;
    let n = 0;
    row.weeklyStatus.forEach((s, i) => {
      if (s !== 'X') return;
      const pairs = rosterWeekly[id]?.[String(i + 1)] ?? [];
      const hit = pairs.find(([team, status]) =>
        MISSED_ROSTER_STATUSES.has(status) && played.get(team)?.has(i));
      if (!hit) return;
      next ??= [...row.weeklyStatus];
      next[i] = 'D';
      n++;
      byStatus[hit[1]] = (byStatus[hit[1]] ?? 0) + 1;
    });

    if (n > 0) {
      out[id] = { ...row, weeklyStatus: next, dnpWeeks: (row.dnpWeeks ?? 0) + n,
        availability: computeAvailability(next) };
      changedSlots += n;
      changedRows++;
    }
  }
  return { totals: out, changedSlots, changedRows, byStatus };
}
