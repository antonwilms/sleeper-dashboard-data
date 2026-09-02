/**
 * test/update-advstats.test.mjs — characterization net for updateAdvStats's branch matrix
 * (season-ingest-net.md §5), driven through the `deps` I/O seam. `csv`/`currentSeason` (E5's
 * input-injection seam) stay separately tested in test/update-playerstats.test.mjs — that file
 * is unedited by this slice. This file exercises the branches input injection cannot reach:
 * the force gate, dedup-hit, and write path, all of which go through readJson/writeJsonStable/
 * updateManifestEntry directly.
 *
 * `deps.readJson` dispatches on path — it serves both the crosswalk read
 * (nflverse/playerids.json) and the existing-served-file read (nflverse/advstats/<year>.json).
 * No test writes into nflverse/, nfl/, or manifest.json.
 *
 * Run with: node --test  (or npm test)
 */

import { test } from 'node:test';
import assert   from 'node:assert/strict';

import { updateAdvStats } from '../scripts/update-advstats.mjs';
import { MIN_ADVSTATS_ROWS } from '../lib/nflverse.mjs';
import { spyDeps as sharedSpyDeps } from '../test-support/spy-deps.mjs';

const ADV_HEADER =
  'player_id,team,targets,season,week,position,player_display_name,receiving_air_yards,receiving_yards,receptions,season_type';

/** `count` distinct WR players for `season`, each 5 targets/50 air yards (ratio 10, in-band). */
function makeAdvCsv(count, season) {
  const rows = [ADV_HEADER];
  for (let i = 0; i < count; i++) {
    rows.push(`00-${String(1000000 + i)},KC,5,${season},1,WR,Player ${i},50,40,3,REG`);
  }
  return rows.join('\n');
}

/** Crosswalk mapping every gsis id `makeAdvCsv` emits to a distinct sleeper id. */
function makeCrosswalk(count) {
  const ids = {};
  for (let i = 0; i < count; i++) {
    ids[`00-${String(1000000 + i)}`] = { sleeperId: String(5000 + i), name: `Player ${i}`, position: 'WR' };
  }
  return { ids };
}

function spyDeps({ crosswalkCount = MIN_ADVSTATS_ROWS, dataPathResult = null, ...overrides } = {}, t) {
  const dataPath = /nflverse\/advstats\/\d+\.json/;
  return sharedSpyDeps({
    readJson: (path) => {
      if (path === 'nflverse/playerids.json') return makeCrosswalk(crosswalkCount);
      if (dataPath.test(path)) return dataPathResult;
      return null;
    },
    ...overrides,
  }, t);
}

// ═══════════════════════════════════════════════════════════════════
// not published
// ═══════════════════════════════════════════════════════════════════

test('updateAdvStats: fetchPlayerStatsCsv returns null (deps) → returns cleanly, nothing written', async () => {
  const { deps, calls } = spyDeps({ fetchPlayerStatsCsv: async () => null });
  await updateAdvStats({ year: 2023, deps });
  assert.equal(calls.writeJsonStable.length, 0);
  assert.equal(calls.updateManifestEntry.length, 0);
});

// ═══════════════════════════════════════════════════════════════════
// sparsity gate (post-rekey rowCount < MIN_ADVSTATS_ROWS)
// ═══════════════════════════════════════════════════════════════════

test('updateAdvStats: rowCount < MIN_ADVSTATS_ROWS after re-key → skipped, nothing written', async (t) => {
  const csv = makeAdvCsv(5, 2023);
  const { deps, calls, logs } = spyDeps({ fetchPlayerStatsCsv: async () => csv, crosswalkCount: 5 }, t);
  await updateAdvStats({ year: 2023, deps });
  assert.equal(calls.writeJsonStable.length, 0);
  assert.equal(calls.updateManifestEntry.length, 0);
  assert.ok(logs.includes(
    `[advstats] year=2023 only 5 players after re-key (< MIN_ADVSTATS_ROWS=${MIN_ADVSTATS_ROWS}) — treating as preliminary/partial, skipping`
  ));
});

// ═══════════════════════════════════════════════════════════════════
// dedup hit
// ═══════════════════════════════════════════════════════════════════

test('updateAdvStats: dedup hit — nothing written', async (t) => {
  const csv = makeAdvCsv(MIN_ADVSTATS_ROWS, 2023);
  const { aggregateAdvReceiving, rekeyBySleeper } = await import('../lib/nflverse.mjs');
  const { byGsis } = aggregateAdvReceiving(csv);
  const { players } = rekeyBySleeper(byGsis, makeCrosswalk(MIN_ADVSTATS_ROWS).ids);
  const { deps, calls, logs } = spyDeps({ fetchPlayerStatsCsv: async () => csv, dataPathResult: { players } }, t);
  await updateAdvStats({ year: 2023, deps });
  assert.equal(calls.writeJsonStable.length, 0);
  assert.equal(calls.updateManifestEntry.length, 0);
  assert.ok(logs.includes('[advstats] Content identical to existing nflverse/advstats/2023.json — no change.'));
});

