# Task: projection grading harness — `bin/grade.mjs`

Build the measurement layer: a Node CLI that joins a captured projection
snapshot (`snapshots/<date>.json`) to the actual following-season outcome
(`nfl/season-totals/<targetYear>.json`) and emits accuracy diagnostics — MAE
and bias per position / per confidence bucket / per factor — plus a
confidence-calibration verdict (is `high` actually more accurate than `medium`
than `low`?).

This is the **plan only**. Implementation happens in the sonnet session.
**Do not edit source while planning.**

---

## Sequencing reality (state this up front, it governs scope)

Every snapshot captured so far (`2026-05-19`, `2026-06-06`) projects the **2026**
NFL season, which has **not completed**. There is therefore **no real gradeable
data until ~early 2027**, when `nfl/season-totals/2026.json` exists.

Building now is justified by two things, and the plan is shaped around them:

1. **Lock the capture schema** so every future snapshot is gradeable — this is
   why the Cross-repo impact section matters more than the code.
2. **Ship a fixture-tested scorer** that runs correctly the instant the 2026
   season-totals land. The scorer is validated today against synthetic fixtures
   with hand-computed expected metrics, not against live outcomes.

A consequence: running `bin/grade.mjs 2026-06-06` today will find
`nfl/season-totals/2026.json` missing and must exit cleanly with a "no outcome
file yet" message — not crash. This is the expected state until 2027.

---

## Pre-flight findings (verified against the repo + sibling app)

| Item | Finding | Consequence for the plan |
|---|---|---|
| **No `targetSeason` in snapshot** | Snapshot top-level keys are `schemaVersion, capturedAt, scoringBasis, leagueId, teamDepthCharts, players`. The projection is `computeNextSeasonProjection` output which targets `currentSeason + 1`, but neither `currentSeason` nor a target year is recorded anywhere in the file. | Harness must **derive** the target season from `capturedAt` via a documented heuristic, with a `--target-season` override. The robust fix is an explicit field — **Cross-repo impact #1**. |
| **No `position` on player records** | A snapshot player is `{ nfl_team, status, depthChartOrder, ktc, projection }` — no position. | Derive position from `teamDepthCharts` (each team has `QB/RB/WR/TE` arrays of `{playerId,…}`). Verified: **757/757** players in `2026-06-06` resolve this way. No schema change required; note an optional explicit `position` field as a nice-to-have only. |
| **Snapshots are `scoringBasis: "custom"`** | Both captured snapshots are `custom`, not `half_ppr`. | `projectedPPG` is in custom-league points; season-totals are half_ppr. Absolute PPG metrics conflate basis difference with projection error. See **Scoring-basis matching** below — this drives the biggest design decision. |
| **`fantasyPoints` is canonical half_ppr** | README contract: season-totals store the canonical half-PPR total in `fantasyPoints`. Confirmed `fantasyPoints === pts_half_ppr` in `2024.json`. | `actualPPG_halfppr = fantasyPoints / gamesPlayed`. This is the outcome the harness grades against. |
| **Per-record `scoringBasis` is unreliable** | `2024.json` records carry `scoringBasis: "half_ppr"`; `2025.json` records have **no** `scoringBasis` field at all. | **Do not** read a per-record `scoringBasis` from season-totals. Treat `fantasyPoints` as half_ppr by README contract, full stop. |
| **Outcome-join coverage** | Of 757 players in `2026-06-06`, 598 appear in `2025.json` (proxy; real grade uses `2026.json`). ~159 absent. | ~20% of projected players won't be in the outcome file (cut, retired, never played, rookies who didn't make it). Edge-case handling is load-bearing, not optional. |
| **bin/ pattern** | `bin/update.mjs` (dispatcher → `scripts/update-*.mjs`), `bin/enrich.mjs` (separate concern), `bin/import-snapshot.mjs` (standalone). Logic in `scripts/`, pure helpers in `lib/`, IO via `lib/io.mjs`, manifest via `lib/manifest.mjs`. | Mirror this: **`bin/grade.mjs`** (CLI, standalone like `enrich.mjs`) → **`scripts/grade-snapshot.mjs`** (snapshot adapter + orchestration) → **`lib/grade.mjs`** (pure, source-agnostic scorer). |
| **Test conventions** | `test/import-snapshot.test.mjs` uses `node:test` + `node:assert/strict`; run via `npm test` (`node --test`). `npm run smoke` runs dry-run integration checks. | Add `node:test` units for `lib/grade.mjs`, **and** a `--self-test` mode wired into `npm run smoke` (the brief asks for smoke wiring specifically). |
| **`repoPath` handles spaces** | The repo lives under `…/Claude Projects/…` (spaces). `lib/io.mjs` `repoPath()`/`readJson()` handle this. | Always go through `lib/io.mjs`. Never hand-build absolute paths. |
| **Node** | `engines.node >= 20`; native fetch, top-level await OK. | No new npm deps. Pure stdlib. |

