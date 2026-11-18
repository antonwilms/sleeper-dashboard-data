# LP-2b-1b — learned models, weekly layer, development folds (2026-11-18)

Offline research; nothing here ships. Task file: `.claude/tasks/learned-projection-2b1b-weekly-models.md`. Two candidates — **H** and **G** — forecast each week's points if he plays and the chance he plays, registered before any 2019–2024 weekly score existed. Folds evaluated: 2019, 2020, 2021, 2022, 2023, 2024. **The 2025 fold is held: every label below is unconfirmed — the 2025 fold is held.**

## 1. The progression rule (Anton, 2026-11-16 — before any weekly or 2025 result)

> **Progression per position (replaces the outline's "only a candidate that passed the season gate").** LP-2a: neither H nor G passes the season gate (beats B2 and B1c at RB and WR only; QB beats B2, ties B1c; TE ties). For both candidates, the weekly layer is built for all four positions; weekly labels (LP-1a §8 per-position arithmetic, `preregHash` `7ff9087f…e24e5a` unchanged) are **labelled for RB and WR** and **report-only for QB and TE**. The overall weekly gate (3 of 4) is still computed and printed; it is expected to fail by construction and is not the product decision. State this rule and its date (2026-11-16, before any weekly or 2025 result) in the verdict.

**H's context term gains an "off" option (Anton, 2026-11-18, before registration).** `ctxAlphas` = [1, 10, 100, 1000, "off"] ("off": no context term, alpha = infinity), chosen by the same leave-one-season-out rule; with fewer than 2 training seasons the default is "off" instead of 100, because the adjustment cannot be validated. Reason: decided before any development-fold result, prompted by the smoke diagnostic (H's context term made H worse than STD at every position on the one-season 2018 split); no value is fitted to 2018.

## 2. Per position and candidate

- **QB · H — report-only.** Conditional MAE difference (candidate minus benchmark; negative is better), relevant played rows: against the season-to-date average (STD): -0.00 points per week (-0.0% on 2065 rows; CI [-0.12, 0.12]) — no-difference, unconfirmed — the 2025 fold is held; against the recalibrated current in-season model (B1c): +0.01 points per week (+0.1% on 2065 rows; CI [-0.12, 0.13]) — no-difference, unconfirmed — the 2025 fold is held.
- **QB · G — report-only.** Conditional MAE difference (candidate minus benchmark; negative is better), relevant played rows: against the season-to-date average (STD): +0.20 points per week (+2.8% on 2065 rows; CI [0.04, 0.36]) — loses, unconfirmed — the 2025 fold is held; against the recalibrated current in-season model (B1c): +0.21 points per week (+2.9% on 2065 rows; CI [0.06, 0.38]) — loses, unconfirmed — the 2025 fold is held.
- **RB · H.** Conditional MAE difference (candidate minus benchmark; negative is better), relevant played rows: against the season-to-date average (STD): -0.27 points per week (-4.2% on 3951 rows; CI [-0.36, -0.19]) — beats, unconfirmed — the 2025 fold is held; against the recalibrated current in-season model (B1c): -0.06 points per week (-0.9% on 3951 rows; CI [-0.12, 0.01]) — no-difference, unconfirmed — the 2025 fold is held.
- **RB · G.** Conditional MAE difference (candidate minus benchmark; negative is better), relevant played rows: against the season-to-date average (STD): -0.17 points per week (-2.7% on 3951 rows; CI [-0.29, -0.07]) — no-difference, unconfirmed — the 2025 fold is held; against the recalibrated current in-season model (B1c): +0.04 points per week (+0.6% on 3951 rows; CI [-0.06, 0.13]) — no-difference, unconfirmed — the 2025 fold is held.
- **WR · H.** Conditional MAE difference (candidate minus benchmark; negative is better), relevant played rows: against the season-to-date average (STD): -0.20 points per week (-3.2% on 5262 rows; CI [-0.25, -0.16]) — beats, unconfirmed — the 2025 fold is held; against the recalibrated current in-season model (B1c): -0.02 points per week (-0.4% on 5251 rows; CI [-0.07, 0.02]) — no-difference, unconfirmed — the 2025 fold is held.
- **WR · G.** Conditional MAE difference (candidate minus benchmark; negative is better), relevant played rows: against the season-to-date average (STD): -0.15 points per week (-2.4% on 5262 rows; CI [-0.22, -0.07]) — no-difference, unconfirmed — the 2025 fold is held; against the recalibrated current in-season model (B1c): +0.03 points per week (+0.5% on 5251 rows; CI [-0.04, 0.10]) — no-difference, unconfirmed — the 2025 fold is held.
- **TE · H — report-only.** Conditional MAE difference (candidate minus benchmark; negative is better), relevant played rows: against the season-to-date average (STD): -0.03 points per week (-0.6% on 2115 rows; CI [-0.13, 0.11]) — no-difference, unconfirmed — the 2025 fold is held; against the recalibrated current in-season model (B1c): +0.05 points per week (+0.9% on 2115 rows; CI [-0.06, 0.21]) — no-difference, unconfirmed — the 2025 fold is held.
- **TE · G — report-only.** Conditional MAE difference (candidate minus benchmark; negative is better), relevant played rows: against the season-to-date average (STD): +0.09 points per week (+1.5% on 2115 rows; CI [-0.03, 0.21]) — no-difference, unconfirmed — the 2025 fold is held; against the recalibrated current in-season model (B1c): +0.17 points per week (+3.1% on 2115 rows; CI [0.06, 0.30]) — loses, unconfirmed — the 2025 fold is held.

