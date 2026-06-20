/**
 * test/update-cfbd.test.mjs — Unit tests for cfbdHash content-hash helper.
 *
 * Run with: node --test  (or npm test)
 */

import { test } from 'node:test';
import assert   from 'node:assert/strict';

import { cfbdHash } from '../scripts/update-cfbd.mjs';

test('cfbdHash: equal-length row arrays with different content hash differently', () => {
  const rows1 = [
    { season: 2023, playerId: 1, player: 'Player A', statType: 'receptions', stat: 100 },
  ];
  const rows2 = [
    { season: 2023, playerId: 1, player: 'Player A', statType: 'receptions', stat: 101 }, // stat corrected
  ];
  assert.notEqual(cfbdHash(rows1), cfbdHash(rows2));
});

test('cfbdHash: identical arrays produce the same hash', () => {
  const rows = [
    { season: 2023, playerId: 1, player: 'Player A', statType: 'receptions', stat: 100 },
    { season: 2023, playerId: 2, player: 'Player B', statType: 'receptions', stat: 80 },
  ];
  assert.equal(cfbdHash(rows), cfbdHash([...rows]));
});
