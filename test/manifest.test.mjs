import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { readManifest } from '../lib/manifest.mjs';
import {
  MIN_SCHEDULE_SEASON,
  MIN_GAMELOG_SEASON,
  MIN_TEAMCONTEXT_SEASON,
  MIN_OLINE_SEASON,
  MIN_SNAPS_SEASON,
} from '../lib/nflverse.mjs';

test('manifest: no retired raw/stats- entries remain', () => {
  const m = readManifest();
  const leftover = Object.keys(m.files).filter(k => k.startsWith('raw/stats-'));
  assert.deepEqual(leftover, [], `unexpected raw/stats entries: ${leftover.length}`);
});

test('manifest: no raw/stats-*.json files on disk', () => {
  const present = fs.readdirSync('raw').filter(f => f.startsWith('stats-'));
  assert.deepEqual(present, [], `unexpected raw/stats files: ${present.length}`);
});

test('manifest: no retired raw/cfbd-players entries remain', () => {
  const m = readManifest();
  const leftover = Object.keys(m.files).filter(k => k.startsWith('raw/cfbd-players-'));
  assert.deepEqual(leftover, [], `unexpected raw/cfbd-players entries: ${leftover.length}`);
});

test('manifest: no raw/cfbd-players-*.json files on disk', () => {
  const present = fs.readdirSync('raw').filter(f => f.startsWith('cfbd-players-'));
  assert.deepEqual(present, [], `unexpected raw/cfbd-players files: ${present.length}`);
});

// ═══════════════════════════════════════════════════════════════════
// §5.1 — coverage: contiguity from each season-keyed family's floor to its
// own maximum year present. currentSeason is deliberately NOT an upper
// bound here — fetchCurrentNflSeason() is a live Sleeper API call, not
// permissible in this network-free suite. A family simply not having
// reached year N yet is not a failure; a GAP inside [floor, max] is.
// ═══════════════════════════════════════════════════════════════════

/** Years present in manifest.files for a given `<prefix>/<year>.json` family. */
function yearsForFamily(files, prefix) {
  const re = new RegExp(`^${prefix}/(\\d{4})\\.json$`);
  return Object.keys(files)
    .map(k => k.match(re)?.[1])
    .filter(Boolean)
    .map(Number)
    .sort((a, b) => a - b);
}

// Four floors are enforced in ingest (imported — production constants). The other six gate
// nothing (no MIN_*_SEASON constant exists for them, and inventing one purely for this test to
// read would put an inert value beside behaviour-enforcing ones with nothing marking the
// difference — see task §5.1). Declared here, each citing its data-catalog.md coverage row, so
// this test is honest about being the second reader of that floor rather than the first.
const LOCAL_FLOORS = {
  'nflverse/advstats': 2012,     // data-catalog.md:37 coverage row — "2012–2025"
  'nflverse/roster': 2016,       // data-catalog.md:113 — 2012–2015 exist upstream, fail MIN_ROSTER_IDS
  'nfl/season-totals': 2012,     // data-catalog.md:37 coverage row — "2012–2025"
  'college/passing': 2017,       // data-catalog.md:51 — "2017–2025; pre-2017 unbackfilled"
  'college/receiving': 2017,     // data-catalog.md — same family, same coverage row
  'college/rushing': 2017,       // data-catalog.md — same family, same coverage row
};

const FAMILY_FLOORS = {
  'nflverse/schedule': MIN_SCHEDULE_SEASON,
  'nflverse/gamelogs': MIN_GAMELOG_SEASON,
  'nflverse/teamcontext': MIN_TEAMCONTEXT_SEASON,
  'nflverse/oline': MIN_OLINE_SEASON,
  'nflverse/snaps': MIN_SNAPS_SEASON,
  ...LOCAL_FLOORS,
};

test('manifest: eleven season-keyed families are contiguous from their floor to their own max year', () => {
  const m = readManifest();
  const families = Object.keys(FAMILY_FLOORS);
  assert.equal(families.length, 11, 'expected exactly eleven families in the coverage table');

  for (const [family, floor] of Object.entries(FAMILY_FLOORS)) {
    const years = yearsForFamily(m.files, family).filter(y => y >= floor);
    if (years.length === 0) continue; // not having reached the floor yet is not a gap
    const max = years[years.length - 1];
    const missing = [];
    for (let y = floor; y <= max; y++) {
      if (!years.includes(y)) missing.push(y);
    }
    assert.deepEqual(missing, [], `${family}: gap(s) in [${floor}, ${max}]: ${missing.join(', ')}`);
  }
});

// ═══════════════════════════════════════════════════════════════════
// §5.2 — flag truth: the D-5 tripwire. Deterministic, network-free.
// ═══════════════════════════════════════════════════════════════════

test('manifest: every nfl/season-totals year strictly below the family max has inProgress:false', () => {
  const m = readManifest();
  const years = yearsForFamily(m.files, 'nfl/season-totals');
  const max = years[years.length - 1];
  for (const y of years) {
    if (y >= max) continue;
    const entry = m.files[`nfl/season-totals/${y}.json`];
    assert.equal(entry.inProgress, false, `nfl/season-totals/${y}.json (below max ${max}) must be inProgress:false`);
  }
});

// ═══════════════════════════════════════════════════════════════════
// §5.4 — field completeness. No prefix exemptions.
// ═══════════════════════════════════════════════════════════════════

test('manifest: every files entry carries lastModified, schemaVersion, recordCount, inProgress', () => {
  const m = readManifest();
  const incomplete = Object.entries(m.files)
    .filter(([, entry]) => !entry.lastModified || !entry.schemaVersion || entry.recordCount === undefined || entry.inProgress === undefined)
    .map(([path]) => path);
  assert.deepEqual(incomplete, [], `entries missing a required field: ${incomplete.join(', ')}`);
});

// ═══════════════════════════════════════════════════════════════════
// D2 §D2 — schemaVersion is written twice (the output file, the manifest
// entry) and nothing cross-checks them; pin that they agree.
//
// Fix pass 1 item 4: comparing the LIVE nflverse/playerids.json and its live
// manifest entry passed on the pre-change state (both still schemaVersion 1,
// because this PR does not regenerate the data file — the Wednesday Action
// owns that write) and would pass on a broken v2 write just as easily, since
// neither side had actually moved. Pin the two write-time literals in
// scripts/update-playerids.mjs directly instead — the output object's
// schemaVersion and the updateManifestEntry call's schemaVersion — so a future
// edit to one without the other fails this test.
// ═══════════════════════════════════════════════════════════════════

test('manifest: playerids write path keeps the file schemaVersion and its manifest entry in sync', () => {
  const src = fs.readFileSync('scripts/update-playerids.mjs', 'utf8');

  const outputMatch   = src.match(/const output = \{[\s\S]*?schemaVersion:\s*(\d+)/);
  const manifestMatch = src.match(/updateManifestEntry\(\{[\s\S]*?schemaVersion:\s*(\d+)/);

  assert.ok(outputMatch, 'could not find the written output object\'s schemaVersion literal');
  assert.ok(manifestMatch, 'could not find the updateManifestEntry call\'s schemaVersion literal');
  assert.equal(
    outputMatch[1], manifestMatch[1],
    'nflverse/playerids.json schemaVersion and its manifest entry schemaVersion have drifted apart'
  );
});
