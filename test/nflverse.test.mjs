/**
 * test/nflverse.test.mjs — Unit tests for nflverse CSV parsers and validators.
 *
 * Run with: node --test  (or npm test)
 *
 * Coverage (ported from / replacing the app's CSV-parse test suites):
 *   A. parseRosterCsv
 *   B. parseDraftCsv
 *   C. validateRoster / validateDraft
 *   D. parsePlayerIdsCsv
 *   E. validatePlayerIds
 *   F. aggregateAdvReceiving
 *   G. rekeyBySleeper
 *   H. validateAdvStats
 */

import { test } from 'node:test';
import assert   from 'node:assert/strict';

import {
  parseRosterCsv, parseDraftCsv, MIN_ROSTER_IDS, MIN_DRAFT_YEAR,
  parsePlayerIdsCsv, MIN_PLAYERID_ROWS,
  aggregateAdvReceiving, rekeyBySleeper, MIN_ADVSTATS_ROWS,
  parseSchedulesCsv, numOrNull, MIN_SCHEDULE_GAMES, MIN_SCHEDULE_SEASON,
} from '../lib/nflverse.mjs';
import { validateRoster, validateDraft, validatePlayerIds, validateAdvStats, validateSchedule } from '../lib/validate.mjs';

// ─── Fixture helpers ──────────────────────────────────────────────────────────

const ROSTER_HEADER = 'season,team,position,depth_chart_position,status,full_name,sleeper_id';

function makeRosterCsv(...dataRows) {
  return [ROSTER_HEADER, ...dataRows].join('\n');
}

const DRAFT_HEADER =
  'season,round,pick,team,gsis_id,pfr_player_id,cfb_player_id,pfr_player_name,position,college,age';

function makeDraftCsv(...dataRows) {
  return [DRAFT_HEADER, ...dataRows].join('\n');
}

/** Generate a players object with `count` stub entries (all fields valid). */
function makePlayers(count) {
  const players = {};
  for (let i = 0; i < count; i++) {
    players[String(i + 1)] = {
      team: 'BUF', position: 'QB', status: 'ACT', fullName: `Player ${i + 1}`,
    };
  }
  return players;
}

// ═══════════════════════════════════════════════════════════════════
// A. parseRosterCsv
// ═══════════════════════════════════════════════════════════════════

test('parseRosterCsv: happy path — players keyed by sleeper_id, rowCount correct', () => {
  const csv = makeRosterCsv(
    '2025,BUF,QB,QB,ACT,Josh Allen,4984',
    '2025,KC,QB,QB,ACT,Patrick Mahomes,4046',
  );
  const { players, rowCount, season } = parseRosterCsv(csv);
  assert.equal(rowCount, 2);
  assert.equal(season, 2025);
  assert.deepEqual(players['4984'], { team: 'BUF', position: 'QB', status: 'ACT', fullName: 'Josh Allen' });
  assert.deepEqual(players['4046'], { team: 'KC',  position: 'QB', status: 'ACT', fullName: 'Patrick Mahomes' });
});

test('parseRosterCsv: empty sleeper_id rows are skipped', () => {
  const csv = makeRosterCsv(
    '2025,BUF,QB,QB,ACT,Josh Allen,4984',
    '2025,DAL,WR,WR,ACT,No Id Player,',    // empty sleeper_id → skip
  );
  const { rowCount, players } = parseRosterCsv(csv);
  assert.equal(rowCount, 1);
  assert.ok(players['4984']);
});

test('parseRosterCsv: quoted name with embedded comma is preserved', () => {
  const csv = makeRosterCsv(
    '2025,SF,WR,WR,ACT,"Smith, Jr.",9999',
  );
  const { players } = parseRosterCsv(csv);
  assert.equal(players['9999'].fullName, 'Smith, Jr.');
});

test('parseRosterCsv: missing sleeper_id column → throws', () => {
  // Header without sleeper_id
  const csv = 'season,team,position,status,full_name\n2025,BUF,QB,ACT,Josh Allen';
  assert.throws(() => parseRosterCsv(csv), Error);
});

test('parseRosterCsv: missing status column → throws', () => {
  // Header without status
  const csv = 'season,team,position,full_name,sleeper_id\n2025,BUF,QB,Josh Allen,4984';
  assert.throws(() => parseRosterCsv(csv), Error);
});

test('parseRosterCsv: Windows-style CRLF line endings handled', () => {
  const csv = ROSTER_HEADER + '\r\n' + '2025,BUF,QB,QB,ACT,Josh Allen,4984\r\n';
  const { rowCount } = parseRosterCsv(csv);
  assert.equal(rowCount, 1);
});

// ═══════════════════════════════════════════════════════════════════
// B. parseDraftCsv
// ═══════════════════════════════════════════════════════════════════

