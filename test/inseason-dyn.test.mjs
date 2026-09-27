/**
 * test/inseason-dyn.test.mjs — in-season evidence Phase 2c, dynasty-side
 * (.claude/tasks/in-season-evidence-2c-dynasty-backtest.md §10). Fixture loaders throughout; no
 * live-store read. The §2 byte-identity gate (test 1) is a hand-back item verified manually against a
 * pre-edit checkout, not reproducible as a unit test here — `test/inseason.test.mjs` staying green
 * covers the regression surface.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

import {
  decideOwnVsPooled, ladderPick, assertAligned, prospectPriorPPG, ageMultiplier, draftMultiplier,
  dynastyPickProxy, ageOnDate, historyPriorOf, modelScore, analyzeKCell, blend, pairedDelta,
} from '../lib/inSeasonEvidence.mjs';
import {
  runInSeasonDyn, inSeasonDynMain, INSEASON_DYN_LOAD,
} from '../scripts/inseason-dyn-run.mjs';
import { verifyConstants, formatConstantsJson, makePut, pinDecision, addFoldK, ReconciliationStop } from '../scripts/inseason-run.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

// ═══════════════════════════════════════════════════════════════════════════
// 2 — decideOwnVsPooled, both branches
// ═══════════════════════════════════════════════════════════════════════════

function cellFrom({ orderedRows, heldOutErr, folds }) {
  return {
    verdict: 'OK', rows: orderedRows.length, players: new Set(orderedRows.map(r => r.sleeperId)).size,
    orderedRows, heldOut: orderedRows.map((r, i) => ({ pred: r.actual + heldOutErr[i], actual: r.actual })),
    folds,
  };
}

function syntheticRows(n, seed = 1) {
  let s = seed;
  const rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const rows = [];
  for (let i = 0; i < n; i++) {
    const S = 2014 + (i % 4);
    rows.push({ sleeperId: `p${i % 20}`, S, W: 1, n: 1, prior: 10, obs: 12, actual: 11 + (rand() - 0.5) });
  }
  return rows;
}

describe('2: decideOwnVsPooled', () => {
  const spec = { prior: 'prior', obs: 'obs', outcome: 'actual' };
  const folds = [2014, 2015, 2016, 2017].map(S => ({ S, k: 3 }));

  test('own held-out errors uniformly smaller than pooled-k predictions → own, BEATS', () => {
    const rows = syntheticRows(80);
    const own = cellFrom({ orderedRows: rows, heldOutErr: rows.map(() => 0.05), folds });
    const pooled = cellFrom({ orderedRows: rows, heldOutErr: rows.map(() => 3), folds });
    own.delta = { label: 'BEATS' }; // decideOwnVsPooled must ignore this
    const { choice, vsPooled } = decideOwnVsPooled({ own, pooled, spec });
    assert.equal(choice, 'own');
    assert.equal(vsPooled.label, 'BEATS');
  });

  test('own errors equal pooled predictions plus deterministic zero-mean symmetric noise → pooled, not BEATS', () => {
    const rows = syntheticRows(80, 7);
    const pooledErr = (i) => (i % 2 === 0 ? 1 : -1);
    const noise = (i) => (Math.floor(i / 5) % 2 === 0 ? 0.4 : -0.4); // deterministic, alternates per cluster of 5
    const own = cellFrom({ orderedRows: rows, heldOutErr: rows.map((_, i) => pooledErr(i) + noise(i)), folds });
    const pooled = cellFrom({ orderedRows: rows, heldOutErr: rows.map((_, i) => pooledErr(i)), folds });
    const { choice, vsPooled } = decideOwnVsPooled({ own, pooled, spec });
    assert.equal(choice, 'pooled');
    assert.notEqual(vsPooled.label, 'BEATS');
  });

  test('pooled INSUFFICIENT → choice null', () => {
    const rows = syntheticRows(10);
    const own = cellFrom({ orderedRows: rows, heldOutErr: rows.map(() => 0), folds });
    const { choice, vsPooled } = decideOwnVsPooled({ own, pooled: { verdict: 'INSUFFICIENT' }, spec });
    assert.equal(choice, null);
    assert.equal(vsPooled, null);
  });

  test('own given delta.label BEATS still returns "own" when errors say so (the gate stays in the 2a caller)', () => {
    const rows = syntheticRows(80, 3);
    const own = cellFrom({ orderedRows: rows, heldOutErr: rows.map(() => 0.01), folds });
    own.delta = { label: 'BEATS' };
    const pooled = cellFrom({ orderedRows: rows, heldOutErr: rows.map(() => 5), folds });
    const { choice } = decideOwnVsPooled({ own, pooled, spec });
    assert.equal(choice, 'own');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3 — ladderPick
// ═══════════════════════════════════════════════════════════════════════════

describe('3: ladderPick', () => {
  const rows = syntheticRows(60, 11);

  function rung(id, err) { return { id, preds: rows.map((r, i) => ({ pred: r.actual + err(i), actual: r.actual })) }; }

  test('stays on rung 0 when rung 1 is NO-GAIN', () => {
    let s = 1; const rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    const rung0 = rung('r0', () => (rand() - 0.5) * 2);
    const rung1 = rung('r1', () => (rand() - 0.5) * 2);
    const out = ladderPick(rows, [rung0, rung1]);
    assert.equal(out.id, 'r0');
    assert.equal(out.steps.length, 1);
    assert.equal(out.steps[0].label, 'NO-GAIN');
  });

  test('climbs to rung 1 on BEATS', () => {
    const rung0 = rung('r0', () => 5);
    const rung1 = rung('r1', () => 0.01);
    const out = ladderPick(rows, [rung0, rung1]);
    assert.equal(out.id, 'r1');
    assert.equal(out.steps[0].label, 'BEATS');
  });

  test('reaches rung 2 only when rung 2 BEATS rung 1, even where rung 2 would BEAT rung 0 but not rung 1', () => {
    const rung0 = rung('r0', () => 5);
    const rung1 = rung('r1', () => 0.01);
    const rung2 = rung('r2', () => 0.5); // beats rung0 (5) but not rung1 (0.01)
    const out = ladderPick(rows, [rung0, rung1, rung2]);
    assert.equal(out.id, 'r1', 'ladder compares rung2 only against the current rung (r1), never against r0');
    assert.equal(out.steps.length, 2);
    assert.equal(out.steps[0].from, 'r0'); assert.equal(out.steps[0].to, 'r1');
    assert.equal(out.steps[1].from, 'r1'); assert.equal(out.steps[1].to, 'r2');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4 — prospectPriorPPG golden values
// ═══════════════════════════════════════════════════════════════════════════

describe('4: prospectPriorPPG golden values', () => {
  test('RB, age 21, {round:1,pick:2} → 18.72', () => {
    assert.equal(prospectPriorPPG({ position: 'RB', age: 21, pick: { round: 1, pick: 2 }, sm1: null }).priorPPG, 18.72);
  });
  test('WR, age 25, null → 5.0625', () => {
    assert.equal(prospectPriorPPG({ position: 'WR', age: 25, pick: null, sm1: null }).priorPPG, 5.0625);
  });
  test('TE, age null, {round:2,pick:20} → 6.3', () => {
    const v = prospectPriorPPG({ position: 'TE', age: null, pick: { round: 2, pick: 20 }, sm1: null }).priorPPG;
    assert.ok(Math.abs(v - 6.3) < 1e-9);
  });
  test('QB, age 22, {round:1,pick:13} → 16.17', () => {
    const v = prospectPriorPPG({ position: 'QB', age: 22, pick: { round: 1, pick: 13 }, sm1: null }).priorPPG;
    assert.ok(Math.abs(v - 16.17) < 1e-9);
  });
  test('round 4 → draftMultiplier 0.65', () => {
    assert.equal(draftMultiplier({ round: 4, pick: 40 }), 0.65);
  });
  test('blend: RB, age 23, {round:1,pick:10}, sm1 gp4/fp60 → prior 12.6, prospectPPG 13.4', () => {
    const { priorPPG, prospectPPG } = prospectPriorPPG({ position: 'RB', age: 23, pick: { round: 1, pick: 10 }, sm1: { gamesPlayed: 4, fantasyPoints: 60 } });
    assert.ok(Math.abs(priorPPG - 12.6) < 1e-9);
    assert.ok(Math.abs(prospectPPG - 13.4) < 1e-9);
  });
  test('gamesPlayed 16 caps evidence weight at 12', () => {
    const a = prospectPriorPPG({ position: 'RB', age: 23, pick: null, sm1: { gamesPlayed: 16, fantasyPoints: 16 * 20 } });
    const b = prospectPriorPPG({ position: 'RB', age: 23, pick: null, sm1: { gamesPlayed: 12, fantasyPoints: 12 * 20 } });
    assert.equal(a.prospectPPG, b.prospectPPG);
  });
  test('gamesPlayed 0, or non-finite fp → prior unchanged', () => {
    const a = prospectPriorPPG({ position: 'RB', age: 23, pick: null, sm1: { gamesPlayed: 0, fantasyPoints: 100 } });
    assert.equal(a.prospectPPG, a.priorPPG);
    const b = prospectPriorPPG({ position: 'RB', age: 23, pick: null, sm1: { gamesPlayed: 4, fantasyPoints: NaN } });
    assert.equal(b.prospectPPG, b.priorPPG);
  });
  test('ageMultiplier table', () => {
    assert.deepEqual([18, 21, 22, 23, 24, 30].map(ageMultiplier), [1.2, 1.2, 1.1, 1.0, 0.88, 0.75]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5 — dynastyPickProxy
// ═══════════════════════════════════════════════════════════════════════════

describe('5: dynastyPickProxy', () => {
  const entries = [];
  for (let i = 0; i < 70; i++) entries.push({ sleeperId: `s${i}`, draftOvr: i + 1, undrafted: false, position: 'WR' });
  for (let i = 0; i < 10; i++) entries.push({ sleeperId: `k${i}`, draftOvr: i + 1000, undrafted: false, position: 'K' });
  const proxy = dynastyPickProxy(entries, { teams: 12, rounds: 5 });

  test('rank 1 → {1,1}, 12 → {1,12}, 13 → {2,13}, 60 → {5,60}, 61 → null', () => {
    assert.deepEqual(proxy.get('s0'), { round: 1, pick: 1 });
    assert.deepEqual(proxy.get('s11'), { round: 1, pick: 12 });
    assert.deepEqual(proxy.get('s12'), { round: 2, pick: 13 });
    assert.deepEqual(proxy.get('s59'), { round: 5, pick: 60 });
    assert.equal(proxy.get('s60'), null);
  });

  test('non-skill entries consume no ranks', () => {
    for (let i = 0; i < 10; i++) assert.equal(proxy.get(`k${i}`), null);
  });

  test('undrafted → null', () => {
    const p2 = dynastyPickProxy([{ sleeperId: 'u1', draftOvr: 1, undrafted: true, position: 'WR' }], { teams: 12, rounds: 5 });
    assert.equal(p2.get('u1'), null);
  });

  test('a draftOvr tie resolves by sleeperId', () => {
    const p3 = dynastyPickProxy([
      { sleeperId: 'b', draftOvr: 5, undrafted: false, position: 'WR' },
      { sleeperId: 'a', draftOvr: 5, undrafted: false, position: 'WR' },
    ], { teams: 12, rounds: 5 });
    assert.deepEqual(p3.get('a'), { round: 1, pick: 1 });
    assert.deepEqual(p3.get('b'), { round: 1, pick: 2 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6 — ageOnDate
// ═══════════════════════════════════════════════════════════════════════════

describe('6: ageOnDate', () => {
  test('birthday one day after kickoff → not yet turned', () => {
    assert.equal(ageOnDate('2003-09-02', '2025-09-01'), 21);
  });
  test('birthday on kickoff → turned', () => {
    assert.equal(ageOnDate('2003-09-01', '2025-09-01'), 22);
  });
  test('null → null', () => {
    assert.equal(ageOnDate(null, '2025-09-01'), null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7 — historyPriorOf
// ═══════════════════════════════════════════════════════════════════════════

describe('7: historyPriorOf', () => {
  test('L skips S-1 and picks the latest gp>=8 season <= S-2', () => {
    // S-1 = 2019 qualifies too, but the search starts at S-2 = 2018 and must never consider S-1.
    const ppgBySeason = (y) => ({ 2019: { ppg: 20, gamesPlayed: 16 }, 2018: { ppg: 15, gamesPlayed: 10 } }[y] ?? { ppg: null, gamesPlayed: 0 });
    const h = historyPriorOf({ ppgBySeason, S: 2020, floor: 2012 });
    assert.equal(h.L, 2018);
    assert.equal(h.H, 15);
  });

  test('recency 0.7/0.3 with a prior qualifying season; single-season fallback when none', () => {
    const ppgBySeason = (y) => ({ 2018: { ppg: 20, gamesPlayed: 16 }, 2016: { ppg: 10, gamesPlayed: 12 } }[y] ?? { ppg: null, gamesPlayed: 0 });
    const h = historyPriorOf({ ppgBySeason, S: 2020, floor: 2012 });
    assert.equal(h.L, 2018);
    assert.ok(Math.abs(h.recency - (0.7 * 20 + 0.3 * 10)) < 1e-9);

    const ppgSingle = (y) => (y === 2018 ? { ppg: 20, gamesPlayed: 16 } : { ppg: null, gamesPlayed: 0 });
    const h2 = historyPriorOf({ ppgBySeason: ppgSingle, S: 2020, floor: 2012 });
    assert.equal(h2.recency, 20);
  });

  test('stale at L = S-3', () => {
    const ppgBySeason = (y) => (y === 2017 ? { ppg: 12, gamesPlayed: 9 } : { ppg: null, gamesPlayed: 0 });
    const h = historyPriorOf({ ppgBySeason, S: 2020, floor: 2012 });
    assert.equal(h.L, 2017);
    assert.equal(h.stale, true);
  });

  test('L null when there is no qualifying season', () => {
    const h = historyPriorOf({ ppgBySeason: () => ({ ppg: null, gamesPlayed: 0 }), S: 2020, floor: 2012 });
    assert.equal(h.L, null);
    assert.equal(h.stale, false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8 — modelScore
// ═══════════════════════════════════════════════════════════════════════════

describe('8: modelScore', () => {
  test('clamps at the peak', () => {
    assert.equal(modelScore(20, 10), 100);
  });
  test('max(peak, 1)', () => {
    assert.equal(modelScore(0.5, 0), 50);
  });
  test('linear below the peak', () => {
    assert.equal(modelScore(5, 10), 50);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9 — population routing (fixture assemble substitute)
// ═══════════════════════════════════════════════════════════════════════════

function totalsRec({ team = 'KC', gamesPlayed, stats = {}, fantasyPoints = 0, weeklyPoints = {} }) {
  return { team, gamesPlayed, stats, fantasyPoints, weeklyPoints };
}

function dynLoadFixture({ mismatched = 0 } = {}) {
  const totals2020 = {}, gl2020 = {};
  for (let i = 0; i < 5; i++) {
    const pid = `p${i}`;
    const off = i < mismatched ? 25 : 0;
    totals2020[pid] = totalsRec({
      gamesPlayed: 10, fantasyPoints: 100,
      stats: { rec_tgt: 80, rush_att: 0 },
      weeklyPoints: Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(w => [w, 10])),
    });
    gl2020[pid] = { games: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(w => ({ seasonType: 'REG', week: w, team: 'KC', targets: 8 + off, carries: 0 })) };
  }
  const totals2021 = { p0: totalsRec({ gamesPlayed: 10, fantasyPoints: 120 }) };
  const ids = {};
  const bySleeper = {};
  for (let i = 0; i < 5; i++) {
    ids[`gsis-p${i}`] = { sleeperId: `p${i}`, name: `Player ${i}`, position: 'WR' };
    bySleeper[`p${i}`] = { draftYear: 2020, draftRound: null, draftPick: null, draftOvr: null, undrafted: true, birthdate: '1998-01-01' };
  }
  return {
    loadSeasonTotals: (y) => (y === 2020 ? totals2020 : y === 2021 ? totals2021 : null),
    loadGameLogs: (y) => (y === 2020 ? { players: gl2020, unmapped: 0 } : null),
    loadAdvstats: () => null,
    loadRoster: () => null,
    loadPlayerIds: () => ({ ids, bySleeper }),
    loadDepth: () => null,
    loadSchedule: () => null,
    loadSnapShare: () => null,
    loadManifest: () => ({ files: {} }),
    loadInSeasonConstants: () => null,
  };
}

describe('9: population routing (injectable assemble)', () => {
  function row({ sleeperId, S, arm, pointsPrior = 10, obsPPG = 10, nextPPG = 10, extra = {} }) {
    return { sleeperId, S, W: 4, n: 4, position: 'WR', arm, obsPPG, nextPPG, pointsPrior, ...extra };
  }

  function fakeAssemble(rowsBySeason) {
    return (S) => ({ rows: rowsBySeason[S] ?? [] });
  }

  test('a YE<=1 row in a non-rookie arm is counted as routeMismatch and dropped', () => {
    const load = dynLoadFixture();
    const rowsBySeason = { 2020: [row({ sleeperId: 'p0', S: 2020, arm: 'P' })] };
    const result = runInSeasonDyn({ load, assemble: fakeAssemble(rowsBySeason) });
    assert.equal(result.coverage.routeMismatchRows, 1);
    assert.equal(result.coverage.q1Rows, 0);
  });

  test('an X-short row with L = S-3 is stale, not primary', () => {
    const load = dynLoadFixture();
    // Give p0 a qualifying season at S-3 = 2017 (gp >= 8) and nothing more recent, so historyPriorOf
    // resolves L = 2017 (stale), not a Q2-primary row (which requires L === S-2 = 2018).
    const baseLoadSeasonTotals = load.loadSeasonTotals;
    load.loadSeasonTotals = (y) => (y === 2017 ? { p0: totalsRec({ gamesPlayed: 12, fantasyPoints: 150 }) } : baseLoadSeasonTotals(y));
    const rowsBySeason = { 2020: [row({ sleeperId: 'p0', S: 2020, arm: 'X-short' })] };
    const result = runInSeasonDyn({ load, assemble: fakeAssemble(rowsBySeason) });
    assert.equal(result.coverage.q2PrimaryRows, 0, 'L=2017=S-3 is stale, not primary (primary requires L=S-2)');
    assert.equal(result.excluded.q2.stale.rows, 1);
    assert.equal(result.excluded.q2.stale.playerSeasons, 1);
  });

  test('a fixture row carrying gamelogs-derived fields comes out without them (D10), via the onRows test seam', () => {
    const load = dynLoadFixture();
    const rowsBySeason = {
      2020: [row({ sleeperId: 'p0', S: 2020, arm: 'X-rookie0', extra: { obsOpp: 5, obsShare: 0.4, O: 20, mover: true, missedInWindow: false, oppMissingWeeks: 0 } })],
    };
    let seenRows = null;
    runInSeasonDyn({ load, assemble: fakeAssemble(rowsBySeason), onRows: (rows) => { seenRows = rows; } });
    assert.ok(Array.isArray(seenRows) && seenRows.length > 0);
    const D10_KEYS = ['obsOpp', 'obsShare', 'O', 'mover', 'missedInWindow', 'oppMissingWeeks'];
    for (const r of seenRows) {
      for (const key of D10_KEYS) assert.ok(!(key in r), `${key} leaked onto an analysis row`);
    }
  });

  test('YE is computed from draftYear; draftYear 0/null is excluded and counted; a YE1 row gets pick:null in prospectPrior but its own proxy in prospectPriorYE1Pick', () => {
    const load = dynLoadFixture();
    // p0: draftYear 2019, S=2020 -> YE1. p1: draftYear null -> excluded (ye null). p2: draftYear 0 -> excluded.
    const baseIds = load.loadPlayerIds();
    load.loadPlayerIds = () => ({
      ids: baseIds.ids,
      bySleeper: {
        ...baseIds.bySleeper,
        p0: { draftYear: 2019, draftRound: null, draftPick: null, draftOvr: 5, undrafted: false, birthdate: '1998-01-01' },
        p1: { draftYear: null, draftRound: null, draftPick: null, draftOvr: null, undrafted: true, birthdate: '1998-01-01' },
        p2: { draftYear: 0, draftRound: null, draftPick: null, draftOvr: null, undrafted: true, birthdate: '1998-01-01' },
      },
    });
    const rowsBySeason = {
      2020: [
        row({ sleeperId: 'p0', S: 2020, arm: 'X-rookie1p' }),
        row({ sleeperId: 'p1', S: 2020, arm: 'X-rookie0' }),
        row({ sleeperId: 'p2', S: 2020, arm: 'X-rookie0' }),
      ],
    };
    let seenRows = null;
    const result = runInSeasonDyn({ load, assemble: fakeAssemble(rowsBySeason), onRows: (rows) => { seenRows = rows; } });
    const p0 = seenRows.find(r => r.sleeperId === 'p0');
    const p1 = seenRows.find(r => r.sleeperId === 'p1');
    const p2 = seenRows.find(r => r.sleeperId === 'p2');
    assert.equal(p0.ye, 1);
    assert.equal(p1.ye, null);
    assert.equal(p2.ye, null);
    assert.equal(result.excluded.q1.draftYearUnusable.rows, 2);
    // p0 is YE1: prospectPrior used pick:null (D5); prospectPriorYE1Pick used p0's own class proxy (draftOvr 5 -> round 1).
    assert.equal(p0.prospectPrior, prospectPriorPPG({ position: p0.position, age: p0.age, pick: null, sm1: p0.sm1 }).prospectPPG);
    assert.equal(p0.prospectPriorYE1Pick, prospectPriorPPG({ position: p0.position, age: p0.age, pick: { round: 1, pick: 1 }, sm1: p0.sm1 }).prospectPPG);
  });

  test('an X-short fixture row with no qualifying season throws (noL drift guard)', () => {
    // historyPriorOf legitimately returns L=null here (no S-1..S-3 qualifying season in the fixture),
    // which is exactly the drift condition §4.3 requires runInSeasonDyn to throw on.
    const load = dynLoadFixture();
    const rowsBySeason = { 2020: [row({ sleeperId: 'p0', S: 2020, arm: 'X-short' })] };
    assert.throws(() => runInSeasonDyn({ load, assemble: fakeAssemble(rowsBySeason) }), /noL drift/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10 — assertAligned
// ═══════════════════════════════════════════════════════════════════════════

describe('10: assertAligned', () => {
  test('throws on length mismatch', () => {
    assert.throws(() => assertAligned([{ sleeperId: 'a', S: 1, W: 1 }], []), /length mismatch/);
  });
  test('throws on a sleeperId/S/W mismatch', () => {
    assert.throws(() => assertAligned(
      [{ sleeperId: 'a', S: 1, W: 1 }],
      [{ sleeperId: 'b', S: 1, W: 1 }],
    ), /mismatch at index/);
  });
  test('passes when aligned', () => {
    assert.doesNotThrow(() => assertAligned(
      [{ sleeperId: 'a', S: 1, W: 1 }],
      [{ sleeperId: 'a', S: 1, W: 1 }],
    ));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 11 — constants file
// ═══════════════════════════════════════════════════════════════════════════

function syntheticCell(seed, { trueK = 3, seasons = [2014, 2015, 2016, 2017], perSeason = 90 } = {}) {
  let s = seed;
  const rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const rows = [];
  for (const S of seasons) {
    for (let i = 0; i < perSeason; i++) {
      const n = 1 + Math.floor(rand() * 8);
      const prior = 8 + rand() * 6, truth = prior + (rand() - 0.5) * 6;
      const obs = truth + (rand() - 0.5) * 8;
      const w = n / (n + trueK);
      const outcome = prior + w * (obs - prior) + (rand() - 0.5) * 2;
      rows.push({ sleeperId: `p${(i * 3 + S) % 89}`, S, W: n, n, prior, obs, outcome });
    }
  }
  return analyzeKCell(rows, { prior: 'prior', obs: 'obs', outcome: 'outcome' }, { bootstrap: { resamples: 50, seed: 12345 } });
}

describe('11: constants file', () => {
  test('verifyConstants passes on a synthetic dyn-shaped file; a tampered foldK is caught; reuse entries are ignored', () => {
    const P = makePut();
    const qb = syntheticCell(1);
    P.put('K_DYN_PROSPECT_YE0', 'QB', pinDecision(qb, null), qb, 'synthetic|QB');
    addFoldK({ constants: P.constants, fixture: P.fixture });
    const file = { source: 'test', generatedAt: '2026-01-01T00:00:00.000Z', basis: 'half_ppr', constants: P.constants, fixture: P.fixture, reuse: { 'K_DYN_PROSPECT_B_YE1|RB': { reuses: ['K_DYN_POINTS_ROOKIE1P'], k: [3.5], source: 'x' } } };
    assert.deepEqual(verifyConstants(file), []);

    const bad = JSON.parse(JSON.stringify(file));
    const seasons = Object.keys(bad.constants.K_DYN_PROSPECT_YE0.QB.foldK);
    bad.constants.K_DYN_PROSPECT_YE0.QB.foldK[seasons[0]] += 0.5;
    assert.equal(verifyConstants(bad).length, 1);
  });

  test('runInSeasonDyn throws when a reuse would name a constant/position absent from the loaded 2a file', () => {
    // A population where the projection prior is EXACT (projPrior === nextPPG) makes the fixed (k2a) rung's
    // prediction — blend(prior, obs, n, null) === prior, per `blend`'s k===null branch — a zero-error
    // prediction, which necessarily BEATS any finite-k fitted rung. That deterministically drives the Q1
    // arm-B ladder to the 'fixed' rung, which is exactly where a missing k2a must surface as a throw rather
    // than a silently-null reuse entry.
    const load = dynLoadFixture();
    load.loadInSeasonConstants = () => ({ constants: {} }); // missing K_DYN_POINTS_ROOKIE0
    const bySleeper = {};
    const rowsBySeason = {};
    const seasons = [2014, 2015, 2016, 2017, 2018];
    let idx = 0;
    for (const S of seasons) {
      rowsBySeason[S] = [];
      for (let i = 0; i < 14; i++) {
        const pid = `q${idx++}`;
        bySleeper[pid] = { draftYear: S, draftRound: null, draftPick: null, draftOvr: null, undrafted: true, birthdate: '1998-01-01' };
        const nextPPG = 8 + (i % 5);
        for (const W of [2, 4, 6, 8, 10]) {
          rowsBySeason[S].push({
            sleeperId: pid, S, W, n: W, position: 'WR', arm: 'X-rookie0',
            obsPPG: nextPPG + ((i % 3) - 1) * 2, nextPPG, pointsPrior: nextPPG,
          });
        }
      }
    }
    const baseIds = load.loadPlayerIds().ids;
    load.loadPlayerIds = () => ({ ids: baseIds, bySleeper });
    assert.throws(
      () => runInSeasonDyn({ load, assemble: (S) => ({ rows: rowsBySeason[S] ?? [] }) }),
      /is absent from the loaded/,
    );
  });

  function q2HistFixture({ kHist, kShort, missingHistory = false }) {
    const load = dynLoadFixture();
    load.loadInSeasonConstants = () => (missingHistory
      ? { constants: { K_DYN_POINTS_SHORT: { WR: { k: kShort } } } } // K_DYN_POINTS_HISTORY absent
      : { constants: { K_DYN_POINTS_HISTORY: { WR: { k: kHist } }, K_DYN_POINTS_SHORT: { WR: { k: kShort } } } });
    const bySleeper = {};
    const totalsByYear = {};
    const rowsBySeason = {};
    const seasons = [2016, 2017, 2018, 2019, 2020];
    let idx = 0;
    for (const S of seasons) {
      rowsBySeason[S] = [];
      const L = S - 2;
      totalsByYear[L] = totalsByYear[L] ?? {};
      for (let i = 0; i < 14; i++) {
        const pid = `h${idx++}`;
        bySleeper[pid] = { draftYear: null, draftRound: null, draftPick: null, draftOvr: null, undrafted: true, birthdate: '1998-01-01' };
        const H = 8 + (i % 5);
        totalsByYear[L][pid] = { team: 'KC', gamesPlayed: 10, stats: {}, fantasyPoints: H * 10, weeklyPoints: {} };
        for (const W of [2, 4, 6, 8, 10]) {
          const obsPPG = H + ((i % 3) - 1) * 2;
          // The fixed rung's prediction — blend(H, obsPPG, W, kFixed) — is made to equal nextPPG exactly,
          // so the ladder deterministically ends on 'fixed' regardless of the fitted rungs' noise.
          const kFixed = missingHistory ? null : kHist;
          const nextPPG = blend(H, obsPPG, W, kFixed);
          rowsBySeason[S].push({ sleeperId: pid, S, W, n: W, position: 'WR', arm: 'X-short', obsPPG, nextPPG, pointsPrior: H + 1 });
        }
      }
    }
    const baseLoadSeasonTotals = load.loadSeasonTotals;
    load.loadSeasonTotals = (y) => totalsByYear[y] ?? baseLoadSeasonTotals(y);
    const baseIds = load.loadPlayerIds().ids;
    load.loadPlayerIds = () => ({ ids: baseIds, bySleeper });
    return { load, assemble: (S) => ({ rows: rowsBySeason[S] ?? [] }) };
  }

  test('Q2 ladder ending on the fixed rung records a reuse entry equal to K_DYN_POINTS_HISTORY (reuses = ["K_DYN_POINTS_HISTORY"])', () => {
    const { load, assemble } = q2HistFixture({ kHist: 5.5, kShort: 2 });
    const result = runInSeasonDyn({ load, assemble });
    const entry = result.constants.reuse['K_DYN_POINTS_SHORT_HISTORY|WR'];
    assert.ok(entry, 'expected a reuse entry for K_DYN_POINTS_SHORT_HISTORY|WR');
    assert.deepEqual(entry.reuses, ['K_DYN_POINTS_HISTORY']);
    assert.deepEqual(entry.k, [5.5]);
  });

  test('runInSeasonDyn throws when K_DYN_POINTS_HISTORY alone is absent from the loaded 2a file (Q2)', () => {
    const { load, assemble } = q2HistFixture({ kHist: 5.5, kShort: 2, missingHistory: true });
    assert.throws(() => runInSeasonDyn({ load, assemble }), /is absent from the loaded/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 12 — CLI
// ═══════════════════════════════════════════════════════════════════════════

describe('12: CLI', () => {
  test('inSeasonDynMain with a small fixture returns 0 and calls writeArtifacts only when write:true', () => {
    const load = dynLoadFixture();
    let calls = 0;
    const code0 = inSeasonDynMain({ load, write: false, writeArtifacts: () => { calls++; return {}; }, log: () => {}, logErr: () => {} });
    assert.equal(code0, 0);
    assert.equal(calls, 0);
    const code1 = inSeasonDynMain({ load, write: true, writeArtifacts: () => { calls++; return { panelPath: 'x', panelBytes: 1, constantsPath: 'y', constantsBytes: 1, verdictPath: 'z' }; }, log: () => {}, logErr: () => {} });
    assert.equal(code1, 0);
    assert.equal(calls, 1);
  });

  test('a fixture that trips the reconciliation stop, run with write:true, returns 1 and never calls the spy', () => {
    const load = dynLoadFixture({ mismatched: 5 });
    let calls = 0;
    const code = inSeasonDynMain({ load, write: true, writeArtifacts: () => { calls++; return {}; }, log: () => {}, logErr: () => {} });
    assert.equal(code, 1);
    assert.equal(calls, 0);
  });

  test('bin/backtest.mjs --dynasty without --inseason exits non-zero before loading anything', () => {
    const r = spawnSync('node', ['bin/backtest.mjs', '--dynasty'], { cwd: REPO_ROOT, encoding: 'utf8' });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /--dynasty requires --inseason/);
  });

  test('bin/backtest.mjs --inseason --dynasty rejects other flags', () => {
    const r = spawnSync('node', ['bin/backtest.mjs', '--inseason', '--dynasty', '--from', '2015'], { cwd: REPO_ROOT, encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /--inseason rejects --from/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 13 — static: no assembleRookiePanel reference
// ═══════════════════════════════════════════════════════════════════════════

describe('13: scripts/inseason-dyn-run.mjs source', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'scripts/inseason-dyn-run.mjs'), 'utf8');
  test('does not reference assembleRookiePanel (T-RM1 stays green)', () => {
    assert.ok(!/assembleRookiePanel/.test(src));
  });
});
