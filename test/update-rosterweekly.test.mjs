/**
 * test/update-rosterweekly.test.mjs — updateRosterWeekly's branch matrix (R-3), mirroring
 * test/update-snaps.test.mjs: every branch goes through injected `deps`; no test writes into
 * nflverse/ or manifest.json.
 *
 * Run with: node --test  (or npm test)
 */

import { test } from 'node:test';
import assert   from 'node:assert/strict';

import { updateRosterWeekly, playersHash } from '../scripts/update-rosterweekly.mjs';
import { parseRosterWeekly, MIN_ROSTERWEEKLY_SEASON, MIN_ROSTERWEEKLY_WEEK_ROWS } from '../lib/nflverse.mjs';
import { spyDeps as sharedSpyDeps } from '../test-support/spy-deps.mjs';

const HEADER = 'season,team,position,status,gsis_id,sleeper_id,week,game_type';
const TEAMS = ['ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND','JAX','KC',
  'LA','LAC','LV','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SEA','SF','TB','TEN','WAS']; // 32

/** `weeks` REG weeks × MIN_ROSTERWEEKLY_WEEK_ROWS rows spread over 32 teams; WRs with sleeper ids. */
function makeCsv(season, weeks) {
  const rows = [HEADER];
  for (let w = 1; w <= weeks; w++) {
    for (let i = 0; i < MIN_ROSTERWEEKLY_WEEK_ROWS; i++) {
      rows.push(`${season},${TEAMS[i % TEAMS.length]},WR,ACT,00-${i},${5000 + i},${w},REG`);
    }
  }
  return rows.join('\n');
}

function spyDeps(overrides = {}, t, { dataPathResult = null } = {}) {
  return sharedSpyDeps({
    readJson: path => {
      if (path === 'nflverse/playerids.json') return { ids: {} };
      if (/nflverse\/rosterweekly\/\d+\.json/.test(path)) return dataPathResult;
      return null;
    },
    ...overrides,
  }, t);
}

test('R-3 updateRosterWeekly: a below-floor --year throws before any fetch', async () => {
  const { deps, calls } = spyDeps({
    fetchRosterWeeklyCsv: async () => { throw new Error('must not fetch'); },
  });
  await assert.rejects(() => updateRosterWeekly({ year: MIN_ROSTERWEEKLY_SEASON - 1, deps }), /below MIN_ROSTERWEEKLY_SEASON/);
  assert.equal(calls.writeJsonStable.length, 0);
});

test('R-3 updateRosterWeekly: a dedup hit makes no write and no manifest touch', async t => {
  const csv = makeCsv(2016, 17);
  const { players } = parseRosterWeekly(csv, { season: 2016 });
  const { deps, calls, logs } = spyDeps({ fetchRosterWeeklyCsv: async () => csv }, t, { dataPathResult: { players } });
  await updateRosterWeekly({ year: 2016, deps });
  assert.equal(calls.writeJsonStable.length, 0);
  assert.equal(calls.updateManifestEntry.length, 0);
  assert.ok(logs.includes('[rosterweekly] Content identical to existing nflverse/rosterweekly/2016.json — no change.'));
});

test('R-3 updateRosterWeekly: dedup hash is insensitive to nested week-key order', () => {
  assert.equal(
    playersHash({ 1: { 2: [['KC', 'ACT']], 1: [['KC', 'ACT']] } }),
    playersHash({ 1: { 1: [['KC', 'ACT']], 2: [['KC', 'ACT']] } }),
  );
});

test('R-3 updateRosterWeekly: a completed season whose content changed hits the force gate without --force', async t => {
  const csv = makeCsv(2016, 17);
  const { deps, calls } = spyDeps({ fetchRosterWeeklyCsv: async () => csv }, t, { dataPathResult: { players: { 1: { 1: [['KC', 'RES']] } } } });
  await assert.rejects(() => updateRosterWeekly({ year: 2016, deps }), /already exists for completed season 2016/);
  assert.equal(calls.writeJsonStable.length, 0);
});

test('R-3 updateRosterWeekly: write path — envelope shape, minified write, manifest entry', async t => {
  const csv = makeCsv(2016, 17);
  const writes = [];
  const { deps, calls } = spyDeps({
    fetchRosterWeeklyCsv: async () => csv,
    writeJsonStable: (path, body, opts) => writes.push([path, body, opts]),
  }, t);
  await updateRosterWeekly({ year: 2016, deps });

  assert.equal(writes.length, 1);
  const [path, body, opts] = writes[0];
  assert.equal(path, 'nflverse/rosterweekly/2016.json');
  assert.deepEqual(opts, { minify: true });
  assert.deepEqual(
    Object.keys(body).sort(),
    ['generatedAt', 'playerCount', 'players', 'rowCount', 'schemaVersion', 'season', 'unmapped', 'weeks'].sort(),
  );
  assert.equal(body.schemaVersion, 1);
  assert.equal(body.season, 2016);
  assert.equal(body.rowCount, 17 * MIN_ROSTERWEEKLY_WEEK_ROWS);
  assert.equal(body.playerCount, MIN_ROSTERWEEKLY_WEEK_ROWS);
  assert.equal(body.unmapped, 0);
  assert.deepEqual(body.weeks, Array.from({ length: 17 }, (_, i) => i + 1));

  assert.equal(calls.updateManifestEntry.length, 1);
  assert.deepEqual(calls.updateManifestEntry[0][0], {
    path: 'nflverse/rosterweekly/2016.json', recordCount: body.rowCount, inProgress: false, schemaVersion: 1,
  });
});

test('R-3 updateRosterWeekly: fetch returning null skips the season; a missing crosswalk .ids throws (warns in dry-run)', async t => {
  const { deps, calls, logs } = spyDeps({ fetchRosterWeeklyCsv: async () => null }, t);
  await updateRosterWeekly({ year: 2016, deps });
  assert.equal(calls.writeJsonStable.length, 0);
  assert.ok(logs.includes('[rosterweekly] season=2016 not published yet — skipping'));

  const noCw = { readJson: () => null };
  await assert.rejects(() => updateRosterWeekly({ year: 2016, deps: spyDeps(noCw).deps }), /playerids\.json not found/);
  await assert.doesNotReject(() => updateRosterWeekly({ year: 2016, dryRun: true, deps: spyDeps(noCw).deps }));
});
