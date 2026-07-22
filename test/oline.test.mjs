/**
 * test/oline.test.mjs — Unit tests for OL composition capture from nflverse depth charts
 * (isoWeekKey / aggregateOlineStates in lib/nflverse.mjs) and validateOline (lib/validate.mjs).
 *
 * Run with: node --test  (or npm test)
 */

import { test } from 'node:test';
import assert   from 'node:assert/strict';
import fs       from 'node:fs';
import path     from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  isoWeekKey, aggregateOlineStates, OLINE_SLOTS, MIN_OLINE_ROWS,
} from '../lib/nflverse.mjs';
import { validateOline } from '../lib/validate.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

// ─── fixture CSV ────────────────────────────────────────────────────────────
// 2 teams (SF, KC) × 2 ISO-weeks for SF (1 for KC) × ranks 1-2. Season 2025.
// Row 1 and 2 share (team, ISO-week) — Row 2's dt is later, so weekly reduction
// must keep only Row 2 (and any other row sharing that same max dt).

const HEADER = 'dt,team,player_name,espn_id,gsis_id,pos_abb,pos_rank';

const FIXTURE_ROWS = [
  '2025-08-01 10:00:00,SF,Trent Williams,3116365,00-0027857,LT,1',   // week A, older dt — dropped
  '2025-08-03 09:00:00,SF,Trent Williams,3116365,00-0027857,LT,1',   // week A, max dt — kept
  '2025-08-03 09:00:00,SF,Robert Jones,4051305,00-0036596,LG,1',     // week A, max dt — kept
  '2025-08-03 09:00:00,SF,"Smith, Jr.",9999991,WIL597533,LT,2',      // quoted name + placeholder id — kept
  '2025-08-03 09:00:00,SF,Deebo Samuel,4035004,00-0035700,WR,1',     // non-OL slot — dropped
  '2025-08-08 12:00:00,SF,Jake Brendel,2578355,00-0032701,C,1',      // week B — kept
  '2025-08-02 08:00:00,KC,Jawaan Taylor,4360797,00-0036912,RT,1',    // KC week A — kept
];

const FIXTURE_CSV = [HEADER, ...FIXTURE_ROWS].join('\n');

function fixtureResult() {
  return aggregateOlineStates(FIXTURE_CSV, { season: 2025 });
}

// ─── Aggregation shape ───────────────────────────────────────────────────────

test('aggregateOlineStates: shape — teams/states/ol per schema; WR row dropped; slot-then-rank order', () => {
  const { teams, rowCount, teamCount, stateCount } = fixtureResult();

  assert.deepEqual(Object.keys(teams).sort(), ['KC', 'SF']);
  assert.equal(teamCount, 2);
  assert.equal(stateCount, 3); // SF week A, SF week B, KC week A
  assert.equal(rowCount, 5);   // 3 (SF week A) + 1 (SF week B) + 1 (KC week A) — WR row excluded

  assert.equal(teams.SF.states.length, 2);
  const weekA = teams.SF.states[0];
  assert.equal(weekA.ol.length, 3);
  // slot order LT,LG,C,RG,RT then rank ascending: LT r1, LT r2, LG r1
  assert.deepEqual(
    weekA.ol.map(e => `${e.slot}${e.rank}`),
    ['LT1', 'LT2', 'LG1']
  );
  assert.ok(!weekA.ol.some(e => e.slot === 'WR'), 'WR row must be dropped');
});

// ─── Weekly reduction ────────────────────────────────────────────────────────

test('aggregateOlineStates: weekly reduction keeps only the bucket max-dt rows', () => {
  const { teams } = fixtureResult();
  const weekA = teams.SF.states[0];

  assert.equal(weekA.date, '2025-08-03');
  assert.equal(weekA.dt, '2025-08-03T09:00:00Z');

  const lt1 = weekA.ol.find(e => e.slot === 'LT' && e.rank === 1);
  assert.ok(lt1, 'LT rank1 (max-dt row) must be present');
  // Only one LT-rank1 row for SF week A — the earlier (2025-08-01) duplicate was dropped.
  assert.equal(weekA.ol.filter(e => e.slot === 'LT' && e.rank === 1).length, 1);
});

// ─── isoWeekKey ──────────────────────────────────────────────────────────────

test('isoWeekKey: 2026-01-01 (Thursday) is week 01', () => {
  assert.equal(isoWeekKey('2026-01-01'), '2026-W01');
});

test('isoWeekKey: 2026-12-31 (Thursday, 53-week year) is week 53', () => {
  assert.equal(isoWeekKey('2026-12-31'), '2026-W53');
});

test('isoWeekKey: mid-year timestamp matches the §1 schema example (2026-07-18 → 2026-W29)', () => {
  assert.equal(isoWeekKey('2026-07-18T08:46:51Z'), '2026-W29');
});

