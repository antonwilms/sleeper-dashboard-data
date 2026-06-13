/**
 * test/import-snapshot.test.mjs — Unit tests for the pure helpers in
 * bin/import-snapshot.mjs. Run with: node --test (or npm test).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pickLatestExportZip,
  parseSnapshotDateFromEntry,
  isValidSnapshotDate,
  selectMissingSnapshots,
} from '../bin/import-snapshot.mjs';

// ─── pickLatestExportZip ──────────────────────────────────────────────────────

test('pickLatestExportZip: returns newest matching entry', () => {
  const entries = [
    { name: 'sleeper-dashboard-export-2026-06-07.zip', mtimeMs: 100 },
    { name: 'sleeper-dashboard-export-2026-06-08.zip', mtimeMs: 200 },
    { name: 'other.zip',                               mtimeMs: 300 },
  ];
  const result = pickLatestExportZip(entries);
  assert.equal(result.name, 'sleeper-dashboard-export-2026-06-08.zip');
});

test('pickLatestExportZip: returns null for empty array', () => {
  assert.equal(pickLatestExportZip([]), null);
});

test('pickLatestExportZip: returns null when no entries match', () => {
  const entries = [
    { name: 'other.zip',  mtimeMs: 100 },
    { name: 'random.txt', mtimeMs: 200 },
  ];
  assert.equal(pickLatestExportZip(entries), null);
});

test('pickLatestExportZip: match is case-insensitive', () => {
  const entries = [{ name: 'Sleeper-Dashboard-Export-2026-06-07.ZIP', mtimeMs: 100 }];
  const result = pickLatestExportZip(entries);
  assert.ok(result !== null);
  assert.equal(result.name, 'Sleeper-Dashboard-Export-2026-06-07.ZIP');
});

// ─── parseSnapshotDateFromEntry ───────────────────────────────────────────────

test('parseSnapshotDateFromEntry: parses valid entry', () => {
  assert.equal(parseSnapshotDateFromEntry('snapshots/2026-06-07.json'), '2026-06-07');
});

test('parseSnapshotDateFromEntry: returns null for folder entry', () => {
  assert.equal(parseSnapshotDateFromEntry('snapshots/'), null);
});

test('parseSnapshotDateFromEntry: returns null for non-json file in snapshots/', () => {
  assert.equal(parseSnapshotDateFromEntry('snapshots/foo.txt'), null);
});

test('parseSnapshotDateFromEntry: returns null for json outside snapshots/', () => {
  assert.equal(parseSnapshotDateFromEntry('other/2026-06-07.json'), null);
});

test('parseSnapshotDateFromEntry: returns null for .gitkeep', () => {
  assert.equal(parseSnapshotDateFromEntry('snapshots/.gitkeep'), null);
});

// ─── isValidSnapshotDate ──────────────────────────────────────────────────────

test('isValidSnapshotDate: valid date', () => {
  assert.equal(isValidSnapshotDate('2026-06-07'), true);
});

test('isValidSnapshotDate: invalid month 13', () => {
  assert.equal(isValidSnapshotDate('2026-13-40'), false);
});

test('isValidSnapshotDate: non-zero-padded month/day', () => {
  assert.equal(isValidSnapshotDate('2026-6-7'), false);
});

test('isValidSnapshotDate: garbage string', () => {
  assert.equal(isValidSnapshotDate('garbage'), false);
});

test('isValidSnapshotDate: impossible date (Feb 30)', () => {
  assert.equal(isValidSnapshotDate('2026-02-30'), false);
});

test('isValidSnapshotDate: empty string', () => {
  assert.equal(isValidSnapshotDate(''), false);
});

// ─── selectMissingSnapshots ───────────────────────────────────────────────────

// Regression test for the actual bug: multi-snapshot ZIP with some already present.
test('selectMissingSnapshots: multi-snapshot, some present — returns missing in ascending order', () => {
  const zipEntries = [
    'snapshots/',
    'snapshots/2026-06-06.json',
    'snapshots/2026-06-07.json',
    'snapshots/2026-06-08.json',
    'snapshots/2026-06-09.json',
    'snapshots/2026-06-13.json',
  ];
  const existing = new Set(['2026-06-06']);
  const result = selectMissingSnapshots(zipEntries, existing);
  assert.deepEqual(result.map(r => r.date), [
    '2026-06-07', '2026-06-08', '2026-06-09', '2026-06-13',
  ]);
  assert.equal(result[0].entry, 'snapshots/2026-06-07.json');
});

test('selectMissingSnapshots: all present → empty array', () => {
  const zipEntries = ['snapshots/2026-06-06.json', 'snapshots/2026-06-07.json'];
  const existing = new Set(['2026-06-06', '2026-06-07']);
  assert.deepEqual(selectMissingSnapshots(zipEntries, existing), []);
});

test('selectMissingSnapshots: none present → all dates ascending', () => {
  const zipEntries = [
    'snapshots/2026-06-09.json',
    'snapshots/2026-06-07.json',
    'snapshots/2026-06-08.json',
  ];
  const result = selectMissingSnapshots(zipEntries, new Set());
  assert.deepEqual(result.map(r => r.date), ['2026-06-07', '2026-06-08', '2026-06-09']);
});

test('selectMissingSnapshots: ignores non-date and non-json entries', () => {
  const zipEntries = [
    'snapshots/',
    'snapshots/notes.txt',
    'snapshots/2026-13-40.json',   // invalid date
    'snapshots/2026-06-07.json',   // valid
  ];
  const result = selectMissingSnapshots(zipEntries, new Set());
  assert.deepEqual(result.map(r => r.date), ['2026-06-07']);
});

test('selectMissingSnapshots: single new date → one-element array', () => {
  const zipEntries = ['snapshots/2026-06-10.json'];
  const result = selectMissingSnapshots(zipEntries, new Set());
  assert.equal(result.length, 1);
  assert.equal(result[0].date, '2026-06-10');
  assert.equal(result[0].entry, 'snapshots/2026-06-10.json');
});

test('selectMissingSnapshots: duplicate date entries are de-duped', () => {
  const zipEntries = ['snapshots/2026-06-07.json', 'snapshots/2026-06-07.json'];
  const result = selectMissingSnapshots(zipEntries, new Set());
  assert.equal(result.length, 1);
});
