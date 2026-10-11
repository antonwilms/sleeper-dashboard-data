# W3 — Research arms: D-68, D-55, D-56, D-13

**Session 1, 2026-10-12 (opus), parent-folder read of both repos.** Baselines: data `fe324e6`, app `cbd17c8`. Both
are D-50's commits and are **unpushed**. W3 stacks on them, so D-50 is pushed first. Source:
`../future_plans/in-season-notes-plan.md` → "Close-out programme (2026-10-10)" → W3, plus D-68 (left open by W2).
Input list: `../sleeper-dashboard/.claude/tasks/data-repo-backlog.md`. App companion (Stage B):
`research-arms-w3-app.md`. D-13 spec: `research-arms-w3-d13.md`.

**Rules (Anton):** offline research only, one verdict per item. **Anything that would move a score is a
recommendation for Anton, not a change.** No app `projectedPPG`, `projectedGames`, `projectedTotalPts`, dynasty
score, pinned constant or `PRIOR_MODEL_FROM` moves. No served data file is written. **No registry edit:** the new
data-side readers are queued as cache additions on D-69 (Stage B5), the two-session route.

**Route.** Stage A is a data-repo session (sonnet), commits A0–A5 (§6). Stage B is an app-repo session (sonnet),
commits B1–B5, in `research-arms-w3-app.md`. B needs A's SHAs and run dates. Push order: D-50 (both repos), then W3
data, then W3 app, the same day.

---

## 1. Verdicts (Session 1 scratch measurements, data `fe324e6`, read-only)

| item | verdict | moves a score? |
|---|---|---|
| **D-68** | **Confirmed.** Boundary 7 holds on the first post-push capture (§2). | no |
| **D-55** | **No flip.** With rows lacking an S+1 outcome admitted, second-year WRs are still the only WORSE cell. `PROSPECT_PRIOR_KIND` stays as shipped (§3). | no |
| **D-56(a)** | **No change.** The arm-A ladder for second-year WRs stays on the pooled rung: k = 3.5, the shipped pin (§4). | no |
| **D-56(b)** | **No snapshot field needed.** The neutral (KTC/college-free) rookie prior is a closed-form function of factors every capture already carries. It reproduces the captured `projectedPPG` on 307 of 307 rookie rows (§5). | no |
| **D-13** | **Recommendation for Anton.** The shipped composition (calibrated PPG × availability games) overstates realised rookie total points: day-3 RB/WR/TE ×1.26, undrafted ×1.20, CIs above 1. A per-group multiplier of about 0.82 beats the shipped total out of sample (§7). | **yes, if wired** |

W2's triage said D-13 "is already delivered" by verdict §E. That was wrong for the question D-13 asks. §E measured
cell means on the legacy (season-presence) population. It never composed the shipped per-row projection with the
shipped games ladder on the availability population. §7.1 explains the gap.

---

## 2. D-68 — boundary 7 cross-check (measured)

- The absence-correction push is data `c7cfcc7`, committed 2026-10-07 06:50:18 UTC.
- `snapshots/2026-10-06.json` (`capturedAt` 2026-10-06T21:07:01.424Z) is before the push. All 15 movers listed in
  `grading/2026-10-06-absence-verdict.md` §5 carry their "before" `projectedGames` and `factors.injurySeasons`.
- `snapshots/2026-10-07.json` (2026-10-07T21:39:01.968Z) is the first capture after the push. All 15 carry their
  "after" values.
- Between those two captures:
  - exactly 35 rows change `projection.projectedGames` (the verdict's 35), none of them a rookie-path row;
  - 19 change `factors.injurySeasons`;
  - 63 change `factors.absenceShapeFactor`;
  - 1 flips `factors.isBounceBack` false → true: `4972` (Mason Rudolph), the verdict's only flip.
- The 2026-10-08 and 2026-10-09 captures hold the same values on all 15 movers.

---

## 3. D-55 — the S+2 arm comparison (measured)

**What it is.** App in-season-evidence-2c-wiring §1b ran a one-off S+2 comparison through the `assemble` test seam,
on rows that also had an S+1 outcome. That run set `PROSPECT_PRIOR_KIND`. D-55 makes it a committed, reported arm of
`--inseason --dynasty`:
- `nextPPG2` is carried through `augmentRow`;
- rows without an S+1 outcome are admitted;
- its result gates `PROSPECT_PRIOR_KIND` (CR-25 Mirror: "a cell flips only on a committed re-run of it").

**Population.**
- **Admitted:** `preFilterRows` that pass `classifyRow(r).q1` and have a finite `nextPPG2`. 2a sets `nextPPG2` only
  for S ≤ `IN_SEASON_DEFAULTS.plus2To` (2023), gp ≥ 6.
- **Survivors:** the admitted rows that also have a finite `nextPPG`. This is §1b's population.

**Arms.**
- A = `prospectPrior` (the position baseline). B = `projPrior` (the neutral projection).
- **Prior:** the starting point alone. **Updated:** A blended at its subgroup's pooled arm-A `kFit` (unrounded, as
  §1b: YE0 2.4, YE1 3.6); B blended at `k2a`.
