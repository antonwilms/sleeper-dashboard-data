/**
 * test/cfbd.test.mjs — Unit tests for lib/cfbd.mjs's pivotCfbdRows.
 *
 * pivotCfbdRows is the shared pivot used by both scripts/migrate-college-pivot.mjs and
 * scripts/update-cfbd.mjs (college-pivot-phase-b.md §3.1) — ported from the app's
 * src/api/cfbd.js pivotStatRows, same field order and conference ?? null behaviour.
 *
 * Run with: node --test  (or npm test)
 */

import { test } from 'node:test';
import assert   from 'node:assert/strict';

import { pivotCfbdRows } from '../lib/cfbd.mjs';

test('pivotCfbdRows: pivots a dense record — every statType folded onto one playerId entry', () => {
  const rows = [
    { season: 2023, playerId: '100', player: 'A', team: 'LSU', position: 'WR', conference: 'SEC', category: 'receiving', statType: 'YDS', stat: '1000' },
    { season: 2023, playerId: '100', player: 'A', team: 'LSU', position: 'WR', conference: 'SEC', category: 'receiving', statType: 'TD', stat: '10' },
    { season: 2023, playerId: '100', player: 'A', team: 'LSU', position: 'WR', conference: 'SEC', category: 'receiving', statType: 'REC', stat: '80' },
    { season: 2023, playerId: '100', player: 'A', team: 'LSU', position: 'WR', conference: 'SEC', category: 'receiving', statType: 'LONG', stat: '60' },
    { season: 2023, playerId: '100', player: 'A', team: 'LSU', position: 'WR', conference: 'SEC', category: 'receiving', statType: 'YPR', stat: '12.5' },
  ];
  const pivoted = pivotCfbdRows(rows);
  assert.deepEqual(pivoted, {
    '100': { playerId: '100', player: 'A', team: 'LSU', position: 'WR', conference: 'SEC', YDS: 1000, TD: 10, REC: 80, LONG: 60, YPR: 12.5 },
  });
});

test('pivotCfbdRows: stat values are numbers, not strings — parseFloat applied', () => {
  const rows = [{ playerId: '1', player: 'A', team: 'X', position: 'RB', conference: 'ACC', statType: 'YPC', stat: '5.500' }];
  const pivoted = pivotCfbdRows(rows);
  assert.equal(pivoted['1'].YPC, 5.5);
  assert.equal(typeof pivoted['1'].YPC, 'number');
});

test('pivotCfbdRows: missing conference on a row → null, not undefined', () => {
  const rows = [{ playerId: '1', player: 'A', team: 'X', position: 'RB', statType: 'YDS', stat: '10' }];
  const pivoted = pivotCfbdRows(rows);
  assert.equal(pivoted['1'].conference, null);
});

test('pivotCfbdRows: multiple players — each gets its own dense record; missing statType on one player does not affect another', () => {
  const rows = [
    { playerId: '2', player: 'B', team: 'Y', position: 'QB', conference: 'Big Ten', statType: 'YDS', stat: '3000' },
    { playerId: '2', player: 'B', team: 'Y', position: 'QB', conference: 'Big Ten', statType: 'TD', stat: '25' },
    { playerId: '1', player: 'A', team: 'X', position: 'QB', conference: 'SEC', statType: 'YDS', stat: '2500' },
  ];
  const pivoted = pivotCfbdRows(rows);
  assert.equal(pivoted['1'].TD, undefined); // player 1 never got a TD row — key absent, not zeroed
  assert.equal(pivoted['2'].TD, 25);
});

test('pivotCfbdRows: round-trips against a set-equality reconstruction (numeric stat comparison)', () => {
  const rows = [
    { season: 2021, playerId: '10', player: 'A', team: 'X', position: 'WR', conference: 'SEC', category: 'receiving', statType: 'YDS', stat: '900' },
    { season: 2021, playerId: '10', player: 'A', team: 'X', position: 'WR', conference: 'SEC', category: 'receiving', statType: 'TD', stat: '8' },
    { season: 2021, playerId: '20', player: 'B', team: 'Y', position: 'WR', conference: 'ACC', category: 'receiving', statType: 'YDS', stat: '700' },
    { season: 2021, playerId: '20', player: 'B', team: 'Y', position: 'WR', conference: 'ACC', category: 'receiving', statType: 'TD', stat: '6' },
  ];
  const pivoted = pivotCfbdRows(rows);

  // Reconstruct long-form rows from the pivoted object (mirrors college-pivot-phase-b.md §4
  // step 3's 27-file proof, at unit scale) and compare as a set, numerically.
  const STAT_FIELDS = ['YDS', 'TD'];
  const reconstructed = [];
  for (const [playerId, rec] of Object.entries(pivoted)) {
    for (const statType of STAT_FIELDS) {
      reconstructed.push({ playerId, player: rec.player, team: rec.team, position: rec.position, conference: rec.conference, statType, stat: rec[statType] });
    }
  }

  const key = r => `${r.playerId}|${r.statType}`;
  const originalByKey = new Map(rows.map(r => [key(r), r]));
  assert.equal(reconstructed.length, rows.length);
  for (const r of reconstructed) {
    const orig = originalByKey.get(key(r));
    assert.ok(orig, `no original row for ${key(r)}`);
    assert.equal(parseFloat(orig.stat), r.stat); // numeric comparison — orig.stat is a string
  }
});

test('pivotCfbdRows: output keys are in ascending numeric playerId order, regardless of input row order', () => {
  const rows = [
    { playerId: '300', player: 'C', team: 'Z', position: 'RB', conference: 'SEC', statType: 'YDS', stat: '1' },
    { playerId: '5',   player: 'A', team: 'X', position: 'RB', conference: 'SEC', statType: 'YDS', stat: '2' },
    { playerId: '40',  player: 'B', team: 'Y', position: 'RB', conference: 'SEC', statType: 'YDS', stat: '3' },
  ];
  const pivoted = pivotCfbdRows(rows);
  assert.deepEqual(Object.keys(pivoted), ['5', '40', '300']);
});

test('pivotCfbdRows: empty input → empty object', () => {
  assert.deepEqual(pivotCfbdRows([]), {});
});
