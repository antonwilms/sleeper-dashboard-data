# qb-rookie-dynasty-research — registry companion

Companion to `qb-rookie-dynasty-research.md` (L4: P12c, D-60, D-64). **Applied by the wiring stage, not by Stage A.**
Route: parent-folder session — the app applies §A to `docs/cross-repo-registry.md` first, then the data repo byte-copies
the span and runs `REGISTRY_MIRROR=1 node --test test/registry-mirror.test.mjs` and `node --test test/registry.test.mjs`,
same day (the daily CR-24 run is red between the two). Bases: app `8f4420e`, data `148f432` — the two registry spans are
byte-identical there (anchored `sed` diff, Session 1, 2026-10-07).

`⟨…⟩` marks a value the wiring Session 1 fills from the Stage A verdict (A2's file name, commit SHAs, decisions). A
sentence whose branch did not happen is dropped, not left in. Never write the sentinel literals or a `sed` range literal
inside an entry.

---

## §A Drafted edits (text the wiring stage applies; plain-English, one clause per fact)

### A.1 CR-09 · nflverse gamelogs (view-only)

- **Data side** — append after "…to find each rookie QB's primary-passer games (CR-27)":
  "; read offline (analysis only) by `scripts/inseason-dyn-run.mjs` through the same `primaryPassers` call and fields,
  behind the same ≥ 99% per-season coverage stop, to count each preseason-backup rookie QB's starts for the sat-longer
  replication (Q5, CR-25/CR-27)".
- **Triggers** (data half, after `scripts/qb-rookie-level-run.mjs (the CR-27 rookie starter-level read)`): add
  "`scripts/inseason-dyn-run.mjs` (the CR-25 sat-longer read)".
- **Mirror** — append: "A fifth, `scripts/inseason-dyn-run.mjs` (CR-25, qb-rookie-dynasty-research), reuses that
  identification unchanged, behind the same coverage stop, to count a preseason-backup rookie QB's starts at each
  checkpoint (the app's sat-longer residual). It emits only aggregates and fitted values — counts, MAE, labels, the
  fitted discount — never per-player, per-rookie-season or per-fold values; any cell under three players is suppressed.
  Its points come from season-totals."

### A.2 CR-16 · Era-accurate team-code remap

- **Data side** — after the `startsArmRows` clause, add: "`scripts/inseason-dyn-run.mjs`'s sat-longer rows (Q5) join the
  same era-coded primaries to the week-1 depth chart's team and its schedule weeks (CR-25), behind the same 0.99
  `coverageFor` stop".

### A.3 CR-25 · In-season evidence definitions and fitted k

- **Data side** — name the new pure helpers next to the existing 2c ones: `satLongerAt`, `fitDiscount`, `discountLoso`,
  `calibrateGroup`, `fullCalibration`, `ratioDiffBootstrap`, `decideQ4`, `decideQ5a`, `decideQ5b`, `diffDynConstants`
  (`lib/inSeasonEvidence.mjs`), and `DYN_2A_PIN` (`scripts/inseason-dyn-run.mjs`).
- **Mirror** — replace the closing sentence "`--inseason --dynasty` reuses `assembleSeason` with the legacy QB prior, so
  the 2c dynasty k stay fitted on legacy QB priors (data backlog D-64)." with:
  "Since qb-rookie-dynasty-research `--inseason --dynasty` runs on the starter QB prior with the k of
  `backtests/2026-10-07-inseason-constants.json` (each QB prior is paired with the 2a file fitted under it, `DYN_2A_PIN`);
  re-run on it, no 2c constant, decision or reuse moved (`⟨A2 constants file⟩` @ `⟨A2 SHA⟩`), and the app's panel pin
  names that run. The same run measured two QB questions on held-out next-season PPG. Rookie QB level in the dynasty
  prior (Q4): `⟨decision sentence: 'the arm-B prior stays the rookie-path level — no draft-group level beat it' | 'not
  QB-specific — every position's arm-B prior sits below survivors' next-season PPG (2c's c), so no QB-only level' | 'a
  yearsExp 0 QB with a draft group starts from ⟨GC|RC|GS⟩'⟩`. Sat-longer discount (Q5, the app's own definition on the
  week-1 chart): `⟨'too few rookies to fit (n = ⟨…⟩ < 20), so 0.90 stays an app heuristic' | 'fitted at ⟨d⟩' | 'no
  discount (1.0)'⟩`. A change to the app's sat-longer rule or band re-runs Q5."
- Also replace item **(d)** of the qb-takeover-wiring sentence ("…has his prospect prior × 0.90 — the data side's arm-B
  prior has no such discount, so the 2c rookie k transport only for undiscounted rows") with: "(d) a rookie QB whose
  starts trail the preseason chain by more than one game has his prospect prior × `⟨discount⟩`; the 2c rookie k were
  fitted on undiscounted rows, and Q5 measured the discount on the app's definition (`⟨decision⟩`)".

### A.4 CR-27 · QB takeover constants

- **Mirror** — replace "`QB_SAT_LONGER_*` are app heuristics (PROVISIONAL), not fitted." with one of:
  "`QB_SAT_LONGER_*` are app heuristics (PROVISIONAL): the data-side replication on the app's definition
  (`--inseason --dynasty` Q5) found too few rookies to fit (`⟨n⟩` < 20)." | "`QB_SAT_LONGER_DISCOUNT` is pinned from
  `--inseason --dynasty` Q5 (`qbSatLonger.discount`); `QB_SAT_LONGER_BAND` stays the app's rule and is mirrored data-side
  in `QB_DYN_RESEARCH`." In both cases append: "A change to either constant, or to the sat-longer residual's definition,
  re-runs Q5."
- **Data side** — add "`scripts/inseason-dyn-run.mjs` reads `backtests/2026-10-04-qb-rookie-level-constants.json` (`starterPPG`)
  as Q4's GS arm, and mirrors `QB_SAT_LONGER_BAND`/`QB_SAT_LONGER_DISCOUNT` in `lib/inSeasonEvidence.mjs` `QB_DYN_RESEARCH`".
- **Triggers** (data half): add `QB_DYN_RESEARCH` in `lib/inSeasonEvidence.mjs`.

### A.6 CR-08 · nflverse schedule (plan gate flag 10)

- **Data side** — after the `scripts/qb-rookie-level-run.mjs` (`coverageFor`, CR-27) clause, add: "; and
  `scripts/inseason-dyn-run.mjs` (`coverageFor` over `gameType`/`homeTeam`/`awayTeam`/`week` for the sat-longer
  replication's coverage stop, CR-25; its team-game index reuses `makeScheduleIndex`)".
- **Triggers** (data half): add `scripts/inseason-dyn-run.mjs` (the CR-25 sat-longer coverage read).

### A.7 CR-15 · R3-FIT factor-multiplier mirror (plan gate flag 9 — W0, always)

- **Data side** — replace "while `scripts/inseason-dyn-run.mjs` holds the legacy QB prior" with "and
  `scripts/inseason-dyn-run.mjs` uses the same starter prior (qb-rookie-dynasty-research; `legacy` kept for re-running
  2026-09-27)"; after "…imports `reconstructAgeCurves` for the prospect-score peak normaliser" add "and, for Q4/Q5, calls
  `reconstructQbPreseasonShares` on the week-1 chart and `rookiePriorFor` for QB/RB/WR/TE rookies".
- **Mirror** — append: "Since qb-rookie-dynasty-research `--inseason --dynasty` also runs on the starter QB prior, so a
  change to the QB start share or the rookie QB level re-runs it too."

### A.5 Wiring-only edits (only on the branch that happens)

- Q4 adopted: CR-25 App side names the new prior input to `buildRookieDynastyPriors`; CR-15 only if `projectedPPG` follows.
- Q5 `fitted`/`drop`: CR-27 App side names the new pinned source of `QB_SAT_LONGER_DISCOUNT`.

The wiring Session 1 counts the changed physical lines into a §D gate for the data byte copy, as L3's companion did.

---

## §B Backlog (app `.claude/tasks/data-repo-backlog.md`, wiring stage)

- **D-64** → resolved: cite A1/A2 SHAs; "re-run on the starter QB prior and the 2026-10-07 k: no 2c constant moved".
- **D-60** → resolved with Q5's decision, or re-scoped if Q5b says `extend`.
- **New** (only if Q4 = `keep-not-qb-specific`): the position-wide arm-B survivor pessimism (2c's c 1.16–1.32) — a re-fit of
  every rookie k, sized medium, not blocking.

---

## §M Touched entries' `Mirror` text, verbatim (app `docs/cross-repo-registry.md` at `8f4420e`)

Copied by script from the app registry (lines 117, 173, 276, 292; CR-08 :109 and CR-15 :165 appended after the plan gate); the data copy is byte-identical.

### CR-09

- **Mirror:** Shape or floor changes land in both repos together. The per-game `week` and `team` keys are load-bearing beyond display: `resolvePlayerTeam`'s week-grain path matches on `g.week === week` and reads `g.team`, and returns `null` rather than throwing — renaming either key empties every week-grain team join **silently**. Per-game `team` is the **current-franchise** domain in all seasons and is era-remapped app-side (CR-16); do not "fix" it to era-accurate upstream without changing both repos. Per-game rate fields (`racr`/`targetShare`/`airYardsShare`/`wopr`/`pacr`/`passingCpoe`) are single-game values and must never be summed — `passingCpoe` specifically is now also attempt-weighted by a second consumer (`seasonEfficiency.js`'s `CPOE` column), not merely "never summed". `fantasyPoints`/`fantasyPointsPpr` are nflverse default scoring and are never reconciled with `src/utils/fantasyPoints.js` (see CR-14). View-only on both sides — must never feed projection/scoring/grading as per-player values. One sanctioned analytical read: `scripts/inseason-run.mjs` (CR-25) splits season-totals opportunity stats by week from gamelogs, behind a stop that requires ≥ 99% of the skill player-seasons present in gamelogs (gp ≥ 4) to reconcile with season-totals `stats`. It emits only fitted parameters: dimensionless k constants, plus the parameters of the posterior-combination and sort-measure forms built on them. It never emits per-player values. Weekly points there come from season-totals, never from gamelogs `fantasyPoints`. A second sanctioned analytical read, `scripts/qb-takeover-run.mjs` (CR-27), uses only `team` (mapped to era codes with `eraTeam`), `week`, `seasonType`, `attempts` and `sacksSuffered` to identify each team-game's primary passer, behind a stop that requires ≥ 99% of each season's REG team-games to have one; it emits only logistic coefficients and per-pattern trial/event counts, never per-player values, and never reads gamelogs `fantasyPoints`. A third, `scripts/qb-rookie-level-run.mjs` (CR-27), reuses that primary-passer identification unchanged to select rookie QBs' primary games, whose points come from season-totals `weeklyPoints`; it emits only draft-group aggregates (a group-keyed fixture of rookie, game and point sums; any report cell under three rookies is suppressed), never per-player or per-rookie-season values. A fourth, `scripts/inseason-run.mjs` (CR-25, qb-inseason-refit), reuses that identification unchanged, behind the same ≥ 99% per-season coverage stop, to tell whether a rookie QB was his team's game-1 primary passer (which prior he takes) and to build the report-only starts arm (Q9); it emits only fitted k and report aggregates, never per-player values, and its points come from season-totals `weeklyPoints`. 2019 was backfilled on 2026-07-03 (5,756 rows across 586 players) and is no longer a gap; the family is complete 2012–2025.

### CR-16

- **Mirror:** A future franchise move (or any change to an existing mapping) updates **both repos in the same change** — and there are **two** mirrored constants here, not one: the era remap *and* the schedule-domain alias (`lib/sleeper.mjs:21` says so in a comment: *"Mirrors the app's `src/utils/nflStats.js` `SCHEDULE_TEAM_ALIAS` exactly"*). A one-sided edit to either produces silently empty joins rather than an error — the team key simply never matches. Note `scripts/update-teamcontext.mjs` is **not** a trigger despite owning the teamcontext ingest: it names `eraTeam` only in a header comment (`:13`) and calls it via `aggregateTeamContext`, so grepping it for the remap finds nothing. **D-1 (2026-08-24) is a new consumer of this composition, not a new mapping** — `aggregateWeeks` joins a single-team row's already-normalized `team` against the nflverse schedule's bye weeks, so a future franchise move that isn't mirrored here silently loses that team's bye inference (degrades to `'X'`, no throw) in addition to the pre-existing teamcontext/schedule join failures this entry already covers.

### CR-25

- **Mirror:** An app-side change to any mirrored definition stales every fitted k: mirror the definition into `lib/inSeasonEvidence.mjs` (never into the frozen `PHASE1_K`), re-run `node bin/backtest.mjs --inseason --write`, and re-pin from the new constants file — never hand-edit a `K_*`. The dynasty-side 2c k (`--inseason --dynasty`) also mirror the prospect prior and the SHORT history slot: a change to `POSITION_PRIOR_PPG`, the age or draft multipliers, the completed-season blend, the prospect-path gate, the rookie-draft pick source or `recencyWeightedPPG` re-fits them via `node bin/backtest.mjs --inseason --dynasty --write`. The data side approximates the league's rookie-draft pick from NFL draft order (skill-position rank into a 12-team, 5-round draft) and ages players on 1 September; both are stated in that constants file's `fit`, and neither is an app definition. A data-side change to the fit (grid, loss, rounding, checkpoints, arms, prior, the pin rules in `buildConstants`/`decideOwnVsPooled`/`ladderPick`) writes a new dated constants file; the app keeps its pinned copy until it deliberately re-pins by copying that file byte-for-byte with its data commit SHA, and a re-pin re-checks `PRIOR_MODEL_FROM` (a frozen prior captured before the current model is refused — CR-26). An app-side model change bumps `PRIOR_MODEL_FROM` at once; if it also changes a CR-15-mirrored factor, the k are stale until re-fitted — a bump is not a re-fit. The Q4 NO-GAIN pooled-pin *decision* (own k BEATS pooled out of sample) is taken and tested data-side; the app's provenance test checks only which fixture cell each `k` re-derives from. These k partly compensate for the projection's known optimism (c ≈ 0.80–0.86): correcting that optimism is a re-fit, not a re-pin. The definitions flow app→data and the constants data→app. **Nothing fails in either repo when this drifts** — the app blends with constants fitted under definitions it no longer uses. Later consumers (the rest-of-season posterior grader) extend this entry rather than adding another. Since in-season-evidence-2c-wiring the app applies the 2c verdict's reuse rows (arm B at the 2a rookie k, SHORT-recent at `K_DYN_POINTS_HISTORY`); a data-side run that pins `K_DYN_PROSPECT_B_*` or `K_DYN_POINTS_SHORT_HISTORY` as new constants transports only after a deliberate app re-pin. The app's dynasty-side rookie prior holds `ktcMult` and `collegeContribution` at 1.0 to equal the data side's arm-B prior: porting either into the data reconstruction changes arm B and re-fits these k. Which `yearsExp` × position cells start from the projection (`PROSPECT_PRIOR_KIND`) follows a two-season (S+2) arm comparison on the 2c Q1 rows — only a WORSE cell keeps the position baseline; a cell flips only on a committed re-run of it. The second-year-WR arm-A k are pinned from the 2c panel's pooled YE1 fit (`IN_SEASON_DYN_PANEL_SOURCE`), not from a constants file, until the data side emits them. The no-market cap's placement (starting value only) was chosen on the 2c Q1 cap rows (cap-before BEATS cap-after, pooled −16.3 score points): a change to the cap or its placement re-runs that comparison. **qb-takeover-wiring:** (a) it moves QB backups' `projectedPPG`, so `PRIOR_MODEL_FROM` was bumped; (b) it changes a CR-15-mirrored factor (Step 8, QB) — re-fitted by qb-inseason-refit: `--inseason` on the re-mirrored reconstruction with the QB starter prior (data `f2c3b83`), re-pinned from `backtests/2026-10-07-inseason-constants.json`; a bump alone is not a re-fit; (c) the QB ROS posterior for a non-original starter uses n = starts at a k fitted on n = games played, which coincide for the starters that dominate that fit; (d) a rookie QB whose starts trail the preseason chain by more than one game has his prospect prior × 0.90 — the data side's arm-B prior has no such discount, so the 2c rookie k transport only for undiscounted rows. **rookie-qb-starter-level:** (a) it moves rookie QBs' `qbStarterPPG` and rookie `chain` rows' `projectedPPG`, so `PRIOR_MODEL_FROM` was bumped; (b) no CR-25 definition changes and the 2c dynasty k stay valid — `buildRookieDynastyPriors` passes no takeover input, so every rookie QB's dynasty prior is the unchanged ceiled level; (c) a `yearsExp` 0 QB's `next` prior and start-record ROS prior are now the pinned rookie starter level, and since qb-inseason-refit `K_ROS_POINTS_ROOKIE0` is fitted on that level, while `K_DYN_POINTS_ROOKIE0` stays fitted on the ceiled rookie-path level — the prior `buildProspectLevel`'s dynasty update blends, and the one the 2c verdict reused it on — so a `yearsExp` 0 QB's `next` record (snapshot-only) still blends a prior that k was not fitted on. `--inseason --dynasty` reuses `assembleSeason` with the legacy QB prior, so the 2c dynasty k stay fitted on legacy QB priors (data backlog D-64).

### CR-27

- **Mirror:** A change to any feature definition or bin on either side re-runs `node bin/backtest.mjs --qb-takeover --write` and the app re-pins by byte copy with the data commit SHA — never by hand-editing a coefficient. A re-pin that adopts a feature the app does not build (`bn`, `wk`, `wp`, `dg`, `ps` beyond its current exact build) throws app-side by design: build it first. `incPPG`'s k = 3 is this entry's own constant, not CR-25's. **Transport:** the app's `dp` is Sleeper `depth_chart_order` while the fit used nflverse charts (only measurement: QB depth-1 68.8%, n = 32, a cross-season upper bound on disagreement); the app's primary passer comes from Sleeper weekly rows while the fit used nflverse gamelogs (`attempts + sacksSuffered`); g = 1 is extrapolated (5.1% predicted vs 2.2% raw game-1 rate); a returning original starter reuses the backup-origin `pStay` with `dq = unknown`; the app holds a backup-origin starter's post-demotion codes at d2/unknown; the app's primary passer considers playerMap-`QB` rows only (the fit's `primaryPassers` considers every passer); `rk` is `years_exp === 0` (the fit: `draftYear === S`); live `iq` is a ratio of league-scored points (the fit: half-PPR `weeklyPoints`) — basis cancels to first order in the ratio at every checkpoint, not only g = 1. `QB_SAT_LONGER_*` are app heuristics (PROVISIONAL), not fitted. **Nothing fails in either repo when this drifts.** **Rookie starter level (P12):** a change to the primary-passer definition, the rookie or group definition, the seasons or the estimator re-runs `node bin/backtest.mjs --qb-rookie-level --write`, and the app re-pins by byte copy with the data commit SHA. The values are PPG **when he is the primary passer** — a selected subset for day-2/day-3 rookies — so they are a starter level for ROS = share × level, never a talent estimate. Changing the rookie route's shared `projectedPPG` instead of `qbStarterPPG` alone also moves the dynasty rookie prior (CR-25 re-fit). **Transport (P12b):** the app's `nflDraftPick` is the nflverse overall pick, equal to the fit's within-round pick in round 1, the only round whose pick is read; the app's undrafted is `draftCapitalStatus` (absent from a loaded draft year), the fit's the crosswalk's `undrafted`; rookie is `years_exp === 0` (the fit: `draftYear === S`). The app applies the level to `qbStarterPPG` only; a `chain` row's `projectedPPG` follows as share × level. **qb-inseason-refit:** the data side's in-season mirrors pin the same two files — a takeover re-pin also re-points `scripts/inseason-run.mjs`'s constants path, a rookie-level re-pin re-copies `QB_ROOKIE_STARTER_PPG`, and either re-runs `--inseason` (CR-25) before the app re-pins its k; a change to the primary-passer definition now also moves `--inseason` (which rookie QBs take the group level, and Q9).

### CR-08

- **Mirror:** Shape or floor changes land in both repos together. Read-only on the app side — not wired into projection/scoring. Rendered since dp-v2 Slice 4a (`dp/GameLogSection.jsx`) — a shape or floor change now breaks a visible surface, not just a silent loader. **Since D-1 (2026-08-24), `gameType`/`homeTeam`/`awayTeam` are also load-bearing data-side** — `scripts/update-nfl.mjs` reads this family (while `inProgress`) to derive each team's bye week(s) for `nfl/season-totals`; a missing schedule file degrades silently (no byes, no throw), but a `gameType`/`homeTeam`/`awayTeam` rename or reshape would silently stop byes from ever being written, with no validator to catch it (this family stays read-only/view-only on the app side regardless). **Since defence-numbers-rebuild `homeScore`/`awayScore` also drive `/week`'s RECORD column** — a rename or reshape blanks it to `—` with no error. **Since week-own-projection `spreadLine`/`totalLine` drive `/week`'s OURS column**, and the app reads `spreadLine` as positive = home favoured (nflverse's convention): a rename or null-fill blanks OURS to `—`, and a sign flip silently inverts every adjustment with no error.

### CR-15

- **Mirror:** Re-mirror the changed constant/gate/branch and **re-fit before any further exponent activation** — otherwise the fit reconstructs a factor the app no longer produces and the committed verdict in `.claude/tasks/r3fit-exponent-harness.md` stops transporting. Which positions a factor is gated to is itself part of the mirror. Note the known parity gap: `shareTrend` and `teamRzShare` have no end-to-end app-ground-truth check until a post-2026-07-18 snapshot is imported. **Nothing app-side fails when this drifts.** **Scope note reversed (D6a, 2026-09-06):** `dynastyScore.js` was previously named in `lib/projectionFactors.mjs` (the comment above `weightedLinearRegressionSlope`) only as a *contrast* and marked deliberately not a trigger; D6a's age port (Step 2) draws `computeEmpiricalAgeCurves` straight out of it, so `dynastyScore.js` is now mirrored and is a trigger like the other eleven app-side modules. The old contrast is still accurate as far as it goes — `weightedLinearRegression`'s copy in that file remains unfloored where the mirrored one floors the denominator at 4 — it just no longer means the whole file is out of scope. A change to any of the four app-side rookie mechanisms, or to their ordering, re-mirrors here; the mirror must never become reachable from the fit path, which `test/rookie-mirror.test.mjs`'s import-graph assertion enforces. **A gate change that captured snapshots already carry is added as a new model, never an overwrite (`7b5b055`, Step 4 up-side):** the retired behaviour stays reproducible for parity against pre-boundary captures and for re-running committed verdicts, the new model becomes the harness default, and the boundary gets a row in `grading/anchor-policy.md`. A mirrored-factor change, or a change to any of the four rookie mechanisms, also stales the in-season k constants fitted by `bin/backtest.mjs --inseason` and `--inseason --dynasty` over this reconstruction (CR-25): re-run it before re-pinning them. **qb-takeover-wiring (a gate change captures carry):** add the QB start share to `lib/projectionFactors.mjs` as a new depth model — legacy flat kept for pre-boundary captures, `qb-takeover` the harness default — never an overwrite. It needs the g = 1 takeover features (depth order, rookie, the incumbent's S−1 PPG over the all-teams median) and the CR-27 chain, and it applies after the comp blend / rookie ceiling, not inside `rawPPG`. Mirrored by qb-inseason-refit (data `58cd66a`): depth model `qb-takeover` and `reconstructQbPreseasonShares` over the pinned chain of `backtests/2026-10-03-qb-takeover-constants.json`. `test/qb-mirror.test.mjs` holds it exact against `snapshots/2026-10-04.json` (every veteran QB `depthFactor`; all 54 `chain` shares to 4 dp, with `iq` from S−1 PPG rescored to the capture's league scoring and `rk` read from the capture) and holds `legacy` exact against `snapshots/2026-10-03.json`. Historical rows use the D5 week-1 chart and half-PPR S−1 PPG for `iq` (under half-PPR 2 of the 54 captured shares cross an `iq` cut). Boundary 5 in `grading/anchor-policy.md`. The in-season k-fit's QB prior is the app's: the share-free starter level, except that a first-year QB with draft capital who started his team's first game keeps the ceiled rookie-path level (the app's `original` kind blends from `projectedPPG`) (CR-25). Parity against a post-boundary capture reads that capture's own Sleeper chart (`teamDepthCharts`/`depthChartOrder`); the D5 week-1 chart is only the stand-in for history with no capture. **rookie-qb-starter-level (a value change captures carry):** mirrored by qb-inseason-refit as model `rookie-qb-level` in `lib/rookieMirror.mjs` (pre-boundary captures keep the rookie-path level as `qbStarterPPG`; `QB_ROOKIE_STARTER_PPG` is held equal to the pinned file's `starterPPG` by `test/qb-mirror.test.mjs`). The reconstruction still does not compose share × level into a rookie `chain` row's `projectedPPG`/`projectedTotalPts`. Boundary 6 in `grading/anchor-policy.md`. No non-`chain` rookie `projectedPPG` moves, so the dynasty arm-B prior (`reconstructShippedRookieProjection` at ktc/college 1.0, no takeover input) and the 2c k are unaffected (CR-25).

