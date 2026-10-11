/**
 * test/rookie-total.test.mjs — D-13 composed rookie total points (research-arms-w3, .claude/tasks/research-arms-w3-d13.md §7.3).
 * Stub loaders and hand-built rows; the live panel is exercised by `node bin/backtest.mjs --rookie-total`.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

import { reconstructRookieProjection } from '../lib/projectionFactors.mjs';
import { reconstructShippedRookieProjection } from '../lib/rookieMirror.mjs';
import { composeRookieRow, biasSummary, losoMultiplier, maeDelta, decideRookieTotal, ROOKIE_TOTAL } from '../lib/rookieTotalPoints.mjs';
import { runRookieTotal, ROOKIE_TOTAL_PIN } from '../scripts/rookie-total-run.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

function wrRow(over = {}) {
  const base = { sleeperId: 'w1', position: 'WR', draftYear: 2020, draftRound: null, draftPick: null, draftGroup: 'undrafted', experienceYears: 0, experienceBucket: '0', targetSeason: 2020, outcomeGames: 3, outcomeTotalPts: 10 };
  const projectedPPG = reconstructRookieProjection({ position: base.position, ageAtDraft: 22, draftRound: null, draftPick: null }).projectedPPG;
  return { ...base, projectedPPG, ...over };
}

describe('composeRookieRow', () => {
  test('equals reconstructShippedRookieProjection on an undrafted WR row; parity breaks when projectedPPG is altered', () => {
    const row = wrRow();
    const ref = reconstructShippedRookieProjection({ position: 'WR', ageAtDraft: 22, draftRound: null, draftPick: null, draftCapitalStatus: 'undrafted', yearsExp: 0 });
    const c = composeRookieRow(row, 22);
    assert.equal(c.predTotal, ref.projectedTotalPts);
    assert.equal(c.predPPG, ref.projectedPPG);
    assert.equal(c.predGames, ref.projectedGames);
    assert.equal(c.gamesBasis, ref.rookieGamesBasis);
    assert.equal(c.parity, true);
    assert.equal(composeRookieRow({ ...row, projectedPPG: row.projectedPPG + 0.1 }, 22).parity, false);
  });
});

describe('biasSummary', () => {
  const rows = [
    { sleeperId: 'a', predTotal: 10, predPPG: 2, outcomeTotalPts: 5, outcomeGames: 3 },
    { sleeperId: 'a', predTotal: 20, predPPG: 4, outcomeTotalPts: 10, outcomeGames: 2 },
    { sleeperId: 'b', predTotal: 30, predPPG: 5, outcomeTotalPts: 30, outcomeGames: 6 },
    { sleeperId: 'b', predTotal: 40, predPPG: 5, outcomeTotalPts: 35, outcomeGames: 6 },
  ];
  test('four rows, two players: exact ratio, games-held ratio, players; the CI brackets the ratio', () => {
    const s = biasSummary(rows);
    assert.equal(s.n, 4);
    assert.equal(s.players, 2);
    assert.equal(s.meanPred, 25);
    assert.equal(s.meanReal, 20);
    assert.equal(s.ratio, 1.25);
    assert.equal(s.gamesHeldRatio, 74 / 80);
    assert.ok(s.ci95[0] <= s.ratio && s.ratio <= s.ci95[1]);
    assert.equal(s.ppgRealOverPred.gp6, 65 / 60);
    assert.equal(s.ppgRealOverPred.gp1to5, 15 / 14);
  });
  test('an empty denominator gives null, not NaN', () => {
    const s = biasSummary(rows.slice(0, 2).map(r => ({ ...r, outcomeGames: 0 })));
    assert.equal(s.ppgRealOverPred.gp6, null);
    assert.equal(s.ppgRealOverPred.gp1to5, null);
  });
});

describe('losoMultiplier', () => {
  test('season A is held out with season B\'s ratio only (and vice versa); fullSample uses all rows', () => {
    const rows = [
      { sleeperId: 'a', targetSeason: 2020, predTotal: 10, outcomeTotalPts: 5 },
      { sleeperId: 'b', targetSeason: 2021, predTotal: 10, outcomeTotalPts: 20 },
    ];
    const r = losoMultiplier(rows, () => 'g');
    assert.deepEqual(r.preds, [20, 5]);
    assert.deepEqual(r.folds, [{ S: 2020, m: { g: 2 } }, { S: 2021, m: { g: 0.5 } }]);
    assert.deepEqual(r.fullSample, { g: 25 / 20 });
  });
  test('a zero Σpred in the training seasons gives multiplier 1', () => {
    const rows = [
      { sleeperId: 'a', targetSeason: 2020, predTotal: 10, outcomeTotalPts: 5 },
      { sleeperId: 'b', targetSeason: 2021, predTotal: 0, outcomeTotalPts: 3 },
    ];
    assert.deepEqual(losoMultiplier(rows, () => 'g').preds, [10, 0]);
  });
});

describe('maeDelta', () => {
  test('MAE of each side and a BEATS label when the correction is better on every row', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ sleeperId: `p${i}`, outcomeTotalPts: 10 }));
    const d = maeDelta(rows, rows.map(() => 14), rows.map(() => 11));
    assert.equal(d.maeShipped, 4);
    assert.equal(d.maeCorrected, 1);
    assert.equal(d.mean, -3);
    assert.equal(d.label, 'BEATS');
  });
});

describe('decideRookieTotal', () => {
  const bias = (ratio, ci95) => ({ ratio, ci95 });
  const loso = (label) => ({ label });
  const dec = (d3, ud) => decideRookieTotal({ day3: d3, undrafted: ud });
  const none = { bias: bias(1.0, [0.9, 1.1]), loso: loso('NO-GAIN') };

  test('over-statement with a BEATS LOSO is correct', () => {
    const r = dec({ bias: bias(1.26, [1.13, 1.41]), loso: loso('BEATS') }, none);
    assert.equal(r.perGroup.day3, 'correct');
    assert.equal(r.perGroup.undrafted, 'none');
  });
  test('ρ 1.04 is below materiality', () => {
    assert.equal(dec({ bias: bias(1.04, [1.01, 1.08]), loso: loso('BEATS') }, none).perGroup.day3, 'none');
  });
  test('a CI covering 1 is not biased', () => {
    assert.equal(dec({ bias: bias(1.2, [0.95, 1.4]), loso: loso('BEATS') }, none).perGroup.day3, 'none');
  });
  test('a NO-GAIN LOSO blocks an otherwise biased group', () => {
    assert.equal(dec({ bias: bias(1.26, [1.13, 1.41]), loso: loso('NO-GAIN') }, none).perGroup.day3, 'none');
  });
  test('under-statement is symmetric (ρ ≤ 0.95, CI upper < 1)', () => {
    assert.equal(dec({ bias: bias(0.9, [0.8, 0.99]), loso: loso('BEATS') }, none).perGroup.day3, 'correct');
  });
  test('recommend iff either group is correct', () => {
    const ok = { bias: bias(1.2, [1.05, 1.4]), loso: loso('BEATS') };
    assert.equal(dec(ok, none).verdict, 'recommend');
    assert.equal(dec(none, ok).verdict, 'recommend');
    assert.equal(dec(none, none).verdict, 'close');
  });
});

describe('runRookieTotal (stub load)', () => {
  const PLAYERS = [
    ['d1', 'RB', 'day3', 'RB', 2018, 4, 120], ['d2', 'WR', 'day3', 'WR', 2018, 5, 150], ['d3', 'WR', 'day3', 'WR', 2019, 5, 160],
    ['u1', 'RB', 'undrafted', 'RB', 2018, null, null], ['u2', 'WR', 'undrafted', 'WR', 2019, null, null], ['q1', 'QB', 'undrafted', 'QB', 2019, null, null],
  ];
  function stub({ breakParity = false } = {}) {
    const bySleeper = {};
    const rows = PLAYERS.map(([sleeperId, position, draftGroup, , draftYear, draftRound, draftPick], i) => {
      bySleeper[sleeperId] = { birthdate: `${draftYear - 22}-03-01` };
      const projectedPPG = reconstructRookieProjection({ position, ageAtDraft: 22, draftRound, draftPick }).projectedPPG;
      return {
        sleeperId, position, draftYear, draftRound, draftPick, draftGroup, experienceYears: 0, experienceBucket: '0',
        targetSeason: draftYear + (i % 2), projectedPPG: breakParity && i === 0 ? projectedPPG + 1 : projectedPPG,
        outcomeGames: 4 + i, outcomeTotalPts: 10 + 5 * i,
      };
    });
    return { load: { loadPanel: () => ({ rookiePathAll: { rows } }), loadPlayerIds: () => ({ bySleeper }) }, pin: { ...ROOKIE_TOTAL_PIN, rows: rows.length } };
  }

  test('throws on a row-count mismatch', () => {
    const { load } = stub();
    assert.throws(() => runRookieTotal({ load, pin: ROOKIE_TOTAL_PIN }), /6 rows, pin says 3848/);
  });
  test('throws on a parity mismatch, naming the count', () => {
    const { load, pin } = stub({ breakParity: true });
    assert.throws(() => runRookieTotal({ load, pin }), /parity: 1 of 6/);
  });
  test('throws when a row has no birthdate', () => {
    const { load, pin } = stub();
    const ids = load.loadPlayerIds();
    delete ids.bySleeper.d1;
    assert.throws(() => runRookieTotal({ load: { ...load, loadPlayerIds: () => ids }, pin }), /no birthdate/);
  });
  test('a 6-row stub returns the documented keys', () => {
    const { load, pin } = stub();
    const r = runRookieTotal({ load, pin });
    assert.deepEqual(Object.keys(r), ['meta', 'bias', 'loso', 'decision', 'candidateMultipliers']);
    assert.deepEqual(Object.keys(r.bias), ['all', 'byGroup', 'byGroupNonQB', 'byGroupPosition', 'byExperience', 'qb', 'target2025']);
    assert.deepEqual(Object.keys(r.loso), ['byGroupAll', 'decision']);
    assert.equal(r.meta.rows, 6);
    assert.equal(r.meta.basis, 'half_ppr');
    assert.equal(r.bias.qb.n, 1);
    assert.deepEqual(Object.keys(r.loso.decision), ROOKIE_TOTAL.decisionGroups);
    assert.equal(r.loso.decision.day3.rows, 3);
    assert.ok(['recommend', 'close'].includes(r.decision.verdict));
    assert.equal(r.candidateMultipliers.note, 'not pinned anywhere');
    assert.ok(!JSON.stringify(r).includes('"sleeperId"'), 'no per-row data in the result');
  });
});

describe('CLI', () => {
  test('--rookie-total --from 2013 exits 1', () => {
    const res = spawnSync(process.execPath, ['bin/backtest.mjs', '--rookie-total', '--from', '2013'], { cwd: REPO_ROOT, encoding: 'utf8' });
    assert.equal(res.status, 1);
    assert.match(res.stderr, /--rookie-total rejects --from/);
  });
});
