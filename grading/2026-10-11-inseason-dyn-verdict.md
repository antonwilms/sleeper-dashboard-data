# In-season evidence — Phase 2c: dynasty-side (rookies and SHORT veterans) verdict — QB prior `starter`, 2a k `backtests/2026-10-07-inseason-constants.json @ f2c3b83b31acc589dac78b6d61a704ac02a57477`

**Q1 — prospect prior.** YE0: arm B (ΔAB BEATS, mean -0.1369, CI [-0.2389, -0.0393]). YE1: arm B (ΔAB BEATS, mean -0.1224, CI [-0.2023, -0.0408]).

**Q2 — SHORT-recent prior.** History prior (ΔHP NO-GAIN, mean -0.0833, CI [-0.1946, 0.0241]).

**Q3 — the KTC anchor.** Measured (pooled): rows=14994, model-share update=23.15, left on table=13.89 (37.9% of realised movement), captured share=0.384, rank agreement=0.589, peak-clamp share (xn/y)=0.273/0.464, cap-of-35 row share=0.836 [upper bound: KTC unknown historically], start cap binds on 94.7% of cap rows (mean cut 41.4 score points). Not measurable yet: whether KTC itself moves with in-season evidence (KTC history starts 2026-05-18).

## Constants / reuse

| name | pos | k | ci95 | basis |
|---|---|---|---|---|
| K_DYN_PROSPECT_A_YE1 | QB | 3.5 | [2.7, 4.8] | pooled |
| K_DYN_PROSPECT_A_YE1 | RB | 3.5 | [2.7, 4.8] | pooled |
| K_DYN_PROSPECT_A_YE1 | WR | 3.5 | [2.7, 4.8] | pooled |
| K_DYN_PROSPECT_A_YE1 | TE | 3.5 | [2.7, 4.8] | pooled |
| K_DYN_PROSPECT_B_YE0 | QB | 6.5 | — | reuse (K_DYN_POINTS_ROOKIE0) |
| K_DYN_PROSPECT_B_YE0 | RB | 6.5 | — | reuse (K_DYN_POINTS_ROOKIE0) |
| K_DYN_PROSPECT_B_YE0 | WR | 6.5 | — | reuse (K_DYN_POINTS_ROOKIE0) |
| K_DYN_PROSPECT_B_YE0 | TE | 6.5 | — | reuse (K_DYN_POINTS_ROOKIE0) |
| K_DYN_PROSPECT_B_YE1 | QB | 3.5 | — | reuse (K_DYN_POINTS_ROOKIE1P) |
| K_DYN_PROSPECT_B_YE1 | RB | 3.5/6.5 | — | reuse (K_DYN_POINTS_ROOKIE1P, K_DYN_POINTS_ROOKIE0) |
| K_DYN_PROSPECT_B_YE1 | WR | 3.5/6.5 | — | reuse (K_DYN_POINTS_ROOKIE1P, K_DYN_POINTS_ROOKIE0) |
| K_DYN_PROSPECT_B_YE1 | TE | 3.5/6.5 | — | reuse (K_DYN_POINTS_ROOKIE1P, K_DYN_POINTS_ROOKIE0) |
| K_DYN_POINTS_SHORT_HISTORY | QB | 7.5 | — | reuse (K_DYN_POINTS_HISTORY) |
| K_DYN_POINTS_SHORT_HISTORY | RB | 4.0 | — | reuse (K_DYN_POINTS_HISTORY) |
| K_DYN_POINTS_SHORT_HISTORY | WR | 6.0 | — | reuse (K_DYN_POINTS_HISTORY) |
| K_DYN_POINTS_SHORT_HISTORY | TE | 5.5 | — | reuse (K_DYN_POINTS_HISTORY) |

## §Prior calibration (read before using these k)

Each k is fitted against its prior's miscalibration: re-fit if POSITION_PRIOR_PPG/the age or draft multipliers (arm A), the rookie calibration (arm B), or the projection (Q2 projection prior) change.

