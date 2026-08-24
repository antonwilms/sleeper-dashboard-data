/**
 * test/update-ktc.test.mjs — Unit tests for spearmanRho, ktcOrderingGuard,
 * and the strengthened validateKtc.
 *
 * Run with: node --test  (or npm test)
 */

import { test } from 'node:test';
import assert   from 'node:assert/strict';

import {
  spearmanRho,
  ktcOrderingGuard,
  KTC_ORDERING_THRESHOLD,
  KTC_MIN_OVERLAP,
} from '../scripts/update-ktc.mjs';
import { validateKtc } from '../lib/validate.mjs';
import { readJson, listDir } from '../lib/io.mjs';

// ─── helpers ─────────────────────────────────────────────────────────────────

const mk = (name, value, pos = 'WR') => ({ name, value, position: pos, team: 'X' });

const PICK_ROW_RE = /^(20\d\d) (Early|Mid|Late) (1st|2nd|3rd|4th)$/;

/** Realistic KTC draft-pick rows: one per (class × tier × round), position null. */
function mkPickRows(years = ['2026', '2027', '2028'], startValue = 3000) {
  const rows = [];
  let v = startValue;
  for (const y of years)
    for (const t of ['Early', 'Mid', 'Late'])
      for (const r of ['1st', '2nd', '3rd', '4th'])
        rows.push({ name: `${y} ${t} ${r}`, value: v--, position: null, team: null });
  return rows;
}

function validBase() {
  const players = [];
  const qbNames = ['Josh Allen', 'Drake Maye', 'Caleb Williams', 'Jalen Hurts', 'Jayden Daniels'];
  for (let i = 0; i < qbNames.length; i++)
    players.push(mk(qbNames[i], 9999 - i, 'QB'));
  for (let i = 0; i < 5; i++)
    players.push(mk(`RB${i}`, 9999 - 5 - i, 'RB'));
  for (let i = 0; i < 5; i++)
    players.push(mk(`TE${i}`, 9999 - 10 - i, 'TE'));
  for (let i = 15; i < 300; i++)
    players.push(mk(`WR${i}`, 9999 - i));
  players.push(...mkPickRows());
  return players;
}

/** Circular shift: player[i] gets the value that was at position (i+k) mod N. */
function blockShift(players, k) {
  const n = players.length;
  return players.map((p, i) => ({ ...p, value: players[(i + k) % n].value }));
}

// ─── spearmanRho ─────────────────────────────────────────────────────────────

test('#1 spearmanRho: identical arrays → rho ≈ 1, n = N', () => {
  const base = validBase();
  const { rho, n } = spearmanRho(base, base);
  assert.equal(n, base.length);
  assert.ok(rho > 0.9999, `expected rho > 0.9999, got ${rho}`);
});

test('#2 spearmanRho: rank-inverted values → rho ≈ −1', () => {
  const base = validBase();
  const reversed = base.map((p, i) => ({ ...p, value: base[base.length - 1 - i].value }));
  const { rho } = spearmanRho(base, reversed);
  assert.ok(rho < -0.9999, `expected rho < -0.9999, got ${rho}`);
});

test('#3 spearmanRho: all-equal new values → rho === null (zero variance)', () => {
  const base = validBase();
  const constant = base.map(p => ({ ...p, value: 5000 }));
  const { rho } = spearmanRho(base, constant);
  assert.equal(rho, null);
});

test('#4 spearmanRho: new shares only 2 of 50 names → n === 2', () => {
  const prev = Array.from({ length: 50 }, (_, i) => mk(`p${i}`, 9999 - i));
  const newArr = [
    mk('p0', 9000), mk('p1', 8000),
    ...Array.from({ length: 48 }, (_, i) => mk(`q${i}`, 7000 - i)),
  ];
  const { n } = spearmanRho(prev, newArr);
  assert.equal(n, 2);
});