// ═══════════════════════════════════════════════════════════════════
// dry-run exits BEFORE the force gate (contrast roster's axis-3 ordering)
// ═══════════════════════════════════════════════════════════════════

test('updateAdvStats: --dry-run on a changed past season reports a plan, does not throw', async (t) => {
  const csv = makeAdvCsv(MIN_ADVSTATS_ROWS, 2023);
  const { deps, calls, logs } = spyDeps({
    fetchPlayerStatsCsv: async () => csv,
    dataPathResult: { players: { X: { name: 'Someone Else' } } },
  }, t);
  await assert.doesNotReject(() => updateAdvStats({ year: 2023, dryRun: true, force: false, deps }));
  assert.equal(calls.writeJsonStable.length, 0);
  assert.ok(logs.includes(
    `[advstats] [dry-run] would write nflverse/advstats/2023.json: ${MIN_ADVSTATS_ROWS} players (0 unmapped)` +
    ' (past season — needs --force to write for real)'
  ));
});

// ═══════════════════════════════════════════════════════════════════
// force gate (non-dry-run)
// ═══════════════════════════════════════════════════════════════════

test('updateAdvStats: force gate throws on a changed past season without --force', async () => {
  const csv = makeAdvCsv(MIN_ADVSTATS_ROWS, 2023);
  const { deps } = spyDeps({
    fetchPlayerStatsCsv: async () => csv,
    dataPathResult: { players: { X: { name: 'Someone Else' } } },
  });
  await assert.rejects(
    () => updateAdvStats({ year: 2023, dryRun: false, force: false, deps }),
    /already exists for completed season 2023/
  );
});

// ═══════════════════════════════════════════════════════════════════
// write path
// ═══════════════════════════════════════════════════════════════════

test('updateAdvStats: write path — data file + manifest entry, advstats\' own envelope', async (t) => {
  const csv = makeAdvCsv(MIN_ADVSTATS_ROWS, 2023);
  const { deps, calls, logs } = spyDeps({ fetchPlayerStatsCsv: async () => csv }, t);
  await updateAdvStats({ year: 2023, dryRun: false, deps });

  assert.equal(calls.writeJsonStable.length, 1);
  const [path, body] = calls.writeJsonStable[0];
  assert.equal(path, 'nflverse/advstats/2023.json');
  assert.deepEqual(
    Object.keys(body).sort(),
    ['generatedAt', 'players', 'rowCount', 'schemaVersion', 'season', 'unmapped'].sort()
  );
  assert.equal(body.rowCount, MIN_ADVSTATS_ROWS);
  assert.equal(body.unmapped, 0);

  assert.equal(calls.updateManifestEntry.length, 1);
  assert.equal(calls.updateManifestEntry[0][0].inProgress, false);

  // afterWrite fires between the write and the manifest call; afterManifest after — both
  // previously unverified (dry runs never write, so byte-diffs never reached either hook).
  const afterWriteMsg    = `[advstats] Wrote nflverse/advstats/2023.json (${MIN_ADVSTATS_ROWS} players)`;
  const afterManifestMsg = '[advstats] Manifest updated';
  const idxWrite    = logs.indexOf(afterWriteMsg);
  const idxManifest = logs.indexOf(afterManifestMsg);
  assert.notEqual(idxWrite, -1, 'afterWrite log missing');
  assert.notEqual(idxManifest, -1, 'afterManifest log missing');
  assert.ok(idxWrite < idxManifest, 'afterWrite must log before afterManifest');
});

// ═══════════════════════════════════════════════════════════════════
// missing crosswalk (a third readJson call site this family has, beyond dataPath)
// ═══════════════════════════════════════════════════════════════════

test('updateAdvStats: missing crosswalk throws on the real (non-dry-run) path', async () => {
  const csv = makeAdvCsv(MIN_ADVSTATS_ROWS, 2023);
  const { deps } = spyDeps({ fetchPlayerStatsCsv: async () => csv, readJson: () => null });
  await assert.rejects(() => updateAdvStats({ year: 2023, dryRun: false, deps }), /playerids\.json not found/);
});

test('updateAdvStats: missing crosswalk is non-fatal under --dry-run', async () => {
  const csv = makeAdvCsv(MIN_ADVSTATS_ROWS, 2023);
  const { deps, calls } = spyDeps({ fetchPlayerStatsCsv: async () => csv, readJson: () => null });
  await assert.doesNotReject(() => updateAdvStats({ year: 2023, dryRun: true, deps }));
  assert.equal(calls.writeJsonStable.length, 0);
});
