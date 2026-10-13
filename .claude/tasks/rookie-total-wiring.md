# D-13 wiring — rookie total-points factor, plus the arm-A re-pin and the D-69 registry sync

**Session 1, 2026-10-13 (opus), parent folder.**
- Baselines: app `6b725e6`, data `a492bc4` (item 1, the KTC test fix + Invariant 10, already landed). Both are pushed and clean.
- Source: `../future_plans/in-season-notes-plan.md` → "Sign-off 2026-10-13", item 2.
- Research behind it: `research-arms-w3-d13.md` and `grading/2026-10-11-rookie-total-verdict.md` (data `52d1001`).

**Scoring-affecting.** This slice moves `projectedTotalPts` for some rookies. It does not move `projectedPPG`,
`projectedGames`, the dynasty score or any k.

**Decisions (Anton, 2026-10-13). Do not reopen.**
1. **D1 · Factor.** day-3 ×**0.796**, undrafted ×**0.835**.
   - Positions RB/WR/TE only. Every rookie-path row of those groups gets it, at every `yearsExp`, matching the fit
     population.
   - It applies to a non-`chain` row's `projectedTotalPts` and to nothing else.
   - The values are the verdict's decision-row full-sample multipliers. They are not the 0.82 in the plan file.
2. **D2 · Raw projection only.**
   - The factor scales the season projection, so snapshots record it.
   - `applyInSeasonProjection` is **not** changed. During the season, a rookie with an in-season record still shows
     points so far + in-season PPG × remaining games. That remainder was never measured.
   - The factor becomes visible in the displayed totals once records lapse (the offseason).
3. **D3 · Epoch.** Bump `PRIOR_MODEL_FROM` only. `MODEL_MARKER_FROM` stays `'2026-10-12'`: it is the one-time
   first-markable date (D-50), not a model epoch, and moving it changes no gate outcome.
4. **D4 · Fold-ins.**
   - Re-pin `K_DYN_PROSPECT_A_YE1` from the W3 constants file. The value stays 3.5; only the provenance changes.
   - Apply the D-69 registry sync (W2 and W3 additions) in the same registry edit as this slice's own.
5. **D5 · Tests.** Tests read only fixed, committed files, never the newest `snapshots/` file (data Invariant 10, landed
   in `a492bc4`). Committed `backtests/` analysis files are not scheduler-written and are fine to read.

**Route** (registry route: app applies, data byte-copies; CR-24 is red between the two pushes, same day):
- **Stage A** — app session (sonnet), A1–A4.
- Session 1 verifies Stage A, then **pushes the app**. The push time is boundary 9.
- **Stage B** — data session (sonnet), B1–B4. It needs the push time and the app SHAs.
- Session 1 verifies Stage B and pushes data.

---

## 1. Stage A — app repo (`sleeper-dashboard`). Four commits, in this order

Every commit runs `npm test` green. Commit messages end `(rookie-total-wiring)`.

**First:** run `git -C ../sleeper-dashboard-data pull --rebase` and confirm that `52d1001` and `0370478` are on its
`origin/main`.

### A1 — the factor and the epoch, one commit (`seasonProjection.js`, `inSeasonConstants.js`, fixture, tests, docs)

The factor and the `PRIOR_MODEL_FROM` bump land together, as the bump rule requires. Steps 1–6 cover the factor and
steps 7–9 the epoch (formerly A2).

1. **Fixture.** Byte-copy data `backtests/2026-10-11-rookie-total-panel.json` (15,617 B) to
   `src/__fixtures__/rookie-total-panel-2026-10-11.json`.
2. **Constant and resolver.** In `seasonProjection.js`, directly after `resolveRookieCalibration` (`:241`), add:
   ```js
   // Rookie total-points factor (D-13, rookie-total-wiring). The shipped composition — calibrated PPG × ladder games —
   // overstates realised season totals for day-3 and undrafted RB/WR/TE (low-game players also score less per game).
   // Values: sleeper-dashboard-data backtests/2026-10-11-rookie-total-panel.json loso.decision.<group>.fullSample
   // @ 52d1001 (byte copy src/__fixtures__/rookie-total-panel-2026-10-11.json; rookieTotalConstants.test.js).
   // Applied to projectedTotalPts only, never projectedPPG/projectedGames. Half-PPR fit; dimensionless (D-45).
   export const ROOKIE_TOTAL_FACTOR = Object.freeze({ day3: 0.796, undrafted: 0.835 })
   const ROOKIE_TOTAL_POSITIONS = new Set(['RB', 'WR', 'TE'])
   export function resolveRookieTotalFactor({ position, draftCapitalStatus, nflDraftTier }) {
     if (ROOKIE_TOTAL_POSITIONS.has(position)) {
       if (draftCapitalStatus === 'undrafted') return { rookieTotalFactor: ROOKIE_TOTAL_FACTOR.undrafted, rookieTotalBasis: `undrafted:${position}` }
       if (draftCapitalStatus === 'matched' && DAY3_TIERS.has(nflDraftTier)) return { rookieTotalFactor: ROOKIE_TOTAL_FACTOR.day3, rookieTotalBasis: `day3:${position}` }
     }
     return { rookieTotalFactor: 1, rookieTotalBasis: 'none' }
   }
   ```
3. **Apply it in `rookieProjection`** (the `projectedTotalPts` expression, about `:500`). Call the resolver beside
   `resolveRookieGames`, then change only the non-chain branch:
   `: Math.round(projectedPPG * projectedGames * rookieTotalFactor * 10) / 10`.
   - The `chain` branch is unchanged.
   - Add `rookieTotalFactor` and `rookieTotalBasis` to `factors`, next to `rookieCalibrationBasis`. These are
     rookie-path keys only; the veteran path does not get them.
