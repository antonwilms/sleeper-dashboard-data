# Join defects (ID crosswalk) — impact verdict (2026-10-25)

- **capturedAt (before / after):** 2026-10-25T15:35:54.031Z / 2026-10-25T15:38:47.953Z

## Noise floor (before vs before2)

Empty on every compared field (743 rows compared, no one-sided rows).

## Rows moved (before vs after)

Rows compared: 743; only in before: 0; only in after: 0.

| field | rows moved | rookie | veteran |
|---|---|---|---|
| projectedGames | 1 | 1 | 0 |
| projectedPPG | 31 | 31 | 0 |
| projectedTotalPts | 46 | 46 | 0 |
| injurySeasons | 0 | 0 | 0 |
| absenceShapeFactor | 0 | 0 | 0 |
| isBounceBack | 0 | 0 | 0 |
| dynastyScore | 30 | 25 | 5 |
| dynastyLabel | 4 | 3 | 1 |
| nflDraftMatchSource | 1 | 1 | 0 |

## Distribution of each move

### projectedGames

| move | rows |
|---|---|
| +1 | 1 |

### projectedPPG

| move | rows |
|---|---|
| +0.1 | 8 |
| -0.1 | 6 |
| +0.5 | 3 |
| +0.2 | 2 |
| +1.7 | 2 |
| +0.6 | 1 |
| +0.7 | 1 |
| +1.1 | 1 |
| +1.2 | 1 |
| +1.3 | 1 |
| +1.6 | 1 |
| +1.9 | 1 |
| +2 | 1 |
| +3.3 | 1 |
| -0.8 | 1 |

### projectedTotalPts

| move | rows |
|---|---|
| +0.1 | 4 |
| +0.2 | 4 |
| +0.5 | 4 |
| -0.4 | 4 |
| +0.4 | 3 |
| -0.2 | 3 |
| -0.1 | 2 |
| +0.3 | 1 |
| +0.6 | 1 |
| +0.7 | 1 |
| +0.8 | 1 |
| +0.9 | 1 |
| +1.6 | 1 |
| +1.7 | 1 |
| +1.9 | 1 |
| +12.2 | 1 |
| +12.5 | 1 |
| +2.7 | 1 |
| +2.8 | 1 |
| +24.5 | 1 |
| +3 | 1 |
| +3.3 | 1 |
| +3.5 | 1 |
| +36.5 | 1 |
| +4 | 1 |
| +5.3 | 1 |
| +8.5 | 1 |
| -0.3 | 1 |
| -3.4 | 1 |

### injurySeasons

_no moves_

### absenceShapeFactor

_no moves_

### isBounceBack

_no moves_

### dynastyScore

| move | rows |
|---|---|
| +1 | 17 |
| -1 | 10 |
| +31 | 1 |
| +5 | 1 |
| -10 | 1 |

### dynastyLabel

| move | rows |
|---|---|
| High Prospect → Prospect | 1 |
| Limited Data → Unranked Prospect | 1 |
| Prospect → Unranked Prospect | 1 |
| Sell Now → Plateau | 1 |

### nflDraftMatchSource

| move | rows |
|---|---|
| unmatched → matched | 1 |

## Label transitions

| move | rows |
|---|---|
| High Prospect → Prospect | 1 |
| Limited Data → Unranked Prospect | 1 |
| Prospect → Unranked Prospect | 1 |
| Sell Now → Plateau | 1 |

## 20 largest movers by |Δ dynasty score|

