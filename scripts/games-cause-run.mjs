/**
 * scripts/games-cause-run.mjs — projected-games calibration, short seasons split by cause (L6b;
 * `bin/backtest.mjs --games-calibration --cause`). Task file: .claude/tasks/games-calibration-cause-split.md.
 * Extends L6 (.claude/tasks/projected-games-calibration.md). Offline analysis only: no served file, no manifest
 * entry. The pure core is lib/gamesCalibration.mjs (L6b section); the predictor is lib/durabilityMirror.mjs (CR-28).
 *
 * L6's load/panel/enrich block and its table helpers are COPIED here (generalised to CAUSE_ALL_IDS) rather than
 * factored out of scripts/games-calibration-run.mjs, which changes only by `export decompCell`.
 *
 * Public exports:
 *   runGamesCause({ load, defaults, causeDefaults, log })        → result
 *   buildGamesCauseVerdictMarkdown(result)                       → string
 *   writeGamesCauseArtifacts({ result, verdictMd, root })        → { panelPath, constantsPath, verdictPath, panelBytes }
 *   gamesCauseMain({ load, defaults, causeDefaults, write, asJson, writeArtifacts, log, logErr }) → exit code
 */

import fs from 'fs';
import path from 'path';
import { repoPath } from '../lib/io.mjs';
import { forwardChainFolds } from '../lib/panel.mjs';
import { ageOnDate } from '../lib/inSeasonEvidence.mjs';
import { projectedGamesFor } from '../lib/durabilityMirror.mjs';
import { guardLoad } from './inseason-run.mjs';
import { ParityStop, SnapshotStop, buildPanel, parityReport } from './absence-run.mjs';
import { GAMES_CAL_LOAD, panelEligibility, decompCell } from './games-calibration-run.mjs';
import {
  GAMES_CAL_DEFAULTS, CAUSE_CANDIDATES, CAUSE_CANDIDATE_IDS, CAUSE_ALL_IDS, CAUSE_DEFAULTS, ageBucketOf, buildRankIndex,
  enrichRow, fitCandidate, kFor, candidatePred, foldTrainRows, deltaStats, pooledStats, causeStates, rel3Of,
  avgGamesSeasonLength, decideCause, causeEligibility,
} from '../lib/gamesCalibration.mjs';

export { ParityStop, SnapshotStop };

const POSITIONS = ['QB', 'RB', 'WR', 'TE'];
const PARITY_FIXTURE = 'test/fixtures/durability-parity-2026-10-04.json';
const CAUSE_LABELS = ['inj', 'bench', 'cut'];
const K1_SET = new Set(['qual', 'short-inj', 'short-oth', 'none']);
const K23_SET = new Set(['qual', 'unk', ...['short', 'none'].flatMap((s) => CAUSE_LABELS.map((c) => `${s}-${c}`))]);
const COUNT_KEYS = ['played', 'reserve', 'inactive', 'activeNoPlay', 'practiceSquad', 'otherStatus', 'offRoster'];

const round3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

function need(v, what) {
  if (v == null) throw new Error(`[games-cause] ${what} not found in the store`);
  return v;
}

const CAUSE_DEFINITIONS = Object.freeze({
  K1: 'app-native: short = classifyInjurySeason(seasonView(store, S)) → short-inj, else short-oth; wireable with no new data',
  K2: "roster-only (Anton's definition): S-season slots by rosterweekly status — injured = RES/PUP, bench = ACT-not-playing + INA, cut = DEV + off roster + other",
  K3: 'roster + contributor: K2, but a contributor\'s INA / ACT-not-playing slots count as injury (for injured players who never reached reserve)',
});

// ─── cell metrics (copied from L6, generalised to CAUSE_ALL_IDS) ─────────────

function cellMetrics(rows, bootstrap) {
  const out = {};
  for (const id of CAUSE_ALL_IDS) {
    const p = (r) => r.p[id];
    const base = pooledStats(rows, p);
    if (id !== 'C0') {
      base.dMse = deltaStats(rows, p, (r) => r.p.C0, 'mse', bootstrap);
      base.dMae = deltaStats(rows, p, (r) => r.p.C0, 'mae', bootstrap);
    }
    out[id] = base;
  }
  return out;
}

const rawMean = (rows, id) => mean(rows.map((r) => r.p[id] - r.outcome));
const rawMae = (rows, id) => mean(rows.map((r) => Math.abs(r.p[id] - r.outcome)));

// ─── descriptives (step 4, 5) ────────────────────────────────────────────────

function crosstab(rows, ka, kb) {
  const cells = new Map();
  for (const r of rows) {
    const key = `${r[ka]} × ${r[kb]}`;
    let c = cells.get(key);
    if (!c) { c = { a: r[ka], b: r[kb], rows: [] }; cells.set(key, c); }
    c.rows.push(r);
  }
  return [...cells.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1)).map(([key, c]) => ({
    cell: key, n: c.rows.length, c0Bias: round3(mean(c.rows.map((r) => r.pred - r.outcome))),
    relevant: c.rows.filter((r) => r.relevant).length, rel3: c.rows.filter((r) => r.rel3).length,
  }));
}

