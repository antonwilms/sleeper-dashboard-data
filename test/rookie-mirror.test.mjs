/**
 * test/rookie-mirror.test.mjs — CR-15 rookie-half mirror (rookie-mirror.md §7).
 *
 * T-RM1/T-RM3/T-RM4/T-RM5/T-RM6/T-RM7/T-RM8/T-RM9/T-RM10/T-RM11/T-RM12/T-RM13
 * live here. T-RM2 lives in test/panel-fit.test.mjs beside the existing
 * re-fit-trap guard tests (rookie-mirror.md §6.9).
 *
 * T-RM9/T-RM10 (parity against a real 2026-09-12+ snapshot, §4/§7.3) were
 * blocked at first implementation — `snapshots/2026-09-12.json` did not yet
 * exist on origin/main (rookie-mirror.md §4.4's sequencing constraint). It
 * has since landed on origin/main at 8970229 (capturedAt
 * 2026-09-12T18:34:49.006Z, schemaVersion 3, 712 players, 291 rookie-path
 * rows, all carrying rookieCalibrationBasis/rookieGamesBasis/rookieCeilingBasis,
 * the ceiling firing on 19 of them) — verified directly against the snapshot,
 * not assumed — so §4 is unblocked and this section now lands as specified.
 * The parity fixture is
 * test/fixtures/rookie-mirror-parity/snapshot-2026-09-12.slim.json.
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
import { ROOKIE_BASELINE_PPG } from '../lib/projectionFactors.mjs';
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
// §7.3 — T-RM9, T-RM10: parity against the real 2026-09-12 snapshot (§4)
// ═══════════════════════════════════════════════════════════════════════════
//
// Fixture generator (reproduce with `node <this>` from the repo root;
// regenerate only if a newer qualifying capture supersedes 2026-09-12 per
// §4.4 — change the fixture name in this one place if it does):
//
//   import fs from 'fs';
//   import path from 'path';
//   const REPO = process.cwd();
//   const OUT_DIR = path.join(REPO, 'test/fixtures/rookie-mirror-parity');
//   fs.mkdirSync(OUT_DIR, { recursive: true });
//   const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
//   const snapshot = readJson(path.join(REPO, 'snapshots/2026-09-12.json'));
//   // The rookie keys this parity test needs: the two recovery inputs
//   // (basePPG, rookieCeilingKnee), the two mirror-input fields captured
//   // verbatim (draftCapitalStatus, nflDraftTier), and every rookie* output.
//   const ROOKIE_FACTOR_KEYS = [
//     'basePPG', 'draftCapitalStatus', 'nflDraftTier',
//     'rookieCalibrationMult', 'rookieCalibrationBasis', 'rookieGamesBasis',
//     'rookieCeilingBasis', 'rookieCeilingKnee', 'rookieCeilingAsymptote',
//     'rookieCeilingPPGPre',
//   ];
//   function slimFactors(factors) {
//     const s = {};
//     for (const k of ROOKIE_FACTOR_KEYS) if (factors[k] !== undefined) s[k] = factors[k];
//     return s;
//   }
//   const slim = {
//     schemaVersion: snapshot.schemaVersion, capturedAt: snapshot.capturedAt,
//     targetSeason: snapshot.targetSeason, currentSeason: snapshot.currentSeason,
//     players: {},
//   };
//   for (const [pid, p] of Object.entries(snapshot.players)) {
//     const proj = p.projection;
//     if (proj && proj.confidence === 'rookie') {
//       slim.players[pid] = { projection: {
//         projectedPPG: proj.projectedPPG, projectedGames: proj.projectedGames,
//         projectedTotalPts: proj.projectedTotalPts, factors: slimFactors(proj.factors || {}),
//       } };
//     }
//   }
//   fs.writeFileSync(path.join(OUT_DIR, 'snapshot-2026-09-12.slim.json'), JSON.stringify(slim, null, 2) + '\n');
//
// What this proves and what it does not (§4.2, stated here rather than
// implied): this asserts MECHANISM PARITY on captured inputs, exact for
// calibration and games, and exact-to-capture-rounding for the ceiling and
// total points — never end-to-end level parity. ktc/college are never
// reconstructed here; they enter only rookieMultiplierProduct, upstream of
// all three mechanisms, and rookieCeilingPPGPre is captured *after* they have
// done their work, so each mechanism is a pure function of fields the
// snapshot already carries. Historical rookie projectedPPG parity remains out
// of reach (KTC history starts 2026-05-18; computeCollegeMetrics is unported).
// The ordering seam (calibration -> ceiling -> games) is verified elsewhere:
// exactly at direct-call precision by T-RM8's synthetic levels, and only to
// within capture rounding here, on the 19 rows where the ceiling fires — see
// the per-row total-points assertion below.
const PARITY_FIXTURE_PATH = path.join(REPO_ROOT, 'test/fixtures/rookie-mirror-parity/snapshot-2026-09-12.slim.json');

describe('T-RM9: fixture presence (§4.4 — presence is asserted, never skipped)', () => {
  test('the 2026-09-12 slim parity fixture exists', () => {
    assert.ok(fs.existsSync(PARITY_FIXTURE_PATH),
      'required parity fixture missing: test/fixtures/rookie-mirror-parity/snapshot-2026-09-12.slim.json');
  });
});

describe('T-RM10: rookie mechanism parity, exact on captured inputs', () => {
  const fixture = JSON.parse(fs.readFileSync(PARITY_FIXTURE_PATH, 'utf8'));

  const BASEPPG_TO_POSITION = Object.fromEntries(Object.entries(ROOKIE_BASELINE_PPG).map(([pos, v]) => [v, pos]));
  const KNEE_TO_POSITION = Object.fromEntries(Object.entries(ROOKIE_CEILING).map(([pos, c]) => [c.knee, pos]));

  // §4.3 — position recovery: basePPG is the primary signal (13/9/7/5 ->
  // QB/RB/WR/TE). Its one collision — an unrecognised position also defaults
  // to the WR baseline of 7 (ROOKIE_BASELINE_PPG[position] ?? 7) — is broken
  // by rookieCeilingKnee, which applyRookieCeiling returns as null for
  // exactly those rows (no ROOKIE_CEILING entry). A row whose knee is null is
  // counted and skipped, never silently dropped.
  function recoverPosition(factors) {
    const pos = BASEPPG_TO_POSITION[factors.basePPG];
    if (pos == null) return null;
    if (pos === 'WR') return factors.rookieCeilingKnee === ROOKIE_CEILING.WR.knee ? 'WR' : null;
    return pos;
  }

  // §4.3 — experience-bucket recovery: resolveRookieGames consumes yearsExp
  // only through expBucket, so replaying a REPRESENTATIVE value that maps to
  // the same bucket ('0'->0, '1'->1, '2+'->2) is exact, not a fudge — this is
  // only possible because the captured basis string itself names the bucket
  // it used. A basis with no bucket segment (gp:<group>|<position>,
  // g:<group>, u:<position> or 'default') means rungs 1-2 never fired for
  // this row regardless of its true yearsExp — passing yearsExp: null
  // reproduces the identical rung-3/rung-4/rung-U-pooled/default path exactly
  // (those rungs read group and position only, never expBucket). Per §4.2's
  // "what it cannot prove" item 2, the true yearsExp is not captured and the
  // *selection* (why rungs 1-2 missed) cannot be replayed for these rows —
  // only value agreement, which is what this achieves.
  function bucketFromBasis(basis) {
    if (basis === 'default') return null;
    const parts = basis.split(':')[1]?.split('|') ?? [];
    const last = parts[parts.length - 1];
    return (last === '0' || last === '1' || last === '2+') ? last : null;
  }
  const BUCKET_TO_REPRESENTATIVE_YEARS_EXP = { '0': 0, '1': 1, '2+': 2 };

  const rows = Object.entries(fixture.players);
  let checked = 0;
  let positionOutsideFour = 0;
  let bucketless = 0;
  let ceilingLevelExactCount = 0;
  let ceilingNearKneeSkipCount = 0;
  let totalPtsExactCount = 0;
  const calibrationFailures = [];
  const calibrationNoneMultFailures = [];
  const gamesFailures = [];
  const ceilingLevelFailures = [];
  const ceilingBasisFailures = [];
  const kneeAsymptoteFailures = [];
  const totalPtsFailures = [];

  for (const [pid, p] of rows) {
    const { factors, projectedPPG, projectedGames, projectedTotalPts } = p.projection;
    const position = recoverPosition(factors);
    if (position == null) { positionOutsideFour++; continue; }
    checked++;

    // Calibration — captured to 3dp; exact.
    const calib = resolveRookieCalibration({
      position, draftCapitalStatus: factors.draftCapitalStatus, nflDraftTier: factors.nflDraftTier,
    });
    const capturedMult3dp = Math.round(factors.rookieCalibrationMult * 1000) / 1000;
    const mirrorMult3dp = Math.round(calib.rookieCalibrationMult * 1000) / 1000;
    if (mirrorMult3dp !== capturedMult3dp || calib.rookieCalibrationBasis !== factors.rookieCalibrationBasis) {
      calibrationFailures.push({ pid, position, mirror: calib, captured: { mult: factors.rookieCalibrationMult, basis: factors.rookieCalibrationBasis } });
    }
    // Edge case: rookieCalibrationBasis 'none' still carries mult exactly 1.00.
    if (factors.rookieCalibrationBasis === 'none' && factors.rookieCalibrationMult !== 1.00) {
      calibrationNoneMultFailures.push({ pid, mult: factors.rookieCalibrationMult });
    }

    // Games — bucketed rows replayed exactly; bucket-less rows value-checked
    // with yearsExp: null (§4.3's reasoning above).
    const bucket = bucketFromBasis(factors.rookieGamesBasis);
    if (bucket == null) bucketless++;
    const yearsExp = bucket == null ? null : BUCKET_TO_REPRESENTATIVE_YEARS_EXP[bucket];
    const games = resolveRookieGames({
      position, draftCapitalStatus: factors.draftCapitalStatus, nflDraftTier: factors.nflDraftTier, yearsExp,
    });
    if (games.projectedGames !== projectedGames || games.rookieGamesBasis !== factors.rookieGamesBasis) {
      gamesFailures.push({ pid, position, bucket, mirror: games, captured: { projectedGames, rookieGamesBasis: factors.rookieGamesBasis } });
    }

    // Ceiling — level to within capture-precision rounding (Fix pass 1 item
    // 11); basis exact outside the 5e-4 near-knee band; knee/asymptote exact
    // always (the app-constant drift guard, §5).
    const ceiling = applyRookieCeiling({ position, projectedPPG: factors.rookieCeilingPPGPre });
    const roundedLevel = Math.round(ceiling.ceiledPPG * 10) / 10;
    const levelDiff = Math.abs(roundedLevel - projectedPPG);
    if (levelDiff === 0) ceilingLevelExactCount++;
    if (levelDiff > 0.1 + 1e-9) {
      ceilingLevelFailures.push({ pid, position, roundedLevel, projectedPPG, levelDiff });
    }

    const knee = factors.rookieCeilingKnee;
    const nearKnee = knee != null && Math.abs(factors.rookieCeilingPPGPre - knee) <= 5e-4;
    if (nearKnee) {
      ceilingNearKneeSkipCount++;
    } else if (ceiling.rookieCeilingBasis !== factors.rookieCeilingBasis) {
      ceilingBasisFailures.push({ pid, position, mirror: ceiling.rookieCeilingBasis, captured: factors.rookieCeilingBasis });
    }
    if (ceiling.rookieCeilingKnee !== factors.rookieCeilingKnee || ceiling.rookieCeilingAsymptote !== factors.rookieCeilingAsymptote) {
      kneeAsymptoteFailures.push({ pid, position, mirror: ceiling, captured: factors });
    }

    // Total points — item 1's two-seam finding: exact only to within capture
    // rounding, and only meaningfully live on the rows where the ceiling
    // fires (the wrong order diverges by (pre-ceiled)*games there, far above
    // rounding noise; on inert rows both orders agree so this seam is silent
    // there by construction, not by this test's design).
    const roundedTotal = Math.round(ceiling.ceiledPPG * projectedGames * 10) / 10;
    const totalDiff = Math.abs(roundedTotal - projectedTotalPts);
    if (totalDiff === 0) totalPtsExactCount++;
    if (totalDiff > 0.1 + 1e-9) {
      totalPtsFailures.push({ pid, position, roundedTotal, projectedTotalPts, totalDiff });
    }
  }

  test('position-recovery maps (basePPG, ceiling knee) are each injective', () => {
    const baseValues = Object.values(BASEPPG_TO_POSITION);
    assert.equal(new Set(baseValues).size, baseValues.length,
      'ROOKIE_BASELINE_PPG values must be injective for basePPG-based recovery to be unambiguous');
    const kneeValues = Object.values(KNEE_TO_POSITION);
    assert.equal(new Set(kneeValues).size, kneeValues.length,
      'ROOKIE_CEILING knees must be injective for knee-based disambiguation to be unambiguous');
  });

  test('a non-zero row count was checked, and the fixture size is pinned (no vacuous pass)', () => {
    assert.equal(rows.length, 291, 'pinned: observed row count of the 2026-09-12 slim fixture');
    assert.ok(checked > 0, 'at least one row must be recoverable and checked');
    assert.equal(positionOutsideFour, 0,
      'pinned: no rookie-path row in this capture falls outside the four panel positions — a row with rookieCeilingKnee: null would count here rather than being silently dropped');
  });

  test('resolveRookieCalibration matches every row exactly (captured to 3dp)', () => {
    assert.deepEqual(calibrationFailures, []);
    assert.deepEqual(calibrationNoneMultFailures, [],
      'a row with rookieCalibrationBasis "none" must still carry multiplier exactly 1.00');
  });

  test('resolveRookieGames matches every row exactly; bucket-less-row count is pinned (§4.2 item 2 — selection cannot be replayed for these, only value agreement)', () => {
    assert.deepEqual(gamesFailures, []);
    assert.equal(bucketless, 10,
      'pinned: rows whose rookieGamesBasis carries no experience bucket (gp:/g:/u:<pos>/default) — a change in the rung mix must move this number');
  });

  test('applyRookieCeiling: level matches to within capture-precision rounding; exact-match count pinned (Fix pass 1 item 11 — a documented residual, not a tolerance chosen to pass)', () => {
    assert.deepEqual(ceilingLevelFailures, []);
    assert.equal(ceilingLevelExactCount, 290, 'pinned exact-match count — a real divergence moves this number');
  });

  test('applyRookieCeiling: basis matches exactly outside the 5e-4 near-knee band; band count pinned', () => {
    assert.deepEqual(ceilingBasisFailures, []);
    assert.equal(ceilingNearKneeSkipCount, 0,
      'pinned: observed count of rows within 5e-4 of their knee, where the <=5e-4 input error could flip which side of the knee the row falls on');
  });

  test('applyRookieCeiling: knee/asymptote are exact and unaffected by input precision (the app-constant drift guard, §5)', () => {
    assert.deepEqual(kneeAsymptoteFailures, []);
  });

  test('total points match to within capture-precision rounding; exact-match count pinned (item 1\'s two-seam finding — this seam is only meaningfully live on the ceiling-firing rows)', () => {
    assert.deepEqual(totalPtsFailures, []);
    assert.equal(totalPtsExactCount, 290, 'pinned exact-match count — a real divergence moves this number');
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
