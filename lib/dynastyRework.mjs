/**
 * lib/dynastyRework.mjs — pure, no I/O. S4a: the veteran dynasty score rework — candidate components, grid fit, fold
 * plan, selection and decision rule. Task file: .claude/tasks/dynasty-rework-s4a.md (§5 is the pre-registration).
 *
 * Offline research only: nothing here reaches the app's scoring. The candidate formulas below are a one-shot research
 * copy frozen at data 95b9f15 (app dynasty code at 95ba1e1, CR-32) — not a live coupling; K0 is guarded by T-PATHB.
 *
 * Row fields read (built by scripts/dynasty-rework-run.mjs): `raw` (the mirror's Path B/C raw components), `age`
 * (integer birthdate age on (S+1)-06-01), `level2`, `currentLevel2Score`, `ageAdj2Score`, `r` [r1, r2, r3], `peakPPG`,
 * `opportunityScoreChg`, `S`, `position`, `outcome.sleeper.M1`.
 */
import { rankTransform } from './backtest.mjs';
import { interpolateAgeCurve } from './projectionFactors.mjs';
import { DYNASTY_WEIGHTS } from './dynastyMirror.mjs';

export const POSITIONS = ['QB', 'RB', 'WR', 'TE'];
export const CANDIDATES = ['K0', 'K1', 'K2', 'K3'];
/** K3 reads next-season team information, so it is fitted and reported but never selectable (§5.2). */
export const SELECTABLE = ['K0', 'K1', 'K2'];
export const BETA_GRID = [0, 0.04, 0.08, 0.12, 0.16, 0.20];
export const WEIGHT_TOTAL = 20;
export const MIN_FIT_ROWS = 20;
/** S3's stored value of `h3|M1|sleeper|delta|H~B2|rho|QB|all` (Anton, 2026-10-30); the adapter re-reads it before any fold runs. */
export const QB_B2_DELTA_FLOOR = -0.052245;
export const K3_REPORT_ONLY_SENTENCE = 'K3 uses next-season team information (the S+1 team), which reflects in-season moves, so it is report-only and never selectable';
export const COMPONENT_COUNT = { K0: 5, K1: 4, K2: 4, K3: 4 };
export const COHORT_ARRAY = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round6 = (x) => (x == null ? null : Math.round(x * 1e6) / 1e6);

// ─── copies of private helpers ───────────────────────────────────────────────────────────────────

/** Copy of lib/dynastyMirror.mjs:67 `percentileRank`, verbatim. */
export function percentileRank(sortedPool, value) {
  if (sortedPool.length === 0) return 50;
  let below = 0;
  for (const v of sortedPool) { if (v < value) below++; }
  return Math.round((below / sortedPool.length) * 100);
}

/** Copy of scripts/dynasty-history-run.mjs:521 `ageBand`, verbatim. */
export const ageBand = (a) => (a == null ? null : a <= 24 ? 'le24' : a <= 27 ? '25-27' : a <= 30 ? '28-30' : 'ge31');

// ─── shared per-row quantities (§5.2) ────────────────────────────────────────────────────────────

/** Mean PPG of the qualifying seasons (gamesPlayed ≥ 8, finite points) among {S−1, S}; null if neither qualifies. This is B2. */
export function level2Of(careerStats, pid, S) {
  const ppgAt = (y) => {
    const d = careerStats[y]?.[pid];
    if (!d || !(d.gamesPlayed >= 8) || !Number.isFinite(d.fantasyPoints)) return null;
    return d.fantasyPoints / d.gamesPlayed;
  };
  const q = [ppgAt(S - 1), ppgAt(S)].filter(x => x != null);
  return q.length ? q.reduce((a, b) => a + b, 0) / q.length : null;
}

/**
 * The pool `currentLevel2Score` ranks against: the mirror's `positionRankingPPGs` construction (lib/dynastyMirror.mjs,
 * block "C. Current level"), each member's value its own `level2` instead of `recencyWeightedPPG`.
 */
