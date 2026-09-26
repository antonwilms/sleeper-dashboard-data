/**
 * lib/inSeasonEvidence.mjs — pure logic for `bin/backtest.mjs --inseason`
 * (in-season evidence Phase 2a; .claude/tasks/in-season-evidence-2a-backtest.md). No I/O.
 *
 * Evidence primitives (opportunities, reconciliation, per-week checkpoints), the
 * shrinkage-k fitting core (sufficient statistics, integer-tenths grid, LOSO,
 * player-clustered bootstrap on mulberry32), the Q2 combination forms, and the Q6
 * sort-measure helpers. Everything is dimensionless and offline; nothing here reaches
 * the app.
 *
 * Mirrors app rules from src/utils/inSeasonEvidence.js (CR-25): PHASE1_K,
 * MIN_PRIOR_GAMES, the baseline thresholds, the band median rule, the new-role
 * shrink, the opportunity definition and n = games played.
 */

import { spearman } from './backtest.mjs';

// ─── Constants ────────────────────────────────────────────────────────────────

export const IN_SEASON_DEFAULTS = {
  seasons: { from: 2014, to: 2025 },        // outcome season S (ROS); veteran prior needs Y = S-1 >= 2013
  nextTo: 2024, plus2To: 2023,              // next-season horizon S <= 2024; S+2 diagnostic S <= 2023
  maxLoadSeason: 2025,                      // never read a season-totals/gamelogs file above this
  checkpoints: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  minRosGames: 4, nextMinGames: 6,           // 6 = OUTCOME_PLAYED_THRESHOLD
  kGridMaxTenths: 400,
  minCellPlayers: 60, minCellRows: 300,
  bootstrap: { resamples: 4000, seed: 12345 },
  minPriorGames: 8,                          // study population / Phase 1 MIN_PRIOR_GAMES
  minBaselineGames: 4, minBaselineOpp: 2.0,  // Phase 1 MIN_BASELINE_GAMES / MIN_BASELINE_OPP
  lookbackSeasons: 3,                        // Q5 arm B: S-1..S-3
  roleChangeRel: 0.5,                        // Q2 secondary subgroup
  q6Checkpoints: [3, 4, 5, 6],
};

// The study's k table (§0), verbatim. `—` cells are absent keys.
export const STUDY_K = {
  ros: {
    points: { QB: 6, RB: 3, WR: 4.5, TE: 5.5 },
    opp: { QB: 5, RB: 2, WR: 2.5, TE: 2.5 },
    share: { WR: 2.3, TE: 2 },
    pointsWeak: { RB: 3, WR: 3.5, TE: 4 },
    pointsStrong: { RB: 3, WR: 5, TE: 6 },
  },
  next: {
    points: { QB: 7.5, RB: 4.5, WR: 6.5, TE: 6.5 },
    opp: { QB: 5.5, RB: 3.5, WR: 4.5, TE: 4 },
  },
};

// FROZEN historical comparator: app src/utils/inSeasonEvidence.js as shipped in Phase 1 (read by Session 1
// 2026-09-26). Never update it to later app values. Q4's comparator is the rule Phase 1 applied to THAT row:
// S-1 gp < 8 (extrapolated) → RB/WR/TE rosWeak, QB rosPoints.QB; S-1 gp ≥ 8 (e.g. second-year players in
// X-rookie1p) → the band rule (rosWeak/rosStrong by band, QB rosPoints.QB). Next horizon: dynPoints always.
export const PHASE1_K = {
  rosPoints: { QB: 6, RB: 3, WR: 4.5, TE: 5.5 },
  rosWeak:   { RB: 3, WR: 3.5, TE: 4 },  rosStrong: { RB: 3, WR: 5, TE: 6 },
  rosOpp:    { QB: 5, RB: 2, WR: 2.5, TE: 2.5 },
  dynPoints: { QB: 7.5, RB: 4.5, WR: 6.5, TE: 6.5 },
  dynOpp:    { QB: 5.5, RB: 3.5, WR: 4.5, TE: 4 },
};

