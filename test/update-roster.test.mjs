/**
 * test/update-roster.test.mjs — characterization net for updateRoster's branch matrix
 * (season-ingest-net.md §5). Roster carries three of the eight divergence axes: single-season
 * (no --all), a last-checked marker written on BOTH the dedup-hit and write paths (axis 2),
 * and a force gate that fires BEFORE the dry-run exit — so `--dry-run` on a changed past
 * season THROWS where every sibling family reports a plan instead (axis 3). This file pins
 * that ordering exactly as it is today (§2.2 — characterize, do not correct).
 *
 * Driven entirely through the `deps` I/O seam: `deps.fetchRosterCsv` controls what "the fetch
 * returned" means (including the not-published null case, per §5's guidance — no fetch mock
 * needed now that deps exists), `deps.readJson` controls what "already on disk" means, and
 * `deps.writeJsonStable`/`deps.updateManifestEntry` are spies instead of real I/O. No test
 * writes into nflverse/, nfl/, or manifest.json.
 *
 * Run with: node --test  (or npm test)
 */

import { test } from 'node:test';
import assert   from 'node:assert/strict';

import { updateRoster } from '../scripts/update-roster.mjs';
import { MIN_ROSTER_IDS } from '../lib/nflverse.mjs';

const ROSTER_HEADER = 'season,team,position,depth_chart_position,status,full_name,sleeper_id';

