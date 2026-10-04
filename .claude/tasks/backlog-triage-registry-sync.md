# L2 — Backlog triage (D-45…D-62) + registry sync (D-58 batch) + D-62 schedule

**Session 1, 2026-10-04 (opus), parent-folder read of both repos.** Baselines: app `b923cee`, data `4a52d97`.
Source: `../future_plans/in-season-notes-plan.md` → "Leftovers round" → L2; input list
`../sleeper-dashboard/.claude/tasks/data-repo-backlog.md` (the app repo holds the backlog; the data repo cannot
edit it from a repo-scoped session — Stage A does, from the app repo).

**Type:** docs / registry / bookkeeping only. No `lib/`, `scripts/`, `bin/`, `test/` or data-file change in either
repo. **Model:** sonnet for Stages A–C.

**Route** (memory: two-session registry route, CR-24): **Stage A** — an app-repo session applies §A to
`docs/cross-repo-registry.md` and §B to the backlog, commits. **Stage B** — a data-repo session byte-copies the
mirrored span (§C), commits. **Stage C** — a data-repo session runs D-62 (§D) once the first post-boundary capture
exists. Push after Anton's sign-off: app first, then data **the same day** (between them the daily
`registry-mirror.yml` is red — that red is the sync owed).

---

## 1. Triage — every open entry D-45 … D-62, verified against live source

"Evidence" cites data-repo source at `4a52d97` unless marked app.