4. **Summary line.** After the calibration lines, add
   `if (rookieTotalFactor < 1) adjustmentSummary.push('Low-game seasons score less — season total ↓')`.
5. **Tests.**
   - New `src/__tests__/rookieTotalConstants.test.js`:
     - the fixture's sha1 is recorded (compute it once from the copied file);
     - `ROOKIE_TOTAL_FACTOR.day3 === fixture.loso.decision.day3.fullSample`, and the same for undrafted;
     - `fixture.decision.verdict === 'recommend'`, and both `perGroup` values are `'correct'`;
     - `fixture.candidateMultipliers.byGroup` agrees on both groups.
   - `seasonProjection.test.js`:
     - (a) an undrafted RB and a day-3 (r5) WR get the factor, and the expected total is computed from the row's
       own unrounded factors (assert to 1 dp);
     - (b) a day-3 QB, an r1 WR, a day-2 TE and an unknown-capital WR get `rookieTotalFactor: 1`, basis `'none'`;
     - (c) a rookie `chain` QB's total is unchanged;
     - (d) `projectedPPG` and `projectedGames` are identical with and without the factor. Prove it by comparing an
       undrafted RB's output against the same inputs with `ROOKIE_TOTAL_FACTOR` mocked to 1, or by asserting
       `projectedTotalPts / factor ≈ projectedPPG(unrounded) × games`; the comparison is the one that matters.
     - Add the two keys to all three rookie key-set guards: `src/utils/seasonProjection.test.js:93` `ROOKIE_FACTORS_KEYS`;
       its `:1006` `toHaveLength(67)`, which becomes 69; and `src/__tests__/factorsSchema.test.js:88`
       `ROOKIE_FACTORS_KEYS`, whose header comment `:18` changes "67 rookie" to "69 rookie".
     - **An existing total moves:** in `src/__tests__/rookieAvailability.test.js:578`, 'D · the day-3 case', a
       day-3 RB's expected `projectedTotalPts` goes from 33.5 to 26.7 (round(8.377614 × 4 × 0.796 × 10)/10). Update it
       and add a comment naming this slice. Any other existing total assertion that moves is a stop-and-report.
     - Test (d) must not mutate the frozen constant. Compare against the unrounded product instead.
6. **Docs.**
   - `docs/projection.md`:
     - In the Rookie path section, after "Realisation ceiling", add a `### Total-points factor (D-13)` section: what,
       why, the values, scope, provenance, "raw projection only — the in-season display rebuilds totals from
       points so far + in-season PPG × remaining games and does not apply it", and boundary 9.
     - In `:256`'s residual paragraph, replace the mid-paragraph sentence `A per-group total-points multiplier is a
       recommendation, not shipped.` (the two sentences after it stay) with `Since rookie-total-wiring a per-group factor (day-3 0.796, undrafted 0.835,
       RB/WR/TE) corrects it on the raw projection — see "Total-points factor".`
   - `docs/signal-registry.md`: add a row after `:110` (rookie availability), shaped like `:109`:
     `Rookie total-points factor (\`rookieTotalFactor\`, \`rookieTotalBasis\`) | computed factor |
     \`seasonProjection.js\` (\`resolveRookieTotalFactor\`; constants from data \`--rookie-total\`) | captures since
     boundary 9 | <reconstructability wording copied from row :110's own cell, which treats `draftCapitalStatus` as a
     captured live input> | \`projectedTotalPts\` only`. Match the table's column count exactly.

7. **`PRIOR_MODEL_FROM`** becomes the UTC date of the A1 commit + 1 day (`YYYY-MM-DD`). It must be strictly later
   than `'2026-10-11'`.
   - Prepend to its comment chain: "First UTC capture date on the current projection model (rookie-total-wiring,
     the rookie total-points factor — the day after the app commit; before it short-season-wiring…".
   - `MODEL_MARKER_FROM` is **unchanged** (D3).
8. **`priorModelFrom.test.js`.**
   - Add `projectedTotalPts` to the recorded output object (the `outputs[name]` builder) and to every `GOLDEN.outputs`
     entry.
   - Re-record by running the code once.
   - Set `GOLDEN.recordedUnder` to the new date.
   - Append a re-record note: "Re-recorded <date> for the rookie total-points factor (rookie-total-wiring):
     projectedTotalPts joins the record; only rookieRB_undrafted's total moves."
   - **Gate.** First record `projectedTotalPts` for every fixture on the baseline code (`6b725e6`, before any A1 edit),
     then again after.
     - Only `rookieRB_undrafted.projectedTotalPts` may differ.
     - Every `projectedPPG`/`projectedGames`/`qbStarterPPG` must be unchanged.
     - If anything else moves, stop and report.
9. **Docs.** `docs/nav/utils.md:48`: in the bump-trigger list, add "or a rookie `projectedTotalPts`-only factor
   (rookie-total-wiring)" after "the comp blend)". The sentence "bumped in the same commit as any change that moves
   `projectedPPG`/`projectedGames`" gains "/rookie `projectedTotalPts`". Make the same edit to the comment above
   `PRIOR_MODEL_FROM`.

### A2 — the arm-A re-pin (D-56(a); `inSeasonConstants.js`, fixtures, test, docs)

