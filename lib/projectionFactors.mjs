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

// ─── D6a — six additional reconstructions (age/depth/teamOffense/qbQuality/ ──
// ─── efficiency/compBlend). Per fullpipeline-harness.md finding 1, these are ──
// ─── NOT dispatched through FACTOR_RECONSTRUCTORS below (nothing in production ─
// ─── reads that object) — each is wired as its own branch in ──────────────────
// ─── attachFactorMultipliers (lib/panel.mjs), with its inputs threaded into ───
// ─── ctx there. The registry entries at the bottom of this file are updated ───
// ─── for documentation only. ───────────────────────────────────────────────────

// ─── Age (Step 2) — dynastyScore.js:59-128 (computeEmpiricalAgeCurves) + ──────
// ─── ageCurve.js:12-25 (interpolateAgeCurve) + seasonProjection.js:325-338 ────
// ─── (ageDelta formula). ───────────────────────────────────────────────────────
//
// DEVIATION (stated per fullpipeline-harness.md §Design/A): the app computes a
// player's age from Sleeper's own live `player.age` field (today's wall-clock
// age, re-derived every session) — there is no per-season-accurate birthdate
// anywhere in the app, and no year-cutoff parameter on the curve builder
// itself (the "<=Y data only" constraint is achieved entirely by what
// careerStats object the CALLER passes in). The reconstruction instead
// computes age at season s from D2's nflverse/playerids.json crosswalk
// (bySleeper[pid].birthdate, 'YYYY-MM-DD'): ageAtSeason = s - birthYear.
// Missing birthdate -> null age -> neutral 1.0 (finding 8 — the documented
// sentinel convention, not a row drop).

const PEAK_AGE_CAPS = { QB: 32, RB: 25, WR: 28, TE: 29 };
const AGE_SKILL_POSITIONS = ['QB', 'RB', 'WR', 'TE'];

function birthYearOf(birthdate) {
  if (typeof birthdate !== 'string') return null;
  const m = /^(\d{4})-/.exec(birthdate);
  return m ? parseInt(m[1], 10) : null;
}

// Exported for the T-F-age leakage guard + coverage counting.
export function ageAtSeason(birthdate, season) {
  const by = birthYearOf(birthdate);
  return by == null ? null : season - by;
}

