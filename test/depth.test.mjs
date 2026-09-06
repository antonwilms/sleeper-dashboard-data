/**
 * test/depth.test.mjs — Unit tests for D5's historical depth-chart capture: the two
 * era-specific parsers (aggregateDepthLegacy / aggregateDepthEspn), the shared gameday index
 * (buildGamedayIndex), the join (joinDepthToSleeper), the generalized crosswalk inversion
 * (crosswalkFromBySleeper), and validateDepth (lib/validate.mjs).
 *
 * Run with: node --test  (or npm test)
 */

import { test } from 'node:test';
import assert   from 'node:assert/strict';

import {
  aggregateDepthLegacy, aggregateDepthEspn, buildGamedayIndex, joinDepthToSleeper,
  crosswalkFromBySleeper, pfrCrosswalkFromBySleeper, espnCrosswalkFromBySleeper,
  MIN_DEPTH_SEASON, DEPTH_ESPN_FROM_SEASON, DEPTH_JOIN_RATE_MIN, MIN_DEPTH_QB1_TEAMS,
  DEPTH_SKILL_POSITIONS,
} from '../lib/nflverse.mjs';
import { validateDepth } from '../lib/validate.mjs';

const LEGACY_HEADER =
  'season,club_code,week,game_type,depth_team,last_name,first_name,football_name,formation,' +
  'gsis_id,jersey_number,position,elias_id,depth_position,full_name';

const ESPN_HEADER =
  'dt,team,player_name,espn_id,gsis_id,pos_grp_id,pos_grp,pos_id,pos_name,pos_abb,pos_slot,pos_rank';

function legacyRow({
  season = 2013, club = 'ATL', week = '1', gameType = 'REG', depthTeam = 1,
  last = 'Doe', first = 'John', formation = 'Offense', gsis = '00-0000001',
  jersey = '1', position = 'QB', elias = 'DOE000001', depthPosition = 'QB', full = 'John Doe',
} = {}) {
  return `${season},${club},${week},${gameType},${depthTeam},${last},${first},${first},${formation},${gsis},${jersey},${position},${elias},${depthPosition},${full}`;
}

function espnRow({
  dt = '2025-09-08 07:16:08', team = 'KC', name = 'John Doe', espnId = '1001', gsis = '00-0000001',
  posGrpId = '1', posGrp = 'offense', posId = '1', posName = 'Quarterback', posAbb = 'QB',
  posSlot = 'QB', rank = 1,
} = {}) {
  return `${dt},${team},${name},${espnId},${gsis},${posGrpId},${posGrp},${posId},${posName},${posAbb},${posSlot},${rank}`;
}

// ═══════════════════════════════════════════════════════════════════
// 1 — Legacy parser: formation/game_type filtering, depth_team ordering,
// empty-week rows skipped, skill positions only
// ═══════════════════════════════════════════════════════════════════

test('aggregateDepthLegacy: filters to formation=Offense, game_type=REG, skill positions only', () => {
  const rows = [
    LEGACY_HEADER,
    legacyRow({ position: 'QB', gsis: '00-0000001' }),                      // kept
    legacyRow({ position: 'LB', gsis: '00-0000002' }),                      // dropped: not skill
    legacyRow({ formation: 'Defense', gsis: '00-0000003' }),                // dropped: defense
    legacyRow({ formation: 'Special Teams', gsis: '00-0000004' }),          // dropped: ST
    legacyRow({ gameType: 'WC', gsis: '00-0000005' }),                      // dropped: not REG
  ];
  const { weeks, rowCount } = aggregateDepthLegacy(rows.join('\n'), { season: 2013 });
  assert.equal(rowCount, 1);
  assert.deepEqual(weeks['1'].ATL.QB.map(e => e.gsisId), ['00-0000001']);
});

test('aggregateDepthLegacy: empty-week rows (SBBYE) are skipped', () => {
  const rows = [
    LEGACY_HEADER,
    legacyRow({ week: '', gsis: '00-0000009' }),
    legacyRow({ week: '1', gsis: '00-0000001' }),
  ];
  const { weeks, rowCount } = aggregateDepthLegacy(rows.join('\n'), { season: 2013 });
  assert.equal(rowCount, 1);
  assert.deepEqual(Object.keys(weeks), ['1']);
});

