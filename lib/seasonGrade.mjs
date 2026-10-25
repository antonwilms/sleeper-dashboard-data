/**
 * lib/seasonGrade.mjs — pure parts of the January season grade (plan january-grading-run-a §5.2, §5.5, §13).
 *
 * No I/O. Holds the pinned veteran-segment table, the capture classifier and its stops, the metric definitions, the
 * pre-registered labels and the bootstrap/permutation drivers. `lib/vetReplay.mjs` is the composition/gates layer;
 * `scripts/season-grade-run.mjs` is the adapter. Report-only: nothing here emits a constant or a wiring recommendation.
 *
 * Slice B (plan january-grading-run-b §6–§7) appends the ROS / games / rookie graders and their labels at the end of this
 * module; nothing above them changes. Pure: the adapter injects every input.
 */

import { clusteredBootstrap, bootstrapPairedMean, mulberry32, median, IN_SEASON_DEFAULTS } from './inSeasonEvidence.mjs';

// ─── Pins (frozen at the plan commit; §13) ────────────────────────────────────

/**
 * Earliest 2026 REG kickoff: nflverse/nfldata games.csv, `2026_01_NE_SEA`, gameday 2026-09-09 (Wed), gametime 20:20 ET
 * (EDT, UTC−4) → 2026-09-10T00:20:00Z. Checked by Session 2 on 2026-10-24; the plan's original literal
 * (2026-09-11T00:20Z) assumed a Thursday opener and was corrected by Session 1. Never derive a week calendar from it.
 */
export const KICKOFF_2026_UTC = '2026-09-10T00:20:00Z';

/** Mirrored byte-for-byte as the JSON block in grading/anchor-policy.md (test/season-grade.test.mjs holds the equality). */
export const VETERAN_SEGMENTS = Object.freeze([
  { id: 'L0', boundary: 'none', firstCapture: '2026-09-10', detector: { kind: 'capturedAfter', utc: '2026-09-10T00:20:00Z' }, markers: [] },
  { id: 'L1', boundary: '4', firstCapture: '2026-09-13', detector: { kind: 'vetRowKey', key: 'regressionUpsideBasis' }, markers: [] },
  { id: 'L2', boundary: '4a', firstCapture: '2026-09-25', detector: { kind: 'envelopeEquals', field: 'projectionBasis', value: 'league' }, markers: [] },
  { id: 'L3', boundary: '5', firstCapture: '2026-10-04', detector: { kind: 'vetRowKey', key: 'qbTakeoverBasis' }, markers: [] },
  { id: 'L4', boundary: '7', firstCapture: '2026-10-07', detector: { kind: 'capturedAfter', utc: '2026-10-07T06:50:00Z' }, markers: [] },
  { id: 'L5', boundary: '8', firstCapture: '2026-10-10', detector: { kind: 'vetRowKey', key: 'shortSeasonState' }, markers: ['2026-10-11', '2026-10-14'] },
  { id: 'L6', boundary: '10', firstCapture: '2026-10-23', detector: { kind: 'markerIn', markers: ['2026-10-23'] }, markers: ['2026-10-23'] },
]);

/** projectionModelFrom marker → segment id, derived from the `markers` columns. */
export const MARKER_SEGMENT = Object.freeze(
  Object.fromEntries(VETERAN_SEGMENTS.flatMap(s => s.markers.map(m => [m, s.id]))),
);

export const STALE_POLICY_MSG = "anchor policy stale — pin boundary N in grading/anchor-policy.md's JSON block and VETERAN_SEGMENTS first";

export const POSITIONS = Object.freeze(['QB', 'RB', 'WR', 'TE']);
/** 2026-09-06 mirror medians (grading/2026-09-06-fullpipeline-verdict.md) for the `history` label. */
export const HISTORY_MEDIANS = Object.freeze({ QB: 0.882, RB: 0.912, WR: 0.856, TE: 0.846 });
export const MIN_CELL = 20;
export const BOOT = Object.freeze({ resamples: 4000, seed: 12345 });
export const PERMUTATIONS = 4000;

