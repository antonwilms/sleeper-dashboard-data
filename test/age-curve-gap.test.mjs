/**
 * test/age-curve-gap.test.mjs — T-GAP: the S3a age-curve gap report (scripts/age-curve-gap-run.mjs), on a
 * synthetic in-memory store (Invariant 10). No store reads.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runAgeCurveGap, buildAgeCurveGapMarkdown, distribution, pooledLine } from '../scripts/age-curve-gap-run.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEAMS = Array.from({ length: 32 }, (_, i) => `T${i}`);
const row = (gp, fp, team) => ({ gamesPlayed: gp, fantasyPoints: fp, scoringBasis: 'half_ppr', team, stats: { rec: Math.round(fp / 2) } });

// Reference date D = 2026-05-18. Pid 1: Sleeper 30, true 26 (born 2000-01-01); pid 3: Sleeper 26, true 26; pid 2 (RB, no team): Sleeper 28, true 27.
function makeLoad(calls = []) {
  const seasons = {
    2024: { 1: row(16, 128, 'BUF'), 2: row(16, 160, 'BUF'), 3: row(16, 192, 'KC') },
    2025: { 1: row(16, 160, 'BUF'), 2: row(16, 176, 'BUF'), 3: row(16, 208, 'KC') },
  };
  return {
    loadSeasonTotals: (y) => { calls.push(y); return seasons[y] ?? {}; },
    loadDepth: () => ({ weeks: { 18: Object.fromEntries(TEAMS.map((t, i) => [t, i === 0 ? { QB: [], RB: ['2'], WR: ['1', '3'], TE: [] } : { QB: [], RB: [], WR: [], TE: [] }])) } }),
    loadAdvstats: () => ({}), loadSnapShare: () => null, loadRosterWeekly: () => ({}),
    loadPlayerIds: () => ({ bySleeper: {
      1: { birthdate: '2000-01-01', draftYear: 2018 },
      2: { birthdate: '1999-01-01', draftYear: 2018 },
      3: { birthdate: '2000-03-01', draftYear: 2018 },
    } }),
    loadRawPlayers: () => ({
      1: { position: 'WR', age: 30, team: 'BUF', full_name: 'Alpha Stale', years_exp: 8 },
      2: { position: 'RB', age: 28, team: null, full_name: 'Bravo Teamless', years_exp: 8 },
      3: { position: 'WR', age: 26, team: 'KC', full_name: 'Charlie Fresh', years_exp: 8 },
    }),
    loadLeaguePositionOf: () => (pid) => ({ 1: 'WR', 2: 'RB', 3: 'WR' })[pid] ?? null,
    loadLeagueScoring: () => ({ rec: 1 }),
    loadManifest: () => ({}),
    gitRev: () => 'testrev',
  };
}

describe('T-GAP', () => {
  const calls = [];
  const result = runAgeCurveGap({ load: makeLoad(calls) });

  test('APP and BIRTH curves differ exactly where the Sleeper and birthdate ages differ', () => {
    const wr = result.curves.WR.rows;
    // pid 3 (equal ages) feeds ages 24 and 25 in both curves; pid 1 feeds 28/29 in APP and 24/25 in BIRTH
    assert.deepEqual(wr.map(r => r.age), [24, 25, 28, 29]);
    assert.deepEqual(wr.map(r => r.appN), [1, 1, 1, 1]);
    assert.deepEqual(wr.map(r => r.birthN), [2, 2, 0, 0]);
    assert.equal(wr[2].birthPPG, null);
    assert.equal(wr[0].delta !== 0, true);
    // RB: Sleeper 28 vs true 27 → buckets shift by one
    const rb = result.curves.RB.rows;
    assert.deepEqual(rb.map(r => r.age), [25, 26, 27]);
    assert.deepEqual(rb.map(r => r.appN), [0, 1, 1]);
    assert.deepEqual(rb.map(r => r.birthN), [1, 1, 0]);
    assert.equal(result.basisScaleEqual, true);
  });

  test('row-level gap counts, mean and the has-team split on hand-computed values', () => {
    // pid 1: gap 4, 4; pid 2: gap 1, 1 (not > 1); pid 3: gap 0, 0
    assert.equal(result.rowGap.all.n, 6);
    assert.equal(result.rowGap.all.off1, 2);
    assert.ok(Math.abs(result.rowGap.all.mean - 10 / 6) < 1e-9);
    assert.equal(result.rowGap.withTeam.n, 4);
    assert.equal(result.rowGap.noTeam.n, 2);
    assert.equal(result.rowGap.noTeam.off1, 0);
    assert.equal(result.rowGap.season2015.n, 0);
  });

  test('the (a)/(b)/(c) settings change only what they name', () => {
    assert.equal(result.population.total, 2);   // pids 1 and 3 (teamless pid 2 is outside the population)
    const byPid = Object.fromEntries(result.top.map(r => [r.pid, r]));
    assert.deepEqual(Object.keys(byPid).sort(), ['1', '3']);
    // pid 3's scored age is the same in (b) and (c): only the curve differs between (a) and (b)
    assert.equal(byPid['3'].ageAdj.b, byPid['3'].ageAdj.c);
    assert.equal(byPid['3'].sleeperAge, byPid['3'].birthAge);
    // pid 1's scored age differs, so (c) can differ from (b)
    assert.notEqual(byPid['1'].sleeperAge, byPid['1'].birthAge);
    for (const key of ['bMinusA', 'cMinusA']) {
      const [x, y] = ['ageAdj'].flatMap(() => [byPid['1'], byPid['3']]);
      const to = key === 'bMinusA' ? 'b' : 'c';
      const deltas = [x, y].map(r => r.ageAdj[to] - r.ageAdj.a);
      const s = result.pooled[key].ageAdjusted;
      assert.equal(s.rows, 2);
      assert.equal(s.changed, deltas.filter(d => d !== 0).length);
      assert.equal(s.abs5, deltas.filter(d => Math.abs(d) >= 5).length);
      assert.equal(s.dist.min, Math.min(...deltas));
      assert.equal(s.dist.max, Math.max(...deltas));
      assert.ok(Math.abs(s.dist.mean - (deltas[0] + deltas[1]) / 2) < 1e-9);
    }
    assert.equal(result.population.excluded.notInAsOfUniverse, 0);
  });

  test('the distribution helper on hand values', () => {
    assert.deepEqual(distribution([5, 1, 3, 2, 4]), { min: 1, p10: 1, median: 3, mean: 3, p90: 5, max: 5 });
    assert.equal(distribution([]).median, null);
    assert.equal(distribution([1, 2, 3, 4]).median, 2.5);
  });

  test('the run never reads 2026 and the as-of loader refuses it', () => {
    assert.ok(calls.length > 0);
    assert.ok(calls.every(y => y <= 2025), `season-totals years read: ${[...new Set(calls)]}`);
  });

  test('the markdown carries the pooled line, the 2015 check and the closing line', () => {
    const md = buildAgeCurveGapMarkdown(result);
    assert.ok(md.includes(pooledLine(result)));
    assert.ok(md.includes('2015 row-gap check'));
    assert.ok(md.trim().endsWith("Report-only. The priority of the age fix is Anton's decision (backlog: 'Age curves and age inputs read stale Sleeper ages')."));
  });

  test('--age-curve-gap --basis league exits 1 with the pinned message', () => {
    const r = spawnSync('node', ['bin/backtest.mjs', '--age-curve-gap', '--basis', 'league'], { cwd: root, encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /the inputs and reference date are pinned by the task file, not knobs/);
  });
});
