/**
 * test/playerstate.test.mjs — Unit tests for the players-state capture
 * (buildPlayersState / isCapturedPlayer / pickPlayerState / playersHash) and
 * validatePlayersState.
 *
 * Run with: node --test  (or npm test)
 */

import { test } from 'node:test';
import assert   from 'node:assert/strict';
import fs       from 'node:fs';
import path     from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  isCapturedPlayer,
  pickPlayerState,
  buildPlayersState,
  playersHash,
} from '../scripts/update-playerstate.mjs';
import { validatePlayersState, MIN_PLAYERSTATE_ROWS } from '../lib/validate.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

// ─── helpers ─────────────────────────────────────────────────────────────────

const TEAMS = [
  'ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND',
  'JAX','KC','LA','LAC','LV','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SEA','SF',
  'TB','TEN','WAS',
];

function rawPlayer(id, overrides = {}) {
  return {
    full_name: `Player ${id}`,
    team: TEAMS[Number(id) % TEAMS.length],
    position: 'WR',
    fantasy_positions: ['WR'],
    active: true,
    status: 'Active',
    injury_status: null,
    injury_body_part: null,
    injury_start_date: null,
    injury_notes: null,
    practice_participation: null,
    practice_description: null,
    depth_chart_position: 'WR',
    depth_chart_order: 1,
    team_changed_at: null,
    news_updated: 1700000000000 + Number(id),
    search_rank: Number(id),
    ...overrides,
  };
}

/** N synthetic well-formed captured records, spread across all 32 teams. */
function validRecords(n) {
  const out = {};
  for (let i = 0; i < n; i++) out[String(1000 + i)] = pickPlayerState(rawPlayer(1000 + i));
  return out;
}

// ─── isCapturedPlayer / buildPlayersState (membership filter) ───────────────

test('#1 filter includes active rostered QB', () => {
  const raw = { '1': rawPlayer('1', { position: 'QB', fantasy_positions: ['QB'] }) };
  const built = buildPlayersState(raw);
  assert.ok('1' in built);
});

test('#2 filter excludes teamless active player', () => {
  const raw = { '1': rawPlayer('1', { team: null }) };
  assert.equal(isCapturedPlayer(raw['1']), false);
  assert.deepEqual(buildPlayersState(raw), {});
});

test('#3 filter excludes inactive rostered player', () => {
  const raw = { '1': rawPlayer('1', { active: false }) };
  assert.equal(isCapturedPlayer(raw['1']), false);
  assert.deepEqual(buildPlayersState(raw), {});
});

test('#4 filter excludes non-skill positions (OL, DEF pseudo-player)', () => {
  const raw = {
    ol:  rawPlayer('ol',  { position: 'G',   fantasy_positions: [] }),
    def: rawPlayer('def', { position: 'DEF', fantasy_positions: [] }),
  };
  assert.deepEqual(buildPlayersState(raw), {});
});

test('#5 FB captured via fantasy_positions even though position is FB', () => {
  const raw = { '1': rawPlayer('1', { position: 'FB', fantasy_positions: ['RB'] }) };
  const built = buildPlayersState(raw);
  assert.ok('1' in built);
  assert.equal(built['1'].position, 'FB');
});

// ─── pickPlayerState (shape) ─────────────────────────────────────────────────

test('#6 pick shape: every schema key present, null where upstream is absent', () => {
  const picked = pickPlayerState({ full_name: 'Test Player', team: 'KC', position: 'QB' });
  const expectedKeys = [
    'name', 'team', 'position', 'fantasyPositions', 'status', 'injuryStatus',
    'injuryBodyPart', 'injuryStartDate', 'injuryNotes', 'practiceParticipation',
    'practiceDescription', 'depthChartPosition', 'depthChartOrder', 'active',
    'teamChangedAt', 'newsUpdated', 'searchRank',
  ];
  for (const key of expectedKeys) assert.ok(key in picked, `missing key ${key}`);
  assert.equal(picked.name, 'Test Player');
  assert.equal(picked.injuryStatus, null);
  assert.equal(picked.injuryBodyPart, null);
  assert.equal(picked.depthChartOrder, null);
  assert.equal(picked.active, null);
  assert.deepEqual(picked.fantasyPositions, []);
});

// ─── Key order ────────────────────────────────────────────────────────────────

test('#7 output keys sorted regardless of input map order', () => {
  const raw = {
    '300': rawPlayer('300'),
    '100': rawPlayer('100'),
    '200': rawPlayer('200'),
  };
  const built = buildPlayersState(raw);
  assert.deepEqual(Object.keys(built), ['100', '200', '300']);
});

// ─── validatePlayersState ────────────────────────────────────────────────────

test('#8 validator floor: 599 valid records throws (< MIN_PLAYERSTATE_ROWS)', () => {
  const players = validRecords(MIN_PLAYERSTATE_ROWS - 1);
  assert.throws(() => validatePlayersState(players), /only \d+ valid records/);
});

test('#9 validator team spread: 600 records all on one team throws (< 28 teams)', () => {
  const players = {};
  for (let i = 0; i < MIN_PLAYERSTATE_ROWS; i++) {
    players[String(2000 + i)] = pickPlayerState(rawPlayer(2000 + i, { team: 'KC' }));
  }
  assert.throws(() => validatePlayersState(players), /distinct teams/);
});

test('#10 validator happy path: 600 records across 32 teams passes', () => {
  const players = validRecords(MIN_PLAYERSTATE_ROWS);
  assert.doesNotThrow(() => validatePlayersState(players));
});

test('#11 status is not enum-gated — a novel status value passes', () => {
  const players = validRecords(MIN_PLAYERSTATE_ROWS);
  players['1000'].status = 'Future-Status-X';
  assert.doesNotThrow(() => validatePlayersState(players));
});

// ─── Dedup hash ───────────────────────────────────────────────────────────────

test('#12 playersHash: same players in different insertion order → equal hashes', () => {
  const a = validRecords(50);
  const ids = Object.keys(a).reverse();
  const b = {};
  for (const id of ids) b[id] = a[id];
  assert.equal(playersHash(a), playersHash(b));
});

test('#12b playersHash: ignores newsUpdated/searchRank churn', () => {
  const a = validRecords(50);
  const b = JSON.parse(JSON.stringify(a));
  for (const id of Object.keys(b)) {
    b[id].newsUpdated = (b[id].newsUpdated ?? 0) + 1;
    b[id].searchRank = (b[id].searchRank ?? 0) + 1;
  }
  assert.equal(playersHash(a), playersHash(b));
});

// ─── Capture-only tripwire ────────────────────────────────────────────────────

test('#13 capture-only tripwire: no scoring/grading/backtest/panel module references players-state', () => {
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
    assert.ok(!/players-state/.test(text), `${rel} references players-state`);
    assert.ok(!/playerstate/i.test(text), `${rel} references playerstate`);
  }
});
