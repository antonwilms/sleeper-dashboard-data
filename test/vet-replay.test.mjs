/**
 * test/vet-replay.test.mjs — lib/vetReplay.mjs: composition, gates G1–G3/G5/G6, G-MECH, M10 window, Q, replay R.
 * (plan january-grading-run-a §11)
 *
 * Invariant 10: reads only test/fixtures/season-grade/ (trimmed copies of committed captures + a fixture birthdate map) and
 * completed-season files (nfl/season-totals/2025 and earlier, the committed qb-takeover constants). Never ktc/, a
 * current-season file, nflverse/playerids.json or the newest capture.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ENVELOPE_KEYS, COHORT_KEYS, composeBlended, recompose, vetEntries, chartPositions, teamTables, ageAt, buildAgeTable,
  gIdentity, gDepth, gTables, gQbChain, gAgeTable, gMechPair, selectSpan, qDrift, replayR, makePriorOf,
  makeRecentStarterOf, capturedQbRooms, round1, isChainFactors,
} from '../lib/vetReplay.mjs';
import { materializeRows, cellStats, bootCI, metricOf } from '../lib/seasonGrade.mjs';
import { reconstructDepthFactor, pinnedQbChainModels } from '../lib/projectionFactors.mjs';
import { buildPositionMap } from '../scripts/grade-snapshot.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const readJson = (rel) => {
  const abs = path.join(ROOT, rel);
  assert.ok(fs.existsSync(abs), `fixture present: ${rel}`);
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
};
const fx = (name) => readJson(`test/fixtures/season-grade/${name}`);

const K = fx('snap-2026-09-09.json');
const S13 = fx('snap-2026-10-13.json');
const S14 = fx('snap-2026-10-14.json');
const S22 = fx('snap-2026-10-22.json');
const { birthdates, draftYear } = fx('birthdates.json');
const birthdateOf = (id) => birthdates[id] ?? null;
const drafted2026Of = (id) => (id in draftYear ? draftYear[id] === 2026 : null);

const totalsCache = new Map();
const totalsOf = (y) => {
  if (!totalsCache.has(y)) totalsCache.set(y, readJson(`nfl/season-totals/${y}.json`));
  return totalsCache.get(y);
};
const recentStarterOf = makeRecentStarterOf(totalsOf);
const qbModels = pinnedQbChainModels(readJson('backtests/2026-10-03-qb-takeover-constants.json'));
const priorOfFor = (snap) => makePriorOf(totalsOf(2025), snap.scoringSettings);

const posOfMap = (snap) => { const m = chartPositions(snap); return (id) => m.get(id) ?? null; };

// ─── Synthetic builders ───────────────────────────────────────────────────────

function factors(over = {}) {
  const f = {
    basePPG: 10, ageDelta: 1, shareTrend: 1, regressionFactor: 1, teamFactor: 1, depthFactor: 1,
    qbQualityFactor: 1, momentumFactor: 1, breakoutFactor: 1, bounceBackFactor: 1, tdRelianceFactor: 1, trajectoryFactor: 1,
    efficiencyFactor: 1, snapShareFactor: 1, rzUsageFactor: 1, teamRzShareFactor: 1,
    combinedNewFactorRaw: 1, compPPG: null, compBlendWeight: 0, qbTakeoverBasis: 'none', qbQualityScore: null,
  };
  return { ...f, ...over };
}
function synth(capturedAt, rows) {
  const players = {};
  const charts = {};
  for (const r of rows) {
    players[r.id] = {
      nfl_team: r.team ?? 'AAA', depthChartOrder: r.order ?? 1,
      projection: { projectedPPG: r.ppg, projectedGames: r.games ?? 10, projectedTotalPts: r.total ?? round1(r.ppg * (r.games ?? 10)), confidence: r.conf ?? 'high', factors: r.f ?? factors() },
    };
    const t = (charts[r.team ?? 'AAA'] ??= { QB: [], RB: [], WR: [], TE: [] });
    t[r.pos ?? 'RB'].push({ playerId: r.id, depthOrder: r.order ?? 1 });
  }
  return { capturedAt, targetSeason: 2026, currentSeason: 2025, players, teamDepthCharts: charts };
}

// ─── Composition ──────────────────────────────────────────────────────────────

describe('composeBlended / recompose', () => {
  test('product of ten factors, envelope clamp, 0..40 clamp, comp blend', () => {
    assert.equal(composeBlended(factors()), 10);
    assert.equal(composeBlended(factors({ breakoutFactor: 2 })), 10 * 1.5, 'raw 2 clamps to 1.50');
    assert.equal(composeBlended(factors({ basePPG: 100 })), 40, 'pipeline clamps to 40');
    assert.equal(composeBlended(factors({ compPPG: 20, compBlendWeight: 0.25 })), 0.75 * 10 + 0.25 * 20);
    assert.equal(ENVELOPE_KEYS.length, 10);
  });

  test('substitution identity: S’s own inputs → S’s value, on every non-chain fixture veteran row', () => {
    let n = 0;
    for (const e of vetEntries(S22)) {
      if (isChainFactors(e.f)) continue;
      const sub = {};
      for (const k of [...ENVELOPE_KEYS, 'teamFactor', 'depthFactor', 'ageDelta', 'shareTrend']) sub[k] = e.f[k];
      const r = recompose({ proj: e.proj, f: e.f }, sub);
      assert.equal(r.p, e.proj.projectedPPG, e.id);
      assert.equal(r.G, e.proj.projectedGames);
      assert.ok(Math.abs(r.T - e.proj.projectedTotalPts) <= 0.05 * e.proj.projectedGames + 0.1, `${e.id} T`);
      n++;
    }
    assert.ok(n > 100);
  });

  test('delta form: p′ = p_S + B(f′) − B(f_S); envelope clamp binds on raw′', () => {
    const f = factors({ basePPG: 10, combinedNewFactorRaw: 1.4, breakoutFactor: 1.4 });
    const S = { proj: { projectedPPG: 14, projectedGames: 10, projectedTotalPts: 140 }, f };
    // free: raw′ = 1.4 · (1.1/1.4) = 1.1 → B = 11 → p′ = 14 + 11 − 14 = 11
    assert.ok(Math.abs(recompose(S, { breakoutFactor: 1.1 }).p - 11) < 1e-12);
    // binding: raw′ = 1.4 · (1.4/... ) a substituted qbQuality of 1.2 on top → 1.4·1.2 = 1.68 → clamp 1.50 → B = 15 → p′ = 15
    const r = recompose(S, { qbQualityFactor: 1.2 });
    assert.ok(Math.abs(r.p - 15) < 1e-12, `clamped, got ${r.p}`);
  });

  test('a chain row: p′ = blended′·share, T′ = round1(blended′·share·17); base is qbStarterPPG_S', () => {
    const f = factors({ qbTakeoverBasis: 'chain', qbStarterPPG: 12, qbStartShare: 0.4, teamFactor: 1.0 });
    const S = { proj: { projectedPPG: 4.8, projectedGames: 17, projectedTotalPts: 81.6 }, f };
    const r = recompose(S, { teamFactor: 1.1 }, { share: 0.5, games: 17 });
    const blended = 12 + (10 * 1.1 - 10);                       // B(f′) − B(f_S) = 1
    assert.ok(Math.abs(r.blended - blended) < 1e-12);
    assert.ok(Math.abs(r.p - blended * 0.5) < 1e-12);
    assert.equal(r.T, round1(blended * 0.5 * 17));
    assert.equal(r.chain, true);
    // chain in S, incumbent in R: no share → p′ = blended′, T′ = round1(p′·G)
    const inc = recompose(S, { teamFactor: 1.1 });
    assert.equal(inc.chain, false);
    assert.ok(Math.abs(inc.p - blended) < 1e-12);
  });
});

// ─── reconstructDepthFactor qbRole ────────────────────────────────────────────

test("reconstructDepthFactor: qbRole 'backup' → 1.00 on a non-stale order-1 QB; the default call is byte-identical", () => {
  const qb = { position: 'QB', model: 'qb-takeover' };
  assert.equal(reconstructDepthFactor(1, false, { ...qb, qbRole: 'backup' }), 1.0);
  assert.equal(reconstructDepthFactor(1, false, qb), 1.05);
  // explicit expected values under qb-takeover with qbRole: null (not a null-vs-omitted comparison)
  const qbNull = { ...qb, qbRole: null };
  assert.deepEqual([1, 2, 3, null].map(o => reconstructDepthFactor(o, false, qbNull)), [1.05, 1.00, 1.00, 1.00]);
  assert.deepEqual([2, 3, null].map(o => reconstructDepthFactor(o, true, qbNull)), [1.00, 1.00, 1.00], 'stale → 1.00');
  assert.equal(reconstructDepthFactor(1, true, qbNull), 1.05, 'order 1 is never demoted by staleness');
  // non-QB: orders 1/2/3
  const rb = { position: 'RB', model: 'qb-takeover', qbRole: null };
  assert.deepEqual([1, 2, 3].map(o => reconstructDepthFactor(o, false, rb)), [1.05, 0.88, 0.68]);
});

// ─── G1 / G2 / G3 on the trimmed captures ─────────────────────────────────────

describe('G1 identity, G2 depth, G3 tables on trimmed captures', () => {
  for (const [name, snap] of [['10-13', S13], ['10-14', S14], ['10-22', S22]]) {
    test(`${name}: G1/G2/G3 pass`, () => {
      const pos = posOfMap(snap);
      const g1 = gIdentity(snap);
      assert.ok(g1.rows > 100 && g1.pass, `G1 max ${g1.max}`);
      assert.ok(g1.max <= 0.15);
      const rooms = gQbChain(snap, { priorOf: priorOfFor(snap), models: qbModels });
      const g2 = gDepth(snap, { positionOf: pos, recentStarterOf, qbRoleOf: (id) => rooms.roles[id]?.role ?? null });
      assert.ok(g2.pass, JSON.stringify(g2.sample));
      const g3 = gTables(snap, pos);
      assert.ok(g3.pass && g3.teams > 20, JSON.stringify(g3.sample));
    });
  }

  test('a deliberate rookie-row pollution of the team table fails G3', () => {
    const pos = posOfMap(S14);
    const rookies = vetEntries(S14, { veteransOnly: false }).filter(e => e.proj.confidence === 'rookie');
    assert.ok(rookies.length >= 4);
    const clean = vetEntries(S14);
    const polluted = [...rookies, ...clean];
    assert.equal(gTables(S14, pos, { entries: clean }).pass, true);
    const g3 = gTables(S14, pos, { entries: polluted });
    assert.equal(g3.pass, false);
    assert.ok(g3.violations > 0);
  });
});

// ─── G-MECH ───────────────────────────────────────────────────────────────────

describe('G-MECH', () => {
  test('trimmed 10-13→10-14: 0 rows beyond rounding, ratios ≤ 0.003, equal to values computed independently here', () => {
    const r = gMechPair(S13, S14);
    assert.ok(r.rows > 100);
    assert.equal(r.beyond, 0);
    assert.equal(r.gMismatch, 0);
    assert.ok(r.pass);
    assert.ok(r.worstPpg <= 0.003 && r.worstTot <= 0.003);

    // independent recomputation of the position ratios (product-of-ten blend, no use of recompose/mechSub)
    const pos = posOfMap(S13);
    const tf = new Map(), qq = new Map();
    for (const e of vetEntries(S13)) { tf.set(e.p.nfl_team ?? '', e.f.teamFactor); if (pos(e.id) !== 'QB') qq.set(e.p.nfl_team ?? '', e.f.qbQualityFactor); }
    const eA = new Map(vetEntries(S13).map(e => [e.id, e]));
    const sums = {};
    let rows = 0;
    for (const b of vetEntries(S14)) {
      const a = eA.get(b.id);
      if (!a || isChainFactors(a.f) || isChainFactors(b.f)) continue;
      rows++;
      const f = { ...b.f };
      f.teamFactor = tf.get(a.p.nfl_team ?? ''); f.depthFactor = a.f.depthFactor; f.breakoutFactor = a.f.breakoutFactor;
      f.qbQualityFactor = pos(b.id) === 'QB' ? b.f.qbQualityFactor : qq.get(a.p.nfl_team ?? '');
      for (const k of COHORT_KEYS) f[k] = a.f[k];
      f.ageDelta = a.f.ageDelta; f.compPPG = a.f.compPPG; f.compBlendWeight = a.f.compBlendWeight;
      let rawS = b.f.combinedNewFactorRaw;
      for (const k of ENVELOPE_KEYS) if (f[k] !== b.f[k]) rawS *= f[k] / b.f[k];
      const bOwn = composeBlended(b.f, { raw: b.f.combinedNewFactorRaw });
      const pR = b.proj.projectedPPG + composeBlended(f, { raw: rawS }) - bOwn;
      const TR = round1(pR * b.proj.projectedGames);
      const p = pos(b.id);
      if (!p) continue;
      const s = (sums[p] ??= { pR: 0, pA: 0, TR: 0, TA: 0 });
      s.pR += pR; s.pA += a.proj.projectedPPG; s.TR += TR; s.TA += a.proj.projectedTotalPts;
    }
    assert.equal(rows, r.rows);
    let worstP = 0, worstT = 0;
    for (const s of Object.values(sums)) { worstP = Math.max(worstP, Math.abs(s.pR / s.pA - 1)); worstT = Math.max(worstT, Math.abs(s.TR / s.TA - 1)); }
    assert.ok(Math.abs(worstP - r.worstPpg) < 1e-12 && Math.abs(worstT - r.worstTot) < 1e-12);
  });

  test('the row rule: one display step passes, two fail; the total bound is 0.1·G + 0.1', () => {
    const mk = (ppgA, totalA) => {
      const A = synth('2026-10-01T00:00:00Z', [{ id: 'x', ppg: ppgA, games: 10, total: totalA, f: factors() }]);
      const B = synth('2026-10-02T00:00:00Z', [{ id: 'x', ppg: 10, games: 10, total: 100, f: factors() }]);
      return gMechPair(A, B);
    };
    // replayed p_R = 10.0, T_R = 100.0
    assert.equal(mk(10.0, 100.0).beyond, 0, 'exact');
    assert.equal(mk(10.1, 101.0).beyond, 0, 'one PPG step, total inside 0.1·10 + 0.1 = 1.1');
    assert.equal(mk(10.1, 101.1).beyond, 0, 'total exactly at the bound passes');
    assert.equal(mk(10.1, 101.2).beyond, 1, 'total just past the bound fails');
    assert.equal(mk(10.2, 102.0).beyond, 1, 'two PPG steps fail');
    assert.equal(mk(10.2, 102.0).maxSteps, 2);
    assert.equal(mk(10.1, 101.0).maxSteps, 1);
  });

  test('G_B ≠ G_A is a G-MECH failure; chain rows in A or B are excluded and counted; UNK rows count but skip (b)', () => {
    const A = synth('2026-10-01T00:00:00Z', [
      { id: 'a', ppg: 10, games: 10, f: factors() },
      { id: 'c', ppg: 10, games: 10, f: factors({ qbTakeoverBasis: 'chain', qbStarterPPG: 10 }), pos: 'QB' },
    ]);
    const B = synth('2026-10-02T00:00:00Z', [
      { id: 'a', ppg: 10, games: 9, total: 90, f: factors() },
      { id: 'c', ppg: 10, games: 10, f: factors() , pos: 'QB' },
    ]);
    const r = gMechPair(A, B);
    assert.equal(r.gMismatch, 1);
    assert.equal(r.excludedChain, 1);
    assert.equal(r.pass, false);
    const unkOnly = gMechPair(A, B, { positionOf: () => null });
    assert.equal(unkOnly.unk, unkOnly.rows);
  });

  test('a rookie-row-polluted team table (A’s) fails G-MECH', () => {
    const pos = posOfMap(S13);
    const rookies = vetEntries(S13, { veteransOnly: false }).filter(e => e.proj.confidence === 'rookie');
    const polluted = teamTables([...rookies, ...vetEntries(S13)], pos);
    const r = gMechPair(S13, S14, { tablesA: polluted });
    assert.equal(r.pass, false, `beyond ${r.beyond}, worst ${r.worstPpg}`);
    assert.ok(r.beyond > 0 || r.worstPpg > 0.003 || r.worstTot > 0.003);
  });
});

// ─── M10 / Q-within window ────────────────────────────────────────────────────

describe('selectSpan (M10 and Q-within windows)', () => {
  const cap = (date, hour = 20) => ({ date, capturedAt: `${date}T${String(hour).padStart(2, '0')}:00:00Z` });
  test('M10: last capture ≤ A + 9 days; later captures are ignored', () => {
    const caps = ['2026-10-23', '2026-10-25', '2026-10-31', '2026-11-01', '2026-11-05'].map(d => cap(d));
    const { a, b } = selectSpan(caps, 'm10');
    assert.equal(a.date, '2026-10-23');
    assert.equal(b.date, '2026-11-01', '10-23T20 + 9d = 11-01T20: 11-01T20 is the last inside');
  });
  test('M10: the 9-day bound is inclusive at the instant', () => {
    const caps = [cap('2026-10-23', 20), { date: '2026-11-01', capturedAt: '2026-11-01T20:00:01Z' }];
    assert.equal(selectSpan(caps, 'm10').b, null);
    const caps2 = [cap('2026-10-23', 20), cap('2026-11-01', 20)];
    assert.equal(selectSpan(caps2, 'm10').b.date, '2026-11-01');
  });
  test('captures at or after 2027-01-01T00:00Z never serve as B (M10 or Q-within)', () => {
    const caps = [cap('2026-12-28'), cap('2026-12-31', 23), { date: '2027-01-01', capturedAt: '2027-01-01T00:00:00Z' }, cap('2027-01-03')];
    assert.equal(selectSpan(caps, 'q').b.date, '2026-12-31');
    assert.equal(selectSpan(caps, 'm10').b.date, '2026-12-31');
    const late = [{ date: '2026-12-28', capturedAt: '2026-12-31T23:00:00Z' }, { date: '2027-01-01', capturedAt: '2027-01-01T00:00:00Z' }];
    assert.equal(selectSpan(late, 'm10').b, null);
  });
  test('M10 is skipped (b null) when the segment has one capture; Q-within likewise', () => {
    assert.equal(selectSpan([cap('2026-10-23')], 'm10').b, null);
    assert.equal(selectSpan([cap('2026-10-23')], 'q').b, null);
    assert.equal(selectSpan([], 'q').a, null);
  });
  test('Q-within has no 9-day bound', () => {
    const caps = [cap('2026-10-23'), cap('2026-12-20')];
    assert.equal(selectSpan(caps, 'q').b.date, '2026-12-20');
    assert.equal(selectSpan(caps, 'm10').b, null);
  });
});

// ─── Q arithmetic ─────────────────────────────────────────────────────────────

describe('Q — drift', () => {
  test('Q_ppg = Σp_live/Σp_mech − 1 and Q_tot likewise, recomputed here from the primitives (trimmed 10-13→10-22)', () => {
    const q = qDrift(S13, S22, { birthdateOf });
    const pos = posOfMap(S13);
    const tablesA = teamTables(vetEntries(S13), pos);
    const ageB = buildAgeTable(vetEntries(S22), pos, birthdateOf, S22.capturedAt);
    const eA = new Map(vetEntries(S13).map(e => [e.id, e]));
    const sum = {};
    for (const b of vetEntries(S22)) {
      const a = eA.get(b.id);
      if (!a || isChainFactors(a.f) || isChainFactors(b.f)) continue;
      const p = pos(b.id);
      if (!p) continue;
      const S = { proj: b.proj, f: b.f };
      const base = { teamFactor: tablesA.team.get(a.p.nfl_team ?? ''), depthFactor: a.f.depthFactor };
      if (p !== 'QB') base.qbQualityFactor = tablesA.qbq.get(a.p.nfl_team ?? '');
      for (const k of COHORT_KEYS) base[k] = a.f[k];
      const mech = recompose(S, { ...base, breakoutFactor: a.f.breakoutFactor, ageDelta: a.f.ageDelta, compPPG: a.f.compPPG, compBlendWeight: a.f.compBlendWeight });
      const live = { ...base };
      const bd = birthdateOf(b.id);
      const ageA = ageAt(bd, S13.capturedAt), ageB2 = ageAt(bd, S22.capturedAt);
      const cell = ageA != null ? ageB.table[p]?.[ageA] : undefined;
      if (cell !== undefined) live.ageDelta = cell;
      if (!(bd != null && ageA !== ageB2 && ageA <= 24)) { /* S's breakout stands */ } else live.breakoutFactor = a.f.breakoutFactor;
      const lv = recompose(S, live);
      const s = (sum[p] ??= { live: 0, mech: 0, Tl: 0, Tm: 0 });
      s.live += lv.p; s.mech += mech.p;
      s.Tl += round1(lv.p * b.proj.projectedGames); s.Tm += round1(mech.p * b.proj.projectedGames);
    }
    for (const p of ['QB', 'RB', 'WR', 'TE']) {
      assert.ok(Math.abs(q.byPos[p].Q_ppg - (sum[p].live / sum[p].mech - 1)) < 1e-12, p);
      assert.ok(Math.abs(q.byPos[p].Q_tot - (sum[p].Tl / sum[p].Tm - 1)) < 1e-12, p);
    }
    assert.ok(q.rows > 100);
    assert.ok(q.off >= 0 && q.offB >= 0);
  });
});

