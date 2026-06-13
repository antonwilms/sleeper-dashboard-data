/**
 * test/fantasyPoints.test.mjs — Port fidelity tests for lib/fantasyPoints.mjs.
 * Run with: node --test (or npm test).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateFantasyPoints } from '../lib/fantasyPoints.mjs';

test('calculateFantasyPoints: app sanity — pass_yd + pass_td', () => {
  const result = calculateFantasyPoints(
    { pass_yd: 300, pass_td: 3 },
    { pass_yd: 0.04, pass_td: 4 }
  );
  assert.equal(result, 24);
});

test('calculateFantasyPoints: null multiplier is skipped', () => {
  const result = calculateFantasyPoints(
    { rec: 5 },
    { rec: null, pass_yd: 0.04 }
  );
  assert.equal(result, 0);
});

test('calculateFantasyPoints: absent stat is skipped', () => {
  const result = calculateFantasyPoints(
    { pass_yd: 100 },
    { pass_yd: 0.04, rec: 0.5 }
  );
  assert.equal(result, 4);
});

test('calculateFantasyPoints: 2-dp rounding (rec 0.5 * 3 = 1.5)', () => {
  const result = calculateFantasyPoints({ rec: 0.5 }, { rec: 3 });
  assert.equal(result, 1.5);
});

test('calculateFantasyPoints: rate key in stats but not in scoringSettings is ignored', () => {
  const result = calculateFantasyPoints(
    { rec: 80, rec_ypr: 999 },
    { rec: 0.5 }
  );
  assert.equal(result, 40);
});