/** G-MECH pairs M1–M9, fixed committed pairs (§5.4). M10 is computed from the live segment table. */
export const MECH_PAIRS = Object.freeze([
  { id: 'M1', a: '2026-09-13', b: '2026-09-24', segment: 'L1', expected: { rows: 417, beyond: 0, steps: 1, ppg: 0.0020, tot: 0.0005 } },
  { id: 'M2', a: '2026-09-25', b: '2026-10-03', segment: 'L2', expected: { rows: 425, beyond: 0, steps: 1, ppg: 0.0010, tot: 0.0010 } },
  { id: 'M3', a: '2026-10-04', b: '2026-10-06', segment: 'L3', expected: { rows: 422, beyond: 0, steps: 1, ppg: 0.0004, tot: 0.0005 } },
  { id: 'M4', a: '2026-10-07', b: '2026-10-09', segment: 'L4', expected: { rows: 425, beyond: 0, steps: 1, ppg: 0.0010, tot: 0.0010 } },
  { id: 'M5', a: '2026-10-10', b: '2026-10-22', segment: 'L5', expected: { rows: 415, beyond: 0, steps: 1, ppg: 0.0008, tot: 0.0005 } },
  { id: 'M6', a: '2026-10-13', b: '2026-10-14', segment: 'L5', expected: { rows: 424, beyond: 0, steps: 1, ppg: 0.0004, tot: 0.0005 } },
  { id: 'M7', a: '2026-10-15', b: '2026-10-16', segment: 'L5', expected: { rows: 426, beyond: 0, steps: 1, ppg: 0.0007, tot: 0.0004 } },
  { id: 'M8', a: '2026-10-13', b: '2026-10-22', segment: 'L5', expected: { rows: 419, beyond: 0, steps: 1, ppg: 0.0008, tot: 0.0006 } },
  { id: 'M9', a: '2026-10-21', b: '2026-10-22', segment: 'L5', expected: { rows: 424, beyond: 0, steps: 0, ppg: 0.0001, tot: 0.0005 } },
]);

// ─── G-SEASON (§2) ────────────────────────────────────────────────────────────

/**
 * Completeness gate for the January run. Pure over loaded files.
 *   (a) schedule 2026 has 272 REG games, all scored;
 *   (b) season-totals week-18 'P' count ≥ 0.85 × median of weeks 1–17;
 *   (c) every non-TEAM_* row with gamesPlayed > 0 has weeklyStats;
 *   (d) manifest lastModified(season-totals 2026) ≥ lastModified(schedule 2026) − 24 h.
 * Also returns `weeksComplete` N (largest w with every REG game of weeks 1..w scored) for the rehearsal stamp.
 */
export function evaluateSeasonGate({ schedule, totals, manifest }) {
  const games = (schedule?.games ?? []).filter(g => g.gameType === 'REG');
  const scored = (g) => g.homeScore != null && g.awayScore != null;
  const unscored = games.filter(g => !scored(g)).length;
  const a = { id: 'a', pass: games.length === 272 && unscored === 0, detail: `${games.length} REG games, ${unscored} unscored` };

  const rows = Object.entries(totals ?? {}).filter(([id]) => !id.startsWith('TEAM_'));
  const weekP = Array.from({ length: 18 }, (_, w) => rows.reduce((n, [, r]) => n + (r.weeklyStatus?.[w] === 'P' ? 1 : 0), 0));
  const med = medianOf(weekP.slice(0, 17));
  const b = { id: 'b', pass: med != null && weekP[17] >= 0.85 * med, detail: `week-18 'P' ${weekP[17]} vs 0.85 × median(weeks 1–17) = ${med == null ? 'n/a' : (0.85 * med).toFixed(1)}` };

  // Mirrors lib/validate.mjs requireWeeklyStats: present and a plain object; empty {} passes.
  const isPlainObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const noWeekly = rows.filter(([, r]) => (r.gamesPlayed ?? 0) > 0 && !(r.weeklyStats !== undefined && isPlainObj(r.weeklyStats))).length;
  const c = { id: 'c', pass: noWeekly === 0, detail: `${noWeekly} rows with gamesPlayed > 0 lack weeklyStats` };

  const lm = (path) => Date.parse(manifest?.files?.[path]?.lastModified ?? '');
  const tT = lm('nfl/season-totals/2026.json'), sT = lm('nflverse/schedule/2026.json');
  const d = { id: 'd', pass: Number.isFinite(tT) && Number.isFinite(sT) && tT >= sT - 24 * 3600000, detail: `season-totals ${manifest?.files?.['nfl/season-totals/2026.json']?.lastModified ?? 'n/a'} vs schedule ${manifest?.files?.['nflverse/schedule/2026.json']?.lastModified ?? 'n/a'}` };

  let weeksComplete = 0;
  for (let w = 1; w <= 18; w++) {
    const gw = games.filter(g => g.week === w);
    if (gw.length && gw.every(scored)) weeksComplete = w; else break;
  }
  return { pass: a.pass && b.pass && c.pass && d.pass, checks: [a, b, c, d], weeksComplete };
}

