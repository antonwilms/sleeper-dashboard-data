/**
 * scripts/season-grade-run.mjs — January season grade: adapter + orchestrator (plan january-grading-run-a §10).
 *
 * Offline analysis, not the snapshot grader (Invariant 9): the vet-calibration step RECOMPOSES projections (replay R), it
 * never re-runs the app pipeline. Report-only: it emits numbers and labels, never a constant or a wiring recommendation.
 *
 * `STEPS` is the ordered step registry; Slice B appended `ros`, `games-l6`, `override`, `rookie`, `d60`, `listed` after
 * Slice A's steps without touching them. Each step after the season gate runs in its own try/catch (the update-playerstats precedent).
 */

import fs from 'node:fs';
import { readJson, repoPath, writeJsonStable } from '../lib/io.mjs';
import { loadLeaguePositions, rescoreSeasonRowsLeague, leagueBasisLoad, basisScaleOf } from '../lib/leagueBasis.mjs';
import { normalizeTeamForSchedule } from '../lib/sleeper.mjs';
import { buildRankIndex, rel3Of, GAMES_CAL_DEFAULTS } from '../lib/gamesCalibration.mjs';
import { ROOKIE_TOTAL, biasSummary } from '../lib/rookieTotalPoints.mjs';
import { ROOKIE_TOTAL_FACTOR } from '../lib/rookieMirror.mjs';
import { inSeasonCheck } from './games-short-run.mjs';
import { runRookiePanels, quantile, leagueLoadArgs, DEFAULT_LOAD as PANEL_DEFAULT_LOAD } from './panel-run.mjs';
import { runRookieTotal, ROOKIE_TOTAL_LOAD } from './rookie-total-run.mjs';
import { pinnedQbChainModels } from '../lib/projectionFactors.mjs';
import {
  KICKOFF_2026_UTC, VETERAN_SEGMENTS, MECH_PAIRS, POSITIONS, HISTORY_MEDIANS, MIN_CELL, BOOT,
  evaluateSeasonGate, classifyCapture, crossCheckClassification,
  metricOf, segmentStats, sampleOk, materializeRows, bootCI, permutationTest,
  calibrationLabel, historyLabel, agreeLabel, pooledDiffLabel,
  rosCalendar, pickCheckpointCapture, buildRosRows, rosCheckpointReport, gamesL6Report, d16Label, d75Label, pairedDelta,
} from '../lib/seasonGrade.mjs';
import {
  vetEntries, chartPositions, gIdentity, gDepth, gTables, gQbChain, gAgeTable, boundaryGuard,
  gMechPair, qDrift, replayR, selectSpan, makePriorOf, makeRecentStarterOf, isChainFactors,
} from '../lib/vetReplay.mjs';
import {
  gradeSnapshot, resolveOutcomeBasis, buildHalfPprOutcomes, buildLeagueOutcomes, resolvePositionOf,
} from './grade-snapshot.mjs';

// ─── Injectable I/O surface ───────────────────────────────────────────────────

export const DEFAULT_LOAD = {
  listSnapshotDates: () => fs.readdirSync(repoPath('snapshots')).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map(f => f.slice(0, 10)).sort(),
  loadSnapshot:      (date) => readJson(`snapshots/${date}.json`),
  loadSeasonTotals:  (year) => readJson(`nfl/season-totals/${year}.json`),
  loadSchedule:      (year) => readJson(`nflverse/schedule/${year}.json`),
  loadManifest:      () => readJson('manifest.json'),
  loadPlayerIds:     () => readJson('nflverse/playerids.json'),
  loadPositionOf:    () => loadLeaguePositions(),
  loadRoster:        (year) => readJson(`nflverse/roster/${year}.json`),
  loadQbConstants:   () => readJson('backtests/2026-10-03-qb-takeover-constants.json'),
  // Slice B (§5a)
  rookiePanelLoad:   () => PANEL_DEFAULT_LOAD,
  rookieTotalLoad:   () => ROOKIE_TOTAL_LOAD,
  loadRookieLeagueConstants: () => readJson('backtests/2026-10-17-rookie-league-constants.json'),
};

const LAST_SEGMENT = VETERAN_SEGMENTS[VETERAN_SEGMENTS.length - 1];
const fmt = (x, d = 3) => (x == null || !Number.isFinite(x) ? 'n/a' : x.toFixed(d));
const fmtCI = (ci, d = 3) => (ci ? `[${fmt(ci[0], d)}, ${fmt(ci[1], d)}]` : 'n/a');

// ─── Context ──────────────────────────────────────────────────────────────────

export function makeContext({ load = DEFAULT_LOAD, rehearse = false, write = false, runDate = null, log = () => {} } = {}) {
  const snapCache = new Map();
  const totalsCache = new Map();
  const ctx = {
    load, rehearse, write, log,
    runDate: runDate ?? new Date().toISOString().slice(0, 10),
    KICKOFF_2026_UTC,
    shared: {},
    snapshot(date) {
      if (snapCache.has(date)) { const v = snapCache.get(date); snapCache.delete(date); snapCache.set(date, v); return v; }
      const v = load.loadSnapshot(date);
      if (!v) throw new Error(`snapshots/${date}.json not found`);
      snapCache.set(date, v);
      while (snapCache.size > 4) snapCache.delete(snapCache.keys().next().value);
      return v;
    },
    totals(year) {
      if (!totalsCache.has(year)) totalsCache.set(year, load.loadSeasonTotals(year));
      return totalsCache.get(year);
    },
    stamp: null,
  };
  ctx.inventory = () => (ctx.shared.inventory ??= buildInventory(ctx));
  return ctx;
}

const stampOf = (ctx) => (ctx.rehearse ? ctx.stamp ?? 'REHEARSAL — partial season' : null);

// ─── Inventory ────────────────────────────────────────────────────────────────

function buildInventory(ctx) {
  const dates = ctx.load.listSnapshotDates();
  const entries = [];
  for (const date of dates) {
    const snap = ctx.load.loadSnapshot(date);
    const cls = classifyCapture(snap, date);
    const basis = resolveOutcomeBasis(snap);
    const seasons = snap.inputStatus?.careerStats?.detail?.seasons ?? [];
    const vets = vetEntries(snap).length;
    entries.push({
      date, capturedAt: snap.capturedAt, schemaVersion: snap.schemaVersion ?? null,
      targetSeason: snap.targetSeason ?? null, currentSeason: snap.currentSeason ?? null,
      marker: snap.projectionModelFrom ?? null, projectionBasis: snap.projectionBasis ?? null,
      d44: basis.classification, outcomeModel: basis.model,
      offStore: basis.provenance ? Object.entries(basis.provenance).filter(([, v]) => v !== 'data-store').map(([y, v]) => `${y}:${v}`) : null,
      vets, era: cls.era, segment: cls.segment, index: cls.index,
      sEligible: cls.era === 'segment' && cls.index === VETERAN_SEGMENTS.length - 1 && snap.targetSeason === 2026
        && snap.currentSeason === 2025 && (seasons.length ? Math.max(...seasons) : null) === 2025 && snap.projectionBasis === 'league',
    });
  }
  crossCheckClassification(entries);
  const pre = entries.filter(e => e.era === 'pre-kickoff');
  const kDate = pre.length ? pre[pre.length - 1].date : null;
  const segments = VETERAN_SEGMENTS.map((s, i) => {
    const caps = entries.filter(e => e.era === 'segment' && e.index === i);
    return { id: s.id, boundary: s.boundary, first: caps[0]?.date ?? null, last: caps[caps.length - 1]?.date ?? null, n: caps.length, captures: caps };
  });
  return { entries, kDate, kPrevDate: pre.length > 1 ? pre[pre.length - 2].date : null, segments };
}

// ─── Position / crosswalk helpers ─────────────────────────────────────────────

/** K-style position source: the capture's depth charts → raw/-players-nfl.json → nflverse/roster/2026.json. */
function makePositionOf(snapshot, ctx) {
  const chart = chartPositions(snapshot);
  const league = typeof ctx.load.loadPositionOf === 'function' ? (ctx.shared.leaguePos ??= ctx.load.loadPositionOf()) : null;
  const roster = (ctx.shared.roster ??= ctx.load.loadRoster?.(2026)?.players ?? {});
  const SKILL = new Set(POSITIONS);
  const src = { chart: 0, league: 0, roster: 0, none: 0 };
  const cache = new Map();
  const f = (id) => {
    id = String(id);
    if (cache.has(id)) return cache.get(id);
    let pos = chart.get(id) ?? null, from = 'chart';
    if (pos == null) { const l = league?.(id); if (SKILL.has(l)) { pos = l; from = 'league'; } }
    if (pos == null) { const r = roster[id]?.position; if (SKILL.has(r)) { pos = r; from = 'roster'; } }
    cache.set(id, pos);
    if (pos == null) src.none++; else src[from]++;
    return pos;
  };
  f.src = src;
  return f;
}

function crosswalkHelpers(ctx) {
  const ids = ctx.load.loadPlayerIds()?.bySleeper ?? {};
  return {
    birthdateOf: (id) => ids[id]?.birthdate ?? null,
    drafted2026Of: (id) => (ids[id] ? ids[id].draftYear === 2026 : null),
  };
}

// ─── Row builders ─────────────────────────────────────────────────────────────

function outcomeOf(outcomes, id) {
  const o = outcomes.get(String(id));
  return { a: o?.actualTotalPts ?? 0, g: o?.actualGames ?? 0 };
}