| arm | c | k with c | k without c |
|---|---|---|---|
| A_YE0 | 0.88 | 3.3 | 2.4 |
| B_YE0 | 1.32 | 5.1 | 6.3 |
| A_YE1 | 1.00 | 3.6 | 3.6 |
| B_YE1 | 1.16 | 3.9 | 3.7 |
| hist | 0.72 | 8.8 | 3.9 |
| proj | 0.72 | 7.2 | 3.6 |

> c > 1 means the prior runs **pessimistic** on these rows (outcomes exceed it). For the rookie arms that is partly survivorship: busts have no S+1 outcome and are excluded.

## §Q1

**YE0** — A: k=2.4 (OK, rows=7411), prior-only MAE=4.24. B: k=6.3 (OK, rows=7411), prior-only MAE=2.96, Δ vs 2a pinned=NO-GAIN (mean 0.0040, CI [-0.0003, 0.0084]). ΔAB=BEATS (mean -0.1369, CI [-0.2389, -0.0393]).
  - A-nullpick: k=2.1, MAE=2.79 vs A MAE=2.71, Δ=WORSE (mean 0.0793, CI [0.0250, 0.1332]).
**YE1** — A: k=3.6 (OK, rows=7583), prior-only MAE=3.29. B: k=3.7 (OK, rows=7583), prior-only MAE=3.16, Δ vs 2a pinned=NO-GAIN (mean 0.0044, CI [-0.0030, 0.0116]). ΔAB=BEATS (mean -0.1224, CI [-0.2023, -0.0408]).
  - A-nullpick: k=3.6, MAE=2.66 vs A MAE=2.66, Δ=NO-GAIN (mean 0.0000, CI [0.0000, 0.0000]).
  - A-YE1-withPick: k=4.1, MAE=2.64 vs A MAE=2.66, Δ=NO-GAIN (mean -0.0124, CI [-0.0430, 0.0175]).

## §Q2

Hist: k=3.9 (OK, rows=2133), Δ vs K_DYN_POINTS_HISTORY=NO-GAIN (mean 0.0258, CI [-0.0227, 0.0805]). Proj: k=3.6 (OK, rows=2133), Δ vs K_DYN_POINTS_SHORT=NO-GAIN (mean 0.0230, CI [-0.0237, 0.0722]). ΔHP=NO-GAIN (mean -0.0833, CI [-0.1946, 0.0241]).

## §Q3

**Measured:** the model-share numbers below. **Not measurable yet:** whether KTC itself moves with in-season evidence (so the anchored 60% is not really lost) — untestable until ~Jan 2027 (rest-of-season) / ~Jan 2028 (S+1 graded). **Do not propose changing the anchor.**

Pooled (YE0+YE1): rows=14994, model-share update=23.15, left on table=13.89 (37.9% of realised movement), captured share=0.384, rank agreement=0.589, peak-clamp share (xn/y)=0.273/0.464, cap-of-35 row share=0.836 [upper bound: KTC unknown historically], start cap binds on 94.7% of cap rows (mean cut 41.4 score points).
YE0: rows=7411, model-share update=13.73, left on table=8.24 (28.5% of realised movement), captured share=0.240, rank agreement=0.488, peak-clamp share (xn/y)=0.274/0.462, cap-of-35 row share=0.667 [upper bound: KTC unknown historically], start cap binds on 94.3% of cap rows (mean cut 37.0 score points).
YE1: rows=7583, model-share update=32.35, left on table=19.41 (44.0% of realised movement), captured share=0.476, rank agreement=0.589, peak-clamp share (xn/y)=0.272/0.466, cap-of-35 row share=1.000 [upper bound: KTC unknown historically], start cap binds on 95.0% of cap rows (mean cut 44.2 score points).
n∈1-4: rows=6975, model-share update=17.13, left on table=10.28 (28.6% of realised movement), captured share=0.257, rank agreement=0.476, peak-clamp share (xn/y)=0.185/0.418, cap-of-35 row share=0.848 [upper bound: KTC unknown historically], start cap binds on 94.7% of cap rows (mean cut 40.2 score points).
n∈5-8: rows=5416, model-share update=27.04, left on table=16.22 (43.9% of realised movement), captured share=0.455, rank agreement=0.655, peak-clamp share (xn/y)=0.322/0.483, cap-of-35 row share=0.827 [upper bound: KTC unknown historically], start cap binds on 94.7% of cap rows (mean cut 41.8 score points).
n∈9-40: rows=2603, model-share update=31.16, left on table=18.70 (49.6% of realised movement), captured share=0.565, rank agreement=0.713, peak-clamp share (xn/y)=0.405/0.549, cap-of-35 row share=0.819 [upper bound: KTC unknown historically], start cap binds on 94.9% of cap rows (mean cut 43.6 score points).

