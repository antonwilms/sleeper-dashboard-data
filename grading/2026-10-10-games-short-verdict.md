# Projected-games calibration — short-season-only candidates (L6c) — 2026-10-10

## 1. What was compared

Panel: L6b's (`buildCauseRows`, unchanged), data `feae053`: 4362 player-seasons, predictor seasons S = 2015–2024, outcome S+1 `gamesPlayed`. Folds: forward-chaining, ≥ 3 training seasons — eval S = 2018, 2019, 2020, 2021, 2022, 2023, 2024. **D1:** each cell's k minimises training SSE. **Qualifying S-seasons keep the app prediction (`r.pred`); k is fitted and applied only to non-qualifying ones (floor 0).**

- **SOf0:** k by position × S-state (`short` / `none`), floor 0, fitted on non-qualifying training rows.
- **SOK1f0:** the same with L6b's app-native K1 cause split (`short-inj` / `short-oth` / `none`).
- **References** (refitted on all rows in the same folds; tabled, never walked): C3f0 (L6's pick) and K1f0.

Cohorts: `relevant` 1240 out-of-sample rows; `star` (rel3 ∧ S-state ≠ qual) 239; R\* 1469; all veterans 3130; non-qualifying 723. `relevant` holds only 10 non-qualifying out-of-sample rows, so G1 mainly confirms that relevant players are left alone; the star cohort carries the evidence.

δ (games of relevant MAE): 0.1 / 0.25 / 0.5; default 0.25. All three are computed.

## 2. Parity and reconciliation

- DM-1 (asserted ≥ 99%): **431/431 = 100.0%**.
- `avgGames` assertion: held for all 4362 panel rows.
- Reconciliation: mean 0, 0 rows ≠ 0; `accountingSkipped` 0.
- Panel counts: 4362 included (194 at outcome 0), 5980 excluded, 670 not yet veterans, 3891 with no qualifying season.
- Panel rows by S-state: none 166, qual 3385, short 811; non-qualifying by K1: none 166, short-inj 395, short-oth 416.
- Relevant non-qualifying rows: 22 (10 out-of-sample); star rows: 344 (239 out-of-sample).
- D5 evidence: 21 qualifying rows have `avgGames < 8`; for 11 of them the app prediction differs from a floor-0 prediction (`pred !== round(clamp(avgGames, 0, 17))`).
- Qualifying-row invariant (`p.SOf0 === p.SOK1f0 === p.C0`): held for all 2407 out-of-sample qualifying rows.

## 3. Held-out results

ΔMSE / ΔMAE are candidate − C0 with player-clustered paired-bootstrap 95% CIs (n/a under 30 players).

### 3.1 Relevant

**relevant**

| cand | n | bias | MAE | RMSE | ρ | ρ within pos | ΔMSE [95% CI] | ΔMAE [95% CI] |
|---|---|---|---|---|---|---|---|---|
| C0 | 1240 | +1.62 | 3.21 | 4.71 | 0.23 | 0.23 | — | — |
| C3f0 | 1240 | -1.00 | 3.74 | 4.51 | 0.23 | 0.24 | -1.87 [-3.21, -0.64] | 0.53 [0.40, 0.66] |
| K1f0 | 1240 | -0.98 | 3.73 | 4.50 | 0.23 | 0.24 | -1.90 [-3.23, -0.67] | 0.53 [0.39, 0.66] |
| SOf0 | 1240 | +1.56 | 3.21 | 4.70 | 0.24 | 0.23 | -0.11 [-0.53, 0.22] | 0.00 [-0.02, 0.03] |
| SOK1f0 | 1240 | +1.57 | 3.21 | 4.70 | 0.24 | 0.23 | -0.11 [-0.53, 0.22] | 0.00 [-0.02, 0.03] |

### 3.2 Star (rel3 ∧ S-state ≠ qual)

**star**

| cand | n | bias | MAE | RMSE | ρ | ρ within pos | ΔMSE [95% CI] | ΔMAE [95% CI] |
|---|---|---|---|---|---|---|---|---|
| C0 | 239 | +5.93 | 7.00 | 8.59 | 0.07 | 0.04 | — | — |
| C3f0 | 239 | +0.47 | 5.37 | 6.24 | 0.04 | -0.02 | -34.86 [-44.78, -25.02] | -1.62 [-2.29, -0.95] |
| K1f0 | 239 | +1.22 | 5.38 | 6.22 | 0.14 | 0.03 | -35.13 [-43.83, -26.48] | -1.62 [-2.20, -1.02] |
| SOf0 | 239 | -0.10 | 5.38 | 6.18 | 0.05 | -0.01 | -35.66 [-46.32, -25.22] | -1.61 [-2.33, -0.86] |
| SOK1f0 | 239 | -0.16 | 5.31 | 6.09 | 0.09 | 0.02 | -36.66 [-47.41, -26.01] | -1.69 [-2.41, -0.94] |

### 3.3 R* (relevant ∪ star)

**R***

| cand | n | bias | MAE | RMSE | ρ | ρ within pos | ΔMSE [95% CI] | ΔMAE [95% CI] |
|---|---|---|---|---|---|---|---|---|
| C0 | 1469 | +2.31 | 3.81 | 5.51 | 0.26 | 0.26 | — | — |
| C3f0 | 1469 | -0.75 | 4.00 | 4.82 | 0.35 | 0.35 | -7.12 [-9.48, -4.87] | 0.18 [0.00, 0.35] |
| K1f0 | 1469 | -0.63 | 4.00 | 4.82 | 0.34 | 0.34 | -7.17 [-9.46, -5.04] | 0.18 [0.01, 0.35] |
| SOf0 | 1469 | +1.32 | 3.55 | 4.96 | 0.36 | 0.36 | -5.80 [-7.84, -3.90] | -0.26 [-0.39, -0.14] |
| SOK1f0 | 1469 | +1.31 | 3.54 | 4.94 | 0.37 | 0.36 | -5.96 [-8.02, -4.04] | -0.27 [-0.40, -0.15] |

### 3.4 All veterans

**pooled**

| cand | n | bias | MAE | RMSE | ρ | ρ within pos | ΔMSE [95% CI] | ΔMAE [95% CI] |
|---|---|---|---|---|---|---|---|---|
| C0 | 3130 | +3.44 | 4.95 | 6.71 | 0.35 | 0.36 | — | — |
| C3f0 | 3130 | +0.35 | 4.58 | 5.47 | 0.45 | 0.46 | -15.11 [-17.20, -13.11] | -0.37 [-0.51, -0.23] |
| K1f0 | 3130 | +0.45 | 4.60 | 5.49 | 0.44 | 0.45 | -14.85 [-16.82, -12.92] | -0.35 [-0.49, -0.22] |
| SOf0 | 3130 | +2.12 | 4.36 | 5.81 | 0.47 | 0.48 | -11.27 [-13.18, -9.44] | -0.60 [-0.72, -0.49] |
| SOK1f0 | 3130 | +2.11 | 4.34 | 5.79 | 0.47 | 0.48 | -11.43 [-13.36, -9.58] | -0.61 [-0.73, -0.50] |

### 3.5 Non-qualifying rows

**non-qualifying**

| cand | n | bias | MAE | RMSE | ρ | ρ within pos | ΔMSE [95% CI] | ΔMAE [95% CI] |
|---|---|---|---|---|---|---|---|---|
| C0 | 723 | +6.94 | 7.84 | 9.18 | 0.11 | 0.10 | — | — |
| C3f0 | 723 | +1.82 | 5.40 | 6.18 | 0.11 | 0.09 | -46.15 [-51.81, -40.72] | -2.44 [-2.79, -2.08] |
| K1f0 | 723 | +2.27 | 5.45 | 6.27 | 0.17 | 0.13 | -45.06 [-50.39, -39.97] | -2.39 [-2.70, -2.05] |
| SOf0 | 723 | +1.25 | 5.25 | 5.96 | 0.11 | 0.10 | -48.81 [-54.88, -42.84] | -2.59 [-2.97, -2.19] |
| SOK1f0 | 723 | +1.18 | 5.20 | 5.90 | 0.13 | 0.12 | -49.50 [-55.58, -43.42] | -2.64 [-3.03, -2.24] |

### 3.6 Not relevant

**not relevant**

| cand | n | bias | MAE | RMSE | ρ | ρ within pos | ΔMSE [95% CI] | ΔMAE [95% CI] |
|---|---|---|---|---|---|---|---|---|
| C0 | 1890 | +4.63 | 6.10 | 7.75 | 0.29 | 0.23 | — | — |
| C3f0 | 1890 | +1.23 | 5.14 | 6.02 | 0.41 | 0.31 | -23.79 [-26.85, -20.86] | -0.96 [-1.16, -0.75] |
| K1f0 | 1890 | +1.40 | 5.17 | 6.05 | 0.41 | 0.29 | -23.35 [-26.19, -20.58] | -0.93 [-1.13, -0.73] |
| SOf0 | 1890 | +2.49 | 5.10 | 6.43 | 0.43 | 0.34 | -18.60 [-21.60, -15.78] | -0.99 [-1.18, -0.82] |
| SOK1f0 | 1890 | +2.46 | 5.08 | 6.41 | 0.43 | 0.35 | -18.86 [-21.89, -16.04] | -1.01 [-1.20, -0.83] |

### 3.7 By position

**QB**

| cand | n | bias | MAE | RMSE | ρ | ρ within pos | ΔMSE [95% CI] | ΔMAE [95% CI] |
|---|---|---|---|---|---|---|---|---|
| C0 | 375 | +4.50 | 5.49 | 6.91 | 0.48 | 0.48 | — | — |
| C3f0 | 375 | +1.27 | 3.99 | 4.87 | 0.61 | 0.61 | -23.99 [-30.91, -17.31] | -1.50 [-2.01, -1.00] |
| K1f0 | 375 | +1.38 | 4.09 | 4.98 | 0.60 | 0.60 | -22.92 [-29.46, -16.61] | -1.40 [-1.87, -0.93] |
| SOf0 | 375 | +2.17 | 3.86 | 5.03 | 0.63 | 0.63 | -22.46 [-29.78, -15.38] | -1.63 [-2.12, -1.15] |
| SOK1f0 | 375 | +2.17 | 3.86 | 5.03 | 0.63 | 0.63 | -22.46 [-29.78, -15.38] | -1.63 [-2.12, -1.15] |

**RB**

| cand | n | bias | MAE | RMSE | ρ | ρ within pos | ΔMSE [95% CI] | ΔMAE [95% CI] |
|---|---|---|---|---|---|---|---|---|
| C0 | 800 | +3.03 | 4.76 | 6.52 | 0.27 | 0.27 | — | — |
| C3f0 | 800 | -0.14 | 4.65 | 5.53 | 0.37 | 0.37 | -12.01 [-16.00, -8.35] | -0.11 [-0.38, 0.15] |
| K1f0 | 800 | +0.01 | 4.66 | 5.54 | 0.36 | 0.36 | -11.91 [-15.73, -8.40] | -0.10 [-0.37, 0.15] |
| SOf0 | 800 | +1.80 | 4.36 | 5.84 | 0.39 | 0.39 | -8.45 [-11.85, -5.10] | -0.40 [-0.61, -0.19] |
| SOK1f0 | 800 | +1.81 | 4.35 | 5.83 | 0.39 | 0.39 | -8.56 [-11.97, -5.22] | -0.41 [-0.62, -0.20] |

**WR**

| cand | n | bias | MAE | RMSE | ρ | ρ within pos | ΔMSE [95% CI] | ΔMAE [95% CI] |
|---|---|---|---|---|---|---|---|---|
| C0 | 1216 | +3.75 | 5.23 | 7.01 | 0.31 | 0.31 | — | — |
| C3f0 | 1216 | +0.45 | 4.84 | 5.65 | 0.42 | 0.42 | -17.26 [-20.67, -14.03] | -0.39 [-0.62, -0.17] |
| K1f0 | 1216 | +0.46 | 4.82 | 5.63 | 0.42 | 0.42 | -17.45 [-20.91, -14.24] | -0.41 [-0.65, -0.19] |
| SOf0 | 1216 | +2.53 | 4.70 | 6.14 | 0.43 | 0.43 | -11.41 [-14.08, -8.76] | -0.53 [-0.69, -0.38] |
| SOK1f0 | 1216 | +2.48 | 4.67 | 6.12 | 0.44 | 0.44 | -11.74 [-14.54, -8.98] | -0.56 [-0.72, -0.39] |

**TE**

| cand | n | bias | MAE | RMSE | ρ | ρ within pos | ΔMSE [95% CI] | ΔMAE [95% CI] |
|---|---|---|---|---|---|---|---|---|
| C0 | 739 | +2.83 | 4.44 | 6.29 | 0.38 | 0.38 | — | — |
| C3f0 | 739 | +0.24 | 4.40 | 5.39 | 0.44 | 0.44 | -10.40 [-14.18, -6.91] | -0.04 [-0.30, 0.22] |
| K1f0 | 739 | +0.45 | 4.43 | 5.46 | 0.42 | 0.42 | -9.66 [-12.91, -6.75] | -0.01 [-0.24, 0.22] |
| SOf0 | 739 | +1.77 | 4.04 | 5.57 | 0.47 | 0.47 | -8.44 [-12.16, -5.12] | -0.40 [-0.62, -0.20] |
| SOK1f0 | 739 | +1.80 | 4.04 | 5.57 | 0.47 | 0.47 | -8.44 [-12.13, -5.15] | -0.40 [-0.62, -0.20] |

### 3.8 Relevant, by position

**QB**

| cand | n | bias | MAE | RMSE | ρ | ρ within pos | ΔMSE [95% CI] | ΔMAE [95% CI] |
|---|---|---|---|---|---|---|---|---|
| C0 | 194 | +2.37 | 3.80 | 5.22 | 0.33 | 0.33 | — | — |
| C3f0 | 194 | +0.30 | 3.76 | 4.63 | 0.35 | 0.35 | -5.84 [-9.32, -2.96] | -0.04 [-0.40, 0.28] |
| K1f0 | 194 | +0.31 | 3.75 | 4.62 | 0.35 | 0.35 | -5.90 [-9.40, -3.03] | -0.05 [-0.40, 0.27] |
| SOf0 | 194 | +2.26 | 3.82 | 5.21 | 0.33 | 0.33 | -0.13 [-1.56, 1.00] | 0.02 [-0.09, 0.14] |
| SOK1f0 | 194 | +2.26 | 3.82 | 5.21 | 0.33 | 0.33 | -0.13 [-1.56, 1.00] | 0.02 [-0.09, 0.14] |

**RB**

| cand | n | bias | MAE | RMSE | ρ | ρ within pos | ΔMSE [95% CI] | ΔMAE [95% CI] |
|---|---|---|---|---|---|---|---|---|
| C0 | 352 | +1.72 | 3.42 | 5.10 | 0.24 | 0.24 | — | — |
| C3f0 | 352 | -0.93 | 3.96 | 4.84 | 0.24 | 0.24 | -2.60 [-5.35, -0.24] | 0.54 [0.29, 0.77] |
| K1f0 | 352 | -0.89 | 3.96 | 4.83 | 0.25 | 0.25 | -2.68 [-5.31, -0.34] | 0.54 [0.30, 0.76] |
| SOf0 | 352 | +1.63 | 3.42 | 5.07 | 0.24 | 0.24 | -0.32 [-1.61, 0.50] | -0.00 [-0.07, 0.06] |
| SOK1f0 | 352 | +1.64 | 3.42 | 5.07 | 0.24 | 0.24 | -0.31 [-1.61, 0.51] | 0.00 [-0.07, 0.06] |

**WR**

| cand | n | bias | MAE | RMSE | ρ | ρ within pos | ΔMSE [95% CI] | ΔMAE [95% CI] |
|---|---|---|---|---|---|---|---|---|
| C0 | 500 | +1.42 | 2.99 | 4.39 | 0.18 | 0.18 | — | — |
| C3f0 | 500 | -1.55 | 3.74 | 4.36 | 0.19 | 0.19 | -0.29 [-2.44, 1.54] | 0.75 [0.53, 0.97] |
| K1f0 | 500 | -1.55 | 3.74 | 4.36 | 0.19 | 0.19 | -0.29 [-2.44, 1.54] | 0.75 [0.52, 0.96] |
| SOf0 | 500 | +1.38 | 3.00 | 4.40 | 0.19 | 0.19 | 0.00 [-0.24, 0.21] | 0.01 [-0.03, 0.04] |
| SOK1f0 | 500 | +1.38 | 3.00 | 4.39 | 0.19 | 0.19 | 0.00 [-0.25, 0.21] | 0.00 [-0.03, 0.04] |

**TE**

| cand | n | bias | MAE | RMSE | ρ | ρ within pos | ΔMSE [95% CI] | ΔMAE [95% CI] |
|---|---|---|---|---|---|---|---|---|
| C0 | 194 | +1.21 | 2.79 | 4.18 | 0.17 | 0.17 | — | — |
| C3f0 | 194 | -1.00 | 3.30 | 4.10 | 0.17 | 0.17 | -0.61 [-3.28, 1.75] | 0.51 [0.22, 0.77] |
| K1f0 | 194 | -1.00 | 3.30 | 4.10 | 0.17 | 0.17 | -0.61 [-3.28, 1.75] | 0.51 [0.22, 0.77] |
| SOf0 | 194 | +1.21 | 2.79 | 4.18 | 0.17 | 0.17 | 0.00 [0.00, 0.00] | 0.00 [0.00, 0.00] |
| SOK1f0 | 194 | +1.21 | 2.79 | 4.18 | 0.17 | 0.17 | 0.00 [0.00, 0.00] | 0.00 [0.00, 0.00] |

### 3.9 Star, by K1 state

**none**

| cand | n | bias | MAE | RMSE | ρ | ρ within pos | ΔMSE [95% CI] | ΔMAE [95% CI] |
|---|---|---|---|---|---|---|---|---|
| C0 | 24 | +4.63 | 5.79 | 7.95 | -0.15 | -0.15 | — | — |
| C3f0 | 24 | +0.46 | 5.79 | 6.61 | -0.11 | -0.14 | -19.42 n/a | 0.00 n/a |
| K1f0 | 24 | +0.46 | 5.79 | 6.61 | -0.11 | -0.14 | -19.42 n/a | 0.00 n/a |
| SOf0 | 24 | -1.75 | 5.75 | 6.30 | -0.07 | -0.13 | -23.46 n/a | -0.04 n/a |
| SOK1f0 | 24 | -1.75 | 5.75 | 6.30 | -0.07 | -0.13 | -23.46 n/a | -0.04 n/a |

**short-inj**

| cand | n | bias | MAE | RMSE | ρ | ρ within pos | ΔMSE [95% CI] | ΔMAE [95% CI] |
|---|---|---|---|---|---|---|---|---|
| C0 | 170 | +5.64 | 6.82 | 8.37 | 0.11 | 0.02 | — | — |
| C3f0 | 170 | +0.01 | 5.21 | 6.15 | 0.09 | -0.03 | -32.22 [-43.23, -21.13] | -1.61 [-2.39, -0.84] |
| K1f0 | 170 | +0.98 | 5.22 | 6.11 | 0.17 | -0.07 | -32.62 [-42.19, -23.19] | -1.59 [-2.26, -0.93] |
| SOf0 | 170 | -0.44 | 5.28 | 6.15 | 0.10 | -0.03 | -32.22 [-43.82, -20.38] | -1.54 [-2.35, -0.67] |
| SOK1f0 | 170 | -0.40 | 5.26 | 6.12 | 0.11 | -0.03 | -32.54 [-44.01, -20.79] | -1.56 [-2.38, -0.69] |

**short-oth**

| cand | n | bias | MAE | RMSE | ρ | ρ within pos | ΔMSE [95% CI] | ΔMAE [95% CI] |
|---|---|---|---|---|---|---|---|---|
| C0 | 45 | +7.73 | 8.31 | 9.69 | 0.01 | -0.09 | — | — |
| C3f0 | 45 | +2.22 | 5.78 | 6.39 | -0.14 | -0.19 | -53.07 [-73.43, -31.36] | -2.53 [-3.91, -1.00] |
| K1f0 | 45 | +2.56 | 5.76 | 6.39 | -0.01 | 0.09 | -53.00 [-73.38, -31.95] | -2.56 [-3.87, -1.07] |
| SOf0 | 45 | +2.04 | 5.60 | 6.22 | -0.07 | -0.10 | -55.16 [-75.31, -33.12] | -2.71 [-4.11, -1.14] |
| SOK1f0 | 45 | +1.58 | 5.27 | 5.88 | -0.00 | -0.08 | -59.27 [-81.11, -35.91] | -3.04 [-4.51, -1.40] |

### 3.10 Eval S 2020–2024

**eval S ≥ 2020**

| cand | n | bias | MAE | RMSE | ρ | ρ within pos | ΔMSE [95% CI] | ΔMAE [95% CI] |
|---|---|---|---|---|---|---|---|---|
| C0 | 2317 | +3.50 | 5.07 | 6.80 | 0.37 | 0.39 | — | — |
| C3f0 | 2317 | +0.33 | 4.61 | 5.48 | 0.48 | 0.49 | -16.26 [-18.75, -13.79] | -0.47 [-0.64, -0.30] |
| K1f0 | 2317 | +0.44 | 4.62 | 5.50 | 0.48 | 0.48 | -16.04 [-18.46, -13.72] | -0.45 [-0.62, -0.29] |
| SOf0 | 2317 | +2.14 | 4.39 | 5.82 | 0.50 | 0.51 | -12.44 [-14.74, -10.34] | -0.68 [-0.82, -0.56] |
| SOK1f0 | 2317 | +2.13 | 4.38 | 5.80 | 0.50 | 0.51 | -12.59 [-14.91, -10.50] | -0.70 [-0.83, -0.57] |

### 3.11 Fallbacks

| eval S | train rows (non-qual) | eval rows (non-qual) | non-qual rows on a parent k | cells at the grid floor |
|---|---|---|---|---|
| 2018 | 1232 (254) | 393 (81) | SOf0 66, SOK1f0 81 | SOf0 2, SOK1f0 2 |
| 2019 | 1625 (335) | 420 (82) | SOf0 54, SOK1f0 75 | SOf0 1, SOK1f0 2 |
| 2020 | 2045 (417) | 466 (114) | SOK1f0 51, SOf0 10 | SOf0 3, SOK1f0 4 |
| 2021 | 2511 (531) | 469 (111) | SOK1f0 33, SOf0 2 | SOf0 3, SOK1f0 4 |
| 2022 | 2980 (642) | 454 (107) | SOf0 7, SOK1f0 15 | SOf0 3, SOK1f0 4 |
| 2023 | 3434 (749) | 457 (114) | SOK1f0 9 | SOf0 3, SOK1f0 5 |
| 2024 | 3891 (863) | 471 (114) | SOf0 3, SOK1f0 5 | SOf0 5, SOK1f0 7 |

## 4. What short-season stars actually played

Out-of-sample rows by K1 state: actual outcome and each rule's mean prediction / MAE.

**Star rows**

| K1 state | n | actual mean | actual median | C0 pred / MAE | C3f0 pred / MAE | K1f0 pred / MAE | SOf0 pred / MAE | SOK1f0 pred / MAE |
|---|---|---|---|---|---|---|---|---|
| all | 239 | 7.59 | 7 | 13.53 / 7.00 | 8.06 / 5.37 | 8.82 / 5.38 | 7.49 / 5.38 | 7.43 / 5.31 |
| none | 24 | 8.88 | 10.5 | 13.50 / 5.79 | 9.33 / 5.79 | 9.33 / 5.79 | 7.13 / 5.75 | 7.13 / 5.75 |
| short-inj | 170 | 7.98 | 7 | 13.62 / 6.82 | 7.99 / 5.21 | 8.96 / 5.22 | 7.54 / 5.28 | 7.58 / 5.26 |
| short-oth | 45 | 5.44 | 4 | 13.18 / 8.31 | 7.67 / 5.78 | 8.00 / 5.76 | 7.49 / 5.60 | 7.02 / 5.27 |

**All non-qualifying rows**

| K1 state | n | actual mean | actual median | C0 pred / MAE | C3f0 pred / MAE | K1f0 pred / MAE | SOf0 pred / MAE | SOK1f0 pred / MAE |
|---|---|---|---|---|---|---|---|---|
| all | 723 | 5.73 | 4 | 12.67 / 7.84 | 7.54 / 5.40 | 8.00 / 5.45 | 6.97 / 5.25 | 6.91 / 5.20 |
| none | 99 | 4.38 | 1 | 12.99 / 9.05 | 8.82 / 6.46 | 8.82 / 6.46 | 6.90 / 5.59 | 6.90 / 5.59 |
| short-inj | 310 | 6.78 | 5.5 | 12.89 / 7.14 | 7.54 / 5.07 | 8.36 / 5.11 | 7.10 / 5.04 | 7.18 / 5.05 |
| short-oth | 314 | 5.11 | 3 | 12.35 / 8.14 | 7.15 / 5.38 | 7.39 / 5.47 | 6.88 / 5.36 | 6.64 / 5.22 |

## 5. Full-sample k tables

Fitted once more on the full panel (S 2015–2024), nested by level. SOf0 and SOK1f0 fit on **non-qualifying rows only**; the references fit on all rows. Written to `backtests/<date>-games-short-constants.json`.

- **C3f0** (floor 0, fit rows: all): `pos|s` { QB|qual 0.86, TE|qual 0.87, RB|qual 0.85, RB|short 0.51, WR|qual 0.8, QB|short 0.5 (at grid floor 0.50), TE|none 0.55, WR|short 0.52, WR|none 0.5 (at grid floor 0.50), TE|short 0.53 }; `pos` { QB 0.71, TE 0.8, RB 0.78, WR 0.72 }; thin → parent: RB|none (31), QB|none (8)
- **K1f0** (floor 0, fit rows: all): `pos|k1` { QB|qual 0.86, TE|qual 0.87, RB|qual 0.85, RB|short-oth 0.5 (at grid floor 0.50), WR|qual 0.8, QB|short-inj 0.5 (at grid floor 0.50), TE|none 0.55, WR|short-oth 0.5 (at grid floor 0.50), WR|none 0.5 (at grid floor 0.50), RB|short-inj 0.59, TE|short-oth 0.53, WR|short-inj 0.52, TE|short-inj 0.73 }; `pos` { QB 0.71, TE 0.8, RB 0.78, WR 0.72 }; thin → parent: QB|short-oth (25), RB|none (31), QB|none (8)
- **SOf0** (floor 0, fit rows: non-qual): `pos|s` { RB|short 0.51, QB|short 0.5 (at grid floor 0.50), TE|none 0.55, WR|short 0.52, WR|none 0.5 (at grid floor 0.50), TE|short 0.53 }; `pos` { RB 0.5 (at grid floor 0.50), QB 0.5 (at grid floor 0.50), TE 0.53, WR 0.5 (at grid floor 0.50) }; thin → parent: RB|none (31), QB|none (8)
- **SOK1f0** (floor 0, fit rows: non-qual): `pos|k1` { RB|short-oth 0.5 (at grid floor 0.50), QB|short-inj 0.5 (at grid floor 0.50), TE|none 0.55, WR|short-oth 0.5 (at grid floor 0.50), WR|none 0.5 (at grid floor 0.50), RB|short-inj 0.59, TE|short-oth 0.53, WR|short-inj 0.52, TE|short-inj 0.73 }; `pos` { RB 0.5 (at grid floor 0.50), QB 0.5 (at grid floor 0.50), TE 0.53, WR 0.5 (at grid floor 0.50) }; thin → parent: QB|short-oth (25), RB|none (31), QB|none (8)

## 6. Decision

Eligible when: **G1** relevant ΔMAE CI upper bound ≤ δ; **G3** star ΔMAE CI upper bound < 0 (improved, strict); **G4** all-veteran ΔMSE CI upper bound < 0; **G5** no position whose relevant ΔMAE CI lower bound > δ. A null CI fails G1/G3/G4 and does not fail G5. **G2 (relevant bias) is reported, not gated** — the candidates leave qualifying rows, and therefore the relevant bias, unchanged. Tier order: SOf0 < SOK1f0; SOK1f0 replaces SOf0 only when its paired R\* ΔMAE CI upper bound is below 0. The references are scored and never picked.

| candidate | δ = 0.1 | δ = 0.25 | δ = 0.5 |
|---|---|---|---|
| C3f0 (reference) | fails G1, G5 | fails G1, G5 | fails G1, G5 |
| K1f0 (reference) | fails G1, G5 | fails G1, G5 | fails G1, G5 |
| SOf0 | eligible | eligible | eligible |
| SOK1f0 | eligible | eligible | eligible |

Relevant bias (raw mean pred − outcome): C0 +1.62, C3f0 -1.00, K1f0 -0.99, SOf0 +1.56, SOK1f0 +1.57.

- δ = 0.1: (W) wire SOf0 at δ = 0.1 — relevant players non-inferior and injured-star error improved; a wiring slice (app seasonProjection.js Step 6, CR-28) is planned separately after Anton reads this verdict.
- **δ = 0.25: (W) wire SOf0 at δ = 0.25 — relevant players non-inferior and injured-star error improved; a wiring slice (app seasonProjection.js Step 6, CR-28) is planned separately after Anton reads this verdict.**
- δ = 0.5: (W) wire SOf0 at δ = 0.5 — relevant players non-inferior and injured-star error improved; a wiring slice (app seasonProjection.js Step 6, CR-28) is planned separately after Anton reads this verdict.

The choice is Anton's.

## 7. 2026 impact and named stars

Veterans in the 2026-10-07 snapshot: 437. Games change vs C0; rank change = projectedPPG × games.

| id | changed | non-qual | mean Δ QB | RB | WR | TE | rel3 cut ≥ 4 | rank changes (QB / RB / WR / TE) |
|---|---|---|---|---|---|---|---|---|
| C3f0 | 437 | 98 | -3.52 | -3.30 | -3.62 | -2.55 | 47 | 49/58 / 81/98 / 156/169 / 79/112 |
| K1f0 | 437 | 98 | -3.19 | -3.25 | -3.64 | -2.42 | 45 | 51/58 / 79/98 / 156/169 / 75/112 |
| SOf0 | 98 | 98 | -2.52 | -1.50 | -1.30 | -0.92 | 33 | 51/58 / 78/98 / 164/169 / 61/112 |
| SOK1f0 | 98 | 98 | -2.52 | -1.46 | -1.32 | -0.79 | 33 | 51/58 / 78/98 / 164/169 / 56/112 |

**Named stars** (guardrail for Anton, not a gate): pinned first, then every rel3 veteran whose games change by ≥ 3 under a candidate.

| player | pos | S-state | K1 | rel3 | C0 | C3f0 | K1f0 | SOf0 | SOK1f0 |
|---|---|---|---|---|---|---|---|---|---|
| Jayden Daniels | QB | short | short-inj | yes | 17 | 9 | 9 | 9 | 9 |
| Garrett Wilson | WR | short | short-inj | yes | 17 | 9 | 9 | 9 | 9 |
| Brandon Aiyuk | WR | short | short-inj | yes | 17 | 9 | 9 | 9 | 9 |
| Calvin Ridley | WR | short | short-inj | yes | 17 | 9 | 9 | 9 | 9 |
| DeeJay Dallas | RB | short | short-oth | no | 17 | 8 | 8 | 8 | 8 |
| AJ Dillon | RB | short | short-oth | yes | 16 | 8 | 8 | 8 | 8 |
| Austin Trammell | WR | short | short-inj | no | 16 | 8 | 8 | 8 | 8 |
| Braelon Allen | RB | short | short-oth | yes | 17 | 9 | 9 | 9 | 9 |
| Braxton Berrios | WR | short | short-oth | no | 16 | 8 | 8 | 8 | 8 |
| Britain Covey | WR | short | short-oth | no | 16 | 8 | 8 | 8 | 8 |
| David Moore | WR | short | short-inj | no | 16 | 8 | 8 | 8 | 8 |
| Deshaun Watson | QB | short | short-inj | no | 16 | 8 | 8 | 8 | 8 |
| Deven Thompkins | WR | short | short-oth | no | 17 | 9 | 9 | 9 | 9 |
| Jaret Patterson | RB | short | short-oth | no | 17 | 9 | 9 | 9 | 9 |
| Carson Steele | RB | short | short-oth | no | 17 | 9 | 9 | 9 | 9 |
| Jayden Reed | WR | short | short-inj | yes | 17 | 9 | 9 | 9 | 9 |
| Najee Harris | RB | short | short-inj | yes | 17 | 9 | 10 | 9 | 10 |
| Sam Howell | QB | short | short-oth | yes | 17 | 9 | 12 | 9 | 9 |
| Trey Palmer | WR | short | short-oth | yes | 16 | 8 | 8 | 8 | 8 |
| Ty Chandler | RB | short | short-oth | yes | 17 | 9 | 9 | 9 | 9 |
| Jonathan Mingo | WR | short | short-inj | yes | 16 | 9 | 9 | 9 | 9 |
| Khalil Herbert | RB | short | short-oth | yes | 13 | 7 | 6 | 7 | 6 |
| Malik Nabers | WR | short | short-inj | yes | 15 | 8 | 8 | 8 | 8 |
| Roschon Johnson | RB | short | short-oth | yes | 14 | 7 | 7 | 7 | 7 |
| Austin Ekeler | RB | short | short-inj | yes | 13 | 7 | 8 | 7 | 8 |
| Brandon Johnson | WR | short | short-oth | yes | 13 | 7 | 7 | 7 | 7 |
| Gardner Minshew | QB | short | short-inj | yes | 12 | 6 | 6 | 6 | 6 |
| Jalen McMillan | WR | short | short-inj | yes | 12 | 6 | 6 | 6 | 6 |
| Jameis Winston | QB | short | short-inj | yes | 13 | 7 | 7 | 7 | 7 |
| James Conner | RB | short | short-inj | yes | 13 | 7 | 8 | 7 | 8 |
| Joshua Dobbs | QB | short | short-inj | yes | 13 | 7 | 7 | 7 | 7 |
| Kenny Pickett | QB | short | short-oth | yes | 12 | 6 | 9 | 6 | 6 |
| Kyler Murray | QB | short | short-inj | yes | 13 | 7 | 7 | 7 | 7 |
| Odell Beckham | WR | none | none | yes | 12 | 6 | 6 | 6 | 6 |
| Tank Dell | WR | short | short-inj | yes | 13 | 7 | 7 | 7 | 7 |
| Will Levis | QB | short | short-inj | yes | 11 | 5 | 5 | 5 | 5 |
| Zach Wilson | QB | short | short-oth | yes | 11 | 5 | 8 | 5 | 5 |
| Zamir White | RB | short | short-inj | yes | 12 | 6 | 7 | 6 | 7 |
| Anthony Richardson | QB | short | short-inj | yes | 10 | 5 | 5 | 5 | 5 |
| Dameon Pierce | RB | short | short-oth | yes | 11 | 6 | 6 | 6 | 6 |
| K.J. Osborn | WR | short | short-inj | yes | 10 | 5 | 5 | 5 | 5 |
| Aidan O'Connell | QB | short | short-inj | yes | 9 | 5 | 5 | 5 | 5 |

## 8. Limits

- The 0.50 grid floor binds for the cells marked in §5. The fitted cuts are therefore conservative; the grid is pre-registered and was not widened.
- **This is not an independent confirmation.** The candidates were chosen from L6b §5's out-of-sample breakdown. The gates were set after a Session 1 probe of this exact run: G2 was dropped and G3 tightened. These held-out CIs re-score the same panel, folds and seed that suggested the candidates, so a (W) carries that selection effect. The first clean test is forward grading (2026 outcomes).
- `relevant` has few non-qualifying out-of-sample rows (10); see §1.
- Qualifying-row bias (+1.6 relevant) is left in place by design.
- Ranks use half-PPR; the app uses league scoring. §7's rank impact uses the snapshot's league-scored `projectedPPG`.
- Floor 0 applies to non-qualifying rows only, and needs an app clamp change for those rows.
- L6b's limits carry over: `chain` QB totals do not read `projectedGames`; historical rows cannot be routed to `chain`; snapshot scoring; rookies are out of scope.
- **Wireability:** SOf0 needs only last-season gp and position. SOK1f0 also needs `classifyInjurySeason`, which is CR-28-mirrored and app-native. Both would wire as an app `seasonProjection.js` Step 6 change under CR-28, with a `grading/anchor-policy.md` boundary.