test('parseDraftCsv: happy path — DraftPick shape correct', () => {
  const csv = makeDraftCsv(
    '2024,1,1,CHI,,,,Caleb Williams,QB,USC,22.5',
  );
  const { picksByYear, count } = parseDraftCsv(csv);
  assert.equal(count, 1);
  assert.ok(picksByYear['2024']);
  const p = picksByYear['2024'][0];
  assert.equal(p.year,     2024);
  assert.equal(p.round,    1);
  assert.equal(p.pick,     1);
  assert.equal(p.team,     'CHI');
  assert.equal(p.fullName, 'Caleb Williams');
  assert.equal(p.position, 'QB');
  assert.equal(p.college,  'USC');
  assert.equal(p.age,      22.5);
});

test(`parseDraftCsv: rows before MIN_DRAFT_YEAR (${MIN_DRAFT_YEAR}) are filtered`, () => {
  const csv = makeDraftCsv(
    `${MIN_DRAFT_YEAR - 1},1,1,DET,,,,Old Pick,QB,Georgia,22.0`,
    `${MIN_DRAFT_YEAR},1,1,DET,,,,New Pick,QB,Georgia,22.0`,
  );
  const { picksByYear, count } = parseDraftCsv(csv);
  assert.equal(count, 1);
  assert.ok(!picksByYear[String(MIN_DRAFT_YEAR - 1)], 'old year should be absent');
  assert.ok(picksByYear[String(MIN_DRAFT_YEAR)],      'MIN_DRAFT_YEAR row should be present');
});

test('parseDraftCsv: NA round is skipped', () => {
  const csv = makeDraftCsv(
    '2024,NA,5,TEN,,,,Supplemental Pick,WR,Alabama,25.0',
  );
  const { count } = parseDraftCsv(csv);
  assert.equal(count, 0);
});

test('parseDraftCsv: supplemental (non-integer) round is skipped', () => {
  const csv = makeDraftCsv(
    '2024,supplemental,6,LAR,,,,Another Pick,WR,Ohio State,25.0',
  );
  const { count } = parseDraftCsv(csv);
  assert.equal(count, 0);
});

test('parseDraftCsv: quoted player name with comma is preserved', () => {
  const csv = makeDraftCsv(
    '2024,1,3,BAL,,,,"Williams, Javon",WR,Miami,24.0',
  );
  const { picksByYear } = parseDraftCsv(csv);
  assert.equal(picksByYear['2024'][0].fullName, 'Williams, Javon');
});

test('parseDraftCsv: age NA → null', () => {
  const csv = makeDraftCsv(
    '2024,1,2,WSH,,,,Jayden Daniels,QB,LSU,NA',
  );
  const { picksByYear } = parseDraftCsv(csv);
  assert.equal(picksByYear['2024'][0].age, null);
});

test('parseDraftCsv: multiple years grouped correctly', () => {
  const csv = makeDraftCsv(
    '2024,1,1,CHI,,,,Player A,QB,USC,22.0',
    '2023,1,1,CAR,,,,Player B,QB,Ohio State,23.0',
    '2024,1,2,WSH,,,,Player C,QB,LSU,21.0',
  );
  const { picksByYear, count } = parseDraftCsv(csv);
  assert.equal(count, 3);
  assert.equal(picksByYear['2024'].length, 2);
  assert.equal(picksByYear['2023'].length, 1);
});

// ═══════════════════════════════════════════════════════════════════
// C. validateRoster / validateDraft
// ═══════════════════════════════════════════════════════════════════

test('validateRoster: passes on valid input (MIN_ROSTER_IDS players)', () => {
  const players = makePlayers(MIN_ROSTER_IDS);
  assert.doesNotThrow(() => validateRoster(players, { year: 2025 }));
});

test('validateRoster: throws on empty players object', () => {
  assert.throws(() => validateRoster({}, { year: 2025 }), Error);
});

test('validateRoster: throws on short player count (below MIN_ROSTER_IDS)', () => {
  const players = makePlayers(5);
  assert.throws(() => validateRoster(players, { year: 2025 }), Error);
});

test('validateRoster: throws when >50% of players have null status', () => {
  // Enough players to pass count gate, but all missing status
  const players = {};
  for (let i = 0; i < MIN_ROSTER_IDS; i++) {
    players[String(i + 1)] = { team: 'BUF', position: 'QB', status: null, fullName: `Player ${i + 1}` };
  }
  assert.throws(() => validateRoster(players, { year: 2025 }), Error);
});

test('validateDraft: passes on valid input', () => {
  const picksByYear = {
    '2024': [{ year: 2024, round: 1, pick: 1, team: 'CHI', fullName: 'P1', position: 'QB', college: 'USC', age: 22 }],
  };
  assert.doesNotThrow(() => validateDraft(picksByYear));
});

test('validateDraft: throws on empty picksByYear', () => {
  assert.throws(() => validateDraft({}), Error);
});

