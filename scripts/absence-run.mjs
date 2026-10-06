/**
 * scripts/absence-run.mjs — graded before/after check of the absence correction
 * (`bin/backtest.mjs --absence`). Task file: .claude/tasks/absence-classification-b.md (L5 Stage B).
 * Offline analysis only: no served file, no manifest entry. The mirror of the app's durability rules
 * is lib/durabilityMirror.mjs; the correction is lib/absence.mjs (Stage A).
 *
 * "Before" = committed season-totals 2012–2025. "After" = each season passed through
 * classifyAbsences(totals, nflverse/rosterweekly/<y>.json players) in memory.
 *
 * Public exports:
 *   ABSENCE_DEFAULTS, ABSENCE_LOAD, SnapshotStop, ParityStop
 *   parityReport(fixture)                       → DM-1 / DM-2 rates and mismatches (reads only the DM-0 fixture)
 *   correctStore(totalsByYear, rosterByYear, { from, to }) → { after, corrections }
 *   buildPanel({ before, after, rosterByYear, positionOf, draftYearOf, defaults }) → { rows, counts }
 *   recommend({ parityRate, parityMin, ci })    → { outcome: 'a'|'b'|'c', text }
 *   runAbsence({ load, defaults, log })         → result
 *   buildAbsenceVerdictMarkdown(result)         → string
 *   writeAbsenceArtifacts({ result, verdictMd, root }) → { panelPath, verdictPath, panelBytes }
 *   absenceMain({ load, write, asJson, … })     → exit code
 */

import fs from 'fs';
import path from 'path';
import { readJson, repoPath } from '../lib/io.mjs';
import { isTeamAggregateId, spearman } from '../lib/backtest.mjs';
import { INSEASON_LOAD, guardLoad } from './inseason-run.mjs';
import { IN_SEASON_DEFAULTS, bootstrapPairedMean, median } from '../lib/inSeasonEvidence.mjs';
import { classifyAbsences, MISSED_ROSTER_STATUSES } from '../lib/absence.mjs';
import {
  projectedGamesFor, bounceBackFlag, dynastyInjurySeasonCount, qualifyingSeasons,
} from '../lib/durabilityMirror.mjs';

const POSITIONS = ['QB', 'RB', 'WR', 'TE'];
const PARITY_FIXTURE = 'test/fixtures/durability-parity-2026-10-04.json';

export const ABSENCE_DEFAULTS = {
  seasons: { from: 2012, to: 2025 },
  predictorSeasons: { from: 2015, to: 2024 },
  snapshotDate: '2026-10-04',
  parityMin: 0.99,
  bootstrap: IN_SEASON_DEFAULTS.bootstrap,
  buckets: [
    { name: '2015', from: 2015, to: 2015 },
    { name: '2016-2020', from: 2016, to: 2020 },
    { name: '2021-2024', from: 2021, to: 2024 },
  ],
  topMovers: 15,
};

export const ABSENCE_LOAD = {
  ...INSEASON_LOAD,
  loadRosterWeekly: (year) => readJson(`nflverse/rosterweekly/${year}.json`),
  loadPlayersRaw: () => readJson('raw/-players-nfl.json'),
  loadParityFixture: () => readJson(PARITY_FIXTURE),
};

export class SnapshotStop extends Error {
  constructor(message, detail) { super(message); this.name = 'SnapshotStop'; this.detail = detail; }
}
export class ParityStop extends Error {
  constructor(message, detail) { super(message); this.name = 'ParityStop'; this.detail = detail; }
}

const round3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);
const round2 = (x) => (x == null ? null : Math.round(x * 100) / 100);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const bucket4 = (c) => Math.min(c, 3);

function need(v, what) {
  if (v == null) throw new Error(`[absence] ${what} not found in the store`);
  return v;
}

function positionOfFrom(playerIds) {
  const positionOf = {};
  for (const e of Object.values(playerIds?.ids ?? {})) {
    if (e?.sleeperId && e?.position) positionOf[e.sleeperId] = e.position;
  }
  return positionOf;
}

// ─── DM-1 / DM-2: parity of the mirror against the 2026-10-04 snapshot (reads only the DM-0 fixture) ─────

