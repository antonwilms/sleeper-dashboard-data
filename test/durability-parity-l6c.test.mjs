/**
 * test/durability-parity-l6c.test.mjs — D-67: DM parity on the short-season rule ('l6c') against the
 * post-boundary-10 capture 2026-10-30 (.claude/tasks/d67-dm-parity-l6c.md). Reads only test/fixtures/.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { parityReport, ABSENCE_DEFAULTS } from '../scripts/absence-run.mjs';

const FX = JSON.parse(fs.readFileSync(fileURLToPath(new URL('./fixtures/durability-parity-2026-10-30.json', import.meta.url)), 'utf8'));
const SKILL = ['QB', 'RB', 'WR', 'TE'];

test('DM-0 (l6c): fixture is the 3b92712 / 2026-10-30 build', () => {
  assert.equal(FX.sourceRev, '3b92712');
  assert.equal(FX.snapshot, '2026-10-30');
  assert.equal(Object.keys(FX.snapshotRows).length, 433);
  assert.deepEqual(Object.keys(FX.seasons).map(Number), Array.from({ length: 14 }, (_, i) => 2012 + i));
});

test('DM-1 (l6c): ≥ parityMin of veteran rows match under rule l6c', () => {
  const r = parityReport(FX, { rule: 'l6c' });
  for (const m of r.mismatches) console.log(`[DM-1 l6c] mismatch ${m.id} ${m.position}: mirror ${JSON.stringify(m.mirror)} vs snapshot ${JSON.stringify(m.snapshot)}`);
  console.log(`[DM-1 l6c] ${r.matched}/${r.rows} matched`);
  assert.ok(r.rows >= 400, `only ${r.rows} rows`);
  assert.ok(r.rate >= ABSENCE_DEFAULTS.parityMin, `parity ${r.rate}`);
});

test('state agreement: mirror shortSeasonState equals the snapshot\'s on every compared row', () => {
  const r = parityReport(FX, { rule: 'l6c' });
  assert.equal(r.stateRows, r.rows);
  assert.deepEqual(r.stateMismatches, []);
});

test('boundary-8 cross-check: every short/none row equals the mirror exactly', () => {
  const r = parityReport(FX, { rule: 'l6c' });
  const expected = Object.entries(FX.snapshotRows).filter(([id, s]) =>
    SKILL.includes(FX.positions[id]) && (s.shortSeasonState === 'short' || s.shortSeasonState === 'none')
    && parityReport({ ...FX, snapshotRows: { [id]: s } }, { rule: 'l6c' }).rows === 1).length;
  console.log(`[boundary 8] ${r.shortSeason.matched}/${r.shortSeason.rows} short/none rows exact`);
  assert.equal(r.shortSeason.rows, expected);
  assert.ok(r.shortSeason.rows >= 90, `only ${r.shortSeason.rows} short/none rows`);
  assert.equal(r.shortSeason.matched, r.shortSeason.rows, JSON.stringify(r.shortSeason.mismatches));
});

test('rule matters: default pre-l6c parity is strictly lower than l6c', () => {
  assert.ok(parityReport(FX).rate < parityReport(FX, { rule: 'l6c' }).rate);
});
