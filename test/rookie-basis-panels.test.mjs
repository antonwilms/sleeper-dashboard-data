/**
 * test/rookie-basis-panels.test.mjs — D-45 Stage A1: `--basis league` for the rookie / full-pipeline panels and the
 * rookie-total mode (.claude/tasks/rookie-basis-refit.md §2). In-memory loads and CLI argument guards only: nothing here
 * reads snapshots/, ktc/, current-season files or nflverse/playerids.json (Invariant 10). The qb-rookie-level half of A1 is
 * tested in test/qb-rookie-level.test.mjs (T7b, T15).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { runRookiePanels, runFullPipeline, writeRookieArtifacts, writeFullPipelineArtifacts } from '../scripts/panel-run.mjs';
import { runRookieTotal, writeRookieTotalArtifacts, rookieTotalMain } from '../scripts/rookie-total-run.mjs';
import { composeRookieRow } from '../lib/rookieTotalPoints.mjs';
import { reconstructRookieProjection } from '../lib/projectionFactors.mjs';
import { reconstructShippedRookieProjection } from '../lib/rookieMirror.mjs';
import { memLoad, leagueStub, row } from '../test-support/rookie-basis-fixtures.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const bin = (script, args) => spawnSync('node', [script, ...args], { cwd: REPO_ROOT, encoding: 'utf8' });

// ─── a two-season in-memory store ─────────────────────────────────────────────

const keysOf = (rows) => rows.map((r) => `${r.sleeperId}|${r.predictorYear}|${r.targetSeason ?? ''}`).sort();

describe('runRookiePanels --basis league', () => {
  const half = runRookiePanels({ load: memLoad() });
  const lg = runRookiePanels({ load: memLoad(), basis: 'league' });

  test('meta.basis and basisScope.basis carry the basis; half stays the default', () => {
    assert.equal(half.meta.basis, 'half_ppr'); assert.equal(half.meta.basisScope.basis, 'half_ppr');
    assert.equal(lg.meta.basis, 'league'); assert.equal(lg.meta.basisScope.basis, 'league');
  });
  test('outcomes are league points: league PPG differs from half on a row whose stats score differently; the predictor is unchanged', () => {
    const h = half.legacy.gated.rows.find((r) => r.sleeperId === 'p1');
    const l = lg.legacy.gated.rows.find((r) => r.sleeperId === 'p1');
    assert.equal(h.outcomePPG, 12.5);                       // 200 / 16
    assert.equal(l.outcomePPG, (100 + 130 + 48) / 16);      // rec 100 + rec_yd 1300×0.1 + rec_td 8×6, over 16 games
    assert.notEqual(h.outcomePPG, l.outcomePPG);
    assert.equal(h.projectedPPG, l.projectedPPG, 'the uncorrected scale-1 reconstructRookieProjection under both bases');
    assert.equal(l.outcomeTotalPts, 278);
  });
  test('S4: row keys are identical across bases in every assembly (populations are games-based, basis-invariant)', () => {
    for (const k of ['debut', 'rookiePathAll']) assert.deepEqual(keysOf(lg[k].rows), keysOf(half[k].rows), k);
    assert.deepEqual(keysOf(lg.legacy.gated.rows), keysOf(half.legacy.gated.rows));
    assert.deepEqual(keysOf(lg.legacy.ungated.rows), keysOf(half.legacy.ungated.rows));
    assert.deepEqual(lg.rookiePathAll.coverage.byRungCell, half.rookiePathAll.coverage.byRungCell, 'the games cells are basis-invariant');
  });
  test('the half_ppr reproduction pin is skipped under league (never thrown on, never a pass); the ceiling reconciliation only reports', () => {
    assert.deepEqual(lg.pin, { checked: false, skipped: 'pin is half_ppr', reason: 'pin is half_ppr' });
    assert.ok(lg.ceiling.match && typeof lg.ceiling.match.WR === 'boolean');
  });
  test('an unknown basis throws', () => {
    assert.throws(() => runRookiePanels({ load: memLoad(), basis: 'in-basis' }), /basis must be half_ppr\|league/);
  });
  test('--write names the league files …-rookie-league-… / …-fullpipeline-league-… (half names unchanged)', () => {
    const names = (fn, result) => {
      // the writers are rooted at the repo (repoPath) with no root parameter: stub fs so nothing is written, and read the returned paths
      const written = [];
      const origWrite = fs.writeFileSync, origMkdir = fs.mkdirSync;
      fs.writeFileSync = (p) => { written.push(p); };
      fs.mkdirSync = () => {};
      try { return { out: fn({ result, verdictMd: 'x' }), written }; } finally { fs.writeFileSync = origWrite; fs.mkdirSync = origMkdir; }
    };
    assert.match(names(writeRookieArtifacts, lg).out.panelPath, /^backtests\/\d{4}-\d\d-\d\d-rookie-league-panel\.json$/);
    assert.match(names(writeRookieArtifacts, lg).out.verdictPath, /^grading\/\d{4}-\d\d-\d\d-rookie-league-verdict\.md$/);
    assert.match(names(writeRookieArtifacts, half).out.panelPath, /^backtests\/\d{4}-\d\d-\d\d-rookie-panel\.json$/);
    const fpLeague = { meta: { generatedAt: '2026-10-17T00:00:00.000Z', basis: 'league' }, panel: { rows: [] } };
    const fpHalf = { meta: { generatedAt: '2026-10-17T00:00:00.000Z', basis: 'half_ppr' }, panel: { rows: [] } };
    assert.equal(names(writeFullPipelineArtifacts, fpLeague).out.panelPath, 'backtests/2026-10-17-fullpipeline-league-panel.json');
    assert.equal(names(writeFullPipelineArtifacts, fpLeague).out.verdictPath, 'grading/2026-10-17-fullpipeline-league-verdict.md');
    assert.equal(names(writeFullPipelineArtifacts, fpHalf).out.panelPath, 'backtests/2026-10-17-fullpipeline-panel.json');
  });
});

describe('runFullPipeline --basis league', () => {
  // The veteran panel is empty on a two-season store, so the sensitivity check STOPs (as it does on the committed store);
  // the rookie block is computed unconditionally, which is what this A1 mode exposes.
  const half = runFullPipeline({ load: memLoad(), fromYear: 2020, toYear: 2020 });
  const lg = runFullPipeline({ load: memLoad(), fromYear: 2020, toYear: 2020, basis: 'league' });
  test('meta.basis is set and the rookie block reads league points; its predictor and row keys are unchanged', () => {
    assert.equal(half.meta.basis, 'half_ppr'); assert.equal(lg.meta.basis, 'league');
    const h = half.rookiePanel.rows.find((r) => r.sleeperId === 'p1'), l = lg.rookiePanel.rows.find((r) => r.sleeperId === 'p1');
    assert.notEqual(h.outcomePPG, l.outcomePPG);
    assert.equal(h.projectedPPG, l.projectedPPG);
    assert.deepEqual(keysOf(lg.rookiePanel.rows), keysOf(half.rookiePanel.rows));
  });
  test('an unknown basis throws', () => {
    assert.throws(() => runFullPipeline({ load: memLoad(), fromYear: 2020, toYear: 2020, basis: 'in-basis' }), /basis must be half_ppr\|league/);
  });
});

// ─── rookie-total ─────────────────────────────────────────────────────────────

describe('composeRookieRow / runRookieTotal under league', () => {
  test('basisScale composes into the shipped projection; the parity check stays on the scale-1 uncorrected reconstruction', () => {
    const r = row();
    const one = composeRookieRow(r, 22);
    const scaled = composeRookieRow(r, 22, { basisScale: 1.1 });
    assert.equal(one.parity, true); assert.equal(scaled.parity, true);
    assert.deepEqual(scaled.predPPG, reconstructShippedRookieProjection({ position: 'WR', ageAtDraft: 22, draftRound: null, draftPick: null, draftCapitalStatus: 'undrafted', yearsExp: 0, rookieTotalModel: 'legacy', basisScale: 1.1 }).projectedPPG);
    assert.ok(scaled.predPPG > one.predPPG);
  });

  test('league run: reads the league panel, the realised total is the panel\'s outcomeTotalPts, the row is composed at basisScaleOf(targetSeason); meta.basis = league; no pin row count', () => {
    const rows = [row()];
    const half = runRookieTotal({
      load: { loadPanel: () => ({ rookiePathAll: { rows } }), loadPlayerIds: () => ({ bySleeper: { w1: { birthdate: '1998-01-01' } } }) },
      pin: { path: 'x', commit: 'y', rows: 1 },
    });
    const lg = runRookieTotal({ load: leagueStub(rows), basis: 'league', panelPath: 'some/league-panel.json' });
    assert.equal(half.meta.basis, 'half_ppr'); assert.equal(lg.meta.basis, 'league');
    assert.match(lg.meta.panel, /some\/league-panel\.json/);
    assert.equal(lg.meta.rows, 1);
    // predicted total = round1(ceiled PPG × games), the league one built from a 1.1× baseline
    assert.ok(lg.bias.all.meanPred > half.bias.all.meanPred, 'the scaled interim projects more');
    assert.equal(lg.bias.all.meanReal, 20, 'realised total is the panel\'s outcomeTotalPts');
  });
  test('league argument guards: needs a panel path, a league-labelled panel; half rejects a panel path and rookieConstants', () => {
    const rows = [row()];
    assert.throws(() => runRookieTotal({ load: leagueStub(rows), basis: 'league' }), /needs --rookie-panel/);
    assert.throws(() => runRookieTotal({ load: { ...leagueStub(rows), loadLeaguePanel: () => ({ meta: { basis: 'half_ppr' }, rookiePathAll: { rows } }) }, basis: 'league', panelPath: 'p' }), /not 'league'/);
    assert.throws(() => runRookieTotal({ load: leagueStub(rows), panelPath: 'p' }), /applies only with --basis league/);
    assert.throws(() => runRookieTotal({ load: leagueStub(rows), rookieConstants: {} }), /apply only with --basis league/);
    assert.throws(() => runRookieTotal({ load: leagueStub(rows), basis: 'ppr' }), /unknown basis/);
  });
  test('league artifacts are named …-rookie-total-league-…; the main passes basis and panel path through', () => {
    const rows = [row()];
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-'));
    try {
      const result = runRookieTotal({ load: leagueStub(rows), basis: 'league', panelPath: 'p.json' });
      const w = writeRookieTotalArtifacts({ result, verdictMd: 'x', root });
      assert.match(w.panelPath, /-rookie-total-league-panel\.json$/); assert.match(w.verdictPath, /-rookie-total-league-verdict\.md$/);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
    const out = [];
    const code = rookieTotalMain({ load: leagueStub(rows), basis: 'league', panelPath: 'p.json', asJson: true, log: (s) => out.push(s), logErr: () => {} });
    assert.equal(code, 0);
    assert.equal(JSON.parse(out[0]).meta.basis, 'league');
  });
});

// ─── CLI argument guards ──────────────────────────────────────────────────────

describe('CLI: --basis league is admitted by each mode; an unknown basis is rejected', () => {
  // A guard that comes AFTER basis validation in the same bin proves the basis itself was admitted: the error names the
  // later guard, never the basis. (No run reaches the live store.)
  test('panel.mjs --rookie: league and half_ppr admitted (the --from guard fires after the basis checks); in-basis and unknown rejected', () => {
    const lg = bin('bin/panel.mjs', ['--rookie', '--basis', 'league', '--from', '2013']);
    assert.equal(lg.status, 1); assert.match(lg.stderr, /--rookie rejects --from\/--to\/--attribution\/--min-games/);
    assert.doesNotMatch(lg.stderr, /--basis/);
    const half = bin('bin/panel.mjs', ['--rookie', '--basis', 'half_ppr', '--from', '2013']);
    assert.match(half.stderr, /--rookie rejects --from/); assert.doesNotMatch(half.stderr, /--basis/);
    const none = bin('bin/panel.mjs', ['--rookie', '--from', '2013']);
    assert.match(none.stderr, /--rookie rejects --from/);
    assert.doesNotMatch(none.stderr, /in-basis is rejected/, 'a no-flag --rookie defaults to half_ppr, never the in-basis rejection');
    const inb = bin('bin/panel.mjs', ['--rookie', '--basis', 'in-basis']);
    assert.equal(inb.status, 1); assert.match(inb.stderr, /in-basis is rejected/);
    const bogus = bin('bin/panel.mjs', ['--rookie', '--basis', 'ppr']);
    assert.equal(bogus.status, 1); assert.match(bogus.stderr, /--basis must be 'in-basis', 'half_ppr' or 'league'/);
  });
  test('panel.mjs --fullpipeline: league admitted (the --attribution guard fires after); in-basis and unknown rejected', () => {
    const lg = bin('bin/panel.mjs', ['--fullpipeline', '--basis', 'league', '--attribution', 'per-season-team']);
    assert.equal(lg.status, 1); assert.match(lg.stderr, /--fullpipeline pins per-season-team/);
    const inb = bin('bin/panel.mjs', ['--fullpipeline', '--basis', 'in-basis']);
    assert.equal(inb.status, 1); assert.match(inb.stderr, /in-basis is rejected/);
    const bogus = bin('bin/panel.mjs', ['--fullpipeline', '--basis', 'ppr']);
    assert.equal(bogus.status, 1); assert.match(bogus.stderr, /--basis must be/);
  });
  test('panel.mjs: league stays rejected by the modes that do not admit it', () => {
    const r = bin('bin/panel.mjs', ['--flip-gate', '--basis', 'league']);
    assert.equal(r.status, 1); assert.match(r.stderr, /admitted by --fit, --rookie and --fullpipeline only/);
    const e0a = bin('bin/panel.mjs', ['--basis', 'league']);
    assert.equal(e0a.status, 1); assert.match(e0a.stderr, /admitted by --fit, --rookie and --fullpipeline only/);
  });
  test('backtest.mjs --rookie-total: league without --rookie-panel exits 1; --rookie-panel under half exits 1; unknown basis exits 1; league admitted with a panel path', () => {
    const noPanel = bin('bin/backtest.mjs', ['--rookie-total', '--basis', 'league']);
    assert.equal(noPanel.status, 1); assert.match(noPanel.stderr, /requires --rookie-panel/);
    const underHalf = bin('bin/backtest.mjs', ['--rookie-total', '--rookie-panel', 'x.json']);
    assert.equal(underHalf.status, 1); assert.match(underHalf.stderr, /--rookie-panel applies only to --rookie-total --basis league/);
    const underHalfExplicit = bin('bin/backtest.mjs', ['--rookie-total', '--basis', 'half_ppr', '--rookie-panel', 'x.json']);
    assert.equal(underHalfExplicit.status, 1); assert.match(underHalfExplicit.stderr, /applies only to/);
    const bogus = bin('bin/backtest.mjs', ['--rookie-total', '--basis', 'ppr']);
    assert.equal(bogus.status, 1); assert.match(bogus.stderr, /--basis must be half_ppr or league, got 'ppr'/);
    const rej = bin('bin/backtest.mjs', ['--rookie-total', '--basis', 'league', '--rookie-panel', 'x.json', '--from', '2013']);
    assert.equal(rej.status, 1); assert.match(rej.stderr, /--rookie-total rejects --from/);
    assert.doesNotMatch(rej.stderr, /rejects[^—]*--basis/); assert.doesNotMatch(rej.stderr, /rejects[^—]*--rookie-panel/);
  });
  test('backtest.mjs --rookie-total --basis league with a missing panel file exits 1 on the file, not on the flags', () => {
    const r = bin('bin/backtest.mjs', ['--rookie-total', '--basis', 'league', '--rookie-panel', '/nonexistent/league-panel.json']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /ENOENT/);
  });
});
