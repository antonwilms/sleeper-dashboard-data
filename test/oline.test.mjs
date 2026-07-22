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

// ─── bulk teams helper (for validateOline tests that must clear MIN_OLINE_ROWS) ─────
// validateOline's sparsity floor operates on the post-drop row count, so any test that
// wants to observe drop-and-warn behavior (rather than the floor firing) needs enough
// surviving valid rows. Each generated state holds one valid entry per OLINE_SLOTS slot
// (rank 1, unique per state) — states never collide on (slot, rank) internally.

const TEAMS_32 = [
  'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND',
  'JAX', 'KC', 'LA', 'LAC', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG', 'NYJ', 'PHI', 'PIT', 'SEA', 'SF',
  'TB', 'TEN', 'WAS',
];

function makeBulkTeams(totalRows) {
  const teams = {};
  let remaining = totalRows;
  let day = 0;
  while (remaining > 0) {
    const team = TEAMS_32[day % TEAMS_32.length];
    const rowsThisState = Math.min(OLINE_SLOTS.length, remaining);
    const dt = `2025-08-${String(1 + (day % 27)).padStart(2, '0')}T09:00:00Z`;
    const ol = OLINE_SLOTS.slice(0, rowsThisState).map(slot => ({
      slot, rank: 1, name: `Player ${team}-${day}-${slot}`, gsisId: null, espnId: null,
    }));
    (teams[team] ??= { states: [] }).states.push({
      week: `2025-W${String(1 + (day % 52)).padStart(2, '0')}`,
      date: dt.slice(0, 10),
      dt,
      ol,
    });
    remaining -= rowsThisState;
    day++;
  }
  return teams;
}