- Δ = B − A in MAE (PPG), `pairedDelta` (player-clustered).

| population | rows | player-seasons | players | Δ prior (ALL) | WR\|YE1 Δ prior | WORSE cells |
|---|---|---|---|---|---|---|
| survivors (= §1b, reproduced exactly) | 10,526 | 957 | 614 | BEATS −0.236 [−0.428, −0.030] | WORSE +0.548 [0.245, 0.851] | WR\|YE1 |
| **admitted** | 11,887 | 1,096 | 731 | BEATS −0.438 [−0.622, −0.259] | WORSE +0.416 [0.143, 0.699] | WR\|YE1 |

On the admitted population, WR|YE0 moves from NO-GAIN to BEATS (−0.611). Every other cell stays NO-GAIN or BEATS.

**Rule (pre-registered, revision 3 of the wiring decision).** A cell starts from the position baseline iff its
**admitted** prior Δ is WORSE; otherwise from the projection. A cell with no Δ is undecided (`null`) and never
counts as a flip. Result: the shipped `PROSPECT_PRIOR_KIND`, no flips.

---

## 4. D-56(a) — arm-A k ladder for second-year WRs (measured)

- `runQ1` runs the arm-A two-rung ladder only when a subgroup picks arm A. YE1 picks B, so arm A's ladder has never
  run, and the app pins `K_DYN_PROSPECT_A_YE1` from the panel's pooled YE1 fit (`inSeasonConstants.js:54-61`).
- `twoRungLadder({ rowsPooled: YE1 rows, spec: SPEC_A })` gives:
  - pooled kFit 3.6, CI [2.7, 4.8], 7,583 rows, 684 players;
  - WR: own vs pooled WORSE +0.0177 [0.0005, 0.0348] → stays pooled → k 3.5;
  - RB: NO-GAIN → pooled; TE: WORSE → pooled; QB: own INSUFFICIENT → pooled fallback.
- So `K_DYN_PROSPECT_A_YE1` = 3.5 in every cell, basis `pooled`. This equals the shipped pin.
- An app re-pin to the new constants file would change provenance only. It is not part of W3. B3 records it as
  owed to the next app slice that touches `inSeasonConstants.js`.

---

## 5. D-56(b) — does the snapshot need the neutral prior? (measured)

**The question.**
- The app's dynasty-side rookie prior is `computeNextSeasonProjection` with `ktcMap: null, collegeStats: null`
  (`prospectPrior.js`).
- Snapshots carry the KTC-inclusive `projection.projectedPPG`, and `inSeason.next` is the KTC-inclusive posterior.
- Before a grader scores the dynasty-side rookie posterior, someone must decide whether the capture needs an
  additive field (CR-01).

**Finding.** In `rookieProjection` (app `seasonProjection.js:360-469`), KTC and college enter **only** through
`ktcMult` and `collegeContribution`. Every other term is captured in `projection.factors`:
`basePPG`, `ageDelta`, `nflDraftMultiplier`, `rookieCalibrationMult`, `rookieCeilingKnee`/`Asymptote` (already
basis-scaled), and for QBs `qbTakeoverBasis`, `qbStartShare`, `qbStarterPPG`, `qbStarterBasis`.

The closed form below reproduces the captured value on every rookie-path row of two captures:
- `snapshots/2026-10-11.json`: 307 of 307 rows reproduce `projectedPPG` to 1 dp and `rookieCeilingPPGPre` to
  0.0005. 265 rows have `ktcMult` or `collegeContribution` ≠ 1, and on 231 of them the neutral value differs.
- `snapshots/2026-10-10.json`: 310 of 310 rows; 268 and 233.

The closed form:
1. `prod = clamp(ageDelta × ktcMult × collegeContribution × nflDraftMultiplier, 0.45, 1.85)`
2. `pre = clamp(basePPG × prod × rookieCalibrationMult, 0, 40)`
3. `ceiled` = `pre` when the knee is null or `pre ≤ knee`, else
   `knee + (asym − knee)(1 − e^{−(pre − knee)/(asym − knee)})`
4. On a `chain` row: starter = `qbStarterPPG` if `qbStarterBasis` starts with `rookie:`, else `ceiled`; the value
   is starter × `qbStartShare`. On any other row the value is `ceiled`.
5. Round to 1 dp.