test('aggregateDepthLegacy: depth_team ascending order; ties broken by depth_position then input order (finding 6)', () => {
  const rows = [
    LEGACY_HEADER,
    legacyRow({ position: 'WR', depthTeam: 3, depthPosition: 'WR', gsis: '00-0000003', full: 'C' }),
    legacyRow({ position: 'WR', depthTeam: 1, depthPosition: 'WR', gsis: '00-0000001', full: 'A' }),
    legacyRow({ position: 'WR', depthTeam: 1, depthPosition: 'SWR', gsis: '00-0000002', full: 'B' }),
  ];
  const { weeks } = aggregateDepthLegacy(rows.join('\n'), { season: 2013 });
  const wr = weeks['1'].ATL.WR;
  // depthTeam 1 (SWR before WR alphabetically) then depthTeam 3
  assert.deepEqual(wr.map(e => e.gsisId), ['00-0000002', '00-0000001', '00-0000003']);
  assert.deepEqual(wr.map(e => e.depthPosition), ['SWR', 'WR', 'WR']);
});

test('aggregateDepthLegacy: a duplicate depth_team within (club,week,position) produces a deterministic order and retains depthPosition (finding 6, test 9)', () => {
  const rows = [
    LEGACY_HEADER,
    legacyRow({ position: 'RB', depthTeam: 1, depthPosition: 'RB', gsis: '00-0000001', full: 'A' }),
    legacyRow({ position: 'RB', depthTeam: 1, depthPosition: 'RB', gsis: '00-0000002', full: 'B' }),
  ];
  const r1 = aggregateDepthLegacy(rows.join('\n'), { season: 2013 });
  const r2 = aggregateDepthLegacy(rows.join('\n'), { season: 2013 });
  assert.deepEqual(r1.weeks['1'].ATL.RB, r2.weeks['1'].ATL.RB); // deterministic
  assert.deepEqual(r1.weeks['1'].ATL.RB.map(e => e.gsisId), ['00-0000001', '00-0000002']); // input order tiebreak
  assert.deepEqual(r1.weeks['1'].ATL.RB.map(e => e.depthPosition), ['RB', 'RB']);
});

// ═══════════════════════════════════════════════════════════════════
// 10 — Wrong-asset guard (legacy): CSV's own season column disagrees with requested season
// ═══════════════════════════════════════════════════════════════════

test('aggregateDepthLegacy: CSV season column mismatch throws (wrong-asset guard)', () => {
  const rows = [LEGACY_HEADER, legacyRow({ season: 2014 })];
  assert.throws(() => aggregateDepthLegacy(rows.join('\n'), { season: 2013 }), /does not match/);
});

test('aggregateDepthLegacy: missing required columns (an ESPN-schema asset) throws', () => {
  assert.throws(() => aggregateDepthLegacy(ESPN_HEADER + '\n' + espnRow(), { season: 2025 }), /required columns missing/);
});

// ═══════════════════════════════════════════════════════════════════
// 2 — ESPN parser: pos_rank ordering, weekly reduction keeps only max-dt rows
// ═══════════════════════════════════════════════════════════════════

const GAMEDAY_INDEX_2025 = { '2025-09-08': { week: 1, gameType: 'REG' }, '2025-09-15': { week: 2, gameType: 'REG' } };

test('aggregateDepthEspn: orders by pos_rank ascending', () => {
  const rows = [
    ESPN_HEADER,
    espnRow({ espnId: '2', gsis: '00-0000002', rank: 2 }),
    espnRow({ espnId: '1', gsis: '00-0000001', rank: 1 }),
  ];
  const { weeks } = aggregateDepthEspn(rows.join('\n'), { season: 2025, gamedayIndex: GAMEDAY_INDEX_2025 });
  assert.deepEqual(weeks['1'].KC.QB.map(e => e.gsisId), ['00-0000001', '00-0000002']);
});

