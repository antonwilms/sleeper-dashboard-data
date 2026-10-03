# P6a — QB backup→starter takeover (2026-10-03)

Seasons 2013–2025, half-PPR, offline analysis; every comparison is leave-one-season-out with the team-season cluster bootstrap (4000 resamples, seed 12345). Constants file: `backtests/2026-10-03-qb-takeover-constants.json`.

## Summary

- Hazard rows 9381 (603 events); stickiness rows 1300 (989 stays); game-1 rows 548 (12 events, never fitted).
- Hazard ladder adopted: **dp, og, rk, iq**. Stickiness adopted: **st**.
- Q4 pooled held-out ΔMAE of the chain vs the pooled chain: -0.0325 [-0.0370, -0.0278] **BEATS**; vs the per-depth-order rate: -0.0047 [-0.0075, -0.0019] **BEATS**.

## Coverage

| season | REG team-games | with a primary passer | rate |
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

Excluded: noPrimary 8, noPrevPrimary 3, noGame1Primary 2, noChart 0, noChartG1 32, noCrosswalk 0, noCrosswalkStick 0.

## Q1 — Timing

| era | checks (g ≥ 2) | QB1(chart w) = primary of game w | = primary of game w−1 |
|---|---|---|---|
| legacy | 5870 | 86.9% | 91.9% |
| espn | 512 | 88.5% | 89.3% |

Sensitivity (report-only; the primary analysis keeps the §3.2 rule): ladder-final features `dp+og+rk+iq` refitted with legacy checkpoints from chart(w−1).

| version | hazard rows | pooled LOSO log-loss | legacy-era-only log-loss |
|---|---|---|---|
| primary (legacy chart(w)) | 9381 | 0.2130 | 0.2132 |
| legacy from chart(w−1) | 9378 | 0.2144 | 0.2144 |

## Q2 — Hazard ladder (`pUp`)

| candidate | features tried | LL before | LL after | Δ mean | 95% CI | label | adopted |
|---|---|---|---|---|---|---|---|
| dp | dp | 0.2387 | 0.2191 | -0.0196 | [-0.0242, -0.0148] | BEATS | yes |
| og | dp+og | 0.2191 | 0.2178 | -0.0013 | [-0.0025, -0.0001] | BEATS | yes |
| dg | dp+og+dg | 0.2178 | 0.2173 | -0.0005 | [-0.0014, 0.0005] | NO-GAIN | no |
| ps | dp+og+ps | 0.2178 | 0.2169 | -0.0008 | [-0.0017, 0.0001] | NO-GAIN | no |
| rk | dp+og+rk | 0.2178 | 0.2167 | -0.0011 | [-0.0020, -0.0002] | BEATS | yes |
| iq | dp+og+rk+iq | 0.2167 | 0.2130 | -0.0037 | [-0.0055, -0.0019] | BEATS | yes |
| bn | dp+og+rk+iq+bn | 0.2130 | 0.2132 | 0.0001 | [-0.0000, 0.0003] | NO-GAIN | no |
| wk | dp+og+rk+iq+wk | 0.2130 | 0.2127 | -0.0004 | [-0.0010, 0.0003] | NO-GAIN | no |
| wp | dp+og+rk+iq+wp | 0.2130 | 0.2120 | -0.0010 | [-0.0021, 0.0001] | NO-GAIN | no |

Final model (all seasons): `dp + og + rk + iq`. Held-out pooled log-loss 0.2130, Brier 0.0559.

| coefficient | β |
|---|---|
| intercept | -2.8804 |
| dp=d1 | 1.1438 |
| dp=d3 | -1.2045 |
| og=yes | 0.5135 |
| rk=rookie | 0.515 |
| iq=weak | 0.6519 |
| iq=strong | -0.3787 |
| iq=unknown | 0.1323 |

Held-out calibration by decile of p:

| decile | rows | mean p | mean y |
|---|---|---|---|
| 1 | 938 | 0.0131 | 0.0149 |
| 2 | 938 | 0.0199 | 0.0171 |
| 3 | 938 | 0.0312 | 0.0277 |
| 4 | 938 | 0.0365 | 0.0480 |
| 5 | 938 | 0.0389 | 0.0426 |
| 6 | 938 | 0.0522 | 0.0533 |
| 7 | 938 | 0.0537 | 0.0426 |
| 8 | 938 | 0.0690 | 0.0725 |
| 9 | 938 | 0.0974 | 0.0938 |
| 10 | 939 | 0.2323 | 0.2300 |

### `pUp` for representative cases (final model, wk = mid, other features at base: day-3 vet, first start, mid incumbent, b0, order 2, wp mid, og no)

| case | pUp |
|---|---|
| top-12 rookie | 0.0859 |
| day-3 vet (base) | 0.0531 |
| weak incumbent | 0.0972 |
| strong incumbent | 0.0370 |
| benched b0 (base) | 0.0531 |
| benched b2 (8+ games) | 0.0531 |
| order 1 non-incumbent (d1) | 0.1497 |
| order 3+ (d3) | 0.0165 |
| returning game-1 starter (og) | 0.0857 |
| previously started (ps = re) | 0.0531 |

A case that shows the same `pUp` as the base is a feature the ladder did not adopt (no held-out signal).

## Q3 — Stickiness ladder (`pStay`)

| candidate | features tried | LL before | LL after | Δ mean | 95% CI | label | adopted |
|---|---|---|---|---|---|---|---|
| st | st | 0.5523 | 0.5374 | -0.0149 | [-0.0246, -0.0051] | BEATS | yes |
| dg3 | st+dg3 | 0.5374 | 0.5355 | -0.0020 | [-0.0073, 0.0036] | NO-GAIN | no |
| dq | st+dq | 0.5374 | 0.5420 | 0.0045 | [-0.0052, 0.0198] | NO-GAIN | no |
| rk | st+rk | 0.5374 | 0.5342 | -0.0033 | [-0.0091, 0.0023] | NO-GAIN | no |

Final model: `st`. Held-out pooled log-loss 0.5374, Brier 0.1777.

| coefficient | β |
|---|---|
| intercept | 0.7877 |
| st=s2 | 0.2005 |
| st=s3 | 0.9821 |

## Q4 — Rest-of-season start fraction

hazard rows with >= 4 remaining team games (g from 2 to G-3). MAE of the expected start fraction against the actual fraction of remaining games started (held-out). ΔMAE = chain − baseline, so negative means the chain is closer.

| subset | n | MAE chain | MAE pooled chain (a) | MAE depth rate (b) | MAE app flat (c) | Δ vs (a) | Δ vs (b) |  |
|---|---|---|---|---|---|---|---|---|
| pooled | 7510 | 0.148 | 0.180 | 0.152 | 0.731 | -0.0325 [-0.0370, -0.0278] BEATS | -0.0047 [-0.0075, -0.0019] BEATS |  |
| excluding og = yes | 6859 | 0.135 | 0.168 | 0.141 | 0.746 | -0.0329 [-0.0371, -0.0286] BEATS | -0.0053 [-0.0081, -0.0025] BEATS |  |
| dg = udfa | 1650 | 0.129 | 0.164 | 0.132 | 0.751 | -0.0346 [-0.0436, -0.0256] BEATS | -0.0026 [-0.0086, 0.0037] NO-GAIN |  |
| dg = day3 | 2622 | 0.130 | 0.165 | 0.134 | 0.760 | -0.0350 [-0.0421, -0.0274] BEATS | -0.0038 [-0.0081, 0.0005] NO-GAIN |  |
| dg = day2 | 1859 | 0.155 | 0.181 | 0.159 | 0.739 | -0.0263 [-0.0348, -0.0178] BEATS | -0.0041 [-0.0103, 0.0016] NO-GAIN |  |
| dg = r1 | 455 | 0.162 | 0.198 | 0.176 | 0.683 | -0.0354 [-0.0555, -0.0149] BEATS | -0.0131 [-0.0255, 0.0003] NO-GAIN |  |
| dg = top12 | 924 | 0.208 | 0.240 | 0.216 | 0.620 | -0.0327 [-0.0513, -0.0145] BEATS | -0.0081 [-0.0179, 0.0014] NO-GAIN |  |

