/**
 * test/step4-mirror.test.mjs — versioned Step 4 regression bucket unit tests (D-17).
 *
 * lib/projectionFactors.mjs's resolveRegressionBucket/reconstructRegressionFactor
 * are pure (no I/O) — these tests exercise them directly. Part B (D-18,
 * step4-boundary-parity.md) appends T-S4-1..6 to this file.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveRegressionBucket, reconstructRegressionFactor,
  REGRESSION_MODELS, CURRENT_REGRESSION_MODEL, REGRESSION_UPSIDE_POSITIONS,
} from '../lib/projectionFactors.mjs';

describe('T-S4-U1: model required', () => {
  test('resolveRegressionBucket with no model throws', () => {
    assert.throws(() => resolveRegressionBucket(0.6, { position: 'WR' }), /unknown regression model/);
  });

  test('resolveRegressionBucket with an unknown model throws', () => {
    assert.throws(() => resolveRegressionBucket(0.6, { position: 'WR', model: 'step4' }), /unknown regression model/);
  });

  test('reconstructRegressionFactor with no options throws', () => {
    assert.throws(() => reconstructRegressionFactor([10, 10, 10], 10, 6), /unknown regression model/);
  });
});

describe('T-S4-U2: position rules', () => {
  test('step4-upside with no position throws', () => {
    assert.throws(() => resolveRegressionBucket(0.6, { model: 'step4-upside' }), /step4-upside needs position/);
  });

  test('step4-upside with an ineligible position (K) throws', () => {
    assert.throws(() => resolveRegressionBucket(0.6, { position: 'K', model: 'step4-upside' }), /step4-upside needs position/);
  });

  test('legacy with no position ignores position entirely', () => {
    assert.deepEqual(resolveRegressionBucket(0.6, { model: 'legacy' }), { regressionFactorRaw: 1.12, regressionUpsideBasis: null });
  });
});

describe('T-S4-U3: threshold table', () => {
  const POSITIONS = ['QB', 'RB', 'WR', 'TE'];
  const rows = [
    { ratios: [0.6, 0.648], legacy: { regressionFactorRaw: 1.12, regressionUpsideBasis: null }, upsideNonQb: { regressionFactorRaw: 1, regressionUpsideBasis: null /* removed:<POS> */ }, upsideQb: { regressionFactorRaw: 1.12, regressionUpsideBasis: 'retained:QB' } },
    { ratios: [0.65, 0.652, 0.8, 0.848], legacy: { regressionFactorRaw: 1.05, regressionUpsideBasis: null }, upsideNonQb: { regressionFactorRaw: 1, regressionUpsideBasis: null /* removed:<POS> */ }, upsideQb: { regressionFactorRaw: 1.05, regressionUpsideBasis: 'retained:QB' } },
    { ratios: [0.85, 0.852, 1.15], legacy: { regressionFactorRaw: 1, regressionUpsideBasis: null }, upsideNonQb: { regressionFactorRaw: 1, regressionUpsideBasis: 'none' }, upsideQb: { regressionFactorRaw: 1, regressionUpsideBasis: 'none' } },
    { ratios: [1.2, 1.35], legacy: { regressionFactorRaw: 0.95, regressionUpsideBasis: null }, upsideNonQb: { regressionFactorRaw: 0.95, regressionUpsideBasis: 'none' }, upsideQb: { regressionFactorRaw: 0.95, regressionUpsideBasis: 'none' } },
    { ratios: [1.4], legacy: { regressionFactorRaw: 0.88, regressionUpsideBasis: null }, upsideNonQb: { regressionFactorRaw: 0.88, regressionUpsideBasis: 'none' }, upsideQb: { regressionFactorRaw: 0.88, regressionUpsideBasis: 'none' } },
  ];

  for (const row of rows) {
    for (const ratio of row.ratios) {
      test(`ratio ${ratio}: legacy (any position)`, () => {
        for (const position of [...POSITIONS, undefined]) {
          assert.deepEqual(resolveRegressionBucket(ratio, { position, model: 'legacy' }), row.legacy);
        }
      });

      test(`ratio ${ratio}: step4-upside RB/WR/TE`, () => {
        for (const position of ['RB', 'WR', 'TE']) {
          const expected = row.upsideNonQb.regressionUpsideBasis === null
            ? { regressionFactorRaw: row.upsideNonQb.regressionFactorRaw, regressionUpsideBasis: `removed:${position}` }
            : row.upsideNonQb;
          assert.deepEqual(resolveRegressionBucket(ratio, { position, model: 'step4-upside' }), expected);
        }
      });

      test(`ratio ${ratio}: step4-upside QB`, () => {
        assert.deepEqual(resolveRegressionBucket(ratio, { position: 'QB', model: 'step4-upside' }), row.upsideQb);
      });
    }
  }
});