test('aggregateDepthEspn: weekly reduction keeps only the rows at the (team,week) bucket\'s max dt (test 2)', () => {
  const rows = [
    ESPN_HEADER,
    espnRow({ dt: '2025-09-06 10:00:00', espnId: '1', gsis: '00-0000001', rank: 1 }), // older — dropped
    espnRow({ dt: '2025-09-08 07:16:08', espnId: '2', gsis: '00-0000002', rank: 1 }), // newer — kept
  ];
  const { weeks, rowCount } = aggregateDepthEspn(rows.join('\n'), { season: 2025, gamedayIndex: GAMEDAY_INDEX_2025 });
  assert.equal(rowCount, 1);
  assert.deepEqual(weeks['1'].KC.QB.map(e => e.gsisId), ['00-0000002']);
  assert.equal(weeks['1'].KC.dt, '2025-09-08T07:16:08Z');
});

test('aggregateDepthEspn: filters to skill positions only', () => {
  const rows = [ESPN_HEADER, espnRow({ posAbb: 'OL', rank: 1 }), espnRow({ posAbb: 'QB', rank: 1, espnId: '2' })];
  const { rowCount } = aggregateDepthEspn(rows.join('\n'), { season: 2025, gamedayIndex: GAMEDAY_INDEX_2025 });
  assert.equal(rowCount, 1);
});

test('aggregateDepthEspn: missing required columns (a legacy-schema asset) throws', () => {
  assert.throws(() => aggregateDepthEspn(LEGACY_HEADER + '\n' + legacyRow(), { season: 2025, gamedayIndex: {} }), /required columns missing/);
});

test('aggregateDepthEspn: dt year outside {season, season+1} throws (wrong-asset guard)', () => {
  const rows = [ESPN_HEADER, espnRow({ dt: '2030-09-08 07:16:08' })];
  assert.throws(() => aggregateDepthEspn(rows.join('\n'), { season: 2025, gamedayIndex: GAMEDAY_INDEX_2025 }), /outside \{2025, 2026\}/);
});

// ═══════════════════════════════════════════════════════════════════
// 11 — Week derivation: a dt inside the REG window maps to the right week; before/after
// the REG window are counted into outOfWindow rather than dropped
// ═══════════════════════════════════════════════════════════════════

test('aggregateDepthEspn: a dt with no matching gameday (before week 1 / after the final week) is counted into outOfWindow, not dropped silently', () => {
  const rows = [
    ESPN_HEADER,
    espnRow({ dt: '2025-08-03 09:00:00', espnId: '1' }),  // preseason — no gameday match
    espnRow({ dt: '2026-03-14 09:00:00', espnId: '2' }),  // post-Super-Bowl — no gameday match
    espnRow({ dt: '2025-09-08 07:16:08', espnId: '3' }),  // in-window
  ];
  const { rowCount, outOfWindow } = aggregateDepthEspn(rows.join('\n'), { season: 2025, gamedayIndex: GAMEDAY_INDEX_2025 });
  assert.equal(rowCount, 1);
  assert.equal(outOfWindow, 2);
});

test('aggregateDepthEspn: a dt matching a non-REG (playoff) gameday is counted into outOfWindow', () => {
  const idx = { '2026-01-10': { week: 19, gameType: 'WC' } };
  const rows = [ESPN_HEADER, espnRow({ dt: '2026-01-10 09:00:00' })];
  const { rowCount, outOfWindow } = aggregateDepthEspn(rows.join('\n'), { season: 2025, gamedayIndex: idx });
  assert.equal(rowCount, 0);
  assert.equal(outOfWindow, 1);
});

// ═══════════════════════════════════════════════════════════════════
// buildGamedayIndex
// ═══════════════════════════════════════════════════════════════════

const GAMES_HEADER = 'game_id,season,game_type,week,gameday,weekday';

test('buildGamedayIndex: builds a gameday -> {week,gameType} map, scoped to the requested season', () => {
  const csv = [
    GAMES_HEADER,
    'g1,2025,REG,1,2025-09-08,Monday',
    'g2,2024,REG,1,2024-09-09,Monday', // different season — excluded
  ].join('\n');
  const idx = buildGamedayIndex(csv, { season: 2025 });
  assert.deepEqual(idx, { '2025-09-08': { week: 1, gameType: 'REG' } });
});

