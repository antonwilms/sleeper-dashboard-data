/**
 * test/update-schedule.test.mjs — Unit tests for gamesHash content-hash helper, plus (below)
 * the characterization net for updateSchedule's branch matrix (season-ingest-net.md §5).
 *
 * Schedule is structurally different from the other five: fetchSchedulesCsv() takes no season
 * argument and is called ONCE before the season loop — it fetches one combined games.csv and
 * splits it by season. So schedule has no per-season "not published" skip at the fetch level;
 * instead the whole-file fetch THROWS on null (pinned below), and a per-season "not published"
 * is a separate, later check (zero rows for that season within the parsed combined file).
 *
 * Driven through the `deps` I/O seam: `deps.fetchSchedulesCsv` controls the combined CSV (or
 * its absence), `deps.readJson` controls what's "already on disk" per season, and
 * `deps.writeJsonStable`/`deps.updateManifestEntry` are spies. No test writes into nflverse/,
 * nfl/, or manifest.json.
 *
 * Run with: node --test  (or npm test)
 */

import { test } from 'node:test';
import assert   from 'node:assert/strict';

import { gamesHash, updateSchedule } from '../scripts/update-schedule.mjs';
import { MIN_SCHEDULE_GAMES } from '../lib/nflverse.mjs';

const GAME_A = { gameId: '2023_01_DET_KC', season: 2023, week: 1, gameType: 'REG',
                 homeTeam: 'KC', awayTeam: 'DET', homeScore: 20, awayScore: 21,
                 result: -1, spreadLine: 4.5, totalLine: 53.0, roof: 'outdoors',
                 surface: 'grass', temp: 70, wind: 8 };
const GAME_B = { gameId: '2023_02_BUF_NYJ', season: 2023, week: 2, gameType: 'REG',
                 homeTeam: 'NYJ', awayTeam: 'BUF', homeScore: 24, awayScore: 17,
                 result: 7, spreadLine: -3.5, totalLine: 44.0, roof: 'outdoors',
                 surface: 'grass', temp: 75, wind: 5 };

test('gamesHash: arrays differing only in row order hash identically', () => {
  const hash1 = gamesHash([GAME_A, GAME_B]);
  const hash2 = gamesHash([GAME_B, GAME_A]);
  assert.equal(hash1, hash2);
});

test('gamesHash: arrays differing in one field value hash differently', () => {
  const gameAmodified = { ...GAME_A, homeScore: 99 };
  const hash1 = gamesHash([GAME_A, GAME_B]);
  const hash2 = gamesHash([gameAmodified, GAME_B]);
  assert.notEqual(hash1, hash2);
});

// ═══════════════════════════════════════════════════════════════════
// updateSchedule branch matrix (season-ingest-net.md §5)
// ═══════════════════════════════════════════════════════════════════

const SCHED_HEADER =
  'gametime,season,away_score,game_id,location,week,home_score,away_team,result,' +
  'home_team,spread_line,total_line,roof,surface,temp,wind,game_type';

/** `count` valid rows for one `season`; well above MIN_SCHEDULE_GAMES when count is large. */
function makeSchedCsv(season, count) {
  const rows = [SCHED_HEADER];
  for (let i = 0; i < count; i++) {
    rows.push(`,${ season},,g${season}_${i},,${(i % 18) + 1},,KC,,BUF,,,,,,,REG`);
  }
  return rows.join('\n');
}

function spyDeps(overrides = {}) {
  const calls = { writeJsonStable: [], updateManifestEntry: [], setStepOutput: [] };
  return {
    deps: {
      fetchCurrentNflSeason: async () => 2026,
      setStepOutput: (...args) => calls.setStepOutput.push(args),
      writeJsonStable: (...args) => calls.writeJsonStable.push(args),
      updateManifestEntry: (...args) => calls.updateManifestEntry.push(args),
      readJson: () => null,
      ...overrides,
    },
    calls,
  };
}

// ─── whole-file fetch: throws on null, not a clean skip (§3.1/§5) ──────────────

test('updateSchedule: fetchSchedulesCsv() returns null → THROWS, not a clean return', async () => {
  const { deps } = spyDeps({ fetchSchedulesCsv: async () => null });
  await assert.rejects(
    () => updateSchedule({ year: 2023, deps }),
    /games\.csv returned 404\/504/
  );
});

// ─── per-season "not published" (zero rows for that season in the combined file) ──

test('updateSchedule: a season with zero rows in the combined file is skipped, nothing written', async () => {
  const csv = makeSchedCsv(2022, MIN_SCHEDULE_GAMES); // only 2022 present
  const { deps, calls } = spyDeps({ fetchSchedulesCsv: async () => csv });
  await updateSchedule({ year: 2023, deps }); // requested season absent entirely
  assert.equal(calls.writeJsonStable.length, 0);
  assert.equal(calls.updateManifestEntry.length, 0);
});

// ─── sparsity gate ──────────────────────────────────────────────────────────

