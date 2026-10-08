/**
 * scripts/games-calibration-run.mjs — projected-games over-projection: decomposition (Q-A) and held-out
 * calibration (Q-B) (`bin/backtest.mjs --games-calibration`). Task file:
 * .claude/tasks/projected-games-calibration.md (L6). Offline analysis only: no served file, no manifest
 * entry. The pure fit core is lib/gamesCalibration.mjs; the predictor is lib/durabilityMirror.mjs
 * (mirror of the app's durability rules, CR-28).
 *
 * Public exports:
 *   GAMES_CAL_LOAD, ParityStop, SnapshotStop (re-exported)
 *   panelEligibility({ store, rosterByYear, positionOf, draftYearOf, defaults }) → { included, excluded, counts }
 *   runGamesCalibration({ load, defaults, log })      → result
 *   buildGamesCalibrationVerdictMarkdown(result)      → string
 *   writeGamesCalibrationArtifacts({ result, verdictMd, root }) → { panelPath, constantsPath, verdictPath, panelBytes }
 *   gamesCalibrationMain({ load, write, asJson, … })  → exit code
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { repoPath } from '../lib/io.mjs';
import { isTeamAggregateId } from '../lib/backtest.mjs';
import { forwardChainFolds } from '../lib/panel.mjs';
import { ageOnDate } from '../lib/inSeasonEvidence.mjs';
import { MISSED_ROSTER_STATUSES } from '../lib/absence.mjs';
import { projectedGamesFor } from '../lib/durabilityMirror.mjs';
import { guardLoad } from './inseason-run.mjs';
import {
  ABSENCE_LOAD, ParityStop, SnapshotStop, buildPanel, parityReport,
} from './absence-run.mjs';
import {
  GAMES_CAL_DEFAULTS, CANDIDATES, CANDIDATE_IDS, ageBucketOf, buildRankIndex, enrichRow,
  fitCandidate, kFor, candidatePred, foldTrainRows, deltaStats, pooledStats, decide, eligibility,
} from '../lib/gamesCalibration.mjs';

export { ParityStop, SnapshotStop, GAMES_CAL_DEFAULTS };

const POSITIONS = ['QB', 'RB', 'WR', 'TE'];                              // scripts/absence-run.mjs:32
const PARITY_FIXTURE = 'test/fixtures/durability-parity-2026-10-04.json';

export const GAMES_CAL_LOAD = {
  ...ABSENCE_LOAD,
  gitRev: () => execSync('git rev-parse HEAD', { cwd: repoPath('.') }).toString().trim(),
};

const round3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function need(v, what) {
  if (v == null) throw new Error(`[games-calibration] ${what} not found in the store`);
  return v;
}

// ─── §3.3 panelEligibility — the buildPanel predicate, walked ────────────────

// scripts/absence-run.mjs:125-126 hasReserveListing (not exported there).
const hasReserveListing = (rwFile, id) =>
  Object.values(rwFile?.players?.[id] ?? {}).some((pairs) => pairs.some(([, st]) => MISSED_ROSTER_STATUSES.has(st)));

const hasAnyListing = (rwFile, id) => Object.keys(rwFile?.players?.[id] ?? {}).length > 0;

/**
 * Same checks, in the same order, as scripts/absence-run.mjs buildPanel (:127-153), with before = after = store.
 * `included` = buildPanel's rows (with `noS1Row` marking the outcome-0 reserve rows); `excluded` = what
 * buildPanel counts as `excludedNoRowNoReserve`, each with the mirror's prediction and `activeInS`.
 */
export function panelEligibility({ store, rosterByYear, positionOf, draftYearOf, defaults = GAMES_CAL_DEFAULTS }) {
  const { from, to } = defaults.predictorSeasons;
  // buildPanel's firstSeason scan over the store with isTeamAggregateId (absence-run.mjs:128-131)
  const firstSeason = {};
  for (const y of Object.keys(store).map(Number).sort((a, b) => a - b)) {
    for (const id of Object.keys(store[y])) if (!isTeamAggregateId(id) && firstSeason[id] === undefined) firstSeason[id] = y;
  }
  const included = [], excluded = [];
  const counts = { noQualifying: 0, notVeteran: 0 };
  for (let S = from; S <= to; S++) {
    for (const id of Object.keys(firstSeason)) {
      const position = positionOf[id];
      if (!POSITIONS.includes(position) || firstSeason[id] > S) continue;
      const p = projectedGamesFor(store, id, position, { throughSeason: S });      // pb && pa (identical: before = after)
      if (!p) { counts.noQualifying++; continue; }
      const rookieYear = draftYearOf[id] ?? firstSeason[id];
      if (!(rookieYear <= S - 1)) { counts.notVeteran++; continue; }
      const next = store[S + 1]?.[id];
      if (next) included.push({ id, S, position, pred: p.projectedGames, outcome: next.gamesPlayed ?? 0, noS1Row: false });
      else if (hasReserveListing(rosterByYear[S + 1], id)) included.push({ id, S, position, pred: p.projectedGames, outcome: 0, noS1Row: true });
      else excluded.push({ id, S, position, pred: p.projectedGames, activeInS: !!store[S]?.[id] || hasAnyListing(rosterByYear[S], id) });
    }
  }
  return { included, excluded, counts };
}

