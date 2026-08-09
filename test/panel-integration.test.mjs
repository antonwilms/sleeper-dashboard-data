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
  runFlipGate,
  buildFlipReport,
  buildFlipVerdictMarkdown,
  buildMergedFlipPanel,
  runFit,
  buildFitVerdictMarkdown,
} from '../scripts/panel-run.mjs';
import {
  PANEL_POSITIONS, BASELINE_FEATURES, FLIP_VERDICTS, teamKeyResolver, buildTeamTotalsForSeason,
  FIT_VERDICT_LABELS, FIT_COMBINED_CLAMP, ENVELOPE_FACTORS,
} from '../lib/panel.mjs';
import { readJson } from '../lib/io.mjs';

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

// ═══════════════════════════════════════════════════════════════════════════
// T-F7 — flip-gate integration (R2-REANCHOR, .claude/tasks/r2-flip-gate.md)
// ═══════════════════════════════════════════════════════════════════════════

describe('T-F7: flip-gate integration (synthetic multi-year: mover + hole year + QB)', () => {
  // Mirrors T-11's fixture: predictor years 2020-2023, 2021 is the hole year
  // (advstats missing → whole year skipped), w2 is a mover (KC through 2022, DAL from 2023).
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

  const result = runFlipGate({ fromYear: 2020, toYear: 2023, scoringFrom: '2026-07-05', load });

  test('FlipReport is well-formed: every §4.2 key present; parity + QB invariance hold; verdict is a known label', () => {
    const fr = result.flipReport;
    for (const key of ['meta', 'rowParity', 'qbInvariance', 'undercountRepair', 'featureDelta', 'perPosition', 'cohortPooled', 'sweep', 'verdict', 'verdictInputs']) {
      assert.ok(key in fr, `FlipReport has key '${key}'`);
    }
    assert.equal(fr.rowParity.identical, true);
    assert.equal(fr.qbInvariance.pass, true);
    assert.ok(FLIP_VERDICTS.includes(fr.verdict), `verdict '${fr.verdict}' is a known label`);
  });

  test('buildFlipVerdictMarkdown contains the cohort table, the undercount table, and the verdict line', () => {
    const md = buildFlipVerdictMarkdown(result.flipReport);
    assert.ok(md.includes('| Position | Segment | n |'), 'segment table header present');
    assert.ok(md.includes('current-team unattributed'), 'undercount table present');
    assert.ok(new RegExp(`\\*\\*(${FLIP_VERDICTS.join('|')})\\*\\*`).test(md), 'verdict line present');
  });

  test('buildMergedFlipPanel rows carry attributionCohort + perSeasonTeam.shareTrend and nothing else diverges', () => {
    const merged = buildMergedFlipPanel({ panels: result.panels, cohortByKey: result.cohortByKey });
    for (const row of merged.rows) {
      assert.ok(row.attributionCohort && typeof row.attributionCohort.segment === 'string');
      if (row.position === 'QB') {
        assert.ok(!('perSeasonTeam' in row), 'QB rows omit perSeasonTeam entirely (no shareTrend feature)');
      } else {
        assert.deepEqual(Object.keys(row.perSeasonTeam), ['shareTrend'], 'perSeasonTeam carries only shareTrend');
      }
    }
  });

  test('negative: a tampered mode-independent feature on one per-season row makes the parity gate throw', () => {
    const tamperIdx = result.panels.perSeasonTeam.rows.findIndex(r => r.position !== 'QB');
    assert.ok(tamperIdx >= 0, 'fixture has at least one non-QB row to tamper');
    const tamperedPanels = {
      currentTeam: result.panels.currentTeam,
      perSeasonTeam: {
        ...result.panels.perSeasonTeam,
        rows: result.panels.perSeasonTeam.rows.map((r, i) =>
          i === tamperIdx ? { ...r, features: { ...r.features, snapShare: (r.features.snapShare ?? 0) + 0.5 } } : r),
      },
    };
    assert.throws(
      () => buildFlipReport({
        panels: tamperedPanels,
        baselines: result.baselines,
        cohortByKey: result.cohortByKey,
        opts: { fromYear: 2020, toYear: 2023, minOutcomeGames: 6, ridgeLambda: 1, ridgeSweep: [0.5, 1, 2] },
      }),
      /parity violation/,
      "the same parity guard runFlipGate relies on (buildFlipReport) throws on a tampered mode-independent feature"
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T-F8 — committed r2flip artifact well-formedness (skips pre-run)
// ═══════════════════════════════════════════════════════════════════════════

describe('T-F8: committed r2flip artifact well-formedness', () => {
  function listMatching(dir, re) {
    const abs = path.join(REPO_ROOT, dir);
    if (!fs.existsSync(abs)) return [];
    return fs.readdirSync(abs).filter(f => re.test(f)).map(f => path.join(abs, f));
  }

  const panelFiles = listMatching('backtests', /-r2flip-panel\.json$/);
  const fitFiles = listMatching('backtests', /-r2flip-fit\.json$/);
  const verdictFiles = listMatching('grading', /-r2flip-verdict\.md$/);

  test('r2flip artifacts, if committed, are well-formed', (t) => {
    if (panelFiles.length === 0 && fitFiles.length === 0 && verdictFiles.length === 0) {
      t.skip('no r2flip artifacts on disk yet (pre-run CI stays green)');
      return;
    }

    const segments = ['historical-mover', 'ym1-team-null', 'single-team', 'no-ym1-record'];
    for (const f of panelFiles) {
      const panel = JSON.parse(fs.readFileSync(f, 'utf8'));
      assert.ok(panel.meta, `${f}: meta present`);
      assert.deepEqual(panel.meta.modes, ['current-team', 'per-season-team'], `${f}: meta.modes lists both modes`);
      for (const row of panel.rows) {
        assert.ok(segments.includes(row.attributionCohort?.segment), `${f}: row ${row.sleeperId}/${row.predictorYear} has a known segment`);
      }
    }

    for (const f of fitFiles) {
      const fit = JSON.parse(fs.readFileSync(f, 'utf8'));
      assert.ok(FLIP_VERDICTS.includes(fit.verdict), `${f}: verdict '${fit.verdict}' is a known label`);
      assert.deepEqual(fit.meta.modes, ['current-team', 'per-season-team'], `${f}: meta.modes lists both modes`);
      assert.equal(fit.rowParity.identical, true, `${f}: rowParity.identical`);
    }

    for (const f of verdictFiles) {
      const md = fs.readFileSync(f, 'utf8');
      assert.ok(md.includes('node bin/panel.mjs --flip-gate --write'), `${f}: contains the reproduce command`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T-P5 — live-data spot check (R3-FIT precondition, panel-scale-fix §3.2)
// ═══════════════════════════════════════════════════════════════════════════

describe('T-P5: live-data spot check — TEAM_* exclusion on a real season-totals file', () => {
  test('reconstructed team denominators are not ≈2× the summed real players; aggregateRowsExcluded ≈ team count', (t) => {
    const seasonTotals = readJson('nfl/season-totals/2023.json');
    if (!seasonTotals) {
      t.skip('nfl/season-totals/2023.json not present in this checkout (sparse checkout — keeps CI green)');
      return;
    }

    const teamOf = teamKeyResolver('current-team', { 2023: seasonTotals }, 2023);
    const { totals, aggregateRowsExcluded } = buildTeamTotalsForSeason(seasonTotals, 2023, teamOf);

    const teamCount = Object.keys(seasonTotals).filter(pid => pid.startsWith('TEAM_')).length;
    assert.equal(aggregateRowsExcluded, teamCount, `aggregateRowsExcluded (${aggregateRowsExcluded}) equals the TEAM_* row count (${teamCount})`);
    assert.ok(teamCount > 0, 'fixture sanity: the real file actually carries TEAM_* rows');

    // Known high-volume team: sum the real player rows independently and compare
    // against the reconstructed denominator — it must be close to (not ≈2× of)
    // the player sum, i.e. the pre-fix doubling defect is gone.
    const KNOWN_TEAM = 'KC';
    let summedRecTgt = 0;
    for (const [pid, rec] of Object.entries(seasonTotals)) {
      if (pid.startsWith('TEAM_')) continue;
      if (rec.team !== KNOWN_TEAM) continue;
      summedRecTgt += rec.stats?.rec_tgt || 0;
    }
    const reconstructed = totals[KNOWN_TEAM]?.recTgt ?? 0;
    assert.ok(summedRecTgt > 0, 'fixture sanity: KC has real players with rec_tgt in this file');
    assert.ok(
      reconstructed < summedRecTgt * 1.5,
      `reconstructed KC recTgt (${reconstructed}) should be close to the summed-player total (${summedRecTgt}), not ≈2×`
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T-F12 — R3-FIT full pipeline integration (.claude/tasks/r3fit-exponent-harness.md §9)
// ═══════════════════════════════════════════════════════════════════════════

describe('T-F12: R3-FIT full pipeline (synthetic multi-year, multi-position dataset)', () => {
  function weeklyPoints(base) {
    const wp = {};
    for (let w = 1; w <= 16; w++) wp[w] = base + (w % 3);
    return wp;
  }

  const N_WR = 60;
  const N_QB = 30;

  function wrStats(mult) {
    return {
      rec_tgt: Math.round(90 * mult), rec: Math.round(60 * mult), rec_yd: Math.round(800 * mult), rec_td: 5,
      rec_rz_tgt: Math.round(18 * mult), off_snp: Math.round(650 * mult), tm_off_snp: 1000,
    };
  }
  function qbStats(mult) {
    return {
      pass_att: Math.round(500 * mult), pass_yd: Math.round(3800 * mult), pass_td: Math.round(26 * mult),
      pass_int: 9, pass_rz_att: Math.round(60 * mult),
    };
  }

  function makeSeasonTotals(y) {
    // Each player gets an INDIVIDUAL linear career trend (slope varies by
    // player index) on top of their base mult — otherwise every player's
    // career is perfectly flat and momentum/regression/trajectory all pin,
    // leaving QB (which has no other candidates — rzUsage is held-in-arm)
    // with too few estimable factors regardless of statistical power.
    const rows = {};
    for (let i = 0; i < N_WR; i++) {
      const trend = ((i % 8) - 3.5) * 0.02;
      const mult = (0.85 + (i % 8) * 0.04) * (1 + trend * (y - 2012));
      const fp = Math.round(wrStats(mult).rec_yd * 0.1 + wrStats(mult).rec * 0.5 + wrStats(mult).rec_td * 6);
      rows['w' + i] = { team: 'KC', gamesPlayed: 16, stats: wrStats(mult), fantasyPoints: fp, weeklyPoints: weeklyPoints(fp / 16) };
    }
    for (let i = 0; i < N_QB; i++) {
      const trend = ((i % 8) - 3.5) * 0.02;
      const mult = (0.85 + (i % 8) * 0.04) * (1 + trend * (y - 2012));
      const s = qbStats(mult);
      const fp = Math.round(s.pass_yd * 0.04 + s.pass_td * 4 - s.pass_int * 2);
      rows['q' + i] = { team: 'DAL', gamesPlayed: 16, stats: s, fantasyPoints: fp, weeklyPoints: weeklyPoints(fp / 16) };
    }
    return rows;
  }

  const SEASON_TOTALS = {};
  for (let y = 2012; y <= 2025; y++) SEASON_TOTALS[y] = makeSeasonTotals(y);

  const ADVSTATS = {};
  const ROSTER = {};
  for (let y = 2020; y <= 2024; y++) {
    ADVSTATS[y] = {
      schemaVersion: 1, season: y, generatedAt: '2026-01-01T00:00:00.000Z', rowCount: N_WR, unmapped: 0,
      players: Object.fromEntries(Array.from({ length: N_WR }, (_, i) => ['w' + i, { sleeperId: 'w' + i, position: 'WR', team: 'KC' }])),
    };
    ROSTER[y] = {
      schemaVersion: 1, season: y, generatedAt: '2026-01-01T00:00:00.000Z', rowCount: N_QB,
      players: Object.fromEntries(Array.from({ length: N_QB }, (_, i) => ['q' + i, { team: 'DAL', position: 'QB', status: 'ACT', fullName: 'q' + i }])),
    };
  }

  const load = {
    loadSnapshot: () => null,
    loadSeasonTotals: (year) => SEASON_TOTALS[year] ?? null,
    loadAdvstats: (year) => ADVSTATS[year] ?? null,
    loadRoster: (year) => ROSTER[year] ?? null,
  };

  const { panel, fitReport } = runFit({ fromYear: 2020, toYear: 2024, load });

  test('FitReport well-formedness: per-position + pool + meta + fidelity + sensitivity all present and correctly shaped', () => {
    assert.equal(fitReport.meta.basis, 'half_ppr');
    assert.deepEqual(fitReport.meta.combinedClamp, FIT_COMBINED_CLAMP);
    assert.deepEqual(fitReport.meta.envelopeFactors, ENVELOPE_FACTORS);
    assert.equal(fitReport.meta.baselineOfRecord, 'grading/2026-08-08-e0a-verdict.md');
    assert.equal(fitReport.meta.attribution, 'per-season-team');
    assert.equal(fitReport.meta.historyFloor, 2012);
    assert.ok(fitReport.pool && fitReport.pool.WRTE, 'pool.WRTE present');

    for (const position of PANEL_POSITIONS) {
      const r = fitReport.perPosition[position];
      assert.ok(FIT_VERDICT_LABELS.includes(r.baseVerdict));
      assert.ok(FIT_VERDICT_LABELS.includes(r.sensitivityVerdict));
      assert.ok(FIT_VERDICT_LABELS.includes(r.verdict));
      assert.ok('nFitRows' in r && 'nEvalRows' in r, `${position}: nFitRows/nEvalRows present`);
      assert.ok('fitFactorsFull' in r && 'fitFactorsEstimated' in r && 'pinnedFactors' in r && 'heldInArmFactors' in r);
      assert.ok('flatOneRates' in r);
      assert.ok('foldNeutralization' in r && 'maxAbsWMinus1ByFold' in r && 'clampHits' in r && 'shippedRefitNeutralized' in r);
    }

    // WR should have real statistical power in this fixture (30 players x many years).
    const wr = fitReport.perPosition.WR;
    assert.notEqual(wr.verdict, 'INSUFFICIENT-POWER', 'fixture sanity: WR should clear the power gate');
    assert.notEqual(wr.nFitRows, wr.nEvalRows, 'nFitRows (all predictor years) and nEvalRows (gate numerator) are distinct quantities');
    assert.equal(wr.nToParam, wr.nEvalRows / wr.fitFactorsEstimated.length);
    assert.ok(Number.isFinite(wr.meanLogResidual));
    assert.ok(Array.isArray(wr.sweep) && wr.sweep.length === 5);
    assert.ok('maePooled' in wr.deltas && 'maePerYear' in wr.deltas && 'spearmanMean' in wr.deltas);

    // QB well-formedness — length checks hold regardless of verdict (fitFactorsFull
    // is populated even under INSUFFICIENT-POWER).
    const qb = fitReport.perPosition.QB;
    assert.equal(qb.fitFactorsFull.length, 4, "QB's product set has 4 members (rzUsage held-in-arm included)");
    if (qb.verdict !== 'INSUFFICIENT-POWER') {
      assert.equal(Object.keys(qb.wFinal).length, 4, "QB's wFinal has 4 keys");
      assert.equal(qb.fitFactorsEstimated.length, 3, "QB's estimable set has 3 members");
      assert.ok(!qb.fitFactorsEstimated.includes('rzUsage'));
    }
  });

  test('evaluateExponentModel carries no wFinal key — gradeExponentFit is the sole producer (§0.3 item 59)', () => {
    // Structural guarantee, spot-checked at the report level: wFinal only
    // ever appears once, at gradeExponentFit's own top level.
    for (const position of PANEL_POSITIONS) {
      const r = fitReport.perPosition[position];
      if (r.fitted) assert.ok(!('wFinal' in r.fitted) && !('wFinal' in r.hand), `${position}: fitted/hand sub-objects (evaluateExponentModel's shape) carry no wFinal`);
    }
  });

  test('buildFitVerdictMarkdown contains the coverage table, share-series coverage, fidelity block, guard-instrumentation purpose line, and per-position base/sensitivity/final lines', () => {
    const md = buildFitVerdictMarkdown(fitReport);
    assert.ok(md.includes('## Panel coverage'));
    assert.ok(md.includes('Share-series coverage'));
    assert.ok(md.includes('## Fidelity'));
    assert.ok(md.includes('not parity-checked against app-computed ground truth'), 'the named-gap sentence is present');
    assert.ok(md.includes('§3.0-C residual'));
    assert.ok(md.includes('load-bearing or inert'), 'the guard-instrumentation purpose line is present');
    for (const position of PANEL_POSITIONS) {
      assert.ok(new RegExp(`### ${position}[\\s\\S]*?Base verdict:.*Sensitivity verdict:.*Final verdict:`).test(md), `${position} verdict line shows base/sensitivity/final`);
    }
    assert.ok(md.includes('CONSERVATIVE APPROXIMATION'), 'the clamp limitation caveat is present');
    assert.ok(md.includes('Cancellation caveat'), 'the cancellation-outside-clamp-region caveat is present');
  });

  test('panel.coverage carries fitCoverage beside the standard E-0a coverage fields', () => {
    assert.ok(panel.coverage.fitCoverage);
    assert.ok(panel.coverage.aggregateRowsExcludedByYear, 'the landed entity-filter witness is still surfaced');
    assert.ok(Array.isArray(panel.coverage.perPositionYear));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T-F13 — committed r3fit artifact well-formedness (skips pre-run)
// ═══════════════════════════════════════════════════════════════════════════

describe('T-F13: committed r3fit artifact well-formedness', () => {
  function listMatching(dir, re) {
    const abs = path.join(REPO_ROOT, dir);
    if (!fs.existsSync(abs)) return [];
    return fs.readdirSync(abs).filter(f => re.test(f)).map(f => path.join(abs, f));
  }

  const panelFiles = listMatching('backtests', /-r3fit-panel\.json$/);
  const fitFiles = listMatching('backtests', /-r3fit-fit\.json$/);
  const verdictFiles = listMatching('grading', /-r3fit-verdict\.md$/);

  test('r3fit artifacts, if committed, are well-formed', (t) => {
    if (panelFiles.length === 0 && fitFiles.length === 0 && verdictFiles.length === 0) {
      t.skip('no r3fit artifacts on disk yet (pre-run CI stays green)');
      return;
    }

    for (const f of fitFiles) {
      const fit = JSON.parse(fs.readFileSync(f, 'utf8'));
      assert.ok(fit.meta, `${f}: meta present`);
      for (const key of ['historyFloor', 'attribution', 'basis', 'alpha', 'combinedClamp', 'envelopeFactors', 'baselineOfRecord']) {
        assert.ok(key in fit.meta, `${f}: meta.${key} present`);
      }
      assert.equal(fit.meta.attribution, 'per-season-team', `${f}: meta.attribution`);

      assert.ok(fit.perPosition, `${f}: perPosition present`);
      for (const position of PANEL_POSITIONS) {
        const r = fit.perPosition[position];
        assert.ok(r, `${f}: perPosition.${position} present`);
        for (const key of ['nFitRows', 'nEvalRows', 'nToParam', 'fitFactorsFull', 'fitFactorsEstimated', 'pinnedFactors', 'heldInArmFactors', 'flatOneRates', 'foldNeutralization', 'maxAbsWMinus1ByFold', 'clampHits', 'shippedRefitNeutralized']) {
          assert.ok(key in r, `${f}: perPosition.${position}.${key} present (nested, not top-level)`);
        }
        for (const label of [r.baseVerdict, r.sensitivityVerdict, r.verdict]) {
          assert.ok(FIT_VERDICT_LABELS.includes(label), `${f}: ${position} verdict labels are known`);
        }
      }
      assert.equal(fit.perPosition.QB.fitFactorsFull.length, 4, `${f}: QB fitFactorsFull length 4`);
      assert.ok(fit.perPosition.QB.fitFactorsEstimated.every(x => fit.perPosition.QB.fitFactorsFull.includes(x)), `${f}: QB fitFactorsEstimated subset of fitFactorsFull`);
      assert.ok(!fit.perPosition.QB.fitFactorsEstimated.includes('rzUsage'), `${f}: QB rzUsage never estimated`);

      assert.ok(fit.fidelity, `${f}: fidelity present`);
      assert.ok(Array.isArray(fit.fidelity.uncoveredFactors), `${f}: fidelity.uncoveredFactors present`);
      for (const key of ['nullSeasonTeam', 'nonFiniteScale', 'nonPositiveOutcome', 'nonPositiveAnchor']) {
        assert.ok(key in fit.fidelity.inputChainResiduals, `${f}: fidelity.inputChainResiduals.${key} present`);
      }
    }

    for (const f of verdictFiles) {
      const md = fs.readFileSync(f, 'utf8');
      assert.ok(md.startsWith('# R3-FIT Verdict'), `${f}: has the expected header`);
      assert.ok(md.includes('node bin/panel.mjs --fit --write'), `${f}: contains the reproduce command`);
    }

    for (const f of panelFiles) {
      const panelJson = JSON.parse(fs.readFileSync(f, 'utf8'));
      assert.ok(panelJson.coverage?.fitCoverage, `${f}: coverage.fitCoverage present`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// assemblePanel non-regression — withFactorMultipliers unset is byte-identical to today
// ═══════════════════════════════════════════════════════════════════════════

describe('R3-FIT non-regression: assemblePanel with withFactorMultipliers unset', () => {
  const SNAPSHOT = { scoringBasis: 'half_ppr', scoringSettings: { rec: 0.5, rec_yd: 0.1, rec_td: 6 } };
  function wrStats() { return { rec_tgt: 90, rec: 60, rec_yd: 800, rec_td: 5, rec_rz_tgt: 25, off_snp: 650, tm_off_snp: 1000 }; }
  function weeklyPoints(base) { const wp = {}; for (let w = 1; w <= 16; w++) wp[w] = base + (w % 3); return wp; }

  const SEASON_TOTALS = {};
  for (let y = 2018; y <= 2025; y++) {
    SEASON_TOTALS[y] = { w1: { team: 'KC', gamesPlayed: 16, stats: wrStats(), fantasyPoints: 150, weeklyPoints: weeklyPoints(9) } };
  }
  const ADVSTATS = {};
  for (const y of [2020, 2021, 2022, 2023, 2024]) {
    ADVSTATS[y] = { schemaVersion: 1, season: y, generatedAt: '2026-01-01T00:00:00.000Z', rowCount: 1, unmapped: 0, players: { w1: { sleeperId: 'w1', position: 'WR', team: 'KC' } } };
  }
  const load = {
    loadSnapshot: (date) => (date === '2026-07-05' ? SNAPSHOT : null),
    loadSeasonTotals: (year) => SEASON_TOTALS[year] ?? null,
    loadAdvstats: (year) => ADVSTATS[year] ?? null,
    loadRoster: () => null,
  };

  test('rows/coverage/meta are byte-identical whether or not the new opt-in params are even passed', () => {
    const withoutFlag = assemblePanel({ fromYear: 2020, toYear: 2024, scoringFrom: '2026-07-05', load });
    const withFlagFalse = assemblePanel({ fromYear: 2020, toYear: 2024, scoringFrom: '2026-07-05', load, withFactorMultipliers: false, historyFloor: 2012 });
    assert.deepEqual(withoutFlag, withFlagFalse);
  });

  test('rows carry only the pre-existing E-0a shape (features/candidates), no multipliers/anchorBasePPG leak in', () => {
    const panel = assemblePanel({ fromYear: 2020, toYear: 2024, scoringFrom: '2026-07-05', load });
    assert.ok(panel.rows.length > 0);
    for (const row of panel.rows) {
      assert.ok('features' in row && 'candidates' in row);
      assert.ok(!('multipliers' in row) && !('anchorBasePPG' in row));
    }
    assert.ok(!('fitCoverage' in panel.coverage));
  });
});
