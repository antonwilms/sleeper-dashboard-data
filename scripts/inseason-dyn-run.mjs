/**
 * scripts/inseason-dyn-run.mjs — dynasty-side (rookies + SHORT veterans) in-season k-fit adapter
 * (`bin/backtest.mjs --inseason --dynasty`). Task file:
 * .claude/tasks/in-season-evidence-2c-dynasty-backtest.md (see also its `## Fix pass 1`). Offline
 * analysis only.
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
  ARTIFACT_CAPS, SPEC, QB_PRIOR_MODELS, loadQbChainModels, rookiePriorFor, assertPrimaryCoverage,
} from './inseason-run.mjs';
import {
  IN_SEASON_DEFAULTS, analyzeKCell, pairedDelta, blend, fitCK, spearman, assertAligned,
  DYN_DEFAULTS, DYN_OPTIMISM_C, PROSPECT_MIRROR, prospectPriorPPG, modelScore,
  ageOnDate, dynastyPickProxy, historyPriorOf, ladderPick,
  QB_DYN_RESEARCH, satLongerAt, calibrateGroup, fullCalibration, ratioDiffBootstrap, decideQ4, satLongerAggregates, diffDynConstants,
} from '../lib/inSeasonEvidence.mjs';
import { positionOfFrom } from './qb-rookie-level-run.mjs';
import { primaryPassers, coverageFor, priorPPG } from '../lib/qbTakeover.mjs';
import { rookieGroup, GROUPS } from '../lib/qbRookieLevel.mjs';
import { reconstructQbPreseasonShares } from '../lib/projectionFactors.mjs';
import { loadFactorInputs } from './panel-run.mjs';
import { computeSeasonPoints, HISTORY_FLOOR, PANEL_POSITIONS } from '../lib/panel.mjs';
import { reconstructAgeCurves } from '../lib/projectionFactors.mjs';

const POSITIONS = PANEL_POSITIONS;

// Each QB prior is paired with the 2a k file that was fitted under it (qb-rookie-dynasty-research D2).
export const DYN_2A_PIN = Object.freeze({
  legacy: Object.freeze({ path: 'backtests/2026-09-26-inseason-constants.json', commit: 'a071bdb324976203ed915e14a57b88fb740fb0b6' }),
  starter: Object.freeze({ path: 'backtests/2026-10-07-inseason-constants.json', commit: 'f2c3b83b31acc589dac78b6d61a704ac02a57477' }),
});
export const pinnedSourceOf = (qbPrior) => `${DYN_2A_PIN[qbPrior].path} @ ${DYN_2A_PIN[qbPrior].commit}`;

export const INSEASON_DYN_LOAD = {
  ...INSEASON_LOAD,
  loadInSeasonConstants: (qbPrior) => readJson(DYN_2A_PIN[qbPrior].path),
  loadQbRookieLevelConstants: () => readJson('backtests/2026-10-04-qb-rookie-level-constants.json'),
  loadDynBaseline: () => readJson('backtests/2026-09-27-inseason-dyn-constants.json'),
};

const r1 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10);
const r2 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);
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

function deltaOut(d) {
  return d ? { mean: r4(d.mean), ci95: d.ci95.map(r4), label: d.label } : null;
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
    obsPPG: row.obsPPG, nextPPG: row.nextPPG, projPrior: row.pointsPriorNext,
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
      // Fix pass 1 item 1: refitPooled ALSO INSUFFICIENT → write a reuse entry over this position's own
      // rows (not a `basis: 'insufficient'` constant). No ladder runs; the fixed (2a) k is the only rung
      // available.
      for (const pos of insufficient) results[pos] = { reuseOnly: true, rows: rowsPooled.filter(r => r.position === pos) };
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

/**
 * Fix pass 1 item 1: `kFixedOf` is the ladder's own fixed-k row accessor (Q1: r => r.k2a; Q2: r => r.kStd) —
 * used for both the missing-constant check and the recorded k. Every `r.k2a ?? r.kStd` fallback is gone.
 * `reuses`/`k` are recorded over THIS position's rows only, even when the ladder ran on ALL rows for an
 * INSUFFICIENT position (the decision still comes from the ALL-rows ladder; only the recorded entry is
 * per position). When refitPooled is also INSUFFICIENT (`res.reuseOnly`), the entry is a reuse over the
 * position's own rows — never a `basis: 'insufficient'` constant.
 */