export function level2Pool(careerStats, playersMap, S, position) {
  return Object.entries(careerStats[S] ?? {})
    .filter(([id, d]) => {
      const p = playersMap[id];
      return p && p.position === position && (d.gamesPlayed ?? 0) >= 8;
    })
    .map(([id]) => level2Of(careerStats, id, S) ?? 0)
    .filter(v => v > 0)
    .sort((a, b) => a - b);
}

export const currentLevel2Score = (pool, level2) => percentileRank(pool, level2);

/** The mirror's ageAdjusted formula (lib/dynastyMirror.mjs "A. Age-adjusted") with levelPPG := level2. */
export function ageAdj2Score({ level2, age, curve, peakPPG }) {
  const expectedMedianPPG = age != null ? interpolateAgeCurve(curve, age) : peakPPG * 0.7;
  const ageFactor = expectedMedianPPG / peakPPG;
  const rawRatio = ageFactor > 0 ? (level2 / peakPPG) / ageFactor : 0;
  return clamp(rawRatio * 50, 0, 100);
}

/** r_k = c(age + k − 1) / c(age − 1), k = 1..3 (ages of outcome seasons S+1..S+3); all 1 if age is null or c(age − 1) ≤ 0. */
export function curveRatios(curve, age) {
  if (age == null) return [1, 1, 1];
  const c0 = interpolateAgeCurve(curve, age - 1);
  if (!(c0 > 0)) return [1, 1, 1];
  return [1, 2, 3].map(k => interpolateAgeCurve(curve, age + k - 1) / c0);
}

/**
 * ageFwdScore(β) = clamp(50 × level2 × F / peakPPG, 0, 100), F = (1/3) Σ r_k (1 − β)^max(0, age + k − 30); null age → F = 1.
 * The exponent counts the outcome seasons played at age 30 or older (outcome season k is at age + k − 1).
 */
export function ageFwdScore(row, beta) {
  let F = 1;
  if (row.age != null) {
    let sum = 0;
    for (let k = 1; k <= 3; k++) sum += row.r[k - 1] * (1 - beta) ** Math.max(0, row.age + k - 30);
    F = (1 / 3) * sum;
  }
  return clamp(50 * row.level2 * F / row.peakPPG, 0, 100);
}

// ─── candidates (§5.2) ───────────────────────────────────────────────────────────────────────────

/** The candidate's components in its fixed order. K2 and K3 need `beta`; K0 and K1 ignore it. */
export function candidateComponents(row, candidateId, beta) {
  const raw = row.raw;
  switch (candidateId) {
    case 'K0': return [raw.ageAdjScore, raw.trajectoryScore, raw.currentLevelScore, raw.effectiveReliability, raw.opportunityScore];
    case 'K1': return [row.ageAdj2Score, row.currentLevel2Score, raw.effectiveReliability, raw.opportunityScore];
    case 'K2': return [ageFwdScore(row, beta), row.currentLevel2Score, raw.effectiveReliability, raw.opportunityScore];
    case 'K3': return [ageFwdScore(row, beta), row.currentLevel2Score, raw.effectiveReliability, row.opportunityScoreChg];
    default: throw new Error(`[dynasty-rework] unknown candidate '${candidateId}'`);
  }
}

/**
 * component = Math.round(Σ weights[i] × comp_i), summed left to right in the candidate's order (for K0 with
 * DYNASTY_WEIGHTS this is `composeDynastyScore`'s term order); Path B (seasonsOfData ≤ 2) blends the prospect score
 * 0.4 / 0.6 exactly as the app does.
 */
export function composeCandidate(row, candidateId, weights, beta) {
  const comps = candidateComponents(row, candidateId, beta);
  if (weights.length !== comps.length) throw new Error(`[dynasty-rework] ${candidateId} takes ${comps.length} weights, got ${weights.length}`);
  let s = 0;
  for (let i = 0; i < comps.length; i++) s += weights[i] * comps[i];
  const component = Math.round(s);
  if (row.raw.seasonsOfData <= 2) return Math.round(row.raw.prospectScore * 0.4 + component * 0.6);
  return component;
}