/** Segment rows of a capture as captured (K, L0…Lm). */
function capturedRows(snapshot, positionOf, outcomes) {
  return vetEntries(snapshot).map(e => ({
    id: e.id, pos: positionOf(e.id) ?? 'UNK', p: e.proj.projectedPPG, T: e.proj.projectedTotalPts ?? 0,
    G: e.proj.projectedGames ?? 0, chain: isChainFactors(e.f), ...outcomeOf(outcomes, e.id),
  }));
}

function replayRows(replay, outcomes) {
  return replay.rows.filter(r => r.kind !== 'dropped').map(r => ({ ...r, ...outcomeOf(outcomes, r.id) }));
}

function compositeSRows(replay, outcomes) {
  return replay.rows.filter(r => r.kind === 'replayed').map(r => ({
    id: r.id, pos: r.pos, p: r.sRow.p, T: r.sRow.T ?? 0, G: r.sRow.G ?? 0, chain: r.sRow.chain, ...outcomeOf(outcomes, r.id),
  }));
}

// ─── Cell reports with CIs ────────────────────────────────────────────────────

function cellCI(rows, metric, pos) {
  return bootCI(rows, (sample) => metricOf(sample, metric, pos), BOOT);
}

function diffCI(pairs, metric, pos) {
  return bootCI(pairs, (sample) => {
    const x = metricOf(sample.map(c => c.x), metric, pos);
    const y = metricOf(sample.map(c => c.y), metric, pos);
    return x == null || y == null ? null : x - y;
  }, BOOT);
}

/** value + CI + label per metric for one segment's rows. */
function segmentReport(rows, { ci = true } = {}) {
  const st = segmentStats(rows);
  const out = {};
  for (const cell of [...POSITIONS, 'pooled']) {
    const stats = cell === 'pooled' ? st.pooled : st.byPos[cell];
    const pos = cell === 'pooled' ? null : cell;
    const o = { rows: stats.rows, nPpg: stats.nPpg, nMed: stats.nMed, R_games: stats.R_games, maePPG: stats.maePPG, biasPPG: stats.biasPPG };
    for (const metric of ['R_ppg', 'R_tot', 'Med_ppg']) {
      const ok = sampleOk(stats, metric);
      const value = stats[metric];
      const interval = ci && ok ? cellCI(rows, metric, pos) : null;
      const label = !ok ? 'insufficient'
        : metric === 'Med_ppg' ? (pos ? historyLabel(interval, HISTORY_MEDIANS[pos]) : null)
        : calibrationLabel(interval);
      o[metric] = { value, ci: interval, label };
    }
    out[cell] = o;
  }
  return { cells: out, meanOfPositions: st.meanOfPositions, unk: st.unk };
}

function pairsOf(xRows, yRows) {
  const y = new Map(yRows.map(r => [r.id, r]));
  return xRows.filter(r => y.has(r.id)).map(r => ({ x: r, y: y.get(r.id) }));
}

function diffReport(xRows, yRows) {
  const pairs = pairsOf(xRows, yRows);
  const out = { n: pairs.length, cells: {} };
  for (const cell of [...POSITIONS, 'pooled']) {
    const pos = cell === 'pooled' ? null : cell;
    out.cells[cell] = {};
    for (const metric of ['R_ppg', 'R_tot']) {
      const x = metricOf(pairs.map(c => c.x), metric, pos), y = metricOf(pairs.map(c => c.y), metric, pos);
      const n = pairs.filter(c => pos == null || c.x.pos === pos).length;
      const ci = n >= MIN_CELL && x != null && y != null ? diffCI(pairs, metric, pos) : null;
      out.cells[cell][metric] = { diff: x != null && y != null ? x - y : null, ci, label: ci ? agreeLabel(ci) : 'insufficient' };
    }
  }
  return out;
}

function heterogeneity(rows) {
  const out = { cells: {}, permutation: {} };
  for (const metric of ['R_ppg', 'R_tot']) {
    out.cells[metric] = {};
    const pooled = metricOf(rows, metric, null);
    for (const pos of POSITIONS) {
      const v = metricOf(rows, metric, pos);
      const n = rows.filter(r => r.pos === pos).length;
      const ci = n >= MIN_CELL ? bootCI(rows, (sample) => {
        const a = metricOf(sample, metric, pos), b = metricOf(sample, metric, null);
        return a == null || b == null ? null : a - b;
      }, BOOT) : null;
      out.cells[metric][pos] = { diff: v != null && pooled != null ? v - pooled : null, ci, label: ci ? pooledDiffLabel(ci) : 'insufficient' };
    }
    const perm = permutationTest(rows, metric);
    out.permutation[metric] = { ...perm, label: perm.p != null && perm.p < 0.05 ? 'positions-differ' : 'positions-not-distinguished' };
  }
  return out;
}

// ─── Markdown helpers ─────────────────────────────────────────────────────────

function cellStr(c) {
  if (!c || c.value == null) return 'n/a';
  return `${fmt(c.value)} ${fmtCI(c.ci)} ${c.label ?? ''}`.trim();
}

function headlineTable(R, K, diff, labels) {
  const lines = [];
  lines.push('| cell | R_ppg R | R_ppg K | R_ppg R−K | R_tot R | R_tot K | R_tot R−K |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const cell of [...POSITIONS, 'pooled']) {
    const r = R.cells[cell], k = K.cells[cell], d = diff.cells[cell];
    const ds = (x) => (x.diff == null ? 'n/a' : `${fmt(x.diff)} ${fmtCI(x.ci)} ${x.label}`);
    lines.push(`| ${cell} | ${cellStr(r.R_ppg)} | ${cellStr(k.R_ppg)} | ${ds(d.R_ppg)} | ${cellStr(r.R_tot)} | ${cellStr(k.R_tot)} | ${ds(d.R_tot)} |`);
  }
  lines.push(`| mean of 4 positions | ${fmt(R.meanOfPositions.R_ppg)} | ${fmt(K.meanOfPositions.R_ppg)} | | ${fmt(R.meanOfPositions.R_tot)} | ${fmt(K.meanOfPositions.R_tot)} | |`);
  lines.push('');
  lines.push(`R label: ${labels.R}`);
  lines.push(`K label: ${labels.K}`);
  return lines;
}

// ─── Headline decision (§5.2 / §5.5) ──────────────────────────────────────────

export const K_HEADLINE_LABEL = 'September model — not the shipping model; model changes since are unmeasured';
export const M10_CAVEAT = 'mechanics of the newest model version unverified';

/**
 * Pure headline decision. R is the headline iff G1, G2, G3 and G-MECH all pass; otherwise K is, and R is labelled
 * "replay failed gate X — not headline". A skipped M10 keeps R but adds the fixed caveat. G5 failing drops the veteran
 * backup/chain QB rows from R (counted by replayR) and G6 failing keeps S's ageDelta (birthday count reported by replayR);
 * neither changes the headline — they are returned as `degrade` flags for the replay.
 * @param {{ g1, g2, g3, gMech, m10?: {skipped?: boolean}, g5, g6 }} gates  each `{ pass }`
 * @returns {{ headline: 'R'|'K', label: string, labels: { R: string, K: string }, gateFail: string[],
 *             degrade: { useAgeTable: boolean, dropQbBackups: boolean } }}
 */
export function decideHeadline({ g1, g2, g3, gMech, m10 = null, g5, g6 }) {
  const gateFail = [];
  if (!g1.pass) gateFail.push('G1');
  if (!g2.pass) gateFail.push('G2');
  if (!g3.pass) gateFail.push('G3');
  if (!gMech.pass) gateFail.push('G-MECH');
  const rHeadline = gateFail.length === 0;
  const m10Skipped = !!(m10?.skipped ?? gMech.m10Skipped);
  const caveat = rHeadline && m10Skipped ? ` — ${M10_CAVEAT}` : '';
  const labels = {
    R: rHeadline ? `replay of the shipping model on pre-kickoff inputs — HEADLINE, clean${caveat}` : `replay failed gate ${gateFail.join(', ')} — not headline`,
    K: rHeadline ? 'September model on pre-kickoff inputs — clean, not the shipping model' : `${K_HEADLINE_LABEL} — HEADLINE`,
  };
  return {
    headline: rHeadline ? 'R' : 'K',
    label: rHeadline ? labels.R : K_HEADLINE_LABEL,
    labels, gateFail,
    degrade: { useAgeTable: !!g6.pass, dropQbBackups: !g5.pass },
  };
}

// ─── Steps ────────────────────────────────────────────────────────────────────

async function stepSeasonGate(ctx) {
  const schedule = ctx.load.loadSchedule(2026);
  const totals = ctx.totals(2026);
  const manifest = ctx.load.loadManifest();
  if (!schedule || !totals) throw Object.assign(new Error('G-SEASON: schedule/2026.json or season-totals/2026.json missing'), { hardStop: true });
  const g = evaluateSeasonGate({ schedule, totals, manifest });
  ctx.shared.seasonGate = g;
  const lines = [];
  if (ctx.rehearse) {
    ctx.stamp = `REHEARSAL — partial season (weeks 1–${g.weeksComplete})`;
    lines.push(`**${ctx.stamp}** — G-SEASON bypassed (${g.pass ? 'would pass' : 'would FAIL'}); nothing is written.`);
  } else if (!g.pass) {
    lines.push('**G-SEASON FAILED — hard stop, no writes.**');
  } else lines.push('G-SEASON passed.');
  for (const c of g.checks) lines.push(`- (${c.id}) ${c.pass ? 'pass' : 'FAIL'} — ${c.detail}`);
  const section = { id: 'season-gate', title: 'Season gate (G-SEASON)', placement: 'top', md: lines.join('\n'), data: g };
  if (!ctx.rehearse && !g.pass) throw Object.assign(new Error(`G-SEASON failed: ${g.checks.filter(c => !c.pass).map(c => `(${c.id}) ${c.detail}`).join('; ')}`), { hardStop: true, section });
  return { section, artifacts: [] };
}

