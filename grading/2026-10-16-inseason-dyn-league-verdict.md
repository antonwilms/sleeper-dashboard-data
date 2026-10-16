# In-season evidence — Phase 2c: dynasty-side (rookies and SHORT veterans) verdict — QB prior `starter`, 2a k `backtests/2026-10-16-inseason-league-constants.json (uncommitted league 2a file)`

**Q1 — prospect prior.** YE0: arm B (ΔAB BEATS, mean -0.1194, CI [-0.2355, -0.0069]). YE1: arm B (ΔAB BEATS, mean -0.1460, CI [-0.2387, -0.0523]).

**Q2 — SHORT-recent prior.** History prior (ΔHP NO-GAIN, mean -0.0650, CI [-0.1873, 0.0559]).

**Q3 — the KTC anchor.** Measured (pooled): rows=14994, model-share update=23.02, left on table=13.81 (37.9% of realised movement), captured share=0.391, rank agreement=0.591, peak-clamp share (xn/y)=0.262/0.470, cap-of-35 row share=0.836 [upper bound: KTC unknown historically], start cap binds on 93.0% of cap rows (mean cut 40.0 score points). Not measurable yet: whether KTC itself moves with in-season evidence (KTC history starts 2026-05-18).

## Constants / reuse

| name | pos | k | ci95 | basis |
|---|---|---|---|---|
| K_DYN_PROSPECT_A_YE1 | QB | 3.5 | [2.8, 4.9] | pooled |
| K_DYN_PROSPECT_A_YE1 | RB | 3.5 | [2.8, 4.9] | pooled |
| K_DYN_PROSPECT_A_YE1 | WR | 3.5 | [2.8, 4.9] | pooled |
| K_DYN_PROSPECT_A_YE1 | TE | 3.5 | [2.8, 4.9] | pooled |
| K_DYN_PROSPECT_B_YE0 | QB | 6.0 | — | reuse (K_DYN_POINTS_ROOKIE0) |
| K_DYN_PROSPECT_B_YE0 | RB | 6.0 | — | reuse (K_DYN_POINTS_ROOKIE0) |
| K_DYN_PROSPECT_B_YE0 | WR | 6.0 | — | reuse (K_DYN_POINTS_ROOKIE0) |
| K_DYN_PROSPECT_B_YE0 | TE | 6.0 | — | reuse (K_DYN_POINTS_ROOKIE0) |
| K_DYN_PROSPECT_B_YE1 | QB | 3.5 | — | reuse (K_DYN_POINTS_ROOKIE1P) |
| K_DYN_PROSPECT_B_YE1 | RB | 3.5/6.0 | — | reuse (K_DYN_POINTS_ROOKIE1P, K_DYN_POINTS_ROOKIE0) |
| K_DYN_PROSPECT_B_YE1 | WR | 3.5/6.0 | — | reuse (K_DYN_POINTS_ROOKIE1P, K_DYN_POINTS_ROOKIE0) |
| K_DYN_PROSPECT_B_YE1 | TE | 3.5/6.0 | — | reuse (K_DYN_POINTS_ROOKIE1P, K_DYN_POINTS_ROOKIE0) |
| K_DYN_POINTS_SHORT_HISTORY | QB | 7.5 | — | reuse (K_DYN_POINTS_HISTORY) |
| K_DYN_POINTS_SHORT_HISTORY | RB | 4.0 | — | reuse (K_DYN_POINTS_HISTORY) |
| K_DYN_POINTS_SHORT_HISTORY | WR | 6.0 | — | reuse (K_DYN_POINTS_HISTORY) |
| K_DYN_POINTS_SHORT_HISTORY | TE | 5.0 | — | reuse (K_DYN_POINTS_HISTORY) |

## §Prior calibration (read before using these k)

Each k is fitted against its prior's miscalibration: re-fit if POSITION_PRIOR_PPG/the age or draft multipliers (arm A), the rookie calibration (arm B), or the projection (Q2 projection prior) change.

| arm | c | k with c | k without c |
|---|---|---|---|
| A_YE0 | 0.90 | 3.3 | 2.5 |
| B_YE0 | 1.32 | 5.1 | 6.2 |
| A_YE1 | 1.00 | 3.7 | 3.7 |
| B_YE1 | 1.16 | 4.0 | 3.7 |
| hist | 0.70 | 8.5 | 3.7 |
| proj | 0.70 | 7.1 | 3.4 |

