import { pearson } from '../lib/grade.mjs';

export const D3_TARGETS         = { RB: 0.20, WRTE: 0.17 };
export const D3_TOLERANCE       = { RB: 0.08, WRTE: 0.06 };  // informational; not used for PASS
export const D3_VALIDATE_CONTROLS = ['rzOwnRate', 'snapShare'];
export const TEAM_DENOM_MIN = 20;
export const DEFAULT_GATES  = { RB: { rush_att: 30 }, WR: { rec_tgt: 20 }, TE: { rec_tgt: 20 } };

// Whole-team aggregate pseudo-rows (`TEAM_<abbr>`) carry full team stat keys and
// their own `team` field; unfiltered they double every team denominator. Mirror of
// the app's src/utils/teamContext.js isTeamAggregateId (id-prefix filter, NOT a
// team-code check — 'TEAM_IND' → true, '6813' → false, 'IND' DEF row → false).
export function isTeamAggregateId(id) {
  return typeof id === 'string' && id.startsWith('TEAM_');
}

// z-score a column. Uses sample stdev (n−1). sd===0 → degenerate:true, z:zeros.
export function standardize(values) {
  const n = values.length;
  if (n === 0) return { z: [], mean: 0, sd: 0, degenerate: true };
  const mean = values.reduce((s, v) => s + v, 0) / n;
  if (n === 1) return { z: [0], mean, sd: 0, degenerate: true };
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  const sd = Math.sqrt(variance);
  if (sd === 0) return { z: values.map(() => 0), mean, sd: 0, degenerate: true };
  return { z: values.map(v => (v - mean) / sd), mean, sd, degenerate: false };
}

// Solve OLS without intercept via Gauss-Jordan inversion.
// X: n×k (already standardized), y: n (standardized).
// Singular/near-singular → { beta:null, rSquared:null, singular:true }. No NaN propagation.
export function solveOLS(X, y, { ridgeLambda = 0 } = {}) {
  const n = X.length;
  if (n === 0) return { beta: null, rSquared: null, singular: true };
  const k = X[0].length;
  if (k === 0) return { beta: [], rSquared: null, singular: false };

  // Build Gram matrix G = XᵀX and cross-vector b = Xᵀy
  const G = Array.from({ length: k }, () => new Array(k).fill(0));
  const b = new Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < k; j++) {
      b[j] += X[i][j] * y[i];
      for (let l = 0; l < k; l++) G[j][l] += X[i][j] * X[i][l];
    }
  }
  if (ridgeLambda > 0) { for (let j = 0; j < k; j++) G[j][j] += ridgeLambda; }

  // Gauss-Jordan on augmented [G | I]
  const aug = G.map((row, i) => {
    const id = new Array(k).fill(0);
    id[i] = 1;
    return [...row, ...id];
  });

  for (let col = 0; col < k; col++) {
    // Partial pivoting
    let maxRow = col, maxVal = Math.abs(aug[col][col]);
    for (let row = col + 1; row < k; row++) {
      const v = Math.abs(aug[row][col]);
      if (v > maxVal) { maxVal = v; maxRow = row; }
    }
    if (maxVal < 1e-10) return { beta: null, rSquared: null, singular: true };
    if (maxRow !== col) [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    const piv = aug[col][col];
    for (let j = 0; j < 2 * k; j++) aug[col][j] /= piv;

    for (let row = 0; row < k; row++) {
      if (row === col) continue;
      const f = aug[row][col];
      if (f === 0) continue;
      for (let j = 0; j < 2 * k; j++) aug[row][j] -= f * aug[col][j];
    }
  }

  // Extract G⁻¹ and compute β = G⁻¹ b
  const Ginv = aug.map(row => row.slice(k));
  const beta = Ginv.map(row => row.reduce((s, v, j) => s + v * b[j], 0));

  // R² = 1 - SSres/SStot
  const yMean = y.reduce((s, v) => s + v, 0) / n;
  const SStot = y.reduce((s, v) => s + (v - yMean) ** 2, 0);
  if (SStot < 1e-14) return { beta, rSquared: null, singular: false };
  const SSres = y.reduce((s, v, i) => {
    const yhat = beta.reduce((s2, bj, j) => s2 + bj * X[i][j], 0);
    return s + (v - yhat) ** 2;
  }, 0);
  const rSquared = Math.max(0, 1 - SSres / SStot);

  return { beta, rSquared, singular: false };
}

