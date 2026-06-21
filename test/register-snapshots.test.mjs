/**
 * test/register-snapshots.test.mjs — Unit tests for shouldSkipSnapshot helper.
 *
 * Run with: node --test  (or npm test)
 */

import { test } from 'node:test';
import assert   from 'node:assert/strict';

import { shouldSkipSnapshot } from '../scripts/register-snapshots.mjs';

test('shouldSkipSnapshot: skips when recordCount and schemaVersion both match', () => {
  const existing = { recordCount: 350, schemaVersion: 2, lastModified: '2026-01-01T00:00:00.000Z' };
  assert.equal(shouldSkipSnapshot(existing, 350, 2), true);
});

test('shouldSkipSnapshot: registers when recordCount differs', () => {
  const existing = { recordCount: 349, schemaVersion: 2 };
  assert.equal(shouldSkipSnapshot(existing, 350, 2), false);
});

test('shouldSkipSnapshot: registers when schemaVersion differs', () => {
  const existing = { recordCount: 350, schemaVersion: 1 };
  assert.equal(shouldSkipSnapshot(existing, 350, 2), false);
});

test('shouldSkipSnapshot: registers when no existing entry (new snapshot)', () => {
  assert.equal(shouldSkipSnapshot(undefined, 350, 2), false);
  assert.equal(shouldSkipSnapshot(null, 350, 2), false);
});
