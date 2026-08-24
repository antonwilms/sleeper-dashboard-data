import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateWeeks, computeAvailability, normalizeTeamForSchedule, SCHEDULE_TEAM_ALIAS,
  computeTeamByeWeeks, prunePlayerStats,
} from '../lib/sleeper.mjs';

// weeks are 1-indexed; e.g. ws({ 1: 'P', 6: 'D' })
const ws = (o = {}) => Array.from({ length: 18 }, (_, i) => o[i + 1] ?? 'X');

// ═══════════════════════════════════════════════════════════════════
// Suite 1 — computeAvailability (direct unit tests)
// ═══════════════════════════════════════════════════════════════════

test('CA1 — never played (all X) → all-null early return', () => {
  assert.deepStrictEqual(
    computeAvailability(Array(18).fill('X')),
    { longestAbsence: 0, absenceSegments: [], firstWeek: null, lastWeek: null, returnedFromAbsence: false, absenceCause: 'unknown' }
  );
});

test('CA2 — full modern season (all P) → no absence, lastWeek 18', () => {
  assert.deepStrictEqual(
    computeAvailability(Array(18).fill('P')),
    { longestAbsence: 0, absenceSegments: [], firstWeek: 1, lastWeek: 18, returnedFromAbsence: false, absenceCause: 'unknown' }
  );
});

test('CA3 — single bye + pre-2021 wk18 X: B not a segment; lastWeek 17', () => {
  const input = ws({ 1:'P',2:'P',3:'P',4:'P',5:'P',6:'P',7:'P',8:'P', 9:'B', 10:'P',11:'P',12:'P',13:'P',14:'P',15:'P',16:'P',17:'P' });
  assert.deepStrictEqual(
    computeAvailability(input),
    { longestAbsence: 0, absenceSegments: [], firstWeek: 1, lastWeek: 17, returnedFromAbsence: false, absenceCause: 'unknown' }
  );
});

test('CA4 — one interior DNP run → returnedFromAbsence true, one segment', () => {
  const input = ws({ 1:'P',2:'P',3:'P',4:'P',5:'P', 6:'D',7:'D', 8:'P',9:'P',10:'P',11:'P',12:'P',13:'P',14:'P',15:'P',16:'P',17:'P',18:'P' });
  assert.deepStrictEqual(
    computeAvailability(input),
    { longestAbsence: 2, absenceSegments: [{ start: 6, end: 7, length: 2 }], firstWeek: 1, lastWeek: 18, returnedFromAbsence: true, absenceCause: 'unknown' }
  );
});

test('CA5 — two separate DNP runs → multiple segments; longestAbsence = max', () => {
  const input = ws({ 1:'P', 2:'D', 3:'P', 4:'D',5:'D',6:'D', 7:'P',8:'P',9:'P',10:'P',11:'P',12:'P',13:'P',14:'P',15:'P',16:'P',17:'P',18:'P' });
  assert.deepStrictEqual(
    computeAvailability(input),
    { longestAbsence: 3, absenceSegments: [{ start: 2, end: 2, length: 1 }, { start: 4, end: 6, length: 3 }], firstWeek: 1, lastWeek: 18, returnedFromAbsence: true, absenceCause: 'unknown' }
  );
});

test('CA6 — B and X inside window break runs and are excluded from segments', () => {
  const input = ws({ 1:'P', 2:'D', 3:'B', 4:'D', 5:'X', 6:'D', 7:'P',8:'P',9:'P',10:'P',11:'P',12:'P',13:'P',14:'P',15:'P',16:'P',17:'P',18:'P' });
  assert.deepStrictEqual(
    computeAvailability(input),
    { longestAbsence: 1, absenceSegments: [{ start: 2, end: 2, length: 1 }, { start: 4, end: 4, length: 1 }, { start: 6, end: 6, length: 1 }], firstWeek: 1, lastWeek: 18, returnedFromAbsence: true, absenceCause: 'unknown' }
  );
});

test('CA7 — trailing DNPs after last P excluded from window', () => {
  const input = ws({ 1:'P',2:'P',3:'P',4:'P',5:'P',6:'P',7:'P',8:'P',9:'P',10:'P', 11:'D',12:'D',13:'D',14:'D',15:'D',16:'D',17:'D',18:'D' });
  assert.deepStrictEqual(
    computeAvailability(input),
    { longestAbsence: 0, absenceSegments: [], firstWeek: 1, lastWeek: 10, returnedFromAbsence: false, absenceCause: 'unknown' }
  );
});

test('CA8 — leading DNPs before first P excluded; interior D counted', () => {
  const input = ws({ 1:'D', 2:'D', 3:'P', 4:'D', 5:'P',6:'P',7:'P',8:'P',9:'P',10:'P',11:'P',12:'P',13:'P',14:'P',15:'P',16:'P',17:'P',18:'P' });
  assert.deepStrictEqual(
    computeAvailability(input),
    { longestAbsence: 1, absenceSegments: [{ start: 4, end: 4, length: 1 }], firstWeek: 3, lastWeek: 18, returnedFromAbsence: true, absenceCause: 'unknown' }
  );
});