// ─── G5 / G6 ──────────────────────────────────────────────────────────────────

describe('G5 QB chain (veteran rows only), G6 age table', () => {
  const priorOf = priorOfFor(S22);

  test('trimmed 10-22: veteran QB rows reproduce basis and every chain share to 4 dp', () => {
    const g5 = gQbChain(S22, { priorOf, models: qbModels });
    assert.equal(g5.pass, true, JSON.stringify(g5.sample));
    assert.ok(g5.vetRows >= 40);
    assert.ok(g5.rookieRows > 0);
  });

  test('a corrupted rookie-path share is reported but does not gate; a corrupted veteran chain share gates', () => {
    const copy = JSON.parse(JSON.stringify(S22));
    const rooms = capturedQbRooms(copy);
    const rookieChain = rooms.find(q => q.rookiePath && q.f.qbTakeoverBasis === 'chain');
    const vetChain = rooms.find(q => !q.rookiePath && q.f.qbTakeoverBasis === 'chain');
    assert.ok(rookieChain && vetChain);
    copy.players[rookieChain.id].projection.factors.qbStartShare += 0.05;
    const a = gQbChain(copy, { priorOf, models: qbModels });
    assert.equal(a.vetMismatch, 0);
    assert.equal(a.rookieMismatch, 1);
    assert.equal(a.pass, true, 'rookie-path rows are reported, not gated');
    copy.players[vetChain.id].projection.factors.qbStartShare += 0.05;
    const b = gQbChain(copy, { priorOf, models: qbModels });
    assert.equal(b.vetMismatch, 1);
    assert.equal(b.pass, false);
  });

  test('age table: mode per (pos, age); ties go to the smallest value; share-in-mode', () => {
    const rows = [
      { id: 'a', ageDelta: 1.02 }, { id: 'b', ageDelta: 1.02 }, { id: 'c', ageDelta: 0.99 },   // age 25: mode 1.02 (2 of 3)
      { id: 'd', ageDelta: 1.05 }, { id: 'e', ageDelta: 0.97 },                                // age 26: tie → 0.97
    ].map(r => ({ id: r.id, p: {}, f: { ageDelta: r.ageDelta } }));
    const bd = { a: '2001-01-01', b: '2001-01-01', c: '2001-01-01', d: '2000-01-01', e: '2000-01-01' };
    const t = buildAgeTable(rows, () => 'WR', (id) => bd[id], '2026-10-01T00:00:00Z');
    assert.equal(t.table.WR[25], 1.02);
    assert.equal(t.table.WR[26], 0.97);
    assert.equal(t.shareInMode, 3 / 5);
    assert.equal(t.n, 5);
    // entries without a birthdate, or with an unknown position, are skipped
    const t2 = buildAgeTable(rows, () => null, (id) => bd[id], '2026-10-01T00:00:00Z');
    assert.equal(t2.n, 0);
    assert.equal(t2.shareInMode, null);
  });

  test('ageAt: whole years at the capture UTC date; null without a birthdate', () => {
    assert.equal(ageAt('2000-10-02', '2026-10-01T23:59:00Z'), 25);
    assert.equal(ageAt('2000-10-01', '2026-10-01T00:00:00Z'), 26);
    assert.equal(ageAt(null, '2026-10-01T00:00:00Z'), null);
  });

  test('G6 on the trimmed captures meets 0.98 with the fixture birthdate map', () => {
    const g = gAgeTable(S22, { positionOf: posOfMap(S22), birthdateOf });
    assert.ok(g.pass, `share-in-mode ${g.shareInMode}`);
  });
});

