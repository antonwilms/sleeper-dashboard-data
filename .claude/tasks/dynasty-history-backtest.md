# S3b · Dynasty score — first historical test (end-of-season-S rebuild, three-season outcome)

**Status:** plan, Revision 4 (Session 1, 2026-10-30; folds in the 8 light-review flags on Revision 3, no further round — Anton) — re-fitted to S3a as built (§4) and to Anton's age decision of 2026-10-30 (option A, §8.11). Split from the S3 plan (Revision 1, two plan-review rounds) on 2026-10-29. **Prerequisite: S3a** (`.claude/tasks/dynasty-history-mirror.md`), signed off and pushed 2026-10-30 (data `4a264b1..605f132`, app `5209582..231554f`). Plan-reviewer at **light** depth on this revision (Anton); then Anton approves before the build.
**Review depth: full** — it is the evidence base for the next scoring decision (S4, the dynasty weights) and holds a pre-registration; the plan review of the re-fit runs at light depth by Anton's decision, the implementation review at full.
**Session 2:** **sonnet**, effort **high**. Run it from the **parent folder** (`Sleeper Dashboard/`): it writes the data repo and two backlog files (data `.claude/tasks/app-repo-backlog.md`, app `.claude/tasks/data-repo-backlog.md`). Read both repos' CLAUDE.md first; run git/npm from inside each repo.
**Anchors:** app `main` @ `231554f`, data `main` @ `605f132`. The golden fixtures' app `sourceRev` is `5209582`.

---

## 0. What this is, for Anton

Rebuild every veteran's dynasty score as the app would have shown it at the end of season S (2015–2024), using only what was knowable then, and check it against what those players actually did in the next three seasons. It answers: does the score rank veterans better than simply ranking them by last season's points? Which of the five parts earn their weight? Does it misjudge any age group? Offline research — nothing reaches the app's scoring. The verdict says what the evidence supports and what it does not; it never proposes weights (that is S4). The copy of the score and the as-of inputs are S3a's; S3b grades them.

It also asks whether a sounder age curve predicts better: H (true ages, guarded peak) against the app's current curve and a within-player curve (§8.11).

Not in this test, and stated in the verdict: prospects (first- and second-year players), everything KTC-based (no KTC history before 2026-05), the league rookie-draft pick, the in-season live level, and — in the headline — the QB-quality modifier (tested separately, §8.6 A-QB).

**CR-01 is not amended:** this historical rebuild reads no snapshot field; a later forward grader of captured `players[id].dynasty` scores amends it.

---

## 1. Scope

**In:** the scored population, outcomes, variants, the two S3b-owned age-curve builders (§8.11, `lib/ageCurveVariants.mjs`), the pre-registered analysis (§5–§8), the verdict and panel outputs (§9), the CLI mode `--dynasty-history` (§10), tests (§11), docs (§13), backlog appends (§14).

**Out:** the mirror, the as-of builder, golden parity, CR-32 and the age-curve gap report (all S3a; S3b changes none of them — a needed change is a stop); any app scoring change, including the stale-age fix; any constant or weight; snapshot reads; KTC; prospects (Path A) in the scored population.

---

## 2. Touch list