| # | player | pos | path | team | dynastyScore before → after | Δ | injurySeasons before → after |
|---|---|---|---|---|---|---|---|
| 1 | Frank Gore Jr. | RB | rookie | BUF | 15 → 46 | +31 | — (unchanged) |
| 2 | Kyle Williams | WR | rookie | NE | 78 → 68 | -10 | — (unchanged) |
| 3 | Bam Knight | RB | veteran | ARI | 37 → 42 | +5 | 0 (unchanged) |
| 4 | Ja'Tavion Sanders | TE | veteran | CAR | 54 → 53 | -1 | 0 (unchanged) |
| 5 | Marvin Harrison Jr. | WR | veteran | HOU | 66 → 67 | +1 | 0 (unchanged) |
| 6 | Kendall Milton | RB | rookie | CIN | 47 → 48 | +1 | — (unchanged) |
| 7 | Mason Tipton | WR | veteran | NO | 35 → 34 | -1 | 0 (unchanged) |
| 8 | Dylan Sampson | RB | rookie | CLE | 66 → 67 | +1 | — (unchanged) |
| 9 | Mitchell Evans | TE | rookie | CAR | 35 → 34 | -1 | — (unchanged) |
| 10 | Jayden Higgins | WR | rookie | HOU | 83 → 82 | -1 | — (unchanged) |
| 11 | Pat Bryant | WR | rookie | DEN | 78 → 77 | -1 | — (unchanged) |
| 12 | Oronde Gadsden II | TE | rookie | LAC | 72 → 73 | +1 | — (unchanged) |
| 13 | Tre Harris | WR | rookie | LAC | 73 → 72 | -1 | — (unchanged) |
| 14 | Quinshon Judkins | RB | rookie | CLE | 91 → 92 | +1 | — (unchanged) |
| 15 | Jimmy Horn Jr. | WR | rookie | CLE | 31 → 32 | +1 | — (unchanged) |
| 16 | TreVeyon Henderson | RB | rookie | NE | 84 → 85 | +1 | — (unchanged) |
| 17 | Jacory Croskey-Merritt | RB | rookie | WAS | 78 → 79 | +1 | — (unchanged) |
| 18 | Tahj Brooks | RB | rookie | CIN | 26 → 27 | +1 | — (unchanged) |
| 19 | Jadarian Price | RB | rookie | SEA | 89 → 90 | +1 | — (unchanged) |
| 20 | 13324 | ? | rookie | BAL | 40 → 41 | +1 | — (unchanged) |

## 20 largest movers by |Δ projectedTotalPts|

| # | player | pos | path | team | projectedTotalPts before → after | Δ | injurySeasons before → after |
|---|---|---|---|---|---|---|---|
| 1 | Cam Ward | QB | rookie | TEN | 212.1 → 248.6 | +36.5 | — (unchanged) |
| 2 | KC Concepcion | WR | rookie | CLE | 129.8 → 154.3 | +24.5 | — (unchanged) |
| 3 | Mike Washington Jr. | RB | rookie | LV | 50.2 → 62.7 | +12.5 | — (unchanged) |
| 4 | Pat Bryant | WR | rookie | DEN | 50.4 → 62.6 | +12.2 | — (unchanged) |
| 5 | Robbie Ouzts | RB | rookie | SEA | 7.7 → 16.2 | +8.5 | — (unchanged) |
| 6 | Cam Skattebo | RB | rookie | NYG | 21.4 → 26.7 | +5.3 | — (unchanged) |
| 7 | Woody Marks | RB | rookie | HOU | 17.5 → 21.5 | +4 | — (unchanged) |
| 8 | Jacory Croskey-Merritt | RB | rookie | WAS | 13.6 → 17.1 | +3.5 | — (unchanged) |
| 9 | Frank Gore Jr. | RB | rookie | BUF | 14 → 10.6 | -3.4 | — (unchanged) |
| 10 | Reggie Virgil | WR | rookie | ARI | 20.5 → 23.8 | +3.3 | — (unchanged) |
| 11 | Josh Williams | RB | rookie | TB | 5.5 → 8.5 | +3 | — (unchanged) |
| 12 | Skylar Thompson | QB | rookie | BAL | 11.4 → 14.2 | +2.8 | — (unchanged) |
| 13 | KeAndre Lambert-Smith | WR | rookie | LAC | 11.1 → 13.8 | +2.7 | — (unchanged) |
| 14 | Tay Martin | WR | rookie | DET | 7.6 → 9.5 | +1.9 | — (unchanged) |
| 15 | Bub Means | WR | rookie | CLE | 10.8 → 12.5 | +1.7 | — (unchanged) |
| 16 | Nate Carter | RB | rookie | KC | 7.9 → 9.5 | +1.6 | — (unchanged) |
| 17 | Jaydn Ott | RB | rookie | KC | 10.5 → 11.4 | +0.9 | — (unchanged) |
| 18 | Jadarian Price | RB | rookie | SEA | 175.3 → 176.1 | +0.8 | — (unchanged) |
| 19 | Kyle Williams | WR | rookie | NE | 58.1 → 58.8 | +0.7 | — (unchanged) |
| 20 | Omarion Hampton | RB | rookie | LAC | 220.4 → 221 | +0.6 | — (unchanged) |

## 20 largest movers by |Δ projectedPPG|