**The dynasty prior is steps 1–3 only.** Use `ktcMult = collegeContribution = 1`, then round `ceiled` to 1 dp.
Skip step 4 on every row, QB `chain` rows included.
- `buildRookieDynastyPriors` (app `App.jsx:581-587`) passes no takeover input, so the prior never takes the chain
  branch. CR-25 Mirror: "every rookie QB's dynasty prior is the unchanged ceiled level".
- Steps 1–4 with captured `ktcMult` and `collegeContribution` give the captured `projectedPPG`. That is what the
  307/307 match validates: every factor the prior needs is captured and composes exactly.
- On a `chain` row the KTC-inclusive `projectedPPG` and the dynasty prior differ in kind. The non-QB rookie rows
  (265 / 266) and the non-chain QB rows carry no step 4.

**Verdict.**
- No capture field. A grader derives the prior as neutral `ceiledPPG` from the capture with
  `rookieCapturedLevel` (A3). That function lives in a new `lib/rookieCapturedLevel.mjs`, which imports only
  `lib/projectionFactors.mjs`. `scripts/grade-snapshot.mjs` sits inside `bin/panel.mjs`'s closure (T-RM1 Assert 2),
  so it can import this file but never `lib/rookieMirror.mjs`. A test pins it against both snapshots and the newest
  capture.
- This is a closed form over captured values. It re-reads no input and re-runs no pipeline (Invariant 9's spirit,
  like its points clarification).
- §8 item 2 gives Anton the strict-reading alternative.

---

## 6. Stage A — data repo (sonnet). Six commits, in this order

Every commit runs `npm test` green. Run `npm run smoke` before the last commit. Commit messages end
`(research-arms-w3)`.

**Precondition: the app SHA.** Stage A starts only after D-50 is pushed in both repos.
- Before A2, run `git -C ../sleeper-dashboard pull --rebase` and read the pushed D-50 app commit (`git -C
  ../sleeper-dashboard log -1 --format=%h -- src/utils/inSeasonConstants.js`). Call it `<APP>`.
- Every `@ cbd17c8` in A2/A3 code, comments and the A4 artifact's `prospectPriorKind.shipped` is written as
  `@ <APP>`. `cbd17c8` is the pre-push ID and may be renamed by D-50's push rebase.
- A4 writes an append-only artifact, so `<APP>` must be on `origin/main` (`git -C ../sleeper-dashboard branch -r
  --contains <APP>` is non-empty) before A4 runs.
- Before writing `<APP>`, confirm that `PROSPECT_PRIOR_KIND` and `K_DYN_PROSPECT_A_YE1` at `<APP>` still equal
  §6.2/§6.3's literals.

### 6.0 A0 — task files

Commit `.claude/tasks/research-arms-w3.md`, `research-arms-w3-d13.md` and `research-arms-w3-app.md` as they stand. Message:
`Task files: research-arms-w3 (W3, data + app companion)`.

### 6.1 A1 — D-68 (`grading/anchor-policy.md` only)

In "Veteran rows — boundary 7", replace the whole bullet that starts `- **Cross-check (to be confirmed).**` (four
lines, `:156-159`, ending "as boundaries 5 and 6 were.") with:

```
- **Cross-check — confirmed (D-68).** `snapshots/2026-10-06.json` (21:07:01 UTC, before the 2026-10-07 06:50 UTC push)
  carries the "before" `projectedGames` and `factors.injurySeasons` of all 15 movers in
  `grading/2026-10-06-absence-verdict.md` §5; `snapshots/2026-10-07.json` (21:39:01 UTC, the first capture after the
  push and its purge) carries their "after" values on all 15. Between the two, exactly 35 rows change `projectedGames`
  (the verdict's 35, none rookie-path), 19 change `injurySeasons`, 63 change `absenceShapeFactor`, and one flips
  `isBounceBack` off→on (`4972`, the verdict's one flip). The 2026-10-08 and 2026-10-09 captures hold the same values.
```

Re-measure every number with a scratch script before committing. If any differs, stop and report. Nothing else in
the file changes; the boundary-8 bullet stays "to be confirmed" (D-67).

### 6.2 A2 — D-55 (`lib/inSeasonEvidence.mjs`, `scripts/inseason-dyn-run.mjs`, tests)

1. `lib/inSeasonEvidence.mjs`, beside `PROSPECT_MIRROR`:
   ```js
   // App src/utils/inSeasonConstants.js PROSPECT_PRIOR_KIND @ cbd17c8 (CR-25) — what D-55 compares its rule against.
   export const SHIPPED_PROSPECT_PRIOR_KIND = Object.freeze({
     0: Object.freeze({ QB: 'projection', RB: 'projection', WR: 'projection', TE: 'projection' }),
     1: Object.freeze({ QB: 'projection', RB: 'projection', WR: 'position', TE: 'projection' }),
   });
   ```
