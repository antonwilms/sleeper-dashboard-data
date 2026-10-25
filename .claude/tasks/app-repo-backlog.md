# App-repo backlog — asks discovered from the data side

Work that belongs in `sleeper-dashboard`, found by a session scoped to this repo (which cannot write the app). Add a line in the same change, with the commit that found it and whether it blocks; flag it in the hand-back. Strike through and note the app commit when done.

## Open

### ~~January grading run (P3 slice A): app-side registry and backlog edits~~
**✅ Done 2026-10-25** — app `01120b1` (D-60 excluded, handled in slice B; CR-15 App `src/App.jsx` site written as `computeTeamContext`, `computeEmpiricalAgeCurves` to fit the registry site grammar).
**Found:** january-grading-run-a (data branch `claude/p3-slice-a-037aa6`, task file `.claude/tasks/january-grading-run-a.md` §16) · **Blocking:** no — land after the data commit, so `test/registry.test.mjs` resolves the new Data sites · **Size:** small — docs only, parent-folder session

The exact edits are in the task file's §16: (1) app `.claude/tasks/data-repo-backlog.md`: the trigger for D-16, D-44, D-52 and D-75 changes from "≥ 2027-01-05" to Fri 2027-01-15 (≥ 14:00 UTC; week 18 ends 2027-01-10); (2) `docs/cross-repo-registry.md` CR-15: Data += `lib/vetReplay.mjs` (`recompose`); App += `src/App.jsx` (the `computeTeamContext` current-team memo and the `computeEmpiricalAgeCurves` memo, :222-247, not the dynasty-only `computeHistoricalShares` memo at :293-301), `src/utils/teamContext.js` (`computeTeamContext`), `src/utils/projectionSignals.js` (`computeBreakoutFlag`); Tests += `test/vet-replay.test.mjs`; (3) CR-01: Data += `scripts/grade-snapshot.mjs` (`resolveOutcomeBasis`). **D-60: see P3 Slice B §16 (post-rollover trigger)** — it is dropped from item (1).

### ~~January grading run (P3 slice B): D-60 trigger and the CR-01 inSeason/projection-field coupling~~
**✅ Done 2026-10-25** — app `01120b1`.
**Found:** january-grading-run-b (data branch `claude/p3-slice-b-build-7301cb`, task file `.claude/tasks/january-grading-run-b.md` §12 and §16) · **Blocking:** no — land after the data commit, so `test/registry.test.mjs` resolves the new Data sites · **Size:** small — docs only, parent-folder session