test('CA11 — long single DNP run (weeks 2–9, length 8)', () => {
  const input = ws({ 1:'P', 2:'D',3:'D',4:'D',5:'D',6:'D',7:'D',8:'D',9:'D', 10:'P',11:'P',12:'P',13:'P',14:'P',15:'P',16:'P',17:'P',18:'P' });
  assert.deepStrictEqual(
    computeAvailability(input),
    { longestAbsence: 8, absenceSegments: [{ start: 2, end: 9, length: 8 }], firstWeek: 1, lastWeek: 18, returnedFromAbsence: true, absenceCause: 'unknown' }
  );
});

// ═══════════════════════════════════════════════════════════════════
// Suite 2 — aggregateWeeks (end-to-end integration tests)
// ═══════════════════════════════════════════════════════════════════

test('AW1 — single played week: full stat summation (incl. gp/gs/pts_half_ppr), weeklyPoints, weeklyStatus, availability', () => {
  const totals = aggregateWeeks([
    { week: 1, entries: [ { player_id: 'p1', team: 'KC', stats: { gp: 1, gs: 1, pts_half_ppr: 12.5, rec: 5, rec_yd: 80, rush_yd: 10 } } ] },
  ]);
  assert.deepStrictEqual(totals['p1'], {
    stats: { gp: 1, gs: 1, pts_half_ppr: 12.5, rec: 5, rec_yd: 80, rush_yd: 10 },
    team: 'KC',
    gamesPlayed: 1, gamesStarted: 1, byeWeeks: 0, dnpWeeks: 0,
    weeklyPoints: { 1: 12.5 },
    weeklyStatus: ws({ 1: 'P' }),
    fantasyPoints: 12.5,
    scoringBasis: 'half_ppr',
    availability: { longestAbsence: 0, absenceSegments: [], firstWeek: 1, lastWeek: 1, returnedFromAbsence: false, absenceCause: 'unknown' },
  });
});

test('AW2 — gs:0 does not bump gamesStarted; two-week stat accumulation', () => {
  const totals = aggregateWeeks([
    { week: 1, entries: [ { player_id: 'p1', team: 'KC', stats: { gp: 1, gs: 0, pts_half_ppr: 6.25, rec: 3, rec_yd: 40 } } ] },
    { week: 2, entries: [ { player_id: 'p1', team: 'KC', stats: { gp: 1, gs: 1, pts_half_ppr: 9.75, rec: 4, rec_yd: 55 } } ] },
  ]);
  assert.deepStrictEqual(totals['p1'], {
    stats: { gp: 2, gs: 1, pts_half_ppr: 16, rec: 7, rec_yd: 95 },
    team: 'KC',
    gamesPlayed: 2, gamesStarted: 1, byeWeeks: 0, dnpWeeks: 0,
    weeklyPoints: { 1: 6.25, 2: 9.75 },
    weeklyStatus: ws({ 1: 'P', 2: 'P' }),
    fantasyPoints: 16,
    scoringBasis: 'half_ppr',
    availability: { longestAbsence: 0, absenceSegments: [], firstWeek: 1, lastWeek: 2, returnedFromAbsence: false, absenceCause: 'unknown' },
  });
});

test('AW3 — bye: whole team absent (no gp:1) → B; empty stats, fantasyPoints 0, all-null availability', () => {
  const totals = aggregateWeeks([
    { week: 9, entries: [
      { player_id: 'kc1',  team: 'KC',  stats: { gp: 0 } },
      { player_id: 'kc2',  team: 'KC',  stats: { gp: 0 } },
      { player_id: 'buf1', team: 'BUF', stats: { gp: 1, gs: 1, pts_half_ppr: 18.0 } },
    ] },
  ]);
  const byeRecord = {
    stats: {}, team: 'KC', gamesPlayed: 0, gamesStarted: 0, byeWeeks: 1, dnpWeeks: 0,
    weeklyPoints: {}, weeklyStatus: ws({ 9: 'B' }),
    fantasyPoints: 0, scoringBasis: 'half_ppr',
    availability: { longestAbsence: 0, absenceSegments: [], firstWeek: null, lastWeek: null, returnedFromAbsence: false, absenceCause: 'unknown' },
  };
  assert.deepStrictEqual(totals['kc1'], byeRecord);
  assert.deepStrictEqual(totals['kc2'], byeRecord);
  assert.deepStrictEqual(totals['buf1'], {
    stats: { gp: 1, gs: 1, pts_half_ppr: 18 }, team: 'BUF', gamesPlayed: 1, gamesStarted: 1, byeWeeks: 0, dnpWeeks: 0,
    weeklyPoints: { 9: 18 }, weeklyStatus: ws({ 9: 'P' }),
    fantasyPoints: 18, scoringBasis: 'half_ppr',
    availability: { longestAbsence: 0, absenceSegments: [], firstWeek: 9, lastWeek: 9, returnedFromAbsence: false, absenceCause: 'unknown' },
  });
});

