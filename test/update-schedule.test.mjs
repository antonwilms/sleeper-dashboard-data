/**
 * test/update-schedule.test.mjs — Unit tests for gamesHash content-hash helper.
 *
 * Run with: node --test  (or npm test)
 */

import { test } from 'node:test';
import assert   from 'node:assert/strict';

import { gamesHash } from '../scripts/update-schedule.mjs';

const GAME_A = { gameId: '2023_01_DET_KC', season: 2023, week: 1, gameType: 'REG',
                 homeTeam: 'KC', awayTeam: 'DET', homeScore: 20, awayScore: 21,
                 result: -1, spreadLine: 4.5, totalLine: 53.0, roof: 'outdoors',
                 surface: 'grass', temp: 70, wind: 8 };
const GAME_B = { gameId: '2023_02_BUF_NYJ', season: 2023, week: 2, gameType: 'REG',
                 homeTeam: 'NYJ', awayTeam: 'BUF', homeScore: 24, awayScore: 17,
                 result: 7, spreadLine: -3.5, totalLine: 44.0, roof: 'outdoors',
                 surface: 'grass', temp: 75, wind: 5 };

test('gamesHash: arrays differing only in row order hash identically', () => {
  const hash1 = gamesHash([GAME_A, GAME_B]);
  const hash2 = gamesHash([GAME_B, GAME_A]);
  assert.equal(hash1, hash2);
});

test('gamesHash: arrays differing in one field value hash differently', () => {
  const gameAmodified = { ...GAME_A, homeScore: 99 };
  const hash1 = gamesHash([GAME_A, GAME_B]);
  const hash2 = gamesHash([gameAmodified, GAME_B]);
  assert.notEqual(hash1, hash2);
});
