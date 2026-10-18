# Computed-stats verification — 2026-10-18

| field | value |
|---|---|
| harness (app repo) | `496913887b9b28417d0c69307874e971cf18a78f` — local — unpushed at report time |
| data repo HEAD | `89966e3499f0e98d5060e4ea0055049d9dc71083` (clean) |
| snapshot | snapshots/2026-10-17.json (capturedAt 2026-10-17T18:43:19.681Z) |
| KTC file | ktc/snapshot-2026-10-12.json |
| playersMap fetched | 2026-10-18T12:38:19.127Z |
| CR ids read | CR-01, CR-02, CR-06, CR-08, CR-09, CR-10, CR-17, CR-28 |
| command | `node_modules/.bin/vite-node scripts/verify/computed-stats.mjs -- --data ../sleeper-dashboard-data --out ../sleeper-dashboard-data/verification --date 2026-10-18 --no-fetch --annotations ../sleeper-dashboard-data/verification/2026-10-18-computed-stats-annotations.json` |

## Summary

| check | description | compared | out of tolerance | rate | verdict |
|---|---|---|---|---|---|
| V1 | Fantasy points vs Sleeper matchups | 6072 | 0 | 0.00% | pass |
| V2.1 | Season counts (att, tgt, rec, cmp, int) vs gamelogs | 21552 | 12 | 0.06% | pass |
| V2.2 | Season yards vs gamelogs | 10776 | 10 | 0.09% | pass |
| V2.3 | Season TDs vs gamelogs | 10776 | 2 | 0.02% | pass |
| V2.4 | Team totals (per-season-team, ex-traded) vs rebuild | 576 | 11 | 1.91% | defect |
| V2.5 | Team totals (current-team) vs rebuild — report only | 576 | 566 | 98.26% | gap |
| V2.6 | Historical shares (per-season-team) vs rebuild | 2233 | 0 | 0.00% | pass |
| V2.7 | Historical shares (current-team, team-matched rows) — report only | 665 | 399 | 60.00% | gap |
| V2.8 | computeTeamContext carry / reception share vs rebuild | 1535 | 2 | 0.13% | defect |
| V2.9 | Efficiency-metric inputs vs gamelogs ratios | 10728 | 72 | 0.67% | defect |
| V2.10 | Red-zone consistency and plausibility | 3784 | 9 | 0.24% | gap |
| V2.11 | gamesPlayed vs snaps games | 3757 | 92 | 2.45% | defect |
| V2.12 | dnpWeeks vs rosterweekly eligibility − snaps games | 4615 | 1387 | 30.05% | defect |
| V3 KTC | V3 KTC joins (top 400 KTC) | 400 | 6 | 1.50% | defect |
| V3 draft | V3 draft joins (top 400 KTC) | 400 | 2 | 0.50% | defect |
| V3 college | V3 college joins (top 400 KTC) | 400 | 32 | 8.00% | defect |

## V1 — fantasy points vs Sleeper matchups

Leagues: 2025 → `1253804638616956928` (last scored leg 17); 2026 → `1312015497465716736` (last scored leg 5)

Included weeks: 2025: 1–17 (17); 2026: 1–5 (5)

2026 live league `scoring_settings` vs snapshot `scoringSettings`: equal

### Excluded weeks (never scored)

| season | week | gate | rows | season-totals lastModified | schedule generatedAt | detail |
|---|---|---|---|---|---|---|
| 2026 | 6 | 1 (w ≥ state.week) | 41 | 2026-10-16T11:15:45.246Z | 2026-10-16T17:40:20.459Z | state.week = 6 |

### Row classes

| class | rows |
|---|---|
| match | 6072 |
| diff | 0 |
| app-missing-zero | 2545 |
| app-missing-nonzero | 0 |
| app-no-row | 120 |

Exact-match rate (match / (match + diff)): **100.00%** (6072 / 6072).

### By season

| key | match | diff | rate |
|---|---|---|---|
| 2025 | 4625 | 0 | 100.00% |
| 2026 | 1447 | 0 | 100.00% |

### By position

| key | match | diff | rate |
|---|---|---|---|
| TE | 1060 | 0 | 100.00% |
| WR | 2578 | 0 | 100.00% |
| RB | 1665 | 0 | 100.00% |
| QB | 746 | 0 | 100.00% |
| DB | 12 | 0 | 100.00% |
| FB | 11 | 0 | 100.00% |

### By method

| key | match | diff | rate |
|---|---|---|---|
| exact | 6072 | 0 | 100.00% |

### |Δ| buckets (diff rows)

| bucket | rows |
|---|---|
| <=0.01 | 0 |
| <=0.1 | 0 |
| <=0.5 | 0 |
| <=1 | 0 |
| <=2 | 0 |
| >2 | 0 |

### Diff causes

_none_

### `app-missing-nonzero` / `app-no-row` by cause

| class | cause | rows |
|---|---|---|
| app-no-row | sleeper-zero | 120 |

### 25 largest |Δ| rows

_none_

### Σ|Δ points| by stat key (diff rows)

_none_

### As-run gap (G8): 2025 scored with 2026 settings vs 2025 settings

4625 player-weeks; mean |shift| 0.393, max 10.75. Settings keys that differ: kr_yd, pr_yd.

## V2 — stats feeding the grades (2020–2025, regular season)

### Per metric × season (compared / out → rate)

