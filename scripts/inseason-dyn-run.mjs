/**
 * scripts/inseason-dyn-run.mjs — dynasty-side (rookies + SHORT veterans) in-season k-fit adapter
 * (`bin/backtest.mjs --inseason --dynasty`). Task file:
 * .claude/tasks/in-season-evidence-2c-dynasty-backtest.md. Offline analysis only.
 *
 * Answers three questions the Phase 2a/2b in-season harness never reached: Q1 — which prior the
 * prospect side of the dynasty score should use (arm A, the app's own heuristic prior, vs arm B, the
 * reconstructed rookie/veteran projection); Q2 — the history-prior k for SHORT veterans (last season <
 * 8 games); Q3 — how much of the KTC-anchored 60% the model share leaves on the table (report only).
 *
 * Reuses 2a's row assembly (`assembleSeason`) unchanged and adds a prospect-prior mirror + a
 * history-prior + a pin ladder, all pure exports of lib/inSeasonEvidence.mjs (CR-25). Reaches
 * lib/rookieMirror.mjs only transitively through assembleSeason; never calls the fit path's own
 * rookie-panel assembler (T-RM1 holds).
 *
 * Public exports: INSEASON_DYN_LOAD, runInSeasonDyn, buildInSeasonDynVerdictMarkdown,
 * writeInSeasonDynArtifacts, inSeasonDynMain.
 */

import fs from 'fs';
import { readJson, repoPath } from '../lib/io.mjs';
import { isTeamAggregateId } from '../lib/backtest.mjs';
import {
  assembleSeason, makeGamelogsIndex, makeScheduleIndex, guardLoad, runReconciliation, ReconciliationStop,
  INSEASON_LOAD, pinDecision, fixtureFrom, makePut, entryOf, addFoldK, verifyConstants, formatConstantsJson,
  ARTIFACT_CAPS, SPEC,
} from './inseason-run.mjs';
import {
  IN_SEASON_DEFAULTS, analyzeKCell, pairedDelta, blend, fitCK, spearman,
  DYN_DEFAULTS, DYN_OPTIMISM_C, PROSPECT_MIRROR, prospectPriorPPG, modelScore,
  ageOnDate, dynastyPickProxy, historyPriorOf, ladderPick,
} from '../lib/inSeasonEvidence.mjs';
import { loadFactorInputs } from './panel-run.mjs';
import { computeSeasonPoints, HISTORY_FLOOR, PANEL_POSITIONS } from '../lib/panel.mjs';
import { reconstructAgeCurves } from '../lib/projectionFactors.mjs';

const POSITIONS = PANEL_POSITIONS;

export const INSEASON_DYN_LOAD = {
  ...INSEASON_LOAD,
  loadInSeasonConstants: () => readJson('backtests/2026-09-26-inseason-constants.json'),
};

const PINNED_2A_SOURCE = 'backtests/2026-09-26-inseason-constants.json @ a071bdb324976203ed915e14a57b88fb740fb0b6';

const r1 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10);
const r4 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 1e4) / 1e4);
const mean = (xs) => (xs.length ? xs.reduce((a, v) => a + v, 0) / xs.length : null);
const uniq = (xs) => [...new Set(xs)];

const SPEC_A = { prior: 'prospectPrior', obs: 'obsPPG', outcome: SPEC.pointsNext.outcome };
const SPEC_B = { prior: 'projPrior', obs: 'obsPPG', outcome: SPEC.pointsNext.outcome };
const SPEC_HIST = { prior: 'histPrior', obs: 'obsPPG', outcome: SPEC.pointsNext.outcome };
const SPEC_PROJ_SHORT = { prior: 'projPrior', obs: 'obsPPG', outcome: SPEC.pointsNext.outcome };

const K2A_NAME_BY_ARM = { 'X-rookie0': 'K_DYN_POINTS_ROOKIE0', 'X-rookie1p': 'K_DYN_POINTS_ROOKIE1P', 'X-short': 'K_DYN_POINTS_SHORT' };

function draftTierOf(pick) {
  if (pick == null) return 'none';
  return pick.round <= 2 ? 'premium' : 'late';
}

// ─── Setup (§4.1) ────────────────────────────────────────────────────────────

function buildPeakByS(inputs) {
  const qualAll = [];
  for (const y of inputs.years) {
    const outcomes = inputs.inputsByYear[y]?.outcomes;
    if (!outcomes) continue;
    for (const [pid, rec] of outcomes) {
      if (isTeamAggregateId(pid)) continue;
      const position = inputs.crosswalk[pid];
      if (!position) continue;
      qualAll.push({ pid, position, season: y, ppg: rec.actualPPG, gamesPlayed: rec.actualGames ?? 0 });
    }
  }
  const peakByS = {};
  for (let S = DYN_DEFAULTS.seasons.from; S <= DYN_DEFAULTS.seasons.to; S++) {
    const rows = qualAll.filter(r => r.season <= S - 1);
    peakByS[S] = reconstructAgeCurves(rows, (pid) => inputs.birthdateBySleeper[pid] ?? null).positionPeakPPG;
  }
  return peakByS;
}

function buildPickProxy(playerIds, inputs) {
  const bySleeper = playerIds?.bySleeper ?? {};
  const classes = new Map();
  for (const [sleeperId, e] of Object.entries(bySleeper)) {
    if (e?.draftYear == null || e.draftYear <= 0) continue;
    if (!classes.has(e.draftYear)) classes.set(e.draftYear, []);
    classes.get(e.draftYear).push({ sleeperId, draftOvr: e.draftOvr, undrafted: e.undrafted === true, position: inputs.crosswalk[sleeperId] ?? null });
  }
  const pickProxy = new Map();
  for (const [D, entries] of classes) pickProxy.set(D, dynastyPickProxy(entries, DYN_DEFAULTS.rookieDraft));
  return pickProxy;
}

// ─── Row augmentation (§4.2) ───────────────────────────────────────────────────

