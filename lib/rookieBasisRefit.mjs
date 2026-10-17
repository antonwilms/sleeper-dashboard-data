/**
 * lib/rookieBasisRefit.mjs — D-45 (rookie-basis-refit): the league-basis refit of the rookie and prior constants. Pure, no I/O.
 *
 * Each of five constant families is refitted on league outcomes by the SAME recipe that produced its shipped half-PPR value,
 * and compared out of sample, on league-basis outcomes, against today's interim (the half-PPR recipe refitted on the training
 * folds × the as-of `positionBasisScale`). Both arms are in-fold (plan S2): the leakage asymmetry that made D-46's dynasty
 * pooled delta read WORSE on identical k cannot recur. The rule that turns the tables into `wire` / `do-not-wire` /
 * `stop-and-report` is `decideFamily` (written into the verdict by scripts/rookie-basis-run.mjs and committed BEFORE any league
 * run, plan §4 A3a).
 *
 *   F1  ROOKIE_BASELINE_PPG + ROOKIE_CALIBRATION   runF1  — recipe ported from the app test src/__tests__/rookieCalibration.test.js:81-235
 *       (tierGroup / ratioOfMeans / fitCellConstants / runLoyo) and the five-part minimum-n rule in docs/projection.md:282-288
 *   F2  ROOKIE_CEILING                             runF2  — p90 knee / p99 asymptote (computeCeilingReconciliation's quantile),
 *       leave-one-class-year-out as the committed Q5 protocol (app .claude/tasks/rookie-ceiling.md Q5)
 *   F3  QB_ROOKIE_STARTER_PPG                      runF3  — levelTable (Σ points ÷ Σ primary games, game-weighted, 3 dp)
 *   F4  ROOKIE_TOTAL_FACTOR                        runF4  — losoMultiplier / loso.decision (lib/rookieTotalPoints.mjs)
 *   F5  POSITION_PRIOR_PPG                         runF5  — the arm-A prospect prior as live (lib/inSeasonEvidence.mjs prospectPriorPPG)
 *
 * Hand-set levels (F1 baseline, F5 prior) are TRANSPORTED, not fitted (decision A1): the level stays the heuristic and the
 * veteran scale is replaced by ρ, the ratio measured on the population the constant serves.
 *
 * Imports lib/rookieMirror.mjs (for `liveEffect`): it must never be reachable from bin/panel.mjs's closure (T-RM1).
 */

import { reconstructRookieProjection, ROOKIE_BASELINE_PPG } from './projectionFactors.mjs';
import {
  ROOKIE_CALIBRATION, ROOKIE_CEILING, QB_ROOKIE_STARTER_PPG, ROOKIE_TOTAL_FACTOR,
  resolveRookieCalibration, applyRookieCeiling, resolveRookieTotalFactor,
} from './rookieMirror.mjs';
import { bootstrapPairedMean, compareLabel, IN_SEASON_DEFAULTS, prospectPriorPPG, PROSPECT_MIRROR } from './inSeasonEvidence.mjs';
import { levelTable } from './qbRookieLevel.mjs';
import { losoMultiplier, ROOKIE_TOTAL } from './rookieTotalPoints.mjs';

export const round1 = (x) => Math.round(x * 10) / 10;
export const round2 = (x) => Math.round(x * 100) / 100;
export const round3 = (x) => Math.round(x * 1e3) / 1e3;
const ROUND = { 1: round1, 2: round2, 3: round3 };
const POSITIONS = ['QB', 'RB', 'WR', 'TE'];
const sum = (xs) => xs.reduce((a, v) => a + v, 0);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** The pre-registered constants of the refit (plan §4.2 / §4.3). Nothing here is tuned after a result. */
export const ROOKIE_BASIS = Object.freeze({
  families: Object.freeze(['F1', 'F2', 'F3', 'F4', 'F5']),
  bootstrap: Object.freeze({ resamples: IN_SEASON_DEFAULTS.bootstrap.resamples, seed: IN_SEASON_DEFAULTS.bootstrap.seed, levels: Object.freeze([0.99]) }),
  // Labelling floors are per family (cellVerdict's 60 players / 300 rows would leave F1 and F3 with no labelled entry).
  floors: Object.freeze({
    F1: Object.freeze({ kind: 'rows', min: 30 }), F2: Object.freeze({ kind: 'rows', min: 30 }), F3: Object.freeze({ kind: 'players', min: 10 }),
    F4: Object.freeze({ kind: 'rows', min: 30 }), F5: Object.freeze({ kind: 'players', min: 30 }),
  }),
  // Decimal places at which a full-sample league value "equals" the full-sample interim value (entry `same`): the constant's committed precision.
  sameDp: Object.freeze({ F1: 2, F2: 2, F3: 3, F4: 3, F5: 2 }),
  maxDecidingEntries: Object.freeze({ F1: 16, F2: 8, F3: 3, F4: 2, F5: 1 }),
  pooledLevel: 0.99,
  calibrationBands: Object.freeze({ low: 10, high: 30 }),
  basisScaleSeason: 2026,
  clampMax: 40,
});

// ─── shared statistics ──────────────────────────────────────────────────────────────────────────────

/**
 * One entry's (or one family pool's) paired delta d = loss(refit) − loss(interim): the unweighted mean, clustered by `ids`,
 * with the pinned bootstrap (4000, seed 12345) and its 95% and 99% intervals. `label` is compareLabel on the 95% interval
 * unless the entry is below its family floor (`INSUFFICIENT`: reported, pooled, never labelled).
 */