// ─── Quoted names ────────────────────────────────────────────────────────────

test('aggregateOlineStates: quoted name with embedded comma parsed intact', () => {
  const { teams } = fixtureResult();
  const weekA = teams.SF.states[0];
  const entry = weekA.ol.find(e => e.slot === 'LT' && e.rank === 2);
  assert.equal(entry.name, 'Smith, Jr.');
});

// ─── Placeholder ids ─────────────────────────────────────────────────────────

test('aggregateOlineStates: placeholder gsisId kept verbatim; validateOline passes', () => {
  const { teams } = fixtureResult();
  const weekA = teams.SF.states[0];
  const entry = weekA.ol.find(e => e.slot === 'LT' && e.rank === 2);
  assert.equal(entry.gsisId, 'WIL597533');

  assert.doesNotThrow(() => validateOline(teams, { year: 2025 }));
});

// ─── Wrong-asset guard ───────────────────────────────────────────────────────

test('aggregateOlineStates: throws when a dt year is outside {season, season+1}', () => {
  const csv = [HEADER, '2028-01-01 00:00:00,SF,Trent Williams,3116365,00-0027857,LT,1'].join('\n');
  assert.throws(() => aggregateOlineStates(csv, { season: 2025 }), /dt year/);
});

// ─── Header drift ────────────────────────────────────────────────────────────

test('aggregateOlineStates: throws on legacy pre-2025 schema header (missing dt/pos_abb/team/pos_rank)', () => {
  const legacyCsv = [
    'season,club_code,week,player_name,gsis_id,depth_position',
    '2024,SF,1,Trent Williams,00-0027857,LT1',
  ].join('\n');
  assert.throws(() => aggregateOlineStates(legacyCsv, { season: 2024 }), /required columns missing/);
});

// ─── Validator ───────────────────────────────────────────────────────────────

function makeState(ol) {
  return { states: [{ week: '2025-W31', date: '2025-08-03', dt: '2025-08-03T09:00:00Z', ol }] };
}

test('validateOline: throws on duplicate (slot,rank) within one state', () => {
  const teams = {
    SF: makeState([
      { slot: 'LT', rank: 1, name: 'A', gsisId: null, espnId: null },
      { slot: 'LT', rank: 1, name: 'B', gsisId: null, espnId: null },
    ]),
  };
  assert.throws(() => validateOline(teams, { year: 2025 }), /duplicate/);
});

test('validateOline: throws on invalid slot', () => {
  const teams = {
    SF: makeState([{ slot: 'QB', rank: 1, name: 'A', gsisId: null, espnId: null }]),
  };
  assert.throws(() => validateOline(teams, { year: 2025 }), /invalid slot/);
});

test('validateOline: throws on empty ol[]', () => {
  const teams = { SF: makeState([]) };
  assert.throws(() => validateOline(teams, { year: 2025 }), /empty ol/);
});

test('validateOline: throws on team key outside the 32-team domain', () => {
  const teams = { XX: makeState([{ slot: 'LT', rank: 1, name: 'A', gsisId: null, espnId: null }]) };
  assert.throws(() => validateOline(teams, { year: 2025 }), /schedule domain/);
});

// ─── Sparsity ────────────────────────────────────────────────────────────────

test('aggregateOlineStates: a thin fixture yields rowCount below MIN_OLINE_ROWS (gate would fire)', () => {
  const { rowCount } = fixtureResult();
  assert.ok(rowCount < MIN_OLINE_ROWS, `fixture rowCount=${rowCount} should be < MIN_OLINE_ROWS=${MIN_OLINE_ROWS}`);
});

// ─── Capture-only tripwire ────────────────────────────────────────────────────

test('capture-only tripwire: no scoring/grading/backtest/panel module references oline', () => {
  const modules = [
    'lib/grade.mjs',
    'scripts/grade-snapshot.mjs',
    'lib/backtest.mjs',
    'scripts/backtest-run.mjs',
    'lib/panel.mjs',
    'scripts/panel-run.mjs',
    'lib/fantasyPoints.mjs',
  ];
  for (const rel of modules) {
    const text = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    assert.ok(!/nflverse\/oline/.test(text), `${rel} references nflverse/oline`);
    assert.ok(!/aggregateOlineStates/.test(text), `${rel} references aggregateOlineStates`);
    assert.ok(!/OLINE_SLOTS/.test(text), `${rel} references OLINE_SLOTS`);
  }
});

// ─── OLINE_SLOTS sanity ───────────────────────────────────────────────────────

test('OLINE_SLOTS is the five offensive-line slots in canonical order', () => {
  assert.deepEqual(OLINE_SLOTS, ['LT', 'LG', 'C', 'RG', 'RT']);
});