## 3. Label table (LP-1a §8, `lp/metrics.py` unchanged) and the gate line

| pos | cand | bench | n | bench MAE | cand MAE | d = cand − bench | improvement | Δ Spearman | label (unconfirmed — the 2025 fold is held) | status |
|---|---|---|---|---|---|---|---|---|---|---|
| QB | H | STD | 2065 | 7.13 [6.88, 7.38] | 7.13 [6.87, 7.39] | -0.00 [-0.12, 0.12] | 0.0% | -0.003 [-0.051, 0.047] | no-difference | report-only (Anton, 2026-11-16) |
| QB | H | B1c | 2065 | 7.12 [6.86, 7.37] | 7.13 [6.87, 7.39] | 0.01 [-0.12, 0.13] | -0.1% | 0.001 [-0.050, 0.049] | no-difference | report-only (Anton, 2026-11-16) |
| QB | G | STD | 2065 | 7.13 [6.88, 7.38] | 7.33 [7.04, 7.62] | 0.20 [0.04, 0.36] | -2.8% | -0.053 [-0.111, 0.011] | loses | report-only (Anton, 2026-11-16) |
| QB | G | B1c | 2065 | 7.12 [6.86, 7.37] | 7.33 [7.04, 7.62] | 0.21 [0.06, 0.38] | -2.9% | -0.049 [-0.108, 0.013] | loses | report-only (Anton, 2026-11-16) |
| RB | H | STD | 3951 | 6.36 [6.09, 6.64] | 6.10 [5.79, 6.41] | -0.27 [-0.36, -0.19] | 4.2% | 0.031 [0.009, 0.052] | beats | labelled |
| RB | H | B1c | 3951 | 6.15 [5.85, 6.45] | 6.10 [5.79, 6.41] | -0.06 [-0.12, 0.01] | 0.9% | 0.020 [-0.001, 0.045] | no-difference | labelled |
| RB | G | STD | 3951 | 6.36 [6.09, 6.64] | 6.19 [5.87, 6.51] | -0.17 [-0.29, -0.07] | 2.7% | 0.012 [-0.014, 0.040] | no-difference | labelled |
| RB | G | B1c | 3951 | 6.15 [5.85, 6.45] | 6.19 [5.87, 6.51] | 0.04 [-0.06, 0.13] | -0.6% | 0.002 [-0.026, 0.032] | no-difference | labelled |
| WR | H | STD | 5262 | 6.37 [6.15, 6.60] | 6.16 [5.92, 6.41] | -0.20 [-0.25, -0.16] | 3.2% | 0.016 [-0.001, 0.033] | beats | labelled |
| WR | H | B1c | 5251 | 6.19 [5.96, 6.43] | 6.17 [5.93, 6.42] | -0.02 [-0.07, 0.02] | 0.4% | 0.018 [0.001, 0.037] | no-difference | labelled |
| WR | G | STD | 5262 | 6.37 [6.15, 6.60] | 6.22 [5.99, 6.45] | -0.15 [-0.22, -0.07] | 2.4% | -0.006 [-0.031, 0.019] | no-difference | labelled |
| WR | G | B1c | 5251 | 6.19 [5.96, 6.43] | 6.22 [6.00, 6.45] | 0.03 [-0.04, 0.10] | -0.5% | -0.003 [-0.029, 0.022] | no-difference | labelled |
| TE | H | STD | 2115 | 5.63 [5.28, 5.98] | 5.60 [5.22, 6.00] | -0.03 [-0.13, 0.11] | 0.6% | 0.027 [-0.005, 0.060] | no-difference | report-only (Anton, 2026-11-16) |
| TE | H | B1c | 2115 | 5.55 [5.19, 5.90] | 5.60 [5.22, 6.00] | 0.05 [-0.06, 0.21] | -0.9% | 0.022 [-0.011, 0.057] | no-difference | report-only (Anton, 2026-11-16) |
| TE | G | STD | 2115 | 5.63 [5.28, 5.98] | 5.72 [5.35, 6.09] | 0.09 [-0.03, 0.21] | -1.5% | 0.009 [-0.032, 0.053] | no-difference | report-only (Anton, 2026-11-16) |
| TE | G | B1c | 2115 | 5.55 [5.19, 5.90] | 5.72 [5.35, 6.09] | 0.17 [0.06, 0.30] | -3.1% | 0.005 [-0.037, 0.048] | loses | report-only (Anton, 2026-11-16) |

