# D-13 — composed rookie total points (shipped PPG × availability games) vs realised

Generated 2026-10-11T23:45:26.470Z. Offline analysis only: no score, constant or served file moves. Basis half_ppr.

## §A Population and parity

Panel `backtests/2026-10-10-rookie-panel.json @ 7e900fc5c45ca223cfb8eeb4892f8c53b1195c03` — `rookiePathAll.rows`, 3848 rows (W2's committed availability panel, the population the app's games ladder reproduces). Prediction: `reconstructShippedRookieProjection(...).projectedTotalPts` (calibrated, ceiled PPG × the ladder's games, rounded as the app rounds). Outcome: `outcomeTotalPts`; absent rows count as zero. Parity: the uncorrected reconstruction reproduces the row's own `projectedPPG` on 3848 of 3848 rows (the run stops otherwise).

## §B Bias — Σpred / Σreal

| slice | rows | players | mean pred | mean real | Σpred / Σreal | 95% CI (player-clustered) | Σ(predPPG × real games) / Σreal |
|---|---|---|---|---|---|---|---|
| all rows | 3848 | 2071 | 23.99 | 20.56 | 1.167 | [1.102, 1.243] | 1.133 |

**By draft group (all positions)**

| slice | rows | players | mean pred | mean real | Σpred / Σreal | 95% CI (player-clustered) | Σ(predPPG × real games) / Σreal |
|---|---|---|---|---|---|---|---|
| r1 | 152 | 127 | 134.71 | 133.82 | 1.007 | [0.882, 1.162] | 0.960 |
| day2 | 360 | 276 | 76.23 | 62.24 | 1.225 | [1.107, 1.367] | 1.127 |
| day3 | 1119 | 632 | 24.19 | 19.74 | 1.225 | [1.100, 1.365] | 1.252 |
| undrafted | 2217 | 1036 | 7.82 | 6.44 | 1.214 | [1.071, 1.384] | 1.202 |

**By draft group, non-QB**

| slice | rows | players | mean pred | mean real | Σpred / Σreal | 95% CI (player-clustered) | Σ(predPPG × real games) / Σreal |
|---|---|---|---|---|---|---|---|
| r1 | 95 | 86 | 104.89 | 121.48 | 0.863 | [0.760, 0.995] | 0.882 |
| day2 | 295 | 249 | 74.74 | 65.78 | 1.136 | [1.032, 1.262] | 1.135 |
| day3 | 875 | 555 | 26.63 | 21.19 | 1.257 | [1.127, 1.409] | 1.278 |
| undrafted | 2026 | 963 | 7.39 | 6.17 | 1.197 | [1.051, 1.374] | 1.206 |

**QB, all groups**

| slice | rows | players | mean pred | mean real | Σpred / Σreal | 95% CI (player-clustered) | Σ(predPPG × real games) / Σreal |
|---|---|---|---|---|---|---|---|
| QB | 557 | 218 | 39.56 | 30.75 | 1.286 | [1.098, 1.529] | 1.088 |

**By draft group × position**

| slice | rows | players | mean pred | mean real | Σpred / Σreal | 95% CI (player-clustered) | Σ(predPPG × real games) / Σreal |
|---|---|---|---|---|---|---|---|
| r1\|QB | 57 | 41 | 184.40 | 154.41 | 1.194 | [0.963, 1.533] | 1.063 |
| r1\|RB | 18 | 17 | 139.31 | 179.03 | 0.778 | [0.663, 0.929] | 0.830 |
| r1\|WR | 61 | 54 | 103.69 | 109.54 | 0.947 | [0.794, 1.162] | 0.934 |
| r1\|TE | 16 | 15 | 70.76 | 102.26 | 0.692 | [0.532, 0.925] | 0.770 |
| day2\|QB | 65 | 27 | 82.98 | 46.18 | 1.797 | [1.266, 2.871] | 1.072 |
| day2\|RB | 91 | 71 | 85.66 | 86.21 | 0.994 | [0.842, 1.196] | 1.008 |
| day2\|WR | 127 | 117 | 82.08 | 68.00 | 1.207 | [1.064, 1.390] | 1.189 |
| day2\|TE | 77 | 61 | 49.74 | 37.97 | 1.310 | [1.049, 1.701] | 1.319 |
| day3\|QB | 244 | 77 | 15.44 | 14.55 | 1.062 | [0.775, 1.520] | 1.121 |
| day3\|RB | 303 | 204 | 37.26 | 29.23 | 1.275 | [1.085, 1.516] | 1.275 |
| day3\|WR | 385 | 234 | 23.15 | 17.96 | 1.289 | [1.080, 1.562] | 1.310 |
| day3\|TE | 187 | 117 | 16.59 | 14.81 | 1.120 | [0.920, 1.417] | 1.203 |
| undrafted\|QB | 191 | 73 | 12.36 | 9.31 | 1.328 | [0.906, 2.349] | 1.175 |
| undrafted\|RB | 564 | 290 | 10.51 | 8.91 | 1.180 | [0.942, 1.498] | 1.188 |
| undrafted\|WR | 1005 | 468 | 6.57 | 5.63 | 1.167 | [0.967, 1.425] | 1.207 |
| undrafted\|TE | 457 | 205 | 5.34 | 3.98 | 1.341 | [1.046, 1.782] | 1.253 |

**By experience**

| slice | rows | players | mean pred | mean real | Σpred / Σreal | 95% CI (player-clustered) | Σ(predPPG × real games) / Σreal |
|---|---|---|---|---|---|---|---|
| 0 | 2071 | 2071 | 32.91 | 29.13 | 1.130 | [1.068, 1.198] | 1.108 |
| 1 | 1120 | 1120 | 12.35 | 10.87 | 1.135 | [0.977, 1.332] | 1.081 |
| 2+ | 657 | 362 | 15.72 | 10.08 | 1.560 | [1.260, 1.982] | 1.451 |

**Target season 2025 — in-sample (the games ladder and the PPG calibration were fitted on overlapping rows, target seasons <= 2025)**

| slice | rows | players | mean pred | mean real | Σpred / Σreal | 95% CI (player-clustered) | Σ(predPPG × real games) / Σreal |
|---|---|---|---|---|---|---|---|
| 2025, all | 293 | 293 | 25.26 | 20.80 | 1.214 | [1.036, 1.468] | 1.221 |
| 2025, r1 non-QB | 8 | 8 | 105.38 | 133.72 | 0.788 | [0.597, 1.123] | 0.843 |
| 2025, day2 non-QB | 24 | 24 | 69.49 | 58.93 | 1.179 | [0.881, 1.778] | 1.265 |
| 2025, day3 non-QB | 72 | 72 | 27.95 | 24.16 | 1.157 | [0.856, 1.700] | 1.254 |
| 2025, undrafted non-QB | 141 | 141 | 7.47 | 3.70 | 2.020 | [1.375, 3.318] | 1.949 |

## §C Decomposition — where the bias comes from

`Σ(predPPG × real games) / Σreal` holds the games side at its realised value: a ratio near the total ratio says the per-game level carries the bias; a ratio near 1 says the games carry it. Realised PPG over predicted PPG, split by how many games the rookie went on to play:

| slice | real PPG / predicted PPG, ≥ 6 games | real PPG / predicted PPG, 1–5 games |
|---|---|---|
| all rows | 0.927 | 0.467 |
| r1, non-QB | 1.139 | 0.486 |
| day2, non-QB | 0.889 | 0.459 |
| day3, non-QB | 0.809 | 0.410 |
| undrafted, non-QB | 0.909 | 0.424 |
| QB | 1.029 | 0.516 |

## §D Leave-one-target-season-out (LOSO)

A per-group multiplier (Σreal / Σpred over the other seasons) is fitted for each held-out target season and applied to it. Δ = MAE(corrected) − MAE(shipped) on realised total points, player-clustered; BEATS means the correction lowers MAE with the CI below 0.

**All positions, keyed by draft group**

| group | full-sample multiplier | MAE shipped | MAE corrected | Δ | label |
|---|---|---|---|---|---|
| r1 | 0.993 | 70.57 | 70.81 | 0.24 [-0.177, 0.644] | NO-GAIN |
| day2 | 0.816 | 49.61 | 46.54 | -3.07 [-4.513, -1.550] | BEATS |
| day3 | 0.816 | 24.66 | 22.75 | -1.91 [-2.177, -1.636] | BEATS |
| undrafted | 0.824 | 10.52 | 9.66 | -0.86 [-0.916, -0.800] | BEATS |

**Decision rows (non-QB RB/WR/TE of the two calibrated groups), the multiplier fitted on those rows**

| group | rows | full-sample multiplier | MAE shipped | MAE corrected | Δ | label |
|---|---|---|---|---|---|---|
| day3 | 875 | 0.796 | 25.56 | 23.35 | -2.21 [-2.570, -1.831] | BEATS |
| undrafted | 2026 | 0.835 | 10.04 | 9.29 | -0.75 [-0.802, -0.704] | BEATS |

Candidate multipliers (full sample, non-QB rows, per group; not pinned anywhere): r1 1.158, day2 0.880, day3 0.796, undrafted 0.835.

## §E Decision

Rule (pre-registered; not tuned in this run):

- **Decision population:** non-QB rows of the two calibrated groups, `day3` and `undrafted`.
  - r1 and day2 are reported only. They carry no PPG calibration (`ROOKIE_CALIBRATION`'s own scope), because the neutral reconstruction understates them.
  - QB is reported only. A live backup rookie QB's total is the chain's, which this reconstruction does not compose (CR-15 Mirror).
- **A group is `correct`** when all three hold:
  - ρ = Σpred / Σreal ≥ 1.05 with CI lower bound > 1, or ρ ≤ 0.95 with CI upper bound < 1;
  - **and** its LOSO multiplier (fitted on that group's decision rows, folds by `targetSeason`) gives a ΔMAE labelled `BEATS`.
- **Verdict:** `recommend` when either group is `correct`, else `close`.
- **Primary metric:** bias. MAE rewards shrinking toward the median on a zero-heavy outcome, so it only confirms that the correction does not hurt out of sample.

| group | ρ | CI | LOSO Δ | label | result |
|---|---|---|---|---|---|
| day3 | 1.257 | [1.127, 1.409] | -2.21 [-2.570, -1.831] | BEATS | correct |
| undrafted | 1.197 | [1.051, 1.374] | -0.75 [-0.802, -0.704] | BEATS | correct |

**Verdict: `recommend`** — a recommendation for Anton, not a change.

## §F Limitations

- **KTC and college are neutral.** The live season projection multiplies by `ktcMult` (0.70–1.30) and `collegeContribution`, which history cannot reconstruct; KTC history starts 2026-05-18. The measured bias belongs to the neutral composition, which is the composition the PPG calibration itself was fitted on.
- **QB is not composed.** A `chain` row's total is the starter level × share × team games (CR-15).
- **Not out of sample.** The games ladder and the PPG calibration were fitted on overlapping rows, target seasons ≤ 2025. 2025 is shown but is in-sample; 2026 is the first clean season, once it completes (D-16's trigger).
- **MAE favours shrinkage** on a zero-heavy outcome. Bias is the primary metric.

## §G What a correction would move

- It moves `projectedTotalPts` of day-3 and undrafted RB/WR/TE rookie-path rows, by about −20%.
- It does not move `projectedPPG`, `projectedGames`, the dynasty score or the in-season k.
- The consumers that read `projectedTotalPts` are app `App.jsx`, `inSeasonScoring.js`, `PlayerCard.jsx` and `MyTeamView.jsx`.
- It would be an app slice: re-mirror in CR-15, a new rookie anchor-policy boundary, and the slice decides whether it touches `PRIOR_MODEL_FROM`.
- The proper fix stays D-13's original two-part model (PPG given a real season × probability of playing). The multiplier is the cheap version.

**Reproduce:** `node bin/backtest.mjs --rookie-total --write`
