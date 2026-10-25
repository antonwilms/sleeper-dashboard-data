/**
 * test/season-grade-b.test.mjs — P3 Slice B: the ROS / games / override / rookie / D-60 / listed steps, their pure parts in
 * lib/seasonGrade.mjs, the no-throw rule (§10a), the labels at their boundaries and the byte-identity of the two adapter
 * parameters (plan january-grading-run-b §10a, §11).
 *
 * Fixtures only (Invariant 10): synthetic objects built here, test/fixtures/season-grade/*.json and the test-support/ memLoad
 * helpers. Anything that would write is run with fs.writeFileSync / mkdirSync stubbed.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  rosCalendar, ROS_WEEK1_THURSDAY, ROS_CHECKPOINTS, ROS_MIN, L6_MIN, D75_MIN, pickCheckpointCapture, buildRosRows,
  rosCheckpointReport, rosLabel, gamesL6Report, l6Label, d16Label, d75Label, pairedDelta,
} from '../lib/seasonGrade.mjs';
import { normalizeTeamForSchedule } from '../lib/sleeper.mjs';
import { composeRookieRow } from '../lib/rookieTotalPoints.mjs';
import { leagueBasisLoad, basisScaleOf } from '../lib/leagueBasis.mjs';
import { runRookiePanels, leagueLoadArgs } from '../scripts/panel-run.mjs';
import { runRookieTotal } from '../scripts/rookie-total-run.mjs';
import { STEPS, runSeasonGrade, makeContext, qbAsymptoteLoco, rookieTotalArms } from '../scripts/season-grade-run.mjs';
import { memLoad, leagueStub, row as rookieRow } from '../test-support/rookie-basis-fixtures.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const fx = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/season-grade', name), 'utf8'));
const step = (id) => STEPS.find(s => s.id === id);
const J = (x) => JSON.parse(JSON.stringify(x));

/** Run `fn` with fs writes stubbed; returns { out, written }. Nothing reaches the repo. */
async function noWrites(fn) {
  const written = [];
  const w = fs.writeFileSync, m = fs.mkdirSync;
  fs.writeFileSync = (p) => { written.push(String(p)); };
  fs.mkdirSync = () => {};
  try { return { out: await fn(), written }; } finally { fs.writeFileSync = w; fs.mkdirSync = m; }
}

// ─── Calendar and capture pick ────────────────────────────────────────────────

