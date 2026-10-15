# Weekly-basis grade — 2026-10-15 (weekly-scoring-keys, D-47)

## Pre-registered decision (written before the results were read)
`wire` iff ALL hold:
- (a) |A−T| ≤ 0.011 on ≥ 99.9% of weeks, and A's p99 ≤ 0.05;
- (b) B's median relative error (weeks with T ≥ 5) ≥ 1%, so there is something to fix;
- (c) coverage (rows given `weeklyStats` ÷ played rows) ≥ 99.5% in every season;
- (d) the season-sum check passes on ≥ 99.5% of covered rows;
- (e) the added gzip size is ≤ 400 KB in every season.
Otherwise `do-not-wire`, naming the failed criterion. If (a) fails, the top keys by contributed |A−T| are
listed (an excluded key a league scores is the expected cause) and the run stops — the exclusion list is
NOT edited inside this run.

## Honest framing
T is scored from the same Sleeper API as A: the grade tests the exclusion list and the aggregation, not independent truth. League basis: `snapshots/2026-10-14.json` scoringSettings.

## Verdict: **wire**

| criterion | rule | value | pass |
|---|---|---|---|
| (a) | ≥99.9% within 0.011 and p99 ≤ 0.05 | {"shareWithinTol":1,"absP99":0} | yes |
| (b) | B median relative error ≥ 1% | {"relMedianB":0.04313725490196079} | yes |
| (c) | coverage ≥ 99.5% every season | {"minCoverage":1,"atSeason":"2012"} | yes |
| (d) | season-sum check ≥ 99.5% of covered rows | {"share":1} | yes |
| (e) | added gzip ≤ 400 KB every season | {"maxGzAddedBytes":222937,"atSeason":"2025"} | yes |

Weeks graded: 327599 (B undefined for 6988 weeks — ratio null, excluded from B stats).

## Error vs truth T
| | n | abs median | abs p90 | abs p99 | abs max | rel median (T≥5) | rel p90 (T≥5) | within 0.011 |
|---|---|---|---|---|---|---|---|---|
| B | 320611 | 0.0000 | 0.5900 | 3.3700 | 702.9000 | 4.31% | 16.63% | 74.92% |
| A | 327599 | 0.0000 | 0.0000 | 0.0000 | 0.0000 | 0.00% | 0.00% | 100.00% |

## By position
| pos | B rel med | B rel p90 | A rel med | A rel p90 | A within 0.011 | n |
|---|---|---|---|---|---|---|
| QB | 3.21% | 10.28% | 0.00% | 0.00% | 100.00% | 8909 |
| RB | 4.28% | 16.73% | 0.00% | 0.00% | 100.00% | 22391 |
| WR | 3.77% | 16.53% | 0.00% | 0.00% | 100.00% | 35294 |
| TE | 7.00% | 16.04% | 0.00% | 0.00% | 100.00% | 21563 |
| K | 10.67% | 32.38% | 0.00% | 0.00% | 100.00% | 7138 |
| DEF | 3.62% | 10.25% | 0.00% | 0.00% | 100.00% | 7106 |
| other | 3.08% | 100.00% | 0.00% | 0.00% | 100.00% | 225198 |

## By season
| season | B rel med | B rel p90 | A within 0.011 | A abs p99 | coverage | omitted (missing/weeks/points/sums) | +raw | +gz |
|---|---|---|---|---|---|---|---|---|
| 2012 | 4.52% | 16.50% | 100.00% | 0.0000 | 100.00% (1214/1214) | 0/0/0/0 | 883 KB | 139 KB |
| 2013 | 4.51% | 17.25% | 100.00% | 0.0000 | 100.00% (1509/1509) | 0/0/0/0 | 1022 KB | 161 KB |
| 2014 | 4.53% | 17.92% | 100.00% | 0.0000 | 100.00% (1828/1828) | 0/0/0/0 | 1114 KB | 174 KB |
| 2015 | 4.58% | 17.80% | 100.00% | 0.0000 | 100.00% (2002/2002) | 0/0/0/0 | 1143 KB | 180 KB |
| 2016 | 4.28% | 15.43% | 100.00% | 0.0000 | 100.00% (2024/2024) | 0/0/0/0 | 1116 KB | 176 KB |
| 2017 | 4.53% | 17.70% | 100.00% | 0.0000 | 100.00% (2041/2041) | 0/0/0/0 | 1114 KB | 175 KB |
| 2018 | 4.42% | 15.74% | 100.00% | 0.0000 | 100.00% (2053/2053) | 0/0/0/0 | 1120 KB | 176 KB |
| 2019 | 4.50% | 16.49% | 100.00% | 0.0000 | 100.00% (2059/2059) | 0/0/0/0 | 1127 KB | 176 KB |
| 2020 | 4.53% | 15.90% | 100.00% | 0.0000 | 100.00% (2225/2225) | 0/0/0/0 | 1128 KB | 177 KB |
| 2021 | 4.50% | 17.33% | 100.00% | 0.0000 | 100.00% (2352/2352) | 0/0/0/0 | 1199 KB | 186 KB |
| 2022 | 4.40% | 18.88% | 100.00% | 0.0000 | 100.00% (2229/2229) | 0/0/0/0 | 1363 KB | 215 KB |
| 2023 | 4.05% | 16.56% | 100.00% | 0.0000 | 100.00% (2174/2174) | 0/0/0/0 | 1383 KB | 215 KB |
| 2024 | 3.37% | 12.73% | 100.00% | 0.0000 | 100.00% (2221/2221) | 0/0/0/0 | 1399 KB | 216 KB |
| 2025 | 3.73% | 18.46% | 100.00% | 0.0000 | 100.00% (2220/2220) | 0/0/0/0 | 1406 KB | 218 KB |

Season-sum check: 28151/28151 covered rows (100.00%).
Report-only SD gap |SD_A − SD_B| (≥ 8 games, n=20712): median 0.0000, p90 0.3154.
