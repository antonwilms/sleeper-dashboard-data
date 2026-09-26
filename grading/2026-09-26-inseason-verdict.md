# In-season evidence — Phase 2a graded backtest

Generated 2026-09-26T09:31:09.621Z. Basis **half_ppr** (pinned; a league-basis refit belongs to the custom-basis backlog item). Outcome seasons 2014–2025, calendar checkpoints W = 1–12, n = games played, leave-one-season-out, player-clustered bootstrap (4000 resamples, seed 12345, mulberry32), k grid 0–40 in tenths.

## Answers

- **Q1 — k with the real reconstructed projection as prior.** ROS points (arm P): QB 2.8 · RB 2.7 · WR 3.2 · TE 3.7 (study 6 · 3 · 4.5 · 5.5; arm S reproduces the study's own QB 5.0 · RB 3.0 · WR 4.2 · TE 4.5). Next-season points (arm P): QB 4.4 · RB 4.2 · WR 4.0 · TE 4.6 (study 7.5 · 4.5 · 6.5 · 6.5). Fitted k vs study k over the single-position cells: 18 NO-GAIN, 4 BEATS, 4 WORSE; BEATS: pointsP_ros WR, pointsP_ros TE, pointsR_ros WR, pointsR_ros TE; WORSE: pointsP_next RB, pointsR_ros RB, pointsR_next QB, opp_next TE. Grid-boundary fits: none.
- **Q2 — opportunity + points vs points-only (out of sample).** Neither VE nor G BEATS points-only on the primary population in any of the 8 position × horizon cells — opportunity stays display-only. Secondary (role-change rows) BEATS: WR next VE, WR next G.
- **Q3 — weak/strong split and projection confidence.** No band or tier split BEATS the per-position k in any position × horizon cell — none adopted. See §Q3 for each label.
- **Q4 — rookies and players without a ≥ 8-game prior season.** Fitted k vs Phase 1's rule over the position cells: 14 NO-GAIN, 3 BEATS, 1 WORSE; INSUFFICIENT position cells (pooled fallback): X-rookie0 next QB, X-rookie1p next QB, X-short ros QB, X-short next QB, X-short next RB, X-short next TE. Opportunity for these players: not measurable (no projected-volume prior).
- **Q5 — baseline lookback.** Arm B (last season with ≥ 4 games): pooled ROS-opportunity ΔMAE (B − A) -3.331 [-4.364, -2.411] → BEATS, on 933 rows / 102 player-seasons that Phase 1 would flag "new role" and arm B removes. K_ROS_OPP_STALE: not adopted (a separate k does not BEAT the pooled k on those rows).
- **Q6 — cross-position usage-shift sort measure.** Winner: **relative** (within 0.01 of the best Spearman → smaller mix gap). Spearman vs realised ROS − prior: raw 0.302 · relative 0.319 · z 0.323 · pointsEquivalent 0.326; mean top-50 position-mix gap: raw 0.087 · relative 0.060 · z 0.072 · pointsEquivalent 0.065.
- **Q7 — depth-chart double count.** **FREEZE**: live-depth prior vs frozen ΔMAE -0.0037 [-0.0075, 0.0001] → NO-GAIN; arm L's promoted-row mean residual 0.179 [0.024, 0.338] (excludes 0). Fitted k: P 3.0, L 3.1; 37% of arm-P rows have a different depth order at their checkpoint.
- **Q8 — which k drives which.** Season projection → kROS QB 2.8 · RB 2.7 · WR 3.2 · TE 3.7; dynasty → kNext QB 4.4 · RB 4.2 · WR 4.0 · TE 4.6. Cross-application MAE penalty (kNext on ROS / kROS on next): QB 0.84% / 1.11% · RB 0.85% / 0.61% · WR 0.41% / 0.10% · TE 0.24% / 0.02%. Both penalties < 1% for RB, WR, TE; not at every position, so the two sets stay separate. S+2 diagnostic k: QB 2.8 · RB 7.6 · WR 3.8 · TE 4.9; arm R next-season k (K_DYN_POINTS_HISTORY): QB 7.1 · RB 4.1 · WR 5.8 · TE 5.3.

## Constants table

What Phase 2b pins. `k` is the pinned value (fitted k rounded to 0.5, or the §4.5 fallback); `basis` says which. Study / Phase 1 column: the study k for the single-signal constants, Phase 1's per-row rule value for the rookie / short-history subgroups.

| name | cell | k | kFit | 95% CI | rows / players | basis | study / Phase 1 |
|---|---|---|---|---|---|---|---|
| `K_ROS_POINTS` | QB | 3.0 | 2.8 | [2.0, 3.9] | 3124 / 78 | fitted | 6.0 |
| `K_ROS_POINTS` | RB | 2.5 | 2.7 | [2.1, 3.6] | 9208 / 308 | fitted | 3.0 |
| `K_ROS_POINTS` | WR | 3.0 | 3.2 | [2.7, 3.8] | 12751 / 403 | fitted | 4.5 |
| `K_ROS_POINTS` | TE | 3.5 | 3.7 | [3.0, 4.7] | 8483 / 240 | fitted | 5.5 |
| `K_DYN_POINTS` | QB | 4.5 | 4.4 | [3.1, 6.0] | 2726 / 61 | fitted | 7.5 |
| `K_DYN_POINTS` | RB | 4.5 | 4.2 | [2.8, 6.5] | 6828 / 221 | study | 4.5 |
| `K_DYN_POINTS` | WR | 4.0 | 4.0 | [3.1, 5.1] | 9915 / 302 | fitted | 6.5 |
| `K_DYN_POINTS` | TE | 4.5 | 4.6 | [3.3, 6.4] | 6471 / 178 | fitted | 6.5 |
| `K_DYN_POINTS_HISTORY` | QB | 7.5 | 7.1 | [4.6, 11.3] | 3193 / 70 | study | 7.5 |
| `K_DYN_POINTS_HISTORY` | RB | 4.0 | 4.1 | [3.1, 5.4] | 8871 / 275 | fitted | 4.5 |
| `K_DYN_POINTS_HISTORY` | WR | 6.0 | 5.8 | [4.7, 7.0] | 12506 / 365 | fitted | 6.5 |
| `K_DYN_POINTS_HISTORY` | TE | 5.5 | 5.3 | [4.1, 6.9] | 8068 / 224 | fitted | 6.5 |
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
| `K_ROS_POINTS_ROOKIE0` | QB | 6.0 | 5.8 | [2.4, 17.9] | 552 / 66 | fitted — NO-GAIN vs Phase 1: fitted k pinned anyway (measured, where Phase 1's was not) | 6.0 |
| `K_ROS_POINTS_ROOKIE0` | RB | 2.5 | 2.6 | [1.7, 3.8] | 3065 / 331 | fitted — NO-GAIN vs Phase 1: fitted k pinned anyway (measured, where Phase 1's was not) | 3.0 |
| `K_ROS_POINTS_ROOKIE0` | WR | 2.5 | 2.4 | [1.8, 3.3] | 4169 / 441 | fitted | 3.5 |
| `K_ROS_POINTS_ROOKIE0` | TE | 3.0 | 3.2 | [1.9, 5.6] | 2029 / 225 | fitted — NO-GAIN vs Phase 1: fitted k pinned anyway (measured, where Phase 1's was not) | 4.0 |
| `K_DYN_POINTS_ROOKIE0` | QB | 6.5 | 6.3 | [4.3, 10.0] | 8072 / 764 | pooled — NO-GAIN vs Phase 1: fitted k pinned anyway (measured, where Phase 1's was not) | 7.5 |
| `K_DYN_POINTS_ROOKIE0` | RB | 6.5 | 6.6 | [3.9, 12.5] | 2422 / 229 | fitted — NO-GAIN vs Phase 1: fitted k pinned anyway (measured, where Phase 1's was not) | 4.5 |
| `K_DYN_POINTS_ROOKIE0` | WR | 4.5 | 4.3 | [2.9, 6.5] | 3415 / 316 | fitted — NO-GAIN vs Phase 1: fitted k pinned anyway (measured, where Phase 1's was not) | 6.5 |
| `K_DYN_POINTS_ROOKIE0` | TE | 5.5 | 5.4 | [2.5, 14.2] | 1736 / 170 | fitted — NO-GAIN vs Phase 1: fitted k pinned anyway (measured, where Phase 1's was not) | 6.5 |
| `K_ROS_POINTS_ROOKIE1P` | QB | 3.0 | 2.8 | [1.7, 5.1] | 952 / 101 | fitted — NO-GAIN vs Phase 1: fitted k pinned anyway (measured, where Phase 1's was not) | 6.0 |
| `K_ROS_POINTS_ROOKIE1P` | RB | 2.0 | 2.2 | [1.4, 3.1] | 2969 / 298 | fitted — NO-GAIN vs Phase 1: fitted k pinned anyway (measured, where Phase 1's was not) | 3.0 |
| `K_ROS_POINTS_ROOKIE1P` | WR | 3.0 | 3.0 | [2.2, 4.0] | 4384 / 439 | fitted | 3.5 |
| `K_ROS_POINTS_ROOKIE1P` | TE | 2.5 | 2.7 | [1.7, 4.3] | 2552 / 252 | fitted — NO-GAIN vs Phase 1: fitted k pinned anyway (measured, where Phase 1's was not) | 4.0 |
| `K_DYN_POINTS_ROOKIE1P` | QB | 3.5 | 3.7 | [2.9, 4.8] | 8690 / 752 | pooled | 7.5 |
| `K_DYN_POINTS_ROOKIE1P` | RB | 4.0 | 4.0 | [2.6, 6.0] | 2609 / 226 | fitted — NO-GAIN vs Phase 1: fitted k pinned anyway (measured, where Phase 1's was not) | 4.5 |
| `K_DYN_POINTS_ROOKIE1P` | WR | 3.0 | 3.1 | [2.0, 5.0] | 3417 / 295 | fitted — NO-GAIN vs Phase 1: fitted k pinned anyway (measured, where Phase 1's was not) | 6.5 |
| `K_DYN_POINTS_ROOKIE1P` | TE | 5.0 | 5.2 | [2.7, 9.9] | 2011 / 178 | fitted — NO-GAIN vs Phase 1: fitted k pinned anyway (measured, where Phase 1's was not) | 6.5 |
| `K_ROS_POINTS_SHORT` | QB | 1.5 | 1.5 | [1.2, 2.0] | 4376 / 415 | pooled | 6.0 |
| `K_ROS_POINTS_SHORT` | RB | 1.5 | 1.3 | [0.8, 2.4] | 1228 / 110 | fitted — NO-GAIN vs Phase 1: fitted k pinned anyway (measured, where Phase 1's was not) | 3.0 |
| `K_ROS_POINTS_SHORT` | WR | 1.0 | 1.1 | [0.7, 1.8] | 1641 / 159 | fitted | 3.5 |
| `K_ROS_POINTS_SHORT` | TE | 4.0 | 3.6 | [2.2, 6.8] | 898 / 89 | study — WORSE vs Phase 1: Phase 1 value pinned | 4.0 |
| `K_DYN_POINTS_SHORT` | QB | 2.5 | 2.7 | [1.5, 4.9] | 2707 / 220 | pooled — NO-GAIN vs Phase 1: fitted k pinned anyway (measured, where Phase 1's was not) | 7.5 |
| `K_DYN_POINTS_SHORT` | RB | 2.5 | 2.7 | [1.5, 4.9] | 2707 / 220 | pooled — NO-GAIN vs Phase 1: fitted k pinned anyway (measured, where Phase 1's was not) | 4.5 |
| `K_DYN_POINTS_SHORT` | WR | 0.5 | 0.7 | [0.2, 2.0] | 907 / 75 | fitted — NO-GAIN vs Phase 1: fitted k pinned anyway (measured, where Phase 1's was not) | 6.5 |
| `K_DYN_POINTS_SHORT` | TE | 2.5 | 2.7 | [1.5, 4.9] | 2707 / 220 | pooled — NO-GAIN vs Phase 1: fitted k pinned anyway (measured, where Phase 1's was not) | 6.5 |

Also in the constants file: `combination` = null (Q2 adopted nothing); `sortMeasure` = `relative` with the pinned K_ROS_OPP by position as its shrink parameters; `fit.prior` = frozen; `fit.opportunityBaseline` = B.

## Q1 — k per signal × position × horizon

Prior: arm P = the frozen reconstructed projection (S week-1 depth chart); arm R = raw S-1 PPG; opportunity and target share = raw S-1 baseline (the app holds no projected-volume prior). MAE columns are held-out (LOSO); prior-only / observed-only / study-k are computed on the same rows. ΔMAE = fitted − study (negative = fitted better).

| cell | pos | k (0.1) | pinned (0.5) | 95% CI | rows / players | boundary | fold k range | MAE prior / obs / study / fitted | RMSE fitted | ΔMAE vs study [CI] | label |
|---|---|---|---|---|---|---|---|---|---|---|---|
| pointsP_ros | QB | 2.8 | 3.0 | [2.0, 3.9] | 3124 / 78 | — | 2.5–3.0 | 4.251 / 4.111 / 3.559 / 3.487 | 4.386 | -0.0716 [-0.1473, 0.0079] | NO-GAIN |
| pointsP_ros | RB | 2.7 | 2.5 | [2.1, 3.6] | 9208 / 308 | — | 2.5–3.0 | 2.879 / 2.647 / 2.319 / 2.321 | 3.243 | 0.0018 [-0.0033, 0.0068] | NO-GAIN |
| pointsP_ros | WR | 3.2 | 3.0 | [2.7, 3.8] | 12751 / 403 | — | 3.0–3.3 | 2.885 / 2.741 / 2.317 / 2.301 | 3.035 | -0.0163 [-0.0290, -0.0032] | BEATS |
| pointsP_ros | TE | 3.7 | 3.5 | [3.0, 4.7] | 8483 / 240 | — | 3.6–3.9 | 1.947 / 1.901 / 1.617 / 1.604 | 2.268 | -0.0131 [-0.0244, -0.0016] | BEATS |
| pointsP_ros | ALL | 3.0 | 3.0 | [2.7, 3.4] | 33566 / 1029 | — | 2.9–3.1 | 2.773 / 2.630 / 2.256 / 2.239 | 3.077 | -0.0176 [-0.0278, -0.0076] | BEATS |
| pointsP_next | QB | 4.4 | 4.5 | [3.1, 6.0] | 2726 / 61 | — | 4.0–4.7 | 4.022 / 4.379 / 3.421 / 3.386 | 4.313 | -0.0343 [-0.0963, 0.0274] | NO-GAIN |
| pointsP_next | RB | 4.2 | 4.0 | [2.8, 6.5] | 6828 / 221 | — | 3.6–4.8 | 3.140 / 3.268 / 2.845 / 2.854 | 3.900 | 0.0087 [0.0014, 0.0161] | WORSE |
| pointsP_next | WR | 4.0 | 4.0 | [3.1, 5.1] | 9915 / 302 | — | 3.7–4.2 | 3.129 / 3.143 / 2.708 / 2.691 | 3.441 | -0.0170 [-0.0428, 0.0082] | NO-GAIN |
| pointsP_next | TE | 4.6 | 4.5 | [3.3, 6.4] | 6471 / 178 | — | 4.4–4.9 | 2.103 / 2.166 / 1.859 / 1.852 | 2.527 | -0.0069 [-0.0228, 0.0087] | NO-GAIN |
| pointsP_next | ALL | 4.2 | 4.0 | [3.5, 4.9] | 25940 / 761 | — | 3.9–4.4 | 2.970 / 3.062 / 2.607 / 2.595 | 3.471 | -0.0125 [-0.0251, -0.0005] | BEATS |
| pointsR_ros | QB | 4.7 | 4.5 | [3.2, 7.3] | 3673 / 92 | — | 4.4–4.9 | 3.470 / 3.914 / 3.115 / 3.122 | 4.051 | 0.0069 [-0.0166, 0.0286] | NO-GAIN |
| pointsR_ros | RB | 3.0 | 3.0 | [2.4, 3.7] | 11453 / 363 | — | 2.8–3.2 | 2.915 / 2.716 / 2.349 / 2.350 | 3.268 | 0.0019 [0.0004, 0.0034] | WORSE |
| pointsR_ros | WR | 4.1 | 4.0 | [3.5, 4.8] | 15993 / 491 | — | 4.0–4.2 | 2.692 / 2.693 / 2.224 / 2.220 | 2.902 | -0.0032 [-0.0064, 0.0000] | BEATS |
| pointsR_ros | TE | 4.3 | 4.5 | [3.5, 5.2] | 10367 / 282 | — | 4.1–4.5 | 1.848 / 1.861 / 1.540 / 1.533 | 2.168 | -0.0069 [-0.0138, -0.0003] | BEATS |
| pointsR_ros | ALL | 3.8 | 4.0 | [3.4, 4.3] | 41486 / 1227 | — | 3.7–3.9 | 2.611 / 2.599 / 2.166 / 2.166 | 2.973 | -0.0005 [-0.0064, 0.0054] | NO-GAIN |
| pointsR_next | QB | 7.1 | 7.0 | [4.6, 11.3] | 3193 / 70 | — | 6.6–8.7 | 3.271 / 4.163 / 2.990 / 3.001 | 3.971 | 0.0112 [0.0015, 0.0215] | WORSE |
| pointsR_next | RB | 4.1 | 4.0 | [3.1, 5.4] | 8871 / 275 | — | 3.8–4.3 | 3.252 / 3.254 / 2.857 / 2.859 | 3.871 | 0.0027 [-0.0032, 0.0088] | NO-GAIN |
| pointsR_next | WR | 5.8 | 6.0 | [4.7, 7.0] | 12506 / 365 | — | 5.6–5.9 | 2.904 / 3.114 / 2.583 / 2.581 | 3.291 | -0.0027 [-0.0078, 0.0021] | NO-GAIN |
| pointsR_next | TE | 5.3 | 5.5 | [4.1, 6.9] | 8068 / 224 | — | 4.9–5.6 | 2.078 / 2.168 / 1.840 / 1.834 | 2.509 | -0.0053 [-0.0131, 0.0024] | NO-GAIN |
| pointsR_next | ALL | 5.3 | 5.5 | [4.6, 6.1] | 32638 / 933 | — | 5.2–5.6 | 2.831 / 3.021 / 2.514 / 2.515 | 3.366 | 0.0016 [-0.0042, 0.0073] | NO-GAIN |
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
| QB | 5.0 | [3.5, 7.4] | 2735 / 96 | 6.0 |
| RB | 3.0 | [2.5, 3.7] | 8497 / 378 | 3.0 |
| WR | 4.2 | [3.6, 4.9] | 11666 / 503 | 4.5 |
| TE | 4.5 | [3.7, 5.4] | 7787 / 293 | 5.5 |

**Diagnostics (reported, never pinned; arm P ROS points)**

Functional form — k fitted separately by n:

| pos | n 1–2 | n 3–4 | n 5–6 | n 7+ |
|---|---|---|---|---|
| QB | 3.2 (742) | 3.4 (642) | 2.1 (596) | 1.7 (1144) |
| RB | 2.3 (2084) | 2.8 (1971) | 3.0 (1869) | 3.0 (3284) |
| WR | 3.0 (2857) | 3.4 (2820) | 3.2 (2516) | 3.2 (4558) |
| TE | 4.2 (1832) | 4.1 (1766) | 3.4 (1696) | 3.3 (3189) |

Prior optimism — joint (c, k) with prior × c, c ∈ 0.80…1.10:

| pos | c* | k* (joint) | k (alone) | k moves | fold k | fold c | held-out MAE joint / k-only |
|---|---|---|---|---|---|---|---|
| QB | 0.84 | 5.5 | 2.8 | 2.7 | 4.8–6.0 | 0.82–0.84 | 3.251 / 3.487 |
| RB | 0.82 | 3.2 | 2.7 | 0.5 | 3.0–3.5 | 0.80–0.84 | 2.253 / 2.321 |
| WR | 0.80 | 4.5 | 3.2 | 1.3 | 4.3–4.7 | 0.80–0.80 | 2.189 / 2.301 |
| TE | 0.86 | 4.4 | 3.7 | 0.7 | 4.0–4.8 | 0.84–0.90 | 1.573 / 1.604 |

Exclusion bias — k on rows without a missed game in the window vs all rows (paired bootstrap of the difference):

| pos | rows all / without miss | k all | k without miss | difference [95% CI] | share of rows with a miss |
|---|---|---|---|---|---|
| QB | 3101 / 2462 | 2.8 | 2.6 | 0.2 [-0.7, 0.8] | 0.206 |
| RB | 8728 / 6467 | 2.7 | 3.0 | -0.3 [-0.7, 0.1] | 0.259 |
| WR | 12074 / 8907 | 3.3 | 3.5 | -0.2 [-0.6, 0.1] | 0.262 |
| TE | 8324 / 6196 | 3.8 | 4.1 | -0.3 [-0.9, 0.2] | 0.256 |

## Q2 — does opportunity + points beat points-only?

Arm P, `hasBaseline` rows. VE = volume × efficiency; G = points posterior + γ × opportunity increment. ΔMAE = form − points-only (negative = better), LOSO, clustered bootstrap. Decision: combine only where VE or G is BEATS on the primary population.

| horizon | pos | eligible rows (share of arm P) | MAE points-only / VE / G | VE Δ [CI] | VE | G Δ [CI] | G | role-change rows: VE / G | adopt |
|---|---|---|---|---|---|---|---|---|---|
| ros | QB | 2934 (0.73) | 3.465 / 3.436 / 3.472 | -0.0296 [-0.0703, 0.0165] | NO-GAIN | 0.0066 [-0.0438, 0.0842] | NO-GAIN | 62: NO-GAIN / NO-GAIN | none (display-only) |
| ros | RB | 5272 (0.48) | 2.931 / 2.934 / 2.941 | 0.0027 [-0.0274, 0.0335] | NO-GAIN | 0.0103 [0.0031, 0.0175] | WORSE | 969: NO-GAIN / WORSE | none (display-only) |
| ros | WR | 7623 (0.50) | 2.614 / 2.615 / 2.617 | 0.0010 [-0.0140, 0.0161] | NO-GAIN | 0.0029 [-0.0053, 0.0112] | NO-GAIN | 1050: NO-GAIN / NO-GAIN | none (display-only) |
| ros | TE | 2608 (0.26) | 2.401 / 2.410 / 2.407 | 0.0088 [-0.0114, 0.0282] | NO-GAIN | 0.0058 [-0.0053, 0.0176] | NO-GAIN | 306: NO-GAIN / NO-GAIN | none (display-only) |
| next | QB | 2684 (0.67) | 3.434 / 3.368 / 3.454 | -0.0664 [-0.1740, 0.0405] | NO-GAIN | 0.0202 [-0.0009, 0.0549] | NO-GAIN | 85: NO-GAIN / WORSE | none (display-only) |
| next | RB | 4714 (0.43) | 3.570 / 3.586 / 3.581 | 0.0164 [-0.0163, 0.0500] | NO-GAIN | 0.0108 [0.0004, 0.0220] | WORSE | 882: NO-GAIN / NO-GAIN | none (display-only) |
| next | WR | 7370 (0.48) | 2.976 / 2.949 / 2.966 | -0.0269 [-0.0557, 0.0010] | NO-GAIN | -0.0102 [-0.0325, 0.0116] | NO-GAIN | 1129: BEATS / BEATS | none (display-only) |
| next | TE | 3017 (0.31) | 2.533 / 2.519 / 2.528 | -0.0139 [-0.0486, 0.0194] | NO-GAIN | -0.0044 [-0.0303, 0.0206] | NO-GAIN | 474: NO-GAIN / NO-GAIN | none (display-only) |

## Q3 — weak/strong split and projection confidence as the scaling variable

Arm P, points. M0 = k per position; M1 = k per position × band (S-1 opp/g below/above the position median over S-1 players with gp ≥ 8; RB/WR/TE); M2 = k per position × confidence tier (qualifying seasons: ≥ 5 high, ≥ 3 medium, else low). Held-out MAE; ΔMAE vs M0.

| horizon | pos | M0 k / MAE | M1 band k (MAE) Δ [CI] label | M2 tier k (MAE) Δ [CI] label | adopt |
|---|---|---|---|---|---|
| ros | QB | 2.8 / 3.487 | n/a (QB) | low 1.5 / medium 4.2 / high 3.1 (3.472) -0.0151 [-0.0695, 0.0345] NO-GAIN — a sub-cell INSUFFICIENT | none |
| ros | RB | 2.7 / 2.321 | weak 2.7 / strong 2.7 (2.322) 0.0020 [0.0004, 0.0037] WORSE | low 2.6 / medium 3.5 / high 1.9 (2.332) 0.0111 [0.0003, 0.0217] WORSE | none |
| ros | WR | 3.2 / 2.301 | strong 2.9 / weak 4.3 (2.298) -0.0024 [-0.0083, 0.0033] NO-GAIN | low 3.2 / medium 3.2 / high 3.2 (2.304) 0.0037 [0.0017, 0.0058] WORSE | none |
| ros | TE | 3.7 / 1.604 | strong 3.7 / weak 4.3 (1.605) 0.0013 [-0.0009, 0.0036] NO-GAIN | low 4.0 / medium 4.1 / high 3.1 (1.605) 0.0012 [-0.0029, 0.0053] NO-GAIN | none |
| next | QB | 4.4 / 3.386 | n/a (QB) | low 2.9 / medium 5.3 / high 4.8 (3.406) 0.0200 [-0.0120, 0.0534] NO-GAIN — a sub-cell INSUFFICIENT | none |
| next | RB | 4.2 / 2.854 | weak 5.9 / strong 3.9 (2.853) -0.0005 [-0.0093, 0.0081] NO-GAIN | low 5.5 / medium 3.5 / high 3.3 (2.873) 0.0193 [0.0006, 0.0386] WORSE | none |
| next | WR | 4.0 / 2.691 | strong 3.2 / weak 8.7 (2.671) -0.0199 [-0.0405, 0.0003] NO-GAIN | low 4.6 / medium 4.3 / high 3.1 (2.688) -0.0034 [-0.0135, 0.0069] NO-GAIN | none |
| next | TE | 4.6 / 1.852 | strong 4.7 / weak 4.1 (1.854) 0.0022 [0.0002, 0.0044] WORSE | low 4.8 / medium 5.5 / high 3.3 (1.851) -0.0010 [-0.0107, 0.0086] NO-GAIN | none |

## Q4 — rookies and players without a ≥ 8-game prior season

Prior: rookie-path players use the SHIPPED rookie projection (calibration + games ladder + ceiling; no KTC multiplier historically); veteran-path X-short players use the frozen projection. Comparator: Phase 1's per-row k rule (`PHASE1_K`). ΔMAE = fitted − Phase 1 (negative = better).

| group | horizon | pos | k (0.1) | 95% CI | rows / players | MAE fitted / Phase 1 | ΔMAE [CI] | label |
|---|---|---|---|---|---|---|---|---|
| X-rookie0 | ros | QB | 5.8 | [2.4, 17.9] | 552 / 66 | 3.722 / 3.677 | 0.0449 [-0.0007, 0.0935] | NO-GAIN |
| X-rookie0 | ros | RB | 2.6 | [1.7, 3.8] | 3065 / 331 | 2.470 / 2.479 | -0.0093 [-0.0242, 0.0064] | NO-GAIN |
| X-rookie0 | ros | WR | 2.4 | [1.8, 3.3] | 4169 / 441 | 2.128 / 2.158 | -0.0302 [-0.0508, -0.0095] | BEATS |
| X-rookie0 | ros | TE | 3.2 | [1.9, 5.6] | 2029 / 225 | 1.418 / 1.423 | -0.0057 [-0.0175, 0.0061] | NO-GAIN |
| X-rookie0 | ros | ALL | 2.9 | [2.3, 3.6] | 9815 / 1063 | 2.181 / 2.192 | -0.0108 [-0.0231, 0.0017] | NO-GAIN |
| X-rookie0 | next | QB | INSUFFICIENT |  | 499 / 49 |  |  |  |
| X-rookie0 | next | RB | 6.6 | [3.9, 12.5] | 2422 / 229 | 2.982 / 2.946 | 0.0366 [-0.0065, 0.0812] | NO-GAIN |
| X-rookie0 | next | WR | 4.3 | [2.9, 6.5] | 3415 / 316 | 2.358 / 2.383 | -0.0253 [-0.0570, 0.0065] | NO-GAIN |
| X-rookie0 | next | TE | 5.4 | [2.5, 14.2] | 1736 / 170 | 1.645 / 1.646 | -0.0014 [-0.0186, 0.0157] | NO-GAIN |
| X-rookie0 | next | ALL | 6.3 | [4.3, 10.0] | 8072 / 764 | 2.505 / 2.497 | 0.0084 [-0.0038, 0.0205] | NO-GAIN |
| X-rookie1p | ros | QB | 2.8 | [1.7, 5.1] | 952 / 101 | 3.620 / 3.752 | -0.1315 [-0.2888, 0.0260] | NO-GAIN |
| X-rookie1p | ros | RB | 2.2 | [1.4, 3.1] | 2969 / 298 | 2.651 / 2.655 | -0.0041 [-0.0307, 0.0229] | NO-GAIN |
| X-rookie1p | ros | WR | 3.0 | [2.2, 4.0] | 4384 / 439 | 2.109 / 2.138 | -0.0295 [-0.0535, -0.0062] | BEATS |
| X-rookie1p | ros | TE | 2.7 | [1.7, 4.3] | 2552 / 252 | 1.342 / 1.359 | -0.0169 [-0.0530, 0.0171] | NO-GAIN |
| X-rookie1p | ros | ALL | 2.6 | [2.1, 3.2] | 10857 / 1089 | 2.203 / 2.238 | -0.0356 [-0.0574, -0.0135] | BEATS |
| X-rookie1p | next | QB | INSUFFICIENT |  | 653 / 54 |  |  |  |
| X-rookie1p | next | RB | 4.0 | [2.6, 6.0] | 2609 / 226 | 2.669 / 2.668 | 0.0015 [-0.0138, 0.0160] | NO-GAIN |
| X-rookie1p | next | WR | 3.1 | [2.0, 5.0] | 3417 / 295 | 2.583 / 2.640 | -0.0563 [-0.1166, 0.0062] | NO-GAIN |
| X-rookie1p | next | TE | 5.2 | [2.7, 9.9] | 2011 / 178 | 1.863 / 1.859 | 0.0045 [-0.0219, 0.0323] | NO-GAIN |
| X-rookie1p | next | ALL | 3.7 | [2.9, 4.8] | 8690 / 752 | 2.523 / 2.558 | -0.0358 [-0.0636, -0.0080] | BEATS |
| X-short | ros | QB | INSUFFICIENT |  | 609 / 57 |  |  |  |
| X-short | ros | RB | 1.3 | [0.8, 2.4] | 1228 / 110 | 2.331 / 2.393 | -0.0614 [-0.1677, 0.0399] | NO-GAIN |
| X-short | ros | WR | 1.1 | [0.7, 1.8] | 1641 / 159 | 1.900 / 2.015 | -0.1149 [-0.2179, -0.0187] | BEATS |
| X-short | ros | TE | 3.6 | [2.2, 6.8] | 898 / 89 | 1.453 / 1.440 | 0.0132 [0.0007, 0.0276] | WORSE |
| X-short | ros | ALL | 1.5 | [1.2, 2.0] | 4376 / 415 | 2.163 / 2.262 | -0.0997 [-0.1748, -0.0306] | BEATS |
| X-short | next | QB | INSUFFICIENT |  | 462 / 36 |  |  |  |
| X-short | next | RB | INSUFFICIENT |  | 732 / 59 |  |  |  |
| X-short | next | WR | 0.7 | [0.2, 2.0] | 907 / 75 | 2.535 / 2.740 | -0.2045 [-0.4579, 0.0394] | NO-GAIN |
| X-short | next | TE | INSUFFICIENT |  | 606 / 50 |  |  |  |
| X-short | next | ALL | 2.7 | [1.5, 4.9] | 2707 / 220 | 2.948 / 2.988 | -0.0403 [-0.1298, 0.0547] | NO-GAIN |

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

Rows at W ∈ {3, 4, 5, 6} with a baseline and a points prior (9719 rows). Shift = posterior ROS opportunity − baseline, with the pinned K_ROS_OPP by position (QB 2.5, RB 1.5, WR 3.0, TE 3.5). Target = ROS PPG − points prior. Spearman is pooled across positions; the mix gap is the mean absolute position-share gap between the top 50 by the measure and the top 50 by the target, per (S, W). Highest Spearman wins; within 0.01, the smaller mix gap.

| measure | Spearman | mean top-50 mix gap | (S, W) groups |
|---|---|---|---|
| raw | 0.3024 | 0.0873 | 48 |
| relative | 0.3188 | 0.0602 | 48 |
| z | 0.3232 | 0.0725 | 48 |
| pointsEquivalent | 0.3262 | 0.0652 | 48 |

Answer: **relative** — within 0.01 of the best Spearman → smaller mix gap; within 0.01 of the best: relative, pointsEquivalent, z.

## Q7 — depth-chart double count: freeze the prior or accept the live one

Arm P frozen at the S week-1 depth chart vs arm L re-derived with the depth chart of S week min(W+1, last). Each arm uses its own in-fold k. Residual = prediction − actual on held-out rows; promoted = live order < week-1 order or newly listed; demoted = live order > week-1 order or dropped from the chart.

| scope | rows / changed | k P / L | MAE P / L | ΔMAE (L − P) [CI] | label | L promoted mean resid [CI] | L demoted mean resid [CI] | P promoted [CI] | P demoted [CI] |
|---|---|---|---|---|---|---|---|---|---|
| pooled | 33566 / 12483 | 3.0 / 3.1 | 2.2386 / 2.2349 | -0.0037 [-0.0075, 0.0001] | NO-GAIN | 0.179 [0.024, 0.338] | 0.324 [0.140, 0.510] | 0.105 [-0.051, 0.261] | 0.427 [0.239, 0.615] |
| QB | 3124 / 270 | 2.8 / 2.8 | 3.4874 / 3.4943 | 0.0069 [-0.0001, 0.0139] | NO-GAIN | -0.465 [-2.006, 1.077] | -0.006 [-1.665, 1.978] | -0.768 [-2.276, 0.756] | 0.335 [-1.322, 2.289] |
| RB | 9208 / 2411 | 2.7 / 2.8 | 2.3206 / 2.3165 | -0.0040 [-0.0120, 0.0042] | NO-GAIN | -0.360 [-0.756, 0.007] | 0.268 [-0.161, 0.711] | -0.438 [-0.847, -0.066] | 0.378 [-0.070, 0.827] |
| WR | 12751 / 7265 | 3.2 / 3.3 | 2.3008 / 2.2948 | -0.0060 [-0.0129, 0.0009] | NO-GAIN | 0.426 [0.216, 0.633] | 0.453 [0.226, 0.682] | 0.346 [0.140, 0.551] | 0.556 [0.325, 0.794] |
| TE | 8483 / 2537 | 3.7 / 3.8 | 1.6037 / 1.5989 | -0.0048 [-0.0109, 0.0008] | NO-GAIN | 0.128 [-0.125, 0.372] | 0.013 [-0.295, 0.314] | 0.085 [-0.178, 0.332] | 0.088 [-0.217, 0.395] |

Rule (pre-registered): ACCEPT only if L BEATS P on held-out MAE AND L's promoted-row mean residual CI includes 0; else FREEZE. Decision on the pooled population: **FREEZE**.

## Q8 — which k set drives the dynasty score, which the season projection

Arm P. Each k is the LOSO-fitted value for its own horizon; "cross" applies the other horizon's fitted k to the same held-out rows. Penalty = cross MAE / native MAE − 1.

| pos | kROS | kNext | ROS rows: native / kNext MAE | penalty | next rows: native / kROS MAE | penalty | both < 1% | S+2 k (rows) | arm R next k |
|---|---|---|---|---|---|---|---|---|---|
| QB | 2.8 | 4.4 | 3.4874 / 3.5166 | 0.84% | 3.3864 / 3.4240 | 1.11% | no | 2.8 (2153) | 7.1 |
| RB | 2.7 | 4.2 | 2.3206 / 2.3402 | 0.85% | 2.8537 / 2.8710 | 0.61% | yes | 7.6 (4589) | 4.1 |
| WR | 3.2 | 4.0 | 2.3008 / 2.3102 | 0.41% | 2.6913 / 2.6939 | 0.10% | yes | 3.8 (6992) | 5.8 |
| TE | 3.7 | 4.6 | 1.6037 / 1.6076 | 0.24% | 1.8518 / 1.8522 | 0.02% | yes | 4.9 (4805) | 5.3 |

Rule: season projection → kROS; dynasty → kNext; if both cross-application penalties < 1%, one set would do. Not every position clears 1% on both, so the two sets stay separate.

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

74449 evidence rows (n ≥ 1). Mid-season movers (> 1 distinct gamelogs team) are 158 of 3639 arm-P player-seasons (0.043). Rows with a played week lacking a gamelogs row: 26664.

| S | candidates | arm P | X-rookie0 | X-rookie1p | X-short | rows | movers (all / arm P) | attach drops |
|---|---|---|---|---|---|---|---|---|
| 2014 | 576 | 281 | 122 | 127 | 46 | 5956 | 16 / 8 | {"nonPositiveAnchor":11} |
| 2015 | 608 | 300 | 125 | 135 | 48 | 6042 | 23 / 14 | {"nonPositiveAnchor":13} |
| 2016 | 595 | 286 | 131 | 117 | 61 | 5992 | 14 / 10 | {"nonPositiveAnchor":10} |
| 2017 | 598 | 277 | 127 | 129 | 65 | 5942 | 19 / 10 | {"nonPositiveAnchor":4} |
| 2018 | 614 | 289 | 133 | 124 | 68 | 6159 | 26 / 16 | {"nonPositiveAnchor":6} |
| 2019 | 616 | 277 | 139 | 137 | 63 | 6133 | 22 / 13 | {"nonPositiveAnchor":5} |
| 2020 | 654 | 308 | 137 | 139 | 70 | 6480 | 12 / 10 | {"nonPositiveAnchor":4} |
| 2021 | 688 | 327 | 126 | 152 | 83 | 6493 | 26 / 20 | {"nonPositiveAnchor":6} |
| 2022 | 645 | 325 | 108 | 140 | 72 | 6366 | 28 / 20 | {"nonPositiveAnchor":5} |
| 2023 | 630 | 322 | 108 | 129 | 71 | 6261 | 12 / 9 | {"nonPositiveAnchor":7} |
| 2024 | 629 | 314 | 100 | 142 | 73 | 6291 | 19 / 10 | {"nonPositiveAnchor":7} |
| 2025 | 638 | 333 | 107 | 120 | 78 | 6334 | 23 / 18 | {"nonPositiveAnchor":5} |

## Excluded-population report

count = rows (pid, S, W with n >= 1) unless noted; player-season rows for n0/attachDropped/absentFromGamelogs; mean prior = pointsPrior where one exists

**Player-seasons with n = 0 at every checkpoint (no game in weeks 1–12)**

| arm | pos | count | players | mean prior | mean n | mean obs − prior |
|---|---|---|---|---|---|---|
| P | QB | 7 | 7 | 10.14 | 0.00 | — |
| P | RB | 28 | 28 | 4.24 | 0.00 | — |
| P | WR | 30 | 29 | 3.09 | 0.00 | — |
| P | TE | 20 | 20 | 1.52 | 0.00 | — |
| X-rookie0 | QB | 22 | 22 | 8.60 | 0.00 | — |
| X-rookie0 | RB | 45 | 45 | 3.08 | 0.00 | — |
| X-rookie0 | WR | 86 | 86 | 2.72 | 0.00 | — |
| X-rookie0 | TE | 36 | 36 | 1.39 | 0.00 | — |
| X-rookie1p | QB | 58 | 42 | 8.23 | 0.00 | — |
| X-rookie1p | RB | 22 | 22 | 4.55 | 0.00 | — |
| X-rookie1p | WR | 48 | 47 | 2.91 | 0.00 | — |
| X-rookie1p | TE | 23 | 23 | 1.54 | 0.00 | — |
| X-short | QB | 23 | 22 | 12.10 | 0.00 | — |
| X-short | RB | 22 | 21 | 3.19 | 0.00 | — |
| X-short | WR | 20 | 19 | 3.46 | 0.00 | — |
| X-short | TE | 17 | 17 | 1.18 | 0.00 | — |

**Rows dropped for rosGames < 4 — season ended early (last played week ≤ W+2)**

| arm | pos | count | players | mean prior | mean n | mean obs − prior |
|---|---|---|---|---|---|---|
| P | QB | 362 | 53 | 16.13 | 4.87 | -4.79 |
| P | RB | 1017 | 141 | 7.37 | 4.31 | -2.20 |
| P | WR | 1506 | 216 | 5.80 | 4.64 | -1.73 |
| P | TE | 737 | 111 | 3.43 | 4.80 | -0.52 |
| X-rookie0 | QB | 105 | 20 | 9.94 | 3.66 | -1.91 |
| X-rookie0 | RB | 470 | 84 | 3.84 | 3.68 | -1.80 |
| X-rookie0 | WR | 599 | 109 | 3.24 | 3.51 | -2.10 |
| X-rookie0 | TE | 344 | 59 | 1.88 | 3.62 | -0.59 |
| X-rookie1p | QB | 373 | 62 | 8.87 | 2.26 | -4.17 |
| X-rookie1p | RB | 546 | 94 | 4.43 | 3.82 | -1.71 |
| X-rookie1p | WR | 706 | 116 | 3.50 | 3.62 | -1.53 |
| X-rookie1p | TE | 381 | 58 | 2.07 | 3.58 | -1.02 |
| X-short | QB | 288 | 33 | 12.09 | 2.80 | -6.15 |
| X-short | RB | 377 | 57 | 4.81 | 3.17 | -2.77 |
| X-short | WR | 433 | 65 | 4.60 | 3.41 | -2.13 |
| X-short | TE | 279 | 47 | 2.43 | 3.54 | -0.80 |

**Rows dropped for rosGames < 4 — other**

| arm | pos | count | players | mean prior | mean n | mean obs − prior |
|---|---|---|---|---|---|---|
| P | QB | 403 | 75 | 14.76 | 4.17 | -5.32 |
| P | RB | 686 | 187 | 6.16 | 5.11 | -1.38 |
| P | WR | 962 | 269 | 5.59 | 5.25 | -1.24 |
| P | TE | 457 | 133 | 3.52 | 5.35 | -0.58 |
| X-rookie0 | QB | 121 | 35 | 10.61 | 3.09 | -5.76 |
| X-rookie0 | RB | 412 | 130 | 4.14 | 3.99 | -2.33 |
| X-rookie0 | WR | 489 | 141 | 3.23 | 3.76 | -2.03 |
| X-rookie0 | TE | 259 | 85 | 1.89 | 3.76 | -0.91 |
| X-rookie1p | QB | 601 | 83 | 9.51 | 2.58 | -5.42 |
| X-rookie1p | RB | 379 | 114 | 4.40 | 4.23 | -1.47 |
| X-rookie1p | WR | 537 | 143 | 3.40 | 3.92 | -1.91 |
| X-rookie1p | TE | 255 | 83 | 1.89 | 4.49 | -0.82 |
| X-short | QB | 565 | 51 | 10.68 | 2.46 | -6.34 |
| X-short | RB | 189 | 57 | 5.58 | 3.53 | -3.18 |
| X-short | WR | 224 | 76 | 3.72 | 4.09 | -1.73 |
| X-short | TE | 154 | 45 | 2.67 | 4.45 | -0.55 |

**Rows with no next-season outcome (S+1 absent or gp < 6; S ≤ 2024)**

| arm | pos | count | players | mean prior | mean n | mean obs − prior |
|---|---|---|---|---|---|---|
| P | QB | 782 | 67 | 15.47 | 4.37 | -3.59 |
| P | RB | 3193 | 246 | 5.68 | 4.82 | -1.13 |
| P | WR | 3981 | 308 | 5.22 | 4.62 | -1.48 |
| P | TE | 2245 | 171 | 2.99 | 4.91 | -0.79 |
| X-rookie0 | QB | 200 | 27 | 9.40 | 2.73 | -4.53 |
| X-rookie0 | RB | 1197 | 134 | 4.05 | 3.74 | -2.43 |
| X-rookie0 | WR | 1404 | 167 | 3.26 | 3.55 | -2.02 |
| X-rookie0 | TE | 731 | 85 | 1.93 | 3.55 | -0.78 |
| X-rookie1p | QB | 1123 | 89 | 9.12 | 2.45 | -4.50 |
| X-rookie1p | RB | 1007 | 104 | 4.12 | 3.92 | -1.82 |
| X-rookie1p | WR | 1748 | 172 | 3.26 | 3.88 | -1.69 |
| X-rookie1p | TE | 976 | 93 | 1.76 | 4.08 | -0.94 |
| X-short | QB | 886 | 48 | 11.48 | 2.58 | -6.24 |
| X-short | RB | 922 | 83 | 5.17 | 3.49 | -2.68 |
| X-short | WR | 1175 | 107 | 4.80 | 4.17 | -2.34 |
| X-short | TE | 632 | 60 | 2.45 | 3.99 | -0.69 |

**Rows with a missed game in the window (kept; used in the Q1(c) diagnostic)**

| arm | pos | count | players | mean prior | mean n | mean obs − prior |
|---|---|---|---|---|---|---|
| P | QB | 1246 | 91 | 15.67 | 4.15 | -5.27 |
| P | RB | 3402 | 266 | 6.85 | 4.67 | -1.25 |
| P | WR | 4879 | 373 | 6.40 | 4.79 | -1.38 |
| P | TE | 2968 | 216 | 3.89 | 4.92 | -0.52 |
| X-rookie0 | QB | 529 | 72 | 11.31 | 3.50 | -4.03 |
| X-rookie0 | RB | 1869 | 260 | 4.50 | 3.83 | -2.04 |
| X-rookie0 | WR | 2763 | 378 | 3.74 | 3.90 | -1.70 |
| X-rookie0 | TE | 1333 | 189 | 2.04 | 3.65 | -0.98 |
| X-rookie1p | QB | 1325 | 112 | 9.45 | 2.44 | -4.80 |
| X-rookie1p | RB | 1683 | 222 | 4.48 | 4.05 | -1.16 |
| X-rookie1p | WR | 2542 | 315 | 3.83 | 4.02 | -1.09 |
| X-rookie1p | TE | 1320 | 173 | 2.12 | 4.11 | -0.67 |
| X-short | QB | 1159 | 64 | 11.38 | 2.58 | -6.23 |
| X-short | RB | 1006 | 118 | 5.25 | 3.47 | -2.23 |
| X-short | WR | 1155 | 136 | 4.41 | 3.83 | -2.02 |
| X-short | TE | 589 | 79 | 2.94 | 3.63 | -0.87 |

**Veteran-path player-seasons dropped by attachFactorMultipliers (no points prior)**

| arm | pos | count | players | mean prior | mean n | mean obs − prior |
|---|---|---|---|---|---|---|
| P | QB | 14 | 3 | — | — | — |
| P | RB | 8 | 6 | — | — | — |
| P | WR | 16 | 8 | — | — | — |
| P | TE | 21 | 14 | — | — | — |
| X-short | QB | 3 | 1 | — | — | — |
| X-short | RB | 5 | 5 | — | — | — |
| X-short | WR | 6 | 6 | — | — | — |
| X-short | TE | 10 | 9 | — | — | — |

**Player-seasons absent from gamelogs (opportunity / share cells null)**

| arm | pos | count | players | mean prior | mean n | mean obs − prior |
|---|---|---|---|---|---|---|
| P | QB | 12 | 2 | — | — | — |
| P | RB | 18 | 14 | 1.80 | — | — |
| P | WR | 23 | 22 | 2.91 | — | — |
| P | TE | 39 | 29 | 0.89 | — | — |
| X-rookie0 | RB | 31 | 31 | 3.08 | — | — |
| X-rookie0 | WR | 55 | 55 | 2.65 | — | — |
| X-rookie0 | TE | 43 | 43 | 1.34 | — | — |
| X-rookie1p | QB | 8 | 7 | 7.41 | — | — |
| X-rookie1p | RB | 14 | 13 | 3.34 | — | — |
| X-rookie1p | WR | 37 | 34 | 2.60 | — | — |
| X-rookie1p | TE | 44 | 42 | 1.61 | — | — |
| X-short | QB | 3 | 2 | 7.91 | — | — |
| X-short | RB | 8 | 8 | 3.24 | — | — |
| X-short | WR | 14 | 14 | 2.25 | — | — |
| X-short | TE | 31 | 28 | 1.50 | — | — |

## Limitations

- **Basis is half_ppr.** A dimensionless k fitted on the half-PPR panel is acceptable here; a league-basis refit belongs to the existing custom-basis backlog item.
- **The prior is the reconstruction, not the app's live number.** It is faithful in 9 of 13 steps, with the divergences documented in `grading/2026-09-06-fullpipeline-verdict.md`. The depth factor uses the S week-1 chart as a stand-in for a pre-season capture; qbQuality is a flat 50.
- **The rookie prior has no KTC multiplier historically** (KTC history starts 2026-05-18).
- **Season-totals S `team` is the season's dominant team.** It reaches teamOffense's current-team resolution and the forward-mover neutralization (`classifyAttributionCohort` reads `teamsByYear[S]`), so a player traded after W leaks future information into the prior. Accepted, not fixed: 158 of 3639 arm-P player-seasons are movers (0.043).
- **Team-target denominators omit gamelogs `unmapped` rows** (per-season counts above), so target shares are slightly overstated in those seasons.
- **No injury-severity model.** `missedInWindow` is schedule-based and says only that a game was missed, not why; the Q1(c) diagnostic reports how much k moves when those rows are dropped.
- **Opportunity and target-share cells are gamelogs-derived** (weekly split only, behind the reconciliation gate); the S-1 opportunity baseline comes from season-totals.
- **The Q2 arm-P population is the primary population** (frozen projection prior, `hasBaseline`); the eligible-row share is reported per cell.

**Reproduce:** `node bin/backtest.mjs --inseason --write`
