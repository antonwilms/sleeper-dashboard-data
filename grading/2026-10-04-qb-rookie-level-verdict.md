# Rookie QB starter level (P12a) — 2026-10-04

Offline backtest, 2013–2025, half-PPR, game-weighted PPG in games a rookie QB started (primary passer of the team-game). Snapshot 2026-10-03.

## Summary

| group | PPG if he starts (half-PPR) | 95% CI | rookies | games | thin |
|---|---|---|---|---|---|
| top12 | 15.801 | [14.255, 17.415] | 30 | 349 | no |
| r1 | 14.355 | [12.061, 16.532] | 9 | 81 | yes |
| day2 | 13.303 | [12.311, 14.399] | 17 | 124 | no |
| day3+ | 12.341 | [10.358, 14.081] | 34 | 136 | no |
| pooled | 14.500 | [13.556, 15.471] | 90 | 690 | no |

- Held out (leave-one-season-out, 68 rookie-seasons with ≥ 3 starts): group mean vs the shipped ktc-neutral level: -0.641 [-1.247, -0.021] **BEATS**; group mean vs pooled rookie mean: -0.450 [-0.778, -0.125] **BEATS**; cap (min of shipped and group) vs shipped: 0.010 [-0.183, 0.190] **NO-GAIN**. Negative = the new comparator has the smaller error.
- Live 2026 rookie QBs against their group's CI: ABOVE 2, WITHIN 2, BELOW 10 (n = 14).
- Mendoza (`13269`, top12): live level 23.200 league = 20.826 half-PPR; ktc-neutral reconstruction 16.100; top12 fit 15.801 [14.255, 17.415]; **ABOVE** (gap 5.025).

## Coverage and exclusions

| season | team-games | with primary | rate |
|---|---|---|---|
| 2013 | 512 | 507 | 0.9902 |
| 2014 | 512 | 509 | 0.9941 |
| 2015 | 512 | 512 | 1.0000 |
| 2016 | 512 | 512 | 1.0000 |
| 2017 | 512 | 512 | 1.0000 |
| 2018 | 512 | 512 | 1.0000 |
| 2019 | 512 | 512 | 1.0000 |
| 2020 | 512 | 512 | 1.0000 |
| 2021 | 544 | 544 | 1.0000 |
| 2022 | 542 | 542 | 1.0000 |
| 2023 | 544 | 544 | 1.0000 |
| 2024 | 544 | 544 | 1.0000 |
| 2025 | 544 | 544 | 1.0000 |

Excluded primary games: noCrosswalk 0, noScheduleGame 0, nonQB 1, noDraftRound 0, missingPoints 1. Snapshot rows excluded: notRookieRoute 0, inconsistentCapture 0, badBasisScale 0.

## Q1 — Level

| group | rookies | games | value | 95% CI | rookies with ≥ 3 starts (n) | player-weighted mean | league × scale | league by ratio |
|---|---|---|---|---|---|---|---|---|
| top12 | 30 | 349 | 15.801 | [14.255, 17.415] | 27 | 15.728 | 17.602 | 17.504 (30 rookies) |
| r1 | 9 | 81 | 14.355 | [12.061, 16.532] | 8 | 13.902 | 15.991 | 15.774 (9 rookies) |
| day2 | 17 | 124 | 13.303 | [12.311, 14.399] | 14 | 13.443 | 14.820 | 14.814 (17 rookies) |
| day3+ | 34 | 136 | 12.341 | [10.358, 14.081] | 19 | 11.454 | 13.748 | 13.813 (33 rookies) |
| pooled | 90 | 690 | 14.500 | [13.556, 15.471] | 68 | 13.849 | 16.153 | 16.093 (89 rookies) |

The player-weighted mean covers the rookie-seasons with ≥ 3 starts (the Q3 unit set); cells under 3 rookies show `—`. League × scale uses the snapshot's captured `rookieBasisScale` (1.114).

## Q2 — Splits (report-only)

Each split is a two-way partition; if either side has < 3 rookies, both are `—` (complementary suppression).

### era: 2013-2018 vs 2019-2025

