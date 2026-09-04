# Task: Direct unit tests for `aggregateWeeks` + `computeAvailability`

**Type:** test-only. No source changes to `lib/sleeper.mjs` (or anywhere else). See *Source-change / seam* below — none is required.

**Deliverable:** a new `test/sleeper.test.mjs` (`node --test`, table-driven) that pins the *intended* semantics of the two most correctness-critical functions in the repo with hand-derived, non-tautological assertions.

---

## 1. Why this test exists (context)

`lib/sleeper.mjs` `aggregateWeeks` ([lib/sleeper.mjs:117](../../lib/sleeper.mjs)) and `computeAvailability` ([lib/sleeper.mjs:213](../../lib/sleeper.mjs)) produce `nfl/season-totals/<year>.json` — simultaneously the **primary served data** and the **grading-outcomes basis**. Today they have **no direct test**. The only test that touches this area, `test/validate-finiteness.test.mjs`, feeds *the validator* synthetic records and **never calls the aggregator**. A regression in either function silently corrupts the repo's most important data while CI stays green.

This task closes that gap: a deterministic, offline, table-driven suite asserting hand-derived expected outputs for every documented edge.

---

## 2. Callability & exact call signatures (confirmed — no seam needed)

Both functions are already `export function` and are **callable in isolation with constructed inputs**. This was verified during planning by importing `lib/sleeper.mjs` into a throwaway script and running every fixture below — all outputs matched the hand-derived expectations exactly. Importing the module has **no side effects** (no top-level execution, no network); both functions are **pure and deterministic** (no `fetch`, `Date`, randomness, or file I/O). `aggregateWeeks` emits a `console.warn` only on the dedup path — harmless under `node --test` (goes to stderr, does not fail the run).

> **Source-change / seam: NOT required.** Default expectation (no source change) holds. Do not modify `lib/sleeper.mjs`.

### `aggregateWeeks(weekData)`

`weekData` is exactly the output of `fetchSeasonWeeks(year)` — `scripts/update-nfl.mjs:46-49` passes it straight through with no transform:

```js
weekData = [
  { week: <number 1..18>, entries: [ { player_id, team, stats }, ... ] },
  ...
]
// entry.stats is the raw Sleeper per-week stats object: { gp, gs, pts_half_ppr, rec, rec_yd, ... }
// entry.team is the top-level team string (or null).
```

Notes for fixture-building:
- `weekData` need **not** contain all 18 weeks, and weeks need not be contiguous — `aggregateWeeks` iterates whatever is present (`for (const { week, entries } of weekData)`) and `weeklyStatus` is always length-18 (`Array(18).fill('X')`). Fixtures use only the weeks each case needs; unlisted weeks stay `'X'`. (Production always passes 18 entries, some with `entries: []`.)
- `week` is **1-indexed**; the slot written is `weeklyStatus[week - 1]`. Use real week numbers (1..18).
- Returns `{ [player_id]: record }` (see §4 for the record shape).

### `computeAvailability(weeklyStatus)`

```js
computeAvailability(weeklyStatus)   // weeklyStatus: length-18 Array<'P'|'D'|'B'|'X'>
// → { longestAbsence, absenceSegments, firstWeek, lastWeek, returnedFromAbsence, absenceCause }
```

`aggregateWeeks` calls this internally per player, so Suite 2 exercises it end-to-end; Suite 1 tests it directly with hand-built status arrays for clean isolation of the availability edges.

**Out of scope:** `fetchCurrentNflSeason` and `fetchSeasonWeeks` (network I/O; would need fetch-mocking — not part of this task).

---

## 3. Test file, conventions, wiring into `npm test`

- **Path:** `test/sleeper.test.mjs` — matches the existing `test/*.test.mjs` naming, so `npm test` (`node --test`) auto-discovers it. **No** `package.json` or workflow change needed; CI (`smoke-test.yml`) already runs `npm test`.
- **Imports** (match `test/validate-finiteness.test.mjs`):
  ```js
  import { test } from 'node:test';
  import assert from 'node:assert/strict';
  import { aggregateWeeks, computeAvailability } from '../lib/sleeper.mjs';
  ```
- **Helper** (recommended, used for Suite-1 inputs and Suite-2 expected `weeklyStatus`): a length-18 builder where unlisted weeks default to `'X'`:
  ```js
  // weeks are 1-indexed; e.g. ws({ 1: 'P', 6: 'D' })
  const ws = (o = {}) => Array.from({ length: 18 }, (_, i) => o[i + 1] ?? 'X');
  ```