// ─── Q-A ─────────────────────────────────────────────────────────────────────

const GROUPS = ['schedule', 'composition', 'role', 'injuryList', 'recon'];
const CATS = ['offRoster', 'practiceSquad', 'otherStatus', 'activeNoPlay', 'inactive', 'reserve'];

function decompCell(rows) {
  if (!rows.length) return { n: 0 };
  const out = { n: rows.length, players: new Set(rows.map((r) => r.id)).size, bias: round3(mean(rows.map((r) => r.dec.bias))) };
  for (const g of GROUPS) out[g] = round3(mean(rows.map((r) => r.dec[g])));
  out.cats = {};
  for (const c of CATS) out.cats[c] = round3(mean(rows.map((r) => r.weeks.counts[c])));
  return out;
}

function qaCells(accounted, defaults) {
  const cells = [['all rows', accounted]];
  for (const p of POSITIONS) cells.push([`pos ${p}`, accounted.filter((r) => r.position === p)]);
  for (const p of POSITIONS) {
    const buckets = [...new Set(accounted.filter((r) => r.position === p).map((r) => r.ageBucket))].sort();
    for (const b of buckets) cells.push([`${p} age ${b}`, accounted.filter((r) => r.position === p && r.ageBucket === b)]);
  }
  for (const s of ['qual', 'short', 'none']) cells.push([`sState ${s}`, accounted.filter((r) => r.sState === s)]);
  cells.push(['relevant', accounted.filter((r) => r.relevant)], ['not relevant', accounted.filter((r) => !r.relevant)]);
  cells.push(['QB starter in S', accounted.filter((r) => r.position === 'QB' && r.qbStarterS)],
    ['QB not a starter in S', accounted.filter((r) => r.position === 'QB' && !r.qbStarterS)]);
  cells.push(['outcome 2016–2020', accounted.filter((r) => r.S + 1 <= 2020)], ['outcome 2021–2025', accounted.filter((r) => r.S + 1 >= 2021)]);
  return cells;
}

function runQa(rows, panel, defaults) {
  const accounted = rows.filter((r) => r.dec);
  const cells = qaCells(accounted, defaults).map(([name, rs]) => ({ name, ...decompCell(rs) }));
  const otherByStatus = {};
  for (const r of accounted) for (const [st, n] of Object.entries(r.weeks.otherByStatus)) otherByStatus[st] = (otherByStatus[st] ?? 0) + n;
  const stayed = accounted.filter((r) => r.dec.composition === 0);
  const stayedAvail = stayed.filter((r) => r.dec.role === 0 && r.dec.injuryList === 0);
  const cf = (rs) => ({ n: rs.length, bias: rs.length ? round3(mean(rs.map((r) => r.dec.bias))) : null });
  const stayedBy = { byPosition: {}, bySState: {} };
  for (const p of POSITIONS) stayedBy.byPosition[p] = cf(stayed.filter((r) => r.position === p));
  for (const s of ['qual', 'short', 'none']) stayedBy.bySState[s] = cf(stayed.filter((r) => r.sState === s));
  const all = cells[0];

  // §3.3 panel sensitivity
  const stat = (rs) => ({ n: rs.length, bias: rs.length ? round3(mean(rs.map((r) => r.pred - r.outcome))) : null,
    mae: rs.length ? round3(mean(rs.map((r) => Math.abs(r.pred - r.outcome)))) : null });
  const exZero = (list) => list.map((e) => ({ ...e, outcome: 0 }));
  const sensitivity = {
    'P-strict': stat(panel.included.filter((r) => !r.noS1Row)),
    'P-stageB': stat(panel.included),
    'P-wide-active': stat([...panel.included, ...exZero(panel.excluded.filter((e) => e.activeInS))]),
    'P-wide': stat([...panel.included, ...exZero(panel.excluded)]),
  };
  const headline = `Of the ${all.bias >= 0 ? '+' : ''}${all.bias.toFixed(2)} bias, composition contributes ${all.composition.toFixed(2)}, role ${all.role.toFixed(2)}, injury list ${all.injuryList.toFixed(2)}, schedule ${all.schedule.toFixed(2)}.`;
  return {
    accountedRows: accounted.length, skipped: rows.length - accounted.length, cells, otherByStatus,
    counterfactual: { stayed: cf(stayed), stayedAvailable: cf(stayedAvail), ...stayedBy },
    sensitivity, headline,
  };
}

