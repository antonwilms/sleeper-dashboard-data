/**
 * lib/ageCurveVariants.mjs — pure, no I/O. S3b's two age-curve builders (task .claude/tasks/dynasty-history-backtest.md §8.11).
 *
 *   guardedAgeCurves  H's curve: `empiricalAgeCurvesMirror`'s loop with one change — the derived peak ignores age
 *                     buckets with fewer than `PEAK_GUARD_MIN_ROWS` rows. The curves themselves are unchanged; with
 *                     `minRows: 0` the bundle deep-equals the mirror's.
 *   deltaAgeCurves    A-AGE-DELTA's curve: a within-player (delta-method) curve — mean year-to-year PPG change by age,
 *                     chained from H's best-populated age.
 *
 * `median`, `rollingAvg3` and `derivePeakAge` are private in lib/dynastyMirror.mjs, so they are copied here verbatim
 * (dynastyScore.js:28-66). Only `PEAK_AGE_CAPS` and `MIN_BASIS_SCALE_ROWS` are imported.
 */
import { PEAK_AGE_CAPS, MIN_BASIS_SCALE_ROWS } from './dynastyMirror.mjs';

const SKILL_POSITIONS = ['QB', 'RB', 'WR', 'TE'];
const SKILL_SET = new Set(SKILL_POSITIONS);

/** §8.11: the standing per-position minimum for a median-based statistic (`MIN_BASIS_SCALE_ROWS`). */
export const PEAK_GUARD_MIN_ROWS = 30;

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

/** The app's cap + nearest-point rule (dynastyScore.js:127-139) over `points` for a derived peak age. */
function capAndNearest(points, derivedPeakAge, position) {
  const cap = PEAK_AGE_CAPS[position] ?? null;
  const cappedPeakAge = cap != null ? Math.min(derivedPeakAge, cap) : derivedPeakAge;
  const cappedPeakPoint = points.reduce(
    (best, p) => Math.abs(p.age - cappedPeakAge) < Math.abs(best.age - cappedPeakAge) ? p : best,
    points[0]
  );
  return { peakAge: cappedPeakAge, peakPPG: Math.max(cappedPeakPoint.medianPPG, 1) };
}

/**
 * H's guarded curves. `currentYear` replaces the wall-clock year, as in `empiricalAgeCurvesMirror`.
 * Returns { bundle: { curves, positionPeakPPG, positionPeakAge, positionBasisScale },
 *           counts[pos][age] = rows per age bucket, fallback[pos] = true when no bucket reached `minRows`
 *           (the app's unguarded peak stands) }.
 */
