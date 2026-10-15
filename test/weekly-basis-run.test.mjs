import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runWeeklyBasis, appRatio, pct, evaluateCriteria, buildVerdictMarkdown, DECISION_TEXT } from '../scripts/weekly-basis-run.mjs';

const ws = (o = {}) => Array.from({ length: 18 }, (_, i) => o[i + 1] ?? 'X');
const SS = { rec: 1, rec_yd: 0.1, bonus_fd_wr: 0.5 };

// Two-week WR; week 2 carries a duplicate entry (first-seen must win in both T and fresh).
const weekData = [
  { week: 1, entries: [{ player_id: 'w', team: 'KC', stats: { gp: 1, rec: 5, rec_yd: 50, rec_fd: 2, pts_half_ppr: 10 } }] },
  { week: 2, entries: [
    { player_id: 'w', team: 'KC', stats: { gp: 1, rec: 3, rec_yd: 30, rec_fd: 1, pts_half_ppr: 6 } },
    { player_id: 'w', team: 'KC', stats: { gp: 1, rec: 99, rec_yd: 999, pts_half_ppr: 99 } },
  ] },
];
const stored = {
  w: {
    stats: { gp: 2, rec: 8, rec_yd: 80, rec_fd: 3, pts_half_ppr: 16 }, team: 'KC', gamesPlayed: 2, gamesStarted: 0,
    byeWeeks: 0, dnpWeeks: 0, weeklyPoints: { 1: 10, 2: 6 }, weeklyStatus: ws({ 1: 'P', 2: 'P' }),
    fantasyPoints: 16, scoringBasis: 'half_ppr', availability: {},
  },
};
const load = (over = {}) => ({
  readStored: () => stored,
  readSnapshot: () => ({ scoringSettings: SS }),
  readPlayers: () => ({ w: { position: 'WR' } }),
  fetchWeeks: async () => weekData,
  ...over,
});

test('appRatio — the app\'s undefined-ratio rules', () => {
  assert.equal(appRatio(20, 10), 2);
  assert.equal(appRatio(0, 0), 1);
  assert.equal(appRatio(5, 0), null);
  assert.equal(appRatio(5, -1), null);
  assert.equal(appRatio(5, NaN), null);
});

test('pct — nearest rank', () => {
  assert.equal(pct([], 0.5), null);
  assert.equal(pct([4, 1, 3, 2], 0.5), 2);
  assert.equal(pct([4, 1, 3, 2], 0.99), 4);
});

test('runWeeklyBasis — A is exact (first-seen, derived first downs), B is the ratio heuristic', async () => {
  const panel = await runWeeklyBasis({ weeksCache: '/x', seasons: [2020], load: load() });
  // 2020-style (no bonus_fd_*): deriveFirstDowns → T week1 = 5 + 5 + 2*.5 = 11, week2 = 3 + 3 + .5 = 6.5
  assert.equal(panel.overall.A.n, 2);
  assert.equal(panel.overall.A.absMax, 0);
  assert.equal(panel.overall.A.shareWithinTol, 1);
  // season scored = 8 + 8 + 1.5 = 17.5, ratio 17.5/16 → B = 10.94, 6.56 → errors .06, .06
  assert.ok(Math.abs(panel.overall.B.absMax - 0.06) < 1e-9);
  assert.equal(panel.coverage[2020].covered, 1);
  assert.equal(panel.seasonSumCheck.share, 1);
  assert.equal(panel.byPosition.WR.A.n, 2);
});

test('runWeeklyBasis — a refused row scores as B and is counted under its reason', async () => {
  const bad = { w: { ...stored.w, weeklyPoints: { 1: 10, 2: 7 } } };   // fresh half-PPR says 6 → 'points'
  const panel = await runWeeklyBasis({ weeksCache: '/x', seasons: [2020], load: load({ readStored: () => bad }) });
  assert.equal(panel.coverage[2020].covered, 0);
  assert.equal(panel.coverage[2020].omitted.points, 1);
  assert.deepStrictEqual(panel.overall.A, panel.overall.B);
});