test('validateDraft: throws when a pick is missing round field', () => {
  const picksByYear = {
    '2024': [{ year: 2024, pick: 1, team: 'CHI', fullName: 'P1', position: 'QB' }], // no round
  };
  assert.throws(() => validateDraft(picksByYear), Error);
});

test('validateDraft: throws when a pick is missing pick field', () => {
  const picksByYear = {
    '2024': [{ year: 2024, round: 1, team: 'CHI', fullName: 'P1', position: 'QB' }], // no pick
  };
  assert.throws(() => validateDraft(picksByYear), Error);
});

// ═══════════════════════════════════════════════════════════════════
// D. parsePlayerIdsCsv
// ═══════════════════════════════════════════════════════════════════

const PLAYERIDS_HEADER = 'mfl_id,gsis_id,sleeper_id,name,position,db_season';

function makePlayerIdsCsv(...rows) { return [PLAYERIDS_HEADER, ...rows].join('\n'); }

test('parsePlayerIdsCsv: happy path — keyed by gsis_id, rowCount correct', () => {
  const csv = makePlayerIdsCsv(
    ',00-0034796,4984,Josh Allen,QB,2026',
    ',00-0033873,6794,Justin Jefferson,WR,2026',
  );
  const { ids, rowCount } = parsePlayerIdsCsv(csv);
  assert.equal(rowCount, 2);
  assert.deepEqual(ids['00-0034796'], { sleeperId: '4984', name: 'Josh Allen', position: 'QB' });
  assert.deepEqual(ids['00-0033873'], { sleeperId: '6794', name: 'Justin Jefferson', position: 'WR' });
});

test('parsePlayerIdsCsv: row missing gsis_id is skipped', () => {
  const csv = makePlayerIdsCsv(
    ',00-0034796,4984,Josh Allen,QB,2026',
    ',,6794,Justin Jefferson,WR,2026',   // empty gsis_id → skip
  );
  const { ids, rowCount } = parsePlayerIdsCsv(csv);
  assert.equal(rowCount, 1);
  assert.ok(ids['00-0034796']);
});

test('parsePlayerIdsCsv: row with NA gsis_id is skipped', () => {
  const csv = makePlayerIdsCsv(
    ',00-0034796,4984,Josh Allen,QB,2026',
    ',NA,6794,Justin Jefferson,WR,2026',  // NA gsis_id → skip
  );
  const { ids, rowCount } = parsePlayerIdsCsv(csv);
  assert.equal(rowCount, 1);
  assert.ok(ids['00-0034796']);
});

test('parsePlayerIdsCsv: row with missing sleeper_id is skipped', () => {
  const csv = makePlayerIdsCsv(
    ',00-0034796,4984,Josh Allen,QB,2026',
    ',00-0033873,,Justin Jefferson,WR,2026',  // empty sleeper_id → skip
  );
  const { ids, rowCount } = parsePlayerIdsCsv(csv);
  assert.equal(rowCount, 1);
});

test('parsePlayerIdsCsv: row with NA sleeper_id is skipped', () => {
  const csv = makePlayerIdsCsv(
    ',00-0034796,4984,Josh Allen,QB,2026',
    ',00-0033873,NA,Justin Jefferson,WR,2026',  // NA sleeper_id → skip
  );
  const { ids, rowCount } = parsePlayerIdsCsv(csv);
  assert.equal(rowCount, 1);
});

test('parsePlayerIdsCsv: keep-last on duplicate gsis_id', () => {
  const csv = makePlayerIdsCsv(
    ',00-0034796,1111,First Entry,QB,2026',
    ',00-0034796,2222,Second Entry,QB,2026',  // same gsis, different sleeper → keep-last
  );
  const { ids, rowCount } = parsePlayerIdsCsv(csv);
  assert.equal(rowCount, 1);
  assert.equal(ids['00-0034796'].sleeperId, '2222');
});

test('parsePlayerIdsCsv: missing gsis_id column → throws', () => {
  const csv = 'mfl_id,sleeper_id,name,position,db_season\n,4984,Josh Allen,QB,2026';
  assert.throws(() => parsePlayerIdsCsv(csv), Error);
});

test('parsePlayerIdsCsv: missing sleeper_id column → throws', () => {
  const csv = 'mfl_id,gsis_id,name,position,db_season\n,00-0034796,Josh Allen,QB,2026';
  assert.throws(() => parsePlayerIdsCsv(csv), Error);
});

test('parsePlayerIdsCsv: CRLF line endings handled', () => {
  const csv = PLAYERIDS_HEADER + '\r\n' + ',00-0034796,4984,Josh Allen,QB,2026\r\n';
  const { rowCount } = parsePlayerIdsCsv(csv);
  assert.equal(rowCount, 1);
});