function medianOf(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// Builds one empirical age curve (median PPG per age, 3-point rolling average)
// PER POSITION plus positionPeakPPG/positionPeakAge, from qualifyingRows the
// caller has ALREADY restricted to seasons <= Y (mirrors the app's own
// no-cutoff-parameter design — dynastyScore.js:59-128). qualifyingRows:
// [{ pid, position, season, ppg, gamesPlayed }]. birthdateOf: pid -> birthdate|null.
// Gates mirrored exactly: gamesPlayed>=10 (:65), age in [18,42] (:71), finite ppg.
export function reconstructAgeCurves(qualifyingRows, birthdateOf) {
  const byPositionAge = {};
  for (const r of qualifyingRows) {
    if (!AGE_SKILL_POSITIONS.includes(r.position)) continue;
    if ((r.gamesPlayed ?? 0) < 10) continue;
    if (!Number.isFinite(r.ppg)) continue;
    const age = ageAtSeason(birthdateOf(r.pid), r.season);
    if (age == null || age < 18 || age > 42) continue;
    const key = `${r.position}|${age}`;
    (byPositionAge[key] ??= []).push(r.ppg);
  }

  const curves = {};
  const positionPeakPPG = {};
  const positionPeakAge = {};

  for (const position of AGE_SKILL_POSITIONS) {
    const points = [];
    for (const [key, ppgs] of Object.entries(byPositionAge)) {
      const [pos, ageStr] = key.split('|');
      if (pos !== position) continue;
      points.push({ age: parseInt(ageStr, 10), medianPPG: medianOf(ppgs) });
    }
    points.sort((a, b) => a.age - b.age);

    const smoothed = points.map((p, i) => {
      const window = points.slice(Math.max(0, i - 1), Math.min(points.length, i + 2));
      const avg = window.reduce((s, w) => s + w.medianPPG, 0) / window.length;
      return { age: p.age, medianPPG: avg };
    });
    curves[position] = smoothed;

    if (smoothed.length === 0) {
      positionPeakPPG[position] = 1;
      positionPeakAge[position] = null;
      continue;
    }
    const cap = PEAK_AGE_CAPS[position];
    let derivedPeak = smoothed[0];
    for (const p of smoothed) if (p.medianPPG > derivedPeak.medianPPG) derivedPeak = p;
    const cappedPeakAge = Math.min(derivedPeak.age, cap);
    let cappedPoint = smoothed[0];
    for (const p of smoothed) {
      if (Math.abs(p.age - cappedPeakAge) < Math.abs(cappedPoint.age - cappedPeakAge)) cappedPoint = p;
    }
    positionPeakPPG[position] = Math.max(cappedPoint.medianPPG, 1);
    positionPeakAge[position] = cappedPeakAge;
  }

  return { curves, positionPeakPPG, positionPeakAge };
}

// ageCurve.js:12-25 — linear interpolation between bracketing curve points,
// clamped to the nearest endpoint outside range; empty curve -> 0.
export function interpolateAgeCurve(curve, age) {
  if (!Array.isArray(curve) || curve.length === 0) return 0;
  if (age <= curve[0].age) return curve[0].medianPPG;
  if (age >= curve[curve.length - 1].age) return curve[curve.length - 1].medianPPG;
  for (let i = 0; i < curve.length - 1; i++) {
    const a = curve[i], b = curve[i + 1];
    if (age >= a.age && age <= b.age) {
      if (b.age === a.age) return a.medianPPG;
      const t = (age - a.age) / (b.age - a.age);
      return a.medianPPG + t * (b.medianPPG - a.medianPPG);
    }
  }
  return 0;
}

// seasonProjection.js:325-338. age==null, empty curve, or cur<=0 -> 1.0 (neutral).
export function reconstructAgeFactor(age, curve, peakPPG) {
  if (age == null || !Array.isArray(curve) || curve.length === 0) return 1.0;
  const cur = interpolateAgeCurve(curve, age);
  if (!(cur > 0)) return 1.0;
  const next = interpolateAgeCurve(curve, age + 1);
  const peak = peakPPG ?? 1;
  const curFactor = cur / Math.max(peak, 1);
  const nextFactor = next / Math.max(peak, 1);
  return clamp(nextFactor / Math.max(curFactor, 0.01), 0.80, 1.10);
}

// ─── Depth (Step 8) — no app port needed: the app reads Sleeper's live ────────
// ─── depth_chart_order verbatim (seasonProjection.js:549-561); there is no ────
// ─── standalone depth-VALUE function to mirror, only the branch below. ────────
// Source is D5 (nflverse/depth/<year>.json), which the caller resolves to one
// depthOrder for (pid, lastQSeason). null (unresolved join, unmapped, or no
// entry for that team) -> neutral, NEVER re-indexed (a null is never promoted
// to fill a gap — data-catalog.md D5 Null-semantics note). DEVIATION, stated:
// D5's legacy-era (pre-2025) depthPositions/depth order ranks WITHIN
// depth_position (the roster slot) where ESPN-era (2025+) and the app both
// rank within the position group — the two eras measure different things
// (data-catalog.md D5 finding 6); this reconstruction takes the served
// ordinal as-is across both eras and does not attempt to reconcile them.
export function reconstructDepthFactor(depthOrder, recentStarterEvidence) {
  const depthStale = depthOrder != null && depthOrder >= 2 && recentStarterEvidence === true;
  if (depthStale) return 1.00;
  if (depthOrder === 1) return 1.05;
  if (depthOrder === 2) return 0.88;
  if (depthOrder != null && depthOrder >= 3) return 0.68;
  return 1.00; // null/missing-team -> neutral
}

// ─── Team offense (Step 7) — teamContext.js:154-225 computeTeamContext, rank ──
// ─── branch only (:175-187). Per-season-team attribution (resolveAttributedTeam, ─
// ─── teamContext.js:18-21) — caller resolves team via the panel's own ─────────
// ─── per-season-team teamOf, matching finding 7. ──────────────────────────────
// Rank = 1-based descending sort of team total fantasyPoints among that
// season's teams. Missing/absent rank -> the app's own default rank 16
// (mid-pack) -> neutral 1.0 by construction (seasonProjection.js:546-547).
//
// OPEN PARITY GAP (reported, not closed — see test/panel-fit.test.mjs's
// diagnostic-only parity test): reconstructing the rank via a straight sum of
// season-totals fantasyPoints per team (buildTeamOffenseRanks, lib/panel.mjs)
// diverges from the app's committed 2026-07-05 snapshot teamFactor by more
// than population noise can explain for a meaningful share of a 48-player
// sample — several teams off by 8-10+ rank slots, not the 1-3 slots a
// roster-completeness gap would predict. Restricting the sum to skill
// positions only narrows but does not close it. The formula itself
// (1.0 + (16-rank)/200) is unchanged and matches seasonProjection.js:546-547
// exactly; the divergence is in what population/quantity the rank is computed
// over, which this slice did not resolve. Flagged for plan-reviewer/Session 1
// before D6b treats this factor's coverage as trustworthy.
export function reconstructTeamOffenseFactor(teamRank) {
  const rank = teamRank ?? 16;
  return 1.0 + (16 - rank) / 200;
}

// ─── QB1 quality (Step 7b) — teamContext.js:48-81 computeQBQualityByTeam. ─────
// Never applies to QB rows (the app gates position!=='QB', seasonProjection.js:565).
// DEVIATION, stated: the app's primary quality metric is
// `dynastyScore?.score ?? ktcValue/100 ?? 50` — dynastyScore is a ~1000-line
// composite engine with no standalone formula to port. This reconstruction
// always takes the app's own dynastyScore-absent fallback path (quality
// argument is caller-supplied, expected null for the entire 2013-2025 panel
// since KTC history starts 2026-05-18 — see coverage note in the branch), so
// qbQualityFactor is structurally ~1.0 (neutral) across the fit window. QB1
// IDENTITY still uses the app's real selection rule: prefer depthOrder===1
// (D5), else whichever rostered QB has the highest PPG (the app's own
// fallback, teamContext.js:70-73) — the caller resolves identity before
// calling this with that QB's `quality`.
export function reconstructQbQualityFactor(quality) {
  const q = quality ?? 50;
  if (!Number.isFinite(q)) return 1.0;
  return 1.0 + (q - 50) / 100 * 0.10;
}

// ─── Efficiency (Step 5e) — efficiencyMetrics.js (full file). Per-position ────
// ─── weighted metric table (:53-70), cohort percentile + sample-size shrink ───
// ─── (matches the app's own shrinkK ladder), clamp [0.90,1.10]. ───────────────
function passerRatingComponent(s) {
  const att = s.pass_att ?? 0;
  const cmp = s.pass_cmp;
  if (att <= 0 || cmp == null) return null;
  const yd = s.pass_yd ?? 0, td = s.pass_td ?? 0, intc = s.pass_int ?? 0;
  const cl = x => Math.max(0, Math.min(2.375, x));
  const a = cl(((cmp / att) - 0.3) * 5);
  const b = cl(((yd / att) - 3) * 0.25);
  const c = cl((td / att) * 20);
  const d = cl(2.375 - (intc / att) * 25);
  return ((a + b + c + d) / 6) * 100;
}

// oppKey/shrinkK/weight per metric — efficiencyMetrics.js:53-70. Shared by
// buildCohortPools' efficiency-pool builder (lib/panel.mjs) and this factor's
// per-row extraction — one constant, two call sites (mirrors RZ_OWN_KEYS/
// RZ_SHARE_KEYS's own precedent).
export const EFFICIENCY_METRICS = {
  QB: [{ name: 'passerRating', weight: 1.0, oppKey: 'pass_att', shrinkK: 80, ratio: passerRatingComponent }],
  RB: [
    { name: 'ypc', weight: 0.80, oppKey: 'rush_att', shrinkK: 40, ratio: s => (s.rush_yd ?? 0) / (s.rush_att ?? 0) },
    { name: 'rushTdRate', weight: 0.20, oppKey: 'rush_att', shrinkK: 40, ratio: s => (s.rush_td ?? 0) / (s.rush_att ?? 0) },
  ],
  WR: [
    { name: 'ypt', weight: 0.45, oppKey: 'rec_tgt', shrinkK: 25, ratio: s => (s.rec_yd ?? 0) / (s.rec_tgt ?? 0) },
    { name: 'catchRate', weight: 0.25, oppKey: 'rec_tgt', shrinkK: 25, ratio: s => (s.rec ?? 0) / (s.rec_tgt ?? 0) },
    { name: 'ypr', weight: 0.10, oppKey: 'rec', shrinkK: 15, ratio: s => (s.rec_yd ?? 0) / (s.rec ?? 0) },
    { name: 'recTdRate', weight: 0.20, oppKey: 'rec_tgt', shrinkK: 25, ratio: s => (s.rec_td ?? 0) / (s.rec_tgt ?? 0) },
  ],
};
EFFICIENCY_METRICS.TE = EFFICIENCY_METRICS.WR;

// Pool-membership opportunity floor per oppKey — efficiencyMetrics.js:74 MIN_COHORT_OPPS.
export const EFFICIENCY_MIN_COHORT_OPPS = { pass_att: 50, rush_att: 30, rec_tgt: 20, rec: 12 };

// !config or !lastQStats, or every metric has opps<=0/non-finite ratio -> 1.0 (neutral).
export function reconstructEfficiencyFactor(position, lastQStats, cohortPoolsByMetric) {
  const config = EFFICIENCY_METRICS[position];
  if (!config || !lastQStats) return 1.0;
  const available = [];
  for (const m of config) {
    const opps = lastQStats[m.oppKey] ?? 0;
    if (opps <= 0) continue;
    const raw = m.ratio(lastQStats);
    if (raw == null || !Number.isFinite(raw)) continue;
    const pool = cohortPoolsByMetric?.[m.name] ?? [];
    const pct = pool.length > 0 ? percentileRank(pool, raw) : 50;
    const shrunkPct = (opps * pct + m.shrinkK * 50) / (opps + m.shrinkK);
    const sub = (shrunkPct - 50) / 50;
    available.push({ weight: m.weight, sub });
  }
  if (available.length === 0) return 1.0;
  const wSum = available.reduce((a, x) => a + x.weight, 0);
  const efficiencyIndex = available.reduce((a, x) => a + (x.weight / wSum) * x.sub, 0);
  return clamp(1 + efficiencyIndex * 0.10, 0.90, 1.10);
}

// ─── Comp blend (Step 9) — compsIntegration.js:27-66 (computeCompBlend) + ─────
// ─── careerComps.js (buildCareerArcVector :8-23, findCareerComps :58-108, ─────
// ─── compsProjectedPPG :117-128). ─────────────────────────────────────────────
//
// ARCHITECTURE DEVIATION (decided, not improvised — see hand-back): the app's
// comp blend is NOT a multiplier. It is a post-hoc convex combination applied
// to the already-finished pipelinePPG:
//   blendedPPG = alpha*pipelinePPG + (1-alpha)*compPPG, alpha = 1-compBlendWeight
// with no exponent under which "blendedPPG^w" or a log-additive term means
// anything coherent. Per the decision recorded in the task hand-back, this is
// represented as a SYNTHETIC RATIO FACTOR compBlend = blendedPPG/pipelinePPG so
// it fits this harness's Π f_i^w_i architecture (a FULL_FACTORS entry, per
// finding 1) — this is a stated deviation from the app's true mechanism, not a
// faithful reconstruction, and it is ORDER-DEPENDENT: pipelinePPG must be the
// row's fully-reconstructed product of every OTHER factor, so this must be the
// LAST factor computed for a row (attachFactorMultipliers enforces this).
//
// pipelineConfidence ('low'/'medium'/'high' -> pipelineUncertainty
// {1.0,0.6,0.25}) has no analogue anywhere in this reconstruction. Per the
// same decision, it is PINNED at 'medium' (0.6) for every row — stated, not
// silently assumed.
const MAX_COMP_WEIGHT = 0.35;
export const COMP_BLEND_PIPELINE_UNCERTAINTY_FIXED = 0.6; // pinned 'medium' — see deviation note above

// careerArcVector — normalized PPG per qualifying career-year (index order,
// not calendar year), clamped [0,1.5] (careerComps.js:8-23). qualifyingPpgs is
// the caller's own qualifyingSeasons.ppg array, already restricted to <= Y.
export function buildCareerArcVector(qualifyingPpgs, peakPPG) {
  const peak = peakPPG ?? 20;
  return qualifyingPpgs.map(ppg => Math.min(ppg / Math.max(peak, 1), 1.5));
}

// careerComps.js:31-42. Euclidean distance over the overlapping prefix; <2
// overlap -> similarity 0.
function computeArcSimilarity(a, b) {
  const overlapLen = Math.min(a.length, b.length);
  if (overlapLen < 2) return 0;
  let sumSq = 0;
  for (let i = 0; i < overlapLen; i++) sumSq += (a[i] - b[i]) ** 2;
  return 1 / (1 + Math.sqrt(sumSq));
}

// careerComps.js:58-108. candidates: [{ pid, vector }] — same position, ALREADY
// restricted to seasons <= Y for every candidate (the caller's career-arc
// population); candidate must have >= target's career length (so it has a
// "subsequent" tail); similarity floor 0.6; top topN by similarity desc.
export function findReconstructedCareerComps(targetVector, candidates, topN = 3) {
  if (targetVector.length < 2) return [];
  const scored = [];
  for (const c of candidates) {
    if (c.vector.length < targetVector.length) continue;
    const candidateSlice = c.vector.slice(0, targetVector.length);
    const similarity = computeArcSimilarity(targetVector, candidateSlice);
    if (similarity < 0.6) continue;
    scored.push({ pid: c.pid, similarity: Math.round(similarity * 100), theirSubsequentSeasons: c.vector.slice(targetVector.length) });
  }
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, topN);
}

