# Dynasty score rework — out-of-sample verdict (S4a) · 2026-10-30

- Date: 2026-10-30 · data rev `69937c6` · pinned-inputs rev `a791db0`
- S3 history panel: `backtests/2026-10-30-dynasty-history-panel.json` (its pre-registration hash `dbeff35595357a6390307683a2d504118bb8fd8af6b337d875544cfd2b8126cc`)
- Pre-registration hash (task file §4–§5): `ef68a7696f150182dad86e6b4008c8f7b63d14db9e7ba213c8da976689df2d91`
- Headline cohorts S = 2015–2022 (h = 3), buffered leave-one-cohort-out folds; bootstrap 4000 player-clustered resamples, seed 12345; `sleeper` games only.
- **Offline research; nothing ships.** Nothing here reaches the app's scoring.

## 2. Decision

**S4A-NO-WIN**

**QB** — does not pass (noLossToB1B2 passed, b2DeltaAtLeastFloor failed, tiltRemoved failed). The procedure's out-of-fold rank correlation with realised value is 0.592 [+0.430, +0.691] (n=229, cohorts=8) predictive, against H 0.622 and the two-year average (B2) 0.674. Pre-specified test 1: P vs B2 -0.082 [-0.173, +0.001] (n=229, cohorts=8) no-difference. P vs B1 -0.022 [-0.111, +0.063] (n=229, cohorts=8) no-difference; the P vs B2 point estimate -0.082 against the floor -0.052. Pre-specified test 2: age tilt (mean bias at 31+ minus at ≤ 24, percentile points) of P +18.992 [+10.622, +26.855] (n=43, used=3906) overrates, reduction versus H -3.168 [-7.073, +0.994]: `tilt-remains`.

**RB** — does not pass (beatsB2 failed, tiltRemoved failed). The procedure's out-of-fold rank correlation with realised value is 0.698 [+0.621, +0.752] (n=606, cohorts=8) predictive, against H 0.651 and the two-year average (B2) 0.713. Pre-specified test 1: P vs B2 -0.014 [-0.039, +0.009] (n=606, cohorts=8) no-difference. Pre-specified test 2: age tilt (mean bias at 31+ minus at ≤ 24, percentile points) of P +21.261 [+14.520, +27.939] (n=103, used=4000) overrates, reduction versus H -1.193 [-3.942, +1.568]: `tilt-remains`.

**WR** — does not pass (beatsB2 failed, tiltRemoved failed). The procedure's out-of-fold rank correlation with realised value is 0.732 [+0.674, +0.776] (n=960, cohorts=8) predictive, against H 0.688 and the two-year average (B2) 0.735. Pre-specified test 1: P vs B2 -0.003 [-0.019, +0.013] (n=960, cohorts=8) no-difference. Pre-specified test 2: age tilt (mean bias at 31+ minus at ≤ 24, percentile points) of P +21.910 [+16.031, +27.509] (n=201, used=4000) overrates, reduction versus H -1.006 [-2.757, +0.819]: `tilt-remains`.

**TE** — does not pass (beatsB2 failed, tiltRemoved failed). The procedure's out-of-fold rank correlation with realised value is 0.746 [+0.681, +0.791] (n=612, cohorts=8) predictive, against H 0.697 and the two-year average (B2) 0.749. Pre-specified test 1: P vs B2 -0.003 [-0.023, +0.015] (n=612, cohorts=8) no-difference. Pre-specified test 2: age tilt (mean bias at 31+ minus at ≤ 24, percentile points) of P +24.411 [+16.512, +31.892] (n=108, used=4000) overrates, reduction versus H -5.615 [-8.219, -2.807]: `tilt-remains`.

