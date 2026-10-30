# Dynasty score — first historical test (S3b) · 2026-10-30

- Date: 2026-10-30 · data rev `a791db0` · golden app rev `5209582`
- Pre-registration hash (task file §8): `dbeff35595357a6390307683a2d504118bb8fd8af6b337d875544cfd2b8126cc`
- Cohorts S = 2015…2024 (headline S = 2015–2022, h = 3); ages as of (S+1)-06-01; bootstrap 4000 player-clustered resamples, seed 12345.
- **Offline research; nothing ships.** Nothing here reaches the app's scoring.

## 2. What the evidence supports, and what it does not

Every sentence uses only the pre-registered labels with their numbers. Primary measure M1 (mean points per game over the seasons he qualified), games as Sleeper counts them, headline cohorts 2015–2022. The baseline comparison per position is the pre-specified test; everything else is exploratory (no multiplicity correction).

**QB.** The score's rank correlation with realised value is 0.622 [+0.466, +0.721] over 8 cohorts and 229 rows: `predictive`. Against last season's points per game (B1) the difference is +0.008 [-0.069, +0.082]: `no-difference`; against the two-year average (B2) -0.052 [-0.134, +0.028]: `no-difference`. Per-position summary: `matches`. Snaps-based games give the same labels.

**RB.** The score's rank correlation with realised value is 0.651 [+0.573, +0.708] over 8 cohorts and 606 rows: `predictive`. Against last season's points per game (B1) the difference is -0.075 [-0.107, -0.044]: `loses-to-B1`; against the two-year average (B2) -0.061 [-0.100, -0.021]: `loses-to-B2`. Per-position summary: `loses-to-both`. Snaps-based games give the same labels.

**WR.** The score's rank correlation with realised value is 0.688 [+0.625, +0.736] over 8 cohorts and 960 rows: `predictive`. Against last season's points per game (B1) the difference is -0.053 [-0.077, -0.030]: `loses-to-B1`; against the two-year average (B2) -0.048 [-0.077, -0.019]: `loses-to-B2`. Per-position summary: `loses-to-both`. Snaps-based games give the same labels.

**TE.** The score's rank correlation with realised value is 0.697 [+0.629, +0.743] over 8 cohorts and 612 rows: `predictive`. Against last season's points per game (B1) the difference is -0.063 [-0.091, -0.036]: `loses-to-B1`; against the two-year average (B2) -0.053 [-0.087, -0.019]: `loses-to-B2`. Per-position summary: `loses-to-both`. Snaps-based games give the same labels.

**Age bias** (M2, Sleeper games; bias in percentile points, positive = the score rates him higher than he turned out). Cells with a label other than `no-detectable-bias`: QB le24: -10.814 [-17.719, -4.040] (n=43) `underrates`; QB ge31: +5.009 [+0.785, +9.099] (n=143) `overrates`; RB le24: -7.075 [-10.400, -3.737] (n=216) `underrates`; RB 28-30: +4.156 [+0.466, +7.934] (n=233) `overrates`; RB ge31: +12.993 [+8.041, +18.232] (n=103) `overrates`; WR le24: -7.903 [-10.526, -5.239] (n=300) `underrates`; WR 25-27: -2.732 [-4.437, -0.983] (n=681) `underrates`; WR 28-30: +4.363 [+1.584, +7.086] (n=371) `overrates`; WR ge31: +13.001 [+8.641, +17.342] (n=201) `overrates`; TE le24: -12.315 [-16.794, -7.620] (n=108) `underrates`; TE ge31: +6.481 [+0.827, +12.002] (n=169) `overrates`.

**Components and ablations** (exploratory; ρ, M1, Sleeper games). Leave-one-component-out labels over 20 cells: 7 × `no-detectable-contribution`, 4 × `component-hurts`, 9 × `component-helps`. Labelled cells: QB trajectory -0.032 [-0.064, -0.000] `component-hurts`; QB currentLevel +0.075 [+0.023, +0.129] `component-helps`; RB ageAdjusted +0.059 [+0.039, +0.082] `component-helps`; RB trajectory -0.051 [-0.078, -0.025] `component-hurts`; RB currentLevel +0.038 [+0.021, +0.054] `component-helps`; RB opportunityQuality +0.010 [+0.001, +0.020] `component-helps`; WR ageAdjusted +0.061 [+0.047, +0.076] `component-helps`; WR trajectory -0.041 [-0.061, -0.023] `component-hurts`; WR currentLevel +0.042 [+0.032, +0.053] `component-helps`; WR reliability +0.007 [+0.002, +0.011] `component-helps`; TE ageAdjusted +0.053 [+0.032, +0.075] `component-helps`; TE trajectory -0.039 [-0.060, -0.018] `component-hurts`; TE currentLevel +0.049 [+0.035, +0.064] `component-helps`. Ablation cells labelled better or worse: A-AGE-DELTA~H RB -0.020 [-0.036, -0.005] `ablation-worse`; A-AGE-DELTA~H WR -0.027 [-0.040, -0.015] `ablation-worse`; A-AGE-DELTA~H TE -0.028 [-0.044, -0.011] `ablation-worse`; A-ST-chg~H WR +0.003 [+0.001, +0.005] `ablation-better`; A-ST-all~H WR +0.004 [+0.001, +0.008] `ablation-better`; A-ST-all~H TE +0.005 [+0.000, +0.009] `ablation-better`; A-AV-d~H TE -0.007 [-0.011, -0.002] `ablation-worse`; H~A-AGE-APP TE -0.014 [-0.029, -0.001] `ablation-worse` — today's app curve error transported to S — contains post-S information; not the error the app had at S; A-AGE-DELTA~A-AGE-APP WR -0.021 [-0.033, -0.010] `ablation-worse` — today's app curve error transported to S — contains post-S information; not the error the app had at S; A-AGE-DELTA~A-AGE-APP TE -0.042 [-0.063, -0.023] `ablation-worse` — today's app curve error transported to S — contains post-S information; not the error the app had at S.

## 3. Headline ρ (H score vs realised value, equal-weight cohort average, S = 2015–2022)

| position | measure | games | ρ | 95% CI | n | cohorts | label |
|---|---|---|---|---|---|---|---|
| QB | M1 | sleeper | 0.622 | [+0.466, +0.721] | 229 | 8 | predictive |
| QB | M1 | snaps | 0.622 | [+0.465, +0.721] | 229 | 8 | predictive |
| QB | M2 | sleeper | 0.651 | [+0.523, +0.736] | 341 | 8 | predictive |
| QB | M2 | snaps | 0.651 | [+0.522, +0.736] | 341 | 8 | predictive |
| RB | M1 | sleeper | 0.651 | [+0.573, +0.708] | 606 | 8 | predictive |
| RB | M1 | snaps | 0.652 | [+0.574, +0.708] | 607 | 8 | predictive |
| RB | M2 | sleeper | 0.535 | [+0.464, +0.595] | 1006 | 8 | predictive |
| RB | M2 | snaps | 0.535 | [+0.463, +0.595] | 1006 | 8 | predictive |
| WR | M1 | sleeper | 0.688 | [+0.625, +0.736] | 960 | 8 | predictive |
| WR | M1 | snaps | 0.687 | [+0.624, +0.735] | 960 | 8 | predictive |
| WR | M2 | sleeper | 0.633 | [+0.582, +0.678] | 1553 | 8 | predictive |
| WR | M2 | snaps | 0.633 | [+0.581, +0.677] | 1552 | 8 | predictive |
| TE | M1 | sleeper | 0.697 | [+0.629, +0.743] | 612 | 8 | predictive |
| TE | M1 | snaps | 0.695 | [+0.627, +0.742] | 614 | 8 | predictive |
| TE | M2 | sleeper | 0.602 | [+0.533, +0.659] | 946 | 8 | predictive |
| TE | M2 | snaps | 0.604 | [+0.535, +0.660] | 946 | 8 | predictive |

## 4. Baselines the score must beat

B1 = last qualifying season's PPG; B2 = mean PPG of the qualifying seasons among {S−1, S}. Δ = H − baseline.

**M1, sleeper games**

| position | statistic | H | B1 | B2 | H−B1 (CI) label | H−B2 (CI) label |
|---|---|---|---|---|---|---|
| QB | rho | 0.622 | 0.613 | 0.674 | +0.008 [-0.069, +0.082] no-difference | -0.052 [-0.134, +0.028] no-difference |
| QB | hr12 | n/a | n/a | n/a | n/a [-0.083, +0.083] insufficient | n/a [-0.222, +0.000] insufficient |
| QB | hr24 | n/a | n/a | n/a | n/a n/a insufficient | n/a n/a insufficient |
| RB | rho | 0.651 | 0.726 | 0.713 | -0.075 [-0.107, -0.044] loses-to-B1 | -0.061 [-0.100, -0.021] loses-to-B2 |
| RB | hr12 | 0.469 | 0.615 | 0.625 | -0.146 [-0.219, -0.031] loses-to-B1 | -0.156 [-0.250, -0.031] loses-to-B2 |
| RB | hr24 | 0.608 | 0.658 | 0.683 | -0.050 [-0.139, -0.007] insufficient | -0.075 [-0.131, +0.014] insufficient |
| WR | rho | 0.688 | 0.741 | 0.735 | -0.053 [-0.077, -0.030] loses-to-B1 | -0.048 [-0.077, -0.019] loses-to-B2 |
| WR | hr12 | 0.490 | 0.604 | 0.646 | -0.115 [-0.229, -0.031] loses-to-B1 | -0.156 [-0.260, -0.031] loses-to-B2 |
| WR | hr24 | 0.599 | 0.682 | 0.719 | -0.083 [-0.141, -0.021] loses-to-B1 | -0.120 [-0.161, -0.026] loses-to-B2 |
| TE | rho | 0.697 | 0.760 | 0.749 | -0.063 [-0.091, -0.036] loses-to-B1 | -0.053 [-0.087, -0.019] loses-to-B2 |
| TE | hr12 | 0.490 | 0.667 | 0.615 | -0.177 [-0.281, -0.063] loses-to-B1 | -0.125 [-0.271, -0.042] loses-to-B2 |
| TE | hr24 | 0.672 | 0.755 | 0.734 | -0.083 [-0.161, -0.028] loses-to-B1 | -0.063 [-0.161, -0.014] loses-to-B2 |

