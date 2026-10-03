/**
 * test/qb-takeover.test.mjs — QB takeover fit (P6a, .claude/tasks/qb-takeover-research.md §7).
 *
 * Fixture loaders throughout, except T10 (read-only live-store smoke). `synthLoad` is a deterministic
 * 8-team, 13-season store that passes the coverage stop and runs the whole pipeline in about a second.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

import { mulberry32 } from '../lib/inSeasonEvidence.mjs';
import { DEPTH_ESPN_FROM_SEASON } from '../lib/nflverse.mjs';
import {
  QB_TAKEOVER_DEFAULTS, HAZARD_KEYS, STICK_KEYS, LEVELS, primaryPassers, checkpointChart, priorPPG, incPPG, buildRows,
  patternTable, aggregatePatterns, fitLogistic, fitFromPatterns, fitFromRows, predict, roundCoef, forwardLadder,
  expectedStarts, coverageFor,
} from '../lib/qbTakeover.mjs';
import {
  runQbTakeover, CoverageStop, qbTakeoverMain, writeQbTakeoverArtifacts, formatQbTakeoverConstantsJson,
  buildQbTakeoverVerdictMarkdown, QB_TAKEOVER_LOAD,
} from '../scripts/qb-takeover-run.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

// ─── fixture builders ─────────────────────────────────────────────────────────

/** One-season fixture for buildRows from a compact spec. */
function season(S, spec) {
  const games = spec.games.map(([week, home, away, hs, as], i) => ({
    gameId: `${S}_${i}`, season: S, week, gameType: 'REG', homeTeam: home, awayTeam: away, homeScore: hs, awayScore: as,
  }));
  const players = {};
  for (const [T, byWeek] of Object.entries(spec.prim)) {
    for (const [week, pid] of Object.entries(byWeek)) {
      if (!players[pid]) players[pid] = { position: 'QB', games: [] };
      players[pid].games.push({ week: Number(week), seasonType: 'REG', team: T, attempts: 30, sacksSuffered: 2 });
    }
  }
  const weeks = {};
  for (const [T, byWeek] of Object.entries(spec.charts)) {
    for (const w of new Set(games.filter((g) => g.homeTeam === T || g.awayTeam === T).map((g) => g.week))) {
      weeks[w] ??= {};
      weeks[w][T] = { QB: Array.isArray(byWeek) ? byWeek : byWeek[w] };
    }
  }
  const prev = {};
  for (const [pid, [gp, fp]] of Object.entries(spec.prev ?? {})) prev[pid] = { gamesPlayed: gp, fantasyPoints: fp, weeklyPoints: {} };
  const totals = {};
  for (const [pid, weeklyPoints] of Object.entries(spec.totals ?? {})) totals[pid] = { gamesPlayed: 0, fantasyPoints: 0, weeklyPoints };
  return {
    S, gamelogs: { players }, schedule: { games }, depth: { weeks }, seasonTotals: totals, seasonTotalsPrev: prev,
    bySleeper: spec.bySleeper, espnFrom: spec.espnFrom ?? DEPTH_ESPN_FROM_SEASON,
  };
}

const cw = (draftYear, draftOvr) => ({ draftYear, draftOvr, undrafted: draftOvr == null, birthdate: '1995-05-05' });
const find = (rows, team, g, pid) => rows.find((r) => r.team === team && r.g === g && r.pid === pid);

// ═════════════════════════════════════════════════════════════════════════════
// T1 — primaryPassers
// ═════════════════════════════════════════════════════════════════════════════

