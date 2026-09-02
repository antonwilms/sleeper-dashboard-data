/**
 * test/update-teamcontext.test.mjs — characterization net for updateTeamContext's branch
 * matrix (season-ingest-net.md §5), including axis 4: aggregateTeamContext asserts the CSV's
 * own season column against the requested season (a derive-level guard, not a spine-level
 * adoption idiom like the other five families) — this file pins that throw explicitly.
 *
 * Driven through the `deps` I/O seam: `deps.fetchPbpCsv` controls the raw pbp CSV per season
 * (or its absence), `deps.readJson` controls what's "already on disk", and
 * `deps.writeJsonStable`/`deps.updateManifestEntry` are spies. No test writes into nflverse/,
 * nfl/, or manifest.json.
 *
 * Run with: node --test  (or npm test)
 */

import { test } from 'node:test';
import assert   from 'node:assert/strict';

import { updateTeamContext } from '../scripts/update-teamcontext.mjs';
import { MIN_TEAMCONTEXT_ROWS } from '../lib/nflverse.mjs';
import { spyDeps } from '../test-support/spy-deps.mjs';

const TC_HEADER = [
  'game_id', 'season', 'week', 'season_type', 'posteam', 'defteam', 'home_team', 'away_team',
  'pass', 'rush', 'play_type', 'two_point_attempt', 'xpass', 'epa', 'success', 'wp', 'qtr',
  'half_seconds_remaining', 'game_seconds_remaining', 'yardline_100', 'fixed_drive',
  'fixed_drive_result', 'total_home_score', 'total_away_score',
].join(',');

const PLAYS_PER_TEAM = 30; // clears validateTeamContext's off.plays >= 25 floor

/**
 * One pbp play row. qtr is pinned to 4 throughout — aggregateTeamContext's "neutral script"
 * pace window requires qtr <= 3, so this keeps neutralGaps at 0 and neutralSecPerPlay null,
 * sidestepping its [5,45] plausibility bound entirely rather than having to hand-tune game
 * clock gaps to satisfy it. Nothing this slice touches depends on pace being populated.
 */
function tcPlay(gameId, season, week, posteam, defteam) {
  return [
    gameId, season, week, 'REG', posteam, defteam, 'KC', 'BAL',
    1, 0, 'pass', 0, 0.5, 0.05, 1, 0.5, 4,
    900, 1800, 50, 1, '', 7, 3,
  ].join(',');
}

/** `gameCount` distinct games for `season` — each contributes 2 team-game rows (KC + BAL). */
function makeTcCsv(season, gameCount) {
  const rows = [TC_HEADER];
  for (let w = 1; w <= gameCount; w++) {
    const gameId = `${season}_${String(w).padStart(2, '0')}_KC_BAL`;
    for (let p = 0; p < PLAYS_PER_TEAM; p++) rows.push(tcPlay(gameId, season, w, 'KC', 'BAL'));
    for (let p = 0; p < PLAYS_PER_TEAM; p++) rows.push(tcPlay(gameId, season, w, 'BAL', 'KC'));
  }
  return rows.join('\n');
}

const GAME_COUNT = Math.ceil(MIN_TEAMCONTEXT_ROWS / 2) + 2; // comfortably clears the floor

// ═══════════════════════════════════════════════════════════════════
// not published
// ═══════════════════════════════════════════════════════════════════

test('updateTeamContext: fetchPbpCsv returns null → season skipped, nothing written', async (t) => {
  const { deps, calls, logs } = spyDeps({ fetchPbpCsv: async () => null }, t);
  await updateTeamContext({ year: 2023, deps });
  assert.equal(calls.writeJsonStable.length, 0);
  assert.equal(calls.updateManifestEntry.length, 0);
  assert.ok(logs.includes('[teamcontext] season=2023 not published yet — skipping'));
});

// ═══════════════════════════════════════════════════════════════════
// sparsity gate
// ═══════════════════════════════════════════════════════════════════

test('updateTeamContext: rowCount < MIN_TEAMCONTEXT_ROWS → skipped, nothing written', async (t) => {
  const csv = makeTcCsv(2023, 3); // 6 rows, well below the 60-row floor
  const { deps, calls, logs } = spyDeps({ fetchPbpCsv: async () => csv }, t);
  await updateTeamContext({ year: 2023, deps });
  assert.equal(calls.writeJsonStable.length, 0);
  assert.equal(calls.updateManifestEntry.length, 0);
  assert.ok(logs.includes(
    `[teamcontext] season=2023 only 6 team-game rows (< MIN_TEAMCONTEXT_ROWS=${MIN_TEAMCONTEXT_ROWS}) — treating as preliminary/partial, skipping`
  ));
});

// ═══════════════════════════════════════════════════════════════════
// derive-level season assertion (axis 4) — NOT a spine adoption idiom
// ═══════════════════════════════════════════════════════════════════

test('updateTeamContext: CSV season disagreeing with the requested season THROWS (wrong-asset guard)', async () => {
  const csv = makeTcCsv(2022, GAME_COUNT); // CSV says 2022
  const { deps } = spyDeps({ fetchPbpCsv: async () => csv });
  await assert.rejects(
    () => updateTeamContext({ year: 2023, deps }), // requested 2023
    /does not match requested season/
  );
});