| # | player | pos | path | team | projectedPPG before → after | Δ | injurySeasons before → after |
|---|---|---|---|---|---|---|---|
| 1 | Cam Ward | QB | rookie | TEN | 19.3 → 22.6 | +3.3 | — (unchanged) |
| 2 | Robbie Ouzts | RB | rookie | SEA | 3.1 → 5.1 | +2 | — (unchanged) |
| 3 | KC Concepcion | WR | rookie | CLE | 10 → 11.9 | +1.9 | — (unchanged) |
| 4 | Cam Skattebo | RB | rookie | NYG | 6.7 → 8.4 | +1.7 | — (unchanged) |
| 5 | Pat Bryant | WR | rookie | DEN | 7.2 → 8.9 | +1.7 | — (unchanged) |
| 6 | Mike Washington Jr. | RB | rookie | LV | 6.3 → 7.9 | +1.6 | — (unchanged) |
| 7 | Woody Marks | RB | rookie | HOU | 5.5 → 6.8 | +1.3 | — (unchanged) |
| 8 | Josh Williams | RB | rookie | TB | 2.2 → 3.4 | +1.2 | — (unchanged) |
| 9 | Jacory Croskey-Merritt | RB | rookie | WAS | 4.3 → 5.4 | +1.1 | — (unchanged) |
| 10 | Frank Gore Jr. | RB | rookie | BUF | 3.3 → 2.5 | -0.8 | — (unchanged) |
| 11 | KeAndre Lambert-Smith | WR | rookie | LAC | 2.8 → 3.5 | +0.7 | — (unchanged) |
| 12 | Nate Carter | RB | rookie | KC | 3.2 → 3.8 | +0.6 | — (unchanged) |
| 13 | Bub Means | WR | rookie | CLE | 3.4 → 3.9 | +0.5 | — (unchanged) |
| 14 | Reggie Virgil | WR | rookie | ARI | 3.2 → 3.7 | +0.5 | — (unchanged) |
| 15 | Tay Martin | WR | rookie | DET | 2.3 → 2.8 | +0.5 | — (unchanged) |
| 16 | Jaydn Ott | RB | rookie | KC | 3.2 → 3.4 | +0.2 | — (unchanged) |
| 17 | J. Michael Sturdivant | WR | rookie | GB | 2.3 → 2.5 | +0.2 | — (unchanged) |
| 18 | Dylan Sampson | RB | rookie | CLE | 8.9 → 9 | +0.1 | — (unchanged) |
| 19 | Jayden Higgins | WR | rookie | HOU | 10.5 → 10.4 | -0.1 | — (unchanged) |
| 20 | Omarion Hampton | RB | rookie | LAC | 15.7 → 15.8 | +0.1 | — (unchanged) |

## Rows whose `nflDraftMatchSource` changed

| id | player | pos | path | before → after |
|---|---|---|---|---|
| 12656 | Robbie Ouzts | RB | rookie | unmatched → matched |

## Join changes

# Join-fix diff — top-400 KTC rows, before vs after

- before: app `309e9a0f590e5cf70663444808f9326abe724dc3`; after: app `0d8938b0ad02fc37d806f1fb2b8046474512c88a`
- KTC file: ktc/snapshot-2026-10-19.json; players map fetched 2026-10-25T15:14:52.551Z; crosswalk generatedAt 2026-10-21T18:07:53.362Z
- rows compared: 400; rows with no join change: 369

## KTC → Sleeper id

gained 5 · lost 0 · changed 1

### KTC → Sleeper id — Gained

| rank | player | pos | team | before | → after |
|---|---|---|---|---|---|
| 99 | D.J. Moore | WR | BUF | — | 4983 |
| 201 | Kenneth Gainwell | RB | TBB | — | 7567 |
| 211 | Travis Hunter | WR | JAC | — | 12530 |
| 223 | Chigoziem Okonkwo | TE | WAS | — | 8210 |
| 297 | Matthew Hibner | TE | BAL | — | 13324 |

### KTC → Sleeper id — Lost

_none_

### KTC → Sleeper id — Changed

| rank | player | pos | team | before | → after |
|---|---|---|---|---|---|
| 222 | Kyle Williams | WR | NEP | 638 | 12547 |

## NFL draft entry

gained 7 · lost 0 · changed 0

### NFL draft entry — Gained