> c > 1 means the prior runs **pessimistic** on these rows (outcomes exceed it). For the rookie arms that is partly survivorship: busts have no S+1 outcome and are excluded.

## §Q1

**YE0** — A: k=2.5 (OK, rows=7411), prior-only MAE=4.67. B: k=6.2 (OK, rows=7411), prior-only MAE=3.31, Δ vs 2a pinned=WORSE (mean 0.0095, CI [0.0048, 0.0144]). ΔAB=BEATS (mean -0.1194, CI [-0.2355, -0.0069]).
  - A-nullpick: k=2.2, MAE=3.11 vs A MAE=3.02, Δ=WORSE (mean 0.0881, CI [0.0248, 0.1504]).
**YE1** — A: k=3.7 (OK, rows=7583), prior-only MAE=3.69. B: k=3.7 (OK, rows=7583), prior-only MAE=3.55, Δ vs 2a pinned=NO-GAIN (mean 0.0048, CI [-0.0029, 0.0122]). ΔAB=BEATS (mean -0.1460, CI [-0.2387, -0.0523]).
  - A-nullpick: k=3.7, MAE=3.00 vs A MAE=3.00, Δ=NO-GAIN (mean 0.0000, CI [0.0000, 0.0000]).
  - A-YE1-withPick: k=4.2, MAE=2.99 vs A MAE=3.00, Δ=NO-GAIN (mean -0.0133, CI [-0.0483, 0.0216]).

## §Q2

Hist: k=3.7 (OK, rows=2150), Δ vs K_DYN_POINTS_HISTORY=NO-GAIN (mean 0.0276, CI [-0.0319, 0.0955]). Proj: k=3.4 (OK, rows=2150), Δ vs K_DYN_POINTS_SHORT=NO-GAIN (mean 0.0140, CI [-0.0285, 0.0611]). ΔHP=NO-GAIN (mean -0.0650, CI [-0.1873, 0.0559]).

## §Q3

**Measured:** the model-share numbers below. **Not measurable yet:** whether KTC itself moves with in-season evidence (so the anchored 60% is not really lost) — untestable until ~Jan 2027 (rest-of-season) / ~Jan 2028 (S+1 graded). **Do not propose changing the anchor.**

Pooled (YE0+YE1): rows=14994, model-share update=23.02, left on table=13.81 (37.9% of realised movement), captured share=0.391, rank agreement=0.591, peak-clamp share (xn/y)=0.262/0.470, cap-of-35 row share=0.836 [upper bound: KTC unknown historically], start cap binds on 93.0% of cap rows (mean cut 40.0 score points).
YE0: rows=7411, model-share update=13.79, left on table=8.27 (28.5% of realised movement), captured share=0.239, rank agreement=0.491, peak-clamp share (xn/y)=0.265/0.470, cap-of-35 row share=0.667 [upper bound: KTC unknown historically], start cap binds on 92.4% of cap rows (mean cut 35.4 score points).
YE1: rows=7583, model-share update=32.04, left on table=19.23 (44.0% of realised movement), captured share=0.490, rank agreement=0.587, peak-clamp share (xn/y)=0.259/0.470, cap-of-35 row share=1.000 [upper bound: KTC unknown historically], start cap binds on 93.3% of cap rows (mean cut 42.9 score points).
n∈1-4: rows=6975, model-share update=16.98, left on table=10.19 (28.5% of realised movement), captured share=0.266, rank agreement=0.495, peak-clamp share (xn/y)=0.175/0.425, cap-of-35 row share=0.848 [upper bound: KTC unknown historically], start cap binds on 93.1% of cap rows (mean cut 38.8 score points).
n∈5-8: rows=5416, model-share update=26.85, left on table=16.11 (43.7% of realised movement), captured share=0.460, rank agreement=0.649, peak-clamp share (xn/y)=0.310/0.490, cap-of-35 row share=0.827 [upper bound: KTC unknown historically], start cap binds on 92.9% of cap rows (mean cut 40.4 score points).
n∈9-40: rows=2603, model-share update=31.23, left on table=18.74 (49.7% of realised movement), captured share=0.569, rank agreement=0.712, peak-clamp share (xn/y)=0.395/0.549, cap-of-35 row share=0.819 [upper bound: KTC unknown historically], start cap binds on 92.9% of cap rows (mean cut 42.2 score points).

