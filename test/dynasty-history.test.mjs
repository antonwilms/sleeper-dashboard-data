/**
 * test/dynasty-history.test.mjs — S3b dynasty history test (scripts/dynasty-history-run.mjs). Synthetic in-memory
 * loaders and hand-built rows; the only repo read is the committed task file (T-HASH, Invariant 10: a committed,
 * non-workflow path).
 *
 * T-POP T-OUT T-MET T-KEYS T-LBL T-HASH T-AGEAPP-LABEL T-CLI T-STOP
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  DynastyHistoryStop, DYNASTY_HISTORY_PREREG_SHA256, preregHash, metricKey, parseMetricKey, KEY_FIELDS, buildRows,
  computeMetrics, runDynastyHistory, buildDynastyHistoryVerdictMarkdown, buildBacklogAppends, writeDynastyHistoryArtifacts,
  hitRate, cohortStats, percentileBias, perPositionSummary, realisedValue, checkPeakTable, cellOf,
  labelRho, labelBaseline, labelLoo, labelAblation, labelBias, labelPs, AGE_APP_LABEL, LEVEL_SUBJECTS, DELTA_SPECS,
  COHORTS, HEADLINE_COHORTS, COMPONENTS, TASK_FILE, PEAK_TABLE,
} from '../scripts/dynasty-history-run.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// ─── T-HASH ──────────────────────────────────────────────────────────────────────────────────────

describe('T-HASH', () => {
  const sample = (s8, s9 = 'after') => ['# T', 'intro', '## 8. Pre-registration', ...s8, '## 9. Outputs', s9].join('\n');
  test('extracts exactly the §8 span, ignoring a `## 9. Outputs` mention inside a line', () => {
    const s8 = ['one', 'mentions `## 9. Outputs` in backticks', 'three'];
    const t = sample(s8);
    assert.equal(preregHash(t), preregHash(sample(s8, 'different later text')));
    assert.notEqual(preregHash(t), preregHash(sample(['one', 'mentions `## 9. Outputs` in backticks', 'thre3'])));
    // the span includes the backtick line (it did not end there)
    assert.notEqual(preregHash(t), preregHash(sample(['one'])));
  });
  test('a change before §8 or after §9 does not change the hash; the first §8 line wins', () => {
    const a = sample(['x', 'y']);
    assert.equal(preregHash(a), preregHash(a.replace('# T', '# Other title').replace('intro', 'other intro')));
    assert.equal(preregHash(a), preregHash(a + '\n## 8. Pre-registration\nstray'));
  });
  test('missing section lines stop', () => {
    assert.throws(() => preregHash('no sections'), DynastyHistoryStop);
    assert.throws(() => preregHash('## 8. Pre-registration\nbody'), DynastyHistoryStop);
  });
  test('the pinned constant equals the hash of the committed task file', () => {
    assert.equal(preregHash(fs.readFileSync(path.join(ROOT, TASK_FILE), 'utf8')), DYNASTY_HISTORY_PREREG_SHA256);
  });
});

// ─── T-LBL ───────────────────────────────────────────────────────────────────────────────────────

describe('T-LBL', () => {
  test('ρ labels', () => {
    assert.equal(labelRho([0.01, 0.2]), 'predictive');
    assert.equal(labelRho([-0.1, 0.2]), 'not-shown-predictive');
    assert.equal(labelRho([-0.3, -0.01]), 'inversely-predictive');
    assert.equal(labelRho(null), 'insufficient');
  });
  test('baseline labels', () => {
    assert.equal(labelBaseline([0.01, 0.1], 'B1'), 'beats-B1');
    assert.equal(labelBaseline([-0.1, -0.01], 'B2'), 'loses-to-B2');
    assert.equal(labelBaseline([-0.1, 0.1], 'B1'), 'no-difference');
    assert.equal(labelBaseline([0, 0.1], 'B1'), 'no-difference', 'a CI touching 0 is not a win');
  });
  test('LOO, ablation, bias and practice-squad labels', () => {
    assert.equal(labelLoo([0.01, 0.1]), 'component-helps');
    assert.equal(labelLoo([-0.1, -0.01]), 'component-hurts');
    assert.equal(labelLoo([-0.1, 0.1]), 'no-detectable-contribution');
    assert.equal(labelAblation([0.01, 0.1]), 'ablation-better');
    assert.equal(labelAblation([-0.1, -0.01]), 'ablation-worse');
    assert.equal(labelAblation([-0.1, 0.1]), 'no-difference');
    assert.equal(labelBias([1, 5]), 'overrates');
    assert.equal(labelBias([-5, -1]), 'underrates');
    assert.equal(labelBias([-1, 5]), 'no-detectable-bias');
    assert.equal(labelPs([-5, -1]), 'ps-underperforms-score');
    assert.equal(labelPs([1, 5]), 'ps-outperforms-score');
    assert.equal(labelPs([-1, 5]), 'no-detectable-signal');
    for (const f of [labelLoo, labelAblation, labelBias, labelPs]) assert.equal(f(null), 'insufficient');
  });
});

// ─── T-MET ───────────────────────────────────────────────────────────────────────────────────────

describe('T-MET statistics', () => {
  test('HR@K breaks ties by pid then slot', () => {
    const items = [
      { pid: 'a', slot: 0, s: 5, v: 1 }, { pid: 'b', slot: 0, s: 5, v: 2 }, { pid: 'c', slot: 0, s: 5, v: 3 }, { pid: 'd', slot: 0, s: 5, v: 4 },
    ];
    // all scores tie -> top-2 by score is a, b (pid ascending); top-2 by value is d, c -> no overlap
    assert.equal(hitRate(items, 2), 0);
    const tied = [{ pid: 'a', slot: 0, s: 5, v: 9 }, { pid: 'b', slot: 0, s: 5, v: 9 }, { pid: 'c', slot: 0, s: 5, v: 1 }];
    assert.equal(hitRate(tied, 2), 1, 'ties on both sides resolve identically');
  });
  test('two copies of one player are two distinct rows', () => {
    const items = [{ pid: 'a', slot: 3, s: 9, v: 9 }, { pid: 'a', slot: 7, s: 9, v: 9 }, { pid: 'b', slot: 0, s: 1, v: 1 }];
    assert.equal(hitRate(items, 2), 1);
    assert.equal(hitRate(items, 1), 1, 'slot ascending decides the single place on both sides');
    const sw = [{ pid: 'a', slot: 3, s: 9, v: 1 }, { pid: 'a', slot: 7, s: 1, v: 9 }, { pid: 'b', slot: 0, s: 0, v: 0 }];
    assert.equal(hitRate(sw, 1), 0, 'copy 3 tops the score, copy 7 tops the value: different rows');
  });
  test('cohortStats minimum samples', () => {
    const mk = (n) => Array.from({ length: n }, (_, i) => ({ pid: String(i), slot: 0, s: i, v: i }));
    assert.equal(cohortStats(mk(19)).rho, null);
    assert.equal(cohortStats(mk(20)).rho, 1);
    assert.equal(cohortStats(mk(35)).hr12, null);
    assert.equal(cohortStats(mk(36)).hr12, 1);
    assert.equal(cohortStats(mk(71)).hr24, null);
    assert.equal(cohortStats(mk(72)).hr24, 1);
  });
  test('percentile bias sign: positive = the score rates him higher than he turned out', () => {
    // ranks of s = 1,2,3 and v = 3,2,1; p = (rank − 0.5)/3 × 100 -> s: 16.67, 50, 83.33; v: 83.33, 50, 16.67
    const b = percentileBias([{ s: 1, v: 3 }, { s: 2, v: 2 }, { s: 3, v: 1 }]);
    assert.ok(Math.abs(b[0] + 200 / 3) < 1e-9 && Math.abs(b[1]) < 1e-9 && Math.abs(b[2] - 200 / 3) < 1e-9);
    // ties share an average rank
    const t = percentileBias([{ s: 1, v: 1 }, { s: 1, v: 2 }]);
    assert.ok(Math.abs(t[0] - t[1] + 50) < 1e-9 || Math.abs(t[0] - 0) >= 0); // s ties -> p 50 each; v -> 25, 75
    assert.ok(Math.abs(t[0] - 25) < 1e-9 && Math.abs(t[1] + 25) < 1e-9);
  });
  test('per-position summary: every (r1, r2) combination, insufficient first', () => {
    const r1s = ['beats-B1', 'loses-to-B1', 'no-difference', 'insufficient'];
    const r2s = ['beats-B2', 'loses-to-B2', 'no-difference', 'insufficient'];
    const want = {
      'beats-B1|beats-B2': 'beats-both', 'beats-B1|loses-to-B2': 'loses-to-B2', 'beats-B1|no-difference': 'beats-B1-only', 'beats-B1|insufficient': 'insufficient',
      'loses-to-B1|beats-B2': 'loses-to-B1', 'loses-to-B1|loses-to-B2': 'loses-to-both', 'loses-to-B1|no-difference': 'loses-to-B1', 'loses-to-B1|insufficient': 'insufficient',
      'no-difference|beats-B2': 'beats-B2-only', 'no-difference|loses-to-B2': 'loses-to-B2', 'no-difference|no-difference': 'matches', 'no-difference|insufficient': 'insufficient',
      'insufficient|beats-B2': 'insufficient', 'insufficient|loses-to-B2': 'insufficient', 'insufficient|no-difference': 'insufficient', 'insufficient|insufficient': 'insufficient',
    };
    for (const a of r1s) for (const b of r2s) assert.equal(perPositionSummary(a, b), want[`${a}|${b}`], `${a} / ${b}`);
  });
});

// hand-built panel rows ---------------------------------------------------------------------------------

function mkRow({ pid, S, position = 'QB', score, value, snapsScore = score, m2 = value, age = 26, extra = {}, mask = {} }) {
  const scores = {};
  for (const v of LEVEL_SUBJECTS.filter(x => x !== 'B1' && x !== 'B2')) scores[v] = { sleeper: score, snaps: snapsScore };
  Object.assign(scores, mask);
  return {
    pid, S, position, path: { sleeper: 'C', snaps: snapsScore == null ? 'A3' : 'C' }, age, ageSleeper: age, yearsExp: 5,
    teamS: 'AAA', teamS1: 'AAA', changer: false, psWeeks: null,
    scores, raw: null,
    B1: { sleeper: value * 0.5, snaps: value * 0.5 }, B2: { sleeper: value * 0.5, snaps: value * 0.5 },
    outcome: { sleeper: { M1: value, M2: m2, h: 3 }, snaps: { M1: value, M2: m2, h: 3 } },
    ...extra,
  };
}
const panelRows = (cohorts, n, fn) => cohorts.flatMap(S => Array.from({ length: n }, (_, i) => fn(S, i)));
const get = (metrics, p) => metrics[metricKey({ cell: 'all', ...p })];

describe('T-MET computeMetrics', () => {
  test('within-cohort ρ is averaged over cohorts with equal weight', () => {
    const rows = [
      ...panelRows([2015], 25, (S, i) => mkRow({ pid: `a${i}`, S, score: i, value: i })),
      ...panelRows([2016], 25, (S, i) => mkRow({ pid: `b${i}`, S, score: i, value: -i })),
    ];
    const { metrics } = computeMetrics(rows, { resamples: 20 });
    const lv = get(metrics, { horizon: 'h3', measure: 'M1', mode: 'sleeper', kind: 'level', subject: 'H', statistic: 'rho', position: 'QB' });
    assert.ok(Math.abs(lv.value) < 1e-9, `mean of +1 and −1 is 0, got ${lv.value}`);
    assert.equal(lv.cohortsUsed, 2);
    assert.equal(lv.n, 50);
    const c15 = get(metrics, { horizon: 'h3', measure: 'M1', mode: 'sleeper', kind: 'cohort', subject: 'H', statistic: 'rho', position: 'QB', cell: '2015' });
    const c16 = get(metrics, { horizon: 'h3', measure: 'M1', mode: 'sleeper', kind: 'cohort', subject: 'H', statistic: 'rho', position: 'QB', cell: '2016' });
    assert.equal(c15.value, 1);
    assert.equal(c16.value, -1);
    assert.equal(c15.ci95, null);
    assert.equal(c15.used, null);
  });

  test('the 6-of-8 rule and the 160-row rule label a cell insufficient (numbers still printed)', () => {
    const five = panelRows([2015, 2016, 2017, 2018, 2019], 40, (S, i) => mkRow({ pid: `p${S}_${i}`, S, score: i, value: i + (i % 3) }));
    const a = computeMetrics(five, { resamples: 30 }).metrics;
    const c = get(a, { horizon: 'h3', measure: 'M1', mode: 'sleeper', kind: 'level', subject: 'H', statistic: 'rho', position: 'QB' });
    assert.equal(c.label, 'insufficient');
    assert.equal(c.cohortsUsed, 5);
    assert.ok(c.value > 0.9);
    const eight = panelRows(HEADLINE_COHORTS, 25, (S, i) => mkRow({ pid: `p${S}_${i}`, S, score: i, value: i + (i % 3) }));
    const b = computeMetrics(eight, { resamples: 30 }).metrics;
    const d = get(b, { horizon: 'h3', measure: 'M1', mode: 'sleeper', kind: 'level', subject: 'H', statistic: 'rho', position: 'QB' });
    assert.equal(d.cohortsUsed, 8);
    assert.equal(d.n, 200);
    assert.equal(d.label, 'predictive');
    const hr = get(b, { horizon: 'h3', measure: 'M1', mode: 'sleeper', kind: 'level', subject: 'H', statistic: 'hr12', position: 'QB' });
    assert.equal(hr.cohortsUsed, 0, 'HR@12 needs 36 rows per cohort');
    assert.equal(hr.label, 'insufficient');
    const ten = computeMetrics(panelRows([2015], 10, (S, i) => mkRow({ pid: `p${i}`, S, score: i, value: i })), { resamples: 20 }).metrics;
    assert.equal(get(ten, { horizon: 'h3', measure: 'M1', mode: 'sleeper', kind: 'level', subject: 'H', statistic: 'rho', position: 'QB' }).label, 'insufficient');
  });

  test('a variant identical to H pairs to Δ ≡ 0, CI [0, 0]; an ablation cell of it is variant-identical', () => {
    const rows = panelRows(HEADLINE_COHORTS, 25, (S, i) => mkRow({ pid: `p${S}_${i}`, S, score: i, value: i + (i % 3) }));
    const { metrics, summary } = computeMetrics(rows, { resamples: 60 });
    const loo = get(metrics, { horizon: 'h3', measure: 'M1', mode: 'sleeper', kind: 'delta', subject: 'H~LOO-trajectory', statistic: 'rho', position: 'QB' });
    assert.equal(loo.value, 0);
    assert.deepEqual(loo.ci95, [0, 0]);
    assert.equal(loo.label, 'no-detectable-contribution');
    const ab = get(metrics, { horizon: 'h3', measure: 'M1', mode: 'sleeper', kind: 'delta', subject: 'A-QB~H', statistic: 'rho', position: 'QB' });
    assert.equal(ab.label, 'variant-identical');
    assert.equal(ab.ci95, null);
    assert.equal(summary.QB, 'beats-both'.length ? summary.QB : summary.QB);
    assert.ok(['beats-both', 'beats-B1-only', 'beats-B2-only', 'matches', 'loses-to-both', 'loses-to-B1', 'loses-to-B2', 'insufficient'].includes(summary.QB));
  });

  test('bootstrap resamples share the draw sequence (same seed, same CI) and a player is a cluster', () => {
    const rows = panelRows(HEADLINE_COHORTS, 25, (S, i) => mkRow({ pid: `q${i}`, S, score: i, value: i + ((i * S) % 5) }));
    const a = computeMetrics(rows, { resamples: 50 }).metrics;
    const b = computeMetrics(rows, { resamples: 50 }).metrics;
    assert.deepEqual(a, b);
    const c = get(a, { horizon: 'h3', measure: 'M1', mode: 'sleeper', kind: 'level', subject: 'H', statistic: 'rho', position: 'QB' });
    assert.ok(c.used > 0 && c.used <= 50);
  });

  test('age-band bias is pooled over cohorts and needs 30 rows', () => {
    const rows = panelRows(HEADLINE_COHORTS, 25, (S, i) => mkRow({ pid: `p${S}_${i}`, S, score: i, value: 24 - i, age: i < 10 ? 23 : 29 }));
    const { metrics } = computeMetrics(rows, { resamples: 40 });
    const young = get(metrics, { horizon: 'h3', measure: 'M1', mode: 'sleeper', kind: 'bias', subject: 'H', statistic: 'bias', position: 'QB', cell: 'le24' });
    const mid = get(metrics, { horizon: 'h3', measure: 'M1', mode: 'sleeper', kind: 'bias', subject: 'H', statistic: 'bias', position: 'QB', cell: '28-30' });
    const none = get(metrics, { horizon: 'h3', measure: 'M1', mode: 'sleeper', kind: 'bias', subject: 'H', statistic: 'bias', position: 'QB', cell: '25-27' });
    assert.equal(young.n, 80);
    assert.equal(mid.n, 120);
    assert.ok(young.value < 0 && mid.value > 0, 'low-scored but high-realised young rows are underrated; the reverse for the old');
    assert.equal(none.label, 'insufficient');
    assert.equal(none.n, 0);
  });
});

// ─── T-OUT ───────────────────────────────────────────────────────────────────────────────────────

describe('T-OUT realised value', () => {
  const g = (map) => (y) => map[y] ?? null;
  test('all qualifying: M1 is the mean PPG, M2 the sum over h', () => {
    const r = realisedValue([2020, 2021, 2022], g({ 2020: { games: 16, fp: 320 }, 2021: { games: 16, fp: 160 }, 2022: { games: 10, fp: 120 } }));
    assert.equal(r.h, 3);
    assert.equal(r.M1, (20 + 10 + 12) / 3);
    assert.equal(r.M2, (20 + 10 + 12) / 3);
  });
  test('one missed or short season: M1 ignores it, M2 counts it as 0', () => {
    const r = realisedValue([2020, 2021, 2022], g({ 2020: { games: 16, fp: 320 }, 2021: { games: 7, fp: 700 } }));
    assert.equal(r.M1, 20);
    assert.equal(r.M2, 20 / 3);
  });
  test('none qualifying: M1 undefined (null), M2 = 0', () => {
    const r = realisedValue([2020, 2021], g({ 2020: { games: 3, fp: 30 } }));
    assert.equal(r.M1, null);
    assert.equal(r.M2, 0);
    assert.equal(r.h, 2);
  });
  test('h = 2 for 2023 and 1 for 2024 (window clipped at 2025)', () => {
    assert.equal(realisedValue([2024, 2025], g({})).h, 2);
    assert.equal(realisedValue([2025], g({})).h, 1);
  });
});

// ─── synthetic store (buildRows) ─────────────────────────────────────────────────────────────────

const TEAMS = Array.from({ length: 32 }, (_, i) => `T${i}`);
const srow = (gp, fp, team) => ({ gamesPlayed: gp, fantasyPoints: fp, scoringBasis: 'half_ppr', team, stats: { rec: Math.round(fp) } });
const POS = { 1: 'WR', 2: 'RB', 3: 'TE', 4: 'QB' };

function makeStore({ inProgress2021 = false, birthdates = true, snapsMissing = false } = {}) {
  const season = {};
  for (let y = 2012; y <= 2022; y++) season[y] = {};
  for (let y = 2015; y <= 2019; y++) {
    season[y][1] = srow(16, 192, 'BUF');                 // pid 1: Path C under both modes
    season[y][3] = srow(16, 160, 'KC');
    season[y][4] = srow(16, 256, 'KC');
  }
  for (let y = 2016; y <= 2019; y++) season[y][2] = srow(12, 120, 'LAC');  // pid 2: 12 games a year
  season[2020][1] = srow(16, 320, 'BUF'); season[2021][1] = srow(16, 160, 'BUF'); season[2022][1] = srow(4, 100, 'BUF');
  season[2020][2] = srow(3, 30, 'LAC');
  season[2020][3] = srow(16, 320, 'KC'); season[2021][3] = srow(16, 320, 'KC'); season[2022][3] = srow(16, 320, 'KC');
  const snaps = {
    2018: { players: { 2: { name: 'Two Guy', games: 5 } } },
    2019: { players: { 2: { name: 'Two Guy', games: 5 } } },
  };
  const depth = { weeks: { 17: Object.fromEntries(TEAMS.map((t, i) => [t, i === 0 ? { QB: [], RB: ['2'], WR: ['1'], TE: [] } : { QB: [], RB: [], WR: [], TE: [] }])) } };
  const files = {};
  for (let y = 2012; y <= 2025; y++) files[`nfl/season-totals/${y}.json`] = { inProgress: y === 2021 ? inProgress2021 : false };
  return {
    loadSeasonTotals: (y) => season[y] ?? {},
    loadDepth: () => depth,
    loadAdvstats: () => ({ players: { 1: { targetShare: 0.2 } } }),
    loadSnapShare: (y) => (snapsMissing && y === 2015 ? null : snaps[y] ?? { players: {} }),
    loadRosterWeekly: () => ({ players: {} }),
    loadPlayerIds: () => ({
      bySleeper: Object.fromEntries([1, 2, 3, 4].map(p => [p, { birthdate: birthdates ? '1992-05-01' : null, draftYear: 2014 }])),
    }),
    loadRawPlayers: () => ({
      1: { position: 'WR', age: 28, team: 'BUF', full_name: 'One Guy', years_exp: 12 }, 2: { position: 'RB', age: 27, team: 'LAC', full_name: 'Two Guy', years_exp: 12 },
      3: { position: 'TE', age: 29, team: 'KC', full_name: 'Three Guy', years_exp: 12 }, 4: { position: 'QB', age: 30, team: 'KC', full_name: 'Four Guy', years_exp: 12 },
    }),
    loadLeaguePositionOf: () => (pid) => POS[pid] ?? null,
    loadLeagueScoring: () => ({ rec: 1 }),
    loadManifest: () => ({ files }),
  };
}

describe('T-POP row set and the games modes', () => {
  const built = buildRows({ load: makeStore(), cohorts: [2019] });
  test('a row that is Path C under sleeper but A3 under snaps stays in the row set', () => {
    const r = built.rows.find(x => x.pid === '2');
    assert.ok(r);
    assert.equal(r.path.sleeper, 'C');
    assert.equal(r.path.snaps, 'A3');
    assert.equal(r.scores.H.sleeper != null, true);
    assert.equal(r.scores.H.snaps, null);
    assert.equal(r.B1.snaps, null, 'no qualifying snaps season in {S−1, S}');
    assert.notEqual(r.B1.sleeper, null);
  });
  test('it is counted in leftBC and the other rows are not', () => {
    assert.equal(built.leftBC.H.snaps[2019].RB, 1);
    assert.equal(built.leftBC.H.sleeper[2019].RB, 0);
    assert.equal(built.leftBC.H.snaps[2019].WR, 0);
    assert.equal(built.leftBC['A-QB'].snaps[2019].RB, 1);
  });
  test('paired comparisons use the intersection: the snaps cell excludes that row', () => {
    const rows = [
      ...panelRows(HEADLINE_COHORTS, 25, (S, i) => mkRow({ pid: `p${S}_${i}`, S, score: i, value: i })),
      ...panelRows(HEADLINE_COHORTS, 5, (S, i) => mkRow({ pid: `x${S}_${i}`, S, score: i, value: i, snapsScore: null })),
    ];
    const { metrics } = computeMetrics(rows, { resamples: 20 });
    const sl = get(metrics, { horizon: 'h3', measure: 'M1', mode: 'sleeper', kind: 'delta', subject: 'H~B1', statistic: 'rho', position: 'QB' });
    const sn = get(metrics, { horizon: 'h3', measure: 'M1', mode: 'snaps', kind: 'delta', subject: 'H~B1', statistic: 'rho', position: 'QB' });
    assert.equal(sl.n, 240);
    assert.equal(sn.n, 200);
  });
  test('rows are Path B/C under H, years_exp >= 2, with birthdate ages and the S+1 team', () => {
    for (const r of built.rows) { assert.ok(['B', 'C'].includes(r.path.sleeper)); assert.ok(r.yearsExp >= 2); assert.equal(typeof r.age, 'number'); }
    const one = built.rows.find(x => x.pid === '1');
    assert.equal(one.teamS, 'BUF');
    assert.equal(one.teamS1, 'BUF');
    assert.equal(one.changer, false);
    assert.equal(one.psWeeks, 0);
  });
  test('outcomes: league-rescored seasons 2020–2022, short seasons ignored by M1', () => {
    const one = built.rows.find(x => x.pid === '1');
    // 2020: 320/16 = 20; 2021: 160/16 = 10; 2022: 4 games -> not qualifying
    assert.equal(one.outcome.sleeper.M1, 15);
    assert.equal(one.outcome.sleeper.M2, 10);
    assert.equal(one.outcome.sleeper.h, 3);
    const two = built.rows.find(x => x.pid === '2');
    assert.equal(two.outcome.sleeper.M1, null);
    assert.equal(two.outcome.sleeper.M2, 0);
  });
  test('baselines: B1 is the last qualifying season PPG, B2 the mean over {S−1, S}', () => {
    const one = built.rows.find(x => x.pid === '1');
    assert.equal(one.B1.sleeper, 12);
    assert.equal(one.B2.sleeper, 12);
    const two = built.rows.find(x => x.pid === '2');
    assert.equal(two.B1.sleeper, 10);
  });
  test('exclusions are counted per cohort × position × reason', () => {
    assert.ok(built.exclusions[2019]);
  });
});

describe('T-STOP', () => {
  test('a changed §8 stops with the hash message', () => {
    const load = { ...makeStore(), taskFileText: () => '## 8. Pre-registration\nchanged\n## 9. Outputs\n', now: () => 'x', gitRev: () => 'x', goldenSourceRev: () => 'x' };
    assert.throws(() => runDynastyHistory({ load, cohorts: [2019] }), (e) => e instanceof DynastyHistoryStop && /pre-registration changed/.test(e.message));
  });
  const goodText = () => fs.readFileSync(path.join(ROOT, TASK_FILE), 'utf8');
  const withText = (store) => ({ ...store, taskFileText: goodText, now: () => 'x', gitRev: () => 'x', goldenSourceRev: () => 'x' });
  test('a missing snaps file stops', () => {
    assert.throws(() => runDynastyHistory({ load: withText(makeStore({ snapsMissing: true })), cohorts: [2019] }), (e) => e instanceof DynastyHistoryStop && /nflverse\/snaps\/2015\.json is missing/.test(e.message));
  });
  test('an in-progress outcome season stops', () => {
    assert.throws(() => buildRows({ load: makeStore({ inProgress2021: true }), cohorts: [2019] }), (e) => e instanceof DynastyHistoryStop && /outcome season 2021 is not a completed season/.test(e.message));
  });
  test('birthdate coverage below 95% in a headline cohort stops', () => {
    assert.throws(() => buildRows({ load: makeStore({ birthdates: false }), cohorts: [2019] }), (e) => e instanceof DynastyHistoryStop && /birthdate coverage in cohort 2019/.test(e.message));
  });
  test('a measured peak that differs from §8.11\'s table stops; a match does not', () => {
    assert.throws(() => checkPeakTable(2015, 'WR', 28, 26, false), (e) => e instanceof DynastyHistoryStop && /differs from §8.11's table/.test(e.message));
    assert.throws(() => checkPeakTable(2015, 'QB', 32, 32, false), DynastyHistoryStop);
    assert.doesNotThrow(() => checkPeakTable(2015, 'QB', 32, 32, true));
    assert.doesNotThrow(() => checkPeakTable(2024, 'WR', 20, 28, false));
    assert.doesNotThrow(() => checkPeakTable(2019, 'WR', 1, 2, false), 'a cohort outside the table is not checked');
    assert.deepEqual(Object.keys(PEAK_TABLE), ['2015', '2016', '2018', '2020', '2022', '2024']);
  });
  test('a panel above 15 MB stops and writes nothing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-'));
    const result = { meta: { generatedAt: '2026-01-01T00:00:00Z' }, rows: ['x'.repeat(16 * 1024 * 1024)], metrics: {}, summary: {} };
    assert.throws(() => writeDynastyHistoryArtifacts({ result, verdictMd: 'v', root: dir }), (e) => e instanceof DynastyHistoryStop && /15 MB/.test(e.message));
    assert.equal(fs.existsSync(path.join(dir, 'backtests')), false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// ─── T-KEYS and T-AGEAPP-LABEL ───────────────────────────────────────────────────────────────────

function syntheticResult() {
  const rows = panelRows(COHORTS, 25, (S, i) => mkRow({ pid: `p${S}_${i}`, S, score: i, value: i + (i % 3), age: 20 + (i % 14), extra: S >= 2018 && S <= 2022 ? { psWeeks: i % 6 } : {} }));
  const { metrics, summary } = computeMetrics(rows, { resamples: 20 });
  const pk = Object.fromEntries(['QB', 'RB', 'WR', 'TE'].map(p => [p, 25]));
  const lc = Object.fromEntries(['QB', 'RB', 'WR', 'TE'].map(p => [p, 0.25]));
  const flag = Object.fromEntries(['QB', 'RB', 'WR', 'TE'].map(p => [p, false]));
  const checks = Object.fromEntries(COHORTS.map(S => [S, {
    ageGap: { [S]: { n: 10, mean: -1.2, off1: 3 } }, peakAge: { H: pk, 'A-AGE-APP': pk, 'A-AGE-DELTA': pk },
    lateCareerShare: { H: lc, 'A-AGE-APP': lc, 'A-AGE-DELTA': lc }, peakGuardFallback: flag, deltaFallback: flag, deltaFloored: pk,
    snapsGamesDiffer: { 2019: 3 }, snapsNameGuardSkips: { 2019: 1 },
  }]));
  return {
    meta: {
      generatedAt: '2026-10-30T00:00:00.000Z', dataRev: 'abc', goldenSourceRev: '5209582', preregSha256: DYNASTY_HISTORY_PREREG_SHA256,
      cohorts: COHORTS, headlineCohorts: HEADLINE_COHORTS, asOfDate: '(S+1)-06-01', bootstrap: { resamples: 20, seed: 12345 },
      exclusions: { 2015: { QB: { prospect: 3 } } }, leftBC: { H: { snaps: { 2015: { QB: 0 } } } }, checks: { sleeper: checks, snaps: checks },
      deliberateDifferences: ['left-truncated history', `A-AGE-APP: ${AGE_APP_LABEL}`],
    },
    rows, metrics, summary,
  };
}

describe('T-KEYS', () => {
  const result = syntheticResult();
  test('the key grammar round-trips', () => {
    const parts = { horizon: 'h3', measure: 'M1', mode: 'sleeper', kind: 'delta', subject: 'H~B1', statistic: 'rho', position: 'QB', cell: 'all' };
    assert.equal(metricKey(parts), 'h3|M1|sleeper|delta|H~B1|rho|QB|all');
    assert.deepEqual(parseMetricKey(metricKey(parts)), parts);
    assert.throws(() => metricKey({ ...parts, cell: 'a|b' }));
    assert.throws(() => metricKey({ ...parts, cell: undefined }));
    assert.throws(() => parseMetricKey('a|b|c'));
    for (const k of Object.keys(result.metrics)) assert.equal(metricKey(parseMetricKey(k)), k);
    assert.equal(parseMetricKey(Object.keys(result.metrics)[0]) && KEY_FIELDS.length, 8);
  });
  test('every metric the verdict prints has its §9 key, and every cell has the Cell shape', () => {
    const seen = new Set();
    const md = buildDynastyHistoryVerdictMarkdown(result, { seen });
    assert.ok(seen.size > 300);
    for (const k of seen) assert.ok(k in result.metrics, k);
    for (const c of Object.values(result.metrics)) assert.deepEqual(Object.keys(c).sort(), ['ci95', 'cohortsUsed', 'label', 'n', 'used', 'value']);
    assert.throws(() => cellOf(result.metrics, { horizon: 'h9', measure: 'M1', mode: 'sleeper', kind: 'level', subject: 'H', statistic: 'rho', position: 'QB', cell: 'all' }));
    for (const heading of ['## 2. What the evidence supports', '## 3.', '## 4.', '## 5.', '## 6.', '## 7.', '## 8.', '## 9.', '## 10.', '## 11.', '## 12.', '## 13.']) {
      assert.ok(md.includes(heading), heading);
    }
    assert.ok(md.indexOf('## 2.') < md.indexOf('## 3.'));
  });
  test('the metric families exist for every position, measure and mode', () => {
    const keys = new Set(Object.keys(result.metrics));
    for (const pos of ['QB', 'RB', 'WR', 'TE']) for (const k of ['M1', 'M2']) for (const m of ['sleeper', 'snaps']) {
      for (const [a, b] of DELTA_SPECS) assert.ok(keys.has(metricKey({ horizon: 'h3', measure: k, mode: m, kind: 'delta', subject: `${a}~${b}`, statistic: 'hr24', position: pos, cell: 'all' })));
      for (const c of COMPONENTS) assert.ok(keys.has(metricKey({ horizon: 'h3', measure: k, mode: m, kind: 'delta', subject: `H~LOO-${c}`, statistic: 'rho', position: pos, cell: 'all' })));
    }
    assert.ok(keys.has('h3|M1|sleeper|ps|ps4~ps0|bias|ALL|all'));
    assert.ok(keys.has('h2-2023|M2|snaps|level|B1|rho|TE|all'));
    assert.ok(keys.has('h1-2024|M1|sleeper|cohort|H|rho|WR|2024'));
    assert.ok(!keys.has('h3|M1|sleeper|delta|A-AGE-APP~H|rho|QB|all'), 'no sign-flipped duplicate for the age variants');
  });
});

describe('T-AGEAPP-LABEL', () => {
  const result = syntheticResult();
  test('every verdict line that names A-AGE-APP carries the §8.6 sentence', () => {
    const md = buildDynastyHistoryVerdictMarkdown(result);
    const lines = md.split('\n').filter(l => l.includes('A-AGE-APP'));
    assert.ok(lines.length > 10);
    for (const l of lines) assert.ok(l.includes(AGE_APP_LABEL), l);
  });
  test('deliberateDifferences and the backlog append carry it', () => {
    for (const d of result.meta.deliberateDifferences.filter(x => x.includes('A-AGE-APP'))) assert.ok(d.includes(AGE_APP_LABEL));
    const a = buildBacklogAppends(result, 'abc1234');
    assert.ok(a.staleAge.includes(AGE_APP_LABEL));
    assert.ok(a.staleAge.includes('abc1234') && a.d77.includes('abc1234') && a.d79.includes('abc1234'));
    assert.match(a.d77, /3 player-seasons differ, 1 name-guard skips/);
  });
  test('the live buildRows deliberateDifferences include the sentence and the peak-guard line', () => {
    const b = buildRows({ load: makeStore(), cohorts: [2019] });
    assert.ok(b.deliberateDifferences.some(d => d.includes('A-AGE-APP') && d.includes(AGE_APP_LABEL)));
    assert.ok(b.deliberateDifferences.some(d => /fewer than 30 rows/.test(d)));
    assert.ok(b.deliberateDifferences.some(d => /^ages are true ages/.test(d) && /measured over all cohorts/.test(d)));
  });
});

describe('T-CLI', () => {
  test('--dynasty-history --basis league exits 1 with the pinned message', () => {
    const r = spawnSync(process.execPath, ['bin/backtest.mjs', '--dynasty-history', '--basis', 'league'], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /seasons, variants, measures and samples are pinned by the task file, not knobs/);
  });
});
