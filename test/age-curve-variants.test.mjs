/**
 * test/age-curve-variants.test.mjs — S3b's guarded and within-player age curves (lib/ageCurveVariants.mjs).
 * T-CURVE: guardedAgeCurves; T-DELTA: deltaAgeCurves. Reads only test/fixtures/ (Invariant 10).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { empiricalAgeCurvesMirror } from '../lib/dynastyMirror.mjs';
import { guardedAgeCurves, deltaAgeCurves, PEAK_GUARD_MIN_ROWS } from '../lib/ageCurveVariants.mjs';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'dynasty-mirror-parity');
const fixture = (n) => JSON.parse(fs.readFileSync(path.join(FIX, n), 'utf8'));

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} ${a} vs ${b}`);

/** Season 2019 rows: `n` players at age bucket `age` (age on currentYear 2020 = bucket + 1), each at `ppg`, gp 16. */
function bucketStore(spec, position) {
  const careerStats = { 2019: {} };
  const playersMap = {};
  let id = 0;
  for (const { age, n, ppg } of spec) {
    for (let i = 0; i < n; i++) {
      const pid = String(++id);
      playersMap[pid] = { position, age: age + 1 };
      careerStats[2019][pid] = { gamesPlayed: 16, fantasyPoints: 16 * ppg };
    }
  }
  return { careerStats, playersMap };
}

describe('T-CURVE guardedAgeCurves', () => {
  test('PEAK_GUARD_MIN_ROWS is the standing 30', () => assert.equal(PEAK_GUARD_MIN_ROWS, 30));

  for (const name of ['inputs-2019.json', 'inputs-2023.json']) {
    test(`minRows 0 deep-equals empiricalAgeCurvesMirror on ${name}`, () => {
      const { careerStats, playersMap, currentYear } = fixture(name);
      const expected = empiricalAgeCurvesMirror(careerStats, playersMap, { currentYear });
      const got = guardedAgeCurves(careerStats, playersMap, { currentYear, minRows: 0 });
      assert.deepStrictEqual(got.bundle, expected);
      assert.deepEqual(Object.keys(got.bundle).sort(), ['curves', 'positionBasisScale', 'positionPeakAge', 'positionPeakPPG']);
      for (const pos of ['QB', 'RB', 'WR', 'TE']) assert.equal(got.fallback[pos], false);
    });
    test(`the default guard changes only the peak on ${name}`, () => {
      const { careerStats, playersMap, currentYear } = fixture(name);
      const expected = empiricalAgeCurvesMirror(careerStats, playersMap, { currentYear });
      const got = guardedAgeCurves(careerStats, playersMap, { currentYear }).bundle;
      assert.deepStrictEqual(got.curves, expected.curves);
      assert.deepStrictEqual(got.positionBasisScale, expected.positionBasisScale);
    });
  }

  test('a 17-row peak bucket is skipped for the best >= 30-row bucket', () => {
    // raw buckets (sorted by age): 20 (17 rows, 20 ppg), 24 (30, 12), 25 (30, 11), 26 (30, 10)
    // smoothed: 20 -> (20+12)/2 = 16; 24 -> (20+12+11)/3 = 43/3; 25 -> (12+11+10)/3 = 11; 26 -> (11+10)/2 = 10.5
    const { careerStats, playersMap } = bucketStore([
      { age: 20, n: 17, ppg: 20 }, { age: 24, n: 30, ppg: 12 }, { age: 25, n: 30, ppg: 11 }, { age: 26, n: 30, ppg: 10 },
    ], 'WR');
    const un = empiricalAgeCurvesMirror(careerStats, playersMap, { currentYear: 2020 });
    assert.equal(un.positionPeakAge.WR, 20);
    const g = guardedAgeCurves(careerStats, playersMap, { currentYear: 2020 });
    assert.equal(g.bundle.positionPeakAge.WR, 24);
    near(g.bundle.positionPeakPPG.WR, 43 / 3, 'nearest-point peak PPG at 24');
    assert.equal(g.fallback.WR, false);
    assert.deepEqual(g.counts.WR, { 20: 17, 24: 30, 25: 30, 26: 30 });
    assert.deepStrictEqual(g.bundle.curves, un.curves);
    assert.deepStrictEqual(g.bundle.positionBasisScale, un.positionBasisScale);
  });

  test('ties go to the youngest eligible age (strict >)', () => {
    const { careerStats, playersMap } = bucketStore([
      { age: 24, n: 30, ppg: 10 }, { age: 25, n: 30, ppg: 10 }, { age: 26, n: 30, ppg: 10 },
    ], 'RB');
    // smoothed all 10 -> peak 24, capped min(24, 25) = 24
    const g = guardedAgeCurves(careerStats, playersMap, { currentYear: 2020 });
    assert.equal(g.bundle.positionPeakAge.RB, 24);
  });

  test('a position with no >= 30 bucket falls back to the unguarded peak and is counted', () => {
    // QB raw: 22 (10 rows, 10), 23 (10, 12), 24 (10, 9); smoothed 22 -> 11, 23 -> 31/3, 24 -> 10.5; unguarded peak 22
    const { careerStats, playersMap } = bucketStore([
      { age: 22, n: 10, ppg: 10 }, { age: 23, n: 10, ppg: 12 }, { age: 24, n: 10, ppg: 9 },
    ], 'QB');
    const un = empiricalAgeCurvesMirror(careerStats, playersMap, { currentYear: 2020 });
    const g = guardedAgeCurves(careerStats, playersMap, { currentYear: 2020 });
    assert.equal(g.fallback.QB, true);
    assert.equal(g.bundle.positionPeakAge.QB, un.positionPeakAge.QB);
    assert.equal(g.bundle.positionPeakAge.QB, 22);
    near(g.bundle.positionPeakPPG.QB, 11);
    assert.equal(g.fallback.RB, false); // no points: not a fallback, the empty-position rule
    assert.equal(g.bundle.positionPeakPPG.RB, 1);
    assert.equal(g.bundle.positionPeakAge.RB, null);
  });

  test('the cap applies after the guard, and the nearest-point rule uses all smoothed points', () => {
    // RB: 30-row buckets at 27 (12 ppg) and 28 (9 ppg): smoothed 27 -> 10.5, 28 -> 10.5; derived 27 -> capped 25;
    // nearest smoothed point to 25 is age 27 (the only one closer than 28) -> peak PPG 10.5
    const { careerStats, playersMap } = bucketStore([{ age: 27, n: 30, ppg: 12 }, { age: 28, n: 30, ppg: 9 }], 'RB');
    const g = guardedAgeCurves(careerStats, playersMap, { currentYear: 2020 });
    assert.equal(g.bundle.positionPeakAge.RB, 25);
    near(g.bundle.positionPeakPPG.RB, 10.5);
  });

  test('basis ratios are pushed before the null-age check (as the mirror does)', () => {
    const careerStats = { 2019: {} };
    const playersMap = {};
    for (let i = 0; i < 30; i++) {
      playersMap[`p${i}`] = { position: 'WR', age: null };
      careerStats[2019][`p${i}`] = { gamesPlayed: 16, fantasyPoints: 160, sourceScoringBasis: 'half_ppr', sourceFantasyPoints: 200 };
    }
    const g = guardedAgeCurves(careerStats, playersMap, { currentYear: 2020 });
    assert.equal(g.bundle.positionBasisScale.WR, 0.8);
    assert.deepStrictEqual(g.bundle, empiricalAgeCurvesMirror(careerStats, playersMap, { currentYear: 2020 }));
  });
});