function augmentRow(row, ctx) {
  const { inputs, playerIds, peakByS, pickProxy, constants2a } = ctx;
  const pid = row.sleeperId, S = row.S;
  const projected = {
    sleeperId: pid, S, W: row.W, n: row.n, position: row.position, arm: row.arm,
    obsPPG: row.obsPPG, nextPPG: row.nextPPG, projPrior: row.pointsPrior,
  };

  const b = playerIds?.bySleeper?.[pid];
  const draftYear = (b?.draftYear != null && b.draftYear > 0) ? b.draftYear : null;
  const ye = draftYear != null ? S - draftYear : null;
  const proxy = (draftYear != null && pickProxy.has(draftYear)) ? (pickProxy.get(draftYear).get(pid) ?? null) : null;
  const pickForA = ye === 0 ? proxy : null;

  const age = ageOnDate(inputs.birthdateBySleeper[pid] ?? null, `${S}-${DYN_DEFAULTS.kickoffMonthDay}`);
  const sm1Raw = computeSeasonPoints(pid, inputs.inputsByYear[S - 1]?.outcomes);
  const sm1 = sm1Raw.gamesPlayed > 0 ? { gamesPlayed: sm1Raw.gamesPlayed, fantasyPoints: sm1Raw.totalPts } : null;

  const prospectPrior = prospectPriorPPG({ position: row.position, age, pick: pickForA, sm1 }).prospectPPG;
  const prospectPriorNullPick = prospectPriorPPG({ position: row.position, age, pick: null, sm1 }).prospectPPG;
  const prospectPriorYE1Pick = ye === 1 ? prospectPriorPPG({ position: row.position, age, pick: proxy, sm1 }).prospectPPG : null;

  let histPrior = null, recencyPrior = null, L = null, stale = false;
  if (row.arm === 'X-short') {
    const ppgBySeason = (y) => {
      const r = computeSeasonPoints(pid, inputs.inputsByYear[y]?.outcomes);
      return { ppg: r.ppg, gamesPlayed: r.gamesPlayed };
    };
    const h = historyPriorOf({ ppgBySeason, S, floor: HISTORY_FLOOR });
    histPrior = h.H; recencyPrior = h.recency; L = h.L; stale = h.stale;
  }

  const peak = peakByS[S]?.[row.position] ?? null;

  const k2aName = K2A_NAME_BY_ARM[row.arm] ?? null;
  const k2a = k2aName ? (constants2a?.constants?.[k2aName]?.[row.position]?.k ?? null) : null;
  const kStd = constants2a?.constants?.K_DYN_POINTS_HISTORY?.[row.position]?.k ?? null;

  return {
    ...projected, ye, draftYear, draftTier: draftTierOf(pickForA), draftTierOwnClass: draftTierOf(proxy),
    age, sm1, prospectPrior, prospectPriorNullPick, prospectPriorYE1Pick,
    histPrior, recencyPrior, L, stale, peak, k2a, k2aName, kStd,
  };
}

function classifyRow(row) {
  const finite = Number.isFinite;
  const q1Eligible = row.ye === 0 || row.ye === 1;
  const properRoute = row.arm === 'X-rookie0' || row.arm === 'X-rookie1p';
  const routeMismatch = q1Eligible && !properRoute;
  return {
    routeMismatch,
    q1: q1Eligible && properRoute && finite(row.prospectPrior) && finite(row.projPrior),
    q2Primary: row.arm === 'X-short' && row.L === row.S - 2 && finite(row.histPrior) && finite(row.projPrior),
    q2Stale: row.arm === 'X-short' && row.stale === true,
    q2NoL: row.arm === 'X-short' && row.L === null,
  };
}

// ─── Ladders (§3.4, §6) — three-rung (fixed 2a k / subgroup-pooled fold-k / own position) ────────

function threeRungLadder({ rowsPooled, positions, spec, kFixedOf }) {
  const refitPooled = rowsPooled.length ? analyzeKCell(rowsPooled, spec, { studyK: kFixedOf }) : { verdict: 'INSUFFICIENT', rows: 0, players: 0 };
  const results = {};
  const insufficient = [];
  for (const pos of positions) {
    const rowsP = rowsPooled.filter(r => r.position === pos);
    const own = rowsP.length ? analyzeKCell(rowsP, spec, { studyK: kFixedOf }) : { verdict: 'INSUFFICIENT', rows: 0, players: 0 };
    if (own.verdict === 'INSUFFICIENT') { insufficient.push(pos); continue; }
    const rung0 = { id: 'fixed', preds: own.orderedRows.map(r => ({ pred: blend(r[spec.prior], r[spec.obs], r.n, kFixedOf(r)), actual: r[spec.outcome] })) };
    let rungs = [rung0, { id: 'own', preds: own.heldOut }];
    if (refitPooled.verdict !== 'INSUFFICIENT') {
      const foldKOf = new Map(refitPooled.folds.map(f => [f.S, f.k]));
      const rung1 = { id: 'pooled', preds: own.orderedRows.map(r => ({ pred: blend(r[spec.prior], r[spec.obs], r.n, foldKOf.get(r.S)), actual: r[spec.outcome] })) };
      rungs = [rung0, rung1, { id: 'own', preds: own.heldOut }];
    }
    results[pos] = { ladder: ladderPick(own.orderedRows, rungs), own, refitPooled, rows: own.orderedRows };
  }
  if (insufficient.length) {
    if (refitPooled.verdict !== 'INSUFFICIENT') {
      const rung0 = { id: 'fixed', preds: refitPooled.orderedRows.map(r => ({ pred: blend(r[spec.prior], r[spec.obs], r.n, kFixedOf(r)), actual: r[spec.outcome] })) };
      const rung1 = { id: 'pooled', preds: refitPooled.heldOut };
      const ladder = ladderPick(refitPooled.orderedRows, [rung0, rung1]);
      for (const pos of insufficient) results[pos] = { ladder, refitPooled, pooledFallback: true, rows: refitPooled.orderedRows };
    } else {
      for (const pos of insufficient) results[pos] = { insufficient: true };
    }
  }
  return { refitPooled, results };
}

// ─── Two-rung ladder (subgroup-pooled / own position) — Q1 arm A, no fixed rung ───────────────

