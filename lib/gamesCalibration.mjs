/**
 * lib/gamesCalibration.mjs — pure, no I/O. The fit core of `bin/backtest.mjs --games-calibration`
 * (L6, .claude/tasks/projected-games-calibration.md). Offline analysis only: no served file reads this.
 *
 * Exports:
 *   GAMES_CAL_DEFAULTS (frozen), CANDIDATES, TIERS
 *   accountWeeks({ s1Row, s0Row, rwPlayer, played }) → S+1 team-game accounting (§3.1)
 *   decompose(pred, outcome, w)                      → the exact §3.1 identity components
 *   ageBucketOf, buildRankIndex, enrichRow           → row enrichment (§3.1)
 *   fitK(rows, floor, kGrid), fitCandidate, kFor     → the multiplicative-scale fit (§4)
 *   foldTrainRows                                    → forward-chain train rows (D3)
 *   candidatePred, deltaStats, pooledStats           → held-out metrics (§4)
 *   decide({ rule, ... })                            → the pre-registered decision rule (§5)
 */

import { teamPlayedWeeks } from './absence.mjs';
import { isTeamAggregateId, spearman } from './backtest.mjs';
import { IN_SEASON_DEFAULTS, ageOnDate, bootstrapPairedMean } from './inSeasonEvidence.mjs';
import { projectedGamesFor } from './durabilityMirror.mjs';

const deepFreeze = (o) => {
  for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v);
  return Object.freeze(o);
};

export const GAMES_CAL_DEFAULTS = deepFreeze({
  seasons: { from: 2012, to: 2025 }, predictorSeasons: { from: 2015, to: 2024 },
  minTrainSeasons: 3, snapshotDate: '2026-10-07', parityMin: 0.99,
  bootstrap: IN_SEASON_DEFAULTS.bootstrap,
  ageBuckets: { QB: [26, 31, 35], other: [24, 27, 30] },   // upper bounds: ≤26 | 27–31 | 32–35 | 36+ ; ≤24 | 25–27 | 28–30 | 31+
  ageRefDate: (season) => `${season}-09-01`,               // age at Sep 1 of S+1
  relevantTopN: { QB: 32, RB: 60, WR: 84, TE: 32 },
  kGrid: { from: 0.50, to: 1.20, step: 0.01 },
  minCellTrainPlayers: 40,
  floors: [8, 0],
  biasGate: 1.0,
  reconcileTolerance: 0.05,
});

/** Candidate id → { levels (most specific first), floor }. C0 is the app rule and has no fit. */
export const CANDIDATES = Object.freeze({
  C1: { levels: ['pos'], floor: 8 },
  C2: { levels: ['pos|age', 'pos'], floor: 8 },
  C3: { levels: ['pos|s', 'pos'], floor: 8 },
  C4: { levels: ['pos|age|s', 'pos|s', 'pos'], floor: 8 },
  C1f0: { levels: ['pos'], floor: 0 },
  C2f0: { levels: ['pos|age', 'pos'], floor: 0 },
  C3f0: { levels: ['pos|s', 'pos'], floor: 0 },
  C4f0: { levels: ['pos|age|s', 'pos|s', 'pos'], floor: 0 },
});
export const CANDIDATE_IDS = Object.freeze(Object.keys(CANDIDATES));
/** §5 total order: C1 < C1f0 < {C2, C3} < {C2f0, C3f0} < C4 < C4f0. */
export const TIERS = Object.freeze([['C1'], ['C1f0'], ['C2', 'C3'], ['C2f0', 'C3f0'], ['C4'], ['C4f0']]);

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);

// ─── §3.1 S+1 week accounting ────────────────────────────────────────────────

export const WEEK_CATEGORIES = Object.freeze(['reserve', 'inactive', 'activeNoPlay', 'practiceSquad', 'otherStatus', 'offRoster']);
const SLOTS = 18;

/** Priority of a roster status inside one team-game slot: lower wins. */
function statusClass(status) {
  if (status === 'RES' || status === 'PUP') return { cat: 'reserve', rank: 0 };
  if (status === 'INA') return { cat: 'inactive', rank: 1 };
  if (status === 'ACT') return { cat: 'activeNoPlay', rank: 2 };
  if (status === 'DEV') return { cat: 'practiceSquad', rank: 3 };
  if (status !== 'CUT') return { cat: 'otherStatus', rank: 4 };
  return { cat: 'offRoster', rank: 5 };
}

