/**
 * test/dynasty-rework.test.mjs — S4a dynasty rework (lib/dynastyRework.mjs, scripts/dynasty-rework-run.mjs).
 * Synthetic in-memory loaders and hand-built rows only (Invariant 10); the only repo reads are the committed task
 * file (T-HASH, T-PROBE, T-GATE) and the committed parity fixtures (T-PATHB).
 *
 * T-GRID T-COMP T-PATHB T-FIT T-FOLD T-SEL T-TILT T-DEC T-BOOT T-PARITY T-PIN T-GATE T-PROBE T-HASH T-CLI T-KEYS
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  weightGrid, gridSize, COHORT_ARRAY, POSITIONS, CANDIDATES, level2Of, level2Pool, currentLevel2Score, ageAdj2Score,
  curveRatios, ageFwdScore, composeCandidate, candidateComponents, fitCandidate, rhoOfFit, chooseFromTies, foldPlan,
  selectCandidate, ageTilt, tiltLabel, decide, percentileRank, QB_B2_DELTA_FLOOR, BETA_GRID, referenceWeights,
  K3_REPORT_ONLY_SENTENCE,
} from '../lib/dynastyRework.mjs';
import {
  dynastyScoreMirror, composeDynastyScore, empiricalAgeCurvesMirror, teamContextMirror, historicalTeamTotalsMirror,
  historicalSharesMirror,
} from '../lib/dynastyMirror.mjs';
import {
  DynastyReworkStop, DYNASTY_REWORK_PREREG_SHA256, TASK_FILE, PINNED_REV, preregHash, assertPrereg, readQbFloor,
  checkS3Parity, runFolds, runFinal, viewRows, buildSpecs, bootstrapSpecs, assemble, computeReworkMetrics, computePreview,
  makeGitShow, makeReworkLoad, DYNASTY_REWORK_LOAD, runDynastyRework, runProbe, PROBE_LINE, buildReworkRows,
  buildDynastyReworkVerdictMarkdown, writeDynastyReworkArtifacts, cellOf, metricKey, parseMetricKey, validItems,
  HORIZONS, QB_FLOOR_KEY, NO_WIN_LAST_LINE, countRunSpecs,
} from '../scripts/dynasty-rework-run.mjs';
import { DYNASTY_ASOF_LOAD } from '../scripts/dynasty-asof.mjs';
import { repoPath } from '../lib/io.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const taskText = () => fs.readFileSync(path.join(ROOT, TASK_FILE), 'utf8');

// ─── helpers ─────────────────────────────────────────────────────────────────────────────────────

function lcg(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

/** In-memory row for the fit: all four candidates' fields. `over` overrides raw / row fields. */
function fitRow({ pid, S, position = 'WR', i, rnd, m1, over = {}, rawOver = {} }) {
  const raw = {
    ageAdjScore: rnd() * 100, trajectoryScore: rnd() * 100, currentLevelScore: Math.round(rnd() * 100),
    effectiveReliability: Math.round(rnd() * 100), opportunityScore: Math.round(rnd() * 100),
    seasonsOfData: 5, prospectScore: null, ...rawOver,
  };
  return {
    pid, S, position, age: 22 + (i % 12), path: { sleeper: 'C' }, raw,
    scores: { H: { sleeper: 50 } }, B1: { sleeper: 10 }, B2: { sleeper: 10 }, changer: false,
    outcome: { sleeper: { M1: m1, M2: m1, h: 3 } },
    level2: 8 + rnd() * 10, currentLevel2Score: Math.round(rnd() * 100), ageAdj2Score: rnd() * 100,
    r: [1 + rnd() * 0.2, 1 + rnd() * 0.3, 1 + rnd() * 0.4], peakPPG: 20, opportunityScoreChg: Math.round(rnd() * 100),
    ...over,
  };
}

function noisyRows({ positions = ['WR'], cohorts = COHORT_ARRAY(2015, 2022), n = 25, seed = 7 } = {}) {
  const rnd = lcg(seed);
  const rows = [];
  for (const position of positions) for (const S of cohorts) {
    for (let i = 0; i < n; i++) {
      const row = fitRow({ pid: `${position}${S}_${i}`, S, position, i, rnd, m1: 0 });
      // M1 correlated with currentLevelScore so the objective is not flat; some Path B rows carry a prospect score
      row.outcome.sleeper.M1 = row.raw.currentLevelScore * 0.1 + rnd() * 6 + i * 1e-6;
      row.outcome.sleeper.M2 = row.outcome.sleeper.M1;
      if (i % 5 === 0) { row.raw.seasonsOfData = 2; row.raw.prospectScore = Math.round(rnd() * 100); }
      rows.push(row);
    }
  }
  return rows;
}

// ─── T-GRID ──────────────────────────────────────────────────────────────────────────────────────

describe('T-GRID', () => {
  test('sizes and shape', () => {
    assert.equal(weightGrid(5).length, 10626);
    assert.equal(weightGrid(4).length, 1771);
    for (const k of [4, 5]) {
      for (const v of weightGrid(k)) {
        assert.equal(v.length, k);
        assert.equal(v.reduce((a, b) => a + b, 0), 20);
        assert.ok(v.every(x => Number.isInteger(x) && x >= 0));
      }
    }
    assert.deepEqual(weightGrid(4)[0], [0, 0, 0, 20]);
    assert.deepEqual(weightGrid(4)[weightGrid(4).length - 1], [20, 0, 0, 0]);
    assert.equal(new Set(weightGrid(4).map(v => v.join(','))).size, 1771, 'no duplicates');
  });
  test('grid sizes per candidate', () => {
    assert.deepEqual(CANDIDATES.map(gridSize), [10626, 1771, 10626, 10626]);
    assert.equal(BETA_GRID.length, 6);
  });
});

// ─── T-COMP ──────────────────────────────────────────────────────────────────────────────────────

