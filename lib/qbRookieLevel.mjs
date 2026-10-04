/**
 * lib/qbRookieLevel.mjs — rookie QB starter level (P12a, .claude/tasks/qb-rookie-level-research.md).
 *
 * Pure, no I/O. Offline analysis only: measures PPG in the games a rookie QB actually starts (primary
 * passer of the team-game, P6a definition), by round-based draft group, and compares it with the shipped
 * ktc-neutral rookie reconstruction. Every rule is pre-registered in the task file.
 *
 * Public exports:
 *   QB_ROOKIE_DEFAULTS, GROUPS
 *   rookieGroup(entry), rookieStarterGames({ … }), aggregate, levelTable, levelCI, playerDistribution
 *   suppress, suppressPair, leagueRatio, liveLevel, unitsFrom, losoCompare, round2, round3
 */

import { QB_TAKEOVER_DEFAULTS } from './qbTakeover.mjs';
import { IN_SEASON_DEFAULTS, clusteredBootstrap, bootstrapPairedMean, compareLabel, bySeason } from './inSeasonEvidence.mjs';
import { calculateFantasyPoints, RATE_KEYS } from './fantasyPoints.mjs';

export const QB_ROOKIE_DEFAULTS = {
  seasons: { from: 2013, to: 2025 },
  snapshotDate: '2026-10-03',
  coverageMin: QB_TAKEOVER_DEFAULTS.coverageMin,   // 0.99, imported, not duplicated
  minUnitGames: 3, minQuantileGames: 4, minQuantilePlayers: 7,
  minCellPlayers: 3, thinPlayers: 10,
  eraSplitFrom: 2019, halfSplitAfter: 8,
  bootstrap: IN_SEASON_DEFAULTS.bootstrap,          // 4000 resamples, seed 12345
};
export const GROUPS = ['top12', 'r1', 'day2', 'day3+'];

export const round2 = (x) => Math.round(x * 100) / 100;
export const round3 = (x) => Math.round(x * 1e3) / 1e3;
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

// ─── §3.2 groups ──────────────────────────────────────────────────────────────

/** Round-based group from a `bySleeper` entry. `draftPick` is within-round; `draftOvr` is never read. */
export function rookieGroup(entry) {
  if (!entry) return null;
  if (entry.undrafted === true) return 'day3+';
  const round = entry.draftRound;
  if (round == null) return null;
  if (round === 1) {
    if (entry.draftPick == null) return null;
    return entry.draftPick <= 12 ? 'top12' : 'r1';
  }
  return round <= 3 ? 'day2' : 'day3+';
}

// ─── §3.3 rookie starter games ────────────────────────────────────────────────

export function newExcluded() {
  return { noCrosswalk: 0, noScheduleGame: 0, nonQB: 0, noDraftRound: 0, missingPoints: 0 };
}

/** Sorted REG weeks per team from a schedule file. */
export function regWeeksByTeam(schedule) {
  const m = new Map();
  for (const gm of schedule?.games ?? []) {
    if (gm.gameType !== 'REG') continue;
    for (const T of [gm.homeTeam, gm.awayTeam]) {
      if (!m.has(T)) m.set(T, []);
      m.get(T).push(gm.week);
    }
  }
  for (const ws of m.values()) ws.sort((a, b) => a - b);
  return m;
}

export function rookieStarterGames({ S, primaries, schedule, seasonTotals, bySleeper, positionOf }) {
  const weeksOf = regWeeksByTeam(schedule);
  const games = [];
  const excluded = newExcluded();
  for (const [key, { pid }] of primaries) {
    const cut = key.lastIndexOf('|');
    const team = key.slice(0, cut);
    const week = Number(key.slice(cut + 1));
    const entry = bySleeper?.[pid];
    if (!entry) { excluded.noCrosswalk++; continue; }
    if (entry.draftYear !== S) continue;
    const ws = weeksOf.get(team);
    const idx = ws ? ws.indexOf(week) : -1;
    if (idx < 0) { excluded.noScheduleGame++; continue; }
    if (positionOf?.[pid] !== 'QB') { excluded.nonQB++; continue; }
    const group = rookieGroup(entry);
    if (group == null) { excluded.noDraftRound++; continue; }
    const pts = seasonTotals?.[pid]?.weeklyPoints?.[week];
    if (typeof pts !== 'number' || !Number.isFinite(pts)) { excluded.missingPoints++; continue; }
    const origin = primaries.get(`${team}|${ws[0]}`)?.pid === pid ? 'g1' : 'takeover';
    games.push({ pid, S, team, week, gIndex: idx + 1, group, origin, pts });
  }
  return { games, excluded };
}