/**
 * §3.1. `s1Row` = the S+1 season-totals row (or undefined), `s0Row` = the S row (or undefined),
 * `rwPlayer` = nflverse/rosterweekly/<S+1>.json `.players[id]` (`{ [week]: [[team, status], …] }`),
 * `played` = teamPlayedWeeks(store[S+1]). → { G, counts, otherByStatus, skipped, recon }.
 * `counts.played` = team-game slots with 'P'; `recon` = played − the S+1 row's gamesPlayed (0 when absent).
 */
export function accountWeeks({ s1Row, s0Row, rwPlayer, played }) {
  const counts = { played: 0, reserve: 0, inactive: 0, activeNoPlay: 0, practiceSquad: 0, otherStatus: 0, offRoster: 0 };
  const otherByStatus = {};
  let G = 0;
  let anyTeam = false;
  const rw = rwPlayer ?? {};
  for (let i = 0; i < SLOTS; i++) {
    const pairs = rw[String(i + 1)] ?? [];
    let teams = pairs.map(([t]) => t);
    if (teams.length === 0 && s1Row?.team) teams = [s1Row.team];
    if (teams.length === 0 && s0Row?.team) teams = [s0Row.team];
    if (teams.length === 0) continue;
    anyTeam = true;
    if (!teams.some((t) => played.get(t)?.has(i))) continue;           // a bye or an idle team: not a team game
    G++;
    if (s1Row && Array.isArray(s1Row.weeklyStatus) && s1Row.weeklyStatus[i] === 'P') { counts.played++; continue; }
    let best = null;
    for (const [team, status] of pairs) {
      if (!played.get(team)?.has(i)) continue;
      const c = statusClass(status);
      if (!best || c.rank < best.rank) best = { ...c, status };
    }
    if (!best) { counts.offRoster++; continue; }                        // no pair at all → off roster
    counts[best.cat]++;
    if (best.cat === 'otherStatus') otherByStatus[best.status] = (otherByStatus[best.status] ?? 0) + 1;
  }
  const outcome = s1Row?.gamesPlayed ?? 0;
  return { G, counts, otherByStatus, skipped: !anyTeam, recon: counts.played - outcome };
}

/**
 * The exact §3.1 identity: pred − outcome = (pred − G) + reserve + inactive + activeNoPlay + practiceSquad
 * + otherStatus + offRoster + recon. Groups per §3.2.
 */
export function decompose(pred, outcome, w) {
  const c = w.counts;
  const schedule = pred - w.G;
  const composition = c.offRoster + c.practiceSquad + c.otherStatus;
  const role = c.activeNoPlay + c.inactive;
  const injuryList = c.reserve;
  return { bias: pred - outcome, schedule, composition, role, injuryList, recon: w.recon,
    sum: schedule + composition + role + injuryList + w.recon };
}

// ─── Row enrichment ──────────────────────────────────────────────────────────

/** Age bucket label from the §0 upper bounds; 'unk' when age is null. */
export function ageBucketOf(age, position, ageBuckets = GAMES_CAL_DEFAULTS.ageBuckets) {
  if (age == null) return 'unk';
  const ub = position === 'QB' ? ageBuckets.QB : ageBuckets.other;
  if (age <= ub[0]) return `<=${ub[0]}`;
  if (age <= ub[1]) return `${ub[0] + 1}-${ub[1]}`;
  if (age <= ub[2]) return `${ub[1] + 1}-${ub[2]}`;
  return `${ub[2] + 1}+`;
}

/**
 * `${S}|${id}` → rank within position by S fantasyPoints (desc, ties by id) over every non-TEAM_ row whose
 * positionOf is that position and whose fantasyPoints is finite.
 */