test('AW4 — DNP: one gp:1 teammate flips non-player from bye to D', () => {
  const totals = aggregateWeeks([
    { week: 5, entries: [
      { player_id: 'star',  team: 'KC', stats: { gp: 1, gs: 1, pts_half_ppr: 25.0 } },
      { player_id: 'scrub', team: 'KC', stats: { gp: 0 } },
    ] },
  ]);
  assert.deepStrictEqual(totals['scrub'], {
    stats: {}, team: 'KC', gamesPlayed: 0, gamesStarted: 0, byeWeeks: 0, dnpWeeks: 1,
    weeklyPoints: {}, weeklyStatus: ws({ 5: 'D' }),
    fantasyPoints: 0, scoringBasis: 'half_ppr',
    availability: { longestAbsence: 0, absenceSegments: [], firstWeek: null, lastWeek: null, returnedFromAbsence: false, absenceCause: 'unknown' },
  });
});

test('AW5 — team: null on non-playing entry → DNP (team && guard)', () => {
  const totals = aggregateWeeks([
    { week: 3, entries: [ { player_id: 'p1', team: null, stats: { gp: 0 } } ] },
  ]);
  assert.deepStrictEqual(totals['p1'], {
    stats: {}, team: null, gamesPlayed: 0, gamesStarted: 0, byeWeeks: 0, dnpWeeks: 1,
    weeklyPoints: {}, weeklyStatus: ws({ 3: 'D' }),
    fantasyPoints: 0, scoringBasis: 'half_ppr',
    availability: { longestAbsence: 0, absenceSegments: [], firstWeek: null, lastWeek: null, returnedFromAbsence: false, absenceCause: 'unknown' },
  });
});

test('AW7 — duplicate-player collapse (first-seen wins per week); no stat inflation', () => {
  const totals = aggregateWeeks([
    { week: 1, entries: [ { player_id: 'dup', team: 'KC', stats: { gp: 1, gs: 1, pts_half_ppr: 10.0, rec: 5, rec_yd: 60 } } ] },
    { week: 2, entries: [
      { player_id: 'dup', team: 'KC', stats: { gp: 1, gs: 0, pts_half_ppr: 8.0,  rec: 4,  rec_yd: 30  } },
      { player_id: 'dup', team: 'KC', stats: { gp: 1, gs: 1, pts_half_ppr: 99.0, rec: 50, rec_yd: 600 } },
    ] },
  ]);
  assert.deepStrictEqual(totals['dup'], {
    stats: { gp: 2, gs: 1, pts_half_ppr: 18, rec: 9, rec_yd: 90 },
    team: 'KC',
    gamesPlayed: 2, gamesStarted: 1, byeWeeks: 0, dnpWeeks: 0,
    weeklyPoints: { 1: 10, 2: 8 },
    weeklyStatus: ws({ 1: 'P', 2: 'P' }),
    fantasyPoints: 18, scoringBasis: 'half_ppr',
    availability: { longestAbsence: 0, absenceSegments: [], firstWeek: 1, lastWeek: 2, returnedFromAbsence: false, absenceCause: 'unknown' },
  });
});

test('AW8 — pre-2021 wk18: empty entries → slot 18 stays X; lastWeek 17', () => {
  const totals = aggregateWeeks([
    ...Array.from({ length: 17 }, (_, i) => ({
      week: i + 1,
      entries: [ { player_id: 'p1', team: 'KC', stats: { gp: 1, gs: 1, pts_half_ppr: 10.0 } } ],
    })),
    { week: 18, entries: [] },
  ]);
  assert.deepStrictEqual(totals['p1'], {
    stats: { gp: 17, gs: 17, pts_half_ppr: 170 },
    team: 'KC',
    gamesPlayed: 17, gamesStarted: 17, byeWeeks: 0, dnpWeeks: 0,
    weeklyPoints: { 1:10,2:10,3:10,4:10,5:10,6:10,7:10,8:10,9:10,10:10,11:10,12:10,13:10,14:10,15:10,16:10,17:10 },
    weeklyStatus: ws({ 1:'P',2:'P',3:'P',4:'P',5:'P',6:'P',7:'P',8:'P',9:'P',10:'P',11:'P',12:'P',13:'P',14:'P',15:'P',16:'P',17:'P' }),
    fantasyPoints: 170, scoringBasis: 'half_ppr',
    availability: { longestAbsence: 0, absenceSegments: [], firstWeek: 1, lastWeek: 17, returnedFromAbsence: false, absenceCause: 'unknown' },
  });
});

