/**
 * test/step4-mirror.test.mjs — versioned Step 4 regression bucket unit tests (D-17).
 *
 * lib/projectionFactors.mjs's resolveRegressionBucket/reconstructRegressionFactor
 * are pure (no I/O) — these tests exercise them directly. Part B (D-18,
 * step4-boundary-parity.md) appends T-S4-1..6 below, proving boundary 4
 * (app 7b5b055) against the real captures either side of it.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  resolveRegressionBucket, reconstructRegressionFactor,
  REGRESSION_MODELS, CURRENT_REGRESSION_MODEL, REGRESSION_UPSIDE_POSITIONS,
} from '../lib/projectionFactors.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

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
  function round1(x) { return Math.round(x * 10) / 10; }

  // Fix pass 1, item 3 — a test-local replica of lib/projectionFactors.mjs's
  // (unexported) sampleStdDev + consistency-score arithmetic, so "the band is
  // steady" is actually computed here rather than asserted by name.
  function sampleStdDev(values) {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
    return Math.sqrt(variance);
  }
  function bandOf(ppgs, meanPPG) {
    const sd = sampleStdDev(ppgs);
    const cv = sd / meanPPG;
    const score = Math.max(0, Math.min(100, 100 - cv * 100));
    const band = score >= 80 ? 'steady' : score >= 60 ? 'moderate' : 'erratic';
    return { score, band };
  }

  test('CV band is steady for [22,22,22,22,16] — ratio 0.769', () => {
    const ppgs = [22, 22, 22, 22, 16];
    const meanPPG = ppgs.reduce((a, b) => a + b, 0) / ppgs.length;
    assert.equal(round3(meanPPG), 20.8);
    const lastPPG = 16;
    const outlierRatio = lastPPG / meanPPG;
    assert.ok(Math.abs(outlierRatio - 0.769) < 1e-3);
    const { score, band } = bandOf(ppgs, meanPPG);
    assert.equal(round1(score), 87.1);
    assert.equal(band, 'steady');
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
    const { score, band } = bandOf(ppgs, meanPPG);
    assert.equal(round1(score), 86.0);
    assert.equal(band, 'steady');
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
    for (const position of ['QB', 'RB', 'WR', 'TE', undefined]) {
      const legacy = resolveRegressionBucket(0.9, { position, model: 'legacy' });
      assert.equal(legacy.regressionUpsideBasis, null);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// D-18 (step4-boundary-parity.md) — T-S4-1..6: boundary 4 parity against the
// real captures either side of app commit 7b5b055 (committed 2026-09-12T22:27Z).
// PRE = snapshots/2026-09-12.json (captured 2026-09-12T18:34:49.006Z, before
// the boundary). POST = snapshots/2026-09-13.json (captured
// 2026-09-13T18:52:36.415Z, the first committed capture carrying
// regressionUpsideBasis on veteran rows — precondition 2). POSITIONS =
// nfl/players-state/2026-09-12.json (weekly; newest dated <= POST).
//
// Fixture generator (reproduce with `node <this>` from the repo root;
// regenerate only if a newer qualifying capture supersedes 2026-09-13 per
// §2 of the task file — change PRE/POST/POSITIONS_DATE and the fixture name
// together if it does):
//
//   import fs from 'fs';
//   import path from 'path';
//   const REPO = process.cwd();
//   const PRE = '2026-09-12';
//   const POST = '2026-09-13';
//   const POSITIONS_DATE = '2026-09-12';
//   const OUT_DIR = path.join(REPO, 'test/fixtures/step4-boundary');
//   fs.mkdirSync(OUT_DIR, { recursive: true });
//   const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
//   const preSnap = readJson(path.join(REPO, `snapshots/${PRE}.json`));
//   const postSnap = readJson(path.join(REPO, `snapshots/${POST}.json`));
//   const posState = readJson(path.join(REPO, `nfl/players-state/${POSITIONS_DATE}.json`));
//   const F_KEYS = [
//     'regressionFactorRaw', 'regressionFactor', 'consistencyScale', 'consistencyScore',
//     'consistencyBand', 'basePPG', 'outlierRatio', 'regressionUpsideBasis',
//   ];
//   function slimSide(snap) {
//     const rows = {};
//     for (const [pid, p] of Object.entries(snap.players)) {
//       const proj = p.projection;
//       if (!proj) continue;
//       const factors = proj.factors || {};
//       const f = {};
//       for (const k of F_KEYS) if (factors[k] !== undefined) f[k] = factors[k];
//       rows[pid] = { confidence: proj.confidence, f };
//     }
//     return { date: snap.date, schemaVersion: snap.schemaVersion, capturedAt: snap.capturedAt, rows };
//   }
//   const pre = slimSide(preSnap);
//   const post = slimSide(postSnap);
//   const allPids = new Set([...Object.keys(pre.rows), ...Object.keys(post.rows)]);
//   const byPid = {};
//   for (const pid of allPids) {
//     const entry = posState.players[pid];
//     if (entry && entry.position) byPid[pid] = entry.position;
//   }
//   const out = {
//     boundary: { commit: '7b5b055', committedAt: '2026-09-12T22:27:00Z' },
//     pre, post,
//     positions: { date: POSITIONS_DATE, byPid },
//   };
//   fs.writeFileSync(path.join(OUT_DIR, `boundary-${PRE}-${POST}.slim.json`), JSON.stringify(out) + '\n');
//
const BOUNDARY_FIXTURE_PATH = path.join(REPO_ROOT, 'test/fixtures/step4-boundary/boundary-2026-09-12-2026-09-13.slim.json');

const NEAR = 5e-4;
const THRESHOLDS = [0.65, 0.85, 1.15, 1.35];
const round3 = (x) => Math.round(x * 1000) / 1000;
const isVeteranRow = (row) => row.confidence !== 'rookie';
const FOUR = new Set(['QB', 'RB', 'WR', 'TE']);
const nearThreshold = (ratio) => THRESHOLDS.some((t) => Math.abs(ratio - t) < NEAR);

describe('T-S4-1: fixture presence (asserted, never skipped)', () => {
  test('the boundary-4 parity fixture exists', () => {
    assert.ok(fs.existsSync(BOUNDARY_FIXTURE_PATH),
      'required fixture missing: test/fixtures/step4-boundary/boundary-2026-09-12-2026-09-13.slim.json');
  });
});

describe('T-S4-2..6: boundary parity', () => {
  const fixture = JSON.parse(fs.readFileSync(BOUNDARY_FIXTURE_PATH, 'utf8'));
  const { pre, post, positions, boundary } = fixture;

  test('T-S4-2: envelope — capture order and schema', () => {
    const preAt = Date.parse(pre.capturedAt);
    const boundaryAt = Date.parse(boundary.committedAt);
    const postAt = Date.parse(post.capturedAt);
    assert.ok(preAt < boundaryAt, 'pre.capturedAt must precede the boundary commit');
    assert.ok(boundaryAt < postAt, 'the boundary commit must precede post.capturedAt');
    assert.equal(pre.schemaVersion, 3);
    assert.equal(post.schemaVersion, 3);
  });

  describe('T-S4-3: D-18 detection rule on real rows', () => {
    const preRows = Object.values(pre.rows);
    const preVet = preRows.filter(isVeteranRow);
    const preRookie = preRows.filter((r) => !isVeteranRow(r));

    test('pre side', () => {
      assert.equal(preVet.length, 421);
      assert.equal(preRookie.length, 291);
      assert.equal(preVet.filter((r) => 'regressionUpsideBasis' in r.f).length, 0);
      assert.equal(preVet.filter((r) => 'outlierRatio' in r.f).length, 0);
    });

    const postRows = Object.values(post.rows);
    const postVet = postRows.filter(isVeteranRow);
    const postRookie = postRows.filter((r) => !isVeteranRow(r));

    test('post side', () => {
      assert.equal(postVet.length, 422);
      assert.equal(postRookie.length, 291);
      assert.equal(postVet.filter((r) => !('regressionUpsideBasis' in r.f) || !('outlierRatio' in r.f)).length, 0);
      assert.equal(postRookie.filter((r) => ('regressionUpsideBasis' in r.f) || ('outlierRatio' in r.f)).length, 0);

      const ALLOWED = new Set(['none', 'removed:RB', 'removed:WR', 'removed:TE', 'retained:QB']);
      const dist = { none: 0, 'removed:RB': 0, 'removed:WR': 0, 'removed:TE': 0, 'retained:QB': 0 };
      for (const row of postVet) {
        assert.ok(ALLOWED.has(row.f.regressionUpsideBasis), `unexpected basis value: ${row.f.regressionUpsideBasis}`);
        dist[row.f.regressionUpsideBasis]++;
      }
      assert.deepEqual(dist, { none: 252, 'removed:RB': 34, 'removed:WR': 73, 'removed:TE': 52, 'retained:QB': 11 });

      // §3.2 scope check: a presence-only rule would file every post rookie row as legacy.
      assert.ok(postRookie.filter((r) => !('regressionUpsideBasis' in r.f) && !('outlierRatio' in r.f)).length > 0);
    });

    test('cross-check against §0/§9.6 up-side population estimate (±5 per position)', () => {
      const dist = { removed: { RB: 0, WR: 0, TE: 0 }, 'retained:QB': 0 };
      for (const row of postVet) {
        const b = row.f.regressionUpsideBasis;
        if (b === 'removed:RB') dist.removed.RB++;
        else if (b === 'removed:WR') dist.removed.WR++;
        else if (b === 'removed:TE') dist.removed.TE++;
        else if (b === 'retained:QB') dist['retained:QB']++;
      }
      assert.ok(Math.abs(dist.removed.RB - 33) <= 5);
      assert.ok(Math.abs(dist.removed.WR - 73) <= 5);
      assert.ok(Math.abs(dist.removed.TE - 53) <= 5);
      assert.ok(Math.abs(dist['retained:QB'] - 11) <= 5);
    });
  });

  describe('T-S4-4: post side = step4-upside, exact', () => {
    let checked = 0;
    let failures = 0;
    let nearSkips = 0;
    let noPositionEntry = 0;
    let outsideFour = 0;
    let setMismatch = 0;
    let discrimination = 0;
    const failureDetails = [];

    for (const [pid, row] of Object.entries(post.rows)) {
      if (!isVeteranRow(row)) continue;
      const position = positions.byPid[pid];
      const outlierRatio = row.f.outlierRatio;
      if (position === undefined) { noPositionEntry++; continue; }
      if (!FOUR.has(position)) { outsideFour++; continue; }
      if (nearThreshold(outlierRatio)) { nearSkips++; continue; }
      checked++;

      const result = resolveRegressionBucket(outlierRatio, { position, model: 'step4-upside' });
      const matches = result.regressionFactorRaw === row.f.regressionFactorRaw
        && result.regressionUpsideBasis === row.f.regressionUpsideBasis;
      if (!matches) {
        failures++;
        failureDetails.push({ pid, position, expected: { regressionFactorRaw: row.f.regressionFactorRaw, regressionUpsideBasis: row.f.regressionUpsideBasis }, got: result });
      }

      const roundedFactor = round3(1 + (result.regressionFactorRaw - 1) * row.f.consistencyScale);
      if (roundedFactor !== row.f.regressionFactor) {
        failures++;
        failureDetails.push({ pid, position, reason: 'regressionFactor mismatch', expected: row.f.regressionFactor, got: roundedFactor });
      }

      // Discrimination: rows where legacy raw != captured (post) raw must be exactly the removed: rows.
      const legacy = resolveRegressionBucket(outlierRatio, { position, model: 'legacy' });
      const legacyDiffers = legacy.regressionFactorRaw !== row.f.regressionFactorRaw;
      const isRemoved = typeof row.f.regressionUpsideBasis === 'string' && row.f.regressionUpsideBasis.startsWith('removed:');
      if (legacyDiffers !== isRemoved) setMismatch++;
      if (legacyDiffers) discrimination++;
    }

    // A basis-suffix/position mismatch with a matching raw is a stop-and-report, never a pin (§3.2).
    test('failures are empty', () => {
      assert.equal(failures, 0, `T-S4-4 failures: ${JSON.stringify(failureDetails)}`);
    });

    test('discrimination set equals the removed: set', () => {
      assert.equal(setMismatch, 0);
    });

    test('pinned counts', () => {
      assert.equal(checked, 419);
      assert.equal(nearSkips, 2);
      assert.equal(noPositionEntry, 1);
      assert.equal(outsideFour, 0);
      assert.equal(discrimination, 159);
      assert.ok(discrimination > 0);
    });
  });

  describe('T-S4-5: pre side = legacy, exact', () => {
    let joined = 0;
    let guardFailures = 0;
    let checked = 0;
    let nearSkips = 0;
    let discrimination = 0;
    let assertionFailures = 0;
    const failureDetails = [];
    const GUARD_KEYS = ['basePPG', 'consistencyScore', 'consistencyBand', 'consistencyScale'];

    for (const pid of Object.keys(pre.rows)) {
      const preRow = pre.rows[pid];
      const postRow = post.rows[pid];
      if (!postRow) continue;
      if (!isVeteranRow(preRow) || !isVeteranRow(postRow)) continue;
      joined++;

      const guardOk = GUARD_KEYS.every((k) => preRow.f[k] === postRow.f[k]);
      if (!guardOk) { guardFailures++; continue; }

      const position = positions.byPid[pid];
      const outlierRatio = postRow.f.outlierRatio;
      if (position === undefined || !FOUR.has(position)) continue;
      if (nearThreshold(outlierRatio)) { nearSkips++; continue; }
      checked++;

      const result = resolveRegressionBucket(outlierRatio, { position, model: 'legacy' });
      if (result.regressionFactorRaw !== preRow.f.regressionFactorRaw || result.regressionUpsideBasis !== null) {
        assertionFailures++;
        failureDetails.push({ pid, position, expected: preRow.f.regressionFactorRaw, got: result });
      }
      const roundedFactor = round3(1 + (result.regressionFactorRaw - 1) * preRow.f.consistencyScale);
      if (roundedFactor !== preRow.f.regressionFactor) {
        assertionFailures++;
        failureDetails.push({ pid, position, reason: 'regressionFactor mismatch', expected: preRow.f.regressionFactor, got: roundedFactor });
      }

      const upside = resolveRegressionBucket(outlierRatio, { position, model: 'step4-upside' });
      if (upside.regressionFactorRaw !== preRow.f.regressionFactorRaw) discrimination++;
    }

    test('assertions hold on every checkable joined row', () => {
      assert.equal(assertionFailures, 0, `T-S4-5 failures: ${JSON.stringify(failureDetails)}`);
    });

    test('pinned counts', () => {
      assert.equal(joined, 421);
      assert.equal(guardFailures, 0);
      assert.equal(checked, 419);
      assert.equal(nearSkips, 2);
      assert.equal(discrimination, 159);
      assert.ok(discrimination > 0);
    });
  });

  describe('T-S4-6: the boundary moved exactly the removed rows', () => {
    let joined = 0;
    let guardFailures = 0;
    let members = 0;
    let setMismatch = 0;
    let memberBad = 0;
    let nonMemberChanged = 0;
    const GUARD_KEYS = ['basePPG', 'consistencyScore', 'consistencyBand', 'consistencyScale'];

    for (const pid of Object.keys(pre.rows)) {
      const preRow = pre.rows[pid];
      const postRow = post.rows[pid];
      if (!postRow) continue;
      if (!isVeteranRow(preRow) || !isVeteranRow(postRow)) continue;
      joined++;

      const guardOk = GUARD_KEYS.every((k) => preRow.f[k] === postRow.f[k]);
      if (!guardOk) { guardFailures++; continue; }

      const rawChanged = preRow.f.regressionFactorRaw !== postRow.f.regressionFactorRaw;
      const isRemoved = typeof postRow.f.regressionUpsideBasis === 'string' && postRow.f.regressionUpsideBasis.startsWith('removed:');
      if (rawChanged !== isRemoved) setMismatch++;

      if (isRemoved) {
        members++;
        const preOk = preRow.f.regressionFactorRaw === 1.05 || preRow.f.regressionFactorRaw === 1.12;
        const postOk = postRow.f.regressionFactorRaw === 1;
        if (!preOk || !postOk) memberBad++;
      } else if (preRow.f.regressionFactor !== postRow.f.regressionFactor) {
        // regressionFactor only — never widen to projectedPPG or to all factors (§1).
        nonMemberChanged++;
      }
    }

    test('the moved set equals the removed set; every member goes 1.05/1.12 -> 1; no non-member changed', () => {
      assert.equal(setMismatch, 0);
      assert.equal(memberBad, 0);
      assert.equal(nonMemberChanged, 0);
    });

    test('pinned counts', () => {
      assert.equal(joined, 421);
      assert.equal(guardFailures, 0);
      assert.equal(members, 159);
    });
  });
});