- **Section banners**: keep the `// ════` banner style already used in the test dir.

### Assertion strategy

- **Suite 1 (`computeAvailability`)** — `assert.deepStrictEqual(computeAvailability(input), expected)` for every case. All fields are integers / strings / booleans / `null` / plain-object arrays, so exact deep-equality is safe.
- **Suite 2 (`aggregateWeeks`)** — `assert.deepStrictEqual(totals[id], expectedRecord)` against the **full** per-player record for every case **except AW10**. All fixtures use integer raw stats and exactly-representable point values, so every summed field is exact.
- **AW10 (rounding) is the one exception** — its raw point sum is a noisy float, so assert field-by-field there (see AW10). Do **not** try to deep-equal a literal `20.299999999999997`.
- The dedup `console.warn` (AW7) need **not** be asserted — the collapsed output proves the dedup. (Optional: spy on `console.warn`; not required.)

---

## 4. Output record shape + behavioral contract being pinned

Per-player record from `aggregateWeeks` (README §`nfl/season-totals/<year>.json`):

```js
{
  stats: { /* SUM of every key present in each played week's stats */ },
  gamesPlayed, gamesStarted, byeWeeks, dnpWeeks,
  weeklyPoints: { [week]: pts_half_ppr },   // played weeks only
  weeklyStatus: Array(18) of 'P'|'D'|'B'|'X',
  fantasyPoints,                            // round(sum(weeklyPoints) * 100) / 100
  scoringBasis: 'half_ppr',
  availability: { longestAbsence, absenceSegments, firstWeek, lastWeek, returnedFromAbsence, absenceCause },
}
```

Behaviors the suite locks (each maps to ≥1 case in §7):

1. **gp split.** `stats.gp === 1` → played: `gamesPlayed++`, `weeklyPoints[week] = pts_half_ppr ?? 0`, `weeklyStatus = 'P'`, and **all** stat keys summed. `gp !== 1` (0/missing) → not played: no stats summed, no `weeklyPoints` entry; classified bye or DNP.
2. **`gamesStarted`** increments only when `stats.gs === 1`. A played week with `gs === 0` (or `gs` absent) does **not** increment it. (Confirmed against real data: a kicker with no `gs` key has `gamesStarted: 0`.)
3. **`stats` is sum-of-all-present-keys** — this includes `gp`, `gs`, `pts_half_ppr` (and in real data `pts_ppr`, `pos_rank_*`, etc.). Fixtures deliberately use a **minimal** stat set so sums are hand-checkable; the indiscriminate sum-all behavior (incl. non-additive keys in real data) is the documented/contracted behavior — **not** something to "fix" here.
4. **Bye vs DNP** hinges on `gp === 1` presence, not mere presence. Per week, `teamsPlaying = { teams that have ≥1 entry with stats.gp === 1 && truthy team }`. For a non-playing entry (`gp !== 1`): `team && !teamsPlaying.has(team)` → **bye** (`'B'`); otherwise → **DNP** (`'D'`). Consequences pinned: (a) a team whose only entries are `gp:0` → bye for all; (b) one `gp:1` teammate flips the others to DNP; (c) `team` falsy (`null`) → DNP (the `team &&` guard).
5. **Duplicate-player collapse** is per-week, **first-seen wins**; later duplicates are dropped entirely (no double-count of `gamesPlayed`, no stat inflation, `weeklyPoints`/`weeklyStatus` taken from the first entry). `teamsPlaying` is computed from the **deduped** list.
6. **Empty week is skipped** (`if (!entries.length) continue`) → that slot stays `'X'` (NOT `'D'`/`'B'`). Covers both a failed mid-season fetch and pre-2021 week 18.
7. **Pre-2021 week-18 `'X'`** is emergent (not special-cased): week-18 `entries: []` → slot 18 stays `'X'` for everyone; `availability.lastWeek ≤ 17`.
8. **`fantasyPoints` = `round(sum(weeklyPoints) * 100) / 100`** (2-dp), and `stats.pts_half_ppr` is the **raw unrounded** sum — the two can diverge (AW10).
9. **`computeAvailability`:** window is `[firstWeek, lastWeek]` (first/last `'P'`, 1-based). Only consecutive `'D'` weeks form `absenceSegments` (`{start, end, length}`); `'B'` and `'X'` **break a run and are excluded** from segments. `longestAbsence = max segment length (0 if none)`. `returnedFromAbsence = absenceSegments.length > 0` (any `'D'` inside the window is necessarily followed by the closing `'P'` at/within `lastWeek`). No `'P'` at all → all-null early return. Leading weeks before `firstWeek` and trailing weeks after `lastWeek` are **not** scanned.
   - *Note for Session 2:* the post-loop `if (runStart !== null)` branch in `computeAvailability` is **unreachable** — the scan always ends on `lastWeek` (a `'P'`), which closes any open run. Do **not** craft a case expecting it to fire.

