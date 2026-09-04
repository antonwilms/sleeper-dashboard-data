# Task: season-totals finiteness sweep (publish-time firewall)

Add a publish-time finiteness check to `lib/validate.mjs`'s season-totals
validator that **rejects any season-totals aggregate containing a non-finite
numeric** (`NaN`, `Infinity`, `-Infinity`) in any field of any player record. It
fires on `node bin/update.mjs nfl --dry-run`, on write, and via
`smoke-test.yml`'s NFL dry-run step — failing CI at the source instead of
shipping corruption into the append-only backtest corpus.

This is the **plan only**. Implementation happens in the sonnet session. **Do not
edit source while planning.**

> **Source-side complement — do not consolidate away the app guard.** This sweep
> is the *publish-time* complement to the app's non-finite firewall
> (`seasonProjection.js` §1b / `dynastyScore.js`). The app firewall remains
> load-bearing for the **live in-progress path**, which reads `inProgress: true`
> season-totals straight from Sleeper and **bypasses this repo entirely**. The
> two guards protect different paths (live in-app degradation vs. permanent
> published-file corruption); they are **not** duplicate defense. A future
> stateless session must not remove either as redundant.

---

## Why this is additive and needs no schema bump

Purely an additional validation pass over the existing in-memory aggregate. It
changes **no** served shape, **no** manifest field, **no** `schemaVersion`
(respects CLAUDE.md invariant 4, schemaVersion-discipline). The motive is CLAUDE.md
invariant 1 (append-only completed seasons — corruption is permanent once
published), so the rationale points there rather than adding a new invariant.

### Critical correctness note (read before implementing)

`JSON.stringify(NaN)`, `JSON.stringify(Infinity)`, `JSON.stringify(-Infinity)`
all serialize to **`null`** — JSON has no non-finite literal. So by the time a
corrupt value is *in the published file* it is indistinguishable from a legitimate
`null`; a re-read-the-file linter could not detect it. The only place a non-finite
value still exists **as a number** is the **in-memory aggregate** produced by
`aggregateWeeks` (e.g. a stray `undefined` in the generic sum-all-keys path in
`lib/sleeper.mjs` → `sum + undefined` → `NaN`; or a weekly `pts_half_ppr` gap →
`NaN` `fantasyPoints`). That in-memory object is exactly what
`validateNflSeason(totals, { year })` receives — called in `scripts/update-nfl.mjs`
**step 3, before the write in step 6, and before the dry-run exit (steps 4–5)**.
So the sweep must live **inside `validateNflSeason`** (pre-write), not as a
file-reading check. This is the whole reason the firewall belongs here.

---

## Verified record shape (read live from `nfl/season-totals/2024.json`)

The brief's hunch that the published record lacks `fantasyPoints` is **incorrect
for this repo** — verified. A player record is:

| Field | Type | Swept? |
|---|---|---|
| `gamesPlayed`, `gamesStarted`, `byeWeeks`, `dnpWeeks`, `fantasyPoints` | number | **yes** |
| `stats` | object — **47+ numeric values**, variable key set (sum-all-keys path) | **yes (all values)** |
| `weeklyPoints` | object — per-played-week numeric values | **yes (all values)** |
| `availability.longestAbsence`, `.firstWeek`, `.lastWeek` | number | **yes** |
| `availability.absenceSegments[]` | array of `{ start, end, length }` — all numeric | **yes (nested)** |
| `weeklyStatus` | array[18] of `'P'/'D'/'B'/'X'` strings | no (non-numeric) |
| `scoringBasis` | string | no |
| `availability.absenceCause` | string | no |
| `availability.returnedFromAbsence` | boolean | no |

### Resolved swept-field list + chosen mechanism

The mechanism is a **recursive numeric walk** that asserts every value with
`typeof === 'number'` passes `Number.isFinite`, descending through objects and
arrays. This covers the resolved field list above **and** any future numeric
field automatically — important because `stats` is the variable, sum-all-keys
object whose key set must not require validator maintenance (matches the existing
"never enumerate stats keys" posture). Non-number values (strings, booleans,
`null`, and all object keys) are skipped by type, so `weeklyStatus`,
`scoringBasis`, `absenceCause`, `returnedFromAbsence` are correctly ignored
without special-casing.

(An explicit hard-coded field list was rejected: it would need editing whenever a
`stats` key appears/disappears, defeating the additive intent.)

---

## Implementation

### 1. New exported helper in `lib/validate.mjs`

Place above `validateNflSeason` (or in a small `// ─── finiteness ───` section).
Exported so the self-test can exercise it directly without building a full
400-player valid object.

