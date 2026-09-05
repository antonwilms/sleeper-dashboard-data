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
 *   I. parseSchedulesCsv / numOrNull / validateSchedule
 *   J. parsePlayerGameLogs
 *   K. validateGameLogs
 *   L. aggregateTeamContext / eraTeam
 *   M. validateTeamContext
 */

import { test } from 'node:test';
import assert   from 'node:assert/strict';

import {
  parseRosterCsv, parseDraftCsv, MIN_ROSTER_IDS, MIN_DRAFT_YEAR,
  parsePlayerIdsCsv, MIN_PLAYERID_ROWS,
  aggregateAdvReceiving, rekeyBySleeper, MIN_ADVSTATS_ROWS,
  AY_PER_TARGET_MIN, AY_PER_TARGET_MAX,
  parseSchedulesCsv, numOrNull, MIN_SCHEDULE_GAMES, MIN_SCHEDULE_SEASON,
  parsePlayerGameLogs, rekeyGameLogsBySleeper, MIN_PLAYERGAME_ROWS, MIN_GAMELOG_SEASON,
  aggregateTeamContext, eraTeam, MIN_TEAMCONTEXT_ROWS,
} from '../lib/nflverse.mjs';
import { validateRoster, validateDraft, validatePlayerIds, validateAdvStats, validateSchedule, validateGameLogs, validateTeamContext } from '../lib/validate.mjs';
import { readJson } from '../lib/io.mjs';
import { idsHash, bySleeperHash } from '../scripts/update-playerids.mjs';

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

// D2 — the wide header carries all eleven columns parsePlayerIdsCsv now indexes
// (espn_id/college/team are indexed per §A but not part of the 8-field bySleeper
// shape — see Finding 4's measured "brief's 8-field subset" table).
const PLAYERIDS_WIDE_HEADER =
  'mfl_id,gsis_id,sleeper_id,name,position,db_season,birthdate,draft_year,' +
  'draft_round,draft_pick,draft_ovr,pfr_id,ktc_id,cfbref_id,espn_id,college,team';

function makeWidePlayerIdsCsv(...rows) { return [PLAYERIDS_WIDE_HEADER, ...rows].join('\n'); }

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

// ─── D2 — bySleeper parse-widening ────────────────────────────────────────

test('parsePlayerIdsCsv: every new column parses with the right type — numbers coerced, ids left as strings', () => {
  const csv = makeWidePlayerIdsCsv(
    ',00-0034796,4984,Josh Allen,QB,2026,1996-05-21,2018,1,7,7,AlleJo02,4984,allen-josh,3918298,Wyoming,BUF',
  );
  const { bySleeper } = parsePlayerIdsCsv(csv);
  assert.deepEqual(bySleeper['4984'], {
    gsisId:     '00-0034796',
    pfrId:      'AlleJo02',
    ktcId:      '4984',
    cfbrefId:   'allen-josh',
    birthdate:  '1996-05-21',
    draftYear:  2018,
    draftRound: 1,
    draftPick:  7,
    draftOvr:   7,
    undrafted:  false,
  });
});

test('parsePlayerIdsCsv: NA and empty string both become null, per column', () => {
  const csv = makeWidePlayerIdsCsv(
    ',00-0034797,4985,Test Player,QB,2026,,NA,,,,NA,,,,,',
  );
  const { bySleeper } = parsePlayerIdsCsv(csv);
  const entry = bySleeper['4985'];
  assert.equal(entry.birthdate, null);
  assert.equal(entry.draftYear, null);
  assert.equal(entry.draftRound, null);
  assert.equal(entry.draftPick, null);
  assert.equal(entry.draftOvr, null);
  assert.equal(entry.pfrId, null);
  assert.equal(entry.ktcId, null);
  assert.equal(entry.cfbrefId, null);
});

test('parsePlayerIdsCsv: undrafted is true exactly when draftRound is null', () => {
  const csv = makeWidePlayerIdsCsv(
    ',00-0034796,4984,Drafted Guy,QB,2026,1996-05-21,2018,1,7,7,,,,,,',
    ',00-0034798,4986,Undrafted Guy,WR,2026,1998-01-01,2021,,,,,,,,,',
  );
  const { bySleeper } = parsePlayerIdsCsv(csv);
  assert.equal(bySleeper['4984'].undrafted, false);
  assert.equal(bySleeper['4986'].undrafted, true);
  assert.equal(bySleeper['4986'].draftRound, null);
  assert.equal(bySleeper['4986'].draftYear, 2021); // entry year, not draft capital — undrafted disambiguates
});

test('parsePlayerIdsCsv: duplicate gsis_id with matching sleeper_id keeps last and stays lossless in both indexes', () => {
  const csv = makeWidePlayerIdsCsv(
    ',00-0034796,4984,First Entry,QB,2026,,,,,,,,,,,',
    ',00-0034796,4984,Second Entry,QB,2026,,,,,,,,,,,',
  );
  const { ids, bySleeper, rowCount } = parsePlayerIdsCsv(csv);
  assert.equal(rowCount, 1);
  assert.equal(ids['00-0034796'].name, 'Second Entry');
  assert.equal(bySleeper['4984'].gsisId, '00-0034796');
});

test('parsePlayerIdsCsv: duplicate sleeper_id — row with a gsis_id wins over one with NA (sleeper-133 case)', () => {
  const csv = makeWidePlayerIdsCsv(
    ',NA,133,No Gsis,QB,2026,,,,,,,,,,,',
    ',00-0022897,133,Has Gsis,QB,2026,,,,,,,,,,,',
  );
  const { bySleeper } = parsePlayerIdsCsv(csv);
  assert.equal(bySleeper['133'].gsisId, '00-0022897');
});

test('parsePlayerIdsCsv: duplicate sleeper_id — gsis-bearing row wins even when it appears first', () => {
  const csv = makeWidePlayerIdsCsv(
    ',00-0022897,133,Has Gsis,QB,2026,,,,,,,,,,,',
    ',NA,133,No Gsis,QB,2026,,,,,,,,,,,',
  );
  const { bySleeper } = parsePlayerIdsCsv(csv);
  assert.equal(bySleeper['133'].gsisId, '00-0022897');
});

test('parsePlayerIdsCsv: bySleeper includes rows with no gsis_id, with gsisId: null', () => {
  const csv = makeWidePlayerIdsCsv(
    ',NA,7000,Sleeper Only,RB,2026,,,,,,,,,,,',
  );
  const { ids, bySleeper, rowCount, sleeperRowCount } = parsePlayerIdsCsv(csv);
  assert.equal(rowCount, 0);
  assert.equal(sleeperRowCount, 1);
  assert.equal(ids['NA'], undefined);
  assert.equal(bySleeper['7000'].gsisId, null);
});

test('parsePlayerIdsCsv: ids round-trips — every gsis_id in ids appears in bySleeper under its sleeperId', () => {
  const csv = makeWidePlayerIdsCsv(
    ',00-0034796,4984,Josh Allen,QB,2026,1996-05-21,2018,1,7,7,AlleJo02,4984,allen-josh,3918298,Wyoming,BUF',
    ',NA,7000,Sleeper Only,RB,2026,,,,,,,,,,,',
  );
  const { ids, bySleeper } = parsePlayerIdsCsv(csv);
  for (const [gsis, entry] of Object.entries(ids)) {
    const viaBySleeper = bySleeper[entry.sleeperId];
    assert.ok(viaBySleeper, `bySleeper missing sleeperId ${entry.sleeperId} for gsis ${gsis}`);
    assert.equal(viaBySleeper.gsisId, gsis);
  }
});

