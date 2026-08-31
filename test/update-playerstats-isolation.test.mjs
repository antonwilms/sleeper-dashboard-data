/**
 * test/update-playerstats-isolation.test.mjs — §3.3's load-bearing test: a throw from
 * one family must not prevent the other from running, and the orchestrator must still
 * fail the job (playerstats-single-fetch.md §5.4, §7).
 *
 * Kept in its own file (rather than folded into test/update-playerstats.test.mjs) because
 * it mocks the `../scripts/update-advstats.mjs` and `../scripts/update-gamelogs.mjs`
 * module specifiers themselves via `t.mock.module` — those specifiers must not already be
 * resolved/cached in this process before the mock is installed, and update-playerstats.test.mjs
 * imports the real modules statically.
 *
 * Run with: node --experimental-test-module-mocks --test  (or npm test)
 */

import { test } from 'node:test';
import assert   from 'node:assert/strict';

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

  t.mock.module('../scripts/update-advstats.mjs', {
    namedExports: {
      updateAdvStats: async (opts) => {
        advstatsCalls.push(opts);
        throw new Error('[test] simulated advstats failure');
      },
    },
  });
  t.mock.module('../scripts/update-gamelogs.mjs', {
    namedExports: {
      updateGameLogs: async (opts) => {
        gamelogsCalls.push(opts);
        // succeeds
      },
    },
  });

  // Cache-bust: force a fresh evaluation of update-playerstats.mjs bound to THIS test's
  // mocked update-advstats/update-gamelogs, rather than reusing an already-cached module
  // instance built against a previous test's mocks.
  const { updatePlayerStats } = await import('../scripts/update-playerstats.mjs?case=advstats-throws');

  await assert.rejects(
    () => updatePlayerStats({ year: 2023, dryRun: true }),
    /advstats=failed gamelogs=ok/
  );

  assert.equal(advstatsCalls.length, 1, 'advstats should have been attempted');
  assert.equal(gamelogsCalls.length, 1, 'gamelogs should still have been attempted despite advstats throwing');
});

test('the reverse: gamelogs throws, advstats still runs, orchestrator still fails', async (t) => {
  t.mock.method(globalThis, 'fetch', makeFetch());

  const advstatsCalls = [];
  const gamelogsCalls = [];

  t.mock.module('../scripts/update-advstats.mjs', {
    namedExports: {
      updateAdvStats: async (opts) => { advstatsCalls.push(opts); },
    },
  });
  t.mock.module('../scripts/update-gamelogs.mjs', {
    namedExports: {
      updateGameLogs: async (opts) => {
        gamelogsCalls.push(opts);
        throw new Error('[test] simulated gamelogs failure');
      },
    },
  });

  const { updatePlayerStats } = await import('../scripts/update-playerstats.mjs?case=gamelogs-throws');

  await assert.rejects(
    () => updatePlayerStats({ year: 2023, dryRun: true }),
    /advstats=ok gamelogs=failed/
  );

  assert.equal(advstatsCalls.length, 1);
  assert.equal(gamelogsCalls.length, 1);
});