2. `augmentRow` (`scripts/inseason-dyn-run.mjs:118`): add `nextPPG2: row.nextPPG2` to `projected`, after
   `nextPPG`. Nothing else in the function changes. The D10 key test (section 9) stays green, because `nextPPG2` is
   not a gamelogs key.
3. New export in `scripts/inseason-dyn-run.mjs`, after `runQ2`:
   `runS2ArmComparison(rows, { kA })`.
   - **Input.** `rows` = the admitted rows (§3). `kA` = `{ 0: kFit, 1: kFit }`. It throws if any row has
     `S > IN_SEASON_DEFAULTS.plus2To`.
   - **Populations.** `admitted` = `rows`; `survivors` = `rows.filter(r => Number.isFinite(r.nextPPG))`.
   - **Cells**, per population: `ALL`, then for each of QB, RB, WR, TE the position and `${pos}|YE0`,
     `${pos}|YE1` (13 cells).
   - **Each cell** carries `{ rows, playerSeasons, players, maePriorA, maePriorB, deltaPrior, maeUpdA, maeUpdB,
     deltaUpd }`.
     - MAE is computed against `nextPPG2`.
     - `deltaPrior = pairedDelta(cellRows, A-prior preds, B-prior preds)`. `deltaUpd` uses
       `blend(prospectPrior, obsPPG, n, kA[ye])` against `blend(projPrior, obsPPG, n, k2a)`.
     - Deltas go through `deltaOut`; MAE through `r4`.
     - An empty cell has `rows: 0` and null everywhere else.
   - **`kind`.** For g ∈ {0, 1} × position: `'position'` iff the admitted `${pos}|YE${g}` `deltaPrior?.label ===
     'WORSE'`; `null` when that `deltaPrior` is null; else `'projection'`.
   - **`flips`.** The cells where `kind` is non-null and differs from `SHIPPED_PROSPECT_PRIOR_KIND`, as
     `{ ye, pos, shipped, measured }`.
   - **Return** `{ rule, kA, populations: { admitted: { cells }, survivors: { cells } }, kind, flips }`.
     `rule` is the sentence in §3 "Rule".
4. In `runInSeasonDyn`, after `runQ1`:
   ```js
   const s2Rows = preFilterRows.filter(r => classifyRow(r).q1 && Number.isFinite(r.nextPPG2));
   const d55 = runS2ArmComparison(s2Rows, { kA: { 0: q1.subgroups.YE0.pooled.A.kFit, 1: q1.subgroups.YE1.pooled.A.kFit } });
   ```
   - Add `d55` to the returned object.
   - Add `constantsFile.prospectPriorKind = { rule: d55.rule, population: 'admitted', kind: d55.kind, flips:
     d55.flips, shipped: 'app src/utils/inSeasonConstants.js PROSPECT_PRIOR_KIND @ cbd17c8' }`. It goes outside
     `decisions`, so D-64's diff is untouched.
5. Verdict markdown: add a `## D-55 — two-season (S+2) arm comparison` section right after the cap-placement block
   (before `...qbResearchMarkdown(result)`). It holds:
   - one paragraph stating the population, the arms and the k (from `d55`);
   - a table `| population | cell | rows | player-seasons | players | MAE prior A → B | Δ prior | MAE updated A → B
     | Δ updated |`, with 26 rows (survivors first);
   - the rule, the measured `kind` per YE, and either `No flip — equals the shipped PROSPECT_PRIOR_KIND.` or
     `**Flip(s) — a recommendation for Anton, not a change:** …`.
   - Δ cells use the existing `dCell` format.
6. Tests, in `test/inseason-dyn.test.mjs` as a new `describe('20: D-55 — S+2 arm comparison')`:
   - (a) **`kind` rule on synthetic rows.**
     - Build ≥ 2 players per cell so the bootstrap runs.
     - A WR|YE1 cell where B's error exceeds A's on every row → `'position'`.
     - A cell where B is better → `'projection'`.
     - An empty cell → `null`, with `flips` excluding it.
     - With WR|YE1 forced to `'projection'`, `flips` equals
       `[{ ye: 1, pos: 'WR', shipped: 'position', measured: 'projection' }]`.
   - (b) A row with S = 2024 throws.
   - (c) **Through `runInSeasonDyn` with `fakeAssemble`.**
     - Give two X-rookie0 YE0 rows a finite `nextPPG2`, one with `nextPPG: null` and one with a finite `nextPPG`.
     - The result has `d55.populations.admitted.cells.ALL.rows === 2` and `survivors…ALL.rows === 1`.
     - `coverage.q1Rows` counts only the survivor. This is the admission that D-55 asks for.
   - (d) `SHIPPED_PROSPECT_PRIOR_KIND` deep-equals the literal above.

### 6.3 A3 — D-56 (`scripts/inseason-dyn-run.mjs`, `lib/inSeasonEvidence.mjs`, `lib/rookieCapturedLevel.mjs` new, tests, README)

