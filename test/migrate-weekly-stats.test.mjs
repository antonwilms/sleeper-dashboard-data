import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  attachWeeklyStats, assertStructuralGuards, migrateSeasonRows, migrateWeeklyStats, isMigrationRow,
} from '../scripts/migrate-weekly-stats.mjs';

const ws = (o = {}) => Array.from({ length: 18 }, (_, i) => o[i + 1] ?? 'X');
const NOOP = { validateNflSeason: () => {} };
const CTX = { relPath: 'nfl/season-totals/9999.json', year: 9999 };

// stored row: played weeks 1–2 (rec 3+4, rec_yd 40), plus excluded keys in stats
function stored(extra = {}) {
  return {
    stats: { gp: 2, gs: 2, pts_half_ppr: 16, rec: 7, rec_yd: 95, rec_lng: 30 },
    team: 'KC', gamesPlayed: 2, gamesStarted: 2, byeWeeks: 0, dnpWeeks: 0,
    weeklyPoints: { 1: 6, 2: 10 }, weeklyStatus: ws({ 1: 'P', 2: 'P' }),
    fantasyPoints: 16, scoringBasis: 'half_ppr', availability: { firstWeek: 1 },
    ...extra,
  };
}
const fresh = (over = {}) => ({ ...stored(), weeklyStats: { 1: { rec: 3, rec_yd: 40 }, 2: { rec: 4, rec_yd: 55 } }, ...over });

test('attach — a consistent fresh row attaches weeklyStats and changes nothing else', () => {
  const s = stored();
  const r = attachWeeklyStats(s, fresh());
  assert.equal(r.reason, null);
  assert.deepStrictEqual(r.row.weeklyStats, { 1: { rec: 3, rec_yd: 40 }, 2: { rec: 4, rec_yd: 55 } });
  const { weeklyStats, ...rest } = r.row;
  assert.deepStrictEqual(rest, s);
});

test('attach — reason missing / weeks / points / sums leaves the row unchanged', () => {
  const s = stored();
  assert.deepStrictEqual(attachWeeklyStats(s, undefined), { row: s, reason: 'missing' });
  assert.equal(attachWeeklyStats(s, fresh({ weeklyStatus: ws({ 1: 'P', 3: 'P' }) })).reason, 'weeks');
  assert.equal(attachWeeklyStats(s, fresh({ weeklyPoints: { 1: 6, 2: 11 } })).reason, 'points');
  assert.equal(attachWeeklyStats(s, fresh({ weeklyStats: { 1: { rec: 3, rec_yd: 40 }, 2: { rec: 4, rec_yd: 54 } } })).reason, 'sums');
  // a kept stored key absent from fresh weeklyStats is a sum mismatch too
  assert.equal(attachWeeklyStats(s, fresh({ weeklyStats: { 1: { rec: 3 }, 2: { rec: 4 } } })).reason, 'sums');
  // a fresh key the stored stats lack (absent = 0) is a sum mismatch
  assert.equal(attachWeeklyStats(s, fresh({ weeklyStats: { 1: { rec: 3, rec_yd: 40, rush_yd: 1 }, 2: { rec: 4, rec_yd: 55 } } })).reason, 'sums');
  assert.equal(attachWeeklyStats(s, fresh({ weeklyStatus: ws({ 1: 'P', 3: 'P' }) })).row, s);
});

test('attach — excluded stored keys (rec_lng, gp, pts_half_ppr) are ignored by the sum check', () => {
  assert.equal(attachWeeklyStats(stored(), fresh()).reason, null);
});

test('isMigrationRow — TEAM_* and gamesPlayed 0 are skipped', () => {
  assert.equal(isMigrationRow('TEAM_KC', stored()), false);
  assert.equal(isMigrationRow('p', stored({ gamesPlayed: 0 })), false);
  assert.equal(isMigrationRow('p', stored()), true);
});

test('migrateSeasonRows — counts attached/omitted by reason; TEAM_* and gp 0 rows untouched', () => {
  const team = { stats: { pts_allow: 3 }, gamesPlayed: 1, weeklyStatus: ws({ 1: 'P' }) };
  const idle = stored({ gamesPlayed: 0, weeklyStatus: ws() , weeklyPoints: {} });
  const before = { TEAM_KC: team, idle };
  const fr = {};
  for (let i = 0; i < 300; i++) { before[`p${i}`] = stored(); fr[`p${i}`] = fresh(); }
  before.bad = stored(); fr.bad = fresh({ weeklyPoints: { 1: 1, 2: 1 } });   // 1/301 < 0.5%? 0.33% → allowed
  const r = migrateSeasonRows(before, fr, CTX, NOOP);
  assert.equal(r.attached, 300);
  assert.deepStrictEqual(r.omitted, { missing: 0, weeks: 0, points: 1, sums: 0 });
  assert.equal(r.played, 301);
  assert.equal(r.after.TEAM_KC, team);
  assert.equal(r.after.idle, idle);
  assert.equal('weeklyStats' in r.after.bad, false);
});

