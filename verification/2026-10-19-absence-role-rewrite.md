# D-76 absence-role — field-level diff report

Mode `write` · generated 2026-10-19T19:41:30.129Z.

## Per season

| season | demoted slots | skill | changed rows | skill rows | by status | segment-shape changes |
|---|---|---|---|---|---|---|
| 2016 | 0 | 0 | 0 | 0 | {} | 0 |
| 2017 | 1 | 0 | 1 | 0 | {"DEV":1} | 0 |
| 2018 | 3 | 1 | 3 | 1 | {"DEV":3} | 0 |
| 2019 | 0 | 0 | 0 | 0 | {} | 0 |
| 2020 | 10 | 1 | 10 | 1 | {"DEV":2,"TRC":6,"TRD":2} | 2 |
| 2021 | 5474 | 2598 | 633 | 273 | {"CUT":18,"DEV":5450,"E14":5,"TRC":1} | 196 |
| 2022 | 5595 | 2516 | 632 | 266 | {"CUT":17,"DEV":5575,"TRC":2,"TRD":1} | 165 |
| 2023 | 5509 | 2513 | 589 | 264 | {"CUT":6,"DEV":5471,"E01":2,"EXE":29,"TRC":1} | 116 |
| 2024 | 5543 | 2706 | 610 | 272 | {"CUT":19,"DEV":5511,"EXE":13} | 150 |
| 2025 | 4624 | 2344 | 537 | 248 | {"CUT":20,"DEV":4599,"EXE":5} | 144 |
| **total** | **26759** | **12679** | **3015** | **1325** | {"CUT":80,"DEV":26612,"E01":2,"E14":5,"EXE":47,"TRC":10,"TRD":3} | 773 |

## Files

| season | rows | before bytes | after bytes | before sha256 | after sha256 |
|---|---|---|---|---|---|
| 2016 | 2135→2135 | 2730744 | 2730744 | `190d8b73eeb2` | `190d8b73eeb2` |
| 2017 | 2153→2153 | 2736484 | 2736484 | `74fc1457523d` | `07d007cb7d06` |
| 2018 | 2171→2171 | 2757185 | 2757185 | `262cc31a4835` | `1a2e7928e901` |
| 2019 | 2178→2178 | 2767416 | 2767416 | `132a604a36e4` | `132a604a36e4` |
| 2020 | 2350→2350 | 2903020 | 2902960 | `0e352140e4e3` | `7eb47c490496` |
| 2021 | 2846→2846 | 3222169 | 3213434 | `15b5894b736c` | `b9bd4b307f2f` |
| 2022 | 2786→2786 | 3504146 | 3496941 | `fafad27ab7c3` | `e4f240a36de4` |
| 2023 | 2777→2777 | 3506540 | 3501218 | `c3c8b64e8ffa` | `912cabf4c1c4` |
| 2024 | 2816→2816 | 3553050 | 3546268 | `662f042805eb` | `860b1b879378` |
| 2025 | 2832→2832 | 3561786 | 3555978 | `43814751f653` | `8f27a999f927` |

## Leaf changes

| season | by top-level field | availability subfield |
|---|---|---|
| 2016 | {} | {} |
| 2017 | {"dnpWeeks":1,"weeklyStatus":1} | {} |
| 2018 | {"dnpWeeks":3,"weeklyStatus":3} | {} |
| 2019 | {} | {} |
| 2020 | {"dnpWeeks":10,"weeklyStatus":10,"availability":6} | {"longestAbsence":2,"absenceSegments":2,"returnedFromAbsence":2} |
| 2021 | {"dnpWeeks":633,"weeklyStatus":5474,"availability":691} | {"longestAbsence":168,"absenceSegments":397,"returnedFromAbsence":126} |
| 2022 | {"dnpWeeks":632,"weeklyStatus":5595,"availability":598} | {"longestAbsence":150,"absenceSegments":332,"returnedFromAbsence":116} |
| 2023 | {"dnpWeeks":589,"weeklyStatus":5509,"availability":424} | {"longestAbsence":105,"absenceSegments":241,"returnedFromAbsence":78} |
| 2024 | {"dnpWeeks":610,"weeklyStatus":5543,"availability":543} | {"longestAbsence":136,"absenceSegments":310,"returnedFromAbsence":97} |
| 2025 | {"dnpWeeks":537,"weeklyStatus":4624,"availability":499} | {"longestAbsence":128,"absenceSegments":279,"returnedFromAbsence":92} |

## `dnpWeeks` delta histogram (rows per delta)

