/**
 * test/enrichment.test.mjs — Unit tests for lib/enrichment.mjs validateEntry / validateAll.
 *
 * Run with: node --test  (or npm test)
 *
 * Coverage:
 *   A. validateEntry: valid baseline coaching entry passes
 *   B. validateEntry: invalid team abbreviation → throws
 *   C. validateEntry: injury-segment orphan (player absent from season-totals) → throws
 *   D. validateAll: duplicate id in entries → throws
 */

import { test } from 'node:test';
import assert   from 'node:assert/strict';
import fs       from 'node:fs';
import os       from 'node:os';
import path     from 'node:path';

import { validateEntry, validateAll, generateId } from '../lib/enrichment.mjs';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const coachingFields = { year: 2023, team: 'BUF', role: 'HC', name: 'Sean McDermott' };
const validCoaching  = { id: generateId('coaching', coachingFields), ...coachingFields };

// ═══════════════════════════════════════════════════════════════════
// A. validateEntry: valid baseline
// ═══════════════════════════════════════════════════════════════════

test('validateEntry: valid baseline coaching entry passes', () => {
  assert.doesNotThrow(() => validateEntry('coaching', validCoaching));
});

// ═══════════════════════════════════════════════════════════════════
// B. validateEntry: invalid team
// ═══════════════════════════════════════════════════════════════════

test('validateEntry: invalid team abbreviation throws', () => {
  assert.throws(
    () => validateEntry('coaching', { ...validCoaching, team: 'INVALID' }),
    /invalid NFL team abbreviation/
  );
});

// ═══════════════════════════════════════════════════════════════════
// C. validateEntry: injury-segment orphan
// ═══════════════════════════════════════════════════════════════════

test('validateEntry: injury entry for player absent from season-totals throws (orphan)', () => {
  // 'nonexistent-player-xyz' won't be a key in nfl/season-totals/2023.json
  const injuryFields = { playerId: 'nonexistent-player-xyz', year: 2023, segmentStartWeek: 1 };
  const injuryEntry  = { id: generateId('injuries', injuryFields), ...injuryFields };
  assert.throws(
    () => validateEntry('injuries', injuryEntry),
    /no season-totals data found/
  );
});

// ═══════════════════════════════════════════════════════════════════
// D. validateAll: duplicate id
// ═══════════════════════════════════════════════════════════════════

test('validateAll: two scheme entries sharing the same id → throws duplicate id error', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'enrich-test-'));

  const sameId = 'scheme-2023-BUF-test00';
  const dupPayload = {
    schemaVersion: 1,
    entries: [
      { id: sameId, year: 2023, team: 'BUF', offense: 'wide zone' },
      { id: sameId, year: 2023, team: 'KC',  offense: 'air raid' }, // same id, different team
    ],
  };

  fs.writeFileSync(path.join(tmpDir, 'scheme.json'), JSON.stringify(dupPayload), 'utf8');
  try {
    assert.throws(() => validateAll({}, tmpDir), /duplicate id/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
});