**Exploratory — each candidate's own out-of-fold score (no selection).** K0-oof: QB vs B2 -0.082 `no-difference`, vs H -0.030 `no-difference`; RB vs B2 -0.014 `no-difference`, vs H +0.047 `beats-H`; WR vs B2 -0.003 `no-difference`, vs H +0.045 `beats-H`; TE vs B2 -0.003 `no-difference`, vs H +0.050 `beats-H`. K1-oof: QB vs B2 -0.067 `no-difference`, vs H -0.015 `no-difference`; RB vs B2 -0.020 `no-difference`, vs H +0.041 `beats-H`; WR vs B2 -0.005 `no-difference`, vs H +0.043 `beats-H`; TE vs B2 -0.022 `loses-to-B2`, vs H +0.031 `beats-H`. K2-oof: QB vs B2 -0.067 `no-difference`, vs H -0.015 `no-difference`; RB vs B2 -0.048 `loses-to-B2`, vs H +0.013 `no-difference`; WR vs B2 -0.021 `loses-to-B2`, vs H +0.026 `beats-H`; TE vs B2 -0.020 `loses-to-B2`, vs H +0.033 `beats-H`. K3-oof: QB vs B2 -0.067 `no-difference`, vs H -0.015 `no-difference`; RB vs B2 -0.045 `loses-to-B2`, vs H +0.017 `no-difference`; WR vs B2 -0.022 `loses-to-B2`, vs H +0.026 `beats-H`; TE vs B2 -0.022 `loses-to-B2`, vs H +0.031 `beats-H`. K3 uses next-season team information (the S+1 team), which reflects in-season moves, so it is report-only and never selectable.

**Caveats.**
- The candidates were designed after reading S3's results on all eight cohorts. The fold design keeps the fitting and choosing off the judged seasons; it cannot un-see S3. No completed-season cohort is untouched; the only truly fresh test is forward (captured 2026+ scores), which this slice does not do.
- When a test cohort comes before its fit cohorts (e.g. test 2015, fit 2018–2022), the fit cohorts' inputs and their age curves include the test cohort's outcome seasons. No test outcome is ever a fit target, but the fit has seen those seasons as inputs.
- The bootstrap holds each fold's fitted weights fixed, so the CIs leave out fit variance.
- `sleeper` games only (S3 gave identical labels under both games definitions).
- K3 uses next-season team information (the S+1 team), which reflects in-season moves, so it is report-only and never selectable (§5.2).

## 3. Primary table (M1, `sleeper` games, S = 2015–2022; ρ = equal-weight cohort average)

| position | ρ(P) | ρ(H) | ρ(B1) | ρ(B2) | P−B2 | P−B1 | P−H |
|---|---|---|---|---|---|---|---|
| QB | 0.592 [+0.430, +0.691] (n=229, cohorts=8) predictive | 0.622 [+0.466, +0.721] (n=229, cohorts=8) predictive | 0.613 [+0.444, +0.723] (n=229, cohorts=8) predictive | 0.674 [+0.513, +0.771] (n=229, cohorts=8) predictive | -0.082 [-0.173, +0.001] (n=229, cohorts=8) no-difference | -0.022 [-0.111, +0.063] (n=229, cohorts=8) no-difference | -0.030 [-0.074, +0.012] (n=229, cohorts=8) no-difference |
| RB | 0.698 [+0.621, +0.752] (n=606, cohorts=8) predictive | 0.651 [+0.573, +0.708] (n=606, cohorts=8) predictive | 0.726 [+0.653, +0.776] (n=606, cohorts=8) predictive | 0.713 [+0.632, +0.769] (n=606, cohorts=8) predictive | -0.014 [-0.039, +0.009] (n=606, cohorts=8) no-difference | -0.028 [-0.051, -0.008] (n=606, cohorts=8) loses-to-B1 | +0.047 [+0.017, +0.077] (n=606, cohorts=8) beats-H |
| WR | 0.732 [+0.674, +0.776] (n=960, cohorts=8) predictive | 0.688 [+0.625, +0.736] (n=960, cohorts=8) predictive | 0.741 [+0.682, +0.784] (n=960, cohorts=8) predictive | 0.735 [+0.675, +0.781] (n=960, cohorts=8) predictive | -0.003 [-0.019, +0.013] (n=960, cohorts=8) no-difference | -0.008 [-0.021, +0.004] (n=960, cohorts=8) no-difference | +0.045 [+0.025, +0.065] (n=960, cohorts=8) beats-H |
| TE | 0.746 [+0.681, +0.791] (n=612, cohorts=8) predictive | 0.697 [+0.629, +0.743] (n=612, cohorts=8) predictive | 0.760 [+0.693, +0.806] (n=612, cohorts=8) predictive | 0.749 [+0.678, +0.798] (n=612, cohorts=8) predictive | -0.003 [-0.023, +0.015] (n=612, cohorts=8) no-difference | -0.014 [-0.033, +0.004] (n=612, cohorts=8) no-difference | +0.050 [+0.027, +0.073] (n=612, cohorts=8) beats-H |

