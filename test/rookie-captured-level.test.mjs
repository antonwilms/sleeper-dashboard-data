/**
 * test/rookie-captured-level.test.mjs — D-56(b) (research-arms-w3 §5, §6.3). The closed form in
 * lib/rookieCapturedLevel.mjs reproduces every captured rookie-path `projectedPPG` from the capture's own
 * factors, so the dynasty-side rookie prior needs no snapshot field. Reads the snapshots from the repo root; a
 * missing fixed file fails (Invariant 5), it is never skipped.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { rookieCapturedLevel } from '../lib/rookieCapturedLevel.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const newest = fs.readdirSync(path.join(ROOT, 'snapshots')).filter(n => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort().pop();

const rookieRows = (file) => {
  const snap = JSON.parse(fs.readFileSync(path.join(ROOT, 'snapshots', file), 'utf8'));
  return Object.entries(snap.players).filter(([, p]) => p.projection?.factors?.rookieCalibrationBasis).map(([id, p]) => ({ id, p }));
};

const SETS = [['2026-10-10.json', 310], ['2026-10-11.json', 307], [newest, null]];

describe('rookieCapturedLevel against captures', () => {
  for (const [file, expected] of SETS) {
    describe(file, () => {
      const rows = rookieRows(file);

      test('(i) rookie-row count', () => {
        if (expected != null) assert.equal(rows.length, expected);
        else assert.ok(rows.length >= 1);
      });

      test('(ii) non-neutral projectedPPG equals the captured value on every row; (iii) pre-ceiling level matches', () => {
        for (const { id, p } of rows) {
          const r = rookieCapturedLevel(p.projection.factors);
          assert.ok(r, `${id} returned null`);
          assert.equal(r.projectedPPG, p.projection.projectedPPG, `${id} projectedPPG`);
          assert.ok(Math.abs(r.projectedPPGPre - p.projection.factors.rookieCeilingPPGPre) <= 0.0005, `${id} pre-ceiling level`);
        }
      });

      test('(iv) where ktcMult and collegeContribution are 1, neutral and non-neutral dynastyPrior agree', () => {
        let n = 0;
        for (const { p } of rows) {
          const f = p.projection.factors;
          if (f.ktcMult === 1 && f.collegeContribution === 1) {
            n++;
            assert.equal(rookieCapturedLevel(f).dynastyPrior, rookieCapturedLevel(f, { neutral: true }).dynastyPrior);
          }
        }
        if (expected != null) assert.ok(n >= 1);   // existence is asserted on the two fixed files only
      });

      test('(v) the neutral dynastyPrior differs from the captured projectedPPG on at least one non-chain row', () => {
        const differs = rows.filter(({ p }) => p.projection.factors.qbTakeoverBasis !== 'chain'
          && rookieCapturedLevel(p.projection.factors, { neutral: true }).dynastyPrior !== p.projection.projectedPPG);
        if (expected != null) assert.ok(differs.length >= 1);   // fixed files only
      });

      test('(vi) on a chain row the dynasty prior is the ceiled level, not the share-scaled projectedPPG', () => {
        const chain = rows.filter(({ p }) => p.projection.factors.qbTakeoverBasis === 'chain');
        if (file !== newest) assert.equal(chain.length, file === '2026-10-10.json' ? 44 : 42);
        for (const { id, p } of chain) {
          const r = rookieCapturedLevel(p.projection.factors, { neutral: true });
          assert.equal(r.dynastyPrior, Math.round(r.ceiledPPG * 10) / 10, id);
        }
        if (expected != null) assert.ok(chain.some(({ p }) => rookieCapturedLevel(p.projection.factors, { neutral: true }).dynastyPrior !== p.projection.projectedPPG), 'share scaling must separate the two on some chain row');
      });
    });
  }
});

describe('rookieCapturedLevel — unit', () => {
  test('null on a non-finite required factor; chain projectedPPG null without a share, dynastyPrior unaffected', () => {
    assert.equal(rookieCapturedLevel({}), null);
    assert.equal(rookieCapturedLevel(null), null);
    const f = { basePPG: 10, ageDelta: 1, nflDraftMultiplier: 1, rookieCalibrationMult: 1, ktcMult: 1, collegeContribution: 1, qbTakeoverBasis: 'chain', qbStartShare: null };
    const r = rookieCapturedLevel(f);
    assert.equal(r.projectedPPG, null);
    assert.equal(r.dynastyPrior, 10);
  });

  test('the product clamp and the ceiling knee', () => {
    const base = { basePPG: 10, nflDraftMultiplier: 1, rookieCalibrationMult: 1, ktcMult: 1, collegeContribution: 1, qbTakeoverBasis: 'none' };
    assert.equal(rookieCapturedLevel({ ...base, ageDelta: 3 }).projectedPPGPre, 18.5);   // 3 → clamp 1.85
    assert.equal(rookieCapturedLevel({ ...base, ageDelta: 0.1 }).projectedPPGPre, 4.5);  // 0.1 → clamp 0.45
    const c = rookieCapturedLevel({ ...base, ageDelta: 1.85, rookieCeilingKnee: 15, rookieCeilingAsymptote: 20 });
    assert.ok(c.ceiledPPG < c.projectedPPGPre && c.ceiledPPG > 15);
    assert.equal(c.ceiledPPG, 15 + 5 * (1 - Math.exp(-(18.5 - 15) / 5)));
  });
});

describe('import graph', () => {
  test('(vii) lib/rookieCapturedLevel.mjs imports exactly ./projectionFactors.mjs', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib', 'rookieCapturedLevel.mjs'), 'utf8');
    const imports = [...src.matchAll(/^\s*import\s[^;]*?from\s+['"](\.[^'"]+)['"]/gm)].map(m => m[1]);
    assert.deepEqual(imports, ['./projectionFactors.mjs']);
  });
});