| rank | player | pos | team | before | → after |
|---|---|---|---|---|---|
| 99 | D.J. Moore | WR | BUF | — | 2018 R1 #24 |
| 201 | Kenneth Gainwell | RB | TBB | — | 2021 R5 #150 |
| 211 | Travis Hunter | WR | JAC | — | 2025 R1 #2 |
| 222 | Kyle Williams | WR | NEP | — | 2025 R3 #69 |
| 223 | Chigoziem Okonkwo | TE | WAS | — | 2022 R4 #143 |
| 295 | Joshua Palmer | WR | BUF | — | 2021 R3 #77 |
| 396 | Elijah Higgins | TE | ARI | — | 2023 R6 #197 |

### NFL draft entry — Lost

_none_

### NFL draft entry — Changed

_none_

## College seasons

gained 18 · lost 1 · changed 11

### College seasons — Gained

| rank | player | pos | team | before | → after |
|---|---|---|---|---|---|
| 46 | Bucky Irving | RB | TBB | — | 2021 Minnesota, 2022 Oregon, 2023 Oregon |
| 72 | KC Concepcion | WR | CLE | — | 2023 NC State, 2024 NC State, 2025 Texas A&M |
| 85 | Cam Skattebo | RB | NYG | — | 2022 Sacramento State, 2023 Arizona State, 2024 Arizona State |
| 99 | D.J. Moore | WR | BUF | — | 2017 Maryland |
| 112 | Cam Ward | QB | TEN | — | 2021 Incarnate Word, 2022 Washington State, 2023 Washington State, 2024 Miami |
| 129 | Woody Marks | RB | HOU | — | 2020 Mississippi State, 2021 Mississippi State, 2022 Mississippi State, 2023 Mississippi State, 2024 USC |
| 133 | Jacory Croskey-Merritt | RB | WAS | — | 2019 Alabama State, 2021 Alabama State, 2022 Alabama State, 2023 New Mexico |
| 134 | Mike Washington Jr. | RB | LVR | — | 2022 Buffalo, 2023 Buffalo, 2024 New Mexico State, 2025 Arkansas |
| 166 | Pat Bryant | WR | DEN | — | 2021 Illinois, 2022 Illinois, 2023 Illinois, 2024 Illinois |
| 201 | Kenneth Gainwell | RB | TBB | — | 2018 Memphis, 2019 Memphis |
| 208 | Tank Dell | WR | HOU | — | 2020 Houston, 2021 Houston, 2022 Houston |
| 211 | Travis Hunter | WR | JAC | — | 2022 Jackson State, 2023 Colorado, 2024 Colorado |
| 223 | Chigoziem Okonkwo | TE | WAS | — | 2018 Maryland, 2019 Maryland, 2021 Maryland |
| 295 | Joshua Palmer | WR | BUF | — | 2017 Tennessee, 2018 Tennessee, 2019 Tennessee, 2020 Tennessee |
| 297 | Matthew Hibner | TE | BAL | — | 2022 Michigan, 2024 SMU, 2025 SMU |
| 307 | Isiah Pacheco | RB | DET | — | 2018 Rutgers, 2019 Rutgers, 2020 Rutgers, 2021 Rutgers |
| 347 | Tutu Atwell | WR | LAR | — | 2018 Louisville, 2019 Louisville, 2020 Louisville |
| 364 | KeAndre Lambert-Smith | WR | LAC | — | 2020 Penn State, 2021 Penn State, 2022 Penn State, 2023 Penn State, 2024 Auburn |

### College seasons — Lost

| rank | player | pos | team | before | → after |
|---|---|---|---|---|---|
| 94 | Mike Evans | WR | SFO | 2020 App State, 2021 App State | — |

### College seasons — Changed

