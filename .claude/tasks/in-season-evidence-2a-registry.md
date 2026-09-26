# In-season evidence — Phase 2a: registry edits (companion)

Companion to `.claude/tasks/in-season-evidence-2a-backtest.md` §6. Session 1, 2026-09-26.
**Not for Session 2** — Session 2 edits no registry file.

**Route.** This uses the standing two-session route, not a parent-folder session (Anton's
2026-09-13 decision; the parent folder still has no CLAUDE.md and no review gate).
1. An app-repo session applies §A–§C to `docs/cross-repo-registry.md` in one commit.
2. A data-repo session then copies the mirrored span byte-for-byte into `cross-repo-registry.md`.
   It must also bump CLAUDE.md's "all 24 `CR-NN` entries" to 25 in the same commit, and run
   `REGISTRY_MIRROR=1 node --test test/registry-mirror.test.mjs`.

**Ordering constraint.** Step 2 must land after the backtest slice's commit 1.
`test/registry.test.mjs` resolves the symbol claims below against `scripts/inseason-run.mjs` and
`lib/inSeasonEvidence.mjs`, and those files do not exist until that commit. Step 1 must wait for
it too, because the daily mirror run is red from step 1 until step 2 lands. Land both on the same
day, right after commit 1 is pushed.

**New-coupling route note.** CLAUDE.md routes a brand-new coupling's *draft* through the Claude.ai
project. This slice's brief asks Session 1 to draft it directly, so §C is that draft. It still
takes the normal gate: plan-reviewer on this file, then Anton.

Anchors below were checked unique in the registry on 2026-09-26. Never write the sentinel
literals or a `sed` range inside an entry (CR-24).

---

## §A · CR-15 — three edits

1. **Data side.** Immediately after the text `parity-guarded by \`test/rookie-mirror.test.mjs\``
   (the end of the field), append:

   ```
   ; `scripts/inseason-run.mjs` (`bin/backtest.mjs --inseason`) composes `attachFactorMultipliers`/`predictFullPipeline` and `reconstructShippedRookieProjection` into the in-season k-fit prior, on a context built by `loadFactorInputs`/`buildFactorContext` in `scripts/panel-run.mjs` — a deliberate consumer of the corrected rookie reconstruction outside `bin/panel.mjs`'s closure
   ```

2. **Triggers.** Replace `` `test/rookie-mirror.test.mjs`, `test/step4-mirror.test.mjs` `` (unique,
   the end of the data-side list) with:

   ```
   `test/rookie-mirror.test.mjs`, `test/step4-mirror.test.mjs`, `scripts/inseason-run.mjs`
   ```

3. **Mirror.** Immediately after `and the boundary gets a row in \`grading/anchor-policy.md\`.`
   (the end of the field), append:

   ```
    A mirrored-factor change, or a change to any of the three rookie mechanisms, also stales the in-season k constants fitted by `bin/backtest.mjs --inseason` over this reconstruction (CR-25): re-run it before re-pinning them.
   ```

## §B · CR-09 — three edits

1. **Data side.** Immediately after `` `lib/validate.mjs` `validateGameLogs` `` (the end of the
   field), append:

   ```
   ; read offline (analysis only) by `scripts/inseason-run.mjs` for per-week opportunity/target splits (CR-25)
   ```

   **Triggers.** Immediately after `(the shared stats_player release path; the STATS_BASE tag-switch is what closed the 2019 gap on 2026-07-03)` (unique; the end of the data-side list), append:

   ```
   , `scripts/inseason-run.mjs` (the CR-25 analytical read)
   ```

3. **Mirror.** Replace the sentence `View-only on both sides — must never feed projection/scoring/grading.` with:

   ```
   View-only on both sides — must never feed projection/scoring/grading as per-player values. One sanctioned analytical read: `scripts/inseason-run.mjs` (CR-25) splits season-totals opportunity stats by week from gamelogs, behind a stop that requires ≥ 99% of the skill player-seasons present in gamelogs (gp ≥ 4) to reconcile with season-totals `stats`. It emits only fitted parameters: dimensionless k constants, plus the parameters of the posterior-combination and sort-measure forms built on them. It never emits per-player values. Weekly points there come from season-totals, never from gamelogs `fantasyPoints`.
   ```

**Fallback if Anton rejects §B:** drop §B and add nothing to CR-25 about gamelogs. The backtest
then reports every gamelogs-derived output but pins none of them: the opportunity and share k,
`combination` and `sortMeasure` (task file §6 CR-09).

## §C · CR-25 — new entry (append after CR-24, inside the mirrored region)

