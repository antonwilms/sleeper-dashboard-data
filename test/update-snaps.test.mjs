/**
 * test/update-snaps.test.mjs — updateSnaps's branch-matrix net, mirroring
 * test/update-gamelogs.test.mjs's structure (this family has no csv/currentSeason input-
 * injection seam — it is single-fetch on its own upstream release, not shared with an
 * orchestrator — so every branch here goes through `deps`).
 *
 * `deps.readJson` dispatches on path — it serves both the crosswalk read
 * (nflverse/playerids.json, `.bySleeper`-shaped) and the existing-served-file read
 * (nflverse/snaps/<year>.json). No test writes into nflverse/ or manifest.json.
 *
 * Run with: node --test  (or npm test)
 */

import { test } from 'node:test';
import assert   from 'node:assert/strict';

import { updateSnaps } from '../scripts/update-snaps.mjs';
import { MIN_SNAPS_SEASON } from '../lib/nflverse.mjs';
import { spyDeps as sharedSpyDeps } from '../test-support/spy-deps.mjs';

const SNAPS_HEADER =
  'game_id,pfr_game_id,season,game_type,week,player,pfr_player_id,position,team,opponent,' +
  'offense_snaps,offense_pct,defense_snaps,defense_pct,st_snaps,st_pct';

const PLAYERS = 200;
const WEEKS   = 16; // 200*16 = 3200 skill rows — clears MIN_SNAPS_ROWS (3000) with margin

/** `players` distinct WR players × `weeks` game rows each, for `season`, plus one OL row per
 * team-week so the team-game max denominator is never the player's own value. */
function makeSnapsCsv(players, weeks, season) {
  const rows = [SNAPS_HEADER];
  for (let w = 1; w <= weeks; w++) {
    rows.push(`g,pg,${season},REG,${w},OL Guy,OL01,G,KC,OPP,60,0,0,0,0,0`);
    for (let p = 0; p < players; p++) {
      rows.push(`g,pg,${season},REG,${w},Player ${p},WR${String(1000 + p)},WR,KC,OPP,40,0,0,0,0,0`);
    }
  }
  return rows.join('\n');
}

function makeCrosswalk(players) {
  const bySleeper = {};
  for (let p = 0; p < players; p++) {
    bySleeper[String(6000 + p)] = { pfrId: `WR${String(1000 + p)}` };
  }
  return { bySleeper };
}