// ─── Replay R ─────────────────────────────────────────────────────────────────

describe('replayR on the trimmed captures', () => {
  const run = (over = {}) => replayR({
    K, sCaptures: [{ date: '2026-10-22', snapshot: S22 }], positionOfK: posOfMap(K), birthdateOf, drafted2026Of, recentStarterOf,
    qbModels, priorOf: priorOfFor(S22), ...over,
  });

  test('every K veteran is replayed, imputed or dropped; the replay moves values, not row identity', () => {
    const r = run();
    assert.equal(r.rows.length, vetEntries(K).length);
    assert.equal(r.counts.replayed + r.counts.imputed + r.counts.dropped, r.counts.p);
    assert.ok(r.counts.replayed > 80);
    for (const row of r.rows) if (row.kind === 'replayed') assert.ok(Number.isFinite(row.p) && Number.isFinite(row.T));
    // R sits near S (the substitution is small) and near K (a September→October model difference, not a unit error)
    const rep = r.rows.filter(x => x.kind === 'replayed' && !x.chain && x.sRow.p > 5);
    const sum = (f) => rep.reduce((s, x) => s + f(x), 0);
    assert.ok(Math.abs(sum(x => x.p) / sum(x => x.sRow.p) - 1) < 0.08);
  });

  test('K’s inputs are used: team factor, per-team qbQualityFactor and depthChartOrder-driven depth factor come from K, not S', () => {
    const mk = (capturedAt, rows) => synth(capturedAt, rows);
    const kf = { teamFactor: 1.05, qbQualityFactor: 1.02 };
    const sf = { teamFactor: 1.0, qbQualityFactor: 1.0 };
    // a: K order 2 / S order 1; b: K order 1 / S order 2 — both WR on team AAA
    const Kx = mk('2026-09-09T19:00:00Z', [
      { id: 'a', ppg: 10, pos: 'WR', order: 2, f: factors({ ...kf, depthFactor: 0.88 }) },
      { id: 'b', ppg: 10, pos: 'WR', order: 1, f: factors({ ...kf, depthFactor: 1.05 }) },
    ]);
    const Sx = mk('2026-10-22T19:00:00Z', [
      { id: 'a', ppg: 10, pos: 'WR', order: 1, f: factors({ ...sf, depthFactor: 1.05 }) },
      { id: 'b', ppg: 10, pos: 'WR', order: 2, f: factors({ ...sf, depthFactor: 0.88 }) },
    ]);
    assert.notEqual(Kx.players.a.projection.factors.teamFactor, Sx.players.a.projection.factors.teamFactor);
    const r = replayR({
      K: Kx, sCaptures: [{ date: 's', snapshot: Sx }], positionOfK: posOfMap(Kx), birthdateOf: () => null,
      drafted2026Of: () => false, recentStarterOf: () => false, qbModels, priorOf: () => null,
    });
    const by = Object.fromEntries(r.rows.map(x => [x.id, x]));
    const sRow = (id) => ({ proj: Sx.players[id].projection, f: Sx.players[id].projection.factors });
    // hand-computed recompose with K's values: teamFactor 1.05, qbQualityFactor 1.02 (K's per-team value at AAA), depth from K's order
    const expA = recompose(sRow('a'), { teamFactor: 1.05, qbQualityFactor: 1.02, depthFactor: 0.88 }).p;
    const expB = recompose(sRow('b'), { teamFactor: 1.05, qbQualityFactor: 1.02, depthFactor: 1.05 }).p;
    assert.ok(Math.abs(by.a.p - expA) < 1e-12, `a: ${by.a.p} vs ${expA}`);
    assert.ok(Math.abs(by.b.p - expB) < 1e-12, `b: ${by.b.p} vs ${expB}`);
    // and the same figure by hand: p′ = p_S + B(f′) − B(f_S), the substituted qbQuality entering the combined raw (1.0 → 1.02)
    const hand = (id, depth) => {
      const fS = Sx.players[id].projection.factors;
      return 10 + composeBlended({ ...fS, teamFactor: 1.05, qbQualityFactor: 1.02, depthFactor: depth }, { raw: 1.02 }) - composeBlended(fS, { raw: 1 });
    };
    assert.ok(Math.abs(by.a.p - hand('a', 0.88)) < 1e-9);
    assert.ok(Math.abs(by.b.p - hand('b', 1.05)) < 1e-9);
    // K's per-team tables are what the replay reads
    assert.equal(r.kTables.team.get('AAA'), 1.05);
    assert.equal(r.kTables.qbq.get('AAA'), 1.02);
  });

  test('sensitivity switches change the result; G5-failure option drops backup/chain QBs; G6-failure keeps S ageDelta', () => {
    const base = run();
    const s1 = run({ kSourced: false });
    const sum = (r) => r.rows.filter(x => x.kind === 'replayed').reduce((a, x) => a + x.p, 0);
    assert.notEqual(sum(base), sum(s1));
    const drop = run({ dropQbBackups: true });
    assert.ok(drop.counts.dropped > 0);
    assert.equal(drop.rows.filter(x => x.kind === 'dropped').length, drop.counts.dropped);
    const noAge = run({ useAgeTable: false });
    assert.equal(noAge.counts.ageNoCell, 0);
  });

  test('sensitivity kSourced:false takes every K-sourced input from S as captured: an S-chain QB’s p′ equals S’s projectedPPG', () => {
    const chainF = factors({ qbTakeoverBasis: 'chain', qbStarterPPG: 12, qbStartShare: 0.4, teamFactor: 1.0 });
    const Kq = synth('2026-09-09T19:00:00Z', [
      { id: 'q', ppg: 12, pos: 'QB', order: 1, team: 'AAA', f: factors({ teamFactor: 1.1, depthFactor: 1.05, breakoutFactor: 1.3 }) },
    ]);
    const Sq = synth('2026-10-22T19:00:00Z', [
      { id: 'q', ppg: 4.8, games: 17, pos: 'QB', order: 2, team: 'AAA', f: chainF },
    ]);
    const args = {
      K: Kq, sCaptures: [{ date: 's', snapshot: Sq }], positionOfK: posOfMap(Kq), birthdateOf: () => '2003-10-01',
      drafted2026Of: () => false, recentStarterOf: () => false, qbModels, priorOf: () => null,
    };
    const sens = replayR({ ...args, kSourced: false });
    const row = sens.rows[0];
    assert.equal(row.kind, 'replayed');
    assert.equal(row.chain, true, 'an S-chain QB stays chain, recomposed through the chain branch');
    assert.ok(Math.abs(row.p - 4.8) < 0.15, `p′ ${row.p} vs S 4.8`);
    assert.equal(sens.counts.breakoutFromK, 0, 'the K-breakout branch is off');
    // the default run is K-sourced, so it differs (K's teamFactor 1.1 and breakout 1.3 apply)
    const live = replayR(args);
    assert.notEqual(live.rows[0].p, row.p);
  });

  test('QB role comes from K’s rooms: a chain row appears iff the K role is backup and not stale; its share is the reconstructed share', () => {
    const r = run();
    const chain = r.rows.filter(x => x.kind === 'replayed' && x.chain);
    assert.equal(chain.length, r.counts.qbChain);
    for (const row of chain) {
      assert.equal(row.pos, 'QB');
      assert.equal(r.rooms[row.id].role, 'backup');
      assert.equal(row.T, round1(row.p * 17), 'T = round1(blended·share·17) with p = blended·share');
    }
  });

  test('onCapture runs with the snapshot in hand; S(i) is the earliest capture holding the player as a veteran', () => {
    const seen = [];
    const early = { ...S22, capturedAt: '2026-10-20T20:00:00Z', players: Object.fromEntries(Object.entries(S22.players).slice(0, 60)) };
    const r = run({ sCaptures: [{ date: '2026-10-20', snapshot: early }, { date: '2026-10-22', load: () => S22 }], onCapture: (i) => seen.push([i.date, i.assigned]) });
    assert.equal(seen[0][0], '2026-10-20');
    assert.ok(seen[0][1] > 0);
    const dates = new Set(r.rows.filter(x => x.kind === 'replayed').map(x => x.sDate));
    assert.ok(dates.has('2026-10-20') && dates.has('2026-10-22'));
  });
});