function twoRungLadder({ rowsPooled, positions, spec }) {
  const pooled = rowsPooled.length ? analyzeKCell(rowsPooled, spec) : { verdict: 'INSUFFICIENT', rows: 0, players: 0 };
  const results = {};
  const insufficient = [];
  for (const pos of positions) {
    const rowsP = rowsPooled.filter(r => r.position === pos);
    const own = rowsP.length ? analyzeKCell(rowsP, spec) : { verdict: 'INSUFFICIENT', rows: 0, players: 0 };
    if (own.verdict === 'INSUFFICIENT') { insufficient.push(pos); continue; }
    if (pooled.verdict === 'INSUFFICIENT') { results[pos] = { ladder: { id: 'own', steps: [] }, own, ownOnly: true }; continue; }
    const foldKOf = new Map(pooled.folds.map(f => [f.S, f.k]));
    const rung0 = { id: 'pooled', preds: own.orderedRows.map(r => ({ pred: blend(r[spec.prior], r[spec.obs], r.n, foldKOf.get(r.S)), actual: r[spec.outcome] })) };
    const rung1 = { id: 'own', preds: own.heldOut };
    results[pos] = { ladder: ladderPick(own.orderedRows, [rung0, rung1]), own, pooled };
  }
  for (const pos of insufficient) {
    results[pos] = pooled.verdict === 'INSUFFICIENT' ? { insufficient: true } : { ladder: { id: 'pooled', steps: [] }, pooled, pooledFallback: true };
  }
  return { pooled, results };
}

// ─── Entry writers (§6 entry recipe) ───────────────────────────────────────────

function writeThreeRungEntry(P, reuse, name, pos, res, kFixedNameOf) {
  if (res.insufficient) {
    P.put(name, pos, { k: null, kFit: null, ci95: null, rows: 0, players: 0, basis: 'insufficient' }, null, `${name}|${pos} INSUFFICIENT`);
    return;
  }
  const chosen = res.ladder.id;
  if (chosen === 'fixed') {
    const rows = res.rows;
    const missing = rows.filter(r => (r.k2a ?? r.kStd) == null);
    if (missing.length) {
      throw new Error(`[inseason-dyn] ${name}|${pos}: ladder reached the fixed (reuse) rung but ${missing.length} row(s) have no k2a/kStd — the referenced 2a constant/position is absent from the loaded backtests/2026-09-26-inseason-constants.json`);
    }
    reuse[`${name}|${pos}`] = { reuses: uniq(rows.map(kFixedNameOf)), k: uniq(rows.map(r => r.k2a ?? r.kStd)), source: PINNED_2A_SOURCE };
    return;
  }
  if (chosen === 'pooled') {
    const pooled = res.refitPooled;
    const p = pinDecision(pooled, null);
    const e = { ...p, basis: p.basis === 'fitted' ? 'pooled' : p.basis };
    P.constants[name] ??= {};
    P.constants[name][pos] = { ...entryOf(e), fixtureKey: `${name}|ALL` };
    const fx = fixtureFrom(pooled);
    if (fx) P.fixture[`${name}|ALL`] = fx;
    P.pinnedFrom[`${name}|${pos}`] = `${name} ladder: pooled rung (subgroup-pooled fold-k)`;
    return;
  }
  P.put(name, pos, pinDecision(res.own, null), res.own, `${name}|${pos} (ladder: own rung)`);
}

function writeTwoRungEntry(P, name, pos, res) {
  if (res.insufficient) {
    P.put(name, pos, { k: null, kFit: null, ci95: null, rows: 0, players: 0, basis: 'insufficient' }, null, `${name}|${pos} INSUFFICIENT`);
    return;
  }
  const chosen = res.ladder.id;
  if (chosen === 'pooled') {
    const pooled = res.pooled;
    const p = pinDecision(pooled, null);
    const e = { ...p, basis: p.basis === 'fitted' ? 'pooled' : p.basis };
    P.constants[name] ??= {};
    P.constants[name][pos] = { ...entryOf(e), fixtureKey: `${name}|ALL` };
    const fx = fixtureFrom(pooled);
    if (fx) P.fixture[`${name}|ALL`] = fx;
    P.pinnedFrom[`${name}|${pos}`] = `${name} ladder: pooled rung`;
    return;
  }
  P.put(name, pos, pinDecision(res.own, null), res.own, `${name}|${pos} (ladder: own rung)`);
}

// ─── Q1 — prospect prior: arm A vs arm B (§5.1, §6) ────────────────────────────