// ─── T-DELTA ──────────────────────────────────────────────────────────────────────────────────────

/** Pairs 2020 -> 2021: first-season age `a`, base ppg 10, delta d; currentYear 2022 (age field = a + 2). */
function pairStore(specs) {
  const careerStats = { 2020: {}, 2021: {} };
  const playersMap = {};
  let id = 0;
  for (const { pos, a, ds } of specs) {
    for (const d of ds) {
      const pid = String(++id);
      playersMap[pid] = { position: pos, age: a + 2 };
      careerStats[2020][pid] = { gamesPlayed: 16, fantasyPoints: 16 * 10 };
      careerStats[2021][pid] = { gamesPlayed: 16, fantasyPoints: 16 * (10 + d) };
    }
  }
  return { careerStats, playersMap };
}
const mkAnchor = (pos, counts, curve, extra = {}) => ({
  bundle: {
    curves: { QB: [], RB: [], WR: [], TE: [], [pos]: curve },
    positionPeakPPG: { QB: 1, RB: 1, WR: 1, TE: 1, [pos]: 99 },
    positionPeakAge: { QB: null, RB: null, WR: null, TE: null, [pos]: 77 },
    positionBasisScale: { QB: 1, RB: 1, WR: 0.9, TE: 1 },
    ...extra,
  },
  counts: { QB: {}, RB: {}, WR: {}, TE: {}, [pos]: counts },
});