// ─── Segment detection and classification (§5.2) ──────────────────────────────

const isVet = (p) => p?.projection != null && p.projection.confidence !== 'rookie';

/** Detector vocabulary; an unknown `kind` throws. */
export function detectorFires(detector, snapshot) {
  switch (detector.kind) {
    case 'capturedAfter':
      return new Date(snapshot.capturedAt).getTime() > new Date(detector.utc).getTime();
    case 'vetRowKey': {
      const vets = Object.values(snapshot.players ?? {}).filter(isVet);
      return vets.length > 0 && vets.every(p => p.projection.factors?.[detector.key] !== undefined);
    }
    case 'envelopeEquals':
      return snapshot[detector.field] === detector.value;
    case 'markerIn':
      return detector.markers.includes(snapshot.projectionModelFrom);
    default:
      throw new Error(`[seasonGrade] unknown segment detector kind '${detector.kind}'`);
  }
}

/**
 * Era / segment of one capture. `pre-kickoff` iff capturedAt ≤ KICKOFF; otherwise the last entry (array order) whose detector
 * fires. `date` is the file date (YYYY-MM-DD). Returns { era, segment, index } — segment/index null outside 'segment'.
 */
export function classifyCapture(snapshot, date, { segments = VETERAN_SEGMENTS, kickoff = KICKOFF_2026_UTC } = {}) {
  if (snapshot.targetSeason !== 2026) return { era: 'other', segment: null, index: -1 };
  if (new Date(snapshot.capturedAt).getTime() <= new Date(kickoff).getTime()) return { era: 'pre-kickoff', segment: null, index: -1 };
  let index = -1;
  segments.forEach((s, i) => { if (detectorFires(s.detector, snapshot)) index = i; });
  if (index < 0) throw new Error(`[seasonGrade] ${date}: post-kickoff capture matched no segment. ${STALE_POLICY_MSG}`);
  return { era: 'segment', segment: segments[index].id, index };
}

/**
 * Cross-checks over classified captures (entries from `classifyCapture` + `{ date, marker, targetSeason }`).
 * Throws (a stop) on a violation of (i), (ii) or (iii).
 */
export function crossCheckClassification(entries, { segments = VETERAN_SEGMENTS, markerSegment = MARKER_SEGMENT } = {}) {
  for (const c of entries) {
    if (c.era !== 'segment') continue;
    const seg = segments[c.index];
    const next = segments[c.index + 1];
    // (i) the date lies in [this firstCapture, next firstCapture)
    if (c.date < seg.firstCapture || (next && c.date >= next.firstCapture)) {
      throw new Error(`[seasonGrade] ${c.date} classifies ${seg.id} but lies outside [${seg.firstCapture}, ${next?.firstCapture ?? '∞'}). ${STALE_POLICY_MSG}`);
    }
    // (ii) a non-null projectionModelFrom is a pinned marker mapping to the same segment
    if (c.marker != null) {
      const mapped = markerSegment[c.marker];
      if (mapped == null) throw new Error(`[seasonGrade] ${c.date}: projectionModelFrom '${c.marker}' is not a pinned marker. ${STALE_POLICY_MSG}`);
      if (mapped !== seg.id) throw new Error(`[seasonGrade] ${c.date}: projectionModelFrom '${c.marker}' maps to ${mapped} but the capture classifies ${seg.id}. ${STALE_POLICY_MSG}`);
    }
  }
  // (iii) the newest 2026 capture classifies to the last entry
  const t26 = entries.filter(c => c.targetSeason === 2026);
  const newest = t26[t26.length - 1];
  if (newest && newest.era !== 'segment') {
    throw new Error(`[seasonGrade] newest capture ${newest.date} is ${newest.era}, not a post-kickoff segment. ${STALE_POLICY_MSG}`);
  }
  if (newest && newest.index !== segments.length - 1) {
    throw new Error(`[seasonGrade] newest capture ${newest.date} classifies ${segments[newest.index].id}, not the last segment ${segments[segments.length - 1].id}. ${STALE_POLICY_MSG}`);
  }
  return entries;
}