describe('T1 primaryPassers', () => {
  const gl = (players) => ({ players });
  const row = (week, team, attempts, sacks = 0, seasonType = 'REG') => ({ week, seasonType, team, attempts, sacksSuffered: sacks });

  test('max dropbacks wins; sacks count as dropbacks', () => {
    const m = primaryPassers(gl({ p1: { games: [row(1, 'KC', 30, 0)] }, p2: { games: [row(1, 'KC', 25, 6)] } }), 2020);
    assert.equal(m.get('KC|1').pid, 'p2');
    assert.equal(m.get('KC|1').dropbacks, 31);
  });

  test('tie on dropbacks → more attempts, then the smaller pid', () => {
    const a = primaryPassers(gl({ p1: { games: [row(1, 'KC', 30, 0)] }, p2: { games: [row(1, 'KC', 28, 2)] } }), 2020);
    assert.equal(a.get('KC|1').pid, 'p1'); // 30 vs 30 dropbacks → 30 attempts beats 28
    const b = primaryPassers(gl({ p9: { games: [row(1, 'KC', 30, 0)] }, p2: { games: [row(1, 'KC', 30, 0)] } }), 2020);
    assert.equal(b.get('KC|1').pid, 'p2'); // full tie → lexicographically smaller pid
  });

  test('eraTeam applied: a 2015 LA row keys as STL|w; 2016+ keeps LA', () => {
    const f = gl({ p1: { games: [row(1, 'LA', 30)] } });
    assert.ok(primaryPassers(f, 2015).has('STL|1'));
    assert.ok(primaryPassers(f, 2016).has('LA|1'));
  });

  test('zero-dropback rows and non-REG rows are ignored; no position filter', () => {
    const m = primaryPassers(gl({
      p1: { position: 'WR', games: [row(1, 'KC', 3, 0), row(2, 'KC', 0, 0), row(3, 'KC', 40, 0, 'POST')] },
    }), 2020);
    assert.equal(m.get('KC|1').pid, 'p1'); // a mis-positioned passer still counts
    assert.equal(m.has('KC|2'), false);
    assert.equal(m.has('KC|3'), false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T2 — checkpointChart
// ═════════════════════════════════════════════════════════════════════════════

describe('T2 checkpointChart', () => {
  const depth = { weeks: {
    1: { KC: { QB: ['a'] } }, 2: { KC: { QB: ['b'] } }, 3: { KC: { QB: ['c'] } }, 4: { KC: { QB: ['d'] } },
    6: { KC: { QB: ['f'] } },
  } };
  test('legacy reads chart(week of g)', () => {
    assert.deepEqual(checkpointChart(depth, 2020, 'KC', [1, 2, 3], 1), ['b']);
  });
  test('ESPN reads chart(w−1) when present', () => {
    assert.deepEqual(checkpointChart(depth, 2025, 'KC', [1, 2, 3], 2), ['b']);
  });
  test('ESPN post-bye game reads the team\'s own bye-week chart', () => {
    // weeks [3, 5, 6]: game index 1 is week 5 (bye in 4); chart(4) exists and is the pre-game chart
    assert.deepEqual(checkpointChart(depth, 2025, 'KC', [3, 5, 6], 1), ['d']);
  });
  test('ESPN: chart(w−1) and the previous team game\'s chart both absent → null', () => {
    assert.equal(checkpointChart(depth, 2025, 'KC', [3, 5, 8], 2), null); // chart(7) and chart(5) absent
  });
  test('ESPN fallback value is the chart of weeks[i−1]', () => {
    const d = { weeks: { 2: { KC: { QB: ['x'] } } } };
    assert.deepEqual(checkpointChart(d, 2025, 'KC', [2, 5], 1), ['x']); // chart(4) absent → chart(2)
  });
  test('ESPN i = 0 → null', () => {
    assert.equal(checkpointChart(depth, 2025, 'KC', [1, 2], 0), null);
  });
  test('null entries keep their index', () => {
    const d = { weeks: { 1: { KC: { QB: [null, 'b', 'c'] } } } };
    const chart = checkpointChart(d, 2020, 'KC', [1], 0);
    assert.equal(chart.indexOf('b') + 1, 2);
    assert.equal(chart.indexOf('c') + 1, 3);
  });
  test('espnFrom option overrides the era split; default equals DEPTH_ESPN_FROM_SEASON', () => {
    assert.deepEqual(checkpointChart(depth, 2020, 'KC', [1, 2, 3], 2, { espnFrom: 2013 }), ['b']);
    assert.deepEqual(checkpointChart(depth, 2024, 'KC', [1, 2, 3], 2), ['c']); // 2024 < 2025 → legacy
    assert.equal(DEPTH_ESPN_FROM_SEASON, 2025);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T3 — row assembly on synthetic seasons
// ═════════════════════════════════════════════════════════════════════════════

describe('T3 row assembly', () => {
  const S = 2020;
  const scen1 = () => season(S, {
    games: [[1, 'A', 'B', 10, 20], [2, 'A', 'B', 10, 20], [3, 'A', 'B', 20, 10], [4, 'A', 'B', 30, 10]],
    prim: { A: { 1: 'a1', 2: 'a1', 3: 'a2', 4: 'a2' }, B: { 1: 'b1', 2: 'b1', 3: 'b1', 4: 'b1' } },
    charts: { A: ['a1', 'a2', 'a3'], B: ['b1', 'b2'] },
    prev: { a1: [16, 320], b1: [16, 160] },
    bySleeper: { a1: cw(2015, 200), a2: cw(2020, 5), a3: cw(2018, null), b1: cw(2012, null), b2: cw(2019, 80) },
  });

  test('hazard / stick / g1 membership; order-1 non-incumbent is a dp = d1 row', () => {
    const r = buildRows(scen1());
    assert.equal(r.hazard.filter((x) => x.team === 'A').length, 6);
    assert.equal(r.hazard.filter((x) => x.team === 'B').length, 3);
    assert.equal(r.g1.filter((x) => x.team === 'A').length, 2);
    assert.equal(r.g1.length, 3);
    assert.ok(r.hazard.every((x) => x.g >= 2) && r.g1.every((x) => x.g === 1));
    const a1g4 = find(r.hazard, 'A', 4, 'a1');
    assert.equal(a1g4.f.dp, LEVELS.dp.indexOf('d1'));
    assert.equal(a1g4.y, 0);
    assert.equal(find(r.hazard, 'A', 3, 'a2').y, 1);
    // stickiness: only a2 at g = 4 (a1 is the game-1 primary, so never "backup-origin")
    assert.equal(r.stick.length, 1);
    assert.equal(r.stick[0].pid, 'a2');
    assert.equal(r.stick[0].y, 1);
  });

  test('og = yes for the game-1 primary at chart order 1 after missing games; g1 rows carry og = no', () => {
    const r = buildRows(scen1());
    assert.equal(find(r.hazard, 'A', 4, 'a1').f.og, 1);
    assert.equal(find(r.hazard, 'A', 3, 'a2').f.og, 0);
    assert.ok(r.g1.every((x) => x.f.og === 0));
  });

  test('bn counts only non-incumbent chart games where x was not primary; the demotion game does not increment', () => {
    const r = buildRows(scen1());
    const a2g3 = find(r.hazard, 'A', 3, 'a2');
    assert.equal(a2g3.benched, 2);
    assert.equal(a2g3.f.bn, 0);
    const a3g4 = find(r.hazard, 'A', 4, 'a3');
    assert.equal(a3g4.benched, 3); // games 1–3, a3 never primary and never incumbent
    assert.equal(a3g4.f.bn, 1);
    const a1g4 = find(r.hazard, 'A', 4, 'a1'); // incumbent in games 1–3 (the demotion game is game 3)
    assert.equal(a1g4.benched, 0);
    assert.equal(a1g4.f.bn, 0);
  });

  test('ps: a1 started weeks 1–2 → re at g = 4; a2/a3 first; wp from schedule scores; rk and dg from the crosswalk', () => {
    const r = buildRows(scen1());
    assert.equal(find(r.hazard, 'A', 4, 'a1').f.ps, 1);
    const a2g3 = find(r.hazard, 'A', 3, 'a2');
    assert.equal(a2g3.f.ps, 0);
    assert.equal(a2g3.f.wp, LEVELS.wp.indexOf('losing')); // A lost games 1–2 → 0%
    assert.equal(a2g3.f.rk, 1);
    assert.equal(a2g3.f.dg, LEVELS.dg.indexOf('top12'));
    assert.equal(find(r.hazard, 'B', 3, 'b2').f.wp, LEVELS.wp.indexOf('winning'));
  });

  test('iq uses the all-teams median as of the calendar week; unknown when the incumbent has no history', () => {
    const r = buildRows(scen1());
    // g = 3 (week 3): inc a1 ppg 20 vs median(a1 20, b1 10) = 15 → 1.33 → strong
    assert.equal(find(r.hazard, 'A', 3, 'a2').f.iq, LEVELS.iq.indexOf('strong'));
    assert.ok(Math.abs(find(r.hazard, 'A', 3, 'a2').incRel - 20 / 15) < 1e-12);
    // g = 4: inc a2 has no prior and no obs → unknown
    assert.equal(find(r.hazard, 'A', 4, 'a1').f.iq, LEVELS.iq.indexOf('unknown'));
  });

  test('g = 1 codes: wp = mid, iq from the week-1 chart-index-0 prior median', () => {
    const r = buildRows(scen1());
    const a = r.g1.find((x) => x.team === 'A' && x.pid === 'a2');
    const b = r.g1.find((x) => x.team === 'B');
    assert.equal(a.f.wp, LEVELS.wp.indexOf('mid'));
    assert.equal(b.f.wp, LEVELS.wp.indexOf('mid'));
    assert.equal(a.f.iq, LEVELS.iq.indexOf('strong')); // a1 prior 20 vs median(20, 10) = 15
    assert.equal(b.f.iq, LEVELS.iq.indexOf('weak')); // b1 prior 10 → 0.67
  });

  test('stickiness dq is the game-1 primary\'s quality at the checkpoint', () => {
    const r = buildRows(scen1());
    // week 4: P_1 = a1 ppg 20; median of incumbents as of week 4 (a2 unknown → left out, b1 10) = 10 → strong
    assert.equal(r.stick[0].f.dq, LEVELS.dq.indexOf('strong'));
    assert.equal(r.stick[0].f.st, 0);
  });

  test('agreement counts chart(w) index 0 against primary of game w and w−1 (raw week chart, both eras)', () => {
    const r = buildRows(scen1());
    assert.deepEqual(r.agreement.legacy, { n: 6, cur: 4, prev: 5 });
    assert.deepEqual(r.agreement.espn, { n: 0, cur: 0, prev: 0 });
  });

  test('ps is calendar-week based: flips for an earlier week on another team even at an equal game index; not for the same or a later week', () => {
    const f = season(S, {
      games: [
        [1, 'C', 'D', 20, 10], [1, 'E', 'F', 20, 10],
        [2, 'D', 'E', 20, 10],
        [3, 'C', 'F', 20, 10], [3, 'D', 'E', 20, 10],
        [4, 'C', 'D', 20, 10], [4, 'E', 'F', 20, 10],
      ],
      prim: {
        C: { 1: 'c1', 3: 'c1', 4: 'c1' }, D: { 1: 'd1', 2: 'x', 3: 'y', 4: 'd1' },
        E: { 1: 'e1', 2: 'e1', 3: 'e1', 4: 'e1' }, F: { 1: 'f1', 3: 'f1', 4: 'f1' },
      },
      charts: { C: ['c1', 'x', 'y'], D: ['d1'], E: ['e1'], F: ['f1'] },
      prev: { c1: [16, 320], d1: [16, 160], e1: [16, 240], f1: [16, 240] },
      totals: { c1: { 1: 30 }, f1: { 3: 200 } },
      bySleeper: { c1: cw(2010, 20), x: cw(2018, 100), y: cw(2018, 100), d1: cw(2010, 20), e1: cw(2010, 20), f1: cw(2010, 20) },
    });
    const r = buildRows(f);
    // C's second game is week 3 (bye in week 2): game index 2; x started for D in week 2 (D's index 2)
    assert.equal(find(r.hazard, 'C', 2, 'x').f.ps, 1); // 2 < 3 by calendar week (an index comparison, 2 < 2, would say first)
    assert.equal(find(r.hazard, 'C', 2, 'y').f.ps, 0); // y starts in week 3 — the same calendar week → not yet
    assert.equal(find(r.hazard, 'C', 3, 'y').f.ps, 1); // week 4 > 3
    assert.equal(find(r.hazard, 'C', 3, 'x').f.ps, 1);
    // incRel at C's week-3 game: c1 = (20·3 + 30)/4 = 22.5; median over {c1 22.5, e1 15, f1 15 (bye team, obs weeks < 3 only)} = 15
    const x = find(r.hazard, 'C', 2, 'x');
    assert.ok(Math.abs(x.incPPG - 22.5) < 1e-12);
    assert.ok(Math.abs(x.incRel - 1.5) < 1e-12);
    assert.equal(x.f.iq, LEVELS.iq.indexOf('strong'));
  });

  test('a primary-less game g−1 → noPrevPrimary and a broken st streak; unknown crosswalk and tie handling', () => {
    const f = season(S, {
      games: [[1, 'A', 'B', 20, 20], [2, 'A', 'B', 20, 20], [3, 'A', 'B', 20, 20], [4, 'A', 'B', 30, 10], [5, 'A', 'B', 10, 30]],
      prim: { A: { 1: 'a1', 2: 'a2', 4: 'a2', 5: 'a2' }, B: { 1: 'b1', 2: 'b1', 3: 'b1', 4: 'b1', 5: 'b1' } },
      charts: { A: ['a1', 'a2', 'zz'], B: ['b1', 'b2'] },
      bySleeper: { a1: cw(2015, 200), a2: cw(2015, 200), b1: cw(2012, null), b2: cw(2019, 80) },
    });
    const r = buildRows(f);
    assert.equal(r.excluded.noPrimary, 1); // A, week 3
    assert.equal(r.excluded.noPrevPrimary, 1); // A, game 4
    assert.equal(r.hazard.filter((x) => x.team === 'A' && x.g === 4).length, 0);
    assert.equal(r.excluded.noCrosswalk, 3); // zz at g = 1, 2, 5
    // g = 5: inc a2, P_4 = a2, P_3 missing → streak 1 even though P_2 = a2 as well
    const st = r.stick.find((x) => x.team === 'A' && x.g === 5);
    assert.equal(st.streak, 1);
    assert.equal(st.f.st, 0);
    // ties count 0.5: after three 20–20 games B sits at 0.5 → mid (a tie counted as 0 would read losing)
    assert.equal(find(r.hazard, 'B', 4, 'b2').f.wp, LEVELS.wp.indexOf('mid'));
  });

  test('missing P_1 → noGame1Primary and no stickiness rows for the team; every og is no', () => {
    const f = season(S, {
      games: [[1, 'A', 'B', 10, 20], [2, 'A', 'B', 10, 20], [3, 'A', 'B', 10, 20]],
      prim: { A: { 2: 'a2', 3: 'a2' }, B: { 1: 'b1', 2: 'b1', 3: 'b1' } },
      charts: { A: ['a1', 'a2'], B: ['b1', 'b2'] },
      bySleeper: { a1: cw(2015, 200), a2: cw(2015, 200), b1: cw(2012, null), b2: cw(2019, 80) },
    });
    const r = buildRows(f);
    assert.equal(r.excluded.noGame1Primary, 1);
    assert.equal(r.stick.filter((x) => x.team === 'A').length, 0);
    assert.ok(r.hazard.filter((x) => x.team === 'A').every((x) => x.f.og === 0));
  });

  test('ESPN era: no game-1 chart → g1 rows excluded and counted; checkpoint reads chart(w−1)', () => {
    const f = season(2025, {
      games: [[1, 'A', 'B', 10, 20], [2, 'A', 'B', 10, 20], [3, 'A', 'B', 10, 20]],
      prim: { A: { 1: 'a1', 2: 'a1', 3: 'a2' }, B: { 1: 'b1', 2: 'b1', 3: 'b1' } },
      charts: { A: { 1: ['a1', 'a2'], 2: ['a1', 'a2'], 3: ['a2', 'a1'] }, B: ['b1', 'b2'] },
      bySleeper: { a1: cw(2015, 200), a2: cw(2015, 200), b1: cw(2012, null), b2: cw(2019, 80) },
    });
    const r = buildRows(f);
    assert.equal(r.g1.length, 0);
    assert.equal(r.excluded.noChartG1, 2);
    // A's game 3 (week 3) reads chart(2) = [a1, a2]; inc = P_2 = a1 → x = a2 at order 2
    const row = find(r.hazard, 'A', 3, 'a2');
    assert.equal(row.depthOrder, 2);
    assert.equal(r.agreement.espn.n > 0, true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T4 — pattern sufficiency
// ═════════════════════════════════════════════════════════════════════════════

function randomRows(n, seed = 3) {
  const rng = mulberry32(seed);
  const rows = [];
  for (let i = 0; i < n; i++) {
    const f = Object.fromEntries(HAZARD_KEYS.map((k) => [k, Math.floor(rng() * LEVELS[k].length)]));
    const z = -2.5 + 1.2 * (f.dp === 1) - 0.8 * (f.dp === 2) + 0.5 * (f.og === 1) + 0.4 * (f.rk === 1) + 0.3 * (f.iq === 1);
    rows.push({ S: 2013 + (i % 5), cluster: `${2013 + (i % 5)}|T${i % 11}`, f, y: rng() < 1 / (1 + Math.exp(-z)) ? 1 : 0 });
  }
  return rows;
}

describe('T4 pattern sufficiency', () => {
  const rows = randomRows(3000);
  const used = ['dp', 'og', 'rk', 'iq'];

  test('fitting from rows equals fitting from the pattern table (|Δβ| < 1e-12)', () => {
    const a = fitFromRows(rows, used);
    const b = fitFromPatterns(patternTable(rows, HAZARD_KEYS), HAZARD_KEYS, used);
    assert.deepEqual(Object.keys(a.coef), Object.keys(b.coef));
    for (const k of Object.keys(a.coef)) assert.ok(Math.abs(a.coef[k] - b.coef[k]) < 1e-12, k);
  });

  test('marginalising the full-key table equals building the sub-key table directly', () => {
    const norm = (ps) => ps.map((p) => `${used.map((k) => p.c[k]).join(',')}:${p.n}:${p.e}`).sort();
    const viaFull = aggregatePatterns(patternTable(rows, HAZARD_KEYS), HAZARD_KEYS, used);
    const direct = aggregatePatterns(patternTable(rows, used), used, used);
    assert.deepEqual(norm(viaFull), norm(direct));
    assert.equal(viaFull.reduce((a, p) => a + p.n, 0), rows.length);
    assert.equal(viaFull.reduce((a, p) => a + p.e, 0), rows.reduce((a, r) => a + r.y, 0));
  });

  test('the table is sorted lexicographically and keyed by season', () => {
    const t = patternTable(rows, HAZARD_KEYS);
    for (let i = 1; i < t.length; i++) {
      let c = 0;
      for (let j = 0; j < t[i].length && c === 0; j++) c = t[i - 1][j] - t[i][j];
      assert.ok(c <= 0);
    }
    assert.equal(t[0].length, 1 + HAZARD_KEYS.length + 2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T5 — fitLogistic
// ═════════════════════════════════════════════════════════════════════════════

describe('T5 fitLogistic', () => {
  const two = [{ c: { rk: 0 }, n: 1000, e: 100 }, { c: { rk: 1 }, n: 500, e: 100 }];
  const logit = (p) => Math.log(p / (1 - p));

  test('λ = 0: β equals the closed-form log-odds difference', () => {
    const m = fitLogistic(two, ['rk'], { lambda: 0 });
    assert.ok(Math.abs(m.coef.intercept - logit(0.1)) < 1e-8);
    assert.ok(Math.abs(m.coef['rk=rookie'] - (logit(0.2) - logit(0.1))) < 1e-8);
  });

  test('λ > 0 shrinks the coefficient toward 0', () => {
    const free = fitLogistic(two, ['rk'], { lambda: 0 }).coef['rk=rookie'];
    const ridge = fitLogistic(two, ['rk'], { lambda: 1 }).coef['rk=rookie'];
    const heavy = fitLogistic(two, ['rk'], { lambda: 100 }).coef['rk=rookie'];
    assert.ok(0 < heavy && heavy < ridge && ridge < free);
  });

  test('a zero-event cell converges with λ = 1 and diverges (throws) with λ = 0', () => {
    const zero = [{ c: { rk: 0 }, n: 1000, e: 100 }, { c: { rk: 1 }, n: 50, e: 0 }];
    const m = fitLogistic(zero, ['rk'], { lambda: 1 });
    assert.ok(Number.isFinite(m.coef['rk=rookie']) && m.coef['rk=rookie'] < 0);
    assert.throws(() => fitLogistic(zero, ['rk'], { lambda: 0 }), /did not converge|diverged|singular/);
  });

  test('non-convergence throws', () => {
    assert.throws(() => fitLogistic(two, ['rk'], { lambda: 1, maxIter: 1 }), /did not converge/);
  });

  test('predict applies the dummies; rounding to 1e-4 exists only in roundCoef (the constants), not in the fit', () => {
    const m = fitLogistic(two, ['rk'], { lambda: 0 });
    assert.ok(Math.abs(predict(m, { rk: 1 }) - 0.2) < 1e-8);
    assert.ok(Math.abs(predict(m, { rk: 0 }) - 0.1) < 1e-8);
    assert.notEqual(m.coef.intercept, roundCoef(m.coef.intercept));
    assert.equal(roundCoef(0.123456), 0.1235);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T6 — forwardLadder
// ═════════════════════════════════════════════════════════════════════════════

describe('T6 forwardLadder', () => {
  const rng = mulberry32(11);
  const rows = [];
  for (let i = 0; i < 6000; i++) {
    const og = rng() < 0.3 ? 1 : 0, dp = Math.floor(rng() * 3), wk = Math.floor(rng() * 3), bn = Math.floor(rng() * 3);
    const z = -3 + 1.6 * og + (dp === 1 ? 1.0 : 0);
    rows.push({ S: 2013 + (i % 4), cluster: `${2013 + (i % 4)}|T${i % 40}`, f: { og, dp, wk, bn }, y: rng() < 1 / (1 + Math.exp(-z)) ? 1 : 0 });
  }
  const bootstrap = { resamples: 400, seed: 12345 };

  test('signal adopted, noise not; every step recorded; order respected', () => {
    const { steps, final } = forwardLadder(rows, ['wk', 'og', 'bn', 'dp'], { bootstrap });
    assert.deepEqual(steps.map((s) => s.c), ['wk', 'og', 'bn', 'dp']);
    const by = Object.fromEntries(steps.map((s) => [s.c, s]));
    assert.equal(by.og.adopted, true);
    assert.equal(by.wk.adopted, false);
    assert.equal(by.bn.adopted, false);
    assert.equal(by.dp.adopted, true);
    assert.deepEqual(final, ['og', 'dp']);
    assert.deepEqual(by.dp.usedKeys, ['og', 'dp']); // the trial is F ∪ {c} in adoption order
    assert.deepEqual(by.bn.usedKeys, ['og', 'bn']);
    for (const s of steps) {
      assert.ok(Number.isFinite(s.mean) && s.ci95 && s.label);
      assert.equal(s.adopted, s.label === 'BEATS');
    }
  });

  test('a later candidate never displaces an adopted one', () => {
    const { final } = forwardLadder(rows, ['og', 'dp', 'wk'], { bootstrap });
    assert.deepEqual(final.slice(0, 2), ['og', 'dp']);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T7 — expectedStarts
// ═════════════════════════════════════════════════════════════════════════════

describe('T7 expectedStarts', () => {
  const hazardFn = (c) => 0.1 + 0.1 * c.ps + 0.05 * c.bn + 0.01 * c.wk;
  const stayFn = (c) => [0.5, 0.7, 0.9][c.st];
  const bn = (c) => (c <= 2 ? 0 : c <= 7 ? 1 : 2);
  const wk = (g) => (g <= 6 ? 0 : g <= 12 ? 1 : 2);
  const st = (s) => (s <= 1 ? 0 : s <= 3 ? 1 : 2);

  /** Independent enumeration of all 2^n role paths. */
  function brute(start, n) {
    let expected = 0;
    const perGame = new Array(n).fill(0);
    for (let path = 0; path < 1 << n; path++) {
      let state = start.role === 'S' ? { r: 'S', c: start.c, s: start.s } : { r: 'B', ps: start.ps, c: start.c };
      let prob = 1, count = 0;
      for (let j = 0; j < n; j++) {
        const takes = (path >> j) & 1;
        let p;
        if (state.r === 'B') p = hazardFn({ ps: state.ps, bn: bn(state.c), wk: wk(start.g + j) });
        else p = stayFn({ st: st(state.s) });
        prob *= takes ? p : 1 - p;
        if (takes) {
          state = state.r === 'B' ? { r: 'S', c: state.c, s: 1 } : { r: 'S', c: state.c, s: Math.min(state.s + 1, 4) };
          count++; perGame[j] += 0; // placeholder, accumulated below
        } else {
          state = state.r === 'B' ? { r: 'B', ps: state.ps, c: Math.min(state.c + 1, 8) } : { r: 'B', ps: 1, c: state.c };
        }
      }
      expected += prob * count;
    }
    // per-game marginals
    for (let j = 0; j < n; j++) {
      for (let path = 0; path < 1 << n; path++) {
        if (!((path >> j) & 1)) continue;
        let state = start.role === 'S' ? { r: 'S', c: start.c, s: start.s } : { r: 'B', ps: start.ps, c: start.c };
        let prob = 1;
        for (let k = 0; k < n; k++) {
          const takes = (path >> k) & 1;
          const p = state.r === 'B' ? hazardFn({ ps: state.ps, bn: bn(state.c), wk: wk(start.g + k) }) : stayFn({ st: st(state.s) });
          prob *= takes ? p : 1 - p;
          state = takes
            ? (state.r === 'B' ? { r: 'S', c: state.c, s: 1 } : { r: 'S', c: state.c, s: Math.min(state.s + 1, 4) })
            : (state.r === 'B' ? { r: 'B', ps: state.ps, c: Math.min(state.c + 1, 8) } : { r: 'B', ps: 1, c: state.c });
        }
        perGame[j] += prob;
      }
    }
    return { expected, perGame };
  }

  test('matches a brute-force enumeration of all 2³ role paths (pUp depends on ps/bn/wk, pStay on st)', () => {
    for (const start of [
      { role: 'B', ps: 0, c: 2, g: 5, hazardCodes: {}, stickCodes: {} },
      { role: 'B', ps: 1, c: 7, g: 6, hazardCodes: {}, stickCodes: {} },
      { role: 'S', c: 4, s: 3, g: 11, hazardCodes: {}, stickCodes: {} },
    ]) {
      const got = expectedStarts({ hazard: hazardFn, stick: stayFn, start, remaining: 3 });
      const want = brute(start, 3);
      assert.ok(Math.abs(got.expected - want.expected) < 1e-12);
      got.perGame.forEach((v, j) => assert.ok(Math.abs(v - want.perGame[j]) < 1e-12));
    }
  });

  test('hand-computed first game: P(start at game 1) = pUp(ps = first, bn = b0, wk of that game)', () => {
    const r = expectedStarts({ hazard: hazardFn, stick: stayFn, start: { ps: 0, c: 2, g: 5, hazardCodes: {}, stickCodes: {} }, remaining: 1 });
    assert.ok(Math.abs(r.perGame[0] - 0.10) < 1e-15);
    assert.equal(r.fraction, r.expected / 1);
  });

  test('a demoted starter re-enters (B, re) with his benched count unchanged', () => {
    const seen = [];
    const hazard = (c) => { seen.push({ ps: c.ps, bn: c.bn }); return 0; };
    expectedStarts({ hazard, stick: () => 0, start: { role: 'S', c: 2, s: 1, g: 4, hazardCodes: {}, stickCodes: {} }, remaining: 3 });
    // game 1: starter drops (no hazard call needed before); game 2: (B, re, c = 2) → bn b0 (an increment would give c = 3 → b1)
    assert.ok(seen.length > 0);
    assert.ok(seen.every((x) => x.ps === 1));
    assert.equal(seen[0].bn, 0);
  });

  test('c caps at 8 and s caps at 4', () => {
    const bnSeen = [];
    expectedStarts({ hazard: (c) => { bnSeen.push(c.bn); return 0; }, stick: () => 0, start: { ps: 0, c: 7, g: 1, hazardCodes: {}, stickCodes: {} }, remaining: 4 });
    assert.deepEqual(bnSeen, [1, 2, 2, 2]); // c: 7 → 8 → capped at 8
    const rs = expectedStarts({ hazard: () => 0, stick: (c) => [1, 1, 0.5][c.st], start: { role: 'S', c: 0, s: 1, g: 1, hazardCodes: {}, stickCodes: {} }, remaining: 6 });
    assert.deepEqual(rs.perGame, [1, 1, 1, 0.5, 0.25, 0.125]); // without the s cap of 4, game 5 would read 0.5
  });

  test('probability mass sums to 1 every game; fraction = expected / remaining; og = yes forces dq = unknown', () => {
    const r = expectedStarts({ hazard: hazardFn, stick: stayFn, start: { ps: 0, c: 3, g: 2, hazardCodes: {}, stickCodes: {} }, remaining: 14 });
    r.massPerGame.forEach((m) => assert.ok(Math.abs(m - 1) < 1e-12));
    assert.ok(Math.abs(r.fraction - r.expected / 14) < 1e-15);
    let dq = null;
    expectedStarts({ hazard: () => 1, stick: (c) => { dq = c.dq; return 0.5; }, start: { ps: 0, c: 0, g: 2, hazardCodes: { og: 1 }, stickCodes: { dq: 0 } }, remaining: 2 });
    assert.equal(dq, LEVELS.dq.indexOf('unknown'));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T8 — incPPG
// ═════════════════════════════════════════════════════════════════════════════

describe('T8 incPPG', () => {
  test('the fixed k is 3', () => assert.equal(QB_TAKEOVER_DEFAULTS.incK, 3));
  test('prior-only at n = 0', () => assert.equal(incPPG({ prior: 18, obs: [] }), 18));
  test('posterior with k = 3', () => {
    assert.equal(incPPG({ prior: 20, obs: [30] }), (20 * 3 + 30) / 4);
    assert.equal(incPPG({ prior: 20, obs: [10, 20, 30] }), (60 + 60) / 6);
  });
  test('no prior and n < 2 → null (iq = unknown); n ≥ 2 → the observed mean', () => {
    assert.equal(incPPG({ prior: null, obs: [] }), null);
    assert.equal(incPPG({ prior: null, obs: [25] }), null);
    assert.equal(incPPG({ prior: null, obs: [10, 20] }), 15);
  });
  test('prior requires ≥ 4 games', () => {
    assert.equal(priorPPG({ gamesPlayed: 3, fantasyPoints: 60 }), null);
    assert.equal(priorPPG({ gamesPlayed: 4, fantasyPoints: 60 }), 15);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// synthetic full store (T9 / T11 / T12 / T13)
// ═════════════════════════════════════════════════════════════════════════════

const TEAMS = ['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF', 'GGG', 'HHH'];

function synthSeason(S) {
  const rng = mulberry32(S * 7919);
  // circle-method round robin, 17 weeks, no byes
  const slots = [...TEAMS];
  const rounds = [];
  for (let r = 0; r < 7; r++) {
    const pairs = [];
    for (let i = 0; i < 4; i++) pairs.push([slots[i], slots[7 - i]]);
    rounds.push(pairs);
    slots.splice(1, 0, slots.pop());
  }
  const games = [];
  for (let w = 1; w <= 17; w++) {
    for (const [home, away] of rounds[(w - 1) % 7]) {
      games.push({ gameId: `${S}_${w}_${home}`, season: S, week: w, gameType: 'REG', homeTeam: home, awayTeam: away, homeScore: Math.floor(rng() * 35), awayScore: Math.floor(rng() * 35) });
    }
  }
  const prim = {};
  const players = {};
  const weeklyPts = {};
  for (const T of TEAMS) {
    let cur = 0;
    prim[T] = {};
    for (let w = 1; w <= 17; w++) {
      if (rng() < 0.12) cur = Math.floor(rng() * 3);
      const pid = `${T}_${cur}`;
      prim[T][w] = pid;
      players[pid] ??= { position: 'QB', games: [] };
      players[pid].games.push({ week: w, seasonType: 'REG', team: T, attempts: 30, sacksSuffered: 2 });
      weeklyPts[pid] ??= {};
      weeklyPts[pid][w] = 8 + Math.floor(rng() * 20) + (cur === 0 ? 4 : 0);
    }
  }
  const depth = { weeks: {} };
  for (let w = 1; w <= 18; w++) {
    depth.weeks[w] = {};
    for (const T of TEAMS) {
      const lead = prim[T][S >= DEPTH_ESPN_FROM_SEASON ? Math.min(w, 17) : Math.max(1, w - 1)];
      const k = Number(lead.split('_')[1]);
      const rest = [0, 1, 2].filter((x) => x !== k);
      if (rng() < 0.1) rest.reverse();
      depth.weeks[w][T] = { QB: [lead, ...rest.map((x) => `${T}_${x}`)] };
    }
  }
  const totals = {};
  for (const [pid, wp] of Object.entries(weeklyPts)) {
    const gp = Object.keys(wp).length;
    totals[pid] = { gamesPlayed: gp, fantasyPoints: Object.values(wp).reduce((a, b) => a + b, 0), weeklyPoints: wp };
  }
  return { gamelogs: { players }, schedule: { games }, depth, totals };
}

function synthLoad({ spy = null, drop = null, emptySeason = null, inProgress = null } = {}) {
  const cache = new Map();
  const get = (S) => {
    if (!cache.has(S)) cache.set(S, synthSeason(S));
    return cache.get(S);
  };
  const bySleeper = {};
  TEAMS.forEach((T, ti) => {
    bySleeper[`${T}_0`] = { draftYear: 2010, draftOvr: 40, undrafted: false, birthdate: '1990-04-01' };
    bySleeper[`${T}_1`] = { draftYear: 2013 + ti, draftOvr: 60, undrafted: false, birthdate: '1995-04-01' };
    bySleeper[`${T}_2`] = { draftYear: 2012, draftOvr: null, undrafted: true, birthdate: '1992-04-01' };
  });
  const rec = (name, y) => { spy?.push([name, y]); };
  return {
    loadGameLogs: (y) => {
      rec('loadGameLogs', y);
      const g = structuredClone(get(y).gamelogs);
      if (drop && drop.S === y) g.players[drop.pid].games = g.players[drop.pid].games.filter((x) => x.week !== drop.week);
      return g;
    },
    loadSchedule: (y) => { rec('loadSchedule', y); return emptySeason === y ? { games: [] } : get(y).schedule; },
    loadDepth: (y) => { rec('loadDepth', y); return get(y).depth; },
    loadSeasonTotals: (y) => { rec('loadSeasonTotals', y); return get(y).totals; },
    loadPlayerIds: () => ({ bySleeper }),
    loadManifest: () => ({ files: inProgress ? { [inProgress]: { inProgress: true } } : {} }),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// T9 — loader ceiling
// ═════════════════════════════════════════════════════════════════════════════

describe('T9 loader ceiling', () => {
  test('no year > 2025 is requested for any family; season-totals ⊆ [2012, 2025]; no depth/schedule 2026', () => {
    const spy = [];
    runQbTakeover({ load: synthLoad({ spy }) });
    assert.ok(spy.length > 0);
    for (const [name, y] of spy) assert.ok(y <= 2025, `${name}(${y})`);
    assert.equal(spy.some(([n, y]) => (n === 'loadDepth' || n === 'loadSchedule') && y >= 2026), false);
    const st = spy.filter(([n]) => n === 'loadSeasonTotals').map(([, y]) => y);
    assert.ok(Math.min(...st) === 2012 && Math.max(...st) <= 2025);
    assert.ok(spy.some(([n, y]) => n === 'loadSeasonTotals' && y === 2025));
    assert.ok(spy.some(([n, y]) => n === 'loadDepth' && y === 2013));
  });

  test('a manifest marking a gamelogs year inProgress throws via guardLoad', () => {
    assert.throws(
      () => runQbTakeover({ load: synthLoad({ inProgress: 'nflverse/gamelogs/2020.json' }) }),
      (err) => !(err instanceof CoverageStop) && /inProgress/.test(err.message),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T10 — live smoke (read-only; the only live-store test)
// ═════════════════════════════════════════════════════════════════════════════

describe('T10 live smoke', () => {
  const live = fs.existsSync(path.join(REPO_ROOT, 'nflverse/depth/2013.json'));
  test('runQbTakeover() on the real store: no CoverageStop, row counts in band, verification exact',
    { timeout: 600_000, skip: live ? false : 'nflverse/depth/2013.json absent — live store not checked out' }, () => {
      const t0 = Date.now();
      const result = runQbTakeover();
      const secs = (Date.now() - t0) / 1000;
      console.log(`[T10] runtime ${secs.toFixed(1)} s`);
      const { counts } = result;
      assert.ok(Math.abs(counts.hazardRows / 9400 - 1) <= 0.05, `hazard rows ${counts.hazardRows}`);
      assert.ok(Math.abs(counts.hazardEvents / 606 - 1) <= 0.05, `hazard events ${counts.hazardEvents}`);
      assert.ok(result.constants.verification.maxAbsDiff.hazard < 1e-9);
      assert.ok(result.constants.verification.maxAbsDiff.stickiness < 1e-9);
      assert.ok(result.coverage.every((c) => c.rate >= 0.99));
      assert.equal(result.hazardLadderEmpty, false);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// T11 — CLI
// ═════════════════════════════════════════════════════════════════════════════

describe('T11 CLI', () => {
  test('CoverageStop → returns 1; writeArtifacts is never called, even with write: true', () => {
    let calls = 0;
    const code = qbTakeoverMain({
      load: synthLoad({ emptySeason: 2016 }), write: true, writeArtifacts: () => { calls++; return {}; }, log: () => {}, logErr: () => {},
    });
    assert.equal(code, 1);
    assert.equal(calls, 0);
  });

  test('success with write: true → returns 0 and the spy is called once; the verdict is built even without write', () => {
    let calls = 0, written = null;
    const out = [];
    const code = qbTakeoverMain({
      load: synthLoad(), write: true, writeArtifacts: (a) => { calls++; written = a; return { panelPath: 'p', constantsPath: 'c', verdictPath: 'v', panelBytes: 1, constantsBytes: 1 }; },
      log: (m) => out.push(m), logErr: () => {},
    });
    assert.equal(code, 0);
    assert.equal(calls, 1);
    assert.match(written.verdictMd, /\*\*Reproduce:\*\* node bin\/backtest\.mjs --qb-takeover --write/);
    assert.match(out[0], /^# P6a/);
    let calls2 = 0;
    assert.equal(qbTakeoverMain({ load: synthLoad(), write: false, writeArtifacts: () => { calls2++; }, log: () => {}, logErr: () => {} }), 0);
    assert.equal(calls2, 0);
  });

  test('the bin rejects every flag but --json/--write (--qb-takeover --dynasty → exit 1)', () => {
    const r = spawnSync('node', ['bin/backtest.mjs', '--qb-takeover', '--dynasty'], { cwd: REPO_ROOT, encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /--qb-takeover rejects --dynasty/);
    const r2 = spawnSync('node', ['bin/backtest.mjs', '--qb-takeover', '--from', '2015'], { cwd: REPO_ROOT, encoding: 'utf8' });
    assert.equal(r2.status, 1);
    assert.match(r2.stderr, /--qb-takeover rejects --from/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T12 — coverage stop edge cases
// ═════════════════════════════════════════════════════════════════════════════

describe('T12 coverage stop', () => {
  test('a season with zero REG team-games throws CoverageStop (NaN rate)', () => {
    assert.ok(Number.isNaN(coverageFor({ games: [] }, new Map()).rate));
    assert.throws(() => runQbTakeover({ load: synthLoad({ emptySeason: 2018 }) }), (e) => e instanceof CoverageStop && /2018/.test(e.message));
  });

  test('a schedule field rename (no REG games) is a stop, not a NaN pass', () => {
    const load = synthLoad();
    const orig = load.loadSchedule;
    load.loadSchedule = (y) => ({ games: orig(y).games.map(({ gameType, ...rest }) => ({ ...rest, game_type: gameType })) });
    assert.throws(() => runQbTakeover({ load }), CoverageStop);
  });

  test('a rate exactly at the floor passes (135/136); one epsilon above it stops', () => {
    // drop whoever was AAA's week-1 primary in the 2020 fixture
    const sched = synthSeason(2020);
    const who = Object.entries(sched.gamelogs.players).find(([, p]) => p.games.some((g) => g.team === 'AAA' && g.week === 1))[0];
    const load = synthLoad({ drop: { S: 2020, pid: who, week: 1 } });
    const rate = 135 / 136;
    const res = runQbTakeover({ load, defaults: { ...QB_TAKEOVER_DEFAULTS, coverageMin: rate } });
    assert.equal(res.coverage.find((c) => c.S === 2020).rate, rate);
    assert.throws(
      () => runQbTakeover({ load: synthLoad({ drop: { S: 2020, pid: who, week: 1 } }), defaults: { ...QB_TAKEOVER_DEFAULTS, coverageMin: rate + 1e-9 } }),
      CoverageStop,
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T13 — writer and constants
// ═════════════════════════════════════════════════════════════════════════════

describe('T13 writer and constants', () => {
  const result = runQbTakeover({ load: synthLoad() });
  const verdictMd = buildQbTakeoverVerdictMarkdown(result);

  test('a panel over the cap throws before ANY file is written', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qbt-'));
    assert.throws(() => writeQbTakeoverArtifacts({ result, verdictMd, root: dir, caps: { panelBytes: 100, constantsBytes: 1e9 } }), /panel artifact .* exceeds/);
    assert.deepEqual(fs.readdirSync(dir), []);
    assert.throws(() => writeQbTakeoverArtifacts({ result, verdictMd, root: dir, caps: { panelBytes: 1e9, constantsBytes: 100 } }), /constants artifact .* exceeds/);
    assert.deepEqual(fs.readdirSync(dir), []);
  });

  test('under the caps all three artifacts are written; constants parse; one line per fixture pattern', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qbt-'));
    const w = writeQbTakeoverArtifacts({ result, verdictMd, root: dir });
    const constantsTxt = fs.readFileSync(path.join(dir, w.constantsPath), 'utf8');
    const constants = JSON.parse(constantsTxt);
    assert.ok(fs.existsSync(path.join(dir, w.panelPath)) && fs.existsSync(path.join(dir, w.verdictPath)));
    assert.equal(constants.fixture.hazardPatterns.length, result.constants.fixture.hazardPatterns.length);
    assert.ok(constantsTxt.split('\n').length > constants.fixture.hazardPatterns.length);
    assert.equal(formatQbTakeoverConstantsJson(result.constants), constantsTxt);
  });

  test('the panel carries no per-player records and no constants block', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qbt-'));
    const w = writeQbTakeoverArtifacts({ result, verdictMd, root: dir });
    const panel = JSON.parse(fs.readFileSync(path.join(dir, w.panelPath), 'utf8'));
    assert.equal(panel.constants, undefined);
    assert.equal(panel.hazardRows, undefined);
    assert.ok(!JSON.stringify(panel).includes('"pid"'));
  });

  test('constants: coefficients rounded to 1e-4, the unrounded fold coefficients are not; fixture refit is exact', () => {
    for (const fam of ['hazard', 'stickiness']) {
      for (const v of Object.values(result.constants[fam].coef)) assert.equal(v, roundCoef(v));
    }
    const fold = result.folds.hazard[0].coef;
    assert.ok(Object.values(fold).some((v) => v !== roundCoef(v)));
    const { fixture } = result.constants;
    const refit = fitFromPatterns(fixture.hazardPatterns, HAZARD_KEYS, result.final.hazard.features, { offset: 0 });
    for (const [k, v] of Object.entries(result.constants.hazard.coef)) assert.ok(Math.abs(roundCoef(refit.coef[k]) - v) < 1e-12, k);
    const refitS = fitFromPatterns(fixture.stickPatterns, STICK_KEYS, result.final.stickiness.features, { offset: 0 });
    for (const [k, v] of Object.entries(result.constants.stickiness.coef)) assert.ok(Math.abs(roundCoef(refitS.coef[k]) - v) < 1e-12, k);
    assert.ok(result.constants.verification.maxAbsDiff.hazard < 1e-9);
  });

  test('the verdict carries every section and the reproduce line', () => {
    for (const h of ['## Q1', '## Q2', '## Q3', '## Q4', '## Q5', '## Q6', '## For P6b', 'Selection optimism', 'does NOT model']) {
      assert.ok(verdictMd.includes(h), h);
    }
    assert.ok(QB_TAKEOVER_LOAD.loadDepth && QB_TAKEOVER_LOAD.loadManifest);
  });
});
