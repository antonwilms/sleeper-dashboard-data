/**
 * lib/panel.mjs — E-0a grading-panel machinery. Pure: no I/O, no console.
 *
 * Feature builders, the attribution-mode seam (teamKeyResolver — see CLAUDE.md
 * Cross-repo / roadmap R2-REANCHOR), season-blocked forward-chaining CV, ridge
 * fit/eval, and candidate verdict rules. Consumed by scripts/panel-run.mjs,
 * which supplies file-backed inputs; this module never reads a file.
 */

import { DEFAULT_GATES, TEAM_DENOM_MIN, solveOLS, spearman } from './backtest.mjs';

// ─── Constants ────────────────────────────────────────────────────────────────

export const PANEL_DEFAULTS = {
  fromYear: 2020, toYear: 2024,          // predictor years; outcomes Y+1 (flip fromYear→2013 post-R1-SNAPS)
  minOutcomeGames: 6, minPredictorGames: 6,
  minTrainSeasons: 2,
  ridgeLambda: 1.0, ridgeSweep: [0, 0.5, 1, 2, 4],
};

export const PANEL_POSITIONS = ['QB', 'RB', 'WR', 'TE'];

// RB/WR/TE inherited verbatim from lib/backtest.mjs DEFAULT_GATES; QB is new (panel-only).
export const PANEL_GATES = { ...DEFAULT_GATES, QB: { pass_att: 100 } };

export const ATTRIBUTION_MODES = ['current-team', 'per-season-team'];

const SHARE_FAMILY = ['basePPG', 'momentum', 'gamesPlayedY', 'consistencyCV', 'shareTrend', 'snapShare', 'rzOwnRate', 'teamRzShare', 'ypt'];

export const BASELINE_FEATURES = {
  QB: ['basePPG', 'momentum', 'gamesPlayedY', 'consistencyCV', 'ypa', 'tdRate', 'intRate', 'rushYd'],
  RB: SHARE_FAMILY.slice(),
  WR: SHARE_FAMILY.slice(),
  TE: SHARE_FAMILY.slice(),
};

export const CANDIDATES = {
  airYardsShare: { positions: ['WR', 'TE'], diagnosticPositions: ['RB'], source: 'advstats' },
  shareLevel:    { positions: ['WR', 'TE', 'RB'], diagnosticPositions: [], source: 'derived' },
};

const RECENCY_WEIGHTS = { 0: 0.5, 1: 0.3, 2: 0.2 }; // offset from anchor year Y

// ─── THE R2 SEAM (roadmap R2-REANCHOR) ─────────────────────────────────────────
// Sole team-resolution point for share/team features. Internal call sites pass
// (pid, season); current-team ignores season (the panel's stand-in for the app's
// "current team", applied uniformly to every season of a player-season row —
// see the plan's §2 attribution-mode note for why this reproduces the app's
// mis-attribution mechanism on purpose). R2 adds the per-season-team branch:
// (pid, season) => totalsByYear[season]?.[pid]?.team ?? null — resolver-only change.
export function teamKeyResolver(mode, totalsByYear, anchorYear) {
  if (mode === 'current-team') {
    return (pid, _season) => totalsByYear[anchorYear]?.[pid]?.team ?? null;
  }
  if (mode === 'per-season-team') {
    throw new Error('per-season-team mode is reserved for the R2-REANCHOR gate slice');
  }
  throw new Error(`[panel] unknown attribution mode '${mode}'`);
}

// Sums rec_tgt/rush_att/rec_rz_tgt/rush_rz_att over every record in totalsSeason,
// grouped by teamOf(pid, season). Records where teamOf returns null are skipped
// and counted in `unattributed` (this is how the app's retired-player undercount
// reproduces under current-team mode — see plan §2.3).
export function buildTeamTotalsForSeason(totalsSeason, season, teamOf) {
  const totals = {};
  let unattributed = 0;
  for (const [pid, rec] of Object.entries(totalsSeason)) {
    const team = teamOf(pid, season);
    if (team == null) { unattributed++; continue; }
    if (!totals[team]) totals[team] = { recTgt: 0, rushAtt: 0, recRzTgt: 0, rushRzAtt: 0 };
    const s = rec?.stats ?? {};
    totals[team].recTgt    += s.rec_tgt     || 0;
    totals[team].rushAtt   += s.rush_att    || 0;
    totals[team].recRzTgt  += s.rec_rz_tgt  || 0;
    totals[team].rushRzAtt += s.rush_rz_att || 0;
  }
  return { totals, unattributed };
}