**M1, snaps games**

| position | statistic | H | B1 | B2 | H−B1 (CI) label | H−B2 (CI) label |
|---|---|---|---|---|---|---|
| QB | rho | 0.622 | 0.614 | 0.674 | +0.008 [-0.070, +0.082] no-difference | -0.052 [-0.134, +0.028] no-difference |
| QB | hr12 | n/a | n/a | n/a | n/a [-0.083, +0.083] insufficient | n/a [-0.222, +0.000] insufficient |
| QB | hr24 | n/a | n/a | n/a | n/a n/a insufficient | n/a n/a insufficient |
| RB | rho | 0.652 | 0.727 | 0.713 | -0.075 [-0.107, -0.045] loses-to-B1 | -0.061 [-0.100, -0.022] loses-to-B2 |
| RB | hr12 | 0.469 | 0.615 | 0.625 | -0.146 [-0.219, -0.042] loses-to-B1 | -0.156 [-0.250, -0.031] loses-to-B2 |
| RB | hr24 | 0.608 | 0.658 | 0.683 | -0.050 [-0.139, +0.000] insufficient | -0.075 [-0.131, +0.014] insufficient |
| WR | rho | 0.687 | 0.740 | 0.734 | -0.053 [-0.076, -0.030] loses-to-B1 | -0.048 [-0.076, -0.019] loses-to-B2 |
| WR | hr12 | 0.490 | 0.604 | 0.646 | -0.115 [-0.229, -0.031] loses-to-B1 | -0.156 [-0.260, -0.031] loses-to-B2 |
| WR | hr24 | 0.604 | 0.682 | 0.724 | -0.078 [-0.141, -0.021] loses-to-B1 | -0.120 [-0.161, -0.026] loses-to-B2 |
| TE | rho | 0.695 | 0.760 | 0.750 | -0.065 [-0.093, -0.037] loses-to-B1 | -0.055 [-0.088, -0.021] loses-to-B2 |
| TE | hr12 | 0.479 | 0.667 | 0.615 | -0.188 [-0.281, -0.073] loses-to-B1 | -0.135 [-0.271, -0.052] loses-to-B2 |
| TE | hr24 | 0.672 | 0.755 | 0.734 | -0.083 [-0.160, -0.024] loses-to-B1 | -0.063 [-0.161, -0.014] loses-to-B2 |

**M2, sleeper games**

| position | statistic | H | B1 | B2 | H−B1 (CI) label | H−B2 (CI) label |
|---|---|---|---|---|---|---|
| QB | rho | 0.651 | 0.646 | 0.650 | +0.005 [-0.036, +0.047] no-difference | +0.001 [-0.041, +0.044] no-difference |
| QB | hr12 | 0.583 | 0.594 | 0.542 | -0.010 [-0.056, +0.104] no-difference | +0.042 [-0.073, +0.097] no-difference |
| QB | hr24 | n/a | n/a | n/a | n/a n/a insufficient | n/a n/a insufficient |
| RB | rho | 0.535 | 0.553 | 0.547 | -0.018 [-0.041, +0.006] no-difference | -0.012 [-0.043, +0.020] no-difference |
| RB | hr12 | 0.396 | 0.542 | 0.542 | -0.146 [-0.219, -0.031] loses-to-B1 | -0.146 [-0.229, -0.021] loses-to-B2 |
| RB | hr24 | 0.542 | 0.615 | 0.578 | -0.073 [-0.120, -0.016] loses-to-B1 | -0.036 [-0.115, +0.016] no-difference |
| WR | rho | 0.633 | 0.626 | 0.609 | +0.007 [-0.011, +0.026] no-difference | +0.025 [+0.000, +0.048] beats-B2 |
| WR | hr12 | 0.500 | 0.500 | 0.531 | +0.000 [-0.156, +0.052] no-difference | -0.031 [-0.188, +0.063] no-difference |
| WR | hr24 | 0.568 | 0.641 | 0.630 | -0.073 [-0.135, +0.000] loses-to-B1 | -0.063 [-0.146, +0.000] loses-to-B2 |
| TE | rho | 0.602 | 0.580 | 0.551 | +0.023 [-0.007, +0.052] no-difference | +0.051 [+0.016, +0.086] beats-B2 |
| TE | hr12 | 0.500 | 0.635 | 0.573 | -0.135 [-0.229, -0.010] loses-to-B1 | -0.073 [-0.198, +0.031] no-difference |
| TE | hr24 | 0.604 | 0.651 | 0.641 | -0.047 [-0.109, +0.031] no-difference | -0.036 [-0.104, +0.052] no-difference |

**M2, snaps games**

| position | statistic | H | B1 | B2 | H−B1 (CI) label | H−B2 (CI) label |
|---|---|---|---|---|---|---|
| QB | rho | 0.651 | 0.647 | 0.650 | +0.004 [-0.037, +0.046] no-difference | +0.001 [-0.042, +0.044] no-difference |
| QB | hr12 | 0.583 | 0.594 | 0.542 | -0.010 [-0.056, +0.104] no-difference | +0.042 [-0.073, +0.097] no-difference |
| QB | hr24 | n/a | n/a | n/a | n/a n/a insufficient | n/a n/a insufficient |
| RB | rho | 0.535 | 0.552 | 0.545 | -0.017 [-0.040, +0.006] no-difference | -0.011 [-0.042, +0.021] no-difference |
| RB | hr12 | 0.406 | 0.542 | 0.542 | -0.135 [-0.208, -0.031] loses-to-B1 | -0.135 [-0.229, -0.021] loses-to-B2 |
| RB | hr24 | 0.542 | 0.615 | 0.578 | -0.073 [-0.120, -0.010] loses-to-B1 | -0.036 [-0.115, +0.016] no-difference |
| WR | rho | 0.633 | 0.626 | 0.608 | +0.007 [-0.011, +0.026] no-difference | +0.025 [+0.000, +0.048] beats-B2 |
| WR | hr12 | 0.500 | 0.500 | 0.531 | +0.000 [-0.156, +0.052] no-difference | -0.031 [-0.188, +0.063] no-difference |
| WR | hr24 | 0.568 | 0.641 | 0.630 | -0.073 [-0.135, +0.000] loses-to-B1 | -0.063 [-0.146, +0.000] loses-to-B2 |
| TE | rho | 0.604 | 0.583 | 0.554 | +0.021 [-0.008, +0.051] no-difference | +0.050 [+0.015, +0.085] beats-B2 |
| TE | hr12 | 0.490 | 0.625 | 0.563 | -0.135 [-0.240, -0.010] loses-to-B1 | -0.073 [-0.198, +0.031] no-difference |
| TE | hr24 | 0.604 | 0.646 | 0.641 | -0.042 [-0.109, +0.031] no-difference | -0.036 [-0.104, +0.047] no-difference |

Per-position summary (ρ, M1, Sleeper games only): QB `matches`, RB `loses-to-both`, WR `loses-to-both`, TE `loses-to-both`.

## 5. Age-band bias (H age on 1 June after S; percentile points; pooled over headline cohorts)

**M1, sleeper games**

| position | le24 | 25-27 | 28-30 | ge31 |
|---|---|---|---|---|
| QB | -14.630 [-25.952, -4.543] n=32 underrates | +0.445 [-4.335, +5.186] n=58 no-detectable-bias | -4.937 [-12.912, +2.395] n=48 no-detectable-bias | +7.465 [+2.769, +12.642] n=91 overrates |
| RB | -5.677 [-9.392, -1.883] n=166 underrates | +1.265 [-1.233, +3.691] n=288 no-detectable-bias | +3.119 [-2.073, +8.453] n=115 no-detectable-bias | +5.927 [-0.845, +14.017] n=37 no-detectable-bias |
| WR | -5.859 [-8.560, -3.164] n=234 underrates | -0.211 [-1.991, +1.647] n=438 no-detectable-bias | +6.089 [+3.147, +9.129] n=217 overrates | +1.998 [-2.858, +6.940] n=71 no-detectable-bias |
| TE | -9.550 [-14.386, -4.454] n=97 underrates | +2.798 [+0.567, +4.978] n=273 overrates | +3.887 [+0.691, +6.942] n=159 overrates | -5.723 [-9.401, -1.930] n=80 underrates |

**M1, snaps games**

| position | le24 | 25-27 | 28-30 | ge31 |
|---|---|---|---|---|
| QB | -14.630 [-25.952, -4.543] n=32 underrates | +0.387 [-4.397, +5.175] n=58 no-detectable-bias | -4.902 [-12.876, +2.413] n=48 no-detectable-bias | +7.484 [+2.782, +12.662] n=91 overrates |
| RB | -5.725 [-9.451, -1.945] n=166 underrates | +1.314 [-1.165, +3.725] n=289 no-detectable-bias | +3.059 [-2.179, +8.394] n=115 no-detectable-bias | +5.910 [-0.827, +13.855] n=37 no-detectable-bias |
| WR | -5.905 [-8.596, -3.223] n=234 underrates | -0.195 [-1.961, +1.651] n=438 no-detectable-bias | +6.105 [+3.173, +9.141] n=217 overrates | +2.006 [-2.843, +6.951] n=71 no-detectable-bias |
| TE | -9.541 [-14.316, -4.434] n=97 underrates | +2.844 [+0.623, +5.013] n=275 overrates | +3.745 [+0.496, +6.857] n=159 overrates | -5.682 [-9.346, -1.938] n=80 underrates |

