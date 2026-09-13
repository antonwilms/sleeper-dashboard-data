# Versioned Step 4 regression mirror — D-17 (Part A of 2)

**Repo:** `sleeper-dashboard-data` only. No served data file, schema or manifest entry changes. Branch `step4-mirror-version` + PR (touches `lib/`, `scripts/`, `bin/`, `test/`; `smoke-test.yml` runs on it).

**Split (review flag 1).**
- **Part A** (this file): the versioned mirror, harness threading, CLI, the Step 4 bootstrap, T-F5/T-F10 and docs. Shippable now.
- **Part B** (`.claude/tasks/step4-boundary-parity.md`): the parity test across the boundary and the D-18 `grading/anchor-policy.md` rewrite. **Blocked** on A merging and on the first post-boundary capture.
- **CR-15 registry text** (§4.2): applied by one parent-folder session after A merges.

**Session 1:** 2026-09-12 22:40 UTC, planning only. Planned against data `origin/main` `3337a01` and app `origin/main` `87305bc` (boundary commit `7b5b055`). The local checkout sits on the merged `rookie-mirror` branch, 0 ahead; Session 2 starts from `main`.

**Inputs:**
- App `.claude/tasks/data-repo-backlog.md` D-17/D-18
- App `.claude/tasks/step4-upside.md` §1.2, §4.1, §5, Appendix A
- App `src/utils/seasonProjection.js` at `7b5b055`
- `analysis/ranking-and-projection-review-2026-09-04.md` §9.6

---

## 0. Corrections to the brief, verified against live source

| # | Brief says | Live source says |
|---|---|---|
| C1 | D-18 row 4: "2026-09-13 HH:MM UTC" | `7b5b055` was committed **2026-09-12 22:27 UTC** (00:27 +02:00). The 2026-09-12 capture (`capturedAt` 18:34:49Z) came before it. (Part B.) |
| C2 | "captures from 2026-09-13 onward are post" | Expected, not yet verifiable. **No post-boundary snapshot exists at planning time** (newest `snapshots/2026-09-12.json`), hence the split. |
| C3 | "forward grading needs to reproduce whichever behaviour was live" | Grading never re-runs the pipeline (Invariant 9). It needs **segmentation** (anchor-policy), not reproduction. The mirror needs versions for three things: parity tests on each side, reproducing committed verdicts, and future `--fit`/`--fullpipeline` runs. |
| C4 | D-17 lists three data-side consumers | Incomplete and partly misdescribed — §2. `runStep4Verdict` never calls the mirror, and the one production caller (`attachFactorMultipliers`) is unlisted. |
| C5 | "`regressionUpsideBasis` supplies the position suffix" | Only on rows that fired. Snapshot rows carry no position. A gate check that reads position from the suffix is circular on exactly the rows it must test; Part B joins `nfl/players-state` instead. |
| C6 | — | T-F10 fixture (`snapshot-2026-07-05.slim.json`): 48 rows, none carrying `regressionUpsideBasis`. By position × `regressionFactorRaw`: RB 1.12×2, 1.05×3 · WR 1.12×4, 1.05×3 · TE 1.12×6, 1.05×2 · QB 1.12×1, 1.05×2. Two unpositioned rows at 1.05 are skipped by T-F10. **20 positioned RB/WR/TE rows discriminate the two models.** |
| C7 | — | `CLAUDE.md` is 24,954 / 25,000 bytes, so this slice makes **no** `CLAUDE.md` edit. |

---

## 1. Q1 · Versioning scheme → **an explicit model argument**

| Option | Verdict |
|---|---|
| Capture-date argument | **Rejected.** The fit's predictor years (2013–2025) have no capture date, so "live on date X" is meaningless to the main caller. It would put a date→version table in `lib/`, the design D-15 rejected. Manual imports (`bin/import-snapshot.mjs`) carry whatever app build exported them, so a date doesn't determine the model. |
| Detection from the row's `regressionUpsideBasis` | **Rejected as the mirror's interface.** Only a caller holding a captured row can use it; the fit has none. It also carries the rookie trap. Detection is how a *row-holding* caller chooses the argument: D-18's rule lives in `grading/anchor-policy.md` and is executed by Part B's T-S4-3. |
| **Explicit `model`** | **Chosen.** The mirror is a pure function of `(inputs, model)`, and each caller states the behaviour it wants. |

Model names follow D-17: `'legacy'` (ungated up-side) and `'step4-upside'` (up-side QB-only, app `7b5b055`+).

**When a caller does not specify:**
- **Mirror functions** (`resolveRegressionBucket`, `reconstructRegressionFactor`): `model` is **required**; a missing or unknown model throws. `'step4-upside'` also requires `position ∈ {QB, RB, WR, TE}` and throws otherwise. `'legacy'` ignores position.
  - Either silent default is the failure CR-15 names. A `legacy` default makes the fit reconstruct a retired factor. A current default silently flips the meaning of every parity check against a pre-boundary capture.