export function buildRankIndex(store, positionOf, seasons, positions) {
  const idx = new Map();
  for (const S of seasons) {
    const byPos = Object.fromEntries(positions.map((p) => [p, []]));
    for (const [id, row] of Object.entries(store[S] ?? {})) {
      if (isTeamAggregateId(id)) continue;
      const p = positionOf[id];
      if (byPos[p] && Number.isFinite(row?.fantasyPoints)) byPos[p].push([id, row.fantasyPoints]);
    }
    for (const list of Object.values(byPos)) {
      list.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
      list.forEach(([id], i) => idx.set(`${S}|${id}`, i + 1));
    }
  }
  return idx;
}

/**
 * §3.1. `row` is a buildPanel row; ctx = { store, rosterByYear, bySleeper, rankIndex, defaults }.
 * Throws when Math.round(clamp(avgGames, 8, 17)) !== the panel's prediction.
 */
export function enrichRow(row, ctx) {
  const { store, rosterByYear, bySleeper, rankIndex, defaults = GAMES_CAL_DEFAULTS } = ctx;
  const { id, S, position } = row;
  const pred = row.after;
  const r = projectedGamesFor(store, id, position, { throughSeason: S });
  if (!r || Math.round(clamp(r.avgGames, 8, 17)) !== pred) {
    throw new Error(`[games-calibration] avgGames assertion failed for ${id} S=${S}: avgGames ${r?.avgGames} → ${r ? Math.round(clamp(r.avgGames, 8, 17)) : 'null'} vs predicted ${pred}`);
  }
  const age = ageOnDate(bySleeper?.[id]?.birthdate, defaults.ageRefDate(S + 1));
  const s0 = store[S]?.[id];
  const sState = !s0 ? 'none' : (s0.gamesPlayed ?? 0) >= 8 ? 'qual' : 'short';
  const rank = rankIndex.get(`${S}|${id}`);
  const relevant = !!s0 && rank != null && rank <= defaults.relevantTopN[position];
  const s1 = store[S + 1]?.[id];
  const cache = (ctx.playedCache ??= new Map());
  if (!cache.has(S + 1)) cache.set(S + 1, teamPlayedWeeks(store[S + 1] ?? {}));
  const played = cache.get(S + 1);
  const w = accountWeeks({ s1Row: s1, s0Row: s0, rwPlayer: rosterByYear[S + 1]?.players?.[id], played });
  const out = {
    id, S, position, pred, outcome: row.outcome, avgGames: r.avgGames,
    age, ageBucket: ageBucketOf(age, position, defaults.ageBuckets), sState, relevant,
    qbStarterS: position === 'QB' ? (s0?.gamesStarted ?? 0) >= 8 : null,
    noS1Row: !s1, weeks: w,
  };
  out.dec = w.skipped ? null : decompose(pred, row.outcome, w);
  return out;
}

// ─── §4 the fit ──────────────────────────────────────────────────────────────

/** Candidate prediction: Math.round(clamp(avgGames × k, floor, 17)). */
export const candidatePred = (avgGames, k, floor) => Math.round(clamp(avgGames * k, floor, 17));

/** Integer-hundredths grid so tie comparisons are exact. */
export function kGridValues(kGrid = GAMES_CAL_DEFAULTS.kGrid) {
  const lo = Math.round(kGrid.from * 100), hi = Math.round(kGrid.to * 100), st = Math.round(kGrid.step * 100);
  const out = [];
  for (let i = lo; i <= hi; i += st) out.push(i);
  return out;
}

/**
 * The grid value minimising training SSE of candidatePred − outcome; ties go to the value closest to 1.00,
 * then the smaller. Rows need `{ avgGames, outcome }`. Returns k (e.g. 0.8).
 */
export function fitK(rows, floor, kGrid = GAMES_CAL_DEFAULTS.kGrid) {
  let best = null;
  for (const i of kGridValues(kGrid)) {
    const k = i / 100;
    let sse = 0;
    for (const r of rows) { const e = candidatePred(r.avgGames, k, floor) - r.outcome; sse += e * e; }
    const dist = Math.abs(i - 100);
    if (!best || sse < best.sse || (sse === best.sse && (dist < best.dist || (dist === best.dist && i < best.i)))) {
      best = { i, sse, dist };
    }
  }
  return best ? best.i / 100 : 1;
}

