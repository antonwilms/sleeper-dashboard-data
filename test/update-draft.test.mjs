/**
 * test/update-draft.test.mjs — Unit tests for picksByYearHash content-hash helper.
 *
 * Run with: node --test  (or npm test)
 */

import { test } from 'node:test';
import assert   from 'node:assert/strict';

import { picksByYearHash } from '../scripts/update-draft.mjs';

test('picksByYearHash: objects differing only in year-order and pick-order hash identically', () => {
  const a = {
    '2024': [
      { year: 2024, round: 1, pick: 2, team: 'WSH', fullName: 'Jayden Daniels', position: 'QB', college: 'LSU', age: null },
      { year: 2024, round: 1, pick: 1, team: 'CHI', fullName: 'Caleb Williams',  position: 'QB', college: 'USC', age: null },
    ],
    '2023': [
      { year: 2023, round: 1, pick: 1, team: 'CAR', fullName: 'Bryce Young', position: 'QB', college: 'Alabama', age: null },
    ],
  };
  const b = {
    '2023': [
      { year: 2023, round: 1, pick: 1, team: 'CAR', fullName: 'Bryce Young', position: 'QB', college: 'Alabama', age: null },
    ],
    '2024': [
      { year: 2024, round: 1, pick: 1, team: 'CHI', fullName: 'Caleb Williams',  position: 'QB', college: 'USC', age: null },
      { year: 2024, round: 1, pick: 2, team: 'WSH', fullName: 'Jayden Daniels', position: 'QB', college: 'LSU', age: null },
    ],
  };
  assert.equal(picksByYearHash(a), picksByYearHash(b));
});

test('picksByYearHash: objects with different content hash differently', () => {
  const a = {
    '2024': [{ year: 2024, round: 1, pick: 1, team: 'CHI', fullName: 'Caleb Williams', position: 'QB', college: 'USC',  age: null }],
  };
  const b = {
    '2024': [{ year: 2024, round: 1, pick: 1, team: 'CHI', fullName: 'Caleb Williams', position: 'QB', college: 'UCLA', age: null }],
  };
  assert.notEqual(picksByYearHash(a), picksByYearHash(b));
});
