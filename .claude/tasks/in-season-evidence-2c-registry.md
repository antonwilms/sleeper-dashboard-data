# In-season evidence — Phase 2c: registry companion (not for Session 2)

Companion to `.claude/tasks/in-season-evidence-2c-dynasty-backtest.md` §9. **Route:** the standard two-session route.
1. After 2c Session 2's commit 1 lands, an app-repo session applies §A and §B to
   `docs/cross-repo-registry.md` and pushes.
2. The same day, a data-repo session copies the app span byte-for-byte into `cross-repo-registry.md`.
   Gate it on the changed-line count in §C, and run
   `REGISTRY_MIRROR=1 node --test test/registry-mirror.test.mjs` plus `node --test test/registry.test.mjs`.

The daily mirror run is red between steps 1 and 2. Never write the sentinel literals or a `sed` range
literal into an entry. The parent-folder route is not used (the precondition set 2026-09-05 is unmet).

The anchors are substrings of the current entry text, checked against this repo's copy on 2026-09-27.
Each one occurs exactly once inside its entry.

## A. CR-25 · In-season evidence definitions and fitted k

1. **App side** — after the field's final text `blended with the pinned \`K_ROS_OPP\``, append:

   `; \`src/utils/dynastyScore.js\` — the prospect prior the dynasty-side 2c k are fitted on (\`POSITION_PRIOR_PPG\`, \`ageMultiplier\`, \`draftMultiplier\`, \`computeProspectScore\`'s completed-season blend \`8 : min(gp, 12)\` and \`normalisePPG\`, its 0.60 KTC share and no-market-signal cap of 35), the prospect-path gate \`isTrueProspect\`, the SHORT history slot (\`recencyWeightedPPG\`'s last qualifying season and \`ageAdjScore\`'s \`currentPPG\`) and the stale-data route (\`seasonsSinceLastQS >= 2\`); \`src/App.jsx\` \`rookieDraftPicks\`, built from \`selectRookieDraft\` in \`src/utils/rookieDraft.js\` (the most recent rookie draft only, so a \`yearsExp\` 1 player carries no pick)`

2. **Data side** — five insertions:
   - after `` `classifyArm` `` (inside the `lib/inSeasonEvidence.mjs` parenthetical) insert
     `` , `prospectPriorPPG`, `ageMultiplier`, `draftMultiplier`, `modelScore`, `dynastyPickProxy`, `historyPriorOf`, `decideOwnVsPooled`, `ladderPick`, `PROSPECT_MIRROR` ``;
   - after `` `writeInSeasonArtifacts`) `` insert
     `` , `scripts/inseason-dyn-run.mjs` (`runInSeasonDyn`, `inSeasonDynMain`, `writeInSeasonDynArtifacts`) ``;
   - replace `` `bin/backtest.mjs --inseason`, `` with `` `bin/backtest.mjs --inseason` and `--inseason --dynasty`, ``;
   - after `` `backtests/<date>-inseason-constants.json` `` insert `` , `backtests/<date>-inseason-dyn-constants.json` ``;
   - between `` `test/inseason.test.mjs` `` and the `.` that follows it (the full stop that ends the list,
     just before the `(\`PHASE1_K\`` note), insert `` , `test/inseason-dyn.test.mjs` ``.

3. **Invariant** — replace `the population routing) equal the app's` with
   `the population routing, and — for the dynasty-side 2c k — the prospect prior and the SHORT history slot) equal the app's`.

4. **Triggers:**
   - app side: before the `  ‖  ` separator, append
     `` , `computeProspectScore`, `POSITION_PRIOR_PPG`, `ageMultiplier`, `draftMultiplier`, `normalisePPG`, `isTrueProspect`, `recencyWeightedPPG`, `ageAdjScore`, `seasonsSinceLastQS` in `src/utils/dynastyScore.js`, `selectRookieDraft` in `src/utils/rookieDraft.js`, `rookieDraftPicks` in `src/App.jsx` ``;
   - data side: after `` `test/inseason.test.mjs` `` (the last trigger), append
     `` , `scripts/inseason-dyn-run.mjs`, `test/inseason-dyn.test.mjs` ``.