describe('T-S4-U4: composition', () => {
  function round3(x) { return Math.round(x * 1000) / 1000; }

  test('CV band is steady for [22,22,22,22,16] — ratio 0.769', () => {
    const ppgs = [22, 22, 22, 22, 16];
    const meanPPG = ppgs.reduce((a, b) => a + b, 0) / ppgs.length;
    assert.equal(round3(meanPPG), 20.8);
    const lastPPG = 16;
    const outlierRatio = lastPPG / meanPPG;
    assert.ok(Math.abs(outlierRatio - 0.769) < 1e-3);
  });

  test('[22,22,22,22,16]: legacy·WR = 1.025, step4-upside·WR = 1, step4-upside·QB = 1.025', () => {
    const ppgs = [22, 22, 22, 22, 16];
    const meanPPG = ppgs.reduce((a, b) => a + b, 0) / ppgs.length;
    const lastPPG = 16;
    assert.equal(round3(reconstructRegressionFactor(ppgs, meanPPG, lastPPG, { position: 'WR', model: 'legacy' })), 1.025);
    assert.equal(round3(reconstructRegressionFactor(ppgs, meanPPG, lastPPG, { position: 'WR', model: 'step4-upside' })), 1);
    assert.equal(round3(reconstructRegressionFactor(ppgs, meanPPG, lastPPG, { position: 'QB', model: 'step4-upside' })), 1.025);
  });

  test('CV band is steady for [18,18,18,18,24] — ratio 1.25', () => {
    const ppgs = [18, 18, 18, 18, 24];
    const meanPPG = ppgs.reduce((a, b) => a + b, 0) / ppgs.length;
    const lastPPG = 24;
    const outlierRatio = lastPPG / meanPPG;
    assert.equal(outlierRatio, 1.25);
  });

  test('[18,18,18,18,24]: 0.975 under all four model x position combinations', () => {
    const ppgs = [18, 18, 18, 18, 24];
    const meanPPG = ppgs.reduce((a, b) => a + b, 0) / ppgs.length;
    const lastPPG = 24;
    for (const model of REGRESSION_MODELS) {
      for (const position of ['QB', 'WR']) {
        assert.equal(round3(reconstructRegressionFactor(ppgs, meanPPG, lastPPG, { position, model })), 0.975);
      }
    }
  });
});

describe('T-S4-U5: constants', () => {
  test('REGRESSION_MODELS', () => {
    assert.deepEqual(REGRESSION_MODELS, ['legacy', 'step4-upside']);
  });

  test('CURRENT_REGRESSION_MODEL', () => {
    assert.equal(CURRENT_REGRESSION_MODEL, 'step4-upside');
  });

  test('REGRESSION_UPSIDE_POSITIONS', () => {
    assert.deepEqual([...REGRESSION_UPSIDE_POSITIONS], ['QB']);
  });
});

describe('T-S4-U6: basis type', () => {
  test('at ratio 0.9, every position returns a string basis under step4-upside and null under legacy', () => {
    for (const position of ['QB', 'RB', 'WR', 'TE']) {
      const upside = resolveRegressionBucket(0.9, { position, model: 'step4-upside' });
      assert.equal(typeof upside.regressionUpsideBasis, 'string');
    }
    const legacy = resolveRegressionBucket(0.9, { model: 'legacy' });
    assert.equal(legacy.regressionUpsideBasis, null);
  });
});