// ppg/gamesPlayed lookup wrapper over a prebuilt outcome map (Map<pid, OutcomeRecord>
// from buildInBasisOutcomes/buildHalfPprOutcomes — scripts/grade-snapshot.mjs shape).
export function computeSeasonPoints(pid, outcomesForYear) {
  if (!outcomesForYear) return { ppg: null, gamesPlayed: 0 };
  const rec = outcomesForYear.get(String(pid));
  if (!rec) return { ppg: null, gamesPlayed: 0 };
  return { ppg: rec.actualPPG, gamesPlayed: rec.actualGames ?? 0 };
}

// ─── Position resolution (advstats WR/TE/RB → roster QB fallback; FB excluded) ─

export function resolvePosition(pid, advstatsY, rosterY) {
  const advPos = advstatsY?.players?.[pid]?.position;
  if (advPos) return PANEL_POSITIONS.includes(advPos) ? advPos : null;
  const rosterPos = rosterY?.players?.[pid]?.position;
  if (rosterPos) return PANEL_POSITIONS.includes(rosterPos) ? rosterPos : null;
  return null;
}

// ─── Feature builders (§2.2) ───────────────────────────────────────────────────

export function computeBasePPG(pid, anchorYear, ppgByYear, minGames) {
  let weightedSum = 0, totalWeight = 0;
  for (const offset of [0, 1, 2]) {
    const { ppg, gamesPlayed } = computeSeasonPoints(pid, ppgByYear[anchorYear - offset]);
    if (ppg != null && gamesPlayed >= minGames) {
      weightedSum += RECENCY_WEIGHTS[offset] * ppg;
      totalWeight += RECENCY_WEIGHTS[offset];
    }
  }
  return totalWeight > 0 ? weightedSum / totalWeight : null;
}

export function computeMomentum(pid, anchorYear, ppgByYear, minGames) {
  const cur = computeSeasonPoints(pid, ppgByYear[anchorYear]);
  const prev = computeSeasonPoints(pid, ppgByYear[anchorYear - 1]);
  if (prev.ppg != null && prev.gamesPlayed >= minGames && cur.ppg != null) {
    return cur.ppg - prev.ppg;
  }
  return 0;
}

// Population SD ÷ mean of season-Y weeklyPoints, played weeks only. weeklyPoints
// (nfl/season-totals v3) is a 1-based-week-keyed object holding ONLY played weeks —
// iterate its values directly. (weeklyStatus is a separate 0-based dense array;
// indexing it by a weeklyPoints week-key would be off-by-one, so it is not used here.)
export function computeConsistencyCV(rec) {
  const values = Object.values(rec?.weeklyPoints ?? {});
  const n = values.length;
  if (n < 4) return null;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  if (mean <= 0) return null;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n; // population SD
  return Math.sqrt(variance) / mean;
}

// Attribution-independent ground truth (direct v3 read — see §2.2 mover flag).
export function computeMover(pid, anchorYear, totalsByYear) {
  const teamY   = totalsByYear[anchorYear]?.[pid]?.team ?? null;
  const teamYm1 = totalsByYear[anchorYear - 1]?.[pid]?.team ?? null;
  if (teamY == null || teamYm1 == null) return false;
  return teamY !== teamYm1;
}

// share(s) — WR/TE: rec_tgt / teamTotals(s)[T].recTgt; RB: rush_att / teamTotals(s)[T].rushAtt.
// Null if the team denominator < TEAM_DENOM_MIN. `season` selects both the player's own-stat
// season and (via teamOf) the team-bucket season; under current-team mode teamOf ignores
// `season` and always resolves the anchor-year team (the R2 seam — see teamKeyResolver above).
export function computeShare(pid, position, season, totalsByYear, teamTotalsByYear, teamOf) {
  const rec = totalsByYear[season]?.[pid];
  if (!rec) return null;
  const team = teamOf(pid, season);
  if (team == null) return null;
  const tt = teamTotalsByYear[season]?.totals?.[team];
  const s = rec.stats ?? {};
  if (position === 'RB') {
    const d = tt?.rushAtt ?? 0;
    return d >= TEAM_DENOM_MIN ? (s.rush_att || 0) / d : null;
  }
  const d = tt?.recTgt ?? 0;
  return d >= TEAM_DENOM_MIN ? (s.rec_tgt || 0) / d : null;
}

