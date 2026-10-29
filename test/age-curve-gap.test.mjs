/**
 * test/age-curve-gap.test.mjs — T-GAP: the S3a age-curve gap report (scripts/age-curve-gap-run.mjs), on a
 * synthetic in-memory store (Invariant 10). No store reads.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runAgeCurveGap, buildAgeCurveGapMarkdown, distribution, pooledLine, peakAgeSentence } from '../scripts/age-curve-gap-run.mjs';
import { asOfLoad, LookAheadError } from '../scripts/dynasty-asof.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEAMS = Array.from({ length: 32 }, (_, i) => `T${i}`);
const row = (gp, fp, team) => ({ gamesPlayed: gp, fantasyPoints: fp, scoringBasis: 'half_ppr', team, stats: { rec: Math.round(fp / 2) } });

// Reference date D = 2026-05-18. Pid 1: Sleeper 30, true 26 (born 2000-01-01); pid 3: Sleeper 26, true 26; pid 2 (RB, no team): Sleeper 28, true 27.
function makeLoad(calls = []) {
  const seasons = {
    2024: { 1: row(16, 128, 'BUF'), 2: row(16, 160, 'BUF'), 3: row(16, 192, 'KC') },
    2025: { 1: row(16, 160, 'BUF'), 2: row(16, 176, 'BUF'), 3: row(16, 208, 'KC') },
    2026: { 1: row(16, 9999, 'SENTINEL') },   // must never be read: the as-of loader refuses it
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

// The (a)/(b)/(c) store: five WRs, all gp 16, draftYear 2018, one row each in 2024 and 2025, league scoring {rec: 1} with
// stats.rec = fantasyPoints (so the rescored fantasyPoints equal fp and PPG = fp / 16 = 10, 12, ...). Reference date
// D = 2026-05-18, currentYear 2026, so the age a row feeds the curve at is round(age − (2026 − season)): age − 2 (2024), age − 1 (2025).
//   pid  Sleeper age  true age (birthdate)  PPG 2024, 2025
//   11   26           26                    10, 12
//   12   28           28                    12, 11
//   13   31           27                    13, 14   (stale Sleeper age)
//   14   24           24                    8, 9
//   15   28           31                    10, 11   (Sleeper age below the true age)
const GAP_PPG = { 11: [10, 12], 12: [12, 11], 13: [13, 14], 14: [8, 9], 15: [10, 11] };
const GAP_SLEEPER = { 11: 26, 12: 28, 13: 31, 14: 24, 15: 28 };
const GAP_BIRTH = { 11: '2000-01-01', 12: '1998-01-01', 13: '1999-01-01', 14: '2002-01-01', 15: '1995-01-01' };
const GAP_TEAM = { 11: 'BUF', 12: 'KC', 13: 'MIA', 14: 'NYJ', 15: 'DAL' };
function makeGapLoad(calls = []) {
  const gpRow = (pid, i) => ({ gamesPlayed: 16, fantasyPoints: GAP_PPG[pid][i] * 16, scoringBasis: 'half_ppr', team: GAP_TEAM[pid], stats: { rec: GAP_PPG[pid][i] * 16 } });
  const seasons = {
    2024: Object.fromEntries(Object.keys(GAP_PPG).map(p => [p, gpRow(p, 0)])),
    2025: Object.fromEntries(Object.keys(GAP_PPG).map(p => [p, gpRow(p, 1)])),
    2026: { 11: gpRow(11, 1) },   // must never be read
  };
  return {
    loadSeasonTotals: (y) => { calls.push(y); return seasons[y] ?? {}; },
    loadDepth: () => ({ weeks: { 18: Object.fromEntries(TEAMS.map((t, i) => [t, i === 0 ? { QB: [], RB: [], WR: ['11'], TE: [] } : { QB: [], RB: [], WR: [], TE: [] }])) } }),
    loadAdvstats: () => ({}), loadSnapShare: () => null, loadRosterWeekly: () => ({}),
    loadPlayerIds: () => ({ bySleeper: Object.fromEntries(Object.keys(GAP_PPG).map(p => [p, { birthdate: GAP_BIRTH[p], draftYear: 2018 }])) }),
    loadRawPlayers: () => Object.fromEntries(Object.keys(GAP_PPG).map(p => [p, { position: 'WR', age: GAP_SLEEPER[p], team: GAP_TEAM[p], full_name: `Wr ${p}`, years_exp: 8 }])),
    loadLeaguePositionOf: () => () => 'WR',
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

  describe('the (a)/(b)/(c) settings on hand-computed values', () => {
    const gcalls = [];
    const g = runAgeCurveGap({ load: makeGapLoad(gcalls) });
    const byPid = Object.fromEntries(g.top.map(r => [r.pid, r]));

    test('the population is the five WRs', () => {
      assert.equal(g.population.total, 5);
      assert.deepEqual(Object.keys(byPid).sort(), ['11', '12', '13', '14', '15']);
    });

    test('the two curves, by hand', () => {
      // APP ages (Sleeper): 11 → 24,25 (10,12); 12 → 26,27 (12,11); 13 → 29,30 (13,14); 14 → 22,23 (8,9); 15 → 26,27 (10,11).
      // APP buckets (median): 22:8  23:9  24:10  25:12  26:[12,10]=11  27:[11,11]=11  29:13  30:14.
      // rollingAvg3 over the sorted points (window = neighbours present): 22:(8+9)/2=8.5  23:(8+9+10)/3=9  24:(9+10+12)/3=10.3333
      //   25:(10+12+11)/3=11  26:(12+11+11)/3=11.3333  27:(11+11+13)/3=11.6667  29:(11+13+14)/3=12.6667  30:(13+14)/2=13.5.
      // derived peak = 30 (13.5), cap WR 28 → capped peak age 28; the point nearest 28 is 27 (|1|, first of the tie with 29) → peakPPG 11.6667.
      // BIRTH ages (true): 11 → 24,25 (10,12); 12 → 26,27 (12,11); 13 → 25,26 (13,14); 14 → 22,23 (8,9); 15 → 29,30 (10,11).
      // BIRTH buckets: 22:8  23:9  24:10  25:[12,13]=12.5  26:[12,14]=13  27:11  29:10  30:11.
      // smoothed: 22:8.5  23:9  24:(9+10+12.5)/3=10.5  25:(10+12.5+13)/3=11.8333  26:(12.5+13+11)/3=12.1667  27:(13+11+10)/3=11.3333
      //   29:(11+10+11)/3=10.6667  30:(10+11)/2=10.5. Peak = 26 (12.1667) < cap → capped peak age 26, peakPPG 12.1667.
      const c = g.curves.WR;
      assert.deepEqual(c.peakAge, { app: 28, birth: 26 });
      assert.equal(c.peakPPG.app, 11.667);
      assert.equal(c.peakPPG.birth, 12.167);
      assert.deepEqual(c.rows.map(r => r.age), [22, 23, 24, 25, 26, 27, 29, 30]);
      assert.deepEqual(c.rows.map(r => r.appPPG), [8.5, 9, 10.333, 11, 11.333, 11.667, 12.667, 13.5]);
      assert.deepEqual(c.rows.map(r => r.birthPPG), [8.5, 9, 10.5, 11.833, 12.167, 11.333, 10.667, 10.5]);
    });

    test('ageAdj per pid under (a), (b), (c)', () => {
      // ageAdj = round(clamp(levelPPG / interpolateAgeCurve(curve, scoredAge) × 50, 0, 100)); levelPPG = the 2025 PPG;
      // interpolation is linear between points and flat beyond the ends.
      // pid 11 (level 12; scored age 26 under all three — Sleeper = true): (a) APP@26 = 11.3333 → 12/11.3333×50 = 52.94 → 53;
      //   (b) BIRTH@26 = 12.1667 → 49.32 → 49; (c) the same age and curve as (b) → 49.        [curve-only effect: 53 → 49]
      // pid 12 (level 11; age 28 both): (a) APP@28 = halfway 27 (11.6667) and 29 (12.6667) = 12.1667 → 45.21 → 45;
      //   (b) BIRTH@28 = halfway 27 (11.3333) and 29 (10.6667) = 11 → 11/11×50 = 50; (c) 50.
      // pid 13 (level 14; Sleeper 31, true 27): (a) APP@31 ≥ last point (30) = 13.5 → 51.85 → 52;
      //   (b) BIRTH@31 ≥ last point (30) = 10.5 → 66.67 → 67; (c) BIRTH@27 = 11.3333 → 61.76 → 62.   [scored-age effect: 67 → 62]
      // pid 14 (level 9; age 24 both): (a) APP@24 = 10.3333 → 43.55 → 44; (b) BIRTH@24 = 10.5 → 42.86 → 43; (c) 43.
      // pid 15 (level 11; Sleeper 28, true 31): (a) APP@28 = 12.1667 → 11/12.1667×50 = 45.21 → 45;
      //   (b) BIRTH@28 = 11 → 50; (c) BIRTH@31 ≥ last point (30) = 10.5 → 52.38 → 52.
      assert.deepEqual(byPid['11'].ageAdj, { a: 53, b: 49, c: 49 });
      assert.deepEqual(byPid['12'].ageAdj, { a: 45, b: 50, c: 50 });
      assert.deepEqual(byPid['13'].ageAdj, { a: 52, b: 67, c: 62 });
      assert.deepEqual(byPid['14'].ageAdj, { a: 44, b: 43, c: 43 });
      assert.deepEqual(byPid['15'].ageAdj, { a: 45, b: 50, c: 52 });
      // (i) Sleeper age = true age and (a) ≠ (b): pid 11; (ii) Sleeper age ≠ true age and (b) ≠ (c): pid 13 (and 15)
      assert.equal(byPid['11'].sleeperAge, byPid['11'].birthAge);
      assert.notEqual(byPid['11'].ageAdj.a, byPid['11'].ageAdj.b);
      assert.notEqual(byPid['13'].sleeperAge, byPid['13'].birthAge);
      assert.notEqual(byPid['13'].ageAdj.b, byPid['13'].ageAdj.c);
    });

    test('pooled deltas from the literal ageAdj values', () => {
      // (b − a): 11: 49−53 = −4; 12: 50−45 = +5; 13: 67−52 = +15; 14: 43−44 = −1; 15: 50−45 = +5.
      //   rows 5; changed 5; |Δ| ≥ 5: 12, 13, 15 → 3; min −4; max 15; mean (−4+5+15−1+5)/5 = 20/5 = 4.
      // (c − a): 11: −4; 12: +5; 13: 62−52 = +10; 14: −1; 15: 52−45 = +7.
      //   rows 5; changed 5; |Δ| ≥ 5: 12, 13, 15 → 3; min −4; max 10; mean (−4+5+10−1+7)/5 = 17/5 = 3.4.
      const b = g.pooled.bMinusA.ageAdjusted, cc = g.pooled.cMinusA.ageAdjusted;
      assert.deepEqual([b.rows, b.changed, b.abs5, b.dist.min, b.dist.max], [5, 5, 3, -4, 15]);
      assert.ok(Math.abs(b.dist.mean - 4) < 1e-9);
      assert.deepEqual([cc.rows, cc.changed, cc.abs5, cc.dist.min, cc.dist.max], [5, 5, 3, -4, 10]);
      assert.ok(Math.abs(cc.dist.mean - 3.4) < 1e-9);
      assert.equal(g.population.excluded.notInAsOfUniverse, 0);
    });

    test('late-career counts and label changes (F7)', () => {
      // isLateCareer = scored age − capped peak age ≥ 5. Peak ages: APP 28, BIRTH 26.
      // (a) Sleeper ages vs 28: 26→−2, 28→0, 31→3, 24→−4, 28→0 — none late → 0.
      // (b) Sleeper ages vs 26: 0, 2, 31−26 = 5 (pid 13: late), −2, 2 → 1.
      // (c) true ages vs 26: 26→0, 28→2, 27→1, 24→−2, 31−26 = 5 (pid 15: late) → 1.
      // Labels (pickDynastyLabelMirror): the non-age components are identical across settings, so a total score moves by
      //   about 0.28 × Δ ageAdj; the baseline (a) mirror scores are 11: 52, 12: 40, 13: 52, 14: 39, 15: 42 (read from one run
      //   of the mirror) and shift to (b) 51, 41, 54, 39, 42 and (c) 51, 41, 54, 39, 43.
      //   pid 13: (a) 52 not late, slope > 0 (13 → 14) → 'Plateau' (≥ 40); (b) late, 54 → 'Managed Decline' (40–55); (c) not late → 'Plateau'.
      //   pid 15: (a) 42 → 'Plateau'; (b) 42 not late → 'Plateau'; (c) late, 43 → 'Managed Decline'.
      //   pid 11 (52/51 → Plateau), 12 (slope < 0, ≥ 40 → Managed Decline), 14 (39 → Sell Now) keep their label throughout.
      //   So label changes (a → b) = 1 (pid 13), (a → c) = 1 (pid 15), the one transition 'Plateau → Managed Decline'.
      const l = g.lateCareer;
      assert.deepEqual(l.pooled, { rows: 5, lateA: 0, lateB: 1, lateC: 1, labelChangeAB: 1, labelChangeAC: 1 });
      assert.deepEqual(l.byPosition.WR, l.pooled);
      assert.deepEqual(l.byPosition.QB, { rows: 0, lateA: 0, lateB: 0, lateC: 0, labelChangeAB: 0, labelChangeAC: 0 });
      assert.deepEqual(l.transitions, [{ transition: 'Plateau → Managed Decline', count: 1 }]);
      const md = buildAgeCurveGapMarkdown(g);
      assert.ok(md.includes('### Late-career gate and labels'));
      assert.ok(md.includes('| pooled | 5 | 0 | 1 | 1 | 1 | 1 |'));
      assert.ok(md.includes('| Plateau → Managed Decline | 1 |'));
      assert.ok(md.includes('Capped peak age APP 28, BIRTH 26; `isLateCareer` fires at age ≥ peak + 5 (33 vs 31).'));
    });

    test('the run never reads 2026 and the as-of loader refuses it', () => {
      assert.ok(gcalls.length > 0);
      assert.ok(gcalls.every(y => y <= 2025), `season-totals years read: ${[...new Set(gcalls)]}`);
      assert.throws(() => asOfLoad(makeGapLoad(), 2025).loadSeasonTotals(2026), LookAheadError);
    });
  });

  test('the peak-age sentence prints dashes when a position has no curve', () => {
    assert.equal(peakAgeSentence({ peakAge: { app: null, birth: null } }),
      'Capped peak age APP —, BIRTH —; `isLateCareer` fires at age ≥ peak + 5 (— vs —).');
  });

  test('the distribution helper on hand values', () => {
    assert.deepEqual(distribution([5, 1, 3, 2, 4]), { min: 1, p10: 1, median: 3, mean: 3, p90: 5, max: 5 });
    assert.equal(distribution([]).median, null);
    assert.equal(distribution([1, 2, 3, 4]).median, 2.5);
  });

  test('the run never reads 2026 and the as-of loader refuses it', () => {
    assert.ok(calls.length > 0);
    assert.ok(calls.every(y => y <= 2025), `season-totals years read: ${[...new Set(calls)]}`);
    assert.throws(() => asOfLoad(makeLoad(), 2025).loadSeasonTotals(2026), LookAheadError);
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