describe('T-COMP', () => {
  const season = (gp, fp) => ({ gamesPlayed: gp, fantasyPoints: fp });
  test('level2: both seasons, only S, only S−1, neither', () => {
    const cs = {
      2018: { a: season(16, 160), c: season(16, 160), d: season(7, 100) },
      2019: { a: season(16, 192), b: season(16, 192), c: season(6, 90), d: season(7, 100) },
    };
    assert.equal(level2Of(cs, 'a', 2019), 11, '(160/16 + 192/16)/2 = (10 + 12)/2');
    assert.equal(level2Of(cs, 'b', 2019), 12, 'only S qualifies');
    assert.equal(level2Of(cs, 'c', 2019), 10, 'only S−1 qualifies (S has 6 games)');
    assert.equal(level2Of(cs, 'd', 2019), null, 'neither qualifies');
    assert.equal(level2Of(cs, 'zz', 2019), null);
  });
  test('currentLevel2Score against a hand-sorted pool; the pool filters position, games and value > 0', () => {
    const cs = {
      2018: { p2: season(16, 192), p5: season(16, 0) },
      2019: {
        p1: season(16, 128), p2: season(16, 160), p3: season(16, 224), p4: season(7, 200), p5: season(16, 0),
        r1: season(16, 400), TEAM_BUF: season(17, 900),
      },
    };
    const pm = { p1: { position: 'WR' }, p2: { position: 'WR' }, p3: { position: 'WR' }, p4: { position: 'WR' }, p5: { position: 'WR' }, r1: { position: 'RB' } };
    // WR pool: p1 8, p2 (12 + 10)/2 = 11, p3 14; p4 has 7 games, p5 has value 0, r1 is an RB, TEAM_BUF is not in playersMap
    assert.deepEqual(level2Pool(cs, pm, 2019, 'WR'), [8, 11, 14]);
    const pool = [8, 11, 14];
    assert.equal(currentLevel2Score(pool, 11), 33, 'one of three below: round(100/3)');
    assert.equal(currentLevel2Score(pool, 14), 67);
    assert.equal(currentLevel2Score(pool, 8), 0);
    assert.equal(currentLevel2Score(pool, 20), 100);
    assert.equal(currentLevel2Score([], 5), 50, 'empty pool → 50, as the mirror');
    assert.equal(percentileRank(pool, 11), 33);
  });
  const curve = [{ age: 24, medianPPG: 10 }, { age: 28, medianPPG: 20 }, { age: 32, medianPPG: 10 }];
  test('ageAdj2Score incl. the null-age path and the clamps', () => {
    // age 26: c = 10 + (2/4)·10 = 15; ageFactor = 15/20 = 0.75; level2 15: (15/20)/0.75 = 1 → 50
    assert.ok(Math.abs(ageAdj2Score({ level2: 15, age: 26, curve, peakPPG: 20 }) - 50) < 1e-9);
    // null age: expectedMedian = 20 × 0.7 = 14; ageFactor 0.7; level2 14: (14/20)/0.7 = 1 → 50
    assert.ok(Math.abs(ageAdj2Score({ level2: 14, age: null, curve, peakPPG: 20 }) - 50) < 1e-9);
    assert.equal(ageAdj2Score({ level2: 40, age: 26, curve, peakPPG: 20 }), 100, 'clamped');
    assert.equal(ageAdj2Score({ level2: 15, age: 26, curve: [{ age: 24, medianPPG: 0 }], peakPPG: 20 }), 0, 'ageFactor ≤ 0 → 0');
  });
  test('curveRatios: ages age, age+1, age+2 over the base c(age − 1); neutral when age is null or the base ≤ 0', () => {
    // age 26: base c(25) = 10 + (1/4)·10 = 12.5; c(26) = 15, c(27) = 17.5, c(28) = 20
    const r = curveRatios(curve, 26);
    assert.ok(Math.abs(r[0] - 1.2) < 1e-12 && Math.abs(r[1] - 1.4) < 1e-12 && Math.abs(r[2] - 1.6) < 1e-12);
    assert.deepEqual(curveRatios(curve, null), [1, 1, 1]);
    assert.deepEqual(curveRatios([], 26), [1, 1, 1]);
  });
  test('ageFwdScore: β = 0 is the curve-only value; the (1 − β) exponent counts seasons at age 30+', () => {
    const base = { level2: 10, peakPPG: 20 };
    // β = 0, age 26, r = [1.2, 1.4, 1.6]: F = 4.2/3 = 1.4 → 50 × 10 × 1.4 / 20 = 35
    assert.ok(Math.abs(ageFwdScore({ ...base, age: 26, r: curveRatios(curve, 26) }, 0) - 35) < 1e-9);
    const flat = { ...base, r: [1, 1, 1] };
    // age 30, β = 0.1: seasons at ages 30, 31, 32 → exponents 1, 2, 3: F = (0.9 + 0.81 + 0.729)/3 = 0.813 → 50 × 10 × 0.813 / 20 = 20.325
    assert.ok(Math.abs(ageFwdScore({ ...flat, age: 30 }, 0.1) - 20.325) < 1e-9);
    // age 29: ages 29, 30, 31 → exponents 0, 1, 2: F = (1 + 0.9 + 0.81)/3 → 22.58333…
    assert.ok(Math.abs(ageFwdScore({ ...flat, age: 29 }, 0.1) - 50 * 10 * ((1 + 0.9 + 0.81) / 3) / 20) < 1e-9);
    // age 27: ages 27, 28, 29 → no extra decline: F = 1 → 25
    assert.ok(Math.abs(ageFwdScore({ ...flat, age: 27 }, 0.1) - 25) < 1e-9);
    // null age → F = 1 whatever r says
    assert.ok(Math.abs(ageFwdScore({ ...base, age: null, r: [9, 9, 9] }, 0.2) - 25) < 1e-9);
    assert.equal(ageFwdScore({ level2: 100, peakPPG: 20, age: 27, r: [1, 1, 1] }, 0), 100, 'clamped');
  });
  test('candidate components are in the pre-registered order', () => {
    const row = fitRow({ pid: 'x', S: 2019, i: 3, rnd: lcg(3), m1: 1 });
    const raw = row.raw;
    assert.deepEqual(candidateComponents(row, 'K0', null), [raw.ageAdjScore, raw.trajectoryScore, raw.currentLevelScore, raw.effectiveReliability, raw.opportunityScore]);
    assert.deepEqual(candidateComponents(row, 'K1', null), [row.ageAdj2Score, row.currentLevel2Score, raw.effectiveReliability, raw.opportunityScore]);
    assert.deepEqual(candidateComponents(row, 'K2', 0.04), [ageFwdScore(row, 0.04), row.currentLevel2Score, raw.effectiveReliability, raw.opportunityScore]);
    assert.deepEqual(candidateComponents(row, 'K3', 0.04), [ageFwdScore(row, 0.04), row.currentLevel2Score, raw.effectiveReliability, row.opportunityScoreChg]);
    assert.throws(() => composeCandidate(row, 'K1', [0.5, 0.5], null), /takes 4 weights/);
  });
  test('Path B blends the prospect score 0.4 / 0.6', () => {
    const row = fitRow({ pid: 'x', S: 2019, i: 0, rnd: lcg(3), m1: 1, rawOver: { seasonsOfData: 2, prospectScore: 80, ageAdjScore: 50, trajectoryScore: 50, currentLevelScore: 50, effectiveReliability: 50, opportunityScore: 50 } });
    // component = 50; Path B: round(80 × 0.4 + 50 × 0.6) = 62
    assert.equal(composeCandidate(row, 'K0', [0.28, 0.25, 0.22, 0.10, 0.15], null), 62);
  });
});

// ─── T-PATHB ─────────────────────────────────────────────────────────────────────────────────────

describe('T-PATHB K0 reproduces the mirror on the committed goldens', () => {
  const dir = path.join(ROOT, 'test', 'fixtures', 'dynasty-mirror-parity');
  const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const inputs = read('inputs-2019.json'), expected = read('expected-2019.json');
  for (const mode of ['current-team', 'per-season-team']) {
    test(`2019 ${mode}: every Path B/C row`, () => {
      const { S, currentYear, scoringSettings, playersMap, depthMap, careerStats } = inputs;
      // the golden's own configuration (not H): its curves and peaks
      const bundle = empiricalAgeCurvesMirror(careerStats, playersMap, { currentYear });
      const tc = teamContextMirror(careerStats, playersMap, S, { attribution: mode });
      const totals = historicalTeamTotalsMirror(careerStats, playersMap, { attribution: mode });
      const shares = historicalSharesMirror(careerStats, playersMap, totals, { attribution: mode });
      let n = 0, nB = 0;
      for (const pid of Object.keys(playersMap)) {
        const res = dynastyScoreMirror(
          pid, playersMap, careerStats, bundle.curves, bundle.positionPeakPPG, null, scoringSettings, null,
          tc, depthMap, shares, bundle.positionPeakAge, bundle.positionBasisScale, null, null, {},
        );
        if (!res.components) continue;
        n++;
        if (res.raw.seasonsOfData <= 2) nB++;
        const golden = expected.scores[mode][pid].score;
        const got = composeCandidate({ raw: res.raw }, 'K0', [0.28, 0.25, 0.22, 0.10, 0.15], null);
        assert.equal(got, golden, `pid ${pid}`);
        assert.equal(got, composeDynastyScore(res.raw), `pid ${pid} vs composeDynastyScore`);
      }
      assert.ok(n > 50 && nB > 0, `B/C rows ${n}, of which Path B ${nB}`);
    });
  }
});

// ─── T-FIT ───────────────────────────────────────────────────────────────────────────────────────

