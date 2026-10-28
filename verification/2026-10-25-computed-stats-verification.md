# Computed-stats verification — 2026-10-25

| field | value |
|---|---|
| harness (app repo) | `6b6120b025743548a9fa2af9c9f01cdffff1394e` — local — unpushed at report time |
| data repo HEAD | `42f983799139e3f06781f13a805ee0b44b04c248` (clean) |
| snapshot | snapshots/2026-10-24.json (capturedAt 2026-10-24T18:55:43.362Z) |
| KTC file | ktc/snapshot-2026-10-19.json |
| playersMap fetched | 2026-10-25T15:14:52.551Z |
| CR ids read | CR-01, CR-02, CR-06, CR-08, CR-09, CR-10, CR-17, CR-28 |
| command | `node_modules/.bin/vite-node scripts/verify/computed-stats.mjs -- --data ../sleeper-dashboard-data --out ../sleeper-dashboard-data/verification --only v3 --date 2026-10-25 --no-fetch` |

## Summary

| check | description | compared | out of tolerance | rate | verdict |
|---|---|---|---|---|---|
| V1 | Fantasy points vs Sleeper matchups | — | — | — | not run |
| V2.1 | Season counts (att, tgt, rec, cmp, int) vs gamelogs | — | — | — | not run |
| V2.2 | Season yards vs gamelogs | — | — | — | not run |
| V2.3 | Season TDs vs gamelogs | — | — | — | not run |
| V2.4 | Team totals (per-season-team, ex-traded) vs rebuild | — | — | — | not run |
| V2.5 | Team totals (current-team) vs rebuild — report only | — | — | — | not run |
| V2.6 | Historical shares (per-season-team) vs rebuild | — | — | — | not run |
| V2.7 | Historical shares (current-team, team-matched rows) — report only | — | — | — | not run |
| V2.8 | computeTeamContext carry / reception share vs rebuild | — | — | — | not run |
| V2.9 | Efficiency-metric inputs vs gamelogs ratios | — | — | — | not run |
| V2.10 | Red-zone consistency and plausibility | — | — | — | not run |
| V2.11 | gamesPlayed vs snaps games | — | — | — | not run |
| V2.12 | dnpWeeks vs rosterweekly eligibility − snaps games | — | — | — | not run |
| V3 KTC | V3 KTC joins (top 400 KTC) | 400 | 0 | 0.00% | pass |
| V3 draft | V3 draft joins (top 400 KTC) | 400 | 0 | 0.00% | pass |
| V3 college | V3 college joins (top 400 KTC) | 400 | 7 | 1.75% | defect |

## V1

`not run`

## V2

`not run`

## V3 — joins, top KTC players

Matcher outputs on full inputs: KTC 464/500 rows resolved; 806 draft matches; 2118 college-matched players. Top 400 inspected.

| reason code | rows |
|---|---|
| college-none | 7 |
| draft-out-of-window | 23 |
| ktc-team-disagree | 2 |
| ktc-team-fallback | 2 |

### college-none (7)

| rank | name | pos | team | value | sid | evidence |
|---|---|---|---|---|---|---|
| 36 | Christian Watson | WR | GBP | 5697 | 8167 | `{"cfbdNameFound":{}}` |
| 168 | Dallas Goedert | TE | PHI | 2702 | 5022 | `{"cfbdNameFound":{}}` |
| 183 | Emanuel Wilson | RB | SEA | 2534 | 11435 | `{"cfbdNameFound":{}}` |
| 262 | Dohnte Meyers | WR | CIN | 1868 | 13264 | `{"cfbdNameFound":{}}` |
| 282 | Tyson Bagent | QB | CHI | 1764 | 11256 | `{"cfbdNameFound":{}}` |
| 360 | Jack Strand | QB | ATL | 1212 | 13602 | `{"cfbdNameFound":{}}` |
| 367 | Kameron Johnson | WR | TBB | 1159 | 11994 | `{"cfbdNameFound":{}}` |

### draft-out-of-window (23)

