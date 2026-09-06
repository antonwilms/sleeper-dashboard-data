/**
 * test/update-depth.test.mjs — updateDepth's branch-matrix net, mirroring
 * test/update-snaps.test.mjs's structure (this family shares its shape: no csv/currentSeason
 * input-injection seam, single-fetch on its own upstream release, every branch goes through
 * `deps`).
 *
 * `deps.readJson` dispatches on path — the crosswalk (nflverse/playerids.json), the existing
 * served file (nflverse/depth/<year>.json), and (for qb1Changed) the PRIOR season's served file
 * (nflverse/depth/<year-1>.json). No test writes into nflverse/ or manifest.json.
 *
 * Run with: node --test  (or npm test)
 */

import { test } from 'node:test';
import assert   from 'node:assert/strict';

import { updateDepth } from '../scripts/update-depth.mjs';
import { MIN_DEPTH_SEASON, DEPTH_ESPN_FROM_SEASON } from '../lib/nflverse.mjs';
import { spyDeps as sharedSpyDeps } from '../test-support/spy-deps.mjs';

const LEGACY_HEADER =
  'season,club_code,week,game_type,depth_team,last_name,first_name,football_name,formation,' +
  'gsis_id,jersey_number,position,elias_id,depth_position,full_name';

const ESPN_HEADER =
  'dt,team,player_name,espn_id,gsis_id,pos_grp_id,pos_grp,pos_id,pos_name,pos_abb,pos_slot,pos_rank';

const GAMES_HEADER = 'game_id,season,game_type,week,gameday,weekday';

const TEAM32 = [
  'ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND',
  'JAX','KC','LA','LAC','LV','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SEA','SF',
  'TB','TEN','WAS',
];

/** The era-accurate 32 codes for `season` (mirrors lib/validate.mjs validateDepth's guard). */
function teamsForSeason(season) {
  return TEAM32.map(t => {
    if (t === 'LA' && season <= 2015) return 'STL';
    if (t === 'LAC' && season <= 2016) return 'SD';
    if (t === 'LV' && season <= 2019) return 'OAK';
    return t;
  });
}

/** A legacy fixture with `weeksCount` REG weeks × 32 teams × 4 positions × `perPos` players. */
function makeLegacyCsv(season, weeksCount = 18, perPos = 3) {
  const rows = [LEGACY_HEADER];
  let n = 1;
  for (let w = 1; w <= weeksCount; w++) {
    for (const team of teamsForSeason(season)) {
      for (const pos of ['QB', 'RB', 'WR', 'TE']) {
        for (let p = 1; p <= perPos; p++) {
          const gsis = `00-${String(n++).padStart(7, '0')}`;
          rows.push(`${season},${team},${w},REG,${p},Last${n},First${n},First${n},Offense,${gsis},1,${pos},ELI${n},${pos},First${n} Last${n}`);
        }
      }
    }
  }
  return rows.join('\n');
}

function makeCrosswalkIds(csv) {
  // Build an `ids` map that resolves every gsis_id appearing in a legacy CSV fixture to a
  // deterministic sleeper_id (so join rate is always 1.0 for these fixtures).
  const ids = {};
  for (const line of csv.split('\n').slice(1)) {
    if (!line.trim()) continue;
    const gsis = line.split(',')[9];
    if (gsis) ids[gsis] = { sleeperId: `s-${gsis}` };
  }
  return ids;
}

function spyDeps({ crosswalk = { ids: {}, bySleeper: {} }, dataPathResult = null, priorSeasonFile = null, gamesCsv = null, ...overrides } = {}, t) {
  const dataPath = /nflverse\/depth\/(\d+)\.json/;
  return sharedSpyDeps({
    readJson: (path) => {
      if (path === 'nflverse/playerids.json') return crosswalk;
      const m = dataPath.exec(path);
      if (m) {
        // The "current" season's own existing file, vs a PRIOR season's file for qb1Changed.
        if (overrides.__priorSeasonPath && path === overrides.__priorSeasonPath) return priorSeasonFile;
        return dataPathResult;
      }
      return null;
    },
    fetchSchedulesCsv: async () => gamesCsv,
    ...overrides,
  }, t);
}