test('buildGamedayIndex: missing required columns throws', () => {
  assert.throws(() => buildGamedayIndex('season,week\n2025,1', { season: 2025 }), /required columns missing/);
});

// ═══════════════════════════════════════════════════════════════════
// 4 — Join: gsis_id primary path, espn_id fallback for a missing gsis_id
// ═══════════════════════════════════════════════════════════════════

test('joinDepthToSleeper: gsis_id primary path resolves to sleeper_id', () => {
  const weeksRaw = { 1: { KC: { QB: [{ gsisId: '00-0000001', espnId: null, depthPosition: null }], RB: [], WR: [], TE: [] } } };
  const { weeks, mapped, unmapped } = joinDepthToSleeper(weeksRaw, { ids: { '00-0000001': { sleeperId: '100' } } });
  assert.deepEqual(weeks[1].KC.QB, ['100']);
  assert.equal(mapped, 1);
  assert.equal(unmapped, 0);
});

test('joinDepthToSleeper: an ESPN row with a missing gsis_id resolves through the espn_id fallback (finding 3b)', () => {
  const weeksRaw = { 1: { KC: { QB: [{ gsisId: null, espnId: '9999', depthPosition: null }], RB: [], WR: [], TE: [] } } };
  const { weeks, mapped } = joinDepthToSleeper(weeksRaw, { ids: {}, espnToSleeper: { '9999': '200' } });
  assert.deepEqual(weeks[1].KC.QB, ['200']);
  assert.equal(mapped, 1);
});

test('joinDepthToSleeper: an unresolved entry is kept as null AT ITS ORIGINAL INDEX, not dropped', () => {
  const weeksRaw = {
    1: { KC: { QB: [
      { gsisId: '00-0000001', espnId: null, depthPosition: null }, // unmapped — the true depth-1
      { gsisId: '00-0000002', espnId: null, depthPosition: null }, // mapped — the backup
    ], RB: [], WR: [], TE: [] } },
  };
  const { weeks } = joinDepthToSleeper(weeksRaw, { ids: { '00-0000002': { sleeperId: '200' } } });
  assert.deepEqual(weeks[1].KC.QB, [null, '200']); // NOT ['200'] — position preserved
});

test('joinDepthToSleeper: mapped/unmapped count DISTINCT raw ids, not row occurrences', () => {
  const entry = { gsisId: '00-0000001', espnId: null, depthPosition: null };
  const weeksRaw = { 1: { KC: { QB: [entry], RB: [], WR: [], TE: [] } }, 2: { KC: { QB: [entry], RB: [], WR: [], TE: [] } } };
  const { mapped, unmapped } = joinDepthToSleeper(weeksRaw, { ids: {} }); // never resolves
  assert.equal(mapped, 0);
  assert.equal(unmapped, 1); // one distinct id, seen twice
});

test('joinDepthToSleeper: emits depthPositions only when a legacy-era row is present (finding 6)', () => {
  const withDp = { 1: { KC: { QB: [{ gsisId: '00-0000001', espnId: null, depthPosition: 'QB' }], RB: [], WR: [], TE: [] } } };
  const withoutDp = { 1: { KC: { QB: [{ gsisId: '00-0000001', espnId: null, depthPosition: null }], RB: [], WR: [], TE: [] } } };
  const ids = { '00-0000001': { sleeperId: '100' } };
  assert.ok('depthPositions' in joinDepthToSleeper(withDp, { ids }).weeks[1].KC);
  assert.ok(!('depthPositions' in joinDepthToSleeper(withoutDp, { ids }).weeks[1].KC));
});

test('joinDepthToSleeper: retains dt/date on the output team entry when present on the input (ESPN-era)', () => {
  const weeksRaw = { 1: { KC: { dt: '2025-09-08T07:16:08Z', date: '2025-09-08', QB: [], RB: [], WR: [], TE: [] } } };
  const { weeks } = joinDepthToSleeper(weeksRaw, { ids: {} });
  assert.equal(weeks[1].KC.dt, '2025-09-08T07:16:08Z');
  assert.equal(weeks[1].KC.date, '2025-09-08');
});