describe('T-FIT', () => {
  test('a known perfect corner is found (K1: all weight on currentLevel2Score)', () => {
    const rnd = lcg(11);
    const rows = [];
    for (const S of COHORT_ARRAY(2015, 2019)) for (let i = 0; i < 30; i++) {
      rows.push(fitRow({ pid: `w${S}_${i}`, S, i, rnd, m1: i, over: { currentLevel2Score: i * 3 } }));
    }
    const fit = fitCandidate(rows, 'K1', COHORT_ARRAY(2015, 2019), 'WR');
    assert.deepEqual(fit.weights, [0, 20, 0, 0]);
    assert.ok(Math.abs(fit.objective - 1) < 1e-12);
    assert.equal(fit.beta, null);
  });
  test('K0 corner: all weight on currentLevelScore (index 2)', () => {
    const rnd = lcg(12);
    const rows = [];
    for (const S of COHORT_ARRAY(2015, 2019)) for (let i = 0; i < 30; i++) {
      rows.push(fitRow({ pid: `w${S}_${i}`, S, i, rnd, m1: i, rawOver: { currentLevelScore: i * 3 } }));
    }
    assert.deepEqual(fitCandidate(rows, 'K0', COHORT_ARRAY(2015, 2019), 'WR').weights, [0, 0, 20, 0, 0]);
  });
  test('fewer than 20 evaluable rows in every fit cohort → insufficient; rows without M1 do not count', () => {
    const rows = noisyRows({ n: 19, cohorts: [2015, 2016] });
    assert.equal(fitCandidate(rows, 'K1', [2015, 2016], 'WR'), 'insufficient');
    const more = noisyRows({ n: 21, cohorts: [2015] });
    for (const r of more.slice(0, 2)) r.outcome.sleeper.M1 = null;
    assert.equal(fitCandidate(more, 'K1', [2015], 'WR'), 'insufficient', '21 rows − 2 without M1 = 19');
    assert.equal(fitCandidate(more, 'K1', [2015], 'QB'), 'insufficient', 'no rows at the position');
  });
  test('the grid objective equals an independent ρ computation at the chosen weights (all four candidates, Path B rows included)', () => {
    const rows = noisyRows({ cohorts: [2015, 2016, 2017] });
    for (const K of CANDIDATES) {
      const fit = fitCandidate(rows, K, [2015, 2016, 2017], 'WR');
      const rhos = [2015, 2016, 2017].map(S => rhoOfFit(rows, K, fit, S, 'WR'));
      const mean = rhos.reduce((a, b) => a + b, 0) / rhos.length;
      assert.ok(Math.abs(mean - fit.objective) < 1e-12, `${K}: ${mean} vs ${fit.objective}`);
      assert.equal(fit.weights.reduce((a, b) => a + b, 0), 20);
      if (K === 'K2' || K === 'K3') assert.ok(BETA_GRID.includes(fit.beta)); else assert.equal(fit.beta, null);
    }
  });
  test('tie-break: L1 distance within 1e-9 counts as equal, then smaller β, then the lexicographically smallest vector', () => {
    const t = (ints, beta, dist) => ({ ints, beta, dist });
    assert.deepEqual(chooseFromTies([t([1, 19], 0.04, 0.3), t([2, 18], 0, 0.3 + 1e-12), t([0, 20], 0, 0.3 - 5e-10)]).ints, [0, 20], 'noise-level distance gaps fall through to β then lexicographic');
    assert.deepEqual(chooseFromTies([t([5, 15], 0.08, 0.3), t([9, 11], 0.04, 0.3 + 2e-10)]).ints, [9, 11], 'smaller β wins');
    assert.deepEqual(chooseFromTies([t([5, 15], 0, 0.3), t([9, 11], 0, 0.3 - 2e-9)]).ints, [9, 11], 'a real distance gap wins');
    assert.deepEqual(chooseFromTies([t([3, 17], null, 0.3), t([3, 16], null, 0.3), t([2, 18], null, 0.3)]).ints, [2, 18]);
  });
  test('tie-break end to end: weights splitting two identical components tie; the reference decides, then lexicographic order', () => {
    const rnd = lcg(21);
    const rows = [];
    for (const S of COHORT_ARRAY(2015, 2019)) for (let i = 0; i < 30; i++) {
      rows.push(fitRow({ pid: `t${S}_${i}`, S, i, rnd, m1: i, over: { currentLevel2Score: i * 3, ageAdj2Score: i * 3 } }));
    }
    // K1 components [ageAdj2, currentLevel2, reliability, opportunity]; the first two are identical, so every [a, 20 − a, 0, 0]
    // scores identically (objective 1). Reference (÷ 0.75) = [0.3733, 0.2933, 0.1333, 0.2]: L1 = |a/20 − 0.3733| + |0.7067 − a/20| + 0.3333,
    // which is 0.6667 for every a/20 in [0.3733, 0.7067], i.e. a = 8…14 (equal up to floating-point noise) → the lexicographically smallest is a = 8.
    const ref = referenceWeights('K1');
    assert.ok(Math.abs(ref[0] - 0.28 / 0.75) < 1e-15);
    const fit = fitCandidate(rows, 'K1', COHORT_ARRAY(2015, 2019), 'WR');
    assert.deepEqual(fit.weights, [8, 12, 0, 0]);
  });
});

// ─── T-FOLD ──────────────────────────────────────────────────────────────────────────────────────

describe('T-FOLD', () => {
  test('loco plan equals §5.4 exactly; no fit cohort is within 2 of its T', () => {
    const plan = foldPlan('loco');
    assert.deepEqual(plan.map(f => f.T), COHORT_ARRAY(2015, 2022));
    const want = {
      2015: [2018, 2019, 2020, 2021, 2022], 2016: [2019, 2020, 2021, 2022], 2017: [2020, 2021, 2022],
      2018: [2015, 2021, 2022], 2019: [2015, 2016, 2022], 2020: [2015, 2016, 2017], 2021: [2015, 2016, 2017, 2018], 2022: [2015, 2016, 2017, 2018, 2019],
    };
    for (const f of plan) {
      assert.deepEqual(f.fit, want[f.T], `T ${f.T}`);
      assert.ok(f.fit.every(F => Math.abs(F - f.T) >= 3));
    }
  });
  test('forward plan: T 2018…2022, fit {2015 … T−3}; short plan', () => {
    assert.deepEqual(foldPlan('forward'), [
      { T: 2018, fit: [2015] }, { T: 2019, fit: [2015, 2016] }, { T: 2020, fit: [2015, 2016, 2017] },
      { T: 2021, fit: [2015, 2016, 2017, 2018] }, { T: 2022, fit: [2015, 2016, 2017, 2018, 2019] },
    ]);
    assert.deepEqual(foldPlan('short'), [{ T: 2023, fit: COHORT_ARRAY(2015, 2020) }, { T: 2024, fit: COHORT_ARRAY(2015, 2021) }]);
    assert.throws(() => foldPlan('nope'));
  });
  test("perturbing a test cohort's outcomes leaves the fold's fitted weights unchanged", () => {
    const rows = noisyRows({ cohorts: COHORT_ARRAY(2015, 2022), n: 22 });
    const plan = [{ T: 2018, fit: [2015, 2021, 2022] }];
    const a = runFolds({ rows, plan, slot: 'loco' });
    const perturbed = rows.map(r => (r.S === 2018 ? { ...r, outcome: { sleeper: { M1: -r.outcome.sleeper.M1, M2: 0, h: 3 } } } : r));
    const b = runFolds({ rows: perturbed, plan, slot: 'loco' });
    assert.deepEqual(a[0].perCandidate, b[0].perCandidate);
    assert.equal(a[0].chosen, b[0].chosen);
    assert.ok(a[0].perCandidate.K0.WR.objective != null);
    assert.equal(a[0].perCandidate.K0.QB, 'insufficient', 'no QB rows → insufficient');
  });
});

// ─── T-SEL ───────────────────────────────────────────────────────────────────────────────────────