## 4. Age tilt and band means (M2; bias in percentile points, positive = the score rates him higher than he turned out; rows where P is non-null)

| position | subject | tilt (31+ minus ≤ 24) | le24 | 25-27 | 28-30 | ge31 |
|---|---|---|---|---|---|---|
| QB | P | +18.992 [+10.622, +26.855] (n=43) overrates | -13.991 [-21.011, -6.723] n=43 underrates | +1.032 [-4.307, +6.452] n=86 no-detectable-bias | -2.931 [-10.607, +5.004] n=69 no-detectable-bias | +5.001 [+0.871, +9.060] n=143 overrates |
| QB | H | +15.823 [+7.595, +23.330] (n=43) overrates | -10.814 [-17.719, -4.040] n=43 underrates | +0.182 [-5.300, +5.686] n=86 no-detectable-bias | -3.870 [-11.718, +4.209] n=69 no-detectable-bias | +5.009 [+0.785, +9.099] n=143 overrates |
| QB | B2 | +11.097 [+2.431, +19.618] (n=43) overrates | -7.102 [-14.509, -0.026] n=43 underrates | +1.861 [-3.528, +7.085] n=86 no-detectable-bias | -6.172 [-13.665, +1.691] n=69 no-detectable-bias | +3.994 [-0.231, +8.122] n=143 no-detectable-bias |
| RB | P | +21.261 [+14.520, +27.939] (n=103) overrates | -6.035 [-9.380, -2.718] n=216 underrates | -1.939 [-4.090, +0.185] n=454 no-detectable-bias | +2.641 [-0.970, +6.435] n=233 no-detectable-bias | +15.226 [+10.010, +20.583] n=103 overrates |
| RB | H | +20.068 [+13.712, +26.462] (n=103) overrates | -7.075 [-10.400, -3.737] n=216 underrates | -1.715 [-3.914, +0.470] n=454 no-detectable-bias | +4.156 [+0.466, +7.934] n=233 overrates | +12.993 [+8.041, +18.232] n=103 overrates |
| RB | B2 | +27.322 [+20.102, +34.530] (n=103) overrates | -7.581 [-11.156, -4.111] n=216 underrates | -4.345 [-6.532, -2.127] n=454 underrates | +6.767 [+3.039, +10.633] n=233 overrates | +19.741 [+14.340, +25.389] n=103 overrates |
| WR | P | +21.910 [+16.031, +27.509] (n=201) overrates | -6.830 [-9.401, -4.182] n=300 underrates | -3.963 [-5.653, -2.220] n=681 underrates | +4.628 [+1.941, +7.251] n=371 overrates | +15.079 [+10.465, +19.748] n=201 overrates |
| WR | H | +20.904 [+15.145, +26.301] (n=201) overrates | -7.903 [-10.526, -5.239] n=300 underrates | -2.732 [-4.437, -0.983] n=681 underrates | +4.363 [+1.584, +7.086] n=371 overrates | +13.001 [+8.641, +17.342] n=201 overrates |
| WR | B2 | +30.904 [+24.704, +36.766] (n=201) overrates | -10.375 [-13.041, -7.519] n=300 underrates | -5.142 [-6.907, -3.335] n=681 underrates | +6.706 [+4.031, +9.381] n=371 overrates | +20.529 [+15.573, +25.341] n=201 overrates |
| TE | P | +24.411 [+16.512, +31.892] (n=108) overrates | -13.100 [-17.570, -8.221] n=108 underrates | -0.706 [-3.024, +1.716] n=403 no-detectable-bias | -0.273 [-3.563, +3.033] n=261 no-detectable-bias | +11.311 [+5.880, +16.550] n=169 overrates |
| TE | H | +18.796 [+10.705, +26.510] (n=108) overrates | -12.315 [-16.794, -7.620] n=108 underrates | +0.862 [-1.259, +3.181] n=403 no-detectable-bias | -0.155 [-3.126, +2.834] n=261 no-detectable-bias | +6.481 [+0.827, +12.002] n=169 overrates |
| TE | B2 | +30.121 [+22.086, +37.909] (n=108) overrates | -13.247 [-18.128, -8.165] n=108 underrates | -3.840 [-6.241, -1.301] n=403 underrates | +0.999 [-2.308, +4.269] n=261 no-detectable-bias | +16.874 [+11.411, +22.125] n=169 overrates |