/** Cell key at a level for a row; null when the level needs an age the row lacks. */
function cellKey(level, r) {
  if (level === 'pos') return r.position;
  if (level === 'pos|s') return `${r.position}|${r.sState}`;
  if (r.ageBucket === 'unk') return null;
  if (level === 'pos|age') return `${r.position}|${r.ageBucket}`;
  return `${r.position}|${r.ageBucket}|${r.sState}`;                     // pos|age|s
}

/**
 * Fit one candidate on `trainRows`. For each level, every cell with ≥ minCellTrainPlayers distinct training
 * players gets its own k; `kFor` walks the chain to the first fitted cell, so a thin cell takes its parent's k.
 * → { id, floor, cells: { [level]: { [key]: { k, players, rows } } } } (only fitted cells are kept in `cells`),
 *   plus `thin` listing every observed thin cell and its fallback target.
 */
export function fitCandidate(trainRows, candId, { minCellTrainPlayers = GAMES_CAL_DEFAULTS.minCellTrainPlayers, kGrid = GAMES_CAL_DEFAULTS.kGrid } = {}) {
  const { levels, floor } = CANDIDATES[candId];
  const cells = {};
  const thin = [];
  for (const level of levels) {
    const groups = new Map();
    for (const r of trainRows) {
      const key = cellKey(level, r);
      if (key == null) continue;
      let g = groups.get(key);
      if (!g) { g = { rows: [], players: new Set() }; groups.set(key, g); }
      g.rows.push(r); g.players.add(r.id);
    }
    cells[level] = {};
    for (const [key, g] of groups) {
      const root = level === 'pos';
      if (g.players.size >= minCellTrainPlayers || root) {
        cells[level][key] = { k: fitK(g.rows, floor, kGrid), players: g.players.size, rows: g.rows.length };
      } else if (level === levels[0]) {
        thin.push({ cell: key, players: g.players.size });
      }
    }
  }
  return { id: candId, floor, cells, thin };
}

/** → { k, requested, used, fallback }. Falls back level by level; the position cell with no training rows gives k = 1. */
export function kFor(model, r) {
  const { levels } = CANDIDATES[model.id];
  let requested = null;
  for (const level of levels) {
    // §1.4: an 'unk'-age row is routed to the position cell, never to pos|s.
    if (r.ageBucket === 'unk' && levels.some((l) => l.includes('age')) && level !== 'pos') continue;
    const key = cellKey(level, r);
    if (key == null) continue;
    requested ??= key;
    const c = model.cells[level]?.[key];
    if (c) return { k: c.k, requested, used: key, fallback: key !== requested };
  }
  return { k: 1, requested: requested ?? r.position, used: 'none', fallback: true };
}

