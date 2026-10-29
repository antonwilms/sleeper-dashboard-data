# Age-curve gap report (S3a §5)

- Reference date D: 2026-05-18 (the Sleeper capture's date); currentYear 2026; as-of season 2025.
- Data rev: 1099737.
- Inputs: completed season-totals 2012–2025 (league-rescored), `raw/-players-nfl.json` (Sleeper ages), `nflverse/playerids.json` birthdates, the S = 2025 as-of inputs of `scripts/dynasty-asof.mjs`. No outcome season is read.
- APP = the live app's curve (Sleeper `age`); BIRTH = the same builder on true ages from birthdates (whole years on D).

## 5.1 Curves

positionBasisScale is equal between APP and BIRTH, as expected (basis ratios do not depend on age).

### QB

| age | APP n | BIRTH n | APP medianPPG | BIRTH medianPPG | Δ (BIRTH − APP) |
|---:|---:|---:|---:|---:|---:|
| 18 | 8 | 0 | 19.114 | — | — |
| 19 | 4 | 0 | 17.539 | — | — |
| 20 | 9 | 1 | 16.810 | 15.618 | -1.192 |
| 21 | 22 | 17 | 15.948 | 16.275 | 0.327 |
| 22 | 38 | 33 | 17.253 | 17.238 | -0.015 |
| 23 | 45 | 45 | 18.027 | 18.389 | 0.362 |
| 24 | 45 | 44 | 18.893 | 19.180 | 0.287 |
| 25 | 35 | 34 | 18.662 | 19.107 | 0.445 |
| 26 | 35 | 30 | 18.368 | 18.810 | 0.442 |
| 27 | 38 | 30 | 18.081 | 18.009 | -0.071 |
| 28 | 32 | 30 | 18.828 | 18.274 | -0.554 |
| 29 | 22 | 22 | 19.040 | 17.954 | -1.086 |
| 30 | 22 | 22 | 19.540 | 18.080 | -1.461 |
| 31 | 18 | 25 | 19.049 | 17.551 | -1.498 |
| 32 | 16 | 22 | 18.987 | 18.274 | -0.713 |
| 33 | 12 | 17 | 18.656 | 18.815 | 0.159 |
| 34 | 8 | 15 | 18.955 | 19.475 | 0.521 |
| 35 | 7 | 11 | 19.670 | 19.424 | -0.246 |
| 36 | 6 | 12 | 20.413 | 20.692 | 0.278 |
| 37 | 4 | 9 | 19.717 | 20.772 | 1.055 |
| 38 | 3 | 6 | 21.087 | 20.396 | -0.691 |
| 39 | 1 | 4 | 19.647 | 18.848 | -0.799 |
| 40 | 3 | 4 | 19.599 | 18.503 | -1.095 |
| 41 | 2 | 3 | 17.213 | 20.523 | 3.310 |
| 42 | 0 | 1 | — | 21.425 | — |

Capped peak age: APP 32, BIRTH 32. positionPeakPPG: APP 18.987, BIRTH 18.274. positionBasisScale: APP 1.114, BIRTH 1.114.

### RB

| age | APP n | BIRTH n | APP medianPPG | BIRTH medianPPG | Δ (BIRTH − APP) |
|---:|---:|---:|---:|---:|---:|
| 18 | 69 | 0 | 6.199 | — | — |
| 19 | 102 | 0 | 6.043 | — | — |
| 20 | 124 | 16 | 6.776 | 7.596 | 0.821 |
| 21 | 164 | 84 | 6.766 | 7.099 | 0.333 |
| 22 | 182 | 161 | 7.486 | 6.705 | -0.781 |
| 23 | 157 | 211 | 7.634 | 6.395 | -1.238 |
| 24 | 138 | 198 | 7.910 | 6.553 | -1.357 |
| 25 | 103 | 186 | 7.646 | 6.749 | -0.897 |
| 26 | 81 | 148 | 6.920 | 6.757 | -0.163 |
| 27 | 41 | 108 | 7.913 | 7.026 | -0.887 |
| 28 | 23 | 81 | 7.959 | 7.455 | -0.504 |
| 29 | 20 | 53 | 9.043 | 8.038 | -1.005 |
| 30 | 11 | 30 | 7.263 | 7.815 | 0.552 |
| 31 | 9 | 23 | 6.512 | 7.352 | 0.841 |
| 32 | 3 | 12 | 5.051 | 6.190 | 1.139 |
| 33 | 0 | 8 | — | 7.373 | — |
| 34 | 0 | 3 | — | 7.693 | — |
| 35 | 0 | 2 | — | 8.065 | — |
| 36 | 0 | 1 | — | 6.875 | — |
| 37 | 0 | 1 | — | 6.431 | — |

Capped peak age: APP 25, BIRTH 25. positionPeakPPG: APP 7.646, BIRTH 6.749. positionBasisScale: APP 1.118, BIRTH 1.118.

### WR

| age | APP n | BIRTH n | APP medianPPG | BIRTH medianPPG | Δ (BIRTH − APP) |
|---:|---:|---:|---:|---:|---:|
| 18 | 96 | 0 | 3.704 | — | — |
| 19 | 111 | 0 | 4.554 | — | — |
| 20 | 158 | 17 | 5.485 | 8.258 | 2.773 |
| 21 | 226 | 106 | 6.280 | 7.254 | 0.975 |
| 22 | 267 | 245 | 6.309 | 6.007 | -0.302 |
| 23 | 283 | 306 | 6.184 | 5.259 | -0.925 |
| 24 | 236 | 295 | 6.377 | 5.425 | -0.952 |
| 25 | 190 | 275 | 6.472 | 5.826 | -0.646 |
| 26 | 145 | 214 | 6.852 | 6.281 | -0.571 |
| 27 | 106 | 188 | 6.664 | 6.297 | -0.366 |
| 28 | 72 | 138 | 6.670 | 6.141 | -0.530 |
| 29 | 45 | 105 | 6.165 | 6.201 | 0.035 |
| 30 | 27 | 70 | 6.079 | 6.467 | 0.388 |
| 31 | 18 | 51 | 5.582 | 7.168 | 1.586 |
| 32 | 9 | 33 | 5.881 | 7.083 | 1.202 |
| 33 | 2 | 19 | 4.145 | 6.508 | 2.363 |
| 34 | 2 | 11 | 2.427 | 6.882 | 4.455 |
| 35 | 1 | 5 | 0.509 | 5.770 | 5.261 |
| 36 | 0 | 2 | — | 6.060 | — |
| 37 | 0 | 2 | — | 4.405 | — |

Capped peak age: APP 26, BIRTH 20. positionPeakPPG: APP 6.852, BIRTH 8.258. positionBasisScale: APP 1.101, BIRTH 1.101.

### TE

| age | APP n | BIRTH n | APP medianPPG | BIRTH medianPPG | Δ (BIRTH − APP) |
|---:|---:|---:|---:|---:|---:|
| 18 | 48 | 0 | 2.862 | — | — |
| 19 | 74 | 0 | 2.917 | — | — |
| 20 | 103 | 6 | 2.986 | 5.757 | 2.771 |
| 21 | 112 | 32 | 3.049 | 4.996 | 1.947 |
| 22 | 135 | 97 | 2.938 | 3.834 | 0.896 |
| 23 | 152 | 160 | 2.916 | 3.031 | 0.114 |
| 24 | 149 | 189 | 3.055 | 2.699 | -0.355 |
| 25 | 133 | 177 | 3.433 | 2.696 | -0.737 |
| 26 | 90 | 149 | 4.006 | 2.681 | -1.325 |
| 27 | 73 | 123 | 4.727 | 3.241 | -1.486 |
| 28 | 52 | 99 | 5.257 | 3.378 | -1.879 |
| 29 | 36 | 75 | 6.040 | 3.922 | -2.118 |
| 30 | 26 | 56 | 6.690 | 4.164 | -2.526 |
| 31 | 12 | 36 | 7.089 | 5.195 | -1.895 |
| 32 | 10 | 24 | 6.367 | 6.346 | -0.021 |
| 33 | 7 | 13 | 5.088 | 7.758 | 2.671 |
| 34 | 6 | 12 | 5.316 | 8.896 | 3.580 |
| 35 | 2 | 5 | 4.568 | 7.570 | 3.002 |
| 36 | 1 | 4 | 3.889 | 6.323 | 2.435 |
| 37 | 1 | 4 | 1.714 | 3.821 | 2.108 |
| 38 | 1 | 3 | 0.823 | 2.519 | 1.697 |
| 39 | 1 | 1 | 0.429 | 1.086 | 0.657 |

Capped peak age: APP 29, BIRTH 29. positionPeakPPG: APP 6.040, BIRTH 3.922. positionBasisScale: APP 1.325, BIRTH 1.325.

### Row-level age gap

Curve-input rows: gp ≥ 10 skill rows 2012–2025 with both ages non-null; gap = APP age at the season − BIRTH age at the season.

| rows | n | mean gap (y) | \|gap\| > 1 y |
|---|---:|---:|---:|
| all | 5112 | -2.39 | 2687 |
| player has a team | 1699 | -0.22 | 81 |
| player has no team | 3413 | -3.47 | 2606 |
| season 2015 only | 349 | -4.26 | 315 |

2015 row-gap check: measured n=349, mean -4.26 y, 315 off by > 1 y; plan review: n=349, mean -4.26 y, 315 off by > 1 y (a check, not a gate)

## 5.2 Current players' age-adjusted component

Population: skill pids with a non-null `team` in `raw/-players-nfl.json` whose mirror score at S = 2025 is Path B or C under setting (a). Settings: (a) app today — Sleeper ages, APP curves; (b) curve fix only — Sleeper ages, BIRTH curves; (c) full fix — birthdate ages on D, BIRTH curves. All on the S = 2025 as-of inputs (offseason state: no live level, no KTC, per-season-team attribution).

Population 387: QB 42, RB 89, WR 156, TE 100. Excluded: notInAsOfUniverse 272, A2 69, A3 71, A4 28, A 148.

### (b − a): curve fix only

ageAdjusted component:

| position | rows | changed | \|Δ\| ≥ 5 | min | p10 | median | mean | p90 | max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| QB | 42 | 36 | 4 | -9.00 | -2.00 | 0.00 | 0.29 | 3.00 | 5.00 |
| RB | 89 | 68 | 32 | -8.00 | 0.00 | 2.00 | 3.19 | 10.00 | 15.00 |
| WR | 156 | 123 | 53 | -21.00 | 0.00 | 2.00 | 2.49 | 8.00 | 15.00 |
| TE | 100 | 77 | 60 | -25.00 | 0.00 | 6.00 | 8.02 | 21.00 | 37.00 |
| pooled | 387 | 304 | 149 | -25.00 | -1.00 | 2.00 | 3.84 | 12.00 | 37.00 |

total score (this mirror's offseason score, not the live app score (no KTC, live level, QB modifier; per-season-team attribution)):

| position | rows | changed | \|Δ\| ≥ 5 | min | p10 | median | mean | p90 | max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| QB | 42 | 17 | 0 | -2.00 | 0.00 | 0.00 | 0.19 | 1.00 | 2.00 |
| RB | 89 | 51 | 0 | -2.00 | 0.00 | 1.00 | 0.75 | 2.00 | 4.00 |
| WR | 156 | 86 | 1 | -6.00 | 0.00 | 0.00 | 0.50 | 2.00 | 4.00 |
| TE | 100 | 70 | 18 | -7.00 | 0.00 | 2.00 | 2.11 | 5.00 | 10.00 |
| pooled | 387 | 224 | 19 | -7.00 | 0.00 | 1.00 | 0.94 | 3.00 | 10.00 |

### (c − a): full fix

ageAdjusted component:

| position | rows | changed | \|Δ\| ≥ 5 | min | p10 | median | mean | p90 | max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| QB | 42 | 36 | 4 | -9.00 | -2.00 | 0.00 | 0.29 | 3.00 | 5.00 |
| RB | 89 | 68 | 31 | -8.00 | 0.00 | 2.00 | 3.18 | 10.00 | 15.00 |
| WR | 156 | 122 | 53 | -21.00 | 0.00 | 2.00 | 2.48 | 8.00 | 15.00 |
| TE | 100 | 77 | 60 | -25.00 | 0.00 | 6.00 | 8.02 | 21.00 | 37.00 |
| pooled | 387 | 303 | 148 | -25.00 | -1.00 | 2.00 | 3.83 | 12.00 | 37.00 |

total score (this mirror's offseason score, not the live app score (no KTC, live level, QB modifier; per-season-team attribution)):

| position | rows | changed | \|Δ\| ≥ 5 | min | p10 | median | mean | p90 | max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| QB | 42 | 17 | 0 | -2.00 | 0.00 | 0.00 | 0.19 | 1.00 | 2.00 |
| RB | 89 | 51 | 0 | -2.00 | 0.00 | 1.00 | 0.75 | 2.00 | 4.00 |
| WR | 156 | 86 | 1 | -6.00 | 0.00 | 0.00 | 0.50 | 2.00 | 4.00 |
| TE | 100 | 70 | 18 | -7.00 | 0.00 | 2.00 | 2.11 | 5.00 | 10.00 |
| pooled | 387 | 224 | 19 | -7.00 | 0.00 | 1.00 | 0.94 | 3.00 | 10.00 |

Pooled (c − a): 387 rows; ageAdjusted changed 303, |Δ| ≥ 5 on 148; ageAdjusted Δ min/p10/median/mean/p90/max -25.00/-1.00/2.00/3.83/12.00/37.00; score changed 224, |Δ| ≥ 5 on 19; score Δ -7.00/0.00/1.00/0.94/3.00/10.00

### The 15 largest |Δ ageAdjusted| under (c − a)

| name | pos | Sleeper age | birthdate age | ageAdj (a) | ageAdj (c) | label (a → c) |
|---|---|---:|---:|---:|---:|---|
| Mark Andrews | TE | 30 | 30 | 60 | 97 | Solid Floor → Peak Window |
| David Njoku | TE | 29 | 29 | 61 | 94 | Rising → Ascending Star |
| Isaiah Likely | TE | 26 | 26 | 57 | 86 | Solid Floor |
| Dawson Knox | TE | 29 | 29 | 53 | 81 | Solid Floor |
| Jake Tonges | TE | 26 | 26 | 72 | 100 | Rising |
| Noah Fant | TE | 28 | 28 | 49 | 76 | Managed Decline → Solid Floor |
| Mike Gesicki | TE | 30 | 30 | 43 | 69 | Managed Decline → Solid Floor |
| Tyler Higbee | TE | 33 | 33 | 73 | 48 | Rising |
| T.J. Hockenson | TE | 28 | 28 | 75 | 100 | Solid Floor → Peak Window |
| Pat Freiermuth | TE | 27 | 27 | 75 | 100 | Solid Floor → Peak Window |
| Cole Kmet | TE | 27 | 27 | 55 | 79 | Managed Decline → Solid Floor |
| Hunter Henry | TE | 31 | 31 | 79 | 100 | Peak Window → Elite |
| Calvin Ridley | WR | 31 | 31 | 94 | 73 | Veteran Producer |
| Evan Engram | TE | 31 | 31 | 47 | 65 | Solid Floor |
| Hunter Long | TE | 27 | 27 | 39 | 57 | Plateau → Solid Floor |

Report-only. The priority of the age fix is Anton's decision (backlog: 'Age curves and age inputs read stale Sleeper ages').
