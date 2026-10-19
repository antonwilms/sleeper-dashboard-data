/**
 * test/absence.test.mjs — classifyAbsences (A-1 … A-7). Pure, no I/O.
 * Run with: node --test  (or npm test)
 */

import { test } from 'node:test';
import assert   from 'node:assert/strict';

import { classifyAbsences, MISSED_ROSTER_STATUSES, MIN_ABSENCE_CLASSIFY_SEASON } from '../lib/absence.mjs';
import { computeAvailability } from '../lib/sleeper.mjs';

/** KC played weeks 1-4 except week 3 (bye); NYJ played weeks 1-4. 0-based index = week - 1. */
function makeTotals(playerStatus = ['P', 'X', 'X', 'X']) {
  return {
    TEAM_KC:  { team: 'KC',  weeklyStatus: ['P', 'P', 'B', 'P'] },
    TEAM_NYJ: { team: 'NYJ', weeklyStatus: ['P', 'P', 'P', 'P'] },
    100: {
      team: 'KC', position: 'WR', gamesPlayed: 1, byeWeeks: [3], stats: { rec: 5 }, weeklyPoints: [10, null, null, null],
      weeklyStatus: playerStatus, dnpWeeks: 0, availability: computeAvailability(playerStatus),
    },
    200: { team: 'KC', position: 'QB', weeklyStatus: ['P', 'P', 'B', 'P'], dnpWeeks: 0, availability: computeAvailability(['P', 'P', 'B', 'P']) },
  };
}

// ─── A-1 basics ──────────────────────────────────────────────────────────────

test('A-1 classifyAbsences: INA on a team-played X converts; DEV, bye, no-entry stay X; B/P/D/TEAM_ untouched', () => {
  const totals = makeTotals(['P', 'X', 'X', 'X']);
  totals[100].weeklyStatus = ['X', 'X', 'X', 'X'];
  const roster = { 100: { 1: [['KC', 'INA']], 2: [['KC', 'DEV']], 3: [['KC', 'ACT']] } }; // week 4 has no entry
  const { totals: out, changedSlots, changedRows } = classifyAbsences(totals, roster, { season: 2020 });
  assert.deepEqual(out[100].weeklyStatus, ['D', 'X', 'X', 'X']);
  assert.equal(changedSlots, 1);
  assert.equal(changedRows, 1);
  assert.deepEqual(out.TEAM_KC, totals.TEAM_KC);
});

test("A-1 classifyAbsences: 'B', 'P' and 'D' slots are never touched even with an ACT entry", () => {
  const totals = makeTotals();
  totals[100].weeklyStatus = ['P', 'D', 'B', 'X'];
  const roster = { 100: { 1: [['KC', 'ACT']], 2: [['KC', 'ACT']], 3: [['KC', 'ACT']] } };
  const { totals: out, changedSlots } = classifyAbsences(totals, roster, { season: 2020 });
  assert.deepEqual(out[100].weeklyStatus, ['P', 'D', 'B', 'X']);
  assert.equal(changedSlots, 0);
});

// ─── A-2 traded week ─────────────────────────────────────────────────────────

test('A-2 classifyAbsences: traded week [NYJ TRD, KC ACT] converts via the team that played; byStatus.ACT === 1', () => {
  const totals = makeTotals(['P', 'P', 'B', 'X']);
  totals.TEAM_NYJ.weeklyStatus = ['P', 'P', 'P', 'B']; // NYJ did not play week 4
  const roster = { 100: { 4: [['NYJ', 'TRD'], ['KC', 'ACT']] } };
  const { totals: out, byStatus } = classifyAbsences(totals, roster, { season: 2020 });
  assert.deepEqual(out[100].weeklyStatus, ['P', 'P', 'B', 'D']);
  assert.deepEqual(byStatus, { ACT: 1 });
});

// ─── A-3 bookkeeping ─────────────────────────────────────────────────────────

test('A-3 classifyAbsences: dnpWeeks/availability recomputed, other fields deep-equal, input unmutated, unchanged row same reference', () => {
  const totals = makeTotals(['P', 'X', 'X', 'X']);
  const before = structuredClone(totals);
  const roster = { 100: { 2: [['KC', 'RES']], 4: [['KC', 'INA']] } };
  const { totals: out, changedSlots, changedRows, byStatus } = classifyAbsences(totals, roster, { season: 2020 });

  assert.deepEqual(out[100].weeklyStatus, ['P', 'D', 'X', 'D']);
  assert.equal(out[100].dnpWeeks, 2, 'dnpWeeks rises by exactly the converted count');
  assert.deepEqual(out[100].availability, computeAvailability(['P', 'D', 'X', 'D']));
  for (const k of ['gamesPlayed', 'byeWeeks', 'stats', 'team', 'weeklyPoints']) {
    assert.deepEqual(out[100][k], before[100][k], k);
  }
  assert.deepEqual(totals, before, 'input not mutated');
  assert.notEqual(out[100], totals[100]);
  assert.equal(out[200], totals[200], 'unchanged row is the same reference');
  assert.equal(out.TEAM_KC, totals.TEAM_KC);
  assert.equal(changedSlots, 2);
  assert.equal(changedRows, 1);
  assert.deepEqual(byStatus, { RES: 1, INA: 1 });
});