function causeDescriptives(rows) {
  const accounted = rows.filter((r) => r.dec);
  const decomp = {};
  for (const k of ['k1', 'k2', 'k3']) {
    const states = [...new Set(rows.map((r) => r[k]))].sort();
    const byState = (rs) => states.map((s) => ({ name: s, ...decompCell(rs.filter((r) => r[k] === s)) }));
    decomp[k] = { all: byState(accounted), star: byState(accounted.filter((r) => r.star)) };
  }
  const sCountsByEra = {};
  for (const state of [...new Set(rows.map((r) => r.k3))].sort()) {
    if (state === 'qual' || state === 'unk') continue;
    sCountsByEra[state] = {};
    for (const [era, pick] of [['2016–2018', (r) => r.S <= 2018], ['2019+', (r) => r.S >= 2019]]) {
      const rs = rows.filter((r) => r.k3 === state && r.sCounts && pick(r));
      sCountsByEra[state][era] = rs.length
        ? { n: rs.length, ...Object.fromEntries(COUNT_KEYS.map((c) => [c, round3(mean(rs.map((r) => r.sCounts[c])))])) }
        : { n: 0 };
    }
  }
  return {
    crosstabs: { k1k2: crosstab(rows, 'k1', 'k2'), k2k3: crosstab(rows, 'k2', 'k3') },
    decomp, sCountsByEra,
    unkRows: rows.filter((r) => r.k2 === 'unk').length,
    kStateAssertion: `held for all ${rows.length} rows`,
  };
}

function seasonLengthDescriptives(rows) {
  const touchedByOutcomeSeason = {};
  for (const r of rows) if (r.avgGamesL !== r.avgGames) touchedByOutcomeSeason[r.S + 1] = (touchedByOutcomeSeason[r.S + 1] ?? 0) + 1;
  const eras = [['2016–2020', (r) => r.S + 1 <= 2020], ['2021–2025', (r) => r.S + 1 >= 2021]];
  const scheduleTerm = {};
  for (const [era, pick] of eras) {
    const rs = rows.filter((r) => r.dec && pick(r));
    scheduleTerm[era] = {
      n: rs.length,
      l6: round3(mean(rs.map((r) => r.dec.schedule))),
      lSchedule: round3(mean(rs.map((r) => Math.round(clamp(r.avgGamesL, 8, 17)) - r.weeks.G))),
    };
  }
  return {
    touched: rows.filter((r) => r.avgGamesL !== r.avgGames).length, rows: rows.length,
    touchedByOutcomeSeason, scheduleTerm, vets2026: null,
  };
}

// ─── held-out fit (step 6, 7) ────────────────────────────────────────────────

function runFit(rows, defaults, log) {
  const years = [];
  for (let y = defaults.predictorSeasons.from; y <= defaults.predictorSeasons.to; y++) years.push(y);
  const folds = forwardChainFolds(years, defaults.minTrainSeasons);
  const oos = [];
  const foldInfo = [];
  const fitOpts = { minCellTrainPlayers: defaults.minCellTrainPlayers, kGrid: defaults.kGrid, candidates: CAUSE_CANDIDATES };
  for (const fold of folds) {
    const train = foldTrainRows(rows, fold);
    const evalRows = rows.filter((r) => r.S === fold.evalYear);
    const models = Object.fromEntries(CAUSE_CANDIDATE_IDS.map((id) => [id, fitCandidate(train, id, fitOpts)]));
    const fb = {};
    const foldOos = evalRows.map((r) => {
      const p = { C0: r.pred, L0: candidatePred(r.avgGamesL, 1, 8) };
      for (const id of CAUSE_CANDIDATE_IDS) {
        const spec = CAUSE_CANDIDATES[id];
        const kk = kFor(models[id], r);
        p[id] = candidatePred(r[spec.avgKey ?? 'avgGames'], kk.k, spec.floor);
        if (kk.fallback) {
          const m = (fb[id] ??= {});
          const key = `${kk.requested}->${kk.used}`;
          m[key] = (m[key] ?? 0) + 1;
        }
      }
      return { id: r.id, S: r.S, position: r.position, sState: r.sState, k1: r.k1, k2: r.k2, k3: r.k3,
        rel3: r.rel3, relevant: r.relevant, star: r.star, outcome: r.outcome, p };
    });
    oos.push(...foldOos);
    foldInfo.push({
      evalYear: fold.evalYear, trainYears: [fold.trainYears[0], fold.trainYears[fold.trainYears.length - 1]],
      trainRows: train.length, evalRows: evalRows.length,
      fallbackRows: Object.fromEntries(Object.entries(fb).map(([id, m]) => [id, Object.values(m).reduce((a, b) => a + b, 0)])),
      fallbackCells: fb,
      thinTrainCells: Object.fromEntries(CAUSE_CANDIDATE_IDS.map((id) => [id, models[id].thin])),
    });
    log(`fold eval ${fold.evalYear}: train ${train.length}, eval ${evalRows.length}`);
  }

  const bs = defaults.bootstrap;
  const relevantRows = oos.filter((r) => r.relevant);
  const starRows = oos.filter((r) => r.star);
  const rStarRows = oos.filter((r) => r.relevant || r.star);
  const tables = {
    relevant: cellMetrics(relevantRows, bs), star: cellMetrics(starRows, bs), rStar: cellMetrics(rStarRows, bs),
    pooled: cellMetrics(oos, bs), notRelevant: cellMetrics(oos.filter((r) => !r.relevant), bs),
    byPosition: {}, relevantByPosition: {}, byK3: {}, era2020: cellMetrics(oos.filter((r) => r.S >= 2020), bs),
  };
  for (const p of POSITIONS) {
    tables.byPosition[p] = cellMetrics(oos.filter((r) => r.position === p), bs);
    tables.relevantByPosition[p] = cellMetrics(relevantRows.filter((r) => r.position === p), bs);
  }
  for (const s of [...new Set(oos.map((r) => r.k3))].sort()) {
    if (s === 'unk') continue;
    tables.byK3[s] = cellMetrics(oos.filter((r) => r.k3 === s), bs);
  }

  // full-sample constants — k nested by level (keys collide across levels)
  const full = Object.fromEntries(CAUSE_CANDIDATE_IDS.map((id) => [id, fitCandidate(rows, id, fitOpts)]));
  const constants = {};
  for (const id of CAUSE_CANDIDATE_IDS) {
    const k = {};
    for (const [level, cells] of Object.entries(full[id].cells)) {
      k[level] = {};
      for (const [key, c] of Object.entries(cells)) k[level][key] = c.k;
    }
    constants[id] = { floor: CAUSE_CANDIDATES[id].floor, avgKey: full[id].avgKey, k, thinCells: full[id].thin };
  }
  return { folds: foldInfo, oos, tables, full, constants, relevantRows, starRows, rStarRows };
}