async function stepInventory(ctx) {
  const inv = ctx.inventory();
  const lines = [];
  lines.push(`Kickoff pin \`${KICKOFF_2026_UTC}\`; K = \`${inv.kDate}\`${inv.kPrevDate ? ` (K′ for sensitivity = \`${inv.kPrevDate}\`)` : ''}.`);
  lines.push('');
  lines.push('| segment | boundary | first | last | captures |');
  lines.push('|---|---|---|---|---|');
  for (const s of inv.segments) lines.push(`| ${s.id} | ${s.boundary} | ${s.first ?? '—'} | ${s.last ?? '—'} | ${s.n} |`);
  const by = (f) => inv.entries.reduce((m, e) => { const k = f(e); m[k] = (m[k] ?? 0) + 1; return m; }, {});
  lines.push('');
  lines.push(`Era counts: ${JSON.stringify(by(e => e.era))}. D-44 classification counts: ${JSON.stringify(by(e => e.d44))}.`);
  const off = inv.entries.filter(e => e.offStore && e.offStore.length);
  lines.push(off.length ? `Non-data-store provenance: ${off.map(e => `${e.date} (${e.offStore.join(', ')})`).join('; ')}.` : 'No capture records a non-data-store provenance.');
  lines.push(`Inventory only (not graded): ${inv.entries.filter(e => e.era !== 'segment' && e.date !== inv.kDate).length} captures (v1/v2 and summer, pre-kickoff).`);
  return { section: { id: 'inventory', title: 'Capture inventory', placement: 'appendix', md: lines.join('\n'), data: { kDate: inv.kDate, segments: inv.segments.map(({ captures, ...s }) => s), entries: inv.entries } }, artifacts: [] };
}

async function stepD44(ctx) {
  const inv = ctx.inventory();
  const targets = [{ role: 'K', date: inv.kDate }, ...inv.segments.filter(s => s.first).map(s => ({ role: s.id, date: s.first }))];
  const lines = ['| role | capture | outcomes | classification | projected | graded | dnp | MAE PPG | bias PPG |', '|---|---|---|---|---|---|---|---|---|'];
  const data = [];
  const artifacts = [];
  for (const t of targets) {
    const report = gradeSnapshot({
      snapshotDate: t.date, write: ctx.write && !ctx.rehearse, quiet: true, load: ctx.load,
    });
    if (!report) { lines.push(`| ${t.role} | ${t.date} | skipped | — | — | — | — | — | — |`); data.push({ ...t, skipped: true }); continue; }
    lines.push(`| ${t.role} | ${t.date} | ${report.meta.outcomeModel} | ${report.meta.basisClassification} | ${report.counts.projected} | ${report.counts.graded} | ${report.counts.dnp} | ${fmt(report.overall.maePPG, 2)} | ${fmt(report.overall.biasPPG, 2)} |`);
    data.push({ ...t, outcomeModel: report.meta.outcomeModel, classification: report.meta.basisClassification, counts: report.counts, overall: report.overall });
    if (ctx.write && !ctx.rehearse) artifacts.push({ path: `grading/${t.date}.json`, registered: true });
  }
  return { section: { id: 'd44', title: 'D-44 snapshot grades (K and the first capture of each segment)', placement: 'appendix', md: lines.join('\n'), data }, artifacts };
}

async function stepVetCalibration(ctx) {
  const inv = ctx.inventory();
  const stamp = stampOf(ctx);
  const K = ctx.snapshot(inv.kDate);

  // K guard (§5.1)
  const kVets = vetEntries(K);
  const guardBad = [];
  if (K.projectionBasis !== undefined) guardBad.push('K envelope carries projectionBasis');
  if (kVets.some(e => e.f.regressionUpsideBasis !== undefined)) guardBad.push('a K veteran row carries regressionUpsideBasis');
  if (kVets.some(e => e.f.qbTakeoverBasis !== undefined)) guardBad.push('a K veteran row carries qbTakeoverBasis');
  if (guardBad.length) throw new Error(`K guard failed (${inv.kDate}): ${guardBad.join('; ')}. ${'anchor policy stale — pin boundary N in grading/anchor-policy.md\'s JSON block and VETERAN_SEGMENTS first'}`);

  const lastSeg = inv.segments[inv.segments.length - 1];
  if (!lastSeg.first) throw new Error('no capture classifies to the last veteran segment');
  const sRef = ctx.snapshot(lastSeg.first);
  const scoring = sRef.scoringSettings;
  const positionOfK = makePositionOf(K, ctx);
  const { birthdateOf, drafted2026Of } = crosswalkHelpers(ctx);
  const recentStarterOf = makeRecentStarterOf((y) => ctx.totals(y));
  const constants = ctx.load.loadQbConstants();
  const qbModels = pinnedQbChainModels(constants);
  const priorOf = makePriorOf(ctx.totals(2025), scoring);

  // ── Boundary-equality guard (§5.2) ──
  const guardPairs = [];
  const firsts = inv.segments.filter(s => s.first);
  if (firsts.length) guardPairs.push({ from: inv.kDate, to: firsts[0].first, label: `K→${firsts[0].id}` });
  for (let i = 0; i + 1 < firsts.length; i++) guardPairs.push({ from: firsts[i].last, to: firsts[i + 1].first, label: `${firsts[i].id}→${firsts[i + 1].id}` });
  const guardResults = guardPairs.map(g => ({ ...g, ...boundaryGuard(ctx.snapshot(g.from), ctx.snapshot(g.to)) }));
  const guardFail = guardResults.filter(g => !g.pass);
  const guardTable = () => {
    const t = ['**Boundary-equality guard** (a) cohort factors equal (b) teamFactor formula (c) qbQualityFactor formula', '', '| pair | common vets | (a) diffs | (b) bad/rows | (c) bad/rows | result |', '|---|---|---|---|---|---|'];
    for (const g of guardResults) t.push(`| ${g.label} \`${g.from}\`→\`${g.to}\` | ${g.a.common} | ${g.a.diffs} | ${g.b.bad}/${g.b.rows} | ${g.c.bad}/${g.c.rows} | ${g.pass ? 'PASS' : 'FAIL'} |`);
    return t;
  };
  if (guardFail.length) {
    // §5.2: stop. Emit the inventory, the classification and the guard section; no R/K headline table or label.
    const inventoryMd = (await stepInventory(ctx)).section.md;
    const failed = guardFail.map(g => `${g.label} [${[g.a.diffs ? `(a) ${g.a.diffs}/${g.a.common}` : null, g.b.bad ? `(b) ${g.b.bad}/${g.b.rows}` : null, g.c.bad ? `(c) ${g.c.bad}/${g.c.rows}` : null].filter(Boolean).join(', ')}]`).join('; ');
    const L = [];
    if (stamp) L.push(`**${stamp}**`, '');
    L.push(`**STOPPED — boundary-equality guard failed (${failed}); no headline.**`, '');
    L.push('### Capture inventory and classification', '', inventoryMd, '', ...guardTable());
    const section = { id: 'vet-calibration', title: 'Veteran calibration', placement: 'main', md: L.join('\n'), data: { stopped: 'boundary-equality-guard', guardFailed: failed, boundaryGuard: guardResults, k: inv.kDate } };
    throw Object.assign(new Error(`STOPPED — boundary-equality guard failed (${failed}); no headline — January needs a plan decision; nothing is improvised`), { section });
  }

  // ── G-MECH ──
  const mech = [];
  for (const m of MECH_PAIRS) {
    const r = gMechPair(ctx.snapshot(m.a), ctx.snapshot(m.b));
    const exp = m.expected;
    const reproduces = r.rows === exp.rows && r.beyond === exp.beyond && r.maxSteps === exp.steps
      && fmt(r.worstPpg, 4) === exp.ppg.toFixed(4) && fmt(r.worstTot, 4) === exp.tot.toFixed(4);
    mech.push({ id: m.id, a: m.a, b: m.b, segment: m.segment, ...r, reproduces });
  }
  const m10span = selectSpan(lastSeg.captures.map(c => ({ date: c.date, capturedAt: c.capturedAt })), 'm10');
  let m10;
  if (m10span.b) {
    const r = gMechPair(ctx.snapshot(m10span.a.date), ctx.snapshot(m10span.b.date));
    m10 = { id: 'M10', a: m10span.a.date, b: m10span.b.date, segment: LAST_SEGMENT.id, ...r };
  } else m10 = { id: 'M10', a: m10span.a?.date ?? null, b: null, segment: LAST_SEGMENT.id, skipped: true, pass: true };
  const gMech = { pairs: [...mech, m10], pass: [...mech, m10].every(p => p.pass), m10Skipped: !!m10.skipped };

  // ── R replay + per-capture gates on contributing captures ──
  const sCaps = lastSeg.captures.filter(c => inv.entries.find(e => e.date === c.date).sEligible).map(c => ({ date: c.date, load: () => ctx.snapshot(c.date) }));
  const perCapture = [];
  const onCapture = ({ date, snapshot, assigned }) => {
    const chart = chartPositions(snapshot);
    const posOf = (id) => chart.get(id) ?? positionOfK(id) ?? null;
    const g5 = gQbChain(snapshot, { priorOf: makePriorOf(ctx.totals(2025), snapshot.scoringSettings), models: qbModels });
    const g1 = gIdentity(snapshot);
    const g2 = gDepth(snapshot, { positionOf: posOf, recentStarterOf, qbRoleOf: (id) => g5.roles[id]?.role ?? null });
    const g3 = gTables(snapshot, posOf);
    const g6 = gAgeTable(snapshot, { positionOf: posOf, birthdateOf });
    const { roles, ...g5s } = g5;
    perCapture.push({ date, assigned, g1: { rows: g1.rows, max: g1.max, bad: g1.bad, pass: g1.pass }, g2: { rows: g2.rows, mismatches: g2.mismatches, pass: g2.pass },
      g3: { teams: g3.teams, violations: g3.violations, pass: g3.pass }, g5: g5s, g6 });
  };
  const replayArgs = { K, sCaptures: sCaps, positionOfK, birthdateOf, drafted2026Of, recentStarterOf, qbModels, priorOf };
  let replay = replayR({ ...replayArgs, onCapture });
  const g3K = gTables(K, positionOfK);
  const kTeamsCovered = kVets.every(e => g3K.tables.team.has(String(e.p.nfl_team ?? '')));
  const g1 = { pass: perCapture.every(c => c.g1.pass), max: Math.max(0, ...perCapture.map(c => c.g1.max)), captures: perCapture.length };
  const g2 = { pass: perCapture.every(c => c.g2.pass), mismatches: perCapture.reduce((n, c) => n + c.g2.mismatches, 0) };
  const g3 = { pass: g3K.pass && kTeamsCovered && perCapture.every(c => c.g3.pass), kViolations: g3K.violations, kTeamsCovered };
  const g5 = { pass: perCapture.every(c => c.g5.pass), vetMismatch: perCapture.reduce((n, c) => n + c.g5.vetMismatch, 0),
    vetRows: perCapture.reduce((n, c) => n + c.g5.vetRows, 0), rookieMismatch: perCapture.reduce((n, c) => n + c.g5.rookieMismatch, 0), rookieRows: perCapture.reduce((n, c) => n + c.g5.rookieRows, 0) };
  const g6 = { pass: perCapture.every(c => c.g6.pass), min: Math.min(1, ...perCapture.map(c => c.g6.shareInMode ?? 1)) };
  const decision = decideHeadline({ g1, g2, g3, gMech, m10, g5, g6 });
  const { gateFail, labels, degrade } = decision;
  const rHeadline = decision.headline === 'R';
  const degraded = [];
  if (!degrade.useAgeTable || degrade.dropQbBackups) {
    replay = replayR({ ...replayArgs, useAgeTable: degrade.useAgeTable, dropQbBackups: degrade.dropQbBackups });
    if (!degrade.useAgeTable) degraded.push(`G6 failed: S's ageDelta kept everywhere (${replay.counts.ageNoBirthdate} rows without a birthdate)`);
    if (degrade.dropQbBackups) degraded.push(`G5 failed: ${replay.counts.dropped} veteran QB rows with a backup/chain K role dropped from R`);
  }

  // ── Q ──
  const qWithin = (() => {
    const span = selectSpan(lastSeg.captures.map(c => ({ date: c.date, capturedAt: c.capturedAt })), 'q');
    if (!span.b) return { skipped: true, a: span.a?.date ?? null };
    return { a: span.a.date, b: span.b.date, ...qDrift(ctx.snapshot(span.a.date), ctx.snapshot(span.b.date), { birthdateOf }) };
  })();
  const l2 = inv.segments.find(s => s.id === 'L2');
  const qCross = (() => {
    if (!l2?.first || !lastSeg.first) return { skipped: true };
    const r = qDrift(ctx.snapshot(l2.first), ctx.snapshot(lastSeg.first), { birthdateOf });
    // share of P whose S(i) is absent or ≠ B; denominator is |P|
    const notB = replay.rows.filter(x => !(x.kind === 'replayed' && x.sDate === lastSeg.first)).length;
    return { a: l2.first, b: lastSeg.first, ...r, sNotB: { n: notB, of: replay.rows.length } };
  })();

  // ── Outcomes and datasets ──
  const totals26 = ctx.totals(2026);
  const leaguePos = resolvePositionOf(sRef, ctx.load).positionOf;
  const leagueOut = buildLeagueOutcomes(totals26, scoring, leaguePos).outcomes;
  const halfOut = buildHalfPprOutcomes(totals26);
  const rowsR = replayRows(replay, leagueOut);
  const rowsK = capturedRows(K, positionOfK, halfOut);
  const rowsS = compositeSRows(replay, leagueOut);
  const replayedOnly = rowsR.filter(r => r.kind === 'replayed');

  const repR = segmentReport(rowsR);
  const repK = segmentReport(rowsK);
  const repRrep = segmentReport(replayedOnly);
  const repS = segmentReport(rowsS);
  const dRK = diffReport(rowsR, rowsK);

  const segRows = {};
  const segReports = {};
  const segDiffs = {};
  for (const s of inv.segments) {
    if (!s.first) continue;
    const snap = ctx.snapshot(s.first);
    const basis = resolveOutcomeBasis(snap);
    if (basis.model == null) { segReports[s.id] = { skipped: basis.classification }; continue; }
    const pos = makePositionOf(snap, ctx);
    const out = basis.model === 'league' ? buildLeagueOutcomes(totals26, snap.scoringSettings, resolvePositionOf(snap, ctx.load).positionOf).outcomes : halfOut;
    segRows[s.id] = capturedRows(snap, pos, out);
    segReports[s.id] = { date: s.first, model: basis.model, ...segmentReport(segRows[s.id]) };
    segDiffs[s.id] = diffReport(segRows[s.id], rowsR);
  }

  // ── Sensitivity (report-only) ──
  const sens = {};
  const pointOf = (rows) => { const st = segmentStats(rows); return Object.fromEntries([...POSITIONS, 'pooled'].map(c => { const s = c === 'pooled' ? st.pooled : st.byPos[c]; return [c, { R_ppg: s.R_ppg, R_tot: s.R_tot }]; })); };
  sens['S teamFactor table'] = pointOf(replayRows(replayR({ ...replayArgs, teamTableSource: 'S', useAgeTable: degrade.useAgeTable, dropQbBackups: degrade.dropQbBackups }), leagueOut));
  sens["S's values for every K-sourced factor"] = pointOf(replayRows(replayR({ ...replayArgs, kSourced: false, useAgeTable: degrade.useAgeTable, dropQbBackups: degrade.dropQbBackups }), leagueOut));
  if (inv.kPrevDate) {
    const Kp = ctx.snapshot(inv.kPrevDate);
    const posKp = makePositionOf(Kp, ctx);
    sens[`K′ = ${inv.kPrevDate}`] = pointOf(replayRows(replayR({ ...replayArgs, K: Kp, positionOfK: posKp, useAgeTable: degrade.useAgeTable, dropQbBackups: degrade.dropQbBackups }), leagueOut));
  }
  sens['R-replayed (no imputed rows)'] = pointOf(replayedOnly);

  // ── Headline and heterogeneity ──
  const headlineRows = rHeadline ? rowsR : rowsK;
  const het = heterogeneity(headlineRows);

  // ── Markdown ──
  const L = [];
  if (stamp) { L.push(`**${stamp}**`, ''); }
  L.push('### Headline — veteran calibration (realised ÷ projected; report-only, no constant proposed)', '');
  L.push(...headlineTable(repR, repK, dRK, labels), '');
  L.push(`P = ${replay.counts.p} K veterans: replayed ${replay.counts.replayed}, imputed ${replay.counts.imputed}, dropped ${replay.counts.dropped}; R-replayed shown below. Position source for K: ${JSON.stringify(positionOfK.src)}.`);
  for (const d of degraded) L.push(`- ${d}`);
  L.push('');
  L.push('**Drift Q — reported, not deciding** (Q_ppg / Q_tot per position; share of live rows beyond one display step)', '');
  const qLine = (name, q) => {
    if (q.skipped) return [`- ${name}: skipped (no second capture in the last segment before 2027-01-01)`];
    const ls = [`- ${name}: A \`${q.a}\` → B \`${q.b}\`, ${q.rows} rows (${q.excludedChain} chain excluded), ${q.off}/${q.rows} live rows off by > 0.1 vs p_A (vs captured p_B: ${q.offB}/${q.rows})`];
    for (const p of POSITIONS) if (q.byPos[p]) ls.push(`  - ${p}: Q_ppg ${fmt(q.byPos[p].Q_ppg, 4)}, Q_tot ${fmt(q.byPos[p].Q_tot, 4)} (off vs p_A ${q.byPos[p].off}/${q.byPos[p].rows}; vs p_B ${q.byPos[p].offB}/${q.byPos[p].rows})`);
    if (q.sNotB) ls.push(`  - share of P whose S(i) is not B: ${q.sNotB.n}/${q.sNotB.of}`);
    return ls;
  };
  L.push(...qLine('Q-within ("drift")', qWithin), ...qLine('Q-cross ("drift plus cross-boundary mechanics")', qCross), '');

  L.push('### Gates', '');
  L.push(`G1 identity (B(f_S) vs projectedPPG ≤ 0.15): ${g1.pass ? 'PASS' : 'FAIL'} — max ${fmt(g1.max, 3)} over ${g1.captures} contributing captures`);
  L.push(`G2 depth: ${g2.pass ? 'PASS' : 'FAIL'} — ${g2.mismatches} mismatches`);
  L.push(`G3 tables: ${g3.pass ? 'PASS' : 'FAIL'} — K violations ${g3.kViolations}, K teams covered ${kTeamsCovered}`);
  L.push('', '**G-MECH**', '', '| pair | segment | rows | beyond rounding | max steps | worst \\|PPG ratio−1\\| | worst \\|total ratio−1\\| | UNK | chain excl. | reproduces §5.4 | result |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const p of gMech.pairs) {
    if (p.skipped) { L.push(`| ${p.id} \`${p.a ?? '—'}\`→— | ${p.segment} | — | — | — | — | — | — | — | — | skipped |`); continue; }
    L.push(`| ${p.id} \`${p.a}\`→\`${p.b}\` | ${p.segment} | ${p.rows} | ${p.beyond} | ${p.maxSteps} | ${fmt(p.worstPpg, 4)} | ${fmt(p.worstTot, 4)} | ${p.unk} | ${p.excludedChain} | ${p.id === 'M10' ? 'n/a' : p.reproduces ? 'yes' : 'NO'} | ${p.pass ? 'PASS' : 'FAIL'} |`);
  }
  L.push('', `G-MECH: ${gMech.pass ? 'PASS' : 'FAIL'}${gMech.m10Skipped ? ' (M10 skipped — mechanics of the newest model version unverified)' : ''}`);
  L.push('', `G5 QB chain (veteran rows): ${g5.pass ? 'PASS' : 'FAIL'} — ${g5.vetMismatch}/${g5.vetRows} mismatches; rookie-path (reported, not gated) ${g5.rookieMismatch}/${g5.rookieRows}`);
  L.push(`G6 age table: ${g6.pass ? 'PASS' : 'FAIL'} — min share-in-mode ${fmt(g6.min, 4)} (≥ 0.98)`);
  L.push('', ...guardTable(), '');

  L.push('### Segments (each captured veteran row set; leaky L0…L6 and composite S are NOT clean)', '');
  const segLine = (id, rep, extra) => {
    if (rep.skipped) return `| ${id} | skipped (${rep.skipped}) | | | |`;
    const c = (cell, metric) => cellStr(rep.cells[cell][metric]);
    return `| ${id}${extra ?? ''} | ${c('QB', 'R_ppg')} | ${c('RB', 'R_ppg')} | ${c('WR', 'R_ppg')} | ${c('TE', 'R_ppg')} | ${c('pooled', 'R_ppg')} | ${c('pooled', 'R_tot')} |`;
  };
  L.push('| segment | R_ppg QB | RB | WR | TE | pooled | R_tot pooled |', '|---|---|---|---|---|---|---|');
  L.push(segLine('R (replay)', repR), segLine('R-replayed', repRrep), segLine('K', repK));
  for (const s of inv.segments) if (segReports[s.id]) L.push(segLine(s.id, segReports[s.id], segReports[s.id].date ? ` \`${segReports[s.id].date}\` leaky` : ''));
  L.push(segLine('S (composite) leaky', repS), '');
  L.push('Segment − R on the common cohort (pooled R_ppg / R_tot; label agrees|differs):', '');
  for (const s of inv.segments) {
    const d = segDiffs[s.id];
    if (!d) continue;
    const c = d.cells.pooled;
    L.push(`- ${s.id}: ${fmt(c.R_ppg.diff)} ${fmtCI(c.R_ppg.ci)} ${c.R_ppg.label}; ${fmt(c.R_tot.diff)} ${fmtCI(c.R_tot.ci)} ${c.R_tot.label} (n ${d.n})`);
  }
  L.push('', '**Sensitivity (report-only)** — R_ppg / R_tot by cell', '');
  for (const [name, v] of Object.entries(sens)) L.push(`- ${name}: ` + [...POSITIONS, 'pooled'].map(c => `${c} ${fmt(v[c].R_ppg)}/${fmt(v[c].R_tot)}`).join(', '));
  L.push('', `### Heterogeneity (${rHeadline ? 'R' : 'K'} cohort)`, '');
  for (const metric of ['R_ppg', 'R_tot']) {
    L.push(`- ${metric}: ` + POSITIONS.map(pos => { const c = het.cells[metric][pos]; return `${pos} ${fmt(c.diff)} ${fmtCI(c.ci)} ${c.label}`; }).join('; '));
    const pm = het.permutation[metric];
    L.push(`  - permutation (${pm.permutations}, seed ${BOOT.seed}): statistic ${fmt(pm.observed, 4)}, p = ${fmt(pm.p, 4)} → ${pm.label}`);
  }

  const data = {
    stamp, headline: rHeadline ? 'R' : 'K', labels, gateFail, degraded,
    replay: { counts: replay.counts },
    reports: { R: repR, K: repK, RReplayed: repRrep, S: repS, segments: segReports },
    diffs: { RminusK: dRK, segmentsMinusR: segDiffs },
    heterogeneity: het,
    gates: { g1, g2, g3: { pass: g3.pass, kViolations: g3.kViolations, kTeamsCovered }, g5, g6, gMech, boundaryGuard: guardResults },
    perCapture, q: { within: qWithin, cross: qCross }, sensitivity: sens,
    k: inv.kDate, kickoff: KICKOFF_2026_UTC,
  };
  const section = { id: 'vet-calibration', title: 'Veteran calibration', placement: 'main', md: L.join('\n'), data };

  // ── Hand-off to Slice B ──
  ctx.shared.K = { date: inv.kDate, capture: K };
  ctx.shared.P = Object.fromEntries(replay.rows.map(r => [r.id, r.pos]));
  ctx.shared.classification = Object.fromEntries(inv.entries.map(e => [e.date, e.era === 'segment' ? e.segment : e.era]));
  ctx.shared.S = Object.fromEntries(replay.rows.filter(r => r.kind === 'replayed').map(r => [r.id, r.sDate]));
  // R: replayed rows carry the replayed values; imputed rows carry K's captured values with imputed: true (ρ is applied by materializeRows); dropped rows are absent
  ctx.shared.replay = {
    R: Object.fromEntries(replay.rows.filter(r => r.kind !== 'dropped').map(r => (r.kind === 'replayed'
      ? [r.id, { p: r.p, G: r.G, T: r.T, imputed: false }]
      : [r.id, { p: r.pK, G: r.GK, T: r.TK, imputed: true }]))),
    K: Object.fromEntries(kVets.map(e => [e.id, { p: e.proj.projectedPPG, G: e.proj.projectedGames ?? 0, T: e.proj.projectedTotalPts ?? 0 }])),
  };
  return { section, artifacts: [] };
}

