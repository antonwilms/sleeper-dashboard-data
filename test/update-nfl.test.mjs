/**
 * test/update-nfl.test.mjs — Unit tests for nflHash content-hash helper, the §2.1/§2.2/§2.3
 * pure decision predicates, and the injected-deps control-flow tests
 * (in-season-season-totals.md §2).
 *
 * Run with: node --test  (or npm test)
 */

import { test } from 'node:test';
import assert   from 'node:assert/strict';

import { nflHash, hasNoData, shouldSkipCompletedSeason, updateNfl } from '../scripts/update-nfl.mjs';

test('nflHash: objects differing only in a points-neutral field (off_snp) hash differently', () => {
  const base = {
    '1': { fantasyPoints: 100.5, gamesPlayed: 17, off_snp: 800 },
    '2': { fantasyPoints:  80.0, gamesPlayed: 16, off_snp: 600 },
  };
  const updated = {
    '1': { fantasyPoints: 100.5, gamesPlayed: 17, off_snp: 820 }, // off_snp changed, points same
    '2': { fantasyPoints:  80.0, gamesPlayed: 16, off_snp: 600 },
  };
  assert.notEqual(nflHash(base), nflHash(updated));
});

test('nflHash: identical objects produce the same hash regardless of key insertion order', () => {
  const a = { '2': { fantasyPoints: 80.0, off_snp: 600 }, '1': { fantasyPoints: 100.5, off_snp: 800 } };
  const b = { '1': { fantasyPoints: 100.5, off_snp: 800 }, '2': { fantasyPoints: 80.0, off_snp: 600 } };
  assert.equal(nflHash(a), nflHash(b));
});

test('nflHash: objects differing only in `team` hash differently (backfill detects change)', () => {
  const base = {
    '1': { fantasyPoints: 100.5, gamesPlayed: 17, team: null },
    '2': { fantasyPoints:  80.0, gamesPlayed: 16, team: 'KC' },
  };
  const updated = {
    '1': { fantasyPoints: 100.5, gamesPlayed: 17, team: 'SF' }, // team changed
    '2': { fantasyPoints:  80.0, gamesPlayed: 16, team: 'KC' },
  };
  assert.notEqual(nflHash(base), nflHash(updated));
});

test('nflHash: same team field → same hash (re-run is a no-op)', () => {
  const a = { '1': { fantasyPoints: 100.5, team: 'KC' } };
  const b = { '1': { fantasyPoints: 100.5, team: 'KC' } };
  assert.equal(nflHash(a), nflHash(b));
});

// ═══════════════════════════════════════════════════════════════════
// §2.2 — hasNoData (preseason no-op)
// ═══════════════════════════════════════════════════════════════════

function emptyWeekData() {
  return Array.from({ length: 18 }, (_, i) => ({ week: i + 1, entries: [] }));
}

test('hasNoData: all 18 weeks empty (season has not started) → true', () => {
  assert.equal(hasNoData(emptyWeekData()), true);
});

test('hasNoData: even one week with an entry → false', () => {
  const weekData = emptyWeekData();
  weekData[3].entries.push({ player_id: '1', team: 'KC', stats: { gp: 1 } });
  assert.equal(hasNoData(weekData), false);
});

// ═══════════════════════════════════════════════════════════════════
// §2.3 — shouldSkipCompletedSeason (season-close skip, not refusal)
// ═══════════════════════════════════════════════════════════════════

test('shouldSkipCompletedSeason: completed season, no --force, no --dry-run → skip (the scheduled path)', () => {
  assert.equal(shouldSkipCompletedSeason({ inProgress: false, force: false, dryRun: false }), true);
});

test('shouldSkipCompletedSeason: completed season with --force → do not skip (interactive correction)', () => {
  assert.equal(shouldSkipCompletedSeason({ inProgress: false, force: true, dryRun: false }), false);
});

test('shouldSkipCompletedSeason: completed season with --dry-run (no --force) → do not skip (preview stays available)', () => {
  assert.equal(shouldSkipCompletedSeason({ inProgress: false, force: false, dryRun: true }), false);
});

test('shouldSkipCompletedSeason: in-progress season → never skip regardless of force/dryRun', () => {
  assert.equal(shouldSkipCompletedSeason({ inProgress: true, force: false, dryRun: false }), false);
  assert.equal(shouldSkipCompletedSeason({ inProgress: true, force: true, dryRun: true }), false);
});