test('AW9 — empty mid-season week (failed fetch) → X, not D/B', () => {
  const totals = aggregateWeeks([
    { week: 1, entries: [ { player_id: 'p1', team: 'KC', stats: { gp: 1, gs: 1, pts_half_ppr: 10.0 } } ] },
    { week: 2, entries: [] },
    { week: 3, entries: [ { player_id: 'p1', team: 'KC', stats: { gp: 1, gs: 1, pts_half_ppr: 12.0 } } ] },
  ]);
  assert.deepStrictEqual(totals['p1'], {
    stats: { gp: 2, gs: 2, pts_half_ppr: 22 },
    team: 'KC',
    gamesPlayed: 2, gamesStarted: 2, byeWeeks: 0, dnpWeeks: 0,
    weeklyPoints: { 1: 10, 3: 12 },
    weeklyStatus: ws({ 1: 'P', 3: 'P' }),
    fantasyPoints: 22, scoringBasis: 'half_ppr',
    availability: { longestAbsence: 0, absenceSegments: [], firstWeek: 1, lastWeek: 3, returnedFromAbsence: false, absenceCause: 'unknown' },
  });
});

test('AW10 — fantasyPoints rounds to 2-dp; stats.pts_half_ppr retains raw float (diverge)', () => {
  const totals = aggregateWeeks([
    { week: 1, entries: [ { player_id: 'p1', team: 'KC', stats: { gp: 1, gs: 1, pts_half_ppr: 10.1 } } ] },
    { week: 2, entries: [ { player_id: 'p1', team: 'KC', stats: { gp: 1, gs: 1, pts_half_ppr: 10.2 } } ] },
  ]);
  // 10.1 + 10.2 = 20.299999999999997 (IEEE-754). round(20.2999...*100)/100 = 20.3
  const p = totals['p1'];
  assert.strictEqual(p.fantasyPoints, 20.3);
  assert.ok(Math.abs(p.stats.pts_half_ppr - 20.3) < 1e-9);
  assert.notStrictEqual(p.stats.pts_half_ppr, p.fantasyPoints);
  assert.deepStrictEqual(p.weeklyPoints, { 1: 10.1, 2: 10.2 });
  assert.strictEqual(p.gamesPlayed, 2);
  assert.deepStrictEqual(p.weeklyStatus, ws({ 1: 'P', 2: 'P' }));
  assert.deepStrictEqual(p.availability, { longestAbsence: 0, absenceSegments: [], firstWeek: 1, lastWeek: 2, returnedFromAbsence: false, absenceCause: 'unknown' });
});

test('AW11 — capstone: all four status codes, absence segment, trailing-DNP exclusion from availability', () => {
  const totals = aggregateWeeks([
    { week: 1,  entries: [ { player_id: 'p1', team: 'KC', stats: { gp: 1, gs: 1, pts_half_ppr: 10.0 } } ] },
    { week: 2,  entries: [ { player_id: 'p1', team: 'KC', stats: { gp: 1, gs: 1, pts_half_ppr: 10.0 } } ] },
    { week: 3,  entries: [ { player_id: 'p1', team: 'KC', stats: { gp: 0 } }, { player_id: 'mate', team: 'KC', stats: { gp: 1, gs: 1, pts_half_ppr: 5.0 } } ] },
    { week: 4,  entries: [ { player_id: 'p1', team: 'KC', stats: { gp: 0 } }, { player_id: 'mate', team: 'KC', stats: { gp: 1, gs: 1, pts_half_ppr: 5.0 } } ] },
    { week: 5,  entries: [ { player_id: 'p1', team: 'KC', stats: { gp: 1, gs: 1, pts_half_ppr: 10.0 } } ] },
    { week: 6,  entries: [ { player_id: 'p1', team: 'KC', stats: { gp: 0 } } ] },
    { week: 7,  entries: [ { player_id: 'p1', team: 'KC', stats: { gp: 1, gs: 1, pts_half_ppr: 10.0 } } ] },
    { week: 8,  entries: [] },
    { week: 9,  entries: [ { player_id: 'p1', team: 'KC', stats: { gp: 1, gs: 1, pts_half_ppr: 10.0 } } ] },
    { week: 10, entries: [ { player_id: 'p1', team: 'KC', stats: { gp: 0 } }, { player_id: 'mate', team: 'KC', stats: { gp: 1, gs: 1, pts_half_ppr: 5.0 } } ] },
  ]);
  assert.deepStrictEqual(totals['p1'], {
    stats: { gp: 5, gs: 5, pts_half_ppr: 50 },
    team: 'KC',
    gamesPlayed: 5, gamesStarted: 5, byeWeeks: 1, dnpWeeks: 3,
    weeklyPoints: { 1: 10, 2: 10, 5: 10, 7: 10, 9: 10 },
    weeklyStatus: ws({ 1:'P', 2:'P', 3:'D', 4:'D', 5:'P', 6:'B', 7:'P', 9:'P', 10:'D' }),
    fantasyPoints: 50, scoringBasis: 'half_ppr',
    availability: { longestAbsence: 2, absenceSegments: [{ start: 3, end: 4, length: 2 }], firstWeek: 1, lastWeek: 9, returnedFromAbsence: true, absenceCause: 'unknown' },
  });
  assert.deepStrictEqual(totals['mate'], {
    stats: { gp: 3, gs: 3, pts_half_ppr: 15 },
    team: 'KC',
    gamesPlayed: 3, gamesStarted: 3, byeWeeks: 0, dnpWeeks: 0,
    weeklyPoints: { 3: 5, 4: 5, 10: 5 },
    weeklyStatus: ws({ 3: 'P', 4: 'P', 10: 'P' }),
    fantasyPoints: 15, scoringBasis: 'half_ppr',
    availability: { longestAbsence: 0, absenceSegments: [], firstWeek: 3, lastWeek: 10, returnedFromAbsence: false, absenceCause: 'unknown' },
  });
});