1. **Fixture.** Byte-copy data `backtests/2026-10-11-inseason-dyn-constants.json` (11,058 B) to
   `src/__fixtures__/inseason-dyn-constants-2026-10-11.json`. Delete `src/__fixtures__/inseason-dyn-panel-2026-10-07.json`:
   its only reader is the test replaced below. Grep `src/` first; if anything else reads it, stop and report.
2. **`inSeasonConstants.js`.**
   - Replace `IN_SEASON_DYN_PANEL_SOURCE` with:
     `export const IN_SEASON_DYN_CONSTANTS_SOURCE = { file: 'sleeper-dashboard-data backtests/2026-10-11-inseason-dyn-constants.json', commit: '037047811eae63a522b23de69cb9dcbc8bc2cc4d', generatedAt: '2026-10-11T23:42:13.720Z', fixture: 'src/__fixtures__/inseason-dyn-constants-2026-10-11.json' }`.
   - `K_DYN_PROSPECT_A_YE1` keeps `{ QB: 3.5, RB: 3.5, WR: 3.5, TE: 3.5 }`.
   - Rewrite its comment block (`:50-55`): "Arm-A k: `K_DYN_PROSPECT_A_YE1` from the dynasty constants file
     (research-arms-w3 D-56(a): the pre-registered ladder [YE1 pooled, own position] keeps every position on the
     pooled rung, kFit 3.6 → 3.5), re-derived from that file's fixture by inSeasonConstants.test.js like every other
     K_*. Earlier pins came from the 2c panel (`q1.subgroups.YE1.pooled.A.kFit`), same value."
   - `PROSPECT_PRIOR_KIND` is unchanged. Its comment gains "Equals the committed re-run's `prospectPriorKind.kind`
     (D-55)."
   - Update the header comment `:4` "(except the K_DYN_PROSPECT_A_* family, pinned from the 2c panel fixture — see its
     own comment)" to "(the K_DYN_PROSPECT_A_* family re-derives from the dynasty constants fixture — see its own
     comment)".
3. **`src/__tests__/inSeasonConstants.test.js`.** Replace the `'2c dynasty-side pins (panel fixture)'` describe with
   `'2c dynasty-side pins (dynasty constants fixture)'`:
   - (a) the fixture's sha1, recorded once from the copy; `IN_SEASON_DYN_CONSTANTS_SOURCE.fixture` matches; and
     `.commit` starts with `0370478`;
   - (b) every `K_DYN_PROSPECT_A_YE1[pos]` equals `pin(refit(dynFile.fixture[dynFile.constants.K_DYN_PROSPECT_A_YE1[pos].fixtureKey]))`,
     re-using this file's `refit`/`pin`, so it is re-derived rather than read. Also assert, as the 2a describe does:
     `refit(cell) === entry.kFit`; every `entry.foldK[S] === refit(cell, S)`; and `entry.k === C.K_DYN_PROSPECT_A_YE1[pos]`. The fixture's `fit.kTenths` must
     equal the 2a file's; assert that, so `refit`'s grid is valid;
   - (c) `C.PROSPECT_PRIOR_KIND` deep-equals `dynFile.prospectPriorKind.kind`, with keys stringified as JSON gives
     them;
   - (d) keep the existing PROSPECT_PRIOR_KIND shape test unchanged.
4. **Docs.**
   - `docs/nav/utils.md:48`: replace `IN_SEASON_DYN_PANEL_SOURCE` with `IN_SEASON_DYN_CONSTANTS_SOURCE`, and
     replace "Every `K_*` but the `K_DYN_PROSPECT_A_*` family is re-derived from
     `src/__fixtures__/inseason-constants-2026-10-07.json` by `inSeasonConstants.test.js` (that family, from
     `inseason-dyn-panel-2026-10-07.json`)" with "…(that family, from `inseason-dyn-constants-2026-10-11.json`)".
   - `docs/navigation.md:57`: replace `` `inseason-dyn-panel-2026-10-07.json` (arm-A prospect k) `` with
     `` `inseason-dyn-constants-2026-10-11.json` (arm-A prospect k, prospect-prior kind) ``. Add
     `` `rookie-total-panel-2026-10-11.json` (rookie total-points factor — `rookieTotalConstants.test.js`) `` to the
     same list.
   - `grep -rn "IN_SEASON_DYN_PANEL_SOURCE\|inseason-dyn-panel-2026" src docs CLAUDE.md` afterwards. Only
     `docs/cross-repo-registry.md` may still match, and A3 fixes it.

### A3 — the registry (`docs/cross-repo-registry.md`, the mirrored region only)

Edits go to fields of the entries named. "Append" means add the text at the end of that field's existing text,
preceded by "; " when the field ends without a period and by one space when it ends with one. "Replace" substrings each occur exactly once in the field; assert that before editing.
Never write the region sentinel literals.

**CR-01**
- *Data side*, append. File-then-symbols order matters: `lib/registry.mjs` attributes a symbol to the file span before
  it.
  > since research-arms-w3 `test/rookie-captured-level.test.mjs` and `lib/rookieCapturedLevel.mjs`
  > (`rookieCapturedLevel`, the dynasty-side rookie prior re-composed from a capture, reading rookie
  > `projection.factors` keys `basePPG`, `ageDelta`, `ktcMult`, `collegeContribution`, `nflDraftMultiplier`,
  > `rookieCalibrationMult`, `rookieCeilingKnee`, `rookieCeilingAsymptote`, `qbTakeoverBasis`,
  > `qbStartShare`, `qbStarterPPG`, `qbStarterBasis` of fixed committed captures — renaming any breaks that derivation);
  > `lib/grade.mjs` scores `projectedTotalPts`, which moves at `grading/anchor-policy.md` boundary 9