// ─── Evidence primitives (§3.2) ───────────────────────────────────────────────

/** QB: attempts + carries; every other position: targets + carries. Absent key = 0. */
export function opportunities(game, position) {
  const carries = game?.carries ?? 0;
  return position === 'QB' ? (game?.attempts ?? 0) + carries : (game?.targets ?? 0) + carries;
}

/** REG-only games for a gamelogs player (drops POST/WILD/DIV/…). */
export function regGames(gamelogsPlayer) {
  return (gamelogsPlayer?.games ?? []).filter(g => g.seasonType === 'REG');
}

/** REG-only opportunity sum of a gamelogs player vs season-totals stats. */
export function reconcileOpportunities(gamelogsPlayer, seasonTotalsRow, position) {
  const games = regGames(gamelogsPlayer);
  let sum = 0;
  for (const g of games) sum += opportunities(g, position);
  const s = seasonTotalsRow?.stats ?? {};
  const total = (position === 'QB' ? (s.pass_att ?? 0) : (s.rec_tgt ?? 0)) + (s.rush_att ?? 0);
  const diff = sum - total;
  return { ok: Math.abs(diff) <= Math.max(2, 0.03 * total), diff, sum, total };
}

/**
 * One entry per calendar week W. Played weeks = numeric keys of `weeklyPoints`; n = played weeks <= W;
 * ROS = played weeks > W. `missedInWindow` counts team REG game weeks <= W minus n (schedule-based —
 * `weeklyStatus` 'X' also covers IR/unrostered weeks, so it is never used). A played week with no
 * gamelogs REG row contributes points but no opportunity; a window containing one has null obsOpp/obsShare.
 * `mover` (> 1 distinct gamelogs team in S) forces missedInWindow = null.
 */
export function buildCheckpoints({
  weeklyPoints, teamGameWeeks, oppByWeek = {}, targetsByWeek = {}, teamTargetsByWeek = {},
  checkpoints = IN_SEASON_DEFAULTS.checkpoints, mover = false,
}) {
  const weeks = Object.keys(weeklyPoints ?? {}).map(Number).sort((a, b) => a - b);
  const teamWeeks = teamGameWeeks == null ? null : [...teamGameWeeks].map(Number);

  const window = (ws) => {
    let pts = 0, opp = 0, tgt = 0, teamTgt = 0, missing = 0;
    for (const w of ws) {
      pts += weeklyPoints[w] ?? 0;
      if (oppByWeek[w] === undefined) { missing++; continue; }
      opp += oppByWeek[w];
      tgt += targetsByWeek[w] ?? 0;
      teamTgt += teamTargetsByWeek[w] ?? 0;
    }
    const k = ws.length;
    return {
      games: k, pts, ppg: k > 0 ? pts / k : null, missing,
      opp: missing === 0 && k > 0 ? opp : null,
      oppPerGame: missing === 0 && k > 0 ? opp / k : null,
      share: missing === 0 && k > 0 && teamTgt > 0 ? tgt / teamTgt : null,
    };
  };

  return checkpoints.map((W) => {
    const inWin = weeks.filter(w => w <= W);
    const ros = weeks.filter(w => w > W);
    const o = window(inWin);
    const r = window(ros);
    let missedInWindow = null;
    if (!mover && teamWeeks != null) {
      missedInWindow = teamWeeks.filter(w => w <= W).length - o.games > 0;
    }
    return {
      W, n: o.games, pts: o.pts, obsPPG: o.ppg, obsOpp: o.oppPerGame, O: o.opp, obsShare: o.share,
      missedInWindow, oppMissingWeeks: o.missing,
      rosGames: r.games, rosPPG: r.ppg, rosOpp: r.oppPerGame, rosShare: r.share, rosOppMissingWeeks: r.missing,
      lastPlayedWeek: weeks.length ? weeks[weeks.length - 1] : null,
    };
  });
}