---

## Decision: standalone `bin/grade.mjs` (not a subcommand of `update.mjs`)

`update.mjs` is about *fetching/refreshing* data from external sources. Grading
is a **read-only measurement** task that writes (at most) a derived report — a
different concern, exactly like `enrich.mjs` is kept separate. Keeping it
standalone avoids overloading the update dispatcher and matches the existing
`bin/enrich.mjs` / `bin/import-snapshot.mjs` precedent.

(Alternative considered: `node bin/update.mjs grade <date>`. Rejected — grading
is not an "update".)

---

## Architecture: three layers, source-decoupled scorer

The brief's central requirement is that the scorer be **decoupled from the
projection SOURCE** — it serves real captured snapshots now and a possible future
retro-backtest runner later, without a rewrite. Achieve this by defining a
generic *projections + outcomes* interface that `lib/grade.mjs` consumes, and
isolating all snapshot/season-totals knowledge in the adapter layer.

```
bin/grade.mjs              ← arg parsing, help, exit codes, stdout/JSON, --write, --self-test
  └─ scripts/grade-snapshot.mjs
        ├─ buildGradeInputFromSnapshot(snapshot, outcomes, opts) → GradeInput   ← the ADAPTER (snapshot-specific)
        ├─ loadOutcomes(targetSeason) → Map<playerId, OutcomeRecord>            ← reads nfl/season-totals/<year>.json
        ├─ deriveTargetSeason(capturedAt) → number                             ← heuristic (see below)
        └─ writeReport(report, snapshotDate) + manifest registration           ← optional --write
  └─ lib/grade.mjs         ← PURE, source-agnostic. Knows nothing about snapshots or season-totals.
        ├─ scoreProjections(GradeInput) → GradeReport       ← the scorer
        ├─ mae(values), bias(values), pearson(xs, ys)       ← stat primitives
        └─ NUMERIC_FACTOR_KEYS                               ← which factors are correlatable
```

A future retro-backtest runner (explicitly **out of scope**, see below) would
add its own adapter that produces the same `GradeInput` from historically
recomputed projections, then call the identical `scoreProjections`.

---

## Data shapes (the generic interface)