---

## 5. Source-change / seam

**None.** Both functions are exported and were exercised in isolation during planning. No backward-compatible seam is needed. This task touches only `test/sleeper.test.mjs`.

---

## 6. Suite 1 — `computeAvailability` (direct unit tests)

Build inputs with the `ws()` helper. Each expected output below was **verified against the live function** during planning.

### CA1 — never played (all `'X'`) → all-null early return
```js
input:    Array(18).fill('X')
expected: { longestAbsence: 0, absenceSegments: [], firstWeek: null, lastWeek: null, returnedFromAbsence: false, absenceCause: 'unknown' }
```
Edge: the `firstWeek === null` early return.

### CA2 — full modern season (all `'P'`) → no absence, `lastWeek` 18
```js
input:    Array(18).fill('P')
expected: { longestAbsence: 0, absenceSegments: [], firstWeek: 1, lastWeek: 18, returnedFromAbsence: false, absenceCause: 'unknown' }
```
Edge: no `'D'` → empty segments; `lastWeek` 18.

### CA3 — single bye + pre-2021 wk18 `'X'` (matches the README example)
```js
input:    ws({ 1:'P',2:'P',3:'P',4:'P',5:'P',6:'P',7:'P',8:'P', 9:'B', 10:'P',11:'P',12:'P',13:'P',14:'P',15:'P',16:'P',17:'P' }) // 18 → 'X'
expected: { longestAbsence: 0, absenceSegments: [], firstWeek: 1, lastWeek: 17, returnedFromAbsence: false, absenceCause: 'unknown' }
```
Edge: `'B'` does **not** create a segment and is not "absence"; trailing `'X'` at wk18 is ignored (`lastWeek` 17). Cross-checks the documented README record.

### CA4 — one interior DNP run → `returnedFromAbsence` true, one segment
```js
input:    ws({ 1:'P',2:'P',3:'P',4:'P',5:'P', 6:'D',7:'D', 8:'P',9:'P',10:'P',11:'P',12:'P',13:'P',14:'P',15:'P',16:'P',17:'P',18:'P' })
expected: { longestAbsence: 2, absenceSegments: [{ start: 6, end: 7, length: 2 }], firstWeek: 1, lastWeek: 18, returnedFromAbsence: true, absenceCause: 'unknown' }
```
Edge: `'D'`-run grouping, `length = end - start + 1`, `returnedFromAbsence` true, `longestAbsence`.

### CA5 — two separate DNP runs → multiple segments, `longestAbsence` = max
```js
input:    ws({ 1:'P', 2:'D', 3:'P', 4:'D',5:'D',6:'D', 7:'P',8:'P',9:'P',10:'P',11:'P',12:'P',13:'P',14:'P',15:'P',16:'P',17:'P',18:'P' })
expected: { longestAbsence: 3, absenceSegments: [{ start: 2, end: 2, length: 1 }, { start: 4, end: 6, length: 3 }], firstWeek: 1, lastWeek: 18, returnedFromAbsence: true, absenceCause: 'unknown' }
```
Edge: two segments, single-week segment `length: 1`, `longestAbsence = max(1, 3) = 3`.

### CA6 — `'B'` and `'X'` inside the window break runs and are excluded from segments
```js
input:    ws({ 1:'P', 2:'D', 3:'B', 4:'D', 5:'X', 6:'D', 7:'P',8:'P',9:'P',10:'P',11:'P',12:'P',13:'P',14:'P',15:'P',16:'P',17:'P',18:'P' })
expected: { longestAbsence: 1, absenceSegments: [{ start: 2, end: 2, length: 1 }, { start: 4, end: 4, length: 1 }, { start: 6, end: 6, length: 1 }], firstWeek: 1, lastWeek: 18, returnedFromAbsence: true, absenceCause: 'unknown' }
```
Edge (critical): `'B'`/`'X'` terminate a `'D'` run and are themselves **not** part of any segment — three isolated single-week DNPs.

