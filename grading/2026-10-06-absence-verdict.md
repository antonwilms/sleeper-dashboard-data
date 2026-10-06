# Absence correction — graded before/after check (L5 Stage B) — 2026-10-06

## 1. What was compared

Season-totals 2012–2025 as committed ("before") against the same files with each omitted `'X'` week reclassified `'D'` by `classifyAbsences` against `nflverse/rosterweekly` ("after"; D1 status set ACT/INA/RES/PUP, a team that played, 2016+ only). Predictor seasons S = 2015–2024, outcome S+1 `gamesPlayed`. Prediction = the mirrored veteran projected-games rule (`lib/durabilityMirror.mjs`, app `d627562`), as-of S. Basis: half_ppr (served fantasyPoints).

Panel: 4362 player-seasons (194 included at outcome 0: no S+1 row but on a reserve/active list all year; 5980 excluded: no S+1 row and no such listing; 670 not yet veterans; 3890 with no qualifying season).

Per-season correction totals, all rows (every position; Stage C §2.3 step 2 checks its migration dry-run against these):

| season | changedSlots | changedRows | byStatus |
|---|---|---|---|
| 2012 | 0 | 0 | — |
| 2013 | 0 | 0 | — |
| 2014 | 0 | 0 | — |
| 2015 | 0 | 0 | — |
| 2016 | 1900 | 450 | ACT 317, PUP 91, RES 1492 |
| 2017 | 1702 | 277 | ACT 25, PUP 81, RES 1596 |
| 2018 | 1749 | 289 | ACT 23, PUP 56, RES 1670 |
| 2019 | 1888 | 300 | ACT 13, INA 3, PUP 50, RES 1822 |
| 2020 | 2457 | 560 | ACT 22, INA 28, PUP 18, RES 2389 |
| 2021 | 1928 | 718 | ACT 6, INA 1809, RES 113 |
| 2022 | 2715 | 898 | ACT 1, INA 2679, RES 35 |
| 2023 | 2622 | 843 | INA 2574, RES 48 |
| 2024 | 2593 | 834 | ACT 4, INA 2579, RES 10 |
| 2025 | 2571 | 808 | ACT 13, INA 2555, RES 3 |

## 2. Parity