function spyDeps({ crosswalkCount = PLAYERS, dataPathResult = null, ...overrides } = {}, t) {
  const dataPath = /nflverse\/snaps\/\d+\.json/;
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
// not published (single-season path)
// ═══════════════════════════════════════════════════════════════════

test('updateSnaps: fetchSnapCountsCsv returns null (deps) → season skipped, nothing written', async (t) => {
  const { deps, calls, logs } = spyDeps({ fetchSnapCountsCsv: async () => null }, t);
  await updateSnaps({ year: 2016, deps });
  assert.equal(calls.writeJsonStable.length, 0);
  assert.equal(calls.updateManifestEntry.length, 0);
  assert.ok(logs.includes('[snaps] season=2016 not published yet — skipping'));
});

// ═══════════════════════════════════════════════════════════════════
// the spine's own sparsity skip is deliberately near-inert here (SPINE_MIN_ROWS=1) — a small,
// real fetch still gets validated and WRITTEN (the row-count floor lives in validateSnaps, and
// throws instead of skipping — see the MIN_SNAPS_ROWS test in test/nflverse.test.mjs). Confirm
// that here: a below-floor real season throws rather than silently skipping.
// ═══════════════════════════════════════════════════════════════════

test('updateSnaps: a real but below-MIN_SNAPS_ROWS season throws (validateSnaps), not a silent skip', async (t) => {
  const csv = makeSnapsCsv(5, 2, 2016); // far below MIN_SNAPS_ROWS
  const { deps, calls } = spyDeps({ fetchSnapCountsCsv: async () => csv }, t);
  await assert.rejects(
    () => updateSnaps({ year: 2016, dryRun: false, deps }),
    /player-game rows/
  );
  assert.equal(calls.writeJsonStable.length, 0);
});

// ═══════════════════════════════════════════════════════════════════
// dedup hit
// ═══════════════════════════════════════════════════════════════════

test('updateSnaps: dedup hit — nothing written', async (t) => {
  const csv = makeSnapsCsv(PLAYERS, WEEKS, 2016);
  const { aggregateSnapCounts, pfrCrosswalkFromBySleeper, rekeySnapsByPfr } = await import('../lib/nflverse.mjs');
  const { byPfrId } = aggregateSnapCounts(csv);
  const { players, byPfr } = rekeySnapsByPfr(byPfrId, pfrCrosswalkFromBySleeper(makeCrosswalk(PLAYERS).bySleeper));
  const { deps, calls, logs } = spyDeps({ fetchSnapCountsCsv: async () => csv, dataPathResult: { players, byPfr } }, t);
  await updateSnaps({ year: 2016, deps });
  assert.equal(calls.writeJsonStable.length, 0);
  assert.equal(calls.updateManifestEntry.length, 0);
  assert.ok(logs.includes('[snaps] Content identical to existing nflverse/snaps/2016.json — no change.'));
});

// ═══════════════════════════════════════════════════════════════════
// dry-run exits BEFORE the force gate (mirrors gamelogs)
// ═══════════════════════════════════════════════════════════════════

test('updateSnaps: --dry-run on a changed past season reports a plan, does not throw', async (t) => {
  const csv = makeSnapsCsv(PLAYERS, WEEKS, 2016);
  const { deps, calls, logs } = spyDeps({
    fetchSnapCountsCsv: async () => csv,
    dataPathResult: { players: { X: { games: 1 } }, byPfr: {} },
  }, t);
  await assert.doesNotReject(() => updateSnaps({ year: 2016, dryRun: true, force: false, deps }));
  assert.equal(calls.writeJsonStable.length, 0);
  assert.ok(logs.some(l => l.startsWith('[snaps] [dry-run] would write nflverse/snaps/2016.json:')));
  assert.ok(logs.some(l => l.includes('needs --force to write for real')));
});

// ═══════════════════════════════════════════════════════════════════
// force gate (non-dry-run)
// ═══════════════════════════════════════════════════════════════════

test('updateSnaps: force gate throws on a changed past season without --force', async () => {
  const csv = makeSnapsCsv(PLAYERS, WEEKS, 2016);
  const { deps } = spyDeps({
    fetchSnapCountsCsv: async () => csv,
    dataPathResult: { players: { X: { games: 1 } }, byPfr: {} },
  });
  await assert.rejects(
    () => updateSnaps({ year: 2016, dryRun: false, force: false, deps }),
    /already exists for completed season 2016/
  );
});

// ═══════════════════════════════════════════════════════════════════
// write path
// ═══════════════════════════════════════════════════════════════════

test('updateSnaps: write path — data file + manifest entry, snaps\' own envelope', async (t) => {
  const csv = makeSnapsCsv(PLAYERS, WEEKS, 2016);
  const { deps, calls, logs } = spyDeps({ fetchSnapCountsCsv: async () => csv }, t);
  await updateSnaps({ year: 2016, dryRun: false, deps });

  assert.equal(calls.writeJsonStable.length, 1);
  const [path, body] = calls.writeJsonStable[0];
  assert.equal(path, 'nflverse/snaps/2016.json');
  assert.deepEqual(
    Object.keys(body).sort(),
    ['byPfr', 'generatedAt', 'playerCount', 'players', 'rowCount', 'schemaVersion', 'season', 'unmapped'].sort()
  );
  assert.equal(body.rowCount, PLAYERS * WEEKS);
  assert.equal(body.playerCount, PLAYERS);
  assert.equal(body.unmapped, 0);
  assert.deepEqual(body.byPfr, {});

  assert.equal(calls.updateManifestEntry.length, 1);
  assert.equal(calls.updateManifestEntry[0][0].inProgress, false);

  const idxWrite    = logs.findIndex(l => l.startsWith('[snaps] Wrote nflverse/snaps/2016.json'));
  const idxManifest = logs.indexOf('[snaps] Manifest updated');
  assert.notEqual(idxWrite, -1, 'afterWrite log missing');
  assert.notEqual(idxManifest, -1, 'afterManifest log missing');
  assert.ok(idxWrite < idxManifest, 'afterWrite must log before afterManifest');
});

// ═══════════════════════════════════════════════════════════════════
// --all fetches per season, via deps
// ═══════════════════════════════════════════════════════════════════

test('updateSnaps --all: fetches once per season via deps.fetchSnapCountsCsv', async () => {
  const seen = [];
  const { deps } = spyDeps({
    fetchCurrentNflSeason: async () => MIN_SNAPS_SEASON, // MIN_SNAPS_SEASON..MIN_SNAPS_SEASON = exactly one season
    fetchSnapCountsCsv: async (season) => { seen.push(season); return null; },
  });
  await updateSnaps({ all: true, deps });
  assert.deepEqual(seen, [MIN_SNAPS_SEASON]);
});

// ═══════════════════════════════════════════════════════════════════
// §E — setStepOutput('season', …) in single-season mode only (Invariant 8's season-keyed
// purge is skipped with a WARN, not a failure, when this is missing — task §E)
// ═══════════════════════════════════════════════════════════════════

test('updateSnaps: single-season mode calls setStepOutput(\'season\', year); --all does not', async (t) => {
  const csv = makeSnapsCsv(PLAYERS, WEEKS, 2016);
  const { deps, calls } = spyDeps({ fetchSnapCountsCsv: async () => csv }, t);
  await updateSnaps({ year: 2016, deps });
  assert.deepEqual(calls.setStepOutput, [['season', 2016]]);
});

test('updateSnaps --all: does not call setStepOutput (manual backfill — no purge target)', async () => {
  const { deps, calls } = spyDeps({
    fetchCurrentNflSeason: async () => MIN_SNAPS_SEASON,
    fetchSnapCountsCsv: async () => null,
  });
  await updateSnaps({ all: true, deps });
  assert.deepEqual(calls.setStepOutput, []);
});

// ═══════════════════════════════════════════════════════════════════
// missing crosswalk (this family reads bySleeper, not ids)
// ═══════════════════════════════════════════════════════════════════

test('updateSnaps: missing crosswalk bySleeper throws on the real (non-dry-run) path', async () => {
  const csv = makeSnapsCsv(PLAYERS, WEEKS, 2016);
  const { deps } = spyDeps({ fetchSnapCountsCsv: async () => csv, readJson: () => null });
  await assert.rejects(() => updateSnaps({ year: 2016, dryRun: false, deps }), /playerids\.json not found/);
});

test('updateSnaps: missing crosswalk bySleeper is non-fatal under --dry-run', async () => {
  const csv = makeSnapsCsv(PLAYERS, WEEKS, 2016);
  const { deps, calls } = spyDeps({ fetchSnapCountsCsv: async () => csv, readJson: () => null });
  await assert.doesNotReject(() => updateSnaps({ year: 2016, dryRun: true, deps }));
  assert.equal(calls.writeJsonStable.length, 0);
});