/** The app writes `absenceShapeFactor` as Math.round(x * 1000) / 1000 (seasonProjection.js:1089); compare the same way. */
export function parityReport(fixture) {
  const careerStats = fixture.seasons;
  let rows = 0, matched = 0, noQualifying = 0, nonSkill = 0, bbRows = 0, bbAgree = 0;
  const mismatches = [];
  for (const [id, snap] of Object.entries(fixture.snapshotRows)) {
    const pos = fixture.positions[id];
    if (!POSITIONS.includes(pos)) { nonSkill++; continue; }
    const r = projectedGamesFor(careerStats, id, pos, { throughSeason: 2025 });
    if (!r) { noQualifying++; continue; }
    rows++;
    const mirror = { projectedGames: r.projectedGames, injurySeasons: r.injurySeasons, absenceShapeFactor: round3(r.absenceShapeFactor) };
    const ok = mirror.projectedGames === snap.projectedGames && mirror.injurySeasons === snap.injurySeasons
      && mirror.absenceShapeFactor === round3(snap.absenceShapeFactor);
    if (ok) matched++;
    else mismatches.push({ id, position: pos, mirror, snapshot: { projectedGames: snap.projectedGames, injurySeasons: snap.injurySeasons, absenceShapeFactor: snap.absenceShapeFactor } });
    bbRows++;
    if ((bounceBackFlag(careerStats, id, pos, { throughSeason: 2025 }) === true) === (snap.isBounceBack === true)) bbAgree++;
  }
  return {
    rows, matched, rate: rows ? matched / rows : null, noQualifying, nonSkill, mismatches,
    bounceBack: { rows: bbRows, agree: bbAgree, rate: bbRows ? bbAgree / bbRows : null },
  };
}

// ─── The corrected store ─────────────────────────────────────────────────────

export function correctStore(totalsByYear, rosterByYear, { from, to }) {
  const after = {};
  const corrections = [];
  for (let y = from; y <= to; y++) {
    const rw = need(rosterByYear[y], `nflverse/rosterweekly/${y}.json`);
    const r = classifyAbsences(totalsByYear[y], rw.players, { season: y });
    after[y] = r.totals;
    corrections.push({ season: y, changedSlots: r.changedSlots, changedRows: r.changedRows, byStatus: r.byStatus });
  }
  return { after, corrections };
}

// ─── Panel ───────────────────────────────────────────────────────────────────

const hasReserveListing = (rwFile, id) =>
  Object.values(rwFile?.players?.[id] ?? {}).some((pairs) => pairs.some(([, st]) => MISSED_ROSTER_STATUSES.has(st)));