### Cap placement (D-54; app in-season-evidence-2c-wiring §1)

target = modelScore(nextPPG, peak); after = min(modelScore(blend(projPrior, obsPPG, n, k2a), peak), 35); before = modelScore(blend(capStartPPG(projPrior, peak), obsPPG, n, k2a), peak); noCap = modelScore(blend(projPrior, obsPPG, n, k2a), peak).

| slice | rows | MAE cap-after | MAE cap-before | Δ before − after | MAE no cap | Δ no-cap − before |
|---|---|---|---|---|---|---|
| pooled | 12527 | 41.11 | 24.69 | BEATS -16.42 [-18.22, -14.61] | 20.85 | BEATS -3.84 [-4.97, -2.69] |
| YE0 | 4944 | 37.72 | 28.37 | BEATS -9.35 [-11.20, -7.41] | 23.53 | BEATS -4.84 [-6.89, -2.88] |
| YE1 | 7583 | 43.31 | 22.28 | BEATS -21.03 [-23.30, -18.72] | 19.10 | BEATS -3.18 [-4.48, -1.89] |
| n1-4 | 5916 | 39.45 | 28.67 | BEATS -10.78 [-12.32, -9.26] | 23.15 | BEATS -5.52 [-7.14, -3.88] |
| n5-8 | 4480 | 41.88 | 22.36 | BEATS -19.52 [-21.68, -17.36] | 19.65 | BEATS -2.71 [-3.72, -1.67] |
| n9-40 | 2131 | 44.08 | 18.52 | BEATS -25.56 [-28.29, -22.80] | 16.98 | BEATS -1.55 [-2.44, -0.66] |

- Survivors only (rows with an S+1 outcome), which favours looser caps.
- The cap population is an upper bound, because KTC is unknown historically.
- Every row starts from arm B at the 2a k, as the wiring decision measured. Second-year WRs, which the app starts from arm A, are not measured separately.

No cap at all also beats cap-before (§10.1 of the wiring file). Reported, not acted on.


## D-55 — two-season (S+2) arm comparison