```js
/** Input to the pure scorer. Produced by an adapter; SOURCE-agnostic. */
GradeInput = {
  meta: {
    targetSeason:  number,        // e.g. 2026 — the season being graded
    snapshotDate:  string|null,   // 'YYYY-MM-DD' when graded from a snapshot; null for synthetic
    capturedAt:    string|null,   // ISO; provenance only
    scoringBasis:  string,        // snapshot's basis ('custom'|'half_ppr'|…)
    outcomeBasis:  'half_ppr',    // season-totals are always canonical half_ppr
    basisMatch:    boolean,       // scoringBasis === outcomeBasis
    source:        string,        // 'snapshot' | 'retro-backtest' | 'self-test'
  },
  projections: ProjectionRecord[],
  outcomes:    Map<string, OutcomeRecord>,   // keyed by playerId
}

ProjectionRecord = {
  playerId:          string,
  position:          'QB'|'RB'|'WR'|'TE'|'UNK',
  projectedPPG:      number,
  projectedGames:    number|null,
  projectedTotalPts: number|null,
  confidence:        'high'|'medium'|'low'|'rookie',
  factors:           object|null,   // verbatim projection.factors (may be null)
}

OutcomeRecord = {
  actualGames:    number,    // gamesPlayed (played weeks only)
  actualTotalPts: number,    // fantasyPoints (canonical half_ppr)
  actualPPG:      number,    // fantasyPoints / gamesPlayed; NaN-guarded (0 games → null)
  played:         boolean,   // gamesPlayed > 0
}
```

```js
/** Output of the scorer. Serialisable; this is also the persisted report body. */
GradeReport = {
  meta: { …GradeInput.meta, gradedAt: ISO, harnessVersion: 1 },
  counts: {
    projected:   number,   // total projection records
    graded:      number,   // joined to an outcome AND played (used in PPG metrics)
    dnp:         number,   // joined but gamesPlayed === 0
    absent:      number,   // no outcome record at all
  },
  overall:    MetricBlock,                       // all graded players
  byPosition: { QB:MetricBlock, RB:…, WR:…, TE:…, UNK:… },
  byConfidence: { high:MetricBlock, medium:…, low:…, rookie:… },
  calibration: {
    order:        ['high','medium','low'],       // rookie excluded — different population
    maeByBucket:  { high:number, medium:number, low:number },
    monotonic:    boolean,                        // mae(high) <= mae(medium) <= mae(low)
    note:         string,                         // caveat text
  },
  games: {                                        // projectedGames vs actualGames — BASIS-INDEPENDENT
    mae: number, bias: number, n: number,
  },
  factorDiagnostics: FactorDiag[],               // residual-vs-factor correlations
  caveats: string[],                              // human-readable warnings (basis mismatch, low n, etc.)
}

MetricBlock = {
  n:        number,
  maePPG:   number,   // mean |projectedPPG - actualPPG|
  biasPPG:  number,   // mean (projectedPPG - actualPPG)  (+ = over-projection)
  maeTotal: number,   // mean |projectedTotalPts - actualTotalPts|  (combined rate×availability)
  biasTotal:number,
}

FactorDiag = {
  factor:  string,    // e.g. 'durabilityFactor'
  n:       number,    // players with a finite value for this factor AND a graded outcome
  r:       number|null, // Pearson r between factor value and PPG residual (actual - projected)
  note:    string,    // e.g. 'low-n: interpret with caution' when n < FACTOR_MIN_N
}
```

---

## Target-season join (the heuristic + the real fix)

The projection forecasts `currentSeason + 1`. The snapshot does not record
`currentSeason`. v1 derivation:

```js
// scripts/grade-snapshot.mjs
export function deriveTargetSeason(capturedAtISO) {
  const d = new Date(capturedAtISO);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;          // 1–12
  // Offseason capture (Jan–Aug): latest completed season is y-1, target is y.
  // In-season capture (Sep–Dec): season y is underway, target is y+1.
  return m >= 9 ? y + 1 : y;
}
```

For all current snapshots (May/June 2026) this yields **2026** — matches the
brief. State plainly in the report `meta` that this is a **derived** value and
print it so the user can sanity-check; allow `--target-season YYYY` to override.

**This heuristic is fragile** (a mid-September capture is ambiguous; a re-projection
during a season breaks it). The correct fix is an explicit `targetSeason` written
by the app — **Cross-repo impact #1**. When that field exists, prefer it over the
heuristic (`snapshot.targetSeason ?? deriveTargetSeason(capturedAt)`).

---

## Scoring-basis matching (the biggest decision)

`projectedPPG` is in the snapshot's `scoringBasis`; `actualPPG` derived from
season-totals is **half_ppr**. Current snapshots are all `custom`. Three options
were considered:

- **Recompute** actual PPG in the snapshot's basis — **infeasible at v1**.
  Requires (a) per-week *raw* stats (season-totals store only season-summed
  `stats` + half_ppr `weeklyPoints`, never per-week raw stats), and (b) the
  league's raw `scoringSettings` weights (the snapshot records only the derived
  *label* `"custom"`, not the weights). Neither is available in this repo.
  The app invariant "fantasy points computed weekly, never sum season totals"
  makes a naive recompute wrong anyway.
- **Restrict** to `half_ppr` snapshots only — clean but yields **zero** gradeable
  data today (both snapshots are `custom`).
- **Normalize / grade-anyway with a caveat** — grade in half_ppr space and flag
  the mismatch. Absolute PPG MAE/bias conflate basis difference with projection
  error; **relative ordering** across confidence buckets is largely preserved
  (the basis bias is roughly common-mode), and **`projectedGames` error is fully
  basis-independent**.

**Decision (v1):**

- Always compute `meta.basisMatch`. Grade in half_ppr space regardless.
- When `basisMatch === false`: add a loud caveat, and in the human report mark
  the absolute PPG MAE/bias as **indicative only**, steering attention to
  (a) confidence-bucket *ordering* and (b) the basis-independent **games** block.
- `--strict-basis` flag: hard-skip non-half_ppr snapshots (exit 0 with a message)
  for users who want apples-to-apples only.

Document this limitation in README. The durable unlock is to capture raw
`scoringSettings` in the snapshot (**Cross-repo impact #2**, deferred) so a
future recompute path can grade `custom` snapshots in-basis.

---

## Edge cases (explicit handling)

| Case | Detection | Handling |
|---|---|---|
| Player absent from outcome file | no `outcomes.get(id)` | `counts.absent++`; excluded from all metrics. |
| Played 0 games (cut/IR/retired) | outcome exists, `gamesPlayed === 0` | `counts.dnp++`; `actualPPG` is null → excluded from PPG metrics. Still contributes to `games` block (actualGames = 0 vs projectedGames). |
| `projectedGames` null | missing on projection | excluded from `games` block only; PPG metrics unaffected. |
| Rookies (`confidence: 'rookie'`) | bucket label | graded normally; reported in their own confidence bucket; **excluded from the high/medium/low calibration monotonicity check** (different population, different pipeline). |
| Changed teams | n/a | no special handling — PPG is team-agnostic; note in README, not in code. |
| Position unresolved from depth charts | not in any `teamDepthCharts` array | position `'UNK'`; included in confidence buckets + overall, bucketed separately in `byPosition`. (Verified 0 occurrences today, but guard anyway.) |
| `factors` null | projection without factors | player still graded for PPG/games; skipped in `factorDiagnostics`. |
| Outcome file missing | `loadOutcomes` returns null | exit 0 with `nfl/season-totals/<year>.json not found — outcome not available yet (expected before the season completes).` **This is the normal state until 2027.** |

---

## Per-factor attribution (be honest about what's feasible)

At v1 data volume — **one** snapshot, ~600 gradeable players — only the crudest
attribution is meaningful:

- **Feasible:** Pearson correlation between each *numeric scalar* factor value and
  the per-player PPG **residual** (`actualPPG - projectedPPG`). A non-zero `r`
  suggests the factor still carries signal the projection didn't fully absorb (or
  over-absorbed). Report `r` and `n` per factor; flag `n < FACTOR_MIN_N` (=30) as
  low-confidence.
