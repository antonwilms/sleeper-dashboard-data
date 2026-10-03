/**
 * lib/qbTakeover.mjs — QB backup→starter takeover model (P6a), pure, no I/O.
 * Task file: .claude/tasks/qb-takeover-research.md. Adapter: scripts/qb-takeover-run.mjs
 * (`bin/backtest.mjs --qb-takeover`). Offline analysis only.
 *
 * A two-state weekly Markov chain over a team's game sequence: hazard `pUp` (a non-starter QB is the
 * team's primary passer in game g) and stickiness `pStay` (a backup-origin starter stays primary).
 * Both are ridge-logistic over CATEGORICAL features, so the per-pattern (trials, events) table is an
 * exact set of sufficient statistics: every fitted coefficient re-derives from it.
 *
 * Public exports:
 *   QB_TAKEOVER_DEFAULTS, HAZARD_KEYS, STICK_KEYS, HAZARD_LADDER, STICK_LADDER, LEVELS
 *   primaryPassers(gamelogs, S)                      → Map<"T|week", { pid, dropbacks, attempts }>
 *   checkpointChart(depth, S, T, weeks, i, opts)     → (string|null)[] | null
 *   priorPPG(totalsRec), incPPG({ prior, obs })      → number | null
 *   buildRows({...})                                 → { hazard, stick, g1, excluded, agreement, teams }
 *   coverageFor(schedule, primaries)                 → { teamGames, withPrimary, rate }
 *   patternTable, aggregatePatterns, fitLogistic, fitFromPatterns, fitFromRows, predict
 *   losoLogistic, compareModels, forwardLadder, calibration
 *   expectedStarts({ hazard, stick, start, remaining })
 */

import {
  IN_SEASON_DEFAULTS, bootstrapPairedMean, compareLabel, ageOnDate,
} from './inSeasonEvidence.mjs';
import { eraTeam, DEPTH_ESPN_FROM_SEASON } from './nflverse.mjs';

// ─── Constants and pre-registered feature levels (§3.4) ───────────────────────

export const QB_TAKEOVER_DEFAULTS = {
  seasons: { from: 2013, to: 2025 },
  incK: 3, priorMinGames: 4, obsMinGamesNoPrior: 2,
  lambda: 1.0, maxIter: 100, tol: 1e-10, clipEps: 1e-6,
  coverageMin: 0.99,
  minRosGames: 4,
  bnCap: 8, streakCap: 4,
  weakCut: 0.85, strongCut: 1.10,
  winLow: 0.35, winHigh: 0.65,
  bootstrap: IN_SEASON_DEFAULTS.bootstrap,
  // The app's depth multiplier (QB2 0.88, QB3+ 0.68, rookie 1.0) read as a start share; an order-1
  // non-incumbent (the app's 1.05) is capped at 1.0 because a share cannot exceed 1.
  appFlat: { d1: 1.0, d2: 0.88, d3: 0.68, rookie: 1.0 },
  q5: { maxDraftOvr: 100, classFrom: 2013, classTo: 2023, band: 1 },
};

export const HAZARD_KEYS = ['dg', 'rk', 'ps', 'iq', 'bn', 'wk', 'dp', 'wp', 'og'];
export const STICK_KEYS = ['st', 'dg3', 'rk', 'dq'];
export const HAZARD_LADDER = ['dp', 'og', 'dg', 'ps', 'rk', 'iq', 'bn', 'wk', 'wp'];
export const STICK_LADDER = ['st', 'dg3', 'dq', 'rk'];

export const LEVELS = {
  dg: ['udfa', 'day3', 'day2', 'r1', 'top12'],
  rk: ['vet', 'rookie'],
  ps: ['first', 're'],
  iq: ['mid', 'weak', 'strong', 'unknown'],
  bn: ['b0', 'b1', 'b2'],
  wk: ['early', 'mid', 'late'],
  dp: ['d2', 'd1', 'd3'],
  wp: ['mid', 'losing', 'winning'],
  og: ['no', 'yes'],
  st: ['s1', 's2', 's3'],
  dg3: ['late', 'day2', 'r1'],
  dq: ['mid', 'weak', 'strong', 'unknown'],
};