/** Order (1-based) of every pid in one depth-chart week: Map<'POS|pid', order>. First team listing a pid wins. */
export function depthOrderIndex(depthFile, week) {
  const index = new Map();
  const teams = depthFile?.weeks?.[week] ?? {};
  for (const team of Object.keys(teams)) {
    for (const position of ['QB', 'RB', 'WR', 'TE']) {
      const arr = teams[team]?.[position];
      if (!Array.isArray(arr)) continue;
      arr.forEach((pid, i) => {
        if (pid == null) return;
        const key = `${position}|${pid}`;
        if (!index.has(key)) index.set(key, i + 1);
      });
    }
  }
  return index;
}

/** Phase 1 confidence tiers (seasonProjection.js:913). */
export function confidenceTier(qualifyingCount) {
  return qualifyingCount >= 5 ? 'high' : qualifyingCount >= 3 ? 'medium' : 'low';
}

export function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ─── Shrinkage arithmetic ─────────────────────────────────────────────────────

/** prior + (n/(n+k))·(obs − prior); k = 0 → obs; k = null (prior-only) → prior. */
export function blend(prior, obs, n, k) {
  if (k == null) return prior;
  if (k === 0) return obs;
  return prior + (n / (n + k)) * (obs - prior);
}

const acc = (x) => (typeof x === 'function' ? x : (r) => r[x]);

// ─── Sufficient statistics and the k fit (§3.4) ───────────────────────────────

const NSLOTS = 41;                           // n = 0..40 (calendar checkpoints need <= 12)
const KGRID = IN_SEASON_DEFAULTS.kGridMaxTenths;
// W_TABLE[t][n] = n/(n + t/10); t = 0 → 1 (k = 0 means the observed value alone).
const W_TABLE = [];
for (let t = 0; t <= KGRID; t++) {
  const row = new Float64Array(NSLOTS);
  for (let n = 0; n < NSLOTS; n++) row[n] = t === 0 ? 1 : n / (n + t / 10);
  W_TABLE.push(row);
}

/** Map<n, { count, Saa, Sab, Sbb }> with a = prior − outcome, b = obs − prior. */
export function suffStats(rows, { prior, obs, outcome }) {
  const gp = acc(prior), go = acc(obs), gy = acc(outcome);
  const stats = new Map();
  for (const row of rows) {
    const p = gp(row), o = go(row), y = gy(row);
    if (!Number.isFinite(p) || !Number.isFinite(o) || !Number.isFinite(y)) continue;
    const a = p - y, b = o - p;
    let s = stats.get(row.n);
    if (!s) { s = { count: 0, Saa: 0, Sab: 0, Sbb: 0 }; stats.set(row.n, s); }
    s.count++; s.Saa += a * a; s.Sab += a * b; s.Sbb += b * b;
  }
  return stats;
}

/** Per-cluster (sleeperId) dense stats: Map<id, Float64Array(3·NSLOTS)> laid out [Saa,Sab,Sbb] per n. */
export function suffStatsByCluster(rows, { prior, obs, outcome }) {
  const gp = acc(prior), go = acc(obs), gy = acc(outcome);
  const clusters = new Map();
  for (const row of rows) {
    const p = gp(row), o = go(row), y = gy(row);
    if (!Number.isFinite(p) || !Number.isFinite(o) || !Number.isFinite(y)) continue;
    const a = p - y, b = o - p;
    let d = clusters.get(row.sleeperId);
    if (!d) { d = new Float64Array(3 * NSLOTS); clusters.set(row.sleeperId, d); }
    const base = 3 * row.n;
    d[base] += a * a; d[base + 1] += a * b; d[base + 2] += b * b;
  }
  return clusters;
}

function denseFromMap(stats) {
  const d = new Float64Array(3 * NSLOTS);
  for (const [n, s] of stats) { d[3 * n] += s.Saa; d[3 * n + 1] += s.Sab; d[3 * n + 2] += s.Sbb; }
  return d;
}