- 2016: {}
- 2017: {"-1":1}
- 2018: {"-1":3}
- 2019: {}
- 2020: {"-1":10}
- 2021: {"-17":39,"-16":41,"-15":39,"-14":38,"-13":31,"-12":33,"-11":29,"-10":27,"-9":35,"-8":34,"-7":34,"-6":33,"-5":37,"-4":43,"-3":41,"-2":48,"-1":51}
- 2022: {"-17":59,"-16":48,"-15":32,"-14":28,"-13":26,"-12":32,"-11":39,"-10":28,"-9":31,"-8":24,"-7":32,"-6":35,"-5":30,"-4":45,"-3":53,"-2":37,"-1":53}
- 2023: {"-17":71,"-16":36,"-15":39,"-14":35,"-13":19,"-12":23,"-11":32,"-10":36,"-9":30,"-8":37,"-7":29,"-6":28,"-5":31,"-4":25,"-3":35,"-2":36,"-1":47}
- 2024: {"-17":55,"-16":41,"-15":42,"-14":33,"-13":28,"-12":32,"-11":28,"-10":32,"-9":26,"-8":37,"-7":33,"-6":32,"-5":33,"-4":33,"-3":31,"-2":47,"-1":47}
- 2025: {"-17":38,"-16":35,"-15":26,"-14":37,"-13":26,"-12":21,"-11":20,"-10":25,"-9":30,"-8":30,"-7":36,"-6":27,"-5":30,"-4":35,"-3":39,"-2":37,"-1":45}

## Residual `D` slots with no roster listing (all / skill)

| season | player has no rosterweekly entry | listed in other weeks only |
|---|---|---|
| 2016 | 947 / 6 | 0 / 0 |
| 2017 | 1013 / 4 | 0 / 0 |
| 2018 | 949 / 4 | 0 / 0 |
| 2019 | 1022 / 5 | 0 / 0 |
| 2020 | 808 / 1 | 0 / 0 |
| 2021 | 3882 / 322 | 48 / 25 |
| 2022 | 3941 / 448 | 53 / 36 |
| 2023 | 4001 / 401 | 23 / 21 |
| 2024 | 4364 / 450 | 19 / 6 |
| 2025 | 5350 / 698 | 6 / 2 |

## Largest skill-row `dnpWeeks` drops (top 20, all seasons)

| season | id | name | pos | team | before → after |
|---|---|---|---|---|---|
| 2021 | 1550 | Ryan Griffin | QB | TB | 17 → 0 |
| 2021 | 3239 | Bronson Kaufusi | TE | GB | 17 → 0 |
| 2021 | 4489 | Gehrig Dieter | WR | KC | 17 → 0 |
| 2021 | 4551 | Tanner Gentry | WR | BUF | 17 → 0 |
| 2021 | 6178 | Darwin Thompson | RB | TB | 17 → 0 |
| 2021 | 6233 | Matt Sokol | TE | JAX | 17 → 0 |
| 2021 | 6913 | Joe Reed | WR | LAC | 17 → 0 |
| 2021 | 6939 | Binjimen Victor | WR | BAL | 17 → 0 |
| 2021 | 7009 | Trishton Jackson | WR | MIN | 17 → 0 |
| 2021 | 7013 | Steven Montez | QB | DET | 17 → 0 |
| 2021 | 7143 | Ben DiNucci | QB | DAL | 17 → 0 |
| 2021 | 7233 | Andre Baccellia | WR | ARI | 17 → 0 |
| 2021 | 7412 | Sandro Platzgummer | RB | NYG | 17 → 0 |
| 2021 | 7521 | Chris Blair | WR | GB | 17 → 0 |
| 2021 | 7539 | Gerrid Doaks | RB | MIA | 17 → 0 |
| 2021 | 7541 | Cornell Powell | WR | KC | 17 → 0 |
| 2021 | 7546 | Tre Nixon | WR | NE | 17 → 0 |
| 2021 | 7741 | Caleb Huntley | RB | ATL | 17 → 0 |
| 2021 | 7865 | Brandon Smith | WR | DAL | 17 → 0 |
| 2021 | 7918 | A.J. Rose | RB | MIN | 17 → 0 |

## Spot rows

- 2020 pid 7496: dnpWeeks 2 → 1 (`DPPXPPPPPPPPDPPPPX` → `XPPXPPPPPPPPDPPPPX`)
- 2021 pid 2944: dnpWeeks 16 → 0 (`DDDDDDDDDPDDDXDDDD` → `XXXXXXXXXPXXXXXXXX`)