const COEF_NAME = {};
for (const [k, lv] of Object.entries(LEVELS)) COEF_NAME[k] = lv.map((l) => `${k}=${l}`);

const num = (a, b) => a - b;

// ─── Small helpers ────────────────────────────────────────────────────────────

function medianOf(values) {
  if (!values.length) return null;
  const s = [...values].sort(num);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export const bnCode = (c) => (c <= 2 ? 0 : c <= 7 ? 1 : 2);
export const wkCode = (g) => (g <= 6 ? 0 : g <= 12 ? 1 : 2);
export const stCode = (s) => (s <= 1 ? 0 : s <= 3 ? 1 : 2);
export const dpCode = (order) => (order === 1 ? 1 : order === 2 ? 0 : 2);
export const dg3Code = (dg) => (dg <= 1 ? 0 : dg === 2 ? 1 : 2);

/** draft group code from a crosswalk entry; null when the entry is absent. */
export function dgCode(entry) {
  if (!entry) return null;
  if (entry.undrafted === true || entry.draftOvr == null) return 0;
  const o = entry.draftOvr;
  return o <= 12 ? 4 : o <= 32 ? 3 : o <= 100 ? 2 : 1;
}

export function iqCode(ppg, med, d = QB_TAKEOVER_DEFAULTS) {
  if (ppg == null || med == null || !(med > 0)) return 3;
  const rel = ppg / med;
  return rel < d.weakCut ? 1 : rel > d.strongCut ? 2 : 0;
}

// ─── §3.1 primary passer ──────────────────────────────────────────────────────

function betterPasser(a, b) {
  if (a.dropbacks !== b.dropbacks) return a.dropbacks > b.dropbacks;
  if (a.attempts !== b.attempts) return a.attempts > b.attempts;
  return a.pid < b.pid;
}

export function primaryPassers(gamelogsFile, S) {
  const out = new Map();
  for (const [pid, rec] of Object.entries(gamelogsFile?.players ?? {})) {
    for (const g of rec?.games ?? []) {
      if (g.seasonType !== 'REG') continue;
      const dropbacks = (g.attempts ?? 0) + (g.sacksSuffered ?? 0);
      if (!(dropbacks > 0)) continue;
      const key = `${eraTeam(g.team, S)}|${g.week}`;
      const cand = { pid, dropbacks, attempts: g.attempts ?? 0 };
      const cur = out.get(key);
      if (!cur || betterPasser(cand, cur)) out.set(key, cand);
    }
  }
  return out;
}

// ─── §3.2 checkpoint chart ────────────────────────────────────────────────────

export function checkpointChart(depthFile, S, T, weeks, i, { espnFrom = DEPTH_ESPN_FROM_SEASON } = {}) {
  const at = (w) => depthFile?.weeks?.[w]?.[T]?.QB ?? null;
  if (S < espnFrom) return at(weeks[i]);
  if (i === 0) return null;
  return at(weeks[i] - 1) ?? at(weeks[i - 1]);
}

// ─── incPPG (self-contained, fixed k) ─────────────────────────────────────────

export function priorPPG(rec, minGames = QB_TAKEOVER_DEFAULTS.priorMinGames) {
  const gp = rec?.gamesPlayed;
  if (!(gp >= minGames) || !Number.isFinite(rec?.fantasyPoints)) return null;
  return rec.fantasyPoints / gp;
}

export function incPPG({ prior, obs }, { k = QB_TAKEOVER_DEFAULTS.incK, obsMin = QB_TAKEOVER_DEFAULTS.obsMinGamesNoPrior } = {}) {
  const n = obs.length;
  const sum = obs.reduce((a, b) => a + b, 0);
  if (prior != null) return n === 0 ? prior : (prior * k + sum) / (k + n);
  return n >= obsMin ? sum / n : null;
}

// ─── Coverage ─────────────────────────────────────────────────────────────────

export function coverageFor(schedule, primaries) {
  let teamGames = 0, withPrimary = 0;
  for (const gm of schedule?.games ?? []) {
    if (gm.gameType !== 'REG') continue;
    for (const T of [gm.homeTeam, gm.awayTeam]) {
      teamGames++;
      if (primaries.has(`${T}|${gm.week}`)) withPrimary++;
    }
  }
  return { teamGames, withPrimary, rate: teamGames > 0 ? withPrimary / teamGames : NaN };
}

// ─── §3.3 row assembly ────────────────────────────────────────────────────────

export function newExcluded() {
  return {
    noPrimary: 0, noPrevPrimary: 0, noGame1Primary: 0, noChart: 0, noChartG1: 0,
    noCrosswalk: 0, noCrosswalkStick: 0,
  };
}

export function buildRows({
  S, gamelogs, schedule, depth, seasonTotals, seasonTotalsPrev, bySleeper,
  espnFrom = DEPTH_ESPN_FROM_SEASON, primaries = null, defaults = QB_TAKEOVER_DEFAULTS,
}) {
  const prim = primaries ?? primaryPassers(gamelogs, S);
  const excluded = newExcluded();
  const agreement = { legacy: { n: 0, cur: 0, prev: 0 }, espn: { n: 0, cur: 0, prev: 0 } };
  const hazard = [], stick = [], g1 = [];

  // team game sequences (era-coded, byes skipped)
  const teamGames = new Map();
  for (const gm of schedule?.games ?? []) {
    if (gm.gameType !== 'REG') continue;
    for (const [T, pf, pa] of [[gm.homeTeam, gm.homeScore, gm.awayScore], [gm.awayTeam, gm.awayScore, gm.homeScore]]) {
      if (!teamGames.has(T)) teamGames.set(T, []);
      teamGames.get(T).push({ week: gm.week, pf, pa });
    }
  }
  for (const games of teamGames.values()) games.sort((a, b) => a.week - b.week);

  // calendar-week primary-start index (ps)
  const startWeeks = new Map();
  for (const [key, p] of prim) {
    const w = Number(key.slice(key.indexOf('|') + 1));
    if (!startWeeks.has(p.pid)) startWeeks.set(p.pid, []);
    startWeeks.get(p.pid).push(w);
  }

  const priorCache = new Map();
  const priorOf = (pid) => {
    if (!priorCache.has(pid)) priorCache.set(pid, priorPPG(seasonTotalsPrev?.[pid], defaults.priorMinGames));
    return priorCache.get(pid);
  };
  const ppgCache = new Map();
  const ppgAt = (pid, w) => {
    const key = `${pid}|${w}`;
    if (ppgCache.has(key)) return ppgCache.get(key);
    const obs = [];
    const wp = seasonTotals?.[pid]?.weeklyPoints;
    if (wp) for (const [wk, v] of Object.entries(wp)) if (Number(wk) < w && Number.isFinite(v)) obs.push(v);
    const v = incPPG({ prior: priorOf(pid), obs }, { k: defaults.incK, obsMin: defaults.obsMinGamesNoPrior });
    ppgCache.set(key, v);
    return v;
  };
  const medCache = new Map();
  const medianAt = (w) => {
    if (medCache.has(w)) return medCache.get(w);
    const vals = [];
    for (const [T, games] of teamGames) {
      let last = null;
      for (const gm of games) { if (gm.week < w) last = gm; else break; }
      if (!last) continue;
      const p = prim.get(`${T}|${last.week}`);
      if (!p) continue;
      const v = ppgAt(p.pid, w);
      if (v != null) vals.push(v);
    }
    const m = medianOf(vals);
    medCache.set(w, m);
    return m;
  };
  let medG1 = undefined;
  const medianG1 = () => {
    if (medG1 !== undefined) return medG1;
    const vals = [];
    for (const [T, games] of teamGames) {
      const weeks = games.map((x) => x.week);
      const c0 = checkpointChart(depth, S, T, weeks, 0, { espnFrom })?.[0];
      if (c0 == null) continue;
      const v = priorOf(c0);
      if (v != null) vals.push(v);
    }
    medG1 = medianOf(vals);
    return medG1;
  };

  const ageOf = (entry) => ageOnDate(entry?.birthdate, `${S}-09-01`);

  for (const [T, games] of teamGames) {
    const weeks = games.map((x) => x.week);
    const G = games.length;
    const P = games.map((gm) => prim.get(`${T}|${gm.week}`) ?? null);
    const charts = games.map((_, i) => checkpointChart(depth, S, T, weeks, i, { espnFrom }));
    const incs = games.map((_, i) => (i >= 1 ? (P[i - 1]?.pid ?? null) : (charts[0]?.[0] ?? null)));
    const P1 = P[0]?.pid ?? null;
    if (!P1) excluded.noGame1Primary++;

    // win% prefix (a tie counts 0.5; games without scores are not counted)
    const wins = [0], counted = [0];
    for (let i = 0; i < G; i++) {
      const { pf, pa } = games[i];
      const has = Number.isFinite(pf) && Number.isFinite(pa);
      wins.push(wins[i] + (has ? (pf > pa ? 1 : pf === pa ? 0.5 : 0) : 0));
      counted.push(counted[i] + (has ? 1 : 0));
    }

    const bnCount = new Map();
    for (let i = 0; i < G; i++) {
      const g = i + 1, w = weeks[i], Pg = P[i], chart = charts[i];
      if (!Pg) {
        excluded.noPrimary++;
      } else if (g >= 2 && !P[i - 1]) {
        excluded.noPrevPrimary++;
      } else {
        const inc = incs[i];
        const winPct = counted[i] > 0 ? wins[i] / counted[i] : null;
        const wp = winPct == null ? 0 : winPct < defaults.winLow ? 1 : winPct > defaults.winHigh ? 2 : 0;

        // agreement (raw week-w chart, both eras)
        if (g >= 2) {
          const raw = depth?.weeks?.[w]?.[T]?.QB?.[0];
          if (raw != null) {
            const era = S >= DEPTH_ESPN_FROM_SEASON ? 'espn' : 'legacy';
            agreement[era].n++;
            if (raw === Pg.pid) agreement[era].cur++;
            if (raw === P[i - 1].pid) agreement[era].prev++;
          }
        }

        // incumbent quality at this checkpoint
        const med = g === 1 ? medianG1() : medianAt(w);
        const incPpg = inc != null ? ppgAt(inc, w) : null;
        const iq = iqCode(incPpg, med, defaults);
        const incRel = incPpg != null && med != null && med > 0 ? incPpg / med : null;

        // ── hazard / g1 rows
        let chartOk = true;
        if (g === 1) {
          if (chart == null || inc == null) { excluded.noChartG1++; chartOk = false; }
        } else if (chart == null) { excluded.noChart++; chartOk = false; }
        if (chartOk) {
          const seen = new Set();
          chart.forEach((x, idx) => {
            if (x == null || seen.has(x)) return;
            seen.add(x);
            if (x === inc) return;
            const entry = bySleeper?.[x];
            if (!entry) { excluded.noCrosswalk++; return; }
            const dg = dgCode(entry);
            const og = g >= 2 && P1 != null && x === P1 ? 1 : 0;
            const ws = startWeeks.get(x);
            const ps = ws && ws.some((v) => v < w) ? 1 : 0;
            const benched = bnCount.get(x) ?? 0;
            let actualGames = 0;
            for (let j = i; j < G; j++) if (P[j]?.pid === x) actualGames++;
            const dq = g === 1 || og === 1 || P1 == null ? 3 : iqCode(ppgAt(P1, w), medianAt(w), defaults);
            const row = {
              S, team: T, g, week: w, pid: x, cluster: `${S}|${T}`, y: Pg.pid === x ? 1 : 0,
              f: { dg, rk: entry.draftYear === S ? 1 : 0, ps, iq, bn: bnCode(benched), wk: wkCode(g), dp: dpCode(idx + 1), wp, og },
              draftOvr: entry.draftOvr ?? null, age: ageOf(entry), incPPG: incPpg, incRel, benched,
              winPct, depthOrder: idx + 1, remaining: G - i, actualGames, actual: actualGames / (G - i),
              stickCodes: { dg3: dg3Code(dg), rk: entry.draftYear === S ? 1 : 0, dq },
            };
            (g === 1 ? g1 : hazard).push(row);
          });
        }

        // ── stickiness row (backup-origin starter = inc ≠ the team's game-1 primary)
        if (g >= 2 && P1 != null && inc !== P1) {
          const entry = bySleeper?.[inc];
          if (!entry) {
            excluded.noCrosswalkStick++;
          } else {
            let streak = 0;
            for (let j = i - 1; j >= 0 && P[j]?.pid === inc; j--) streak++;
            const dg = dgCode(entry);
            stick.push({
              S, team: T, g, week: w, pid: inc, cluster: `${S}|${T}`, y: Pg.pid === inc ? 1 : 0,
              f: {
                st: stCode(streak), dg3: dg3Code(dg), rk: entry.draftYear === S ? 1 : 0,
                dq: iqCode(ppgAt(P1, w), medianAt(w), defaults),
              },
              streak,
            });
          }
        }
      }

      // bn update after game i: non-incumbent chart members who were not primary
      if (chart && incs[i] != null && Pg) {
        const seen = new Set();
        for (const x of chart) {
          if (x == null || seen.has(x)) continue;
          seen.add(x);
          if (x !== incs[i] && x !== Pg.pid) bnCount.set(x, (bnCount.get(x) ?? 0) + 1);
        }
      }
    }
  }
  return { hazard, stick, g1, excluded, agreement, teams: teamGames };
}

// ─── §4.1 pattern tables ──────────────────────────────────────────────────────

/** rows → [[S, ...codes(keys), trials, events], …] sorted lexicographically. */
export function patternTable(rows, keys) {
  const m = new Map();
  for (const r of rows) {
    const codes = keys.map((k) => r.f[k]);
    const key = `${r.S}|${codes.join(',')}`;
    let e = m.get(key);
    if (!e) { e = [r.S, ...codes, 0, 0]; m.set(key, e); }
    e[e.length - 2]++;
    e[e.length - 1] += r.y;
  }
  return [...m.values()].sort((a, b) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
    return 0;
  });
}