// ─── grid and fit (§5.3) ─────────────────────────────────────────────────────────────────────────

const gridCache = new Map();
/** Every vector of k non-negative integers summing to 20, in lexicographic order (10,626 for k = 5; 1,771 for k = 4). */
export function weightGrid(k) {
  if (gridCache.has(k)) return gridCache.get(k);
  const out = [];
  const cur = new Array(k).fill(0);
  const rec = (i, left) => {
    if (i === k - 1) { cur[i] = left; out.push(cur.slice()); return; }
    for (let v = 0; v <= left; v++) { cur[i] = v; rec(i + 1, left - v); }
  };
  rec(0, WEIGHT_TOTAL);
  gridCache.set(k, out);
  return out;
}

/** Number of (weight, β) pairs fitted for a candidate. */
export function gridSize(candidateId) {
  const n = weightGrid(COMPONENT_COUNT[candidateId]).length;
  return candidateId === 'K2' || candidateId === 'K3' ? n * BETA_GRID.length : n;
}

/** Reference weights for the tie-break: K0 = DYNASTY_WEIGHTS; K1–K3 = DYNASTY_WEIGHTS without trajectory, each ÷ 0.75. */
export function referenceWeights(candidateId) {
  const w = DYNASTY_WEIGHTS;
  if (candidateId === 'K0') return [w.ageAdjusted, w.trajectory, w.currentLevel, w.reliability, w.opportunityQuality];
  return [w.ageAdjusted / 0.75, w.currentLevel / 0.75, w.reliability / 0.75, w.opportunityQuality / 0.75];
}

const OBJ_TIE = 1e-12;
const DIST_TIE = 1e-9;

/** §5.3 choice among tied fits: smallest L1 distance (1e-9 counts as equal), then smaller β, then lexicographically smallest integer vector. */
export function chooseFromTies(tied) {
  const cmp = (a, b) => {
    const dd = a.dist - b.dist;
    if (Math.abs(dd) > DIST_TIE) return dd;
    const ab = a.beta ?? 0, bb = b.beta ?? 0;
    if (ab !== bb) return ab - bb;
    for (let i = 0; i < a.ints.length; i++) if (a.ints[i] !== b.ints[i]) return a.ints[i] - b.ints[i];
    return 0;
  };
  let best = tied[0];
  for (let i = 1; i < tied.length; i++) if (cmp(tied[i], best) < 0) best = tied[i];
  return best;
}

const BUCKETS = 256;

/** One fit cohort's pre-computed arrays for the grid evaluation. */
function prepareGroup(rows, candidateId, betas) {
  const n = rows.length;
  const k = COMPONENT_COUNT[candidateId];
  const m1 = rows.map(r => r.outcome.sleeper.M1);
  const rv = rankTransform(m1);
  const meanR = (n + 1) / 2;
  const rvc = new Float64Array(n);
  let dy2 = 0;
  for (let i = 0; i < n; i++) { rvc[i] = rv[i] - meanR; dy2 += rvc[i] * rvc[i]; }
  const comps = betas.map(b => {
    const a = new Float64Array(n * k);
    rows.forEach((r, i) => { const c = candidateComponents(r, candidateId, b); for (let j = 0; j < k; j++) a[i * k + j] = c[j]; });
    return a;
  });
  const isB = new Uint8Array(n);
  const psw = new Float64Array(n);
  rows.forEach((r, i) => { if (r.raw.seasonsOfData <= 2) { isB[i] = 1; psw[i] = r.raw.prospectScore * 0.4; } });
  return { n, k, rvc, dy2, comps, isB, psw, meanR, scores: new Int32Array(n), cnt: new Int32Array(BUCKETS), rk: new Float64Array(BUCKETS), m1 };
}