### Cap placement (D-54; app in-season-evidence-2c-wiring §1)

target = modelScore(nextPPG, peak); after = min(modelScore(blend(projPrior, obsPPG, n, k2a), peak), 35); before = modelScore(blend(capStartPPG(projPrior, peak), obsPPG, n, k2a), peak); noCap = modelScore(blend(projPrior, obsPPG, n, k2a), peak).

| slice | rows | MAE cap-after | MAE cap-before | Δ before − after | MAE no cap | Δ no-cap − before |
|---|---|---|---|---|---|---|
| pooled | 12527 | 41.36 | 25.11 | BEATS -16.25 [-18.03, -14.44] | 21.83 | BEATS -3.27 [-4.52, -2.01] |
| YE0 | 4944 | 37.58 | 28.15 | BEATS -9.43 [-11.30, -7.54] | 24.41 | BEATS -3.74 [-5.92, -1.62] |
| YE1 | 7583 | 43.82 | 23.13 | BEATS -20.69 [-23.04, -18.31] | 20.16 | BEATS -2.97 [-4.34, -1.58] |
| n1-4 | 5916 | 39.77 | 29.28 | BEATS -10.49 [-12.03, -8.95] | 24.56 | BEATS -4.71 [-6.48, -2.97] |
| n5-8 | 4480 | 42.04 | 22.64 | BEATS -19.41 [-21.57, -17.23] | 20.31 | BEATS -2.33 [-3.43, -1.19] |
| n9-40 | 2131 | 44.33 | 18.74 | BEATS -25.59 [-28.34, -22.78] | 17.47 | BEATS -1.27 [-2.24, -0.26] |

- Survivors only (rows with an S+1 outcome), which favours looser caps.
- The cap population is an upper bound, because KTC is unknown historically.
- Every row starts from arm B at the 2a k, as the wiring decision measured. Second-year WRs, which the app starts from arm A, are not measured separately.

No cap at all also beats cap-before (§10.1 of the wiring file). Reported, not acted on.


## D-55 — two-season (S+2) arm comparison