test('updateSchedule: games.length < MIN_SCHEDULE_GAMES → skipped, nothing written', async () => {
  const csv = makeSchedCsv(2023, 5);
  const { deps, calls } = spyDeps({ fetchSchedulesCsv: async () => csv });
  await updateSchedule({ year: 2023, deps });
  assert.equal(calls.writeJsonStable.length, 0);
  assert.equal(calls.updateManifestEntry.length, 0);
});

// ─── dedup hit ──────────────────────────────────────────────────────────────

test('updateSchedule: dedup hit — nothing written', async () => {
  const csv = makeSchedCsv(2023, MIN_SCHEDULE_GAMES);
  const { parseSchedulesCsv } = await import('../lib/nflverse.mjs');
  const { gamesBySeason } = parseSchedulesCsv(csv);
  const { deps, calls } = spyDeps({
    fetchSchedulesCsv: async () => csv,
    readJson: (path) => (path === 'nflverse/schedule/2023.json' ? { games: gamesBySeason['2023'] } : null),
  });
  await updateSchedule({ year: 2023, deps });
  assert.equal(calls.writeJsonStable.length, 0);
  assert.equal(calls.updateManifestEntry.length, 0);
});

// ─── dry-run exits BEFORE the force gate — opposite order from roster (axis 3 contrast) ──

test('updateSchedule: --dry-run on a changed past season reports a plan, does NOT throw', async () => {
  const csv = makeSchedCsv(2023, MIN_SCHEDULE_GAMES);
  const { deps, calls } = spyDeps({
    fetchSchedulesCsv: async () => csv,
    readJson: (path) => (path === 'nflverse/schedule/2023.json'
      ? { games: [{ gameId: 'different', homeTeam: 'X', awayTeam: 'Y' }] }
      : null),
  });
  // Unlike roster (season-ingest-net.md §1.1 axis 3), schedule's dry-run exit precedes its
  // force gate — this must NOT throw, even though the season is past, existing, and unforced.
  await assert.doesNotReject(() => updateSchedule({ year: 2023, dryRun: true, force: false, deps }));
  assert.equal(calls.writeJsonStable.length, 0);
});

// ─── force gate (non-dry-run) ───────────────────────────────────────────────

test('updateSchedule: force gate throws on a changed past season without --force', async () => {
  const csv = makeSchedCsv(2023, MIN_SCHEDULE_GAMES);
  const { deps } = spyDeps({
    fetchSchedulesCsv: async () => csv,
    readJson: (path) => (path === 'nflverse/schedule/2023.json'
      ? { games: [{ gameId: 'different', homeTeam: 'X', awayTeam: 'Y' }] }
      : null),
  });
  await assert.rejects(
    () => updateSchedule({ year: 2023, dryRun: false, force: false, deps }),
    /exists for completed season 2023/
  );
});

// ─── write path ─────────────────────────────────────────────────────────────

test('updateSchedule: write path — data file + manifest entry written, with schedule\'s own envelope', async () => {
  const csv = makeSchedCsv(2023, MIN_SCHEDULE_GAMES);
  const { deps, calls } = spyDeps({
    fetchSchedulesCsv: async () => csv,
    readJson: () => null,
  });
  await updateSchedule({ year: 2023, dryRun: false, deps });

  assert.equal(calls.writeJsonStable.length, 1);
  const [path, body] = calls.writeJsonStable[0];
  assert.equal(path, 'nflverse/schedule/2023.json');
  assert.deepEqual(Object.keys(body).sort(), ['games', 'generatedAt', 'rowCount', 'schemaVersion', 'season'].sort());
  assert.equal(body.rowCount, MIN_SCHEDULE_GAMES);

  assert.equal(calls.updateManifestEntry.length, 1);
  assert.equal(calls.updateManifestEntry[0][0].path, 'nflverse/schedule/2023.json');
  assert.equal(calls.updateManifestEntry[0][0].recordCount, MIN_SCHEDULE_GAMES);
  assert.equal(calls.updateManifestEntry[0][0].inProgress, false);
});

// ─── --all: no per-season fetch to ignore — schedule fetches the combined CSV once regardless ──

test('updateSchedule: --all processes every season found in the ONE combined fetch (no re-fetch)', async () => {
  let fetchCount = 0;
  const csv = [makeSchedCsv(2022, MIN_SCHEDULE_GAMES), makeSchedCsv(2023, MIN_SCHEDULE_GAMES).split('\n').slice(1)]
    .flat().join('\n');
  const { deps, calls } = spyDeps({
    fetchSchedulesCsv: async () => { fetchCount++; return csv; },
    readJson: () => null,
  });
  await updateSchedule({ all: true, dryRun: false, deps });
  assert.equal(fetchCount, 1, 'the combined CSV is fetched exactly once regardless of how many seasons --all covers');
  assert.equal(calls.writeJsonStable.length, 2, 'one data-file write per season found');
});