/** ρ(score, M1) for one group at weight vector `wf` (numbers) and β index `bi`; null when either side is constant. Bit-identical scores to `composeCandidate`. */
function groupRho(g, wf, bi) {
  const { n, k, comps, isB, psw, scores, cnt, rk, rvc, dy2, meanR } = g;
  const c = comps[bi];
  cnt.fill(0);
  let outOfRange = false;
  for (let i = 0; i < n; i++) {
    let s = 0;
    const base = i * k;
    for (let j = 0; j < k; j++) s += wf[j] * c[base + j];
    let comp = Math.round(s);
    if (isB[i]) comp = Math.round(psw[i] + comp * 0.6);
    if (!(comp >= 0 && comp < BUCKETS)) { outOfRange = true; break; }
    scores[i] = comp;
    cnt[comp]++;
  }
  if (outOfRange) return groupRhoGeneral(g, wf, bi);
  let below = 0, dx2 = 0;
  for (let v = 0; v < BUCKETS; v++) {
    const cv = cnt[v];
    if (cv) { const r = below + (cv + 1) / 2; rk[v] = r; below += cv; const d = r - meanR; dx2 += cv * d * d; }
  }
  if (dx2 === 0 || dy2 === 0) return null;
  let num = 0;
  for (let i = 0; i < n; i++) num += (rk[scores[i]] - meanR) * rvc[i];
  return num / Math.sqrt(dx2 * dy2);
}

/** Fallback for a score outside the 0…255 bucket range: the library path. */
function groupRhoGeneral(g, wf, bi) {
  const { n, k, comps, isB, psw, rvc, dy2, meanR } = g;
  const c = comps[bi];
  const s = new Array(n);
  for (let i = 0; i < n; i++) {
    let t = 0;
    for (let j = 0; j < k; j++) t += wf[j] * c[i * k + j];
    let comp = Math.round(t);
    if (isB[i]) comp = Math.round(psw[i] + comp * 0.6);
    s[i] = comp;
  }
  const rs = rankTransform(s);
  let num = 0, dx2 = 0;
  for (let i = 0; i < n; i++) { const d = rs[i] - meanR; dx2 += d * d; num += d * rvc[i]; }
  if (dx2 === 0 || dy2 === 0) return null;
  return num / Math.sqrt(dx2 * dy2);
}

/**
 * Fit one candidate at one position on `fitCohorts` (§5.3). Objective = equal-weight mean over the contributing fit
 * cohorts (≥ 20 rows evaluable for M1) of ρ(score, M1). Returns { weights (integers of 20), beta, objective } or
 * 'insufficient' when no fit cohort contributes. `rows` are in-memory rows; only fit cohorts' rows are ever read.
 */