// ─── decisions (step 8) ──────────────────────────────────────────────────────

function summariesFor(fit) {
  const { tables, relevantRows, rStarRows } = fit;
  const s = {};
  for (const id of ['L0', ...CAUSE_CANDIDATE_IDS]) {
    s[id] = {
      relevant: { dMae: tables.relevant[id].dMae, bias: rawMean(relevantRows, id), c0Bias: rawMean(relevantRows, 'C0') },
      star: { dMae: tables.star[id].dMae },
      pooled: { dMse: tables.pooled[id].dMse },
      rStar: { mae: rawMae(rStarRows, id) },
      relevantByPosition: Object.fromEntries(POSITIONS.map((p) => [p, { dMae: tables.relevantByPosition[p][id].dMae }])),
    };
  }
  return s;
}

// ─── 2026 impact (step 10) ───────────────────────────────────────────────────

function impactAll({ fit, store, rosterByYear, snapshot, positionOf, bySleeper, names, defaults, causeDefaults, rankIndex, to }) {
  const ids = ['C0', 'L0', ...CAUSE_CANDIDATE_IDS];
  const ctx = { store, rosterByYear };
  const people = [];
  for (const [id, p] of Object.entries(snapshot.players ?? {})) {
    const position = positionOf[id];
    if (p?.projection?.confidence === 'rookie' || !POSITIONS.includes(position)) continue;
    const r = projectedGamesFor(store, id, position, { throughSeason: to });
    if (!r) continue;
    const s0 = store[to]?.[id];
    const age = ageOnDate(bySleeper?.[id]?.birthdate, defaults.ageRefDate(to + 1));
    const row = { id, S: to, position, ageBucket: ageBucketOf(age, position, defaults.ageBuckets), sState: !s0 ? 'none' : (s0.gamesPlayed ?? 0) >= 8 ? 'qual' : 'short' };
    row.rel3 = rel3Of(row, rankIndex, defaults);
    Object.assign(row, causeStates(row, ctx));
    row.avgGamesL = avgGamesSeasonLength(r, to + 1);
    row.avgGames = r.avgGames;
    const games = { C0: r.projectedGames, L0: candidatePred(row.avgGamesL, 1, 8) };
    for (const cid of CAUSE_CANDIDATE_IDS) {
      const spec = CAUSE_CANDIDATES[cid];
      games[cid] = candidatePred(row[spec.avgKey ?? 'avgGames'], kFor(fit.full[cid], row).k, spec.floor);
    }
    people.push({ ...row, name: names[id]?.full_name ?? names[id]?.last_name ?? id, games, ppg: p.projection.projectedPPG });
  }
  const byCandidate = {};
  for (const cid of ids.filter((x) => x !== 'C0')) {
    const meanChange = Object.fromEntries(POSITIONS.map((p) => [p, round3(mean(people.filter((x) => x.position === p).map((x) => x.games[cid] - x.games.C0)))]));
    const rankChanged = {};
    for (const p of POSITIONS) {
      const list = people.filter((x) => x.position === p && Number.isFinite(x.ppg));
      const rank = (key) => {
        const m = new Map();
        [...list].sort((a, b) => b.ppg * b.games[key] - a.ppg * a.games[key] || (a.id < b.id ? -1 : 1)).forEach((x, i) => m.set(x.id, i + 1));
        return m;
      };
      const rb = rank('C0'), ra = rank(cid);
      rankChanged[p] = { players: list.length, changed: list.filter((x) => rb.get(x.id) !== ra.get(x.id)).length };
    }
    byCandidate[cid] = {
      veterans: people.length, meanChange, rankChanged,
      rel3Cut: people.filter((x) => x.rel3 && x.games.C0 - x.games[cid] >= causeDefaults.starCutGames).length,
    };
  }
  const rowOf = (x) => ({ id: x.id, name: x.name, position: x.position, k1: x.k1, k2: x.k2, k3: x.k3, rel3: x.rel3, games: x.games });
  const pinned = causeDefaults.pinned.map((id) => {
    const x = people.find((q) => q.id === id);
    return x ? rowOf(x) : { id, name: names[id]?.full_name ?? id, notVeteran: true };
  });
  const maxAbs = (x) => Math.max(...ids.filter((c) => c !== 'C0').map((c) => Math.abs(x.games[c] - x.games.C0)));
  const autoAll = people.filter((x) => x.rel3 && !causeDefaults.pinned.includes(x.id) && maxAbs(x) >= causeDefaults.autoStarMinDelta)
    .sort((a, b) => maxAbs(b) - maxAbs(a) || a.name.localeCompare(b.name));
  return {
    veterans: people.length, touchedBySeasonLength: people.filter((x) => x.avgGamesL !== x.avgGames).length,
    byCandidate, namedStars: { pinned, auto: autoAll.slice(0, causeDefaults.autoStarCap).map(rowOf), autoOverflow: Math.max(0, autoAll.length - causeDefaults.autoStarCap) },
  };
}

