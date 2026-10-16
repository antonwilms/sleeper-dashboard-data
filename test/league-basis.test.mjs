/**
 * test/league-basis.test.mjs — D-46 `league` scoring-basis model (lib/leagueBasis.mjs), in-memory fixtures only
 * (Invariant 10: never the newest capture, never a path a workflow writes).
 *
 * (a) the rescore port against hand cases; (b) exact vs scaled weeks and the two undefined-ratio rules;
 * (c) idempotence and no mutation; (d) reconstructPositionBasisScale; (e) app-parity drift tripwire by text
 * (REGISTRY_MIRROR=1 only); (f) a half_ppr load is not wrapped. T-RM1's closure (test/rookie-mirror.test.mjs)
 * proves lib/leagueBasis.mjs never reaches lib/rookieMirror.mjs.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  SCORING_BASIS_MODELS, CURRENT_FIT_BASIS_MODEL, MIN_BASIS_SCALE_ROWS,
  rescoreSeasonRowsLeague, reconstructPositionBasisScale, leagueBasisLoad, basisScaleOf,
} from '../lib/leagueBasis.mjs';
import { loadFactorInputs, resolveScoring, DEFAULT_LOAD } from '../scripts/panel-run.mjs';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const appDir = path.resolve(repoRoot, '..', 'sleeper-dashboard');

// A small league: 1 pt/rec, 0.5 per rec first down for WR, 0.1/rush yd, td 6; K scores 3 per fg 0-19, rate keys ignored.
const SETTINGS = { rec: 1, rec_yd: 0.1, rec_td: 6, bonus_fd_wr: 0.25, rush_yd: 0.1, fgm_0_19: 3, cmp_pct: 5 };
const posOf = (m) => (pid) => m[pid] ?? null;

describe('(a) the rescore port against hand cases', () => {
  test('a row-set with no bonus_fd_* derives first downs for a WR, never for a K', () => {
    const rows = {
      wr: { fantasyPoints: 10, gamesPlayed: 1, scoringBasis: 'half_ppr', stats: { rec: 4, rec_yd: 50, rec_fd: 2 }, weeklyPoints: { 1: 10 } },
      k:  { fantasyPoints: 3, gamesPlayed: 1, scoringBasis: 'half_ppr', stats: { fgm_0_19: 1, rec_fd: 9 }, weeklyPoints: { 1: 3 } },
    };
    const out = rescoreSeasonRowsLeague(rows, SETTINGS, posOf({ wr: 'WR', k: 'K' }));
    assert.equal(out.wr.fantasyPoints, 4 + 5 + 0.5);   // rec 4 + yd 5 + 2 fd × 0.25
    assert.equal(out.k.fantasyPoints, 3);
    assert.equal(out.wr.scoringBasis, 'league');
    assert.equal(out.wr.sourceScoringBasis, 'half_ppr');
    assert.equal(out.wr.sourceFantasyPoints, 10);
    assert.deepEqual(out.wr.sourceWeeklyPoints, { 1: 10 });
  });

  test('a 2023-style row-set (any bonus_fd_* key) keeps the served bonus_fd_wr and derives nothing', () => {
    const rows = {
      wr: { fantasyPoints: 10, gamesPlayed: 1, stats: { rec: 4, bonus_fd_wr: 1, rec_fd: 40 } },
      other: { fantasyPoints: 0, gamesPlayed: 0, stats: { bonus_fd_wr: 0 } },
    };
    const out = rescoreSeasonRowsLeague(rows, SETTINGS, posOf({ wr: 'WR' }));
    assert.equal(out.wr.fantasyPoints, 4 + 0.25);
  });

  test('NON_ADDITIVE_KEYS (cmp_pct) are not scored even when the league lists them', () => {
    const rows = { wr: { fantasyPoints: 4, gamesPlayed: 1, stats: { rec: 4, cmp_pct: 70, bonus_fd_wr: 0 } } };
    assert.equal(rescoreSeasonRowsLeague(rows, SETTINGS, posOf({ wr: 'WR' })).wr.fantasyPoints, 4);
  });

  test('null/undefined rows and empty or null settings return the input untouched', () => {
    const rows = { a: { fantasyPoints: 1 } };
    assert.equal(rescoreSeasonRowsLeague(null, SETTINGS, posOf({})), null);
    assert.equal(rescoreSeasonRowsLeague(rows, null, posOf({})), rows);
    assert.equal(rescoreSeasonRowsLeague(rows, {}, posOf({})), rows);
  });

  test('TEAM_ rows are rescored like any other (no skip, as in the app)', () => {
    const rows = { TEAM_BUF: { fantasyPoints: 7, gamesPlayed: 17, stats: { rec: 3, bonus_fd_wr: 0 } } };
    const out = rescoreSeasonRowsLeague(rows, SETTINGS, posOf({}));
    assert.equal(out.TEAM_BUF.scoringBasis, 'league');
    assert.equal(out.TEAM_BUF.fantasyPoints, 3);
  });
});

describe('(b) exact weeks, scaled fallback and the undefined-ratio rules', () => {
  const base = (over) => ({
    fantasyPoints: 20, gamesPlayed: 2, scoringBasis: 'half_ppr',
    stats: { rec: 6, rec_td: 1, bonus_fd_wr: 0 },
    weeklyPoints: { 1: 8, 2: 12 },
    weeklyStats: { 1: { rec: 2, rec_td: 1 }, 2: { rec: 4 } },
    ...over,
  });

  test('weeklyStats summing to the season (gate 0.005n + 0.01) → exact weeks', () => {
    const out = rescoreSeasonRowsLeague({ a: base() }, SETTINGS, posOf({ a: 'WR' })).a;
    assert.equal(out.weeklyPointsMethod, 'exact');
    assert.deepEqual(out.weeklyPoints, { 1: 8, 2: 4 });
    assert.equal(out.fantasyPoints, 12);
  });

  test('a week missing a scored key breaks the season-sum gate → scaled by league/served ratio, 2 dp', () => {
    const row = base({ weeklyStats: { 1: { rec: 2 }, 2: { rec: 4 } } });
    const out = rescoreSeasonRowsLeague({ a: row }, SETTINGS, posOf({ a: 'WR' })).a;
    assert.equal(out.weeklyPointsMethod, 'scaled');
    const ratio = 12 / 20;
    assert.deepEqual(out.weeklyPoints, { 1: Math.round(8 * ratio * 100) / 100, 2: Math.round(12 * ratio * 100) / 100 });
  });

  test('array weeklyPoints take the scaled branch even with weeklyStats', () => {
    const row = base({ weeklyPoints: [8, 12] });
    const out = rescoreSeasonRowsLeague({ a: row }, SETTINGS, posOf({ a: 'WR' })).a;
    assert.equal(out.weeklyPointsMethod, 'scaled');
    assert.deepEqual(out.weeklyPoints, [4.8, 7.2]);
  });

  test('undefined-ratio rules: source 0 and scored 0 → ratio 1; source <= 0 otherwise → null weeks', () => {
    const zero = { fantasyPoints: 0, gamesPlayed: 1, stats: { bonus_fd_wr: 0 }, weeklyPoints: { 1: 0 } };
    const z = rescoreSeasonRowsLeague({ a: zero }, SETTINGS, posOf({ a: 'WR' })).a;
    assert.deepEqual(z.weeklyPoints, { 1: 0 });
    assert.equal(z.weeklyPointsMethod, 'scaled');
    const neg = { fantasyPoints: -2, gamesPlayed: 1, stats: { rec: 3, bonus_fd_wr: 0 }, weeklyPoints: { 1: -2 } };
    const n = rescoreSeasonRowsLeague({ a: neg }, SETTINGS, posOf({ a: 'WR' })).a;
    assert.deepEqual(n.weeklyPoints, { 1: null });
    assert.equal(n.fantasyPoints, 3);
  });

  test('weeklyPoints absent → method null, weeklyPoints undefined kept; non-finite source → sourceFantasyPoints null', () => {
    const out = rescoreSeasonRowsLeague({ a: { fantasyPoints: null, gamesPlayed: 1, stats: { rec: 2, bonus_fd_wr: 0 } } }, SETTINGS, posOf({})).a;
    assert.equal(out.weeklyPointsMethod, null);
    assert.equal(out.weeklyPoints, undefined);
    assert.equal(out.sourceFantasyPoints, null);
    assert.equal(out.sourceScoringBasis, null);
    assert.equal(out.sourceWeeklyPoints, null);
  });
});

describe('(c) idempotence and no mutation', () => {
  test('a rescored row passes through a second pass unchanged; the input is not mutated', () => {
    const rows = { a: { fantasyPoints: 20, gamesPlayed: 1, scoringBasis: 'half_ppr', stats: { rec: 6, bonus_fd_wr: 0 }, weeklyPoints: { 1: 20 }, weeklyStats: { 1: { rec: 6 } } } };
    const frozen = JSON.parse(JSON.stringify(rows));
    const once = rescoreSeasonRowsLeague(rows, SETTINGS, posOf({ a: 'WR' }));
    assert.deepEqual(rows, frozen, 'input untouched');
    assert.notEqual(once.a, rows.a);
    const twice = rescoreSeasonRowsLeague(once, SETTINGS, posOf({ a: 'WR' }));
    assert.equal(twice.a, once.a);
  });
});

describe('(d) reconstructPositionBasisScale', () => {
  const mk = (n, ratio, over = {}) => Array.from({ length: n }, (_, i) => ({
    gamesPlayed: 12, fantasyPoints: 100 * (typeof ratio === 'function' ? ratio(i) : ratio), sourceFantasyPoints: 100, sourceScoringBasis: 'half_ppr', ...over,
  }));
  const bySeason = (qbRows) => ({ 2020: Object.fromEntries(qbRows.map((r, i) => [`p${i}`, r])) });
  const allQb = (n) => (pid) => (pid.startsWith('p') && Number(pid.slice(1)) < n ? 'QB' : null);

  test('30 rows → median to 3 dp; 29 rows → 1', () => {
    assert.equal(MIN_BASIS_SCALE_ROWS, 30);
    const r30 = reconstructPositionBasisScale(bySeason(mk(30, 1.11449)), allQb(30));
    assert.equal(r30.QB, 1.114);
    const r29 = reconstructPositionBasisScale(bySeason(mk(29, 1.11449)), allQb(29));
    assert.equal(r29.QB, 1);
    assert.deepEqual([r30.RB, r30.WR, r30.TE], [1, 1, 1]);
  });

  test('gp 9 is excluded (the 30th row would otherwise reach the floor)', () => {
    const rows = [...mk(29, 1.2), ...mk(1, 1.2, { gamesPlayed: 9 })];
    assert.equal(reconstructPositionBasisScale(bySeason(rows), allQb(30)).QB, 1);
  });

  test('even-length median averages the middle pair', () => {
    const rows = mk(30, (i) => (i < 15 ? 1.1 : 1.3));
    assert.equal(reconstructPositionBasisScale(bySeason(rows), allQb(30)).QB, 1.2);
  });

  test('a live-api-sourced row (sourceScoringBasis not half_ppr) is excluded; non-skill positions never count', () => {
    const rows = [...mk(29, 1.2), ...mk(1, 1.2, { sourceScoringBasis: 'league' })];
    assert.equal(reconstructPositionBasisScale(bySeason(rows), allQb(30)).QB, 1);
    const asK = reconstructPositionBasisScale(bySeason(mk(40, 1.2)), () => 'K');
    assert.deepEqual(asK, { QB: 1, RB: 1, WR: 1, TE: 1 });
  });

  test('rows with a null source or non-positive sourceFantasyPoints are excluded', () => {
    const rows = [...mk(29, 1.2), ...mk(1, 1.2, { sourceFantasyPoints: 0 })];
    assert.equal(reconstructPositionBasisScale(bySeason(rows), allQb(30)).QB, 1);
  });
});

describe('leagueBasisLoad / basisScaleOf', () => {
  const rowsFor = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`p${i}`, {
    fantasyPoints: 100, gamesPlayed: 12, scoringBasis: 'half_ppr', stats: { rec: 100, bonus_fd_wr: 0 },
  }]));
  const positions = (pid) => (pid.startsWith('p') ? 'WR' : null);
  const load = { loadSeasonTotals: (y) => (y === 2012 || y === 2013 ? rowsFor(30) : y === 2014 ? rowsFor(30) : null), other: () => 'x' };
  const settings = { rec: 1.2, bonus_fd_wr: 0 };

  test('wraps loadSeasonTotals (null passes through), memoises, keeps other loaders, returns a wrapped load unchanged', () => {
    let reads = 0;
    const counting = { ...load, loadSeasonTotals: (y) => { reads++; return load.loadSeasonTotals(y); } };
    const w = leagueBasisLoad(counting, { scoringSettings: settings, positionOf: positions });
    assert.equal(w.loadSeasonTotals(2030), null);
    assert.equal(w.loadSeasonTotals(2012).p0.scoringBasis, 'league');
    const r = reads;
    assert.equal(w.loadSeasonTotals(2012), w.loadSeasonTotals(2012));
    assert.equal(reads, r, 'memoised per year');
    assert.equal(w.other(), 'x');
    assert.equal(leagueBasisLoad(w, { scoringSettings: {}, positionOf: () => null }), w, 'one shared instance');
    assert.equal(Object.keys(w).includes('basisScaleAsOf'), true);
  });

  test('basisScaleAsOf(S) is measured on 2012…S−1 only (the as-of rule, plan D4)', () => {
    const w = leagueBasisLoad(load, { scoringSettings: settings, positionOf: positions });
    assert.equal(basisScaleOf(w, 2013, 'WR'), 1.2, '2012 alone has 30 rows');
    assert.equal(basisScaleOf(w, 2012, 'WR'), 1, 'no season before 2012');
    // a season whose ratio differs only enters S after it
    const skew = { loadSeasonTotals: (y) => (y === 2012 ? rowsFor(30) : y === 2013 ? Object.fromEntries(Object.entries(rowsFor(31)).map(([k, v]) => [k, { ...v, stats: { rec: 200, bonus_fd_wr: 0 } }])) : null) };
    const ws = leagueBasisLoad(skew, { scoringSettings: settings, positionOf: positions });
    assert.equal(basisScaleOf(ws, 2013, 'WR'), 1.2);
    assert.equal(basisScaleOf(ws, 2014, 'WR'), 2.4, '61 rows: 31 × 2.4 and 30 × 1.2 → median 2.4');
  });

  test('(f) a half_ppr load is not wrapped and basisScaleOf returns 1', () => {
    assert.equal(basisScaleOf(load, 2026, 'QB'), 1);
    assert.equal(load.basisScaleAsOf, undefined);
    const { basisMeta, scoringSettings } = resolveScoring({ basis: 'half_ppr', load });
    assert.equal(basisMeta.type, 'half_ppr');
    assert.equal(scoringSettings, null);
  });
});

describe('panel-run basis `league`', () => {
  const stub = {
    ...DEFAULT_LOAD,
    loadLeagueScoring: () => ({ rec: 2, bonus_fd_wr: 0 }),
    loadLeaguePositionOf: () => () => 'WR',
    loadSeasonTotals: (y) => ({ a: { fantasyPoints: 5, gamesPlayed: 2, scoringBasis: 'half_ppr', stats: { rec: 5, bonus_fd_wr: 0 } } }),
    loadAdvstats: () => null, loadRoster: () => null, loadPlayerIds: () => null, loadSnapShare: () => null,
  };

  test('resolveScoring(league) names the fixture; loadFactorInputs scores outcomes from rescored rows and returns the wrapped load', () => {
    const rs = resolveScoring({ basis: 'league', load: stub });
    assert.deepEqual(rs.basisMeta, { type: 'league', scoringSource: 'test/fixtures/league-scoring-2026-10-14.json' });
    const inputs = loadFactorInputs({ fromYear: 2020, toYear: 2020, basis: 'league', load: stub });
    assert.equal(inputs.basisMeta.type, 'league');
    assert.equal(inputs.scoring.basis, 'half_ppr', 'outcomes come from the half-PPR builder over the wrapped rows');
    assert.equal(inputs.inputsByYear[2020].outcomes.get('a').actualTotalPts, 10);
    assert.equal(typeof inputs.load.basisScaleAsOf, 'function');
    assert.equal(loadFactorInputs({ fromYear: 2020, toYear: 2020, basis: 'league', load: inputs.load }).load, inputs.load);
    const half = loadFactorInputs({ fromYear: 2020, toYear: 2020, basis: 'half_ppr', load: stub });
    assert.equal(half.inputsByYear[2020].outcomes.get('a').actualTotalPts, 5);
    assert.equal(half.load, stub, 'half_ppr is not wrapped');
  });

  test('the committed scoring fixture is read from the repo and is the D-47 league settings', () => {
    const fx = JSON.parse(fs.readFileSync(path.join(repoRoot, 'test/fixtures/league-scoring-2026-10-14.json'), 'utf8'));
    assert.deepEqual(DEFAULT_LOAD.loadLeagueScoring(), fx);
    assert.deepEqual(SCORING_BASIS_MODELS, ['half_ppr', 'league']);
    assert.equal(CURRENT_FIT_BASIS_MODEL, 'half_ppr');
  });
});

// (e) app-parity by text — a drift tripwire, not a proof. Gated exactly like test/registry-mirror.test.mjs:
// runs only under REGISTRY_MIRROR=1 (never a folder-exists skip).
const mirrorMode = process.env.REGISTRY_MIRROR;
const mirrorOpts = { skip: mirrorMode === '1' ? false : 'REGISTRY_MIRROR not set — app parity-by-text not run. Run: REGISTRY_MIRROR=1 node --test test/league-basis.test.mjs' };

test('(e) the app rescore and the mirror carry the same gate and scale literals', mirrorOpts, () => {
  const appSrc = fs.readFileSync(path.join(appDir, 'src/api/sleeperStats.js'), 'utf8');
  const mirrorSrc = fs.readFileSync(path.join(repoRoot, 'lib/leagueBasis.mjs'), 'utf8');
  for (const literal of ['0.005 * n + 0.01', 'Math.round(v * ratio * 100) / 100']) {
    assert.ok(appSrc.includes(literal), `app src/api/sleeperStats.js no longer contains ${literal}`);
    assert.ok(mirrorSrc.includes(literal), `lib/leagueBasis.mjs no longer contains ${literal}`);
  }
  const appScale = fs.readFileSync(path.join(appDir, 'src/utils/dynastyScore.js'), 'utf8');
  assert.ok(appScale.includes('const MIN_BASIS_SCALE_ROWS = 30') && mirrorSrc.includes('MIN_BASIS_SCALE_ROWS = 30'));
});
