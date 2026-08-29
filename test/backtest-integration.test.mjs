/**
 * test/backtest-integration.test.mjs — Integration tests via injectable loader.
 *
 * Exercises the full assembleCohort → runMetric / runValidate pipeline against
 * in-memory fixtures that mirror production file shapes.  These are the tests
 * that would have caught all three symptoms while the 131 unit tests stayed green.
 *
 * Fixture design
 * ──────────────
 * Panel: predictor years 2019, 2020, 2021 → outcome years 2020, 2021, 2022.
 *  - 2019: off_snp omitted from season-totals → snapShare null → listwise-dropped.
 *  - 2020, 2021: full stats incl. off_snp.
 *
 * Players: 4 WRs on KC + 3 WRs on DAL + 1 TE on KC + 1 TE on DAL (9 per year).
 * Team totals: rec_rz_tgt = KC 70, DAL 50 (both ≥ TEAM_DENOM_MIN=20).
 * Outcome PPG planted as 4 + 35·teamRzShare − 8·rzOwnRate so that:
 *   • teamRzShare β > 0  (validate PASS criterion 1)
 *   • rzOwnRate  β < 0  (validate PASS criterion 2)
 *   • targetShare–outcomePPG raw r > 0  (metric orientation check)
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeMetric,
  normalizeControls,
  assembleCohort,
  runMetric,
  runValidate,
} from '../scripts/backtest-run.mjs';
import { CORRUPT_PREDICTOR_SEASONS } from '../lib/backtest.mjs';

// ─── Fixture helpers ──────────────────────────────────────────────────────────

// Production advstats envelope (mirrors nflverse/advstats/<year>.json)
function makeAdvstats(season, players) {
  return {
    schemaVersion: 1,
    season,
    generatedAt:   '2026-01-01T00:00:00.000Z',
    rowCount:      players.length,
    unmapped:      0,
    // sleeperId is a property on each player object (used as map key here)
    players:       Object.fromEntries(players.map(p => [p.sleeperId, p])),
  };
}

// Per-player advstats shape — includes sleeperId so makeAdvstats can key it
function makePlayer(sleeperId, position, team, targetShare, airYardsShare) {
  const wopr = parseFloat((1.5 * targetShare + 0.7 * airYardsShare).toFixed(3));
  const racr = position === 'TE' ? 0.8 : 1.1;
  return {
    sleeperId,            // used as map key in makeAdvstats
    gsisId: `gsis-${sleeperId}`,
    name:   `Player ${sleeperId}`,
    position,
    team,
    targetShare,
    airYardsShare,
    wopr,
    racr,
    components: { targets: 80, airYards: 600, recYards: 700, receptions: 60, weeks: 17 },
  };
}

// ─── Team-total constants (used for planted PPG and share verification) ───────

// KC: w1(25)+w2(18)+w3(10)+w4(5)+t1(12) = 70
// DAL: w5(22)+w6(12)+w7(6)+t2(10) = 50
const KC_RZ = 70, DAL_RZ = 50;

// Planted outcome PPG = 4 + 35·teamRzShare − 8·rzOwnRate
// Same formula applied for all outcome years (stats identical across 2020/2021).
function plantedFP(recTgt, recRzTgt, teamRzTotal) {
  const teamRzShare = recRzTgt / teamRzTotal;
  const rzOwnRate   = recRzTgt / recTgt;
  return Math.round((4 + 35 * teamRzShare - 8 * rzOwnRate) * 16);
}

// Season-totals entry: both predictor stats (for use as predictor year) and
// planted fantasyPoints (for use as outcome year).  withSnap controls off_snp.
function makeTotalsEntry(recTgt, recRzTgt, offSnp, tmOffSnp, teamRzTotal) {
  const stats = { rec_tgt: recTgt, rec_rz_tgt: recRzTgt, rush_att: 0, rush_rz_att: 0 };
  if (offSnp !== null) {
    stats.off_snp    = offSnp;
    stats.tm_off_snp = tmOffSnp;
  }
  return { stats, gamesPlayed: 16, fantasyPoints: plantedFP(recTgt, recRzTgt, teamRzTotal) };
}

function makeSeasonTotals(withSnap) {
  const sn = (v) => withSnap ? v : null;
  return {
    // KC players
    w1: makeTotalsEntry(100, 25, sn(900), sn(1000), KC_RZ),
    w2: makeTotalsEntry(80,  18, sn(800), sn(1000), KC_RZ),
    w3: makeTotalsEntry(55,  10, sn(700), sn(1000), KC_RZ),
    w4: makeTotalsEntry(35,   5, sn(500), sn(1000), KC_RZ),
    t1: makeTotalsEntry(30,  12, sn(400), sn(1000), KC_RZ),
    // DAL players
    w5: makeTotalsEntry(90,  22, sn(850), sn(1000), DAL_RZ),
    w6: makeTotalsEntry(65,  12, sn(750), sn(1000), DAL_RZ),
    w7: makeTotalsEntry(40,   6, sn(600), sn(1000), DAL_RZ),
    t2: makeTotalsEntry(25,  10, sn(350), sn(1000), DAL_RZ),
  };
}

// ─── Fixture registry ─────────────────────────────────────────────────────────

const PLAYERS = [
  // KC: 4 WRs + 1 TE
  makePlayer('w1', 'WR', 'KC', 0.30, 0.25),
  makePlayer('w2', 'WR', 'KC', 0.25, 0.20),
  makePlayer('w3', 'WR', 'KC', 0.18, 0.14),
  makePlayer('w4', 'WR', 'KC', 0.12, 0.09),
  makePlayer('t1', 'TE', 'KC', 0.10, 0.05),
  // DAL: 3 WRs + 1 TE
  makePlayer('w5', 'WR', 'DAL', 0.28, 0.22),
  makePlayer('w6', 'WR', 'DAL', 0.22, 0.17),
  makePlayer('w7', 'WR', 'DAL', 0.16, 0.12),
  makePlayer('t2', 'TE', 'DAL', 0.08, 0.04),
];

// Advstats: same players for all years (same targetShare/airYardsShare)
const ADVSTATS = {
  2019: makeAdvstats(2019, PLAYERS),
  2020: makeAdvstats(2020, PLAYERS),
  2021: makeAdvstats(2021, PLAYERS),
};

// Season-totals:
//  2019 — predictor-year stats without snap (off_snp omitted → snapShare null)
//  2020, 2021 — predictor-year stats with snap AND proper planted fantasyPoints
//               (serves as both predictor year and outcome year for prior predictor)
//  2022 — outcome-only year; re-use makeSeasonTotals(true) since stats are ignored
const SEASON_TOTALS = {
  2019: makeSeasonTotals(false),
  2020: makeSeasonTotals(true),
  2021: makeSeasonTotals(true),
  2022: makeSeasonTotals(true),  // used only as outcome year for 2021 predictor
};

// Injectable loader — all in-memory, no disk I/O
const LOAD = {
  loadAdvstats:     (yr) => ADVSTATS[yr]      ?? null,
  loadSeasonTotals: (yr) => SEASON_TOTALS[yr]  ?? null,
};

// Full-panel cohort helper (predictor years 2019–2021, outcomes 2020–2022)
function wrCohort() {
  return assembleCohort({ position: 'WR', fromYear: 2019, toYear: 2022, minOutcomeGames: 6, load: LOAD });
}

// ─── 1. n > 0 for single-position metric run ──────────────────────────────────

describe('Integration 1: n > 0 for WR targetShare run', () => {
  test('metric run produces n > 0', () => {
    const { rows } = wrCohort();
    const report = runMetric(rows, 'targetShare', 'WR', { minOutcomeGames: 6, fromYear: 2019, toYear: 2022 });
    assert.ok(report.n > 0, `expected n > 0, got ${report.n}`);
  });
});

// ─── 2. snake_case == camelCase ───────────────────────────────────────────────

describe('Integration 2: snake_case and camelCase metric args yield identical results', () => {
  test('normalizeMetric maps both to same key', () => {
    assert.equal(normalizeMetric('target_share'), normalizeMetric('targetShare'));
  });

  test('runMetric via each casing gives identical n > 0', () => {
    const { rows } = wrCohort();
    const opts = { minOutcomeGames: 6, fromYear: 2019, toYear: 2022 };
    const rSnake = runMetric(rows, normalizeMetric('target_share'),  'WR', opts);
    const rCamel = runMetric(rows, normalizeMetric('targetShare'),   'WR', opts);
    assert.ok(rSnake.n > 0, `snake n > 0, got ${rSnake.n}`);
    assert.ok(rCamel.n > 0, `camel n > 0, got ${rCamel.n}`);
    assert.equal(rSnake.n, rCamel.n, 'n identical');
    assert.equal(rSnake.rawPearson, rCamel.rawPearson, 'rawPearson identical');
  });
});

// ─── 3. Contributing predictor years = [2020, 2021] ─────────────────────────

describe('Integration 3: predictorYears populated and correct', () => {
  test('2019 dropped (snapShare null); [2020, 2021] survive', () => {
    const { rows } = wrCohort();
    const report = runMetric(rows, 'targetShare', 'WR', { minOutcomeGames: 6, fromYear: 2019, toYear: 2022 });
    // Must not be [] / [undefined] / [NaN]
    assert.deepEqual(report.meta.predictorYears, [2020, 2021],
      `expected [2020, 2021], got ${JSON.stringify(report.meta.predictorYears)}`);
  });
});

// ─── 4. Positive raw correlation ─────────────────────────────────────────────

describe('Integration 4: rawPearson > 0 for targetShare / WR', () => {
  test('planted positive targetShare→PPG correlation is recovered', () => {
    const { rows } = wrCohort();
    const report = runMetric(rows, 'targetShare', 'WR', { minOutcomeGames: 6, fromYear: 2019, toYear: 2022 });
    assert.ok(
      report.rawPearson != null && report.rawPearson > 0,
      `rawPearson should be > 0, got ${report.rawPearson}`
    );
  });
});

// ─── 5. Single-position WR rows match WR subset of validate pooling ───────────

describe('Integration 5: single-position WR rows == WR subset of WR+TE pool', () => {
  test('sleeperIds, targetShare, teamRzShare, outcomePPG identical', () => {
    const opts = { fromYear: 2020, toYear: 2022, minOutcomeGames: 6, load: LOAD };

    const { rows: wrOnly } = assembleCohort({ ...opts, position: 'WR' });
    const { rows: wrPool } = assembleCohort({ ...opts, position: 'WR' });
    const { rows: tePool } = assembleCohort({ ...opts, position: 'TE' });
    const combinedWR = [...wrPool, ...tePool].filter(r => r.position === 'WR');

    const key = r => `${r.sleeperId}-${r.predictorYear}`;
    const sortedOnly   = wrOnly.slice().sort((a, b)     => key(a).localeCompare(key(b)));
    const sortedPooled = combinedWR.slice().sort((a, b) => key(a).localeCompare(key(b)));

    assert.equal(sortedOnly.length, sortedPooled.length, 'same row count');
    for (let i = 0; i < sortedOnly.length; i++) {
      const a = sortedOnly[i], b = sortedPooled[i];
      assert.equal(a.sleeperId,   b.sleeperId,   `sleeperId mismatch at row ${i}`);
      assert.equal(a.targetShare, b.targetShare,  `targetShare mismatch at ${a.sleeperId}`);
      assert.equal(a.teamRzShare, b.teamRzShare,  `teamRzShare mismatch at ${a.sleeperId}`);
      assert.equal(a.outcomePPG,  b.outcomePPG,   `outcomePPG mismatch at ${a.sleeperId}`);
    }
  });
});

// ─── 6. Pre-2020 rows built but snapShare null, dropped from runMetric ────────

describe('Integration 6: pre-2020 cohort builds but rows have snapShare null', () => {
  test('assembleCohort builds rows; all have snapShare null', () => {
    const { rows } = assembleCohort({
      position: 'WR', fromYear: 2019, toYear: 2020, minOutcomeGames: 6, load: LOAD,
    });
    assert.ok(rows.length > 0,
      `expected rows to be built from 2019 predictor year, got ${rows.length}`);
    assert.ok(rows.every(r => r.snapShare === null),
      'all 2019 rows should have snapShare === null (off_snp not tracked pre-2020)');
  });

  test('runMetric on 2019-only rows: n = 0, predictorYears empty', () => {
    const { rows } = assembleCohort({
      position: 'WR', fromYear: 2019, toYear: 2020, minOutcomeGames: 6, load: LOAD,
    });
    const report = runMetric(rows, 'targetShare', 'WR', { minOutcomeGames: 6, fromYear: 2019, toYear: 2020 });
    assert.equal(report.n, 0, 'n = 0 after listwise deletion of snapShare-null rows');
    assert.deepEqual(report.meta.predictorYears, [],
      `predictorYears should be [], got ${JSON.stringify(report.meta.predictorYears)}`);
  });
});

// ─── 8. normalizeControls ────────────────────────────────────────────────────

describe('Integration 8: normalizeControls', () => {
  test('accepts a valid single name', () => {
    assert.deepEqual(normalizeControls('overallShare'), ['overallShare']);
  });

  test('accepts a valid comma-separated subset', () => {
    assert.deepEqual(normalizeControls('overallShare,rzOwnRate'), ['overallShare', 'rzOwnRate']);
  });

  test('accepts all three controls', () => {
    assert.deepEqual(
      normalizeControls('overallShare,snapShare,rzOwnRate'),
      ['overallShare', 'snapShare', 'rzOwnRate']
    );
  });

  test('throws on unknown name', () => {
    assert.throws(() => normalizeControls('snapRate'),          /unknown control/);
    assert.throws(() => normalizeControls('overallShare,bad'), /unknown control/);
  });
});

// ─── 9. --controls without snapShare widens the panel ────────────────────────

describe('Integration 9: excluding snapShare yields strictly larger cohort and earlier panel', () => {
  test('2-control run on fixture including pre-2020 year: n larger and predictorYears starts earlier', () => {
    // wrCohort() spans 2019–2022; 2019 rows have snapShare=null.
    const { rows } = wrCohort();
    const opts = { minOutcomeGames: 6, fromYear: 2019, toYear: 2022 };

    const report3 = runMetric(rows, 'targetShare', 'WR', { ...opts });
    const report2 = runMetric(rows, 'targetShare', 'WR', {
      ...opts,
      controls: ['overallShare', 'rzOwnRate'],
    });

    assert.ok(
      report2.n > report3.n,
      `excluding snapShare should yield larger n: got ${report2.n} vs ${report3.n}`
    );
    assert.ok(
      report2.meta.predictorYears[0] < report3.meta.predictorYears[0],
      `excluding snapShare should yield earlier panel start: ` +
      `got ${report2.meta.predictorYears[0]} vs ${report3.meta.predictorYears[0]}`
    );
  });
});

// ─── 10. Default controls (no option) is unchanged ───────────────────────────

describe('Integration 10: default (no controls option) equals explicit 3-control run', () => {
  test('n and controls metadata identical', () => {
    const { rows } = wrCohort();
    const opts = { minOutcomeGames: 6, fromYear: 2019, toYear: 2022 };

    const reportDefault  = runMetric(rows, 'targetShare', 'WR', { ...opts });
    const reportExplicit = runMetric(rows, 'targetShare', 'WR', {
      ...opts,
      controls: ['overallShare', 'snapShare', 'rzOwnRate'],
    });

    assert.equal(reportDefault.n, reportExplicit.n, 'n identical');
    assert.deepEqual(
      reportDefault.meta.controls,
      reportExplicit.meta.controls,
      'meta.controls identical'
    );
    assert.equal(
      reportDefault.rawPearson, reportExplicit.rawPearson,
      'rawPearson identical'
    );
  });
});

// ─── 11. CORRUPT_PREDICTOR_SEASONS exclusion (advstats-2016-gate.md §5) ───────

describe('Integration 11: 2016 excluded from airYardsShare/wopr/racr, not targetShare', () => {
  // reingest-2016.md §5.2 — CORRUPT_PREDICTOR_SEASONS is empty in production (2016 was
  // re-ingested clean). These tests are synthetic fixtures that merely use 2016 as a year
  // label to exercise the exclusion machinery, so save/restore the real exported object
  // around this describe block rather than widening runMetric's signature for a test seam.
  // Restore in `after` (not at the end of each test body) so a failing assertion can't leak
  // the entry into other test files.
  before(() => {
    CORRUPT_PREDICTOR_SEASONS.airYardsShare = [2016];
    CORRUPT_PREDICTOR_SEASONS.wopr = [2016];
    CORRUPT_PREDICTOR_SEASONS.racr = [2016];
  });
  after(() => {
    delete CORRUPT_PREDICTOR_SEASONS.airYardsShare;
    delete CORRUPT_PREDICTOR_SEASONS.wopr;
    delete CORRUPT_PREDICTOR_SEASONS.racr;
  });

  // Standalone 3-year fixture (predictor 2015–2017, outcomes 2016–2018) — kept separate
  // from the 2019–2022 fixture above so the exclusion years line up cleanly.
  const YEAR_PLAYERS = {
    2015: [makePlayer('y1', 'WR', 'KC', 0.30, 0.25), makePlayer('y2', 'WR', 'KC', 0.20, 0.16)],
    2016: [makePlayer('y1', 'WR', 'KC', 0.30, 0.25), makePlayer('y2', 'WR', 'KC', 0.20, 0.16)],
    2017: [makePlayer('y1', 'WR', 'KC', 0.30, 0.25), makePlayer('y2', 'WR', 'KC', 0.20, 0.16)],
  };
  const Y_ADVSTATS = Object.fromEntries(
    Object.entries(YEAR_PLAYERS).map(([y, ps]) => [y, makeAdvstats(Number(y), ps)])
  );
  const Y_TOTALS_FOR = (recTgt, recRzTgt) => makeTotalsEntry(recTgt, recRzTgt, 900, 1000, 70);
  const Y_SEASON_TOTALS = {
    2015: { y1: Y_TOTALS_FOR(100, 25), y2: Y_TOTALS_FOR(80, 18) },
    2016: { y1: Y_TOTALS_FOR(100, 25), y2: Y_TOTALS_FOR(80, 18) },
    2017: { y1: Y_TOTALS_FOR(100, 25), y2: Y_TOTALS_FOR(80, 18) },
    2018: { y1: Y_TOTALS_FOR(100, 25), y2: Y_TOTALS_FOR(80, 18) },
  };
  const Y_LOAD = {
    loadAdvstats:     (yr) => Y_ADVSTATS[yr]     ?? null,
    loadSeasonTotals: (yr) => Y_SEASON_TOTALS[yr] ?? null,
  };

  function yCohort() {
    return assembleCohort({ position: 'WR', fromYear: 2015, toYear: 2018, minOutcomeGames: 6, load: Y_LOAD });
  }

  for (const metric of ['airYardsShare', 'wopr', 'racr']) {
    test(`${metric}: 2016 dropped from predictorYears and n drops (not just the reported panel)`, () => {
      const { rows } = yCohort();
      const opts = { minOutcomeGames: 6, fromYear: 2015, toYear: 2018, controls: [] };

      const filtered = runMetric(rows, metric, 'WR', opts);
      assert.deepEqual(filtered.meta.predictorYears, [2015, 2017],
        `expected 2016 absent from predictorYears, got ${JSON.stringify(filtered.meta.predictorYears)}`);
      assert.deepEqual(filtered.excludedSeasons, [2016]);

      // n must also drop — the regression-proof requirement from §5.2/§9: checking
      // predictorYears alone is insufficient, since that check would pass even if β
      // were still computed over the unfiltered (contaminated) row set.
      const unfilteredRows = rows; // same rows; compare against a metric with no exclusion
      const unfilteredReport = runMetric(unfilteredRows, 'targetShare', 'WR', opts);
      assert.ok(filtered.n < unfilteredReport.n,
        `expected filtered n (${filtered.n}) < unfiltered targetShare n (${unfilteredReport.n})`);
    });
  }

  test('targetShare: 2016 is NOT excluded — predictorYears includes it, excludedSeasons is empty', () => {
    const { rows } = yCohort();
    const report = runMetric(rows, 'targetShare', 'WR', { minOutcomeGames: 6, fromYear: 2015, toYear: 2018, controls: [] });
    assert.deepEqual(report.meta.predictorYears, [2015, 2016, 2017]);
    assert.deepEqual(report.excludedSeasons, []);
  });

});

// ─── 7. runValidate qualitative PASS ─────────────────────────────────────────

describe('Integration 7: runValidate returns qualitative PASS', () => {
  test('WR+TE: teamRzShare β > 0, rzOwnRate β < 0, monotonic, raw r > 0, predictorYears populated', () => {
    const resultRows = runValidate({
      fromYear: 2019, toYear: 2022, minOutcomeGames: 6, load: LOAD,
    });

    const wrte = resultRows.find(r => r.label === 'WR+TE');
    assert.ok(wrte, 'WR+TE result row present');

    assert.ok(
      wrte.beta != null && wrte.beta > 0,
      `teamRzShare β should be > 0, got ${wrte.beta}`
    );
    assert.ok(
      wrte.ownRateBeta != null && wrte.ownRateBeta < 0,
      `rzOwnRate β should be < 0, got ${wrte.ownRateBeta}`
    );
    assert.equal(wrte.monotonic, true, 'quintiles should be monotonic');
    assert.ok(
      wrte.rawPearson != null && wrte.rawPearson > 0,
      `raw r should be > 0, got ${wrte.rawPearson}`
    );
    assert.ok(
      wrte.predictorYears.length > 0 &&
      !wrte.predictorYears.includes(undefined) &&
      !wrte.predictorYears.some(y => isNaN(y)),
      `predictorYears should be populated (not []/[undefined]/[NaN]), got ${JSON.stringify(wrte.predictorYears)}`
    );
    assert.equal(wrte.pass, true, 'overall WR+TE qualitative PASS should be true');
  });
});
