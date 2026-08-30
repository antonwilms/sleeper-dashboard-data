/**
 * test/grade-routing.test.mjs — Integration tests for the loadOutcomes routing seam.
 *
 * loadOutcomes/gradeSnapshot take an injectable `load` (DEFAULT_LOAD's shape,
 * scripts/grade-snapshot.mjs) — fixtures are served from memory, no reads or
 * writes touch the real repo filesystem.
 *
 * Coverage gap filled:
 *   - loadOutcomes v2 (scoringSettings present) → buildInBasisOutcomes path
 *   - loadOutcomes v1 (scoringSettings absent)  → buildHalfPprOutcomes path
 *   - gradeSnapshot routing: snapshot.scoringSettings extraction + dispatch
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadOutcomes, gradeSnapshot } from '../scripts/grade-snapshot.mjs';

// ─── Sentinel paths ───────────────────────────────────────────────────────────

const SENTINEL_YEAR   = 9999;
const SNAP_V2_DATE    = '_routing_test_v2_';
const SNAP_V1_DATE    = '_routing_test_v1_';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// Season-totals shared by all routing tests.
// Decoy fantasyPoints (480, 300, 200) differ wildly from in-basis points
// (112, 180, 108) — assertions prove which path ran.
const FIXTURE_TOTALS = {
  p1: { gamesPlayed: 16, gamesStarted: 16, fantasyPoints: 480,
        stats: { rush_yd: 700, rush_td: 7, rec: 0, rec_yd: 0, rec_td: 0 } },
  p2: { gamesPlayed: 15, gamesStarted: 15, fantasyPoints: 300,
        stats: { rush_yd: 1200, rush_td: 10, rec_ypr: 99 } },
  p3: { gamesPlayed: 12, gamesStarted: 12, fantasyPoints: 200,
        stats: { rush_yd: 600, rush_td: 8 } },
  p4: { gamesPlayed: 0, gamesStarted: 0, fantasyPoints: 0, stats: {} },
};

// Matches grade-snapshot-v2.json scoringSettings.
const SCORING_V2 = {
  rush_yd: 0.1, rush_td: 6, rec: 0.5, rec_yd: 0.1, rec_td: 6, bonus_xyz: 5, rec_ypr: 2,
};

// Minimal v2 snapshot: scoringSettings present + targetSeason 9999.
const SNAP_V2 = {
  schemaVersion: 2,
  capturedAt:    '2027-03-01T00:00:00.000Z',
  scoringBasis:  'custom',
  targetSeason:  SENTINEL_YEAR,
  scoringSettings: SCORING_V2,
  teamDepthCharts: {},
  players: {
    p1: { projection: { projectedPPG: 9.0, projectedGames: 16, confidence: 'high', factors: null } },
  },
};

// Minimal v1 snapshot: no scoringSettings; targetSeason forced via opts.
const SNAP_V1 = {
  schemaVersion: 1,
  capturedAt:    '2027-03-01T00:00:00.000Z',
  scoringBasis:  'half_ppr',
  teamDepthCharts: {},
  players: {
    p1: { projection: { projectedPPG: 9.0, projectedGames: 16, confidence: 'high', factors: null } },
  },
};

// ─── Injected load ────────────────────────────────────────────────────────────

const load = {
  loadSeasonTotals: (year) => (year === SENTINEL_YEAR ? FIXTURE_TOTALS : null),
  loadSnapshot: (date) => {
    if (date === SNAP_V2_DATE) return SNAP_V2;
    if (date === SNAP_V1_DATE) return SNAP_V1;
    return null;
  },
};

// Suppress gradeSnapshot's stdout output during routing tests.
function suppressOutput(fn) {
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = () => true;
  try { return fn(); } finally { process.stdout.write = orig; }
}

// ─── loadOutcomes routing ─────────────────────────────────────────────────────

test('loadOutcomes v2: scoringSettings present → buildInBasisOutcomes path', () => {
  const result = loadOutcomes(SENTINEL_YEAR, SCORING_V2, load);

  assert.ok(result !== null, 'result not null');
  assert.equal(result.inBasis, true, 'inBasis === true');
  assert.deepEqual(result.excludedRateKeys, ['rec_ypr'], 'rec_ypr rate-excluded');
  assert.deepEqual(result.droppedTerms,    ['bonus_xyz'], 'bonus_xyz dropped');
  assert.equal(result.scoredKeyCount, 5, 'scoredKeyCount === 5');

  // p1 in-basis: 700*0.1 + 7*6 = 112; /16 = 7.0
  // if half_ppr path ran: 480/16 = 30 — the two values prove which path fired
  const p1 = result.outcomes.get('p1');
  assert.ok(p1, 'p1 outcome present');
  assert.equal(p1.actualTotalPts, 112,  'p1 actualTotalPts (dot-product, not decoy 480)');
  assert.equal(p1.actualPPG,      7.0,  'p1 actualPPG (dot-product, not decoy 30)');

  // p2 rec_ypr:99 must NOT contribute (rate-excluded); 1200*0.1+10*6 = 180; /15 = 12
  const p2 = result.outcomes.get('p2');
  assert.equal(p2.actualPPG, 12.0, 'p2 actualPPG — rec_ypr excluded');

  // p4 0-GP rule
  const p4 = result.outcomes.get('p4');
  assert.equal(p4.actualPPG, null,  'p4 actualPPG null (0 gp)');
  assert.equal(p4.played,    false, 'p4 played false');
});

test('loadOutcomes v1: scoringSettings absent → buildHalfPprOutcomes path', () => {
  const result = loadOutcomes(SENTINEL_YEAR, null, load);

  assert.ok(result !== null, 'result not null');
  assert.equal(result.inBasis, false, 'inBasis === false');
  assert.deepEqual(result.droppedTerms,    [], 'droppedTerms empty');
  assert.deepEqual(result.excludedRateKeys, [], 'excludedRateKeys empty');
  assert.equal(result.scoredKeyCount, null, 'scoredKeyCount null');

  // p1 half_ppr: fantasyPoints=480, gp=16 → 30.0
  // if in-basis path ran: 7.0 — again proves which path fired
  const p1 = result.outcomes.get('p1');
  assert.ok(p1, 'p1 outcome present');
  assert.equal(p1.actualTotalPts, 480,  'p1 actualTotalPts = fantasyPoints (not dot-product 112)');
  assert.equal(p1.actualPPG,      30.0, 'p1 actualPPG = 30.0 (not dot-product 7.0)');

  // p4 0-GP rule unchanged
  const p4 = result.outcomes.get('p4');
  assert.equal(p4.actualPPG, null,  'p4 actualPPG null');
  assert.equal(p4.played,    false, 'p4 played false');
});

test('loadOutcomes returns null for missing year', () => {
  assert.equal(loadOutcomes(1900, null),      null, 'null for missing year (v1)');
  assert.equal(loadOutcomes(1900, SCORING_V2), null, 'null for missing year (v2)');
});

// ─── gradeSnapshot routing ────────────────────────────────────────────────────

test('gradeSnapshot v2: snapshot.scoringSettings extracted → meta.inBasis true', () => {
  const report = suppressOutput(() =>
    gradeSnapshot({ snapshotDate: SNAP_V2_DATE, dryRun: true, load })
  );

  assert.ok(report !== null, 'report not null');
  assert.equal(report.meta.inBasis,     true,     'meta.inBasis === true');
  assert.equal(report.meta.basisMatch,  true,     'meta.basisMatch === true (no indicative caveat)');
  assert.equal(report.meta.outcomeBasis, 'custom', 'meta.outcomeBasis = scoringBasis');
  assert.ok(
    !report.caveats.some(c => c.toLowerCase().includes('basis mismatch')),
    'no basis-mismatch caveat for in-basis report'
  );
});

test('gradeSnapshot v1: no scoringSettings → meta.inBasis false', () => {
  // targetSeason: 9999 forced via opts so loadOutcomes hits the sentinel file.
  const report = suppressOutput(() =>
    gradeSnapshot({ snapshotDate: SNAP_V1_DATE, targetSeason: SENTINEL_YEAR, dryRun: true, load })
  );

  assert.ok(report !== null, 'report not null');
  assert.equal(report.meta.inBasis,     false, 'meta.inBasis === false');
  assert.equal(report.meta.outcomeBasis, 'half_ppr', 'meta.outcomeBasis = half_ppr');
  assert.equal(report.meta.basisMatch,  true, 'meta.basisMatch true (half_ppr snap + half_ppr outcomes)');
});