/** Sum a full-key table over the omitted keys (and over S). `offset` 1 = leading S column, 0 = pooled fixture. */
export function aggregatePatterns(table, keys, usedKeys, { offset = 1, exclude = null } = {}) {
  const pos = usedKeys.map((k) => keys.indexOf(k));
  if (pos.some((p) => p < 0)) throw new Error(`[qbTakeover] used key not in table keys: ${usedKeys}`);
  const m = new Map();
  for (const row of table) {
    if (exclude != null && offset === 1 && row[0] === exclude) continue;
    const codes = pos.map((p) => row[offset + p]);
    const key = codes.join(',');
    let e = m.get(key);
    if (!e) { e = { c: Object.fromEntries(usedKeys.map((k, i) => [k, codes[i]])), n: 0, e: 0 }; m.set(key, e); }
    e.n += row[row.length - 2];
    e.e += row[row.length - 1];
  }
  return [...m.values()];
}

/** Row-level path: aggregate directly by the used keys (independent of any full table). */
function patternsFromRows(rows, usedKeys) {
  const m = new Map();
  for (const r of rows) {
    const codes = usedKeys.map((k) => r.f[k]);
    const key = codes.join(',');
    let e = m.get(key);
    if (!e) { e = { c: Object.fromEntries(usedKeys.map((k, i) => [k, codes[i]])), n: 0, e: 0 }; m.set(key, e); }
    e.n++; e.e += r.y;
  }
  return [...m.values()];
}