### CA7 — trailing DNPs after the last `'P'` are outside the window
```js
input:    ws({ 1:'P',2:'P',3:'P',4:'P',5:'P',6:'P',7:'P',8:'P',9:'P',10:'P', 11:'D',12:'D',13:'D',14:'D',15:'D',16:'D',17:'D',18:'D' })
expected: { longestAbsence: 0, absenceSegments: [], firstWeek: 1, lastWeek: 10, returnedFromAbsence: false, absenceCause: 'unknown' }
```
Edge: `lastWeek` bracketing (10) excludes the trailing `'D'` run; a player who never returns has `returnedFromAbsence: false` and no segments. Contrast with CA4.

### CA8 — leading DNPs before the first `'P'` excluded; interior `'D'` counted
```js
input:    ws({ 1:'D', 2:'D', 3:'P', 4:'D', 5:'P',6:'P',7:'P',8:'P',9:'P',10:'P',11:'P',12:'P',13:'P',14:'P',15:'P',16:'P',17:'P',18:'P' })
expected: { longestAbsence: 1, absenceSegments: [{ start: 4, end: 4, length: 1 }], firstWeek: 3, lastWeek: 18, returnedFromAbsence: true, absenceCause: 'unknown' }
```
Edge: `firstWeek` bracketing (3) excludes the leading `'D','D'`; the post-debut `'D'` at wk4 is counted.

### CA11 — long single DNP run
```js
input:    ws({ 1:'P', 2:'D',3:'D',4:'D',5:'D',6:'D',7:'D',8:'D',9:'D', 10:'P',11:'P',12:'P',13:'P',14:'P',15:'P',16:'P',17:'P',18:'P' })
expected: { longestAbsence: 8, absenceSegments: [{ start: 2, end: 9, length: 8 }], firstWeek: 1, lastWeek: 18, returnedFromAbsence: true, absenceCause: 'unknown' }
```
Edge: one long run, `length` 8 (weeks 2–9 inclusive).

---

## 7. Suite 2 — `aggregateWeeks` (end-to-end integration tests)

Each fixture is a literal `weekData` array; each expected record was **verified against the live function** during planning. Assert with `assert.deepStrictEqual(totals[id], expected)` (except AW10).

### AW1 — single played week: full stat summation (incl. `gp`/`gs`/`pts_half_ppr`), `weeklyPoints`, `weeklyStatus`, availability wiring
```js
input: [
  { week: 1, entries: [ { player_id: 'p1', team: 'KC', stats: { gp: 1, gs: 1, pts_half_ppr: 12.5, rec: 5, rec_yd: 80, rush_yd: 10 } } ] },
]
expected['p1'] = {
  stats: { gp: 1, gs: 1, pts_half_ppr: 12.5, rec: 5, rec_yd: 80, rush_yd: 10 },
  gamesPlayed: 1, gamesStarted: 1, byeWeeks: 0, dnpWeeks: 0,
  weeklyPoints: { 1: 12.5 },
  weeklyStatus: ws({ 1: 'P' }),
  fantasyPoints: 12.5,
  scoringBasis: 'half_ppr',
  availability: { longestAbsence: 0, absenceSegments: [], firstWeek: 1, lastWeek: 1, returnedFromAbsence: false, absenceCause: 'unknown' },
}
```
Edges: gp=1 path; **sum-all-keys includes `gp`/`gs`/`pts_half_ppr`** (the surprising/contracted bit); `weeklyPoints`; `weeklyStatus 'P'` + default `'X'`; availability attached.

### AW2 — `gp:1, gs:0` + two-week accumulation: `gamesStarted` counts only `gs===1`
```js
input: [
  { week: 1, entries: [ { player_id: 'p1', team: 'KC', stats: { gp: 1, gs: 0, pts_half_ppr: 6.25, rec: 3, rec_yd: 40 } } ] },
  { week: 2, entries: [ { player_id: 'p1', team: 'KC', stats: { gp: 1, gs: 1, pts_half_ppr: 9.75, rec: 4, rec_yd: 55 } } ] },
]
expected['p1'] = {
  stats: { gp: 2, gs: 1, pts_half_ppr: 16, rec: 7, rec_yd: 95 },   // 6.25 + 9.75 = 16 exactly
  gamesPlayed: 2, gamesStarted: 1, byeWeeks: 0, dnpWeeks: 0,
  weeklyPoints: { 1: 6.25, 2: 9.75 },
  weeklyStatus: ws({ 1: 'P', 2: 'P' }),
  fantasyPoints: 16,
  scoringBasis: 'half_ppr',
  availability: { longestAbsence: 0, absenceSegments: [], firstWeek: 1, lastWeek: 2, returnedFromAbsence: false, absenceCause: 'unknown' },
}
```
Edges: `gs:0` does **not** bump `gamesStarted`; `gp` sums to 2, `gs` sums to 1; multi-week stat accumulation.