Baseline (c) is reported as MAE only, with no label: MAE only, no label — d1 non-incumbent capped at 1.0 (a share cannot exceed 1; the app multiplier is 1.05), QB2 0.88, QB3+ 0.68, rookie 1.0. Against a population whose per-game takeover hazard is about 5%, that comparison is decided in advance, and reading a PPG multiplier as a start share is a framing, not an equivalence.

**Selection optimism.** The ladder chose its features using every season's LOSO result, and Q4 is evaluated on those same seasons, so the chain's Q4 margin is optimistic by an unmeasured amount.

## Q5 — Dynasty "sat longer" (report-only, no constant)

Report-only; no constant is pinned from Q5. Expected starts use the final (all-season) models from the rookie's first checkpoint; actual = primary games from that game to season end. residual = actual − expected; sat-longer < −1, earlier > +1.

Population: 48 drafted QBs (draftOvr ≤ 100, classes 2013–2023).

| group | n | mean residual | next-season primary share (n) | next PPG (n) | S+2 share (n) | S+2 PPG (n) |
|---|---|---|---|---|---|---|
| earlier | 25 | 5.424 | 0.702 (25) | 15.489 (23) | 0.520 (25) | 15.339 (18) |
| earlier / day2 | 7 | 4.740 | 0.506 (7) | 14.301 (5) | 0.188 (7) | 11.879 (3) |
| earlier / r1 | 5 | 4.449 | 0.630 (5) | 14.329 (5) | 0.236 (5) | 11.013 (3) |
| earlier / top12 | 13 | 6.168 | 0.835 (13) | 16.392 (13) | 0.808 (13) | 17.285 (12) |
| on-track | 8 | -0.249 | 0.293 (8) | 14.237 (3) | 0.308 (8) | 12.086 (4) |
| on-track / day2 | 5 | -0.625 | 0.000 (5) | — (0) | 0.035 (5) | 7.400 (1) |
| on-track / top12 | 3 | 0.378 | 0.782 (3) | 14.237 (3) | 0.762 (3) | 13.648 (3) |
| sat-longer | 15 | -2.581 | 0.298 (15) | 11.604 (8) | 0.079 (15) | 5.356 (7) |
| sat-longer / day2 | 9 | -1.972 | 0.252 (9) | 9.178 (4) | 0.041 (9) | 2.785 (5) |
| sat-longer / r1 | 3 | -1.805 | 0.186 (3) | 6.984 (2) | 0.000 (3) | 2.925 (1) |
| sat-longer / top12 | 3 | -5.184 | 0.549 (3) | 21.076 (2) | 0.271 (3) | 20.646 (1) |

Anton decides on the "mild discount" for sitting longer than draft capital predicts; nothing here pins it.

## Q6 — Raw rates (unmodelled)

### Draft group × rookie × prior start

| dg | rk | ps | trials | events | rate |
|---|---|---|---|---|---|
| udfa | rookie | first | 217 | 8 | 3.7% |
| udfa | rookie | re | 22 | 3 | 13.6% |
| udfa | vet | first | 1556 | 58 | 3.7% |
| udfa | vet | re | 289 | 23 | 8.0% |
| day3 | rookie | first | 581 | 21 | 3.6% |
| day3 | rookie | re | 74 | 6 | 8.1% |
| day3 | vet | first | 2269 | 78 | 3.4% |
| day3 | vet | re | 334 | 43 | 12.9% |
| day2 | rookie | first | 224 | 14 | 6.3% |
| day2 | rookie | re | 39 | 6 | 15.4% |
| day2 | vet | first | 1590 | 74 | 4.7% |
| day2 | vet | re | 456 | 62 | 13.6% |
| r1 | rookie | first | 51 | 7 | 13.7% |
| r1 | rookie | re | 24 | 6 | 25.0% |
| r1 | vet | first | 298 | 18 | 6.0% |
| r1 | vet | re | 203 | 25 | 12.3% |
| top12 | rookie | first | 69 | 14 | 20.3% |
| top12 | rookie | re | 42 | 13 | 31.0% |
| top12 | vet | first | 577 | 36 | 6.2% |
| top12 | vet | re | 466 | 88 | 18.9% |