export function fitCandidate(rows, candidateId, fitCohorts, position) {
  const fitSet = new Set(fitCohorts);
  const byS = new Map();
  for (const r of rows) {
    if (r.position !== position || !fitSet.has(r.S)) continue;
    if (r.outcome?.sleeper?.M1 == null) continue;
    if (!byS.has(r.S)) byS.set(r.S, []);
    byS.get(r.S).push(r);
  }
  const contributing = [...byS.keys()].sort((a, b) => a - b).filter(S => byS.get(S).length >= MIN_FIT_ROWS);
  if (contributing.length === 0) return 'insufficient';

  const usesBeta = candidateId === 'K2' || candidateId === 'K3';
  const betas = usesBeta ? BETA_GRID : [null];
  const groups = contributing.map(S => prepareGroup(byS.get(S), candidateId, betas));
  const grid = weightGrid(COMPONENT_COUNT[candidateId]);
  const ref = referenceWeights(candidateId);
  const wf = new Float64Array(COMPONENT_COUNT[candidateId]);

  const total = betas.length * grid.length;
  const obj = new Float64Array(total);
  let max = -Infinity;
  let idx = 0;
  for (let bi = 0; bi < betas.length; bi++) {
    for (let gi = 0; gi < grid.length; gi++, idx++) {
      const ints = grid[gi];
      for (let j = 0; j < ints.length; j++) wf[j] = ints[j] / WEIGHT_TOTAL;
      let sum = 0, c = 0;
      for (const g of groups) {
        const rho = groupRho(g, wf, bi);
        if (rho == null) continue;
        sum += rho; c++;
      }
      const o = c ? sum / c : -Infinity;
      obj[idx] = o;
      if (o > max) max = o;
    }
  }
  if (max === -Infinity) return 'insufficient';

  const tied = [];
  idx = 0;
  for (let bi = 0; bi < betas.length; bi++) {
    for (let gi = 0; gi < grid.length; gi++, idx++) {
      if (obj[idx] < max - OBJ_TIE) continue;
      const ints = grid[gi];
      let dist = 0;
      for (let j = 0; j < ints.length; j++) dist += Math.abs(ints[j] / WEIGHT_TOTAL - ref[j]);
      tied.push({ ints, beta: betas[bi], dist, objective: obj[idx] });
    }
  }
  const best = chooseFromTies(tied);
  return { weights: best.ints.slice(), beta: best.beta, objective: best.objective };
}

/** The ρ of a candidate's chosen weights, computed by the library path (used by tests to cross-check the grid's fast path). */
export function rhoOfFit(rows, candidateId, fit, cohort, position) {
  const sub = rows.filter(r => r.position === position && r.S === cohort && r.outcome?.sleeper?.M1 != null);
  const s = sub.map(r => composeCandidate(r, candidateId, fit.weights.map(w => w / WEIGHT_TOTAL), fit.beta));
  const a = rankTransform(s), b = rankTransform(sub.map(r => r.outcome.sleeper.M1));
  const n = s.length, m = (n + 1) / 2;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (a[i] - m) * (b[i] - m); dx += (a[i] - m) ** 2; dy += (b[i] - m) ** 2; }
  return dx === 0 || dy === 0 ? null : num / Math.sqrt(dx * dy);
}

/** Score one row with a fit (integer weights ÷ 20); null when the fit is `insufficient`. */
export function scoreWithFit(row, candidateId, fit) {
  if (!fit || fit === 'insufficient') return null;
  return composeCandidate(row, candidateId, fit.weights.map(w => w / WEIGHT_TOTAL), fit.beta);
}

// ─── folds (§5.4) ────────────────────────────────────────────────────────────────────────────────

export const HEADLINE_FIT_COHORTS = COHORT_ARRAY(2015, 2022);

/**
 * 'loco': buffered leave-one-cohort-out, T ∈ 2015…2022, fit = { F ∈ 2015…2022 : |F − T| ≥ 3 }.
 * 'forward': T ∈ 2018…2022, fit = {2015 … T−3}.   'short': T = 2023 (fit 2015…2020), T = 2024 (fit 2015…2021).
 */
export function foldPlan(kind) {
  if (kind === 'loco') return HEADLINE_FIT_COHORTS.map(T => ({ T, fit: HEADLINE_FIT_COHORTS.filter(F => Math.abs(F - T) >= 3) }));
  if (kind === 'forward') return COHORT_ARRAY(2018, 2022).map(T => ({ T, fit: COHORT_ARRAY(2015, T - 3) }));
  if (kind === 'short') return [{ T: 2023, fit: COHORT_ARRAY(2015, 2020) }, { T: 2024, fit: COHORT_ARRAY(2015, 2021) }];
  throw new Error(`[dynasty-rework] unknown fold plan '${kind}'`);
}

// ─── selection (§5.5) ────────────────────────────────────────────────────────────────────────────