export function buildPanel({ before, after, rosterByYear, positionOf, draftYearOf, defaults = ABSENCE_DEFAULTS }) {
  const { from, to } = defaults.predictorSeasons;
  const firstSeason = {};
  for (const y of Object.keys(before).map(Number).sort((a, b) => a - b)) {
    for (const id of Object.keys(before[y])) if (!isTeamAggregateId(id) && firstSeason[id] === undefined) firstSeason[id] = y;
  }
  const rows = [];
  const counts = { noQualifying: 0, notVeteran: 0, included: 0, includedZeroOutcome: 0, excludedNoRowNoReserve: 0 };
  for (let S = from; S <= to; S++) {
    for (const id of Object.keys(firstSeason)) {
      const position = positionOf[id];
      if (!POSITIONS.includes(position) || firstSeason[id] > S) continue;
      const pb = projectedGamesFor(before, id, position, { throughSeason: S });
      const pa = projectedGamesFor(after, id, position, { throughSeason: S });
      if (!pb || !pa) { counts.noQualifying++; continue; }
      const rookieYear = draftYearOf[id] ?? firstSeason[id];
      if (!(rookieYear <= S - 1)) { counts.notVeteran++; continue; }
      const next = before[S + 1]?.[id];
      let outcome;
      if (next) outcome = next.gamesPlayed ?? 0;
      else if (hasReserveListing(rosterByYear[S + 1], id)) { outcome = 0; counts.includedZeroOutcome++; }
      else { counts.excludedNoRowNoReserve++; continue; }
      counts.included++;
      rows.push({ id, S, position, before: pb.projectedGames, after: pa.projectedGames, outcome,
        injBefore: pb.injurySeasons, injAfter: pa.injurySeasons, absBefore: round3(pb.absenceShapeFactor), absAfter: round3(pa.absenceShapeFactor) });
    }
  }
  return { rows, counts };
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

function cellStats(rows, bootstrap, { ci = true } = {}) {
  if (!rows.length) return { n: 0 };
  const eb = rows.map((r) => r.before - r.outcome);
  const ea = rows.map((r) => r.after - r.outcome);
  const diffs = rows.map((_, i) => Math.abs(ea[i]) - Math.abs(eb[i]));
  const out = {
    n: rows.length, players: new Set(rows.map((r) => r.id)).size,
    maeBefore: round3(mean(eb.map(Math.abs))), maeAfter: round3(mean(ea.map(Math.abs))),
    biasBefore: round3(mean(eb)), biasAfter: round3(mean(ea)),
    deltaMae: round3(mean(diffs)),
  };
  if (ci) {
    const b = bootstrapPairedMean(rows.map((r) => r.id), diffs, bootstrap);
    out.ci95 = b ? [round3(b.ci95[0]), round3(b.ci95[1])] : null;
  }
  return out;
}

function primaryResult(rows, defaults) {
  const changed = rows.filter((r) => r.before !== r.after);
  const bp = defaults.bootstrap;
  const byPosition = {};
  for (const p of POSITIONS) byPosition[p] = cellStats(rows.filter((r) => r.position === p), bp);
  const byBucket = {};
  for (const b of defaults.buckets) byBucket[b.name] = cellStats(rows.filter((r) => r.S >= b.from && r.S <= b.to), bp);
  return {
    all: cellStats(rows, bp), changed: cellStats(changed, bp), byPosition, byBucket,
    changedByPosition: Object.fromEntries(POSITIONS.map((p) => [p, cellStats(changed.filter((r) => r.position === p), bp, { ci: false })])),
    spearman: {
      before: round3(spearman(rows.map((r) => r.before), rows.map((r) => r.outcome))),
      after: round3(spearman(rows.map((r) => r.after), rows.map((r) => r.outcome))),
    },
  };
}

export function recommend({ parityRate, parityMin, ci }) {
  if (parityRate == null || parityRate < parityMin) {
    return { outcome: 'c', text: `(c) stop — parity ${parityRate == null ? 'n/a' : (parityRate * 100).toFixed(1) + '%'} is below ${(parityMin * 100).toFixed(0)}%. No recommendation.` };
  }
  if (!ci) return { outcome: 'c', text: '(c) stop — the primary ΔMAE CI could not be computed. No recommendation.' };
  if (ci[0] > 0) {
    return { outcome: 'b', text: `(b) ship the data, re-tune separately — ΔMAE CI [${ci[0]}, ${ci[1]}] lies entirely above 0: the old thresholds penalise more on the corrected data.` };
  }
  return { outcome: 'a', text: `(a) ship — ΔMAE CI [${ci[0]}, ${ci[1]}] ${ci[1] <= 0 ? 'is entirely at or below 0' : 'spans 0'}: the corrected data does not predict games worse; Stage C proceeds as planned.` };
}

// ─── runAbsence ──────────────────────────────────────────────────────────────

export function runAbsence({ load = ABSENCE_LOAD, defaults = ABSENCE_DEFAULTS, log = () => {} } = {}) {
  const g = guardLoad(load, { maxLoadSeason: defaults.seasons.to });
  const { from, to } = defaults.seasons;

  // parity first — a failing mirror stops the run before any artifact
  const fixture = need(g.loadParityFixture(), PARITY_FIXTURE);
  const parity = parityReport(fixture);
  log(`parity DM-1 ${parity.matched}/${parity.rows}`);
  if (parity.rate == null || parity.rate < defaults.parityMin) {
    throw new ParityStop(`[absence] DM-1 parity ${parity.rate == null ? 'n/a' : (parity.rate * 100).toFixed(1) + '%'} is below ${defaults.parityMin * 100}% — nothing written`, parity);
  }

  const snapshot = g.loadSnapshot(defaults.snapshotDate);
  if (snapshot == null) throw new SnapshotStop(`[absence] snapshots/${defaults.snapshotDate}.json not found — nothing written`);

  const playerIds = need(g.loadPlayerIds(), 'nflverse/playerids.json');
  const positionOf = positionOfFrom(playerIds);
  const draftYearOf = {};
  for (const [id, e] of Object.entries(playerIds.bySleeper ?? {})) if (e?.draftYear != null) draftYearOf[id] = e.draftYear;

  const before = {}, rosterByYear = {};
  for (let y = from; y <= to; y++) {
    before[y] = need(g.loadSeasonTotals(y), `nfl/season-totals/${y}.json`);
    rosterByYear[y] = need(g.loadRosterWeekly(y), `nflverse/rosterweekly/${y}.json`);
  }
  const { after, corrections } = correctStore(before, rosterByYear, { from, to });

  // panel + primary
  const { rows, counts } = buildPanel({ before, after, rosterByYear, positionOf, draftYearOf, defaults });
  log(`panel rows ${rows.length}`);
  const primary = primaryResult(rows, defaults);

  // ── descriptive ──
  const changedRows = rows.filter((r) => r.before !== r.after);
  const injDist = (key) => { const d = [0, 0, 0, 0]; for (const r of rows) d[bucket4(r[key])]++; return d; };
  const m1 = { distBefore: injDist('injBefore'), distAfter: injDist('injAfter'), rowsChangedInjurySeasons: rows.filter((r) => r.injBefore !== r.injAfter).length };
  const m2 = { rowsChangedAbsenceShape: rows.filter((r) => r.absBefore !== r.absAfter).length };

  const flips = { onToOff: [], offToOn: [] };
  for (const r of rows) {
    const bb = bounceBackFlag(before, r.id, r.position, { throughSeason: r.S });
    const ba = bounceBackFlag(after, r.id, r.position, { throughSeason: r.S });
    if ((bb === true) === (ba === true)) continue;
    const q = qualifyingSeasons(before, r.id, { throughSeason: r.S });
    const cur = q[q.length - 1];
    const nx = before[r.S + 1]?.[r.id];
    const ratio = cur && nx && nx.gamesPlayed > 0 && Number.isFinite(nx.fantasyPoints) && cur.ppg > 0
      ? (nx.fantasyPoints / nx.gamesPlayed) / cur.ppg : null;
    (bb === true ? flips.onToOff : flips.offToOn).push({ id: r.id, S: r.S, ratio: ratio == null ? null : round3(ratio) });
  }
  const flipSummary = (list) => {
    const rs = list.map((f) => f.ratio).filter((x) => x != null);
    return { n: list.length, nWithOutcome: rs.length, meanRatio: round3(mean(rs)), medianRatio: round3(median(rs)) };
  };
  const m3 = { onToOff: flipSummary(flips.onToOff), offToOn: flipSummary(flips.offToOn),
    note: 'PPG is served half-PPR fantasyPoints, not the app\'s league-rescored points; ratio = PPG(S+1) / PPG(last qualifying season ≤ S)' };

  // snapshot veterans (today's population)
  const vets = Object.entries(snapshot.players ?? {})
    .filter(([id, p]) => p?.projection?.confidence !== 'rookie' && POSITIONS.includes(positionOf[id]))
    .map(([id]) => id);
  const names = g.loadPlayersRaw?.() ?? {};
  const nameOf = (id) => names[id]?.full_name ?? names[id]?.last_name ?? id;
  const matrix = (ids) => {
    const m = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    let changed = 0;
    for (const id of ids) {
      const cb = dynastyInjurySeasonCount(before, id, positionOf[id], { throughSeason: to });
      const ca = dynastyInjurySeasonCount(after, id, positionOf[id], { throughSeason: to });
      m[bucket4(cb)][bucket4(ca)]++;
      if (cb !== ca) changed++;
    }
    return { rows: ids.length, changed, matrixBeforeByAfter: m };
  };
  const active2025 = Object.keys(before[to]).filter((id) => !isTeamAggregateId(id) && POSITIONS.includes(positionOf[id]));
  const badgeOn = [], badgeOff = [];
  for (const id of vets) {
    const cb = dynastyInjurySeasonCount(before, id, positionOf[id], { throughSeason: to });
    const ca = dynastyInjurySeasonCount(after, id, positionOf[id], { throughSeason: to });
    if (cb < 2 && ca >= 2) badgeOn.push(nameOf(id));
    if (cb >= 2 && ca < 2) badgeOff.push(nameOf(id));
  }
  const m4 = { veterans: matrix(vets), activeIn2025: matrix(active2025), injuryRiskBadge: { turnsOn: badgeOn, turnsOff: badgeOff } };

  // 2026 impact
  const movers = [];
  const vetFlips = [];
  for (const id of vets) {
    const pos = positionOf[id];
    const pb = projectedGamesFor(before, id, pos, { throughSeason: to });
    const pa = projectedGamesFor(after, id, pos, { throughSeason: to });
    if (!pb || !pa) continue;
    movers.push({ id, name: nameOf(id), position: pos, before: pb.projectedGames, after: pa.projectedGames,
      delta: pa.projectedGames - pb.projectedGames, injBefore: pb.injurySeasons, injAfter: pa.injurySeasons });
    const bb = bounceBackFlag(before, id, pos, { throughSeason: to });
    const ba = bounceBackFlag(after, id, pos, { throughSeason: to });
    if ((bb === true) !== (ba === true)) vetFlips.push({ name: nameOf(id), position: pos, before: bb === true, after: ba === true });
  }
  const moved = movers.filter((m) => m.delta !== 0);
  const impact2026 = {
    veterans: movers.length, changedProjectedGames: moved.length,
    meanChangeAll: round3(mean(movers.map((m) => m.delta))), meanChangeChanged: round3(mean(moved.map((m) => m.delta))),
    topMovers: [...moved].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.name.localeCompare(b.name)).slice(0, defaults.topMovers),
    bounceBackFlips: vetFlips,
  };

  const rec = recommend({ parityRate: parity.rate, parityMin: defaults.parityMin, ci: primary.all.ci95 });
  return {
    meta: { generatedAt: new Date().toISOString(), seasons: defaults.seasons, predictorSeasons: defaults.predictorSeasons,
      snapshot: defaults.snapshotDate, bootstrap: defaults.bootstrap, parityFixture: PARITY_FIXTURE, parityFixtureRev: fixture.sourceRev,
      basis: 'half_ppr (served fantasyPoints)' },
    parity: { dm1: { rows: parity.rows, matched: parity.matched, rate: round3(parity.rate), noQualifying: parity.noQualifying, nonSkill: parity.nonSkill, mismatches: parity.mismatches },
      dm2: { ...parity.bounceBack, rate: round3(parity.bounceBack.rate) } },
    corrections,
    panelCounts: counts,
    primary,
    descriptive: { m1, m2, m3, m4 },
    impact2026,
    recommendation: rec,
    changedRows: changedRows.map(({ id, S, position, before: b, after: a, outcome }) => ({ id, S, position, before: b, after: a, outcome })),
  };
}