| check | metric | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 |
|---|---|---|---|---|---|---|---|
| V2.1 | rush_att | 603/0 (0.0%) | 629/0 (0.0%) | 607/3 (0.5%) | 571/0 (0.0%) | 587/0 (0.0%) | 595/0 (0.0%) |
| V2.1 | rec_tgt | 603/0 (0.0%) | 629/0 (0.0%) | 607/3 (0.5%) | 571/0 (0.0%) | 587/0 (0.0%) | 595/0 (0.0%) |
| V2.1 | rec | 603/0 (0.0%) | 629/0 (0.0%) | 607/2 (0.3%) | 571/0 (0.0%) | 587/0 (0.0%) | 595/0 (0.0%) |
| V2.1 | pass_att | 603/0 (0.0%) | 629/0 (0.0%) | 607/2 (0.3%) | 571/0 (0.0%) | 587/0 (0.0%) | 595/0 (0.0%) |
| V2.1 | pass_cmp | 603/0 (0.0%) | 629/0 (0.0%) | 607/2 (0.3%) | 571/0 (0.0%) | 587/0 (0.0%) | 595/0 (0.0%) |
| V2.1 | pass_int | 603/0 (0.0%) | 629/0 (0.0%) | 607/0 (0.0%) | 571/0 (0.0%) | 587/0 (0.0%) | 595/0 (0.0%) |
| V2.2 | rush_yd | 603/0 (0.0%) | 629/0 (0.0%) | 607/3 (0.5%) | 571/0 (0.0%) | 587/0 (0.0%) | 595/0 (0.0%) |
| V2.2 | rec_yd | 603/0 (0.0%) | 629/1 (0.2%) | 607/5 (0.8%) | 571/0 (0.0%) | 587/0 (0.0%) | 595/0 (0.0%) |
| V2.2 | pass_yd | 603/0 (0.0%) | 629/0 (0.0%) | 607/1 (0.2%) | 571/0 (0.0%) | 587/0 (0.0%) | 595/0 (0.0%) |
| V2.3 | rush_td | 603/0 (0.0%) | 629/0 (0.0%) | 607/0 (0.0%) | 571/0 (0.0%) | 587/0 (0.0%) | 595/0 (0.0%) |
| V2.3 | rec_td | 603/0 (0.0%) | 629/0 (0.0%) | 607/1 (0.2%) | 571/0 (0.0%) | 587/0 (0.0%) | 595/0 (0.0%) |
| V2.3 | pass_td | 603/0 (0.0%) | 629/0 (0.0%) | 607/1 (0.2%) | 571/0 (0.0%) | 587/0 (0.0%) | 595/0 (0.0%) |
| V2.4 | rushAtt | 32/0 (0.0%) | 32/0 (0.0%) | 32/1 (3.1%) | 32/0 (0.0%) | 32/0 (0.0%) | 32/2 (6.3%) |
| V2.4 | rec | 32/0 (0.0%) | 32/1 (3.1%) | 32/1 (3.1%) | 32/0 (0.0%) | 32/0 (0.0%) | 32/3 (9.4%) |
| V2.4 | recTgt | 32/0 (0.0%) | 32/1 (3.1%) | 32/0 (0.0%) | 32/0 (0.0%) | 32/0 (0.0%) | 32/2 (6.3%) |
| V2.5 | rushAtt | 32/31 (96.9%) | 32/32 (100.0%) | 32/32 (100.0%) | 32/31 (96.9%) | 32/32 (100.0%) | 32/30 (93.8%) |
| V2.5 | rec | 32/32 (100.0%) | 32/32 (100.0%) | 32/32 (100.0%) | 32/31 (96.9%) | 32/32 (100.0%) | 32/30 (93.8%) |
| V2.5 | recTgt | 32/32 (100.0%) | 32/32 (100.0%) | 32/32 (100.0%) | 32/32 (100.0%) | 32/30 (93.8%) | 32/31 (96.9%) |
| V2.6 | wrTeShare | 267/0 (0.0%) | 268/0 (0.0%) | 265/0 (0.0%) | 280/0 (0.0%) | 269/0 (0.0%) | 268/0 (0.0%) |
| V2.6 | rbShare | 107/0 (0.0%) | 108/0 (0.0%) | 103/0 (0.0%) | 100/0 (0.0%) | 99/0 (0.0%) | 99/0 (0.0%) |
| V2.7 | wrTeShare | 23/21 (91.3%) | 38/32 (84.2%) | 48/39 (81.3%) | 91/60 (65.9%) | 126/61 (48.4%) | 175/71 (40.6%) |
| V2.7 | rbShare | 5/4 (80.0%) | 7/7 (100.0%) | 13/12 (92.3%) | 23/20 (87.0%) | 45/34 (75.6%) | 71/38 (53.5%) |
| V2.7-g2 | wrTeShare | 59/53 (89.8%) | 72/58 (80.6%) | 91/81 (89.0%) | 97/58 (59.8%) | 89/45 (50.6%) | 72/21 (29.2%) |
| V2.7-g2 | rbShare | 18/17 (94.4%) | 26/25 (96.2%) | 36/29 (80.6%) | 42/35 (83.3%) | 33/27 (81.8%) | 25/16 (64.0%) |
| V2.8 | receptionShare | 92/0 (0.0%) | 122/0 (0.0%) | 159/0 (0.0%) | 206/0 (0.0%) | 249/0 (0.0%) | 297/0 (0.0%) |
| V2.8 | carryShare | 26/2 (7.7%) | 37/0 (0.0%) | 58/0 (0.0%) | 75/0 (0.0%) | 94/0 (0.0%) | 120/0 (0.0%) |
| V2.8-teamOffense | rushAtt | 32/31 (96.9%) | 32/32 (100.0%) | 32/32 (100.0%) | 32/31 (96.9%) | 32/32 (100.0%) | 32/30 (93.8%) |
| V2.8-teamOffense | rec | 32/32 (100.0%) | 32/32 (100.0%) | 32/32 (100.0%) | 32/31 (96.9%) | 32/32 (100.0%) | 32/30 (93.8%) |
| V2.9 | completionPct | 78/0 (0.0%) | 73/0 (0.0%) | 81/0 (0.0%) | 75/0 (0.0%) | 75/0 (0.0%) | 75/0 (0.0%) |
| V2.9 | passerRating | 78/0 (0.0%) | 73/0 (0.0%) | 81/1 (1.2%) | 75/0 (0.0%) | 75/0 (0.0%) | 75/0 (0.0%) |
| V2.9 | ypt | 346/7 (2.0%) | 356/12 (3.4%) | 342/5 (1.5%) | 324/2 (0.6%) | 342/5 (1.5%) | 338/2 (0.6%) |
| V2.9 | ypr | 330/0 (0.0%) | 343/1 (0.3%) | 329/1 (0.3%) | 312/0 (0.0%) | 327/0 (0.0%) | 331/0 (0.0%) |
| V2.9 | catchRate | 346/6 (1.7%) | 356/12 (3.4%) | 342/4 (1.2%) | 324/2 (0.6%) | 342/4 (1.2%) | 338/2 (0.6%) |
| V2.9 | recTdRate | 346/2 (0.6%) | 356/2 (0.6%) | 342/1 (0.3%) | 324/0 (0.0%) | 342/0 (0.0%) | 338/0 (0.0%) |
| V2.9 | ypc | 145/0 (0.0%) | 151/0 (0.0%) | 148/1 (0.7%) | 133/0 (0.0%) | 134/0 (0.0%) | 138/0 (0.0%) |
| V2.9 | rushTdRate | 145/0 (0.0%) | 151/0 (0.0%) | 148/0 (0.0%) | 133/0 (0.0%) | 134/0 (0.0%) | 138/0 (0.0%) |
| V2.10 | plausibility | 603/0 (0.0%) | 629/0 (0.0%) | 607/0 (0.0%) | 571/0 (0.0%) | 587/0 (0.0%) | 595/0 (0.0%) |
| V2.10 | teamRushRz | 32/3 (9.4%) | 32/2 (6.3%) | 32/1 (3.1%) | 32/3 (9.4%) | 32/0 (0.0%) | 32/0 (0.0%) |
| V2.11 | gamesPlayed | 621/5 (0.8%) | 663/39 (5.9%) | 628/31 (4.9%) | 611/5 (0.8%) | 615/7 (1.1%) | 619/5 (0.8%) |
| V2.12 | dnpWeeks | 669/20 (3.0%) | 812/293 (36.1%) | 789/277 (35.1%) | 784/266 (33.9%) | 781/277 (35.5%) | 780/254 (32.6%) |
| V2.12 | dnpWeeks-vs-D-count | 669/0 (0.0%) | 812/0 (0.0%) | 789/0 (0.0%) | 784/0 (0.0%) | 781/0 (0.0%) | 780/0 (0.0%) |

### Signed Δ distributions (app − reference) — G6 stat-definition evidence