export function summarizeDeltas(ids, diffs, { floor = null, bootstrap = ROOKIE_BASIS.bootstrap } = {}) {
  const rows = diffs.length;
  const players = new Set(ids).size;
  const count = floor ? (floor.kind === 'players' ? players : rows) : Infinity;
  const insufficient = floor ? count < floor.min : false;
  const b = rows ? bootstrapPairedMean(ids, diffs, bootstrap) : null;
  const finite = diffs.filter(Number.isFinite);
  const statLabel = b ? compareLabel(b.ci95) : null;
  return {
    rows, players,
    mean: finite.length ? sum(finite) / finite.length : null,
    ci95: b?.ci95 ?? null, ci99: b?.ci99 ?? null,
    statLabel, label: insufficient ? 'INSUFFICIENT' : statLabel, insufficient,
  };
}

/** `same`: the full-sample league value equals the full-sample interim value at the family's committed precision. */
export function sameAt(leagueValue, interimValue, dp) {
  if (!Number.isFinite(leagueValue) || !Number.isFinite(interimValue)) return false;
  return ROUND[dp](leagueValue) === ROUND[dp](interimValue);
}

function entryOf(key, parts, summary, extra = {}) {
  const same = extra.same ?? false;
  return { key, ...parts, ...summary, same, label: same && !summary.insufficient ? 'SAME' : summary.label, ...extra };
}

function groupBy(items, keyOf) {
  const m = new Map();
  for (const it of items) {
    const k = keyOf(it);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(it);
  }
  return m;
}

// ─── the decision rule (plan §4.3) ──────────────────────────────────────────────────────────────────

/**
 * entries: [{ key, deciding = true, insufficient, same, statLabel }]   pooled: { ci99 } | null
 * A labelled entry = deciding, at or above its floor, not `same`; a `same` entry labelled WORSE (deciding, above floor) still blocks a wire.
 *   stop-and-report iff G0 fails for the family, its structural check fails, a pinned artifact it reproduces did not reproduce at
 *                    baseline, or §4.6 trips;
 *   do-not-wire if every entry is `same` (whatever the pooled delta);
 *   wire iff ≥ 1 labelled entry BEATS, no labelled entry WORSE (nor a `same` one), the pooled 99% interval is entirely below 0 (the structural check holds);
 *   otherwise do-not-wire.
 */
export function decideFamily({ entries, pooled, structuralOk = true, g0Ok = true, pinnedOk = true, trip46 = false }) {
  const reasons = [];
  if (!g0Ok) reasons.push('G0 failed for this family');
  if (!structuralOk) reasons.push('structural check failed');
  if (!pinnedOk) reasons.push('a pinned artifact this family reproduces did not reproduce at baseline (plan §2.6)');
  if (trip46) reasons.push('§4.6 consistency re-run tripped');
  const labelled = entries.filter((e) => e.deciding !== false && !e.insufficient && !e.same);
  const beats = labelled.filter((e) => e.statLabel === 'BEATS').map((e) => e.key);
  // A `same` entry never counts as the required BEATS, but a `same` entry labelled WORSE still blocks a wire (plan §4.3).
  const worse = entries.filter((e) => e.deciding !== false && !e.insufficient && e.statLabel === 'WORSE').map((e) => e.key);
  const allSame = entries.length > 0 && entries.every((e) => e.same === true);
  const pooledBelow0 = Array.isArray(pooled?.ci99) && pooled.ci99[1] < 0;
  const base = { beats, worse, labelled: labelled.length, allSame, pooledBelow0 };
  if (reasons.length) return { verdict: 'stop-and-report', reasons, ...base };
  if (allSame) return { verdict: 'do-not-wire', reasons: ['every entry is `same` — a pooled delta on identical values measures fold noise only'], ...base };
  const wire = beats.length > 0 && worse.length === 0 && pooledBelow0;
  if (wire) return { verdict: 'wire', reasons: [`BEATS ${beats.join(', ')}; no WORSE; pooled 99% interval below 0`], ...base };
  const why = [];
  why.push(beats.length ? `BEATS ${beats.join(', ')}` : 'no labelled entry BEATS');
  if (worse.length) why.push(`WORSE ${worse.join(', ')}`);
  why.push(pooledBelow0 ? 'pooled 99% interval below 0' : `pooled 99% interval ${pooled?.ci99 ? `[${pooled.ci99.map(round3).join(', ')}] not below 0` : 'unavailable'}`);
  return { verdict: 'do-not-wire', reasons: [why.join('; ')], ...base };
}

/** Multiplicity exposure: the labelled (deciding, above-floor) entries across the families and the expected spurious labels at 95%. */
export function multiplicity(familyResults) {
  const n = sum(Object.values(familyResults).map((f) => f.entries.filter((e) => e.deciding !== false && !e.insufficient).length));
  const max = sum(Object.values(ROOKIE_BASIS.maxDecidingEntries));
  return { labelledEntries: n, maxEntries: max, expectedSpurious: 0.05 * n, expectedSpuriousAtMax: 0.05 * max };
}

// ─── F1 — ROOKIE_BASELINE_PPG + ROOKIE_CALIBRATION ──────────────────────────────────────────────────

const DAY3 = new Set(['r4', 'r5', 'r6', 'r7']);
const DAY2 = new Set(['r2', 'r3']);
const R1 = new Set(['top-3', 'top-8', 'r1-mid', 'r1-late']);

/**
 * App rookieCalibration.test.js tierGroup, with ONE stated mapping: the data panel carries `nflDraftTier: null` where the app
 * fixture says 'unmatched' (366 rows); both are `undrafted` (plan review reproduced all 8 shipped cells at 2 dp with it).
 */
export function tierGroup(t) {
  if (t == null || t === 'unmatched') return 'undrafted';
  if (DAY3.has(t)) return 'day3';
  if (DAY2.has(t)) return 'day2';
  if (R1.has(t)) return 'r1';
  return null;
}