- *Triggers*: in the data-side half (after `‖`), append `` , `lib/rookieCapturedLevel.mjs`,
  `test/rookie-captured-level.test.mjs` `` to the end of the field.
- *Invariant*, append:
  > **Since rookie-total-wiring (still v3, no bump)** rookie-path `factors` carry `rookieTotalFactor` (0.796 on a
  > day-3 and 0.835 on an undrafted RB/WR/TE, else 1) and `rookieTotalBasis` (`'day3:<pos>'`/`'undrafted:<pos>'`/
  > `'none'`); on a non-`chain` rookie row `projectedTotalPts` = `projectedPPG` × `projectedGames` ×
  > `rookieTotalFactor` (one rounding, on the unrounded PPG); `projectedPPG` and `projectedGames` do not move.
  > Additive only.
- *Mirror*, append:
  > **rookie-total-wiring:** additive keys, no version bump. Rookie `projectedTotalPts` moves at
  > `grading/anchor-policy.md` boundary 9 — segment by `factors.rookieTotalBasis` (absent = pre-boundary capture).

**CR-15**
- *App side*, append:
  > **rookie-total-wiring:** `ROOKIE_TOTAL_FACTOR` + `resolveRookieTotalFactor` in `seasonProjection.js` — the
  > day-3/undrafted RB/WR/TE factor on a non-`chain` rookie row's `projectedTotalPts`, after the games ladder;
  > `projectedPPG`/`projectedGames` untouched
- *Data side*, append:
  > since provenance-records-w2 also `lib/panel.mjs` (`enumerateEntryCohortRows`) and `scripts/panel-run.mjs`
  > (`APP_ROOKIE_GAMES_CELLS`, `APP_RUNG4_POOLED`, `APP_AVAILABILITY_RECONCILE`, `APP_ROOKIE_CEILING` — the D-12/D-14
  > re-derivations); since research-arms-w3 `lib/rookieCapturedLevel.mjs` (`rookieCapturedLevel`, which re-composes
  > a capture's rookie level from its own factors, importing only `lib/projectionFactors.mjs`, so it is safe inside
  > the grader's closure), `lib/rookieTotalPoints.mjs` (`composeRookieRow`) and `scripts/rookie-total-run.mjs`
  > (`runRookieTotal`; `bin/backtest.mjs --rookie-total`), which compose `reconstructShippedRookieProjection` outside
  > `bin/panel.mjs`'s closure; since rookie-total-wiring `lib/rookieMirror.mjs` (`ROOKIE_TOTAL_FACTOR`,
  > `resolveRookieTotalFactor`, `ROOKIE_TOTAL_MODELS`, `CURRENT_ROOKIE_TOTAL_MODEL`), with `--rookie-total` on model
  > `legacy` (the composition its verdict measured)
- *Triggers*: in the data-side half (after `‖`), append `` , `lib/rookieTotalPoints.mjs`,
  `scripts/rookie-total-run.mjs`, `lib/rookieCapturedLevel.mjs`, `test/rookie-captured-level.test.mjs`,
  `test/rookie-total.test.mjs` `` to the end of the field.
- *Mirror*, replace `The reconstruction still does not compose share × level into a rookie \`chain\` row's
  \`projectedPPG\`/\`projectedTotalPts\`.` with `The reconstruction still does not compose share × level into a
  rookie \`chain\` row's \`projectedPPG\`/\`projectedTotalPts\` (\`rookieCapturedLevel\` composes it from a capture's
  own factors, for capture parity only).`
- *Mirror*, append:
  > **rookie-total-wiring (a value change captures carry):** mirrored as model `rookie-total` in
  > `lib/rookieMirror.mjs` (`legacy` reproduces pre-boundary captures and the D-13 verdict). The factor is the D-13
  > verdict's decision-row multiplier (`backtests/2026-10-11-rookie-total-panel.json`, data `52d1001`); a change to
  > the rookie calibration, games ladder or ceiling re-runs `--rookie-total` before the factor is re-pinned.
  > Boundary 9 in `grading/anchor-policy.md`. It moves no `projectedPPG`, so the arm-B prior and every k are
  > unaffected (CR-25).

**CR-25**
- *App side*, replace `the arm-A k pinned by \`Math.round(k*2)/2\` from the 2c panel's
  \`q1.subgroups.YE1.pooled.A.kFit\` (\`IN_SEASON_DYN_PANEL_SOURCE\`) via the fixture
  \`src/__fixtures__/inseason-dyn-panel-2026-10-07.json\`)` with `the arm-A k re-derived from the dynasty constants
  file \`IN_SEASON_DYN_CONSTANTS_SOURCE\` names via the fixture
  \`src/__fixtures__/inseason-dyn-constants-2026-10-11.json\`, whose \`prospectPriorKind.kind\` \`PROSPECT_PRIOR_KIND\`
  must equal)`.
- *Invariant*, replace `— except \`K_DYN_PROSPECT_A_*\`, which equal \`Math.round(kFit*2)/2\` of the matching
  \`yearsExp\` subgroup's pooled arm-A \`kFit\` (\`q1.subgroups.YE<n>.pooled.A.kFit\`) in the panel fixture that
  \`IN_SEASON_DYN_PANEL_SOURCE\` names;` with `— the \`K_DYN_PROSPECT_A_*\` family from the dynasty constants file
  \`IN_SEASON_DYN_CONSTANTS_SOURCE\` names, by the same rule, and \`PROSPECT_PRIOR_KIND\` equals that file's
  \`prospectPriorKind.kind\`;`.