// ═══════════════════════════════════════════════════════════════════
// not published (single-season path)
// ═══════════════════════════════════════════════════════════════════

test('updateDepth: fetchDepthChartsCsv returns null (deps) → season skipped, nothing written', async (t) => {
  const { deps, calls, logs } = spyDeps({ fetchDepthChartsCsv: async () => null, crosswalk: { ids: {}, bySleeper: { x: {} } } }, t);
  await updateDepth({ year: 2016, deps });
  assert.equal(calls.writeJsonStable.length, 0);
  assert.equal(calls.updateManifestEntry.length, 0);
  assert.ok(logs.includes('[depth] season=2016 not published yet — skipping'));
});

// ═══════════════════════════════════════════════════════════════════
// below-floor --year rejection (mirrors update-snaps.mjs's fix pass 1 item 3 pattern) —
// nflverse depth_charts carries REAL pre-2013 rows (unlike snaps' header-only 2012), so this
// must be enforced explicitly before the spine, not left to the "not published" branch.
// ═══════════════════════════════════════════════════════════════════

test('updateDepth: a --year below MIN_DEPTH_SEASON is rejected before the spine sees it', async () => {
  const { deps, calls } = spyDeps({
    fetchDepthChartsCsv: async () => { throw new Error('must not fetch — rejected before the spine'); },
  });
  await assert.rejects(() => updateDepth({ year: MIN_DEPTH_SEASON - 1, deps }), /below MIN_DEPTH_SEASON/);
  assert.equal(calls.writeJsonStable.length, 0);
});

// ═══════════════════════════════════════════════════════════════════
// missing crosswalk .ids
// ═══════════════════════════════════════════════════════════════════

test('updateDepth: missing crosswalk .ids throws on the real (non-dry-run) path', async () => {
  const { deps } = spyDeps({ fetchDepthChartsCsv: async () => makeLegacyCsv(2016), readJson: () => null });
  await assert.rejects(() => updateDepth({ year: 2016, dryRun: false, deps }), /playerids\.json not found/);
});

test('updateDepth: missing crosswalk .ids is non-fatal under --dry-run', async () => {
  const { deps, calls } = spyDeps({ fetchDepthChartsCsv: async () => makeLegacyCsv(2016), readJson: () => null });
  await assert.doesNotReject(() => updateDepth({ year: 2016, dryRun: true, deps }));
  assert.equal(calls.writeJsonStable.length, 0);
});

// ═══════════════════════════════════════════════════════════════════
// finding 3b — ESPN-era season with an absent/empty bySleeper hard-errors, even though a
// legacy-era season (no espn_id fallback needed) never checks for it
// ═══════════════════════════════════════════════════════════════════

test('updateDepth: an ESPN-era season with bySleeper absent throws (finding 3b, test 12)', async () => {
  const csv = ESPN_HEADER + '\n2025-09-08 07:16:08,KC,John Doe,1,00-0000001,1,offense,1,Quarterback,QB,QB,1';
  const { deps } = spyDeps({
    fetchDepthChartsCsv: async () => csv,
    crosswalk: { ids: {} }, // no bySleeper at all
    gamesCsv: GAMES_HEADER + '\ng1,2025,REG,1,2025-09-08,Monday',
  });
  await assert.rejects(() => updateDepth({ year: DEPTH_ESPN_FROM_SEASON, deps }), /missing bySleeper/);
});

test('updateDepth: an ESPN-era season with bySleeper present but EMPTY throws (finding 3b)', async () => {
  const csv = ESPN_HEADER + '\n2025-09-08 07:16:08,KC,John Doe,1,00-0000001,1,offense,1,Quarterback,QB,QB,1';
  const { deps } = spyDeps({
    fetchDepthChartsCsv: async () => csv,
    crosswalk: { ids: {}, bySleeper: {} },
    gamesCsv: GAMES_HEADER + '\ng1,2025,REG,1,2025-09-08,Monday',
  });
  await assert.rejects(() => updateDepth({ year: DEPTH_ESPN_FROM_SEASON, deps }), /missing bySleeper/);
});