// ═══════════════════════════════════════════════════════════════════
// crosswalkFromBySleeper (generalizes pfrCrosswalkFromBySleeper — D4's inversion pattern)
// ═══════════════════════════════════════════════════════════════════

test('crosswalkFromBySleeper: generalizes over any bySleeper id field, keep-first on collision', () => {
  const bySleeper = {
    '100': { espnId: '1001', pfrId: 'DoeJo00' },
    '200': { espnId: '1001', pfrId: 'SmiJo00' }, // collision on espnId — keep-first
  };
  assert.deepEqual(crosswalkFromBySleeper(bySleeper, 'espnId'), { '1001': '100' });
  assert.deepEqual(crosswalkFromBySleeper(bySleeper, 'pfrId'), { DoeJo00: '100', SmiJo00: '200' });
});

test('pfrCrosswalkFromBySleeper / espnCrosswalkFromBySleeper are thin wrappers over crosswalkFromBySleeper', () => {
  const bySleeper = { '100': { pfrId: 'DoeJo00', espnId: '1001' } };
  assert.deepEqual(pfrCrosswalkFromBySleeper(bySleeper), crosswalkFromBySleeper(bySleeper, 'pfrId'));
  assert.deepEqual(espnCrosswalkFromBySleeper(bySleeper), crosswalkFromBySleeper(bySleeper, 'espnId'));
});

// ═══════════════════════════════════════════════════════════════════
// validateDepth
// ═══════════════════════════════════════════════════════════════════

function makeWeek1(teams, { qb1For = null } = {}) {
  const week1 = {};
  for (const t of teams) {
    week1[t] = { QB: t === qb1For || qb1For === null ? ['1'] : [], RB: ['2'], WR: ['3'], TE: ['4'] };
  }
  return week1;
}

const TEAM32 = [
  'ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND',
  'JAX','KC','LA','LAC','LV','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SEA','SF',
  'TB','TEN','WAS',
]; // modern (2020+) codes — safe to use as-is only at year >= 2020

/** The era-accurate 32 codes for `year` — swap in a wrong code deliberately, on top of this. */
function teamsForYear(year) {
  return TEAM32.map(t => {
    if (t === 'LA' && year <= 2015) return 'STL';
    if (t === 'LAC' && year <= 2016) return 'SD';
    if (t === 'LV' && year <= 2019) return 'OAK';
    return t;
  });
}

/**
 * Pads `weeks[1]` (the caller's team/QB1 configuration under test) with 25 synthetic
 * full-roster weeks so the returned object clears MIN_DEPTH_ROWS regardless of what week 1
 * looks like — the padding weeks never touch the team-count/QB1/era gates, which only inspect
 * week 1, but they do feed the season-wide rowCount floor.
 */
function fatWeeks(week1) {
  const out = { 1: week1 };
  const padPos = { QB: ['1', '2'], RB: ['1', '2', '3', '4'], WR: ['1', '2', '3', '4'], TE: ['1', '2', '3'] };
  for (let w = 2; w <= 26; w++) {
    const weekObj = {};
    for (const t of TEAM32) weekObj[t] = padPos;
    out[w] = weekObj;
  }
  return out;
}

test('validateDepth: season below MIN_DEPTH_SEASON throws', () => {
  assert.throws(() => validateDepth({}, { year: MIN_DEPTH_SEASON - 1, joinRate: 1 }), /below MIN_DEPTH_SEASON/);
});

test('validateDepth: join rate below DEPTH_JOIN_RATE_MIN throws; at the floor passes', () => {
  const weeks = fatWeeks(makeWeek1(TEAM32));
  assert.throws(() => validateDepth(weeks, { year: 2024, joinRate: DEPTH_JOIN_RATE_MIN - 0.01 }), /join rate/);
  assert.doesNotThrow(() => validateDepth(weeks, { year: 2024, joinRate: DEPTH_JOIN_RATE_MIN }));
});

test('validateDepth: fewer than 30 teams at week 1 throws', () => {
  const weeks = fatWeeks(makeWeek1(TEAM32.slice(0, 29)));
  assert.throws(() => validateDepth(weeks, { year: 2024, joinRate: 1 }), /teams at week 1/);
});

