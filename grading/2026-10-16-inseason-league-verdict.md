# In-season evidence — Phase 2a graded backtest

Generated 2026-10-16T08:52:12.982Z. Basis **league** (D-46: rows rescored as the app does at load, with positionBasisScale as-of each season). Outcome seasons 2014–2025, calendar checkpoints W = 1–12, n = games played, leave-one-season-out, player-clustered bootstrap (4000 resamples, seed 12345, mulberry32), k grid 0–40 in tenths.

## Answers

- **Q1 — k with the real reconstructed projection as prior.** ROS points (arm P): QB 2.6 · RB 2.6 · WR 3.1 · TE 3.2 (study 6 · 3 · 4.5 · 5.5; arm S reproduces the study's own QB 4.8 · RB 2.9 · WR 4.2 · TE 4.0). Next-season points (arm P): QB 4.1 · RB 4.0 · WR 3.8 · TE 4.0 (study 7.5 · 4.5 · 6.5 · 6.5). Fitted k vs study k over the single-position cells: 4 BEATS, 20 NO-GAIN, 2 WORSE; BEATS: pointsP_ros QB, pointsP_ros WR, pointsP_ros TE, pointsR_ros TE; WORSE: pointsR_next QB, opp_next TE. Grid-boundary fits: none.
- **Q2 — opportunity + points vs points-only (out of sample).** VE/G BEATS points-only on the primary population for: WR next (VE). Secondary (role-change rows) BEATS: WR next VE, WR next G.
- **Q3 — weak/strong split and projection confidence.** Adopted: WR next (band). See §Q3 for each label.
- **Q4 — rookies and players without a ≥ 8-game prior season.** Fitted k vs Phase 1's rule over the position cells: 16 NO-GAIN, 2 BEATS; INSUFFICIENT position cells (pooled fallback): X-rookie0 next QB, X-rookie1p next QB, X-short ros QB, X-short next QB, X-short next RB, X-short next TE. Opportunity for these players: not measurable (no projected-volume prior). 16 cells pinned to the pooled value under the NO-GAIN rule: X-rookie0 ros QB, X-rookie0 ros RB, X-rookie0 ros WR, X-rookie0 ros TE, X-rookie0 next RB, X-rookie0 next WR, X-rookie0 next TE, X-rookie1p ros QB, X-rookie1p ros RB, X-rookie1p ros TE, X-rookie1p next RB, X-rookie1p next WR, X-rookie1p next TE, X-short ros RB, X-short ros TE, X-short next WR.
- **Q5 — baseline lookback.** Arm B (last season with ≥ 4 games): pooled ROS-opportunity ΔMAE (B − A) -3.331 [-4.364, -2.411] → BEATS, on 933 rows / 102 player-seasons that Phase 1 would flag "new role" and arm B removes. K_ROS_OPP_STALE: not adopted (a separate k does not BEAT the pooled k on those rows).
- **Q6 — cross-position usage-shift sort measure.** Winner: **pointsEquivalent** (within 0.01 of the best Spearman → smaller mix gap). Spearman vs realised ROS − prior: raw 0.300 · relative 0.316 · z 0.324 · pointsEquivalent 0.326; mean top-50 position-mix gap: raw 0.091 · relative 0.059 · z 0.072 · pointsEquivalent 0.065.
- **Q7 — depth-chart double count.** **FREEZE**: live-depth prior vs frozen ΔMAE -0.0037 [-0.0081, 0.0005] → NO-GAIN; arm L's promoted-row mean residual 0.185 [0.002, 0.356] (excludes 0). Fitted k: P 2.9, L 3.0; 37% of arm-P rows have a different depth order at their checkpoint.
- **Q8 — which k drives which.** Season projection → kROS QB 2.6 · RB 2.6 · WR 3.1 · TE 3.2; dynasty → kNext QB 4.1 · RB 4.0 · WR 3.8 · TE 4.0. Cross-application MAE penalty (kNext on ROS / kROS on next): QB 0.95% / 1.19% · RB 0.62% / 0.56% · WR 0.31% / 0.13% · TE 0.30% / 0.07%. Both penalties < 1% for RB, WR, TE; not at every position, so the two sets stay separate. S+2 diagnostic k: QB 2.6 · RB 6.9 · WR 3.8 · TE 4.5; arm R next-season k (K_DYN_POINTS_HISTORY): QB 7.1 · RB 4.0 · WR 5.8 · TE 4.9.
- **Q9 — QB starts arm (report-only).** n = starts, non-original QBs: k 3.5 [2.2, 7.1] on 542 rows / 79 QBs; vs the pinned games-played QB k (per arm): ΔMAE 0.0313 [-0.0929, 0.1509] → NO-GAIN. Pins nothing.

## Constants table

What Phase 2b pins. `k` is the pinned value (fitted k rounded to 0.5, or the §4.5 fallback); `basis` says which. Study / Phase 1 column: the study k for the single-signal constants, Phase 1's per-row rule value for the rookie / short-history subgroups.

| name | cell | k | kFit | 95% CI | rows / players | basis | study / Phase 1 |
|---|---|---|---|---|---|---|---|
| `K_ROS_POINTS` | QB | 2.5 | 2.6 | [1.9, 3.7] | 3124 / 78 | fitted | 6.0 |
| `K_ROS_POINTS` | RB | 2.5 | 2.6 | [2.0, 3.5] | 9213 / 308 | fitted | 3.0 |
| `K_ROS_POINTS` | WR | 3.0 | 3.1 | [2.6, 3.7] | 12845 / 406 | fitted | 4.5 |
| `K_ROS_POINTS` | TE | 3.0 | 3.2 | [2.5, 4.1] | 8495 / 240 | fitted | 5.5 |
| `K_DYN_POINTS` | QB | 4.0 | 4.1 | [2.9, 5.7] | 2726 / 61 | fitted | 7.5 |
| `K_DYN_POINTS` | RB | 4.0 | 4.0 | [2.6, 6.3] | 6840 / 221 | fitted | 4.5 |
| `K_DYN_POINTS` | WR | 4.0 | 3.8 | [3.0, 4.9] | 10001 / 304 | fitted | 6.5 |
| `K_DYN_POINTS` | TE | 4.0 | 4.0 | [2.9, 5.6] | 6471 / 178 | fitted | 6.5 |
| `K_DYN_POINTS_HISTORY` | QB | 7.5 | 7.1 | [4.7, 10.8] | 3193 / 70 | study | 7.5 |
| `K_DYN_POINTS_HISTORY` | RB | 4.0 | 4.0 | [3.0, 5.4] | 8871 / 275 | fitted | 4.5 |
| `K_DYN_POINTS_HISTORY` | WR | 6.0 | 5.8 | [4.7, 7.1] | 12506 / 365 | fitted | 6.5 |
| `K_DYN_POINTS_HISTORY` | TE | 5.0 | 4.9 | [3.8, 6.4] | 8068 / 224 | fitted | 6.5 |
| `K_ROS_OPP` | QB | 2.5 | 2.6 | [1.5, 4.9] | 3715 / 95 | fitted | 5.0 |
| `K_ROS_OPP` | RB | 1.5 | 1.7 | [1.3, 2.2] | 6872 / 229 | fitted | 2.0 |
| `K_ROS_OPP` | WR | 3.0 | 3.2 | [2.7, 3.9] | 9461 / 297 | fitted | 2.5 |
| `K_ROS_OPP` | TE | 3.5 | 3.5 | [2.6, 4.8] | 3099 / 105 | fitted | 2.5 |
| `K_DYN_OPP` | QB | 6.0 | 5.8 | [3.3, 9.7] | 3357 / 72 | fitted | 5.5 |
| `K_DYN_OPP` | RB | 2.5 | 2.3 | [1.5, 3.4] | 6287 / 220 | fitted | 3.5 |
| `K_DYN_OPP` | WR | 4.0 | 4.0 | [3.1, 5.1] | 9149 / 293 | fitted | 4.5 |
| `K_DYN_OPP` | TE | 4.0 | 3.9 | [2.7, 5.7] | 3609 / 127 | study | 4.0 |
| `K_ROS_SHARE` | WR | 3.0 | 2.8 | [2.3, 3.5] | 9437 / 296 | fitted | 2.3 |
| `K_ROS_SHARE` | TE | 2.5 | 2.5 | [1.8, 3.4] | 3099 / 105 | fitted | 2.0 |
| `K_DYN_POINTS_WEAK` | WR | 8.0 | 8.1 | [5.3, 13.4] | 3114 / 158 | fitted | 6.5 |
| `K_DYN_POINTS_STRONG` | WR | 3.0 | 3.1 | [2.3, 4.3] | 6887 / 210 | fitted | 6.5 |
| `K_ROS_POINTS_ROOKIE0` | QB | 2.5 | 2.7 | [2.1, 3.4] | 9815 / 1063 | pooled — NO-GAIN vs Phase 1; own k does not beat the pooled k out of sample → pooled value pinned | 6.0 |
| `K_ROS_POINTS_ROOKIE0` | RB | 2.5 | 2.7 | [2.1, 3.4] | 9815 / 1063 | pooled — NO-GAIN vs Phase 1; own k does not beat the pooled k out of sample → pooled value pinned | 3.0 |
| `K_ROS_POINTS_ROOKIE0` | WR | 2.5 | 2.7 | [2.1, 3.4] | 9815 / 1063 | pooled — NO-GAIN vs Phase 1; own k does not beat the pooled k out of sample → pooled value pinned | 3.5 |
| `K_ROS_POINTS_ROOKIE0` | TE | 2.5 | 2.7 | [2.1, 3.4] | 9815 / 1063 | pooled — NO-GAIN vs Phase 1; own k does not beat the pooled k out of sample → pooled value pinned | 4.0 |
| `K_DYN_POINTS_ROOKIE0` | QB | 6.0 | 6.2 | [4.2, 9.7] | 8072 / 764 | pooled | 7.5 |
| `K_DYN_POINTS_ROOKIE0` | RB | 6.0 | 6.2 | [4.2, 9.7] | 8072 / 764 | pooled — NO-GAIN vs Phase 1; own k does not beat the pooled k out of sample → pooled value pinned | 4.5 |
| `K_DYN_POINTS_ROOKIE0` | WR | 6.0 | 6.2 | [4.2, 9.7] | 8072 / 764 | pooled — NO-GAIN vs Phase 1; own k does not beat the pooled k out of sample → pooled value pinned | 6.5 |
| `K_DYN_POINTS_ROOKIE0` | TE | 6.0 | 6.2 | [4.2, 9.7] | 8072 / 764 | pooled — NO-GAIN vs Phase 1; own k does not beat the pooled k out of sample → pooled value pinned | 6.5 |
| `K_ROS_POINTS_ROOKIE1P` | QB | 2.5 | 2.5 | [2.1, 3.1] | 10857 / 1089 | pooled — NO-GAIN vs Phase 1; own k does not beat the pooled k out of sample → pooled value pinned | 6.0 |
| `K_ROS_POINTS_ROOKIE1P` | RB | 2.5 | 2.5 | [2.1, 3.1] | 10857 / 1089 | pooled — NO-GAIN vs Phase 1; own k does not beat the pooled k out of sample → pooled value pinned | 3.0 |
| `K_ROS_POINTS_ROOKIE1P` | WR | 3.0 | 3.0 | [2.2, 4.0] | 4384 / 439 | fitted | 3.5 |
| `K_ROS_POINTS_ROOKIE1P` | TE | 2.5 | 2.5 | [2.1, 3.1] | 10857 / 1089 | pooled — NO-GAIN vs Phase 1; own k does not beat the pooled k out of sample → pooled value pinned | 4.0 |
| `K_DYN_POINTS_ROOKIE1P` | QB | 3.5 | 3.7 | [2.9, 4.8] | 8690 / 752 | pooled | 7.5 |
| `K_DYN_POINTS_ROOKIE1P` | RB | 3.5 | 3.7 | [2.9, 4.8] | 8690 / 752 | pooled — NO-GAIN vs Phase 1; own k does not beat the pooled k out of sample → pooled value pinned | 4.5 |
| `K_DYN_POINTS_ROOKIE1P` | WR | 3.5 | 3.7 | [2.9, 4.8] | 8690 / 752 | pooled — NO-GAIN vs Phase 1; own k does not beat the pooled k out of sample → pooled value pinned | 6.5 |
| `K_DYN_POINTS_ROOKIE1P` | TE | 3.5 | 3.7 | [2.9, 4.8] | 8690 / 752 | pooled — NO-GAIN vs Phase 1; own k does not beat the pooled k out of sample → pooled value pinned | 6.5 |
| `K_ROS_POINTS_SHORT` | QB | 1.5 | 1.4 | [1.1, 1.9] | 4397 / 418 | pooled | 6.0 |
| `K_ROS_POINTS_SHORT` | RB | 1.5 | 1.4 | [1.1, 1.9] | 4397 / 418 | pooled — NO-GAIN vs Phase 1; own k does not beat the pooled k out of sample → pooled value pinned | 3.0 |
| `K_ROS_POINTS_SHORT` | WR | 1.0 | 1.1 | [0.7, 1.6] | 1662 / 162 | fitted | 3.5 |
| `K_ROS_POINTS_SHORT` | TE | 1.5 | 1.4 | [1.1, 1.9] | 4397 / 418 | pooled — NO-GAIN vs Phase 1; own k does not beat the pooled k out of sample → pooled value pinned | 4.0 |
| `K_DYN_POINTS_SHORT` | QB | 2.5 | 2.4 | [1.3, 4.4] | 2724 / 221 | pooled | 7.5 |
| `K_DYN_POINTS_SHORT` | RB | 2.5 | 2.4 | [1.3, 4.4] | 2724 / 221 | pooled | 4.5 |
| `K_DYN_POINTS_SHORT` | WR | 2.5 | 2.4 | [1.3, 4.4] | 2724 / 221 | pooled — NO-GAIN vs Phase 1; own k does not beat the pooled k out of sample → pooled value pinned | 6.5 |
| `K_DYN_POINTS_SHORT` | TE | 2.5 | 2.4 | [1.3, 4.4] | 2724 / 221 | pooled | 6.5 |

Also in the constants file: `combination` = filled (see file); `sortMeasure` = `pointsEquivalent` with the pinned K_ROS_OPP by position as its shrink parameters; `fit.prior` = frozen; `fit.opportunityBaseline` = B.

## Prior optimism — read before using these k

The reconstructed projection prior runs optimistic: the joint diagnostic puts the prior scale c at 0.80–0.86 across positions, consistent with `grading/2026-09-06-fullpipeline-verdict.md`, which STOPPED on live-state reconstruction limits — the same limit applies here, so c is reported, not pinned. The pinned k partly correct that optimism (evidence gets extra weight because the prior sits high). (a) These k MUST be re-fitted if the projection's optimism is ever corrected. (b) Phase 2b's in-season "what changed" display will skew below-prior early in the season for this reason and must say so.

| pos | c | k (with c) | k (without) |
|---|---|---|---|
| QB | 0.82 | 5.2 | 2.6 |
| RB | 0.82 | 3.2 | 2.6 |
| WR | 0.80 | 4.4 | 3.1 |
| TE | 0.86 | 3.7 | 3.2 |

## Q1 — k per signal × position × horizon

Prior: arm P = the frozen reconstructed projection (S week-1 depth chart); arm R = raw S-1 PPG; opportunity and target share = raw S-1 baseline (the app holds no projected-volume prior). MAE columns are held-out (LOSO); prior-only / observed-only / study-k are computed on the same rows. ΔMAE = fitted − study (negative = fitted better).

| cell | pos | k (0.1) | pinned (0.5) | 95% CI | rows / players | boundary | fold k range | MAE prior / obs / study / fitted | RMSE fitted | ΔMAE vs study [CI] | label |
|---|---|---|---|---|---|---|---|---|---|---|---|
| pointsP_ros | QB | 2.6 | 2.5 | [1.9, 3.7] | 3124 / 78 | — | 2.4–2.8 | 4.809 / 4.576 / 3.999 / 3.903 | 4.915 | -0.0959 [-0.1861, -0.0007] | BEATS |
| pointsP_ros | RB | 2.6 | 2.5 | [2.0, 3.5] | 9213 / 308 | — | 2.4–2.9 | 3.141 / 2.909 / 2.545 / 2.548 | 3.556 | 0.0030 [-0.0041, 0.0097] | NO-GAIN |
| pointsP_ros | WR | 3.1 | 3.0 | [2.6, 3.7] | 12845 / 406 | — | 2.9–3.3 | 3.195 / 3.042 / 2.575 / 2.558 | 3.365 | -0.0174 [-0.0325, -0.0020] | BEATS |
| pointsP_ros | TE | 3.2 | 3.0 | [2.5, 4.1] | 8495 / 240 | — | 3.0–3.4 | 2.497 / 2.350 / 2.040 / 2.010 | 2.861 | -0.0302 [-0.0514, -0.0082] | BEATS |
| pointsP_ros | ALL | 2.9 | 3.0 | [2.6, 3.3] | 33677 / 1032 | — | 2.8–3.0 | 3.154 / 2.974 / 2.564 / 2.539 | 3.474 | -0.0248 [-0.0374, -0.0123] | BEATS |
| pointsP_next | QB | 4.1 | 4.0 | [2.9, 5.7] | 2726 / 61 | — | 3.8–4.6 | 4.596 / 4.917 / 3.878 / 3.822 | 4.880 | -0.0566 [-0.1317, 0.0161] | NO-GAIN |
| pointsP_next | RB | 4.0 | 4.0 | [2.6, 6.3] | 6840 / 221 | — | 3.5–4.6 | 3.466 / 3.600 / 3.137 / 3.147 | 4.301 | 0.0096 [-0.0009, 0.0205] | NO-GAIN |
| pointsP_next | WR | 3.8 | 4.0 | [3.0, 4.9] | 10001 / 304 | — | 3.5–4.0 | 3.451 / 3.463 / 2.985 / 2.969 | 3.801 | -0.0160 [-0.0462, 0.0146] | NO-GAIN |
| pointsP_next | TE | 4.0 | 4.0 | [2.9, 5.6] | 6471 / 178 | — | 3.8–4.2 | 2.732 / 2.754 / 2.408 / 2.397 | 3.262 | -0.0118 [-0.0395, 0.0140] | NO-GAIN |
| pointsP_next | ALL | 4.0 | 4.0 | [3.3, 4.7] | 26038 / 763 | — | 3.6–4.2 | 3.396 / 3.475 / 2.975 / 2.960 | 3.939 | -0.0151 [-0.0310, 0.0005] | NO-GAIN |
| pointsR_ros | QB | 4.6 | 4.5 | [3.1, 7.0] | 3673 / 92 | — | 4.3–4.7 | 3.892 / 4.353 / 3.471 / 3.476 | 4.522 | 0.0048 [-0.0270, 0.0331] | NO-GAIN |
| pointsR_ros | RB | 2.9 | 3.0 | [2.3, 3.6] | 11453 / 363 | — | 2.8–3.0 | 3.211 / 2.979 / 2.580 / 2.581 | 3.581 | 0.0009 [-0.0012, 0.0030] | NO-GAIN |
| pointsR_ros | WR | 4.1 | 4.0 | [3.5, 4.8] | 15993 / 491 | — | 4.0–4.3 | 2.999 / 3.016 / 2.482 / 2.479 | 3.225 | -0.0026 [-0.0061, 0.0010] | NO-GAIN |
| pointsR_ros | TE | 3.8 | 4.0 | [3.1, 4.6] | 10367 / 282 | — | 3.6–4.0 | 2.363 / 2.300 / 1.938 / 1.918 | 2.725 | -0.0193 [-0.0329, -0.0061] | BEATS |
| pointsR_ros | ALL | 3.7 | 3.5 | [3.3, 4.2] | 41486 / 1227 | — | 3.6–3.8 | 2.978 / 2.945 / 2.461 / 2.457 | 3.352 | -0.0033 [-0.0103, 0.0036] | NO-GAIN |
| pointsR_next | QB | 7.1 | 7.0 | [4.7, 10.8] | 3193 / 70 | — | 6.6–8.5 | 3.701 / 4.667 / 3.358 / 3.369 | 4.455 | 0.0115 [0.0013, 0.0219] | WORSE |
| pointsR_next | RB | 4.0 | 4.0 | [3.0, 5.4] | 8871 / 275 | — | 3.7–4.3 | 3.576 / 3.562 / 3.132 / 3.134 | 4.242 | 0.0019 [-0.0053, 0.0094] | NO-GAIN |
| pointsR_next | WR | 5.8 | 6.0 | [4.7, 7.1] | 12506 / 365 | — | 5.6–6.0 | 3.213 / 3.462 / 2.864 / 2.862 | 3.644 | -0.0022 [-0.0076, 0.0029] | NO-GAIN |
| pointsR_next | TE | 4.9 | 5.0 | [3.8, 6.4] | 8068 / 224 | — | 4.6–5.1 | 2.679 / 2.761 / 2.375 / 2.365 | 3.224 | -0.0100 [-0.0231, 0.0030] | NO-GAIN |
| pointsR_next | ALL | 5.2 | 5.0 | [4.5, 6.0] | 32638 / 933 | — | 5.0–5.4 | 3.227 / 3.434 / 2.864 / 2.865 | 3.808 | 0.0002 [-0.0068, 0.0069] | NO-GAIN |
| opp_ros | QB | 2.6 | 2.5 | [1.5, 4.9] | 3715 / 95 | — | 2.2–3.0 | 4.975 / 5.415 / 4.337 / 4.394 | 6.391 | 0.0566 [-0.0722, 0.1728] | NO-GAIN |
| opp_ros | RB | 1.7 | 1.5 | [1.3, 2.2] | 6872 / 229 | — | 1.6–1.9 | 4.128 / 3.381 / 3.069 / 3.072 | 4.018 | 0.0025 [-0.0072, 0.0117] | NO-GAIN |
| opp_ros | WR | 3.2 | 3.0 | [2.7, 3.9] | 9461 / 297 | — | 3.1–3.4 | 1.663 / 1.604 / 1.347 / 1.346 | 1.709 | -0.0006 [-0.0069, 0.0059] | NO-GAIN |
| opp_ros | TE | 3.5 | 3.5 | [2.6, 4.8] | 3099 / 105 | — | 3.2–3.7 | 1.437 / 1.430 / 1.198 / 1.194 | 1.530 | -0.0034 [-0.0146, 0.0089] | NO-GAIN |
| opp_ros | ALL | 2.3 | 2.5 | [1.7, 3.2] | 23147 / 726 | — | 2.1–2.5 | 2.896 / 2.720 / 2.318 / 2.334 | 3.588 | 0.0155 [-0.0092, 0.0390] | NO-GAIN |
| opp_next | QB | 5.8 | 6.0 | [3.3, 9.7] | 3357 / 72 | — | 5.0–7.2 | 5.355 / 6.441 / 4.866 / 4.882 | 7.255 | 0.0152 [-0.0050, 0.0388] | NO-GAIN |
| opp_next | RB | 2.3 | 2.5 | [1.5, 3.4] | 6287 / 220 | — | 2.0–2.7 | 4.777 / 4.388 / 4.135 / 4.131 | 5.175 | -0.0040 [-0.0348, 0.0260] | NO-GAIN |
| opp_next | WR | 4.0 | 4.0 | [3.1, 5.1] | 9149 / 293 | — | 3.8–4.3 | 1.975 / 1.977 / 1.735 / 1.735 | 2.203 | 0.0004 [-0.0029, 0.0037] | NO-GAIN |
| opp_next | TE | 3.9 | 4.0 | [2.7, 5.7] | 3609 / 127 | — | 3.2–4.4 | 1.683 / 1.726 / 1.525 / 1.531 | 1.890 | 0.0057 [0.0013, 0.0101] | WORSE |
| opp_next | ALL | 4.1 | 4.0 | [3.0, 5.5] | 22402 / 712 | — | 3.8–4.7 | 3.221 / 3.282 / 2.844 / 2.855 | 4.249 | 0.0109 [0.0018, 0.0198] | WORSE |
| share_ros | WR | 2.8 | 3.0 | [2.3, 3.5] | 9437 / 296 | — | 2.6–3.1 | 0.045 / 0.042 / 0.036 / 0.036 | 0.046 | 0.0000 [-0.0001, 0.0002] | NO-GAIN |
| share_ros | TE | 2.5 | 2.5 | [1.8, 3.4] | 3099 / 105 | — | 2.3–2.8 | 0.040 / 0.036 / 0.032 / 0.032 | 0.040 | 0.0000 [-0.0001, 0.0002] | NO-GAIN |
| share_ros | ALL | 2.7 | 2.5 | [2.3, 3.3] | 12536 / 401 | — | 2.6–2.9 | 0.044 / 0.041 / 0.035 / 0.035 | 0.044 | 0.0000 [-0.0001, 0.0001] | NO-GAIN |
| share_next | WR | 3.2 | 3.0 | [2.5, 4.0] | 9115 / 291 | — | 3.0–3.3 | 0.051 / 0.050 / — / 0.044 | 0.056 | — | — |
| share_next | TE | 2.8 | 3.0 | [1.9, 4.2] | 3600 / 127 | — | 2.3–3.1 | 0.046 / 0.044 / — / 0.040 | 0.049 | — | — |
| share_next | ALL | 3.1 | 3.0 | [2.5, 3.8] | 12715 / 418 | — | 2.9–3.3 | 0.049 / 0.048 / — / 0.043 | 0.054 | — | — |

Arm S (study reproduction: first n played games, S-1 gp ≥ 8, crosswalk position):

| pos | k | 95% CI | rows / players | study |
|---|---|---|---|---|
| QB | 4.8 | [3.4, 7.2] | 2735 / 96 | 6.0 |
| RB | 2.9 | [2.4, 3.5] | 8497 / 378 | 3.0 |
| WR | 4.2 | [3.6, 4.9] | 11666 / 503 | 4.5 |
| TE | 4.0 | [3.3, 4.9] | 7787 / 293 | 5.5 |

**Diagnostics (reported, never pinned; arm P ROS points)**

Functional form — k fitted separately by n:

| pos | n 1–2 | n 3–4 | n 5–6 | n 7+ |
|---|---|---|---|---|
| QB | 3.0 (742) | 3.2 (642) | 1.9 (596) | 1.5 (1144) |
| RB | 2.2 (2081) | 2.8 (1970) | 2.9 (1872) | 3.0 (3290) |
| WR | 3.0 (2877) | 3.3 (2843) | 3.2 (2536) | 3.1 (4589) |
| TE | 3.7 (1834) | 3.4 (1768) | 2.7 (1698) | 2.8 (3195) |

Prior optimism — joint (c, k) with prior × c, c ∈ 0.80…1.10:

| pos | c* | k* (joint) | k (alone) | k moves | fold k | fold c | held-out MAE joint / k-only |
|---|---|---|---|---|---|---|---|
| QB | 0.82 | 5.2 | 2.6 | 2.6 | 4.7–5.7 | 0.82–0.84 | 3.612 / 3.903 |
| RB | 0.82 | 3.2 | 2.6 | 0.6 | 2.9–3.4 | 0.82–0.84 | 2.480 / 2.548 |
| WR | 0.80 | 4.4 | 3.1 | 1.3 | 4.2–4.6 | 0.80–0.80 | 2.437 / 2.558 |
| TE | 0.86 | 3.7 | 3.2 | 0.5 | 3.4–4.1 | 0.84–0.90 | 1.974 / 2.010 |

Exclusion bias — k on rows without a missed game in the window vs all rows (paired bootstrap of the difference):

| pos | rows all / without miss | k all | k without miss | difference [95% CI] | share of rows with a miss |
|---|---|---|---|---|---|
| QB | 3101 / 2462 | 2.6 | 2.4 | 0.2 [-0.6, 0.8] | 0.206 |
| RB | 8733 / 6483 | 2.6 | 2.9 | -0.3 [-0.7, 0.1] | 0.258 |
| WR | 12168 / 8976 | 3.3 | 3.4 | -0.1 [-0.5, 0.2] | 0.262 |
| TE | 8336 / 6208 | 3.2 | 3.5 | -0.3 [-0.8, 0.2] | 0.255 |

## Q2 — does opportunity + points beat points-only?

Arm P, `hasBaseline` rows. VE = volume × efficiency; G = points posterior + γ × opportunity increment. ΔMAE = form − points-only (negative = better), LOSO, clustered bootstrap. Decision: combine only where VE or G is BEATS on the primary population.

| horizon | pos | eligible rows (share of arm P) | MAE points-only / VE / G | VE Δ [CI] | VE | G Δ [CI] | G | role-change rows: VE / G | adopt |
|---|---|---|---|---|---|---|---|---|---|
| ros | QB | 2934 (0.73) | 3.885 / 3.847 / 3.888 | -0.0378 [-0.0842, 0.0111] | NO-GAIN | 0.0037 [-0.0527, 0.0901] | NO-GAIN | 62: NO-GAIN / NO-GAIN | none (display-only) |
| ros | RB | 5272 (0.48) | 3.206 / 3.216 / 3.216 | 0.0106 [-0.0216, 0.0437] | NO-GAIN | 0.0100 [0.0056, 0.0146] | WORSE | 969: NO-GAIN / WORSE | none (display-only) |
| ros | WR | 7623 (0.50) | 2.919 / 2.925 / 2.920 | 0.0067 [-0.0122, 0.0251] | NO-GAIN | 0.0011 [-0.0082, 0.0108] | NO-GAIN | 1050: NO-GAIN / NO-GAIN | none (display-only) |
| ros | TE | 2608 (0.26) | 3.019 / 3.015 / 3.019 | -0.0042 [-0.0367, 0.0274] | NO-GAIN | -0.0001 [-0.0165, 0.0176] | NO-GAIN | 306: NO-GAIN / NO-GAIN | none (display-only) |
| next | QB | 2684 (0.67) | 3.876 / 3.823 / 3.898 | -0.0530 [-0.1923, 0.0886] | NO-GAIN | 0.0224 [-0.0043, 0.0672] | NO-GAIN | 85: NO-GAIN / WORSE | none (display-only) |
| next | RB | 4714 (0.43) | 3.924 / 3.928 / 3.935 | 0.0036 [-0.0336, 0.0406] | NO-GAIN | 0.0109 [-0.0041, 0.0268] | NO-GAIN | 882: NO-GAIN / NO-GAIN | none (display-only) |
| next | WR | 7370 (0.48) | 3.303 / 3.265 / 3.288 | -0.0377 [-0.0735, -0.0024] | BEATS | -0.0149 [-0.0425, 0.0129] | NO-GAIN | 1129: BEATS / BEATS | VE |
| next | TE | 3017 (0.31) | 3.274 / 3.241 / 3.259 | -0.0336 [-0.0908, 0.0214] | NO-GAIN | -0.0151 [-0.0543, 0.0234] | NO-GAIN | 474: NO-GAIN / NO-GAIN | none (display-only) |

## Q3 — weak/strong split and projection confidence as the scaling variable

Arm P, points. M0 = k per position; M1 = k per position × band (S-1 opp/g below/above the position median over S-1 players with gp ≥ 8; RB/WR/TE); M2 = k per position × confidence tier (qualifying seasons: ≥ 5 high, ≥ 3 medium, else low). Held-out MAE; ΔMAE vs M0.

| horizon | pos | M0 k / MAE | M1 band k (MAE) Δ [CI] label | M2 tier k (MAE) Δ [CI] label | adopt |
|---|---|---|---|---|---|
| ros | QB | 2.6 / 3.903 | n/a (QB) | low 1.4 / medium 3.9 / high 3.0 (3.888) -0.0145 [-0.0758, 0.0404] NO-GAIN — a sub-cell INSUFFICIENT | none |
| ros | RB | 2.6 / 2.548 | weak 2.7 / strong 2.6 (2.550) 0.0025 [0.0006, 0.0045] WORSE | low 2.5 / medium 3.4 / high 1.9 (2.559) 0.0112 [-0.0015, 0.0234] NO-GAIN | none |
| ros | WR | 3.1 / 2.558 | strong 3.0 / weak 3.9 (2.556) -0.0020 [-0.0069, 0.0029] NO-GAIN | low 3.2 / medium 3.0 / high 3.2 (2.562) 0.0036 [0.0010, 0.0061] WORSE | none |
| ros | TE | 3.2 / 2.010 | strong 3.2 / weak 3.4 (2.011) 0.0015 [0.0001, 0.0031] WORSE | low 3.5 / medium 3.5 / high 2.6 (2.011) 0.0019 [-0.0033, 0.0071] NO-GAIN | none |
| next | QB | 4.1 / 3.822 | n/a (QB) | low 2.6 / medium 5.0 / high 4.7 (3.844) 0.0226 [-0.0143, 0.0595] NO-GAIN — a sub-cell INSUFFICIENT | none |
| next | RB | 4.0 / 3.147 | weak 6.3 / strong 3.6 (3.143) -0.0041 [-0.0174, 0.0091] NO-GAIN | low 5.3 / medium 3.3 / high 3.3 (3.165) 0.0179 [-0.0032, 0.0400] NO-GAIN | none |
| next | WR | 3.8 / 2.969 | strong 3.1 / weak 8.1 (2.943) -0.0251 [-0.0476, -0.0041] BEATS | low 4.4 / medium 4.1 / high 3.0 (2.966) -0.0020 [-0.0124, 0.0084] NO-GAIN | M1 |
| next | TE | 4.0 / 2.397 | strong 4.0 / weak 3.7 (2.399) 0.0028 [0.0003, 0.0054] WORSE | low 4.5 / medium 4.7 / high 2.7 (2.392) -0.0045 [-0.0187, 0.0095] NO-GAIN | none |

## Q4 — rookies and players without a ≥ 8-game prior season

Prior: rookie-path players use the SHIPPED rookie projection (calibration + games ladder + ceiling; no KTC multiplier historically); veteran-path X-short players use the frozen projection. Comparator: Phase 1's per-row k rule (`PHASE1_K`). ΔMAE = fitted − Phase 1 (negative = better). NO-GAIN pin rule: a cell that is NO-GAIN vs Phase 1 pins the pooled-positions (ALL) value of the same group × horizon, unless the cell's own k BEATS that pooled k out of sample (paired held-out ΔMAE, bootstrap CI — the "vs pooled" column) — then own k is pinned instead.

| group | horizon | pos | k (0.1) | 95% CI | rows / players | MAE fitted / Phase 1 | ΔMAE [CI] | label | vs pooled [CI] label |
|---|---|---|---|---|---|---|---|---|---|
| X-rookie0 | ros | QB | 3.3 | [1.4, 9.7] | 552 / 66 | 4.303 / 4.303 | 0.0004 [-0.2045, 0.2107] | NO-GAIN | 0.0478 [-0.0352, 0.1377] NO-GAIN (pooled pinned) |
| X-rookie0 | ros | RB | 2.5 | [1.6, 3.7] | 3065 / 331 | 2.648 / 2.661 | -0.0133 [-0.0322, 0.0064] | NO-GAIN | 0.0002 [-0.0090, 0.0103] NO-GAIN (pooled pinned) |
| X-rookie0 | ros | WR | 2.5 | [1.8, 3.5] | 4169 / 441 | 2.315 / 2.336 | -0.0209 [-0.0421, 0.0008] | NO-GAIN | -0.0013 [-0.0061, 0.0035] NO-GAIN (pooled pinned) |
| X-rookie0 | ros | TE | 2.9 | [1.7, 5.1] | 2029 / 225 | 1.766 / 1.787 | -0.0206 [-0.0424, 0.0010] | NO-GAIN | 0.0135 [0.0050, 0.0224] WORSE (pooled pinned) |
| X-rookie0 | ros | ALL | 2.7 | [2.1, 3.4] | 9815 / 1063 | 2.412 / 2.434 | -0.0223 [-0.0409, -0.0036] | BEATS | — |
| X-rookie0 | next | QB | INSUFFICIENT |  | 499 / 49 |  |  |  |  |
| X-rookie0 | next | RB | 6.3 | [3.8, 12.0] | 2422 / 229 | 3.252 / 3.225 | 0.0270 [-0.0158, 0.0719] | NO-GAIN | 0.0058 [-0.0056, 0.0174] NO-GAIN (pooled pinned) |
| X-rookie0 | next | WR | 4.2 | [2.9, 6.5] | 3415 / 316 | 2.626 / 2.640 | -0.0142 [-0.0493, 0.0204] | NO-GAIN | -0.0137 [-0.0456, 0.0184] NO-GAIN (pooled pinned) |
| X-rookie0 | next | TE | 5.6 | [2.5, 15.1] | 1736 / 170 | 2.101 / 2.098 | 0.0030 [-0.0166, 0.0228] | NO-GAIN | 0.0066 [-0.0117, 0.0250] NO-GAIN (pooled pinned) |
| X-rookie0 | next | ALL | 6.2 | [4.2, 9.7] | 8072 / 764 | 2.820 / 2.814 | 0.0059 [-0.0069, 0.0189] | NO-GAIN | — |
| X-rookie1p | ros | QB | 2.8 | [1.6, 5.0] | 952 / 101 | 4.014 / 4.148 | -0.1344 [-0.3150, 0.0479] | NO-GAIN | 0.0222 [-0.0076, 0.0547] NO-GAIN (pooled pinned) |
| X-rookie1p | ros | RB | 2.1 | [1.4, 3.1] | 2969 / 298 | 2.892 / 2.894 | -0.0023 [-0.0354, 0.0306] | NO-GAIN | 0.0025 [-0.0171, 0.0219] NO-GAIN (pooled pinned) |
| X-rookie1p | ros | WR | 3.0 | [2.2, 4.0] | 4384 / 439 | 2.321 / 2.351 | -0.0301 [-0.0570, -0.0038] | BEATS | — |
| X-rookie1p | ros | TE | 2.4 | [1.5, 3.7] | 2552 / 252 | 1.670 / 1.713 | -0.0428 [-0.0972, 0.0088] | NO-GAIN | 0.0016 [-0.0038, 0.0078] NO-GAIN (pooled pinned) |
| X-rookie1p | ros | ALL | 2.5 | [2.1, 3.1] | 10857 / 1089 | 2.467 / 2.507 | -0.0400 [-0.0653, -0.0141] | BEATS | — |
| X-rookie1p | next | QB | INSUFFICIENT |  | 653 / 54 |  |  |  |  |
| X-rookie1p | next | RB | 4.0 | [2.6, 6.0] | 2609 / 226 | 2.888 / 2.886 | 0.0014 [-0.0136, 0.0156] | NO-GAIN | 0.0105 [-0.0025, 0.0229] NO-GAIN (pooled pinned) |
| X-rookie1p | next | WR | 3.2 | [2.0, 5.1] | 3417 / 295 | 2.842 / 2.884 | -0.0420 [-0.1080, 0.0268] | NO-GAIN | 0.0043 [-0.0119, 0.0212] NO-GAIN (pooled pinned) |
| X-rookie1p | next | TE | 4.8 | [2.4, 9.1] | 2011 / 178 | 2.389 / 2.390 | -0.0012 [-0.0425, 0.0412] | NO-GAIN | 0.0182 [-0.0095, 0.0476] NO-GAIN (pooled pinned) |
| X-rookie1p | next | ALL | 3.7 | [2.9, 4.8] | 8690 / 752 | 2.838 / 2.876 | -0.0378 [-0.0697, -0.0056] | BEATS | — |
| X-short | ros | QB | INSUFFICIENT |  | 609 / 57 |  |  |  |  |
| X-short | ros | RB | 1.3 | [0.8, 2.3] | 1228 / 110 | 2.606 / 2.680 | -0.0737 [-0.1929, 0.0424] | NO-GAIN | 0.0224 [0.0022, 0.0429] WORSE (pooled pinned) |
| X-short | ros | WR | 1.1 | [0.7, 1.6] | 1662 / 162 | 2.091 / 2.213 | -0.1217 [-0.2494, -0.0042] | BEATS | — |
| X-short | ros | TE | 2.9 | [1.7, 5.5] | 898 / 89 | 1.751 / 1.757 | -0.0065 [-0.0428, 0.0342] | NO-GAIN | 0.0072 [-0.0731, 0.0847] NO-GAIN (pooled pinned) |
| X-short | ros | ALL | 1.4 | [1.1, 1.9] | 4397 / 418 | 2.421 / 2.553 | -0.1326 [-0.2202, -0.0469] | BEATS | — |
| X-short | next | QB | INSUFFICIENT |  | 462 / 36 |  |  |  |  |
| X-short | next | RB | INSUFFICIENT |  | 744 / 59 |  |  |  |  |
| X-short | next | WR | 0.6 | [0.1, 1.6] | 912 / 76 | 2.876 / 3.160 | -0.2841 [-0.5794, 0.0084] | NO-GAIN | -0.0423 [-0.2177, 0.1279] NO-GAIN (pooled pinned) |
| X-short | next | TE | INSUFFICIENT |  | 606 / 50 |  |  |  |  |
| X-short | next | ALL | 2.4 | [1.3, 4.4] | 2724 / 221 | 3.370 / 3.420 | -0.0498 [-0.1696, 0.0727] | NO-GAIN | — |

Opportunity for these players: **not measurable** — the app holds no projected-volume prior for them (D5).

## Q5 — opportunity baseline lookback

Population: rows where arm A (S-1, gp ≥ 4, opp/g ≥ 2.0) has no baseline but arm B (most recent of S-1…S-3 with gp ≥ 4) does — 933 rows, 102 player-seasons, 96 players. Arm A predicts by Phase 1's new-role shrink toward 0, `(n/(n+k))·obsOpp`; arm B blends with the older baseline. k is the in-fold pooled ROS-opportunity k per position. ΔMAE = B − A.

| scope | rows / players | MAE A / B | ΔMAE [CI] | label |
|---|---|---|---|---|
| pooled | 933 / 96 | 6.202 / 2.872 | -3.331 [-4.364, -2.411] | BEATS |
| QB | 189 / 23 | 16.311 / 5.923 | -10.388 [-13.741, -7.467] | BEATS |
| RB | 301 / 27 | 5.633 / 3.246 | -2.387 [-3.420, -1.257] | BEATS |
| WR | 311 / 32 | 2.191 / 1.424 | -0.767 [-1.432, -0.080] | BEATS |
| TE | 132 / 14 | 2.478 / 1.059 | -1.418 [-1.878, -0.941] | BEATS |

Stale-baseline k (fitted on the arm-B-only rows) vs the pooled k on those same rows:

| scope | rows / players | k (0.1) | 95% CI | ΔMAE stale-k − pooled-k [CI] | label |
|---|---|---|---|---|---|
| QB | 189 / 23 | INSUFFICIENT |  |  |  |
| RB | 301 / 27 | INSUFFICIENT |  |  |  |
| WR | 311 / 32 | INSUFFICIENT |  |  |  |
| TE | 132 / 14 | INSUFFICIENT |  |  |  |
| ALL | 933 / 96 | 1.4 | [0.6, 4.8] | 0.0077 [-0.1381, 0.1454] | NO-GAIN |

## Q6 — cross-position-fair usage-shift sort measure

Rows at W ∈ {3, 4, 5, 6} with a baseline and a points prior (9722 rows). Shift = posterior ROS opportunity − baseline, with the pinned K_ROS_OPP by position (QB 2.5, RB 1.5, WR 3.0, TE 3.5). Target = ROS PPG − points prior. Spearman is pooled across positions; the mix gap is the mean absolute position-share gap between the top 50 by the measure and the top 50 by the target, per (S, W). Highest Spearman wins; within 0.01, the smaller mix gap.

| measure | Spearman | mean top-50 mix gap | (S, W) groups |
|---|---|---|---|
| raw | 0.3002 | 0.0906 | 48 |
| relative | 0.3157 | 0.0588 | 48 |
| z | 0.3241 | 0.0719 | 48 |
| pointsEquivalent | 0.3260 | 0.0654 | 48 |

Answer: **pointsEquivalent** — within 0.01 of the best Spearman → smaller mix gap; within 0.01 of the best: pointsEquivalent, z.

## Q7 — depth-chart double count: freeze the prior or accept the live one

Arm P frozen at the S week-1 depth chart vs arm L re-derived with the depth chart of S week min(W+1, last). Each arm uses its own in-fold k. Residual = prediction − actual on held-out rows; promoted = live order < week-1 order or newly listed; demoted = live order > week-1 order or dropped from the chart.

| scope | rows / changed | k P / L | MAE P / L | ΔMAE (L − P) [CI] | label | L promoted mean resid [CI] | L demoted mean resid [CI] | P promoted [CI] | P demoted [CI] |
|---|---|---|---|---|---|---|---|---|---|
| pooled | 33677 / 12543 | 2.9 / 3.0 | 2.5390 / 2.5354 | -0.0037 [-0.0081, 0.0005] | NO-GAIN | 0.185 [0.002, 0.356] | 0.347 [0.148, 0.544] | 0.105 [-0.074, 0.279] | 0.459 [0.260, 0.661] |
| QB | 3124 / 270 | 2.6 / 2.7 | 3.9027 / 3.9063 | 0.0035 [-0.0033, 0.0108] | NO-GAIN | -0.501 [-2.184, 1.155] | -0.061 [-1.917, 2.191] | -0.765 [-2.403, 0.845] | 0.287 [-1.540, 2.512] |
| RB | 9213 / 2414 | 2.6 / 2.7 | 2.5476 / 2.5455 | -0.0021 [-0.0108, 0.0072] | NO-GAIN | -0.470 [-0.896, -0.065] | 0.287 [-0.176, 0.759] | -0.553 [-0.993, -0.141] | 0.404 [-0.066, 0.892] |
| WR | 12845 / 7322 | 3.1 / 3.2 | 2.5580 / 2.5519 | -0.0061 [-0.0143, 0.0019] | NO-GAIN | 0.475 [0.238, 0.709] | 0.494 [0.244, 0.759] | 0.386 [0.154, 0.616] | 0.603 [0.344, 0.872] |
| TE | 8495 / 2537 | 3.2 / 3.3 | 2.0095 / 2.0049 | -0.0046 [-0.0120, 0.0022] | NO-GAIN | 0.141 [-0.179, 0.445] | -0.008 [-0.387, 0.354] | 0.089 [-0.240, 0.398] | 0.082 [-0.297, 0.449] |

Rule (pre-registered): ACCEPT only if L BEATS P on held-out MAE AND L's promoted-row mean residual CI includes 0; else FREEZE. Decision on the pooled population: **FREEZE**.

FREEZE needs a frozen-prior source in the app — see .claude/tasks/in-season-evidence-2a-registry.md §D.4 (Phase 2b).

Depth-order changes per checkpoint week (§4.1 step 5: arm-P candidates whose live depth order differs from the frozen week-1 order):

| W | rows | changed | changed share |
|---|---|---|---|
| 1 | 3594 | 578 | 0.161 |
| 2 | 3594 | 936 | 0.260 |
| 3 | 3594 | 1118 | 0.311 |
| 4 | 3594 | 1235 | 0.344 |
| 5 | 3594 | 1348 | 0.375 |
| 6 | 3594 | 1436 | 0.400 |
| 7 | 3594 | 1459 | 0.406 |
| 8 | 3594 | 1538 | 0.428 |
| 9 | 3594 | 1652 | 0.460 |
| 10 | 3594 | 1679 | 0.467 |
| 11 | 3594 | 1713 | 0.477 |
| 12 | 3594 | 1718 | 0.478 |

## Q8 — which k set drives the dynasty score, which the season projection

Arm P. Each k is the LOSO-fitted value for its own horizon; "cross" applies the other horizon's fitted k to the same held-out rows. Penalty = cross MAE / native MAE − 1.

| pos | kROS | kNext | ROS rows: native / kNext MAE | penalty | next rows: native / kROS MAE | penalty | both < 1% | S+2 k (rows) | arm R next k |
|---|---|---|---|---|---|---|---|---|---|
| QB | 2.6 | 4.1 | 3.9027 / 3.9398 | 0.95% | 3.8216 / 3.8670 | 1.19% | no | 2.6 (2153) | 7.1 |
| RB | 2.6 | 4.0 | 2.5476 / 2.5634 | 0.62% | 3.1467 / 3.1643 | 0.56% | yes | 6.9 (4601) | 4.0 |
| WR | 3.1 | 3.8 | 2.5580 / 2.5660 | 0.31% | 2.9685 / 2.9723 | 0.13% | yes | 3.8 (7070) | 5.8 |
| TE | 3.2 | 4.0 | 2.0095 / 2.0155 | 0.30% | 2.3966 / 2.3982 | 0.07% | yes | 4.5 (4805) | 4.9 |

Rule: season projection → kROS; dynasty → kNext; if both cross-application penalties < 1%, one set would do. Not every position clears 1% on both, so the two sets stay separate.

## Q9 — QB starts arm (report-only)

The population the app applies the QB ROS k to with n = starts: every QB with a finite prior who was **not** his team's primary passer in that team's first REG game (the app's non-`original` QB). A start = a REG gamelog week where he is the primary passer; points are season-totals `weeklyPoints`; `startRos` needs ≥ 4 later starts. The comparator is each row's pinned QB k for its arm (K_ROS_POINTS / _SHORT / _ROOKIE0 / _ROOKIE1P).

| k (fit) | k (pin rule) | 95% CI | rows / QBs | player-seasons | ΔMAE vs pinned k | label |
|---|---|---|---|---|---|---|
| 3.5 | 3.5 | [2.2, 7.1] | 542 / 79 | 334 | 0.0313 [-0.0929, 0.1509] | NO-GAIN |

Rows by arm: X-rookie1p 416 · X-short 344 · P 314 · X-rookie0 306. Pinned comparators: P 2.5 · X-short 1.5 · X-rookie0 2.5 · X-rookie1p 2.5. Excluded: 0 start weeks missing a season-totals point (skipped), 0 player-seasons whose team has no schedule entry.

## Reconciliation (gamelogs ↔ season-totals)

Gate population: season-totals rows 2012–2025, non-`TEAM_`, QB/RB/WR/TE via the panel position resolver, gp ≥ 4, present in that season's gamelogs. 7032 of 7033 reconcile (0.99986; stop below 0.99); tolerance max(2, 3%) of season-totals opportunities, REG games only.

Failing player-seasons:

| season | sleeperId | pos | gamelogs | season-totals | diff |
|---|---|---|---|---|---|
| 2012 | 133 | RB | 19 | 0 | 19 |

Skill player-seasons (gp ≥ 4) absent from gamelogs (their opportunity / share cells are null) and each season's gamelogs `unmapped` count (team-target denominators omit those rows — a stated limitation):

| season | absent from gamelogs | gamelogs unmapped |
|---|---|---|
| 2012 | 12 | 165 |
| 2013 | 16 | 82 |
| 2014 | 14 | 15 |
| 2015 | 14 | 0 |
| 2016 | 4 | 4 |
| 2017 | 2 | 5 |
| 2018 | 6 | 2 |
| 2019 | 7 | 1 |
| 2020 | 7 | 0 |
| 2021 | 6 | 0 |
| 2022 | 6 | 0 |
| 2023 | 2 | 1 |
| 2024 | 5 | 1 |
| 2025 | 9 | 12 |

## Coverage

74459 evidence rows (n ≥ 1). Mid-season movers (> 1 distinct gamelogs team) are 158 of 3639 arm-P player-seasons (0.043). Rows with a played week lacking a gamelogs row: 26674.

| S | candidates | arm P | X-rookie0 | X-rookie1p | X-short | rows | movers (all / arm P) | attach drops |
|---|---|---|---|---|---|---|---|---|
| 2014 | 576 | 281 | 122 | 127 | 46 | 5956 | 16 / 8 | {"nonPositiveAnchor":11} |
| 2015 | 608 | 300 | 125 | 135 | 48 | 6042 | 23 / 14 | {"nonPositiveAnchor":12} |
| 2016 | 595 | 286 | 131 | 117 | 61 | 5992 | 14 / 10 | {"nonPositiveAnchor":7} |
| 2017 | 598 | 277 | 127 | 129 | 65 | 5942 | 19 / 10 | {"nonPositiveAnchor":1} |
| 2018 | 614 | 289 | 133 | 124 | 68 | 6159 | 26 / 16 | {"nonPositiveAnchor":3} |
| 2019 | 616 | 277 | 139 | 137 | 63 | 6133 | 22 / 13 | {"nonPositiveAnchor":2} |
| 2020 | 654 | 308 | 137 | 139 | 70 | 6480 | 12 / 10 | {"nonPositiveAnchor":2} |
| 2021 | 688 | 327 | 126 | 152 | 83 | 6493 | 26 / 20 | {"nonPositiveAnchor":4} |
| 2022 | 645 | 325 | 108 | 140 | 72 | 6366 | 28 / 20 | {"nonPositiveAnchor":4} |
| 2023 | 630 | 322 | 108 | 129 | 71 | 6261 | 12 / 9 | {"nonPositiveAnchor":7} |
| 2024 | 629 | 314 | 100 | 142 | 73 | 6291 | 19 / 10 | {"nonPositiveAnchor":7} |
| 2025 | 640 | 333 | 107 | 122 | 78 | 6344 | 23 / 18 | {"nonPositiveAnchor":5} |

### QB start share (report-only) and primary-passer coverage

Per season: the primary-passer coverage that gates the QB prior (stop below 0.99), and the preseason start share rebuilt from the S week-1 chart with the pinned chain (`reconstructQbPreseasonShares`; half-PPR S−1 PPG for the incumbent prior). A veteran backup with `depthStale` counts as `stale`, as the app does.

The chart is week 1 only, matching the frozen depth prior: a team missing from that week's chart (2017: MIA and TB, Hurricane Irma) is left out of the share counts, and a team whose order-1 slot is empty (TEN 2013–2014) counts its QBs as `no chart`.

| S | team-games with primary | rate | teams | incumbent | chain | stale | no chart | median chain share |
|---|---|---|---|---|---|---|---|---|
| 2014 | 509 / 512 | 0.9941 | 32 | 31 | 39 | 6 | 2 | 0.1558 |
| 2015 | 512 / 512 | 1.0000 | 32 | 32 | 44 | 5 | 0 | 0.1558 |
| 2016 | 512 / 512 | 1.0000 | 32 | 32 | 46 | 5 | 0 | 0.1345 |
| 2017 | 512 / 512 | 1.0000 | 30 | 30 | 40 | 3 | 0 | 0.1558 |
| 2018 | 512 / 512 | 1.0000 | 32 | 32 | 42 | 5 | 0 | 0.1534 |
| 2019 | 512 / 512 | 1.0000 | 32 | 32 | 41 | 5 | 0 | 0.1558 |
| 2020 | 512 / 512 | 1.0000 | 32 | 32 | 43 | 7 | 0 | 0.1131 |
| 2021 | 544 / 544 | 1.0000 | 32 | 32 | 39 | 4 | 0 | 0.1558 |
| 2022 | 542 / 542 | 1.0000 | 32 | 32 | 40 | 4 | 0 | 0.1131 |
| 2023 | 544 / 544 | 1.0000 | 32 | 32 | 37 | 7 | 0 | 0.1558 |
| 2024 | 544 / 544 | 1.0000 | 32 | 32 | 36 | 6 | 0 | 0.1558 |
| 2025 | 544 / 544 | 1.0000 | 32 | 32 | 46 | 5 | 0 | 0.1131 |

Totals: 382 team-seasons, 381 incumbent, 493 chain, 62 stale, 2 no chart.

## Excluded-population report

count = rows (pid, S, W with n >= 1) unless noted; player-season rows for n0/attachDropped/absentFromGamelogs; mean prior = pointsPrior where one exists

**Player-seasons with n = 0 at every checkpoint (no game in weeks 1–12)**

| arm | pos | count | players | mean prior | mean n | mean obs − prior |
|---|---|---|---|---|---|---|
| P | QB | 7 | 7 | 11.66 | 0.00 | — |
| P | RB | 28 | 28 | 4.91 | 0.00 | — |
| P | WR | 30 | 29 | 3.76 | 0.00 | — |
| P | TE | 20 | 20 | 2.12 | 0.00 | — |
| X-rookie0 | QB | 22 | 22 | 13.78 | 0.00 | — |
| X-rookie0 | RB | 45 | 45 | 3.48 | 0.00 | — |
| X-rookie0 | WR | 86 | 86 | 3.00 | 0.00 | — |
| X-rookie0 | TE | 36 | 36 | 1.86 | 0.00 | — |
| X-rookie1p | QB | 58 | 42 | 9.23 | 0.00 | — |
| X-rookie1p | RB | 22 | 22 | 5.13 | 0.00 | — |
| X-rookie1p | WR | 49 | 48 | 3.20 | 0.00 | — |
| X-rookie1p | TE | 23 | 23 | 2.05 | 0.00 | — |
| X-short | QB | 23 | 22 | 13.75 | 0.00 | — |
| X-short | RB | 22 | 21 | 3.68 | 0.00 | — |
| X-short | WR | 20 | 19 | 4.35 | 0.00 | — |
| X-short | TE | 17 | 17 | 1.58 | 0.00 | — |

**Rows dropped for rosGames < 4 — season ended early (last played week ≤ W+2)**

| arm | pos | count | players | mean prior | mean n | mean obs − prior |
|---|---|---|---|---|---|---|
| P | QB | 362 | 53 | 18.00 | 4.87 | -5.37 |
| P | RB | 1017 | 141 | 8.41 | 4.31 | -2.43 |
| P | WR | 1506 | 216 | 6.64 | 4.64 | -1.86 |
| P | TE | 737 | 111 | 4.40 | 4.80 | -0.60 |
| X-rookie0 | QB | 105 | 20 | 14.33 | 3.66 | -5.42 |
| X-rookie0 | RB | 470 | 84 | 4.33 | 3.68 | -1.79 |
| X-rookie0 | WR | 599 | 109 | 3.58 | 3.51 | -1.83 |
| X-rookie0 | TE | 344 | 59 | 2.48 | 3.62 | -0.84 |
| X-rookie1p | QB | 373 | 62 | 10.00 | 2.26 | -4.64 |
| X-rookie1p | RB | 546 | 94 | 4.99 | 3.82 | -1.68 |
| X-rookie1p | WR | 706 | 116 | 3.87 | 3.62 | -1.35 |
| X-rookie1p | TE | 381 | 58 | 2.76 | 3.58 | -1.38 |
| X-short | QB | 288 | 33 | 13.99 | 2.80 | -7.22 |
| X-short | RB | 377 | 57 | 5.58 | 3.17 | -2.89 |
| X-short | WR | 433 | 65 | 5.19 | 3.41 | -2.40 |
| X-short | TE | 279 | 47 | 3.20 | 3.54 | -0.91 |

**Rows dropped for rosGames < 4 — other**

| arm | pos | count | players | mean prior | mean n | mean obs − prior |
|---|---|---|---|---|---|---|
| P | QB | 403 | 75 | 16.68 | 4.17 | -6.20 |
| P | RB | 686 | 187 | 6.99 | 5.11 | -1.50 |
| P | WR | 962 | 269 | 6.39 | 5.25 | -1.39 |
| P | TE | 457 | 133 | 4.56 | 5.35 | -0.70 |
| X-rookie0 | QB | 121 | 35 | 14.31 | 3.09 | -8.91 |
| X-rookie0 | RB | 412 | 130 | 4.67 | 3.99 | -2.39 |
| X-rookie0 | WR | 489 | 141 | 3.58 | 3.76 | -1.78 |
| X-rookie0 | TE | 259 | 85 | 2.51 | 3.76 | -1.24 |
| X-rookie1p | QB | 601 | 83 | 10.67 | 2.58 | -6.08 |
| X-rookie1p | RB | 379 | 114 | 4.96 | 4.23 | -1.49 |
| X-rookie1p | WR | 537 | 143 | 3.75 | 3.92 | -1.93 |
| X-rookie1p | TE | 265 | 84 | 2.48 | 4.36 | -1.09 |
| X-short | QB | 565 | 51 | 12.18 | 2.46 | -7.33 |
| X-short | RB | 189 | 57 | 6.27 | 3.53 | -3.21 |
| X-short | WR | 224 | 76 | 4.31 | 4.09 | -1.68 |
| X-short | TE | 154 | 45 | 3.41 | 4.45 | -0.72 |

**Rows with no next-season outcome (S+1 absent or gp < 6; S ≤ 2024)**

| arm | pos | count | players | mean prior | mean n | mean obs − prior |
|---|---|---|---|---|---|---|
| P | QB | 782 | 67 | 17.40 | 4.37 | -4.16 |
| P | RB | 3193 | 246 | 6.43 | 4.82 | -1.22 |
| P | WR | 3981 | 308 | 5.97 | 4.62 | -1.64 |
| P | TE | 2245 | 171 | 3.86 | 4.91 | -0.97 |
| X-rookie0 | QB | 200 | 27 | 13.46 | 2.73 | -7.96 |
| X-rookie0 | RB | 1197 | 134 | 4.56 | 3.74 | -2.47 |
| X-rookie0 | WR | 1404 | 167 | 3.60 | 3.55 | -1.78 |
| X-rookie0 | TE | 731 | 85 | 2.56 | 3.55 | -1.12 |
| X-rookie1p | QB | 1123 | 89 | 10.26 | 2.45 | -5.00 |
| X-rookie1p | RB | 1007 | 104 | 4.65 | 3.92 | -1.80 |
| X-rookie1p | WR | 1748 | 172 | 3.61 | 3.88 | -1.57 |
| X-rookie1p | TE | 976 | 93 | 2.35 | 4.08 | -1.27 |
| X-short | QB | 886 | 48 | 13.17 | 2.58 | -7.23 |
| X-short | RB | 922 | 83 | 6.02 | 3.49 | -2.95 |
| X-short | WR | 1175 | 107 | 5.53 | 4.17 | -2.53 |
| X-short | TE | 632 | 60 | 3.16 | 3.99 | -0.85 |

**Rows with a missed game in the window (kept; used in the Q1(c) diagnostic)**

| arm | pos | count | players | mean prior | mean n | mean obs − prior |
|---|---|---|---|---|---|---|
| P | QB | 1246 | 91 | 17.62 | 4.15 | -6.06 |
| P | RB | 3402 | 266 | 7.77 | 4.67 | -1.38 |
| P | WR | 4879 | 373 | 7.19 | 4.79 | -1.51 |
| P | TE | 2968 | 216 | 5.09 | 4.92 | -0.67 |
| X-rookie0 | QB | 529 | 72 | 15.20 | 3.50 | -7.11 |
| X-rookie0 | RB | 1869 | 260 | 5.07 | 3.83 | -2.15 |
| X-rookie0 | WR | 2763 | 378 | 4.14 | 3.90 | -1.52 |
| X-rookie0 | TE | 1333 | 189 | 2.71 | 3.65 | -1.35 |
| X-rookie1p | QB | 1325 | 112 | 10.62 | 2.44 | -5.36 |
| X-rookie1p | RB | 1683 | 222 | 5.05 | 4.05 | -1.13 |
| X-rookie1p | WR | 2542 | 315 | 4.23 | 4.02 | -0.98 |
| X-rookie1p | TE | 1330 | 174 | 2.81 | 4.08 | -0.91 |
| X-short | QB | 1159 | 64 | 13.03 | 2.58 | -7.22 |
| X-short | RB | 1006 | 118 | 6.07 | 3.47 | -2.42 |
| X-short | WR | 1155 | 136 | 5.05 | 3.83 | -2.18 |
| X-short | TE | 589 | 79 | 3.87 | 3.63 | -1.13 |

**Veteran-path player-seasons dropped by attachFactorMultipliers (no points prior)**

| arm | pos | count | players | mean prior | mean n | mean obs − prior |
|---|---|---|---|---|---|---|
| P | QB | 14 | 3 | — | — | — |
| P | RB | 8 | 6 | — | — | — |
| P | WR | 4 | 3 | — | — | — |
| P | TE | 19 | 12 | — | — | — |
| X-short | QB | 3 | 1 | — | — | — |
| X-short | RB | 4 | 4 | — | — | — |
| X-short | WR | 1 | 1 | — | — | — |
| X-short | TE | 12 | 9 | — | — | — |

**Player-seasons absent from gamelogs (opportunity / share cells null)**

| arm | pos | count | players | mean prior | mean n | mean obs − prior |
|---|---|---|---|---|---|---|
| P | QB | 12 | 2 | — | — | — |
| P | RB | 18 | 14 | 2.29 | — | — |
| P | WR | 23 | 22 | 3.20 | — | — |
| P | TE | 39 | 29 | 1.19 | — | — |
| X-rookie0 | RB | 31 | 31 | 3.48 | — | — |
| X-rookie0 | WR | 55 | 55 | 2.93 | — | — |
| X-rookie0 | TE | 43 | 43 | 1.80 | — | — |
| X-rookie1p | QB | 8 | 7 | 9.05 | — | — |
| X-rookie1p | RB | 14 | 13 | 3.76 | — | — |
| X-rookie1p | WR | 38 | 35 | 2.85 | — | — |
| X-rookie1p | TE | 45 | 43 | 2.13 | — | — |
| X-short | QB | 3 | 2 | 9.75 | — | — |
| X-short | RB | 8 | 8 | 3.56 | — | — |
| X-short | WR | 14 | 14 | 2.56 | — | — |
| X-short | TE | 31 | 28 | 1.93 | — | — |

## Limitations

- **Basis is league (D-46).** Prior, evidence and outcome are on the app's load-time rescored basis; the verdict is `grading/<date>-league-basis-verdict.md`.
- **The prior is the reconstruction, not the app's live number.** It is faithful in 9 of 13 steps, with the divergences documented in `grading/2026-09-06-fullpipeline-verdict.md`. The depth factor uses the S week-1 chart as a stand-in for a pre-season capture; qbQuality is a flat 50.
- **The rookie prior has no KTC multiplier historically** (KTC history starts 2026-05-18).
- **The QB prior is the app's starter level, not the share-weighted projection.** QB rows blend the share-free starter level (depth model `qb-takeover`); a first-year QB with draft capital who was not his team's game-1 primary passer blends the pinned rookie starter level, a game-1 starter keeps the ceiled rookie-path level (the app's injured-original edge case is not reproducible from history), and the next-season horizon keeps the ceiled rookie-path level for rookies. The start share is mirrored and reported (`coverage.qbStart`) but never enters a fitted prior.
- **Season-totals S `team` is the season's dominant team.** It reaches teamOffense's current-team resolution and the forward-mover neutralization (`classifyAttributionCohort` reads `teamsByYear[S]`), so a player traded after W leaks future information into the prior. Accepted, not fixed: 158 of 3639 arm-P player-seasons are movers (0.043).
- **Team-target denominators omit gamelogs `unmapped` rows** (per-season counts above), so target shares are slightly overstated in those seasons.
- **No injury-severity model.** `missedInWindow` is schedule-based and says only that a game was missed, not why; the Q1(c) diagnostic reports how much k moves when those rows are dropped.
- **Opportunity and target-share cells are gamelogs-derived** (weekly split only, behind the reconciliation gate); the S-1 opportunity baseline comes from season-totals.
- **The Q2 arm-P population is the primary population** (frozen projection prior, `hasBaseline`); the eligible-row share is reported per cell.

**Reproduce:** `node bin/backtest.mjs --inseason --write`