// ═══════════════════════════════════════════════════════════════════
// Suite 3 — per-season team (AW-team-* + norm-1 + drift guard)
// ═══════════════════════════════════════════════════════════════════

// Minimal week-data builder: each entry is { week, entries: [{ player_id, team, stats }] }
function mkEntry(pid, team, gp, week = 1) {
  return { week, entries: [{ player_id: pid, team, stats: { gp, pts_half_ppr: gp ? 5 : 0 } }] };
}

test('AW-team-1: single team across played weeks → team = that team', () => {
  const data = [
    mkEntry('p1', 'KC', 1, 1),
    mkEntry('p1', 'KC', 1, 2),
    mkEntry('p1', 'KC', 1, 3),
  ];
  assert.equal(aggregateWeeks(data)['p1'].team, 'KC');
});

test('AW-team-2: LAR normalizes to LA; STL stays STL (era-accurate)', () => {
  const larData = [mkEntry('p1', 'LAR', 1, 1), mkEntry('p1', 'LAR', 1, 2)];
  assert.equal(aggregateWeeks(larData)['p1'].team, 'LA');

  const stlData = [mkEntry('p1', 'STL', 1, 1), mkEntry('p1', 'STL', 1, 2)];
  assert.equal(aggregateWeeks(stlData)['p1'].team, 'STL');
});

test('AW-team-3: mid-season trade, plurality wins → team B (most played weeks)', () => {
  const data = [
    mkEntry('p1', 'A', 1, 1),
    mkEntry('p1', 'A', 1, 2),
    mkEntry('p1', 'A', 1, 3),
    mkEntry('p1', 'B', 1, 4),
    mkEntry('p1', 'B', 1, 5),
    mkEntry('p1', 'B', 1, 6),
    mkEntry('p1', 'B', 1, 7),
    mkEntry('p1', 'B', 1, 8),
    mkEntry('p1', 'B', 1, 9),
    mkEntry('p1', 'B', 1, 10),
  ];
  assert.equal(aggregateWeeks(data)['p1'].team, 'B');
});

test('AW-team-4: trade tie → most-recent played team wins (B)', () => {
  const data = [
    mkEntry('p1', 'A', 1, 1),
    mkEntry('p1', 'A', 1, 2),
    mkEntry('p1', 'B', 1, 3),
    mkEntry('p1', 'B', 1, 4),
  ];
  assert.equal(aggregateWeeks(data)['p1'].team, 'B');
});

test('AW-team-5: never played (gp=0), all team C → team = C (most-recent appearance), gamesPlayed = 0', () => {
  const data = [
    mkEntry('p1', 'C', 0, 1),
    mkEntry('p1', 'C', 0, 2),
    mkEntry('p1', 'C', 0, 3),
  ];
  const result = aggregateWeeks(data)['p1'];
  assert.equal(result.team, 'C');
  assert.equal(result.gamesPlayed, 0);
});

test('AW-team-6: entries with team null only → team = null', () => {
  const data = [
    { week: 1, entries: [{ player_id: 'p1', team: null, stats: { gp: 1, pts_half_ppr: 5 } }] },
    { week: 2, entries: [{ player_id: 'p1', team: null, stats: { gp: 1, pts_half_ppr: 5 } }] },
  ];
  const result = aggregateWeeks(data)['p1'];
  assert.equal(result.team, null);
  assert.equal(result.gamesPlayed, 2);
});

