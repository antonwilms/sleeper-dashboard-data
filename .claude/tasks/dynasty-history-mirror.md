# S3a · Dynasty-score mirror, as-of-S inputs, golden parity, and the age-curve gap report

**Status:** plan, Revision 2 (Session 1, 2026-10-29). Split from the S3 plan (Revision 1, two plan-review rounds) by Anton's decision of 2026-10-29. Its companion is **S3b**, `.claude/tasks/dynasty-history-backtest.md` (the pre-registered backtest); S3b is re-fitted to S3a as built and gets its own light plan review before its build. **No third plan-review round for S3a** (Anton): its golden parity test (T-G1) is the check.
**Review depth: full** — it adds a new app-composition mirror (a new CR coupling, CR-32); it is cross-repo (registry entry + an app-side golden generator); it is new architecture (a new lib module and an as-of input builder); its age-curve report sets the priority of a scoring-affecting fix.
**Session 2:** **sonnet**, effort **high** (exact-mirror work). Run it from the **parent folder** (`Sleeper Dashboard/`): it writes the data repo (most files) and the app repo (registry entry, golden generator + its pure core + test, one doc row). Read both repos' CLAUDE.md first; run git/npm from inside each repo. After the build, Session 1 runs implementation-reviewer at **full** depth (model opus, effort high) on the diff; Anton signs off.
**Anchors:** app `main` @ `95ba1e1`, data `main` @ `a0a21e0`. Re-read every cited app line before porting; if any anchor has moved in meaning, stop and report.

---

## 0. What this is, for Anton