// ─── runGamesCause ───────────────────────────────────────────────────────────

export function runGamesCause({ load = GAMES_CAL_LOAD, defaults = GAMES_CAL_DEFAULTS, causeDefaults = CAUSE_DEFAULTS, log = () => {} } = {}) {
  // step 1 — load, gate, panel (copied from runGamesCalibration)
  const g = guardLoad(load, { maxLoadSeason: defaults.seasons.to });
  const { from, to } = defaults.seasons;

  const fixture = need(g.loadParityFixture(), PARITY_FIXTURE);
  const parity = parityReport(fixture);
  log(`parity DM-1 ${parity.matched}/${parity.rows}`);
  if (parity.rate == null || parity.rate < defaults.parityMin) {
    throw new ParityStop(`[games-cause] DM-1 parity ${parity.rate == null ? 'n/a' : (parity.rate * 100).toFixed(1) + '%'} is below ${defaults.parityMin * 100}% — nothing written`, parity);
  }
  const snapshot = g.loadSnapshot(defaults.snapshotDate);
  if (snapshot == null) throw new SnapshotStop(`[games-cause] snapshots/${defaults.snapshotDate}.json not found — nothing written`);

  const playerIds = need(g.loadPlayerIds(), 'nflverse/playerids.json');
  const positionOf = {};
  for (const e of Object.values(playerIds?.ids ?? {})) if (e?.sleeperId && e?.position) positionOf[e.sleeperId] = e.position;
  const bySleeper = playerIds.bySleeper ?? {};
  const draftYearOf = {};
  for (const [id, e] of Object.entries(bySleeper)) if (e?.draftYear != null) draftYearOf[id] = e.draftYear;

  const store = {}, rosterByYear = {};
  for (let y = from; y <= to; y++) {
    store[y] = need(g.loadSeasonTotals(y), `nfl/season-totals/${y}.json`);
    rosterByYear[y] = need(g.loadRosterWeekly(y), `nflverse/rosterweekly/${y}.json`);
  }

  const { rows: panelRows, counts: panelCounts } = buildPanel({ before: store, after: store, rosterByYear, positionOf, draftYearOf, defaults });
  const panel = panelEligibility({ store, rosterByYear, positionOf, draftYearOf, defaults });
  const keyOf = (r) => `${r.id}|${r.S}`;
  const a = new Set(panelRows.map(keyOf)), b = new Set(panel.included.map(keyOf));
  if (a.size !== b.size || [...a].some((k) => !b.has(k))) {
    throw new Error(`[games-cause] panelEligibility P-stageB set (${b.size}) differs from buildPanel's rows (${a.size})`);
  }
  log(`panel rows ${panelRows.length}`);

  // step 2 — rank index over predictorSeasons.from − 2 … seasons.to, enrich, cause states
  const rankSeasons = [];
  for (let y = defaults.predictorSeasons.from - 2; y <= to; y++) rankSeasons.push(y);
  const rankIndex = buildRankIndex(store, positionOf, rankSeasons, POSITIONS);
  const ctx = { store, rosterByYear, bySleeper, defaults, rankIndex };
  const rows = panelRows.map((r) => enrichRow(r, ctx));
  for (const r of rows) {
    r.rel3 = rel3Of(r, rankIndex, defaults);
    if (r.relevant && !r.rel3) throw new Error(`[games-cause] relevant row ${r.id} S=${r.S} is not rel3 — rank index defect`);
    r.star = r.rel3 && r.sState !== 'qual';
    Object.assign(r, causeStates(r, ctx));
    r.avgGamesL = avgGamesSeasonLength(projectedGamesFor(store, r.id, r.position, { throughSeason: r.S }), r.S + 1);
    if (!K1_SET.has(r.k1)) throw new Error(`[games-cause] K1 state '${r.k1}' outside the closed set (${r.id} S=${r.S})`);
    for (const k of ['k2', 'k3']) {
      if (!K23_SET.has(r[k])) throw new Error(`[games-cause] ${k.toUpperCase()} state '${r[k]}' outside the closed set (${r.id} S=${r.S})`);
    }
  }

  // step 3 — reconciliation (S+1)
  const recons = rows.map((r) => r.weeks.recon);
  const reconMean = mean(recons) ?? 0;
  const reconInfo = {
    mean: round3(reconMean), nonZero: recons.filter((x) => x !== 0).length,
    largest: rows.filter((r) => r.weeks.recon !== 0)
      .sort((x, y) => Math.abs(y.weeks.recon) - Math.abs(x.weeks.recon) || (x.id < y.id ? -1 : 1)).slice(0, 5)
      .map((r) => ({ id: r.id, S: r.S, position: r.position, recon: r.weeks.recon, outcome: r.outcome })),
    accountingSkipped: rows.filter((r) => r.weeks.skipped).length,
  };

  // steps 4, 5 — descriptives
  const cause = causeDescriptives(rows);
  const seasonLength = seasonLengthDescriptives(rows);

  // steps 6, 7 — held-out fit and tables
  const fit = runFit(rows, defaults, log);

  // step 8 — decisions per δ
  const summaries = summariesFor(fit);
  const pairedCache = new Map();
  const paired = (hi, lo) => {
    const key = `${hi}|${lo}`;
    if (!pairedCache.has(key)) pairedCache.set(key, deltaStats(fit.rStarRows, (r) => r.p[hi], (r) => r.p[lo], 'mae', defaults.bootstrap).ci95);
    return pairedCache.get(key);
  };
  const decisions = {};
  for (const delta of causeDefaults.deltas) {
    const d = decideCause({ summaries, paired, delta, recon: { mean: reconMean }, tolerance: defaults.reconcileTolerance, biasGate: causeDefaults.biasGate });
    d.eligibility = Object.fromEntries(Object.keys(summaries).map((id) => [id, d.eligibility[id] ?? causeEligibility(summaries[id], delta, causeDefaults.biasGate)]));
    decisions[delta] = d;
  }

  // step 10 — 2026 impact
  const names = g.loadPlayersRaw?.() ?? {};
  const impact = impactAll({ fit, store, rosterByYear, snapshot, positionOf, bySleeper, names, defaults, causeDefaults, rankIndex, to });
  seasonLength.vets2026 = { veterans: impact.veterans, touched: impact.touchedBySeasonLength };

  const panelRev = g.gitRev?.() ?? null;
  const generatedAt = new Date().toISOString();
  return {
    meta: { generatedAt, panelRev, seasons: defaults.seasons, predictorSeasons: defaults.predictorSeasons, snapshot: defaults.snapshotDate,
      bootstrap: defaults.bootstrap, minTrainSeasons: defaults.minTrainSeasons, parityFixture: PARITY_FIXTURE, parityFixtureRev: fixture.sourceRev,
      basis: 'half_ppr (served fantasyPoints)', primaryDelta: causeDefaults.primaryDelta, deltas: causeDefaults.deltas,
      causeDefinitions: CAUSE_DEFINITIONS },
    parity: { dm1: { rows: parity.rows, matched: parity.matched, rate: round3(parity.rate), mismatches: parity.mismatches.length }, avgGamesAssertion: `all ${rows.length} panel rows` },
    panelCounts, recon: reconInfo, cause, seasonLength,
    qb: { folds: fit.folds, tables: fit.tables },
    constants: { generatedAt, panelRev, candidates: fit.constants, fallbacks: fit.folds.map((f) => ({ evalYear: f.evalYear, rows: f.fallbackRows, cells: f.fallbackCells })) },
    decisions, impact,
    rows: rows.map((r) => ({ id: r.id, S: r.S, position: r.position, pred: r.pred, avgGames: round3(r.avgGames), outcome: r.outcome,
      ageBucket: r.ageBucket, sState: r.sState, relevant: r.relevant, qbStarterS: r.qbStarterS, G: r.weeks.G, counts: r.weeks.counts, recon: r.weeks.recon,
      k1: r.k1, k2: r.k2, k3: r.k3, rel3: r.rel3, star: r.star, avgGamesL: round3(r.avgGamesL), sCounts: r.sCounts })),
  };
}