| id | verdict | evidence | remaining size / blocking |
|---|---|---|---|
| D-45 custom-basis full-pipeline backtest + rookie refit | **open** | No 2012–2021 first-down derivation exists data-side: `scripts/qb-rookie-level-run.mjs:97-99` throws on `bonus_fd_qb` precisely because "this run does not port that"; `lib/fantasyPoints.mjs` has no `withFirstDownBonus` analogue. | large · no |
| D-46 CR-15 mirror basis (league-basis model) | **open** | `scripts/panel-run.mjs:101,145,978` still pin `half_ppr`; no `positionBasisScale` in `lib/projectionFactors.mjs`/`lib/rookieMirror.mjs` (only `lib/qbRookieLevel.mjs` reads `rookieBasisScale`, for P12a's live comparison). | medium · no |
| D-47 per-week scoring keys | **open** | `lib/sleeper.mjs:306` stores only `weeklyPoints[week] = stats.pts_half_ppr`; no per-week key series. | medium (to plan) · no |
| D-48 registry sync, CR-02 weekly-points basis | **closed — done** | Data `70e2bf3` ("mirror registry D-48 (app b693c09)"); the sentence "**Since weekly-points-display-basis.md**, served `weeklyPoints` are on the basis the row's `scoringBasis` names" is in the CR-02 Invariant today. Data-side check holds: `lib/sleeper.mjs:306` (`pts_half_ppr` per week) and `:337` (`scoringBasis = 'half_ppr'`). | — |
| D-49 registry sync, in-season 2b-1 | **closed — done**, one residual moved to D-59 | Data `93e469e`: span sync, CLAUDE.md count (now "all 27"), Invariant 4 snapshot clause ("snapshots are read back through `tryDataStore` (CR-26)"), README `players[id].inSeason` section (`README.md:323`). The "decision-level two-branch test": `decideOwnVsPooled` is tested on both branches in `test/inseason-dyn.test.mjs` §2 (`5e70512`). **Residual:** the pin-write wiring in `buildConstants` (`scripts/inseason-run.mjs:1028-1048`, not exported) has no test — folded into D-59, whose L3 slice re-runs `--inseason`. | residual: small · no |
| D-50 model marker in snapshots | **open, not data-owed** | App-side capture change first (the entry says so); nothing data-side to do. | small (app first) · no |
| D-51 registry sync, in-season 2b-2 | **closed — done** | Data `4f48233`; the CR-21 Mirror sentence "a mis-marked or stale in-progress file also moves displayed projections" is present. Data-side defaults still match baseline B: `lib/inSeasonEvidence.mjs:30-31` (`minBaselineGames: 4`, `minBaselineOpp: 2.0`, `lookbackSeasons: 3`). | — |
| D-52 rest-of-season grader | **open** | No reader of `inSeason.ros`/`inSeason.next` in `lib/grade.mjs` or `scripts/grade-snapshot.mjs`. Realised ROS needs the season to finish. | medium · calendar (full grade ~Jan 2027) |
| D-53 | already struck (`defacb1`) | — | — |
| D-54 prospect-prior re-mirror + cap placement | **partly done** | (b) "with no completed-season blend" and (d) the arm-B prior as `reconstructShippedRookieProjection` at neutral ktc/college are stated in CR-25's App side today. (a) cap-the-starting-value statement, (c) SHORT slot = `historyPriorOf`'s L = S−2 in the mirror, and (e) the cap-placement comparison in `--inseason --dynasty` output are absent (`grep` for cap placement in `lib/`/`scripts/`: none). | small · no |
| D-55 S+2 arm comparison | **open** | `nextPPG2` is built in `scripts/inseason-run.mjs:400-437` but `scripts/inseason-dyn-run.mjs` `augmentRow` (`:106`) does not carry it; no A-vs-B S+2 arm. | medium · no |
| D-56 arm-A WR YE1 ladder + dynasty-prior freeze | **open** | No `K_DYN_PROSPECT_A_YE1` anywhere in `lib/`/`scripts/`/`backtests/`; latest dyn constants file is `backtests/2026-09-27-inseason-dyn-constants.json`. | medium · no |
| D-57 | already struck | — | — |
| D-58 registry anchor refresh + queued texts | **done by this slice** (Stage A/B) | P10/P11 bullets were already applied (`63def33`/`f1e2e51`, data `999925e`). Every other bullet (P7, P3, P4, P5b, P5c, L1) is §A below, each anchor re-derived at app `b923cee`. | small · CR-24 red window only |
| D-59 QB start-share re-mirror + QB k re-fit | **open** (= L3) | No QB start-share model in `lib/projectionFactors.mjs`; no rookie-level model in `lib/rookieMirror.mjs`. Gains the D-49 residual. | medium · no |
| D-60 Q5 on the app's sat-longer definition | **open** (= L4) | `QB_SAT_LONGER_*` still `PROVISIONAL(heuristic)` per CR-27's Mirror. | small · no |
| D-61 P12a registry companion | **closed — done** | Applied by `63def33`/`f1e2e51`, data `999925e`; the mirror test is green at `4a52d97` (21/21). | — |
| D-62 confirm anchor-policy boundaries 5 + 6 | **scheduled** (Stage C) | Legacy side pre-verified now: `snapshots/2026-10-03.json` (captured 19:20:24 UTC, before the 01:04 UTC push) — 737 rows, 103 QBs by `nflverse/playerids.json` plus 3 rookie QBs listed in `teamDepthCharts[*].QB` with no crosswalk position (13310, 13428, 13602), **0** rows carry `qbTakeoverBasis`, **0** carry `qbStarterBasis`. Post-boundary side needs the first capture after 13:43 UTC today. | small · calendar (tonight's capture) |

**New entry, proposed (D3):** **D-63 · Absent weeks stored as `'X'` undercount missed games.** Found by L1
(`my-team-in-season-tiles.md`, app `fc6cd2c`): Sleeper omits an inactive player from that week's response, so
`aggregateWeeks` (`lib/sleeper.mjs:220-225`, "absent → … weeklyStatus stays 'X'") never writes `'D'` for him. Served
2025, QB/RB/WR/TE by `nflverse/playerids.json`, weeks between each player's first and last `'P'`: 859
`'X'` in a week where a same-`team` row is `'P'`, vs 589 `'D'` (Session 1 recount; the 2,925/1,836 quoted in L1's
report used a population not recorded, so it is not cited). The offseason GAMES MISSED tile, the GAMES strip, the
pop-up availability grid and possibly `dnpWeeks`-driven durability undercount. Data-side fix candidate: write `'D'`
for an absent week whose resolved team played — **scoring-affecting** (durability, CR-02's dominant-team rule
precedent), so it needs a graded gate and a both-repos plan. A fix to completed seasons falls under Invariant 1: forward-only, or a
`migrate-*` rewrite with a committed diff. CR-02's new sentence (A.2.14/2.15) records two related gaps (a `gp 0` row
with no `team` is `'D'`; a traded player's weeks are judged against his dominant team). Size: medium · blocking: no.

## 2. Decisions

- **D1 — sweep scope.** D-58 lists six queued batches. I applied all of them, plus (a) every `src/App.jsx` line
  anchor in the span (P5c's bullet: "All registered `App.jsx` anchors after `:60` … shift"), which reaches CR-03,
  CR-17 and CR-22 too; (b) every `src/api/dataStore.js` anchor (a validator inserted at `:114` shifted
  `isValidSeasonTotals`/`CFBDRows`/`Roster`/`Draft`/`AdvStats`/`TeamContext` and `tryDataStore`); (c) six stale
  anchors found while checking: CR-11 `:148,157`, CR-19's six Market anchors, the rest of CR-17, CR-05's three
  `cfbd.js` anchors. **Not swept** — left for a follow-up: CR-04 (`ktcHistory.js:4-6,97-131`, `ktc.js:127-134`),
  CR-05 (`collegeMetrics.js` ranges), CR-12 (`nflStats.js:28`), CR-13 (`seasonProjection.js:748/756`,
  `outlookPositionStats.js` anchors). Spot checks show at least CR-12 and CR-13 are stale too.
- **D2 — content re-derivation over queued text.** Where a queued bullet's wording no longer matched live source,
  §A follows the source and says so: CR-02's `availabilityGrid.js:4` described a comment ("never emit `'B'`") that
  was corrected long ago — now `:3-8`, worded as it reads; CR-02's in-season `GAMES MISSED` clause states L1's fix
  pass rule (`'D'` or `'X'` in a week the team played), not "the same way" alone; CR-08 numbers the new readers
  fifth (P4) and sixth (P5c) in commit order; the L1 sentence carries a bold lead (`**Since
  my-team-in-season-tiles**`) like every other dated clause in CR-02. Its second rule ("a row's `team` must be the
  team it played for that week's games") is **not** written as an invariant: the data side does not hold it, so the
  sentence states the two known gaps instead (plan gate flag 2).
- **D3 — D-63 is appended to the backlog in Stage A.** Recording a finding is bookkeeping, not acting on it. Anton
  may strike it.
- **D4 — D-62 runs on the first capture after the boundary-6 push**, expected as `snapshots/2026-10-04.json`
  tonight (cron 16:29 UTC; recent runs landed 19:20–21:12 UTC). That one capture is the first after **both**
  pushes, so no capture exists with boundary 5 but not 6; Stage C records that. The "from 2026-10-06" in the plan is
  `PRIOR_MODEL_FROM` (the frozen-prior gate), a different axis — it does not gate D-62.

## Cross-repo impact

Touched contracts: **CR-01, CR-02, CR-03, CR-05, CR-06, CR-07, CR-08, CR-09, CR-10, CR-11, CR-16, CR-17, CR-19,
CR-21, CR-22** (all text/anchors in the mirrored span; no behaviour), **CR-24** (the byte-identity check this
two-step sync satisfies). No data-side source changes, so no data-side trigger fires; one data-half registry addition (A.8.9: `parseSchedulesCsv`
in CR-08's Triggers, `[registry-stale]`) rides in the app-authored span. The new contract sentences
come from the app (Mirrors quoted for the rule; each is the full current text plus §A's append):

- **CR-02 Mirror** (after A.2.15) gains: "**Since my-team-in-season-tiles** the app counts as a missed game a `'D'` in
  the live (in-progress) file's `weeklyStatus`, or an `'X'` in a week where any row with the same `team` is `'P'` …
  must be marked `'B'`/`'X'`, never `'D'`, or My Team's GAMES MISSED tile shows phantom misses with no app-side diff.
  Two known gaps today: a `gp 0` row with no `team` is marked `'D'`, and a row's `team` is its single season team …" —
  **Answer (data side):** the rule holds for every `gp 0` row that carries a `team`: it is `'B'` when no `gp 1` row of
  that team exists that week (`lib/sleeper.mjs:273-275`, `:320-327`); an absent player stays `'X'`. The two stated
  gaps are real (`:321`'s `team &&` guard; the dominant-team rule) and ride on D-63. No data action now.
- **CR-08 Mirror** (after A.8.8) gains: "**Since week-own-projection `spreadLine`/`totalLine` drive `/week`'s OURS
  column**, and the app reads `spreadLine` as positive = home favoured (nflverse's convention): a rename or
  null-fill blanks OURS to `—`, and a sign flip silently inverts every adjustment with no error." — **Answer:**
  `parseSchedulesCsv` (`lib/nflverse.mjs:1119-1120`) passes `spread_line`/`total_line` through `numOrNull` with no
  sign change; it was missing from CR-08's data-side Triggers and A.8.9 adds it. No code change.
- **CR-21 Mirror** (after A.21.3/21.4): My Team's in-season columns and header tiles read the in-progress file, so a
  stopped job leaves them silently stale. — **Answer:** cadence unchanged (season-totals-cadence.md); no action.

The rest of §A is anchors and app-side reader lists; data side: no action beyond the byte-sync. CR-24 is not fired
(its Mirror: editing an ordinary entry does not).

---

## §A. Registry edits (Stage A, app repo `docs/cross-repo-registry.md`)

**Preconditions — stop on any failure, do not improvise:**
1. `git -C ../sleeper-dashboard diff --quiet b923cee HEAD -- docs/cross-repo-registry.md src/` exits 0 — every
   anchor below was read at `b923cee`. If anything under `src/` moved, stop and report the commits.
2. The span hash before editing:
   `sed -n '/^<!-- CR-REGISTRY-BEGIN -->$/,/^<!-- CR-REGISTRY-END -->$/p' docs/cross-repo-registry.md | shasum -a 256`
   = `c6d692fa402a3b4b90d47f4589cd877b5e7f7d9a3154c35751619f828dcdf48d` (byte-identical to data `4a52d97`).

**Rules.**
- Each edit is an exact replace: the *old* block occurs **exactly once** in the span (or the stated count), inside
  the named entry. Checked by script at `b923cee`. If `grep -cF` disagrees, stop.
- A trailing `⏎` in a block means the string ends with the field line's newline (an append at the end of a field):
  the replacement keeps that single newline at its end. Never join two lines.
- Edit only inside the span. Never write the sentinel literals or a `sed` range inside an entry. Keep every field on
  the lines it occupies; CR-19 keeps its two-space hard wrap.
- `‖` separators are two spaces, `‖`, two spaces — the blocks below include them where an insert sits before `‖`.
- Apply in the order listed (two CR-10 edits replace all occurrences of a token; nothing else overlaps).

**Gate after editing:** the same `sed … | shasum -a 256` = **`6ea3722abfcb7587ad048743535f52e9dfc2c9298f1a69e162dde51617b6fcf4`**;
the span stays **276** lines; `diff` against the data copy shows exactly **27** changed physical lines:
CR-01 Triggers · CR-02 App side, Invariant, Triggers, Mirror · CR-03 App side · CR-05 App side, Mirror · CR-06 App
side · CR-07 App side · CR-08 App side, Triggers, Mirror · CR-09 App side, Triggers · CR-10 App side, Triggers ·
CR-11 Triggers · CR-16 App side, Triggers · CR-17 App side · CR-19 App side (2 wrapped lines) · CR-21 App side,
Triggers, Mirror · CR-22 App side. A hash mismatch means a typo: diff your span against the blocks, fix, re-hash —
never adjust the expected hash.

#### CR-01

**A.1.1**
```text
`src/components/dp/PlayerDetailModal.jsx:120-121,148-154,277,280-282,303,371,584`
```
→
```text
`src/components/dp/PlayerDetailModal.jsx:177-178,183-185,216-222,366,369-373,394,485,737`
```
**A.1.2**
```text
`src/App.jsx:699-733,747,787,804,1382,1407`
```
→
```text
`src/App.jsx:732-766,798,845,862,1461,1471,1498`
```
**A.1.3**
```text
its call `src/components/portfolio/Portfolio.jsx:274`
```
→
```text
its call `src/components/portfolio/Portfolio.jsx:315`
```

#### CR-02

**A.2.1**
```text
`isValidSeasonTotals:102`
```
→
```text
`isValidSeasonTotals:119`
```
**A.2.2**
```text
json` path `:209`, the `tryDataStore` call `:210`, the `entry.schemaVersion` read `:215`, and the `weeklyStatus` staleness sniff `:175`)
```
→
```text
json` path `:208`, the `tryDataStore` call `:209`, the `entry.schemaVersion` read `:214`, and the `weeklyStatus` staleness sniff `:174`)
```
**A.2.3**
```text
and the season-wide presence of any `bonus_fd_*` key⏎
```
→
```text
and the season-wide presence of any `bonus_fd_*` key; `src/utils/weeklyRanks.js` (`seasonPointsFromCareer`/`buildLineupRanks` — whole-season ranks over `careerStats[dataSeason]` for `/week`'s rank line; `rankByTotalPoints`/`seasonPointsFromCareer` also rank My Team's `POS RANK` over `careerStats[dataSeason]` and the live rows)⏎
```
**A.2.5**
```text
(`dsPath:209`, the `tryDataStore` call `:210`, the `entry.schemaVersion` read `:215`, the `weeklyStatus` sniff `:175`)
```
→
```text
(`dsPath:208`, the `tryDataStore` call `:209`, the `entry.schemaVersion` read `:214`, the `weeklyStatus` sniff `:174`)
```
**A.2.6**
```text
`src/utils/seasonProjection.js:791`
```
→
```text
`src/utils/seasonProjection.js:868`
```
**A.2.7**
```text
`computeEmpiricalAgeCurves` (`src/utils/dynastyScore.js:63-64`)
```
→
```text
`computeEmpiricalAgeCurves` (`src/utils/dynastyScore.js:66`)
```
**A.2.8**
```text
`src/utils/availabilityGrid.js:4` (the comment asserting served season-totals never emit `'B'`)
```
→
```text
`src/utils/availabilityGrid.js:3-8` (the comment recording that served season-totals emit `'B'` only since D-1, forward-only)
```
**A.2.9**
```text
`src/components/portfolio/Portfolio.jsx` (`GAMES` strip / `GAMES MISSED` tile — served `weeklyStatus` via `buildAvailabilityGrid`, `'B'`/`'X'` both drawn as bye-or-no-game; `rankPositionSeason` over `careerStats[dataSeason]` for `POS RANK`; `buildTeamShareTotals`/`buildPerSeasonTeamShares` for `SHARE`)
```
→
```text
`src/components/portfolio/Portfolio.jsx` (`GAMES` strip / `GAMES MISSED` tile — served `weeklyStatus` via `buildAvailabilityGrid`, `'B'`/`'X'` both drawn as bye-or-no-game; in-season the `GAMES MISSED` tile reads the live season-totals rows' `weeklyStatus` the same way, counting a `'D'` and an `'X'` in a week where a live row with the same `team` is `'P'`; `rankByTotalPoints`/`seasonPointsFromCareer` (`src/utils/weeklyRanks.js`) over `careerStats[dataSeason]` and the live rows for `POS RANK` and the in-season rank sub-lines; `rankPositionSeason` for last-season PPG only; `buildTeamShareTotals`/`buildPerSeasonTeamShares` for `SHARE`)
```
**A.2.10**
```text
`market/Market.jsx:486,490`
```
→
```text
`market/Market.jsx:524,528`
```
**A.2.11**
```text
`portfolio/Portfolio.jsx:300,304` (the same pair)
```
→
```text
`portfolio/Portfolio.jsx:355,359` (the same pair)
```
**A.2.12**
```text
`src/App.jsx:234,247` (`computeHistoricalTeamTotals`, per-season and current-team), `src/App.jsx:239,252` (`computeHistoricalShares`, the same pair) and `src/App.jsx:219` (`computeTeamContext`)
```
→
```text
`src/App.jsx:282,295` (`computeHistoricalTeamTotals`, per-season and current-team), `src/App.jsx:287,300` (`computeHistoricalShares`, the same pair) and `src/App.jsx:246` (`computeTeamContext`)
```
**A.2.13**
```text
`src/components/dp/DistributionSection.jsx` — weekly-points-display-basis.md)  ‖  
```
→
```text
`src/components/dp/DistributionSection.jsx` — weekly-points-display-basis.md); `src/utils/weeklyRanks.js` (`seasonPointsFromCareer`/`buildLineupRanks`/`rankByTotalPoints` — whole-season rank readers of `careerStats[dataSeason]` and the live rows)  ‖  
```
**A.2.14**
```text
the app displays them verbatim under that label.
```
→
```text
the app displays them verbatim under that label. **Since my-team-in-season-tiles** the app counts as a missed game a `'D'` in the live (in-progress) file's `weeklyStatus`, or an `'X'` in a week where any row with the same `team` is `'P'` (Sleeper omits inactive players, so their slot stays `'X'`). A player whose team has not yet played the partly played current week must be marked `'B'`/`'X'`, never `'D'`, or My Team's GAMES MISSED tile shows phantom misses with no app-side diff. Two known gaps today: a `gp 0` row with no `team` is marked `'D'`, and a row's `team` is its single season team (the dominant-team rule above), so a traded player's other-stint weeks are judged against that team.
```
**A.2.15**
```text
without changing `scoringBasis` in the same change mislabels every displayed week, with no app-side diff and no failing test.
```
→
```text
without changing `scoringBasis` in the same change mislabels every displayed week, with no app-side diff and no failing test. **Since my-team-in-season-tiles** the app counts as a missed game a `'D'` in the live (in-progress) file's `weeklyStatus`, or an `'X'` in a week where any row with the same `team` is `'P'` (Sleeper omits inactive players, so their slot stays `'X'`). A player whose team has not yet played the partly played current week must be marked `'B'`/`'X'`, never `'D'`, or My Team's GAMES MISSED tile shows phantom misses with no app-side diff. Two known gaps today: a `gp 0` row with no `team` is marked `'D'`, and a row's `team` is its single season team (the dominant-team rule above), so a traded player's other-stint weeks are judged against that team.
```

#### CR-03

**A.3.1**
```text
called from `src/App.jsx:268`
```
→
```text
called from `src/App.jsx:361`
```

#### CR-05

**A.5.1**
```text
`normalizeCollegeStats:42`
```
→
```text
`normalizeCollegeStats:55`
```
**A.5.2**
```text
`pivotStatRows:97`
```
→
```text
`pivotStatRows:110`
```
**A.5.3**
```text
`isValidCFBDRows:112`
```
→
```text
`isValidCFBDRows:129`
```
**A.5.4** — replace all **2** occurrences
```text
computeTeamTotals:115
```
→
```text
computeTeamTotals:128
```

#### CR-06

**A.6.1**
```text
`isValidRoster:113` / `isValidDraft:118`
```
→
```text
`isValidRoster:143` / `isValidDraft:148`
```

#### CR-07

**A.7.1**
```text
`isValidAdvStats:135`
```
→
```text
`isValidAdvStats:152`
```
**A.7.2**
```text
`src/App.jsx:1001` (the completed-season `loadAdvStats` call site) and `:1017`
```
→
```text
`src/App.jsx:1220` (the completed-season `loadAdvStats` call site) and `:1236`
```
**A.7.3**
```text
`src/App.jsx:641` (`profileContextValue`, deps `:648`) and `:1282` (Market prop, with its `advStatsLive` sibling at `:1283`)
```
→
```text
`src/App.jsx:790` (`profileContextValue`, deps `:814`) and `:1505` (Market prop, with its `advStatsLive` sibling at `:1506`)
```
**A.7.4**
```text
floored via `flooredRacr` at `:645`
```
→
```text
floored via `flooredRacr` at `:685`
```
**A.7.5**
```text
(`usableLiveAdvStats` at `:381`, then `_eff.racrLive` via `liveRacrCell` at `:646-647`
```
→
```text
(`usableLiveAdvStats` at `:419`, then `_eff.racrLive` via `liveRacrCell` at `:686-687`
```

#### CR-08

**A.8.1**
```text
(`loadNflSchedule` call site `App.jsx:1240`
```
→
```text
(`loadNflSchedule` call site `App.jsx:1298`
```
**A.8.2**
```text
`ProfileDataContext.jsx` / `App.jsx:769`
```
→
```text
`ProfileDataContext.jsx` / `App.jsx:803`
```
**A.8.3**
```text
`App.jsx:1260` loads `sosSeason`
```
→
```text
`App.jsx:1318` loads `sosSeason`
```
**A.8.4**
```text
fed by both the `sosSeason` entry and the `dataSeason` entry.⏎
```
→
```text
fed by both the `sosSeason` entry and the `dataSeason` entry. **A fifth reader since week-own-projection** — `buildImpliedTotals` in `src/utils/weeklyOwnProjection.js` (`/week`'s OURS column; reads `spreadLine`/`totalLine`/`homeTeam`/`awayTeam`/`week`/`gameType`, `spreadLine` read as positive = home favoured). **A third call site and a sixth reader since player-popup-season-phase** — `src/hooks/useGameLogSeasonLoader.js` loads `loadNflSchedule(year)` on demand for seasons below `dataSeason` (the pop-up's game-log season switcher) into the same `nflScheduleByYear` map, and `buildLiveGameLogRows` in `src/utils/liveSeasonLog.js` (the pop-up's live-season game log) reads `homeTeam`/`awayTeam`/`week`/`result`/`homeScore`/`awayScore`/`spreadLine`/`totalLine`/`roof`/`temp`/`wind` through `gameLog.js`'s helpers.⏎
```
**A.8.5**
```text
at `:99,103-104` too)
```
→
```text
at `:99,103-104` too, and `spreadLine`/`totalLine` at `:142-143` — the SPREAD/TOTAL cells, `[registry-stale]`, found by week-own-projection's plan gate)
```
**A.8.6**
```text
`src/components/dp/PlayerDetailModal.jsx` (`nflScheduleByYear?.[mostRecentSeason]`, the read behind the game-log context block)
```
→
```text
`src/components/dp/PlayerDetailModal.jsx` (`nflScheduleByYear?.[gameLogSeason]`, the read behind the game-log context block for the picked season, and `nflScheduleByYear?.[liveSeason]` for the live game log)
```
**A.8.7**
```text
added by defence-numbers-rebuild's plan gate  ‖  
```
→
```text
added by defence-numbers-rebuild's plan gate; `buildImpliedTotals` in `src/utils/weeklyOwnProjection.js` (week-own-projection), `src/hooks/useGameLogSeasonLoader.js` (on-demand `loadNflSchedule(year)`) and `buildLiveGameLogRows` in `src/utils/liveSeasonLog.js` (player-popup-season-phase)  ‖  
```
**A.8.9**
```text
`scripts/qb-takeover-run.mjs`, `scripts/qb-rookie-level-run.mjs`⏎
```
→
```text
`scripts/qb-takeover-run.mjs`, `scripts/qb-rookie-level-run.mjs`, `lib/nflverse.mjs` `parseSchedulesCsv` (writes every served field; the spread and total lines pass through with nflverse's sign — `[registry-stale]`, found by backlog-triage-registry-sync's plan gate)⏎
```
**A.8.8**
```text
a rename or reshape blanks it to `—` with no error.
```
→
```text
a rename or reshape blanks it to `—` with no error. **Since week-own-projection `spreadLine`/`totalLine` drive `/week`'s OURS column**, and the app reads `spreadLine` as positive = home favoured (nflverse's convention): a rename or null-fill blanks OURS to `—`, and a sign flip silently inverts every adjustment with no error.
```

#### CR-09

**A.9.1**
```text
(`loadNflGameLogs` call site `App.jsx:1032`
```
→
```text
(`loadNflGameLogs` call site `App.jsx:1283`
```
**A.9.2**
```text
`gameLogsByYear`, dataSeason-keyed, exposed via `ProfileDataContext.jsx` / `App.jsx:638`
```
→
```text
`gameLogsByYear`, dataSeason-keyed, widened on demand per season by the pop-up's game-log switcher (`src/hooks/useGameLogSeasonLoader.js`, `loadNflGameLogs(year)`), exposed via `ProfileDataContext.jsx` / `App.jsx:802`
```
**A.9.3**
```text
— reported, not fixed here (§8.2 of the 5b task file).
```
→
```text
— reported, not fixed here (§8.2 of the 5b task file); both named in Triggers since backlog-triage-registry-sync, together with `src/utils/qbSeason.js:13-24` `buildTeamPrimaryPassers` (reads `seasonType`/`team`/`attempts`; called at `portfolio/Portfolio.jsx:465`) and `portfolio/Portfolio.jsx:469` (`computeSeasonEfficiency(gameLogsByYear?.[dataSeason] …)`) — `[registry-stale]`, found by player-popup-season-phase's plan gate.
```
**A.9.4**
```text
and (dp-v2 Slice 5b) `src/utils/seasonEfficiency.js`  ‖  
```
→
```text
and (dp-v2 Slice 5b) `src/utils/seasonEfficiency.js`, `dp/GameLogSection.jsx` + `src/utils/gameLog.js`, `src/hooks/useGameLogSeasonLoader.js` (on-demand `loadNflGameLogs(year)`), and `buildTeamPrimaryPassers` in `src/utils/qbSeason.js` with `portfolio/Portfolio.jsx`'s `computeSeasonEfficiency` call  ‖  
```

#### CR-10

**A.10.1**
```text
`isValidTeamContext:184` + `MIN_TEAMCONTEXT_ROWS = 60` (`:177`)
```
→
```text
`isValidTeamContext:201` + `MIN_TEAMCONTEXT_ROWS = 60` (`:194`)
```
**A.10.2** — replace all **2** occurrences
```text
App.jsx:1041
```
→
```text
App.jsx:1260
```
**A.10.3** — replace all **2** occurrences
```text
App.jsx:642
```
→
```text
App.jsx:801
```
**A.10.4**
```text
`src/components/dp/PlayerDetailModal.jsx:76,516` is a live pass-through consumer in between — it reads `teamContextByYear` off `ProfileDataContext` (`:76`) and threads it into `EnvironmentSection` (`:516`)
```
→
```text
`src/components/dp/PlayerDetailModal.jsx:81,671` is a live pass-through consumer in between — it reads `teamContextByYear` off `ProfileDataContext` (`:81`) and threads it into `EnvironmentSection` (`:671`)
```
**A.10.5**
```text
`environment.js:172`
```
→
```text
`environment.js:206`
```
**A.10.6**
```text
`loadTeamContext(season)` call (`:254`
```
→
```text
`loadTeamContext(season)` call (`:211`
```
**A.10.7**
```text
`portfolio/Portfolio.jsx:350` (`buildTeamMetricsTable`, rendered by
```
→
```text
`portfolio/Portfolio.jsx:436` (`buildTeamMetricsTable`, rendered by
```
**A.10.8**
```text
`dp/PlayerDetailModal.jsx:76,516` (`[registry-stale]`
```
→
```text
`dp/PlayerDetailModal.jsx:81,671` (`[registry-stale]`
```
**A.10.9**
```text
`src/hooks/useWeeklyDecision.js:254`
```
→
```text
`src/hooks/useWeeklyDecision.js:211`
```
**A.10.10**
```text
and `portfolio/Portfolio.jsx:350` (`buildTeamMetricsTable`)  ‖  
```
→
```text
and `portfolio/Portfolio.jsx:436` (`buildTeamMetricsTable`)  ‖  
```

#### CR-11

**A.11.1**
```text
plus `:87,93,148,157` (dp-v2 Slice 4c
```
→
```text
plus `:87,93,235,244` (dp-v2 Slice 4c
```

#### CR-16

**A.16.1**
```text
`src/utils/teamExposure.js:22`, `portfolio/Portfolio.jsx:606,851,975`,
```
→
```text
`src/utils/teamExposure.js:22`, `src/utils/weeklyOwnProjection.js:45-46,61` (`buildImpliedTotals`, `vegasFactor`), `src/utils/liveSeasonLog.js:113` (`buildLiveGameLogRows`, the Sleeper→era-accurate hop for the live game log's schedule join), `portfolio/Portfolio.jsx:721,1073,1259`,
```
**A.16.2**
```text
`src/utils/teamExposure.js`, `portfolio/Portfolio.jsx` and `teams/TeamDetail.jsx` (incl. its `eraTeam` loop)
```
→
```text
`src/utils/teamExposure.js`, `src/utils/weeklyOwnProjection.js`, `src/utils/liveSeasonLog.js`, `portfolio/Portfolio.jsx` and `teams/TeamDetail.jsx` (incl. its `eraTeam` loop)
```

#### CR-17

**A.17.1**
```text
`isValidKtcSnapshot:27`
```
→
```text
`isValidKtcSnapshot:32`
```
**A.17.2**
```text
json$/` (`:19`)
```
→
```text
json$/` (`:24`)
```
**A.17.3**
```text
allowInProgress: true })` fetch (`:147`)
```
→
```text
allowInProgress: true })` fetch (`:152`)
```
**A.17.4**
```text
`src/utils/seasonProjection.js:11`/`:602`
```
→
```text
`src/utils/seasonProjection.js:11`/`:679`
```
**A.17.5**
```text
`tryDataStore:72` `allowInProgress` opt-in (`:80`)
```
→
```text
`tryDataStore:83` `allowInProgress` opt-in (`:91`)
```
**A.17.6**
```text
called on the store path at `ktcHistory.js:176` and on the live path at `src/App.jsx:249`
```
→
```text
called on the store path at `ktcHistory.js:181` and on the live path at `src/App.jsx:328`
```

#### CR-19

**A.19.1**
```text
`dropbacks:628`,
  `sackPct:629`, `ayPerAtt:630`, `yac:637`, `btkl:638`, `drops:651`;
```
→
```text
`dropbacks:668`,
  `sackPct:669`, `ayPerAtt:670`, `yac:677`, `btkl:678`, `drops:691`;
```

#### CR-21

**A.21.1**
```text
`buildScoringPosteriors` still gates on `usableLiveSeason`⏎
```
→
```text
`buildScoringPosteriors` still gates on `usableLiveSeason`; since my-team-in-season-columns `src/components/portfolio/Portfolio.jsx` (the `liveSeasonTotals` prop, passed by `src/App.jsx`'s `<Portfolio` element as `liveSeasonUsable ? currentSeasonTotals : null`; reads `season`, and `gamesPlayed`/`fantasyPoints` off player rows for My Team's so-far PPG, games and total-points position rank via `weeklyRanks.js`; since my-team-in-season-tiles also `weeklyStatus` and `team` for the in-season `GAMES MISSED` tile) and `buildLeagueLineups` in `src/utils/lineup.js` (its `liveRows` argument → the `live` side, reading `gamesPlayed`/`fantasyPoints`; ranked by `lineupStanding`)⏎
```
**A.21.2**
```text
the `qbWeekly` effect and `qbLiveStates` memo in `src/App.jsx`  ‖  
```
→
```text
the `qbWeekly` effect and `qbLiveStates` memo in `src/App.jsx`, the `liveSeasonTotals` prop and its readers in `src/components/portfolio/Portfolio.jsx`, `buildLeagueLineups`'s `liveRows` argument in `src/utils/lineup.js`  ‖  
```
**A.21.3**
```text
**the app has no way to tell in Market's In-season column set or the in-season seam**
```
→
```text
**the app has no way to tell in Market's In-season column set, My Team's in-season columns and header tiles or the in-season seam**
```
**A.21.4**
```text
Since defence-numbers-rebuild no surface states a store lag: `/week`, `/teams` and Portfolio read points allowed from Sleeper's weekly stat rows, not from this file, so a stopped job no longer shows on them at all.
```
→
```text
Since defence-numbers-rebuild no surface states a store lag: `/week`, `/teams` and Portfolio read points allowed from Sleeper's weekly stat rows, not from this file, so a stopped job no longer shows in those columns at all. Portfolio's in-season columns and header tiles (my-team-in-season-columns.md, my-team-in-season-tiles.md) do read this file, so a stopped job leaves their so-far PPG, games, rank, so-far lineup PPG and games-missed count silently stale.
```

#### CR-22

**A.22.1**
```text
(`'sleeper-user'`/`'sleeper-league'`, `:64-65`) and the boot-time auto-load effect that reads them (`:757-777`)
```
→
```text
(`'sleeper-user'`/`'sleeper-league'`, `:71-72`) and the boot-time auto-load effect that reads them (`:898-918`)
```
**A.22.2**
```text
console marker (`:738`)
```
→
```text
console marker (`:879`)
```

**Then, still Stage A:** no app test reads the registry's contents (`src/__tests__/docsAvailabilityClaims.test.js`
only asserts it stays excluded); run `npm test` as the app's smoke. Commit §A + §B together: `Registry: D-58 anchor batch (P7/P3/P4/P5b/P5c/L1) + App.jsx/dataStore.js anchor
sweep; backlog triage D-45..D-62 (L2)`. Do not push.

---

## §B. Backlog bookkeeping (Stage A, app repo `.claude/tasks/data-repo-backlog.md`)

Follow the file's own convention (struck title + a **✅ RESOLVED** line under it). `<A>` = the Stage A commit,
`<B>` = the Stage B commit (fill `<B>` in Stage B with a one-line app-repo follow-up commit, as P12b's `c400bfd` did).

1. **D-48** — strike the title; add: "**✅ RESOLVED (verified 2026-10-04, backlog-triage-registry-sync)** — data
   `70e2bf3` mirrored the CR-02 edit. Data-side check holds: `lib/sleeper.mjs` writes `weeklyPoints[week] =
   stats.pts_half_ppr` and `scoringBasis = 'half_ppr'`."
2. **D-49** — strike; add: "**✅ RESOLVED (verified 2026-10-04)** — data `93e469e` (span, CLAUDE.md count,
   Invariant 4 clause, README `players[id].inSeason`). `decideOwnVsPooled` is tested on both branches
   (`test/inseason-dyn.test.mjs` §2, `5e70512`). Residual moved to D-59: `buildConstants`' pin-write wiring
   (`scripts/inseason-run.mjs`) has no test."
3. **D-51** — strike; add: "**✅ RESOLVED (verified 2026-10-04)** — data `4f48233`. `IN_SEASON_DEFAULTS` still
   `minBaselineGames: 4`, `minBaselineOpp: 2.0`, `lookbackSeasons: 3`."
4. **D-54** — append: "**Partly done (verified 2026-10-04):** (b) and (d) are stated in CR-25's App side. Still
   open: (a), (c), (e)."
5. **D-58** — strike; add: "**✅ RESOLVED 2026-10-04** — every bullet applied by backlog-triage-registry-sync
   (app `<A>`, data `<B>`), anchors re-derived at app `b923cee`; that sync also swept every `src/App.jsx` and
   `src/api/dataStore.js` anchor in the span. Not swept: CR-04, CR-05 (`collegeMetrics.js`), CR-12, CR-13."
6. **D-59** — append: "**Also (from D-49):** a unit test of `buildConstants`' Q4 NO-GAIN pin write — both the
   own-k and the pooled-entry branch."
7. **D-61** — strike the title; replace its Status line's "kept for traceability" with "**✅ RESOLVED** —
   verified 2026-10-04 (mirror test 21/21 at data `4a52d97`)."
8. **D-62** — append: "**Legacy side confirmed 2026-10-04:** `snapshots/2026-10-03.json` (19:20:24 UTC) — 737
   rows (103 QBs by playerids plus 3 depth-chart rookie QBs with no crosswalk position), none carries `qbTakeoverBasis` or `qbStarterBasis`. The post-boundary side runs on the first
   capture after 13:43 UTC 2026-10-04 (data task `backlog-triage-registry-sync.md` §D)."
9. **Append D-63** at the end of `## Open`, verbatim from §1's "New entry, proposed (D3)" paragraph, with
   `**Found:** my-team-in-season-tiles.md · **Found by:** \`fc6cd2c\` · **Blocking:** no · **Size:** medium`
   as its first line.

---

## §C. Data byte-copy (Stage B, data repo)

Precondition: Stage A's commit exists in the sibling checkout (`git -C ../sleeper-dashboard log -1` shows it) and its
span hashes to `6ea3722a…`. Then:

1. Replace the data span with the app span byte for byte (the `sed` range of `../sleeper-dashboard/docs/cross-repo-registry.md`
   between and including the sentinel lines; everything outside the span untouched).
2. Gates: span hash = `6ea3722abfcb7587ad048743535f52e9dfc2c9298f1a69e162dde51617b6fcf4`; `git diff --stat`
   touches only `cross-repo-registry.md`; the diff is the 27 lines listed under §A's gate.
3. `REGISTRY_MIRROR=1 node --test test/registry-mirror.test.mjs` (21/21) and `node --test test/registry.test.mjs`;
   then `npm run smoke` and `npm test`. (Session 1 ran both registry tests on a scratch copy of the post-edit pair:
   21/21 and green.)
4. Commit: `Registry span byte copy from app <A> (D-58 batch + anchor sweep, L2)`. No manifest change (no data file).
5. Commit this task file (`Task file: backlog-triage-registry-sync (L2) — plan, review record`).
6. Fill `<B>` in the app backlog's D-58 line: a one-line app-repo commit made by a short app-repo follow-up session
   (or, if Anton runs Stage B from the parent folder, by that session — P12b's `c400bfd` precedent). A repo-scoped
   data session never edits the sibling.

## §D. D-62 — confirm boundaries 5 and 6 (Stage C, data repo)

**Precondition:** list `snapshots/*.json` dated 2026-10-04 or later and take the earliest by `capturedAt`; it must
come from a `daily-snapshot.yml` commit (`git log -1 --format=%s -- <file>` reads `snapshot: <date> (daily-snapshot.yml)`),
not a `bin/import-snapshot.mjs` browser export. Expected `snapshots/2026-10-04.json` tonight. If its `capturedAt` is
before `2026-10-04T13:43:00Z` and at or after `01:04:00Z`, a boundary-5-only capture exists: stop and report (step 3's
text would be false and the QB table must cite that file). Run read-only, from a scratchpad script (no repo file added):

- QB rows = `players` keys whose `nflverse/playerids.json` position (`ids[*].{sleeperId, position}`, the
  `positionOfFrom` rule in `scripts/qb-rookie-level-run.mjs`) is `QB`, **plus** every `playerId` in
  `teamDepthCharts[*].QB[]` (three 2026 rookie QBs have no crosswalk position). Rows with no position and not on a QB
  chart are reported as their own count, not held to the non-QB rule.
- Count: total rows; rows carrying `projection.factors.qbTakeoverBasis` (key present); QB rows carrying it, by value;
  rows carrying `qbStarterBasis`, by value (`null` counted as `null`).
- For each row with `qbStarterBasis` matching `rookie:<group>`: import `liveLevel` from `lib/qbRookieLevel.mjs`
  (read-only) and compare `round3(levelHalf)` with `round3(starterPPG[<group>].value)` from
  `backtests/2026-10-04-qb-rookie-level-constants.json` (`levelHalf` = `qbStarterPPG ÷ rookieBasisScale`). Report
  matches / mismatches with ids; `levelHalf: null` (no finite scale) is a mismatch.
- Report (not gated): `chain` rows where `projectedPPG ≠ round(qbStarterPPG × qbStartShare)` at the stored precision,
  and `projectedTotalPts ≠ qbStarterPPG × qbStartShare × 17` within 0.1.

**Expected:** every row carries both keys; every QB row a `qbTakeoverBasis` other than `'none'`; every other row
`qbTakeoverBasis: 'none'` and `qbStarterBasis: null`; every `rookie:*` row matches. **Any miss: stop and report** —
do not edit the anchor policy around a defect.

**Edit `grading/anchor-policy.md`** (doc, not data — no manifest entry) on a clean result:
1. QB table, row 2: replace "qb-takeover — to be confirmed against the first such capture" with "qb-takeover —
   confirmed: all `<n>` rows in `snapshots/<date>.json` (captured `<hh:mm:ss>` UTC) carry `qbTakeoverBasis`
   (`<value> <count>` · …)". Row 1 gains "— confirmed on `snapshots/2026-10-03.json` (19:20:24 UTC; 737 rows,
   none carry it)".
2. Rookie-QB table, row 2: replace "pinned group level on `'rookie:*'` rows — to be confirmed against the first
   such capture" with "pinned group level — confirmed: every row in `snapshots/<date>.json` carries
   `qbStarterBasis` (`<value> <count>` · …), and each `'rookie:*'` row's `qbStarterPPG` equals the pinned level ×
   `rookieBasisScale` to 3 dp (`<k>` rows)". Row 1 of the same table gains "— confirmed on
   `snapshots/2026-10-03.json` (19:20:24 UTC; 737 rows, none carry it)".
3. After the QB table, replace (hard-wrapped over `anchor-policy.md:113-114`; keep a similar wrap) "No such capture exists at the time of writing; the first sync after one lands fills
   this table with a confirmed row, as the other two tables carry." with "Boundary 6 was pushed 12 h 39 min later,
   before the next capture, so no capture reflects boundary 5 without boundary 6."
4. Commit: `anchor-policy: confirm boundaries 5 and 6 against snapshots/<date>.json (D-62)`. Striking D-62 in the
   app backlog with that SHA is the same kind of app-repo follow-up as §C step 6.

## Done-definition (per stage)

- **A:** both §A gates (hash, 27 lines), §B items 1–9, one commit; hand back the SHA and the post-edit hash.
- **B:** §C gates, `npm run smoke` + `npm test` green, the registry commit + the task-file commit; the app SHA fill
  per §C step 6.
- **C:** §D counts pasted into the hand-back verbatim, `npm run smoke` green, one data commit; the app strike per §D
  step 4.
- No stage pushes. Push order after sign-off: app (A + SHA fill) → data (B) same day → C whenever it lands.

## Files touched

App: `docs/cross-repo-registry.md` (span only), `.claude/tasks/data-repo-backlog.md`. Data:
`cross-repo-registry.md` (span only), `grading/anchor-policy.md` (Stage C), this task file.

## Review record — plan gate round 1 (2026-10-04)

9 flags (1 high, 3 medium, 5 low); each re-checked against live source, all applied. Re-verified after: 67 edits,
span hash `6ea3722a…`, 27 lines, `test/registry.test.mjs` 2/2 and `REGISTRY_MIRROR=1 test/registry-mirror.test.mjs`
21/21 on a scratch copy of the post-edit pair; the reviewer's own parser of this file's blocks reproduces the hash.

1. **High — QB set from playerids alone.** Confirmed: 13310, 13428, 13602 are `confidence: 'rookie'` QBs on
   `teamDepthCharts[*].QB` with no crosswalk position. §D now unions the depth-chart QBs; §1/§B wording updated.
2. **Medium — CR-02 sentence states rules `aggregateWeeks` breaks.** Applied: A.2.14/2.15 keep the "never `'D'`"
   rule and state the two gaps instead of the "team must be the week's team" rule; answer and D-63 updated (D2).
3. **Medium — `parseSchedulesCsv` missing from CR-08 data Triggers.** Applied in this sync as A.8.9 (data half of
   the CR-08 Triggers line, already a changed line, so still 27). First wording named `spreadLine`/`numOrNull` in
   parentheses and failed `registry.test.mjs`'s file-scoped symbol check (bound to the previous file); reworded.
4. **Medium — D-63 counts not reproducible.** Confirmed; my figures came from L1's report. Replaced with a
   reproducible count (859 vs 589, population stated) and the Invariant 1 note.
5. **Low — §D precondition / boundary-5-only capture / import-snapshot origin.** Applied.
6. **Low — rounding in the rookie match.** Applied: `liveLevel` from `lib/qbRookieLevel.mjs`.
7. **Low — data session committing into the app repo.** Applied: §C step 6 / §D step 4 name an app-repo follow-up
   (or a parent-folder run, `c400bfd` precedent).
8. **Low — smoke in Stage C; task file never committed.** Applied (§C step 5, done-definition).
9. **Low — QB vs rookie table legacy suffix.** Applied: both tables carry it on row 1.

Size: 43 KB, over the 40 KB signal — almost all of it is the 67 verbatim edit blocks, one atomic span change that
cannot be split without a second CR-24 red window. Not split.
