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

import { projectedGamesFor } from '../lib/durabilityMirror.mjs';
import { forwardChainFolds } from '../lib/panel.mjs';
import { buildPanel, ABSENCE_DEFAULTS } from '../scripts/absence-run.mjs';
import {
  GAMES_CAL_DEFAULTS, CANDIDATE_IDS, accountWeeks, decompose, fitK, fitCandidate, kFor, foldTrainRows,
  decide, candidatePred,
} from '../lib/gamesCalibration.mjs';
import {
  panelEligibility, gamesCalibrationMain, writeGamesCalibrationArtifacts,
} from '../scripts/games-calibration-run.mjs';

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
    10: [['KC', 'CUT'], ['CHI', 'ACT']],                 // slot 9: traded; only CHI played → classified by CHI's ACT
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
function syntheticLoad({ breakParity = false } = {}) {
  const store = {};
  for (let y = 2016; y <= 2024; y++) {
    store[y] = { TEAM_KC: { team: 'KC', weeklyStatus: Array(17).fill('P') } };
    for (let i = 0; i < 60; i++) {
      const gp = 8 + ((i * 7 + y * 3) % 10);
      store[y][`P${i}`] = { team: 'KC', gamesPlayed: gp, gamesStarted: gp, fantasyPoints: gp * 10, dnpWeeks: 0,
        weeklyStatus: [...Array(gp).fill('P'), ...Array(17 - gp).fill('X')], stats: {} };
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
    loadRosterWeekly: (y) => (store[y] ? { players: {} } : null),
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