// norm-1: normalizeTeamForSchedule direct unit tests
test('norm-1: normalizeTeamForSchedule behaves correctly', () => {
  assert.equal(normalizeTeamForSchedule('LAR'), 'LA');
  assert.equal(normalizeTeamForSchedule('OAK'), 'OAK');
  assert.equal(normalizeTeamForSchedule('KC'), 'KC');
  assert.equal(normalizeTeamForSchedule(null), null);
  assert.equal(normalizeTeamForSchedule(undefined), null);
});

// drift guard: every alias value is in the schedule abbreviation domain
test('drift guard: every SCHEDULE_TEAM_ALIAS value is in the schedule team domain', () => {
  const SCHEDULE_TEAMS_INLINE = new Set([
    'ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND',
    'JAX','KC','LA','LAC','LV','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SEA','SF',
    'TB','TEN','WAS','SD','STL','OAK',
  ]);
  for (const [from, to] of Object.entries(SCHEDULE_TEAM_ALIAS)) {
    assert.ok(
      SCHEDULE_TEAMS_INLINE.has(to),
      `SCHEDULE_TEAM_ALIAS maps ${from} → ${to}, but ${to} is not in the schedule team domain`
    );
  }
});

// ═══════════════════════════════════════════════════════════════════
// Suite 4 — F-24 prune (prunePlayerStats) + D-1 bye inference
// ═══════════════════════════════════════════════════════════════════

test('F24-1 — denylist: idp_*/punt* keys dropped, CR-11/12/13/19 + kicking + bonus_ + kr_/pr_ survive', () => {
  const totals = {
    p1: {
      stats: {
        // idp_* (17 keys, one sample)
        idp_tkl: 5, idp_sack: 1,
        // punt* (6 keys, one sample)
        punts: 4, punt_yds: 160,
        // CR-11 (usage/RZ)
        off_snp: 40, tm_off_snp: 60, rec_rz_tgt: 2, rush_rz_att: 1, pass_rz_att: 0,
        // CR-12
        pass_cmp: 20,
        // CR-13
        rec_air_yd: 100,
        // CR-19
        pass_sack: 2, pass_air_yd: 50, rush_yac: 10, rush_btkl: 1, rec_drop: 1,
        // kicking (must survive — never pruned)
        fga: 2, fgm: 1, xpa: 1, xpm: 1,
        // bonus_* (must survive)
        bonus_rec_te: 1,
        // kr_/pr_ (must survive)
        kr_yd: 20, pr_yd: 10,
      },
    },
  };
  prunePlayerStats(totals);
  const stats = totals.p1.stats;
  assert.deepStrictEqual(Object.keys(stats).filter(k => k.startsWith('idp_') || k.startsWith('punt')), []);
  for (const k of ['off_snp', 'tm_off_snp', 'rec_rz_tgt', 'rush_rz_att', 'pass_rz_att',
                   'pass_cmp', 'rec_air_yd', 'pass_sack', 'pass_air_yd', 'rush_yac',
                   'rush_btkl', 'rec_drop', 'fga', 'fgm', 'xpa', 'xpm', 'bonus_rec_te',
                   'kr_yd', 'pr_yd']) {
    assert.ok(k in stats, `${k} should survive the prune`);
  }
});

test('F24-2 — TEAM_* rows are preserved entire, including a punts key', () => {
  const totals = {
    TEAM_KC: { stats: { punts: 4, idp_tkl: 5, gp: 17 }, team: 'KC', gamesPlayed: 17 },
    '123':   { stats: { punts: 4, idp_tkl: 5 } },
  };
  prunePlayerStats(totals);
  assert.deepStrictEqual(totals.TEAM_KC.stats, { punts: 4, idp_tkl: 5, gp: 17 });
  assert.deepStrictEqual(totals['123'].stats, {});
});

test('F24-3 — shape: prune never adds/removes top-level rows, never touches non-stats fields', () => {
  const totals = {
    p1: { stats: { idp_tkl: 5, gp: 1 }, team: 'KC', gamesPlayed: 1, dnpWeeks: 0 },
  };
  prunePlayerStats(totals);
  assert.deepStrictEqual(Object.keys(totals), ['p1']);
  assert.equal(totals.p1.team, 'KC');
  assert.equal(totals.p1.gamesPlayed, 1);
});

test('F24-4 — aggregateWeeks applies the prune at the end (idp_/punt gone from a player row)', () => {
  const weekData = [
    { week: 1, entries: [{ player_id: 'p1', team: 'KC', stats: { gp: 1, pts_half_ppr: 5, idp_tkl: 3, punts: 2 } }] },
  ];
  const totals = aggregateWeeks(weekData);
  assert.deepStrictEqual(totals.p1.stats, { gp: 1, pts_half_ppr: 5 });
});

// D-1 fixtures: three teams, three REG weeks — each team has exactly one bye
// (A: bye wk3, B: bye wk2, C: bye wk1).
const D1_SCHEDULE = [
  { week: 1, gameType: 'REG', homeTeam: 'B', awayTeam: 'A' },
  { week: 2, gameType: 'REG', homeTeam: 'C', awayTeam: 'A' },
  { week: 3, gameType: 'REG', homeTeam: 'C', awayTeam: 'B' },
];

