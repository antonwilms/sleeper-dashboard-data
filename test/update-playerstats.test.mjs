/**
 * test/update-playerstats.test.mjs — Unit tests for the §3.1 csv/currentSeason injection
 * seam on updateAdvStats/updateGameLogs, and the playerstats orchestrator's single-fetch
 * claim (playerstats-single-fetch.md §5, §7).
 *
 * Uses a real (tiny) fixture CSV and the real crosswalk file on disk — the fixture is
 * deliberately below both sparsity gates (MIN_ADVSTATS_ROWS=250, MIN_PLAYERGAME_ROWS=3000)
 * so both scripts return early with no write and no throw, keeping these tests read-only
 * against the repo tree. `global.fetch` is mocked per-test via `t.mock.method` (auto-restored
 * after each test) so no test touches the network.
 *
 * Run with: node --experimental-test-module-mocks --test  (or npm test)
 */

import { test } from 'node:test';
import assert   from 'node:assert/strict';

import { updateAdvStats }    from '../scripts/update-advstats.mjs';
import { updateGameLogs }    from '../scripts/update-gamelogs.mjs';
import { updatePlayerStats } from '../scripts/update-playerstats.mjs';

// Minimal CSV satisfying both aggregateAdvReceiving's required columns
// (player_id, team, targets, season_type) and parsePlayerGameLogs's
// (player_id, position, season, week). One data row — well under either
// sparsity gate, so both scripts skip-and-return rather than write.
const FIXTURE_CSV =
  'player_id,team,targets,season,week,position,player_display_name,receiving_air_yards,receiving_yards,receptions,season_type\n' +
  '0000-0001,KC,5,2023,1,WR,Test Player,50,40,3,REG\n';

function makeCountingFetch({ season, csv, csvStatus = 200 }) {
  const calls = { state: 0, csv: 0 };
  const fn = async (url) => {
    const u = String(url);
    if (u.includes('/state/nfl')) {
      calls.state++;
      return { ok: true, status: 200, json: async () => ({ season: String(season) }) };
    }
    if (u.includes('/stats_player_week_')) {
      calls.csv++;
      if (csvStatus !== 200) return { ok: false, status: csvStatus };
      return { ok: true, status: 200, text: async () => csv };
    }
    throw new Error(`[test] unexpected fetch: ${u}`);
  };
  fn.calls = calls;
  return fn;
}

function throwingFetch() {
  return async (url) => { throw new Error(`[test] fetch should not have been called: ${url}`); };
}

// ═══════════════════════════════════════════════════════════════════
// §5.1/§5.2 — injected csv is used, no fetch occurs
// ═══════════════════════════════════════════════════════════════════

test('updateAdvStats: injected csv + currentSeason are used, fetch is never called', async (t) => {
  t.mock.method(globalThis, 'fetch', throwingFetch());
  await assert.doesNotReject(() => updateAdvStats({
    year: 2023, csv: FIXTURE_CSV, currentSeason: 2023, dryRun: true,
  }));
});

test('updateGameLogs: injected csv + currentSeason are used, fetch is never called (single-season path)', async (t) => {
  t.mock.method(globalThis, 'fetch', throwingFetch());
  await assert.doesNotReject(() => updateGameLogs({
    year: 2023, csv: FIXTURE_CSV, currentSeason: 2023, dryRun: true,
  }));
});

// ═══════════════════════════════════════════════════════════════════
// §5.3 — csv: null still fetches (regression guard for the default-parameter form)
// ═══════════════════════════════════════════════════════════════════

test('updateAdvStats: csv omitted (default null) still fetches — regression guard', async (t) => {
  const mockFetch = makeCountingFetch({ season: 2023, csv: FIXTURE_CSV });
  t.mock.method(globalThis, 'fetch', mockFetch);
  await updateAdvStats({ year: 2023, dryRun: true });
  assert.equal(mockFetch.calls.csv, 1, 'fetchPlayerStatsCsv should be called once when csv is not injected');
});

test('updateGameLogs: csv omitted (default null) still fetches — regression guard', async (t) => {
  const mockFetch = makeCountingFetch({ season: 2023, csv: FIXTURE_CSV });
  t.mock.method(globalThis, 'fetch', mockFetch);
  await updateGameLogs({ year: 2023, dryRun: true });
  assert.equal(mockFetch.calls.csv, 1, 'fetchPlayerStatsCsv should be called once when csv is not injected');
});

// ═══════════════════════════════════════════════════════════════════
// §5.5 — --all ignores an injected csv and still fetches per season
// ═══════════════════════════════════════════════════════════════════

test('updateGameLogs --all: ignores an injected csv, still fetches (single season in range)', async (t) => {
  const mockFetch = makeCountingFetch({ season: 2012, csv: FIXTURE_CSV });
  t.mock.method(globalThis, 'fetch', mockFetch);
  // currentSeason: 2012 == MIN_GAMELOG_SEASON, so --all's loop is exactly one season —
  // keeps this test to a single fetch instead of a 14-season backfill.
  await updateGameLogs({ all: true, csv: FIXTURE_CSV, currentSeason: 2012, dryRun: true });
  assert.equal(mockFetch.calls.csv, 1, '--all must still fetch per season, ignoring the injected csv');
});

// ═══════════════════════════════════════════════════════════════════
// §7 done-definition — "a merged run makes ONE fetchCurrentNflSeason and ONE
// fetchPlayerStatsCsv call, verified by counting calls, not by reading the plan"
// ═══════════════════════════════════════════════════════════════════

test('updatePlayerStats: exactly one fetchCurrentNflSeason call and one fetchPlayerStatsCsv call', async (t) => {
  const mockFetch = makeCountingFetch({ season: 2023, csv: FIXTURE_CSV });
  t.mock.method(globalThis, 'fetch', mockFetch);
  const result = await updatePlayerStats({ year: 2023, dryRun: true });
  assert.equal(mockFetch.calls.state, 1, 'fetchCurrentNflSeason should be called exactly once');
  assert.equal(mockFetch.calls.csv, 1, 'fetchPlayerStatsCsv should be called exactly once');
  assert.deepEqual(result, { advstatsOk: true, gamelogsOk: true });
});

test('updatePlayerStats: csv not yet published (404) skips both families cleanly, one fetch each', async (t) => {
  const mockFetch = makeCountingFetch({ season: 2099, csv: null, csvStatus: 404 });
  t.mock.method(globalThis, 'fetch', mockFetch);
  const result = await updatePlayerStats({ year: 2099, dryRun: true });
  assert.equal(mockFetch.calls.state, 1);
  assert.equal(mockFetch.calls.csv, 1);
  assert.deepEqual(result, { advstatsOk: true, gamelogsOk: true });
});