// ─── §3.4 aggregates ──────────────────────────────────────────────────────────

/** keyFn(game) → key (or null to skip). players = distinct `pid|S`. */
export function aggregate(games, keyFn) {
  const m = new Map();
  for (const g of games) {
    const k = keyFn(g);
    if (k == null) continue;
    let e = m.get(k);
    if (!e) { e = { ids: new Set(), games: 0, sumPts: 0 }; m.set(k, e); }
    e.ids.add(`${g.pid}|${g.S}`);
    e.games++; e.sumPts += g.pts;
  }
  const out = new Map();
  for (const [k, e] of m) out.set(k, { players: e.ids.size, games: e.games, sumPts: e.sumPts });
  return out;
}

/** Per-group rows and a pooled row built from the rounded group rows (exact by construction). */
export function levelTable(games) {
  const agg = aggregate(games, (g) => g.group);
  const table = {};
  for (const grp of GROUPS) {
    const a = agg.get(grp) ?? { players: 0, games: 0, sumPts: 0 };
    const sumPts = round2(a.sumPts);
    table[grp] = { players: a.players, games: a.games, sumPts, value: a.games > 0 ? round3(sumPts / a.games) : null };
  }
  const rows = GROUPS.map((grp) => table[grp]);
  const sumPts = round2(rows.reduce((s, r) => s + r.sumPts, 0));
  const gamesN = rows.reduce((s, r) => s + r.games, 0);
  table.pooled = {
    players: rows.reduce((s, r) => s + r.players, 0), games: gamesN, sumPts,
    value: gamesN > 0 ? round3(sumPts / gamesN) : null,
  };
  return table;
}

/** One cluster per rookie-season. */
function clustersOf(games, group = null) {
  const m = new Map();
  for (const g of games) {
    if (group != null && g.group !== group) continue;
    const k = `${g.pid}|${g.S}`;
    let c = m.get(k);
    if (!c) { c = { sum: 0, games: 0 }; m.set(k, c); }
    c.sum += g.pts; c.games++;
  }
  return [...m.values()];
}

export function levelCI(games, group = null, bootstrap = QB_ROOKIE_DEFAULTS.bootstrap) {
  const clusters = clustersOf(games, group);
  return clusteredBootstrap(clusters, (sample) => {
    let s = 0, n = 0;
    for (let i = 0; i < sample.length; i++) { s += sample[i].sum; n += sample[i].games; }
    return n > 0 ? s / n : null;
  }, bootstrap);
}

