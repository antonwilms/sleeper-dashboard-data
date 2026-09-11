# Rookie Outcome Panels Verdict — 2026-09-11

**Turn the rookie panel from one survivor-gated second-season PPG panel into one harness that can also grade a debut season, an ungated outcome, and realised total points, with the re-fit trap enforced as a thrown error rather than a convention.**

**Config:** legacy predictor years 2013-2024, entry/target years 2013-2025, history floor 2012, basis=`half_ppr`

**Reproduce:** `node bin/panel.mjs --rookie --write`

## §A — Reproduction pin

**PASS** against `backtests/2026-09-06-fullpipeline-panel.json`'s rookiePanel.

| | assembled | surviving | drops.noOutcome | hitCapCount |
|---|---|---|---|---|
| observed | 2563 | 1056 | 1507 | 0 |
| expected | 2563 | 1056 | 1507 | 0 |

## §B — D-9: outcome classification (season-presence, ungated)

**Population label (F12, mandatory):** rookie-path, season-presence enumerator, predictor years 2013-2024; one row in seven is three-plus seasons past draft year.

Assembled: 2563. Six-state totals: {"played1to5":467,"played6plus":1056,"absentNoRosterFile":78,"rosteredZero":366,"absentOnRoster":302,"absentOffRoster":294}.

By draft group x position:

| cell | absent(noRoster) | absent(onRoster) | absent(offRoster) | 0 games | 1-5 | >=6 | n |
|---|---|---|---|---|---|---|---|
| day2|QB | 0 | 6 | 5 | 18 | 31 | 21 | 81 |
| day2|RB | 1 | 2 | 1 | 3 | 13 | 55 | 75 |
| day2|TE | 1 | 3 | 1 | 6 | 8 | 46 | 65 |
| day2|WR | 0 | 4 | 1 | 3 | 8 | 98 | 114 |
| day3|QB | 8 | 24 | 30 | 74 | 84 | 31 | 251 |
| day3|RB | 7 | 25 | 14 | 24 | 37 | 116 | 223 |
| day3|TE | 2 | 9 | 7 | 11 | 16 | 83 | 128 |
| day3|WR | 11 | 31 | 17 | 31 | 42 | 128 | 260 |
| r1|QB | 1 | 3 | 0 | 0 | 5 | 37 | 46 |
| r1|RB | 1 | 0 | 0 | 0 | 0 | 15 | 16 |
| r1|TE | 0 | 0 | 0 | 0 | 1 | 11 | 12 |
| r1|WR | 1 | 0 | 0 | 0 | 2 | 49 | 52 |
| undrafted|QB | 9 | 20 | 34 | 40 | 47 | 14 | 164 |
| undrafted|RB | 10 | 39 | 62 | 45 | 47 | 101 | 304 |
| undrafted|TE | 8 | 43 | 34 | 35 | 47 | 101 | 268 |
| undrafted|WR | 18 | 93 | 88 | 76 | 79 | 150 | 504 |

Experience composition (predictorYear - draftYear bucket): {"0":1492,"1":451,"2":255,"3+":345,"noYear":12,"negative":8}.

## §C — D-8: debut panel

Assembled: 2071 (invalidEntryYear excluded: 45).

| draft group | position | n |
|---|---|---|
| day2 | QB | 27 |
| day2 | RB | 71 |
| day2 | TE | 61 |
| day2 | WR | 117 |
| day3 | QB | 77 |
| day3 | RB | 204 |
| day3 | TE | 117 |
| day3 | WR | 234 |
| r1 | QB | 41 |
| r1 | RB | 17 |
| r1 | TE | 15 |
| r1 | WR | 54 |
| undrafted | QB | 73 |
| undrafted | RB | 290 |
| undrafted | TE | 204 |
| undrafted | WR | 469 |

## §D — D-12: availability panel (entry-cohort, ungated)

Assembled: 3941 (invalidEntryYear excluded: 45) against the app's 3848 (self-derived predicate, not tuned to match — §5 risk 1).

| group | observed 0/1/2+ (total) | app 0/1/2+ (total) | delta 0/1/2+ |
|---|---|---|---|
| r1 | 127/17/9 (153) | 127/17/8 (152) | 0/0/1 |
| day2 | 276/44/41 (361) | 276/44/40 (360) | 0/0/1 |
| day3 | 632/274/231 (1137) | 632/274/213 (1119) | 0/0/18 |
| undrafted | 1036/785/469 (2290) | 1036/785/396 (2217) | 0/0/73 |

**Rung-4 (group-pooled) rounded-value check** — the consequential quantity per §5 risk 1:

| group | observed mean games | rounded | app value | rounded | moved? |
|---|---|---|---|---|---|
| r1 | 12.124 | 12 | 12.2 | 12 | no |
| day2 | 10.609 | 11 | 10.7 | 11 | no |
| day3 | 5.914 | 6 | 6.2 | 6 | no |
| undrafted | 2.796 | 3 | 3.2 | 3 | no |

Full `byRungCell` (all six keyed levels, n / mean / rounded) is in the committed JSON artifact, not reproduced here.