| group | 2013-2018 rookies | games | value | 2019-2025 rookies | games | value |
|---|---|---|---|---|---|---|
| top12 | 12 | 135 | 14.867 | 18 | 214 | 16.390 |
| r1 | 5 | 34 | 14.094 | 4 | 47 | 14.543 |
| day2 | 8 | 71 | 13.024 | 9 | 53 | 13.677 |
| day3+ | 10 | 34 | 14.686 | 24 | 102 | 11.559 |
| pooled | 35 | 274 | 14.271 | 55 | 416 | 14.651 |

### origin: g1 vs takeover

| group | g1 rookies | games | value | takeover rookies | games | value |
|---|---|---|---|---|---|---|
| top12 | 16 | 216 | 16.270 | 14 | 133 | 15.040 |
| r1 | 2 | 27 | — | 7 | 54 | — |
| day2 | 3 | 44 | 13.286 | 14 | 80 | 13.313 |
| day3+ | 2 | 29 | — | 32 | 107 | — |
| pooled | 23 | 316 | 15.722 | 67 | 374 | 13.468 |

### half: gIndex<=8 vs gIndex>=9

| group | gIndex<=8 rookies | games | value | gIndex>=9 rookies | games | value |
|---|---|---|---|---|---|---|
| top12 | 27 | 165 | 15.827 | 28 | 184 | 15.778 |
| r1 | 7 | 30 | 13.833 | 9 | 51 | 14.661 |
| day2 | 12 | 50 | 12.492 | 16 | 74 | 13.852 |
| day3+ | 15 | 36 | 13.408 | 30 | 100 | 11.956 |
| pooled | 61 | 281 | 14.711 | 83 | 409 | 14.356 |

## Q3 — Held out vs the shipped level

| comparator | MAE |
|---|---|
| A shipped ktc-neutral | 3.739 |
| B pooled rookie mean | 3.548 |
| C group mean | 3.098 |
| D min(A, C) | 3.750 |

| comparison | mean Δ error | 95% CI | label |
|---|---|---|---|
| C vs A | -0.641 | [-1.247, -0.021] | BEATS |
| C vs B | -0.450 | [-0.778, -0.125] | BEATS |
| D vs A | 0.010 | [-0.183, 0.190] | NO-GAIN |

| group | units | mean signed error of A (A − actual) |
|---|---|---|
| top12 | 27 | 0.461 |
| r1 | 8 | -0.277 |
| day2 | 14 | -2.965 |
| day3+ | 19 | -3.818 |

Units: 68 (top12 27, r1 8, day2 14, day3+ 19); group-mean fallback to pooled: 0.

**Selection caveat.** A is the ktc-neutral reconstruction. The live app multiplies by `ktcMult` (0.70–1.30) and `collegeContribution`; for top picks both run above 1, so live levels sit above A (Q4 shows by how much). Q3 tests the reconstructable part of the shipped level, not the live number.

## Q4 — Live 2026 rookie QBs vs the fit