- *Triggers*: replace `` `src/__fixtures__/inseason-dyn-panel-*.json` `` with
  `` `src/__fixtures__/inseason-dyn-constants-*.json` ``.
- *Data side*, append (the field ends with `.)`, so use one space):
  > Since provenance-records-w2, research-arms-w3 and rookie-total-wiring also `lib/inSeasonEvidence.mjs` (`blend`,
  > `SHIPPED_PROSPECT_PRIOR_KIND`, `SHIPPED_K_DYN_PROSPECT_A_YE1`), `scripts/inseason-dyn-run.mjs` (`capStartPPG`,
  > `runS2ArmComparison`, `constantsForD64`) and `lib/rookieCapturedLevel.mjs` (`rookieCapturedLevel` — its neutral
  > prior rests on the ktc/college-1.0 and no-takeover-input sentences of the Mirror).
- *Triggers*: in the data-side half, append `` , `lib/rookieCapturedLevel.mjs` `` (after the replacement above).
- *Mirror*, replace `The second-year-WR arm-A k are pinned from the 2c panel's pooled YE1 fit
  (\`IN_SEASON_DYN_PANEL_SOURCE\`), not from a constants file, until the data side emits them.` with `The second-year-WR
  arm-A k are emitted as \`K_DYN_PROSPECT_A_YE1\` by \`--inseason --dynasty\` (research-arms-w3, data \`0370478\`) and
  re-pinned from that constants file like every other k (rookie-total-wiring).`
- *Mirror*, append:
  > **rookie-total-wiring** bumped `PRIOR_MODEL_FROM` for a rookie `projectedTotalPts`-only change: no `K_*` moves
  > and no re-fit is owed — the fits read `projectedPPG`.

**CR-26** · *Mirror*, append:
> **rookie-total-wiring** bumped `PRIOR_MODEL_FROM` again; the frozen prior reads neither `projectedTotalPts` nor the
> new factor keys — no new consequence. `MODEL_MARKER_FROM` stays the first markable date (D-50); it is not a model
> epoch and does not move with a bump.

**Gates.**
- **Claim check, before committing A3.** From the data repo, run `lib/registry.mjs`'s `extractSymbolFileClaims` +
  `symbolResolvesIn` (as `test/registry.test.mjs:41` does) over the app's **edited** region, against data HEAD.
  The only claims allowed to be unresolved are the four B1 will add: `ROOKIE_TOTAL_FACTOR`, `resolveRookieTotalFactor`,
  `ROOKIE_TOTAL_MODELS`, `CURRENT_ROOKIE_TOTAL_MODEL` in `lib/rookieMirror.mjs`. Any other unresolved claim means
  the text must be reworded first.
- `git diff --stat` shows only `docs/cross-repo-registry.md`.
- Every changed line is inside the mirrored region.
- Record the region's md5 for Stage B.

### A4 — backlog (`.claude/tasks/data-repo-backlog.md`)

1. Move **D-13** to Done with `**✅ RESOLVED <date> by rookie-total-wiring** — app \`<A1>\`: \`ROOKIE_TOTAL_FACTOR\`
   (day-3 0.796, undrafted 0.835, RB/WR/TE) on the raw projection's \`projectedTotalPts\`; \`PRIOR_MODEL_FROM\` bumped
   (same commit); boundary 9 (data Stage B). The two-part model (PPG given a season × probability of playing) is not
   built.`
2. Move **D-69** to Done with `**✅ RESOLVED <date> by rookie-total-wiring** — app \`<A3>\` applied every listed
   addition (W2, W3) plus this slice's own; data byte copy in Stage B. The K_DYN_PROSPECT_A_YE1 re-pin landed in
   \`<A2>\`.`
3. Add an Open entry **D-70 · Confirm anchor-policy boundary 9 on its first capture**.
   - **Found:** rookie-total-wiring. **Blocking:** no. **Size:** small.
   - Body: "The first `snapshots/<date>.json` whose `capturedAt` follows the app push must carry
     `rookieTotalFactor`/`rookieTotalBasis` on every rookie-path row; every row with factor < 1 must be a day-3 or
     undrafted RB/WR/TE whose `projectedTotalPts` equals `round(projectedPPG × projectedGames × factor)` up to
     the PPG rounding (counts per basis); no veteran row may carry the keys. Replace boundary 9's 'to be confirmed',
     as D-62/D-68 did."

Grep the backlog for the highest D-id first; if D-70 is taken, use the next free id. Gate: the `### ` heading count
rises by exactly 1.

### Stage A hand-back

Give back:
- SHAs A1–A4;
- the new `PRIOR_MODEL_FROM`;
- the GOLDEN before/after for `rookieRB_undrafted`;
- the two fixture sha1s;
- the registry region md5;
- `npm test` counts;
- every deviation.

---

## 2. Session 1 between stages

1. Run implementation-reviewer on A1..A4 and apply any fix pass.
2. Smoke-test the app: one rookie card (undrafted WR) shows the summary line, and an offseason-style raw total.
   In-season displayed totals stay unchanged (D2).
3. **Before pushing:** the push's UTC date must be before the new `PRIOR_MODEL_FROM`. If it is not (the review ran
   past midnight UTC), write a fix pass that re-bumps it and re-records `GOLDEN.recordedUnder`.