function writeThreeRungEntry(P, reuse, name, pos, res, kFixedNameOf, kFixedOf, pinnedSource) {
  if (res.reuseOnly) {
    const rowsForPos = res.rows;
    const missing = rowsForPos.filter(r => kFixedOf(r) == null);
    if (missing.length) {
      throw new Error(`[inseason-dyn] ${name}|${pos}: no ladder ran (own and pooled both INSUFFICIENT) but ${missing.length} row(s) have no fixed-k — the referenced 2a constant/position is absent from the loaded ${pinnedSource}`);
    }
    reuse[`${name}|${pos}`] = { reuses: uniq(rowsForPos.map(kFixedNameOf)), k: uniq(rowsForPos.map(kFixedOf)), source: pinnedSource };
    return;
  }
  if (res.insufficient) {
    P.put(name, pos, { k: null, kFit: null, ci95: null, rows: 0, players: 0, basis: 'insufficient' }, null, `${name}|${pos} INSUFFICIENT`);
    return;
  }
  const chosen = res.ladder.id;
  if (chosen === 'fixed') {
    const rowsForPos = res.rows.filter(r => r.position === pos);
    const missing = rowsForPos.filter(r => kFixedOf(r) == null);
    if (missing.length) {
      throw new Error(`[inseason-dyn] ${name}|${pos}: ladder reached the fixed (reuse) rung but ${missing.length} row(s) have no fixed-k — the referenced 2a constant/position is absent from the loaded ${pinnedSource}`);
    }
    reuse[`${name}|${pos}`] = { reuses: uniq(rowsForPos.map(kFixedNameOf)), k: uniq(rowsForPos.map(kFixedOf)), source: pinnedSource };
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

function runQ1(q1Rows, pinnedSource) {
  const out = { subgroups: {}, decisions: {} };
  const P = makePut();
  const reuse = {};
  const resultsByPos = {};
  for (const g of [0, 1]) {
    const label = `YE${g}`;
    const rowsPooled = q1Rows.filter(r => r.ye === g);
    const A = analyzeKCell(rowsPooled, SPEC_A);
    const B = analyzeKCell(rowsPooled, SPEC_B, { studyK: r => r.k2a });
    let dAB = null;
    if (A.verdict !== 'INSUFFICIENT' && B.verdict !== 'INSUFFICIENT') {
      assertAligned(A.orderedRows, B.orderedRows);
      dAB = pairedDelta(A.orderedRows, A.heldOut, B.heldOut);
    }
    const chooseB = dAB?.label === 'BEATS';
    const byPosition = {};
    for (const pos of POSITIONS) {
      const rp = rowsPooled.filter(r => r.position === pos);
      const Apos = rp.length ? analyzeKCell(rp, SPEC_A) : { verdict: 'INSUFFICIENT', rows: 0, players: 0 };
      const Bpos = rp.length ? analyzeKCell(rp, SPEC_B, { studyK: r => r.k2a }) : { verdict: 'INSUFFICIENT', rows: 0, players: 0 };
      let d = null;
      if (Apos.verdict !== 'INSUFFICIENT' && Bpos.verdict !== 'INSUFFICIENT') {
        assertAligned(Apos.orderedRows, Bpos.orderedRows);
        d = pairedDelta(Apos.orderedRows, Apos.heldOut, Bpos.heldOut);
      }
      byPosition[pos] = {
        A: { rows: Apos.rows, players: Apos.players, verdict: Apos.verdict, kFit: Apos.kFit?.k ?? null, maePriorOnly: r4(Apos.error?.priorOnly?.mae ?? null) },
        B: { rows: Bpos.rows, players: Bpos.players, verdict: Bpos.verdict, kFit: Bpos.kFit?.k ?? null, maePriorOnly: r4(Bpos.error?.priorOnly?.mae ?? null), delta: deltaOut(Bpos.delta) },
        deltaAB: deltaOut(d),
      };
    }

    // diagnostics: nullpick / YE1-with-pick, joint (c,k)
    let nullpickOut = null;
    if (rowsPooled.length) {
      const nullpick = analyzeKCell(rowsPooled, { prior: 'prospectPriorNullPick', obs: 'obsPPG', outcome: SPEC.pointsNext.outcome });
      if (nullpick.verdict !== 'INSUFFICIENT' && A.verdict !== 'INSUFFICIENT') {
        assertAligned(A.orderedRows, nullpick.orderedRows);
        const d = pairedDelta(A.orderedRows, A.heldOut, nullpick.heldOut);
        nullpickOut = { kFit: nullpick.kFit.k, mae: r4(nullpick.error.fitted.mae), maeA: r4(A.error.fitted.mae), delta: deltaOut(d) };
      }
    }
    let withPickOut = null;
    if (g === 1) {
      const rp = rowsPooled.filter(r => Number.isFinite(r.prospectPriorYE1Pick));
      if (rp.length) {
        const withPick = analyzeKCell(rp, { prior: 'prospectPriorYE1Pick', obs: 'obsPPG', outcome: SPEC.pointsNext.outcome });
        const Afor = analyzeKCell(rp, SPEC_A);
        if (withPick.verdict !== 'INSUFFICIENT' && Afor.verdict !== 'INSUFFICIENT') {
          assertAligned(Afor.orderedRows, withPick.orderedRows);
          const d = pairedDelta(Afor.orderedRows, Afor.heldOut, withPick.heldOut);
          withPickOut = { kFit: withPick.kFit.k, mae: r4(withPick.error.fitted.mae), maeA: r4(Afor.error.fitted.mae), delta: deltaOut(d) };
        }
      }
    }
    const ckA = rowsPooled.length ? fitCK(rowsPooled, SPEC_A, DYN_OPTIMISM_C) : null;
    const ckB = rowsPooled.length ? fitCK(rowsPooled, SPEC_B, DYN_OPTIMISM_C) : null;
    const tierSplit = {};
    for (const tier of ['none', 'late', 'premium']) {
      const rt = rowsPooled.filter(r => r.draftTierOwnClass === tier);
      const At = rt.length ? analyzeKCell(rt, SPEC_A) : { verdict: 'INSUFFICIENT', rows: 0, players: 0 };
      const Bt = rt.length ? analyzeKCell(rt, SPEC_B, { studyK: r => r.k2a }) : { verdict: 'INSUFFICIENT', rows: 0, players: 0 };
      let dt = null;
      if (At.verdict !== 'INSUFFICIENT' && Bt.verdict !== 'INSUFFICIENT') {
        assertAligned(At.orderedRows, Bt.orderedRows);
        dt = pairedDelta(At.orderedRows, At.heldOut, Bt.heldOut);
      }
      tierSplit[tier] = { rows: rt.length, A: { verdict: At.verdict, kFit: At.kFit?.k ?? null }, B: { verdict: Bt.verdict, kFit: Bt.kFit?.k ?? null }, deltaAB: deltaOut(dt) };
    }

    out.subgroups[label] = {
      pooled: {
        A: { rows: A.rows, players: A.players, verdict: A.verdict, kFit: A.kFit?.k ?? null, maePriorOnly: r4(A.error?.priorOnly?.mae ?? null) },
        B: { rows: B.rows, players: B.players, verdict: B.verdict, kFit: B.kFit?.k ?? null, maePriorOnly: r4(B.error?.priorOnly?.mae ?? null), delta: deltaOut(B.delta) },
        deltaAB: deltaOut(dAB),
      },
      byPosition,
      diagnostics: {
        nullpick: nullpickOut,
        ye1WithPick: withPickOut,
        ckA: ckA ? { c: r2(ckA.c), k: ckA.k, boundary: ckA.c === DYN_OPTIMISM_C[0] || ckA.c === DYN_OPTIMISM_C[DYN_OPTIMISM_C.length - 1] } : null,
        ckB: ckB ? { c: r2(ckB.c), k: ckB.k, boundary: ckB.c === DYN_OPTIMISM_C[0] || ckB.c === DYN_OPTIMISM_C[DYN_OPTIMISM_C.length - 1] } : null,
        byDraftTier: tierSplit,
      },
    };
    out.decisions[label] = { arm: chooseB ? 'B' : 'A', deltaAB: deltaOut(dAB) };

    // pin ladder
    if (chooseB) {
      const name = `K_DYN_PROSPECT_B_YE${g}`;
      const { results } = threeRungLadder({ rowsPooled, positions: POSITIONS, spec: SPEC_B, kFixedOf: r => r.k2a });
      for (const pos of POSITIONS) writeThreeRungEntry(P, reuse, name, pos, results[pos] ?? { insufficient: true }, r => r.k2aName, r => r.k2a, pinnedSource);
      out.decisions[label].ladderName = name;
      out.decisions[label].ladders = Object.fromEntries(POSITIONS.map(pos => [pos, results[pos]?.ladder ?? null]));
      resultsByPos[label] = results;
    } else {
      const name = `K_DYN_PROSPECT_YE${g}`;
      const { results } = twoRungLadder({ rowsPooled, positions: POSITIONS, spec: SPEC_A });
      for (const pos of POSITIONS) writeTwoRungEntry(P, name, pos, results[pos] ?? { insufficient: true });
      out.decisions[label].ladderName = name;
      out.decisions[label].ladders = Object.fromEntries(POSITIONS.map(pos => [pos, results[pos]?.ladder ?? null]));
      resultsByPos[label] = results;
    }
  }
  addFoldK({ constants: P.constants, fixture: P.fixture });
  return { ...out, constants: P.constants, fixture: P.fixture, pinnedFrom: P.pinnedFrom, reuse, resultsByPos };
}

// ─── Q2 — SHORT-recent: history prior vs projection prior (§5.2, §6) ──────────

function runQ2(q2PrimaryRows, q2StaleRows, pinnedSource) {
  const P = makePut();
  const reuse = {};
  const Hist = q2PrimaryRows.length ? analyzeKCell(q2PrimaryRows, SPEC_HIST, { studyK: r => r.kStd }) : { verdict: 'INSUFFICIENT', rows: 0, players: 0 };
  const Proj = q2PrimaryRows.length ? analyzeKCell(q2PrimaryRows, SPEC_PROJ_SHORT, { studyK: r => r.k2a }) : { verdict: 'INSUFFICIENT', rows: 0, players: 0 };
  let dHP = null;
  if (Hist.verdict !== 'INSUFFICIENT' && Proj.verdict !== 'INSUFFICIENT') {
    assertAligned(Proj.orderedRows, Hist.orderedRows);
    dHP = pairedDelta(Proj.orderedRows, Proj.heldOut, Hist.heldOut);
  }
  const chooseHist = dHP?.label !== 'WORSE';

  const byPosition = {};
  for (const pos of POSITIONS) {
    const rp = q2PrimaryRows.filter(r => r.position === pos);
    const Hp = rp.length ? analyzeKCell(rp, SPEC_HIST, { studyK: r => r.kStd }) : { verdict: 'INSUFFICIENT', rows: 0, players: 0 };
    const Pp = rp.length ? analyzeKCell(rp, SPEC_PROJ_SHORT, { studyK: r => r.k2a }) : { verdict: 'INSUFFICIENT', rows: 0, players: 0 };
    let d = null;
    if (Hp.verdict !== 'INSUFFICIENT' && Pp.verdict !== 'INSUFFICIENT') {
      assertAligned(Pp.orderedRows, Hp.orderedRows);
      d = pairedDelta(Pp.orderedRows, Pp.heldOut, Hp.heldOut);
    }
    byPosition[pos] = {
      Hist: { rows: Hp.rows, players: Hp.players, verdict: Hp.verdict, kFit: Hp.kFit?.k ?? null, delta: deltaOut(Hp.delta) },
      Proj: { rows: Pp.rows, players: Pp.players, verdict: Pp.verdict, kFit: Pp.kFit?.k ?? null, delta: deltaOut(Pp.delta) },
      deltaHP: deltaOut(d),
    };
  }

  const recencyCell = q2PrimaryRows.length ? analyzeKCell(q2PrimaryRows, { prior: 'recencyPrior', obs: 'obsPPG', outcome: SPEC.pointsNext.outcome }) : null;
  const staleHist = q2StaleRows.length ? analyzeKCell(q2StaleRows, SPEC_HIST, { studyK: r => r.kStd }) : { verdict: 'INSUFFICIENT', rows: q2StaleRows.length, players: new Set(q2StaleRows.map(r => r.sleeperId)).size };
  const staleProj = q2StaleRows.length ? analyzeKCell(q2StaleRows, SPEC_PROJ_SHORT, { studyK: r => r.k2a }) : { verdict: 'INSUFFICIENT', rows: q2StaleRows.length, players: new Set(q2StaleRows.map(r => r.sleeperId)).size };
  const ckHist = q2PrimaryRows.length ? fitCK(q2PrimaryRows, SPEC_HIST, DYN_OPTIMISM_C) : null;
  const ckProj = q2PrimaryRows.length ? fitCK(q2PrimaryRows, SPEC_PROJ_SHORT, DYN_OPTIMISM_C) : null;

  const decision = { chooseHist, deltaHP: deltaOut(dHP) };

  let resultsByPos = null;
  if (chooseHist) {
    const name = 'K_DYN_POINTS_SHORT_HISTORY';
    const { results } = threeRungLadder({ rowsPooled: q2PrimaryRows, positions: POSITIONS, spec: SPEC_HIST, kFixedOf: r => r.kStd });
    for (const pos of POSITIONS) writeThreeRungEntry(P, reuse, name, pos, results[pos] ?? { insufficient: true }, () => 'K_DYN_POINTS_HISTORY', r => r.kStd, pinnedSource);
    decision.ladderName = name;
    decision.ladders = Object.fromEntries(POSITIONS.map(pos => [pos, results[pos]?.ladder ?? null]));
    resultsByPos = results;
  } else {
    decision.note = 'ΔHP is WORSE: no wiring recommendation for SHORT. Putting a projection into the history slot is the mismatch 2b-2 rejected.';
  }

  addFoldK({ constants: P.constants, fixture: P.fixture });
  return {
    pooled: {
      Hist: { rows: Hist.rows, players: Hist.players, verdict: Hist.verdict, kFit: Hist.kFit?.k ?? null, delta: deltaOut(Hist.delta) },
      Proj: { rows: Proj.rows, players: Proj.players, verdict: Proj.verdict, kFit: Proj.kFit?.k ?? null, delta: deltaOut(Proj.delta) },
      deltaHP: deltaOut(dHP),
    },
    byPosition, decision,
    diagnostics: {
      recencyPrior: recencyCell && recencyCell.verdict !== 'INSUFFICIENT' ? { kFit: recencyCell.kFit.k, mae: r4(recencyCell.error.fitted.mae) } : null,
      staleHist: { rows: staleHist.rows, players: staleHist.players, verdict: staleHist.verdict, kFit: staleHist.kFit?.k ?? null },
      staleProj: { rows: staleProj.rows, players: staleProj.players, verdict: staleProj.verdict, kFit: staleProj.kFit?.k ?? null },
      ckHist: ckHist ? { c: r2(ckHist.c), k: ckHist.k, boundary: ckHist.c === DYN_OPTIMISM_C[0] || ckHist.c === DYN_OPTIMISM_C[DYN_OPTIMISM_C.length - 1] } : null,
      ckProj: ckProj ? { c: r2(ckProj.c), k: ckProj.k, boundary: ckProj.c === DYN_OPTIMISM_C[0] || ckProj.c === DYN_OPTIMISM_C[DYN_OPTIMISM_C.length - 1] } : null,
    },
    constants: P.constants, fixture: P.fixture, pinnedFrom: P.pinnedFrom, reuse, resultsByPos,
  };
}

// ─── Q3 — the KTC anchor (report only, §5.3, fix pass 1 item 4) ───────────────

/** Builds a per-row predictor from a Q1 ladder result: xn = the chosen rung's held-out prediction. */
function predictorFor(res, spec, kFixedOf) {
  if (!res || res.insufficient || res.reuseOnly || !res.ladder) return null;
  const id = res.ladder.id;
  if (id === 'fixed') return (row) => blend(row[spec.prior], row.obsPPG, row.n, kFixedOf(row));
  if (id === 'pooled') {
    const pooledCell = res.refitPooled ?? res.pooled;
    const foldKOf = new Map(pooledCell.folds.map(f => [f.S, f.k]));
    return (row) => blend(row[spec.prior], row.obsPPG, row.n, foldKOf.get(row.S));
  }
  // 'own'
  const own = res.own;
  const byKey = new Map(own.orderedRows.map((r, i) => [`${r.sleeperId}|${r.S}|${r.W}`, own.heldOut[i].pred]));
  return (row) => byKey.get(`${row.sleeperId}|${row.S}|${row.W}`) ?? null;
}

function buildQ3Items(q1Rows, q1Decisions, resultsByPos) {
  const items = [];
  for (const g of [0, 1]) {
    const label = `YE${g}`;
    const arm = q1Decisions[label].arm;
    const spec = arm === 'B' ? SPEC_B : SPEC_A;
    const resPos = resultsByPos[label] ?? {};
    const predictors = {};
    for (const pos of POSITIONS) predictors[pos] = predictorFor(resPos[pos], spec, r => r.k2a);
    const rows = q1Rows.filter(r => r.ye === g && Number.isFinite(r.peak) && predictors[r.position]);
    for (const row of rows) {
      const xn = predictors[row.position](row);
      if (!Number.isFinite(xn)) continue;
      items.push({ g, label, arm, position: row.position, n: row.n, x0: row[spec.prior], xn, y: row.nextPPG, p: row.peak, draftTier: row.draftTier });
    }
  }
  return items;
}

const EMPTY_Q3_METRICS = {
  rows: 0, realisedMovement: null, updateModelShare: null, updateUnderAnchor: null, leftOnTable: null,
  leftOnTableShare: null, capturedShare: null, rankAgreement: null, clampShareXn: null, clampShareY: null,
  peakClampExcess: null, capOf35: { rowShare: null, shareOver35: null, meanExcessXn: null, meanExcessY: null },
};

/** Full §5.3 metric set on one slice of Q3 items ({ x0, xn, y, p, draftTier, n }). */
function q3Metrics(items) {
  if (!items.length) return { ...EMPTY_Q3_METRICS, capOf35: { ...EMPTY_Q3_METRICS.capOf35 } };
  const du = [], dr = [], clampXn = [], clampY = [], excess = [];
  for (const it of items) {
    const su0 = modelScore(it.x0, it.p);
    du.push(modelScore(it.xn, it.p) - su0);
    dr.push(modelScore(it.y, it.p) - su0);
    clampXn.push(it.xn >= it.p ? 1 : 0);
    clampY.push(it.y >= it.p ? 1 : 0);
    excess.push(Math.max((100 * it.y / it.p) - 100, 0));
  }
  const absDu = du.map(Math.abs), absDr = dr.map(Math.abs);
  const mDu = mean(absDu), mDr = mean(absDr);
  const capRows = items.filter(it => it.draftTier !== 'premium');
  const capXn = capRows.map(it => modelScore(it.xn, it.p));
  const capY = capRows.map(it => modelScore(it.y, it.p));
  return {
    rows: items.length,
    realisedMovement: r4(mDr),
    updateModelShare: r4(mDu),
    updateUnderAnchor: r4(0.4 * mDu),
    leftOnTable: r4(0.6 * mDu),
    leftOnTableShare: r4(mDr ? (0.6 * mDu) / mDr : null),
    capturedShare: r4(mDr ? 1 - mean(du.map((v, i) => Math.abs(dr[i] - v))) / mDr : null),
    rankAgreement: r4(spearman(du, dr)),
    clampShareXn: r4(mean(clampXn)),
    clampShareY: r4(mean(clampY)),
    peakClampExcess: r4(mean(excess)),
    capOf35: {
      rowShare: r4(capRows.length / items.length),
      shareOver35: capRows.length ? r4(mean(capXn.map(v => v > 35 ? 1 : 0))) : null,
      meanExcessXn: capRows.length ? r4(mean(capXn.map(v => Math.max(v - 35, 0)))) : null,
      meanExcessY: capRows.length ? r4(mean(capY.map(v => Math.max(v - 35, 0)))) : null,
    },
  };
}

function runQ3(q1Rows, q1Decisions, resultsByPos) {
  const items = buildQ3Items(q1Rows, q1Decisions, resultsByPos);
  const bands = DYN_DEFAULTS.nBands;
  const out = { pooled: q3Metrics(items), bySubgroup: {}, byBand: [], bySubgroupBand: {} };
  for (const g of [0, 1]) {
    const label = `YE${g}`;
    const its = items.filter(it => it.g === g);
    out.bySubgroup[label] = its.length ? { arm: q1Decisions[label].arm, ...q3Metrics(its) } : { verdict: 'INSUFFICIENT' };
  }
  out.byBand = bands.map(([lo, hi]) => ({ band: `${lo}-${hi}`, ...q3Metrics(items.filter(it => it.n >= lo && it.n <= hi)) }));
  for (const g of [0, 1]) {
    const label = `YE${g}`;
    out.bySubgroupBand[label] = bands.map(([lo, hi]) => ({ band: `${lo}-${hi}`, ...q3Metrics(items.filter(it => it.g === g && it.n >= lo && it.n <= hi)) }));
  }
  return out;
}

// ─── §5.4 Excluded-population report (fix pass 1 item 2 — done in full) ───────

function groupStat(rs, priorFields) {
  const rows = rs.length;
  const playerSeasons = new Set(rs.map(r => `${r.sleeperId}|${r.S}`)).size;
  const players = new Set(rs.map(r => r.sleeperId)).size;
  const meanN = r4(mean(rs.map(r => r.n).filter(Number.isFinite)));
  const priors = {};
  for (const f of priorFields) {
    const vals = rs.map(r => r[f]).filter(Number.isFinite);
    const diffs = rs.filter(r => Number.isFinite(r[f]) && Number.isFinite(r.obsPPG)).map(r => r.obsPPG - r[f]);
    priors[f] = { meanPrior: r4(mean(vals)), meanObsMinusPrior: r4(mean(diffs)) };
  }
  return { rows, playerSeasons, players, meanN, priors };
}

const EMPTY_GROUP = { rows: 0, playerSeasons: 0, players: 0, meanN: null, priors: {} };

function buildExcluded({ preFilterRows, allRows, q1Rows, q2PrimaryRows, q2StaleRows, routeMismatchRows, ye1Rookie0Rows }) {
  const ye01Rows = preFilterRows.filter(r => r.ye === 0 || r.ye === 1);
  const noOutcomeRows = preFilterRows.filter(r => !Number.isFinite(r.nextPPG));
  const noOutcomeQ1 = noOutcomeRows.filter(r => r.ye === 0 || r.ye === 1);
  const noOutcomeQ1Absent = noOutcomeQ1.filter(r => (r.nextGp ?? 0) === 0);
  const noOutcomeQ1Gp = noOutcomeQ1.filter(r => (r.nextGp ?? 0) > 0);
  const draftYearUnusableRows = preFilterRows.filter(r => r.draftYear == null && (r.arm === 'X-rookie0' || r.arm === 'X-rookie1p'));
  const ye23NoQualRows = preFilterRows.filter(r => (r.ye === 2 || r.ye === 3) && (r.arm === 'X-rookie0' || r.arm === 'X-rookie1p'));

  const noOutcomeQ2 = noOutcomeRows.filter(r => r.arm === 'X-short');
  const noOutcomeQ2Absent = noOutcomeQ2.filter(r => (r.nextGp ?? 0) === 0);
  const noOutcomeQ2Gp = noOutcomeQ2.filter(r => (r.nextGp ?? 0) > 0);
  const q2NoProjPriorRows = allRows.filter(r => r.arm === 'X-short' && r.L === r.S - 2 && !Number.isFinite(r.projPrior));

  return {
    q1: {
      ye01: groupStat(ye01Rows, ['prospectPrior', 'projPrior']),
      noOutcomeAbsent: groupStat(noOutcomeQ1Absent, ['prospectPrior', 'projPrior']),
      noOutcomeGpUnder6: groupStat(noOutcomeQ1Gp, ['prospectPrior', 'projPrior']),
      draftYearUnusable: draftYearUnusableRows.length ? groupStat(draftYearUnusableRows, ['prospectPrior', 'projPrior']) : { ...EMPTY_GROUP },
      routeMismatch: routeMismatchRows.length ? groupStat(routeMismatchRows, ['projPrior']) : { ...EMPTY_GROUP },
      ye1InRookie0: ye1Rookie0Rows.length ? groupStat(ye1Rookie0Rows, ['prospectPrior', 'projPrior']) : { ...EMPTY_GROUP },
      ye23NoQualifyingSeason: ye23NoQualRows.length ? groupStat(ye23NoQualRows, ['prospectPrior', 'projPrior']) : { ...EMPTY_GROUP },
    },
    q2: {
      recent: q2PrimaryRows.length ? groupStat(q2PrimaryRows, ['histPrior', 'projPrior']) : { ...EMPTY_GROUP },
      stale: q2StaleRows.length ? groupStat(q2StaleRows, ['histPrior', 'projPrior']) : { ...EMPTY_GROUP },
      noL: { ...EMPTY_GROUP }, // always 0 — the noL-drift guard throws before this report is reached otherwise
      noOutcomeAbsent: groupStat(noOutcomeQ2Absent, ['histPrior', 'projPrior']),
      noOutcomeGpUnder6: groupStat(noOutcomeQ2Gp, ['histPrior', 'projPrior']),
      noProjPrior: q2NoProjPriorRows.length ? groupStat(q2NoProjPriorRows, ['histPrior']) : { ...EMPTY_GROUP },
    },
  };
}

// ─── Q4 / Q5 — qb-rookie-dynasty-research (L4). Aggregates only (D8); never a per-player or per-rookie-season value. ───

const REG_POSITIONS = ['QB', 'RB', 'WR', 'TE'];
const GROUP_ORDER = GROUPS;

/** Season-totals PPG (half-PPR fantasyPoints / gamesPlayed) with the harness's nextMinGames floor; null above the load ceiling. */
function ppgFrom(g, season, pid) {
  if (season > IN_SEASON_DEFAULTS.maxLoadSeason) return null;   // guardLoad throws above the ceiling — test before calling
  const rec = g.loadSeasonTotals(season)?.[pid];
  return (rec?.gamesPlayed ?? 0) >= IN_SEASON_DEFAULTS.nextMinGames && Number.isFinite(rec.fantasyPoints) ? rec.fantasyPoints / rec.gamesPlayed : null;
}

/** Week-1 chart roles per season for every QB on the chart (the Q5 population and the Q4c role split). */
function weekOneRoles(g, env, playerIds) {
  const bySeason = new Map();
  for (let S = DYN_DEFAULTS.seasons.from; S <= DYN_DEFAULTS.seasons.to; S++) {
    const depthFile = g.loadDepth(S);
    const totalsM1 = g.loadSeasonTotals(S - 1);
    const seen = new Set();
    const qbs = [];
    const teams = depthFile?.weeks?.[1] ?? {};
    for (const T of Object.keys(teams)) {
      const arr = teams[T]?.QB;
      if (!Array.isArray(arr)) continue;
      arr.forEach((pid, i) => {
        if (pid == null || seen.has(pid)) return;
        seen.add(pid);
        qbs.push({ id: pid, team: T, order: i + 1, rookie: playerIds?.bySleeper?.[pid]?.draftYear === S });
      });
    }
    const shares = reconstructQbPreseasonShares({ qbs, priorOf: (pid) => priorPPG(totalsM1?.[pid]), models: env.qbChainModels });
    bySeason.set(S, qbs.map(q => ({ pid: q.id, team: q.team, rookie: q.rookie, role: shares[q.id].role, perGame: shares[q.id].perGame ?? null })));
  }
  return bySeason;
}

const startWeeksOf = (primaries) => {
  const m = new Map();
  for (const [key, v] of primaries) {
    const week = Number(key.slice(key.lastIndexOf('|') + 1));
    if (!m.has(v.pid)) m.set(v.pid, []);
    m.get(v.pid).push(week);
  }
  return m;
};

function runQbSatLonger({ g, env, playerIds, constants2a, obsBy, rolesBySeason }) {
  const k = constants2a?.constants?.K_DYN_POINTS_ROOKIE0?.QB?.k;
  if (!Number.isFinite(k)) throw new Error('[inseason-dyn] Q5: K_DYN_POINTS_ROOKIE0.QB is absent from the loaded 2a constants file');
  const checkpointRows = [], playerRows = [];
  const excluded = { noSchedule: 0 };
  const roleCounts = { backup: 0, incumbent: 0, 'no-chart': 0, other: 0 };
  for (let S = DYN_DEFAULTS.seasons.from; S <= DYN_DEFAULTS.seasons.to; S++) {
    const primaries = primaryPassers(g.loadGameLogs(S), S);
    assertPrimaryCoverage(S, coverageFor(g.loadSchedule(S), primaries));   // same stop as assembleSeason (CR-09/CR-16)
    const startWeeks = startWeeksOf(primaries);
    const sched = env.scheduleIdx(S);
    let primaries1 = null, maxTeamGames1 = null;
    if (S + 1 <= IN_SEASON_DEFAULTS.maxLoadSeason) {
      primaries1 = primaryPassers(g.loadGameLogs(S + 1), S + 1);
      const sched1 = env.scheduleIdx(S + 1);
      maxTeamGames1 = Math.max(...[...(sched1?.values() ?? [])].map(ws => ws.size), 0);
    }
    const games1 = primaries1 ? (() => { const m = new Map(); for (const v of primaries1.values()) m.set(v.pid, (m.get(v.pid) ?? 0) + 1); return m; })() : null;
    for (const q of rolesBySeason.get(S) ?? []) {
      if (!q.rookie) continue;
      if (q.role === 'backup') roleCounts.backup++; else if (q.role === 'incumbent') roleCounts.incumbent++; else if (q.role === 'no-chart') roleCounts['no-chart']++; else roleCounts.other++;
      if (q.role !== 'backup') continue;
      const weeks = [...(sched?.get(q.team) ?? [])].sort((a, b) => a - b);
      if (!weeks.length) { excluded.noSchedule++; continue; }
      const prior = rookiePriorFor(q.pid, 'QB', S, playerIds);
      const y1 = ppgFrom(g, S + 1, q.pid), y2 = ppgFrom(g, S + 2, q.pid);
      const mine = startWeeks.get(q.pid) ?? [];
      let flaggedEver = false, flaggedAtEnd = false;
      for (const W of IN_SEASON_DEFAULTS.checkpoints) {
        const gW = weeks.filter(w => w <= W).length;
        if (gW === 0) continue;
        const starts = mine.filter(w => w <= W).length;
        const { satLonger } = satLongerAt({ starts, perGame: q.perGame, g: gW, band: QB_DYN_RESEARCH.satLongerBand });
        const o = obsBy.get(`${q.pid}|${S}|${W}`) ?? { n: 0, obsPPG: null };
        checkpointRows.push({ sleeperId: q.pid, S, prior, obs: o.obsPPG, n: o.n, flagged: satLonger, y1 });
        if (satLonger) flaggedEver = true;
        flaggedAtEnd = satLonger;
      }
      playerRows.push({
        sleeperId: q.pid, S, flaggedEver, flaggedAtEnd, prior, y1, y2, priorY2: rookiePriorFor(q.pid, 'QB', S + 1, playerIds),
        startShareY1: games1 && maxTeamGames1 > 0 ? (games1.get(q.pid) ?? 0) / maxTeamGames1 : null,
      });
    }
  }
  const agg = satLongerAggregates({ checkpointRows, playerRows, k });
  const flaggedWithY1 = new Set(checkpointRows.filter(r => r.flagged && Number.isFinite(r.y1)).map(r => r.sleeperId)).size;
  return {
    k, band: QB_DYN_RESEARCH.satLongerBand, shippedDiscount: QB_DYN_RESEARCH.shippedDiscount, excluded,
    populations: { ...agg.populations, roleCounts, flaggedWithY1, flaggedCheckpointRowsWithY1: agg.q5a.rows, flaggedAtEndWithY2: agg.q5b.players },
    q5a: agg.q5a, q5b: agg.q5b, q5c: agg.q5c,
  };
}

function runQbRookieDynasty({ g, playerIds, constants2a, q1Rows, allRows, rolesBySeason, levelsFile }) {
  const positionOf = positionOfFrom(playerIds);
  const bySleeper = playerIds?.bySleeper ?? {};
  const levels = Object.fromEntries(GROUP_ORDER.map(gr => [gr, levelsFile?.starterPPG?.[gr]?.value]));
  for (const [gr, v] of Object.entries(levels)) if (!Number.isFinite(v)) throw new Error(`[inseason-dyn] Q4: starterPPG.${gr}.value is absent from the rookie-level constants file`);
  const k = constants2a?.constants?.K_DYN_POINTS_ROOKIE0?.QB?.k;
  if (!Number.isFinite(k)) throw new Error('[inseason-dyn] Q4: K_DYN_POINTS_ROOKIE0.QB is absent from the loaded 2a constants file');

  // Q4a panel: one row per rookie QB-season (draftYear === S), whether or not he played in S.
  const excluded = { noGroup: 0, noPrior: 0 };
  const qbPanel = [], others = [];
  for (let S = DYN_DEFAULTS.seasons.from; S <= DYN_DEFAULTS.seasons.to; S++) {
    for (const [pid, pos] of Object.entries(positionOf)) {
      if (!REG_POSITIONS.includes(pos) || bySleeper[pid]?.draftYear !== S) continue;
      const prior = rookiePriorFor(pid, pos, S, playerIds);
      if (pos !== 'QB') {
        const y1 = ppgFrom(g, S + 1, pid);
        if (Number.isFinite(prior) && Number.isFinite(y1)) others.push({ sleeperId: pid, S, position: pos, prior, y: y1 });
        continue;
      }
      const group = rookieGroup(bySleeper[pid]);
      if (group == null) { excluded.noGroup++; continue; }
      if (!Number.isFinite(prior)) { excluded.noPrior++; continue; }
      qbPanel.push({ sleeperId: pid, S, group, prior, y0: ppgFrom(g, S, pid), y1: ppgFrom(g, S + 1, pid), y2: ppgFrom(g, S + 2, pid) });
    }
  }
  const rowsFor = (key) => qbPanel.filter(r => Number.isFinite(r[key])).map(r => ({ sleeperId: r.sleeperId, S: r.S, group: r.group, prior: r.prior, y: r[key] }));
  const y1Rows = rowsFor('y1'), y2Rows = rowsFor('y2'), y0Rows = rowsFor('y0');
  const countBy = (rows) => Object.fromEntries(GROUP_ORDER.map(gr => [gr, rows.filter(r => r.group === gr).length]));
  const populations = {
    rookies: qbPanel.length, excluded,
    byGroup: Object.fromEntries(GROUP_ORDER.map(gr => [gr, {
      rookies: qbPanel.filter(r => r.group === gr).length, y0: countBy(y0Rows)[gr], y1: countBy(y1Rows)[gr], y2: countBy(y2Rows)[gr],
    }])),
    y0Players: y0Rows.length, y1Players: y1Rows.length, y2Players: y2Rows.length,
  };

  const predsOf = (rows, vals) => rows.map((r, i) => ({ pred: vals[i], actual: r.y }));
  const maeOfPreds = (ps) => (ps.length ? ps.reduce((a, p) => a + Math.abs(p.pred - p.actual), 0) / ps.length : null);
  const candidateValues = (rows, trainRows) => {
    const gc = calibrateGroup({ train: trainRows, test: rows, kind: 'level' });
    const rc = calibrateGroup({ train: trainRows, test: rows, kind: 'ratio' });
    return { B0: rows.map(r => r.prior), GS: rows.map(r => levels[r.group]), GC: gc.values, RC: rc.values, fallbacks: { GC: gc.fallbacks, RC: rc.fallbacks } };
  };
  const compare = (rows, vals) => {
    const base = predsOf(rows, vals.B0);
    const out = { mae: { B0: r4(maeOfPreds(base)) }, deltas: {}, meanRatio: {} };
    for (const X of ['GS', 'GC', 'RC']) {
      const px = predsOf(rows, vals[X]);
      out.mae[X] = r4(maeOfPreds(px));
      out.deltas[X] = rows.length ? deltaOut(pairedDelta(rows, base, px)) : null;
      out.meanRatio[X] = rows.length ? mean(rows.map((r, i) => vals[X][i] / vals.B0[i])) : null;
    }
    return out;
  };
  const vY1 = candidateValues(y1Rows, y1Rows), vY2 = candidateValues(y2Rows, y1Rows);
  const priorOnly = { y1: { ...compare(y1Rows, vY1), fallbacks: vY1.fallbacks }, y2: { ...compare(y2Rows, vY2), fallbacks: vY2.fallbacks } };

  // Q4b: posterior on the Q1 YE0 QB rows at the pinned 2a rookie k.
  const post = q1Rows.filter(r => r.ye === 0 && r.position === 'QB' && Number.isFinite(r.projPrior) && Number.isFinite(r.obsPPG) && Number.isFinite(r.nextPPG));
  for (const r of post) {
    if (!(Math.abs(r.projPrior - rookiePriorFor(r.sleeperId, 'QB', r.S, playerIds)) < 1e-9)) throw new Error('[inseason-dyn] Q4b prior drift');
  }
  const postTest = post.map(r => ({ sleeperId: r.sleeperId, S: r.S, group: rookieGroup(bySleeper[r.sleeperId]), prior: r.projPrior, y: r.nextPPG }));
  const gcP = calibrateGroup({ train: y1Rows, test: postTest, kind: 'level' }), rcP = calibrateGroup({ train: y1Rows, test: postTest, kind: 'ratio' });
  const postVals = { B0: post.map(r => r.projPrior), GS: postTest.map(r => levels[r.group] ?? r.prior), GC: gcP.values, RC: rcP.values };
  const postBase = post.map((r, i) => ({ pred: blend(postVals.B0[i], r.obsPPG, r.n, k), actual: r.nextPPG }));
  const posterior = { k, rows: post.length, players: new Set(post.map(r => r.sleeperId)).size, mae: { B0: r4(maeOfPreds(postBase)) }, deltas: {} };
  for (const X of ['GS', 'GC', 'RC']) {
    const px = post.map((r, i) => ({ pred: blend(postVals[X][i], r.obsPPG, r.n, k), actual: r.nextPPG }));
    posterior.mae[X] = r4(maeOfPreds(px));
    posterior.deltas[X] = post.length ? deltaOut(pairedDelta(post, postBase, px)) : null;
  }

  // Q4d: position control — Σy1/ΣB0 over YE0 survivors; QB − (RB ∪ WR ∪ TE).
  const qbSurv = y1Rows.map(r => ({ sleeperId: r.sleeperId, prior: r.prior, y: r.y }));
  const ratioOf = (rows) => { const p = rows.reduce((a, r) => a + r.prior, 0); return p > 0 ? rows.reduce((a, r) => a + r.y, 0) / p : null; };
  const gateRaw = ratioDiffBootstrap(qbSurv, others);
  const positionControl = {
    byPosition: Object.fromEntries(REG_POSITIONS.map(pos => {
      const rs = pos === 'QB' ? qbSurv : others.filter(r => r.position === pos);
      const players = new Set(rs.map(r => r.sleeperId)).size;
      return [pos, { players, ratio: players >= QB_DYN_RESEARCH.minCellPlayers ? r4(ratioOf(rs)) : null }];
    })),
    gate: { qbRatio: r4(ratioOf(qbSurv)), otherRatio: r4(ratioOf(others)), diff: r4(gateRaw.diff), ci95: gateRaw.ci95?.map(r4) ?? null, direction: gateRaw.direction },
  };

  // Q4c (report-only): season-S level by week-1 role. Per-cell means only — no totals of the same statistic.
  const roleOf = (S, pid) => (rolesBySeason.get(S) ?? []).find(q => q.pid === pid)?.role ?? 'not-on-chart';
  const y0Roles = y0Rows.map(r => ({ ...r, role: roleOf(r.S, r.sleeperId) }));
  const roleNames = [...new Set(y0Roles.map(r => r.role))].sort();
  const cells = {};
  for (const gr of GROUP_ORDER) {
    cells[gr] = {};
    for (const role of roleNames) {
      const rs = y0Roles.filter(r => r.group === gr && r.role === role);
      const players = rs.length;
      const show = players >= QB_DYN_RESEARCH.minCellPlayers;
      cells[gr][role] = { players, meanY0: show ? r2(mean(rs.map(r => r.y))) : null, meanB0: show ? r2(mean(rs.map(r => r.prior))) : null, meanGS: show ? r2(mean(rs.map(r => levels[r.group]))) : null };
    }
  }
  const inc = y0Roles.filter(r => r.role === 'incumbent');
  const incB0 = predsOf(inc, inc.map(r => r.prior)), incGS = predsOf(inc, inc.map(r => levels[r.group]));
  const q4c = {
    note: 'report-only; per-cell means, cells under 3 players suppressed', cells,
    incumbent: { players: inc.length, maeB0: inc.length >= QB_DYN_RESEARCH.minCellPlayers ? r4(maeOfPreds(incB0)) : null, maeGS: inc.length >= QB_DYN_RESEARCH.minCellPlayers ? r4(maeOfPreds(incGS)) : null, deltaGS: inc.length >= QB_DYN_RESEARCH.minCellPlayers ? deltaOut(pairedDelta(inc, incB0, incGS)) : null },
  };

  // Decision (D5)
  const candidates = {};
  for (const X of ['GS', 'GC', 'RC']) {
    candidates[X] = { maeY1: priorOnly.y1.mae[X], y1: priorOnly.y1.deltas[X]?.label ?? null, y2: priorOnly.y2.deltas[X]?.label ?? null, posterior: posterior.deltas[X]?.label ?? null, meanRatio: priorOnly.y1.meanRatio[X] };
  }
  const decision = decideQ4({ players: y1Rows.length, candidates, gate: positionControl.gate });

  // k check (report): the dynasty k re-fitted on the chosen level. No constant is written from it.
  let kCheck = null;
  if (decision.chosen) {
    const X = decision.chosen;
    const pool = allRows.filter(r => r.arm === 'X-rookie0' && r.position === 'QB' && r.ye === 0);
    const testRows = pool.map(r => ({ sleeperId: r.sleeperId, S: r.S, group: rookieGroup(bySleeper[r.sleeperId]), prior: r.projPrior, y: r.nextPPG }));
    const vals = X === 'GS' ? testRows.map(r => levels[r.group] ?? r.prior) : calibrateGroup({ train: y1Rows, test: testRows, kind: X === 'GC' ? 'level' : 'ratio' }).values;
    const valueOf = new Map(pool.map((r, i) => [`${r.sleeperId}|${r.S}`, vals[i]]));
    const cell = analyzeKCell(allRows.filter(r => r.arm === 'X-rookie0'), {
      prior: (r) => (r.position === 'QB' && r.ye === 0 ? (valueOf.get(`${r.sleeperId}|${r.S}`) ?? r.projPrior) : r.projPrior), obs: 'obsPPG', outcome: 'nextPPG',
    });
    kCheck = { candidate: X, verdict: cell.verdict, rows: cell.rows, kFit: cell.kFit?.k ?? null, kPinned: k };
  }

  const levelsOut = decision.chosen === 'GC' ? fullCalibration({ train: y1Rows, kind: 'level' }) : decision.chosen === 'RC' ? fullCalibration({ train: y1Rows, kind: 'ratio' }) : null;
  return { decision: decision.decision, chosen: decision.chosen, eligible: decision.eligible, gateFailed: decision.gateFailed, populations, priorOnly, posterior, positionControl, kCheck, q4c, levels: levelsOut, starterLevels: levels };
}

// ─── runInSeasonDyn (§4) ────────────────────────────────────────────────────────

export function runInSeasonDyn({ load = INSEASON_DYN_LOAD, log = () => {}, assemble = assembleSeason, onRows = null, qbPrior, qbResearch = qbPrior === 'starter' } = {}) {
  if (!QB_PRIOR_MODELS.includes(qbPrior)) throw new Error('[inseason-dyn] runInSeasonDyn needs qbPrior legacy|starter');
  if (qbResearch && qbPrior !== 'starter') throw new Error("[inseason-dyn] Q4/Q5 run on the starter QB prior only (qbResearch needs qbPrior 'starter')");
  const t0 = Date.now();
  const g = guardLoad(load, { maxLoadSeason: 2025 });
  const reconciliation = runReconciliation(g, { fromYear: 2012, toYear: 2025 });
  log(`reconciliation ${reconciliation.pass}/${reconciliation.population} (${reconciliation.rate.toFixed(4)})`);

  const inputs = loadFactorInputs({ fromYear: 2013, toYear: 2024, basis: 'half_ppr', withFactorMultipliers: true, historyFloor: HISTORY_FLOOR, load: g });
  const playerIds = g.loadPlayerIds();
  // D-64: 2c ran on the legacy QB prior (flat 0.88/0.68 depth step, ceiled rookie level); `starter` re-runs it on what the app blends from.
  const env = { load: g, defaults: IN_SEASON_DEFAULTS, gamelogsIdx: makeGamelogsIndex(g), scheduleIdx: makeScheduleIndex(g), playerIds, qbPrior };
  if (qbPrior === 'starter') env.qbChainModels = loadQbChainModels(g);   // after the reconciliation stop, so a stub load's earlier error wins
  const peakByS = buildPeakByS(inputs);
  const pickProxy = buildPickProxy(playerIds, inputs);
  const pinnedSource = pinnedSourceOf(qbPrior);
  const constants2a = typeof load.loadInSeasonConstants === 'function' ? load.loadInSeasonConstants(qbPrior) : null;
  const ctx = { inputs, playerIds, peakByS, pickProxy, constants2a };

  // Fix pass 1 item 2: every row is augmented before the nextPPG filter, and carries `nextGp` (S+1 gp
  // from season totals, 0 if absent), so the excluded-population report can be built off the same rows.
  const preFilterRows = [];
  for (let S = DYN_DEFAULTS.seasons.from; S <= DYN_DEFAULTS.seasons.to; S++) {
    const a = assemble(S, env);
    const nextTotals = S <= 2024 ? g.loadSeasonTotals(S + 1) : null;
    let kept = 0;
    for (const row of a.rows) {
      const aug = augmentRow(row, ctx);
      aug.nextGp = nextTotals?.[row.sleeperId]?.gamesPlayed ?? 0;
      preFilterRows.push(aug);
      if (Number.isFinite(row.nextPPG)) kept++;
    }
    log(`S=${S}: ${kept} rows`);
  }
  const allRows = preFilterRows.filter(r => Number.isFinite(r.nextPPG));
  if (onRows) onRows(allRows);

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

  const q1Full = runQ1(q1Rows, pinnedSource);
  const { resultsByPos: q1ResultsByPos, ...q1 } = q1Full;
  const q2 = runQ2(q2PrimaryRows, q2StaleRows, pinnedSource);
  const { resultsByPos: q2ResultsByPos, ...q2Public } = q2;
  const q3 = runQ3(q1Rows, q1.decisions, q1ResultsByPos);
  const excluded = buildExcluded({ preFilterRows, allRows, q1Rows, q2PrimaryRows, q2StaleRows, routeMismatchRows, ye1Rookie0Rows });

  let q4 = null, q5 = null, rolesBySeason = null;
  if (qbResearch) {
    const obsBy = new Map();
    for (const r of preFilterRows) if (r.position === 'QB') obsBy.set(`${r.sleeperId}|${r.S}|${r.W}`, { n: r.n, obsPPG: r.obsPPG });
    rolesBySeason = weekOneRoles(g, env, playerIds);
    q5 = runQbSatLonger({ g, env, playerIds, constants2a, obsBy, rolesBySeason });
    q4 = runQbRookieDynasty({ g, playerIds, constants2a, q1Rows, allRows, rolesBySeason, levelsFile: load.loadQbRookieLevelConstants() });
    log(`Q4 ${q4.decision}; Q5a ${q5.q5a.decision} (${q5.q5a.players} players), Q5b ${q5.q5b.decision} (${q5.q5b.players} players)`);
  }

  const constants = { ...q1.constants, ...q2Public.constants };
  const fixture = { ...q1.fixture, ...q2Public.fixture };
  const pinnedFrom = { ...q1.pinnedFrom, ...q2Public.pinnedFrom };
  const reuse = { ...q1.reuse, ...q2Public.reuse };

  const ckAYE0 = q1.subgroups.YE0.diagnostics.ckA?.c ?? null;
  const ckBYE0 = q1.subgroups.YE0.diagnostics.ckB?.c ?? null;
  const ckAYE1 = q1.subgroups.YE1.diagnostics.ckA?.c ?? null;
  const ckBYE1 = q1.subgroups.YE1.diagnostics.ckB?.c ?? null;
  const ckHist = q2Public.diagnostics.ckHist?.c ?? null;
  const ckProj = q2Public.diagnostics.ckProj?.c ?? null;
  const cValues = { A_YE0: ckAYE0, B_YE0: ckBYE0, A_YE1: ckAYE1, B_YE1: ckBYE1, hist: ckHist, proj: ckProj };
  const boundary = Object.entries(cValues).filter(([, c]) => c === DYN_OPTIMISM_C[0] || c === DYN_OPTIMISM_C[DYN_OPTIMISM_C.length - 1]).map(([k]) => k);

  const generatedAt = new Date().toISOString();
  const constantsFile = {
    source: `sleeper-dashboard-data backtests/${generatedAt.slice(0, 10)}-inseason-dyn-constants.json (node bin/backtest.mjs --inseason --dynasty --write)`,
    generatedAt, basis: 'half_ppr',
    fit: {
      kTenths: [0, 400], loss: 'sum of squared error, rows equal weight', tie: 'smaller k', pin: 'Math.round(k*2)/2',
      prospectPrior: "App computeProspectScore prior PPG, blended 8:min(gp,12) with the S-1 season (D2). "
        + "D4: league rookie-draft pick approximated by the class's skill-position NFL draftOvr rank: rank <= 60 -> "
        + '{ round: ceil(rank/12), pick: rank }, else null; undrafted null. '
        + 'D5: YE1 players get pick = null, as the app reads only the most recent rookie draft. '
        + 'D6: age = whole years on 1 September of S; null -> 23.',
      historyPrior: 'The last qualifying season (gp>=8, <=S-2) PPG (D7), the slot K_DYN_POINTS_HISTORY substitutes app-side.',
      priorCalibration: {
        note: "Each k is fitted against its prior's miscalibration: re-fit if POSITION_PRIOR_PPG/the age or draft multipliers (arm A), the rookie calibration (arm B), or the projection (Q2 projection prior) change.",
        c: cValues,
        boundary,
      },
    },
    decisions: { q1: { YE0: q1.decisions.YE0.arm, YE1: q1.decisions.YE1.arm }, q2: q2Public.decision.chooseHist ? 'history' : 'no-recommendation' },
    constants, fixture, reuse,
  };
  constantsFile.fit.qbPrior = qbPrior;
  constantsFile.fit.inSeasonConstants = pinnedSource;
  if (qbResearch) {
    constantsFile.qbRookieDynasty = {
      decision: q4.decision, horizon: 'S+1', confirm: 'S+2',
      players: { y1: q4.populations.y1Players, y2: q4.populations.y2Players },
      maeY1: q4.priorOnly.y1.mae,
      labels: {
        y1: Object.fromEntries(['GS', 'GC', 'RC'].map(X => [X, q4.priorOnly.y1.deltas[X]?.label ?? null])),
        y2: Object.fromEntries(['GS', 'GC', 'RC'].map(X => [X, q4.priorOnly.y2.deltas[X]?.label ?? null])),
        posterior: Object.fromEntries(['GS', 'GC', 'RC'].map(X => [X, q4.posterior.deltas[X]?.label ?? null])),
      },
      gate: q4.positionControl.gate,
      levels: q4.levels,
      starterLevelsRef: 'backtests/2026-10-04-qb-rookie-level-constants.json',
    };
    constantsFile.qbSatLonger = {
      decision: q5.q5a.decision, discount: q5.q5a.discount, band: QB_DYN_RESEARCH.satLongerBand, shippedDiscount: QB_DYN_RESEARCH.shippedDiscount,
      players: { flaggedWithY1: q5.q5a.players, flaggedAtEndWithY2: q5.q5b.players },
      dFull: q5.q5a.dFull,
      maeQ5a: { d100: q5.q5a.mae.d100, d090: q5.q5a.mae.d090, loso: q5.q5a.mae.loso },
      labels: q5.q5a.labels,
      persistence: { decision: q5.q5b.decision, players: q5.q5b.players, dFull: q5.q5b.dFull, label: q5.q5b.label },
    };
  }
  const bad = verifyConstants(constantsFile);
  if (bad.length) throw new Error(`[inseason-dyn] constants do not re-derive from their fixture: ${JSON.stringify(bad.slice(0, 5))}`);

  const meta = {
    generatedAt, basis: 'half_ppr', seasons: DYN_DEFAULTS.seasons, runtimeMs: Date.now() - t0,
    routeMismatchRate: r4(routeMismatchRate), qbPrior, inSeasonConstants: pinnedSource,
  };
  const coverage = {
    rowsTotal: allRows.length, q1Rows: q1Rows.length, q2PrimaryRows: q2PrimaryRows.length, q2StaleRows: q2StaleRows.length,
    routeMismatchRows: routeMismatchRows.length,
  };

  const diagnostics = {
    q1: { YE0: q1.subgroups.YE0.diagnostics, YE1: q1.subgroups.YE1.diagnostics },
    q2: q2Public.diagnostics,
  };
  const ladders = {
    q1: { YE0: q1.decisions.YE0.ladders, YE1: q1.decisions.YE1.ladders },
    q2: q2Public.decision.ladders ?? null,
  };

  const d64 = qbPrior === 'starter' && typeof load.loadDynBaseline === 'function' ? diffDynConstants(constantsFile, load.loadDynBaseline()) : null;

  return { meta, reconciliation, coverage, excluded, q1, q2: q2Public, q3, d64, q4, q5, diagnostics, ladders, pinnedFrom, constants: constantsFile };
}

// ─── Verdict markdown (§7) ──────────────────────────────────────────────────────

const f = (v, d = 2) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(d));
const ciStr = (c) => (c ? `[${f(c[0], 1)}, ${f(c[1], 1)}]` : '—');
const ciStr4 = (c) => (c ? `[${f(c[0], 4)}, ${f(c[1], 4)}]` : '—');

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

function priorCalibrationTable(pc, q1, q2) {
  const lines = ['| arm | c | k with c | k without c |', '|---|---|---|---|'];
  const row = (label, c, kWith, kWithout) => lines.push(`| ${label} | ${f(c, 2)}${pc.boundary.includes(label) ? ' (boundary)' : ''} | ${f(kWith, 1)} | ${f(kWithout, 1)} |`);
  row('A_YE0', pc.c.A_YE0, q1.subgroups.YE0.diagnostics.ckA?.k, q1.subgroups.YE0.pooled.A.kFit);
  row('B_YE0', pc.c.B_YE0, q1.subgroups.YE0.diagnostics.ckB?.k, q1.subgroups.YE0.pooled.B.kFit);
  row('A_YE1', pc.c.A_YE1, q1.subgroups.YE1.diagnostics.ckA?.k, q1.subgroups.YE1.pooled.A.kFit);
  row('B_YE1', pc.c.B_YE1, q1.subgroups.YE1.diagnostics.ckB?.k, q1.subgroups.YE1.pooled.B.kFit);
  row('hist', pc.c.hist, q2.diagnostics.ckHist?.k, q2.pooled.Hist.kFit);
  row('proj', pc.c.proj, q2.diagnostics.ckProj?.k, q2.pooled.Proj.kFit);
  return lines.join('\n');
}

function q3Line(m) {
  if (!m || !m.rows) return 'INSUFFICIENT (0 rows).';
  return `rows=${m.rows}, model-share update=${f(m.updateModelShare, 2)}, left on table=${f(m.leftOnTable, 2)} (${f((m.leftOnTableShare ?? 0) * 100, 1)}% of realised movement), captured share=${f(m.capturedShare, 3)}, rank agreement=${f(m.rankAgreement, 3)}, peak-clamp share (xn/y)=${f(m.clampShareXn, 3)}/${f(m.clampShareY, 3)}, cap-of-35 row share=${f(m.capOf35.rowShare, 3)} [upper bound: KTC unknown historically].`;
}

const pct = (v) => (v == null ? '—' : `${f(v * 100, 1)}%`);
const lab = (d) => (d ? `${d.label} (mean ${f(d.mean, 4)}, CI ${ciStr4(d.ci95)})` : '—');

function qbResearchMarkdown(result) {
  const { d64, q2, q4, q5 } = result;
  const L = [];
  if (d64) {
    L.push('', '## D-64 — 2c on the current QB model', '');
    if (d64.equal) L.push('No 2c constant, reuse entry or decision moved against `backtests/2026-09-27-inseason-dyn-constants.json` (reuse `source` strings aside).');
    else {
      L.push('| path | 2026-09-27 | this run |', '|---|---|---|');
      for (const c of d64.changed) L.push(`| ${c.path} | ${JSON.stringify(c.before)} | ${JSON.stringify(c.after)} |`);
    }
    L.push('', `Q2 pooled (this run): Proj Δ ${lab(q2.pooled.Proj.delta)}; ΔHP ${lab(q2.pooled.deltaHP)} (also in \`q2.decision.deltaHP\`). These are the leaves the comparison panel carries; the constants, reuse entries and decisions above are what the app pins.`);
  }
  if (!q4 || !q5) return L;
  const P = q4.populations;
  L.push('', '## Q4 — Rookie QB level in the dynasty prior (P12c)', '');
  L.push(`Population: ${P.rookies} rookie QBs (S 2014–2024; excluded: ${P.excluded.noGroup} no group, ${P.excluded.noPrior} no prior); S+1 PPG ${P.y1Players}, S+2 PPG ${P.y2Players}, season-S PPG ${P.y0Players}.`, '');
  L.push('| group | rookies | S | S+1 | S+2 |', '|---|---|---|---|---|');
  for (const [gr, c] of Object.entries(P.byGroup)) L.push(`| ${gr} | ${c.rookies} | ${c.y0} | ${c.y1} | ${c.y2} |`);
  L.push('', '**Q4a — prior-only on held-out next-season PPG** (B0 = shipped rookie-path level; GS = P12a "if he starts" level; GC = leave-one-class-out group mean; RC = B0 × group ratio).', '');
  L.push('| horizon | players | MAE B0 | MAE GS | MAE GC | MAE RC | Δ GS | Δ GC | Δ RC |', '|---|---|---|---|---|---|---|---|---|');
  for (const [h, n] of [['y1', P.y1Players], ['y2', P.y2Players]]) {
    const po = q4.priorOnly[h];
    L.push(`| S+${h === 'y1' ? 1 : 2} | ${n} | ${f(po.mae.B0, 3)} | ${f(po.mae.GS, 3)} | ${f(po.mae.GC, 3)} | ${f(po.mae.RC, 3)} | ${po.deltas.GS?.label ?? '—'} | ${po.deltas.GC?.label ?? '—'} | ${po.deltas.RC?.label ?? '—'} |`);
  }
  L.push('', `Fallbacks to B0 (group below ${QB_DYN_RESEARCH.minGroupTrainPlayers} training players): S+1 GC ${q4.priorOnly.y1.fallbacks.GC}, RC ${q4.priorOnly.y1.fallbacks.RC}; S+2 GC ${q4.priorOnly.y2.fallbacks.GC}, RC ${q4.priorOnly.y2.fallbacks.RC}.`);
  L.push('', `**Q4b — posterior** at the pinned 2a rookie k (${q4.posterior.k}), ${q4.posterior.rows} rows / ${q4.posterior.players} players: MAE B0 ${f(q4.posterior.mae.B0, 3)}, GS ${f(q4.posterior.mae.GS, 3)}, GC ${f(q4.posterior.mae.GC, 3)}, RC ${f(q4.posterior.mae.RC, 3)}. Δ GS ${lab(q4.posterior.deltas.GS)}; Δ GC ${lab(q4.posterior.deltas.GC)}; Δ RC ${lab(q4.posterior.deltas.RC)}.`);
  const pc = q4.positionControl;
  L.push('', `**Q4d — position control** (Σ S+1 PPG / Σ B0 over YE0 survivors): ${Object.entries(pc.byPosition).map(([pos, c]) => `${pos} ${f(c.ratio, 3)} (${c.players} players)`).join(', ')}. QB ${f(pc.gate.qbRatio, 3)} vs RB∪WR∪TE ${f(pc.gate.otherRatio, 3)}: difference ${f(pc.gate.diff, 3)}, CI ${ciStr4(pc.gate.ci95)} → ${pc.gate.direction}.`);
  L.push('', q4.kCheck ? `**k check (report):** with ${q4.kCheck.candidate} the YE0 QB dynasty k re-fits to ${f(q4.kCheck.kFit, 1)} (${q4.kCheck.verdict}, ${q4.kCheck.rows} rows) vs pinned ${q4.kCheck.kPinned}. No constant is written from it.` : '**k check:** not run (no candidate chosen).');
  L.push('', '**Q4c — season-S level by week-1 role (report-only; per-cell means, cells under 3 players suppressed):**', '');
  const roleNames = [...new Set(Object.values(q4.q4c.cells).flatMap(c => Object.keys(c)))].sort();
  L.push(`| group | ${roleNames.map(r => `${r} (n / PPG / B0 / GS)`).join(' | ')} |`, `|---|${roleNames.map(() => '---').join('|')}|`);
  for (const [gr, cs] of Object.entries(q4.q4c.cells)) L.push(`| ${gr} | ${roleNames.map(r => { const c = cs[r]; return c ? `${c.players} / ${f(c.meanY0, 1)} / ${f(c.meanB0, 1)} / ${f(c.meanGS, 1)}` : '—'; }).join(' | ')} |`);
  const ic = q4.q4c.incumbent;
  L.push('', `Week-1 incumbents (${ic.players} players, report-only — too few to decide anything): MAE B0 ${f(ic.maeB0, 3)}, GS ${f(ic.maeGS, 3)}, Δ GS ${lab(ic.deltaGS)}.`);
  L.push('', '**What history cannot test (F6):** KTC history starts 2026-05-18 and the reconstruction holds `ktcMult` and college at 1.0, so the live `projectedPPG` excess for top picks (P12a Q4) is out of reach of any held-out test until a completed season carries KTC values (~2027). This run tests the neutral level only.');
  L.push('', `**Decision — Q4: \`${q4.decision}\`.**${q4.eligible.length ? ` Eligible before the position gate: ${q4.eligible.join(', ')}${q4.gateFailed.length ? `; failed the gate: ${q4.gateFailed.join(', ')}` : ''}.` : ''}`);

  const a = q5.q5a, b = q5.q5b, c = q5.q5c, pp = q5.populations;
  L.push('', '## Q5 — Sat-longer discount (D-60)', '');
  L.push(`**Definition (the app's, F3).** A \`years_exp\` 0 QB whose preseason chain role is \`backup\`; at team-game index g, residual = starts − Σ_{i<g} preseason.perGame[i]; sat-longer iff residual < −${q5.band}. It multiplies the prospect prior by ${q5.shippedDiscount} and is re-evaluated at every checkpoint. **Transport:** the data side uses the week-1 chart team (the app: his current team) and \`draftYear === S\` (the app: \`years_exp\` 0). P6a Q5 measured the residual at the end of the fitted window on takeover rows; this replicates the app's own residual at each of checkpoints 1–12.`);
  L.push('', `Population: ${pp.backups} preseason-backup rookie QBs; ${pp.flaggedEver} ever flagged; ${pp.flaggedAtEnd} flagged at the last checkpoint. Roles seen among rookies on the week-1 chart: ${JSON.stringify(pp.roleCounts)}.`);
  L.push('', `**Q5a — S+1 PPG on flagged checkpoint rows:** ${a.players} players / ${a.rows} rows (floor ${QB_DYN_RESEARCH.floors.q5a} players) → \`${a.decision}\`, discount ${a.discount}. dFull ${f(a.dFull, 2)}. MAE d=1.0 ${f(a.mae.d100, 3)}, d=0.90 ${f(a.mae.d090, 3)}, LOSO ${f(a.mae.loso, 3)}. Labels: LOSO vs 0.90 ${a.labels.vsShipped ?? '—'}; none vs 0.90 ${a.labels.noneVsShipped ?? '—'}; none vs LOSO ${a.labels.noneVsLoso ?? '—'}.`);
  L.push('', `**Q5b — persistence into year 2** (prior-only, flagged at the last rookie checkpoint, S+2 PPG): ${b.players} players (floor ${QB_DYN_RESEARCH.floors.q5b}) → \`${b.decision}\`; dFull ${f(b.dFull, 2)}; label ${b.label ?? '—'}. **Limitation:** this is the rookie-path level at \`yearsExp\` 1; a flagged rookie who played enough in S to be veteran-routed at S+1 gets the veteran projection as his arm-B prior (assembleSeason and the app), so Q5b over-covers. It is \`insufficient\` either way.`);
  L.push('', '**Q5c — flagged-ever vs never-flagged (report-only; suppressed as a pair below 3 players):**', '', '| group | players | with S+1 PPG | mean S+1 / prior | S+1 primary-passer share |', '|---|---|---|---|---|');
  for (const [name, cell] of [['flagged ever', c.flaggedEver], ['never flagged', c.neverFlagged]]) L.push(`| ${name} | ${cell.players} | ${cell.withY1} | ${f(cell.y1OverPrior, 3)} | ${pct(cell.startShareY1)} |`);
  L.push('', `**Decision — Q5a: \`${a.decision}\` (${a.discount}); Q5b: \`${b.decision}\`.** Outputs are aggregates only: counts, MAE, labels, CIs and the full-sample fitted d — never per-player, per-rookie-season or per-fold values.`);

  L.push('', '## For wiring', '');
  L.push(`- **Always (W0):** registry edits from the companion; app re-pins \`IN_SEASON_DYN_PANEL_SOURCE\` + fixture to this panel by byte copy; D-64 resolved, D-60 per Q5.`);
  L.push(`- **Q5 → ${a.decision}:** ${a.decision === 'insufficient' || a.decision === 'keep' ? 'keep 0.90 in `qbTakeoverConstants.js`/`inSeasonScoring.js`, PROVISIONAL(heuristic) re-cited to this verdict; no score moves.' : `pin ${a.discount} from \`qbSatLonger.discount\` with a constants fixture; flagged rookie QBs' dynasty scores move, no \`PRIOR_MODEL_FROM\` bump.`} Q5b \`${b.decision}\`${b.decision === 'extend' ? ': a design question first (the app has no rookie-season live state at yearsExp 1).' : '.'}`);
  L.push(`- **Q4 → ${q4.decision}:** ${['keep', 'insufficient', 'keep-not-qb-specific'].includes(q4.decision) ? 'CR-25/CR-27 text only.' : 'the dynasty prior for yearsExp 0 QBs with a group takes the pinned level in `buildRookieDynastyPriors`; whether `projectedPPG` follows is Anton\'s call (F6).'}`);
  return L;
}