// careerComps.js:117-128. null if no comp contributed a subsequent-season value.
export function compsProjectedPPG(comps, peakPPG) {
  const peak = peakPPG ?? 20;
  const values = [];
  for (const comp of comps) {
    const next2 = (comp.theirSubsequentSeasons ?? []).slice(0, 2);
    for (const v of next2) values.push(v * peak);
  }
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

// compsIntegration.js:27-66, returning the synthetic ratio (see deviation note
// above) plus diagnostic fields for coverage. eligible = compPPG!=null &&
// nComps>=1 && subseasonCount>=2 (subseasonCount capped at 2 per comp) -> else
// factor=1.0 (the app's own "blendedPPG=pipelinePPG unchanged" branch).
export function reconstructCompBlendFactor(comps, peakPPG, pipelinePPG) {
  const nComps = comps.length;
  const compPPG = compsProjectedPPG(comps, peakPPG);
  const avgSim = nComps > 0 ? Math.round(comps.reduce((s, c) => s + c.similarity, 0) / nComps) : null;
  let subseasonCount = 0;
  for (const c of comps) subseasonCount += Math.min(c.theirSubsequentSeasons?.length ?? 0, 2);

  const eligible = compPPG != null && nComps >= 1 && subseasonCount >= 2;
  if (!eligible || !(pipelinePPG > 0)) {
    return { factor: 1.0, compPPG, compCount: nComps, compAvgSimilarity: avgSim, compConfidence: 0, compBlendWeight: 0 };
  }

  const countFactor = Math.min(nComps / 3, 1);
  const simFactor = clamp((avgSim - 60) / 25, 0, 1);
  const seasonsFactor = clamp(subseasonCount / 4, 0.5, 1);
  const compConfidence = 0.45 * countFactor + 0.40 * simFactor + 0.15 * seasonsFactor;
  const compBlendWeight = MAX_COMP_WEIGHT * compConfidence * COMP_BLEND_PIPELINE_UNCERTAINTY_FIXED;
  const alpha = 1 - compBlendWeight;
  const blendedPPG = clamp(alpha * pipelinePPG + (1 - alpha) * compPPG, 0, 40);
  return { factor: blendedPPG / pipelinePPG, compPPG, compCount: nComps, compAvgSimilarity: avgSim, compConfidence, compBlendWeight };
}

// ─── Registry — documentation only (finding 1): NOTHING in production reads ──
// ─── this object. The mechanism is attachFactorMultipliers' own branches in ───
// ─── lib/panel.mjs, dispatched off FULL_FACTORS. Kept current so its one test ─
// ─── assertion (test/panel-fit.test.mjs) stays honest about what this file ────
// ─── exports. ───────────────────────────────────────────────────────────────────

export const FACTOR_RECONSTRUCTORS = {
  momentum: { positions: ['QB', 'RB', 'WR', 'TE'], kind: 'bucket', fn: reconstructMomentumFactor },
  regression: { positions: ['QB', 'RB', 'WR', 'TE'], kind: 'bucket', fn: reconstructRegressionFactor },
  trajectory: { positions: ['QB', 'RB', 'WR', 'TE'], kind: 'bucket', fn: reconstructTrajectoryFactor },
  shareTrend: { positions: ['RB', 'WR', 'TE'], kind: 'bucket', fn: reconstructShareTrendMultiplier },
  snapShare: { positions: ['RB', 'WR', 'TE'], kind: 'cohort', fn: reconstructSnapShareFactor },
  rzUsage: { positions: ['QB', 'RB', 'WR', 'TE'], kind: 'cohort', fn: reconstructRzUsageFactor },
  teamRzShare: { positions: ['RB', 'WR', 'TE'], kind: 'cohort', fn: reconstructTeamRzShareFactor },
  age: { positions: ['QB', 'RB', 'WR', 'TE'], kind: 'bucket', fn: reconstructAgeFactor },
  depth: { positions: ['QB', 'RB', 'WR', 'TE'], kind: 'external', fn: reconstructDepthFactor },
  teamOffense: { positions: ['QB', 'RB', 'WR', 'TE'], kind: 'cohort', fn: reconstructTeamOffenseFactor },
  qbQuality: { positions: ['RB', 'WR', 'TE'], kind: 'cohort', fn: reconstructQbQualityFactor },
  efficiency: { positions: ['QB', 'RB', 'WR', 'TE'], kind: 'cohort', fn: reconstructEfficiencyFactor },
  compBlend: { positions: ['QB', 'RB', 'WR', 'TE'], kind: 'derived', fn: reconstructCompBlendFactor },
};