| position | tilt(H) − tilt(P) (CI) | label |
|---|---|---|
| QB | -3.168 [-7.073, +0.994] (used=3906) | `tilt-remains` |
| RB | -1.193 [-3.942, +1.568] (used=4000) | `tilt-remains` |
| WR | -1.006 [-2.757, +0.819] (used=4000) | `tilt-remains` |
| TE | -5.615 [-8.219, -2.807] (used=4000) | `tilt-remains` |

## 5. Exploratory: each candidate's own out-of-fold score and hit rates

| position | score | ρ | vs B2 | vs H |
|---|---|---|---|---|
| QB | K0-oof | 0.592 [+0.430, +0.691] (n=229, cohorts=8) predictive | -0.082 [-0.173, +0.001] (n=229, cohorts=8) no-difference | -0.030 [-0.074, +0.012] (n=229, cohorts=8) no-difference |
| QB | K1-oof | 0.607 [+0.451, +0.702] (n=229, cohorts=8) predictive | -0.067 [-0.148, +0.009] (n=229, cohorts=8) no-difference | -0.015 [-0.069, +0.035] (n=229, cohorts=8) no-difference |
| QB | K2-oof | 0.607 [+0.444, +0.708] (n=229, cohorts=8) predictive | -0.067 [-0.145, +0.010] (n=229, cohorts=8) no-difference | -0.015 [-0.091, +0.059] (n=229, cohorts=8) no-difference |
| QB | K3-oof (report-only) | 0.607 [+0.444, +0.708] (n=229, cohorts=8) predictive | -0.067 [-0.145, +0.010] (n=229, cohorts=8) no-difference | -0.015 [-0.091, +0.059] (n=229, cohorts=8) no-difference |
| RB | K0-oof | 0.698 [+0.621, +0.752] (n=606, cohorts=8) predictive | -0.014 [-0.039, +0.009] (n=606, cohorts=8) no-difference | +0.047 [+0.017, +0.077] (n=606, cohorts=8) beats-H |
| RB | K1-oof | 0.693 [+0.615, +0.748] (n=606, cohorts=8) predictive | -0.020 [-0.042, +0.001] (n=606, cohorts=8) no-difference | +0.041 [+0.007, +0.077] (n=606, cohorts=8) beats-H |
| RB | K2-oof | 0.664 [+0.585, +0.722] (n=606, cohorts=8) predictive | -0.048 [-0.075, -0.023] (n=606, cohorts=8) loses-to-B2 | +0.013 [-0.021, +0.048] (n=606, cohorts=8) no-difference |
| RB | K3-oof (report-only) | 0.668 [+0.588, +0.726] (n=606, cohorts=8) predictive | -0.045 [-0.069, -0.020] (n=606, cohorts=8) loses-to-B2 | +0.017 [-0.018, +0.052] (n=606, cohorts=8) no-difference |
| WR | K0-oof | 0.732 [+0.674, +0.776] (n=960, cohorts=8) predictive | -0.003 [-0.019, +0.013] (n=960, cohorts=8) no-difference | +0.045 [+0.025, +0.065] (n=960, cohorts=8) beats-H |
| WR | K1-oof | 0.731 [+0.670, +0.776] (n=960, cohorts=8) predictive | -0.005 [-0.018, +0.008] (n=960, cohorts=8) no-difference | +0.043 [+0.020, +0.067] (n=960, cohorts=8) beats-H |
| WR | K2-oof | 0.714 [+0.654, +0.761] (n=960, cohorts=8) predictive | -0.021 [-0.037, -0.006] (n=960, cohorts=8) loses-to-B2 | +0.026 [+0.005, +0.049] (n=960, cohorts=8) beats-H |
| WR | K3-oof (report-only) | 0.714 [+0.653, +0.761] (n=960, cohorts=8) predictive | -0.022 [-0.038, -0.006] (n=960, cohorts=8) loses-to-B2 | +0.026 [+0.004, +0.049] (n=960, cohorts=8) beats-H |
| TE | K0-oof | 0.746 [+0.681, +0.791] (n=612, cohorts=8) predictive | -0.003 [-0.023, +0.015] (n=612, cohorts=8) no-difference | +0.050 [+0.027, +0.073] (n=612, cohorts=8) beats-H |
| TE | K1-oof | 0.727 [+0.656, +0.777] (n=612, cohorts=8) predictive | -0.022 [-0.041, -0.004] (n=612, cohorts=8) loses-to-B2 | +0.031 [+0.003, +0.059] (n=612, cohorts=8) beats-H |
| TE | K2-oof | 0.730 [+0.658, +0.780] (n=612, cohorts=8) predictive | -0.020 [-0.036, -0.004] (n=612, cohorts=8) loses-to-B2 | +0.033 [+0.005, +0.061] (n=612, cohorts=8) beats-H |
| TE | K3-oof (report-only) | 0.728 [+0.656, +0.778] (n=612, cohorts=8) predictive | -0.022 [-0.038, -0.006] (n=612, cohorts=8) loses-to-B2 | +0.031 [+0.002, +0.060] (n=612, cohorts=8) beats-H |