**(a) The arm-A ladder.**
1. `lib/inSeasonEvidence.mjs`: add `export const SHIPPED_K_DYN_PROSPECT_A_YE1 = Object.freeze({ QB: 3.5, RB: 3.5,
   WR: 3.5, TE: 3.5 }); // app inSeasonConstants.js:61 @ cbd17c8 (CR-25)`.
2. `runQ1`, inside `if (chooseB)` and only when `g === 1`, after the B ladder:
   ```js
   const armA = twoRungLadder({ rowsPooled, positions: POSITIONS, spec: SPEC_A });
   for (const pos of POSITIONS) writeTwoRungEntry(P, 'K_DYN_PROSPECT_A_YE1', pos, armA.results[pos] ?? { insufficient: true });
   out.d56a = { decisionCell: 'WR', pooled: cellOf(armA.pooled), byPosition: Object.fromEntries(POSITIONS.map(pos => [pos, d56aRow(armA.results[pos], P, pos)])) };
   ```
   - `cellOf(c)` = `{ rows, players, kFit: c.kFit?.k ?? null, ci95: c.ci95 ?? null }`, or `{ rows: 0, players: 0,
     kFit: null, ci95: null }` when `c` is INSUFFICIENT.
   - `d56aRow(res, P, pos)` = `{ source, own, step, chosen, pinnedK }`:
     - `source` is `'own'`, `'pooledFallback'` (own INSUFFICIENT, so the QB row shows `own` as `cellOf` of an
       INSUFFICIENT cell) or `'insufficient'`;
     - `own` = `cellOf(res.own)`;
     - `step` = `res.ladder?.steps?.[0] ?? null`, run through `deltaOut`-style rounding;
     - `chosen` = `res.ladder?.id ?? null`;
     - `pinnedK` = `P.constants.K_DYN_PROSPECT_A_YE1?.[pos]?.k ?? null`.
   - Both helpers are local to `inseason-dyn-run.mjs`.
   - When YE1 picks arm A, the existing `K_DYN_PROSPECT_YE1` branch already covers it, and `out.d56a` is
     `{ skipped: 'YE1 chose arm A' }`.
   - `addFoldK` and `verifyConstants` then cover the new entries unchanged.
3. `runInSeasonDyn`:
   - Return `d56a: q1.d56a ?? null`. This means `runQ1` returns `d56a`, or the spread keeps it; check which.
   - **D-64 must not see the new name.** Compute
     `diffDynConstants({ ...constantsFile, constants: withoutArmA }, baseline)`, where `withoutArmA` is
     `constantsFile.constants` minus `K_DYN_PROSPECT_A_YE1`. The 2026-09-27 baseline predates the name. D-64
     compares the 2c set only, and a comment says so.
4. Verdict: add `## D-56(a) — arm-A k for second-year WRs` after the D-55 section.
   - One sentence: "Pre-registered ladder [YE1 pooled, own position] on arm A against S+1 (app 2c-wiring §9); the
     app routes only WR|YE1 here."
   - A table `| pos | rows | players | own kFit [CI] | own vs pooled | chosen | pinned k | shipped |`, built from
     `result.d56a.byPosition`. A `pooledFallback` row shows `—` for own and "own INSUFFICIENT". A line above the
     table gives the pooled cell (rows, players, kFit [CI]). The shipped value comes from
     `SHIPPED_K_DYN_PROSPECT_A_YE1`.
   - Then either `Equals the shipped pin — an app re-pin to this constants file is provenance only.` or
     `**Differs from the shipped pin — a recommendation for Anton, not a change.**`. That comparison is on WR only.

**(b) The neutral prior from captured factors (new file; `lib/rookieMirror.mjs` is not touched).**
1. New `lib/rookieCapturedLevel.mjs`, pure. It imports only `ROOKIE_MULTIPLIER_CLAMP` from
   `./projectionFactors.mjs`, and it must never import `./rookieMirror.mjs`. `scripts/grade-snapshot.mjs` sits in
   `bin/panel.mjs`'s closure (T-RM1 Assert 2), so this file is how a grader reaches the closed form.
   - **Signature.** `export function rookieCapturedLevel(factors, { neutral = false } = {})`.
   - **Return** `{ projectedPPGPre, ceiledPPG, projectedPPG, dynastyPrior }`:
     - `projectedPPGPre` and `ceiledPPG` are §5 steps 1–3, unrounded;
     - `projectedPPG` is steps 1–4, rounded to 1 dp;
     - `dynastyPrior` is `Math.round(ceiledPPG * 10) / 10` and never takes step 4.
   - **`neutral`** sets `ktcMult` and `collegeContribution` to 1. The dynasty prior is
     `rookieCapturedLevel(f, { neutral: true }).dynastyPrior`.
   - **Ceiling.** Use the captured knee/asymptote. They are already basis-scaled; a null knee means identity.
   - **Null cases.** Return `null` when any of `basePPG`, `ageDelta`, `nflDraftMultiplier`,
     `rookieCalibrationMult` is non-finite. On a `chain` row, `projectedPPG` is `null` when `qbStartShare` is
     non-finite; `dynastyPrior` is unaffected.
   - **Header comment.** "The app's `rookieProjection` level (seasonProjection.js:360-497 @ the app commit A2
     cites), re-composed from a capture's own `projection.factors`. `dynastyPrior` with `neutral` is the app's
     dynasty-side rookie prior (`buildRookieDynastyPriors`: ktcMap/collegeStats null, no takeover input — D-56(b),
     CR-25). Valid for captures whose rookie composition matches the app at that commit. A later CR-15 rookie
     boundary turns `test/rookie-captured-level.test.mjs`'s newest-capture check red."
