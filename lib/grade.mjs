/**
 * lib/grade.mjs — Pure, source-agnostic projection scorer.
 *
 * Knows nothing about snapshots, season-totals files, or the repo layout.
 * Consumes a GradeInput (produced by an adapter) and returns a GradeReport.
 *
 * The decoupling seam: any adapter that produces GradeInput can call
 * scoreProjections — today that's the snapshot adapter in
 * scripts/grade-snapshot.mjs; a future retro-backtest runner would add its own.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Minimum n for a factor correlation to be considered reliable.
 * Below this, the note field flags "low-n: interpret with caution".
 */
export const FACTOR_MIN_N = 30;

/**
 * Curated allow-list of numeric scalar factors eligible for residual correlation.
 * Confirmed against snapshots/2026-06-06.json:
 *   - All are numeric (not string / boolean / object)
 *   - None are predominantly null (>50% null when present)
 *   - Excluded: ktcHist* / adot* / positionMultiplicity* families (capture-only
 *     diagnostics that by app invariant do not move projectedPPG)
 *   - Excluded: ktcPct (53% null when present)
 *   - Excluded: booleans (isBreakout, isBounceBack, isTdReliant)
 *   - Excluded: nested objects (absenceShape, efficiencyMetrics)
 */
export const NUMERIC_FACTOR_KEYS = [
  // Present for all players (100%, 0% null)
  'basePPG',
  'ageDelta',
  'shareTrend',
  'regressionFactor',
  'durabilityFactor',
  'teamFactor',
  'depthFactor',
  'teamRzShareFactor',      // 100% present, 0% null — moves projectedPPG
  // Present for veteran players (~438/757), 0% null when present
  'consistencyScore',       // 37% null when present — below threshold, kept
  'momentumFactor',
  'absenceShapeFactor',
  'qbQualityFactor',
  'combinedNewFactor',
  'combinedNewFactorRaw',
  'breakoutFactor',
  'bounceBackFactor',
  'tdRelianceFactor',
  'trajectoryFactor',
  'efficiencyFactor',
  'snapShareFactor',
  'rzUsageFactor',
  'pipelinePPG',
  'compPPG',                // 27% null when present — below threshold, kept
  'compBlendWeight',
];

// ─── Stat primitives ──────────────────────────────────────────────────────────

/**
 * Mean absolute value of `values`. Returns null for empty input.
 * Pass signed errors (proj − actual) — the abs is applied internally.
 * @param {number[]} values
 * @returns {number|null}
 */
export function mae(values) {
  if (!values || values.length === 0) return null;
  return values.reduce((s, v) => s + Math.abs(v), 0) / values.length;
}

/**
 * Mean signed value of `values` (positive = over-projection). Returns null for empty input.
 * @param {number[]} values
 * @returns {number|null}
 */
