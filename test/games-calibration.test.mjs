/**
 * test/games-calibration.test.mjs — `--games-calibration` (L6, .claude/tasks/projected-games-calibration.md §6).
 * Synthetic stores with injected loaders; no live data.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

import { projectedGamesFor, classifyInjurySeason, seasonView } from '../lib/durabilityMirror.mjs';
import { forwardChainFolds } from '../lib/panel.mjs';
import { buildPanel, ABSENCE_DEFAULTS } from '../scripts/absence-run.mjs';
import {
  GAMES_CAL_DEFAULTS, CANDIDATE_IDS, accountWeeks, decompose, fitK, fitCandidate, kFor, foldTrainRows,
  decide, candidatePred,
  rosterCause, causeStates, rel3Of, avgGamesSeasonLength, cellKey, CAUSE_CANDIDATES, CAUSE_CANDIDATE_IDS,
  causeEligibility, decideCause,
  fitShortCandidate, shortPred, shortEligibility, decideShort, SHORT_CANDIDATES,
} from '../lib/gamesCalibration.mjs';
import {
  panelEligibility, gamesCalibrationMain, writeGamesCalibrationArtifacts,
} from '../scripts/games-calibration-run.mjs';
import { gamesCauseMain, writeGamesCauseArtifacts, buildCauseRows } from '../scripts/games-cause-run.mjs';
import { gamesShortMain, writeGamesShortArtifacts, inSeasonCheck } from '../scripts/games-short-run.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

// ─── GC-1 accountWeeks ───────────────────────────────────────────────────────

test('GC-1 accountWeeks: one slot of each kind, a bye, a traded week and a P outside any team game; the identity holds exactly', () => {
  // KC plays slots 0,2,3,4,5,6,7,8 (idle at 1, 9, 10); CHI plays slot 9.
  const played = new Map([['KC', new Set([0, 2, 3, 4, 5, 6, 7, 8])], ['CHI', new Set([9])]]);
  const ws = ['P', 'X', 'X', 'X', 'D', 'X', 'X', 'X', 'X', 'X', 'P'];
  const s1Row = { team: 'KC', gamesPlayed: 2, weeklyStatus: ws };
  const rw = {
    1: [['KC', 'ACT']],                                  // slot 0: P on a team game
    2: [['KC', 'ACT']],                                  // slot 1: KC idle (a bye) → not a team game
    3: [['KC', 'RES']],                                  // slot 2: reserve
    4: [['KC', 'INA']],                                  // slot 3: inactive
    5: [['KC', 'ACT']],                                  // slot 4: ACT with 'D' → activeNoPlay
    6: [['KC', 'DEV']],                                  // slot 5: practice squad
    7: [['KC', 'SUS']],                                  // slot 6: other status
    8: [['KC', 'CUT']],                                  // slot 7: CUT → offRoster
    // week 9 (slot 8): no listing → falls back to the S+1 row's team (KC played) → offRoster
    // slot 9: traded; only CHI played → classified by CHI's ACT. Classifying by all pairs would give `reserve`
    // (KC's RES outranks CHI's ACT), so this slot discriminates the played-teams-only rule.
    10: [['KC', 'RES'], ['CHI', 'ACT']],
    11: [['KC', 'ACT']],                                 // slot 10: 'P' while KC was idle → not a team game, recon −1
  };
  const w = accountWeeks({ s1Row, s0Row: undefined, rwPlayer: rw, played });
  assert.equal(w.G, 9);
  assert.deepEqual(w.counts, { played: 1, reserve: 1, inactive: 1, activeNoPlay: 2, practiceSquad: 1, otherStatus: 1, offRoster: 2 });
  assert.deepEqual(w.otherByStatus, { SUS: 1 });
  assert.equal(w.recon, -1, 'played (1) − outcome (2): the P outside a team game is the reconciliation gap');
  assert.equal(w.skipped, false);
  const sumCounts = Object.values(w.counts).reduce((a, b) => a + b, 0);
  assert.equal(sumCounts, w.G, 'every team-game slot lands in exactly one category');

  // pred − outcome = (pred − G) + reserve + inactive + activeNoPlay + practiceSquad + otherStatus + offRoster + recon
  const pred = 12, outcome = 2;
  const c = w.counts;
  const direct = (pred - w.G) + c.reserve + c.inactive + c.activeNoPlay + c.practiceSquad + c.otherStatus + c.offRoster + w.recon;
  assert.equal(direct, pred - outcome);
  const d = decompose(pred, outcome, w);
  assert.deepEqual([d.schedule, d.composition, d.role, d.injuryList, d.recon], [3, 4, 3, 1, -1]);
  assert.equal(d.sum, d.bias);
  assert.equal(d.bias, 10);
});

test('GC-1 accountWeeks: fallback step 3 (S row team, no pairs, no S+1 row) is a team game classified offRoster only if that team played', () => {
  const s0Row = { team: 'KC' };
  const played = new Map([['KC', new Set([3])], ['CHI', new Set([0])]]);
  // The S row's team played slot 3 and nothing lists the player: counted, classified offRoster.
  const a = accountWeeks({ s1Row: undefined, s0Row, rwPlayer: undefined, played });
  assert.equal(a.skipped, false);
  assert.equal(a.G, 1);
  assert.deepEqual(a.counts, { played: 0, reserve: 0, inactive: 0, activeNoPlay: 0, practiceSquad: 0, otherStatus: 0, offRoster: 1 });
  // The S row's team is idle in every slot (only CHI plays): not a team game.
  const b = accountWeeks({ s1Row: undefined, s0Row, rwPlayer: undefined, played: new Map([['CHI', new Set([0])]]) });
  assert.equal(b.G, 0);
  assert.equal(b.counts.offRoster, 0);
});

test('GC-1 accountWeeks: a player with no team in any week is skipped', () => {
  const w = accountWeeks({ s1Row: undefined, s0Row: undefined, rwPlayer: undefined, played: new Map([['KC', new Set([0])]]) });
  assert.equal(w.skipped, true);
  assert.equal(w.G, 0);
});

// ─── GC-2 panelEligibility ───────────────────────────────────────────────────

const full = () => ({ team: 'KC', gamesPlayed: 16, gamesStarted: 16, fantasyPoints: 160, dnpWeeks: 0, weeklyStatus: Array(16).fill('P'), stats: {} });

test('GC-2: panelEligibility\'s P-stageB set equals buildPanel on a store with one row of each eligibility class', () => {
  const store = {
    2017: { A: full(), B: full(), C: full(), D: full(), F: full() },
    2018: { A: full(), B: full(), C: full(), D: full(), E: { ...full(), gamesPlayed: 7 }, F: full() },
    2019: { A: full(), F: { ...full(), gamesPlayed: 3 } },
  };
  const rosterByYear = {
    2017: { players: {} }, 2018: { players: {} },
    2019: { players: { B: { 1: [['KC', 'RES']] }, C: { 1: [['KC', 'DEV']] } } },
  };
  const positionOf = Object.fromEntries('ABCDEF'.split('').map((id) => [id, 'WR']));
  const draftYearOf = { A: 2010, B: 2010, C: 2010, D: 2018, E: 2010, F: 2010 };   // D is drafted in S: not yet a veteran
  const defaults = { ...ABSENCE_DEFAULTS, predictorSeasons: { from: 2018, to: 2018 } };
  const bp = buildPanel({ before: store, after: store, rosterByYear, positionOf, draftYearOf, defaults });
  const pe = panelEligibility({ store, rosterByYear, positionOf, draftYearOf, defaults });
  const keys = (rs) => rs.map((r) => `${r.id}|${r.S}`).sort();
  assert.deepEqual(keys(pe.included), keys(bp.rows));
  assert.deepEqual(keys(pe.included), ['A|2018', 'B|2018', 'F|2018']);
  assert.deepEqual(pe.excluded.map((e) => e.id), ['C'], 'DEV-only, no S+1 row → excluded');
  assert.equal(pe.included.find((r) => r.id === 'B').outcome, 0);
  assert.equal(pe.included.find((r) => r.id === 'B').noS1Row, true);
  assert.equal(pe.counts.notVeteran, bp.counts.notVeteran);
  assert.equal(pe.counts.noQualifying, bp.counts.noQualifying);
  assert.equal(pe.excluded.length, bp.counts.excludedNoRowNoReserve);
  assert.equal(pe.excluded[0].activeInS, true);
  // the prediction carried on every row is the panel's
  for (const r of bp.rows) assert.equal(pe.included.find((x) => x.id === r.id).pred, r.after);
});

// ─── GC-3 fitK ───────────────────────────────────────────────────────────────

test('GC-3 fitK: a fixture with a unique SSE minimiser at 0.80 returns 0.80', () => {
  // Each (avg, outcome) pair matches exactly on an interval of k; the intervals intersect only at 0.80.
  const rows = [[17, 14], [15, 12], [16, 13], [14, 11], [13, 10], [11, 9]].map(([avgGames, outcome]) => ({ avgGames, outcome }));
  const sse = (k) => rows.reduce((a, r) => a + (candidatePred(r.avgGames, k, 0) - r.outcome) ** 2, 0);
  assert.equal(sse(0.80), 0);
  assert.ok(sse(0.79) > sse(0.80), 'SSE at 0.79 is greater');
  assert.ok(sse(0.81) > sse(0.80), 'SSE at 0.81 is greater');
  assert.equal(fitK(rows, 0), 0.80);
});

test('GC-3 fitK: a tie returns the value closest to 1.00', () => {
  // One row, 17 → 14: every k in 0.80..0.85 gives SSE 0; the closest to 1.00 is the top of the plateau.
  assert.equal(fitK([{ avgGames: 17, outcome: 14 }], 0), 0.85);
  // Everything ties (clamped to the floor): 1.00 wins.
  assert.equal(fitK([{ avgGames: 5, outcome: 9 }], 8), 1);
});

test('GC-3 fitK: second tie-break — two grid values equidistant from 1.00 tie on minimal SSE, the lower wins', () => {
  // Row a is exact for k ≤ 0.95, row b is exact for k ≥ 1.05; everything between costs 2, the far tails cost more.
  const rows = [{ avgGames: 9.9476, outcome: 9 }, { avgGames: 10.0478, outcome: 11 }];
  const sse = (k) => rows.reduce((acc, r) => acc + (candidatePred(r.avgGames, k, 0) - r.outcome) ** 2, 0);
  assert.equal(sse(0.95), 1);
  assert.equal(sse(1.05), 1);
  for (const k of [0.96, 0.98, 1.00, 1.02, 1.04]) assert.ok(sse(k) > 1, `k=${k} is worse`);
  assert.equal(fitK(rows, 0), 0.95);
});

test('GC-3 fitK: the floor-8 clamp is applied before the SSE', () => {
  const rows = [{ avgGames: 5, outcome: 4 }];
  assert.equal(fitK(rows, 8), 1, 'at floor 8 the prediction is 8 for every k, so nothing separates the grid values');
  assert.notEqual(fitK(rows, 0), 1, 'at floor 0 the same row does move k');
  assert.equal(candidatePred(5, 0.5, 8), 8);
  assert.equal(candidatePred(5, 0.5, 0), 3);
});

// ─── GC-4 fold leakage ───────────────────────────────────────────────────────

test('GC-4: no training row has S ≥ t, and the S = t − 1 rows are present', () => {
  const years = Array.from({ length: 10 }, (_, i) => 2015 + i);
  const folds = forwardChainFolds(years, GAMES_CAL_DEFAULTS.minTrainSeasons);
  assert.deepEqual(folds.map((f) => f.evalYear), [2018, 2019, 2020, 2021, 2022, 2023, 2024]);
  const rows = years.flatMap((S) => [{ id: `a${S}`, S }, { id: `b${S}`, S }]);
  for (const f of folds) {
    const train = foldTrainRows(rows, f);
    assert.ok(train.every((r) => r.S < f.evalYear), `fold ${f.evalYear} trains on S ≥ t`);
    assert.ok(train.some((r) => r.S === f.evalYear - 1), `fold ${f.evalYear} lacks the S = t − 1 rows`);
    assert.equal(train.filter((r) => r.S === f.evalYear - 1).length, 2);
    assert.ok(!train.some((r) => r.S === f.evalYear));
  }
});

// ─── GC-5 fallback ───────────────────────────────────────────────────────────

test('GC-5: a cell with fewer than minCellTrainPlayers training players takes its parent\'s k, and the fallback is recorded', () => {
  const row = (id, sState, outcome) => ({ id, position: 'WR', ageBucket: '25-27', sState, avgGames: 17, outcome });
  const train = [
    ...Array.from({ length: 50 }, (_, i) => row(`q${i}`, 'qual', 17)),
    ...Array.from({ length: 10 }, (_, i) => row(`s${i}`, 'short', 8)),
  ];
  const model = fitCandidate(train, 'C3');
  assert.equal(model.cells['pos|s']['WR|qual'].k, 1, 'a fitted cell keeps its own k');
  assert.equal(model.cells['pos|s']['WR|short'], undefined, '10 players < 40: not fitted');
  assert.deepEqual(model.thin, [{ cell: 'WR|short', players: 10 }], 'the thin cell is recorded');
  const parent = model.cells.pos.WR.k;
  assert.notEqual(parent, 1, 'the parent pools both states');
  const got = kFor(model, row('x', 'short', 8));
  assert.equal(got.k, parent);
  assert.equal(got.fallback, true);
  assert.equal(got.requested, 'WR|short');
  assert.equal(got.used, 'WR');
  const own = kFor(model, row('y', 'qual', 17));
  assert.equal(own.fallback, false);
  assert.equal(own.k, 1);
});

test('GC-5: the C4 chain pos|age|s → pos|s → pos, and an unk-age row goes straight to pos', () => {
  const row = (id, ageBucket, sState, outcome) => ({ id, position: 'WR', ageBucket, sState, avgGames: 17, outcome });
  const train = [
    row('s0', '25-27', 'short', 14),                                                    // 25-27|short: 1 player → thin
    ...['s1', 's2', 's3'].map((id) => row(id, '28-30', 'short', 14)),                   // pos|s WR|short: 4 players → k 0.85
    ...Array.from({ length: 10 }, (_, i) => row(`q${i}`, '28-30', 'qual', 17)),
    row('n0', '25-27', 'none', 17),                                                     // WR|none: 1 player → thin at pos|s too
  ];
  const model = fitCandidate(train, 'C4', { minCellTrainPlayers: 3 });
  assert.equal(model.cells['pos|age|s']['WR|25-27|short'], undefined);
  assert.equal(model.cells['pos|s']['WR|short'].k, 0.85);
  assert.equal(model.cells['pos|s']['WR|none'], undefined);
  const posK = model.cells.pos.WR.k;
  assert.equal(posK, 0.97, 'the pooled pos fit differs from the pos|s k');

  const mid = kFor(model, row('x', '25-27', 'short', 0));
  assert.equal(mid.used, 'WR|short', 'thin pos|age|s, fitted pos|s → the pos|s k');
  assert.equal(mid.k, 0.85);
  assert.equal(mid.fallback, true);
  const root = kFor(model, row('y', '25-27', 'none', 0));
  assert.equal(root.used, 'WR', 'both thin → the pos k');
  assert.equal(root.k, posK);
  const unk = kFor(model, row('z', 'unk', 'short', 0));
  assert.equal(unk.used, 'WR', 'unk age → the position cell even though pos|s is fitted');
  assert.equal(unk.k, posK);
  assert.notEqual(unk.k, model.cells['pos|s']['WR|short'].k);
  // C3 has no age level: an unk row keeps its pos|s cell.
  const c3 = fitCandidate(train, 'C3', { minCellTrainPlayers: 3 });
  assert.equal(kFor(c3, row('z', 'unk', 'short', 0)).used, 'WR|short');
});

// ─── GC-6 decision ───────────────────────────────────────────────────────────

const ci = (lo, hi) => ({ mean: (lo + hi) / 2, ci95: [lo, hi] });
const GOOD = { mse: 30, mae: 4, bias: 0.3 };
function summary(over = {}) {
  const s = {
    pooled: { dMse: ci(1, 2), dMae: ci(0.1, 0.3), bias: 3, mse: 40, mae: 5 },
    byPosition: Object.fromEntries(['QB', 'RB', 'WR', 'TE'].map((p) => [p, { dMse: ci(-1, 1), dMae: ci(-1, 1) }])),
    relevant: { dMse: ci(1, 2), dMae: ci(0.1, 0.3) },
  };
  return {
    pooled: { ...s.pooled, ...over.pooled }, byPosition: over.byPosition ?? s.byPosition, relevant: { ...s.relevant, ...over.relevant },
  };
}
const eligibleSummary = (mse = GOOD.mse, mae = GOOD.mae) => summary({
  pooled: { dMse: ci(-3, -1), dMae: ci(-0.5, -0.1), bias: GOOD.bias, mse, mae }, relevant: { dMse: ci(-2, -0.5), dMae: ci(-0.4, -0.05) },
});
function summaries(eligibleIds, mseById = {}) {
  return Object.fromEntries(CANDIDATE_IDS.map((id) => [id, eligibleIds.includes(id) ? eligibleSummary(mseById[id] ?? GOOD.mse) : summary()]));
}
const noPaired = () => null;

test('GC-6: simplest eligible candidate wins when nothing beats it', () => {
  const r = decide({ rule: 'mse', summaries: summaries(['C1']), paired: noPaired, recon: { mean: 0 } });
  assert.equal(r.outcome, 'W');
  assert.equal(r.pick, 'C1');
  assert.equal(decide({ rule: 'mse', summaries: summaries(['C1', 'C4']), paired: noPaired, recon: { mean: 0 } }).pick, 'C1', 'no CI win → no upgrade');
});

test('GC-6: a higher tier upgrades only on a paired CI below 0 versus the incumbent', () => {
  const s = summaries(['C1', 'C3']);
  const seen = [];
  const win = decide({ rule: 'mse', summaries: s, paired: (hi, lo) => { seen.push([hi, lo]); return [-0.5, -0.1]; }, recon: { mean: 0 } });
  assert.equal(win.pick, 'C3');
  assert.deepEqual(seen, [['C3', 'C1']]);
  const span = decide({ rule: 'mse', summaries: s, paired: () => [-0.5, 0.2], recon: { mean: 0 } });
  assert.equal(span.pick, 'C1', 'a CI that spans 0 does not upgrade');
});

test('GC-6: C2 vs C3 inside a tier resolve by pooled MSE before the walk', () => {
  const c3Lower = decide({ rule: 'mse', summaries: summaries(['C2', 'C3'], { C2: 31, C3: 29 }), paired: noPaired, recon: { mean: 0 } });
  assert.equal(c3Lower.pick, 'C3');
  const c2Lower = decide({ rule: 'mse', summaries: summaries(['C2', 'C3'], { C2: 28, C3: 29 }), paired: noPaired, recon: { mean: 0 } });
  assert.equal(c2Lower.pick, 'C2');
  // the tier member that loses the in-tier pick is never offered to the paired test
  const calls = [];
  decide({ rule: 'mse', summaries: summaries(['C1', 'C2', 'C3'], { C2: 28, C3: 29 }), paired: (hi, lo) => { calls.push(hi); return [-1, -0.5]; }, recon: { mean: 0 } });
  assert.deepEqual(calls, ['C2']);
});

test('GC-6: the f8 → f0 step needs a CI win', () => {
  const s = summaries(['C1', 'C1f0']);
  assert.equal(decide({ rule: 'mse', summaries: s, paired: () => [-0.4, 0.1], recon: { mean: 0 } }).pick, 'C1');
  assert.equal(decide({ rule: 'mse', summaries: s, paired: () => [-0.4, -0.1], recon: { mean: 0 } }).pick, 'C1f0');
});

test('GC-6: (N) when nothing is eligible, and each failing condition is named', () => {
  const none = decide({ rule: 'mse', summaries: summaries([]), paired: noPaired, recon: { mean: 0 } });
  assert.equal(none.outcome, 'N');
  assert.equal(none.pick, null);
  const biased = summary({ pooled: { dMse: ci(-3, -1), bias: 1.5 }, relevant: { dMse: ci(-2, -0.5) } });
  const worsePos = summary({ pooled: { dMse: ci(-3, -1), bias: 0.2 }, relevant: { dMse: ci(-2, -0.5) }, byPosition: { QB: { dMse: ci(0.3, 2), dMae: ci(-1, 1) }, RB: { dMse: ci(-1, 1) }, WR: { dMse: ci(-1, 1) }, TE: { dMse: ci(-1, 1) } } });
  const relWorse = summary({ pooled: { dMse: ci(-3, -1), bias: 0.2 }, relevant: { dMse: ci(-1, 2) } });
  const r = decide({ rule: 'mse', summaries: { ...summaries([]), C1: biased, C2: worsePos, C3: relWorse }, paired: noPaired, recon: { mean: 0 } });
  assert.deepEqual(r.eligibility.C1.failed, [2], '|bias| > 1.0');
  assert.deepEqual(r.eligibility.C2.failed, [3], 'QB made significantly worse');
  assert.deepEqual(r.eligibility.C3.failed, [4], 'relevant ΔMSE mean +0.5 > 0');
  const relOk = summary({ pooled: { dMse: ci(-3, -1), bias: 0.2 }, relevant: { dMse: { mean: 0, ci95: [-1, 1] } } });
  assert.deepEqual(decide({ rule: 'mse', summaries: { ...summaries([]), C1: relOk }, paired: noPaired, recon: { mean: 0 } }).eligibility.C1.failed, [], 'a relevant mean of exactly 0 passes');
});

test('GC-6: (S) when |mean recon| exceeds the tolerance, whatever the candidates look like', () => {
  const r = decide({ rule: 'mse', summaries: summaries(['C1']), paired: noPaired, recon: { mean: 0.2 }, tolerance: 0.05 });
  assert.equal(r.outcome, 'S');
  assert.equal(r.pick, null);
  assert.equal(decide({ rule: 'mae', summaries: summaries(['C1']), paired: noPaired, recon: { mean: -0.2 } }).outcome, 'S');
});

test('GC-6: the MAE rule drops the bias gate and judges by ΔMAE', () => {
  const biased = summary({ pooled: { dMse: ci(-3, -1), dMae: ci(-0.5, -0.1), bias: 2.5, mse: 30, mae: 4 }, relevant: { dMse: ci(-2, -0.5), dMae: ci(-0.4, -0.05) } });
  const s = { ...summaries([]), C1: biased };
  assert.deepEqual(decide({ rule: 'mse', summaries: s, paired: noPaired, recon: { mean: 0 } }).eligibility.C1.failed, [2]);
  const mae = decide({ rule: 'mae', summaries: s, paired: noPaired, recon: { mean: 0 } });
  assert.equal(mae.outcome, 'W');
  assert.equal(mae.pick, 'C1');
  // squared-error-only wins are not eligible under MAE
  const mseOnly = { ...summaries([]), C1: summary({ pooled: { dMse: ci(-3, -1), dMae: ci(0.1, 0.4), bias: 0.2 }, relevant: { dMse: ci(-2, -0.5), dMae: ci(0.1, 0.2) } }) };
  assert.equal(decide({ rule: 'mse', summaries: mseOnly, paired: noPaired, recon: { mean: 0 } }).pick, 'C1');
  assert.equal(decide({ rule: 'mae', summaries: mseOnly, paired: noPaired, recon: { mean: 0 } }).outcome, 'N');
});

// ─── GC-7 CLI and end to end ─────────────────────────────────────────────────

/** 60 WR/RB players over 2016–2024 on one team; the parity fixture is generated from the mirror itself. */
function syntheticLoad({ breakParity = false, withCause = false } = {}) {
  const store = {};
  const rosterWeekly = {};
  for (let y = 2016; y <= 2024; y++) {
    store[y] = { TEAM_KC: { team: 'KC', weeklyStatus: Array(17).fill('P') } };
    rosterWeekly[y] = { players: {} };
    for (let i = 0; i < 60; i++) {
      const gp = 8 + ((i * 7 + y * 3) % 10);
      store[y][`P${i}`] = { team: 'KC', gamesPlayed: gp, gamesStarted: gp, fantasyPoints: gp * 10, dnpWeeks: 0,
        weeklyStatus: [...Array(gp).fill('P'), ...Array(17 - gp).fill('X')], stats: {} };
    }
  }
  if (withCause) {
    // P0–P11: a short S season in 2019 and 2021 (gp 4, then 13 slots 'D' — or 'X' for scenario d). Scenario = i % 4.
    for (const y of [2019, 2021]) {
      for (let i = 0; i < 12; i++) {
        const sc = i % 4, id = `P${i}`;
        store[y][id] = { ...store[y][id], gamesPlayed: 4, gamesStarted: sc === 2 ? 0 : 4, fantasyPoints: 40, dnpWeeks: sc === 3 ? 0 : 13,
          weeklyStatus: [...Array(4).fill('P'), ...Array(13).fill(sc === 3 ? 'X' : 'D')], stats: {} };
        if (sc === 2) store[y - 1][id] = { ...store[y - 1][id], gamesStarted: 0, stats: {} };   // S−1 still gp ≥ 8, but not a contributor
        const status = ['RES', 'INA', 'INA', 'DEV'][sc];
        rosterWeekly[y].players[id] = Object.fromEntries(Array.from({ length: 13 }, (_, j) => [String(5 + j), [['KC', status]]]));
      }
    }
  }
  const careerStats = Object.fromEntries(Object.entries(store).map(([y, t]) => [y, Object.fromEntries(Object.entries(t).filter(([id]) => id === 'P0'))]));
  const m = projectedGamesFor(careerStats, 'P0', 'WR', { throughSeason: 2025 });
  const fixture = {
    sourceRev: 'synthetic', snapshot: '2026-10-04', positions: { P0: 'WR' },
    snapshotRows: { P0: { projectedGames: m.projectedGames + (breakParity ? 1 : 0), injurySeasons: m.injurySeasons, absenceShapeFactor: Math.round(m.absenceShapeFactor * 1000) / 1000, isBounceBack: false } },
    seasons: careerStats,
  };
  const ids = {}, bySleeper = {}, snapPlayers = {}, names = {};
  for (let i = 0; i < 60; i++) {
    ids[`g${i}`] = { sleeperId: `P${i}`, position: i % 2 ? 'RB' : 'WR' };
    bySleeper[`P${i}`] = { draftYear: 2010, birthdate: `${1990 + (i % 8)}-03-01` };
    snapPlayers[`P${i}`] = { projection: { confidence: 'high', projectedPPG: 8 + (i % 5) } };
    names[`P${i}`] = { full_name: `Player ${i}` };
  }
  return {
    gitRev: () => 'abc1234def',
    loadManifest: () => ({ files: {} }),
    loadSeasonTotals: (y) => store[y] ?? null,
    loadRosterWeekly: (y) => rosterWeekly[y] ?? null,
    loadPlayerIds: () => ({ ids, bySleeper }),
    loadSnapshot: () => ({ players: snapPlayers }),
    loadPlayersRaw: () => names,
    loadParityFixture: () => fixture,
  };
}
const smallDefaults = {
  ...GAMES_CAL_DEFAULTS, seasons: { from: 2016, to: 2024 }, predictorSeasons: { from: 2017, to: 2022 }, minTrainSeasons: 2,
  bootstrap: { resamples: 100, seed: 1 }, snapshotDate: '2026-10-07',
};

