# qb-inseason-refit — registry companion

Companion to `qb-inseason-refit.md`. Exact edits for the mirrored span of
`sleeper-dashboard/docs/cross-repo-registry.md` (Stage B; Stage C byte-copies the span to
`sleeper-dashboard-data/cross-repo-registry.md`), the `docs/signal-registry.md` row edit (CR-18's deliverable),
the backlog entry, the line gate, and every touched entry's `Mirror` text verbatim (§M).

Anchors read at app `d627562`. Each `old` string below occurs **exactly once** in the app registry file
(checked in Session 1 with `grep -cF`). Never write a sentinel literal or a `sed` range inside an entry.

## §0 Precondition (Stage B, before editing)

For each `old` string in §A and §B, `grep -cF -- '<old>' <file>` must print `1`. Any `0` or `2`: stop.

Line anchors refreshed in §A.1 were read against live source at `d627562`; Stage B touches none of those
source files (`src/utils/ktcHistory.js`, `src/api/ktc.js`, `src/utils/exportData.js`, `src/utils/nflStats.js`,
`src/utils/seasonProjection.js`), so they stay valid. Re-check with
`grep -n "Coupling note\|tryDataStore)\.\|getCache('data-store/manifest')\|if (!latest) return null" src/utils/ktcHistory.js src/api/ktc.js`
(expect ktcHistory `:4`, `:8`, `:97`; ktc.js `:131`, `:140`), `sed -n 16,25p src/utils/exportData.js`
(the CFBD routing block), `grep -n pass_cmp src/utils/nflStats.js` (`:42`), and
`grep -n "rec_tgt\|rec_air_yd" src/utils/seasonProjection.js` (`:824`, `:825`, `:832`, `:833`).

## §A Registry edits (app file; 19 physical lines change — §D)

### A.1 Anchor refresh (L2 leftovers)

**E04-1 · CR-04 App side.** old: ``(`:4-6`)`` → new: ``(`:4-8`)``
(the ktcHistory.js Coupling note now spans `:4-8`).

**E04-2 · CR-04 App side.** old: ``(`:127-134`)`` → new: ``(`:131-140`)``
(ktc.js: `getCache('data-store/manifest')` `:131` through the enumeration's `if (!latest) return null` `:140`).
`loadKtcHistory:97-131` and the Triggers' `(:97-131)` are still exact — unchanged.

**E04-3 · CR-04 Triggers** (plan gate flag 5). old: ``` the direct `manifest.files` / `lastModified` reads in `src/utils/ktcHistory.js` (`:97-131`) ```
new: ``` the direct `manifest.files` / `lastModified` reads in `src/utils/ktcHistory.js` (`:97-131`) and `src/api/ktc.js` (`:131-140`) ```

**E05-1 · CR-05 App side.**
old: ``` `classifyKey:15-18` (an unlisted producer — routes the `cfbd-players/<year>/<category>` cache key ```
new: ``` `classifyKey:16-25` (an unlisted producer — routes the `cfbd-players-v2/<year>/<category>` cache key (the namespace was bumped once, from `cfbd-players`; the route is built from the namespace constant) ```
(the rest of that parenthetical is unchanged; `collegeMetrics.js:69-124`, `:57-59`, `collegeMatch.js:127-129`,
`normalizeCollegeStats:55`, `pivotStatRows:110`, `computeTeamTotals:128`, `isValidCFBDRows:129` re-checked: exact.)

**E12-1 · CR-12 App side.** old: ``` `src/utils/nflStats.js:28` ``` → new: ``` `src/utils/nflStats.js:42` ```
(`passerRating` `:37`, `:178` re-checked: exact.)

**E13-1 · CR-13 App side.** old: ``` `src/utils/seasonProjection.js:748`/`:756` ``` →
new: ``` `src/utils/seasonProjection.js:824-825`/`:832-833` ```
(the last-season and previous-season `rec_tgt`/`rec_air_yd` reads; `outlookPositionStats.js:51`, `:153`,
`:141` re-checked: exact.)

### A.2 CR-15 · R3-FIT factor-multiplier mirror

**E15-1 · Data side.** old: ``` `REGRESSION_UPSIDE_POSITIONS`) ```
new: ``` `REGRESSION_UPSIDE_POSITIONS`, `DEPTH_MODELS`, `CURRENT_DEPTH_MODEL`, `reconstructDepthFactor`, `pinnedQbChainModels`, `reconstructQbPreseasonShares`) ```

**E15-2 · Data side.**
old: ``` parity-guarded by `test/panel-fit.test.mjs` and `test/step4-mirror.test.mjs`, `lib/rookieMirror.mjs` ( ```
new: ``` parity-guarded by `test/panel-fit.test.mjs`, `test/step4-mirror.test.mjs` and `test/qb-mirror.test.mjs` (boundaries 5 and 6), `lib/qbTakeover.mjs` (`expectedStarts`, `dpCode`, `iqCode` — composed by the start-share mirror; `priorPPG` — its caller's incumbent prior), `lib/rookieMirror.mjs` ( ```

**E15-3 · Data side (same line).** old: ``` `reconstructShippedRookieProjection`, `ROOKIE_CORRECTIONS`) ```
new: ``` `reconstructShippedRookieProjection`, `ROOKIE_CORRECTIONS`, `QB_ROOKIE_STARTER_PPG`, `resolveRookieQbStarterLevel`, `ROOKIE_QB_MODELS`, `CURRENT_ROOKIE_QB_MODEL`) ```

**E15-4 · Data side (same line).** old: ``` into the in-season k-fit prior, on a context built by ```
new: ``` into the in-season k-fit prior — since qb-inseason-refit a QB row's prior is his starter level (QB prior model starter: depth model qb-takeover, and on the rest-of-season horizon the rookie starter level for a first-year QB with draft capital), while `scripts/inseason-dyn-run.mjs` holds the legacy QB prior — on a context built by ```
(Check `grep -cF 'into the in-season k-fit prior, on a context built by'` = 1 at §0.)

**E15-5 · Invariant.** old: ``` and including the absence of a lower games clamp at 8. ```
new: ``` and including the absence of a lower games clamp at 8. The QB depth step is versioned the same way: model `legacy` (order 1/2/3+ → 1.05/0.88/0.68 at every position — every capture before boundary 5) and model `qb-takeover` (a QB at order 1 ×1.05, any other QB ×1.00, the start share applied to a backup's finished level) are both reproduced exactly as factor values — the depth multiplier and the share; the reconstruction does not compose the share into a `chain` row's `projectedPPG`/`projectedTotalPts` (no data-side consumer yet) — and so is the rookie QB starter level (`legacy`: `qbStarterPPG` = the ceiled level; `rookie-qb-level`: the pinned group level for a `yearsExp` 0 QB with known draft capital). ```

**E15-6 · Triggers.** old: ``` `scripts/inseason-run.mjs`, `scripts/inseason-dyn-run.mjs` ```
new: ``` `scripts/inseason-run.mjs`, `scripts/inseason-dyn-run.mjs`, `test/qb-mirror.test.mjs`, `lib/qbTakeover.mjs` ```

**E15-7 · Mirror.** old: ``` Until then the reconstruction applies 0.88/0.68 to post-boundary QB2/QB3 rows the app shares at ≈0.16/≈0.04. Boundary 5 in `grading/anchor-policy.md`; the QB in-season k are stale until re-fitted (CR-25, data backlog D-59). ```
new: ``` Mirrored by qb-inseason-refit (data `<A1>`): depth model `qb-takeover` and `reconstructQbPreseasonShares` over the pinned chain of `backtests/2026-10-03-qb-takeover-constants.json`. `test/qb-mirror.test.mjs` holds it exact against `snapshots/2026-10-04.json` (every veteran QB `depthFactor`; all 54 `chain` shares to 4 dp, with `iq` from S−1 PPG rescored to the capture's league scoring and `rk` read from the capture) and holds `legacy` exact against `snapshots/2026-10-03.json`. Historical rows use the D5 week-1 chart and half-PPR S−1 PPG for `iq` (under half-PPR 2 of the 54 captured shares cross an `iq` cut). Boundary 5 in `grading/anchor-policy.md`. The in-season k-fit's QB prior is the app's: the share-free starter level, except that a first-year QB with draft capital who started his team's first game keeps the ceiled rookie-path level (the app's `original` kind blends from `projectedPPG`) (CR-25). ```

**E15-8 · Mirror (same line).** old: ``` mirror the rookie starter level into `lib/rookieMirror.mjs` as a new model — pre-boundary captures keep the rookie-path level as `qbStarterPPG` — together with the start share it multiplies (D-59); until then the reconstruction has neither. ```
new: ``` mirrored by qb-inseason-refit as model `rookie-qb-level` in `lib/rookieMirror.mjs` (pre-boundary captures keep the rookie-path level as `qbStarterPPG`; `QB_ROOKIE_STARTER_PPG` is held equal to the pinned file's `starterPPG` by `test/qb-mirror.test.mjs`). The reconstruction still does not compose share × level into a rookie `chain` row's `projectedPPG`/`projectedTotalPts`. ```

### A.3 CR-25 · In-season evidence definitions and fitted k

**E25-1 · App side.** old: ``` `src/__fixtures__/inseason-constants-2026-09-26.json` ```
new: ``` `src/__fixtures__/inseason-constants-<RUN_DATE>.json` ```

**E25-2 · Data side.** old: ``` `scripts/inseason-run.mjs` (`runInSeason`, `runArmS`, `enumerateCandidates`, `buildConstants`, `writeInSeasonArtifacts`) ```
new: ``` `scripts/inseason-run.mjs` (`runInSeason`, `runArmS`, `enumerateCandidates`, `buildConstants`, `writeInSeasonArtifacts`, `assembleSeason`, `QB_PRIOR_MODELS`, `writeQ4Pin`, `startsArmRows`) ```

**E25-3 · Invariant.** old: ``` the QB `K_ROS_POINTS*` are applied there unfitted to that definition until a starts-based QB arm is measured (D-59). ```
new: ``` <Q9_CLAUSE> Since qb-inseason-refit the backtest's QB prior is the app's: the share-free starter level (`qbStarterPPG`), except a `yearsExp` 0 QB with capital who was his team's game-1 primary passer (the app's `original` kind), who keeps the ceiled rookie-path level; on the next-season horizon a rookie keeps the ceiled rookie-path level (arm B), the prior `buildProspectLevel` blends. ```

`<Q9_CLAUSE>` — pick by the A2 run's `q9.verdict`, fill from `q9`:
- not `INSUFFICIENT`: ``the QB `K_ROS_POINTS*` are applied there unfitted to that definition; qb-inseason-refit's Q9 measured it (report-only): k <kFit> [<ci95 lo>, <ci95 hi>] on <rows> rows / <players> QBs, held out against the pinned games-played QB k <label> (ΔMAE <mean>), so the pinned QB k stay the games-played fit.``
- `INSUFFICIENT`: ``the QB `K_ROS_POINTS*` are applied there unfitted to that definition; qb-inseason-refit's Q9 measured it and found it INSUFFICIENT (<rows> rows / <players> QBs against the 300-row / 60-player floor).``

**E25-4 · Mirror.** old: ``` (b) it changes a CR-15-mirrored factor (Step 8, QB), so the QB `K_*` are stale until `--inseason` re-runs on the re-mirrored reconstruction (D-59) — a bump is not a re-fit; ```
new: ``` (b) it changes a CR-15-mirrored factor (Step 8, QB) — re-fitted by qb-inseason-refit: `--inseason` on the re-mirrored reconstruction with the QB starter prior (data `<A2>`), re-pinned from `backtests/<RUN_DATE>-inseason-constants.json`; a bump alone is not a re-fit; ```

**E25-5 · Mirror (same line).** old: ``` a prior the QB `K_ROS_POINTS_ROOKIE0`/`K_DYN_POINTS_ROOKIE0` were not fitted on — applied unfitted until D-59's QB re-fit. ```
new: ``` and since qb-inseason-refit `K_ROS_POINTS_ROOKIE0` is fitted on that level, while `K_DYN_POINTS_ROOKIE0` stays fitted on the ceiled rookie-path level — the prior `buildProspectLevel`'s dynasty update blends, and the one the 2c verdict reused it on — so a `yearsExp` 0 QB's `next` record (snapshot-only) still blends a prior that k was not fitted on. `--inseason --dynasty` reuses `assembleSeason` with the legacy QB prior, so the 2c dynasty k stay fitted on legacy QB priors (data backlog D-64). ```

**E25-6 · Triggers** (plan gate flag 4). old: ``` `buildProspectLevel`, `historyRowOf` in `src/utils/inSeasonScoring.js` ```
new: ``` `buildProspectLevel`, `historyRowOf`, `buildScoringPosteriors` (its QB prior choice) in `src/utils/inSeasonScoring.js` ```

### A.4 CR-27 · QB takeover constants

**E27-1 · Data side.** old: ``` `backtests/<date>-qb-rookie-level-constants.json`, `test/qb-rookie-level.test.mjs` ```
new: ``` `backtests/<date>-qb-rookie-level-constants.json`, `test/qb-rookie-level.test.mjs`; the in-season mirrors read both pinned files — `pinnedQbChainModels`/`reconstructQbPreseasonShares` in `lib/projectionFactors.mjs` take `backtests/2026-10-03-qb-takeover-constants.json` (loaded by `scripts/inseason-run.mjs`), and `QB_ROOKIE_STARTER_PPG` in `lib/rookieMirror.mjs` copies `backtests/2026-10-04-qb-rookie-level-constants.json` `starterPPG`, held equal by `test/qb-mirror.test.mjs`; `dpCode` in `lib/qbTakeover.mjs` (the `dp` bin, read by `buildRows` and the share mirror); `loadQbTakeoverConstants` in `scripts/inseason-run.mjs` holds the takeover constants path, and `primaryPassers` also decides the in-season QB prior and Q9 there ```

**E27-2 · Triggers.** old: ``` `scripts/qb-rookie-level-run.mjs`; `test/qb-rookie-level.test.mjs` ```
new: ``` `scripts/qb-rookie-level-run.mjs`; `test/qb-rookie-level.test.mjs`; `pinnedQbChainModels`, `reconstructQbPreseasonShares` in `lib/projectionFactors.mjs`; `QB_ROOKIE_STARTER_PPG` in `lib/rookieMirror.mjs`; `dpCode` in `lib/qbTakeover.mjs`; `loadQbTakeoverConstants` in `scripts/inseason-run.mjs`; `test/qb-mirror.test.mjs` ```

**E27-3 · Mirror.** old: ``` The app applies the level to `qbStarterPPG` only; a `chain` row's `projectedPPG` follows as share × level. ```
new: ``` The app applies the level to `qbStarterPPG` only; a `chain` row's `projectedPPG` follows as share × level. **qb-inseason-refit:** the data side's in-season mirrors pin the same two files — a takeover re-pin also re-points `scripts/inseason-run.mjs`'s constants path, a rookie-level re-pin re-copies `QB_ROOKIE_STARTER_PPG`, and either re-runs `--inseason` (CR-25) before the app re-pins its k; a change to the primary-passer definition now also moves `--inseason` (which rookie QBs take the group level, and Q9). ```

### A.5 CR-09 and CR-16 (data plan gate flag 3)

**E09-1 · CR-09 Mirror.** old: ``` never per-player or per-rookie-season values. ```
new: ``` never per-player or per-rookie-season values. A fourth, `scripts/inseason-run.mjs` (CR-25, qb-inseason-refit), reuses that identification unchanged, behind the same ≥ 99% per-season coverage stop, to tell whether a rookie QB was his team's game-1 primary passer (which prior he takes) and to build the report-only starts arm (Q9); it emits only fitted k and report aggregates, never per-player values, and its points come from season-totals `weeklyPoints`. ```

**E16-1 · CR-16 Data side.** old: ``` `rookieStarterGames` in `lib/qbRookieLevel.mjs` joins `primaryPassers`' era-coded keys to schedule teams for the team-game index and start origin (CR-27) — an unmirrored franchise move drops games silently, caught only by the 0.99 coverage stop ```
new: ``` `rookieStarterGames` in `lib/qbRookieLevel.mjs` joins `primaryPassers`' era-coded keys to schedule teams for the team-game index and start origin (CR-27) — an unmirrored franchise move drops games silently, caught only by the 0.99 coverage stop; `startsArmRows` in `scripts/inseason-run.mjs` and its game-1-primary rule make the same join for the in-season QB prior and Q9 (CR-25), behind the same 0.99 `coverageFor` stop ```

## §B `docs/signal-registry.md` row 95 (QB start share) — CR-18's deliverable

**S95-0 (Coverage cell).** old: ``` | live: current Sleeper `depth_chart_order` + the last completed season's priors | ```
new: ``` | live: current Sleeper `depth_chart_order` + the last completed season's priors; reconstructable 2013+ as a stand-in via the data repo's mirror (D5 week-1 chart) | ```

**S95-1 (Reconstructable cell).** old: ``` what a grader holds is the captured `factors` value | ```
new: ``` what a grader holds is the captured `factors` value; reconstructable offline 2013+ only as a stand-in — the data repo's mirror (`reconstructQbPreseasonShares`, CR-15) rebuilds it from the D5 week-1 chart for in-season backtests, an independent comparison, not a substitute capture | ```

**S95-2 (Current-use cell).** old: ``` (`qbStarterBasis` `'rookie:<group>'`, CR-27) | ```
new: ``` (`qbStarterBasis` `'rookie:<group>'`, CR-27); the data repo's in-season k-fit blends QB rows from the share-free starter level, as the app's posteriors do (qb-inseason-refit, CR-25) | ```

Data side of CR-18: no `data-catalog.md` change (no ingest, no served family or field changes).

## §C Backlog (app `.claude/tasks/data-repo-backlog.md`)

Insert after D-63:

```
### D-64 · Re-fit the 2c dynasty k on the current QB priors
**Found:** qb-inseason-refit.md (data) · **Found by:** data `<A1>` · **Blocking:** no · **Size:** medium — rides on L4/P12c

`--inseason --dynasty` reuses `assembleSeason` with the legacy QB prior (flat 0.88/0.68 QB depth step, no rookie starter level), so the 2c dynasty k and the arm-B comparison still describe the pre-boundary-5 QB model. Re-run it under the starter prior when P12c decides the rookie QB level in the dynasty prior (CR-25), and re-check the K_DYN_POINTS_ROOKIE0 reuse on it.
```

## §D Stage C line gate — the 19 changed physical lines

CR-04 App side, Triggers · CR-09 Mirror · CR-16 Data side · CR-05 App side · CR-12 App side · CR-13 App side · CR-15 Data side, Invariant, Triggers,
Mirror · CR-25 App side, Data side, Invariant, Triggers, Mirror · CR-27 Data side, Triggers, Mirror.
`diff <(sed -n '/^<!-- CR-REGISTRY-BEGIN -->$/,/^<!-- CR-REGISTRY-END -->$/p' ../sleeper-dashboard-data/cross-repo-registry.md) <(sed -n '/^<!-- CR-REGISTRY-BEGIN -->$/,/^<!-- CR-REGISTRY-END -->$/p' docs/cross-repo-registry.md) | grep -c '^>'`
must print `19` before the copy (and the `<` count must be `19`).

## §M Touched entries' Mirror text, verbatim (app registry at `d627562`)

**CR-04 · Manifest contract**

> - **Mirror:** New families are additive and need no app change (the app already keys by path). Renaming or removing `recordCount` / `schemaVersion` / `lastModified` / `inProgress` is breaking and needs both repos. **Renaming the top-level `files` map, or the per-entry `lastModified`, breaks a second app-side reader that `getManifestEntry` does not shield** — `ktcHistory.js` enumerates `Object.keys(manifest.files)` to discover KTC snapshots and compares `lastModified` for cache invalidation (CR-17); it degrades to an empty history with no error. Note the `inProgress` convention split: nflverse families register `inProgress: false` even while the current season mutates; KTC's `inProgress: true` is a legacy current-value marker, not a pattern to propagate (CR-17). **A second `allowInProgress: true` opt-in exists since in-season-app-read.md — `loadCurrentSeasonTotals` (CR-02) — and it is NOT the same situation as KTC's.** KTC's `inProgress: true` is a mislabel: a KTC snapshot is a completed, immutable capture registered with a "current value" flag that is wrong about the file. An in-progress season-totals file genuinely *is* incomplete and genuinely *should* be read while incomplete — that is the entire point of reading it. The convention this Mirror warns against is using `inProgress` to mean "latest"; season-totals uses it to mean "not finished," which is its actual, documented meaning. Do not read this Mirror's "not a pattern to propagate" line as blocking a genuinely-incomplete family from opting in the same way — read it as blocking a *mislabeled* one. A third `allowInProgress: true` opt-in exists since advstats-live-season-column.md — `loadAdvStatsForSeason` (CR-07), the live-season exact-year advstats read; same genuinely-incomplete case as season-totals, so a future `inProgress: true` on the live advstats file would still render.

**CR-05 · CFBD statType keys**

> - **Mirror:** Adding or removing a `statType` must be coordinated — the pivot silently drops unknown types and yields empty columns for missing ones. Renaming one is worse than dropping it: `YDS`/`TD`/`ATT` are read by name in **both** `src/utils/collegeMetrics.js:69-124` (dominator rating, QB college score) **and** `src/api/cfbd.js` `computeTeamTotals:128` (team YDS/TD denominators) — renaming either nulls a rating with no error and no test failure. (Note the name list in `collegeMetrics.js:57-59` is a *comment* recording the confirmed 2023 field names; it is documentation, not a read.) **E2 Phases A/B (2026-09) changed the container and the value type** (long-form rows → a pivoted envelope; `stat` string → number) — that change is complete on both sides as of this entry; a *further* shape change is still both-repos, the same as any statType change.

**CR-12 · `pass_cmp` stat key (QB passer rating) *(reconciliation — new to this repo's list, already tracked by the sibling)***

> - **Mirror:** Preserve `pass_cmp`. Missing `pass_cmp` yields a neutral `efficiencyFactor` (1.0) **and** a null `Cmp%` cell in the NFL-stats table — silent in both, no errors, no schema bump. Stored `pass_rtg` and `cmp_pct` are weekly sums, are **not** consumed by the app (both surfaces recompute from counting stats), and must be preserved as-is rather than "fixed".

**CR-13 · `rec_air_yd` stat key (aDOT diagnostic) *(reconciliation — new to this repo's list, already tracked by the sibling)***

> - **Mirror:** Preserve `rec_air_yd`. Missing → `factors.adot: null` **and** empty AY-share / aDOT cells on the Outlook tab; no errors, no schema bump. Values run ~½ industry aDOT magnitude (likely air yards on completed receptions only) — ranking is preserved, absolute magnitude is not industry-standard; that calibration is the app's concern, not the data repo's. `factors.adot` is capture-only and must not move `projectedPPG`.

**CR-15 · R3-FIT factor-multiplier mirror *(reconciliation — new to this repo's list, already tracked by the sibling)***

> - **Mirror:** Re-mirror the changed constant/gate/branch and **re-fit before any further exponent activation** — otherwise the fit reconstructs a factor the app no longer produces and the committed verdict in `.claude/tasks/r3fit-exponent-harness.md` stops transporting. Which positions a factor is gated to is itself part of the mirror. Note the known parity gap: `shareTrend` and `teamRzShare` have no end-to-end app-ground-truth check until a post-2026-07-18 snapshot is imported. **Nothing app-side fails when this drifts.** **Scope note reversed (D6a, 2026-09-06):** `dynastyScore.js` was previously named in `lib/projectionFactors.mjs` (the comment above `weightedLinearRegressionSlope`) only as a *contrast* and marked deliberately not a trigger; D6a's age port (Step 2) draws `computeEmpiricalAgeCurves` straight out of it, so `dynastyScore.js` is now mirrored and is a trigger like the other eleven app-side modules. The old contrast is still accurate as far as it goes — `weightedLinearRegression`'s copy in that file remains unfloored where the mirrored one floors the denominator at 4 — it just no longer means the whole file is out of scope. A change to any of the four app-side rookie mechanisms, or to their ordering, re-mirrors here; the mirror must never become reachable from the fit path, which `test/rookie-mirror.test.mjs`'s import-graph assertion enforces. **A gate change that captured snapshots already carry is added as a new model, never an overwrite (`7b5b055`, Step 4 up-side):** the retired behaviour stays reproducible for parity against pre-boundary captures and for re-running committed verdicts, the new model becomes the harness default, and the boundary gets a row in `grading/anchor-policy.md`. A mirrored-factor change, or a change to any of the four rookie mechanisms, also stales the in-season k constants fitted by `bin/backtest.mjs --inseason` and `--inseason --dynasty` over this reconstruction (CR-25): re-run it before re-pinning them. **qb-takeover-wiring (a gate change captures carry):** add the QB start share to `lib/projectionFactors.mjs` as a new depth model — legacy flat kept for pre-boundary captures, `qb-takeover` the harness default — never an overwrite. It needs the g = 1 takeover features (depth order, rookie, the incumbent's S−1 PPG over the all-teams median) and the CR-27 chain, and it applies after the comp blend / rookie ceiling, not inside `rawPPG`. Until then the reconstruction applies 0.88/0.68 to post-boundary QB2/QB3 rows the app shares at ≈0.16/≈0.04. Boundary 5 in `grading/anchor-policy.md`; the QB in-season k are stale until re-fitted (CR-25, data backlog D-59). Parity against a post-boundary capture reads that capture's own Sleeper chart (`teamDepthCharts`/`depthChartOrder`); the D5 week-1 chart is only the stand-in for history with no capture. **rookie-qb-starter-level (a value change captures carry):** mirror the rookie starter level into `lib/rookieMirror.mjs` as a new model — pre-boundary captures keep the rookie-path level as `qbStarterPPG` — together with the start share it multiplies (D-59); until then the reconstruction has neither. Boundary 6 in `grading/anchor-policy.md`. No non-`chain` rookie `projectedPPG` moves, so the dynasty arm-B prior (`reconstructShippedRookieProjection` at ktc/college 1.0, no takeover input) and the 2c k are unaffected (CR-25).

**CR-18 · Signal registry rows (`docs/signal-registry.md`) *(new — found by the completeness sweep, absent from both repos)***

> - **Mirror:** This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

**CR-25 · In-season evidence definitions and fitted k *(new — in-season-evidence-2a-backtest.md, 2026-09-26; pinned by in-season-evidence-2b-1)***

> - **Mirror:** An app-side change to any mirrored definition stales every fitted k: mirror the definition into `lib/inSeasonEvidence.mjs` (never into the frozen `PHASE1_K`), re-run `node bin/backtest.mjs --inseason --write`, and re-pin from the new constants file — never hand-edit a `K_*`. The dynasty-side 2c k (`--inseason --dynasty`) also mirror the prospect prior and the SHORT history slot: a change to `POSITION_PRIOR_PPG`, the age or draft multipliers, the completed-season blend, the prospect-path gate, the rookie-draft pick source or `recencyWeightedPPG` re-fits them via `node bin/backtest.mjs --inseason --dynasty --write`. The data side approximates the league's rookie-draft pick from NFL draft order (skill-position rank into a 12-team, 5-round draft) and ages players on 1 September; both are stated in that constants file's `fit`, and neither is an app definition. A data-side change to the fit (grid, loss, rounding, checkpoints, arms, prior, the pin rules in `buildConstants`/`decideOwnVsPooled`/`ladderPick`) writes a new dated constants file; the app keeps its pinned copy until it deliberately re-pins by copying that file byte-for-byte with its data commit SHA, and a re-pin re-checks `PRIOR_MODEL_FROM` (a frozen prior captured before the current model is refused — CR-26). An app-side model change bumps `PRIOR_MODEL_FROM` at once; if it also changes a CR-15-mirrored factor, the k are stale until re-fitted — a bump is not a re-fit. The Q4 NO-GAIN pooled-pin *decision* (own k BEATS pooled out of sample) is taken and tested data-side; the app's provenance test checks only which fixture cell each `k` re-derives from. These k partly compensate for the projection's known optimism (c ≈ 0.80–0.86): correcting that optimism is a re-fit, not a re-pin. The definitions flow app→data and the constants data→app. **Nothing fails in either repo when this drifts** — the app blends with constants fitted under definitions it no longer uses. Later consumers (the rest-of-season posterior grader) extend this entry rather than adding another. Since in-season-evidence-2c-wiring the app applies the 2c verdict's reuse rows (arm B at the 2a rookie k, SHORT-recent at `K_DYN_POINTS_HISTORY`); a data-side run that pins `K_DYN_PROSPECT_B_*` or `K_DYN_POINTS_SHORT_HISTORY` as new constants transports only after a deliberate app re-pin. The app's dynasty-side rookie prior holds `ktcMult` and `collegeContribution` at 1.0 to equal the data side's arm-B prior: porting either into the data reconstruction changes arm B and re-fits these k. Which `yearsExp` × position cells start from the projection (`PROSPECT_PRIOR_KIND`) follows a two-season (S+2) arm comparison on the 2c Q1 rows — only a WORSE cell keeps the position baseline; a cell flips only on a committed re-run of it. The second-year-WR arm-A k are pinned from the 2c panel's pooled YE1 fit (`IN_SEASON_DYN_PANEL_SOURCE`), not from a constants file, until the data side emits them. The no-market cap's placement (starting value only) was chosen on the 2c Q1 cap rows (cap-before BEATS cap-after, pooled −16.3 score points): a change to the cap or its placement re-runs that comparison. **qb-takeover-wiring:** (a) it moves QB backups' `projectedPPG`, so `PRIOR_MODEL_FROM` was bumped; (b) it changes a CR-15-mirrored factor (Step 8, QB), so the QB `K_*` are stale until `--inseason` re-runs on the re-mirrored reconstruction (D-59) — a bump is not a re-fit; (c) the QB ROS posterior for a non-original starter uses n = starts at a k fitted on n = games played, which coincide for the starters that dominate that fit; (d) a rookie QB whose starts trail the preseason chain by more than one game has his prospect prior × 0.90 — the data side's arm-B prior has no such discount, so the 2c rookie k transport only for undiscounted rows. **rookie-qb-starter-level:** (a) it moves rookie QBs' `qbStarterPPG` and rookie `chain` rows' `projectedPPG`, so `PRIOR_MODEL_FROM` was bumped; (b) no CR-25 definition changes and the 2c dynasty k stay valid — `buildRookieDynastyPriors` passes no takeover input, so every rookie QB's dynasty prior is the unchanged ceiled level; (c) a `yearsExp` 0 QB's `next` prior and start-record ROS prior are now the pinned rookie starter level, a prior the QB `K_ROS_POINTS_ROOKIE0`/`K_DYN_POINTS_ROOKIE0` were not fitted on — applied unfitted until D-59's QB re-fit.

**CR-27 · QB takeover constants *(new — qb-takeover-research.md P6a, 2026-10-03; pinned by qb-takeover-wiring)***

> - **Mirror:** A change to any feature definition or bin on either side re-runs `node bin/backtest.mjs --qb-takeover --write` and the app re-pins by byte copy with the data commit SHA — never by hand-editing a coefficient. A re-pin that adopts a feature the app does not build (`bn`, `wk`, `wp`, `dg`, `ps` beyond its current exact build) throws app-side by design: build it first. `incPPG`'s k = 3 is this entry's own constant, not CR-25's. **Transport:** the app's `dp` is Sleeper `depth_chart_order` while the fit used nflverse charts (only measurement: QB depth-1 68.8%, n = 32, a cross-season upper bound on disagreement); the app's primary passer comes from Sleeper weekly rows while the fit used nflverse gamelogs (`attempts + sacksSuffered`); g = 1 is extrapolated (5.1% predicted vs 2.2% raw game-1 rate); a returning original starter reuses the backup-origin `pStay` with `dq = unknown`; the app holds a backup-origin starter's post-demotion codes at d2/unknown; the app's primary passer considers playerMap-`QB` rows only (the fit's `primaryPassers` considers every passer); `rk` is `years_exp === 0` (the fit: `draftYear === S`); live `iq` is a ratio of league-scored points (the fit: half-PPR `weeklyPoints`) — basis cancels to first order in the ratio at every checkpoint, not only g = 1. `QB_SAT_LONGER_*` are app heuristics (PROVISIONAL), not fitted. **Nothing fails in either repo when this drifts.** **Rookie starter level (P12):** a change to the primary-passer definition, the rookie or group definition, the seasons or the estimator re-runs `node bin/backtest.mjs --qb-rookie-level --write`, and the app re-pins by byte copy with the data commit SHA. The values are PPG **when he is the primary passer** — a selected subset for day-2/day-3 rookies — so they are a starter level for ROS = share × level, never a talent estimate. Changing the rookie route's shared `projectedPPG` instead of `qbStarterPPG` alone also moves the dynasty rookie prior (CR-25 re-fit). **Transport (P12b):** the app's `nflDraftPick` is the nflverse overall pick, equal to the fit's within-round pick in round 1, the only round whose pick is read; the app's undrafted is `draftCapitalStatus` (absent from a loaded draft year), the fit's the crosswalk's `undrafted`; rookie is `years_exp === 0` (the fit: `draftYear === S`). The app applies the level to `qbStarterPPG` only; a `chain` row's `projectedPPG` follows as share × level.

**CR-09 · nflverse gamelogs (view-only)**

> - **Mirror:** Shape or floor changes land in both repos together. The per-game `week` and `team` keys are load-bearing beyond display: `resolvePlayerTeam`'s week-grain path matches on `g.week === week` and reads `g.team`, and returns `null` rather than throwing — renaming either key empties every week-grain team join **silently**. Per-game `team` is the **current-franchise** domain in all seasons and is era-remapped app-side (CR-16); do not "fix" it to era-accurate upstream without changing both repos. Per-game rate fields (`racr`/`targetShare`/`airYardsShare`/`wopr`/`pacr`/`passingCpoe`) are single-game values and must never be summed — `passingCpoe` specifically is now also attempt-weighted by a second consumer (`seasonEfficiency.js`'s `CPOE` column), not merely "never summed". `fantasyPoints`/`fantasyPointsPpr` are nflverse default scoring and are never reconciled with `src/utils/fantasyPoints.js` (see CR-14). View-only on both sides — must never feed projection/scoring/grading as per-player values. One sanctioned analytical read: `scripts/inseason-run.mjs` (CR-25) splits season-totals opportunity stats by week from gamelogs, behind a stop that requires ≥ 99% of the skill player-seasons present in gamelogs (gp ≥ 4) to reconcile with season-totals `stats`. It emits only fitted parameters: dimensionless k constants, plus the parameters of the posterior-combination and sort-measure forms built on them. It never emits per-player values. Weekly points there come from season-totals, never from gamelogs `fantasyPoints`. A second sanctioned analytical read, `scripts/qb-takeover-run.mjs` (CR-27), uses only `team` (mapped to era codes with `eraTeam`), `week`, `seasonType`, `attempts` and `sacksSuffered` to identify each team-game's primary passer, behind a stop that requires ≥ 99% of each season's REG team-games to have one; it emits only logistic coefficients and per-pattern trial/event counts, never per-player values, and never reads gamelogs `fantasyPoints`. A third, `scripts/qb-rookie-level-run.mjs` (CR-27), reuses that primary-passer identification unchanged to select rookie QBs' primary games, whose points come from season-totals `weeklyPoints`; it emits only draft-group aggregates (a group-keyed fixture of rookie, game and point sums; any report cell under three rookies is suppressed), never per-player or per-rookie-season values. 2019 was backfilled on 2026-07-03 (5,756 rows across 586 players) and is no longer a gap; the family is complete 2012–2025.

**CR-16 · Era-accurate team-code remap *(reconciliation — was buried in the teamcontext prose)***

> - **Mirror:** A future franchise move (or any change to an existing mapping) updates **both repos in the same change** — and there are **two** mirrored constants here, not one: the era remap *and* the schedule-domain alias (`lib/sleeper.mjs:21` says so in a comment: *"Mirrors the app's `src/utils/nflStats.js` `SCHEDULE_TEAM_ALIAS` exactly"*). A one-sided edit to either produces silently empty joins rather than an error — the team key simply never matches. Note `scripts/update-teamcontext.mjs` is **not** a trigger despite owning the teamcontext ingest: it names `eraTeam` only in a header comment (`:13`) and calls it via `aggregateTeamContext`, so grepping it for the remap finds nothing. **D-1 (2026-08-24) is a new consumer of this composition, not a new mapping** — `aggregateWeeks` joins a single-team row's already-normalized `team` against the nflverse schedule's bye weeks, so a future franchise move that isn't mirrored here silently loses that team's bye inference (degrades to `'X'`, no throw) in addition to the pre-existing teamcontext/schedule join failures this entry already covers.