**M2, sleeper games**

| position | le24 | 25-27 | 28-30 | ge31 |
|---|---|---|---|---|
| QB | -10.814 [-17.719, -4.040] n=43 underrates | +0.182 [-5.300, +5.686] n=86 no-detectable-bias | -3.870 [-11.718, +4.209] n=69 no-detectable-bias | +5.009 [+0.785, +9.099] n=143 overrates |
| RB | -7.075 [-10.400, -3.737] n=216 underrates | -1.715 [-3.914, +0.470] n=454 no-detectable-bias | +4.156 [+0.466, +7.934] n=233 overrates | +12.993 [+8.041, +18.232] n=103 overrates |
| WR | -7.903 [-10.526, -5.239] n=300 underrates | -2.732 [-4.437, -0.983] n=681 underrates | +4.363 [+1.584, +7.086] n=371 overrates | +13.001 [+8.641, +17.342] n=201 overrates |
| TE | -12.315 [-16.794, -7.620] n=108 underrates | +0.862 [-1.259, +3.181] n=403 no-detectable-bias | -0.155 [-3.126, +2.834] n=261 no-detectable-bias | +6.481 [+0.827, +12.002] n=169 overrates |

**M2, snaps games**

| position | le24 | 25-27 | 28-30 | ge31 |
|---|---|---|---|---|
| QB | -10.814 [-17.719, -4.040] n=43 underrates | +0.155 [-5.313, +5.672] n=86 no-detectable-bias | -3.853 [-11.680, +4.241] n=69 no-detectable-bias | +5.018 [+0.787, +9.099] n=143 overrates |
| RB | -7.131 [-10.484, -3.782] n=216 underrates | -1.711 [-3.893, +0.464] n=454 no-detectable-bias | +4.182 [+0.476, +7.972] n=233 overrates | +13.034 [+8.068, +18.250] n=103 overrates |
| WR | -7.919 [-10.530, -5.259] n=300 underrates | -2.728 [-4.445, -0.981] n=680 underrates | +4.377 [+1.586, +7.109] n=371 overrates | +12.971 [+8.611, +17.302] n=201 overrates |
| TE | -12.326 [-16.824, -7.618] n=108 underrates | +0.793 [-1.334, +3.076] n=403 no-detectable-bias | -0.135 [-3.096, +2.878] n=261 no-detectable-bias | +6.619 [+1.039, +12.109] n=169 overrates |

## 6. Leave-one-component-out (Δρ = ρ(H) − ρ(LOO); positive = the component helps)

**M1, sleeper games**

| position | ageAdjusted | trajectory | currentLevel | reliability | opportunityQuality |
|---|---|---|---|---|---|
| QB | +0.013 [-0.006, +0.036] no-detectable-contribution | -0.032 [-0.064, -0.000] component-hurts | +0.075 [+0.023, +0.129] component-helps | +0.008 [-0.016, +0.035] no-detectable-contribution | +0.009 [-0.025, +0.046] no-detectable-contribution |
| RB | +0.059 [+0.039, +0.082] component-helps | -0.051 [-0.078, -0.025] component-hurts | +0.038 [+0.021, +0.054] component-helps | +0.003 [-0.004, +0.010] no-detectable-contribution | +0.010 [+0.001, +0.020] component-helps |
| WR | +0.061 [+0.047, +0.076] component-helps | -0.041 [-0.061, -0.023] component-hurts | +0.042 [+0.032, +0.053] component-helps | +0.007 [+0.002, +0.011] component-helps | +0.004 [-0.002, +0.010] no-detectable-contribution |
| TE | +0.053 [+0.032, +0.075] component-helps | -0.039 [-0.060, -0.018] component-hurts | +0.049 [+0.035, +0.064] component-helps | +0.002 [-0.004, +0.008] no-detectable-contribution | +0.005 [-0.004, +0.015] no-detectable-contribution |

**M1, snaps games**

| position | ageAdjusted | trajectory | currentLevel | reliability | opportunityQuality |
|---|---|---|---|---|---|
| QB | +0.013 [-0.006, +0.035] no-detectable-contribution | -0.033 [-0.066, -0.001] component-hurts | +0.074 [+0.023, +0.128] component-helps | +0.007 [-0.016, +0.034] no-detectable-contribution | +0.009 [-0.025, +0.046] no-detectable-contribution |
| RB | +0.060 [+0.040, +0.083] component-helps | -0.052 [-0.079, -0.025] component-hurts | +0.038 [+0.022, +0.055] component-helps | +0.003 [-0.004, +0.010] no-detectable-contribution | +0.011 [+0.002, +0.020] component-helps |
| WR | +0.061 [+0.046, +0.076] component-helps | -0.041 [-0.060, -0.023] component-hurts | +0.042 [+0.031, +0.053] component-helps | +0.006 [+0.002, +0.011] component-helps | +0.004 [-0.002, +0.010] no-detectable-contribution |
| TE | +0.053 [+0.032, +0.075] component-helps | -0.041 [-0.062, -0.019] component-hurts | +0.049 [+0.035, +0.063] component-helps | +0.002 [-0.004, +0.008] no-detectable-contribution | +0.006 [-0.004, +0.015] no-detectable-contribution |

**M2, sleeper games**

| position | ageAdjusted | trajectory | currentLevel | reliability | opportunityQuality |
|---|---|---|---|---|---|
| QB | +0.019 [+0.003, +0.038] component-helps | -0.010 [-0.030, +0.010] no-detectable-contribution | +0.017 [-0.011, +0.046] no-detectable-contribution | +0.009 [-0.005, +0.025] no-detectable-contribution | +0.009 [-0.011, +0.030] no-detectable-contribution |
| RB | +0.038 [+0.025, +0.054] component-helps | -0.013 [-0.034, +0.008] no-detectable-contribution | +0.008 [-0.004, +0.019] no-detectable-contribution | +0.000 [-0.005, +0.006] no-detectable-contribution | +0.007 [-0.001, +0.015] no-detectable-contribution |
| WR | +0.036 [+0.026, +0.046] component-helps | +0.008 [-0.009, +0.025] no-detectable-contribution | +0.006 [-0.003, +0.015] no-detectable-contribution | +0.002 [-0.002, +0.006] no-detectable-contribution | -0.004 [-0.009, +0.001] no-detectable-contribution |
| TE | +0.035 [+0.017, +0.052] component-helps | +0.003 [-0.020, +0.026] no-detectable-contribution | +0.011 [-0.001, +0.024] no-detectable-contribution | +0.005 [+0.000, +0.010] component-helps | -0.002 [-0.009, +0.005] no-detectable-contribution |

**M2, snaps games**

| position | ageAdjusted | trajectory | currentLevel | reliability | opportunityQuality |
|---|---|---|---|---|---|
| QB | +0.019 [+0.002, +0.038] component-helps | -0.010 [-0.031, +0.010] no-detectable-contribution | +0.016 [-0.011, +0.045] no-detectable-contribution | +0.008 [-0.006, +0.025] no-detectable-contribution | +0.008 [-0.011, +0.029] no-detectable-contribution |
| RB | +0.039 [+0.025, +0.054] component-helps | -0.013 [-0.034, +0.008] no-detectable-contribution | +0.007 [-0.004, +0.019] no-detectable-contribution | +0.001 [-0.004, +0.006] no-detectable-contribution | +0.007 [-0.000, +0.015] no-detectable-contribution |
| WR | +0.036 [+0.026, +0.046] component-helps | +0.008 [-0.009, +0.025] no-detectable-contribution | +0.006 [-0.003, +0.015] no-detectable-contribution | +0.002 [-0.002, +0.006] no-detectable-contribution | -0.004 [-0.009, +0.001] no-detectable-contribution |
| TE | +0.036 [+0.018, +0.054] component-helps | +0.002 [-0.021, +0.025] no-detectable-contribution | +0.011 [-0.002, +0.024] no-detectable-contribution | +0.005 [-0.000, +0.010] no-detectable-contribution | -0.002 [-0.009, +0.005] no-detectable-contribution |

## 7. Ablations (Δρ = ρ(variant) − ρ(H))

**M1, sleeper games**

| position | ablation | Δρ | 95% CI | n | label | note |
|---|---|---|---|---|---|---|
| QB | A-C1 | +0.000 | n/a | 229 | variant-identical | |
| QB | A-ST-chg | +0.000 | n/a | 229 | variant-identical | |
| QB | A-ST-all | +0.000 | n/a | 229 | variant-identical | |
| QB | A-AV-d | +0.008 | [-0.004, +0.020] | 229 | no-difference | |
| QB | A-AV-c | -0.008 | [-0.022, +0.005] | 229 | no-difference | |
| QB | A-QB | +0.000 | n/a | 229 | variant-identical | |
| RB | A-C1 | +0.000 | n/a | 606 | variant-identical | |
| RB | A-ST-chg | +0.002 | [-0.001, +0.005] | 606 | no-difference | |
| RB | A-ST-all | +0.004 | [-0.000, +0.009] | 606 | no-difference | |
| RB | A-AV-d | -0.004 | [-0.009, +0.001] | 606 | no-difference | |
| RB | A-AV-c | +0.005 | [-0.001, +0.011] | 606 | no-difference | |
| RB | A-QB | +0.001 | [-0.001, +0.002] | 606 | no-difference | |
| WR | A-C1 | +0.000 | [-0.002, +0.003] | 960 | no-difference | |
| WR | A-ST-chg | +0.003 | [+0.001, +0.005] | 960 | ablation-better | |
| WR | A-ST-all | +0.004 | [+0.001, +0.008] | 960 | ablation-better | |
| WR | A-AV-d | -0.003 | [-0.007, +0.000] | 960 | no-difference | |
| WR | A-AV-c | +0.002 | [-0.002, +0.006] | 960 | no-difference | |
| WR | A-QB | +0.001 | [-0.001, +0.003] | 960 | no-difference | |
| TE | A-C1 | +0.001 | [-0.001, +0.004] | 612 | no-difference | |
| TE | A-ST-chg | +0.001 | [-0.002, +0.004] | 612 | no-difference | |
| TE | A-ST-all | +0.005 | [+0.000, +0.009] | 612 | ablation-better | |
| TE | A-AV-d | -0.007 | [-0.011, -0.002] | 612 | ablation-worse | |
| TE | A-AV-c | +0.007 | [-0.000, +0.014] | 612 | no-difference | |
| TE | A-QB | +0.001 | [-0.000, +0.003] | 612 | no-difference | |