test('GC-7: gamesCalibrationMain runs end to end; --write hands one result and verdict to the writer', () => {
  const logs = [], errs = [], writes = [];
  const code = gamesCalibrationMain({
    load: syntheticLoad(), defaults: smallDefaults, write: true,
    writeArtifacts: (a) => { writes.push(a); return { panelPath: 'p', constantsPath: 'c', verdictPath: 'v', panelBytes: 1 }; },
    log: (m) => logs.push(m), logErr: (m) => errs.push(m),
  });
  assert.equal(code, 0);
  assert.equal(writes.length, 1);
  const r = writes[0].result;
  assert.equal(r.parity.dm1.rate, 1);
  assert.equal(r.meta.panelRev, 'abc1234def', 'the revision comes through load.gitRev()');
  assert.ok(r.rows.length > 100);
  assert.equal(r.recon.nonZero, 0, 'synthetic P counts equal gamesPlayed');
  assert.equal(r.qb.folds.length, 4, 'eval S = 2019…2022');
  assert.ok(r.decisions.mse && r.decisions.mae);
  assert.deepEqual(Object.keys(r.constants.candidates), CANDIDATE_IDS);
  assert.match(writes[0].verdictMd, /## 6\. Decision/);
  assert.match(logs.join('\n'), /## 3\. Q-A decomposition/);
});

test('GC-7: --write end to end with the real writer under a tmp root writes the three dated files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamescal-e2e-'));
  let written = null;
  const code = gamesCalibrationMain({
    load: syntheticLoad(), defaults: smallDefaults, write: true,
    writeArtifacts: (a) => (written = writeGamesCalibrationArtifacts({ ...a, root })),
    log: () => {}, logErr: () => {},
  });
  assert.equal(code, 0);
  for (const p of [written.panelPath, written.constantsPath, written.verdictPath]) {
    assert.ok(fs.existsSync(path.join(root, p)), `${p} exists`);
  }
  assert.match(fs.readFileSync(path.join(root, written.verdictPath), 'utf8'), /## 6\. Decision/);
  const panel = JSON.parse(fs.readFileSync(path.join(root, written.panelPath), 'utf8'));
  const d = panel.qb.tables.pooled.C1.dMse;
  assert.equal(d.mean, Math.round(d.mean * 1000) / 1000, 'persisted delta stats are 3 dp');
});