describe('replayR degradation options (G5 / G6 failure)', () => {
  const run = (over = {}) => replayR({
    K, sCaptures: [{ date: '2026-10-22', snapshot: S22 }], positionOfK: posOfMap(K), birthdateOf, drafted2026Of, recentStarterOf,
    qbModels, priorOf: priorOfFor(S22), ...over,
  });
  test('G5 failure: veteran backup/chain QB rows are dropped and counted', () => {
    const r = run({ dropQbBackups: true });
    assert.ok(r.counts.dropped > 0);
    assert.equal(r.rows.filter(x => x.kind === 'dropped').length, r.counts.dropped);
    for (const x of r.rows.filter(y => y.kind === 'dropped')) assert.equal(x.pos, 'QB');
  });
  test('G6 failure: S’s ageDelta is kept (no age-table cell lookups) and the no-birthdate count is still reported', () => {
    const r = run({ useAgeTable: false });
    assert.equal(r.counts.ageNoCell, 0);
    const missing = vetEntries(K).filter(e => birthdateOf(e.id) == null).length;
    assert.equal(r.counts.ageNoBirthdate, missing);
  });
  test('onCapture is not called for a capture that assigns no S(i)', () => {
    const seen = [];
    const empty = { ...S22, capturedAt: '2026-10-21T20:00:00Z', players: {} };
    run({ sCaptures: [{ date: '2026-10-21', snapshot: empty }, { date: '2026-10-22', snapshot: S22 }], onCapture: (i) => seen.push(i.date) });
    assert.deepEqual(seen, ['2026-10-22']);
  });
});

