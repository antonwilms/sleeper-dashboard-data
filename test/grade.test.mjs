/**
 * test/grade.test.mjs — Unit tests for lib/grade.mjs and the snapshot adapter.
 *
 * Run with: node --test  (or npm test)
 *
 * Coverage:
 *   A. Stat primitives: mae, bias, pearson
 *   B. scoreProjections on the fixture GradeInput
 *   C. Snapshot adapter: deriveTargetSeason, buildPositionMap
 */

import { test } from 'node:test';
import assert   from 'node:assert/strict';

import { mae, bias, pearson, scoreProjections } from '../lib/grade.mjs';
import { deriveTargetSeason, buildPositionMap, buildGradeInputFromSnapshot } from '../scripts/grade-snapshot.mjs';
import { readJson } from '../lib/io.mjs';

// ═══════════════════════════════════════════════════════════════════
// A. Stat primitives
// ═══════════════════════════════════════════════════════════════════

test('mae: [2, -3] → 2.5', () => {
  assert.equal(mae([2, -3]), 2.5);
});

test('mae: [] → null', () => {
  assert.equal(mae([]), null);
});

test('mae: null input → null', () => {
  assert.equal(mae(null), null);
});

test('bias: [2, -3] → -0.5', () => {
  assert.equal(bias([2, -3]), -0.5);
});

test('bias: [] → null', () => {
  assert.equal(bias([]), null);
});

test('pearson: perfect positive correlation', () => {
  const r = pearson([1, 2, 3], [2, 4, 6]);
  assert.ok(r !== null);
  assert.ok(Math.abs(r - 1) < 1e-10, `expected r ≈ 1, got ${r}`);
});

test('pearson: perfect negative correlation', () => {
  const r = pearson([1, 2, 3], [6, 4, 2]);
  assert.ok(r !== null);
  assert.ok(Math.abs(r + 1) < 1e-10, `expected r ≈ -1, got ${r}`);
});

test('pearson: zero variance in ys → null', () => {
  assert.equal(pearson([1, 2, 3], [5, 5, 5]), null);
});

test('pearson: n < 2 → null', () => {
  assert.equal(pearson([1], [2]), null);
});

test('pearson: empty arrays → null', () => {
  assert.equal(pearson([], []), null);
});

test('pearson: mismatched lengths → null', () => {
  assert.equal(pearson([1, 2], [1, 2, 3]), null);
});

// ═══════════════════════════════════════════════════════════════════
// B. scoreProjections on the fixture GradeInput
//
// Fixture: 5 players (QB/high, RB/high, RB/low, WR/medium-dnp, WR/rookie-absent)
// Expected metrics are hand-computed in grading-harness.md.
// ═══════════════════════════════════════════════════════════════════

function loadFixtureGradeInput() {
  const snapshot   = readJson('test/fixtures/grade-snapshot.json');
  const rawOutcomes = readJson('test/fixtures/grade-outcomes-2026.json');

  // Convert raw outcomes to Map<id, OutcomeRecord>
  const outcomes = new Map();
  for (const [id, rec] of Object.entries(rawOutcomes)) {
    const gp = rec.gamesPlayed ?? 0;
    const fp = rec.fantasyPoints ?? 0;
    outcomes.set(String(id), {
      actualGames:    gp,
      actualTotalPts: fp,
      actualPPG:      gp > 0 ? fp / gp : null,
      played:         gp > 0,
    });
  }

  return buildGradeInputFromSnapshot(snapshot, outcomes, {
    targetSeason: 2026,
    snapshotDate: 'fixture',
    source:       'test',
  });
}

test('scoreProjections: counts', () => {
  const report = scoreProjections(loadFixtureGradeInput());
  assert.equal(report.counts.projected, 5);
  assert.equal(report.counts.graded,    3);
  assert.equal(report.counts.dnp,       1);
  assert.equal(report.counts.absent,    1);
});

test('scoreProjections: byPosition.QB (p1 only)', () => {
  const { byPosition: { QB } } = scoreProjections(loadFixtureGradeInput());
  assert.equal(QB.n, 1);
  assert.ok(Math.abs(QB.maePPG  - 2.0) < 1e-10);
  assert.ok(Math.abs(QB.biasPPG - 2.0) < 1e-10);
});

test('scoreProjections: byPosition.RB (p2, p3)', () => {
  const { byPosition: { RB } } = scoreProjections(loadFixtureGradeInput());
  assert.equal(RB.n, 2);
  assert.ok(Math.abs(RB.maePPG  - 2.0) < 1e-10);
  assert.ok(Math.abs(RB.biasPPG - 2.0) < 1e-10);
});

test('scoreProjections: byConfidence.high (p1, p2)', () => {
  const { byConfidence: { high } } = scoreProjections(loadFixtureGradeInput());
  assert.equal(high.n, 2);
  assert.ok(Math.abs(high.maePPG  - 2.5) < 1e-10);
  assert.ok(Math.abs(high.biasPPG - 2.5) < 1e-10);
});

test('scoreProjections: byConfidence.low (p3)', () => {
  const { byConfidence: { low } } = scoreProjections(loadFixtureGradeInput());
  assert.equal(low.n, 1);
  assert.ok(Math.abs(low.maePPG  - 1.0) < 1e-10);
  assert.ok(Math.abs(low.biasPPG - 1.0) < 1e-10);
});

test('scoreProjections: byConfidence.medium (p4 dnp → n=0)', () => {
  const { byConfidence: { medium } } = scoreProjections(loadFixtureGradeInput());
  assert.equal(medium.n, 0);
  assert.equal(medium.maePPG, null);
});

test('scoreProjections: byConfidence.rookie (p5 absent → n=0)', () => {
  const { byConfidence: { rookie } } = scoreProjections(loadFixtureGradeInput());
  assert.equal(rookie.n, 0);
});