test('D1-1 — computeTeamByeWeeks: each team gets exactly its one derived bye week', () => {
  const byes = computeTeamByeWeeks(D1_SCHEDULE);
  assert.deepStrictEqual([...byes.get('A')], [3]);
  assert.deepStrictEqual([...byes.get('B')], [2]);
  assert.deepStrictEqual([...byes.get('C')], [1]);
});

test('D1-2 — computeTeamByeWeeks: null/undefined/empty schedule → empty map, no throw', () => {
  assert.deepStrictEqual(computeTeamByeWeeks(null), new Map());
  assert.deepStrictEqual(computeTeamByeWeeks(undefined), new Map());
  assert.deepStrictEqual(computeTeamByeWeeks([]), new Map());
});

test('D1-3 — single-team row: bye week flips X → B, byeWeeks increments', () => {
  const weekData = [
    { week: 1, entries: [{ player_id: 'p1', team: 'A', stats: { gp: 1, pts_half_ppr: 5 } }] },
    { week: 2, entries: [{ player_id: 'p1', team: 'A', stats: { gp: 1, pts_half_ppr: 5 } }] },
    // week 3 (A's bye): no entry at all for p1 — starts 'X'
  ];
  const totals = aggregateWeeks(weekData, D1_SCHEDULE);
  assert.deepStrictEqual(totals.p1.weeklyStatus.slice(0, 3), ['P', 'P', 'B']);
  assert.equal(totals.p1.byeWeeks, 1);
});

test('D1-4 — multi-team row: bye NOT written, stays X, byeWeeks 0', () => {
  const weekData = [
    { week: 1, entries: [{ player_id: 'p1', team: 'A', stats: { gp: 1, pts_half_ppr: 5 } }] },
    { week: 2, entries: [{ player_id: 'p1', team: 'B', stats: { gp: 1, pts_half_ppr: 5 } }] },
    // week 3 is A's bye — but p1 is a multi-team row (A + B), so no flip
  ];
  const totals = aggregateWeeks(weekData, D1_SCHEDULE);
  assert.equal(totals.p1.weeklyStatus[2], 'X');
  assert.equal(totals.p1.byeWeeks, 0);
});

test('D1-5 — never-played row (all gp=0): no team resolved via playedCounts → no flip at the bye week', () => {
  const weekData = [
    // a teammate with gp:1 makes team A "playing" week 1, so p1's gp:0 entry classifies as
    // DNP by the base (pre-D-1) logic rather than an incidental bye — isolating the thing
    // this test actually checks: week 3 (A's real bye) is never touched for a zero-played row.
    { week: 1, entries: [
      { player_id: 'p1', team: 'A', stats: { gp: 0 } },
      { player_id: 'mate', team: 'A', stats: { gp: 1, pts_half_ppr: 5 } },
    ] },
  ];
  const totals = aggregateWeeks(weekData, D1_SCHEDULE);
  // p1 has zero played weeks; playedCounts.size === 0, so D-1 never applies regardless of
  // week 1's own D/B classification (irrelevant here — this asserts no *bye-week* flip at wk3).
  assert.equal(totals.p1.weeklyStatus[2], 'X');
  assert.equal(totals.p1.byeWeeks, 0);
});

test("D1-6 — 'D' collision: a slot already 'D' at the team's bye is left alone, dnpWeeks unchanged", () => {
  const weekData = [
    { week: 1, entries: [{ player_id: 'p1', team: 'A', stats: { gp: 1, pts_half_ppr: 5 } }] },
    { week: 2, entries: [{ player_id: 'p1', team: 'A', stats: { gp: 1, pts_half_ppr: 5 } }] },
    // week 3 is A's bye, but p1 shows up DNP'd under team C (which IS playing wk3)
    { week: 3, entries: [
      { player_id: 'p1', team: 'C', stats: { gp: 0 } },
      { player_id: 'other', team: 'C', stats: { gp: 1, pts_half_ppr: 3 } },
    ] },
  ];
  const totals = aggregateWeeks(weekData, D1_SCHEDULE);
  assert.equal(totals.p1.team, 'A'); // single-team resolution unaffected by the wk3 C cameo
  assert.equal(totals.p1.weeklyStatus[2], 'D');
  assert.equal(totals.p1.byeWeeks, 0);
  assert.equal(totals.p1.dnpWeeks, 1);
});