| check | metric | n | neg | zero | pos | min | median | max |
|---|---|---|---|---|---|---|---|---|
| V2.1 | rush_att | 3592 | 0 | 3586 | 6 | 0 | 0 | 2 |
| V2.1 | rec_tgt | 3592 | 20 | 3549 | 23 | -2 | 0 | 2 |
| V2.1 | rec | 3592 | 1 | 3586 | 5 | -1 | 0 | 2 |
| V2.1 | pass_att | 3592 | 1 | 3589 | 2 | -1 | 0 | 6 |
| V2.1 | pass_cmp | 3592 | 0 | 3590 | 2 | 0 | 0 | 4 |
| V2.1 | pass_int | 3592 | 0 | 3592 | 0 | 0 | 0 | 0 |
| V2.2 | rush_yd | 3592 | 1 | 3583 | 8 | -1 | 0 | 18 |
| V2.2 | rec_yd | 3592 | 2 | 3585 | 5 | -6 | 0 | 26 |
| V2.2 | pass_yd | 3592 | 2 | 3588 | 2 | -1 | 0 | 52 |
| V2.3 | rush_td | 3592 | 0 | 3592 | 0 | 0 | 0 | 0 |
| V2.3 | rec_td | 3592 | 0 | 3591 | 1 | 0 | 0 | 1 |
| V2.3 | pass_td | 3592 | 0 | 3591 | 1 | 0 | 0 | 1 |

### Population mismatches (player-seasons on one side only)

| season | both | app-only by pos | gamelog-only by pos | gamelogs `unmapped` (G5) |
|---|---|---|---|---|
| 2020 | 603 | {"TE":12,"RB":5,"WR":16} | {} | 0 |
| 2021 | 629 | {"TE":25,"QB":4,"RB":6,"WR":14} | {} | 0 |
| 2022 | 607 | {"WR":15,"TE":9,"RB":3,"QB":1} | {} | 0 |
| 2023 | 571 | {"RB":9,"TE":20,"WR":18,"QB":1} | {} | 1 |
| 2024 | 587 | {"WR":14,"QB":1,"TE":16,"RB":4} | {} | 1 |
| 2025 | 595 | {"TE":16,"WR":16,"RB":8} | {} | 12 |

### V2.4 `doubling` team totals (ratio in [1.9, 2.1])

None.

### `team-key-unmatched` findings

_none_

### V2.6 `rec ÷ team rec` fallback branch taken (expected 0)

{}

### V2.10 red-zone: receiving ratio Σ`rec_rz_tgt` ÷ Σ`rzPassPlays` (ratio only)

| season | teams | min | median | max | teams > 1.0 |
|---|---|---|---|---|---|
| 2020 | 32 | 0.667 | 0.780 | 0.910 | none |
| 2021 | 32 | 0.675 | 0.793 | 0.913 | none |
| 2022 | 32 | 0.618 | 0.807 | 0.867 | none |
| 2023 | 32 | 0.600 | 0.785 | 0.853 | none |
| 2024 | 32 | 0.609 | 0.771 | 0.861 | none |
| 2025 | 32 | 0.591 | 0.785 | 0.904 | none |

### Report-only effect series (G3 / G2 size; never a verdict input)

| series | metric | season | count | mean abs Δ | max abs Δ |
|---|---|---|---|---|---|
| V2.6-g3effect | share | 2020 | 165 | 0.0044 | 0.1050 |
| V2.6-g3effect | share | 2021 | 304 | 0.0046 | 0.1500 |
| V2.6-g3effect | share | 2022 | 294 | 0.0078 | 0.3300 |
| V2.6-g3effect | share | 2023 | 187 | 0.0037 | 0.0860 |
| V2.6-g3effect | share | 2024 | 272 | 0.0039 | 0.1360 |
| V2.6-g3effect | share | 2025 | 268 | 0.0038 | 0.0870 |
| V2.8-g2effect | receptionShare | 2020 | 66 | 0.1964 | 0.9070 |
| V2.8-g2effect | receptionShare | 2021 | 79 | 0.1124 | 0.8920 |
| V2.8-g2effect | receptionShare | 2022 | 103 | 0.0749 | 0.7240 |
| V2.8-g2effect | receptionShare | 2023 | 109 | 0.0337 | 0.4400 |
| V2.8-g2effect | receptionShare | 2024 | 102 | 0.0157 | 0.1680 |
| V2.8-g2effect | receptionShare | 2025 | 84 | 0.0113 | 0.0960 |
| V2.8-g2effect | carryShare | 2020 | 20 | 0.2807 | 0.7480 |
| V2.8-g2effect | carryShare | 2021 | 29 | 0.1891 | 0.7290 |
| V2.8-g2effect | carryShare | 2022 | 41 | 0.1132 | 0.5790 |
| V2.8-g2effect | carryShare | 2023 | 50 | 0.0875 | 0.5280 |
| V2.8-g2effect | carryShare | 2024 | 40 | 0.0749 | 0.3040 |
| V2.8-g2effect | carryShare | 2025 | 36 | 0.0216 | 0.0890 |

### V2.12 signed distribution (app `dnpWeeks` − expected; negative = app undercounts misses)

| n | neg | zero | pos | min | median | max | hist |
|---|---|---|---|---|---|---|---|
| 4615 | 48 | 3228 | 1339 | -17 | 0 | 17 | {"0":3228,"1":114,"2":71,"<=-3":20,"-2":2,"-1":26,">=3":1154} |

### V2.12 diagnostics by season (DEV weeks and sign of Δ)

| season | rows with DEV | DEV weeks | DEV weeks marked D | DEV→D rate | Δ > 0 rows | Δ < 0 rows |
|---|---|---|---|---|---|---|
| 2020 | 168 | 1353 | 1 | 0.1% | 6 | 14 |
| 2021 | 272 | 2671 | 2589 | 96.9% | 275 | 18 |
| 2022 | 266 | 2543 | 2507 | 98.6% | 276 | 1 |
| 2023 | 259 | 2537 | 2505 | 98.7% | 264 | 2 |
| 2024 | 270 | 2700 | 2697 | 99.9% | 271 | 6 |
| 2025 | 248 | 2337 | 2330 | 99.7% | 247 | 7 |

V2.12 rows with Δ < 0 (`dnpNegative`): **48** — not interpreted here; per-week detail in sidecar `v2.info.dnpNegative`.

### Traded players (G3) — 110 player-season rows

