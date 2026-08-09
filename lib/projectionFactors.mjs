/**
 * lib/projectionFactors.mjs — R3-FIT app-factor-multiplier reconstruction. Pure: no I/O.
 *
 * Cross-repo MIRROR CONTRACT (like lib/fantasyPoints.mjs mirrors the app's
 * src/utils/fantasyPoints.js) — see CLAUDE.md Cross-repo contracts and
 * .claude/tasks/r3fit-exponent-harness.md §3/§11. Each function below
 * reproduces one app factor's FULL input pipeline (transform + series/cohort
 * construction + upstream aggregation), not just its leaf transform, so that
 * an exponent fit on these reconstructed multipliers transports onto the
 * app's own multipliers. If the app changes any cited constant, gate, or
 * branch, this file must be re-read and re-synced or the fit stops
 * transporting.
 *
 * Mirrored app anchors (sleeper-dashboard, read-only, HEAD 6a52dc9):
 *   - src/utils/momentum.js:18-35                          (computeMomentum)
 *   - src/utils/seasonProjection.js:386-394                (momentum label → factor)
 *   - src/utils/regressionSignals.js:16-34,48-78            (weightedLinearRegression, computeTrajectory, computeConsistency)
 *   - src/utils/seasonProjection.js:363-384,461-465          (regression bucket + consistency dampener; trajectory clamp)
 *   - src/utils/teamContext.js:240-260                       (computeHistoricalTeamTotals — team-denominator builder)
 *   - src/utils/teamContext.js:269-308                       (computeHistoricalShares — share-series builder)
 *   - src/utils/teamContext.js:314-348                       (computeShareTrend — trend/volatility labels)
 *   - src/utils/seasonProjection.js:340-361,315-323           (shareTrend label→factor + volatility scale; basePPG weight table)
 *   - src/utils/usageMetrics.js:35-179                        (percentileRank, RZ_CONFIG, snapShare/rzUsage cohort+shrink)
 *   - src/utils/teamRzShare.js:29-169                         (percentileRank, RZ_SHARE_CONFIG, teamRzShare cohort+shrink+3dp round)
 *
 * Every exported reconstruct* function returns the app's computed 1.0 on its
 * sentinel conditions (never signals a row drop — sentinels are computed
 * neutrals, not drops; see task §3.0-B). Gates that live upstream of a
 * player's own value (position eligibility, missing stats/careerStats,
 * QB-gated-out) are the caller's (attachFactorMultipliers') responsibility —
 * these functions only see the pre-extracted numeric inputs a qualifying row
 * already has.
 */

import { TEAM_DENOM_MIN } from './backtest.mjs';

// ─── Shared helpers (duplicated per the app's own Thread-B precedent — each ──
// ─── app module duplicates these rather than importing a shared private util) ─

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// below/pool.length, *100, rounded — identical in usageMetrics.js and teamRzShare.js.
function percentileRank(sortedPool, value) {
  if (sortedPool.length === 0) return 50;
  let below = 0;
  for (const v of sortedPool) { if (v < value) below++; }
  return Math.round((below / sortedPool.length) * 100);
}

