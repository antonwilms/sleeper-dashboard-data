/**
 * scripts/qb-takeover-run.mjs — QB takeover fit adapter (`bin/backtest.mjs --qb-takeover`).
 * Task file: .claude/tasks/qb-takeover-research.md (P6a). Offline analysis only: no served file,
 * no manifest entry. The pure logic is lib/qbTakeover.mjs.
 *
 * Public exports:
 *   QB_TAKEOVER_LOAD, CoverageStop
 *   runQbTakeover({ load, defaults, log })           → result (meta, coverage, q1…q6, ladders, constants)
 *   buildQbTakeoverVerdictMarkdown(result)           → string
 *   formatQbTakeoverConstantsJson(file)              → string
 *   writeQbTakeoverArtifacts({ result, verdictMd })  → { panelPath, constantsPath, verdictPath, … }
 *   qbTakeoverMain({ load, write, asJson, … })       → exit code
 */

import fs from 'fs';
import path from 'path';
import { repoPath } from '../lib/io.mjs';
import { bootstrapPairedMean, compareLabel } from '../lib/inSeasonEvidence.mjs';
import { DEPTH_ESPN_FROM_SEASON } from '../lib/nflverse.mjs';
import { INSEASON_LOAD, guardLoad } from './inseason-run.mjs';
import {
  QB_TAKEOVER_DEFAULTS, HAZARD_KEYS, STICK_KEYS, HAZARD_LADDER, STICK_LADDER, LEVELS, CHAIN_TEXT,
  primaryPassers, coverageFor, buildRows, newExcluded, patternTable, poolTable, fitFromPatterns,
  predict, roundCoef, forwardLadder, losoLogistic, calibration, expectedStarts,
} from '../lib/qbTakeover.mjs';

export const QB_TAKEOVER_LOAD = INSEASON_LOAD;

export class CoverageStop extends Error {
  constructor(message, coverage) { super(message); this.name = 'CoverageStop'; this.coverage = coverage; }
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const eraOf = (S) => (S >= DEPTH_ESPN_FROM_SEASON ? 'espn' : 'legacy');
const rate = (e, n) => (n > 0 ? e / n : null);

function need(v, what) {
  if (v == null) throw new Error(`[qb-takeover] ${what} not found in the store`);
  return v;
}

// ─── Q6 raw tables ────────────────────────────────────────────────────────────

function tally(rows, keyFn) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    let e = m.get(k.id);
    if (!e) { e = { ...k.cols, trials: 0, events: 0 }; m.set(k.id, e); }
    e.trials++; e.events += r.y;
  }
  return [...m.values()].map((e) => ({ ...e, rate: rate(e.events, e.trials) }));
}

function q6Tables(hazard, g1) {
  const L = (k, c) => LEVELS[k][c];
  return {
    byDraftRookiePrior: tally(hazard, (r) => ({
      id: `${r.f.dg}|${r.f.rk}|${r.f.ps}`, cols: { dg: L('dg', r.f.dg), rk: L('rk', r.f.rk), ps: L('ps', r.f.ps) },
    })).sort((a, b) => LEVELS.dg.indexOf(a.dg) - LEVELS.dg.indexOf(b.dg) || a.rk.localeCompare(b.rk) || a.ps.localeCompare(b.ps)),
    byDepthEra: tally(hazard, (r) => ({
      id: `${r.f.dp}|${eraOf(r.S)}`, cols: { dp: L('dp', r.f.dp), era: eraOf(r.S) },
    })).sort((a, b) => a.dp.localeCompare(b.dp) || a.era.localeCompare(b.era)),
    d1ByOgEra: tally(hazard.filter((r) => r.f.dp === 1), (r) => ({
      id: `${r.f.og}|${eraOf(r.S)}`, cols: { og: L('og', r.f.og), era: eraOf(r.S) },
    })).sort((a, b) => a.og.localeCompare(b.og) || a.era.localeCompare(b.era)),
    g1ByDepth: tally(g1, (r) => ({ id: `${r.f.dp}`, cols: { dp: L('dp', r.f.dp) } }))
      .sort((a, b) => a.dp.localeCompare(b.dp)),
  };
}

// ─── Q4: expected remaining-start fraction vs three baselines ─────────────────

const chainStart = (r) => ({
  ps: r.f.ps, c: Math.min(r.benched, QB_TAKEOVER_DEFAULTS.bnCap), g: r.g, hazardCodes: r.f, stickCodes: r.stickCodes,
});

function appFlatShare(r, flat) {
  if (r.f.rk === 1) return flat.rookie;
  return r.f.dp === 1 ? flat.d1 : r.f.dp === 0 ? flat.d2 : flat.d3;
}