/** D3 — rows of every S in `trainYears` (= every S ≤ t − 1). */
export function foldTrainRows(rows, fold) {
  const ys = new Set(fold.trainYears);
  return rows.filter((r) => ys.has(r.S));
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

/** Mean paired delta (a − b of squared or absolute errors) with the clustered bootstrap CI; ci null under minPlayers. */
export function deltaStats(rows, predA, predB, kind, bootstrap, minPlayers = 30) {
  if (!rows.length) return { n: 0, mean: null, ci95: null };
  const f = kind === 'mse' ? (e) => e * e : Math.abs;
  const diffs = rows.map((r) => f(predA(r) - r.outcome) - f(predB(r) - r.outcome));
  const players = new Set(rows.map((r) => r.id)).size;
  let ci95 = null;
  if (players >= minPlayers) {
    const b = bootstrapPairedMean(rows.map((r) => r.id), diffs, bootstrap);
    ci95 = b ? [b.ci95[0], b.ci95[1]] : null;
  }
  // mean / ci95 stay unrounded so the §5 decisions read raw values; JSON serialisation rounds them to 3 dp.
  const out = { n: rows.length, players, mean: mean(diffs), ci95 };
  Object.defineProperty(out, 'toJSON', {
    enumerable: false,
    value() { return { n: this.n, players: this.players, mean: round3(this.mean), ci95: this.ci95 ? [round3(this.ci95[0]), round3(this.ci95[1])] : null }; },
  });
  return out;
}

/** n, bias, MAE, MSE, RMSE, Spearman (all rows; mean of the within-position values). */
export function pooledStats(rows, pred) {
  if (!rows.length) return { n: 0 };
  const e = rows.map((r) => pred(r) - r.outcome);
  const mse = mean(e.map((x) => x * x));
  const rho = spearman(rows.map(pred), rows.map((r) => r.outcome));
  const perPos = [];
  for (const p of new Set(rows.map((r) => r.position))) {
    const sub = rows.filter((r) => r.position === p);
    const v = spearman(sub.map(pred), sub.map((r) => r.outcome));
    if (v != null) perPos.push(v);
  }
  return {
    n: rows.length, players: new Set(rows.map((r) => r.id)).size,
    bias: round3(mean(e)), mae: round3(mean(e.map(Math.abs))), mse: round3(mse), rmse: round3(Math.sqrt(mse)),
    rho: round3(rho), rhoWithinPos: round3(mean(perPos)),
  };
}

// ─── §5 decision rule ────────────────────────────────────────────────────────

/**
 * Eligibility of one candidate summary under a rule.
 * summary = { pooled: { dMse:{mean,ci95}, dMae:{…}, bias }, byPosition: { QB: { dMse, dMae } … }, relevant: { dMse, dMae } }.
 * → { eligible, failed: [condition numbers] }. The MAE rule drops condition 2.
 */
export function eligibility(summary, rule, biasGate = GAMES_CAL_DEFAULTS.biasGate) {
  const key = rule === 'mae' ? 'dMae' : 'dMse';
  const failed = [];
  const ci = summary.pooled[key]?.ci95;
  if (!(ci && ci[1] < 0)) failed.push(1);
  if (rule !== 'mae' && !(Math.abs(summary.pooled.bias) <= biasGate)) failed.push(2);
  for (const cell of Object.values(summary.byPosition ?? {})) {
    const c = cell?.[key]?.ci95;
    if (c && c[0] > 0) { failed.push(3); break; }
  }
  const rm = summary.relevant?.[key]?.mean;
  if (!(rm != null && rm <= 0)) failed.push(4);
  return { eligible: failed.length === 0, failed };
}

/**
 * §5. `summaries`: { [candId]: summary (+ pooled.mse / pooled.mae for the within-tier pick) }.
 * `paired(hiId, loId)` → the ΔMSE (or ΔMAE under `rule`) vs-incumbent ci95 or null.
 * `recon`: { mean } and `tolerance`. → { outcome: 'W'|'N'|'S', pick, eligibility, text }.
 */
export function decide({ rule = 'mse', summaries, paired, recon, tolerance = GAMES_CAL_DEFAULTS.reconcileTolerance, biasGate = GAMES_CAL_DEFAULTS.biasGate }) {
  if (recon && Math.abs(recon.mean) > tolerance) {
    return { outcome: 'S', pick: null, eligibility: {}, text: `(S) stop — |mean recon| ${round3(Math.abs(recon.mean))} exceeds ${tolerance}. Defect reported; no recommendation.` };
  }
  const el = {};
  for (const id of Object.keys(summaries)) el[id] = eligibility(summaries[id], rule, biasGate);
  const errKey = rule === 'mae' ? 'mae' : 'mse';
  let incumbent = null;
  for (const tier of TIERS) {
    const live = tier.filter((id) => el[id]?.eligible);
    if (!live.length) continue;
    live.sort((a, b) => summaries[a].pooled[errKey] - summaries[b].pooled[errKey]);
    const member = live[0];
    if (incumbent == null) { incumbent = member; continue; }
    const ci = paired(member, incumbent);
    if (ci && ci[1] < 0) incumbent = member;
  }
  if (incumbent == null) return { outcome: 'N', pick: null, eligibility: el, text: '(N) no change — no candidate is eligible; the decomposition stands as the explanation.' };
  return { outcome: 'W', pick: incumbent, eligibility: el, text: `(W) wire ${incumbent} — an eligible pick under the ${rule === 'mae' ? 'MAE' : 'squared-error'} rule; a wiring slice follows, planned separately after Anton reads this verdict.` };
}
