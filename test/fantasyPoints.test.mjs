/**
 * test/fantasyPoints.test.mjs — Port fidelity tests for lib/fantasyPoints.mjs.
 * Run with: node --test (or npm test).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateFantasyPoints, RATE_KEYS } from '../lib/fantasyPoints.mjs';
import { readJson } from '../lib/io.mjs';
import { buildInBasisOutcomes } from '../scripts/grade-snapshot.mjs';
import fs from 'fs';

test('calculateFantasyPoints: app sanity — pass_yd + pass_td', () => {
  const result = calculateFantasyPoints(
    { pass_yd: 300, pass_td: 3 },
    { pass_yd: 0.04, pass_td: 4 }
  );
  assert.equal(result, 24);
});

test('calculateFantasyPoints: null multiplier is skipped', () => {
  const result = calculateFantasyPoints(
    { rec: 5 },
    { rec: null, pass_yd: 0.04 }
  );
  assert.equal(result, 0);
});

test('calculateFantasyPoints: absent stat is skipped', () => {
  const result = calculateFantasyPoints(
    { pass_yd: 100 },
    { pass_yd: 0.04, rec: 0.5 }
  );
  assert.equal(result, 4);
});

test('calculateFantasyPoints: 2-dp rounding (rec 0.5 * 3 = 1.5)', () => {
  const result = calculateFantasyPoints({ rec: 0.5 }, { rec: 3 });
  assert.equal(result, 1.5);
});

test('calculateFantasyPoints: rate key in stats but not in scoringSettings is ignored', () => {
  const result = calculateFantasyPoints(
    { rec: 80, rec_ypr: 999 },
    { rec: 0.5 }
  );
  assert.equal(result, 40);
});

// ═══════════════════════════════════════════════════════════════════
// RATE_KEYS — completing the `_lng` family (rate-keys-lng.md, C4)
//
// The guard's MECHANISM is already behaviourally tested (test/grade-routing.test.mjs
// scores rec_ypr and asserts it contributes 0 to actualPPG; test/panel-integration.test.mjs
// exercises the same on the panel path; scripts/grade-snapshot.mjs --self-test covers it
// again). What these tests add is coverage of WHICH KEYS belong in the set — nothing
// previously asserted the `_lng` family, and nothing would notice a twelfth arriving.
// ═══════════════════════════════════════════════════════════════════

const LNG_KEYS = [
  'def_kr_lng', 'def_pr_lng', 'fgm_lng', 'kr_lng', 'pass_lng', 'pass_td_lng',
  'pr_lng', 'rec_lng', 'rec_td_lng', 'rush_lng', 'rush_td_lng',
];

test('RATE_KEYS: all eleven `_lng` keys are present', () => {
  for (const k of LNG_KEYS) {
    assert.ok(RATE_KEYS.has(k), `RATE_KEYS is missing ${k}`);
  }
});

test('RATE_KEYS: full 29-key set — the pre-existing 18 plus the 11 `_lng` keys, no more no less', () => {
  const EXPECTED = [
    'cmp_pct', 'def_kr_lng', 'def_kr_ypa', 'def_pr_lng', 'def_pr_ypa', 'down_3_pct',
    'down_4_pct', 'fgm_lng', 'fgm_pct', 'g2g_pct', 'kr_lng', 'kr_ypa', 'pass_lng',
    'pass_rtg', 'pass_td_lng', 'pass_ypa', 'pass_ypc', 'pos_rank_half_ppr',
    'pos_rank_ppr', 'pos_rank_std', 'pr_lng', 'pr_ypa', 'rec_lng', 'rec_td_lng',
    'rec_ypr', 'rush_lng', 'rush_td_lng', 'rush_ypa', 'rz_pct',
  ].sort();
  assert.deepEqual([...RATE_KEYS].sort(), EXPECTED);
  assert.equal(RATE_KEYS.size, 29);
});

test('RATE_KEYS mechanism, re-parameterised onto a new key: rec_lng scored non-zero is excluded and contributes 0', () => {
  // Duplicates coverage that already exists for rec_ypr (test/grade-routing.test.mjs) —
  // kept because it pins one of the NEW keys to the guard's behaviour, not because it is
  // the guard's first behavioural test (rate-keys-lng.md §1.4).
  const seasonTotals = {
    p1: { gamesPlayed: 10, stats: { rec: 50, rec_yd: 500, rec_lng: 45 } },
  };
  const scoringSettings = { rec: 0.5, rec_yd: 0.1, rec_lng: 3 };
  const result = buildInBasisOutcomes(seasonTotals, scoringSettings);
  assert.ok(result.excludedRateKeys.includes('rec_lng'), 'rec_lng is rate-excluded');
  // 50*0.5 + 500*0.1 = 75; rec_lng (45*3=135) must NOT be added.
  assert.equal(result.outcomes.get('p1').actualTotalPts, 75, 'rec_lng contributed 0');
});

test('RATE_KEYS recurrence guard: every `_lng` key in the served archive is covered', (t) => {
  const dir = 'nfl/season-totals';
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')) : [];
  if (files.length === 0) {
    t.skip('nfl/season-totals/*.json not present in this checkout (sparse checkout — keeps CI green)');
    return;
  }
  assert.ok(files.length >= 10, `expected a floor on files scanned, got ${files.length} — guard against a vacuous pass`);

  // Scan ALL rows, including TEAM_* — buildInBasisOutcomes has no entity filter, so a
  // TEAM_*-only `_lng` key would be scored and a non-TEAM_* scan would miss it (today
  // TEAM_* carries 9 of the 11, so a filtered scan would be adequate only by coincidence).
  const seenLngKeys = new Set();
  for (const file of files) {
    const data = readJson(`${dir}/${file}`);
    // A file can legitimately vanish mid-scan: other test files (e.g.
    // test/grade-routing.test.mjs) write/unlink a transient sentinel-year fixture
    // under this same real directory, and node:test runs files concurrently.
    if (!data) continue;
    for (const rec of Object.values(data)) {
      for (const k in (rec.stats ?? {})) {
        if (k.endsWith('_lng')) seenLngKeys.add(k);
      }
    }
  }
  assert.ok(seenLngKeys.size > 0, 'expected at least one `_lng` key in the archive — the scan itself may be broken');
  for (const k of seenLngKeys) {
    assert.ok(RATE_KEYS.has(k), `archive key ${k} ends in _lng but is not in RATE_KEYS — a twelfth key has arrived`);
  }
});
