/**
 * test/panel.test.mjs — E-0a pure-lib units (T-1 through T-9).
 *
 * Mirrors test/backtest.test.mjs's fixture conventions. lib/panel.mjs is pure
 * (no I/O) — these tests exercise it directly with in-memory fixtures shaped
 * like the production files (nfl/season-totals v3, nflverse/advstats, roster).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { standardize, solveOLS, rankTransform, spearman } from '../lib/backtest.mjs';
import {
  PANEL_GATES,
  BASELINE_FEATURES,
  teamKeyResolver,
  buildTeamTotalsForSeason,
  computeSeasonPoints,
  computeBasePPG,
  computeMomentum,
  computeConsistencyCV,
  computeMover,
  computeShare,
  computeYpt,
  computeRzOwnRate,
  resolvePosition,
  buildPanelRow,
  assemblePanelRows,
  forwardChainFolds,
  standardizeTrainApply,
  fitAndScoreFold,
  decideVerdict,
  classifyAttributionCohort,
  summarizeFeatureDelta,
  decideFlipVerdict,
} from '../lib/panel.mjs';
import { buildFlipReport } from '../scripts/panel-run.mjs';

// ─── Fixture helpers (production envelope shapes) ─────────────────────────────

function outcomesMap(entries) {
  // entries: { pid: { gamesPlayed, fantasyPoints } }
  const map = new Map();
  for (const [pid, { gamesPlayed, fantasyPoints }] of Object.entries(entries)) {
    map.set(pid, {
      actualGames: gamesPlayed,
      actualTotalPts: fantasyPoints,
      actualPPG: gamesPlayed > 0 ? fantasyPoints / gamesPlayed : null,
      played: gamesPlayed > 0,
    });
  }
  return map;
}

function totalsRec({ team, gamesPlayed, stats = {}, weeklyPoints = {} }) {
  return { team, gamesPlayed, stats, weeklyPoints };
}

// ═══════════════════════════════════════════════════════════════════════════
// T-1 — feature builders (C4 discipline)
// ═══════════════════════════════════════════════════════════════════════════

describe('T-1: feature builders', () => {
  test('share/ypt/rzOwnRate are ratios of summed season components, not per-game averages', () => {
    // Player targeted 2 and 10 in two different "games" would average to 6/game if
    // wrongly per-game-averaged; season-totals stores only the season SUM (12), so
    // any correct implementation must read the stored sum directly.
    const totalsByYear = {
      2022: {
        p1: totalsRec({ team: 'KC', gamesPlayed: 16, stats: { rec_tgt: 12, rec_yd: 120, rec_rz_tgt: 3 } }),
        p2: totalsRec({ team: 'KC', gamesPlayed: 16, stats: { rec_tgt: 8,  rec_yd: 80,  rec_rz_tgt: 2 } }),
      },
    };
    const teamOf = teamKeyResolver('current-team', totalsByYear, 2022);
    const teamTotalsByYear = { 2022: buildTeamTotalsForSeason(totalsByYear[2022], 2022, teamOf) };

    assert.equal(teamTotalsByYear[2022].totals.KC.recTgt, 20, 'team recTgt = sum(12,8), not averaged');

    const share = computeShare('p1', 'WR', 2022, totalsByYear, teamTotalsByYear, teamOf);
    assert.ok(Math.abs(share - 12 / 20) < 1e-9, 'share = ratio of summed components');

    const ypt = computeYpt('WR', totalsByYear[2022].p1);
    assert.ok(Math.abs(ypt - 120 / 12) < 1e-9, 'ypt = rec_yd / rec_tgt (summed)');

    const rzOwnRate = computeRzOwnRate('WR', totalsByYear[2022].p1);
    assert.ok(Math.abs(rzOwnRate - 3 / 12) < 1e-9, 'rzOwnRate = rec_rz_tgt / rec_tgt (summed)');
  });

  test('basePPG: 50/30/20 recency weighting with renormalization', () => {
    const ppgByYear = {
      2022: outcomesMap({ p1: { gamesPlayed: 16, fantasyPoints: 160 } }), // ppg=10
      2021: outcomesMap({ p1: { gamesPlayed: 16, fantasyPoints: 320 } }), // ppg=20
      2020: outcomesMap({ p1: { gamesPlayed: 16, fantasyPoints: 80 } }),  // ppg=5
    };
    // All three qualify (gp=16 >= 6): weighted mean = .5*10 + .3*20 + .2*5 = 5+6+1 = 12
    const full = computeBasePPG('p1', 2022, ppgByYear, 6);
    assert.ok(Math.abs(full - 12) < 1e-9, `full 3-season basePPG should be 12, got ${full}`);

    // Only Y qualifies (Y-1, Y-2 gp below min) → renormalized to just Y's ppg
    const ppgByYearSparse = {
      2022: outcomesMap({ p1: { gamesPlayed: 16, fantasyPoints: 160 } }),
      2021: outcomesMap({ p1: { gamesPlayed: 2, fantasyPoints: 20 } }),
      2020: outcomesMap({ p1: { gamesPlayed: 1, fantasyPoints: 5 } }),
    };
    const oneSeason = computeBasePPG('p1', 2022, ppgByYearSparse, 6);
    assert.ok(Math.abs(oneSeason - 10) < 1e-9, `1-qualifying-season basePPG should be 10, got ${oneSeason}`);

    // Y and Y-1 qualify, Y-2 doesn't → renormalized over {0.5, 0.3}: (.5*10+.3*20)/.8 = 13.75
    const ppgByYearTwo = {
      2022: outcomesMap({ p1: { gamesPlayed: 16, fantasyPoints: 160 } }),
      2021: outcomesMap({ p1: { gamesPlayed: 16, fantasyPoints: 320 } }),
      2020: outcomesMap({ p1: { gamesPlayed: 1, fantasyPoints: 5 } }),
    };
    const twoSeason = computeBasePPG('p1', 2022, ppgByYearTwo, 6);
    assert.ok(Math.abs(twoSeason - 13.75) < 1e-9, `2-qualifying-season basePPG should be 13.75, got ${twoSeason}`);
  });

  test('momentum imputes 0 with no qualifying Y-1', () => {
    const ppgByYear = {
      2022: outcomesMap({ p1: { gamesPlayed: 16, fantasyPoints: 160 } }),
      2021: outcomesMap({ p1: { gamesPlayed: 2, fantasyPoints: 20 } }), // below min games
    };
    assert.equal(computeMomentum('p1', 2022, ppgByYear, 6), 0, 'momentum neutral when Y-1 does not qualify');

    const ppgByYearBoth = {
      2022: outcomesMap({ p1: { gamesPlayed: 16, fantasyPoints: 160 } }), // ppg 10
      2021: outcomesMap({ p1: { gamesPlayed: 16, fantasyPoints: 128 } }), // ppg 8
    };
    const m = computeMomentum('p1', 2022, ppgByYearBoth, 6);
    assert.ok(Math.abs(m - 2) < 1e-9, `momentum should be 10-8=2, got ${m}`);
  });

  test('consistencyCV: population SD / mean over played weeks only; null on <4 played weeks', () => {
    const rec = totalsRec({ team: 'KC', gamesPlayed: 5, weeklyPoints: { 1: 10, 2: 10, 3: 10, 4: 10 } });
    const cv = computeConsistencyCV(rec);
    assert.ok(Math.abs(cv - 0) < 1e-9, 'zero variance → CV 0');

    const varied = totalsRec({ team: 'KC', gamesPlayed: 5, weeklyPoints: { 1: 5, 2: 15, 3: 10, 4: 10 } });
    const cv2 = computeConsistencyCV(varied);
    assert.ok(cv2 != null && cv2 > 0, 'varied weeks → positive CV');

    const tooFew = totalsRec({ team: 'KC', gamesPlayed: 3, weeklyPoints: { 1: 5, 2: 15, 3: 10 } });
    assert.equal(computeConsistencyCV(tooFew), null, '<4 played weeks → null');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T-2 — attribution seam
// ═══════════════════════════════════════════════════════════════════════════

describe('T-2: attribution seam', () => {
  test('current-team resolver returns anchor-year team for every season queried', () => {
    const totalsByYear = {
      2022: { p1: totalsRec({ team: 'B', gamesPlayed: 16 }) },
      2021: { p1: totalsRec({ team: 'A', gamesPlayed: 16 }) },
    };
    const teamOf = teamKeyResolver('current-team', totalsByYear, 2022);
    assert.equal(teamOf('p1', 2022), 'B');
    assert.equal(teamOf('p1', 2021), 'B', 'current-team ignores the season argument');
  });

  test("'per-season-team' resolves each season's own v3 team; anchorYear is ignored", () => {
    const totalsByYear = {
      2020: { p1: totalsRec({ team: 'A', gamesPlayed: 16 }) },
      2021: { p1: totalsRec({ team: 'B', gamesPlayed: 16 }) },
      2022: { p1: totalsRec({ team: null, gamesPlayed: 16 }) },
    };
    // anchorYear (2099) is deliberately absent from totalsByYear — if the resolver
    // used it instead of the season argument, every lookup below would return null.
    const teamOf = teamKeyResolver('per-season-team', totalsByYear, 2099);
    assert.equal(teamOf('p1', 2020), 'A', "resolves 2020's own team");
    assert.equal(teamOf('p1', 2021), 'B', "resolves 2021's own team");
    assert.equal(teamOf('p1', 2022), null, 'v3 team: null season → null');
    assert.equal(teamOf('p1', 2019), null, 'season absent from totalsByYear → null');
  });

  test('unknown mode throws', () => {
    assert.throws(() => teamKeyResolver('bogus-mode', {}, 2022), /unknown attribution mode/);
  });

  test('mover fixture: team A in Y-1, team B in Y → shareTrend Y-1 leg uses team-B totals, mover === true', () => {
    const totalsByYear = {
      2022: {
        p1: totalsRec({ team: 'B', gamesPlayed: 16, stats: { rec_tgt: 60, rec_rz_tgt: 8, off_snp: 700, tm_off_snp: 1000 } }),
        b1: totalsRec({ team: 'B', gamesPlayed: 16, stats: { rec_tgt: 40, rec_rz_tgt: 5 } }), // teammate on B in Y
      },
      2021: {
        p1: totalsRec({ team: 'A', gamesPlayed: 16, stats: { rec_tgt: 50, rec_rz_tgt: 6 } }),
        // no B-team players in the Y-1 file besides p1 himself (attributed to B under current-team)
      },
    };
    const teamOf = teamKeyResolver('current-team', totalsByYear, 2022);
    const teamTotalsByYear = {
      2022: buildTeamTotalsForSeason(totalsByYear[2022], 2022, teamOf),
      2021: buildTeamTotalsForSeason(totalsByYear[2021], 2021, teamOf),
    };

    // Y-1 team totals bucket p1's Y-1 stats under 'B' (his anchor-year team), not 'A'.
    assert.equal(teamTotalsByYear[2021].totals.B.recTgt, 50, "Y-1 leg attributed to team B, not A");
    assert.equal(teamTotalsByYear[2021].totals.A, undefined, 'no team-A bucket exists under current-team mode');

    const mover = computeMover('p1', 2022, totalsByYear);
    assert.equal(mover, true, 'direct v3 team read: A(Y-1) != B(Y) → mover');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T-3 — undercount reproduction
// ═══════════════════════════════════════════════════════════════════════════

describe('T-3: retired-player undercount', () => {
  test('player present in Y-1 but absent from Y is excluded from Y-1 team totals (counted unattributed)', () => {
    const totalsByYear = {
      2022: {
        p1: totalsRec({ team: 'KC', gamesPlayed: 16, stats: { rec_tgt: 50 } }),
        // retired: no entry for the veteran in 2022
      },
      2021: {
        p1: totalsRec({ team: 'KC', gamesPlayed: 16, stats: { rec_tgt: 40 } }),
        retired: totalsRec({ team: 'KC', gamesPlayed: 16, stats: { rec_tgt: 30 } }),
      },
    };
    const teamOf = teamKeyResolver('current-team', totalsByYear, 2022);
    const y1Totals = buildTeamTotalsForSeason(totalsByYear[2021], 2021, teamOf);

    assert.equal(y1Totals.totals.KC.recTgt, 40, 'only p1 (resolvable to anchor-year team) counted; retired excluded');
    assert.equal(y1Totals.unattributed, 1, 'retired player counted as unattributed');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T-4 — data-hole listwise exclusion + coverage
// ═══════════════════════════════════════════════════════════════════════════

describe('T-4: data-hole listwise exclusion + coverage', () => {
  function baseAdvstats(season, players) {
    return { schemaVersion: 1, season, generatedAt: '2026-01-01T00:00:00.000Z', rowCount: players.length, unmapped: 0,
      players: Object.fromEntries(players.map(p => [p.sleeperId, p])) };
  }

  test('missing off_snp (pre-2020 shape) → dropped with missingSnap', () => {
    const totalsByYear = {
      2019: { p1: totalsRec({ team: 'KC', gamesPlayed: 16, stats: { rec_tgt: 80, rec_rz_tgt: 10 } }) }, // no off_snp
      2020: { p1: totalsRec({ team: 'KC', gamesPlayed: 14, stats: { rec_tgt: 60, rec_rz_tgt: 8 } }) },
    };
    const advstatsY = baseAdvstats(2019, [{ sleeperId: 'p1', position: 'WR', team: 'KC', airYardsShare: 0.2 }]);
    const teamOf = teamKeyResolver('current-team', totalsByYear, 2019);
    const teamTotalsByYear = { 2019: buildTeamTotalsForSeason(totalsByYear[2019], 2019, teamOf) };
    const ppgByYear = {
      2019: outcomesMap({ p1: { gamesPlayed: 16, fantasyPoints: 160 } }),
      2020: outcomesMap({ p1: { gamesPlayed: 14, fantasyPoints: 140 } }),
    };

    const result = buildPanelRow({
      pid: 'p1', position: 'WR', anchorYear: 2019,
      totalsByYear, ppgByYear, advstatsY, teamOf, teamTotalsByYear,
      config: { minPredictorGames: 6, minOutcomeGames: 6 },
    });
    assert.equal(result.dropReason, 'missingSnap');
  });

  test('missing advstats year → whole year skipped, recorded in coverage.skippedYears', () => {
    const inputsByYear = {
      2021: { seasonTotals: { p1: totalsRec({ team: 'KC', gamesPlayed: 16 }) }, outcomes: new Map(), advstats: null, roster: null },
      2022: {
        seasonTotals: { p1: totalsRec({ team: 'KC', gamesPlayed: 16, stats: { rec_tgt: 60, rec_rz_tgt: 8, off_snp: 700, tm_off_snp: 1000 } }) },
        outcomes: outcomesMap({ p1: { gamesPlayed: 16, fantasyPoints: 160 } }),
        advstats: baseAdvstats(2022, [{ sleeperId: 'p1', position: 'WR', team: 'KC', airYardsShare: 0.2 }]),
        roster: null,
      },
    };
    const { coverage } = assemblePanelRows(inputsByYear, { fromYear: 2021, toYear: 2022, minPredictorGames: 6, minOutcomeGames: 6 });
    assert.deepEqual(coverage.skippedYears, [2021], 'year with null advstats is skipped');
  });

  test('teamRzShare denominator < TEAM_DENOM_MIN → noTeamDenominator drop', () => {
    const totalsByYear = {
      2022: {
        p1: totalsRec({ team: 'TINY', gamesPlayed: 16, stats: { rec_tgt: 25, rec_rz_tgt: 5, off_snp: 700, tm_off_snp: 1000 } }),
      },
      2021: {},
    };
    const advstatsY = baseAdvstats(2022, [{ sleeperId: 'p1', position: 'WR', team: 'TINY', airYardsShare: 0.2 }]);
    const teamOf = teamKeyResolver('current-team', totalsByYear, 2022);
    const teamTotalsByYear = { 2022: buildTeamTotalsForSeason(totalsByYear[2022], 2022, teamOf) };
    const ppgByYear = {
      2022: outcomesMap({ p1: { gamesPlayed: 16, fantasyPoints: 160 } }), // Y's own in-basis ppg (feeds basePPG)
      2023: outcomesMap({ p1: { gamesPlayed: 10, fantasyPoints: 100 } }), // outcome year
    };

    const result = buildPanelRow({
      pid: 'p1', position: 'WR', anchorYear: 2022,
      totalsByYear, ppgByYear, advstatsY, teamOf, teamTotalsByYear,
      config: { minPredictorGames: 6, minOutcomeGames: 6 },
    });
    // team recTgt = 25 >= TEAM_DENOM_MIN(20), so share(Y) survives; recRzTgt = 5 < 20 → teamRzShare null
    assert.equal(result.dropReason, 'noTeamDenominator');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T-5 — folds + leakage guard
// ═══════════════════════════════════════════════════════════════════════════

describe('T-5: forward-chaining folds + leakage guard', () => {
  test('forwardChainFolds([2020..2024], 2) → eval {2022,2023,2024} with correct train sets', () => {
    const folds = forwardChainFolds([2020, 2021, 2022, 2023, 2024], 2);
    assert.deepEqual(folds.map(f => f.evalYear), [2022, 2023, 2024]);
    assert.deepEqual(folds[0].trainYears, [2020, 2021]);
    assert.deepEqual(folds[1].trainYears, [2020, 2021, 2022]);
    assert.deepEqual(folds[2].trainYears, [2020, 2021, 2022, 2023]);
  });

  test('scaler/imputation uses training rows only — an eval-year outlier does not shift the training scaler', () => {
    const trainRows = [
      { predictorYear: 2020, features: { basePPG: 10 }, outcomePPG: 12 },
      { predictorYear: 2020, features: { basePPG: 12 }, outcomePPG: 14 },
      { predictorYear: 2021, features: { basePPG: 11 }, outcomePPG: 13 },
    ];
    const evalRowsNormal = [{ predictorYear: 2022, features: { basePPG: 11 }, outcomePPG: 13 }];
    const evalRowsOutlier = [{ predictorYear: 2022, features: { basePPG: 9999 }, outcomePPG: 13 }];

    const a = standardizeTrainApply(trainRows, evalRowsNormal, ['basePPG']);
    const b = standardizeTrainApply(trainRows, evalRowsOutlier, ['basePPG']);

    assert.deepEqual(a.scaler.means, b.scaler.means, 'training means unaffected by eval-row outlier');
    assert.deepEqual(a.scaler.sds, b.scaler.sds, 'training sds unaffected by eval-row outlier');
    assert.deepEqual(a.XTrain, b.XTrain, 'training design matrix unaffected by eval-row outlier');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T-6 — ridge (lib/backtest.mjs solveOLS)
// ═══════════════════════════════════════════════════════════════════════════

describe('T-6: ridge', () => {
  test('solveOLS(X, y) with no options reproduces the pre-ridge fixture (test/backtest.test.mjs A.1)', () => {
    // Same fixture as backtest.test.mjs A.1: Y = 2·X1 + 0·X2, X1⊥X2 → β1≈1, β2≈0.
    const X1 = [-2, -1, 0, 1, 2];
    const X2 = [1, -2, 1, -2, 1];
    const Y = X1.map(x => 2 * x);
    const zX1 = standardize(X1), zX2 = standardize(X2), zY = standardize(Y);
    const X = X1.map((_, i) => [zX1.z[i], zX2.z[i]]);

    const withoutOpts = solveOLS(X, zY.z);
    const withZeroRidge = solveOLS(X, zY.z, { ridgeLambda: 0 });
    assert.deepEqual(withoutOpts, withZeroRidge, 'omitting options is identical to ridgeLambda:0');

    assert.equal(withoutOpts.singular, false);
    assert.ok(Math.abs(withoutOpts.beta[0] - 1) < 1e-6, `β1 should be 1, got ${withoutOpts.beta[0]}`);
    assert.ok(Math.abs(withoutOpts.beta[1]) < 1e-6, `β2 should be 0, got ${withoutOpts.beta[1]}`);
  });

  test('ridgeLambda > 0 shrinks coefficients on a collinear design', () => {
    const X = [[1, 1], [2, 2.01], [3, 2.99], [4, 4.01], [5, 4.99]];
    const y = [2, 4, 6, 8, 10];
    const noRidge = solveOLS(X, y, { ridgeLambda: 0 });
    const ridge = solveOLS(X, y, { ridgeLambda: 5 });
    assert.equal(noRidge.singular, false);
    assert.equal(ridge.singular, false);
    const normNo = Math.hypot(...noRidge.beta);
    const normRidge = Math.hypot(...ridge.beta);
    assert.ok(normRidge < normNo, `ridge should shrink coefficient norm: ${normRidge} vs ${normNo}`);
  });

  test('a singular design becomes solvable with ridgeLambda > 0', () => {
    const X = [[1, 1], [2, 2], [3, 3]]; // perfectly collinear columns
    const y = [1, 2, 3];
    const noRidge = solveOLS(X, y, { ridgeLambda: 0 });
    assert.equal(noRidge.singular, true);
    const ridge = solveOLS(X, y, { ridgeLambda: 1 });
    assert.equal(ridge.singular, false);
    assert.ok(ridge.beta !== null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T-7 — spearman / rankTransform
// ═══════════════════════════════════════════════════════════════════════════

describe('T-7: spearman / rankTransform', () => {
  test('ties get averaged ranks', () => {
    assert.deepEqual(rankTransform([10, 10, 20]), [1.5, 1.5, 3]);
  });

  test('monotone increasing → spearman 1', () => {
    assert.ok(Math.abs(spearman([1, 2, 3, 4], [10, 20, 30, 40]) - 1) < 1e-9);
  });

  test('reversed → spearman -1', () => {
    assert.ok(Math.abs(spearman([1, 2, 3, 4], [40, 30, 20, 10]) - (-1)) < 1e-9);
  });

  test('n < 3 → null', () => {
    assert.equal(spearman([1, 2], [1, 2]), null);
  });

  test('constant series → null', () => {
    assert.equal(spearman([1, 1, 1, 1], [1, 2, 3, 4]), null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T-8 — de-standardization
// ═══════════════════════════════════════════════════════════════════════════

describe('T-8: de-standardization', () => {
  test('predictions are returned in PPG (raw) units', () => {
    // Known linear system: outcomePPG = 2*basePPG + 1, exactly, over training rows.
    const trainRows = Array.from({ length: 6 }, (_, i) => ({
      sleeperId: `p${i}`, predictorYear: 2020,
      features: { basePPG: i + 1 }, outcomePPG: 2 * (i + 1) + 1, mover: false,
    }));
    const evalRows = [{ sleeperId: 'e1', predictorYear: 2021, features: { basePPG: 10 }, outcomePPG: 21, mover: false }];

    const result = fitAndScoreFold(trainRows, evalRows, ['basePPG'], { ridgeLambda: 0 });
    assert.equal(result.n, 1);
    const pred = result.predictions[0].predicted;
    // Raw PPG scale: should land near 21 (2*10+1), not near a standardized z-value like 0 or 1.
    assert.ok(pred > 15 && pred < 27, `prediction should be on raw PPG scale (~21), got ${pred}`);
    assert.ok(result.mae < 3, `MAE should be small on a near-exact linear fit, got ${result.mae}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T-9 — verdict rules (table-driven)
// ═══════════════════════════════════════════════════════════════════════════

describe('T-9: decideVerdict ordered rules', () => {
  const sweepAllNegative = [0, 0.5, 1, 2, 4].map(lambda => ({ lambda, dMae: -0.1, dSpearman: 0.01 }));
  const sweepFlipped = [0, 0.5, 1, 2, 4].map(lambda => ({ lambda, dMae: lambda <= 1 ? -0.1 : 0.1, dSpearman: 0.01 }));

  test('DEGRADES: ΔMAE > 0 wins over everything else, even with favorable spearman/years/sweep', () => {
    const deltas = {
      maePooled: 0.001,
      maePerYear: [{ evalYear: 2022, dMae: -1 }, { evalYear: 2023, dMae: -1 }, { evalYear: 2024, dMae: -1 }],
      spearmanMean: 0.5,
    };
    assert.equal(decideVerdict(deltas, sweepAllNegative, 3.0), 'DEGRADES');
  });

  test('CLEARS: negative ΔMAE, non-negative ΔSpearman, ≥2/3 years improved, stable sweep sign', () => {
    const deltas = {
      maePooled: -0.5,
      maePerYear: [{ evalYear: 2022, dMae: -0.4 }, { evalYear: 2023, dMae: -0.6 }, { evalYear: 2024, dMae: 0.1 }],
      spearmanMean: 0.02,
    };
    assert.equal(decideVerdict(deltas, sweepAllNegative, 3.0), 'CLEARS');
  });

  test('NO-GAIN: |ΔMAE|/baselineMae below the 0.5% threshold', () => {
    const deltas = {
      maePooled: -0.01, // 0.01/3.0 = 0.33% < 0.5%
      maePerYear: [{ evalYear: 2022, dMae: -0.01 }, { evalYear: 2023, dMae: 0.01 }, { evalYear: 2024, dMae: -0.01 }],
      spearmanMean: -0.1, // fails CLEARS's spearman>=0 requirement
    };
    assert.equal(decideVerdict(deltas, sweepAllNegative, 3.0), 'NO-GAIN');
  });

  test('NO-GAIN threshold boundary: just above 0.5% is not NO-GAIN (falls to UNSTABLE)', () => {
    const deltas = {
      maePooled: -0.02, // 0.02/3.0 = 0.667% > 0.5%
      maePerYear: [{ evalYear: 2022, dMae: -0.02 }, { evalYear: 2023, dMae: 0.02 }, { evalYear: 2024, dMae: -0.02 }],
      spearmanMean: -0.1,
    };
    assert.equal(decideVerdict(deltas, sweepAllNegative, 3.0), 'UNSTABLE');
  });

  test('UNSTABLE: λ-sweep sign flip breaks CLEARS even when pooled/year/spearman criteria pass', () => {
    const deltas = {
      maePooled: -0.5,
      maePerYear: [{ evalYear: 2022, dMae: -0.4 }, { evalYear: 2023, dMae: -0.6 }, { evalYear: 2024, dMae: -0.3 }],
      spearmanMean: 0.02,
    };
    assert.equal(decideVerdict(deltas, sweepFlipped, 3.0), 'UNSTABLE');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T-F1..T-F6 — R2 flip gate (roadmap R2-REANCHOR, .claude/tasks/r2-flip-gate.md)
// ═══════════════════════════════════════════════════════════════════════════

function flipAdvstats(season, players) {
  return { schemaVersion: 1, season, generatedAt: '2026-01-01T00:00:00.000Z', rowCount: players.length, unmapped: 0,
    players: Object.fromEntries(players.map(p => [p.sleeperId, p])) };
}
function flipRoster(season, players) {
  return { schemaVersion: 1, season, generatedAt: '2026-01-01T00:00:00.000Z', rowCount: players.length,
    players: Object.fromEntries(players.map(p => [p.sleeperId, { team: p.team, position: p.position, status: 'ACT', fullName: p.sleeperId }])) };
}

describe('T-F2: both-mode parity + sole-divergence (mover fixture)', () => {
  // Y=2022 (anchor), Y-1=2021. m1 moves A(2021)→B(2022); a1/b1 are non-movers whose
  // Y-1 team-total denominators still shift by mode (§1(b)(ii) second-order drift).
  const TOTALS_2021 = {
    m1: totalsRec({ team: 'A', gamesPlayed: 16, stats: { rec_tgt: 30 } }),
    a1: totalsRec({ team: 'A', gamesPlayed: 16, stats: { rec_tgt: 50 } }),
    b1: totalsRec({ team: 'B', gamesPlayed: 16, stats: { rec_tgt: 40 } }),
    q1: totalsRec({ team: 'A', gamesPlayed: 16, stats: { pass_att: 500, pass_yd: 3800, pass_td: 25, pass_int: 9, rush_yd: 60 } }),
  };
  const TOTALS_2022 = {
    m1: totalsRec({ team: 'B', gamesPlayed: 16, stats: { rec_tgt: 45, rec_rz_tgt: 10, off_snp: 650, tm_off_snp: 1000 } }),
    a1: totalsRec({ team: 'A', gamesPlayed: 16, stats: { rec_tgt: 60, rec_rz_tgt: 22, off_snp: 700, tm_off_snp: 1000 } }),
    b1: totalsRec({ team: 'B', gamesPlayed: 16, stats: { rec_tgt: 55, rec_rz_tgt: 12, off_snp: 680, tm_off_snp: 1000 } }),
    q1: totalsRec({ team: 'A', gamesPlayed: 16, stats: { pass_att: 550, pass_yd: 4000, pass_td: 28, pass_int: 10, rush_yd: 150 } }),
  };
  const outcomes2022 = outcomesMap({
    m1: { gamesPlayed: 16, fantasyPoints: 160 }, a1: { gamesPlayed: 16, fantasyPoints: 180 },
    b1: { gamesPlayed: 16, fantasyPoints: 170 }, q1: { gamesPlayed: 16, fantasyPoints: 300 },
  });
  const outcomes2023 = outcomesMap({
    m1: { gamesPlayed: 16, fantasyPoints: 150 }, a1: { gamesPlayed: 16, fantasyPoints: 190 },
    b1: { gamesPlayed: 16, fantasyPoints: 175 }, q1: { gamesPlayed: 16, fantasyPoints: 310 },
  });
  const ADVSTATS_2022 = flipAdvstats(2022, [
    { sleeperId: 'm1', position: 'WR', team: 'B', airYardsShare: 0.2 },
    { sleeperId: 'a1', position: 'WR', team: 'A', airYardsShare: 0.25 },
    { sleeperId: 'b1', position: 'WR', team: 'B', airYardsShare: 0.18 },
  ]);
  const ROSTER_2022 = flipRoster(2022, [{ sleeperId: 'q1', team: 'A', position: 'QB' }]);

  function assemble(attribution) {
    const inputsByYear = {
      2021: { seasonTotals: TOTALS_2021, outcomes: new Map(), advstats: null, roster: null },
      2022: { seasonTotals: TOTALS_2022, outcomes: outcomes2022, advstats: ADVSTATS_2022, roster: ROSTER_2022 },
      2023: { seasonTotals: {}, outcomes: outcomes2023, advstats: null, roster: null },
    };
    return assemblePanelRows(inputsByYear, { fromYear: 2022, toYear: 2022, attribution, minPredictorGames: 6, minOutcomeGames: 6 });
  }

  const ct = assemble('current-team');
  const ps = assemble('per-season-team');

  test('row keys and drop counts are identical across modes', () => {
    const keyOf = (r) => `${r.sleeperId}|${r.predictorYear}|${r.position}`;
    assert.deepEqual(ct.rows.map(keyOf).sort(), ps.rows.map(keyOf).sort());
    const dropsOf = (cov) => cov.map(c => ({ position: c.position, year: c.year, surviving: c.surviving, drops: c.drops }));
    assert.deepEqual(dropsOf(ct.coverage.perPositionYear), dropsOf(ps.coverage.perPositionYear));
  });

  test('every feature/candidate/outcome is identical except shareTrend; QB rows are byte-equal', () => {
    const psByKey = new Map(ps.rows.map(r => [`${r.sleeperId}|${r.predictorYear}`, r]));
    for (const ctRow of ct.rows) {
      const psRow = psByKey.get(`${ctRow.sleeperId}|${ctRow.predictorYear}`);
      assert.ok(psRow, `${ctRow.sleeperId} row exists in both modes`);
      assert.equal(psRow.outcomePPG, ctRow.outcomePPG);
      assert.deepEqual(psRow.candidates, ctRow.candidates);
      for (const [key, val] of Object.entries(ctRow.features)) {
        if (key === 'shareTrend') continue;
        assert.equal(psRow.features[key], val, `${ctRow.sleeperId}.${key} should be mode-identical`);
      }
      if (ctRow.position === 'QB') {
        assert.deepEqual(psRow, ctRow, 'QB row byte-equal across modes (attribution-invariant)');
      }
    }
  });

  test('mover row (m1) shareTrend differs across modes', () => {
    const ctRow = ct.rows.find(r => r.sleeperId === 'm1');
    const psRow = ps.rows.find(r => r.sleeperId === 'm1');
    assert.notEqual(ctRow.features.shareTrend, psRow.features.shareTrend);
  });

  test('classifyAttributionCohort marks m1 historical-mover, equal to the committed mover flag', () => {
    const teamsByYear = { 2021: TOTALS_2021, 2022: TOTALS_2022 };
    const cohort = classifyAttributionCohort('m1', 2022, teamsByYear);
    assert.equal(cohort.segment, 'historical-mover');
    assert.equal(cohort.sensitive, true);
    assert.equal(cohort.segment === 'historical-mover', computeMover('m1', 2022, teamsByYear));
  });
});

describe('T-F3: neutralized-AND-multi-team overlap (historical-mover ∧ forwardMover)', () => {
  // Player 'mv': team A (Y-1=2021) → B (Y=2022) → C (Y+1=2023).
  const teamsByYear = {
    2021: { mv: { team: 'A' } },
    2022: { mv: { team: 'B' } },
    2023: { mv: { team: 'C' } },
  };

  test('segment is historical-mover and forwardMover is true', () => {
    const cohort = classifyAttributionCohort('mv', 2022, teamsByYear);
    assert.equal(cohort.segment, 'historical-mover');
    assert.equal(cohort.sensitive, true);
    assert.equal(cohort.forwardMover, true);
  });

  function emptyBaselinePosition() {
    return { perEvalYear: [], pooled: { n: 0, mae: null, spearmanMean: null }, movers: { n: 0, mae: null, spearmanByYear: {} }, describeFit: { coefficients: {} } };
  }
  function baselinePositionWith(pid, evalYear, predicted, actual) {
    const mae = Math.abs(predicted - actual);
    return {
      perEvalYear: [{ evalYear, n: 1, mae, spearman: null, coefficients: {}, predictions: [{ pid, predicted, actual, mover: true }] }],
      pooled: { n: 1, mae, spearmanMean: null },
      movers: { n: 1, mae, spearmanByYear: {} },
      describeFit: { coefficients: {} },
    };
  }
  function makeRow(shareTrend) {
    return {
      sleeperId: 'mv', position: 'WR', predictorYear: 2022, team: 'B', mover: true,
      features: { basePPG: 10, momentum: 0, gamesPlayedY: 16, consistencyCV: 0.2, shareTrend, snapShare: 0.7, rzOwnRate: 0.2, teamRzShare: 0.3, ypt: 8 },
      candidates: { shareLevel: 0.4, airYardsShare: 0.3 },
      outcomePPG: 12,
    };
  }
  function makePanel(shareTrend) {
    return {
      meta: { generatedAt: '2026-07-08T00:00:00.000Z', panelYears: { fromYear: 2022, toYear: 2022 }, basis: { type: 'in-basis' } },
      coverage: { perPositionYear: [], skippedYears: [], unattributedByYear: {} },
      rows: [makeRow(shareTrend)],
    };
  }

  test('shareTrend still differs across modes (no forward zeroing exists — §1.3); buildFlipReport buckets under sensitiveForwardMover, not sensitiveNotForwardMover', () => {
    const panels = { currentTeam: makePanel(0.05), perSeasonTeam: makePanel(0.09) };
    const baselines = {
      currentTeam: { WR: baselinePositionWith('mv', 2022, 12.5, 12), RB: emptyBaselinePosition(), TE: emptyBaselinePosition() },
      perSeasonTeam: { WR: baselinePositionWith('mv', 2022, 13.0, 12), RB: emptyBaselinePosition(), TE: emptyBaselinePosition() },
    };
    const cohortByKey = new Map([['mv|2022', classifyAttributionCohort('mv', 2022, teamsByYear)]]);
    const opts = { fromYear: 2022, toYear: 2022, minOutcomeGames: 6, ridgeLambda: 1, ridgeSweep: [0.5, 1, 2] };

    const flipReport = buildFlipReport({ panels, baselines, cohortByKey, opts });

    assert.equal(flipReport.perPosition.WR.cohorts.sensitiveForwardMover.n, 1);
    assert.equal(flipReport.perPosition.WR.cohorts.sensitiveNotForwardMover.n, 0);
  });
});

describe('T-F4: C4 discipline under per-season-team mode', () => {
  test('share(Y-1) under per-season-team is a ratio of summed components using the true Y-1 team', () => {
    const totalsByYear = {
      2021: {
        p1: totalsRec({ team: 'A', gamesPlayed: 16, stats: { rec_tgt: 12 } }),
        p2: totalsRec({ team: 'A', gamesPlayed: 16, stats: { rec_tgt: 8 } }),
      },
      2022: {
        p1: totalsRec({ team: 'B', gamesPlayed: 16, stats: { rec_tgt: 20 } }), // p1 moved to B in 2022
      },
    };
    const teamOf = teamKeyResolver('per-season-team', totalsByYear, 2022);
    const teamTotalsByYear = { 2021: buildTeamTotalsForSeason(totalsByYear[2021], 2021, teamOf) };

    assert.equal(teamTotalsByYear[2021].totals.A.recTgt, 20, 'team A 2021 recTgt = sum(12,8), not averaged');

    const shareYm1 = computeShare('p1', 'WR', 2021, totalsByYear, teamTotalsByYear, teamOf);
    assert.ok(Math.abs(shareYm1 - 12 / 20) < 1e-9, 'share(Y-1) = p1 rec_tgt / summed true-Y-1-team recTgt');
  });
});

describe('T-F5: asymmetric imputation (Y-1 record with null v3 team)', () => {
  const totalsByYear = {
    2021: { p1: totalsRec({ team: null, gamesPlayed: 16, stats: { rec_tgt: 20 } }) },
    2022: { p1: totalsRec({ team: 'X', gamesPlayed: 16, stats: { rec_tgt: 40, rec_rz_tgt: 10, off_snp: 700, tm_off_snp: 1000 } }) },
  };

  test('current-team resolves a real share(Y-1); per-season-team imputes it null; segment is ym1-team-null', () => {
    const teamOfCT = teamKeyResolver('current-team', totalsByYear, 2022);
    const teamTotalsCT = { 2021: buildTeamTotalsForSeason(totalsByYear[2021], 2021, teamOfCT) };
    const shareYm1CT = computeShare('p1', 'WR', 2021, totalsByYear, teamTotalsCT, teamOfCT);
    assert.ok(shareYm1CT != null, 'current-team resolves a non-null Y-1 share (anchor-year team stand-in)');

    const teamOfPS = teamKeyResolver('per-season-team', totalsByYear, 2022);
    const teamTotalsPS = { 2021: buildTeamTotalsForSeason(totalsByYear[2021], 2021, teamOfPS) };
    const shareYm1PS = computeShare('p1', 'WR', 2021, totalsByYear, teamTotalsPS, teamOfPS);
    assert.equal(shareYm1PS, null, 'per-season-team: v3 team null → computeShare returns null → shareTrend imputes to 0');

    const cohort = classifyAttributionCohort('p1', 2022, totalsByYear);
    assert.equal(cohort.segment, 'ym1-team-null');
    assert.equal(cohort.sensitive, true);
  });

  test('summarizeFeatureDelta counts the row under asymmetricImputationN', () => {
    const rowCT = { sleeperId: 'p1', predictorYear: 2022, features: { shareTrend: 0.05 } };
    const rowPS = { sleeperId: 'p1', predictorYear: 2022, features: { shareTrend: 0 } };
    const cohortByKey = new Map([['p1|2022', classifyAttributionCohort('p1', 2022, totalsByYear)]]);
    const summary = summarizeFeatureDelta([rowCT], [rowPS], cohortByKey);
    assert.equal(summary.asymmetricImputationN, 1);
    assert.equal(summary.perSegment['ym1-team-null'].n, 1);
  });
});

describe('T-F6: decideFlipVerdict ordered rules', () => {
  const goodPerPosition = [
    { position: 'WR', overallRelDMae: -0.01, dSpearman: 0.02 },
    { position: 'RB', overallRelDMae: -0.02, dSpearman: 0.01 },
    { position: 'TE', overallRelDMae: -0.01, dSpearman: 0.03 },
  ];

  test('UNDERPOWERED wins even when deltas degrade', () => {
    const perPosition = [{ position: 'WR', overallRelDMae: 0.5, dSpearman: -0.5 }];
    assert.equal(decideFlipVerdict({ sensitivePooledN: 59, perPosition, cohortPooledRelDMae: 0.5 }), 'UNDERPOWERED');
  });

  test('FLIP-CLEARS: n at threshold, no degradation anywhere', () => {
    assert.equal(decideFlipVerdict({ sensitivePooledN: 60, perPosition: goodPerPosition, cohortPooledRelDMae: -0.01 }), 'FLIP-CLEARS');
  });

  test('FLIP-DEGRADES: cohort degradation beyond +2% even when every overall position improves', () => {
    assert.equal(decideFlipVerdict({ sensitivePooledN: 100, perPosition: goodPerPosition, cohortPooledRelDMae: 0.021 }), 'FLIP-DEGRADES');
  });

  test('FLIP-DEGRADES: overall Spearman drop beyond -0.01 on any share position', () => {
    const perPosition = [
      { position: 'WR', overallRelDMae: -0.01, dSpearman: -0.011 },
      { position: 'RB', overallRelDMae: -0.01, dSpearman: 0.02 },
      { position: 'TE', overallRelDMae: -0.01, dSpearman: 0.02 },
    ];
    assert.equal(decideFlipVerdict({ sensitivePooledN: 100, perPosition, cohortPooledRelDMae: 0 }), 'FLIP-DEGRADES');
  });

  test('FLIP-DEGRADES: overall relΔMAE beyond +0.005 on any share position', () => {
    const perPosition = [
      { position: 'WR', overallRelDMae: 0.006, dSpearman: 0.02 },
      { position: 'RB', overallRelDMae: -0.01, dSpearman: 0.02 },
      { position: 'TE', overallRelDMae: -0.01, dSpearman: 0.02 },
    ];
    assert.equal(decideFlipVerdict({ sensitivePooledN: 100, perPosition, cohortPooledRelDMae: 0 }), 'FLIP-DEGRADES');
  });

  test('boundary: relΔMAE exactly at +0.005 and cohortRelDMae exactly at +0.02 → FLIP-CLEARS side (strict >)', () => {
    const perPosition = [
      { position: 'WR', overallRelDMae: 0.005, dSpearman: 0.02 },
      { position: 'RB', overallRelDMae: -0.01, dSpearman: 0.02 },
      { position: 'TE', overallRelDMae: -0.01, dSpearman: 0.02 },
    ];
    assert.equal(decideFlipVerdict({ sensitivePooledN: 100, perPosition, cohortPooledRelDMae: 0.02 }), 'FLIP-CLEARS');
  });

  test('boundary: dSpearman exactly at -0.01 → FLIP-CLEARS side (strict <)', () => {
    const perPosition = [
      { position: 'WR', overallRelDMae: 0, dSpearman: -0.01 },
      { position: 'RB', overallRelDMae: 0, dSpearman: 0.02 },
      { position: 'TE', overallRelDMae: 0, dSpearman: 0.02 },
    ];
    assert.equal(decideFlipVerdict({ sensitivePooledN: 100, perPosition, cohortPooledRelDMae: 0 }), 'FLIP-CLEARS');
  });
});
