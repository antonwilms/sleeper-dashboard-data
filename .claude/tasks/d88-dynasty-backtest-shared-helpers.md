# D-88 — one shared home for the dynasty backtests' statistics helpers

Review depth: light — refactor of offline backtest scripts (`--dynasty-history`, `--dynasty-rework`); no served file, no manifest entry, no capture path, no validator threshold, no `schemaVersion`; no file listed as a Data site in `../sleeper-dashboard/docs/cross-repo-registry.md` is edited (`lib/dynastyMirror.mjs` and `lib/inSeasonEvidence.mjs` are only imported, as today).

Session 1: opus, 2026-11-02, data HEAD `b3f2d05`. Session 2 runs on **sonnet**, medium effort.
Backlog: app `.claude/tasks/data-repo-backlog.md` D-88. Origin: architecture audit 2026-11-01, `[duplication] (data)`.

## 0. What this is, for Anton

S4a copied about a dozen of S3b's statistics helpers instead of sharing them. S3b's Fix pass 1 then corrected two of them (F7, F9) and the copies missed both. This slice gives the helpers one home under `lib/`. S3b and S4a import from there (S5 will too) and the copies are deleted. The two fixes reach S4a as a result, not as a hand port. S3b's output stays byte for byte the same, a pinned test proves it, and S4a is not rerun.

## 1. Scope and constraints