| check | season | pid | pos | app team | app share | ref per team (stat · share · % of team denom) |
|---|---|---|---|---|---|---|
| V2.6 | 2021 | 147 | WR | LV | 0.055 | LA: 15 · 0.025 · 2.5%; LV: 19 · 0.032 · 3.2% |
| V2.6 | 2021 | 627 | WR | LAC | 0.003 | HOU: 2 · 0.004 · 0.4%; LAC: 0 · 0 · 0.0% |
| V2.6 | 2021 | 956 | RB | NO | 0.266 | HOU: 92 · 0.220 · 22.0%; NO: 68 · 0.133 · 13.3% |
| V2.6 | 2020 | 1071 | WR | DET | 0.043 | SF: 1 · 0.002 · 0.2%; DET: 23 · 0.041 · 4.1% |
| V2.6 | 2021 | 1339 | TE | ARI | 0.186 | PHI: 31 · 0.066 · 6.6%; ARI: 81 · 0.142 · 14.2% |
| V2.6 | 2020 | 1408 | RB | KC | 0.196 | NYJ: 19 · 0.047 · 4.7%; KC: 63 · 0.156 · 15.6% |
| V2.6 | 2021 | 1408 | RB | BAL | 0.075 | BAL: 31 · 0.060 · 6.0%; TB: 8 · 0.021 · 2.1% |
| V2.6 | 2024 | 1426 | WR | KC | 0.135 | TEN: 21 · 0.042 · 4.2%; KC: 59 · 0.104 · 10.4% |
| V2.6 | 2022 | 1476 | RB | DEN | 0.399 | NO: 11 · 0.024 · 2.4%; DEN: 160 · 0.360 · 36.0% |
| V2.6 | 2025 | 1689 | WR | MIN | 0.072 | MIN: 18 · 0.038 · 3.8%; PIT: 17 · 0.033 · 3.3% |
| V2.6 | 2022 | 1817 | WR | GB | 0.048 | GB: 22 · 0.041 · 4.1%; BAL: 5 · 0.011 · 1.1% |
| V2.6 | 2021 | 1911 | WR | LV | 0.013 | LV: 5 · 0.008 · 0.8%; CAR: 3 · 0.005 · 0.5% |
| V2.6 | 2021 | 2078 | WR | LA | 0.132 | CLE: 34 · 0.068 · 6.8%; LA: 48 · 0.080 · 8.0% |
| V2.6 | 2024 | 2133 | WR | NYJ | 0.237 | LV: 27 · 0.046 · 4.6%; NYJ: 114 · 0.194 · 19.4% |
| V2.6 | 2025 | 2197 | WR | NO | 0.071 | NO: 25 · 0.044 · 4.4%; BUF: 11 · 0.023 · 2.3% |
| V2.6 | 2024 | 2309 | WR | BUF | 0.158 | CLE: 53 · 0.084 · 8.4%; BUF: 32 · 0.065 · 6.5% |
| V2.6 | 2021 | 2359 | RB | CAR | 0.103 | MIN: 7 · 0.016 · 1.6%; CAR: 44 · 0.097 · 9.7% |
| V2.6 | 2025 | 2374 | WR | LV | 0.118 | TEN: 21 · 0.040 · 4.0%; LV: 34 · 0.069 · 6.9% |
| V2.6 | 2022 | 2381 | WR | TEN | 0.016 | HOU: 2 · 0.004 · 0.4%; TEN: 5 · 0.011 · 1.1% |
| V2.6 | 2020 | 2750 | WR | HOU | 0.004 | HOU: 2 · 0.004 · 0.4%; CHI: 0 · 0 · 0.0% |
| V2.6 | 2022 | 3258 | TE | NYG | 0.018 | NO: 2 · 0.004 · 0.4%; NYG: 7 · 0.014 · 1.4% |
| V2.6 | 2021 | 3342 | WR | CHI | 0.032 | MIA: 2 · 0.003 · 0.3%; CHI: 15 · 0.029 · 2.9% |
| V2.6 | 2022 | 3423 | WR | ARI | 0.066 | CAR: 27 · 0.063 · 6.3%; ARI: 17 · 0.027 · 2.7% |
| V2.6 | 2021 | 3852 | WR | JAX | 0.005 | TB: 0 · 0 · 0.0%; JAX: 3 · 0.005 · 0.5% |
| V2.6 | 2020 | 3895 | WR | DET | 0.057 | DET: 30 · 0.053 · 5.3%; CLE: 2 · 0.004 · 0.4% |
| V2.6 | 2022 | 4034 | RB | SF | 0.491 | CAR: 85 · 0.176 · 17.6%; SF: 159 · 0.315 · 31.5% |
| V2.6 | 2024 | 4068 | WR | PIT | 0.071 | NYJ: 21 · 0.036 · 3.6%; PIT: 13 · 0.028 · 2.8% |
| V2.6 | 2021 | 4150 | RB | ATL | 0.071 | ATL: 28 · 0.071 · 7.1%; MIN: 0 · 0 · 0.0% |
| V2.6 | 2022 | 4152 | RB | DEN | 0.037 | SF: 0 · 0 · 0.0%; DEN: 16 · 0.036 · 3.6% |
| V2.6 | 2021 | 4171 | WR | DET | 0.085 | TEN: 13 · 0.025 · 2.5%; DET: 36 · 0.064 · 6.4% |
| V2.6 | 2024 | 4171 | WR | DEN | 0.044 | DEN: 19 · 0.035 · 3.5%; JAX: 5 · 0.010 · 1.0% |
| V2.6 | 2022 | 4443 | TE | CLE | 0.039 | HOU: 10 · 0.018 · 1.8%; CLE: 10 · 0.020 · 2.0% |
| V2.6 | 2021 | 4741 | TE | JAX | 0.088 | CAR: 11 · 0.019 · 1.9%; JAX: 41 · 0.070 · 7.0% |
| V2.6 | 2020 | 4994 | RB | LAC | 0.194 | NYJ: 3 · 0.007 · 0.7%; LAC: 88 · 0.189 · 18.9% |
| V2.6 | 2022 | 5000 | RB | MIA | 0.134 | MIA: 42 · 0.108 · 10.8%; DEN: 26 · 0.059 · 5.9% |
| V2.6 | 2021 | 5046 | RB | CAR | 0.113 | CAR: 21 · 0.046 · 4.6%; HOU: 35 · 0.084 · 8.4% |
| V2.6 | 2024 | 5086 | WR | NO | 0.084 | BUF: 9 · 0.018 · 1.8%; NO: 35 · 0.068 · 6.8% |
| V2.6 | 2025 | 5086 | WR | PIT | 0.056 | SF: 8 · 0.015 · 1.5%; PIT: 21 · 0.040 · 4.0% |
| V2.6 | 2021 | 5123 | RB | SF | 0.006 | BAL: 2 · 0.004 · 0.4%; SF: 1 · 0.002 · 0.2% |
| V2.6 | 2025 | 5154 | WR | DEN | 0.008 | DEN: 4 · 0.007 · 0.7%; ARI: 1 · 0.002 · 0.2% |
| V2.6 | 2021 | 5170 | RB | HOU | 0.266 | HOU: 50 · 0.119 · 11.9%; MIA: 38 · 0.086 · 8.6% |
| V2.6 | 2022 | 5284 | RB | MIA | 0.346 | SF: 92 · 0.183 · 18.3%; MIA: 84 · 0.216 · 21.6% |
| V2.6 | 2022 | 5347 | RB | BUF | 0.055 | IND: 18 · 0.041 · 4.1%; BUF: 6 · 0.014 · 1.4% |
| V2.6 | 2022 | 5844 | TE | MIN | 0.189 | DET: 43 · 0.077 · 7.7%; MIN: 86 · 0.134 · 13.4% |
| V2.6 | 2023 | 5917 | WR | KC | 0.040 | NYJ: 3 · 0.005 · 0.5%; KC: 21 · 0.035 · 3.5% |
| V2.6 | 2024 | 5937 | WR | CAR | 0.123 | CAR: 58 · 0.112 · 11.2%; BAL: 5 · 0.011 · 1.1%; HOU: 4 · 0.007 · 0.7% |
| V2.6 | 2025 | 5938 | WR | DEN | 0.042 | NYG: 10 · 0.020 · 2.0%; DEN: 15 · 0.026 · 2.6% |
| V2.6 | 2025 | 5947 | WR | JAX | 0.185 | LV: 49 · 0.100 · 10.0%; JAX: 61 · 0.112 · 11.2% |
| V2.6 | 2020 | 6039 | RB | NYJ | 0.141 | DET: 0 · 0 · 0.0%; NYJ: 54 · 0.133 · 13.3% |
| V2.6 | 2021 | 6063 | WR | JAX | 0.008 | JAX: 5 · 0.009 · 0.9%; LV: 0 · 0 · 0.0% |
| V2.6 | 2025 | 6694 | RB | NE | 0.028 | ARI: 1 · 0.003 · 0.3%; NE: 13 · 0.026 · 2.6% |
| V2.6 | 2023 | 6699 | WR | NYG | 0.002 | PIT: 1 · 0.002 · 0.2%; NYG: 0 · 0 · 0.0% |
| V2.6 | 2023 | 6824 | WR | DET | 0.042 | CLE: 18 · 0.030 · 3.0%; DET: 7 · 0.012 · 1.2% |
| V2.6 | 2022 | 6845 | RB | IND | 0.212 | BUF: 17 · 0.040 · 4.0%; IND: 76 · 0.173 · 17.3% |
| V2.6 | 2023 | 6853 | WR | ATL | 0.082 | LA: 15 · 0.027 · 2.7%; ATL: 28 · 0.055 · 5.5% |
| V2.6 | 2022 | 6886 | WR | PIT | 0.137 | PIT: 50 · 0.091 · 9.1%; CHI: 29 · 0.081 · 8.1% |
| V2.6 | 2023 | 6886 | WR | MIA | 0.037 | CHI: 14 · 0.029 · 2.9%; MIA: 7 · 0.013 · 1.3% |
| V2.6 | 2022 | 6920 | WR | NYG | 0.097 | BUF: 6 · 0.011 · 1.1%; NYG: 42 · 0.086 · 8.6% |
| V2.6 | 2024 | 6938 | RB | MIN | 0.209 | HOU: 40 · 0.092 · 9.2%; MIN: 64 · 0.140 · 14.0% |
| V2.6 | 2022 | 6951 | RB | ARI | 0.172 | ARI: 70 · 0.161 · 16.1%; HOU: 3 · 0.008 · 0.8%; NO: 4 · 0.009 · 0.9% |