HR@12 / HR@24 (not gating):

| position | subject | HR@12 | HR@24 |
|---|---|---|---|
| QB | P | n/a [+0.403, +0.619] (n=229, cohorts=0) insufficient | n/a n/a (n=229, cohorts=0) insufficient |
| QB | H | n/a [+0.464, +0.643] (n=229, cohorts=0) insufficient | n/a n/a (n=229, cohorts=0) insufficient |
| QB | B2 | n/a [+0.556, +0.702] (n=229, cohorts=0) insufficient | n/a n/a (n=229, cohorts=0) insufficient |
| RB | P | 0.479 [+0.385, +0.604] (n=606, cohorts=8) | 0.633 [+0.549, +0.708] (n=606, cohorts=5) insufficient |
| RB | H | 0.469 [+0.375, +0.583] (n=606, cohorts=8) | 0.608 [+0.521, +0.688] (n=606, cohorts=5) insufficient |
| RB | B2 | 0.625 [+0.510, +0.708] (n=606, cohorts=8) | 0.683 [+0.576, +0.743] (n=606, cohorts=5) insufficient |
| WR | P | 0.604 [+0.458, +0.667] (n=960, cohorts=8) | 0.641 [+0.568, +0.703] (n=960, cohorts=8) |
| WR | H | 0.490 [+0.344, +0.573] (n=960, cohorts=8) | 0.599 [+0.526, +0.667] (n=960, cohorts=8) |
| WR | B2 | 0.646 [+0.500, +0.698] (n=960, cohorts=8) | 0.719 [+0.620, +0.760] (n=960, cohorts=8) |
| TE | P | 0.583 [+0.469, +0.677] (n=612, cohorts=8) | 0.688 [+0.597, +0.750] (n=612, cohorts=8) |
| TE | H | 0.490 [+0.365, +0.583] (n=612, cohorts=8) | 0.672 [+0.560, +0.722] (n=612, cohorts=8) |
| TE | B2 | 0.615 [+0.510, +0.740] (n=612, cohorts=8) | 0.734 [+0.649, +0.797] (n=612, cohorts=8) |

## 6. Fold table (chosen candidate and fitted weights per fold; weights are integers of 20)

**Primary folds**

