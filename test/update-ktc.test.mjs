/**
 * test/update-ktc.test.mjs — Unit tests for spearmanRho, ktcOrderingGuard,
 * the strengthened validateKtc, checkKtcLandscape and the retry-week check.
 *
 * Run with: node --test  (or npm test)
 */

import { test } from 'node:test';
import assert   from 'node:assert/strict';

import {
  spearmanRho,
  ktcOrderingGuard,
  updateKtc,
  weekStartUtc,
  ktcCapturedThisWeek,
  ktcWeekStep,
  KTC_ORDERING_THRESHOLD,
  KTC_MIN_OVERLAP,
} from '../scripts/update-ktc.mjs';
import { validateKtc, checkKtcLandscape, KTC_LANDSCAPE_TOP_N, KTC_MIN_TOP_QBS } from '../lib/validate.mjs';
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
  // Five more QBs at ranks 16–20: a superflex-shaped top 50 (10 QBs) so the landscape
  // check passes on the base board.
  for (let i = 15; i < 300; i++)
    players.push(i < 20 ? mk(`QB${i}`, 9999 - i, 'QB') : mk(`WR${i}`, 9999 - i));
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
  // Change slots 15+ (the five extra QBs, then WRs) so the first 15 rows keep the
  // QB/RB/TE ≥5 minimums intact.
  // validBase() is now 336 rows (300 skill + 36 picks); need > 168 unrecognized
  // to cross the 50% threshold — 169/336 ≈ 50.3%.
  for (let i = 15; i < 15 + 169; i++) players[i].position = 'XYZ';
  assert.throws(() => validateKtc(players), /unrecognized position/i);
});

// ─── frozen-snapshot regression (the incident, pinned) ───────────────────────
// Reads test/fixtures/ktc/, never ktc/ — the weekly KTC workflow writes ktc/, so a live read
// breaks on the next capture (2026-10-12: ρ 0.9867, 3 sentinels). Fixtures are copies of
// ktc/snapshot-2026-09-{14,21,28}.json.

const FIXTURE_DIR = 'test/fixtures/ktc';
const fixtureSnapshots = () => listDir(FIXTURE_DIR).filter(f => f.startsWith('snapshot-') && f.endsWith('.json')).sort();