describe('T-SEL', () => {
  const fit = (o) => ({ weights: [20, 0, 0, 0], beta: null, objective: o });
  const fits = (sums) => Object.fromEntries(Object.entries(sums).map(([K, o]) => [K, Object.fromEntries(POSITIONS.map(p => [p, o == null ? 'insufficient' : fit(o / 4)]))]));
  test('highest summed objective among K0, K1, K2', () => {
    assert.equal(selectCandidate(fits({ K0: 1.0, K1: 2.0, K2: 1.5, K3: 0.1 })).chosen, 'K1');
  });
  test('K3 is never chosen, even with the highest objective', () => {
    const r = selectCandidate(fits({ K0: 1.0, K1: 1.1, K2: 1.2, K3: 3.9 }));
    assert.equal(r.chosen, 'K2');
    assert.ok(r.sums.K3 > r.sums.K2);
  });
  test('an insufficient fit counts 0; a tie goes to the lower index', () => {
    const f = fits({ K0: 1.0, K1: 1.0, K2: 0.5, K3: 0 });
    assert.equal(selectCandidate(f).chosen, 'K0');
    f.K0 = Object.fromEntries(POSITIONS.map(p => [p, p === 'QB' ? 'insufficient' : fit(0.25)]));
    assert.equal(selectCandidate(f).chosen, 'K1', 'K0 now sums 0.75 < K1 1.0');
    const allInsufficient = fits({ K0: null, K1: null, K2: null, K3: null });
    assert.equal(selectCandidate(allInsufficient).chosen, 'K0');
  });
  test('an insufficient fold × position leaves P null for those test rows; they drop out of the paired comparison', () => {
    const rows = [...noisyRows({ positions: ['WR'], cohorts: COHORT_ARRAY(2015, 2022), n: 22 }), ...noisyRows({ positions: ['QB'], cohorts: [2018, 2019], n: 22, seed: 5 })];
    const out = runFolds({ rows, plan: [{ T: 2018, fit: [2015, 2021, 2022] }], slot: 'loco' });
    assert.equal(out[0].perCandidate.K0.QB, 'insufficient');
    const qb2018 = rows.filter(r => r.position === 'QB' && r.S === 2018);
    const wr2018 = rows.filter(r => r.position === 'WR' && r.S === 2018);
    assert.ok(qb2018.every(r => r.oofSets.loco.P === null && r.oofSets.loco['K0-oof'] === null));
    assert.ok(wr2018.every(r => r.oofSets.loco.P != null));
    const view = viewRows(qb2018, { id: 'x', cohorts: [2018], slot: 'loco' });
    assert.ok(view.every(r => r.scores.P.sleeper === null && r.scores.Hp.sleeper === null && r.scores.B2p.sleeper === null), 'the paired-mask copies follow P');
    const ents = view.map(row => ({ row, slot: 0 }));
    assert.equal(validItems(ents, 'sleeper', 'M1', 'P', 'B2', null).length, 0, 'no P → no pair');
    assert.equal(validItems(ents, 'sleeper', 'M1', 'B2', 'P', null).length, 0);
    assert.equal(validItems(ents, 'sleeper', 'M1', 'B2', null, null).length, 22, 'B2 alone is still evaluable');
  });
});

// ─── T-TILT ──────────────────────────────────────────────────────────────────────────────────────

/** Hand-built panel row (in-memory shape) with out-of-fold scores installed. */
function pRow({ pid, S, position = 'QB', age = 26, h, b2, m1, m2 = m1, P }) {
  return {
    pid, S, position, age, path: { sleeper: 'C' }, scores: { H: { sleeper: h } }, B1: { sleeper: b2 }, B2: { sleeper: b2 },
    outcome: { sleeper: { M1: m1, M2: m2, h: 3 } }, changer: false,
    oofSets: { loco: { P, 'K0-oof': P, 'K1-oof': P, 'K2-oof': P, 'K3-oof': P } },
  };
}

describe('T-TILT', () => {
  test('tilt = mean bias(ge31) − mean bias(le24); a short band has no tilt', () => {
    const items = [
      ...Array.from({ length: 30 }, () => ({ age: 23, bias: -10 })), ...Array.from({ length: 30 }, () => ({ age: 33, bias: 20 })),
      ...Array.from({ length: 10 }, () => ({ age: 26, bias: 999 })),
    ];
    const t = ageTilt(items);
    assert.equal(t.tilt, 30);
    assert.equal(t.nLe24, 30);
    assert.equal(ageTilt(items.slice(1)).tilt, null, 'le24 has 29 rows');
    assert.equal(ageTilt(items.filter((x, i) => !(x.age === 33 && i < 31))).tilt, null, 'ge31 has 29 rows');
    assert.equal(ageTilt([{ age: 33, bias: -5 }, { age: 22, bias: 5 }], { minBand: 1 }).tilt, -10, 'older rated lower → negative tilt');
  });
  test('tilt-removed needs both conditions', () => {
    const cell = (ci, label = 'no-detectable-bias') => ({ ci95: ci, label });
    assert.equal(tiltLabel(cell([-3, 4]), cell([1, 9])), 'tilt-removed');
    assert.equal(tiltLabel(cell([0, 4]), cell([0.1, 9])), 'tilt-removed', 'CI touching 0 includes it');
    assert.equal(tiltLabel(cell([1, 4]), cell([1, 9])), 'tilt-remains', 'tilt(P) CI excludes 0');
    assert.equal(tiltLabel(cell([-3, 4]), cell([0, 9])), 'tilt-remains', 'reduction CI lower must be > 0');
    assert.equal(tiltLabel(cell([-3, 4]), cell([-2, 9])), 'tilt-remains');
    assert.equal(tiltLabel(cell(null, 'insufficient'), cell([1, 9])), 'insufficient');
    assert.equal(tiltLabel(cell([-3, 4]), cell([1, 9], 'insufficient')), 'insufficient');
    assert.equal(tiltLabel(null, cell([1, 9])), 'insufficient');
  });
  const tiltSpecFor = (rows, subject) => {
    const hz = HORIZONS[0];
    const specs = buildSpecs(hz, 'QB').filter(s => s.parts.kind === 'tilt' && s.parts.subject === subject);
    return { specs, view: viewRows(rows, hz) };
  };
  const bandRows = ({ nLe, nGe, nMid, cohorts = COHORT_ARRAY(2015, 2022) }) => {
    const rows = [];
    for (const S of cohorts) {
      let i = 0;
      const mk = (age, count) => { for (let j = 0; j < count; j++, i++) rows.push(pRow({ pid: `q${S}_${i}`, S, age, h: i % 50, b2: (i * 7) % 50, m1: (i * 3) % 50 + 0.5, P: (i * 5) % 50 })); };
      mk(22, nLe); mk(33, nGe); mk(26, nMid);
    }
    return rows;
  };
  test('enough rows: nothing is dropped, used = resamples ≥ 2,000, the cell is not insufficient', () => {
    const rows = bandRows({ nLe: 12, nGe: 12, nMid: 16 }); // pooled 96 per band
    const { specs, view } = tiltSpecFor(rows, 'P');
    const out = bootstrapSpecs({ rows: view, groupKey: r => r.S, specs, resamples: 2100, seed: 12345 });
    const metrics = {};
    assemble(specs[0], out[0], (parts, cell) => { Object.assign(metrics, { cell }); });
    assert.equal(metrics.cell.used, 2100);
    assert.notEqual(metrics.cell.label, 'insufficient');
    assert.equal(metrics.cell.n, 96);
  });
  test('resamples with a short band are dropped and counted; used < 2,000 → insufficient', () => {
    const rows = bandRows({ nLe: 4, nGe: 4, nMid: 1, cohorts: [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022] }); // 32 per band pooled: resamples often fall under 30
    const { specs, view } = tiltSpecFor(rows, 'P');
    const out = bootstrapSpecs({ rows: view, groupKey: r => r.S, specs, resamples: 300, seed: 12345 });
    assert.ok(out[0].boot.used < 300 && out[0].boot.used > 0, `used ${out[0].boot.used} of 300`);
    let cell;
    assemble(specs[0], out[0], (parts, c) => { cell = c; });
    assert.equal(cell.label, 'insufficient');
    assert.ok(cell.used < 2000);
  });
  test('a short band on the original data → v null → insufficient', () => {
    const rows = bandRows({ nLe: 3, nGe: 3, nMid: 3 }); // 24 per band pooled
    const { specs, view } = tiltSpecFor(rows, 'P');
    const out = bootstrapSpecs({ rows: view, groupKey: r => r.S, specs, resamples: 50, seed: 1 });
    assert.equal(out[0].point.v, null);
    let cell;
    assemble(specs[0], out[0], (parts, c) => { cell = c; });
    assert.equal(cell.label, 'insufficient');
    assert.equal(cell.value, null);
  });
});

