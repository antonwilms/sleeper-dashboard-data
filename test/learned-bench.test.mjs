/**
 * test/learned-bench.test.mjs — LP-1a season-benchmark tests T-LP-8, T-LP-11
 * (task .claude/tasks/learned-projection-1a-harness.md §7). Fixtures: test/fixtures/learned-panel/.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { b2QualifyingSeasons, b2Benchmark, seasonBench } from '../lib/learnedBench.mjs';
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