/**
 * App fitCellConstants (rookieCalibration.test.js:131-163, shipped protocol, no lift) with docs/projection.md:282-288's rules:
 * 1. n >= 30 → own ratio of means (Σ realised ÷ Σ projected); 2. 10 <= n < 30 → own ratio floored at the group-pooled ratio;
 * 3. n < 10 → 1.00; 4. no further shrinkage; 5. every cell above 1.00 clamped to 1.00. r1 and day2 take 1.00 (no correction).
 * trainRows: [{ tier, pos, o, pr }] → Map `${group}:${pos}` → { c, n, band, raw }.
 */
export function fitCellConstants(trainRows) {
  const cellStats = new Map(), poolStats = new Map();
  for (const r of trainRows) {
    const g = tierGroup(r.tier);
    if (g == null) continue;
    const cellKey = `${g}:${r.pos}`;
    const cell = cellStats.get(cellKey) ?? { o: 0, pr: 0, n: 0 };
    cell.o += r.o; cell.pr += r.pr; cell.n += 1;
    cellStats.set(cellKey, cell);
    const pool = poolStats.get(g) ?? { o: 0, pr: 0, n: 0 };
    pool.o += r.o; pool.pr += r.pr; pool.n += 1;
    poolStats.set(g, pool);
  }
  const { low, high } = ROOKIE_BASIS.calibrationBands;
  const constants = new Map();
  for (const [cellKey, { o, pr, n }] of cellStats) {
    const [g] = cellKey.split(':');
    if (g === 'r1' || g === 'day2') { constants.set(cellKey, { c: 1.0, n, band: 'none', raw: pr > 0 ? o / pr : 1.0 }); continue; }
    const pool = poolStats.get(g);
    const pooledRatio = pool.pr > 0 ? pool.o / pool.pr : 1.0;
    const raw = pr > 0 ? o / pr : 1.0;
    let c, band;
    if (n < low) { c = 1.0; band = `n<${low}`; }
    else if (n < high) { c = Math.max(raw, pooledRatio); band = `${low}<=n<${high}`; }
    else { c = raw; band = `n>=${high}`; }
    constants.set(cellKey, { c: Math.min(c, 1.0), n, band, raw });
  }
  return constants;
}

/** ρ(pos) = Σ league outcome ÷ Σ half outcome over `rows` of the position (3 dp); 1 when the half sum is not positive. */
export function ratioByPosition(rows, leagueOf, halfOf) {
  const rho = {};
  for (const pos of POSITIONS) {
    const rs = rows.filter((r) => r.pos === pos);
    const h = sum(rs.map(halfOf)), l = sum(rs.map(leagueOf));
    rho[pos] = h > 0 ? round3(l / h) : 1;
  }
  return rho;
}

const calibrationTable = (fit) => {
  const t = { undrafted: {}, day3: {} };
  for (const g of ['undrafted', 'day3']) for (const pos of POSITIONS) { const c = fit.get(`${g}:${pos}`)?.c; t[g][pos] = round2(c ?? 1.0); }
  return t;
};

/**
 * G0b for F1 — touches the half-PPR columns only (no league outcome is read): the recipe on the half rows reproduces the shipped
 * ROOKIE_CALIBRATION (all 8 cells, 2 dp) and every row's projectedPPG is round1(baseline_H × cappedProduct).
 */
export function g0bF1({ rows, baselineH = ROOKIE_BASELINE_PPG, shippedCalibration = ROOKIE_CALIBRATION }) {
  const calH = calibrationTable(fitCellConstants(rows.map((r) => ({ tier: r.tier, pos: r.pos, o: r.oH, pr: r.prH }))));
  const parityMismatches = rows.filter((r) => round1(baselineH[r.pos] * r.cp) !== r.prH).length;
  const calibrationMismatches = [];
  for (const g of ['undrafted', 'day3']) for (const pos of POSITIONS) if (calH[g][pos] !== shippedCalibration[g][pos]) calibrationMismatches.push({ cell: `${g}:${pos}`, recipe: calH[g][pos], shipped: shippedCalibration[g][pos] });
  return { ok: parityMismatches === 0 && calibrationMismatches.length === 0, parityMismatches, calibrationMismatches, rows: rows.length };
}

/**
 * F1. rows: the legacy gated rookie panel (gp >= 6), one per (player, predictor year):
 *   { id: sleeperId, key, year: predictorYear, pos, tier: nflDraftTier, cp: cappedProduct, prH: projectedPPG, oH, oL, s: as-of scale of year+1 }
 * Interim arm: calibration_H by the recipe on half rows (training folds); level = baseline_H × s × cp × calibration_H.
 * Refit arm: ρ(pos) on the training rows, baseline_L = round3(baseline_H × ρ); calibration_L by the recipe on league outcomes against
 * round1(baseline_L × cp); level = baseline_L × cp × calibration_L. Folds: leave-one-predictor-year-out. Loss: |oL − clamp(level, 0, 40)|.
 */