// ─── A-4 partial week ────────────────────────────────────────────────────────

test("A-4 classifyAbsences: a team with no 'P' yet for the week (partial week) leaves the slot X", () => {
  const totals = {
    TEAM_KC: { team: 'KC', weeklyStatus: ['P', 'P', 'P', 'X'] }, // week 4 not yet played
    100: { team: 'KC', weeklyStatus: ['P', 'P', 'P', 'X'], dnpWeeks: 0 },
  };
  const { totals: out, changedSlots } = classifyAbsences(totals, { 100: { 4: [['KC', 'ACT']] } }, { season: 2020 });
  assert.deepEqual(out[100].weeklyStatus, ['P', 'P', 'P', 'X']);
  assert.equal(changedSlots, 0);
});

// ─── A-5 missing roster ──────────────────────────────────────────────────────

test('A-5 classifyAbsences: a null rosterWeekly throws', () => {
  assert.throws(() => classifyAbsences(makeTotals(), null, { season: 2020 }), /rosterWeekly is required/);
  assert.throws(() => classifyAbsences(makeTotals(), undefined, { season: 2020 }), /rosterWeekly is required/);
  assert.throws(() => classifyAbsences(makeTotals(), {}, { season: '2020' }), /season must be an integer/);
});

// ─── A-6 status set ──────────────────────────────────────────────────────────

test('A-6 MISSED_ROSTER_STATUSES is exactly {ACT, INA, RES, PUP}', () => {
  assert.deepEqual([...MISSED_ROSTER_STATUSES].sort(), ['ACT', 'INA', 'PUP', 'RES']);
});

// ─── A-7 floor ───────────────────────────────────────────────────────────────

test('A-7 classifyAbsences: below MIN_ABSENCE_CLASSIFY_SEASON the input comes back unchanged (null roster allowed); at 2016 it converts', () => {
  assert.equal(MIN_ABSENCE_CLASSIFY_SEASON, 2016);
  const totals = makeTotals(['P', 'X', 'X', 'X']);
  const roster = { 100: { 2: [['KC', 'INA']] } };

  const below = classifyAbsences(totals, roster, { season: 2015 });
  assert.equal(below.totals, totals, 'same reference');
  assert.equal(below.changedSlots, 0);
  assert.deepEqual(below.totals[100].weeklyStatus, ['P', 'X', 'X', 'X']);
  assert.doesNotThrow(() => classifyAbsences(totals, null, { season: 2015 }));

  const at = classifyAbsences(totals, roster, { season: 2016 });
  assert.deepEqual(at.totals[100].weeklyStatus, ['P', 'D', 'X', 'X']);
});

// ─── D-76: role weeks demote 'D' → 'X' ───────────────────────────────────────

/** Player 100 with the given statuses; dnpWeeks matches the 'D' count (the validator's invariant). */
function withStatus(statuses) {
  const totals = makeTotals(statuses);
  totals[100].dnpWeeks = statuses.filter(s => s === 'D').length;
  return totals;
}

test("A-8 classifyAbsences: DEV on a team that played turns a Sleeper 'D' into 'X'", () => {
  const totals = withStatus(['P', 'D', 'B', 'P']);
  const r = classifyAbsences(totals, { 100: { 2: [['KC', 'DEV']] } }, { season: 2022 });
  assert.deepEqual(r.totals[100].weeklyStatus, ['P', 'X', 'B', 'P']);
  assert.equal(r.totals[100].dnpWeeks, 0);
  assert.deepEqual(r.totals[100].availability, computeAvailability(['P', 'X', 'B', 'P']));
  assert.equal(r.demotedSlots, 1);
  assert.equal(r.promotedSlots, 0);
  assert.equal(r.changedSlots, 1);
  assert.deepEqual(r.demotedByStatus, { DEV: 1 });
  assert.deepEqual(r.byStatus, {});
  assert.equal(totals[100].dnpWeeks, 1, 'input not mutated');
});