export function bias(values) {
  if (!values || values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * Pearson correlation coefficient between xs and ys.
 * Returns null if n < 2, lengths differ, or either array has zero variance.
 * @param {number[]} xs
 * @param {number[]} ys
 * @returns {number|null}
 */
export function pearson(xs, ys) {
  if (!xs || !ys || xs.length < 2 || xs.length !== ys.length) return null;
  const n = xs.length;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  if (dx2 === 0 || dy2 === 0) return null;  // zero variance in one series
  return num / Math.sqrt(dx2 * dy2);
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Compute a MetricBlock for a set of graded player records.
 * Only players with played > 0 are passed here.
 */
function computeMetricBlock(records) {
  const n = records.length;
  if (n === 0) {
    return { n: 0, maePPG: null, biasPPG: null, maeTotal: null, biasTotal: null };
  }

  const ppgErrors = records.map(r => r.projectedPPG - r.actualPPG);

  // Total points: only include records where both projected and actual are finite
  const totalPairs = records.filter(
    r => r.projectedTotalPts != null && r.actualTotalPts != null
  );
  const totalErrors = totalPairs.map(r => r.projectedTotalPts - r.actualTotalPts);

  return {
    n,
    maePPG:   mae(ppgErrors),
    biasPPG:  bias(ppgErrors),
    maeTotal:  mae(totalErrors),
    biasTotal: bias(totalErrors),
  };
}

// ─── Scorer ───────────────────────────────────────────────────────────────────

const POSITIONS   = ['QB', 'RB', 'WR', 'TE', 'UNK'];
const CONFIDENCES = ['high', 'medium', 'low', 'rookie'];
const CALIB_ORDER = ['high', 'medium', 'low'];  // rookie excluded from calibration

/**
 * Grade a set of projections against their outcomes.
 *
 * @param {object} gradeInput  GradeInput as defined in the data-shapes contract.
 * @returns {object}           GradeReport (sans meta.gradedAt / harnessVersion —
 *                             those are added by the orchestration layer).
 */
export function scoreProjections(gradeInput) {
  const { meta, projections, outcomes } = gradeInput;

  // Accumulator buckets for graded (played > 0) records
  const gradedByPos  = Object.fromEntries(POSITIONS.map(p   => [p, []]));
  const gradedByConf = Object.fromEntries(CONFIDENCES.map(c => [c, []]));
  const allGraded    = [];

  let dnp = 0, absent = 0;

  // Games block: {diff} = projectedGames − actualGames for players with
  // projectedGames non-null AND an outcome record (even dnp).
  const gamesDiffs = [];

  // Factor correlations: Map<key, [{value, residual}]>
  const factorData = new Map(NUMERIC_FACTOR_KEYS.map(k => [k, []]));

  for (const proj of projections) {
    const outcome = outcomes.get(proj.playerId);

    if (!outcome) {
      absent++;
      continue;
    }

    // Games block — include all players with a joined outcome and non-null projGames
    if (proj.projectedGames != null) {
      gamesDiffs.push(proj.projectedGames - outcome.actualGames);
    }

    if (!outcome.played) {
      dnp++;
      continue;  // excluded from PPG metrics
    }

    // Graded player
    const rec = {
      projectedPPG:      proj.projectedPPG,
      projectedTotalPts: proj.projectedTotalPts ?? null,
      actualPPG:         outcome.actualPPG,
      actualTotalPts:    outcome.actualTotalPts,
    };

    allGraded.push(rec);

    const pos  = POSITIONS.includes(proj.position) ? proj.position : 'UNK';
    gradedByPos[pos].push(rec);

    const conf = CONFIDENCES.includes(proj.confidence) ? proj.confidence : 'low';
    gradedByConf[conf].push(rec);

    // Factor diagnostics — residual = actual − projected (positive = under-projection)
    const residual = outcome.actualPPG - proj.projectedPPG;
    if (proj.factors != null) {
      for (const key of NUMERIC_FACTOR_KEYS) {
        const val = proj.factors[key];
        if (val != null && Number.isFinite(val)) {
          factorData.get(key).push({ value: val, residual });
        }
      }
    }
  }

  // ── MetricBlocks ──────────────────────────────────────────────────────────

  const overall    = computeMetricBlock(allGraded);
  const byPosition = Object.fromEntries(POSITIONS.map(p   => [p, computeMetricBlock(gradedByPos[p])]));
  const byConfidence = Object.fromEntries(CONFIDENCES.map(c => [c, computeMetricBlock(gradedByConf[c])]));

  // ── Calibration ───────────────────────────────────────────────────────────

  const maeByBucket = Object.fromEntries(
    CALIB_ORDER.map(b => [b, byConfidence[b].maePPG])  // null when n === 0
  );

  // Monotonic = MAE(high) ≤ MAE(medium) ≤ MAE(low) among non-null buckets
  const availableMaes = CALIB_ORDER.map(b => maeByBucket[b]).filter(v => v !== null);
  let monotonic = true;
  for (let i = 1; i < availableMaes.length; i++) {
    if (availableMaes[i - 1] > availableMaes[i]) { monotonic = false; break; }
  }

  const calibration = {
    order:       CALIB_ORDER,
    maeByBucket,
    monotonic,
    note: 'Rookies are a separate population and excluded from this check. ' +
          'Monotonic = MAE(high) ≤ MAE(medium) ≤ MAE(low) among buckets with n > 0.',
  };

  // ── Games block ───────────────────────────────────────────────────────────

  const games = {
    mae:  mae(gamesDiffs),
    bias: bias(gamesDiffs),
    n:    gamesDiffs.length,
  };

  // ── Factor diagnostics ────────────────────────────────────────────────────

  const factorDiagnostics = [];
  for (const [factor, pairs] of factorData) {
    if (pairs.length === 0) continue;
    const xs = pairs.map(p => p.value);
    const ys = pairs.map(p => p.residual);
    const r  = pearson(xs, ys);
    const notes = [];
    if (pairs.length < FACTOR_MIN_N) notes.push('low-n: interpret with caution');
    if (r === null && pairs.length >= 2)  notes.push('zero variance: correlation undefined');
    factorDiagnostics.push({
      factor,
      n:    pairs.length,
      r,
      note: notes.join('; '),
    });
  }

  // ── Caveats ───────────────────────────────────────────────────────────────

  const caveats = [];
  if (!meta.basisMatch) {
    caveats.push(
      `Basis mismatch: projections are in '${meta.scoringBasis}' scoring but outcomes ` +
      `are canonical half_ppr. Absolute PPG MAE/bias conflates basis offset with ` +
      `projection error — treat as indicative only. ` +
      `Confidence-bucket ordering and the games block are basis-independent.`
    );
  }
  if (allGraded.length > 0 && allGraded.length < 20) {
    caveats.push(
      `Low graded-player count (${allGraded.length}) — per-bucket metrics ` +
      `may not be representative.`
    );
  }

  return {
    meta: { ...meta },
    counts: {
      projected: projections.length,
      graded:    allGraded.length,
      dnp,
      absent,
    },
    overall,
    byPosition,
    byConfidence,
    calibration,
    games,
    factorDiagnostics,
    caveats,
  };
}
