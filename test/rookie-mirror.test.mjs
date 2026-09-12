/**
 * test/rookie-mirror.test.mjs — CR-15 rookie-half mirror (rookie-mirror.md §7).
 *
 * T-RM1/T-RM3/T-RM4/T-RM5/T-RM6/T-RM7/T-RM8/T-RM11/T-RM12/T-RM13 live here.
 * T-RM2 lives in test/panel-fit.test.mjs beside the existing re-fit-trap guard
 * tests (rookie-mirror.md §6.9).
 *
 * T-RM9/T-RM10 (parity against a real 2026-09-12+ snapshot, §4/§7.3) are NOT
 * written here. Per rookie-mirror.md §4.4: "If no qualifying snapshot exists
 * when Session 2 runs, it lands §§2, 3, 5 and 6 and stops on §4, reporting
 * that explicitly rather than weakening it." As of this session,
 * `snapshots/2026-09-12.json` does not exist on origin/main (verified via
 * `git pull` immediately before implementation) — the first automated
 * capture carrying all three rookie mechanisms has not landed yet. §4 is
 * therefore blocked, not weakened into a skip or a hand-made fixture.
 *
 * `test/**` is deliberately NOT an entry point for T-RM1's import-graph walk
 * (below) — this file and test/panel-fit.test.mjs both import the mirror
 * directly (that is how §4/§7.3 and T-RM2/T-RM3/etc. work at all), and
 * including test/** as an entry point would make Assert 1 unsatisfiable by
 * construction.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  ROOKIE_CALIBRATION,
  ROOKIE_CEILING,
  ROOKIE_CORRECTIONS,
  resolveRookieCalibration,
  resolveRookieGames,
  applyRookieCeiling,
  reconstructShippedRookieProjection,
} from '../lib/rookieMirror.mjs';
import { assembleRookiePanel, PANEL_POSITIONS } from '../lib/panel.mjs';
import { runRookiePanels, buildRookieVerdictMarkdown } from '../scripts/panel-run.mjs';
import { runSelfTest } from '../scripts/grade-snapshot.mjs';
import { shouldSkipSnapshot } from '../scripts/register-snapshots.mjs';
import { readJson } from '../lib/io.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

// ═══════════════════════════════════════════════════════════════════════════
// T-RM1 — the fitting path cannot reach the mirror (§3.3)
// ═══════════════════════════════════════════════════════════════════════════

// Extracts relative import specifiers from `import ... from '...'`,
// `export ... from '...'` and dynamic `import('...')`. Bare specifiers and
// `node:` builtins never match (they don't start with '.').
function extractImportSpecifiers(source) {
  const specs = [];
  const fromRe = /\bfrom\s+['"](\.[^'"]+)['"]/g;
  const dynRe = /\bimport\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  const sideEffectRe = /^\s*import\s+['"](\.[^'"]+)['"]/gm;
  for (const re of [fromRe, dynRe, sideEffectRe]) {
    let m;
    while ((m = re.exec(source))) specs.push(m[1]);
  }
  return specs;
}

function resolveSpecifier(fromFileAbs, specifier) {
  const resolved = path.resolve(path.dirname(fromFileAbs), specifier);
  return path.relative(REPO_ROOT, resolved).split(path.sep).join('/');
}

// Static, no module execution. A specifier resolving to a missing file fails
// loudly (throws) rather than being silently skipped — a rename cannot empty
// the graph without this test noticing.
function walkImports(seedRelPaths) {
  const closure = new Set();
  const queue = [...seedRelPaths];
  while (queue.length) {
    const rel = queue.shift();
    if (closure.has(rel)) continue;
    closure.add(rel);
    const abs = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(abs)) {
      throw new Error(`[T-RM1] import graph walk resolved to a missing file: ${rel} (seeded from ${seedRelPaths.join(', ')})`);
    }
    const src = fs.readFileSync(abs, 'utf8');
    for (const spec of extractImportSpecifiers(src)) {
      queue.push(resolveSpecifier(abs, spec));
    }
  }
  return closure;
}

describe('T-RM1: the fitting path cannot reach lib/rookieMirror.mjs', () => {
  const FIT_ENTRY_POINTS = [
    'bin/panel.mjs',
    'scripts/panel-run.mjs',
    'lib/panel.mjs',
    'lib/backtest.mjs',
    'lib/projectionFactors.mjs',
  ];

  test('Assert 1: the full five-seed closure excludes lib/rookieMirror.mjs', () => {
    const closure = walkImports(FIT_ENTRY_POINTS);
    assert.ok(!closure.has('lib/rookieMirror.mjs'),
      'lib/rookieMirror.mjs must not be reachable from any fit-path entry point — ' +
      'a caller reaching it could re-fit on already-corrected predictions (rookie-mirror.md §3)');
  });

  test('Assert 2 (anti-vacuity, traversal-only): bin/panel.mjs alone reaches its known transitive set', () => {
    const closure = walkImports(['bin/panel.mjs']);
    // Direct (bin/panel.mjs:51-52)
    assert.ok(closure.has('scripts/panel-run.mjs'), 'bin/panel.mjs imports scripts/panel-run.mjs directly');
    assert.ok(closure.has('lib/panel.mjs'), 'bin/panel.mjs imports lib/panel.mjs directly');
    // Transitive-only — reachable only by walking scripts/panel-run.mjs's and
    // lib/panel.mjs's own imports, so this fails if the regex walker matched
    // nothing (a vacuous walker would pass Assert 1 for the wrong reason).
    assert.ok(closure.has('lib/projectionFactors.mjs'), 'transitively reachable via lib/panel.mjs');
    assert.ok(closure.has('lib/backtest.mjs'), 'transitively reachable via lib/panel.mjs');
    assert.ok(closure.has('lib/io.mjs'), 'transitively reachable via scripts/panel-run.mjs');
    assert.ok(closure.has('scripts/grade-snapshot.mjs'), 'transitively reachable via scripts/panel-run.mjs');
  });

  test('Assert 3: lib/rookieMirror.mjs\'s own closure contains lib/projectionFactors.mjs (the composition edge)', () => {
    const closure = walkImports(['lib/rookieMirror.mjs']);
    assert.ok(closure.has('lib/projectionFactors.mjs'),
      'the mirror must compose reconstructRookieProjection, not copy the uncorrected stack (rookie-mirror.md §2)');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §7.1 — T-RM3, T-RM4, T-RM14
// ═══════════════════════════════════════════════════════════════════════════

describe('T-RM3: the corrected predictor declares exactly what it applied', () => {
  test('undrafted WR — calibration + games fire, ceiling does not', () => {
    const r = reconstructShippedRookieProjection({
      position: 'WR', ageAtDraft: 22, draftRound: null, draftPick: null,
      draftCapitalStatus: 'undrafted', yearsExp: 0,
    });
    assert.deepEqual(r.appliedCorrections, ['rookieCalibration', 'rookieGames']);
    assert.equal(r.rookieCeilingBasis, 'none');
  });

  // Deviation from the task file's literal example, documented in the
  // hand-back: rookie-mirror.md §7.1 T-RM3 originally called for "a top-3 QB
  // ... (all three fire)", but §4.2's own Fix-pass-1 item 9 finding (no row
  // can carry both a calibration discount and a level above its knee)
  // structurally forbids this — ROOKIE_CALIBRATION only has undrafted/day3
  // entries, and neither group's nflDraftMultiplier is large enough to clear
  // any position's knee even at the calibrated level's maximum. A top-3 QB
  // (r1 tier) never gets a calibration entry at all (basis stays 'none'), so
  // it can only ever fire games + ceiling. This row exercises exactly that.
  test('top-3 QB — ceiling + games fire, calibration does not (r1 tier has no calibration entry)', () => {
    const r = reconstructShippedRookieProjection({
      position: 'QB', ageAtDraft: 21, draftRound: 1, draftPick: 1,
      draftCapitalStatus: 'matched', yearsExp: 0,
    });
    assert.ok(r.rookieCeilingPPGPre > 17.80, 'pre-ceiling level clears the QB knee');
    assert.equal(r.rookieCalibrationBasis, 'none');
    assert.deepEqual(r.appliedCorrections, ['rookieGames', 'rookieCeiling']);
  });

  test('day3 QB — calibration basis present at mult 1.00, does not declare', () => {
    const r = reconstructShippedRookieProjection({
      position: 'QB', ageAtDraft: 23, draftRound: 6, draftPick: 200,
      draftCapitalStatus: 'matched', yearsExp: 0,
    });
    assert.equal(r.rookieCalibrationBasis, 'day3:QB');
    assert.equal(r.rookieCalibrationMult, 1.00);
    assert.ok(!r.appliedCorrections.includes('rookieCalibration'),
      'day3:QB at mult 1.00 must not declare — mirrors the app\'s own adjustmentSummary gate');
  });

  test('appliedCorrections is frozen and a subset of ROOKIE_CORRECTIONS', () => {
    const r = reconstructShippedRookieProjection({
      position: 'RB', ageAtDraft: 22, draftRound: null, draftPick: null,
      draftCapitalStatus: 'undrafted', yearsExp: 0,
    });
    assert.ok(Object.isFrozen(r.appliedCorrections));
    for (const c of r.appliedCorrections) assert.ok(ROOKIE_CORRECTIONS.includes(c));
  });
});

describe('T-RM4: the panel stamp is present and empty (§3.2, provenance only)', () => {
  function minimalFixture() {
    return {
      totalsByYear: { 2020: { p1: { team: 'KC', gamesPlayed: 10, fantasyPoints: 70, stats: {} } } },
      ppgByYear: {
        2020: new Map([['p1', { actualPPG: 7, actualGames: 10, actualTotalPts: 70 }]]),
        2021: new Map([['p1', { actualPPG: 10, actualGames: 12, actualTotalPts: 120 }]]),
      },
      positionOf: () => 'WR',
      birthdateOf: () => '1998-01-01',
      draftInfoOf: () => ({ draftYear: 2020, draftRound: 3, draftPick: 70, undrafted: false }),
      fromYear: 2020, toYear: 2020,
    };
  }

  test('coverage.predictorCorrections is present and [] with the default (uncorrected) predictor', () => {
    const { coverage } = assembleRookiePanel(minimalFixture());
    assert.ok(Array.isArray(coverage.predictorCorrections));
    assert.deepEqual(coverage.predictorCorrections, []);
  });

  test('the stamp appears in the written panel JSON shape (structural check, no I/O)', () => {
    const { coverage } = assembleRookiePanel(minimalFixture());
    const serialized = JSON.parse(JSON.stringify({ coverage }));
    assert.deepEqual(serialized.coverage.predictorCorrections, []);
  });
});

describe('T-RM14: the two ROOKIE_CORRECTIONS copies agree', () => {
  test('every member of ROOKIE_CORRECTIONS appears as a literal in lib/panel.mjs\'s source text', () => {
    // Read as TEXT, never imported — importing lib/rookieMirror.mjs into an
    // assertion about lib/panel.mjs's own imports would be a different test
    // (and would not catch the case this one catches: the literal drifting
    // out of sync with the authoritative array).
    const panelSrc = fs.readFileSync(path.join(REPO_ROOT, 'lib/panel.mjs'), 'utf8');
    for (const token of ROOKIE_CORRECTIONS) {
      assert.ok(panelSrc.includes(token), `lib/panel.mjs must literally contain '${token}'`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §7.2 — T-RM5, T-RM6, T-RM7, T-RM8
// ═══════════════════════════════════════════════════════════════════════════

describe('T-RM5: resolveRookieCalibration — every cell plus the negatives', () => {
  test('all 8 populated cells', () => {
    for (const position of ['QB', 'RB', 'WR', 'TE']) {
      const undrafted = resolveRookieCalibration({ position, draftCapitalStatus: 'undrafted', nflDraftTier: null });
      assert.equal(undrafted.rookieCalibrationMult, ROOKIE_CALIBRATION.undrafted[position]);
      assert.equal(undrafted.rookieCalibrationBasis, `undrafted:${position}`);

      const day3 = resolveRookieCalibration({ position, draftCapitalStatus: 'matched', nflDraftTier: 'r4' });
      assert.equal(day3.rookieCalibrationMult, ROOKIE_CALIBRATION.day3[position]);
      assert.equal(day3.rookieCalibrationBasis, `day3:${position}`);
    }
  });

  test('day3:QB is basis-present at mult 1.00 (deliberate, not a negative)', () => {
    const r = resolveRookieCalibration({ position: 'QB', draftCapitalStatus: 'matched', nflDraftTier: 'r5' });
    assert.equal(r.rookieCalibrationMult, 1.00);
    assert.equal(r.rookieCalibrationBasis, 'day3:QB');
  });

  test('negatives: unknown status, r1/day2 tier, unrecognised position all fall to 1.00/none', () => {
    assert.deepEqual(
      resolveRookieCalibration({ position: 'QB', draftCapitalStatus: 'unknown', nflDraftTier: null }),
      { rookieCalibrationMult: 1.0, rookieCalibrationBasis: 'none' },
    );
    assert.deepEqual(
      resolveRookieCalibration({ position: 'RB', draftCapitalStatus: 'matched', nflDraftTier: 'top-8' }),
      { rookieCalibrationMult: 1.0, rookieCalibrationBasis: 'none' },
    );
    assert.deepEqual(
      resolveRookieCalibration({ position: 'WR', draftCapitalStatus: 'matched', nflDraftTier: 'r2' }),
      { rookieCalibrationMult: 1.0, rookieCalibrationBasis: 'none' },
    );
    assert.deepEqual(
      resolveRookieCalibration({ position: 'K', draftCapitalStatus: 'undrafted', nflDraftTier: null }),
      { rookieCalibrationMult: 1.0, rookieCalibrationBasis: 'none' },
    );
  });
});

describe('T-RM6: resolveRookieGames — all five rungs and first-hit-wins', () => {
  test('rung 1 (gpe) hit', () => {
    const r = resolveRookieGames({ position: 'WR', draftCapitalStatus: 'undrafted', nflDraftTier: null, yearsExp: 0 });
    assert.equal(r.rookieGamesBasis, 'gpe:undrafted|WR|0');
    assert.equal(r.projectedGames, Math.round(2.8));
  });

  test('r1|1 falls through rung 1 AND rung 2 (both absent) to rung 3 gp:r1|QB — never backfilled from rung-2 r1|0', () => {
    const r = resolveRookieGames({ position: 'QB', draftCapitalStatus: 'matched', nflDraftTier: 'top-3', yearsExp: 1 });
    assert.equal(r.rookieGamesBasis, 'gp:r1|QB');
    assert.equal(r.projectedGames, Math.round(10.5));
    assert.notEqual(r.projectedGames, Math.round(12.8), 'must not fall back to r1|0\'s rung-2 value');
  });

  test('a g: (rung 4) fall-through', () => {
    // Rung 3 (gp) is fully populated for all 16 real group x position cells
    // (the app's own comment: "floor n >= 10, all 16 clear it"), so rung 4
    // is unreachable for any of QB/RB/WR/TE. It IS reachable when a group
    // resolves (draftCapitalStatus + tier) but the position falls outside
    // the four gp keys AND expBucket is null (so rungs 1-2, which require
    // expBucket, are skipped too) — landing on the group-pooled rung 4 value.
    const r = resolveRookieGames({ position: 'K', draftCapitalStatus: 'matched', nflDraftTier: 'top-3', yearsExp: null });
    assert.equal(r.rookieGamesBasis, 'g:r1');
    assert.equal(r.projectedGames, Math.round(12.2));
  });

  test('the unknown ladder (rung U), with and without a bucket', () => {
    const withBucket = resolveRookieGames({ position: 'RB', draftCapitalStatus: 'unknown', nflDraftTier: null, yearsExp: 1 });
    assert.equal(withBucket.rookieGamesBasis, 'u:RB|1');
    assert.equal(withBucket.projectedGames, Math.round(3.0));

    const withoutBucket = resolveRookieGames({ position: 'RB', draftCapitalStatus: 'unknown', nflDraftTier: null, yearsExp: null });
    assert.equal(withoutBucket.rookieGamesBasis, 'u:RB');
    assert.equal(withoutBucket.projectedGames, Math.round(5.9));
  });

  test('a row with no resolvable group at all falls to the flat default', () => {
    const r = resolveRookieGames({ position: 'K', draftCapitalStatus: 'unknown', nflDraftTier: null, yearsExp: 0 });
    assert.equal(r.rookieGamesBasis, 'default');
    assert.equal(r.projectedGames, 14);
  });

  test('NO FLOOR AT 8 — day3|QB|0 returns 2, not clamped up to a veteran-style floor', () => {
    const r = resolveRookieGames({ position: 'QB', draftCapitalStatus: 'matched', nflDraftTier: 'r4', yearsExp: 0 });
    assert.equal(r.rookieGamesBasis, 'gpe:day3|QB|0');
    assert.equal(r.projectedGames, 2, 'copying the veteran floor would erase slice 2\'s entire finding');
  });

  test('yearsExp of null yields a null bucket and skips rungs 1-2 for a matched row', () => {
    const r = resolveRookieGames({ position: 'RB', draftCapitalStatus: 'matched', nflDraftTier: 'r2', yearsExp: null });
    assert.equal(r.rookieGamesBasis, 'gp:day2|RB');
    assert.equal(r.projectedGames, Math.round(10.8));
  });

  test('clamp to [0, 17] and Math.round', () => {
    const r = resolveRookieGames({ position: 'QB', draftCapitalStatus: 'matched', nflDraftTier: 'r1-mid', yearsExp: 0 });
    assert.ok(r.projectedGames >= 0 && r.projectedGames <= 17);
    assert.equal(r.projectedGames, Math.round(11.5));
  });
});

describe('T-RM7: applyRookieCeiling — the closed form and its branches', () => {
  for (const position of PANEL_POSITIONS) {
    const { knee, asymptote } = ROOKIE_CEILING[position];

    test(`${position}: identity below, at, and the closed form above the knee`, () => {
      const below = applyRookieCeiling({ position, projectedPPG: knee - 1 });
      assert.equal(below.ceiledPPG, knee - 1);
      assert.equal(below.rookieCeilingBasis, 'none');
      assert.equal(below.rookieCeilingKnee, knee);
      assert.equal(below.rookieCeilingAsymptote, asymptote);

      const at = applyRookieCeiling({ position, projectedPPG: knee });
      assert.equal(at.ceiledPPG, knee);
      assert.equal(at.rookieCeilingBasis, 'none');

      const justAbovePPG = knee + 0.01;
      const justAbove = applyRookieCeiling({ position, projectedPPG: justAbovePPG });
      assert.equal(justAbove.rookieCeilingBasis, `ceiling:${position}`);
      const expectedJustAbove = knee + (asymptote - knee) * (1 - Math.exp(-(justAbovePPG - knee) / (asymptote - knee)));
      assert.equal(justAbove.ceiledPPG, expectedJustAbove);

      const farAbovePPG = knee + 20;
      const farAbove = applyRookieCeiling({ position, projectedPPG: farAbovePPG });
      const expectedFarAbove = knee + (asymptote - knee) * (1 - Math.exp(-(farAbovePPG - knee) / (asymptote - knee)));
      assert.equal(farAbove.ceiledPPG, expectedFarAbove);
      assert.ok(farAbove.ceiledPPG < asymptote, 'strictly below the asymptote');
    });

    test(`${position}: strictly increasing and strictly below the asymptote across a swept range`, () => {
      let prev = -Infinity;
      for (let level = knee - 5; level <= knee + 100; level += 0.5) {
        const { ceiledPPG } = applyRookieCeiling({ position, projectedPPG: level });
        assert.ok(ceiledPPG > prev, `monotonic at level=${level}`);
        assert.ok(ceiledPPG < asymptote || level <= knee, `strictly below asymptote at level=${level}`);
        prev = ceiledPPG;
      }
    });
  }

  test('unrecognised position: none, with null knee/asymptote, level passes through', () => {
    const r = applyRookieCeiling({ position: 'K', projectedPPG: 99 });
    assert.equal(r.ceiledPPG, 99);
    assert.equal(r.rookieCeilingBasis, 'none');
    assert.equal(r.rookieCeilingKnee, null);
    assert.equal(r.rookieCeilingAsymptote, null);
  });

  test('non-finite level passes through unchanged', () => {
    const r = applyRookieCeiling({ position: 'QB', projectedPPG: NaN });
    assert.ok(Number.isNaN(r.ceiledPPG));
    assert.equal(r.rookieCeilingBasis, 'none');
  });
});

describe('T-RM8: ordering is load-bearing (calibration inside, ceiling on the finished level)', () => {
  // Direct unit call, not a row through the composed mirror: per Fix pass 1
  // item 9, with ktcMult/collegeContribution pinned at 1.0 (as
  // reconstructRookieProjection always holds them), no day3 non-QB row can
  // reach its knee and no row can carry both a calibration discount and a
  // level above its knee — so the ordering seam is unreachable through the
  // composed mirror on any real synthetic row and must be exercised by
  // calling the pieces directly with a synthetic pre-calibration level and a
  // synthetic cappedProduct (rookie-mirror.md §4.2 item 4 / §7.2 T-RM8).
  test('calibration-then-ceiling (correct) differs observably from ceiling-then-calibration (wrong)', () => {
    const position = 'QB';
    const baseline = 13; // ROOKIE_BASELINE_PPG.QB
    const cappedProduct = 1.85; // ROOKIE_MULTIPLIER_CLAMP upper bound
    const calibrationMult = ROOKIE_CALIBRATION.undrafted.QB; // 0.67

    const preCalibrationLevel = baseline * cappedProduct; // 24.05, clears the QB knee (17.80)

    // Correct order: calibrate first, THEN ceiling on the finished level.
    const calibratedLevel = Math.max(0, Math.min(40, baseline * cappedProduct * calibrationMult));
    const correctOrder = applyRookieCeiling({ position, projectedPPG: calibratedLevel });

    // Wrong order: ceiling first (on the uncalibrated level), THEN calibrate.
    const ceiledFirst = applyRookieCeiling({ position, projectedPPG: preCalibrationLevel });
    const wrongOrderLevel = ceiledFirst.ceiledPPG * calibrationMult;

    assert.notEqual(correctOrder.ceiledPPG, wrongOrderLevel,
      'the two orderings must diverge on this synthetic row, or the seam proves nothing');
    // State the numbers explicitly, per the task file's own requirement.
    assert.ok(Math.abs(correctOrder.ceiledPPG - 16.11) < 0.01,
      `correct order (calibration-then-ceiling) ≈ 16.11, got ${correctOrder.ceiledPPG}`);
    assert.ok(Math.abs(wrongOrderLevel - 14.08) < 0.01,
      `wrong order (ceiling-then-calibration) ≈ 14.08, got ${wrongOrderLevel}`);
    // Below its knee once calibrated, so the correct order's ceiling never fires.
    assert.equal(correctOrder.rookieCeilingBasis, 'none');
    // The wrong order's intermediate step DID fire the ceiling — that's the bug this seam catches.
    assert.equal(ceiledFirst.rookieCeilingBasis, 'ceiling:QB');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §7.4 — T-RM11, T-RM12
// ═══════════════════════════════════════════════════════════════════════════

describe('T-RM11: the eight ceiling quantiles re-derive from the committed panel (D-14)', () => {
  const artifact = readJson('backtests/2026-09-11-rookie-panel.json');

  function quantile(sortedValues, p) {
    const n = sortedValues.length;
    const idx = p * (n - 1);
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    if (lo === hi) return sortedValues[lo];
    return sortedValues[lo] + (sortedValues[hi] - sortedValues[lo]) * (idx - lo);
  }

  function gatedValuesByPosition() {
    const byPos = { QB: [], RB: [], WR: [], TE: [] };
    for (const row of artifact.debut.rows) {
      if (row.outcomeGames >= 8 && row.outcomePPG != null && byPos[row.position]) {
        byPos[row.position].push(row.outcomePPG);
      }
    }
    for (const pos of Object.keys(byPos)) byPos[pos].sort((a, b) => a - b);
    return byPos;
  }

  test('exactly C5\'s table — n, p90, p99, and the 873 gated total', () => {
    const byPos = gatedValuesByPosition();
    const EXPECTED = {
      QB: { n: 50, p90: 17.80, p99: 21.90 },
      RB: { n: 281, p90: 12.11, p99: 16.87 },
      WR: { n: 366, p90: 9.87, p99: 14.38 },
      TE: { n: 176, p90: 6.21, p99: 11.60 },
    };
    let total = 0;
    for (const [pos, exp] of Object.entries(EXPECTED)) {
      const values = byPos[pos];
      assert.equal(values.length, exp.n, `${pos} n`);
      total += values.length;
      assert.equal(Math.round(quantile(values, 0.90) * 100) / 100, exp.p90, `${pos} p90`);
      assert.equal(Math.round(quantile(values, 0.99) * 100) / 100, exp.p99, `${pos} p99`);
      // Also confirm exact equality against the shipped mirror constants.
      assert.equal(exp.p90, ROOKIE_CEILING[pos].knee);
      assert.equal(exp.p99, ROOKIE_CEILING[pos].asymptote);
    }
    assert.equal(total, 873, 'gated total across all four positions');
  });

  test('the gate is >= 8, not > 8', () => {
    const eightGameRows = artifact.debut.rows.filter(r => r.outcomeGames === 8 && r.outcomePPG != null);
    assert.ok(eightGameRows.length > 0, 'sanity: at least one row at exactly 8 games exists');
    const byPos = gatedValuesByPosition();
    for (const row of eightGameRows) {
      assert.ok(byPos[row.position]?.includes(row.outcomePPG), 'an outcomeGames===8 row is included in the gated population');
    }
  });

  test('the quantile index is p*(n-1), zero-based — the QB p99 worked example', () => {
    const values = gatedValuesByPosition().QB;
    assert.equal(values.length, 50);
    const idx = 0.99 * 49; // 48.51
    assert.equal(idx, 48.51);
    const interpolated = values[48] + (values[49] - values[48]) * 0.51;
    assert.equal(Math.round(interpolated * 100) / 100, 21.90);
  });
});

describe('T-RM12: the runRookiePanels ceiling block\'s shape and provenance', () => {
  const result = runRookiePanels({});

  test('a ceiling block with observed/expected/delta/match per position; expected names 41f277e', () => {
    assert.ok(result.ceiling);
    assert.equal(result.ceiling.expectedCommit, '41f277e');
    for (const position of ['QB', 'RB', 'WR', 'TE']) {
      assert.ok(result.ceiling.observed[position]);
      assert.ok(result.ceiling.expected[position]);
      assert.ok(result.ceiling.delta[position]);
      assert.equal(typeof result.ceiling.match[position], 'boolean');
      assert.deepEqual(result.ceiling.expected[position], ROOKIE_CEILING[position]);
    }
    // No assertion that match is true anywhere in this suite — §5's own rule.
  });

  test('§G of the rendered verdict contains the eight numbers and the re-derivation-is-not-validation sentence', () => {
    const md = buildRookieVerdictMarkdown(result);
    assert.ok(md.includes('§G'));
    for (const position of ['QB', 'RB', 'WR', 'TE']) {
      const { knee, asymptote } = ROOKIE_CEILING[position];
      assert.ok(md.includes(String(knee)), `§G renders ${position} knee ${knee}`);
      assert.ok(md.includes(String(asymptote)), `§G renders ${position} asymptote ${asymptote}`);
    }
    assert.ok(md.toLowerCase().includes('re-derivation'), '§G states the re-derivation-is-not-validation limit');
    assert.ok(md.includes('41f277e'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §7.4 — T-RM13 (D-6 residue: the v3 fixture)
// ═══════════════════════════════════════════════════════════════════════════

describe('T-RM13: D-6\'s v3 fixture is wired in', () => {
  test('fixture presence is asserted explicitly, not skipped', () => {
    assert.ok(fs.existsSync(path.join(REPO_ROOT, 'test/fixtures/grade-snapshot-v3.json')),
      'required D-6 v3 fixture missing: test/fixtures/grade-snapshot-v3.json');
  });

  test('(a) runSelfTest\'s v3 path runs and produces the fixture\'s hardcoded expected grades', () => {
    // runSelfTest throws on any mismatch and logs on success; a clean run IS
    // the assertion that the grader is schema-version-agnostic in fact.
    assert.doesNotThrow(() => runSelfTest());
  });

  test('(b) shouldSkipSnapshot accepts schemaVersion 3, asserted against the exported function directly', () => {
    assert.equal(shouldSkipSnapshot({ recordCount: 5, schemaVersion: 3 }, 5, 3), true);
    assert.equal(shouldSkipSnapshot({ recordCount: 5, schemaVersion: 2 }, 5, 3), false);
    assert.equal(shouldSkipSnapshot(null, 5, 3), false);
  });
});