| T | fit cohorts | chosen | QB | RB | WR | TE |
|---|---|---|---|---|---|---|
| 2015 | 2018, 2019, 2020, 2021, 2022 | K0 | ageAdj/trajectory/currentLevel/reliability/opportunity: [14, 0, 4, 1, 1]/20, objective 0.648 | ageAdj/trajectory/currentLevel/reliability/opportunity: [10, 0, 10, 0, 0]/20, objective 0.733 | ageAdj/trajectory/currentLevel/reliability/opportunity: [17, 0, 1, 2, 0]/20, objective 0.738 | ageAdj/trajectory/currentLevel/reliability/opportunity: [9, 1, 9, 0, 1]/20, objective 0.745 |
| 2016 | 2019, 2020, 2021, 2022 | K0 | ageAdj/trajectory/currentLevel/reliability/opportunity: [12, 0, 6, 0, 2]/20, objective 0.665 | ageAdj/trajectory/currentLevel/reliability/opportunity: [10, 0, 10, 0, 0]/20, objective 0.748 | ageAdj/trajectory/currentLevel/reliability/opportunity: [14, 0, 1, 5, 0]/20, objective 0.726 | ageAdj/trajectory/currentLevel/reliability/opportunity: [8, 0, 12, 0, 0]/20, objective 0.759 |
| 2017 | 2020, 2021, 2022 | K0 | ageAdj/trajectory/currentLevel/reliability/opportunity: [15, 1, 1, 2, 1]/20, objective 0.705 | ageAdj/trajectory/currentLevel/reliability/opportunity: [10, 0, 10, 0, 0]/20, objective 0.763 | ageAdj/trajectory/currentLevel/reliability/opportunity: [12, 0, 0, 7, 1]/20, objective 0.731 | ageAdj/trajectory/currentLevel/reliability/opportunity: [8, 0, 12, 0, 0]/20, objective 0.792 |
| 2018 | 2015, 2021, 2022 | K0 | ageAdj/trajectory/currentLevel/reliability/opportunity: [5, 2, 6, 5, 2]/20, objective 0.689 | ageAdj/trajectory/currentLevel/reliability/opportunity: [13, 0, 7, 0, 0]/20, objective 0.739 | ageAdj/trajectory/currentLevel/reliability/opportunity: [12, 0, 4, 1, 3]/20, objective 0.723 | ageAdj/trajectory/currentLevel/reliability/opportunity: [8, 0, 12, 0, 0]/20, objective 0.790 |
| 2019 | 2015, 2016, 2022 | K0 | ageAdj/trajectory/currentLevel/reliability/opportunity: [2, 0, 6, 10, 2]/20, objective 0.770 | ageAdj/trajectory/currentLevel/reliability/opportunity: [18, 0, 1, 0, 1]/20, objective 0.714 | ageAdj/trajectory/currentLevel/reliability/opportunity: [11, 0, 6, 2, 1]/20, objective 0.736 | ageAdj/trajectory/currentLevel/reliability/opportunity: [3, 0, 15, 0, 2]/20, objective 0.795 |
| 2020 | 2015, 2016, 2017 | K0 | ageAdj/trajectory/currentLevel/reliability/opportunity: [2, 0, 7, 10, 1]/20, objective 0.725 | ageAdj/trajectory/currentLevel/reliability/opportunity: [11, 0, 1, 6, 2]/20, objective 0.684 | ageAdj/trajectory/currentLevel/reliability/opportunity: [10, 0, 9, 1, 0]/20, objective 0.746 | ageAdj/trajectory/currentLevel/reliability/opportunity: [3, 2, 15, 0, 0]/20, objective 0.752 |
| 2021 | 2015, 2016, 2017, 2018 | K0 | ageAdj/trajectory/currentLevel/reliability/opportunity: [0, 0, 10, 6, 4]/20, objective 0.681 | ageAdj/trajectory/currentLevel/reliability/opportunity: [12, 0, 3, 0, 5]/20, objective 0.683 | ageAdj/trajectory/currentLevel/reliability/opportunity: [11, 0, 6, 2, 1]/20, objective 0.754 | ageAdj/trajectory/currentLevel/reliability/opportunity: [3, 0, 16, 0, 1]/20, objective 0.737 |
| 2022 | 2015, 2016, 2017, 2018, 2019 | K0 | ageAdj/trajectory/currentLevel/reliability/opportunity: [5, 0, 12, 0, 3]/20, objective 0.654 | ageAdj/trajectory/currentLevel/reliability/opportunity: [12, 0, 3, 0, 5]/20, objective 0.684 | ageAdj/trajectory/currentLevel/reliability/opportunity: [10, 0, 9, 1, 0]/20, objective 0.746 | ageAdj/trajectory/currentLevel/reliability/opportunity: [3, 0, 14, 0, 3]/20, objective 0.722 |

