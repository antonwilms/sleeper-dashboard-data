/**
 * test/advstats-grain.test.mjs — advstats-grain-and-share.md §5.
 *
 * Two correctness fixes in aggregateAdvReceiving (lib/nflverse.mjs):
 *   C1 — filter to season_type === 'REG' before any accumulation (playoff volume must
 *        leave both the player rows AND the team denominators).
 *   C3 — weight the air-yards numerator by Math.abs(airYards), with Σ|aₜ| as its own
 *        denominator, instead of squaring the signed value against a signed denominator.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateAdvReceiving } from '../lib/nflverse.mjs';

const ADV_HEADER =
  'player_id,player_display_name,position,season,week,season_type,team,' +
  'targets,receiving_air_yards,receiving_yards,receptions,' +
  'target_share,air_yards_share,wopr,racr';

function makeCsv(...rows) { return [ADV_HEADER, ...rows].join('\n'); }

// ─── 1. REG filter — components AND shares must exclude POST ────────────────────────

test('aggregateAdvReceiving: REG filter excludes postseason from components and shares, not just row count', () => {
  const csv = makeCsv(
    // REG — same shape as the pre-existing single-team share-math fixture (expected 0.5/0.5)
    '00-0001,WR-A,WR,2023,1,REG,DAL,6,60,90,5,0,0,0,0',
    '00-0001,WR-A,WR,2023,2,REG,DAL,4,40,60,3,0,0,0,0',
    '00-0002,WR-B,WR,2023,1,REG,DAL,4,40,60,3,0,0,0,0',
    '00-0002,WR-B,WR,2023,2,REG,DAL,6,60,90,5,0,0,0,0',
    // POST — wildly different volumes. If not excluded from BOTH the player rows and the
    // team denominators, targetShare/airYardsShare would move off 0.5 and components
    // would inflate well past the REG-only totals (10 targets / 100 air yards / 2 weeks).
    '00-0001,WR-A,WR,2023,19,POST,DAL,50,500,750,40,0,0,0,0',
    '00-0002,WR-B,WR,2023,19,POST,DAL,50,500,750,40,0,0,0,0',
  );
  const { byGsis } = aggregateAdvReceiving(csv);
  const A = byGsis['00-0001'];
  assert.ok(A, 'WR-A should be emitted');
  // Shares — proves the TEAM denominator excluded POST, not just A's own row
  assert.equal(A.targetShare,   0.5);
  assert.equal(A.airYardsShare, 0.5);
  // Components — proves A's own POST row was excluded
  assert.equal(A.components.targets,  10);
  assert.equal(A.components.airYards, 100);
  assert.equal(A.components.recYards, 150);
  assert.equal(A.components.weeks,    2);
});

// ─── 2. Postseason-only player is never emitted ──────────────────────────────────────

test('aggregateAdvReceiving: a player with only postseason rows is not emitted', () => {
  const csv = makeCsv(
    '00-0001,WR-A,WR,2023,1,REG,DAL,6,60,90,5,0,0,0,0',
    '00-0002,WR-B,WR,2023,1,REG,DAL,4,40,60,3,0,0,0,0',
    // Postseason-only player — no REG row exists for this gsis at all.
    '00-POST,Playoff Only,WR,2023,19,POST,DAL,20,200,300,15,0,0,0,0',
  );
  const { byGsis } = aggregateAdvReceiving(csv);
  assert.ok(!byGsis['00-POST'], 'a postseason-only player must not be emitted — it has no regular season');
  assert.ok(byGsis['00-0001'], 'REG players are unaffected');
});

// ─── 3. Missing season_type column throws ────────────────────────────────────────────

test('aggregateAdvReceiving: missing season_type column throws (format-change wording)', () => {
  // Must NOT use makeCsv/ADV_HEADER — this fixture needs the column absent entirely.
  const badHeader = 'player_id,player_display_name,position,season,week,team,' +
    'targets,receiving_air_yards,receiving_yards,receptions';
  const csv = [badHeader, '00-0001,WR-A,WR,2023,1,DAL,6,60,90,5'].join('\n');
  assert.throws(
    () => aggregateAdvReceiving(csv),
    /season_type.*Possible upstream CSV format change/,
  );
});

// ─── 4. Magnitude weighting — near cancellation (NOT +50/-50) ───────────────────────

test('aggregateAdvReceiving: near-cancelling multi-team splits no longer explode airYardsShare', () => {
  // +50/-50 (Σaₜ=0) is already caught by the OLD code's `p.recAirYards !== 0` guard — it
  // would test the null condition and prove nothing about the sign bug. This uses the live
  // failure shape instead (Mark Ingram 2021 / James Robinson 2022, §1.3-1.4): splits that
  // nearly but don't exactly cancel, leaving a small non-zero Σaₜ as the OLD denominator
  // while the OLD numerator still carries the full squared magnitude of both splits.
  //
  // Player D: +50 air yards on ATL (team ATL week1 total: D 50 + filler 200 = 250 air,
  // 5+20=25 targets), -49 air yards on LA (team LA week2 total: D -49 + filler 200 = 151
  // air, 5+20=25 targets). Σaₜ = 50 + (-49) = 1; Σ|aₜ| = 99.
  //
  // OLD (buggy) formula, computed by hand — NOT by calling old code, which no longer
  // exists: airNumer = (50/250)*50 + (-49/151)*(-49) = 10 + 15.90066... ≈ 25.9007
  //   share = airNumer / Σaₜ = 25.9007 / 1 ≈ 25.9 — wildly outside the [-1,1] range a
  //   share can physically take.
  // NEW (fixed) formula: airNumer = (50/250)*50 + (-49/151)*49 = 10 - 15.90066... ≈ -5.9007
  //   share = airNumer / Σ|aₜ| = -5.9007 / 99 ≈ -0.0596 → rounds to -0.06.
  const csv = makeCsv(
    '00-D,Player D,WR,2023,1,REG,ATL,5,50,80,4,0,0,0,0',
    '00-F1,Filler One,WR,2023,1,REG,ATL,20,200,300,16,0,0,0,0',
    '00-D,Player D,WR,2023,2,REG,LA,5,-49,10,4,0,0,0,0',
    '00-F2,Filler Two,WR,2023,2,REG,LA,20,200,300,16,0,0,0,0',
  );
  const { byGsis } = aggregateAdvReceiving(csv);
  const d = byGsis['00-D'];
  assert.ok(d, 'Player D should be emitted');
  assert.equal(d.airYardsShare, -0.06, 'fixed formula: bounded, near the hand-derived -0.0596');
  assert.ok(Math.abs(d.airYardsShare) <= 1, 'a share must never exceed physical [-1,1] bounds');
});

// ─── 5. Single-team invariance ───────────────────────────────────────────────────────

test('aggregateAdvReceiving: single-team non-negative splits are bit-identical to the pre-fix value', () => {
  // For aₜ ≥ 0 on a single team, (a/d)·|a| ÷ |a| algebraically reduces to a/d — the same
  // value the pre-fix (a/d)·a ÷ a formula produced. This pins that the fix is surgical.
  //
  // Player E on KC across two weeks: total airYards = 90+15 = 105. The week-restricted
  // team denominator sums the team's own weekly totals across the weeks E played
  // (100 + 100 = 200) — not a per-week ratio. share = (105/200)*105 / 105 = 105/200 = 0.525.
  const csv = makeCsv(
    '00-E,Player E,WR,2023,1,REG,KC,8,90,120,6,0,0,0,0',
    '00-F,Filler,WR,2023,1,REG,KC,2,10,30,2,0,0,0,0',
    '00-E,Player E,WR,2023,2,REG,KC,3,15,30,2,0,0,0,0',
    '00-F,Filler,WR,2023,2,REG,KC,7,85,120,6,0,0,0,0',
  );
  const { byGsis } = aggregateAdvReceiving(csv);
  const e = byGsis['00-E'];
  assert.ok(e);
  assert.equal(e.airYardsShare, 0.525);
});

// ─── 6. No magnitude floor ────────────────────────────────────────────────────────────

test('aggregateAdvReceiving: no magnitude floor — a legitimate low-volume single-team player still emits a share', () => {
  // §1.5/§1.6/§2.2: the audit's proposed |Σaₜ| < 25 floor was rejected — it would null 27%
  // of every season to fix twelve rows. This pins that no such floor exists: a real,
  // small, single-team air-yards total still produces a non-null share.
  const csv = makeCsv(
    '00-LOW,Low Volume,WR,2023,1,REG,NYJ,1,5,8,1,0,0,0,0',
    '00-BIG,Big Volume,WR,2023,1,REG,NYJ,20,200,300,16,0,0,0,0',
  );
  const { byGsis } = aggregateAdvReceiving(csv);
  const low = byGsis['00-LOW'];
  assert.ok(low);
  assert.notEqual(low.airYardsShare, null, 'a small but real |Σaₜ| must not be nulled by a floor — none exists');
  assert.equal(typeof low.airYardsShare, 'number');
});