| rank | player | pos | team | before | → after |
|---|---|---|---|---|---|
| 9 | Kenneth Walker III | RB | KCC | 2021 Michigan State | 2019 Wake Forest, 2020 Wake Forest, 2021 Michigan State |
| 11 | Caleb Williams | QB | CHI | 2021 Oklahoma, 2022 USC, 2023 USC, 2025 Pittsburgh | 2021 Oklahoma, 2022 USC, 2023 USC |
| 71 | A.J. Brown | WR | NEP | 2017 Ole Miss, 2018 Ole Miss, 2022 Georgia Southern | 2017 Ole Miss, 2018 Ole Miss |
| 118 | Daniel Jones | QB | IND | 2017 Duke, 2018 Duke, 2021 Navy | 2017 Duke, 2018 Duke |
| 122 | Brian Thomas Jr. | WR | JAC | 2021 LSU, 2022 LSU, 2023 LSU, 2024 Valparaiso, 2025 New Haven | 2021 LSU, 2022 LSU, 2023 LSU |
| 222 | Kyle Williams | WR | NEP | 2017 Arizona State, 2018 Arizona State, 2019 Arizona State, 2024 Morgan State | 2020 UNLV, 2021 UNLV, 2022 UNLV, 2023 Washington State, 2024 Washington State |
| 274 | Ray Davis | RB | BUF | 2022 Vanderbilt | 2019 Temple, 2020 Temple, 2021 Vanderbilt, 2022 Vanderbilt, 2023 Kentucky |
| 275 | Isaiah Davis | RB | NYJ | 2021 UTSA, 2022 UTSA, 2023 South Dakota State, 2025 Stephen F. Austin | 2022 South Dakota State, 2023 South Dakota State |
| 296 | Justice Hill | RB | BAL | 2017 Oklahoma State, 2018 Oklahoma State, 2024 Murray State | 2017 Oklahoma State, 2018 Oklahoma State |
| 328 | Chris Brooks | RB | GBP | 2024 Wisconsin, 2025 Wisconsin | 2022 BYU |
| 399 | Elijah Moore | WR | PHI | 2018 Ole Miss, 2019 Ole Miss, 2020 Ole Miss, 2024 Florida State, 2025 Florida State | 2018 Ole Miss, 2019 Ole Miss, 2020 Ole Miss |

previously-matched joins changed: 12

- Kenneth Walker III
- Caleb Williams
- A.J. Brown
- Mike Evans
- Daniel Jones
- Brian Thomas Jr.
- Kyle Williams
- Ray Davis
- Isaiah Davis
- Justice Hill
- Chris Brooks
- Elijah Moore

## Verdicts on the pass conditions (Session 2, join-defects-id-crosswalk §8.1)

Inputs differ from the 2026-10-18 report: this run used `ktc/snapshot-2026-10-19.json` (the prototype used `-10-12`), a players map fetched 2026-10-25, crosswalk `generatedAt` 2026-10-21. The before dump is app `309e9a0` (commit 0: harness only, old matchers); the after dump is `0d8938b`.

**(a) Every row of the four backlog entries and of V3's ktc-unmatched / ktc-ambiguous / draft-missing / college-after-draft / college-disagree / college-name-collision tables:** resolved, except —
- *Explained, lower-division (D-78):* Christian Watson (NDSU), Dallas Goedert (SDSU), Emanuel Wilson (Fort Valley St), Dohnte Meyers (Delta St), Tyson Bagent (Shepherd), Kameron Johnson (Barton), Jack Strand (MSU Moorhead) — `college-none`, no CFBD row under any spelling.
- *Info, not a defect:* Kyle Williams (`exact-team`) and Matthew Hibner (`alias-team`) now carry `ktc-team-fallback`.
- Not in the top 400 of this KTC file, checked on the full inputs: Gabriel Davis → 6943, Bam Knight → 8122 (KTC); Robbie Ouzts 12656 (2025 #175), Tommy Mellott 12690 (2025 #213), N'Keal Harry, Hakeem Butler, Alizé Mack (draft); Greg Little 835 and James Williams 6169 lose their other-person pick; Ronald Jones 4955 → 5052. Totals: KTC matched 464, drafts 806, college players 2118 — the §3 numbers.

**(b) "previously-matched joins changed: 12".** Eleven are named in §3: Kenneth Walker III, Caleb Williams, A.J. Brown, Mike Evans, Daniel Jones, Brian Thomas Jr., Kyle Williams, Ray Davis, Isaiah Davis, Justice Hill, Chris Brooks. **One is not named: Elijah Moore (rank 399, WR PHI)** — his 2024–2025 Florida State seasons (another Elijah Moore) are dropped; his crosswalk draft year is 2021 (Ole Miss), so the seasons are after the draft, the exact §3 category "at/after the crosswalk draft year (another person)". He is absent from the prototype's list only because he ranked 401 in `snapshot-2026-10-12` and 399 in `-10-19`. Judged an input-drift case, not a join regression; flagged in the hand-back for Session 1.

**(c) college-none = 7, every one lower-division.** ✔

**Residual after the §6 diagnosis change: 1 `college-disagree`** — Bo Nix (rank 78): his Auburn 2019–21 seasons come by name (the CFBD id changed on transfer; Oregon 2022–23 come by id), and the rule "consider only `matchedBy === 'name'` seasons" compares them with his Sleeper/crosswalk college (Oregon). The seasons are correct; §3 predicted 0. Left as specified; flagged in the hand-back.