test('parsePlayerIdsCsv: quoted name with comma preserved', () => {
  const csv = makePlayerIdsCsv(
    ',00-0034796,4984,"Smith, Jr.",QB,2026',
  );
  const { ids } = parsePlayerIdsCsv(csv);
  assert.equal(ids['00-0034796'].name, 'Smith, Jr.');
});

// ═══════════════════════════════════════════════════════════════════
// E. validatePlayerIds
// ═══════════════════════════════════════════════════════════════════

function makeIds(count) {
  const ids = {};
  for (let i = 0; i < count; i++) {
    ids[`00-${String(i).padStart(7, '0')}`] = {
      sleeperId: String(i + 1000),
      name:      `Player ${i + 1}`,
      position:  'QB',
    };
  }
  return ids;
}

test('validatePlayerIds: passes on valid input (MIN_PLAYERID_ROWS entries)', () => {
  const ids = makeIds(MIN_PLAYERID_ROWS);
  assert.doesNotThrow(() => validatePlayerIds(ids));
});

test('validatePlayerIds: throws below gate (truncated source)', () => {
  const ids = makeIds(100);
  assert.throws(() => validatePlayerIds(ids), Error);
});

test('validatePlayerIds: throws when an entry lacks sleeperId', () => {
  const ids = makeIds(MIN_PLAYERID_ROWS);
  // Corrupt one entry to have an empty sleeperId
  ids['00-0000000'].sleeperId = '';
  assert.throws(() => validatePlayerIds(ids), Error);
});

test('validatePlayerIds: throws when >50% missing name', () => {
  const ids = makeIds(MIN_PLAYERID_ROWS);
  // Set all names to null
  for (const v of Object.values(ids)) {
    v.name = null;
  }
  assert.throws(() => validatePlayerIds(ids), Error);
});

// ═══════════════════════════════════════════════════════════════════
// F. aggregateAdvReceiving
// ═══════════════════════════════════════════════════════════════════

// Subset header — weekly ratio columns present but must be ignored by the parser.
const ADV_HEADER =
  'player_id,player_display_name,position,season,week,team,' +
  'targets,receiving_air_yards,receiving_yards,receptions,' +
  'target_share,air_yards_share,wopr,racr';

function makeAdvCsv(...rows) { return [ADV_HEADER, ...rows].join('\n'); }

test('aggregateAdvReceiving: share math for single-team WR — weekly ratio columns ignored', () => {
  // Team DAL wk1+wk2: WR-A and WR-B. 9.9 junk values in ratio columns prove they are ignored.
  // DAL totals: wk1=10tgts/100air, wk2=10tgts/100air → restricted denom for A = 20tgts/200air
  const csv = makeAdvCsv(
    '00-0001,WR-A,WR,2023,1,DAL,6,60,90,5,9.9,9.9,9.9,9.9',
    '00-0001,WR-A,WR,2023,2,DAL,4,40,60,3,9.9,9.9,9.9,9.9',
    '00-0002,WR-B,WR,2023,1,DAL,4,40,60,3,9.9,9.9,9.9,9.9',
    '00-0002,WR-B,WR,2023,2,DAL,6,60,90,5,9.9,9.9,9.9,9.9',
  );
  const { byGsis } = aggregateAdvReceiving(csv);
  const A = byGsis['00-0001'];
  assert.ok(A, 'WR-A should be emitted');
  // targetShare = 10/20 = 0.5; airYardsShare = 100/200 = 0.5
  assert.equal(A.targetShare,   0.5);
  assert.equal(A.airYardsShare, 0.5);
  assert.equal(A.wopr,          Math.round((1.5 * 0.5 + 0.7 * 0.5) * 1000) / 1000); // 1.1
  // recYards=90+60=150, recAirYards=60+40=100 → racr=1.5
  assert.equal(A.racr,          Math.round(150 / 100 * 1000) / 1000);
  assert.equal(A.components.targets,    10);
  assert.equal(A.components.airYards,   100);
  assert.equal(A.components.recYards,   150);
  assert.equal(A.components.weeks,      2);
});

test('aggregateAdvReceiving: recompute ignores weekly ratio columns — 9.9 values not propagated', () => {
  const csv = makeAdvCsv(
    '00-0001,WR-A,WR,2023,1,DAL,6,60,90,5,9.9,9.9,9.9,9.9',
    '00-0002,WR-B,WR,2023,1,DAL,4,40,60,3,9.9,9.9,9.9,9.9',
  );
  const { byGsis } = aggregateAdvReceiving(csv);
  const A = byGsis['00-0001'];
  assert.ok(A);
  // Recomputed: 6/(6+4)=0.6, not 9.9
  assert.equal(A.targetShare, 0.6);
  assert.notEqual(A.wopr, 9.9);
});