// ─── Verdict markdown ────────────────────────────────────────────────────────

const f2 = (x) => (x == null ? 'n/a' : Number(x).toFixed(2));
const fCi = (c) => (c ? `[${f2(c[0])}, ${f2(c[1])}]` : 'n/a');
const sgn = (x) => (x == null ? 'n/a' : `${x >= 0 ? '+' : ''}${Number(x).toFixed(2)}`);

function cellTable(t) {
  const lines = ['| cand | n | bias | MAE | RMSE | ρ | ρ within pos | ΔMSE [95% CI] | ΔMAE [95% CI] |', '|---|---|---|---|---|---|---|---|---|'];
  for (const id of CAUSE_ALL_IDS) {
    const c = t[id];
    if (!c.n) { lines.push(`| ${id} | 0 | n/a | n/a | n/a | n/a | n/a | n/a | n/a |`); continue; }
    lines.push(`| ${id} | ${c.n} | ${sgn(c.bias)} | ${f2(c.mae)} | ${f2(c.rmse)} | ${f2(c.rho)} | ${f2(c.rhoWithinPos)} | ` +
      `${c.dMse ? `${f2(c.dMse.mean)} ${fCi(c.dMse.ci95)}` : '—'} | ${c.dMae ? `${f2(c.dMae.mean)} ${fCi(c.dMae.ci95)}` : '—'} |`);
  }
  return lines.join('\n');
}