test('GC-7: parity below 99% stops with exit 1 and writes nothing', () => {
  const writes = [], errs = [];
  const code = gamesCalibrationMain({
    load: syntheticLoad({ breakParity: true }), defaults: smallDefaults, write: true,
    writeArtifacts: (a) => { writes.push(a); return {}; }, log: () => {}, logErr: (m) => errs.push(m),
  });
  assert.equal(code, 1);
  assert.equal(writes.length, 0);
  assert.match(errs.join('\n'), /parity .* below 99%/);
});

test('GC-7: writeGamesCalibrationArtifacts writes all three artifacts at the dated paths under the given root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamescal-'));
  const result = { meta: { generatedAt: '2026-10-08T12:00:00.000Z' }, constants: { candidates: { C1: { k: { QB: 0.7 } } } }, x: 1 };
  const w = writeGamesCalibrationArtifacts({ result, verdictMd: '# v', root });
  assert.equal(w.panelPath, 'backtests/2026-10-08-games-calibration-panel.json');
  assert.equal(w.constantsPath, 'backtests/2026-10-08-games-calibration-constants.json');
  assert.equal(w.verdictPath, 'grading/2026-10-08-games-calibration-verdict.md');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, w.panelPath), 'utf8')), { meta: result.meta, x: 1 });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, w.constantsPath), 'utf8')), result.constants);
  assert.equal(fs.readFileSync(path.join(root, w.verdictPath), 'utf8'), '# v\n');
});

