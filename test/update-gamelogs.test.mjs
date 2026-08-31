/**
 * test/update-gamelogs.test.mjs — characterization net for updateGameLogs's branch matrix
 * (season-ingest-net.md §5), driven through the `deps` I/O seam. `csv`/`currentSeason` (E5's
 * input-injection seam) stay separately tested in test/update-playerstats.test.mjs — that file
 * is unedited by this slice. This file exercises the branches input injection cannot reach:
 * the force gate, dedup-hit, and write path, all of which go through readJson/writeJsonStable/
 * updateManifestEntry directly.
 *
 * `deps.readJson` dispatches on path — it serves both the crosswalk read
 * (nflverse/playerids.json) and the existing-served-file read (nflverse/gamelogs/<year>.json).
 * No test writes into nflverse/, nfl/, or manifest.json.
 *
 * Run with: node --test  (or npm test)
 */

import { test } from 'node:test';
import assert   from 'node:assert/strict';

import { updateGameLogs } from '../scripts/update-gamelogs.mjs';
import { MIN_PLAYERGAME_ROWS } from '../lib/nflverse.mjs';

const GAMELOG_HEADER =
  'player_id,team,targets,season,week,position,player_display_name,receiving_air_yards,receiving_yards,receptions,season_type';

const PLAYERS = 200;
const WEEKS   = 15; // 200*15 = 3000 rows — clears MIN_PLAYERGAME_ROWS (3000) with a margin CSV row

/** `players` distinct WR players × `weeks` game rows each, for `season`. */
function makeGamelogCsv(players, weeks, season) {
  const rows = [GAMELOG_HEADER];
  for (let p = 0; p < players; p++) {
    for (let w = 1; w <= weeks; w++) {
      rows.push(`00-${String(2000000 + p)},KC,5,${season},${w},WR,Player ${p},50,40,3,REG`);
    }
  }
  return rows.join('\n');
}

function makeCrosswalk(players) {
  const ids = {};
  for (let p = 0; p < players; p++) {
    ids[`00-${String(2000000 + p)}`] = { sleeperId: String(6000 + p), name: `Player ${p}`, position: 'WR' };
  }
  return { ids };
}

function spyDeps({ crosswalkCount = PLAYERS, dataPathResult = null, ...overrides } = {}) {
  const calls = { writeJsonStable: [], updateManifestEntry: [], setStepOutput: [] };
  const dataPath = /nflverse\/gamelogs\/\d+\.json/;
  return {
    deps: {
      fetchCurrentNflSeason: async () => 2026,
      setStepOutput: (...args) => calls.setStepOutput.push(args),
      writeJsonStable: (...args) => calls.writeJsonStable.push(args),
      updateManifestEntry: (...args) => calls.updateManifestEntry.push(args),
      readJson: (path) => {
        if (path === 'nflverse/playerids.json') return makeCrosswalk(crosswalkCount);
        if (dataPath.test(path)) return dataPathResult;
        return null;
      },
      ...overrides,
    },
    calls,
  };
}

// ═══════════════════════════════════════════════════════════════════
// not published (single-season path)
// ═══════════════════════════════════════════════════════════════════

test('updateGameLogs: fetchPlayerStatsCsv returns null (deps) → season skipped, nothing written', async () => {
  const { deps, calls } = spyDeps({ fetchPlayerStatsCsv: async () => null });
  await updateGameLogs({ year: 2023, deps });
  assert.equal(calls.writeJsonStable.length, 0);
  assert.equal(calls.updateManifestEntry.length, 0);
});

// ═══════════════════════════════════════════════════════════════════
// sparsity gate (on parsed total, before crosswalk drop)
// ═══════════════════════════════════════════════════════════════════

test('updateGameLogs: parsedRowCount < MIN_PLAYERGAME_ROWS → skipped, nothing written', async () => {
  const csv = makeGamelogCsv(5, 2, 2023); // 10 rows
  const { deps, calls } = spyDeps({ fetchPlayerStatsCsv: async () => csv });
  await updateGameLogs({ year: 2023, deps });
  assert.equal(calls.writeJsonStable.length, 0);
  assert.equal(calls.updateManifestEntry.length, 0);
});

// ═══════════════════════════════════════════════════════════════════
// dedup hit
// ═══════════════════════════════════════════════════════════════════