2. New `test/rookie-captured-level.test.mjs`. For `snapshots/2026-10-10.json`, `snapshots/2026-10-11.json` and
   **the newest `snapshots/*.json` by filename**, over rows whose `projection.factors` has `rookieCalibrationBasis`:
   - (i) the counts are 310 / 307 for the two fixed files; the newest file has ≥ 1 row;
   - (ii) non-neutral `projectedPPG` equals the captured `projection.projectedPPG` on every row;
   - (iii) `|projectedPPGPre − factors.rookieCeilingPPGPre| ≤ 0.0005`;
   - (iv) on rows with `ktcMult === 1 && collegeContribution === 1`, non-neutral `dynastyPrior` equals neutral
     `dynastyPrior`;
   - (v) neutral `dynastyPrior` differs from captured `projectedPPG` on ≥ 1 non-chain row;
   - (vi) on every `chain` row, `dynastyPrior` equals `Math.round(ceiledPPG * 10) / 10`, not `projectedPPG`
     (42 / 44 chain rows);
   - (vii) an import-graph check: `lib/rookieCapturedLevel.mjs`'s relative imports are exactly
     `['./projectionFactors.mjs']`.

   Read the files with `fs` from the repo root. A missing fixed file fails the test; it is never skipped
   (Invariant 5).
3. README → the `--inseason --dynasty` section: append one paragraph:
   > **D-55 / D-56 (research-arms-w3).** `runS2ArmComparison` reports the two-season arm comparison on every Q1
   > row with an S+2 outcome, admitted with or without an S+1 outcome; its `kind` (WORSE → position baseline) is
   > what the app's `PROSPECT_PRIOR_KIND` must equal, recorded as `prospectPriorKind` in the constants file. When
   > YE1 chooses arm B, `runQ1` also runs arm A's two-rung ladder and emits `K_DYN_PROSPECT_A_YE1`, which D-64's
   > diff excludes (its 2026-09-27 baseline predates the name). `lib/rookieCapturedLevel.mjs` re-composes a
   > capture's rookie level from its own factors; its neutral `dynastyPrior` (the ceiled level, never the QB chain)
   > is the app's dynasty-side rookie prior, so no snapshot field carries it. It imports only
   > `lib/projectionFactors.mjs`, so the grader can reach it (`test/rookie-captured-level.test.mjs`).

### 6.4 A4 — the committed re-run (artifacts only)

Run `node bin/backtest.mjs --inseason --dynasty --write`, which writes `backtests/<date>-inseason-dyn-{panel,
constants}.json` and `grading/<date>-inseason-dyn-verdict.md`. The gates below run against the 2026-10-10 artifacts.
If any gate fails, **stop and report**; do not commit.

- **G1.** `diff grading/2026-10-10-inseason-dyn-verdict.md grading/<date>-inseason-dyn-verdict.md`. The only
  differences are:
  - four added `K_DYN_PROSPECT_A_YE1` rows in the constants table;
  - the two new sections.
- **G2.** The constants JSON differs only in:
  - `source` and `generatedAt`;
  - the added `prospectPriorKind`;
  - the added `constants.K_DYN_PROSPECT_A_YE1` and its `fixture` key.

  Check this with a jq/node comparison that deletes those keys first and then requires deep equality.
- **G3.** `d64.equal === true`.
- **G4.** `d55`:
  - the survivors' `ALL` cell is 10,526 rows / 957 player-seasons / 614 players, with Δ prior −0.236
    [−0.428, −0.030], Δ updated +0.007;
  - WR|YE1 is +0.548 [0.245, 0.851] (§1b, to 3 dp);
  - admitted is 11,887 / 1,096 / 731;
  - `flips` is `[]`.
- **G5.** `K_DYN_PROSPECT_A_YE1` is 3.5 in all four cells with basis `pooled`; the WR ladder chose `pooled`.

