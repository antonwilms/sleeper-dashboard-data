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

// ═══════════════════════════════════════════════════════════════════
// D. Self-calibrating full-season floor (in-season-season-totals.md §2.1)
// ═══════════════════════════════════════════════════════════════════

function makeTotalsAtGp(n, gp) {
  const t = {};
  for (let i = 0; i < n; i++) t[String(i)] = validRecord(gp);
  return t;
}

test('§2.1: a synthetic maxGames=17 season derives threshold=14 — the old fixed floor', () => {
  // 400 players at gp=17; the derived threshold (17-3=14) is satisfied by those same players,
  // exactly as the old hardcoded `>= 14` floor was.
  //
  // NOTE: this is a SYNTHETIC shape, not "a complete season". Real 18-week seasons measure
  // maxGames = 18 (a traded player catches two different byes — exactly 2 such players in 2025),
  // so their derived threshold is 15, and the 16-game era derives 13. The task file first claimed
  // the new floor was numerically identical to 14 on any complete season; that was wrong. The
  // guard is unaffected either way — 1042 players clear the 2025 threshold against a floor of 30.
  assert.doesNotThrow(() => validateNflSeason(makeTotalsAtGp(400, 17), { year: 9999 }));
});

test('§2.1: a REAL-shaped 18-week season (maxGames=18 → threshold 15) passes', () => {
  // The shape modern seasons actually have, per the note above.
  const t = makeTotalsAtGp(400, 17);
  t['outlier'] = validRecord(18);   // the traded player who catches two byes and sets maxGames
  assert.doesNotThrow(() => validateNflSeason(t, { year: 9999 }));
});

test('§2.1: a synthetic 4-week season (maxGames=4, threshold=1) passes — impossible under the old fixed >=14 floor', () => {
  const t = makeTotalsAtGp(400, 4);
  assert.doesNotThrow(() => validateNflSeason(t, { year: 9999 }));
});

test('§2.1: mid-season maxGames=5 → threshold=2; a genuinely broken scrape (few players, no cluster) still throws', () => {
  // 400 "players" but only 10 have played any games at all (gp=5, well above threshold=2) —
  // a broken/partial scrape still yields far fewer than 30 clustered near the leader.
  const t = {};
  for (let i = 0; i < 10; i++) t[String(i)] = validRecord(5);
  for (let i = 10; i < 400; i++) t[String(i)] = validRecord(0);
  assert.throws(
    () => validateNflSeason(t, { year: 9999 }),
    /gamesPlayed ≥ 2/
  );
});

test('§2.1: maxGames=0 (all zero) floors the threshold at 1, not 0 or negative', () => {
  const t = makeTotalsAtGp(400, 0);
  assert.throws(
    () => validateNflSeason(t, { year: 9999 }),
    /gamesPlayed ≥ 1/
  );
});

// ═══════════════════════════════════════════════════════════════════
// C. weekly-scoring-keys (D-47) — weeklyStats rules
// ═══════════════════════════════════════════════════════════════════

function withWs(mut) {
  const t = makeTotals(400);
  t['0'].weeklyStats = { 1: { rec: 3 } };
  mut?.(t);
  return t;
}

test('validateNflSeason weeklyStats: a valid field passes; requireWeeklyStats absent → rows without it pass', () => {
  assert.doesNotThrow(() => validateNflSeason(withWs(), { year: 9999 }));
});

test('validateNflSeason weeklyStats: non-object throws', () => {
  assert.throws(() => validateNflSeason(withWs(t => { t['0'].weeklyStats = [1]; }), { year: 9999 }), /weeklyStats is not a plain object/);
});

test('validateNflSeason weeklyStats: a week that is not a P week throws', () => {
  assert.throws(() => validateNflSeason(withWs(t => { t['0'].weeklyStats = { 17: { rec: 1 } }; }), { year: 9999 }), /not a 'P' week/);
  assert.throws(() => validateNflSeason(withWs(t => { t['0'].weeklyStats = { x: { rec: 1 } }; }), { year: 9999 }), /not a 'P' week/);
});

test('validateNflSeason weeklyStats: a week value that is not an object throws', () => {
  assert.throws(() => validateNflSeason(withWs(t => { t['0'].weeklyStats = { 1: 5 }; }), { year: 9999 }), /weeklyStats\[1\] is not a plain object/);
});

test('validateNflSeason weeklyStats: zero / non-finite / non-number values throw', () => {
  for (const bad of [0, NaN, '3', null]) {
    assert.throws(() => validateNflSeason(withWs(t => { t['0'].weeklyStats = { 1: { rec: bad } }; }), { year: 9999 }), /non-zero number|non-finite/);
  }
});

test('validateNflSeason weeklyStats: an excluded key throws', () => {
  assert.throws(() => validateNflSeason(withWs(t => { t['0'].weeklyStats = { 1: { pts_half_ppr: 4 } }; }), { year: 9999 }), /excluded key "pts_half_ppr"/);
});

test('validateNflSeason weeklyStats: requireWeeklyStats rejects a played row without the field', () => {
  assert.throws(() => validateNflSeason(makeTotals(400), { year: 9999, requireWeeklyStats: true }), /missing weeklyStats/);
  const t = makeTotals(400);
  for (const r of Object.values(t)) r.weeklyStats = { 1: { rec: 1 } };
  assert.doesNotThrow(() => validateNflSeason(t, { year: 9999, requireWeeklyStats: true }));
});

test('validateNflSeason weeklyStats: a TEAM_* row carrying it throws', () => {
  const t = makeTotals(400);
  t.TEAM_KC = { ...validRecord(16), weeklyStats: { 1: { pts_allow: 3 } } };
  assert.throws(() => validateNflSeason(t, { year: 9999 }), /TEAM row TEAM_KC carries weeklyStats/);
});