test('updateDepth: a legacy-era season never requires bySleeper', async (t) => {
  // MIN_DEPTH_SEASON (the floor) so qb1Changed short-circuits to null — no prior-file read.
  const csv = makeLegacyCsv(MIN_DEPTH_SEASON);
  const { deps } = spyDeps({
    fetchDepthChartsCsv: async () => csv,
    crosswalk: { ids: makeCrosswalkIds(csv) }, // no bySleeper key at all
  }, t);
  await assert.doesNotReject(() => updateDepth({ year: MIN_DEPTH_SEASON, deps }));
});

// ═══════════════════════════════════════════════════════════════════
// missing schedule file (ESPN-era only) throws rather than falling back (test 7)
// ═══════════════════════════════════════════════════════════════════

test('updateDepth: ESPN-era season with fetchSchedulesCsv returning null throws rather than falling back', async () => {
  const csv = ESPN_HEADER + '\n2025-09-08 07:16:08,KC,John Doe,1,00-0000001,1,offense,1,Quarterback,QB,QB,1';
  const { deps } = spyDeps({
    fetchDepthChartsCsv: async () => csv,
    crosswalk: { ids: {}, bySleeper: { x: { espnId: '1' } } },
    gamesCsv: null,
  });
  await assert.rejects(() => updateDepth({ year: DEPTH_ESPN_FROM_SEASON, deps }), /games\.csv fetch failed/);
});

// ═══════════════════════════════════════════════════════════════════
// era dispatch — a legacy-era season never calls fetchSchedulesCsv; an ESPN-era one does
// ═══════════════════════════════════════════════════════════════════

test('updateDepth: era dispatch — legacy season never fetches the upstream schedule', async (t) => {
  const csv = makeLegacyCsv(MIN_DEPTH_SEASON);
  let scheduleFetched = false;
  const { deps } = spyDeps({
    fetchDepthChartsCsv: async () => csv,
    crosswalk: { ids: makeCrosswalkIds(csv) },
    fetchSchedulesCsv: async () => { scheduleFetched = true; return null; },
  }, t);
  await updateDepth({ year: MIN_DEPTH_SEASON, deps });
  assert.equal(scheduleFetched, false);
});

test('updateDepth: era dispatch — ESPN-era season fetches the upstream schedule for the gameday index', async (t) => {
  const csv = ESPN_HEADER + '\n2025-09-08 07:16:08,KC,John Doe,1,00-0000001,1,offense,1,Quarterback,QB,QB,1';
  let scheduleFetched = false;
  const { deps } = spyDeps({
    fetchDepthChartsCsv: async () => csv,
    crosswalk: { ids: { '00-0000001': { sleeperId: 's1' } }, bySleeper: { x: { espnId: '1' } } },
    fetchSchedulesCsv: async () => { scheduleFetched = true; return GAMES_HEADER + '\ng1,2025,REG,1,2025-09-08,Monday'; },
  }, t);
  // Below MIN_DEPTH_ROWS — will throw in validateDepth, but the schedule fetch already happened.
  await assert.rejects(() => updateDepth({ year: DEPTH_ESPN_FROM_SEASON, deps }));
  assert.equal(scheduleFetched, true);
});

// ═══════════════════════════════════════════════════════════════════
// dedup hit
// ═══════════════════════════════════════════════════════════════════

test('updateDepth: dedup hit — nothing written', async (t) => {
  const csv = makeLegacyCsv(MIN_DEPTH_SEASON);
  const ids = makeCrosswalkIds(csv);
  const { aggregateDepthLegacy, joinDepthToSleeper } = await import('../lib/nflverse.mjs');
  const { weeks: raw } = aggregateDepthLegacy(csv, { season: MIN_DEPTH_SEASON });
  const { weeks } = joinDepthToSleeper(raw, { ids });
  const { deps, calls, logs } = spyDeps({ fetchDepthChartsCsv: async () => csv, crosswalk: { ids }, dataPathResult: { weeks } }, t);
  await updateDepth({ year: MIN_DEPTH_SEASON, deps });
  assert.equal(calls.writeJsonStable.length, 0);
  assert.equal(calls.updateManifestEntry.length, 0);
  assert.ok(logs.includes(`[depth] Content identical to existing nflverse/depth/${MIN_DEPTH_SEASON}.json — no change.`));
});

