# App-repo backlog — asks discovered from the data side

Work that belongs in `sleeper-dashboard`, found by a session scoped to this repo (which cannot write the app). Add a line in the same change, with the commit that found it and whether it blocks; flag it in the hand-back. Strike through and note the app commit when done.

## Open

### Name-only matchers miss nickname and short-form name variants
**Found:** computed-stats-verification (app `c49ad11` (fix pass 1), report `verification/2026-10-18-computed-stats-verification.md`) · **Blocking:** yes · **Size:** medium — three matchers, one shared alias idea

V3 (top 400 KTC): `ktcMatch.js` leaves 4 players unmatched by name variant — D.J. Moore (rank 100; KTC `D.J.` normalises to `d j moore`, Sleeper `DJ Moore` to `dj moore`), Kenneth Gainwell (195; Sleeper `Kenny`), Chigoziem Okonkwo (228; `Chig`), Matthew Hibner (311; `Matt`). Travis Hunter is a separate cause (own entry below). `collegeMatch.js` returns no seasons (`college-none`) for several more because CFBD spells the name differently (20 `college-none` rows in all; the rest are in the data-repo entry D-78 or unexamined): Cam Skattebo (72; `Cameron`), KC Concepcion (69; `Kevin`), Bucky Irving (57; `Mar'Keise`), Isiah Pacheco (307; `Isaih`), Tutu Atwell (357; `Chatarius`), Joshua Palmer (280; also the one `draft-missing/name-not-found`, pick name differs) and others in the report. Fix sites: `ktcMatch.js:47` `normalizeName` (private), `collegeMatch.js:11` `normalizeName`, `nflDraftMatch.js` (uses the college one). `nflverse/playerids.json` carries `ktcId`/`cfbrefId` for a crosswalk-based join if aliasing is not enough.

### Same-name, different-person: KTC takes the first candidate, college attaches the wrong player's seasons
**Found:** computed-stats-verification (app `c49ad11` (fix pass 1), report `verification/2026-10-18-computed-stats-verification.md`) · **Blocking:** yes · **Size:** medium

V3: `ktcMatch.js:108` takes `ids[0]` of a name|position key with several Sleeper candidates — Kyle Williams (rank 241, three candidates `638`, `7437`, `12547`) resolves to the first, whose college seasons then end after its 2010 draft year. `collegeMatch.js` `resolveCandidate` returns a lone Sleeper candidate on name alone (collegeMatch.js:136), so another player's CFBD seasons are attached: `college-after-draft` for Caleb Williams (rank 11; seasons 2021–2023 and 2025, drafted 2024), A.J. Brown (78), Daniel Jones (113), Brian Thomas Jr. (112), Justice Hill (296), Isaiah Davis (270), Kyle Williams (241), Mike Evans (108, App State seasons), Chris Brooks (313); `college-name-collision` for Chase Brown (40), DeVonta Smith (45) and the same players; `college-disagree` for Mike Evans, Ray Davis (282), Chris Brooks. 12 distinct top-400 players in total. The college matcher needs a draft-year or college tie-break even for a single candidate. No CR mirror.

### nflDraftMatch rejects TE↔RB hybrids as position-incompatible
**Found:** computed-stats-verification (app `c49ad11` (fix pass 1), report `verification/2026-10-18-computed-stats-verification.md`) · **Blocking:** no · **Size:** small

V3 draft: Elijah Higgins (KTC rank 393, TE/ARI in KTC) is `draft-missing/position-incompatible` — the crosswalk says drafted 2023 round 6, but `positionsCompatible` (`nflDraftMatch.js:63`) hard-skips the pick because nflverse and Sleeper disagree on the skill position. The same miss is already known for Robbie Ouzts (header comment of `nflDraftMatch.js`). 2 of 400 top rows are missing a draft entry in total (the other is the Joshua Palmer name variant above).

### Travis Hunter: Sleeper position `DB` is outside the matchers' skill-position guard
**Found:** computed-stats-verification (app `c49ad11` (fix pass 1), report `verification/2026-10-18-computed-stats-verification.md`) · **Blocking:** no · **Size:** small — confirm intent first

V3 KTC: Travis Hunter (KTC rank 234, WR/JAC) is `ktc-unmatched`. Printing `playersMap["12530"]` from the cached players map gives `{"full_name":"Travis Hunter","position":"DB","fantasy_positions":["DB","WR"],"team":"JAX","status":"Active","years_exp":1,"college":"Colorado"}`. The one Sleeper entry for him has `position` `DB`, so `ktcMatch.js:75` (`!SKILL_POSITIONS.has(player.position)`) leaves him out of the name map; `collegeMatch.js:104` and `nflDraftMatch.js:110` apply the same `position`-only guard. `fantasy_positions` is not consulted by any of the three. No other top-400 row in this run shares the cause; he is rank 234, so not blocking under the top-100 rule.