// ─── T-DEC ───────────────────────────────────────────────────────────────────────────────────────

describe('T-DEC', () => {
  const ok = (extra = {}) => ({ b2Label: 'beats-B2', b1Label: 'beats-B1', b2Delta: 0.1, tiltLabel: 'tilt-removed', ...extra });
  const qbOk = (extra = {}) => ({ b2Label: 'no-difference', b1Label: 'no-difference', b2Delta: -0.05, tiltLabel: 'tilt-removed', ...extra });
  const all = (over = {}) => ({ QB: qbOk(), RB: ok(), WR: ok(), TE: ok(), ...over });
  test('S4A-WIN only when RB, WR, TE beat B2 with the tilt removed and QB passes its three conditions', () => {
    assert.equal(decide(all()).decision, 'S4A-WIN');
    for (const pos of ['RB', 'WR', 'TE']) {
      for (const bad of [{ b2Label: 'no-difference' }, { b2Label: 'loses-to-B2' }, { b2Label: 'insufficient' }, { tiltLabel: 'tilt-remains' }, { tiltLabel: 'insufficient' }]) {
        const d = decide(all({ [pos]: ok(bad) }));
        assert.equal(d.decision, 'S4A-NO-WIN', `${pos} ${JSON.stringify(bad)}`);
        assert.equal(d.positions[pos].pass, false);
      }
    }
  });
  test('QB: no difference on both with point Δ −0.05 and tilt removed passes; −0.06 fails; exactly the floor passes', () => {
    assert.equal(decide(all()).positions.QB.pass, true);
    assert.equal(decide(all({ QB: qbOk({ b2Delta: -0.06 }) })).positions.QB.pass, false);
    assert.equal(decide(all({ QB: qbOk({ b2Delta: -0.052245 }) })).positions.QB.pass, true);
    assert.equal(decide(all({ QB: qbOk({ b2Delta: -0.052246 }) })).positions.QB.pass, false);
    assert.equal(decide(all({ QB: qbOk({ b2Delta: null }) })).positions.QB.pass, false);
    assert.equal(QB_B2_DELTA_FLOOR, -0.052245);
  });
  test('QB: loses-to-B1, loses-to-B2, insufficient on either baseline, tilt-remains → fail', () => {
    for (const bad of [{ b1Label: 'loses-to-B1' }, { b2Label: 'loses-to-B2' }, { b1Label: 'insufficient' }, { b2Label: 'insufficient' }, { tiltLabel: 'tilt-remains' }]) {
      assert.equal(decide(all({ QB: qbOk(bad) })).positions.QB.pass, false, JSON.stringify(bad));
    }
    assert.equal(decide(all({ QB: qbOk({ b1Label: 'beats-B1', b2Label: 'beats-B2' }) })).positions.QB.pass, true);
  });
  test('decide compares the rounded Cell value: a raw −0.0522451 stored as −0.052245 passes', () => {
    const rows = [];
    const rawDelta = -0.0522451;
    const specs = [{ parts: { horizon: 'h3', measure: 'M1', mode: 'sleeper', kind: 'delta', subject: 'P~B2', statistic: 'rho', position: 'QB', cell: 'all' }, minN: 0, minC: 0, label: () => 'no-difference' }];
    let cell;
    assemble(specs[0], { point: { v: rawDelta, c: 8, n: 200 }, boot: { ci95: [-0.1, 0.1], used: 4000 } }, (p, c) => { cell = c; });
    assert.equal(cell.value, -0.052245);
    assert.ok(rawDelta < QB_B2_DELTA_FLOOR, 'the raw value alone would fail');
    assert.equal(decide(all({ QB: qbOk({ b2Delta: cell.value }) })).positions.QB.pass, true);
    assert.deepEqual(rows, []);
  });
  test('readQbFloor reads the S3 key and stops unless it is exactly −0.052245', () => {
    const load = (v) => ({ loadS3Panel: () => ({ metrics: { [QB_FLOOR_KEY]: { value: v } } }) });
    assert.equal(readQbFloor(load(-0.052245)), -0.052245);
    assert.throws(() => readQbFloor(load(-0.052)), DynastyReworkStop);
    assert.throws(() => readQbFloor(load(-0.0522451)), DynastyReworkStop);
    assert.throws(() => readQbFloor({ loadS3Panel: () => ({ metrics: {} }) }), DynastyReworkStop);
  });
});

// ─── T-BOOT ──────────────────────────────────────────────────────────────────────────────────────

describe('T-BOOT', () => {
  const cohortsAll = COHORT_ARRAY(2015, 2022);
  const mk = (copyB2) => {
    const rows = [];
    for (const S of cohortsAll) for (let i = 0; i < 40; i++) {
      const b2 = (i * 7) % 40 + (S % 3) * 0.01;
      rows.push(pRow({ pid: `b${S}_${i}`, S, age: 22 + (i % 14), h: (i * 3) % 40, b2, m1: (i * 11) % 40 + i * 0.001, P: copyB2 ? b2 : (i * 13) % 40 }));
    }
    return rows;
  };
  test('paired bootstrap with P ≡ B2 gives Δ ≡ 0 and CI [0, 0]', () => {
    const { metrics } = computeReworkMetrics(mk(true), { resamples: 60 });
    const c = metrics[metricKey({ horizon: 'h3', measure: 'M1', mode: 'sleeper', kind: 'delta', subject: 'P~B2', statistic: 'rho', position: 'QB', cell: 'all' })];
    assert.equal(c.value, 0);
    assert.deepEqual(c.ci95, [0, 0]);
    assert.ok(c.used > 50 && c.used <= 60, `used ${c.used}`);
    assert.equal(c.label, 'no-difference');
    assert.equal(c.n, 320);
    assert.equal(c.cohortsUsed, 8);
  });
  test('weights stay fixed across resamples: the bootstrap never refits (scores unchanged, results deterministic)', () => {
    const rows = mk(false);
    const before = JSON.stringify(rows.map(r => r.oofSets));
    const a = computeReworkMetrics(rows, { resamples: 40 });
    assert.equal(JSON.stringify(rows.map(r => r.oofSets)), before);
    const b = computeReworkMetrics(rows, { resamples: 40 });
    assert.deepEqual(a.metrics, b.metrics);
  });
  test('an under-minimum position is insufficient (fewer than 6 cohorts or 160 rows)', () => {
    const rows = mk(false).filter(r => r.S <= 2019); // 5 cohorts
    const { metrics } = computeReworkMetrics(rows, { resamples: 30 });
    const c = metrics[metricKey({ horizon: 'h3', measure: 'M1', mode: 'sleeper', kind: 'delta', subject: 'P~B2', statistic: 'rho', position: 'QB', cell: 'all' })];
    assert.equal(c.label, 'insufficient');
  });
});

// ─── T-PARITY ────────────────────────────────────────────────────────────────────────────────────