export function computeSnapShare(rec) {
  const s = rec?.stats ?? {};
  const offSnp = s.off_snp, tmOffSnp = s.tm_off_snp;
  if (offSnp != null && offSnp > 0 && tmOffSnp != null && tmOffSnp > 0) return offSnp / tmOffSnp;
  return null;
}

export function computeRzOwnRate(position, rec) {
  const s = rec?.stats ?? {};
  if (position === 'RB') {
    const d = s.rush_att || 0;
    return d > 0 ? (s.rush_rz_att || 0) / d : null;
  }
  const d = s.rec_tgt || 0;
  return d > 0 ? (s.rec_rz_tgt || 0) / d : null;
}

export function computeTeamRzShare(pid, position, season, totalsByYear, teamTotalsByYear, teamOf) {
  const rec = totalsByYear[season]?.[pid];
  if (!rec) return null;
  const team = teamOf(pid, season);
  if (team == null) return null;
  const tt = teamTotalsByYear[season]?.totals?.[team];
  const s = rec.stats ?? {};
  if (position === 'RB') {
    const d = tt?.rushRzAtt ?? 0;
    return d >= TEAM_DENOM_MIN ? (s.rush_rz_att || 0) / d : null;
  }
  const d = tt?.recRzTgt ?? 0;
  return d >= TEAM_DENOM_MIN ? (s.rec_rz_tgt || 0) / d : null;
}

export function computeYpt(position, rec) {
  const s = rec?.stats ?? {};
  if (position === 'RB') {
    const denom = (s.rush_att || 0) + (s.rec || 0);
    return denom > 0 ? ((s.rush_yd || 0) + (s.rec_yd || 0)) / denom : null;
  }
  const denom = s.rec_tgt || 0;
  return denom > 0 ? (s.rec_yd || 0) / denom : null;
}

export function computeQBFeatures(rec) {
  const s = rec?.stats ?? {};
  const passAtt = s.pass_att || 0;
  return {
    ypa:     passAtt > 0 ? (s.pass_yd  || 0) / passAtt : null,
    tdRate:  passAtt > 0 ? (s.pass_td  || 0) / passAtt : null,
    intRate: passAtt > 0 ? (s.pass_int || 0) / passAtt : null,
    rushYd:  s.rush_yd ?? 0,
  };
}

// ─── Row builder (§2.2/§2.4) ───────────────────────────────────────────────────