/**
 * `fitsByCandidate`: { K0: { QB: fit | 'insufficient', … }, … }. The chosen candidate is the one among K0, K1, K2
 * with the highest Σ over the four positions of its fitted objective (an `insufficient` fit counts 0); tie → lower
 * index. K3 is never chosen. Returns { chosen, sums }.
 */
export function selectCandidate(fitsByCandidate) {
  const sums = {};
  for (const K of CANDIDATES) {
    sums[K] = POSITIONS.reduce((a, pos) => {
      const f = fitsByCandidate[K]?.[pos];
      return a + (f && f !== 'insufficient' ? f.objective : 0);
    }, 0);
  }
  let chosen = SELECTABLE[0];
  for (const K of SELECTABLE.slice(1)) if (sums[K] > sums[chosen]) chosen = K;
  return { chosen, sums };
}

// ─── age tilt (§5.7) ─────────────────────────────────────────────────────────────────────────────

const meanOf = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * items: [{ age, bias }]. tilt = mean bias(ge31) − mean bias(le24). `tilt` is null when either band has fewer than
 * `minBand` rows (the caller labels the cell `insufficient`).
 */
export function ageTilt(items, { minBand = 30 } = {}) {
  const le = items.filter(i => ageBand(i.age) === 'le24').map(i => i.bias);
  const ge = items.filter(i => ageBand(i.age) === 'ge31').map(i => i.bias);
  const nMin = Math.min(le.length, ge.length);
  if (le.length < minBand || ge.length < minBand) return { tilt: null, nLe24: le.length, nGe31: ge.length, n: nMin };
  return { tilt: meanOf(ge) - meanOf(le), nLe24: le.length, nGe31: ge.length, n: nMin };
}

/** §5.10 tilt label from the `tilt(P)` and `tilt(H) − tilt(P)` cells ({ ci95, label }). */
export function tiltLabel(tiltP, reduction) {
  if (!tiltP || !reduction || tiltP.label === 'insufficient' || reduction.label === 'insufficient' || !tiltP.ci95 || !reduction.ci95) return 'insufficient';
  const includesZero = tiltP.ci95[0] <= 0 && tiltP.ci95[1] >= 0;
  return includesZero && reduction.ci95[0] > 0 ? 'tilt-removed' : 'tilt-remains';
}

// ─── decision (§5.10) ────────────────────────────────────────────────────────────────────────────

/**
 * `summary[pos]` = { b2Label, b1Label, b2Delta, tiltLabel } (b2Delta is the P~B2 Cell's stored value, already rounded to 6 decimals).
 * RB/WR/TE pass iff `beats-B2` and `tilt-removed`; QB passes iff no loss to B1 or B2 (neither `loses-to-…` nor
 * `insufficient`), b2Delta ≥ QB_B2_DELTA_FLOOR, and `tilt-removed`. S4A-WIN iff all four pass.
 * Returns { decision, positions: { pos: { pass, conditions } } }.
 */
export function decide(summary) {
  const positions = {};
  for (const pos of POSITIONS) {
    const s = summary?.[pos] ?? {};
    const tiltOk = s.tiltLabel === 'tilt-removed';
    let conditions;
    if (pos === 'QB') {
      conditions = {
        noLossToB1B2: s.b1Label !== 'loses-to-B1' && s.b1Label !== 'insufficient' && s.b1Label != null
          && s.b2Label !== 'loses-to-B2' && s.b2Label !== 'insufficient' && s.b2Label != null,
        b2DeltaAtLeastFloor: Number.isFinite(s.b2Delta) && s.b2Delta >= QB_B2_DELTA_FLOOR,
        tiltRemoved: tiltOk,
      };
    } else {
      conditions = { beatsB2: s.b2Label === 'beats-B2', tiltRemoved: tiltOk };
    }
    positions[pos] = { pass: Object.values(conditions).every(Boolean), conditions };
  }
  return { decision: POSITIONS.every(p => positions[p].pass) ? 'S4A-WIN' : 'S4A-NO-WIN', positions };
}

export { round6 };