// ─── Slice B (plan january-grading-run-b) ─────────────────────────────────────
//
// No-throw rule (§10a): a B step must not block Slice A's aggregate write. In the real `--write` run (ctx.write true and
// not rehearsing) a failure degrades to a `computed: false` section; in every other mode — `--rehearse` with or without
// `--write`, a plain run, every test — the error is re-thrown so A's per-step isolation fails the step and the bug surfaces now.

const B_TITLES = {
  ros: 'Rest-of-season grade by checkpoint (D-52 inSeason.ros)',
  'games-l6': 'L6 games check (D-52)',
  override: 'In-season healthy override (D-52)',
  rookie: 'Rookie class — D-16 ceiling and D-75 total factor',
  d60: 'D-60 satLonger recount (not counted)',
  listed: 'Listed, not built',
};

const errMsg = (e) => (e instanceof Error ? e.message : String(e));
const canDegrade = (ctx) => ctx.write === true && ctx.rehearse !== true;

function degradeOrThrow(ctx, stepId, e) {
  if (!canDegrade(ctx)) throw e;
  const stamp = stampOf(ctx);
  return {
    section: {
      id: stepId, title: B_TITLES[stepId], placement: 'main',
      md: `**⚠ NOT COMPUTED — ${stepId}: ${errMsg(e)}**` + (stamp ? `\n\n**${stamp}**` : ''),
      data: { computed: false, error: errMsg(e) },
    },
    artifacts: [],
  };
}