(1) **D-60.** In app `.claude/tasks/data-repo-backlog.md`, under `### D-60 · Replicate Q5 on the app's sat-longer definition`, set its trigger to: recount at the first `nfl/season-totals` run where `nfl/season-totals/2026.json` is `inProgress: false` (after Sleeper's post-Super-Bowl rollover). The January run (P3 Slice B) deliberately does not count it: the in-progress guard refuses 2026 (Anton, 2026-10-24). Recipe: the existing `--inseason --dynasty` path cannot reach the 2025 class's S+1 until `guardLoad(load, { maxLoadSeason: 2025 })` (`scripts/inseason-dyn-run.mjs:1068`) and `DYN_DEFAULTS.seasons.to` (2024, `lib/inSeasonEvidence.mjs:631`) are lifted by a planned slice; re-run only at ≥ 20 flagged-with-S+1 players. This replaces D-60's part of the slice A entry above.

(2) **CR-01** (`docs/cross-repo-registry.md`): Invariant += the per-player `inSeason` fields the data repo now reads from app-written snapshots — `season`, `n`, `frozen`, `priorSource`, `notFrozenReason`, `ros.value`, `ros.prior`, `start.remaining`, `next` — plus the **values** of `projectedGames`, `factors.projectedGamesBase` and `factors.shortSeasonState`; App += `src/utils/inSeasonScoring.js` (`buildScoringPosteriors`; CR-15 already lists `src/utils/seasonProjection.js`); Data += `lib/seasonGrade.mjs` (`buildRosRows`) and `scripts/season-grade-run.mjs` (`stepGamesL6`, the reading site of the three projection fields; `stepOverride` reads `next`; `l6RowsOf` reads the three projection fields). This also closes slice A's unindexed presence-read of `shortSeasonState`.

### ~~Family-file raw fallback (CR-29)~~
**✅ Done 2026-10-23** — app `ff9a751` (fix pass `511b8cf`).
**Found:** data-store-cdn-limit (data `5231fb4`, task file `.claude/tasks/data-store-cdn-limit.md` Revision 1, Stage 1) · **Blocking:** no — wanted before the next CR-30 in-place rewrite release · **Size:** small — `src/api/dataStore.js` + tests + docs

jsDelivr intermittently answers family files with 403 "package size exceeded the configured limit of 50 MB" (the repo is ~550 MB unpacked; the limit bites when jsDelivr's per-file fetch fails and it falls back to the whole-repo tarball). `tryDataStore` treats it as a silent `null`, and `getSeasonTotals` falls back to the live API (pre-D-76 classification). Decided (Anton, 2026-10-23): keep jsDelivr first, add raw.githubusercontent.com as the fallback on HTTP error / timeout / JSON parse error, a per-session host skip, a budget that fits `loadFrozenPrior`'s 30 s race, a log line for every failed fetch, and the CR-29 retitle/sites. Full spec, guards, budgets and test list are in the task file's Stage 1. Its own Session 1 runs **in the app repo**.

### Frozen prior and live-API-labelled snapshots — decide before 2027 kickoff
**Found:** data-store-cdn-limit (data `5231fb4`, task file Revision 1, D2) · **Blocking:** no — the frozen prior is unused in 2026 · **Size:** small — `src/utils/inSeasonScoring.js` (`trimFrozenSnapshot`, `checkFrozenSnapshot`) + `src/api/frozenPrior.js` (`readAndGate`)

A snapshot records per-season `inputStatus.careerStats.detail.provenance`. Should `loadFrozenPrior` refuse a snapshot in which any completed season is `'live-api'`, falling to "live prior, flagged"? This is scoring-affecting, but only in that failure case. The decision is deferred (Anton, 2026-10-23); make it before the 2027 kickoff selects a frozen prior.

**There is a cache trap if the answer is yes.** `readAndGate` gates on a cached trim (`frozen-prior/<date>`, TTL 999999). `trimFrozenSnapshot`'s `env` keeps only `capturedAt`/`leagueId`/`targetSeason`/`projectionBasis`/`projectionModelFrom`, so `inputStatus` is dropped. The trim must start carrying provenance, and already-cached trims must be re-trimmed, in the way the existing `qbChain == null` re-trim works (`frozenPrior.js:20`).

### ~~Name-only matchers miss nickname and short-form name variants~~
**✅ Done 2026-10-25** — app `0d8938b` (committed, not yet pushed): KTC resolves through the crosswalk's name alias, given-name/initials variants with team agreement; college through `espnId`; draft through `draftYear`+`draftOvr` (CR-31).
**Found:** computed-stats-verification (app `4969138` (fix pass 2), report `verification/2026-10-18-computed-stats-verification.md`) · **Blocking:** yes · **Size:** medium — three matchers, one shared alias idea

V3 (top 400 KTC): `ktcMatch.js` leaves 4 players unmatched by name variant — D.J. Moore (rank 100; KTC `D.J.` normalises to `d j moore`, Sleeper `DJ Moore` to `dj moore`), Kenneth Gainwell (195; Sleeper `Kenny`), Chigoziem Okonkwo (228; `Chig`), Matthew Hibner (311; `Matt`). Travis Hunter is a separate cause (own entry below). `collegeMatch.js` returns no seasons (`college-none`) for several more because CFBD spells the name differently (20 `college-none` rows in all; the rest are in the data-repo entry D-78 or unexamined): Cam Skattebo (72; `Cameron`), KC Concepcion (69; `Kevin`), Bucky Irving (57; `Mar'Keise`), Isiah Pacheco (307; `Isaih`), Tutu Atwell (357; `Chatarius`), Joshua Palmer (280; also the one `draft-missing/name-not-found`, pick name differs) and others in the report. Fix sites: `ktcMatch.js:47` `normalizeName` (private), `collegeMatch.js:11` `normalizeName`, `nflDraftMatch.js` (uses the college one). `nflverse/playerids.json` carries `ktcId`/`cfbrefId` for a crosswalk-based join if aliasing is not enough.

### ~~Same-name, different-person: KTC takes the first candidate, college attaches the wrong player's seasons~~
**✅ Done 2026-10-25** — app `0d8938b` (committed, not yet pushed): KTC tie-breaks by team and returns no value when ambiguous; college drops candidates outside the six years before the crosswalk draft year, in a year an id row covers, or losing the same-year collision guard.
**Found:** computed-stats-verification (app `4969138` (fix pass 2), report `verification/2026-10-18-computed-stats-verification.md`) · **Blocking:** yes · **Size:** medium

V3: `ktcMatch.js:108` takes `ids[0]` of a name|position key with several Sleeper candidates — Kyle Williams (rank 241, three candidates `638`, `7437`, `12547`) resolves to the first, whose college seasons then end after its 2010 draft year. `collegeMatch.js` `resolveCandidate` returns a lone Sleeper candidate on name alone (collegeMatch.js:136), so another player's CFBD seasons are attached: `college-after-draft` for Caleb Williams (rank 11; seasons 2021–2023 and 2025, drafted 2024), A.J. Brown (78), Daniel Jones (113), Brian Thomas Jr. (112), Justice Hill (296), Isaiah Davis (270), Kyle Williams (241), Mike Evans (108, App State seasons), Chris Brooks (313); `college-name-collision` for Chase Brown (40), DeVonta Smith (45) and the same players; `college-disagree` for Mike Evans, Ray Davis (282), Chris Brooks. 12 distinct top-400 players in total. The college matcher needs a draft-year or college tie-break even for a single candidate. No CR mirror.

### ~~nflDraftMatch rejects TE↔RB hybrids as position-incompatible~~
**✅ Done 2026-10-25** — app `0d8938b` (committed, not yet pushed): Pass A joins `draftYear`+`draftOvr` with no position check; Pass B still skips a hybrid with no crosswalk row.
**Found:** computed-stats-verification (app `4969138` (fix pass 2), report `verification/2026-10-18-computed-stats-verification.md`) · **Blocking:** no · **Size:** small

V3 draft: Elijah Higgins (KTC rank 393, TE/ARI in KTC) is `draft-missing/position-incompatible` — the crosswalk says drafted 2023 round 6, but `positionsCompatible` (`nflDraftMatch.js:63`) hard-skips the pick because nflverse and Sleeper disagree on the skill position. The same miss is already known for Robbie Ouzts (header comment of `nflDraftMatch.js`). 2 of 400 top rows are missing a draft entry in total (the other is the Joshua Palmer name variant above).

### Travis Hunter: Sleeper position `DB` is outside the matchers' skill-position guard
**Re-scoped 2026-10-25, not struck.** App `0d8938b` (committed, not yet pushed): the three matchers now resolve him (KTC and the id paths read `fantasy_positions`; draft Pass A has no position check). He still has no row, projection or dynasty score: `App.jsx`, `seasonProjection.js` and `dynastyScore.js` gate on `position ∈ {QB,RB,WR,TE}` and Sleeper says `DB`. App-wide WR eligibility is parked in `../PARKED.md` ("Make DB/WR two-way players eligible as WR").
**Found:** computed-stats-verification (app `4969138` (fix pass 2), report `verification/2026-10-18-computed-stats-verification.md`) · **Blocking:** no · **Size:** small — confirm intent first

V3 KTC: Travis Hunter (KTC rank 234, WR/JAC) is `ktc-unmatched`. Printing `playersMap["12530"]` from the cached players map gives `{"full_name":"Travis Hunter","position":"DB","fantasy_positions":["DB","WR"],"team":"JAX","status":"Active","years_exp":1,"college":"Colorado"}`. The one Sleeper entry for him has `position` `DB`, so `ktcMatch.js:75` (`!SKILL_POSITIONS.has(player.position)`) leaves him out of the name map; `collegeMatch.js:104` and `nflDraftMatch.js:110` apply the same `position`-only guard. `fantasy_positions` is not consulted by any of the three. No other top-400 row in this run shares the cause; he is rank 234, so not blocking under the top-100 rule.

### V2.4 per-season-team team totals differ from the nflverse rebuild in 11 team-metric cells (cause not established)
**Found:** computed-stats-verification (app `4969138` (fix pass 2), report `verification/2026-10-18-computed-stats-verification.md`) · **Blocking:** no · **Size:** small — cause first

V2.4 re-run verdict `defect` by the mechanical rule (a season-metric cell above 2%: 32 teams per cell, so one team is 3.1%). 11 of 576 team-metric cells are out of the 1% tolerance, 1.91% overall; every one has the app total above the rebuild. Cause not established. Value computed by `src/utils/teamContext.js:computeHistoricalTeamTotals` (called with `careerExTraded`), compared with the rebuild `scripts/verify/lib/nflverseRebuild.mjs:rebuildTeamTotals` over gamelogs ex-traded players. Fix owner (app or data) not established; filed here because the app function produces the value.

Out cells (season, metric: out of 32): 2021 rec 1, recTgt 1; 2022 rushAtt 1, rec 1; 2025 rushAtt 2, rec 3, recTgt 2.

Worst 5 by |ratio − 1| (sidecar `v2.outOfTolerance`): GB 2025 recTgt app 460 / ref 443 (1.038); GB 2025 rec 328 / 321 (1.022); PHI 2021 rec 293 / 288 (1.017); PHI 2021 recTgt 443 / 436 (1.016); BUF 2022 rushAtt 412 / 407 (1.012).

### V2.8 computeTeamContext carryShare differs from a current-team reference for 2 RBs in 2020 (cause not established)
**Found:** computed-stats-verification (app `4969138` (fix pass 2), report `verification/2026-10-18-computed-stats-verification.md`) · **Blocking:** no · **Size:** small — cause first

V2.8 re-run verdict `defect` by the mechanical rule: 2 of 26 RB `carryShare` comparisons in 2020 (7.7%) exceed 0.010; 2 of 1,535 overall (0.13%); receptionShare 0 of 1,125. Cause not established. Value computed by `src/utils/teamContext.js:computeTeamContext` (`playerShares[pid].carryShare`, current-team attribution), compared with the player's gamelogs carries ÷ Σ gamelogs carries of every `gamesPlayed ≥ 1` row whose `playersMap[pid].team` is the same team.

Out rows (sidecar `v2.outOfTolerance`): pid `3868` (RB, LV, 2020) app 0.386 / ref 0.407 (Δ −0.021); pid `6828` (RB, CAR, 2020) app 0.836 / ref 0.852 (Δ −0.016).

### V2.9 efficiency inputs differ from gamelogs ratios: 72 comparisons across 36 player-seasons (cause not established)
**Found:** computed-stats-verification (app `4969138` (fix pass 2), report `verification/2026-10-18-computed-stats-verification.md`) · **Blocking:** no · **Size:** small — cause first

V2.9 re-run verdict `defect` by the mechanical rule: `ypt` 2020 (7 of 346, 2.0%), `ypt` 2021 (12 of 356, 3.4%) and `catchRate` 2021 (12 of 356, 3.4%) exceed 2%; 72 of 10,728 comparisons out overall (0.67%). The 72 out comparisons are 36 distinct player-seasons (2020 7, 2021 13, 2022 7, 2023 2, 2024 5, 2025 2). That is about 1.8% of the ≈2,048 in-scope RB/WR/TE player-seasons across 2020–2025, so `Blocking: no` under §6, which counts in-scope player-seasons across the slice; 2021 alone is 13 of 356 (3.7%). Cause not established. Value computed by `src/utils/efficiencyMetrics.js:computeEfficiencyFactor` (`efficiencyMetrics`), compared with the same ratios from summed gamelogs components.

Out cells (season, metric: out of compared): 2020 ypt 7/346, catchRate 6/346, recTdRate 2/346; 2021 ypt 12/356, catchRate 12/356, recTdRate 2/356, ypr 1/343; 2022 ypt 5/342, catchRate 4/342, ypc 1/148, ypr 1/329, recTdRate 1/342, passerRating 1/81; 2023 ypt 2/324, catchRate 2/324; 2024 ypt 5/342, catchRate 4/342; 2025 ypt 2/338, catchRate 2/338.

Worst 5 by |Δ| ÷ tolerance (sidecar): pid `2755` (TE, 2021) catchRate app 0.5 / ref 1; pid `5134` (WR, 2022) catchRate 1 / 0.5; pid `111` (TE, 2024) catchRate 0.5 / 1; pid `7943` (TE, 2024) catchRate 1 / 0.5; pid `5134` (WR, 2022) ypt 9 / 4.5.

### V2.12 scores a player-season with no `nflverse/snaps` entry as 0 games
**Found:** D-76 absence-role (data worktree branch `d76-absence-role`; Stage A report `verification/2026-10-19-absence-role-diff.md`, re-measure `grading/2026-10-22-absence-role-verdict.md`: V2.12 mismatches 1387/4615 = 30.05% → 110/4615 = 2.38% on the D-76 data, 48 → 65 negative-Δ rows) · **Blocking:** no · **Size:** small

`scripts/verify/lib/v2GradeInputs.mjs:479` (app) treats a skill player-season that has a `rosterweekly` entry but no `snaps` entry as `snaps.games = 0`, so the reference counts every eligible week as missed. That is a reference artifact, not a data defect: 26 of V2.12's 48 negatives and ~100–130 positives per season 2021–2025 are rows of this kind. Compare those rows as "no reference" instead of as 0 games.