4. `git pull --rebase` the app, then push. Record the **push UTC time** (`git log -1 --format=%cI` is the commit time,
   not the push time, so take the time from the push output or from `gh api`).
5. **SHAs after the push.** If the rebase renamed any Stage A commit, fix A4's backlog citations in the same push
   session (CLAUDE.md "Cross-repo commit IDs"). Hand Stage B the **pushed** SHAs.
6. Stage B starts the same day.

---

## 3. Stage B — data repo (`sleeper-dashboard-data`). Four commits

Commit messages end `(rookie-total-wiring)`. Inputs from Session 1: the app SHAs and the push time.

### B1 — the mirror (`lib/rookieMirror.mjs`, `lib/rookieTotalPoints.mjs`, `lib/panel.mjs`, tests, README)

1. **New exports in `lib/rookieMirror.mjs`**, beside `ROOKIE_QB_MODELS`:
   - `ROOKIE_TOTAL_FACTOR = { day3: 0.796, undrafted: 0.835 }`;
   - `resolveRookieTotalFactor`, a verbatim port of A1 with the app line anchor in a comment. The day-3 test is
     `draftCapitalStatus === 'matched' && DAY3_TIERS.has(nflDraftTier)`; reuse the file's existing day-3 test.
   - `ROOKIE_TOTAL_MODELS = Object.freeze(['legacy', 'rookie-total'])` and
     `CURRENT_ROOKIE_TOTAL_MODEL = 'rookie-total'`.
   - Use the comment pattern of the QB model: "a value change captures carry is a new model, never an overwrite".
2. **`reconstructShippedRookieProjection`** gains `rookieTotalModel = CURRENT_ROOKIE_TOTAL_MODEL`. It throws on an
   unknown model, using the QB model's message shape.
   - Under `'rookie-total'`, `projectedTotalPts` multiplies by `rookieTotalFactor` inside the one rounding.
   - It returns `rookieTotalFactor` and `rookieTotalBasis` under both models. Under `'legacy'` the factor is still
     resolved and reported, but the total does not use it.
3. **`ROOKIE_CORRECTIONS`** gains `'rookieTotal'`, and `appliedCorrections` pushes it when the model is
   `'rookie-total'` and `rookieTotalFactor < 1`.
   - Update `lib/panel.mjs`'s literal copy and its comment (`:2146` region).
   - T-RM14 ("the two ROOKIE_CORRECTIONS copies agree") must stay green.
   - Update every test that asserts an exact `appliedCorrections` array for a day-3 or undrafted RB/WR/TE row under
     the default model. List them in the hand-back.
4. **Pin pre-boundary consumers to `'legacy'`.**
   - `lib/rookieTotalPoints.mjs` `composeRookieRow` passes `rookieTotalModel: 'legacy'`, with the comment "the
     composition the D-13 verdict measured".
   - `test/rookie-total.test.mjs:25-35` compares `composeRookieRow`, now `legacy`, with
     `reconstructShippedRookieProjection` on an undrafted WR; its `ref` call gains `rookieTotalModel: 'legacy'`.
   - The T-RM9/T-RM10 capture parity (`test/rookie-mirror.test.mjs:548-610`) recomputes totals via
     `applyRookieCeiling` and never calls the reconstruction. Leave it.
   - T-RM3's undrafted-WR exact `appliedCorrections` (`:144`) gains `'rookieTotal'`. This is the one
     `appliedCorrections` assertion expected to change; any other is a stop-and-report.
   - `scripts/inseason-run.mjs` `rookieRecordFor` reads `projectedPPG` only. Leave it, but confirm that.
5. **Tests**, in `test/rookie-mirror.test.mjs`. Do not reuse an existing T-RM id: the header list is incomplete, so
   grep for the highest id. Add `describe('T-RM<next>: rookie total-points factor')`:
   - `ROOKIE_TOTAL_FACTOR` equals `backtests/2026-10-11-rookie-total-panel.json` `loso.decision.<g>.fullSample`
     (a committed, unregistered analysis file — not bot-written);
   - the resolver's cells, positive: day-3 and undrafted RB/WR/TE → 0.796/0.835 with basis `'day3:<pos>'`/
     `'undrafted:<pos>'`;
   - the resolver's cells, negative: day-3 QB, undrafted QB, r1 and day2 → 1, `'none'`; unknown capital → 1;
   - on an undrafted WR, `'rookie-total'`'s total equals `round(ceiledPPG × games × 0.835 × 10)/10` and `'legacy'`'s
     equals `round(ceiledPPG × games × 10)/10`. Compare against the unrounded product; the rounded totals are not in
     exact ratio;
   - `projectedPPG`/`projectedGames` are identical across the two models;
   - an unknown model throws.
6. **Re-run `--rookie-total`** in memory (no `--write`). Set `meta.generatedAt` to the committed value, then check
   that the panel and verdict are identical to the committed 2026-10-11 files.
   - This proves that pinning `legacy` kept the verdict reproducible.
   - It is a hand-back check only, never a test: it reads `nflverse/playerids.json`, which a workflow writes
     (Invariant 10).
   - A mismatch traced to a `playerids.json` change is reported, not fixed.
7. **README.** Add one sentence to the rookie mirror section stating the `rookie-total` model and the `legacy` pin
   for `--rookie-total`.

### B2 — boundary 9 (`grading/anchor-policy.md`)