/**
 * Classify every capture and apply the cross-checks.
 * @param {{ date: string, snapshot: object }[]} captures  ascending by date
 */
export function classifyCaptures(captures, { segments = VETERAN_SEGMENTS, markerSegment = MARKER_SEGMENT, kickoff = KICKOFF_2026_UTC } = {}) {
  const entries = captures.map(({ date, snapshot }) => ({
    date,
    ...classifyCapture(snapshot, date, { segments, kickoff }),
    marker: snapshot.projectionModelFrom ?? null,
    targetSeason: snapshot.targetSeason ?? null,
  }));
  return crossCheckClassification(entries, { segments, markerSegment });
}

// ─── Metrics (§5.5) ───────────────────────────────────────────────────────────

/**
 * Row contract: { id, pos, p (PPG), T (total), G (games), a (points), g (games played), chain (bool) }.
 * Imputed R rows additionally carry { kind: 'imputed', pK, TK, GK } and are materialised by `materializeRows`.
 */
const sum = (rows, f) => rows.reduce((s, r) => s + f(r), 0);

/** Fills imputed rows from ρ = Σ replayed ÷ Σ K-captured per position (UNK and any position without data: all-position ρ). */
export function materializeRows(rows) {
  if (!rows.some(r => r.kind === 'imputed')) return rows;
  const rho = (pos) => {
    const rep = rows.filter(r => r.kind === 'replayed' && (pos == null || r.pos === pos));
    const d = (num, den) => (sum(rep, den) > 0 ? sum(rep, num) / sum(rep, den) : null);
    return { p: d(r => r.p, r => r.pK), T: d(r => r.T, r => r.TK), G: d(r => r.G, r => r.GK) };
  };
  const byPos = Object.fromEntries(POSITIONS.map(pos => [pos, rho(pos)]));
  const all = rho(null);
  return rows.map((r) => {
    if (r.kind !== 'imputed') return r;
    const k = POSITIONS.includes(r.pos) && byPos[r.pos].p != null ? byPos[r.pos] : all;
    if (k.p == null) return { ...r, p: r.pK, T: r.TK, G: r.GK };
    return { ...r, p: r.pK * k.p, T: r.TK * k.T, G: r.GK * k.G };
  });
}

export function medianOf(values) {
  if (!values.length) return null;
  return median(values);
}

/**
 * Cell statistics over one set of rows (already materialised).
 *   R_ppg = Σa / Σ(p·g) over g > 0, non-chain;  R_tot = Σa / ΣT over all rows;  R_games = Σg / ΣG;
 *   Med_ppg = median((a/g)/p) over g ≥ 6, non-chain, p > 0;  MAE / bias PPG over g ≥ 6 (bias = projected − actual).
 */
export function cellStats(rows) {
  const ppgRows = rows.filter(r => r.g > 0 && !r.chain);
  const dPpg = sum(ppgRows, r => r.p * r.g);
  const dTot = sum(rows, r => r.T);
  const dG = sum(rows, r => r.G);
  const g6 = rows.filter(r => r.g >= 6 && !r.chain && r.p > 0);
  const errs = g6.map(r => r.p - r.a / r.g);
  return {
    rows: rows.length,
    nPpg: ppgRows.length,
    nMed: g6.length,
    R_ppg: dPpg > 0 ? sum(ppgRows, r => r.a) / dPpg : null,
    R_tot: dTot > 0 ? sum(rows, r => r.a) / dTot : null,
    R_games: dG > 0 ? sum(rows, r => r.g) / dG : null,
    Med_ppg: g6.length ? medianOf(g6.map(r => (r.a / r.g) / r.p)) : null,
    maePPG: errs.length ? sum(errs, Math.abs) / errs.length : null,
    biasPPG: errs.length ? sum(errs, x => x) / errs.length : null,
  };
}

/** Per-position cells + pooled (ratio of sums) + the unweighted mean of the four position ratios. */
export function segmentStats(rows) {
  const m = materializeRows(rows);
  const byPos = {};
  for (const pos of POSITIONS) byPos[pos] = cellStats(m.filter(r => r.pos === pos));
  const pooled = cellStats(m);
  const meanOf = (k) => {
    const v = POSITIONS.map(pos => byPos[pos][k]).filter(x => x != null);
    return v.length === POSITIONS.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  };
  return {
    byPos, pooled,
    unk: m.filter(r => !POSITIONS.includes(r.pos)).length,
    meanOfPositions: { R_ppg: meanOf('R_ppg'), R_tot: meanOf('R_tot') },
  };
}