- **Harness** (`attachFactorMultipliers` ctx, `assemblePanel`, `runFit`, `runFullPipeline`, `bin/panel.mjs`): defaults to the exported `CURRENT_REGRESSION_MODEL` (`'step4-upside'`), as D-17 requires.
  - **The model is stamped into every output.** An unstamped committed artifact predates this slice, i.e. `legacy`.
  - The harness exists to reproduce the app now, so the next boundary changes one constant.

---

## 2. Q2 · Consumers, from live source

| # | Consumer | Anchor | In D-17? | Disposition |
|---|---|---|---|---|
| 1 | `attachFactorMultipliers` | `lib/panel.mjs:1397` (`position` bound `:1355`) | no | **Version-aware.** Adds `ctx.regressionModel` (default current), passes `{ position, model }`, stamps `fitCoverage.regressionModel`. This is the only production call. |
| 2 | `assemblePanel` → `runFit` / `runFullPipeline` → `bin/panel.mjs` | `scripts/panel-run.mjs:129,943,1290` | no | **Version-aware by threading.** Adds `--regression-model`; stamps `panel.meta`, `fitReport.meta` and the full-pipeline `meta`. |
| 3 | `runStep4Verdict` | `lib/panel.mjs:1797` | yes ("its shipped arm *is* the legacy table") | **Model-relative; algorithm unchanged.** It never calls the mirror; its shipped arm is `row.multipliers.regression` from whatever model assembled the panel. Under `step4-upside`, RB/WR/TE ΔMAE ≡ 0 is correct (nothing left to remove), and QB measures the retained up-side. §E reproduces via `--fullpipeline --regression-model legacy` (R1). Not rebuilt to re-derive `legacy` internally: `compBlend`'s ratio is computed at assembly from a `pipelinePPG` that already includes regression (`lib/projectionFactors.mjs:595-600`), so patching regression on a `step4-upside` assembly cannot reproduce §E exactly. Gains the clustered bootstrap (D-17). |
| 4 | T-F10 parity gate | `test/panel-fit.test.mjs:1501-1628` | yes | **Pins `legacy` permanently.** Its capture (2026-07-05) predates the boundary. §6.2. |
| 5 | T-F5 regression unit tests | `test/panel-fit.test.mjs:638-650` | no | **Migrates.** Calls must pass a model (else they throw). All cases sit outside the up-side, so both models must agree. |
| 6 | `FACTOR_RECONSTRUCTORS.regression` | `lib/projectionFactors.mjs:691` | no | **Unchanged.** Documentation only; nothing dispatches through it, and the `:727` assertion is unaffected. |
| 7 | Committed artifacts: `backtests/2026-08-09-r3fit-{fit,panel}.json`, `grading/2026-08-09-r3fit-verdict.md`, `backtests/2026-09-06-fullpipeline-panel.json`, `grading/2026-09-06-fullpipeline-verdict.md` | — | R3-FIT only | **Historical records, never rewritten.** Reproducible via `--regression-model legacy`. README states that unstamped means `legacy`. |

**Not consumers (verified):**
- The other `attachFactorMultipliers` test calls (`panel-fit.test.mjs:791–1365`, `:2793`). Their only regression-value assertion is `:835-850`: a constant PPG with ratio exactly 1.0, identical under both models.
- `panel-integration.test.mjs:522` (`runFit`), which asserts shape and labels only.

All of these are **expected green under the default change**. If any goes red, stop and report.

---

## 3. What changes

### 3.1 `lib/projectionFactors.mjs`

Replace `reconstructRegressionFactor` (`:90-107`) with the code below. The consistency block stays byte-identical:

```js
// Step 4 regression bucket — VERSIONED (D-17). 'legacy' = the ungated table every capture before
// app 7b5b055 and every R3-FIT/full-pipeline artifact committed before this change was produced
// under. 'step4-upside' = app 7b5b055+: up-side (outlierRatio < 0.85) retained only for
// REGRESSION_UPSIDE_POSITIONS; RB/WR/TE get 1.00 with basis `removed:<POS>`. A gate change that
// captured snapshots already carry is added as a new model, never an overwrite.
export const REGRESSION_MODELS = Object.freeze(['legacy', 'step4-upside']);
export const CURRENT_REGRESSION_MODEL = 'step4-upside';
export const REGRESSION_UPSIDE_POSITIONS = new Set(['QB']); // app seasonProjection.js REGRESSION_UPSIDE_POSITIONS
const REGRESSION_POSITIONS = ['QB', 'RB', 'WR', 'TE'];

// → { regressionFactorRaw, regressionUpsideBasis }. legacy emits basis null (the legacy app
// captured no such key). Branch order is the app's, verbatim.
export function resolveRegressionBucket(outlierRatio, { position, model } = {}) {
  if (!REGRESSION_MODELS.includes(model)) {
    throw new Error(`[projectionFactors] unknown regression model '${model}' — use ${REGRESSION_MODELS.join('|')}`);
  }
  if (model === 'step4-upside' && !REGRESSION_POSITIONS.includes(position)) {
    throw new Error(`[projectionFactors] step4-upside needs position QB|RB|WR|TE, got '${position}'`);
  }
  const none = model === 'legacy' ? null : 'none';
  if (outlierRatio > 1.35) return { regressionFactorRaw: 0.88, regressionUpsideBasis: none };
  if (outlierRatio > 1.15) return { regressionFactorRaw: 0.95, regressionUpsideBasis: none };
  if (outlierRatio < 0.85) {
    const upside = outlierRatio < 0.65 ? 1.12 : 1.05;
    if (model === 'legacy') return { regressionFactorRaw: upside, regressionUpsideBasis: null };
    return REGRESSION_UPSIDE_POSITIONS.has(position)
      ? { regressionFactorRaw: upside, regressionUpsideBasis: `retained:${position}` }
      : { regressionFactorRaw: 1.00, regressionUpsideBasis: `removed:${position}` };
  }
  return { regressionFactorRaw: 1.00, regressionUpsideBasis: none };
}

export function reconstructRegressionFactor(ppgs, meanPPG, lastPPG, { position, model } = {}) {
  const outlierRatio = lastPPG / Math.max(meanPPG, 1);
  const { regressionFactorRaw } = resolveRegressionBucket(outlierRatio, { position, model });
  /* consistency block :99-106 unchanged */
}
```