export function buildGamesCauseVerdictMarkdown(r) {
  const out = [];
  const w = (...l) => out.push(...l);
  const { meta, parity, panelCounts: pc, recon, cause, seasonLength: sl, qb, decisions, impact } = r;
  const T = qb.tables;
  const nOf = (t) => t.C0.n;
  const rowsOos = nOf(T.pooled);
  const deltas = meta.deltas;
  w(`# Projected-games calibration — short seasons split by cause (L6b) — ${meta.generatedAt.slice(0, 10)}`, '');

  w('## 1. What was compared', '',
    `Panel: Stage B's (\`buildPanel\`, unchanged), before = after = the committed post-correction store (data \`${(meta.panelRev ?? 'n/a').slice(0, 7)}\`): ` +
    `${r.rows.length} player-seasons, predictor seasons S = ${meta.predictorSeasons.from}–${meta.predictorSeasons.to}, outcome S+1 \`gamesPlayed\`. ` +
    `Prediction = the mirrored veteran projected-games rule (\`lib/durabilityMirror.mjs\`, app \`d627562\`). Basis: ${meta.basis}.`, '',
    `Folds: forward-chaining over predictor season, ≥ ${meta.minTrainSeasons} training seasons — eval S = ${qb.folds.map((f) => f.evalYear).join(', ')}. ` +
    '**D1 — fit objective:** each cell\'s k minimises training SSE (totals are expectations); only the decision changed (§7).', '',
    `**D2 — cohorts.** \`relevant\` = top-N by S total points (QB 32 / RB 60 / WR 84 / TE 32): ${r.rows.filter((x) => x.relevant).length} rows, ${T.relevant.C0.n} out-of-sample. ` +
    `\`star\` = rel3 ∧ S-state ≠ qual (rel3 = top-N in any of S, S−1, S−2): ${r.rows.filter((x) => x.star).length} rows, ${T.star.C0.n} out-of-sample. ` +
    `R\\* = relevant ∪ star (the tie-break population): ${T.rStar.C0.n} out-of-sample. All veterans: ${rowsOos} out-of-sample.`, '',
    `**D3 — non-inferiority margin δ** (games of relevant MAE): ${deltas.join(' / ')}; default ${meta.primaryDelta}. All three are computed.`, '',
    '**D4 — cause definitions:**', '',
    ...Object.entries(meta.causeDefinitions).map(([k, v]) => `- **${k}:** ${v}.`), '');

  w('## 2. Parity and reconciliation', '',
    `- DM-1 (asserted ≥ 99%): **${parity.dm1.matched}/${parity.dm1.rows} = ${(parity.dm1.rate * 100).toFixed(1)}%**.`,
    `- \`avgGames\` assertion (\`Math.round(clamp(avgGames, 8, 17)) === prediction\`): held for ${parity.avgGamesAssertion}.`,
    `- Reconciliation (\`recon = team-game 'P' slots − S+1 gamesPlayed\`): mean ${recon.mean}, ${recon.nonZero} rows ≠ 0` +
      `${recon.largest.length ? '; largest ' + recon.largest.map((x) => `${x.id} S${x.S} (${x.position}) ${x.recon}`).join(', ') : ''}.`,
    `- \`accountingSkipped\` (no team in any week): ${recon.accountingSkipped}.`,
    `- Panel counts: ${pc.included} included (${pc.includedZeroOutcome} at outcome 0), ${pc.excludedNoRowNoReserve} excluded, ${pc.notVeteran} not yet veterans, ${pc.noQualifying} with no qualifying season.`,
    `- K-state closed-set assertion: ${cause.kStateAssertion}.`, '');

  w('## 3. Cause split', '', '### 3.1 Crosstabs (all panel rows; C0 bias = mean pred − outcome)', '');
  for (const [title, key] of [['K1 × K2', 'k1k2'], ['K2 × K3', 'k2k3']]) {
    w(`**${title}**`, '', '| cell | n | C0 bias | n relevant | n rel3 |', '|---|---|---|---|---|');
    for (const c of cause.crosstabs[key]) w(`| ${c.cell} | ${c.n} | ${sgn(c.c0Bias)} | ${c.relevant} | ${c.rel3} |`);
    w('');
  }
  w('### 3.2 Decomposition by K-state (mean games per row; columns sum to the bias)', '');
  for (const k of ['k1', 'k2', 'k3']) {
    for (const [label, cells] of [['all rows', cause.decomp[k].all], ['star rows', cause.decomp[k].star]]) {
      w(`**${k.toUpperCase()} — ${label}**`, '', '| state | n | bias | schedule | composition | role (inactive, mixed) | injury list | recon |', '|---|---|---|---|---|---|---|---|');
      for (const c of cells) w(`| ${c.name} | ${c.n} | ${c.n ? sgn(c.bias) : 'n/a'} | ${f2(c.schedule)} | ${f2(c.composition)} | ${f2(c.role)} | ${f2(c.injuryList)} | ${f2(c.recon)} |`);
      w('');
    }
  }
  w('### 3.3 Mean S-season slot counts per K3 state, by era of S', '', `| K3 state | era | n | ${COUNT_KEYS.join(' | ')} |`, `|---|---|---|${COUNT_KEYS.map(() => '---').join('|')}|`);
  for (const [state, eras] of Object.entries(cause.sCountsByEra)) {
    for (const [era, c] of Object.entries(eras)) w(`| ${state} | ${era} | ${c.n} | ${c.n ? COUNT_KEYS.map((k) => f2(c[k])).join(' | ') : COUNT_KEYS.map(() => 'n/a').join(' | ')} |`);
  }
  w('', `\`unk\` rows (S = 2015, K2/K3 unclassifiable; K1 still computed): **${cause.unkRows}**.`, '',
    '**Era caveat.** The rosterweekly status vocabulary changes by era: INA is absent in 2016–2018, so gameday inactives land in `activeNoPlay`; DEV is nearly absent in 2016, so practice-squad players count as `offRoster`; before 2016 the status is a season-level value. RES includes non-injury reserve (NFI; COVID 2020–21).', '');

  w('## 4. Season-length factor', '',
    `The factor changes the prediction input for ${sl.touched} of ${sl.rows} panel rows (outcome seasons: ${Object.entries(sl.touchedByOutcomeSeason).map(([y, n]) => `${y} ${n}`).join(', ') || 'none'}).`, '',
    '| outcome era | n | L6 schedule term (pred − G) | L schedule term (round(clamp(avgGamesL)) − G) |', '|---|---|---|---|');
  for (const [era, c] of Object.entries(sl.scheduleTerm)) w(`| ${era} | ${c.n} | ${sgn(c.l6)} | ${sgn(c.lSchedule)} |`);
  const pctVets = sl.vets2026.veterans ? (100 * sl.vets2026.touched / sl.vets2026.veterans) : 0;
  w('', `For the 2026 veterans the factor changes the input for **${sl.vets2026.touched} of ${sl.vets2026.veterans}** (${pctVets.toFixed(1)}%)` +
    `${pctVets < 5 ? ' — under 5%: for current projections it is close to a no-op' : ''}.`, '');

  w('## 5. Held-out results', '', 'Candidates scale the pre-round input by a per-cell k: `pred = round(clamp(input × k, floor, 17))`. L0 = round(clamp(avgGamesL, 8, 17)) with no fit. ΔMSE / ΔMAE are candidate − C0 with player-clustered paired-bootstrap 95% CIs (n/a under 30 players).', '');
  const sub = (title, obj) => { w(`### ${title}`, ''); for (const [name, t] of Object.entries(obj)) w(`**${name}**`, '', cellTable(t), ''); };
  sub('5.1 Relevant', { relevant: T.relevant });
  sub('5.2 Star (rel3 ∧ S-state ≠ qual)', { star: T.star });
  sub('5.3 R* (relevant ∪ star)', { 'R*': T.rStar });
  sub('5.4 All veterans', { pooled: T.pooled });
  sub('5.5 Not relevant', { 'not relevant': T.notRelevant });
  sub('5.6 By position', T.byPosition);
  sub('5.7 Relevant, by position', T.relevantByPosition);
  sub('5.8 By K3 state', T.byK3);
  sub('5.9 Eval S 2020–2024', { 'eval S ≥ 2020': T.era2020 });
  w('### 5.10 Fallbacks', '', '| eval S | train rows | eval rows | rows on a parent k, by candidate |', '|---|---|---|---|');
  for (const f of qb.folds) w(`| ${f.evalYear} | ${f.trainRows} | ${f.evalRows} | ${Object.entries(f.fallbackRows).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'} |`);
  w('');

  w('## 6. Full-sample k tables', '', 'Fitted once more on every panel row (S 2015–2024), nested by level. Written to `backtests/<date>-games-cause-constants.json`.', '');
  for (const id of CAUSE_CANDIDATE_IDS) {
    const c = r.constants.candidates[id];
    w(`- **${id}** (floor ${c.floor}, input ${c.avgKey}): ${Object.entries(c.k).map(([lvl, cells]) => `\`${lvl}\` { ${Object.entries(cells).map(([k, v]) => `${k} ${v}`).join(', ')} }`).join('; ')}${c.thinCells.length ? `; thin → parent: ${c.thinCells.map((t) => `${t.cell} (${t.players})`).join(', ')}` : ''}`);
  }
  w('');

  w('## 7. Decision', '',
    'Pre-registered (§5). Eligible when: **G1** relevant ΔMAE CI upper bound ≤ δ; **G2** |relevant bias| ≤ 1.0 and smaller than C0\'s; **G3** star ΔMAE CI upper bound ≤ δ; **G4** all-veteran ΔMSE CI upper bound < 0; **G5** no position whose relevant ΔMAE CI lower bound > δ. ' +
    'Then walk the parsimony tiers (L0 < K1f0 < R0f0 < RK1 < RK1f0 < RK1f0L < K2/K3 < RK2/RK3 < RK2f0/RK3f0 < RK3f0L); a later tier replaces the incumbent only when its paired R\\* ΔMAE CI upper bound is below 0; within a tier the lowest R\\* MAE wins. C3f0 is reference-only and never picked.', '',
    `| candidate | ${deltas.map((d) => `δ = ${d}`).join(' | ')} |`, `|---|${deltas.map(() => '---').join('|')}|`);
  for (const id of ['L0', ...CAUSE_CANDIDATE_IDS]) {
    w(`| ${id} | ${deltas.map((d) => { const e = decisions[d].eligibility[id]; return !e ? 'n/a' : e.eligible ? 'eligible' : `fails ${e.failed.join(', ')}`; }).join(' | ')} |`);
  }
  w('');
  for (const d of deltas) w(`- ${d === meta.primaryDelta ? '**' : ''}δ = ${d}: ${decisions[d].text}${d === meta.primaryDelta ? '**' : ''}`);
  w('', 'The choice is Anton\'s.', '');

  w('## 8. 2026 impact and named stars', '',
    `Veterans in the ${meta.snapshot} snapshot: ${impact.veterans}. Games change vs C0; rank change = projectedPPG × games.`, '',
    '| candidate | mean Δ QB | RB | WR | TE | rel3 cut ≥ 4 | rank changes (QB / RB / WR / TE) |', '|---|---|---|---|---|---|---|');
  for (const [id, c] of Object.entries(impact.byCandidate)) {
    w(`| ${id} | ${POSITIONS.map((p) => sgn(c.meanChange[p])).join(' | ')} | ${c.rel3Cut} | ${POSITIONS.map((p) => `${c.rankChanged[p].changed}/${c.rankChanged[p].players}`).join(' / ')} |`);
  }
  const cols = ['C0', 'L0', ...CAUSE_CANDIDATE_IDS];
  w('', '**Named stars** (guardrail for Anton, not a gate): pinned first, then every rel3 veteran whose games change by ≥ 3 under any candidate.', '',
    `| player | pos | K1 | K2 | K3 | rel3 | ${cols.join(' | ')} |`, `|---|---|---|---|---|---|${cols.map(() => '---').join('|')}|`);
  for (const x of [...impact.namedStars.pinned, ...impact.namedStars.auto]) {
    if (x.notVeteran) { w(`| ${x.name} (${x.id}) | not a 2026 veteran | | | | | ${cols.map(() => '').join(' | ')} |`); continue; }
    w(`| ${x.name} | ${x.position} | ${x.k1} | ${x.k2} | ${x.k3} | ${x.rel3 ? 'yes' : 'no'} | ${cols.map((c) => x.games[c]).join(' | ')} |`);
  }
  if (impact.namedStars.autoOverflow) w('', `(${impact.namedStars.autoOverflow} further auto-selected veterans omitted by the cap.)`);
  w('');

  w('## 9. Limits', '',
    '- INA mixes healthy scratches with injuries (the injury report is not ingested): K2 counts it as bench; K3 counts it as injury only for contributors.',
    '- K3 counts a benched contributor (e.g. a QB benched for performance) as injured.',
    '- RES includes non-injury reserve (NFI; COVID 2020–21).',
    '- Era caveat: see §3.',
    '- S = 2015 rows are `unk` for K2/K3 and fit through `pos|s`.',
    '- `rel3` and `relevant` rank on served half-PPR `fantasyPoints`; the app ranks on league scoring. The rel3 three-season window is pre-registered, not tuned.',
    '- Floor 0 needs an app clamp change.',
    '- `chain` QB totals do not read `projectedGames`; historical rows cannot be routed to `chain`.',
    '- §8\'s rank impact uses the snapshot\'s league-scored `projectedPPG` (`scoringBasis: "custom league"`).',
    '- Rookies are out of scope: the rookie games ladder reads no history.',
    '- **Wireability:** K1 and rel use app data (`classifyInjurySeason` is CR-28-mirrored; season ranks exist app-side). K2/K3 need a new served signal, a new coupling, and a registry entry before any wiring (the app never reads rosterweekly).');
  return out.join('\n');
}

// ─── Artifacts ───────────────────────────────────────────────────────────────

export function writeGamesCauseArtifacts({ result, verdictMd, root = null }) {
  const date = result.meta.generatedAt.slice(0, 10);
  const panelPath = `backtests/${date}-games-cause-panel.json`;
  const constantsPath = `backtests/${date}-games-cause-constants.json`;
  const verdictPath = `grading/${date}-games-cause-verdict.md`;
  const { constants, ...panel } = result;
  const panelJson = JSON.stringify(panel, null, 2) + '\n';
  const abs = (rel) => (root ? path.join(root, rel) : repoPath(rel));
  fs.mkdirSync(abs('backtests'), { recursive: true });
  fs.mkdirSync(abs('grading'), { recursive: true });
  fs.writeFileSync(abs(panelPath), panelJson, 'utf8');
  fs.writeFileSync(abs(constantsPath), JSON.stringify(constants, null, 2) + '\n', 'utf8');
  fs.writeFileSync(abs(verdictPath), verdictMd.endsWith('\n') ? verdictMd : verdictMd + '\n', 'utf8');
  return { panelPath, constantsPath, verdictPath, panelBytes: Buffer.byteLength(panelJson) };
}

/** The `--games-calibration --cause` branch body of `bin/backtest.mjs`. Exit 1 on ParityStop/SnapshotStop (nothing written). */
export function gamesCauseMain({
  load = GAMES_CAL_LOAD, defaults = GAMES_CAL_DEFAULTS, causeDefaults = CAUSE_DEFAULTS, write = false, asJson = false,
  writeArtifacts = writeGamesCauseArtifacts, log = console.log, logErr = console.error,
} = {}) {
  try {
    const result = runGamesCause({ load, defaults, causeDefaults, log: (m) => logErr(`[backtest] ${m}`) });
    const verdictMd = buildGamesCauseVerdictMarkdown(result);
    if (write) {
      const w = writeArtifacts({ result, verdictMd });
      logErr(`[backtest] Wrote ${w.panelPath} (${w.panelBytes} B), ${w.constantsPath}, ${w.verdictPath}`);
    }
    log(asJson ? JSON.stringify(result, null, 2) : verdictMd);
    return 0;
  } catch (err) {
    if (err instanceof ParityStop || err instanceof SnapshotStop) {
      logErr(`[backtest] ${err.message}`);
      return 1;
    }
    throw err;
  }
}