### Depth order by era

| dp | era | trials | events | rate |
|---|---|---|---|---|
| d1 | espn | 51 | 17 | 33.3% |
| d1 | legacy | 476 | 139 | 29.2% |
| d2 | espn | 464 | 35 | 7.5% |
| d2 | legacy | 5382 | 342 | 6.4% |
| d3 | espn | 379 | 6 | 1.6% |
| d3 | legacy | 2629 | 64 | 2.4% |

### Order-1 non-incumbents (d1) by `og` and era

| og | era | trials | events | rate |
|---|---|---|---|---|
| no | espn | 8 | 1 | 12.5% |
| no | legacy | 200 | 53 | 26.5% |
| yes | espn | 43 | 16 | 37.2% |
| yes | legacy | 276 | 86 | 31.2% |

### Game-1 rows (never fitted) by depth order

| dp | trials | events | rate |
|---|---|---|---|
| d2 | 376 | 12 | 3.2% |
| d3 | 172 | 0 | 0.0% |

Game-1 overall: 12/548 = 2.2% (legacy seasons only — the ESPN-era game-1 chart does not exist).

## For P6b

Inputs P6b must compute live, from the §3.4 definitions: `dg` (draft capital), `rk`, `ps` (primary passer of an earlier calendar week of this season), `iq` (incumbent incPPG ÷ all-teams median as of the calendar week — half-PPR vs league basis cancels to first order), `bn` (non-incumbent chart games not primary), `wk`, `dp` (depth order), `wp`, `og`; stickiness `st`, `dg3`, `rk`, `dq`. Only the ladder-final features are used by the pinned models; the rest need not be computed.

**Transport caveats.**

- The model leans on the depth chart: `dp` is in the final hazard model. The app's only live source is Sleeper `depth_chart_order`, which differs from nflverse depth. The one measurement (data-catalog D5) is 68.8% QB depth-1 agreement (n = 32) between the app snapshot of 2026-09-05 and nflverse 2025 week 18 — a cross-season comparison that offseason moves inflate, so it is an upper bound on disagreement, not a same-week agreement rate.
- g = 1 (pre-kickoff) has no fitted model here: the hazard is extrapolated at `bn=b0`, `wk=early`, `ps=first`, `wp=mid`, `og=no`, with `iq` from the g = 1 rule; the raw g = 1 rate above shows the gap.
- ROS uses the starter PPG from the existing projection; the chain supplies only P(start).

**What this does NOT model:** injury status, coach changes, trades after the checkpoint.

Chain: State = (role, ps, c, s). role ∈ {B (non-starter), S (starter)}; ps ∈ {first, re} for B; c = benched count capped at 8 (enough for every bn bin: b0 0–2, b1 3–7, b2 8+); s = consecutive-start streak capped at 4 for S (st bins: s1 = 1, s2 = 2–3, s3 = 4+). 9 (B, first) + 9 (B, re) + 9×4 (S, carrying c so a demoted starter resumes his count) = 54 states.

Into game j (wk code from that game's team-game index): (B, ps, c) → (S, c, 1) with p = pUp(codes with ps, bn(c), wk), else (B, ps, min(c+1, 8)). (S, c, s) → (S, c, min(s+1, 4)) with p = pStay(st(s), dg3, rk, dq), else (B, re, c) with NO increment (in the demotion game he was the incumbent, and bn counts only non-incumbent games). Held at checkpoint values: iq, dq, wp, dg/dg3, rk, dp, og. A demoted starter re-enters B at the checkpoint dp (a stated simplification). Returning original starter (og = yes): once he is starter again the chain uses the backup-origin pStay with dq = unknown (an approximation — the stickiness model is fitted only on backup-origin starters). expected = Σ_j P(role = S at game j); the first remaining game is entered from the checkpoint state.

Fixture refit check: exact (|Δβ| < 1e-9) (hazard 3.33e-16, stickiness 0.00e+0).

**Reproduce:** node bin/backtest.mjs --qb-takeover --write