**M1, snaps games**

| position | ablation | Δρ | 95% CI | n | label | note |
|---|---|---|---|---|---|---|
| QB | A-C1 | +0.000 | n/a | 229 | variant-identical | |
| QB | A-ST-chg | +0.000 | n/a | 229 | variant-identical | |
| QB | A-ST-all | +0.000 | n/a | 229 | variant-identical | |
| QB | A-AV-d | +0.010 | [-0.003, +0.023] | 229 | no-difference | |
| QB | A-AV-c | -0.007 | [-0.021, +0.005] | 229 | no-difference | |
| QB | A-QB | +0.000 | n/a | 229 | variant-identical | |
| RB | A-C1 | +0.000 | n/a | 607 | variant-identical | |
| RB | A-ST-chg | +0.002 | [-0.001, +0.005] | 607 | no-difference | |
| RB | A-ST-all | +0.004 | [-0.001, +0.009] | 607 | no-difference | |
| RB | A-AV-d | -0.004 | [-0.009, +0.001] | 607 | no-difference | |
| RB | A-AV-c | +0.005 | [-0.001, +0.011] | 607 | no-difference | |
| RB | A-QB | +0.001 | [-0.001, +0.002] | 607 | no-difference | |
| WR | A-C1 | +0.000 | [-0.002, +0.003] | 960 | no-difference | |
| WR | A-ST-chg | +0.003 | [+0.001, +0.006] | 960 | ablation-better | |
| WR | A-ST-all | +0.004 | [+0.001, +0.008] | 960 | ablation-better | |
| WR | A-AV-d | -0.003 | [-0.007, +0.000] | 960 | no-difference | |
| WR | A-AV-c | +0.001 | [-0.002, +0.005] | 960 | no-difference | |
| WR | A-QB | +0.001 | [-0.001, +0.003] | 960 | no-difference | |
| TE | A-C1 | +0.001 | [-0.001, +0.004] | 614 | no-difference | |
| TE | A-ST-chg | +0.001 | [-0.002, +0.003] | 614 | no-difference | |
| TE | A-ST-all | +0.006 | [+0.001, +0.010] | 614 | ablation-better | |
| TE | A-AV-d | -0.007 | [-0.011, -0.002] | 614 | ablation-worse | |
| TE | A-AV-c | +0.007 | [+0.000, +0.014] | 614 | ablation-better | |
| TE | A-QB | +0.001 | [-0.000, +0.003] | 614 | no-difference | |

**M2, sleeper games**

| position | ablation | Δρ | 95% CI | n | label | note |
|---|---|---|---|---|---|---|
| QB | A-C1 | +0.000 | n/a | 341 | variant-identical | |
| QB | A-ST-chg | +0.000 | n/a | 341 | variant-identical | |
| QB | A-ST-all | +0.000 | n/a | 341 | variant-identical | |
| QB | A-AV-d | +0.009 | [+0.002, +0.016] | 341 | ablation-better | |
| QB | A-AV-c | -0.013 | [-0.024, -0.004] | 341 | ablation-worse | |
| QB | A-QB | +0.000 | n/a | 341 | variant-identical | |
| RB | A-C1 | +0.000 | n/a | 1006 | variant-identical | |
| RB | A-ST-chg | +0.002 | [-0.000, +0.004] | 1006 | no-difference | |
| RB | A-ST-all | +0.001 | [-0.003, +0.005] | 1006 | no-difference | |
| RB | A-AV-d | +0.003 | [-0.001, +0.007] | 1006 | no-difference | |
| RB | A-AV-c | -0.001 | [-0.006, +0.002] | 1006 | no-difference | |
| RB | A-QB | +0.000 | [-0.000, +0.001] | 1006 | no-difference | |
| WR | A-C1 | +0.000 | [-0.001, +0.002] | 1553 | no-difference | |
| WR | A-ST-chg | +0.001 | [-0.000, +0.002] | 1553 | no-difference | |
| WR | A-ST-all | -0.003 | [-0.005, -0.000] | 1553 | ablation-worse | |
| WR | A-AV-d | +0.003 | [+0.001, +0.006] | 1553 | ablation-better | |
| WR | A-AV-c | -0.006 | [-0.010, -0.003] | 1553 | ablation-worse | |
| WR | A-QB | -0.000 | [-0.001, +0.001] | 1553 | no-difference | |
| TE | A-C1 | +0.000 | [-0.001, +0.002] | 946 | no-difference | |
| TE | A-ST-chg | +0.001 | [-0.000, +0.003] | 946 | no-difference | |
| TE | A-ST-all | -0.000 | [-0.004, +0.003] | 946 | no-difference | |
| TE | A-AV-d | -0.002 | [-0.006, +0.002] | 946 | no-difference | |
| TE | A-AV-c | -0.001 | [-0.006, +0.004] | 946 | no-difference | |
| TE | A-QB | +0.001 | [-0.000, +0.002] | 946 | no-difference | |

**M2, snaps games**

| position | ablation | Δρ | 95% CI | n | label | note |
|---|---|---|---|---|---|---|
| QB | A-C1 | +0.000 | n/a | 341 | variant-identical | |
| QB | A-ST-chg | +0.000 | n/a | 341 | variant-identical | |
| QB | A-ST-all | +0.000 | n/a | 341 | variant-identical | |
| QB | A-AV-d | +0.010 | [+0.003, +0.017] | 341 | ablation-better | |
| QB | A-AV-c | -0.013 | [-0.023, -0.004] | 341 | ablation-worse | |
| QB | A-QB | +0.000 | n/a | 341 | variant-identical | |
| RB | A-C1 | +0.000 | n/a | 1006 | variant-identical | |
| RB | A-ST-chg | +0.002 | [-0.000, +0.004] | 1006 | no-difference | |
| RB | A-ST-all | +0.001 | [-0.003, +0.004] | 1006 | no-difference | |
| RB | A-AV-d | +0.003 | [-0.001, +0.007] | 1006 | no-difference | |
| RB | A-AV-c | -0.001 | [-0.006, +0.002] | 1006 | no-difference | |
| RB | A-QB | +0.000 | [-0.000, +0.001] | 1006 | no-difference | |
| WR | A-C1 | -0.000 | [-0.002, +0.001] | 1552 | no-difference | |
| WR | A-ST-chg | +0.001 | [-0.000, +0.003] | 1552 | no-difference | |
| WR | A-ST-all | -0.002 | [-0.005, -0.000] | 1552 | ablation-worse | |
| WR | A-AV-d | +0.003 | [+0.001, +0.006] | 1552 | ablation-better | |
| WR | A-AV-c | -0.006 | [-0.010, -0.003] | 1552 | ablation-worse | |
| WR | A-QB | +0.000 | [-0.001, +0.001] | 1552 | no-difference | |
| TE | A-C1 | +0.000 | [-0.001, +0.002] | 946 | no-difference | |
| TE | A-ST-chg | +0.001 | [-0.001, +0.003] | 946 | no-difference | |
| TE | A-ST-all | -0.000 | [-0.004, +0.003] | 946 | no-difference | |
| TE | A-AV-d | -0.002 | [-0.006, +0.003] | 946 | no-difference | |
| TE | A-AV-c | -0.001 | [-0.006, +0.005] | 946 | no-difference | |
| TE | A-QB | +0.001 | [-0.000, +0.002] | 946 | no-difference | |

### 7.1 Age-curve comparisons (§8.11; first-named side is judged; exploratory)