// ═══════════════════════════════════════════════════════════════════
// dedup hit
// ═══════════════════════════════════════════════════════════════════

test('updateTeamContext: dedup hit — nothing written', async (t) => {
  const csv = makeTcCsv(2023, GAME_COUNT);
  const { aggregateTeamContext } = await import('../lib/nflverse.mjs');
  const { teams } = aggregateTeamContext(csv, { season: 2023 });
  const { deps, calls, logs } = spyDeps({
    fetchPbpCsv: async () => csv,
    readJson: (path) => (path === 'nflverse/teamcontext/2023.json' ? { teams } : null),
  }, t);
  await updateTeamContext({ year: 2023, deps });
  assert.equal(calls.writeJsonStable.length, 0);
  assert.equal(calls.updateManifestEntry.length, 0);
  assert.ok(logs.includes('[teamcontext] Content identical to existing nflverse/teamcontext/2023.json — no change.'));
});

// ═══════════════════════════════════════════════════════════════════
// dry-run exits BEFORE the force gate (matches 4 of 5 siblings, contrast roster)
// ═══════════════════════════════════════════════════════════════════

test('updateTeamContext: --dry-run on a changed past season reports a plan, does not throw', async (t) => {
  const csv = makeTcCsv(2023, GAME_COUNT);
  const { deps, calls, logs } = spyDeps({
    fetchPbpCsv: async () => csv,
    readJson: (path) => (path === 'nflverse/teamcontext/2023.json' ? { teams: { XX: { games: [] } } } : null),
  }, t);
  await assert.doesNotReject(() => updateTeamContext({ year: 2023, dryRun: true, force: false, deps }));
  assert.equal(calls.writeJsonStable.length, 0);
  assert.ok(logs.includes(
    `[teamcontext] [dry-run] would write nflverse/teamcontext/2023.json: ${GAME_COUNT * 2} team-game rows, 2 teams` +
    ' (past season — needs --force to write for real)'
  ));
});

// ═══════════════════════════════════════════════════════════════════
// force gate (non-dry-run)
// ═══════════════════════════════════════════════════════════════════

test('updateTeamContext: force gate throws on a changed past season without --force', async () => {
  const csv = makeTcCsv(2023, GAME_COUNT);
  const { deps } = spyDeps({
    fetchPbpCsv: async () => csv,
    readJson: (path) => (path === 'nflverse/teamcontext/2023.json' ? { teams: { XX: { games: [] } } } : null),
  });
  await assert.rejects(
    () => updateTeamContext({ year: 2023, dryRun: false, force: false, deps }),
    /already exists for completed season 2023/
  );
});

// ═══════════════════════════════════════════════════════════════════
// write path — teamcontext's own envelope fields
// ═══════════════════════════════════════════════════════════════════

test('updateTeamContext: write path — data file + manifest entry, teamcontext\'s own envelope', async (t) => {
  const csv = makeTcCsv(2023, GAME_COUNT);
  const { deps, calls, logs } = spyDeps({ fetchPbpCsv: async () => csv, readJson: () => null }, t);
  await updateTeamContext({ year: 2023, dryRun: false, deps });

  assert.equal(calls.writeJsonStable.length, 1);
  const [path, body] = calls.writeJsonStable[0];
  assert.equal(path, 'nflverse/teamcontext/2023.json');
  assert.deepEqual(
    Object.keys(body).sort(),
    ['generatedAt', 'rowCount', 'schemaVersion', 'season', 'teamCount', 'teams'].sort()
  );
  assert.equal(body.teamCount, 2);
  assert.equal(body.rowCount, GAME_COUNT * 2);

  assert.equal(calls.updateManifestEntry.length, 1);
  assert.equal(calls.updateManifestEntry[0][0].inProgress, false);

  // afterWrite fires between the write and the manifest call; afterManifest after — both
  // previously unverified (dry runs never write, so byte-diffs never reached either hook).
  const afterWriteMsg    = `[teamcontext] Wrote nflverse/teamcontext/2023.json (${GAME_COUNT * 2} team-game rows, 2 teams)`;
  const afterManifestMsg = '[teamcontext] Manifest updated';
  const idxWrite    = logs.indexOf(afterWriteMsg);
  const idxManifest = logs.indexOf(afterManifestMsg);
  assert.notEqual(idxWrite, -1, 'afterWrite log missing');
  assert.notEqual(idxManifest, -1, 'afterManifest log missing');
  assert.ok(idxWrite < idxManifest, 'afterWrite must log before afterManifest');
});

// ═══════════════════════════════════════════════════════════════════
// --all fetches per season
// ═══════════════════════════════════════════════════════════════════

test('updateTeamContext --all: fetches once per season in range', async () => {
  const calls2 = [];
  const { deps } = spyDeps({
    fetchCurrentNflSeason: async () => 2013, // keeps the --all range to 2 seasons (MIN_TEAMCONTEXT_SEASON..2013)
    fetchPbpCsv: async (season) => { calls2.push(season); return null; }, // not-published every season → cheap
  });
  await updateTeamContext({ all: true, deps });
  assert.ok(calls2.length >= 1);
  assert.equal(new Set(calls2).size, calls2.length, 'one fetch per distinct season, no repeats');
});