describe('ROS calendar (§6.1)', () => {
  const cal = rosCalendar();
  test('week 1 Thursday is the fixed literal; c = 3 closes 2026-09-29T06:00:00Z with its window ending 2026-10-01T23:00:00Z', () => {
    assert.equal(ROS_WEEK1_THURSDAY, '2026-09-10');
    assert.equal(cal[0].thursday, '2026-09-10');
    assert.equal(cal.length, 17);
    assert.equal(cal[2].c, 3);
    assert.equal(cal[2].closeUtc, '2026-09-29T06:00:00Z');
    assert.equal(cal[2].windowEndUtc, '2026-10-01T23:00:00Z');
    assert.deepEqual(ROS_CHECKPOINTS, [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
  });

  const entries = [
    { date: '2026-09-27', capturedAt: '2026-09-27T12:00:00Z', targetSeason: 2026 },
    { date: '2026-09-29', capturedAt: '2026-09-29T05:59:59Z', targetSeason: 2026 },   // one second before close_3
    { date: '2026-09-30', capturedAt: '2026-09-30T08:00:00Z', targetSeason: 2026 },
    { date: '2026-10-06', capturedAt: '2026-10-06T21:07:00Z', targetSeason: 2026 },
    { date: '2025-12-01', capturedAt: '2026-09-30T00:00:00Z', targetSeason: 2025 },    // wrong season: never picked
  ];
  test('ok: the first capture inside [close_c, next Thursday 23:00Z); a capture before close is skipped', () => {
    assert.deepEqual(pickCheckpointCapture(cal[2], entries), { c: 3, date: '2026-09-30', status: 'ok' });
  });
  test('late: the first capture after close_c when none is inside the window', () => {
    const sparse = [entries[0], { date: '2026-10-13', capturedAt: '2026-10-13T12:00:00Z', targetSeason: 2026 }];   // nothing in c = 4's window (ends 10-08 23:00Z)
    assert.deepEqual(pickCheckpointCapture(cal[3], sparse), { c: 4, date: '2026-10-13', status: 'late' });
    assert.deepEqual(pickCheckpointCapture(cal[3], entries), { c: 4, date: '2026-10-06', status: 'ok' });
  });
  test('no-capture: nothing after close_c; no-inSeason-capture for c = 1, 2 whatever exists', () => {
    assert.deepEqual(pickCheckpointCapture(cal[6], entries), { c: 7, date: null, status: 'no-capture' });
    assert.deepEqual(pickCheckpointCapture(cal[0], entries), { c: 1, date: null, status: 'no-inSeason-capture' });
    assert.deepEqual(pickCheckpointCapture(cal[1], entries), { c: 2, date: null, status: 'no-inSeason-capture' });
  });
});

// ─── buildRosRows on a synthetic world ────────────────────────────────────────

describe('buildRosRows (§6.1)', () => {
  // Schedule: AAA plays weeks 1–17 except a bye in 6; LA (the schedule's Rams code) except 7; SHORT only weeks 1–3.
  const games = [];
  const play = (team, weeks) => { for (const week of weeks) games.push({ gameType: 'REG', week, homeTeam: team, awayTeam: 'OPP' }); };
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  play('AAA', range(1, 17).filter(w => w !== 6));
  play('LA', range(1, 17).filter(w => w !== 7));
  play('SHORT', [1, 2, 3]);
  games.push({ gameType: 'POST', week: 19, homeTeam: 'AAA', awayTeam: 'OPP' });
  const schedule = { games };

  const status = (n, from = 1) => { const a = new Array(18).fill(null); for (let w = from; w < from + n; w++) a[w - 1] = 'P'; return a; };
  const pts = (obj) => ({ weeklyPoints: obj });
  const flat = (weeks, v) => Object.fromEntries(weeks.map(w => [String(w), v]));
  const rescored = {
    a1: { weeklyStatus: status(12), ...pts(flat(range(1, 12), 10)) },                     // n = 2 → realised weeks 3–12
    a2: { weeklyStatus: status(12), ...pts(flat(range(1, 12), 8)) },                      // n = 0
    a3: { weeklyStatus: status(5), ...pts(flat(range(1, 5), 5)) },                        // n = 2 → only 3 weeks after: not graded
    a4: { weeklyStatus: status(2), ...pts(flat([1, 2], 5)) },                             // n = 5 but only 2 P weeks → inconsistent
    q1: { weeklyStatus: status(17), ...pts({ 1: 12, ...flat(range(15, 17), 6) }) },       // start, team LAR → LA
    q4: undefined,                                                                         // start, no 2026 row → 0 points
    q5: { weeklyStatus: status(17), ...pts(flat(range(1, 17), 20)) },                     // start, n = 3
  };
  const ins = (n, extra = {}) => ({ season: 2026, n, frozen: false, priorSource: 'live', notFrozenReason: 'model-changed', ros: { value: 10, prior: 8 }, ...extra });
  const capture = { players: {
    a1: { nfl_team: 'AAA', inSeason: ins(2) },
    a2: { nfl_team: 'AAA', inSeason: ins(0) },
    a3: { nfl_team: 'AAA', inSeason: ins(2) },
    a4: { nfl_team: 'AAA', inSeason: ins(5) },
    q1: { nfl_team: 'LAR', inSeason: ins(0, { start: { remaining: 3 } }) },
    q2: { nfl_team: null, inSeason: ins(0, { start: { remaining: 3 } }) },
    q3: { nfl_team: 'SHORT', inSeason: ins(0, { start: { remaining: 5 } }) },
    q4: { nfl_team: 'AAA', inSeason: ins(0, { start: { remaining: 2 } }) },
    q5: { nfl_team: 'AAA', inSeason: ins(3, { start: { remaining: 2 } }) },
    u1: { nfl_team: 'AAA', inSeason: ins(1) },
    old: { nfl_team: 'AAA', inSeason: { ...ins(1), season: 2025 } },
  } };
  const POS = { a1: 'WR', a2: 'WR', a3: 'RB', a4: 'TE', q1: 'QB', q2: 'QB', q3: 'QB', q4: 'QB', q5: 'QB' };
  const build = (over = {}) => buildRosRows(capture, {
    rescored, schedule, positionOf: (id) => POS[id] ?? null, c: 3,
    teamOf: (id, p) => normalizeTeamForSchedule(p.nfl_team), ...over,
  });

  test('(a) per-game rows: realised = league points over the P weeks after the n-th P week; < 4 such weeks is not graded; n-th week ≤ c+1 drives the consistency share', () => {
    const r = build();
    const by = Object.fromEntries(r.perGame.map(x => [x.id, x]));
    assert.equal(by.a1.realised, 10); assert.equal(by.a1.nGames, 10); assert.equal(by.a1.graded, true); assert.equal(by.a1.observed, 10);
    assert.equal(by.a2.nGames, 12); assert.equal(by.a2.realised, 8);
    assert.equal(by.a3.nGames, 3); assert.equal(by.a3.graded, false);
    assert.equal(by.a4, undefined, 'an n-inconsistent row is not graded');
    assert.ok(!('old' in by), 'inSeason.season !== 2026 is skipped');
    // inconsistent: a4 (n = 5, two P weeks) and u1 (n = 1 but no 2026 row); the other 8 of 10 rows with season 2026 are consistent
    assert.equal(r.nConsistency.n, 10);
    assert.equal(r.nConsistency.share, 8 / 10);
  });
  test('(a) rows with n = 0 have no observed-to-date comparator; n ≥ 1 do', () => {
    const by = Object.fromEntries(build().perGame.map(x => [x.id, x]));
    assert.equal(by.a2.observed, null);
    assert.equal(by.a1.observed, 10);
  });
  test('(b) start rows use the team-game basis: the schedule alias LAR→LA, realised = the last `remaining` scheduled games ÷ remaining, observed = team weeks ≤ c ÷ their count, unplayed weeks 0', () => {
    const q = Object.fromEntries(build().start.map(x => [x.id, x]));
    assert.equal(q.q1.realised, 6);          // LA's last 3 games are weeks 15–17 at 6 points each
    assert.equal(q.q1.observed, 0);          // n = 0 → comparator exactly 0 (§13a), despite 12 points in week 1
    assert.equal(q.q4.realised, 0);          // no 2026 row scores 0
    assert.equal(q.q4.observed, 0);
    assert.equal(q.q5.realised, 20);
  });
  test('(b) start rows with inSeason.n = 0 have a comparator of exactly 0 (§6.1/§13a) even with league points in weeks ≤ c, and enter the observed-to-date Δ; n ≥ 1 start rows keep the team-week value; (a) rows with n = 0 do not', () => {
    const r = build();
    const q1 = r.start.find(x => x.id === 'q1');
    assert.equal(q1.n, 0); assert.equal(q1.observed, 0, 'q1 scored 12 in week 1 (≤ c) yet n = 0 → observed is exactly 0');
    const q5 = r.start.find(x => x.id === 'q5');
    assert.equal(q5.n, 3); assert.equal(q5.observed, 20, 'n ≥ 1 keeps the team-week mean over weeks ≤ c');
    const b0 = r.start.find(x => x.id === 'q4');
    assert.equal(b0.n, 0); assert.equal(b0.observed, 0);
    const rep = rosCheckpointReport([b0, ...Array.from({ length: 40 }, (_, i) => ({ ...b0, id: `x${i}`, value: 10, realised: 12, observed: 0 }))]);
    assert.equal(rep.QB.vsObserved.n, 41, 'n = 0 start rows are in the observed comparison');
    const rep2 = rosCheckpointReport(r.perGame.filter(x => x.id === 'a2'));
    assert.equal(rep2.WR.vsObserved.n, 0, 'an (a) n = 0 row is excluded from the observed comparison');
    assert.equal(rep2.WR.vsPrior.n, 1);
  });
  test('no-team, schedule-short and no-schedule are counted separately; UNK is counted, not graded; no row for (a) is counted', () => {
    const r = build();
    assert.equal(r.counts.noTeam, 1);
    assert.equal(r.counts.scheduleShort, 1);
    assert.equal(r.counts.unk, 1);
    assert.equal(r.counts.noSchedule, 0);
    const none = build({ schedule: null });
    assert.equal(none.counts.noSchedule, 4, 'q1, q3, q4, q5 have a team');
    assert.equal(none.counts.noTeam, 1);
    assert.equal(none.start.length, 0);
    assert.equal(rosCheckpointReport(none.start).QB.label, 'empty');
  });
  test('a capture with an inSeason block from a real field set reads with no undefined field (trimmed 2026-10-06 fixture)', () => {
    const snap = fx('snap-2026-10-06.json');
    const ids = Object.keys(snap.players);
    const sched = { games: range(1, 17).flatMap(w => [...new Set(Object.values(snap.players).map(p => p.nfl_team).filter(Boolean))].map(t => ({ gameType: 'REG', week: w, homeTeam: normalizeTeamForSchedule(t), awayTeam: 'OPP' }))) };
    const resc = Object.fromEntries(ids.map(id => [id, { weeklyStatus: status(6), weeklyPoints: flat(range(1, 6), 7) }]));
    const r = buildRosRows(snap, { rescored: resc, schedule: sched, positionOf: (id) => (snap.players[id].inSeason.start ? 'QB' : 'WR'), c: 4, teamOf: (id, p) => normalizeTeamForSchedule(p.nfl_team) });
    assert.ok(r.start.length >= 5, 'the trimmed capture carries at least 5 start rows');
    for (const x of [...r.perGame, ...r.start]) for (const k of ['id', 'pos', 'value', 'prior', 'observed', 'realised', 'frozen', 'priorSource', 'notFrozenReason']) assert.notEqual(x[k], undefined, `${x.id}.${k}`);
  });
});
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// ─── Reports and labels ───────────────────────────────────────────────────────

describe('rosCheckpointReport, empty / insufficient / split (§6.1)', () => {
  const mk = (n, over = {}) => Array.from({ length: n }, (_, i) => ({ id: `p${i}${over.tag ?? ''}`, pos: 'WR', value: 10, prior: 20, observed: 9, realised: 11 + (i % 3), frozen: false, priorSource: 'live', notFrozenReason: 'model-changed', graded: true, ...over }));
  test('0 graded players → empty; fewer than ROS_MIN → insufficient (numbers kept, no label); ≥ ROS_MIN labels from the CI', () => {
    const rep0 = rosCheckpointReport([]);
    assert.equal(rep0.WR.label, 'empty'); assert.equal(rep0.WR.n, 0);
    const few = rosCheckpointReport(mk(ROS_MIN - 1));
    assert.equal(few.WR.label, 'insufficient'); assert.equal(few.WR.vsPrior.label, 'insufficient');
    assert.ok(Number.isFinite(few.WR.mae), 'numbers still printed');
    const ok = rosCheckpointReport(mk(ROS_MIN));
    assert.equal(ok.WR.label, 'graded');
    assert.equal(ok.WR.vsPrior.label, 'value-beats-prior', 'value (10) is nearer the realised 11–13 than the prior (20) on every row');
  });
  test('the frozen/live split is reported only when both groups are non-empty, keyed on frozen === true', () => {
    const live = mk(5);
    const deg = rosCheckpointReport(live).split;
    assert.equal(deg.degenerate, true);
    assert.match(deg.line, /^split degenerate: all rows priorSource live \(notFrozenReason counts \{"model-changed":5\}\)$/);
    const frozen = mk(5, { tag: 'f', frozen: true, priorSource: 'snapshot:2026-09-09', notFrozenReason: null });
    const both = rosCheckpointReport([...live, ...frozen]).split;
    assert.equal(both.degenerate, false);
    assert.equal(both.frozen.WR.n, 5); assert.equal(both.live.WR.n, 5);
    assert.equal(rosCheckpointReport(frozen).split.degenerate, true, 'all frozen is degenerate too');
  });
  test('null guard 1: no finite diffs gives { mean: null, ci: null } and the label insufficient, never a throw', () => {
    assert.deepEqual(pairedDelta(['a', 'b'], [NaN, null]), { mean: null, ci: null });
    const noPrior = rosCheckpointReport(mk(ROS_MIN + 5, { prior: null }));
    assert.deepEqual([noPrior.WR.vsPrior.mean, noPrior.WR.vsPrior.ci, noPrior.WR.vsPrior.label], [null, null, 'insufficient']);
    const g = gamesL6Report([{ id: 'a', state: 'short', l6c: NaN, base: 1, realised: 1, rel3: false }]);
    assert.equal(g.byState.short.delta.label, 'insufficient');
    assert.equal(g.byState.short.delta.mean, null); assert.equal(g.byState.short.delta.ci, null);
    assert.equal(g.byState.none.n, 0); assert.equal(g.byState.none.delta.label, 'insufficient');
  });
});

describe('labels at their boundaries (§13)', () => {
  test('ROS: CI upper < 0 beats the comparator; upper ≥ 0 does not; no CI is insufficient', () => {
    assert.equal(rosLabel([-0.5, -0.0001], 'prior'), 'value-beats-prior');
    assert.equal(rosLabel([-0.5, 0], 'prior'), 'no-difference');
    assert.equal(rosLabel([-0.5, 0.2], 'observed'), 'no-difference');
    assert.equal(rosLabel(null, 'observed'), 'insufficient');
  });
  test('L6: upper < 0 → l6c-beats-base; lower > 0 → base-beats-l6c; straddling → no-difference', () => {
    assert.equal(l6Label([-2, -0.1]), 'l6c-beats-base');
    assert.equal(l6Label([0.1, 2]), 'base-beats-l6c');
    assert.equal(l6Label([-1, 1]), 'no-difference');
    assert.equal(l6Label([-1, 0]), 'no-difference');
    assert.equal(l6Label(null), 'insufficient');
  });
  test('D-16: moved iff the asymptote is outside [20.50, 21.95]', () => {
    assert.equal(d16Label(20.49), 'moved');
    assert.equal(d16Label(20.50), 'within-fold-spread');
    assert.equal(d16Label(21.95), 'within-fold-spread');
    assert.equal(d16Label(21.96), 'moved');
    assert.equal(d16Label(null), 'insufficient');
  });
  test('D-75: ratio_L closer and the guard passes → league-better-calibrated; guard fails → shipped-stands; fewer than 30 rows → insufficient', () => {
    const base = { n: D75_MIN, ratioH: 0.8, ratioL: 0.9, deltaCi: [-3, -1] };
    assert.equal(d75Label(base), 'league-better-calibrated');
    assert.equal(d75Label({ ...base, deltaCi: [0.1, 3] }), 'shipped-stands', 'guard fails: CI lower bound > 0');
    assert.equal(d75Label({ ...base, deltaCi: [0, 3] }), 'league-better-calibrated', 'lower bound exactly 0 passes');
    assert.equal(d75Label({ ...base, ratioL: 0.7 }), 'shipped-stands', 'ratio_L is farther from 1');
    assert.equal(d75Label({ ...base, n: D75_MIN - 1 }), 'insufficient');
    assert.equal(d75Label({ ...base, deltaCi: null }), 'insufficient');
  });
});

describe('rookieTotalArms (§7)', () => {
  const rows = (g, n, real) => Array.from({ length: n }, (_, i) => ({ sleeperId: `${g}${i}`, position: 'WR', draftGroup: g, predTotal: 100, predPPG: 5, outcomeTotalPts: real, outcomeGames: 10 }));
  const shipped = { day3: 0.796, undrafted: 0.835 }, league = { day3: 0.866, undrafted: 0.944 };
  test('both arms are predTotal × factor; ratio = Σpred ÷ Σreal; the label follows the rule; non-decision positions and groups are dropped', () => {
    const all = [...rows('day3', D75_MIN, 100), ...rows('undrafted', D75_MIN - 1, 100), { ...rows('day3', 1, 100)[0], sleeperId: 'qb', position: 'QB' }, ...rows('r1', 40, 100)];
    const a = rookieTotalArms(all, { shipped, league });
    assert.deepEqual(Object.keys(a), ['day3', 'undrafted']);
    assert.equal(a.day3.n, D75_MIN);
    assert.ok(Math.abs(a.day3.ratioH.value - 0.796) < 1e-9);
    assert.ok(Math.abs(a.day3.ratioL.value - 0.866) < 1e-9);
    assert.ok(Math.abs(a.day3.delta.mean - ((100 - 86.6) - (100 - 79.6))) < 1e-9, 'Δ|err| = |league − real| − |shipped − real|');
    assert.equal(a.day3.label, 'league-better-calibrated');
    assert.equal(a.undrafted.label, 'insufficient');
  });
  test('null guard 1: a group with 0 rows is n: 0 / insufficient with no biasSummary call; the same for a group whose diffs are not finite', () => {
    const a = rookieTotalArms([], { shipped, league });
    assert.equal(a.day3.n, 0); assert.equal(a.day3.label, 'insufficient'); assert.equal(a.day3.ratioH.value, null);
    const bad = rookieTotalArms(rows('day3', D75_MIN, NaN), { shipped, league });
    assert.equal(bad.day3.n, D75_MIN);
    assert.equal(bad.day3.delta.mean, null); assert.equal(bad.day3.delta.ci, null); assert.equal(bad.day3.label, 'insufficient');
  });
});

describe('qbAsymptoteLoco (§7 D-16 iii)', () => {
  const q = (entryYear, ppg, extra = {}) => ({ position: 'QB', entryYear, outcomeGames: 10, outcomePPG: ppg, ...extra });
  test('leave-one-class-year-out p99 on a synthetic 3-class set equals the hand computation', () => {
    const rows = [q(2020, 10), q(2020, 20), q(2021, 30), q(2022, 40), q(2022, 50), q(2022, 99, { outcomeGames: 7 }), q(2022, 99, { position: 'WR' })];
    const r = qbAsymptoteLoco(rows);
    // fold 2020: [30,40,50] → idx 1.98 → 49.8; fold 2021: [10,20,40,50] → idx 2.97 → 49.7; fold 2022: [10,20,30] → idx 1.98 → 29.8
    assert.deepEqual(r.folds.map(f => [f.y, f.asymptote, f.n]), [[2020, 49.8, 3], [2021, 49.7, 4], [2022, 29.8, 3]]);
    assert.equal(r.min, 29.8); assert.equal(r.max, 49.8); assert.equal(r.classes, 3);
  });
});

// ─── Steps on a stub context ──────────────────────────────────────────────────

/** A context whose inventory is seeded (A's pattern); `entries` are the 2026 captures, the last segment's first capture is entries[0]. */
function seededCtx({ load, entries, rehearse = true, write = false, runDate = '2027-01-15' }) {
  const ctx = makeContext({ load, rehearse, write, runDate });
  ctx.stamp = 'REHEARSAL — partial season (weeks 1–6)';
  ctx.shared.inventory = {
    entries, kDate: null, kPrevDate: null,
    segments: [{ id: 'L6', boundary: '10', first: entries[0]?.date ?? null, last: entries.at(-1)?.date ?? null, n: entries.length, captures: entries }],
  };
  return ctx;
}

describe('stepRos on stubs (§6.1)', () => {
  const snap = fx('snap-2026-10-06.json');
  const ids = Object.keys(snap.players);
  const weekly = Object.fromEntries(range(1, 6).map(w => [String(w), 7]));
  const totals = Object.fromEntries([
    ...ids.map(id => ({ id, row: { weeklyStatus: ['P', 'P', 'P', 'P', 'P', 'P', ...new Array(12).fill(null)], weeklyPoints: weekly, weeklyStats: Object.fromEntries(range(1, 6).map(w => [String(w), { rec: 7 }])), stats: { rec: 42 }, fantasyPoints: 42, gamesPlayed: 6, scoringBasis: 'half_ppr' } })).map(({ id, row }) => [id, row]),
    ['TEAM_AAA', { weeklyStatus: [], stats: {}, fantasyPoints: 0, gamesPlayed: 0 }],
  ]);
  const teams = [...new Set(Object.values(snap.players).map(p => p.nfl_team).filter(Boolean))];
  const schedule = { games: range(1, 17).flatMap(w => teams.map(t => ({ gameType: 'REG', week: w, homeTeam: normalizeTeamForSchedule(t), awayTeam: 'OPP' }))) };
  const load = {
    loadSnapshot: () => snap, listSnapshotDates: () => [], loadSeasonTotals: (y) => (y === 2026 ? totals : null),
    loadSchedule: () => schedule, loadRoster: () => ({ players: {} }),
    loadPositionOf: () => (id) => (snap.players[id]?.inSeason?.start ? 'QB' : 'WR'),
  };
  const entries = [{ date: '2026-10-06', capturedAt: '2026-10-06T21:07:01Z', targetSeason: 2026 }];

  test('c = 4 picks the 10-06 capture (late: inside the window at 06:00Z close → ok), c = 1, 2 are listed, later checkpoints are no-capture; the stamp opens the section; data carries the aggregates under the step id', async () => {
    const ctx = seededCtx({ load, entries });
    const r = await step('ros').run(ctx);
    assert.equal(r.section.id, 'ros');
    assert.equal(r.section.placement, 'main');
    assert.ok(r.section.md.startsWith('**REHEARSAL — partial season (weeks 1–6)**'));
    const byC = Object.fromEntries(r.section.data.checkpoints.map(c => [c.c, c]));
    assert.equal(byC[1].status, 'no-inSeason-capture');
    assert.equal(byC[2].status, 'no-inSeason-capture');
    assert.equal(byC[4].date, '2026-10-06');
    assert.equal(byC[4].status, 'ok');
    assert.equal(byC[7].status, 'no-capture');
    assert.ok(byC[4].start.QB.n >= 5, '(b) QB start rows graded on the team-game basis');
    assert.match(r.section.md, /split degenerate: all rows priorSource live/);
    assert.equal(r.section.data.scoredRows, ids.length, 'TEAM_* rows are not counted');
    assert.deepEqual(r.artifacts, []);
  });

  test('null guard 5: no capture in the last veteran segment raises through the helper (re-throws unless the real --write run)', async () => {
    const ctx = seededCtx({ load, entries: [] });
    await assert.rejects(() => step('ros').run(ctx), /no capture in the last veteran segment/);
    const ctxW = seededCtx({ load, entries: [], rehearse: false, write: true });
    const r = await step('ros').run(ctxW);
    assert.deepEqual(r.section.data, { computed: false, error: 'no capture in the last veteran segment' });
    assert.match(r.section.md, /^\*\*⚠ NOT COMPUTED — ros: no capture in the last veteran segment\*\*/);
  });
});

describe('games-l6 and override on the 10-22 capture (§6.2–§6.4)', () => {
  const snap = fx('snap-2026-10-22.json');
  const WR_FILL = Array.from({ length: 60 }, (_, i) => `wr${i}`);
  const QB_FILL = Array.from({ length: 39 }, (_, i) => `qb${i}`);
  // 2025 fantasy points: 421 (crosswalk WR) is WR #50 → rel3 (WR top 84); 19 (crosswalk QB) is QB #40 → not rel3 (QB top 32)
  const fp25 = {};
  WR_FILL.slice(0, 49).forEach((id, i) => { fp25[id] = { fantasyPoints: 1000 - i * 5 }; });
  fp25['421'] = { fantasyPoints: 700 };
  WR_FILL.slice(49).forEach((id, i) => { fp25[id] = { fantasyPoints: 600 - i }; });
  QB_FILL.forEach((id, i) => { fp25[id] = { fantasyPoints: 900 - i * 5 }; });
  fp25['19'] = { fantasyPoints: 10 };
  const totals = {
    2023: {}, 2024: {}, 2025: fp25,
    2026: { 19: { gamesPlayed: 6, weeklyStatus: ['P', 'P', 'P', 'P', 'P', 'P'] }, 827: { gamesPlayed: 1, weeklyStatus: ['P', null, null, null, null, null] }, 421: { gamesPlayed: 6, weeklyStatus: ['P', 'P', 'P', 'P', 'P', 'P'] }, 260: { gamesPlayed: 2, weeklyStatus: ['P', 'P'] } },
  };
  const xw = { g19: { sleeperId: '19', position: 'QB' }, g827: { sleeperId: '827', position: 'QB' }, g829: { sleeperId: '829', position: 'QB' }, g421: { sleeperId: '421', position: 'WR' } };
  WR_FILL.forEach(id => { xw[id] = { sleeperId: id, position: 'WR' }; });
  QB_FILL.forEach(id => { xw[id] = { sleeperId: id, position: 'QB' }; });
  const load = {
    loadSnapshot: () => snap, listSnapshotDates: () => [], loadSeasonTotals: (y) => totals[y] ?? null,
    loadPlayerIds: () => ({ ids: xw, bySleeper: {} }),
  };
  const entries = [{ date: '2026-10-22', capturedAt: '2026-10-22T12:00:00Z', targetSeason: 2026 }];
  function ctxWithVet() {
    const ctx = seededCtx({ load, entries });
    ctx.shared.P = { 19: 'QB', 827: 'QB', 829: 'WR', 421: 'QB', 260: 'QB', imp1: 'WR', drp1: 'WR' };
    ctx.shared.S = { 19: '2026-10-22', 827: '2026-10-22', 829: '2026-10-22', 421: '2026-10-22', 260: '2026-10-22' };
    ctx.shared.replay = { R: { imp1: { p: 1, G: 1, T: 1, imputed: true } }, K: {} };
    return ctx;
  }

  test('rows come from S(i): imputed, dropped and missingField are counted separately and excluded; cells by state and rel3 use the crosswalk position', async () => {
    const r = await step('games-l6').run(ctxWithVet());
    const d = r.section.data;
    assert.equal(d.graded, true);
    assert.deepEqual(d.excluded, { imputed: 1, dropped: 1, missingField: 1, rel3NoPosition: 0 });   // 260 is a rookie row (base null)
    assert.equal(d.byState.short.n, 2);
    assert.equal(d.byState.qual.n, 2);
    // short: 827 (L6c 5, base 11, realised 1) and 829 (5, 10, realised 0, no 2026 row → 0)
    assert.equal(d.byState.short.mae.l6c, 4.5);
    assert.equal(d.byState.short.mae.base, 10);
    assert.equal(d.byState.short.delta.mean, -5.5);
    assert.equal(d.byState.short.delta.label, 'insufficient', `fewer than ${L6_MIN} rows`);
    assert.equal(d.rel3.n, 1, 'only 421 (crosswalk WR #50 ≤ 84) is rel3; 19 (crosswalk QB #40 > 32) is not, whatever P says');
    assert.match(r.section.md, /^\*\*REHEARSAL/);
  });
  test('without vet-calibration the step returns normally with graded: false (not a throw)', async () => {
    const ctx = seededCtx({ load, entries });
    for (const id of ['games-l6', 'override']) {
      const r = await step(id).run(ctx);
      assert.equal(r.section.data.graded, false);
      assert.match(r.section.data.reason, /needs vet-calibration/);
    }
  });
  test('override: inSeasonCheck row shape (S 2025, sState, star = rel3, p.SOf0 = projectedGames, p.C0 = projectedGamesBase), the rule verbatim, exclusions counted', async () => {
    const r = await step('override').run(ctxWithVet());
    const d = r.section.data;
    assert.equal(d.graded, true);
    assert.deepEqual(d.excluded, { imputed: 1, dropped: 1, missingField: 1, rel3NoPosition: 0 });
    assert.deepEqual(d.check.checkpoints, [1, 2, 4, 6, 8, 10, 12]);
    assert.equal(d.check.inSeasonRule, 'preseason-only');
    // 827 played only week 1 (healthy at w = 1, n = 1): cut = max(0, 5 − 1) − 0 = 4, base = max(0, 11 − 1) − 0 = 10
        assert.equal(d.check.noRow, 1, '829 has no 2026 row: counted noRow, not scored');
    assert.equal(d.check.groups.healthy[1].n, 1, 'only 827 is a non-qualifying row healthy at w = 1');
    assert.equal(d.check.groups.healthy[1].cut.mae, 4);
    assert.equal(d.check.groups.healthy[1].base.mae, 10);
  });
  test('§6.4: `next` blocks are counted per position on the checkpoint captures even when graded: false', async () => {
    const snapNext = fx('snap-2026-10-06.json');
    const ids = Object.keys(snapNext.players);
    const ld = { ...load, loadSnapshot: () => snapNext, loadPositionOf: () => () => 'WR', loadRoster: () => ({ players: {} }) };
    const ctx = seededCtx({ load: ld, entries: [{ date: '2026-10-06', capturedAt: '2026-10-06T21:07:01Z', targetSeason: 2026 }] });
    const r = await step('override').run(ctx);
    assert.equal(r.section.data.graded, false);
    const withNext = ids.filter(id => snapNext.players[id].inSeason?.next).length;
    const c4 = r.section.data.nextCounts[4];
    assert.equal(c4.QB + c4.RB + c4.WR + c4.TE + c4.UNK, withNext);
    assert.ok(c4.WR > 0 && c4.QB > 0, 'positions come from the capture\'s own position source');
    assert.equal(r.section.data.nextCounts[4].date, '2026-10-06');
  });
});

// ─── D-60, listed ─────────────────────────────────────────────────────────────

describe('d60 and listed', () => {
  test('stepD60 returns { counted: false, reason } and never throws; its exit contribution is 0', async () => {
    const r = await runSeasonGrade({ steps: [step('d60'), step('listed')], load: {}, rehearse: true });
    assert.equal(r.exitCode, 0);
    const d60 = r.results.find(x => x.id === 'd60').section.data;
    assert.equal(d60.counted, false);
    assert.match(d60.reason, /inProgress until Sleeper's post-Super-Bowl rollover; recount then/);
    assert.deepEqual(r.results.find(x => x.id === 'listed').section.data, { items: ['D-79', 'D-80', 'D-85'] });
  });
  test('--only games-l6 with --rehearse and no vet-calibration: graded: false and exit 0', async () => {
    const load = { loadSchedule: () => ({ games: [] }), loadSeasonTotals: () => ({}), loadManifest: () => ({ files: {} }) };
    const r = await runSeasonGrade({ only: ['games-l6'], rehearse: true, load });
    assert.equal(r.exitCode, 0);
    assert.equal(r.results.find(x => x.id === 'games-l6').section.data.graded, false);
  });
});

// ─── The no-throw rule (§10a) ─────────────────────────────────────────────────

describe('degradeOrThrow (§10a), exercised through a B step', () => {
  const boom = { listSnapshotDates: () => { throw new Error('forced B throw'); } };
  const ros = step('ros');

  test('ctx.write true and not rehearsing → degrades to a computed:false section with the banner first; artifacts []', async () => {
    const ctx = makeContext({ load: boom, write: true, rehearse: false });
    const r = await ros.run(ctx);
    assert.deepEqual(r.section.data, { computed: false, error: 'forced B throw' });
    assert.ok(r.section.md.startsWith('**⚠ NOT COMPUTED — ros: forced B throw**'));
    assert.deepEqual(r.artifacts, []);
  });
  test('ctx.write false → re-throws; ctx.write true with ctx.rehearse true → re-throws', async () => {
    await assert.rejects(() => ros.run(makeContext({ load: boom, write: false, rehearse: false })), /forced B throw/);
    await assert.rejects(() => ros.run(makeContext({ load: boom, write: true, rehearse: true })), /forced B throw/);
  });
  test('a rehearse run with a forced B throw gives exit code 1', async () => {
    const r = await runSeasonGrade({ steps: [ros], rehearse: true, load: boom });
    assert.equal(r.exitCode, 1);
    assert.match(r.verdict, /Step `ros` FAILED:\*\* forced B throw/);
  });
  test('--write --rehearse with a forced B throw gives exit code 1 and writes nothing (approved fix, 2026-10-25)', async () => {
    const { out, written } = await noWrites(() => runSeasonGrade({ steps: [ros], rehearse: true, write: true, load: boom }));
    assert.equal(out.exitCode, 1);
    assert.deepEqual(out.artifacts, []);
    assert.deepEqual(written, []);
  });
  test('a non-Error throw (`throw undefined`) degrades on a real write with error \'undefined\'', async () => {
    const odd = { listSnapshotDates: () => { throw undefined; } };   // eslint-disable-line no-throw-literal
    const r = await ros.run(makeContext({ load: odd, write: true, rehearse: false }));
    assert.deepEqual(r.section.data, { computed: false, error: 'undefined' });
    assert.ok(r.section.md.startsWith('**⚠ NOT COMPUTED — ros: undefined**'));
  });
  test('the real --write run with a forced B throw degrades: exit 0, A\'s aggregate is still written, steps[].data carries computed:false under the step id', async () => {
    const { out, written } = await noWrites(() => runSeasonGrade({ steps: [ros], write: true, runDate: '2027-01-15', load: boom }));
    assert.equal(out.exitCode, 0);
    assert.ok(written.some(p => p.endsWith('backtests/2027-01-15-season-grade.json')), 'the aggregate was written');
    assert.deepEqual(out.data.steps.find(s => s.id === 'ros').data, { computed: false, error: 'forced B throw' });
  });
});

// ─── stepRookie on a memLoad world with a 2026 entrant ────────────────────────

/** memLoad plus a 2026 season and a 2026 entrant (p3, WR, drafted 2026 round 5). */
function memLoad2026() {
  const base = memLoad();
  const ids = base.loadPlayerIds();
  const seasons2026 = { p3: { fantasyPoints: 40, gamesPlayed: 5, stats: { rec: 20, rec_yd: 200, rec_td: 1 } } };
  return {
    ...base,
    loadSeasonTotals: (y) => (y === 2026 ? seasons2026 : base.loadSeasonTotals(y)),
    loadPlayerIds: () => ({
      ids: { ...ids.ids, g3: { sleeperId: 'p3', position: 'WR' } },
      bySleeper: { ...ids.bySleeper, p3: { birthdate: '2004-03-01', draftYear: 2026, draftRound: 5, draftPick: 150, undrafted: false } },
    }),
    loadLeaguePositionOf: () => (pid) => ({ p1: 'WR', p2: 'RB', p3: 'WR' }[pid] ?? null),
  };
}

describe('stepRookie (§7)', () => {
  const F4 = { families: { F4: { constants: { totalFactor: { day3: 0.866, undrafted: 0.944 } } } } };
  const mkLoad = (over = {}) => {
    const m = memLoad2026();
    return { rookiePanelLoad: () => m, rookieTotalLoad: () => m, loadRookieLeagueConstants: () => F4, ...over };
  };
  const rookie = step('rookie');

  test('rehearse: runs both panels at entryToYear 2026, D-16 label + counts, D-75 reads the league factor from the constants file; writes nothing', async () => {
    const { out, written } = await noWrites(() => rookie.run(seededCtx({ load: mkLoad(), entries: [] })));
    assert.deepEqual(written, []);
    assert.deepEqual(out.artifacts, []);
    const p = out.section.data.parts;
    assert.equal(p['d16-half'].nDebut2026, 1);
    assert.equal(p['d16-half'].debutCounts['WR|day3'].played1to5, 1);
    assert.ok(['moved', 'within-fold-spread', 'insufficient'].includes(p['d16-half'].label));
    assert.equal(p['d16-half'].loco.classes, 2, 'only the classes present in the in-memory store (2020, 2026)');
    assert.match(out.section.md, /classes = 2 \(expected 14\)/, 'classes ≠ 14 prints rather than throws');
    assert.deepEqual(p.d75.league, { day3: 0.866, undrafted: 0.944 });
    assert.deepEqual(p.d75.shipped, { day3: 0.796, undrafted: 0.835 });
    assert.equal(p.d75.evaluated, 1);
    assert.equal(p.d75.arms.day3.label, 'insufficient', 'below 30 rows');
    assert.ok(out.section.md.startsWith('**REHEARSAL'));
  });
  test('D-16 (i) league counts: identical to half → one line, d16League.classCountsDiffer false', async () => {
    const { out } = await noWrites(() => rookie.run(seededCtx({ load: mkLoad(), entries: [] })));
    assert.match(out.section.md, /league class counts identical to half-PPR/);
    assert.equal(out.section.data.d16League.classCountsDiffer, false);
    assert.doesNotMatch(out.section.md, /Differing cells/);
  });
  test('D-16 (i) league counts: a differing league panel → the league table, the differing-cell line, classCountsDiffer true', async () => {
    const m = memLoad2026();
    // the league branch of runRookiePanels asks for loadLeaguePositionOf before its first read (the half branch never does),
    // so flipping there makes only the league panel see p3 at 12 games (a different games-based outcome class)
    let leagueSeen = false;
    const panel = {
      ...m,
      loadLeaguePositionOf: () => { leagueSeen = true; return m.loadLeaguePositionOf(); },
      loadSeasonTotals: (y) => (y === 2026 && leagueSeen ? { p3: { fantasyPoints: 120, gamesPlayed: 12, stats: { rec: 60, rec_yd: 600, rec_td: 4 } } } : m.loadSeasonTotals(y)),
    };
    const { out } = await noWrites(() => rookie.run(seededCtx({ load: mkLoad({ rookiePanelLoad: () => panel }), entries: [] })));
    const d = out.section.data;
    assert.equal(d.d16League.classCountsDiffer, true);
    assert.notDeepEqual(d.d16League.classCounts, d.parts['d16-half'].debutCounts);
    assert.match(out.section.md, /\(i, league\) 2026-class debut counts on the league panel/);
    assert.match(out.section.md, /Differing cells: .*WR \| day3/);
    assert.doesNotMatch(out.section.md, /identical to half-PPR/);
  });
  test('--write: both panels are written (unregistered) under the naming of writeRookieArtifacts; a failing write degrades as an artifact error (guard 3)', async () => {
    const ctx = seededCtx({ load: mkLoad(), entries: [], rehearse: false, write: true, runDate: '2027-01-15' });
    const { out, written } = await noWrites(() => rookie.run(ctx));
    assert.deepEqual(out.artifacts, [{ path: 'backtests/2027-01-15-rookie-panel.json', registered: false }, { path: 'backtests/2027-01-15-rookie-league-panel.json', registered: false }]);
    assert.equal(written.length, 2);
    // a failing writeFileSync degrades (write true, not rehearsing) …
    const ctx2 = seededCtx({ load: mkLoad(), entries: [], rehearse: false, write: true, runDate: '2027-01-15' });
    const w = fs.writeFileSync, m = fs.mkdirSync;
    fs.writeFileSync = () => { throw new Error('disk full'); }; fs.mkdirSync = () => {};
    let r2;
    try { r2 = await rookie.run(ctx2); } finally { fs.writeFileSync = w; fs.mkdirSync = m; }
    assert.deepEqual(r2.artifacts, []);
    assert.match(r2.section.md, /artifact backtests\/2027-01-15-rookie-panel\.json not computed — disk full/);
    assert.equal(r2.section.data.parts['d16-half'].nDebut2026, 1, 'the other parts are still reported');
  });
  test('null guard 2: rookiePanelLoad() throwing sits inside the D-16 half part (degrades in the real run, re-throws otherwise)', async () => {
    const load = mkLoad({ rookiePanelLoad: () => { throw new Error('no panel load'); } });
    await assert.rejects(() => rookie.run(seededCtx({ load, entries: [] })), /no panel load/);
    const { out } = await noWrites(() => rookie.run(seededCtx({ load, entries: [], rehearse: false, write: true })));
    assert.match(out.section.md, /D-16 \(half_ppr\) not computed — no panel load/);
    assert.equal(out.section.data.parts['d16-half'].computed, false);
  });
  test('null guard 4: a missing constants file and an incomplete F4 totalFactor raise their designed messages; the real run prints "D-75 not computed"', async () => {
    const missing = mkLoad({ loadRookieLeagueConstants: () => null });
    await assert.rejects(() => rookie.run(seededCtx({ load: missing, entries: [] })), /league constants file missing: backtests\/2026-10-17-rookie-league-constants\.json/);
    const incomplete = mkLoad({ loadRookieLeagueConstants: () => ({ families: { F4: { constants: { totalFactor: { day3: 0.9 } } } } }) });
    await assert.rejects(() => rookie.run(seededCtx({ load: incomplete, entries: [] })), /F4 totalFactor incomplete/);
    const { out } = await noWrites(() => rookie.run(seededCtx({ load: incomplete, entries: [], rehearse: false, write: true })));
    assert.match(out.section.md, /D-75 not computed — F4 totalFactor incomplete/);
    assert.equal(out.section.data.parts.d75.computed, false);
    assert.ok(out.section.data.parts['d16-half'].ceiling, 'D-16 is still reported');
  });
});

// ─── Byte-identity of the two adapter parameters (§11, Flag 4/5) ──────────────

describe('adapter byte-identity against the pre-edit golden', () => {
  const golden = fx('rookie-golden-pre-b.json');
  const strip = (r) => { const o = J(r); if (o.meta) delete o.meta.generatedAt; return o; };

  test('runRookiePanels default and the explicit entryToYear 2025 both equal the golden (half_ppr and league)', () => {
    assert.deepStrictEqual(strip(runRookiePanels({ load: memLoad() })), golden.panelsHalf);
    assert.deepStrictEqual(strip(runRookiePanels({ load: memLoad(), entryToYear: 2025 })), golden.panelsHalf);
    assert.deepStrictEqual(strip(runRookiePanels({ load: memLoad(), basis: 'league' })), golden.panelsLeague);
    assert.deepStrictEqual(strip(runRookiePanels({ load: memLoad(), basis: 'league', entryToYear: 2025 })), golden.panelsLeague);
  });
  test('runRookieTotal with evaluateTargetSeason omitted and null both equal the golden and carry no `evaluate` key', () => {
    const args = () => ({ load: leagueStub([rookieRow()]), basis: 'league', panelPath: 'p.json' });
    const omitted = runRookieTotal(args());
    const nulled = runRookieTotal({ ...args(), evaluateTargetSeason: null });
    assert.deepStrictEqual(strip(omitted), golden.rookieTotalLeague);
    assert.deepStrictEqual(strip(nulled), golden.rookieTotalLeague);
    assert.ok(!('evaluate' in omitted) && !('evaluate' in nulled));
  });
  test('growth: entryToYear 2026 adds the 2026 entrant to debut and rookiePathAll and sets meta.entryYears.toYear', () => {
    const base = runRookiePanels({ load: memLoad2026() });
    const grown = runRookiePanels({ load: memLoad2026(), entryToYear: 2026 });
    assert.deepEqual(base.meta.entryYears, { fromYear: 2013, toYear: 2025 });
    assert.deepEqual(grown.meta.entryYears, { fromYear: 2013, toYear: 2026 });
    for (const k of ['debut', 'rookiePathAll']) {
      const has = (r) => r.rows.some(x => x.sleeperId === 'p3' && x.targetSeason === 2026 || x.pid === 'p3' && x.outcomeYear === 2026);
      assert.equal(has(base[k]), false, `${k} (default)`);
      assert.equal(has(grown[k]), true, `${k} (2026)`);
    }
  });
  test('evaluate rows: evaluateTargetSeason 2026 returns exactly the target-2026 rows with the composed legacy predTotal', () => {
    const rows = [rookieRow(), rookieRow({ sleeperId: 'w1', targetSeason: 2026, outcomeGames: 3, outcomeTotalPts: 12 })];
    const load = leagueStub(rows);
    const r = runRookieTotal({ load, basis: 'league', panelPath: 'p.json', evaluateTargetSeason: 2026 });
    assert.equal(r.evaluate.targetSeason, 2026);
    assert.equal(r.evaluate.rows.length, 1);
    const scale = basisScaleOf(leagueBasisLoad(load, leagueLoadArgs(load)), 2026, 'WR');
    const expected = composeRookieRow(rows[1], 2020 - 1998, { basisScale: scale });
    assert.deepEqual(Object.keys(r.evaluate.rows[0]).sort(), ['draftGroup', 'outcomeGames', 'outcomeTotalPts', 'position', 'predPPG', 'predTotal', 'sleeperId']);
    assert.equal(r.evaluate.rows[0].predTotal, expected.predTotal);
    assert.equal(r.evaluate.rows[0].outcomeTotalPts, 12);
    assert.deepEqual(strip({ ...r, evaluate: undefined }).bias.all.n, 2, 'every other field still covers all rows');
  });
});

// ─── The registry ─────────────────────────────────────────────────────────────

describe('registry and help', () => {
  test('STEPS holds the ten ids in order and --only accepts the six B ids', async () => {
    assert.deepEqual(STEPS.map(s => s.id), ['season-gate', 'inventory', 'd44', 'vet-calibration', 'ros', 'games-l6', 'override', 'rookie', 'd60', 'listed']);
    const load = { loadSchedule: () => ({ games: [] }), loadSeasonTotals: () => ({}), loadManifest: () => ({ files: {} }) };
    for (const id of ['d60', 'listed']) assert.equal((await runSeasonGrade({ only: [id], rehearse: true, load })).exitCode, 0);
  });
  test('the minimum-sample pins are the pre-registered ones', () => {
    assert.deepEqual([ROS_MIN, L6_MIN, D75_MIN], [30, 20, 30]);
  });
});