// ─── Verdict markdown ────────────────────────────────────────────────────────

const fmtCi = (c) => (c ? `[${c[0]}, ${c[1]}]` : 'n/a');
const fmt = (x) => (x == null ? 'n/a' : String(x));

export function buildAbsenceVerdictMarkdown(r) {
  const out = [];
  const w = (...l) => out.push(...l);
  const { meta, parity, corrections, panelCounts: pc, primary: p, descriptive: d, impact2026: im } = r;
  w(`# Absence correction — graded before/after check (L5 Stage B) — ${meta.generatedAt.slice(0, 10)}`, '');

  w('## 1. What was compared', '',
    `Season-totals ${meta.seasons.from}–${meta.seasons.to} as committed ("before") against the same files with each omitted \`'X'\` week reclassified \`'D'\` by \`classifyAbsences\` ` +
    `against \`nflverse/rosterweekly\` ("after"; D1 status set ACT/INA/RES/PUP, a team that played, 2016+ only). Predictor seasons S = ${meta.predictorSeasons.from}–${meta.predictorSeasons.to}, outcome S+1 \`gamesPlayed\`. ` +
    'Prediction = the mirrored veteran projected-games rule (`lib/durabilityMirror.mjs`, app `d627562`), as-of S. Basis: ' + meta.basis + '.', '',
    `Panel: ${pc.included} player-seasons (${pc.includedZeroOutcome} included at outcome 0: no S+1 row but on a reserve/active list all year; ${pc.excludedNoRowNoReserve} excluded: no S+1 row and no such listing; ` +
    `${pc.notVeteran} not yet veterans; ${pc.noQualifying} with no qualifying season).`, '',
    'Per-season correction totals, all rows (every position; Stage C §2.3 step 2 checks its migration dry-run against these):', '',
    '| season | changedSlots | changedRows | byStatus |', '|---|---|---|---|');
  for (const c of corrections) w(`| ${c.season} | ${c.changedSlots} | ${c.changedRows} | ${Object.entries(c.byStatus).sort().map(([k, v]) => `${k} ${v}`).join(', ') || '—'} |`);
  w('');

  w('## 2. Parity', '',
    `- DM-1 (asserted ≥ 99%): **${parity.dm1.matched}/${parity.dm1.rows} = ${(parity.dm1.rate * 100).toFixed(1)}%** of the snapshot's veteran rows match \`projectedGames\`, \`injurySeasons\` and \`absenceShapeFactor\` (the app's own 3-dp rounding). ` +
    `Not counted: ${parity.dm1.noQualifying} rows with no qualifying season, ${parity.dm1.nonSkill} non-QB/RB/WR/TE.`,
    `- DM-2 (reported): bounce-back flag agreement ${parity.dm2.agree}/${parity.dm2.rows} = ${(parity.dm2.rate * 100).toFixed(1)}% (served half-PPR PPG vs the app's league-rescored PPG).`);
  for (const m of parity.dm1.mismatches) w(`  - mismatch ${m.id} (${m.position}): mirror ${JSON.stringify(m.mirror)} vs snapshot ${JSON.stringify(m.snapshot)}`);
  w('');

  w('## 3. Primary result', '',
    'Mean absolute error of projected games vs next-season games played (MAE), mean signed error (bias = prediction − outcome), and ΔMAE = after − before with a player-clustered paired bootstrap 95% CI.', '',
    '| cell | n | players | MAE before | MAE after | ΔMAE [95% CI] | bias before | bias after |', '|---|---|---|---|---|---|---|---|');
  const row = (name, c) => w(`| ${name} | ${c.n} | ${fmt(c.players)} | ${fmt(c.maeBefore)} | ${fmt(c.maeAfter)} | ${c.n ? `${c.deltaMae} ${fmtCi(c.ci95)}` : 'n/a'} | ${fmt(c.biasBefore)} | ${fmt(c.biasAfter)} |`);
  row('all rows', p.all);
  for (const [k, c] of Object.entries(p.byPosition)) row(k, c);
  for (const [k, c] of Object.entries(p.byBucket)) row(`S ${k}`, c);
  row('changed rows only', p.changed);
  w('', `Spearman ρ (prediction vs outcome): before ${fmt(p.spearman.before)}, after ${fmt(p.spearman.after)}.`, '');

  w('## 4. Descriptive M1–M4', '',
    `- **M1** injurySeasons distribution over panel rows (0 / 1 / 2 / ≥3): before ${d.m1.distBefore.join(' / ')}; after ${d.m1.distAfter.join(' / ')}; ${d.m1.rowsChangedInjurySeasons} rows change.`,
    `- **M2** rows whose absenceShapeFactor changes: ${d.m2.rowsChangedAbsenceShape}.`,
    `- **M3** bounce-back flips (on→off / off→on; ${d.m3.note}): on→off ${d.m3.onToOff.n} (mean ratio ${fmt(d.m3.onToOff.meanRatio)}, median ${fmt(d.m3.onToOff.medianRatio)}, n=${d.m3.onToOff.nWithOutcome}); off→on ${d.m3.offToOn.n} (mean ${fmt(d.m3.offToOn.meanRatio)}, median ${fmt(d.m3.offToOn.medianRatio)}, n=${d.m3.offToOn.nWithOutcome}).`,
    `- **M4** dynasty injurySeasonCount through ${meta.seasons.to}, before (rows) × after (columns), buckets 0/1/2/≥3:`);
  for (const [label, m] of [['today\'s veterans', d.m4.veterans], [`active in ${meta.seasons.to}`, d.m4.activeIn2025]]) {
    w(`  - ${label}: ${m.rows} players, ${m.changed} change. Matrix ${JSON.stringify(m.matrixBeforeByAfter)}`);
  }
  w(`  - "⚠ Injury risk" badge (count ≥ 2) among today's veterans: turns on for ${d.m4.injuryRiskBadge.turnsOn.length} (${d.m4.injuryRiskBadge.turnsOn.join(', ') || '—'}); turns off for ${d.m4.injuryRiskBadge.turnsOff.length} (${d.m4.injuryRiskBadge.turnsOff.join(', ') || '—'}).`, '');

  w('## 5. 2026 impact', '',
    `Today's veterans (${im.veterans} QB/RB/WR/TE rows in the ${meta.snapshot} snapshot): ${im.changedProjectedGames} change \`projectedGames\`; mean change ${fmt(im.meanChangeAll)} over all, ${fmt(im.meanChangeChanged)} over the changed. Largest movers:`, '',
    '| player | pos | games before → after | injurySeasons before → after |', '|---|---|---|---|');
  for (const m of im.topMovers) w(`| ${m.name} | ${m.position} | ${m.before} → ${m.after} | ${m.injBefore} → ${m.injAfter} |`);
  w('', `Bounce-back flips among today's veterans: ${im.bounceBackFlips.length ? im.bounceBackFlips.map((f) => `${f.name} (${f.position}) ${f.before ? 'on→off' : 'off→on'}`).join('; ') : 'none'}.`, '');

  w('## 6. Era note', '',
    'Existing `\'D\'` already tripled from 2021, when Sleeper began returning inactives with `gp 0`. The correction adds 2016–2020 reserve weeks and 2021+ inactive weeks, and leaves 2012–2015 unchanged (D4: the weekly status there is season-level). The per-season totals in §1 show the split.', '');

  w('## 7. Recommendation', '', `The numbers meet: ${r.recommendation.text}`, '', 'The choice is Anton\'s; Stage C does not start before it.');
  return out.join('\n');
}