- **`NUMERIC_FACTOR_KEYS`** (curated allow-list of scalar, non-null-heavy factors;
  exclude labels, booleans, nested objects, and the capture-only `ktcHist*` /
  `adot*` / `positionMultiplicity*` families which by app invariant don't move
  `projectedPPG`): e.g. `basePPG, ageDelta, shareTrend, regressionFactor,
  consistencyScore, durabilityFactor, teamFactor, depthFactor, momentumFactor,
  absenceShapeFactor, qbQualityFactor, combinedNewFactor, tdRelianceFactor,
  trajectoryFactor, efficiencyFactor, rzUsageFactor, compPPG, compBlendWeight,
  pipelinePPG`. (The sonnet session should confirm each against a real snapshot's
  `factors` and drop any that are predominantly null.)
- **NOT feasible at v1, state plainly:** multivariate / isolated factor
  attribution (factors are collinear — `combinedNewFactor` is a product of several
  others); causal claims; anything per-position-per-factor (n too small). These
  need many snapshots across multiple target seasons. The harness computes the
  correlations but the report must label them *diagnostic, not attributive*.

When `basisMatch === false`, factor correlations are still directionally usable
(residual sign is dominated by basis offset, but rank correlation survives) —
note this caveat rather than suppressing them.

---

## Output: stdout default, `--write` persists `grading/<date>.json`

- **Default:** human-readable summary to stdout (positions table, confidence
  table with the calibration verdict, games block, top factor correlations,
  caveats).
- **`--json`:** emit the `GradeReport` as JSON to stdout (no file write).
- **`--write`:** persist the `GradeReport` to **`grading/<snapshotDate>.json`**
  and register it in `manifest.json` via `updateManifestEntry`. This keeps it
  auditable through git history per repo conventions (a dated, derived artifact;
  re-running overwrites the same dated file, and git tracks corrections — same
  model as KTC/snapshot outputs). Register with `schemaVersion: 1`,
  `recordCount = counts.graded`, `inProgress: false` (only written post-season,
  when the target season is complete).
- **`--dry-run`:** compute + print, never write (suppresses `--write`).

`grading/` is a **new derived-output folder** — not primary data, but registered
in the manifest like every other script-written file. Add a `.gitkeep`.

---

## CLI surface

```
node bin/grade.mjs <snapshotDate> [options]

ARGUMENTS
  <snapshotDate>           UTC date of the snapshot to grade, e.g. 2026-06-06
                           (reads snapshots/<snapshotDate>.json)

OPTIONS
  --target-season YYYY     Override the derived target season
  --write                  Persist grading/<snapshotDate>.json + update manifest
  --json                   Print the GradeReport as JSON to stdout (no write)
  --strict-basis           Skip if snapshot scoringBasis !== half_ppr
  --dry-run                Compute + print, never write
  --self-test              Run the fixture self-check and exit (used by npm run smoke)
  -h, --help

EXAMPLES
  node bin/grade.mjs 2026-06-06                       # human report to stdout
  node bin/grade.mjs 2026-06-06 --json                # machine report
  node bin/grade.mjs 2026-06-06 --write               # persist grading/2026-06-06.json
  node bin/grade.mjs 2026-06-06 --target-season 2026  # override season join
  node bin/grade.mjs --self-test                      # fixture check (smoke)
```

npm scripts to add: `"grade": "node bin/grade.mjs"`, and extend `smoke` with
` && node bin/grade.mjs --self-test`.

Exit codes: `0` success / nothing-to-grade (missing outcome file, strict-basis
skip); `1` on real error (missing snapshot, unparseable, bad date).

---

## Function signatures