| Repo | File | What |
|---|---|---|
| data | `scripts/dynasty-history-run.mjs` **(new)** | §5–§10 — adapter: injectable loaders (reusing S3a's `DYNASTY_ASOF_LOAD`), rows, variants, metrics, verdict, writer, `dynastyHistoryMain` |
| data | `lib/ageCurveVariants.mjs` **(new)** | §8.11 — pure: `guardedAgeCurves`, `deltaAgeCurves`, `PEAK_GUARD_MIN_ROWS`; imports from `lib/dynastyMirror.mjs` only what it exports (`PEAK_AGE_CAPS`, `MIN_BASIS_SCALE_ROWS`); duplicates `median`/`rollingAvg3` privately (the mirror keeps them private) |
| data | `bin/backtest.mjs` | §10 — `--dynasty-history` dispatch + header doc line |
| data | `test/dynasty-history.test.mjs` **(new)**, `test/age-curve-variants.test.mjs` **(new)** | §11 |
| data | `backtests/<date>-dynasty-history-panel.json`, `grading/<date>-dynasty-history-verdict.md` **(new, generated)** | §9 |
| data | `README.md` (Module notes, backtest modes), `CLAUDE.md` (Commands row, `lib/backtest.mjs` nav row) | §13 |
| data | `.claude/tasks/app-repo-backlog.md` | §14 — append to the stale-age entry |
| app | `.claude/tasks/data-repo-backlog.md` | §14 — D-77 and D-79 appends |

Nothing else. No served data file, no manifest entry, no registry, `data-catalog.md` or signal-registry change.

---

## 3. Inputs (built in S3a, as merged at data `605f132`)

S3b imports S3a's modules and changes none of them (a needed change is a §15 stop).

- **`scripts/dynasty-asof.mjs`:** `DYNASTY_ASOF_LOAD` (loaders `loadSeasonTotals`, `loadDepth`, `loadAdvstats`, `loadSnapShare`, `loadRosterWeekly`, `loadPlayerIds`, `loadRawPlayers`, `loadLeaguePositionOf`, `loadLeagueScoring`, `loadManifest`); `LookAheadError`, `DynastyAsOfStop`; `asOfLoad(load, S)`; `outcomeLoad(load)` (an unguarded copy of the load — S3b wraps it in `leagueBasisLoad` with the same `scoringSettings`/`positionOf` before reading outcomes, so outcomes are league-rescored like the inputs); `readTeamS1(load, S, pid)` → string|null; `franchise(code)`; `isChanger(teamS, teamS1)` (used for A-ST-chg, §8.6); `normName`; `ageOn(birthdate, isoDate)`; `SKILL`, `FIRST_SEASON` (2012), `LAST_COMPLETED_SEASON` (2025).
- **`buildAsOfInputs(load, S, { curveAgeMode, gamesMode })`** returns `{ S, currentYear, curveAgeMode, gamesMode, scoringSettings, playersMap, curvePlayersMap, careerStats, curveBundle, teamContext, historicalShares, depthMap, dynastyDraftPick: null, ktcMap: null, skillPids, meta: { checks, deliberateDifferences } }`. `curveBundle` = `{ curves, positionPeakPPG, positionPeakAge, positionBasisScale }` built by the app's own rule (unguarded). `meta.checks` keys as built: `yearsExpAgreement`, `yearsExp` (fallback counts), `ageGap` (`{ [S]: { n, mean, off1 } }`), `sharesAboveOne`, `depth` (`{ week, teams, entries }`), and under `'snaps'` `snapsNameGuardSkips`, `snapsGamesDiffer`. The age line of `deliberateDifferences` already carries the measured gap.
- **`lib/dynastyMirror.mjs`:** `dynastyScoreMirror(pid, playersMap, careerStats, curves, positionPeakPPG, dynastyDraftPick, scoringSettings, ktcMap, teamContext, depthMap, historicalShares, positionPeakAge, positionBasisScale, inSeasonLevel, prospectLevel, options)` — S3b passes `null` for the pick, KTC, `inSeasonLevel` and `prospectLevel`, and the curve bundle of the variant (§7). Paths B/C return `raw` = `{ ageAdjScore, trajectoryScore, currentLevelScore, reliabilityScore, effectiveReliability, consistencyScore, durabilityScore, opportunityScore, rawOpportunityScore, prospectScore, seasonsOfData, currentPPG, isTdReliant }`. `composeDynastyScore(raw, weights)`, `DYNASTY_WEIGHTS`, `PEAK_AGE_CAPS`, `MIN_BASIS_SCALE_ROWS`, `qbQualityByTeamMirror`, `applyQBQualityModifierMirror`. Seams in `options`: `targetShareOverride` (replaces an existing WR/TE share only — S3a Fix pass 1 F1), `shareTrendBoostOff`, `reliabilityMix`.

The deliberate differences from the app (S3a §4's table: per-season-team attribution, end-of-REG depth chart, birthdate ages on 1 June after S, derived years_exp, no league pick, no KTC, no live level, left-truncated history from 2012, the season-level snaps count with its name guard) are copied from `meta.deliberateDifferences` into the panel and the verdict, plus the S3b ones: H's peak-age guard (§8.11), and the A-AGE-APP label sentence (§8.6).

## 4. Re-fit record (2026-10-30)

§3 is checked against S3a as merged (exports, `raw` keys, `meta.checks` names, and S3a's hand-back deviations). The peak-age finding from S3a's review led to Anton's option A (§8.11), a §8 change decided on bucket sizes only, before any outcome; Session 2 pins the §8.10 hash after approval.

---

## 5. Scored population

Cohort S ∈ 2015…2024. A row is `(pid, S)` with Sleeper position QB/RB/WR/TE, `years_exp ≥ 2` (S3a §4), and `dynastyScoreMirror` returning Path B (1–2 qualifying seasons) or Path C (3+) — i.e. `components != null` and `confidence ∈ {low, moderate, high}`. Excluded and counted per cohort × position × reason: `prospect` (Path A), `unproven` (A2), `stale` (A3), `data-gap` (A4), `non-finite`, `no-position`, `no-birthdate` (kept — the app uses the `peakPPG·0.7` age path; counted only). **Stop** if any headline cohort's Path B/C rows lack a birthdate at more than 5%.

Percentile pools inside the score (current level, opportunity) use every player the app would use (rookies included), exactly as the mirror's code does.

**One row set, fixed by H under `gamesMode: 'sleeper'`** (the app as it is today). Every other score — each variant, and every variant under `'snaps'` — is computed for exactly these rows. If a row's score under some variant × mode is not Path B/C (e.g. under `'snaps'` a season drops below 8 games and the row becomes A3, or a C row becomes B), that row is excluded from that variant × mode's metrics and counted (`meta.leftBC[variant][mode][S][pos]`); its `path` is stored per mode. **Every paired comparison (vs baselines, LOO, ablations) uses the intersection of rows valid on both sides, under the same games mode.** Baselines B1/B2 and outcomes are computed per mode from that mode's `gamesPlayed`.

---

## 6. Realised value

For row `(pid, S)`, window seasons `S+1 … min(S+3, 2025)`; horizon h = window length. Read through `outcomeLoad` from league-rescored season-totals; every window season's manifest entry must be `inProgress: false` (**stop** otherwise; `2026` is never read). A season is *qualifying* when `gamesPlayed ≥ 8` under the active `gamesMode`; PPG = league `fantasyPoints / gamesPlayed`.

- **M1** = mean of PPG over the window's qualifying seasons; undefined (row not evaluable for M1) when there are none.
- **M2** = (Σ PPG over qualifying window seasons) / h — a non-qualifying or absent season counts as 0.

Headline cohorts: S = 2015–2022 (h = 3). S = 2023 (h = 2) and S = 2024 (h = 1) are reported separately and never pooled with the headline or with each other.

---

## 7. Variants computed for every row

Each variant re-runs the as-of builder and mirror for all cohorts, under both `gamesMode`s:

`H` (headline: `buildAsOfInputs(load, S, { curveAgeMode: 'birthdate', gamesMode })`, its curve bundle replaced by `guardedAgeCurves(inputs.careerStats, inputs.playersMap, { currentYear: S + 1 })` (§8.11), per-season-team, QB modifier off, options {}); `LOO-<component>` ×5 via `composeDynastyScore(raw, weights)` with that weight set to 0 and the other four each divided by (1 − w_c) (no re-run needed); `A-C1`, `A-AGE-APP`, `A-AGE-DELTA`, `A-ST-chg`, `A-ST-all`, `A-AV-d`, `A-AV-c`, `A-QB` (§8.6); baselines `B1`, `B2` (§8.3). Every variant except the two age variants uses H's guarded curve bundle.

---

## 8. Pre-registration

Fixed before any result is computed. The run hashes this section (§8.10) and stops if the text has changed.

### 8.1 Primary question and measures
- `H` is the app's components-path score on the S3a as-of inputs with birthdate ages and the peak-age guard of §8.11 (the guard is a deliberate difference from the app, which has none).
- Per position (QB, RB, WR, TE), on headline cohorts S = 2015–2022: the Spearman rank correlation ρ between `H` score and realised value, computed **within each cohort** (average ranks for ties; `spearman` in `lib/backtest.mjs:225`), then averaged over cohorts with equal weight.
- Measures: M1 (primary for ρ and hit rates) and M2 (missed seasons as zero; primary for age bias). Every metric is reported on both, under both games definitions (`sleeper`, `snaps`). The headline sentence uses `sleeper` games; where `snaps` gives a different label the verdict says so in the same paragraph.
- Path B and Path C rows are pooled in the headline; ρ is also reported for B-only and C-only (descriptive, labelled, not headline).

### 8.2 Hit rates
- Within each position-cohort, among rows evaluable for the measure: HR@K = |top-K by score ∩ top-K by realised| / K, for K = 12 and K = 24. Each row carries an identity `(pid, slot)`: on the original data `slot = 0`; inside a bootstrap resample each drawn copy of a player gets the index of the draw that produced it, so two copies of one player are two distinct rows. Ordering: value descending, then `pid` ascending, then `slot` ascending. The intersection is over row identities. Averaged over cohorts with equal weight.

### 8.3 Baselines the score must beat
- **B1 last-season PPG:** PPG of the player's most recent qualifying season (= the score's `raw.currentPPG`; S, or S−1 when S did not qualify).
- **B2 two-year average:** mean PPG of the qualifying seasons among {S−1, S}.
- Both are ranked and scored with exactly the same ρ and HR machinery on the same rows.

### 8.4 Bias by age band
- Within each position-cohort, percentile p(x) = (average rank − 0.5) / n × 100, higher = better, among rows evaluable for the measure. Bias of a row = p(score) − p(realised). Positive = the score rates him higher than he turned out.
- Bands by `H` age (birthdate age on 1 June after S, S3a §4): ≤ 24, 25–27, 28–30, ≥ 31; `null` age excluded. Cell = position × band, pooled over headline cohorts, mean bias.

### 8.5 Component marginal contribution (leave-one-component-out)
- For each of the five components: Δρ = ρ(H) − ρ(LOO-c) per position, M1 and M2. Positive = the component helps the ranking.

### 8.6 Ablations (each compared with H: Δρ = ρ(variant) − ρ(H))
- **A-C1** — WR/TE opportunity share = `nflverse/advstats/S.json players[pid].targetShare` (a real target share) instead of the app's reception share (`teamContext.js:223-225`, computed at :225). Missing advstats entry → keep the reception share; count those rows. A WR/TE with no teamContext share (fewer than 4 games in S) has nothing to replace and keeps the app's no-share formula (S3a Fix pass 1 F1). Offline only: the app's "advstats are display-only" invariant is untouched.
- **A-AGE-APP** — the scored players keep their birthdate ages (S3a §4), but the empirical age curves, `positionPeakPPG`, `positionPeakAge` and `positionBasisScale` are built the way the app builds them today: the `curveBundle` of `buildAsOfInputs(load, S, { curveAgeMode: 'app-sleeper', gamesMode })` (S3a §4 curves row — `computeEmpiricalAgeCurves` on current Sleeper ages, `currentYear = 2026`, careerStats ≤ S; no peak guard, as in the app). **Wherever it is reported (verdict, `deliberateDifferences`, the backlog append) it is labelled, in these words: "today's app curve error transported to S — contains post-S information; not the error the app had at S".** (A teamless player's Sleeper age froze around the year he left the league, after S and correlated with his outcome.) Its comparison is keyed only as `H~A-AGE-APP` (§8.11); that Δρ is that quantity, nothing more. Its result is appended to the stale-age entry in `.claude/tasks/app-repo-backlog.md` (§14).
- **A-AGE-DELTA** — the scored players keep their birthdate ages; the curve bundle is `deltaAgeCurves(...)` (§8.11), a within-player (delta-method) curve. It asks whether a curve built from how the same players change year to year predicts better than one built from cross-sectional medians.
- **A-ST-chg** — share-trend boost forced to 0 for team changers: `franchise(teamS1) ≠ franchise(teamS)`, where `teamS` is the S row's `team`, `teamS1` the S+1 row's `team` (read through S3a's `outcomeLoad`/`readTeamS1`), and `franchise` maps the era codes to the current franchise code — `STL→LA`, `SD→LAC`, `OAK→LV`, every other code unchanged (the inverse of `eraTeam`, `lib/nflverse.mjs:1180-1185`; a Ram, Charger or Raider is never a changer by relocation alone). No S+1 row, or either team null → not a changer. This uses S+1 roster information as a **selection**, deliberately: it asks whether the app should drop the boost for a player it already knows has moved in the offseason. It is not used in H.
- **A-ST-all** — share-trend boost forced to 0 for everyone.
- **A-AV-d** — reliability = durability only (`reliabilityMix: { consistency: 0, durability: 1 }`); **A-AV-c** — reliability = consistency only (`{ consistency: 1, durability: 0 }`). The availability weight question.
- **A-QB** — QB-quality modifier applied without look-ahead. QB rows: every pid with Sleeper position QB and a season-S row with `gamesPlayed ≥ 1` and non-null `team`; each row is `{ player_id: pid, position: 'QB', nfl_team: <S row team>, dynastyScore: <mirror result at S, all paths, ktcMap/pick null, same inputs as H>, currentSeasonPPG: <S fantasyPoints / S gamesPlayed>, ownerTeamName: null, ktcValue: null }`. `qbQualityByTeamMirror(qbRows, depthMap, true)` — it picks the depth-chart QB1 when one exists, else the highest `currentSeasonPPG` (`teamContext.js:71-79`). Every mirror result carries a numeric score, so every team with at least one QB row is in the map; a team with no QB row is absent and the modifier does not apply to its players. Then `applyQBQualityModifierMirror` on each B/C non-QB row, given `nfl_team` = his S row's team.
- **D-79 practice-squad diagnostic (not an ablation, no weight):** psWeeks = weeks w ≤ the REG week count of that season (S3a §4's 17/18 rule, per season) in S−1 and S where any of the player's `nflverse/rosterweekly/<y>.json players[pid][w]` pairs has a status whose `+`-split includes `DEV`. Cohorts **S = 2018–2022** only (Anton, 2026-10-29): both counted seasons must carry week-level practice-squad statuses, and 2016's file has almost none (`DEV` player-weeks: 2016 = 48, 2017 = 2,924, 2019 = 3,460, 2021 = 5,724; plan review round 2), so a 2017 cohort would put 2016 practice-squad players in the psWeeks = 0 group. Roster status is a season value before `MIN_ABSENCE_CLASSIFY_SEASON` (2016, `lib/absence.mjs:21`). Statistic: mean bias (§8.4, M1 and M2) of rows with psWeeks ≥ 4 minus rows with psWeeks = 0, per position and pooled over positions.

### 8.7 Uncertainty
- 95% percentile CIs by player-clustered bootstrap: clusters are `pid`s within a position (a player's rows across cohorts move together), `clusteredBootstrap` (`lib/inSeasonEvidence.mjs:283`), 4,000 resamples, seed 12345. A player drawn twice contributes two copies of each of his rows, as distinct rows (row identity §8.2); ranks and ρ treat them as two rows. Each resample recomputes the per-cohort statistics and their cohort average; differences (vs baselines, LOO, ablations, PS groups) are paired on the same resample. Report `used`.
- No multiplicity correction. The verdict calls the baseline comparison per position the pre-specified test; LOO, ablation and PS labels are exploratory and are worded as such.

### 8.8 Minimum samples (below → label `insufficient`, numbers still printed)
- A cohort contributes to ρ only with ≥ 20 evaluable rows for that position and measure; to HR@12 with ≥ 36; to HR@24 with ≥ 72.
- A position's headline needs ≥ 6 of the 8 headline cohorts contributing and ≥ 160 evaluable rows. A resample with fewer than 6 contributing cohorts is dropped (counted in `used`).
- Age-band and B-only/C-only cells: ≥ 30 rows. PS diagnostic: ≥ 30 rows with psWeeks ≥ 4 (pooled test) and ≥ 30 per position for a per-position label.
- Short-horizon cohorts (2023, 2024) are each judged alone with the per-cohort minimums; no 6-of-8 rule.

### 8.9 Decision vocabulary (the only labels the verdict may print)
- ρ itself: `predictive` (CI lower > 0) · `not-shown-predictive` (CI includes 0) · `inversely-predictive` (CI upper < 0).
- Versus each baseline, separately for every statistic (ρ, HR@12, HR@24) × measure × games mode: `beats-B1`/`beats-B2` (Δ CI lower > 0) · `loses-to-B1`/`loses-to-B2` (Δ CI upper < 0) · `no-difference`.
- **Per-position summary — computed only from the pre-specified test: ρ, M1, `sleeper` games.** With r1, r2 the labels vs B1 and B2, apply these rules **in order; the first that matches wins**: (1) `insufficient` if either is `insufficient` (an unjudged comparison blocks the summary, even beside a loss); (2) `loses-to-both` if both lose; (3) `loses-to-B1` / `loses-to-B2` if that one loses, whatever the other is; (4) `beats-both` if both beat; (5) `beats-B1-only` / `beats-B2-only` if one beats and the other is `no-difference`; (6) `matches` (both `no-difference`). No summary is formed for any other statistic, measure or mode; those are reported with their per-baseline labels only.
- LOO: `component-helps` (Δρ CI lower > 0) · `component-hurts` (CI upper < 0) · `no-detectable-contribution`.
- Ablations: `ablation-better` · `ablation-worse` · `no-difference` · `variant-identical` (every row's score in the cell equals H's, so no CI is computed — e.g. A-AGE-DELTA where every position fell back to H's curve).
- Age bias: `overrates` (CI lower > 0) · `underrates` (CI upper < 0) · `no-detectable-bias`.
- PS diagnostic: `ps-underperforms-score` (CI upper < 0) · `ps-outperforms-score` (CI lower > 0) · `no-detectable-signal`.
- Any cell: `insufficient`.
- **Never output:** a weight, a constant, a multiplier, a fitted parameter, or a recommendation to change or wire anything. A label is evidence for S4, not a decision.

### 8.10 Hash
SHA-256 over the UTF-8 text of this task file, split on LF: from the line after the first line that is exactly `## 8. Pre-registration`, up to (not including) the first later line that is exactly `## 9. Outputs` — whole-line equality; a mention inside a line (as in this sentence) does not count. Rejoined with LF, no trimming; it covers every subsection of §8, including §8.11 below. Session 2 computes it once from the approved, committed file and pins it as `DYNASTY_HISTORY_PREREG_SHA256` in the adapter; every run recomputes it from the file and **stops** on mismatch. The hash is printed in the verdict header and stored in the panel's `meta.preregSha256`.

### 8.11 Age-curve methods (Anton, 2026-10-30: option A; decided on bucket sizes only, no outcome)

**The question.** Does a sounder way of building the age curve predict better? Answered by three paired comparisons per position (M1, `sleeper`; reported on every measure × mode like the other ablations; exploratory under §8.7), each keyed in this one direction only: `H~A-AGE-APP` (true ages with the guard vs the app's current curve), `A-AGE-DELTA~A-AGE-APP`, `A-AGE-DELTA~H`. For `a~b`, Δ = stat(a) − stat(b) and the first-named side is the one judged: `ablation-better` iff Δ CI lower > 0, `ablation-worse` iff CI upper < 0, else `no-difference` (or `variant-identical` when a and b score every row alike). Every line that names A-AGE-APP carries its label sentence (§8.6). The verdict proposes no curve and no constant.

**H's guard — `guardedAgeCurves(careerStats, playersMap, { currentYear, minRows = PEAK_GUARD_MIN_ROWS })` → `{ bundle, counts, fallback }`**, where `bundle` = exactly the four keys `empiricalAgeCurvesMirror` returns (`curves`, `positionPeakPPG`, `positionPeakAge`, `positionBasisScale`), `counts[pos][age]` = rows per age bucket, `fallback[pos]` = boolean. A copy of `empiricalAgeCurvesMirror`'s loop (`lib/dynastyMirror.mjs:113-170`, the app's `dynastyScore.js:67-150`) in its own order: per gp ≥ 10 skill row, the basis ratio is pushed **before** the null-age and [18, 42] checks; then row age `round(age − (currentYear − season))`, finite PPG; per-age medians; `rollingAvg3`; a position with no points gets `positionPeakPPG` 1 and `positionPeakAge` null. `median`, `rollingAvg3` and `derivePeakAge` are private in the mirror, so the module copies all three verbatim. The curves are unchanged. Only the peak changes:
- eligible points = smoothed points whose age bucket has **≥ `PEAK_GUARD_MIN_ROWS` = 30** rows;
- derived peak = the eligible point with the highest smoothed `medianPPG`, scanning ages ascending with a strict `>` (the youngest wins a tie, as the app's `reduce`);
- if no point is eligible, the position uses the app's unguarded derived peak and `fallback[pos] = true`;
- then the app's cap (`PEAK_AGE_CAPS`) and its nearest-point rule for `positionPeakPPG` over all smoothed points, `max(…, 1)`.
- With `minRows = 0`, `bundle` deep-equals `empiricalAgeCurvesMirror`'s return exactly (T-CURVE).

**Why 30.** It is this repo's standing minimum for a median-based per-position statistic (`MIN_BASIS_SCALE_ROWS = 30`, `lib/dynastyMirror.mjs:34`) and S3b's own minimum cell (§8.8). The case it targets is the full-store WR age-20 bucket that set the birthdate peak in S3a's gap report: 17 rows. The value was chosen on bucket sizes alone; no outcome was computed.

**What the guard does and does not do — measured by Session 1 on 2026-10-30, outcome-free** (birthdate ages, `sleeper` games, capped peak age; unguarded → guarded at 30; "fallback" = no bucket of 30, so the unguarded peak stands):

| S | QB | RB | WR | TE |
|---|---|---|---|---|
| 2015 | 32 → fallback | 25 → 25 | 28 → 28 | 29 → 26 |
| 2016 | 32 → fallback | 20 → 25 | 28 → 28 | 29 → 28 |
| 2018 | 32 → fallback | 25 → 21 | 28 → 28 | 29 → 29 |
| 2020 | 32 → fallback | 25 → 21 | 28 → 28 | 29 → 29 |
| 2022 | 32 → 24 | 25 → 21 | 28 → 28 | 29 → 29 |
| 2024 | 32 → 24 | 20 → 21 | 20 → 28 | 29 → 29 |

It removes thin-bucket peaks (WR 2024, RB 2016). It does **not** remove a young peak that is well populated: RB age 21 (42–77 rows from 2018) is a selection effect (21-year-olds who play 10+ games are the good ones), so from 2018 RBs are late-career at 26. QB buckets reach 30 only from 2022, and there the guard moves the QB peak from the cap (32) to 24, so QBs are late-career at 29. These are the guard's pre-registered behaviour, not defects to tune; A-AGE-DELTA is the comparison that can show whether a method less exposed to selection does better. `meta.checks[mode][S].peakAge` and `.lateCareerShare` record them for every cohort and both games modes.

**A-AGE-DELTA — `deltaAgeCurves(careerStats, playersMap, { currentYear, anchor, minPairs = PEAK_GUARD_MIN_ROWS })` → `{ bundle, pairs, fallback, floored }`**, where `anchor` = H's `guardedAgeCurves` result (`{ bundle, counts }`), `bundle` has the same four keys, `pairs[pos][age]` = n(a), `fallback[pos]` = boolean, `floored[pos]` = count.
- Pairs: a player with Sleeper position P and a non-null birthdate age, with rows in seasons s and s+1 (both ≤ S, from the active games mode's `careerStats`) each at `gamesPlayed ≥ 10` with finite PPG; a = the row age of season s (the binning rule above), kept in [18, 41]; d = PPG(s+1) − PPG(s).
- Per age a: n(a) pairs, D(a) = the **mean** of d (means chain additively; medians do not).
- Anchor: A* = the age with the most rows in `anchor.counts[P]` (younger on a tie); L(A*) = `anchor.bundle.curves[P]`'s smoothed value at A*.
- Chain, contiguous from the anchor (D(a) is the step from age a to a+1, built from pairs whose first season is at age a): **upward**, for a = A*, A*+1, …: if n(a) ≥ `minPairs`, L(a+1) = L(a) + D(a), else stop; **downward**, for a = A*−1, A*−2, …: if n(a) ≥ `minPairs`, L(a) = L(a+1) − D(a), else stop. L = max(L, 1.0), each floored point counted in `floored[P]`.
- Curve = `[{ age, medianPPG: L(age) }]` ascending (the key the mirror's `interpolateAgeCurve` reads; ages outside the chain take the endpoint value, as the app's interpolation does).
- Fewer than 3 ages in the chain, **the anchor counted** (so at least two eligible steps) → that position uses `anchor.bundle`'s curve, peak and peak PPG unchanged and `fallback[P] = true` (its rows can then be `variant-identical`).
- Peak: the derived peak is the highest L (youngest on a tie), then the app's cap and nearest-point rule; `positionPeakPPG = max(L at that point, 1)`. `positionBasisScale` = H's.

## 9. Outputs

`node bin/backtest.mjs --dynasty-history --write` writes, unregistered (the documented Invariant 3 exception for analysis output; no manifest entry):

**`backtests/<date>-dynasty-history-panel.json`** — `meta` { `generatedAt`, `dataRev`, `goldenSourceRev` (app rev recorded in the expected fixtures), `preregSha256`, `cohorts`, `headlineCohorts`, `asOfDate: "(S+1)-06-01"`, `scoringFixture`, `positionFile`, `exclusions[S][pos][reason]`, `leftBC[variant][mode][S][pos]`, `checks[mode][S]` = S3a's `meta.checks` object for that S and games mode, **under its built names, unrenamed** (`yearsExpAgreement`, `yearsExp`, `ageGap`, `sharesAboveOne`, `depth`, and under `snaps` `snapsNameGuardSkips`, `snapsGamesDiffer`), plus S3b-owned keys: `birthdateCoverage`, `advstatsMissingA1`, `peakAge[variant][pos]`, `lateCareerShare[variant][pos]` (share of that cell's B/C rows with `signals.isLateCareer`) for variant ∈ {`H`, `A-AGE-APP`, `A-AGE-DELTA`}, `peakGuardFallback[pos]` (H's `fallback`), `deltaFallback[pos]`, `deltaFloored[pos]` (A-AGE-DELTA's), `deliberateDifferences[]` (S3a §4's table's right column, one string each, the age row carrying the measured `ageGap`, plus the A-AGE-APP label sentence of §8.6) }; `rows[]` { `pid`, `S`, `position`, `path` { sleeper, snaps } (B|C|A|A2|A3|A4|non-finite), `age`, `ageSleeper` (raw Sleeper age, for the gap check), `yearsExp`, `teamS`, `teamS1`, `changer`, `psWeeks`, `scores` { variantId → { sleeper, snaps } } (integers; `null` where the variant × mode leaves B/C), `raw` (H, sleeper), `B1` { sleeper, snaps }, `B2` { sleeper, snaps }, `outcome` { sleeper: {M1, M2, h}, snaps: {M1, M2, h} } }; `metrics` — a flat object keyed by a `|`-joined path, built and parsed only by `metricKey(parts)` / `parseMetricKey(key)`. Every value is a **Cell** `{ value, ci95, used, n, cohortsUsed, label }` (for per-cohort entries `ci95`/`used` are `null`). Grammar (every segment required, in this order):

`<horizon>|<measure>|<mode>|<kind>|<subject>|<statistic>|<position>|<cell>`

- `horizon` ∈ `h3` (S = 2015–2022, the headline), `h2-2023`, `h1-2024`.
- `measure` ∈ `M1`, `M2`; `mode` ∈ `sleeper`, `snaps`.
- `kind` and `subject`:
  - `level` — `subject` = a score id: `H`, `B1`, `B2`, `LOO-ageAdjusted`, `LOO-trajectory`, `LOO-currentLevel`, `LOO-reliability`, `LOO-opportunityQuality`, `A-C1`, `A-AGE-APP`, `A-AGE-DELTA`, `A-ST-chg`, `A-ST-all`, `A-AV-d`, `A-AV-c`, `A-QB`.
  - `delta` — `subject` = `<a>~<b>`, value = stat(a) − stat(b): `H~B1`, `H~B2` (§8.3), `H~LOO-<c>` (§8.5), `<A-x>~H` for every §8.6 ablation **except A-AGE-APP** (§8.6), and the §8.11 age comparisons `H~A-AGE-APP`, `A-AGE-DELTA~A-AGE-APP`, `A-AGE-DELTA~H` — the only keys for the age variants (no sign-flipped duplicates).
  - `bias` — `subject` = a score id (H at least), `statistic` = `bias`, `cell` = age band `le24`, `25-27`, `28-30`, `ge31` (§8.4).
  - `path` — `subject` = `H`, `cell` = `B` or `C` (B-only / C-only).
  - `cohort` — `subject` = `H`, `statistic` = `rho`, `cell` = S as a 4-digit year (verdict §11).
  - `ps` — `subject` = `ps4~ps0`, `statistic` = `bias`, `position` may be `ALL` (§8.6).
- `statistic` ∈ `rho`, `hr12`, `hr24`, `bias`.
- `position` ∈ `QB`, `RB`, `WR`, `TE`, `ALL` (`ALL` only for `ps`).
- `cell` = `all` unless the kind defines it.
- The per-position summary (§8.9) lives in `summary[position]` → label, from `h3|M1|sleeper|delta|H~B1|rho|<pos>|all` and `…|H~B2|…`.

Short horizons use the same grammar under their own `horizon`; nothing pools across horizons. Panel ≤ 15 MB (**stop** above; drop `raw` from LOO-only fields first if needed and say so).

**`grading/<date>-dynasty-history-verdict.md`** — sections in this order:
1. Header: date, data rev, golden app rev, prereg hash, "offline research; nothing ships".
2. **What the evidence supports, and what it does not** — plain language for Anton, one paragraph per position, then one on age bias and one on components/ablations, using only §8.9 labels with their numbers. No recommendation.
3. Headline ρ table (position × M1/M2 × sleeper/snaps), with CI, n, cohorts used, label.
4. Baselines: ρ and HR@12/@24 for H, B1, B2 and the Δs with labels.
5. Age-band bias table.
6. LOO table. 7. Ablations table, with the three §8.11 age comparisons in their own sub-table and the per-cohort peak ages and late-career shares of H, A-AGE-APP and A-AGE-DELTA. 8. PS diagnostic.
9. Path B-only and C-only ρ (descriptive).
10. Short horizons: S = 2023 (h=2) and S = 2024 (h=1), each its own table, header "not pooled with the headline".
11. Per-cohort ρ table (position × S), so left-truncation in early cohorts is visible.
12. Exclusions and deliberate differences (from `meta`), including the measured Sleeper-vs-birthdate age gap per S, and the not-in-test list of §0.
13. "Never output" statement (§8.9).

---

## 10. CLI

`bin/backtest.mjs`: `--dynasty-history` accepts only `--json` and `--write`; anything else → error "seasons, variants, measures and samples are pinned by the task file, not knobs" and exit 1 (copy the `--games-calibration` reject block, `bin/backtest.mjs:259-267`). Dispatch `process.exit(dynastyHistoryMain({ write, asJson }))`. Add the header doc line.

`scripts/dynasty-history-run.mjs` public exports, mirroring `scripts/games-short-run.mjs`: `DYNASTY_HISTORY_LOAD` (S3a's `DYNASTY_ASOF_LOAD` plus the task file text), `DYNASTY_HISTORY_PREREG_SHA256`, `preregHash(text)`, `metricKey`, `parseMetricKey`, `buildRows`, `computeMetrics`, `runDynastyHistory({ load, log })`, `buildDynastyHistoryVerdictMarkdown(result)`, `writeDynastyHistoryArtifacts({ result, verdictMd, root })`, `dynastyHistoryMain(...)` → exit code. Stops are thrown as `DynastyHistoryStop` and turned into exit 1 with the message.

Runtime is not a constraint, but log progress per cohort to stderr.

---

## 11. Tests — `test/dynasty-history.test.mjs` (synthetic in-memory loaders; no store reads)

S3a's input tests (T-LA, T-AGE, T-YE, T-NAME, T-DEPTH, T-GAMES, T-FR) and parity tests stay in S3a. S3b adds:
- **T-CURVE** (`test/age-curve-variants.test.mjs`): `guardedAgeCurves(...).bundle` with `minRows: 0` deep-equals `empiricalAgeCurvesMirror` on `test/fixtures/dynasty-mirror-parity/inputs-2019.json` and `inputs-2023.json`; on a synthetic store a 17-row peak bucket is skipped for the best ≥ 30-row bucket; a position with no ≥ 30 bucket falls back to the unguarded peak and is counted; curves, `positionBasisScale` and the nearest-point `positionPeakPPG` rule are unchanged.
- **T-DELTA** (same file): on hand-built pairs, D(a) is the mean of the deltas; the chain anchors at the largest bucket with H's value there, steps up and down by the §8.11 rule (the downward step at age a uses n(a)) and stops at the first gap; a chain of exactly 2 ages (anchor + one step) falls back; L is floored at 1 and counted; fewer than 3 ages falls back to H's curve and is counted; peak and cap as specified. Expected values are hand-derived literals with the arithmetic in comments.
- **T-POP:** a row that is Path C under `sleeper` but A3 under `snaps` stays in the row set, is excluded from snaps metrics, is counted in `leftBC`, and paired comparisons use the intersection.
- **T-OUT:** M1/M2 on hand-built windows (all qualifying; one missed; none qualifying → M1 undefined, M2 = 0); h = 2/1 for 2023/2024; a window season with manifest `inProgress: true` stops.
- **T-MET:** within-cohort ρ averaged over cohorts; HR@K with ties broken by pid then slot, and a resample holding two copies of one player counts them as two rows; the per-position summary label for each (r1, r2) combination of §8.9, including `insufficient` taking precedence over a loss; percentile bias sign; clustered bootstrap pairs differences on the same resample (a variant identical to H gives Δ ≡ 0 and CI [0,0]); minimum-sample rules produce `insufficient`; the 6-of-8 rule.
- **T-KEYS:** every result the verdict prints has its §9 `metrics` key; the key grammar round-trips (`metricKey(parts)` ↔ `parseMetricKey(key)`).
- **T-LBL:** each §8.9 label from a hand-set CI.
- **T-HASH:** `preregHash` on a two-section sample extracts exactly the §8 span, including a sample whose §8 mentions `## 9. Outputs` inside backticks (the span must not end there); a one-character change in §8 changes it; a change outside §8 does not; the pinned constant equals the hash of the committed task file (this test reads `.claude/tasks/dynasty-history-backtest.md` — a committed, non-workflow path, allowed by Invariant 10).
- **T-AGEAPP-LABEL:** every rendered mention of A-AGE-APP (verdict, `deliberateDifferences`, the backlog append text) carries the §8.6 sentence.
- **T-CLI:** `--dynasty-history --basis league` exits 1 with the pinned message.
- **T-STOP:** each §15 stop throws `DynastyHistoryStop` with its message.

---

## 12. Cross-repo

No registry change: CR-32 is S3a's, and S3b adds no coupling (it reads S3a's data-side modules and the store). If the re-fit finds S3b needs an app site, that is a stop for Anton.

---

## 13. Docs

- Data `README.md`: Module notes row for `scripts/dynasty-history-run.mjs`; the backtest-modes list gains `--dynasty-history` (outputs, stops, "offline; not the snapshot grader").
- Data `CLAUDE.md` (25,000 ceiling): Commands table Backtest row gains `--dynasty-history`; the `lib/backtest.mjs` navigation row gains "`lib/ageCurveVariants.mjs` S3b's guarded and within-player age curves". Nothing else. README Module notes row for `lib/ageCurveVariants.mjs`.

---

## 14. Backlog and calendar (closing rule)

This slice closes no backlog item and no calendar line (none names S3). It touches three open entries — append, do not strike:
- **Stale-age entry** in data `.claude/tasks/app-repo-backlog.md` ("Age curves and age inputs read stale Sleeper ages", data `51996b8`): "Append (S3b, <date>, data `<sha>`): A-AGE-APP vs H, Δρ per position (M1, sleeper games): <values, CIs, labels>. This is today's app curve error transported to S — it contains post-S information; it is not the error the app had at S. Verdict §7." Session 2 changes nothing else in the entry and does not touch the calendar.
- **D-77** (app `.claude/tasks/data-repo-backlog.md`): "Append (S3b, <date>, data `<sha>`): the dynasty history test reports every metric under Sleeper `gamesPlayed` and a season-level snaps count (definition (c), with the D-87 name guard); <n> player-seasons differ, <m> name-guard skips; verdict `grading/<date>-dynasty-history-verdict.md` §3. The D-77 build is unchanged."
- **D-79** (same file): "Append (S3b, <date>, data `<sha>`): practice-squad history as a dynasty-score role input — diagnostic only, cohorts 2018–2022, label <label> (verdict §8). No input added."

Session 1 records the sign-off line in `future_plans/in-season-notes-plan.md`.

---

## 15. Stops (report, never improvise)

- S3b needs a change to any S3a module, an app site, or an §8 fact the re-fit did not amend.
- `guardedAgeCurves` with `minRows: 0` does not equal `empiricalAgeCurvesMirror` on both golden inputs (T-CURVE) — the guard must differ from the app's rule only in the peak; or the measured guarded peaks differ from §8.11's table on the store at data `605f132`.
- Path B/C birthdate coverage < 95% in a headline cohort; a window season is `inProgress`; a snaps file 2013–2025 is missing; the prereg hash mismatches; the panel > 15 MB.
- Any design question this file does not answer.

---

## 16. Done-definition and hand-back

1. Data: `npm test` and `npm run smoke` green.
2. `node bin/backtest.mjs --dynasty-history --write` run once on data `main`; both outputs committed (data). Paste the verdict's §2 and §3 into the hand-back.
3. README / CLAUDE.md updated; backlog appends with real SHAs.
4. Commit; **push only after Anton's sign-off** (`git pull --rebase` first, never `--force`).
5. Hand-back: SHA ranges, every file touched, every deviation from this file, what each new test asserts, the pinned prereg hash. Session 1 runs implementation-reviewer at full depth on the diff.