- H: RB and WR (the labelled positions) pass: RB no, WR no.
- G: RB and WR (the labelled positions) pass: RB no, WR no.
- overall weekly gate (3 of 4) for H: fails — expected to fail by construction; not the product decision.
- overall weekly gate (3 of 4) for G: fails — expected to fail by construction; not the product decision.

## 4. Fit facts

| cand | T | pos | rows | noPrior rows | c_w | φ | time | H: k (games), ρ, α per target |
|---|---|---|---|---|---|---|---|---|
| H | 2019 | QB | 1310 | 65 | 0.992 | 0.95 | 4s | pass_att k=1 ρ=0.75 α=off; rush_att k=1 ρ=0.6 α=off; pass_yd k=8 ρ=0.75 α=off; pass_td k=12 ρ=1 α=off; pass_int k=32 ρ=0.6 α=off; rush_yd k=4 ρ=0.75 α=off; rush_td k=32 ρ=1 α=off; fum_lost k=16 ρ=0.75 α=off |
| H | 2019 | RB | 2173 | 230 | 0.925 | 0.85 | 4s | rush_att k=1 ρ=0.6 α=off; rec_tgt k=2 ρ=0.85 α=off; rush_yd k=24 ρ=1 α=off; rush_td k=32 ρ=0.75 α=off; rec k=16 ρ=0.75 α=off; rec_yd k=32 ρ=0.6 α=off; rec_td k=24 ρ=0.92 α=off; bonus_fd_rb k=12 ρ=0.85 α=off; kr_yd k=2 ρ=0.6 α=off; bonus_rush_yd_100 k=8 ρ=1 α=off; fum_lost k=32 ρ=0.75 α=off |
| H | 2019 | WR | 3488 | 352 | 0.949 | 0.95 | 4s | rec_tgt k=1 ρ=0.75 α=off; rec k=12 ρ=1 α=off; rec_yd k=24 ρ=0.92 α=off; rec_td k=32 ρ=1 α=off; bonus_fd_wr k=32 ρ=1 α=off; kr_yd k=2 ρ=0.85 α=off; pr_yd k=6 ρ=0.92 α=off; bonus_rec_yd_100 k=8 ρ=0.92 α=off; rush_yd k=6 ρ=0.92 α=off |
| H | 2019 | TE | 2118 | 216 | 0.934 | 0.95 | 4s | rec_tgt k=1 ρ=0.85 α=off; rec k=24 ρ=0.85 α=off; rec_yd k=32 ρ=0.92 α=off; rec_td k=32 ρ=1 α=off; bonus_rec_te k=4 ρ=0.92 α=off; bonus_fd_te k=32 ρ=0.75 α=off |
| H | 2020 | QB | 2757 | 135 | 0.967 | 0.95 | 19s | pass_att k=1 ρ=0.6 α=1000; rush_att k=1 ρ=0.75 α=off; pass_yd k=8 ρ=0.92 α=off; pass_td k=12 ρ=1 α=off; pass_int k=24 ρ=1 α=off; rush_yd k=8 ρ=1 α=off; rush_td k=32 ρ=1 α=off; fum_lost k=16 ρ=0.75 α=off |
| H | 2020 | RB | 4315 | 354 | 0.904 | 0.85 | 19s | rush_att k=0.5 ρ=0.6 α=1000; rec_tgt k=2 ρ=0.75 α=off; rush_yd k=24 ρ=1 α=off; rush_td k=24 ρ=0.85 α=off; rec k=32 ρ=1 α=off; rec_yd k=32 ρ=1 α=off; rec_td k=24 ρ=1 α=off; bonus_fd_rb k=12 ρ=0.85 α=off; kr_yd k=2 ρ=0.6 α=off; bonus_rush_yd_100 k=6 ρ=0.85 α=off; fum_lost k=32 ρ=0.6 α=off |
| H | 2020 | WR | 6994 | 653 | 0.913 | 0.95 | 19s | rec_tgt k=1 ρ=0.75 α=1000; rec k=16 ρ=1 α=off; rec_yd k=24 ρ=1 α=off; rec_td k=32 ρ=0.92 α=off; bonus_fd_wr k=24 ρ=0.92 α=off; kr_yd k=2 ρ=0.92 α=off; pr_yd k=4 ρ=0.85 α=off; bonus_rec_yd_100 k=8 ρ=0.85 α=off; rush_yd k=6 ρ=0.92 α=off |
| H | 2020 | TE | 4215 | 406 | 0.938 | 0.95 | 19s | rec_tgt k=1 ρ=0.85 α=1000; rec k=32 ρ=1 α=off; rec_yd k=32 ρ=0.92 α=off; rec_td k=32 ρ=1 α=off; bonus_rec_te k=4 ρ=1 α=off; bonus_fd_te k=32 ρ=0.92 α=off |
| H | 2021 | QB | 4146 | 207 | 0.997 | 0.95 | 30s | pass_att k=1 ρ=0.75 α=1000; rush_att k=2 ρ=0.75 α=off; pass_yd k=8 ρ=0.92 α=off; pass_td k=8 ρ=1 α=off; pass_int k=24 ρ=1 α=off; rush_yd k=8 ρ=1 α=off; rush_td k=24 ρ=0.92 α=off; fum_lost k=24 ρ=0.75 α=off |
| H | 2021 | RB | 6630 | 628 | 0.895 | 0.95 | 30s | rush_att k=0.5 ρ=0.6 α=1000; rec_tgt k=2 ρ=0.85 α=1000; rush_yd k=32 ρ=1 α=off; rush_td k=32 ρ=1 α=off; rec k=32 ρ=1 α=off; rec_yd k=32 ρ=1 α=off; rec_td k=32 ρ=1 α=off; bonus_fd_rb k=16 ρ=0.92 α=off; kr_yd k=2 ρ=0.75 α=off; bonus_rush_yd_100 k=8 ρ=0.92 α=1000; fum_lost k=32 ρ=0.85 α=off |
| H | 2021 | WR | 10563 | 1034 | 0.924 | 0.95 | 30s | rec_tgt k=1 ρ=0.75 α=1000; rec k=12 ρ=1 α=off; rec_yd k=24 ρ=1 α=off; rec_td k=32 ρ=1 α=off; bonus_fd_wr k=24 ρ=0.85 α=off; kr_yd k=1 ρ=0.75 α=off; pr_yd k=3 ρ=0.85 α=off; bonus_rec_yd_100 k=12 ρ=0.92 α=off; rush_yd k=8 ρ=1 α=off |
| H | 2021 | TE | 6348 | 631 | 0.956 | 0.95 | 30s | rec_tgt k=1 ρ=0.85 α=1000; rec k=32 ρ=1 α=off; rec_yd k=24 ρ=0.92 α=off; rec_td k=32 ρ=1 α=off; bonus_rec_te k=6 ρ=1 α=off; bonus_fd_te k=16 ρ=1 α=off |
| H | 2022 | QB | 5655 | 314 | 0.982 | 0.95 | 53s | pass_att k=1 ρ=0.75 α=1000; rush_att k=2 ρ=0.75 α=off; pass_yd k=8 ρ=0.92 α=off; pass_td k=8 ρ=1 α=off; pass_int k=24 ρ=0.92 α=off; rush_yd k=6 ρ=0.92 α=off; rush_td k=24 ρ=0.92 α=off; fum_lost k=32 ρ=0.85 α=off |
| H | 2022 | RB | 9105 | 835 | 0.897 | 0.95 | 53s | rush_att k=0.5 ρ=0.6 α=10; rec_tgt k=2 ρ=0.85 α=1000; rush_yd k=32 ρ=1 α=off; rush_td k=32 ρ=1 α=off; rec k=32 ρ=1 α=off; rec_yd k=24 ρ=0.92 α=off; rec_td k=32 ρ=1 α=off; bonus_fd_rb k=16 ρ=0.92 α=off; kr_yd k=2 ρ=0.75 α=off; bonus_rush_yd_100 k=6 ρ=0.85 α=1000; fum_lost k=32 ρ=0.6 α=off |
| H | 2022 | WR | 14416 | 1363 | 0.907 | 0.95 | 53s | rec_tgt k=1 ρ=0.75 α=1000; rec k=12 ρ=1 α=1000; rec_yd k=24 ρ=1 α=off; rec_td k=32 ρ=1 α=off; bonus_fd_wr k=24 ρ=0.85 α=off; kr_yd k=1 ρ=0.92 α=off; pr_yd k=3 ρ=0.85 α=off; bonus_rec_yd_100 k=16 ρ=1 α=off; rush_yd k=4 ρ=0.85 α=off |
| H | 2022 | TE | 8690 | 780 | 0.978 | 0.95 | 53s | rec_tgt k=1 ρ=0.85 α=1000; rec k=32 ρ=1 α=off; rec_yd k=32 ρ=1 α=off; rec_td k=32 ρ=1 α=off; bonus_rec_te k=8 ρ=1 α=off; bonus_fd_te k=12 ρ=1 α=off |
| H | 2023 | QB | 7101 | 367 | 0.982 | 0.85 | 84s | pass_att k=1 ρ=0.75 α=1000; rush_att k=2 ρ=0.85 α=off; pass_yd k=8 ρ=0.92 α=off; pass_td k=8 ρ=1 α=off; pass_int k=32 ρ=0.92 α=off; rush_yd k=8 ρ=0.92 α=off; rush_td k=32 ρ=0.92 α=off; fum_lost k=32 ρ=0.85 α=off |
| H | 2023 | RB | 11534 | 1026 | 0.896 | 0.85 | 84s | rush_att k=0.5 ρ=0.6 α=10; rec_tgt k=2 ρ=0.85 α=1000; rush_yd k=32 ρ=1 α=off; rush_td k=32 ρ=1 α=off; rec k=32 ρ=1 α=off; rec_yd k=32 ρ=1 α=off; rec_td k=32 ρ=1 α=off; bonus_fd_rb k=16 ρ=0.92 α=off; kr_yd k=1 ρ=0.75 α=off; bonus_rush_yd_100 k=6 ρ=0.85 α=1000; fum_lost k=32 ρ=0.85 α=off |
| H | 2023 | WR | 18173 | 1660 | 0.895 | 0.95 | 84s | rec_tgt k=1 ρ=0.75 α=100; rec k=16 ρ=1 α=1000; rec_yd k=32 ρ=1 α=off; rec_td k=32 ρ=0.92 α=off; bonus_fd_wr k=24 ρ=0.85 α=off; kr_yd k=1 ρ=0.92 α=off; pr_yd k=3 ρ=0.92 α=off; bonus_rec_yd_100 k=16 ρ=1 α=1000; rush_yd k=6 ρ=0.92 α=off |
| H | 2023 | TE | 10888 | 891 | 0.966 | 0.95 | 84s | rec_tgt k=1 ρ=0.85 α=1000; rec k=32 ρ=1 α=off; rec_yd k=32 ρ=1 α=off; rec_td k=32 ρ=1 α=off; bonus_rec_te k=8 ρ=1 α=off; bonus_fd_te k=12 ρ=1 α=off |
| H | 2024 | QB | 8588 | 461 | 0.990 | 0.95 | 128s | pass_att k=1 ρ=0.75 α=1000; rush_att k=2 ρ=0.85 α=1000; pass_yd k=8 ρ=1 α=off; pass_td k=12 ρ=1 α=off; pass_int k=32 ρ=1 α=off; rush_yd k=8 ρ=0.92 α=off; rush_td k=24 ρ=0.92 α=off; fum_lost k=32 ρ=0.85 α=off |
| H | 2024 | RB | 13830 | 1185 | 0.894 | 0.95 | 128s | rush_att k=0.5 ρ=0.6 α=10; rec_tgt k=2 ρ=0.85 α=1000; rush_yd k=24 ρ=1 α=off; rush_td k=24 ρ=1 α=off; rec k=32 ρ=1 α=off; rec_yd k=32 ρ=1 α=off; rec_td k=32 ρ=1 α=off; bonus_fd_rb k=16 ρ=0.92 α=off; kr_yd k=1 ρ=0.75 α=1000; bonus_rush_yd_100 k=6 ρ=0.85 α=1000; fum_lost k=32 ρ=0.85 α=off |
| H | 2024 | WR | 21865 | 1889 | 0.903 | 0.95 | 128s | rec_tgt k=1 ρ=0.75 α=100; rec k=24 ρ=1 α=1000; rec_yd k=32 ρ=1 α=off; rec_td k=32 ρ=0.92 α=off; bonus_fd_wr k=24 ρ=0.85 α=off; kr_yd k=1 ρ=0.92 α=off; pr_yd k=3 ρ=0.92 α=off; bonus_rec_yd_100 k=12 ρ=1 α=1000; rush_yd k=6 ρ=0.92 α=off |
| H | 2024 | TE | 13137 | 1047 | 0.970 | 0.95 | 128s | rec_tgt k=1 ρ=0.85 α=1000; rec k=32 ρ=1 α=off; rec_yd k=32 ρ=1 α=off; rec_td k=32 ρ=0.92 α=off; bonus_rec_te k=8 ρ=1 α=off; bonus_fd_te k=12 ρ=1 α=off |
| G | 2019 | QB | 1310 | 65 | 1.062 | 0.85 | 126s | — |
| G | 2019 | RB | 2173 | 230 | 0.909 | 0.85 | 126s | — |
| G | 2019 | WR | 3488 | 352 | 0.934 | 0.95 | 126s | — |
| G | 2019 | TE | 2118 | 216 | 1.084 | 0.95 | 126s | — |
| G | 2020 | QB | 2757 | 135 | 1.021 | 0.85 | 197s | — |
| G | 2020 | RB | 4315 | 354 | 0.925 | 0.85 | 197s | — |
| G | 2020 | WR | 6994 | 653 | 0.921 | 0.95 | 197s | — |
| G | 2020 | TE | 4215 | 406 | 1.009 | 0.95 | 197s | — |
| G | 2021 | QB | 4146 | 207 | 1.040 | 0.85 | 241s | — |
| G | 2021 | RB | 6630 | 628 | 0.906 | 0.95 | 241s | — |
| G | 2021 | WR | 10563 | 1034 | 0.931 | 0.95 | 241s | — |
| G | 2021 | TE | 6348 | 631 | 1.073 | 0.95 | 241s | — |
| G | 2022 | QB | 5655 | 314 | 1.025 | 0.85 | 287s | — |
| G | 2022 | RB | 9105 | 835 | 0.918 | 0.95 | 287s | — |
| G | 2022 | WR | 14416 | 1363 | 0.918 | 0.95 | 287s | — |
| G | 2022 | TE | 8690 | 780 | 1.046 | 0.95 | 287s | — |
| G | 2023 | QB | 7101 | 367 | 1.013 | 0.85 | 313s | — |
| G | 2023 | RB | 11534 | 1026 | 0.924 | 0.95 | 313s | — |
| G | 2023 | WR | 18173 | 1660 | 0.923 | 0.95 | 313s | — |
| G | 2023 | TE | 10888 | 891 | 1.038 | 0.95 | 313s | — |
| G | 2024 | QB | 8588 | 461 | 1.022 | 0.85 | 360s | — |
| G | 2024 | RB | 13830 | 1185 | 0.912 | 0.95 | 360s | — |
| G | 2024 | WR | 21865 | 1889 | 0.911 | 0.95 | 360s | — |
| G | 2024 | TE | 13137 | 1047 | 1.034 | 0.95 | 360s | — |