test('parsePlayerIdsCsv: content-hash dedup notices a change confined to sleeper-only rows', () => {
  const base = makeWidePlayerIdsCsv(
    ',00-0034796,4984,Josh Allen,QB,2026,,,,,,,,,,,',
    ',NA,7000,Sleeper Only,RB,2026,,,,,,,,,,,',
  );
  const changed = makeWidePlayerIdsCsv(
    ',00-0034796,4984,Josh Allen,QB,2026,,,,,,,,,,,',
    ',NA,7000,Sleeper Only,RB,2027,,,,,,,,,,,', // db_season differs; row content otherwise same shape
  );
  const a = parsePlayerIdsCsv(base);
  const b = parsePlayerIdsCsv(changed);
  assert.deepEqual(a.ids, b.ids, 'fixture should keep ids identical across the two parses');
  assert.deepEqual(a.bySleeper, b.bySleeper, 'db_season is not part of bySleeper, so both parses should still agree here');

  // bySleeper itself must differ when a sleeper-only field changes, or dedup would wrongly skip the write.
  const changed2 = makeWidePlayerIdsCsv(
    ',00-0034796,4984,Josh Allen,QB,2026,,,,,,,,,,,',
    ',NA,7000,Sleeper Only,RB,2026,1999-09-09,,,,,,,,,,',
  );
  const c = parsePlayerIdsCsv(changed2);
  assert.deepEqual(a.ids, c.ids, 'ids must stay identical — only a bySleeper-only field changed');
  assert.notDeepEqual(a.bySleeper, c.bySleeper);

  assert.equal(idsHash(a.ids), idsHash(c.ids), 'ids hash must match — the change is confined to bySleeper');
  assert.notEqual(bySleeperHash(a.bySleeper), bySleeperHash(c.bySleeper), 'bySleeper hash must differ so the write is not skipped');
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

/** bySleeper fixture — every row fully filled (birthdate/pfrId rate 1.0) unless overridden. */
function makeBySleeper(count, { birthdateRate = 1, pfrIdRate = 1 } = {}) {
  const bySleeper = {};
  const birthdateCut = Math.round(count * birthdateRate);
  const pfrIdCut     = Math.round(count * pfrIdRate);
  for (let i = 0; i < count; i++) {
    bySleeper[String(i + 1000)] = {
      gsisId:     `00-${String(i).padStart(7, '0')}`,
      pfrId:      i < pfrIdCut ? `pfr${i}` : null,
      ktcId:      null,
      cfbrefId:   null,
      birthdate:  i < birthdateCut ? '1998-01-01' : null,
      draftYear:  2020,
      draftRound: 1,
      draftPick:  1,
      draftOvr:   1,
      undrafted:  false,
    };
  }
  return bySleeper;
}

test('validatePlayerIds: passes on valid input (MIN_PLAYERID_ROWS entries)', () => {
  const ids = makeIds(MIN_PLAYERID_ROWS);
  const bySleeper = makeBySleeper(MIN_PLAYERID_ROWS);
  assert.doesNotThrow(() => validatePlayerIds(ids, bySleeper));
});

test('validatePlayerIds: throws below gate (truncated source)', () => {
  const ids = makeIds(100);
  const bySleeper = makeBySleeper(100);
  assert.throws(() => validatePlayerIds(ids, bySleeper), Error);
});

test('validatePlayerIds: throws when an entry lacks sleeperId', () => {
  const ids = makeIds(MIN_PLAYERID_ROWS);
  const bySleeper = makeBySleeper(MIN_PLAYERID_ROWS);
  // Corrupt one entry to have an empty sleeperId
  ids['00-0000000'].sleeperId = '';
  assert.throws(() => validatePlayerIds(ids, bySleeper), Error);
});

test('validatePlayerIds: throws when >50% missing name', () => {
  const ids = makeIds(MIN_PLAYERID_ROWS);
  const bySleeper = makeBySleeper(MIN_PLAYERID_ROWS);
  // Set all names to null
  for (const v of Object.values(ids)) {
    v.name = null;
  }
  assert.throws(() => validatePlayerIds(ids, bySleeper), Error);
});

test('validatePlayerIds: a fixture where every draft_round is null still passes (finding 2 regression)', () => {
  const ids = makeIds(MIN_PLAYERID_ROWS);
  const bySleeper = makeBySleeper(MIN_PLAYERID_ROWS);
  for (const v of Object.values(bySleeper)) {
    v.draftRound = null;
    v.draftPick  = null;
    v.draftOvr   = null;
    v.undrafted  = true;
  }
  assert.doesNotThrow(() => validatePlayerIds(ids, bySleeper));
});

test('validatePlayerIds: throws when birthdate fill rate is below 0.95', () => {
  const ids = makeIds(MIN_PLAYERID_ROWS);
  const bySleeper = makeBySleeper(MIN_PLAYERID_ROWS, { birthdateRate: 0.9 });
  assert.throws(() => validatePlayerIds(ids, bySleeper), Error);
});

test('validatePlayerIds: passes when birthdate fill rate is at 0.95', () => {
  const ids = makeIds(MIN_PLAYERID_ROWS);
  const bySleeper = makeBySleeper(MIN_PLAYERID_ROWS, { birthdateRate: 0.95 });
  assert.doesNotThrow(() => validatePlayerIds(ids, bySleeper));
});

test('validatePlayerIds: throws when pfr_id fill rate is below 0.85', () => {
  const ids = makeIds(MIN_PLAYERID_ROWS);
  const bySleeper = makeBySleeper(MIN_PLAYERID_ROWS, { pfrIdRate: 0.8 });
  assert.throws(() => validatePlayerIds(ids, bySleeper), Error);
});

test('validatePlayerIds: passes when pfr_id fill rate is at 0.85', () => {
  const ids = makeIds(MIN_PLAYERID_ROWS);
  const bySleeper = makeBySleeper(MIN_PLAYERID_ROWS, { pfrIdRate: 0.85 });
  assert.doesNotThrow(() => validatePlayerIds(ids, bySleeper));
});

// ═══════════════════════════════════════════════════════════════════
// F. aggregateAdvReceiving
// ═══════════════════════════════════════════════════════════════════

// Subset header — weekly ratio columns present but must be ignored by the parser.
// season_type carries 'REG' on every fixture row by default — the REG-only filter
// (advstats-grain-and-share.md §3.1) must pass these rows through unfiltered.
const ADV_HEADER =
  'player_id,player_display_name,position,season,week,season_type,team,' +
  'targets,receiving_air_yards,receiving_yards,receptions,' +
  'target_share,air_yards_share,wopr,racr';

function makeAdvCsv(...rows) { return [ADV_HEADER, ...rows].join('\n'); }

test('aggregateAdvReceiving: share math for single-team WR — weekly ratio columns ignored', () => {
  // Team DAL wk1+wk2: WR-A and WR-B. 9.9 junk values in ratio columns prove they are ignored.
  // DAL totals: wk1=10tgts/100air, wk2=10tgts/100air → restricted denom for A = 20tgts/200air
  const csv = makeAdvCsv(
    '00-0001,WR-A,WR,2023,1,REG,DAL,6,60,90,5,9.9,9.9,9.9,9.9',
    '00-0001,WR-A,WR,2023,2,REG,DAL,4,40,60,3,9.9,9.9,9.9,9.9',
    '00-0002,WR-B,WR,2023,1,REG,DAL,4,40,60,3,9.9,9.9,9.9,9.9',
    '00-0002,WR-B,WR,2023,2,REG,DAL,6,60,90,5,9.9,9.9,9.9,9.9',
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
    '00-0001,WR-A,WR,2023,1,REG,DAL,6,60,90,5,9.9,9.9,9.9,9.9',
    '00-0002,WR-B,WR,2023,1,REG,DAL,4,40,60,3,9.9,9.9,9.9,9.9',
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
    '00-0099,Traded WR,WR,2023,1,REG,ATL,3,30,45,2,0,0,0,0',
    'QB-ATL,Filler QB,QB,2023,1,REG,ATL,7,70,105,5,0,0,0,0',
    '00-0099,Traded WR,WR,2023,2,REG,LA,2,20,30,1,0,0,0,0',
    'QB-LA,Filler QB,QB,2023,2,REG,LA,18,180,270,12,0,0,0,0',
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
    '00-0001,WR-A,WR,2023,1,REG,DAL,6,0,90,5,0,0,0,0',
    '00-0002,WR-B,WR,2023,1,REG,DAL,4,0,60,3,0,0,0,0',
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
    '00-0001,WR-A,WR,2023,1,REG,DAL,6,0,90,5,0,0,0,0',
    '00-0002,WR-B,WR,2023,1,REG,DAL,4,0,60,3,0,0,0,0',
  );
  const { byGsis } = aggregateAdvReceiving(csv);
  assert.equal(byGsis['00-0001'].racr, null);
});

test('aggregateAdvReceiving: RB targets counted in team denom but RB absent when excluded from positions', () => {
  // RB has 10 targets; WR has 5 — WR targetShare = 5/(10+5) = 0.333 when RBs excluded
  const csv = makeAdvCsv(
    '00-RB,RB Player,RB,2023,1,REG,DAL,10,80,60,8,0,0,0,0',
    '00-WR,WR Player,WR,2023,1,REG,DAL,5,50,75,4,0,0,0,0',
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
    '00-RB,RB Player,RB,2023,1,REG,DAL,5,30,50,4,0,0,0,0',
    '00-WR,WR Player,WR,2023,1,REG,DAL,10,100,150,8,0,0,0,0',
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
    '00-RB,RB Player,RB,2023,1,REG,DAL,5,-10,40,4,0,0,0,0',
    '00-WR,WR Player,WR,2023,1,REG,DAL,10,100,150,8,0,0,0,0',
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

// ─── H2. Air-yards plausibility band + |airYardsShare| ≤ 1 (advstats-2016-gate.md §3) ───

/** Builds MIN_ADVSTATS_ROWS players whose Σ airYards ÷ Σ targets equals the given ratio. */
function makeAdvPlayersAtRatio(ratio) {
  const players = makeAdvPlayers(MIN_ADVSTATS_ROWS);
  for (const p of Object.values(players)) {
    p.components = { targets: 50, airYards: Math.round(50 * ratio), recYards: 600, receptions: 40, weeks: 17 };
  }
  return players;
}

test('validateAdvStats: throws when Σ airYards ÷ Σ targets is below AY_PER_TARGET_MIN (synthetic 2016-shaped ratio 3.96)', () => {
  const players = makeAdvPlayersAtRatio(3.96);
  assert.throws(() => validateAdvStats(players, { year: 2016 }), /3\.96/);
});

test('validateAdvStats: passes when Σ airYards ÷ Σ targets is in band (synthetic 2023-shaped ratio 7.82)', () => {
  const players = makeAdvPlayersAtRatio(7.82);
  assert.doesNotThrow(() => validateAdvStats(players, { year: 2023 }));
});

test(`validateAdvStats: ratio exactly at AY_PER_TARGET_MIN (${AY_PER_TARGET_MIN}) and AY_PER_TARGET_MAX (${AY_PER_TARGET_MAX}) both pass`, () => {
  assert.doesNotThrow(() => validateAdvStats(makeAdvPlayersAtRatio(AY_PER_TARGET_MIN), { year: 2023 }));
  assert.doesNotThrow(() => validateAdvStats(makeAdvPlayersAtRatio(AY_PER_TARGET_MAX), { year: 2023 }));
});

test('validateAdvStats: Σtargets === 0 skips the band check — no divide-by-zero, no NaN pass', () => {
  const players = makeAdvPlayers(MIN_ADVSTATS_ROWS);
  for (const p of Object.values(players)) {
    p.components = { targets: 0, airYards: 0, recYards: 0, receptions: 0, weeks: 17 };
    p.targetShare = null;
    p.airYardsShare = null;
    p.wopr = 0.1;   // keep at least one non-null ratio so the all-null guard doesn't also fire
    p.racr = 0.1;
  }
  assert.doesNotThrow(() => validateAdvStats(players, { year: 2023 }));
});

test('validateAdvStats: |airYardsShare| > 1 throws; negative values (RB) pass', () => {
  const passing = makeAdvPlayers(MIN_ADVSTATS_ROWS);
  Object.values(passing)[0].airYardsShare = -0.5;
  assert.doesNotThrow(() => validateAdvStats(passing, { year: 2023 }));

  const throwing = makeAdvPlayers(MIN_ADVSTATS_ROWS);
  Object.values(throwing)[0].airYardsShare = 1.5;
  assert.throws(() => validateAdvStats(throwing, { year: 2023 }), /airYardsShare/);
});

test('validateAdvStats: the REAL nflverse/advstats/2016.json passes (re-ingested 2026-08-30, reingest-2016.md)', () => {
  // C2 (advstats-2016-gate.md) found 2016 corrupt from a stale legacy-tag ingest and this
  // test originally asserted the gate caught it. reingest-2016.md re-fetched 2016 from the
  // current stats_player tag, which passes the same gate — the negative case (a genuinely
  // corrupt season) stays covered by the synthetic-ratio fixture above.
  const data = readJson('nflverse/advstats/2016.json');
  assert.ok(data?.players, 'nflverse/advstats/2016.json not found on disk');
  assert.doesNotThrow(() => validateAdvStats(data.players, { year: 2016 }));
});

test('validateAdvStats: the REAL nflverse/advstats/2023.json passes', () => {
  const data = readJson('nflverse/advstats/2023.json');
  assert.ok(data?.players, 'nflverse/advstats/2023.json not found on disk');
  assert.doesNotThrow(() => validateAdvStats(data.players, { year: 2023 }));
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

// ═══════════════════════════════════════════════════════════════════
// I. parsePlayerGameLogs
// ═══════════════════════════════════════════════════════════════════

const GAMELOG_HEADER = [
  'player_id', 'player_display_name', 'position', 'season', 'week',
  'season_type', 'team', 'opponent_team',
  'completions', 'passing_epa', 'pacr',
  'carries',
  'receptions', 'targets', 'receiving_yards', 'receiving_air_yards', 'target_share',
].join(',');

function makeGamelogCsv(...dataRows) {
  return [GAMELOG_HEADER, ...dataRows].join('\n');
}

// Header field indices (0-based):
//  8=completions  9=passing_epa  10=pacr  11=carries  12=receptions  13=targets
//  14=receiving_yards  15=receiving_air_yards  16=target_share
// WR: receiving cells populated; passing cells empty; carries=0 (real zero, must be kept)
const WR_ROW_W1 = '00-0033921,CeeDee Lamb,WR,2024,1,REG,DAL,CLE,,,,0,9,13,110,42,0.31';
const WR_ROW_W2 = '00-0033921,CeeDee Lamb,WR,2024,2,REG,DAL,PHI,,,,0,6,9,88,55,0.28';
// QB: passing cells populated; carries=10; receiving zeros are real (kept)
const QB_ROW_W1 = '00-0023459,Patrick Mahomes,QB,2024,1,REG,KC,BUF,32,7.5,,10,0,0,0,0,';
const QB_ROW_W2 = '00-0023459,Patrick Mahomes,QB,2024,2,REG,KC,JAC,28,5.2,,8,0,0,0,0,';

test('parsePlayerGameLogs: happy path — 2 players × 2 weeks', () => {
  const csv = makeGamelogCsv(WR_ROW_W1, WR_ROW_W2, QB_ROW_W1, QB_ROW_W2);
  const { byGsis, season, rowCount } = parsePlayerGameLogs(csv);

  assert.equal(rowCount, 4, 'rowCount should be total game rows');
  assert.equal(season, 2024);
  assert.ok(byGsis['00-0033921'], 'WR should be present');
  assert.ok(byGsis['00-0023459'], 'QB should be present');
  assert.equal(byGsis['00-0033921'].games.length, 2);
  assert.equal(byGsis['00-0023459'].games.length, 2);
});

test('parsePlayerGameLogs: WR game row — has receiving keys, omits passing keys', () => {
  const csv = makeGamelogCsv(WR_ROW_W1);
  const { byGsis } = parsePlayerGameLogs(csv);
  const g = byGsis['00-0033921'].games[0];

  // receiving fields present
  assert.equal(g.receptions, 9);
  assert.equal(g.targets, 13);
  assert.equal(g.receivingYards, 110);
  assert.equal(g.receivingAirYards, 42);
  assert.equal(g.targetShare, 0.31);

  // passing fields absent (empty in source → null → omitted)
  assert.ok(!Object.hasOwn(g, 'passingEpa'), 'passingEpa should be omitted');
  assert.ok(!Object.hasOwn(g, 'pacr'),       'pacr should be omitted');

  // carries:0 — real zero → present
  assert.ok(Object.hasOwn(g, 'carries'), 'carries should be present');
  assert.equal(g.carries, 0);
});

test('parsePlayerGameLogs: QB game row — has passing keys', () => {
  const csv = makeGamelogCsv(QB_ROW_W1);
  const { byGsis } = parsePlayerGameLogs(csv);
  const g = byGsis['00-0023459'].games[0];

  assert.equal(g.completions, 32);
  assert.equal(g.passingEpa, 7.5);
  assert.equal(g.carries, 10);
});

test('parsePlayerGameLogs: omit-on-null — "0" present, "" absent, "NA" absent', () => {
  // Row with: completions="" (omit), passing_epa="NA" (omit), carries="0" (keep)
  const row = '00-0001111,Test QB,QB,2024,1,REG,DEN,LV,,NA,,0,,,,,';
  const csv = makeGamelogCsv(row);
  const { byGsis } = parsePlayerGameLogs(csv);
  const g = byGsis['00-0001111'].games[0];

  assert.ok(!Object.hasOwn(g, 'completions'), 'empty string → omitted');
  assert.ok(!Object.hasOwn(g, 'passingEpa'),  'NA → omitted');
  assert.ok(Object.hasOwn(g, 'carries'),      'zero string → present');
  assert.equal(g.carries, 0);
});

test('parsePlayerGameLogs: position filter — K/CB excluded, QB/RB/WR/TE/FB included', () => {
  const kRow  = '00-0099001,Tucker K,K,2024,1,REG,BAL,NYJ,,,,,,,,,,';
  const cbRow = '00-0099002,Corner CB,CB,2024,1,REG,CIN,PIT,,,,,,,,,,';
  const rbRow = '00-0099003,Running RB,RB,2024,1,REG,DET,GB,,,,,5,0,60,0,0.15';
  const csv = makeGamelogCsv(kRow, cbRow, rbRow);
  const { byGsis, rowCount } = parsePlayerGameLogs(csv);

  assert.ok(!byGsis['00-0099001'], 'K should be excluded');
  assert.ok(!byGsis['00-0099002'], 'CB should be excluded');
  assert.ok(byGsis['00-0099003'],  'RB should be included');
  assert.equal(rowCount, 1);
});

test('parsePlayerGameLogs: identity always present even with all-empty stat cells', () => {
  const row = '00-0001234,Ghost WR,WR,2024,5,POST,SF,PHI,,,,,,,,,,';
  const csv = makeGamelogCsv(row);
  const { byGsis } = parsePlayerGameLogs(csv);
  const g = byGsis['00-0001234'].games[0];

  assert.equal(g.week, 5);
  assert.equal(g.seasonType, 'POST');
  assert.equal(g.team, 'SF');
  assert.equal(g.opponent, 'PHI');
});

test('parsePlayerGameLogs: missing required column (player_id) → throws', () => {
  // Header without player_id
  const csv = 'player_display_name,position,season,week,team\nCeeDee Lamb,WR,2024,1,DAL';
  assert.throws(() => parsePlayerGameLogs(csv), /required columns missing/);
});

test('parsePlayerGameLogs: missing required column (week) → throws', () => {
  const csv = 'player_id,position,season,team\n00-0033921,WR,2024,DAL';
  assert.throws(() => parsePlayerGameLogs(csv), /required columns missing/);
});

// ═══════════════════════════════════════════════════════════════════
// J. rekeyGameLogsBySleeper
// ═══════════════════════════════════════════════════════════════════

test('rekeyGameLogsBySleeper: maps gsis A → sleeper; drops unmapped gsis B', () => {
  const byGsis = {
    'A': { gsisId: 'A', name: 'Player A', position: 'WR', games: [{ week: 1 }] },
    'B': { gsisId: 'B', name: 'Player B', position: 'TE', games: [{ week: 1 }] },
  };
  const crosswalkIds = { 'A': { sleeperId: '9999' } };

  const { players, unmapped } = rekeyGameLogsBySleeper(byGsis, crosswalkIds);

  assert.ok(players['9999'], 'gsis A should be re-keyed to sleeper 9999');
  assert.ok(!players['B'],   'gsis B should not appear as a key');
  assert.equal(unmapped, 1);
  assert.deepEqual(players['9999'].games, [{ week: 1 }]);
});

test('rekeyGameLogsBySleeper: all unmapped → empty players, unmapped = count', () => {
  const byGsis = {
    'X': { gsisId: 'X', name: 'Nobody', position: 'QB', games: [] },
  };
  const { players, unmapped } = rekeyGameLogsBySleeper(byGsis, {});
  assert.deepEqual(players, {});
  assert.equal(unmapped, 1);
});

// ═══════════════════════════════════════════════════════════════════
// K. validateGameLogs
// ═══════════════════════════════════════════════════════════════════

function makeGamelogPlayers(count, { withStats = true } = {}) {
  const players = {};
  for (let i = 0; i < count; i++) {
    const game = { week: 1, seasonType: 'REG', team: 'DAL', opponent: 'CLE' };
    // targets/receivingAirYards at an in-band ratio (8.0) so tests targeting OTHER
    // checks (sparsity, targetShare bounds, the withStats=true drift case) don't
    // incidentally trip the new air-yards band or its Σtargets===0 column-drift throw.
    if (withStats) { game.receptions = 5; game.targets = 5; game.receivingAirYards = 40; }
    players[String(i + 1)] = {
      gsisId:   `00-000${String(i).padStart(4, '0')}`,
      name:     `Player ${i}`,
      position: 'WR',
      games:    [game],
    };
  }
  return players;
}

test('validateGameLogs: sparse season (totalRows < MIN_PLAYERGAME_ROWS) throws', () => {
  const players = makeGamelogPlayers(MIN_PLAYERGAME_ROWS - 1);
  assert.throws(() => validateGameLogs(players, { year: 2023 }), /game rows.*expected/);
});

test('validateGameLogs: missing non-air-yards stat fields does not throw', () => {
  // Valid: absent key = null = "stat not recorded", which is legal for sparse seasons —
  // as long as targets/receivingAirYards are present (satisfying the new §2 band; a
  // genuinely all-missing receivingAirYards season is indistinguishable from corruption
  // and SHOULD throw — ratio 0 is outside [6, 11] — so that case is not tested here).
  const players = makeGamelogPlayers(MIN_PLAYERGAME_ROWS);
  // receivingYards (not part of the air-yards band) is omitted from every game
  assert.doesNotThrow(() => validateGameLogs(players, { year: 2023 }));
});

test('validateGameLogs: targetShare 1.0 passes; 1.4 throws; airYardsShare -0.2 passes', () => {
  const players = makeGamelogPlayers(MIN_PLAYERGAME_ROWS);
  // valid targetShare
  players['1'].games[0].targetShare = 1.0;
  assert.doesNotThrow(() => validateGameLogs(players, { year: 2023 }));

  // airYardsShare negative — allowed (RB behind-LOS)
  players['1'].games[0].airYardsShare = -0.2;
  assert.doesNotThrow(() => validateGameLogs(players, { year: 2023 }));

  // out-of-range targetShare
  players['1'].games[0].targetShare = 1.4;
  assert.throws(() => validateGameLogs(players, { year: 2023 }), /targetShare out of \[0,1\]/);
});

test('validateGameLogs: column-drift — game rows with only identity keys throws', () => {
  // All game rows carry only week/seasonType/team/opponent — no stat keys
  // (simulates all stat columns dropped upstream)
  const players = makeGamelogPlayers(MIN_PLAYERGAME_ROWS, { withStats: false });
  assert.throws(() => validateGameLogs(players, { year: 2023 }), /column drift/);
});

test('validateGameLogs: normal players with stat keys passes', () => {
  const players = makeGamelogPlayers(MIN_PLAYERGAME_ROWS, { withStats: true });
  assert.doesNotThrow(() => validateGameLogs(players, { year: 2023 }));
});

// ─── K2. Air-yards plausibility band, shared with validateAdvStats
//         (gamelogs-airyards-gate.md §2 — deliberately inverts the advstats
//         Σtargets===0 SKIP into a THROW; see §1.3/§2.1 for the omitted bound) ───

/** MIN_PLAYERGAME_ROWS players, one game each, whose Σ receivingAirYards ÷ Σ targets equals ratio. */
function makeGamelogPlayersAtRatio(ratio, { targets = 5 } = {}) {
  const players = makeGamelogPlayers(MIN_PLAYERGAME_ROWS, { withStats: true });
  for (const p of Object.values(players)) {
    p.games[0].targets = targets;
    p.games[0].receivingAirYards = targets * ratio; // exact per-row ratio — no rounding drift
  }
  return players;
}

test('validateGameLogs: throws when Σ receivingAirYards ÷ Σ targets is below AY_PER_TARGET_MIN (synthetic 2016-shaped ratio 3.93)', () => {
  const players = makeGamelogPlayersAtRatio(3.93);
  assert.throws(() => validateGameLogs(players, { year: 2016 }), /3\.93/);
});

test('validateGameLogs: passes when Σ receivingAirYards ÷ Σ targets is in band (synthetic 2016-shaped ratio 8.42, all-rows)', () => {
  const players = makeGamelogPlayersAtRatio(8.42);
  assert.doesNotThrow(() => validateGameLogs(players, { year: 2016 }));
});

test(`validateGameLogs: ratio exactly at AY_PER_TARGET_MIN (${AY_PER_TARGET_MIN}) and AY_PER_TARGET_MAX (${AY_PER_TARGET_MAX}) both pass`, () => {
  assert.doesNotThrow(() => validateGameLogs(makeGamelogPlayersAtRatio(AY_PER_TARGET_MIN), { year: 2023 }));
  assert.doesNotThrow(() => validateGameLogs(makeGamelogPlayersAtRatio(AY_PER_TARGET_MAX), { year: 2023 }));
});

test('validateGameLogs: Σtargets === 0 THROWS as column drift — the deliberate inversion of validateAdvStats\' skip', () => {
  // parsePlayerGameLogs has no required `targets` column (unlike aggregateAdvReceiving,
  // which hard-throws when `targets` is missing), so a renamed/dropped targets column
  // would otherwise sail through the row floor and the format-drift guard and silently
  // disable this gate. MIN_PLAYERGAME_ROWS rows, zero of them with targets, is
  // definitionally drift, not an empty season — must throw, not skip (§2).
  const players = makeGamelogPlayers(MIN_PLAYERGAME_ROWS, { withStats: true });
  for (const p of Object.values(players)) {
    p.games[0].targets = 0;
    p.games[0].receivingAirYards = 0;
  }
  assert.throws(() => validateGameLogs(players, { year: 2023 }), /Σ targets = 0|column drift/);
});

test('validateGameLogs: a synthetic row at airYardsShare = 1.842 (D.J. Moore, 2022 wk6, real) passes — the §1.3/§2.1 regression lock', () => {
  // Per-game airYardsShare divides by the team's NET air yards for that single game,
  // which can be near zero or negative on pass-heavy-behind-the-line games — a receiver
  // with positive air yards can legitimately exceed a 100% share. This is the test that
  // stops a later slice from "completing the mirror" by adding an |airYardsShare| <= 1
  // bound to validateGameLogs (advstats has one; gamelogs deliberately does not — five
  // real rows across 2015/2022/2025 exceed it). Band-check fields stay in-range (ratio 8)
  // so only the airYardsShare value itself is under test.
  const players = makeGamelogPlayersAtRatio(8);
  players['1'].games[0].airYardsShare = 1.84210526315789; // D.J. Moore, 2022 wk6: 35 recAY / 7 tgt
  assert.doesNotThrow(() => validateGameLogs(players, { year: 2022 }));
});

test('validateGameLogs: the REAL nflverse/gamelogs/2016.json passes (re-ingested 2026-08-30, all-rows ratio 8.42)', () => {
  const data = readJson('nflverse/gamelogs/2016.json');
  assert.ok(data?.players, 'nflverse/gamelogs/2016.json not found on disk');
  assert.doesNotThrow(() => validateGameLogs(data.players, { year: 2016 }));
});

// ═══════════════════════════════════════════════════════════════════
// L. aggregateTeamContext / eraTeam
// ═══════════════════════════════════════════════════════════════════

const TC_HEADER = [
  'game_id', 'season', 'week', 'season_type', 'posteam', 'defteam', 'home_team', 'away_team',
  'pass', 'rush', 'play_type', 'two_point_attempt', 'xpass', 'epa', 'success', 'wp', 'qtr',
  'half_seconds_remaining', 'game_seconds_remaining', 'yardline_100', 'fixed_drive',
  'fixed_drive_result', 'total_home_score', 'total_away_score',
].join(',');

function makeTcCsv(...rows) { return [TC_HEADER, ...rows].join('\n'); }

/** Build one pbp CSV row; every field defaults to a countable neutral KC-offense play. */
function tcRow(o = {}) {
  const d = {
    gameId: '2024_01_KC_BAL', season: 2024, week: 1, seasonType: 'REG',
    posteam: 'KC', defteam: 'BAL', homeTeam: 'KC', awayTeam: 'BAL',
    pass: 1, rush: 0, playType: 'pass', twoPointAttempt: 0,
    xpass: '', epa: '', success: '', wp: 0.5, qtr: 1,
    halfSecondsRemaining: 900, gameSecondsRemaining: 1800,
    yardline100: 50, fixedDrive: 1, fixedDriveResult: '',
    totalHomeScore: '', totalAwayScore: '',
    ...o,
  };
  return [
    d.gameId, d.season, d.week, d.seasonType, d.posteam, d.defteam, d.homeTeam, d.awayTeam,
    d.pass, d.rush, d.playType, d.twoPointAttempt, d.xpass, d.epa, d.success, d.wp, d.qtr,
    d.halfSecondsRemaining, d.gameSecondsRemaining, d.yardline100, d.fixedDrive,
    d.fixedDriveResult, d.totalHomeScore, d.totalAwayScore,
  ].join(',');
}

test('eraTeam: remaps LA/LAC/LV to era-accurate codes only within their boundary seasons', () => {
  assert.equal(eraTeam('LA', 2015), 'STL');
  assert.equal(eraTeam('LA', 2016), 'LA');
  assert.equal(eraTeam('LAC', 2016), 'SD');
  assert.equal(eraTeam('LAC', 2017), 'LAC');
  assert.equal(eraTeam('LV', 2019), 'OAK');
  assert.equal(eraTeam('LV', 2020), 'LV');
  assert.equal(eraTeam('KC', 2013), 'KC');
});

test('aggregateTeamContext: happy path — off/def components and rates for both teams', () => {
  const csv = makeTcCsv(
    tcRow({
      pass: 1, rush: 0, playType: 'pass', xpass: 0.6, epa: 1.0, success: 1,
      yardline100: 50, fixedDrive: 1, fixedDriveResult: 'Touchdown',
      totalHomeScore: 7, totalAwayScore: 3,
    }),
    tcRow({
      pass: 0, rush: 1, playType: 'run', xpass: 0.3, epa: -0.2, success: 0,
      yardline100: 10, fixedDrive: 1, fixedDriveResult: 'Touchdown',
      totalHomeScore: 7, totalAwayScore: 3,
    }),
    tcRow({
      posteam: 'BAL', defteam: 'KC', pass: 1, rush: 0, playType: 'pass',
      xpass: 0.5, epa: 0.3, success: 1, yardline100: 50, qtr: 2,
      fixedDrive: 2, fixedDriveResult: 'Punt',
      totalHomeScore: 7, totalAwayScore: 3,
    }),
  );
  const { teams, rowCount, teamCount } = aggregateTeamContext(csv, { season: 2024 });

  assert.equal(rowCount, 2);
  assert.equal(teamCount, 2);

  const kc = teams.KC.games[0];
  assert.equal(kc.week, 1);
  assert.equal(kc.opponent, 'BAL');
  assert.equal(kc.off.plays, 2);
  assert.equal(kc.off.passPlays, 1);
  assert.equal(kc.off.rushPlays, 1);
  assert.equal(kc.off.passRate, 0.5);
  assert.equal(kc.off.epaSum, 0.8);
  assert.equal(kc.off.epaPerPlay, 0.4);
  assert.equal(kc.off.passEpaPerPlay, 1.0);
  assert.equal(kc.off.rushEpaPerPlay, -0.2);
  assert.equal(kc.off.successRate, 0.5);
  assert.equal(kc.off.proePlays, 2);
  assert.equal(kc.off.proePassPlays, 1);
  assert.equal(kc.off.proeXpassSum, 0.9);
  assert.equal(kc.off.proe, Math.round((1 - 0.9) / 2 * 1000) / 1000);
  assert.equal(kc.off.rzTrips, 1);
  assert.equal(kc.off.rzPlays, 1);
  assert.equal(kc.off.rzTdTrips, 1);
  assert.equal(kc.off.rzFgTrips, 0);
  assert.equal(kc.off.pointsScored, 7);

  assert.equal(kc.def.plays, 1);
  assert.equal(kc.def.epaPerPlay, 0.3);
  assert.equal(kc.def.successRate, 1);
  assert.equal(kc.def.rzTripsAllowed, 0);
  assert.equal(kc.def.pointsAllowed, 3);

  const bal = teams.BAL.games[0];
  assert.equal(bal.off.plays, 1);
  assert.equal(bal.off.passRate, 1);
  assert.equal(bal.off.proe, 0.5);
  assert.equal(bal.off.pointsScored, 3);

  assert.equal(bal.def.plays, 2);
  assert.equal(bal.def.epaPerPlay, 0.4);
  assert.equal(bal.def.rzTripsAllowed, 1);
  assert.equal(bal.def.rzTdTripsAllowed, 1);
  assert.equal(bal.def.pointsAllowed, 7);
});

test('aggregateTeamContext: basis exclusions — no_play and two_point_attempt rows excluded from plays/PROE/RZ', () => {
  const csv = makeTcCsv(
    tcRow({ pass: 1, playType: 'no_play', xpass: 0.6, epa: 0.2, success: 1, yardline100: 10, fixedDrive: 1 }),
    tcRow({ pass: 1, twoPointAttempt: 1, playType: 'pass', xpass: 0.4, epa: 0.5, success: 1, yardline100: 5, fixedDrive: 1 }),
  );
  const { teams } = aggregateTeamContext(csv, { season: 2024 });
  const kc = teams.KC.games[0];
  assert.equal(kc.off.plays, 0);
  assert.equal(kc.off.proePlays, 0);
  assert.equal(kc.off.rzPlays, 0);
  assert.equal(kc.off.rzTrips, 0);
});

test('aggregateTeamContext: RZ trip dedup — 3 plays in one drive = 1 trip; Touchdown → rzTdTrips', () => {
  const csv = makeTcCsv(
    tcRow({ pass: 1, playType: 'pass', yardline100: 15, fixedDrive: 1, fixedDriveResult: 'Touchdown' }),
    tcRow({ pass: 0, rush: 1, playType: 'run', yardline100: 8, fixedDrive: 1, fixedDriveResult: 'Touchdown' }),
    tcRow({ pass: 0, rush: 1, playType: 'run', yardline100: 1, fixedDrive: 1, fixedDriveResult: 'Touchdown' }),
  );
  const { teams } = aggregateTeamContext(csv, { season: 2024 });
  const kc = teams.KC.games[0];
  assert.equal(kc.off.rzTrips, 1);
  assert.equal(kc.off.rzPlays, 3);
  assert.equal(kc.off.rzTdTrips, 1);
  assert.equal(kc.off.rzFgTrips, 0);
});

test('aggregateTeamContext: RZ trip outcome — Field goal maps to rzFgTrips', () => {
  const csv = makeTcCsv(
    tcRow({ pass: 1, playType: 'pass', yardline100: 12, fixedDrive: 1, fixedDriveResult: 'Field goal' }),
  );
  const { teams } = aggregateTeamContext(csv, { season: 2024 });
  const kc = teams.KC.games[0];
  assert.equal(kc.off.rzTrips, 1);
  assert.equal(kc.off.rzTdTrips, 0);
  assert.equal(kc.off.rzFgTrips, 1);
});

test('aggregateTeamContext: RZ trip outcome — Opp touchdown counts as neither TD nor FG trip', () => {
  const csv = makeTcCsv(
    tcRow({ pass: 1, playType: 'pass', yardline100: 12, fixedDrive: 1, fixedDriveResult: 'Opp touchdown' }),
  );
  const { teams } = aggregateTeamContext(csv, { season: 2024 });
  const kc = teams.KC.games[0];
  assert.equal(kc.off.rzTrips, 1);
  assert.equal(kc.off.rzTdTrips, 0);
  assert.equal(kc.off.rzFgTrips, 0);
});

test('aggregateTeamContext: pace — gaps clamped to [5,45]; an out-of-range gap does not break the chain', () => {
  const neutral = { wp: 0.5, qtr: 1, halfSecondsRemaining: 900 };
  const csv = makeTcCsv(
    tcRow({ pass: 1, playType: 'pass', fixedDrive: 1, gameSecondsRemaining: 1000, ...neutral }),
    tcRow({ pass: 1, playType: 'pass', fixedDrive: 1, gameSecondsRemaining: 970,  ...neutral }), // gap 30 — kept
    tcRow({ pass: 1, playType: 'pass', fixedDrive: 1, gameSecondsRemaining: 920,  ...neutral }), // gap 50 — excluded, chain continues
    tcRow({ pass: 1, playType: 'pass', fixedDrive: 1, gameSecondsRemaining: 912,  ...neutral }), // gap 8  — kept
  );
  const { teams } = aggregateTeamContext(csv, { season: 2024 });
  const kc = teams.KC.games[0];
  assert.equal(kc.off.neutralGaps, 2);
  assert.equal(kc.off.neutralSeconds, 38);
  assert.equal(kc.off.neutralSecPerPlay, 19);
});

test('aggregateTeamContext: pace — a non-countable row between neutral snaps breaks the chain', () => {
  const neutral = { wp: 0.5, qtr: 1, halfSecondsRemaining: 900 };
  const csv = makeTcCsv(
    tcRow({ pass: 1, playType: 'pass',    fixedDrive: 1, gameSecondsRemaining: 1000, ...neutral }),
    tcRow({ pass: 1, playType: 'no_play', fixedDrive: 1, gameSecondsRemaining: 985,  ...neutral }),
    tcRow({ pass: 1, playType: 'pass',    fixedDrive: 1, gameSecondsRemaining: 970,  ...neutral }),
  );
  const { teams } = aggregateTeamContext(csv, { season: 2024 });
  const kc = teams.KC.games[0];
  assert.equal(kc.off.neutralGaps, 0);
  assert.equal(kc.off.neutralSecPerPlay, null);
});

test('aggregateTeamContext: era remap — 2013 pbp LA/LAC/LV keys become STL/SD/OAK', () => {
  const csv = makeTcCsv(
    tcRow({ season: 2013, gameId: '2013_01_STL_ARI', posteam: 'LA',  defteam: 'ARI', homeTeam: 'LA',  awayTeam: 'ARI' }),
    tcRow({ season: 2013, gameId: '2013_02_SD_DEN',  posteam: 'LAC', defteam: 'DEN', homeTeam: 'LAC', awayTeam: 'DEN' }),
    tcRow({ season: 2013, gameId: '2013_03_OAK_KC',  posteam: 'LV',  defteam: 'KC',  homeTeam: 'LV',  awayTeam: 'KC' }),
  );
  const { teams } = aggregateTeamContext(csv, { season: 2013 });
  assert.ok(teams.STL, 'LA should remap to STL in 2013');
  assert.ok(teams.SD, 'LAC should remap to SD in 2013');
  assert.ok(teams.OAK, 'LV should remap to OAK in 2013');
  assert.ok(!teams.LA && !teams.LAC && !teams.LV, 'current-franchise codes should not leak through');
});

test('aggregateTeamContext: era remap — 2024 pbp keys are current-franchise, unchanged', () => {
  const csv = makeTcCsv(
    tcRow({ season: 2024, gameId: '2024_01_LA_ARI', posteam: 'LA',  defteam: 'ARI', homeTeam: 'LA',  awayTeam: 'ARI' }),
    tcRow({ season: 2024, gameId: '2024_02_LAC_DEN', posteam: 'LAC', defteam: 'DEN', homeTeam: 'LAC', awayTeam: 'DEN' }),
    tcRow({ season: 2024, gameId: '2024_03_LV_KC',  posteam: 'LV',  defteam: 'KC',  homeTeam: 'LV',  awayTeam: 'KC' }),
  );
  const { teams } = aggregateTeamContext(csv, { season: 2024 });
  assert.ok(teams.LA && teams.LAC && teams.LV);
});

test('aggregateTeamContext: pre-xpass honest null — all xpass NA → proe/proePlays null/0; other features still compute', () => {
  const csv = makeTcCsv(
    tcRow({ season: 2005, pass: 1, playType: 'pass', xpass: 'NA', epa: 0.5, success: 1, yardline100: 50 }),
    tcRow({ season: 2005, pass: 0, rush: 1, playType: 'run', xpass: 'NA', epa: -0.1, success: 0, yardline100: 50 }),
  );
  const { teams } = aggregateTeamContext(csv, { season: 2005 });
  const kc = teams.KC.games[0];
  assert.equal(kc.off.proe, null);
  assert.equal(kc.off.proePlays, 0);
  assert.equal(kc.off.plays, 2);
  assert.equal(kc.off.epaPerPlay, 0.2);
});

test('aggregateTeamContext: bye week — team absent from a week has no fabricated games[] entry', () => {
  const csv = makeTcCsv(
    tcRow({ gameId: '2024_01_KC_BAL', week: 1, posteam: 'KC', defteam: 'BAL', homeTeam: 'KC', awayTeam: 'BAL' }),
    tcRow({ gameId: '2024_02_KC_DEN', week: 2, posteam: 'KC', defteam: 'DEN', homeTeam: 'KC', awayTeam: 'DEN' }),
  );
  const { teams } = aggregateTeamContext(csv, { season: 2024 });
  assert.equal(teams.KC.games.length, 2);
  assert.equal(teams.BAL.games.length, 1);
  assert.equal(teams.BAL.games[0].week, 1);
});

test('aggregateTeamContext: header-only CSV → rowCount 0', () => {
  const { teams, rowCount, teamCount } = aggregateTeamContext(TC_HEADER, { season: 2024 });
  assert.equal(rowCount, 0);
  assert.equal(teamCount, 0);
  assert.deepEqual(teams, {});
});

test('aggregateTeamContext: wrong-season CSV (season column mismatch) throws', () => {
  const csv = makeTcCsv(tcRow({ season: 2023 }));
  assert.throws(() => aggregateTeamContext(csv, { season: 2024 }), /does not match requested season/);
});

test('aggregateTeamContext: missing required header column throws', () => {
  const badHeader = TC_HEADER.split(',').filter(c => c !== 'xpass').join(',');
  const csv = [badHeader, tcRow()].join('\n');
  assert.throws(() => aggregateTeamContext(csv, { season: 2024 }), /required columns missing/);
});

// ═══════════════════════════════════════════════════════════════════
// M. validateTeamContext
// ═══════════════════════════════════════════════════════════════════

function makeTcOffDef(overrides = {}) {
  return {
    off: {
      plays: 60, passPlays: 35, rushPlays: 25, passRate: 0.583,
      epaSum: 5, epaPlays: 60, epaPerPlay: 0.083,
      passEpaSum: 3, passEpaPlays: 35, passEpaPerPlay: 0.086,
      rushEpaSum: 2, rushEpaPlays: 25, rushEpaPerPlay: 0.08,
      successes: 28, successPlays: 60, successRate: 0.467,
      proePlays: 58, proePassPlays: 34, proeXpassSum: 33, proe: 0.017,
      rzTrips: 3, rzPlays: 9, rzPassPlays: 5, rzRushPlays: 4, rzPassRate: 0.556,
      rzTdTrips: 2, rzFgTrips: 1,
      neutralSeconds: 900, neutralGaps: 30, neutralSecPerPlay: 30,
      pointsScored: 24,
      ...(overrides.off || {}),
    },
    def: {
      plays: 60, passPlays: 33, rushPlays: 27,
      epaSum: -2, epaPlays: 60, epaPerPlay: -0.033,
      passEpaSum: -1, passEpaPlays: 33, passEpaPerPlay: -0.03,
      rushEpaSum: -1, rushEpaPlays: 27, rushEpaPerPlay: -0.037,
      successes: 25, successPlays: 60, successRate: 0.417,
      rzTripsAllowed: 2, rzTdTripsAllowed: 1,
      pointsAllowed: 17,
      ...(overrides.def || {}),
    },
  };
}

function makeTcGames(n, overrides = {}) {
  return Array.from({ length: n }, (_, i) => ({
    week: i + 1, seasonType: 'REG', gameId: `g${i + 1}`, opponent: 'XXX',
    ...makeTcOffDef(overrides),
  }));
}

test('validateTeamContext: passes on valid input (>= MIN_TEAMCONTEXT_ROWS rows)', () => {
  const teams = { KC: { games: makeTcGames(MIN_TEAMCONTEXT_ROWS) } };
  assert.doesNotThrow(() => validateTeamContext(teams, { year: 2023 }));
});

test('validateTeamContext: throws below MIN_TEAMCONTEXT_ROWS (truncated/preliminary fetch)', () => {
  const teams = { KC: { games: makeTcGames(MIN_TEAMCONTEXT_ROWS - 1) } };
  assert.throws(() => validateTeamContext(teams, { year: 2023 }), /expected ≥/);
});

test('validateTeamContext: throws when > 32 teams', () => {
  const teams = {};
  for (let i = 0; i < 33; i++) teams[`T${i}`] = { games: makeTcGames(2) };
  assert.throws(() => validateTeamContext(teams, { year: 2023 }), /teams — expected/);
});

test('validateTeamContext: era-domain guard — LA at year<=2015 throws; STL at year>=2016 throws', () => {
  assert.throws(() => validateTeamContext({ LA: { games: makeTcGames(MIN_TEAMCONTEXT_ROWS) } }, { year: 2015 }), /LA.*STL/);
  assert.throws(() => validateTeamContext({ STL: { games: makeTcGames(MIN_TEAMCONTEXT_ROWS) } }, { year: 2016 }), /STL/);
  assert.doesNotThrow(() => validateTeamContext({ STL: { games: makeTcGames(MIN_TEAMCONTEXT_ROWS) } }, { year: 2015 }));
  assert.doesNotThrow(() => validateTeamContext({ LA: { games: makeTcGames(MIN_TEAMCONTEXT_ROWS) } }, { year: 2016 }));
});

test('validateTeamContext: era-domain guard — LAC/SD boundary at 2016/2017', () => {
  assert.throws(() => validateTeamContext({ LAC: { games: makeTcGames(MIN_TEAMCONTEXT_ROWS) } }, { year: 2016 }), /LAC.*SD/);
  assert.throws(() => validateTeamContext({ SD: { games: makeTcGames(MIN_TEAMCONTEXT_ROWS) } }, { year: 2017 }), /SD/);
});

test('validateTeamContext: era-domain guard — LV/OAK boundary at 2019/2020', () => {
  assert.throws(() => validateTeamContext({ LV: { games: makeTcGames(MIN_TEAMCONTEXT_ROWS) } }, { year: 2019 }), /LV.*OAK/);
  assert.throws(() => validateTeamContext({ OAK: { games: makeTcGames(MIN_TEAMCONTEXT_ROWS) } }, { year: 2020 }), /OAK/);
});

test('validateTeamContext: honest-null guard — fabricated non-null off.proe before 2006 throws', () => {
  const games = makeTcGames(MIN_TEAMCONTEXT_ROWS);
  games[0].off.proe = 0.05;
  assert.throws(() => validateTeamContext({ KC: { games } }, { year: 2005 }), /proe.*2006/);
});

test('validateTeamContext: honest-null guard — null off.proe before 2006 passes', () => {
  const games = makeTcGames(MIN_TEAMCONTEXT_ROWS, { off: { proe: null, proePlays: 0, proePassPlays: 0, proeXpassSum: 0 } });
  assert.doesNotThrow(() => validateTeamContext({ KC: { games } }, { year: 2005 }));
});

test('validateTeamContext: a legitimate extreme single-game off.proe does NOT trip the gate (2021 NE @ BUF week 13, 27mph wind, 3 pass attempts all game — real value, not a bug)', () => {
  const games = makeTcGames(MIN_TEAMCONTEXT_ROWS, { off: { proe: -0.567 } });
  assert.doesNotThrow(() => validateTeamContext({ NE: { games } }, { year: 2021 }));
});

test('validateTeamContext: off.proe outside the mathematical [-1,1] bound throws', () => {
  const games = makeTcGames(MIN_TEAMCONTEXT_ROWS, { off: { proe: 1.2 } });
  assert.throws(() => validateTeamContext({ KC: { games } }, { year: 2023 }), /off\.proe out of \[-1,1\]/);
});

test('validateTeamContext: off.plays out of [25,120] throws; a legitimate low-possession def.plays does NOT (off-only gate)', () => {
  const games = makeTcGames(MIN_TEAMCONTEXT_ROWS);
  // Legitimate low-possession game: this team's defense faced very few plays (one-sided
  // blowout where the offense held the ball almost the whole game) — must NOT trip the gate.
  games[0].def.plays = 10;
  assert.doesNotThrow(() => validateTeamContext({ KC: { games } }, { year: 2023 }));

  games[0].off.plays = 10;
  assert.throws(() => validateTeamContext({ KC: { games } }, { year: 2023 }), /off\.plays out of \[25,120\]/);
});

test('validateTeamContext: non-finite guard — Infinity in a component throws', () => {
  const games = makeTcGames(MIN_TEAMCONTEXT_ROWS);
  games[0].off.epaSum = Infinity;
  assert.throws(() => validateTeamContext({ KC: { games } }, { year: 2023 }), /non-finite/);
});
