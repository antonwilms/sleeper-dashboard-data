/**
 * lib/rookieMirror.mjs — CR-15 rookie-half mirror (rookie-mirror.md).
 *
 * This is the CORRECTED rookie reconstruction — the shipped calibration,
 * games-ladder and ceiling mechanisms, verbatim from sleeper-dashboard's
 * seasonProjection.js. It is deliberately unreachable from the fit path
 * (test/rookie-mirror.test.mjs's import-graph assertion enforces this): the
 * uncorrected predictor for fitting is, and remains,
 * `reconstructRookieProjection` in lib/projectionFactors.mjs. This module
 * imports that one (mirror → factors, never the reverse — §2 of the task
 * file) so `reconstructShippedRookieProjection` can COMPOSE the uncorrected
 * factor work rather than re-derive it, keeping the two from drifting apart.
 *
 * `bySleeper.draftPick`/`draft_picks.json` `pick` never-join warning: the
 * former is within-round, the latter is overall. Nothing in this module
 * joins them, but a future edit that does must not conflate the two. (D-10's
 * `bySleeper.undrafted` record — the population the app's shipped
 * calibration constants were fitted on — lives in data-catalog.md only; this
 * module's mirror does NOT depend on that flag, see resolveDraftCapitalStatus
 * below.)
 */

import { reconstructRookieProjection, ROOKIE_BASELINE_PPG } from './projectionFactors.mjs';

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// seasonProjection.js:34-37 — rookie realisation calibration (calibration
// arc slice 1). Fitted on sleeper-dashboard-data
// backtests/2026-09-06-fullpipeline-panel.json rookiePanel.rows.
export const ROOKIE_CALIBRATION = {
  undrafted: { QB: 0.67, RB: 0.33, WR: 0.36, TE: 0.28 },
  day3:      { QB: 1.00, RB: 0.80, WR: 0.79, TE: 0.71 },
};
// seasonProjection.js:38-40
const DAY3_TIERS = new Set(['r4', 'r5', 'r6', 'r7']);
const R1_TIERS   = new Set(['top-3', 'top-8', 'r1-mid', 'r1-late']);
const DAY2_TIERS = new Set(['r2', 'r3']);

// seasonProjection.js:52-57 — rookie realisation ceiling (calibration arc
// slice 3). knee = p90, asymptote = p99 of realised debut-season PPG,
// rookie-path entrants who played >= 8 games, entry classes 2013-2025,
// half-PPR (backtests/2026-09-11-rookie-panel.json debut.rows). Keyed on
// position ONLY, never draft group.
export const ROOKIE_CEILING = {
  QB: { knee: 17.80, asymptote: 21.90 },   // n=50
  RB: { knee: 12.11, asymptote: 16.87 },   // n=281
  WR: { knee:  9.87, asymptote: 14.38 },   // n=366
  TE: { knee:  6.21, asymptote: 11.60 },   // n=176
};

// seasonProjection.js:66-95 — RUNG 1, group x position x experience.
const ROOKIE_GAMES_GPE = {
  'r1|QB|0': 11.5, 'r1|WR|0': 13.1,
  'day2|RB|0': 12.3, 'day2|TE|0': 12.6, 'day2|WR|0': 13.5,
  'day3|QB|0': 1.9, 'day3|QB|1': 2.2, 'day3|QB|2+': 2.0,
  'day3|RB|0': 9.9, 'day3|RB|1': 3.5, 'day3|RB|2+': 4.0,
  'day3|TE|0': 8.6, 'day3|TE|1': 5.8,
  'day3|WR|0': 8.2, 'day3|WR|1': 4.7, 'day3|WR|2+': 3.8,
  'undrafted|QB|0': 0.9, 'undrafted|QB|1': 0.7, 'undrafted|QB|2+': 2.8,
  'undrafted|RB|0': 4.4, 'undrafted|RB|1': 2.6, 'undrafted|RB|2+': 4.9,
  'undrafted|TE|0': 3.9, 'undrafted|TE|1': 3.8, 'undrafted|TE|2+': 4.7,
  'undrafted|WR|0': 2.8, 'undrafted|WR|1': 2.3, 'undrafted|WR|2+': 4.1,
};
// seasonProjection.js:100-111 — RUNG 2, group x experience.
const ROOKIE_GAMES_GE = {
  'r1|0': 12.8,
  'day2|0': 12.3, 'day2|1': 6.9, 'day2|2+': 4.0,
  'day3|0': 8.0, 'day3|1': 4.0, 'day3|2+': 3.4,
  'undrafted|0': 3.3, 'undrafted|1': 2.5, 'undrafted|2+': 4.2,
};
// seasonProjection.js:113-118 — RUNG 3, group x position.
const ROOKIE_GAMES_GP = {
  r1:        { QB: 10.5, RB: 13.8, WR: 12.8, TE: 14.6 },
  day2:      { QB:  4.7, RB: 10.8, WR: 13.1, TE: 11.5 },
  day3:      { QB:  2.1, RB:  7.9, WR:  6.7, TE:  7.7 },
  undrafted: { QB:  1.3, RB:  3.8, WR:  2.9, TE:  4.0 },
};
// seasonProjection.js:120 — RUNG 4, group pooled.
const ROOKIE_GAMES_G = { r1: 12.2, day2: 10.7, day3: 6.2, undrafted: 3.2 };
// seasonProjection.js:124-129 — RUNG U, position x experience (unknown draft capital).
const ROOKIE_GAMES_U = {
  QB: { '0': 3.9, '1': 2.3, '2+': 2.5, pooled: 3.0 },
  RB: { '0': 7.6, '1': 3.0, '2+': 4.5, pooled: 5.9 },
  WR: { '0': 6.3, '1': 3.0, '2+': 4.1, pooled: 5.0 },
  TE: { '0': 7.0, '1': 4.5, '2+': 5.2, pooled: 6.0 },
};

