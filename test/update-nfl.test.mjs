/**
 * test/update-nfl.test.mjs — Unit tests for nflHash content-hash helper.
 *
 * Run with: node --test  (or npm test)
 */

import { test } from 'node:test';
import assert   from 'node:assert/strict';

import { nflHash } from '../scripts/update-nfl.mjs';

test('nflHash: objects differing only in a points-neutral field (off_snp) hash differently', () => {
  const base = {
    '1': { fantasyPoints: 100.5, gamesPlayed: 17, off_snp: 800 },
    '2': { fantasyPoints:  80.0, gamesPlayed: 16, off_snp: 600 },
  };
  const updated = {
    '1': { fantasyPoints: 100.5, gamesPlayed: 17, off_snp: 820 }, // off_snp changed, points same
    '2': { fantasyPoints:  80.0, gamesPlayed: 16, off_snp: 600 },
  };
  assert.notEqual(nflHash(base), nflHash(updated));
});

test('nflHash: identical objects produce the same hash regardless of key insertion order', () => {
  const a = { '2': { fantasyPoints: 80.0, off_snp: 600 }, '1': { fantasyPoints: 100.5, off_snp: 800 } };
  const b = { '1': { fantasyPoints: 100.5, off_snp: 800 }, '2': { fantasyPoints: 80.0, off_snp: 600 } };
  assert.equal(nflHash(a), nflHash(b));
});