### AW3 — bye: whole team absent (no `gp:1` entry) → `'B'`; bye-only player has empty stats, `fantasyPoints` 0, all-null availability
```js
input: [
  { week: 9, entries: [
    { player_id: 'kc1',  team: 'KC',  stats: { gp: 0 } },
    { player_id: 'kc2',  team: 'KC',  stats: { gp: 0 } },
    { player_id: 'buf1', team: 'BUF', stats: { gp: 1, gs: 1, pts_half_ppr: 18.0 } },
  ] },
]
expected['kc1'] = {                       // kc2 is identical
  stats: {}, gamesPlayed: 0, gamesStarted: 0, byeWeeks: 1, dnpWeeks: 0,
  weeklyPoints: {}, weeklyStatus: ws({ 9: 'B' }),
  fantasyPoints: 0, scoringBasis: 'half_ppr',
  availability: { longestAbsence: 0, absenceSegments: [], firstWeek: null, lastWeek: null, returnedFromAbsence: false, absenceCause: 'unknown' },
}
expected['buf1'] = {
  stats: { gp: 1, gs: 1, pts_half_ppr: 18 }, gamesPlayed: 1, gamesStarted: 1, byeWeeks: 0, dnpWeeks: 0,
  weeklyPoints: { 9: 18 }, weeklyStatus: ws({ 9: 'P' }),
  fantasyPoints: 18, scoringBasis: 'half_ppr',
  availability: { longestAbsence: 0, absenceSegments: [], firstWeek: 9, lastWeek: 9, returnedFromAbsence: false, absenceCause: 'unknown' },
}
```
Edges: bye classification (`teamsPlaying` requires `gp===1`; KC has two entries but both `gp:0` → not playing → bye); no stats summed on `gp:0`; empty `weeklyPoints`; `fantasyPoints` 0; bye-only → all-null availability. `buf1` confirms same-week different status.

### AW4 — DNP: one `gp:1` teammate flips the non-player to `'D'` (the bye/DNP disambiguation)
```js
input: [
  { week: 5, entries: [
    { player_id: 'star',  team: 'KC', stats: { gp: 1, gs: 1, pts_half_ppr: 25.0 } },
    { player_id: 'scrub', team: 'KC', stats: { gp: 0 } },
  ] },
]
expected['scrub'] = {
  stats: {}, gamesPlayed: 0, gamesStarted: 0, byeWeeks: 0, dnpWeeks: 1,
  weeklyPoints: {}, weeklyStatus: ws({ 5: 'D' }),
  fantasyPoints: 0, scoringBasis: 'half_ppr',
  availability: { longestAbsence: 0, absenceSegments: [], firstWeek: null, lastWeek: null, returnedFromAbsence: false, absenceCause: 'unknown' },
}
// (optional) expected['star']: played, weeklyStatus ws({5:'P'}), gamesPlayed 1
```
Edges: DNP classification (team in `teamsPlaying` → `'D'`). AW3 vs AW4 = the headline bye-vs-DNP correctness contract: **identical non-player, opposite result based solely on whether a `gp:1` teammate exists**.

