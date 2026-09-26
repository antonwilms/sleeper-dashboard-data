/**
 * test/inseason.test.mjs — in-season evidence Phase 2a (.claude/tasks/in-season-evidence-2a-backtest.md §7).
 *
 * Fixture loaders throughout; test 3 (arm S pin) alone reads the live store, read-only, through `runArmS`
 * (arm S only — no factor reconstruction, no bootstrap — so `npm test` stays fast). Test 1's byte-identity
 * leg (the five `bin/panel.mjs` modes before/after the extraction) is a hand-back item, not a unit test:
 * it needs a pre-edit checkout to compare against.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

import {
  attachFactorMultipliers, teamKeyResolver, buildTeamTotalsForSeason,
} from '../lib/panel.mjs';
import {
  IN_SEASON_DEFAULTS, STUDY_K, PHASE1_K, opportunities, reconcileOpportunities, buildCheckpoints, depthOrderIndex, regGames,
  suffStats, suffStatsByCluster, fitK, lossAtK, pinK, mulberry32, clusteredBootstrap, bootstrapPairedMean, cellVerdict,
  compareLabel, loso, analyzeKCell, classifyArm, blend, confidenceTier,
} from '../lib/inSeasonEvidence.mjs';
import {
  guardLoad, runReconciliation, ReconciliationStop, runArmS, enumerateCandidates, makeScheduleIndex, verifyConstants,
  formatConstantsJson, pinDecision, makePut, runInSeason, addFoldK, inSeasonMain,
} from '../scripts/inseason-run.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

// ═══════════════════════════════════════════════════════════════════════════
// 1 — the attachFactorMultipliers seams (§2.2)
// ═══════════════════════════════════════════════════════════════════════════

function totalsRec({ team, gamesPlayed, stats = {}, fantasyPoints = 0, weeklyPoints = {}, gamesStarted = 0 }) {
  return { team, gamesPlayed, gamesStarted, stats, fantasyPoints, weeklyPoints };
}

function outcomesMapFrom(totalsByYear) {
  const ppgByYear = {};
  for (const [yr, yearTotals] of Object.entries(totalsByYear)) {
    const map = new Map();
    for (const [pid, rec] of Object.entries(yearTotals)) {
      const gp = rec.gamesPlayed ?? 0;
      map.set(pid, { actualPPG: gp > 0 ? rec.fantasyPoints / gp : null, actualGames: gp });
    }
    ppgByYear[yr] = map;
  }
  return ppgByYear;
}

function wrFixture() {
  const totalsByYear = {};
  for (let y = 2016; y <= 2020; y++) {
    const yearRows = {
      w1: totalsRec({ team: 'KC', gamesPlayed: 16, gamesStarted: 12, fantasyPoints: 160, stats: { rec_tgt: 90, rec: 60, rec_yd: 800, rec_td: 5, rec_rz_tgt: 15, off_snp: 650, tm_off_snp: 1000 } }),
    };
    for (let i = 0; i < 15; i++) {
      yearRows['f' + i] = totalsRec({
        team: i % 2 === 0 ? 'KC' : 'DAL', gamesPlayed: 16, fantasyPoints: 80 + i * 5,
        stats: { rec_tgt: 40 + i * 5, rec: 25 + i * 3, rec_yd: 300 + i * 20, rec_td: 2, rec_rz_tgt: 5 + i, off_snp: 400 + i * 20, tm_off_snp: 1000 },
      });
    }
    totalsByYear[y] = yearRows;
  }
  return totalsByYear;
}

function attachCtx(totalsByYear, extra = {}) {
  const years = Object.keys(totalsByYear).map(Number);
  const teamOf = teamKeyResolver('per-season-team', totalsByYear, Math.max(...years));
  const teamTotalsByYear = {};
  for (const y of years) teamTotalsByYear[y] = buildTeamTotalsForSeason(totalsByYear[y], y, teamOf);
  const advstatsByYear = {};
  for (const [y, t] of Object.entries(totalsByYear)) {
    advstatsByYear[y] = { players: Object.fromEntries(Object.keys(t).map(pid => [pid, { position: 'WR', team: t[pid].team }])) };
  }
  return { totalsByYear, teamTotalsByYear, ppgByYear: outcomesMapFrom(totalsByYear), advstatsByYear, ...extra };
}

describe('1: attachFactorMultipliers in-season seams', () => {
  const totals = wrFixture();
  const baseRow = [{ sleeperId: 'w1', position: 'WR', predictorYear: 2020, team: 'KC', mover: false, features: {}, candidates: {}, outcomePPG: 15 }];
  const depthByYear = { 2020: { weeks: { 1: { KC: { WR: ['f0', 'w1'] } }, 18: { KC: { WR: ['f0', 'w1'] } } } } };

  test('defaults vs explicit { requirePositiveOutcome: true, depthOrderOf: null } are deep-equal', () => {
    const a = attachFactorMultipliers(baseRow, attachCtx(totals, { depthByYear }));
    const b = attachFactorMultipliers(baseRow, attachCtx(totals, { depthByYear, requirePositiveOutcome: true, depthOrderOf: null }));
    assert.deepEqual(a, b);
    assert.equal(a.rows.length, 1);
  });

  test('a depthOrderOf stub changes only multipliers.depth (and the order-dependent compBlend)', () => {
    const a = attachFactorMultipliers(baseRow, attachCtx(totals, { depthByYear })).rows[0];
    const seen = [];
    const b = attachFactorMultipliers(baseRow, attachCtx(totals, {
      depthByYear, depthOrderOf: (pid, position, season, team) => { seen.push([pid, position, season, team]); return 1; },
    })).rows[0];
    assert.deepEqual(seen, [['w1', 'WR', 2020, 'KC']]);
    assert.notEqual(a.multipliers.depth, b.multipliers.depth, 'order 2 (file) vs order 1 (stub) must move the depth factor');
    const strip = (r) => { const { multipliers: { depth, compBlend, ...m }, ...rest } = r; return { ...rest, multipliers: m }; };
    assert.deepEqual(strip(a), strip(b));
  });

  test('requirePositiveOutcome:false keeps an outcomePPG:null row; the default drops it as nonPositiveOutcome', () => {
    const nullOutcome = [{ ...baseRow[0], outcomePPG: null }];
    const dropped = attachFactorMultipliers(nullOutcome, attachCtx(totals, { depthByYear }));
    assert.equal(dropped.rows.length, 0);
    assert.equal(dropped.fitCoverage.droppedByReason.nonPositiveOutcome, 1);
    const kept = attachFactorMultipliers(nullOutcome, attachCtx(totals, { depthByYear, requirePositiveOutcome: false }));
    assert.equal(kept.rows.length, 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2 — fitK
// ═══════════════════════════════════════════════════════════════════════════

describe('2: fitK', () => {
  // Single n: loss(w) = Saa + 2w·Sab + w²·Sbb, optimum w* = −Sab/Sbb; k* = n(1−w*)/w*.
  const statsFor = (n, kStar) => {
    const w = n / (n + kStar);
    return new Map([[n, { count: 10, Saa: 4, Sab: -w * 10, Sbb: 10 }]]);
  };

  test('closed-form optimum k* = 3.7 is returned', () => {
    const r = fitK(statsFor(5, 3.7));
    assert.equal(r.k, 3.7);
    assert.equal(r.kTenths, 37);
    assert.equal(r.boundary, null);
  });

  test('boundary flags: t = 0 and t = 400', () => {
    // obs perfectly predicts: w* ≥ 1 → k = 0
    const low = fitK(new Map([[5, { count: 10, Saa: 4, Sab: -20, Sbb: 10 }]]));
    assert.equal(low.kTenths, 0);
    assert.equal(low.boundary, 'low');
    // obs is pure noise around the prior: w* ≤ 0 → k = 40
    const high = fitK(new Map([[5, { count: 10, Saa: 4, Sab: 5, Sbb: 10 }]]));
    assert.equal(high.kTenths, 400);
    assert.equal(high.boundary, 'high');
  });

  test('ties resolve to the smaller k', () => {
    // no evidence signal at all (Sbb = Sab = 0): every k has the same loss
    const r = fitK(new Map([[3, { count: 5, Saa: 7, Sab: 0, Sbb: 0 }]]));
    assert.equal(r.kTenths, 0);
    assert.equal(r.k, 0);
  });

  test('pinK rounds to the nearest 0.5', () => {
    assert.equal(pinK(2.8), 3);
    assert.equal(pinK(2.7), 2.5);
    assert.equal(pinK(3.24), 3);
    assert.equal(pinK(3.25), 3.5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3 — arm S regression pin (the study's ROS-points k reproduces from the store)
// ═══════════════════════════════════════════════════════════════════════════

describe('3: arm S pin (live store, read-only)', () => {
  test('ROS points k by position: QB 5.0, RB 3.0, WR 4.2, TE 4.5 (±0.1)', () => {
    const { byPosition } = runArmS();
    const pins = { QB: 5.0, RB: 3.0, WR: 4.2, TE: 4.5 };
    for (const [pos, expected] of Object.entries(pins)) {
      assert.ok(Math.abs(byPosition[pos].k - expected) <= 0.1 + 1e-9,
        `${pos}: arm S k ${byPosition[pos].k} drifted from the probe definition (${expected}) — fix the arm, never the pin`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4 — suffStats
// ═══════════════════════════════════════════════════════════════════════════

describe('4: suffStats loss equals row-wise squared-error loss', () => {
  const rng = mulberry32(7);
  const rows = Array.from({ length: 200 }, (_, i) => ({
    sleeperId: `p${i % 40}`, S: 2014 + (i % 3), n: 1 + (i % 8),
    prior: 5 + rng() * 10, obs: 3 + rng() * 14, outcome: 4 + rng() * 12,
  }));
  const spec = { prior: 'prior', obs: 'obs', outcome: 'outcome' };
  const stats = suffStats(rows, spec);

  for (const k of [0, 0.7, 2.5, 6, 31.3]) {
    test(`k = ${k}`, () => {
      let direct = 0;
      for (const r of rows) {
        const w = k === 0 ? 1 : r.n / (r.n + k);
        const pred = r.prior + w * (r.obs - r.prior);
        direct += (pred - r.outcome) ** 2;
      }
      assert.ok(Math.abs(lossAtK(stats, k) - direct) < 1e-6 * Math.max(1, direct), `${lossAtK(stats, k)} vs ${direct}`);
    });
  }

  test('per-cluster stats sum to the pooled stats', () => {
    const clusters = suffStatsByCluster(rows, spec);
    const summed = new Float64Array(3 * 41);
    for (const d of clusters.values()) for (let i = 0; i < summed.length; i++) summed[i] += d[i];
    for (const [n, s] of stats) {
      assert.ok(Math.abs(summed[3 * n] - s.Saa) < 1e-9);
      assert.ok(Math.abs(summed[3 * n + 1] - s.Sab) < 1e-9);
      assert.ok(Math.abs(summed[3 * n + 2] - s.Sbb) < 1e-9);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5 — buildCheckpoints
// ═══════════════════════════════════════════════════════════════════════════

describe('5: buildCheckpoints', () => {
  // Team plays REG weeks 1,2,3,5,6,7 (bye in 4). A POST game must never reach teamGameWeeks (the schedule
  // index keeps REG only — asserted below).
  const teamGameWeeks = new Set([1, 2, 3, 5, 6, 7]);
  const weeklyPoints = { 1: 10, 2: 8, 5: 12, 6: 6, 7: 9 };          // week 3 played by the team, absent for the player
  const oppByWeek = { 1: 10, 2: 8 };                                 // weeks 5-7: no gamelogs REG row
  const targetsByWeek = { 1: 6, 2: 4 };
  const teamTargetsByWeek = { 1: 30, 2: 20, 3: 40, 5: 25, 6: 25, 7: 25 };  // week 3 belongs to the team, not the player's own weeks
  const cps = buildCheckpoints({ weeklyPoints, teamGameWeeks, oppByWeek, targetsByWeek, teamTargetsByWeek, checkpoints: [2, 4, 6] });
  const at = (W) => cps.find(c => c.W === W);

  test('n, observed PPG and ROS split at each W', () => {
    assert.equal(at(4).n, 2);
    assert.equal(at(4).obsPPG, 9);
    assert.equal(at(4).rosGames, 3);
    assert.equal(at(4).rosPPG, 9);           // (12 + 6 + 9) / 3
    assert.equal(at(6).n, 4);
    assert.equal(at(6).rosGames, 1);
  });

  test('a week the team played and the player has no weeklyPoints key counts as a miss; the bye does not', () => {
    assert.equal(at(2).missedInWindow, false);          // weeks 1,2 both played
    assert.equal(at(4).missedInWindow, true);           // team weeks <= 4 = {1,2,3}; player played 2
    const noMiss = buildCheckpoints({ weeklyPoints: { 1: 5, 2: 5, 3: 5 }, teamGameWeeks, checkpoints: [4] })[0];
    assert.equal(noMiss.missedInWindow, false, 'week 4 is a bye — not a miss');
  });

  test('POST games are excluded by the schedule index (REG only)', () => {
    const idx = makeScheduleIndex({ loadSchedule: () => ({ games: [
      { gameType: 'REG', week: 1, homeTeam: 'KC', awayTeam: 'DAL' },
      { gameType: 'REG', week: 2, homeTeam: 'KC', awayTeam: 'DAL' },
      { gameType: 'DIV', week: 19, homeTeam: 'KC', awayTeam: 'DAL' },
    ] }) })(2020);
    assert.deepEqual([...idx.get('KC')].sort(), [1, 2]);
  });

  test('a played week with no gamelogs REG row nulls obsOpp/obsShare for the window and is counted', () => {
    assert.equal(at(2).obsOpp, 9);                      // (10 + 8) / 2
    assert.equal(at(2).oppMissingWeeks, 0);
    assert.equal(at(6).obsOpp, null);
    assert.equal(at(6).obsShare, null);
    assert.equal(at(6).oppMissingWeeks, 2);
    assert.equal(at(4).rosOpp, null, 'ROS window with missing gamelogs rows has no opportunity value either');
  });

  test('rosGames < 4 is reported, not hidden', () => {
    assert.ok(at(4).rosGames < IN_SEASON_DEFAULTS.minRosGames);
  });

  test('a mid-season mover gets missedInWindow: null', () => {
    const m = buildCheckpoints({ weeklyPoints, teamGameWeeks, checkpoints: [4], mover: true })[0];
    assert.equal(m.missedInWindow, null);
  });

  test('regGames keeps REG games and drops POST/WILD/DIV', () => {
    const games = [
      { seasonType: 'REG', week: 1 }, { seasonType: 'REG', week: 2 },
      { seasonType: 'POST', week: 19 }, { seasonType: 'WILD', week: 19 }, { seasonType: 'DIV', week: 20 },
    ];
    assert.deepEqual(regGames({ games }).map(g => g.week), [1, 2]);
    assert.deepEqual(regGames(null), []);
    assert.deepEqual(regGames(undefined), []);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6 / 7 — opportunities, target share
// ═══════════════════════════════════════════════════════════════════════════

describe('6: opportunities', () => {
  test('QB = attempts + carries', () => assert.equal(opportunities({ attempts: 30, carries: 4, targets: 9 }, 'QB'), 34));
  test('WR = targets + carries', () => assert.equal(opportunities({ attempts: 0, carries: 2, targets: 9 }, 'WR'), 11));
  test('absent keys = 0', () => {
    assert.equal(opportunities({}, 'QB'), 0);
    assert.equal(opportunities({ targets: 5 }, 'RB'), 5);
    assert.equal(opportunities(undefined, 'WR'), 0);
  });
  test('reconcileOpportunities: REG only, tolerance max(2, 3%)', () => {
    const glp = { games: [
      { seasonType: 'REG', targets: 60, carries: 0 }, { seasonType: 'REG', targets: 50, carries: 0 }, { seasonType: 'POST', targets: 40, carries: 0 },
    ] };
    assert.equal(reconcileOpportunities(glp, { stats: { rec_tgt: 110, rush_att: 0 } }, 'WR').ok, true);
    assert.equal(reconcileOpportunities(glp, { stats: { rec_tgt: 113, rush_att: 0 } }, 'WR').ok, true, '3 off of 113 is inside 3%');
    assert.equal(reconcileOpportunities(glp, { stats: { rec_tgt: 120, rush_att: 0 } }, 'WR').ok, false);
    assert.equal(reconcileOpportunities({ games: [{ seasonType: 'REG', targets: 1 }] }, { stats: { rec_tgt: 3 } }, 'WR').ok, true, 'floor of 2');
  });
});

describe('7: target share uses team sums over the player\'s own played weeks only', () => {
  test('share = own targets / team targets in the played weeks; an unplayed team week is not in the denominator', () => {
    const cp = buildCheckpoints({
      weeklyPoints: { 1: 5, 2: 5 }, teamGameWeeks: new Set([1, 2, 3]), oppByWeek: { 1: 6, 2: 4 }, targetsByWeek: { 1: 6, 2: 4 },
      teamTargetsByWeek: { 1: 30, 2: 20, 3: 500 }, checkpoints: [3],
    })[0];
    assert.equal(cp.obsShare, (6 + 4) / (30 + 20));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8 — LOSO
// ═══════════════════════════════════════════════════════════════════════════

describe('8: LOSO', () => {
  test('an instrumented fit never sees a row of the held-out season', () => {
    const rows = [];
    for (const S of [2014, 2015, 2016, 2017]) for (let i = 0; i < 5; i++) rows.push({ sleeperId: `p${i}`, S, W: 1, n: 1, actual: S + i });
    const bySeason = new Map();
    for (const r of rows) { if (!bySeason.has(r.S)) bySeason.set(r.S, []); bySeason.get(r.S).push(r); }
    let calls = 0;
    const out = loso(bySeason, {
      fit: (train, heldOutS) => {
        calls++;
        assert.ok(train.length > 0);
        assert.ok(train.every(r => r.S !== heldOutS), `fit saw a row of held-out season ${heldOutS}`);
        return { mean: train.reduce((a, r) => a + r.actual, 0) / train.length };
      },
      predict: (m) => m.mean,
    });
    assert.equal(calls, 4);
    assert.equal(out.predictions.length, 20);
    assert.deepEqual(out.folds.map(f => f.S), [2014, 2015, 2016, 2017]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9 — bootstrap and mulberry32
// ═══════════════════════════════════════════════════════════════════════════

describe('9: clusteredBootstrap and mulberry32', () => {
  const clusters = Array.from({ length: 30 }, (_, i) => ({ sum: (i % 7) - 3 + i * 0.01, count: 1 + (i % 3) }));
  const stat = (s) => { let a = 0, n = 0; for (const c of s) { a += c.sum; n += c.count; } return a / n; };

  test('same seed → identical CI', () => {
    const a = clusteredBootstrap(clusters, stat, { resamples: 300, seed: 12345 });
    const b = clusteredBootstrap(clusters, stat, { resamples: 300, seed: 12345 });
    assert.deepEqual(a.ci95, b.ci95);
    const c = clusteredBootstrap(clusters, stat, { resamples: 300, seed: 999 });
    assert.notDeepEqual(a.ci95, c.ci95);
  });

  test('resamples clusters, not rows: a one-cluster input has a zero-width CI', () => {
    const b = bootstrapPairedMean(['a', 'a', 'a', 'a'], [1, 2, 3, 4], { resamples: 200, seed: 12345 });
    assert.equal(b.ci95[0], b.ci95[1]);
    assert.equal(b.ci95[0], 2.5);
    // many rows across many clusters → a real interval
    const ids = Array.from({ length: 200 }, (_, i) => `p${i}`);
    const wide = bootstrapPairedMean(ids, ids.map((_, i) => (i % 5) - 2), { resamples: 200, seed: 12345 });
    assert.ok(wide.ci95[1] > wide.ci95[0]);
  });

  test('mulberry32(12345) over 10^6 draws: > 999,000 distinct values, even share of floor(x·2^31) within 0.49–0.51', () => {
    const rng = mulberry32(12345);
    const seen = new Set();
    let even = 0;
    const N = 1e6;
    for (let i = 0; i < N; i++) {
      const x = rng();
      assert.ok(x >= 0 && x < 1);
      seen.add(x);
      if (Math.floor(x * 2 ** 31) % 2 === 0) even++;
    }
    assert.ok(seen.size > 999000, `only ${seen.size} distinct (the Step 4 LCG gives ~10^4)`);
    const share = even / N;
    assert.ok(share > 0.49 && share < 0.51, `even share ${share}`);
  });

  test('compareLabel and cellVerdict', () => {
    assert.equal(compareLabel([-0.3, -0.01]), 'BEATS');
    assert.equal(compareLabel([0.01, 0.3]), 'WORSE');
    assert.equal(compareLabel([-0.1, 0.1]), 'NO-GAIN');
    assert.equal(cellVerdict({ rows: 299, players: 100 }), 'INSUFFICIENT');
    assert.equal(cellVerdict({ rows: 400, players: 59 }), 'INSUFFICIENT');
    assert.equal(cellVerdict({ rows: 300, players: 60 }), 'OK');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 13 / 12 — the in-progress guard and the reconciliation stop
// ═══════════════════════════════════════════════════════════════════════════

function skillFixture({ players = 100, mismatched = 0, season = 2020 } = {}) {
  const totals = {}, gl = {}, adv = {};
  for (let i = 0; i < players; i++) {
    const pid = `w${i}`;
    totals[pid] = totalsRec({ team: 'KC', gamesPlayed: 10, stats: { rec_tgt: 100, rush_att: 0 }, fantasyPoints: 100, weeklyPoints: {} });
    const off = i < mismatched ? 25 : 0;
    gl[pid] = { games: [{ seasonType: 'REG', week: 1, team: 'KC', targets: 100 + off, carries: 0 }] };
    adv[pid] = { position: 'WR', team: 'KC' };
  }
  return {
    loadSeasonTotals: (y) => (y === season ? totals : null),
    loadGameLogs: (y) => (y === season ? { players: gl, unmapped: 0 } : null),
    loadAdvstats: (y) => (y === season ? { players: adv } : null),
    loadRoster: () => null,
    loadPlayerIds: () => ({ ids: {}, bySleeper: {} }),
    loadManifest: () => ({ files: {} }),
  };
}

describe('13: in-progress guard', () => {
  test('a read season marked inProgress: true in the manifest throws before the read', () => {
    let read = false;
    const load = {
      ...skillFixture(),
      loadSeasonTotals: (y) => { read = true; return null; },
      loadManifest: () => ({ files: { 'nfl/season-totals/2014.json': { inProgress: true } } }),
    };
    const guarded = guardLoad(load);
    assert.doesNotThrow(() => guarded.loadSeasonTotals(2013));
    read = false;
    assert.throws(() => guarded.loadSeasonTotals(2014), /inProgress: true/);
    assert.equal(read, false, 'the guard must fire before the loader runs');
  });

  test('a gamelogs season marked inProgress throws too; a year above maxLoadSeason throws', () => {
    const load = { ...skillFixture(), loadManifest: () => ({ files: { 'nflverse/gamelogs/2020.json': { inProgress: true } } }) };
    assert.throws(() => guardLoad(load).loadGameLogs(2020), /inProgress: true/);
    assert.throws(() => guardLoad(skillFixture()).loadSeasonTotals(2026), /above maxLoadSeason/);
  });

  test('runInSeason itself throws on an in-progress season (the run cannot read past the guard)', () => {
    const load = { ...skillFixture(), loadManifest: () => ({ files: { 'nfl/season-totals/2020.json': { inProgress: true } } }) };
    assert.throws(() => runInSeason({ load }), /inProgress: true/);
  });

  test('a missing manifest is refused, not skipped', () => {
    assert.throws(() => guardLoad({ ...skillFixture(), loadManifest: () => null }), /manifest\.json not found/);
  });

  test('a load with no loadManifest function throws (rather than silently skipping the guard)', () => {
    const { loadManifest, ...rest } = skillFixture();
    assert.throws(() => guardLoad(rest), /loadManifest is not a function/);
  });
});

describe('12: reconciliation stop', () => {
  test('2 of 100 player-seasons mismatched → ReconciliationStop; runInSeason throws before any artifact code', () => {
    const load = skillFixture({ mismatched: 2 });
    assert.throws(() => runReconciliation(load), (e) => e instanceof ReconciliationStop && e.reconciliation.rate === 0.98);
    assert.throws(() => runInSeason({ load }), ReconciliationStop);
  });

  test('1 of 100 mismatched passes the gate (rate 0.99); a clean fixture reports the population', () => {
    const r = runReconciliation(skillFixture({ mismatched: 1 }));
    assert.equal(r.population, 100);
    assert.equal(r.pass, 99);
    assert.equal(r.ok, true);
  });

  test('absent-from-gamelogs skill player-seasons are counted separately, not failures', () => {
    const load = skillFixture();
    const gl = load.loadGameLogs(2020);
    delete gl.players.w0;
    const r = runReconciliation(load);
    assert.equal(r.absentFromGamelogs[2020], 1);
    assert.equal(r.population, 99);
  });

  test('the CLI rejects every flag but --json/--write', () => {
    const r = spawnSync('node', ['bin/backtest.mjs', '--inseason', '--from', '2015'], { cwd: REPO_ROOT, encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /--inseason rejects --from/);
  });

  test('inSeasonMain returns 1 on the reconciliation stop and never calls writeArtifacts, even with write: true', () => {
    const load = skillFixture({ mismatched: 2 });
    let calls = 0;
    const code = inSeasonMain({ load, write: true, writeArtifacts: () => { calls++; return {}; }, log: () => {}, logErr: () => {} });
    assert.equal(code, 1);
    assert.equal(calls, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 14 — arms partition
// ═══════════════════════════════════════════════════════════════════════════

describe('14: arms partition', () => {
  const S = 2020;
  const rec = (gp, fp = gp * 8) => totalsRec({ team: 'KC', gamesPlayed: gp, fantasyPoints: fp });
  const totalsByYear = {};
  for (let y = 2012; y <= 2020; y++) totalsByYear[y] = {};
  // vet: qualified 2018, 16 games in S-1
  totalsByYear[2018].vet = rec(16); totalsByYear[2019].vet = rec(16); totalsByYear[2020].vet = rec(15);
  // short: qualified 2018, only 3 games in S-1
  totalsByYear[2018].short = rec(14); totalsByYear[2019].short = rec(3); totalsByYear[2020].short = rec(10);
  // second-year: debut S-1 with 12 games (S-1 gp >= 8) — must land in X-rookie1p
  totalsByYear[2019].second = rec(12); totalsByYear[2020].second = rec(14);
  // true rookie: first appearance in S
  totalsByYear[2020].rookie = rec(9);
  // rookie path with an earlier appearance but never a qualifying season
  totalsByYear[2018].fringe = rec(2); totalsByYear[2019].fringe = rec(3); totalsByYear[2020].fringe = rec(6);
  // returning veteran: qualified in 2017, absent in 2018/2019
  totalsByYear[2017].returner = rec(15); totalsByYear[2020].returner = rec(8);
  // never played in S → not a candidate; TEAM_ pseudo-row → not a candidate; non-skill position → not a candidate
  totalsByYear[2019].idle = rec(16); totalsByYear[2020].idle = rec(0, 0);
  totalsByYear[2020].TEAM_KC = rec(17);
  totalsByYear[2020].kicker = rec(16); totalsByYear[2019].kicker = rec(16);
  const ppgByYear = outcomesMapFrom(totalsByYear);
  const positionOf = (pid) => (pid === 'kicker' ? 'K' : 'WR');

  const cands = enumerateCandidates({ S, totalsByYear, ppgByYear, positionOf });
  const armOf = Object.fromEntries(cands.map(c => [c.pid, c.arm]));

  test('every candidate with a prior is in exactly one of P, X-rookie0, X-rookie1p, X-short', () => {
    assert.deepEqual(Object.keys(armOf).sort(), ['fringe', 'rookie', 'second', 'short', 'returner', 'vet'].sort());
    for (const c of cands) assert.ok(['P', 'X-rookie0', 'X-rookie1p', 'X-short'].includes(c.arm));
    assert.equal(new Set(cands.map(c => c.pid)).size, cands.length);
  });

  test('arm assignment', () => {
    assert.equal(armOf.vet, 'P');
    assert.equal(armOf.short, 'X-short');
    assert.equal(armOf.returner, 'X-short', 'veteran path with S-1 gp = 0 is X-short');
    assert.equal(armOf.rookie, 'X-rookie0');
    assert.equal(armOf.fringe, 'X-rookie1p');
  });

  test('a second-year player with S-1 gp >= 8 lands in X-rookie1p (rookiePathStateAt routes them to the rookie path)', () => {
    assert.equal(armOf.second, 'X-rookie1p');
    const c = cands.find(x => x.pid === 'second');
    assert.equal(c.route, 'rookie');
    assert.equal(c.inR, true, 'still in arm R (S-1 gp >= 8, any path)');
  });

  test('classifyArm is total over its inputs', () => {
    assert.equal(classifyArm({ route: 'veteran', sm1Games: 8, earlierAppearance: true }), 'P');
    assert.equal(classifyArm({ route: 'veteran', sm1Games: 7, earlierAppearance: true }), 'X-short');
    assert.equal(classifyArm({ route: 'rookie', sm1Games: 0, earlierAppearance: false }), 'X-rookie0');
    assert.equal(classifyArm({ route: 'rookie', sm1Games: 12, earlierAppearance: true }), 'X-rookie1p');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10 — static: no assembleRookiePanel; the shipped rookie mirror is reachable here and only here
// ═══════════════════════════════════════════════════════════════════════════

describe('10: scripts/inseason-run.mjs source', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'scripts/inseason-run.mjs'), 'utf8');
  test('does not reference assembleRookiePanel (the CR-15 re-fit trap)', () => {
    assert.ok(!/assembleRookiePanel/.test(src));
  });
  test('imports the SHIPPED rookie projection', () => {
    assert.ok(/reconstructShippedRookieProjection/.test(src));
    assert.ok(/lib\/rookieMirror\.mjs/.test(src));
  });
  test('neither bin/panel.mjs nor scripts/panel-run.mjs imports the in-season adapter', () => {
    for (const f of ['bin/panel.mjs', 'scripts/panel-run.mjs', 'lib/panel.mjs']) {
      const imports = fs.readFileSync(path.join(REPO_ROOT, f), 'utf8').match(/\bfrom\s+['"][^'"]+['"]/g) ?? [];
      assert.ok(imports.length > 0, `${f}: the import scan found nothing (anti-vacuity)`);
      assert.ok(!imports.some(i => /inseason-run|inSeasonEvidence/.test(i)), f);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 11 — constants file re-derives from its fixture
// ═══════════════════════════════════════════════════════════════════════════

function syntheticCell(seed, { trueK = 3, seasons = [2014, 2015, 2016, 2017], perSeason = 90 } = {}) {
  const rng = mulberry32(seed);
  const rows = [];
  for (const S of seasons) {
    for (let i = 0; i < perSeason; i++) {
      const n = 1 + Math.floor(rng() * 8);
      const prior = 8 + rng() * 6, truth = prior + (rng() - 0.5) * 6;
      const obs = truth + (rng() - 0.5) * 8;
      const w = n / (n + trueK);
      const outcome = prior + w * (obs - prior) + (rng() - 0.5) * 2;
      rows.push({ sleeperId: `p${(i * 3 + S) % 89}`, S, W: n, n, prior, obs, outcome });
    }
  }
  return analyzeKCell(rows, { prior: 'prior', obs: 'obs', outcome: 'outcome' }, { bootstrap: { resamples: 50, seed: 12345 } });
}

describe('11: constants file', () => {
  const P = makePut();
  const qb = syntheticCell(1), rb = syntheticCell(2, { trueK: 5 });
  P.put('K_ROS_POINTS', 'QB', pinDecision(qb, 6), qb, 'synthetic|QB');
  P.put('K_ROS_POINTS', 'RB', pinDecision(rb, 3), rb, 'synthetic|RB');
  P.putWithPooled('K_DYN_POINTS', 'TE', { verdict: 'INSUFFICIENT', rows: 10, players: 4 }, rb, null, 'own', 'pooled');
  const file = { source: 'test', generatedAt: '2026-01-01T00:00:00.000Z', basis: 'half_ppr', fit: {}, constants: P.constants, combination: null, sortMeasure: { name: 'x', params: {} }, fixture: P.fixture };
  addFoldK(file);

  test('every kFit re-derives from the fixture by the fit rule', () => {
    assert.equal(qb.verdict, 'OK');
    assert.deepEqual(verifyConstants(file), []);
    assert.equal(file.constants.K_DYN_POINTS.TE.basis, 'pooled');
    assert.equal(file.constants.K_DYN_POINTS.TE.fixtureKey, 'K_DYN_POINTS|ALL');
  });

  test('a tampered kFit is caught', () => {
    const bad = JSON.parse(JSON.stringify(file));
    bad.constants.K_ROS_POINTS.QB.kFit += 0.5;
    assert.equal(verifyConstants(bad).length, 1);
  });

  test('a tampered foldK value is caught', () => {
    const bad = JSON.parse(JSON.stringify(file));
    const seasons = Object.keys(bad.constants.K_ROS_POINTS.QB.foldK);
    assert.ok(seasons.length > 0, 'anti-vacuity: the entry must carry at least one fold');
    bad.constants.K_ROS_POINTS.QB.foldK[seasons[0]] += 0.5;
    assert.equal(verifyConstants(bad).length, 1);
  });

  test('the written file round-trips as JSON and keeps constants/fixture', () => {
    const parsed = JSON.parse(formatConstantsJson(file));
    assert.deepEqual(parsed.constants, JSON.parse(JSON.stringify(file.constants)));
    assert.deepEqual(parsed.fixture, JSON.parse(JSON.stringify(file.fixture)));
    assert.deepEqual(verifyConstants(parsed), []);
  });

  test('pin rules (§4.5): boundary beats WORSE; WORSE pins the study value; INSUFFICIENT pins nothing', () => {
    const cell = (kFit, boundary, label) => ({ verdict: 'OK', rows: 500, players: 90, kFit: { k: kFit, boundary }, kPin: pinK(kFit), ci95: [1, 2], delta: { label } });
    assert.deepEqual([pinDecision(cell(40, 'high', 'WORSE'), 4.5).k, pinDecision(cell(40, 'high', 'WORSE'), 4.5).basis], [null, 'prior-only']);
    assert.deepEqual([pinDecision(cell(0, 'low', 'WORSE'), 4.5).k, pinDecision(cell(0, 'low', 'WORSE'), 4.5).basis], [0, 'observed-only']);
    assert.deepEqual([pinDecision(cell(2.2, null, 'WORSE'), 4.5).k, pinDecision(cell(2.2, null, 'WORSE'), 4.5).basis], [4.5, 'study']);
    assert.deepEqual([pinDecision(cell(2.2, null, 'NO-GAIN'), 4.5).k, pinDecision(cell(2.2, null, 'NO-GAIN'), 4.5).basis], [2, 'fitted']);
    assert.equal(pinDecision({ verdict: 'INSUFFICIENT', rows: 5, players: 2 }, 4.5).basis, 'insufficient');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// small pure helpers
// ═══════════════════════════════════════════════════════════════════════════

describe('helpers', () => {
  test('blend: k = 0 → observed, k = null → prior', () => {
    assert.equal(blend(10, 4, 3, 0), 4);
    assert.equal(blend(10, 4, 3, null), 10);
    assert.equal(blend(10, 4, 3, 3), 7);
  });
  test('confidenceTier follows the app tiers', () => {
    assert.deepEqual([1, 2, 3, 4, 5, 9].map(confidenceTier), ['low', 'low', 'medium', 'medium', 'high', 'high']);
  });
  test('depthOrderIndex: first team listing a pid wins; order is 1-based', () => {
    const idx = depthOrderIndex({ weeks: { 1: { KC: { WR: ['a', 'b'] }, DAL: { WR: ['b', 'c'] } } } }, 1);
    assert.equal(idx.get('WR|a'), 1);
    assert.equal(idx.get('WR|b'), 2);
    assert.equal(idx.get('WR|c'), 2);
    assert.equal(depthOrderIndex(null, 1).size, 0);
  });
  test('the study and Phase 1 tables are the §0 / §3.1 values', () => {
    assert.deepEqual(STUDY_K.ros.points, { QB: 6, RB: 3, WR: 4.5, TE: 5.5 });
    assert.deepEqual(STUDY_K.next.opp, { QB: 5.5, RB: 3.5, WR: 4.5, TE: 4 });
    assert.deepEqual(PHASE1_K.rosWeak, { RB: 3, WR: 3.5, TE: 4 });
    assert.deepEqual(PHASE1_K.dynPoints, STUDY_K.next.points);
  });
});