// ─── Q-B ─────────────────────────────────────────────────────────────────────

const ALL_IDS = ['C0', ...CANDIDATE_IDS];

function cellMetrics(rows, bootstrap) {
  const out = {};
  for (const id of ALL_IDS) {
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

function runQb(rows, defaults, log) {
  const years = [];
  for (let y = defaults.predictorSeasons.from; y <= defaults.predictorSeasons.to; y++) years.push(y);
  const folds = forwardChainFolds(years, defaults.minTrainSeasons);
  const oos = [];
  const foldInfo = [];
  const fitOpts = { minCellTrainPlayers: defaults.minCellTrainPlayers, kGrid: defaults.kGrid };
  for (const fold of folds) {
    const train = foldTrainRows(rows, fold);
    const evalRows = rows.filter((r) => r.S === fold.evalYear);
    const models = Object.fromEntries(CANDIDATE_IDS.map((id) => [id, fitCandidate(train, id, fitOpts)]));
    const fb = {};
    const foldOos = evalRows.map((r) => {
      const p = { C0: r.pred };
      for (const id of CANDIDATE_IDS) {
        const kk = kFor(models[id], r);
        p[id] = candidatePred(r.avgGames, kk.k, CANDIDATES[id].floor);
        if (kk.fallback) {
          const m = (fb[id] ??= {});
          const key = `${kk.requested}->${kk.used}`;
          m[key] = (m[key] ?? 0) + 1;
        }
      }
      return { id: r.id, S: r.S, position: r.position, ageBucket: r.ageBucket, sState: r.sState, relevant: r.relevant, outcome: r.outcome, p };
    });
    oos.push(...foldOos);
    foldInfo.push({
      evalYear: fold.evalYear, trainYears: [fold.trainYears[0], fold.trainYears[fold.trainYears.length - 1]],
      trainRows: train.length, evalRows: evalRows.length,
      fallbackRows: Object.fromEntries(Object.entries(fb).map(([id, m]) => [id, Object.values(m).reduce((a, b) => a + b, 0)])),
      fallbackCells: fb,
      thinTrainCells: Object.fromEntries(CANDIDATE_IDS.map((id) => [id, models[id].thin])),
    });
    log(`fold eval ${fold.evalYear}: train ${train.length}, eval ${evalRows.length}`);
  }

  const bs = defaults.bootstrap;
  const tables = { pooled: cellMetrics(oos, bs), byPosition: {}, byAge: {}, bySState: {}, relevant: {}, era2020: null };
  for (const p of POSITIONS) tables.byPosition[p] = cellMetrics(oos.filter((r) => r.position === p), bs);
  for (const p of POSITIONS) {
    const buckets = [...new Set(oos.filter((r) => r.position === p).map((r) => r.ageBucket))].sort();
    for (const b of buckets) tables.byAge[`${p} ${b}`] = cellMetrics(oos.filter((r) => r.position === p && r.ageBucket === b), bs);
  }
  for (const s of ['qual', 'short', 'none']) tables.bySState[s] = cellMetrics(oos.filter((r) => r.sState === s), bs);
  tables.relevant = { relevant: cellMetrics(oos.filter((r) => r.relevant), bs), notRelevant: cellMetrics(oos.filter((r) => !r.relevant), bs) };
  tables.era2020 = cellMetrics(oos.filter((r) => r.S >= 2020), bs);

  // full-sample constants
  const full = Object.fromEntries(CANDIDATE_IDS.map((id) => [id, fitCandidate(rows, id, fitOpts)]));
  const constants = {};
  for (const id of CANDIDATE_IDS) {
    const k = {};
    for (const level of Object.values(full[id].cells)) for (const [key, c] of Object.entries(level)) k[key] = c.k;
    constants[id] = { floor: CANDIDATES[id].floor, k, thinCells: full[id].thin };
  }
  return { folds: foldInfo, oos, tables, full, constants };
}

// ─── §5 decision ─────────────────────────────────────────────────────────────

function summariesFor(tables) {
  const s = {};
  for (const id of CANDIDATE_IDS) {
    s[id] = {
      pooled: { dMse: tables.pooled[id].dMse, dMae: tables.pooled[id].dMae, bias: tables.pooled[id].bias, mse: tables.pooled[id].mse, mae: tables.pooled[id].mae },
      byPosition: Object.fromEntries(POSITIONS.map((p) => [p, { dMse: tables.byPosition[p][id].dMse, dMae: tables.byPosition[p][id].dMae }])),
      relevant: { dMse: tables.relevant.relevant[id].dMse, dMae: tables.relevant.relevant[id].dMae },
    };
  }
  return s;
}

// ─── 2026 impact ─────────────────────────────────────────────────────────────

function impactFor(candId, { full, store, snapshot, positionOf, bySleeper, names, defaults, to }) {
  const model = full[candId];
  const { floor } = CANDIDATES[candId];
  const vets = Object.entries(snapshot.players ?? {})
    .filter(([id, p]) => p?.projection?.confidence !== 'rookie' && POSITIONS.includes(positionOf[id]));
  const people = [];
  for (const [id, p] of vets) {
    const position = positionOf[id];
    const r = projectedGamesFor(store, id, position, { throughSeason: to });
    if (!r) continue;
    const s0 = store[to]?.[id];
    const age = ageOnDate(bySleeper?.[id]?.birthdate, defaults.ageRefDate(to + 1));
    const row = { id, position, ageBucket: ageBucketOf(age, position, defaults.ageBuckets), sState: !s0 ? 'none' : (s0.gamesPlayed ?? 0) >= 8 ? 'qual' : 'short' };
    const before = r.projectedGames;
    const after = candidatePred(r.avgGames, kFor(model, row).k, floor);
    people.push({ ...row, name: names[id]?.full_name ?? names[id]?.last_name ?? id, before, after, delta: after - before, ppg: p.projection.projectedPPG });
  }
  const dist = (key) => { const d = {}; for (let g = floor === 0 ? 0 : 8; g <= 17; g++) d[g] = 0; for (const x of people) d[x[key]]++; return d; };
  const meanChange = Object.fromEntries(POSITIONS.map((p) => [p, round3(mean(people.filter((x) => x.position === p).map((x) => x.delta)))]));
  const rankChanged = {};
  for (const p of POSITIONS) {
    const list = people.filter((x) => x.position === p && Number.isFinite(x.ppg));
    const rank = (key) => {
      const m = new Map();
      [...list].sort((a, b) => b.ppg * b[key] - a.ppg * a[key] || (a.id < b.id ? -1 : 1)).forEach((x, i) => m.set(x.id, i + 1));
      return m;
    };
    const rb = rank('before'), ra = rank('after');
    rankChanged[p] = { players: list.length, changed: list.filter((x) => rb.get(x.id) !== ra.get(x.id)).length };
  }
  const top = [...people].filter((x) => x.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.name.localeCompare(b.name)).slice(0, 15)
    .map(({ name, position, ageBucket, sState, before, after }) => ({ name, position, ageBucket, sState, before, after }));
  return { candidate: candId, veterans: people.length, distBefore: dist('before'), distAfter: dist('after'), meanChange, rankChanged, top };
}

// ─── runGamesCalibration ─────────────────────────────────────────────────────

export function runGamesCalibration({ load = GAMES_CAL_LOAD, defaults = GAMES_CAL_DEFAULTS, log = () => {} } = {}) {
  const g = guardLoad(load, { maxLoadSeason: defaults.seasons.to });
  const { from, to } = defaults.seasons;

  const fixture = need(g.loadParityFixture(), PARITY_FIXTURE);
  const parity = parityReport(fixture);
  log(`parity DM-1 ${parity.matched}/${parity.rows}`);
  if (parity.rate == null || parity.rate < defaults.parityMin) {
    throw new ParityStop(`[games-calibration] DM-1 parity ${parity.rate == null ? 'n/a' : (parity.rate * 100).toFixed(1) + '%'} is below ${defaults.parityMin * 100}% — nothing written`, parity);
  }
  const snapshot = g.loadSnapshot(defaults.snapshotDate);
  if (snapshot == null) throw new SnapshotStop(`[games-calibration] snapshots/${defaults.snapshotDate}.json not found — nothing written`);

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
  // GC-2 in the harness: the P-stageB set must equal buildPanel's rows
  const keyOf = (r) => `${r.id}|${r.S}`;
  const a = new Set(panelRows.map(keyOf)), b = new Set(panel.included.map(keyOf));
  if (a.size !== b.size || [...a].some((k) => !b.has(k))) {
    throw new Error(`[games-calibration] panelEligibility P-stageB set (${b.size}) differs from buildPanel's rows (${a.size})`);
  }
  log(`panel rows ${panelRows.length}`);

  const ctx = { store, rosterByYear, bySleeper, defaults,
    rankIndex: buildRankIndex(store, positionOf, [...new Set(panelRows.map((r) => r.S))], POSITIONS) };
  const rows = panelRows.map((r) => enrichRow(r, ctx));

  // reconciliation (§3.1)
  const recons = rows.map((r) => r.weeks.recon);
  const reconMean = mean(recons) ?? 0;
  const reconInfo = {
    mean: round3(reconMean), nonZero: recons.filter((x) => x !== 0).length,
    largest: rows.filter((r) => r.weeks.recon !== 0)
      .sort((x, y) => Math.abs(y.weeks.recon) - Math.abs(x.weeks.recon) || (x.id < y.id ? -1 : 1)).slice(0, 5)
      .map((r) => ({ id: r.id, S: r.S, position: r.position, recon: r.weeks.recon, outcome: r.outcome })),
    accountingSkipped: rows.filter((r) => r.weeks.skipped).length,
  };

  const qa = runQa(rows, panel, defaults);
  const qb = runQb(rows, defaults, log);

  // decisions
  const summaries = summariesFor(qb.tables);
  const pairedCache = new Map();
  const pairedFor = (rule) => (hi, lo) => {
    const key = `${rule}|${hi}|${lo}`;
    if (!pairedCache.has(key)) pairedCache.set(key, deltaStats(qb.oos, (r) => r.p[hi], (r) => r.p[lo], rule, defaults.bootstrap).ci95);
    return pairedCache.get(key);
  };
  const decisions = {};
  for (const rule of ['mse', 'mae']) {
    const d = decide({ rule, summaries, paired: pairedFor(rule), recon: { mean: reconMean }, tolerance: defaults.reconcileTolerance, biasGate: defaults.biasGate });
    d.eligibility = Object.fromEntries(CANDIDATE_IDS.map((id) => [id, d.eligibility[id] ?? eligibility(summaries[id], rule, defaults.biasGate)]));
    decisions[rule] = d;
  }

  // 2026 impact
  const names = g.loadPlayersRaw?.() ?? {};
  const impactCtx = { full: qb.full, store, snapshot, positionOf, bySleeper, names, defaults, to };
  const impact = {};
  for (const rule of ['mse', 'mae']) impact[rule] = decisions[rule].pick ? impactFor(decisions[rule].pick, impactCtx) : null;

  const panelRev = g.gitRev?.() ?? null;
  const generatedAt = new Date().toISOString();
  return {
    meta: { generatedAt, panelRev, seasons: defaults.seasons, predictorSeasons: defaults.predictorSeasons, snapshot: defaults.snapshotDate,
      bootstrap: defaults.bootstrap, minTrainSeasons: defaults.minTrainSeasons, parityFixture: PARITY_FIXTURE, parityFixtureRev: fixture.sourceRev,
      basis: 'half_ppr (served fantasyPoints)', d1Default: 'squared error primary; both rules reported' },
    parity: { dm1: { rows: parity.rows, matched: parity.matched, rate: round3(parity.rate), mismatches: parity.mismatches.length }, avgGamesAssertion: `all ${rows.length} panel rows` },
    panelCounts, recon: reconInfo, qa,
    qb: { folds: qb.folds, tables: qb.tables },
    constants: { generatedAt, panelRev, candidates: qb.constants, fallbacks: qb.folds.map((f) => ({ evalYear: f.evalYear, rows: f.fallbackRows, cells: f.fallbackCells })) },
    decisions, impact,
    rows: rows.map((r) => ({ id: r.id, S: r.S, position: r.position, pred: r.pred, avgGames: round3(r.avgGames), outcome: r.outcome,
      ageBucket: r.ageBucket, sState: r.sState, relevant: r.relevant, qbStarterS: r.qbStarterS, G: r.weeks.G, counts: r.weeks.counts, recon: r.weeks.recon })),
  };
}

// ─── Verdict markdown ────────────────────────────────────────────────────────

const f2 = (x) => (x == null ? 'n/a' : Number(x).toFixed(2));
const fCi = (c) => (c ? `[${f2(c[0])}, ${f2(c[1])}]` : 'n/a');
const sgn = (x) => (x == null ? 'n/a' : `${x >= 0 ? '+' : ''}${Number(x).toFixed(2)}`);

export function buildGamesCalibrationVerdictMarkdown(r) {
  const out = [];
  const w = (...l) => out.push(...l);
  const { meta, parity, panelCounts: pc, recon, qa, qb, decisions, impact } = r;
  w(`# Projected-games calibration — decomposition and held-out fit (L6) — ${meta.generatedAt.slice(0, 10)}`, '');

  w('## 1. What was compared', '',
    `Panel: Stage B's (\`buildPanel\`, unchanged), called with before = after = the committed post-correction store (data \`${(meta.panelRev ?? 'n/a').slice(0, 7)}\`): ` +
    `${r.rows.length} player-seasons, predictor seasons S = ${meta.predictorSeasons.from}–${meta.predictorSeasons.to}, outcome S+1 \`gamesPlayed\`. ` +
    `Prediction = the mirrored veteran projected-games rule (\`lib/durabilityMirror.mjs\`, app \`d627562\`). Basis: ${meta.basis}.`, '',
    `Folds: forward-chaining over predictor season, ≥ ${meta.minTrainSeasons} training seasons — eval S = ${qb.folds.map((f) => f.evalYear).join(', ')}; each fold trains on every S ≤ t − 1 (whose outcome season t is complete when the eval-t prediction is made). Out-of-sample rows are pooled across folds.`, '',
    '**D1 — scoring rule (Anton\'s call).** Squared error is the default primary rule (an expected-value total needs an unbiased mean); MAE is the alternative. Both outcomes are reported below, so no re-run is needed. ' +
    'L5 graded on MAE; this is a deliberate change, because L5 asked whether the corrected data predicted worse and L6 asks whether totals are calibrated.', '');

  w('## 2. Parity and reconciliation', '',
    `- DM-1 (asserted ≥ 99%): **${parity.dm1.matched}/${parity.dm1.rows} = ${(parity.dm1.rate * 100).toFixed(1)}%**.`,
    `- \`avgGames\` assertion (\`Math.round(clamp(avgGames, 8, 17)) === prediction\`): held for ${parity.avgGamesAssertion}.`,
    `- Reconciliation (\`recon = team-game 'P' slots − S+1 gamesPlayed\`): mean ${recon.mean}, ${recon.nonZero} rows ≠ 0` +
      `${recon.largest.length ? '; largest ' + recon.largest.map((x) => `${x.id} S${x.S} (${x.position}) ${x.recon}`).join(', ') : ''}.`,
    `- \`accountingSkipped\` (no team in any week): ${recon.accountingSkipped}.`,
    `- Panel counts: ${pc.included} included (${pc.includedZeroOutcome} at outcome 0: no S+1 row but a reserve listing), ${pc.excludedNoRowNoReserve} excluded (no S+1 row, no reserve listing), ${pc.notVeteran} not yet veterans, ${pc.noQualifying} with no qualifying season.`, '');

  w('## 3. Q-A decomposition', '',
    `Accounted rows: ${qa.accountedRows} (${qa.skipped} skipped). Each cell's contributions are mean per-row games and sum exactly to the cell's bias (\`pred − outcome\`). ` +
    'schedule = pred − team games; composition = off roster + practice squad + other status; role = active-not-playing + inactive (**inactive (mixed)**: INA also holds injured gameday inactives, the injury report is not ingested); injury list = RES/PUP; recon = played − outcome.', '',
    '| cell | n | bias | schedule | composition | role (inactive, mixed) | injury list | recon |', '|---|---|---|---|---|---|---|---|');
  for (const c of qa.cells) w(`| ${c.name} | ${c.n} | ${c.n ? sgn(c.bias) : 'n/a'} | ${f2(c.schedule)} | ${f2(c.composition)} | ${f2(c.role)} | ${f2(c.injuryList)} | ${f2(c.recon)} |`);
  w('', `**${qa.headline}**`, '');
  const allCells = qa.cells.filter((c) => ['all rows', 'outcome 2016–2020', 'outcome 2021–2025'].includes(c.name));
  w('Category columns (group level; read these only at group level for outcome seasons before 2019):', '',
    `| cell | ${['offRoster', 'practiceSquad', 'otherStatus', 'activeNoPlay', 'inactive', 'reserve'].join(' | ')} |`, '|---|---|---|---|---|---|---|');
  for (const c of allCells) w(`| ${c.name} | ${['offRoster', 'practiceSquad', 'otherStatus', 'activeNoPlay', 'inactive', 'reserve'].map((k) => f2(c.cats[k])).join(' | ')} |`);
  w('', `Slots inside \`otherStatus\` by roster status: ${Object.entries(qa.otherByStatus).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}. (RSN and RSR are reserve designations counted here as composition.)`, '',
    '**Era caveat.** The rosterweekly status vocabulary changes by era: INA is absent in 2016–2018, so gameday inactives land in `activeNoPlay`; DEV is nearly absent in 2016 (48 rows, against 2,924 in 2017), so practice-squad players count as `offRoster`. Group totals hold across eras (role = ACT + INA, composition = DEV + off + other).', '');
  const cf = qa.counterfactual;
  w('Counterfactual biases:', '',
    `- **stayed** (composition = 0, on a roster or reserve list every team game): n ${cf.stayed.n}, bias ${sgn(cf.stayed.bias)} — the durability model's figure on players who stayed in the league all year.`,
    `- **stayed and available** (+ role = 0, injury list = 0): n ${cf.stayedAvailable.n}, bias ${sgn(cf.stayedAvailable.bias)} — pure schedule + recon + model level.`,
    `- stayed, by position: ${POSITIONS.map((p) => `${p} ${sgn(cf.byPosition[p].bias)} (n ${cf.byPosition[p].n})`).join('; ')}.`,
    `- stayed, by S-row state: ${['qual', 'short', 'none'].map((s) => `${s} ${sgn(cf.bySState[s].bias)} (n ${cf.bySState[s].n})`).join('; ')}.`, '');
  w('Panel sensitivity (same predictor rows, different membership):', '', '| panel | n | bias | MAE |', '|---|---|---|---|');
  for (const [k, v] of Object.entries(qa.sensitivity)) w(`| ${k}${k === 'P-wide' ? ' (outer bound only: mostly long-retired players repeated for every later S)' : ''} | ${v.n} | ${sgn(v.bias)} | ${f2(v.mae)} |`);
  w('');

  w('## 4. Q-B held-out results', '',
    'Candidates scale the pre-round `avgGames` by a per-cell k fitted on training SSE: `pred = round(clamp(avgGames × k, floor, 17))`. C1 = position, C2 = + age bucket, C3 = + S-row state, C4 = both; the `f0` variants lower the floor to 0 (a wiring change would have to lower the app\'s clamp). ' +
    'ΔMSE / ΔMAE are candidate − C0, with player-clustered paired-bootstrap 95% CIs (n/a under 30 players).', '',
    '### 4.1 Pooled out-of-sample', '', cellTable(qb.tables.pooled), '');
  const sub = (title, obj) => { w(`### ${title}`, ''); for (const [name, t] of Object.entries(obj)) w(`**${name}**`, '', cellTable(t), ''); };
  sub('4.2 By position', qb.tables.byPosition);
  sub('4.3 By age bucket within position', qb.tables.byAge);
  sub('4.4 By S-row state', qb.tables.bySState);
  sub('4.5 Relevant (top-N by position in S) vs not', { relevant: qb.tables.relevant.relevant, 'not relevant': qb.tables.relevant.notRelevant });
  sub('4.6 Eval S 2020–2024 (the 17-game era)', { 'eval S ≥ 2020': qb.tables.era2020 });
  w('### 4.7 Fallbacks', '', '| eval S | train rows | eval rows | rows on a parent k, by candidate |', '|---|---|---|---|');
  for (const f of qb.folds) w(`| ${f.evalYear} | ${f.trainRows} | ${f.evalRows} | ${Object.entries(f.fallbackRows).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'} |`);
  w('');

  w('## 5. Full-sample k table', '', 'Fitted once more on every panel row (S 2015–2024); this is what a wiring slice would pin. Written to `backtests/<date>-games-calibration-constants.json`.', '');
  for (const id of CANDIDATE_IDS) {
    const c = r.constants.candidates[id];
    w(`- **${id}** (floor ${c.floor}): ${Object.entries(c.k).map(([k, v]) => `${k} ${v}`).join(', ')}${c.thinCells.length ? `; thin → parent: ${c.thinCells.map((t) => `${t.cell} (${t.players})`).join(', ')}` : ''}`);
  }
  w('');

  w('## 6. Decision', '',
    'Pre-registered (§5). Eligible under the squared-error rule: ΔMSE CI upper bound < 0; |pooled bias| ≤ 1.0; no position made significantly worse; the `relevant` ΔMSE mean ≤ 0. The MAE rule uses ΔMAE and drops the bias condition. Tier order: C1 < C1f0 < {C2, C3} < {C2f0, C3f0} < C4 < C4f0; a higher tier replaces the incumbent only on a paired CI below 0.', '',
    '| candidate | squared-error rule | MAE rule |', '|---|---|---|');
  for (const id of CANDIDATE_IDS) {
    const cell = (rule) => { const e = decisions[rule].eligibility[id]; return e.eligible ? 'eligible' : `fails ${e.failed.join(', ')}`; };
    w(`| ${id} | ${cell('mse')} | ${cell('mae')} |`);
  }
  w('', `- **Squared-error rule (default):** ${decisions.mse.text}`, `- **MAE rule (alternative):** ${decisions.mae.text}`, '', 'The choice is Anton\'s.', '');

  w('## 7. 2026 impact', '');
  for (const [rule, label] of [['mse', 'squared-error pick'], ['mae', 'MAE pick']]) {
    const im = impact[rule];
    if (!im) { w(`- ${label}: none.`); continue; }
    w(`- **${label}: ${im.candidate}** — ${im.veterans} veterans. Distribution before: ${JSON.stringify(im.distBefore)}; after: ${JSON.stringify(im.distAfter)}. Mean change by position: ${JSON.stringify(im.meanChange)}. Rank (projectedPPG × games) changes: ${POSITIONS.map((p) => `${p} ${im.rankChanged[p].changed}/${im.rankChanged[p].players}`).join(', ')}.`,
      '', '| player | pos | age | S state | games before → after |', '|---|---|---|---|---|');
    for (const t of im.top) w(`| ${t.name} | ${t.position} | ${t.ageBucket} | ${t.sState} | ${t.before} → ${t.after} |`);
    w('');
  }

  w('## 8. Limits', '',
    '- INA mixes healthy scratches with injuries (the injury report is not ingested).',
    '- `chain` QB totals do not read `projectedGames`; historical rows cannot be routed to `chain`.',
    '- The `relevant` rank uses served half-PPR `fantasyPoints`; §7\'s rank impact uses the snapshot\'s league-scored `projectedPPG` (`scoringBasis: "custom league"`).',
    '- Era caveat: see §3.',
    '- Rookies are out of scope: the rookie games ladder reads no history.');
  return out.join('\n');
}

function cellTable(t) {
  const lines = ['| cand | n | bias | MAE | RMSE | ρ | ρ within pos | ΔMSE [95% CI] | ΔMAE [95% CI] |', '|---|---|---|---|---|---|---|---|---|'];
  for (const id of ALL_IDS) {
    const c = t[id];
    if (!c.n) { lines.push(`| ${id} | 0 | n/a | n/a | n/a | n/a | n/a | n/a | n/a |`); continue; }
    lines.push(`| ${id} | ${c.n} | ${sgn(c.bias)} | ${f2(c.mae)} | ${f2(c.rmse)} | ${f2(c.rho)} | ${f2(c.rhoWithinPos)} | ` +
      `${c.dMse ? `${f2(c.dMse.mean)} ${fCi(c.dMse.ci95)}` : '—'} | ${c.dMae ? `${f2(c.dMae.mean)} ${fCi(c.dMae.ci95)}` : '—'} |`);
  }
  return lines.join('\n');
}

// ─── Artifacts ───────────────────────────────────────────────────────────────

export function writeGamesCalibrationArtifacts({ result, verdictMd, root = null }) {
  const date = result.meta.generatedAt.slice(0, 10);
  const panelPath = `backtests/${date}-games-calibration-panel.json`;
  const constantsPath = `backtests/${date}-games-calibration-constants.json`;
  const verdictPath = `grading/${date}-games-calibration-verdict.md`;
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

/** The `--games-calibration` branch body of `bin/backtest.mjs`. Exit 1 on ParityStop/SnapshotStop (nothing written). */
export function gamesCalibrationMain({
  load = GAMES_CAL_LOAD, defaults = GAMES_CAL_DEFAULTS, write = false, asJson = false, writeArtifacts = writeGamesCalibrationArtifacts,
  log = console.log, logErr = console.error,
} = {}) {
  try {
    const result = runGamesCalibration({ load, defaults, log: (m) => logErr(`[backtest] ${m}`) });
    const verdictMd = buildGamesCalibrationVerdictMarkdown(result);
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