/** Part-level isolation inside a step: { value } on success; { failed } (degraded) or a re-throw. */
async function part(ctx, label, fn) {
  try { return { value: await fn() }; } catch (e) {
    if (!canDegrade(ctx)) throw e;
    const msg = errMsg(e);
    return { failed: { computed: false, error: msg, banner: `**⚠ ${label} not computed — ${msg}**` } };
  }
}

const bSection = (ctx, id, md, data, artifacts = []) => {
  const stamp = stampOf(ctx);
  return { section: { id, title: B_TITLES[id], placement: 'main', md: (stamp ? `**${stamp}**\n\n` : '') + md, data }, artifacts };
};

/** Every inventory calendar checkpoint with its picked capture: [{ cal, pick }], c = 1…17. */
function checkpointPicks(ctx) {
  const entries = ctx.inventory().entries;
  return rosCalendar().map(cal => ({ cal, pick: pickCheckpointCapture(cal, entries) }));
}

const sumBy = (o) => Object.values(o).reduce((a, v) => a + v, 0);

// ── ros ───────────────────────────────────────────────────────────────────────

const rosRowMd = (label, cell) => {
  if (!cell) return `| ${label} | — |`;
  const d = (v) => `${fmt(v.mean)} ${fmtCI(v.ci)} n=${v.n} ${v.label}`;
  return `| ${label} | ${cell.n} | ${cell.label} | ${fmt(cell.mae)} | ${fmt(cell.bias)} | ${d(cell.vsPrior)} | ${d(cell.vsObserved)} |`;
};