test('GC-7: the CLI rejects an unknown flag with exit 1 and a message naming it', () => {
  const r = spawnSync(process.execPath, ['bin/backtest.mjs', '--games-calibration', '--bogus'], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--games-calibration rejects --bogus/);
});

// ─── L6b (.claude/tasks/games-calibration-cause-split.md §6) ─────────────────

const cnt = (o = {}) => ({ played: 0, reserve: 0, inactive: 0, activeNoPlay: 0, practiceSquad: 0, otherStatus: 0, offRoster: 0, ...o });

test('GCC-1 rosterCause: RES → inj; Daniels-shaped INA differs by K2/K3; DEV → cut; tie order inj ≥ bench ≥ cut; all zero → cut', () => {
  assert.equal(rosterCause(cnt({ reserve: 8, inactive: 2, practiceSquad: 3 }), {}), 'inj');
  // Daniels: played 7, INA 10, a contributor
  const daniels = cnt({ played: 7, inactive: 10 });
  assert.equal(rosterCause(daniels, { contributor: true, contributorAbsence: false }), 'bench', 'K2: INA is bench');
  assert.equal(rosterCause(daniels, { contributor: true, contributorAbsence: true }), 'inj', 'K3: a contributor\'s INA is injury');
  // a non-contributor with INA is bench under both
  assert.equal(rosterCause(daniels, { contributor: false, contributorAbsence: false }), 'bench');
  assert.equal(rosterCause(daniels, { contributor: false, contributorAbsence: true }), 'bench');
  // K3 moves ACT-not-playing slots as well
  assert.equal(rosterCause(cnt({ activeNoPlay: 9, practiceSquad: 1 }), { contributor: true, contributorAbsence: true }), 'inj');
  assert.equal(rosterCause(cnt({ practiceSquad: 6, offRoster: 2, activeNoPlay: 3 }), {}), 'cut', 'DEV + off roster outweigh bench');
  assert.equal(rosterCause(cnt({ otherStatus: 5, inactive: 1 }), {}), 'cut', 'other status counts as cut');
  // ties
  assert.equal(rosterCause(cnt({ reserve: 4, inactive: 4, offRoster: 4 }), {}), 'inj', 'equal counts → inj');
  assert.equal(rosterCause(cnt({ inactive: 3, offRoster: 3 }), {}), 'bench', 'bench = cut → bench');
  assert.equal(rosterCause(cnt({ reserve: 2, inactive: 3 }), {}), 'bench', 'bench > inj → bench');
  assert.equal(rosterCause(cnt(), {}), 'cut', 'all zero → cut');
});

/** A mini store for GCC-2: KC plays every slot of 2017–2021; player A is a short non-contributor; B is a contributor. */
function miniStore() {
  const store = {};
  for (let y = 2015; y <= 2021; y++) store[y] = { TEAM_KC: { team: 'KC', weeklyStatus: Array(17).fill('P') } };
  const full = (over = {}) => ({ team: 'KC', gamesPlayed: 16, gamesStarted: 0, fantasyPoints: 100, dnpWeeks: 0, stats: {}, weeklyStatus: Array(16).fill('P').concat(['X']), ...over });
  const short = (over = {}) => full({ gamesPlayed: 4, dnpWeeks: 13, weeklyStatus: [...Array(4).fill('P'), ...Array(13).fill('D')], ...over });
  store[2018].A = full(); store[2019].A = short();                    // non-contributor in S and S−1
  store[2018].B = full({ gamesStarted: 16 }); store[2019].B = short({ gamesStarted: 4 });
  store[2018].N = full(); store[2020].N = full();                     // N has no 2019 row (a `none` S row)
  store[2015].Z = short({ gamesStarted: 4 });                         // S = 2015
  const rosterByYear = {};
  for (let y = 2015; y <= 2021; y++) rosterByYear[y] = { players: {} };
  const ina = Object.fromEntries(Array.from({ length: 13 }, (_, j) => [String(5 + j), [['KC', 'INA']]]));
  rosterByYear[2019].players.A = ina; rosterByYear[2019].players.B = ina;
  return { store, rosterByYear };
}

test('GCC-2 causeStates: S = 2015 → unk for K2/K3 only; a none row with no listing → none-cut; K1 = classifyInjurySeason; no S+1 leak', () => {
  const { store, rosterByYear } = miniStore();
  const ctx = { store, rosterByYear };
  const z = causeStates({ id: 'Z', S: 2015, position: 'WR', sState: 'short' }, ctx);
  assert.deepEqual([z.k2, z.k3, z.sCounts], ['unk', 'unk', null]);
  assert.equal(z.k1, 'short-inj', 'K1 is still computed for S = 2015');

  const n = causeStates({ id: 'N', S: 2019, position: 'WR', sState: 'none' }, ctx);
  assert.deepEqual([n.k1, n.k2, n.k3], ['none', 'none-cut', 'none-cut']);
  assert.equal(n.sCounts.offRoster, 17, 'S−1 team fallback: all 17 KC games off roster');

  const q = causeStates({ id: 'A', S: 2018, position: 'WR', sState: 'qual' }, ctx);
  assert.deepEqual([q.k1, q.k2, q.k3, q.sCounts], ['qual', 'qual', 'qual', null]);

  // K1 equals the app flag read through seasonView(store, S)
  for (const id of ['A', 'B']) {
    const k = causeStates({ id, S: 2019, position: 'WR', sState: 'short' }, ctx);
    assert.equal(k.k1, classifyInjurySeason(seasonView(store, 2019), id, 'WR', 2019) ? 'short-inj' : 'short-oth');
  }
  const a = causeStates({ id: 'A', S: 2019, position: 'WR', sState: 'short' }, ctx);
  const b = causeStates({ id: 'B', S: 2019, position: 'WR', sState: 'short' }, ctx);
  assert.deepEqual([a.k1, a.k2, a.k3], ['short-oth', 'short-bench', 'short-bench']);
  assert.deepEqual([b.k1, b.k2, b.k3], ['short-inj', 'short-bench', 'short-inj']);

  // no leak: a contributor S+1 row for A must change nothing (the app flag would turn A short-inj on the full store)
  assert.equal(classifyInjurySeason(store, 'A', 'WR', 2019), false);
  store[2020].A = { team: 'KC', gamesPlayed: 16, gamesStarted: 16, fantasyPoints: 200, dnpWeeks: 0, stats: {}, weeklyStatus: Array(16).fill('P').concat(['X']) };
  assert.equal(classifyInjurySeason(store, 'A', 'WR', 2019), true, 'the S+1 row would flip the unrestricted flag');
  const a2 = causeStates({ id: 'A', S: 2019, position: 'WR', sState: 'short' }, { store, rosterByYear });
  assert.deepEqual([a2.k1, a2.k2, a2.k3], [a.k1, a.k2, a.k3]);
});

test('GCC-3 rel3Of: top-N in S−2 → true; only S−3 → false; only S+1 → false; a relevant row is always rel3', () => {
  const rows = new Map([['2017|x', 5], ['2016|y', 3], ['2021|z', 2], ['2019|w', 33], ['2019|v', 32]]);
  const N = { QB: 32, RB: 60, WR: 84, TE: 32 };
  const d = { relevantTopN: N };
  assert.equal(rel3Of({ id: 'x', S: 2019, position: 'QB' }, rows, d), true, 'top-N in S−2 only');
  assert.equal(rel3Of({ id: 'y', S: 2019, position: 'QB' }, rows, d), false, 'top-N in S−3 only');
  assert.equal(rel3Of({ id: 'z', S: 2020, position: 'QB' }, rows, d), false, 'top-N in S+1 only (no leak)');
  assert.equal(rel3Of({ id: 'w', S: 2019, position: 'QB' }, rows, d), false, 'rank 33 > 32');
  assert.equal(rel3Of({ id: 'v', S: 2019, position: 'QB' }, rows, d), true, 'rank 32 ≤ 32, in S itself');
  assert.equal(rel3Of({ id: 'nobody', S: 2019, position: 'QB' }, rows, d), false);
  // relevant (rank ≤ N in S) ⇒ rel3, for every position's boundary
  for (const [p, n] of Object.entries(N)) {
    assert.equal(rel3Of({ id: 'q', S: 2019, position: p }, new Map([['2019|q', n]]), d), true);
    assert.equal(rel3Of({ id: 'q', S: 2019, position: p }, new Map([['2019|q', n + 1]]), d), false);
  }
});

