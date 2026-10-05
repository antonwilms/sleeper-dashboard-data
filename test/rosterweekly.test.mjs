/**
 * test/rosterweekly.test.mjs — parseRosterWeekly (R-1) and validateRosterWeekly (R-2, R-4).
 * Run with: node --test  (or npm test)
 */

import { test } from 'node:test';
import assert   from 'node:assert/strict';

import {
  parseRosterWeekly, ROSTER_WEEKLY_TEAM_ALIAS,
  MIN_ROSTERWEEKLY_WEEK_ROWS, MIN_ROSTERWEEKLY_WEEK_TEAMS,
} from '../lib/nflverse.mjs';
import { validateRosterWeekly } from '../lib/validate.mjs';

const HEADER = 'season,team,position,status,gsis_id,sleeper_id,week,game_type';

// ─── R-1 parse ───────────────────────────────────────────────────────────────

test('R-1 parseRosterWeekly: REG filter, alias, crosswalk join, unmapped, duplicates, skill counts', () => {
  const csv = [
    HEADER,
    '2013,HST,WR,ACT,00-A,1001,1,REG',      // GSIS team code → HOU
    '2013,HST,WR,ACT,00-A,1001,1,WC',       // non-REG → dropped
    '2013,KC,QB,INA,00-B,,1,REG',           // sleeper_id empty → crosswalk via gsis
    '2013,KC,RB,ACT,00-X,,1,REG',           // unresolvable → unmapped
    '2013,NYJ,TE,RES,00-C,1003,2,REG',      // duplicate (player, week): two pairs
    '2013,KC,TE,ACT,00-C,1003,2,REG',
    '2013,KC,K,ACT,00-D,1004,2,REG',        // non-skill, joined
  ].join('\n');
  const out = parseRosterWeekly(csv, { season: 2013, idsByGsis: { '00-B': { sleeperId: '1002' } } });

  assert.deepEqual(out.players['1001'], { 1: [['HOU', 'ACT']] }, 'WC dropped, HST → HOU');
  assert.deepEqual(out.players['1002'], { 1: [['KC', 'INA']] }, 'keyed via crosswalk');
  assert.equal(out.unmapped, 1);
  assert.equal(out.players['00-X'], undefined);
  assert.deepEqual(out.players['1003'], { 2: [['KC', 'ACT'], ['NYJ', 'RES']] }, 'duplicate kept, sorted by team');
  assert.equal(out.rowCount, 6, 'REG rows, mapped + unmapped');
  assert.equal(out.skillRows, 5);    // WR, QB, RB, TE, TE
  assert.equal(out.skillJoined, 4);  // the unmapped RB is not joined
  assert.deepEqual(out.weeks, [1, 2]);
  assert.deepEqual(out.rowsByWeek, { 1: 3, 2: 3 });
  assert.deepEqual(out.teamsByWeek, { 1: 2, 2: 2 });
});

// ─── R-2 validate ────────────────────────────────────────────────────────────

/** A derived object that passes for a completed 2016 season (17 weeks). */
function goodDerived(nWeeks = 17, { team = 'KC' } = {}) {
  const weeks = Array.from({ length: nWeeks }, (_, i) => i + 1);
  const rowsByWeek = {}, teamsByWeek = {};
  for (const w of weeks) { rowsByWeek[w] = MIN_ROSTERWEEKLY_WEEK_ROWS; teamsByWeek[w] = MIN_ROSTERWEEKLY_WEEK_TEAMS; }
  return { weeks, rowsByWeek, teamsByWeek, players: { 1: { 1: [[team, 'ACT']] } }, skillRows: 10, skillJoined: 10 };
}
const ctx = { year: 2016, currentSeason: 2026 };

test('R-2 validateRosterWeekly: passing completed 17-week and in-progress 4-week seasons do not throw', () => {
  assert.doesNotThrow(() => validateRosterWeekly(goodDerived(17), ctx));
  assert.doesNotThrow(() => validateRosterWeekly(goodDerived(18), { year: 2021, currentSeason: 2026 }));
  assert.doesNotThrow(() => validateRosterWeekly(goodDerived(4), { year: 2026, currentSeason: 2026 }));
});

test('R-2 validateRosterWeekly: each rule throws on a minimal failing input', () => {
  assert.throws(() => validateRosterWeekly(goodDerived(17), { year: 2011, currentSeason: 2026 }), /below MIN_ROSTERWEEKLY_SEASON/);

  const gap = goodDerived(17); gap.weeks = gap.weeks.filter(w => w !== 5);
  assert.throws(() => validateRosterWeekly(gap, ctx), /not contiguous/);

  assert.throws(() => validateRosterWeekly(goodDerived(16), ctx), /expected 17/);
  assert.throws(() => validateRosterWeekly(goodDerived(17), { year: 2021, currentSeason: 2026 }), /expected 18/);
  assert.throws(() => validateRosterWeekly(goodDerived(19), { year: 2026, currentSeason: 2026 }), /max 18/);

  const fewRows = goodDerived(17); fewRows.rowsByWeek[3] = MIN_ROSTERWEEKLY_WEEK_ROWS - 1;
  assert.throws(() => validateRosterWeekly(fewRows, ctx), /week 3 has/);

  const fewTeams = goodDerived(17); fewTeams.teamsByWeek[3] = MIN_ROSTERWEEKLY_WEEK_TEAMS - 1;
  assert.throws(() => validateRosterWeekly(fewTeams, ctx), /week 3 lists/);

  const lowJoin = goodDerived(17); lowJoin.skillJoined = 6;
  assert.throws(() => validateRosterWeekly(lowJoin, ctx), /join rate/);

  const unknownTeam = goodDerived(17, { team: 'ZZZ' });
  assert.throws(() => validateRosterWeekly(unknownTeam, ctx), /not in SCHEDULE_TEAMS/);
});

test('R-2 validateRosterWeekly: an in-progress newest week is exempt from the row/team floors; an earlier week is not', () => {
  const d = goodDerived(4);
  d.rowsByWeek[4] = 10; d.teamsByWeek[4] = 2;
  assert.doesNotThrow(() => validateRosterWeekly(d, { year: 2026, currentSeason: 2026 }));
  d.rowsByWeek[3] = 10;
  assert.throws(() => validateRosterWeekly(d, { year: 2026, currentSeason: 2026 }), /week 3 has/);
});

// ─── R-4 team domain ─────────────────────────────────────────────────────────

test('R-4 validateRosterWeekly: a stored LAR and a surviving GSIS alias key (HST) each throw', () => {
  assert.throws(() => validateRosterWeekly(goodDerived(17, { team: 'LAR' }), ctx), /'LAR' is not in the schedule domain/);
  assert.ok('HST' in ROSTER_WEEKLY_TEAM_ALIAS);
  assert.throws(() => validateRosterWeekly(goodDerived(17, { team: 'HST' }), ctx), /'HST' is not in the schedule domain/);
});