1. Add a row to the boundaries table:
   `| 9 | \`<A1>\` (the model is live once the push lands; captures check out app \`main\`) | <push time> (the **app
   push**, \`6b725e6..<A4>\`) | rookie (RB/WR/TE, day-3/undrafted) | total-points factor (D-13) |`
2. In "Expected segments — rookie path", add a row:
   `| \`>= first capture after the app push\` | + total-points factor — to be confirmed (D-70): every rookie-path row
   carries \`rookieTotalBasis\`; \`projectedTotalPts\` moves on \`day3:*\`/\`undrafted:*\` rows only |`
3. In "Boundaries by path", add: "Boundary 9 is rookie-only (RB/WR/TE, day-3 and undrafted) and row-detectable through
   `factors.rookieTotalBasis`; it moves `projectedTotalPts` only, so a pooled rookie total-points grade spanning it
   measures the factor, and a PPG or games grade does not see it."
4. In the last paragraph's coverage clause, add "…and boundary 9 as of rookie-total-wiring".
5. Under "Row-level detection is authoritative → Rookie path" (`:26-33`):
   - add the bullet "`factors.rookieTotalBasis` present → the total-points factor is live (boundary 9)";
   - update the sentence counting "none of these three" so it counts four keys.

### B3 — registry byte copy (`cross-repo-registry.md`)

- Copy the app's mirrored region byte-for-byte.
- **Gates:**
  - `REGISTRY_MIRROR=1 node --test test/registry-mirror.test.mjs` is green;
  - the region md5 equals Stage A's;
  - `git diff --stat` shows only `cross-repo-registry.md`.

### B4 — task file

Commit this file with any review and fix-pass sections appended.

### Done-definition and hand-back

- `npm test` and `npm run smoke` are green (data `a492bc4` is green at baseline).
- Hand back:
  - SHAs B1–B4;
  - the list of updated `appliedCorrections` assertions;
  - the in-memory `--rookie-total` byte-identity result;
  - the registry md5;
  - every deviation.

---

## 4. Cross-repo impact

Every quoted Mirror below is the text in force at baseline; §1 A3 gives the full edit set.

- **CR-15.** A change to a rookie mechanism. Quoted: "A change to any of the four app-side rookie mechanisms, or to
  their ordering, re-mirrors here; the mirror must never become reachable from the fit path, which
  `test/rookie-mirror.test.mjs`'s import-graph assertion enforces." Also quoted: "**A gate change that captured
  snapshots already carry is added as a new model, never an overwrite (`7b5b055`, Step 4 up-side):** the retired
  behaviour stays reproducible for parity against pre-boundary captures and for re-running committed verdicts, the
  new model becomes the harness default, and the boundary gets a row in `grading/anchor-policy.md`." B1 and B2 do
  exactly this. The factor is a fifth mechanism. It applies after the games ladder and touches only the total.