test('runWeeklyBasis — a failed week, a missing cache dir and a missing raw entry all throw', async () => {
  await assert.rejects(runWeeklyBasis({ seasons: [2020], load: load() }), /--weeks-cache/);
  await assert.rejects(
    runWeeklyBasis({ weeksCache: '/x', seasons: [2020], load: load({ fetchWeeks: async () => [{ week: 1, entries: [], failed: true }] }) }),
    /failed to fetch/,
  );
  await assert.rejects(
    runWeeklyBasis({ weeksCache: '/x', seasons: [2020], load: load({ fetchWeeks: async () => [weekData[0]] }) }),
    /no raw entry for played week 2/,
  );
});

test('evaluateCriteria — each pre-registered criterion fails independently; verdict names it', async () => {
  const base = await runWeeklyBasis({ weeksCache: '/x', seasons: [2020], load: load() });
  const clone = () => JSON.parse(JSON.stringify(base));
  const failing = p => evaluateCriteria(p).filter(c => !c.pass).map(c => c.id);
  assert.deepStrictEqual(failing(base), ['b']);   // tiny fixture: B error 0.06 on ~11 pts is 0.5% < 1%
  const p = clone();
  p.overall.B.relMedian = 0.05;
  assert.deepStrictEqual(failing(p), []);
  let q = clone(); q.overall.B.relMedian = 0.05; q.overall.A.shareWithinTol = 0.99; assert.deepStrictEqual(failing(q), ['a']);
  q = clone(); q.overall.B.relMedian = 0.05; q.overall.A.absP99 = 0.06; assert.deepStrictEqual(failing(q), ['a']);
  q = clone(); q.overall.B.relMedian = 0.05; q.coverage[2020].share = 0.9; assert.deepStrictEqual(failing(q), ['c']);
  q = clone(); q.overall.B.relMedian = 0.05; q.seasonSumCheck.share = 0.9; assert.deepStrictEqual(failing(q), ['d']);
  q = clone(); q.overall.B.relMedian = 0.05; q.size[2020].gzAdded = 401 * 1024; assert.deepStrictEqual(failing(q), ['e']);
});

test('buildVerdictMarkdown — the pre-registered decision precedes the verdict', async () => {
  const panel = await runWeeklyBasis({ weeksCache: '/x', seasons: [2020], load: load() });
  const md = buildVerdictMarkdown(panel, { date: '2026-10-15' });
  assert.ok(md.indexOf('Pre-registered decision') < md.indexOf('## Verdict'));
  assert.ok(md.includes(DECISION_TEXT[1]));
  assert.ok(md.includes('same Sleeper API'));
});

test('runWeeklyBasis — A is computed from the exclusion-filtered weeklyScoringStats, not the raw stats', async () => {
  // off_snp is an EXCLUDED key (_snp suffix) present and non-zero in raw week 1; scoring settings score it at 1/pt.
  const wd = [
    { week: 1, entries: [{ player_id: 'w', team: 'KC', stats: { gp: 1, rec: 5, rec_yd: 50, rec_fd: 2, off_snp: 7, pts_half_ppr: 10 } }] },
    weekData[1],
  ];
  const l = load({ readSnapshot: () => ({ scoringSettings: { ...SS, off_snp: 1 } }), fetchWeeks: async () => wd });
  const panel = await runWeeklyBasis({ weeksCache: '/x', seasons: [2020], load: l });
  // T week 1 = 11 + 7 (off_snp counted); A week 1 = 11 (excluded key dropped); week 2 unaffected.
  assert.equal(panel.overall.A.n, 2);
  assert.ok(Math.abs(panel.overall.A.absMax - 7) < 1e-9, `A−T on the week must be exactly the excluded key's 7 pts, got ${panel.overall.A.absMax}`);
  assert.equal(panel.overall.A.shareWithinTol, 0.5);   // week 1 out of the 0.011 tolerance, week 2 within
});