async function stepRos(ctx) {
  try {
    const inv = ctx.inventory();
    const firstLast = inv.segments.at(-1)?.first;
    if (firstLast == null) throw new Error('no capture in the last veteran segment');
    const sRef = ctx.snapshot(firstLast);
    const totals = ctx.totals(2026);
    if (!totals) throw new Error('nfl/season-totals/2026.json missing');
    const { positionOf: sPositionOf } = resolvePositionOf(sRef, ctx.load);
    const rescored = rescoreSeasonRowsLeague(totals, sRef.scoringSettings, sPositionOf);
    const scoredRows = Object.entries(rescored).filter(([id]) => !id.startsWith('TEAM_'));
    const scaled = scoredRows.filter(([, r]) => r?.weeklyPointsMethod === 'scaled').length;
    const schedule = ctx.load.loadSchedule(2026) ?? null;

    const L = [];
    L.push('League points per week from `rescoreSeasonRowsLeague` (D-71 → `exact`); ' + `${scaled} of ${scoredRows.length} 2026 rows are \`scaled\`.`);
    L.push('Caveat: on live-prior rows (`priorSource: live`) `ros.prior` is the current, leaky projection, so Δ vs prior is not out-of-sample.', '');
    const checkpoints = [];
    for (const { cal, pick } of checkpointPicks(ctx)) {
      const rec = { c: cal.c, thursday: cal.thursday, closeUtc: cal.closeUtc, windowEndUtc: cal.windowEndUtc, status: pick.status, date: pick.date };
      if (pick.date == null) {
        L.push(`**c=${cal.c}** (closes ${cal.closeUtc}) — ${pick.status}`, '');
        checkpoints.push(rec);
        continue;
      }
      const snap = ctx.snapshot(pick.date);
      const positionOf = makePositionOf(snap, ctx);
      const built = buildRosRows(snap, { rescored, schedule, positionOf, c: cal.c, teamOf: (id, p) => normalizeTeamForSchedule(p?.nfl_team) });
      rec.nConsistency = built.nConsistency;
      rec.counts = built.counts;
      if (built.nConsistency.share < 0.99) {
        rec.status = 'n-inconsistent';
        L.push(`**c=${cal.c}** \`${pick.date}\` (${pick.status}) — n-inconsistent: ${fmt(built.nConsistency.share * 100, 1)}% of ${built.nConsistency.n} rows have their n-th P week ≤ c+1; excluded`, '');
        checkpoints.push(rec);
        continue;
      }
      rec.perGame = rosCheckpointReport(built.perGame);
      rec.start = rosCheckpointReport(built.start);
      L.push(`**c=${cal.c}** \`${pick.date}\` (${pick.status}) — n-consistency ${fmt(built.nConsistency.share * 100, 1)}% of ${built.nConsistency.n}; excluded ${JSON.stringify(built.counts)}`, '');
      L.push('| cell | players | cell label | MAE | bias | Δ abs-err vs prior | Δ abs-err vs observed-to-date |', '|---|---|---|---|---|---|---|');
      for (const pos of POSITIONS) L.push(rosRowMd(`(a) ${pos}`, rec.perGame[pos]));
      L.push(rosRowMd('(b) QB start rows', rec.start.QB));
      for (const [name, rep] of [['(a)', rec.perGame], ['(b)', rec.start]]) {
        if (rep.split.degenerate) L.push('', `${name} ${rep.split.line}`);
        else {
          L.push('', `${name} frozen/live split:`, '', '| cell | players | cell label | MAE | bias | Δ abs-err vs prior | Δ abs-err vs observed-to-date |', '|---|---|---|---|---|---|---|');
          for (const g of ['frozen', 'live']) for (const pos of POSITIONS) L.push(rosRowMd(`${g} ${pos}`, rep.split[g][pos]));
        }
      }
      L.push('');
      checkpoints.push(rec);
    }
    return bSection(ctx, 'ros', L.join('\n'), { stamp: stampOf(ctx), scaledRows: scaled, scoredRows: scoredRows.length, checkpoints });
  } catch (e) { return degradeOrThrow(ctx, 'ros', e); }
}

// ── games-l6 / override share the L6 rows ─────────────────────────────────────

const L6_STATES = new Set(['short', 'none', 'qual']);

/** §6.2 rows: P's veterans through S(i) (leak-free). → { rows, excluded } */
function l6RowsOf(ctx) {
  const { P, S, replay } = ctx.shared;
  const totals26 = ctx.totals(2026);
  const crosswalkPositionOf = {};
  for (const e of Object.values(ctx.load.loadPlayerIds()?.ids ?? {})) if (e?.sleeperId && e?.position) crosswalkPositionOf[e.sleeperId] = e.position;
  const rankIndex = buildRankIndex({ 2023: ctx.totals(2023), 2024: ctx.totals(2024), 2025: ctx.totals(2025) }, crosswalkPositionOf, [2023, 2024, 2025], POSITIONS);
  const excluded = { imputed: 0, dropped: 0, missingField: 0, rel3NoPosition: 0 };
  const byDate = new Map();
  for (const id of Object.keys(P)) {
    if (!S[id]) { if (replay?.R?.[id]?.imputed === true) excluded.imputed++; else excluded.dropped++; continue; }
    if (!byDate.has(S[id])) byDate.set(S[id], []);
    byDate.get(S[id]).push(id);
  }
  const rows = [];
  for (const [date, ids] of [...byDate.entries()].sort()) {
    const snap = ctx.snapshot(date);
    for (const id of ids) {
      const proj = snap.players?.[id]?.projection;
      const l6c = proj?.projectedGames, base = proj?.factors?.projectedGamesBase, state = proj?.factors?.shortSeasonState;
      if (!Number.isFinite(l6c) || !Number.isFinite(base) || !L6_STATES.has(state)) { excluded.missingField++; continue; }
      const position = crosswalkPositionOf[id];
      let rel3 = false;
      if (!POSITIONS.includes(position)) excluded.rel3NoPosition++;
      else rel3 = rel3Of({ id, S: 2025, position }, rankIndex, GAMES_CAL_DEFAULTS);
      rows.push({ id, state, l6c, base, realised: totals26?.[id]?.gamesPlayed ?? 0, rel3 });
    }
  }
  return { rows, excluded };
}

const NEEDS_VET = 'needs vet-calibration (ctx.shared.S absent)';

async function stepGamesL6(ctx) {
  try {
    if (ctx.shared.S === undefined) {
      return bSection(ctx, 'games-l6', `Not graded — ${NEEDS_VET}.`, { graded: false, reason: NEEDS_VET });
    }
    const { rows, excluded } = l6RowsOf(ctx);
    const rep = gamesL6Report(rows, { excluded });
    const L = [`Rows: ${rows.length} graded; excluded ${JSON.stringify(rep.excluded)}. L6c = \`projectedGames\`, base = \`factors.projectedGamesBase\` (S(i) captures, leak-free); realised = 2026 \`gamesPlayed\` so far (no row = 0).`, '',
      '| cell | n | MAE L6c | MAE base | bias L6c | bias base | Δ abs-err (L6c − base) | label |', '|---|---|---|---|---|---|---|---|'];
    const cells = [...['short', 'none', 'qual'].map(s => [`state ${s}`, rep.byState[s]]), ['rel3', rep.rel3]];
    for (const [name, c] of cells) L.push(`| ${name} | ${c.n} | ${fmt(c.mae.l6c)} | ${fmt(c.mae.base)} | ${fmt(c.bias.l6c)} | ${fmt(c.bias.base)} | ${fmt(c.delta.mean)} ${fmtCI(c.delta.ci)} | ${c.delta.label} |`);
    return bSection(ctx, 'games-l6', L.join('\n'), { graded: true, stamp: stampOf(ctx), ...rep, rows: rows.length });
  } catch (e) { return degradeOrThrow(ctx, 'games-l6', e); }
}