## 5. Registration, data and run facts (hashes only)

- **preregHash:** 7ff9087fc4848b0df90383fc5e4397d3d4b085466c228b430211a63ad6e24e5a
- **H season specSha256:** 8eaef3a01328803c3824d0e505776d1f7e5bff34652978247e593366775cdead
- **H season codeSha256:** ca41ac63d426eb92c2cb2cca7a072bb097c3b9200e73ab152864cd9fa3afc5bc
- **H season harnessSha256:** 8d2ca8077842c9218219bcf94d07d25608b728dcc6f0f62cec970affe28d5d4f
- **H season dataSha256:** dc29fbce0f7fb41e46057aeb4fa94c43bbd40bd95ed7ca201ea79f878d8ac6d1
- **H weekly specSha256:** 6e712646cb905ea6b5b60af90f62330d976ab61b4015a1931b7b1515b556ffda
- **H weekly codeSha256:** 83505f6abd1ce6fe57dbcfdb93f63cf37db924ef8ef574163ed9039e4a758d7e
- **H weekly harnessSha256:** b04249a0a9b546ab36c3d51f9645bf58cfac388acd27c6b04224fe5ba45632ae
- **H weekly dataSha256:** c15dcdc20a093f22b26905af67048f7e9522b3cba7398c91d3f9c349abe11de4
- **G season specSha256:** 0ea188b42fab42690d803c4f8d600674a8f63ae567ce5edd7d80f55731a2726f
- **G season codeSha256:** 6ffd30e09d6a7f76c6344a3f708f2196aca66391f044a487493ff110d0e6173d
- **G season harnessSha256:** 8d2ca8077842c9218219bcf94d07d25608b728dcc6f0f62cec970affe28d5d4f
- **G season dataSha256:** dc29fbce0f7fb41e46057aeb4fa94c43bbd40bd95ed7ca201ea79f878d8ac6d1
- **G weekly specSha256:** 9ddedf67a929c6b704cdcb1ab48048de390bc53ba5b4328a8dbde2ad0797fba1
- **G weekly codeSha256:** bca7f867d13ba37a50888dc13be8664c2a7c8648324ea57b7c111bfb9792a672
- **G weekly harnessSha256:** b04249a0a9b546ab36c3d51f9645bf58cfac388acd27c6b04224fe5ba45632ae
- **G weekly dataSha256:** c15dcdc20a093f22b26905af67048f7e9522b3cba7398c91d3f9c349abe11de4
- **sha256 weekly-inputs.pkl:** 2431b3978d5a078fb2256e3553ca513f17c62160ec56ac72fb657486f43a1fb2
- **sha256 season-prior.jsonl:** 55c55e200ce18d549d522ee007e284bbe180ff98209378c4c355a47a9643c56a
- **sha256 weekly-preds.jsonl:** 44d7132a8418b892c150eb70b7b93394de6c5c2fb01f5b6dbcee9f99196aab29
- **sha256 weekly-fits.pkl:** 4c6738bbb28502f3c4436f8715c89d95378662739403bda89a12bafe06d9f9b3
- **sha256 candidates/H.json:** 9a870f27552128e15b99157e956e27ffe59b770200651ffb7da944dc11c98121
- **sha256 candidates/G.json:** c99becf031906b9f2fb6ff3521d6ee82d319ec21fd6cbb84df76f1484ed8cc9f
- **sha256 benchw.jsonl:** 4ec9ba99d7bc4de7220f776d10fd12c0c448134f1be1513c7922c3a037c175b7
- **sha256 benchw.meta.json:** 1294c2fbbea7d710c954ee174089a1c39735d2b25a1e0e21262fde484c8256ae
- **sha256 task file:** 223294a3a73d50874a32cc537eacf332e8cc52bfff8c74a12c2ee08c76c741b6
- **sha256 2b-1a artifact:** 5b7d401fc6db392ce041952130f988d7944319e93ede98add2de255cf57e8df4