// Build standardized design from rows, listwise-delete, fit, and diagnose.
export function standardizedRegression(rows, { predictor, controls, outcome }) {
  const valid = rows.filter(row => {
    if (row[predictor] == null || !Number.isFinite(row[predictor])) return false;
    if (row[outcome] == null || !Number.isFinite(row[outcome])) return false;
    for (const c of controls) {
      if (row[c] == null || !Number.isFinite(row[c])) return false;
    }
    return true;
  });

  const n = valid.length;
  const k = 1 + controls.length;

  const emptyResult = () => ({
    n,
    beta: null,
    controlBetas: Object.fromEntries(controls.map(c => [c, null])),
    rSquared: null,
    rawPearson: null,
    collinearity: Object.assign({ flagged: false }, Object.fromEntries(controls.map(c => [c, null]))),
    singular: true,
  });

  if (n < k + 1) return emptyResult();

  const predVals = valid.map(r => r[predictor]);
  const outcVals = valid.map(r => r[outcome]);
  const ctrlVals = controls.map(c => valid.map(r => r[c]));

  const zPred  = standardize(predVals);
  const zOutc  = standardize(outcVals);
  const zCtrls = controls.map((_, i) => standardize(ctrlVals[i]));

  const rawPearson = pearson(predVals, outcVals);

  // Pairwise correlation of predictor vs each control
  const collinearity = { flagged: false };
  for (let i = 0; i < controls.length; i++) {
    const r = pearson(predVals, ctrlVals[i]);
    collinearity[controls[i]] = r;
    if (r != null && Math.abs(r) > 0.8) collinearity.flagged = true;
  }

  // Design matrix: [predictor, ...controls] all z-scored
  const X = valid.map((_, i) => [zPred.z[i], ...zCtrls.map(zc => zc.z[i])]);
  const y = zOutc.z;

  const { beta, rSquared, singular } = solveOLS(X, y);

  if (singular || beta === null) {
    return { n, beta: null, controlBetas: Object.fromEntries(controls.map(c => [c, null])), rSquared, rawPearson, collinearity, singular: true };
  }

  const controlBetas = {};
  for (let i = 0; i < controls.length; i++) controlBetas[controls[i]] = beta[i + 1];

  return { n, beta: beta[0], controlBetas, rSquared, rawPearson, collinearity, singular: false };
}

// Quintile response of outcome across predictor quintiles.
export function quintileResponse(rows, predictor, outcome, bins = 5) {
  const valid = rows
    .filter(r =>
      r[predictor] != null && Number.isFinite(r[predictor]) &&
      r[outcome]   != null && Number.isFinite(r[outcome])
    )
    .slice()
    .sort((a, b) => a[predictor] - b[predictor]);

  const n = valid.length;
  if (n === 0) return { bins: [], monotonic: true };

  const binWidth = Math.ceil(n / bins);
  const result = [];
  for (let q = 0; q < bins; q++) {
    const start = q * binWidth;
    if (start >= n) break;
    const chunk = valid.slice(start, Math.min(start + binWidth, n));
    result.push({
      q: q + 1,
      n: chunk.length,
      meanPredictor: chunk.reduce((s, r) => s + r[predictor], 0) / chunk.length,
      meanOutcome:   chunk.reduce((s, r) => s + r[outcome], 0) / chunk.length,
    });
  }

  let monotonic = true;
  for (let i = 1; i < result.length; i++) {
    if (result[i].meanOutcome < result[i - 1].meanOutcome) { monotonic = false; break; }
  }

  return { bins: result, monotonic };
}

// Average-rank transform (ties share the mean rank). Used by spearman().
// Note: scripts/update-ktc.mjs has a private rankTransform sibling (guard-critical, left untouched) — this duplication is accepted.
export function rankTransform(values) {
  const n = values.length;
  const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b]);
  const ranks = new Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && values[order[j + 1]] === values[order[i]]) j++;
    const avgRank = (i + j) / 2 + 1; // 1-based average rank over the tie group
    for (let m = i; m <= j; m++) ranks[order[m]] = avgRank;
    i = j + 1;
  }
  return ranks;
}

