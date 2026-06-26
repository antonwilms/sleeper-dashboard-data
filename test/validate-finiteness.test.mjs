import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findNonFinite, validateNflSeason } from '../lib/validate.mjs';

// ═══════════════════════════════════════════════════════════════════
// A. findNonFinite units
// ═══════════════════════════════════════════════════════════════════

test('findNonFinite: clean tree returns null', () => {
  assert.equal(findNonFinite({ a: 1, b: { c: 2.5 }, d: [3, 4] }), null);
});

test('findNonFinite: NaN in nested object — path and value correct', () => {
  const hit = findNonFinite({ stats: { pass_yd: NaN } });
  assert.equal(hit.path, 'stats.pass_yd');
  assert.ok(Number.isNaN(hit.value));
});

test('findNonFinite: Infinity at top level', () => {
  const hit = findNonFinite({ fantasyPoints: Infinity });
  assert.equal(hit.path, 'fantasyPoints');
  assert.equal(hit.value, Infinity);
});

test('findNonFinite: -Infinity inside nested array element', () => {
  const hit = findNonFinite({
    availability: { absenceSegments: [{ start: 1, end: 1, length: -Infinity }] },
  });
  assert.equal(hit.path, 'availability.absenceSegments[0].length');
});

test('findNonFinite: ignores non-numerics (strings, booleans, null)', () => {
  assert.equal(
    findNonFinite({
      weeklyStatus: ['P', 'X'],
      scoringBasis: 'half_ppr',
      availability: { returnedFromAbsence: false, absenceCause: 'unknown' },
    }),
    null
  );
});

// ═══════════════════════════════════════════════════════════════════
// B. End-to-end through validateNflSeason
// ═══════════════════════════════════════════════════════════════════

function validRecord(gp = 16) {
  const weeklyStatus = Array.from({ length: 18 }, (_, i) => (i < gp ? 'P' : 'X'));
  const weeklyPoints = {};
  for (let w = 1; w <= gp; w++) weeklyPoints[w] = 10;
  return {
    stats: { pass_yd: 100 },
    gamesPlayed: gp,
    gamesStarted: gp,
    byeWeeks: 0,
    dnpWeeks: 0,
    weeklyPoints,
    weeklyStatus,
    fantasyPoints: 100,
    scoringBasis: 'half_ppr',
    availability: {
      longestAbsence: 0,
      absenceSegments: [],
      firstWeek: 1,
      lastWeek: gp,
      returnedFromAbsence: false,
      absenceCause: 'unknown',
    },
  };
}

function makeTotals(n = 400) {
  const t = {};
  for (let i = 0; i < n; i++) t[String(i)] = validRecord(16);
  return t;
}

test('validateNflSeason: clean control — 400 valid records passes', () => {
  assert.doesNotThrow(() => validateNflSeason(makeTotals(400), { year: 9999 }));
});

test('validateNflSeason: corrupt stats.pass_yd = Infinity throws with path', () => {
  const t = makeTotals();
  t['0'].stats.pass_yd = Infinity;
  assert.throws(
    () => validateNflSeason(t, { year: 9999 }),
    /non-finite numeric at stats\.pass_yd/
  );
});

test('validateNflSeason: corrupt fantasyPoints = NaN throws with path', () => {
  const t = makeTotals();
  t['5'].fantasyPoints = NaN;
  assert.throws(
    () => validateNflSeason(t, { year: 9999 }),
    /non-finite numeric at fantasyPoints/
  );
});

test('validateNflSeason: corrupt absenceSegments[0].length = NaN throws with path', () => {
  const t = makeTotals();
  t['7'].availability.absenceSegments = [{ start: 1, end: 1, length: NaN }];
  assert.throws(
    () => validateNflSeason(t, { year: 9999 }),
    /absenceSegments\[0\]\.length/
  );
});

// ═══════════════════════════════════════════════════════════════════
// C. Team-domain validation
// ═══════════════════════════════════════════════════════════════════

test('validateNflSeason: team in SCHEDULE_TEAMS does not throw', () => {
  const t = makeTotals(400);
  // Assign a valid team to a subset of players
  t['0'].team = 'KC';
  t['1'].team = 'STL'; // historical
  t['2'].team = null;  // null allowed
  assert.doesNotThrow(() => validateNflSeason(t, { year: 9999 }));
});

test('validateNflSeason: team "XYZ" outside domain throws with player + abbr + year', () => {
  const t = makeTotals(400);
  t['5'].team = 'XYZ';
  assert.throws(
    () => validateNflSeason(t, { year: 9999 }),
    (err) => {
      assert.ok(err.message.includes('5'), 'should name the player id');
      assert.ok(err.message.includes('XYZ'), 'should name the bad abbr');
      assert.ok(err.message.includes('9999'), 'should include the year');
      return true;
    }
  );
});

test('validateNflSeason: team null does not trigger team-domain check', () => {
  const t = makeTotals(400);
  t['0'].team = null;
  assert.doesNotThrow(() => validateNflSeason(t, { year: 9999 }));
});