test('A-9 classifyAbsences: CUT/EXE/TRC/TRD/E14/E01 demote; ACT/INA/RES/PUP keep the D', () => {
  for (const status of ['CUT', 'EXE', 'TRC', 'TRD', 'E14', 'E01']) {
    const r = classifyAbsences(withStatus(['P', 'D', 'P', 'P']), { 100: { 2: [['KC', status]] } }, { season: 2022 });
    assert.deepEqual(r.totals[100].weeklyStatus, ['P', 'X', 'P', 'P'], status);
    assert.deepEqual(r.demotedByStatus, { [status]: 1 }, status);
  }
  for (const status of ['ACT', 'INA', 'RES', 'PUP']) {
    const r = classifyAbsences(withStatus(['P', 'D', 'P', 'P']), { 100: { 2: [['KC', status]] } }, { season: 2022 });
    assert.deepEqual(r.totals[100].weeklyStatus, ['P', 'D', 'P', 'P'], status);
    assert.equal(r.changedSlots, 0, status);
  }
});

test("A-10 classifyAbsences: a traded week keeps 'D' if any team that played lists a missed status; all-role pairs demote", () => {
  const keep = classifyAbsences(withStatus(['P', 'D', 'P', 'P']),
    { 100: { 2: [['NYJ', 'DEV'], ['KC', 'INA']] } }, { season: 2022 });
  assert.deepEqual(keep.totals[100].weeklyStatus, ['P', 'D', 'P', 'P']);
  assert.equal(keep.demotedSlots, 0);

  const drop = classifyAbsences(withStatus(['P', 'D', 'P', 'P']),
    { 100: { 2: [['NYJ', 'CUT'], ['KC', 'DEV']] } }, { season: 2022 });
  assert.deepEqual(drop.totals[100].weeklyStatus, ['P', 'X', 'P', 'P']);
  assert.deepEqual(drop.demotedByStatus, { 'CUT+DEV': 1 });
});

test("A-11 classifyAbsences: a 'D' week with no roster listing stays 'D'; a player absent from the roster keeps every 'D'", () => {
  const listed = classifyAbsences(withStatus(['P', 'D', 'P', 'D']), { 100: { 4: [['KC', 'DEV']] } }, { season: 2022 });
  assert.deepEqual(listed.totals[100].weeklyStatus, ['P', 'D', 'P', 'X']);
  assert.equal(listed.totals[100].dnpWeeks, 1);

  const absent = classifyAbsences(withStatus(['P', 'D', 'P', 'D']), {}, { season: 2022 });
  assert.deepEqual(absent.totals[100].weeklyStatus, ['P', 'D', 'P', 'D']);
  assert.equal(absent.changedSlots, 0);
});

test('A-12 classifyAbsences: a row with one promotion and one demotion nets dnpWeeks 0 and recomputes segments', () => {
  const totals = withStatus(['X', 'D', 'P', 'P']);   // dnpWeeks 1
  const roster = { 100: { 1: [['KC', 'INA']], 2: [['KC', 'DEV']] } };
  const r = classifyAbsences(totals, roster, { season: 2022 });
  assert.deepEqual(r.totals[100].weeklyStatus, ['D', 'X', 'P', 'P']);
  assert.equal(r.promotedSlots, 1);
  assert.equal(r.demotedSlots, 1);
  assert.equal(r.changedSlots, 2);
  assert.equal(r.changedRows, 1);
  assert.equal(r.totals[100].dnpWeeks, 1);
  assert.deepEqual(r.totals[100].availability, computeAvailability(['D', 'X', 'P', 'P']));
});

test('A-13 classifyAbsences: season 2015 with DEV listings returns the input by reference, nothing demoted', () => {
  const totals = withStatus(['P', 'D', 'P', 'P']);
  const r = classifyAbsences(totals, { 100: { 2: [['KC', 'DEV']] } }, { season: 2015 });
  assert.equal(r.totals, totals);
  assert.equal(r.demotedSlots, 0);
  assert.equal(r.promotedSlots, 0);
  assert.deepEqual(r.demotedByStatus, {});
});

test("A-14 classifyAbsences: a demoted slot inside a 'D' run splits the absence segment", () => {
  const ws = ['P', 'D', 'D', 'D', 'P'];
  const totals = {
    TEAM_KC: { team: 'KC', weeklyStatus: ['P', 'P', 'P', 'P', 'P'] },
    100: { team: 'KC', weeklyStatus: ws, dnpWeeks: 3, availability: computeAvailability(ws) },
  };
  const roster = { 100: { 2: [['KC', 'INA']], 3: [['KC', 'DEV']], 4: [['KC', 'INA']] } };
  const r = classifyAbsences(totals, roster, { season: 2022 });
  assert.deepEqual(r.totals[100].weeklyStatus, ['P', 'D', 'X', 'D', 'P']);
  assert.deepEqual(r.totals[100].availability.absenceSegments, [
    { start: 2, end: 2, length: 1 }, { start: 4, end: 4, length: 1 }]);
  assert.equal(r.totals[100].availability.longestAbsence, 1);
});
