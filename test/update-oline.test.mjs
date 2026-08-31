/**
 * test/update-oline.test.mjs — characterization net for updateOline's branch matrix
 * (season-ingest-net.md §5), including axis 6's richest envelope: oline is the only family
 * that emits a literal `source` string alongside schemaVersion/season/generatedAt/rowCount/
 * teamCount/teams — this file pins that field explicitly, not just the others.
 *
 * Driven through the `deps` I/O seam: `deps.fetchDepthChartsCsv` controls the raw depth-chart
 * CSV per season (or its absence), `deps.readJson` controls what's "already on disk", and
 * `deps.writeJsonStable`/`deps.updateManifestEntry` are spies. No test writes into nflverse/,
 * nfl/, or manifest.json. Seasons are all >= MIN_OLINE_SEASON (2025) — earlier years hit a
 * legacy-schema asset before reaching anything this file's fixtures model.
 *
 * Run with: node --test  (or npm test)
 */

import { test } from 'node:test';
import assert   from 'node:assert/strict';

import { updateOline } from '../scripts/update-oline.mjs';
import { MIN_OLINE_ROWS, OLINE_SLOTS } from '../lib/nflverse.mjs';

const OLINE_HEADER = 'dt,team,player_name,espn_id,gsis_id,pos_abb,pos_rank';

const TEAMS_32 = [
  'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND',
  'JAX', 'KC', 'LA', 'LAC', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG', 'NYJ', 'PHI', 'PIT', 'SEA', 'SF',
  'TB', 'TEN', 'WAS',
];

/** All 32 real teams × 5 OL slots for `season` — exactly MIN_OLINE_ROWS (160), one state each. */
function makeOlineCsv(season) {
  const rows = [OLINE_HEADER];
  TEAMS_32.forEach((team, ti) => {
    const dt = `${season}-08-${String(1 + (ti % 27)).padStart(2, '0')}T09:00:00Z`;
    OLINE_SLOTS.forEach((slot, si) => {
      const n = ti * 10 + si;
      rows.push(`${dt},${team},Player ${team} ${slot},${9000000 + n},00-00${String(n).padStart(4, '0')},${slot},1`);
    });
  });
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

// ═══════════════════════════════════════════════════════════════════
// not published
// ═══════════════════════════════════════════════════════════════════

test('updateOline: fetchDepthChartsCsv returns null → season skipped, nothing written', async () => {
  const { deps, calls } = spyDeps({ fetchDepthChartsCsv: async () => null });
  await updateOline({ year: 2025, deps });
  assert.equal(calls.writeJsonStable.length, 0);
  assert.equal(calls.updateManifestEntry.length, 0);
});

// ═══════════════════════════════════════════════════════════════════
// sparsity gate
// ═══════════════════════════════════════════════════════════════════

test('updateOline: rowCount < MIN_OLINE_ROWS → skipped, nothing written', async () => {
  const csv = [OLINE_HEADER, '2025-08-01T09:00:00Z,KC,Player One,1,00-0001,LT,1'].join('\n');
  const { deps, calls } = spyDeps({ fetchDepthChartsCsv: async () => csv });
  await updateOline({ year: 2025, deps });
  assert.equal(calls.writeJsonStable.length, 0);
  assert.equal(calls.updateManifestEntry.length, 0);
});

// ═══════════════════════════════════════════════════════════════════
// dedup hit
// ═══════════════════════════════════════════════════════════════════

test('updateOline: dedup hit — nothing written', async () => {
  const csv = makeOlineCsv(2025);
  const { aggregateOlineStates } = await import('../lib/nflverse.mjs');
  const { teams } = aggregateOlineStates(csv, { season: 2025 });
  const { deps, calls } = spyDeps({
    fetchDepthChartsCsv: async () => csv,
    readJson: (path) => (path === 'nflverse/oline/2025.json' ? { teams } : null),
  });
  await updateOline({ year: 2025, deps });
  assert.equal(calls.writeJsonStable.length, 0);
  assert.equal(calls.updateManifestEntry.length, 0);
});

// ═══════════════════════════════════════════════════════════════════
// dry-run exits BEFORE the force gate (contrast roster's axis-3 ordering)
// ═══════════════════════════════════════════════════════════════════

test('updateOline: --dry-run on a changed past season reports a plan, does not throw', async () => {
  const csv = makeOlineCsv(2025);
  const { deps, calls } = spyDeps({
    fetchDepthChartsCsv: async () => csv,
    readJson: (path) => (path === 'nflverse/oline/2025.json' ? { teams: { XX: { states: [] } } } : null),
  });
  await assert.doesNotReject(() => updateOline({ year: 2025, dryRun: true, force: false, deps }));
  assert.equal(calls.writeJsonStable.length, 0);
});

// ═══════════════════════════════════════════════════════════════════
// force gate (non-dry-run)
// ═══════════════════════════════════════════════════════════════════

test('updateOline: force gate throws on a changed past season without --force', async () => {
  const csv = makeOlineCsv(2025);
  const { deps } = spyDeps({
    fetchDepthChartsCsv: async () => csv,
    readJson: (path) => (path === 'nflverse/oline/2025.json' ? { teams: { XX: { states: [] } } } : null),
  });
  await assert.rejects(
    () => updateOline({ year: 2025, dryRun: false, force: false, deps }),
    /already exists for completed season 2025/
  );
});

// ═══════════════════════════════════════════════════════════════════
// write path — axis 6: oline's own envelope, including the literal `source` string
// ═══════════════════════════════════════════════════════════════════

test('updateOline: write path — data file + manifest entry, including the literal source string', async () => {
  const csv = makeOlineCsv(2025);
  const { deps, calls } = spyDeps({ fetchDepthChartsCsv: async () => csv, readJson: () => null });
  await updateOline({ year: 2025, dryRun: false, deps });

  assert.equal(calls.writeJsonStable.length, 1);
  const [path, body] = calls.writeJsonStable[0];
  assert.equal(path, 'nflverse/oline/2025.json');
  assert.deepEqual(
    Object.keys(body).sort(),
    ['generatedAt', 'rowCount', 'schemaVersion', 'season', 'source', 'stateCount', 'teamCount', 'teams'].sort()
  );
  assert.equal(body.source, 'nflverse depth_charts (ESPN feed)');
  assert.equal(body.teamCount, 32);
  assert.equal(body.rowCount, MIN_OLINE_ROWS);

  assert.equal(calls.updateManifestEntry.length, 1);
  assert.equal(calls.updateManifestEntry[0][0].inProgress, false);
});

// ═══════════════════════════════════════════════════════════════════
// --all fetches per season
// ═══════════════════════════════════════════════════════════════════

test('updateOline --all: fetches once per season in range', async () => {
  const seen = [];
  const { deps } = spyDeps({
    fetchCurrentNflSeason: async () => 2026, // MIN_OLINE_SEASON..2026 = 2 seasons
    fetchDepthChartsCsv: async (season) => { seen.push(season); return null; },
  });
  await updateOline({ all: true, deps });
  assert.equal(seen.length, 2);
  assert.equal(new Set(seen).size, 2, 'one fetch per distinct season, no repeats');
});