export function runF1({ rows, baselineH = ROOKIE_BASELINE_PPG, s2026, shippedCalibration = ROOKIE_CALIBRATION, bootstrap = ROOKIE_BASIS.bootstrap }) {
  const years = [...new Set(rows.map((r) => r.year))].sort((a, b) => a - b);
  const entries = new Map();   // `${group}:${pos}` → { ids, dI: [], dR: [] }
  const all = { ids: [], diffs: [] };
  let bindingInterim = 0, bindingRefit = 0;
  for (const y of years) {
    const train = rows.filter((r) => r.year !== y), test = rows.filter((r) => r.year === y);
    const calH = fitCellConstants(train.map((r) => ({ tier: r.tier, pos: r.pos, o: r.oH, pr: r.prH })));
    const rho = ratioByPosition(train, (r) => r.oL, (r) => r.oH);
    const baseL = Object.fromEntries(POSITIONS.map((pos) => [pos, round3(baselineH[pos] * rho[pos])]));
    const calL = fitCellConstants(train.map((r) => ({ tier: r.tier, pos: r.pos, o: r.oL, pr: round1(baseL[r.pos] * r.cp) })));
    for (const r of test) {
      const g = tierGroup(r.tier);
      const cell = `${g}:${r.pos}`;
      const levelI = baselineH[r.pos] * r.s * r.cp * (calH.get(cell)?.c ?? 1.0);
      const levelR = baseL[r.pos] * r.cp * (calL.get(cell)?.c ?? 1.0);
      if (levelI < 0 || levelI > ROOKIE_BASIS.clampMax) bindingInterim++;
      if (levelR < 0 || levelR > ROOKIE_BASIS.clampMax) bindingRefit++;
      const lossI = Math.abs(r.oL - clamp(levelI, 0, ROOKIE_BASIS.clampMax));
      const lossR = Math.abs(r.oL - clamp(levelR, 0, ROOKIE_BASIS.clampMax));
      const d = lossR - lossI;
      if (!entries.has(cell)) entries.set(cell, { group: g, pos: r.pos, ids: [], diffs: [] });
      const e = entries.get(cell);
      e.ids.push(r.id); e.diffs.push(d);
      all.ids.push(r.id); all.diffs.push(d);
    }
  }

  // full sample — what the app would pin
  const calHFull = fitCellConstants(rows.map((r) => ({ tier: r.tier, pos: r.pos, o: r.oH, pr: r.prH })));
  const rhoFull = ratioByPosition(rows, (r) => r.oL, (r) => r.oH);
  const baseLFull = Object.fromEntries(POSITIONS.map((pos) => [pos, round3(baselineH[pos] * rhoFull[pos])]));
  const calLFull = fitCellConstants(rows.map((r) => ({ tier: r.tier, pos: r.pos, o: r.oL, pr: round1(baseLFull[r.pos] * r.cp) })));
  const calHTable = calibrationTable(calHFull), calLTable = calibrationTable(calLFull);
  const interimBaseline = Object.fromEntries(POSITIONS.map((pos) => [pos, round3(baselineH[pos] * s2026[pos])]));

  const floor = ROOKIE_BASIS.floors.F1, dp = ROOKIE_BASIS.sameDp.F1;
  const out = [];
  for (const group of ['r1', 'day2', 'day3', 'undrafted']) {
    for (const pos of POSITIONS) {
      const cell = `${group}:${pos}`;
      const e = entries.get(cell) ?? { group, pos, ids: [], diffs: [] };
      const calI = group === 'r1' || group === 'day2' ? 1.0 : calHTable[group][pos];
      const calR = group === 'r1' || group === 'day2' ? 1.0 : calLTable[group][pos];
      const effInterim = round2(interimBaseline[pos] * calI), effLeague = round2(baseLFull[pos] * calR);
      out.push(entryOf(cell, { group, pos }, summarizeDeltas(e.ids, e.diffs, { floor, bootstrap }), {
        same: sameAt(effLeague, effInterim, dp), sameDetail: { effectiveInterim: effInterim, effectiveLeague: effLeague, dp },
      }));
    }
  }

  const correctedOf = (fit) => [...fit].filter(([cell, v]) => !cell.startsWith('r1:') && !cell.startsWith('day2:') && round2(v.c) < 1.0).map(([cell]) => cell).sort();
  const bandsOf = (fit) => Object.fromEntries([...fit].map(([cell, v]) => [cell, v.band]).sort(([a], [b]) => (a < b ? -1 : 1)));
  const structural = {
    correctedHalf: correctedOf(calHFull), correctedLeague: correctedOf(calLFull),
    bandsHalf: bandsOf(calHFull), bandsLeague: bandsOf(calLFull),
  };
  structural.ok = JSON.stringify(structural.correctedHalf) === JSON.stringify(structural.correctedLeague)
    && JSON.stringify(structural.bandsHalf) === JSON.stringify(structural.bandsLeague);


  return {
    id: 'F1', recipe: 'tierGroup / fitCellConstants / five-part minimum-n rule; ρ-transport of the hand-set baseline (decision A1)',
    folds: years.length, rows: rows.length,
    entries: out, pooled: summarizeDeltas(all.ids, all.diffs, { bootstrap }), structural,
    fullSample: {
      half: { calibration: calHTable, baselinePPG: { ...baselineH } },
      interim: { baselinePPG: interimBaseline, calibration: calHTable, scale: s2026 },
      league: { baselinePPG: baseLFull, calibration: calLTable, rho: rhoFull },
      cells: Object.fromEntries([...calLFull].map(([cell, v]) => [cell, { n: v.n, band: v.band, rawLeague: round3(v.raw), c: round2(v.c), rawHalf: round3(calHFull.get(cell)?.raw ?? NaN) }])),
    },
    constants: { baselinePPG: baseLFull, calibration: calLTable },
    g0b: g0bF1({ rows, baselineH, shippedCalibration }),
    clampBinding: { interim: bindingInterim, refit: bindingRefit },
  };
}

// ─── F2 — ROOKIE_CEILING ────────────────────────────────────────────────────────────────────────────

/** Pinball (quantile) loss of the forecast `q` for the outcome `y` at level τ — a proper score for a quantile. */
export function pinball(tau, y, q) {
  return y >= q ? tau * (y - q) : (1 - tau) * (q - y);
}

const ceilingFit = (quantile, vals) => {
  const sorted = [...vals].sort((a, b) => a - b);
  return { knee: sorted.length ? round2(quantile(sorted, 0.90)) : null, asymptote: sorted.length ? round2(quantile(sorted, 0.99)) : null };
};

