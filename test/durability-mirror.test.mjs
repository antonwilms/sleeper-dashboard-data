/**
 * test/durability-mirror.test.mjs — lib/durabilityMirror.mjs parity and unit gate
 * (absence-classification-b.md §3). DM-1 reads the DM-0 fixture (pre-correction inputs at data
 * 4f469cc), never the live nfl/season-totals/, which Stage C rewrites.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { fileURLToPath } from 'url';

import {
  wasContributorSeason, classifyInjurySeason, projectedGamesFor, dynastyInjurySeasonCount, DURABILITY_CONSTANTS,
} from '../lib/durabilityMirror.mjs';
import { parityReport, ABSENCE_DEFAULTS } from '../scripts/absence-run.mjs';

const FIXTURE = JSON.parse(fs.readFileSync(fileURLToPath(new URL('./fixtures/durability-parity-2026-10-04.json', import.meta.url)), 'utf8'));

// ─── DM-0 / DM-1 / DM-2 ──────────────────────────────────────────────────────

test('DM-0: the fixture records its source rev and covers every veteran snapshot row', () => {
  assert.equal(FIXTURE.sourceRev, '4f469cc');
  assert.equal(FIXTURE.snapshot, '2026-10-04');
  assert.equal(Object.keys(FIXTURE.snapshotRows).length, 432);
  assert.deepEqual(Object.keys(FIXTURE.seasons).map(Number), Array.from({ length: 14 }, (_, i) => 2012 + i));
});

test('DM-1: ≥ 99% of the snapshot\'s veteran rows match projectedGames, injurySeasons and absenceShapeFactor', () => {
  const r = parityReport(FIXTURE);
  for (const m of r.mismatches) console.log(`[DM-1] mismatch ${m.id} ${m.position}: mirror ${JSON.stringify(m.mirror)} vs snapshot ${JSON.stringify(m.snapshot)}`);
  console.log(`[DM-1] ${r.matched}/${r.rows} matched; ${r.noQualifying} with no qualifying season (reported), ${r.nonSkill} non-skill`);
  assert.ok(r.rows >= 400, `only ${r.rows} comparable rows`);
  assert.ok(r.rate >= ABSENCE_DEFAULTS.parityMin, `parity ${r.rate} below ${ABSENCE_DEFAULTS.parityMin}`);
});

test('DM-2: bounce-back agreement is reported, not asserted', () => {
  const r = parityReport(FIXTURE);
  console.log(`[DM-2] bounce-back agreement ${r.bounceBack.agree}/${r.bounceBack.rows} = ${(r.bounceBack.rate * 100).toFixed(1)}%`);
  assert.ok(r.bounceBack.rows > 0);
});

// ─── DM-3 units ──────────────────────────────────────────────────────────────

test('DM-3 wasContributorSeason: below-floor snap share falls through to starts, then volume (the code, not the app comment)', () => {
  const lowSnap = { off_snp: 100, tm_off_snp: 1000 };            // 0.10 < 0.40
  assert.equal(wasContributorSeason({ gamesPlayed: 8, gamesStarted: 5, stats: lowSnap }, 'WR'), true, 'starts rescue a below-floor snap share');
  assert.equal(wasContributorSeason({ gamesPlayed: 8, gamesStarted: 0, stats: { ...lowSnap, rec_tgt: 40 } }, 'WR'), true, 'volume rescues (40/8 = 5 ≥ 4)');
  assert.equal(wasContributorSeason({ gamesPlayed: 8, gamesStarted: 0, stats: { ...lowSnap, rec_tgt: 8 } }, 'WR'), false, 'all three below');
  assert.equal(wasContributorSeason({ gamesPlayed: 8, gamesStarted: null, stats: {} }, 'WR'), false, 'all absent');
  assert.equal(wasContributorSeason({ gamesPlayed: 0, gamesStarted: 9, stats: {} }, 'WR'), false, 'gp 0');
  assert.equal(wasContributorSeason({ gamesPlayed: 8, stats: { off_snp: 450, tm_off_snp: 1000 } }, 'WR'), true, 'snap share ≥ floor');
  assert.equal(DURABILITY_CONSTANTS.SNAP_CONTRIB_FLOOR, 0.40);
});

const row = (gp, dnp, gs, extra = {}) => ({ gamesPlayed: gp, dnpWeeks: dnp, gamesStarted: gs, fantasyPoints: gp * 10, stats: {}, ...extra });

test('DM-3 classifyInjurySeason: the ±1 adjacent rescue respects throughSeason', () => {
  // 2018: gp 9, dnp 3, no evidence of its own; 2019 has a starter season.
  const careerStats = { 2017: { P: row(16, 0, 0) }, 2018: { P: row(9, 3, 0) }, 2019: { P: row(16, 0, 12) } };
  // as-of 2018: the 2019 row is absent and 2017 has no evidence → not an injury season
  const asOf2018 = projectedGamesFor(careerStats, 'P', 'WR', { throughSeason: 2018 });
  assert.equal(asOf2018.injurySeasons, 0);
  // as-of 2019: the 2019 starter season rescues 2018
  const asOf2019 = projectedGamesFor(careerStats, 'P', 'WR', { throughSeason: 2019 });
  assert.equal(asOf2019.injurySeasons, 1);
  // the raw predicate (no view) does see 2019
  assert.equal(classifyInjurySeason(careerStats, 'P', 'WR', 2018), true);
});

test('DM-3 projectedGamesFor / dynastyInjurySeasonCount: weights, multipliers, null with no qualifying season', () => {
  const stable = { 2017: { P: row(16, 0, 16) }, 2018: { P: row(12, 0, 12) }, 2019: { P: row(8, 0, 8) } };
  const r = projectedGamesFor(stable, 'P', 'RB', { throughSeason: 2019 });
  assert.equal(r.avgGamesBase, 0.2 * 16 + 0.3 * 12 + 0.5 * 8);    // 10.8
  assert.equal(r.projectedGames, 11);
  assert.equal(r.absenceShapeFactor, 1);
  assert.equal(projectedGamesFor({ 2019: { P: row(7, 0, 7) } }, 'P', 'RB', { throughSeason: 2019 }), null);
  // dynasty count iterates every season incl. sub-8 gp: 2 injury seasons here
  const inj = { 2017: { P: row(5, 6, 5) }, 2018: { P: row(6, 5, 6) }, 2019: { P: row(16, 0, 16) } };
  assert.equal(dynastyInjurySeasonCount(inj, 'P', 'WR', { throughSeason: 2019 }), 2);
  assert.equal(dynastyInjurySeasonCount(inj, 'P', 'WR', { throughSeason: 2017 }), 1);
  assert.equal(dynastyInjurySeasonCount({ 2019: { P: row(0, 17, 0) } }, 'P', 'WR', { throughSeason: 2019 }), 0, 'no gp>0 season → 0');
});