| measure | games | position | comparison | Δρ | 95% CI | n | label | note |
|---|---|---|---|---|---|---|---|---|
| M1 | sleeper | QB | H~A-AGE-APP | +0.000 | [-0.015, +0.015] | 229 | no-difference | today's app curve error transported to S — contains post-S information; not the error the app had at S |
| M1 | sleeper | QB | A-AGE-DELTA~A-AGE-APP | +0.000 | [-0.015, +0.015] | 229 | no-difference | today's app curve error transported to S — contains post-S information; not the error the app had at S |
| M1 | sleeper | QB | A-AGE-DELTA~H | +0.000 | n/a | 229 | variant-identical |  |
| M1 | sleeper | RB | H~A-AGE-APP | +0.010 | [-0.001, +0.022] | 606 | no-difference | today's app curve error transported to S — contains post-S information; not the error the app had at S |
| M1 | sleeper | RB | A-AGE-DELTA~A-AGE-APP | -0.010 | [-0.025, +0.005] | 606 | no-difference | today's app curve error transported to S — contains post-S information; not the error the app had at S |
| M1 | sleeper | RB | A-AGE-DELTA~H | -0.020 | [-0.036, -0.005] | 606 | ablation-worse |  |
| M1 | sleeper | WR | H~A-AGE-APP | +0.006 | [-0.001, +0.014] | 960 | no-difference | today's app curve error transported to S — contains post-S information; not the error the app had at S |
| M1 | sleeper | WR | A-AGE-DELTA~A-AGE-APP | -0.021 | [-0.033, -0.010] | 960 | ablation-worse | today's app curve error transported to S — contains post-S information; not the error the app had at S |
| M1 | sleeper | WR | A-AGE-DELTA~H | -0.027 | [-0.040, -0.015] | 960 | ablation-worse |  |
| M1 | sleeper | TE | H~A-AGE-APP | -0.014 | [-0.029, -0.001] | 612 | ablation-worse | today's app curve error transported to S — contains post-S information; not the error the app had at S |
| M1 | sleeper | TE | A-AGE-DELTA~A-AGE-APP | -0.042 | [-0.063, -0.023] | 612 | ablation-worse | today's app curve error transported to S — contains post-S information; not the error the app had at S |
| M1 | sleeper | TE | A-AGE-DELTA~H | -0.028 | [-0.044, -0.011] | 612 | ablation-worse |  |
| M1 | snaps | QB | H~A-AGE-APP | -0.000 | [-0.016, +0.015] | 229 | no-difference | today's app curve error transported to S — contains post-S information; not the error the app had at S |
| M1 | snaps | QB | A-AGE-DELTA~A-AGE-APP | -0.000 | [-0.016, +0.015] | 229 | no-difference | today's app curve error transported to S — contains post-S information; not the error the app had at S |
| M1 | snaps | QB | A-AGE-DELTA~H | +0.000 | n/a | 229 | variant-identical |  |
| M1 | snaps | RB | H~A-AGE-APP | +0.010 | [-0.001, +0.022] | 607 | no-difference | today's app curve error transported to S — contains post-S information; not the error the app had at S |
| M1 | snaps | RB | A-AGE-DELTA~A-AGE-APP | -0.010 | [-0.025, +0.005] | 607 | no-difference | today's app curve error transported to S — contains post-S information; not the error the app had at S |
| M1 | snaps | RB | A-AGE-DELTA~H | -0.020 | [-0.036, -0.005] | 607 | ablation-worse |  |
| M1 | snaps | WR | H~A-AGE-APP | +0.006 | [-0.001, +0.014] | 960 | no-difference | today's app curve error transported to S — contains post-S information; not the error the app had at S |
| M1 | snaps | WR | A-AGE-DELTA~A-AGE-APP | -0.021 | [-0.033, -0.009] | 960 | ablation-worse | today's app curve error transported to S — contains post-S information; not the error the app had at S |
| M1 | snaps | WR | A-AGE-DELTA~H | -0.027 | [-0.040, -0.015] | 960 | ablation-worse |  |
| M1 | snaps | TE | H~A-AGE-APP | -0.015 | [-0.030, -0.002] | 614 | ablation-worse | today's app curve error transported to S — contains post-S information; not the error the app had at S |
| M1 | snaps | TE | A-AGE-DELTA~A-AGE-APP | -0.043 | [-0.063, -0.024] | 614 | ablation-worse | today's app curve error transported to S — contains post-S information; not the error the app had at S |
| M1 | snaps | TE | A-AGE-DELTA~H | -0.027 | [-0.044, -0.011] | 614 | ablation-worse |  |
| M2 | sleeper | QB | H~A-AGE-APP | +0.003 | [-0.007, +0.013] | 341 | no-difference | today's app curve error transported to S — contains post-S information; not the error the app had at S |
| M2 | sleeper | QB | A-AGE-DELTA~A-AGE-APP | +0.003 | [-0.007, +0.013] | 341 | no-difference | today's app curve error transported to S — contains post-S information; not the error the app had at S |
| M2 | sleeper | QB | A-AGE-DELTA~H | +0.000 | n/a | 341 | variant-identical |  |
| M2 | sleeper | RB | H~A-AGE-APP | +0.016 | [+0.008, +0.024] | 1006 | ablation-better | today's app curve error transported to S — contains post-S information; not the error the app had at S |
| M2 | sleeper | RB | A-AGE-DELTA~A-AGE-APP | -0.016 | [-0.026, -0.006] | 1006 | ablation-worse | today's app curve error transported to S — contains post-S information; not the error the app had at S |
| M2 | sleeper | RB | A-AGE-DELTA~H | -0.031 | [-0.042, -0.021] | 1006 | ablation-worse |  |
| M2 | sleeper | WR | H~A-AGE-APP | +0.022 | [+0.015, +0.030] | 1553 | ablation-better | today's app curve error transported to S — contains post-S information; not the error the app had at S |
| M2 | sleeper | WR | A-AGE-DELTA~A-AGE-APP | -0.026 | [-0.036, -0.017] | 1553 | ablation-worse | today's app curve error transported to S — contains post-S information; not the error the app had at S |
| M2 | sleeper | WR | A-AGE-DELTA~H | -0.049 | [-0.059, -0.039] | 1553 | ablation-worse |  |
| M2 | sleeper | TE | H~A-AGE-APP | +0.018 | [+0.004, +0.032] | 946 | ablation-better | today's app curve error transported to S — contains post-S information; not the error the app had at S |
| M2 | sleeper | TE | A-AGE-DELTA~A-AGE-APP | -0.015 | [-0.030, -0.001] | 946 | ablation-worse | today's app curve error transported to S — contains post-S information; not the error the app had at S |
| M2 | sleeper | TE | A-AGE-DELTA~H | -0.033 | [-0.049, -0.018] | 946 | ablation-worse |  |
| M2 | snaps | QB | H~A-AGE-APP | +0.002 | [-0.007, +0.012] | 341 | no-difference | today's app curve error transported to S — contains post-S information; not the error the app had at S |
| M2 | snaps | QB | A-AGE-DELTA~A-AGE-APP | +0.002 | [-0.007, +0.012] | 341 | no-difference | today's app curve error transported to S — contains post-S information; not the error the app had at S |
| M2 | snaps | QB | A-AGE-DELTA~H | +0.000 | n/a | 341 | variant-identical |  |
| M2 | snaps | RB | H~A-AGE-APP | +0.016 | [+0.008, +0.024] | 1006 | ablation-better | today's app curve error transported to S — contains post-S information; not the error the app had at S |
| M2 | snaps | RB | A-AGE-DELTA~A-AGE-APP | -0.015 | [-0.025, -0.005] | 1006 | ablation-worse | today's app curve error transported to S — contains post-S information; not the error the app had at S |
| M2 | snaps | RB | A-AGE-DELTA~H | -0.032 | [-0.042, -0.021] | 1006 | ablation-worse |  |
| M2 | snaps | WR | H~A-AGE-APP | +0.022 | [+0.015, +0.030] | 1552 | ablation-better | today's app curve error transported to S — contains post-S information; not the error the app had at S |
| M2 | snaps | WR | A-AGE-DELTA~A-AGE-APP | -0.026 | [-0.036, -0.017] | 1552 | ablation-worse | today's app curve error transported to S — contains post-S information; not the error the app had at S |
| M2 | snaps | WR | A-AGE-DELTA~H | -0.048 | [-0.059, -0.038] | 1552 | ablation-worse |  |
| M2 | snaps | TE | H~A-AGE-APP | +0.018 | [+0.004, +0.031] | 946 | ablation-better | today's app curve error transported to S — contains post-S information; not the error the app had at S |
| M2 | snaps | TE | A-AGE-DELTA~A-AGE-APP | -0.016 | [-0.031, -0.002] | 946 | ablation-worse | today's app curve error transported to S — contains post-S information; not the error the app had at S |
| M2 | snaps | TE | A-AGE-DELTA~H | -0.034 | [-0.050, -0.018] | 946 | ablation-worse |  |

### 7.2 Peak ages and late-career shares by cohort (Sleeper games)