// ─── §4.2 ridge logistic (Newton–Raphson, Gaussian elimination) ───────────────

function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-14) throw new Error('[qbTakeover] singular Hessian');
    if (piv !== c) [M[piv], M[c]] = [M[c], M[piv]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

export function fitLogistic(patterns, usedKeys, {
  lambda = QB_TAKEOVER_DEFAULTS.lambda, maxIter = QB_TAKEOVER_DEFAULTS.maxIter, tol = QB_TAKEOVER_DEFAULTS.tol,
} = {}) {
  const names = ['intercept'];
  const colOf = {};
  for (const k of usedKeys) {
    if (!LEVELS[k]) throw new Error(`[qbTakeover] unknown feature key ${k}`);
    colOf[k] = LEVELS[k].map((_, code) => (code === 0 ? -1 : names.push(COEF_NAME[k][code]) - 1));
  }
  const p = names.length;
  let N = 0, E = 0;
  const P = patterns.map((pt) => {
    const idx = [0];
    for (const k of usedKeys) {
      const col = colOf[k][pt.c[k]];
      if (col === undefined) throw new Error(`[qbTakeover] level code ${pt.c[k]} out of range for ${k}`);
      if (col > 0) idx.push(col);
    }
    N += pt.n; E += pt.e;
    return { idx, n: pt.n, e: pt.e };
  });
  if (N === 0) throw new Error('[qbTakeover] fitLogistic: no trials');
  const beta = new Array(p).fill(0);
  beta[0] = Math.log((E + 0.5) / (N - E + 0.5));
  let converged = false, iterations = 0;
  for (let it = 1; it <= maxIter; it++) {
    const grad = new Array(p).fill(0);
    const H = Array.from({ length: p }, () => new Array(p).fill(0));
    for (const pt of P) {
      let z = 0;
      for (const j of pt.idx) z += beta[j];
      const mu = 1 / (1 + Math.exp(-z));
      const w = pt.n * mu * (1 - mu);
      const r = pt.e - pt.n * mu;
      for (const j of pt.idx) {
        grad[j] += r;
        for (const k of pt.idx) H[j][k] += w;
      }
    }
    for (let j = 1; j < p; j++) { grad[j] -= lambda * beta[j]; H[j][j] += lambda; }
    const delta = solveLinear(H, grad);
    let maxD = 0;
    for (let j = 0; j < p; j++) {
      beta[j] += delta[j];
      if (!Number.isFinite(beta[j])) throw new Error('[qbTakeover] fitLogistic diverged (non-finite β)');
      maxD = Math.max(maxD, Math.abs(delta[j]));
    }
    iterations = it;
    if (maxD < tol) { converged = true; break; }
  }
  if (!converged) throw new Error(`[qbTakeover] fitLogistic did not converge in ${maxIter} iterations (λ=${lambda})`);
  let logLik = 0;
  for (const pt of P) {
    let z = 0;
    for (const j of pt.idx) z += beta[j];
    const mu = Math.min(1 - 1e-12, Math.max(1e-12, 1 / (1 + Math.exp(-z))));
    logLik += pt.e * Math.log(mu) + (pt.n - pt.e) * Math.log(1 - mu);
  }
  const coef = {};
  names.forEach((nm, j) => { coef[nm] = beta[j]; });
  return { coef, iterations, logLik, keys: [...usedKeys], lambda };
}

export function fitFromPatterns(table, keys, usedKeys, opts = {}) {
  const { offset = 1, exclude = null, ...fitOpts } = opts;
  return fitLogistic(aggregatePatterns(table, keys, usedKeys, { offset, exclude }), usedKeys, fitOpts);
}

export function fitFromRows(rows, usedKeys, opts = {}) {
  return fitLogistic(patternsFromRows(rows, usedKeys), usedKeys, opts);
}

export function predict(model, codes) {
  let z = model.coef.intercept;
  for (const k of model.keys) {
    const c = codes[k];
    if (c > 0) z += model.coef[COEF_NAME[k][c]];
  }
  return 1 / (1 + Math.exp(-z));
}

/** Sum a per-season table over S → pooled fixture rows [...codes, trials, events], sorted lexicographically. */
export function poolTable(table, nKeys) {
  const m = new Map();
  for (const row of table) {
    const codes = row.slice(1, 1 + nKeys);
    const key = codes.join(',');
    let e = m.get(key);
    if (!e) { e = [...codes, 0, 0]; m.set(key, e); }
    e[nKeys] += row[row.length - 2];
    e[nKeys + 1] += row[row.length - 1];
  }
  return [...m.values()].sort((a, b) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
    return 0;
  });
}