Arm A (position baseline) vs arm B (neutral projection) against the S+2 outcome (`nextPPG2`, S ≤ 2023, gp ≥ 6). **Admitted** = the Q1 rows with an S+2 outcome, with or without an S+1 outcome (11887 rows); **survivors** = those that also have one (10526 rows, app 2c-wiring §1b's population). Updated: arm A blended at its subgroup's pooled arm-A kFit (YE0 2.40, YE1 3.60); arm B at the 2a k. Δ = B − A in MAE (PPG), player-clustered.

| population | cell | rows | player-seasons | players | MAE prior A → B | Δ prior | MAE updated A → B | Δ updated |
|---|---|---|---|---|---|---|---|---|
| survivors | ALL | 10526 | 957 | 614 | 3.663 → 3.427 | BEATS -0.2358 [-0.4282, -0.0300] | 3.064 → 3.071 | NO-GAIN 0.0071 [-0.0729, 0.0909] |
| survivors | QB | 604 | 53 | 30 | 5.274 → 4.727 | NO-GAIN -0.5471 [-1.3941, 0.2818] | 4.202 → 4.200 | NO-GAIN -0.0020 [-0.3903, 0.3907] |
| survivors | QB\|YE0 | 294 | 27 | 27 | 5.168 → 4.803 | NO-GAIN -0.3646 [-1.4933, 0.7679] | 4.881 → 4.799 | NO-GAIN -0.0820 [-0.5723, 0.4165] |
| survivors | QB\|YE1 | 310 | 26 | 26 | 5.375 → 4.655 | NO-GAIN -0.7201 [-1.8885, 0.4637] | 3.557 → 3.631 | NO-GAIN 0.0740 [-0.3829, 0.5207] |
| survivors | RB | 3402 | 308 | 198 | 4.177 → 3.800 | NO-GAIN -0.3766 [-0.7827, 0.0188] | 3.501 → 3.434 | NO-GAIN -0.0670 [-0.2301, 0.0885] |
| survivors | RB\|YE0 | 1734 | 161 | 161 | 4.400 → 3.668 | BEATS -0.7322 [-1.3810, -0.1230] | 3.571 → 3.487 | NO-GAIN -0.0840 [-0.3547, 0.1657] |
| survivors | RB\|YE1 | 1668 | 147 | 147 | 3.945 → 3.938 | NO-GAIN -0.0069 [-0.4042, 0.3700] | 3.429 → 3.379 | NO-GAIN -0.0494 [-0.2126, 0.1078] |
| survivors | WR | 4147 | 371 | 236 | 3.430 → 3.533 | NO-GAIN 0.1029 [-0.2076, 0.4078] | 2.980 → 3.092 | NO-GAIN 0.1123 [-0.0157, 0.2398] |
| survivors | WR\|YE0 | 2149 | 194 | 194 | 3.912 → 3.602 | NO-GAIN -0.3104 [-0.7436, 0.1416] | 3.225 → 3.359 | NO-GAIN 0.1344 [-0.0445, 0.3180] |
| survivors | WR\|YE1 | 1998 | 177 | 177 | 2.911 → 3.459 | WORSE 0.5475 [0.2450, 0.8511] | 2.717 → 2.805 | NO-GAIN 0.0885 [-0.0446, 0.2180] |
| survivors | TE | 2373 | 225 | 153 | 2.922 → 2.375 | BEATS -0.5469 [-0.8478, -0.2406] | 2.295 → 2.227 | NO-GAIN -0.0680 [-0.1922, 0.0563] |
| survivors | TE\|YE0 | 1156 | 113 | 113 | 3.145 → 2.239 | BEATS -0.9062 [-1.3617, -0.4438] | 2.301 → 2.178 | NO-GAIN -0.1235 [-0.3008, 0.0576] |
| survivors | TE\|YE1 | 1217 | 112 | 112 | 2.711 → 2.505 | NO-GAIN -0.2056 [-0.5162, 0.1001] | 2.290 → 2.274 | NO-GAIN -0.0153 [-0.1504, 0.1207] |
| admitted | ALL | 11887 | 1096 | 731 | 3.756 → 3.319 | BEATS -0.4375 [-0.6218, -0.2585] | 3.024 → 2.958 | NO-GAIN -0.0658 [-0.1436, 0.0080] |
| admitted | QB | 678 | 62 | 38 | 5.360 → 4.739 | NO-GAIN -0.6214 [-1.3543, 0.1542] | 4.322 → 4.291 | NO-GAIN -0.0308 [-0.3672, 0.3152] |
| admitted | QB\|YE0 | 314 | 29 | 29 | 5.258 → 4.758 | NO-GAIN -0.4995 [-1.5604, 0.6078] | 4.699 → 4.622 | NO-GAIN -0.0773 [-0.5452, 0.4068] |
| admitted | QB\|YE1 | 364 | 33 | 33 | 5.448 → 4.721 | NO-GAIN -0.7266 [-1.6939, 0.3241] | 3.996 → 4.005 | NO-GAIN 0.0093 [-0.3950, 0.4101] |
| admitted | RB | 3835 | 350 | 229 | 4.367 → 3.694 | BEATS -0.6726 [-1.0598, -0.2958] | 3.485 → 3.319 | BEATS -0.1658 [-0.3222, -0.0103] |
| admitted | RB\|YE0 | 1982 | 184 | 184 | 4.690 → 3.529 | BEATS -1.1615 [-1.7325, -0.5732] | 3.543 → 3.329 | NO-GAIN -0.2136 [-0.4529, 0.0268] |
| admitted | RB\|YE1 | 1853 | 166 | 166 | 4.021 → 3.871 | NO-GAIN -0.1498 [-0.5203, 0.2169] | 3.423 → 3.309 | NO-GAIN -0.1146 [-0.2760, 0.0404] |
| admitted | WR | 4699 | 428 | 290 | 3.483 → 3.379 | NO-GAIN -0.1041 [-0.3912, 0.1746] | 2.914 → 2.947 | NO-GAIN 0.0327 [-0.0855, 0.1508] |
| admitted | WR\|YE0 | 2379 | 220 | 220 | 4.080 → 3.469 | BEATS -0.6114 [-1.0154, -0.1849] | 3.187 → 3.199 | NO-GAIN 0.0123 [-0.1604, 0.1855] |
| admitted | WR\|YE1 | 2320 | 208 | 208 | 2.870 → 3.286 | WORSE 0.4161 [0.1429, 0.6987] | 2.636 → 2.689 | NO-GAIN 0.0537 [-0.0704, 0.1769] |
| admitted | TE | 2675 | 256 | 177 | 2.956 → 2.316 | BEATS -0.6396 [-0.9113, -0.3626] | 2.228 → 2.124 | NO-GAIN -0.1042 [-0.2155, 0.0053] |
| admitted | TE\|YE0 | 1319 | 131 | 131 | 3.281 → 2.200 | BEATS -1.0815 [-1.5187, -0.6602] | 2.266 → 2.070 | BEATS -0.1961 [-0.3669, -0.0281] |
| admitted | TE\|YE1 | 1356 | 125 | 125 | 2.639 → 2.429 | NO-GAIN -0.2098 [-0.5014, 0.0751] | 2.191 → 2.176 | NO-GAIN -0.0147 [-0.1413, 0.1048] |

**Rule:** A cell starts from the position baseline iff its admitted prior Δ (B − A, MAE against the S+2 outcome) is WORSE; otherwise from the projection. A cell with no Δ is undecided (null) and never counts as a flip.

- YE0 kind: QB projection, RB projection, WR projection, TE projection
- YE1 kind: QB projection, RB projection, WR position, TE projection

No flip — equals the shipped PROSPECT_PRIOR_KIND.

## D-56(a) — arm-A k for second-year WRs

Pre-registered ladder [YE1 pooled, own position] on arm A against S+1 (app 2c-wiring §9); the app routes only WR|YE1 here.

Pooled YE1 arm A: 7583 rows, 684 players, kFit 3.6 [2.7, 4.8].

| pos | rows | players | own kFit [CI] | own vs pooled | chosen | pinned k | shipped |
|---|---|---|---|---|---|---|---|
| QB | — | — | — | own INSUFFICIENT | pooled | 3.5 | 3.5 |
| RB | 2381 | 214 | 3.4 [2.1, 5.7] | NO-GAIN -0.0027 [-0.0111, 0.0060] | pooled | 3.5 | 3.5 |
| WR | 2997 | 268 | 4.3 [2.8, 6.8] | WORSE 0.0177 [0.0005, 0.0348] | pooled | 3.5 | 3.5 |
| TE | 1788 | 165 | 3.9 [2.1, 6.9] | WORSE 0.0213 [0.0088, 0.0343] | pooled | 3.5 | 3.5 |

Equals the shipped pin — an app re-pin to this constants file is provenance only.


## D-64 — 2c on the current QB model

No 2c constant, reuse entry or decision moved against `backtests/2026-09-27-inseason-dyn-constants.json` (reuse `source` strings aside).

Q2 pooled (this run): Proj Δ NO-GAIN (mean 0.0230, CI [-0.0237, 0.0722]); ΔHP NO-GAIN (mean -0.0833, CI [-0.1946, 0.0241]) (also in `q2.decision.deltaHP`). These are the leaves the comparison panel carries; the constants, reuse entries and decisions above are what the app pins.

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
| S+1 | 62 | 4.455 | 3.960 | 4.108 | 4.318 | NO-GAIN | NO-GAIN | NO-GAIN |
| S+2 | 38 | 4.596 | 4.480 | 4.580 | 5.033 | NO-GAIN | NO-GAIN | NO-GAIN |

Fallbacks to B0 (group below 5 training players): S+1 GC 0, RC 0; S+2 GC 0, RC 0.

**Q4b — posterior** at the pinned 2a rookie k (6.5), 494 rows / 48 players: MAE B0 4.025, GS 3.709, GC 3.675, RC 3.919. Δ GS NO-GAIN (mean -0.3161, CI [-0.7335, 0.1205]); Δ GC NO-GAIN (mean -0.3496, CI [-0.7717, 0.0957]); Δ RC NO-GAIN (mean -0.1063, CI [-0.4469, 0.2405]).

**Q4d — position control** (Σ S+1 PPG / Σ B0 over YE0 survivors): QB 1.124 (62 players), RB 1.135 (240 players), WR 1.089 (342 players), TE 1.053 (188 players). QB 1.124 vs RB∪WR∪TE 1.101: difference 0.023, CI [-0.0922, 0.1431] → none.

**k check:** not run (no candidate chosen).

**Q4c — season-S level by week-1 role (report-only; per-cell means, cells under 3 players suppressed):**

| group | backup (n / PPG / B0 / GS) | incumbent (n / PPG / B0 / GS) | no-chart (n / PPG / B0 / GS) | not-on-chart (n / PPG / B0 / GS) |
|---|---|---|---|---|
| top12 | 13 / 14.5 / 16.4 / 15.8 | 13 / 15.9 / 16.4 / 15.8 | 0 / — / — / — | 0 / — / — / — |
| r1 | 4 / 11.2 / 13.8 / 14.4 | 1 / — / — / — | 0 / — / — / — | 0 / — / — / — |
| day2 | 7 / 8.2 / 10.4 / 13.3 | 2 / — / — / — | 0 / — / — / — | 0 / — / — / — |
| day3+ | 7 / 8.3 / 7.2 / 12.3 | 1 / — / — / — | 1 / — / — / — | 2 / — / — / — |

Week-1 incumbents (17 players, report-only — too few to decide anything): MAE B0 3.348, GS 2.651, Δ GS NO-GAIN (mean -0.6969, CI [-1.6260, 0.1878]).

**What history cannot test (F6):** KTC history starts 2026-05-18 and the reconstruction holds `ktcMult` and college at 1.0, so the live `projectedPPG` excess for top picks (P12a Q4) is out of reach of any held-out test until a completed season carries KTC values (~2027). This run tests the neutral level only.

**Decision — Q4: `keep`.**

## Q5 — Sat-longer discount (D-60)

**Definition (the app's, F3).** A `years_exp` 0 QB whose preseason chain role is `backup`; at team-game index g, residual = starts − Σ_{i<g} preseason.perGame[i]; sat-longer iff residual < −1. It multiplies the prospect prior by 0.9 and is re-evaluated at every checkpoint. **Transport:** the data side uses the week-1 chart team (the app: his current team) and `draftYear === S` (the app: `years_exp` 0). P6a Q5 measured the residual at the end of the fitted window on takeover rows; this replicates the app's own residual at each of checkpoints 1–12.

Population: 89 preseason-backup rookie QBs; 31 ever flagged; 25 flagged at the last checkpoint. Roles seen among rookies on the week-1 chart: {"backup":89,"incumbent":18,"no-chart":1,"other":0}.

**Q5a — S+1 PPG on flagged checkpoint rows:** 13 players / 66 rows (floor 20 players) → `insufficient`, discount 0.9. dFull 1.09. MAE d=1.0 5.787, d=0.90 6.332, LOSO 6.627. Labels: LOSO vs 0.90 NO-GAIN; none vs 0.90 BEATS; none vs LOSO WORSE.

**Q5b — persistence into year 2** (prior-only, flagged at the last rookie checkpoint, S+2 PPG): 6 players (floor 20) → `insufficient`; dFull 1.10; label NO-GAIN. **Limitation:** this is the rookie-path level at `yearsExp` 1; a flagged rookie who played enough in S to be veteran-routed at S+1 gets the veteran projection as his arm-B prior (assembleSeason and the app), so Q5b over-covers. It is `insufficient` either way.

**Q5c — flagged-ever vs never-flagged (report-only; suppressed as a pair below 3 players):**

| group | players | with S+1 PPG | mean S+1 / prior | S+1 primary-passer share |
|---|---|---|---|---|
| flagged ever | 31 | 13 | 1.180 | 27.0% |
| never flagged | 58 | 25 | 1.160 | 30.2% |

**Decision — Q5a: `insufficient` (0.9); Q5b: `insufficient`.** Outputs are aggregates only: counts, MAE, labels, CIs and the full-sample fitted d — never per-player, per-rookie-season or per-fold values.

## For wiring

- **Always (W0):** registry edits from the companion; app re-pins `IN_SEASON_DYN_PANEL_SOURCE` + fixture to this panel by byte copy; D-64 resolved, D-60 per Q5.
- **Q5 → insufficient:** keep 0.90 in `qbTakeoverConstants.js`/`inSeasonScoring.js`, PROVISIONAL(heuristic) re-cited to this verdict; no score moves. Q5b `insufficient`.
- **Q4 → keep:** CR-25/CR-27 text only.

## Excluded population

Q1: YE<=1 player-seasons 2046 (rows 20928, players 1310). No S+1 outcome — absent: player-seasons 390 (rows 3310); gp<6: player-seasons 274 (rows 2624). draftYear unusable: player-seasons 5 (rows 54). routeMismatch: player-seasons 0 (rows 0, rate 0.00%). YE1-in-rookie0: player-seasons 50 (rows 511). YE2-3 no qualifying season: player-seasons 344 (rows 3211).
Q2: SHORT-recent player-seasons 195 (rows 2133), SHORT-stale player-seasons 59 (rows 574), SHORT-noL player-seasons 0 (rows 0). No S+1 outcome — absent: player-seasons 262 (rows 2484, includes retirements); gp<6: player-seasons 123 (rows 1131). Without a projPrior: player-seasons 9 (rows 93).

## Limitations

- **Basis:** pinned half_ppr — k is dimensionless; a league-basis refit stays with backlog D-45.
- **D4 pick proxy:** a 12-team, 5-round league shape applied to any league; the actual league draft is not reconstructable.
- **D5 YE1 quirk:** the app's `selectRookieDraft` reads only the most recent rookie draft, so every second-year player gets `draftMultiplier(null) = 0.75` and loses the premium-pick exemption. Reported, not fixed here.
- **D6 age date:** whole years on `${S}-09-01` from `birthdate`; `player.age ?? 23` is the app default when null.
- **Survivorship:** more than half of SHORT player-seasons and a large share of rookie-path player-seasons have no S+1 outcome (busts vanish from every fitted number).
- **KTC unmeasurable:** KTC snapshot history starts 2026-05-18; whether KTC itself reacts to in-season evidence is untestable until ~Jan 2027 (rest-of-season) / ~Jan 2028 (S+1 graded).
- The prospect score's other inputs (the KTC anchor at 60%, the peak clamp, the cap of 35 on the starting value) are reported (§Q3), not fitted.
- **Fixed-rung leakage:** a ladder rung that reuses a 2a-pinned or `K_DYN_POINTS_HISTORY` k was fitted on other rows, including rows from the held-out season — this favours the fixed rung, the conservative direction.

**Reproduce:** `node bin/backtest.mjs --inseason --dynasty --write`