test('migrateSeasonRows guard — omitted share above 0.5% throws', () => {
  const before = { a: stored(), b: stored() };
  assert.throws(() => migrateSeasonRows(before, { a: fresh() }, CTX, NOOP), /exceeds 0\.5%/);
});

test('migrateSeasonRows guard — validateNflSeason failure propagates', () => {
  const d = { validateNflSeason: () => { throw new Error('bad season'); } };
  assert.throws(() => migrateSeasonRows({ a: stored() }, { a: fresh() }, CTX, d), /bad season/);
});

test('migrateSeasonRows guard — idempotent: an existing field must re-derive deep-equal', () => {
  const ok = stored({ weeklyStats: fresh().weeklyStats });
  assert.doesNotThrow(() => migrateSeasonRows({ a: ok }, { a: fresh() }, CTX, NOOP));
  const drift = stored({ weeklyStats: { 1: { rec: 3, rec_yd: 40 }, 2: { rec: 4, rec_yd: 55, rush_yd: 0.5 } } });
  assert.throws(() => migrateSeasonRows({ a: drift }, { a: fresh() }, CTX, NOOP), /already carries weeklyStats/);
  const refused = stored({ weeklyStats: fresh().weeklyStats });
  assert.throws(() => migrateSeasonRows({ a: refused }, { a: fresh({ weeklyPoints: {} }) }, CTX, NOOP), /already carries weeklyStats/);
  // second pass over a first-pass result is a no-op
  const first = migrateSeasonRows({ a: stored() }, { a: fresh() }, CTX, NOOP).after;
  const second = migrateSeasonRows(first, { a: fresh() }, CTX, NOOP).after;
  assert.deepStrictEqual(second, first);
});

test('migrateWeeklyStats — dry-run writes nothing; needs --weeks-cache; failed week throws', async () => {
  const manifest = { files: { 'nfl/season-totals/2020.json': { inProgress: false }, 'nfl/season-totals/2026.json': { inProgress: true } } };
  const writes = [];
  const row = stored();
  const mk = failed => ({
    readManifest: () => manifest,
    readJson: () => ({ a: row }),
    fetchSeasonWeeks: async () => {
      const wk = Array.from({ length: 18 }, (_, i) => ({ week: i + 1, entries: [] }));
      wk[0].entries = [{ player_id: 'a', team: 'KC', stats: { gp: 1, rec: 3, rec_yd: 40, pts_half_ppr: 6 } }];
      wk[1].entries = [{ player_id: 'a', team: 'KC', stats: { gp: 1, rec: 4, rec_yd: 55, pts_half_ppr: 10 } }];
      if (failed) wk[4].failed = true;
      return wk;
    },
    writeJsonStable: (...a) => writes.push(a),
    updateManifestEntry: (...a) => writes.push(a),
    validateNflSeason: () => {},
  });
  await assert.rejects(migrateWeeklyStats({ deps: mk() }), /--weeks-cache/);
  const t = await migrateWeeklyStats({ weeksCache: '/x', dryRun: true, deps: mk() });
  assert.equal(t.length, 1);   // 2026 inProgress skipped
  assert.equal(t[0].attached, 1);
  assert.equal(t[0].written, false);
  assert.equal(writes.length, 0);
  await assert.rejects(migrateWeeklyStats({ weeksCache: '/x', dryRun: true, deps: mk(true) }), /week\(s\) 5 failed/);
  const w = await migrateWeeklyStats({ weeksCache: '/x', deps: mk() });
  assert.equal(w[0].written, true);
  assert.equal(writes.length, 2);
  assert.deepStrictEqual(writes[1][0], { path: 'nfl/season-totals/2020.json', recordCount: 1, inProgress: false, schemaVersion: 4 });
});

test('assertStructuralGuards — an extra id in `after` throws "row id set changed"', () => {
  const before = { a: stored() };
  const after = { a: stored(), b: stored() };
  assert.throws(() => assertStructuralGuards(before, after, CTX), /row id set changed/);
});

test('assertStructuralGuards — a missing id in `after` throws "row id set changed"', () => {
  const before = { a: stored(), b: stored() };
  const after = { a: stored() };
  assert.throws(() => assertStructuralGuards(before, after, CTX), /row id set changed/);
});

test('assertStructuralGuards — a changed non-weeklyStats field throws naming the field', () => {
  const before = { a: stored() };
  const after = { a: stored({ gamesPlayed: 3 }) };
  assert.throws(() => assertStructuralGuards(before, after, CTX), /a: field "gamesPlayed" changed/);
});

test('assertStructuralGuards — a difference only in weeklyStats passes', () => {
  const before = { a: stored() };
  const after = { a: stored({ weeklyStats: { 1: { rec: 3 } } }) };
  assert.doesNotThrow(() => assertStructuralGuards(before, after, CTX));
});