function sampleStdDev(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

// ─── Bucket factors — deterministic from the player's own qualifying history ──
// ─── (no cohort). §3.0-B rows 1-4.                                            ─

const MOMENTUM_LABEL_FACTOR = {
  accelerating: 1.08, improving: 1.04, stable: 1.00, slowing: 0.96, decelerating: 0.92,
};

// <4 qualifying → 1.0 (§3.0-B1). meanPPG is the caller's careerAvg (mean of
// ALL qualifying ppgs) — momentum.js:18-35.
export function reconstructMomentumFactor(ppgs, meanPPG) {
  if (!Array.isArray(ppgs) || ppgs.length < 4) return 1.00;
  const n = ppgs.length;
  const recentAvg = (ppgs[n - 1] + ppgs[n - 2]) / 2;
  const priorAvg = (ppgs[n - 3] + ppgs[n - 4]) / 2;
  const momentum = (recentAvg - priorAvg) / Math.max(meanPPG, 1);
  const label =
    momentum > 0.20 ? 'accelerating'
      : momentum > 0.05 ? 'improving'
      : momentum >= -0.05 ? 'stable'
      : momentum >= -0.20 ? 'slowing'
      : 'decelerating';
  return MOMENTUM_LABEL_FACTOR[label] ?? 1.00;
}

const CONSISTENCY_SCALE = { steady: 0.50, moderate: 0.80, erratic: 1.00 };

// No sentinel — always computed (§3.0-B2). <3 qualifying → consistencyScale
// stays 1.00 (undampened, NOT a flat 1.0 factor) — regressionSignals.js:72-78,
// seasonProjection.js:363-384. meanPPG is the caller's careerAvg over the same
// ppgs array computeConsistency would use internally — reused, not recomputed,
// since both are the mean of the identical qualifying-ppg array.
export function reconstructRegressionFactor(ppgs, meanPPG, lastPPG) {
  const outlierRatio = lastPPG / Math.max(meanPPG, 1);
  let regressionFactorRaw;
  if (outlierRatio > 1.35) regressionFactorRaw = 0.88;
  else if (outlierRatio > 1.15) regressionFactorRaw = 0.95;
  else if (outlierRatio < 0.65) regressionFactorRaw = 1.12;
  else if (outlierRatio < 0.85) regressionFactorRaw = 1.05;
  else regressionFactorRaw = 1.00;

  let consistencyScale = 1.00;
  if (Array.isArray(ppgs) && ppgs.length >= 3) {
    const cv = meanPPG > 0 ? sampleStdDev(ppgs) / meanPPG : 1;
    const consistencyScore = clamp(100 - cv * 100, 0, 100);
    const band = consistencyScore >= 80 ? 'steady' : consistencyScore >= 60 ? 'moderate' : 'erratic';
    consistencyScale = CONSISTENCY_SCALE[band] ?? 1.00;
  }
  return 1.0 + (regressionFactorRaw - 1.0) * consistencyScale;
}

// Weights ws[i] = i+1 over xs = [0..n-1] — byte-identical to
// regressionSignals.js's weightedLinearRegression (dynastyScore.js's copy
// unfloored; this one floors the normalization denominator at 4).
function weightedLinearRegressionSlope(ys) {
  const xs = ys.map((_, i) => i);
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

// <2 qualifying, or non-finite slope/normalizedSlope → 1.0 (§3.0-B3).
export function reconstructTrajectoryFactor(ppgs) {
  if (!Array.isArray(ppgs) || ppgs.length < 2) return 1.00;
  const meanPPG = ppgs.reduce((a, b) => a + b, 0) / ppgs.length;
  const slope = weightedLinearRegressionSlope(ppgs);
  const normalizedSlope = slope / Math.max(meanPPG, 4);
  if (!Number.isFinite(slope) || !Number.isFinite(normalizedSlope)) return 1.00;
  return clamp(1.0 + normalizedSlope * 0.35, 0.93, 1.07);
}

const SHARE_TREND_LABEL_FACTOR = {
  growing: 1.08, expanding: 1.04, stable: 1.00, shrinking: 0.96, declining: 0.92,
};
const SHARE_VOLATILITY_SCALE = { entrenched: 1.00, moderate: 0.80, volatile: 0.50 };

// <2 series entries → 1.0 (§3.0-B4). Does NOT apply forward-mover
// (isTeamChange) neutralization — that is handled externally by
// attachFactorMultipliers (§3.6), identically for shareTrend and teamRzShare.
export function reconstructShareTrendMultiplier(shareSeries) {
  if (!Array.isArray(shareSeries) || shareSeries.length < 2) return 1.00;
  const recentShare = shareSeries[shareSeries.length - 1].share;

  const prior = shareSeries.slice(0, -1);
  const p1 = prior[prior.length - 1]?.share ?? null;
  const p2 = prior[prior.length - 2]?.share ?? null;
  const p3 = prior[prior.length - 3]?.share ?? null;
  const w1 = p1 != null ? 0.50 : 0;
  const w2 = p2 != null ? 0.30 : 0;
  const w3 = p3 != null ? 0.20 : 0;
  const totalW = w1 + w2 + w3;
  const priorShare = ((p1 ?? 0) * w1 + (p2 ?? 0) * w2 + (p3 ?? 0) * w3) / totalW;

  const trend = (recentShare - priorShare) / Math.max(priorShare, 0.01);
  const label =
    trend > 0.20 ? 'growing'
      : trend > 0.05 ? 'expanding'
      : trend >= -0.05 ? 'stable'
      : trend >= -0.20 ? 'shrinking'
      : 'declining';

  const shares = shareSeries.map(s => s.share);
  const mean = shares.reduce((a, b) => a + b, 0) / shares.length;
  const shareVolatility = Math.sqrt(shares.reduce((s, v) => s + (v - mean) ** 2, 0) / (shares.length - 1));
  const volatilityLabel = shareVolatility < 0.05 ? 'entrenched' : shareVolatility <= 0.10 ? 'moderate' : 'volatile';

  const shareTrendRaw = SHARE_TREND_LABEL_FACTOR[label] ?? 1.00;
  const volScale = SHARE_VOLATILITY_SCALE[volatilityLabel] ?? 1.00;
  return 1.0 + (shareTrendRaw - 1.0) * volScale;
}

// ─── shareTrend's INPUT SERIES — mirrors computeHistoricalShares ──────────────
// ─── (teamContext.js:269-308), NOT the panel's own computeShare (§3.4).       ─

// Per-season drops are SERIES drops (never row drops). `position` is resolved
// once at Y by the caller and applied to every season (mirrors the app
// reading one playersMap[pid].position for the whole series, §3.0-C2).
// `totalsByYear[s][pid].team` is read directly (per-season-team; no
// current-team fallback — the §3.0-C1 residual). Denominators come from the
// same per-year buildTeamTotalsForSeason build §3.2 uses (entity-filtered,
// extended with the `rec` accumulator — §6.2).
export function reconstructShareSeries({ pid, position, seasons, totalsByYear, teamTotalsByYear }) {
  const series = [];
  const dropped = { belowGp8: 0, nullTeam: 0, noTeamEntry: 0, zeroOwnVolume: 0, nonFinite: 0 };
  let recFallbackUsed = 0;
  let subMinDenomKept = 0;
  let shareGtOne = 0;

  const sorted = [...seasons].sort((a, b) => a - b);
  for (const s of sorted) {
    const rec = totalsByYear[s]?.[pid];
    if (!rec || (rec.gamesPlayed ?? 0) < 8) { dropped.belowGp8++; continue; }

    const team = rec.team ?? null;
    if (team == null) { dropped.nullTeam++; continue; }

    const teamTotals = teamTotalsByYear[s]?.totals?.[team];
    if (!teamTotals) { dropped.noTeamEntry++; continue; }

    const stats = rec.stats ?? {};
    let share = null;
    let usedFallback = false;
    let denom = null;

    if (position === 'RB') {
      const rushAtt = stats.rush_att ?? 0;
      if (rushAtt > 0) {
        denom = teamTotals.rushAtt ?? 0;
        share = rushAtt / Math.max(denom, 1);
      }
    } else {
      const recTgt = stats.rec_tgt ?? 0;
      if (recTgt > 0 && (teamTotals.recTgt ?? 0) > 0) {
        denom = teamTotals.recTgt ?? 0;
        share = recTgt / Math.max(denom, 1);
      } else {
        const recVal = stats.rec ?? 0;
        if (recVal > 0) {
          denom = teamTotals.rec ?? 0;
          share = recVal / Math.max(denom, 1);
          usedFallback = true;
        }
      }
    }

    if (share == null) { dropped.zeroOwnVolume++; continue; }
    if (!Number.isFinite(share)) { dropped.nonFinite++; continue; }

    if (usedFallback) recFallbackUsed++;
    if (denom != null && denom < TEAM_DENOM_MIN) subMinDenomKept++; // no floor here — kept, just counted (§3.4 step 5)
    if (share > 1) shareGtOne++; // kept — the app only warns (teamContext.js:301)

    series.push({ season: s, share: Math.round(share * 1000) / 1000, gamesPlayed: rec.gamesPlayed });
  }

  return { series, dropped, recFallbackUsed, subMinDenomKept, shareGtOne };
}

// ─── Cohort-percentile factors — player counts from lastQ.season, pool from ──
// ─── season Y (§3.2). §3.0-B rows 5-7.                                        ─

const SNAP_SHRINK_K = 200;

// off_snp null, tm_off_snp null or ≤0, or non-finite ratio → 1.0 (§3.0-B5).
// QB-gated-out and empty-pools-map gates are upstream (caller never calls this
// for QB rows). Empty cohortSnapShares washes out to pct=50 → factor 1.0 by
// construction (usageMetrics.js:129-155).
export function reconstructSnapShareFactor({ offSnp, tmOffSnp }, cohortSnapShares) {
  if (offSnp == null || tmOffSnp == null || tmOffSnp <= 0) return 1.00;
  const raw = offSnp / tmOffSnp;
  if (!Number.isFinite(raw)) return 1.00;
  const pool = cohortSnapShares ?? [];
  const pct = pool.length > 0 ? percentileRank(pool, raw) : 50;
  const shrunkPct = (offSnp * pct + SNAP_SHRINK_K * 50) / (offSnp + SNAP_SHRINK_K);
  const index = (shrunkPct - 50) / 50;
  return clamp(1 + index * 0.06, 0.94, 1.06);
}

// shrinkK per position — usageMetrics.js:58-64 RZ_CONFIG (QB pass_rz_att/
// pass_att 50/80; RB rush_rz_att/rush_att 30/40; WR/TE rec_rz_tgt/rec_tgt
// 20/25). minOpp gates the POOL only, never the player's own value — the
// player-side gate is `opp ≤ 0` alone (asymmetric with teamRzShare below).
const RZ_SHRINK_K = { QB: 80, RB: 40, WR: 25, TE: 25 };

// opp null/≤0, or non-finite ratio → 1.0 (§3.0-B6). rzOwn is the `?? 0`
// numerator coalescence (usageMetrics.js:165) — an absent RZ key with a
// positive opp is a real rate of 0, not a sentinel and not a drop.
export function reconstructRzUsageFactor({ rzOwn, opp }, cohortRates, position) {
  if (opp == null || opp <= 0) return 1.00;
  const own = rzOwn ?? 0;
  const raw = own / opp;
  if (!Number.isFinite(raw)) return 1.00;
  const shrinkK = RZ_SHRINK_K[position];
  const pool = cohortRates ?? [];
  const pct = pool.length > 0 ? percentileRank(pool, raw) : 50;
  const shrunkPct = (opp * pct + shrinkK * 50) / (opp + shrinkK);
  const index = (shrunkPct - 50) / 50;
  return clamp(1 + index * 0.05, 0.95, 1.05);
}

// teamRzShare.js:44-49 RZ_SHARE_CONFIG (RB rush_rz_att/rush_att 30/40;
// WR/TE rec_rz_tgt/rec_tgt 20/25). QB has no entry — F_QB^full excludes
// teamRzShare structurally (§5); the caller never calls this for QB.
const RZ_SHARE_MIN_OPP = { RB: 30, WR: 20, TE: 20 };
const RZ_SHARE_SHRINK_K = { RB: 40, WR: 25, TE: 25 };

// teamDenom < MIN_TEAM_DENOM(20), or opp < cfg.minOpp → 1.0 (§3.0-B7).
// UNLIKE rzUsage, this factor DOES gate the player's own `opp` against
// `minOpp` (teamRzShare.js:151) — asymmetric with row 6 above. Returns the
// factor ROUNDED TO 3DP (teamRzShare.js:166) — asymmetric with snapShare/
// rzUsage, which round only the rate, not the factor (§0.3 item 56).
export function reconstructTeamRzShareFactor({ rzOwn, opp, teamDenom }, cohortShares, position) {
  if (teamDenom == null || teamDenom < TEAM_DENOM_MIN) return 1.00;
  const minOpp = RZ_SHARE_MIN_OPP[position];
  if (opp == null || opp < minOpp) return 1.00;
  const own = rzOwn ?? 0;
  const share = own / teamDenom;
  if (!Number.isFinite(share)) return 1.00;
  const shrinkK = RZ_SHARE_SHRINK_K[position];
  const pool = cohortShares ?? [];
  const pct = pool.length > 0 ? percentileRank(pool, share) : 50;
  const shrunkPct = (opp * pct + shrinkK * 50) / (opp + shrinkK);
  const index = (shrunkPct - 50) / 50;
  const factor = clamp(1 + index * 0.05, 0.95, 1.05);
  return Math.round(factor * 1000) / 1000;
}

// ─── basePPG anchor — app-faithful Step-1, per-length weight table ────────────

// Per-length weight table {3:[.20,.30,.50], 2:[.30,.70], 1:[1.00]}
// (seasonProjection.js:317-319), with the literal wSum division replicated
// (NOT a hardcoded [0.4,0.6] renormalization at length 2 — §0.3 item 19).
// Bit-parity: 0.3+0.7 !== 1 in IEEE754, so replicate w/wSum literally rather
// than assuming normalized constants (§3.1 note, §0.3 item 31).
export function reconstructBasePPG(qualifyingSeasons) {
  if (!Array.isArray(qualifyingSeasons) || qualifyingSeasons.length === 0) return null;
  const recent = qualifyingSeasons.slice(-3);
  const weightsRaw = recent.length === 3 ? [0.20, 0.30, 0.50]
    : recent.length === 2 ? [0.30, 0.70]
      : [1.00];
  const wSum = weightsRaw.reduce((a, b) => a + b, 0);
  const weights = weightsRaw.map(w => w / wSum);
  return recent.reduce((acc, s, i) => acc + s.ppg * weights[i], 0);
}

// ─── Registry — the single extension point ────────────────────────────────────

export const FACTOR_RECONSTRUCTORS = {
  momentum: { positions: ['QB', 'RB', 'WR', 'TE'], kind: 'bucket', fn: reconstructMomentumFactor },
  regression: { positions: ['QB', 'RB', 'WR', 'TE'], kind: 'bucket', fn: reconstructRegressionFactor },
  trajectory: { positions: ['QB', 'RB', 'WR', 'TE'], kind: 'bucket', fn: reconstructTrajectoryFactor },
  shareTrend: { positions: ['RB', 'WR', 'TE'], kind: 'bucket', fn: reconstructShareTrendMultiplier },
  snapShare: { positions: ['RB', 'WR', 'TE'], kind: 'cohort', fn: reconstructSnapShareFactor },
  rzUsage: { positions: ['QB', 'RB', 'WR', 'TE'], kind: 'cohort', fn: reconstructRzUsageFactor },
  teamRzShare: { positions: ['RB', 'WR', 'TE'], kind: 'cohort', fn: reconstructTeamRzShareFactor },
};
