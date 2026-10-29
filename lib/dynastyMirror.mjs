/**
 * lib/dynastyMirror.mjs — pure, no I/O.
 *
 * Cross-repo MIRROR CONTRACT (CR-32): a port of the app's dynasty score and the inputs it composes, for
 * offline backtesting only. Mirrored at app `95ba1e1`:
 *   src/utils/dynastyScore.js   :14-150 (computeEmpiricalAgeCurves), :152-251 (opportunity quality),
 *                               :480-497 (computeKTCPositionPercentile), :503-619 (prospect score),
 *                               :625-668, :674-1093 (computeDynastyScore)
 *   src/utils/teamContext.js    :20, :37, :50-160 (QB quality + modifier), :165-240 (computeTeamContext),
 *                               :252-321 (historical totals / shares), :326-361 (computeShareTrend)
 *   src/utils/momentum.js       :18-35        src/utils/dynastyLabel.js   :8-51
 *   src/utils/regressionSignals.js :29-34, 72-78   src/utils/projectionSignals.js :14-18, 31-36, 64-92, 105-115
 * Reused, not re-ported: lib/durabilityMirror.mjs (classifyInjurySeason, wasContributorSeason — CR-28) and
 * lib/projectionFactors.mjs (interpolateAgeCurve, equivalent to ageCurve.js:12-25).
 * If the app changes any cited constant, gate or branch, re-sync or the backtest stops describing the app.
 * test/dynasty-mirror.test.mjs (T-G1) proves parity against goldens made by the app's own code
 * (app scripts/verify/lib/dynastyGolden.mjs).
 *
 * Deliberate differences from the app (each is a named seam, never a silent edit):
 *   - empiricalAgeCurvesMirror: `new Date().getFullYear()` (dynastyScore.js:87) is the `currentYear` argument.
 *   - teamContextMirror, 'per-season-team' mode: skips TEAM_* ids (the app never runs that mode here).
 *   - historicalSharesMirror: the app's `share > 1` console.warn is `countSharesAboveOne`.
 *   - dynastyScoreMirror: an additive `raw` key on Paths B/C; `options` seams (defaults = app).
 *   - no console output anywhere.
 */
import { interpolateAgeCurve } from './projectionFactors.mjs';
import { classifyInjurySeason } from './durabilityMirror.mjs';

const SKILL_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

// dynastyScore.js:19
export const PEAK_AGE_CAPS = { QB: 32, RB: 25, WR: 28, TE: 29 };
// dynastyScore.js:60
export const MIN_BASIS_SCALE_ROWS = 30;
// dynastyScore.js:504, 536
export const POSITION_PRIOR_PPG = { QB: 14, RB: 12, WR: 9, TE: 7 };
export const NO_MARKET_CAP = 35;
// dynastyScore.js:984-1008
export const DYNASTY_WEIGHTS = { ageAdjusted: 0.28, trajectory: 0.25, currentLevel: 0.22, reliability: 0.10, opportunityQuality: 0.15 };
// projectionSignals.js:14-18 (identical to dynastyScore.js TD_STAT_KEYS)
const TD_STAT_KEYS = [
  'rush_td', 'rec_td', 'pass_td',
  'rush_2pt', 'rec_2pt', 'pass_2pt',
  'def_td', 'def_st_td', 'st_td', 'fum_rec_td',
];