/** count valid roster rows for `season`, well above MIN_ROSTER_IDS when count is large. */
function makeRosterCsv(count, season) {
  const rows = [ROSTER_HEADER];
  for (let i = 0; i < count; i++) {
    rows.push(`${season},BUF,QB,QB,ACT,Player ${i},${100000 + i}`);
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

// ═══════════════════════════════════════════════════════════════════
// not published
// ═══════════════════════════════════════════════════════════════════

test('updateRoster: fetchRosterCsv returns null → returns cleanly, nothing written', async () => {
  const { deps, calls } = spyDeps({ fetchRosterCsv: async () => null });
  await updateRoster({ year: 2023, deps });
  assert.equal(calls.writeJsonStable.length, 0);
  assert.equal(calls.updateManifestEntry.length, 0);
});

// ═══════════════════════════════════════════════════════════════════
// sparsity gate
// ═══════════════════════════════════════════════════════════════════

test('updateRoster: rowCount < MIN_ROSTER_IDS → returns cleanly, nothing written', async () => {
  const csv = makeRosterCsv(5, 2023);
  const { deps, calls } = spyDeps({ fetchRosterCsv: async () => csv });
  await updateRoster({ year: 2023, deps });
  assert.equal(calls.writeJsonStable.length, 0);
  assert.equal(calls.updateManifestEntry.length, 0);
});

// ═══════════════════════════════════════════════════════════════════
// dedup hit — axis 2: the last-checked marker is written on THIS path too
// ═══════════════════════════════════════════════════════════════════

test('updateRoster: dedup hit (non-dry-run) writes ONLY the last-checked marker, not the data file', async () => {
  const csv = makeRosterCsv(MIN_ROSTER_IDS, 2023);
  // Build the exact players object parseRosterCsv would produce, so its hash matches.
  const { parseRosterCsv } = await import('../lib/nflverse.mjs');
  const { players } = parseRosterCsv(csv);
  const { deps, calls } = spyDeps({
    fetchRosterCsv: async () => csv,
    readJson: (path) => (path === 'nflverse/roster/2023.json' ? { players } : null),
  });
  await updateRoster({ year: 2023, dryRun: false, deps });
  assert.equal(calls.writeJsonStable.length, 1, 'only the marker should be written');
  const [path, body] = calls.writeJsonStable[0];
  assert.equal(path, 'nflverse/last-checked-roster.json');
  assert.equal(body.identical, true);
  assert.equal(calls.updateManifestEntry.length, 0);
});

test('updateRoster: dedup hit (dry-run) writes NOTHING — not even the marker', async () => {
  const csv = makeRosterCsv(MIN_ROSTER_IDS, 2023);
  const { parseRosterCsv } = await import('../lib/nflverse.mjs');
  const { players } = parseRosterCsv(csv);
  const { deps, calls } = spyDeps({
    fetchRosterCsv: async () => csv,
    readJson: (path) => (path === 'nflverse/roster/2023.json' ? { players } : null),
  });
  await updateRoster({ year: 2023, dryRun: true, deps });
  assert.equal(calls.writeJsonStable.length, 0);
  assert.equal(calls.updateManifestEntry.length, 0);
});

// ═══════════════════════════════════════════════════════════════════
// force gate — axis 3: fires BEFORE the dry-run exit (characterized, not corrected)
// ═══════════════════════════════════════════════════════════════════

test('updateRoster: force gate throws on a changed past season without --force (non-dry-run)', async () => {
  const csv = makeRosterCsv(MIN_ROSTER_IDS, 2023);
  const { deps } = spyDeps({
    fetchRosterCsv: async () => csv,
    // Different content (different rowCount) than fresh → dedup miss, so the force gate is reached.
    readJson: (path) => (path === 'nflverse/roster/2023.json'
      ? { players: { '1': { team: 'KC', position: 'QB', status: 'ACT', fullName: 'Someone Else' } } }
      : null),
  });
  await assert.rejects(
    () => updateRoster({ year: 2023, dryRun: false, force: false, deps }),
    /already exists for completed season 2023/
  );
});

test('updateRoster: force gate STILL THROWS under --dry-run — the axis-3 characterization', async () => {
  const csv = makeRosterCsv(MIN_ROSTER_IDS, 2023);
  const { deps } = spyDeps({
    fetchRosterCsv: async () => csv,
    readJson: (path) => (path === 'nflverse/roster/2023.json'
      ? { players: { '1': { team: 'KC', position: 'QB', status: 'ACT', fullName: 'Someone Else' } } }
      : null),
  });
  // Every sibling family reports a dry-run plan here instead of throwing (§1.1 axis 3).
  // Roster's force gate precedes its dry-run exit, so --dry-run on a changed past season
  // still throws. This is the divergence §11.1 records and does not correct.
  await assert.rejects(
    () => updateRoster({ year: 2023, dryRun: true, force: false, deps }),
    /already exists for completed season 2023/
  );
});

// ═══════════════════════════════════════════════════════════════════
// dry-run (clean exit — reached only when the force gate does not fire)
// ═══════════════════════════════════════════════════════════════════

test('updateRoster: dry-run reports a plan and writes nothing when the force gate does not fire', async () => {
  const csv = makeRosterCsv(MIN_ROSTER_IDS, 2026); // current season → not isPast, force gate skipped
  const { deps, calls } = spyDeps({
    fetchCurrentNflSeason: async () => 2026,
    fetchRosterCsv: async () => csv,
    readJson: (path) => (path === 'nflverse/roster/2026.json'
      ? { players: { '1': { team: 'KC', position: 'QB', status: 'ACT', fullName: 'Someone Else' } } }
      : null),
  });
  await updateRoster({ year: 2026, dryRun: true, deps });
  assert.equal(calls.writeJsonStable.length, 0);
  assert.equal(calls.updateManifestEntry.length, 0);
});

// ═══════════════════════════════════════════════════════════════════
// write path — axis 2 again: the marker is ALSO written here, plus the data file + manifest
// ═══════════════════════════════════════════════════════════════════

test('updateRoster: write path — data file, manifest entry, and the last-checked marker, all written', async () => {
  const csv = makeRosterCsv(MIN_ROSTER_IDS, 2023);
  const { deps, calls } = spyDeps({
    fetchRosterCsv: async () => csv,
    readJson: () => null, // no existing file — dedup miss, force gate never applies
  });
  await updateRoster({ year: 2023, dryRun: false, deps });

  assert.equal(calls.writeJsonStable.length, 2, 'data file + last-checked marker');
  const [dataCall, markerCall] = calls.writeJsonStable;
  assert.equal(dataCall[0], 'nflverse/roster/2023.json');
  assert.deepEqual(Object.keys(dataCall[1]).sort(), ['generatedAt', 'players', 'rowCount', 'schemaVersion', 'season'].sort());
  assert.equal(dataCall[1].rowCount, MIN_ROSTER_IDS);
  assert.equal(markerCall[0], 'nflverse/last-checked-roster.json');
  assert.equal(markerCall[1].identical, false);
  assert.equal(markerCall[1].file, 'nflverse/roster/2023.json');

  assert.equal(calls.updateManifestEntry.length, 1);
  assert.equal(calls.updateManifestEntry[0][0].path, 'nflverse/roster/2023.json');
  assert.equal(calls.updateManifestEntry[0][0].recordCount, MIN_ROSTER_IDS);
  assert.equal(calls.updateManifestEntry[0][0].inProgress, false);
});