function fitDense(d) {
  let bestT = -1, bestLoss = Infinity;
  for (let t = 0; t <= KGRID; t++) {
    const w = W_TABLE[t];
    let loss = 0;
    for (let n = 1; n < NSLOTS; n++) {
      const i = 3 * n;
      const wn = w[n];
      loss += d[i] + 2 * wn * d[i + 1] + wn * wn * d[i + 2];
    }
    if (loss < bestLoss) { bestLoss = loss; bestT = t; }     // strict: ties → smaller t
  }
  return { kTenths: bestT, k: bestT / 10, loss: bestLoss, boundary: bestT === 0 ? 'low' : bestT === KGRID ? 'high' : null };
}

/** argmin over integer tenths t ∈ [0, 400]; k = t/10; ties → smaller t. Never accumulates a float k. */
export function fitK(stats) {
  if (!stats || stats.size === 0) return null;
  return fitDense(denseFromMap(stats));
}

/** Σₙ Saa + 2w·Sab + w²·Sbb at an arbitrary k. */
export function lossAtK(stats, k) {
  let loss = 0;
  for (const [n, s] of stats) {
    const w = k === 0 ? 1 : n / (n + k);
    loss += s.Saa + 2 * w * s.Sab + w * w * s.Sbb;
  }
  return loss;
}

export function pinK(k) { return Math.round(k * 2) / 2; }

// ─── mulberry32 and the clustered bootstrap (D8) ──────────────────────────────

/** Standard 32-bit mulberry32; integer-safe (Math.imul, >>> 0). Never runStep4Verdict's LCG. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Resample clusters with replacement; `statFn(sampleOfClusters)` → number (null/NaN samples are skipped).
 * CI indices follow Step 4: [floor(0.025R), ceil(0.975R) − 1] of the sorted statistics.
 */
export function clusteredBootstrap(clusters, statFn, { resamples = IN_SEASON_DEFAULTS.bootstrap.resamples, seed = IN_SEASON_DEFAULTS.bootstrap.seed } = {}) {
  const m = clusters.length;
  if (m === 0) return null;
  const rng = mulberry32(seed);
  const stats = [];
  const sample = new Array(m);
  for (let r = 0; r < resamples; r++) {
    for (let c = 0; c < m; c++) sample[c] = clusters[Math.floor(rng() * m)];
    const v = statFn(sample);
    if (v != null && Number.isFinite(v)) stats.push(v);
  }
  if (stats.length === 0) return null;
  stats.sort((a, b) => a - b);
  const R = stats.length;
  return {
    resamples, seed, clusters: m, used: R,
    ci95: [stats[Math.floor(0.025 * R)], stats[Math.ceil(0.975 * R) - 1]],
    pNegative: stats.filter(v => v < 0).length / R,
  };
}

/** CI of a fitted k: refit per resample from summed per-cluster stats. */
export function bootstrapK(clusterMap, opts) {
  const clusters = [...clusterMap.values()];
  const sum = new Float64Array(3 * NSLOTS);
  return clusteredBootstrap(clusters, (sample) => {
    sum.fill(0);
    for (let c = 0; c < sample.length; c++) {
      const d = sample[c];
      for (let i = 0; i < sum.length; i++) sum[i] += d[i];
    }
    return fitDense(sum).k;
  }, opts);
}

/** CI of the paired mean of per-row diffs (|errB| − |errA|), resampling by cluster. */
export function bootstrapPairedMean(ids, diffs, opts) {
  const byId = new Map();
  for (let i = 0; i < ids.length; i++) {
    if (!Number.isFinite(diffs[i])) continue;
    let c = byId.get(ids[i]);
    if (!c) { c = { sum: 0, count: 0 }; byId.set(ids[i], c); }
    c.sum += diffs[i]; c.count++;
  }
  const clusters = [...byId.values()];
  if (!clusters.length) return null;
  return clusteredBootstrap(clusters, (sample) => {
    let s = 0, n = 0;
    for (let c = 0; c < sample.length; c++) { s += sample[c].sum; n += sample[c].count; }
    return n > 0 ? s / n : null;
  }, opts);
}