/** The statistic of one cell on materialised rows. `pos` null → pooled. */
export function metricOf(rows, metric, pos = null) {
  const m = materializeRows(rows);
  const sel = pos == null ? m : m.filter(r => r.pos === pos);
  return cellStats(sel)[metric];
}

/** insufficient iff fewer than MIN_CELL graded rows for the metric. */
export function sampleOk(stats, metric) {
  if (metric === 'R_tot') return stats.rows >= MIN_CELL;
  if (metric === 'Med_ppg') return stats.nMed >= MIN_CELL;
  return stats.nPpg >= MIN_CELL;
}

// ─── Labels (§13) ─────────────────────────────────────────────────────────────

export function calibrationLabel(ci) {
  if (!ci) return 'insufficient';
  if (ci[1] < 1) return 'optimistic';
  if (ci[0] > 1) return 'pessimistic';
  return 'within-CI';
}
export function historyLabel(ci, mirrorMedian) {
  if (!ci) return 'insufficient';
  return ci[0] <= mirrorMedian && mirrorMedian <= ci[1] ? 'consistent-with-history' : 'differs-from-history';
}
export function agreeLabel(ci) {
  if (!ci) return 'insufficient';
  return ci[0] <= 0 && 0 <= ci[1] ? 'agrees' : 'differs';
}
export function pooledDiffLabel(ci) {
  if (!ci) return 'insufficient';
  return ci[0] <= 0 && 0 <= ci[1] ? 'within-pooled' : 'differs-from-pooled';
}

// ─── Bootstrap / permutation drivers ──────────────────────────────────────────

/** 95% percentile CI, player-cluster bootstrap; `clusters` are per-player objects, `statFn(sample)` → number|null. */
export function bootCI(clusters, statFn, opts = BOOT) {
  const r = clusteredBootstrap(clusters, statFn, { resamples: opts.resamples, seed: opts.seed });
  return r ? r.ci95 : null;
}

/**
 * Permutation test on the position labels (§5.5 heterogeneity (b)): shuffle `pos` within the cohort, statistic
 * max over the four positions of |metric(pos) − metric(pooled)|, p = share of permutations ≥ the observed statistic.
 * Rows are materialised once (imputed values fixed); labels move, values do not.
 */
export function permutationTest(rows, metric, { permutations = PERMUTATIONS, seed = BOOT.seed } = {}) {
  const m = materializeRows(rows).filter(r => POSITIONS.includes(r.pos));
  const stat = (labels) => {
    const withPos = m.map((r, i) => ({ ...r, pos: labels[i] }));
    const pooled = cellStats(withPos)[metric];
    let mx = 0;
    for (const pos of POSITIONS) {
      const v = cellStats(withPos.filter(r => r.pos === pos))[metric];
      if (v == null || pooled == null) continue;
      mx = Math.max(mx, Math.abs(v - pooled));
    }
    return mx;
  };
  const labels = m.map(r => r.pos);
  const observed = stat(labels);
  const rng = mulberry32(seed);
  let ge = 0;
  const shuffled = labels.slice();
  for (let k = 0; k < permutations; k++) {
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    if (stat(shuffled) >= observed - 1e-12) ge++;
  }
  return { observed, p: m.length ? (ge + 1) / (permutations + 1) : null, permutations, n: m.length };
}

// ═══ Slice B (plan january-grading-run-b §6–§7, §13) ═══════════════════════════════════════════════════════════════════

/** Week 1's Thursday, a fixed literal (the opener was Wed 2026-09-09; never derive a week calendar from KICKOFF_2026_UTC). */
export const ROS_WEEK1_THURSDAY = '2026-09-10';
/** Checkpoints graded; c = 1, 2 precede the first inSeason capture (2026-09-27), week 18 has no ROS. */
export const ROS_CHECKPOINTS = Object.freeze(Array.from({ length: 15 }, (_, i) => i + 3));
export const ROS_MIN = 30;   // distinct players per cell
export const L6_MIN = 20;    // rows per state cell
export const D75_MIN = 30;   // rows per group