// Builds one PanelRow for (pid, position, anchorYear), or reports a dropReason.
// Raw (pre-imputation) feature values are returned — imputation happens inside
// folds (fold-dependent by design; see standardizeTrainApply).
export function buildPanelRow({ pid, position, anchorYear, totalsByYear, ppgByYear, advstatsY, teamOf, teamTotalsByYear, config }) {
  const minPredictorGames = config?.minPredictorGames ?? PANEL_DEFAULTS.minPredictorGames;
  const minOutcomeGames   = config?.minOutcomeGames   ?? PANEL_DEFAULTS.minOutcomeGames;

  const recY = totalsByYear[anchorYear]?.[pid];
  if (!recY) return { dropReason: 'belowGates' };

  const gamesPlayedY = recY.gamesPlayed ?? 0;
  if (gamesPlayedY < minPredictorGames) return { dropReason: 'belowGates' };

  const gates = PANEL_GATES[position] ?? {};
  const s = recY.stats ?? {};
  for (const [key, min] of Object.entries(gates)) {
    if ((s[key] || 0) < min) return { dropReason: 'belowGates' };
  }

  const outcomeYear = anchorYear + 1;
  const outcomeLookup = computeSeasonPoints(pid, ppgByYear[outcomeYear]);
  if (outcomeLookup.ppg == null) return { dropReason: 'noOutcome' };
  if (outcomeLookup.gamesPlayed < minOutcomeGames || !Number.isFinite(outcomeLookup.ppg)) {
    return { dropReason: 'outcomeBelowMinGames' };
  }
  const outcomePPG = outcomeLookup.ppg;

  const basePPG = computeBasePPG(pid, anchorYear, ppgByYear, minPredictorGames);
  if (basePPG == null) return { dropReason: 'belowGates' };

  const momentum      = computeMomentum(pid, anchorYear, ppgByYear, minPredictorGames);
  const consistencyCV = computeConsistencyCV(recY);
  const mover          = computeMover(pid, anchorYear, totalsByYear);

  const features = { basePPG, momentum, gamesPlayedY, consistencyCV };
  const candidates = {};

  if (position === 'QB') {
    Object.assign(features, computeQBFeatures(recY));
  } else {
    const team = totalsByYear[anchorYear]?.[pid]?.team ?? null;
    if (team == null) return { dropReason: 'noTeam' };

    const shareY = computeShare(pid, position, anchorYear, totalsByYear, teamTotalsByYear, teamOf);
    if (shareY == null) return { dropReason: 'noTeamDenominator' };
    const shareYm1 = computeShare(pid, position, anchorYear - 1, totalsByYear, teamTotalsByYear, teamOf);
    const shareTrend = shareYm1 != null ? (shareY - shareYm1) : 0;

    const snapShare = computeSnapShare(recY);
    if (snapShare == null) return { dropReason: 'missingSnap' };

    const teamRzShare = computeTeamRzShare(pid, position, anchorYear, totalsByYear, teamTotalsByYear, teamOf);
    if (teamRzShare == null) return { dropReason: 'noTeamDenominator' };

    const rzOwnRate = computeRzOwnRate(position, recY);
    const ypt        = computeYpt(position, recY);

    Object.assign(features, { shareTrend, snapShare, rzOwnRate, teamRzShare, ypt });

    candidates.shareLevel = shareY;
    candidates.airYardsShare = advstatsY?.players?.[pid]?.airYardsShare ?? null;
  }

  return {
    row: {
      sleeperId: pid,
      position,
      predictorYear: anchorYear,
      team: totalsByYear[anchorYear]?.[pid]?.team ?? null,
      mover,
      features,
      candidates,
      outcomePPG,
    },
  };
}

// ─── Panel assembly (§2.5 coverage) ────────────────────────────────────────────

// inputsByYear: { [year]: { seasonTotals, outcomes (Map), advstats, roster } }.
// advstats/roster may be null/absent for years outside [fromYear..toYear] (not needed there).
export function assemblePanelRows(inputsByYear, config) {
  const fromYear          = config.fromYear;
  const toYear            = config.toYear;
  const minPredictorGames = config.minPredictorGames ?? PANEL_DEFAULTS.minPredictorGames;
  const minOutcomeGames   = config.minOutcomeGames   ?? PANEL_DEFAULTS.minOutcomeGames;
  const attribution       = config.attribution ?? 'current-team';

  const totalsByYear = {};
  const ppgByYear = {};
  for (const [yr, input] of Object.entries(inputsByYear)) {
    totalsByYear[yr] = input?.seasonTotals ?? {};
    ppgByYear[yr] = input?.outcomes ?? new Map();
  }

  const rows = [];
  const coverage = {};
  const skippedYears = [];
  const unattributedByYear = {};

  const bucket = (position, year) => {
    const key = `${position}-${year}`;
    if (!coverage[key]) coverage[key] = { position, year, assembled: 0, surviving: 0, drops: {}, movers: 0 };
    return coverage[key];
  };

  for (let Y = fromYear; Y <= toYear; Y++) {
    const yearInput = inputsByYear[Y];
    // Missing season-totals OR missing advstats (the primary WR/TE/RB position
    // source) both warn+skip the whole predictor year — same convention as
    // scripts/backtest-run.mjs assembleCohort.
    if (!yearInput || !yearInput.seasonTotals || Object.keys(yearInput.seasonTotals).length === 0 || !yearInput.advstats) {
      skippedYears.push(Y);
      continue;
    }

    const teamOf = teamKeyResolver(attribution, totalsByYear, Y);
    const teamTotalsByYear = {};
    if (totalsByYear[Y])     teamTotalsByYear[Y]     = buildTeamTotalsForSeason(totalsByYear[Y], Y, teamOf);
    if (totalsByYear[Y - 1]) teamTotalsByYear[Y - 1] = buildTeamTotalsForSeason(totalsByYear[Y - 1], Y - 1, teamOf);
    unattributedByYear[Y] = {
      thisYear: teamTotalsByYear[Y]?.unattributed ?? 0,
      priorYear: teamTotalsByYear[Y - 1]?.unattributed ?? 0,
    };

    const advstatsY = yearInput.advstats;
    const rosterY = yearInput.roster;

    for (const pid of Object.keys(totalsByYear[Y])) {
      const position = resolvePosition(pid, advstatsY, rosterY);
      if (position == null) {
        bucket('UNK', Y).assembled++;
        bucket('UNK', Y).drops.noPositionSource = (bucket('UNK', Y).drops.noPositionSource ?? 0) + 1;
        continue;
      }

      const cov = bucket(position, Y);
      cov.assembled++;

      const result = buildPanelRow({
        pid, position, anchorYear: Y,
        totalsByYear, ppgByYear, advstatsY, teamOf, teamTotalsByYear,
        config: { minPredictorGames, minOutcomeGames },
      });

      if (result.dropReason) {
        cov.drops[result.dropReason] = (cov.drops[result.dropReason] ?? 0) + 1;
        continue;
      }

      cov.surviving++;
      if (result.row.mover) cov.movers++;
      rows.push(result.row);
    }
  }

  return {
    rows,
    coverage: {
      perPositionYear: Object.values(coverage).sort((a, b) => a.year - b.year || a.position.localeCompare(b.position)),
      skippedYears,
      unattributedByYear,
    },
  };
}