## 6. Times, versions, threads

- **run times (s):** {"load+trim": 6.5, "build": 64.6, "checks": 17.3, "fit": 1852.4, "H 2019": 3.7, "G 2019": 126.0, "H 2020": 19.2, "G 2020": 197.1, "H 2021": 29.9, "G 2021": 241.2, "H 2022": 52.6, "G 2022": 286.6, "H 2023": 83.5, "G 2023": 313.3, "H 2024": 128.0, "G 2024": 360.3, "total": 1980.6}
- **threads:** {"OMP_NUM_THREADS": "1", "VECLIB_MAXIMUM_THREADS": "1", "OPENBLAS_NUM_THREADS": "1", "MKL_NUM_THREADS": "1", "PYTHONHASHSEED": "0", "setBeforeSklearnImport": true, "numpyPreloaded": false, "cpuCount": 8}
- **versions:** {"python": "3.9.6", "numpy": "1.26.4", "pandas": "1.5.3", "scikit-learn": "1.6.1", "scipy": "1.13.1"}
- **check maxima:** {"n0": {"H": 0.0, "G": 0.0}, "formCross": {"H": {"ex": 0.0, "std": 0.0, "rec": 5.089100440912669e-16}, "G": {"ex": 0.0, "std": 0.0, "rec": 5.089100440912669e-16}}}

