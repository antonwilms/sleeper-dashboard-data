/**
 * test/backtest.test.mjs — Sections A–D: OLS machinery, cohort builder, quintiles,
 * synthetic D3 self-validation.
 *
 * NOTE on the real D3 validation: the empirical +0.20 RB / +0.17 WR/TE result
 * (2012–2025, controlling for overall-share/snap-share/own-rate) is checked by
 * `node bin/backtest.mjs --validate` AFTER the advstats backfill is on disk.
 * That is NOT a hermetic unit test. The synthetic planted-β test in Section D
 * below is the CI gate: it proves the machinery recovers a known partial β.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  standardize,
  solveOLS,
  standardizedRegression,
  quintileResponse,
  computeTeamTotals,
  buildCohortRows,
  DEFAULT_GATES,
  TEAM_DENOM_MIN,
} from '../lib/backtest.mjs';

import { normalizeMetric, normalizePosition } from '../scripts/backtest-run.mjs';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Production envelope shape (matches nflverse/advstats/<year>.json on disk)
function makeAdvstats(season, players) {
  return {
    schemaVersion: 1,
    season,
    generatedAt:   '2026-01-01T00:00:00.000Z',
    rowCount:      players.length,
    unmapped:      0,
    players:       Object.fromEntries(players.map(p => [p.sleeperId, p])),
  };
}

function makeTotals(entries) {
  return Object.fromEntries(entries.map(({ sleeperId, ...rest }) => [sleeperId, rest]));
}

function stdDev(arr) {
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  return Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / (arr.length - 1));
}

// ─── A. OLS recovers known coefficients ───────────────────────────────────────

describe('A: OLS', () => {
  test('A.1 noiseless: Y = 2·X1 + 0·X2, X1⊥X2 → β1≈1, β2≈0', () => {
    // X1 = -2..2 (linear), X2 orthogonal to X1
    const X1 = [-2, -1, 0, 1, 2];
    const X2 = [1, -2, 1, -2, 1];  // sum(X1*X2) = -2+2+0-2+2 = 0 ✓
    const Y  = X1.map(x => 2 * x);

    const zX1 = standardize(X1);
    const zX2 = standardize(X2);
    const zY  = standardize(Y);

    const X = X1.map((_, i) => [zX1.z[i], zX2.z[i]]);
    const { beta, singular } = solveOLS(X, zY.z);

    assert.equal(singular, false);
    assert.ok(Math.abs(beta[0] - 1) < 1e-6, `β1 should be 1, got ${beta[0]}`);
    assert.ok(Math.abs(beta[1]) < 1e-6,      `β2 should be 0, got ${beta[1]}`);
  });

  test('A.2 noise variant: Y = 3·X1 + noise(⊥X1,⊥X2), X2 adds nothing → β(X2)≈0', () => {
    // Use a 4-row Hadamard construction where X2⊥X1 and X2⊥Y (centered).
    // noise = [1,0,1,0] is ⊥ X1 in the centered sense.
    // Y = 3·X1 + noise → Y⊥X2 by construction.
    const X1 = [1, -1, -1,  1];  // Hadamard col 1
    const X2 = [1,  1, -1, -1];  // Hadamard col 2 (⊥ X1)
    const Y  = [4, -3, -2,  3];  // 3·X1 + [1,0,1,0]; centered Pearson r(X2,Y)=0

    // Verify: centered X2⊥X1 and centered X2⊥Y
    const m2 = X2.reduce((s, v) => s + v, 0) / 4;      // 0
    const mY = Y.reduce((s, v) => s + v, 0) / 4;       // 0.5
    const dotX2X1 = X2.reduce((s, v, i) => s + (v - m2) * X1[i], 0);   // 0
    const dotX2Y  = X2.reduce((s, v, i) => s + (v - m2) * (Y[i] - mY), 0); // 0
    assert.ok(Math.abs(dotX2X1) < 1e-9, `X2⊥X1: ${dotX2X1}`);
    assert.ok(Math.abs(dotX2Y)  < 1e-9, `X2⊥Y: ${dotX2Y}`);

    const zX1 = standardize(X1);
    const zX2 = standardize(X2);
    const zY  = standardize(Y);

    const X = X1.map((_, i) => [zX1.z[i], zX2.z[i]]);
    const { beta, singular } = solveOLS(X, zY.z);

    assert.equal(singular, false);
    assert.ok(Math.abs(beta[1]) < 1e-6, `β(X2) should be 0, got ${beta[1]}`);
    assert.ok(beta[0] > 0.5, `β(X1) should be high, got ${beta[0]}`);
  });

  test('A.3 collinearity: X2 = X1 → singular:true, beta:null, no NaN', () => {
    const X1 = [1, 2, 3, 4, 5];
    const X2 = X1.slice();  // perfectly collinear
    const Y  = X1.map(x => x + 1);

    const zX1 = standardize(X1);
    const zX2 = standardize(X2);
    const zY  = standardize(Y);

    const X = X1.map((_, i) => [zX1.z[i], zX2.z[i]]);
    const { beta, singular } = solveOLS(X, zY.z);

    assert.equal(singular, true);
    assert.equal(beta, null);
    // Ensure no NaN was produced
  });
});

// ─── B. buildCohortRows ───────────────────────────────────────────────────────

describe('B: buildCohortRows', () => {
  test('B.1 gate, missing-Y+1, and low-games filtering', () => {
    const Y = 2022, Y1 = 2023;
    const advY = makeAdvstats(Y, [
      // WR-A: sub-gate (rec_tgt=10 < 20) → dropped
      { sleeperId: 'wA', position: 'WR', team: 'KC', targetShare: 0.3, airYardsShare: 0.2, wopr: 0.6, racr: 1.5 },
      // WR-B: missing from Y+1 totals → dropped
      { sleeperId: 'wB', position: 'WR', team: 'KC', targetShare: 0.25, airYardsShare: 0.15, wopr: 0.5, racr: 1.3 },
      // WR-C: gamesPlayed Y+1 = 3 < 6 → dropped
      { sleeperId: 'wC', position: 'WR', team: 'KC', targetShare: 0.2, airYardsShare: 0.1, wopr: 0.4, racr: 1.2 },
      // WR-D: passes all gates
      { sleeperId: 'wD', position: 'WR', team: 'KC', targetShare: 0.15, airYardsShare: 0.08, wopr: 0.28, racr: 1.1 },
    ]);

    const totY = makeTotals([
      { sleeperId: 'wA', fantasyPoints: 100, gamesPlayed: 16, stats: { rec_tgt: 10, rec_rz_tgt: 2, off_snp: 500, tm_off_snp: 1000 } },
      { sleeperId: 'wB', fantasyPoints: 120, gamesPlayed: 16, stats: { rec_tgt: 80, rec_rz_tgt: 10, off_snp: 800, tm_off_snp: 1000 } },
      { sleeperId: 'wC', fantasyPoints: 90, gamesPlayed: 16, stats: { rec_tgt: 50, rec_rz_tgt: 6, off_snp: 600, tm_off_snp: 1000 } },
      { sleeperId: 'wD', fantasyPoints: 110, gamesPlayed: 16, stats: { rec_tgt: 60, rec_rz_tgt: 8, off_snp: 700, tm_off_snp: 1000 } },
    ]);
    const totY1 = makeTotals([
      // wB missing (no entry)
      { sleeperId: 'wC', fantasyPoints: 30, gamesPlayed: 3 },  // < 6 games → dropped
      { sleeperId: 'wD', fantasyPoints: 120, gamesPlayed: 12 },
    ]);

    const teamTotals = computeTeamTotals(advY.players, totY);
    const rows = buildCohortRows(advY, totY, totY1, { position: 'WR', minOutcomeGames: 6, teamTotals });

    assert.equal(rows.length, 1, 'only wD survives');
    const row = rows[0];
    assert.equal(row.sleeperId, 'wD');
    assert.ok(Math.abs(row.outcomePPG - 120 / 12) < 1e-9, 'outcomePPG = fantasyPoints/gamesPlayed');
    assert.equal(row.predictorYear, Y);

    // overallShare = rec_tgt(wD) / teamΣrec_tgt(all WRs in advY on KC)
    const kcRecTgt = teamTotals['KC'].recTgt;  // 10+80+50+60 = 200
    assert.ok(Math.abs(row.overallShare - 60 / kcRecTgt) < 1e-9, 'overallShare correct');

    // snapShare = off_snp / tm_off_snp
    assert.ok(Math.abs(row.snapShare - 700 / 1000) < 1e-9, 'snapShare correct');

    // rzOwnRate = rec_rz_tgt / rec_tgt
    assert.ok(Math.abs(row.rzOwnRate - 8 / 60) < 1e-9, 'rzOwnRate correct');
  });

  test('B.2 team totals: two WRs on KC → recTgt sums correctly; low recRzTgt → teamRzShare null', () => {
    const Y = 2022;
    const advY = makeAdvstats(Y, [
      { sleeperId: 's1', position: 'WR', team: 'KC', targetShare: 0.4, airYardsShare: 0.3, wopr: 0.8,  racr: 1.5 },
      { sleeperId: 's2', position: 'WR', team: 'KC', targetShare: 0.2, airYardsShare: 0.15, wopr: 0.45, racr: 1.2 },
      // TM2: player passes target gate but team's total rec_rz_tgt is tiny → teamRzShare null
      { sleeperId: 's3', position: 'WR', team: 'TM2', targetShare: 0.5, airYardsShare: 0.3, wopr: 0.96, racr: 1.3 },
    ]);
    const totY = makeTotals([
      { sleeperId: 's1', fantasyPoints: 0, gamesPlayed: 16, stats: { rec_tgt: 100, rec_rz_tgt: 15, off_snp: 800, tm_off_snp: 1000 } },
      { sleeperId: 's2', fantasyPoints: 0, gamesPlayed: 16, stats: { rec_tgt: 50,  rec_rz_tgt: 8,  off_snp: 700, tm_off_snp: 1000 } },
      // TM2: rec_tgt=50 passes opportunity gate; rec_rz_tgt=2 → team recRzTgt=2 < TEAM_DENOM_MIN → teamRzShare null
      { sleeperId: 's3', fantasyPoints: 0, gamesPlayed: 16, stats: { rec_tgt: 50,  rec_rz_tgt: 2,  off_snp: 600, tm_off_snp: 1000 } },
    ]);

    const teamTotals = computeTeamTotals(advY.players, totY);
    assert.equal(teamTotals['KC'].recTgt, 150, 'KC.recTgt = 100+50');
    assert.equal(teamTotals['TM2'].recTgt, 50,  'TM2.recTgt = 50');
    assert.equal(teamTotals['TM2'].recRzTgt, 2,  'TM2.recRzTgt = 2');

    const totY1 = makeTotals([
      { sleeperId: 's1', fantasyPoints: 200, gamesPlayed: 16 },
      { sleeperId: 's2', fantasyPoints: 100, gamesPlayed: 16 },
      { sleeperId: 's3', fantasyPoints: 50,  gamesPlayed: 10 },
    ]);
    const rows = buildCohortRows(advY, totY, totY1, { position: 'WR', minOutcomeGames: 6, teamTotals });

    const r1 = rows.find(r => r.sleeperId === 's1');
    const r2 = rows.find(r => r.sleeperId === 's2');
    const r3 = rows.find(r => r.sleeperId === 's3');

    assert.ok(r1, 's1 present');
    assert.ok(r2, 's2 present');
    assert.ok(r3, 's3 present (rec_tgt=50 passes gate)');

    // KC overallShare
    assert.ok(Math.abs(r1.overallShare - 100 / 150) < 1e-9, 's1 overallShare = 100/150');
    assert.ok(Math.abs(r2.overallShare - 50 / 150)  < 1e-9, 's2 overallShare = 50/150');

    // TM2 overallShare (team recTgt=50 >= TEAM_DENOM_MIN → computed)
    assert.ok(Math.abs(r3.overallShare - 50 / 50)   < 1e-9, 's3 overallShare = 1.0');

    // TM2 teamRzShare: team recRzTgt=2 < TEAM_DENOM_MIN (20) → null
    assert.equal(r3.teamRzShare, null, 's3 teamRzShare null (team recRzTgt=2 < 20)');

    // KC teamRzShare: team recRzTgt=15+8=23 >= 20 → computed
    assert.ok(r1.teamRzShare != null, 'KC s1 teamRzShare computed');
    assert.ok(Math.abs(r1.teamRzShare - 15 / 23) < 1e-9, 's1 teamRzShare = 15/23');
  });

  test('B.3 snapShare null for pre-2020 (off_snp=0)', () => {
    const Y = 2019;
    const advY = makeAdvstats(Y, [
      { sleeperId: 'p1', position: 'WR', team: 'DAL', targetShare: 0.3, airYardsShare: 0.2, wopr: 0.6, racr: 1.4 },
    ]);
    const totY = makeTotals([
      { sleeperId: 'p1', fantasyPoints: 0, gamesPlayed: 16, stats: { rec_tgt: 80, rec_rz_tgt: 10, off_snp: 0, tm_off_snp: 1000 } },
    ]);
    const totY1 = makeTotals([
      { sleeperId: 'p1', fantasyPoints: 150, gamesPlayed: 14 },
    ]);
    const teamTotals = computeTeamTotals(advY.players, totY);
    const rows = buildCohortRows(advY, totY, totY1, { position: 'WR', minOutcomeGames: 6, teamTotals });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].snapShare, null, 'snapShare null when off_snp=0 (pre-2020)');
  });
});

// ─── C. quintileResponse ─────────────────────────────────────────────────────

describe('C: quintileResponse', () => {
  test('C.1 10 ascending values → 5 bins of 2, monotonic', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      x: i + 1,
      y: (i + 1) * 2,
    }));
    const { bins, monotonic } = quintileResponse(rows, 'x', 'y', 5);
    assert.equal(bins.length, 5);
    assert.equal(bins[0].n, 2);
    assert.equal(bins[4].n, 2);
    assert.ok(monotonic, 'monotonic ascending');
    // Each bin's mean predictor
    assert.ok(Math.abs(bins[0].meanPredictor - 1.5) < 1e-9);
    assert.ok(Math.abs(bins[4].meanPredictor - 9.5) < 1e-9);
    // Each bin's mean outcome
    assert.ok(Math.abs(bins[0].meanOutcome - 3) < 1e-9);
    assert.ok(Math.abs(bins[4].meanOutcome - 19) < 1e-9);
  });

  test('C.2 non-monotonic outcome → monotonic:false', () => {
    const rows = [
      { x: 1, y: 5 },
      { x: 2, y: 6 },
      { x: 3, y: 4 },  // dip in 3rd quintile
      { x: 4, y: 7 },
      { x: 5, y: 8 },
    ];
    const { monotonic } = quintileResponse(rows, 'x', 'y', 5);
    assert.equal(monotonic, false);
  });
});

// ─── E. normalizeMetric / normalizePosition ───────────────────────────────────

describe('E: normalizeMetric / normalizePosition', () => {
  test('E.1 snake_case aliases resolve to camelCase', () => {
    assert.equal(normalizeMetric('target_share'),    'targetShare');
    assert.equal(normalizeMetric('air_yards_share'), 'airYardsShare');
  });

  test('E.2 camelCase passes through unchanged', () => {
    assert.equal(normalizeMetric('targetShare'),    'targetShare');
    assert.equal(normalizeMetric('airYardsShare'), 'airYardsShare');
  });

  test('E.3 wopr and racr unchanged', () => {
    assert.equal(normalizeMetric('wopr'), 'wopr');
    assert.equal(normalizeMetric('racr'), 'racr');
  });

  test('E.4 unknown metric throws', () => {
    assert.throws(() => normalizeMetric('yards'), /unknown --metric/);
    assert.throws(() => normalizeMetric(''),      /unknown --metric/);
  });

  test('E.5 normalizePosition: known positions return single-element array', () => {
    assert.deepEqual(normalizePosition('WR'), ['WR']);
    assert.deepEqual(normalizePosition('TE'), ['TE']);
    assert.deepEqual(normalizePosition('RB'), ['RB']);
  });

  test('E.6 normalizePosition: all returns all three positions', () => {
    const pos = normalizePosition('all');
    assert.deepEqual(pos.sort(), ['RB', 'TE', 'WR']);
  });

  test('E.7 normalizePosition: unknown throws', () => {
    assert.throws(() => normalizePosition('QB'),   /unknown --position/);
    assert.throws(() => normalizePosition('flex'), /unknown --position/);
  });
});

// ─── F. buildCohortRows reads .season (not .year) for predictorYear ──────────

describe('F: predictorYear from season envelope', () => {
  test('F.1 every row.predictorYear equals the advstats .season field', () => {
    const SEASON = 2021;
    const advY = makeAdvstats(SEASON, [
      { sleeperId: 'p1', position: 'WR', team: 'KC',
        targetShare: 0.3, airYardsShare: 0.2, wopr: 0.59, racr: 1.2 },
      { sleeperId: 'p2', position: 'WR', team: 'KC',
        targetShare: 0.2, airYardsShare: 0.15, wopr: 0.405, racr: 1.1 },
    ]);

    const totY = {
      p1: { stats: { rec_tgt: 80, rec_rz_tgt: 12, off_snp: 800, tm_off_snp: 1000 }, gamesPlayed: 16, fantasyPoints: 200 },
      p2: { stats: { rec_tgt: 60, rec_rz_tgt: 8, off_snp: 700, tm_off_snp: 1000 },  gamesPlayed: 16, fantasyPoints: 150 },
    };
    const totY1 = {
      p1: { gamesPlayed: 14, fantasyPoints: 180 },
      p2: { gamesPlayed: 12, fantasyPoints: 130 },
    };

    const teamTotals = computeTeamTotals(advY.players, totY);
    const rows = buildCohortRows(advY, totY, totY1, { position: 'WR', minOutcomeGames: 6, teamTotals });

    assert.ok(rows.length > 0, 'rows built');
    for (const row of rows) {
      assert.equal(row.predictorYear, SEASON,
        `predictorYear should be ${SEASON} (from .season), got ${row.predictorYear}`);
    }
  });
});

// ─── D. Synthetic D3 self-validation (planted β, gates CI) ───────────────────

describe('D: Synthetic D3 planted-β self-validation', () => {
  test('D.1 planted teamRzShare β≈0.18 recovered within ±0.03, rzOwnRate β<0', () => {
    // Build N rows: 4 predictors (permutations of 0/N...(N-1)/N), minimal mutual correlation.
    // Plant outcomePPG as a linear combo of z-scored predictors (exact fit → OLS recovers exactly).
    const N = 100;
    const base = Array.from({ length: N }, (_, i) => i);

    // Coprime strides give permutations of 0..N-1 when N=100 (2²×5²); strides coprime to 100: 1,3,7,9,11...
    const raw = {
      teamRzShare:  base.map(i => i / N),
      overallShare: base.map(i => ((i * 3)  % N) / N),
      snapShare:    base.map(i => ((i * 7)  % N) / N),
      rzOwnRate:    base.map(i => ((i * 11) % N) / N),
    };

    // Standardize each predictor using the same function under test
    function colZscore(vals) {
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      const sd   = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (vals.length - 1));
      return sd > 0 ? vals.map(v => (v - mean) / sd) : vals.map(() => 0);
    }

    const zRZ  = colZscore(raw.teamRzShare);
    const zOv  = colZscore(raw.overallShare);
    const zSn  = colZscore(raw.snapShare);
    const zOr  = colZscore(raw.rzOwnRate);

    // Plant: outcomePPG = exact linear combo of z-scores.
    // Planted β: teamRzShare=0.18, overallShare=0.30, snapShare=0.9315 (noise), rzOwnRate=-0.10.
    // Chosen so 0.18²+0.30²+0.9315²+0.10² ≈ 1.0, making sd(outcomePPG)≈1 (near-unit variance).
    // OLS on exact linear system recovers planted betas regardless of cross-correlations.
    const BETA_TRZ = 0.18, BETA_OV = 0.30, BETA_SN = 0.9315, BETA_OR = -0.10;

    const rows = base.map(i => ({
      teamRzShare:  raw.teamRzShare[i],
      overallShare: raw.overallShare[i],
      snapShare:    raw.snapShare[i],
      rzOwnRate:    raw.rzOwnRate[i],
      outcomePPG:   BETA_TRZ * zRZ[i] + BETA_OV * zOv[i] + BETA_SN * zSn[i] + BETA_OR * zOr[i],
    }));

    const result = standardizedRegression(rows, {
      predictor: 'teamRzShare',
      controls:  ['overallShare', 'snapShare', 'rzOwnRate'],
      outcome:   'outcomePPG',
    });

    assert.equal(result.singular, false, 'not singular');
    assert.ok(result.n > 0, 'n > 0');

    const beta = result.beta;
    assert.ok(beta !== null, 'beta not null');
    assert.ok(
      Math.abs(beta - BETA_TRZ) < 0.03,
      `β(teamRzShare) should be ≈${BETA_TRZ}, got ${beta.toFixed(4)}`
    );

    const orBeta = result.controlBetas.rzOwnRate;
    assert.ok(orBeta < 0, `rzOwnRate β should be negative (planted -0.10), got ${orBeta}`);
  });
});