const DAY_MS = 86400000;
const isoZ = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');
const dayStr = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * → [{ c, thursday, closeUtc, windowEndUtc }] for c = 1…17. Week c closes at its Thursday + 5 d, 06:00Z (the Tuesday
 * after Monday night); the pick window ends at the next Thursday, 23:00Z.
 */
export function rosCalendar() {
  const t0 = Date.parse(`${ROS_WEEK1_THURSDAY}T00:00:00Z`);
  return Array.from({ length: 17 }, (_, i) => {
    const c = i + 1;
    const thu = t0 + 7 * i * DAY_MS;
    return { c, thursday: dayStr(thu), closeUtc: isoZ(thu + 5 * DAY_MS + 6 * 3600000), windowEndUtc: isoZ(thu + 7 * DAY_MS + 23 * 3600000) };
  });
}

/**
 * Checkpoint c's capture over inventory entries (targetSeason 2026, ascending by capturedAt):
 * `ok` first capture in [close_c, windowEnd_c); `late` first capture after close_c; `no-capture`; `no-inSeason-capture` (c ≤ 2).
 */
export function pickCheckpointCapture(cal, entries) {
  if (cal.c <= 2) return { c: cal.c, date: null, status: 'no-inSeason-capture' };
  const close = Date.parse(cal.closeUtc), end = Date.parse(cal.windowEndUtc);
  const sorted = (entries ?? []).filter(e => e.targetSeason === 2026 && e.capturedAt).slice()
    .sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt));
  const after = sorted.filter(e => Date.parse(e.capturedAt) >= close);
  if (!after.length) return { c: cal.c, date: null, status: 'no-capture' };
  const inWindow = after.find(e => Date.parse(e.capturedAt) < end);
  return inWindow ? { c: cal.c, date: inWindow.date, status: 'ok' } : { c: cal.c, date: after[0].date, status: 'late' };
}

/** Week of the n-th 'P' status (1-based week); n = 0 → 0 (consistent); fewer than n 'P' weeks → Infinity. */
function nthPWeek(statuses, n) {
  if (!(n > 0)) return 0;
  let seen = 0;
  for (let i = 0; i < (statuses?.length ?? 0); i++) {
    if (statuses[i] === 'P' && ++seen === n) return i + 1;
  }
  return Infinity;
}

const ptsOf = (rescoredRow, w) => rescoredRow?.weeklyPoints?.[String(w)] ?? 0;

/** schedule (nflverse/schedule/<y>.json) → Map team → ascending REG weeks (home or away). */
function teamWeeksOf(schedule) {
  const m = new Map();
  for (const g of schedule?.games ?? []) {
    if (g.gameType !== 'REG') continue;
    for (const t of [g.homeTeam, g.awayTeam]) {
      if (t == null) continue;
      if (!m.has(t)) m.set(t, []);
      m.get(t).push(g.week);
    }
  }
  for (const ws of m.values()) ws.sort((a, b) => a - b);
  return m;
}

/**
 * One checkpoint capture → ROS grading rows (§6.1). `rescored` is rescoreSeasonRowsLeague(2026 …) (id → row with
 * weeklyPoints/weeklyPointsMethod); `schedule` may be null; `teamOf(id, player)` is the caller's schedule-aliased team
 * (REQUIRED — no default; a missing `teamOf` throws a TypeError); `positionOf` is the capture's K-style position source (null → UNK, counted).
 * Returns { perGame[], start[], nConsistency: { share, n }, counts }. Never throws on missing data.
 */
