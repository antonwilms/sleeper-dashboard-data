/**
 * test/rookie-basis-refit.test.mjs — D-45 Stage A3a: the pure refit library (lib/rookieBasisRefit.mjs) on synthetic inputs.
 * The run itself (`node bin/backtest.mjs --rookie-basis`) is a hand-run, never a test; scripts/rookie-basis-run.mjs is tested in
 * test/rookie-basis-run.test.mjs. Nothing here reads a committed league artifact, snapshots/ or the live store (Invariant 10).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  ROOKIE_BASIS, round1, round2, round3, tierGroup, fitCellConstants, ratioByPosition, summarizeDeltas, sameAt, decideFamily, multiplicity,
  pinball, g0bF1, g0bF2, g0bF3, g0bF4, runF1, runF2, runF3, runF4, runF5, liveEffect, cappedProductOf,
} from '../lib/rookieBasisRefit.mjs';
import { clusteredBootstrap, bootstrapPairedMean, prospectPriorPPG, PROSPECT_MIRROR } from '../lib/inSeasonEvidence.mjs';
import { ROOKIE_BASELINE_PPG } from '../lib/projectionFactors.mjs';
import { ROOKIE_CALIBRATION, ROOKIE_TOTAL_FACTOR } from '../lib/rookieMirror.mjs';
import { quantile, computeCeilingReconciliation } from '../scripts/panel-run.mjs';

const POS = ['QB', 'RB', 'WR', 'TE'];
const ONES = { QB: 1, RB: 1, WR: 1, TE: 1 };
const near = (a, b, tol = 1e-9, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} vs ${b}`);
// a deterministic [0,1) stream
const lcg = (seed) => { let a = seed >>> 0; return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; }; };

// ─── library additions ────────────────────────────────────────────────────────

describe('clusteredBootstrap `levels` (ci99) is additive and byte-identical by default', () => {
  const clusters = Array.from({ length: 40 }, (_, i) => ({ sum: (i % 7) - 2 + (i % 3) * 0.1, count: 1 }));
  const stat = (sample) => { let s = 0, n = 0; for (const c of sample) { s += c.sum; n += c.count; } return n ? s / n : null; };
  test('no levels → no ci99 key and the result is exactly what it was; levels [0.99] adds a wider ci99 beside the unchanged ci95', () => {
    const base = clusteredBootstrap(clusters, stat, { resamples: 500, seed: 7 });
    assert.equal('ci99' in base, false);
    const withLevels = clusteredBootstrap(clusters, stat, { resamples: 500, seed: 7, levels: [0.99] });
    assert.deepEqual(withLevels.ci95, base.ci95);
    assert.equal(withLevels.pNegative, base.pNegative);
    assert.ok(withLevels.ci99[0] <= withLevels.ci95[0] && withLevels.ci99[1] >= withLevels.ci95[1]);
    assert.ok(withLevels.ci99[0] < withLevels.ci95[0] || withLevels.ci99[1] > withLevels.ci95[1]);
  });
  test('the ci99 indices are floor(0.005 R) and ceil(0.995 R) − 1 of the sorted statistics; 0.95 is accepted; an unsupported level throws', () => {
    const r = clusteredBootstrap(clusters, stat, { resamples: 4000, seed: 12345, levels: [0.95, 0.99] });
    assert.equal(r.used, 4000);
    // recompute the sorted statistics independently
    const rng = (() => { let a = 12345 >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
    const m = clusters.length, stats = [];
    for (let i = 0; i < 4000; i++) { const sample = []; for (let c = 0; c < m; c++) sample.push(clusters[Math.floor(rng() * m)]); stats.push(stat(sample)); }
    stats.sort((a, b) => a - b);
    assert.deepEqual(r.ci99, [stats[20], stats[3979]]);
    assert.deepEqual(r.ci95, [stats[100], stats[3899]]);
    assert.throws(() => clusteredBootstrap(clusters, stat, { resamples: 10, levels: [0.9] }), /unsupported CI level/);
  });
  test('bootstrapPairedMean passes `levels` through (and without it is unchanged)', () => {
    const ids = Array.from({ length: 30 }, (_, i) => `p${i % 15}`), diffs = Array.from({ length: 30 }, (_, i) => (i % 5) - 1.5);
    const a = bootstrapPairedMean(ids, diffs, { resamples: 300, seed: 1 });
    const b = bootstrapPairedMean(ids, diffs, { resamples: 300, seed: 1, levels: [0.99] });
    assert.equal('ci99' in a, false); assert.deepEqual(a.ci95, b.ci95); assert.ok(Array.isArray(b.ci99));
  });
});

describe('scripts/panel-run.mjs exports', () => {
  test('quantile is the zero-based p(n−1) linear interpolation; computeCeilingReconciliation reports p90 / p99 at 2 dp per position', () => {
    assert.equal(quantile([1, 2, 3, 4, 5], 0.5), 3);
    assert.equal(quantile([0, 10], 0.9), 9);
    assert.equal(quantile([], 0.9), null);
    const rows = Array.from({ length: 20 }, (_, i) => ({ position: 'WR', outcomeGames: 10, outcomePPG: i }));
    const r = computeCeilingReconciliation(rows);
    assert.equal(r.observed.WR.n, 20);
    assert.equal(r.observed.WR.knee, 17.1);        // 0.9 × 19
    assert.equal(r.observed.WR.asymptote, 18.81);  // 0.99 × 19
    assert.equal(r.observed.QB.n, 0);
  });
});

// ─── shared statistics ────────────────────────────────────────────────────────

describe('summarizeDeltas / sameAt / pinball', () => {
  test('mean, clustering by id, ci95 + ci99, the label from the 95% interval; below the floor the label is INSUFFICIENT but the delta is reported and pooled', () => {
    const ids = Array.from({ length: 60 }, (_, i) => `p${i % 30}`), diffs = Array.from({ length: 60 }, (_, i) => -1 + (i % 3) * 0.1);
    const s = summarizeDeltas(ids, diffs, { floor: { kind: 'rows', min: 30 } });
    assert.equal(s.rows, 60); assert.equal(s.players, 30); assert.equal(s.label, 'BEATS'); assert.equal(s.statLabel, 'BEATS'); assert.equal(s.insufficient, false);
    near(s.mean, -0.9);
    assert.ok(s.ci99[1] < 0 && Array.isArray(s.ci95));
    const thin = summarizeDeltas(ids, diffs, { floor: { kind: 'players', min: 31 } });
    assert.equal(thin.label, 'INSUFFICIENT'); assert.equal(thin.statLabel, 'BEATS'); assert.equal(thin.insufficient, true); near(thin.mean, -0.9);
    assert.equal(summarizeDeltas([], [], { floor: { kind: 'rows', min: 1 } }).label, 'INSUFFICIENT');
  });
  test('sameAt compares at the stated decimals', () => {
    assert.equal(sameAt(10.004, 10.001, 2), true); assert.equal(sameAt(10.006, 10.001, 2), false); assert.equal(sameAt(10.0004, 10.0001, 3), true);
    assert.equal(sameAt(null, 1, 2), false);
  });
  test('pinball is the proper quantile score: τ(y−q) above, (1−τ)(q−y) below, minimised in expectation at the τ-quantile', () => {
    assert.equal(pinball(0.9, 10, 8), 0.9 * 2); near(pinball(0.9, 8, 10), 0.1 * 2); assert.equal(pinball(0.5, 5, 5), 0);
    const ys = Array.from({ length: 100 }, (_, i) => i + 1);
    const loss = (q) => ys.reduce((a, y) => a + pinball(0.9, y, q), 0);
    assert.ok(loss(90) < loss(70) && loss(90) < loss(99));
  });
});

// ─── the decision rule ────────────────────────────────────────────────────────

describe('decideFamily — the pre-registered rule (plan §4.3)', () => {
  const E = (key, statLabel, over = {}) => ({ key, statLabel, insufficient: false, same: false, deciding: true, ...over });
  const POOLED_BELOW = { ci99: [-0.5, -0.1] }, POOLED_ZERO = { ci99: [-0.5, 0.1] };
  test('wire: ≥ 1 labelled BEATS, no labelled WORSE, pooled 99% below 0', () => {
    const d = decideFamily({ entries: [E('a', 'BEATS'), E('b', 'NO-GAIN')], pooled: POOLED_BELOW });
    assert.equal(d.verdict, 'wire'); assert.deepEqual(d.beats, ['a']); assert.deepEqual(d.worse, []);
  });
  test('do-not-wire: BEATS but the pooled 99% interval is not below 0; a labelled WORSE blocks; no BEATS', () => {
    assert.equal(decideFamily({ entries: [E('a', 'BEATS')], pooled: POOLED_ZERO }).verdict, 'do-not-wire');
    assert.equal(decideFamily({ entries: [E('a', 'BEATS')], pooled: { ci99: null } }).verdict, 'do-not-wire');
    const w = decideFamily({ entries: [E('a', 'BEATS'), E('b', 'WORSE')], pooled: POOLED_BELOW });
    assert.equal(w.verdict, 'do-not-wire'); assert.deepEqual(w.worse, ['b']); assert.match(w.reasons[0], /WORSE b/);
    assert.equal(decideFamily({ entries: [E('a', 'NO-GAIN')], pooled: POOLED_BELOW }).verdict, 'do-not-wire');
  });
  test('INSUFFICIENT entries are pooled but never labelled: they cannot supply the BEATS nor block with a WORSE', () => {
    assert.equal(decideFamily({ entries: [E('a', 'BEATS', { insufficient: true })], pooled: POOLED_BELOW }).verdict, 'do-not-wire');
    assert.equal(decideFamily({ entries: [E('a', 'BEATS'), E('b', 'WORSE', { insufficient: true })], pooled: POOLED_BELOW }).verdict, 'wire');
  });
  test('`same` entries: never the required BEATS, but a `same` WORSE blocks a wire; a family whose every entry is `same` is do-not-wire whatever its pooled delta', () => {
    assert.equal(decideFamily({ entries: [E('a', 'BEATS', { same: true })], pooled: POOLED_BELOW }).verdict, 'do-not-wire');
    assert.equal(decideFamily({ entries: [E('a', 'BEATS'), E('b', 'WORSE', { same: true })], pooled: POOLED_BELOW }).verdict, 'do-not-wire');
    assert.deepEqual(decideFamily({ entries: [E('a', 'BEATS'), E('b', 'WORSE', { same: true })], pooled: POOLED_BELOW }).worse, ['b']);
    assert.equal(decideFamily({ entries: [E('a', 'BEATS'), E('b', 'WORSE', { same: true, insufficient: true })], pooled: POOLED_BELOW }).verdict, 'wire', 'an INSUFFICIENT entry is never labelled');
    const all = decideFamily({ entries: [E('a', 'BEATS', { same: true }), E('b', 'BEATS', { same: true })], pooled: POOLED_BELOW });
    assert.equal(all.verdict, 'do-not-wire'); assert.equal(all.allSame, true); assert.match(all.reasons[0], /every entry is `same`/);
    assert.equal(decideFamily({ entries: [], pooled: POOLED_BELOW }).verdict, 'do-not-wire', 'no entries is not "all same" and cannot wire');
  });
  test('non-deciding entries (F5: only WR decides) count for nothing', () => {
    assert.equal(decideFamily({ entries: [E('QB', 'BEATS', { deciding: false }), E('WR', 'NO-GAIN')], pooled: POOLED_BELOW }).verdict, 'do-not-wire');
    assert.equal(decideFamily({ entries: [E('QB', 'WORSE', { deciding: false }), E('WR', 'BEATS')], pooled: POOLED_BELOW }).verdict, 'wire');
  });
  test('stop-and-report: each of G0 failure, structural failure, a pinned artifact that did not reproduce, §4.6 trip — and it outranks wire', () => {
    const base = { entries: [E('a', 'BEATS')], pooled: POOLED_BELOW };
    assert.equal(decideFamily(base).verdict, 'wire');
    for (const [k, re] of [['g0Ok', /G0/], ['structuralOk', /structural/], ['pinnedOk', /pinned artifact/]]) {
      const d = decideFamily({ ...base, [k]: false });
      assert.equal(d.verdict, 'stop-and-report', k); assert.match(d.reasons.join(' '), re);
    }
    const t = decideFamily({ ...base, trip46: true });
    assert.equal(t.verdict, 'stop-and-report'); assert.match(t.reasons.join(' '), /§4\.6/);
    assert.equal(decideFamily({ entries: [E('a', 'NO-GAIN')], pooled: POOLED_ZERO, pinnedOk: false }).verdict, 'stop-and-report', 'regardless of the statistics');
  });
  test('the constants: 99% pooled level, per-family floors, ≤ 30 deciding entries', () => {
    assert.equal(ROOKIE_BASIS.pooledLevel, 0.99);
    assert.deepEqual(ROOKIE_BASIS.bootstrap.levels, [0.99]);
    assert.equal(ROOKIE_BASIS.bootstrap.resamples, 4000); assert.equal(ROOKIE_BASIS.bootstrap.seed, 12345);
    assert.deepEqual(ROOKIE_BASIS.floors.F3, { kind: 'players', min: 10 });
    assert.equal(Object.values(ROOKIE_BASIS.maxDecidingEntries).reduce((a, v) => a + v, 0), 30);
  });
  test('multiplicity counts deciding, above-floor entries and states 5% of them', () => {
    const m = multiplicity({
      F1: { entries: [E('a', 'BEATS'), E('b', 'BEATS', { insufficient: true })] },
      F5: { entries: [E('QB', 'BEATS', { deciding: false }), E('WR', 'BEATS')] },
    });
    assert.equal(m.labelledEntries, 2); near(m.expectedSpurious, 0.1); assert.equal(m.maxEntries, 30); near(m.expectedSpuriousAtMax, 1.5);
  });
});

// ─── F1 ───────────────────────────────────────────────────────────────────────

describe('F1 recipe port', () => {
  test('tierGroup: null / unmatched → undrafted (the one stated mapping); the three drafted groups; unknown → null', () => {
    assert.equal(tierGroup(null), 'undrafted'); assert.equal(tierGroup('unmatched'), 'undrafted');
    assert.deepEqual(['top-3', 'r1-late', 'r2', 'r3', 'r4', 'r7'].map(tierGroup), ['r1', 'r1', 'day2', 'day2', 'day3', 'day3']);
    assert.equal(tierGroup('bogus'), null);
  });
  const rowsOf = (n, c) => Array.from({ length: n }, () => ({ tier: 'r5', pos: 'RB', o: c * 10, pr: 10 }));
  test('fitCellConstants: n ≥ 30 own ratio; 10 ≤ n < 30 own ratio floored at the group-pooled ratio; n < 10 held at 1.00; every cell capped at 1.00; r1/day2 are 1.00', () => {
    const train = [
      ...rowsOf(40, 0.5),                                                                         // day3:RB n=40 → 0.5
      ...Array.from({ length: 12 }, () => ({ tier: 'r5', pos: 'WR', o: 2, pr: 10 })),            // day3:WR n=12 → own 0.2 floored at the pooled ratio
      ...Array.from({ length: 5 }, () => ({ tier: 'r5', pos: 'TE', o: 1, pr: 10 })),             // day3:TE n=5 → 1.00
      ...Array.from({ length: 35 }, () => ({ tier: 'r6', pos: 'QB', o: 15, pr: 10 })),           // day3:QB n=35 raw 1.5 → capped 1.00
      ...Array.from({ length: 40 }, () => ({ tier: 'top-3', pos: 'WR', o: 5, pr: 10 })),         // r1 → 1.00 regardless
      ...Array.from({ length: 40 }, () => ({ tier: 'r2', pos: 'RB', o: 30, pr: 10 })),           // day2 → 1.00 (no lift)
    ];
    const fit = fitCellConstants(train);
    near(fit.get('day3:RB').c, 0.5); assert.equal(fit.get('day3:RB').band, 'n>=30');
    const pooled = (40 * 5 + 12 * 2 + 5 * 1 + 35 * 15) / (40 * 10 + 12 * 10 + 5 * 10 + 35 * 10);
    near(fit.get('day3:WR').c, Math.min(Math.max(0.2, pooled), 1)); assert.equal(fit.get('day3:WR').band, '10<=n<30');
    assert.ok(fit.get('day3:WR').c > 0.2, 'floored at the pooled ratio');
    assert.equal(fit.get('day3:TE').c, 1.0); assert.equal(fit.get('day3:TE').band, 'n<10');
    assert.equal(fit.get('day3:QB').c, 1.0); near(fit.get('day3:QB').raw, 1.5);
    assert.equal(fit.get('r1:WR').c, 1.0); assert.equal(fit.get('day2:RB').c, 1.0);
  });
  test('ratioByPosition: Σ league ÷ Σ half per position at 3 dp; a non-positive half sum → 1', () => {
    const rho = ratioByPosition([{ pos: 'WR', oH: 3, oL: 4 }, { pos: 'WR', oH: 3, oL: 4 }, { pos: 'QB', oH: 0, oL: 5 }], (r) => r.oL, (r) => r.oH);
    assert.equal(rho.WR, 1.333); assert.equal(rho.QB, 1); assert.equal(rho.RB, 1);
  });

  // 4 predictor years × 4 positions × 4 tiers × 8 reps: every (group, position) cell has 32 rows (≥ 30)
  // r1 / day2 rows realise about their projection (calibration 1.00); day3 / undrafted rows realise `lowShare` of it (corrected cells)
  function f1Synth({ k = ONES, kOf = null, lowShare = 0.5, s = ONES, tiers = ['top-3', 'r2', 'r5', null] } = {}) {
    const rnd = lcg(11), rows = [];
    let id = 0;
    for (const year of [2013, 2014, 2015, 2016]) for (const pos of POS) for (const tier of tiers) for (let rep = 0; rep < 8; rep++) {
      const cp = 0.8 + rnd() * 0.9;
      const prH = round1(ROOKIE_BASELINE_PPG[pos] * cp);
      const share = tier === 'top-3' || tier === 'r2' ? 1 : lowShare;
      const oH = prH * share * (0.7 + rnd() * 0.6);
      rows.push({ id: `p${id++}`, key: `k${id}`, year, pos, tier, cp, prH, oH, oL: oH * (kOf ? kOf(pos, tier) : k[pos]), s: s[pos] });
    }
    return rows;
  }
  test('identical bases and s = 1: ρ = 1, every entry `same` with a zero delta, every cell identical → the family is do-not-wire (all `same`)', () => {
    const r = runF1({ rows: f1Synth(), s2026: ONES });
    assert.equal(r.entries.length, 16); assert.equal(r.folds, 4); assert.equal(r.rows, 512);
    assert.equal(r.entries.reduce((a, e) => a + e.rows, 0), 512, 'every row is evaluated exactly once');
    for (const e of r.entries) { assert.equal(e.same, true, e.key); assert.equal(e.label, 'SAME'); near(e.mean, 0, 1e-12, e.key); }
    assert.deepEqual(r.fullSample.league.rho, ONES);
    assert.equal(r.structural.ok, true);
    assert.equal(decideFamily({ entries: r.entries, pooled: r.pooled, structuralOk: r.structural.ok }).verdict, 'do-not-wire');
  });
  test('league outcomes 1.5× half with s = 1: the refit transports the baseline by ρ = 1.5 and beats the interim in every well-populated entry; the family wires', () => {
    const r = runF1({ rows: f1Synth({ k: { QB: 1.5, RB: 1.5, WR: 1.5, TE: 1.5 } }), s2026: ONES });
    for (const pos of POS) assert.equal(r.fullSample.league.rho[pos], 1.5);
    for (const pos of POS) near(r.fullSample.league.baselinePPG[pos], ROOKIE_BASELINE_PPG[pos] * 1.5, 1e-9);
    const r1 = r.entries.filter((e) => e.group === 'r1' || e.group === 'day2');
    assert.ok(r1.length === 8 && r1.every((e) => e.label === 'BEATS' && e.mean < 0), 'calibration 1.00 cells: ρ against s');
    assert.ok(r.pooled.ci99[1] < 0);
    const d = decideFamily({ entries: r.entries, pooled: r.pooled, structuralOk: r.structural.ok });
    assert.equal(d.verdict, 'wire');
    assert.deepEqual(Object.keys(r.constants), ['baselinePPG', 'calibration']);
    assert.deepEqual(Object.keys(r.constants.calibration), ['undrafted', 'day3']);
  });
  test('ρ cancels in a corrected cell: the effective level (baseline × calibration) is the cell\'s league ÷ half-projection ratio times the half baseline, whatever ρ', () => {
    const r = runF1({ rows: f1Synth({ k: { QB: 1.2, RB: 1.2, WR: 1.2, TE: 1.2 } }), s2026: ONES });
    const rows = f1Synth({ k: { QB: 1.2, RB: 1.2, WR: 1.2, TE: 1.2 } });
    for (const pos of POS) {
      const cell = rows.filter((x) => x.pos === pos && x.tier === null);
      const direct = ROOKIE_BASELINE_PPG[pos] * (cell.reduce((a, x) => a + x.oL, 0) / cell.reduce((a, x) => a + x.prH, 0));
      const e = r.entries.find((x) => x.key === `undrafted:${pos}`);
      assert.ok(e.sameDetail.effectiveLeague > 0);
      near(e.sameDetail.effectiveLeague, direct, 0.03 * direct, `undrafted:${pos}`);
    }
  });
  test('structural: a cell whose league ratio exceeds 1.00 is capped, so the corrected set differs from the half set → the check fails and the family is stop-and-report', () => {
    // only the undrafted WR cell realises 4× its half outcome; ρ(WR) averages over the position, so that cell's league ratio exceeds 1
    const r = runF1({ rows: f1Synth({ kOf: (pos, tier) => (pos === 'WR' && tier === null ? 4 : 1) }), s2026: ONES });
    assert.ok(r.structural.correctedHalf.includes('undrafted:WR') && !r.structural.correctedLeague.includes('undrafted:WR'));
    assert.equal(r.structural.ok, false);
    assert.equal(decideFamily({ entries: r.entries, pooled: r.pooled, structuralOk: r.structural.ok }).verdict, 'stop-and-report');
  });
  test('an entry with fewer than 30 rows is INSUFFICIENT (pooled, not labelled); a cell with no rows is reported empty', () => {
    const rows = f1Synth().filter((x) => !(x.tier === 'top-3' && x.pos === 'QB' && x.year > 2013)).filter((x) => x.tier !== 'r2');
    const r = runF1({ rows, s2026: ONES });
    const e = r.entries.find((x) => x.key === 'r1:QB');
    assert.equal(e.rows, 8); assert.equal(e.label, 'INSUFFICIENT');
    const empty = r.entries.find((x) => x.key === 'day2:RB');
    assert.equal(empty.rows, 0); assert.equal(empty.label, 'INSUFFICIENT'); assert.equal(empty.mean, null);
  });
  test('G0b: the recipe on the half rows reproduces a table it generated, names the cells it does not, and every row\'s projectedPPG must be round1(baseline × cappedProduct)', () => {
    const rows = f1Synth({ lowShare: 0.5 });
    const probe = g0bF1({ rows, shippedCalibration: { undrafted: { QB: -1, RB: -1, WR: -1, TE: -1 }, day3: { QB: -1, RB: -1, WR: -1, TE: -1 } } });
    assert.equal(probe.ok, false); assert.equal(probe.calibrationMismatches.length, 8);
    const recipe = { undrafted: {}, day3: {} };
    for (const m of probe.calibrationMismatches) { const [g, p] = m.cell.split(':'); recipe[g][p] = m.recipe; }
    assert.equal(g0bF1({ rows, shippedCalibration: recipe }).ok, true);
    recipe.day3.RB = round2(recipe.day3.RB + 0.01);
    assert.deepEqual(g0bF1({ rows, shippedCalibration: recipe }).calibrationMismatches.map((m) => m.cell), ['day3:RB']);
    recipe.day3.RB = round2(recipe.day3.RB - 0.01);
    const broken = rows.map((x, i) => (i === 0 ? { ...x, prH: round1(x.prH + 0.1) } : x));
    const b = g0bF1({ rows: broken, shippedCalibration: recipe });
    assert.equal(b.parityMismatches, 1); assert.equal(b.ok, false);
    // the panel's own constants: the shipped table is what the app pins
    assert.equal(ROOKIE_CALIBRATION.day3.QB, 1.0);
  });
  test('cappedProductOf is the uncorrected reconstruction\'s product', () => {
    near(cappedProductOf({ position: 'WR', ageAtDraft: 21, draftRound: 1, draftPick: 3 }), Math.min(1.85, 1.15 * 1.30));
    near(cappedProductOf({ position: 'WR', ageAtDraft: null, draftRound: null, draftPick: null }), 0.95);
  });
});

// ─── F2 ───────────────────────────────────────────────────────────────────────

describe('F2 — the ceiling', () => {
  function f2Synth({ k = 1, s = ONES } = {}) {
    const rnd = lcg(5), rows = [];
    let id = 0;
    for (const classYear of Array.from({ length: 13 }, (_, i) => 2013 + i)) for (const pos of POS) for (let i = 0; i < 12; i++) {
      const yH = (ROOKIE_BASELINE_PPG[pos] * 0.6) + rnd() * ROOKIE_BASELINE_PPG[pos] * 1.5;
      rows.push({ id: `c${id++}`, pos, classYear, yH, yL: yH * k, s: s[pos] });
    }
    return rows;
  }
  test('identical bases and s = 1: zero deltas, every entry `same`, 13 folds, 8 entries; held-out exceedance equal in both arms and near nominal', () => {
    const r = runF2({ rows: f2Synth(), quantile, s2026: ONES });
    assert.equal(r.entries.length, 8); assert.equal(r.folds, 13); assert.equal(r.rows, 13 * 4 * 12);
    for (const e of r.entries) { assert.equal(e.same, true, e.key); near(e.mean, 0, 1e-12); }
    for (const pos of POS) { assert.deepEqual(r.exceedance[pos].interim, r.exceedance[pos].refit); assert.ok(Math.abs(r.exceedance[pos].refit.knee - 0.1) < 0.08, pos); }
    assert.equal(r.structural.ok, true);
    assert.equal(decideFamily({ entries: r.entries, pooled: r.pooled, structuralOk: true }).verdict, 'do-not-wire');
  });
  test('league outcomes 1.4× half with s = 1: the refit quantiles beat the interim on both quantiles; the interim exceeds nominal; the family wires', () => {
    const r = runF2({ rows: f2Synth({ k: 1.4 }), quantile, s2026: ONES });
    assert.ok(r.entries.every((e) => e.label === 'BEATS' && e.mean < 0), JSON.stringify(r.entries.map((e) => [e.key, e.label])));
    for (const pos of POS) assert.ok(r.exceedance[pos].interim.knee > r.exceedance[pos].refit.knee);
    assert.ok(r.pooled.ci99[1] < 0);
    assert.equal(decideFamily({ entries: r.entries, pooled: r.pooled, structuralOk: r.structural.ok }).verdict, 'wire');
    assert.deepEqual(Object.keys(r.constants.ceiling.WR), ['knee', 'asymptote']);
    near(r.fullSample.league.WR.knee, round2(1.4 * r.fullSample.half.WR.knee), 0.011);
  });
  test('the interim arm is the in-fold half quantile × s(pos, class): with s = 1.4 and league = 1.4 × half the arms agree on each fold to 2-dp rounding', () => {
    const r = runF2({ rows: f2Synth({ k: 1.4, s: { QB: 1.4, RB: 1.4, WR: 1.4, TE: 1.4 } }), quantile, s2026: { QB: 1.4, RB: 1.4, WR: 1.4, TE: 1.4 } });
    for (const e of r.entries) near(e.mean, 0, 0.02, e.key);
  });
  test('structural: knee < asymptote at every position; the family fails it when a league position collapses to a point mass', () => {
    const rows = f2Synth().map((x) => (x.pos === 'TE' ? { ...x, yL: 5 } : x));
    const r = runF2({ rows, quantile, s2026: ONES });
    assert.equal(r.structural.kneeBelowAsymptote.TE, false); assert.equal(r.structural.ok, false);
    assert.equal(decideFamily({ entries: r.entries, pooled: r.pooled, structuralOk: r.structural.ok }).verdict, 'stop-and-report');
  });
  test('G0b reproduces a generated table and names the position that differs', () => {
    const rows = f2Synth();
    const probe = g0bF2({ rows, quantile, shipped: Object.fromEntries(POS.map((p) => [p, { knee: -1, asymptote: -1 }])) });
    assert.equal(probe.mismatches.length, 4);
    const shipped = Object.fromEntries(probe.mismatches.map((m) => [m.pos, { knee: m.recipe[0], asymptote: m.recipe[1] }]));
    assert.equal(g0bF2({ rows, quantile, shipped }).ok, true);
    shipped.RB = { ...shipped.RB, knee: shipped.RB.knee + 0.01 };
    assert.deepEqual(g0bF2({ rows, quantile, shipped }).mismatches.map((m) => m.pos), ['RB']);
  });
});

// ─── F3 ───────────────────────────────────────────────────────────────────────

describe('F3 — the QB starter level', () => {
  const GROUPS = ['top12', 'r1', 'day2', 'day3+'];
  // groupSizes: players per group; 8 seasons; each player-season has 6 games
  function f3Synth({ k = 1, sizes = { top12: 12, r1: 12, day2: 12, 'day3+': 12 } } = {}) {
    const games = [], units = [];
    let pid = 0;
    for (const g of GROUPS) for (let i = 0; i < sizes[g]; i++) {
      const S = 2013 + (i % 8), id = `q${pid++}`;
      const base = 12 + GROUPS.indexOf(g) * -1.5 + (i % 5) * 0.4;
      let sum = 0;
      for (let w = 1; w <= 6; w++) { const ptsH = round2(base + (w % 3) * 0.7); games.push({ pid: id, S, group: g, week: w, ptsH, ptsL: round2(ptsH * k) }); sum += round2(ptsH * k); }
      units.push({ pid: id, S, group: g, yL: sum / 6 });
    }
    return { games, units };
  }
  test('identical bases, s = 1: zero deltas, all four groups `same`; a group below 10 players is INSUFFICIENT but still `same`/reported', () => {
    const { games, units } = f3Synth({ sizes: { top12: 12, r1: 8, day2: 12, 'day3+': 12 } });
    const r = runF3({ games, units, sQB: () => 1, s2026QB: 1 });
    assert.equal(r.entries.length, 4);
    assert.equal(r.entries.find((e) => e.key === 'r1').insufficient, true);
    for (const e of r.entries) near(e.mean, 0, 1e-12, e.key);
    assert.ok(r.entries.every((e) => e.same));
    assert.equal(r.structural.ok, true);
    assert.equal(r.fullSample.unitsByGroup.r1, 8);
  });
  test('league points 1.3× half with s = 1: the refit level beats the interim; r1 (8 players) is not labelled; pooled 99% below 0 → wire', () => {
    const { games, units } = f3Synth({ k: 1.3, sizes: { top12: 12, r1: 8, day2: 12, 'day3+': 12 } });
    const r = runF3({ games, units, sQB: () => 1, s2026QB: 1 });
    assert.equal(r.entries.find((e) => e.key === 'r1').label, 'INSUFFICIENT');
    for (const g of ['top12', 'day2', 'day3+']) assert.equal(r.entries.find((e) => e.key === g).label, 'BEATS', g);
    assert.ok(r.pooled.ci99[1] < 0 && r.pooled.rows === units.length);
    const d = decideFamily({ entries: r.entries, pooled: r.pooled, structuralOk: r.structural.ok });
    assert.equal(d.verdict, 'wire'); assert.equal(d.labelled, 3);
    assert.deepEqual(Object.keys(r.constants.qbStarterPPG), GROUPS);
    near(r.fullSample.league.top12, round3(r.fullSample.half.top12 * 1.3), 0.002);
  });
  test('the level is levelTable (round3(round2(Σ pts) ÷ Σ games)) over the training seasons only; a group with no training games falls back to the pool (counted)', () => {
    const games = [
      { pid: 'a', S: 2013, group: 'top12', week: 1, ptsH: 10, ptsL: 10 }, { pid: 'a', S: 2013, group: 'top12', week: 2, ptsH: 20, ptsL: 20 }, { pid: 'a', S: 2013, group: 'top12', week: 3, ptsH: 30, ptsL: 30 },
      { pid: 'b', S: 2014, group: 'r1', week: 1, ptsH: 12, ptsL: 12 }, { pid: 'b', S: 2014, group: 'r1', week: 2, ptsH: 12, ptsL: 12 }, { pid: 'b', S: 2014, group: 'r1', week: 3, ptsH: 12, ptsL: 12 },
    ];
    const units = [{ pid: 'a', S: 2013, group: 'top12', yL: 20 }, { pid: 'b', S: 2014, group: 'r1', yL: 12 }];
    const r = runF3({ games, units, sQB: () => 1, s2026QB: 1 });
    assert.equal(r.fallbacks, 2, 'each unit\'s own group is absent from the other seasons');
    // fold 2013: pool of training = r1's 12.0; refit = interim = 12 → |20 − 12| both; fold 2014: pool = 20
    near(r.entries.find((e) => e.key === 'top12').mean, 0);
    assert.equal(r.structural.ok, false, 'day2 and day3+ have no rookies');
    assert.equal(r.fullSample.half.top12, 20);
  });
  test('G0b reproduces a generated table', () => {
    const { games } = f3Synth();
    const probe = g0bF3({ games, shipped: { top12: -1, r1: -1, day2: -1, 'day3+': -1 } });
    const shipped = Object.fromEntries(probe.mismatches.map((m) => [m.group, m.recipe]));
    assert.equal(g0bF3({ games, shipped }).ok, true);
    assert.equal(g0bF3({ games, shipped: { ...shipped, r1: shipped.r1 + 0.001 } }).mismatches[0].group, 'r1');
  });
});

// ─── F4 ───────────────────────────────────────────────────────────────────────

describe('F4 — the rookie total factor', () => {
  function f4Synth({ real = 0.8, realL = 0.8, scale = 1.1 } = {}) {
    const rnd = lcg(3), rows = [];
    let id = 0;
    for (const season of [2013, 2014, 2015, 2016, 2017]) for (const group of ['day3', 'undrafted']) for (let i = 0; i < 20; i++) {
      const predH = 10 + rnd() * 90;
      const predS = predH * scale;
      rows.push({ id: `r${id++}`, season, group, predH, realH: predH * real * (0.7 + rnd() * 0.6), predS, realL: predS * realL * (0.7 + rnd() * 0.6) });
    }
    return rows;
  }
  test('both arms recover the same ratio (the points mix cancels): factors `same`, every entry `same` → do-not-wire', () => {
    const rows = f4Synth();
    // make the league realised an exact multiple of the shipped composition by the half ratio
    const exact = rows.map((r) => ({ ...r, realL: r.realH * 1.1 }));
    const r = runF4({ rows: exact });
    assert.equal(r.entries.length, 2); assert.equal(r.folds, 5);
    for (const e of r.entries) { assert.equal(e.same, true); near(e.mean, 0, 1e-9, e.key); }
    assert.equal(decideFamily({ entries: r.entries, pooled: r.pooled }).verdict, 'do-not-wire');
  });
  test('league realised totals at 0.6 of the composition (half factor 0.8): the refit factor beats the half one in both groups; the family wires', () => {
    const r = runF4({ rows: f4Synth({ real: 0.8, realL: 0.6 }) });
    assert.ok(r.entries.every((e) => e.label === 'BEATS' && !e.same), JSON.stringify(r.entries.map((e) => [e.key, e.label, e.same])));
    near(r.fullSample.half.day3, 0.8, 0.08); near(r.fullSample.league.day3, 0.6, 0.06);
    assert.equal(decideFamily({ entries: r.entries, pooled: r.pooled }).verdict, 'wire');
    assert.deepEqual(Object.keys(r.constants.totalFactor), ['day3', 'undrafted']);
  });
  test('G0b: the loso.decision recipe on the half rows reproduces a generated factor pair', () => {
    const rows = f4Synth();
    const probe = g0bF4({ rows, shipped: { day3: -1, undrafted: -1 } });
    const shipped = Object.fromEntries(probe.mismatches.map((m) => [m.group, m.recipe]));
    assert.equal(g0bF4({ rows, shipped }).ok, true);
    assert.equal(g0bF4({ rows, shipped: { ...shipped, undrafted: round3(shipped.undrafted + 0.001) } }).mismatches[0].group, 'undrafted');
    assert.equal(ROOKIE_TOTAL_FACTOR.day3, 0.796);
  });
});

// ─── F5 ───────────────────────────────────────────────────────────────────────

describe('F5 — the position prior', () => {
  function f5Synth({ k = 1, s = ONES, perPos = 40 } = {}) {
    const rnd = lcg(9), rows = [];
    let id = 0;
    for (const pos of POS) for (let i = 0; i < perPos; i++) {
      const S = 2014 + (i % 6);
      const yH = 4 + rnd() * 10;
      rows.push({ id: `${pos}${id++}`, key: `${pos}${i}|${S}`, S, pos, age: 22 + (i % 3), pickForA: null, sm1: i % 4 === 0 ? null : { gamesPlayed: 6 + (i % 8), fantasyPoints: (6 + (i % 8)) * (5 + rnd() * 6) }, yH, yL: yH * k, s: s[pos] });
    }
    return rows;
  }
  test('only WR decides: entries for all four positions, QB/RB/TE flagged report-only, the family pool is the WR rows, constants carry wirePositions', () => {
    const rows = f5Synth({ k: 1.3 });
    const r = runF5({ rows, s2026: ONES });
    assert.deepEqual(r.entries.map((e) => [e.key, e.deciding]), [['QB', false], ['RB', false], ['WR', true], ['TE', false]]);
    assert.equal(r.pooled.rows, rows.filter((x) => x.pos === 'WR').length);
    assert.deepEqual(r.pooled.decidingPositions, ['WR']);
    assert.deepEqual(r.constants.wirePositions, ['WR']);
    assert.deepEqual(Object.keys(r.constants.positionPriorPPG), POS);
    const d = decideFamily({ entries: r.entries, pooled: r.pooled });
    assert.equal(r.entries.find((e) => e.key === 'WR').players, 40);
    assert.ok(['wire', 'do-not-wire'].includes(d.verdict));
  });
  test('the prior is the arm-A prior as live: the refit constant is round3(constant × ρA) read at scale 1; the interim is constant × s; ρA = Σ league ÷ Σ half nextPPG2', () => {
    const rows = f5Synth({ k: 1.3 });
    const r = runF5({ rows, s2026: ONES });
    assert.equal(r.fullSample.rho.WR, 1.3);
    assert.equal(r.fullSample.league.WR, round3(PROSPECT_MIRROR.positionPriorPPG.WR * 1.3));
    assert.equal(r.fullSample.interim.WR, round3(PROSPECT_MIRROR.positionPriorPPG.WR));
    // the loss reproduces by hand for one fold: leave out 2014 and recompute |yL − prior| for the first WR row of that season
    const train = rows.filter((x) => x.S !== 2014);
    const rho = ratioByPosition(train, (x) => x.yL, (x) => x.yH);
    const row = rows.find((x) => x.S === 2014 && x.pos === 'WR');
    const constL = round3(PROSPECT_MIRROR.positionPriorPPG.WR * rho.WR);
    const priorL = prospectPriorPPG({ position: 'WR', age: row.age, pick: row.pickForA, sm1: row.sm1, basisScale: 1, positionPriorPPG: { WR: constL } }).prospectPPG;
    const priorI = prospectPriorPPG({ position: 'WR', age: row.age, pick: row.pickForA, sm1: row.sm1, basisScale: row.s }).prospectPPG;
    assert.ok(Number.isFinite(priorL) && Number.isFinite(priorI) && priorL !== priorI);
  });
  test('identical bases and s = 1: every entry `same`, zero deltas → do-not-wire', () => {
    const r = runF5({ rows: f5Synth(), s2026: ONES });
    for (const e of r.entries) { assert.equal(e.same, true); near(e.mean, 0, 1e-12); }
    assert.equal(decideFamily({ entries: r.entries, pooled: r.pooled }).verdict, 'do-not-wire');
  });
  test('league outcomes 1.5× half with s = 1 and a thin-evidence population: the transported WR prior beats the interim; fewer than 30 WR players is INSUFFICIENT', () => {
    const rows = f5Synth({ k: 1.5, perPos: 60 }).map((x) => ({ ...x, sm1: null }));   // no S-1 evidence → the prior itself is the prediction
    const r = runF5({ rows, s2026: ONES });
    assert.equal(r.entries.find((e) => e.key === 'WR').label, 'BEATS');
    assert.ok(r.pooled.ci99[1] < 0);
    assert.equal(decideFamily({ entries: r.entries, pooled: r.pooled }).verdict, 'wire');
    const small = runF5({ rows: f5Synth({ k: 1.5, perPos: 20 }), s2026: ONES });
    assert.equal(small.entries.find((e) => e.key === 'WR').label, 'INSUFFICIENT');
    assert.equal(decideFamily({ entries: small.entries, pooled: small.pooled }).verdict, 'do-not-wire');
  });
});

// ─── live effect ──────────────────────────────────────────────────────────────

describe('liveEffect', () => {
  const factors = (over = {}) => ({ rookieMultiplierProduct: 1.2, draftCapitalStatus: 'matched', nflDraftTier: 'r2', qbTakeoverBasis: null, ...over });
  const row = (pid, proj, f) => [pid, { projection: { projectedPPG: proj, projectedGames: 12, projectedTotalPts: 100, factors: factors(f) } }];
  const recover = (f) => f.recoveredPosition ? { position: f.recoveredPosition, scale: 1.1 } : null;
  test('each family swapped alone into the interim reconstruction; chain rows and unrecoverable positions are excluded; a move below 0.1 does not count', () => {
    const rows = [
      row('a', 10, { recoveredPosition: 'WR' }),
      row('b', 10, { recoveredPosition: 'WR', draftCapitalStatus: 'undrafted', nflDraftTier: null }),
      row('c', 10, { recoveredPosition: 'WR', qbTakeoverBasis: 'chain' }),
      row('d', 10, {}),
      row('q', 10, { recoveredPosition: 'QB', qbStarterBasis: 'rookie:top12' }),
    ];
    const league = {
      F1: { baselinePPG: { QB: 14, RB: 10, WR: 9, TE: 6 }, calibration: ROOKIE_CALIBRATION },
      F2: { ceiling: { QB: { knee: 5, asymptote: 6 }, RB: { knee: 5, asymptote: 6 }, WR: { knee: 5, asymptote: 6 }, TE: { knee: 5, asymptote: 6 } } },
      F3: { qbStarterPPG: { top12: 20, r1: 18, day2: 16, 'day3+': 14 } },
      F4: { totalFactor: { day3: 0.5, undrafted: 0.5 } },
    };
    const live = liveEffect(rows, { league, recover });
    assert.equal(live.F1.rows, 3, 'a, b and q (c is chain, d unrecoverable)');
    assert.ok(live.F1.moved >= 1 && live.F1.meanMove > 0, 'the WR baseline 9 vs 7 × 1.1 = 7.7 raises both WR rows');
    assert.ok(live.F2.moved >= 1 && live.F2.meanMove < 0, 'a ceiling at 5-6 trims');
    assert.equal(live.F3.rows, 1); assert.ok(live.F3.moved === 1 && live.F3.meanMove > 0);
    assert.equal(live.F4.rows, 2, 'non-QB rows only');
    assert.ok(live.F4.meanMove < 0, 'the undrafted row halves (0.835 → 0.5)');
    const none = liveEffect(rows, { league: {}, recover });
    assert.deepEqual(Object.values(none).map((x) => x.rows), [0, 0, 0, 0]);
  });
});