test('#5 spearmanRho: < 2 common names → rho === null, small n', () => {
  const prev = Array.from({ length: 50 }, (_, i) => mk(`p${i}`, 9999 - i));
  const newArr = [
    mk('p0', 9000),
    ...Array.from({ length: 49 }, (_, i) => mk(`q${i}`, 8000 - i)),
  ];
  const { rho, n } = spearmanRho(prev, newArr);
  assert.equal(rho, null);
  assert.ok(n < 2);
});

// ─── ktcOrderingGuard ────────────────────────────────────────────────────────

test('#6 ktcOrderingGuard: legit recalibration passes (all values shifted, order preserved)', () => {
  const base = validBase();
  // Uniform -100 shift: ALL 300 values change (old count guard would trip) but rank order is identical.
  const recalibrated = base.map(p => ({ ...p, value: p.value - 100 }));
  const result = ktcOrderingGuard(base, recalibrated);
  assert.equal(result.ok, true);
  assert.ok(result.rho > KTC_ORDERING_THRESHOLD, `expected rho > ${KTC_ORDERING_THRESHOLD}, got ${result.rho}`);
});

test('#7 ktcOrderingGuard: selector breakage aborts (reversed ordering)', () => {
  const base = validBase();
  const reversed = base.map((p, i) => ({ ...p, value: base[base.length - 1 - i].value }));
  const result = ktcOrderingGuard(base, reversed);
  assert.equal(result.ok, false);
  assert.match(result.reason, /ordering collapsed/);
});

test('#8 ktcOrderingGuard: constant-value breakage aborts', () => {
  const base = validBase();
  const constant = base.map(p => ({ ...p, value: 5000 }));
  const result = ktcOrderingGuard(base, constant);
  assert.equal(result.ok, false);
  assert.match(result.reason, /zero variance/);
});

test('#9 ktcOrderingGuard: gross block misalignment aborts (ρ → negative)', () => {
  const base = validBase(); // 300 players
  // Shift by N/2=150: ρ = 1 − 6·150·150/(300²−1) ≈ −0.5
  const grossShift = blockShift(base, Math.floor(base.length / 2));
  const result = ktcOrderingGuard(base, grossShift);
  assert.equal(result.ok, false);
});

test('#10 ktcOrderingGuard: no prior snapshot → skipped', () => {
  const base = validBase();
  const resultNull = ktcOrderingGuard(null, base);
  assert.equal(resultNull.ok, true);
  assert.equal(resultNull.skipped, true);
  assert.match(resultNull.reason, /no prior/);

  const resultEmpty = ktcOrderingGuard([], base);
  assert.equal(resultEmpty.ok, true);
  assert.equal(resultEmpty.skipped, true);
  assert.match(resultEmpty.reason, /no prior/);
});

test('#11 ktcOrderingGuard: low overlap (player churn) → skipped', () => {
  const prev = Array.from({ length: 300 }, (_, i) => mk(`prev-p${i}`, 9999 - i));
  // 99 common players < KTC_MIN_OVERLAP (100) → guard skips
  const newArr = [
    ...Array.from({ length: KTC_MIN_OVERLAP - 1 }, (_, i) => mk(`prev-p${i}`, 9000 - i)),
    ...Array.from({ length: 201 }, (_, i) => mk(`new-q${i}`, 7000 - i)),
  ];
  const result = ktcOrderingGuard(prev, newArr);
  assert.equal(result.ok, true);
  assert.equal(result.skipped, true);
  assert.match(result.reason, /common players/);
});

test('#12 ktcOrderingGuard: threshold boundary — block-shifted ordering (ρ ≈ 0.92) fails at threshold 0.99', () => {
  // Block-shift by 4 on 300 players: ρ = 1 − 6·4·296/(300²−1) ≈ 0.921
  // Passes the default threshold (0.90) but fails at 0.99 → proves the threshold param is applied.
  const base = validBase();
  const shifted = blockShift(base, 4);
  const defaultResult = ktcOrderingGuard(base, shifted);
  assert.equal(defaultResult.ok, true, `expected ok:true at default threshold 0.90, got rho=${defaultResult.rho}`);
  const strictResult = ktcOrderingGuard(base, shifted, { threshold: 0.99 });
  assert.equal(strictResult.ok, false, `expected ok:false at threshold 0.99, got rho=${strictResult.rho}`);
});