- **CR-01.** Additive `factors` keys; no version bump. Quoted: "Additive `factors` keys
  (`isTeamChange`/`prevTeam`/`newTeam`/`depthStale`) do **not** bump the version." `lib/grade.mjs` scores
  `projectedTotalPts`, so a total-points grade must segment at boundary 9 (A3's CR-01 Mirror sentence).
- **CR-25.** The re-pin. Quoted: "the app keeps its pinned copy until it deliberately re-pins by copying that file
  byte-for-byte with its data commit SHA, and a re-pin re-checks `PRIOR_MODEL_FROM`". A2 copies the file and A1
  bumps `PRIOR_MODEL_FROM`. The constants are unchanged, so no re-fit is owed.
- **CR-26.** The epoch bump. Quoted: "A frozen prior pins the projection model: a capture is refused when its
  `projectionModelFrom` differs from the app's `PRIOR_MODEL_FROM` (CR-25) or, unmarked, when it is dated before it".
  The 2026 season is already unfrozen, so there is no new consequence.
- **CR-24.** Registry byte-identity. Between the app push and B3 the daily `registry-mirror` run is red. Keep the
  window same-day.
- **Signal registry.** A1 adds the factor row (CR-18 check).

---

## Review record (plan gate, 2026-10-13)

plan-reviewer (full depth) raised 15 flags. All were checked against live source and applied:

1. **HIGH — A3 Data-side texts would fail data `test/registry.test.mjs`** (file carry-forward misattribution).
   - Rewritten in "file (`symbols`)" form, with a pre-commit claim-check gate.
   - Session 1 simulated the rewritten appends with `extractSymbolFileClaims`/`symbolResolvesIn` at data HEAD: CR-25
     0 unresolved; CR-15 only the four B1 symbols. CR-01 had one more, `rookieCeilingPPGPre` (it is read by the test,
     not by `lib/rookieCapturedLevel.mjs`), which was removed from the list.
2. **MED — three rookie key-set guards** (`seasonProjection.test.js:93`/`:1006` length 67→69, and
   `factorsSchema.test.js:88`/`:18`) are now named in A1.
3. **MED — `rookieAvailability.test.js:578`** day-3 RB total 33.5 → 26.7 is named in A1.
4. **MED — B1.4 pointed at the wrong test.** It now names `rookie-total.test.mjs:25-35` (`ref` → legacy) and T-RM3
   `:144`. T-RM9/10 are left alone.
5. **MED — B1.6 byte-identity** is now judged with `generatedAt` masked, as a hand-back-only check (Invariant 10).
6. **MED — the factor and the epoch were split across commits.** A1 and A2 are merged into one A1. The GOLDEN gate
   records the baseline first.
7. **LOW — push day vs `PRIOR_MODEL_FROM`.** Added a pre-push check in §2.
8. **LOW — rebased SHAs.** §2 hands Stage B the pushed SHAs and fixes A4's citations.
9. **LOW — stale baseline and KTC note.** Baseline is now data `a492bc4`; the done-definition is updated.
10. **LOW — anchor uniqueness and run-on appends.** CR-25 is now an append, and the "; " rule was added.
11. **LOW — `blend` attribution.** It is attributed to `lib/inSeasonEvidence.mjs`; the closure wording is now "safe
    inside".
12. **LOW — Triggers.** CR-01, CR-15 and CR-25 trigger additions were added.
13. **LOW — B2 row-detection bullet and the B1.5 cells.** Positive and negative cells were added, and the totals are
    compared against the unrounded product.
14. **LOW — A2 re-derive strength** (`kFit`, `foldK`, `k`) was added. `ROOKIE_TOTAL_FACTOR` is frozen.
15. **LOW — projection.md "closing" → "mid-paragraph"; the signal-registry wording** now follows row :110.

## Approval (Anton, 2026-10-13)

Plan approved as written, including the review record. Stage A runs as a sonnet agent launched from Session 1.

---

## Stage A verification record (Session 1, 2026-10-13)

Stage A is app `6b725e6..850f122` (A1 `26de86c`, A2 `df3f19a`, A3 `0658d7f`, A4 `850f122`), unpushed.

**implementation-reviewer** (full depth): nothing blocking, no invariant breaks, four LOW flags.
- `npm test`: 2903 tests pass.
- GOLDEN recomputed: 12.5 → 10.4 on `rookieRB_undrafted` only.
- Fixtures byte-identical to the data files at `52d1001` and `0370478`.
- Registry edits exactly as specified. Claim check: only the four B1 symbols unresolved.

**Session 1 smoke** (Colts_420_Reloaded / Dynasty 040, week 6):
- No console errors.
- The local 2026-10-13 capture carries `projectionModelFrom` `2026-10-14`.
- All 308 rookie rows carry `rookieTotalFactor`/`rookieTotalBasis` (day3 88, undrafted 116, none 104); 0 veteran rows
  carry them.
- Every non-chain rookie total lies within the PPG-rounding band of PPG × games × factor.

## Fix pass 1 (Stage A, app repo; four LOW flags; one commit, before the push)

1. **`docs/cross-repo-registry.md`, CR-25 Mirror.** Replace `and the app's panel pin names that run.` (occurs once)
   with: `and the app's panel pin named that run until rookie-total-wiring re-pinned the arm-A k from the dynasty
   constants file (\`backtests/2026-10-11-inseason-dyn-constants.json\`, data \`0370478\`).`
   - Re-run the data claim check over the edited region: still only the four B1 symbols.
   - Record the new region md5.
2. **`.claude/tasks/data-repo-backlog.md`, the D-56 Done entry.** Replace `is owed to the next slice that touches
   \`src/utils/inSeasonConstants.js\` — tracked in D-69's research-arms-w3 addition.` with `landed in rookie-total-wiring
   \`df3f19a\`.`
3. **`src/utils/seasonProjection.test.js` (b).** In the factor-1 loop (`rows.slice(1)`):
   - first assert `r.factors.rookieCeilingBasis === 'none'`;
   - replace the `toBeCloseTo(…, 0)` with
     `expect(r.projectedTotalPts).toBe(Math.round(r.factors.rookieCeilingPPGPre * r.projectedGames * 10) / 10)`.
4. **`src/utils/seasonProjection.test.js` (d).**
   - Replace the `toBeCloseTo(…, 0)` line and its comment with `expect(rb.factors.rookieTotalFactor).toBe(ROOKIE_TOTAL_FACTOR.undrafted)`
     and `expect(rb.projectedTotalPts).toBe(Math.round(ceiledPPG * rb.projectedGames * ROOKIE_TOTAL_FACTOR.undrafted * 10) / 10)`.
     The comment reads "the factor sits inside the one rounding on the unrounded PPG".
   - Import `ROOKIE_TOTAL_FACTOR` if it is not already imported.
   - Keep the `toBeLessThan` line.

**Done-definition.** `npm test` is green. Make one commit: `Fix pass 1: CR-25 Mirror re-pin clause, D-56 backlog
wording, exact total assertions (rookie-total-wiring)`. Do not push.

**Hand back** the SHA, the diff stat, the new region md5 and the claim-check output.

**Fix pass 1 applied** as app `e9414f8`.
- Session 1 read the diff: exactly the four items.
- Claim check re-run by Session 1 with `dataSideText` over all 28 entries: 477 checked, unresolved = only the four
  B1 symbols.
- Region md5 `fe8cd18487c6c030419f7755090d8f3d`.

## App push (Session 1, 2026-10-13) — inputs for Stage B

- **Pushed** `6b725e6..e9414f8` between **2026-10-13T10:51:49Z and 10:51:51Z** (UTC). The rebase was a no-op, so
  every SHA below is final.
- **Pre-push check passed:** the push date 2026-10-13 is before `PRIOR_MODEL_FROM` 2026-10-14.
- **Stage B values.**
  - `<A1>` = `26de86c` (the model commit), `<A4>` = `850f122`; the push range is `6b725e6..e9414f8` (it includes
    fix pass `e9414f8`).
  - `<push time>` = `2026-10-13 10:51` (UTC).
  - The registry md5 to match is `fe8cd18487c6c030419f7755090d8f3d`.
- **CR-24.** `registry-mirror` is red from this push until B3 lands; same day.