_50 more in the sidecar._

### Largest out-of-tolerance rows (top 40 by |Δ|)

| check | metric | season | pid/team | pos | app | ref | Δ |
|---|---|---|---|---|---|---|---|
| V2.2 | pass_yd | 2022 | 6770 | QB | 4527 | 4475 | 52 |
| V2.2 | rec_yd | 2022 | 2449 | WR | 1455 | 1429 | 26 |
| V2.2 | rec_yd | 2022 | 4973 | TE | 439 | 414 | 25 |
| V2.2 | rush_yd | 2022 | 8138 | RB | 525 | 507 | 18 |
| V2.12 | dnpWeeks | 2021 | 1550 | QB | 17 | 0 | 17 |
| V2.12 | dnpWeeks | 2021 | 3239 | TE | 17 | 0 | 17 |
| V2.12 | dnpWeeks | 2021 | 4489 | WR | 17 | 0 | 17 |
| V2.12 | dnpWeeks | 2021 | 4551 | WR | 17 | 0 | 17 |
| V2.12 | dnpWeeks | 2021 | 6178 | RB | 17 | 0 | 17 |
| V2.12 | dnpWeeks | 2021 | 6233 | TE | 17 | 0 | 17 |
| V2.12 | dnpWeeks | 2021 | 6913 | WR | 17 | 0 | 17 |
| V2.12 | dnpWeeks | 2021 | 6939 | WR | 17 | 0 | 17 |
| V2.12 | dnpWeeks | 2021 | 7009 | WR | 17 | 0 | 17 |
| V2.12 | dnpWeeks | 2021 | 7013 | QB | 17 | 0 | 17 |
| V2.12 | dnpWeeks | 2021 | 7143 | QB | 17 | 0 | 17 |
| V2.12 | dnpWeeks | 2021 | 7233 | WR | 17 | 0 | 17 |
| V2.12 | dnpWeeks | 2021 | 7412 | RB | 17 | 0 | 17 |
| V2.12 | dnpWeeks | 2021 | 7521 | WR | 17 | 0 | 17 |
| V2.12 | dnpWeeks | 2021 | 7539 | RB | 17 | 0 | 17 |
| V2.12 | dnpWeeks | 2021 | 7541 | WR | 17 | 0 | 17 |
| V2.12 | dnpWeeks | 2021 | 7546 | WR | 17 | 0 | 17 |
| V2.12 | dnpWeeks | 2021 | 7741 | RB | 17 | 0 | 17 |
| V2.12 | dnpWeeks | 2021 | 7860 | WR | 17 | 0 | 17 |
| V2.12 | dnpWeeks | 2021 | 7865 | WR | 17 | 0 | 17 |
| V2.12 | dnpWeeks | 2021 | 7918 | RB | 17 | 0 | 17 |
| V2.12 | dnpWeeks | 2021 | 7989 | WR | 17 | 0 | 17 |
| V2.12 | dnpWeeks | 2021 | 8018 | TE | 17 | 0 | 17 |
| V2.12 | dnpWeeks | 2022 | 1338 | QB | 17 | 0 | 17 |
| V2.12 | dnpWeeks | 2022 | 1550 | QB | 17 | 0 | 17 |
| V2.12 | dnpWeeks | 2022 | 2394 | QB | 17 | 0 | 17 |
| V2.12 | dnpWeeks | 2022 | 3568 | WR | 17 | 0 | 17 |
| V2.12 | dnpWeeks | 2022 | 4647 | TE | 17 | 0 | 17 |
| V2.12 | dnpWeeks | 2022 | 5120 | QB | 17 | 0 | 17 |
| V2.12 | dnpWeeks | 2022 | 5253 | TE | 17 | 0 | 17 |
| V2.12 | dnpWeeks | 2022 | 6059 | WR | 17 | 0 | 17 |
| V2.12 | dnpWeeks | 2022 | 6178 | RB | 17 | 0 | 17 |
| V2.12 | dnpWeeks | 2022 | 6311 | RB | 17 | 0 | 17 |
| V2.12 | dnpWeeks | 2022 | 6553 | RB | 17 | 0 | 17 |
| V2.12 | dnpWeeks | 2022 | 6913 | WR | 17 | 0 | 17 |
| V2.12 | dnpWeeks | 2022 | 7009 | WR | 17 | 0 | 17 |

## V3 — joins, top KTC players

Matcher outputs on full inputs: KTC 457/500 rows resolved; 778 draft matches; 2104 college-matched players. Top 400 inspected.

| reason code | rows |
|---|---|
| college-after-draft | 9 |
| college-disagree | 3 |
| college-name-collision | 5 |
| college-none | 20 |
| draft-missing | 2 |
| draft-out-of-window | 24 |
| ktc-ambiguous-first-taken | 1 |
| ktc-team-disagree | 8 |
| ktc-unmatched | 5 |

### college-after-draft (9)

