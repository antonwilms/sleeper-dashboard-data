# LP-2b-1c-i — why the weekly layer ties B1c (2026-11-19) — report-only

Offline research; nothing here ships and nothing is registered, labelled or gated. Task file: `.claude/tasks/learned-projection-2b1c1-weekly-analyses.md`. Folds evaluated: 2019, 2020, 2021, 2022, 2023, 2024. **The 2025 season is held and appears in no frame.** Every arm and band below is *exploratory — not a candidate, no label*.

## 0. Answers for Anton

**(1) Why the weekly layer ties B1c.** No arm meets the finding rule (its difference from the registered H has a confidence interval entirely below 0 and is at least 1% of H's error), so no "FINDING for Anton" line is printed and §0a says "override speed does not explain the tie" at QB, RB, WR and TE. One arm-and-position cell has its interval entirely below 0 but is under 1%: h_ks2 (k scaled by 2) at WR, d −0.019 [−0.036, −0.002], 0.3% of MAE(H) (§6). The widened k grid does not meet it at any position (§0a: d +0.003 at QB, +0.000 at RB, −0.000 at WR, +0.002 at TE; "R-W does not hold" at all four). Against B1c by week band, H is distinguishable only at RB in weeks 10 and later (below 0, d −0.110); every other position-and-band interval includes 0 (§0a).

**(2) Whether a grid-edge setting plausibly costs accuracy, split by edge.** Only the k-high edge has development-fold evidence, through route (b), the widened k grid (above): its difference from H does not meet R-W at any position. The k-high edge's training-SSE drop over the last grid step has a median of 0.0002 at QB (9 target-folds), 0.0004 at RB (27), 0.0004 at WR (9) and 0.0005 at TE (18). The k-low and ρ-low edges have training-SSE medians only and no test-fold arm in this slice: k-low 0.0032 at RB (5 target-folds); ρ-low 0.0003 at QB (3 target-folds) and 0.0042 at RB (11). §0a lists no k-low edge at QB, WR or TE and no ρ-low edge at WR or TE. At the season layer, the λ surface is still falling at the edge for RB under H (6 of 6 folds, mean drop 1.193%); R-S does not hold for QB, WR or TE under H, or for G at any position. The season α, k-multiple and δ training errors are not recorded, so whether those edges cost accuracy cannot be judged; the shares of season-H target-folds at an edge are in §0a (R3).

**(3) Recommendation on LP-2b-2.** STOP for Anton before LP-2b-2 is planned: the season λ surface is still falling at the edge (RB, H), and LP-2b-2 planning also waits on Anton's ruling on the unrecorded season α / k-multiple / δ edges (§0a R2, R3).

**(4) Whether a new weekly candidate is worth registering.** §0a R4: no candidate change is indicated, because no arm meets R-W at RB or WR. Gating a third weekly candidate or re-registering needs a ruling by Anton (LP-1a §8), and any setting chosen from these development-fold numbers has been selected on them.

### 0a. Rule outcomes (printed by the runner; mechanical)

```
R1 (override speed):
  QB: override speed does not explain the tie at QB
  RB: override speed does not explain the tie at RB
  WR: override speed does not explain the tie at WR
  TE: override speed does not explain the tie at TE
  QB H − B1c by band: 0-3 neither (d +0.001); 4-8 neither (d +0.013); 9+ neither (d +0.002); the largest |d| is in band 4-8
  RB H − B1c by band: 0-3 neither (d +0.039); 4-8 neither (d -0.050); 9+ below 0 (d -0.110); the largest |d| is in band 9+
  WR H − B1c by band: 0-3 neither (d -0.092); 4-8 neither (d -0.009); 9+ neither (d +0.004); the largest |d| is in band 0-3
  TE H − B1c by band: 0-3 neither (d -0.052); 4-8 neither (d +0.093); 9+ neither (d +0.078); the largest |d| is in band 4-8
R2 (edges):
  route (b), widened k grid, at QB: R-W does not hold (d +0.003 [-0.002, +0.009], +0.04% of MAE(H))
  route (b), widened k grid, at RB: R-W does not hold (d +0.000 [-0.001, +0.001], +0.00% of MAE(H))
  route (b), widened k grid, at WR: R-W does not hold (d -0.000 [-0.002, +0.001], -0.01% of MAE(H))
  route (b), widened k grid, at TE: R-W does not hold (d +0.002 [-0.000, +0.005], +0.04% of MAE(H))
  weekly H kMult high-edge, last-step SSE drop at QB: median 0.0002 over 9 target-folds
  weekly H rho low-edge, last-step SSE drop at QB: median 0.0003 over 3 target-folds
  weekly H kMult high-edge, last-step SSE drop at RB: median 0.0004 over 27 target-folds
  weekly H kMult low-edge, last-step SSE drop at RB: median 0.0032 over 5 target-folds
  weekly H rho low-edge, last-step SSE drop at RB: median 0.0042 over 11 target-folds
  weekly H kMult high-edge, last-step SSE drop at TE: median 0.0005 over 18 target-folds
  weekly H kMult high-edge, last-step SSE drop at WR: median 0.0004 over 9 target-folds
  R-S season λ, QB G: does not hold (2 of 6 folds at the edge and falling; mean drop 0.633%)
  R-S season λ, QB H: does not hold (0 of 6 folds at the edge and falling; mean drop —)
  R-S season λ, RB G: does not hold (4 of 6 folds at the edge and falling; mean drop 0.488%)
  R-S season λ, RB H: holds (6 of 6 folds at the edge and falling; mean drop 1.193%)
  R-S season λ, TE G: does not hold (2 of 6 folds at the edge and falling; mean drop 1.603%)
  R-S season λ, TE H: does not hold (3 of 6 folds at the edge and falling; mean drop 0.604%)
  R-S season λ, WR G: does not hold (3 of 6 folds at the edge and falling; mean drop 0.814%)
  R-S season λ, WR H: does not hold (2 of 6 folds at the edge and falling; mean drop 0.334%)
  STOP for Anton before LP-2b-2 is planned: the season λ surface is still falling at the edge (RB, H)
  The season layer's α / k-multiple / δ training errors are not recorded (`model_h.fit_target` keeps only the argmin; no season fits cache), so whether error was still falling at those edges cannot be judged without a refit — open for Anton.
R3 (LP-2b-2):
  LP-2b-2 planning waits on Anton's ruling on the unrecorded season α / k-multiple / δ edges (§3.1)
  season H alpha at RB: 88% of target-folds at an edge (edge-high 88%, interior 12%)
  season H alpha at WR: 90% of target-folds at an edge (edge-high 90%, interior 10%)
  season H delta at RB: 31% of target-folds at an edge (edge-low 31%, interior 39%, limit-high 31%)
  season H delta at WR: 48% of target-folds at an edge (edge-low 48%, interior 40%, limit-high 12%)
  season H kmult at RB: 60% of target-folds at an edge (edge-high 60%, interior 40%)
  season H kmult at WR: 40% of target-folds at an edge (edge-high 40%, interior 60%)
  and the season λ surface is still falling at the edge (R-S)
R4 (new candidate):
  no candidate change is indicated
  Gating a third weekly candidate or re-registering needs a ruling by Anton (LP-1a §8: at most two candidates, H and G, may be gated, and there is no re-registration path), and any setting chosen from these development-fold numbers has been selected on them.
```

## 1. The rulings (Anton, 2026-11-19, verbatim)

> 1. Split approved: 1c-i as proposed (incl. H vs B1c by week band), 1c-ii outline only, planned after 1c-i is verified. Both override-speed routes approved. (b) conditions: every output labelled exploratory with its own spec hash, never a candidate; nothing from it feeds a label, gate or LP-2b-2; if a widened H clearly beats the registered H, report it as a finding for Anton, no substitution. Addition to 1c-i: from the cached season-layer fits (no refit), report the training-error surface at the season α / k-multiple / δ grid edges, i.e. how much error was still falling at the edge, per position. If it is still clearly falling at RB or WR, flag it as a stop for Anton before LP-2b-2 is planned. Write the 1c-i task file, set the review depth, run plan-reviewer, report flags with triage.

## 2. Grid edges (§5)

| cand | layer | setting | pos | fitted cells | default cells | class shares |
|---|---|---|---|---|---|---|
| G | season | lam | QB | 6 | 0 | two-point 100% |
| G | season | lam | RB | 6 | 0 | two-point 100% |
| G | season | lam | TE | 6 | 0 | two-point 100% |
| G | season | lam | WR | 6 | 0 | two-point 100% |
| G | weekly | phi | QB | 6 | 0 | interior 100% |
| G | weekly | phi | RB | 6 | 0 | interior 100% |
| G | weekly | phi | TE | 6 | 0 | interior 100% |
| G | weekly | phi | WR | 6 | 0 | interior 100% |
| H | season | alpha | QB | 54 | 0 | edge-high 89%, interior 11% |
| H | season | alpha | RB | 72 | 0 | edge-high 88%, interior 12% |
| H | season | alpha | TE | 42 | 0 | edge-high 83%, edge-low 5%, interior 12% |
| H | season | alpha | WR | 60 | 0 | edge-high 90%, interior 10% |
| H | season | delta | QB | 54 | 0 | edge-low 28%, interior 41%, limit-high 31% |
| H | season | delta | RB | 72 | 0 | edge-low 31%, interior 39%, limit-high 31% |
| H | season | delta | TE | 42 | 0 | edge-low 48%, interior 38%, limit-high 14% |
| H | season | delta | WR | 60 | 0 | edge-low 48%, interior 40%, limit-high 12% |
| H | season | kmult | QB | 54 | 0 | edge-high 72%, interior 28% |
| H | season | kmult | RB | 72 | 0 | edge-high 60%, interior 40% |
| H | season | kmult | TE | 42 | 0 | edge-high 62%, interior 38% |
| H | season | kmult | WR | 60 | 0 | edge-high 40%, interior 60% |
| H | season | lam | QB | 6 | 0 | interior 17%, limit-low 83% |
| H | season | lam | RB | 6 | 0 | edge-high 100% |
| H | season | lam | TE | 6 | 0 | edge-high 50%, interior 33%, limit-low 17% |
| H | season | lam | WR | 6 | 0 | edge-high 33%, interior 50%, limit-low 17% |
| H | weekly | alpha | QB | 40 | 8 | interior 15%, limit-high 85% |
| H | weekly | alpha | RB | 55 | 11 | interior 25%, limit-high 75% |
| H | weekly | alpha | TE | 30 | 6 | interior 17%, limit-high 83% |
| H | weekly | alpha | WR | 45 | 9 | interior 22%, limit-high 78% |
| H | weekly | kMult | QB | 48 | 0 | edge-high 19%, interior 81% |
| H | weekly | kMult | RB | 66 | 0 | edge-high 41%, edge-low 8%, interior 52% |
| H | weekly | kMult | TE | 36 | 0 | edge-high 50%, interior 50% |
| H | weekly | kMult | WR | 54 | 0 | edge-high 17%, interior 83% |
| H | weekly | phi | QB | 6 | 0 | interior 100% |
| H | weekly | phi | RB | 6 | 0 | interior 100% |
| H | weekly | phi | TE | 6 | 0 | interior 100% |
| H | weekly | phi | WR | 6 | 0 | interior 100% |
| H | weekly | rho | QB | 48 | 0 | edge-low 6%, interior 65%, limit-high 29% |
| H | weekly | rho | RB | 66 | 0 | edge-low 17%, interior 45%, limit-high 38% |
| H | weekly | rho | TE | 36 | 0 | interior 39%, limit-high 61% |
| H | weekly | rho | WR | 54 | 0 | interior 65%, limit-high 35% |

Targets (or position-level settings) at an edge in at least four folds (atEdgeInAtLeast4Folds):

| cand | layer | setting | pos | target | folds | ends |
|---|---|---|---|---|---|---|
| H | season | alpha | QB | fum_lost | 6 | edge-high |
| H | season | alpha | QB | pass_att | 6 | edge-high |
| H | season | alpha | QB | pass_int | 6 | edge-high |
| H | season | alpha | QB | pass_td | 6 | edge-high |
| H | season | alpha | QB | pass_yd | 6 | edge-high |
| H | season | alpha | QB | rush_att | 6 | edge-high |
| H | season | alpha | QB | rush_td | 6 | edge-high |
| H | season | alpha | QB | rush_yd | 6 | edge-high |
| H | season | alpha | RB | bonus_fd_rb | 6 | edge-high |
| H | season | alpha | RB | bonus_rush_yd_100 | 5 | edge-high |
| H | season | alpha | RB | fum_lost | 6 | edge-high |
| H | season | alpha | RB | kr_yd | 6 | edge-high |
| H | season | alpha | RB | rec | 6 | edge-high |
| H | season | alpha | RB | rec_td | 6 | edge-high |
| H | season | alpha | RB | rec_tgt | 6 | edge-high |
| H | season | alpha | RB | rec_yd | 6 | edge-high |
| H | season | alpha | RB | rush_att | 4 | edge-high |
| H | season | alpha | RB | rush_td | 6 | edge-high |
| H | season | alpha | RB | rush_yd | 6 | edge-high |
| H | season | alpha | TE | bonus_fd_te | 5 | edge-high/edge-low |
| H | season | alpha | TE | bonus_rec_te | 4 | edge-high/edge-low |
| H | season | alpha | TE | gamesShare | 5 | edge-high |
| H | season | alpha | TE | rec | 6 | edge-high |
| H | season | alpha | TE | rec_td | 6 | edge-high |
| H | season | alpha | TE | rec_tgt | 5 | edge-high |
| H | season | alpha | TE | rec_yd | 6 | edge-high |
| H | season | alpha | WR | bonus_fd_wr | 6 | edge-high |
| H | season | alpha | WR | bonus_rec_yd_100 | 6 | edge-high |
| H | season | alpha | WR | kr_yd | 6 | edge-high |
| H | season | alpha | WR | pr_yd | 6 | edge-high |
| H | season | alpha | WR | rec | 6 | edge-high |
| H | season | alpha | WR | rec_td | 6 | edge-high |
| H | season | alpha | WR | rec_tgt | 6 | edge-high |
| H | season | alpha | WR | rec_yd | 6 | edge-high |
| H | season | alpha | WR | rush_yd | 6 | edge-high |
| H | season | delta | QB | rush_td | 5 | edge-low |
| H | season | delta | RB | bonus_rush_yd_100 | 4 | edge-low |
| H | season | delta | RB | fum_lost | 4 | edge-low |
| H | season | delta | TE | rec | 5 | edge-low |
| H | season | delta | TE | rec_td | 4 | edge-low |
| H | season | delta | WR | bonus_fd_wr | 5 | edge-low |
| H | season | delta | WR | kr_yd | 5 | edge-low |
| H | season | delta | WR | pr_yd | 6 | edge-low |
| H | season | delta | WR | rec_td | 5 | edge-low |
| H | season | delta | WR | rush_yd | 4 | edge-low |
| H | season | kmult | QB | gamesShare | 6 | edge-high |
| H | season | kmult | QB | pass_att | 6 | edge-high |
| H | season | kmult | QB | pass_int | 5 | edge-high |
| H | season | kmult | QB | pass_td | 6 | edge-high |
| H | season | kmult | QB | pass_yd | 6 | edge-high |
| H | season | kmult | QB | rush_td | 6 | edge-high |
| H | season | kmult | RB | bonus_fd_rb | 6 | edge-high |
| H | season | kmult | RB | gamesShare | 6 | edge-high |
| H | season | kmult | RB | rec | 6 | edge-high |
| H | season | kmult | RB | rec_td | 6 | edge-high |
| H | season | kmult | RB | rec_yd | 6 | edge-high |
| H | season | kmult | RB | rush_td | 6 | edge-high |
| H | season | kmult | RB | rush_yd | 6 | edge-high |
| H | season | kmult | TE | bonus_fd_te | 5 | edge-high |
| H | season | kmult | TE | rec | 5 | edge-high |
| H | season | kmult | TE | rec_td | 6 | edge-high |
| H | season | kmult | TE | rec_yd | 6 | edge-high |
| H | season | kmult | WR | bonus_fd_wr | 6 | edge-high |
| H | season | kmult | WR | gamesShare | 6 | edge-high |
| H | season | kmult | WR | rec_td | 6 | edge-high |
| H | season | kmult | WR | rec_yd | 6 | edge-high |
| H | season | lam | RB | — | 6 | edge-high |
| H | weekly | kMult | RB | fum_lost | 6 | edge-high |
| H | weekly | kMult | RB | rec | 5 | edge-high |
| H | weekly | kMult | RB | rec_td | 4 | edge-high |
| H | weekly | kMult | RB | rec_yd | 5 | edge-high |
| H | weekly | kMult | RB | rush_att | 5 | edge-low |
| H | weekly | kMult | RB | rush_td | 4 | edge-high |
| H | weekly | kMult | TE | rec | 5 | edge-high |
| H | weekly | kMult | TE | rec_td | 6 | edge-high |
| H | weekly | kMult | TE | rec_yd | 5 | edge-high |
| H | weekly | kMult | WR | rec_td | 6 | edge-high |
| H | weekly | rho | RB | rush_att | 6 | edge-low |

G's weekly layer is a fixed point model: no fitted grid (phi only).

## 3. Error surfaces at the edges (§6)

### 3.1 Weekly H: last-step SSE drop at an edge (median over target-folds; report-only)

| pos | axis | end | target-folds | median drop | min | max |
|---|---|---|---|---|---|---|
| QB | kMult | high | 9 | 0.0002 | 0.0001 | 0.0023 |
| QB | rho | low | 3 | 0.0003 | 0.0001 | 0.0044 |
| RB | kMult | high | 27 | 0.0004 | 0.0000 | 0.0011 |
| RB | kMult | low | 5 | 0.0032 | 0.0015 | 0.0043 |
| RB | rho | low | 11 | 0.0042 | 0.0001 | 0.0115 |
| TE | kMult | high | 18 | 0.0005 | 0.0002 | 0.0009 |
| WR | kMult | high | 9 | 0.0004 | 0.0002 | 0.0008 |

### 3.2 Season layer: λ surface at the chosen (era, g) — drop = (MAE at the next lower λ − MAE at the edge) / MAE at the edge

| pos | cand | folds at the edge and falling | mean drop there | R-S holds |
|---|---|---|---|---|
| QB | G | 2 / 6 | 0.633% | no |
| QB | H | 0 / 6 | — | no |
| RB | G | 4 / 6 | 0.488% | no |
| RB | H | 6 / 6 | 1.193% | yes |
| TE | G | 2 / 6 | 1.603% | no |
| TE | H | 3 / 6 | 0.604% | no |
| WR | G | 3 / 6 | 0.814% | no |
| WR | H | 2 / 6 | 0.334% | no |

Fold detail:

| cand | pos | T | era | g | λ | at the edge | drop |
|---|---|---|---|---|---|---|---|
| H | QB | 2019 | E0 | — | 0.0 | no | — |
| H | QB | 2020 | E0 | — | 0.0 | no | — |
| H | QB | 2021 | E1 | — | 0.2 | no | — |
| H | QB | 2022 | E0 | — | 0.0 | no | — |
| H | QB | 2023 | E0 | — | 0.0 | no | — |
| H | QB | 2024 | E1 | — | 0.0 | no | — |
| H | RB | 2019 | E0 | — | 0.35 | yes | 0.506% |
| H | RB | 2020 | E0 | — | 0.35 | yes | 0.703% |
| H | RB | 2021 | E0 | — | 0.35 | yes | 0.715% |
| H | RB | 2022 | E1 | — | 0.35 | yes | 0.430% |
| H | RB | 2023 | E1 | — | 0.35 | yes | 3.891% |
| H | RB | 2024 | E0 | — | 0.35 | yes | 0.913% |
| H | WR | 2019 | E1 | — | 0.0 | no | — |
| H | WR | 2020 | E0 | — | 0.2 | no | — |
| H | WR | 2021 | E0 | — | 0.1 | no | — |
| H | WR | 2022 | E0 | — | 0.1 | no | — |
| H | WR | 2023 | E0 | — | 0.35 | yes | 0.500% |
| H | WR | 2024 | E0 | — | 0.35 | yes | 0.168% |
| H | TE | 2019 | E1 | — | 0.35 | yes | 0.294% |
| H | TE | 2020 | E1 | — | 0.35 | yes | 0.519% |
| H | TE | 2021 | E1 | — | 0.35 | yes | 1.000% |
| H | TE | 2022 | E1 | — | 0.2 | no | — |
| H | TE | 2023 | E0 | — | 0.2 | no | — |
| H | TE | 2024 | E1 | — | 0.0 | no | — |
| G | QB | 2019 | E0 | g2 | 0.0 | no | — |
| G | QB | 2020 | E1 | g3 | 0.0 | no | — |
| G | QB | 2021 | E1 | g4 | 0.2 | yes | 0.676% |
| G | QB | 2022 | E1 | g1 | 0.0 | no | — |
| G | QB | 2023 | E0 | g1 | 0.0 | no | — |
| G | QB | 2024 | E0 | g1 | 0.2 | yes | 0.590% |
| G | RB | 2019 | E1 | g2 | 0.2 | yes | 1.101% |
| G | RB | 2020 | E0 | g2 | 0.2 | yes | 0.263% |
| G | RB | 2021 | E0 | g4 | 0.0 | no | — |
| G | RB | 2022 | E1 | g3 | 0.2 | yes | 0.196% |
| G | RB | 2023 | E0 | g1 | 0.2 | yes | 0.393% |
| G | RB | 2024 | E1 | g3 | 0.0 | no | — |
| G | WR | 2019 | E0 | g2 | 0.2 | yes | 0.783% |
| G | WR | 2020 | E0 | g2 | 0.0 | no | — |
| G | WR | 2021 | E0 | g4 | 0.2 | yes | 1.388% |
| G | WR | 2022 | E1 | g4 | 0.0 | no | — |
| G | WR | 2023 | E0 | g3 | 0.0 | no | — |
| G | WR | 2024 | E0 | g3 | 0.2 | yes | 0.269% |
| G | TE | 2019 | E1 | g3 | 0.0 | no | — |
| G | TE | 2020 | E1 | g3 | 0.2 | yes | 2.637% |
| G | TE | 2021 | E0 | g2 | 0.0 | no | — |
| G | TE | 2022 | E1 | g2 | 0.0 | no | — |
| G | TE | 2023 | E1 | g3 | 0.2 | yes | 0.570% |
| G | TE | 2024 | E1 | g3 | 0.0 | no | — |

α / k-multiple / δ: The season layer's α / k-multiple / δ training errors are not recorded (`model_h.fit_target` keeps only the argmin; no season fits cache), so whether error was still falling at those edges cannot be judged without a refit — open for Anton.

## 4. Override speeds (§7)

### 4.1 H's kGames per target (median and range over folds) beside the app's constants; the share at the 32 edge cuts the range off

| pos | target | class | median kGames | range | at 32 | app K_ROS_POINTS | app K_ROS_OPP |
|---|---|---|---|---|---|---|---|
| QB | fum_lost | other | 28.00 | 16.00–32.00 | 3 of 6 | 3 | 2.5 |
| QB | pass_att | volume | 1.00 | 1.00–1.00 | 0 of 6 | 3 | 2.5 |
| QB | pass_int | efficiency | 28.00 | 24.00–32.00 | 3 of 6 | 3 | 2.5 |
| QB | pass_td | efficiency | 10.00 | 8.00–12.00 | 0 of 6 | 3 | 2.5 |
| QB | pass_yd | efficiency | 8.00 | 8.00–8.00 | 0 of 6 | 3 | 2.5 |
| QB | rush_att | volume | 2.00 | 1.00–2.00 | 0 of 6 | 3 | 2.5 |
| QB | rush_td | efficiency | 28.00 | 24.00–32.00 | 3 of 6 | 3 | 2.5 |
| QB | rush_yd | efficiency | 8.00 | 4.00–8.00 | 0 of 6 | 3 | 2.5 |
| RB | bonus_fd_rb | efficiency | 16.00 | 12.00–16.00 | 0 of 6 | 2.5 | 1.5 |
| RB | bonus_rush_yd_100 | other | 6.00 | 6.00–8.00 | 0 of 6 | 2.5 | 1.5 |
| RB | fum_lost | other | 32.00 | 32.00–32.00 | 6 of 6 | 2.5 | 1.5 |
| RB | kr_yd | other | 2.00 | 1.00–2.00 | 0 of 6 | 2.5 | 1.5 |
| RB | rec | efficiency | 32.00 | 16.00–32.00 | 5 of 6 | 2.5 | 1.5 |
| RB | rec_td | efficiency | 32.00 | 24.00–32.00 | 4 of 6 | 2.5 | 1.5 |
| RB | rec_tgt | volume | 2.00 | 2.00–2.00 | 0 of 6 | 2.5 | 1.5 |
| RB | rec_yd | efficiency | 32.00 | 24.00–32.00 | 5 of 6 | 2.5 | 1.5 |
| RB | rush_att | volume | 0.50 | 0.50–1.00 | 0 of 6 | 2.5 | 1.5 |
| RB | rush_td | efficiency | 32.00 | 24.00–32.00 | 4 of 6 | 2.5 | 1.5 |
| RB | rush_yd | efficiency | 28.00 | 24.00–32.00 | 3 of 6 | 2.5 | 1.5 |
| WR | bonus_fd_wr | efficiency | 24.00 | 24.00–32.00 | 1 of 6 | 3 | 3 |
| WR | bonus_rec_yd_100 | other | 12.00 | 8.00–16.00 | 0 of 6 | 3 | 3 |
| WR | kr_yd | other | 1.00 | 1.00–2.00 | 0 of 6 | 3 | 3 |
| WR | pr_yd | other | 3.00 | 3.00–6.00 | 0 of 6 | 3 | 3 |
| WR | rec | efficiency | 14.00 | 12.00–24.00 | 0 of 6 | 3 | 3 |
| WR | rec_td | efficiency | 32.00 | 32.00–32.00 | 6 of 6 | 3 | 3 |
| WR | rec_tgt | volume | 1.00 | 1.00–1.00 | 0 of 6 | 3 | 3 |
| WR | rec_yd | efficiency | 24.00 | 24.00–32.00 | 2 of 6 | 3 | 3 |
| WR | rush_yd | other | 6.00 | 4.00–8.00 | 0 of 6 | 3 | 3 |
| TE | bonus_fd_te | efficiency | 14.00 | 12.00–32.00 | 2 of 6 | 3.5 | 3.5 |
| TE | bonus_rec_te | efficiency | 7.00 | 4.00–8.00 | 0 of 6 | 3.5 | 3.5 |
| TE | rec | efficiency | 32.00 | 24.00–32.00 | 5 of 6 | 3.5 | 3.5 |
| TE | rec_td | efficiency | 32.00 | 32.00–32.00 | 6 of 6 | 3.5 | 3.5 |
| TE | rec_tgt | volume | 1.00 | 1.00–1.00 | 0 of 6 | 3.5 | 3.5 |
| TE | rec_yd | efficiency | 32.00 | 24.00–32.00 | 5 of 6 | 3.5 | 3.5 |

### 4.2 Points-level evidence weight per (position, n): λ_H (registered H; its context ridge still reads the week-w to-date columns at origin 0, so it understates H's total response to the season so far), λ_H,nc (the shrinkage path alone — the headline override speed), λ_B1 (analytic, B1's n/(n+k) over plain rows)

| pos | n | rows | players | λ_H | λ_H,nc | λ_B1 | B1 rows | B1 missing | B1 excluded share | B1 population share |
|---|---|---|---|---|---|---|---|---|---|---|
| QB | 1 | 125 | 48 | 0.184 | 0.171 | 0.250 | 115 | 0 | 8.0% | ROOKIE0 3%, ROOKIE1P 10%, SHORT 6%, standard 82% |
| QB | 2 | 124 | 47 | 0.294 | 0.287 | 0.400 | 113 | 0 | 8.9% | ROOKIE0 4%, ROOKIE1P 10%, SHORT 7%, standard 79% |
| QB | 3 | 129 | 49 | 0.375 | 0.376 | 0.500 | 116 | 0 | 10.1% | ROOKIE0 5%, ROOKIE1P 9%, SHORT 6%, standard 79% |
| QB | 4 | 125 | 45 | 0.433 | 0.436 | 0.571 | 119 | 0 | 4.8% | ROOKIE0 4%, ROOKIE1P 13%, SHORT 6%, standard 77% |
| QB | 5 | 117 | 48 | 0.466 | 0.471 | 0.625 | 108 | 0 | 7.7% | ROOKIE0 5%, ROOKIE1P 11%, SHORT 6%, standard 79% |
| QB | 6 | 124 | 46 | 0.507 | 0.517 | 0.667 | 114 | 0 | 8.1% | ROOKIE0 5%, ROOKIE1P 13%, SHORT 6%, standard 75% |
| QB | 7 | 121 | 44 | 0.528 | 0.543 | 0.700 | 110 | 0 | 9.1% | ROOKIE0 5%, ROOKIE1P 13%, SHORT 5%, standard 78% |
| QB | 8 | 120 | 43 | 0.543 | 0.553 | 0.727 | 111 | 0 | 7.5% | ROOKIE0 5%, ROOKIE1P 14%, SHORT 5%, standard 75% |
| QB | 9 | 114 | 41 | 0.539 | 0.544 | 0.750 | 107 | 0 | 6.1% | ROOKIE0 5%, ROOKIE1P 14%, SHORT 6%, standard 76% |
| QB | 10 | 105 | 41 | 0.565 | 0.579 | 0.769 | 99 | 0 | 5.7% | ROOKIE0 5%, ROOKIE1P 13%, SHORT 5%, standard 77% |
| QB | 11 | 92 | 39 | 0.565 | 0.572 | 0.786 | 88 | 0 | 4.3% | ROOKIE0 5%, ROOKIE1P 14%, SHORT 3%, standard 78% |
| QB | 12 | 89 | 41 | 0.587 | 0.599 | 0.800 | 86 | 0 | 3.4% | ROOKIE0 7%, ROOKIE1P 13%, SHORT 5%, standard 76% |
| RB | 1 | 271 | 108 | 0.250 | 0.257 | 0.286 | 271 | 0 | 0.0% | ROOKIE0 6%, ROOKIE1P 14%, SHORT 7%, standard 73% |
| RB | 2 | 260 | 106 | 0.343 | 0.350 | 0.444 | 260 | 0 | 0.0% | ROOKIE0 8%, ROOKIE1P 15%, SHORT 7%, standard 70% |
| RB | 3 | 254 | 104 | 0.397 | 0.408 | 0.545 | 254 | 0 | 0.0% | ROOKIE0 9%, ROOKIE1P 16%, SHORT 7%, standard 68% |
| RB | 4 | 243 | 110 | 0.456 | 0.473 | 0.615 | 243 | 0 | 0.0% | ROOKIE0 9%, ROOKIE1P 16%, SHORT 7%, standard 67% |
| RB | 5 | 252 | 107 | 0.482 | 0.499 | 0.667 | 252 | 0 | 0.0% | ROOKIE0 12%, ROOKIE1P 15%, SHORT 6%, standard 66% |
| RB | 6 | 243 | 103 | 0.518 | 0.534 | 0.706 | 243 | 0 | 0.0% | ROOKIE0 12%, ROOKIE1P 15%, SHORT 7%, standard 66% |
| RB | 7 | 231 | 100 | 0.525 | 0.538 | 0.737 | 231 | 0 | 0.0% | ROOKIE0 12%, ROOKIE1P 14%, SHORT 6%, standard 67% |
| RB | 8 | 226 | 99 | 0.571 | 0.585 | 0.762 | 226 | 0 | 0.0% | ROOKIE0 12%, ROOKIE1P 17%, SHORT 4%, standard 66% |
| RB | 9 | 220 | 102 | 0.563 | 0.570 | 0.783 | 220 | 0 | 0.0% | ROOKIE0 12%, ROOKIE1P 17%, SHORT 5%, standard 67% |
| RB | 10 | 206 | 95 | 0.557 | 0.574 | 0.800 | 206 | 0 | 0.0% | ROOKIE0 12%, ROOKIE1P 17%, SHORT 5%, standard 67% |
| RB | 11 | 200 | 88 | 0.577 | 0.597 | 0.815 | 200 | 0 | 0.0% | ROOKIE0 14%, ROOKIE1P 16%, SHORT 4%, standard 66% |
| RB | 12 | 183 | 87 | 0.569 | 0.587 | 0.828 | 183 | 0 | 0.0% | ROOKIE0 13%, ROOKIE1P 17%, SHORT 5%, standard 65% |
| WR | 1 | 322 | 126 | 0.208 | 0.202 | 0.250 | 322 | 0 | 0.0% | ROOKIE0 5%, ROOKIE1P 12%, SHORT 6%, standard 77% |
| WR | 2 | 319 | 129 | 0.303 | 0.301 | 0.400 | 318 | 1 | 0.3% | ROOKIE0 8%, ROOKIE1P 13%, SHORT 5%, standard 74% |
| WR | 3 | 319 | 134 | 0.368 | 0.369 | 0.500 | 318 | 1 | 0.3% | ROOKIE0 9%, ROOKIE1P 14%, SHORT 4%, standard 73% |
| WR | 4 | 317 | 139 | 0.398 | 0.401 | 0.571 | 316 | 1 | 0.3% | ROOKIE0 11%, ROOKIE1P 14%, SHORT 3%, standard 71% |
| WR | 5 | 324 | 140 | 0.424 | 0.431 | 0.625 | 323 | 1 | 0.3% | ROOKIE0 11%, ROOKIE1P 14%, SHORT 3%, standard 72% |
| WR | 6 | 307 | 130 | 0.452 | 0.456 | 0.667 | 306 | 1 | 0.3% | ROOKIE0 12%, ROOKIE1P 12%, SHORT 3%, standard 73% |
| WR | 7 | 305 | 129 | 0.481 | 0.489 | 0.700 | 304 | 1 | 0.3% | ROOKIE0 12%, ROOKIE1P 13%, SHORT 3%, standard 71% |
| WR | 8 | 285 | 132 | 0.497 | 0.505 | 0.727 | 284 | 1 | 0.4% | ROOKIE0 14%, ROOKIE1P 12%, SHORT 4%, standard 69% |
| WR | 9 | 270 | 121 | 0.518 | 0.523 | 0.750 | 269 | 1 | 0.4% | ROOKIE0 15%, ROOKIE1P 13%, SHORT 3%, standard 69% |
| WR | 10 | 258 | 119 | 0.528 | 0.532 | 0.769 | 257 | 1 | 0.4% | ROOKIE0 15%, ROOKIE1P 14%, SHORT 4%, standard 67% |
| WR | 11 | 248 | 110 | 0.539 | 0.542 | 0.786 | 247 | 1 | 0.4% | ROOKIE0 13%, ROOKIE1P 13%, SHORT 3%, standard 71% |
| WR | 12 | 229 | 111 | 0.539 | 0.542 | 0.800 | 228 | 1 | 0.4% | ROOKIE0 14%, ROOKIE1P 14%, SHORT 3%, standard 68% |
| TE | 1 | 127 | 51 | 0.278 | 0.281 | 0.222 | 127 | 0 | 0.0% | ROOKIE0 2%, ROOKIE1P 7%, SHORT 8%, standard 83% |
| TE | 2 | 119 | 50 | 0.399 | 0.405 | 0.364 | 119 | 0 | 0.0% | ROOKIE0 3%, ROOKIE1P 8%, SHORT 8%, standard 81% |
| TE | 3 | 123 | 52 | 0.462 | 0.476 | 0.462 | 123 | 0 | 0.0% | ROOKIE0 5%, ROOKIE1P 7%, SHORT 7%, standard 81% |
| TE | 4 | 129 | 52 | 0.489 | 0.492 | 0.533 | 129 | 0 | 0.0% | ROOKIE0 4%, ROOKIE1P 8%, SHORT 6%, standard 82% |
| TE | 5 | 124 | 52 | 0.541 | 0.549 | 0.588 | 124 | 0 | 0.0% | ROOKIE0 5%, ROOKIE1P 7%, SHORT 6%, standard 81% |
| TE | 6 | 119 | 49 | 0.563 | 0.571 | 0.632 | 119 | 0 | 0.0% | ROOKIE0 5%, ROOKIE1P 7%, SHORT 8%, standard 80% |
| TE | 7 | 113 | 45 | 0.592 | 0.603 | 0.667 | 113 | 0 | 0.0% | ROOKIE0 6%, ROOKIE1P 9%, SHORT 8%, standard 77% |
| TE | 8 | 120 | 52 | 0.618 | 0.629 | 0.696 | 120 | 0 | 0.0% | ROOKIE0 8%, ROOKIE1P 10%, SHORT 7%, standard 76% |
| TE | 9 | 119 | 50 | 0.607 | 0.625 | 0.720 | 119 | 0 | 0.0% | ROOKIE0 8%, ROOKIE1P 8%, SHORT 7%, standard 77% |
| TE | 10 | 106 | 49 | 0.614 | 0.639 | 0.741 | 106 | 0 | 0.0% | ROOKIE0 7%, ROOKIE1P 8%, SHORT 6%, standard 79% |
| TE | 11 | 102 | 47 | 0.636 | 0.660 | 0.759 | 102 | 0 | 0.0% | ROOKIE0 6%, ROOKIE1P 9%, SHORT 6%, standard 79% |
| TE | 12 | 98 | 49 | 0.705 | 0.720 | 0.774 | 98 | 0 | 0.0% | ROOKIE0 5%, ROOKIE1P 9%, SHORT 7%, standard 79% |

QB note: B1's start-chain states (preseason, starter, backup) are excluded from λ_B1 whatever `liveChain` is; the mean excluded share over the QB cells is 7.0%.

## 5. H and G against STD and B1c (§8.1) — exploratory — not a candidate, no label

### 5.1 By week band (origin n = w − 1)

| band | cand | bench | QB | RB | WR | TE |
|---|---|---|---|---|---|---|
| 0-3 | H | STD | 0.078 [-0.192, 0.354] (-1.1%; n 493) | -0.285 [-0.466, -0.125] (4.4%; n 980) | -0.263 [-0.380, -0.149] (4.0%; n 1255) | -0.279 [-0.431, -0.137] (5.0%; n 513) |
| 0-3 | H | B1c | 0.001 [-0.275, 0.291] (-0.0%; n 493) | 0.039 [-0.123, 0.192] (-0.6%; n 980) | -0.092 [-0.202, 0.020] (1.5%; n 1253) | -0.052 [-0.217, 0.111] (1.0%; n 513) |
| 0-3 | G | STD | 0.195 [-0.102, 0.462] (-2.7%; n 493) | -0.299 [-0.494, -0.116] (4.6%; n 980) | -0.246 [-0.375, -0.109] (3.8%; n 1255) | -0.163 [-0.405, 0.096] (2.9%; n 513) |
| 0-3 | G | B1c | 0.118 [-0.166, 0.393] (-1.6%; n 493) | 0.024 [-0.154, 0.200] (-0.4%; n 980) | -0.077 [-0.214, 0.075] (1.2%; n 1253) | 0.065 [-0.185, 0.328] (-1.2%; n 513) |
| 4-8 | H | STD | -0.011 [-0.208, 0.161] (0.1%; n 585) | -0.204 [-0.349, -0.066] (3.3%; n 1099) | -0.196 [-0.307, -0.100] (3.1%; n 1496) | -0.005 [-0.153, 0.146] (0.1%; n 599) |
| 4-8 | H | B1c | 0.013 [-0.204, 0.216] (-0.2%; n 585) | -0.050 [-0.165, 0.076] (0.8%; n 1099) | -0.009 [-0.105, 0.085] (0.2%; n 1491) | 0.093 [-0.056, 0.242] (-1.7%; n 599) |
| 4-8 | G | STD | 0.152 [-0.200, 0.522] (-2.1%; n 585) | -0.095 [-0.282, 0.079] (1.5%; n 1099) | -0.108 [-0.251, 0.024] (1.7%; n 1496) | -0.100 [-0.283, 0.087] (1.8%; n 599) |
| 4-8 | G | B1c | 0.175 [-0.196, 0.551] (-2.5%; n 585) | 0.059 [-0.105, 0.225] (-1.0%; n 1099) | 0.076 [-0.049, 0.207] (-1.3%; n 1491) | -0.003 [-0.193, 0.192] (0.0%; n 599) |
| 9+ | H | STD | -0.047 [-0.199, 0.108] (0.7%; n 987) | -0.296 [-0.411, -0.182] (4.7%; n 1872) | -0.179 [-0.259, -0.101] (2.8%; n 2511) | 0.067 [-0.096, 0.329] (-1.2%; n 1003) |
| 9+ | H | B1c | 0.002 [-0.140, 0.156] (-0.0%; n 987) | -0.110 [-0.203, -0.018] (1.8%; n 1872) | 0.004 [-0.055, 0.065] (-0.1%; n 2507) | 0.078 [-0.086, 0.325] (-1.4%; n 1003) |
| 9+ | G | STD | 0.224 [0.002, 0.471] (-3.2%; n 987) | -0.158 [-0.308, -0.011] (2.5%; n 1872) | -0.128 [-0.244, -0.014] (2.0%; n 2511) | 0.309 [0.106, 0.543] (-5.5%; n 1003) |
| 9+ | G | B1c | 0.273 [0.059, 0.523] (-3.9%; n 987) | 0.029 [-0.103, 0.158] (-0.5%; n 1872) | 0.055 [-0.031, 0.145] (-0.9%; n 2507) | 0.320 [0.113, 0.560] (-5.7%; n 1003) |

### 5.2 All bands: per-fold d and drift, and H − G

| cand | bench | pos | pooled d [CI] (improvement; n) | d 2019 | d 2020 | d 2021 | d 2022 | d 2023 | d 2024 | drift of d per season |
|---|---|---|---|---|---|---|---|---|---|---|
| H | STD | QB | -0.003 [-0.122, 0.118] (0.0%; n 2065) | -0.055 | +0.080 | +0.063 | -0.150 | +0.135 | -0.089 | -0.0061 [-0.0632, +0.0519] |
| H | STD | RB | -0.267 [-0.356, -0.187] (4.2%; n 3951) | -0.238 | -0.176 | -0.315 | -0.382 | -0.369 | -0.123 | -0.0021 [-0.0534, +0.0435] |
| H | STD | WR | -0.203 [-0.253, -0.155] (3.2%; n 5262) | -0.101 | -0.127 | -0.284 | -0.299 | -0.266 | -0.142 | -0.0183 [-0.0480, +0.0118] |
| H | STD | TE | -0.033 [-0.132, 0.106] (0.6%; n 2115) | -0.110 | -0.031 | +0.014 | +0.107 | -0.166 | -0.012 | +0.0050 [-0.0398, +0.0474] |
| H | B1c | QB | 0.007 [-0.119, 0.128] (-0.1%; n 2065) | +0.098 | +0.059 | +0.149 | -0.129 | -0.022 | -0.112 | -0.0448 [-0.1089, +0.0224] |
| H | B1c | RB | -0.057 [-0.121, 0.006] (0.9%; n 3951) | -0.025 | +0.078 | -0.136 | -0.079 | -0.149 | -0.032 | -0.0188 [-0.0565, +0.0142] |
| H | B1c | WR | -0.023 [-0.068, 0.025] (0.4%; n 5251) | +0.076 | +0.002 | -0.071 | -0.014 | -0.057 | -0.073 | -0.0249 [-0.0521, +0.0005] |
| H | B1c | TE | 0.052 [-0.056, 0.207] (-0.9%; n 2115) | -0.059 | -0.031 | +0.169 | +0.295 | -0.079 | +0.016 | +0.0102 [-0.0387, +0.0586] |
| G | STD | QB | 0.198 [0.043, 0.361] (-2.8%; n 2065) | +0.448 | -0.033 | +0.573 | -0.112 | +0.306 | +0.004 | -0.0541 [-0.1673, +0.0490] |
| G | STD | RB | -0.174 [-0.286, -0.075] (2.7%; n 3951) | +0.055 | -0.110 | -0.222 | -0.405 | -0.379 | +0.016 | -0.0338 [-0.0996, +0.0268] |
| G | STD | WR | -0.150 [-0.224, -0.072] (2.4%; n 5262) | +0.101 | -0.174 | -0.178 | -0.249 | -0.256 | -0.144 | -0.0441 [-0.0860, +0.0018] |
| G | STD | TE | 0.085 [-0.026, 0.206] (-1.5%; n 2115) | +0.101 | +0.260 | +0.095 | +0.126 | -0.077 | +0.006 | -0.0415 [-0.1063, +0.0281] |
| G | B1c | QB | 0.207 [0.058, 0.380] (-2.9%; n 2065) | +0.601 | -0.054 | +0.659 | -0.092 | +0.149 | -0.020 | -0.0928 [-0.2087, +0.0051] |
| G | B1c | RB | 0.036 [-0.061, 0.127] (-0.6%; n 3951) | +0.269 | +0.143 | -0.043 | -0.102 | -0.158 | +0.107 | -0.0505 [-0.1032, +0.0012] |
| G | B1c | WR | 0.029 [-0.040, 0.101] (-0.5%; n 5251) | +0.278 | -0.046 | +0.031 | +0.036 | -0.048 | -0.075 | -0.0506 [-0.0849, -0.0157] |
| G | B1c | TE | 0.170 [0.056, 0.299] (-3.1%; n 2115) | +0.152 | +0.259 | +0.250 | +0.314 | +0.010 | +0.034 | -0.0364 [-0.1044, +0.0363] |
| H − G | (a = H, b = G) | QB | -0.200 [-0.356, -0.053] (2.7%; n 2065) | -0.503 | +0.113 | -0.510 | -0.038 | -0.171 | -0.092 | +0.0479 [-0.0506, +0.1604] |
| H − G | (a = H, b = G) | RB | -0.093 [-0.158, -0.026] (1.5%; n 3951) | -0.294 | -0.065 | -0.094 | +0.023 | +0.009 | -0.139 | +0.0317 [-0.0171, +0.0798] |
| H − G | (a = H, b = G) | WR | -0.053 [-0.120, 0.014] (0.9%; n 5262) | -0.202 | +0.048 | -0.107 | -0.050 | -0.009 | +0.002 | +0.0258 [-0.0098, +0.0598] |
| H − G | (a = H, b = G) | TE | -0.118 [-0.214, -0.017] (2.1%; n 2115) | -0.211 | -0.291 | -0.081 | -0.019 | -0.089 | -0.018 | +0.0465 [-0.0173, +0.1065] |

## 6. Exploratory H arms (§8.2) — exploratory — not a candidate, no label

### h_ks0.25 — exploratory — not a candidate, no label

- spec SHA-256: `6e712646cb905ea6b5b60af90f62330d976ab61b4015a1931b7b1515b556ffda`; arm SHA-256: `b403d371fbde22a435b0aec1161e817e6e43d97c94fe74d065733e0f79590a71`
- route (a): every target's k scaled by 0.25 on a deep copy of the cached H fits, predict only; context terms stay as fitted at s = 1
- targets keeping a context term (fitted at s = 1), by fold and position: 2019: {'QB': 0, 'RB': 0, 'WR': 0, 'TE': 0}; 2020: {'QB': 1, 'RB': 1, 'WR': 1, 'TE': 1}; 2021: {'QB': 1, 'RB': 3, 'WR': 1, 'TE': 1}; 2022: {'QB': 1, 'RB': 3, 'WR': 2, 'TE': 1}; 2023: {'QB': 1, 'RB': 3, 'WR': 3, 'TE': 1}; 2024: {'QB': 2, 'RB': 4, 'WR': 3, 'TE': 1}

| pos | vs registered H (d = arm − H) | vs B1c | vs STD |
|---|---|---|---|
| QB | 0.005 [-0.062, 0.068] (-0.1%; n 2065) | 0.012 [-0.102, 0.120] (-0.2%; n 2065) | 0.003 [-0.095, 0.088] (-0.0%; n 2065) |
| RB | 0.026 [-0.002, 0.053] (-0.4%; n 3951) | -0.031 [-0.099, 0.039] (0.5%; n 3951) | -0.241 [-0.326, -0.159] (3.8%; n 3951) |
| WR | 0.101 [0.076, 0.127] (-1.6%; n 5262) | 0.077 [0.029, 0.126] (-1.2%; n 5251) | -0.102 [-0.149, -0.058] (1.6%; n 5262) |
| TE | 0.063 [0.024, 0.101] (-1.1%; n 2115) | 0.115 [0.003, 0.284] (-2.1%; n 2115) | 0.030 [-0.069, 0.182] (-0.5%; n 2115) |

### h_ks0.5 — exploratory — not a candidate, no label

- spec SHA-256: `6e712646cb905ea6b5b60af90f62330d976ab61b4015a1931b7b1515b556ffda`; arm SHA-256: `c05e604cf09c6c587b544bc10457039f3ca32aa395acd2502e12668841127e3d`
- route (a): every target's k scaled by 0.5 on a deep copy of the cached H fits, predict only; context terms stay as fitted at s = 1
- targets keeping a context term (fitted at s = 1), by fold and position: 2019: {'QB': 0, 'RB': 0, 'WR': 0, 'TE': 0}; 2020: {'QB': 1, 'RB': 1, 'WR': 1, 'TE': 1}; 2021: {'QB': 1, 'RB': 3, 'WR': 1, 'TE': 1}; 2022: {'QB': 1, 'RB': 3, 'WR': 2, 'TE': 1}; 2023: {'QB': 1, 'RB': 3, 'WR': 3, 'TE': 1}; 2024: {'QB': 2, 'RB': 4, 'WR': 3, 'TE': 1}

| pos | vs registered H (d = arm − H) | vs B1c | vs STD |
|---|---|---|---|
| QB | -0.020 [-0.059, 0.015] (0.3%; n 2065) | -0.013 [-0.132, 0.095] (0.2%; n 2065) | -0.022 [-0.125, 0.076] (0.3%; n 2065) |
| RB | 0.003 [-0.012, 0.017] (-0.0%; n 3951) | -0.054 [-0.121, 0.011] (0.9%; n 3951) | -0.265 [-0.352, -0.183] (4.2%; n 3951) |
| WR | 0.045 [0.032, 0.059] (-0.7%; n 5262) | 0.022 [-0.023, 0.068] (-0.4%; n 5251) | -0.158 [-0.206, -0.113] (2.5%; n 5262) |
| TE | 0.028 [0.007, 0.049] (-0.5%; n 2115) | 0.080 [-0.029, 0.244] (-1.4%; n 2115) | -0.005 [-0.102, 0.141] (0.1%; n 2115) |

### h_ks2 — exploratory — not a candidate, no label

- spec SHA-256: `6e712646cb905ea6b5b60af90f62330d976ab61b4015a1931b7b1515b556ffda`; arm SHA-256: `87c47cb06e8bace4ff14d4998444d9f7974c833970a402697472a823c1bbd40c`
- route (a): every target's k scaled by 2 on a deep copy of the cached H fits, predict only; context terms stay as fitted at s = 1
- targets keeping a context term (fitted at s = 1), by fold and position: 2019: {'QB': 0, 'RB': 0, 'WR': 0, 'TE': 0}; 2020: {'QB': 1, 'RB': 1, 'WR': 1, 'TE': 1}; 2021: {'QB': 1, 'RB': 3, 'WR': 1, 'TE': 1}; 2022: {'QB': 1, 'RB': 3, 'WR': 2, 'TE': 1}; 2023: {'QB': 1, 'RB': 3, 'WR': 3, 'TE': 1}; 2024: {'QB': 2, 'RB': 4, 'WR': 3, 'TE': 1}

| pos | vs registered H (d = arm − H) | vs B1c | vs STD |
|---|---|---|---|
| QB | 0.058 [0.021, 0.102] (-0.8%; n 2065) | 0.065 [-0.073, 0.212] (-0.9%; n 2065) | 0.055 [-0.085, 0.203] (-0.8%; n 2065) |
| RB | 0.036 [0.015, 0.056] (-0.6%; n 3951) | -0.021 [-0.084, 0.043] (0.3%; n 3951) | -0.231 [-0.320, -0.147] (3.6%; n 3951) |
| WR | -0.019 [-0.036, -0.002] (0.3%; n 5262) | -0.041 [-0.091, 0.011] (0.7%; n 5251) | -0.222 [-0.279, -0.166] (3.5%; n 5262) |
| TE | -0.004 [-0.029, 0.020] (0.1%; n 2115) | 0.047 [-0.059, 0.190] (-0.9%; n 2115) | -0.038 [-0.137, 0.096] (0.7%; n 2115) |

### h_ks4 — exploratory — not a candidate, no label

- spec SHA-256: `6e712646cb905ea6b5b60af90f62330d976ab61b4015a1931b7b1515b556ffda`; arm SHA-256: `38f18f91333edfa1732a7ba3398feb0a6c31a072e85fd131a840abfc841161bc`
- route (a): every target's k scaled by 4 on a deep copy of the cached H fits, predict only; context terms stay as fitted at s = 1
- targets keeping a context term (fitted at s = 1), by fold and position: 2019: {'QB': 0, 'RB': 0, 'WR': 0, 'TE': 0}; 2020: {'QB': 1, 'RB': 1, 'WR': 1, 'TE': 1}; 2021: {'QB': 1, 'RB': 3, 'WR': 1, 'TE': 1}; 2022: {'QB': 1, 'RB': 3, 'WR': 2, 'TE': 1}; 2023: {'QB': 1, 'RB': 3, 'WR': 3, 'TE': 1}; 2024: {'QB': 2, 'RB': 4, 'WR': 3, 'TE': 1}

| pos | vs registered H (d = arm − H) | vs B1c | vs STD |
|---|---|---|---|
| QB | 0.144 [0.074, 0.227] (-2.0%; n 2065) | 0.151 [-0.007, 0.325] (-2.1%; n 2065) | 0.141 [-0.021, 0.322] (-2.0%; n 2065) |
| RB | 0.118 [0.073, 0.163] (-1.9%; n 3951) | 0.061 [-0.008, 0.130] (-1.0%; n 3951) | -0.149 [-0.241, -0.058] (2.3%; n 3951) |
| WR | -0.005 [-0.040, 0.029] (0.1%; n 5262) | -0.027 [-0.086, 0.037] (0.4%; n 5251) | -0.209 [-0.276, -0.145] (3.3%; n 5262) |
| TE | 0.024 [-0.032, 0.077] (-0.4%; n 2115) | 0.075 [-0.030, 0.211] (-1.4%; n 2115) | -0.010 [-0.110, 0.118] (0.2%; n 2115) |

### h_ks8 — exploratory — not a candidate, no label

- spec SHA-256: `6e712646cb905ea6b5b60af90f62330d976ab61b4015a1931b7b1515b556ffda`; arm SHA-256: `9d9307cc9129a0a05f3c48566e217319adf14e9771701d1d80bd00342271915d`
- route (a): every target's k scaled by 8 on a deep copy of the cached H fits, predict only; context terms stay as fitted at s = 1
- targets keeping a context term (fitted at s = 1), by fold and position: 2019: {'QB': 0, 'RB': 0, 'WR': 0, 'TE': 0}; 2020: {'QB': 1, 'RB': 1, 'WR': 1, 'TE': 1}; 2021: {'QB': 1, 'RB': 3, 'WR': 1, 'TE': 1}; 2022: {'QB': 1, 'RB': 3, 'WR': 2, 'TE': 1}; 2023: {'QB': 1, 'RB': 3, 'WR': 3, 'TE': 1}; 2024: {'QB': 2, 'RB': 4, 'WR': 3, 'TE': 1}

| pos | vs registered H (d = arm − H) | vs B1c | vs STD |
|---|---|---|---|
| QB | 0.240 [0.141, 0.356] (-3.4%; n 2065) | 0.247 [0.075, 0.452] (-3.5%; n 2065) | 0.237 [0.056, 0.443] (-3.3%; n 2065) |
| RB | 0.236 [0.168, 0.306] (-3.9%; n 3951) | 0.179 [0.099, 0.260] (-2.9%; n 3951) | -0.031 [-0.128, 0.070] (0.5%; n 3951) |
| WR | 0.032 [-0.020, 0.083] (-0.5%; n 5262) | 0.011 [-0.061, 0.084] (-0.2%; n 5251) | -0.171 [-0.250, -0.095] (2.7%; n 5262) |
| TE | 0.089 [-0.001, 0.179] (-1.6%; n 2115) | 0.141 [0.025, 0.274] (-2.5%; n 2115) | 0.056 [-0.058, 0.180] (-1.0%; n 2115) |

### h_wide — exploratory — not a candidate, no label

- spec SHA-256: `eeb00f2b86b28dd7b4fb2c5c1734abf34f9edbd8d7e209566347a18f5dc37e80`; arm SHA-256: `27f7fd03e43f61ef022016616768396365509bdca33c8655569caaa835acaba7`
- route (b): H refitted through the registered fold_w with kMultW extended by [48, 64, 96, 128], under the registered calibration (fixedCalib)
- targets choosing a kMult above 32, by fold: 2019: 7; 2020: 4; 2021: 2; 2022: 1; 2023: 2; 2024: 3

| pos | vs registered H (d = arm − H) | vs B1c | vs STD |
|---|---|---|---|
| QB | 0.003 [-0.002, 0.009] (-0.0%; n 2065) | 0.010 [-0.118, 0.131] (-0.1%; n 2065) | -0.000 [-0.120, 0.122] (0.0%; n 2065) |
| RB | 0.000 [-0.001, 0.001] (-0.0%; n 3951) | -0.057 [-0.121, 0.005] (0.9%; n 3951) | -0.267 [-0.355, -0.187] (4.2%; n 3951) |
| WR | -0.000 [-0.002, 0.001] (0.0%; n 5262) | -0.023 [-0.069, 0.024] (0.4%; n 5251) | -0.204 [-0.254, -0.155] (3.2%; n 5262) |
| TE | 0.002 [-0.000, 0.005] (-0.0%; n 2115) | 0.054 [-0.053, 0.210] (-1.0%; n 2115) | -0.031 [-0.130, 0.110] (0.5%; n 2115) |

### h_noctx — exploratory — not a candidate, no label

- spec SHA-256: `6e712646cb905ea6b5b60af90f62330d976ab61b4015a1931b7b1515b556ffda`; arm SHA-256: `865cf9bf6f035ce8eb4dc38f9bef2979155167d72e8306d731ef79b1b714730c`
- H with no context term (hContext False), refitted through fold_w under the registered calibration

| pos | vs registered H (d = arm − H) | vs B1c | vs STD |
|---|---|---|---|
| QB | 0.032 [-0.008, 0.072] (-0.4%; n 2065) | 0.039 [-0.074, 0.151] (-0.5%; n 2065) | 0.029 [-0.081, 0.142] (-0.4%; n 2065) |
| RB | 0.027 [0.006, 0.050] (-0.4%; n 3951) | -0.030 [-0.089, 0.029] (0.5%; n 3951) | -0.240 [-0.322, -0.161] (3.8%; n 3951) |
| WR | 0.030 [0.013, 0.047] (-0.5%; n 5262) | 0.007 [-0.039, 0.053] (-0.1%; n 5251) | -0.174 [-0.224, -0.126] (2.7%; n 5262) |
| TE | 0.012 [-0.035, 0.045] (-0.2%; n 2115) | 0.064 [-0.027, 0.180] (-1.1%; n 2115) | -0.021 [-0.103, 0.078] (0.4%; n 2115) |

## 7. Checks, hashes, times, versions, threads

- **preregHash:** 7ff9087fc4848b0df90383fc5e4397d3d4b085466c228b430211a63ad6e24e5a
- **sha256 weekly-inputs.pkl:** 2431b3978d5a078fb2256e3553ca513f17c62160ec56ac72fb657486f43a1fb2
- **sha256 season-prior.jsonl:** 55c55e200ce18d549d522ee007e284bbe180ff98209378c4c355a47a9643c56a
- **sha256 weekly-preds.jsonl:** 44d7132a8418b892c150eb70b7b93394de6c5c2fb01f5b6dbcee9f99196aab29
- **sha256 weekly-fits.pkl:** 4c6738bbb28502f3c4436f8715c89d95378662739403bda89a12bafe06d9f9b3
- **sha256 benchw.jsonl:** 4ec9ba99d7bc4de7220f776d10fd12c0c448134f1be1513c7922c3a037c175b7
- **sha256 2b-1b artifact:** 3a0dcb5148f8720d1ec77c714ed02d3f2f729830645e190c550c1f3f078c6386
- **sha256 2a artifact:** b41169fbeefa2fab2d8a8d6f500590fb65f7b2465353ce67193941322e9995d7
- **sha256 inseason-constants.json:** 7bee9946ba78b988e74921186fa779dd46f09e189e335338e8c990a8b8da830b
- **sha256 candidates/H.json:** 9a870f27552128e15b99157e956e27ffe59b770200651ffb7da944dc11c98121
- **sha256 candidates/G.json:** c99becf031906b9f2fb6ff3521d6ee82d319ec21fd6cbb84df76f1484ed8cc9f
- **arm h_ks0.25:** spec 6e712646cb905ea6b5b60af90f62330d976ab61b4015a1931b7b1515b556ffda; arm b403d371fbde22a435b0aec1161e817e6e43d97c94fe74d065733e0f79590a71
- **arm h_ks0.5:** spec 6e712646cb905ea6b5b60af90f62330d976ab61b4015a1931b7b1515b556ffda; arm c05e604cf09c6c587b544bc10457039f3ca32aa395acd2502e12668841127e3d
- **arm h_ks2:** spec 6e712646cb905ea6b5b60af90f62330d976ab61b4015a1931b7b1515b556ffda; arm 87c47cb06e8bace4ff14d4998444d9f7974c833970a402697472a823c1bbd40c
- **arm h_ks4:** spec 6e712646cb905ea6b5b60af90f62330d976ab61b4015a1931b7b1515b556ffda; arm 38f18f91333edfa1732a7ba3398feb0a6c31a072e85fd131a840abfc841161bc
- **arm h_ks8:** spec 6e712646cb905ea6b5b60af90f62330d976ab61b4015a1931b7b1515b556ffda; arm 9d9307cc9129a0a05f3c48566e217319adf14e9771701d1d80bd00342271915d
- **arm h_wide:** spec eeb00f2b86b28dd7b4fb2c5c1734abf34f9edbd8d7e209566347a18f5dc37e80; arm 27f7fd03e43f61ef022016616768396365509bdca33c8655569caaa835acaba7
- **arm h_noctx:** spec 6e712646cb905ea6b5b60af90f62330d976ab61b4015a1931b7b1515b556ffda; arm 865cf9bf6f035ce8eb4dc38f9bef2979155167d72e8306d731ef79b1b714730c
- **run times (s):** {"load+trim": 6.6, "build": 65.6, "checks ab": 103.1, "check c": 10.7, "arms": 116.4, "analyses": 73.9, "total": 409.0, "check 2019": 7.9, "check 2020": 7.2, "check 2021": 11.0, "check 2022": 16.4, "check 2023": 25.4, "check 2024": 35.2, "arm h_ks0.25": 1.9, "arm h_ks0.5": 1.9, "arm h_ks2": 1.8, "arm h_ks4": 1.9, "arm h_ks8": 1.9, "wide 2019": 2.7, "noctx 2019": 3.0, "wide 2020": 5.3, "noctx 2020": 3.2, "wide 2021": 8.8, "noctx 2021": 3.5, "wide 2022": 14.3, "noctx 2022": 3.8, "wide 2023": 22.2, "noctx 2023": 4.1, "wide 2024": 31.5, "noctx 2024": 4.3}
- **threads:** {"OMP_NUM_THREADS": "1", "VECLIB_MAXIMUM_THREADS": "1", "OPENBLAS_NUM_THREADS": "1", "MKL_NUM_THREADS": "1", "PYTHONHASHSEED": "0", "setBeforeSklearnImport": true, "numpyPreloaded": false, "cpuCount": 8}
- **versions:** {"python": "3.9.6", "numpy": "1.26.4", "pandas": "1.5.3", "scikit-learn": "1.6.1", "scipy": "1.13.1"}
- **check maxima:** {"scaleK1MaxRelative": 0.0, "noChangeRefitMaxRelative": 0.0, "noChangeRefitTargetsEqual": true, "pairedVs2b1bMaxRelative": 0.0}

## 8. Limits

- Everything here is report-only: no label, no gate, no candidate, and the 2025 season is held.
- Arm numbers are on the development folds the registered fits were evaluated on, so a setting chosen from them has been selected on them; this is not clean evidence.
- Route (a) keeps every context term as fitted at s = 1 on the counted targets; only the evidence weight k changes.
- The season layer's α / k-multiple / δ training-error surfaces are not recorded (no season fits cache; `model_h.fit_target` keeps only the argmin) — only the λ surface is.
- B1c rows are outcome-conditioned (the s1b limits).
- Fold 2019 has one training season: H carries no context term there by construction (α defaults, not fitted).
- No G model was fitted in this slice; G's numbers are the cached 2b-1b predictions.
- The LP-2b-1b limits apply (G is reproducible only approximately; positions are a static 2026 capture; form-sum weeks outside the weekly universe count as evidence but are never scored).