export function buildRosRows(capture, { rescored, schedule, positionOf, c, teamOf } = {}) {
  const counts = { unk: 0, noTeam: 0, scheduleShort: 0, noSchedule: 0, noRow: 0, noValue: 0, startNotQb: 0, badRemaining: 0 };
  const perGame = [], start = [];
  const teamWeeks = schedule ? teamWeeksOf(schedule) : null;
  let consistent = 0, total = 0;
  for (const [id, p] of Object.entries(capture?.players ?? {})) {
    const ins = p?.inSeason;
    if (!ins || ins.season !== 2026) continue;
    const rr = rescored?.[id] ?? null;
    const statuses = Array.isArray(rr?.weeklyStatus) ? rr.weeklyStatus : [];
    const nth = nthPWeek(statuses, ins.n ?? 0);
    total++;
    if (nth <= c + 1) consistent++;
    const pos = positionOf ? positionOf(id) : null;
    if (pos == null) { counts.unk++; continue; }
    const value = ins.ros?.value, prior = ins.ros?.prior;
    if (!Number.isFinite(value)) { counts.noValue++; continue; }
    const meta = { id, pos, value, prior: Number.isFinite(prior) ? prior : null, n: ins.n ?? 0, frozen: ins.frozen === true, priorSource: ins.priorSource ?? null, notFrozenReason: ins.notFrozenReason ?? null };
    if (!ins.start) {
      if (!rr) { counts.noRow++; continue; }
      const nthWeek = Number.isFinite(nth) ? nth : null;
      if (nthWeek == null) continue;             // n-inconsistent row: counted in nConsistency only
      const weeks = [];
      for (let w = nthWeek + 1; w <= statuses.length; w++) if (statuses[w - 1] === 'P') weeks.push(w);
      let observed = null;
      if ((ins.n ?? 0) >= 1) {
        let sum = 0, k = 0;
        for (let w = 1; w <= nthWeek; w++) if (statuses[w - 1] === 'P') { sum += ptsOf(rr, w); k++; }
        observed = k ? sum / k : null;
      }
      const realised = weeks.length ? weeks.reduce((a, w) => a + ptsOf(rr, w), 0) / weeks.length : null;
      perGame.push({ ...meta, observed, realised, nGames: weeks.length, graded: weeks.length >= IN_SEASON_DEFAULTS.minRosGames });
      continue;
    }
    // (b) start rows — QB only, team-game basis
    if (pos !== 'QB') { counts.startNotQb++; continue; }
    const remaining = ins.start.remaining;
    if (!Number.isFinite(remaining) || remaining <= 0) { counts.badRemaining++; continue; }
    const team = teamOf(id, p);
    if (team == null) { counts.noTeam++; continue; }
    if (!teamWeeks) { counts.noSchedule++; continue; }
    const tw = teamWeeks.get(team) ?? [];
    if (tw.length < remaining) { counts.scheduleShort++; continue; }
    const last = tw.slice(tw.length - remaining);
    const realised = last.reduce((a, w) => a + ptsOf(rr, w), 0) / remaining;
    const upTo = tw.filter(w => w <= c);
    // n = 0 → comparator exactly 0 (§6.1/§13a); n ≥ 1 → team-week mean over weeks ≤ c
    const observed = (ins.n ?? 0) === 0 ? 0 : (upTo.length ? upTo.reduce((a, w) => a + ptsOf(rr, w), 0) / upTo.length : null);
    start.push({ ...meta, observed, realised, nGames: remaining, graded: true });
  }
  return { perGame, start, nConsistency: { share: total ? consistent / total : 1, n: total }, counts };
}

/** Mean and player-clustered bootstrap CI of the paired differences; null-safe (no finite diffs → mean/ci null). */
export function pairedDelta(ids, diffs, opts = BOOT) {
  const finite = diffs.filter(Number.isFinite);
  if (!finite.length) return { mean: null, ci: null };
  const r = bootstrapPairedMean(ids, diffs, opts);
  return { mean: finite.reduce((a, v) => a + v, 0) / finite.length, ci: r ? r.ci95 : null };
}

export function rosLabel(ci, cmp) {
  if (!ci) return 'insufficient';
  return ci[1] < 0 ? `value-beats-${cmp}` : 'no-difference';
}

const meanOf = (xs) => (xs.length ? xs.reduce((a, v) => a + v, 0) / xs.length : null);

function rosCell(rows, min) {
  const g = rows.filter(r => r.graded !== false && Number.isFinite(r.realised));
  const players = new Set(g.map(r => r.id)).size;
  if (players === 0) return { n: 0, label: 'empty', mae: null, bias: null, vsPrior: { n: 0, mean: null, ci: null, label: 'insufficient' }, vsObserved: { n: 0, mean: null, ci: null, label: 'insufficient' } };
  const cmp = (key, name) => {
    const rs = g.filter(r => Number.isFinite(r[key]));
    const np = new Set(rs.map(r => r.id)).size;
    const d = pairedDelta(rs.map(r => r.id), rs.map(r => Math.abs(r.value - r.realised) - Math.abs(r[key] - r.realised)));
    return { n: np, mean: d.mean, ci: d.ci, label: np < min ? 'insufficient' : rosLabel(d.ci, name) };
  };
  return {
    n: players, label: players < min ? 'insufficient' : 'graded',
    mae: meanOf(g.map(r => Math.abs(r.value - r.realised))), bias: meanOf(g.map(r => r.value - r.realised)),
    vsPrior: cmp('prior', 'prior'), vsObserved: cmp('observed', 'observed'),
  };
}

