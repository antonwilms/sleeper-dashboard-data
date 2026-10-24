/**
 * scripts/season-grade-run.mjs — January season grade: adapter + orchestrator (plan january-grading-run-a §10).
 *
 * Offline analysis, not the snapshot grader (Invariant 9): the vet-calibration step RECOMPOSES projections (replay R), it
 * never re-runs the app pipeline. Report-only: it emits numbers and labels, never a constant or a wiring recommendation.
 *
 * `STEPS` is the ordered step registry; Slice B appends `ros`, `games-l6`, `override`, `rookie`, `d60`, `listed` without
 * touching Slice A's steps. Each step after the season gate runs in its own try/catch (the update-playerstats precedent).
 */

import fs from 'node:fs';
import { readJson, repoPath, writeJsonStable } from '../lib/io.mjs';
import { loadLeaguePositions } from '../lib/leagueBasis.mjs';
import { pinnedQbChainModels } from '../lib/projectionFactors.mjs';
import {
  KICKOFF_2026_UTC, VETERAN_SEGMENTS, MECH_PAIRS, POSITIONS, HISTORY_MEDIANS, MIN_CELL, BOOT,
  evaluateSeasonGate, classifyCapture, crossCheckClassification,
  metricOf, segmentStats, sampleOk, materializeRows, bootCI, permutationTest,
  calibrationLabel, historyLabel, agreeLabel, pooledDiffLabel,
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

// ─── Registry and runner ──────────────────────────────────────────────────────

export const STEPS = [
  { id: 'season-gate', run: stepSeasonGate },
  { id: 'inventory', run: stepInventory },
  { id: 'd44', run: stepD44 },
  { id: 'vet-calibration', run: stepVetCalibration },
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