function runQ1(q1Rows, playersDiag) {
  const out = { subgroups: {}, decisions: {} };
  const P = makePut();
  const reuse = {};
  for (const g of [0, 1]) {
    const label = `YE${g}`;
    const rowsPooled = q1Rows.filter(r => r.ye === g);
    const A = analyzeKCell(rowsPooled, SPEC_A);
    const B = analyzeKCell(rowsPooled, SPEC_B, { studyK: r => r.k2a });
    let dAB = null;
    if (A.verdict !== 'INSUFFICIENT' && B.verdict !== 'INSUFFICIENT') {
      dAB = pairedDelta(A.orderedRows, A.heldOut, B.heldOut);
    }
    const chooseB = dAB?.label === 'BEATS';
    const byPosition = {};
    for (const pos of POSITIONS) {
      const rp = rowsPooled.filter(r => r.position === pos);
      const Apos = rp.length ? analyzeKCell(rp, SPEC_A) : { verdict: 'INSUFFICIENT', rows: 0, players: 0 };
      const Bpos = rp.length ? analyzeKCell(rp, SPEC_B, { studyK: r => r.k2a }) : { verdict: 'INSUFFICIENT', rows: 0, players: 0 };
      let d = null;
      if (Apos.verdict !== 'INSUFFICIENT' && Bpos.verdict !== 'INSUFFICIENT') d = pairedDelta(Apos.orderedRows, Apos.heldOut, Bpos.heldOut);
      byPosition[pos] = {
        A: { rows: Apos.rows, players: Apos.players, verdict: Apos.verdict, kFit: Apos.kFit?.k ?? null, maePriorOnly: r4(Apos.error?.priorOnly?.mae ?? null) },
        B: { rows: Bpos.rows, players: Bpos.players, verdict: Bpos.verdict, kFit: Bpos.kFit?.k ?? null, maePriorOnly: r4(Bpos.error?.priorOnly?.mae ?? null) },
        deltaAB: d ? { mean: r4(d.mean), ci95: d.ci95.map(r4), label: d.label } : null,
      };
    }

    // diagnostics: nullpick / YE1-with-pick, joint (c,k)
    const nullpick = rowsPooled.length ? analyzeKCell(rowsPooled, { prior: 'prospectPriorNullPick', obs: 'obsPPG', outcome: SPEC.pointsNext.outcome }) : null;
    const withPick = g === 1 ? (() => {
      const rp = rowsPooled.filter(r => Number.isFinite(r.prospectPriorYE1Pick));
      return rp.length ? analyzeKCell(rp, { prior: 'prospectPriorYE1Pick', obs: 'obsPPG', outcome: SPEC.pointsNext.outcome }) : null;
    })() : null;
    const ckA = rowsPooled.length ? fitCK(rowsPooled, SPEC_A, DYN_OPTIMISM_C) : null;
    const ckB = rowsPooled.length ? fitCK(rowsPooled, SPEC_B, DYN_OPTIMISM_C) : null;
    const tierSplit = {};
    for (const tier of ['none', 'late', 'premium']) {
      const rt = rowsPooled.filter(r => r.draftTierOwnClass === tier);
      const At = rt.length ? analyzeKCell(rt, SPEC_A) : { verdict: 'INSUFFICIENT', rows: 0, players: 0 };
      const Bt = rt.length ? analyzeKCell(rt, SPEC_B, { studyK: r => r.k2a }) : { verdict: 'INSUFFICIENT', rows: 0, players: 0 };
      const dt = (At.verdict !== 'INSUFFICIENT' && Bt.verdict !== 'INSUFFICIENT') ? pairedDelta(At.orderedRows, At.heldOut, Bt.heldOut) : null;
      tierSplit[tier] = { rows: rt.length, A: { verdict: At.verdict, kFit: At.kFit?.k ?? null }, B: { verdict: Bt.verdict, kFit: Bt.kFit?.k ?? null }, deltaAB: dt ? { mean: r4(dt.mean), ci95: dt.ci95.map(r4), label: dt.label } : null };
    }

    out.subgroups[label] = {
      pooled: {
        A: { rows: A.rows, players: A.players, verdict: A.verdict, kFit: A.kFit?.k ?? null, maePriorOnly: r4(A.error?.priorOnly?.mae ?? null) },
        B: { rows: B.rows, players: B.players, verdict: B.verdict, kFit: B.kFit?.k ?? null, maePriorOnly: r4(B.error?.priorOnly?.mae ?? null) },
        deltaAB: dAB ? { mean: r4(dAB.mean), ci95: dAB.ci95.map(r4), label: dAB.label } : null,
      },
      byPosition,
      diagnostics: {
        nullpick: nullpick && nullpick.verdict !== 'INSUFFICIENT' ? { kFit: nullpick.kFit.k, maeVsA: r4(nullpick.error.fitted.mae) } : null,
        ye1WithPick: withPick && withPick.verdict !== 'INSUFFICIENT' ? { kFit: withPick.kFit.k, maeVsA: r4(withPick.error.fitted.mae) } : null,
        ckA: ckA ? { c: ckA.c, k: ckA.k, boundary: ckA.c === DYN_OPTIMISM_C[0] || ckA.c === DYN_OPTIMISM_C[DYN_OPTIMISM_C.length - 1] } : null,
        ckB: ckB ? { c: ckB.c, k: ckB.k, boundary: ckB.c === DYN_OPTIMISM_C[0] || ckB.c === DYN_OPTIMISM_C[DYN_OPTIMISM_C.length - 1] } : null,
        byDraftTier: tierSplit,
      },
    };
    out.decisions[label] = { arm: chooseB ? 'B' : 'A', deltaAB: dAB ? { mean: r4(dAB.mean), ci95: dAB.ci95.map(r4), label: dAB.label } : null };

    // pin ladder
    if (chooseB) {
      const name = `K_DYN_PROSPECT_B_YE${g}`;
      const { results } = threeRungLadder({ rowsPooled, positions: POSITIONS, spec: SPEC_B, kFixedOf: r => r.k2a });
      for (const pos of POSITIONS) writeThreeRungEntry(P, reuse, name, pos, results[pos] ?? { insufficient: true }, r => r.k2aName);
      out.decisions[label].ladderName = name;
      out.decisions[label].ladders = Object.fromEntries(POSITIONS.map(pos => [pos, results[pos]?.ladder ?? null]));
    } else {
      const name = `K_DYN_PROSPECT_YE${g}`;
      const { results } = twoRungLadder({ rowsPooled, positions: POSITIONS, spec: SPEC_A });
      for (const pos of POSITIONS) writeTwoRungEntry(P, name, pos, results[pos] ?? { insufficient: true });
      out.decisions[label].ladderName = name;
      out.decisions[label].ladders = Object.fromEntries(POSITIONS.map(pos => [pos, results[pos]?.ladder ?? null]));
    }
  }
  addFoldK({ constants: P.constants, fixture: P.fixture });
  return { ...out, constants: P.constants, fixture: P.fixture, pinnedFrom: P.pinnedFrom, reuse };
}

// ─── Q2 — SHORT-recent: history prior vs projection prior (§5.2, §6) ──────────

