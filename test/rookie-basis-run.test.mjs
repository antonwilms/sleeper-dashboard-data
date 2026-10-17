/**
 * test/rookie-basis-run.test.mjs — D-45 A3a: the adapter scripts/rookie-basis-run.mjs on synthetic inputs (gates, per-family G0b skip,
 * pinned-artifact stop, §4.6 trip rule, artifacts, CLI). The run itself is a hand-run, never a test (Invariant 10).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  ROOKIE_BASIS_RULE_MD, ROOKIE_BASIS_PIN, analyze, section46Trips, buildRookieBasisVerdictMarkdown, writeRookieBasisArtifacts,
  runRookieBasis, rookieBasisMain, f1Rows, f2Rows, f3Inputs, buildLeagueConstantsFile, make46,
} from '../scripts/rookie-basis-run.mjs';
import { ROOKIE_BASIS } from '../lib/rookieBasisRefit.mjs';
import { reconstructRookieProjection } from '../lib/projectionFactors.mjs';
import { composeRookieRow } from '../lib/rookieTotalPoints.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const scaleOf = (T, pos) => ROOKIE_BASIS_PIN.scale2026[pos];
const side = () => ({
  rookie: { legacy: { gated: { rows: [] } }, debut: { rows: [] }, rookiePathAll: { rows: [], coverage: { byRungCell: {} } } },
  games: [], units: [], dynRows: [],
});
const inputs = (over = {}) => ({
  generatedAt: '2026-10-17T00:00:00.000Z', headRev: 'abc1234', scaleOf, scaleByTarget: { 2026: ROOKIE_BASIS_PIN.scale2026 },
  playerIds: { bySleeper: {} }, half: side(), league: side(), fixtureSha1: ROOKIE_BASIS_PIN.fixtureSha1,
  pinned: { F1: { ok: true, what: 'x' }, F2: { ok: true, what: 'x' }, F3: { ok: true, what: 'x' }, F4: { ok: true, what: 'x' } },
  weeks: { 2020: { exactWeeks: 10, scaledWeeks: 0, scaledShare: 0, flag: false } }, capture: [], basisDetail: { scoringFixture: 'f' }, ...over,
});

describe('the rule text is built from the constants and states the plan\'s rule', () => {
  test('names wire / do-not-wire / stop-and-report, the 99% pooled guard, the floors, `same`, multiplicity, §4.6, G0 handling', () => {
    for (const s of ['`wire`', '`do-not-wire`', '`stop-and-report`', '99%', 'Bonferroni', '`same`', '§4.6', 'only the WR entry decides', '30 rows', '10 players', '30 players', '4000 resamples, seed 12345', 'stops the run']) {
      assert.ok(ROOKIE_BASIS_RULE_MD.includes(s), s);
    }
    assert.equal(ROOKIE_BASIS.floors.F3.min, 10);
  });
});

describe('§4.6 trip rule', () => {
  test('shipped k stand only if both comparisons are do-not-wire and the dynasty structure is unchanged', () => {
    const dnw = { verdict: 'do-not-wire' };
    assert.equal(section46Trips({ twoA: dnw, dyn: dnw, structureChanged: false }), false);
    assert.equal(section46Trips({ twoA: { verdict: 'wire' }, dyn: dnw, structureChanged: false }), true);
    assert.equal(section46Trips({ twoA: dnw, dyn: { verdict: 'stop-and-report' }, structureChanged: false }), true);
    assert.equal(section46Trips({ twoA: dnw, dyn: dnw, structureChanged: true }), true);
  });
});

describe('row builders join half to league twins', () => {
  test('f1Rows / f2Rows / f3Inputs carry both outcomes and the as-of scale', () => {
    const ids = { bySleeper: { a: { birthdate: '1998-01-01' } } };
    const g = { sleeperId: 'a', position: 'WR', predictorYear: 2020, draftYear: 2020, draftRound: 1, draftPick: 5, projectedPPG: 8, nflDraftTier: 'top-8', outcomePPG: 10 };
    const [r] = f1Rows({ halfGated: [g], leagueGated: [{ ...g, outcomePPG: 13 }], playerIds: ids, scaleOf });
    assert.equal(r.oH, 10); assert.equal(r.oL, 13); assert.equal(r.s, 1.101); assert.equal(r.year, 2020);
    const d = { sleeperId: 'a', position: 'WR', predictorYear: 2020, targetSeason: 2020, entryYear: 2020, outcomeGames: 9, outcomePPG: 5 };
    const rows = f2Rows({ halfDebut: [d, { ...d, sleeperId: 'b', outcomeGames: 7 }], leagueDebut: [{ ...d, outcomePPG: 7 }], scaleOf });
    assert.equal(rows.length, 1); assert.equal(rows[0].yL, 7);
    const f3 = f3Inputs({ halfGames: [{ pid: 'q', S: 2020, week: 1, group: 'r1', pts: 10 }], leagueGames: [{ pid: 'q', S: 2020, week: 1, group: 'r1', pts: 14 }], leagueUnits: [{ pid: 'q', S: 2020, group: 'r1', y: 14 }] });
    assert.deepEqual(f3.games[0], { pid: 'q', S: 2020, group: 'r1', ptsH: 10, ptsL: 14 }); assert.equal(f3.units[0].yL, 14);
  });
});

describe('analyze: gates', () => {
  test('G0a / G0c / G0d failures stop the run before any family is read', () => {
    const a = analyze({ inputs: inputs({ scaleOf: () => 1 }) });
    assert.equal(a.stopped, 'G0'); assert.equal(a.g0.a.ok, false); assert.ok(a.g0.failed.includes('a')); assert.equal('families' in a, false);
    const d = analyze({ inputs: inputs({ fixtureSha1: 'deadbeef' }) });
    assert.equal(d.stopped, 'G0'); assert.ok(d.g0.failed.includes('d'));
    const c = inputs(); c.league.rookie.debut.rows = [{ sleeperId: 'x', predictorYear: 1, targetSeason: 1 }];
    const cr = analyze({ inputs: c });
    assert.equal(cr.stopped, 'G0'); assert.ok(cr.g0.failed.includes('c'));
    const cells = inputs(); cells.league.rookie.rookiePathAll.coverage.byRungCell = { x: { n: 1 } };
    assert.ok(analyze({ inputs: cells }).g0.failed.includes('c'));
  });
  test('a failed G0b makes that family stop-and-report and its league section is not computed; the other families still run', () => {
    // empty half rows cannot reproduce the shipped constants: F1-F4 fail G0b
    const r = analyze({ inputs: inputs() });
    assert.equal(r.stopped, null);
    assert.deepEqual(r.g0.familiesFailed, ['F1', 'F2', 'F3', 'F4']);
    for (const f of ['F1', 'F2', 'F3', 'F4']) { assert.equal(r.families[f].verdict, 'stop-and-report'); assert.equal(r.families[f].result.skipped, true); assert.match(r.families[f].decision.reasons.join(' '), /G0/); }
    assert.notEqual(r.families.F5.verdict, 'stop-and-report');
    assert.equal(r.section46.ran, false);
    assert.equal(r.constantsFile.basis, 'league');
    assert.deepEqual(Object.keys(r.constantsFile.families), ['F1', 'F2', 'F3', 'F4', 'F5']);
    assert.equal(r.constantsFile.families.F1.constants, null);
    assert.deepEqual(r.constantsFile.families.F5.constants.wirePositions, ['WR']);
  });
  test('a pinned artifact that did not reproduce at baseline makes its family stop-and-report even when its statistics would not', () => {
    const r = analyze({ inputs: inputs({ pinned: { F1: { ok: true }, F2: { ok: true }, F3: { ok: true }, F4: { ok: false, what: 'rookiePathAll cells' }, } }) });
    assert.equal(r.families.F4.verdict, 'stop-and-report');
    assert.equal(r.families.F5.decision.reasons.join('').includes('pinned'), false);
  });
});

describe('verdict, artifacts and CLI', () => {
  test('the verdict carries the rule, the verdict table, G0 and the pinned-artifact table; a stopped run says so', () => {
    const md = buildRookieBasisVerdictMarkdown(analyze({ inputs: inputs() }));
    for (const s of ['Pre-registered decision rule', '## Verdicts', '## G0', 'Pinned artifacts', '## §4.6', 'Live 2026 effect', 'not computed']) assert.ok(md.includes(s), s);
    assert.ok(md.indexOf('Pre-registered decision rule') < md.indexOf('## Verdicts'));
    const stopped = buildRookieBasisVerdictMarkdown(analyze({ inputs: inputs({ fixtureSha1: 'x' }) }));
    assert.match(stopped, /STOPPED at G0/);
  });
  test('writer: panel + constants + verdict, dated; a stopped run writes no constants file', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-'));
    try {
      const ok = analyze({ inputs: inputs() });
      const w = writeRookieBasisArtifacts({ result: ok, verdictMd: 'v', root });
      assert.match(w.panelPath, /^backtests\/2026-10-17-rookie-basis-panel\.json$/);
      assert.match(w.constantsPath, /^backtests\/2026-10-17-rookie-league-constants\.json$/);
      assert.match(w.verdictPath, /^grading\/2026-10-17-rookie-basis-verdict\.md$/);
      assert.equal(JSON.parse(fs.readFileSync(path.join(root, w.constantsPath), 'utf8')).basis, 'league');
      const s = writeRookieBasisArtifacts({ result: analyze({ inputs: inputs({ fixtureSha1: 'x' }) }), verdictMd: 'v', root: path.join(root, 'b') });
      assert.equal(s.constantsPath, null);
      assert.equal(fs.existsSync(path.join(root, 'b', 'backtests', '2026-10-17-rookie-league-constants.json')), false);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
  test('runRookieBasis / rookieBasisMain with an injected collector: exit 1 when stopped, 0 otherwise, nothing written without --write', () => {
    const quiet = { log: () => {}, logErr: () => {} };
    assert.equal(rookieBasisMain({ collect: () => inputs({ fixtureSha1: 'x' }), ...quiet }), 1);
    assert.equal(rookieBasisMain({ collect: () => inputs(), ...quiet }), 0);
    assert.equal(runRookieBasis({ collect: () => inputs() }).written, undefined);
  });
  test('buildLeagueConstantsFile records constants and verdict for every family', () => {
    const r = analyze({ inputs: inputs() });
    const f = buildLeagueConstantsFile({ generatedAt: 'g', basisDetail: {}, fixtureSha1: 's', headRev: 'h', families: r.families });
    assert.equal(f.families.F5.verdict, r.families.F5.verdict);
    assert.equal(f.basisDetail.scoringFixtureSha1, 's');
  });
  test('the bin takes only --json / --write', () => {
    const r = spawnSync('node', ['bin/backtest.mjs', '--rookie-basis', '--from', '2013'], { cwd: REPO_ROOT, encoding: 'utf8' });
    assert.equal(r.status, 1); assert.match(r.stderr, /--rookie-basis rejects --from/);
  });
});

// ─── analyze: F4's shipped composition and §4.6 (synthetic; in memory only — Invariant 10) ─────────────

describe('analyze: G0b passes, F1 wires, F4 is decided on the shipped composition, §4.6 can trip it', () => {
  const rec = (round, pick) => reconstructRookieProjection({ position: 'WR', ageAtDraft: 21, draftRound: round, draftPick: pick });
  const bday = (year) => `${year - 21}-06-01`;
  const bySleeper = {};
  const half = side(), league = side();

  // F1: 60 first-round WR gated rows (12 predictor years × 5). The league outcome is 1.35 × the half outcome, far from the
  // as-of scale 1.101 → the ρ-transported refit beats the interim in every cell row.
  for (let y = 2014; y <= 2025; y++) {
    [3, 9, 15, 22, 30].forEach((pick, i) => {
      const id = `g${y}_${i}`, r = rec(1, pick);
      bySleeper[id] = { birthdate: bday(y) };
      const row = { sleeperId: id, position: 'WR', predictorYear: y, draftYear: y, draftRound: 1, draftPick: pick, nflDraftTier: r.nflDraftTier, projectedPPG: r.projectedPPG, outcomePPG: r.projectedPPG };
      half.rookie.legacy.gated.rows.push(row);
      league.rookie.legacy.gated.rows.push({ ...row, outcomePPG: Math.round(r.projectedPPG * 1.35 * 100) / 100 });
    });
  }
  // F4: day3 and undrafted WR rookiePathAll rows, 10 target seasons × 4 per group.
  const f4Specs = [];
  for (let y = 2016; y <= 2025; y++) {
    for (const [group, round, pick] of [['day3', 5, 150], ['undrafted', null, null]]) {
      for (let i = 0; i < 4; i++) {
        const id = `p${group}${y}_${i}`, r = rec(round, pick);
        bySleeper[id] = { birthdate: bday(y) };
        const base = { sleeperId: id, position: 'WR', predictorYear: y, targetSeason: y, draftYear: y, draftRound: round, draftPick: pick, draftGroup: group, experienceYears: 0, projectedPPG: r.projectedPPG };
        const pred = composeRookieRow(base, 21).predTotal;
        f4Specs.push({ base, pred });
        half.rookie.rookiePathAll.rows.push({ ...base, outcomeTotalPts: pred * (0.6 + 0.05 * i) });
        league.rookie.rookiePathAll.rows.push({ ...base, outcomeTotalPts: pred * (0.9 + 0.05 * i) });
      }
    }
  }
  const mk = () => inputs({ playerIds: { bySleeper }, half, league });
  const allOnes = { undrafted: { QB: 1, RB: 1, WR: 1, TE: 1 }, day3: { QB: 1, RB: 1, WR: 1, TE: 1 } };
  const nullCeiling = Object.fromEntries(['QB', 'RB', 'WR', 'TE'].map((p) => [p, { knee: null, asymptote: null }]));
  const halfFactor = Object.fromEntries(['day3', 'undrafted'].map((g) => [g, 0]));
  // the half-PPR composition's own factor (G0b F4): Σ realH ÷ Σ predH per group
  for (const g of ['day3', 'undrafted']) {
    const rs = half.rookie.rookiePathAll.rows.filter((r) => r.draftGroup === g);
    const p = f4Specs.filter((x) => x.base.draftGroup === g).reduce((a, x) => a + x.pred, 0);
    halfFactor[g] = Math.round(rs.reduce((a, r) => a + r.outcomeTotalPts, 0) / p * 1e3) / 1e3;
  }
  const shipped = { calibration: allOnes, ceiling: nullCeiling, qbLevels: { top12: null, r1: null, day2: null, 'day3+': null }, totalFactor: halfFactor };

  test('G0b passes for F1-F4 on the synthetic panel; F1 wires', () => {
    const r = analyze({ inputs: mk(), shipped, run46: () => ({ trips: false }) });
    assert.equal(r.stopped, null, JSON.stringify(r.g0 && r.g0.failed));
    assert.deepEqual(r.g0.familiesFailed, []);
    assert.equal(r.families.F1.verdict, 'wire', r.families.F1.decision.reasons.join(' '));
  });
  test('F4\'s shipped composition uses the F1 league constants (predS); the half-PPR G0b composition is unchanged', () => {
    let seen = null;
    const r = analyze({ inputs: mk(), shipped, run46: (file) => { seen = file; return { trips: false }; } });
    assert.equal(r.families.F4.result.composition.F1, 'league');
    assert.equal(r.families.F4.result.composition.F2, 'interim');
    assert.equal(seen.families.F1.verdict, 'wire');
    const c = r.families.F1.result.constants;
    const group = (g, withF1) => {
      const specs = f4Specs.filter((x) => x.base.draftGroup === g);
      const pred = specs.reduce((a, x) => a + composeRookieRow(x.base, 21, { basisScale: ROOKIE_BASIS_PIN.scale2026.WR, ...(withF1 ? { rookieConstantsModel: 'league-refit', leagueConstants: c } : {}) }).predTotal, 0);
      const real = league.rookie.rookiePathAll.rows.filter((x) => x.draftGroup === g).reduce((a, x) => a + x.outcomeTotalPts, 0);
      return Math.round(real / pred * 1e3) / 1e3;
    };
    for (const g of ['day3', 'undrafted']) {
      assert.equal(r.families.F4.result.fullSample.league[g], group(g, true), `${g}: league factor is on the F1-league composition`);
      assert.notEqual(group(g, true), group(g, false), `${g}: the F1 constants do move the composition`);
    }
    assert.deepEqual(r.families.F4.result.fullSample.half, halfFactor);
  });
  test('a run46 that trips turns F1 into stop-and-report (F4 was already decided on the pre-§4.6 composition)', () => {
    const r = analyze({ inputs: mk(), shipped, run46: () => ({ trips: true }) });
    assert.equal(r.section46.ran, true); assert.equal(r.section46.trips, true);
    assert.equal(r.families.F1.verdict, 'stop-and-report');
    assert.match(r.families.F1.decision.reasons.join(' '), /§4\.6/);
    assert.equal(r.families.F4.result.composition.F1, 'league');
    assert.equal(r.wired.includes('F1'), false);
  });
  test('without a run46, a wiring F1 is an error (the §4.6 re-run is not optional)', () => {
    assert.throws(() => analyze({ inputs: mk(), shipped }), /no run46 was supplied/);
  });
});

describe('make46 builds the two in-season invocations', () => {
  test('both league-basis, both with the in-memory rookie constants; the dynasty one on the shipped 2a file', () => {
    const calls = [];
    const shippedTwoA = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, ROOKIE_BASIS_PIN.shippedTwoA), 'utf8'));
    const stop = new Error('stub');
    const runners = {
      runInSeason: (o) => { calls.push(['2a', o]); throw stop; },
      runInSeasonDyn: (o) => { calls.push(['dyn', o]); throw stop; },
    };
    const none = { verdict: 'do-not-wire', constants: null };
    const file = { basis: 'league', families: { F1: { verdict: 'wire', constants: { baselinePPG: { QB: 7, RB: 7, WR: 7, TE: 7 }, calibration: { undrafted: {}, day3: {} } } }, F2: none, F3: none, F4: none, F5: none } };
    assert.throws(() => make46({ load: {}, runners })(file), /stub/);
    assert.equal(calls.length, 1);
    const [, o] = calls[0];
    assert.equal(o.basis, 'league');
    assert.match(o.rookieConstants.ref, /^in-memory @ [0-9a-f]{40}$/);
    assert.deepEqual(o.rookieConstants.wiredFamilies, ['F1']);
    assert.equal(o.inseason2a, undefined);
    // second invocation: let the first return the shipped 2a constants so the comparison runs, then capture the dyn call
    const run2 = {
      runInSeason: (o2) => { o2.onStore({ store: new Map(), pinnedFrom: {}, load: { loadSeasonTotals: () => ({}) } }); return { constants: shippedTwoA }; },
      runInSeasonDyn: (o2) => { calls.push(['dyn', o2]); throw stop; },
    };
    try { make46({ load: {}, runners: run2 })(file); } catch (e) { if (e !== stop) throw e; }
    const dyn = calls.find(([k]) => k === 'dyn');
    assert.ok(dyn, 'the dynasty invocation was reached');
    assert.equal(dyn[1].basis, 'league'); assert.equal(dyn[1].qbPrior, 'starter');
    assert.equal(dyn[1].inseason2a, ROOKIE_BASIS_PIN.shippedTwoA);
    assert.equal(dyn[1].rookieConstants.ref, o.rookieConstants.ref);
  });
});