function careerOf(seasons, over = {}) {
  return Object.fromEntries(Object.entries(seasons).map(([y, gp]) => [y, { P: { gamesPlayed: gp, gamesStarted: gp, fantasyPoints: gp * 10, dnpWeeks: 0, stats: {}, ...over } }]));
}

test('GCC-4 avgGamesSeasonLength: 16→17 scales by 17/16; mixed history hand-computed; same length returns avgGames exactly; recent weights sum to 1', () => {
  const r16 = projectedGamesFor(careerOf({ 2018: 16, 2019: 16, 2020: 16 }), 'P', 'WR', { throughSeason: 2020 });
  assert.ok(Math.abs(avgGamesSeasonLength(r16, 2021) - r16.avgGames * 17 / 16) < 1e-12);
  assert.ok(Math.abs(avgGamesSeasonLength(r16, 2021) - 17) < 1e-12);

  // mixed: 2019 (16-game) 14, 2020 (16-game) 15, 2021 (17-game) 16 → outcome 2022 (17); weights .2/.3/.5; absence-shape ×0.90 carries
  const avail = { availability: { absenceSegments: [{ length: 3 }, { length: 3 }], longestAbsence: 0 } };
  const mixed = projectedGamesFor(careerOf({ 2019: 14, 2020: 15, 2021: 16 }, avail), 'P', 'WR', { throughSeason: 2021 });
  assert.ok(Math.abs(mixed.absenceShapeFactor - 0.9) < 1e-12);
  const baseL = 0.2 * 14 * 17 / 16 + 0.3 * 15 * 17 / 16 + 0.5 * 16;
  assert.ok(Math.abs(avgGamesSeasonLength(mixed, 2022) - 0.9 * baseL) < 1e-9, `${avgGamesSeasonLength(mixed, 2022)} vs ${0.9 * baseL}`);
  // the same history projected into a 16-game outcome season (hypothetical 2020) scales the 17-game season down
  assert.ok(Math.abs(avgGamesSeasonLength(mixed, 2020) - 0.9 * (0.2 * 14 + 0.3 * 15 + 0.5 * 16 * 16 / 17)) < 1e-9);

  // equal lengths: exactly avgGames (===), no float round-trip
  const odd = projectedGamesFor(careerOf({ 2016: 13, 2017: 11, 2018: 15 }, avail), 'P', 'WR', { throughSeason: 2018 });
  assert.equal(avgGamesSeasonLength(odd, 2019), odd.avgGames);
  assert.equal(avgGamesSeasonLength(odd, 2020), odd.avgGames);
  const r17 = projectedGamesFor(careerOf({ 2021: 13, 2022: 11, 2023: 15 }, avail), 'P', 'WR', { throughSeason: 2023 });
  assert.equal(avgGamesSeasonLength(r17, 2024), r17.avgGames);

  // the additive `recent` field
  assert.deepEqual(mixed.recent.map((x) => [x.season, x.gamesPlayed]), [[2019, 14], [2020, 15], [2021, 16]]);
  assert.ok(Math.abs(mixed.recent.reduce((a, x) => a + x.w, 0) - 1) < 1e-12);
  assert.deepEqual(mixed.recent.map((x) => x.w), [0.2, 0.3, 0.5]);
  const plain = projectedGamesFor(careerOf({ 2018: 14, 2019: 15, 2020: 16 }), 'P', 'WR', { throughSeason: 2020 });
  assert.equal(plain.projectedGames, 15, 'projectedGames is unchanged by the additive field');
  assert.equal(projectedGamesFor(careerOf({ 2020: 12 }), 'P', 'WR', { throughSeason: 2020 }).recent.length, 1);
});

test('GCC-5 generalised cells: L6 keys are unchanged; unk causes route to pos|s; thin cells fall back; unknown dimensions throw; avgKey selects the input', () => {
  const R = (over) => ({ position: 'WR', ageBucket: '25-27', sState: 'short', rel3: false, k1: 'short-oth', k2: 'short-bench', k3: 'short-bench', ...over });
  const cases = [
    [R({}), { pos: 'WR', 'pos|s': 'WR|short', 'pos|age': 'WR|25-27', 'pos|age|s': 'WR|25-27|short' }],
    [R({ position: 'QB', ageBucket: '<=26', sState: 'qual' }), { pos: 'QB', 'pos|s': 'QB|qual', 'pos|age': 'QB|<=26', 'pos|age|s': 'QB|<=26|qual' }],
    [R({ position: 'QB', ageBucket: '27-31' }), { pos: 'QB', 'pos|s': 'QB|short', 'pos|age': 'QB|27-31', 'pos|age|s': 'QB|27-31|short' }],
    [R({ position: 'QB', ageBucket: '32-35' }), { pos: 'QB', 'pos|s': 'QB|short', 'pos|age': 'QB|32-35', 'pos|age|s': 'QB|32-35|short' }],
    [R({ position: 'QB', ageBucket: '36+', sState: 'none' }), { pos: 'QB', 'pos|s': 'QB|none', 'pos|age': 'QB|36+', 'pos|age|s': 'QB|36+|none' }],
    [R({ ageBucket: '<=24' }), { pos: 'WR', 'pos|s': 'WR|short', 'pos|age': 'WR|<=24', 'pos|age|s': 'WR|<=24|short' }],
    [R({ ageBucket: '28-30' }), { pos: 'WR', 'pos|s': 'WR|short', 'pos|age': 'WR|28-30', 'pos|age|s': 'WR|28-30|short' }],
    [R({ ageBucket: '31+', sState: 'none' }), { pos: 'WR', 'pos|s': 'WR|none', 'pos|age': 'WR|31+', 'pos|age|s': 'WR|31+|none' }],
    [R({ ageBucket: 'unk' }), { pos: 'WR', 'pos|s': 'WR|short', 'pos|age': null, 'pos|age|s': null }],
  ];
  for (const [row, expected] of cases) for (const [level, key] of Object.entries(expected)) assert.equal(cellKey(level, row), key, `${level} ${JSON.stringify(row.ageBucket)}`);
  // new dimensions
  assert.equal(cellKey('pos|rel|k3', R({ rel3: true })), 'WR|rel|short-bench');
  assert.equal(cellKey('pos|rel|k1', R({})), 'WR|oth|short-oth');
  assert.equal(cellKey('pos|k2', R({ k2: 'unk' })), null);
  assert.equal(cellKey('pos|rel|k3', R({ k3: 'unk', rel3: true })), null);
  assert.throws(() => cellKey('pos|bogus', R({})), /unknown cell dimension 'bogus' in level 'pos\|bogus'/);

  // an unk k2 row lands on pos|s in pos|rel|k2 → pos|k2 → pos|s → pos
  const train = [];
  for (let i = 0; i < 6; i++) {
    train.push({ id: `a${i}`, position: 'WR', ageBucket: '25-27', sState: 'short', rel3: i < 2, k1: 'short-oth', k2: 'short-cut', k3: 'short-cut', avgGames: 14, avgGamesL: 14, outcome: 8 });
    train.push({ id: `b${i}`, position: 'WR', ageBucket: '25-27', sState: 'short', rel3: false, k1: 'short-oth', k2: 'unk', k3: 'unk', avgGames: 14, avgGamesL: 14, outcome: 10 });
  }
  const opts = { minCellTrainPlayers: 3, candidates: CAUSE_CANDIDATES };
  const m2 = fitCandidate(train, 'RK2f0', opts);
  assert.deepEqual(m2.levels, ['pos|rel|k2', 'pos|k2', 'pos|s', 'pos']);
  const unk = kFor(m2, R({ k2: 'unk', rel3: true }));
  assert.equal(unk.used, 'WR|short', 'unk k2 skips both k2 levels');
  assert.equal(unk.fallback, false, 'pos|s was the first level it could request');
  // a thin pos|rel|k3 cell (2 players < 3) falls back to pos|k3
  const m3 = fitCandidate(train, 'RK3f0', opts);
  const thin = kFor(m3, R({ k3: 'short-cut', rel3: true }));
  assert.equal(thin.requested, 'WR|rel|short-cut');
  assert.equal(thin.used, 'WR|short-cut');
  assert.equal(thin.fallback, true);
  assert.deepEqual(m3.thin.map((t) => t.cell), ['WR|rel|short-cut']);
  // an unknown dimension in a candidate throws at fit time
  assert.throws(() => fitCandidate(train, 'X', { candidates: { X: { levels: ['pos|nope', 'pos'], floor: 0 } } }), /unknown cell dimension/);

  // avgKey: avgGamesL = 12 equals the outcome, avgGames = 16 does not
  const rows = Array.from({ length: 5 }, (_, i) => ({ id: `r${i}`, position: 'WR', avgGames: 16, avgGamesL: 12, outcome: 12 }));
  const byL = fitCandidate(rows, 'X', { candidates: { X: { levels: ['pos'], floor: 0, avgKey: 'avgGamesL' } } });
  const byG = fitCandidate(rows, 'X', { candidates: { X: { levels: ['pos'], floor: 0 } } });
  assert.equal(byL.avgKey, 'avgGamesL');
  assert.equal(byL.cells.pos.WR.k, 1);
  assert.ok(byG.cells.pos.WR.k < 0.8 && byG.cells.pos.WR.k !== byL.cells.pos.WR.k, 'the default input needs a cut (0.75–0.78 all round to 12)');
});