function runQ2(q2PrimaryRows, q2StaleRows) {
  const P = makePut();
  const reuse = {};
  const Hist = q2PrimaryRows.length ? analyzeKCell(q2PrimaryRows, SPEC_HIST, { studyK: r => r.kStd }) : { verdict: 'INSUFFICIENT', rows: 0, players: 0 };
  const Proj = q2PrimaryRows.length ? analyzeKCell(q2PrimaryRows, SPEC_PROJ_SHORT, { studyK: r => r.k2a }) : { verdict: 'INSUFFICIENT', rows: 0, players: 0 };
  let dHP = null;
  if (Hist.verdict !== 'INSUFFICIENT' && Proj.verdict !== 'INSUFFICIENT') dHP = pairedDelta(Proj.orderedRows, Proj.heldOut, Hist.heldOut);
  const chooseHist = dHP?.label !== 'WORSE';

  const byPosition = {};
  for (const pos of POSITIONS) {
    const rp = q2PrimaryRows.filter(r => r.position === pos);
    const Hp = rp.length ? analyzeKCell(rp, SPEC_HIST, { studyK: r => r.kStd }) : { verdict: 'INSUFFICIENT', rows: 0, players: 0 };
    const Pp = rp.length ? analyzeKCell(rp, SPEC_PROJ_SHORT, { studyK: r => r.k2a }) : { verdict: 'INSUFFICIENT', rows: 0, players: 0 };
    let d = null;
    if (Hp.verdict !== 'INSUFFICIENT' && Pp.verdict !== 'INSUFFICIENT') d = pairedDelta(Pp.orderedRows, Pp.heldOut, Hp.heldOut);
    byPosition[pos] = {
      Hist: { rows: Hp.rows, players: Hp.players, verdict: Hp.verdict, kFit: Hp.kFit?.k ?? null },
      Proj: { rows: Pp.rows, players: Pp.players, verdict: Pp.verdict, kFit: Pp.kFit?.k ?? null },
      deltaHP: d ? { mean: r4(d.mean), ci95: d.ci95.map(r4), label: d.label } : null,
    };
  }

  const recencyCell = q2PrimaryRows.length ? analyzeKCell(q2PrimaryRows, { prior: 'recencyPrior', obs: 'obsPPG', outcome: SPEC.pointsNext.outcome }) : null;
  const staleHist = q2StaleRows.length ? analyzeKCell(q2StaleRows, SPEC_HIST, { studyK: r => r.kStd }) : { verdict: 'INSUFFICIENT', rows: q2StaleRows.length, players: new Set(q2StaleRows.map(r => r.sleeperId)).size };
  const staleProj = q2StaleRows.length ? analyzeKCell(q2StaleRows, SPEC_PROJ_SHORT, { studyK: r => r.k2a }) : { verdict: 'INSUFFICIENT', rows: q2StaleRows.length, players: new Set(q2StaleRows.map(r => r.sleeperId)).size };
  const ckHist = q2PrimaryRows.length ? fitCK(q2PrimaryRows, SPEC_HIST, DYN_OPTIMISM_C) : null;
  const ckProj = q2PrimaryRows.length ? fitCK(q2PrimaryRows, SPEC_PROJ_SHORT, DYN_OPTIMISM_C) : null;

  const decision = { chooseHist, deltaHP: dHP ? { mean: r4(dHP.mean), ci95: dHP.ci95.map(r4), label: dHP.label } : null };

  if (chooseHist) {
    const name = 'K_DYN_POINTS_SHORT_HISTORY';
    const { results } = threeRungLadder({ rowsPooled: q2PrimaryRows, positions: POSITIONS, spec: SPEC_HIST, kFixedOf: r => r.kStd });
    for (const pos of POSITIONS) writeThreeRungEntry(P, reuse, name, pos, results[pos] ?? { insufficient: true }, () => 'K_DYN_POINTS_HISTORY');
    decision.ladderName = name;
    decision.ladders = Object.fromEntries(POSITIONS.map(pos => [pos, results[pos]?.ladder ?? null]));
  } else {
    decision.note = 'ΔHP is WORSE: no wiring recommendation for SHORT. Putting a projection into the history slot is the mismatch 2b-2 rejected.';
  }

  addFoldK({ constants: P.constants, fixture: P.fixture });
  return {
    pooled: {
      Hist: { rows: Hist.rows, players: Hist.players, verdict: Hist.verdict, kFit: Hist.kFit?.k ?? null },
      Proj: { rows: Proj.rows, players: Proj.players, verdict: Proj.verdict, kFit: Proj.kFit?.k ?? null },
      deltaHP: dHP ? { mean: r4(dHP.mean), ci95: dHP.ci95.map(r4), label: dHP.label } : null,
    },
    byPosition, decision,
    diagnostics: {
      recencyPrior: recencyCell && recencyCell.verdict !== 'INSUFFICIENT' ? { kFit: recencyCell.kFit.k, mae: r4(recencyCell.error.fitted.mae) } : null,
      staleHist: { rows: staleHist.rows, players: staleHist.players, verdict: staleHist.verdict, kFit: staleHist.kFit?.k ?? null },
      staleProj: { rows: staleProj.rows, players: staleProj.players, verdict: staleProj.verdict, kFit: staleProj.kFit?.k ?? null },
      ckHist: ckHist ? { c: ckHist.c, k: ckHist.k, boundary: ckHist.c === DYN_OPTIMISM_C[0] || ckHist.c === DYN_OPTIMISM_C[DYN_OPTIMISM_C.length - 1] } : null,
      ckProj: ckProj ? { c: ckProj.c, k: ckProj.k, boundary: ckProj.c === DYN_OPTIMISM_C[0] || ckProj.c === DYN_OPTIMISM_C[DYN_OPTIMISM_C.length - 1] } : null,
    },
    constants: P.constants, fixture: P.fixture, pinnedFrom: P.pinnedFrom, reuse,
  };
}

// ─── Q3 — the KTC anchor (report only, §5.3) ───────────────────────────────────

function runQ3(q1Rows, q1Decisions) {
  // Recommended arm's held-out prediction per subgroup, pooled positions (report-only proxy: the pooled
  // subgroup fit of the recommended arm — the position-level ladder outcome varies by position and is not
  // re-derived here).
  const bands = DYN_DEFAULTS.nBands;
  const bandOf = (n) => bands.findIndex(([lo, hi]) => n >= lo && n <= hi);
  const out = { bySubgroup: {}, byBand: [] };
  const allDu = [], allDr = [];
  for (const g of [0, 1]) {
    const label = `YE${g}`;
    const rows = q1Rows.filter(r => r.ye === g && Number.isFinite(r.peak));
    const arm = q1Decisions[label].arm;
    const spec = arm === 'B' ? SPEC_B : SPEC_A;
    if (!rows.length) { out.bySubgroup[label] = null; continue; }
    const cell = analyzeKCell(rows, spec, arm === 'B' ? { studyK: r => r.k2a } : {});
    if (cell.verdict === 'INSUFFICIENT') { out.bySubgroup[label] = { verdict: 'INSUFFICIENT' }; continue; }
    const du = [], dr = [], clampXn = [], clampY = [];
    cell.orderedRows.forEach((r, i) => {
      const x0 = r[spec.prior], p = r.peak, xn = cell.heldOut[i].pred, y = r[spec.outcome];
      const su0 = modelScore(x0, p);
      du.push(modelScore(xn, p) - su0);
      dr.push(modelScore(y, p) - su0);
      clampXn.push(xn >= p); clampY.push(y >= p);
      allDu.push(modelScore(xn, p) - su0); allDr.push(modelScore(y, p) - su0);
    });
    const absDu = du.map(Math.abs), absDr = dr.map(Math.abs);
    const capRows = cell.orderedRows.filter(r => r.draftTier !== 'premium');
    out.bySubgroup[label] = {
      arm, rows: cell.rows,
      realisedMovement: r4(mean(absDr)), updateModelShare: r4(mean(absDu)),
      updateUnderAnchor: r4(0.4 * mean(absDu)), leftOnTable: r4(0.6 * mean(absDu)),
      leftOnTableShare: r4(mean(absDr) ? (0.6 * mean(absDu)) / mean(absDr) : null),
      capturedShare: r4(1 - mean(du.map((v, i) => Math.abs(dr[i] - v))) / mean(absDr)),
      rankAgreement: r4(spearman ? spearman(du, dr) : null),
      clampShareXn: r4(mean(clampXn.map(Number))), clampShareY: r4(mean(clampY.map(Number))),
      capOf35Share: r4(capRows.length / cell.rows),
    };
  }
  out.byBand = bands.map(([lo, hi], i) => ({ band: `${lo}-${hi}`, rows: 0 }));  // populated per-row below
  const rowsAll = [];
  for (const g of [0, 1]) {
    const rows = q1Rows.filter(r => r.ye === g && Number.isFinite(r.peak));
    rowsAll.push(...rows);
  }
  for (const r of rowsAll) {
    const idx = bandOf(r.n);
    if (idx >= 0) out.byBand[idx].rows++;
  }
  return out;
}