| rank | name | pos | team | value | sid | evidence |
|---|---|---|---|---|---|---|
| 11 | Caleb Williams | QB | CHI | 7494 | 11560 | `{"seasons":[2021,2022,2023,2025],"draftYear":2024}` |
| 78 | A.J. Brown | WR | NEP | 4448 | 5859 | `{"seasons":[2017,2018,2022],"draftYear":2019}` |
| 108 | Mike Evans | WR | SFO | 3365 | 2216 | `{"matchedTeams":[{"year":2020,"team":"App State"},{"year":2021,"team":"App State"}],"sources":{"crosswalk":"Texas A&M","sleeper":"Texas A&M"},"seasons":[2020,2021],"draftYear":2014}` |
| 112 | Brian Thomas Jr. | WR | JAC | 3308 | 11631 | `{"seasons":[2021,2022,2023,2024,2025],"draftYear":2024,"collisionYear":2023,"cfbdIds":["4432773","5157545"]}` |
| 113 | Daniel Jones | QB | IND | 3307 | 5870 | `{"seasons":[2017,2018,2021],"draftYear":2019}` |
| 241 | Kyle Williams | WR | NEP | 2002 | 638 | `{"seasons":[2017,2018,2019,2024],"draftYear":2010,"collisionYear":2024,"cfbdIds":["4613202","5077107"]}` |
| 270 | Isaiah Davis | RB | NYJ | 1836 | 11571 | `{"seasons":[2021,2022,2023,2025],"draftYear":2024,"collisionYear":2021,"cfbdIds":["4609242","4695404"]}` |
| 296 | Justice Hill | RB | BAL | 1603 | 5995 | `{"seasons":[2017,2018,2024],"draftYear":2019}` |
| 313 | Chris Brooks | RB | GBP | 1491 | 11370 | `{"matchedTeams":[{"year":2024,"team":"Wisconsin"},{"year":2025,"team":"Wisconsin"}],"sources":{"crosswalk":"BYU","sleeper":"BYU"},"seasons":[2024,2025],"draftYear":2023}` |

### college-disagree (3)

| rank | name | pos | team | value | sid | evidence |
|---|---|---|---|---|---|---|
| 108 | Mike Evans | WR | SFO | 3365 | 2216 | `{"matchedTeams":[{"year":2020,"team":"App State"},{"year":2021,"team":"App State"}],"sources":{"crosswalk":"Texas A&M","sleeper":"Texas A&M"},"seasons":[2020,2021],"draftYear":2014}` |
| 282 | Ray Davis | RB | BUF | 1743 | 11575 | `{"matchedTeams":[{"year":2022,"team":"Vanderbilt"}],"sources":{"crosswalk":"Kentucky","sleeper":"Kentucky"}}` |
| 313 | Chris Brooks | RB | GBP | 1491 | 11370 | `{"matchedTeams":[{"year":2024,"team":"Wisconsin"},{"year":2025,"team":"Wisconsin"}],"sources":{"crosswalk":"BYU","sleeper":"BYU"},"seasons":[2024,2025],"draftYear":2023}` |

### college-name-collision (5)

| rank | name | pos | team | value | sid | evidence |
|---|---|---|---|---|---|---|
| 40 | Chase Brown | RB | CIN | 5561 | 9224 | `{"collisionYear":2022,"cfbdIds":["4362238","4250849"]}` |
| 45 | DeVonta Smith | WR | PHI | 5366 | 7525 | `{"collisionYear":2017,"cfbdIds":["4241478","4241010"]}` |
| 112 | Brian Thomas Jr. | WR | JAC | 3308 | 11631 | `{"seasons":[2021,2022,2023,2024,2025],"draftYear":2024,"collisionYear":2023,"cfbdIds":["4432773","5157545"]}` |
| 241 | Kyle Williams | WR | NEP | 2002 | 638 | `{"seasons":[2017,2018,2019,2024],"draftYear":2010,"collisionYear":2024,"cfbdIds":["4613202","5077107"]}` |
| 270 | Isaiah Davis | RB | NYJ | 1836 | 11571 | `{"seasons":[2021,2022,2023,2025],"draftYear":2024,"collisionYear":2021,"cfbdIds":["4609242","4695404"]}` |

### college-none (20)

| rank | name | pos | team | value | sid | evidence |
|---|---|---|---|---|---|---|
| 52 | Christian Watson | WR | GBP | 5245 | 8167 | `{"cfbdNameFound":{}}` |
| 57 | Bucky Irving | RB | TBB | 5093 | 11584 | `{"cfbdNameFound":{}}` |
| 69 | KC Concepcion | WR | CLE | 4594 | 13298 | `{"cfbdNameFound":{}}` |
| 72 | Cam Skattebo | RB | NYG | 4563 | 12481 | `{"cfbdNameFound":{}}` |
| 102 | Cam Ward | QB | TEN | 3471 | 12522 | `{"cfbdNameFound":{}}` |
| 125 | Jacory Croskey-Merritt | RB | WAS | 3109 | 12533 | `{"cfbdNameFound":{}}` |
| 134 | Mike Washington Jr. | RB | LVR | 3044 | 13305 | `{"cfbdNameFound":{}}` |
| 141 | Woody Marks | RB | HOU | 2915 | 12474 | `{"cfbdNameFound":{}}` |
| 145 | Pat Bryant | WR | DEN | 2873 | 12492 | `{"cfbdNameFound":{}}` |
| 175 | Dallas Goedert | TE | PHI | 2619 | 5022 | `{"cfbdNameFound":{}}` |
| 193 | Emanuel Wilson | RB | SEA | 2492 | 11435 | `{"cfbdNameFound":{}}` |
| 212 | Tank Dell | WR | HOU | 2263 | 9502 | `{"cfbdNameFound":{}}` |
| 227 | Dohnte Meyers | WR | CIN | 2116 | 13264 | `{"cfbdNameFound":{}}` |
| 244 | Tyson Bagent | QB | CHI | 1995 | 11256 | `{"cfbdNameFound":{}}` |
| 280 | Joshua Palmer | WR | BUF | 1761 | 7670 | `{"cfbdNameFound":{}}` |
| 307 | Isiah Pacheco | RB | DET | 1518 | 8205 | `{"cfbdNameFound":{}}` |
| 356 | Kameron Johnson | WR | TBB | 1220 | 11994 | `{"cfbdNameFound":{}}` |
| 357 | Tutu Atwell | WR | LAR | 1216 | 7562 | `{"cfbdNameFound":{}}` |
| 359 | Jack Strand | QB | ATL | 1201 | 13602 | `{"cfbdNameFound":{}}` |
| 370 | KeAndre Lambert-Smith | WR | LAC | 1152 | 12670 | `{"cfbdNameFound":{}}` |

### draft-missing (2)

| rank | name | pos | team | value | sid | evidence |
|---|---|---|---|---|---|---|
| 280 | Joshua Palmer | WR | BUF | 1761 | 7670 | `{"subReason":"name-not-found","crosswalk":{"draftYear":2021,"draftRound":3,"draftPick":13}}` |
| 393 | Elijah Higgins | TE | ARI | 1025 | 10231 | `{"subReason":"position-incompatible","crosswalk":{"draftYear":2023,"draftRound":6,"draftPick":20}}` |

### draft-out-of-window (24)