```
#### CR-25 · In-season evidence definitions and fitted k *(new — in-season-evidence-2a-backtest.md, 2026-09-26)*
- **App side:** `src/utils/inSeasonEvidence.js` — `opportunitiesPerGame` (the opportunity definition), `MIN_PRIOR_GAMES`, `MIN_BASELINE_GAMES`, `MIN_BASELINE_OPP`, the `hasBaseline`/`extrapolated`/`newRole` rules and the weak/strong band median rule in `buildPriorSeasonContext`/`buildInSeasonPosteriors`, the `blend` n semantics (n = live `gamesPlayed`; n = 0 returns the prior), the new-role sort shrink, and every `K_*` constant; `src/__fixtures__/inseason-constants-*.json` (dated provenance copies of the data repo's constants file, once Phase 2b pins them)
- **Data side:** `lib/inSeasonEvidence.mjs` (`IN_SEASON_DEFAULTS`, `opportunities`, `buildCheckpoints`, `fitK`, `pinK`), `scripts/inseason-run.mjs` (`runInSeason`, `runArmS`, `writeInSeasonArtifacts`), `bin/backtest.mjs --inseason`, `backtests/<date>-inseason-constants.json`, `test/inseason.test.mjs`. (`PHASE1_K` in the same file is a **frozen historical comparator** — Phase 1's shipped values — and is never re-mirrored.)
- **Invariant:** the backtest's evidence definitions (opportunity keys, n = games played, the baseline thresholds, the band rule, the new-role shrink) equal the app's, so the k it fits transport; and, once Phase 2b pins a constants fixture, every app `K_*` constant equals the pinned `k` of the constants file its fixture's `source` names, re-derivable from that fixture's sufficient statistics by the file's own `fit` rule.
- **Direction:** both
- **Triggers:** `src/utils/inSeasonEvidence.js`, `src/__fixtures__/inseason-constants-*.json`  ‖  `lib/inSeasonEvidence.mjs`, `scripts/inseason-run.mjs`, `bin/backtest.mjs`, `test/inseason.test.mjs`
- **Mirror:** An app-side change to any mirrored definition stales every fitted k: mirror the definition into `lib/inSeasonEvidence.mjs` (never into the frozen `PHASE1_K`), re-run `node bin/backtest.mjs --inseason --write`, and re-pin from the new constants file — never hand-edit a `K_*`. A data-side change to the fit (grid, loss, rounding, checkpoints, arms, prior) writes a new dated constants file; the app keeps its pinned copy until it deliberately re-pins by copying that file with its data commit SHA. The definitions flow app→data and the constants data→app. **Nothing fails in either repo when this drifts** — the app blends with constants fitted under definitions it no longer uses. Later consumers (the rest-of-season posterior grader) extend this entry rather than adding another.
```

---

## §D · Findings for Phase 2b (Session 1; moved here from the task file for size)

1. **The dynasty score does not read `projectedPPG`.** `computeDynastyScore` builds its value from
   careerStats season history (gp ≥ 8 seasons, app `src/utils/dynastyScore.js:667-681`). A
   posterior on the projection therefore moves the season projection and its consumers, not the
   dynasty score. Phase 2b must choose how the live season enters the dynasty score.
   `K_DYN_POINTS_HISTORY` (arm R, raw last-season prior) is the measured value for a
   season-history blend. `K_DYN_POINTS` (arm P, projection prior) is the one for a projection
   blend.
2. The projection runs optimistic (D6b). If the backtest's prior-optimism diagnostic moves k
   materially, a calibrated prior and k should change together, not separately.
3. CR-25's app-side list names Phase 1's definitions. If Phase 2b changes any of them (for
   example, adopting Q5's lookback baseline), the constants must come from a backtest run on the
   changed definition. That is CR-25's Mirror applied to Phase 2b itself.
4. **Q7 = FREEZE, so Phase 2b needs a frozen-prior source in the app (Anton, 2026-09-26).**
   The candidate is the permanent pre-kickoff daily snapshot's `players[id].projection.projectedPPG`
   (data `snapshots/<date>.json`, Invariant 5). Facts checked against the store on 2026-09-26, and
   what Phase 2b must decide:
   - **Which snapshot.** Use the last capture dated before the season's week-1 kickoff.
     `nflverse/schedule` carries week numbers but **no game dates**, so kickoff has to come from
     elsewhere, such as Sleeper's NFL state. Captures can skip days: 2026-09-04 and 09-06 are
     missing. The rule must therefore be "latest capture strictly before kickoff", never a fixed
     date.
   - **Scope and basis.** A snapshot is **league-scoped**: `leagueId`, first league of the day
     wins, and about 711 players on 2026-09-09. Its projections are in *that* league's scoring
     (`scoringBasis: "custom"` plus `scoringSettings`). A user viewing a different league would
     get a prior in another league's basis. Either refuse the frozen prior on a `leagueId` or
     scoring mismatch and fall back to live, or rescale it. That is Phase 2b's call. Phase 1's
     basis guard (parent finding 6) is the model to follow.
   - **Absent players.** Some players are missing from the snapshot: signed or promoted after
     capture, or outside that league's player universe. Recommendation: fall back to the live
     projection and mark the row "prior not frozen". For those rows the depth double count is not
     avoided; Q7 measured it at +0.18 PPG on promoted rows.
   - **Off-season.** Before kickoff, n = 0, so posterior = prior. The live projection is used and
     no frozen prior is needed. Between seasons the app's `dataSeason` rolls forward, and the
     frozen prior for the *next* season does not exist until its own pre-kickoff capture. The
     freeze therefore only applies from week 1 onward, and a missing frozen snapshot must degrade
     to the live prior, never to "no posterior".
   - **Cross-repo.** The app does not read `snapshots/` today (CR-01 is app→data). Reading a
     committed snapshot back into the app is a new direction on CR-01, and Phase 2b must emit and
     extend CR-01's Mirror for it. The alternative is an app-side capture, a local copy taken at
     kickoff, which avoids the cross-repo read but loses permanence.