// ═══════════════════════════════════════════════════════════════════
// updateNfl — injected-deps control-flow tests
// ═══════════════════════════════════════════════════════════════════

function countingFn(impl) {
  const fn = (...args) => { fn.calls.push(args); return impl?.(...args); };
  fn.calls = [];
  return fn;
}

test('updateNfl §2.2: empty Sleeper response → returns cleanly, no write, no throw', async () => {
  const writeJsonStable = countingFn();
  const updateManifestEntry = countingFn();
  await updateNfl({
    year: 2026,
    force: false,
    dryRun: false,
    deps: {
      fetchCurrentNflSeason: async () => 2026,          // in-progress — must reach the fetch step
      fetchSeasonWeeks: async () => emptyWeekData(),     // Sleeper: nothing yet
      readJson: () => null,
      writeJsonStable,
      updateManifestEntry,
      diffSummary: () => ({ identical: true, text: 'no change' }),
      setStepOutput: () => {},
    },
  });
  assert.equal(writeJsonStable.calls.length, 0);
  assert.equal(updateManifestEntry.calls.length, 0);
});

test('updateNfl §2.3: a resolved season older than current SKIPS — the stored file (B statuses, byeWeeks) is provably untouched', async () => {
  // The §2.3 regression scenario: state.season has rolled past `year`, so a freshly-computed
  // inProgress is false, while nothing about the manifest is consulted at all any more (the old
  // bug was trusting the manifest's stale existingEntry.inProgress). The stored file already
  // carries D-1-inferred 'B' statuses from the season's last real in-progress run.
  const storedFile = {
    '1': {
      team: 'KC',
      gamesPlayed: 16,
      byeWeeks: 1,
      dnpWeeks: 0,
      weeklyStatus: ['P','P','P','P','P','P','B','P','P','P','P','P','P','P','P','P','P','X'],
      weeklyPoints: { 1: 10, 2: 10, 3: 10, 4: 10, 5: 10, 6: 10, 8: 10, 9: 10, 10: 10, 11: 10, 12: 10, 13: 10, 14: 10, 15: 10, 16: 10, 17: 10 },
      fantasyPoints: 160,
      scoringBasis: 'half_ppr',
    },
  };
  const readJson = countingFn(path => (path === 'nfl/season-totals/2026.json' ? storedFile : null));
  const fetchSeasonWeeks = countingFn();
  const writeJsonStable = countingFn();
  const updateManifestEntry = countingFn();
  const setStepOutput = countingFn();

  await updateNfl({
    year: 2026,
    force: false,
    dryRun: false,
    deps: {
      fetchCurrentNflSeason: async () => 2027,   // year (2026) has rolled off current — the flip
      fetchSeasonWeeks,
      readJson,
      writeJsonStable,
      updateManifestEntry,
      diffSummary: () => { throw new Error('diffSummary must not be reached — the skip happens before any diff'); },
      setStepOutput,
    },
  });

  // No write at all — the stored file (and its 'B' statuses / byeWeeks) is untouched.
  assert.equal(writeJsonStable.calls.length, 0);
  assert.equal(updateManifestEntry.calls.length, 0);
  // The skip happens before the Sleeper fetch or the existing-file read — cheap, and it means
  // the schedule-drop/hash-diverge chain from the bug report never even begins.
  assert.equal(fetchSeasonWeeks.calls.length, 0);
  assert.equal(readJson.calls.length, 0);
  // §2.4 — the resolved season is still surfaced for the purge step even on a skip.
  assert.deepEqual(setStepOutput.calls[0], ['season', 2026]);

  // If the file HAD been read, this is what "untouched" means concretely — assert it against
  // the fixture itself, so the intent is legible even though readJson was never called above.
  assert.equal(storedFile['1'].weeklyStatus[6], 'B');
  assert.equal(storedFile['1'].byeWeeks, 1);
});

test('updateNfl §2.4: year omitted resolves to the current season, and it is surfaced via setStepOutput', async () => {
  const setStepOutput = countingFn();
  await updateNfl({
    force: false,
    dryRun: false,
    deps: {
      fetchCurrentNflSeason: async () => 2026,
      fetchSeasonWeeks: async () => emptyWeekData(), // preseason no-op — keeps this test to one assertion concern
      readJson: () => null,
      writeJsonStable: countingFn(),
      updateManifestEntry: countingFn(),
      diffSummary: () => ({ identical: true, text: 'no change' }),
      setStepOutput,
    },
  });
  assert.deepEqual(setStepOutput.calls[0], ['season', 2026]);
});