/**
 * Rows of one kind ((a) per-game or (b) start) at one checkpoint → per-position cells (§6.1). The frozen/live split
 * keys on `frozen === true` and is reported only when both groups are non-empty.
 */
export function rosCheckpointReport(rows, { min = ROS_MIN } = {}) {
  const byPos = (rs) => Object.fromEntries(POSITIONS.map(pos => [pos, rosCell(rs.filter(r => r.pos === pos), min)]));
  const frozen = rows.filter(r => r.frozen === true), live = rows.filter(r => r.frozen !== true);
  const split = frozen.length && live.length
    ? { degenerate: false, frozen: byPos(frozen), live: byPos(live) }
    : (() => {
      const reasons = {};
      for (const r of rows) reasons[r.notFrozenReason ?? 'none'] = (reasons[r.notFrozenReason ?? 'none'] ?? 0) + 1;
      const sources = [...new Set(rows.map(r => (r.frozen === true ? 'frozen' : 'live')))];
      return { degenerate: true, line: sources.length ? `split degenerate: all rows priorSource ${sources[0]} (notFrozenReason counts ${JSON.stringify(reasons)})` : 'split degenerate: no rows' };
    })();
  return { ...byPos(rows), split };
}

/**
 * L6 games check (§6.2). rows: { id, state: 'short'|'none'|'qual', l6c, base, realised, rel3 }. Cells by state and rel3 only.
 * Δ = |err(L6c)| − |err(base)|; l6Label follows §13. `excluded` is the adapter's exclusion counts, echoed back.
 */
export function gamesL6Report(rows, { min = L6_MIN, excluded = {} } = {}) {
  const cell = (rs) => {
    if (!rs.length) return { n: 0, mae: { l6c: null, base: null }, bias: { l6c: null, base: null }, delta: { mean: null, ci: null, label: 'insufficient' } };
    const d = pairedDelta(rs.map(r => r.id), rs.map(r => Math.abs(r.l6c - r.realised) - Math.abs(r.base - r.realised)));
    return {
      n: rs.length,
      mae: { l6c: meanOf(rs.map(r => Math.abs(r.l6c - r.realised))), base: meanOf(rs.map(r => Math.abs(r.base - r.realised))) },
      bias: { l6c: meanOf(rs.map(r => r.l6c - r.realised)), base: meanOf(rs.map(r => r.base - r.realised)) },
      delta: { mean: d.mean, ci: d.ci, label: rs.length < min ? 'insufficient' : l6Label(d.ci) },
    };
  };
  return {
    byState: Object.fromEntries(['short', 'none', 'qual'].map(st => [st, cell(rows.filter(r => r.state === st))])),
    rel3: cell(rows.filter(r => r.rel3 === true)),
    excluded: { imputed: 0, dropped: 0, missingField: 0, rel3NoPosition: 0, ...excluded },
  };
}

export function l6Label(ci) {
  if (!ci) return 'insufficient';
  if (ci[1] < 0) return 'l6c-beats-base';
  if (ci[0] > 0) return 'base-beats-l6c';
  return 'no-difference';
}

/** D-16: `moved` iff the 2013–2026 QB asymptote lies outside [20.50, 21.95]. */
export function d16Label(asymptote) {
  if (asymptote == null || !Number.isFinite(asymptote)) return 'insufficient';
  return asymptote < 20.50 || asymptote > 21.95 ? 'moved' : 'within-fold-spread';
}

/**
 * D-75 (§7): `league-better-calibrated` iff |ratio_L − 1| < |ratio_H − 1| and the guard (paired Δ|err| league − shipped,
 * CI lower bound ≤ 0) passes; else `shipped-stands`; below D75_MIN rows `insufficient`. ratioH/ratioL are numbers.
 */
export function d75Label({ n, ratioH, ratioL, deltaCi }) {
  if (!(n >= D75_MIN) || !Number.isFinite(ratioH) || !Number.isFinite(ratioL) || !deltaCi) return 'insufficient';
  return Math.abs(ratioL - 1) < Math.abs(ratioH - 1) && deltaCi[0] <= 0 ? 'league-better-calibrated' : 'shipped-stands';
}