- **Header comment** (`:14-24`): after `:18`, add one line naming the versioned bucket by symbol, not by line. It mirrors `src/utils/seasonProjection.js`'s Step 4 bucket and `REGRESSION_UPSIDE_POSITIONS` at `7b5b055` as `resolveRegressionBucket`, with two models.
- **Return type** stays a number, so no arithmetic changes downstream.
- **Moved comment:** this insert shifts the `dynastyScore.js` contrast comment above `weightedLinearRegressionSlope`, which CR-15 anchors as `:110`. §4.2 R6 re-points it.

### 3.2 `lib/panel.mjs`

**a. `attachFactorMultipliers`.**
- Import `CURRENT_REGRESSION_MODEL` and `REGRESSION_MODELS`.
- Add `regressionModel = CURRENT_REGRESSION_MODEL` to the ctx destructure.
- Throw before the row loop if it is not in `REGRESSION_MODELS`; this applies even for `[]` rows.
- Change `:1397` to `reconstructRegressionFactor(ppgs, meanPPG, lastQ.ppg, { position, model: regressionModel })`.
- Add `regressionModel` to the `fitCoverage` literal.

**b. `runStep4Verdict(rows, opts)`.** Add `opts.bootstrap = null` (shape `{ resamples, seed }`). Point estimates are unchanged. When `bootstrap` is set, each `summarize(rowSet)` also returns `bootstrap: { resamples, seed, clusters, ci95: [lo, hi], pNegative }`; otherwise `bootstrap: null`. Per Appendix A:
- **Pairing:** rows where shipped, no-upside and `outcomePPG` are all finite. `diff = |noUpside − actual| − |shipped − actual|`.
- **Clusters:** grouped by `row.sleeperId`, in first-seen order. Throw if a paired row lacks `sleeperId`. An empty paired set gives `bootstrap: null`.
- **RNG:** reset to `seed` at the start of **each** `summarize` call:
  `seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648;`
  Replicate it **literally**, including the double-precision product; determinism is the requirement, not RNG quality.
- **Resampling:** each resample draws `clusters.length` clusters via `Math.floor(rnd() * clusters.length)`. Statistic = `Σsum / Σn`.
- **Summary:** sort ascending. `ci95 = [bs[Math.floor(0.025 * R)], bs[Math.ceil(0.975 * R) - 1]]` (indices 100 and 3899 at R = 4000). `pNegative = count(< 0) / R`.
- **Float semantics:** the statistic is a mean of per-row diffs, while `dMae` is `maeOf(noUpside) − maeOf(shipped)` (`:1736`). The two are not bit-identical beyond one row, so never compare them with `===` except on a one-row set.
- **Deviation comment:** update it to say the verdict is relative to the assembly's regression model.

### 3.3 `scripts/panel-run.mjs`

- **`assemblePanel`:** add `regressionModel = CURRENT_REGRESSION_MODEL` and pass it into the `attachFactorMultipliers` ctx (`:230`). Set `meta.regressionModel` only when `withFactorMultipliers`.
- **`runFit`:** add a `regressionModel` param and thread it through. `buildFitVerdictReport` adds `meta.regressionModel` from `panel.meta.regressionModel`.
- **`runFullPipeline`:** add a `regressionModel` param, thread it, add `meta.regressionModel`, and call `runStep4Verdict(..., { injuryPredicate, bootstrap: { resamples: 4000, seed: 12345 } })`.
- **`step4Section`** gains a `model` argument:
  - Prepend `Up-side graded against the \`${model}\` Step 4 table.`
  - Under `step4-upside`, add `RB/WR/TE ΔMAE is 0 by construction — no up-side remains to remove.`
  - Append `Clustered bootstrap (${clusters} players, ${resamples} resamples): ΔMAE 95% CI [lo, hi], P(Δ<0)=p` to both the overall and injury-gated lines.