export const roundCoef = (b) => Math.round(b * 1e4) / 1e4;

// ─── §4.3 held-out scoring ────────────────────────────────────────────────────

function rowLogLoss(p, y, eps = QB_TAKEOVER_DEFAULTS.clipEps) {
  const q = Math.min(1 - eps, Math.max(eps, p));
  return -(y * Math.log(q) + (1 - y) * Math.log(1 - q));
}

/** Leave-one-season-out fit/predict over the used keys. Returns per-row preds aligned to `rows`. */
export function losoLogistic(rows, usedKeys, opts = {}) {
  const seasonRows = new Map();
  rows.forEach((r, i) => {
    if (!seasonRows.has(r.S)) seasonRows.set(r.S, []);
    seasonRows.get(r.S).push(i);
  });
  const perSeason = new Map();
  for (const [S, idxs] of seasonRows) perSeason.set(S, patternsFromRows(idxs.map((i) => rows[i]), usedKeys));
  const preds = new Float64Array(rows.length);
  const ll = new Float64Array(rows.length);
  const folds = [];
  for (const [S, idxs] of seasonRows) {
    const merged = new Map();
    for (const [S2, pats] of perSeason) {
      if (S2 === S) continue;
      for (const pt of pats) {
        const key = usedKeys.map((k) => pt.c[k]).join(',');
        const e = merged.get(key);
        if (e) { e.n += pt.n; e.e += pt.e; } else merged.set(key, { c: pt.c, n: pt.n, e: pt.e });
      }
    }
    const model = fitLogistic([...merged.values()], usedKeys, opts);
    folds.push({ S, coef: model.coef, iterations: model.iterations });
    for (const i of idxs) {
      preds[i] = predict(model, rows[i].f);
      ll[i] = rowLogLoss(preds[i], rows[i].y);
    }
  }
  let sumLL = 0, sumB = 0;
  for (let i = 0; i < rows.length; i++) { sumLL += ll[i]; sumB += (preds[i] - rows[i].y) ** 2; }
  return {
    usedKeys: [...usedKeys], preds, ll, folds,
    logLoss: rows.length ? sumLL / rows.length : NaN, brier: rows.length ? sumB / rows.length : NaN,
  };
}