export function cellVerdict({ rows, players }, { minCellPlayers = IN_SEASON_DEFAULTS.minCellPlayers, minCellRows = IN_SEASON_DEFAULTS.minCellRows } = {}) {
  return players < minCellPlayers || rows < minCellRows ? 'INSUFFICIENT' : 'OK';
}

/** BEATS: CI entirely < 0 (B better than A); WORSE: entirely > 0; else NO-GAIN. */
export function compareLabel(ci) {
  if (!ci) return null;
  if (ci[1] < 0) return 'BEATS';
  if (ci[0] > 0) return 'WORSE';
  return 'NO-GAIN';
}

// ─── Error summaries ──────────────────────────────────────────────────────────

export function errorSummary(preds) {
  let ae = 0, se = 0, n = 0;
  for (const p of preds) {
    if (!Number.isFinite(p.pred) || !Number.isFinite(p.actual)) continue;
    const e = p.pred - p.actual;
    ae += Math.abs(e); se += e * e; n++;
  }
  return { n, mae: n ? ae / n : null, rmse: n ? Math.sqrt(se / n) : null };
}

/**
 * Leave-one-season-out. `rowsBySeason`: Map<S, rows> | { [S]: rows }. For each S, `fit(trainRows, S)` sees only
 * the other seasons; `predict(model, row)` scores the held-out rows.
 */
export function loso(rowsBySeason, { fit, predict, actual = (r) => r.actual }) {
  const entries = rowsBySeason instanceof Map ? [...rowsBySeason.entries()] : Object.entries(rowsBySeason).map(([s, r]) => [Number(s), r]);
  entries.sort((a, b) => a[0] - b[0]);
  const folds = [];
  const predictions = [];
  for (const [S, heldOut] of entries) {
    const train = [];
    for (const [S2, rows] of entries) if (S2 !== S) for (const r of rows) train.push(r);
    const model = fit(train, S);
    const foldPreds = heldOut.map(r => ({ sleeperId: r.sleeperId, S, W: r.W, n: r.n, pred: predict(model, r), actual: actual(r) }));
    predictions.push(...foldPreds);
    folds.push({ S, fitted: model, ...errorSummary(foldPreds) });
  }
  return { folds, pooled: errorSummary(predictions), predictions };
}

/** Group rows by season into an ordered Map. */
export function bySeason(rows) {
  const m = new Map();
  for (const r of rows) { if (!m.has(r.S)) m.set(r.S, []); m.get(r.S).push(r); }
  return m;
}

/**
 * Full single-k cell: pooled fit, bootstrap CI, LOSO held-out errors for prior-only / observed-only /
 * study-k / fitted-k, and the paired ΔMAE (fitted vs study) with a label. INSUFFICIENT cells report counts only.
 * `studyK`: number | (row) => number | null.
 */
