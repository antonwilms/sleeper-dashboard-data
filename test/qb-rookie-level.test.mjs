/**
 * test/qb-rookie-level.test.mjs — rookie QB starter level (P12a, .claude/tasks/qb-rookie-level-research.md §7).
 *
 * Fixture loaders throughout, except T10 (read-only live-store smoke). `synthLoad` is a deterministic
 * 4-team, 13-season store that passes the coverage stop and runs the whole pipeline in well under a second.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

import { primaryPassers } from '../lib/qbTakeover.mjs';
import {
  QB_ROOKIE_DEFAULTS, GROUPS, rookieGroup, rookieStarterGames, aggregate, levelTable, levelCI, playerDistribution,
  suppress, suppressPair, leagueRatio, liveLevel, unitsFrom, losoCompare, round2, round3,
} from '../lib/qbRookieLevel.mjs';
import {
  runQbRookieLevel, runQ2, SnapshotStop, qbRookieLevelMain, writeQbRookieLevelArtifacts, formatQbRookieLevelConstantsJson,
  buildQbRookieLevelVerdictMarkdown, QB_ROOKIE_LOAD, ARTIFACT_CAPS,
} from '../scripts/qb-rookie-level-run.mjs';
import { CoverageStop } from '../scripts/qb-takeover-run.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

// ─── fixture builders ─────────────────────────────────────────────────────────

const ENTRY = {
  top12: { draftRound: 1, draftPick: 3 }, r1: { draftRound: 1, draftPick: 20 },
  day2: { draftRound: 2, draftPick: 8 }, 'day3+': { draftRound: 5, draftPick: 10 },
};

/**
 * 4 teams (A..D), 25 weeks per season (A–B, C–D every week → 100 team-games), one veteran QB per team who is
 * primary every week except team A, whose rookie `r<S>` (group cycles by season) starts from `startWeek`
 * (weeks 4–10 for most seasons; the 2017 rookie starts game 1 and runs weeks 1–10).
 */
function synthLoad({ dropPrimary = null, emptySeason = null, snapshot = undefined, inProgress = null, spy = null } = {}) {
  const seasons = {}, bySleeper = {}, ids = {};
  const addPlayer = (pid, draftYear, entry) => {
    bySleeper[pid] = { draftYear, ...entry, birthdate: `${draftYear - 22}-05-01` };
    ids[`g${pid}`] = { sleeperId: pid, position: 'QB' };
  };
  for (const T of ['A', 'B', 'C', 'D']) addPlayer(`v${T}`, 2000, { draftRound: 1, draftPick: 5 });
  for (let S = 2013; S <= 2025; S++) {
    const grp = GROUPS[(S - 2013) % 4];
    const rid = `r${S}`;
    addPlayer(rid, S, ENTRY[grp]);
    const startWeek = S === 2017 ? 1 : 4;
    const games = [];
    const players = {};
    const totals = {};
    for (let w = 1; w <= 25; w++) {
      games.push({ week: w, gameType: 'REG', homeTeam: 'A', awayTeam: 'B' }, { week: w, gameType: 'REG', homeTeam: 'C', awayTeam: 'D' });
      for (const T of ['A', 'B', 'C', 'D']) {
        if (dropPrimary && dropPrimary.S === S && dropPrimary.team === T && dropPrimary.week === w) continue;
        const rookieStarts = T === 'A' && w >= startWeek && w <= 10;
        const pid = rookieStarts ? rid : `v${T}`;
        (players[pid] ??= { games: [] }).games.push({ week: w, seasonType: 'REG', team: T, attempts: 30, sacksSuffered: 2 });
        if (rookieStarts) {
          const pts = round2(10 + (S - 2013) * 0.37 + w * 0.11);
          ((totals[rid] ??= { weeklyPoints: {}, fantasyPoints: 0, stats: { pass_td: 1 } }).weeklyPoints)[w] = pts;
          totals[rid].fantasyPoints = round2(totals[rid].fantasyPoints + pts);
        }
      }
    }
    seasons[S] = { gl: { players }, sc: { games: emptySeason === S ? [] : games }, st: totals };
  }
  const snap = snapshot !== undefined ? snapshot : {
    targetSeason: 2026, scoringSettings: { pass_td: 4, pass_yd: 0.04, rec: 0.5 },
    players: {
      9001: { nfl_team: 'A', depthChartOrder: 3, projection: { confidence: 'rookie', projectedPPG: 20, factors: { qbStarterPPG: 20, rookieBasisScale: 1.1, ktcMult: 1.1, collegeContribution: 1.2 } } },
      9002: { nfl_team: 'B', projection: { confidence: 'rookie', projectedPPG: 8, factors: { qbStarterPPG: 8, rookieBasisScale: 1.1, ktcMult: 1, collegeContribution: 1 } } },
    },
  };
  addPlayer('9001', 2026, ENTRY.top12);
  addPlayer('9002', 2026, ENTRY['day3+']);
  const rec = (name, fn) => (arg) => { spy?.push([name, arg]); return fn(arg); };
  return {
    loadSeasonTotals: rec('loadSeasonTotals', (y) => seasons[y]?.st ?? null),
    loadGameLogs: rec('loadGameLogs', (y) => seasons[y]?.gl ?? null),
    loadSchedule: rec('loadSchedule', (y) => seasons[y]?.sc ?? null),
    loadPlayerIds: rec('loadPlayerIds', () => ({ ids, bySleeper })),
    loadSnapshot: rec('loadSnapshot', () => snap),
    loadDepth: rec('loadDepth', () => { throw new Error('depth must never be read'); }),
    loadManifest: () => ({ files: inProgress ? { [inProgress]: { inProgress: true } } : {} }),
  };
}