### 3.4 `bin/panel.mjs`

- **New option** `--regression-model legacy|step4-upside`.
- **Mode check:** if `args.includes('--regression-model')` without `--fit` or `--fullpipeline`, exit 1 with `[panel] Error: --regression-model applies only to --fit/--fullpipeline`.
- **Value check (review flag 5):** `option()` returns `null` when the flag is the last argument (`:57-60`). If the flag is present and the value is `null`, or not in `REGRESSION_MODELS`, exit 1 with `[panel] Error: --regression-model needs legacy|step4-upside`. A missing value must never fall through to the default.
- **Default:** pass the value to `runFit`/`runFullPipeline`; when the flag is absent, pass nothing, so the default stays in lib.
- **Header line** after `:22`: `--regression-model M   Step 4 regression table for --fit/--fullpipeline (default step4-upside = the current app; legacy reproduces unstamped artifacts committed before this flag existed)`.

---

## 4. Cross-repo impact

### 4.1 CR-15 · R3-FIT factor-multiplier mirror — **fires**

> **Mirror (verbatim):** Re-mirror the changed constant/gate/branch and **re-fit before any further exponent activation** — otherwise the fit reconstructs a factor the app no longer produces and the committed verdict in `.claude/tasks/r3fit-exponent-harness.md` stops transporting. Which positions a factor is gated to is itself part of the mirror. Note the known parity gap: `shareTrend` and `teamRzShare` have no end-to-end app-ground-truth check until a post-2026-07-18 snapshot is imported. **Nothing app-side fails when this drifts.** **Scope note reversed (D6a, 2026-09-06):** `dynastyScore.js` was previously named in `lib/projectionFactors.mjs:110` only as a *contrast* and marked deliberately not a trigger; D6a's age port (Step 2) draws `computeEmpiricalAgeCurves` straight out of it, so `dynastyScore.js` is now mirrored and is a trigger like the other ten app-side modules. The old contrast is still accurate as far as it goes — `weightedLinearRegression`'s copy in that file remains unfloored where the mirrored one floors the denominator at 4 — it just no longer means the whole file is out of scope. A change to any of the three app-side rookie mechanisms, or to their ordering, re-mirrors here; the mirror must never become reachable from the fit path, which `test/rookie-mirror.test.mjs`'s import-graph assertion enforces.

**How this slice discharges it:**
- **Re-mirrored as a version.** The position gate is part of the mirror.
- **No re-fit is run.** No exponent activation is pending (`step4-upside.md` §4.2: every R3-FIT verdict is UNSTABLE, and there is no app `POSITION_FACTOR_EXPONENTS`).
- **The obligation binds the next `--fit`,** which now defaults to `step4-upside`.

### 4.2 CR-15 entry text — **needed (Q4)**

**Exports change.** New: `resolveRegressionBucket`, `REGRESSION_MODELS`, `CURRENT_REGRESSION_MODEL`, `REGRESSION_UPSIDE_POSITIONS`. Signature change: `reconstructRegressionFactor` gains a required options argument.

CR-15's `Data side` names `lib/projectionFactors.mjs` file-wide, so no registry test reds without the edit. It is owed anyway:
1. Naming the symbols makes `test/registry.test.mjs` guard them.
2. `runStep4Verdict` becomes a mirror consumer.
3. The `Invariant` ("reproduce the app's behaviour exactly") is now false for Step 4.
4. D-17 correction 1 (the app-side prose never names the Step 4 table) belongs to this entry.
5. Review flags 9–11 add three more stale facts in the same entry.

Both copies' CR-15 are byte-identical today (the line-anchored sentinel diff is empty). **Each `old` below was verified to occur exactly once in `cross-repo-registry.md`.** If an apply finds a count other than 1, stop.

**R1 · App side**
- old: `label→factor maps, forward-mover neutralization,`
- new: `label→factor maps, the Step 4 regression bucket table and its up-side position gate \`REGRESSION_UPSIDE_POSITIONS\` (up-side QB-only since \`7b5b055\`; earlier captures carry the ungated table), forward-mover neutralization,`