// ─── private helpers (duplicated, as the app does; not imported across modules) ───────────────────

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function rollingAvg3(points) {
  return points.map((p, i) => {
    const window = points.slice(Math.max(0, i - 1), i + 2);
    return { age: p.age, medianPPG: window.reduce((s, w) => s + w.medianPPG, 0) / window.length };
  });
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function percentileRank(sortedPool, value) {
  if (sortedPool.length === 0) return 50;
  let below = 0;
  for (const v of sortedPool) { if (v < value) below++; }
  return Math.round((below / sortedPool.length) * 100);
}

function weightedLinearRegression(xs, ys) {
  const ws = xs.map((_, i) => i + 1);
  const wSum = ws.reduce((a, b) => a + b, 0);
  const wxSum = ws.reduce((s, w, i) => s + w * xs[i], 0);
  const wySum = ws.reduce((s, w, i) => s + w * ys[i], 0);
  const wxxSum = ws.reduce((s, w, i) => s + w * xs[i] * xs[i], 0);
  const wxySum = ws.reduce((s, w, i) => s + w * xs[i] * ys[i], 0);
  const denom = wSum * wxxSum - wxSum * wxSum;
  if (Math.abs(denom) < 1e-10) return 0;
  return (wSum * wxySum - wxSum * wySum) / denom;
}

// regressionSignals.js stdDev
function stdDev(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

// ─── empirical age curves — dynastyScore.js:28-150 ────────────────────────────────────────────────

function derivePeakAge(curve, position) {
  const cap = PEAK_AGE_CAPS[position] ?? null;
  if (!curve || curve.length === 0) {
    return { derivedPeakAge: null, cap, cappedPeakAge: null };
  }
  const derivedPeakAge = curve.reduce(
    (best, p) => p.medianPPG > best.medianPPG ? p : best,
    curve[0]
  ).age;
  const cappedPeakAge = cap != null ? Math.min(derivedPeakAge, cap) : derivedPeakAge;
  return { derivedPeakAge, cap, cappedPeakAge };
}

/**
 * dynastyScore.js:67-150. `currentYear` replaces the wall-clock year (:87). Returns
 * { curves, positionPeakPPG, positionPeakAge, positionBasisScale }.
 */
export function empiricalAgeCurvesMirror(careerStats, playersMap, { currentYear }) {
  const byPositionAge = { QB: {}, RB: {}, WR: {}, TE: {} };
  const basisRatios = { QB: [], RB: [], WR: [], TE: [] };

  for (const [season, seasonData] of Object.entries(careerStats)) {
    for (const [playerId, data] of Object.entries(seasonData)) {
      if ((data.gamesPlayed ?? 0) < 10) continue;
      const player = playersMap[playerId];
      if (!player || !SKILL_POSITIONS.has(player.position)) continue;

      if (data.sourceScoringBasis === 'half_ppr'
        && Number.isFinite(data.fantasyPoints) && Number.isFinite(data.sourceFantasyPoints)
        && data.sourceFantasyPoints > 0) {
        basisRatios[player.position].push(data.fantasyPoints / data.sourceFantasyPoints);
      }

      const currentAge = player.age;
      if (currentAge == null) continue;
      const seasonYear = Number(season);
      const ageAtSeason = Math.round(currentAge - (currentYear - seasonYear));
      if (ageAtSeason < 18 || ageAtSeason > 42) continue;

      const ppg = data.fantasyPoints / data.gamesPlayed;
      if (!Number.isFinite(ppg)) continue;
      const pos = player.position;
      if (!byPositionAge[pos][ageAtSeason]) byPositionAge[pos][ageAtSeason] = [];
      byPositionAge[pos][ageAtSeason].push(ppg);
    }
  }

  const curves = {};
  const positionPeakPPG = {};
  const positionPeakAge = {};

  for (const pos of Object.keys(byPositionAge)) {
    const raw = Object.entries(byPositionAge[pos])
      .map(([age, ppgs]) => ({ age: Number(age), medianPPG: median(ppgs) }))
      .sort((a, b) => a.age - b.age);

    const smoothed = rollingAvg3(raw);
    curves[pos] = smoothed;

    if (smoothed.length > 0) {
      const { cappedPeakAge } = derivePeakAge(smoothed, pos);
      const cappedPeakPoint = smoothed.reduce(
        (best, p) => Math.abs(p.age - cappedPeakAge) < Math.abs(best.age - cappedPeakAge) ? p : best,
        smoothed[0]
      );
      positionPeakPPG[pos] = Math.max(cappedPeakPoint.medianPPG, 1);
      positionPeakAge[pos] = cappedPeakAge;
    } else {
      positionPeakPPG[pos] = 1;
      positionPeakAge[pos] = null;
    }
  }

  const positionBasisScale = {};
  for (const pos of Object.keys(basisRatios)) {
    positionBasisScale[pos] = basisRatios[pos].length >= MIN_BASIS_SCALE_ROWS
      ? Math.round(median(basisRatios[pos]) * 1000) / 1000
      : 1;
  }

  return { curves, positionPeakPPG, positionPeakAge, positionBasisScale };
}

// ─── team context — teamContext.js ────────────────────────────────────────────────────────────────

// teamContext.js:37
export function isTeamAggregateId(playerId) {
  return typeof playerId === 'string' && playerId.startsWith('TEAM_');
}

// teamContext.js:20
export function resolveAttributedTeam(seasonEntry, player, mode) {
  if (mode === 'per-season-team') return seasonEntry?.team ?? player?.team ?? null;
  return player?.team ?? null;
}

/**
 * teamContext.js:165-240. DELIBERATE FIX: in 'per-season-team' mode `TEAM_*` ids are skipped in both loops
 * (the app's own comment :158-163 says a per-season migration must adopt this). 'current-team' is verbatim.
 */
export function teamContextMirror(careerStats, playersMap, currentSeason, { attribution = 'per-season-team' } = {}) {
  const seasonData = careerStats?.[currentSeason];
  if (!seasonData) return { teamOffense: {}, playerShares: {} };
  const skipAggregates = attribution === 'per-season-team';

  const teamTotals = {};
  for (const [playerId, data] of Object.entries(seasonData)) {
    if (skipAggregates && isTeamAggregateId(playerId)) continue;
    if ((data.gamesPlayed ?? 0) < 1) continue;
    const player = playersMap[playerId];
    const team = resolveAttributedTeam(data, player, attribution);
    if (!team) continue;

    if (!teamTotals[team]) teamTotals[team] = { rushAtt: 0, rec: 0, fantasyPts: 0 };

    const s = data.stats ?? {};
    teamTotals[team].rushAtt += s.rush_att ?? 0;
    teamTotals[team].rec += s.rec ?? 0;
    teamTotals[team].fantasyPts += data.fantasyPoints ?? 0;
  }

  const sorted = Object.entries(teamTotals).sort(([, a], [, b]) => b.fantasyPts - a.fantasyPts);

  const teamOffense = {};
  sorted.forEach(([team, totals], i) => {
    teamOffense[team] = {
      rank: i + 1,
      totalPts: Math.round(totals.fantasyPts * 10) / 10,
      rushAtt: totals.rushAtt,
      rec: totals.rec,
      season: currentSeason,
    };
  });

  const playerShares = {};
  for (const [playerId, data] of Object.entries(seasonData)) {
    if (skipAggregates && isTeamAggregateId(playerId)) continue;
    if ((data.gamesPlayed ?? 0) < 4) continue;
    const player = playersMap[playerId];
    const team = resolveAttributedTeam(data, player, attribution);
    if (!team || !player?.position) continue;

    const totals = teamTotals[team];
    if (!totals) continue;

    const s = data.stats ?? {};
    const pos = player.position;

    if (pos === 'RB') {
      const carryShare = (s.rush_att ?? 0) / Math.max(totals.rushAtt, 1);
      playerShares[playerId] = {
        carryShare: Math.round(carryShare * 1000) / 1000,
        targetShare: null,
        teamOffenseRank: teamOffense[team]?.rank ?? null,
        season: currentSeason,
      };
    } else if (pos === 'WR' || pos === 'TE') {
      const targetShare = (s.rec ?? 0) / Math.max(totals.rec, 1);
      playerShares[playerId] = {
        carryShare: null,
        targetShare: Math.round(targetShare * 1000) / 1000,
        teamOffenseRank: teamOffense[team]?.rank ?? null,
        season: currentSeason,
      };
    }
  }

  return { teamOffense, playerShares };
}

/** teamContext.js:252-272, verbatim. */
export function historicalTeamTotalsMirror(careerStats, playersMap, { attribution = 'per-season-team' } = {}) {
  const result = {};
  for (const [season, seasonData] of Object.entries(careerStats)) {
    const teamTotals = {};
    for (const [playerId, data] of Object.entries(seasonData)) {
      if ((data.gamesPlayed ?? 0) < 1) continue;
      if (isTeamAggregateId(playerId)) continue;
      const team = resolveAttributedTeam(data, playersMap[playerId], attribution);
      if (!team) continue;
      if (!teamTotals[team]) teamTotals[team] = { rushAtt: 0, rec: 0, recTgt: 0, rushRz: 0, recRz: 0 };
      const s = data.stats ?? {};
      teamTotals[team].rushAtt += s.rush_att ?? 0;
      teamTotals[team].rec += s.rec ?? 0;
      teamTotals[team].recTgt += s.rec_tgt ?? 0;
      teamTotals[team].rushRz += s.rush_rz_att ?? 0;
      teamTotals[team].recRz += s.rec_rz_tgt ?? 0;
    }
    result[season] = teamTotals;
  }
  return result;
}

/** teamContext.js:281-320, verbatim except the share > 1 console.warn (see countSharesAboveOne). */
export function historicalSharesMirror(careerStats, playersMap, historicalTeamTotals, { attribution = 'per-season-team' } = {}) {
  const result = {};
  const allSeasons = Object.keys(careerStats).map(Number).sort();

  for (const season of allSeasons) {
    const seasonData = careerStats[season] ?? {};
    for (const [playerId, data] of Object.entries(seasonData)) {
      if ((data.gamesPlayed ?? 0) < 8) continue;
      const player = playersMap[playerId];
      if (!player) continue;
      const pos = player.position;
      if (!['RB', 'WR', 'TE'].includes(pos)) continue;
      const team = resolveAttributedTeam(data, player, attribution);
      if (!team) continue;
      const teamTotals = historicalTeamTotals[season]?.[team];
      if (!teamTotals) continue;

      const s = data.stats ?? {};
      let share = null;
      if (pos === 'RB') {
        const rushAtt = s.rush_att ?? 0;
        if (rushAtt > 0) share = rushAtt / Math.max(teamTotals.rushAtt, 1);
      } else {
        const recTgt = s.rec_tgt ?? 0;
        if (recTgt > 0 && teamTotals.recTgt > 0) {
          share = recTgt / Math.max(teamTotals.recTgt, 1);
        } else {
          const rec = s.rec ?? 0;
          if (rec > 0) share = rec / Math.max(teamTotals.rec, 1);
        }
      }
      if (share === null || !isFinite(share)) continue;

      if (!result[playerId]) result[playerId] = [];
      result[playerId].push({ season, share: Math.round(share * 1000) / 1000, gamesPlayed: data.gamesPlayed });
    }
  }
  return result;
}

/** How many share entries exceed 1 (the app console.warns each; the panel reports the count in meta.checks). */
export function countSharesAboveOne(shares) {
  let n = 0;
  for (const hist of Object.values(shares ?? {})) for (const e of hist) if (e.share > 1) n++;
  return n;
}

/** teamContext.js:326-361, verbatim. */
export function shareTrendMirror(shareHistory) {
  if (!shareHistory || shareHistory.length < 2) return null;

  const recentShare = shareHistory[shareHistory.length - 1].share;

  const prior = shareHistory.slice(0, -1);
  const p1 = prior[prior.length - 1]?.share ?? null;
  const p2 = prior[prior.length - 2]?.share ?? null;
  const p3 = prior[prior.length - 3]?.share ?? null;
  const w1 = p1 != null ? 0.50 : 0;
  const w2 = p2 != null ? 0.30 : 0;
  const w3 = p3 != null ? 0.20 : 0;
  const totalW = w1 + w2 + w3;
  const priorShare = ((p1 ?? 0) * w1 + (p2 ?? 0) * w2 + (p3 ?? 0) * w3) / totalW;

  const trend = (recentShare - priorShare) / Math.max(priorShare, 0.01);

  let shareTrendLabel;
  if (trend > 0.20) shareTrendLabel = 'growing';
  else if (trend > 0.05) shareTrendLabel = 'expanding';
  else if (trend >= -0.05) shareTrendLabel = 'stable';
  else if (trend >= -0.20) shareTrendLabel = 'shrinking';
  else shareTrendLabel = 'declining';

  const shares = shareHistory.map(s => s.share);
  const mean = shares.reduce((a, b) => a + b, 0) / shares.length;
  const shareVolatility = Math.sqrt(
    shares.reduce((s, v) => s + (v - mean) ** 2, 0) / (shares.length - 1)
  );
  const volatilityLabel = shareVolatility < 0.05 ? 'entrenched'
    : shareVolatility <= 0.10 ? 'moderate'
    : 'volatile';

  return { recentShare, priorShare, trend, shareTrendLabel, shareVolatility, volatilityLabel };
}

// ─── momentum / label / consistency / flags ───────────────────────────────────────────────────────

/** momentum.js:18-35, verbatim. */
export function momentumMirror(ppgs, meanPPG) {
  if (!Array.isArray(ppgs) || ppgs.length < 4) {
    return { momentum: null, momentumLabel: null };
  }
  const n = ppgs.length;
  const recentAvg = (ppgs[n - 1] + ppgs[n - 2]) / 2;
  const priorAvg = (ppgs[n - 3] + ppgs[n - 4]) / 2;
  const momentum = (recentAvg - priorAvg) / Math.max(meanPPG, 1);

  let momentumLabel;
  if (momentum > 0.20) momentumLabel = 'accelerating';
  else if (momentum > 0.05) momentumLabel = 'improving';
  else if (momentum >= -0.05) momentumLabel = 'stable';
  else if (momentum >= -0.20) momentumLabel = 'slowing';
  else momentumLabel = 'decelerating';

  return { momentum, momentumLabel };
}

// dynastyLabel.js:8-51
const LABELS_ABOVE_FLOOR = new Set(['Elite', 'Ascending Star', 'Peak Window', 'Developing', 'Rising', 'Breakout', 'Bounce-back']);

export function pickDynastyLabelMirror({ score, isLateCareer, isBreakout, isBounceBack, slope, age, depthOrder }) {
  let label;
  if (isLateCareer) {
    label = score >= 55 ? 'Veteran Producer'
      : score >= 40 ? 'Managed Decline'
      : score >= 20 ? 'Sell Now'
      : 'Fading';
  } else if (isBreakout) {
    label = 'Breakout';
  } else if (isBounceBack) {
    label = 'Bounce-back';
  } else if (score >= 80) {
    label = 'Elite';
  } else if (score >= 70 && slope > 0) {
    label = 'Ascending Star';
  } else if (score >= 70) {
    label = 'Peak Window';
  } else if (score >= 55 && age != null && age <= 25) {
    label = 'Developing';
  } else if (score >= 55 && slope > 0) {
    label = 'Rising';
  } else if (score >= 55) {
    label = 'Solid Floor';
  } else if (score >= 40 && slope >= 0) {
    label = 'Plateau';
  } else if (score >= 40) {
    label = 'Managed Decline';
  } else if (score >= 20) {
    label = 'Sell Now';
  } else {
    label = 'Fading';
  }

  if (depthOrder != null && depthOrder >= 3) {
    if (LABELS_ABOVE_FLOOR.has(label)) label = 'Solid Floor';
  }
  return label;
}

/** regressionSignals.js:72-78, verbatim. */
export function consistencyMirror(ppgs) {
  if (!Array.isArray(ppgs) || ppgs.length < 3) return { consistencyScore: null };
  const meanPPG = ppgs.reduce((a, b) => a + b, 0) / ppgs.length;
  const cv = meanPPG > 0 ? stdDev(ppgs) / meanPPG : 1;
  const consistencyScore = Math.max(0, Math.min(100, 100 - cv * 100));
  return { consistencyScore };
}

/** projectionSignals.js:31-36, verbatim. */
export function breakoutFlagMirror(age, currentPPG, curve, peakPPG) {
  const expectedMedianPPG = age != null ? interpolateAgeCurve(curve, age) : peakPPG * 0.7;
  const ageFactor = expectedMedianPPG / peakPPG;
  const rawRatio = ageFactor > 0 ? (currentPPG / peakPPG) / ageFactor : 0;
  return age != null && age <= 24 && rawRatio > 1.3;
}

/** projectionSignals.js:64-92, verbatim (takes the score's own seasonHistory as `qualifying`). */
export function bounceBackFlagMirror(qualifying, careerStats, playerId, position) {
  if (!Array.isArray(qualifying) || qualifying.length < 2) return false;

  const current = qualifying[qualifying.length - 1];
  const priors = qualifying.slice(0, -1);
  const priorMax = Math.max(...priors.map(s => s.ppg));

  const downSeason = current.season - 1;
  const prevQ = priors[priors.length - 1];

  const shortQualifyingPrior =
    prevQ.season === downSeason && (prevQ.gamesPlayed ?? 0) < 10;

  const downEntry = careerStats?.[downSeason]?.[playerId];
  const subQualifyingInjury =
    downEntry != null &&
    (downEntry.gamesPlayed ?? 0) < 8 &&
    classifyInjurySeason(careerStats, playerId, position, downSeason);

  if (!shortQualifyingPrior && !subQualifyingInjury) return false;

  return current.ppg >= priorMax;
}

/** projectionSignals.js:105-115, verbatim. */
export function tdRelianceMirror(stats, totalFP, scoringSettings) {
  if (!scoringSettings || !stats) return { tdDependency: null, isTdReliant: false };
  let tdPoints = 0;
  for (const key of TD_STAT_KEYS) {
    const statVal = stats[key];
    const multiplier = scoringSettings[key];
    if (statVal != null && multiplier != null) tdPoints += statVal * multiplier;
  }
  const tdDependency = tdPoints / Math.max(totalFP ?? 0, 1);
  return { tdDependency, isTdReliant: tdDependency > 0.40 };
}

// ─── opportunity quality — dynastyScore.js:163-251 ────────────────────────────────────────────────

function getEfficiencyAndVolume(position, stats, gamesPlayed) {
  const s = stats ?? {};
  const gp = Math.max(gamesPlayed, 1);
  let eff = null, vol = null;

  if (position === 'QB') {
    const att = s.pass_att ?? 0;
    if (att > 0) {
      eff = (s.pass_yd ?? 0) / att;
      vol = att / gp;
    }
  } else if (position === 'RB') {
    const carries = s.rush_att ?? 0;
    const rec = s.rec ?? 0;
    if (carries > 0) {
      eff = (s.rush_yd ?? 0) / carries;
      vol = (carries + rec) / gp;
    }
  } else if (position === 'WR' || position === 'TE') {
    const rec = s.rec ?? 0;
    if (rec > 0) {
      eff = (s.rec_yd ?? 0) / rec;
      const tgt = s.rec_tgt ?? 0;
      if (tgt > 0) {
        const catchRate = rec / tgt;
        eff = eff * 0.70 + (catchRate * 30) * 0.30;
      }
      vol = rec / gp;
    }
  }

  return { eff, vol };
}

function computeOpportunityQuality(playerId, position, seasonHistory, careerStats, playersMap, playerShare = null) {
  if (!SKILL_POSITIONS.has(position) || seasonHistory.length === 0) {
    return { opportunityScore: 50, efficiencyPercentile: 50, volumePercentile: 50 };
  }

  const targetSeason = seasonHistory[seasonHistory.length - 1].season;
  const targetSeasonData = careerStats[targetSeason] ?? {};

  const playerData = targetSeasonData[playerId];
  if (!playerData || (playerData.gamesPlayed ?? 0) < 8) {
    return { opportunityScore: 50, efficiencyPercentile: 50, volumePercentile: 50 };
  }

  const effPool = [], volPool = [];
  for (const [id, data] of Object.entries(targetSeasonData)) {
    const p = playersMap[id];
    if (!p || p.position !== position || (data.gamesPlayed ?? 0) < 8) continue;
    const { eff, vol } = getEfficiencyAndVolume(position, data.stats, data.gamesPlayed);
    if (eff != null && isFinite(eff)) effPool.push(eff);
    if (vol != null && isFinite(vol)) volPool.push(vol);
  }
  effPool.sort((a, b) => a - b);
  volPool.sort((a, b) => a - b);

  const { eff: playerEff, vol: playerVol } =
    getEfficiencyAndVolume(position, playerData.stats, playerData.gamesPlayed);

  if (playerEff == null || playerVol == null) {
    return { opportunityScore: 50, efficiencyPercentile: 50, volumePercentile: 50 };
  }

  const efficiencyPercentile = percentileRank(effPool, playerEff);
  const volumePercentile = percentileRank(volPool, playerVol);

  let opportunityScore;
  let shareScore = null;

  if (position === 'RB' && playerShare?.carryShare != null) {
    shareScore = Math.round(clamp(playerShare.carryShare * 200, 0, 100));
    opportunityScore = Math.round(efficiencyPercentile * 0.40 + volumePercentile * 0.30 + shareScore * 0.30);
  } else if ((position === 'WR' || position === 'TE') && playerShare?.targetShare != null) {
    shareScore = Math.round(clamp(playerShare.targetShare * 400, 0, 100));
    opportunityScore = Math.round(efficiencyPercentile * 0.40 + volumePercentile * 0.30 + shareScore * 0.30);
  } else {
    opportunityScore = Math.round(efficiencyPercentile * 0.55 + volumePercentile * 0.45);
  }

  return { opportunityScore, efficiencyPercentile, volumePercentile, shareScore };
}

/** dynastyScore.js:480-497, verbatim (null when ktcMap is null — every call here). */
export function ktcPositionPercentileMirror(playerId, position, ktcMap, playersMap) {
  if (!ktcMap?.size) return null;

  const playerValue = ktcMap.get(playerId)?.value;
  if (playerValue == null) return null;

  const positionValues = [];
  for (const [id, entry] of ktcMap.entries()) {
    if (playersMap[id]?.position === position) positionValues.push(entry.value);
  }

  if (positionValues.length < 5) return null;

  positionValues.sort((a, b) => a - b);
  let below = 0;
  for (const v of positionValues) { if (v < playerValue) below++; }
  return Math.round((below / positionValues.length) * 100);
}

// ─── prospect score — dynastyScore.js:503-619 ─────────────────────────────────────────────────────

function ageMultiplier(age) {
  if (age <= 21) return 1.20;
  if (age === 22) return 1.10;
  if (age === 23) return 1.00;
  if (age === 24) return 0.88;
  return 0.75;
}

function draftMultiplier(pick) {
  if (!pick) return 0.75;
  const { round, pick: pickNo } = pick;
  if (round === 1 && pickNo <= 3) return 1.30;
  if (round === 1 && pickNo <= 8) return 1.15;
  if (round === 1 && pickNo <= 12) return 1.05;
  if (round === 1) return 1.05;
  if (round === 2) return 0.90;
  if (round === 3) return 0.78;
  return 0.65;
}

function normalisePPG(ppg, peakPPG) {
  return Math.min(ppg / Math.max(peakPPG, 1), 1);
}

function validProspectEntry(e) {
  if (!e) return null;
  const kindOk = (e.priorKind === 'projection' && Number.isFinite(e.prior)) || e.priorKind === 'position';
  if (!kindOk) return null;
  if (!Number.isInteger(e.n) || e.n < 0) return null;
  if (!Number.isFinite(e.k) || e.k < 0) return null;
  if (e.n > 0 && !Number.isFinite(e.obs)) return null;
  return e;
}

export function prospectScoreMirror(player, dynastyDraftPick, currentSeasonStats, positionPeakPPG, ktcPercentile = null, basisScale = 1, prospectEntry = null) {
  const position = player.position;
  const age = player.age ?? 23;
  const priorPPG = (POSITION_PRIOR_PPG[position] ?? 9) * basisScale * ageMultiplier(age) * draftMultiplier(dynastyDraftPick);
  const peakPPG = positionPeakPPG?.[position] ?? 20;
  const entry = validProspectEntry(prospectEntry);

  let blendedPPG = priorPPG;
  let gamesPlayed = 0;
  if (currentSeasonStats && (currentSeasonStats.gamesPlayed ?? 0) > 0) {
    if (!Number.isFinite(currentSeasonStats.gamesPlayed) || !Number.isFinite(currentSeasonStats.fantasyPoints)) {
      // evidence blend skipped (the app warns)
    } else {
      gamesPlayed = currentSeasonStats.gamesPlayed;
      const evidenceWeight = Math.min(gamesPlayed, 12);
      const priorWeight = 8;
      const evidencePPG = currentSeasonStats.fantasyPoints / gamesPlayed;
      blendedPPG = (priorPPG * priorWeight + evidencePPG * evidenceWeight) / (priorWeight + evidenceWeight);
    }
  }
  const startPPG = entry?.priorKind === 'projection' ? entry.prior : blendedPPG;

  const ktcInfluenced = ktcPercentile != null;
  const hasPremiumPick = dynastyDraftPick != null && dynastyDraftPick.round <= 2;
  const hasMarketSignal = ktcInfluenced || hasPremiumPick;

  const start = hasMarketSignal ? startPPG : Math.min(startPPG, NO_MARKET_CAP / 100 * Math.max(peakPPG, 1));

  const ppg = entry && entry.n > 0 ? (start * entry.k + entry.obs * entry.n) / (entry.k + entry.n) : start;

  let prospectScore = normalisePPG(ppg, peakPPG) * 100;

  if (ktcInfluenced) {
    prospectScore = ktcPercentile * 0.60 + prospectScore * 0.40;
  }

  return {
    score: Math.round(prospectScore),
    gamesPlayed,
    isRookie: true,
    draftCapital: dynastyDraftPick ?? null,
    ktcInfluenced,
    priorKind: entry ? entry.priorKind : 'position',
  };
}

// ─── recency-weighted PPG — dynastyScore.js:650-668 ───────────────────────────────────────────────

function recencyWeightedPPG(playerId, careerStats, allSeasons, inSeasonLevel = null) {
  const qualifying = allSeasons
    .map(season => {
      const d = careerStats[season]?.[playerId];
      if (!d) return null;
      const gpRaw = d.gamesPlayed ?? 0;
      if (!Number.isFinite(gpRaw) || gpRaw < 8 || !Number.isFinite(d.fantasyPoints)) return null;
      return { season, ppg: d.fantasyPoints / d.gamesPlayed };
    })
    .filter(v => v != null);

  if (qualifying.length === 0) return 0;
  const lastQ = qualifying[qualifying.length - 1];
  const lastPPG = inSeasonLevel?.has(playerId) && lastQ.season >= allSeasons[allSeasons.length - 1] - 1
    ? inSeasonLevel.get(playerId)
    : lastQ.ppg;
  if (qualifying.length === 1) return lastPPG;
  return lastPPG * 0.70 + qualifying[qualifying.length - 2].ppg * 0.30;
}

// ─── composition ──────────────────────────────────────────────────────────────────────────────────

/**
 * dynastyScore.js:984-1008. The sum is written in the app's fixed term order whatever the object's key
 * order. The reliability term is `effectiveReliability` (after the ×0.90 TD-reliance penalty), never
 * `reliabilityScore`. With default weights this equals dynastyScoreMirror(...).score on a B/C row.
 */
export function composeDynastyScore(raw, weights = DYNASTY_WEIGHTS) {
  const w = weights;
  const component = Math.round(
    raw.ageAdjScore * w.ageAdjusted +
    raw.trajectoryScore * w.trajectory +
    raw.currentLevelScore * w.currentLevel +
    raw.effectiveReliability * w.reliability +
    raw.opportunityScore * w.opportunityQuality
  );
  if (raw.seasonsOfData <= 2) return Math.round(raw.prospectScore * 0.4 + component * 0.6);
  return component;
}

// ─── dynastyScoreMirror — dynastyScore.js:674-1093 ────────────────────────────────────────────────

/**
 * Same positional signature and return shape as the app's computeDynastyScore, plus one additive key `raw`
 * on Paths B/C only. `options` (ablation seams; defaults = app): targetShareOverride (Map pid → share; replaces an
 * existing WR/TE targetShare, never creates one), shareTrendBoostOff, reliabilityMix.
 */
export function dynastyScoreMirror(
  playerId, playersMap, careerStats, empiricalCurves,
  positionPeakPPG, dynastyDraftPick, scoringSettings, ktcMap = null, teamContext = null, depthMap = null,
  historicalShares = null, positionPeakAge = null, positionBasisScale = null, inSeasonLevel = null, prospectLevel = null,
  options = {}
) {
  const player = playersMap[playerId];
  const position = player?.position;
  const age = player?.age ?? null;
  const yearsExp = player?.years_exp ?? null;

  if (!player || !SKILL_POSITIONS.has(position)) {
    return { score: null, label: 'N/A', confidence: 'none', isRookie: false, components: null, signals: null };
  }

  const peakPPG = positionPeakPPG?.[position] ?? 20;
  const curve = empiricalCurves?.[position] ?? [];

  const peakAge = positionPeakAge?.[position] ?? derivePeakAge(curve, position).cappedPeakAge;
  const yearsFromPeak = peakAge != null && age != null ? age - peakAge : null;
  const isLateCareer = yearsFromPeak != null && yearsFromPeak >= 5;

  const allSeasons = Object.keys(careerStats).map(Number).sort();
  const seasonHistory = allSeasons
    .map(season => {
      const d = careerStats[season]?.[playerId];
      if (!d) return null;
      const gpRaw = d.gamesPlayed ?? 0;
      if (Number.isFinite(gpRaw) && gpRaw < 8) return null;
      if (!Number.isFinite(gpRaw) || !Number.isFinite(d.fantasyPoints)) return null;
      return { season, ppg: d.fantasyPoints / d.gamesPlayed, gamesPlayed: gpRaw, fantasyPoints: d.fantasyPoints };
    })
    .filter(Boolean);

  const mostRecentSeason = allSeasons[allSeasons.length - 1];
  const currentSeasonData = careerStats[mostRecentSeason] ?? {};
  const currentSeasonStats = currentSeasonData[playerId] ?? null;

  const ktcPct = ktcPositionPercentileMirror(playerId, position, ktcMap, playersMap);

  // PATH A: true prospect
  const hasKTC = ktcMap?.has?.(playerId) ?? false;
  const isTrueProspect =
    (yearsExp != null && yearsExp <= 1) ||
    (yearsExp != null && yearsExp <= 3 && seasonHistory.length === 0 && hasKTC);

  if (isTrueProspect) {
    const prospectEntry = (yearsExp === 0 || yearsExp === 1) ? (prospectLevel?.get(playerId) ?? null) : null;
    const prospect = prospectScoreMirror(player, dynastyDraftPick, currentSeasonStats, positionPeakPPG, ktcPct, positionBasisScale?.[position] ?? 1, prospectEntry);
    const ps = prospect.score;
    const dc = prospect.draftCapital;

    let label;
    if (ps >= 70 && age <= 22) label = 'Elite Prospect';
    else if (ps >= 70 && age <= 24) label = 'High Prospect';
    else if (ps >= 50) label = 'Prospect';
    else if (dc) label = 'Late Prospect';
    else label = 'Unranked Prospect';

    return {
      score: ps,
      label,
      confidence: 'prospect',
      isRookie: seasonHistory.length === 0,
      components: null,
      signals: {
        isBreakout: false,
        isBounceBack: false,
        isProspect: true,
        draftCapital: dc,
        gamesPlayed: prospect.gamesPlayed,
        seasonsOfData: seasonHistory.length,
        ageCurveFactor: null,
        peakSeason: null,
        ktcInfluenced: prospect.ktcInfluenced,
        prospectPriorKind: prospect.priorKind,
      },
    };
  }

  // PATH A2: unproven veteran
  if (yearsExp != null && yearsExp >= 2 && seasonHistory.length === 0) {
    const score = Math.round(15 + (ktcPct ?? 0) * 0.20);
    return {
      score,
      label: 'Limited Data',
      confidence: 'none',
      isRookie: false,
      components: null,
      signals: {
        isBreakout: false,
        isBounceBack: false,
        isProspect: false,
        isUnprovenVet: true,
        draftCapital: null,
        gamesPlayed: currentSeasonStats?.gamesPlayed ?? 0,
        seasonsOfData: 0,
        ageCurveFactor: null,
        peakSeason: null,
        ktcInfluenced: ktcPct != null,
      },
    };
  }

  // PATH A3: stale data
  const lastQS = seasonHistory[seasonHistory.length - 1]?.season ?? null;
  const seasonsSinceLastQS = lastQS != null ? mostRecentSeason - lastQS : Infinity;
  if (seasonHistory.length > 0 && seasonsSinceLastQS >= 2) {
    const score = Math.round(15 + (ktcPct ?? 0) * 0.20);
    return {
      score,
      label: 'Limited Data',
      confidence: 'none',
      isRookie: false,
      components: null,
      signals: {
        isBreakout: false,
        isBounceBack: false,
        isProspect: false,
        isStaleData: true,
        lastQualifyingSeason: lastQS,
        seasonsSinceLastQS,
        draftCapital: null,
        gamesPlayed: currentSeasonStats?.gamesPlayed ?? 0,
        seasonsOfData: seasonHistory.length,
        ageCurveFactor: null,
        peakSeason: null,
        ktcInfluenced: ktcPct != null,
      },
    };
  }

  // PATH A4: data gap
  if (seasonHistory.length === 0) {
    const score = Math.round(15 + (ktcPct ?? 0) * 0.20);
    return {
      score,
      label: 'Limited Data',
      confidence: 'none',
      isRookie: false,
      components: null,
      signals: {
        isBreakout: false,
        isBounceBack: false,
        isProspect: false,
        isDataGap: true,
        draftCapital: null,
        gamesPlayed: Number.isFinite(currentSeasonStats?.gamesPlayed) ? currentSeasonStats.gamesPlayed : 0,
        seasonsOfData: 0,
        ageCurveFactor: null,
        peakSeason: null,
        ktcInfluenced: ktcPct != null,
      },
    };
  }

  // Components (Paths B and C)

  // A. Age-adjusted
  const expectedMedianPPG = age != null ? interpolateAgeCurve(curve, age) : peakPPG * 0.7;
  const ageFactor = expectedMedianPPG / peakPPG;
  const currentPPG = seasonHistory[seasonHistory.length - 1].ppg;
  const levelPPG = lastQS >= mostRecentSeason - 1 && inSeasonLevel?.has(playerId) ? inSeasonLevel.get(playerId) : currentPPG;
  const rawRatio = ageFactor > 0 ? (levelPPG / peakPPG) / ageFactor : 0;
  const ageAdjScore = clamp(rawRatio * 50, 0, 100);

  // B. Trajectory
  const ppgs = seasonHistory.map(s => s.ppg);
  const meanPPG = ppgs.reduce((a, b) => a + b, 0) / ppgs.length;
  const xs = seasonHistory.map((_, i) => i);
  const slope = weightedLinearRegression(xs, ppgs);
  const normalizedSlope = meanPPG > 0 ? slope / meanPPG : 0;
  const trajectoryScore = clamp(50 + normalizedSlope * 150, 0, 100);

  const { momentum, momentumLabel } = momentumMirror(ppgs, meanPPG);

  // C. Current level
  const rankingPPG = recencyWeightedPPG(playerId, careerStats, allSeasons, inSeasonLevel);
  const positionRankingPPGs = Object.entries(currentSeasonData)
    .filter(([id, d]) => {
      const p = playersMap[id];
      return p && p.position === position && (d.gamesPlayed ?? 0) >= 8;
    })
    .map(([id]) => recencyWeightedPPG(id, careerStats, allSeasons, inSeasonLevel))
    .filter(v => v > 0)
    .sort((a, b) => a - b);
  const currentLevelScore = percentileRank(positionRankingPPGs, rankingPPG);

  // D. Reliability
  const { consistencyScore: consistencyRaw } = consistencyMirror(ppgs);
  const consistencyScore = consistencyRaw ?? 50;

  const allPlayerSeasons = allSeasons
    .map((season, idx) => {
      const d = careerStats[season]?.[playerId];
      return d && (d.gamesPlayed ?? 0) > 0
        ? { gamesPlayed: d.gamesPlayed, dnpWeeks: d.dnpWeeks ?? 0, weight: idx + 1 }
        : null;
    })
    .filter(Boolean);

  let durabilityScore = 50;
  let injurySeasonCount = 0;
  if (allPlayerSeasons.length > 0) {
    const totalWeight = allPlayerSeasons.reduce((s, { weight }) => s + weight, 0);
    const weightedAvgGames = allPlayerSeasons.reduce((s, { gamesPlayed, weight }) => s + gamesPlayed * weight, 0) / totalWeight;
    injurySeasonCount = allSeasons.filter(
      season => classifyInjurySeason(careerStats, playerId, position, season)
    ).length;
    let base = clamp((weightedAvgGames / 17) * 100, 0, 100);
    if (injurySeasonCount >= 3) base *= 0.70;
    else if (injurySeasonCount >= 2) base *= 0.85;
    durabilityScore = Math.round(base);
  }

  const mix = options.reliabilityMix ?? { consistency: 0.45, durability: 0.55 };
  const reliabilityScore = Math.round(consistencyScore * mix.consistency + durabilityScore * mix.durability);

  // E. Opportunity quality
  let playerShare = teamContext?.playerShares?.[playerId] ?? null;
  // Override REPLACES an existing WR/TE targetShare, never creates one (a player with no share keeps the app's
  // no-share 0.55/0.45 formula). Where it fires, the overridden value also appears in signals.targetShare
  // (signals report the share used).
  if (options.targetShareOverride && (position === 'WR' || position === 'TE') && options.targetShareOverride.has(playerId)
      && playerShare != null && playerShare.targetShare != null) {
    playerShare = { ...playerShare, targetShare: options.targetShareOverride.get(playerId) };
  }
  const { opportunityScore: rawOpportunityScore, efficiencyPercentile, volumePercentile, shareScore } =
    computeOpportunityQuality(playerId, position, seasonHistory, careerStats, playersMap, playerShare);

  const depthOrder = depthMap?.[playerId]?.depthOrder ?? null;
  let depthMultiplier = 1.0;
  if (depthOrder === 1) depthMultiplier = 1.15;
  else if (depthOrder === 2) depthMultiplier = 0.90;
  else if (depthOrder >= 3) depthMultiplier = 0.70;

  const depthAdjustedOQ = depthOrder != null
    ? Math.round(clamp(rawOpportunityScore * depthMultiplier, 0, 100))
    : rawOpportunityScore;

  const shareTrend = historicalShares ? shareTrendMirror(historicalShares[playerId]) : null;
  let shareTrendBoost = shareTrend
    ? shareTrend.shareTrendLabel === 'growing' ? 8
    : shareTrend.shareTrendLabel === 'expanding' ? 4
    : shareTrend.shareTrendLabel === 'shrinking' ? -4
    : shareTrend.shareTrendLabel === 'declining' ? -8
    : 0
    : 0;
  if (options.shareTrendBoostOff && options.shareTrendBoostOff(playerId)) shareTrendBoost = 0;
  const opportunityScore = Math.round(clamp(depthAdjustedOQ + shareTrendBoost, 0, 100));

  // TD dependency
  const mostRecentQualifyingSeason = seasonHistory[seasonHistory.length - 1].season;
  const mostRecentRawStats = careerStats[mostRecentQualifyingSeason]?.[playerId]?.stats ?? {};
  const mostRecentTotalFP = seasonHistory[seasonHistory.length - 1].fantasyPoints;

  const { tdDependency: tdDependencyRaw, isTdReliant } =
    tdRelianceMirror(mostRecentRawStats, mostRecentTotalFP, scoringSettings);
  const tdDependency = tdDependencyRaw ?? 0;

  const effectiveReliability = isTdReliant
    ? Math.round(reliabilityScore * 0.90)
    : reliabilityScore;

  // Composite
  const componentScore = Math.round(
    ageAdjScore * 0.28 +
    trajectoryScore * 0.25 +
    currentLevelScore * 0.22 +
    effectiveReliability * 0.10 +
    opportunityScore * 0.15
  );

  // PATH B
  let confidence;
  let finalScore = componentScore;
  let pathBKtcInfluenced = false;
  let prospectScoreRaw = null;
  if (seasonHistory.length <= 2) {
    const prospect = prospectScoreMirror(player, dynastyDraftPick, currentSeasonStats, positionPeakPPG, ktcPct, positionBasisScale?.[position] ?? 1);
    finalScore = Math.round(prospect.score * 0.4 + componentScore * 0.6);
    pathBKtcInfluenced = prospect.ktcInfluenced;
    prospectScoreRaw = prospect.score;
    confidence = 'low';
  } else {
    confidence = seasonHistory.length <= 4 ? 'moderate' : 'high';
  }

  if (!Number.isFinite(finalScore)) {
    const score = Math.round(15 + (ktcPct ?? 0) * 0.20);
    return {
      score,
      label: 'Limited Data',
      confidence: 'none',
      isRookie: false,
      components: null,
      signals: {
        isBreakout: false,
        isBounceBack: false,
        isProspect: false,
        isNonFinite: true,
        draftCapital: null,
        gamesPlayed: Number.isFinite(currentSeasonStats?.gamesPlayed) ? currentSeasonStats.gamesPlayed : 0,
        seasonsOfData: seasonHistory.length,
        ageCurveFactor: null,
        peakSeason: null,
        ktcInfluenced: ktcPct != null,
      },
    };
  }

  // Special signals
  const isBreakout = breakoutFlagMirror(age, currentPPG, curve, peakPPG);
  const isBounceBack = bounceBackFlagMirror(seasonHistory, careerStats, playerId, position);

  const peakEntry = seasonHistory.reduce((best, s) => s.ppg > (best?.ppg ?? 0) ? s : best, null);
  const peakSeason = peakEntry ? { season: peakEntry.season, ppg: Math.round(peakEntry.ppg * 10) / 10 } : null;

  const label = pickDynastyLabelMirror({ score: finalScore, isLateCareer, isBreakout, isBounceBack, slope, age, depthOrder });

  return {
    score: finalScore,
    label,
    confidence,
    isRookie: false,
    components: {
      ageAdjusted: { value: Math.round(ageAdjScore), weight: 0.28 },
      trajectory: { value: Math.round(trajectoryScore), slope: Math.round(normalizedSlope * 1000) / 1000, weight: 0.25 },
      currentLevel: { value: currentLevelScore, percentile: currentLevelScore, weight: 0.22 },
      reliability: { value: reliabilityScore, consistencyScore: Math.round(consistencyScore), durabilityScore, weight: 0.10 },
      opportunityQuality: { value: opportunityScore, efficiencyPercentile, volumePercentile, shareScore, weight: 0.15 },
    },
    signals: {
      isBreakout,
      isBounceBack,
      isProspect: false,
      draftCapital: dynastyDraftPick ?? null,
      seasonsOfData: seasonHistory.length,
      ageCurveFactor: Math.round(ageFactor * 100) / 100,
      peakSeason,
      injurySeasonCount,
      durabilityScore,
      consistencyScore: Math.round(consistencyScore),
      tdDependency: Math.round(tdDependency * 1000) / 1000,
      isTdReliant,
      momentum: momentum != null ? Math.round(momentum * 1000) / 1000 : null,
      momentumLabel,
      peakAge,
      yearsFromPeak,
      isLateCareer,
      slopeRaw: slope,
      age,
      ktcInfluenced: pathBKtcInfluenced,
      carryShare: playerShare?.carryShare ?? null,
      targetShare: playerShare?.targetShare ?? null,
      teamOffenseRank: playerShare?.teamOffenseRank ?? null,
      depthOrder,
      depthMultiplier: depthOrder != null ? depthMultiplier : null,
      shareTrendLabel: shareTrend?.shareTrendLabel ?? null,
      shareVolatility: shareTrend?.volatilityLabel ?? null,
      currentShare: shareTrend?.recentShare ?? null,
      shareHistory: historicalShares?.[playerId]?.slice(-5) ?? null,
    },
    raw: {
      ageAdjScore,
      trajectoryScore,
      currentLevelScore,
      reliabilityScore,
      effectiveReliability,
      consistencyScore,
      durabilityScore,
      opportunityScore,
      rawOpportunityScore,
      prospectScore: prospectScoreRaw,
      seasonsOfData: seasonHistory.length,
      currentPPG,
      isTdReliant,
    },
  };
}

// ─── QB-quality modifier (ablation A-QB only) — teamContext.js:50-152 ─────────────────────────────

/** teamContext.js:50-83, verbatim. */
export function qbQualityByTeamMirror(playerRows, depthMap = null, includeUnrostered = false) {
  const byTeam = {};

  for (const row of playerRows) {
    if (row.position !== 'QB' || !row.nfl_team) continue;
    if (includeUnrostered) {
      if (row.nfl_team === 'FA') continue;
    } else {
      if (row.ownerTeamName == null) continue;
    }

    const quality = row.dynastyScore?.score
      ?? (row.ktcValue != null ? Math.min(row.ktcValue / 100, 100) : null)
      ?? 50;

    const depthOrder = depthMap?.[row.player_id]?.depthOrder ?? null;
    const team = row.nfl_team;
    if (!byTeam[team]) byTeam[team] = [];
    byTeam[team].push({ quality, ppg: row.currentSeasonPPG ?? 0, depthOrder });
  }

  const result = {};
  for (const [team, qbs] of Object.entries(byTeam)) {
    const dcQB1 = qbs.find(q => q.depthOrder === 1);
    if (dcQB1) {
      result[team] = dcQB1.quality;
    } else {
      const best = qbs.reduce((b, q) => q.ppg > b.ppg ? q : b, qbs[0]);
      result[team] = best.quality;
    }
  }

  return result;
}

/** teamContext.js:102-152, verbatim. */
export function applyQBQualityModifierMirror(row, qbQualityByTeam) {
  const pos = row.position;
  const ds = row.dynastyScore;
  if (!ds?.components || pos === 'QB') return row;

  const qbScore = qbQualityByTeam[row.nfl_team];
  if (qbScore == null || !Number.isFinite(qbScore)) return row;

  const oq = ds.components.opportunityQuality;
  const carryShare = ds.signals?.carryShare ?? null;

  let modifier = null;
  if (pos === 'WR' || pos === 'TE') {
    modifier = 0.85 + (qbScore / 100) * 0.30;
  } else if (pos === 'RB' && carryShare != null && carryShare > 0.30) {
    modifier = 1.10 - (qbScore / 100) * 0.15;
  }

  if (modifier == null) return row;

  const oldOq = oq.value;
  const newOq = Math.round(Math.max(0, Math.min(100, oldOq * modifier)));
  const newScore = Math.round(Math.max(0, Math.min(100, ds.score + (newOq - oldOq) * 0.15)));
  const modPct = Math.round((modifier - 1) * 100);

  const sig = ds.signals ?? {};
  const label = 'slopeRaw' in sig
    ? pickDynastyLabelMirror({ score: newScore, isLateCareer: sig.isLateCareer, isBreakout: sig.isBreakout,
        isBounceBack: sig.isBounceBack, slope: sig.slopeRaw, age: sig.age, depthOrder: sig.depthOrder })
    : ds.label;

  return {
    ...row,
    dynastyScore: {
      ...ds,
      score: newScore,
      label,
      components: {
        ...ds.components,
        opportunityQuality: { ...oq, value: newOq },
      },
      signals: {
        ...ds.signals,
        qbQualityScore: Math.round(qbScore),
        qbModifierApplied: modPct,
      },
    },
  };
}