/** G0b for F2 — half columns only: the p90/p99 of the half debut PPG (gp >= 8), 2 dp, equal ROOKIE_CEILING at every position. */
export function g0bF2({ rows, quantile, shipped = ROOKIE_CEILING }) {
  const mismatches = [];
  for (const pos of POSITIONS) {
    const q = ceilingFit(quantile, rows.filter((r) => r.pos === pos).map((r) => r.yH));
    if (q.knee !== shipped[pos].knee || q.asymptote !== shipped[pos].asymptote) mismatches.push({ pos, recipe: [q.knee, q.asymptote], shipped: [shipped[pos].knee, shipped[pos].asymptote] });
  }
  return { ok: mismatches.length === 0, mismatches };
}

/**
 * F2. rows: the debut rookie panel rows with gp >= 8 (classes 2013–2025): { id, pos, classYear, yH, yL, s: as-of scale of classYear }.
 * `quantile(sortedValues, p)` is scripts/panel-run.mjs's (zero-based p*(n-1), linear interpolation), injected so this module stays pure.
 * Interim: half quantiles of the other classes (2 dp) × s(pos, class); refit: league quantiles of the other classes (2 dp).
 * Folds: leave-one-class-year-out. Loss: pinball at τ = 0.90 against the knee and 0.99 against the asymptote on the held-out
 * league debut PPG. Entries: position × {knee, asymptote}; the pooled delta is per row (the mean of the row's knee and asymptote deltas).
 */
export function runF2({ rows, quantile, shipped = ROOKIE_CEILING, s2026, bootstrap = ROOKIE_BASIS.bootstrap }) {
  const fitQ = (vals) => ceilingFit(quantile, vals);
  const classes = [...new Set(rows.map((r) => r.classYear))].sort((a, b) => a - b);
  const kinds = [['knee', 0.90], ['asymptote', 0.99]];
  const entries = new Map(POSITIONS.flatMap((pos) => kinds.map(([k]) => [`${pos}:${k}`, { pos, kind: k, ids: [], diffs: [] }])));
  const exceed = Object.fromEntries(POSITIONS.map((pos) => [pos, { n: 0, interim: { knee: 0, asymptote: 0 }, refit: { knee: 0, asymptote: 0 } }]));
  const pooled = { ids: [], diffs: [] };
  let foldViolations = 0;
  for (const c of classes) {
    for (const pos of POSITIONS) {
      const train = rows.filter((r) => r.pos === pos && r.classYear !== c), test = rows.filter((r) => r.pos === pos && r.classYear === c);
      if (!test.length) continue;
      const qH = fitQ(train.map((r) => r.yH)), qL = fitQ(train.map((r) => r.yL));
      if (!(qL.knee < qL.asymptote)) foldViolations++;
      for (const r of test) {
        const interim = { knee: qH.knee * r.s, asymptote: qH.asymptote * r.s };
        const dRow = [];
        for (const [k, tau] of kinds) {
          const d = pinball(tau, r.yL, qL[k]) - pinball(tau, r.yL, interim[k]);
          const e = entries.get(`${pos}:${k}`);
          e.ids.push(r.id); e.diffs.push(d);
          dRow.push(d);
          if (r.yL > interim[k]) exceed[pos].interim[k]++;
          if (r.yL > qL[k]) exceed[pos].refit[k]++;
        }
        exceed[pos].n++;
        pooled.ids.push(r.id); pooled.diffs.push((dRow[0] + dRow[1]) / 2);
      }
    }
  }
  const halfFull = {}, leagueFull = {}, interimFull = {};
  for (const pos of POSITIONS) {
    const rs = rows.filter((r) => r.pos === pos);
    halfFull[pos] = { ...fitQ(rs.map((r) => r.yH)), n: rs.length };
    leagueFull[pos] = { ...fitQ(rs.map((r) => r.yL)), n: rs.length };
    interimFull[pos] = { knee: halfFull[pos].knee * s2026[pos], asymptote: halfFull[pos].asymptote * s2026[pos] };
  }
  const floor = ROOKIE_BASIS.floors.F2, dp = ROOKIE_BASIS.sameDp.F2;
  const out = [];
  for (const pos of POSITIONS) {
    for (const [k] of kinds) {
      const e = entries.get(`${pos}:${k}`);
      out.push(entryOf(`${pos}:${k}`, { pos, kind: k }, summarizeDeltas(e.ids, e.diffs, { floor, bootstrap }), {
        same: sameAt(leagueFull[pos][k], interimFull[pos][k], dp),
        sameDetail: { league: leagueFull[pos][k], interim: round2(interimFull[pos][k]), dp },
      }));
    }
  }
  const exceedance = {};
  for (const pos of POSITIONS) {
    const x = exceed[pos];
    exceedance[pos] = {
      n: x.n,
      interim: { knee: x.n ? x.interim.knee / x.n : null, asymptote: x.n ? x.interim.asymptote / x.n : null },
      refit: { knee: x.n ? x.refit.knee / x.n : null, asymptote: x.n ? x.refit.asymptote / x.n : null },
    };
  }
  const structural = { ok: POSITIONS.every((pos) => leagueFull[pos].knee < leagueFull[pos].asymptote), foldViolations, kneeBelowAsymptote: Object.fromEntries(POSITIONS.map((pos) => [pos, leagueFull[pos].knee < leagueFull[pos].asymptote])) };
  return {
    id: 'F2', recipe: 'p90 knee / p99 asymptote of debut PPG (gp >= 8), 2 dp; leave-one-class-year-out (Q5); pinball loss at τ = 0.90 / 0.99',
    folds: classes.length, rows: rows.length,
    entries: out, pooled: summarizeDeltas(pooled.ids, pooled.diffs, { bootstrap }), structural, exceedance,
    fullSample: { half: halfFull, interim: Object.fromEntries(POSITIONS.map((pos) => [pos, { knee: round2(interimFull[pos].knee), asymptote: round2(interimFull[pos].asymptote) }])), league: leagueFull, scale: s2026 },
    constants: { ceiling: Object.fromEntries(POSITIONS.map((pos) => [pos, { knee: leagueFull[pos].knee, asymptote: leagueFull[pos].asymptote }])) },
    g0b: g0bF2({ rows, quantile, shipped }),
  };
}