Message: `D-55/D-56(a): committed --inseason --dynasty re-run — no PROSPECT_PRIOR_KIND flip; K_DYN_PROSPECT_A_YE1 3.5
(research-arms-w3)`.

### 6.5 A5 — D-13 (`lib/rookieTotalPoints.mjs` new, `scripts/rookie-total-run.mjs` new, `bin/backtest.mjs`, tests, README, `CLAUDE.md`, artifacts)

Specified in `research-arms-w3-d13.md` §7.3. Run it, gate it (§7.4 there), and commit code and artifacts together.

### 6.6 Hand-back (Stage A)

Give back:
- the SHAs A0–A5, verified present locally, and the two run dates;
- each gate's result, G1–G5 and D1–D4;
- the D-55 `kind`/`flips`;
- the D-56(a) table;
- the `rookie-captured-level` counts (fixed files and the newest capture);
- §7.4's tables as produced;
- every deviation from this file.

---

## 7. D-13 — the composed rookie total points

Specified in `research-arms-w3-d13.md` (§7.1–§7.5), split out for size. A5 implements it.

---

## 8. Findings for Anton (reported, not acted on)

1. **D-13: rookie season totals run about 20% high for day-3 and undrafted rookies.** Per-game and games are each
   about right; their product is not, because rookies who barely play also score less per game. A ×0.82 total-points
   factor for those two groups beats today's numbers on held-out seasons. It moves only the total-points column and
   whatever reads it. **Pick:** wire it as a small app slice; otherwise leave it and correct the docs (B4 does the
   docs either way).
2. **D-56(b): no new snapshot field.** The dynasty-side rookie prior can be rebuilt exactly from what each capture
   already stores. **Strict alternative:** if Invariant 9 should mean "graders never recompute a prior, even from
   captured factors", add the prior as an additive per-player field (CR-01, app capture change, no score move).
   **Pick:** derive. Every factor it needs is captured, and the composition reproduces 617 of 617 captured rookie rows exactly. The prior itself is the neutral ceiled level, with no QB chain step.
3. **D-55 / D-56(a): nothing moves.** Second-year WRs keep the position-baseline start, and their k stays 3.5.

---

## 9. Cross-repo impact

**No registry edit in W3, and no `Mirror` text changes in this commit set.** The registry is CI-enforced
byte-identical (CR-24), and every addition below is a data-side cache entry or a Mirror sentence update queued for
the next sync. B5 appends them to D-69.

- **CR-25** (`--inseason --dynasty`, prospect prior). Mirror text in force, quoted: "Which `yearsExp` × position
  cells start from the projection (`PROSPECT_PRIOR_KIND`) follows a two-season (S+2) arm comparison on the 2c Q1
  rows — only a WORSE cell keeps the position baseline; a cell flips only on a committed re-run of it. The
  second-year-WR arm-A k are pinned from the 2c panel's pooled YE1 fit (`IN_SEASON_DYN_PANEL_SOURCE`), not from a
  constants file, until the data side emits them."
  - A4 is that committed re-run. It produces no flip.
  - A4 emits `K_DYN_PROSPECT_A_YE1`, equal to the pin. The app keeps its pin until it deliberately re-pins
    (provenance only).
  - Queued for D-69:
    - Data side: `runS2ArmComparison`, `SHIPPED_PROSPECT_PRIOR_KIND`, `SHIPPED_K_DYN_PROSPECT_A_YE1`.
    - Mirror: the last sentence becomes "…are emitted as `K_DYN_PROSPECT_A_YE1` by `--inseason --dynasty` since
      research-arms-w3; the app's pin re-derives from the 2c panel until it re-pins from that file."
- **CR-15** (rookie mirror). Mirror text in force, quoted: "A change to any of the four app-side rookie mechanisms,
  or to their ordering, re-mirrors here; the mirror must never become reachable from the fit path, which
  `test/rookie-mirror.test.mjs`'s import-graph assertion enforces." Also: "The reconstruction still does not compose
  share × level into a rookie `chain` row's `projectedPPG`/`projectedTotalPts`."
  - `lib/rookieTotalPoints.mjs` composes the four mechanisms outside the fit closure.
  - `lib/rookieCapturedLevel.mjs` re-composes them from captured factors. It is deliberately inside the closure
    the grader shares, and it imports no corrected reconstruction, so T-RM1 still holds.
  - Queued for D-69:
    - Data side: `lib/rookieCapturedLevel.mjs` `rookieCapturedLevel`; `lib/rookieTotalPoints.mjs` /
      `scripts/rookie-total-run.mjs` (`bin/backtest.mjs --rookie-total`) composing
      `reconstructShippedRookieProjection`.
    - Mirror: the "still does not compose" sentence gains "(the reconstruction; `rookieCapturedLevel` composes it
      from a capture's own factors, for capture parity only)".
