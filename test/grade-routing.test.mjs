/**
 * test/grade-routing.test.mjs — Integration tests for the loadOutcomes routing seam.
 *
 * loadOutcomes/gradeSnapshot take an injectable `load` (DEFAULT_LOAD's shape,
 * scripts/grade-snapshot.mjs) — fixtures are served from memory, no reads or
 * writes touch the real repo filesystem.
 *
 * D-44 (january-grading-run-a §4): routing is by resolveOutcomeBasis(snapshot) — half_ppr / league / skip —
 * and loadOutcomes takes { model, scoringSettings, positionOf }. v2 captures no longer reach buildInBasisOutcomes.
 * Four tests below are DECLARED REWRITES (the behaviour changed; not bent green): the v2 loadOutcomes test, the v1
 * loadOutcomes test (new signature), the missing-year test (new signature), and the gradeSnapshot v2 test.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadOutcomes, gradeSnapshot, resolveOutcomeBasis } from '../scripts/grade-snapshot.mjs';

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

// REWRITE 1 (was: v2 → buildInBasisOutcomes). A v2 capture now reaches half-PPR or league via `model`.
test('loadOutcomes model league → rescored outcomes (decoy fantasyPoints prove the path)', () => {
  const result = loadOutcomes(SENTINEL_YEAR, { model: 'league', scoringSettings: SCORING_V2, positionOf: () => 'RB' }, load);

  assert.ok(result !== null, 'result not null');
  assert.equal(result.inBasis, true, 'inBasis === true');
  assert.deepEqual(result.droppedTerms, [], 'league path reports no dropped terms');

  // p1 rescored: 700*0.1 + 7*6 = 112 (the decoy fantasyPoints is 480); /16 = 7.0
  const p1 = result.outcomes.get('p1');
  assert.ok(p1, 'p1 outcome present');
  assert.equal(p1.actualTotalPts, 112, 'p1 actualTotalPts (rescored, not decoy 480)');
  assert.equal(p1.actualPPG,      7.0, 'p1 actualPPG (rescored, not decoy 30)');

  const p4 = result.outcomes.get('p4');
  assert.equal(p4.actualPPG, null,  'p4 actualPPG null (0 gp)');
  assert.equal(p4.played,    false, 'p4 played false');
});

// REWRITE 2 (was: v1 with a bare `null` second argument). New signature.
test('loadOutcomes model half_ppr → buildHalfPprOutcomes path', () => {
  const result = loadOutcomes(SENTINEL_YEAR, { model: 'half_ppr' }, load);

  assert.ok(result !== null, 'result not null');
  assert.equal(result.inBasis, false, 'inBasis === false');
  assert.deepEqual(result.droppedTerms,    [], 'droppedTerms empty');
  assert.deepEqual(result.excludedRateKeys, [], 'excludedRateKeys empty');
  assert.equal(result.scoredKeyCount, null, 'scoredKeyCount null');

  const p1 = result.outcomes.get('p1');
  assert.equal(p1.actualTotalPts, 480,  'p1 actualTotalPts = fantasyPoints (not dot-product 112)');
  assert.equal(p1.actualPPG,      30.0, 'p1 actualPPG = 30.0');

  const p4 = result.outcomes.get('p4');
  assert.equal(p4.actualPPG, null,  'p4 actualPPG null');
  assert.equal(p4.played,    false, 'p4 played false');
});

// REWRITE 3 (new signature).
test('loadOutcomes returns null for missing year', () => {
  assert.equal(loadOutcomes(1900, { model: 'half_ppr' }, load), null, 'null for missing year (half_ppr)');
  assert.equal(loadOutcomes(1900, { model: 'league', scoringSettings: SCORING_V2, positionOf: () => null }, load), null, 'null for missing year (league)');
});

test('loadOutcomes rejects an unknown model', () => {
  assert.throws(() => loadOutcomes(SENTINEL_YEAR, { model: 'nope' }, load), /unknown outcome model/);
});

// ─── resolveOutcomeBasis ──────────────────────────────────────────────────────

const prov = (o) => ({ inputStatus: { careerStats: { detail: { provenance: o } } } });

test('resolveOutcomeBasis: v1 (no scoringSettings) → half_ppr', () => {
  const r = resolveOutcomeBasis({ schemaVersion: 1 });
  assert.equal(r.model, 'half_ppr');
  assert.equal(r.classification, 'half_ppr');
});

test('resolveOutcomeBasis: v2 with no inputStatus → half_ppr with a provenance-unrecorded caveat', () => {
  const r = resolveOutcomeBasis({ scoringSettings: SCORING_V2 });
  assert.equal(r.model, 'half_ppr');
  assert.ok(r.caveats.some(c => /provenance unrecorded/.test(c)));
});

test('resolveOutcomeBasis: all data-store provenance, no projectionBasis → half_ppr', () => {
  const r = resolveOutcomeBasis({ scoringSettings: SCORING_V2, ...prov({ 2024: 'data-store', 2025: 'data-store' }) });
  assert.equal(r.model, 'half_ppr');
  assert.deepEqual(r.caveats, []);
});

test('resolveOutcomeBasis: a live-api season on a half-PPR capture → mixed, model null', () => {
  const r = resolveOutcomeBasis({ scoringSettings: SCORING_V2, ...prov({ 2024: 'data-store', 2025: 'live-api' }) });
  assert.equal(r.model, null);
  assert.equal(r.classification, 'mixed');
  assert.ok(r.caveats[0].includes('2025:live-api'));
});

test("resolveOutcomeBasis: 'league' → league; a non-data-store season is a caveat only (CR-01)", () => {
  const r = resolveOutcomeBasis({ scoringSettings: SCORING_V2, projectionBasis: 'league', ...prov({ 2025: 'live-api' }) });
  assert.equal(r.model, 'league');
  assert.equal(r.classification, 'league');
  assert.equal(r.caveats.length, 1);
});

test("resolveOutcomeBasis: an unrecognised projectionBasis → unknown, model null", () => {
  const r = resolveOutcomeBasis({ scoringSettings: SCORING_V2, projectionBasis: 'unknown' });
  assert.equal(r.model, null);
  assert.equal(r.classification, 'unknown');
});

// ─── gradeSnapshot routing ────────────────────────────────────────────────────

// REWRITE 4 (was: v2 → meta.inBasis true / outcomeBasis 'custom'). A v2 capture with no projectionBasis is half-PPR.
test('gradeSnapshot v2 (no projectionBasis): routed to half_ppr outcomes', () => {
  const report = suppressOutput(() =>
    gradeSnapshot({ snapshotDate: SNAP_V2_DATE, dryRun: true, load })
  );

  assert.ok(report !== null, 'report not null');
  assert.equal(report.meta.outcomeModel, 'half_ppr', 'outcomeModel half_ppr');
  assert.equal(report.meta.basisClassification, 'half_ppr');
  assert.equal(report.meta.inBasis,     false,     'meta.inBasis === false');
  assert.equal(report.meta.outcomeBasis, 'half_ppr', 'meta.outcomeBasis half_ppr');
  assert.equal(report.meta.basisMatch,  true,     'meta.basisMatch === true');
  assert.ok(report.caveats.some(c => /provenance unrecorded/.test(c)), 'provenance caveat surfaced');
  // p1: projected 9.0 vs half_ppr actual 480/16 = 30 (the rescored value would be 7.0) → bias 9 − 30
  assert.equal(report.overall.biasPPG, -21);
});

const SNAP_LEAGUE = {
  ...SNAP_V2,
  projectionBasis: 'league',
  teamDepthCharts: { AAA: { RB: [{ playerId: 'p1', depthOrder: 1 }] } },
  ...prov({ 2025: 'data-store' }),
};
const SNAP_MIXED = { ...SNAP_V2, ...prov({ 2025: 'live-api' }) };
const SNAP_UNKNOWN = { ...SNAP_V2, projectionBasis: 'weird' };

function loadWith(snap, extra = {}) {
  return { ...load, loadSnapshot: () => snap, ...extra };
}

test('gradeSnapshot league: outcomes rescored (decoys), positionSource counts via injected loadPositionOf', () => {
  const report = suppressOutput(() =>
    gradeSnapshot({ snapshotDate: 'x', dryRun: true, load: loadWith(SNAP_LEAGUE, { loadPositionOf: () => ({ p1: { position: 'RB' } }) }) })
  );
  assert.ok(report);
  assert.equal(report.meta.outcomeModel, 'league');
  assert.equal(report.meta.inBasis, true);
  assert.equal(report.meta.outcomeBasis, 'league');
  assert.deepEqual(report.meta.positionSource, { league: 1, snapshot: 0, none: 0 });
  // p1 actual PPG 7.0 (rescored) vs projected 9.0 → bias +2.0; the half-PPR decoy would give −21
  assert.equal(report.overall.biasPPG, 2.0);
});

test('gradeSnapshot league: absent loadPositionOf skips that source; snapshot charts count', () => {
  const report = suppressOutput(() =>
    gradeSnapshot({ snapshotDate: 'x', dryRun: true, load: loadWith(SNAP_LEAGUE) })
  );
  assert.deepEqual(report.meta.positionSource, { league: 0, snapshot: 1, none: 0 });
});

test('gradeSnapshot: a mixed-provenance half-PPR capture is skipped (null, exit-0 condition)', () => {
  assert.equal(suppressOutput(() => gradeSnapshot({ snapshotDate: 'x', dryRun: true, load: loadWith(SNAP_MIXED) })), null);
});

test("gradeSnapshot: projectionBasis 'weird' is skipped as unknown", () => {
  assert.equal(suppressOutput(() => gradeSnapshot({ snapshotDate: 'x', dryRun: true, load: loadWith(SNAP_UNKNOWN) })), null);
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