function withWarnSpy(fn) {
  const calls = [];
  const original = console.warn;
  console.warn = (...args) => calls.push(args.join(' '));
  try {
    fn(calls);
  } finally {
    console.warn = original;
  }
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

  // Pad with bulk valid rows so the MIN_OLINE_ROWS floor doesn't fire — this test targets
  // the placeholder-id acceptance, not the sparsity gate.
  const padded = makeBulkTeams(MIN_OLINE_ROWS);
  padded.SF.states.push(...teams.SF.states);
  assert.doesNotThrow(() => validateOline(padded, { year: 2025 }));
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

test('validateOline: drops the second of a duplicate (slot,rank) pair within one state — capture proceeds', () => {
  const teams = makeBulkTeams(MIN_OLINE_ROWS);
  const state = teams.SF.states[0];
  const originalLen = state.ol.length;
  // state.ol[0] is LT rank1 — push a colliding duplicate.
  state.ol.push({ slot: state.ol[0].slot, rank: state.ol[0].rank, name: 'Duplicate', gsisId: null, espnId: null });

  withWarnSpy((calls) => {
    assert.doesNotThrow(() => validateOline(teams, { year: 2025 }));
    assert.ok(calls.some(c => /duplicate/.test(c)), 'expected a duplicate-slot-rank warning');
  });
  assert.equal(state.ol.length, originalLen, 'duplicate entry must be dropped, not the original');
  assert.ok(!state.ol.some(e => e.name === 'Duplicate'));
});

test('validateOline: drops an entry with an invalid slot — capture proceeds', () => {
  const teams = makeBulkTeams(MIN_OLINE_ROWS);
  const state = teams.SF.states[0];
  const originalLen = state.ol.length;
  state.ol.push({ slot: 'QB', rank: 1, name: 'Bad Slot', gsisId: null, espnId: null });

  withWarnSpy((calls) => {
    assert.doesNotThrow(() => validateOline(teams, { year: 2025 }));
    assert.ok(calls.some(c => /invalid slot/.test(c)), 'expected an invalid-slot warning');
  });
  assert.equal(state.ol.length, originalLen);
  assert.ok(!state.ol.some(e => e.name === 'Bad Slot'));
});

test('validateOline: a state with empty ol[] contributes zero rows and does not itself throw', () => {
  const teams = makeBulkTeams(MIN_OLINE_ROWS);
  teams.SF.states.push({ week: '2025-W99', date: '2025-12-01', dt: '2025-12-01T00:00:00Z', ol: [] });
  assert.doesNotThrow(() => validateOline(teams, { year: 2025 }));
});

test('validateOline: throws on team key outside the 32-team domain', () => {
  const teams = { XX: makeState([{ slot: 'LT', rank: 1, name: 'A', gsisId: null, espnId: null }]) };
  assert.throws(() => validateOline(teams, { year: 2025 }), /schedule domain/);
});

// ─── Per-record drop-and-warn (empty/missing name) ───────────────────────────

test('validateOline: a record with an empty player name is dropped with a warning; capture succeeds', () => {
  const teams = makeBulkTeams(MIN_OLINE_ROWS + 5);
  const state = teams.SF.states[0];
  const originalTotal = Object.values(teams).reduce(
    (s, t) => s + t.states.reduce((s2, st) => s2 + st.ol.length, 0), 0
  );
  // Mirrors the observed live defect: an ESPN row with an espnId but empty player_name/gsisId.
  state.ol.push({ slot: 'RT', rank: 2, name: '', gsisId: null, espnId: '13013' });

  withWarnSpy((calls) => {
    assert.doesNotThrow(() => validateOline(teams, { year: 2025 }));
    assert.ok(
      calls.some(c => /empty\/missing player name/.test(c)),
      'expected an empty-name drop warning'
    );
  });

  assert.ok(!state.ol.some(e => e.espnId === '13013'), 'the empty-name record must be absent');
  const finalTotal = Object.values(teams).reduce(
    (s, t) => s + t.states.reduce((s2, st) => s2 + st.ol.length, 0), 0
  );
  assert.equal(finalTotal, originalTotal, 'only the bad record should have been dropped');
});

test('validateOline: counting rowCount AFTER validateOline (not before) reflects the actual post-drop total — scripts/update-oline.mjs envelope/manifest fix', () => {
  const teams = makeBulkTeams(MIN_OLINE_ROWS + 5);
  const preDropCount = Object.values(teams).reduce(
    (s, t) => s + t.states.reduce((s2, st) => s2 + st.ol.length, 0), 0
  );

  // A droppable record, present pre-validation (mirrors an upstream CSV row already parsed
  // into ol[] before validateOline ever runs) — inflates the naive pre-validation count by 1.
  teams.SF.states[0].ol.push({ slot: 'RT', rank: 2, name: '', gsisId: null, espnId: '13013' });
  assert.equal(
    Object.values(teams).reduce((s, t) => s + t.states.reduce((s2, st) => s2 + st.ol.length, 0), 0),
    preDropCount + 1,
    'sanity: the ragged record is counted before validation runs'
  );

  withWarnSpy(() => {
    assert.doesNotThrow(() => validateOline(teams, { year: 2025 }));
  });

  // This is exactly what scripts/update-oline.mjs now recomputes AFTER the validateOline call
  // for the envelope's rowCount/manifest recordCount — it must equal the true surviving total,
  // not the stale pre-drop count (which would overstate by 1, permanently, for an append-only file).
  const postDropCount = Object.values(teams).reduce(
    (s, t) => s + t.states.reduce((s2, st) => s2 + st.ol.length, 0), 0
  );
  assert.equal(postDropCount, preDropCount, 'post-validation count must exclude the dropped ragged record');
});

test('validateOline: throws when enough dropped records push the total below MIN_OLINE_ROWS', () => {
  const teams = makeBulkTeams(MIN_OLINE_ROWS + 5);
  // Empty out names on 10 valid entries scattered across the first two states — leaves the
  // surviving total at (MIN_OLINE_ROWS + 5 - 10), below the floor.
  let blanked = 0;
  outer:
  for (const t of Object.values(teams)) {
    for (const state of t.states) {
      for (const entry of state.ol) {
        if (blanked >= 10) break outer;
        entry.name = '';
        blanked++;
      }
    }
  }
  assert.equal(blanked, 10);
  assert.throws(() => validateOline(teams, { year: 2025 }), /expected ≥ \d+/);
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