test('scoreProjections: calibration maeByBucket and monotonic=false', () => {
  const { calibration } = scoreProjections(loadFixtureGradeInput());
  assert.ok(Math.abs(calibration.maeByBucket.high - 2.5) < 1e-10);
  assert.equal(calibration.maeByBucket.medium, null);
  assert.ok(Math.abs(calibration.maeByBucket.low - 1.0) < 1e-10);
  assert.equal(calibration.monotonic, false);  // high=2.5 > low=1.0 — not monotonic
});

test('scoreProjections: games block (mae=0.5, bias=0, n=4)', () => {
  // p1: 16-16=0, p2: 14-15=-1, p3: 12-11=+1, p4 dnp: 0-0=0; p5 absent excluded
  const { games } = scoreProjections(loadFixtureGradeInput());
  assert.equal(games.n, 4);
  assert.ok(Math.abs(games.mae  - 0.5) < 1e-10);
  assert.ok(Math.abs(games.bias - 0)   < 1e-10);
});

test('scoreProjections: absent player (p5) excluded from all metrics', () => {
  const report = scoreProjections(loadFixtureGradeInput());
  // p5 is WR/rookie — absent counts incremented; no position/confidence data
  assert.equal(report.counts.absent, 1);
  assert.equal(report.byPosition.WR.n,   0);  // p4 is dnp, p5 absent → 0 graded WR
  assert.equal(report.byConfidence.rookie.n, 0);
});

test('scoreProjections: dnp player (p4) in counts but not PPG metrics', () => {
  const report = scoreProjections(loadFixtureGradeInput());
  assert.equal(report.counts.dnp, 1);
  // p4 is in the WR/medium bucket but not graded (dnp)
  assert.equal(report.byConfidence.medium.n, 0);
  // p4 IS in games block (projGames=0, actualGames=0)
  assert.equal(report.games.n, 4);
});

test('scoreProjections: factorDiagnostics — durabilityFactor (varies → r ≠ null)', () => {
  const { factorDiagnostics } = scoreProjections(loadFixtureGradeInput());
  const d = factorDiagnostics.find(x => x.factor === 'durabilityFactor');
  assert.ok(d !== undefined);
  assert.equal(d.n, 3);
  assert.ok(d.r !== null);
  assert.ok(typeof d.r === 'number' && d.r >= -1 && d.r <= 1);
  assert.ok(d.note.includes('low-n'));
});

test('scoreProjections: factorDiagnostics — regressionFactor (constant → r = null)', () => {
  // All three graded players have regressionFactor=1.0 → zero variance → r=null
  const { factorDiagnostics } = scoreProjections(loadFixtureGradeInput());
  const d = factorDiagnostics.find(x => x.factor === 'regressionFactor');
  assert.ok(d !== undefined);
  assert.equal(d.r, null);
});

test('scoreProjections: basis-mismatch regression — basisMatch=false adds caveat, games unchanged', () => {
  const input      = loadFixtureGradeInput();
  const baseReport = scoreProjections(input);

  const customInput = {
    ...input,
    meta: { ...input.meta, scoringBasis: 'custom', basisMatch: false },
  };
  const customReport = scoreProjections(customInput);

  assert.equal(customReport.meta.basisMatch, false);
  assert.ok(customReport.caveats.some(c => c.toLowerCase().includes('basis')));

  // games block must be identical — it is basis-independent
  assert.equal(customReport.games.mae,  baseReport.games.mae);
  assert.equal(customReport.games.bias, baseReport.games.bias);
  assert.equal(customReport.games.n,    baseReport.games.n);
});

// ═══════════════════════════════════════════════════════════════════
// C. Snapshot adapter
// ═══════════════════════════════════════════════════════════════════

test('deriveTargetSeason: May 2026 (offseason) → 2026', () => {
  assert.equal(deriveTargetSeason('2026-05-19T00:00:00.000Z'), 2026);
});

test('deriveTargetSeason: June 2026 → 2026', () => {
  assert.equal(deriveTargetSeason('2026-06-06T12:00:00.000Z'), 2026);
});

test('deriveTargetSeason: January 2026 → 2026', () => {
  assert.equal(deriveTargetSeason('2026-01-02T00:00:00.000Z'), 2026);
});

test('deriveTargetSeason: September 2026 (in-season) → 2027', () => {
  assert.equal(deriveTargetSeason('2026-09-15T00:00:00.000Z'), 2027);
});

test('deriveTargetSeason: December 2026 → 2027', () => {
  assert.equal(deriveTargetSeason('2026-12-01T00:00:00.000Z'), 2027);
});

test('buildPositionMap: resolves QB, RB, WR from teamDepthCharts', () => {
  const snapshot = {
    teamDepthCharts: {
      BUF: {
        QB: [{ playerId: '4984', fullName: 'Josh Allen', depthOrder: 1 }],
        RB: [{ playerId: '9509', fullName: 'James Cook', depthOrder: 1 }],
        WR: [],
        TE: [],
      },
      KC: {
        QB: [],
        RB: [],
        WR: [],
        TE: [{ playerId: '4866', fullName: 'Travis Kelce', depthOrder: 1 }],
      },
    },
  };
  const map = buildPositionMap(snapshot);
  assert.equal(map.get('4984'), 'QB');
  assert.equal(map.get('9509'), 'RB');
  assert.equal(map.get('4866'), 'TE');
  assert.equal(map.get('0000'), undefined);  // not in any chart
});

test('buildPositionMap: player absent from charts → undefined (adapter assigns UNK)', () => {
  const map = buildPositionMap({ teamDepthCharts: {} });
  assert.equal(map.size, 0);
});