| pid | group | team | dp | level (league) | level (half) | recon (half) | ktcMult | college | fit (half) | fit CI | gap | class |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 13269 | top12 | LV | 3 | 23.200 | 20.826 | 16.100 | 1.156 | 1.250 | 15.801 | [14.255, 17.415] | 5.025 | ABOVE |
| 13272 | day2 | ARI | 3 | 14.500 | 13.016 | 8.700 | 1.048 | 1.230 | 13.303 | [12.311, 14.399] | -0.287 | WITHIN |
| 13275 | r1 | LAR | 3 | 20.600 | 18.492 | 11.700 | 1.090 | 1.250 | 14.355 | [12.061, 16.532] | 4.137 | ABOVE |
| 13289 | day2 | PIT | 4 | 13.500 | 12.118 | 11.200 | 1.006 | 1.080 | 13.303 | [12.311, 14.399] | -1.185 | BELOW |
| 13295 | day3+ | NE | 3 | 8.600 | 7.720 | 6.200 | 1.000 | 1.250 | 12.341 | [10.358, 14.081] | -4.621 | BELOW |
| 13303 | day3+ | NYJ | 3 | 12.900 | 11.580 | 9.100 | 0.952 | 1.200 | 12.341 | [10.358, 14.081] | -0.761 | WITHIN |
| 13306 | day3+ | CLE | 4 | 9.300 | 8.348 | 6.600 | 0.868 | 1.250 | 12.341 | [10.358, 14.081] | -3.993 | BELOW |
| 13314 | day3+ | DET | — | 11.500 | 10.323 | 7.100 | 1.000 | 1.250 | 12.341 | [10.358, 14.081] | -2.018 | BELOW |
| 13335 | day3+ | PHI | 4 | 8.200 | 7.361 | 7.200 | 0.700 | 1.250 | 12.341 | [10.358, 14.081] | -4.980 | BELOW |
| 13350 | day3+ | BAL | 4 | 9.900 | 8.887 | 7.100 | 1.000 | 1.250 | 12.341 | [10.358, 14.081] | -3.454 | BELOW |
| 13404 | day3+ | KC | 3 | 6.600 | 5.925 | 6.200 | 0.838 | 1.150 | 12.341 | [10.358, 14.081] | -6.416 | BELOW |
| 13415 | day3+ | CAR | 3 | 9.900 | 8.887 | 7.100 | 1.000 | 1.250 | 12.341 | [10.358, 14.081] | -3.454 | BELOW |
| 13425 | day3+ | TB | 1 | 10.800 | 9.695 | 7.100 | 0.934 | 1.250 | 12.341 | [10.358, 14.081] | -2.646 | BELOW |
| 13557 | day3+ | WAS | 4 | 10.000 | 8.977 | 7.200 | 1.000 | 1.250 | 12.341 | [10.358, 14.081] | -3.364 | BELOW |

| group | n | mean level (half) | fit (half) | ABOVE | WITHIN | BELOW |
|---|---|---|---|---|---|---|
| top12 | 1 | 20.826 | 15.801 | 1 | 0 | 0 |
| r1 | 1 | 18.492 | 14.355 | 1 | 0 | 0 |
| day2 | 2 | 12.567 | 13.303 | 0 | 1 | 1 |
| day3+ | 10 | 8.770 | 12.341 | 0 | 1 | 9 |

`levelHalf` = level ÷ captured `rookieBasisScale`, rounded to 3 dp; the class compares that rounded value with the constants' rounded CI.

## Definitions and notes

- **Groups are round-based** (D2): top12 = round 1 pick ≤ 12, r1 = round 1 pick ≥ 13, day2 = rounds 2–3, day3+ = rounds 4–7 or undrafted. This deliberately differs from P6a's `draftOvr` bins (late round-3 compensatory picks have `draftOvr` > 100).
- **Selection.** Day-2/day-3 starters are a selected subset (only the good ones start), so a group value is "PPG **if** he starts", never a talent estimate for every rookie in the group.
- **Estimator.** Σ points ÷ Σ primary games per group (half-PPR `weeklyPoints`; no gamelogs points are read). CIs resample rookie-seasons (4000, seed 12345).

## For P12b

1. `qbStarterPPG` is `ceiledPPG`, also the rookie route's `projectedPPG`, which the dynasty arm-B prior reads: changing the shared level moves the 2c prior (CR-25 re-fit). Scope to `qbStarterPPG` alone, or accept the re-fit.
2. Groups map from the app's draft match: top12 = round 1 && pick ≤ 12, r1 = round 1 && pick ≥ 13, day2 = `DAY2_TIERS`, day3+ = `DAY3_TIERS` ∪ undrafted; unknown capital has no group (keep the current level).
3. "Replace" raises day-2/day-3 starter levels (selected starters score above their shipped level); "cap" (Q3 D) only lowers. This verdict does not choose.
4. Any change re-mirrors `lib/rookieMirror.mjs` (CR-15), bumps `PRIOR_MODEL_FROM`, adds an anchor-policy boundary, and extends CR-27.
5. Pinned values are half-PPR; multiply by `positionBasisScale.QB` at runtime like `ROOKIE_CEILING`.

## What this does not model

Rookie development within the season beyond the Q2 half split, offensive environment, injuries shortening starts.

Fixture re-derivation: exact.

**Reproduce:** node bin/backtest.mjs --qb-rookie-level --write