describe('T-PARITY', () => {
  const mkRows = () => [0, 1, 2].map(i => ({
    pid: `PID_UNIQUE_${i}`, S: 2015, age: 25 + i, changer: i === 1, scores: { H: { sleeper: 40 + i } },
    B1: { sleeper: 10 + i }, B2: { sleeper: 11 + i }, outcome: { sleeper: { M1: 9 + i, M2: 8 + i, h: 3 } }, path: { sleeper: 'C' },
  }));
  const asPanel = (rows) => ({ meta: { preregSha256: 'x' }, rows: JSON.parse(JSON.stringify(rows.map(r => ({ ...r })))) });
  test('equal panels pass and count rows', () => {
    const rows = mkRows();
    assert.deepEqual(checkS3Parity(rows, asPanel(rows), [2015]), { rowsChecked: 3, mismatches: 0 });
  });
  test('S3 rows outside the requested cohorts or off Path B/C are ignored', () => {
    const rows = mkRows();
    const panel = asPanel(rows);
    panel.rows.push({ ...panel.rows[0], S: 2016, pid: 'other' }, { ...panel.rows[0], pid: 'A3', path: { sleeper: 'A3' } });
    assert.equal(checkS3Parity(rows, panel, [2015]).rowsChecked, 3);
  });
  test('one H score, one missing row or one outcome that differs throws a stop whose message has counts only', () => {
    const rows = mkRows();
    const badH = asPanel(rows); badH.rows[1].scores.H.sleeper = 76.123456;
    const missing = asPanel(rows); missing.rows.pop();
    const badOut = asPanel(rows); badOut.rows[2].outcome.sleeper.M1 = 4242.5;
    const extra = asPanel(rows); extra.rows.push({ ...extra.rows[0], pid: 'PID_UNIQUE_EXTRA' });
    for (const [panel, field] of [[badH, 'H'], [missing, 'rowset'], [badOut, 'M1'], [extra, 'rowset']]) {
      assert.throws(() => checkS3Parity(rows, panel, [2015]), (e) => {
        assert.ok(e instanceof DynastyReworkStop);
        assert.match(e.message, new RegExp(`2015 ${field}: 1`));
        assert.equal(e.count, 1);
        assert.doesNotMatch(e.message, /PID_UNIQUE|76\.12|4242/, 'no pid and no value');
        return true;
      });
    }
  });
});

// ─── T-PIN ───────────────────────────────────────────────────────────────────────────────────────

describe('T-PIN', () => {
  test('playerids and raw players are read once from rev a791db0 through the exec seam', () => {
    const calls = [];
    const exec = (cmd, args, opts) => { calls.push({ cmd, args, opts }); return Buffer.from(args[1].endsWith('playerids.json') ? '{"bySleeper":{"1":{"birthdate":"1990-01-01"}}}' : '{"1":{"position":"WR"}}'); };
    const load = makeReworkLoad({ gitShow: makeGitShow(exec) });
    assert.equal(calls.length, 0, 'nothing is read at construction');
    assert.equal(load.loadPlayerIds().bySleeper['1'].birthdate, '1990-01-01');
    assert.equal(load.loadPlayerIds(), load.loadPlayerIds(), 'parsed once');
    assert.equal(load.loadRawPlayers()['1'].position, 'WR');
    load.loadRawPlayers();
    assert.equal(calls.length, 2);
    assert.equal(PINNED_REV, 'a791db0');
    assert.deepEqual(calls[0], { cmd: 'git', args: ['show', 'a791db0:nflverse/playerids.json'], opts: { cwd: repoPath('.'), maxBuffer: 1 << 30 } });
    assert.deepEqual(calls[1], { cmd: 'git', args: ['show', 'a791db0:raw/-players-nfl.json'], opts: { cwd: repoPath('.'), maxBuffer: 1 << 30 } });
  });
  test('the default load replaces both loaders (and nothing else of the as-of load)', () => {
    assert.notEqual(DYNASTY_REWORK_LOAD.loadPlayerIds, DYNASTY_ASOF_LOAD.loadPlayerIds);
    assert.notEqual(DYNASTY_REWORK_LOAD.loadRawPlayers, DYNASTY_ASOF_LOAD.loadRawPlayers);
    for (const k of ['loadSeasonTotals', 'loadDepth', 'loadAdvstats', 'loadSnapShare', 'loadRosterWeekly', 'loadLeaguePositionOf', 'loadLeagueScoring', 'loadManifest']) {
      assert.equal(DYNASTY_REWORK_LOAD[k], DYNASTY_ASOF_LOAD[k], k);
    }
  });
});

// ─── synthetic store (probe) ─────────────────────────────────────────────────────────────────────

const TEAMS = Array.from({ length: 32 }, (_, i) => `T${i}`);
const srow = (gp, fp, team) => ({ gamesPlayed: gp, fantasyPoints: fp, scoringBasis: 'half_ppr', team, stats: { rec: Math.round(fp) } });
const POS = { 1: 'WR', 2: 'RB', 3: 'TE', 4: 'QB' };

function makeStore() {
  const season = {};
  for (let y = 2012; y <= 2025; y++) season[y] = {};
  for (let y = 2015; y <= 2025; y++) {
    season[y][1] = srow(16, 192, 'BUF'); season[y][3] = srow(16, 160, 'KC'); season[y][4] = srow(16, 256, 'KC');
    season[y][2] = srow(12, 120, 'LAC');
  }
  const depth = { weeks: { 17: Object.fromEntries(TEAMS.map((t, i) => [t, i === 0 ? { QB: [], RB: ['2'], WR: ['1'], TE: [] } : { QB: [], RB: [], WR: [], TE: [] }])) } };
  const files = {};
  for (let y = 2012; y <= 2025; y++) files[`nfl/season-totals/${y}.json`] = { inProgress: false };
  return {
    loadSeasonTotals: (y) => season[y] ?? {},
    loadDepth: () => depth,
    loadAdvstats: () => ({ players: {} }),
    loadSnapShare: () => ({ players: {} }),
    loadRosterWeekly: () => ({ players: {} }),
    loadPlayerIds: () => ({ bySleeper: Object.fromEntries([1, 2, 3, 4].map(p => [p, { birthdate: '1992-05-01', draftYear: 2014 }])) }),
    loadRawPlayers: () => ({
      1: { position: 'WR', age: 28, team: 'BUF', full_name: 'One Guy', years_exp: 12 }, 2: { position: 'RB', age: 27, team: 'LAC', full_name: 'Two Guy', years_exp: 12 },
      3: { position: 'TE', age: 29, team: 'KC', full_name: 'Three Guy', years_exp: 12 }, 4: { position: 'QB', age: 30, team: 'KC', full_name: 'Four Guy', years_exp: 12 },
    }),
    loadLeaguePositionOf: () => (pid) => POS[pid] ?? null,
    loadLeagueScoring: () => ({ rec: 1 }),
    loadManifest: () => ({ files }),
  };
}

/** The S3 panel rows (the fields the parity check reads) for a built row set. */
function s3PanelFor(rows, tamper = null) {
  const prows = rows.map(r => JSON.parse(JSON.stringify({
    pid: r.pid, S: r.S, path: r.path, age: r.age, changer: r.changer, scores: { H: r.scores.H }, B1: r.B1, B2: r.B2, outcome: r.outcome,
  })));
  if (tamper) tamper(prows);
  return { meta: { preregSha256: 'abc' }, rows: prows, metrics: { [QB_FLOOR_KEY]: { value: -0.052245 } } };
}

function probeLoad({ tamper = null, taskFileText = taskText } = {}) {
  const store = makeStore();
  const built = buildReworkRows({ load: { ...store }, cohorts: [2015, 2018] });
  let t = 0;
  return {
    load: {
      ...store, taskFileText, gitRev: () => 'rev', now: () => '2026-11-04T00:00:00.000Z', clock: () => (t += 10),
      loadS3Panel: () => s3PanelFor(built.rows, tamper),
    },
    built,
  };
}

// ─── T-GATE ──────────────────────────────────────────────────────────────────────────────────────