describe('T-DELTA deltaAgeCurves', () => {
  test('D(a) is the mean of the deltas; the chain anchors at the largest bucket and steps both ways', () => {
    // pairs by first-season age: 23 {+1, +3} -> D 2; 24 {-1, -3} -> D -2; 25 {-2, 0} -> D -1; 26 {+5} -> n 1 (< minPairs 2)
    const { careerStats, playersMap } = pairStore([
      { pos: 'WR', a: 23, ds: [1, 3] }, { pos: 'WR', a: 24, ds: [-1, -3] }, { pos: 'WR', a: 25, ds: [-2, 0] }, { pos: 'WR', a: 26, ds: [5] },
    ]);
    const anchor = mkAnchor('WR', { 23: 3, 24: 5, 25: 4, 26: 2 }, [
      { age: 23, medianPPG: 9 }, { age: 24, medianPPG: 12 }, { age: 25, medianPPG: 11 }, { age: 26, medianPPG: 10 },
    ]);
    const r = deltaAgeCurves(careerStats, playersMap, { currentYear: 2022, anchor, minPairs: 2 });
    assert.deepEqual(r.pairs.WR, { 23: 2, 24: 2, 25: 2, 26: 1 });
    // anchor 24 (5 rows), L(24) = 12.
    // up:   n(24) = 2 -> L(25) = 12 + D(24) = 12 - 2 = 10;  n(25) = 2 -> L(26) = 10 + D(25) = 10 - 1 = 9;  n(26) = 1 stop.
    // down: n(23) = 2 -> L(23) = L(24) - D(23) = 12 - 2 = 10;  n(22) = 0 stop.
    assert.deepEqual(r.bundle.curves.WR, [
      { age: 23, medianPPG: 10 }, { age: 24, medianPPG: 12 }, { age: 25, medianPPG: 10 }, { age: 26, medianPPG: 9 },
    ]);
    // peak: highest L = 12 at age 24; WR cap 28 -> 24; nearest point 24 -> PPG 12
    assert.equal(r.bundle.positionPeakAge.WR, 24);
    assert.equal(r.bundle.positionPeakPPG.WR, 12);
    assert.equal(r.fallback.WR, false);
    assert.equal(r.floored.WR, 0);
    assert.equal(r.bundle.positionBasisScale.WR, 0.9, 'positionBasisScale is H\'s');
  });

  test('the downward step at age a uses n(a): a thin bucket at the anchor\'s younger side stops the chain', () => {
    // 24 anchor; n(23) = 1 (< 2) -> no downward step even though a pair exists at 23
    const { careerStats, playersMap } = pairStore([
      { pos: 'WR', a: 23, ds: [4] }, { pos: 'WR', a: 24, ds: [1, 1] }, { pos: 'WR', a: 25, ds: [1, 1] },
    ]);
    const anchor = mkAnchor('WR', { 24: 5, 25: 1 }, [{ age: 24, medianPPG: 10 }, { age: 25, medianPPG: 9 }]);
    const r = deltaAgeCurves(careerStats, playersMap, { currentYear: 2022, anchor, minPairs: 2 });
    // up: L(25) = 10 + 1 = 11, L(26) = 11 + 1 = 12 needs n(25) = 2 ok; n(26) = 0 stop. down: n(23) = 1 stop.
    assert.deepEqual(r.bundle.curves.WR.map(p => p.age), [24, 25, 26]);
    assert.deepEqual(r.bundle.curves.WR.map(p => p.medianPPG), [10, 11, 12]);
  });

  test('the anchor tie goes to the younger age', () => {
    const { careerStats, playersMap } = pairStore([
      { pos: 'WR', a: 23, ds: [0, 0] }, { pos: 'WR', a: 24, ds: [0, 0] }, { pos: 'WR', a: 25, ds: [0, 0] },
    ]);
    const anchor = mkAnchor('WR', { 24: 7, 25: 7 }, [{ age: 24, medianPPG: 10 }, { age: 25, medianPPG: 20 }]);
    const r = deltaAgeCurves(careerStats, playersMap, { currentYear: 2022, anchor, minPairs: 2 });
    // anchor 24 (younger) with L = 10: up 24 -> 25 -> 26 (n(24), n(25) = 2), down 23 -> L(23) = 10
    assert.deepEqual(r.bundle.curves.WR.map(p => p.medianPPG), [10, 10, 10, 10]);
    assert.deepEqual(r.bundle.curves.WR.map(p => p.age), [23, 24, 25, 26]);
  });

  test('a chain of exactly 2 ages (anchor + one step) falls back to H\'s curve and is counted', () => {
    const { careerStats, playersMap } = pairStore([{ pos: 'WR', a: 24, ds: [1, 1] }, { pos: 'WR', a: 25, ds: [1] }]);
    const curve = [{ age: 24, medianPPG: 12 }, { age: 25, medianPPG: 11 }];
    const anchor = mkAnchor('WR', { 24: 5, 25: 1 }, curve);
    const r = deltaAgeCurves(careerStats, playersMap, { currentYear: 2022, anchor, minPairs: 2 });
    // L(24) = 12, L(25) = 12 + 1 = 13 (n(24) = 2); n(25) = 1 stop; down n(23) = 0 stop -> 2 ages
    assert.equal(r.fallback.WR, true);
    assert.deepStrictEqual(r.bundle.curves.WR, curve);
    assert.equal(r.bundle.positionPeakAge.WR, 77);
    assert.equal(r.bundle.positionPeakPPG.WR, 99);
  });

  test('a position with no pairs or no anchor points falls back', () => {
    const { careerStats, playersMap } = pairStore([{ pos: 'WR', a: 24, ds: [1, 1] }]);
    const anchor = mkAnchor('WR', { 24: 5 }, [{ age: 24, medianPPG: 12 }]);
    const r = deltaAgeCurves(careerStats, playersMap, { currentYear: 2022, anchor, minPairs: 2 });
    assert.equal(r.fallback.QB, true);
    assert.equal(r.fallback.RB, true);
    assert.equal(r.fallback.TE, true);
    assert.equal(r.fallback.WR, true, 'one age in the chain');
  });

  test('L is floored at 1 and each floored point is counted; the chain continues from the floored value', () => {
    // anchor 24, L = 12. D(24) = -15 -> 12 - 15 = -3 -> floored 1 (count 1). D(25) = -1 -> 1 - 1 = 0 -> floored 1 (count 2).
    const { careerStats, playersMap } = pairStore([
      { pos: 'WR', a: 24, ds: [-15, -15] }, { pos: 'WR', a: 25, ds: [-1, -1] }, { pos: 'WR', a: 26, ds: [0, 0] },
    ]);
    const anchor = mkAnchor('WR', { 24: 5 }, [{ age: 24, medianPPG: 12 }]);
    const r = deltaAgeCurves(careerStats, playersMap, { currentYear: 2022, anchor, minPairs: 2 });
    // L(26) = L(25) + D(25) = 1 - 1 -> 0 -> floored (count 2); L(27) needs n(26) = 2: 1 + 0 = 1 (no floor)
    assert.deepEqual(r.bundle.curves.WR.map(p => p.medianPPG), [12, 1, 1, 1]);
    assert.equal(r.floored.WR, 2);
    assert.equal(r.fallback.WR, false);
  });

  test('the peak is the highest L, then the cap and the nearest-point rule', () => {
    // RB cap 25. anchor 25 (L 10); D(25) = +2, D(26) = +3; chain 25, 26, 27 with L 10, 12, 15. Derived peak 27 -> cap 25;
    // nearest chain point to 25 is 25 itself -> peak PPG L(25) = 10.
    const { careerStats, playersMap } = pairStore([
      { pos: 'RB', a: 25, ds: [2, 2] }, { pos: 'RB', a: 26, ds: [3, 3] }, { pos: 'RB', a: 27, ds: [1] },
    ]);
    const anchor = mkAnchor('RB', { 25: 5 }, [{ age: 25, medianPPG: 10 }]);
    const r = deltaAgeCurves(careerStats, playersMap, { currentYear: 2022, anchor, minPairs: 2 });
    assert.deepEqual(r.bundle.curves.RB.map(p => p.medianPPG), [10, 12, 15]);
    assert.equal(r.bundle.positionPeakAge.RB, 25);
    assert.equal(r.bundle.positionPeakPPG.RB, 10);
  });

  test('pairs need both seasons at gp >= 10, a non-null age, and a first-season age in [18, 41]', () => {
    const { careerStats, playersMap } = pairStore([{ pos: 'WR', a: 24, ds: [1, 1, 1] }]);
    careerStats[2020]['1'].gamesPlayed = 9;                 // first season thin
    careerStats[2021]['2'].gamesPlayed = 9;                 // second season thin
    playersMap['3'].age = null;                             // no age
    const anchor = mkAnchor('WR', { 24: 5 }, [{ age: 24, medianPPG: 12 }]);
    const r = deltaAgeCurves(careerStats, playersMap, { currentYear: 2022, anchor, minPairs: 1 });
    assert.equal(r.pairs.WR[24] ?? 0, 0);
    const p2 = pairStore([{ pos: 'WR', a: 42, ds: [1] }, { pos: 'WR', a: 17, ds: [1] }]);
    const r2 = deltaAgeCurves(p2.careerStats, p2.playersMap, { currentYear: 2022, anchor, minPairs: 1 });
    assert.deepEqual(r2.pairs.WR, {});
  });
});
