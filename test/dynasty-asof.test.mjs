/**
 * test/dynasty-asof.test.mjs — S3a as-of-S input builder (scripts/dynasty-asof.mjs). Synthetic in-memory
 * loaders only (Invariant 10): no store reads.
 *
 * T-LA look-ahead guard   T-AGE ages and curve modes   T-YE years_exp   T-FR franchise/changer
 * T-NAME snaps name guard T-DEPTH depth map            T-GAMES snaps substitution
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  asOfLoad, LookAheadError, outcomeLoad, readTeamS1, franchise, isChanger, normName, ageOn,
  buildAsOfInputs, SEASON_KEYED_LOADERS, DynastyAsOfStop,
} from '../scripts/dynasty-asof.mjs';

const TEAMS = Array.from({ length: 32 }, (_, i) => `T${i}`);
const POSITIONS = { 1: 'WR', 2: 'RB', 3: 'TE', 4: 'QB' };
const row = (gp, fp, team, extra = {}) => ({
  gamesPlayed: gp, fantasyPoints: fp, scoringBasis: 'half_ppr', team, stats: { rec: Math.round(fp) }, ...extra,
});

function depthFile(week17, week18 = week17) {
  const mk = (arrs) => Object.fromEntries(TEAMS.map((t, i) => [t, i === 0 ? arrs : { QB: [], RB: [], WR: [], TE: [] }]));
  return { weeks: { 17: mk(week17), 18: mk(week18) } };
}

function makeLoad({ S = 2019, withNext = false, snaps = null, depth = null } = {}) {
  const season = {
    2018: { 1: row(16, 160, 'BUF'), 2: row(16, 150, 'SD') },
    2019: { 1: row(16, 192, 'BUF'), 2: row(15, 120, 'LAC'), 3: row(12, 80, 'KC'), 4: row(13, 90, 'KC'), TEAM_BUF: row(17, 400, 'BUF') },
  };
  if (withNext) season[2020] = { 1: row(16, 9999, 'SENTINEL'), 2: row(16, 9999, 'SENTINEL') };
  const sentinel = withNext ? { sentinel: true } : null;
  return {
    loadSeasonTotals: (y) => season[y] ?? {},
    loadDepth: (y) => (y === 2020 ? sentinel : depth ?? depthFile({ QB: [], RB: [null, '2'], WR: ['1'], TE: [] })),
    loadAdvstats: (y) => (y > S ? sentinel : {}),
    loadSnapShare: (y) => (y > S ? sentinel : snaps?.[y] ?? null),
    loadRosterWeekly: (y) => (y > S ? sentinel : {}),
    loadPlayerIds: () => ({
      bySleeper: {
        1: { birthdate: '1995-03-10', draftYear: 2017 },
        2: { birthdate: '1996-06-02', draftYear: 0 },
        4: { birthdate: '1994-12-01', draftYear: 2016 },
      },
    }),
    loadRawPlayers: () => ({
      1: { position: 'WR', age: 30, team: 'BUF', full_name: 'Joe Smith', years_exp: 9 },
      2: { position: 'RB', age: 29, team: null, full_name: 'Kenneth Walker III' },
      3: { position: 'TE', age: 31, team: 'KC', first_name: 'Tee', last_name: 'Ee' },
      4: { position: 'QB', age: 32, team: 'KC', full_name: 'Quincy Back', years_exp: 10 },
    }),
    loadLeaguePositionOf: () => (pid) => POSITIONS[pid] ?? null,
    loadLeagueScoring: () => ({ rec: 1 }),
  };
}
const build = (load, opts = {}, S = 2019) => buildAsOfInputs(load, S, opts);

describe('T-LA look-ahead guard', () => {
  test('every season-keyed loader throws LookAheadError for S+1 and passes for S', () => {
    const g = asOfLoad(makeLoad({ withNext: true }), 2019);
    for (const name of SEASON_KEYED_LOADERS) {
      assert.throws(() => g[name](2020), LookAheadError, name);
      assert.doesNotThrow(() => g[name](2019), name);
    }
    assert.doesNotThrow(() => g.loadPlayerIds());
  });
  test('inputs are identical whether or not S+1 files hold sentinel values', () => {
    const a = build(makeLoad({ withNext: false }));
    const b = build(makeLoad({ withNext: true }));
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  });
  test('readTeamS1 returns only the team string; outcomeLoad is unguarded', () => {
    const load = makeLoad({ withNext: true });
    assert.equal(readTeamS1(load, 2019, '1'), 'SENTINEL');
    assert.equal(readTeamS1(load, 2019, 'nobody'), null);
    assert.equal(typeof readTeamS1(load, 2019, '1'), 'string');
    assert.doesNotThrow(() => outcomeLoad(load).loadSeasonTotals(2020));
  });
  test('years_exp disagreement below 90% stops the build', () => {
    const load = makeLoad();
    const raw = load.loadRawPlayers();
    raw['1'].years_exp = 1;
    load.loadRawPlayers = () => raw;
    assert.throws(() => build(load), DynastyAsOfStop);
  });
  test('2026 is refused outright', () => {
    assert.throws(() => buildAsOfInputs(makeLoad(), 2026), DynastyAsOfStop);
  });
});

describe('T-AGE', () => {
  test('ageOn across a birthday boundary; missing birthdate → null', () => {
    assert.equal(ageOn('1995-06-01', '2020-06-01'), 25);
    assert.equal(ageOn('1995-06-02', '2020-06-01'), 24);
    assert.equal(ageOn(null, '2020-06-01'), null);
    assert.equal(ageOn(undefined, '2020-06-01'), null);
  });
  test('birthdate mode: scored ages are whole years on (S+1)-06-01; curve uses the same ages with currentYear S+1', () => {
    const r = build(makeLoad());
    assert.equal(r.playersMap['1'].age, 25);   // 1995-03-10 on 2020-06-01
    assert.equal(r.playersMap['2'].age, 23);   // 1996-06-02 on 2020-06-01
    assert.equal(r.playersMap['3'].age, null); // no crosswalk entry
    assert.deepEqual(r.curveBundle.curves.WR.map(p => p.age), [23, 24]);
  });
  test("app-sleeper mode: curves from raw Sleeper ages with currentYear 2026; scored ages unchanged; null Sleeper age drops only from the curve", () => {
    const load = makeLoad();
    const raw = load.loadRawPlayers();
    raw['1'].age = null;
    load.loadRawPlayers = () => raw;
    const nullAge = build(load, { curveAgeMode: 'app-sleeper' });
    assert.deepEqual(nullAge.curveBundle.curves.WR, []);
    assert.equal(nullAge.playersMap['1'].age, 25);

    const r = build(makeLoad(), { curveAgeMode: 'app-sleeper' });
    assert.deepEqual(r.curveBundle.curves.WR.map(p => p.age), [22, 23]);   // 30 − (2026 − 2018/2019)
    assert.equal(r.playersMap['1'].age, 25);
    assert.deepEqual(r.curvePlayersMap['1'], { position: 'WR', age: 30 });
    assert.ok(r.meta.deliberateDifferences.some(d => d.includes('post-S information')));
  });
});

describe('T-YE years_exp', () => {
  test('from draftYear; draftYear 0 and no-entry fall back to the first season with Sleeper gp > 0', () => {
    const r = build(makeLoad());
    assert.equal(r.playersMap['1'].years_exp, 3);   // 2020 − 2017
    assert.equal(r.playersMap['2'].years_exp, 2);   // draftYear 0 → first season 2018 → 2020 − 2018
    assert.equal(r.playersMap['3'].years_exp, 1);   // no crosswalk → first season 2019
    assert.deepEqual(r.meta.checks.yearsExp, { fromDraftYear: 2, draftYearZero: 1, noCrosswalk: 1, noFirstSeason: 0 });
  });
  test('the fallback reads Sleeper gamesPlayed even under gamesMode snaps', () => {
    const snaps = { 2018: { players: { 2: { name: 'Kenneth Walker', games: 16 }, 3: { name: 'Tee Ee', games: 10 } } } };
    const load = makeLoad({ snaps });
    // pid 3 has Sleeper gp only in 2019; snaps claims games in 2018 — the fallback must ignore it
    const r = build(load, { gamesMode: 'snaps' });
    assert.equal(r.playersMap['3'].years_exp, 1);
  });
});

describe('T-FR franchise / changer', () => {
  test('era codes map to current franchises', () => {
    assert.equal(franchise('STL'), 'LA');
    assert.equal(franchise('SD'), 'LAC');
    assert.equal(franchise('OAK'), 'LV');
    assert.equal(franchise('BUF'), 'BUF');
  });
  test('SD → LAC is not a changer; a real move is', () => {
    assert.equal(isChanger('SD', 'LAC'), false);
    assert.equal(isChanger('BUF', 'KC'), true);
    assert.equal(isChanger('BUF', null), false);
  });
});

describe('T-NAME', () => {
  test('normName', () => {
    assert.equal(normName('Kenneth Walker III'), 'kennethwalker');
    assert.equal(normName('Odell Beckham Jr.'), 'odellbeckham');
    assert.equal(normName("D'Andre Swift"), 'dandreswift');
    assert.equal(normName('Joe Smith'), normName('joe  SMITH'));
    assert.equal(normName('Lee Jr Sr'), 'leejr');   // at most one suffix is stripped
  });
  test('a mismatch keeps Sleeper’s count and is counted', () => {
    const snaps = { 2019: { players: { 1: { name: 'Someone Else', games: 9 }, 2: { name: 'Kenneth Walker', games: 14 } } } };
    const r = build(makeLoad({ snaps }), { gamesMode: 'snaps' });
    assert.equal(r.careerStats[2019]['1'].gamesPlayed, 16);
    assert.equal(r.careerStats[2019]['2'].gamesPlayed, 14);
    assert.equal(r.meta.checks.snapsNameGuardSkips[2019], 1);
    assert.equal(r.meta.checks.snapsGamesDiffer[2019], 1);
  });
});

describe('T-DEPTH', () => {
  test('REG-week cap: week 17 for S <= 2020, week 18 from 2021; shape and null slots', () => {
    const d19 = depthFile({ QB: [], RB: [null, '2'], WR: ['1'], TE: [] }, { QB: [], RB: ['2'], WR: [], TE: [] });
    const r = build(makeLoad({ depth: d19 }));
    assert.equal(r.meta.checks.depth.week, 17);
    assert.deepEqual(r.depthMap, { 1: { depthOrder: 1 }, 2: { depthOrder: 2 } });   // null slot kept: pid 2 is order 2
  });
  test('week 18 is used when S >= 2021', () => {
    const load = makeLoad();
    const base = load.loadSeasonTotals;
    load.loadSeasonTotals = (y) => (y === 2021 ? { 1: row(16, 100, 'BUF'), 2: row(16, 100, 'BUF') } : base(y));
    load.loadDepth = () => depthFile({ QB: [], RB: ['2'], WR: ['1'], TE: [] }, { QB: [], RB: [null, null, '2'], WR: ['1'], TE: [] });
    const r = buildAsOfInputs(load, 2021);
    assert.equal(r.meta.checks.depth.week, 18);
    assert.equal(r.depthMap['2'].depthOrder, 3);
  });
  test('stops on fewer than 30 teams and on an empty depthMap', () => {
    const few = { weeks: { 17: { T0: { QB: [], RB: [], WR: ['1'], TE: [] } } } };
    assert.throws(() => build(makeLoad({ depth: few })), DynastyAsOfStop);
    assert.throws(() => build(makeLoad({ depth: depthFile({ QB: [], RB: [], WR: [], TE: [] }) })), DynastyAsOfStop);
  });
});

describe('T-GAMES', () => {
  test('substitutes only when the entry has games > 0 and the name guard passes; changes only gamesPlayed', () => {
    const snaps = {
      2019: { players: {
        1: { name: 'Joe Smith', games: 11 },        // substituted
        2: { name: 'Kenneth Walker', games: 0 },    // games = 0 → keep
        // 3 absent → keep
        4: { name: 'Wrong Name', games: 6 },        // mismatch → keep
      } },
    };
    const sleeper = build(makeLoad({ snaps }), { gamesMode: 'sleeper' });
    const sn = build(makeLoad({ snaps }), { gamesMode: 'snaps' });
    assert.equal(sn.careerStats[2019]['1'].gamesPlayed, 11);
    for (const pid of ['2', '3', '4']) assert.equal(sn.careerStats[2019][pid].gamesPlayed, sleeper.careerStats[2019][pid].gamesPlayed, pid);
    const { gamesPlayed: _a, ...restSn } = sn.careerStats[2019]['1'];       // eslint-disable-line no-unused-vars
    const { gamesPlayed: _b, ...restSl } = sleeper.careerStats[2019]['1'];  // eslint-disable-line no-unused-vars
    assert.deepEqual(restSn, restSl);
  });
  test('2012 is never substituted (no snaps before 2013)', () => {
    const load = makeLoad({ snaps: { 2012: { players: { 1: { name: 'Joe Smith', games: 3 } } } } });
    const base = load.loadSeasonTotals;
    load.loadSeasonTotals = (y) => (y === 2012 ? { 1: row(16, 100, 'BUF') } : base(y));
    const r = build(load, { gamesMode: 'snaps' });
    assert.equal(r.careerStats[2012]['1'].gamesPlayed, 16);
  });
});