const GATE_IDS = ['L0', ...CAUSE_CANDIDATE_IDS];
const cpos = (dMae) => Object.fromEntries(['QB', 'RB', 'WR', 'TE'].map((p) => [p, { dMae }]));
/** An eligible summary at every δ ≥ 0.10 unless overridden. */
function csum(over = {}) {
  return {
    relevant: { dMae: ci(-0.2, 0.05), bias: 0.3, c0Bias: 1.8, ...over.relevant },
    star: { dMae: ci(-1.2, 0.05), ...over.star },
    pooled: { dMse: ci(-3, -1), ...over.pooled },
    rStar: { mae: 5, ...over.rStar },
    relevantByPosition: over.relevantByPosition ?? cpos(ci(-0.3, 0.05)),
  };
}
const csums = (eligible = {}) => Object.fromEntries(GATE_IDS.map((id) => [id, id in eligible ? csum(eligible[id]) : csum({ pooled: { dMse: ci(0.1, 1) } })]));

test('GCC-6 causeEligibility: each gate fails alone and is named; null cis fail G1/G3/G4 but not G5', () => {
  assert.deepEqual(causeEligibility(csum(), 0.25), { eligible: true, failed: [] });
  assert.deepEqual(causeEligibility(csum({ relevant: { dMae: ci(0, 0.4) } }), 0.25).failed, ['G1']);
  assert.deepEqual(causeEligibility(csum({ relevant: { dMae: ci(0, 0.25) } }), 0.25).failed, [], 'ci upper bound exactly δ passes (≤)');
  assert.deepEqual(causeEligibility(csum({ relevant: { bias: 1.2 } }), 0.25).failed, ['G2'], '|bias| > 1.0');
  assert.deepEqual(causeEligibility(csum({ relevant: { bias: -0.9, c0Bias: 0.5 } }), 0.25).failed, ['G2'], 'not smaller in size than C0');
  assert.deepEqual(causeEligibility(csum({ star: { dMae: ci(0, 0.6) } }), 0.25).failed, ['G3']);
  assert.deepEqual(causeEligibility(csum({ pooled: { dMse: ci(-1, 0.2) } }), 0.25).failed, ['G4']);
  assert.deepEqual(causeEligibility(csum({ relevantByPosition: { ...cpos(ci(-0.3, 0.05)), QB: { dMae: ci(0.3, 0.9) } } }), 0.25).failed, ['G5'], 'QB lower bound 0.3 > δ');
  assert.deepEqual(causeEligibility(csum({ relevant: { dMae: { mean: 0, ci95: null } } }), 0.25).failed, ['G1'], 'null ci fails G1');
  assert.deepEqual(causeEligibility(csum({ star: { dMae: { mean: 0, ci95: null } } }), 0.25).failed, ['G3']);
  assert.deepEqual(causeEligibility(csum({ pooled: { dMse: { mean: 0, ci95: null } } }), 0.25).failed, ['G4']);
  assert.deepEqual(causeEligibility(csum({ relevantByPosition: { ...cpos(ci(-0.3, 0.05)), TE: { dMae: { n: 0, mean: null, ci95: null } } } }), 0.25).failed, [], 'a null ci at a position does not fail G5');
  assert.deepEqual(causeEligibility(csum({ relevant: { dMae: ci(0, 0.4), bias: 2 } }), 0.25).failed, ['G1', 'G2']);
});

test('GCC-6 decideCause: parsimony walk, C3f0 never picked, in-tier ties by tier order, K3 text, three deltas, recon stop', () => {
  const recon0 = { mean: 0 };
  // K2f0 tied with K1f0 (paired CI crosses 0) → K1f0; a null paired CI also keeps K1f0
  const s = csums({ K1f0: {}, K2f0: { rStar: { mae: 4.5 } } });
  const seen = [];
  const tied = decideCause({ summaries: s, paired: (hi, lo) => { seen.push([hi, lo]); return [-0.4, 0.1]; }, delta: 0.25, recon: recon0 });
  assert.equal(tied.outcome, 'W');
  assert.equal(tied.pick, 'K1f0');
  assert.deepEqual(seen, [['K2f0', 'K1f0']]);
  assert.doesNotMatch(tied.text, /served/);
  assert.equal(decideCause({ summaries: s, paired: () => null, delta: 0.25, recon: recon0 }).pick, 'K1f0');
  // an eligible C3f0 with the best R* MAE is never picked, and alone it gives (N)
  const c3Best = csums({ C3f0: { rStar: { mae: 1 } }, K1f0: { rStar: { mae: 6 } } });
  assert.equal(decideCause({ summaries: c3Best, paired: () => [-9, -8], delta: 0.25, recon: recon0 }).pick, 'K1f0');
  const c3Only = decideCause({ summaries: csums({ C3f0: {} }), paired: () => [-9, -8], delta: 0.25, recon: recon0 });
  assert.equal(c3Only.outcome, 'N');
  assert.equal(c3Only.pick, null);
  assert.equal(c3Only.eligibility.C3f0.eligible, true, 'still tabled as eligible');
  assert.equal(c3Only.text, '(N) no change at δ = 0.25 — no candidate is eligible.');
  // equal R* MAE inside a tier → CAUSE_TIERS array order (K2f0 before K3f0); a lower K3 MAE wins
  const eq = decideCause({ summaries: csums({ K3f0: {}, K2f0: {} }), paired: noPaired, delta: 0.25, recon: recon0 });
  assert.equal(eq.pick, 'K2f0');
  const k3Lower = decideCause({ summaries: csums({ K3f0: { rStar: { mae: 4 } }, K2f0: {} }), paired: noPaired, delta: 0.25, recon: recon0 });
  assert.equal(k3Lower.pick, 'K3f0');
  // a K3 candidate with a paired CI below 0 replaces K1f0, and the text names the served-signal need
  const up = decideCause({ summaries: csums({ K1f0: {}, K3f0: {} }), paired: () => [-0.5, -0.1], delta: 0.25, recon: recon0 });
  assert.equal(up.pick, 'K3f0');
  assert.match(up.text, /^\(W\) wire K3f0 at δ = 0\.25 /);
  assert.match(up.text, /needs a new served roster-cause signal \(the app does not read rosterweekly\)/);
  // a later app-native tier needs the CI win as well (RK1 over K1f0)
  assert.equal(decideCause({ summaries: csums({ K1f0: {}, RK1: {} }), paired: () => [-0.5, 0.1], delta: 0.25, recon: recon0 }).pick, 'K1f0');
  // three deltas: eligible at 0.50 but not at 0.10 / 0.25
  const wide = csums({ K1f0: { relevant: { dMae: ci(0, 0.4) } } });
  const byDelta = Object.fromEntries([0.10, 0.25, 0.50].map((d) => [d, decideCause({ summaries: wide, paired: noPaired, delta: d, recon: recon0 })]));
  assert.deepEqual(Object.values(byDelta).map((d) => d.outcome), ['N', 'N', 'W']);
  assert.equal(byDelta[0.5].pick, 'K1f0');
  assert.deepEqual(byDelta[0.1].eligibility.K1f0.failed, ['G1']);
  // (S) on a recon breach
  const stop = decideCause({ summaries: s, paired: noPaired, delta: 0.25, recon: { mean: 0.2 }, tolerance: 0.05 });
  assert.equal(stop.outcome, 'S');
  assert.equal(stop.pick, null);
});

test('GCC-7: end to end with the cause fixture — every scenario row carries the pre-stated K1/K2/K3; one write; three decisions; closed-set assertion', () => {
  const logs = [], errs = [], writes = [];
  const code = gamesCauseMain({
    load: syntheticLoad({ withCause: true }), defaults: smallDefaults, write: true,
    writeArtifacts: (a) => { writes.push(a); return { panelPath: 'p', constantsPath: 'c', verdictPath: 'v', panelBytes: 1 }; },
    log: (m) => logs.push(m), logErr: (m) => errs.push(m),
  });
  assert.equal(code, 0);
  assert.equal(writes.length, 1);
  const r = writes[0].result;
  assert.deepEqual(Object.keys(r.decisions).sort(), ['0.1', '0.25', '0.5']);
  assert.deepEqual(Object.keys(r.constants.candidates), CAUSE_CANDIDATE_IDS);
  assert.match(writes[0].verdictMd, /## 7\. Decision/);
  assert.match(writes[0].verdictMd, /## 8\. 2026 impact/);
  assert.match(logs.join('\n'), /## 3\. Cause split/);
  assert.equal(r.recon.nonZero, 0);
  assert.equal(r.meta.primaryDelta, 0.25);
  const expected = [['short-inj', 'short-inj', 'short-inj'], ['short-inj', 'short-bench', 'short-inj'], ['short-oth', 'short-bench', 'short-bench'], ['short-oth', 'short-cut', 'short-cut']];
  for (const S of [2019, 2021]) {
    for (let i = 0; i < 12; i++) {
      const row = r.rows.find((x) => x.id === `P${i}` && x.S === S);
      assert.ok(row, `panel row P${i} S=${S}`);
      assert.equal(row.sState, 'short');
      assert.deepEqual([row.k1, row.k2, row.k3], expected[i % 4], `P${i} S=${S} scenario ${'abcd'[i % 4]}`);
    }
  }
  assert.ok(r.rows.filter((x) => x.sState === 'qual').every((x) => x.k1 === 'qual' && x.k2 === 'qual' && x.k3 === 'qual'));
  assert.ok(r.rows.every((x) => x.rel3 || !x.relevant), 'relevant ⇒ rel3');
});

test('GCC-7: the real writer under a tmp root writes the three games-cause paths; a parity break exits 1 with nothing written', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamescause-e2e-'));
  let written = null;
  const code = gamesCauseMain({
    load: syntheticLoad({ withCause: true }), defaults: smallDefaults, write: true,
    writeArtifacts: (a) => (written = writeGamesCauseArtifacts({ ...a, root })),
    log: () => {}, logErr: () => {},
  });
  assert.equal(code, 0);
  const date = new Date().toISOString().slice(0, 10);
  assert.equal(written.panelPath, `backtests/${date}-games-cause-panel.json`);
  assert.equal(written.constantsPath, `backtests/${date}-games-cause-constants.json`);
  assert.equal(written.verdictPath, `grading/${date}-games-cause-verdict.md`);
  for (const p of [written.panelPath, written.constantsPath, written.verdictPath]) assert.ok(fs.existsSync(path.join(root, p)), `${p} exists`);
  const panel = JSON.parse(fs.readFileSync(path.join(root, written.panelPath), 'utf8'));
  assert.equal(panel.constants, undefined, 'constants live in their own file');
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(root, written.constantsPath), 'utf8')).candidates), CAUSE_CANDIDATE_IDS);

  const writes = [], errs = [];
  const bad = gamesCauseMain({
    load: syntheticLoad({ withCause: true, breakParity: true }), defaults: smallDefaults, write: true,
    writeArtifacts: (a) => { writes.push(a); return {}; }, log: () => {}, logErr: (m) => errs.push(m),
  });
  assert.equal(bad, 1);
  assert.equal(writes.length, 0);
  assert.match(errs.join('\n'), /parity .* below 99%/);
});