function q4Subset(rows, idxs, ev, bootstrap) {
  const sub = (key) => idxs.map((i) => Math.abs(ev[key][i] - rows[i].actual));
  const eC = sub('chain'), eA = sub('pooled'), eB = sub('depth'), eF = sub('flat');
  const clusters = idxs.map((i) => rows[i].cluster);
  const cmp = (base) => {
    const diffs = eC.map((v, k) => v - base[k]);
    const ci = bootstrapPairedMean(clusters, diffs, bootstrap);
    return { mean: mean(diffs), ci95: ci ? ci.ci95 : null, label: ci ? compareLabel(ci.ci95) : null };
  };
  return {
    n: idxs.length, maeChain: mean(eC), maePooledChain: mean(eA), maeDepthRate: mean(eB), maeAppFlat: mean(eF),
    vsPooled: cmp(eA), vsDepthRate: cmp(eB),
  };
}

function runQ4({ hazard, hazTable, stickTable, hazF, stickF, fitOpts, defaults }) {
  const rows = hazard.filter((r) => r.remaining >= defaults.minRosGames);
  const seasons = [...new Set(rows.map((r) => r.S))].sort((a, b) => a - b);
  const ev = {
    chain: new Float64Array(rows.length), pooled: new Float64Array(rows.length),
    depth: new Float64Array(rows.length), flat: new Float64Array(rows.length),
  };
  for (const S of seasons) {
    const fit = (table, keys, used) => fitFromPatterns(table, keys, used, { offset: 1, exclude: S, ...fitOpts });
    const hz = fit(hazTable, HAZARD_KEYS, hazF), sk = fit(stickTable, STICK_KEYS, stickF);
    const h0 = fit(hazTable, HAZARD_KEYS, []), s0 = fit(stickTable, STICK_KEYS, []);
    const dpRate = [0, 0, 0].map((_, dp) => mean(rows.filter((r) => r.S !== S && r.f.dp === dp).map((r) => r.actual)));
    rows.forEach((r, i) => {
      if (r.S !== S) return;
      const start = chainStart(r);
      ev.chain[i] = expectedStarts({ hazard: hz, stick: sk, start, remaining: r.remaining }).fraction;
      ev.pooled[i] = expectedStarts({ hazard: h0, stick: s0, start, remaining: r.remaining }).fraction;
      ev.depth[i] = dpRate[r.f.dp];
      ev.flat[i] = appFlatShare(r, defaults.appFlat);
    });
  }
  const all = rows.map((_, i) => i);
  const bs = defaults.bootstrap;
  const byDg = {};
  for (let dg = 0; dg < LEVELS.dg.length; dg++) {
    const idxs = all.filter((i) => rows[i].f.dg === dg);
    byDg[LEVELS.dg[dg]] = idxs.length ? q4Subset(rows, idxs, ev, bs) : { n: 0 };
  }
  return {
    population: 'hazard rows with >= 4 remaining team games (g from 2 to G-3)',
    pooled: q4Subset(rows, all, ev, bs),
    excludingOgYes: q4Subset(rows, all.filter((i) => rows[i].f.og === 0), ev, bs),
    byDg,
    appFlatNote: 'MAE only, no label — d1 non-incumbent capped at 1.0 (a share cannot exceed 1; the app multiplier is 1.05), QB2 0.88, QB3+ 0.68, rookie 1.0',
  };
}

// ─── Q5 dynasty "sat longer" (report-only) ────────────────────────────────────

function runQ5({ hazard, g1, hazModel, stickModel, bySleeper, primCount, seasonGames, totalsByYear, defaults }) {
  const q5 = defaults.q5;
  const first = new Map();
  for (const r of [...g1, ...hazard]) {
    const e = bySleeper[r.pid];
    if (!e || e.draftYear !== r.S || r.S < q5.classFrom || r.S > q5.classTo) continue;
    if (e.draftOvr == null || e.draftOvr > q5.maxDraftOvr) continue;
    const cur = first.get(r.pid);
    if (!cur || r.g < cur.g) first.set(r.pid, r);
  }
  const groups = new Map();
  const bucket = (id) => {
    if (!groups.has(id)) groups.set(id, { n: 0, share1: [], share2: [], ppg1: [], ppg2: [], resid: [] });
    return groups.get(id);
  };
  for (const [pid, r] of first) {
    const exp = expectedStarts({ hazard: hazModel, stick: stickModel, start: chainStart(r), remaining: r.remaining }).expected;
    const resid = r.actualGames - exp;
    const grp = resid < -q5.band ? 'sat-longer' : resid > q5.band ? 'earlier' : 'on-track';
    const dg = LEVELS.dg[r.f.dg];
    for (const id of [grp, `${grp} / ${dg}`]) {
      const b = bucket(id);
      b.n++; b.resid.push(resid);
      for (const [off, sk, pk] of [[1, 'share1', 'ppg1'], [2, 'share2', 'ppg2']]) {
        const Y = r.S + off;
        if (Y > defaults.seasons.to) continue;
        b[sk].push((primCount.get(Y)?.get(pid) ?? 0) / seasonGames.get(Y));
        const t = totalsByYear.get(Y)?.[pid];
        if (t && t.gamesPlayed >= 4 && Number.isFinite(t.fantasyPoints)) b[pk].push(t.fantasyPoints / t.gamesPlayed);
      }
    }
  }
  const out = {};
  for (const [id, b] of [...groups].sort((a, c) => a[0].localeCompare(c[0]))) {
    out[id] = {
      n: b.n, meanResidual: mean(b.resid),
      nextShare: { n: b.share1.length, mean: mean(b.share1) }, nextPPG: { n: b.ppg1.length, mean: mean(b.ppg1) },
      plus2Share: { n: b.share2.length, mean: mean(b.share2) }, plus2PPG: { n: b.ppg2.length, mean: mean(b.ppg2) },
    };
  }
  return {
    note: 'Report-only; no constant is pinned from Q5. Expected starts use the final (all-season) models from the rookie\'s first checkpoint; actual = primary games from that game to season end. residual = actual − expected; sat-longer < −1, earlier > +1.',
    population: first.size, groups: out,
  };
}

