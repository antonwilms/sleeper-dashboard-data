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
  runRookieBasis, rookieBasisMain, f1Rows, f2Rows, f3Inputs, buildLeagueConstantsFile,
} from '../scripts/rookie-basis-run.mjs';
import { ROOKIE_BASIS } from '../lib/rookieBasisRefit.mjs';

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