### AW5 — non-player with `team: null` → DNP (the `team &&` guard)
```js
input: [
  { week: 3, entries: [ { player_id: 'p1', team: null, stats: { gp: 0 } } ] },
]
expected['p1'] = {
  stats: {}, gamesPlayed: 0, gamesStarted: 0, byeWeeks: 0, dnpWeeks: 1,
  weeklyPoints: {}, weeklyStatus: ws({ 3: 'D' }),
  fantasyPoints: 0, scoringBasis: 'half_ppr',
  availability: { longestAbsence: 0, absenceSegments: [], firstWeek: null, lastWeek: null, returnedFromAbsence: false, absenceCause: 'unknown' },
}
```
Edge: falsy `team` on a non-playing entry classifies as **DNP**, not bye (documented fallback — team can't be attributed). A regression flipping this to bye would be caught.

### AW7 — duplicate-player collapse (per-week, first-seen wins); affects all fields
```js
input: [
  { week: 1, entries: [ { player_id: 'dup', team: 'KC', stats: { gp: 1, gs: 1, pts_half_ppr: 10.0, rec: 5, rec_yd: 60 } } ] },
  { week: 2, entries: [
    { player_id: 'dup', team: 'KC', stats: { gp: 1, gs: 0, pts_half_ppr: 8.0,  rec: 4,  rec_yd: 30  } },  // first-seen — kept
    { player_id: 'dup', team: 'KC', stats: { gp: 1, gs: 1, pts_half_ppr: 99.0, rec: 50, rec_yd: 600 } },  // duplicate — dropped
  ] },
]
expected['dup'] = {
  stats: { gp: 2, gs: 1, pts_half_ppr: 18, rec: 9, rec_yd: 90 },   // 10+8, 5+4, 60+30 — the 99/50/600 entry never counted
  gamesPlayed: 2, gamesStarted: 1, byeWeeks: 0, dnpWeeks: 0,       // gamesPlayed 2, NOT 3
  weeklyPoints: { 1: 10, 2: 8 },                                   // wk2 uses first-seen 8.0, NOT 99.0
  weeklyStatus: ws({ 1: 'P', 2: 'P' }),
  fantasyPoints: 18, scoringBasis: 'half_ppr',
  availability: { longestAbsence: 0, absenceSegments: [], firstWeek: 1, lastWeek: 2, returnedFromAbsence: false, absenceCause: 'unknown' },
}
```
Edges: per-week dedup (the `seen` set resets each week — wk1's single entry is unaffected); `gamesPlayed` not double-counted; no stat inflation from the dropped entry; `weeklyPoints`/`weeklyStatus`/`gamesStarted` all taken from the first-seen entry. (Emits a `console.warn` for W2 — do not assert it.)

### AW8 — pre-2021 week-18 `'X'` (empty wk18 entries → slot 18 stays `'X'`)
```js
input: [
  // weeks 1..17, each a single played entry:
  ...Array.from({ length: 17 }, (_, i) => ({
    week: i + 1,
    entries: [ { player_id: 'p1', team: 'KC', stats: { gp: 1, gs: 1, pts_half_ppr: 10.0 } } ],
  })),
  { week: 18, entries: [] },   // pre-2021: no wk18 regular-season data
]
expected['p1'] = {
  stats: { gp: 17, gs: 17, pts_half_ppr: 170 },
  gamesPlayed: 17, gamesStarted: 17, byeWeeks: 0, dnpWeeks: 0,
  weeklyPoints: { 1:10,2:10,3:10,4:10,5:10,6:10,7:10,8:10,9:10,10:10,11:10,12:10,13:10,14:10,15:10,16:10,17:10 },
  weeklyStatus: ws({ 1:'P',2:'P',3:'P',4:'P',5:'P',6:'P',7:'P',8:'P',9:'P',10:'P',11:'P',12:'P',13:'P',14:'P',15:'P',16:'P',17:'P' }), // 18 → 'X'
  fantasyPoints: 170, scoringBasis: 'half_ppr',
  availability: { longestAbsence: 0, absenceSegments: [], firstWeek: 1, lastWeek: 17, returnedFromAbsence: false, absenceCause: 'unknown' },
}
```
Edge: empty wk18 `entries` is skipped (`continue`) → slot 18 `'X'`; `availability.lastWeek` 17, not 18.

### AW9 — empty mid-season week (failed fetch) → `'X'`, not `'D'`/`'B'`; an `'X'` inside the window is not a segment
```js
input: [
  { week: 1, entries: [ { player_id: 'p1', team: 'KC', stats: { gp: 1, gs: 1, pts_half_ppr: 10.0 } } ] },
  { week: 2, entries: [] },                                                                            // failed fetch
  { week: 3, entries: [ { player_id: 'p1', team: 'KC', stats: { gp: 1, gs: 1, pts_half_ppr: 12.0 } } ] },
]
expected['p1'] = {
  stats: { gp: 2, gs: 2, pts_half_ppr: 22 },
  gamesPlayed: 2, gamesStarted: 2, byeWeeks: 0, dnpWeeks: 0,
  weeklyPoints: { 1: 10, 3: 12 },
  weeklyStatus: ws({ 1: 'P', 3: 'P' }),   // wk2 → 'X' (skipped), NOT 'D'
  fantasyPoints: 22, scoringBasis: 'half_ppr',
  availability: { longestAbsence: 0, absenceSegments: [], firstWeek: 1, lastWeek: 3, returnedFromAbsence: false, absenceCause: 'unknown' },
}
```
Edge: skipped week → `'X'` (a failed fetch must not be misclassified as DNP); reinforces at integration level that an `'X'` inside `[firstWeek, lastWeek]` is not an absence segment.

### AW10 — `fantasyPoints` rounding; raw `stats.pts_half_ppr` diverges from rounded `fantasyPoints`
```js
input: [
  { week: 1, entries: [ { player_id: 'p1', team: 'KC', stats: { gp: 1, gs: 1, pts_half_ppr: 10.1 } } ] },
  { week: 2, entries: [ { player_id: 'p1', team: 'KC', stats: { gp: 1, gs: 1, pts_half_ppr: 10.2 } } ] },
]
// 10.1 + 10.2 = 20.299999999999997 (IEEE-754). round(20.2999...*100)/100 = 20.3
```
**Assert field-by-field** (this is the one case that is NOT a clean deep-equal):
```js
const p = totals['p1'];
assert.strictEqual(p.fantasyPoints, 20.3);                          // rounded to 2-dp — exact
assert.ok(Math.abs(p.stats.pts_half_ppr - 20.3) < 1e-9);            // raw sum = 20.299999999999997 (unrounded)
assert.notStrictEqual(p.stats.pts_half_ppr, p.fantasyPoints);       // the divergence is the point
assert.deepStrictEqual(p.weeklyPoints, { 1: 10.1, 2: 10.2 });
assert.strictEqual(p.gamesPlayed, 2);
assert.deepStrictEqual(p.weeklyStatus, ws({ 1: 'P', 2: 'P' }));
assert.deepStrictEqual(p.availability, { longestAbsence: 0, absenceSegments: [], firstWeek: 1, lastWeek: 2, returnedFromAbsence: false, absenceCause: 'unknown' });
```
Edge: pins `fantasyPoints = round(sum * 100)/100` **and** that `stats.pts_half_ppr` retains the raw (unrounded) accumulation — they legitimately differ.

### AW11 — capstone: one player exercising all four codes + a real absence segment + trailing-DNP exclusion, end-to-end
```js
input: [
  { week: 1,  entries: [ { player_id: 'p1', team: 'KC', stats: { gp: 1, gs: 1, pts_half_ppr: 10.0 } } ] },                                          // P
  { week: 2,  entries: [ { player_id: 'p1', team: 'KC', stats: { gp: 1, gs: 1, pts_half_ppr: 10.0 } } ] },                                          // P
  { week: 3,  entries: [ { player_id: 'p1', team: 'KC', stats: { gp: 0 } }, { player_id: 'mate', team: 'KC', stats: { gp: 1, gs: 1, pts_half_ppr: 5.0 } } ] }, // D (KC playing)
  { week: 4,  entries: [ { player_id: 'p1', team: 'KC', stats: { gp: 0 } }, { player_id: 'mate', team: 'KC', stats: { gp: 1, gs: 1, pts_half_ppr: 5.0 } } ] }, // D
  { week: 5,  entries: [ { player_id: 'p1', team: 'KC', stats: { gp: 1, gs: 1, pts_half_ppr: 10.0 } } ] },                                          // P (returns)
  { week: 6,  entries: [ { player_id: 'p1', team: 'KC', stats: { gp: 0 } } ] },                                                                      // B (no KC gp:1)
  { week: 7,  entries: [ { player_id: 'p1', team: 'KC', stats: { gp: 1, gs: 1, pts_half_ppr: 10.0 } } ] },                                          // P
  { week: 8,  entries: [] },                                                                                                                          // X (skipped)
  { week: 9,  entries: [ { player_id: 'p1', team: 'KC', stats: { gp: 1, gs: 1, pts_half_ppr: 10.0 } } ] },                                          // P (last P)
  { week: 10, entries: [ { player_id: 'p1', team: 'KC', stats: { gp: 0 } }, { player_id: 'mate', team: 'KC', stats: { gp: 1, gs: 1, pts_half_ppr: 5.0 } } ] }, // D — trailing (after lastWeek)
]
expected['p1'] = {
  stats: { gp: 5, gs: 5, pts_half_ppr: 50 },
  gamesPlayed: 5, gamesStarted: 5, byeWeeks: 1, dnpWeeks: 3,
  weeklyPoints: { 1: 10, 2: 10, 5: 10, 7: 10, 9: 10 },
  weeklyStatus: ws({ 1:'P', 2:'P', 3:'D', 4:'D', 5:'P', 6:'B', 7:'P', 9:'P', 10:'D' }),   // wk8 & wk11-18 → 'X'
  fantasyPoints: 50, scoringBasis: 'half_ppr',
  availability: { longestAbsence: 2, absenceSegments: [{ start: 3, end: 4, length: 2 }], firstWeek: 1, lastWeek: 9, returnedFromAbsence: true, absenceCause: 'unknown' },
}
// (recommended) also assert the teammate is independently tracked:
expected['mate'] = {
  stats: { gp: 3, gs: 3, pts_half_ppr: 15 },
  gamesPlayed: 3, gamesStarted: 3, byeWeeks: 0, dnpWeeks: 0,
  weeklyPoints: { 3: 5, 4: 5, 10: 5 },
  weeklyStatus: ws({ 3: 'P', 4: 'P', 10: 'P' }),
  fantasyPoints: 15, scoringBasis: 'half_ppr',
  availability: { longestAbsence: 0, absenceSegments: [], firstWeek: 3, lastWeek: 10, returnedFromAbsence: false, absenceCause: 'unknown' },
}
```
Edges (combined): all four `weeklyStatus` codes in one record; `gamesPlayed`/`gamesStarted`/`byeWeeks`/`dnpWeeks` counts together; bye (wk6, no `gp:1` teammate) vs DNP (wk3/4/10, `mate` playing); empty wk8 → `'X'`; the absence segment `{3,4,2}` with `returnedFromAbsence: true`; and the **trailing wk10 DNP is excluded** from availability because `lastWeek` is 9 (`dnpWeeks` still counts it as 3, but it is not a segment). The strongest single regression guard.

---

## 8. Coverage matrix (required edges → cases)

| Required edge | Cases |
|---|---|
| **gp = 1 / 0 split** | AW1 (gp1), AW3/AW4/AW5 (gp0), AW2 (mixed accumulation) |
| **bye vs DNP** | AW3 (bye, whole team off), AW4 (DNP, teammate played), AW5 (team null → DNP), AW11 (both, same player) |
| **duplicate-player collapse** | AW7 (first-seen wins; all fields; per-week reset) |
| **pre-2021 wk18 `'X'`** | AW8 (empty wk18 → slot 18 `'X'`, `lastWeek` 17); CA3 (availability view) |
| **`weeklyStatus` array** | every AW case; AW11 has all four codes |
| **availability: segments / `returnedFromAbsence` / `longestAbsence`** | CA1–CA8, CA11 (direct); AW11 (end-to-end) |
| *(supporting)* sum-all-keys incl. `gp`/`gs`/`pts_half_ppr` | AW1, AW2, AW8 |
| *(supporting)* `gamesStarted` only on `gs===1` | AW2 |
| *(supporting)* `fantasyPoints` rounding + raw-vs-rounded | AW10; `=0` for no-play in AW3/AW4/AW5 |
| *(supporting)* empty-week skip → `'X'` | AW9 (mid-season), AW8 (wk18), AW11 (wk8) |
| *(supporting)* all-null availability when never played | CA1 (direct), AW3/AW4/AW5 (via aggregate) |

---

## 9. Docs updates

**None required.**
- Neither `README.md` nor `CLAUDE.md` has a per-function "Testing" section or a test-file enumeration to keep in sync. The only references are generic ("npm test (unit validators)") in the CI-workflow tables (`README.md:561`, `CLAUDE.md:144`) — accurate as-is.
- `CLAUDE.md`'s Navigation map lists `lib/`, `scripts/`, `bin/`, and data dirs, **not** individual `test/*.mjs` files — so no new row.
- `package.json` `test` script (`node --test`) auto-discovers `test/sleeper.test.mjs`; no script or `.github/workflows/` change.
- *(Optional, cosmetic only — skip unless desired):* the parenthetical "(unit validators)" could read "(unit validators + aggregation)". Not necessary.

---

## 10. Cross-repo impact

**None — confirmed.** This is test-only. It adds `test/sleeper.test.mjs` and changes no source, no data file, no manifest, no schema, and no served output. None of the Cross-repo contracts (snapshot shape, season-totals schemaVersion, stat-key preservation, manifest fields, `calculateFantasyPoints` port) is touched. The suite *documents* existing behavior (including the contracted stat-key summation the app relies on) but does not alter it, so the sibling `sleeper-dashboard` repo needs no change. No signal-registry flag (no ingested field/source/coverage change).

---

## 11. Done-definition (for Session 2)

1. Create `test/sleeper.test.mjs` per §3 with all Suite-1 (CA*) and Suite-2 (AW*) cases.
2. `npm test` — the new file is discovered and green. (Run `node --test test/sleeper.test.mjs` to iterate on just this file.)
3. `npm run smoke` — still green (unchanged; this task adds no source/data).
4. No source, data, manifest, README, or CLAUDE.md changes (per §5, §9, §10).

> Every expected value in §6–§7 was verified against the live functions during planning, so a correct transcription should pass on first run. If any case fails, the failure is either a transcription error **or** a genuine regression in `lib/sleeper.mjs` — investigate before relaxing the assertion (the assertions encode the intended semantics from the README + the function's own doc comments, not "whatever the code happens to return").
