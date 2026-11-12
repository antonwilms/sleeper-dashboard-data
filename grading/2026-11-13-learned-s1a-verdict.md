# LP-1a — learned-projection scoreboard (2026-11-13)

Offline research. **LP-1a makes no claim about learned models**: RIDGE is a baseline. Nothing here ships. Task file: `.claude/tasks/learned-projection-1a-harness.md`. Panel built from `test/fixtures/league-scoring-2026-10-14.json` (data rev `3e7d69337a6d5406ef9bd752305dfbd543496ad0`), test seasons 2019–2025, development folds 2019–2024, confirmation fold 2025.

## Summary by position

- **QB.** Season totals (headline set, 283 rows where B1, B2 and RIDGE all exist): hardest benchmark B1c at MAE 87.8 (next 100.7; RIDGE 86.8). Weekly points given he plays (relevant set, 2168 rows): hardest benchmark STD at MAE 7.15 (RIDGE 7.14). B1 weekly: pending-1b.
- **RB.** Season totals (headline set, 642 rows where B1, B2 and RIDGE all exist): hardest benchmark B1 at MAE 56.3 (next 56.6; RIDGE 51.7). Weekly points given he plays (relevant set, 4054 rows): hardest benchmark STD at MAE 6.37 (RIDGE 6.22). B1 weekly: pending-1b.
- **WR.** Season totals (headline set, 1013 rows where B1, B2 and RIDGE all exist): hardest benchmark B2 at MAE 46.2 (next 50.1; RIDGE 42.1). Weekly points given he plays (relevant set, 5500 rows): hardest benchmark STD at MAE 6.34 (RIDGE 6.22). B1 weekly: pending-1b.
- **TE.** Season totals (headline set, 611 rows where B1, B2 and RIDGE all exist): hardest benchmark B2 at MAE 34.5 (next 34.5; RIDGE 32.3). Weekly points given he plays (relevant set, 2327 rows): hardest benchmark STD at MAE 5.64 (RIDGE 5.54). B1 weekly: pending-1b.