export function analyzeKCell(rows, spec, { studyK = null, bootstrap = IN_SEASON_DEFAULTS.bootstrap, ci = true } = {}) {
  const gp = acc(spec.prior), go = acc(spec.obs), gy = acc(spec.outcome);
  const used = rows.filter(r => Number.isFinite(gp(r)) && Number.isFinite(go(r)) && Number.isFinite(gy(r)));
  const players = new Set(used.map(r => r.sleeperId)).size;
  const verdict = cellVerdict({ rows: used.length, players });
  const out = { rows: used.length, players, verdict };
  if (verdict === 'INSUFFICIENT') return out;

  const stats = suffStats(used, spec);
  const fit = fitK(stats);
  out.kFit = fit;
  out.kPin = pinK(fit.k);
  out.stats = stats;
  out.statsBySeason = new Map([...bySeason(used)].map(([S, rs]) => [S, suffStats(rs, spec)]));
  out.ci95 = ci ? (bootstrapK(suffStatsByCluster(used, spec), bootstrap)?.ci95 ?? null) : null;

  const seasons = bySeason(used);
  const lo = loso(seasons, {
    fit: (train) => ({ k: fitK(suffStats(train, spec)).k }),
    predict: (m, r) => blend(gp(r), go(r), r.n, m.k),
    actual: gy,
  });
  out.folds = lo.folds.map(f => ({ S: f.S, k: f.fitted.k, n: f.n, mae: f.mae, rmse: f.rmse }));
  const foldKs = out.folds.map(f => f.k);
  out.foldKRange = [Math.min(...foldKs), Math.max(...foldKs)];

  const preds = (fn) => used.map(r => ({ pred: fn(r), actual: gy(r) }));
  out.error = {
    priorOnly: errorSummary(preds(r => gp(r))),
    observedOnly: errorSummary(preds(r => go(r))),
    fitted: lo.pooled,
  };
  // predictions come back season-ordered; keep row alignment for callers that pair them.
  out.heldOut = lo.predictions;
  const ordered = [];
  for (const [, rs] of [...seasons].sort((a, b) => a[0] - b[0])) ordered.push(...rs);
  out.orderedRows = ordered;

  if (studyK != null) {
    const kOf = typeof studyK === 'function' ? studyK : () => studyK;
    const studyPreds = ordered.map(r => ({ pred: blend(gp(r), go(r), r.n, kOf(r)), actual: gy(r) }));
    out.error.study = errorSummary(studyPreds);
    const diffs = ordered.map((r, i) => Math.abs(lo.predictions[i].pred - lo.predictions[i].actual) - Math.abs(studyPreds[i].pred - studyPreds[i].actual));
    const b = bootstrapPairedMean(ordered.map(r => r.sleeperId), diffs, bootstrap);
    out.delta = b ? { mean: diffs.reduce((a, v) => a + v, 0) / diffs.length, ci95: b.ci95, label: compareLabel(b.ci95) } : null;
    out.studyK = typeof studyK === 'function' ? 'per-row' : studyK;
  }
  return out;
}


// ─── Arm classification (§3.3) ────────────────────────────────────────────────

/**
 * Arm P + arm X partition every candidate that has a prior. `route` is rookiePathStateAt's call at Y = S-1;
 * `earlierAppearance` = any season-totals appearance in HISTORY_FLOOR..S-1 (so a second-year player with an
 * S-1 debut is X-rookie1p, exactly as the app's yearsExp <= 1 routes them).
 */
export function classifyArm({ route, sm1Games, earlierAppearance }) {
  if (route === 'rookie') return earlierAppearance ? 'X-rookie1p' : 'X-rookie0';
  return sm1Games >= IN_SEASON_DEFAULTS.minPriorGames ? 'P' : 'X-short';
}

// ─── Grouped-k LOSO (Q3 splits, Q4 pooled) ────────────────────────────────────

/**
 * k per group key, fitted in-fold; a group missing from the training fold (or with no stats) falls back to the
 * training fold's pooled k. Returns season-ordered rows, aligned held-out predictions and per-fold ks.
 */
export function losoGroupedK(rows, keyFn, spec) {
  const gp = acc(spec.prior), go = acc(spec.obs), gy = acc(spec.outcome);
  const used = rows.filter(r => Number.isFinite(gp(r)) && Number.isFinite(go(r)) && Number.isFinite(gy(r)));
  const seasons = bySeason(used);
  const lo = loso(seasons, {
    fit: (train) => {
      const pooled = fitK(suffStats(train, spec)).k;
      const groups = new Map();
      for (const r of train) { const g = keyFn(r); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r); }
      const ks = { __pooled: pooled };
      for (const [g, rs] of groups) { const f = fitK(suffStats(rs, spec)); ks[g] = f ? f.k : pooled; }
      return ks;
    },
    predict: (m, r) => { const g = keyFn(r); const k = m[g] ?? m.__pooled; return blend(gp(r), go(r), r.n, k); },
    actual: gy,
  });
  const ordered = [];
  for (const [, rs] of [...seasons].sort((a, b) => a[0] - b[0])) ordered.push(...rs);
  return { rows: ordered, predictions: lo.predictions, folds: lo.folds, pooled: lo.pooled };
}