// seasonProjection.js:216-225 — deviation: resolveDraftCapitalStatus is NOT
// ported. Its inputs (nflDraftMatchSource, currentSeason, nflDraftYears) are
// live app state; every parity row this mirror is checked against already
// carries draftCapitalStatus. Callers pass it in as a parameter.
export function resolveRookieCalibration({ position, draftCapitalStatus, nflDraftTier }) {
  if (draftCapitalStatus === 'undrafted') {
    const mult = ROOKIE_CALIBRATION.undrafted[position];
    if (mult != null) return { rookieCalibrationMult: mult, rookieCalibrationBasis: `undrafted:${position}` };
  } else if (draftCapitalStatus === 'matched' && DAY3_TIERS.has(nflDraftTier)) {
    const mult = ROOKIE_CALIBRATION.day3[position];
    if (mult != null) return { rookieCalibrationMult: mult, rookieCalibrationBasis: `day3:${position}` };
  }
  return { rookieCalibrationMult: 1.0, rookieCalibrationBasis: 'none' };
}

// seasonProjection.js:236-285 — five-rung ladder, first-hit-wins. An absent
// cell is absent on purpose (it failed that rung's own n floor) — never
// backfilled from a neighbouring cell. No lower clamp at 8 (unlike the
// veteran path) — day-3/undrafted rookies routinely play far fewer than 8
// games, and copying the veteran floor would erase that finding.
export function resolveRookieGames({ position, draftCapitalStatus, nflDraftTier, yearsExp }) {
  const expBucket = yearsExp === 0 ? '0' : yearsExp === 1 ? '1' : yearsExp >= 2 ? '2+' : null;

  let group = null;
  if (draftCapitalStatus === 'undrafted') {
    group = 'undrafted';
  } else if (draftCapitalStatus === 'matched') {
    if      (R1_TIERS.has(nflDraftTier))   group = 'r1';
    else if (DAY2_TIERS.has(nflDraftTier)) group = 'day2';
    else if (DAY3_TIERS.has(nflDraftTier)) group = 'day3';
  }

  let raw = null;
  let basis = null;

  if (group != null) {
    if (raw == null && expBucket != null) {
      const v = ROOKIE_GAMES_GPE[`${group}|${position}|${expBucket}`];
      if (v != null) { raw = v; basis = `gpe:${group}|${position}|${expBucket}`; }
    }
    if (raw == null && expBucket != null) {
      const v = ROOKIE_GAMES_GE[`${group}|${expBucket}`];
      if (v != null) { raw = v; basis = `ge:${group}|${expBucket}`; }
    }
    if (raw == null) {
      const v = ROOKIE_GAMES_GP[group]?.[position];
      if (v != null) { raw = v; basis = `gp:${group}|${position}`; }
    }
    if (raw == null) {
      const v = ROOKIE_GAMES_G[group];
      if (v != null) { raw = v; basis = `g:${group}`; }
    }
  } else if (draftCapitalStatus === 'unknown') {
    const posTable = ROOKIE_GAMES_U[position];
    if (posTable != null) {
      if (expBucket != null && posTable[expBucket] != null) {
        raw = posTable[expBucket]; basis = `u:${position}|${expBucket}`;
      } else {
        raw = posTable.pooled; basis = `u:${position}`;
      }
    }
  }

  if (raw == null) { raw = 14; basis = 'default'; }

  return {
    projectedGames:   Math.max(0, Math.min(17, Math.round(raw))),
    rookieGamesBasis: basis,
  };
}