/** Paired log-loss comparison of B vs A (per-row ll_B − ll_A), team-season cluster bootstrap. */
export function compareModels(rows, llA, llB, bootstrap = QB_TAKEOVER_DEFAULTS.bootstrap) {
  const diffs = new Array(rows.length);
  let s = 0;
  for (let i = 0; i < rows.length; i++) { diffs[i] = llB[i] - llA[i]; s += diffs[i]; }
  const ci = bootstrapPairedMean(rows.map((r) => r.cluster), diffs, bootstrap);
  return { mean: rows.length ? s / rows.length : NaN, ci95: ci ? ci.ci95 : null, label: ci ? compareLabel(ci.ci95) : null };
}

/** Calibration by decile of p: [{ bin, rows, meanP, meanY }]. */
export function calibration(rows, preds, bins = 10) {
  const order = rows.map((_, i) => i).sort((a, b) => preds[a] - preds[b]);
  const out = [];
  for (let b = 0; b < bins; b++) {
    const lo = Math.floor((b * order.length) / bins), hi = Math.floor(((b + 1) * order.length) / bins);
    let sp = 0, sy = 0;
    for (let k = lo; k < hi; k++) { sp += preds[order[k]]; sy += rows[order[k]].y; }
    const n = hi - lo;
    out.push({ bin: b + 1, rows: n, meanP: n ? sp / n : null, meanY: n ? sy / n : null });
  }
  return out;
}

