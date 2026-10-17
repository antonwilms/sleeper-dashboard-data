/**
 * test/rookie-constants-model.test.mjs — D-45 Stage A2: the `league-refit` rookie constants model in the mirror
 * (lib/rookieMirror.mjs), F5's prospect-prior override (lib/inSeasonEvidence.mjs), the league rookie-constants file reader
 * (scripts/rookie-constants-file.mjs) and the harness plumbing (`--rookie-constants`). Synthetic constants and in-memory
 * loads only — no committed league constants file exists yet, and nothing here reads snapshots/ or the live store
 * (Invariant 10). `interim` byte identity is held by the existing suites (T-RM3…T-RM16, T-QB-4), which pass unchanged.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  reconstructShippedRookieProjection as R, ROOKIE_CONSTANTS_MODELS, CURRENT_ROOKIE_CONSTANTS_MODEL, LEAGUE_CONSTANT_FAMILIES,
  ROOKIE_CALIBRATION, ROOKIE_CEILING, QB_ROOKIE_STARTER_PPG, ROOKIE_TOTAL_FACTOR,
  resolveRookieCalibration, applyRookieCeiling, resolveRookieTotalFactor, resolveRookieQbStarterLevel,
} from '../lib/rookieMirror.mjs';
import { ROOKIE_BASELINE_PPG } from '../lib/projectionFactors.mjs';
import { prospectPriorPPG, PROSPECT_MIRROR, ageMultiplier, draftMultiplier } from '../lib/inSeasonEvidence.mjs';
import { wiredConstantsOf, loadRookieConstants, mirrorArgsOf } from '../scripts/rookie-constants-file.mjs';
import { rookieRecordFor, rookiePriorFor, runInSeason } from '../scripts/inseason-run.mjs';
import { runInSeasonDyn, INSEASON_DYN_LOAD } from '../scripts/inseason-dyn-run.mjs';
import { runRookieTotal } from '../scripts/rookie-total-run.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const bin = (script, args) => spawnSync('node', [script, ...args], { cwd: REPO_ROOT, encoding: 'utf8' });
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} ${a} vs ${b}`);
const WR_R1 = { position: 'WR', ageAtDraft: 22, draftRound: 1, draftPick: 5, draftCapitalStatus: 'matched', yearsExp: 0 };
const WR_UNDRAFTED = { position: 'WR', ageAtDraft: 22, draftRound: null, draftPick: null, draftCapitalStatus: 'undrafted', yearsExp: 0 };
const WR_DAY3 = { position: 'WR', ageAtDraft: 22, draftRound: 4, draftPick: 5, draftCapitalStatus: 'matched', yearsExp: 0 };
const RB_UNDRAFTED = { position: 'RB', ageAtDraft: 22, draftRound: null, draftPick: null, draftCapitalStatus: 'undrafted', yearsExp: 0 };
const QB_TOP12 = { position: 'QB', ageAtDraft: 22, draftRound: 1, draftPick: 3, draftCapitalStatus: 'matched', yearsExp: 0 };

describe('the constants-model vocabulary', () => {
  test('two models, interim is the harness default; the five league families are the leagueConstants keys', () => {
    assert.deepEqual([...ROOKIE_CONSTANTS_MODELS], ['interim', 'league-refit']);
    assert.ok(Object.isFrozen(ROOKIE_CONSTANTS_MODELS));
    assert.equal(CURRENT_ROOKIE_CONSTANTS_MODEL, 'interim');
    assert.deepEqual([...LEAGUE_CONSTANT_FAMILIES], ['baselinePPG', 'calibration', 'ceiling', 'qbStarterPPG', 'totalFactor']);
  });
});

describe('interim is byte-identical', () => {
  test('the default call equals an explicit interim call; rookieConstantsBasis is "interim"; the only added key is rookieConstantsBasis', () => {
    for (const a of [WR_R1, WR_UNDRAFTED, WR_DAY3, RB_UNDRAFTED, QB_TOP12]) {
      for (const basisScale of [1, 1.101, 1.325]) {
        const d = R({ ...a, basisScale });
        assert.deepEqual(d, R({ ...a, basisScale, rookieConstantsModel: 'interim' }));
        assert.equal(d.rookieConstantsBasis, 'interim');
        assert.equal(d.rookieBasisScale, basisScale);
      }
    }
  });
  test('the helpers\' new `table` argument defaults to the exported half tables', () => {
    assert.deepEqual(resolveRookieCalibration({ position: 'WR', draftCapitalStatus: 'undrafted', nflDraftTier: null }),
      resolveRookieCalibration({ position: 'WR', draftCapitalStatus: 'undrafted', nflDraftTier: null, table: ROOKIE_CALIBRATION }));
    assert.deepEqual(applyRookieCeiling({ position: 'WR', projectedPPG: 12, basisScale: 1.1 }), applyRookieCeiling({ position: 'WR', projectedPPG: 12, basisScale: 1.1, table: ROOKIE_CEILING }));
    assert.deepEqual(resolveRookieTotalFactor({ position: 'RB', draftCapitalStatus: 'undrafted', nflDraftTier: null }),
      resolveRookieTotalFactor({ position: 'RB', draftCapitalStatus: 'undrafted', nflDraftTier: null, table: ROOKIE_TOTAL_FACTOR }));
    assert.deepEqual(resolveRookieQbStarterLevel({ ...QB_TOP12 }), resolveRookieQbStarterLevel({ ...QB_TOP12, table: QB_ROOKIE_STARTER_PPG }));
  });
});

describe('league-refit: each family present replaces its half table and takes scale 1; an absent one keeps half × scale', () => {
  test('baselinePPG: replaced and unscaled; calibration and ceiling (absent) keep their half constants, the ceiling still × scale', () => {
    const lc = { baselinePPG: { QB: 14, RB: 10, WR: 8, TE: 6 } };
    const r = R({ ...WR_UNDRAFTED, basisScale: 1.2, rookieConstantsModel: 'league-refit', leagueConstants: lc });
    const i = R({ ...WR_UNDRAFTED, basisScale: 1.2 });
    near(r.rookieCeilingPPGPre, 8 * r.cappedProduct * ROOKIE_CALIBRATION.undrafted.WR, 'league baseline, no scale');
    near(i.rookieCeilingPPGPre, 7 * 1.2 * i.cappedProduct * ROOKIE_CALIBRATION.undrafted.WR, 'interim baseline × scale');
    assert.equal(r.rookieCalibrationMult, ROOKIE_CALIBRATION.undrafted.WR, 'calibration absent → half cell');
    near(r.rookieCeilingKnee, ROOKIE_CEILING.WR.knee * 1.2, 'ceiling absent → half knee × scale');
    near(r.rookieCeilingAsymptote, ROOKIE_CEILING.WR.asymptote * 1.2);
    assert.equal(r.rookieBasisScale, 1.2, 'the measured scale is kept (S7)');
    assert.equal(r.rookieConstantsBasis, 'league:baselinePPG');
  });
  test('an unknown position falls back to 7 under a league baseline table too', () => {
    const r = R({ ...WR_R1, position: 'K', rookieConstantsModel: 'league-refit', leagueConstants: { baselinePPG: { WR: 8 } } });
    near(r.rookieCeilingPPGPre, 7 * r.cappedProduct);
  });
  test('calibration: a cell override applies unscaled; a cell absent from the league table is 1.00 / basis none', () => {
    const lc = { calibration: { undrafted: { WR: 0.5 }, day3: { WR: 0.6 } } };
    const u = R({ ...WR_UNDRAFTED, rookieConstantsModel: 'league-refit', leagueConstants: lc });
    assert.equal(u.rookieCalibrationMult, 0.5); assert.equal(u.rookieCalibrationBasis, 'undrafted:WR');
    near(u.rookieCeilingPPGPre, 7 * u.cappedProduct * 0.5);
    const d = R({ ...WR_DAY3, rookieConstantsModel: 'league-refit', leagueConstants: lc });
    assert.equal(d.rookieCalibrationMult, 0.6); assert.equal(d.rookieCalibrationBasis, 'day3:WR');
    const rb = R({ ...RB_UNDRAFTED, rookieConstantsModel: 'league-refit', leagueConstants: lc });
    assert.equal(rb.rookieCalibrationMult, 1.0); assert.equal(rb.rookieCalibrationBasis, 'none');
    assert.equal(u.rookieConstantsBasis, 'league:calibration');
  });
  test('ceiling: the closed form at the LEAGUE knee/asymptote, unscaled even under a measured scale', () => {
    // a league baseline of 30 × cappedProduct pushes the pre-ceiling level to the 40 clamp, well above the knee
    const lc = { baselinePPG: { WR: 30 }, ceiling: { WR: { knee: 9, asymptote: 12 } } };
    const r = R({ ...{ ...WR_R1, ageAtDraft: 21, draftPick: 1 }, basisScale: 1.3, rookieConstantsModel: 'league-refit', leagueConstants: lc });
    assert.equal(r.rookieCeilingPPGPre, 40);
    const expected = 9 + (12 - 9) * (1 - Math.exp(-(40 - 9) / (12 - 9)));
    assert.equal(r.rookieCeilingBasis, 'ceiling:WR');
    assert.equal(r.rookieCeilingKnee, 9); assert.equal(r.rookieCeilingAsymptote, 12);
    assert.equal(r.projectedPPG, Math.round(expected * 10) / 10);
    assert.equal(r.rookieConstantsBasis, 'league:baselinePPG,ceiling');
  });
  test('qbStarterPPG: the league level, unscaled; the interim level is half × scale', () => {
    const lc = { qbStarterPPG: { top12: 20, r1: 18, day2: 16, 'day3+': 15 } };
    const r = R({ ...QB_TOP12, basisScale: 1.114, rookieConstantsModel: 'league-refit', leagueConstants: lc });
    assert.equal(r.qbStarterPPG, 20); assert.equal(r.qbStarterBasis, 'rookie:top12');
    near(R({ ...QB_TOP12, basisScale: 1.114 }).qbStarterPPG, QB_ROOKIE_STARTER_PPG.top12 * 1.114);
    assert.equal(r.rookieConstantsBasis, 'league:qbStarterPPG');
  });
  test('totalFactor: the league factor multiplies projectedTotalPts under rookie-total and is reported under legacy', () => {
    const lc = { totalFactor: { day3: 0.9, undrafted: 0.5 } };
    const r = R({ ...RB_UNDRAFTED, rookieTotalModel: 'rookie-total', rookieConstantsModel: 'league-refit', leagueConstants: lc });
    assert.equal(r.rookieTotalFactor, 0.5); assert.equal(r.rookieTotalBasis, 'undrafted:RB');
    const base = R({ ...RB_UNDRAFTED, rookieTotalModel: 'rookie-total' });
    assert.equal(base.rookieTotalFactor, ROOKIE_TOTAL_FACTOR.undrafted);
    const ceiled = r.projectedPPG; void ceiled;
    const legacy = R({ ...RB_UNDRAFTED, rookieTotalModel: 'legacy', rookieConstantsModel: 'league-refit', leagueConstants: lc });
    assert.equal(legacy.rookieTotalFactor, 0.5, 'reported under legacy');
    assert.ok(r.projectedTotalPts < legacy.projectedTotalPts, 'applied only under rookie-total (0.5 < 1)');
    assert.equal(r.rookieConstantsBasis, 'league:totalFactor');
  });
  test('rookieConstantsBasis: families sorted and comma-joined; an empty or all-null leagueConstants is "interim"', () => {
    const lc = { totalFactor: { day3: 1, undrafted: 1 }, baselinePPG: { WR: 7 }, ceiling: ROOKIE_CEILING, calibration: null };
    assert.equal(R({ ...WR_R1, rookieConstantsModel: 'league-refit', leagueConstants: lc }).rookieConstantsBasis, 'league:baselinePPG,ceiling,totalFactor');
    assert.equal(R({ ...WR_R1, rookieConstantsModel: 'league-refit', leagueConstants: {} }).rookieConstantsBasis, 'interim');
    assert.equal(R({ ...WR_R1, rookieConstantsModel: 'league-refit', leagueConstants: { ceiling: null } }).rookieConstantsBasis, 'interim');
  });
  test('the exported half tables are never mutated', () => {
    const snap = () => JSON.stringify([ROOKIE_CALIBRATION, ROOKIE_CEILING, QB_ROOKIE_STARTER_PPG, ROOKIE_TOTAL_FACTOR, ROOKIE_BASELINE_PPG]);
    const before = snap();
    R({ ...QB_TOP12, basisScale: 1.2, rookieConstantsModel: 'league-refit', leagueConstants: {
      baselinePPG: { QB: 1 }, calibration: { undrafted: { QB: 0.1 } }, ceiling: { QB: { knee: 1, asymptote: 2 } }, qbStarterPPG: { top12: 1 }, totalFactor: { day3: 0.1, undrafted: 0.1 },
    } });
    assert.equal(snap(), before);
  });
  test('throws: league-refit without constants, constants under interim, an unknown family, an unknown model', () => {
    assert.throws(() => R({ ...WR_R1, rookieConstantsModel: 'league-refit' }), /needs leagueConstants/);
    assert.throws(() => R({ ...WR_R1, rookieConstantsModel: 'league-refit', leagueConstants: null }), /needs leagueConstants/);
    assert.throws(() => R({ ...WR_R1, leagueConstants: {} }), /apply only under rookie constants model 'league-refit'/);
    assert.throws(() => R({ ...WR_R1, rookieConstantsModel: 'league-refit', leagueConstants: { positionPriorPPG: {} } }), /unknown league constants family/);
    assert.throws(() => R({ ...WR_R1, rookieConstantsModel: 'bogus' }), /unknown rookie constants model/);
  });
});

describe('prospectPriorPPG positionPriorPPG (F5)', () => {
  const a = { position: 'WR', age: 23, pick: null, sm1: { gamesPlayed: 8, fantasyPoints: 8 * 10 } };
  test('default = PROSPECT_MIRROR.positionPriorPPG (byte-identical); an override replaces the constant and the blend follows', () => {
    assert.deepEqual(prospectPriorPPG(a), prospectPriorPPG({ ...a, positionPriorPPG: PROSPECT_MIRROR.positionPriorPPG }));
    const o = prospectPriorPPG({ ...a, basisScale: 1, positionPriorPPG: { WR: 11 } });
    near(o.priorPPG, 11 * ageMultiplier(23) * draftMultiplier(null));
    near(o.prospectPPG, (o.priorPPG * 8 + 10 * 8) / 16);
  });
  test('a position missing from the override falls back to fallbackPriorPPG (the table is replaced, not merged)', () => {
    near(prospectPriorPPG({ ...a, position: 'QB', positionPriorPPG: { WR: 11 } }).priorPPG, PROSPECT_MIRROR.fallbackPriorPPG * ageMultiplier(23) * draftMultiplier(null));
  });
});

// ─── the league constants file ────────────────────────────────────────────────

const fileOf = (over = {}) => ({
  basis: 'league',
  families: {
    F1: { verdict: 'wire', constants: { baselinePPG: { QB: 14, RB: 10, WR: 8, TE: 6 }, calibration: { undrafted: { WR: 0.4 }, day3: { WR: 0.8 } } } },
    F2: { verdict: 'do-not-wire', constants: { ceiling: { WR: { knee: 11, asymptote: 15 } } } },
    F3: { verdict: 'wire', constants: { qbStarterPPG: { top12: 17, r1: 16, day2: 15, 'day3+': 14 } } },
    F4: { verdict: 'stop-and-report', constants: { totalFactor: { day3: 0.8, undrafted: 0.8 } } },
    F5: { verdict: 'wire', constants: { positionPriorPPG: { QB: 15, RB: 13, WR: 10, TE: 8 }, wirePositions: ['WR'] } },
    ...over,
  },
});

describe('scripts/rookie-constants-file.mjs', () => {
  test('only a family with verdict "wire" is read; F1 yields both baselinePPG and calibration; F5 yields only its wirePositions', () => {
    const w = wiredConstantsOf(fileOf());
    assert.equal(w.rookieConstantsModel, 'league-refit');
    assert.deepEqual(w.wiredFamilies, ['F1', 'F3', 'F5']);
    assert.deepEqual(Object.keys(w.leagueConstants).sort(), ['baselinePPG', 'calibration', 'qbStarterPPG']);
    assert.deepEqual(w.positionPriorPPG, { WR: 10 });
    assert.deepEqual(mirrorArgsOf(w), { rookieConstantsModel: 'league-refit', leagueConstants: w.leagueConstants });
    assert.deepEqual(mirrorArgsOf(null), {});
    // the wired set drives the mirror's basis string
    assert.equal(R({ ...QB_TOP12, ...mirrorArgsOf(w) }).rookieConstantsBasis, 'league:baselinePPG,calibration,qbStarterPPG');
  });
  test('nothing wired → empty leagueConstants (basis "interim"), no F5 override', () => {
    const none = fileOf({ F1: { verdict: 'do-not-wire', constants: {} }, F3: { verdict: 'do-not-wire', constants: {} }, F5: { verdict: 'do-not-wire', constants: {} } });
    const w = wiredConstantsOf(none);
    assert.deepEqual(w.leagueConstants, {}); assert.equal(w.positionPriorPPG, null); assert.deepEqual(w.wiredFamilies, []);
    assert.equal(R({ ...WR_R1, ...mirrorArgsOf(w) }).rookieConstantsBasis, 'interim');
  });
  test('malformed files throw: wrong basis, missing family, a wired family missing a constants key, a wired F5 without wirePositions', () => {
    assert.throws(() => wiredConstantsOf({ ...fileOf(), basis: 'half_ppr' }), /expected a league constants file/);
    assert.throws(() => wiredConstantsOf({ basis: 'league' }), /no families/);
    const noF2 = fileOf(); delete noF2.families.F2;
    assert.throws(() => wiredConstantsOf(noF2), /families\.F2 is absent/);
    assert.throws(() => wiredConstantsOf(fileOf({ F1: { verdict: 'wire', constants: { baselinePPG: { QB: 1 } } } })), /wired F1 needs constants\.calibration/);
    assert.throws(() => wiredConstantsOf(fileOf({ F5: { verdict: 'wire', constants: { positionPriorPPG: { WR: 1 } } } })), /wirePositions/);
    assert.throws(() => wiredConstantsOf(fileOf({ F5: { verdict: 'wire', constants: { positionPriorPPG: { WR: 'x' }, wirePositions: ['WR'] } } })), /not a number/);
  });
  test('loadRookieConstants reads a path and records "<path> @ <sha1 of the bytes>"', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rcf-'));
    try {
      const p = path.join(dir, 'c.json');
      const text = JSON.stringify(fileOf());
      fs.writeFileSync(p, text);
      const rc = loadRookieConstants(p);
      assert.equal(rc.ref, `${p} @ ${crypto.createHash('sha1').update(text).digest('hex')}`);
      assert.deepEqual(rc.wiredFamilies, ['F1', 'F3', 'F5']);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ─── harness plumbing ─────────────────────────────────────────────────────────

describe('inseason-run: rookieRecordFor / rookiePriorFor carry the constants model', () => {
  const playerIds = { bySleeper: { w1: { draftYear: 2020, draftRound: 1, draftPick: 5, undrafted: false, birthdate: '1998-06-01' }, q1: { draftYear: 2020, draftRound: 1, draftPick: 3, undrafted: false, birthdate: '1998-06-01' } } };
  const lc = { baselinePPG: { QB: 14, RB: 10, WR: 8, TE: 6 } };
  test('rookiePriorFor with the two trailing arguments equals the mirror at league-refit; without them it is the interim prior', () => {
    const withLc = rookiePriorFor('w1', 'WR', 2020, playerIds, 1.1, 'league-refit', lc);
    assert.equal(withLc, rookieRecordFor('w1', 'WR', 2020, playerIds, { rookieQbModel: 'legacy', basisScale: 1.1, rookieConstantsModel: 'league-refit', leagueConstants: lc }).projectedPPG);
    assert.notEqual(withLc, rookiePriorFor('w1', 'WR', 2020, playerIds, 1.1));
    assert.equal(rookiePriorFor('w1', 'WR', 2020, playerIds, 1.1), rookiePriorFor('w1', 'WR', 2020, playerIds, 1.1, undefined, undefined));
    assert.equal(rookieRecordFor('w1', 'WR', 2020, playerIds, { rookieQbModel: 'legacy', basisScale: 1.1, rookieConstantsModel: 'league-refit', leagueConstants: lc }).rookieConstantsBasis, 'league:baselinePPG');
  });
  test('an absent argument pair leaves the record byte-identical to a call that never heard of the model', () => {
    assert.deepEqual(rookieRecordFor('q1', 'QB', 2020, playerIds, { rookieQbModel: 'rookie-qb-level', basisScale: 1.114 }),
      R({ position: 'QB', ageAtDraft: 22, draftRound: 1, draftPick: 3, draftCapitalStatus: 'matched', yearsExp: 0, rookieQbModel: 'rookie-qb-level', basisScale: 1.114 }));
  });
});

describe('--rookie-constants is admitted only with --basis league', () => {
  const explodes = new Proxy({}, { get: (_, k) => { throw new Error(`loader ${String(k)} was read`); } });
  test('runInSeason / runInSeasonDyn / runRookieTotal throw under half_ppr before reading anything', () => {
    assert.throws(() => runInSeason({ load: explodes, basis: 'half_ppr', rookieConstants: {} }), /apply only with --basis league/);
    assert.throws(() => runInSeasonDyn({ load: explodes, qbPrior: 'starter', basis: 'half_ppr', rookieConstants: {} }), /apply only with --basis league/);
    assert.throws(() => runRookieTotal({ load: explodes, rookieConstants: {} }), /apply only with --basis league/);
  });
  test('the bin: an error under half_ppr (--inseason, --inseason --dynasty, --rookie-total); a missing path; a missing file', () => {
    for (const mode of [['--inseason'], ['--inseason', '--dynasty'], ['--rookie-total']]) {
      const r = bin('bin/backtest.mjs', [...mode, '--rookie-constants', 'x.json']);
      assert.equal(r.status, 1, mode.join(' ')); assert.match(r.stderr, /--rookie-constants applies only with --basis league/, mode.join(' '));
    }
    const noPath = bin('bin/backtest.mjs', ['--inseason', '--basis', 'league', '--rookie-constants']);
    assert.equal(noPath.status, 1); assert.match(noPath.stderr, /--rookie-constants needs a path/);
    const missing = bin('bin/backtest.mjs', ['--inseason', '--basis', 'league', '--rookie-constants', '/nonexistent/c.json']);
    assert.equal(missing.status, 1); assert.match(missing.stderr, /ENOENT/);
    const other = bin('bin/backtest.mjs', ['--inseason', '--basis', 'league', '--rookie-constants', 'x.json', '--from', '2015']);
    assert.equal(other.status, 1); assert.match(other.stderr, /--inseason rejects --from/); assert.doesNotMatch(other.stderr, /rejects[^—]*--rookie-constants/);
  });
});

describe('runInSeasonDyn: F5 prior override, pickForA on the rows, onRows second argument', () => {
  const totals = (fp) => ({ team: 'KC', gamesPlayed: 12, fantasyPoints: fp, scoringBasis: 'half_ppr', stats: { rec_yd: fp * 10 }, weeklyPoints: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, fp / 12])) });
  function leagueDynLoad() {
    const rows = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`v${i}`, totals(120)]));
    const ids = { 'g-w1': { sleeperId: 'w1', position: 'WR' }, 'g-r1': { sleeperId: 'r1', position: 'RB' } };
    const bySleeper = {
      w1: { draftYear: 2019, draftRound: null, draftPick: null, draftOvr: null, undrafted: true, birthdate: '1998-01-01' },
      r1: { draftYear: 2019, draftRound: null, draftPick: null, draftOvr: null, undrafted: true, birthdate: '1998-01-01' },
    };
    for (let i = 0; i < 40; i++) { ids[`g-v${i}`] = { sleeperId: `v${i}`, position: 'WR' }; bySleeper[`v${i}`] = { draftYear: 2000, undrafted: false, birthdate: '1990-01-01' }; }
    const s2019 = { ...rows(40), w1: totals(100), r1: totals(100) };
    // 2020: the two rookies with a gamelogs file that reconciles with their season-totals opportunities (rec_tgt 80 = 10 × 8 targets)
    const opp = (stats) => ({ team: 'KC', gamesPlayed: 10, fantasyPoints: 100, scoringBasis: 'half_ppr', stats, weeklyPoints: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i + 1, 10])) });
    const s2020 = { w1: opp({ rec_tgt: 80, rush_att: 0, rec_yd: 1000 }), r1: opp({ rec_tgt: 80, rush_att: 0, rec_yd: 1000 }) };
    const glGames = Array.from({ length: 10 }, (_, i) => ({ seasonType: 'REG', week: i + 1, team: 'KC', targets: 8, carries: 0 }));
    return {
      ...INSEASON_DYN_LOAD,
      loadSeasonTotals: (y) => (y >= 2012 && y <= 2019 ? s2019 : y === 2020 ? s2020 : null),
      loadGameLogs: (y) => (y === 2020 ? { players: { w1: { games: glGames }, r1: { games: glGames } }, unmapped: 0 } : null), loadSchedule: () => null, loadAdvstats: () => null, loadRoster: () => null, loadDepth: () => null, loadSnapShare: () => null,
      loadPlayerIds: () => ({ ids, bySleeper }),
      loadManifest: () => ({ files: {} }),
      loadLeagueScoring: () => ({ rec_yd: 0.12 }),
      loadLeaguePositionOf: () => (pid) => (pid === 'r1' ? 'RB' : 'WR'),
      loadInSeasonConstants: () => ({ constants: {} }),
      loadQbTakeoverConstants: INSEASON_DYN_LOAD.loadQbTakeoverConstants,
    };
  }
  const assemble = (S) => ({ rows: S === 2020 ? ['w1', 'r1'].map((sleeperId) => ({ sleeperId, S, W: 4, n: 4, position: sleeperId === 'w1' ? 'WR' : 'RB', arm: 'X-rookie1p', obsPPG: 10, nextPPG: 10, nextPPG2: 11, pointsPrior: 10, pointsPriorNext: 10 })) : [] });
  const run = (rookieConstants) => {
    let seen = null, seenPre = null;
    try {
      runInSeasonDyn({ qbPrior: 'starter', qbResearch: false, basis: 'league', inseason2a: 'backtests/2026-10-07-inseason-constants.json', load: leagueDynLoad(), assemble, rookieConstants, onRows: (rows, pre) => { seen = rows; seenPre = pre; } });
    } catch (e) { if (!seen) throw e; /* the rows are what this test reads; a later analysis step may refuse a one-season fixture */ }
    return { rows: seen, preFilterRows: seenPre };
  };

  test('rows carry pickForA and the as-of basisScale-scaled arm-A prior; a wired F5 position takes its league constant at scale 1 and other positions are untouched; onRows gets the pre-filter rows second', () => {
    const base = run(null);
    const f5 = run({ rookieConstantsModel: 'league-refit', leagueConstants: {}, positionPriorPPG: { WR: 10 }, wiredFamilies: ['F5'], ref: 'x @ y' });
    const wr = base.rows.find((r) => r.sleeperId === 'w1'), wrL = f5.rows.find((r) => r.sleeperId === 'w1');
    const rb = base.rows.find((r) => r.sleeperId === 'r1'), rbL = f5.rows.find((r) => r.sleeperId === 'r1');
    assert.ok('pickForA' in wr && wr.pickForA === null, 'YE1 rows carry pick null (D5)');
    near(wr.prospectPrior, prospectPriorPPG({ position: 'WR', age: wr.age, pick: null, sm1: wr.sm1, basisScale: 1.2 }).prospectPPG, 'interim: the position prior × the as-of measured scale (40 WR rows at league/half = 1.2)');
    near(wrL.prospectPrior, prospectPriorPPG({ position: 'WR', age: wr.age, pick: null, sm1: wr.sm1, basisScale: 1, positionPriorPPG: { WR: 10 } }).prospectPPG);
    assert.notEqual(wr.prospectPrior, wrL.prospectPrior);
    assert.equal(rb.prospectPrior, rbL.prospectPrior, 'RB untouched: not a decided position');
    assert.ok(base.preFilterRows.length >= base.rows.length);
    assert.deepEqual(base.rows.map((r) => r.sleeperId).sort(), ['r1', 'w1']);
  });
});