- **CR-25.** `rookieCapturedLevel`'s neutral `dynastyPrior` depends on the Mirror sentences "The app's
  dynasty-side rookie prior holds `ktcMult` and `collegeContribution` at 1.0 to equal the data side's arm-B prior"
  and "`buildRookieDynastyPriors` passes no takeover input, so every rookie QB's dynasty prior is the unchanged
  ceiled level". Queued for D-69 (Data side): `rookieCapturedLevel` as well.
- **CR-01** (snapshots). Mirror text in force, quoted: "Additive `factors` keys (`isTeamChange`/`prevTeam`/`newTeam`/`depthStale`) do **not** bump the version." and "A grader must not score a `qbTakeoverBasis: 'chain'` row's `projectedPPG` against realised PPG per game played — grade it on total points or segment it (`grading/anchor-policy.md` boundary 5)".
  - The new reader, `test/rookie-captured-level.test.mjs`, reads only existing additive rookie `factors` keys.
    Nothing bumps, and the Mirror text is unchanged.
  - Renaming any key in §5's list breaks the derivation, and the test goes red on the newest capture.
  - Queued for D-69 (Data side): `test/rookie-captured-level.test.mjs`, `lib/rookieCapturedLevel.mjs`.
- **Signal registry** (app `docs/signal-registry.md:142`). The "rookie's `next` is not the dynasty prior" cell gains
  the derivation pointer (B3).

---

## 10. Verification (Session 1)

Run implementation-reviewer on A1..A5's diff. Re-run every gate (G1–G5 and D1–D4) from the committed artifacts.
Then run Stage B, review B's diff, and push in the order in the header.

---

## Review record (plan gate, 2026-10-12)

plan-reviewer (full depth) raised 13 flags. Every flag was checked against live source and applied:

1. **HIGH, chain rows.** The dynasty prior is the neutral `ceiledPPG`, with no chain step. Confirmed: app
   `App.jsx:581-587` passes no takeover input. Fixed in §5 and §6.3(b) (`dynastyPrior` field, test (vi)), §8, and
   B3's text.
2. **HIGH, grader reach.** The function moved out of `lib/rookieMirror.mjs` into a new
   `lib/rookieCapturedLevel.mjs`, which imports only `projectionFactors.mjs`, so `grade-snapshot.mjs` can reach it.
3. **HIGH, T-RM14 already exists.** Moot: the test is now `test/rookie-captured-level.test.mjs`, with no T-RM id.
   The header list omitting T-RM14 is pre-existing and out of scope.
4. **MED, D-56(a) table fields.** `d56a.byPosition` now carries `own`/`step`/`chosen`/`pinnedK`/`source`, plus the
   pooled cell.
5. **MED, unpushed app SHA.** Stage A precondition added: D-50 pushed, `<APP>` re-resolved and on origin before
   A2/A4.
6. **MED, Mirror sentences.** The CR-15 "does not compose" sentence amendment and the CR-25 Data-side addition are
   now queued (§9, B5).
7. **MED, CR-01 not quoted.** §9 quotes the governing CR-01 sentences. CR-15/CR-25 quotes are the governing
   sentences, each verified verbatim by the reviewer.
8. **MED, model-boundary drift.** The test re-checks the newest capture, so a later CR-15 rookie boundary goes red.
9. **LOW, signal-registry wording.** Fixed (B3 item 2).
10. **LOW, anchor bullet length.** It is four lines; fixed in A1.
11. **LOW, prune justification.** Fixed; the `lib/backtest.mjs` row mention is declined for byte room.
12. **LOW, owed work in Done.** D-13 stays Open with a status line. D-56's re-pin is tracked in D-69's addition.
13. **LOW, LOSO population.** §7.1 now gives the decision-row figures. B4 uses A5's output.

**Split:** D-13 moved to `research-arms-w3-d13.md` (the main file was 42.8 KB).

## Approval (Anton, 2026-10-12)

- **Plan approved as written**, with the review-record changes.
- **D-56(b): rebuild, no new snapshot field.** §5's derivation via `lib/rookieCapturedLevel.mjs` is the decision.
- **D-13: recommend wiring the ×0.82 day3/undrafted total-points factor.** It is planned as a **separate small
  parent-folder slice after Stage B**, not in W3. W3 still changes no score, and A5 stays research only. B4's D-13
  status line reads "Research done … — Anton approved wiring; separate slice planned after W3" instead of "awaiting
  Anton's wire-or-close call".
- **Precondition met.** D-50 was pushed with its IDs unchanged (app `cbd17c8` on `origin/main`, data `fe324e6`), so
  `<APP>` = `cbd17c8`. Re-check at A2 anyway (§6 precondition).