// ─── constants assembly ───────────────────────────────────────────────────────

function binsDefinition(d) {
  return {
    levels: LEVELS,
    dg: 'bySleeper: undrafted === true or draftOvr == null → udfa; draftOvr ≤ 12 top12; ≤ 32 r1; ≤ 100 day2; else day3; no crosswalk row → excluded',
    rk: 'rookie iff draftYear === S',
    ps: 're iff x was primary passer of any team-game of S (any team) whose calendar week < the week of game g',
    iq: `incRel = incPPG / median incPPG over all teams' incumbents as of calendar week w; weak < ${d.weakCut} ≤ mid ≤ ${d.strongCut} < strong; unknown when incPPG or the median is null`,
    bn: 'b0 0–2, b1 3–7, b2 8+ non-incumbent chart games not primary',
    wk: 'early g ≤ 6, mid 7–12, late ≥ 13 (team-game index)',
    dp: 'd2 order 2, d1 order 1 (non-incumbent), d3 order ≥ 3, in the checkpoint chart',
    wp: `mid ${d.winLow}–${d.winHigh}, losing < ${d.winLow}, winning > ${d.winHigh}; g = 1 → mid`,
    og: 'yes iff x is the team game-1 primary passer (g ≥ 2 only; no at g = 1)',
    st: 's1 = 1 consecutive start, s2 = 2–3, s3 = 4+',
    dg3: 'late = day3+udfa, day2, r1 = top12+r1',
    dq: 'iq bins applied to the game-1 primary passer\'s incPPG at this checkpoint',
  };
}

function maxAbsDiff(a, b) {
  let m = 0;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) m = Math.max(m, Math.abs((a[k] ?? 0) - (b[k] ?? 0)));
  return m;
}

// ─── runQbTakeover ────────────────────────────────────────────────────────────