// ─── Artifacts ───────────────────────────────────────────────────────────────

export function writeAbsenceArtifacts({ result, verdictMd, root = null }) {
  const date = result.meta.generatedAt.slice(0, 10);
  const panelPath = `backtests/${date}-absence-panel.json`;
  const verdictPath = `grading/${date}-absence-verdict.md`;
  const panelJson = JSON.stringify(result, null, 2) + '\n';
  const abs = (rel) => (root ? path.join(root, rel) : repoPath(rel));
  fs.mkdirSync(abs('backtests'), { recursive: true });
  fs.mkdirSync(abs('grading'), { recursive: true });
  fs.writeFileSync(abs(panelPath), panelJson, 'utf8');
  fs.writeFileSync(abs(verdictPath), verdictMd.endsWith('\n') ? verdictMd : verdictMd + '\n', 'utf8');
  return { panelPath, verdictPath, panelBytes: Buffer.byteLength(panelJson) };
}

/** The `--absence` branch body of `bin/backtest.mjs`. Exit 1 on ParityStop/SnapshotStop (nothing written). */
export function absenceMain({
  load = ABSENCE_LOAD, defaults = ABSENCE_DEFAULTS, write = false, asJson = false, writeArtifacts = writeAbsenceArtifacts,
  log = console.log, logErr = console.error,
} = {}) {
  try {
    const result = runAbsence({ load, defaults, log: (m) => logErr(`[backtest] ${m}`) });
    const verdictMd = buildAbsenceVerdictMarkdown(result);
    if (write) {
      const w = writeArtifacts({ result, verdictMd });
      logErr(`[backtest] Wrote ${w.panelPath} (${w.panelBytes} B), ${w.verdictPath}`);
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