// ─── F3 — QB_ROOKIE_STARTER_PPG ─────────────────────────────────────────────────────────────────────

const F3_GROUPS = ['top12', 'r1', 'day2', 'day3+'];
const f3Table = (games, ptsKey) => levelTable(games.map((g) => ({ ...g, pts: g[ptsKey] })));

/** G0b for F3 — half columns only: levelTable of the half primary-game points equals QB_ROOKIE_STARTER_PPG (4 groups, 3 dp). */
export function g0bF3({ games, shipped = QB_ROOKIE_STARTER_PPG }) {
  const t = f3Table(games, 'ptsH');
  const mismatches = F3_GROUPS.filter((g) => t[g].value !== shipped[g]).map((g) => ({ group: g, recipe: t[g].value, shipped: shipped[g] }));
  return { ok: mismatches.length === 0, mismatches };
}

/**
 * F3. games: every rookie-QB primary game { pid, S, group, ptsH, ptsL }; units: the Q3 units (rookie-season with >= 3 primary games)
 * { pid, S, group, yL } (the unit's league PPG). `sQB(S)` = the as-of QB scale of season S; `s2026QB` the 2026 one.
 * Interim: half level in-fold × sQB(S); refit: league level in-fold. Level = levelTable (round3(round2(Σpts) ÷ Σgames)) over the
 * training seasons' games; a group with no training games falls back to the training pool (counted). Loss per unit: |yL − level|.
 */
export function runF3({ games, units, sQB, s2026QB, shipped = QB_ROOKIE_STARTER_PPG, bootstrap = ROOKIE_BASIS.bootstrap }) {
  const GROUPS = F3_GROUPS;
  const tableOf = f3Table;
  const seasons = [...new Set(units.map((u) => u.S))].sort((a, b) => a - b);
  const entries = new Map(GROUPS.map((g) => [g, { ids: [], diffs: [] }]));
  const pooled = { ids: [], diffs: [] };
  let fallbacks = 0;
  for (const S of seasons) {
    const train = games.filter((g) => g.S !== S);
    const tH = tableOf(train, 'ptsH'), tL = tableOf(train, 'ptsL');
    for (const u of units.filter((x) => x.S === S)) {
      let h = tH[u.group].value, l = tL[u.group].value;
      if (h == null || l == null) { h = tH.pooled.value; l = tL.pooled.value; fallbacks++; }
      const d = Math.abs(u.yL - l) - Math.abs(u.yL - h * sQB(S));
      entries.get(u.group).ids.push(u.pid); entries.get(u.group).diffs.push(d);
      pooled.ids.push(u.pid); pooled.diffs.push(d);
    }
  }
  const tHFull = tableOf(games, 'ptsH'), tLFull = tableOf(games, 'ptsL');
  const floor = ROOKIE_BASIS.floors.F3, dp = ROOKIE_BASIS.sameDp.F3;
  const interimFull = Object.fromEntries(GROUPS.map((g) => [g, tHFull[g].value == null ? null : round3(tHFull[g].value * s2026QB)]));
  const out = GROUPS.map((g) => {
    const e = entries.get(g);
    return entryOf(g, { group: g }, summarizeDeltas(e.ids, e.diffs, { floor, bootstrap }), {
      same: sameAt(tLFull[g].value, interimFull[g], dp), sameDetail: { league: tLFull[g].value, interim: interimFull[g], dp },
    });
  });
  const structural = { ok: GROUPS.every((g) => tHFull[g].players > 0 && tLFull[g].players > 0), players: Object.fromEntries(GROUPS.map((g) => [g, tLFull[g].players])) };
  return {
    id: 'F3', recipe: 'levelTable: Σ points ÷ Σ primary games, game-weighted, 3 dp; leave-one-season-out; loss |unit league PPG − group level| per unit',
    folds: seasons.length, rows: units.length, fallbacks,
    entries: out, pooled: summarizeDeltas(pooled.ids, pooled.diffs, { bootstrap }), structural,
    fullSample: {
      half: Object.fromEntries(GROUPS.map((g) => [g, tHFull[g].value])), interim: interimFull,
      league: Object.fromEntries(GROUPS.map((g) => [g, tLFull[g].value])), scale: s2026QB,
      unitsByGroup: Object.fromEntries(GROUPS.map((g) => [g, units.filter((u) => u.group === g).length])),
    },
    constants: { qbStarterPPG: Object.fromEntries(GROUPS.map((g) => [g, tLFull[g].value])) },
    g0b: g0bF3({ games, shipped }),
  };
}

// ─── F4 — ROOKIE_TOTAL_FACTOR ───────────────────────────────────────────────────────────────────────

/** G0b for F4 — half columns only: the loso.decision recipe on the half decision rows reproduces ROOKIE_TOTAL_FACTOR (2 groups, 3 dp). */
export function g0bF4({ rows, shipped = ROOKIE_TOTAL_FACTOR }) {
  const l = losoMultiplier(rows.map((r) => ({ predTotal: r.predH, outcomeTotalPts: r.realH, targetSeason: r.season, group: r.group })), (r) => r.group);
  const mismatches = ROOKIE_TOTAL.decisionGroups.filter((g) => round3(l.fullSample[g]) !== shipped[g]).map((g) => ({ group: g, recipe: round3(l.fullSample[g]), shipped: shipped[g] }));
  return { ok: mismatches.length === 0, mismatches };
}