## §E — D-13: total-points residual (Q2(d), on the legacy/shipped population)

**Population label (F12, mandatory):** rookie-path, season-presence enumerator, predictor years 2013-2024 (absence counted as zero games and zero points), n=2563.

| group | n | mean games | mean pts | E[PPG\|>=6] | n>=6 | product | error |
|---|---|---|---|---|---|---|---|
| r1 | 126 | 12.508 | 152.63 | 11.926 | 112 | 149.17 | -2.27% |
| day2 | 335 | 9.382 | 70.54 | 7.593 | 220 | 71.24 | 0.99% |
| day3 | 862 | 5.884 | 24.37 | 4.115 | 358 | 24.21 | -0.64% |
| undrafted | 1240 | 4.126 | 10.25 | 2.463 | 366 | 10.16 | -0.84% |

| cell | n | mean games | mean pts | E[PPG\|>=6] | n>=6 | product | error |
|---|---|---|---|---|---|---|---|
| r1|QB | 46 | 11.33 | 192.18 | 16.396 | 37 | 185.70 | -3.4% |
| r1|RB | 16 | 13.19 | 180.81 | 13.657 | 15 | 180.10 | -0.4% |
| r1|WR | 52 | 13.38 | 123.09 | 8.994 | 49 | 120.38 | -2.2% |
| r1|TE | 12 | 12.33 | 91.47 | 7.592 | 11 | 93.63 | 2.4% |
| day2|QB | 81 | 3.77 | 38.25 | 12.047 | 21 | 45.36 | 18.6% |
| day2|RB | 75 | 10.41 | 108.46 | 10.155 | 55 | 105.74 | -2.5% |
| day2|WR | 114 | 12.11 | 81.87 | 6.625 | 98 | 80.25 | -2.0% |
| day2|TE | 65 | 10.40 | 47.13 | 4.558 | 46 | 47.40 | 0.6% |
| day3|QB | 251 | 2.02 | 16.28 | 8.899 | 31 | 17.98 | 10.4% |
| day3|RB | 223 | 7.24 | 34.59 | 4.782 | 116 | 34.61 | 0.1% |
| day3|WR | 260 | 6.76 | 25.07 | 3.530 | 128 | 23.85 | -4.9% |
| day3|TE | 128 | 9.33 | 20.98 | 2.296 | 83 | 21.42 | 2.1% |
| undrafted|QB | 164 | 1.43 | 10.36 | 8.658 | 14 | 12.41 | 19.8% |
| undrafted|RB | 304 | 4.68 | 13.33 | 2.838 | 101 | 13.29 | -0.3% |
| undrafted|WR | 504 | 4.05 | 10.18 | 2.421 | 150 | 9.81 | -3.7% |
| undrafted|TE | 268 | 5.29 | 6.80 | 1.290 | 101 | 6.82 | 0.3% |

**Finding (per Q2(d), do not re-fit):** at group level the product is right to within a few percent; every cell outside +/-5% is a QB cell, and each rides on a thin conditional sample. Restricting to debut-equivalent rows (predictorYear === draftYear) does not rescue it. There is no measurable conditional PPG to multiply at QB, not a uniform correction waiting to be applied. The app's docs/projection.md 18% bound reproduces on this population as its own statistic but assumes the sub-six-game population scores nothing per game, which it does not.

## §F — Stated limits

- **Position-resolution asymmetry (§2.3a/risk 3):** 31 of 2563 legacy rows would resolve to a different position under crosswalk-only resolution than under season-keyed advstats-first resolution.
- **Entry-cohort population floor (Q3(c)/risk 4):** entrants are those nflverse has keyed to a sleeper id; the floor sits above the outcome, not correlated with it, but later work must not read these rows as "every entrant".
- **Re-fit trap (Q4(d)):** a re-fit over predictor years 2013-2024 is a re-derivation of the shipped constants, not independent validation — the rows overlap. Genuine out-of-sample evidence needs target seasons the constants never saw: 2025 now, 2026 once it completes.
- **Basis scope (F5):** a zero outcome is read from no `stats` object and is identical under any scoring basis; `half_ppr` is a claim about the rows with `outcomeGames > 0` only.
- **F10 sentinel rows:** 12 legacy rows carry a draftYear:0 sentinel (shipped behaviour, not changed here); entry-cohort excludes them via invalidEntryYear.
- **F12 contamination:** the legacy (season-presence) population is a rookie-PATH population, not a rookie population — see the experience composition in §B.
- **KTC and college stay neutral** — same structural gap as today; no ceiling, no cap, no fitted constant in this slice.

## Not in this slice

- CR-15's rookie mirror is not discharged; `reconstructShippedRookieProjection` is a reserved name with no body.
- No fitted constant, no ceiling, no cap, no shrinkage.
- College reconstruction, veteran panel, `assemblePanelRows`' rookie-path exclusion, sensitivity check, Step 4, `predictFullPipeline` — all untouched.
- The draftYear:0 sentinel's effect on `ageAtDraft` is shipped behaviour and is not fixed.
- `grading/anchor-policy.md` is not written.
