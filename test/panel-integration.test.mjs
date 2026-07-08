/**
 * test/panel-integration.test.mjs — E-0a integration tests (T-10, T-11, T-12).
 *
 * Exercises scripts/panel-run.mjs's injectable-loader pipeline end-to-end
 * (mirrors test/backtest-integration.test.mjs) plus a well-formedness check
 * against whatever e0a artifacts are actually committed on disk.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  resolveScoring,
  buildOutcomeMaps,
  assemblePanel,
  runBaseline,
  runCandidates,
  buildFitReport,
  buildVerdictMarkdown,
} from '../scripts/panel-run.mjs';
import { PANEL_POSITIONS, BASELINE_FEATURES } from '../lib/panel.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

// ─── Shared fixture builders ────────────────────────────────────────────────────

function advstatsFile(season, players) {
  return { schemaVersion: 1, season, generatedAt: '2026-01-01T00:00:00.000Z', rowCount: players.length, unmapped: 0,
    players: Object.fromEntries(players.map(p => [p.sleeperId, p])) };
}
function rosterFile(season, players) {
  return { schemaVersion: 1, season, generatedAt: '2026-01-01T00:00:00.000Z', rowCount: players.length,
    players: Object.fromEntries(players.map(p => [p.sleeperId, { team: p.team, position: p.position, status: 'ACT', fullName: p.sleeperId }])) };
}
function weeklyPoints(base) {
  const wp = {};
  for (let w = 1; w <= 16; w++) wp[w] = base + (w % 3);
  return wp;
}

// ═══════════════════════════════════════════════════════════════════════════
// T-10 — outcome basis
// ═══════════════════════════════════════════════════════════════════════════

describe('T-10: outcome basis', () => {
  const SNAPSHOT = {
    scoringBasis: 'custom',
    scoringSettings: { rec: 1, rec_yd: 0.1, rec_td: 6, bonus_xyz: 5, rec_ypr: 2 }, // bonus_xyz absent from universe; rec_ypr is a RATE_KEY
  };
  const SEASON_TOTALS_2022 = {
    p1: {
      team: 'KC', gamesPlayed: 16,
      stats: { rec_tgt: 50, rec: 40, rec_yd: 500, rec_td: 5 },
      fantasyPoints: 200, // deliberately different from the in-basis dot-product, to prove basis routing
      weeklyPoints: weeklyPoints(12),
    },
  };
  const load = {
    loadSnapshot: (date) => (date === '2026-07-05' ? SNAPSHOT : null),
    loadSeasonTotals: (year) => (year === 2022 ? SEASON_TOTALS_2022 : {}),
    loadAdvstats: () => null,
    loadRoster: () => null,
  };

  test('in-basis: resolveScoring + buildOutcomeMaps call buildInBasisOutcomes, surfacing droppedTerms/excludedRateKeys', () => {
    const { scoringSettings, basisMeta } = resolveScoring({ basis: 'in-basis', scoringFrom: '2026-07-05', load });
    assert.deepEqual(scoringSettings, SNAPSHOT.scoringSettings);
    assert.equal(basisMeta.type, 'custom');

    const maps = buildOutcomeMaps([2022], { basis: 'in-basis', scoringSettings }, load);
    assert.ok(maps[2022].droppedTerms.includes('bonus_xyz'), 'droppedTerms surfaces bonus_xyz (absent from stats universe)');
    assert.ok(maps[2022].excludedRateKeys.includes('rec_ypr'), 'excludedRateKeys surfaces rec_ypr (a RATE_KEY)');

    const rec = maps[2022].outcomes.get('p1');
    // in-basis dot product: rec*1 + rec_yd*0.1 + rec_td*6 = 40 + 50 + 30 = 120; ppg = 120/16 = 7.5
    assert.ok(Math.abs(rec.actualPPG - 7.5) < 1e-6, `in-basis actualPPG should be 7.5, got ${rec.actualPPG}`);
  });

  test('half_ppr: matches stored fantasyPoints/gamesPlayed directly (ignores stats/scoringSettings)', () => {
    const maps = buildOutcomeMaps([2022], { basis: 'half_ppr' }, load);
    const rec = maps[2022].outcomes.get('p1');
    assert.ok(Math.abs(rec.actualPPG - 200 / 16) < 1e-6, `half_ppr actualPPG should be ${200 / 16}, got ${rec.actualPPG}`);
  });

  test('assemblePanel surfaces per-year basis meta (droppedTerms/excludedRateKeys) on the committed panel meta', () => {
    const panel = assemblePanel({ fromYear: 2022, toYear: 2022, scoringFrom: '2026-07-05', load });
    const y = panel.meta.basis.perYear[2022];
    assert.ok(y.droppedTerms.includes('bonus_xyz'));
    assert.ok(y.excludedRateKeys.includes('rec_ypr'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T-11 — full pipeline integration
// ═══════════════════════════════════════════════════════════════════════════

describe('T-11: full pipeline (synthetic 4-year, 3-position dataset)', () => {
  // Predictor years 2020-2023 (4 years); 2021 is the "hole year" — advstats
  // missing → whole year skipped. w2 is a mover: KC through 2022, DAL from 2023.
  const SNAPSHOT = {
    scoringBasis: 'half_ppr',
    scoringSettings: { rec: 0.5, rec_yd: 0.1, rec_td: 6, rush_yd: 0.1, rush_td: 6, pass_yd: 0.04, pass_td: 4, pass_int: -2 },
  };

  function wrStats() { return { rec_tgt: 100, rec: 70, rec_yd: 900, rec_td: 6, rec_rz_tgt: 25, off_snp: 700, tm_off_snp: 1000 }; }
  function rbStats() { return { rush_att: 220, rush_yd: 1000, rush_td: 8, rush_rz_att: 25, rec: 20, rec_yd: 120, off_snp: 600, tm_off_snp: 1000 }; }
  function qbStats() { return { pass_att: 550, pass_yd: 4000, pass_td: 28, pass_int: 10, rush_yd: 150, off_snp: 1000, tm_off_snp: 1000 }; }

  function makeSeasonTotals(year) {
    const w2Team = year >= 2023 ? 'DAL' : 'KC';
    return {
      w1: { team: 'KC', gamesPlayed: 16, stats: wrStats(), fantasyPoints: 0, weeklyPoints: weeklyPoints(10) },
      w2: { team: w2Team, gamesPlayed: 16, stats: wrStats(), fantasyPoints: 0, weeklyPoints: weeklyPoints(9) },
      r1: { team: 'DAL', gamesPlayed: 16, stats: rbStats(), fantasyPoints: 0, weeklyPoints: weeklyPoints(11) },
      r2: { team: 'DAL', gamesPlayed: 16, stats: rbStats(), fantasyPoints: 0, weeklyPoints: weeklyPoints(8) },
      q1: { team: 'KC', gamesPlayed: 16, stats: qbStats(), fantasyPoints: 0, weeklyPoints: weeklyPoints(15) },
    };
  }

  const SEASON_TOTALS = {};
  for (let y = 2018; y <= 2024; y++) SEASON_TOTALS[y] = makeSeasonTotals(y);

  const ADVSTATS = {};
  for (const y of [2020, 2022, 2023]) { // 2021 deliberately omitted (the hole year)
    ADVSTATS[y] = advstatsFile(y, [
      { sleeperId: 'w1', position: 'WR', team: 'KC', airYardsShare: 0.28 },
      { sleeperId: 'w2', position: 'WR', team: y >= 2023 ? 'DAL' : 'KC', airYardsShare: 0.22 },
      { sleeperId: 'r1', position: 'RB', team: 'DAL', airYardsShare: 0.05 },
      { sleeperId: 'r2', position: 'RB', team: 'DAL', airYardsShare: 0.04 },
    ]);
  }

  const ROSTER = {};
  for (const y of [2020, 2021, 2022, 2023]) {
    ROSTER[y] = rosterFile(y, [{ sleeperId: 'q1', team: 'KC', position: 'QB' }]);
  }

  const load = {
    loadSnapshot: (date) => (date === '2026-07-05' ? SNAPSHOT : null),
    loadSeasonTotals: (year) => SEASON_TOTALS[year] ?? null,
    loadAdvstats: (year) => ADVSTATS[year] ?? null,
    loadRoster: (year) => ROSTER[year] ?? null,
  };

  const panel = assemblePanel({ fromYear: 2020, toYear: 2023, scoringFrom: '2026-07-05', load });

  test('2021 (missing advstats) is skipped; rows exist for 2020/2022/2023', () => {
    assert.deepEqual(panel.coverage.skippedYears, [2021]);
    const years = new Set(panel.rows.map(r => r.predictorYear));
    assert.ok(years.has(2020) && years.has(2022) && years.has(2023));
    assert.ok(!years.has(2021));
  });

  test('mover flag set on w2 for the 2023 row (KC in 2022 → DAL in 2023)', () => {
    const row = panel.rows.find(r => r.sleeperId === 'w2' && r.predictorYear === 2023);
    assert.ok(row, 'w2/2023 row exists');
    assert.equal(row.mover, true);
  });

  test('QB rows are built via roster-position fallback (no advstats QB coverage)', () => {
    const qbRows = panel.rows.filter(r => r.position === 'QB');
    assert.ok(qbRows.length > 0, 'at least one QB row present');
  });

  const baseline = runBaseline(panel, {});
  const candidates = runCandidates(panel, {});
  const fitReport = buildFitReport(panel, baseline, candidates, {});

  test('FitReport is well-formed: every §5 key present, per-position blocks complete', () => {
    assert.ok(fitReport.meta && fitReport.baseline && fitReport.candidates);
    for (const position of PANEL_POSITIONS) {
      assert.ok(position in fitReport.baseline, `baseline has a ${position} block`);
      assert.ok('pooled' in fitReport.baseline[position]);
      assert.ok('perEvalYear' in fitReport.baseline[position]);
      assert.ok('movers' in fitReport.baseline[position]);
    }
    assert.ok(Array.isArray(fitReport.candidates) && fitReport.candidates.length > 0);
  });

  test('every candidate verdict is one of the four labels', () => {
    const labels = ['CLEARS', 'NO-GAIN', 'DEGRADES', 'UNSTABLE'];
    for (const c of fitReport.candidates) {
      assert.ok(labels.includes(c.verdict), `unexpected verdict '${c.verdict}' for ${c.candidate}/${c.position}`);
    }
  });

  test('buildVerdictMarkdown contains the coverage table and verdict lines', () => {
    const md = buildVerdictMarkdown(panel, fitReport);
    assert.ok(md.includes('| Position | Year | Assembled | Surviving | Movers | Drop reasons |'), 'coverage table header present');
    assert.ok(/\*\*Verdict: (CLEARS|NO-GAIN|DEGRADES|UNSTABLE)\*\*/.test(md), 'at least one verdict line present');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T-12 — committed-artifact well-formedness (skips pre-run)