| rank | name | pos | team | value | sid | evidence |
|---|---|---|---|---|---|---|
| 54 | Dak Prescott | QB | DAL | 5204 | 3294 | `{}` |
| 57 | Derrick Henry | RB | BAL | 5146 | 3198 | `{}` |
| 61 | Jared Goff | QB | DET | 5033 | 3163 | `{}` |
| 89 | Davante Adams | WR | LAR | 3987 | 2133 | `{}` |
| 94 | Mike Evans | WR | SFO | 3772 | 2216 | `{}` |
| 96 | Matthew Stafford | QB | LAR | 3671 | 421 | `{}` |
| 149 | Travis Kelce | TE | KCC | 2811 | 1466 | `{}` |
| 173 | Kirk Cousins | QB | LVR | 2680 | 1166 | `{}` |
| 175 | Stefon Diggs | WR | WAS | 2663 | 2449 | `{}` |
| 179 | Jacoby Brissett | QB | ARI | 2611 | 3257 | `{}` |
| 193 | Geno Smith | QB | NYJ | 2455 | 1373 | `{}` |
| 206 | Hunter Henry | TE | NEP | 2327 | 3214 | `{}` |
| 219 | Aaron Rodgers | QB | PIT | 2179 | 96 | `{}` |
| 232 | Jameis Winston | QB | NYG | 2100 | 2306 | `{}` |
| 250 | Tyler Higbee | TE | LAR | 1923 | 3271 | `{}` |
| 259 | Darren Waller | TE | CAR | 1888 | 2505 | `{}` |
| 264 | Kalif Raymond | WR | CHI | 1858 | 3634 | `{}` |
| 281 | Marcus Mariota | QB | WAS | 1764 | 2307 | `{}` |
| 288 | Keenan Allen | WR | IND | 1700 | 1479 | `{}` |
| 315 | Tyreek Hill | WR | FA | 1462 | 3321 | `{}` |
| 346 | Carson Wentz | QB | MIN | 1261 | 3161 | `{}` |
| 372 | Demarcus Robinson | WR | SFO | 1132 | 3286 | `{}` |
| 397 | Zach Ertz | TE | PHI | 1014 | 1339 | `{}` |

### ktc-team-disagree (2)

| rank | name | pos | team | value | sid | evidence |
|---|---|---|---|---|---|---|
| 306 | Najee Harris | RB | NYG | 1534 | 7528 | `{"teams":{"ktc":"NYG","sleeper":null}}` |
| 374 | Trey Palmer | WR | NOS | 1127 | 9492 | `{"teams":{"ktc":"NOS","sleeper":null}}` |

### ktc-team-fallback (2)

| rank | name | pos | team | value | sid | evidence |
|---|---|---|---|---|---|---|
| 222 | Kyle Williams | WR | NEP | 2160 | 12547 | `{"path":"exact-team","positions":{"ktc":"WR","sleeper":"WR"}}` |
| 297 | Matthew Hibner | TE | BAL | 1611 | 13324 | `{"path":"alias-team","positions":{"ktc":"TE","sleeper":"TE"}}` |

### College rushing-only RBs (matcher Pass 1 is receiving-driven): 0

### Top rows without a crosswalk entry: 3

## Known definitional gaps

### G1

computeTeamContext `targetShare` is reception share (receptions ÷ team receptions, teamContext.js:213)

_not measured in this run_

### G2

Current-team attribution (App.jsx:246, :295, :300) groups a season under the player’s present team

_not measured in this run_

### G3

One team per player-season for traded players

_not measured in this run_

### G4

App team totals count only rows with gamesPlayed ≥ 1; current-team mode drops players absent from playersMap

_not measured in this run_

### G5

Gamelogs drop unmapped players, so reference team totals run low

_not measured in this run_

### G6

Sleeper vs nflverse stat definitions (kneels, laterals, sack attribution)

_not measured in this run_

### G7

No independent per-player red-zone source is served; V2.10 is consistency-only

_not measured in this run_

### G8

History rescored under today’s league settings (V1 as-run gap)

_not measured in this run_

### G9

Stat corrections after the season-totals capture (V1 `stale-capture`)

_not measured in this run_

### G10

First-down derivation uses the current position (`rescoreSeasonTotals`); no effect for 2022+

_not measured in this run_

## Confirmed defects

None.

## Session notes (hand-written, not computed)

None.

## Unclassified

None.

## Not covered

- Per-player red zone: needs play-by-play (G7).
- Snap share: already validated (r = 0.9995 vs PFR, data-catalog.md snaps row).
- The `inSeasonScoring.js` live path’s inputs (CR-21): it calls the same `calculateFantasyPoints`; V1 covers the function only.
- Seasons before 2020.