// ─── §5.4 Excluded-population report ───────────────────────────────────────────

function excludedStat(rs, priorField) {
  const pri = rs.map(r => r[priorField]).filter(Number.isFinite);
  const diff = rs.filter(r => Number.isFinite(r[priorField]) && Number.isFinite(r.obsPPG)).map(r => r.obsPPG - r[priorField]);
  return { count: rs.length, players: new Set(rs.map(r => r.sleeperId)).size, meanPrior: r4(mean(pri)), meanObsMinusPrior: r4(mean(diff)) };
}

function buildExcluded({ noOutcomeRows: noOutcome, q1Rows, q2PrimaryRows, q2StaleRows, routeMismatchRows, draftYearUnusableRows, ye1Rookie0Rows }) {
  return {
    q1: {
      ye01PlayerSeasons: { rows: q1Rows.length + routeMismatchRows.length, players: new Set([...q1Rows, ...routeMismatchRows].map(r => r.sleeperId)).size },
      routeMismatch: excludedStat(routeMismatchRows, 'projPrior'),
      draftYearUnusable: { count: draftYearUnusableRows.length, players: new Set(draftYearUnusableRows.map(r => r.sleeperId)).size },
      ye1InRookie0: excludedStat(ye1Rookie0Rows, 'projPrior'),
      withoutS1Outcome: { count: noOutcome.filter(r => r.ye === 0 || r.ye === 1).length },
    },
    q2: {
      recent: excludedStat(q2PrimaryRows, 'histPrior'),
      stale: excludedStat(q2StaleRows, 'histPrior'),
      withoutS1Outcome: { count: noOutcome.filter(r => r.arm === 'X-short').length },
    },
  };
}

// ─── runInSeasonDyn (§4) ────────────────────────────────────────────────────────

export function runInSeasonDyn({ load = INSEASON_DYN_LOAD, log = () => {}, assemble = assembleSeason } = {}) {
  const t0 = Date.now();
  const g = guardLoad(load, { maxLoadSeason: 2025 });
  const reconciliation = runReconciliation(g, { fromYear: 2012, toYear: 2025 });
  log(`reconciliation ${reconciliation.pass}/${reconciliation.population} (${reconciliation.rate.toFixed(4)})`);

  const inputs = loadFactorInputs({ fromYear: 2013, toYear: 2024, basis: 'half_ppr', withFactorMultipliers: true, historyFloor: HISTORY_FLOOR, load: g });
  const playerIds = g.loadPlayerIds();
  const env = { load: g, defaults: IN_SEASON_DEFAULTS, gamelogsIdx: makeGamelogsIndex(g), scheduleIdx: makeScheduleIndex(g), playerIds };
  const peakByS = buildPeakByS(inputs);
  const pickProxy = buildPickProxy(playerIds, inputs);
  const constants2a = typeof load.loadInSeasonConstants === 'function' ? load.loadInSeasonConstants() : null;
  const ctx = { inputs, playerIds, peakByS, pickProxy, constants2a };

  const allRows = [];
  const noOutcomeRows = [];
  for (let S = DYN_DEFAULTS.seasons.from; S <= DYN_DEFAULTS.seasons.to; S++) {
    const a = assemble(S, env);
    let kept = 0;
    for (const row of a.rows) {
      if (Number.isFinite(row.nextPPG)) { allRows.push(augmentRow(row, ctx)); kept++; continue; }
      const b = playerIds?.bySleeper?.[row.sleeperId];
      const draftYear = (b?.draftYear != null && b.draftYear > 0) ? b.draftYear : null;
      noOutcomeRows.push({ sleeperId: row.sleeperId, S, arm: row.arm, ye: draftYear != null ? S - draftYear : null });
    }
    log(`S=${S}: ${kept} rows`);
  }

  const q1Rows = [], q2PrimaryRows = [], q2StaleRows = [], routeMismatchRows = [], noLRows = [];
  const draftYearUnusableRows = allRows.filter(r => r.draftYear == null && (r.arm === 'X-rookie0' || r.arm === 'X-rookie1p'));
  const ye1Rookie0Rows = allRows.filter(r => r.ye === 1 && r.arm === 'X-rookie0');
  for (const row of allRows) {
    const c = classifyRow(row);
    if (c.q1) q1Rows.push(row);
    if (c.q2Primary) q2PrimaryRows.push(row);
    if (c.q2Stale) q2StaleRows.push(row);
    if (c.routeMismatch) routeMismatchRows.push(row);
    if (c.q2NoL) noLRows.push(row);
  }
  if (noLRows.length > 0) {
    throw new Error(`[inseason-dyn] Q2 noL drift: ${noLRows.length} X-short rows have L === null — historyPriorOf and rookiePathStateAt have drifted`);
  }
  const routeMismatchRate = q1Rows.length + routeMismatchRows.length > 0 ? routeMismatchRows.length / (q1Rows.length + routeMismatchRows.length) : 0;

  const q1 = runQ1(q1Rows);
  const q2 = runQ2(q2PrimaryRows, q2StaleRows);
  const q3 = runQ3(q1Rows, q1.decisions);
  const excluded = buildExcluded({ noOutcomeRows, q1Rows, q2PrimaryRows, q2StaleRows, routeMismatchRows, draftYearUnusableRows, ye1Rookie0Rows });

  const constants = { ...q1.constants, ...q2.constants };
  const fixture = { ...q1.fixture, ...q2.fixture };
  const pinnedFrom = { ...q1.pinnedFrom, ...q2.pinnedFrom };
  const reuse = { ...q1.reuse, ...q2.reuse };

  const generatedAt = new Date().toISOString();
  const constantsFile = {
    source: `sleeper-dashboard-data backtests/${generatedAt.slice(0, 10)}-inseason-dyn-constants.json (node bin/backtest.mjs --inseason --dynasty --write)`,
    generatedAt, basis: 'half_ppr',
    fit: {
      kTenths: [0, 400], loss: 'sum of squared error, rows equal weight', tie: 'smaller k', pin: 'Math.round(k*2)/2',
      prospectPrior: 'App computeProspectScore prior PPG, blended 8:min(gp,12) with the S-1 season (D2); D4 pick proxy; D5 YE1 pick=null; D6 age at kickoff.',
      historyPrior: 'The last qualifying season (gp>=8, <=S-2) PPG (D7), the slot K_DYN_POINTS_HISTORY substitutes app-side.',
      priorCalibration: "Each k is fitted against its prior's miscalibration: re-fit if POSITION_PRIOR_PPG/the age or draft multipliers (arm A), the rookie calibration (arm B), or the projection (Q2 projection prior) change.",
    },
    decisions: { q1: { YE0: q1.decisions.YE0.arm, YE1: q1.decisions.YE1.arm }, q2: q2.decision.chooseHist ? 'history' : 'no-recommendation' },
    constants, fixture, reuse,
  };
  const bad = verifyConstants(constantsFile);
  if (bad.length) throw new Error(`[inseason-dyn] constants do not re-derive from their fixture: ${JSON.stringify(bad.slice(0, 5))}`);

  const meta = {
    generatedAt, basis: 'half_ppr', seasons: DYN_DEFAULTS.seasons, runtimeMs: Date.now() - t0,
    routeMismatchRate: r4(routeMismatchRate),
  };
  const coverage = {
    rowsTotal: allRows.length, q1Rows: q1Rows.length, q2PrimaryRows: q2PrimaryRows.length, q2StaleRows: q2StaleRows.length,
    routeMismatchRows: routeMismatchRows.length,
  };

  return { meta, reconciliation, coverage, excluded, q1, q2, q3, pinnedFrom, constants: constantsFile };
}