// seasonProjection.js:295-306 — soft compression above the position's knee
// (p90), asymptotic to (but never reaching) the asymptote (p99). Identity at
// or below the knee. Keyed on position alone.
export function applyRookieCeiling({ position, projectedPPG }) {
  const c = ROOKIE_CEILING[position];
  if (c == null) {
    return { ceiledPPG: projectedPPG, rookieCeilingBasis: 'none', rookieCeilingKnee: null, rookieCeilingAsymptote: null };
  }
  const { knee, asymptote } = c;
  if (!Number.isFinite(projectedPPG) || projectedPPG <= knee) {
    return { ceiledPPG: projectedPPG, rookieCeilingBasis: 'none', rookieCeilingKnee: knee, rookieCeilingAsymptote: asymptote };
  }
  const ceiledPPG = knee + (asymptote - knee) * (1 - Math.exp(-(projectedPPG - knee) / (asymptote - knee)));
  return { ceiledPPG, rookieCeilingBasis: `ceiling:${position}`, rookieCeilingKnee: knee, rookieCeilingAsymptote: asymptote };
}

// §3.1 — the three-token vocabulary. This is the AUTHORITATIVE copy;
// lib/panel.mjs carries these same three strings as literals in its two
// guard error messages (it cannot import this module — that import would put
// the mirror one edge inside the fit path's closure). T-RM14 asserts the two
// copies agree by reading lib/panel.mjs as text.
export const ROOKIE_CORRECTIONS = Object.freeze(['rookieCalibration', 'rookieGames', 'rookieCeiling']);

// The corrected reconstruction. Composes reconstructRookieProjection's factor
// work (ageMult x ktcMult x collegeContribution x nflDraftMultiplier, clamped
// to [0.45, 1.85] as `cappedProduct`) and then applies, IN ORDER:
//   calibration multiplier (outside the [0.45, 1.85] clamp) -> clamp(.., 0, 40)
//   -> ceiling (on the finished level) -> games ladder -> total points.
// This ordering is load-bearing (seasonProjection.js:409-440) and is checked
// at both seams, to differing observability strength (rookie-mirror.md §4.2):
//   calibration -> ceiling: observable exactly (rookieCeilingPPGPre captured
//     at 3dp is the ceiling's own input).
//   ceiling -> games: observable only up to capture rounding, and only on
//     rows where the ceiling fires (rookie-mirror.md §4.2).
//
// MUST compose from reconstructRookieProjection's `cappedProduct` field, NEVER
// from its returned `projectedPPG` — that field is already rounded to 1dp and
// already clamped to [0, 40], both before any calibration exists, so
// composing from it cannot reproduce the app's single full-precision
// expression `clamp(baseline * rookieMultiplierProduct * rookieCalibrationMult, 0, 40)`.
// This is the single most plausible silent mirroring error in the slice.
export function reconstructShippedRookieProjection({
  position, ageAtDraft, draftRound, draftPick, draftCapitalStatus, yearsExp,
}) {
  const uncorrected = reconstructRookieProjection({ position, ageAtDraft, draftRound, draftPick });
  const { cappedProduct, nflDraftTier } = uncorrected;

  const baseline = ROOKIE_BASELINE_PPG[position] ?? 7;

  const { rookieCalibrationMult, rookieCalibrationBasis } =
    resolveRookieCalibration({ position, draftCapitalStatus, nflDraftTier });

  const projectedPPGPre = clamp(baseline * cappedProduct * rookieCalibrationMult, 0, 40);

  const { ceiledPPG, rookieCeilingBasis, rookieCeilingKnee, rookieCeilingAsymptote } =
    applyRookieCeiling({ position, projectedPPG: projectedPPGPre });

  const { projectedGames, rookieGamesBasis } =
    resolveRookieGames({ position, draftCapitalStatus, nflDraftTier, yearsExp });

  const projectedPPG = Math.round(ceiledPPG * 10) / 10;
  const projectedTotalPts = Math.round(ceiledPPG * projectedGames * 10) / 10;

  // §3.1/T-RM3 — each mechanism declares on its OWN explicit condition, never
  // on a shared "moved a number" test. rookieGames has no uncorrected
  // baseline to have moved against (reconstructRookieProjection returns no
  // games column at all), so it declares whenever the ladder resolved a real
  // cell rather than falling through to the flat 14.
  const appliedCorrections = [];
  if (rookieCalibrationMult < 1) appliedCorrections.push('rookieCalibration');
  if (rookieGamesBasis !== 'default') appliedCorrections.push('rookieGames');
  if (rookieCeilingBasis !== 'none') appliedCorrections.push('rookieCeiling');
  Object.freeze(appliedCorrections);

  return {
    projectedPPG,
    projectedGames,
    projectedTotalPts,
    nflDraftTier,
    hitCap: uncorrected.hitCap,
    cappedProduct,
    draftCapitalStatus,
    rookieCalibrationMult,
    rookieCalibrationBasis,
    rookieGamesBasis,
    rookieCeilingBasis,
    rookieCeilingKnee,
    rookieCeilingAsymptote,
    rookieCeilingPPGPre: projectedPPGPre,
    appliedCorrections,
  };
}