test('aggregateAdvReceiving: traded player volume-weighted targetShare', () => {
  // 00-0099 on ATL wk1 (3 tgts / team 10) and LA wk2 (2 tgts / team 20)
  // tgtNumer = (3/10)*3 + (2/20)*2 = 0.9 + 0.2 = 1.1; targetShare = 1.1/5 = 0.22
  const csv = makeAdvCsv(
    '00-0099,Traded WR,WR,2023,1,ATL,3,30,45,2,0,0,0,0',
    'QB-ATL,Filler QB,QB,2023,1,ATL,7,70,105,5,0,0,0,0',
    '00-0099,Traded WR,WR,2023,2,LA,2,20,30,1,0,0,0,0',
    'QB-LA,Filler QB,QB,2023,2,LA,18,180,270,12,0,0,0,0',
  );
  const { byGsis } = aggregateAdvReceiving(csv);
  const p = byGsis['00-0099'];
  assert.ok(p, 'traded player should be emitted');
  assert.equal(p.traded, true);
  assert.deepEqual(p.teams, ['ATL', 'LA']); // ATL=3 targets > LA=2
  assert.equal(p.targetShare, 0.22);
});

test('aggregateAdvReceiving: zero team+player air yards → airYardsShare and wopr null', () => {
  // Both WRs have 0 receiving_air_yards → team air total = 0; player recAirYards = 0
  const csv = makeAdvCsv(
    '00-0001,WR-A,WR,2023,1,DAL,6,0,90,5,0,0,0,0',
    '00-0002,WR-B,WR,2023,1,DAL,4,0,60,3,0,0,0,0',
  );
  const { byGsis } = aggregateAdvReceiving(csv);
  const A = byGsis['00-0001'];
  assert.ok(A);
  assert.equal(A.targetShare,   0.6);   // still computable from targets
  assert.equal(A.airYardsShare, null);  // recAirYards=0 → null
  assert.equal(A.wopr,          null);  // airYardsShare null → wopr null
});

test('aggregateAdvReceiving: racr null when player receiving_air_yards sums to 0', () => {
  const csv = makeAdvCsv(
    '00-0001,WR-A,WR,2023,1,DAL,6,0,90,5,0,0,0,0',
    '00-0002,WR-B,WR,2023,1,DAL,4,0,60,3,0,0,0,0',
  );
  const { byGsis } = aggregateAdvReceiving(csv);
  assert.equal(byGsis['00-0001'].racr, null);
});

test('aggregateAdvReceiving: RB targets counted in team denom but RB absent when excluded from positions', () => {
  // RB has 10 targets; WR has 5 — WR targetShare = 5/(10+5) = 0.333 when RBs excluded
  const csv = makeAdvCsv(
    '00-RB,RB Player,RB,2023,1,DAL,10,80,60,8,0,0,0,0',
    '00-WR,WR Player,WR,2023,1,DAL,5,50,75,4,0,0,0,0',
  );
  const { byGsis } = aggregateAdvReceiving(csv, { positions: ['WR', 'TE'] });
  assert.ok(!byGsis['00-RB'], 'RB should not be emitted');
  assert.ok( byGsis['00-WR'], 'WR should be emitted');
  // RB targets in denominator: 5/(10+5)=0.333...
  assert.equal(byGsis['00-WR'].targetShare, Math.round(5 / 15 * 1000) / 1000);
});

test('aggregateAdvReceiving: missing team column → throws', () => {
  const badHeader = 'player_id,player_display_name,position,season,week,' +
    'targets,receiving_air_yards,receiving_yards,receptions';
  const csv = [badHeader, '00-0001,WR-A,WR,2023,1,6,60,90,5'].join('\n');
  assert.throws(() => aggregateAdvReceiving(csv), Error);
});

test('aggregateAdvReceiving: RB targetShare computed with default positions (RB included)', () => {
  // Default positions include RB — RB should be emitted alongside WR
  const csv = makeAdvCsv(
    '00-RB,RB Player,RB,2023,1,DAL,5,30,50,4,0,0,0,0',
    '00-WR,WR Player,WR,2023,1,DAL,10,100,150,8,0,0,0,0',
  );
  const { byGsis } = aggregateAdvReceiving(csv);
  const rb = byGsis['00-RB'];
  assert.ok(rb, 'RB should be emitted with default positions');
  assert.equal(rb.position, 'RB');
  // teamTargets[DAL][1]=15; RB targetShare = 5/15 = 0.333
  assert.equal(rb.targetShare, Math.round(5 / 15 * 1000) / 1000);
});