**R2 · Data side (symbols)**
- old: ``- **Data side:** `lib/projectionFactors.mjs`, `lib/panel.mjs` (`predictWithExponents`, `attachFactorMultipliers`,``
- new: ``- **Data side:** `lib/projectionFactors.mjs` (`resolveRegressionBucket`, `reconstructRegressionFactor`, `REGRESSION_MODELS`, `CURRENT_REGRESSION_MODEL`, `REGRESSION_UPSIDE_POSITIONS`), `lib/panel.mjs` (`FULL_FACTORS`, `ENVELOPE_FACTORS`, `predictWithExponents`, `attachFactorMultipliers`, `runStep4Verdict`,``

**R3 · Data side (CLI modes and parity guard)**
- old (exact text inside the fence):
  ```text
  `bin/panel.mjs --fit`, parity-guarded by `test/panel-fit.test.mjs`, `lib/rookieMirror.mjs` (
  ```
- new (exact text inside the fence):
  ```text
  `bin/panel.mjs --fit`, `bin/panel.mjs --fullpipeline`, parity-guarded by `test/panel-fit.test.mjs` and `test/step4-mirror.test.mjs`, `lib/rookieMirror.mjs` (
  ```

**R4 · Invariant**
- old: ``and the `combinedNewFactorRaw` membership/clamp range reproduce the app's behaviour exactly.``
- new: ``and the `combinedNewFactorRaw` membership/clamp range reproduce the app's behaviour exactly. **The Step 4 regression bucket is versioned by design:** model legacy (ungated up-side — every capture before app `7b5b055` and every R3-FIT/full-pipeline artifact committed before the versioning change) and model step4-upside (up-side QB-only, app `7b5b055` onward) are both reproduced exactly; the fit harness defaults to the app's current model and stamps the model it used.``

**R5 · Triggers (data side)**
- old: ``‖  `lib/projectionFactors.mjs`, `lib/panel.mjs`, `scripts/panel-run.mjs`, `test/panel-fit.test.mjs`, `lib/rookieMirror.mjs`, `test/rookie-mirror.test.mjs```
- new: ``‖  `lib/projectionFactors.mjs`, `lib/panel.mjs`, `scripts/panel-run.mjs`, `bin/panel.mjs`, `test/panel-fit.test.mjs`, `lib/rookieMirror.mjs`, `test/rookie-mirror.test.mjs`, `test/step4-mirror.test.mjs```

**R6 · Mirror (stale anchor)**
- old (exact text inside the fence):
  ```text
  `lib/projectionFactors.mjs:110`
  ```
- new (exact text inside the fence):
  ```text
  `lib/projectionFactors.mjs` (the comment above `weightedLinearRegressionSlope`)
  ```

**R7 · Mirror (versioning rule)**
- old: ``which `test/rookie-mirror.test.mjs`'s import-graph assertion enforces.``
- new: ``which `test/rookie-mirror.test.mjs`'s import-graph assertion enforces. **A gate change that captured snapshots already carry is added as a new model, never an overwrite (`7b5b055`, Step 4 up-side):** the retired behaviour stays reproducible for parity against pre-boundary captures and for re-running committed verdicts, the new model becomes the harness default, and the boundary gets a row in `grading/anchor-policy.md`.``

**Route (review flag 2).** CLAUDE.md sanctions exactly one way to land a two-sided registry change: a parent-folder session editing both copies in the same change. That replaces the brief's sequential app-then-data route, which would leave the mirrored regions disagreeing in between. The emitted text above is unchanged by this. **After this PR merges** (R2/R3/R5 name symbols and a test file that must exist first), one parent-folder session:
1. applies R1–R7 to `sleeper-dashboard/docs/cross-repo-registry.md` **and** `sleeper-dashboard-data/cross-repo-registry.md`;
2. confirms the line-anchored diff is empty:
   ```sh
   diff <(sed -n '/^<!-- CR-REGISTRY-BEGIN -->$/,/^<!-- CR-REGISTRY-END -->$/p' sleeper-dashboard/docs/cross-repo-registry.md) <(sed -n '/^<!-- CR-REGISTRY-BEGIN -->$/,/^<!-- CR-REGISTRY-END -->$/p' sleeper-dashboard-data/cross-repo-registry.md)
   ```
3. runs `npm test` in the data repo;
4. commits each repo and pushes both together.

**Session 2 pre-check (no registry edit):**
1. Apply R1–R7 to a scratchpad copy of `cross-repo-registry.md`.
2. Run `parseEntries`, `extractSymbolFileClaims` and `symbolResolvesIn` from `lib/registry.mjs` against the branch's source.
3. Report that every CR-15 claim resolves.

### 4.3 Fire-list hits that do not fire

The `lib/registry.mjs` scan over the touched files and symbols also matched these entries. None creates a mirror obligation:

| Entry | Why it does not fire |
|---|---|
| CR-01 | `resolveScoring` and the envelope are untouched. |
| CR-07 | `loadAdvstats`, `resolvePosition` and `buildPanelRow` are untouched. |
| CR-11 | `attachFactorMultipliers` is edited, but no snap/RZ key read changes. |
| CR-14 | The `buildOutcomeMaps` call is untouched. |
| CR-02, CR-18 | Part A does not touch `data-catalog.md`. |

### 4.4 Deferred from D-17 — not this slice

These are app-side-only facts that this repo's reviewer cannot verify, and they are independent of the mirror. They go to their own parent-folder item, and may be batched into §4.2's session if planned there:
- CR-01's unlisted consumers.
- The stale CR-02/CR-13/CR-17 `seasonProjection.js` anchors.
- **New:** the app copy's drift command (`docs/cross-repo-registry.md:269-270`) diffs against `../sleeper-dashboard-data/README.md`. That file has had no sentinels since `b44304e`, so the command diffs the full region against an empty span and can never pass.

---

## 5. Session 2 — steps and commits

**Step 0 · Branch and baseline (review flag 3).**
1. `git switch main && git pull --rebase origin main`.
2. **On unmodified `main`**, run `node bin/panel.mjs --fullpipeline --json > "<scratchpad>/fp-baseline.json" || true`. Exit 1 is expected: the run is `stopped` and still prints JSON. The file must stay outside the repo.
3. `git switch -c step4-mirror-version`. Include this task file in commit 1.

The baseline isolates the mirror change from the weekly inputs `--fullpipeline` reads (e.g. `nflverse-playerids.yml`, `nflverse-depth.yml` refresh weekly).

**Commit 1 · mirror, harness and CLI.** §3.1, §3.2a, §3.3 minus the bootstrap and markdown, §3.4, §6.1, §6.2, and the §7 docs.

**Commit 2 · Step 4 bootstrap.** §3.2b, the §3.3 bootstrap and markdown changes, and §6.3.

**Run-and-report.** This is hand-back evidence, not committed. **Never pass `--write`**; committed artifacts are records.

- **R1** `node bin/panel.mjs --fullpipeline --regression-model legacy --json > "<scratchpad>/fp-legacy.json" || true`.
  - **Must hold (stop if not):** the JSON deep-equals `fp-baseline.json` after recursively dropping keys `generatedAt`, `regressionModel` and `bootstrap`. This proves `legacy` reproduces pre-change `main` exactly.
  - **Must hold:** `meta.regressionModel === 'legacy'`.
  - **Report:** `step4.<POS>.overall.dMae` to 4 dp, against the 2026-09-06 verdict (QB 0.0091, RB −0.0190, WR −0.0326, TE −0.0122).
    - If the *baseline* already differs from those figures, it is input drift since 2026-09-06. Report it; it is not a stop.
    - If the baseline matches them, bootstrap `ci95` endpoints must lie within ±0.002, and `pNegative` within ±0.02, of `step4-upside.md` §1.2's removeAll: QB [−0.0054, +0.0250] 0.10 · RB [−0.0382, −0.0013] 0.99 · WR [−0.0458, −0.0193] 1.00 · TE [−0.0244, +0.0009] 0.97. Otherwise stop.
    - The tolerance exists because Appendix A ran one RNG stream across positions and four variants, while this reseeds per call.
- **R2** — same command without the flag.
  - `meta.regressionModel === 'step4-upside'`.
  - RB/WR/TE `overall.dMae === 0` and `injuryGated.dMae === 0` exactly.
  - `step4.QB` deep-equals R1's `step4.QB`: QB rows are identical under both models, and rows assemble independently (`panel-fit.test.mjs:2793`).
- **R3** — each of these exits 1 with its §3.4 message:
  - `node bin/panel.mjs --regression-model legacy`
  - `node bin/panel.mjs --fit --regression-model`
  - `node bin/panel.mjs --fit --regression-model foo`

**PR:** title `feat: versioned Step 4 regression mirror (D-17)`. The body lists §4.2's parent-folder session and Part B as follow-ups. Do not merge before verification and human sign-off.

---

## 6. Tests to add

### 6.1 `test/step4-mirror.test.mjs` (new) — unit behaviour

Part B later appends T-S4-1…6 to this file.

**T-S4-U1 · model required.** Each of these throws:
- `resolveRegressionBucket(0.6, { position: 'WR' })` → `/unknown regression model/`
- `{ position: 'WR', model: 'step4' }`
- `reconstructRegressionFactor([10, 10, 10], 10, 6)` with no options

**T-S4-U2 · position rules.**
- `{ model: 'step4-upside' }` with no position throws.
- `{ position: 'K', model: 'step4-upside' }` throws.
- `{ model: 'legacy' }` with no position returns `{ regressionFactorRaw: 1.12, regressionUpsideBasis: null }` at ratio 0.6.

**T-S4-U3 · threshold table.** An `it.each` over ratio × model × position, `deepEqual` on the returned object. The 0.65, 0.85, 1.15 and 1.35 rows pin the strict comparisons.

| ratio | legacy (any pos) | step4-upside RB/WR/TE | step4-upside QB |
|---|---|---|---|
| 0.6, 0.648 | 1.12 · null | 1 · `removed:<POS>` | 1.12 · `retained:QB` |
| 0.65, 0.652, 0.8, 0.848 | 1.05 · null | 1 · `removed:<POS>` | 1.05 · `retained:QB` |
| 0.85, 0.852, 1.15 | 1 · null | 1 · `none` | 1 · `none` |
| 1.2, 1.35 | 0.95 · null | 0.95 · `none` | 0.95 · `none` |
| 1.4 | 0.88 · null | 0.88 · `none` | 0.88 · `none` |

**T-S4-U4 · composition.** Assert with `Math.round(x * 1000) / 1000`. The test first confirms the band is steady via the CV formula.

| Career PPGs | Model · position | Expected |
|---|---|---|
| `[22, 22, 22, 22, 16]` (mean 20.8, ratio 0.769, steady ×0.50) | legacy · WR | 1.025 |
| same | step4-upside · WR | 1 |
| same | step4-upside · QB | 1.025 |
| `[18, 18, 18, 18, 24]` (ratio 1.25, steady) | all four model × position combinations | 0.975 |

**T-S4-U5 · constants.**
- `REGRESSION_MODELS` deep-equals `['legacy', 'step4-upside']`.
- `CURRENT_REGRESSION_MODEL === 'step4-upside'`.
- `[...REGRESSION_UPSIDE_POSITIONS]` deep-equals `['QB']`.

**T-S4-U6 · basis type.** At ratio 0.9, every position returns a string basis under `step4-upside` and `null` under `legacy`.

### 6.2 `test/panel-fit.test.mjs` (update)

**T-F5 (`:638-650`).**
- Loop the five calls over `REGRESSION_MODELS`, passing `{ position: 'WR', model }`.
- Values are unchanged.
- Append "(identical under both Step 4 models — outside the up-side)" to the title.

**T-F10 (`:1501-1628`) — pins `legacy`.**
- Delete `localRegressionFactorRaw`.
- `:1586` becomes `assert.equal(resolveRegressionBucket(outlierRatio, { position, model: 'legacy' }).regressionFactorRaw, factors.regressionFactorRaw, ...)`.
- `:1591` passes `{ position, model: 'legacy' }`.
- **New, before the loop:** assert that 0 fixture rows carry `regressionUpsideBasis` (pre-boundary by D-18's rule).
- **New, in the loop:** count rows where `resolveRegressionBucket(outlierRatio, { position, model: 'step4-upside' }).regressionFactorRaw !== factors.regressionFactorRaw`, recording each row's position and captured raw.
- **New, after the loop:** count `=== 20` (C6), and every counted row is RB/WR/TE with captured raw ∈ {1.05, 1.12}. If the count differs, stop and report.
- **Header comment:** add that this gate pins `legacy` permanently, because its capture predates boundary 4.

**T-A1 · `attachFactorMultipliers` threads the model** (new, after `:850`).
- Using the builders of the `:826`/`:847` tests, build one WR and one QB with ≥ 3 qualifying seasons whose last PPG is 0.6× the mean of the earlier seasons. State which builder was used.
- **Default ctx:**
  - `fitCoverage.regressionModel === 'step4-upside'`.
  - WR `multipliers.regression === reconstructRegressionFactor(ppgs, mean, last, { position: 'WR', model: 'step4-upside' })`, which `=== 1`.
- **`regressionModel: 'legacy'`:**
  - `fitCoverage.regressionModel === 'legacy'`.
  - WR equals the legacy direct call, and it is `> 1`.
  - QB `multipliers.regression` is identical across the two ctxs.
- **Invalid:** `regressionModel: 'x'` throws, even with `[]` rows.

**T-A2 · `runStep4Verdict` is model-relative** (new, in the `:2214` describe).
- **Fixture:** one WR and one QB `d6bFitRow` (`anchorBasePPG` 10, `outcomePPG` 10), `qualifyingSeasons` PPG `[10, 10, 5]`, with `multipliers.regression` set from `reconstructRegressionFactor(..., { position, model })` for each model.
- **WR:** `overall.dMae === 0` under `step4-upside`, and `!== 0` under `legacy`.
- **QB:** `overall.dMae !== 0` and identical under both models.

### 6.3 Bootstrap tests (`test/panel-fit.test.mjs`, the `:2214` describe)

| Test | Fixture | Asserts |
|---|---|---|
| **T-B1** | Any rows, no `bootstrap` option | `overall.bootstrap === null`; the existing four tests are unchanged |
| **T-B2** | 6 WR `d6bFitRow`s, distinct `sleeperId`s, mixed regression and outcomes (so the diffs differ), `{ resamples: 400, seed: 12345 }` | Two runs deep-equal; `ci95[0] ≤ overall.dMae ≤ ci95[1]`; `clusters === 6`; `ci95` and `pNegative` pinned to the observed values |
| **T-B3** | Two rows sharing one `sleeperId` plus one distinct row | `clusters === 2` |
| **T-B4** (review flag 4) | **Exactly one row** | `ci95[0] === ci95[1] === overall.dMae` and `pNegative ∈ {0, 1}`. Exact equality holds only at n = 1 (see §3.2b float semantics). |
| **T-B5** | A paired row without `sleeperId` | Throws |
| **T-B6** | An empty paired set | `bootstrap === null` |

---

## 7. Docs/README updates

**a. `README.md` `bin/panel.mjs` flag paragraph (`:1276-1280`).** Append after `--write`:
`` `--fullpipeline`, `--rookie`, `--regression-model legacy|step4-upside` (with `--fit`/`--fullpipeline` only; default `step4-upside`).``

**b. `README.md` R3-FIT section, after `Reproduce: node bin/panel.mjs --fit --write.` (`:1840`).** Add this paragraph. It is date-free (review flag 6), and Part B appends the boundary-parity sentence (review flag 8):

`**Step 4 regression model.** The mirror reproduces two versions of the app's Step 4 regression bucket: \`legacy\` (up-side ×1.12/×1.05 at every position — what the app shipped until \`7b5b055\`) and \`step4-upside\` (up-side QB-only, RB/WR/TE ×1.00). \`--fit\` and \`--fullpipeline\` default to the app's current model and stamp \`meta.regressionModel\`; an artifact without that stamp predates the versioning and was computed under \`legacy\`, which \`--regression-model legacy\` reproduces. \`runStep4Verdict\` grades the up-side of whichever model assembled the panel, so under \`step4-upside\` its RB/WR/TE ΔMAE is 0 by construction. T-F10 pins \`legacy\` against the 2026-07-05 capture; \`test/step4-mirror.test.mjs\` pins both models' bucket tables.`

**c. Code headers.** `bin/panel.mjs` (§3.4) and `lib/projectionFactors.mjs` (§3.1).

**d. Not changed here:**

| File | Why not |
|---|---|
| `grading/anchor-policy.md`, `data-catalog.md` | Part B |
| `CLAUDE.md` | 46 bytes of headroom; its `lib/projectionFactors.mjs` row stays true |
| `cross-repo-registry.md` | §4.2 |
| `manifest.json` and served data | Untouched |

---

## 8. Done-definition and hand-back

**Done-definition:**
- `npm run smoke` and `npm test` are green.
- Every §2 "expected green" test stays green, with no edits beyond §6.2.
- There is no `manifest.json` or served-file change.

**Hand-back:**
- the commit SHAs and PR URL;
- every file touched, and every deviation from this file;
- what each new or changed test asserts, and every pinned value;
- the R1–R3 outputs, including the R1 deep-equal result and any input drift from 2026-09-06;
- the §4.2 scratch-copy resolution result.

## 9. Risks

| Risk | Handling |
|---|---|
| The default flip means a future `--fit` no longer matches committed R3-FIT artifacts | Intended (CR-15); stamped and documented |
| Bootstrap intervals will not match §1.2 bit-for-bit | Stated tolerance (R1); `legacy` must match the pre-change baseline exactly |
| `--fullpipeline` is slow | Two extra runs (baseline, R2) are offline evidence only |

---

## 10. Review record — plan-reviewer, 2026-09-12 (single-file draft, 45,852 bytes)

All 11 flags were verified against live source before disposition. All 11 were accepted.

| # | Flag | Verified | Disposition |
|---|---|---|---|
| 1 | slice-size — 45,852 B > 40 KB | Correct | **Split.** A = this file (shippable now); B = `step4-boundary-parity.md`, blocked on the post-boundary capture. The calendar block was already a natural seam. |
| 2 | strategy — the sequential app→data registry route leaves the copies disagreeing; CLAUDE.md sanctions a parent-folder session | Correct (CLAUDE.md, Cross-repo contract registry) | **Fixed** in §4.2. The emitted text is unchanged; application moves to one parent-folder session after A merges. **Deviates from the brief's "two-session route" wording.** Anton can override. |
| 3 | ordering — no pre-change `--fullpipeline` baseline; weekly inputs can drift | Correct (`nflverse-playerids.yml` weekly Wed, `nflverse-depth.yml` weekly Sat) | **Fixed.** Step 0 baseline; R1 now deep-equals the baseline (must hold). The 2026-09-06 figures are reported, and drift is not a stop. |
| 4 | edge-case — T-B4 `===` between the bootstrap mean and `dMae` | Correct (`maeOf` `:1736` = difference of means) | **Fixed.** T-B4 uses exactly one row; §3.2b states the float semantics. |
| 5 | edge-case — `option()` returns `null` for a trailing flag, silently defaulting | Correct (`bin/panel.mjs:57-60`) | **Fixed** in §3.4 and R3. |
| 6 | edge-case — the fallback capture date is hard-coded in five places | Correct | **Fixed.** A's CLI header and README are date-free; the date lives only in B's fixture constant and anchor-policy fill cells. |
| 7 | edge-case — the anchor-policy "first 16:29 run" rule is broken by late runs | Correct (`2026-09-12` `capturedAt` 18:34:49Z) | **Fixed** in B §4.1: keyed on `capturedAt`. |
| 8 | ordering — commit 1's README cites boundary tests that land later | Correct | **Fixed** by the split; the sentence moves to B §4.3. |
| 9 | cross-repo — CR-15 Mirror's `lib/projectionFactors.mjs:110` goes stale | Correct (comment at `:109-111`, shifted by §3.1) | **Fixed** by §4.2 R6 (symbol anchor, count 1). |
| 10 | registry-stale — `bin/panel.mjs --fullpipeline` unlisted; `bin/panel.mjs` absent from data-side Triggers | Correct | **Fixed** by §4.2 R3 and R5. |
| 11 | registry-stale — `FULL_FACTORS`/`ENVELOPE_FACTORS` unlisted (`lib/panel.mjs:875,904`) | Correct; both gate which positions get regression | **Fixed** by §4.2 R2. |

The reviewer's MIRROR block matches §4.1 verbatim; no change was needed.