```js
// ── lib/grade.mjs (PURE, source-agnostic) ──────────────────────────────────
export function scoreProjections(gradeInput) { /* → GradeReport (sans meta.gradedAt/source decoration) */ }
export function mae(values)                   { /* mean abs; [] → null */ }
export function bias(values)                  { /* mean signed; [] → null */ }
export function pearson(xs, ys)               { /* → r in [-1,1] or null if n<2 or zero variance */ }
export const NUMERIC_FACTOR_KEYS;             // string[]
export const FACTOR_MIN_N = 30;

// ── scripts/grade-snapshot.mjs (snapshot adapter + orchestration) ───────────
export function deriveTargetSeason(capturedAtISO)        { /* → number */ }
export function buildPositionMap(snapshot)               { /* → Map<playerId, 'QB'|'RB'|'WR'|'TE'> from teamDepthCharts */ }
export function buildGradeInputFromSnapshot(snapshot, outcomes, { targetSeason, snapshotDate, source }) { /* → GradeInput */ }
export function loadOutcomes(targetSeason)               { /* readJson('nfl/season-totals/<y>.json') → Map<id, OutcomeRecord> | null */ }
export function gradeSnapshot({ snapshotDate, targetSeason, write, json, strictBasis, dryRun }) { /* orchestrates; returns GradeReport | null */ }
export function runSelfTest()                            { /* loads test/fixtures/*, asserts known metrics, throws on mismatch */ }
export function formatHumanReport(report)                { /* → string for stdout */ }

// ── bin/grade.mjs ───────────────────────────────────────────────────────────
// arg parsing (mirror update.mjs flag()/option()); dispatch to gradeSnapshot/runSelfTest; help; try/catch → exit 1
```

`buildGradeInputFromSnapshot` is the only place that knows the snapshot shape;
`scoreProjections` only sees `GradeInput`. This is the decoupling seam.

---

## Step sequence (implementation order for sonnet)

1. `lib/grade.mjs` — stat primitives (`mae`, `bias`, `pearson`) + unit tests first.
2. `lib/grade.mjs` — `scoreProjections(GradeInput)`: bucket by position &
   confidence, compute MetricBlocks, calibration verdict, games block, factor
   diagnostics, counts, caveats. Pure; no IO.
3. `scripts/grade-snapshot.mjs` — `deriveTargetSeason`, `buildPositionMap`,
   `loadOutcomes`, `buildGradeInputFromSnapshot`.
4. `scripts/grade-snapshot.mjs` — `gradeSnapshot` orchestration (load snapshot,
   resolve target season, load outcomes → graceful exit if missing, build input,
   score, optional write + manifest, format/print).