describe('breakout age rule (each branch) and age substitution', () => {
  // K and S share one veteran per branch; the birthdate decides which branch applies.
  // depthFactor 1.05 = what the order-1 depth rule reconstructs, so the K-sourced substitutions are no-ops here
  const mkRow = (id, f) => ({ id, ppg: 10, games: 10, pos: 'WR', f: factors({ basePPG: 10 / 1.05, depthFactor: 1.05, ...f }) });
  const Ksnap = synth('2026-09-09T19:00:00Z', [mkRow('same', { breakoutFactor: 1.1 }), mkRow('old', { breakoutFactor: 1.1 }), mkRow('young', { breakoutFactor: 1.1 }), mkRow('nobd', { breakoutFactor: 1.1 })]);
  const Ssnap = synth('2026-10-22T19:00:00Z', [mkRow('same', { breakoutFactor: 1.0 }), mkRow('old', { breakoutFactor: 1.0 }), mkRow('young', { breakoutFactor: 1.0 }), mkRow('nobd', { breakoutFactor: 1.0 })]);
  // same: 23 on both dates (birthday 04-01); old: turns 26 between K and S (age > 24); young: turns 23 between K and S (≤ 24)
  const bds = { same: '2003-04-01', old: '2000-10-01', young: '2003-10-01' };
  const run = () => replayR({
    K: Ksnap, sCaptures: [{ date: 's', snapshot: Ssnap }], positionOfK: () => 'WR', birthdateOf: (id) => bds[id] ?? null,
    drafted2026Of: () => false, recentStarterOf: () => false, qbModels, priorOf: () => null,
  });
  test('age equal → S’s breakout; age > 24 → S’s; age differs and ≤ 24 → K’s (counted); no birthdate → S’s (counted)', () => {
    const r = run();
    const by = Object.fromEntries(r.rows.map(x => [x.id, x]));
    // S breakout 1.0 → p unchanged (10); K's 1.1 substituted → p = 10 + (11 − 10) = 11
    assert.equal(by.same.p, 10);
    assert.equal(by.old.p, 10);
    assert.ok(Math.abs(by.young.p - 11) < 1e-9, `got ${by.young.p}`);
    assert.equal(by.nobd.p, 10);
    assert.equal(r.counts.breakoutFromK, 1);
    assert.equal(r.counts.breakoutNoBirthdate, 1);
    assert.equal(r.counts.ageNoBirthdate, 1);
  });
});