// ═══════════════════════════════════════════════════════════════════════════

describe('T-12: committed e0a artifact well-formedness', () => {
  function listMatching(dir, re) {
    const abs = path.join(REPO_ROOT, dir);
    if (!fs.existsSync(abs)) return [];
    return fs.readdirSync(abs).filter(f => re.test(f)).map(f => path.join(abs, f));
  }

  const panelFiles = listMatching('backtests', /-e0a-panel\.json$/);
  const fitFiles = listMatching('backtests', /-e0a-fit\.json$/);
  const verdictFiles = listMatching('grading', /-e0a-verdict\.md$/);

  test('e0a artifacts, if committed, are well-formed', (t) => {
    if (panelFiles.length === 0 && fitFiles.length === 0 && verdictFiles.length === 0) {
      t.skip('no e0a artifacts on disk yet (pre-run CI stays green)');
      return;
    }

    for (const f of panelFiles) {
      const panel = JSON.parse(fs.readFileSync(f, 'utf8'));
      assert.ok(panel.meta, `${f}: meta present`);
      assert.equal(panel.meta.attribution, 'current-team', `${f}: attribution === current-team`);
      assert.ok(Array.isArray(panel.coverage.perPositionYear), `${f}: coverage.perPositionYear is an array`);
      for (const row of panel.rows) {
        assert.ok(Number.isFinite(row.outcomePPG), `${f}: row ${row.sleeperId}/${row.predictorYear} has finite outcomePPG`);
        for (const key of BASELINE_FEATURES[row.position]) {
          assert.ok(key in row.features, `${f}: row ${row.sleeperId}/${row.predictorYear} has feature '${key}'`);
        }
      }
    }

    const labels = ['CLEARS', 'NO-GAIN', 'DEGRADES', 'UNSTABLE'];
    for (const f of fitFiles) {
      const fit = JSON.parse(fs.readFileSync(f, 'utf8'));
      assert.ok(fit.meta && fit.baseline && fit.candidates, `${f}: FitReport top-level keys present`);
      for (const c of fit.candidates) {
        assert.ok(labels.includes(c.verdict), `${f}: candidate verdict '${c.verdict}' is a known label`);
      }
    }

    for (const f of verdictFiles) {
      const md = fs.readFileSync(f, 'utf8');
      assert.ok(md.startsWith('# E-0a Grading Baseline Verdict'), `${f}: has the expected header`);
    }
  });
});