| S | variant | QB peak / late | RB peak / late | WR peak / late | TE peak / late | H fallback (QB RB WR TE) | delta fallback / floored | note |
|---|---|---|---|---|---|---|---|---|
| 2015 | H | 32 / 9% | 25 / 19% | 28 / 8% | 26 / 18% | F - - - |  |  |
| 2015 | A-AGE-APP | 32 / 9% | 25 / 19% | 28 / 8% | 29 / 3% |  |  | today's app curve error transported to S — contains post-S information; not the error the app had at S |
| 2015 | A-AGE-DELTA | 32 / 9% | 25 / 19% | 25 / 23% | 26 / 18% |  | F/0 F/0 -/0 F/0 |  |
| 2016 | H | 32 / 14% | 25 / 15% | 28 / 9% | 28 / 7% | F - - - |  |  |
| 2016 | A-AGE-APP | 32 / 14% | 25 / 15% | 28 / 9% | 29 / 4% |  |  | today's app curve error transported to S — contains post-S information; not the error the app had at S |
| 2016 | A-AGE-DELTA | 32 / 14% | 25 / 15% | 25 / 23% | 26 / 18% |  | F/0 -/0 -/0 -/0 |  |
| 2017 | H | 32 / 12% | 21 / 68% | 28 / 5% | 28 / 10% | F - - - |  |  |
| 2017 | A-AGE-APP | 32 / 12% | 25 / 17% | 28 / 5% | 29 / 5% |  |  | today's app curve error transported to S — contains post-S information; not the error the app had at S |
| 2017 | A-AGE-DELTA | 32 / 12% | 25 / 17% | 25 / 18% | 24 / 37% |  | F/0 -/0 -/0 -/0 |  |
| 2018 | H | 32 / 14% | 21 / 61% | 28 / 4% | 29 / 8% | F - - - |  |  |
| 2018 | A-AGE-APP | 32 / 14% | 25 / 18% | 28 / 4% | 29 / 8% |  |  | today's app curve error transported to S — contains post-S information; not the error the app had at S |
| 2018 | A-AGE-DELTA | 32 / 14% | 25 / 18% | 25 / 20% | 26 / 18% |  | F/0 -/0 -/0 -/0 |  |
| 2019 | H | 32 / 14% | 21 / 57% | 28 / 5% | 29 / 6% | F - - - |  |  |
| 2019 | A-AGE-APP | 32 / 14% | 25 / 13% | 26 / 14% | 29 / 6% |  |  | today's app curve error transported to S — contains post-S information; not the error the app had at S |
| 2019 | A-AGE-DELTA | 32 / 14% | 25 / 13% | 25 / 20% | 26 / 18% |  | F/0 -/0 -/0 -/1 |  |
| 2020 | H | 32 / 16% | 21 / 59% | 28 / 4% | 29 / 6% | F - - - |  |  |
| 2020 | A-AGE-APP | 32 / 16% | 25 / 13% | 28 / 4% | 29 / 6% |  |  | today's app curve error transported to S — contains post-S information; not the error the app had at S |
| 2020 | A-AGE-DELTA | 32 / 16% | 23 / 27% | 25 / 14% | 26 / 18% |  | F/0 -/0 -/0 -/1 |  |
| 2021 | H | 23 / 56% | 21 / 63% | 28 / 6% | 29 / 6% | - - - - |  |  |
| 2021 | A-AGE-APP | 32 / 19% | 24 / 21% | 28 / 6% | 29 / 6% |  |  | today's app curve error transported to S — contains post-S information; not the error the app had at S |
| 2021 | A-AGE-DELTA | 23 / 56% | 23 / 29% | 25 / 14% | 26 / 17% |  | F/0 -/0 -/0 -/1 |  |
| 2022 | H | 24 / 55% | 21 / 62% | 28 / 6% | 29 / 6% | - - - - |  |  |
| 2022 | A-AGE-APP | 32 / 11% | 25 / 15% | 28 / 6% | 29 / 6% |  |  | today's app curve error transported to S — contains post-S information; not the error the app had at S |
| 2022 | A-AGE-DELTA | 24 / 55% | 23 / 38% | 25 / 19% | 24 / 37% |  | F/0 -/0 -/0 -/1 |  |
| 2023 | H | 24 / 47% | 21 / 63% | 28 / 4% | 29 / 4% | - - - - |  |  |
| 2023 | A-AGE-APP | 32 / 7% | 25 / 16% | 28 / 4% | 29 / 4% |  |  | today's app curve error transported to S — contains post-S information; not the error the app had at S |
| 2023 | A-AGE-DELTA | 24 / 47% | 23 / 37% | 25 / 21% | 24 / 36% |  | F/0 -/0 -/0 -/2 |  |
| 2024 | H | 24 / 45% | 21 / 71% | 28 / 3% | 29 / 4% | - - - - |  |  |
| 2024 | A-AGE-APP | 32 / 6% | 25 / 16% | 26 / 16% | 29 / 4% |  |  | today's app curve error transported to S — contains post-S information; not the error the app had at S |
| 2024 | A-AGE-DELTA | 24 / 45% | 24 / 28% | 25 / 23% | 25 / 26% |  | F/0 -/0 -/0 -/1 |  |

## 8. Practice-squad diagnostic (D-79; S = 2018–2022; diagnostic only — no input added)

Δ = mean bias of rows with ≥ 4 practice-squad weeks (S−1 and S) minus rows with 0. Bias = percentile(score) − percentile(realised), so a negative Δ means the score rated the practice-squad group lower than they turned out. **The label words are the pre-registered ones (§8.9): `ps-underperforms-score` is attached to CI upper < 0 and `ps-outperforms-score` to CI lower > 0 — read the sign of Δ, not the word.**

| measure | games | position | Δ bias | 95% CI | n (≥4 weeks) | label |
|---|---|---|---|---|---|---|
| M1 | sleeper | QB | +3.597 | [-8.399, +16.166] | 1 | insufficient |
| M1 | sleeper | RB | -3.155 | [-12.303, +4.925] | 29 | insufficient |
| M1 | sleeper | WR | -6.176 | [-12.039, -0.591] | 69 | ps-underperforms-score |
| M1 | sleeper | TE | -5.152 | [-13.558, +3.467] | 36 | no-detectable-signal |
| M1 | sleeper | ALL | -5.057 | [-9.143, -1.066] | 135 | ps-underperforms-score |
| M1 | snaps | QB | +3.597 | [-8.399, +16.166] | 1 | insufficient |
| M1 | snaps | RB | -3.122 | [-12.340, +5.070] | 29 | insufficient |
| M1 | snaps | WR | -6.133 | [-12.054, -0.565] | 69 | ps-underperforms-score |
| M1 | snaps | TE | -5.106 | [-13.607, +3.545] | 36 | no-detectable-signal |
| M1 | snaps | ALL | -5.015 | [-9.066, -0.989] | 135 | ps-underperforms-score |
| M2 | sleeper | QB | +2.979 | [-9.395, +16.865] | 4 | insufficient |
| M2 | sleeper | RB | +0.648 | [-4.861, +6.200] | 97 | no-detectable-signal |
| M2 | sleeper | WR | -4.832 | [-9.155, -0.489] | 173 | ps-underperforms-score |
| M2 | sleeper | TE | -3.200 | [-9.343, +2.991] | 81 | no-detectable-signal |
| M2 | sleeper | ALL | -2.808 | [-5.861, +0.147] | 355 | no-detectable-signal |
| M2 | snaps | QB | +2.979 | [-9.395, +16.865] | 4 | insufficient |
| M2 | snaps | RB | +0.778 | [-4.721, +6.283] | 97 | no-detectable-signal |
| M2 | snaps | WR | -4.779 | [-9.169, -0.368] | 172 | ps-underperforms-score |
| M2 | snaps | TE | -3.285 | [-9.467, +2.895] | 81 | no-detectable-signal |
| M2 | snaps | ALL | -2.763 | [-5.815, +0.209] | 354 | no-detectable-signal |

## 9. Path B-only and C-only ρ (descriptive, not headline)

| measure | games | position | path | ρ | 95% CI | n | cohorts | label |
|---|---|---|---|---|---|---|---|---|
| M1 | sleeper | QB | B | n/a | [-0.438, +0.782] | 55 | 0 | insufficient |
| M1 | sleeper | QB | C | 0.586 | [+0.378, +0.797] | 174 | 8 | predictive |
| M1 | sleeper | RB | B | 0.603 | [+0.469, +0.691] | 224 | 8 | predictive |
| M1 | sleeper | RB | C | 0.703 | [+0.597, +0.771] | 382 | 8 | predictive |
| M1 | sleeper | WR | B | 0.602 | [+0.495, +0.677] | 322 | 8 | predictive |
| M1 | sleeper | WR | C | 0.703 | [+0.621, +0.760] | 638 | 8 | predictive |
| M1 | sleeper | TE | B | 0.581 | [+0.447, +0.678] | 194 | 7 | predictive |
| M1 | sleeper | TE | C | 0.744 | [+0.670, +0.789] | 418 | 8 | predictive |
| M1 | snaps | QB | B | n/a | [-0.438, +0.782] | 55 | 0 | insufficient |
| M1 | snaps | QB | C | 0.586 | [+0.378, +0.794] | 174 | 8 | predictive |
| M1 | snaps | RB | B | 0.604 | [+0.470, +0.692] | 224 | 8 | predictive |
| M1 | snaps | RB | C | 0.703 | [+0.597, +0.771] | 383 | 8 | predictive |
| M1 | snaps | WR | B | 0.602 | [+0.496, +0.677] | 322 | 8 | predictive |
| M1 | snaps | WR | C | 0.702 | [+0.620, +0.759] | 638 | 8 | predictive |
| M1 | snaps | TE | B | 0.581 | [+0.451, +0.679] | 196 | 7 | predictive |
| M1 | snaps | TE | C | 0.742 | [+0.670, +0.787] | 418 | 8 | predictive |
| M2 | sleeper | QB | B | 0.754 | [+0.445, +0.902] | 101 | 1 | predictive |
| M2 | sleeper | QB | C | 0.593 | [+0.415, +0.711] | 240 | 8 | predictive |
| M2 | sleeper | RB | B | 0.572 | [+0.465, +0.649] | 361 | 8 | predictive |
| M2 | sleeper | RB | C | 0.560 | [+0.469, +0.633] | 645 | 8 | predictive |
| M2 | sleeper | WR | B | 0.568 | [+0.488, +0.634] | 565 | 8 | predictive |
| M2 | sleeper | WR | C | 0.675 | [+0.616, +0.724] | 988 | 8 | predictive |
| M2 | sleeper | TE | B | 0.462 | [+0.338, +0.559] | 309 | 8 | predictive |
| M2 | sleeper | TE | C | 0.666 | [+0.587, +0.727] | 637 | 8 | predictive |
| M2 | snaps | QB | B | 0.754 | [+0.445, +0.902] | 101 | 1 | predictive |
| M2 | snaps | QB | C | 0.592 | [+0.414, +0.711] | 240 | 8 | predictive |
| M2 | snaps | RB | B | 0.572 | [+0.465, +0.648] | 361 | 8 | predictive |
| M2 | snaps | RB | C | 0.560 | [+0.469, +0.633] | 645 | 8 | predictive |
| M2 | snaps | WR | B | 0.568 | [+0.488, +0.633] | 564 | 8 | predictive |
| M2 | snaps | WR | C | 0.675 | [+0.615, +0.724] | 988 | 8 | predictive |
| M2 | snaps | TE | B | 0.477 | [+0.356, +0.573] | 309 | 8 | predictive |
| M2 | snaps | TE | C | 0.664 | [+0.584, +0.726] | 637 | 8 | predictive |

