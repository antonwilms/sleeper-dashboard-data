/**
 * test/league-basis-run.test.mjs — D-46's graded harness (scripts/league-basis-run.mjs) on synthetic fixtures: the pre-registered
 * decision rule's truth table, the entry comparison, the dynasty structure check, G3's table, the CLI flag guards. The run itself
 * (`node bin/backtest.mjs --league-basis`) is a hand-run, never a test; T-RM16 / T-F10L (rookie-mirror / panel-fit tests) hold G1b/G1d.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

import {
  DECISION_RULE_MD, BASIS_INVARIANT_ENTRIES, SHIPPED_FILES, compareConstantsFiles, decideFile, dynStructure, specForStoreKey,
  twoACellResolver, dynCellResolver, g3Table, fitSummary, weeksMethodBySeason, modelOfCapture, checkRookieRows,
  slimRookieSnapshot, buildLeagueBasisVerdictMarkdown, runLeagueBasis,
} from '../scripts/league-basis-run.mjs';
import { SPEC } from '../scripts/inseason-run.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const run = (script, args) => spawnSync('node', [script, ...args], { cwd: REPO_ROOT, encoding: 'utf8' });

// rows for one cell (80 players × 4 checkpoints clears the 60-player / 300-row floor): prior 10, obs 14; the outcome decides which k is better
function cellRows({ outcome, players = 20, seasons = [2018, 2019, 2020, 2021] }) {
  const rows = [];
  for (const S of seasons) for (let p = 0; p < players; p++) for (let n = 1; n <= 4; n++) rows.push({ sleeperId: `p${S}${p}`, S, W: n, n, pointsPrior: 10, obsPPG: 14, rosPPG: outcome + ((p % 3) - 1) * 0.5, position: 'WR' });
  return rows;
}
const ENTRY = (k, basis = 'fitted') => ({ k, kFit: k, basis, rows: 48, players: 48 });
const fakeCell = (rows) => ({ orderedRows: rows });

describe('the pre-registered rule text', () => {
  test('names wire / do-not-wire, the pooled guard, the multiplicity exposure and the dynasty stop-and-report', () => {
    for (const s of ['`wire`', 'do-not-wire', 'pooled points-only paired delta', 'spurious', 'stop-and-report', 'diffDynConstants', 'K_ROS_OPP', '0.5%']) {
      assert.ok(DECISION_RULE_MD.includes(s), s);
    }
  });
  test('the shipped file names are the ones the app pins', () => {
    assert.equal(SHIPPED_FILES.twoA.path, 'backtests/2026-10-07-inseason-constants.json');
    assert.equal(SHIPPED_FILES.dyn.path, 'backtests/2026-10-11-inseason-dyn-constants.json');
    assert.deepEqual([...BASIS_INVARIANT_ENTRIES], ['K_ROS_OPP', 'K_DYN_OPP', 'K_ROS_SHARE', 'K_ROS_OPP_STALE']);
  });
});

describe('compareConstantsFiles / decideFile', () => {
  // outcome 14 → observed-only (k 0) is best; the shipped k 6 shrinks toward the prior 10 and loses → league k 0 BEATS.
  const rows = cellRows({ outcome: 14 });
  const store = new Map([['pointsP_ros|WR', fakeCell(rows)]]);
  const pinnedFrom = { 'K_ROS_POINTS|WR': 'pointsP_ros|WR', 'K_ROS_POINTS|RB': 'pointsP_ros|RB' };
  const cellOf = twoACellResolver({ store, pinnedFrom });

  test('twoACellResolver maps an entry to its store cell and spec through pinnedFrom; unknown cells resolve to null', () => {
    const c = cellOf('K_ROS_POINTS', 'WR');
    assert.equal(c.cellKey, 'pointsP_ros|WR');
    assert.equal(c.spec, SPEC.pointsRos);
    assert.equal(cellOf('K_ROS_POINTS', 'RB'), null, 'no analysis stored');
    assert.equal(cellOf('K_X', 'WR'), null);
    assert.equal(specForStoreKey('q4|X-rookie0|next|ALL'), SPEC.pointsNext);
    assert.equal(specForStoreKey('q3|ros|QB|weak'), SPEC.pointsRos);
    assert.equal(specForStoreKey('pointsR_next|TE'), SPEC.rawNext);
    assert.deepEqual(specForStoreKey('q7_L|QB'), { prior: 'pointsPriorLive', obs: 'obsPPG', outcome: 'rosPPG' });
    assert.equal(specForStoreKey('opp_ros|WR'), null);
  });

  test('a differing league k that beats the shipped k out of sample is BEATS; identical emitted k is `same` (delta still reported)', () => {
    const shipped = { constants: { K_ROS_POINTS: { WR: ENTRY(6) }, K_ROS_OPP: { WR: ENTRY(3) } } };
    const league = { constants: { K_ROS_POINTS: { WR: ENTRY(0, 'observed-only') }, K_ROS_OPP: { WR: ENTRY(2) } } };
    const cmp = compareConstantsFiles({ shipped, league, cellOf });
    const e = cmp.entries.find(x => x.name === 'K_ROS_POINTS');
    assert.equal(e.label, 'BEATS');
    assert.ok(e.delta.mean < 0 && e.delta.ci95[1] < 0);
    assert.equal(cmp.entries.find(x => x.name === 'K_ROS_OPP').label, 'excluded', 'basis-invariant entries are listed, never decided');
    const same = compareConstantsFiles({ shipped, league: { constants: { K_ROS_POINTS: { WR: ENTRY(6) } } }, cellOf });
    const s = same.entries.find(x => x.name === 'K_ROS_POINTS');
    assert.equal(s.label, 'same');
    assert.equal(s.same, true);
    assert.ok(s.delta, 'delta is still reported (the league fold k vs the shipped k)');
  });

  test('entries missing on one side, a null shipped k, and cells with no analysis are labelled, not decided', () => {
    const shipped = { constants: { K_ROS_POINTS: { WR: ENTRY(6), RB: ENTRY(3), TE: { ...ENTRY(null), basis: 'prior-only' } } } };
    const league = { constants: { K_ROS_POINTS: { WR: ENTRY(0), RB: ENTRY(2) }, K_DYN_POINTS: { WR: ENTRY(3) } } };
    const cmp = compareConstantsFiles({ shipped, league, cellOf });
    const lab = (n, c) => cmp.entries.find(x => x.name === n && x.cell === c).label;
    assert.equal(lab('K_ROS_POINTS', 'RB'), 'no-cell');
    assert.equal(lab('K_ROS_POINTS', 'TE'), 'league-missing');
    assert.equal(lab('K_DYN_POINTS', 'WR'), 'shipped-missing');
  });

  const mk = (labels, pooledLabel) => ({
    entries: labels.map((label, i) => ({ name: `K_${i}`, cell: 'WR', label, cellKey: `c${i}`, excluded: false })),
    pooled: { label: pooledLabel },
  });
  test('truth table: wire iff >= 1 BEATS, no WORSE and the pooled delta BEATS', () => {
    assert.equal(decideFile({ comparison: mk(['BEATS', 'NO-GAIN', 'same'], 'BEATS') }).verdict, 'wire');
    assert.equal(decideFile({ comparison: mk(['BEATS', 'WORSE'], 'BEATS') }).verdict, 'do-not-wire', 'one WORSE blocks');
    assert.equal(decideFile({ comparison: mk(['BEATS', 'NO-GAIN'], 'NO-GAIN') }).verdict, 'do-not-wire', 'the pooled guard blocks a lone BEATS');
    assert.equal(decideFile({ comparison: mk(['NO-GAIN', 'same'], 'BEATS') }).verdict, 'do-not-wire', 'pooled BEATS alone is not enough');
    assert.equal(decideFile({ comparison: mk(['same', 'same'], null) }).verdict, 'do-not-wire');
    const w = decideFile({ comparison: mk(['BEATS'], 'BEATS') });
    assert.deepEqual(w.beats, ['K_0.WR']);
    assert.match(w.reason, /pooled points delta BEATS/);
  });

  test('a dynasty `wire` with a changed kind / decisions / reuse is stop-and-report; an unchanged structure wires; no wire stays do-not-wire', () => {
    const structure = (changed) => ({ changed, kindEqual: !changed });
    assert.equal(decideFile({ comparison: mk(['BEATS'], 'BEATS'), kind: 'dyn', structural: structure(true) }).verdict, 'stop-and-report');
    assert.equal(decideFile({ comparison: mk(['BEATS'], 'BEATS'), kind: 'dyn', structural: structure(false) }).verdict, 'wire');
    assert.equal(decideFile({ comparison: mk(['NO-GAIN'], 'NO-GAIN'), kind: 'dyn', structural: structure(true) }).verdict, 'do-not-wire');
  });
});

describe('dynStructure / dynCellResolver', () => {
  const base = { constants: { K_DYN_PROSPECT_A_YE1: { QB: { k: 3.5 } } }, reuse: { 'K_DYN_PROSPECT_B_YE0|QB': { reuses: ['K_DYN_POINTS_ROOKIE0'], k: [6.5], source: 'a' } }, decisions: { q1: { YE0: 'B' } }, prospectPriorKind: { kind: { 0: { QB: 'projection' } } } };
  test('only k moves → constants differ, structure unchanged; a `source` string is ignored', () => {
    const league = JSON.parse(JSON.stringify(base));
    league.constants.K_DYN_PROSPECT_A_YE1.QB.k = 4;
    league.reuse['K_DYN_PROSPECT_B_YE0|QB'].source = 'b';
    const s = dynStructure({ shipped: base, league });
    assert.deepEqual(s.diff.map(c => c.path), ['constants.K_DYN_PROSPECT_A_YE1.QB.k']);
    assert.equal(s.changed, false);
  });
  test('a changed decision, reuse k or kind marks the structure changed', () => {
    for (const edit of [(l) => { l.decisions.q1.YE0 = 'A'; }, (l) => { l.reuse['K_DYN_PROSPECT_B_YE0|QB'].k = [7]; }, (l) => { l.prospectPriorKind.kind[0].QB = 'position'; }]) {
      const league = JSON.parse(JSON.stringify(base)); edit(league);
      assert.equal(dynStructure({ shipped: base, league }).changed, true);
    }
  });
  test('dynCellResolver: K_DYN_PROSPECT_A_YE1 pooled cell = every YE1 Q1 row; a position cell filters; other names resolve to null', () => {
    const r = (ye, position, extra = {}) => ({ ye, position, arm: ye === 0 ? 'X-rookie0' : 'X-rookie1p', prospectPrior: 8, projPrior: 9, obsPPG: 10, nextPPG: 11, sleeperId: `${ye}${position}${Math.random()}`, ...extra });
    const rows = [r(1, 'WR'), r(1, 'QB'), r(0, 'WR'), r(1, 'WR', { arm: 'P' })];
    const cellOf = dynCellResolver(rows);
    const pooled = cellOf('K_DYN_PROSPECT_A_YE1', 'QB', { fixtureKey: 'K_DYN_PROSPECT_A_YE1|ALL' });
    assert.equal(pooled.cellKey, 'K_DYN_PROSPECT_A_YE1|ALL');
    assert.equal(pooled.rows.length, 2, 'YE1 Q1 rows (the arm-P row is a route mismatch)');
    assert.deepEqual(pooled.spec, { prior: 'prospectPrior', obs: 'obsPPG', outcome: 'nextPPG' });
    assert.equal(cellOf('K_DYN_PROSPECT_A_YE1', 'WR', {}).rows.length, 1);
    assert.deepEqual(cellOf('K_DYN_PROSPECT_B_YE0', 'WR', {}).spec, { prior: 'projPrior', obs: 'obsPPG', outcome: 'nextPPG' });
    assert.equal(cellOf('K_ROS_POINTS', 'WR', {}), null);
  });
});

describe('G3 table, weeks and capture helpers', () => {
  const fit = (v, w) => ({ perPosition: { QB: { verdict: v, baseVerdict: v, sensitivityVerdict: v, wFinal: w, nFitRows: 1, nEvalRows: 1 }, RB: { verdict: 'CLEARS', baseVerdict: 'CLEARS', sensitivityVerdict: 'CLEARS', wFinal: { momentum: 1 }, nFitRows: 1, nEvalRows: 1 }, WR: { verdict: 'X', nFitRows: 1, nEvalRows: 1 }, TE: { verdict: 'X', nFitRows: 1, nEvalRows: 1 } }, pool: { WRTE: { verdict: 'X', wFinal: {} } } });
  test('fitSummary / g3Table: labels side by side; any verdict difference flags non-transport', () => {
    const h = fitSummary(fit('UNSTABLE', { momentum: 0.6 })), l = fitSummary(fit('UNSTABLE', { momentum: 0.7 }));
    const t = g3Table(h, l);
    assert.equal(t.anyLabelDiffers, false);
    assert.deepEqual(t.rows.find(x => x.position === 'QB').exponents, { momentum: { half_ppr: 0.6, league: 0.7 } });
    assert.equal(g3Table(h, fitSummary(fit('CLEARS', { momentum: 0.7 }))).anyLabelDiffers, true);
    assert.equal(t.rows.length, 5, 'four positions and the WR+TE pool');
  });
  test('weeksMethodBySeason counts exact vs scaled weeks and flags a scaled share above 0.5%', () => {
    const rows = {
      a: { weeklyPoints: { 1: 1, 2: 1 }, weeklyPointsMethod: 'exact' },
      b: { weeklyPoints: { 1: 1 }, weeklyPointsMethod: 'scaled' },
      c: { weeklyPoints: null, weeklyPointsMethod: null },
      TEAM_BUF: { weeklyPoints: { 1: 1, 2: 1, 3: 1 }, weeklyPointsMethod: 'scaled' },   // pseudo-row: never counted
    };
    const out = weeksMethodBySeason({ loadSeasonTotals: () => rows }, 2020, 2020);
    assert.deepEqual(out[2020], { rows: 3, exactWeeks: 2, scaledWeeks: 1, noWeeksRows: 1, scaledShare: 1 / 3, flag: true });
    const clean = weeksMethodBySeason({ loadSeasonTotals: () => ({ a: rows.a }) }, 2020, 2020);
    assert.equal(clean[2020].flag, false);
  });
  test('modelOfCapture (plan D5): league → league; absent or half_ppr → half_ppr; mixed / unknown → skipped with a reason', () => {
    assert.deepEqual(modelOfCapture({ projectionBasis: 'league' }), { model: 'league' });
    assert.deepEqual(modelOfCapture({}), { model: 'half_ppr' });
    assert.deepEqual(modelOfCapture({ projectionBasis: 'half_ppr' }), { model: 'half_ppr' });
    for (const b of ['mixed', 'unknown']) { const m = modelOfCapture({ projectionBasis: b }); assert.equal(m.model, null); assert.match(m.reason, new RegExp(b)); }
  });
  test('slimRookieSnapshot keeps only rookie-path rows and the parity keys', () => {
    const snap = { schemaVersion: 3, capturedAt: 'x', targetSeason: 2026, currentSeason: 2025, projectionBasis: 'league', players: {
      r: { projection: { confidence: 'rookie', projectedPPG: 1, projectedGames: 2, projectedTotalPts: 3, factors: { basePPG: 14.482, rookieBasisScale: 1.114, noise: 9 } } },
      v: { projection: { confidence: 'high', factors: { basePPG: 1 } } },
    } };
    const s = slimRookieSnapshot(snap);
    assert.deepEqual(Object.keys(s.players), ['r']);
    assert.deepEqual(s.players.r.projection.factors, { basePPG: 14.482, rookieBasisScale: 1.114 });
    assert.equal(s.projectionBasis, 'league');
  });
  test('checkRookieRows: an unrecoverable position is counted and skipped, never silently dropped', () => {
    const rows = [['x', { projection: { projectedPPG: 1, projectedGames: 1, projectedTotalPts: 1, factors: { basePPG: 99, rookieCeilingKnee: null } } }]];
    const c = checkRookieRows(rows, { scaleOf: () => 1 });
    assert.equal(c.positionUnrecovered, 1);
    assert.equal(c.fields.basePPG.checked, 0);
  });
});

describe('runLeagueBasis stops at a failed G1 without running G2', () => {
  test('a G1 failure returns { stopped: "G1" } and never touches a runner', () => {
    const boom = () => { throw new Error('G2 ran'); };
    // a failing G1 result is injected (the real G1 reads snapshots/, which tests never do — Invariant 10); the load would throw if G2 started
    const r = runLeagueBasis({ load: new Proxy({}, { get: boom }), g1Result: { pass: false, a: { pass: false }, b: {}, c: {}, d: {} }, fit: boom });
    assert.equal(r.stopped, 'G1');
    assert.equal(r.g1.pass, false);
  });
});

describe('CLI guards (bin/backtest.mjs, bin/panel.mjs) fail before any run', () => {
  const bt = (...args) => run('bin/backtest.mjs', args);
  test('--inseason --basis: unknown value, league dynasty without --inseason-2a, --inseason-2a without dynasty+league, other flags', () => {
    let r = bt('--inseason', '--basis', 'nope');
    assert.equal(r.status, 1); assert.match(r.stderr, /--basis must be half_ppr or league/);
    r = bt('--inseason', '--dynasty', '--basis', 'league');
    assert.equal(r.status, 1); assert.match(r.stderr, /requires --inseason-2a/);
    r = bt('--inseason', '--inseason-2a', 'x.json');
    assert.equal(r.status, 1); assert.match(r.stderr, /--inseason-2a applies only to/);
    r = bt('--inseason', '--from', '2012');
    assert.equal(r.status, 1); assert.match(r.stderr, /--inseason rejects --from/);
  });
  test('every other mode still rejects --basis; --league-basis takes only --json and --write', () => {
    for (const mode of ['--qb-takeover', '--qb-rookie-level', '--absence', '--rookie-total']) {
      const r = bt(mode, '--basis', 'league');
      assert.equal(r.status, 1, mode); assert.match(r.stderr, /rejects --basis/, mode);
    }
    const r = bt('--league-basis', '--from', '2012');
    assert.equal(r.status, 1); assert.match(r.stderr, /--league-basis rejects --from/);
  });
  test('panel: --basis league is --fit only; an unknown basis is refused', () => {
    let r = run('bin/panel.mjs', ['--basis', 'league']);
    assert.equal(r.status, 1); assert.match(r.stderr, /league is admitted by --fit only|--fit only/);
    r = run('bin/panel.mjs', ['--fit', '--basis', 'nope']);
    assert.equal(r.status, 1); assert.match(r.stderr, /--basis must be/);
    r = run('bin/panel.mjs', ['--fullpipeline', '--basis', 'league']);
    assert.equal(r.status, 1);
  });
});

describe('verdict markdown', () => {
  test('buildLeagueBasisVerdictMarkdown opens with the rule before any result section', () => {
    const md = DECISION_RULE_MD;
    assert.ok(md.indexOf('Pre-registered decision rule') >= 0);
    assert.equal(typeof buildLeagueBasisVerdictMarkdown, 'function');
  });
});
