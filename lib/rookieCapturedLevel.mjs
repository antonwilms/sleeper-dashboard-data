/**
 * lib/rookieCapturedLevel.mjs — the app's `rookieProjection` level (seasonProjection.js:360-497 @ cbd17c8),
 * re-composed from a capture's own `projection.factors`. `dynastyPrior` with `neutral` is the app's
 * dynasty-side rookie prior (`buildRookieDynastyPriors`: ktcMap/collegeStats null, no takeover input — D-56(b),
 * CR-25). Valid for captures whose rookie composition matches the app at that commit. A later CR-15 rookie
 * boundary turns `test/rookie-captured-level.test.mjs`'s newest-capture check red.
 *
 * Pure. Imports only `ROOKIE_MULTIPLIER_CLAMP` from ./projectionFactors.mjs and MUST NEVER import
 * ./rookieMirror.mjs: `scripts/grade-snapshot.mjs` sits in `bin/panel.mjs`'s closure (T-RM1 Assert 2), so this
 * file is how a grader reaches the closed form without reaching the corrected reconstruction.
 *
 * Composition (research-arms-w3 §5):
 *   1. prod = clamp(ageDelta × ktcMult × collegeContribution × nflDraftMultiplier, ROOKIE_MULTIPLIER_CLAMP)
 *   2. pre  = clamp(basePPG × prod × rookieCalibrationMult, 0, 40)
 *   3. ceiled = pre when the knee is null or pre ≤ knee, else knee + (asym − knee)(1 − e^(−(pre − knee)/(asym − knee)))
 *   4. `chain` row: starter × qbStartShare (starter = qbStarterPPG on a `rookie:` basis, else ceiled); else ceiled
 *   5. round to 1 dp
 * The dynasty prior is steps 1–3 only (ktcMult = collegeContribution = 1), rounded, never step 4.
 */

import { ROOKIE_MULTIPLIER_CLAMP } from './projectionFactors.mjs';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round1 = (v) => Math.round(v * 10) / 10;

export function rookieCapturedLevel(factors, { neutral = false } = {}) {
  const f = factors ?? {};
  const { basePPG, ageDelta, nflDraftMultiplier, rookieCalibrationMult } = f;
  if (![basePPG, ageDelta, nflDraftMultiplier, rookieCalibrationMult].every(Number.isFinite)) return null;
  const ktcMult = neutral ? 1 : f.ktcMult;
  const collegeContribution = neutral ? 1 : f.collegeContribution;
  if (![ktcMult, collegeContribution].every(Number.isFinite)) return null;

  const prod = clamp(ageDelta * ktcMult * collegeContribution * nflDraftMultiplier, ROOKIE_MULTIPLIER_CLAMP[0], ROOKIE_MULTIPLIER_CLAMP[1]);
  const projectedPPGPre = clamp(basePPG * prod * rookieCalibrationMult, 0, 40);

  const knee = f.rookieCeilingKnee, asym = f.rookieCeilingAsymptote;
  const ceiledPPG = (knee == null || asym == null || projectedPPGPre <= knee)
    ? projectedPPGPre
    : knee + (asym - knee) * (1 - Math.exp(-(projectedPPGPre - knee) / (asym - knee)));

  let projectedPPG;
  if (f.qbTakeoverBasis === 'chain') {
    const starter = typeof f.qbStarterBasis === 'string' && f.qbStarterBasis.startsWith('rookie:') ? f.qbStarterPPG : ceiledPPG;
    projectedPPG = Number.isFinite(f.qbStartShare) && Number.isFinite(starter) ? round1(starter * f.qbStartShare) : null;
  } else {
    projectedPPG = round1(ceiledPPG);
  }
  return { projectedPPGPre, ceiledPPG, projectedPPG, dynastyPrior: round1(ceiledPPG) };
}