## 10. Short horizons — not pooled with the headline

### S = 2023 (h = 2) — not pooled with the headline

| position | measure | games | ρ(H) | ρ(B1) | ρ(B2) | H−B1 label | H−B2 label |
|---|---|---|---|---|---|---|---|
| QB | M1 | sleeper | 0.581 [+0.210, +0.830] predictive | 0.584 | 0.522 | -0.003 [-0.190, +0.165] no-difference | +0.058 [-0.133, +0.252] no-difference |
| QB | M1 | snaps | 0.605 [+0.256, +0.841] predictive | 0.589 | 0.553 | +0.016 [-0.146, +0.175] no-difference | +0.052 [-0.171, +0.264] no-difference |
| QB | M2 | sleeper | 0.684 [+0.476, +0.820] predictive | 0.658 | 0.604 | +0.027 [-0.064, +0.122] no-difference | +0.081 [-0.039, +0.223] no-difference |
| QB | M2 | snaps | 0.694 [+0.486, +0.827] predictive | 0.661 | 0.619 | +0.033 [-0.047, +0.126] no-difference | +0.075 [-0.045, +0.218] no-difference |
| RB | M1 | sleeper | 0.742 [+0.614, +0.835] predictive | 0.803 | 0.778 | -0.061 [-0.132, -0.001] loses-to-B1 | -0.036 [-0.114, +0.045] no-difference |
| RB | M1 | snaps | 0.740 [+0.609, +0.834] predictive | 0.803 | 0.779 | -0.063 [-0.134, -0.002] loses-to-B1 | -0.039 [-0.117, +0.041] no-difference |
| RB | M2 | sleeper | 0.666 [+0.555, +0.749] predictive | 0.677 | 0.665 | -0.011 [-0.057, +0.036] no-difference | +0.001 [-0.063, +0.067] no-difference |
| RB | M2 | snaps | 0.670 [+0.560, +0.751] predictive | 0.677 | 0.666 | -0.007 [-0.053, +0.041] no-difference | +0.004 [-0.059, +0.069] no-difference |
| WR | M1 | sleeper | 0.685 [+0.580, +0.767] predictive | 0.744 | 0.715 | -0.059 [-0.105, -0.014] loses-to-B1 | -0.030 [-0.086, +0.030] no-difference |
| WR | M1 | snaps | 0.684 [+0.578, +0.766] predictive | 0.744 | 0.716 | -0.061 [-0.108, -0.015] loses-to-B1 | -0.032 [-0.089, +0.027] no-difference |
| WR | M2 | sleeper | 0.634 [+0.539, +0.712] predictive | 0.656 | 0.642 | -0.022 [-0.064, +0.017] no-difference | -0.009 [-0.068, +0.048] no-difference |
| WR | M2 | snaps | 0.633 [+0.538, +0.711] predictive | 0.654 | 0.640 | -0.021 [-0.063, +0.018] no-difference | -0.007 [-0.065, +0.050] no-difference |
| TE | M1 | sleeper | 0.730 [+0.585, +0.832] predictive | 0.779 | 0.776 | -0.049 [-0.132, +0.019] no-difference | -0.046 [-0.142, +0.043] no-difference |
| TE | M1 | snaps | 0.729 [+0.584, +0.831] predictive | 0.779 | 0.774 | -0.050 [-0.133, +0.018] no-difference | -0.045 [-0.142, +0.044] no-difference |
| TE | M2 | sleeper | 0.669 [+0.545, +0.767] predictive | 0.671 | 0.679 | -0.002 [-0.056, +0.054] no-difference | -0.010 [-0.075, +0.059] no-difference |
| TE | M2 | snaps | 0.671 [+0.548, +0.769] predictive | 0.671 | 0.679 | -0.001 [-0.055, +0.056] no-difference | -0.009 [-0.074, +0.062] no-difference |

### S = 2024 (h = 1) — not pooled with the headline

| position | measure | games | ρ(H) | ρ(B1) | ρ(B2) | H−B1 label | H−B2 label |
|---|---|---|---|---|---|---|---|
| QB | M1 | sleeper | 0.421 [+0.086, +0.649] predictive | 0.405 | 0.507 | +0.016 [-0.147, +0.192] no-difference | -0.085 [-0.280, +0.095] no-difference |
| QB | M1 | snaps | 0.421 [+0.086, +0.649] predictive | 0.405 | 0.508 | +0.016 [-0.147, +0.192] no-difference | -0.086 [-0.281, +0.094] no-difference |
| QB | M2 | sleeper | 0.647 [+0.441, +0.783] predictive | 0.588 | 0.633 | +0.059 [-0.029, +0.167] no-difference | +0.014 [-0.084, +0.121] no-difference |
| QB | M2 | snaps | 0.647 [+0.441, +0.783] predictive | 0.588 | 0.633 | +0.059 [-0.029, +0.167] no-difference | +0.014 [-0.084, +0.121] no-difference |
| RB | M1 | sleeper | 0.724 [+0.556, +0.831] predictive | 0.824 | 0.818 | -0.101 [-0.205, -0.023] loses-to-B1 | -0.094 [-0.197, -0.005] loses-to-B2 |
| RB | M1 | snaps | 0.725 [+0.558, +0.832] predictive | 0.824 | 0.818 | -0.099 [-0.204, -0.022] loses-to-B1 | -0.093 [-0.196, -0.003] loses-to-B2 |
| RB | M2 | sleeper | 0.677 [+0.554, +0.773] predictive | 0.689 | 0.656 | -0.013 [-0.057, +0.029] no-difference | +0.021 [-0.037, +0.082] no-difference |
| RB | M2 | snaps | 0.676 [+0.553, +0.772] predictive | 0.689 | 0.656 | -0.014 [-0.057, +0.028] no-difference | +0.020 [-0.038, +0.081] no-difference |
| WR | M1 | sleeper | 0.695 [+0.580, +0.780] predictive | 0.775 | 0.759 | -0.080 [-0.132, -0.033] loses-to-B1 | -0.064 [-0.138, +0.004] no-difference |
| WR | M1 | snaps | 0.696 [+0.582, +0.780] predictive | 0.775 | 0.759 | -0.079 [-0.130, -0.033] loses-to-B1 | -0.063 [-0.137, +0.004] no-difference |
| WR | M2 | sleeper | 0.651 [+0.550, +0.732] predictive | 0.660 | 0.615 | -0.009 [-0.046, +0.028] no-difference | +0.035 [-0.014, +0.084] no-difference |
| WR | M2 | snaps | 0.651 [+0.549, +0.732] predictive | 0.660 | 0.615 | -0.009 [-0.047, +0.028] no-difference | +0.035 [-0.014, +0.084] no-difference |
| TE | M1 | sleeper | 0.662 [+0.533, +0.759] predictive | 0.744 | 0.756 | -0.082 [-0.167, -0.003] loses-to-B1 | -0.094 [-0.181, -0.008] loses-to-B2 |
| TE | M1 | snaps | 0.663 [+0.534, +0.759] predictive | 0.744 | 0.756 | -0.081 [-0.167, -0.003] loses-to-B1 | -0.093 [-0.181, -0.008] loses-to-B2 |
| TE | M2 | sleeper | 0.671 [+0.556, +0.758] predictive | 0.706 | 0.692 | -0.035 [-0.098, +0.023] no-difference | -0.022 [-0.093, +0.051] no-difference |
| TE | M2 | snaps | 0.671 [+0.557, +0.758] predictive | 0.706 | 0.692 | -0.035 [-0.098, +0.024] no-difference | -0.022 [-0.093, +0.051] no-difference |

## 11. Per-cohort ρ (H) — left-truncation in early cohorts is visible here

**M1, sleeper games**

| position | 2015 | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 |
|---|---|---|---|---|---|---|---|---|---|---|
| QB | 0.636 (n=29) | 0.659 (n=31) | 0.628 (n=28) | 0.552 (n=28) | 0.496 (n=30) | 0.791 (n=26) | 0.563 (n=30) | 0.649 (n=27) | 0.581 (n=28) | 0.421 (n=25) |
| RB | 0.584 (n=77) | 0.730 (n=71) | 0.607 (n=66) | 0.631 (n=69) | 0.652 (n=84) | 0.639 (n=85) | 0.680 (n=81) | 0.690 (n=73) | 0.742 (n=74) | 0.724 (n=62) |
| WR | 0.613 (n=108) | 0.730 (n=112) | 0.676 (n=116) | 0.730 (n=113) | 0.668 (n=120) | 0.663 (n=137) | 0.717 (n=126) | 0.703 (n=128) | 0.685 (n=119) | 0.695 (n=114) |
| TE | 0.735 (n=73) | 0.671 (n=82) | 0.688 (n=72) | 0.623 (n=74) | 0.636 (n=80) | 0.756 (n=79) | 0.686 (n=74) | 0.778 (n=78) | 0.730 (n=79) | 0.662 (n=86) |

**M1, snaps games**

| position | 2015 | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 |
|---|---|---|---|---|---|---|---|---|---|---|
| QB | 0.636 (n=29) | 0.659 (n=31) | 0.628 (n=28) | 0.552 (n=28) | 0.496 (n=30) | 0.791 (n=26) | 0.560 (n=30) | 0.651 (n=27) | 0.605 (n=28) | 0.421 (n=25) |
| RB | 0.583 (n=77) | 0.730 (n=71) | 0.607 (n=66) | 0.631 (n=69) | 0.652 (n=84) | 0.639 (n=85) | 0.680 (n=81) | 0.693 (n=74) | 0.740 (n=74) | 0.725 (n=62) |
| WR | 0.613 (n=108) | 0.730 (n=112) | 0.676 (n=116) | 0.730 (n=113) | 0.669 (n=120) | 0.662 (n=137) | 0.716 (n=126) | 0.700 (n=128) | 0.684 (n=119) | 0.696 (n=114) |
| TE | 0.735 (n=73) | 0.671 (n=82) | 0.688 (n=72) | 0.618 (n=74) | 0.637 (n=81) | 0.758 (n=80) | 0.678 (n=74) | 0.776 (n=78) | 0.729 (n=79) | 0.663 (n=86) |