/**
 * F4. rows: the decision rows (RB/WR/TE of day3 and undrafted) { id, season, group, predH, realH, predS, realL } — predH the half scale-1
 * composition against half realised totals (today's recipe); predS the composition the app would ship (F1/F2 at league if wire, else
 * interim) against league realised. Interim: factor_H fitted in-fold on (predH, realH), applied to predS. Refit: factor_L fitted in-fold
 * on (predS, realL), applied to predS. Folds: leave-one-season-out (losoMultiplier). Loss: |realL − factor × predS|.
 */
export function runF4({ rows, shipped = ROOKIE_TOTAL_FACTOR, bootstrap = ROOKIE_BASIS.bootstrap }) {
  const mk = (pred, real) => rows.map((r) => ({ predTotal: r[pred], outcomeTotalPts: r[real], targetSeason: r.season, group: r.group }));
  const lH = losoMultiplier(mk('predH', 'realH'), (r) => r.group);
  const lL = losoMultiplier(mk('predS', 'realL'), (r) => r.group);
  const mOf = (l) => new Map(l.folds.map((f) => [f.S, f.m]));
  const mH = mOf(lH), mL = mOf(lL);
  const entries = new Map(ROOKIE_TOTAL.decisionGroups.map((g) => [g, { ids: [], diffs: [] }]));
  const pooled = { ids: [], diffs: [] };
  for (const r of rows) {
    const fH = mH.get(r.season)?.[r.group] ?? 1, fL = mL.get(r.season)?.[r.group] ?? 1;
    const d = Math.abs(r.realL - fL * r.predS) - Math.abs(r.realL - fH * r.predS);
    entries.get(r.group).ids.push(r.id); entries.get(r.group).diffs.push(d);
    pooled.ids.push(r.id); pooled.diffs.push(d);
  }
  const floor = ROOKIE_BASIS.floors.F4, dp = ROOKIE_BASIS.sameDp.F4;
  const out = ROOKIE_TOTAL.decisionGroups.map((g) => {
    const e = entries.get(g);
    const fh = round3(lH.fullSample[g]), fl = round3(lL.fullSample[g]);
    return entryOf(g, { group: g }, summarizeDeltas(e.ids, e.diffs, { floor, bootstrap }), { same: sameAt(fl, fh, dp), sameDetail: { league: fl, interim: fh, dp } });
  });
  return {
    id: 'F4', recipe: 'losoMultiplier / loso.decision: Σ realised ÷ Σ predicted total per group, leave-one-season-out; both arms applied to the shipped composition',
    folds: new Set(rows.map((r) => r.season)).size, rows: rows.length,
    entries: out, pooled: summarizeDeltas(pooled.ids, pooled.diffs, { bootstrap }), structural: { ok: true, note: 'none specified for F4' },
    fullSample: {
      half: Object.fromEntries(ROOKIE_TOTAL.decisionGroups.map((g) => [g, round3(lH.fullSample[g])])),
      interim: Object.fromEntries(ROOKIE_TOTAL.decisionGroups.map((g) => [g, round3(lH.fullSample[g])])),
      league: Object.fromEntries(ROOKIE_TOTAL.decisionGroups.map((g) => [g, round3(lL.fullSample[g])])),
    },
    constants: { totalFactor: Object.fromEntries(ROOKIE_TOTAL.decisionGroups.map((g) => [g, round3(lL.fullSample[g])])) },
    g0b: g0bF4({ rows, shipped }),
  };
}

// ─── F5 — POSITION_PRIOR_PPG ────────────────────────────────────────────────────────────────────────

/**
 * F5. rows: one per player-season of the 2c Q1 admitted rows (second-year players, S+2 outcome): { id: sleeperId, S, pos, age, pickForA,
 * sm1, yH, yL, s: as-of scale of S }. The arm-A prior as live: POSITION_PRIOR_PPG × scale × ageMultiplier × draftMultiplier, then the
 * completed-season blend 8 : min(gp, 12) with sm1 (the S-1 season, league points under the league run).
 * Interim: constant × s(pos, S). Refit: constant_L = round3(constant × ρA(pos)), ρA = Σ league yL ÷ Σ half yH over the training rows,
 * read at scale 1. Folds: leave-one-season-out. Loss: |yL − prior|. Entries: the four positions; only `decides` positions decide (WR).
 */
