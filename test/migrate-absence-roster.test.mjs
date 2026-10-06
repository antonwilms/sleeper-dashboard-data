/**
 * test/migrate-absence-roster.test.mjs — absence-classification-c.md §2.2 (MIG-1..MIG-4).
 * Injected I/O over a small in-memory repo; the real classifyAbsences is used except in MIG-1.
 *
 * Run with: node --test  (or npm test)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { migrateAbsenceRoster, assertCorrectionGuards } from '../scripts/migrate-absence-roster.mjs';
import { computeAvailability } from '../lib/sleeper.mjs';

const W = (...idx) => { const a = Array(18).fill('X'); idx.forEach(i => { a[i] = 'P'; }); return a; };
const row = (team, ws, dnp = 0) => ({
  team, weeklyStatus: ws, gamesPlayed: ws.filter(s => s === 'P').length, byeWeeks: 0, dnpWeeks: dnp,
  availability: computeAvailability(ws), weeklyPoints: {}, stats: { rec: 1 }, fantasyPoints: 1,
});

// Two teams that play weeks 1–2; player 'a' is absent in week 2 and listed INA by KC.
function season() {
  return {
    TEAM_KC: row('KC', W(0, 1)),
    TEAM_SF: row('SF', W(0, 1)),
    a: row('KC', W(0)),
    b: row('SF', W(0, 1)),
  };
}
const ROSTER = { players: { a: { 2: [['KC', 'INA']] } } };

function repo({ inProgress2022 = false } = {}) {
  const files = {
    'nfl/season-totals/2015.json': season(),
    'nfl/season-totals/2022.json': season(),
    'nfl/season-totals/2023.json': { ...season(), a: row('KC', W(0, 1)) },   // nothing to correct
    'nfl/season-totals/2026.json': season(),
    'nflverse/rosterweekly/2022.json': ROSTER,
    'nflverse/rosterweekly/2023.json': ROSTER,
    'nflverse/rosterweekly/2026.json': ROSTER,
  };
  const manifest = { files: {
    'nfl/season-totals/2015.json': { inProgress: false },
    'nfl/season-totals/2022.json': { inProgress: inProgress2022 },
    'nfl/season-totals/2023.json': { inProgress: false },
    'nfl/season-totals/2026.json': { inProgress: true },
    'nflverse/rosterweekly/2022.json': { inProgress: false },
  } };
  const writes = [];
  const manifestWrites = [];
  return {
    writes, manifestWrites, files,
    deps: {
      readManifest: () => manifest,
      readJson: p => (files[p] ? JSON.parse(JSON.stringify(files[p])) : null),
      writeJsonStable: (p, v, o) => { writes.push([p, o]); files[p] = JSON.parse(JSON.stringify(v)); },
      updateManifestEntry: e => manifestWrites.push(e),
      validateNflSeason: () => {},   // fixtures are far below the 400-player floor
    },
  };
}

test("MIG-1: the guards throw on a doctored classifier result — 'P' → 'D' and a stats change", () => {
  const before = season();
  const ctx = { relPath: 'nfl/season-totals/2022.json', year: 2022 };
  const noop = { validateNflSeason: () => {} };

  const badSlot = JSON.parse(JSON.stringify(before));
  badSlot.b.weeklyStatus[0] = 'D';     // was 'P'
  badSlot.b.dnpWeeks = 1;
  assert.throws(() => assertCorrectionGuards(before, badSlot, ctx, noop), /b: slot 1 went 'P' → 'D'/);

  const badStats = JSON.parse(JSON.stringify(before));
  badStats.a.weeklyStatus[1] = 'D';
  badStats.a.dnpWeeks = 1;
  badStats.a.stats.rec = 99;
  assert.throws(() => assertCorrectionGuards(before, badStats, ctx, noop), /a: field "stats" changed/);

  const badCount = JSON.parse(JSON.stringify(before));
  badCount.a.weeklyStatus[1] = 'D';    // dnpWeeks not bumped
  assert.throws(() => assertCorrectionGuards(before, badCount, ctx, noop), /dnpWeeks 0 → 0 does not match 1/);

  const lostRow = JSON.parse(JSON.stringify(before));
  delete lostRow.b;
  assert.throws(() => assertCorrectionGuards(before, lostRow, ctx, noop), /row id set changed/);

  // and it refuses to write when the injected classifier misbehaves
  const r = repo();
  const evil = (totals) => {
    const t = JSON.parse(JSON.stringify(totals));
    t.b.stats.rec = 7;
    return { totals: t, changedSlots: 1, changedRows: 1, byStatus: {} };
  };
  assert.throws(() => migrateAbsenceRoster({ deps: { ...r.deps, classifyAbsences: evil } }), /field "stats" changed/);
  assert.equal(r.writes.length, 0);
});

test('MIG-2: writes and manifest updates happen only for changed seasons; 2012–2015 are out of scope', () => {
  const r = repo();
  const table = migrateAbsenceRoster({ deps: r.deps });
  assert.deepEqual(table.map(t => [t.year, t.changedSlots, t.written]), [[2022, 1, true], [2023, 0, false]]);
  assert.deepEqual(r.writes, [['nfl/season-totals/2022.json', { minify: true }]]);
  assert.deepEqual(r.manifestWrites, [{ path: 'nfl/season-totals/2022.json', recordCount: 4, inProgress: false, schemaVersion: 4 }]);
  const after = r.files['nfl/season-totals/2022.json'];
  assert.equal(after.a.weeklyStatus[1], 'D');
  assert.equal(after.a.dnpWeeks, 1);
  assert.deepEqual(after.a.availability, computeAvailability(after.a.weeklyStatus));
});

test('MIG-2: --dry-run reports the change but writes nothing', () => {
  const r = repo();
  const table = migrateAbsenceRoster({ dryRun: true, deps: r.deps });
  assert.equal(table[0].changedSlots, 1);
  assert.equal(table[0].written, false);
  assert.equal(r.writes.length, 0);
  assert.equal(r.manifestWrites.length, 0);
});

test('MIG-2: a missing roster file throws', () => {
  const r = repo();
  delete r.files['nflverse/rosterweekly/2023.json'];
  assert.throws(() => migrateAbsenceRoster({ deps: r.deps }), /rosterweekly\/2023\.json missing/);
});

test('MIG-3: a second run is idempotent — 0 changed slots everywhere, no writes', () => {
  const r = repo();
  migrateAbsenceRoster({ deps: r.deps });
  r.writes.length = 0;
  r.manifestWrites.length = 0;
  const again = migrateAbsenceRoster({ deps: r.deps });
  assert.deepEqual(again.map(t => t.changedSlots), [0, 0]);
  assert.equal(r.writes.length, 0);
  assert.equal(r.manifestWrites.length, 0);
});

test('MIG-4: an inProgress season is skipped, even with a roster file and corrections available', () => {
  const r = repo({ inProgress2022: true });
  const table = migrateAbsenceRoster({ deps: r.deps });
  assert.deepEqual(table.map(t => t.year), [2023]);          // 2022 (in progress) and 2026 skipped
  assert.equal(r.writes.length, 0);
});
