import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RATE_KEYS, NON_ADDITIVE_KEYS, seasonEmitsFirstDownBonus, withFirstDownBonus, scoreSeasonStats,
} from '../lib/fantasyPoints.mjs';

test('alias — NON_ADDITIVE_KEYS is the same Set as RATE_KEYS', () => {
  assert.equal(NON_ADDITIVE_KEYS, RATE_KEYS);
});

test('seasonEmitsFirstDownBonus — detects any bonus_fd_ key; 2019-style rows do not emit', () => {
  assert.equal(seasonEmitsFirstDownBonus({ a: { stats: { rec_fd: 3 } } }), false);
  assert.equal(seasonEmitsFirstDownBonus({ a: { stats: { rec_fd: 3 } }, b: { stats: { bonus_fd_te: 1 } } }), true);
  assert.equal(seasonEmitsFirstDownBonus(null), false);
});

test('withFirstDownBonus — 2019-style WR derives bonus_fd_wr = pass_fd + rec_fd + rush_fd; K gets nothing', () => {
  const wr = { pass_fd: 1, rec_fd: 4, rush_fd: 2 };
  const out = withFirstDownBonus(wr, 'wr');
  assert.equal(out.bonus_fd_wr, 7);
  assert.equal('bonus_fd_wr' in wr, false, 'never mutates');
  const k = { fgm_40_49: 1 };
  assert.equal(withFirstDownBonus(k, 'K'), k);
  assert.equal(withFirstDownBonus(k, null), k);
});

test('withFirstDownBonus — a 2023-style row keeps its served bonus_fd_*', () => {
  const stats = { rec_fd: 4, bonus_fd_wr: 9 };
  assert.equal(withFirstDownBonus(stats, 'WR'), stats);
});

test('scoreSeasonStats — hand-computed: derived first downs, rate keys ignored, never mutates', () => {
  const ss = { rec: 0.5, rec_yd: 0.1, bonus_fd_wr: 0.25, rec_lng: 100, pass_rtg: 100 };
  const stats = { rec: 10, rec_yd: 100, rec_fd: 6, rec_lng: 50, pass_rtg: 90 };
  // 5 + 10 + 6*0.25 = 16.5 (rec_lng / pass_rtg are NON_ADDITIVE and unscored)
  assert.equal(scoreSeasonStats(stats, ss, { position: 'WR', deriveFirstDowns: true }), 16.5);
  assert.equal(scoreSeasonStats(stats, ss, { position: 'WR', deriveFirstDowns: false }), 15);
  assert.equal(scoreSeasonStats({ ...stats, bonus_fd_wr: 2 }, ss, { position: 'WR', deriveFirstDowns: true }), 15.5);
  assert.equal('bonus_fd_wr' in stats, false);
  assert.equal(scoreSeasonStats(null, ss), 0);
  assert.equal(scoreSeasonStats(stats, null), 0);
});
