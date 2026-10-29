/**
 * test/dynasty-mirror.test.mjs — S3a golden parity (CR-32). Reads only test/fixtures/ (Invariant 10).
 *
 * T-G1 the mirror equals the app's own output (expected-<S>.json, made by the app's computeDynastyScore etc.)
 * T-G2 composeDynastyScore equals the mirror score     T-G3 the goldens exercise every path that matters
 * T-U1 option seams at their defaults change nothing   T-U2 TEAM_ filter   T-U3 currentYear   T-U4 injury look-ahead
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  empiricalAgeCurvesMirror, teamContextMirror, historicalTeamTotalsMirror, historicalSharesMirror,
  dynastyScoreMirror, composeDynastyScore, applyQBQualityModifierMirror,
} from '../lib/dynastyMirror.mjs';
import { seasonView, classifyInjurySeason } from '../lib/durabilityMirror.mjs';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'dynasty-mirror-parity');
const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const norm = (x) => JSON.parse(JSON.stringify(x));
const SEASONS = [2019, 2023];
const MODES = ['current-team', 'per-season-team'];
const POS = ['QB', 'RB', 'WR', 'TE'];

const fx = {};
for (const S of SEASONS) fx[S] = { inputs: read(`inputs-${S}.json`), expected: read(`expected-${S}.json`) };

function runMirror(inputs, mode, options = {}) {
  const { S, currentYear, scoringSettings, playersMap, depthMap, careerStats } = inputs;
  const bundle = empiricalAgeCurvesMirror(careerStats, playersMap, { currentYear });
  const tc = teamContextMirror(careerStats, playersMap, S, { attribution: mode });
  const totals = historicalTeamTotalsMirror(careerStats, playersMap, { attribution: mode });
  const shares = historicalSharesMirror(careerStats, playersMap, totals, { attribution: mode });
  const scores = {};
  for (const pid of Object.keys(playersMap)) {
    scores[pid] = dynastyScoreMirror(
      pid, playersMap, careerStats, bundle.curves, bundle.positionPeakPPG, null, scoringSettings, null,
      tc, depthMap, shares, bundle.positionPeakAge, bundle.positionBasisScale, null, null, options,
    );
  }
  return { bundle, tc, shares, scores };
}
const stripRaw = (r) => { const { raw, ...rest } = r; return rest; }; // eslint-disable-line no-unused-vars

function firstDiffs(actual, expected, limit = 10) {
  const out = [];
  for (const pid of Object.keys(expected)) {
    if (JSON.stringify(actual[pid]) !== JSON.stringify(expected[pid])) {
      out.push(pid);
      if (out.length >= limit) break;
    }
  }
  return out;
}

function pathOf(res) {
  if (res.components) return res.signals.seasonsOfData <= 2 ? 'B' : 'C';
  const s = res.signals ?? {};
  if (s.isProspect) return 'A';
  if (s.isUnprovenVet) return 'A2';
  if (s.isStaleData) return 'A3';
  if (s.isDataGap) return 'A4';
  if (s.isNonFinite) return 'nonFinite';
  return 'N/A';
}

describe('T-G1 parity with the app', () => {
  for (const S of SEASONS) {
    const { inputs, expected } = fx[S];
    test(`${S}: the golden names its app revision`, () => {
      assert.match(expected.sourceRev, /^[0-9a-f]{7,}$/);
      assert.equal(expected.S, S);
    });
    for (const mode of MODES) {
      test(`${S} ${mode}: curves, teamContext, historicalShares and every score equal the app's`, () => {
        const m = runMirror(inputs, mode);
        assert.deepEqual(norm(m.bundle.curves), expected.curves, 'curves');
        assert.deepEqual(norm(m.bundle.positionPeakPPG), expected.positionPeakPPG, 'positionPeakPPG');
        assert.deepEqual(norm(m.bundle.positionPeakAge), expected.positionPeakAge, 'positionPeakAge');
        assert.deepEqual(norm(m.bundle.positionBasisScale), expected.positionBasisScale, 'positionBasisScale');
        assert.deepEqual(norm(m.tc), expected.teamContext[mode], 'teamContext');
        assert.deepEqual(norm(m.shares), expected.historicalShares[mode], 'historicalShares');
        const actual = {};
        for (const [pid, r] of Object.entries(m.scores)) actual[pid] = stripRaw(norm(r));
        const diffs = firstDiffs(actual, expected.scores[mode]);
        assert.equal(diffs.length, 0, `differing pids (first 10): ${diffs.join(', ')}`);
        assert.equal(Object.keys(actual).length, Object.keys(expected.scores[mode]).length);
      });
    }
    for (const level of ['30', '85']) {
      test(`${S}: the QB-quality modifier at ${level} equals the app's`, () => {
        const m = runMirror(inputs, 'per-season-team');
        const teams = [...new Set(Object.values(inputs.playersMap).map(p => p.team).filter(Boolean))];
        const map = Object.fromEntries(teams.map(t => [t, Number(level)]));
        const actual = {};
        for (const [pid, res] of Object.entries(m.scores)) {
          const p = inputs.playersMap[pid];
          if (!res.components || p.position === 'QB') continue;
          actual[pid] = stripRaw(norm(applyQBQualityModifierMirror({ position: p.position, nfl_team: p.team, dynastyScore: res }, map).dynastyScore));
        }
        assert.ok(Object.keys(actual).length > 0);
        const diffs = firstDiffs(actual, expected.qbMod[level]);
        assert.equal(diffs.length, 0, `differing pids (first 10): ${diffs.join(', ')}`);
        assert.equal(Object.keys(actual).length, Object.keys(expected.qbMod[level]).length);
      });
    }
  }
});

describe('T-G2 composeDynastyScore', () => {
  for (const S of SEASONS) {
    test(`${S}: equals the mirror score for every B/C row`, () => {
      const m = runMirror(fx[S].inputs, 'per-season-team');
      let n = 0;
      for (const [pid, r] of Object.entries(m.scores)) {
        if (!r.components) continue;
        n++;
        assert.equal(composeDynastyScore(r.raw), r.score, `pid ${pid}`);
      }
      assert.ok(n > 50);
    });
  }
  test('term order is fixed whatever the weights object key order', () => {
    const raw = { ageAdjScore: 61.3, trajectoryScore: 48.2, currentLevelScore: 77, effectiveReliability: 64, opportunityScore: 52, seasonsOfData: 4 };
    const w = { opportunityQuality: 0.15, reliability: 0.10, currentLevel: 0.22, trajectory: 0.25, ageAdjusted: 0.28 };
    assert.equal(composeDynastyScore(raw, w), composeDynastyScore(raw));
  });
});

describe('T-G3 the goldens exercise the routing', () => {
  for (const S of SEASONS) {
    test(`${S}: Path B/C per position, other paths, and a non-null depth order per position`, () => {
      const { expected, inputs } = fx[S];
      const counts = Object.fromEntries(POS.map(p => [p, {}]));
      const depth = Object.fromEntries(POS.map(p => [p, 0]));
      for (const [pid, res] of Object.entries(expected.scores['per-season-team'])) {
        const pos = inputs.playersMap[pid].position;
        const k = pathOf(res);
        counts[pos][k] = (counts[pos][k] ?? 0) + 1;
        if (res.signals?.depthOrder != null) depth[pos]++;
      }
      const msg = JSON.stringify(counts);
      for (const pos of POS) {
        assert.ok((counts[pos].B ?? 0) >= 5, `${pos} Path B ${msg}`);
        assert.ok((counts[pos].C ?? 0) >= 15, `${pos} Path C ${msg}`);
        assert.ok(depth[pos] > 0, `${pos} has no row with a depth order`);
      }
      const all = {};
      for (const c of Object.values(counts)) for (const [k, v] of Object.entries(c)) all[k] = (all[k] ?? 0) + v;
      for (const k of ['A', 'A2', 'A3']) assert.ok((all[k] ?? 0) >= 1, `no ${k} row ${msg}`);
    });
  }
});

describe('T-U1 option seams at their defaults', () => {
  for (const S of SEASONS) {
    test(`${S}: empty / no-op / explicit-default options leave every row identical`, () => {
      const base = runMirror(fx[S].inputs, 'per-season-team').scores;
      const variants = [
        { targetShareOverride: new Map() },
        { shareTrendBoostOff: () => false },
        { reliabilityMix: { consistency: 0.45, durability: 0.55 } },
        { targetShareOverride: null, shareTrendBoostOff: null },
      ];
      for (const options of variants) {
        const v = runMirror(fx[S].inputs, 'per-season-team', options).scores;
        assert.equal(JSON.stringify(v), JSON.stringify(base), Object.keys(options).join(','));
      }
    });
  }
  test('a seam that is switched on does change the score', () => {
    const { inputs } = fx[2019];
    const base = runMirror(inputs, 'per-season-team').scores;
    const off = runMirror(inputs, 'per-season-team', { shareTrendBoostOff: () => true }).scores;
    assert.notEqual(JSON.stringify(off), JSON.stringify(base));
  });

  test('targetShareOverride replaces an existing WR/TE share and never creates one; other pids untouched', () => {
    const { inputs } = fx[2019];
    const base = runMirror(inputs, 'per-season-team').scores;
    const bc = Object.entries(base).filter(([, r]) => r.components);
    const wrShare = bc.find(([pid, r]) => inputs.playersMap[pid].position === 'WR' && r.signals.targetShare != null
      && Number.isFinite(r.components.opportunityQuality.shareScore) && r.signals.targetShare !== 0.30);
    const rb = bc.find(([pid]) => inputs.playersMap[pid].position === 'RB');
    const wrNoShare = bc.find(([pid, r]) => inputs.playersMap[pid].position === 'WR' && r.signals.targetShare == null);
    assert.ok(wrShare && rb && wrNoShare, 'fixture lacks a needed row');
    const chosen = [wrShare[0], rb[0], wrNoShare[0]];
    const ov = runMirror(inputs, 'per-season-team', { targetShareOverride: new Map(chosen.map(p => [p, 0.30])) }).scores;
    assert.equal(ov[wrShare[0]].signals.targetShare, 0.30);
    assert.notEqual(ov[wrShare[0]].components.opportunityQuality.shareScore, base[wrShare[0]].components.opportunityQuality.shareScore);
    assert.equal(JSON.stringify(ov[rb[0]]), JSON.stringify(base[rb[0]]));
    assert.equal(JSON.stringify(ov[wrNoShare[0]]), JSON.stringify(base[wrNoShare[0]]));
    for (const pid of Object.keys(base)) {
      if (!chosen.includes(pid)) assert.equal(JSON.stringify(ov[pid]), JSON.stringify(base[pid]), pid);
    }
  });

  test('reliabilityMix weights consistency and durability as given', () => {
    const { inputs } = fx[2019];
    const base = runMirror(inputs, 'per-season-team').scores;
    const hit = Object.entries(base).find(([, r]) => r.components && Math.round(r.raw.consistencyScore) !== Math.round(r.raw.durabilityScore));
    assert.ok(hit, 'fixture lacks a row with differing consistency/durability');
    const [pid, r] = hit;
    const cOnly = runMirror(inputs, 'per-season-team', { reliabilityMix: { consistency: 1, durability: 0 } }).scores[pid];
    const dOnly = runMirror(inputs, 'per-season-team', { reliabilityMix: { consistency: 0, durability: 1 } }).scores[pid];
    assert.equal(cOnly.components.reliability.value, Math.round(r.raw.consistencyScore));
    assert.equal(dOnly.components.reliability.value, r.raw.durabilityScore);
  });
});

const row = (gp, fp, team, stats = {}, extra = {}) => ({ gamesPlayed: gp, fantasyPoints: fp, team, stats, ...extra });

describe('T-U2 TEAM_ filter', () => {
  const careerStats = {
    2019: {
      a: row(16, 200, 'BUF', { rec: 60, rush_att: 0 }),
      b: row(16, 180, 'BUF', { rec: 40, rush_att: 0 }),
      c: row(16, 150, 'BUF', { rec: 5, rush_att: 200 }),
      TEAM_BUF: row(17, 530, 'BUF', { rec: 105, rush_att: 200 }),
    },
  };
  const playersMap = { a: { position: 'WR', team: 'BUF' }, b: { position: 'WR', team: 'BUF' }, c: { position: 'RB', team: 'BUF' } };
  test('per-season-team totals and shares are not doubled by the aggregate row', () => {
    const tc = teamContextMirror(careerStats, playersMap, 2019, { attribution: 'per-season-team' });
    assert.equal(tc.teamOffense.BUF.rec, 105);
    assert.equal(tc.teamOffense.BUF.rushAtt, 200);
    assert.equal(tc.teamOffense.BUF.totalPts, 530);
    assert.equal(tc.playerShares.a.targetShare, Math.round(60 / 105 * 1000) / 1000);
    assert.equal(tc.playerShares.c.carryShare, 1);
    assert.equal(tc.playerShares.TEAM_BUF, undefined);
  });
  test('current-team mode ignores the row (no playersMap entry), as the app', () => {
    const tc = teamContextMirror(careerStats, playersMap, 2019, { attribution: 'current-team' });
    assert.equal(tc.teamOffense.BUF.rec, 105);
  });
});

describe('T-U3 currentYear', () => {
  test('shifting currentYear by one shifts every curve age by one', () => {
    // exact check on a tiny synthetic store (no range edge effects)
    const cs = { 2018: { x: row(16, 160, 'BUF') }, 2019: { x: row(16, 192, 'BUF') } };
    const pm = { x: { position: 'WR', age: 26 } };
    const c20 = empiricalAgeCurvesMirror(cs, pm, { currentYear: 2020 }).curves.WR.map(p => p.age);
    const c21 = empiricalAgeCurvesMirror(cs, pm, { currentYear: 2021 }).curves.WR.map(p => p.age);
    assert.deepEqual(c20, [24, 25]);
    assert.deepEqual(c21, [23, 24]);
  });
});

describe('T-U4 injury look-ahead', () => {
  test('the as-of view loses the S+1 rescue', () => {
    const stats = { off_snp: 100, tm_off_snp: 1000 };
    const careerStats = {
      2018: { p: row(16, 100, 'BUF', stats) },
      2019: { p: row(6, 30, 'BUF', stats, { dnpWeeks: 5 }) },       // low games, dnp >= 3, not a contributor itself
      2020: { p: row(16, 200, 'BUF', { off_snp: 900, tm_off_snp: 1000 }) },
    };
    // 2018 is not a contributor (10% snaps, no starts, no volume), 2020 is.
    assert.equal(classifyInjurySeason(careerStats, 'p', 'WR', 2019), true, 'full store: rescued by 2020');
    assert.equal(classifyInjurySeason(seasonView(careerStats, 2019), 'p', 'WR', 2019), false, 'as-of 2019: no rescue');
  });
});