// ─── §4.4 forward ladder ──────────────────────────────────────────────────────

export function forwardLadder(rows, candidates, { opts = {}, bootstrap = QB_TAKEOVER_DEFAULTS.bootstrap } = {}) {
  let F = [];
  let cur = losoLogistic(rows, F, opts);
  const steps = [];
  for (const c of candidates) {
    const trial = [...F, c];
    const next = losoLogistic(rows, trial, opts);
    const cmp = compareModels(rows, cur.ll, next.ll, bootstrap);
    const adopted = cmp.label === 'BEATS';
    steps.push({
      c, usedKeys: trial, loglossBefore: cur.logLoss, loglossAfter: next.logLoss,
      mean: cmp.mean, ci95: cmp.ci95, label: cmp.label, adopted,
    });
    if (adopted) { F = trial; cur = next; }
  }
  return { steps, final: F, finalLoso: cur };
}

// ─── §4.5 the chain ───────────────────────────────────────────────────────────

const asFn = (m) => (typeof m === 'function' ? m : (codes) => predict(m, codes));

/**
 * Exact forward recursion over 54 states (role, ps, c, s). `start` = { ps, c, g, hazardCodes, stickCodes,
 * role = 'B', s = 1 }; hazard/stick are fitted models or `(codes) => p`.
 */
