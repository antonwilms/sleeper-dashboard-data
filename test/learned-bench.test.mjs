/**
 * test/learned-bench.test.mjs — LP-1a season-benchmark tests T-LP-8, T-LP-11
 * (task .claude/tasks/learned-projection-1a-harness.md §7). Fixtures: test/fixtures/learned-panel/.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  b2QualifyingSeasons, b2Benchmark, seasonBench, appPopulationAsOf, rosK, ROS_TABLE, posteriorValue, chainBasis, preseasonChain, liveChainAt,
  qbLiveStatesAsOf, qbContextAt, b1wValue, buildBenchwSeason, ARM_POPULATION,
} from '../lib/learnedBench.mjs';
import crypto from 'node:crypto';
import path from 'node:path';
import { expectedStarts, primaryPassers, incPPG, priorPPG, iqCode, dpCode } from '../lib/qbTakeover.mjs';
import { pinnedQbChainModels, reconstructQbPreseasonShares } from '../lib/projectionFactors.mjs';
import { indexSchedule, modalTeamGames } from '../lib/learnedPanel.mjs';
import { runExportWeekly } from '../scripts/learned-panel-run.mjs';
import { repoPath } from '../lib/io.mjs';
import { scenarioToDataInputs, SCENARIO } from '../test-support/lp-scenario.mjs';
import { twoYearAveragePPG } from '../lib/dynastyBacktest.mjs';
import { rookieRecordFor, rookieRosPrior } from '../scripts/inseason-run.mjs';
import { mirrorArgsOf } from '../scripts/rookie-constants-file.mjs';

const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/learned-panel/${n}.json`, import.meta.url), 'utf8'));

test('T-LP-8 season benchmark rules: a veteran with no qualifying season is null+counted; a rookie QB total is the rookie total', () => {
  // veteran, one 5-game season → no qualifying season → projectedGamesFor null → null total, flagged, row kept
  const careerStats = { 2019: { V1: { gamesPlayed: 5, fantasyPoints: 40, dnpWeeks: 0 } } };
  const vet = seasonBench({ pid: 'V1', position: 'WR', S: 2020, arm: 'X-short', pointsPrior: 8.4, careerStats });
  assert.equal(vet.noGames, true);
  assert.equal(vet.games, null);
  assert.equal(vet.total, null);
  assert.equal(vet.covered, true);

  // first-year QB with capital, not his team's game-1 primary: season ppg/total from the rookie record, weekly from the group level
  const playerIds = { bySleeper: { Q1: { draftYear: 2020, draftRound: 1, draftPick: 5, birthdate: '1998-03-01', undrafted: false } } };
  const rec = rookieRecordFor('Q1', 'QB', 2020, playerIds, { rookieQbModel: 'rookie-qb-level', basisScale: 1, ...mirrorArgsOf(null) });
  assert.ok(typeof rec.qbStarterBasis === 'string' && rec.qbStarterBasis.startsWith('rookie:'), 'a first-year QB with capital takes the group level');
  const { pointsPrior } = rookieRosPrior(rec, false);
  assert.equal(pointsPrior, rec.qbStarterPPG);
  assert.notEqual(rec.qbStarterPPG, rec.projectedPPG, 'the two levels differ, so a wrong source is visible');
  const q = seasonBench({ pid: 'Q1', position: 'QB', S: 2020, arm: 'X-rookie0', pointsPrior, careerStats: {}, rookieRec: rec });
  assert.equal(q.total, rec.projectedTotalPts);
  assert.equal(q.ppg, rec.projectedPPG);
  assert.equal(q.ppgWeekly, rec.qbStarterPPG);
  assert.equal(q.starterPPG, rec.qbStarterPPG);
  assert.equal(q.games, rec.projectedGames);
  assert.equal(q.qbChainApprox, true);
  // an uncovered row stays null
  assert.equal(seasonBench({ pid: 'Z', position: 'RB', S: 2020, arm: null, pointsPrior: null, careerStats: {} }).covered, false);
});

test('T-LP-11 B2 predicate: b2QualifyingSeasons is non-empty exactly when twoYearAveragePPG is non-null and averages to it', () => {
  const { forecastSeason: S, career } = fx('b2-career');
  const pids = new Set(Object.values(career).flatMap(r => Object.keys(r)));
  assert.ok(pids.size > 100 && pids.has('EDGE_LOW') && pids.has('EDGE_NAN'));
  let nonNull = 0, nullN = 0;
  for (const pid of pids) {
    const original = twoYearAveragePPG(career, pid, S - 1);
    const q = b2QualifyingSeasons(career, pid, S);
    assert.equal(q.length > 0, original != null, `${pid} qualifying vs original`);
    if (original != null) {
      nonNull++;
      assert.ok(Math.abs(q.reduce((a, s) => a + s.ppg, 0) / q.length - original) < 1e-12, `${pid} mean`);
      assert.ok(q.every(s => s.season === S - 1 || s.season === S - 2));
    } else nullN++;
  }
  assert.ok(nonNull > 20 && nullN > 5, 'the fixture exercises both outcomes');
  // the boundary rows: gp 7 does not qualify, gp 8 does, non-finite points do not
  assert.deepEqual(b2QualifyingSeasons(career, 'EDGE_LOW', S).map(s => s.season), [2020]);
  assert.deepEqual(b2QualifyingSeasons(career, 'EDGE_NAN', S).map(s => s.season), [2020]);
  // b2.total scales games by the forecast season's team games over the source season's
  const b = b2Benchmark({ 2019: { P: { gamesPlayed: 10, fantasyPoints: 100 } }, 2020: { P: { gamesPlayed: 10, fantasyPoints: 150 } } }, 'P', 2021,
    { teamGamesS: 17, teamGamesOf: (y) => (y === 2019 ? 16 : 17) });
  assert.equal(b.ppg, 12.5);
  assert.ok(Math.abs(b.total - 12.5 * ((10 * 17 / 16 + 10 * 17 / 17) / 2)) < 1e-9);
});


// ═══ LP-1b — weekly benchmark (task .claude/tasks/learned-projection-1b-weekly-bench.md §7) ═══════════════════════════════════
// The fixture is the committed parity fixture (a byte copy lives in the app repo); the app-side tests are in
// app:src/__tests__/inSeasonRoutingParity.test.js. Rebuild: scripts/fixtures/build-inseason-routing-parity.mjs (by hand).

const PARITY_FILE = 'inseason-routing-parity-2026-11-13.json';
const PARITY_SHA256 = '584245d799b63265153458cbb5c2e7037736db73cd6066747c0470abfed4b7f2';
const parityRaw = fs.readFileSync(new URL(`./fixtures/learned-panel/${PARITY_FILE}`, import.meta.url));
const PF = JSON.parse(parityRaw.toString('utf8'));
const constantsFile = JSON.parse(fs.readFileSync(new URL('../backtests/2026-10-07-inseason-constants.json', import.meta.url), 'utf8'));
const leagueConstants = JSON.parse(fs.readFileSync(new URL('../backtests/2026-10-16-inseason-league-constants.json', import.meta.url), 'utf8'));
const models = pinnedQbChainModels(JSON.parse(fs.readFileSync(new URL('../backtests/2026-10-03-qb-takeover-constants.json', import.meta.url), 'utf8')));
const r2 = (x) => Math.round(x * 100) / 100;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

const DATA = scenarioToDataInputs(PF.scenario);
const RUN = (d = DATA) => buildBenchwSeason({ ...d, constantsFile, models });
const BASE = RUN();
const rowOf = (rows, pid, w) => rows.find(r => r.pid === pid && r.w === w);
const caseAt = (w) => PF.cases.find(c => c.w === w);
const PLAYER = new Map(PF.scenario.players.map(p => [p.id, p]));
const QB_IDS = PF.scenario.players.filter(p => p.pos === 'QB').map(p => p.id);
const POP_OF_KIND = { Std: 'standard', Std8: 'standard', Short: 'SHORT', R0: 'ROOKIE0', R1p: 'ROOKIE1P' };
const SKILL_IDS = PF.scenario.players.filter(p => p.pos !== 'QB').map(p => p.id);
const kindOf = (id) => id.replace(/^(rb|wr|te)/, '');

test('T-LP-17 fixture pin: the parity fixture bytes equal the pinned SHA-256 (the app repo pins the same literal)', () => {
  assert.equal(crypto.createHash('sha256').update(parityRaw).digest('hex'), PARITY_SHA256);
});

test('T-LP-5 non-QB value: posterior of b1.ppg on the weeks before w, k from the 2026-10-07 file by population × position', () => {
  assert.ok(SKILL_IDS.length >= 13);
  const kinds = new Set();
  let nSeen = new Set();
  for (const id of SKILL_IDS) {
    const p = PLAYER.get(id);
    const pop = POP_OF_KIND[kindOf(id)];
    kinds.add(`${pop}:${p.pos}`);
    const K = constantsFile.constants[ROS_TABLE[pop]][p.pos].k;
    for (const w of PF.scenario.checkpoints) {
      const played = p.rows.filter(r => r.w < w && r.played);
      const n = played.length;
      nSeen.add(n);
      const obs = n ? played.reduce((a, r) => a + r.pts, 0) / n : null;
      const expected = n === 0 ? p.b1.ppg : (p.b1.ppg * K + obs * n) / (K + n);
      const row = rowOf(BASE.rows, id, w);
      assert.equal(row.population, pop, `${id} population`);
      assert.equal(row.k, K, `${id} k`);
      near(row.cond, expected, 1e-12, `${id} w${w} cond`);
      assert.equal(row.uncond, null);
      assert.equal(row.n, n);
    }
  }
  for (const pop of ['standard', 'SHORT', 'ROOKIE0', 'ROOKIE1P']) for (const pos of ['RB', 'WR', 'TE']) assert.ok(kinds.has(`${pop}:${pos}`), `${pop} ${pos} present`);
  assert.ok(nSeen.has(0) && nSeen.has(3) && nSeen.has(6), `n = 0 at w1, 3 at w4, up to 6 at w9 (saw ${[...nSeen]})`);
  // QB standard (qA1, an `original` on projPrior) rides the same value: k is the QB standard k of the same file
  const q = rowOf(BASE.rows, 'qA1', 4);
  assert.equal(q.k, constantsFile.constants.K_ROS_POINTS.QB.k);
  // the 2026-10-16 league file differs at QB standard and TE standard / SHORT, so a mix-up is visible
  assert.notEqual(leagueConstants.constants.K_ROS_POINTS.QB.k, constantsFile.constants.K_ROS_POINTS.QB.k);
  assert.notEqual(leagueConstants.constants.K_ROS_POINTS.TE.k, constantsFile.constants.K_ROS_POINTS.TE.k);
  assert.notEqual(leagueConstants.constants.K_ROS_POINTS_SHORT.TE.k, constantsFile.constants.K_ROS_POINTS_SHORT.TE.k);
});

test('T-LP-9 population, k and posterior parity with the app fixture (CR-25)', () => {
  const S = PF.scenario.season;
  const careerStats = DATA.careerStats;
  const c0 = caseAt(1);
  for (const p of PF.scenario.players) {
    const yearsExp = S - p.draftYear;
    assert.equal(appPopulationAsOf({ pid: p.id, careerStats, S, yearsExp }), c0.app.population[p.id], `${p.id} population vs the app`);
  }
  assert.equal(c0.app.population.wrStd8, 'standard', 'the exactly-8-games player is standard');
  for (const pop of Object.keys(ROS_TABLE)) for (const pos of ['QB', 'RB', 'WR', 'TE']) assert.equal(rosK(constantsFile, pop, pos), PF.kTables[pop][pos], `${pop} ${pos}`);
  for (const c of PF.cases) for (const [id, rec] of c.app.posteriors) assert.equal(rosK(constantsFile, rec.population, PLAYER.get(id).pos), rec.ros.k, `${id} w${c.w} ros.k`);
  for (const { args, value } of PF.posteriorOf) {
    const got = posteriorValue(...args);
    if (value === null) assert.equal(got, null, `posteriorValue(${args})`); else near(got, value, 1e-12, `posteriorValue(${args})`);
  }
  assert.throws(() => rosK({ constants: { K_ROS_POINTS: { QB: { k: NaN } } } }, 'standard', 'QB'), /finite/);
});

test('T-LP-10 QB live-state parity with the app (CR-27); 16-game teams differ only in remaining / expected / fraction', () => {
  const S = PF.scenario.season;
  const sched = indexSchedule(DATA.scheduleFile);
  const prim = primaryPassers(DATA.gamelogsFile, S);
  const byPid = new Map();
  for (const r of DATA.weekRows) { if (!byPid.has(r.pid)) byPid.set(r.pid, []); byPid.get(r.pid).push(r); }
  for (const rows of byPid.values()) rows.sort((a, b) => a.w - b.w);
  const rowsOf = (pid) => byPid.get(pid) ?? [];
  const dyOf = (pid) => PLAYER.get(pid)?.draftYear ?? null;
  const sixteen = new Set(['TE', 'TF']);
  let compared16 = 0, comparedOther = 0;
  for (const c of PF.cases) {
    const states = qbLiveStatesAsOf({
      S, w: c.w, qbIds: QB_IDS, rowsOf, sched, primaries: prim, careerM1: DATA.careerStats[S - 1], depthFile: DATA.depthFile,
      rosterPlayers: DATA.rosterweeklyFile.players, draftYearOf: dyOf, models,
    });
    const appStates = new Map(c.app.liveStates);
    assert.deepEqual([...states.keys()].sort(), [...appStates.keys()].sort(), `w${c.w}: states exist exactly where the app has them`);
    for (const [id, a] of appStates) {
      const d = states.get(id);
      assert.equal(d.kind, a.kind, `${id} w${c.w} kind`);
      assert.equal(d.team, a.team);
      assert.equal(d.g, a.gamesPlayed);
      assert.equal(d.starts, a.starts);
      near(d.startPoints, a.startPoints, 1e-9, `${id} startPoints`);
      if (!sixteen.has(d.team)) {
        assert.equal(d.remaining, a.remaining);
        if (a.expected != null) { near(d.expected, a.expected, 1e-9, `${id} expected`); near(d.fraction, a.fraction, 1e-9, `${id} fraction`); } else assert.equal(d.expected, null);
        comparedOther++;
      } else {
        assert.equal(d.remaining, a.remaining - 1, `${id} w${c.w}: the team's real game count (16), not 17`);
        compared16++;
        if (d.kind === 'starter') {
          // direct call: the streak is the trailing run of the team's games with this QB primary
          const G = sched.weeks(d.team).filter(v => v < c.w);
          let s = 0; for (let i = G.length - 1; i >= 0 && prim.get(`${d.team}|${G[i]}`)?.pid === id; i--) s++;
          const direct = expectedStarts({ hazard: models.hazard, stick: models.stick, start: { role: 'S', ps: 1, c: 0, s, g: d.g + 1, hazardCodes: { dp: 0, og: 0, rk: 0, iq: 3 }, stickCodes: {} }, remaining: d.remaining });
          near(d.expected, direct.expected, 1e-12, `${id} expected via expectedStarts`);
          near(d.fraction, direct.fraction, 1e-12, `${id} fraction`);
          assert.ok(Math.abs(d.fraction - a.fraction) > 1e-6, 'the 16-game fraction is not the 17-game one');
        }
      }
    }
  }
  assert.ok(compared16 >= 4 && comparedOther >= 20, `compared ${compared16} 16-game and ${comparedOther} other states`);
});

test('T-LP-12 QB priors: the prior follows the kind and the chain sets, not one prior for everyone', () => {
  const K = (id) => constantsFile.constants[ROS_TABLE[BASE.rows.find(r => r.pid === id).population]].QB.k;
  const obsOf = (id, w) => { const pl = PLAYER.get(id).rows.filter(r => r.w < w && r.played); return pl.length ? pl.reduce((a, r) => a + r.pts, 0) / pl.length : null; };
  // rookie backup with capital: blends from starterPPG (14), not ppg (8)
  const c2 = rowOf(BASE.rows, 'qC2', 4);
  assert.equal(c2.kind, 'backup');
  assert.equal(c2.cond, 14);
  assert.ok(near(c2.uncond, 14 * c2.fraction, 1e-12, 'uncond = starterPrior × fraction') === undefined);
  // original in neither chain set: projPrior (19), although starterPPG is 21.5
  const a1 = rowOf(BASE.rows, 'qA1', 4);
  assert.equal(a1.kind, 'original'); assert.equal(a1.preChain, false); assert.equal(a1.liveChain, false);
  near(a1.cond, posteriorValue(19, obsOf('qA1', 4), 3, K('qA1')), 1e-12, 'qA1 original, projPrior');
  // original in the preseason set only (qE2 at w9: its room is no-chart) and one in the live set only (qD1 at w4)
  const e2 = rowOf(BASE.rows, 'qE2', 9);
  assert.equal(e2.kind, 'original'); assert.equal(e2.preChain, true); assert.equal(e2.liveChain, false);
  near(e2.cond, posteriorValue(13, obsOf('qE2', 9), 7, K('qE2')), 1e-12, 'qE2 from starterPrior');
  const d1 = rowOf(BASE.rows, 'qD1', 4);
  assert.equal(d1.kind, 'original'); assert.equal(d1.preChain, false); assert.equal(d1.liveChain, true); assert.equal(d1.injured, true);
  near(d1.cond, posteriorValue(15, obsOf('qD1', 4), 1, K('qD1')), 1e-12, 'qD1 from starterPrior');
  // w = 1: a non-chain QB → projPrior and no uncond; a chain QB → starterPrior and starterPrior × preShare
  const a1w1 = rowOf(BASE.rows, 'qA1', 1);
  assert.equal(a1w1.kind, 'preseason'); assert.equal(a1w1.cond, 19); assert.equal(a1w1.uncond, null);
  const c2w1 = rowOf(BASE.rows, 'qC2', 1);
  assert.equal(c2w1.cond, 14);
  near(c2w1.uncond, 14 * PF.chain.pre.qC2.share, 1e-12, 'starterPrior × preShare');
  // b1wValue, directly: every kind of QB composes as stated
  assert.deepEqual(b1wValue({ position: 'QB', K: 3, projPrior: 10, starterPrior: 12, n: 2, obsPPG: 8, teamKnown: true, g: 3, state: { kind: 'original' }, preChain: false, preShare: null, liveChain: false }),
    { kind: 'original', cond: posteriorValue(10, 8, 2, 3), uncond: null, omitted: null });
  assert.equal(b1wValue({ position: 'QB', K: 3, projPrior: 10, starterPrior: 12, n: 2, obsPPG: 8, teamKnown: true, g: 3, state: null, preChain: false, preShare: null, liveChain: true }).omitted, 'chain-no-state');
});

test('T-LP-13 chain basis: preseason and live chains equal the app-verified fixture; named cases', () => {
  const S = PF.scenario.season;
  const dyOf = new Map(DATA.seasons.map(r => [r.pid, r.draftYear]));
  const draftYearOf = (pid) => dyOf.get(pid) ?? null;
  const populationOf = (pid) => appPopulationAsOf({ pid, careerStats: DATA.careerStats, S, yearsExp: S - draftYearOf(pid) });
  const sched = indexSchedule(DATA.scheduleFile);
  const byPid = new Map();
  for (const r of DATA.weekRows) { if (!byPid.has(r.pid)) byPid.set(r.pid, []); byPid.get(r.pid).push(r); }
  const firstGameQbs = [];
  for (const T of sched.teams()) { const W1 = sched.weeks(T)[0]; for (const pid of QB_IDS) if ((byPid.get(pid) ?? []).some(r => r.w === W1 && r.inUniverse && r.team === T)) firstGameQbs.push({ id: pid, team: T }); }
  const args = { S, depthFile: DATA.depthFile, firstGameQbs, careerStats: DATA.careerStats, draftYearOf, populationOf, models };
  const same = (got, exp, label) => {
    assert.deepEqual([...got.keys()].sort(), Object.keys(exp).sort(), `${label} ids`);
    for (const [id, e] of Object.entries(exp)) {
      assert.equal(got.get(id).basis, e.basis, `${label} ${id} basis`);
      assert.equal(got.get(id).role, e.role);
      if (e.role === 'backup') near(got.get(id).share, e.share, 1e-12, `${label} ${id} share`); else assert.equal(got.get(id).share, null);
    }
  };
  same(preseasonChain(args), PF.chain.pre, 'pre');
  same(preseasonChain({ ...args, games: 16 }), PF.chain.pre16, 'pre16');
  assert.ok(Math.abs(PF.chain.pre.qB2.share - PF.chain.pre16.qB2.share) > 1e-6, 'games matters');
  // the default is modalTeamGames(S): 16 at S = 2019 (qB2 is no rookie in either season)
  assert.equal(modalTeamGames(2019), 16);
  const d19 = preseasonChain({ ...args, S: 2019 }).get('qB2').share;
  near(d19, preseasonChain({ ...args, S: 2019, games: 16 }).get('qB2').share, 1e-12, 'default games at S = 2019 is 16');
  assert.ok(Math.abs(d19 - preseasonChain({ ...args, S: 2019, games: 17 }).get('qB2').share) > 1e-6, 'and not 17');
  // live chains, every QB and checkpoint
  const ctxOf = (w) => new Map(QB_IDS.map(x => [x, qbContextAt({ S, w, x, rowsOf: (pid) => (byPid.get(pid) ?? []).sort((a, b) => a.w - b.w), sched, depthFile: DATA.depthFile, rosterPlayers: DATA.rosterweeklyFile.players })]));
  for (const w of PF.scenario.checkpoints) {
    const ctx = ctxOf(w);
    const got = liveChainAt({ S, qbIds: QB_IDS, teamOf: (id) => ctx.get(id).T, orderOf: (id) => ctx.get(id).order, careerStats: DATA.careerStats, draftYearOf, populationOf, models });
    assert.deepEqual(Object.fromEntries(got), PF.chain.live[w], `live w${w}`);
  }
  // named cases
  assert.equal(PF.chain.pre.qA2.basis, 'stale', 'the 8-start veteran is stale through S−2 (S−1 has 3 games)');
  assert.equal(PF.chain.pre.qB3.basis, 'chain', 'the app-rookie-route QB with ≥ 8 starts and order 3 is chain');
  assert.equal(PF.chain.pre.qC3.basis, 'chain', 'the uncharted first-game-universe QB is chain');
  assert.equal(PF.chain.live[4].qC4, 'stale', 'the routeMismatch QB is stale by population (its arm, X-rookie1p, would say chain)');
  assert.equal(PF.chain.live[4].qCnt, 'no-team');
  assert.equal(PF.chain.live[9].qE2, 'no-chart', 'the mover\'s old room has no order-1 QB of its own');
  assert.equal(PF.chain.live[9].qE1, 'stale');
  // chainBasis itself
  assert.equal(chainBasis({ role: 'backup', order: 2, appVet: true, lastQualGamesStarted: 8 }), 'stale');
  assert.equal(chainBasis({ role: 'backup', order: 2, appVet: true, lastQualGamesStarted: 7 }), 'chain');
  assert.equal(chainBasis({ role: 'backup', order: 2, appVet: false, lastQualGamesStarted: 16 }), 'chain');
  assert.equal(chainBasis({ role: 'backup', order: 1, appVet: true, lastQualGamesStarted: 16 }), 'chain');
  assert.equal(chainBasis({ role: null, order: null, appVet: false, lastQualGamesStarted: 0 }), 'not-evaluated');
  assert.equal(chainBasis({ role: 'incumbent', order: 1, appVet: true, lastQualGamesStarted: 16 }), 'incumbent');
  // one league-wide call: a two-team subset changes an iq code (so splitting the median would change a share)
  const mk = (id, team, order) => ({ id, team, order, rookie: false });
  const prior = { x1: 16, y1: 20, z1: 20 };
  const room = [mk('x1', 'TX', 1), mk('x2', 'TX', 2), mk('y1', 'TY', 1), mk('y2', 'TY', 2), mk('z1', 'TZ', 1), mk('z2', 'TZ', 2)];
  const full = reconstructQbPreseasonShares({ qbs: room, priorOf: (id) => prior[id] ?? null, models });
  const two = reconstructQbPreseasonShares({ qbs: room.filter(q => q.team !== 'TZ'), priorOf: (id) => prior[id] ?? null, models });
  assert.notEqual(full.x2.codes.iq, two.x2.codes.iq, 'a two-team subset changes an iq code');
});

test('T-LP-14 as-of: no input of week ≥ w reaches a week-≤w value (Node side)', () => {
  const lcg = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const upTo = (rows, w) => rows.filter(r => r.w <= w);
  for (const w of [1, 4, 9]) {
    const base = RUN();
    const keepWeek1Depth = w === 1;
    // (a) randomise every outcome-bearing input of week ≥ w
    const rnd = lcg(12345 + w);
    const a = clone(DATA);
    for (const p of Object.values(a.gamelogsFile.players)) for (const g of p.games) if (g.week >= w) { g.attempts = Math.floor(rnd() * 50); g.sacksSuffered = Math.floor(rnd() * 6); }
    for (const r of a.weekRows) if (r.w >= w) { r.played = rnd() < 0.5; r.pts = r.played ? Math.round(rnd() * 40 * 100) / 100 : null; }
    for (const byWeek of Object.values(a.rosterweeklyFile.players)) for (const [wk, pairs] of Object.entries(byWeek)) if (Number(wk) >= w) for (const pr of pairs) pr[1] = ['ACT', 'RES', 'INA', 'PUP'][Math.floor(rnd() * 4)];
    for (const [wk, byTeam] of Object.entries(a.depthFile.weeks)) if (Number(wk) >= w && !(keepWeek1Depth && wk === '1')) for (const t of Object.values(byTeam)) t.QB = [...t.QB].sort(() => rnd() - 0.5);
    assert.deepEqual(upTo(RUN(a).rows, w), upTo(base.rows, w), `w${w}: randomised weeks ≥ w`);
    // (b) delete: gamelog games, rosterweekly weeks, depth weeks ≥ w; the weeks rows of week ≥ w keep only their identity (all inUniverse here)
    const b = clone(DATA);
    for (const p of Object.values(b.gamelogsFile.players)) p.games = p.games.filter(g => g.week < w);
    for (const byWeek of Object.values(b.rosterweeklyFile.players)) for (const wk of Object.keys(byWeek)) if (Number(wk) >= w) delete byWeek[wk];
    for (const wk of Object.keys(b.depthFile.weeks)) if (Number(wk) >= w && !(keepWeek1Depth && wk === '1')) delete b.depthFile.weeks[wk];
    b.weekRows = b.weekRows.filter(r => r.w < w || r.inUniverse).map(r => (r.w >= w ? { pid: r.pid, S: r.S, w: r.w, position: r.position, team: r.team, played: false, pts: null, inUniverse: r.inUniverse } : r));
    assert.deepEqual(upTo(RUN(b).rows, w).map(({ n, ...x }) => x).filter(() => true).length, upTo(base.rows, w).length, `w${w}: same rows`);
    assert.deepEqual(upTo(RUN(b).rows, w), upTo(base.rows, w), `w${w}: deleted weeks ≥ w`);
  }
  // the one stated exception: the week-1 chart (the preseason read) DOES move a w = 1 row
  const c = clone(DATA);
  c.depthFile.weeks[1].TA.QB = ['qA2', 'qA1'];
  assert.notDeepEqual(rowOf(RUN(c).rows, 'qA1', 1), rowOf(BASE.rows, 'qA1', 1), 'depth.weeks[1] reaches a w = 1 row');
});

test('T-LP-15 substitutions: order, injured and team follow the stated precedence', () => {
  // order = the chart of the team\'s previous game (TA\'s week-4 chart is swapped; at w4 the week-3 chart rules)
  assert.equal(rowOf(BASE.rows, 'qA1', 4).order, 1);
  assert.equal(rowOf(BASE.rows, 'qA2', 4).order, 2);
  // injured = the previous game week\'s RES/INA/PUP pair (qD1: RES in weeks 2–3 only)
  assert.equal(rowOf(BASE.rows, 'qD1', 4).injured, true);
  assert.equal(rowOf(BASE.rows, 'qD1', 9).injured, false);
  // …and false on a 2015 copy of the scenario with RES still listed
  const s15 = JSON.parse(JSON.stringify(PF.scenario)); s15.season = 2015;
  const r15 = RUN(scenarioToDataInputs(s15)).rows;
  assert.equal(rowOf(r15, 'qD1', 4).injured, false);
  assert.notEqual(rowOf(r15, 'qD1', 4).kind, 'original', 'without an injury the game-1 starter who lost the job is a backup');
  // team: the inUniverse week-w row, else the latest earlier row
  assert.equal(rowOf(BASE.rows, 'qM', 4).team, 'TB');
  const d = JSON.parse(JSON.stringify(DATA));
  d.weekRows.find(r => r.pid === 'qM' && r.w === 4).inUniverse = false;
  assert.equal(rowOf(RUN(d).rows, 'qM', 4).team, 'TE', 'a non-universe week-w row yields to the latest earlier row');
  // a QB with no team yet
  assert.equal(rowOf(BASE.rows, 'qCnt', 4), undefined, 'no week-4 row at all');
  assert.equal(rowOf(BASE.rows, 'qCnt', 9).team, 'TC');
});

test('T-LP-16 end-to-end parity with the app (CR-27): value composition at every checkpoint', () => {
  let startChain = 0, plain = 0, omitted = 0, preseason = 0;
  for (const c of PF.cases) {
    const appPost = new Map(c.app.posteriors);
    const appOmitted = new Set(c.app.omitted);
    const sixteen = new Set(['TE', 'TF']);
    for (const r of BASE.rows.filter(x => x.w === c.w)) {
      if (r.position !== 'QB') { assert.equal(r2(r.cond), appPost.get(r.pid).ros.value, `${r.pid} w${c.w}`); continue; }
      if (r.kind === 'preseason' && r.preChain) {
        // at w = 1 the app has no live state and omits a chain QB; the replay's `preseason` value is the frozen starter prior (the departure of g = 0)
        preseason++;
        assert.ok(appOmitted.has(r.pid), `${r.pid} w1: the app omits a live-chain QB without a state`);
        assert.equal(r.cond, PLAYER.get(r.pid).b1.starterPPG ?? PLAYER.get(r.pid).b1.ppg);
        assert.equal(c.appInputs.scoringArgs.frozenPrior.qbChain[r.pid], true);
        continue;
      }
      if (r.omitted) { omitted++; assert.ok(appOmitted.has(r.pid), `${r.pid} w${c.w}: omitted ids equal the app's`); continue; }
      assert.ok(!appOmitted.has(r.pid), `${r.pid} w${c.w}: not omitted by the app either`);
      const rec = appPost.get(r.pid);
      if (rec.start) {
        startChain++;
        assert.equal(r2(r.cond), rec.start.starterValue, `${r.pid} w${c.w} starterValue`);
        if (sixteen.has(r.team)) assert.equal(r.uncond, r.cond * r.fraction, `${r.pid}: 16-game team, uncond = cond × the data fraction`);
        else assert.equal(r2(r.uncond), rec.ros.value, `${r.pid} w${c.w} ros.value`);
      } else { plain++; assert.equal(r2(r.cond), rec.ros.value, `${r.pid} w${c.w}`); }
    }
    // every app omission is a data omission or a g = 0 preseason row
    for (const id of appOmitted) { const r = rowOf(BASE.rows, id, c.w); if (r) assert.ok(r.omitted || r.kind === 'preseason', `${id} w${c.w}`); }
  }
  assert.ok(startChain >= 15 && plain >= 15 && omitted >= 1 && preseason >= 5, `covered: ${startChain} start-chain, ${plain} plain, ${omitted} omitted, ${preseason} preseason`);
});

test('T-LP-17 adapter: writes only the two benchw files, stops on meta.from ≠ 2014 and on a missing primary passer', () => {
  const dirRel = `research/learned-projection/.cache/test-lp1b-${process.pid}`;
  const dir = repoPath(dirRel);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const writeJsonl = (n, rows) => fs.writeFileSync(path.join(dir, n), rows.map(r => JSON.stringify(r)).join('\n') + '\n');
  const writePanel = (from = 2014) => {
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ generatedAt: '2026-01-01T00:00:00.000Z', from, to: 2025 }));
    writeJsonl('weeks.jsonl', DATA.weekRows); writeJsonl('bench.jsonl', DATA.bench); writeJsonl('seasons.jsonl', DATA.seasons); writeJsonl('teams.jsonl', [{ x: 1 }]);
  };
  const hashes = () => Object.fromEntries(fs.readdirSync(dir).filter(f => !f.startsWith('benchw')).map(f => [f, crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, f))).digest('hex')]));
  const loadFor = (gamelogsFile) => ({
    loadGameLogs: () => gamelogsFile, loadSchedule: () => DATA.scheduleFile, loadDepth: () => DATA.depthFile, loadRosterWeekly: () => DATA.rosterweeklyFile,
    loadSeasonTotals: (y) => DATA.careerStats[y] ?? null,
    loadQbTakeoverConstants: () => JSON.parse(fs.readFileSync(new URL('../backtests/2026-10-03-qb-takeover-constants.json', import.meta.url), 'utf8')),
    loadInSeasonConstants: () => constantsFile,
  });
  try {
    writePanel();
    const before = hashes();
    const meta = runExportWeekly({ load: loadFor(DATA.gamelogsFile), panelDir: dirRel, seasons: [2023] });
    assert.deepEqual(fs.readdirSync(dir).sort(), ['bench.jsonl', 'benchw.jsonl', 'benchw.meta.json', 'meta.json', 'seasons.jsonl', 'teams.jsonl', 'weeks.jsonl']);
    assert.deepEqual(hashes(), before, 'the panel files are untouched');
    const rows = fs.readFileSync(path.join(dir, 'benchw.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
    assert.equal(rows.length, BASE.rows.length);
    assert.equal(meta.counts.rows, rows.length);
    assert.equal(meta.panelGeneratedAt, '2026-01-01T00:00:00.000Z');
    assert.equal(meta.checks.c6.bySeason[2023].withPrimary, 99, 'TD\'s week-8 game has no primary passer');
    assert.equal(meta.checks.c3.pass, true);
    assert.deepEqual(rows[0], JSON.parse(JSON.stringify(BASE.rows[0])), 'the adapter writes what buildBenchwSeason computes');
    // meta.from ≠ 2014 → stop
    writePanel(2015);
    assert.throws(() => runExportWeekly({ load: loadFor(DATA.gamelogsFile), panelDir: dirRel, seasons: [2023] }), /2014–2025/);
    // three team-games without a primary passer (97/100 < 0.99) → stop, nothing written
    writePanel();
    fs.rmSync(path.join(dir, 'benchw.jsonl')); fs.rmSync(path.join(dir, 'benchw.meta.json'));
    const g = JSON.parse(JSON.stringify(DATA.gamelogsFile));
    for (const p of Object.values(g.players)) p.games = p.games.filter(x => !(x.week === 2 && (x.team === 'TA' || x.team === 'TB')));
    assert.throws(() => runExportWeekly({ load: loadFor(g), panelDir: dirRel, seasons: [2023] }), /coverage/);
    assert.deepEqual(fs.readdirSync(dir).filter(f => f.startsWith('benchw')), [], 'a stop writes nothing');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