describe('T-GATE', () => {
  const spyLoad = (taskFileText) => {
    const calls = [];
    const load = { taskFileText };
    for (const k of ['loadSeasonTotals', 'loadDepth', 'loadAdvstats', 'loadSnapShare', 'loadRosterWeekly', 'loadPlayerIds', 'loadRawPlayers',
      'loadLeaguePositionOf', 'loadLeagueScoring', 'loadManifest', 'loadS3Panel', 'gitRev', 'now', 'clock', 'gitShow']) {
      load[k] = (...a) => { calls.push(k); return null; };
    }
    return { load, calls };
  };
  const altered = () => taskText().replace('Games: `sleeper` only.', 'Games: `sleeper` or `snaps`.');
  test('the altered text really changes the hash', () => {
    assert.notEqual(preregHash(altered()), DYNASTY_REWORK_PREREG_SHA256);
    assert.throws(() => assertPrereg({ taskFileText: altered }), DynastyReworkStop);
  });
  test('with a wrong hash runDynastyRework throws a stop and no loader is called', () => {
    const { load, calls } = spyLoad(altered);
    assert.throws(() => runDynastyRework({ load }), DynastyReworkStop);
    assert.deepEqual(calls, []);
  });
  test('with a wrong hash runProbe throws a stop and no loader is called; its only output is the stop line', () => {
    const { load, calls } = spyLoad(altered);
    const lines = [];
    assert.throws(() => runProbe({ load, print: (l) => lines.push(l) }), DynastyReworkStop);
    assert.deepEqual(calls, []);
    assert.deepEqual(lines, ['stop_DynastyReworkStop: 1']);
  });
});

// ─── T-PROBE ─────────────────────────────────────────────────────────────────────────────────────

describe('T-PROBE', () => {
  const guardConsole = (fn) => {
    const seen = [];
    const o = { log: console.log, error: console.error, warn: console.warn, info: console.info };
    for (const k of Object.keys(o)) console[k] = (...a) => seen.push([k, a]);
    try { fn(); } finally { Object.assign(console, o); }
    return seen;
  };
  test('a clean probe emits only counts and timings, then projected_total, and calls no other logger', () => {
    const { load } = probeLoad();
    const lines = [];
    const consoleCalls = guardConsole(() => { assert.equal(runProbe({ load, print: (l) => lines.push(l) }), 0); });
    assert.deepEqual(consoleCalls, []);
    assert.ok(lines.length > 10);
    for (const l of lines) assert.match(l, PROBE_LINE, l);
    for (const key of ['rows_2015', 'rows_2018', 'parity_rows_checked', 'parity_mismatches', 'grid_size_K0', 'grid_size_K1', 'fit_k0_wr_ms', 'bootstrap_50_ms', 'projected_total']) {
      assert.ok(lines.some(l => l.startsWith(`${key}: `)), key);
    }
    assert.ok(lines.includes('parity_mismatches: 0'));
    assert.ok(lines.includes('grid_size_K0: 10626') && lines.includes('grid_size_K1: 1771'));
    assert.equal(lines[lines.length - 1].startsWith('projected_total: '), true);
    assert.ok(lines.some(l => /^specs_run: \d+$/.test(l)) && countRunSpecs() > 100);
  });
  test('a forced parity stop prints the count and stop_DynastyReworkStop: 1, and nothing else unusual', () => {
    const { load } = probeLoad({ tamper: (rows) => { rows[0].scores.H.sleeper += 1; } });
    const lines = [];
    const consoleCalls = guardConsole(() => { assert.throws(() => runProbe({ load, print: (l) => lines.push(l) }), DynastyReworkStop); });
    assert.deepEqual(consoleCalls, []);
    for (const l of lines) assert.match(l, PROBE_LINE, l);
    assert.ok(lines.includes('parity_mismatches: 1'));
    assert.equal(lines[lines.length - 1], 'stop_DynastyReworkStop: 1');
  });
  test('any thrown error prints its class name only', () => {
    const { load } = probeLoad();
    load.loadLeagueScoring = () => { throw new TypeError('secret value 12345'); };
    const lines = [];
    assert.throws(() => runProbe({ load, print: (l) => lines.push(l) }), TypeError);
    assert.deepEqual(lines, ['stop_TypeError: 1']);
  });
});

// ─── rows (synthetic loaders) ────────────────────────────────────────────────────────────────────

describe('buildReworkRows on a synthetic store', () => {
  const { built } = probeLoad();
  test('rows carry the §4 fields; level2 equals B2; changer false for a team that did not move', () => {
    const r = built.rows.find(x => x.pid === '1' && x.S === 2018);
    assert.ok(r);
    assert.equal(r.position, 'WR');
    assert.equal(r.age, 27, '1992-05-01 → 27 on 2019-06-01');
    assert.equal(r.level2, r.B2.sleeper);
    assert.equal(r.B2.sleeper, 12);
    assert.equal(r.B1.sleeper, 12);
    assert.equal(r.changer, false);
    assert.equal(r.teamS1, 'BUF');
    assert.equal(r.outcome.sleeper.h, 3);
    assert.equal(r.outcome.sleeper.M1, 12);
    assert.equal(r.r.length, 3);
    assert.ok(Number.isFinite(r.ageAdj2Score) && Number.isFinite(r.currentLevel2Score) && Number.isFinite(r.opportunityScoreChg));
    assert.equal(r.scores.H.sleeper, composeDynastyScore(r.raw));
    assert.ok(['B', 'C'].includes(r.path.sleeper));
  });
  test('an in-progress outcome season stops; birthdate coverage below 95% in a headline cohort stops', () => {
    const store = makeStore();
    store.loadManifest = () => ({ files: { ...Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`nfl/season-totals/${2012 + i}.json`, { inProgress: false }])), 'nfl/season-totals/2017.json': { inProgress: true } } });
    assert.throws(() => buildReworkRows({ load: store, cohorts: [2015] }), (e) => e instanceof DynastyReworkStop && /outcome season 2017 is not a completed season/.test(e.message));
    const nb = makeStore();
    nb.loadPlayerIds = () => ({ bySleeper: Object.fromEntries([1, 2, 3, 4].map(p => [p, { birthdate: null, draftYear: 2014 }])) });
    assert.throws(() => buildReworkRows({ load: nb, cohorts: [2018] }), (e) => e instanceof DynastyReworkStop && /birthdate coverage in cohort 2018/.test(e.message));
  });
  test('the preview cohort is outcome-free, changer false, and reads no 2026 file', () => {
    const store = makeStore();
    const asked = [];
    const load = { ...store, loadSeasonTotals: (y) => { asked.push(y); return store.loadSeasonTotals(y); } };
    const { rows } = buildReworkRows({ load, cohorts: [2025] });
    assert.ok(rows.length >= 3, `${rows.length} preview rows`);
    assert.ok(asked.length > 0 && asked.every(y => y <= 2025), `asked ${asked.filter(y => y > 2025)}`);
    for (const r of rows) { assert.equal(r.outcome, null); assert.equal(r.changer, false); assert.equal(r.teamS1, null); }
  });
});

// ─── T-HASH ──────────────────────────────────────────────────────────────────────────────────────