export function expectedStarts({ hazard, stick, start, remaining, cfg = QB_TAKEOVER_DEFAULTS }) {
  const hz = asFn(hazard), sk = asFn(stick);
  const C = cfg.bnCap + 1, SC = cfg.streakCap;
  const bIdx = (ps, c) => ps * C + c;
  const sIdx = (c, s) => 2 * C + c * SC + (s - 1);
  const NS = 2 * C + C * SC;
  let mass = new Float64Array(NS);
  const role = start.role ?? 'B';
  if (role === 'B') mass[bIdx(start.ps, Math.min(start.c, cfg.bnCap))] = 1;
  else mass[sIdx(Math.min(start.c, cfg.bnCap), Math.min(start.s ?? 1, SC))] = 1;

  const stickCodes = { ...start.stickCodes };
  if (start.hazardCodes?.og === 1) stickCodes.dq = LEVELS.dq.indexOf('unknown');
  const pStay = [0, 1, 2].map((st) => sk({ ...stickCodes, st }));

  const perGame = [], massPerGame = [];
  for (let j = 0; j < remaining; j++) {
    const wk = wkCode(start.g + j);
    const pUp = new Map();
    const up = (ps, c) => {
      const key = ps * 3 + bnCode(c);
      if (!pUp.has(key)) pUp.set(key, hz({ ...start.hazardCodes, ps, bn: bnCode(c), wk }));
      return pUp.get(key);
    };
    const next = new Float64Array(NS);
    for (let ps = 0; ps < 2; ps++) {
      for (let c = 0; c < C; c++) {
        const m = mass[bIdx(ps, c)];
        if (m === 0) continue;
        const p = up(ps, c);
        next[sIdx(c, 1)] += m * p;
        next[bIdx(ps, Math.min(c + 1, cfg.bnCap))] += m * (1 - p);
      }
    }
    for (let c = 0; c < C; c++) {
      for (let s = 1; s <= SC; s++) {
        const m = mass[sIdx(c, s)];
        if (m === 0) continue;
        const q = pStay[stCode(s)];
        next[sIdx(c, Math.min(s + 1, SC))] += m * q;
        next[bIdx(1, c)] += m * (1 - q);
      }
    }
    let pS = 0, tot = 0;
    for (let i = 0; i < NS; i++) { tot += next[i]; if (i >= 2 * C) pS += next[i]; }
    perGame.push(pS); massPerGame.push(tot);
    mass = next;
  }
  const expected = perGame.reduce((a, b) => a + b, 0);
  return { perGame, expected, fraction: remaining > 0 ? expected / remaining : NaN, massPerGame };
}

export const CHAIN_TEXT = {
  states:
    'State = (role, ps, c, s). role ∈ {B (non-starter), S (starter)}; ps ∈ {first, re} for B; c = benched count capped at 8 ' +
    '(enough for every bn bin: b0 0–2, b1 3–7, b2 8+); s = consecutive-start streak capped at 4 for S (st bins: s1 = 1, s2 = 2–3, s3 = 4+). ' +
    '9 (B, first) + 9 (B, re) + 9×4 (S, carrying c so a demoted starter resumes his count) = 54 states.',
  transitions:
    'Into game j (wk code from that game\'s team-game index): (B, ps, c) → (S, c, 1) with p = pUp(codes with ps, bn(c), wk), else (B, ps, min(c+1, 8)). ' +
    '(S, c, s) → (S, c, min(s+1, 4)) with p = pStay(st(s), dg3, rk, dq), else (B, re, c) with NO increment ' +
    '(in the demotion game he was the incumbent, and bn counts only non-incumbent games). Held at checkpoint values: iq, dq, wp, dg/dg3, rk, dp, og. ' +
    'A demoted starter re-enters B at the checkpoint dp (a stated simplification). Returning original starter (og = yes): once he is starter again the chain ' +
    'uses the backup-origin pStay with dq = unknown (an approximation — the stickiness model is fitted only on backup-origin starters). ' +
    'expected = Σ_j P(role = S at game j); the first remaining game is entered from the checkpoint state.',
};