/** Paired ΔMAE (B − A) between two aligned prediction arrays, clustered by sleeperId. */
export function pairedDelta(rows, predsA, predsB, opts = IN_SEASON_DEFAULTS.bootstrap) {
  const diffs = rows.map((r, i) => Math.abs(predsB[i].pred - predsB[i].actual) - Math.abs(predsA[i].pred - predsA[i].actual));
  const b = bootstrapPairedMean(rows.map(r => r.sleeperId), diffs, opts);
  const valid = diffs.filter(Number.isFinite);
  if (!b || !valid.length) return null;
  return { mean: valid.reduce((a, v) => a + v, 0) / valid.length, ci95: b.ci95, label: compareLabel(b.ci95), n: valid.length };
}

// ─── Q1 diagnostics ───────────────────────────────────────────────────────────

export const OPTIMISM_C = Array.from({ length: 16 }, (_, i) => Math.round((0.80 + 0.02 * i) * 100) / 100);  // 0.80 … 1.10

/** Joint (c, k) fit with prior × c: c ascending, ties → smaller c. */
export function fitCK(rows, spec) {
  const gp = acc(spec.prior);
  let best = null;
  for (const c of OPTIMISM_C) {
    const f = fitK(suffStats(rows, { ...spec, prior: (r) => c * gp(r) }));
    if (f && (best == null || f.loss < best.loss)) best = { c, k: f.k, loss: f.loss, kTenths: f.kTenths };
  }
  return best;
}

/** Paired bootstrap of k(all rows) − k(subset rows): both refit from the SAME resampled clusters. */
export function bootstrapKDiff(allRows, subRows, spec, opts = IN_SEASON_DEFAULTS.bootstrap) {
  const a = suffStatsByCluster(allRows, spec);
  const b = suffStatsByCluster(subRows, spec);
  const ids = [...a.keys()];
  const clusters = ids.map(id => ({ a: a.get(id), b: b.get(id) ?? null }));
  const sa = new Float64Array(3 * NSLOTS), sb = new Float64Array(3 * NSLOTS);
  return clusteredBootstrap(clusters, (sample) => {
    sa.fill(0); sb.fill(0);
    for (let c = 0; c < sample.length; c++) {
      const x = sample[c];
      for (let i = 0; i < sa.length; i++) sa[i] += x.a[i];
      if (x.b) for (let i = 0; i < sb.length; i++) sb[i] += x.b[i];
    }
    return fitDense(sa).k - fitDense(sb).k;
  }, opts);
}

// ─── Q2 combination forms (§3.5) ──────────────────────────────────────────────

export const VE_GRID = {
  kOpp: Array.from({ length: 31 }, (_, i) => i * 0.5),       // 0, 0.5, …, 15
  kEff: Array.from({ length: 61 }, (_, i) => i * 5),         // 0, 5, …, 300
};

/** Rows carry pointsPrior, oppPrior, obsPPG, n, O (window opportunities), obsOpp. effObs = window points / O. */
function veTerms(row) {
  const effPrior = row.pointsPrior / row.oppPrior;
  const effObs = row.O > 0 ? (row.obsPPG * row.n) / row.O : effPrior;
  return { effPrior, effObs };
}

export function predictVE(row, kOpp, kEff) {
  const { effPrior, effObs } = veTerms(row);
  const vol = blend(row.oppPrior, row.obsOpp, row.n, kOpp);
  const eff = row.O > 0 ? blend(effPrior, effObs, row.O, kEff) : effPrior;
  return vol * eff;
}