**M2, sleeper games**

| position | 2015 | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 |
|---|---|---|---|---|---|---|---|---|---|---|
| QB | 0.832 (n=47) | 0.711 (n=43) | 0.671 (n=41) | 0.667 (n=42) | 0.520 (n=43) | 0.624 (n=44) | 0.552 (n=43) | 0.629 (n=38) | 0.684 (n=45) | 0.647 (n=49) |
| RB | 0.475 (n=121) | 0.491 (n=123) | 0.499 (n=129) | 0.572 (n=122) | 0.521 (n=120) | 0.577 (n=123) | 0.579 (n=136) | 0.567 (n=132) | 0.666 (n=126) | 0.677 (n=116) |
| WR | 0.613 (n=185) | 0.639 (n=188) | 0.583 (n=187) | 0.677 (n=195) | 0.576 (n=197) | 0.587 (n=195) | 0.685 (n=200) | 0.708 (n=206) | 0.634 (n=198) | 0.651 (n=204) |
| TE | 0.582 (n=107) | 0.544 (n=121) | 0.507 (n=115) | 0.572 (n=124) | 0.551 (n=120) | 0.674 (n=114) | 0.671 (n=122) | 0.717 (n=123) | 0.669 (n=121) | 0.671 (n=124) |

**M2, snaps games**

| position | 2015 | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 |
|---|---|---|---|---|---|---|---|---|---|---|
| QB | 0.832 (n=47) | 0.711 (n=43) | 0.671 (n=41) | 0.667 (n=42) | 0.520 (n=43) | 0.624 (n=44) | 0.548 (n=43) | 0.630 (n=38) | 0.694 (n=45) | 0.647 (n=49) |
| RB | 0.473 (n=121) | 0.491 (n=123) | 0.499 (n=129) | 0.572 (n=122) | 0.521 (n=120) | 0.577 (n=123) | 0.578 (n=136) | 0.565 (n=132) | 0.670 (n=126) | 0.676 (n=116) |
| WR | 0.613 (n=185) | 0.639 (n=188) | 0.583 (n=187) | 0.677 (n=195) | 0.576 (n=197) | 0.586 (n=195) | 0.683 (n=200) | 0.707 (n=205) | 0.633 (n=197) | 0.651 (n=204) |
| TE | 0.582 (n=107) | 0.544 (n=121) | 0.507 (n=115) | 0.569 (n=124) | 0.563 (n=120) | 0.691 (n=114) | 0.662 (n=122) | 0.716 (n=123) | 0.671 (n=121) | 0.671 (n=124) |

## 12. Exclusions and deliberate differences

**Exclusions** (rows removed from the scored population, per cohort × position × reason; `no-birthdate` rows are kept and only counted):

| S | position | reasons |
|---|---|---|
| 2015 | RB | stale 21, unproven 17, prospect 35 |
| 2015 | QB | unproven 48, stale 11, prospect 9 |
| 2015 | WR | stale 35, unproven 28, prospect 40 |
| 2015 | TE | stale 24, unproven 17, prospect 25, data-gap 1, no-birthdate 1 |
| 2015 | NONE | no-position 1429 |
| 2016 | RB | stale 48, unproven 27, prospect 37 |
| 2016 | QB | unproven 53, stale 19, prospect 16 |
| 2016 | WR | stale 64, unproven 47, prospect 52 |
| 2016 | TE | stale 34, unproven 27, prospect 20, data-gap 1, no-birthdate 1 |
| 2016 | NONE | no-position 1456 |
| 2017 | WR | stale 110, unproven 64, prospect 51, data-gap 1 |
| 2017 | RB | stale 69, unproven 40, prospect 37 |
| 2017 | QB | stale 28, unproven 63, prospect 11 |
| 2017 | TE | stale 58, unproven 35, data-gap 1, prospect 25, no-birthdate 1 |
| 2017 | NONE | no-position 1462 |
| 2018 | WR | stale 143, unproven 83, prospect 56, data-gap 2 |
| 2018 | RB | stale 102, unproven 52, prospect 36 |
| 2018 | TE | stale 76, unproven 41, data-gap 2, prospect 24, no-birthdate 1 |
| 2018 | QB | stale 33, unproven 70, prospect 13, data-gap 1 |
| 2018 | NONE | no-position 1453 |
| 2019 | WR | stale 186, unproven 111, data-gap 2, prospect 50 |
| 2019 | RB | stale 135, unproven 60, prospect 31 |
| 2019 | TE | stale 100, unproven 49, data-gap 2, prospect 23, no-birthdate 1 |
| 2019 | QB | stale 40, unproven 77, data-gap 1, prospect 16 |
| 2019 | NONE | no-position 1463 |
| 2020 | WR | stale 230, unproven 128, data-gap 3, prospect 48 |
| 2020 | RB | stale 158, unproven 69, prospect 37 |
| 2020 | TE | stale 125, unproven 62, data-gap 2, prospect 25 |
| 2020 | QB | stale 47, unproven 92, data-gap 1, prospect 14 |
| 2020 | NONE | no-position 1589 |
| 2021 | WR | stale 269, unproven 151, data-gap 14, prospect 61 |
| 2021 | RB | stale 174, unproven 86, prospect 34, data-gap 2 |
| 2021 | QB | stale 54, unproven 104, data-gap 4, prospect 12 |
| 2021 | TE | stale 138, unproven 78, data-gap 12, prospect 30 |
| 2021 | NONE | no-position 1674 |
| 2022 | WR | stale 300, unproven 176, data-gap 25, prospect 65 |
| 2022 | RB | stale 200, unproven 98, data-gap 3, prospect 43 |
| 2022 | QB | stale 65, unproven 110, data-gap 7, prospect 14 |
| 2022 | TE | stale 160, unproven 85, data-gap 22, prospect 37 |
| 2022 | NONE | no-position 1594 |
| 2023 | WR | stale 346, unproven 205, data-gap 37, prospect 65 |
| 2023 | RB | stale 231, unproven 117, data-gap 4, prospect 36 |
| 2023 | QB | stale 67, unproven 116, data-gap 7, prospect 19 |
| 2023 | TE | stale 187, unproven 96, data-gap 30, prospect 30 |
| 2023 | NONE | no-position 1556 |
| 2024 | WR | stale 382, unproven 230, data-gap 54, prospect 56 |
| 2024 | RB | stale 263, unproven 131, data-gap 6, prospect 39 |
| 2024 | TE | stale 209, unproven 100, data-gap 37, prospect 26 |
| 2024 | QB | stale 71, unproven 129, data-gap 10, prospect 17 |
| 2024 | NONE | no-position 1600 |

**Rows leaving Path B/C under a variant or games mode** (`meta.leftBC`, total over cohorts): H/snaps 2, LOO-ageAdjusted/snaps 2, LOO-trajectory/snaps 2, LOO-currentLevel/snaps 2, LOO-reliability/snaps 2, LOO-opportunityQuality/snaps 2, A-C1/snaps 2, A-AGE-APP/snaps 2, A-AGE-DELTA/snaps 2, A-ST-chg/snaps 2, A-ST-all/snaps 2, A-AV-d/snaps 2, A-AV-c/snaps 2, A-QB/snaps 2. — today's app curve error transported to S — contains post-S information; not the error the app had at S

**Measured Sleeper-vs-birthdate age gap per S** (Sleeper − true, over the curve-input rows):

| S | n | mean (y) | off by > 1 y |
|---|---|---|---|
| 2015 | 1317 | -4.96 | 1243 |
| 2016 | 1679 | -4.71 | 1556 |
| 2017 | 2051 | -4.45 | 1847 |
| 2018 | 2410 | -4.19 | 2086 |
| 2019 | 2776 | -3.90 | 2286 |
| 2020 | 3160 | -3.62 | 2455 |
| 2021 | 3552 | -3.35 | 2589 |
| 2022 | 3943 | -3.09 | 2664 |
| 2023 | 4336 | -2.83 | 2693 |
| 2024 | 4721 | -2.61 | 2698 |

**Deliberate differences from the app:**

- left-truncated history (careerStats begins 2012; early cohorts see only 2012…S)
- positions are the 2026-05-18 positions applied to every S
- ages are true ages on 2016-06-01 from birthdates (Sleeper's age is stale for players without a team); measured over all cohorts' curve-input rows: n=29945, mean Sleeper − true -3.49 y, 22117 off by > 1 y
- years_exp is derived from draftYear / first season, not Sleeper years_exp
- per-season-team attribution instead of the app's current-team
- depth chart is the end-of-regular-season chart, not the offseason chart
- dynastyDraftPick null, no KTC, no live level (offseason state)
- gamesPlayed under the snaps mode is the nflverse season-level snaps count (D-77 definition (c)) under the D-87 name guard; outcomes use the same definition
- H's age curve ignores age buckets with fewer than 30 rows when it derives the peak age (a deliberate difference from the app, which has no guard)
- A-AGE-APP: today's app curve error transported to S — contains post-S information; not the error the app had at S

**Not in this test:** prospects (first- and second-year players); everything KTC-based (no KTC history before 2026-05); the league rookie-draft pick; the in-season live level; and, in the headline, the QB-quality modifier (tested separately as A-QB).

## 13. Never output

This report prints no weight, no constant, no multiplier, no fitted parameter and no recommendation to change or wire anything. A label is evidence for S4, not a decision.