export function runQbTakeover({ load = QB_TAKEOVER_LOAD, defaults = QB_TAKEOVER_DEFAULTS, log = () => {} } = {}) {
  const g = guardLoad(load, { maxLoadSeason: defaults.seasons.to });
  const { from, to } = defaults.seasons;
  const fitOpts = { lambda: defaults.lambda, maxIter: defaults.maxIter, tol: defaults.tol };
  const bySleeper = need(g.loadPlayerIds(), 'nflverse/playerids.json').bySleeper ?? {};

  // 1. load every season, primary passers, coverage — stop before any fitting if a season is thin
  const ctx = new Map();
  const coverage = [];
  const totalsByYear = new Map();
  for (let S = from; S <= to; S++) {
    const gl = need(g.loadGameLogs(S), `nflverse/gamelogs/${S}.json`);
    const sc = need(g.loadSchedule(S), `nflverse/schedule/${S}.json`);
    const depth = need(g.loadDepth(S), `nflverse/depth/${S}.json`);
    const st = need(g.loadSeasonTotals(S), `nfl/season-totals/${S}.json`);
    const stPrev = need(g.loadSeasonTotals(S - 1), `nfl/season-totals/${S - 1}.json`);
    totalsByYear.set(S, st);
    const primaries = primaryPassers(gl, S);
    const cov = coverageFor(sc, primaries);
    coverage.push({ S, teamGames: cov.teamGames, withPrimary: cov.withPrimary, rate: Number.isFinite(cov.rate) ? cov.rate : null });
    ctx.set(S, { gl, sc, depth, st, stPrev, primaries });
  }
  const bad = coverage.filter((c) => c.teamGames === 0 || c.rate == null || c.rate < defaults.coverageMin);
  if (bad.length) {
    throw new CoverageStop(
      `[qb-takeover] primary-passer coverage below ${defaults.coverageMin} (or an empty/non-finite denominator) in ${bad.map((c) => `${c.S}: ${c.withPrimary}/${c.teamGames}`).join(', ')} — nothing written`,
      coverage,
    );
  }

  // 2. rows
  const hazard = [], stick = [], g1 = [];
  const excluded = newExcluded();
  const agreement = { legacy: { n: 0, cur: 0, prev: 0 }, espn: { n: 0, cur: 0, prev: 0 } };
  const hazTable = [], stickTable = [];
  const primCount = new Map(), seasonGames = new Map();
  const teamGameCount = new Map();
  for (let S = from; S <= to; S++) {
    const c = ctx.get(S);
    const r = buildRows({
      S, gamelogs: c.gl, schedule: c.sc, depth: c.depth, seasonTotals: c.st, seasonTotalsPrev: c.stPrev,
      bySleeper, primaries: c.primaries, defaults,
    });
    hazard.push(...r.hazard); stick.push(...r.stick); g1.push(...r.g1);
    for (const k of Object.keys(excluded)) excluded[k] += r.excluded[k];
    for (const era of ['legacy', 'espn']) for (const k of ['n', 'cur', 'prev']) agreement[era][k] += r.agreement[era][k];
    hazTable.push(...patternTable(r.hazard, HAZARD_KEYS));
    stickTable.push(...patternTable(r.stick, STICK_KEYS));
    const counts = new Map();
    for (const p of c.primaries.values()) counts.set(p.pid, (counts.get(p.pid) ?? 0) + 1);
    primCount.set(S, counts);
    seasonGames.set(S, Math.max(...[...r.teams.values()].map((v) => v.length)));
    teamGameCount.set(S, r.teams.size);
    log(`${S}: hazard ${r.hazard.length} / stick ${r.stick.length} / g1 ${r.g1.length}`);
  }
  const sumY = (rows) => rows.reduce((a, r) => a + r.y, 0);
  const counts = {
    hazardRows: hazard.length, hazardEvents: sumY(hazard), stickRows: stick.length, stickEvents: sumY(stick),
    g1Rows: g1.length, g1Events: sumY(g1),
  };

  // 3. ladders
  const hzL = forwardLadder(hazard, HAZARD_LADDER, { opts: fitOpts, bootstrap: defaults.bootstrap });
  const skL = forwardLadder(stick, STICK_LADDER, { opts: fitOpts, bootstrap: defaults.bootstrap });
  log(`hazard ladder adopted [${hzL.final}]; stickiness adopted [${skL.final}]`);

  // 4. final refits, fixture, exact verification
  const hazFinal = fitFromPatterns(hazTable, HAZARD_KEYS, hzL.final, { offset: 1, ...fitOpts });
  const stickFinal = fitFromPatterns(stickTable, STICK_KEYS, skL.final, { offset: 1, ...fitOpts });
  const fixture = {
    hazardKeys: HAZARD_KEYS, hazardPatterns: poolTable(hazTable, HAZARD_KEYS.length),
    stickKeys: STICK_KEYS, stickPatterns: poolTable(stickTable, STICK_KEYS.length),
  };
  const hazRefit = fitFromPatterns(fixture.hazardPatterns, HAZARD_KEYS, hzL.final, { offset: 0, ...fitOpts });
  const stickRefit = fitFromPatterns(fixture.stickPatterns, STICK_KEYS, skL.final, { offset: 0, ...fitOpts });
  const dHaz = maxAbsDiff(hazFinal.coef, hazRefit.coef), dStick = maxAbsDiff(stickFinal.coef, stickRefit.coef);
  if (!(dHaz < 1e-9 && dStick < 1e-9)) throw new Error(`[qb-takeover] fixture refit disagrees with the pinned fit (hazard ${dHaz}, stickiness ${dStick})`);

  // 5. Q1 sensitivity: legacy checkpoints from chart(w−1)
  const altHazard = [];
  for (let S = from; S <= to; S++) {
    const c = ctx.get(S);
    altHazard.push(...buildRows({
      S, gamelogs: c.gl, schedule: c.sc, depth: c.depth, seasonTotals: c.st, seasonTotalsPrev: c.stPrev,
      bySleeper, primaries: c.primaries, espnFrom: from, defaults,
    }).hazard);
  }
  const altLoso = losoLogistic(altHazard, hzL.final, fitOpts);
  const legacyLL = (rows, ll) => mean(rows.map((r, i) => (r.S < DEPTH_ESPN_FROM_SEASON ? ll[i] : null)).filter((v) => v != null));
  const rateOf = (a) => ({ ...a, curRate: rate(a.cur, a.n), prevRate: rate(a.prev, a.n) });
  const q1 = {
    agreement: { legacy: rateOf(agreement.legacy), espn: rateOf(agreement.espn) },
    sensitivity: {
      note: 'Report-only. Hazard ladder-final features refitted with legacy-era checkpoints read from chart(w−1) (espnFrom = 2013) instead of chart(w).',
      features: hzL.final,
      primary: { rows: hazard.length, logLoss: hzL.finalLoso.logLoss, legacyOnlyLogLoss: legacyLL(hazard, hzL.finalLoso.ll) },
      legacyFromPrevChart: { rows: altHazard.length, logLoss: altLoso.logLoss, legacyOnlyLogLoss: legacyLL(altHazard, altLoso.ll) },
    },
  };

  // 6. Q4, Q5, Q6
  const q4 = runQ4({ hazard, hazTable, stickTable, hazF: hzL.final, stickF: skL.final, fitOpts, defaults });
  const q5 = runQ5({
    hazard, g1, hazModel: hazFinal, stickModel: stickFinal, bySleeper, primCount, seasonGames, totalsByYear, defaults,
  });
  const q6 = q6Tables(hazard, g1);

  // 7. representative pUp cases (verdict) — base: day-3 vet, first start, mid incumbent, b0, wk mid, order 2, wp mid, og no
  const base = { dg: 1, rk: 0, ps: 0, iq: 0, bn: 0, wk: 1, dp: 0, wp: 0, og: 0 };
  const cases = [
    ['top-12 rookie', { dg: 4, rk: 1 }], ['day-3 vet (base)', {}],
    ['weak incumbent', { iq: 1 }], ['strong incumbent', { iq: 2 }],
    ['benched b0 (base)', {}], ['benched b2 (8+ games)', { bn: 2 }],
    ['order 1 non-incumbent (d1)', { dp: 1 }], ['order 3+ (d3)', { dp: 2 }],
    ['returning game-1 starter (og)', { og: 1 }], ['previously started (ps = re)', { ps: 1 }],
  ].map(([label, o]) => ({ label, pUp: predict(hazFinal, { ...base, ...o }) }));

  const generatedAt = new Date().toISOString();
  const g1Rate = { rows: counts.g1Rows, events: counts.g1Events, rate: rate(counts.g1Events, counts.g1Rows) };
  const constants = {
    source: `sleeper-dashboard-data backtests/${generatedAt.slice(0, 10)}-qb-takeover-constants.json (node bin/backtest.mjs --qb-takeover --write)`,
    generatedAt, basis: 'half_ppr',
    definitions: {
      primaryPasser: 'max(attempts+sacksSuffered) per team-game, REG; ties: attempts, then pid',
      population: 'Hazard: every non-null id x in the checkpoint chart at any order with x ≠ inc (inc = primary of game g−1; at g = 1 chart index 0, g = 1 rows are reported, never fitted). Outcome y = x is primary in game g. Stickiness (g ≥ 2): inc is a backup-origin starter (inc ≠ the team game-1 primary); y = inc is primary in game g. Rows with no crosswalk, no primary in g or g−1, or no checkpoint chart are excluded and counted.',
      checkpoint: { legacy: 'chart(week of game g)', espn: 'chart(week of game g − 1) if present, else chart(week of previous team game); none at game 1', espnFrom: DEPTH_ESPN_FROM_SEASON },
      bnEraOffset: 'ESPN-era bn counts start at game 2 (no game-1 checkpoint chart)',
      teamDomain: 'gamelogs eraTeam()-mapped to schedule/depth era codes',
      incPPG: { k: defaults.incK, priorMinGames: defaults.priorMinGames, obsMinGamesNoPrior: defaults.obsMinGamesNoPrior, medianSlice: "all teams' incumbents as of calendar week w" },
      ageRefDate: 'S-09-01',
      bins: binsDefinition(defaults),
      lambda: defaults.lambda,
    },
    hazard: {
      features: hzL.final, coef: Object.fromEntries(Object.entries(hazFinal.coef).map(([k, v]) => [k, roundCoef(v)])),
      rows: counts.hazardRows, events: counts.hazardEvents, ladder: hzL.steps,
    },
    stickiness: {
      features: skL.final, coef: Object.fromEntries(Object.entries(stickFinal.coef).map(([k, v]) => [k, roundCoef(v)])),
      rows: counts.stickRows, events: counts.stickEvents, ladder: skL.steps,
    },
    chain: { ...CHAIN_TEXT },
    q4: { pooled: { maeChain: q4.pooled.maeChain, vsPooled: q4.pooled.vsPooled, vsDepthRate: q4.pooled.vsDepthRate, maeAppFlat: q4.pooled.maeAppFlat } },
    fixture,
    verification: { refitFromFixture: 'exact (|Δβ| < 1e-9)', maxAbsDiff: { hazard: dHaz, stickiness: dStick } },
  };

  return {
    meta: {
      generatedAt, basis: 'half_ppr', seasons: { from, to }, model: 'two-state Markov chain, ridge-logistic hazard + stickiness',
      lambda: defaults.lambda, bootstrap: defaults.bootstrap, loss: 'LOSO log-loss, team-season cluster bootstrap',
    },
    coverage, excluded, counts, g1Rate, q1, q6,
    ladders: { hazard: hzL.steps, stickiness: skL.steps },
    final: { hazard: { features: hzL.final }, stickiness: { features: skL.final } },
    hazardLadderEmpty: hzL.final.length === 0,
    folds: { hazard: hzL.finalLoso.folds, stickiness: skL.finalLoso.folds },
    heldOut: {
      hazard: { logLoss: hzL.finalLoso.logLoss, brier: hzL.finalLoso.brier, calibration: calibration(hazard, hzL.finalLoso.preds) },
      stickiness: { logLoss: skL.finalLoso.logLoss, brier: skL.finalLoso.brier, calibration: calibration(stick, skL.finalLoso.preds) },
    },
    q4, q5, pUpCases: cases,
    patterns: { hazardKeys: HAZARD_KEYS, hazard: hazTable, stickKeys: STICK_KEYS, stickiness: stickTable },
    constants,
  };
}