describe('imputation with ρ re-estimated per resample', () => {
  const rows = [
    { id: 'a', pos: 'RB', kind: 'replayed', pK: 10, TK: 100, GK: 10, p: 11, T: 99, G: 9, a: 90, g: 9, chain: false },
    { id: 'b', pos: 'RB', kind: 'replayed', pK: 10, TK: 100, GK: 10, p: 9, T: 90, G: 10, a: 80, g: 10, chain: false },
    { id: 'c', pos: 'RB', kind: 'imputed', pK: 8, TK: 80, GK: 10, a: 70, g: 10, chain: false },
    { id: 'd', pos: 'WR', kind: 'replayed', pK: 10, TK: 100, GK: 10, p: 12, T: 120, G: 10, a: 100, g: 10, chain: false },
    { id: 'e', pos: 'WR', kind: 'imputed', pK: 5, TK: 50, GK: 10, a: 50, g: 10, chain: false },
  ];
  test('ρ = Σ replayed ÷ Σ K-captured at the position; imputed = K × ρ', () => {
    const m = materializeRows(rows);
    const c = m.find(r => r.id === 'c');
    assert.ok(Math.abs(c.p - 8 * (20 / 20)) < 1e-12);            // RB: Σp 20 / ΣpK 20
    assert.ok(Math.abs(c.T - 80 * (189 / 200)) < 1e-12);         // Σ T 189 / Σ TK 200
    assert.ok(Math.abs(c.G - 10 * (19 / 20)) < 1e-12);
    const e = m.find(r => r.id === 'e');
    assert.ok(Math.abs(e.p - 5 * 1.2) < 1e-12);                  // WR: 12 / 10
  });
  test('a resample that drops a replayed row changes ρ and so the imputed values', () => {
    const full = materializeRows(rows).find(r => r.id === 'c');
    const sub = materializeRows(rows.filter(r => r.id !== 'a')).find(r => r.id === 'c');
    assert.notEqual(full.p, sub.p);
    assert.ok(Math.abs(sub.p - 8 * (9 / 10)) < 1e-12);
  });
  test('the bootstrap statistic re-materialises per resample (CI differs from one with ρ frozen at the full sample)', () => {
    const many = [];
    for (let i = 0; i < 60; i++) many.push({ id: `r${i}`, pos: 'RB', kind: 'replayed', pK: 10, TK: 100, GK: 10, p: 8 + (i % 7), T: 80 + 10 * (i % 7), G: 10, a: 90, g: 10, chain: false });
    for (let i = 0; i < 20; i++) many.push({ id: `i${i}`, pos: 'RB', kind: 'imputed', pK: 10, TK: 100, GK: 10, a: 90, g: 10, chain: false });
    const live = bootCI(many, (s) => metricOf(s, 'R_tot', null), { resamples: 300, seed: 7 });
    const frozen = materializeRows(many);
    const fixed = bootCI(frozen, (s) => cellStats(s).R_tot, { resamples: 300, seed: 7 });
    assert.ok(live && fixed);
    assert.notDeepEqual(live, fixed);
  });
});

test('chartPositions equals the grader’s buildPositionMap rule', () => {
  assert.deepEqual([...chartPositions(S22)].sort(), [...buildPositionMap(S22)].sort());
});

test('makeRecentStarterOf: last qualifying season (gp ≥ 8, finite fp) decides gamesStarted ≥ 8', () => {
  const data = {
    2025: { a: { gamesPlayed: 5, gamesStarted: 5, fantasyPoints: 50 }, b: { gamesPlayed: 10, gamesStarted: 9, fantasyPoints: 90 }, n: { gamesPlayed: 10, gamesStarted: 9, fantasyPoints: NaN } },
    2024: { a: { gamesPlayed: 12, gamesStarted: 3, fantasyPoints: 100 }, n: { gamesPlayed: 12, gamesStarted: 12, fantasyPoints: 100 } },
  };
  const f = makeRecentStarterOf((y) => data[y] ?? null, 2025, 2024);
  assert.equal(f('a'), false, '2025 does not qualify; 2024 qualifies with 3 starts');
  assert.equal(f('b'), true);
  assert.equal(f('n'), true, 'non-finite 2025 skipped; 2024 qualifies');
  assert.equal(f('zz'), false);
});