// ─── Forward-chaining CV folds (§3) ────────────────────────────────────────────

export function forwardChainFolds(years, minTrainSeasons) {
  const sorted = [...new Set(years)].sort((a, b) => a - b);
  const folds = [];
  for (let i = 0; i < sorted.length; i++) {
    const trainYears = sorted.slice(0, i);
    if (trainYears.length >= minTrainSeasons) {
      folds.push({ trainYears, evalYear: sorted[i] });
    }
  }
  return folds;
}

// ─── Training-only standardization + imputation (§2.4/§3 leakage guard) ───────

// Only consistencyCV can carry a raw null into a surviving row (all other null
// classes either listwise-drop the row or are imputed to 0 at row-build time).
// Its "degenerate" nulls are imputed to the training-fold mean, recomputed per
// fold from training rows only.
export function standardizeTrainApply(trainRows, evalRows, featureNames) {
  const imputeMean = {};
  for (const f of featureNames) {
    const vals = trainRows.map(r => r.features[f]).filter(v => v != null && Number.isFinite(v));
    imputeMean[f] = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  }
  const resolve = (row, f) => {
    const v = row.features[f];
    return (v == null || !Number.isFinite(v)) ? imputeMean[f] : v;
  };

  const means = {}, sds = {};
  for (const f of featureNames) {
    const vals = trainRows.map(r => resolve(r, f));
    const n = vals.length;
    const mean = n > 0 ? vals.reduce((s, v) => s + v, 0) / n : 0;
    const variance = n > 1 ? vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1) : 0;
    means[f] = mean;
    sds[f] = Math.sqrt(variance);
  }

  const outcomeVals = trainRows.map(r => r.outcomePPG);
  const outcomeMean = outcomeVals.length > 0 ? outcomeVals.reduce((s, v) => s + v, 0) / outcomeVals.length : 0;
  const outcomeVariance = outcomeVals.length > 1
    ? outcomeVals.reduce((s, v) => s + (v - outcomeMean) ** 2, 0) / (outcomeVals.length - 1) : 0;
  const outcomeSd = Math.sqrt(outcomeVariance);

  const zRow = row => featureNames.map(f => (sds[f] > 0 ? (resolve(row, f) - means[f]) / sds[f] : 0));

  const XTrain = trainRows.map(zRow);
  const yTrain = trainRows.map(r => (outcomeSd > 0 ? (r.outcomePPG - outcomeMean) / outcomeSd : 0));
  const XEval = evalRows.map(zRow);
  const yEval = evalRows.map(r => r.outcomePPG); // raw PPG — MAE computed after de-standardizing predictions

  return { XTrain, yTrain, XEval, yEval, scaler: { means, sds, imputeMean, outcomeMean, outcomeSd } };
}