test('validateDepth: 30 or 31 teams at week 1 passes (2017 Hurricane-Irma exception)', () => {
  const teams2017 = teamsForYear(2017).slice(0, 30);
  const weeks = fatWeeks(makeWeek1(teams2017));
  assert.doesNotThrow(() => validateDepth(weeks, { year: 2017, joinRate: 1 }));
});

test('validateDepth: more than 32 teams at week 1 throws', () => {
  const weeks = fatWeeks(makeWeek1([...TEAM32, 'XXX']));
  assert.throws(() => validateDepth(weeks, { year: 2024, joinRate: 1 }), /teams at week 1/);
});

test('validateDepth: fewer than MIN_DEPTH_QB1_TEAMS teams with a depth-1 QB throws', () => {
  const week1 = {};
  for (const t of TEAM32) week1[t] = { QB: [], RB: ['2'], WR: ['3'], TE: ['4'] }; // no team has a QB
  assert.throws(() => validateDepth(fatWeeks(week1), { year: 2024, joinRate: 1 }), /depth-1 QB/);
});

test('validateDepth: a null at QB[0] (unresolved depth-1) does not count toward the QB1 gate', () => {
  const week1 = {};
  for (const t of TEAM32) week1[t] = { QB: [null, '2'], RB: ['2'], WR: ['3'], TE: ['4'] };
  assert.throws(() => validateDepth(fatWeeks(week1), { year: 2024, joinRate: 1 }), /depth-1 QB/);
});

test('validateDepth: era-domain guard — LA at year<=2015 throws; STL at year>=2016 throws', () => {
  const teamsLA = teamsForYear(2015).filter(t => t !== 'STL').concat('LA'); // wrong: LA at year<=2015
  assert.throws(() => validateDepth(fatWeeks(makeWeek1(teamsLA)), { year: 2015, joinRate: 1 }), /'LA' present/);
  const teamsSTL = teamsForYear(2016).filter(t => t !== 'LA').concat('STL'); // wrong: STL at year>=2016
  assert.throws(() => validateDepth(fatWeeks(makeWeek1(teamsSTL)), { year: 2016, joinRate: 1 }), /'STL' present/);
});

test('validateDepth: era-domain guard — LAC/SD boundary at 2016/2017', () => {
  const teams2016 = teamsForYear(2016); // SD correctly present — no throw
  assert.doesNotThrow(() => validateDepth(fatWeeks(makeWeek1(teams2016)), { year: 2016, joinRate: 1 }));
  const teamsSD2017 = teamsForYear(2017).filter(t => t !== 'LAC').concat('SD'); // wrong: SD at year>=2017
  assert.throws(() => validateDepth(fatWeeks(makeWeek1(teamsSD2017)), { year: 2017, joinRate: 1 }), /'SD' present/);
});

test('validateDepth: era-domain guard — LV/OAK boundary at 2019/2020', () => {
  const teams2019 = teamsForYear(2019); // OAK correctly present — no throw
  assert.doesNotThrow(() => validateDepth(fatWeeks(makeWeek1(teams2019)), { year: 2019, joinRate: 1 }));
  const teamsOAK2020 = teamsForYear(2020).filter(t => t !== 'LV').concat('OAK'); // wrong: OAK at year>=2020
  assert.throws(() => validateDepth(fatWeeks(makeWeek1(teamsOAK2020)), { year: 2020, joinRate: 1 }), /'OAK' present/);
});

test('validateDepth: rowCount below MIN_DEPTH_ROWS throws — the real gate (spine sparsity skip is deliberately bypassed)', () => {
  const week1 = makeWeek1(TEAM32);
  assert.throws(() => validateDepth({ 1: week1 }, { year: 2024, joinRate: 1 }), /joined skill-position rows/);
});

test('validateDepth: non-finite guard — Infinity in a component throws', () => {
  const weeks = fatWeeks(makeWeek1(TEAM32));
  weeks[1].KC.someNumber = Infinity;
  assert.throws(() => validateDepth(weeks, { year: 2024, joinRate: 1 }), /non-finite/);
});