// ─── verdict ──────────────────────────────────────────────────────────────────

const f3 = (v) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(3));
const f4 = (v) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(4));
const pct = (v) => (v == null || !Number.isFinite(v) ? '—' : `${(100 * v).toFixed(1)}%`);
const ci = (c) => (c ? `[${f4(c[0])}, ${f4(c[1])}]` : '—');

function md(headers, rows) {
  return [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}

function ladderTable(steps) {
  return md(
    ['candidate', 'features tried', 'LL before', 'LL after', 'Δ mean', '95% CI', 'label', 'adopted'],
    steps.map((s) => [s.c, s.usedKeys.join('+'), f4(s.loglossBefore), f4(s.loglossAfter), f4(s.mean), ci(s.ci95), s.label ?? '—', s.adopted ? 'yes' : 'no']),
  );
}

function q4Row(label, s) {
  if (!s.n) return [label, '0', '—', '—', '—', '—', '—', '—', '—'];
  const lab = (x) => `${f4(x.mean)} ${ci(x.ci95)} ${x.label ?? ''}`.trim();
  return [label, String(s.n), f3(s.maeChain), f3(s.maePooledChain), f3(s.maeDepthRate), f3(s.maeAppFlat), lab(s.vsPooled), lab(s.vsDepthRate), ''];
}

export function buildQbTakeoverVerdictMarkdown(result) {
  const { counts, coverage, q1, q4, q5, q6, constants: C } = result;
  const L = [];
  const out = (...s) => L.push(...s);
  const date = result.meta.generatedAt.slice(0, 10);
  out(`# P6a — QB backup→starter takeover (${date})`, '',
    `Seasons ${result.meta.seasons.from}–${result.meta.seasons.to}, half-PPR, offline analysis; every comparison is leave-one-season-out with the team-season cluster bootstrap (${result.meta.bootstrap.resamples} resamples, seed ${result.meta.bootstrap.seed}). Constants file: \`backtests/${date}-qb-takeover-constants.json\`.`, '');

  out('## Summary', '',
    `- Hazard rows ${counts.hazardRows} (${counts.hazardEvents} events); stickiness rows ${counts.stickRows} (${counts.stickEvents} stays); game-1 rows ${counts.g1Rows} (${counts.g1Events} events, never fitted).`,
    `- Hazard ladder adopted: **${C.hazard.features.length ? C.hazard.features.join(', ') : 'nothing (pooled rate)'}**. Stickiness adopted: **${C.stickiness.features.length ? C.stickiness.features.join(', ') : 'nothing (pooled rate)'}**.`,
    `- Q4 pooled held-out ΔMAE of the chain vs the pooled chain: ${f4(q4.pooled.vsPooled.mean)} ${ci(q4.pooled.vsPooled.ci95)} **${q4.pooled.vsPooled.label ?? '—'}**; vs the per-depth-order rate: ${f4(q4.pooled.vsDepthRate.mean)} ${ci(q4.pooled.vsDepthRate.ci95)} **${q4.pooled.vsDepthRate.label ?? '—'}**.`, '');

  out('## Coverage', '', md(['season', 'REG team-games', 'with a primary passer', 'rate'], coverage.map((c) => [String(c.S), String(c.teamGames), String(c.withPrimary), f4(c.rate)])), '',
    `Excluded: ${Object.entries(result.excluded).map(([k, v]) => `${k} ${v}`).join(', ')}.`, '');

  out('## Q1 — Timing', '',
    md(['era', 'checks (g ≥ 2)', 'QB1(chart w) = primary of game w', '= primary of game w−1'],
      ['legacy', 'espn'].map((e) => [e, String(q1.agreement[e].n), pct(q1.agreement[e].curRate), pct(q1.agreement[e].prevRate)])), '',
    `Sensitivity (report-only; the primary analysis keeps the §3.2 rule): ladder-final features \`${q1.sensitivity.features.join('+') || '(intercept)'}\` refitted with legacy checkpoints from chart(w−1).`, '',
    md(['version', 'hazard rows', 'pooled LOSO log-loss', 'legacy-era-only log-loss'], [
      ['primary (legacy chart(w))', String(q1.sensitivity.primary.rows), f4(q1.sensitivity.primary.logLoss), f4(q1.sensitivity.primary.legacyOnlyLogLoss)],
      ['legacy from chart(w−1)', String(q1.sensitivity.legacyFromPrevChart.rows), f4(q1.sensitivity.legacyFromPrevChart.logLoss), f4(q1.sensitivity.legacyFromPrevChart.legacyOnlyLogLoss)],
    ]), '');

  out('## Q2 — Hazard ladder (`pUp`)', '', ladderTable(result.ladders.hazard), '',
    `Final model (all seasons): \`${C.hazard.features.join(' + ') || '(intercept only)'}\`. Held-out pooled log-loss ${f4(result.heldOut.hazard.logLoss)}, Brier ${f4(result.heldOut.hazard.brier)}.`, '',
    md(['coefficient', 'β'], Object.entries(C.hazard.coef).map(([k, v]) => [k, String(v)])), '',
    'Held-out calibration by decile of p:', '',
    md(['decile', 'rows', 'mean p', 'mean y'], result.heldOut.hazard.calibration.map((b) => [String(b.bin), String(b.rows), f4(b.meanP), f4(b.meanY)])), '',
    '### `pUp` for representative cases (final model, wk = mid, other features at base: day-3 vet, first start, mid incumbent, b0, order 2, wp mid, og no)', '',
    md(['case', 'pUp'], result.pUpCases.map((c) => [c.label, f4(c.pUp)])), '',
    'A case that shows the same `pUp` as the base is a feature the ladder did not adopt (no held-out signal).', '');

  out('## Q3 — Stickiness ladder (`pStay`)', '', ladderTable(result.ladders.stickiness), '',
    `Final model: \`${C.stickiness.features.join(' + ') || '(intercept only)'}\`. Held-out pooled log-loss ${f4(result.heldOut.stickiness.logLoss)}, Brier ${f4(result.heldOut.stickiness.brier)}.`, '',
    md(['coefficient', 'β'], Object.entries(C.stickiness.coef).map(([k, v]) => [k, String(v)])), '');

  out('## Q4 — Rest-of-season start fraction', '',
    `${q4.population}. MAE of the expected start fraction against the actual fraction of remaining games started (held-out). ΔMAE = chain − baseline, so negative means the chain is closer.`, '',
    md(['subset', 'n', 'MAE chain', 'MAE pooled chain (a)', 'MAE depth rate (b)', 'MAE app flat (c)', 'Δ vs (a)', 'Δ vs (b)', ''],
      [q4Row('pooled', q4.pooled), q4Row('excluding og = yes', q4.excludingOgYes), ...Object.entries(q4.byDg).map(([k, v]) => q4Row(`dg = ${k}`, v))]), '',
    `Baseline (c) is reported as MAE only, with no label: ${q4.appFlatNote}. Against a population whose per-game takeover hazard is about 5%, that comparison is decided in advance, and reading a PPG multiplier as a start share is a framing, not an equivalence.`, '',
    '**Selection optimism.** The ladder chose its features using every season\'s LOSO result, and Q4 is evaluated on those same seasons, so the chain\'s Q4 margin is optimistic by an unmeasured amount.', '');

  out('## Q5 — Dynasty "sat longer" (report-only, no constant)', '', q5.note, '',
    `Population: ${q5.population} drafted QBs (draftOvr ≤ 100, classes 2013–2023).`, '',
    md(['group', 'n', 'mean residual', 'next-season primary share (n)', 'next PPG (n)', 'S+2 share (n)', 'S+2 PPG (n)'],
      Object.entries(q5.groups).map(([k, v]) => [k, String(v.n), f3(v.meanResidual), `${f3(v.nextShare.mean)} (${v.nextShare.n})`, `${f3(v.nextPPG.mean)} (${v.nextPPG.n})`, `${f3(v.plus2Share.mean)} (${v.plus2Share.n})`, `${f3(v.plus2PPG.mean)} (${v.plus2PPG.n})`])), '',
    'Anton decides on the "mild discount" for sitting longer than draft capital predicts; nothing here pins it.', '');

  out('## Q6 — Raw rates (unmodelled)', '',
    '### Draft group × rookie × prior start', '',
    md(['dg', 'rk', 'ps', 'trials', 'events', 'rate'], q6.byDraftRookiePrior.map((r) => [r.dg, r.rk, r.ps, String(r.trials), String(r.events), pct(r.rate)])), '',
    '### Depth order by era', '',
    md(['dp', 'era', 'trials', 'events', 'rate'], q6.byDepthEra.map((r) => [r.dp, r.era, String(r.trials), String(r.events), pct(r.rate)])), '',
    '### Order-1 non-incumbents (d1) by `og` and era', '',
    md(['og', 'era', 'trials', 'events', 'rate'], q6.d1ByOgEra.map((r) => [r.og, r.era, String(r.trials), String(r.events), pct(r.rate)])), '',
    '### Game-1 rows (never fitted) by depth order', '',
    md(['dp', 'trials', 'events', 'rate'], q6.g1ByDepth.map((r) => [r.dp, String(r.trials), String(r.events), pct(r.rate)])), '',
    `Game-1 overall: ${result.g1Rate.events}/${result.g1Rate.rows} = ${pct(result.g1Rate.rate)} (legacy seasons only — the ESPN-era game-1 chart does not exist).`, '');

  out('## For P6b', '',
    'Inputs P6b must compute live, from the §3.4 definitions: `dg` (draft capital), `rk`, `ps` (primary passer of an earlier calendar week of this season), `iq` (incumbent incPPG ÷ all-teams median as of the calendar week — half-PPR vs league basis cancels to first order), `bn` (non-incumbent chart games not primary), `wk`, `dp` (depth order), `wp`, `og`; stickiness `st`, `dg3`, `rk`, `dq`. Only the ladder-final features are used by the pinned models; the rest need not be computed.', '',
    '**Transport caveats.**', '',
    `- The model leans on the depth chart: ${C.hazard.features.includes('dp') ? '`dp` is in the final hazard model' : '`dp` is NOT in the final hazard model'}. The app\'s only live source is Sleeper \`depth_chart_order\`, which differs from nflverse depth. The one measurement (data-catalog D5) is 68.8% QB depth-1 agreement (n = 32) between the app snapshot of 2026-09-05 and nflverse 2025 week 18 — a cross-season comparison that offseason moves inflate, so it is an upper bound on disagreement, not a same-week agreement rate.`,
    '- g = 1 (pre-kickoff) has no fitted model here: the hazard is extrapolated at `bn=b0`, `wk=early`, `ps=first`, `wp=mid`, `og=no`, with `iq` from the g = 1 rule; the raw g = 1 rate above shows the gap.',
    '- ROS uses the starter PPG from the existing projection; the chain supplies only P(start).', '',
    '**What this does NOT model:** injury status, coach changes, trades after the checkpoint.', '',
    `Chain: ${C.chain.states}`, '', C.chain.transitions, '',
    `Fixture refit check: ${C.verification.refitFromFixture} (hazard ${C.verification.maxAbsDiff.hazard.toExponential(2)}, stickiness ${C.verification.maxAbsDiff.stickiness.toExponential(2)}).`, '',
    '**Reproduce:** node bin/backtest.mjs --qb-takeover --write');
  return L.join('\n');
}

// ─── artifact writing (2a order: serialise → cap check → write) ───────────────

export const ARTIFACT_CAPS = { panelBytes: 5 * 1024 * 1024, constantsBytes: 300 * 1024 };

/** One line per top-level key; each fixture pattern on its own line, so diffs stay readable. */
export function formatQbTakeoverConstantsJson(file) {
  const { fixture, ...rest } = file;
  const out = ['{'];
  Object.entries(rest).forEach(([k, v]) => out.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v)},`));
  out.push('  "fixture": {');
  out.push(`    "hazardKeys": ${JSON.stringify(fixture.hazardKeys)},`);
  out.push('    "hazardPatterns": [', ...fixture.hazardPatterns.map((p, i, a) => `      ${JSON.stringify(p)}${i < a.length - 1 ? ',' : ''}`), '    ],');
  out.push(`    "stickKeys": ${JSON.stringify(fixture.stickKeys)},`);
  out.push('    "stickPatterns": [', ...fixture.stickPatterns.map((p, i, a) => `      ${JSON.stringify(p)}${i < a.length - 1 ? ',' : ''}`), '    ]');
  out.push('  }', '}');
  return out.join('\n') + '\n';
}

export function writeQbTakeoverArtifacts({ result, verdictMd, root = null, caps = ARTIFACT_CAPS }) {
  const date = result.meta.generatedAt.slice(0, 10);
  const panelPath = `backtests/${date}-qb-takeover-panel.json`;
  const constantsPath = `backtests/${date}-qb-takeover-constants.json`;
  const verdictPath = `grading/${date}-qb-takeover-verdict.md`;
  const { constants, ...panel } = result;
  const panelJson = JSON.stringify(panel, null, 2) + '\n';
  const constantsJson = formatQbTakeoverConstantsJson(constants);
  if (Buffer.byteLength(panelJson) > caps.panelBytes) throw new Error(`[qb-takeover] panel artifact ${Buffer.byteLength(panelJson)} B exceeds the ${caps.panelBytes} B cap`);
  if (Buffer.byteLength(constantsJson) > caps.constantsBytes) throw new Error(`[qb-takeover] constants artifact ${Buffer.byteLength(constantsJson)} B exceeds the ${caps.constantsBytes} B cap`);
  const abs = (rel) => (root ? path.join(root, rel) : repoPath(rel));
  fs.mkdirSync(abs('backtests'), { recursive: true });
  fs.mkdirSync(abs('grading'), { recursive: true });
  fs.writeFileSync(abs(panelPath), panelJson, 'utf8');
  fs.writeFileSync(abs(constantsPath), constantsJson, 'utf8');
  fs.writeFileSync(abs(verdictPath), verdictMd.endsWith('\n') ? verdictMd : verdictMd + '\n', 'utf8');
  return { panelPath, constantsPath, verdictPath, panelBytes: Buffer.byteLength(panelJson), constantsBytes: Buffer.byteLength(constantsJson) };
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

/** The `--qb-takeover` branch body of `bin/backtest.mjs`. Returns the exit code: 1 on `CoverageStop`, else 0. */
export function qbTakeoverMain({
  load = QB_TAKEOVER_LOAD, write = false, asJson = false, writeArtifacts = writeQbTakeoverArtifacts,
  log = console.log, logErr = console.error,
} = {}) {
  try {
    const result = runQbTakeover({ load, log: (m) => logErr(`[backtest] ${m}`) });
    const verdictMd = buildQbTakeoverVerdictMarkdown(result);
    if (write) {
      const w = writeArtifacts({ result, verdictMd });
      logErr(`[backtest] Wrote ${w.panelPath} (${w.panelBytes} B), ${w.constantsPath} (${w.constantsBytes} B), ${w.verdictPath}`);
    }
    log(asJson ? JSON.stringify(result, null, 2) : verdictMd);
    return 0;
  } catch (err) {
    if (err instanceof CoverageStop) {
      logErr(`[backtest] ${err.message}`);
      return 1;
    }
    throw err;
  }
}