test('aggregateAdvReceiving: RB net-negative receiving_air_yards → racr null; other ratios still emit', () => {
  // RB has -10 receiving_air_yards (behind-LOS targets); WR on same team has 100
  // Team total air yards = 90 (positive denominator → airYardsShare emits, negative)
  const csv = makeAdvCsv(
    '00-RB,RB Player,RB,2023,1,DAL,5,-10,40,4,0,0,0,0',
    '00-WR,WR Player,WR,2023,1,DAL,10,100,150,8,0,0,0,0',
  );
  const { byGsis } = aggregateAdvReceiving(csv);
  const rb = byGsis['00-RB'];
  assert.ok(rb, 'RB should be emitted');
  // recAirYards = -10 ≤ 0 → racr null (guard for nonsensical behind-LOS ratio)
  assert.equal(rb.racr, null);
  // targetShare: 5/(5+10)=0.333 — not null
  assert.ok(rb.targetShare != null, 'targetShare should not be null');
  // airYardsShare: emitted even when negative (capture-only; not nulled)
  assert.ok(rb.airYardsShare != null, 'airYardsShare should not be null');
  assert.equal(typeof rb.airYardsShare, 'number');
  // components reflect the raw negative air yards
  assert.ok(rb.components.airYards < 0,  'components.airYards should be negative');
  assert.ok(rb.components.recYards > 0,  'components.recYards should be positive');
});

// ═══════════════════════════════════════════════════════════════════
// G. rekeyBySleeper
// ═══════════════════════════════════════════════════════════════════

test('rekeyBySleeper: maps known gsis_id to sleeperId', () => {
  const byGsis = { '00-0033921': { gsisId: '00-0033921', name: 'CeeDee Lamb', position: 'WR' } };
  const crosswalkIds = { '00-0033921': { sleeperId: '1234', name: 'CeeDee Lamb', position: 'WR' } };
  const { players, unmapped } = rekeyBySleeper(byGsis, crosswalkIds);
  assert.ok(players['1234'], 'player should be keyed by sleeperId');
  assert.equal(unmapped, 0);
});

test('rekeyBySleeper: drops unmapped gsis_id and increments unmapped count', () => {
  const byGsis = {
    '00-0033921': { gsisId: '00-0033921', name: 'Known Player',   position: 'WR' },
    '00-0099999': { gsisId: '00-0099999', name: 'Unknown Player', position: 'WR' },
  };
  const crosswalkIds = { '00-0033921': { sleeperId: '1234' } };
  const { players, unmapped } = rekeyBySleeper(byGsis, crosswalkIds);
  assert.ok(players['1234'], 'known player should be present');
  assert.equal(Object.keys(players).length, 1);
  assert.equal(unmapped, 1);
});

// ═══════════════════════════════════════════════════════════════════
// H. validateAdvStats
// ═══════════════════════════════════════════════════════════════════

function makeAdvPlayers(count) {
  const players = {};
  for (let i = 0; i < count; i++) {
    players[String(i + 1)] = {
      gsisId:       `00-${String(i).padStart(7, '0')}`,
      name:         `Player ${i + 1}`,
      position:     'WR',
      team:         'DAL',
      targetShare:   0.15,
      airYardsShare: 0.12,
      wopr:          0.309,
      racr:          0.98,
      components: { targets: 50, airYards: 400, recYards: 600, receptions: 40, weeks: 17 },
    };
  }
  return players;
}

test('validateAdvStats: passes on valid input (MIN_ADVSTATS_ROWS players)', () => {
  const players = makeAdvPlayers(MIN_ADVSTATS_ROWS);
  assert.doesNotThrow(() => validateAdvStats(players, { year: 2023 }));
});

test('validateAdvStats: throws below gate (truncated fetch)', () => {
  const players = makeAdvPlayers(10);
  assert.throws(() => validateAdvStats(players, { year: 2023 }), Error);
});

test('validateAdvStats: throws when >50% have all-null ratios (column drift)', () => {
  const players = makeAdvPlayers(MIN_ADVSTATS_ROWS);
  for (const p of Object.values(players)) {
    p.targetShare    = null;
    p.airYardsShare  = null;
    p.wopr           = null;
    p.racr           = null;
  }
  assert.throws(() => validateAdvStats(players, { year: 2023 }), Error);
});

test('validateAdvStats: throws when targetShare is out of [0,1] range', () => {
  const players = makeAdvPlayers(MIN_ADVSTATS_ROWS);
  Object.values(players)[0].targetShare = 1.5;
  assert.throws(() => validateAdvStats(players, { year: 2023 }), Error);
});

// ═══════════════════════════════════════════════════════════════════
// I. parseSchedulesCsv + numOrNull + validateSchedule
// ═══════════════════════════════════════════════════════════════════

// Scrambled column order + 2 unused columns to prove indexOf-by-name resolution.
const SCHED_HEADER =
  'gametime,season,away_score,game_id,location,week,home_score,away_team,result,' +
  'home_team,spread_line,total_line,roof,surface,temp,wind,game_type';

function makeSchedCsv(...dataRows) {
  return [SCHED_HEADER, ...dataRows].join('\n');
}

/** Generate an array of `n` minimal valid stub game objects for validateSchedule tests. */
function makeGames(n) {
  return Array.from({ length: n }, (_, i) => ({
    gameId:    `g${i}`,
    season:    2023,
    week:      1,
    gameType:  'REG',
    homeTeam:  'KC',
    awayTeam:  'BUF',
    homeScore: null,
    awayScore: null,
    result:    null,
    spreadLine: null,
    totalLine:  null,
    roof:      null,
    surface:   null,
    temp:      null,
    wind:      null,
  }));
}