// ─── Verdict markdown (§7) ──────────────────────────────────────────────────────

const f = (v, d = 2) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(d));
const ciStr = (c) => (c ? `[${f(c[0], 1)}, ${f(c[1], 1)}]` : '—');

function constantsTable(constants, reuse) {
  const lines = ['| name | pos | k | ci95 | basis |', '|---|---|---|---|---|'];
  for (const [name, cells] of Object.entries(constants)) {
    for (const [pos, e] of Object.entries(cells)) lines.push(`| ${name} | ${pos} | ${f(e.k, 1)} | ${ciStr(e.ci95)} | ${e.basis} |`);
  }
  for (const [key, r] of Object.entries(reuse)) {
    const [name, pos] = key.split('|');
    lines.push(`| ${name} | ${pos} | ${r.k.map(v => f(v, 1)).join('/')} | — | reuse (${r.reuses.join(', ')}) |`);
  }
  return lines.join('\n');
}

export function buildInSeasonDynVerdictMarkdown(result) {
  const { q1, q2, q3, excluded, constants, meta } = result;
  const lines = [];
  lines.push('# In-season evidence — Phase 2c: dynasty-side (rookies and SHORT veterans) verdict', '');
  lines.push(`**Q1 — prospect prior.** YE0: arm ${q1.decisions.YE0.arm} (ΔAB ${q1.decisions.YE0.deltaAB?.label ?? '—'}, mean ${f(q1.decisions.YE0.deltaAB?.mean, 3)}, CI ${ciStr(q1.decisions.YE0.deltaAB?.ci95)}). YE1: arm ${q1.decisions.YE1.arm} (ΔAB ${q1.decisions.YE1.deltaAB?.label ?? '—'}, mean ${f(q1.decisions.YE1.deltaAB?.mean, 3)}, CI ${ciStr(q1.decisions.YE1.deltaAB?.ci95)}).`, '');
  lines.push(`**Q2 — SHORT-recent prior.** ${q2.decision.chooseHist ? 'History prior' : 'No wiring recommendation'} (ΔHP ${q2.decision.deltaHP?.label ?? '—'}, mean ${f(q2.decision.deltaHP?.mean, 3)}, CI ${ciStr(q2.decision.deltaHP?.ci95)}).`, '');
  lines.push('**Q3 — the KTC anchor.** Report only; see §Q3 below. Not measurable yet: whether KTC itself moves with in-season evidence (KTC history starts 2026-05-18).', '');
  lines.push('## Constants / reuse', '', constantsTable(constants.constants, constants.reuse), '');
  lines.push('## §Prior calibration (read before using these k)', '', constants.fit.priorCalibration, '');
  lines.push('## §Q1', '');
  for (const g of [0, 1]) {
    const label = `YE${g}`;
    const s = q1.subgroups[label];
    lines.push(`**${label}** — A: k=${f(s.pooled.A.kFit, 1)} (${s.pooled.A.verdict}, rows=${s.pooled.A.rows}), prior-only MAE=${f(s.pooled.A.maePriorOnly, 2)}. B: k=${f(s.pooled.B.kFit, 1)} (${s.pooled.B.verdict}, rows=${s.pooled.B.rows}), prior-only MAE=${f(s.pooled.B.maePriorOnly, 2)}. ΔAB=${s.pooled.deltaAB?.label ?? '—'}.`);
  }
  lines.push('', '## §Q2', '');
  lines.push(`Hist: k=${f(q2.pooled.Hist.kFit, 1)} (${q2.pooled.Hist.verdict}, rows=${q2.pooled.Hist.rows}). Proj: k=${f(q2.pooled.Proj.kFit, 1)} (${q2.pooled.Proj.verdict}, rows=${q2.pooled.Proj.rows}). ΔHP=${q2.pooled.deltaHP?.label ?? '—'}.`);
  lines.push('', '## §Q3', '');
  for (const g of [0, 1]) {
    const label = `YE${g}`;
    const s = q3.bySubgroup[label];
    if (!s || s.verdict === 'INSUFFICIENT') { lines.push(`**${label}**: INSUFFICIENT.`); continue; }
    lines.push(`**${label}** (arm ${s.arm}, rows=${s.rows}): realised movement=${f(s.realisedMovement, 2)}, model-share update=${f(s.updateModelShare, 2)}, left on table=${f(s.leftOnTable, 2)} (${f((s.leftOnTableShare ?? 0) * 100, 1)}% of realised movement), captured share=${f(s.capturedShare, 3)}, rank agreement=${f(s.rankAgreement, 3)}, cap-of-35 row share=${f(s.capOf35Share, 3)}.`);
  }
  lines.push('', '## Excluded population', '');
  lines.push(`Q1: YE<=1 player-seasons ${excluded.q1.ye01PlayerSeasons.rows} (players ${excluded.q1.ye01PlayerSeasons.players}). routeMismatch ${excluded.q1.routeMismatch.count} (rate ${f(meta.routeMismatchRate * 100, 2)}%). draftYear unusable ${excluded.q1.draftYearUnusable.count}. YE1-in-rookie0 ${excluded.q1.ye1InRookie0.count}. Without S+1 outcome ${excluded.q1.withoutS1Outcome.count}.`);
  lines.push(`Q2: SHORT-recent ${excluded.q2.recent.count}, SHORT-stale ${excluded.q2.stale.count}. Without S+1 outcome ${excluded.q2.withoutS1Outcome.count}.`);
  lines.push('', '## Limitations', '');
  lines.push('- **Basis:** pinned half_ppr — k is dimensionless; a league-basis refit stays with backlog D-45.');
  lines.push('- **D4 pick proxy:** a 12-team, 5-round league shape applied to any league; the actual league draft is not reconstructable.');
  lines.push('- **D5 YE1 quirk:** the app\'s `selectRookieDraft` reads only the most recent rookie draft, so every second-year player gets `draftMultiplier(null) = 0.75` and loses the premium-pick exemption. Reported, not fixed here.');
  lines.push('- **D6 age date:** whole years on `${S}-09-01` from `birthdate`; `player.age ?? 23` is the app default when null.');
  lines.push('- **Survivorship:** more than half of SHORT player-seasons and a large share of rookie-path player-seasons have no S+1 outcome (busts vanish from every fitted number).');
  lines.push('- **KTC unmeasurable:** KTC snapshot history starts 2026-05-18; whether KTC itself reacts to in-season evidence is untestable until ~Jan 2027 (rest-of-season) / ~Jan 2028 (S+1 graded).');
  lines.push('- The prospect score\'s other inputs (the KTC anchor at 60%, the peak clamp, the cap of 35) are reported (§Q3), not fitted.');
  lines.push('- **Fixed-rung leakage:** a ladder rung that reuses a 2a-pinned or `K_DYN_POINTS_HISTORY` k was fitted on other rows, including rows from the held-out season — this favours the fixed rung, the conservative direction.');
  lines.push('', '**Reproduce:** `node bin/backtest.mjs --inseason --dynasty --write`', '');
  return lines.join('\n');
}