```js
/**
 * Recursively finds the first non-finite numeric in a value tree.
 * Only typeof === 'number' values are checked; strings/booleans/null and object
 * keys are ignored. Returns { path, value } for the first number that fails
 * Number.isFinite, or null if all numerics are finite.
 *
 * @param {*} value
 * @param {string} path  dotted/bracketed path accumulator for error messages
 * @returns {{ path: string, value: number } | null}
 */
export function findNonFinite(value, path = '') {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? null : { path: path || '(root)', value };
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findNonFinite(value[i], `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) {
      const hit = findNonFinite(value[k], path ? `${path}.${k}` : k);
      if (hit) return hit;
    }
    return null;
  }
  return null;
}
```

### 2. Wire into `validateNflSeason`

Insert as the **first statement inside the existing per-player loop**
(`for (const [playerId, p] of Object.entries(totals))`, currently at
`lib/validate.mjs:77`) — *before* the `weeklyStatus` structural checks, so a
non-finite scalar (e.g. `gamesPlayed = NaN`) is reported with the precise
finiteness message rather than tripping the structural `gamesPlayed !== count('P')`
check first with a confusing message.

```js
  for (const [playerId, p] of Object.entries(totals)) {
    const nf = findNonFinite(p);
    if (nf) {
      throw new Error(
        `[validate] NFL ${year}: player ${playerId} has non-finite numeric at ` +
        `${nf.path} (=${String(nf.value)}). Aggregation produced a corrupt value — ` +
        `refusing to publish.`
      );
    }

    // …existing weeklyStatus / availability / count checks unchanged…
```

No other call site changes — `validateNflSeason` is already invoked on both the
dry-run and write paths and (via the `nfl --year 2023 --dry-run` step) in CI.

### Failure-message format

`[validate] NFL <year>: player <playerId> has non-finite numeric at <path> (=<value>). Aggregation produced a corrupt value — refusing to publish.`

- `<path>` examples: `fantasyPoints`, `stats.pass_ypa`, `weeklyPoints.7`,
  `gamesPlayed`, `availability.absenceSegments[1].length`.
- `<value>` via `String()` → `NaN` / `Infinity` / `-Infinity` (readable; note
  `NaN !== NaN`, so the message uses `String()`, and tests assert on `path` +
  `Number.isNaN`/`=== Infinity`, not value equality).
- Matches the existing `[validate] NFL <year>: …` throw style exactly.

### Step sequence

1. Add `findNonFinite` (exported) to `lib/validate.mjs`.
2. Insert the per-player sweep at the top of the `validateNflSeason` loop.
3. Add `test/validate-finiteness.test.mjs` (node --test) — see Tests.
4. Add an `npm test` step to `smoke-test.yml` so the deterministic fixtures gate
   PRs — see Tests.
5. Apply Docs updates.
6. Done-definition: `npm run smoke` green; `npm test` green; manifest untouched
   (no data file written — planning/validation only).

---

## Docs updates

### README.md
1. **`### nfl/season-totals/<year>.json` section** — append one sentence to the
   opening paragraph (after the "…derived availability aggregates." sentence,
   before the JSON block):
   > Publish-time validation additionally rejects any record containing a
   > non-finite numeric (`NaN`/`Infinity`/`-Infinity`) in any field, so every
   > completed-season file is guaranteed wholly finite.
2. **`### GitHub Actions` table** — update the `smoke-test.yml` row's
   "What it does" cell to add `; runs npm test (unit validators) too`
   (reflecting the new CI step). Before: `Runs npm run smoke (all three dry-runs)`
   → After: `Runs the nfl/cfbd/ktc dry-runs and npm test (unit validators)`.
   (This row already drifts from the actual workflow, which runs per-subcommand
   steps rather than `npm run smoke`; align it to reality while editing.)

### CLAUDE.md
1. **Navigation map** — `lib/validate.mjs` row: change
   `Schema validators; contains NFL_SENTINELS and KTC_TOP_QB_SENTINELS` →
   `Schema validators (incl. season-totals finiteness sweep, findNonFinite); contains NFL_SENTINELS and KTC_TOP_QB_SENTINELS`.
2. **Navigation map** — `.github/workflows/smoke-test.yml` row: change
   `Smoke test CI` → `Smoke test CI (dry-runs + npm test unit validators)`.

No Commands/Invariants/Cross-repo edits in CLAUDE.md: no new subcommand, flag, or
schema; rationale points to existing invariant 1 (append-only) and invariant 4
(no schema bump). The `npm run smoke` package script and its CLAUDE.md description
are **unchanged** (the CI gate is added to `smoke-test.yml`, not to the script).

---

## Tests to add

Repo style is `node --test` files in `test/` (e.g. `test/grade.test.mjs`,
`test/import-snapshot.test.mjs`), run via `npm test`. Add one file; no Vitest.

### File: `test/validate-finiteness.test.mjs`

Imports: `import { test } from 'node:test'`, `import assert from 'node:assert/strict'`,
`import { findNonFinite, validateNflSeason } from '../lib/validate.mjs'`.

**A. `findNonFinite` units (synthetic inputs, no full object needed):**
- clean tree `{ a:1, b:{c:2.5}, d:[3,4] }` → `null`.
- `NaN` in nested object `{ stats:{ pass_yd: NaN } }` → `hit.path === 'stats.pass_yd'`, `Number.isNaN(hit.value)`.
- `Infinity` at top level `{ fantasyPoints: Infinity }` → `path === 'fantasyPoints'`, `hit.value === Infinity`.
- `-Infinity` inside an array element `{ availability:{ absenceSegments:[{ start:1, end:1, length:-Infinity }] } }` → `path === 'availability.absenceSegments[0].length'`.
- ignores non-numerics: `{ weeklyStatus:['P','X'], scoringBasis:'half_ppr', availability:{ returnedFromAbsence:false, absenceCause:'unknown' } }` → `null`.

**B. End-to-end through `validateNflSeason` (proves the wiring):**
Use a tiny in-test factory so the structural checks pass; grade against a year
with **no** sentinels (e.g. `9999`) so the sentinel branch is skipped.

```js
function validRecord(gp = 16) {
  const weeklyStatus = Array.from({ length: 18 }, (_, i) => (i < gp ? 'P' : 'X'));
  const weeklyPoints = {}; for (let w = 1; w <= gp; w++) weeklyPoints[w] = 10;
  return {
    stats: { pass_yd: 100 }, gamesPlayed: gp, gamesStarted: gp, byeWeeks: 0,
    dnpWeeks: 0, weeklyPoints, weeklyStatus, fantasyPoints: 100,
    scoringBasis: 'half_ppr',
    availability: { longestAbsence: 0, absenceSegments: [], firstWeek: 1,
                    lastWeek: gp, returnedFromAbsence: false, absenceCause: 'unknown' },
  };
}
function makeTotals(n = 400) { const t = {}; for (let i = 0; i < n; i++) t[String(i)] = validRecord(16); return t; }
```
Cases:
- **clean control:** `assert.doesNotThrow(() => validateNflSeason(makeTotals(400), { year: 9999 }))`.
- **corrupt stats:** `const t = makeTotals(); t['0'].stats.pass_yd = Infinity;`
  `assert.throws(() => validateNflSeason(t, { year: 9999 }), /non-finite numeric at stats\.pass_yd/)`.
- **corrupt fantasyPoints (NaN):** `t['5'].fantasyPoints = NaN;` → throws `/non-finite numeric at fantasyPoints/`.
- **corrupt nested segment:** `t['7'].availability.absenceSegments = [{ start: 1, end: 1, length: NaN }];`
  → throws `/absenceSegments\[0\]\.length/`.

Expected: control passes; each corrupt case throws with the offending path in the
message. (The 400-record valid factory satisfies the existing `playerCount ≥ 400`
and `≥ 30 with gp ≥ 14` gates; gp=16 → `count('P')` checks all balance.)

### CI wiring: add a step to `.github/workflows/smoke-test.yml`

After the `Install dependencies` step, add:
```yaml
      - name: Unit tests
        run: npm test
```
Rationale: the existing `nfl --year 2023 --dry-run` step already *exercises* the
sweep on live data (so the sweep "fires via smoke-test.yml" today, satisfying the
goal), but only the deterministic corrupt/clean fixtures prove the pass **and**
fail behavior — and the repo currently runs **none** of its `test/*.mjs` files in
CI. This one additive step closes that gap and makes the fixtures gate PRs.
Note: it will also start running the other (pure, network-free) `test/` files for
the first time — confirm `npm test` is green before adding the step (expected).

---

## Cross-repo impact

**None.** The sweep is additive source-side validation: no change to the served
season-totals shape, manifest fields, `schemaVersion`, or any row in the
Cross-repo contracts table — so the app mirrors nothing. The one cross-repo *fact*
to preserve is stated at the top of this file: the app's non-finite firewall
(`seasonProjection.js` §1b / `dynastyScore.js`) is **not** made redundant by this
sweep and must remain — it guards the live in-progress path that bypasses this
repo. No app-side action required.