Two things. **First**, the machinery for S3b: a copy of the app's dynasty score in the data repo, plus a builder that reconstructs, for any past season S, exactly the inputs the app would have had at the end of S — and a test that proves the copy gives the app's own answers, row for row, by running the app's real code on the same inputs. Nothing is graded here; no outcomes are read. **Second**, a report that needs no outcomes: today's app age curves (built from Sleeper's ages, stale for players without a team) against the same curves built from true birthdates, and how many current players' age-adjusted part of the score would move. That report sets the priority of the age fix.

Not in S3a: anything that reads a season after S as an outcome, the pre-registration, the verdict — all S3b.

---

## 1. Scope

**In:** `lib/dynastyMirror.mjs` (§3); `scripts/dynasty-asof.mjs` — the as-of-S input builder with its look-ahead guard (§4); the age-curve gap report and its CLI mode `--age-curve-gap` (§5); the golden parity fixture made by running the app's own functions, and the tests (§6); CR-32 (§7); docs (§8).

**Out:** every outcome read, metric, variant run, the pre-registration and its hash, `--dynasty-history` (all S3b); any app scoring change, including the stale-age fix (its own entry in `.claude/tasks/app-repo-backlog.md`); any constant or weight; snapshot reads; KTC; `computePositionalRanks`/`computeRoleRanks`/`computeMarketDivergence`. (`computeMomentum` is ported only because the app returns its result in `signals`; it is not a score input.)

---

## 2. Touch list

| Repo | File | What |
|---|---|---|
| data | `lib/dynastyMirror.mjs` **(new)** | §3 — pure, no I/O |
| data | `scripts/dynasty-asof.mjs` **(new)** | §4 — exports `DYNASTY_ASOF_LOAD` (injectable loaders: season-totals, depth, advstats, snaps, rosterweekly, playerids, positions/raw players, scoring fixture, manifest), `LookAheadError`, `asOfLoad`, `outcomeLoad`, `readTeamS1`, `franchise`, `normName`, `ageOn`, `buildAsOfInputs`, `DynastyAsOfStop` |
| data | `scripts/age-curve-gap-run.mjs` **(new)** | §5 — `runAgeCurveGap`, `buildAgeCurveGapMarkdown`, `writeAgeCurveGapReport`, `ageCurveGapMain` |
| data | `bin/backtest.mjs` | §5.4 — `--age-curve-gap` dispatch + header doc line |
| data | `grading/<date>-age-curve-gap.md` **(new, generated)** | §5 — unregistered analysis output |
| data | `scripts/fixtures/build-dynasty-mirror-inputs.mjs` **(new, one-off, committed)** | §6.1 |
| data | `test/fixtures/dynasty-mirror-parity/inputs-2019.json`, `inputs-2023.json`, `expected-2019.json`, `expected-2023.json` **(new)** | §6.1 |
| data | `test/dynasty-mirror.test.mjs` **(new)** | §6.2 |
| data | `test/dynasty-asof.test.mjs` **(new)** | §6.3 |
| data | `test/age-curve-gap.test.mjs` **(new)** | §6.3 T-GAP |
| data | `README.md`, `CLAUDE.md` | §8 |
| data | `.claude/tasks/dynasty-history-mirror.md` (this file), `.claude/tasks/dynasty-history-backtest.md` (S3b) | commit both as the first data commit, unchanged |
| app | `scripts/verify/lib/dynastyGolden.mjs` **(new)** | §6.1 — pure `buildDynastyGolden(inputs)`; runs the app's own functions |
| app | `scripts/verify/dynasty-golden.mjs` **(new)** | §6.1 — thin CLI; ends with `main()` like `computed-stats.mjs`; no test imports it |
| app | `scripts/verify/__tests__/dynastyGolden.test.mjs` **(new)** | §6.4 — imports only `lib/dynastyGolden.mjs` |
| app | `docs/cross-repo-registry.md` | §7 — CR-32 |
| app | `docs/navigation.md` | §8 — `scripts/verify/` row amended |

Nothing else. No served data file, no manifest entry, no `data-catalog.md` or signal-registry change (no family ingested or reclassified). The stale-age backlog entry is already committed (data `a0a21e0`); S3a does not edit it.

---

## 3. The mirror — `lib/dynastyMirror.mjs`

Header in the style of `lib/projectionFactors.mjs`: "Cross-repo MIRROR CONTRACT (CR-32)", the app anchors below at `95ba1e1`, and "if the app changes any cited constant, gate or branch, re-sync or the backtest stops describing the app". Duplicate small private helpers (clamp, median, percentileRank, weightedLinearRegression, stdDev) as the app does; do not import them across modules.

**Reuse, do not re-port:** `lib/durabilityMirror.mjs` `classifyInjurySeason` and `wasContributorSeason` (CR-28, byte-equivalent to `durabilitySignals.js`). `lib/projectionFactors.mjs` `interpolateAgeCurve` (equivalent to `ageCurve.js:12-25`; its extra `Array.isArray` guard is unreachable here). Do **not** reuse `reconstructAgeCurves` (it ages rows `season − birthYear`, not the app's rule) or `reconstructShareSeries` (panel denominators, not `computeHistoricalTeamTotals`).

### 3.1 Exports and the app code each one ports verbatim

| Export | App source (`95ba1e1`) | Notes |
|---|---|---|
| `empiricalAgeCurvesMirror(careerStats, playersMap, { currentYear })` | `dynastyScore.js:14-150` (`PEAK_AGE_CAPS`, `derivePeakAge`, `median`, `rollingAvg3`, `MIN_BASIS_SCALE_ROWS`, `computeEmpiricalAgeCurves`) | `new Date().getFullYear()` (:87) becomes the `currentYear` argument — the only change. Returns `{ curves, positionPeakPPG, positionPeakAge, positionBasisScale }`. No console output. |
| `teamContextMirror(careerStats, playersMap, season, { attribution })` | `teamContext.js:165-240` + `resolveAttributedTeam` (:20) | **One deliberate fix:** in `'per-season-team'` mode skip `TEAM_*` ids (`isTeamAggregateId`, :37) in both loops. The app never runs this function per-season; its own comment (:158-163) says a migration must adopt this filter. `'current-team'` mode is verbatim. |
| `historicalTeamTotalsMirror`, `historicalSharesMirror` | `teamContext.js:252-321` | verbatim, both modes; each returns exactly the app's shape (the bare `{ [pid]: [...] }` map for shares). The app's `share > 1` `console.warn` is replaced by a separate export `countSharesAboveOne(shares)` used only for the panel's `meta.checks`; T-G1 compares the bare map. |
| `momentumMirror(ppgs, meanPPG)` | `momentum.js:18-35` | verbatim; its result appears in the app's `signals` (`dynastyScore.js:889, 1074-1075`), so parity needs it |
| `shareTrendMirror(shareHistory)` | `teamContext.js:326-361` | verbatim |
| `pickDynastyLabelMirror(args)` | `dynastyLabel.js:8-51` | verbatim |
| `consistencyMirror(ppgs)` | `regressionSignals.js:29-34, 72-78` | verbatim |
| `breakoutFlagMirror`, `bounceBackFlagMirror`, `tdRelianceMirror` | `projectionSignals.js:14-18, 31-36, 64-92, 105-115` | verbatim; bounce-back takes the score's own `seasonHistory` (not `durabilityMirror.bounceBackFlag`, which builds its own qualifying list) |
| `prospectScoreMirror(...)` | `dynastyScore.js:503-619` (`POSITION_PRIOR_PPG`, `ageMultiplier`, `draftMultiplier`, `normalisePPG`, `NO_MARKET_CAP`, `validProspectEntry`, `computeProspectScore`) | verbatim, no console |
| `dynastyScoreMirror(playerId, playersMap, careerStats, curves, positionPeakPPG, dynastyDraftPick, scoringSettings, ktcMap, teamContext, depthMap, historicalShares, positionPeakAge, positionBasisScale, inSeasonLevel, prospectLevel, options = {})` | `dynastyScore.js:152-251, 625-668, 674-1093` | Same positional signature and return shape as the app (all paths A–A4, B, C, non-finite fallback). Plus one additive key **`raw`** on Paths B/C only (§3.2). `options` (§3.3) all default to app behaviour. |
| `composeDynastyScore(raw, weights = DYNASTY_WEIGHTS)` | `dynastyScore.js:984-1008` | `DYNASTY_WEIGHTS = { ageAdjusted: 0.28, trajectory: 0.25, currentLevel: 0.22, reliability: 0.10, opportunityQuality: 0.15 }`. The sum is written as one expression in the app's fixed term order, whatever the object's key order: `Math.round(raw.ageAdjScore*w.ageAdjusted + raw.trajectoryScore*w.trajectory + raw.currentLevelScore*w.currentLevel + raw.effectiveReliability*w.reliability + raw.opportunityScore*w.opportunityQuality)` (`:989-995`). The reliability term is **`effectiveReliability`** (after the ×0.90 TD-reliance penalty, `:984-986`), never `reliabilityScore`. Then if `raw.seasonsOfData ≤ 2`, `Math.round(raw.prospectScore*0.4 + component*0.6)` (`:1003`). With default weights it must equal `dynastyScoreMirror(...).score` (T-G2). |
| `applyQBQualityModifierMirror(row, qbQualityByTeam)`, `qbQualityByTeamMirror(rows, depthMap, includeUnrostered)` | `teamContext.js:50-160` | verbatim; used only by ablation A-QB |

The app's `computeKTCPositionPercentile` (:480-497) is ported too (it returns `null` when `ktcMap` is null, which is every call here), so the path routing is the app's own.

### 3.2 `raw` (Paths B/C only)

`{ ageAdjScore, trajectoryScore, currentLevelScore, reliabilityScore, effectiveReliability, consistencyScore, durabilityScore, opportunityScore, rawOpportunityScore, prospectScore /* Path B only, else null */, seasonsOfData, currentPPG, isTdReliant }` — unrounded where the app holds them unrounded. Nothing in the app's returned keys changes.

### 3.3 `options` (ablation seams; defaults = app)

- `targetShareOverride: Map<pid, number> | null` — replaces `playerShare.targetShare` for WR/TE before `computeOpportunityQuality` (A-C1).
- `shareTrendBoostOff: (pid) => boolean | null` — when true for the player, `shareTrendBoost = 0` (A-ST).
- `reliabilityMix: { consistency: 0.45, durability: 0.55 }` (A-AV).

No other knob. A seam must leave the default path byte-identical (golden test runs with `options = {}`). A-AGE-APP needs no seam: it only changes the `curves`/`positionPeakPPG`/`positionPeakAge`/`positionBasisScale` arguments S3b's adapter passes in.

---

## 4. As-of-S inputs — `buildAsOfInputs(load, S, { curveAgeMode, gamesMode })` in `scripts/dynasty-asof.mjs`

Every loader call goes through `asOfLoad(load, S)`, which **throws `LookAheadError`** for any season-keyed read with year > S (season-totals, depth, advstats, snaps, rosterweekly). Two reads go through a separate `outcomeLoad` and never feed this builder: S3b's outcomes, and — after the inputs are built — the S+1 season-totals row's `team` field only, for `teamS1`/`changer` (S3b's A-ST-chg selection and panel). The function that reads `teamS1` returns only that string. Test: §6.3 T-LA.

| Input | Built from | App equivalent | Deliberate difference (S3b's verdict lists each) |
|---|---|---|---|
| `careerStats` | `nfl/season-totals/2012…S.json` through `leagueBasisLoad(load, { scoringSettings, positionOf })` (`lib/leagueBasis.mjs`); TEAM_* rows kept (the app keeps them; the mirror filters where the app does) | the app's league-rescored careerStats 2012…dataSeason | **Left-truncated history:** early cohorts see only 2012…S (S = 2015 has four seasons). Reported per cohort. |
| `scoringSettings` | `test/fixtures/league-scoring-2026-10-14.json` (`LEAGUE_SCORING_FIXTURE`, `scripts/panel-run.mjs:79`) | the league's | none (same league) |
| `positionOf` / `playersMap[pid].position` | `loadLeaguePositions()` (`raw/-players-nfl.json`, 2026-05-18) | live `/players/nfl` | The 2026 position is applied to every S (a later position change, e.g. WR→RB, is back-applied). Same as the app's own back-application. |
| `playersMap[pid].age` | Always (every variant, including A-AGE-APP): whole years completed on **`(S+1)-06-01`** from `nflverse/playerids.json` `bySleeper[pid].birthdate`; no birthdate or no crosswalk entry → `null` | Sleeper `player.age` | **Material, measured.** Sleeper's `age` is stale for players without a team (plan review, `raw/-players-nfl.json` vs birthdates: active skill players 721/756 within ±1 y; no-team players 358/1956; on 2015 gp ≥ 10 skill rows — the app's curve inputs — Sleeper-derived age minus true age averages −4.26 y, 315/349 off by > 1 y). H therefore uses true ages; the app's way is S3b's ablation A-AGE-APP, and S3a's age-curve gap report (§5) measures today's gap. The run re-measures the gap for every S (mean and count off by > 1 y, over that S's curve-input rows) into `meta.checks.ageGap[S]` and `deliberateDifferences`. 1 June is a pinned convention (the app shows careerStats-through-S from February to September; 1 June is the middle and the rookie-draft window). |
| `playersMap[pid].years_exp` | `(S+1) − bySleeper[pid].draftYear`; draftYear `null` **or `0`** (playerids' unknown-year value), or no crosswalk entry → `(S+1) − firstSeason` where firstSeason = first season ≥ 2012 with **Sleeper** `gamesPlayed > 0` (always the season-totals value, in both games modes, so routing never differs by mode through this fallback) | Sleeper `years_exp` | Derived. **Check (stop):** on active skill players in `raw/-players-nfl.json` (non-null `team`, draftYear ≥ 2013), `years_exp === 2026 − draftYear` must hold for ≥ 90% (pre-measured by Session 1: 758/801 = 94.6%). Used only for path routing. Count the `draftYear 0` and no-entry fallbacks in `meta.checks`. |
| `playersMap[pid].team` | season-S row `team` (era code) | Sleeper current team | Used only by A-QB's team lookup and the golden's current-team mode. |
| curves (`empiricalAgeCurvesMirror` call) | `curveAgeMode: 'birthdate'` (H): `playersMap` as above, `currentYear = S + 1`, over careerStats ≤ S — this ages each curve row exactly by the player's true age; `'app-sleeper'` (S3b's A-AGE-APP): a curve-only players map whose `age` is the raw Sleeper `age` from `raw/-players-nfl.json` (captured 2026-05-18; missing → `null`, so the row drops out of the curve as in the app) and `currentYear = 2026`, over careerStats ≤ S — the app's formula `round(age − (2026 − season))` on today's ages, as the live app builds it. The scored players' own ages stay the birthdate ages in both modes. | wall-clock year, live Sleeper ages | A-AGE-APP reads a 2026 capture of ages. That is deliberate: it reproduces the app's current curve, stale ages included. It is **today's app curve error transported to S — it contains post-S information** (a teamless player's Sleeper age froze around the year he left the league, after S and correlated with his outcome) **and is not the error the app had at S**. Every place that reports it says so in those words. |
| `teamContext` | `teamContextMirror(careerStats, playersMap, S, { attribution: 'per-season-team' })` | **current-team** (`App.jsx:243-252`) | **Per-season-team attribution** (the S row's own team) instead of the app's pinned current-team. The app's current-team mode applied to history would credit a mover's old seasons to his new team. Stated, not ablated. |
| `historicalShares` | `historicalSharesMirror(careerStats, playersMap, historicalTeamTotalsMirror(…, per-season-team), per-season-team)` | `historicalSharesCurrentTeam` (`App.jsx:296-306`) | same as above |
| `depthMap` | Shape is the app's: **`{ [pid]: { depthOrder } }`** (`App.jsx:254-261`; read as `depthMap?.[playerId]?.depthOrder`, `dynastyScore.js:952`). Built as: `nflverse/depth/S.json`, week W = the largest week key ≤ the REG week count of S (17 for S ≤ 2020, 18 from 2021); `const idx = depthOrderIndex(depthFile, W)` (`lib/inSeasonEvidence.mjs:138`, an index keyed `` `${position}|${pid}` ``); for each skill pid, `d = idx.get(`${sleeperPosition}|${pid}`)`; `d != null` → `depthMap[pid] = { depthOrder: d }`, else no entry. **Stop** if the resulting map has 0 entries for any S. | Sleeper `depth_chart_order` | End-of-regular-season chart, not the offseason chart the app reads. **Stop** if week W has fewer than 30 teams. Confirm in README "File schemas → depth" that week keys are REG weeks; if keys above the REG count exist, they are ignored by the rule above. |
| `dynastyDraftPick` | `null` | league rookie draft pick | No league draft history. `draftMultiplier(null) = 0.75` and the no-market cap apply to every Path B prospect prior. Path B is reported separately in S3b. |
| `ktcMap` | `null` | KTC | Excluded (no history). |
| `inSeasonLevel`, `prospectLevel` | `null` | live-season level | Offseason state: no live season. |
| `positionBasisScale` | from `empiricalAgeCurvesMirror` on the rescored rows | same | The rescore must leave `sourceScoringBasis`/`sourceFantasyPoints` on rows (`lib/leagueBasis.mjs:103`). Confirm; else stop. |

**`gamesMode`:** `'sleeper'` (season-totals `gamesPlayed`) or `'snaps'`: for each season row 2013+, `gamesPlayed := nflverse/snaps/<y>.json players[pid].games` when that entry exists, `games > 0`, **and the name guard passes**, else Sleeper's. Name guard (D-77 prerequisite (3), for D-87 — e.g. Sleeper `3344` carries Kyle Carter's PFR id): `norm(snapsEntry.name) === norm(sleeperName)`, with `sleeperName` = `raw/-players-nfl.json` `full_name ?? `${first_name} ${last_name}``, and where `norm` lowercases, removes every character outside a–z, and then strips at most one trailing suffix, testing `iii` first, then `ii`, `iv`, `jr`, `sr` (longest first, so `kennethwalkeriii` → `kennethwalker`). A failing row keeps Sleeper's count and is counted (`meta.checks.snapsNameGuardSkips`, by season). Name variants (D-87 lists 12, e.g. Hines/Miller-Hines) also fail and keep Sleeper's count; this is accepted. `dnpWeeks`, points and stats untouched. This is D-77 definition (c) — "any snap incl. special teams" — at season level; D-77's adopted (d) adds per-week fallbacks the served snaps file cannot express (it keeps no per-week rows). The verdict says so and prints the count of player-seasons where the two counts differ (D-77 measured 70 under (d), 2013–2025). The mode is applied identically to inputs (§4) and outcomes (§6).

---

## 5. The age-curve gap report — `scripts/age-curve-gap-run.mjs`

Report-only. It reads **no outcome season**: only completed season-totals 2012–2025 (league-rescored through `leagueBasisLoad`, the same as §4), `raw/-players-nfl.json` (Sleeper's ages, captured 2026-05-18), `nflverse/playerids.json` birthdates, and the S = 2025 as-of inputs from §4. The run refuses `2026.json` (via `asOfLoad(load, 2025)`).

### 5.1 Curves
- **Reference date** D = `2026-05-18` (the Sleeper capture's date), `currentYear = 2026`.
- **APP** = `empiricalAgeCurvesMirror(careerStats, appMap, { currentYear: 2026 })`, where `appMap[pid] = { position, age: raw Sleeper age }` — exactly the live app's curve.
- **BIRTH** = the same call with `age = ageOn(birthdate, D)` (whole years completed on D; no birthdate → `null`, so the row drops out as in the app).
- Tables, per position: one row per age bucket present in either curve — rows feeding the bucket (APP n, BIRTH n), smoothed `medianPPG` (APP, BIRTH, Δ = BIRTH − APP); then derived and capped peak age and `positionPeakPPG` for each; and `positionBasisScale` for each (expected equal — say so if not).
- **Row-level gap**, over the curve's input rows (gp ≥ 10 skill rows 2012–2025, both ages non-null): count, mean (APP age at the season − BIRTH age at the season), count with |gap| > 1 y; split by whether the player has a non-null `team` in the raw map. Print the measured 2015 figures beside the plan review's (−4.26 y, 315/349) as a check, not a gate.

### 5.2 Current players' age-adjusted component
- **Population:** skill pids with a non-null `team` in `raw/-players-nfl.json` whose `dynastyScoreMirror` at S = 2025 (the §4 inputs with `curveAgeMode: 'birthdate'` replaced as below) is Path B or C under setting (a). Count by position; count excluded by path.
- **Three settings**, all on the S = 2025 as-of inputs (offseason state: no live level, no KTC, per-season-team attribution; §4):
  - (a) **app today:** scored ages = Sleeper ages, curves = APP;
  - (b) **curve fix only:** scored ages = Sleeper ages, curves = BIRTH;
  - (c) **full fix:** scored ages = `ageOn(birthdate, D)`, curves = BIRTH.
- For (b − a) and (c − a), per position and pooled: rows; rows where `components.ageAdjusted.value` changes; rows with |Δ| ≥ 5; Δ distribution (min, p10, median, mean, p90, max); and the same for the total `score` Δ, labelled "this mirror's offseason score, not the live app score (no KTC, live level, QB modifier; per-season-team attribution)". Then the 15 largest |Δ ageAdjusted| under (c − a): name (raw `full_name`), position, Sleeper age, birthdate age, (a), (c), label (a) → (c) if it changes.
- No label, threshold or recommendation. The report closes with one line: "Report-only. The priority of the age fix is Anton's decision (backlog: 'Age curves and age inputs read stale Sleeper ages')."

### 5.3 Output
`grading/<date>-age-curve-gap.md`: header (date, data rev, inputs named in §5), §5.1 tables, §5.2 tables, the closing line. Unregistered analysis output (the Invariant 3 exception for `grading/` reports). `--json` prints the result object instead.

### 5.4 CLI
`node bin/backtest.mjs --age-curve-gap [--json] [--write]`; any other flag → error "the inputs and reference date are pinned by the task file, not knobs", exit 1 (copy the `--games-calibration` reject block, `bin/backtest.mjs:259-267`). `--write` writes the report; without it, print to stdout.

---

## 6. Golden parity and tests

### 6.1 Golden fixture (the mirror reproduces the app)
1. **Data-side builder** `scripts/fixtures/build-dynasty-mirror-inputs.mjs` (one-off, committed; precedent `scripts/fixtures/build-season-grade-inseason-fixture.mjs`). For S ∈ {2019, 2023} it calls `buildAsOfInputs(load, S, { curveAgeMode: 'birthdate', gamesMode: 'sleeper' })` and writes `test/fixtures/dynasty-mirror-parity/inputs-<S>.json`: `{ S, currentYear, scoringSettings, playersMap: {pid: {position, age, years_exp, team}}, depthMap, careerStats }` (`depthMap` in the app's `{ [pid]: { depthOrder } }` shape, §4), with a trimmed universe: every skill-position pid whose S or S−1 row `team` is one of `['ATL','BUF','CHI','DAL','DEN','GB','KC','LA','MIN','NE','NYG','PHI','PIT','SEA','SF','TB']` (era codes as stored — the Rams are `LA` in 2016–2025; `LAR` never occurs in season-totals; **amended 2026-10-29 by Session 1** from the original 8 teams after Session 2's pre-check stop: QBs fell below the floors with 8 teams (2019: 4 B / 6 C; 2023: 2 B / 12 C) and with 12 teams (2019: 4 B / 11 C); with these 16, Session 2 measured QB 5 B / 17 C (2019) and 7 B / 20 C (2023), 430 and 571 pids, ≈ 1.26 MB together; the floors are unchanged), all of that pid's seasons 2012…S, plus every `TEAM_*` row; rows slimmed to `gamesPlayed, gamesStarted, dnpWeeks, fantasyPoints, sourceFantasyPoints, sourceScoringBasis, team` and `stats` keys `{rush_att, rush_yd, rec, rec_yd, rec_tgt, rush_rz_att, rec_rz_tgt, pass_att, pass_yd, off_snp, tm_off_snp, rush_td, rec_td, pass_td, rush_2pt, rec_2pt, pass_2pt, def_td, def_st_td, st_td, fum_rec_td}` (the full read set of the ported code — confirm by grep of the ported functions; add any key found, never drop one). Both files together ≤ 3 MB (**stop** above and report sizes; do not shrink the universe without a fix pass). Builder pre-checks, using the **mirror's** routing (the app's output does not exist yet): each input file has ≥ 5 Path B and ≥ 15 Path C skill rows per position, all 16 teams present in season S, and ≥ 1 `depthMap` entry per position; else stop and report counts. T-G3 repeats the B/C count check on the app's `expected-*.json` after generation.
2. **App-side generator.** Pure core `sleeper-dashboard/scripts/verify/lib/dynastyGolden.mjs` exporting `buildDynastyGolden(inputs)` (no I/O); thin CLI `scripts/verify/dynasty-golden.mjs`, run as `node_modules/.bin/vite-node scripts/verify/dynasty-golden.mjs -- --data ../sleeper-dashboard-data` (precedent `computed-stats.mjs`, which ends with an unconditional `main()` and keeps pure logic in `scripts/verify/lib/`; never imported by `src/` or by any test). The CLI reads each `inputs-<S>.json`, calls `buildDynastyGolden`, and writes `expected-<S>.json` with `sourceRev` = app `git rev-parse --short HEAD`, serialised with `JSON.stringify` (so `-0` is written as `0`). `buildDynastyGolden`:
   - overrides `globalThis.Date` for the duration with a subclass whose no-argument construction and `Date.now()` give `${currentYear}-06-01T12:00:00Z`, and restores it in `finally`; silences `console.log/warn/info` likewise;
   - calls the app's `computeEmpiricalAgeCurves(careerStats, playersMap)`;
   - for each attribution mode `'current-team'` and `'per-season-team'`: `computeTeamContext` (per-season mode is given `careerStats` with `TEAM_*` rows removed from season S only — the app function lacks the filter; this makes the golden test the mirror's deliberate fix as "app function on filtered input"), `computeHistoricalTeamTotals`, `computeHistoricalShares`;
   - for every skill pid in `playersMap`, in both modes: `computeDynastyScore(pid, playersMap, careerStats, curves, positionPeakPPG, null, scoringSettings, null, teamContext, depthMap, historicalShares, positionPeakAge, positionBasisScale, null, null)`;
   - `applyQBQualityModifier` on every components-path non-QB row with a fixed synthetic map `{ <every team>: 30 }` and, separately, `{ <every team>: 85 }`;
   - writes `{ sourceRev, S, curves, positionPeakPPG, positionPeakAge, positionBasisScale, teamContext: {mode → value}, historicalShares: {mode → value}, scores: {mode → {pid → result}}, qbMod: {30|85 → {pid → result}} }`.
3. Commit order: data inputs + builder (data commit), then the app generator and `expected-*.json` (app commit for the script; data commit for the expected files), each citing the other repo's SHA per the cross-repo commit-ID rule.

### 6.2 `test/dynasty-mirror.test.mjs` (data; reads only `test/fixtures/` — Invariant 10)
- **T-G1 parity:** for both S and both modes, the mirror on `inputs-<S>.json`, normalised as `JSON.parse(JSON.stringify(x))` (so `-0` compares as `0`, matching the serialised expected file), deep-equals `expected-<S>.json` for curves/peaks/basis scale, teamContext, historicalShares (the bare map), and for every pid: the app's full returned object (score, label, confidence, isRookie, components, signals — including `momentum`/`momentumLabel`) — the mirror's extra `raw` key excluded from the comparison. QB-modifier rows likewise.
- **T-G2:** `composeDynastyScore(raw)` equals the mirror's `score` for every B/C row in both fixtures.
- **T-G3:** in each `expected-<S>.json` (the app's routing), ≥ 5 Path B and ≥ 15 Path C rows per position; ≥ 1 row of each other path that occurs (A, A2, A3), with per-path counts in the assertion message; and > 0 rows whose `signals.depthOrder` is non-null per position (so a wrong depthMap key cannot pass silently).
- **T-U1 seams:** each `options` seam at its default leaves every T-G1 row identical; `reliabilityMix {0.45, 0.55}` explicit equals default.
- **T-U2 TEAM_ filter:** a synthetic season where a `TEAM_X` row would double team totals — per-season `teamContextMirror` shares are not halved; current-team mode ignores the row (no playersMap entry), as the app.
- **T-U3 currentYear:** the same careerStats with `currentYear` 2020 vs 2021 shifts every curve row's age by one.
- **T-U4 injury look-ahead:** for a player with an S+1 row in the store, `classifyInjurySeason` over the as-of view (≤ S) returns the result without the S+1 rescue (use `seasonView`).

### 6.3 Input and report tests (synthetic in-memory loaders; no store reads)
`test/dynasty-asof.test.mjs`:
- **T-LA look-ahead guard:** `asOfLoad(load, S)` throws `LookAheadError` on every season-keyed family for S+1 and passes for S; `buildAsOfInputs` on a load whose S+1 files hold sentinel values produces inputs identical to a load without them. `readTeamS1` returns only the `team` string.
- **T-AGE:** `ageOn` across a birthday boundary (born 06-01 and 06-02, D = 06-01); missing birthdate → null. `curveAgeMode: 'app-sleeper'` builds curves from the raw Sleeper ages with `currentYear` 2026 while the scored `playersMap` ages are unchanged; a player with null Sleeper age drops out of the curve only.
- **T-YE:** years_exp from draftYear, from the first-season fallback, `draftYear: 0` → fallback, and the fallback reading Sleeper `gamesPlayed` under `gamesMode: 'snaps'`.
- **T-FR:** `franchise` maps STL/SD/OAK to LA/LAC/LV; a Charger with S = 2016 row `SD` and S+1 row `LAC` is not a changer; a real move is.
- **T-NAME:** the snaps name guard: equal after `normName`; `Jr.` stripped; `Kenneth Walker III` → `kennethwalker`; a mismatch keeps Sleeper's count and is counted.
- **T-DEPTH:** the REG-week cap (17 vs 18), null-slot preservation via `depthOrderIndex`, and the `{ [pid]: { depthOrder } }` shape.
- **T-GAMES:** snaps substitution (entry with games > 0, games = 0, absent, name mismatch, 2012) changes only `gamesPlayed`.

`test/age-curve-gap.test.mjs`:
- **T-GAP:** on a synthetic store, APP and BIRTH curves differ exactly where Sleeper and birthdate ages differ; the (a)/(b)/(c) settings change only what they name; moved-row counts and the distribution are correct on hand-computed values; the loader refuses 2026; `--age-curve-gap --basis league` exits 1 with the pinned message.

### 6.4 App `scripts/verify/__tests__/dynastyGolden.test.mjs`
Imports only `scripts/verify/lib/dynastyGolden.mjs` (never the CLI file, whose `main()` would run). `buildDynastyGolden` on a three-player inline input: deterministic across two calls; `globalThis.Date` and `console.log` are the originals afterwards (also when a callee throws); the curve ages follow the injected `currentYear`.

---

---

## 7. CR-32 (app `docs/cross-repo-registry.md`, appended after CR-31)

Copy this block exactly — it is sized to the cap:

```
#### CR-32 · Dynasty-score mirror
- **Invariant:** The data mirror reproduces `computeDynastyScore` and its inputs exactly on the golden fixture; offline only.
- **App:** `src/utils/dynastyScore.js` (`computeDynastyScore`, `computeEmpiricalAgeCurves`, `computeProspectScore`, `computeKTCPositionPercentile`); `src/utils/dynastyLabel.js` (`pickDynastyLabel`); `src/utils/teamContext.js` (`computeTeamContext`, `computeHistoricalTeamTotals`, `computeHistoricalShares`, `computeShareTrend`, `computeQBQualityByTeam`, `applyQBQualityModifier`, `resolveAttributedTeam`, `isTeamAggregateId`); `src/utils/projectionSignals.js` (`computeBreakoutFlag`, `computeBounceBackFlag`, `computeTdReliance`); `src/utils/regressionSignals.js` (`computeConsistency`); `src/utils/momentum.js` (`computeMomentum`); `src/utils/ageCurve.js` (`interpolateAgeCurve`); `scripts/verify/lib/dynastyGolden.mjs` (`buildDynastyGolden`)
- **Data:** `lib/dynastyMirror.mjs` (`dynastyScoreMirror`); `lib/durabilityMirror.mjs` (`classifyInjurySeason`)
- **Tests:** `test/dynasty-mirror.test.mjs`
```

The App field lists the main ported definition sites, not every helper (private helpers such as `percentileRank`, `getEfficiencyAndVolume`, `computeOpportunityQuality` and `recencyWeightedPPG` live in the files already listed). `interpolateAgeCurve`'s data-side port is the reused `lib/projectionFactors.mjs`, already a CR-15 Data site; it is not repeated in the Data field (no bytes left). Measured by Session 1: the block plus its separating blank line is 1062 bytes, taking the index from 10,896 to 11,958 against the 12,000 cap (`crossRepoIndex.test.js:11`) — 42 bytes of headroom. **Stop** if the edit takes the index over 12,000 bytes — do not prune another entry or shorten a site list in this slice. Run both registry tests (`src/__tests__/crossRepoIndex.test.js`, `test/registry.test.mjs`). The data-repo CLAUDE.md "Cross-repo contracts" section needs no change.

---

## 8. Docs

- Data `README.md`: Module notes rows for `lib/dynastyMirror.mjs` (CR-32), `scripts/dynasty-asof.mjs` (as-of-S builder, look-ahead guard, deliberate differences — §4's table, short form) and `scripts/age-curve-gap-run.mjs`; the backtest-modes list gains `--age-curve-gap` ("offline; report-only; reads no outcome season").
- Data `CLAUDE.md` (20,382 bytes; 25,000 ceiling): Commands table Backtest row gains `--age-curve-gap`; the `lib/backtest.mjs` navigation row gains "`lib/dynastyMirror.mjs` the mirror of the app's dynasty score (CR-32), fed by `scripts/dynasty-asof.mjs`"; the `backtests/, grading/, verification/` row's unregistered list gains `<date>-age-curve-gap.md`. Nothing else.
- App `docs/navigation.md:66` `scripts/verify/` row: its current claim "writes only `<data>/verification/`" becomes false, so amend it: the harness `computed-stats.mjs` writes only `<data>/verification/`; `dynasty-golden.mjs` (pure core `lib/dynastyGolden.mjs`, CR-32) reads `<data>/test/fixtures/dynasty-mirror-parity/inputs-*.json` and writes `expected-*.json` beside them, run as `node_modules/.bin/vite-node scripts/verify/dynasty-golden.mjs -- --data ../sleeper-dashboard-data`. Mechanism wording only (`docsAvailabilityClaims.test.js`).

---

## 9. Backlog and calendar

S3a closes no backlog item and no calendar line, and appends to none: the stale-age entry is already written (data `a0a21e0`) and points at §5's report; Anton sets its priority from the report. The D-77 and D-79 appends belong to S3b.

---

## 10. Stops (report, never improvise)

- An app anchor in §3.1 has changed meaning since `95ba1e1`.
- Golden parity (T-G1) fails on any row after a faithful port — report the first 10 differing rows; do not adjust the mirror to fit without finding the app-side reason.
- years_exp agreement < 90% (§4); depth week W has < 30 teams or the depthMap is empty for some S; the rescore drops `sourceScoringBasis`; golden inputs > 3 MB or the §6.1 pre-checks fail; the registry > 12,000 bytes.
- Anything in the ported code that reads a field the slim fixture drops, or any design question this file does not answer.

---

## 11. Done-definition and hand-back

1. Data: `npm test` and `npm run smoke` green. App: `npm test`, `npm run lint` (0), `npm run build` (clean) green.
2. **Done = T-G1 green** on goldens regenerated from app `HEAD`; `expected-*.json` `sourceRev` named in the hand-back.
3. `node bin/backtest.mjs --age-curve-gap --write` run once on data `main`; the report committed. Paste its §5.2 pooled (c − a) line and the 2015 row-gap check into the hand-back.
4. README / CLAUDE.md / navigation.md / registry updated.
5. Commit in each repo, citing the other repo's SHAs per the cross-repo commit-ID rule; **push only after Anton's sign-off** (`git pull --rebase` first, never `--force`).
6. Hand-back to Session 1: SHA ranges in both repos, every file touched, every deviation from this file, what each new test asserts, the golden `sourceRev`, the per-path counts in each golden input, and the §6.1 universe sizes. Session 1 runs implementation-reviewer at full depth on the diff before Anton's sign-off.