### V2.4 per-season-team team totals differ from the nflverse rebuild in 11 team-metric cells (cause not established)
**Found:** computed-stats-verification (app `c49ad11` (fix pass 1), report `verification/2026-10-18-computed-stats-verification.md`) · **Blocking:** no · **Size:** small — cause first

V2.4 re-run verdict `defect` by the mechanical rule (a season-metric cell above 2%: 32 teams per cell, so one team is 3.1%). 11 of 576 team-metric cells are out of the 1% tolerance, 1.91% overall; every one has the app total above the rebuild. Cause not established. Value computed by `src/utils/teamContext.js:computeHistoricalTeamTotals` (called with `careerExTraded`), compared with the rebuild `scripts/verify/lib/nflverseRebuild.mjs:rebuildTeamTotals` over gamelogs ex-traded players. Fix owner (app or data) not established; filed here because the app function produces the value.

Out cells (season, metric: out of 32): 2021 rec 1, recTgt 1; 2022 rushAtt 1, rec 1; 2025 rushAtt 2, rec 3, recTgt 2.

Worst 5 by |ratio − 1| (sidecar `v2.outOfTolerance`): GB 2025 recTgt app 460 / ref 443 (1.038); GB 2025 rec 328 / 321 (1.022); PHI 2021 rec 293 / 288 (1.017); PHI 2021 recTgt 443 / 436 (1.016); BUF 2022 rushAtt 412 / 407 (1.012).

### V2.8 computeTeamContext carryShare differs from a current-team reference for 2 RBs in 2020 (cause not established)
**Found:** computed-stats-verification (app `c49ad11` (fix pass 1), report `verification/2026-10-18-computed-stats-verification.md`) · **Blocking:** no · **Size:** small — cause first

V2.8 re-run verdict `defect` by the mechanical rule: 2 of 26 RB `carryShare` comparisons in 2020 (7.7%) exceed 0.010; 2 of 1,535 overall (0.13%); receptionShare 0 of 1,125. Cause not established. Value computed by `src/utils/teamContext.js:computeTeamContext` (`playerShares[pid].carryShare`, current-team attribution), compared with the player's gamelogs carries ÷ Σ gamelogs carries of every `gamesPlayed ≥ 1` row whose `playersMap[pid].team` is the same team.

Out rows (sidecar `v2.outOfTolerance`): pid `3868` (RB, LV, 2020) app 0.386 / ref 0.407 (Δ −0.021); pid `6828` (RB, CAR, 2020) app 0.836 / ref 0.852 (Δ −0.016).

### V2.9 efficiency inputs differ from gamelogs ratios in 72 player-seasons (cause not established)
**Found:** computed-stats-verification (app `c49ad11` (fix pass 1), report `verification/2026-10-18-computed-stats-verification.md`) · **Blocking:** no · **Size:** small — cause first

V2.9 re-run verdict `defect` by the mechanical rule: `ypt` 2020 (7 of 346, 2.0%), `ypt` 2021 (12 of 356, 3.4%) and `catchRate` 2021 (12 of 356, 3.4%) exceed 2%; 72 of 10,728 comparisons out overall (0.67%). Cause not established. Value computed by `src/utils/efficiencyMetrics.js:computeEfficiencyFactor` (`efficiencyMetrics`), compared with the same ratios from summed gamelogs components.

Out cells (season, metric: out of compared): 2020 ypt 7/346, catchRate 6/346, recTdRate 2/346; 2021 ypt 12/356, catchRate 12/356, recTdRate 2/356, ypr 1/343; 2022 ypt 5/342, catchRate 4/342, ypc 1/148, ypr 1/329, recTdRate 1/342, passerRating 1/81; 2023 ypt 2/324, catchRate 2/324; 2024 ypt 5/342, catchRate 4/342; 2025 ypt 2/338, catchRate 2/338.

Worst 5 by |Δ| ÷ tolerance (sidecar): pid `2755` (TE, 2021) catchRate app 0.5 / ref 1; pid `5134` (WR, 2022) catchRate 1 / 0.5; pid `111` (TE, 2024) catchRate 0.5 / 1; pid `7943` (TE, 2024) catchRate 1 / 0.5; pid `5134` (WR, 2022) ypt 9 / 4.5.