## 7. Final model — in-sample; the specification S4b would wire on `S4A-WIN`; not evidence

Procedure applied to all eight headline cohorts as one fit set. Chosen candidate: **K0** (component order ageAdj, trajectory, currentLevel, reliability, opportunity).

| position | weights, β, in-sample objective |
|---|---|
| QB | [2, 0, 13, 2, 3]/20, objective 0.665 |
| RB | [11, 0, 7, 1, 1]/20, objective 0.709 |
| WR | [15, 0, 4, 1, 0]/20, objective 0.739 |
| TE | [3, 0, 16, 0, 1]/20, objective 0.746 |

## 8. Forward-only robustness (T = 2018–2022, fit {2015 … T−3}; report-only)

| position | ρ(P) | ρ(H) | ρ(B2) | P−B2 | P−B1 | P−H |
|---|---|---|---|---|---|---|
| QB | 0.518 [+0.328, +0.654] (n=141, cohorts=5) predictive | 0.610 [+0.424, +0.734] (n=141, cohorts=5) predictive | 0.644 [+0.431, +0.776] (n=141, cohorts=5) predictive | -0.126 [-0.285, +0.022] (n=141, cohorts=5) no-difference | -0.103 [-0.269, +0.062] (n=141, cohorts=5) no-difference | -0.092 [-0.193, -0.006] (n=141, cohorts=5) loses-to-H |
| RB | 0.714 [+0.623, +0.777] (n=392, cohorts=5) predictive | 0.658 [+0.553, +0.735] (n=392, cohorts=5) predictive | 0.751 [+0.662, +0.808] (n=392, cohorts=5) predictive | -0.037 [-0.070, -0.006] (n=392, cohorts=5) loses-to-B2 | -0.042 [-0.073, -0.017] (n=392, cohorts=5) loses-to-B1 | +0.056 [+0.021, +0.092] (n=392, cohorts=5) beats-H |
| WR | 0.730 [+0.657, +0.784] (n=624, cohorts=5) predictive | 0.696 [+0.624, +0.752] (n=624, cohorts=5) predictive | 0.731 [+0.653, +0.790] (n=624, cohorts=5) predictive | -0.001 [-0.018, +0.017] (n=624, cohorts=5) no-difference | -0.012 [-0.026, +0.003] (n=624, cohorts=5) no-difference | +0.034 [+0.008, +0.056] (n=624, cohorts=5) beats-H |
| TE | 0.745 [+0.664, +0.800] (n=385, cohorts=5) predictive | 0.696 [+0.619, +0.751] (n=385, cohorts=5) predictive | 0.749 [+0.659, +0.814] (n=385, cohorts=5) predictive | -0.004 [-0.029, +0.022] (n=385, cohorts=5) no-difference | -0.009 [-0.035, +0.015] (n=385, cohorts=5) no-difference | +0.050 [+0.020, +0.079] (n=385, cohorts=5) beats-H |

## 9. Short horizons — not pooled with the headline

### S = 2023 (h = 2; fit 2015–2020) — not pooled

| position | ρ(P) | ρ(H) | ρ(B2) | P−B2 | P−B1 |
|---|---|---|---|---|---|
| QB | 0.550 [+0.159, +0.810] (n=28, cohorts=1) predictive | 0.581 [+0.210, +0.830] (n=28, cohorts=1) predictive | 0.522 [+0.130, +0.789] (n=28, cohorts=1) predictive | +0.028 [-0.092, +0.160] (n=28, cohorts=1) no-difference | -0.034 [-0.248, +0.142] (n=28, cohorts=1) no-difference |
| RB | 0.791 [+0.669, +0.872] (n=74, cohorts=1) predictive | 0.742 [+0.614, +0.835] (n=74, cohorts=1) predictive | 0.778 [+0.651, +0.860] (n=74, cohorts=1) predictive | +0.013 [-0.045, +0.073] (n=74, cohorts=1) no-difference | -0.012 [-0.072, +0.039] (n=74, cohorts=1) no-difference |
| WR | 0.742 [+0.645, +0.815] (n=119, cohorts=1) predictive | 0.685 [+0.580, +0.767] (n=119, cohorts=1) predictive | 0.715 [+0.607, +0.794] (n=119, cohorts=1) predictive | +0.027 [-0.011, +0.068] (n=119, cohorts=1) no-difference | -0.003 [-0.031, +0.024] (n=119, cohorts=1) no-difference |
| TE | 0.778 [+0.650, +0.861] (n=79, cohorts=1) predictive | 0.730 [+0.585, +0.832] (n=79, cohorts=1) predictive | 0.776 [+0.644, +0.858] (n=79, cohorts=1) predictive | +0.002 [-0.051, +0.051] (n=79, cohorts=1) no-difference | -0.002 [-0.054, +0.048] (n=79, cohorts=1) no-difference |

