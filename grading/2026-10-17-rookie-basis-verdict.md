# D-45 — league-basis refit of the rookie and prior constants (verdict)

Generated 2026-10-17T08:43:25.285Z (data `9621d09`). Offline analysis: no served file, no manifest entry. League scoring: `test/fixtures/league-scoring-2026-10-14.json`. **Reproduce:** `node bin/backtest.mjs --rookie-basis --write`.

## Pre-registered decision rule (D-45 §4.3 — committed in A3a, before the first league run)

Each constant family is refitted on league outcomes by the recipe that produced its shipped half-PPR value and compared out of sample, on league-basis outcomes, against today's interim (the half-PPR recipe refitted on the same training folds × the as-of `positionBasisScale`). Both arms are in-fold. Per row `d = loss(refit) − loss(interim)`; an entry's and a family's delta is the unweighted mean `d`, clustered by player, `bootstrapPairedMean` (4000 resamples, seed 12345), labelled by `compareLabel` on its 95% interval.

**Gates (G0):** a failure of (a), (c) or (d) stops the run (nothing under the families is read); a failure of a family's (b) makes that family `stop-and-report` and its league section is not read. (a) `basisScaleOf(load, 2026, pos)` = QB 1.114 / RB 1.118 / WR 1.101 / TE 1.325 (the per-target-season table is written to the panel); (b) each half-PPR recipe on the half rows reproduces its shipped constant exactly — F1 `ROOKIE_CALIBRATION` (8 cells, 2 dp, and every row's `projectedPPG` = round1(baseline × cappedProduct)), F2 `ROOKIE_CEILING` (8 values, 2 dp), F3 `QB_ROOKIE_STARTER_PPG` (4, 3 dp), F4 `ROOKIE_TOTAL_FACTOR` (2, 3 dp; every row's parity holds); (c) half and league row keys are equal per panel and the `rookiePathAll` games cells (`ROOKIE_GAMES_*` material) are equal across bases; (d) the scoring fixture's sha1 is the one D-46 D2 pinned, and the weeks-method counts per season are reported (`scaled` > 0.5% of a season's weeks is flagged).

**Families (recipe · folds · arms · entries · loss):**

- **F1 `ROOKIE_BASELINE_PPG` + `ROOKIE_CALIBRATION`.** Rows: the legacy gated rookie panel (gp ≥ 6). Recipe: the app's `tierGroup`/`fitCellConstants`/`runLoyo` (rookieCalibration.test.js:81-235) and the five-part minimum-n rule (docs/projection.md:282-288), `nflDraftTier: null` mapped to `undrafted`. Interim: calibration_H on the training folds' half rows; level = baseline_H × s(pos, y+1) × cappedProduct × calibration_H. Refit: ρ(pos) = Σ league ÷ Σ half outcome over the training rows (3 dp), baseline_L = round3(baseline_H × ρ), calibration_L by the recipe on league outcomes against round1(baseline_L × cappedProduct); level = baseline_L × cappedProduct × calibration_L. Folds: leave-one-predictor-year-out. Loss: |league outcome − clamp(level, 0, 40)|. Entries: group × position (16), floor 30 rows. Structural: the set of corrected cells and each cell's minimum-n band are identical under the full-sample league fit. `same` is judged on the effective level (baseline × calibration per cell) at 2 dp.
- **F2 `ROOKIE_CEILING`.** Rows: debut rows with gp ≥ 8 (classes 2013–2025). Recipe: p90 knee / p99 asymptote of debut PPG, 2 dp. Interim: half quantiles of the other classes × s(pos, class); refit: league quantiles of the other classes. Folds: leave-one-class-year-out. Loss: pinball loss at τ = 0.90 (knee) and 0.99 (asymptote) on the held-out league debut PPG. Entries: position × {knee, asymptote} (8), floor 30 rows. The family pooled delta counts each row once (the mean of its knee and asymptote deltas). Structural: knee < asymptote at every position. Held-out exceedance vs 10% / 1% is reported for both arms. `same` at 2 dp.
- **F3 `QB_ROOKIE_STARTER_PPG`.** Rows: the Q3 units (rookie-season QBs with ≥ 3 primary games). Recipe: `levelTable` (Σ points ÷ Σ primary games, game-weighted, 3 dp). Interim: half level in-fold × s(QB, S); refit: league level in-fold. Folds: leave-one-season-out. Loss: |unit league PPG − group level| per unit. Entries: the four groups, floor 10 players. Structural: no group empty. `same` at 3 dp.
- **F4 `ROOKIE_TOTAL_FACTOR`.** Decided after F1 and F2 on the composition the app would ship (each of F1/F2 at its league value if `wire`, else interim, before §4.6). Rows: the day-3 and undrafted RB/WR/TE rows of the league `rookiePathAll` panel. Recipe: `losoMultiplier` / `loso.decision`. Interim: factor_H fitted in-fold on the half scale-1 composition against half realised totals (today's recipe), applied to the shipped composition; refit: factor_L fitted in-fold on the shipped composition against league realised totals, applied to it. Folds: leave-one-season-out. Loss: |league realised total − factor × shipped total|. Entries: day3, undrafted, floor 30 rows. Expected `same`. `same` at 3 dp.
- **F5 `POSITION_PRIOR_PPG`.** Rows: the 2c Q1 admitted rows of second-year players (yearsExp 1; the one live arm-A population is second-year WRs) with an S+2 outcome, deduplicated to one row per player-season. Prior: the arm-A prior as live (position constant × scale × age × draft, blended 8 : min(gp, 12) with the S-1 season). Interim: constant × s(pos, S); refit: constant × ρA(pos) at scale 1, ρA = Σ league ÷ Σ half `nextPPG2` over the training rows (3 dp). Folds: leave-one-season-out. Loss: |league `nextPPG2` − prior|. Entries: the four positions, floor 30 players; **only the WR entry decides F5** (and the family pool is the WR rows) — QB/RB/TE are reported, never wired. A WR wire also reaches WR PATH B and no-entry rows, which were not evaluated. `same` at 2 dp.

**Per family:**

- `wire` iff at least one labelled entry is `BEATS`, no labelled entry is `WORSE`, the family pooled delta (all its rows, deduplicated per row) has a **99%** interval entirely below 0, and the structural check holds. A labelled entry is a deciding entry at or above its family floor that is not `same`; an entry below its floor is `INSUFFICIENT` (pooled, never labelled).
- `stop-and-report` iff G0 fails for the family, its structural check fails, a pinned artifact it reproduces did not reproduce at baseline (plan §2.6), or §4.6 trips. Nothing wires from it.
- Otherwise `do-not-wire`, naming the entries.
- **Entries `same`:** the full-sample league value equals the full-sample interim value at the constant's committed precision (per family above). A family whose every entry is `same` is `do-not-wire` whatever its pooled delta; a `same` entry never counts as the required `BEATS` nor as a `WORSE`.
- **Multiplicity:** the verdict counts the labelled entries after the floors (at most 16 + 8 + 3 + 2 + 1 = 30 deciding entries) and states the expected spurious `BEATS`/`WORSE` at 95% (0.05 × the count, ≈ 1.5 at 30); the pooled requirement is the guard (D-46's), held at 99% because five families are decided at once (0.05 ÷ 5, Bonferroni).
- **§4.6 (only if F1, F2, F3 or F5 is `wire`):** the in-season k re-fit on the composition the app would ship, `--inseason --basis league` and `--inseason --dynasty --basis league --inseason-2a backtests/2026-10-07-inseason-constants.json`, each compared with the shipped file under D-46's `compareConstantsFiles`/`decideFile` unchanged. Both `do-not-wire` with `prospectPriorKind`, `decisions` and `reuse` unchanged → the shipped k stand; otherwise every triggering `wire` family becomes `stop-and-report`.
- **Expected, stated so a surprise is visible:** F4 `same`; F1/F5 hinge on whether ρ differs from s by more than a few percent; F2/F3 on whether the rookie points mix differs from the veterans'.

## Verdicts (read from the rule above, not from the narrative)

| family | verdict | why |
|---|---|---|
| F1 | **do-not-wire** | BEATS day2:RB, day3:TE, undrafted:TE; WORSE day3:RB, undrafted:WR; pooled 99% interval [-0.01, 0.051] not below 0 |
| F2 | **do-not-wire** | no labelled entry BEATS; WORSE RB:asymptote; pooled 99% interval [-0.005, 0.005] not below 0 |
| F3 | **do-not-wire** | no labelled entry BEATS; pooled 99% interval [-0.103, 0.03] not below 0 |
| F4 | **stop-and-report** | G0 failed for this family a pinned artifact this family reproduces did not reproduce at baseline (plan §2.6) |
| F5 | **do-not-wire** | no labelled entry BEATS; pooled 99% interval [-0.006, 0.054] not below 0 |

Multiplicity: 24 labelled entries after the floors (at most 30); expected spurious `BEATS`/`WORSE` at 95%: 1.20 (1.50 at 30); the pooled 99% requirement is the guard.

## G0

- **G0a** scale 2026 (PASS): QB 1.114 (pinned 1.114), RB 1.118 (pinned 1.118), WR 1.101 (pinned 1.101), TE 1.325 (pinned 1.325).
- **G0b** recipe fidelity: F1 PASS; F2 PASS; F3 PASS; F4 FAIL [{"group":"undrafted","recipe":0.834,"shipped":0.835}].
- **G0c** populations (PASS): legacyGated equal, debut equal, rookiePathAll equal, f3Games equal, f5Rows equal; ROOKIE_GAMES cells equal.
- **G0d** settings (PASS): fixture sha1 `32e33d61c5cfffacec0a052692fbd61c967b1d6f` (pinned `32e33d61c5cfffacec0a052692fbd61c967b1d6f`).

Weeks method per season (league rows):

| season | exact weeks | scaled weeks | scaled share | flag |
|---|---|---|---|---|
| 2012 | 15652 | 0 | 0.0% |  |
| 2013 | 19114 | 0 | 0.0% |  |
| 2014 | 21962 | 0 | 0.0% |  |
| 2015 | 23379 | 0 | 0.0% |  |
| 2016 | 23427 | 0 | 0.0% |  |
| 2017 | 23407 | 0 | 0.0% |  |
| 2018 | 23424 | 0 | 0.0% |  |
| 2019 | 23424 | 0 | 0.0% |  |
| 2020 | 24276 | 0 | 0.0% |  |
| 2021 | 25940 | 0 | 0.0% |  |
| 2022 | 25826 | 0 | 0.0% |  |
| 2023 | 25878 | 0 | 0.0% |  |
| 2024 | 25944 | 0 | 0.0% |  |
| 2025 | 25946 | 0 | 0.0% |  |

No season has scaled weeks above 0.5%.

Pinned artifacts the app copies, reproduced by today's code at baseline (plan §2.6):

| family | reproduced | artifact |
|---|---|---|
| F1 | yes | backtests/2026-09-06-fullpipeline-panel.json rookiePanel.rows (committed fields) |
| F2 | yes | backtests/2026-10-10-rookie-panel.json ceiling.observed |
| F3 | yes | backtests/2026-10-04-qb-rookie-level-constants.json starterPPG + fixture |
| F4 | **NO** | backtests/2026-10-11-rookie-total-panel.json loso.decision, and backtests/2026-10-10-rookie-panel.json rookiePathAll byRungCell cells — {"lososDecision":true,"rookiePathAllCells":false,"rowsNow":3851,"rowsPinned":3848} |

As-of scale per target season (league basis):

| target season | QB | RB | WR | TE |
|---|---|---|---|---|
| 2013 | 1.122 | 1.135 | 1.108 | 1.311 |
| 2014 | 1.124 | 1.129 | 1.109 | 1.312 |
| 2015 | 1.125 | 1.123 | 1.11 | 1.317 |
| 2016 | 1.124 | 1.124 | 1.108 | 1.321 |
| 2017 | 1.123 | 1.128 | 1.108 | 1.324 |
| 2018 | 1.123 | 1.128 | 1.107 | 1.322 |
| 2019 | 1.123 | 1.126 | 1.108 | 1.323 |
| 2020 | 1.123 | 1.124 | 1.106 | 1.322 |
| 2021 | 1.123 | 1.122 | 1.106 | 1.322 |
| 2022 | 1.123 | 1.12 | 1.106 | 1.325 |
| 2023 | 1.121 | 1.119 | 1.104 | 1.324 |
| 2024 | 1.119 | 1.117 | 1.102 | 1.324 |
| 2025 | 1.115 | 1.118 | 1.101 | 1.325 |
| 2026 | 1.114 | 1.118 | 1.101 | 1.325 |

## F1 — tierGroup / fitCellConstants / five-part minimum-n rule; ρ-transport of the hand-set baseline (decision A1)

12 folds, 1056 rows. **Verdict: `do-not-wire`** — BEATS day2:RB, day3:TE, undrafted:TE; WORSE day3:RB, undrafted:WR; pooled 99% interval [-0.01, 0.051] not below 0

|  | QB | RB | WR | TE |
|---|---|---|---|---|
| half baseline | 13 | 9 | 7 | 5 |
| scale 2026 (s) | 1.114 | 1.118 | 1.101 | 1.325 |
| interim baseline (half × s) | 14.482 | 10.062 | 7.707 | 6.625 |
| ρ | 1.111 | 1.162 | 1.192 | 1.307 |
| league baseline (half × ρ) | 14.443 | 10.458 | 8.344 | 6.535 |

| cell | n | band | raw ratio (half) | raw ratio (league) | half c | league c |
|---|---|---|---|---|---|---|
| day3:QB | 31 | n>=30 | 1.103 | 1.101 | 1.00 | 1.00 |
| undrafted:TE | 101 | n>=30 | 0.279 | 0.279 | 0.28 | 0.28 |
| undrafted:QB | 14 | 10<=n<30 | 0.668 | 0.670 | 0.67 | 0.67 |
| day3:TE | 83 | n>=30 | 0.710 | 0.716 | 0.71 | 0.72 |
| undrafted:WR | 150 | n>=30 | 0.363 | 0.412 | 0.36 | 0.41 |
| day3:WR | 128 | n>=30 | 0.787 | 0.812 | 0.79 | 0.81 |
| undrafted:RB | 101 | n>=30 | 0.332 | 0.345 | 0.33 | 0.35 |
| day3:RB | 116 | n>=30 | 0.799 | 0.815 | 0.80 | 0.82 |

Structural: corrected cells half day3:RB, day3:TE, day3:WR, undrafted:QB, undrafted:RB, undrafted:TE, undrafted:WR / league day3:RB, day3:TE, day3:WR, undrafted:QB, undrafted:RB, undrafted:TE, undrafted:WR; bands identical: true → **holds**. Clamp(…, 0, 40) binding rows: interim 0, refit 0.

| entry | rows | players | Δ [95%] | label | same |
|---|---|---|---|---|---|
| r1:QB | 37 | 36 | -0.0309 [-0.0850, 0.0261] | NO-GAIN | no |
| r1:RB | 15 | 15 | -0.2022 [-0.3788, 0.0023] | INSUFFICIENT | no |
| r1:WR | 49 | 49 | -0.1275 [-0.3134, 0.0539] | NO-GAIN | no |
| r1:TE | 11 | 11 | 0.0270 [-0.0202, 0.0692] | INSUFFICIENT | no |
| day2:QB | 21 | 17 | 0.0446 [-0.0047, 0.0934] | INSUFFICIENT | no |
| day2:RB | 55 | 54 | -0.1011 [-0.1825, -0.0178] | BEATS | no |
| day2:WR | 98 | 97 | 0.0343 [-0.0767, 0.1405] | NO-GAIN | no |
| day2:TE | 46 | 46 | -0.0091 [-0.0272, 0.0092] | NO-GAIN | no |
| day3:QB | 31 | 29 | 0.0020 [-0.0329, 0.0383] | NO-GAIN | no |
| day3:RB | 116 | 115 | 0.0752 [0.0204, 0.1288] | WORSE | no |
| day3:WR | 128 | 126 | 0.0450 [-0.0318, 0.1185] | NO-GAIN | no |
| day3:TE | 83 | 81 | -0.0030 [-0.0056, -0.0004] | BEATS | no |
| undrafted:QB | 14 | 10 | 0.0429 [0.0040, 0.0924] | INSUFFICIENT | no |
| undrafted:RB | 101 | 99 | 0.0460 [-0.0018, 0.0906] | NO-GAIN | no |
| undrafted:WR | 150 | 143 | 0.0956 [0.0020, 0.1873] | WORSE | no |
| undrafted:TE | 101 | 98 | -0.0077 [-0.0115, -0.0039] | BEATS | no |

**Pooled Δ** (1056 rows, 1025 players): 0.0202, 95% [-0.0019, 0.0438], **99% [-0.0096, 0.0507]**.

## F2 — p90 knee / p99 asymptote of debut PPG (gp >= 8), 2 dp; leave-one-class-year-out (Q5); pinball loss at τ = 0.90 / 0.99

13 folds, 873 rows. **Verdict: `do-not-wire`** — no labelled entry BEATS; WORSE RB:asymptote; pooled 99% interval [-0.005, 0.005] not below 0

| position | n | half knee / asymptote | interim (× s) | league knee / asymptote |
|---|---|---|---|---|
| QB | 50 | 17.8 / 21.9 | 19.83 / 24.4 | 20.08 / 24 |
| RB | 281 | 12.11 / 16.87 | 13.54 / 18.86 | 13.71 / 19.02 |
| WR | 366 | 9.87 / 14.38 | 10.87 / 15.83 | 11.29 / 15.91 |
| TE | 176 | 6.21 / 11.6 | 8.23 / 15.37 | 8.04 / 14.06 |

Held-out exceedance (nominal 10% above the knee, 1% above the asymptote):

| position | n | interim knee | interim asymptote | refit knee | refit asymptote |
|---|---|---|---|---|---|
| QB | 50 | 10.0% | 2.0% | 12.0% | 4.0% |
| RB | 281 | 10.7% | 1.8% | 10.7% | 1.8% |
| WR | 366 | 11.2% | 1.4% | 10.1% | 1.1% |
| TE | 176 | 10.2% | 1.1% | 10.2% | 1.7% |

Structural: knee < asymptote at every position → **holds** (fold violations: 0).

| entry | rows | players | Δ [95%] | label | same |
|---|---|---|---|---|---|
| QB:knee | 50 | 50 | -0.0005 [-0.0094, 0.0093] | NO-GAIN | no |
| QB:asymptote | 50 | 50 | 0.0168 [-0.0055, 0.0565] | NO-GAIN | no |
| RB:knee | 281 | 281 | -0.0011 [-0.0055, 0.0027] | NO-GAIN | no |
| RB:asymptote | 281 | 281 | 0.0062 [0.0010, 0.0132] | WORSE | no |
| WR:knee | 366 | 366 | -0.0099 [-0.0228, 0.0027] | NO-GAIN | no |
| WR:asymptote | 366 | 366 | 0.0007 [-0.0006, 0.0021] | NO-GAIN | no |
| TE:knee | 176 | 176 | 0.0047 [-0.0033, 0.0143] | NO-GAIN | no |
| TE:asymptote | 176 | 176 | 0.0025 [-0.0117, 0.0236] | NO-GAIN | no |

**Pooled Δ** (873 rows, 873 players): 0.0001, 95% [-0.0037, 0.0042], **99% [-0.0046, 0.0054]**.

## F3 — levelTable: Σ points ÷ Σ primary games, game-weighted, 3 dp; leave-one-season-out; loss |unit league PPG − group level| per unit

13 folds, 68 rows. **Verdict: `do-not-wire`** — no labelled entry BEATS; pooled 99% interval [-0.103, 0.03] not below 0

| group | units | half | interim (× s) | league |
|---|---|---|---|---|
| top12 | 27 | 15.801 | 17.602 | 17.509 |
| r1 | 8 | 14.355 | 15.991 | 15.787 |
| day2 | 14 | 13.303 | 14.820 | 14.763 |
| day3+ | 19 | 12.341 | 13.748 | 13.738 |

Structural: no group empty → **holds**; fold fallbacks to the pool: 0.

| entry | rows | players | Δ [95%] | label | same |
|---|---|---|---|---|---|
| top12 | 27 | 27 | -0.0103 [-0.1006, 0.0779] | NO-GAIN | no |
| r1 | 8 | 8 | -0.2120 [-0.3716, -0.0015] | INSUFFICIENT | no |
| day2 | 14 | 14 | -0.0290 [-0.1169, 0.0642] | NO-GAIN | no |
| day3+ | 19 | 19 | -0.0056 [-0.0732, 0.0591] | NO-GAIN | no |

**Pooled Δ** (68 rows, 68 players): -0.0366, 95% [-0.0864, 0.0132], **99% [-0.1028, 0.0299]**.

## F4 — not computed

**Verdict: `stop-and-report`** — G0 failed for this family a pinned artifact this family reproduces did not reproduce at baseline (plan §2.6) G0b failed — the half-PPR recipe does not reproduce its shipped constant; the league section was not read. G0b: {"ok":false,"mismatches":[{"group":"undrafted","recipe":0.834,"shipped":0.835}],"parityFails":0}.

## F5 — arm-A prior as live (position constant × scale × age × draft, blended 8 : min(gp, 12)); ρ-transport of the hand-set constant (decision A1); leave-one-season-out

10 folds, 532 rows. **Verdict: `do-not-wire`** — no labelled entry BEATS; pooled 99% interval [-0.006, 0.054] not below 0

|  | QB | RB | WR | TE |
|---|---|---|---|---|
| half constant | 14 | 12 | 9 | 7 |
| interim (× s) | 15.596 | 13.416 | 9.909 | 9.275 |
| ρA | 1.107 | 1.135 | 1.157 | 1.315 |
| league constant | 15.498 | 13.620 | 10.413 | 9.205 |

Live-prior recompute matches the league run's arm-A prior on 532 of 532 rows. A WR wire also reaches WR PATH B and no-entry rows, which were not evaluated.

| entry | rows | players | Δ [95%] | label | same |
|---|---|---|---|---|---|
| QB (report only) | 33 | 33 | 0.0547 [0.0282, 0.0802] | WORSE | no |
| RB (report only) | 166 | 166 | 0.0211 [0.0144, 0.0277] | WORSE | no |
| WR | 208 | 208 | 0.0238 [-0.0001, 0.0476] | NO-GAIN | no |
| TE (report only) | 125 | 125 | -0.0080 [-0.0118, -0.0043] | BEATS | no |

**Pooled Δ** (208 rows, 208 players): 0.0238, 95% [-0.0001, 0.0476], **99% [-0.0063, 0.0542]** — deciding positions: WR.

## §4.6 — consistency re-run of the in-season k

no prior-moving family wires — §4.6 not run

## Live 2026 effect of each family's league value vs the interim (report-only)

On the 2026-10-16 capture's non-chain rookie rows, each family swapped alone into the interim reconstruction. F1/F2 move `projectedPPG`, F3 `qbStarterPPG` (rookie:* QB rows), F4 `projectedTotalPts`; F5 moves no captured field (dynasty score only).

| family | rows | moved ≥ 0.1 | mean move (all rows) | mean |move| (moved) |
|---|---|---|---|---|
| F1 | 268 | 221 | 0.368 | 0.461 |
| F2 | 268 | 11 | 0.001 | 0.136 |
| F3 | 1 | 0 | -0.010 | — |
| F4 | 0 | 0 | — | — |

**What this does not model:** the live ktc/college multipliers (the reconstruction holds them at 1.0 as the shipped constants were fitted); PATH B and no-entry prospects for F5; any in-season k beyond §4.6.