export function buildInSeasonDynVerdictMarkdown(result) {
  const { q1, q2, q3, excluded, constants, meta } = result;
  const lines = [];
  lines.push(`# In-season evidence — Phase 2c: dynasty-side (rookies and SHORT veterans) verdict — QB prior \`${meta.qbPrior}\`, 2a k \`${meta.inSeasonConstants}\``, '');
  lines.push(`**Q1 — prospect prior.** YE0: arm ${q1.decisions.YE0.arm} (ΔAB ${q1.decisions.YE0.deltaAB?.label ?? '—'}, mean ${f(q1.decisions.YE0.deltaAB?.mean, 4)}, CI ${ciStr4(q1.decisions.YE0.deltaAB?.ci95)}). YE1: arm ${q1.decisions.YE1.arm} (ΔAB ${q1.decisions.YE1.deltaAB?.label ?? '—'}, mean ${f(q1.decisions.YE1.deltaAB?.mean, 4)}, CI ${ciStr4(q1.decisions.YE1.deltaAB?.ci95)}).`, '');
  lines.push(`**Q2 — SHORT-recent prior.** ${q2.decision.chooseHist ? 'History prior' : 'No wiring recommendation'} (ΔHP ${q2.decision.deltaHP?.label ?? '—'}, mean ${f(q2.decision.deltaHP?.mean, 4)}, CI ${ciStr4(q2.decision.deltaHP?.ci95)}).`, '');
  lines.push(`**Q3 — the KTC anchor.** Measured (pooled): ${q3Line(q3.pooled)} Not measurable yet: whether KTC itself moves with in-season evidence (KTC history starts 2026-05-18).`, '');
  lines.push('## Constants / reuse', '', constantsTable(constants.constants, constants.reuse), '');
  lines.push('## §Prior calibration (read before using these k)', '');
  lines.push(constants.fit.priorCalibration.note, '');
  lines.push(priorCalibrationTable(constants.fit.priorCalibration, q1, q2), '');
  lines.push('> c > 1 means the prior runs **pessimistic** on these rows (outcomes exceed it). For the rookie arms that is partly survivorship: busts have no S+1 outcome and are excluded.', '');
  lines.push('## §Q1', '');
  for (const g of [0, 1]) {
    const label = `YE${g}`;
    const s = q1.subgroups[label];
    lines.push(`**${label}** — A: k=${f(s.pooled.A.kFit, 1)} (${s.pooled.A.verdict}, rows=${s.pooled.A.rows}), prior-only MAE=${f(s.pooled.A.maePriorOnly, 2)}. B: k=${f(s.pooled.B.kFit, 1)} (${s.pooled.B.verdict}, rows=${s.pooled.B.rows}), prior-only MAE=${f(s.pooled.B.maePriorOnly, 2)}, Δ vs 2a pinned=${s.pooled.B.delta?.label ?? '—'} (mean ${f(s.pooled.B.delta?.mean, 4)}, CI ${ciStr4(s.pooled.B.delta?.ci95)}). ΔAB=${s.pooled.deltaAB?.label ?? '—'} (mean ${f(s.pooled.deltaAB?.mean, 4)}, CI ${ciStr4(s.pooled.deltaAB?.ci95)}).`);
    if (s.diagnostics.nullpick) lines.push(`  - A-nullpick: k=${f(s.diagnostics.nullpick.kFit, 1)}, MAE=${f(s.diagnostics.nullpick.mae, 2)} vs A MAE=${f(s.diagnostics.nullpick.maeA, 2)}, Δ=${s.diagnostics.nullpick.delta?.label ?? '—'} (mean ${f(s.diagnostics.nullpick.delta?.mean, 4)}, CI ${ciStr4(s.diagnostics.nullpick.delta?.ci95)}).`);
    if (s.diagnostics.ye1WithPick) lines.push(`  - A-YE1-withPick: k=${f(s.diagnostics.ye1WithPick.kFit, 1)}, MAE=${f(s.diagnostics.ye1WithPick.mae, 2)} vs A MAE=${f(s.diagnostics.ye1WithPick.maeA, 2)}, Δ=${s.diagnostics.ye1WithPick.delta?.label ?? '—'} (mean ${f(s.diagnostics.ye1WithPick.delta?.mean, 4)}, CI ${ciStr4(s.diagnostics.ye1WithPick.delta?.ci95)}).`);
  }
  lines.push('', '## §Q2', '');
  lines.push(`Hist: k=${f(q2.pooled.Hist.kFit, 1)} (${q2.pooled.Hist.verdict}, rows=${q2.pooled.Hist.rows}), Δ vs K_DYN_POINTS_HISTORY=${q2.pooled.Hist.delta?.label ?? '—'} (mean ${f(q2.pooled.Hist.delta?.mean, 4)}, CI ${ciStr4(q2.pooled.Hist.delta?.ci95)}). Proj: k=${f(q2.pooled.Proj.kFit, 1)} (${q2.pooled.Proj.verdict}, rows=${q2.pooled.Proj.rows}), Δ vs K_DYN_POINTS_SHORT=${q2.pooled.Proj.delta?.label ?? '—'} (mean ${f(q2.pooled.Proj.delta?.mean, 4)}, CI ${ciStr4(q2.pooled.Proj.delta?.ci95)}). ΔHP=${q2.pooled.deltaHP?.label ?? '—'} (mean ${f(q2.pooled.deltaHP?.mean, 4)}, CI ${ciStr4(q2.pooled.deltaHP?.ci95)}).`);
  lines.push('', '## §Q3', '');
  lines.push('**Measured:** the model-share numbers below. **Not measurable yet:** whether KTC itself moves with in-season evidence (so the anchored 60% is not really lost) — untestable until ~Jan 2027 (rest-of-season) / ~Jan 2028 (S+1 graded). **Do not propose changing the anchor.**', '');
  lines.push(`Pooled (YE0+YE1): ${q3Line(q3.pooled)}`);
  for (const g of [0, 1]) {
    const label = `YE${g}`;
    lines.push(`${label}: ${q3Line(q3.bySubgroup[label])}`);
  }
  for (const b of q3.byBand) lines.push(`n∈${b.band}: ${q3Line(b)}`);
  lines.push(...qbResearchMarkdown(result));
  lines.push('', '## Excluded population', '');
  lines.push(`Q1: YE<=1 player-seasons ${excluded.q1.ye01.playerSeasons} (rows ${excluded.q1.ye01.rows}, players ${excluded.q1.ye01.players}). No S+1 outcome — absent: player-seasons ${excluded.q1.noOutcomeAbsent.playerSeasons} (rows ${excluded.q1.noOutcomeAbsent.rows}); gp<6: player-seasons ${excluded.q1.noOutcomeGpUnder6.playerSeasons} (rows ${excluded.q1.noOutcomeGpUnder6.rows}). draftYear unusable: player-seasons ${excluded.q1.draftYearUnusable.playerSeasons} (rows ${excluded.q1.draftYearUnusable.rows}). routeMismatch: player-seasons ${excluded.q1.routeMismatch.playerSeasons} (rows ${excluded.q1.routeMismatch.rows}, rate ${f(meta.routeMismatchRate * 100, 2)}%). YE1-in-rookie0: player-seasons ${excluded.q1.ye1InRookie0.playerSeasons} (rows ${excluded.q1.ye1InRookie0.rows}). YE2-3 no qualifying season: player-seasons ${excluded.q1.ye23NoQualifyingSeason.playerSeasons} (rows ${excluded.q1.ye23NoQualifyingSeason.rows}).`);
  lines.push(`Q2: SHORT-recent player-seasons ${excluded.q2.recent.playerSeasons} (rows ${excluded.q2.recent.rows}), SHORT-stale player-seasons ${excluded.q2.stale.playerSeasons} (rows ${excluded.q2.stale.rows}), SHORT-noL player-seasons ${excluded.q2.noL.playerSeasons} (rows ${excluded.q2.noL.rows}). No S+1 outcome — absent: player-seasons ${excluded.q2.noOutcomeAbsent.playerSeasons} (rows ${excluded.q2.noOutcomeAbsent.rows}, includes retirements); gp<6: player-seasons ${excluded.q2.noOutcomeGpUnder6.playerSeasons} (rows ${excluded.q2.noOutcomeGpUnder6.rows}). Without a projPrior: player-seasons ${excluded.q2.noProjPrior.playerSeasons} (rows ${excluded.q2.noProjPrior.rows}).`);
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
  log = console.log, logErr = console.error, qbPrior = 'starter',
} = {}) {
  try {
    const result = runInSeasonDyn({ load, qbPrior, log: (m) => logErr(`[backtest] ${m}`) });
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