// ─── Artifacts (§7) ──────────────────────────────────────────────────────────

export function writeInSeasonDynArtifacts({ result, verdictMd }) {
  const date = result.meta.generatedAt.slice(0, 10);
  const panelPath = `backtests/${date}-inseason-dyn-panel.json`;
  const constantsPath = `backtests/${date}-inseason-dyn-constants.json`;
  const verdictPath = `grading/${date}-inseason-dyn-verdict.md`;
  const { constants, ...panel } = result;
  const panelJson = JSON.stringify({ ...panel, pinnedFrom: result.pinnedFrom }, null, 2) + '\n';
  const constantsJson = formatConstantsJson(constants);
  if (Buffer.byteLength(panelJson) > ARTIFACT_CAPS.panelBytes) throw new Error(`[inseason-dyn] panel artifact ${Buffer.byteLength(panelJson)} B exceeds the ${ARTIFACT_CAPS.panelBytes} B cap`);
  if (Buffer.byteLength(constantsJson) > ARTIFACT_CAPS.constantsBytes) throw new Error(`[inseason-dyn] constants artifact ${Buffer.byteLength(constantsJson)} B exceeds the ${ARTIFACT_CAPS.constantsBytes} B cap`);
  fs.mkdirSync(repoPath('backtests'), { recursive: true });
  fs.mkdirSync(repoPath('grading'), { recursive: true });
  fs.writeFileSync(repoPath(panelPath), panelJson, 'utf8');
  fs.writeFileSync(repoPath(constantsPath), constantsJson, 'utf8');
  fs.writeFileSync(repoPath(verdictPath), verdictMd.endsWith('\n') ? verdictMd : verdictMd + '\n', 'utf8');
  return { panelPath, panelBytes: Buffer.byteLength(panelJson), constantsPath, constantsBytes: Buffer.byteLength(constantsJson), verdictPath };
}

// ─── CLI entry point ────────────────────────────────────────────────────────────

export function inSeasonDynMain({
  load = INSEASON_DYN_LOAD, write = false, asJson = false, writeArtifacts = writeInSeasonDynArtifacts,
  log = console.log, logErr = console.error,
} = {}) {
  try {
    const result = runInSeasonDyn({ load, log: (m) => logErr(`[backtest] ${m}`) });
    const verdictMd = buildInSeasonDynVerdictMarkdown(result);
    if (write) {
      const w = writeArtifacts({ result, verdictMd });
      logErr(`[backtest] Wrote ${w.panelPath} (${w.panelBytes} B), ${w.constantsPath} (${w.constantsBytes} B), ${w.verdictPath}`);
    }
    log(asJson ? JSON.stringify(result, null, 2) : verdictMd);
    return 0;
  } catch (err) {
    if (err instanceof ReconciliationStop) {
      logErr(`[backtest] ${err.message}`);
      return 1;
    }
    throw err;
  }
}