// Spearman rank correlation. Reuses pearson (lib/grade.mjs, already imported line 1).
// Returns null when n < 3 or either side is constant.
export function spearman(xs, ys) {
  if (!xs || !ys || xs.length !== ys.length || xs.length < 3) return null;
  return pearson(rankTransform(xs), rankTransform(ys));
}

// Team totals grouped by advstats `team`, summed over WR/TE/RB cohort.
export function computeTeamTotals(advstatsPlayers, totalsY) {
  const teams = {};
  for (const [sleeperId, player] of Object.entries(advstatsPlayers)) {
    const { team } = player;
    if (!team) continue;
    const rec = totalsY[sleeperId];
    if (!rec || !rec.stats) continue;
    const s = rec.stats;
    if (!teams[team]) teams[team] = { recTgt: 0, rushAtt: 0, recRzTgt: 0, rushRzAtt: 0 };
    teams[team].recTgt    += s.rec_tgt     || 0;
    teams[team].rushAtt   += s.rush_att    || 0;
    teams[team].recRzTgt  += s.rec_rz_tgt  || 0;
    teams[team].rushRzAtt += s.rush_rz_att || 0;
  }
  return teams;
}

// Pure cohort builder for one Y→Y+1 pair and one position.
// Adds predictorYear to each row for downstream year-coverage tracking.
export function buildCohortRows(advstatsY, totalsY, totalsY1, {
  position,
  minOutcomeGames = 6,
  gates = DEFAULT_GATES,
  teamTotals,
}) {
  const posGates = gates[position] || {};
  const rows = [];

  for (const [sleeperId, player] of Object.entries(advstatsY.players)) {
    if (player.position !== position) continue;
    const { team, targetShare, airYardsShare, wopr, racr } = player;

    const tY = totalsY[sleeperId];
    if (!tY || !tY.stats) continue;

    const tY1 = totalsY1[sleeperId];
    if (!tY1 || !tY1.gamesPlayed || tY1.gamesPlayed < minOutcomeGames) continue;

    const outcomePPG = tY1.fantasyPoints / tY1.gamesPlayed;
    if (!Number.isFinite(outcomePPG)) continue;

    const s = tY.stats;

    // Predictor-season opportunity gate
    if (posGates.rec_tgt  !== undefined && (s.rec_tgt  || 0) < posGates.rec_tgt)  continue;
    if (posGates.rush_att !== undefined && (s.rush_att || 0) < posGates.rush_att) continue;

    const tt = teamTotals[team] || {};

    // overallShare (position-specific denominator; null if team total < TEAM_DENOM_MIN)
    let overallShare = null;
    if (position === 'RB') {
      const d = tt.rushAtt || 0;
      if (d >= TEAM_DENOM_MIN) overallShare = (s.rush_att || 0) / d;
    } else {
      const d = tt.recTgt || 0;
      if (d >= TEAM_DENOM_MIN) overallShare = (s.rec_tgt || 0) / d;
    }

    // snapShare — null for pre-2020 seasons (off_snp=0 means not tracked)
    const offSnp   = s.off_snp;
    const tmOffSnp = s.tm_off_snp;
    const snapShare = (offSnp != null && offSnp > 0 && tmOffSnp != null && tmOffSnp > 0)
      ? offSnp / tmOffSnp
      : null;

    // rzOwnRate (RZ-target or RZ-rush share of own volume)
    let rzOwnRate = null;
    if (position === 'RB') {
      const d = s.rush_att || 0;
      if (d > 0) rzOwnRate = (s.rush_rz_att || 0) / d;
    } else {
      const d = s.rec_tgt || 0;
      if (d > 0) rzOwnRate = (s.rec_rz_tgt || 0) / d;
    }

    // teamRzShare (D3 self-validation predictor)
    let teamRzShare = null;
    if (position === 'RB') {
      const d = tt.rushRzAtt || 0;
      if (d >= TEAM_DENOM_MIN) teamRzShare = (s.rush_rz_att || 0) / d;
    } else {
      const d = tt.recRzTgt || 0;
      if (d >= TEAM_DENOM_MIN) teamRzShare = (s.rec_rz_tgt || 0) / d;
    }

    rows.push({
      sleeperId,
      position,
      team,
      targetShare,
      airYardsShare,
      wopr,
      racr,
      overallShare,
      snapShare,
      rzOwnRate,
      teamRzShare,
      outcomePPG,
      predictorYear: advstatsY.season ?? advstatsY.year,
    });
  }

  return rows;
}