// ═══════════════════════════════════════════════════════════════════
// dry-run exits BEFORE the force gate
// ═══════════════════════════════════════════════════════════════════

test('updateDepth: --dry-run on a changed past season reports a plan, does not throw', async (t) => {
  const csv = makeLegacyCsv(MIN_DEPTH_SEASON);
  const { deps, calls, logs } = spyDeps({
    fetchDepthChartsCsv: async () => csv,
    crosswalk: { ids: makeCrosswalkIds(csv) },
    dataPathResult: { weeks: { 1: { X: { QB: ['1'] } } } },
  }, t);
  await assert.doesNotReject(() => updateDepth({ year: MIN_DEPTH_SEASON, dryRun: true, force: false, deps }));
  assert.equal(calls.writeJsonStable.length, 0);
  assert.ok(logs.some(l => l.startsWith(`[depth] [dry-run] would write nflverse/depth/${MIN_DEPTH_SEASON}.json:`)));
  assert.ok(logs.some(l => l.includes('needs --force to write for real')));
});

// ═══════════════════════════════════════════════════════════════════
// force gate (non-dry-run)
// ═══════════════════════════════════════════════════════════════════

test('updateDepth: force gate throws on a changed past season without --force', async () => {
  const csv = makeLegacyCsv(MIN_DEPTH_SEASON);
  const { deps } = spyDeps({
    fetchDepthChartsCsv: async () => csv,
    crosswalk: { ids: makeCrosswalkIds(csv) },
    dataPathResult: { weeks: { 1: { X: { QB: ['1'] } } } },
  });
  await assert.rejects(
    () => updateDepth({ year: MIN_DEPTH_SEASON, dryRun: false, force: false, deps }),
    new RegExp(`already exists for completed season ${MIN_DEPTH_SEASON}`)
  );
});

// ═══════════════════════════════════════════════════════════════════
// write path (legacy) — full envelope, qb1Changed=null at MIN_DEPTH_SEASON
// ═══════════════════════════════════════════════════════════════════

test('updateDepth: write path (legacy, floor season) — envelope shape, qb1Changed is null at MIN_DEPTH_SEASON', async (t) => {
  const csv = makeLegacyCsv(MIN_DEPTH_SEASON);
  const { deps, calls, logs } = spyDeps({ fetchDepthChartsCsv: async () => csv, crosswalk: { ids: makeCrosswalkIds(csv) } }, t);
  await updateDepth({ year: MIN_DEPTH_SEASON, dryRun: false, deps });

  assert.equal(calls.writeJsonStable.length, 1);
  const [path, body] = calls.writeJsonStable[0];
  assert.equal(path, `nflverse/depth/${MIN_DEPTH_SEASON}.json`);
  assert.deepEqual(
    Object.keys(body).sort(),
    ['generatedAt', 'outOfWindow', 'playerCount', 'qb1Changed', 'rowCount', 'schemaVersion', 'season', 'unmapped', 'week1Qb1', 'weeks'].sort()
  );
  assert.equal(body.qb1Changed, null);
  assert.equal(body.unmapped, 0);
  assert.equal(body.outOfWindow, 0);
  assert.ok(body.rowCount > 0);

  assert.equal(calls.updateManifestEntry.length, 1);
  assert.equal(calls.updateManifestEntry[0][0].inProgress, false);

  const idxWrite    = logs.findIndex(l => l.startsWith(`[depth] Wrote nflverse/depth/${MIN_DEPTH_SEASON}.json`));
  const idxManifest = logs.indexOf('[depth] Manifest updated');
  assert.notEqual(idxWrite, -1, 'afterWrite log missing');
  assert.notEqual(idxManifest, -1, 'afterManifest log missing');
  assert.ok(idxWrite < idxManifest, 'afterWrite must log before afterManifest');
});