async function stepOverride(ctx) {
  try {
    // §6.4: `next` blocks are recorded, not graded; counted on the checkpoint captures, needing no ctx.shared.
    const nextCounts = {};
    for (const { cal, pick } of checkpointPicks(ctx)) {
      if (pick.date == null) continue;
      const snap = ctx.snapshot(pick.date);
      const positionOf = makePositionOf(snap, ctx);
      const byPos = { QB: 0, RB: 0, WR: 0, TE: 0, UNK: 0 };
      for (const [id, p] of Object.entries(snap.players ?? {})) {
        if (p?.inSeason?.season !== 2026 || !p.inSeason.next) continue;
        byPos[positionOf(id) ?? 'UNK']++;
      }
      nextCounts[cal.c] = { date: pick.date, ...byPos };
    }
    const L = [];
    if (ctx.shared.S === undefined) {
      L.push(`Healthy override not graded — ${NEEDS_VET}.`);
    }
    let check = null, excluded = null;
    if (ctx.shared.S !== undefined) {
      const l = l6RowsOf(ctx);
      excluded = l.excluded;
      const rows = l.rows.map(r => ({ id: r.id, S: 2025, sState: r.state, star: r.rel3, p: { SOf0: r.l6c, C0: r.base } }));
      check = inSeasonCheck(rows, { 2026: ctx.totals(2026) });
      L.push(`\`inSeasonCheck\` on ${rows.length} rows; excluded ${JSON.stringify(excluded)}; no 2026 row: ${check.noRow}. Rule outcome (verbatim): \`${check.inSeasonRule}\`.`, '');
      L.push('| group | ' + check.checkpoints.map(w => `w=${w}`).join(' | ') + ' |', '|---|' + check.checkpoints.map(() => '---').join('|') + '|');
      for (const [g, byW] of Object.entries(check.groups)) {
        L.push(`| ${g} | ` + check.checkpoints.map(w => { const x = byW[w]; return x.n ? `n=${x.n} cut ${fmt(x.cut.mae, 2)} / base ${fmt(x.base.mae, 2)}` : 'n=0'; }).join(' | ') + ' |');
      }
    }
    L.push('', '**`inSeason.next` blocks (recorded, not graded; the grade needs 2027 outcomes):**', '', '| c | capture | QB | RB | WR | TE | UNK |', '|---|---|---|---|---|---|---|');
    for (const [c, v] of Object.entries(nextCounts)) L.push(`| ${c} | ${v.date} | ${v.QB} | ${v.RB} | ${v.WR} | ${v.TE} | ${v.UNK} |`);
    if (!Object.keys(nextCounts).length) L.push('| — | no checkpoint capture yet | | | | | |');
    const data = { stamp: stampOf(ctx), graded: check != null, ...(check == null ? { reason: NEEDS_VET } : { excluded, check }), nextCounts };
    return bSection(ctx, 'override', L.join('\n'), data);
  } catch (e) { return degradeOrThrow(ctx, 'override', e); }
}

// ── rookie ────────────────────────────────────────────────────────────────────

/** Leave-one-class-year-out QB asymptote (p99 of gp ≥ 8 debut PPG), per class year present in the rows. */
export function qbAsymptoteLoco(rows) {
  const years = [...new Set(rows.map(r => r.entryYear).filter(y => Number.isFinite(y) && y >= 2013 && y <= 2026))].sort((a, b) => a - b);
  const folds = years.map((y) => {
    const values = rows.filter(r => r.position === 'QB' && r.outcomeGames >= 8 && r.outcomePPG != null && r.entryYear !== y).map(r => r.outcomePPG).sort((a, b) => a - b);
    return { y, asymptote: values.length ? Math.round(quantile(values, 0.99) * 100) / 100 : null, n: values.length };
  });
  const vals = folds.map(f => f.asymptote).filter(v => v != null);
  return { folds, min: vals.length ? Math.min(...vals) : null, max: vals.length ? Math.max(...vals) : null, classes: years.length };
}

/**
 * D-75 arms (§7): rows are `evaluate.rows`; `shipped`/`league` are { day3, undrafted } totalFactors. Both arms are
 * predTotal × factor. Per decision group → { n, players, ratioH, ratioL, delta, label }; null-safe (§10a guard 1).
 */
export function rookieTotalArms(rows, { shipped, league }) {
  const out = {};
  for (const g of ROOKIE_TOTAL.decisionGroups) {
    const rs = rows.filter(r => r.draftGroup === g && ROOKIE_TOTAL.decisionPositions.includes(r.position));
    if (!rs.length) {
      out[g] = { n: 0, players: 0, ratioH: { value: null, ci: null }, ratioL: { value: null, ci: null }, delta: { mean: null, ci: null }, label: 'insufficient' };
      continue;
    }
    const arm = (f) => rs.map(r => ({ ...r, predTotal: r.predTotal * f }));
    const H = biasSummary(arm(shipped[g])), Lg = biasSummary(arm(league[g]));
    const d = pairedDelta(rs.map(r => r.sleeperId), rs.map(r => Math.abs(r.predTotal * league[g] - r.outcomeTotalPts) - Math.abs(r.predTotal * shipped[g] - r.outcomeTotalPts)), ROOKIE_TOTAL.bootstrap);
    out[g] = {
      n: rs.length, players: H.players,
      ratioH: { value: H.ratio, ci: H.ci95 }, ratioL: { value: Lg.ratio, ci: Lg.ci95 },
      delta: { mean: d.mean, ci: d.ci },
      label: d75Label({ n: rs.length, ratioH: H.ratio, ratioL: Lg.ratio, deltaCi: d.ci }),
    };
  }
  return out;
}

const countBy3 = (rows) => {
  const out = {};
  for (const r of rows) {
    const k = `${r.position}|${r.draftGroup ?? 'unknown'}`;
    (out[k] ??= {})[r.outcomeClass] = (out[k][r.outcomeClass] ?? 0) + 1;
  }
  return out;
};

async function stepRookie(ctx) {
  try {
    const L = [];
    const data = { stamp: stampOf(ctx), parts: {} };
    const artifacts = [];
    let panelLoad, half, league;
    const note = (name, failed) => { data.parts[name] = failed; L.push(failed.banner, ''); };

    // D-16 half (i)(ii)(iii)
    const h = await part(ctx, 'D-16 (half_ppr)', () => {
      panelLoad = ctx.load.rookiePanelLoad();
      half = runRookiePanels({ load: panelLoad, basis: 'half_ppr', entryToYear: 2026 });
      const debut26 = half.debut.rows.filter(r => r.entryYear === 2026);
      const loco = qbAsymptoteLoco(half.debut.rows);
      const obs = half.ceiling.observed.QB.asymptote;
      return { debutCounts: countBy3(debut26), nDebut2026: debut26.length, ceiling: half.ceiling, loco, label: d16Label(obs) };
    });
    L.push('### D-16 — 2026 rookie class', '');
    if (h.failed) note('d16-half', h.failed);
    else {
      const v = h.value;
      data.parts['d16-half'] = v;
      L.push(`(i) 2026-class debut rows: ${v.nDebut2026}. Position | draft group → outcome classes (games-based, basis-free):`, '');
      for (const [k, c] of Object.entries(v.debutCounts).sort()) L.push(`- ${k.replace('|', ' | ')}: ${Object.entries(c).map(([a, b]) => `${a} ${b}`).join(', ')}`);
      L.push('', '(ii) Ceiling reconciliation, classes 2013–2026 vs `APP_ROOKIE_CEILING` (half-PPR):', '', '| pos | n | knee obs / app / Δ | asymptote obs / app / Δ | match |', '|---|---|---|---|---|');
      for (const pos of Object.keys(v.ceiling.observed)) {
        const o = v.ceiling.observed[pos], e = v.ceiling.expected[pos], d = v.ceiling.delta[pos];
        L.push(`| ${pos} | ${o.n} | ${fmt(o.knee, 2)} / ${fmt(e.knee, 2)} / ${fmt(d.knee, 2)} | ${fmt(o.asymptote, 2)} / ${fmt(e.asymptote, 2)} / ${fmt(d.asymptote, 2)} | ${v.ceiling.match[pos]} |`);
      }
      L.push('', `(iii) QB asymptote, leave-one-class-year-out over ${v.loco.classes} classes: min ${fmt(v.loco.min, 2)}, max ${fmt(v.loco.max, 2)}${v.loco.classes !== 14 ? ` — classes = ${v.loco.classes} (expected 14)` : ''}.`);
      L.push(`Label (2013–2026 asymptote ${fmt(v.ceiling.observed.QB.asymptote, 2)} vs [20.50, 21.95]): **${v.label}**.`);
    }

    // D-16 league
    const lg = await part(ctx, 'D-16 (league)', () => {
      panelLoad ??= ctx.load.rookiePanelLoad();
      league = runRookiePanels({ load: panelLoad, basis: 'league', entryToYear: 2026 });
      const debut26 = league.debut.rows.filter(r => r.entryYear === 2026);
      return { nDebut2026: debut26.length, classCounts: countBy3(debut26) };
    });
    if (lg.failed) note('d16-league', lg.failed);
    else {
      const lc = lg.value.classCounts;
      const hc = h.failed ? null : h.value.debutCounts;
      const cellOf = (c, k, cls) => (c?.[k]?.[cls] ?? 0);
      const diffs = [];
      if (hc) {
        for (const k of new Set([...Object.keys(hc), ...Object.keys(lc)])) {
          for (const cls of new Set([...Object.keys(hc[k] ?? {}), ...Object.keys(lc[k] ?? {})])) {
            const a = cellOf(hc, k, cls), b = cellOf(lc, k, cls);
            if (a !== b) diffs.push(`${k.replace('|', ' | ')} ${cls}: half ${a} vs league ${b}`);
          }
        }
      }
      const differ = hc ? diffs.length > 0 : 'not compared';
      data.parts['d16-league'] = { nDebut2026: lg.value.nDebut2026, classCounts: lc };
      data.d16League = { classCountsDiffer: differ, classCounts: lc };
      L.push('');
      if (differ === false) L.push('(i, league) league class counts identical to half-PPR');
      else {
        L.push(differ === 'not compared'
          ? '(i, league) not compared — half-PPR part failed'
          : `(i, league) 2026-class debut counts on the league panel (position | draft group → outcome classes):`, '');
        for (const [k, c] of Object.entries(lc).sort()) L.push(`- ${k.replace('|', ' | ')}: ${Object.entries(c).map(([a, b]) => `${a} ${b}`).join(', ')}`);
        if (diffs.length) L.push('', `Differing cells: ${diffs.join('; ')}.`);
      }
    }

    // (iv)
    const iv = await part(ctx, 'D-16 (iv)', () => {
      if (!half || !league) throw new Error('needs both rookie panels');
      const qb = (rows) => rows.filter(r => r.entryYear === 2026 && r.position === 'QB' && r.outcomeGames >= 8 && r.outcomePPG != null);
      const asym = half.ceiling.expected.QB.asymptote;
      const scale = basisScaleOf(leagueBasisLoad(panelLoad, leagueLoadArgs(panelLoad)), 2026, 'QB');
      return {
        asymptote: asym, scale,
        half: { n: qb(half.debut.rows).length, above: qb(half.debut.rows).filter(r => r.outcomePPG > asym).length },
        league: { n: qb(league.debut.rows).length, threshold: asym * scale, above: qb(league.debut.rows).filter(r => r.outcomePPG > asym * scale).length },
      };
    });
    if (iv.failed) note('d16-iv', iv.failed);
    else {
      data.parts['d16-iv'] = iv.value;
      const x = iv.value;
      L.push(`(iv) 2026-class QB debuts with gp ≥ 8 above the app asymptote ${fmt(x.asymptote, 2)} (half-PPR): ${x.half.above} of ${x.half.n}; above ${fmt(x.league.threshold, 2)} (= ${fmt(x.asymptote, 2)} × basis scale ${fmt(x.scale, 4)}, league): ${x.league.above} of ${x.league.n}.`);
    }
    L.push('');

    // artifacts
    if (ctx.write) {
      for (const [obj, name] of [[half, 'rookie-panel'], [league, 'rookie-league-panel']]) {
        if (!obj) continue;
        const rel = `backtests/${ctx.runDate}-${name}.json`;
        const w = await part(ctx, `artifact ${rel}`, () => { writeJsonStable(rel, obj); return rel; });
        if (w.failed) note(`artifact-${name}`, w.failed); else artifacts.push({ path: rel, registered: false });
      }
    }

    // D-75
    L.push('### D-75 — ROOKIE_TOTAL_FACTOR league re-measure (2026 day3 / undrafted RB·WR·TE)', '');
    const d75 = await part(ctx, 'D-75', () => {
      if (!league) throw new Error('league rookie panel unavailable');
      const consts = ctx.load.loadRookieLeagueConstants();
      if (!consts) throw new Error('league constants file missing: backtests/2026-10-17-rookie-league-constants.json');
      const lf = consts?.families?.F4?.constants?.totalFactor;
      if (lf?.day3 == null || lf?.undrafted == null) throw new Error('F4 totalFactor incomplete');
      const result = runRookieTotal({
        load: { ...ctx.load.rookieTotalLoad(), loadLeaguePanel: () => league }, basis: 'league',
        panelPath: `<in-memory league rookie panel, ${ctx.runDate}>`, evaluateTargetSeason: 2026,
      });
      const shipped = ROOKIE_TOTAL_FACTOR;
      return { shipped, league: { day3: lf.day3, undrafted: lf.undrafted }, evaluated: result.evaluate.rows.length, arms: rookieTotalArms(result.evaluate.rows, { shipped, league: lf }) };
    });
    if (d75.failed) note('d75', d75.failed);
    else {
      const v = d75.value;
      data.parts.d75 = v;
      L.push(`Factors — shipped ${JSON.stringify(v.shipped)}, league (F4) ${JSON.stringify(v.league)}; ${v.evaluated} target-2026 rows evaluated. Both arms are predTotal × factor; ratio = Σpred ÷ Σreal.`, '');
      L.push('| group | rows | players | ratio shipped [CI] | ratio league [CI] | Δ abs-err (league − shipped) [CI] | label |', '|---|---|---|---|---|---|---|');
      for (const [g, a] of Object.entries(v.arms)) L.push(`| ${g} | ${a.n} | ${a.players} | ${fmt(a.ratioH.value)} ${fmtCI(a.ratioH.ci)} | ${fmt(a.ratioL.value)} ${fmtCI(a.ratioL.ci)} | ${fmt(a.delta.mean, 2)} ${fmtCI(a.delta.ci, 2)} | ${a.label} |`);
    }
    return bSection(ctx, 'rookie', L.join('\n'), data, artifacts);
  } catch (e) { return degradeOrThrow(ctx, 'rookie', e); }
}