| rank | name | pos | team | value | sid | evidence |
|---|---|---|---|---|---|---|
| 53 | Dak Prescott | QB | DAL | 5215 | 3294 | `{}` |
| 59 | Derrick Henry | RB | BAL | 5005 | 3198 | `{}` |
| 67 | Jared Goff | QB | DET | 4788 | 3163 | `{}` |
| 94 | Davante Adams | WR | LAR | 3782 | 2133 | `{}` |
| 99 | Matthew Stafford | QB | LAR | 3522 | 421 | `{}` |
| 108 | Mike Evans | WR | SFO | 3365 | 2216 | `{}` |
| 148 | Travis Kelce | TE | KCC | 2839 | 1466 | `{}` |
| 166 | Stefon Diggs | WR | WAS | 2682 | 2449 | `{}` |
| 168 | Kirk Cousins | QB | LVR | 2658 | 1166 | `{}` |
| 170 | Jacoby Brissett | QB | ARI | 2646 | 3257 | `{}` |
| 190 | Geno Smith | QB | NYJ | 2514 | 1373 | `{}` |
| 215 | Hunter Henry | TE | NEP | 2199 | 3214 | `{}` |
| 236 | Aaron Rodgers | QB | PIT | 2041 | 96 | `{}` |
| 241 | Kyle Williams | WR | NEP | 2002 | 638 | `{}` |
| 245 | Jameis Winston | QB | NYG | 1993 | 2306 | `{}` |
| 250 | Darren Waller | TE | CAR | 1953 | 2505 | `{}` |
| 264 | Marcus Mariota | QB | WAS | 1866 | 2307 | `{}` |
| 267 | Kalif Raymond | WR | CHI | 1859 | 3634 | `{}` |
| 284 | Tyler Higbee | TE | LAR | 1736 | 3271 | `{}` |
| 294 | Keenan Allen | WR | IND | 1674 | 1479 | `{}` |
| 308 | Carson Wentz | QB | MIN | 1516 | 3161 | `{}` |
| 316 | Tyreek Hill | WR | FA | 1463 | 3321 | `{}` |
| 372 | Zach Ertz | TE | PHI | 1141 | 1339 | `{}` |
| 384 | Demarcus Robinson | WR | SFO | 1073 | 3286 | `{}` |

### ktc-ambiguous-first-taken (1)

| rank | name | pos | team | value | sid | evidence |
|---|---|---|---|---|---|---|
| 241 | Kyle Williams | WR | NEP | 2002 | 638 | `{"candidates":["638","7437","12547"],"teams":{"ktc":"NEP","sleeper":null}}` |

### ktc-team-disagree (8)

| rank | name | pos | team | value | sid | evidence |
|---|---|---|---|---|---|---|
| 95 | Marvin Harrison Jr. | WR | ARI | 3643 | 11628 | `{"teams":{"ktc":"ARI","sleeper":"HOU"}}` |
| 241 | Kyle Williams | WR | NEP | 2002 | 638 | `{"candidates":["638","7437","12547"],"teams":{"ktc":"NEP","sleeper":null}}` |
| 326 | Joe Milton | QB | DAL | 1360 | 11557 | `{"teams":{"ktc":"DAL","sleeper":"PHI"}}` |
| 354 | Jarquez Hunter | RB | MIA | 1240 | 11569 | `{"teams":{"ktc":"MIA","sleeper":"NO"}}` |
| 355 | Devin Neal | RB | MIN | 1231 | 12476 | `{"teams":{"ktc":"MIN","sleeper":"WAS"}}` |
| 365 | Trey Palmer | WR | NOS | 1173 | 9492 | `{"teams":{"ktc":"NOS","sleeper":null}}` |
| 366 | Audric Estime | RB | MIN | 1173 | 11579 | `{"teams":{"ktc":"MIN","sleeper":"CLE"}}` |
| 369 | Emari Demercado | RB | FA | 1161 | 11199 | `{"teams":{"ktc":"FA","sleeper":"DAL"}}` |

### ktc-unmatched (5)

| rank | name | pos | team | value | sid | evidence |
|---|---|---|---|---|---|---|
| 100 | D.J. Moore | WR | BUF | 3521 | — | `{"hint":[{"sid":"233","name":"Matt Moore","position":"QB","team":null},{"sid":"270","name":"Lance Moore","position":"WR","team":null},{"sid":"511","name":"Marlon Moore","position":"WR","team":null},{"sid":"887","name":"Denarius Moore","position":"WR","team":null},{"sid":"1158","name":"Kellen Moore",` |
| 195 | Kenneth Gainwell | RB | TBB | 2488 | — | `{"hint":[{"sid":"7567","name":"Kenny Gainwell","position":"RB","team":"TB"}]}` |
| 228 | Chigoziem Okonkwo | TE | WAS | 2106 | — | `{"hint":[{"sid":"8210","name":"Chig Okonkwo","position":"TE","team":"WAS"}]}` |
| 234 | Travis Hunter | WR | JAC | 2059 | — | `{"hint":[{"sid":"978","name":"Kendall Hunter","position":"RB","team":null},{"sid":"1418","name":"Justin Hunter","position":"WR","team":null},{"sid":"3922","name":"Montario Hunter","position":"WR","team":null},{"sid":"11569","name":"Jarquez Hunter","position":"RB","team":"NO"}]}` |
| 311 | Matthew Hibner | TE | BAL | 1513 | — | `{"hint":[{"sid":"13324","name":"Matt Hibner","position":"TE","team":"BAL"}]}` |

### College rushing-only RBs (matcher Pass 1 is receiving-driven): 0

### Top rows without a crosswalk entry: 2

## Known definitional gaps

### G1

computeTeamContext `targetShare` is reception share (receptions ÷ team receptions, teamContext.js:213)

Reception-share vs true target-share gap over 1125 WR/TE player-seasons (every V2.8 WR/TE row, both shares on the same current-team reference): mean |gap| 0.0125, p95 0.0390, max 0.1000; 501 rows > 0.01, 21 rows > 0.05.

### G2

Current-team attribution (App.jsx:246, :295, :300) groups a season under the player’s present team

1419 share rows (V2.7, and V2.8-g2effect: current-team reference minus season-team reference) where the app's attributed current team differs from the player's nflverse season team; mean |error| 0.0836, max 0.9070; 517 rows > 0.05.

### G3

One team per player-season for traded players

Traded (>1 REG team) player-seasons with a share row: 2020: 6, 2021: 17, 2022: 21, 2023: 6, 2024: 15, 2025: 13; absent from the V2.4/V2.6 tolerance rates (ex-traded on both sides), listed in the traded table; the denominator effect on teammates is the V2.6-g3effect series.

### G4

App team totals count only rows with gamesPlayed ≥ 1; current-team mode drops players absent from playersMap

2020: 0 gp≥1 rows absent from playersMap hold 0 rush_att (dropped in current-team mode); 93 gp<1 rows hold 0 rush_att; 2021: 1 gp≥1 rows absent from playersMap hold 0 rush_att (dropped in current-team mode); 462 gp<1 rows hold 0 rush_att; 2022: 0 gp≥1 rows absent from playersMap hold 0 rush_att (dropped in current-team mode); 525 gp<1 rows hold 0 rush_att; 2023: 0 gp≥1 rows absent from playersMap hold 0 rush_att (dropped in current-team mode); 571 gp<1 rows hold 0 rush_att; 2024: 0 gp≥1 rows absent from playersMap hold 0 rush_att (dropped in current-team mode); 563 gp<1 rows hold 0 rush_att; 2025: 0 gp≥1 rows absent from playersMap hold 0 rush_att (dropped in current-team mode); 580 gp<1 rows hold 0 rush_att

### G5

Gamelogs drop unmapped players, so reference team totals run low

Gamelogs `unmapped` per season: 2020: 0, 2021: 0, 2022: 0, 2023: 1, 2024: 1, 2025: 12.