### S = 2024 (h = 1; fit 2015–2021) — not pooled

| position | ρ(P) | ρ(H) | ρ(B2) | P−B2 | P−B1 |
|---|---|---|---|---|---|
| QB | 0.417 [+0.054, +0.666] (n=25, cohorts=1) predictive | 0.421 [+0.086, +0.649] (n=25, cohorts=1) predictive | 0.507 [+0.175, +0.740] (n=25, cohorts=1) predictive | -0.089 [-0.250, +0.040] (n=25, cohorts=1) no-difference | +0.012 [-0.152, +0.175] (n=25, cohorts=1) no-difference |
| RB | 0.775 [+0.633, +0.868] (n=62, cohorts=1) predictive | 0.724 [+0.556, +0.831] (n=62, cohorts=1) predictive | 0.818 [+0.686, +0.896] (n=62, cohorts=1) predictive | -0.043 [-0.133, +0.030] (n=62, cohorts=1) no-difference | -0.049 [-0.151, +0.028] (n=62, cohorts=1) no-difference |
| WR | 0.741 [+0.635, +0.817] (n=114, cohorts=1) predictive | 0.695 [+0.580, +0.780] (n=114, cohorts=1) predictive | 0.759 [+0.660, +0.827] (n=114, cohorts=1) predictive | -0.018 [-0.071, +0.029] (n=114, cohorts=1) no-difference | -0.034 [-0.073, -0.001] (n=114, cohorts=1) loses-to-B1 |
| TE | 0.739 [+0.627, +0.814] (n=86, cohorts=1) predictive | 0.662 [+0.533, +0.759] (n=86, cohorts=1) predictive | 0.756 [+0.634, +0.838] (n=86, cohorts=1) predictive | -0.017 [-0.068, +0.039] (n=86, cohorts=1) no-difference | -0.005 [-0.059, +0.053] (n=86, cohorts=1) no-difference |

## 10. 2025 preview (outcome-free; final-model score vs H; birthdate ages; not the app's current scores)

| position | rows | scored | \|Δ\| ≥ 5 | \|Δ\| ≥ 10 | label changes |
|---|---|---|---|---|---|
| QB | 46 | 46 | 31 | 14 | 16 |
| RB | 118 | 118 | 74 | 38 | 34 |
| WR | 206 | 206 | 143 | 71 | 54 |
| TE | 122 | 122 | 83 | 44 | 43 |

## 11. Parity record and row counts

S3 parity: 4829 rows checked across S = 2015–2024, 0 mismatches (row set, H, B1, B2, M1, M2, h, age, changer).

| S | QB | RB | WR | TE |
|---|---|---|---|---|
| 2015 | 47 | 121 | 185 | 107 |
| 2016 | 43 | 123 | 188 | 121 |
| 2017 | 41 | 129 | 187 | 115 |
| 2018 | 42 | 122 | 195 | 124 |
| 2019 | 43 | 120 | 197 | 120 |
| 2020 | 44 | 123 | 195 | 114 |
| 2021 | 43 | 136 | 200 | 122 |
| 2022 | 38 | 132 | 206 | 123 |
| 2023 | 45 | 126 | 198 | 121 |
| 2024 | 49 | 116 | 204 | 124 |

S = 2025 preview rows: QB 46, RB 118, WR 206, TE 122.

Per the S4 brief, Session 1 proposes the display-only fallback; no rework is forced.