describe('T-HASH', () => {
  const sample = (s45, s6 = 'after') => ['# T', 'intro', '## 4. Row set and S3 parity', ...s45, '## 6. Outputs', s6].join('\n');
  test('extracts exactly the §4–§5 span, ignoring a `## 6. Outputs` mention inside a line', () => {
    const s = ['one', 'mentions `## 6. Outputs` in backticks', 'three'];
    assert.equal(preregHash(sample(s)), preregHash(sample(s, 'different later text')));
    assert.notEqual(preregHash(sample(s)), preregHash(sample(['one', 'mentions `## 6. Outputs` in backticks', 'thre3'])));
    assert.notEqual(preregHash(sample(s)), preregHash(sample(['one'])), 'the backtick line did not end the span');
  });
  test('a one-character change inside the span changes the hash; a change outside does not', () => {
    const a = sample(['x', '### 5.1 y']);
    assert.equal(preregHash(a), preregHash(a.replace('# T', '# Other').replace('intro', 'other intro')));
    assert.notEqual(preregHash(a), preregHash(a.replace('### 5.1 y', '### 5.1 z')));
    assert.equal(preregHash(a), preregHash(a + '\n## 4. Row set and S3 parity\nstray'), 'the first §4 line wins');
  });
  test('missing section lines stop', () => {
    assert.throws(() => preregHash('no sections'), DynastyReworkStop);
    assert.throws(() => preregHash('## 4. Row set and S3 parity\nbody'), DynastyReworkStop);
  });
  test('the pinned constant equals the hash of the committed task file', () => {
    assert.equal(preregHash(taskText()), DYNASTY_REWORK_PREREG_SHA256);
    assert.equal(assertPrereg({ taskFileText: taskText }), DYNASTY_REWORK_PREREG_SHA256);
  });
});

// ─── T-CLI ───────────────────────────────────────────────────────────────────────────────────────

describe('T-CLI', () => {
  test('--dynasty-rework --basis league exits 1 with the pinned message', () => {
    const r = spawnSync(process.execPath, ['bin/backtest.mjs', '--dynasty-rework', '--basis', 'league'], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /seasons, candidates, grids and folds are pinned by the task file, not knobs/);
  });
});

// ─── T-KEYS, verdict, artifacts ──────────────────────────────────────────────────────────────────

function syntheticResult({ winFriendly = false } = {}) {
  const rnd = lcg(99);
  const rows = [];
  for (const S of COHORT_ARRAY(2015, 2024)) for (const position of POSITIONS) for (let i = 0; i < 25; i++) {
    const m1 = (i * 7) % 25 + rnd();
    const P = winFriendly ? m1 : (i * 11) % 25;
    const row = pRow({ pid: `${position}${S}_${i}`, S, position, age: 21 + ((i * 3) % 15), h: (i * 5) % 25, b2: (i * 3) % 25, m1, m2: m1, P });
    row.raw = { ageAdjScore: rnd() * 100, trajectoryScore: rnd() * 100, currentLevelScore: Math.round(rnd() * 100), effectiveReliability: 50, opportunityScore: 50, seasonsOfData: 5, prospectScore: null };
    row.oofSets.forward = { ...row.oofSets.loco };
    row.oofSets.short = { ...row.oofSets.loco };
    rows.push(row);
  }
  const previewRows = [];
  for (const position of POSITIONS) for (let i = 0; i < 6; i++) {
    const row = fitRow({ pid: `${position}p${i}`, S: 2025, position, i, rnd, m1: 0, over: { outcome: null, scores: { H: { sleeper: 40 + i } } } });
    row.signals = { isLateCareer: false, isBreakout: false, isBounceBack: false, slopeRaw: 0.1, age: 26, depthOrder: 1 };
    previewRows.push(row);
  }
  const fitRows = noisyRows({ positions: POSITIONS, cohorts: COHORT_ARRAY(2015, 2022), n: 22 });
  const folds = runFolds({ rows: fitRows, plan: [{ T: 2018, fit: [2015, 2021, 2022] }], slot: 'loco' });
  const final = runFinal({ rows: fitRows });
  const m = computeReworkMetrics(rows, { resamples: 30 });
  const rowCounts = Object.fromEntries(COHORT_ARRAY(2015, 2024).map(S => [S, Object.fromEntries(POSITIONS.map(p => [p, 25]))]));
  return {
    meta: {
      generatedAt: '2026-11-04T10:00:00.000Z', dataRev: 'abc1234', pinnedInputsRev: 'a791db0', s3Panel: { path: 'backtests/x.json', preregSha256: 'dbeff355' },
      preregSha256: DYNASTY_REWORK_PREREG_SHA256, bootstrap: { resamples: 30, seed: 12345 }, parity: { rowsChecked: 1000, mismatches: 0 },
      rowCounts, previewRowCounts: { 2025: Object.fromEntries(POSITIONS.map(p => [p, 6])) }, foldPlan: foldPlan('loco'), forwardFoldPlan: foldPlan('forward'),
      gridSizes: {}, runtimeMs: 1,
    },
    rows, folds, forwardFolds: folds, shortFolds: folds, final, metrics: m.metrics, summary: m.summary, qbB2DeltaFloor: -0.052245,
    decision: m.decision, conditions: m.conditions, preview2025: computePreview(previewRows, final),
  };
}

describe('T-KEYS and the verdict', () => {
  const result = syntheticResult();
  test('every cell the verdict prints is a panel key that round-trips through parseMetricKey', () => {
    const seen = new Set();
    const md = buildDynastyReworkVerdictMarkdown(result, { seen });
    assert.ok(seen.size > 100);
    for (const key of seen) {
      assert.ok(result.metrics[key], key);
      assert.equal(metricKey(parseMetricKey(key)), key);
    }
    for (let n = 2; n <= 11; n++) assert.match(md, new RegExp(`^## ${n}\\. `, 'm'), `section ${n}`);
    assert.match(md, /nothing ships/);
    assert.throws(() => cellOf(result.metrics, { horizon: 'h3', measure: 'M1', mode: 'sleeper', kind: 'level', subject: 'ZZ', statistic: 'rho', position: 'QB', cell: 'all' }), /no panel key/);
  });
  test('the decision line, the K3 report-only sentence, no wiring recommendation, and the NO-WIN last line', () => {
    const md = buildDynastyReworkVerdictMarkdown(result);
    assert.match(md, new RegExp(`^\\*\\*${result.decision}\\*\\*$`, 'm'));
    assert.ok(md.includes(K3_REPORT_ONLY_SENTENCE));
    assert.doesNotMatch(md, /recommend|should wire|ship it/i);
    if (result.decision === 'S4A-NO-WIN') assert.equal(md.split('\n').pop(), NO_WIN_LAST_LINE);
    const forced = buildDynastyReworkVerdictMarkdown({ ...result, decision: 'S4A-NO-WIN' });
    assert.equal(forced.split('\n').pop(), NO_WIN_LAST_LINE);
    assert.ok(!buildDynastyReworkVerdictMarkdown({ ...result, decision: 'S4A-WIN' }).includes(NO_WIN_LAST_LINE));
  });
  test('weights and β appear only in the fold and final-model tables', () => {
    const md = buildDynastyReworkVerdictMarkdown(result);
    const [pre] = md.split('## 6. Fold table');
    assert.doesNotMatch(pre, /\/20|β/);
  });
  test('the panel is written, and a panel above 15 MB stops and writes nothing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dr-'));
    const wr = writeDynastyReworkArtifacts({ result, verdictMd: 'v', root: dir });
    assert.equal(wr.panelPath, 'backtests/2026-11-04-dynasty-rework-panel.json');
    assert.equal(wr.verdictPath, 'grading/2026-11-04-dynasty-rework-verdict.md');
    const panel = JSON.parse(fs.readFileSync(path.join(dir, wr.panelPath), 'utf8'));
    assert.equal(panel.rows.length, result.rows.length);
    assert.equal(panel.decision, result.decision);
    assert.deepEqual(Object.keys(panel.rows[0]).slice(0, 8), ['pid', 'S', 'position', 'age', 'path', 'H', 'B1', 'B2']);
    fs.rmSync(dir, { recursive: true, force: true });
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'dr-'));
    const huge = { ...result, rows: [{ ...result.rows[0], pid: 'x'.repeat(16 * 1024 * 1024) }] };
    assert.throws(() => writeDynastyReworkArtifacts({ result: huge, verdictMd: 'v', root: dir2 }), (e) => e instanceof DynastyReworkStop && /15 MB/.test(e.message));
    assert.equal(fs.existsSync(path.join(dir2, 'backtests')), false);
    fs.rmSync(dir2, { recursive: true, force: true });
  });
});