5. **Mirror**, two edits:
   - replace `the pin rules in \`buildConstants\`)` with
     `the pin rules in \`buildConstants\`/\`decideOwnVsPooled\`/\`ladderPick\`)`;
   - after the first sentence (it ends `never hand-edit a \`K_*\`.`), insert:

   `The dynasty-side 2c k (\`--inseason --dynasty\`) also mirror the prospect prior and the SHORT history slot: a change to \`POSITION_PRIOR_PPG\`, the age or draft multipliers, the completed-season blend, the prospect-path gate, the rookie-draft pick source or \`recencyWeightedPPG\` re-fits them via \`node bin/backtest.mjs --inseason --dynasty --write\`. The data side approximates the league's rookie-draft pick from NFL draft order (skill-position rank into a 12-team, 5-round draft) and ages players on 1 September; both are stated in that constants file's \`fit\`, and neither is an app definition.`

## B. CR-15 · R3-FIT factor-multiplier mirror (near-side cache only)

1. **Data side** — at the end of the field (after
   `a deliberate consumer of the corrected rookie reconstruction outside \`bin/panel.mjs\`'s closure`), append:

   `; \`scripts/inseason-dyn-run.mjs\` (\`runInSeasonDyn\`, \`bin/backtest.mjs --inseason --dynasty\`) reuses that prior through \`assembleSeason\` and imports \`reconstructAgeCurves\` for the prospect-score peak normaliser`

2. **Triggers**, data side — after `` `scripts/inseason-run.mjs` `` (the last trigger), append `` , `scripts/inseason-dyn-run.mjs` ``.

3. **Mirror** — replace `fitted by \`bin/backtest.mjs --inseason\` over this reconstruction` with
   `fitted by \`bin/backtest.mjs --inseason\` and \`--inseason --dynasty\` over this reconstruction`.

No Invariant change. T-RM1's closure does not include `bin/backtest.mjs`.

## C. Sync gate

The data sync changes exactly the CR-25 lines (App side, Data side, Invariant, Triggers, Mirror) and
the three CR-15 lines (Data side, Triggers, Mirror). That is **8 changed lines** inside the mirrored region, each
one physical line. Anything else in `git diff --stat` means stop.

## D. Findings for Anton (from planning — not actions)

- **Second-year players carry no draft capital in the prospect score.** `selectRookieDraft` reads only
  the most recent rookie draft. Every `yearsExp` 1 player therefore gets the 0.75 "passed over"
  multiplier, and no premium-pick exemption from the cap of 35. 2c measures the cost as a diagnostic;
  a fix is an app decision.
- **SHORT veterans whose last full season is two or more seasons back score "Limited Data"** (15 + 20% of
  KTC percentile). No PPG enters that score, so no in-season k can move them without a routing change.
- **KTC's own in-season responsiveness is unmeasurable today**, because KTC history starts 2026-05-18.

## E. For the later app wiring task (not for 2c Session 2)

- **Arm A:** in the live season, replace `computeProspectScore`'s `prospectPPG` with
  `posteriorOf(prospectPPG, livePPG, n, K)`. The completed-season blend stays inside `prospectPPG`.
  Normalisation, KTC and the cap follow unchanged. YE0/YE1 map to the app's `yearsExp`.
- **Arm B:** swaps the prior itself, so a prospect's score moves at n = 0. That needs Anton's decision
  and a `PRIOR_MODEL_FROM`-style note, because the prospect score is not the projection.
- **Q2 history:** relax `inSeasonLevel`'s `lastQS === mostRecentSeason` gates (`recencyWeightedPPG`,
  `levelPPG`) for SHORT-recent ids only, with the prior = L's PPG. SHORT players are not in the
  current-level peer pool (it requires gp ≥ 8 in the latest season), so their level does not move peers.
- **QB-quality firewall (2b-2):** it already substitutes `dynastyScoreBase` for **every** QB whenever the
  level Map is non-empty. A prospect-QB update must go through the same `inSeasonLevel`-style input, or
  the firewall misses it: `dynastyScoreBase` is computed with `inSeasonLevel = null`, so an update that
  is not keyed on that argument leaks into `computeQBQualityByTeam`.
- The app pins this slice's constants file (or 2a's, on reuse) as a byte copy with its data SHA
  (CR-25 Mirror).