test('D1-7 — LAR normalizes to LA before the schedule join and gets its bye', () => {
  const schedule = [
    { week: 1, gameType: 'REG', homeTeam: 'LA', awayTeam: 'SF' },
    { week: 2, gameType: 'REG', homeTeam: 'SF', awayTeam: 'KC' }, // LA's bye at week 2
    { week: 3, gameType: 'REG', homeTeam: 'LA', awayTeam: 'KC' },
  ];
  const weekData = [
    { week: 1, entries: [{ player_id: 'p1', team: 'LAR', stats: { gp: 1, pts_half_ppr: 5 } }] },
    { week: 3, entries: [{ player_id: 'p1', team: 'LAR', stats: { gp: 1, pts_half_ppr: 5 } }] },
  ];
  const totals = aggregateWeeks(weekData, schedule);
  assert.equal(totals.p1.team, 'LA');
  assert.deepStrictEqual(totals.p1.weeklyStatus.slice(0, 3), ['P', 'B', 'P']);
});

test('D1-8 — 17-week season: index 17 (week 18) is never written, even with a real bye', () => {
  // Schedule spans only weeks 1-17 (no week-18 games at all — a 2012-2020-shaped season).
  const schedule17 = [
    { week: 1, gameType: 'REG', homeTeam: 'B', awayTeam: 'A' },
    ...Array.from({ length: 16 }, (_, i) => ({
      week: i + 2, gameType: 'REG', homeTeam: 'A', awayTeam: 'B',
    })),
  ];
  const byes = computeTeamByeWeeks(schedule17);
  for (const [, weeks] of byes) assert.ok(![...weeks].includes(18));

  const weekData = [
    { week: 1, entries: [{ player_id: 'p1', team: 'A', stats: { gp: 0 } }, { player_id: 'x', team: 'B', stats: { gp: 1, pts_half_ppr: 1 } }] },
    ...Array.from({ length: 16 }, (_, i) => ({
      week: i + 2, entries: [{ player_id: 'p1', team: 'A', stats: { gp: 1, pts_half_ppr: 5 } }],
    })),
  ];
  const totals = aggregateWeeks(weekData, schedule17);
  assert.equal(totals.p1.weeklyStatus[17], 'X'); // index 17 = week 18, never touched
});

test('D1-9 — no schedule passed → aggregateWeeks behaves exactly as before (no byes, no throw)', () => {
  const weekData = [
    { week: 1, entries: [{ player_id: 'p1', team: 'A', stats: { gp: 1, pts_half_ppr: 5 } }] },
  ];
  const withSchedule = aggregateWeeks(weekData, D1_SCHEDULE);
  const withoutSchedule = aggregateWeeks(weekData);
  assert.equal(withoutSchedule.p1.weeklyStatus[2], 'X');
  assert.notEqual(withSchedule.p1.weeklyStatus[2], withoutSchedule.p1.weeklyStatus[2]);
});

test('D1/F24-capstone — a fully migrated fixture (prune + forward byes) still passes validateNflSeason', async () => {
  const { validateNflSeason } = await import('../lib/validate.mjs');

  // validateNflSeason enforces the real schedule-abbreviation domain (SCHEDULE_TEAMS in
  // lib/validate.mjs), so — unlike D1_SCHEDULE's placeholder 'A'/'B'/'C' teams used
  // elsewhere in this file — this fixture needs real domain codes.
  const schedule = [
    { week: 1, gameType: 'REG', homeTeam: 'DEN', awayTeam: 'KC' },
    { week: 2, gameType: 'REG', homeTeam: 'LAC', awayTeam: 'KC' },
    { week: 3, gameType: 'REG', homeTeam: 'LAC', awayTeam: 'DEN' },
  ]; // KC's bye is week 3

  // validateNflSeason's own population floor (≥400 rows, ≥30 with gamesPlayed≥14) is
  // orthogonal to what this test checks, so pad with 16 weeks of full-season players
  // (the schedule above only defines weeks 1-3, so the pad players' extra weeks 4-16
  // don't interact with bye inference at all) alongside the one row actually under test.
  const weekData = [];
  for (let week = 1; week <= 16; week++) {
    const entries = Array.from({ length: 400 }, (_, i) => (
      { player_id: `pad${i}`, team: 'SEA', stats: { gp: 1, pts_half_ppr: 8 } }
    ));
    // p1 plays weeks 1-2 only; week 3 (KC's bye per the schedule) has no entry for p1 at all.
    if (week <= 2) entries.push({ player_id: 'p1', team: 'KC', stats: { gp: 1, pts_half_ppr: 5, idp_tkl: 2, punts: 1 } });
    weekData.push({ week, entries });
  }

  const totals = aggregateWeeks(weekData, schedule);
  assert.deepStrictEqual(totals.p1.stats, { gp: 2, pts_half_ppr: 10 }); // idp_/punt pruned
  assert.equal(totals.p1.weeklyStatus[2], 'B');
  assert.equal(totals.p1.byeWeeks, 1);
  assert.doesNotThrow(() => validateNflSeason(totals, { year: 9999 }));
});