const quiet = { log: () => {}, logErr: () => {} };

/** A hand-built `games` array: [pid, S, group, pts, extras]. */
const G = (pid, S, group, pts, extra = {}) => ({ pid, S, team: 'A', week: 1, gIndex: 1, group, origin: 'takeover', pts, ...extra });

// ═════════════════════════════════════════════════════════════════════════════
// T1 — rookieGroup
// ═════════════════════════════════════════════════════════════════════════════

describe('T1 rookieGroup', () => {
  test('round-based groups; compensatory round-3 picks stay day2; undrafted → day3+; gaps → null', () => {
    assert.equal(rookieGroup({ draftRound: 1, draftPick: 12 }), 'top12');
    assert.equal(rookieGroup({ draftRound: 1, draftPick: 13 }), 'r1');
    assert.equal(rookieGroup({ draftRound: 2, draftPick: 1 }), 'day2');
    assert.equal(rookieGroup({ draftRound: 3, draftPick: 40, draftOvr: 105 }), 'day2');
    assert.equal(rookieGroup({ draftRound: 4, draftPick: 1 }), 'day3+');
    assert.equal(rookieGroup({ draftRound: 7, draftPick: 30 }), 'day3+');
    assert.equal(rookieGroup({ undrafted: true }), 'day3+');
    assert.equal(rookieGroup({ draftRound: null, draftPick: null }), null);
    assert.equal(rookieGroup({ draftRound: 1, draftPick: null }), null);
    assert.equal(rookieGroup(undefined), null);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T2 — rookieStarterGames
// ═════════════════════════════════════════════════════════════════════════════

describe('T2 rookieStarterGames', () => {
  // Team T plays weeks 1,2,4,5 (bye in week 3); team U plays 1,2,3,4. A 2015 gamelogs `LA` joins the `STL` schedule.
  const schedule = {
    games: [
      { week: 1, gameType: 'REG', homeTeam: 'T', awayTeam: 'U' }, { week: 2, gameType: 'REG', homeTeam: 'T', awayTeam: 'U' },
      { week: 3, gameType: 'REG', homeTeam: 'U', awayTeam: 'STL' }, { week: 4, gameType: 'REG', homeTeam: 'T', awayTeam: 'U' },
      { week: 5, gameType: 'REG', homeTeam: 'T', awayTeam: 'STL' }, { week: 1, gameType: 'REG', homeTeam: 'STL', awayTeam: 'X' },
      { week: 3, gameType: 'PRE', homeTeam: 'T', awayTeam: 'U' },
    ],
  };
  const g = (team, week, pid, att = 30) => ({ pid, rec: { week, seasonType: 'REG', team, attempts: att, sacksSuffered: 0 } });
  const build = (rows) => {
    const players = {};
    for (const { pid, rec } of rows) (players[pid] ??= { games: [] }).games.push(rec);
    return { players };
  };
  const bySleeper = {
    rk: { draftYear: 2015, draftRound: 1, draftPick: 2 }, vet: { draftYear: 2010, draftRound: 3, draftPick: 3 },
    wr: { draftYear: 2015, draftRound: 2, draftPick: 3 }, nopts: { draftYear: 2015, draftRound: 5, draftPick: 3 },
    nr: { draftYear: 2015, draftRound: null, draftPick: null }, rk2: { draftYear: 2015, undrafted: true },
  };
  const positionOf = { rk: 'QB', vet: 'QB', wr: 'WR', nopts: 'QB', nr: 'QB', rk2: 'QB', ghost: 'QB' };
  const seasonTotals = {
    rk: { weeklyPoints: { 1: 11, 2: 12, 4: 14, 5: 15 } }, wr: { weeklyPoints: { 3: 9 } }, nopts: { weeklyPoints: {} },
    rk2: { weeklyPoints: { 1: 5 } }, nr: { weeklyPoints: { 1: 5 } },
  };

  test('collects rookie primaries with bye-aware gIndex, drops the rest with the right counters', () => {
    const gl = build([
      g('T', 1, 'nopts'), g('T', 2, 'rk'), g('T', 4, 'rk'), g('U', 1, 'vet'), g('U', 2, 'vet'), g('U', 3, 'wr'), g('U', 4, 'rk2', 10),
      g('LA', 1, 'rk2'), g('LA', 3, 'ghost'), g('LA', 5, 'rk'), g('X', 9, 'rk'),
    ]);
    const primaries = primaryPassers(gl, 2015);
    const r = rookieStarterGames({ S: 2015, primaries, schedule, seasonTotals, bySleeper, positionOf });
    // T|2 rk (gIndex 2), T|4 rk (gIndex 3 — bye in week 3), STL|5 rk (gIndex 3; LA→STL era remap), STL|1 rk2
    const rows = r.games.map((x) => `${x.team}|${x.week}|${x.pid}|${x.gIndex}`).sort();
    assert.deepEqual(rows, ['STL|1|rk2|1', 'STL|5|rk|3', 'T|2|rk|2', 'T|4|rk|3'].sort());
    assert.equal(r.excluded.nonQB, 1);          // U|3 rookie WR
    assert.equal(r.excluded.missingPoints, 2);  // T|1 nopts (no key) and U|4 rk2 (week 4 absent)
    assert.equal(r.excluded.noCrosswalk, 1);    // ghost
    assert.equal(r.excluded.noScheduleGame, 1); // X|9 is not a scheduled REG game
    assert.equal(r.excluded.noDraftRound, 0);
  });

  test('origin: g1 for the team\'s game-1 primary, takeover otherwise — also when that game-1 row was excluded', () => {
    const gl = build([g('T', 1, 'nopts'), g('T', 2, 'rk'), g('LA', 1, 'rk2'), g('LA', 5, 'rk')]);
    const r = rookieStarterGames({ S: 2015, primaries: primaryPassers(gl, 2015), schedule, seasonTotals, bySleeper, positionOf });
    const origin = Object.fromEntries(r.games.map((x) => [`${x.team}|${x.week}`, x.origin]));
    assert.equal(origin['STL|1'], 'g1');
    assert.equal(origin['STL|5'], 'takeover');
    assert.equal(origin['T|2'], 'takeover');     // game 1 primary 'nopts' was excluded (missingPoints), not rk
    const g1 = rookieStarterGames({ S: 2015, primaries: primaryPassers(build([g('T', 1, 'nopts'), g('T', 2, 'nopts')]), 2015), schedule, seasonTotals, bySleeper, positionOf });
    assert.equal(g1.games.length, 0);
    assert.equal(g1.excluded.missingPoints, 2);
    // a rookie whose own game-1 row is excluded keeps `g1` for his later games
    const st2 = { rk: { weeklyPoints: { 2: 12 } } };
    const r2 = rookieStarterGames({ S: 2015, primaries: primaryPassers(build([g('T', 1, 'rk'), g('T', 2, 'rk')]), 2015), schedule, seasonTotals: st2, bySleeper, positionOf });
    assert.deepEqual(r2.games.map((x) => [x.week, x.origin]), [[2, 'g1']]);
    assert.equal(r2.excluded.missingPoints, 1);
  });

  test('a rookie with no draft round is excluded and counted; a non-rookie is ignored silently', () => {
    const gl = build([g('T', 1, 'nr'), g('T', 2, 'vet')]);
    const r = rookieStarterGames({ S: 2015, primaries: primaryPassers(gl, 2015), schedule, seasonTotals, bySleeper, positionOf });
    assert.equal(r.games.length, 0);
    assert.equal(r.excluded.noDraftRound, 1);
    assert.deepEqual(r.excluded, { noCrosswalk: 0, noScheduleGame: 0, nonQB: 0, noDraftRound: 1, missingPoints: 0 });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T3 — levelTable + fixture
// ═════════════════════════════════════════════════════════════════════════════

describe('T3 levelTable', () => {
  test('value = round3(round2(Σpts)/Σgames); players count distinct rookies; pooled is built from rounded group rows', () => {
    const games = [
      G('a', 2020, 'top12', 10.004), G('a', 2020, 'top12', 10.004), G('b', 2021, 'top12', 20),
      G('c', 2020, 'day2', 5.004), G('c', 2021, 'day2', 5.004),
    ];
    const t = levelTable(games);
    assert.equal(t.top12.players, 2);
    assert.equal(t.top12.sumPts, round2(40.008));
    assert.equal(t.top12.value, round3(40.01 / 3));
    assert.equal(t.day2.players, 2);   // pid `c` in two seasons is two rookie-seasons (`c|2020`, `c|2021`)
    assert.equal(t.r1.value, null);    // empty group: no value, no throw
    assert.equal(t.pooled.players, 4);
    assert.equal(t.pooled.games, 5);
    assert.equal(t.pooled.value, round3(round2(t.top12.sumPts + t.day2.sumPts) / 5));
  });

  test('pooled.sumPts = round2(Σ rounded group sums), which can differ from round2(Σ all game points)', () => {
    // four groups, each three games of 0.004: each group rounds to 0.01 (Σ 0.04) while the raw total 0.048 rounds to 0.05
    const games = GROUPS.flatMap((grp, i) => [0, 1, 2].map(() => G(`p${i}`, 2020, grp, 0.004)));
    const t = levelTable(games);
    const naive = round2(games.reduce((s, g) => s + g.pts, 0));
    const fromRows = round2(GROUPS.reduce((s, grp) => s + t[grp].sumPts, 0));
    assert.equal(naive, 0.05);
    assert.equal(fromRows, 0.04);
    assert.equal(t.pooled.sumPts, fromRows);
    assert.equal(t.pooled.games, 12);
    assert.equal(t.pooled.value, round3(0.04 / 12));
  });

  test('the fixture re-derives every pinned value exactly (live adapter run on the synthetic store)', () => {
    const result = runQbRookieLevel({ load: synthLoad() });
    assert.equal(result.constants.verification.rederiveFromFixture, 'exact');
    const { fixture, starterPPG } = result.constants;
    let pg = 0, ps = 0;
    for (const [grp, players, games, sumPts] of fixture.rows) {
      assert.equal(round3(sumPts / games), starterPPG[grp].value);
      assert.equal(players, starterPPG[grp].players);
      pg += games; ps += sumPts;
    }
    assert.equal(round3(round2(ps) / pg), starterPPG.pooled.value);
    assert.deepEqual(fixture.rows.map((r) => r[0]), GROUPS);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T4 — levelCI
// ═════════════════════════════════════════════════════════════════════════════

describe('T4 levelCI', () => {
  const games = [
    ...Array.from({ length: 10 }, (_, i) => G('big', 2020, 'top12', 20 + i * 0.5, { week: i + 1 })),
    G('s1', 2021, 'top12', 5), G('s2', 2022, 'top12', 9),
  ];
  test('clusters are rookie-seasons (10 + 1 + 1 games → 3 clusters), deterministic by seed', () => {
    const a = levelCI(games, 'top12');
    assert.equal(a.clusters, 3);
    const b = levelCI(games, null);
    assert.deepEqual(b.ci95, a.ci95);
    assert.deepEqual(levelCI(games, 'top12').ci95, a.ci95);
    assert.ok(a.ci95[0] <= a.ci95[1]);
  });
  test('a rookie\'s games resample together: the CI can only take cluster-mixture values', () => {
    // one 10-game cluster at mean 22.25, two 1-game clusters (5, 9) → every resample mean is a mixture of those three
    const ci = levelCI(games, 'top12').ci95;
    assert.ok(ci[0] >= 5 - 1e-9);
    assert.ok(ci[1] <= 22.25 + 1e-9);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T5 — playerDistribution + suppress
// ═════════════════════════════════════════════════════════════════════════════

describe('T5 playerDistribution + suppress', () => {
  const season = (pid, ppg, n = 4) => Array.from({ length: n }, (_, i) => G(pid, 2020, 'top12', ppg, { week: i + 1 }));
  test('{ n, mean } over rookie-seasons with >= 3 starts (the Q3 unit set), player-weighted', () => {
    const games = [10, 12, 14, 16, 18, 20, 22, 24].flatMap((v, i) => season(`p${i}`, v, 3 + (i % 2)));
    const d = playerDistribution(games, 'top12');
    assert.deepEqual(Object.keys(d).sort(), ['mean', 'n']);
    assert.equal(d.n, 8);
    assert.equal(d.mean, 17);
  });
  test('the floor is 3 games (a 3-start rookie counts, a 2-start one does not); mean null (n kept) under 3 rookies', () => {
    const games = [...season('a', 10, 3), ...season('b', 20, 3), ...season('short', 99, 2)];
    assert.deepEqual(playerDistribution(games, 'top12'), { n: 2, mean: null });
    const three = [...games, ...season('c', 15, 3)];
    assert.deepEqual(playerDistribution(three, 'top12'), { n: 3, mean: 15 });
  });
  test('suppress nulls numeric values below 3 rookies and keeps players/games; suppressPair takes both sides', () => {
    const cell = { players: 2, games: 14, value: 12.3, ci95: [1, 2], tag: 'x' };
    assert.deepEqual(suppress(cell), { players: 2, games: 14, value: null, ci95: null, tag: 'x' });
    assert.deepEqual(suppress({ ...cell, players: 3 }), { ...cell, players: 3 });
    const [a, b] = suppressPair({ players: 2, games: 5, value: 1 }, { players: 9, games: 50, value: 2 });
    assert.deepEqual(a, { players: 2, games: 5, value: null });
    assert.deepEqual(b, { players: 9, games: 50, value: null });
    const [c, d] = suppressPair({ players: 3, games: 5, value: 1 }, { players: 9, games: 50, value: 2 });
    assert.equal(c.value, 1); assert.equal(d.value, 2);
  });
  test('suppress nulls nested objects recursively, keeping players/games at every depth', () => {
    const cell = { players: 2, games: 9, value: 1, leagueByRatio: { value: 2, ci95: [1, 3], players: 2 } };
    assert.deepEqual(suppress(cell), { players: 2, games: 9, value: null, leagueByRatio: { value: null, ci95: null, players: 2 } });
    assert.deepEqual(suppress({ ...cell, players: 3 }), { ...cell, players: 3 });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T6 — losoCompare
// ═════════════════════════════════════════════════════════════════════════════

describe('T6 losoCompare', () => {
  // Group `top12`: season 1 units y=10, season 2 y=20, season 3 y=30 (3 games each); a day2 unit only in season 3.
  const mk = (pid, S, group, pts, n = 3) => Array.from({ length: n }, () => G(pid, S, group, pts));
  const games = [...mk('p1', 1, 'top12', 10), ...mk('p2', 2, 'top12', 20), ...mk('p3', 3, 'top12', 30), ...mk('p4', 3, 'day2', 6), ...mk('short', 2, 'top12', 100, 2)];
  const units = unitsFrom(games, 3);

  test('units need ≥ 3 games', () => {
    assert.equal(units.length, 4);
    assert.ok(!units.some((u) => u.pid === 'short'));
  });
  test('fold means exclude the held-out season; D = min(A, C); cFallback when a group has no training games', () => {
    const r = losoCompare({ games, units, priorOf: () => 50 });
    // season 1 unit p1: C = mean of top12 games outside season 1 = (20×3 + 100×2 + 30×3)/8 = 43.75
    // season 2 unit p2: training top12 = p1 (10×3) + p3 (30×3) = 20; season 3 p3: (10×3 + 20×3 + 100×2)/8 = 36.25
    // day2 unit p4 (season 3): no day2 training games → C = B (all training games outside season 3)
    assert.equal(r.units, 4);
    assert.equal(r.cFallback, 1);
    const errC = [Math.abs(43.75 - 10), Math.abs(20 - 20), Math.abs(36.25 - 30)];
    const B3 = (10 * 3 + 20 * 3 + 100 * 2) / 8;
    errC.push(Math.abs(B3 - 6));
    assert.ok(Math.abs(r.mae.C - errC.reduce((a, b) => a + b, 0) / 4) < 1e-9);
    // D = min(50, C) ⇒ equals C wherever C < 50 (all four here)
    assert.ok(Math.abs(r.mae.D - r.mae.C) < 1e-9);
  });
  test('diff sign: new better ⇒ negative mean and BEATS when C is exact and A is far off', () => {
    const g2 = [...mk('a', 1, 'top12', 20), ...mk('b', 2, 'top12', 20), ...mk('c', 3, 'top12', 20), ...mk('d', 4, 'top12', 20)];
    const r = losoCompare({ games: g2, units: unitsFrom(g2, 3), priorOf: () => 30 });
    const cA = r.comparisons.find((c) => c.new === 'C' && c.old === 'A');
    assert.equal(r.mae.C, 0);
    assert.equal(r.mae.A, 10);
    assert.equal(cA.mean, -10);
    assert.equal(cA.label, 'BEATS');
    assert.deepEqual(r.comparisons.map((c) => `${c.new}v${c.old}`), ['CvA', 'CvB', 'DvA']);
    assert.equal(r.comparisons.find((c) => c.new === 'D').mean, -10);  // D = min(30, 20) = 20
  });
  test('no per-fold or per-season key anywhere in the return value; A must cover every unit', () => {
    const r = losoCompare({ games, units, priorOf: () => 12 });
    const keys = [];
    const walk = (o) => { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { keys.push(k); walk(v); } };
    walk(r);
    for (const bad of ['folds', 'fold', 'bySeason', 'perSeason', 'seasons', 'S']) assert.ok(!keys.includes(bad), bad);
    assert.throws(() => losoCompare({ games, units, priorOf: () => null }), /must cover every unit/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T7 — leagueRatio
// ═════════════════════════════════════════════════════════════════════════════

describe('T7 leagueRatio', () => {
  test('hand-computed ratio for a pass-TD-only league difference', () => {
    const rec = { fantasyPoints: 20, stats: { pass_td: 2, pass_yd: 100, rec: 0 } };
    // half-PPR basis 20 pts; league = 6 per pass TD (+2 each), 0.04 per yard: 12 + 4 = 16 ... ratio 16/20
    assert.equal(leagueRatio(rec, { pass_td: 6, pass_yd: 0.04 }), 16 / 20);
  });
  test('a RATE_KEYS key carrying a scoring weight is ignored; fantasyPoints 0 / missing → null', () => {
    const rec = { fantasyPoints: 10, stats: { pass_td: 1, cmp_pct: 90, pass_rtg: 100 } };
    assert.equal(leagueRatio(rec, { pass_td: 4, cmp_pct: 1000, pass_rtg: 1000 }), 0.4);
    assert.equal(leagueRatio({ fantasyPoints: 0, stats: { pass_td: 1 } }, { pass_td: 4 }), null);
    assert.equal(leagueRatio(undefined, { pass_td: 4 }), null);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T8 — liveLevel
// ═════════════════════════════════════════════════════════════════════════════

describe('T8 liveLevel', () => {
  const row = (factors, extra = {}) => ({ projection: { confidence: 'rookie', projectedPPG: 11, factors, ...extra } });
  test('post-P6b shape reads qbStarterPPG; half-PPR = level ÷ rookieBasisScale', () => {
    const r = liveLevel(row({ qbStarterPPG: 22.28, rookieBasisScale: 1.114 }));
    assert.equal(r.source, 'qbStarterPPG');
    assert.equal(r.level, 22.28);
    assert.ok(Math.abs(r.levelHalf - 20) < 1e-9);
  });
  test('pre-P6b shape (neither key) falls back to projectedPPG', () => {
    const r = liveLevel(row({ rookieBasisScale: 1.1 }));
    assert.equal(r.source, 'projectedPPG');
    assert.equal(r.level, 11);
  });
  test('qbTakeoverBasis without qbStarterPPG → null; non-rookie confidence → null; bad scale → levelHalf null', () => {
    assert.equal(liveLevel(row({ qbTakeoverBasis: 'x', rookieBasisScale: 1.1 })), null);
    assert.equal(liveLevel({ projection: { confidence: 'high', projectedPPG: 20, factors: { qbStarterPPG: 20 } } }), null);
    assert.equal(liveLevel(row({ qbStarterPPG: 20 })).levelHalf, null);
    assert.equal(liveLevel(row({ qbStarterPPG: 20, rookieBasisScale: 0 })).levelHalf, null);
    assert.equal(liveLevel(row({ qbStarterPPG: NaN, rookieBasisScale: 1.1 })), null);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T9 — loader ceiling
// ═════════════════════════════════════════════════════════════════════════════

describe('T9 loader ceiling', () => {
  test('reads only 2013–2025 season files, no depth loader, and the snapshot only at 2026-10-03', () => {
    const spy = [];
    runQbRookieLevel({ load: synthLoad({ spy }) });
    for (const [name, arg] of spy.filter(([n]) => ['loadSeasonTotals', 'loadGameLogs', 'loadSchedule'].includes(n))) {
      assert.ok(arg >= 2013 && arg <= 2025, `${name}(${arg})`);
    }
    assert.ok(!spy.some(([n]) => n === 'loadDepth'));
    assert.deepEqual([...new Set(spy.filter(([n]) => n === 'loadSnapshot').map(([, a]) => a))], ['2026-10-03']);
  });
  test('a manifest marking a gamelogs year inProgress throws via guardLoad', () => {
    assert.throws(() => runQbRookieLevel({ load: synthLoad({ inProgress: 'nflverse/gamelogs/2020.json' }) }), /inProgress/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T10 — live smoke (read-only; the only live-store test)
// ═════════════════════════════════════════════════════════════════════════════

describe('T10 live smoke', () => {
  const live = fs.existsSync(path.join(REPO_ROOT, 'snapshots/2026-10-03.json'));
  test('runQbRookieLevel() completes on the committed store; counts within ±5% of the probe; Mendoza is top12',
    { timeout: 600_000, skip: live ? false : 'snapshots/2026-10-03.json absent — live store not checked out' }, () => {
      const t0 = Date.now();
      const r = runQbRookieLevel();
      console.log(`[T10] runtime ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      const games = r.constants.starterPPG.pooled.games, rookies = r.constants.starterPPG.pooled.players;
      assert.ok(Math.abs(games - 690) <= 690 * 0.05, `games ${games}`);
      assert.ok(Math.abs(rookies - 90) <= 90 * 0.05, `rookies ${rookies}`);
      assert.equal(r.constants.verification.rederiveFromFixture, 'exact');
      assert.ok(r.q4.rows.length >= 1);
      assert.equal(r.q4.rows.find((x) => x.pid === '13269')?.group, 'top12');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// T11 — CLI
// ═════════════════════════════════════════════════════════════════════════════

describe('T11 CLI', () => {
  const spyWriter = () => { const calls = []; const fn = (a) => { calls.push(a); return { panelPath: 'p', constantsPath: 'c', verdictPath: 'v', panelBytes: 1, constantsBytes: 1 }; }; fn.calls = calls; return fn; };
  const run = (load, extra = {}) => {
    const writeArtifacts = spyWriter();
    const code = qbRookieLevelMain({ load, writeArtifacts, ...quiet, ...extra });
    return { code, writeArtifacts };
  };

  test('CoverageStop → 1, no write', () => {
    const r = run(synthLoad({ emptySeason: 2020 }), { write: true });
    assert.equal(r.code, 1);
    assert.equal(r.writeArtifacts.calls.length, 0);
  });
  test('SnapshotStop (null snapshot; bonus_fd_qb 0.5) → 1, no write', () => {
    const a = run(synthLoad({ snapshot: null }), { write: true });
    assert.equal(a.code, 1); assert.equal(a.writeArtifacts.calls.length, 0);
    const b = run(synthLoad({ snapshot: { targetSeason: 2026, scoringSettings: { bonus_fd_qb: 0.5 }, players: {} } }), { write: true });
    assert.equal(b.code, 1); assert.equal(b.writeArtifacts.calls.length, 0);
    const c = run(synthLoad({ snapshot: { targetSeason: 2025, scoringSettings: {}, players: {} } }), { write: true });
    assert.equal(c.code, 1);
    assert.throws(() => runQbRookieLevel({ load: synthLoad({ snapshot: null }) }), SnapshotStop);
  });
  test('success with write → 0 and the writer is called once; without write it is not', () => {
    const a = run(synthLoad(), { write: true });
    assert.equal(a.code, 0); assert.equal(a.writeArtifacts.calls.length, 1);
    assert.ok(a.writeArtifacts.calls[0].verdictMd.includes('Reproduce'));
    const b = run(synthLoad(), { write: false });
    assert.equal(b.code, 0); assert.equal(b.writeArtifacts.calls.length, 0);
  });
  test('the bin rejects every flag but --json/--write (exit 1, message on stderr, empty stdout)', () => {
    for (const bad of ['--dynasty', '--qb-takeover']) {
      const r = spawnSync('node', ['bin/backtest.mjs', '--qb-rookie-level', bad], { cwd: REPO_ROOT, encoding: 'utf8' });
      assert.equal(r.status, 1);
      assert.match(r.stderr, new RegExp(`--qb-rookie-level rejects ${bad}`));
      assert.equal(r.stdout, '');
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T12 — coverage stop edges
// ═════════════════════════════════════════════════════════════════════════════

describe('T12 coverage stop', () => {
  test('a zero-denominator season (empty schedule) throws CoverageStop', () => {
    assert.throws(() => runQbRookieLevel({ load: synthLoad({ emptySeason: 2018 }) }), (e) => e instanceof CoverageStop && /2018/.test(e.message));
  });
  test('an under-0.99 season throws; exactly 0.99 (99/100) passes', () => {
    assert.doesNotThrow(() => runQbRookieLevel({ load: synthLoad({ dropPrimary: { S: 2019, team: 'C', week: 5 } }) }));
    const load = synthLoad({ dropPrimary: { S: 2019, team: 'C', week: 5 } });
    const gl = load.loadGameLogs(2019);
    // remove a second team-game's primary → 98/100
    gl.players.vD.games = gl.players.vD.games.filter((g) => g.week !== 6);
    assert.throws(() => runQbRookieLevel({ load }), (e) => e instanceof CoverageStop && e.coverage.find((c) => c.S === 2019).rate === 0.98);
  });
  test('an empty REG schedule (rate = 0/0, NaN) is a stop', () => {
    const load = synthLoad();
    const sc = load.loadSchedule(2015);
    sc.games = sc.games.map((g) => ({ ...g, gameType: 'PRE' }));
    assert.throws(() => runQbRookieLevel({ load }), CoverageStop);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T13 — writer
// ═════════════════════════════════════════════════════════════════════════════

describe('T13 writer', () => {
  test('a panel over the cap throws before any file is written', () => {
    const result = runQbRookieLevel({ load: synthLoad() });
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qbrl-'));
    assert.throws(() => writeQbRookieLevelArtifacts({ result, verdictMd: 'x', root, caps: { ...ARTIFACT_CAPS, panelBytes: 100 } }), /exceeds/);
    assert.throws(() => writeQbRookieLevelArtifacts({ result, verdictMd: 'x', root, caps: { ...ARTIFACT_CAPS, constantsBytes: 100 } }), /exceeds/);
    assert.deepEqual(fs.readdirSync(root), []);
  });
  test('a normal write puts three files in place; constants hold one fixture row per line', () => {
    const result = runQbRookieLevel({ load: synthLoad() });
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qbrl-'));
    const w = writeQbRookieLevelArtifacts({ result, verdictMd: buildQbRookieLevelVerdictMarkdown(result), root });
    for (const p of [w.panelPath, w.constantsPath, w.verdictPath]) assert.ok(fs.existsSync(path.join(root, p)), p);
    const text = fs.readFileSync(path.join(root, w.constantsPath), 'utf8');
    assert.deepEqual(JSON.parse(text), result.constants);
    assert.equal(text.split('\n').filter((l) => /^ {6}\["/.test(l)).length, GROUPS.length);
    assert.equal(text, formatQbRookieLevelConstantsJson(result.constants));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T14 — disclosure
// ═════════════════════════════════════════════════════════════════════════════

describe('T14 disclosure', () => {
  test('a 1-rookie Q2 side and its complement are both null; no per-season aggregate is serialised', () => {
    const result = runQbRookieLevel({ load: synthLoad() });
    // the synthetic 2017 rookie (top12) is the only game-1 starter in his group → 1-rookie g1 side; the
    // 3 takeover rookies would show on their own, so only complementary suppression hides them
    const cell = result.q2.origin.top12;
    assert.equal(cell.a.players, 1);
    assert.equal(cell.a.value, null);
    assert.equal(cell.b.value, null);
    assert.equal(cell.b.players, 3);
    assert.equal(result.q2.origin.pooled.a.players, 1);
    assert.equal(result.q2.origin.pooled.a.value, null);
    assert.equal(result.q2.origin.pooled.b.value, null);

    // the 2017 rookie's season total (a per-season, per-rookie value) must not appear anywhere
    const st = synthLoad().loadSeasonTotals(2017).r2017;
    const secret = st.fantasyPoints;
    const leaves = [];
    const walk = (o) => { if (typeof o === 'number') leaves.push(o); else if (o && typeof o === 'object') Object.values(o).forEach(walk); };
    const { constants, ...panel } = result;
    walk(panel); walk(constants);
    assert.ok(!leaves.includes(secret), `per-rookie-season total ${secret} leaked`);
    const text = JSON.stringify(result);
    for (const bad of ['"folds"', '"bySeason"', '"perSeason"', '"weeklyPoints"']) assert.ok(!text.includes(bad), bad);
    assert.ok(!('folds' in result.q3));
    assert.deepEqual(Object.keys(result.constants.fixture.rows[0]).length, 4);
  });
  test('Q1 distribution and Q3 bias cover the identical rookie set (n equal) on a synthetic run', () => {
    const result = runQbRookieLevel({ load: synthLoad() });
    for (const grp of GROUPS) assert.equal(result.q3.biasA[grp].n, result.q1[grp].playerDistribution.n, grp);
  });
  test('biasA minus playerDistribution isolates nobody: n·(meanA − biasA.mean) − pd.n·pd.mean = 0', () => {
    const games = [];
    ['top12', 'r1', 'day2', 'day3+'].forEach((grp, gi) => {
      for (let i = 0; i < 4; i++) for (let w = 1; w <= 3 + (i % 2); w++) games.push(G(`${grp}${i}`, 2014 + i, grp, 10 + gi * 3 + i * 1.7 + w * 0.3, { gIndex: w }));
      for (let w = 1; w <= 2; w++) games.push(G(`${grp}short`, 2020, grp, 50, { gIndex: w }));   // 2 starts: in neither
    });
    const priorOf = (u) => 12 + (u.group === 'r1' ? 1 : 0);
    const r = JSON.parse(JSON.stringify(losoCompare({ games, units: unitsFrom(games, 3), priorOf })));
    for (const grp of GROUPS) {
      const pd = playerDistribution(games, grp);
      const meanA = priorOf({ group: grp });
      assert.equal(r.biasA[grp].n, pd.n);
      assert.ok(Math.abs(r.biasA[grp].n * (meanA - r.biasA[grp].mean) - pd.n * pd.mean) < 1e-9, grp);
    }
  });
  test('Q2: a suppressed group whose combined sides are thin nulls the pooled pair; combined >= 3 keeps it', () => {
    const rooks = (grp, S, k, origin = 'takeover') => Array.from({ length: k }, (_, i) => G(`${grp}${S}${i}`, S, grp, 12 + i, { origin }));
    // exactly one group thin on the b side (1 rookie from 2019+): pooled b would otherwise be recoverable
    const one = runQ2([...rooks('top12', 2015, 3), ...rooks('top12', 2021, 1), ...rooks('r1', 2015, 3), ...rooks('r1', 2021, 3),
      ...rooks('day2', 2015, 3), ...rooks('day2', 2021, 3), ...rooks('day3+', 2015, 3), ...rooks('day3+', 2021, 3)], QB_ROOKIE_DEFAULTS);
    assert.equal(one.era.top12.b.value, null);
    assert.equal(one.era.pooled.a.value, null);
    assert.equal(one.era.pooled.b.value, null);
    assert.equal(one.era.pooled.b.players, 10);
    // two groups thin on b (2 + 2 = 4 >= 3 combined) and fat on a: pooled kept
    const two = runQ2([...rooks('top12', 2015, 3), ...rooks('top12', 2021, 2), ...rooks('r1', 2015, 3), ...rooks('r1', 2021, 2),
      ...rooks('day2', 2015, 3), ...rooks('day2', 2021, 3), ...rooks('day3+', 2015, 3), ...rooks('day3+', 2021, 3)], QB_ROOKIE_DEFAULTS);
    assert.equal(two.era.top12.b.value, null);
    assert.equal(two.era.r1.b.value, null);
    assert.notEqual(two.era.pooled.a.value, null);
    assert.notEqual(two.era.pooled.b.value, null);
  });
  test('no quantile keys (p25/p50/p75/p90) anywhere in the serialised panel or constants', () => {
    const result = runQbRookieLevel({ load: synthLoad() });
    const text = JSON.stringify(result);
    for (const k of ['p25', 'p50', 'p75', 'p90']) assert.ok(!text.includes(`"${k}"`), k);
  });
});