// Helper: build a row string matching SCHED_HEADER column order.
// Columns: gametime,season,away_score,game_id,location,week,home_score,away_team,result,
//          home_team,spread_line,total_line,roof,surface,temp,wind,game_type
function schedRow({ gameId, season, week, gameType, homeTeam, awayTeam, homeScore, awayScore,
                    result, spreadLine, totalLine, roof, surface, temp, wind }) {
  return [
    '',          // gametime (unused)
    season ?? '',
    awayScore ?? '',
    gameId ?? '',
    '',          // location (unused)
    week ?? '',
    homeScore ?? '',
    awayTeam ?? '',
    result ?? '',
    homeTeam ?? '',
    spreadLine ?? '',
    totalLine ?? '',
    roof ?? '',
    surface ?? '',
    temp ?? '',
    wind ?? '',
    gameType ?? '',
  ].join(',');
}

test('parseSchedulesCsv: happy path — game shape + grouping', () => {
  const csv = makeSchedCsv(
    schedRow({ gameId: '2023_01_DET_KC', season: 2023, week: 1, gameType: 'REG',
               homeTeam: 'KC', awayTeam: 'DET', homeScore: 20, awayScore: 21,
               result: -1, spreadLine: 4.5, totalLine: 53.0, roof: 'outdoors', surface: 'grass',
               temp: 70, wind: 8 }),
    schedRow({ gameId: '2024_01_BUF_NYJ', season: 2024, week: 1, gameType: 'REG',
               homeTeam: 'NYJ', awayTeam: 'BUF', homeScore: 17, awayScore: 24,
               result: -7, spreadLine: -3.5, totalLine: 44.0, roof: 'outdoors', surface: 'grass',
               temp: 75, wind: 5 }),
  );
  const { gamesBySeason, count } = parseSchedulesCsv(csv);
  assert.equal(count, 2);
  const g = gamesBySeason['2023'][0];
  assert.equal(g.gameId,    '2023_01_DET_KC');
  assert.equal(g.season,    2023);
  assert.equal(g.week,      1);
  assert.equal(g.gameType,  'REG');
  assert.equal(g.homeTeam,  'KC');
  assert.equal(g.awayTeam,  'DET');
  assert.equal(g.homeScore, 20);
  assert.equal(g.awayScore, 21);
  assert.equal(g.result,    -1);
  assert.equal(g.spreadLine, 4.5);
  assert.equal(g.totalLine,  53.0);
  assert.equal(g.roof,      'outdoors');
  assert.equal(g.surface,   'grass');
  assert.equal(g.temp,      70);
  assert.equal(g.wind,      8);
  assert.ok(gamesBySeason['2024']);
});

test('parseSchedulesCsv: in-progress game — null scores, lines kept', () => {
  const csv = makeSchedCsv(
    schedRow({ gameId: '2026_01_NE_SEA', season: 2026, week: 1, gameType: 'REG',
               homeTeam: 'SEA', awayTeam: 'NE', homeScore: '', awayScore: '',
               result: '', spreadLine: 3.5, totalLine: 44.5, roof: 'outdoors', surface: 'grass',
               temp: '', wind: '' }),
  );
  const { gamesBySeason } = parseSchedulesCsv(csv);
  const g = gamesBySeason['2026'][0];
  assert.equal(g.homeScore,  null);
  assert.equal(g.awayScore,  null);
  assert.equal(g.result,     null);
  assert.equal(g.temp,       null);
  assert.equal(g.wind,       null);
  assert.equal(g.spreadLine, 3.5);
  assert.equal(g.totalLine,  44.5);
});

test('parseSchedulesCsv: tie game — result is 0, not null', () => {
  const csv = makeSchedCsv(
    schedRow({ gameId: '2022_07_PIT_PHI', season: 2022, week: 7, gameType: 'REG',
               homeTeam: 'PHI', awayTeam: 'PIT', homeScore: 17, awayScore: 17,
               result: 0, spreadLine: -3.5, totalLine: 42.5, roof: 'outdoors', surface: 'grass',
               temp: 55, wind: 12 }),
  );
  const { gamesBySeason } = parseSchedulesCsv(csv);
  const g = gamesBySeason['2022'][0];
  assert.strictEqual(g.result,    0);
  assert.strictEqual(g.homeScore, 17);
});