### G6

Sleeper vs nflverse stat definitions (kneels, laterals, sack attribution)

rush_att: out 3/3592, signed Δ neg/zero/pos 0/3586/6; rec_tgt: out 3/3592, signed Δ neg/zero/pos 20/3549/23; rec: out 2/3592, signed Δ neg/zero/pos 1/3586/5; pass_att: out 2/3592, signed Δ neg/zero/pos 1/3589/2; pass_cmp: out 2/3592, signed Δ neg/zero/pos 0/3590/2; pass_int: out 0/3592, signed Δ neg/zero/pos 0/3592/0; rush_yd: out 3/3592, signed Δ neg/zero/pos 1/3583/8; rec_yd: out 6/3592, signed Δ neg/zero/pos 2/3585/5; pass_yd: out 1/3592, signed Δ neg/zero/pos 2/3588/2; rush_td: out 0/3592, signed Δ neg/zero/pos 0/3592/0; rec_td: out 1/3592, signed Δ neg/zero/pos 0/3591/1; pass_td: out 1/3592, signed Δ neg/zero/pos 0/3591/1

### G7

No independent per-player red-zone source is served; V2.10 is consistency-only

V2.10 verdict gap; plausibility violations 0 of 3592 player-seasons; rush-side team ratio outside [0.85, 1.15]: 9 of 192 team-seasons.

### G8

History rescored under today’s league settings (V1 as-run gap)

2025 league vs 2026 league settings differ in: kr_yd, pr_yd. Scoring 2025 with 2026 settings shifts 4625 player-weeks by mean 0.3932, max 10.75 points.

### G9

Stat corrections after the season-totals capture (V1 `stale-capture`)

0 diff rows classified `stale-capture` (Σ|Δ| 0.00 points).

### G10

First-down derivation uses the current position (`rescoreSeasonTotals`); no effect for 2022+

2020: derived-first-down path applies to 531 skill rows; 2021: derived-first-down path applies to 529 skill rows. Current-position use is measured only where Sleeper emitted no `bonus_fd_*` key.

## Confirmed defects

| defect | blocking (proposed) | backlog file | entry title |
|---|---|---|---|
| D-76 | yes | sleeper-dashboard/.claude/tasks/data-repo-backlog.md | D-76 · `dnpWeeks` / `'D'` weeks count practice-squad (`DEV`) weeks as missed games (V2.12) |
| D-77 | yes | sleeper-dashboard/.claude/tasks/data-repo-backlog.md | D-77 · Season-totals `gamesPlayed` exceeds nflverse snap games for ~2.5% of skill player-seasons (V2.11) |
| D-78 | no | sleeper-dashboard/.claude/tasks/data-repo-backlog.md | D-78 · `college/` files carry no rows for some FCS / lower-division players in the KTC top 400 (V3 college) |
| APP-1 | yes | sleeper-dashboard-data/.claude/tasks/app-repo-backlog.md | Name-only matchers miss nickname and short-form name variants (V3 KTC, college, draft) |
| APP-2 | yes | sleeper-dashboard-data/.claude/tasks/app-repo-backlog.md | Same-name, different-person: KTC takes the first candidate, college attaches the wrong player's seasons (V3 KTC, college) |
| APP-3 | no | sleeper-dashboard-data/.claude/tasks/app-repo-backlog.md | nflDraftMatch rejects TE↔RB hybrids as position-incompatible (V3 draft) |
| APP-4 | no | sleeper-dashboard-data/.claude/tasks/app-repo-backlog.md | Travis Hunter: Sleeper position `DB` is outside the matchers' skill-position guard (V3 KTC) |
| APP-5 | no | sleeper-dashboard-data/.claude/tasks/app-repo-backlog.md | V2.4 per-season-team team totals differ from the nflverse rebuild in 11 team-metric cells (cause not established) |
| APP-6 | no | sleeper-dashboard-data/.claude/tasks/app-repo-backlog.md | V2.8 computeTeamContext carryShare differs from a current-team reference for 2 RBs in 2020 (cause not established) |
| APP-7 | no | sleeper-dashboard-data/.claude/tasks/app-repo-backlog.md | V2.9 efficiency inputs differ from gamelogs ratios: 72 comparisons across 36 player-seasons (cause not established) |

## Session notes (hand-written, not computed)

- **V2.4** — Verdict is the mechanical 2% rule. With 32 teams, any single team out of tolerance is 3.1% of a season-metric cell, so 7 cells exceed 2%: 2021 rec (1), 2021 recTgt (1), 2022 rushAtt (1), 2022 rec (1), 2025 rushAtt (2), 2025 rec (3), 2025 recTgt (2). That is 11 team-metric cells in all, each with the app total above the rebuild. Cause not established; see backlog entry APP-5.
- **V2.8** — Verdict is the mechanical 2% rule: carryShare 2020, 2 of 26 RBs (Δ -0.021 and -0.016). Cause not established; see backlog entry APP-6.
- **V2.9** — Verdict is the mechanical 2% rule: ypt 2020 and 2021 and catchRate 2021 exceed 2%. Cause not established; see backlog entry APP-7.
- **V2.12** — Verdict is the mechanical 2% rule. The `DEV` → `'D'` pattern is measured per season in the V2.12 diagnostics table; 2020 does not show it. See D-76.

## Unclassified

- V2.5 / V2.7 (current-team attribution): V2.5 566 of 576 team-metric cells differ > 1%; V2.7 399 of 665 team-matched share rows out, 181 of them > 0.05. This is G2 (a season grouped under today's team), measured in the G2 section and by `V2.8-g2effect`. Report-only, no entry.
- V2.8 `teamOffense` (current-team denominators) differs from the true-season-team rebuild by > 1% for 377 of 384 team-seasons. Same G2 cause, report-only; the toleranced V2.8 series compares shares against the current-team reference instead.
- V2.10: 9 of 192 team-seasons have the rush-side red-zone ratio outside [0.85, 1.15] (2020 3, 2021 2, 2022 1, 2023 3); the receiving ratio ranges 0.59–0.91 and never exceeds 1.0; no player-season fails the plausibility checks. Consistency only (G7), so no entry.
- KTC team spellings: KTC uses KCC, SFO, NEP, NOS, TBB, GBP (not only the plan's LVR/JAC), so `ktcMatch.js`'s name|team fallback, which compares the raw KTC team with Sleeper's team, cannot match a player whose position key misses. The harness aliases them (deviation), so the only `ktc-team-disagree` rows left are real team changes. No top-400 player is affected today.
- V1: every compared row matches (6,072 of 6,072, all `exact` method), so the key-attribution path (`stale-capture` etc.) found nothing to attribute. 2,545 `app-missing-zero` rows are rostered non-players; 120 `app-no-row` rows all have 0 Sleeper points. Week 6 of 2026 is not scored (the week in progress).
- V2.6: 0 of 2,233 share rows out when the arithmetic is tested on ex-traded denominators on both sides. The size of the traded-player (G3) effect on teammates is the report-only `V2.6-g3effect` series.

## Not covered

- Per-player red zone: needs play-by-play (G7).
- Snap share: already validated (r = 0.9995 vs PFR, data-catalog.md snaps row).
- The `inSeasonScoring.js` live path’s inputs (CR-21): it calls the same `calculateFantasyPoints`; V1 covers the function only.
- Seasons before 2020.