Arm A (position baseline) vs arm B (neutral projection) against the S+2 outcome (`nextPPG2`, S ≤ 2023, gp ≥ 6). **Admitted** = the Q1 rows with an S+2 outcome, with or without an S+1 outcome (11887 rows); **survivors** = those that also have one (10526 rows, app 2c-wiring §1b's population). Updated: arm A blended at its subgroup's pooled arm-A kFit (YE0 2.50, YE1 3.70); arm B at the 2a k. Δ = B − A in MAE (PPG), player-clustered.

| population | cell | rows | player-seasons | players | MAE prior A → B | Δ prior | MAE updated A → B | Δ updated |
|---|---|---|---|---|---|---|---|---|
| survivors | ALL | 10526 | 957 | 614 | 4.128 → 3.850 | BEATS -0.2778 [-0.4976, -0.0479] | 3.441 → 3.453 | NO-GAIN 0.0124 [-0.0785, 0.1087] |
| survivors | QB | 604 | 53 | 30 | 5.790 → 5.222 | NO-GAIN -0.5674 [-1.5435, 0.3928] | 4.657 → 4.683 | NO-GAIN 0.0256 [-0.3893, 0.4457] |
| survivors | QB\|YE0 | 294 | 27 | 27 | 5.811 → 5.386 | NO-GAIN -0.4259 [-1.7106, 0.8857] | 5.509 → 5.391 | NO-GAIN -0.1172 [-0.6298, 0.4111] |
| survivors | QB\|YE1 | 310 | 26 | 26 | 5.769 → 5.067 | NO-GAIN -0.7017 [-2.0743, 0.6792] | 3.849 → 4.010 | NO-GAIN 0.1611 [-0.3909, 0.6966] |
| survivors | RB | 3402 | 308 | 198 | 4.625 → 4.133 | BEATS -0.4914 [-0.9368, -0.0626] | 3.814 → 3.716 | NO-GAIN -0.0982 [-0.2835, 0.0841] |
| survivors | RB\|YE0 | 1734 | 161 | 161 | 4.897 → 4.036 | BEATS -0.8617 [-1.5819, -0.1796] | 3.890 → 3.791 | NO-GAIN -0.0996 [-0.3971, 0.1816] |
| survivors | RB\|YE1 | 1668 | 147 | 147 | 4.341 → 4.235 | NO-GAIN -0.1064 [-0.5405, 0.3148] | 3.734 → 3.637 | NO-GAIN -0.0968 [-0.2834, 0.0779] |
| survivors | WR | 4147 | 371 | 236 | 3.659 → 3.847 | NO-GAIN 0.1883 [-0.1673, 0.5464] | 3.221 → 3.378 | WORSE 0.1571 [0.0142, 0.2997] |
| survivors | WR\|YE0 | 2149 | 194 | 194 | 4.150 → 3.911 | NO-GAIN -0.2392 [-0.7168, 0.2537] | 3.434 → 3.634 | NO-GAIN 0.2003 [-0.0042, 0.4041] |
| survivors | WR\|YE1 | 1998 | 177 | 177 | 3.130 → 3.778 | WORSE 0.6480 [0.2938, 0.9963] | 2.992 → 3.102 | NO-GAIN 0.1106 [-0.0390, 0.2565] |
| survivors | TE | 2373 | 225 | 153 | 3.813 → 3.100 | BEATS -0.7126 [-1.1073, -0.3017] | 2.980 → 2.895 | NO-GAIN -0.0854 [-0.2499, 0.0812] |
| survivors | TE\|YE0 | 1156 | 113 | 113 | 4.075 → 2.868 | BEATS -1.2075 [-1.8050, -0.5876] | 2.984 → 2.819 | NO-GAIN -0.1645 [-0.4006, 0.0731] |
| survivors | TE\|YE1 | 1217 | 112 | 112 | 3.563 → 3.321 | NO-GAIN -0.2424 [-0.6472, 0.1530] | 2.977 → 2.967 | NO-GAIN -0.0102 [-0.1923, 0.1701] |
| admitted | ALL | 11887 | 1096 | 731 | 4.215 → 3.720 | BEATS -0.4953 [-0.7067, -0.2948] | 3.397 → 3.322 | NO-GAIN -0.0745 [-0.1631, 0.0108] |
| admitted | QB | 678 | 62 | 38 | 5.875 → 5.233 | NO-GAIN -0.6413 [-1.4868, 0.2631] | 4.772 → 4.769 | NO-GAIN -0.0029 [-0.3652, 0.3732] |
| admitted | QB\|YE0 | 314 | 29 | 29 | 5.921 → 5.346 | NO-GAIN -0.5748 [-1.7994, 0.6946] | 5.301 → 5.185 | NO-GAIN -0.1154 [-0.5978, 0.4009] |
| admitted | QB\|YE1 | 364 | 33 | 33 | 5.835 → 5.136 | NO-GAIN -0.6988 [-1.8317, 0.5316] | 4.315 → 4.410 | NO-GAIN 0.0942 [-0.3871, 0.5757] |
| admitted | RB | 3835 | 350 | 229 | 4.811 → 4.010 | BEATS -0.8014 [-1.2327, -0.3801] | 3.811 → 3.597 | BEATS -0.2142 [-0.3961, -0.0372] |
| admitted | RB\|YE0 | 1982 | 184 | 184 | 5.185 → 3.862 | BEATS -1.3237 [-1.9608, -0.6767] | 3.876 → 3.614 | NO-GAIN -0.2625 [-0.5408, 0.0121] |
| admitted | RB\|YE1 | 1853 | 166 | 166 | 4.412 → 4.169 | NO-GAIN -0.2427 [-0.6594, 0.1733] | 3.741 → 3.579 | NO-GAIN -0.1626 [-0.3467, 0.0121] |
| admitted | WR | 4699 | 428 | 290 | 3.697 → 3.667 | NO-GAIN -0.0307 [-0.3614, 0.2905] | 3.145 → 3.211 | NO-GAIN 0.0666 [-0.0678, 0.1998] |
| admitted | WR\|YE0 | 2379 | 220 | 220 | 4.334 → 3.754 | BEATS -0.5795 [-1.0324, -0.1114] | 3.406 → 3.457 | NO-GAIN 0.0510 [-0.1440, 0.2473] |
| admitted | WR\|YE1 | 2320 | 208 | 208 | 3.045 → 3.577 | WORSE 0.5320 [0.2205, 0.8562] | 2.877 → 2.960 | NO-GAIN 0.0826 [-0.0622, 0.2282] |
| admitted | TE | 2675 | 256 | 177 | 3.851 → 3.015 | BEATS -0.8356 [-1.1934, -0.4683] | 2.897 → 2.757 | NO-GAIN -0.1402 [-0.2905, 0.0096] |
| admitted | TE\|YE0 | 1319 | 131 | 131 | 4.237 → 2.803 | BEATS -1.4345 [-2.0132, -0.8771] | 2.937 → 2.667 | BEATS -0.2703 [-0.4981, -0.0416] |
| admitted | TE\|YE1 | 1356 | 125 | 125 | 3.474 → 3.221 | NO-GAIN -0.2530 [-0.6336, 0.1157] | 2.858 → 2.844 | NO-GAIN -0.0135 [-0.1801, 0.1482] |

**Rule:** A cell starts from the position baseline iff its admitted prior Δ (B − A, MAE against the S+2 outcome) is WORSE; otherwise from the projection. A cell with no Δ is undecided (null) and never counts as a flip.

- YE0 kind: QB projection, RB projection, WR projection, TE projection
- YE1 kind: QB projection, RB projection, WR position, TE projection

No flip — equals the shipped PROSPECT_PRIOR_KIND.

## D-56(a) — arm-A k for second-year WRs

Pre-registered ladder [YE1 pooled, own position] on arm A against S+1 (app 2c-wiring §9); the app routes only WR|YE1 here.

Pooled YE1 arm A: 7583 rows, 684 players, kFit 3.7 [2.8, 4.9].

| pos | rows | players | own kFit [CI] | own vs pooled | chosen | pinned k | shipped |
|---|---|---|---|---|---|---|---|
| QB | — | — | — | own INSUFFICIENT | pooled | 3.5 | 3.5 |
| RB | 2381 | 214 | 3.4 [2.1, 5.6] | NO-GAIN -0.0089 [-0.0217, 0.0042] | pooled | 3.5 | 3.5 |
| WR | 2997 | 268 | 4.9 [3.2, 7.9] | NO-GAIN 0.0138 [-0.0143, 0.0412] | pooled | 3.5 | 3.5 |
| TE | 1788 | 165 | 3.4 [1.8, 6.0] | NO-GAIN 0.0042 [-0.0145, 0.0251] | pooled | 3.5 | 3.5 |

Equals the shipped pin — an app re-pin to this constants file is provenance only.


## D-64 — 2c on the current QB model

| path | 2026-09-27 | this run |
|---|---|---|
| reuse.K_DYN_PROSPECT_B_YE0|QB.k | [6.5] | [6] |
| reuse.K_DYN_PROSPECT_B_YE0|RB.k | [6.5] | [6] |
| reuse.K_DYN_PROSPECT_B_YE0|WR.k | [6.5] | [6] |
| reuse.K_DYN_PROSPECT_B_YE0|TE.k | [6.5] | [6] |
| reuse.K_DYN_PROSPECT_B_YE1|RB.k | [3.5,6.5] | [3.5,6] |
| reuse.K_DYN_PROSPECT_B_YE1|WR.k | [3.5,6.5] | [3.5,6] |
| reuse.K_DYN_PROSPECT_B_YE1|TE.k | [3.5,6.5] | [3.5,6] |
| reuse.K_DYN_POINTS_SHORT_HISTORY|TE.k | [5.5] | [5] |

Q2 pooled (this run): Proj Δ NO-GAIN (mean 0.0140, CI [-0.0285, 0.0611]); ΔHP NO-GAIN (mean -0.0650, CI [-0.1873, 0.0559]) (also in `q2.decision.deltaHP`). These are the leaves the comparison panel carries; the constants, reuse entries and decisions above are what the app pins.

## Q4 — Rookie QB level in the dynasty prior (P12c)

Population: 188 rookie QBs (S 2014–2024; excluded: 0 no group, 0 no prior); S+1 PPG 62, S+2 PPG 38, season-S PPG 51.

| group | rookies | S | S+1 | S+2 |
|---|---|---|---|---|
| top12 | 30 | 26 | 29 | 21 |
| r1 | 8 | 5 | 7 | 2 |
| day2 | 22 | 9 | 9 | 7 |
| day3+ | 128 | 11 | 17 | 8 |

**Q4a — prior-only on held-out next-season PPG** (B0 = shipped rookie-path level; GS = P12a "if he starts" level; GC = leave-one-class-out group mean; RC = B0 × group ratio).

| horizon | players | MAE B0 | MAE GS | MAE GC | MAE RC | Δ GS | Δ GC | Δ RC |
|---|---|---|---|---|---|---|---|---|
| S+1 | 62 | 4.934 | 4.467 | 4.606 | 4.809 | NO-GAIN | NO-GAIN | NO-GAIN |
| S+2 | 38 | 5.167 | 5.003 | 5.164 | 5.663 | NO-GAIN | NO-GAIN | NO-GAIN |

Fallbacks to B0 (group below 5 training players): S+1 GC 0, RC 0; S+2 GC 0, RC 0.

**Q4b — posterior** at the pinned 2a rookie k (6), 494 rows / 48 players: MAE B0 4.476, GS 4.147, GC 4.146, RC 4.382. Δ GS NO-GAIN (mean -0.3298, CI [-0.7773, 0.1294]); Δ GC NO-GAIN (mean -0.3300, CI [-0.7819, 0.1397]); Δ RC NO-GAIN (mean -0.0948, CI [-0.4462, 0.2603]).

**Q4d — position control** (Σ S+1 PPG / Σ B0 over YE0 survivors): QB 1.110 (62 players), RB 1.164 (240 players), WR 1.160 (342 players), TE 1.034 (188 players). QB 1.110 vs RB∪WR∪TE 1.140: difference -0.030, CI [-0.1451, 0.0877] → none.

**k check:** not run (no candidate chosen).

**Q4c — season-S level by week-1 role (report-only; per-cell means, cells under 3 players suppressed):**

| group | backup (n / PPG / B0 / GS) | incumbent (n / PPG / B0 / GS) | no-chart (n / PPG / B0 / GS) | not-on-chart (n / PPG / B0 / GS) |
|---|---|---|---|---|
| top12 | 13 / 16.3 / 18.5 / 17.7 | 13 / 17.5 / 18.5 / 17.7 | 0 / — / — / — | 0 / — / — / — |
| r1 | 4 / 12.3 / 15.4 / 16.1 | 1 / — / — / — | 0 / — / — / — | 0 / — / — / — |
| day2 | 7 / 9.1 / 11.7 / 14.9 | 2 / — / — / — | 0 / — / — / — | 0 / — / — / — |
| day3+ | 7 / 9.1 / 8.1 / 13.8 | 1 / — / — / — | 1 / — / — / — | 2 / — / — / — |

Week-1 incumbents (17 players, report-only — too few to decide anything): MAE B0 3.742, GS 2.874, Δ GS NO-GAIN (mean -0.8679, CI [-1.8772, 0.1265]).

**What history cannot test (F6):** KTC history starts 2026-05-18 and the reconstruction holds `ktcMult` and college at 1.0, so the live `projectedPPG` excess for top picks (P12a Q4) is out of reach of any held-out test until a completed season carries KTC values (~2027). This run tests the neutral level only.

**Decision — Q4: `keep`.**

## Q5 — Sat-longer discount (D-60)

**Definition (the app's, F3).** A `years_exp` 0 QB whose preseason chain role is `backup`; at team-game index g, residual = starts − Σ_{i<g} preseason.perGame[i]; sat-longer iff residual < −1. It multiplies the prospect prior by 0.9 and is re-evaluated at every checkpoint. **Transport:** the data side uses the week-1 chart team (the app: his current team) and `draftYear === S` (the app: `years_exp` 0). P6a Q5 measured the residual at the end of the fitted window on takeover rows; this replicates the app's own residual at each of checkpoints 1–12.

Population: 89 preseason-backup rookie QBs; 30 ever flagged; 24 flagged at the last checkpoint. Roles seen among rookies on the week-1 chart: {"backup":89,"incumbent":18,"no-chart":1,"other":0}.

**Q5a — S+1 PPG on flagged checkpoint rows:** 13 players / 64 rows (floor 20 players) → `insufficient`, discount 0.9. dFull 1.08. MAE d=1.0 6.600, d=0.90 7.276, LOSO 7.151. Labels: LOSO vs 0.90 NO-GAIN; none vs 0.90 BEATS; none vs LOSO NO-GAIN.

**Q5b — persistence into year 2** (prior-only, flagged at the last rookie checkpoint, S+2 PPG): 6 players (floor 20) → `insufficient`; dFull 1.12; label NO-GAIN. **Limitation:** this is the rookie-path level at `yearsExp` 1; a flagged rookie who played enough in S to be veteran-routed at S+1 gets the veteran projection as his arm-B prior (assembleSeason and the app), so Q5b over-covers. It is `insufficient` either way.

**Q5c — flagged-ever vs never-flagged (report-only; suppressed as a pair below 3 players):**

| group | players | with S+1 PPG | mean S+1 / prior | S+1 primary-passer share |
|---|---|---|---|---|
| flagged ever | 30 | 13 | 1.178 | 27.9% |
| never flagged | 59 | 25 | 1.144 | 29.7% |

**Decision — Q5a: `insufficient` (0.9); Q5b: `insufficient`.** Outputs are aggregates only: counts, MAE, labels, CIs and the full-sample fitted d — never per-player, per-rookie-season or per-fold values.

## For wiring

- **Always (W0):** registry edits from the companion; app re-pins `IN_SEASON_DYN_PANEL_SOURCE` + fixture to this panel by byte copy; D-64 resolved, D-60 per Q5.
- **Q5 → insufficient:** keep 0.90 in `qbTakeoverConstants.js`/`inSeasonScoring.js`, PROVISIONAL(heuristic) re-cited to this verdict; no score moves. Q5b `insufficient`.
- **Q4 → keep:** CR-25/CR-27 text only.

## Excluded population

Q1: YE<=1 player-seasons 2046 (rows 20928, players 1310). No S+1 outcome — absent: player-seasons 390 (rows 3310); gp<6: player-seasons 274 (rows 2624). draftYear unusable: player-seasons 5 (rows 54). routeMismatch: player-seasons 0 (rows 0, rate 0.00%). YE1-in-rookie0: player-seasons 50 (rows 511). YE2-3 no qualifying season: player-seasons 344 (rows 3211).
Q2: SHORT-recent player-seasons 197 (rows 2150), SHORT-stale player-seasons 59 (rows 574), SHORT-noL player-seasons 0 (rows 0). No S+1 outcome — absent: player-seasons 262 (rows 2484, includes retirements); gp<6: player-seasons 123 (rows 1131). Without a projPrior: player-seasons 7 (rows 76).

## Limitations

- **Basis:** league (D-46) — prior, evidence and outcome on the app's load-time rescored basis; the paired 2a file is `backtests/2026-10-16-inseason-league-constants.json (uncommitted league 2a file)`.
- **D4 pick proxy:** a 12-team, 5-round league shape applied to any league; the actual league draft is not reconstructable.
- **D5 YE1 quirk:** the app's `selectRookieDraft` reads only the most recent rookie draft, so every second-year player gets `draftMultiplier(null) = 0.75` and loses the premium-pick exemption. Reported, not fixed here.
- **D6 age date:** whole years on `${S}-09-01` from `birthdate`; `player.age ?? 23` is the app default when null.
- **Survivorship:** more than half of SHORT player-seasons and a large share of rookie-path player-seasons have no S+1 outcome (busts vanish from every fitted number).
- **KTC unmeasurable:** KTC snapshot history starts 2026-05-18; whether KTC itself reacts to in-season evidence is untestable until ~Jan 2027 (rest-of-season) / ~Jan 2028 (S+1 graded).
- The prospect score's other inputs (the KTC anchor at 60%, the peak clamp, the cap of 35 on the starting value) are reported (§Q3), not fitted.
- **Fixed-rung leakage:** a ladder rung that reuses a 2a-pinned or `K_DYN_POINTS_HISTORY` k was fitted on other rows, including rows from the held-out season — this favours the fixed rung, the conservative direction.

**Reproduce:** `node bin/backtest.mjs --inseason --dynasty --write`