// ── d60 / listed ──────────────────────────────────────────────────────────────

const D60_REASON = "2026 season-totals still inProgress until Sleeper's post-Super-Bowl rollover; recount then";

async function stepD60(ctx) {
  try {
    return bSection(ctx, 'd60', `**D-60 not counted.** ${D60_REASON}. (The in-progress guard refuses 2026 by design; no bypass is added.)`, { counted: false, reason: D60_REASON });
  } catch (e) { return degradeOrThrow(ctx, 'd60', e); }
}

async function stepListed(ctx) {
  try {
    const md = [
      '| Item | Does January produce its input? |', '|---|---|',
      '| D-79 `SHORT_SEASON_K` refit | Partly. The refit needs no 2026 data. §6.2 is its first out-of-sample season. |',
      '| D-80 durability constants | No. It needs a data-rev comparison mode; §6.2 is a symptom check only. |',
      '| D-85 healthy-cut override | Partly. §6.3 grades it on 2026 with post-D-76 `\'D\'`; the historical re-run is still owed. |',
    ].join('\n');
    return bSection(ctx, 'listed', md, { items: ['D-79', 'D-80', 'D-85'] });
  } catch (e) { return degradeOrThrow(ctx, 'listed', e); }
}

// ─── Registry and runner ──────────────────────────────────────────────────────

export const STEPS = [
  { id: 'season-gate', run: stepSeasonGate },
  { id: 'inventory', run: stepInventory },
  { id: 'd44', run: stepD44 },
  { id: 'vet-calibration', run: stepVetCalibration },
  { id: 'ros', run: stepRos },
  { id: 'games-l6', run: stepGamesL6 },
  { id: 'override', run: stepOverride },
  { id: 'rookie', run: stepRookie },
  { id: 'd60', run: stepD60 },
  { id: 'listed', run: stepListed },
];

/**
 * Run the registry (optionally filtered by `only`); returns { exitCode, results, verdict, artifacts, data }.
 * Per-step isolation: a throwing step is reported and the next still runs; exit 1 if any failed. A hard stop
 * (G-SEASON) halts the run with no writes.
 */
export async function runSeasonGrade({ steps = STEPS, only = null, rehearse = false, write = false, runDate = null, load = DEFAULT_LOAD, log = () => {} } = {}) {
  const known = new Set(steps.map(s => s.id));
  if (only) for (const id of only) if (!known.has(id)) throw new Error(`unknown step id '${id}' — known: ${[...known].join(', ')}`);
  const ctx = makeContext({ load, rehearse, write: write && !rehearse, runDate, log });
  // The season gate always runs first, whatever `--only` says; `--only` filters only the steps after it.
  steps = [...steps.filter(s => s.id === 'season-gate'), ...steps.filter(s => s.id !== 'season-gate')];
  const results = [];
  let failed = false;
  let halted = false;
  for (const step of steps) {
    if (only && step.id !== 'season-gate' && !only.includes(step.id)) continue;
    if (halted) { results.push({ id: step.id, skipped: true }); continue; }
    try {
      const r = await step.run(ctx);
      results.push({ id: step.id, ...r });
    } catch (err) {
      failed = true;
      results.push({ id: step.id, error: err.message, section: err.section ?? null });
      if (err.hardStop) halted = true;
    }
  }
  const verdict = formatVerdict(results, ctx);
  const data = { runDate: ctx.runDate, rehearse, stamp: stampOf(ctx), steps: results.map(r => ({ id: r.id, error: r.error ?? null, data: r.section?.data ?? null })) };
  const artifacts = [];
  if (write && !rehearse && !failed) {
    const aggPath = `backtests/${ctx.runDate}-season-grade.json`;
    const mdPath = `grading/${ctx.runDate}-season-grade-verdict.md`;
    const slim = { ...data, steps: data.steps.map(s => ({ ...s, data: s.id === 'inventory' ? null : s.data })) };
    writeJsonStable(aggPath, slim);
    fs.writeFileSync(repoPath(mdPath), verdict + '\n', 'utf8');
    artifacts.push({ path: aggPath }, { path: mdPath });
    for (const r of results) for (const a of r.artifacts ?? []) artifacts.push(a);
  }
  return { exitCode: failed ? 1 : 0, results, verdict, artifacts, data };
}

export function formatVerdict(results, ctx) {
  const L = [];
  L.push(`# Season grade — ${ctx.runDate}`, '');
  L.push('**Report-only: numbers and labels. No constant, multiplier or wiring recommendation is proposed.**', '');
  if (ctx.rehearse) L.push(`> ${ctx.stamp ?? 'REHEARSAL — partial season'} — every section below is a rehearsal; nothing was written.`, '');
  const body = (placement) => results.filter(r => r.section && (r.section.placement ?? 'main') === placement);
  for (const r of body('top')) L.push(`## ${r.section.title}`, '', r.section.md, '');
  for (const r of results.filter(x => x.error)) L.push(`> **Step \`${r.id}\` FAILED:** ${r.error}`, '');
  for (const r of body('main')) L.push(`## ${r.section.title}`, '', r.section.md, '');
  const app = body('appendix');
  if (app.length) { L.push('## Appendix', ''); for (const r of app) L.push(`### ${r.section.title}`, '', r.section.md, ''); }
  return L.join('\n');
}