## 7. LP-1a §8 (verbatim) — pinned hash `7ff9087fc4848b0df90383fc5e4397d3d4b085466c228b430211a63ad6e24e5a`

```
## 8. Pre-registered pass/fail bar (binds LP-2; written before any model run)

**Candidates.** At most **two** named candidates may be gated, `H` and `G`, each a single fully specified procedure (inputs, model, any inner-selection grid). Each is registered — a committed file `research/learned-projection/candidates/<name>.json` holding the specification and this section's `preregHash` — before any test-fold metric of that candidate is computed. Labels are reported per candidate and every claim names its candidate; there is no best-of-two label. Anything else LP-2 runs is exploratory and unlabelled.

**Label**, per candidate, position and benchmark, on the development folds, from the paired difference d = MAE(candidate) − MAE(benchmark) on identical rows, pooled as §5.4, with its 95% CI:
- `beats` — CI entirely below 0 **and** −d / MAE(benchmark) ≥ 0.03, both pooled point estimates;
- `loses` — CI entirely above 0;
- `no-difference` — otherwise.

Rank guard: a `beats` becomes `no-difference` if the CI of the Spearman difference (candidate − benchmark) lies entirely below 0. Confirmation: a `beats` stands only if d on the 2025 fold is below 0.

**Rows.**
- Against **B2**: stratum V rows of the population (B2 has no value elsewhere).
- Against **B1c**: B1-covered rows of the population (season and weekly).
- Against **STD**: all rows of the population.

**Season gate (first gate)** — population: season headline set. A position passes if the candidate `beats` **B2** and `beats` **B1c**. The candidate passes if at least 3 of 4 positions pass and no position `loses` to either.

**Weekly gate** (evaluated only for a candidate that passed the season gate) — population: weekly relevant set, played rows, conditional MAE. A position passes if the candidate `beats` **STD** and `beats` **B1c**. Same 3-of-4, no-`loses` rule.

**Frozen definition of the weekly B1/B1c benchmark (built by slice 1b).** `b1w.cond` for (pid, S, w) is the rest-of-season per-game value the app's `buildScoringPosteriors` (`src/utils/inSeasonScoring.js` @ `2c3578b`) would hold after the player's team's last game before w: the app's prior for that row (its projection prior, or its starter prior on start-chain rows), taken from this file's `b1.ppg`/`b1.ppgWeekly`/`b1.starterPPG`; evidence = his league points per game played before w; k from `backtests/2026-10-07-inseason-constants.json`, table chosen by the app's population (`standard`/`SHORT`/`ROOKIE0`/`ROOKIE1P`); a QB who is not his team's week-1 starter goes through the app's start chain (`buildQbLiveStates`: evidence = his starts, `b1w.uncond` = value × the chain's expected share). The only inputs replaced are the two live Sleeper fields with no history: depth-chart order (the stored chart of the team's last completed game) and injury status (the roster status of that game's week ∈ `RES`/`INA`/`PUP`; `false` for S ≤ 2015). B1c weekly = `c × b1w.cond`, `c` as §5.3. Slice 1b may correct its transposition to match the app; it may not change this definition, the rows, `c`, the thresholds or the gates. A candidate's weekly gate cannot be evaluated before 1b is verified.

Raw B1, RIDGE, B4, the unconditional metric, P(plays), cohorts and drift are reported, not gated.

`preregHash` = SHA-256 of the UTF-8 bytes of this file as committed, from the first character of the line beginning `## 8.` up to but excluding the first character of the line beginning `## 9.`, LF line endings.

**LP-1a's own pass statement:** every §7 test green and shown red, the §9 checks hold, and the verdict reports every §5.4 metric for every §5.3 benchmark on all seven folds — the weekly B1/B1c columns excepted (`pending-1b`). LP-1a makes no claim about learned models.
```

## 8. Limits

- 2025 is held, so no label is final and no candidate has passed anything.
- Training starts in 2018, so fold 2019 has one training season.
- G is reproducible only approximately, even when fully pinned (one of four 2b-1a runs was off by up to 4.84%); H is exact.
- B1c rows are outcome-conditioned (the s1b limits).
- H's season-layer alpha is inherited at its grid top; the weekly context alpha is chosen by leave-one-season-out over a grid that includes 'off'.
- In folds with one training season (2019) H carries no context term by construction (alpha = 'off' by default: the adjustment cannot be validated).
- Form-sum weeks outside the weekly universe count as evidence but are never scored.
- Positions are a static 2026 capture.
- No feature is asserted to equal an app factor.
- After registration `registry.require(·, 2025)` no longer holds 2025 by itself; `weekly_data.guard` and LP-2b-2's marker do (flag 17).
- The tables (arms, cohorts, rest-of-season, probabilities against persistence) come in LP-2b-1c.