- DM-1 (asserted ≥ 99%): **431/431 = 100.0%** of the snapshot's veteran rows match `projectedGames`, `injurySeasons` and `absenceShapeFactor` (the app's own 3-dp rounding). Not counted: 0 rows with no qualifying season, 1 non-QB/RB/WR/TE.
- DM-2 (reported): bounce-back flag agreement 428/431 = 99.3% (served half-PPR PPG vs the app's league-rescored PPG).

## 3. Primary result

Mean absolute error of projected games vs next-season games played (MAE), mean signed error (bias = prediction − outcome), and ΔMAE = after − before with a player-clustered paired bootstrap 95% CI.

| cell | n | players | MAE before | MAE after | ΔMAE [95% CI] | bias before | bias after |
|---|---|---|---|---|---|---|---|
| all rows | 4362 | 1277 | 4.881 | 4.872 | -0.009 [-0.016, -0.002] | 3.465 | 3.426 |
| QB | 530 | 113 | 5.372 | 5.347 | -0.025 [-0.055, 0] | 4.489 | 4.46 |
| RB | 1139 | 365 | 4.803 | 4.804 | 0.001 [-0.009, 0.011] | 3.205 | 3.162 |
| WR | 1654 | 493 | 5.066 | 5.058 | -0.008 [-0.019, 0.003] | 3.69 | 3.653 |
| TE | 1039 | 306 | 4.421 | 4.408 | -0.013 [-0.027, -0.001] | 2.871 | 2.826 |
| S 2015 | 451 | 451 | 5.361 | 5.361 | 0 [0, 0] | 4.288 | 4.288 |
| S 2016-2020 | 2060 | 769 | 4.531 | 4.531 | 0 [-0.004, 0.004] | 3.09 | 3.077 |
| S 2021-2024 | 1851 | 754 | 5.153 | 5.133 | -0.021 [-0.036, -0.005] | 3.683 | 3.604 |
| changed rows only | 156 | 75 | 5.135 | 4.891 | -0.244 [-0.425, -0.062] | 3.365 | 2.263 |

Spearman ρ (prediction vs outcome): before 0.337, after 0.336.

## 4. Descriptive M1–M4

- **M1** injurySeasons distribution over panel rows (0 / 1 / 2 / ≥3): before 3859 / 461 / 37 / 5; after 3748 / 546 / 58 / 10; 135 rows change.
- **M2** rows whose absenceShapeFactor changes: 259.
- **M3** bounce-back flips (on→off / off→on; PPG is served half-PPR fantasyPoints, not the app's league-rescored points; ratio = PPG(S+1) / PPG(last qualifying season ≤ S)): on→off 0 (mean ratio n/a, median n/a, n=0); off→on 14 (mean 0.72, median 0.611, n=11).
- **M4** dynasty injurySeasonCount through 2025, before (rows) × after (columns), buckets 0/1/2/≥3:
  - today's veterans: 431 players, 37 change. Matrix [[266,18,0,0],[0,75,9,0],[0,0,27,3],[0,0,0,33]]
  - active in 2025: 793 players, 59 change. Matrix [[531,22,0,1],[0,111,17,1],[0,0,47,5],[0,0,0,58]]
  - "⚠ Injury risk" badge (count ≥ 2) among today's veterans: turns on for 9 (Dak Prescott, Chris Godwin, Cooper Kupp, Zamir White, Greg Dulcich, Brock Purdy, Will Levis, Spencer Rattler, Cam Grandy); turns off for 0 (—).

## 5. 2026 impact

Today's veterans (431 QB/RB/WR/TE rows in the 2026-10-04 snapshot): 35 change `projectedGames`; mean change -0.095 over all, -1.171 over the changed. Largest movers:

| player | pos | games before → after | injurySeasons before → after |
|---|---|---|---|
| Andrew Beck | RB | 16 → 14 | 0 → 0 |
| Brock Purdy | QB | 12 → 10 | 1 → 2 |
| Cooper Kupp | WR | 14 → 12 | 1 → 2 |
| K.J. Osborn | WR | 12 → 10 | 1 → 2 |
| Keenan Allen | WR | 16 → 14 | 0 → 0 |
| Terry McLaurin | WR | 14 → 12 | 0 → 0 |
| Andy Dalton | QB | 11 → 10 | 1 → 1 |
| Anthony Richardson | QB | 11 → 10 | 0 → 0 |
| Austin Ekeler | RB | 14 → 13 | 0 → 0 |
| Brevin Jordan | TE | 12 → 11 | 1 → 1 |
| Bucky Irving | RB | 12 → 11 | 0 → 0 |
| Chris Godwin | WR | 13 → 12 | 0 → 1 |
| Dameon Pierce | RB | 12 → 11 | 0 → 0 |
| George Kittle | TE | 13 → 12 | 0 → 1 |
| Ja'Marr Chase | WR | 16 → 15 | 0 → 0 |

Bounce-back flips among today's veterans: Mason Rudolph (QB) off→on.

## 6. Era note

Existing `'D'` already tripled from 2021, when Sleeper began returning inactives with `gp 0`. The correction adds 2016–2020 reserve weeks and 2021+ inactive weeks, and leaves 2012–2015 unchanged (D4: the weekly status there is season-level). The per-season totals in §1 show the split.

## 7. Recommendation

The numbers meet: (a) ship — ΔMAE CI [-0.016, -0.002] is entirely at or below 0: the corrected data does not predict games worse; Stage C proceeds as planned.

The choice is Anton's; Stage C does not start before it.