/** In-fold 2-D grid; ties → smaller kOpp then smaller kEff. `outcome` accessor scores the row. */
export function fitVE(rows, outcome) {
  const gy = acc(outcome);
  const m = rows.length;
  const obsO = new Float64Array(m), nn = new Float64Array(m), O = new Float64Array(m);
  const effP = new Float64Array(m), effO = new Float64Array(m), y = new Float64Array(m), oppP = new Float64Array(m);
  rows.forEach((r, i) => {
    const t = veTerms(r);
    effP[i] = t.effPrior; effO[i] = t.effObs; y[i] = gy(r); oppP[i] = r.oppPrior; obsO[i] = r.obsOpp; nn[i] = r.n; O[i] = r.O;
  });
  let best = { loss: Infinity, kOpp: null, kEff: null };
  const vol = new Float64Array(m);
  for (const kOpp of VE_GRID.kOpp) {
    for (let i = 0; i < m; i++) vol[i] = blend(oppP[i], obsO[i], nn[i], kOpp);
    for (const kEff of VE_GRID.kEff) {
      let loss = 0;
      for (let i = 0; i < m; i++) {
        const eff = O[i] > 0 ? blend(effP[i], effO[i], O[i], kEff) : effP[i];
        const e = vol[i] * eff - y[i];
        loss += e * e;
      }
      if (loss < best.loss) best = { loss, kOpp, kEff };
    }
  }
  return best;
}

/**
 * G: pred = pointsPost(kPts) + γ·(n/(n+kOpp))·(obsOpp − oppPrior)·effPrior. kPts and kOpp come from their own
 * single-signal fits on the training rows; γ is the closed-form least squares.
 */
export function fitG(rows, { pointsOutcome, oppOutcome }) {
  const kPts = fitK(suffStats(rows, { prior: 'pointsPrior', obs: 'obsPPG', outcome: pointsOutcome })).k;
  const kOpp = fitK(suffStats(rows, { prior: 'oppPrior', obs: 'obsOpp', outcome: oppOutcome })).k;
  const gy = acc(pointsOutcome);
  let num = 0, den = 0;
  for (const r of rows) {
    const post = blend(r.pointsPrior, r.obsPPG, r.n, kPts);
    const z = (r.n === 0 ? 0 : (kOpp === 0 ? 1 : r.n / (r.n + kOpp))) * (r.obsOpp - r.oppPrior) * (r.pointsPrior / r.oppPrior);
    num += z * (gy(r) - post); den += z * z;
  }
  return { kPts, kOpp, gamma: den > 0 ? num / den : 0 };
}

export function predictG(row, m) {
  const post = blend(row.pointsPrior, row.obsPPG, row.n, m.kPts);
  const w = m.kOpp === 0 ? 1 : row.n / (row.n + m.kOpp);
  return post + m.gamma * w * (row.obsOpp - row.oppPrior) * (row.pointsPrior / row.oppPrior);
}

// ─── Q6 sort-measure helpers ──────────────────────────────────────────────────

export function sd(values) {
  if (values.length < 2) return null;
  const mu = values.reduce((a, v) => a + v, 0) / values.length;
  return Math.sqrt(values.reduce((a, v) => a + (v - mu) ** 2, 0) / (values.length - 1));
}

/** Mean absolute position-share gap between the top-`topN` by `measure` and by `target`, within one group. */
export function topMixGap(rows, measureKey, targetKey, topN = 50) {
  if (rows.length < topN) return null;
  const top = (key) => [...rows].sort((a, b) => b[key] - a[key]).slice(0, topN);
  const share = (set) => {
    const c = { QB: 0, RB: 0, WR: 0, TE: 0 };
    for (const r of set) c[r.position]++;
    return c;
  };
  const a = share(top(measureKey)), b = share(top(targetKey));
  let gap = 0;
  for (const p of Object.keys(a)) gap += Math.abs(a[p] - b[p]) / topN;
  return gap / 4;
}

export { spearman };