// ═══════════════════════════════════════════════════════════════════
// qb1Changed derivation — test 5: changed, unchanged, missing prior file throws (test 13)
// ═══════════════════════════════════════════════════════════════════

test('updateDepth: qb1Changed — a non-floor season compares against the PRIOR season\'s served week1Qb1', async (t) => {
  const season = MIN_DEPTH_SEASON + 1;
  const csv = makeLegacyCsv(season);
  const ids = makeCrosswalkIds(csv);
  // Build the true week1Qb1 for this fixture so we can construct a deliberately different prior file.
  const { aggregateDepthLegacy, joinDepthToSleeper } = await import('../lib/nflverse.mjs');
  const { weeks: raw } = aggregateDepthLegacy(csv, { season });
  const { weeks } = joinDepthToSleeper(raw, { ids });
  const week1Qb1 = {};
  for (const [team, posMap] of Object.entries(weeks['1'])) week1Qb1[team] = (posMap.QB || [])[0] ?? null;

  const priorPath = `nflverse/depth/${season - 1}.json`;
  const priorDifferent = { week1Qb1: Object.fromEntries(Object.keys(week1Qb1).map(t => [t, 'someone-else'])) };

  const { deps, calls } = spyDeps({
    fetchDepthChartsCsv: async () => csv,
    crosswalk: { ids },
    __priorSeasonPath: priorPath,
    priorSeasonFile: priorDifferent,
  }, t);
  await updateDepth({ year: season, deps });
  const [, body] = calls.writeJsonStable[0];
  for (const t of Object.keys(week1Qb1)) {
    assert.equal(body.qb1Changed[t], week1Qb1[t] !== 'someone-else');
  }
});

test('updateDepth: qb1Changed — a missing prior season file for a non-floor season throws (test 13)', async (t) => {
  const season = MIN_DEPTH_SEASON + 1;
  const csv = makeLegacyCsv(season);
  const { deps } = spyDeps({
    fetchDepthChartsCsv: async () => csv,
    crosswalk: { ids: makeCrosswalkIds(csv) },
    // readJson for the prior path falls through to the generic dataPath branch, returning
    // dataPathResult (null by default) — simulating a genuinely missing prior file.
  }, t);
  await assert.rejects(() => updateDepth({ year: season, deps }), /missing prior season file/);
});

// ═══════════════════════════════════════════════════════════════════
// --all fetches per season, via deps; setStepOutput single-season only
// ═══════════════════════════════════════════════════════════════════

test('updateDepth --all: fetches once per season via deps.fetchDepthChartsCsv', async () => {
  const seen = [];
  const { deps } = spyDeps({
    fetchCurrentNflSeason: async () => MIN_DEPTH_SEASON,
    fetchDepthChartsCsv: async (season) => { seen.push(season); return null; },
  });
  await updateDepth({ all: true, deps });
  assert.deepEqual(seen, [MIN_DEPTH_SEASON]);
});

test('updateDepth: single-season mode calls setStepOutput(\'season\', year); --all does not', async (t) => {
  const csv = makeLegacyCsv(MIN_DEPTH_SEASON);
  const { deps, calls } = spyDeps({ fetchDepthChartsCsv: async () => csv, crosswalk: { ids: makeCrosswalkIds(csv) } }, t);
  await updateDepth({ year: MIN_DEPTH_SEASON, deps });
  assert.deepEqual(calls.setStepOutput, [['season', MIN_DEPTH_SEASON]]);
});

test('updateDepth --all: does not call setStepOutput (manual backfill — no purge target)', async () => {
  const { deps, calls } = spyDeps({
    fetchCurrentNflSeason: async () => MIN_DEPTH_SEASON,
    fetchDepthChartsCsv: async () => null,
  });
  await updateDepth({ all: true, deps });
  assert.deepEqual(calls.setStepOutput, []);
});