export function runF5({ rows, constants = PROSPECT_MIRROR.positionPriorPPG, s2026, decides = ['WR'], bootstrap = ROOKIE_BASIS.bootstrap }) {
  const priorOf = (r, constant, basisScale) => prospectPriorPPG({ position: r.pos, age: r.age, pick: r.pickForA, sm1: r.sm1, basisScale, positionPriorPPG: { [r.pos]: constant } }).prospectPPG;
  const seasons = [...new Set(rows.map((r) => r.S))].sort((a, b) => a - b);
  const entries = new Map(POSITIONS.map((pos) => [pos, { ids: [], diffs: [] }]));
  for (const S of seasons) {
    const train = rows.filter((r) => r.S !== S);
    const rho = ratioByPosition(train, (r) => r.yL, (r) => r.yH);
    for (const r of rows.filter((x) => x.S === S)) {
      const constL = round3(constants[r.pos] * rho[r.pos]);
      const d = Math.abs(r.yL - priorOf(r, constL, 1)) - Math.abs(r.yL - priorOf(r, constants[r.pos], r.s));
      entries.get(r.pos).ids.push(r.id); entries.get(r.pos).diffs.push(d);
    }
  }
  const rhoFull = ratioByPosition(rows, (r) => r.yL, (r) => r.yH);
  const constLFull = Object.fromEntries(POSITIONS.map((pos) => [pos, round3(constants[pos] * rhoFull[pos])]));
  const interimFull = Object.fromEntries(POSITIONS.map((pos) => [pos, round3(constants[pos] * s2026[pos])]));
  const floor = ROOKIE_BASIS.floors.F5, dp = ROOKIE_BASIS.sameDp.F5;
  const out = POSITIONS.map((pos) => {
    const e = entries.get(pos);
    return entryOf(pos, { pos }, summarizeDeltas(e.ids, e.diffs, { floor, bootstrap }), {
      deciding: decides.includes(pos), same: sameAt(constLFull[pos], interimFull[pos], dp), sameDetail: { league: constLFull[pos], interim: interimFull[pos], dp },
    });
  });
  const deciders = POSITIONS.filter((pos) => decides.includes(pos));
  const pooledIds = [], pooledDiffs = [];
  for (const pos of deciders) { pooledIds.push(...entries.get(pos).ids); pooledDiffs.push(...entries.get(pos).diffs); }
  return {
    id: 'F5', recipe: 'arm-A prior as live (position constant × scale × age × draft, blended 8 : min(gp, 12)); ρ-transport of the hand-set constant (decision A1); leave-one-season-out',
    folds: seasons.length, rows: rows.length,
    entries: out, pooled: { ...summarizeDeltas(pooledIds, pooledDiffs, { bootstrap }), decidingPositions: deciders },
    structural: { ok: true, note: 'none specified for F5' },
    fullSample: { half: { ...constants }, interim: interimFull, league: constLFull, rho: rhoFull, scale: s2026 },
    constants: { positionPriorPPG: constLFull, wirePositions: deciders },
    g0b: { ok: true, note: 'hand-set constant — no recipe to reproduce' },
  };
}

// ─── live effect (report-only, plan §4.4) ───────────────────────────────────────────────────────────

/**
 * The 2026 effect of each family's league value vs the interim on a capture's rookie rows. `rows`: [[pid, { projectedPPG, projectedGames,
 * projectedTotalPts, factors }]] (a slimRookieSnapshot's players); `recover(factors)` → { position, scale } | null; `league` = the
 * per-family constants. Each family is swapped alone into the interim reconstruction from the captured `rookieMultiplierProduct`.
 * → { <F>: { rows, moved (|Δ| >= 0.1), meanMove (signed, all rows), meanMovedAbs } } over projectedPPG (F1/F2), qbStarterPPG (F3)
 * and projectedTotalPts (F4); F5 moves no captured field.
 */
export function liveEffect(rows, { league, recover }) {
  const acc = { F1: [], F2: [], F3: [], F4: [] };
  for (const [, p] of rows) {
    const { factors, projectedGames } = p.projection ?? p;
    const rec = recover(factors);
    if (!rec || factors.qbTakeoverBasis === 'chain') continue;
    const { position, scale } = rec;
    const level = ({ baselinePPG = null, calibration = null, ceiling = null } = {}) => {
      const base = baselinePPG ? baselinePPG[position] : ROOKIE_BASELINE_PPG[position] * scale;
      const cal = resolveRookieCalibration({ position, draftCapitalStatus: factors.draftCapitalStatus, nflDraftTier: factors.nflDraftTier, table: calibration ?? ROOKIE_CALIBRATION }).rookieCalibrationMult;
      const pre = clamp(base * factors.rookieMultiplierProduct * cal, 0, ROOKIE_BASIS.clampMax);
      return applyRookieCeiling({ position, projectedPPG: pre, basisScale: ceiling ? 1 : scale, table: ceiling ?? ROOKIE_CEILING }).ceiledPPG;
    };
    const total = (ceiled, table) => {
      const f = resolveRookieTotalFactor({ position, draftCapitalStatus: factors.draftCapitalStatus, nflDraftTier: factors.nflDraftTier, table: table ?? ROOKIE_TOTAL_FACTOR }).rookieTotalFactor;
      return round1(ceiled * projectedGames * f);
    };
    const interim = level();
    const interimPPG = round1(interim);
    if (league.F1) acc.F1.push(round1(level({ baselinePPG: league.F1.baselinePPG, calibration: league.F1.calibration })) - interimPPG);
    if (league.F2) acc.F2.push(round1(level({ ceiling: league.F2.ceiling })) - interimPPG);
    if (league.F3 && position === 'QB' && typeof factors.qbStarterBasis === 'string' && factors.qbStarterBasis.startsWith('rookie:')) {
      const g = factors.qbStarterBasis.slice('rookie:'.length);
      acc.F3.push(league.F3.qbStarterPPG[g] - QB_ROOKIE_STARTER_PPG[g] * scale);
    }
    if (league.F4 && (position === 'RB' || position === 'WR' || position === 'TE')) acc.F4.push(total(interim, league.F4.totalFactor) - total(interim, null));
  }
  const summarize = (moves) => {
    const movedRows = moves.filter((m) => Math.abs(m) >= 0.1 - 1e-9);
    return {
      rows: moves.length, moved: movedRows.length,
      meanMove: moves.length ? sum(moves) / moves.length : null,
      meanMovedAbs: movedRows.length ? sum(movedRows.map(Math.abs)) / movedRows.length : null,
    };
  };
  return Object.fromEntries(Object.entries(acc).map(([f, moves]) => [f, summarize(moves)]));
}

/** The uncorrected cappedProduct a data panel row implies (G0b material): reconstructRookieProjection from the row's draft fields. */
export function cappedProductOf({ position, ageAtDraft, draftRound, draftPick }) {
  return reconstructRookieProjection({ position, ageAtDraft, draftRound, draftPick }).cappedProduct;
}