// ─── Fit + score one fold ──────────────────────────────────────────────────────

export function fitAndScoreFold(trainRows, evalRows, featureNames, { ridgeLambda = PANEL_DEFAULTS.ridgeLambda } = {}) {
  const { XTrain, yTrain, XEval, yEval, scaler } = standardizeTrainApply(trainRows, evalRows, featureNames);
  const evalYear = evalRows[0]?.predictorYear ?? null;
  const { beta, singular } = solveOLS(XTrain, yTrain, { ridgeLambda });

  if (singular || beta === null) {
    return { evalYear, n: 0, mae: null, spearman: null, coefficients: {}, predictions: [] };
  }

  const predictions = XEval.map((xRow, i) => {
    const zPred = xRow.reduce((s, x, j) => s + x * beta[j], 0);
    const predicted = zPred * scaler.outcomeSd + scaler.outcomeMean;
    const row = evalRows[i];
    return { pid: row.sleeperId, predicted, actual: yEval[i], mover: row.mover };
  });

  const n = predictions.length;
  const mae = n > 0 ? predictions.reduce((s, p) => s + Math.abs(p.predicted - p.actual), 0) / n : null;
  const sp = spearman(predictions.map(p => p.predicted), predictions.map(p => p.actual));
  const coefficients = Object.fromEntries(featureNames.map((f, j) => [f, beta[j]]));

  return { evalYear, n, mae, spearman: sp, coefficients, predictions };
}

// ─── Full evaluation across folds (§3 metrics) ────────────────────────────────

export function evaluateModel(rows, folds, featureNames, opts = {}) {
  const { ridgeLambda = PANEL_DEFAULTS.ridgeLambda } = opts;

  const perEvalYear = [];
  const allPredictions = [];
  for (const { trainYears, evalYear } of folds) {
    const trainRows = rows.filter(r => trainYears.includes(r.predictorYear));
    const evalRows = rows.filter(r => r.predictorYear === evalYear);
    if (trainRows.length === 0 || evalRows.length === 0) {
      perEvalYear.push({ evalYear, n: 0, mae: null, spearman: null, coefficients: {}, predictions: [] });
      continue;
    }
    const foldResult = fitAndScoreFold(trainRows, evalRows, featureNames, { ridgeLambda });
    perEvalYear.push(foldResult);
    for (const p of foldResult.predictions) allPredictions.push({ ...p, evalYear });
  }

  const n = allPredictions.length;
  const mae = n > 0 ? allPredictions.reduce((s, p) => s + Math.abs(p.predicted - p.actual), 0) / n : null;

  const yearsWithSpearman = perEvalYear.filter(f => f.spearman != null && f.n > 0);
  const spearmanWeight = yearsWithSpearman.reduce((s, f) => s + f.n, 0);
  const spearmanMean = spearmanWeight > 0
    ? yearsWithSpearman.reduce((s, f) => s + f.spearman * f.n, 0) / spearmanWeight
    : null;

  const moverPreds = allPredictions.filter(p => p.mover);
  const moverN = moverPreds.length;
  const moverMae = moverN > 0 ? moverPreds.reduce((s, p) => s + Math.abs(p.predicted - p.actual), 0) / moverN : null;
  const spearmanByYear = {};
  for (const { evalYear } of folds) {
    const yearMovers = moverPreds.filter(p => p.evalYear === evalYear);
    spearmanByYear[evalYear] = yearMovers.length >= 10
      ? spearman(yearMovers.map(p => p.predicted), yearMovers.map(p => p.actual))
      : null;
  }

  const describeFit = fitDescriptive(rows, featureNames, ridgeLambda);

  return {
    perEvalYear,
    pooled: { n, mae, spearmanMean },
    movers: { n: moverN, mae: moverMae, spearmanByYear },
    describeFit,
  };
}

// Final descriptive fit on all rows (no holdout) — reported coefficients only, not scored.
function fitDescriptive(rows, featureNames, ridgeLambda) {
  if (rows.length === 0) return { coefficients: {} };
  const { XTrain, yTrain } = standardizeTrainApply(rows, [], featureNames);
  const { beta, singular } = solveOLS(XTrain, yTrain, { ridgeLambda });
  if (singular || beta === null) return { coefficients: {} };
  return { coefficients: Object.fromEntries(featureNames.map((f, j) => [f, beta[j]])) };
}

