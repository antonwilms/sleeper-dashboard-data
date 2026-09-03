/**
 * test/stable-hash.test.mjs — verification for stable-hash.md.
 *
 * Eleven digest-equality assertions against test/fixtures/hash-baseline.json (§4 step 2).
 * Seven of them still hold the original pre-refactor claim: each digest was captured by
 * calling the real pre-refactor function against a real served file, before any body was
 * rewritten as a stableHash wrapper, so matching proves the refactor is bit-identical to what
 * it replaced. Four (roster, games, oline, cfbd) were re-pointed at a recaptured digest in a
 * later slice — roster/games/oline because their original file was a weekly-rewritten
 * current-season asset (season-ingest-teamcontext.md §1.3/§2.2); cfbd because
 * college-pivot-phase-b.md rewrote its pinned file (college/receiving/2023.json) from a
 * long-form row array to the pivoted envelope, so the pre-refactor baseline no longer parses
 * as the same shape at all — no immutable pre-refactor baseline survives for any of the four,
 * so their digests were recaptured from the CURRENT implementation instead and their tests are
 * named accordingly: they are change detectors now, not pre-refactor proofs. A twelfth entry
 * (idsHash) was dropped entirely — nflverse/playerids.json is a weekly-refreshed crosswalk
 * with no immutable version at all, and a digest that must be regenerated on a schedule
 * asserts nothing (§2.2).
 *
 * Plus regression guards for §2.1's identity default and the two order-sensitive shapes
 * (cfbd, playerstate) the audit's "sort everything" framing would have silently broken.
 *
 * Run with: node --test  (or npm test)
 */

import { test } from 'node:test';
import assert   from 'node:assert/strict';
import fs       from 'node:fs';

import { stableHash, sortObjectKeys, readJson } from '../lib/io.mjs';
import { cfbdHash }         from '../scripts/update-cfbd.mjs';
import { nflHash }          from '../scripts/update-nfl.mjs';
import { playersHash as advstatsPlayersHash }    from '../scripts/update-advstats.mjs';
import { playersHash as gamelogsPlayersHash }    from '../scripts/update-gamelogs.mjs';
import { playersHash as rosterPlayersHash }      from '../scripts/update-roster.mjs';
import { teamsHash as olineTeamsHash }           from '../scripts/update-oline.mjs';
import { teamsHash as teamcontextTeamsHash }     from '../scripts/update-teamcontext.mjs';
import { playersHash as playerstatePlayersHash } from '../scripts/update-playerstate.mjs';
import { picksByYearHash }   from '../scripts/update-draft.mjs';
import { gamesHash }         from '../scripts/update-schedule.mjs';
import { snapshotHash }      from '../scripts/update-ktc.mjs';

const baseline = JSON.parse(fs.readFileSync(new URL('./fixtures/hash-baseline.json', import.meta.url), 'utf8'));

// ═══════════════════════════════════════════════════════════════════
// §4 step 6 — eleven digest equalities against the fixture (eight pre-refactor baselines,
// three current-behaviour re-captures — see the module doc above)
// ═══════════════════════════════════════════════════════════════════

test('cfbdHash matches the pinned current-behaviour digest', () => {
  const { file, digest } = baseline.cfbdHash;
  assert.equal(cfbdHash(readJson(file)), digest);
});

test('nflHash matches the pre-refactor baseline digest', () => {
  const { file, digest } = baseline.nflHash;
  assert.equal(nflHash(readJson(file)), digest);
});

test('advstats playersHash matches the pre-refactor baseline digest', () => {
  const { file, digest } = baseline.advstatsPlayersHash;
  assert.equal(advstatsPlayersHash(readJson(file).players), digest);
});

test('gamelogs playersHash matches the pre-refactor baseline digest', () => {
  const { file, digest } = baseline.gamelogsPlayersHash;
  assert.equal(gamelogsPlayersHash(readJson(file).players), digest);
});

test('roster playersHash matches the pinned current-behaviour digest', () => {
  const { file, digest } = baseline.rosterPlayersHash;
  assert.equal(rosterPlayersHash(readJson(file).players), digest);
});

test('oline teamsHash matches the pinned current-behaviour digest', () => {
  const { file, digest } = baseline.olineTeamsHash;
  assert.equal(olineTeamsHash(readJson(file).teams), digest);
});

test('teamcontext teamsHash matches the pre-refactor baseline digest', () => {
  const { file, digest } = baseline.teamcontextTeamsHash;
  assert.equal(teamcontextTeamsHash(readJson(file).teams), digest);
});

test('playerstate playersHash matches the pre-refactor baseline digest', () => {
  const { file, digest } = baseline.playerstatePlayersHash;
  assert.equal(playerstatePlayersHash(readJson(file).players), digest);
});

test('picksByYearHash matches the pre-refactor baseline digest', () => {
  const { file, digest } = baseline.picksByYearHash;
  assert.equal(picksByYearHash(readJson(file).picksByYear), digest);
});

test('gamesHash matches the pinned current-behaviour digest', () => {
  const { file, digest } = baseline.gamesHash;
  assert.equal(gamesHash(readJson(file).games), digest);
});

test('snapshotHash matches the pre-refactor baseline digest', () => {
  const { file, digest } = baseline.snapshotHash;
  assert.equal(snapshotHash(readJson(file)), digest);
});

// ═══════════════════════════════════════════════════════════════════
// §5.2/§5.3 — stableHash's identity default, and sortObjectKeys canonicalising
// ═══════════════════════════════════════════════════════════════════

test('stableHash: identity default does NOT canonicalise key order', () => {
  assert.notEqual(stableHash({ b: 1, a: 2 }), stableHash({ a: 2, b: 1 }));
});

test('sortObjectKeys: same two objects hash equal through it', () => {
  const normalize = sortObjectKeys;
  assert.equal(stableHash({ b: 1, a: 2 }, normalize), stableHash({ a: 2, b: 1 }, normalize));
});

// ═══════════════════════════════════════════════════════════════════
// §5.4 — cfbdHash stays order-sensitive; playerstate's playersHash still does not key-sort
// ═══════════════════════════════════════════════════════════════════

test('cfbdHash: two arrays with the same rows in different orders hash differently', () => {
  const a = [{ id: 1 }, { id: 2 }];
  const b = [{ id: 2 }, { id: 1 }];
  assert.notEqual(cfbdHash(a), cfbdHash(b));
});

test('playerstate playersHash: does not key-sort (order-sensitive on the object)', () => {
  // Non-numeric-string keys, so JS object enumeration follows insertion order rather than
  // the engine's mandatory ascending-index order for integer-like keys.
  const a = { bob: { x: 1 }, alice: { x: 2 } };
  const b = { alice: { x: 2 }, bob: { x: 1 } };
  assert.notEqual(playerstatePlayersHash(a), playerstatePlayersHash(b));
});