test('GCC-8 CLI: --cause alone and --cause with an unknown flag both exit 1 with the named message', () => {
  const alone = spawnSync(process.execPath, ['bin/backtest.mjs', '--cause'], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(alone.status, 1);
  assert.match(alone.stderr, /--cause requires --games-calibration/);
  const bogus = spawnSync(process.execPath, ['bin/backtest.mjs', '--games-calibration', '--cause', '--bogus'], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(bogus.status, 1);
  assert.match(bogus.stderr, /rejects --bogus/);
  assert.match(bogus.stderr, /takes only --cause, --short, --json and --write/);
});

// ─── L6c short-season-only (GCS-) ────────────────────────────────────────────

const WR_ROW = (id, sState, avgGames, outcome, extra = {}) => ({ id, position: 'WR', ageBucket: '25-27', sState, avgGames, outcome, ...extra });

test('GCS-1 fitShortCandidate: fits on non-qualifying rows only; the root is the pooled non-qualifying k; no qual cell exists', () => {
  const rows = [
    ...Array.from({ length: 45 }, (_, i) => WR_ROW(`q${i}`, 'qual', 15, 15)),   // k = 1 would be optimal
    // avgGames/outcome 10→6, 14→8, 15→9: SSE is 0 exactly on k ∈ [0.57, 0.60], and the tie goes to the value nearest 1.00 → 0.60
    ...Array.from({ length: 45 }, (_, i) => WR_ROW(`s${i}`, 'short', [10, 14, 15][i % 3], [6, 8, 9][i % 3])),
  ];
  const model = fitShortCandidate(rows, 'SOf0');
  assert.equal(model.cells['pos|s']['WR|short'].k, 0.6);
  const shortOnly = fitK(rows.filter((r) => r.sState === 'short'), 0);
  assert.equal(model.cells.pos.WR.k, shortOnly);
  assert.notEqual(model.cells.pos.WR.k, fitK(rows, 0), 'pooling the qualifying rows would give a different root');
  for (const level of Object.keys(model.cells)) {
    assert.ok(!Object.keys(model.cells[level]).some((k) => k.endsWith('|qual')), `no qual key in ${level}`);
  }
});

test('GCS-2 shortPred: qualifying rows keep r.pred; short rows take the fitted k at floor 0; a thin cell falls back; K1 states take their own k', () => {
  const rows = [
    ...Array.from({ length: 45 }, (_, i) => WR_ROW(`i${i}`, 'short', 10, 6, { k1: 'short-inj' })),
    ...Array.from({ length: 45 }, (_, i) => WR_ROW(`o${i}`, 'short', 10, 8, { k1: 'short-oth' })),
    ...Array.from({ length: 5 }, (_, i) => WR_ROW(`n${i}`, 'none', 10, 6, { k1: 'none' })),
  ];
  const so = fitShortCandidate(rows, 'SOf0');
  assert.deepEqual(so.thin.find((t) => t.cell === 'WR|none'), { cell: 'WR|none', players: 5 }, 'WR|none is an observed thin cell');
  assert.ok(so.cells.pos.WR.k < 1, 'the root k is below 1');
  const q1 = shortPred(so, WR_ROW('a', 'qual', 7.4, 0, { pred: 8, k1: 'qual' }));
  assert.equal(q1.p, 8, 'floor-8 prediction kept');
  assert.equal(q1.used, 'qual');
  const q2 = shortPred(so, WR_ROW('b', 'qual', 15.6, 0, { pred: 16, k1: 'qual' }));
  assert.equal(q2.p, 16, 'p === r.pred even though the root k is below 1');
  const sh = shortPred(so, WR_ROW('c', 'short', 10, 0, { pred: 10, k1: 'short-inj' }));
  assert.equal(sh.p, candidatePred(10, so.cells['pos|s']['WR|short'].k, 0));
  assert.equal(sh.fallback, false);
  const none = shortPred(so, WR_ROW('d', 'none', 10, 0, { pred: 10, k1: 'none' }));
  assert.equal(none.fallback, true, 'observed thin cell (5 players) → pos');
  assert.equal(none.requested, 'WR|none');
  assert.equal(none.used, 'WR');
  assert.equal(none.p, candidatePred(10, so.cells.pos.WR.k, 0));
  const k1 = fitShortCandidate(rows, 'SOK1f0');
  const inj = shortPred(k1, WR_ROW('e', 'short', 10, 0, { pred: 10, k1: 'short-inj' }));
  const oth = shortPred(k1, WR_ROW('f', 'short', 10, 0, { pred: 10, k1: 'short-oth' }));
  assert.equal(inj.used, 'WR|short-inj');
  assert.equal(oth.used, 'WR|short-oth');
  assert.ok(inj.k < oth.k, 'short-inj (0.60) takes a harder cut than short-oth (0.80)');
  assert.deepEqual(Object.keys(SHORT_CANDIDATES), ['SOf0', 'SOK1f0']);
});

const SHORT_IDS = ['C3f0', 'K1f0', 'SOf0', 'SOK1f0'];
function ssum(over = {}) {
  return {
    relevant: { dMae: ci(-0.2, 0.05), bias: 1.6, c0Bias: 1.6, ...over.relevant },
    star: { dMae: ci(-1.8, -0.5), ...over.star },
    pooled: { dMse: ci(-3, -1), ...over.pooled },
    rStar: { mae: 5, ...over.rStar },
    relevantByPosition: over.relevantByPosition ?? cpos(ci(-0.3, 0.05)),
  };
}
const ssums = (eligible = {}) => Object.fromEntries(SHORT_IDS.map((id) => [id, id in eligible ? ssum(eligible[id]) : ssum({ pooled: { dMse: ci(0.1, 1) } })]));

test('GCS-3 shortEligibility: G1/G3/G4/G5 each fail alone; G3 is strict; relevant bias is not gated; null cis', () => {
  assert.deepEqual(shortEligibility(ssum(), 0.25), { eligible: true, failed: [] });
  assert.deepEqual(shortEligibility(ssum({ relevant: { dMae: ci(0, 0.4) } }), 0.25).failed, ['G1']);
  assert.deepEqual(shortEligibility(ssum({ star: { dMae: ci(-1, 0.1) } }), 0.25).failed, ['G3']);
  assert.deepEqual(shortEligibility(ssum({ star: { dMae: ci(-0.5, 0) } }), 0.25).failed, ['G3'], 'upper bound exactly 0 fails (strict <)');
  assert.deepEqual(shortEligibility(ssum({ pooled: { dMse: ci(-1, 0.2) } }), 0.25).failed, ['G4']);
  assert.deepEqual(shortEligibility(ssum({ relevantByPosition: { ...cpos(ci(-0.3, 0.05)), QB: { dMae: ci(0.3, 0.9) } } }), 0.25).failed, ['G5']);
  assert.deepEqual(shortEligibility(ssum({ relevant: { bias: 1.6, c0Bias: 1.6 } }), 0.25), { eligible: true, failed: [] }, 'bias equal to C0\'s +1.6 is eligible');
  const nul = { mean: 0, ci95: null };
  const allNull = ssum({ relevant: { dMae: nul }, star: { dMae: nul }, pooled: { dMse: nul }, relevantByPosition: cpos(nul) });
  assert.deepEqual(shortEligibility(allNull, 0.25).failed, ['G1', 'G3', 'G4'], 'null ci fails G1, G3, G4 but not G5');
  assert.deepEqual(shortEligibility(ssum({ relevant: { dMae: ci(0, 0.4) }, star: { dMae: ci(-1, 0.1) } }), 0.25).failed, ['G1', 'G3'], 'failing ids in G order');
});

test('GCS-4 decideShort: SOf0 incumbent, SOK1f0 replaces only on a paired CI below 0, references never picked, N and S texts', () => {
  const recon0 = { mean: 0 };
  const only = decideShort({ summaries: ssums({ SOf0: {} }), paired: noPaired, delta: 0.25, recon: recon0 });
  assert.equal(only.outcome, 'W');
  assert.equal(only.pick, 'SOf0');
  assert.match(only.text, /^\(W\) wire SOf0 at δ = 0\.25 /);
  const both = ssums({ SOf0: {}, SOK1f0: {} });
  assert.equal(decideShort({ summaries: both, paired: () => [-0.03, 0.001], delta: 0.25, recon: recon0 }).pick, 'SOf0');
  assert.equal(decideShort({ summaries: both, paired: () => [-0.03, -0.001], delta: 0.25, recon: recon0 }).pick, 'SOK1f0');
  assert.equal(decideShort({ summaries: both, paired: noPaired, delta: 0.25, recon: recon0 }).pick, 'SOf0', 'null paired keeps the incumbent');
  assert.equal(decideShort({ summaries: ssums({ SOK1f0: {} }), paired: noPaired, delta: 0.25, recon: recon0 }).pick, 'SOK1f0');
  const c3 = decideShort({ summaries: ssums({ C3f0: { rStar: { mae: 1 } }, SOf0: { rStar: { mae: 6 } } }), paired: () => [-9, -8], delta: 0.25, recon: recon0 });
  assert.equal(c3.pick, 'SOf0', 'an eligible reference with the best R* MAE is never picked');
  const none = decideShort({ summaries: ssums({ C3f0: {} }), paired: noPaired, delta: 0.25, recon: recon0 });
  assert.equal(none.outcome, 'N');
  assert.equal(none.pick, null);
  assert.equal(none.eligibility.C3f0.eligible, true, 'still tabled');
  assert.match(none.text, /recommend closing L6 with no change/);
  const stop = decideShort({ summaries: both, paired: noPaired, delta: 0.25, recon: { mean: 0.2 }, tolerance: 0.05 });
  assert.equal(stop.outcome, 'S');
  assert.equal(stop.pick, null);
});

test('GCS-5 end to end: one write, three decisions, constants keys, qualifying rows unchanged, independent k check, real writer, parity break', () => {
  const logs = [], errs = [], writes = [];
  const code = gamesShortMain({
    load: syntheticLoad({ withCause: true }), defaults: smallDefaults, write: true,
    writeArtifacts: (a) => { writes.push(a); return { panelPath: 'p', constantsPath: 'c', verdictPath: 'v', panelBytes: 1 }; },
    log: (m) => logs.push(m), logErr: (m) => errs.push(m),
  });
  assert.equal(code, 0);
  assert.equal(writes.length, 1);
  const r = writes[0].result;
  assert.deepEqual(Object.keys(r.decisions).sort(), ['0.1', '0.25', '0.5']);
  assert.deepEqual(Object.keys(r.constants.candidates), ['C3f0', 'K1f0', 'SOf0', 'SOK1f0']);
  assert.equal(r.constants.candidates.SOf0.fitRows, 'non-qual');
  assert.equal(r.constants.candidates.C3f0.fitRows, 'all');
  assert.match(writes[0].verdictMd, /## 6\. Decision/);
  assert.match(writes[0].verdictMd, /## 7\. 2026 impact/);
  assert.match(writes[0].verdictMd, /## 8\. In-season override check/);
  assert.match(writes[0].verdictMd, /## 9\. Limits/);
  assert.ok(['override', 'preseason-only'].includes(r.inSeasonCheck.inSeasonRule));
  const qual = r.rows.filter((x) => x.sState === 'qual');
  assert.ok(qual.length > 0);
  assert.ok(qual.every((x) => x.p.SOf0 === x.p.C0 && x.p.SOK1f0 === x.p.C0), 'qualifying rows keep the app prediction');
  assert.ok(r.rows.some((x) => x.sState !== 'qual'), 'the fixture has non-qualifying out-of-sample rows');

  const c = buildCauseRows({ load: syntheticLoad({ withCause: true }), defaults: smallDefaults });
  const wr = c.rows.filter((x) => x.sState !== 'qual' && x.position === 'WR').map((x) => ({ avgGames: x.avgGames, outcome: x.outcome }));
  assert.ok(wr.length > 0);
  assert.equal(r.constants.candidates.SOf0.k.pos.WR, fitK(wr, 0, smallDefaults.kGrid));

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamesshort-e2e-'));
  let written = null;
  const ok = gamesShortMain({
    load: syntheticLoad({ withCause: true }), defaults: smallDefaults, write: true,
    writeArtifacts: (a) => (written = writeGamesShortArtifacts({ ...a, root })), log: () => {}, logErr: () => {},
  });
  assert.equal(ok, 0);
  const date = new Date().toISOString().slice(0, 10);
  assert.equal(written.panelPath, `backtests/${date}-games-short-panel.json`);
  assert.equal(written.constantsPath, `backtests/${date}-games-short-constants.json`);
  assert.equal(written.verdictPath, `grading/${date}-games-short-verdict.md`);
  for (const p of [written.panelPath, written.constantsPath, written.verdictPath]) assert.ok(fs.existsSync(path.join(root, p)), `${p} exists`);

  const bw = [], be = [];
  const bad = gamesShortMain({
    load: syntheticLoad({ withCause: true, breakParity: true }), defaults: smallDefaults, write: true,
    writeArtifacts: (a) => { bw.push(a); return {}; }, log: () => {}, logErr: (m) => be.push(m),
  });
  assert.equal(bad, 1);
  assert.equal(bw.length, 0);
  assert.match(be.join('\n'), /parity .* below 99%/);
});

test('GCS-6 CLI: --short alone, --cause with --short, and an unknown flag all exit 1 with the named message', () => {
  const alone = spawnSync(process.execPath, ['bin/backtest.mjs', '--short'], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(alone.status, 1);
  assert.match(alone.stderr, /--short requires --games-calibration/);
  const both = spawnSync(process.execPath, ['bin/backtest.mjs', '--games-calibration', '--cause', '--short'], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(both.status, 1);
  assert.match(both.stderr, /mutually exclusive/);
  const bogus = spawnSync(process.execPath, ['bin/backtest.mjs', '--games-calibration', '--short', '--bogus'], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(bogus.status, 1);
  assert.match(bogus.stderr, /rejects --bogus/);
  assert.match(bogus.stderr, /takes only --cause, --short, --json and --write/);
});

test('GCS-7 inSeasonCheck: hand-computed healthy / missed / not-played cells; override, flip to preseason-only, thin group ignored', () => {
  const ws = (...slots) => [...slots, ...Array(18 - slots.length).fill('X')];
  const P = (k) => Array(k).fill('P');
  const store = { 2021: {} };
  const rows = [];
  const add = (id, status, p, extra = {}) => { store[2021][id] = { weeklyStatus: status }; rows.push({ id, S: 2020, sState: 'short', star: false, p, ...extra }); };
  const healthyWs = ws(...P(10));                       // n = w, rem = 10 − w
  const missedWs = ws('P', 'D', 'P', 'P', 'P', 'P');    // w = 2: n 1, d 1, rem 4
  for (let i = 0; i < 30; i++) add(`h${i}`, healthyWs, { SOf0: 5, C0: 10 }, { star: i < 10 });
  for (let i = 0; i < 30; i++) add(`m${i}`, missedWs, { SOf0: 5, C0: 12 });
  add('np', ws('X', 'X', 'P', 'P', 'P', 'P'), { SOf0: 5, C0: 12 });   // w = 2: n 0, rem 4
  add('q', healthyWs, { SOf0: 9, C0: 9 }, { sState: 'qual' });          // qualifying rows are not scored
  rows.push({ id: 'ghost', S: 2020, sState: 'none', star: false, p: { SOf0: 5, C0: 10 } });   // no S+1 row
  const cps = [2, 3, 4, 5];
  const r = inSeasonCheck(rows, store, cps);
  assert.equal(r.noRow, 1);
  const h2 = r.groups.healthy[2];
  assert.equal(h2.n, 30);
  assert.equal(h2.meanRem, 8);
  assert.deepEqual(h2.cut, { mae: 5, bias: -5 });   // max(0, 5 − 2) − 8
  assert.deepEqual(h2.base, { mae: 0, bias: 0 });   // max(0, 10 − 2) − 8
  assert.equal(r.groups.healthyStar[2].n, 10);
  const m2 = r.groups.missed[2];
  assert.equal(m2.n, 30);
  assert.equal(m2.meanRem, 4);
  assert.deepEqual(m2.cut, { mae: 0, bias: 0 });    // max(0, 5 − 1) − 4
  assert.deepEqual(m2.base, { mae: 7, bias: 7 });   // max(0, 12 − 1) − 4
  assert.equal(r.groups.notPlayed[2].n, 1);
  assert.deepEqual(r.groups.notPlayed[2].cut, { mae: 1, bias: 1 });   // 5 − 4
  assert.equal(r.groups.healthy[5].n, 31, 'the not-played row has played 3 games by week 5 and joins healthy');
  assert.equal(r.inSeasonRule, 'override');

  // flip the missed group so the cut is worse than the base → preseason-only
  const flipped = rows.map((x) => (x.id.startsWith('m') ? { ...x, p: { SOf0: 12, C0: 5 } } : x));
  assert.equal(inSeasonCheck(flipped, store, cps).inSeasonRule, 'preseason-only');

  // a missed group with n < 30 is ignored: the same flip on 29 rows leaves 'override'
  const thin = rows.filter((x) => x.id !== 'm0').map((x) => (x.id.startsWith('m') ? { ...x, p: { SOf0: 12, C0: 5 } } : x));
  const t = inSeasonCheck(thin, store, cps);
  assert.equal(t.groups.missed[2].n, 29);
  assert.equal(t.inSeasonRule, 'override');

  // fewer than 4 evaluable healthy checkpoints → preseason-only
  assert.equal(inSeasonCheck(rows, store, [2, 3, 4]).inSeasonRule, 'preseason-only');
});
