/**
 * test/update-playerstats-isolation.test.mjs — §3.3's load-bearing test: a throw from
 * one family must not prevent the other from running, and the orchestrator must still
 * fail the job (playerstats-single-fetch.md §5.4, §7).
 *
 * Uses the injected `deps` seam (ci-consolidation.md §2.1) rather than experimental ESM
 * mocking — that API is Node-version-sensitive and this repo already has a blessed
 * DEFAULT_DEPS pattern (scripts/update-nfl.mjs) for exactly this kind of control-flow test.
 * `t.mock.method(globalThis, 'fetch', …)` stays — that is ordinary method mocking, not
 * a module-level mock, and needs no experimental flag.
 *
 * Run with: node --test  (or npm test)
 */

import { test } from 'node:test';
import assert   from 'node:assert/strict';

import { updatePlayerStats } from '../scripts/update-playerstats.mjs';

function makeFetch({ season = 2023 } = {}) {
  return async (url) => {
    const u = String(url);
    if (u.includes('/state/nfl')) return { ok: true, status: 200, json: async () => ({ season: String(season) }) };
    if (u.includes('/stats_player_week_')) return { ok: true, status: 200, text: async () => 'player_id,team,targets,season,week,position,season_type\n0000-0001,KC,5,2023,1,WR,REG\n' };
    throw new Error(`[test] unexpected fetch: ${u}`);
  };
}

test('a throw from one family does not stop the other, and the orchestrator still fails (§3.3)', async (t) => {
  t.mock.method(globalThis, 'fetch', makeFetch());

  const advstatsCalls = [];
  const gamelogsCalls = [];

  const deps = {
    updateAdvStats: async (opts) => {
      advstatsCalls.push(opts);
      throw new Error('[test] simulated advstats failure');
    },
    updateGameLogs: async (opts) => {
      gamelogsCalls.push(opts);
      // succeeds
    },
  };

  await assert.rejects(
    () => updatePlayerStats({ year: 2023, dryRun: true, deps }),
    /advstats=failed gamelogs=ok/
  );

  assert.equal(advstatsCalls.length, 1, 'advstats should have been attempted');
  assert.equal(gamelogsCalls.length, 1, 'gamelogs should still have been attempted despite advstats throwing');
});

test('the reverse: gamelogs throws, advstats still runs, orchestrator still fails', async (t) => {
  t.mock.method(globalThis, 'fetch', makeFetch());

  const advstatsCalls = [];
  const gamelogsCalls = [];

  const deps = {
    updateAdvStats: async (opts) => { advstatsCalls.push(opts); },
    updateGameLogs: async (opts) => {
      gamelogsCalls.push(opts);
      throw new Error('[test] simulated gamelogs failure');
    },
  };

  await assert.rejects(
    () => updatePlayerStats({ year: 2023, dryRun: true, deps }),
    /advstats=ok gamelogs=failed/
  );

  assert.equal(advstatsCalls.length, 1);
  assert.equal(gamelogsCalls.length, 1);
});

test('DEFAULT_DEPS default path — no deps passed still calls the real updaters', async (t) => {
  t.mock.method(globalThis, 'fetch', makeFetch());

  const result = await updatePlayerStats({ year: 2023, dryRun: true });

  // Real updateAdvStats/updateGameLogs ran (no deps override): both families report ok since
  // the fixture CSV is small (1 row), well under either sparsity gate, so both skip-and-return
  // cleanly rather than throw or write.
  assert.deepEqual(result, { advstatsOk: true, gamelogsOk: true });
});