// ─── validateKtc (Layer 1 strengthenings) ────────────────────────────────────

test('#13 validateKtc: clean validBase passes', () => {
  assert.doesNotThrow(() => validateKtc(validBase()));
});

test('#14 validateKtc: non-integer value throws', () => {
  const players = validBase();
  players[players.length - 1].value = 88.5;
  assert.throws(() => validateKtc(players), /value outside|integer/i);
});

test('#15 validateKtc: 36 null-position rows (RDP) pass (regression — Edit H deviation)', () => {
  const players = validBase();
  for (let i = 0; i < 36; i++) players[players.length - 1 - i].position = null;
  assert.doesNotThrow(() => validateKtc(players));
});

test('#16 validateKtc: empty name throws', () => {
  const players = validBase();
  players[players.length - 1].name = '';
  assert.throws(() => validateKtc(players), /empty.*name/i);
});

test('#17 validateKtc: >50% unrecognized positions throws', () => {
  const players = validBase();
  // Change WR-only slots (indices 15+) so QB/RB/TE minimums remain intact.
  // validBase() is now 336 rows (300 skill + 36 picks); need > 168 unrecognized
  // to cross the 50% threshold — 169/336 ≈ 50.3%.
  for (let i = 15; i < 15 + 169; i++) players[i].position = 'XYZ';
  assert.throws(() => validateKtc(players), /unrecognized position/i);
});

// ─── real-snapshot regression (the incident, as a living test) ───────────────

test('#18 real snapshots: two latest pass ordering guard (ρ > 0.99)', () => {
  const snapshotFiles = listDir('ktc')
    .filter(f => f.startsWith('snapshot-') && f.endsWith('.json'))
    .sort();

  if (snapshotFiles.length < 2) {
    console.log('[#18] fewer than 2 snapshots in ktc/ — skipping');
    return;
  }

  const [olderFile, newerFile] = snapshotFiles.slice(-2);
  const older = readJson(`ktc/${olderFile}`);
  const newer = readJson(`ktc/${newerFile}`);

  const result = ktcOrderingGuard(older, newer);
  assert.equal(result.ok, true, `expected ok:true, got: ${JSON.stringify(result)}`);
  assert.ok(
    result.skipped || result.rho > 0.99,
    `expected rho > 0.99, got ${result.rho}`,
  );
});

// ─── validateKtc: draft-pick row floor (D-4) ─────────────────────────────────

test('#19 validateKtc: realistic 36-row pick base (3 classes × 3 tiers × 4 rounds) passes the floor', () => {
  const players = [...validBase().filter(p => !PICK_ROW_RE.test(p.name)), ...mkPickRows()];
  assert.doesNotThrow(() => validateKtc(players));
});

test('#20 validateKtc: all draft-pick rows stripped throws', () => {
  const players = validBase().filter(p => !PICK_ROW_RE.test(p.name));
  assert.throws(() => validateKtc(players), /draft-pick rows/i);
});

test('#21 validateKtc: base missing only round-4 pick rows throws', () => {
  const players = validBase().filter(p => !/ 4th$/.test(p.name));
  assert.throws(() => validateKtc(players), /round 4th/i);
});

test('#22 validateKtc: a hypothetical 4th draft class (48 pick rows) still passes — floor, not equality', () => {
  const players = [
    ...validBase().filter(p => !PICK_ROW_RE.test(p.name)),
    ...mkPickRows(['2026', '2027', '2028', '2029']),
  ];
  assert.doesNotThrow(() => validateKtc(players));
});