5. `scripts/grade-snapshot.mjs` — `formatHumanReport`, `runSelfTest`.
6. `bin/grade.mjs` — CLI wiring, help, exit codes.
7. `package.json` — add `grade` script; extend `smoke` with `--self-test`.
8. `grading/.gitkeep`.
9. Tests (below). Run `npm test` and `npm run smoke`.
10. Docs updates (below). Confirm `npm run smoke` green; manifest untouched
    unless a `--write` was exercised (don't commit a stray report).

---

## Docs updates

Apply these mechanically in the same change.

### README.md

1. **Folder structure block** (the ``` tree around lines 24–48): add, after the
   `snapshots/` entry and before `raw/`:
   ```
     grading/
       <YYYY-MM-DD>.json       — Projection grading reports (one per graded snapshot)
   ```

2. **New schema section** — add after the `snapshots/<date>.json` section
   (before `raw/<name>.json`), a `### grading/<date>.json` section documenting:
   the `GradeReport` shape; that it is a **derived** artifact (recomputable from
   primary data, unlike `snapshots/`/`nfl/`); the half_ppr grading basis and the
   `basisMatch` caveat; that `targetSeason` is derived from `capturedAt` unless
   the snapshot carries an explicit field; and that reports are only meaningful
   after the target season completes.

3. **Update scripts section** — this section documents `bin/update.mjs`. Add a
   parallel **`## Grading harness`** section (peer of "Update scripts" /
   "Enrichment overlay") covering the CLI surface, the half_ppr-basis limitation,
   the target-season heuristic, and the "no outcome until ~2027" reality.

### CLAUDE.md

1. **Commands** — add a subsection after "Enrichment CLI":
   ```
   ### Grading harness — `bin/grade.mjs`

   node bin/grade.mjs <YYYY-MM-DD>                 # grade a snapshot → stdout
   node bin/grade.mjs <YYYY-MM-DD> --write         # also persist grading/<date>.json
   node bin/grade.mjs <YYYY-MM-DD> --json          # machine-readable report
   node bin/grade.mjs --self-test                  # fixture check (runs in npm run smoke)
   # Flags: --target-season YYYY, --strict-basis, --dry-run
   ```
   Update the `npm run smoke` line note to mention it now also runs
   `grade --self-test`.

2. **Navigation map** — add rows:
   | `bin/grade.mjs` | Grading CLI → grade a snapshot against season-totals |
   | `scripts/grade-snapshot.mjs` | Snapshot→outcome adapter + grading orchestration |
   | `lib/grade.mjs` | Pure source-agnostic scorer (MAE/bias/calibration/factor corr) |
   | `grading/` | Derived projection grading reports, one per graded snapshot |

3. **Invariants** — add one:
   > **8. Grading reads, never recomputes.** The harness grades already-captured
   > projections against captured outcomes. It must never re-run the projection
   > pipeline (that lives in the app and risks leakage). `grading/<date>.json` is
   > a *derived* artifact — regenerable from primary data — but is registered in
   > the manifest like any script-written file.

4. **Cross-repo contracts table** — add a row (see Cross-repo impact):
   | **Snapshot target season** | Harness derives `targetSeason` from `capturedAt` (heuristic) | App should write an explicit `targetSeason` (and ideally raw `scoringSettings`) into the snapshot so grading is unambiguous and basis-recompute becomes possible |

5. **Self-maintenance / Done-definition** — no structural change; the existing
   "run `npm run smoke`" already covers the new self-test.

(If, on implementation, any of the above is already partially present, reconcile
rather than duplicate.)

---

## Tests to add

Two layers, matching repo conventions.

### A. `node:test` units — `test/grade.test.mjs` (run by `npm test`)

Pure-function coverage of `lib/grade.mjs`:

- `mae`: `[2,-3]` (abs) → `2.5`; `[]` → `null`.
- `bias`: `[2,-3]` → `-0.5`; `[]` → `null`.
- `pearson`: perfectly correlated `xs=[1,2,3], ys=[2,4,6]` → `1`; anti `→ -1`;
  zero-variance `ys=[5,5,5]` → `null`; `n<2` → `null`.
- `scoreProjections` on the fixture `GradeInput` (below): assert every expected
  metric value exactly.

Also exercise the snapshot adapter purely:
- `deriveTargetSeason('2026-06-06T…')` → `2026`; `'2026-09-15T…'` → `2027`;
  `'2026-01-02T…')` → `2026`.
- `buildPositionMap` on a tiny inline snapshot → correct `Map`.

### B. `--self-test` fixture pair (wired into `npm run smoke`)

Fixtures under `test/fixtures/`:

- `grade-snapshot.json` — tiny half_ppr snapshot, 5 players across QB/RB/WR,
  with `teamDepthCharts` so positions resolve.
- `grade-outcomes-<year>.json` — matching season-totals (`fantasyPoints`,
  `gamesPlayed`) for 4 of the 5 (one deliberately absent).

`runSelfTest()` loads the pair, runs the full pipeline (basisMatch = true),
and asserts the hand-computed `GradeReport`. Designed values:

| player | pos | conf | projPPG | projGames | fantasyPoints | gamesPlayed | actualPPG | PPG err (proj−act) | games err |
|---|---|---|---|---|---|---|---|---|---|
| p1 | QB | high   | 20 | 16 | 288 | 16 | 18.0 | +2.0 | 0 |
| p2 | RB | high   | 15 | 14 | 180 | 15 | 12.0 | +3.0 | −1 |
| p3 | RB | low    | 10 | 12 |  99 | 11 |  9.0 | +1.0 | +1 |
| p4 | WR | medium | 12 | 13 |   0 |  0 |  —   | (dnp) | (proj 13 vs 0) |
| p5 | WR | rookie |  8 | 10 |  —  |  —  |  —   | (absent) | — |

Expected (PPG metrics over graded = p1,p2,p3; dnp = p4; absent = p5):

- `counts`: `{ projected:5, graded:3, dnp:1, absent:1 }`.
- `byPosition.QB`: `maePPG 2.0, biasPPG +2.0, n 1`.
- `byPosition.RB`: errors `[+3,+1]` → `maePPG 2.0, biasPPG +2.0, n 2`.
- `byConfidence.high`: errors `[+2,+3]` → `maePPG 2.5, biasPPG +2.5, n 2`.
- `byConfidence.low`: `maePPG 1.0, biasPPG +1.0, n 1`.
- `calibration.maeByBucket`: `{ high:2.5, low:1.0 }` (medium has n 0 → excluded
  or null); `monotonic: false` (high 2.5 > low 1.0). This intentionally exercises
  the **non-monotonic** path so the verdict logic is tested honestly.
- `games`: include p1,p2,p3,p4 (p4 actualGames 0, projGames 13 → err −13… choose
  p4 projGames so the games MAE is a clean number, e.g. set p4 projGames 13,
  actual 0). Recompute the table's games column in-implementation and assert the
  exact MAE/bias; the sonnet session should pin the final numbers once p4's
  games value is fixed. **Spec p4 projGames = 0** to keep games errors over
  {0,−1,+1,0} → `games.mae = 0.5, bias = 0, n 4` (cleanest). Adjust the table's
  p4 row to `projGames 0` accordingly.

Edge cases the fixtures assert: absent player excluded from all metrics (p5);
dnp player excluded from PPG but present in counts + games (p4); rookie present
as its own bucket and excluded from calibration; a `null`-variance factor → `r:
null` in `factorDiagnostics`.

A second fixture assertion: feed the same snapshot with `meta.scoringBasis =
'custom'` and confirm `basisMatch === false` and the basis caveat appears, while
the `games` block is byte-identical (basis-independence regression).

`runSelfTest` throws on any mismatch → non-zero exit → fails `npm run smoke`.

---

## Cross-repo impact

The app (`sleeper-dashboard`) writes snapshots via
`src/utils/projectionSnapshot.js`. The harness needs these to make grading
unambiguous. **None are v1 blockers** (the harness derives/works around all of
them today), but each removes a documented limitation.

1. **Explicit `targetSeason` (recommended).** Add a top-level `targetSeason`
   number to the snapshot, set to the season the projection forecasts
   (`currentSeason + 1` — `currentSeason` is already a `computeNextSeasonProjection`
   input in the app). The harness will prefer it over the `capturedAt` heuristic.
   *Where:* `buildProjectionSnapshot` in `src/utils/projectionSnapshot.js`
   (it already receives `currentSeason` upstream via the playerRows pipeline).
   This is a snapshot-shape change → bump snapshot `schemaVersion` to `2` and
   mirror in the app's snapshot tests + the data-repo `register-snapshots`
   minimal-shape check.

2. **Raw `scoringSettings` (deferred unlock, optional).** To grade non-`half_ppr`
   snapshots **in their own basis**, the snapshot must carry the league's raw
   `scoringSettings` weights (it currently records only the derived label). This,
   combined with a future per-week-raw-stats source, would enable in-basis
   recompute. Without it, `custom`/`ppr`/etc. snapshots are gradeable only in
   half_ppr with the basis-mismatch caveat. Note for the app; not required now.

3. **Optional `position` per player (nice-to-have).** Not required — the harness
   derives position from `teamDepthCharts` (verified 757/757). Mention only as a
   robustness improvement if depth-chart coverage ever regresses.

**Out of scope (DEFER) — retro-backtest runner.** A runner that recomputes
historical projections with a time cutoff to produce gradeable data *now* is
explicitly out of scope: it belongs in the app (shared age-curve / cohort / comp
computations risk look-ahead leakage). The scorer's `GradeInput` interface is
deliberately source-agnostic so such a runner could feed `scoreProjections`
later without a rewrite — that is the only accommodation made for it here.