- **Move** S3b's post-Fix-pass-1 helpers (`scripts/dynasty-history-run.mjs` at `b3f2d05`) into a new pure module, **`lib/dynastyBacktest.mjs`**. Rewire both scripts and `lib/dynastyRework.mjs` to it. Delete every copy.
- **Why a new file, not `lib/dynastyRework.mjs`:** that module is S4a's candidate-score code. Putting S3b's statistics there would make the older stage (S3b) import from the later one (S4a), and S5 would inherit S4a's candidate code as a dependency. The new module sits below both: `lib/dynastyRework.mjs` imports from it, never the reverse.
- **No S4a rerun** (Anton). `grading/2026-10-30-dynasty-rework-verdict.md` and `backtests/2026-10-30-dynasty-rework-panel.json` are not regenerated or edited. No S3b rerun either: its panel and verdict files are untouched.
- **S3b behaviour byte-for-byte unchanged**, proven by §5 T-GOLD-S3.
- **Do not move** (reserved for a later parent-folder cross-repo entry): S3b's B2 baseline (the `row.B2[mode] = …` assignment inside `buildRows`, currently ~:508) and S3b's age rule (`const ageBand`, currently :537). Leave both as module-level code in `scripts/dynasty-history-run.mjs`; do not inline, rename or wrap them. Line numbers will shift because helpers above them are removed. Cite them by symbol.
- **Out of scope, left as is (state in hand-back):**
  - `lib/dynastyRework.mjs` `ageBand` (:43). It copies S3b's age rule, which stays put per the line above. `level2Of` (:48) is likewise the B2 rule.
  - `lib/dynastyRework.mjs` `percentileRank` (:35). It copies a private of `lib/dynastyMirror.mjs` (CR-32's Data file), not S3b. Deduplicating it means editing a cross-repo mirror file, which is a `full` trigger with no behaviour gain.
  - Near-copies that differ in text, so moving them would change messages: `preregHash`, `cellOf`, and the verdict formatters `f3`/`sg`/`ciStr`/`cellTxt`.
  - `identicalScores` and `sameMask`. These are S3b-only, never copied, and stay in S3b, importing `sc`/`val`.
  - The labels (`labelRho` etc.), `pathOf`, `realisedValue`, `metricKey`/`parseMetricKey`. S4a already imports these from S3b rather than copying them, and they stay in S3b.

## 2. Touch list

| File | Change |
|---|---|
| `lib/dynastyBacktest.mjs` | **new** — §3 |
| `scripts/dynasty-history-run.mjs` | delete moved definitions; import them; re-export the public ones (§4.1) |
| `scripts/dynasty-rework-run.mjs` | delete the "copies of S3 privates" block (:140–300) and `KEY_FIELDS`; import + re-export (§4.2) |
| `lib/dynastyRework.mjs` | delete private `round6` (:30) and `meanOf` (:366); import both from the new module; keep `export { round6 }` (:416) as a re-export |
| `test/dynasty-history.test.mjs` | add T-GOLD-S3 (§5.1) |
| `test/dynasty-rework.test.mjs` | add T-GOLD-S4, T-F9-S4, T-F7-S4, T-ONE-HOME (§5.2–§5.5) |
| `README.md` | new Module-notes entry for `lib/dynastyBacktest.mjs`; one sentence each in the S3b and S4a entries saying their helpers live there |
| `CLAUDE.md` | append to the `lib/backtest.mjs` navigation row: "`lib/dynastyBacktest.mjs` the dynasty backtests' shared statistics (S3b/S4a/S5)" (stay under the 25,000-byte ceiling; currently 20,923) |

Nothing else. No `data-catalog.md` change (no family). No registry change.

## 3. `lib/dynastyBacktest.mjs`

Header comment: shared pure helpers of the dynasty backtests (S3b `--dynasty-history`, S4a `--dynasty-rework`, S5). Moved verbatim from `scripts/dynasty-history-run.mjs` at `b3f2d05` (post S3b Fix pass 1). No I/O: `guardedManifestCheck` reads only through the injected `load`.

Imports: `spearman`, `rankTransform` from `./backtest.mjs`; `clusteredBootstrap` from `./inSeasonEvidence.mjs`; `dynastyScoreMirror` from `./dynastyMirror.mjs`. It must not import `./dynastyRework.mjs` or any `scripts/` file.

Contents, each **verbatim from S3b** (bodies byte-identical) unless the row says otherwise. All exported except the three private sort helpers.

| Symbol | S3b source (`b3f2d05`) | Note |
|---|---|---|
| `MIN_ROWS` | :72 | needed by `cohortStats` |
| `byPidSlot`, `orderBy`, `idOf` (private) | :128–130 | |
| `hitRate`, `cohortStats`, `percentileBias` | :133–158 | |
| `round6` | :184 | |
| `isBC` | :198 | |
| `mirrorCall` | :200–205 | |
| `guardedManifestCheck(load, years, { Stop, tag })` | :282–291 | **signature change:** throws `new Stop(\`[${tag}] outcome season ${y} is not a completed season (manifest nfl/season-totals/${y}.json inProgress !== false)\`)`. The message is byte-identical for `tag` `'dynasty-history'` / `'dynasty-rework'` |
| `sc`, `val` | :535–536 | |
| `makeCtx`, `validItems`, `cohortMap` | :540–564 | |
| `combine` | :566–580 | **F9 version** (`n += sa.n` after `c++`, with its comment) |
| `biasItems(ctx, m, k, subject, groupFilter = null)` | :582–595 | **signature from S4a:** `subject` replaces the literal `'H'` in the `validItems` call. Cache key becomes `` `bias|${m}|${k}|${subject}` `` (per-ctx internal; output unchanged) |
| `meanOf`, `ciOf`, `bootstrapSpecs` | :597–641 | |
| `assemble(sp, res, put)` | :774–791 | lifted from S3b's closure; `put` becomes a parameter; adds S4a's `minUsed` rule. Exact body below |

```js
export function assemble(sp, res, put) {
  const { v, c, n } = res.point;
  const enough = n >= sp.minN && c >= sp.minC && v != null;
  const thin = sp.minUsed != null && res.boot != null && res.boot.used < sp.minUsed; // S4a §5.9 tilt rule
  let ci95 = null, used = null, label;
  if (!enough || thin) {
    label = 'insufficient'; // §8.9: any cell below its minimum is insufficient, even when every row is identical
    if (res.boot) { ci95 = res.boot.ci95; used = res.boot.used; }
  } else if (sp.identical) {
    label = 'variant-identical';
  } else if (!res.boot) {
    label = 'insufficient';
  } else {
    ci95 = res.boot.ci95; used = res.boot.used;
    label = sp.label(ci95);
  }
  put(sp.parts, { value: round6(v), ci95: ci95 ? ci95.map(round6) : null, used, n, cohortsUsed: c, label });
}
```

**Equivalence (Session 1 checked; Session 2 does not re-derive, the goldens prove it):**
- S3b: no S3b spec sets `minUsed`, so `thin` is always false and the branches are S3b's own, in order.
- S4a's old copy: `!enough || !res.boot || thin` led to `insufficient`, keeping `ci95`/`used` when `res.boot` was set. In the new body, `!enough || thin` gives the same result (`thin` implies `res.boot`). `!res.boot` gives `insufficient` with `ci95 = used = null`, which is what the old copy kept, because `res.boot` was null. The only branch S4a gains is `variant-identical`, and no S4a spec sets `identical` (`buildSpecs`, `scripts/dynasty-rework-run.mjs:533–585`), so it is unreachable from S4a today.

## 4. Rewiring

### 4.1 `scripts/dynasty-history-run.mjs`
- Delete the definitions listed in §3. Import the ones the file still uses from `../lib/dynastyBacktest.mjs`.
- Re-export the four symbols that are S3b's public API today, so `test/dynasty-history.test.mjs` and S4a's imports keep working: `export { MIN_ROWS, hitRate, cohortStats, percentileBias } from '../lib/dynastyBacktest.mjs';`. Do not newly export anything else.
- `guardedManifestCheck(load, years)` call sites become `guardedManifestCheck(load, years, { Stop: DynastyHistoryStop, tag: 'dynasty-history' })`.
- `biasItems(ctx, m, k, filter)` call sites (the age-band bias spec ~:728 and `psSpec` ~:762) become `biasItems(ctx, m, k, 'H', filter)`.
- In `computeMetrics`, delete the inner `function assemble`. The two `specs.forEach((sp, i) => assemble(sp, out[i]))` become `assemble(sp, out[i], put)`.
- Drop imports that become unused (`spearman`, `rankTransform`, `clusteredBootstrap`, `dynastyScoreMirror` if no longer referenced). Keep every other import.
- `ageBand` and the B2 assignment: untouched (§1).

### 4.2 `scripts/dynasty-rework-run.mjs`
- Delete the whole `// ─── copies of S3 privates …` block (`round6`, `mirrorCall`, `guardedManifestCheck`, `isBC`, `sc`, `val`, `makeCtx`, `validItems`, `cohortMap`, `combine`, `biasItems`, `meanOf`, `ciOf`, `bootstrapSpecs`, `assemble`) and the local `KEY_FIELDS` (:137).
- Import what the file uses from `../lib/dynastyBacktest.mjs`. Import `KEY_FIELDS` from `./dynasty-history-run.mjs` alongside the existing imports.
- Keep the module's public API: `export { sc, val, makeCtx, validItems, cohortMap, combine, biasItems, meanOf, ciOf, bootstrapSpecs, assemble } from '../lib/dynastyBacktest.mjs';` and `export { KEY_FIELDS };` (next to the existing `export { metricKey, parseMetricKey }`).
- `guardedManifestCheck` call (:325) gets `{ Stop: DynastyReworkStop, tag: 'dynasty-rework' }`.
- Drop imports that become unused. Expected: `clusteredBootstrap` (:23) and `dynastyScoreMirror` (:24; its only use is inside the deleted `mirrorCall`) from the lib imports, and `cohortStats` and `percentileBias` from the `./dynasty-history-run.mjs` import (their only callers are deleted). Grep each name before removing it. Keep `pickDynastyLabelMirror` and every other import still referenced.
- No other line changes. `buildSpecs`, `assemble` call sites and `biasItems` call sites already match the shared signatures.
- Update the module header comment if it lists the deleted copies.

## 5. Tests

**Order matters.** Commit 1 lands the goldens on unmodified code. Then the new tests in §5.3–§5.5 are written and run **against the pre-move code** to show them red, and only then is the move made.

### 5.1 T-GOLD-S3 (`test/dynasty-history.test.mjs`, new `describe('T-GOLD-S3 shared-helper move leaves S3b byte-identical')`)
Two `sha256(JSON.stringify(x))` pins, hex constants computed on `b3f2d05` code and committed in commit 1:
- **(a) metrics:** `computeMetrics(fixture, { resamples: 50 })` where `fixture` =
  - `panelRows(HEADLINE_COHORTS.slice(0, 6), 26, …)`: QB rows `mkRow({ pid: \`p${S}_${i}\`, S, score: i, value: i + (i % 3), age: 21 + (i % 14), extra: { psWeeks: [0, 0, 4, 6, 1][i % 5] } })`. These contribute ρ; the ages span all four bands; psWeeks reaches the PS diagnostic for S ≥ 2018.
  - plus `panelRows(HEADLINE_COHORTS.slice(6), 10, …)`: same shape. These cohorts are below `MIN_ROWS.rho`, so they do not contribute, which exercises F9.
  - plus 25 rows each for 2023 and 2024.

  `mkRow` sets every score variant equal, so every ablation pair is `identical`. The 6×26 = 156 contributing rows are below the 160 minimum while all rows total 176, which exercises F7. Asserts the hash of the whole `{ metrics, summary }` result. Fails if any moved helper changes an S3b metric value, CI, n, cohortsUsed or label.
- **(b) rows:** `buildRows({ load: makeStore(), cohorts: [2019, 2021] })`, hash of the whole return value. Fails if `mirrorCall`, `guardedManifestCheck`, `isBC` or `round6` changes S3b's rows, exclusions or checks.
- Shown red: temporarily move `n += sa.n` above the `if (x == null) continue` in the shared `combine` (pre-F9) and confirm (a) fails; restore.

### 5.2 T-GOLD-S4 (`test/dynasty-rework.test.mjs`)
Same mechanism, pinned in commit 1 on `b3f2d05`:
- **(a)** `computeReworkMetrics(mk(false), { resamples: 40 })`, using T-BOOT's `mk` (8 cohorts × 40 rows; every cohort contributes, so F9 is inert).
- **(b)** `buildReworkRows({ load: makeStore(), cohorts: [2015, 2018] })`.

Asserts S4a output is unchanged wherever F9/F7 cannot bite. Fails if the shared `assemble`/`biasItems`/`combine`/`mirrorCall` change S4a label logic beyond F7/F9. Shown red: temporarily drop the `thin` term from the shared `assemble` and confirm (a) fails (the tilt cells' `minUsed` rule); restore. If (a) stays green under that break, choose another break that it catches and say which.

### 5.3 T-F9-S4 — F9 through S4a's call path
Rows built like T-BOOT's `mk(false)`, but cohorts 2015–2020 have 25 rows each (6 contributing cohorts, 150 rows) and 2021–2022 have 15 rows each (below `MIN_ROWS.rho`; 30 rows). Call `computeReworkMetrics(rows, { resamples: 40 })` and read `h3|M1|sleeper|delta|P~B2|rho|QB|all`. Assert `n === 150`, `cohortsUsed === 6`, `label === 'insufficient'`. Fails if `combine` counts non-contributing cohorts' rows: the old S4a copy gives `n === 180`, which clears the 160 minimum, so the cell gets a CI label. **Shown red against the pre-move code.**

### 5.4 T-F7-S4 — F7 through S4a's call path
Import `assemble` from `../scripts/dynasty-rework-run.mjs`, and add `labelBaseline` to the test file's imports from `../scripts/dynasty-history-run.mjs` (it is not imported there today). Spec `{ parts: {}, minN: 160, minC: 6, identical: true, label: (ci) => labelBaseline(ci, 'B2') }`.
- (i) `res = { point: { v: 0, c: 6, n: 150 }, boot: { ci95: [-0.1, 0.1], used: 4000 } }` → asserts `label === 'insufficient'` and `ci95` deep-equals `[-0.1, 0.1]`. Fails if `variant-identical` takes precedence over the minimum (S3b's pre-Fix-pass-1 order).
- (ii) the same with `n: 200` → asserts `label === 'variant-identical'`. Fails if S4a still runs its own `assemble` without the identical branch.

Shown red: (ii) against the pre-move code (the old copy returns `no-difference`). (i) cannot fail against the old S4a copy, which had no identical branch at all. Show it red by temporarily swapping the shared `assemble`'s first two branches (identical first); restore. State both in the hand-back.

### 5.5 T-ONE-HOME — no local copies
- Identity: for each name in `['sc','val','makeCtx','validItems','cohortMap','combine','biasItems','meanOf','ciOf','bootstrapSpecs','assemble']`, `rework[name] === shared[name]`. For `['hitRate','cohortStats','percentileBias','MIN_ROWS']`, `history[name] === shared[name]`. Also `rework.KEY_FIELDS === history.KEY_FIELDS`. (`import * as` each module.)
- Source scan: read `scripts/dynasty-rework-run.mjs` and `scripts/dynasty-history-run.mjs`. Neither defines any §3 symbol at module level, matched by `new RegExp(String.raw\`^(export\s+)?(function\s+${name}\b|const\s+${name}\s*=)\`, 'm')` (column 0, so a later function-local `const val =` cannot false-positive) over every §3 exported name. Plus one indented check for the only nested copy: S3b's former inner `assemble` in `computeMetrics`, matched by `/^\s+function\s+assemble\b/m` against `scripts/dynasty-history-run.mjs`. `lib/dynastyRework.mjs` defines neither `round6` nor `meanOf` (same column-0 pattern).
- Fails if a script keeps or re-adds its own copy. **Shown red against the pre-move code.**

Existing tests must stay green unchanged. The S4a T-BOOT, T-TILT and buildReworkRows-stop tests use all-contributing fixtures and S3b's message text. If any existing test needs an edit, stop and report.

## 6. Commits

1. `D-88: pin S3b/S4a goldens before the shared-helper move`: T-GOLD-S3 + T-GOLD-S4 only, on `b3f2d05` code.
2. `D-88: lib/dynastyBacktest.mjs — one home for the dynasty backtest helpers (F7/F9 reach S4a)`: the move, §5.3–§5.5, README, CLAUDE.md.

## 7. Stops (report, never improvise)

- A golden changes after the move.
- A §3 body cannot be moved verbatim. The two signature changes listed in §3 are the only permitted edits.
- An existing test needs editing.
- Moving something would touch `ageBand`, the B2 assignment, `lib/dynastyMirror.mjs`, or any file outside §2.

## 8. Done-definition and hand-back

`npm run smoke` and `npm test` green. Hand-back: both SHAs, files touched, deviations, and for each new test what it asserts, the defect it catches, and how it was shown red (pre-move code, or the named temporary break), then restored. Push per `git-workflow.md`.

**Backlog closure.** D-88 lives in the app repo, which this repo-scoped session cannot write. The closure request is `.claude/tasks/app-repo-backlog.md` → "Mark D-88 resolved", added by Session 1. Session 2 appends commit 2's SHA to that entry after the push.

## Plan review (2026-11-02, plan-reviewer light)

No blocking flags. Folded in (Anton approved): §4.2 drops the imports that become unused; §5.4 adds the `labelBaseline` test import; §5.5 anchors the copy scan at column 0, with one indented check for S3b's former inner `assemble`. Advisory, no change needed: §5.4(i) is shown red by swapping the branches, not against the old S4a copy (already stated).