export function guardedAgeCurves(careerStats, playersMap, { currentYear, minRows = PEAK_GUARD_MIN_ROWS }) {
  const byPositionAge = { QB: {}, RB: {}, WR: {}, TE: {} };
  const basisRatios = { QB: [], RB: [], WR: [], TE: [] };

  for (const [season, seasonData] of Object.entries(careerStats)) {
    for (const [playerId, data] of Object.entries(seasonData)) {
      if ((data.gamesPlayed ?? 0) < 10) continue;
      const player = playersMap[playerId];
      if (!player || !SKILL_SET.has(player.position)) continue;

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
  const counts = { QB: {}, RB: {}, WR: {}, TE: {} };
  const fallback = {};

  for (const pos of Object.keys(byPositionAge)) {
    const raw = Object.entries(byPositionAge[pos])
      .map(([age, ppgs]) => ({ age: Number(age), medianPPG: median(ppgs), n: ppgs.length }))
      .sort((a, b) => a.age - b.age);
    for (const r of raw) counts[pos][r.age] = r.n;

    const smoothed = rollingAvg3(raw.map(({ age, medianPPG }) => ({ age, medianPPG })));
    curves[pos] = smoothed;
    fallback[pos] = false;

    if (smoothed.length > 0) {
      // eligible = smoothed points whose raw bucket has >= minRows rows; the youngest wins a tie (strict >)
      const eligible = smoothed.filter(p => (counts[pos][p.age] ?? 0) >= minRows);
      let derived;
      if (eligible.length > 0) {
        derived = eligible.reduce((best, p) => p.medianPPG > best.medianPPG ? p : best, eligible[0]).age;
      } else {
        derived = derivePeakAge(smoothed, pos).derivedPeakAge;
        fallback[pos] = true;
      }
      const { peakAge, peakPPG } = capAndNearest(smoothed, derived, pos);
      positionPeakPPG[pos] = peakPPG;
      positionPeakAge[pos] = peakAge;
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

  return { bundle: { curves, positionPeakPPG, positionPeakAge, positionBasisScale }, counts, fallback };
}

/**
 * A-AGE-DELTA's within-player curve (§8.11). `anchor` = the `guardedAgeCurves` result for the same inputs.
 * Returns { bundle, pairs[pos][age] = n(a), fallback[pos], floored[pos] }.
 */
export function deltaAgeCurves(careerStats, playersMap, { currentYear, anchor, minPairs = PEAK_GUARD_MIN_ROWS }) {
  const seasons = Object.keys(careerStats).map(Number).sort((a, b) => a - b);
  const deltas = { QB: {}, RB: {}, WR: {}, TE: {} };

  const ppgOf = (season, pid) => {
    const d = careerStats[season]?.[pid];
    if (!d || (d.gamesPlayed ?? 0) < 10) return null;
    const ppg = d.fantasyPoints / d.gamesPlayed;
    return Number.isFinite(ppg) ? ppg : null;
  };
  for (const s of seasons) {
    if (!careerStats[s + 1]) continue;
    for (const pid of Object.keys(careerStats[s])) {
      const player = playersMap[pid];
      if (!player || !SKILL_SET.has(player.position) || player.age == null) continue;
      const p0 = ppgOf(s, pid);
      if (p0 == null) continue;
      const p1 = ppgOf(s + 1, pid);
      if (p1 == null) continue;
      const a = Math.round(player.age - (currentYear - s));
      if (a < 18 || a > 41) continue;
      (deltas[player.position][a] ??= []).push(p1 - p0);
    }
  }

  const bundle = {
    curves: {}, positionPeakPPG: {}, positionPeakAge: {},
    positionBasisScale: { ...anchor.bundle.positionBasisScale },
  };
  const pairs = { QB: {}, RB: {}, WR: {}, TE: {} };
  const fallback = {};
  const floored = {};

  for (const pos of SKILL_POSITIONS) {
    const D = {};
    const n = {};
    for (const [age, ds] of Object.entries(deltas[pos])) {
      n[age] = ds.length;
      D[age] = ds.reduce((x, y) => x + y, 0) / ds.length;
      pairs[pos][age] = ds.length;
    }
    const useAnchor = () => {
      bundle.curves[pos] = anchor.bundle.curves[pos];
      bundle.positionPeakPPG[pos] = anchor.bundle.positionPeakPPG[pos];
      bundle.positionPeakAge[pos] = anchor.bundle.positionPeakAge[pos];
      fallback[pos] = true;
      floored[pos] = 0;
    };

    // anchor age: the most rows in H's buckets, younger on a tie
    let aStar = null, best = -1;
    for (const [age, c] of Object.entries(anchor.counts[pos] ?? {}).map(([a, c]) => [Number(a), c]).sort((x, y) => x[0] - y[0])) {
      if (c > best) { best = c; aStar = age; }
    }
    const anchorPoint = aStar == null ? null : anchor.bundle.curves[pos].find(p => p.age === aStar);
    if (!anchorPoint) { useAnchor(); continue; }

    let count = 0;
    const L = {};
    const put = (age, v) => {
      if (v < 1) { v = 1; count++; }
      L[age] = v;
    };
    put(aStar, anchorPoint.medianPPG);
    for (let a = aStar; (n[a] ?? 0) >= minPairs; a++) put(a + 1, L[a] + D[a]);
    for (let a = aStar - 1; (n[a] ?? 0) >= minPairs; a--) put(a, L[a + 1] - D[a]);

    const ages = Object.keys(L).map(Number).sort((a, b) => a - b);
    if (ages.length < 3) { useAnchor(); continue; }

    const curve = ages.map(age => ({ age, medianPPG: L[age] }));
    const derived = curve.reduce((b, p) => p.medianPPG > b.medianPPG ? p : b, curve[0]).age;
    const { peakAge, peakPPG } = capAndNearest(curve, derived, pos);
    bundle.curves[pos] = curve;
    bundle.positionPeakPPG[pos] = peakPPG;
    bundle.positionPeakAge[pos] = peakAge;
    fallback[pos] = false;
    floored[pos] = count;
  }

  return { bundle, pairs, fallback, floored };
}