Weekly B1 / B1c columns read `pending-1b` (slice 1b builds the app's in-season routing replay). B4 (Sleeper) is report-only. Every comparison against B1/B1c uses only B1-covered rows, for both sides — that set is **outcome-conditioned** (`assembleSeason` enumerates only players with gamesPlayed ≥ 1 in S).

## Facts (task §2, measured by Session 1)

| # | Question | Finding |
|---|---|---|
| F1 | Lines in `nflverse/schedule`? | `spreadLine`, `totalLine` non-null on every REG game 2012–2025. One stored value per game (closing-type): in `2026.json` only 27 of 150 unplayed games carry one. **No May look-ahead line is stored.** Source convention: `spreadLine` positive = **home** team favoured (`2016_01_CAR_DEN` stores −3 with CAR favoured). |
| F2 | Snaps per game? | No. `nflverse/snaps/<year>.json` is player-season; no `*_snp` key exists in any `weeklyStats` week 2012–2025. **No weekly snap share on disk.** |
| F3 | `nflverse/depth` timing | 2025: 544 of 576 team-weeks stamped Monday ~07:15 UTC, 32 Sunday — after that week's Sunday games. No `dt` before 2025; legacy timing cannot be determined from disk. |
| F4 | `nflverse/rosterweekly` timing | Week w's pairs describe game w. Gameday `INA` appears from **2019** (2,137 rows). **2012–2015 `status` is a season-level value stamped on every week and reflects later-season state** (2013: 91 of 112 players listed `RES` in week 1 played week 1). |
| F5 | Weekly stat keys | `weeklyStats` carries every key the league scores for skill players 2012–2025, incl. threshold bonuses and `bonus_rec_<pos>`; `bonus_fd_<pos>` only 2022+ (earlier seasons derive it). Red-zone keys: 146 WR/TE/RB players in 2012, 312 in 2013, flat at 337–416 since. `TEAM_*` rows carry no `weeklyStats`. Σ weekly league `pts` matches the league season total within 0.05 on 100% of skill player-seasons. |
| F6 | Current model reconstructable? | Partly. `scripts/inseason-run.mjs` `assembleSeason(S, env)` yields a frozen preseason PPG prior per player (`playerSeasons[].pointsPrior`): veterans via `attachFactorMultipliers` + `predictFullPipeline` (faithful in nine of thirteen steps; prior scale ≈ 0.80–0.86), rookies via `rookieRecordFor`. Only players with `gamesPlayed ≥ 1` in S are enumerated. |
| F7 | Sleeper weekly projections | Not in the store. Fetchable from the endpoint `src/api/sleeperStats.js:101` calls: stat-level rows for 2018, 2021, 2024; none for 2015. `updated_at` null on older seasons, post-game on 2024 week 3 — pre-game timing unverifiable. |
| F8 | League scoring | `test/fixtures/league-scoring-2026-10-14.json`. Every scored quantity is a stat key, so league points are linear in the weekly key vector. |
| F10 | Team codes | Every rosterweekly, depth, teamcontext and season-totals team code lies in that season's schedule set, every season 2012–2025; no rosterweekly week lists two teams for one player. |
| F11 | App in-season routing | `src/utils/inSeasonScoring.js` `buildScoringPosteriors`: population from `classifyInSeasonPopulation` (`standard`/`SHORT`/`ROOKIE0`/`ROOKIE1P`) picks one of four k tables (`inSeasonConstants.js` `K_ROS_POINTS*`), pinned from `backtests/2026-10-07-inseason-constants.json` — values re-read there and equal. QBs who are not their team's week-1 starter go through `buildQbLiveStates` (start chain: `expectedStarts`, evidence = starts, value × `fraction`). The data repo holds the originals of both: `lib/inSeasonEvidence.mjs` `classifyArm` (`P`/`X-short`/`X-rookie0`/`X-rookie1p`) and `lib/qbTakeover.mjs` (`primaryPassers`, `priorPPG`, `incPPG`, `dpCode`, `iqCode`, `expectedStarts`). `buildQbLiveStates` reads two live Sleeper fields with no history: `depth_chart_order` and `injury_status`. |

## Run-time checks (§9)

1. Scoring parity: **88157 / 88157** played rows exact (hard stop otherwise).
2. Σ weekly `pts` = league season points within 0.05: **9400 / 9400** player-seasons (100.0000%); misses: none.
3. Played rows on the §4.3 first-choice team (the rosterweekly team if listed, else the season-totals team) **and** that team has a schedule game that week (`teamFirstChoice`): **88128 / 88157** (99.9671%; threshold ≥ 99%). Rows resolved by fallback (not first choice), by `teamSource`: {"season-totals": 1, "rosterweekly": 28}; rows with a schedule game on the team used: 88128 / 88157.

| season | played rows | first-choice team with game | with schedule game |
|---|---|---|---|
| 2012 | 4506 | 4505 | 4505 |
| 2013 | 5391 | 5391 | 5391 |
| 2014 | 6098 | 6098 | 6098 |
| 2015 | 6115 | 6115 | 6115 |
| 2016 | 6181 | 6181 | 6181 |
| 2017 | 6275 | 6275 | 6275 |
| 2018 | 6273 | 6273 | 6273 |
| 2019 | 6258 | 6258 | 6258 |
| 2020 | 6540 | 6540 | 6540 |
| 2021 | 6980 | 6980 | 6980 |
| 2022 | 6870 | 6842 | 6842 |
| 2023 | 6859 | 6859 | 6859 |
| 2024 | 6880 | 6880 | 6880 |
| 2025 | 6931 | 6931 | 6931 |

| teamSource | played rows | first-choice team with game | with schedule game |
|---|---|---|---|
| rosterweekly | 87891 | 87863 | 87863 |
| season-totals | 266 | 265 | 265 |

4. `b1.covered` share of the season headline set (stratum V ∪ drafted in S rounds 1–3), per position and test season (< 60% anywhere would have stopped the run); `noGames` (veteran-routed rows with no qualifying season: total null, row kept) = **0**.

| season | QB | RB | WR | TE |
|---|---|---|---|---|
| 2019 | 44/48 = 0.917 | 96/103 = 0.932 | 149/160 = 0.931 | 91/99 = 0.919 |
| 2020 | 46/47 = 0.979 | 108/109 = 0.991 | 157/162 = 0.969 | 93/94 = 0.989 |
| 2021 | 46/49 = 0.939 | 98/106 = 0.924 | 171/181 = 0.945 | 91/96 = 0.948 |
| 2022 | 42/45 = 0.933 | 104/108 = 0.963 | 165/176 = 0.938 | 91/94 = 0.968 |
| 2023 | 39/40 = 0.975 | 99/107 = 0.925 | 149/162 = 0.920 | 95/108 = 0.880 |
| 2024 | 50/52 = 0.962 | 89/94 = 0.947 | 162/173 = 0.936 | 92/99 = 0.929 |
| 2025 | 49/52 = 0.942 | 90/96 = 0.938 | 161/175 = 0.920 | 97/104 = 0.933 |

5. Per season: rosterweekly status vocabulary, share of depth team-weeks carrying `dt`, and B4 coverage of the weekly relevant set.

| season | rosterweekly statuses (rows) | depth team-weeks with dt | B4 coverage (relevant set) |
|---|---|---|---|
| 2012 | ACT 15024, RES 1206, TRC 233, TRD 133, DEV 51, TRT 48, CUT 29, RSN 1 | 0/0 | — |
| 2013 | ACT 18201, RES 1240, TRD 406, TRC 354, CUT 140, TRT 117, DEV 82, SUS 32, RSN 23, RSR 18 | 0/576 | — |
| 2014 | ACT 20488, RES 1580, TRC 634, TRD 526, CUT 175, TRT 164, DEV 163, RSN 24, EXE 19, SUS 7, RSR 5 | 0/512 | — |
| 2015 | ACT 20805, RES 2188, TRC 798, TRD 572, CUT 384, TRT 168, DEV 140, SUS 54, RSN 49, RSR 32, NWT 14 | 0/576 | — |
| 2016 | ACT 22895, RES 2908, PUP 211, RSN 54, CUT 52, DEV 48, SUS 42, EXE 4,  1, NWT 1, UDF 1 | 0/576 | — |
| 2017 | ACT 22220, CUT 5266, RES 3027, DEV 2924, SUS 219, RSN 169, PUP 113, NWT 68, EXE 9,  3 | 0/574 | — |
| 2018 | ACT 22320, CUT 6050, DEV 3239, RES 2794, PUP 232, RSN 139, SUS 112, NWT 49, EXE 7 | 0/576 | — |
| 2019 | ACT 20096, CUT 6066, DEV 3460, RES 3238, INA 2137, RSN 176, SUS 169, PUP 166, NWT 139, EXE 11 | 0/576 | 0.754 |
| 2020 | ACT 20280, DEV 5225, RES 3794, INA 2484, CUT 525, NWT 303, UFA 147, RSN 93, RSR 91, PUP 82, SUS 52, EXE 51, TRC 30, TRD 21, TRT 8, RFA 5, RET 1, E01 1 | 0/576 | 0.787 |
| 2021 | ACT 21333, DEV 5724, RES 4724, INA 2639, CUT 394, RET 335, E14 24, TRC 14, TRD 8, PUP 1, TRT 1 | 0/608 | 0.778 |
| 2022 | ACT 21289, DEV 5673, RES 3644, INA 2782, CUT 533, RET 358, TRC 6, TRD 3, TRT 1, SUS 1 | 0/608 | 0.806 |
| 2023 | ACT 21237, DEV 5566, RES 3419, INA 2685, CUT 503, RET 190, EXE 29, TRC 7, TRD 3, TRT 2, E01 2, PUP 1 | 0/608 | 0.824 |
| 2024 | ACT 21270, DEV 5533, RES 3700, INA 2661, CUT 568, RET 253, EXE 13, TRC 5, TRD 3 | 0/608 | 0.809 |
| 2025 | ACT 20988, DEV 4628, RES 3992, INA 2634, CUT 496, RET 220, EXE 6, TRD 6, TRC 3 | 576/576 | 0.808 |

## Season forecast — metric tables (MAE / mean signed error = forecast − actual / Spearman; 95% clustered-bootstrap CI)

### QB

**headline set**

| benchmark | rows | MAE | bias | Spearman | RIDGE−bench ΔMAE | RIDGE gain | RIDGE−bench ΔSpearman |
|---|---|---|---|---|---|---|---|
| B1 | 316 | 98.9 [90.0, 107.8] | 38.4 [27.3, 49.7] | 0.584 [0.481, 0.660] | -11.61 [-18.05, -5.12] | 11.7% | 0.026 [-0.033, 0.084] |
| B1c | 316 | 87.0 [78.7, 95.6] | -6.6 [-18.1, 4.8] | 0.584 [0.481, 0.660] | 0.23 [-4.15, 4.77] | -0.3% | 0.026 [-0.033, 0.084] |
| B2 | 295 | 103.0 [93.1, 113.1] | 51.0 [36.7, 65.6] | 0.562 [0.441, 0.646] | -15.64 [-23.50, -8.12] | 15.2% | 0.056 [-0.016, 0.129] |
| RIDGE | 333 | 88.3 [80.8, 95.9] | -4.5 [-15.2, 7.2] | 0.618 [0.514, 0.692] | — | — | — |

**V set**

| benchmark | rows | MAE | bias | Spearman | RIDGE−bench ΔMAE | RIDGE gain | RIDGE−bench ΔSpearman |
|---|---|---|---|---|---|---|---|
| B1 | 283 | 100.7 [91.1, 110.4] | 40.5 [29.3, 52.3] | 0.583 [0.476, 0.662] | -13.88 [-20.66, -7.37] | 13.8% | 0.028 [-0.037, 0.093] |
| B1c | 283 | 87.8 [78.8, 96.9] | -5.6 [-17.6, 6.4] | 0.583 [0.476, 0.662] | -0.98 [-5.86, 3.91] | 1.1% | 0.028 [-0.037, 0.093] |
| B2 | 295 | 103.0 [93.1, 113.1] | 51.0 [36.7, 65.6] | 0.562 [0.441, 0.646] | -15.64 [-23.50, -8.12] | 15.2% | 0.056 [-0.016, 0.129] |
| RIDGE | 295 | 87.4 [79.5, 95.4] | -3.4 [-15.0, 9.5] | 0.618 [0.506, 0.698] | — | — | — |

**N set**

| benchmark | rows | MAE | bias | Spearman | RIDGE−bench ΔMAE | RIDGE gain | RIDGE−bench ΔSpearman |
|---|---|---|---|---|---|---|---|
| B1 | 227 | 54.3 [43.8, 65.3] | 9.8 [-1.7, 21.1] | 0.371 [0.232, 0.485] | 17.39 [7.55, 26.72] | -32.0% | 0.046 [-0.100, 0.199] |
| B1c | 227 | 49.9 [40.3, 59.7] | -4.1 [-14.8, 6.4] | 0.371 [0.232, 0.485] | 21.86 [13.58, 29.86] | -43.9% | 0.046 [-0.100, 0.199] |
| RIDGE | 291 | 73.3 [67.1, 80.0] | -3.3 [-14.8, 8.3] | 0.332 [0.222, 0.431] | — | — | — |

**deep set**

| benchmark | rows | MAE | bias | Spearman | RIDGE−bench ΔMAE | RIDGE gain | RIDGE−bench ΔSpearman |
|---|---|---|---|---|---|---|---|
| B1 | 194 | 49.1 [38.0, 60.5] | 9.1 [-1.6, 20.9] | 0.185 [0.026, 0.317] | 18.48 [8.01, 28.47] | -37.6% | 0.061 [-0.149, 0.279] |
| B1c | 194 | 44.0 [34.0, 54.2] | -0.9 [-10.8, 9.4] | 0.185 [0.026, 0.317] | 23.61 [14.56, 32.55] | -53.7% | 0.061 [-0.149, 0.279] |
| RIDGE | 253 | 69.5 [63.1, 76.0] | -0.9 [-12.1, 11.1] | 0.194 [0.072, 0.304] | — | — | — |

### RB

**headline set**

| benchmark | rows | MAE | bias | Spearman | RIDGE−bench ΔMAE | RIDGE gain | RIDGE−bench ΔSpearman |
|---|---|---|---|---|---|---|---|
| B1 | 684 | 57.0 [51.7, 62.5] | -6.4 [-11.3, -1.4] | 0.608 [0.535, 0.663] | -4.05 [-6.87, -1.22] | 7.1% | 0.057 [0.017, 0.097] |
| B1c | 684 | 58.0 [52.4, 63.7] | -1.9 [-6.9, 3.2] | 0.608 [0.535, 0.663] | -5.07 [-8.01, -2.09] | 8.7% | 0.057 [0.017, 0.097] |
| B2 | 680 | 57.2 [51.8, 63.1] | 19.1 [13.9, 24.5] | 0.645 [0.573, 0.697] | -5.16 [-8.31, -2.07] | 9.0% | 0.026 [-0.010, 0.064] |
| RIDGE | 723 | 53.3 [48.8, 58.3] | -2.7 [-8.3, 2.9] | 0.660 [0.591, 0.707] | — | — | — |

**V set**

| benchmark | rows | MAE | bias | Spearman | RIDGE−bench ΔMAE | RIDGE gain | RIDGE−bench ΔSpearman |
|---|---|---|---|---|---|---|---|
| B1 | 642 | 56.3 [50.6, 62.0] | -6.3 [-11.1, -1.4] | 0.615 [0.540, 0.670] | -4.68 [-7.58, -1.73] | 8.3% | 0.064 [0.020, 0.107] |
| B1c | 642 | 57.5 [51.6, 63.2] | -1.8 [-6.8, 3.3] | 0.615 [0.540, 0.670] | -5.80 [-8.83, -2.68] | 10.1% | 0.064 [0.020, 0.107] |
| B2 | 680 | 57.2 [51.8, 63.1] | 19.1 [13.9, 24.5] | 0.645 [0.573, 0.697] | -5.16 [-8.31, -2.07] | 9.0% | 0.026 [-0.010, 0.064] |
| RIDGE | 680 | 52.0 [47.4, 57.2] | -2.9 [-8.3, 2.4] | 0.671 [0.601, 0.719] | — | — | — |

**N set**

| benchmark | rows | MAE | bias | Spearman | RIDGE−bench ΔMAE | RIDGE gain | RIDGE−bench ΔSpearman |
|---|---|---|---|---|---|---|---|
| B1 | 230 | 41.5 [36.4, 47.2] | -14.2 [-22.2, -6.7] | 0.457 [0.314, 0.563] | 22.12 [16.18, 27.66] | -53.3% | -0.079 [-0.171, 0.014] |
| B1c | 230 | 41.3 [36.3, 47.1] | -12.1 [-20.0, -4.6] | 0.457 [0.314, 0.563] | 22.29 [16.49, 27.73] | -53.9% | -0.079 [-0.171, 0.014] |
| RIDGE | 262 | 63.3 [59.4, 67.5] | 33.0 [25.1, 40.8] | 0.427 [0.293, 0.531] | — | — | — |

**deep set**

| benchmark | rows | MAE | bias | Spearman | RIDGE−bench ΔMAE | RIDGE gain | RIDGE−bench ΔSpearman |
|---|---|---|---|---|---|---|---|
| B1 | 188 | 35.8 [30.1, 42.6] | -15.5 [-23.5, -8.3] | 0.304 [0.132, 0.443] | 26.49 [19.50, 33.20] | -73.9% | -0.121 [-0.266, 0.034] |
| B1c | 188 | 35.8 [30.0, 42.4] | -14.1 [-22.1, -6.9] | 0.304 [0.132, 0.443] | 26.55 [19.70, 33.12] | -74.3% | -0.121 [-0.266, 0.034] |
| RIDGE | 219 | 61.7 [57.4, 65.9] | 39.5 [31.7, 47.3] | 0.260 [0.115, 0.384] | — | — | — |

### WR

**headline set**

| benchmark | rows | MAE | bias | Spearman | RIDGE−bench ΔMAE | RIDGE gain | RIDGE−bench ΔSpearman |
|---|---|---|---|---|---|---|---|
| B1 | 1114 | 50.6 [47.5, 53.8] | 3.5 [-0.3, 7.1] | 0.607 [0.550, 0.651] | -7.20 [-9.07, -5.38] | 14.2% | 0.072 [0.048, 0.097] |
| B1c | 1114 | 50.5 [47.4, 53.7] | 3.3 [-0.6, 6.9] | 0.607 [0.550, 0.651] | -7.10 [-8.93, -5.30] | 14.1% | 0.072 [0.048, 0.097] |
| B2 | 1085 | 46.7 [43.9, 49.5] | 17.4 [14.2, 20.8] | 0.674 [0.617, 0.716] | -4.11 [-5.81, -2.52] | 8.8% | 0.024 [0.003, 0.045] |
| RIDGE | 1189 | 43.8 [41.5, 46.0] | 1.3 [-1.9, 4.6] | 0.681 [0.631, 0.719] | — | — | — |

**V set**

| benchmark | rows | MAE | bias | Spearman | RIDGE−bench ΔMAE | RIDGE gain | RIDGE−bench ΔSpearman |
|---|---|---|---|---|---|---|---|
| B1 | 1013 | 50.2 [47.1, 53.6] | 4.2 [0.3, 8.0] | 0.620 [0.560, 0.666] | -8.07 [-10.16, -6.09] | 16.1% | 0.081 [0.056, 0.107] |
| B1c | 1013 | 50.1 [47.0, 53.4] | 3.9 [0.0, 7.7] | 0.620 [0.560, 0.666] | -7.95 [-10.05, -5.99] | 15.9% | 0.081 [0.056, 0.107] |
| B2 | 1085 | 46.7 [43.9, 49.5] | 17.4 [14.2, 20.8] | 0.674 [0.617, 0.716] | -4.11 [-5.81, -2.52] | 8.8% | 0.024 [0.003, 0.045] |
| RIDGE | 1085 | 42.6 [40.4, 44.8] | 2.4 [-0.9, 5.7] | 0.698 [0.644, 0.737] | — | — | — |

**N set**

| benchmark | rows | MAE | bias | Spearman | RIDGE−bench ΔMAE | RIDGE gain | RIDGE−bench ΔSpearman |
|---|---|---|---|---|---|---|---|
| B1 | 345 | 35.4 [31.4, 39.4] | -10.7 [-15.8, -5.6] | 0.537 [0.446, 0.609] | 11.18 [7.64, 14.53] | -31.6% | -0.044 [-0.115, 0.022] |
| B1c | 345 | 35.4 [31.5, 39.4] | -10.8 [-15.8, -5.7] | 0.537 [0.446, 0.609] | 11.15 [7.62, 14.55] | -31.5% | -0.044 [-0.115, 0.022] |
| RIDGE | 428 | 47.6 [44.8, 50.3] | 20.0 [14.9, 24.8] | 0.497 [0.403, 0.569] | — | — | — |

**deep set**

| benchmark | rows | MAE | bias | Spearman | RIDGE−bench ΔMAE | RIDGE gain | RIDGE−bench ΔSpearman |
|---|---|---|---|---|---|---|---|
| B1 | 244 | 27.2 [23.0, 31.6] | -14.3 [-19.4, -9.0] | 0.205 [0.066, 0.327] | 15.54 [10.80, 19.88] | -57.1% | -0.090 [-0.228, 0.053] |
| B1c | 244 | 27.2 [23.0, 31.6] | -14.3 [-19.5, -9.0] | 0.205 [0.066, 0.327] | 15.53 [10.79, 19.89] | -57.0% | -0.090 [-0.228, 0.053] |
| RIDGE | 324 | 44.9 [42.1, 47.7] | 29.3 [24.7, 33.8] | 0.158 [0.033, 0.267] | — | — | — |

### TE

**headline set**

| benchmark | rows | MAE | bias | Spearman | RIDGE−bench ΔMAE | RIDGE gain | RIDGE−bench ΔSpearman |
|---|---|---|---|---|---|---|---|
| B1 | 650 | 35.7 [32.2, 39.5] | -0.4 [-4.1, 3.2] | 0.674 [0.602, 0.721] | -2.16 [-4.25, -0.23] | 6.1% | 0.038 [0.002, 0.072] |
| B1c | 650 | 35.7 [32.2, 39.5] | -0.9 [-4.6, 2.7] | 0.674 [0.602, 0.721] | -2.12 [-4.16, -0.22] | 6.0% | 0.038 [0.002, 0.072] |
| B2 | 653 | 34.4 [30.9, 37.8] | 8.1 [4.6, 11.6] | 0.696 [0.623, 0.744] | -2.25 [-4.06, -0.42] | 6.5% | 0.029 [0.001, 0.058] |
| RIDGE | 694 | 33.4 [30.5, 36.3] | -1.9 [-5.6, 1.9] | 0.706 [0.638, 0.750] | — | — | — |

**V set**

| benchmark | rows | MAE | bias | Spearman | RIDGE−bench ΔMAE | RIDGE gain | RIDGE−bench ΔSpearman |
|---|---|---|---|---|---|---|---|
| B1 | 611 | 34.6 [30.9, 38.6] | -0.6 [-4.2, 2.8] | 0.694 [0.625, 0.739] | -2.29 [-4.48, -0.26] | 6.6% | 0.038 [0.002, 0.075] |
| B1c | 611 | 34.5 [30.8, 38.5] | -1.1 [-4.7, 2.4] | 0.694 [0.625, 0.739] | -2.23 [-4.40, -0.18] | 6.5% | 0.038 [0.002, 0.075] |
| B2 | 653 | 34.4 [30.9, 37.8] | 8.1 [4.6, 11.6] | 0.696 [0.623, 0.744] | -2.25 [-4.06, -0.42] | 6.5% | 0.029 [0.001, 0.058] |
| RIDGE | 653 | 32.1 [29.0, 35.1] | -1.4 [-5.3, 2.4] | 0.725 [0.656, 0.768] | — | — | — |

**N set**

| benchmark | rows | MAE | bias | Spearman | RIDGE−bench ΔMAE | RIDGE gain | RIDGE−bench ΔSpearman |
|---|---|---|---|---|---|---|---|
| B1 | 192 | 26.5 [21.8, 31.8] | -6.9 [-13.7, -0.8] | 0.512 [0.375, 0.613] | 5.58 [2.39, 8.53] | -21.0% | 0.022 [-0.072, 0.124] |
| B1c | 192 | 26.6 [21.9, 31.9] | -7.1 [-14.0, -1.0] | 0.512 [0.375, 0.613] | 5.53 [2.31, 8.46] | -20.8% | 0.022 [-0.072, 0.124] |
| RIDGE | 240 | 31.9 [28.2, 35.9] | 10.3 [4.3, 15.2] | 0.530 [0.408, 0.628] | — | — | — |

**deep set**

| benchmark | rows | MAE | bias | Spearman | RIDGE−bench ΔMAE | RIDGE gain | RIDGE−bench ΔSpearman |
|---|---|---|---|---|---|---|---|
| B1 | 153 | 18.9 [14.6, 23.8] | -9.3 [-15.0, -4.4] | 0.398 [0.224, 0.539] | 6.82 [3.23, 10.37] | -36.0% | 0.045 [-0.117, 0.206] |
| B1c | 153 | 18.9 [14.6, 23.8] | -9.4 [-15.1, -4.4] | 0.398 [0.224, 0.539] | 6.82 [3.25, 10.37] | -36.0% | 0.045 [-0.117, 0.206] |
| RIDGE | 199 | 26.7 [23.9, 29.7] | 14.9 [10.3, 19.0] | 0.412 [0.262, 0.541] | — | — | — |

## Weekly forecast — points given he plays (relevant set, played rows)

### QB (K = 24)

| benchmark | rows | MAE | bias | Spearman (per week-group) | RIDGE−bench ΔMAE | RIDGE gain | RIDGE−bench ΔSpearman |
|---|---|---|---|---|---|---|---|
| STD | 2402 | 7.172 [6.941, 7.412] | 0.796 [0.492, 1.158] | 0.233 [0.157, 0.284] | -0.014 [-0.096, 0.054] | 0.2% | 0.014 [-0.011, 0.037] |
| B2 | 2168 | 7.502 [7.170, 7.895] | 0.211 [-0.402, 0.898] | 0.130 [0.056, 0.196] | -0.365 [-0.589, -0.161] | 4.9% | 0.111 [0.041, 0.169] |
| RIDGE | 2402 | 7.158 [6.924, 7.403] | -0.390 [-0.726, 0.024] | 0.247 [0.174, 0.292] | — | — | — |
| B4 (report-only) | 2302 | 6.977 [6.793, 7.179] | 1.040 [0.755, 1.361] | 0.291 [0.215, 0.331] | 0.098 [-0.034, 0.213] | -1.4% | -0.066 [-0.105, -0.020] |
| B1 / B1c | pending-1b | pending-1b | pending-1b | pending-1b | — | — | — |

Unconditional (expected points = P(plays) × cond, vs actual with 0 for a non-played team-game week, relevant set): STD MAE 6.817 [6.468, 7.173] (n=2976); B2 MAE 7.159 [6.704, 7.655] (n=2643); RIDGE MAE 6.802 [6.433, 7.179] (n=2976); B4 MAE 7.233 [7.003, 7.495] (n=2306). P(plays) baseline (probabilities clipped to [0.01, 0.99] for log-loss only; expected points and Brier use the unclipped probability): Brier 0.1692 [0.1527, 0.1849], log-loss 0.7723 [0.6973, 0.8431] over 10215 weekly-universe rows.

### RB (K = 48)

| benchmark | rows | MAE | bias | Spearman (per week-group) | RIDGE−bench ΔMAE | RIDGE gain | RIDGE−bench ΔSpearman |
|---|---|---|---|---|---|---|---|
| STD | 4647 | 6.355 [6.093, 6.629] | 0.390 [0.134, 0.656] | 0.392 [0.336, 0.429] | -0.121 [-0.180, -0.066] | 1.9% | 0.028 [0.012, 0.045] |
| B2 | 4054 | 6.828 [6.507, 7.144] | 0.344 [-0.117, 0.849] | 0.279 [0.207, 0.332] | -0.604 [-0.787, -0.432] | 8.8% | 0.148 [0.096, 0.191] |
| RIDGE | 4647 | 6.234 [5.965, 6.511] | -0.018 [-0.292, 0.256] | 0.420 [0.367, 0.456] | — | — | — |
| B4 (report-only) | 4558 | 6.126 [5.842, 6.426] | 0.653 [0.419, 0.882] | 0.475 [0.420, 0.506] | 0.128 [0.047, 0.213] | -2.1% | -0.061 [-0.079, -0.044] |
| B1 / B1c | pending-1b | pending-1b | pending-1b | pending-1b | — | — | — |

Unconditional (expected points = P(plays) × cond, vs actual with 0 for a non-played team-game week, relevant set): STD MAE 5.838 [5.507, 6.164] (n=5952); B2 MAE 6.265 [5.894, 6.632] (n=5151); RIDGE MAE 5.759 [5.427, 6.088] (n=5952); B4 MAE 6.366 [6.067, 6.673] (n=4580). P(plays) baseline (probabilities clipped to [0.01, 0.99] for log-loss only; expected points and Brier use the unclipped probability): Brier 0.1317 [0.1239, 0.1402], log-loss 0.5997 [0.5640, 0.6386] over 16289 weekly-universe rows.

### WR (K = 60)

| benchmark | rows | MAE | bias | Spearman (per week-group) | RIDGE−bench ΔMAE | RIDGE gain | RIDGE−bench ΔSpearman |
|---|---|---|---|---|---|---|---|
| STD | 6118 | 6.316 [6.100, 6.535] | 0.509 [0.335, 0.698] | 0.276 [0.230, 0.312] | -0.116 [-0.142, -0.091] | 1.8% | 0.014 [0.005, 0.023] |
| B2 | 5500 | 6.453 [6.217, 6.680] | 0.161 [-0.156, 0.482] | 0.238 [0.183, 0.282] | -0.230 [-0.324, -0.143] | 3.6% | 0.057 [0.029, 0.084] |
| RIDGE | 6118 | 6.200 [5.991, 6.410] | -0.124 [-0.318, 0.081] | 0.290 [0.245, 0.325] | — | — | — |
| B4 (report-only) | 6038 | 6.250 [6.053, 6.450] | 0.872 [0.701, 1.064] | 0.340 [0.296, 0.371] | -0.051 [-0.106, 0.001] | 0.8% | -0.052 [-0.066, -0.034] |
| B1 / B1c | pending-1b | pending-1b | pending-1b | pending-1b | — | — | — |

Unconditional (expected points = P(plays) × cond, vs actual with 0 for a non-played team-game week, relevant set): STD MAE 5.987 [5.733, 6.229] (n=7440); B2 MAE 6.078 [5.805, 6.336] (n=6743); RIDGE MAE 5.881 [5.632, 6.116] (n=7440); B4 MAE 6.405 [6.198, 6.605] (n=6074). P(plays) baseline (probabilities clipped to [0.01, 0.99] for log-loss only; expected points and Brier use the unclipped probability): Brier 0.1301 [0.1235, 0.1368], log-loss 0.5915 [0.5618, 0.6213] over 25862 weekly-universe rows.

### TE (K = 24)

| benchmark | rows | MAE | bias | Spearman (per week-group) | RIDGE−bench ΔMAE | RIDGE gain | RIDGE−bench ΔSpearman |
|---|---|---|---|---|---|---|---|
| STD | 2485 | 5.637 [5.319, 5.957] | 0.048 [-0.199, 0.283] | 0.261 [0.156, 0.342] | -0.095 [-0.141, -0.056] | 1.7% | 0.016 [-0.012, 0.044] |
| B2 | 2327 | 5.909 [5.566, 6.243] | -0.291 [-0.772, 0.212] | 0.203 [0.090, 0.303] | -0.372 [-0.530, -0.232] | 6.3% | 0.079 [0.012, 0.137] |
| RIDGE | 2485 | 5.541 [5.231, 5.850] | -0.396 [-0.686, -0.105] | 0.277 [0.178, 0.353] | — | — | — |
| B4 (report-only) | 2420 | 5.596 [5.299, 5.887] | 0.622 [0.358, 0.883] | 0.357 [0.266, 0.419] | -0.036 [-0.099, 0.031] | 0.6% | -0.083 [-0.113, -0.051] |
| B1 / B1c | pending-1b | pending-1b | pending-1b | pending-1b | — | — | — |

Unconditional (expected points = P(plays) × cond, vs actual with 0 for a non-played team-game week, relevant set): STD MAE 5.371 [4.982, 5.757] (n=2976); B2 MAE 5.595 [5.193, 5.983] (n=2801); RIDGE MAE 5.306 [4.920, 5.682] (n=2976); B4 MAE 5.727 [5.378, 6.079] (n=2430). P(plays) baseline (probabilities clipped to [0.01, 0.99] for log-loss only; expected points and Brier use the unclipped probability): Brier 0.1115 [0.1042, 0.1195], log-loss 0.5079 [0.4751, 0.5443] over 15475 weekly-universe rows.

## Drift — slope of per-season MAE on season (MAE points per year; 95% CI)

| layer | position | benchmark | slope [CI] | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 |
|---|---|---|---|---|---|---|---|---|---|---|
| season | QB | B1 | -0.36 [-4.54, 3.44] | 106.2 | 92.6 | 88.5 | 107.6 | 106.7 | 95.8 | 94.7 |
| season | QB | B1c | -0.16 [-4.24, 3.67] | 88.7 | 88.7 | 79.5 | 87.3 | 93.9 | 89.1 | 82.1 |
| season | QB | B2 | 1.74 [-2.92, 6.36] | 102.4 | 86.8 | 100.7 | 114.7 | 105.4 | 107.7 | 103.1 |
| season | QB | RIDGE | -1.69 [-5.64, 1.90] | 99.2 | 92.8 | 83.5 | 76.5 | 93.1 | 92.4 | 80.5 |
| weekly | QB | STD | -0.030 [-0.147, 0.092] | 7.44 | 7.50 | 7.05 | 6.79 | 6.75 | 7.25 | 7.43 |
| weekly | QB | B2 | -0.066 [-0.243, 0.095] | 8.00 | 7.66 | 7.20 | 7.70 | 6.78 | 7.67 | 7.50 |
| weekly | QB | RIDGE | -0.060 [-0.169, 0.060] | 7.35 | 7.72 | 7.10 | 6.85 | 6.62 | 7.06 | 7.39 |
| weekly | QB | B4 | -0.092 [-0.195, 0.013] | 7.38 | 7.28 | 7.14 | 6.57 | 6.63 | 6.92 | 6.92 |
| season | RB | B1 | 0.29 [-1.47, 2.25] | 56.2 | 58.6 | 58.9 | 47.5 | 59.2 | 62.5 | 56.2 |
| season | RB | B1c | 0.34 [-1.44, 2.25] | 56.1 | 59.6 | 60.8 | 48.5 | 61.2 | 63.1 | 56.8 |
| season | RB | B2 | -0.30 [-2.47, 1.77] | 57.4 | 59.2 | 59.9 | 52.6 | 55.3 | 61.0 | 55.0 |
| season | RB | RIDGE | 0.37 [-1.18, 1.92] | 53.6 | 53.4 | 53.4 | 50.3 | 50.6 | 55.6 | 56.6 |
| weekly | RB | STD | -0.056 [-0.154, 0.042] | 6.50 | 6.47 | 6.49 | 6.43 | 6.15 | 6.14 | 6.30 |
| weekly | RB | B2 | -0.082 [-0.209, 0.039] | 7.12 | 7.00 | 6.96 | 6.74 | 6.67 | 6.58 | 6.73 |
| weekly | RB | RIDGE | -0.036 [-0.140, 0.068] | 6.34 | 6.27 | 6.47 | 6.21 | 5.94 | 6.14 | 6.27 |
| weekly | RB | B4 | -0.070 [-0.168, 0.031] | 6.34 | 6.22 | 6.40 | 6.26 | 5.69 | 5.74 | 6.24 |
| season | WR | B1 | -0.54 [-1.90, 0.89] | 54.5 | 48.8 | 53.9 | 48.3 | 44.5 | 56.9 | 47.2 |
| season | WR | B1c | -0.74 [-2.09, 0.72] | 54.5 | 48.8 | 54.6 | 48.6 | 44.4 | 56.1 | 46.2 |
| season | WR | B2 | -0.25 [-1.60, 1.14] | 49.0 | 43.0 | 52.3 | 45.5 | 43.1 | 46.8 | 47.2 |
| season | WR | RIDGE | -0.84 [-1.92, 0.19] | 46.3 | 43.4 | 47.8 | 43.4 | 41.3 | 43.2 | 40.8 |
| weekly | WR | STD | -0.092 [-0.159, -0.022] | 6.63 | 6.55 | 6.34 | 6.10 | 6.41 | 6.16 | 6.01 |
| weekly | WR | B2 | -0.048 [-0.127, 0.034] | 6.77 | 6.46 | 6.46 | 6.25 | 6.42 | 6.53 | 6.29 |
| weekly | WR | RIDGE | -0.096 [-0.165, -0.027] | 6.52 | 6.43 | 6.25 | 6.01 | 6.27 | 6.04 | 5.88 |
| weekly | WR | B4 | -0.097 [-0.162, -0.030] | 6.56 | 6.50 | 6.50 | 5.89 | 6.21 | 6.02 | 6.07 |
| season | TE | B1 | -0.20 [-1.68, 1.22] | 35.8 | 39.4 | 35.0 | 31.9 | 36.1 | 36.7 | 35.3 |
| season | TE | B1c | -0.30 [-1.79, 1.15] | 36.2 | 39.4 | 35.0 | 31.8 | 35.8 | 36.5 | 35.1 |
| season | TE | B2 | -0.81 [-2.04, 0.47] | 35.5 | 40.8 | 32.8 | 33.0 | 31.6 | 34.3 | 32.8 |
| season | TE | RIDGE | -0.70 [-1.89, 0.54] | 34.5 | 36.5 | 36.6 | 29.1 | 32.5 | 33.3 | 31.5 |
| weekly | TE | STD | -0.037 [-0.122, 0.049] | 5.86 | 5.68 | 5.69 | 5.56 | 5.38 | 5.63 | 5.65 |
| weekly | TE | B2 | -0.038 [-0.158, 0.088] | 6.00 | 6.14 | 6.08 | 5.68 | 5.62 | 5.88 | 5.97 |
| weekly | TE | RIDGE | -0.032 [-0.116, 0.052] | 5.71 | 5.63 | 5.62 | 5.48 | 5.23 | 5.50 | 5.62 |
| weekly | TE | B4 | -0.050 [-0.125, 0.025] | 5.88 | 5.52 | 5.83 | 5.47 | 5.30 | 5.65 | 5.51 |

## Cohorts (test seasons; cells under 30 rows are INSUFFICIENT)

spikeSd (seasons 2012–2013 only): {"QB": 7.674, "RB": 5.969, "WR": 6.275, "TE": 4.677}.

**(a) Role riser — catch-up lag (weeks until the projection closes ≥ 50% of the gap to L; censored at 6)**

| model | rows | status | median lag | share censored |
|---|---|---|---|---|
| STD | 133 | ok | 6.0 | 0.47 |
| B2 | 103 | ok | 6.0 | 1.00 |
| RIDGE | 133 | ok | 2.0 | 0.18 |
| B4 | 129 | ok | 3.0 | 0.26 |

**(b) Injury fill-in — mean signed error (projection − actual), first two played weeks after the return**

| model | rows | status | mean signed error [CI] |
|---|---|---|---|
| STD | 1026 | ok | 0.34 [-0.03, 0.70] |
| B2 | 703 | ok | -0.51 [-1.03, 0.00] |
| RIDGE | 1026 | ok | 1.21 [0.83, 1.59] |
| B4 | 988 | ok | 0.31 [-0.05, 0.64] |

**(c) One-week spike — mean signed error in the next played week**

| model | rows | status | mean signed error [CI] |
|---|---|---|---|
| STD | 311 | ok | -0.34 [-1.09, 0.38] |
| B2 | 267 | ok | -1.43 [-2.28, -0.63] |
| RIDGE | 311 | ok | -0.86 [-1.57, -0.15] |
| B4 | 300 | ok | -0.34 [-1.06, 0.40] |

## Benchmark 4 — Sleeper weekly projections (report-only)

Fetched 2026-11-12 from `https://api.sleeper.com/projections/nfl/<season>/<week>?season_type=regular` (seasons 2018–2025, 141 files). Combined SHA-256 over the sorted `name:hash` lines: `35caf6cf61a405a02bf2cf3ae7502748f22535aa6dbdf63492d150db8f733a4a`.

| season | share of rows with non-null `updated_at` |
|---|---|
| 2018 | 0.0000 |
| 2019 | 0.0000 |
| 2020 | 0.0000 |
| 2021 | 0.0000 |
| 2022 | 0.0000 |
| 2023 | 0.0264 |
| 2024 | 0.1128 |
| 2025 | 0.1098 |

2021 coverage check (rows whose `stats` carry a panel key, minimum per position over 18 weeks): {"QB": 26, "RB": 76, "WR": 121, "TE": 60}.
Threshold bonuses (`bonus_*_yd_100/200`) stay 0 in B4 (the projection carries no distribution); `bonus_rec_te = rec` for a TE; `bonus_fd_<pos>` = `rec_fd + rush_fd + pass_fd`. A row whose `stats` carry no panel key is uncovered. Pre-game timing of these projections is unverifiable (F7).

## Stated limits of benchmark 1

**Against the incumbent:** QB season totals use starter PPG × games for every QB (`qbChainApprox`); for non-starters this overstates the app's total (QB headline B1 bias and `c` show the size).

**In the incumbent's favour or neutral:**

- its constants and k were tuned on seasons that include the test seasons;
- the `starter` QB prior reads who started game 1 of S;
- veteran priors are frozen on the S week-1 depth chart (`depthIndex(1)`), stamped after week 1's games in 2025 and of unknown timing before (F3);
- the factor context is built with `toYear: S`; confirmed in `buildFactorContext`/`attachFactorMultipliers` (lib/panel.mjs): teamOffense resolves a player's team through `teamKeyResolver('current-team', totalsByYear, toYear = S)`, i.e. the season-totals **S** `team` (the team he played for in S), applied to the S−1 team-offence ranks — a mild look-ahead on moves, in the incumbent's favour.
- coverage is conditional on `gamesPlayed ≥ 1` in S;
- residue: in training seasons 2014–2015 week-1 statuses are season-level (F4) — membership only, no test season;
- weekly limits are stated by slice 1b.

## Method notes

- Bootstrap: one draw of players with replacement per (layer, position) from the union of that position's players in the pooled folds; a drawn player brings all his rows in every fold; fold-equal weighting recomputed per resample; 2000 resamples, seed 12345, 95% percentile CI. Spearman is re-ranked inside every resample (midranks recomputed on the resampled multiset; a group under 8 resampled rows or with zero rank variance is NaN for that resample and left out of its average).
- The `lines` and `oracle-*` arms of §4.5 are enforced in `asof.py` and tested (T-PY-4) but are **not run** in 1a (not in §5.3).
- All three cohorts (a), (b), (c) are RB/WR/TE only: a QB has no opportunity share `os` → no `os0` → no label (§5.5).
- RIDGE training rows: season — headline-set rows of seasons 2014..T−1; weekly — played weekly-universe rows of seasons 2014..T−1; α by inner selection on the last two training seasons; medians and the stratum-N prior come from training rows only.

## Pre-registered pass/fail bar (§8, verbatim) — `preregHash` `7ff9087fc4848b0df90383fc5e4397d3d4b085466c228b430211a63ad6e24e5a`

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