test('updateGameLogs: dedup hit — nothing written', async () => {
  const csv = makeGamelogCsv(PLAYERS, WEEKS, 2023);
  const { parsePlayerGameLogs, rekeyGameLogsBySleeper } = await import('../lib/nflverse.mjs');
  const { byGsis } = parsePlayerGameLogs(csv);
  const { players } = rekeyGameLogsBySleeper(byGsis, makeCrosswalk(PLAYERS).ids);
  const { deps, calls } = spyDeps({ fetchPlayerStatsCsv: async () => csv, dataPathResult: { players } });
  await updateGameLogs({ year: 2023, deps });
  assert.equal(calls.writeJsonStable.length, 0);
  assert.equal(calls.updateManifestEntry.length, 0);
});

// ═══════════════════════════════════════════════════════════════════
// dry-run exits BEFORE the force gate (contrast roster's axis-3 ordering)
// ═══════════════════════════════════════════════════════════════════

test('updateGameLogs: --dry-run on a changed past season reports a plan, does not throw', async () => {
  const csv = makeGamelogCsv(PLAYERS, WEEKS, 2023);
  const { deps, calls } = spyDeps({
    fetchPlayerStatsCsv: async () => csv,
    dataPathResult: { players: { X: { games: [] } } },
  });
  await assert.doesNotReject(() => updateGameLogs({ year: 2023, dryRun: true, force: false, deps }));
  assert.equal(calls.writeJsonStable.length, 0);
});

// ═══════════════════════════════════════════════════════════════════
// force gate (non-dry-run)
// ═══════════════════════════════════════════════════════════════════

test('updateGameLogs: force gate throws on a changed past season without --force', async () => {
  const csv = makeGamelogCsv(PLAYERS, WEEKS, 2023);
  const { deps } = spyDeps({
    fetchPlayerStatsCsv: async () => csv,
    dataPathResult: { players: { X: { games: [] } } },
  });
  await assert.rejects(
    () => updateGameLogs({ year: 2023, dryRun: false, force: false, deps }),
    /already exists for completed season 2023/
  );
});

// ═══════════════════════════════════════════════════════════════════
// write path
// ═══════════════════════════════════════════════════════════════════

test('updateGameLogs: write path — data file + manifest entry, gamelogs\' own envelope', async () => {
  const csv = makeGamelogCsv(PLAYERS, WEEKS, 2023);
  const { deps, calls } = spyDeps({ fetchPlayerStatsCsv: async () => csv });
  await updateGameLogs({ year: 2023, dryRun: false, deps });

  assert.equal(calls.writeJsonStable.length, 1);
  const [path, body] = calls.writeJsonStable[0];
  assert.equal(path, 'nflverse/gamelogs/2023.json');
  assert.deepEqual(
    Object.keys(body).sort(),
    ['generatedAt', 'playerCount', 'players', 'rowCount', 'schemaVersion', 'season', 'unmapped'].sort()
  );
  assert.equal(body.rowCount, PLAYERS * WEEKS);
  assert.equal(body.playerCount, PLAYERS);
  assert.equal(body.unmapped, 0);

  assert.equal(calls.updateManifestEntry.length, 1);
  assert.equal(calls.updateManifestEntry[0][0].inProgress, false);
});

// ═══════════════════════════════════════════════════════════════════
// --all fetches per season, via deps (mirrors what test/update-playerstats.test.mjs pins for
// the csv/currentSeason seam, but through deps.fetchPlayerStatsCsv instead)
// ═══════════════════════════════════════════════════════════════════

test('updateGameLogs --all: fetches once per season via deps.fetchPlayerStatsCsv', async () => {
  const seen = [];
  const { deps } = spyDeps({
    fetchCurrentNflSeason: async () => 2012, // MIN_GAMELOG_SEASON..2012 = exactly one season
    fetchPlayerStatsCsv: async (season) => { seen.push(season); return null; },
  });
  await updateGameLogs({ all: true, deps });
  assert.deepEqual(seen, [2012]);
});

// ═══════════════════════════════════════════════════════════════════
// missing crosswalk (this family reads it too, beyond dataPath)
// ═══════════════════════════════════════════════════════════════════

test('updateGameLogs: missing crosswalk throws on the real (non-dry-run) path', async () => {
  const csv = makeGamelogCsv(PLAYERS, WEEKS, 2023);
  const { deps } = spyDeps({ fetchPlayerStatsCsv: async () => csv, readJson: () => null });
  await assert.rejects(() => updateGameLogs({ year: 2023, dryRun: false, deps }), /playerids\.json not found/);
});

test('updateGameLogs: missing crosswalk is non-fatal under --dry-run', async () => {
  const csv = makeGamelogCsv(PLAYERS, WEEKS, 2023);
  const { deps, calls } = spyDeps({ fetchPlayerStatsCsv: async () => csv, readJson: () => null });
  await assert.doesNotReject(() => updateGameLogs({ year: 2023, dryRun: true, deps }));
  assert.equal(calls.writeJsonStable.length, 0);
});
