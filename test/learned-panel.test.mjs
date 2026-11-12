/**
 * test/learned-panel.test.mjs — LP-1a panel tests T-LP-1..4, 6, 7 (task .claude/tasks/learned-projection-1a-harness.md §7).
 * Fixtures: test/fixtures/learned-panel/ (built by scripts/fixtures/build-learned-fixtures.mjs; Invariant 10).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { NON_ADDITIVE_KEYS } from '../lib/fantasyPoints.mjs';
import {
  weekVector, weekPoints, dot, indexSchedule, gameContext, depthSlot, buildWeekRows, buildSeasonRows, labelCohorts,
  computeSpikeSd, finalizeKeys, collectNonZeroKeys,
} from '../lib/learnedPanel.mjs';
import {
  LEARNED_LOAD, SEASON_KEYED_LOADERS, NOT_SEASON_KEYED, yearGuard, buildLearnedLoad, LearnedLookAheadError,
} from '../scripts/learned-panel-run.mjs';

const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/learned-panel/${n}.json`, import.meta.url), 'utf8'));
const SCORING = JSON.parse(fs.readFileSync(new URL('./fixtures/league-scoring-2026-10-14.json', import.meta.url), 'utf8'));

test('T-LP-1 key vector: Σ x·w equals the independently scored week (2016 derived first downs, 2023 emitted)', () => {
  const { keys, weeks } = fx('scoring-weeks');
  assert.ok(weeks.some(w => w.S === 2016 && w.derive) && weeks.some(w => w.S === 2023 && !w.derive));
  assert.ok(weeks.some(w => w.stats.rec_yd >= 100 || w.stats.rush_yd >= 100), 'fixture must include a threshold-bonus week');
  assert.deepEqual(keys, [...keys].sort());
  assert.ok(keys.every(k => SCORING[k] && !NON_ADDITIVE_KEYS.has(k)));
  for (const w of weeks) {
    const x = weekVector(w.stats, w.position, w.derive, keys);
    const expected = weekPoints(w.stats, SCORING, w.position, w.derive);
    assert.equal(dot(x, keys, SCORING), expected, `${w.S} ${w.pid} w${w.w}`);
  }
  // keys derive from the data: a key that is non-zero only through derived first downs must be collected
  const seen = new Set();
  for (const w of weeks.filter(v => v.S === 2016)) collectNonZeroKeys(seen, w.stats, w.position, true, SCORING);
  assert.ok(finalizeKeys(seen, SCORING).some(k => k.startsWith('bonus_fd_')), '2016 first downs are derived into bonus_fd_<pos>');
});

test('T-LP-2 year guard: every season-keyed loader refuses 2026; every loader is classified', () => {
  const stub = {};
  for (const name of Object.keys(LEARNED_LOAD)) stub[name] = () => ({});
  stub.loadManifest = () => ({ files: {} });
  stub.loadLeagueScoring = () => ({ rec: 0.5 });
  stub.loadLeaguePositionOf = () => () => null;
  // the bare guard layer: LearnedLookAheadError from each season-keyed loader, pass-through at 2025
  const yg = yearGuard(stub);
  for (const name of SEASON_KEYED_LOADERS) {
    assert.throws(() => yg[name](2026), LearnedLookAheadError, name);
    assert.doesNotThrow(() => yg[name](2025), name);
  }
  // the composed chain (yearGuard → guardLoad → leagueBasisLoad) refuses 2026 on every season-keyed loader
  const composed = buildLearnedLoad(stub);
  for (const name of SEASON_KEYED_LOADERS) assert.throws(() => composed[name](2026), /2026/, name);
  assert.throws(() => composed.loadDepth(2026), LearnedLookAheadError);
  // classification: no loader is unclassified
  const known = new Set([...SEASON_KEYED_LOADERS, ...NOT_SEASON_KEYED]);
  for (const obj of [LEARNED_LOAD, composed]) {
    const unclassified = Object.entries(obj).filter(([, v]) => typeof v === 'function').map(([k]) => k).filter(k => !known.has(k));
    assert.deepEqual(unclassified, [], 'a new loader must be classified as season-keyed (guarded) or listed in NOT_SEASON_KEYED');
  }
  assert.ok(SEASON_KEYED_LOADERS.every(k => k in LEARNED_LOAD), 'every guarded name exists on the load');
});

test('T-LP-3 team domain and line sign', () => {
  const f = fx('team-domain');
  for (const key of ['stl2015', 'oak2019']) {
    const s = f[key];
    const rows = buildWeekRows({
      S: s.S, positionOf: () => s.position, totals: s.totals, rosterPlayers: s.rosterPlayers, sched: indexSchedule({ games: s.games }),
      depthFile: null, keys: fx('scoring-weeks').keys, scoring: SCORING,
    });
    assert.ok(rows.length >= 1, `${key} rows`);
    for (const r of rows) {
      assert.equal(r.team, s.team, 'era team code kept (never the current franchise)');
      assert.equal(r.teamSource, 'rosterweekly', 'the week-w listing team joins the schedule in its own era code');
      const g = s.games.find(x => x.week === r.w);
      assert.equal(r.opp, g.homeTeam === s.team ? g.awayTeam : g.homeTeam, `${key} w${r.w} opponent resolved`);
      assert.equal(r.noGame, false);
    }
  }
  assert.equal(gameContext(f.opener, 'CAR').spreadLine, 3);
  assert.equal(gameContext(f.opener, 'DEN').spreadLine, -3);
  assert.equal(gameContext(f.opener, 'CAR').opp, 'DEN');
});

// ── T-LP-4 universes — a hand-built three-team season: AAA plays w1,w3 (bye w2); BBB plays w1,w2; CCC plays w2,w3.
const G = (week, home, away) => ({ gameType: 'REG', week, homeTeam: home, awayTeam: away, gameId: `x_${week}_${home}`, spreadLine: 1, totalLine: 40, roof: 'dome' });
const SCHED = indexSchedule({ games: [G(1, 'AAA', 'BBB'), G(2, 'BBB', 'CCC'), G(3, 'CCC', 'AAA')] });
const POS = { ghost: 'WR', ret: 'WR', dev: 'WR', bye: 'RB', callup: 'WR', vet: 'WR', moved: 'TE' };
const posOf = (pid) => POS[pid] ?? null;
const tot = (team, status, wk = {}) => ({ team, gamesPlayed: status.filter(s => s === 'P').length, fantasyPoints: 0, weeklyStatus: status, weeklyStats: wk });

test('T-LP-4 universes: roster-listing membership, bye skip, call-up row, no-row outcome 0, teamGames fallback', () => {
  const rosterPlayers = {
    ghost: { 1: [['AAA', 'ACT']] },                       // ADMIT week-1 listing, no season-totals row
    ret: { 1: [['AAA', 'RET']] },                          // RET admits nothing
    dev: { 1: [['BBB', 'DEV']] },                          // DEV admits nothing
    bye: { 1: [['AAA', 'ACT']] },                          // listed once, in w1; AAA byes w2 → member in w3 from w′ = 1
    vet: { 1: [['BBB', 'ACT']], 2: [['BBB', 'ACT']] },
    moved: { 1: [['CCC', 'ACT']] },                        // no totals row; team falls back to the rosterweekly week-1 team
  };
  const totals = {
    vet: tot('BBB', ['P', 'P', 'X'], { 1: { rec: 4, rec_yd: 40 }, 2: { rec: 2, rec_yd: 20 } }),
    callup: tot('BBB', ['X', 'P', 'X'], { 2: { rec: 5, rec_yd: 50 } }),    // played w2 with NO listing
    TEAM_BBB: { team: 'BBB', weeklyStatus: ['P', 'P', 'X'] },
  };
  const keys = ['rec', 'rec_yd'];
  const scoring = { rec: 0.5, rec_yd: 0.1 };
  const rows = buildWeekRows({ S: 2020, positionOf: posOf, totals, rosterPlayers, sched: SCHED, depthFile: null, keys, scoring });
  const row = (pid, w) => rows.find(r => r.pid === pid && r.w === w);
  assert.equal(row('ghost', 1)?.inUniverse, true);
  assert.equal(row('ret', 1), undefined);
  assert.equal(row('dev', 1), undefined);
  assert.equal(row('bye', 2), undefined, 'AAA has no game in w2: no row');
  assert.equal(row('bye', 3)?.inUniverse, true, 'member in w3 from his listing two weeks back');
  assert.equal(row('callup', 2)?.inUniverse, false);
  assert.equal(row('callup', 2)?.played, true);
  assert.equal(row('callup', 2)?.pts, 7.5);
  // seasons rows: the no-row ghost scores 0 in 0 games; the call-up's points are in the season sum; ret/dev are not in the season universe
  const seasonRows = buildSeasonRows({ S: 2020, positionOf: posOf, totals, rosterPlayers, sched: SCHED, playerIds: null, snaps: null });
  const sr = (pid) => seasonRows.find(r => r.pid === pid);
  assert.equal(sr('ghost').hasRow, false);
  assert.equal(sr('ghost').gamesPlayed, 0);
  assert.equal(sr('ghost').fantasyPoints, 0);
  assert.equal(sr('ghost').inSeasonUniverse, true);
  assert.equal(sr('ret'), undefined);
  assert.equal(sr('dev'), undefined);
  assert.equal(sr('callup').inSeasonUniverse, false);
  assert.equal(sr('callup').hasRow, true);
  assert.equal(sr('moved').team, 'CCC');
  assert.equal(sr('moved').teamGames, 2, 'teamGames falls back to the rosterweekly team (CCC plays 2)');
  assert.equal(sr('vet').teamGames, 2);
});

// ── T-LP-6 cohorts — hand-built team-seasons
function mkTeam(team, position, players, weeks, { status = {} } = {}) {
  // players: { pid: { opp: [per-week opportunity count], pts?: [per-week pts] } }; a filler absorbs the rest of 100 opportunities
  const rows = [];
  for (let w = 1; w <= weeks; w++) {
    let used = 0;
    for (const [pid, p] of Object.entries(players)) {
      const st = status[`${pid}|${w}`] ?? 'P';
      const played = st === 'P';
      const n = p.opp[w - 1] ?? 0;
      if (played) used += n;
      rows.push({
        pid, S: 2020, w, position, team, played, status: st, inUniverse: true, cohort: [],
        pts: played ? (p.pts?.[w - 1] ?? 8) : null, raw: played ? { rec_tgt: n, rush_att: 0 } : null, x: null,
      });
    }
    rows.push({ pid: `fill_${team}`, S: 2020, w, position: 'WR', team, played: true, status: 'P', inUniverse: true, cohort: [], pts: 5, raw: { rec_tgt: 100 - used, rush_att: 0 }, x: null });
  }
  return rows;
}
const rep = (n, v) => Array(n).fill(v);
const SD = { QB: 4, RB: 4, WR: 4, TE: 4 };
const labelsOf = (rows, pid, letter = null) => rows.filter(r => r.pid === pid && r.cohort.length && (!letter || r.cohort.includes(letter))).map(r => `${r.w}:${letter ?? r.cohort.join('')}`);

test('T-LP-6 cohort labels: riser, injury fill-in, spike, each with a near-miss', () => {
  // (a) riser: star holds 50; riser 10 in w1-4 then 30 in w5-8 (os0 0.1 → +0.2 ≥ +0.06)
  const riser = mkTeam('T1', 'RB', { star1: { opp: rep(8, 50) }, riser: { opp: [...rep(4, 10), ...rep(4, 30)] } }, 8);
  // near-miss: same, but the higher-share teammate missed w6
  const nearRiser = mkTeam('T2', 'RB', { star2: { opp: rep(8, 50) }, riser2: { opp: [...rep(4, 10), ...rep(4, 30)] } }, 8, { status: { 'star2|6': 'D' } });
  // (b) fill-in: starter (50) 'D' w4-5, back w6; backup 10 → 35 while he is out, 30 after
  const fill = mkTeam('T3', 'WR', { st3: { opp: [50, 50, 50, 0, 0, 50, 50, 50] }, bk3: { opp: [10, 10, 10, 35, 35, 30, 30, 30] } }, 8, { status: { 'st3|4': 'D', 'st3|5': 'D' } });
  // near-miss: the backup's share barely moves while the starter is out
  const nearFill = mkTeam('T4', 'WR', { st4: { opp: [50, 50, 50, 0, 0, 50, 50, 50] }, bk4: { opp: [10, 10, 10, 12, 12, 10, 10, 10] } }, 8, { status: { 'st4|4': 'D', 'st4|5': 'D' } });
  // (c) spike: steady 8 pts and share 0.2, then 20 in w5 with the same share
  const spike = mkTeam('T5', 'WR', { sp5: { opp: rep(8, 20), pts: [8, 8, 8, 8, 20, 8, 8, 8] } }, 8);
  // near-miss: the same points spike but the share jumped to 0.4
  const nearSpike = mkTeam('T6', 'WR', { sp6: { opp: [20, 20, 20, 20, 40, 20, 20, 20], pts: [8, 8, 8, 8, 20, 8, 8, 8] } }, 8);

  const all = [...riser, ...nearRiser, ...fill, ...nearFill, ...spike, ...nearSpike];
  labelCohorts(all, { spikeSd: SD });
  assert.deepEqual(labelsOf(all, 'riser', 'a'), ['5:a']);
  assert.deepEqual(labelsOf(all, 'riser2', 'a'), [], 'a higher-share teammate out → not a role riser');
  assert.deepEqual(labelsOf(all, 'bk3', 'b'), ['6:b', '7:b']);
  assert.deepEqual(labelsOf(all, 'bk4', 'b'), []);
  assert.deepEqual(labelsOf(all, 'sp5', 'c'), ['5:c']);
  assert.deepEqual(labelsOf(all, 'sp6', 'c'), [], 'a spike with an elevated share is not a one-week spike');
});

test('T-LP-6 spikeSd reads seasons 2012–2013 only', () => {
  const base = [
    { season: 2012, position: 'WR', pts: [4, 12, 4, 12, 4, 12, 4, 12] },   // mean 8, deviations ±4 → SD 4
    { season: 2013, position: 'WR', pts: [4, 12, 4, 12, 4, 12, 4, 12] },
    { season: 2013, position: 'WR', pts: [1, 2, 3] },                      // < 8 played weeks: ignored
  ];
  assert.equal(computeSpikeSd(base).WR, 4);
  const withLater = [...base, { season: 2014, position: 'WR', pts: [0, 40, 0, 40, 0, 40, 0, 40] }, { season: 2025, position: 'WR', pts: [0, 90, 0, 90, 0, 90, 0, 90] }];
  assert.equal(computeSpikeSd(withLater).WR, 4, 'a season after 2013 must not move spikeSd');
  assert.equal(computeSpikeSd(base).QB, null);
});

test('T-LP-7 depth slot: a null pid keeps its slot', () => {
  const f = fx('depth-slots');
  const dfile = (d) => ({ weeks: { [d.w]: { [d.team]: { [d.pos]: d.arr } } } });
  // SEA 2016 wk1 TE = [null, '616', ...]: '616' is slot 2 (a filter-then-index implementation says 1)
  assert.equal(f.sea2016.arr[0], null);
  assert.equal(depthSlot(dfile(f.sea2016), 1, 'SEA', 'TE', '616'), 2);
  // CHI 2019 wk1 TE = ['1793','4085',null,'3465']: '3465' is slot 4 (not 3)
  assert.equal(f.chi2019.arr[2], null);
  assert.equal(depthSlot(dfile(f.chi2019), 1, 'CHI', 'TE', '3465'), 4);
  assert.equal(depthSlot(dfile(f.chi2019), 1, 'CHI', 'TE', 'nobody'), null);
});