test('#18 frozen snapshots: two latest pass ordering guard (ρ > 0.99)', () => {
  const snapshotFiles = fixtureSnapshots();
  assert.ok(snapshotFiles.length >= 2, 'fixture pair missing');

  const [olderFile, newerFile] = snapshotFiles.slice(-2);
  const older = readJson(`${FIXTURE_DIR}/${olderFile}`);
  const newer = readJson(`${FIXTURE_DIR}/${newerFile}`);

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

// ─── checkKtcLandscape (QB-count heuristic — quarantines, never throws) ──────

/**
 * validBase() with its QBs replaced: `k` QBs hold the top values (any names — the check
 * reads position only), the rest of 10 sit at the bottom so validateKtc's ≥5-QB floor holds.
 */
function boardWithTopQbs(k) {
  const players = validBase().filter(p => p.position !== 'QB');
  for (let i = 0; i < k; i++) players.push(mk(`Top QB${i}`, 9999 - i, 'QB'));
  for (let i = k; i < 10; i++) players.push(mk(`Filler QB${i}`, 100 - i, 'QB'));
  return players;
}

test('#23 checkKtcLandscape: base board (10 QBs in the top 50) passes', () => {
  const r = checkKtcLandscape(validBase());
  assert.equal(r.ok, true);
  assert.equal(r.qbCount, 10);
});

test('#23b checkKtcLandscape: exactly KTC_MIN_TOP_QBS QBs in the top 50 passes (boundary)', () => {
  assert.equal(KTC_MIN_TOP_QBS, 8);
  assert.equal(KTC_LANDSCAPE_TOP_N, 50);
  const r = checkKtcLandscape(boardWithTopQbs(8));
  assert.equal(r.ok, true);
  assert.equal(r.qbCount, 8);
});

test('#24 checkKtcLandscape: 7 QBs in the top 50 fails with a reason, does not throw', () => {
  const r = checkKtcLandscape(boardWithTopQbs(7));
  assert.equal(r.ok, false);
  assert.equal(r.qbCount, 7);
  assert.match(r.reason, /only 7 QBs in the top 50/);
});

test('#24b checkKtcLandscape: window is top 50 — 8th QB at rank 50 counts, at rank 51 does not', () => {
  // 7 QBs at the top, 42 (or 43) skill rows, then the 8th QB.
  const rows = (offset) => [
    ...Array.from({ length: 7 }, (_, i) => mk(`QB${i}`, 9999 - i, 'QB')),
    ...Array.from({ length: 42 + offset }, (_, i) => mk(`Skill${i}`, 9000 - i, 'WR')),
    mk('QB7', 5000, 'QB'),
    ...Array.from({ length: 300 }, (_, i) => mk(`Rest${i}`, 1000 - i, 'WR')),
  ];
  assert.equal(checkKtcLandscape(rows(0)).ok, true);
  assert.equal(checkKtcLandscape(rows(1)).ok, false);   // 8th QB slides to rank 51
});

test('#24c checkKtcLandscape: a 1QB-format board (3 QBs in the top 50, as live format=1 on 2026-10-13) fails', () => {
  const r = checkKtcLandscape(boardWithTopQbs(3));
  assert.equal(r.ok, false);
  assert.match(r.reason, /wrong format \(1QB\)/);
});

test('#24d checkKtcLandscape: a position-selector break (no QB positions) fails', () => {
  const r = checkKtcLandscape(validBase().map(p => ({ ...p, position: null })));
  assert.equal(r.ok, false);
  assert.equal(r.qbCount, 0);
});

test('#25 validateKtc: a landscape miss does not throw (per-row validity only)', () => {
  assert.doesNotThrow(() => validateKtc(boardWithTopQbs(0)));
  assert.equal(checkKtcLandscape(boardWithTopQbs(0)).ok, false);
});

test('#26 frozen snapshots: every fixture snapshot passes the landscape check', () => {
  const files = fixtureSnapshots();
  assert.ok(files.length > 0);
  for (const f of files) {
    const r = checkKtcLandscape(readJson(`${FIXTURE_DIR}/${f}`));
    assert.equal(r.ok, true, `${f}: ${r.reason}`);
  }
});

test('#27 frozen snapshots: latest fixture has headroom (≥ floor + 4 QBs in the top 50)', () => {
  const files = fixtureSnapshots();
  const r = checkKtcLandscape(readJson(`${FIXTURE_DIR}/${files[files.length - 1]}`));
  assert.ok(r.qbCount >= KTC_MIN_TOP_QBS + 4, `only ${r.qbCount} QBs in the top 50: ${r.topQbs.join(', ')}`);
});

// ─── updateKtc: landscape miss routes to quarantine ──────────────────────────

/** In-memory I/O for updateKtc. `prev` is the last good snapshot (array). */
function fakeDeps({ fresh, prev = validBase(), hasRunBefore = true }) {
  const writes = {}, outputs = {}, manifest = [];
  return {
    writes, outputs, manifest,
    deps: {
      fetchSnapshot: async () => fresh,
      listDir: () => ['snapshot-2026-01-01.json', 'last-checked.json'],
      readJson: (p) => (p === 'ktc/snapshot-2026-01-01.json' ? prev
                      : p === 'ktc/last-checked.json' ? (hasRunBefore ? { identical: false } : null) : null),
      writeJsonStable: (p, v) => { writes[p] = v; },
      setStepOutput: (k, v) => { outputs[k] = v; },
      updateManifestEntry: (e) => { manifest.push(e); },
    },
  };
}

const quarantineKeys = w => Object.keys(w).filter(k => k.startsWith('ktc/quarantine/'));

test('#28 updateKtc: landscape miss → quarantined, CI outputs set, NOT written to ktc/ or manifest', async () => {
  const fresh = boardWithTopQbs(3);          // row-valid, ordering identical to prev, but a 1QB-shaped top 50
  const { deps, writes, outputs, manifest } = fakeDeps({ fresh, prev: fresh });
  await updateKtc({ dryRun: false, deps });
  assert.equal(outputs.quarantined, 'true');
  assert.match(outputs.quarantine_reason, /landscape: only 3 QBs in the top 50/);
  const q = quarantineKeys(writes);
  assert.equal(q.length, 2);
  assert.ok(q.some(k => /snapshot-\d{4}-\d\d-\d\d\.json$/.test(k)));
  const reasonFile = writes[q.find(k => k.endsWith('.reason.json'))];
  assert.equal(reasonFile.landscape.ok, false);
  assert.equal(reasonFile.landscape.qbCount, 3);
  assert.equal(reasonFile.recordCount, fresh.length);
  assert.equal(Object.keys(writes).filter(k => /^ktc\/snapshot-/.test(k)).length, 0, 'must not write to ktc/');
  assert.equal(manifest.length, 0, 'must not register in manifest');
  assert.equal(writes['ktc/last-checked.json'].quarantined, true);
});

test('#29 updateKtc: landscape miss quarantines even on a first run (no ordering baseline)', async () => {
  const fresh = boardWithTopQbs(3);
  const { deps, outputs } = fakeDeps({ fresh, hasRunBefore: false });
  await updateKtc({ dryRun: false, deps });
  assert.equal(outputs.quarantined, 'true');
});

test('#30 updateKtc: dry-run landscape miss warns, writes nothing, does not throw', async () => {
  const fresh = boardWithTopQbs(3);
  const { deps, writes, outputs } = fakeDeps({ fresh, prev: fresh });
  await updateKtc({ dryRun: true, deps });
  assert.deepEqual(writes, {});
  assert.deepEqual(outputs, {});
});

test('#31 updateKtc: healthy scrape with a changed value still writes ktc/ snapshot (no false quarantine)', async () => {
  const prev = validBase();
  const fresh = prev.map((p, i) => (i === 0 ? { ...p, value: p.value - 1 } : p));
  const { deps, writes, outputs, manifest } = fakeDeps({ fresh, prev });
  await updateKtc({ dryRun: false, deps });
  assert.equal(outputs.quarantined, undefined);
  assert.equal(quarantineKeys(writes).length, 0);
  assert.equal(Object.keys(writes).filter(k => /^ktc\/snapshot-/.test(k)).length, 1);
  assert.equal(manifest.length, 1);
});

test('#32 updateKtc: per-row validity failure still throws (not routed to quarantine)', async () => {
  const fresh = validBase();
  fresh[fresh.length - 1].name = '';
  const { deps, writes } = fakeDeps({ fresh });
  await assert.rejects(() => updateKtc({ dryRun: false, deps }), /empty.*name/i);
  assert.deepEqual(writes, {});
});

test('#33 updateKtc: ordering-guard trip and landscape miss share ONE quarantine with both reasons', async () => {
  const prev = validBase();
  const fresh = blockShift(boardWithTopQbs(3), Math.floor(prev.length / 2));
  const { deps, outputs, writes } = fakeDeps({ fresh, prev });
  await updateKtc({ dryRun: false, deps });
  assert.match(outputs.quarantine_reason, /landscape:.*\| ordering:/);
  assert.equal(quarantineKeys(writes).length, 2);
});

// ─── retry week: ktcCapturedThisWeek / ktcWeekStep ───────────────────────────
// 2026-10-05 was a Monday; 10-07 a Wednesday; 10-04 a Sunday.

const at = iso => new Date(iso);

test('#34 weekStartUtc: Monday maps to itself, Wednesday and Sunday to their Monday', () => {
  assert.equal(weekStartUtc(at('2026-10-05T13:17:00Z')).toISOString(), '2026-10-05T00:00:00.000Z');
  assert.equal(weekStartUtc(at('2026-10-07T13:17:00Z')).toISOString(), '2026-10-05T00:00:00.000Z');
  assert.equal(weekStartUtc(at('2026-10-04T23:59:00Z')).toISOString(), '2026-09-28T00:00:00.000Z');
});

test('#35 ktcCapturedThisWeek: Tue/Wed retry skips after a clean Monday (new snapshot or identical check)', () => {
  const wed = at('2026-10-07T13:17:00Z');
  assert.equal(ktcCapturedThisWeek({ checkedAt: '2026-10-05T21:44:31Z', identical: false, file: 'ktc/snapshot-2026-10-05.json' }, wed), true);
  assert.equal(ktcCapturedThisWeek({ checkedAt: '2026-10-05T00:00:00Z', identical: true }, wed), true);
});

test('#36 ktcCapturedThisWeek: retries run when Monday failed, crashed or quarantined', () => {
  const tue = at('2026-10-06T13:17:00Z');
  // the 10-05 incident: no step ran, last-checked still from the previous Monday
  assert.equal(ktcCapturedThisWeek({ checkedAt: '2026-09-28T20:07:40Z', identical: false }, tue), false);
  assert.equal(ktcCapturedThisWeek({ checkedAt: '2026-10-04T23:59:59Z', identical: true }, tue), false);   // Sunday = last week
  assert.equal(ktcCapturedThisWeek({ checkedAt: '2026-10-05T14:00:00Z', quarantined: true }, tue), false);
  assert.equal(ktcCapturedThisWeek(null, tue), false);
  assert.equal(ktcCapturedThisWeek({ checkedAt: 'not a date' }, tue), false);
});

test('#37 ktcCapturedThisWeek: the Monday run itself never skips on last week\'s check', () => {
  assert.equal(ktcCapturedThisWeek({ checkedAt: '2026-09-29T02:00:00Z', identical: false }, at('2026-10-05T13:17:00Z')), false);
});

test('#38 ktcWeekStep: reads ktc/last-checked.json and sets the captured output', () => {
  const outputs = {};
  const reads = [];
  const captured = ktcWeekStep({
    read: (p) => { reads.push(p); return { checkedAt: '2026-10-06T13:20:00Z', identical: false }; },
    setOutput: (k, v) => { outputs[k] = v; },
    now: at('2026-10-07T13:17:00Z'),
  });
  assert.deepEqual(reads, ['ktc/last-checked.json']);
  assert.equal(captured, true);
  assert.deepEqual(outputs, { captured: 'true' });

  const outputs2 = {};
  ktcWeekStep({ read: () => null, setOutput: (k, v) => { outputs2[k] = v; }, now: at('2026-10-07T13:17:00Z') });
  assert.deepEqual(outputs2, { captured: 'false' });
});