test('parseSchedulesCsv: dome — null weather', () => {
  const csv = makeSchedCsv(
    schedRow({ gameId: '2026_01_SF_LA', season: 2026, week: 1, gameType: 'REG',
               homeTeam: 'LA', awayTeam: 'SF', homeScore: '', awayScore: '',
               result: '', spreadLine: 2.5, totalLine: 48.0, roof: 'dome', surface: 'fieldturf',
               temp: '', wind: '' }),
  );
  const { gamesBySeason } = parseSchedulesCsv(csv);
  const g = gamesBySeason['2026'][0];
  assert.equal(g.roof,    'dome');
  assert.equal(g.temp,    null);
  assert.equal(g.wind,    null);
});

test('parseSchedulesCsv: minSeason filter — pre-floor rows excluded', () => {
  const csv = makeSchedCsv(
    schedRow({ gameId: '1998_01_KC_CHI', season: 1998, week: 1, gameType: 'REG',
               homeTeam: 'CHI', awayTeam: 'KC', homeScore: 20, awayScore: 17,
               result: 3, spreadLine: -3, totalLine: 41, roof: 'outdoors', surface: 'grass',
               temp: 65, wind: 8 }),
    schedRow({ gameId: '2020_01_HOU_KC',  season: 2020, week: 1, gameType: 'REG',
               homeTeam: 'KC', awayTeam: 'HOU', homeScore: 34, awayScore: 20,
               result: 14, spreadLine: -10, totalLine: 54, roof: 'outdoors', surface: 'grass',
               temp: 80, wind: 5 }),
  );
  const { gamesBySeason, count } = parseSchedulesCsv(csv, { minSeason: 1999 });
  assert.equal(count, 1);
  assert.ok(!gamesBySeason['1998']);
  assert.ok(gamesBySeason['2020']);
});

test('parseSchedulesCsv: missing required column throws', () => {
  // Header without game_id → should throw
  const badHeader = 'season,away_score,home_score,away_team,home_team,result,spread_line,total_line,roof,surface,temp,wind,game_type,week';
  const csv = [badHeader, '2023,20,17,BUF,KC,3,-3,44,outdoors,grass,70,8,REG,1'].join('\n');
  assert.throws(() => parseSchedulesCsv(csv), /required columns missing/);
});

test('parseSchedulesCsv: CRLF handling', () => {
  const row = schedRow({ gameId: '2023_01_DET_KC', season: 2023, week: 1, gameType: 'REG',
                         homeTeam: 'KC', awayTeam: 'DET', homeScore: 20, awayScore: 21,
                         result: -1, spreadLine: 4.5, totalLine: 53.0, roof: 'outdoors', surface: 'grass',
                         temp: 70, wind: 8 });
  const csv = [SCHED_HEADER, row].join('\r\n');
  const { count } = parseSchedulesCsv(csv);
  assert.equal(count, 1);
});

test('parseSchedulesCsv: malformed row (empty away_team) skipped', () => {
  const goodRow = schedRow({ gameId: '2023_01_DET_KC', season: 2023, week: 1, gameType: 'REG',
                             homeTeam: 'KC', awayTeam: 'DET', homeScore: 20, awayScore: 21,
                             result: -1, spreadLine: 4.5, totalLine: 53.0, roof: 'outdoors', surface: 'grass',
                             temp: 70, wind: 8 });
  const badRow  = schedRow({ gameId: '2023_02_BUF_NYJ', season: 2023, week: 2, gameType: 'REG',
                             homeTeam: 'NYJ', awayTeam: '',   homeScore: 17, awayScore: 24,
                             result: -7, spreadLine: -3.5, totalLine: 44.0, roof: 'outdoors', surface: 'grass',
                             temp: 75, wind: 5 });
  const csv = makeSchedCsv(goodRow, badRow);
  const { count } = parseSchedulesCsv(csv);
  assert.equal(count, 1);
});

test('numOrNull: empty → null, NA → null, 0 → 0, negatives/decimals → number, unparseable → null', () => {
  assert.equal(numOrNull(''),    null);
  assert.equal(numOrNull('NA'), null);
  assert.strictEqual(numOrNull('0'),   0);
  assert.equal(numOrNull('-3'),  -3);
  assert.equal(numOrNull('4.5'), 4.5);
  assert.equal(numOrNull('x'),   null);
});

test('validateSchedule: happy path — 200 valid games does not throw', () => {
  const games = makeGames(MIN_SCHEDULE_GAMES);
  assert.doesNotThrow(() => validateSchedule(games, { year: 2023 }));
});

test('validateSchedule: below floor (199 games) throws', () => {
  const games = makeGames(MIN_SCHEDULE_GAMES - 1);
  assert.throws(() => validateSchedule(games, { year: 2023 }), /expected ≥ 200/);
});

test('validateSchedule: format drift (>50% missing homeTeam) throws', () => {
  const games = makeGames(MIN_SCHEDULE_GAMES);
  // Null out homeTeam for the majority
  for (let i = 0; i < Math.floor(games.length * 0.6); i++) {
    games[i].homeTeam = null;
  }
  assert.throws(() => validateSchedule(games, { year: 2023 }), /format change/);
});
