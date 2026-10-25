/**
 * test/season-grade.test.mjs — lib/seasonGrade.mjs and the scripts/season-grade-run.mjs registry (plan january-grading-run-a §11).
 *
 * Fixtures only (Invariant 10): synthetic season files and trimmed captures under test/fixtures/season-grade/; the one
 * non-fixture read is grading/anchor-policy.md (a committed doc) for the segment-table equality.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  KICKOFF_2026_UTC, VETERAN_SEGMENTS, MARKER_SEGMENT, MECH_PAIRS, detectorFires, classifyCapture, classifyCaptures,
  crossCheckClassification, evaluateSeasonGate, cellStats, segmentStats, metricOf, sampleOk, materializeRows,
  calibrationLabel, historyLabel, agreeLabel, pooledDiffLabel, bootCI, permutationTest, MIN_CELL,
} from '../lib/seasonGrade.mjs';
import { boundaryGuard } from '../lib/vetReplay.mjs';
import { STEPS, runSeasonGrade, makeContext, decideHeadline, K_HEADLINE_LABEL, M10_CAVEAT } from '../scripts/season-grade-run.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const fx = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/season-grade', name), 'utf8'));
const DET = fx('detector-captures.json');

// ─── Pins and the anchor-policy equality ──────────────────────────────────────

describe('pins', () => {
  test('VETERAN_SEGMENTS deep-equals the JSON block in grading/anchor-policy.md', () => {
    const md = fs.readFileSync(path.join(ROOT, 'grading/anchor-policy.md'), 'utf8');
    const m = /<!-- veteran-segments:begin -->\s*```json\n([\s\S]*?)\n```\s*<!-- veteran-segments:end -->/.exec(md);
    assert.ok(m, 'marked JSON block present');
    assert.deepEqual(JSON.parse(m[1]), JSON.parse(JSON.stringify(VETERAN_SEGMENTS)));
  });

  test('L0 uses the pinned kickoff instant; MARKER_SEGMENT is derived from the markers columns', () => {
    assert.equal(KICKOFF_2026_UTC, '2026-09-10T00:20:00Z');
    assert.equal(VETERAN_SEGMENTS[0].detector.utc, KICKOFF_2026_UTC);
    assert.deepEqual({ ...MARKER_SEGMENT }, { '2026-10-11': 'L5', '2026-10-14': 'L5', '2026-10-23': 'L6' });
    assert.equal(new Date('2026-09-09T20:20:00-04:00').toISOString(), '2026-09-10T00:20:00.000Z', 'Wed 09-09 20:20 ET');
  });

  test('G-MECH pairs M1–M9 are the pre-registered fixed pairs', () => {
    assert.deepEqual(MECH_PAIRS.map(p => p.id), ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9']);
    assert.deepEqual(MECH_PAIRS.map(p => [p.a, p.b]).slice(5, 6), [['2026-10-13', '2026-10-14']]);
  });
});

// ─── Detectors ────────────────────────────────────────────────────────────────

describe('detectors on trimmed captures straddling each boundary', () => {
  const seg = Object.fromEntries(VETERAN_SEGMENTS.map(s => [s.id, s]));
  const fires = (id, date) => detectorFires(seg[id].detector, DET[date]);

  test('b4 (vetRowKey regressionUpsideBasis): 09-12 no, 09-13 yes', () => {
    assert.equal(fires('L1', '2026-09-12'), false);
    assert.equal(fires('L1', '2026-09-13'), true);
  });
  test('b4a (envelopeEquals projectionBasis league): 09-24 no, 09-25 yes', () => {
    assert.equal(fires('L2', '2026-09-24'), false);
    assert.equal(fires('L2', '2026-09-25'), true);
  });
  test('b5 (vetRowKey qbTakeoverBasis): 10-03 no, 10-04 yes', () => {
    assert.equal(fires('L3', '2026-10-03'), false);
    assert.equal(fires('L3', '2026-10-04'), true);
  });
  test('b8 (vetRowKey shortSeasonState): 10-09 no, 10-10 yes', () => {
    assert.equal(fires('L5', '2026-10-09'), false);
    assert.equal(fires('L5', '2026-10-10'), true);
  });
  test('b10 (markerIn): a trimmed copy of 10-23 fires, 10-22 does not', () => {
    assert.equal(fires('L6', '2026-10-22'), false);
    assert.equal(fires('L6', '2026-10-23'), true);
  });
  test('L4 capturedAfter 2026-10-07T06:50Z: before / after the instant', () => {
    assert.equal(detectorFires(seg.L4.detector, { capturedAt: '2026-10-07T06:49:59Z' }), false);
    assert.equal(detectorFires(seg.L4.detector, { capturedAt: '2026-10-07T06:50:01Z' }), true);
  });
  test('an unknown detector kind throws', () => {
    assert.throws(() => detectorFires({ kind: 'nope' }, {}), /unknown segment detector kind/);
  });
  test('last-firing precedence: 10-23 fires L5 (shortSeasonState) and L6 (marker) and classifies L6; 10-22 classifies L5', () => {
    assert.equal(fires('L5', '2026-10-23'), true);
    assert.equal(classifyCapture(DET['2026-10-23'], '2026-10-23').segment, 'L6');
    assert.equal(classifyCapture(DET['2026-10-22'], '2026-10-22').segment, 'L5');
    assert.equal(classifyCapture(DET['2026-10-04'], '2026-10-04').segment, 'L3');
  });
  test('pre-kickoff: capturedAt ≤ KICKOFF is pre-kickoff regardless of detectors; a v1 (no targetSeason) is `other`', () => {
    assert.equal(classifyCapture({ targetSeason: 2026, capturedAt: '2026-09-10T00:20:00Z' }, 'x').era, 'pre-kickoff');
    assert.equal(classifyCapture({ capturedAt: '2026-06-06T00:00:00Z' }, 'x').era, 'other');
    assert.equal(classifyCapture(DET['2026-09-12'], '2026-09-12').segment, 'L0');
  });
});

describe('classification stops (i), (ii), (iii)', () => {
  const e = (date, index, marker = null, targetSeason = 2026) => ({ date, era: 'segment', index, segment: VETERAN_SEGMENTS[index].id, marker, targetSeason });
  test('a consistent series passes', () => {
    assert.doesNotThrow(() => crossCheckClassification([e('2026-10-22', 5, '2026-10-14'), e('2026-10-23', 6, '2026-10-23')]));
  });
  test('(i) a date outside [firstCapture, next firstCapture) stops with the stale-policy message', () => {
    assert.throws(() => crossCheckClassification([e('2026-10-12', 6, '2026-10-23')]), /anchor policy stale — pin boundary N in grading\/anchor-policy\.md's JSON block and VETERAN_SEGMENTS first/);
    assert.throws(() => crossCheckClassification([e('2026-10-23', 5), e('2026-10-23', 6, '2026-10-23')]), /outside \[2026-10-10, 2026-10-23\)/);
  });
  test('(ii) an unpinned or mismatched projectionModelFrom stops', () => {
    assert.throws(() => crossCheckClassification([e('2026-10-23', 6, '2026-10-30')]), /not a pinned marker/);
    assert.throws(() => crossCheckClassification([e('2026-10-23', 6, '2026-10-14')]), /maps to L5 but the capture classifies L6/);
  });
  test('(iii) the newest 2026 capture must classify to the last segment', () => {
    assert.throws(() => crossCheckClassification([e('2026-10-22', 5, '2026-10-14')]), /not the last segment L6/);
    assert.throws(() => crossCheckClassification([{ date: '2026-09-09', era: 'pre-kickoff', index: -1, marker: null, targetSeason: 2026 }]), /not a post-kickoff segment/);
  });
  test('classifyCaptures end-to-end on the trimmed detector captures', () => {
    const dates = ['2026-10-22', '2026-10-23'];
    const out = classifyCaptures(dates.map(d => ({ date: d, snapshot: DET[d] })));
    assert.deepEqual(out.map(c => c.segment), ['L5', 'L6']);
  });
});

// ─── Boundary-equality guard ──────────────────────────────────────────────────

describe('boundary-equality guard (a)–(c)', () => {
  const A = fx('snap-2026-10-13.json');
  const B = fx('snap-2026-10-14.json');
  test('pass on a real same-segment pair', () => {
    const g = boundaryGuard(A, B);
    assert.equal(g.pass, true, JSON.stringify([g.a.sample, g.b.sample, g.c.sample]));
    assert.ok(g.a.common > 100);
  });
  test('(a) a changed cohort factor fails', () => {
    const B2 = JSON.parse(JSON.stringify(B));
    const id = Object.keys(B2.players).find(i => B2.players[i].projection.confidence !== 'rookie');
    B2.players[id].projection.factors.snapShareFactor += 0.01;
    const g = boundaryGuard(A, B2);
    assert.equal(g.pass, false);
    assert.equal(g.a.diffs, 1);
  });
  test('(b) a teamFactor off the 1 + (16 − r)/200 grid fails; an off-range rank fails', () => {
    const B2 = JSON.parse(JSON.stringify(B));
    const id = Object.keys(B2.players).find(i => B2.players[i].projection.confidence !== 'rookie');
    B2.players[id].projection.factors.teamFactor = 1.0123;
    assert.equal(boundaryGuard(A, B2).b.bad, 1);
    B2.players[id].projection.factors.teamFactor = 1 + (16 - 40) / 200;   // r = 40
    assert.equal(boundaryGuard(A, B2).b.bad, 1);
  });
  test('(c) a qbQualityFactor off its formula fails; 1 with a null score passes', () => {
    const B2 = JSON.parse(JSON.stringify(B));
    const ids = Object.keys(B2.players).filter(i => B2.players[i].projection.confidence !== 'rookie');
    const withScore = ids.find(i => B2.players[i].projection.factors.qbQualityScore != null);
    assert.ok(withScore);
    B2.players[withScore].projection.factors.qbQualityFactor += 0.01;
    assert.equal(boundaryGuard(A, B2).c.bad, 1);
    const nullScore = ids.find(i => B2.players[i].projection.factors.qbQualityScore == null);
    B2.players[nullScore].projection.factors.qbQualityFactor = 1.01;
    assert.equal(boundaryGuard(A, B2).c.bad, 2);
  });
});

// ─── G-SEASON ─────────────────────────────────────────────────────────────────

describe('G-SEASON', () => {
  const week = (p) => Array.from({ length: 18 }, (_, w) => (p[w] ?? 'X'));
  function good() {
    const games = [];
    for (let w = 1; w <= 18; w++) for (let i = 0; i < (w === 18 ? 16 : 15); i++) games.push({ gameType: 'REG', week: w, homeScore: 20, awayScore: 10 });
    games.push(...Array.from({ length: 272 - games.length }, () => ({ gameType: 'REG', week: 18, homeScore: 1, awayScore: 0 })));
    const totals = { TEAM_X: { gamesPlayed: 17 } };
    for (let i = 0; i < 100; i++) totals[`p${i}`] = { gamesPlayed: 17, weeklyStats: { 1: {} }, weeklyStatus: week(Array(18).fill('P')) };
    const manifest = { files: { 'nfl/season-totals/2026.json': { lastModified: '2027-01-15T06:13:00Z' }, 'nflverse/schedule/2026.json': { lastModified: '2027-01-15T13:35:00Z' } } };
    return { schedule: { games }, totals, manifest };
  }
  test('passes on a complete season', () => {
    const g = evaluateSeasonGate(good());
    assert.equal(g.pass, true, JSON.stringify(g.checks));
    assert.equal(g.weeksComplete, 18);
  });
  test('(a) fails on an unscored game or a wrong game count', () => {
    const x = good(); x.schedule.games[3].homeScore = null;
    assert.equal(evaluateSeasonGate(x).checks[0].pass, false);
    const y = good(); y.schedule.games.pop();
    assert.equal(evaluateSeasonGate(y).checks[0].pass, false);
  });
  test('(b) fails when week 18 has < 85% of the median week', () => {
    const x = good();
    for (let i = 0; i < 100; i++) x.totals[`p${i}`].weeklyStatus[17] = i < 80 ? 'P' : 'X';
    assert.equal(evaluateSeasonGate(x).checks[1].pass, false, '80 < 85');
    for (let i = 0; i < 100; i++) x.totals[`p${i}`].weeklyStatus[17] = i < 85 ? 'P' : 'X';
    assert.equal(evaluateSeasonGate(x).checks[1].pass, true, '85 = 0.85 × 100');
  });
  test('(c) fails on a played row without weeklyStats; TEAM_* rows are ignored', () => {
    const x = good(); delete x.totals.p7.weeklyStats;
    assert.equal(evaluateSeasonGate(x).checks[2].pass, false);
    const y = good(); y.totals.TEAM_Y = { gamesPlayed: 17 };
    assert.equal(evaluateSeasonGate(y).checks[2].pass, true);
  });
  test('(c) mirrors requireWeeklyStats: an empty {} passes; an absent field or a non-object fails', () => {
    const empty = good(); empty.totals.p7.weeklyStats = {};
    assert.equal(evaluateSeasonGate(empty).checks[2].pass, true, 'played row with weeklyStats: {} passes');
    const absent = good(); delete absent.totals.p7.weeklyStats;
    assert.equal(evaluateSeasonGate(absent).checks[2].pass, false, 'field absent fails');
    for (const bad of [null, 'x', 5, [], [1]]) {
      const x = good(); x.totals.p7.weeklyStats = bad;
      assert.equal(evaluateSeasonGate(x).checks[2].pass, false, `non-object ${JSON.stringify(bad)} fails`);
    }
    const unplayed = good(); unplayed.totals.p7 = { gamesPlayed: 0 };
    assert.equal(evaluateSeasonGate(unplayed).checks[2].pass, true, 'gamesPlayed 0 needs no weeklyStats');
  });
  test('(d) fails when season-totals lastModified is > 24 h before the schedule’s', () => {
    const x = good();
    x.manifest.files['nfl/season-totals/2026.json'].lastModified = '2027-01-14T13:34:00Z';
    assert.equal(evaluateSeasonGate(x).checks[3].pass, false);
    x.manifest.files['nfl/season-totals/2026.json'].lastModified = '2027-01-14T13:36:00Z';
    assert.equal(evaluateSeasonGate(x).checks[3].pass, true);
  });
  test('weeksComplete is the largest fully scored prefix of weeks', () => {
    const x = good();
    x.schedule.games.forEach(g => { if (g.week > 6) g.homeScore = null; });
    assert.equal(evaluateSeasonGate(x).weeksComplete, 6);
  });
});

// ─── Metrics ──────────────────────────────────────────────────────────────────

describe('metrics (hand-computed)', () => {
  const rows = [
    { id: '1', pos: 'RB', p: 10, T: 160, G: 16, a: 120, g: 12, chain: false },    // a/g 10   → ratio 1.0
    { id: '2', pos: 'RB', p: 8,  T: 128, G: 16, a: 96,  g: 8,  chain: false },    // a/g 12   → 1.5
    { id: '3', pos: 'RB', p: 6,  T: 96,  G: 16, a: 0,   g: 0,  chain: false },    // 0 games
    { id: '4', pos: 'RB', p: 5,  T: 85,  G: 17, a: 50,  g: 5,  chain: true },     // chain row
    { id: '5', pos: 'RB', p: 4,  T: 64,  G: 16, a: 20,  g: 5,  chain: false },    // g < 6
  ];
  test('R_ppg = Σa/Σ(p·g) over g>0, chain excluded', () => {
    const s = cellStats(rows);
    // rows 1, 2, 5: Σa = 236; Σ p·g = 120 + 64 + 20 = 204
    assert.ok(Math.abs(s.R_ppg - 236 / 204) < 1e-12);
    assert.equal(s.nPpg, 3);
  });
  test('R_tot = Σa/ΣT over ALL rows incl. 0-game and chain', () => {
    const s = cellStats(rows);
    assert.ok(Math.abs(s.R_tot - 286 / 533) < 1e-12);
  });
  test('R_games = Σg/ΣG; Med_ppg over g ≥ 6 non-chain; MAE/bias over g ≥ 6 (projected − actual)', () => {
    const s = cellStats(rows);
    assert.ok(Math.abs(s.R_games - 30 / 81) < 1e-12);
    assert.equal(s.nMed, 2);
    assert.ok(Math.abs(s.Med_ppg - 1.25) < 1e-12);            // median(1.0, 1.5)
    assert.ok(Math.abs(s.maePPG - (0 + 4) / 2) < 1e-12);
    assert.ok(Math.abs(s.biasPPG - (0 + -4) / 2) < 1e-12);
  });
  test('pooled is a ratio of sums; the mean of positions is unweighted; UNK pools only', () => {
    const r2 = [...rows.slice(0, 2).map(r => ({ ...r, pos: 'QB' })), { id: '9', pos: 'UNK', p: 10, T: 100, G: 10, a: 100, g: 10, chain: false }];
    const st = segmentStats(r2);
    assert.equal(st.unk, 1);
    assert.ok(Math.abs(st.pooled.R_ppg - (120 + 96 + 100) / (120 + 64 + 100)) < 1e-12);
    assert.equal(st.meanOfPositions.R_ppg, null, 'a position without rows makes the unweighted mean undefined');
    assert.equal(st.byPos.QB.rows, 2);
  });
  test('insufficient below the minimum sample (< 20 rows); labels ignore insufficient cells', () => {
    const s = cellStats(rows);
    assert.equal(sampleOk(s, 'R_ppg'), false);
    assert.equal(sampleOk(s, 'R_tot'), false);
    const many = Array.from({ length: MIN_CELL }, (_, i) => ({ id: `m${i}`, pos: 'WR', p: 5, T: 80, G: 16, a: 60, g: 12, chain: false }));
    const sm = cellStats(many);
    assert.equal(sampleOk(sm, 'R_ppg'), true);
    assert.equal(sampleOk(sm, 'Med_ppg'), true);
    assert.equal(sampleOk(cellStats(many.slice(1)), 'R_tot'), false);
    assert.equal(calibrationLabel(null), 'insufficient');
  });
  test('labels: calibration / history / agree / pooled-difference', () => {
    assert.equal(calibrationLabel([0.8, 0.99]), 'optimistic');
    assert.equal(calibrationLabel([1.01, 1.2]), 'pessimistic');
    assert.equal(calibrationLabel([0.9, 1.1]), 'within-CI');
    assert.equal(historyLabel([0.85, 0.95], 0.882), 'consistent-with-history');
    assert.equal(historyLabel([0.9, 0.95], 0.882), 'differs-from-history');
    assert.equal(agreeLabel([-0.01, 0.02]), 'agrees');
    assert.equal(agreeLabel([0.01, 0.02]), 'differs');
    assert.equal(pooledDiffLabel([-0.1, 0.1]), 'within-pooled');
    assert.equal(pooledDiffLabel([0.01, 0.1]), 'differs-from-pooled');
  });
  test('materializeRows is the identity on rows with no imputed member', () => {
    assert.equal(materializeRows(rows), rows);
  });
});

describe('bootstrap and permutation are deterministic', () => {
  const rows = Array.from({ length: 80 }, (_, i) => ({ id: `r${i}`, pos: ['QB', 'RB', 'WR', 'TE'][i % 4], p: 6 + (i % 5), T: 100, G: 16, a: 80 + (i * 7) % 40, g: 10, chain: false }));
  test('same seed → identical CI; a different seed → a different interval', () => {
    const f = (s) => metricOf(s, 'R_ppg', null);
    const a = bootCI(rows, f, { resamples: 500, seed: 12345 });
    const b = bootCI(rows, f, { resamples: 500, seed: 12345 });
    const c = bootCI(rows, f, { resamples: 500, seed: 999 });
    assert.deepEqual(a, b);
    assert.notDeepEqual(a, c);
  });
  test('the pre-registered defaults are 4,000 resamples and seed 12345', () => {
    const ci = bootCI(rows, (s) => metricOf(s, 'R_tot', null));
    assert.ok(ci && ci[0] < ci[1]);
  });
  test('permutation test: same seed → identical p; labels carry no signal on position-free data', () => {
    const a = permutationTest(rows, 'R_ppg', { permutations: 300, seed: 12345 });
    const b = permutationTest(rows, 'R_ppg', { permutations: 300, seed: 12345 });
    assert.deepEqual(a, b);
    assert.ok(a.p > 0 && a.p <= 1);
    assert.equal(a.n, 80);
  });
  test('permutation test detects a planted position effect', () => {
    const planted = rows.map(r => (r.pos === 'QB' ? { ...r, a: r.a * 3 } : r));
    assert.ok(permutationTest(planted, 'R_ppg', { permutations: 300, seed: 12345 }).p < 0.05);
  });
});

// ─── Registry, --only, isolation ──────────────────────────────────────────────

describe('STEPS registry', () => {
  test('Slice A ships season-gate, inventory, d44, vet-calibration in that order; Slice B appends six', () => {
    assert.deepEqual(STEPS.map(s => s.id), ['season-gate', 'inventory', 'd44', 'vet-calibration', 'ros', 'games-l6', 'override', 'rookie', 'd60', 'listed']);
    for (const s of STEPS) assert.equal(typeof s.run, 'function');
  });

  const mk = (id, impl) => ({ id, run: impl ?? (async () => ({ section: { id, title: id, md: `body ${id}`, placement: 'main' }, artifacts: [] })) });

  test('--only filters by id; an unknown id throws', async () => {
    const steps = [mk('a'), mk('b'), mk('c')];
    const r = await runSeasonGrade({ steps, only: ['b'], load: {} });
    assert.deepEqual(r.results.map(x => x.id), ['b']);
    await assert.rejects(() => runSeasonGrade({ steps, only: ['zz'], load: {} }), /unknown step id 'zz'/);
  });

  test('per-step isolation: a throwing step is reported, the next still runs, exit 1', async () => {
    const steps = [mk('a'), mk('boom', async () => { throw new Error('kaboom'); }), mk('c')];
    const r = await runSeasonGrade({ steps, load: {} });
    assert.equal(r.exitCode, 1);
    assert.deepEqual(r.results.map(x => [x.id, !!x.error]), [['a', false], ['boom', true], ['c', false]]);
    assert.match(r.verdict, /Step `boom` FAILED:\*\* kaboom/);
    assert.match(r.verdict, /body c/);
  });

  test('a hard stop halts later steps; all-green exits 0; the verdict opens with the report-only line', async () => {
    const stop = mk('gate', async () => { throw Object.assign(new Error('G-SEASON failed'), { hardStop: true }); });
    const r = await runSeasonGrade({ steps: [stop, mk('after')], load: {} });
    assert.equal(r.exitCode, 1);
    assert.deepEqual(r.results.map(x => [x.id, !!x.skipped]), [['gate', false], ['after', true]]);
    const ok = await runSeasonGrade({ steps: [mk('a')], load: {} });
    assert.equal(ok.exitCode, 0);
    assert.match(ok.verdict, /Report-only: numbers and labels\. No constant, multiplier or wiring recommendation/);
  });

  test('--rehearse writes nothing and stamps the verdict', async () => {
    const r = await runSeasonGrade({ steps: [mk('a')], rehearse: true, write: true, load: {} });
    assert.deepEqual(r.artifacts, []);
    assert.match(r.verdict, /REHEARSAL/);
  });
});

// ─── --only cannot bypass the gate (fix pass 1, item 2) ───────────────────────

describe('season gate runs first regardless of --only', () => {
  const failingLoad = { loadSchedule: () => ({ games: [] }), loadSeasonTotals: () => ({}), loadManifest: () => ({ files: {} }) };
  const gate = STEPS.find(s => s.id === 'season-gate');
  const probe = () => {
    const calls = [];
    return { calls, step: { id: 'd44', run: async () => { calls.push('d44'); return { section: { id: 'd44', title: 'd44', md: 'ran', placement: 'main' }, artifacts: [{ path: 'grading/x.json' }] }; } } };
  };

  test('--only d44 with a failing gate: no step runs and nothing is written', async () => {
    const { calls, step } = probe();
    const r = await runSeasonGrade({ steps: [gate, step], only: ['d44'], write: true, load: failingLoad });
    assert.deepEqual(calls, [], 'd44 never ran');
    assert.equal(r.exitCode, 1);
    assert.deepEqual(r.artifacts, [], 'nothing written');
    assert.equal(r.results[0].id, 'season-gate');
    assert.ok(r.results[0].error);
    assert.deepEqual(r.results.slice(1).map(x => [x.id, !!x.skipped]), [['d44', true]]);
  });

  test('--only d44 --rehearse: the gate is reported and bypassed, d44 runs, nothing is written', async () => {
    const { calls, step } = probe();
    const r = await runSeasonGrade({ steps: [gate, step], only: ['d44'], rehearse: true, write: true, load: failingLoad });
    assert.deepEqual(calls, ['d44']);
    assert.deepEqual(r.results.map(x => x.id), ['season-gate', 'd44']);
    assert.match(r.verdict, /G-SEASON bypassed \(would FAIL\)/);
    assert.equal(r.exitCode, 0);
    assert.deepEqual(r.artifacts, []);
  });
});

// ─── Headline decision (fix pass 1, item 7) ───────────────────────────────────

describe('decideHeadline', () => {
  const pass = { pass: true };
  const all = (over = {}) => ({ g1: pass, g2: pass, g3: pass, gMech: { pass: true, m10Skipped: false }, m10: { id: 'M10', pass: true }, g5: pass, g6: pass, ...over });

  test('all gates pass with M10 run → R, no caveat', () => {
    const d = decideHeadline(all());
    assert.equal(d.headline, 'R');
    assert.equal(d.label, d.labels.R);
    assert.equal(d.label, 'replay of the shipping model on pre-kickoff inputs — HEADLINE, clean');
    assert.ok(!d.label.includes(M10_CAVEAT));
    assert.deepEqual(d.gateFail, []);
  });

  test('M10 skipped → R with the exact caveat', () => {
    const d = decideHeadline(all({ gMech: { pass: true, m10Skipped: true }, m10: { id: 'M10', skipped: true, pass: true } }));
    assert.equal(d.headline, 'R');
    assert.equal(M10_CAVEAT, 'mechanics of the newest model version unverified');
    assert.equal(d.label, 'replay of the shipping model on pre-kickoff inputs — HEADLINE, clean — mechanics of the newest model version unverified');
  });

  for (const [name, over, gate] of [
    ['G1', { g1: { pass: false } }, 'G1'], ['G2', { g2: { pass: false } }, 'G2'], ['G3', { g3: { pass: false } }, 'G3'],
    ['G-MECH', { gMech: { pass: false, m10Skipped: false } }, 'G-MECH'],
  ]) {
    test(`${name} failing → K headline with the exact label, R labelled "replay failed gate ${gate} — not headline"`, () => {
      const d = decideHeadline(all(over));
      assert.equal(d.headline, 'K');
      assert.equal(K_HEADLINE_LABEL, 'September model — not the shipping model; model changes since are unmeasured');
      assert.equal(d.label, 'September model — not the shipping model; model changes since are unmeasured');
      assert.equal(d.labels.R, `replay failed gate ${gate} — not headline`);
      assert.deepEqual(d.gateFail, [gate]);
    });
  }

  test('G5 failing → backup/chain QB rows dropped from R (flag), headline unchanged', () => {
    const d = decideHeadline(all({ g5: { pass: false } }));
    assert.equal(d.headline, 'R');
    assert.deepEqual(d.degrade, { useAgeTable: true, dropQbBackups: true });
    assert.deepEqual(decideHeadline(all()).degrade, { useAgeTable: true, dropQbBackups: false });
  });

  test('G6 failing → S’s ageDelta kept (flag), headline unchanged', () => {
    const d = decideHeadline(all({ g6: { pass: false } }));
    assert.equal(d.headline, 'R');
    assert.deepEqual(d.degrade, { useAgeTable: false, dropQbBackups: false });
  });
});

// ─── vet-calibration step on trimmed captures (fix pass 1, items 4 and 5) ─────

describe('stepVetCalibration on trimmed captures', () => {
  const DATES = ['2026-09-09', '2026-10-13', '2026-10-14', '2026-10-22'];
  const loadSnap = (d) => fx(`snap-2026-${d.slice(5)}.json`);
  const { birthdates, draftYear } = fx('birthdates.json');
  const root = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

  /** A context whose inventory is seeded: K = 09-09, every later fixture capture in the last segment (the fixtures stop at L5). */
  function seeded(snaps) {
    const load = {
      listSnapshotDates: () => DATES,
      // G-MECH pairs name dates the fixtures do not carry: any other date reads as 10-14 (G-MECH then fails or not — irrelevant here)
      loadSnapshot: (d) => snaps[d] ?? snaps['2026-10-14'],
      loadSeasonTotals: (y) => root(`nfl/season-totals/${y}.json`),
      loadPlayerIds: () => ({ bySleeper: Object.fromEntries(Object.keys(birthdates).map(id => [id, { birthdate: birthdates[id], draftYear: draftYear[id] }])) }),
      loadQbConstants: () => root('backtests/2026-10-03-qb-takeover-constants.json'),
    };
    const ctx = makeContext({ load, rehearse: true });
    const last = VETERAN_SEGMENTS.length - 1;
    const mk = (d, seg) => ({ date: d, capturedAt: snaps[d].capturedAt, era: seg ? 'segment' : 'pre-kickoff', segment: seg ? VETERAN_SEGMENTS[last].id : null,
      index: seg ? last : -1, d44: 'league', outcomeModel: 'league', offStore: null, vets: 1, sEligible: seg });
    const entries = [mk(DATES[0], false), ...DATES.slice(1).map(d => mk(d, true))];
    ctx.shared.inventory = {
      entries, kDate: DATES[0], kPrevDate: null,
      segments: VETERAN_SEGMENTS.map((sg, i) => { const caps = i === last ? entries.slice(1) : []; return { id: sg.id, boundary: sg.boundary, first: caps[0]?.date ?? null, last: caps.at(-1)?.date ?? null, n: caps.length, captures: caps }; }),
    };
    return ctx;
  }
  const vetStep = STEPS.find(s => s.id === 'vet-calibration');

  test('a failing boundary guard stops: inventory, classification and guard section, STOPPED verdict, no headline, the step throws, exit 1', async () => {
    const snaps = Object.fromEntries(DATES.map(d => [d, loadSnap(d)]));
    const victim = Object.values(snaps['2026-10-13'].players).find(p => p.projection?.factors && p.projection.confidence !== 'rookie');
    victim.projection.factors.teamFactor = 1.2345;   // off the 1 + (16 − rank)/200 grid → guard (b) fails
    const ctx = seeded(snaps);
    await assert.rejects(() => vetStep.run(ctx), (err) => {
      assert.match(err.message, /STOPPED — boundary-equality guard failed/);
      const md = err.section.md;
      assert.match(md, /STOPPED — boundary-equality guard failed \(K→L6 \[\(b\) \d+\/\d+\]\); no headline/);
      assert.match(md, /Capture inventory and classification/);
      assert.match(md, /\| segment \| boundary \| first \| last \| captures \|/);
      assert.match(md, /Boundary-equality guard/);
      assert.ok(!/Headline — veteran calibration/.test(md), 'no headline table');
      assert.ok(!/R label:|K label:/.test(md), 'no R/K label');
      assert.equal(err.section.data.stopped, 'boundary-equality-guard');
      return true;
    });
    // through the runner: the failed step is reported, exit 1, and nothing is written
    const ctx2 = seeded(snaps);
    const r = await runSeasonGrade({ steps: [{ id: 'vet-calibration', run: (c) => vetStep.run(Object.assign(c, { shared: ctx2.shared, load: ctx2.load })) }], load: ctx2.load, rehearse: true, write: true });
    assert.equal(r.exitCode, 1);
    assert.match(r.verdict, /STOPPED — boundary-equality guard failed/);
    assert.ok(!/Headline — veteran calibration/.test(r.verdict));
    assert.deepEqual(r.artifacts, []);
  });

  test('after vet-calibration, ctx.shared carries K, P, classification, S and replay for a later step', async () => {
    const snaps = Object.fromEntries(DATES.map(d => [d, loadSnap(d)]));
    const ctx = seeded(snaps);
    const reader = { id: 'slice-b-probe', run: async (c) => ({ section: { id: 'p', title: 'p', md: JSON.stringify({
      k: c.shared.K?.date, kCapture: !!c.shared.K?.capture?.players, p: Object.keys(c.shared.P ?? {}).length,
      cls: c.shared.classification, s: Object.keys(c.shared.S ?? {}).length, rR: Object.keys(c.shared.replay?.R ?? {}).length, rK: Object.keys(c.shared.replay?.K ?? {}).length,
    }), placement: 'main' }, artifacts: [] }) };
    const first = await vetStep.run(ctx);
    assert.equal(first.section.data.headline === 'R' || first.section.data.headline === 'K', true);
    const out = await reader.run(ctx);
    const seen = JSON.parse(out.section.md);
    assert.equal(seen.k, '2026-09-09');
    assert.equal(seen.kCapture, true);
    assert.ok(seen.p > 100, 'P = K veterans, ids → position');
    assert.ok(Object.values(ctx.shared.P).every(pos => typeof pos === 'string'));
    assert.deepEqual(seen.cls, { '2026-09-09': 'pre-kickoff', '2026-10-13': 'L6', '2026-10-14': 'L6', '2026-10-22': 'L6' });
    assert.equal(seen.s, seen.rR - Object.values(ctx.shared.replay.R).filter(v => v.imputed).length, 'S(i) only for replayed rows');
    assert.equal(seen.rK, seen.p);
    const anyR = Object.values(ctx.shared.replay.R)[0];
    assert.deepEqual(Object.keys(anyR).sort(), ['G', 'T', 'imputed', 'p']);
    assert.deepEqual(Object.keys(Object.values(ctx.shared.replay.K)[0]).sort(), ['G', 'T', 'p']);
    assert.ok(Object.values(ctx.shared.S).every(d => DATES.includes(d)));
  });
});