function quantile(sorted, f) {
  const pos = (sorted.length - 1) * f;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Over rookie-seasons with ≥ minQuantileGames primary games; all null (n kept) when n < minQuantilePlayers. */
export function playerDistribution(games, group = null, {
  minQuantileGames = QB_ROOKIE_DEFAULTS.minQuantileGames, minQuantilePlayers = QB_ROOKIE_DEFAULTS.minQuantilePlayers,
} = {}) {
  const ppgs = clustersOf(games, group).filter((c) => c.games >= minQuantileGames).map((c) => c.sum / c.games).sort((a, b) => a - b);
  const n = ppgs.length;
  if (n < minQuantilePlayers) return { n, mean: null, p25: null, p50: null, p75: null, p90: null };
  return { n, mean: mean(ppgs), p25: quantile(ppgs, 0.25), p50: quantile(ppgs, 0.5), p75: quantile(ppgs, 0.75), p90: quantile(ppgs, 0.9) };
}

function nullify(cell) {
  const out = {};
  for (const [k, v] of Object.entries(cell)) {
    if (k === 'players' || k === 'games') out[k] = v;
    else out[k] = (typeof v === 'number' || Array.isArray(v)) ? null : v;
  }
  return out;
}

/** Same cell with every numeric value null (players/games kept) when players < minCellPlayers. */
export function suppress(cell, minCellPlayers = QB_ROOKIE_DEFAULTS.minCellPlayers) {
  return cell.players < minCellPlayers ? nullify(cell) : cell;
}

/** Complementary suppression for a two-way partition: both sides go if either is thin. */
export function suppressPair(a, b, minCellPlayers = QB_ROOKIE_DEFAULTS.minCellPlayers) {
  return a.players < minCellPlayers || b.players < minCellPlayers ? [nullify(a), nullify(b)] : [a, b];
}

// ─── §3.5 league ratio ────────────────────────────────────────────────────────

export function leagueRatio(rec, scoringSettings) {
  if (!rec || !(rec.fantasyPoints > 0)) return null;
  const stripped = {};
  for (const [k, v] of Object.entries(rec.stats ?? {})) if (!RATE_KEYS.has(k)) stripped[k] = v;
  return calculateFantasyPoints(stripped, scoringSettings) / rec.fantasyPoints;
}

// ─── §3.6 live level from a snapshot row ──────────────────────────────────────

/**
 * → { level, source, basisScale, levelHalf } | null. `levelHalf` is null when `rookieBasisScale` is not a
 * finite positive number (the adapter excludes and counts that row).
 */
export function liveLevel(p) {
  const proj = p?.projection;
  if (proj?.confidence !== 'rookie') return null;
  const f = proj.factors ?? {};
  let level, source;
  if ('qbStarterPPG' in f) { level = f.qbStarterPPG; source = 'qbStarterPPG'; }
  else if ('qbTakeoverBasis' in f) return null;
  else { level = proj.projectedPPG; source = 'projectedPPG'; }
  if (!Number.isFinite(level)) return null;
  const basisScale = f.rookieBasisScale;
  const ok = Number.isFinite(basisScale) && basisScale > 0;
  return { level, source, basisScale: ok ? basisScale : null, levelHalf: ok ? level / basisScale : null };
}

// ─── §4 held-out comparison ───────────────────────────────────────────────────

export function unitsFrom(games, minUnitGames = QB_ROOKIE_DEFAULTS.minUnitGames) {
  const m = new Map();
  for (const g of games) {
    const k = `${g.pid}|${g.S}`;
    let u = m.get(k);
    if (!u) { u = { pid: g.pid, S: g.S, group: g.group, games: 0, sum: 0 }; m.set(k, u); }
    u.games++; u.sum += g.pts;
  }
  return [...m.values()].filter((u) => u.games >= minUnitGames).map(({ sum, ...u }) => ({ ...u, y: sum / u.games }));
}

export function losoCompare({ games, units, priorOf, bootstrap = QB_ROOKIE_DEFAULTS.bootstrap }) {
  const tot = { sum: 0, n: 0 }, totS = new Map(), totG = new Map();
  const bump = (m, k, g) => { let e = m.get(k); if (!e) { e = { sum: 0, n: 0 }; m.set(k, e); } e.sum += g.pts; e.n++; };
  for (const g of games) { tot.sum += g.pts; tot.n++; bump(totS, g.S, g); bump(totG, `${g.S}|${g.group}`, g); }
  const groupTot = new Map();
  for (const g of games) { let e = groupTot.get(g.group); if (!e) { e = { sum: 0, n: 0 }; groupTot.set(g.group, e); } e.sum += g.pts; e.n++; }

  const rows = [];
  let cFallback = 0;
  for (const [S, us] of bySeason(units)) {
    const sS = totS.get(S) ?? { sum: 0, n: 0 };
    const B = (tot.sum - sS.sum) / (tot.n - sS.n);
    for (const u of us) {
      const gt = groupTot.get(u.group) ?? { sum: 0, n: 0 };
      const gs = totG.get(`${S}|${u.group}`) ?? { sum: 0, n: 0 };
      const n = gt.n - gs.n;
      let C;
      if (n > 0) C = (gt.sum - gs.sum) / n; else { C = B; cFallback++; }
      const A = priorOf(u);
      if (!Number.isFinite(A)) throw new Error(`[qb-rookie-level] priorOf returned ${A} for a ${u.group} unit — the ktc-neutral comparator must cover every unit`);
      rows.push({ pid: u.pid, group: u.group, y: u.y, A, B, C, D: Math.min(A, C) });
    }
  }
  const err = (r, k) => Math.abs(r[k] - r.y);
  const mae = {};
  for (const k of ['A', 'B', 'C', 'D']) mae[k] = mean(rows.map((r) => err(r, k)));
  const ids = rows.map((r) => r.pid);
  const compare = (nw, old) => {
    const diffs = rows.map((r) => err(r, nw) - err(r, old));
    const ci = bootstrapPairedMean(ids, diffs, bootstrap);
    return { new: nw, old, mean: mean(diffs), ci95: ci ? ci.ci95 : null, label: ci ? compareLabel(ci.ci95) : null };
  };
  const biasA = {}, unitsByGroup = {};
  for (const grp of GROUPS) {
    const rs = rows.filter((r) => r.group === grp);
    unitsByGroup[grp] = rs.length;
    biasA[grp] = { n: rs.length, mean: rs.length ? mean(rs.map((r) => r.A - r.y)) : null };
  }
  return {
    units: rows.length, unitsByGroup, mae,
    comparisons: [compare('C', 'A'), compare('C', 'B'), compare('D', 'A')],
    biasA, cFallback,
  };
}