// ─── Candidate grading (§3) ─────────────────────────────────────────────────────

// Fits baseline and baseline+candidate on identical rows/folds (rows must survive
// listwise for the candidate too, so baseline is re-fit on the candidate-complete
// row set — deltas are apples-to-apples).
export function gradeCandidate(rows, folds, position, candidateName, candidateFeature, opts = {}) {
  const { ridgeLambda = PANEL_DEFAULTS.ridgeLambda, ridgeSweep = PANEL_DEFAULTS.ridgeSweep } = opts;
  const baselineFeatures = BASELINE_FEATURES[position];
  const augmentedFeatures = [...baselineFeatures, candidateFeature];

  const posRows = rows.filter(r => r.position === position);
  const fullBaselineN = posRows.length;
  const candidateRows = posRows.filter(r => {
    const v = r.candidates?.[candidateName];
    return v != null && Number.isFinite(v);
  });
  const nCandidateComplete = candidateRows.length;

  const shimRows = candidateRows.map(r => ({
    ...r,
    features: { ...r.features, [candidateFeature]: r.candidates[candidateName] },
  }));

  const fitAt = (lambda) => ({
    baseline:  evaluateModel(shimRows, folds, baselineFeatures, { ridgeLambda: lambda }),
    augmented: evaluateModel(shimRows, folds, augmentedFeatures, { ridgeLambda: lambda }),
  });

  const { baseline, augmented } = fitAt(ridgeLambda);

  const maePooled = (augmented.pooled.mae != null && baseline.pooled.mae != null)
    ? augmented.pooled.mae - baseline.pooled.mae : null;
  const maePerYear = augmented.perEvalYear.map((f, i) => {
    const b = baseline.perEvalYear[i];
    return {
      evalYear: f.evalYear,
      dMae: (f.mae != null && b?.mae != null) ? f.mae - b.mae : null,
    };
  });
  const spearmanDelta = (augmented.pooled.spearmanMean != null && baseline.pooled.spearmanMean != null)
    ? augmented.pooled.spearmanMean - baseline.pooled.spearmanMean : null;

  const coefficient = {
    perFold: augmented.perEvalYear.map(f => ({ evalYear: f.evalYear, coefficient: f.coefficients[candidateFeature] ?? null })),
    allYears: augmented.describeFit.coefficients[candidateFeature] ?? null,
  };

  const sweep = ridgeSweep.map(lambda => {
    const { baseline: b, augmented: a } = fitAt(lambda);
    const dMae = (a.pooled.mae != null && b.pooled.mae != null) ? a.pooled.mae - b.pooled.mae : null;
    const dSpearman = (a.pooled.spearmanMean != null && b.pooled.spearmanMean != null)
      ? a.pooled.spearmanMean - b.pooled.spearmanMean : null;
    return { lambda, dMae, dSpearman };
  });

  const deltas = { maePooled, maePerYear, spearmanMean: spearmanDelta };
  const verdict = decideVerdict(deltas, sweep, baseline.pooled.mae);

  return {
    position, candidate: candidateName,
    nCandidateComplete, fullBaselineN,
    baseline, augmented,
    deltas, coefficient, sweep,
    verdict,
  };
}

// ─── Verdict rules (§3, ordered) ───────────────────────────────────────────────

export function decideVerdict(deltas, sweep, baselineMae) {
  const { maePooled, maePerYear, spearmanMean } = deltas;
  if (maePooled == null) return 'UNSTABLE';
  if (maePooled > 0) return 'DEGRADES';

  const yearsImproved = maePerYear.filter(y => y.dMae != null && y.dMae < 0).length;
  const sweepStable = [0.5, 1, 2].every(lambda => {
    const entry = sweep.find(s => s.lambda === lambda);
    return entry && entry.dMae != null && entry.dMae < 0;
  });
  const clears = maePooled < 0 && spearmanMean != null && spearmanMean >= 0 &&
    yearsImproved >= 2 && sweepStable;
  if (clears) return 'CLEARS';

  if (baselineMae != null && baselineMae > 0 && Math.abs(maePooled) / baselineMae < 0.005) return 'NO-GAIN';

  return 'UNSTABLE';
}
