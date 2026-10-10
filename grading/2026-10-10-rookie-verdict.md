# Rookie Outcome Panels Verdict — 2026-10-10

**Turn the rookie panel from one survivor-gated second-season PPG panel into one harness that can also grade a debut season, an ungated outcome, and realised total points, with the re-fit trap enforced as a thrown error rather than a convention.**

**Config:** legacy predictor years 2013-2024, entry/target years 2013-2025, history floor 2012, basis=`half_ppr`

**Reproduce:** `node bin/panel.mjs --rookie --write`

## §A — Reproduction pin

**PASS** against `backtests/2026-09-06-fullpipeline-panel.json`'s rookiePanel on the crosswalk frozen at `f27bc71` (`test/fixtures/rookie-pin-crosswalk-2026-09-06.json`); §B–§G read the live crosswalk.

| | assembled | surviving | drops.noOutcome | hitCapCount |
|---|---|---|---|---|
| observed | 2563 | 1056 | 1507 | 0 |
| expected | 2563 | 1056 | 1507 | 0 |

## §B — D-9: outcome classification (season-presence, ungated)

**Population label (F12, mandatory):** rookie-path, season-presence enumerator, predictor years 2013-2024; one row in seven is three-plus seasons past draft year.

Assembled: 2564. Six-state totals: {"played1to5":468,"played6plus":1056,"absentNoRosterFile":78,"rosteredZero":366,"absentOnRoster":302,"absentOffRoster":294}.

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
| undrafted|TE | 8 | 43 | 34 | 35 | 48 | 101 | 269 |
| undrafted|WR | 18 | 93 | 88 | 76 | 79 | 150 | 504 |

Experience composition (predictorYear - draftYear bucket): {"0":1492,"1":451,"2":255,"3+":345,"noYear":12,"negative":9}.

## §C — D-8: debut panel

Assembled: 2071 (invalidEntryYear excluded: 13).

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
| undrafted | TE | 205 |
| undrafted | WR | 468 |

## §D — D-12: availability panel (entry-cohort, ungated)

Assembled: 3848 (invalidEntryYear excluded: 13) against the app's 3848 (the app's recipe — `rookie-games-panel-2026-09-09.json` `source.predicate`: at years_exp ≥ 2 skip a row with zero games in the target season and the one before, and keep walking).

| group | observed 0/1/2+ (total) | app 0/1/2+ (total) | delta 0/1/2+ |
|---|---|---|---|
| r1 | 127/17/8 (152) | 127/17/8 (152) | 0/0/0 |
| day2 | 276/44/40 (360) | 276/44/40 (360) | 0/0/0 |
| day3 | 632/274/213 (1119) | 632/274/213 (1119) | 0/0/0 |
| undrafted | 1036/785/396 (2217) | 1036/785/396 (2217) | 0/0/0 |

**Rung-4 (group-pooled) rounded-value check** (raw-mean rounding; superseded by the full-ladder table below) — per §5 risk 1:

| group | observed mean games | rounded | app value | rounded | moved? |
|---|---|---|---|---|---|
| r1 | 12.204 | 12 | 12.2 | 12 | no |
| day2 | 10.689 | 11 | 10.7 | 11 | no |
| day3 | 6.171 | 6 | 6.2 | 6 | no |
| undrafted | 3.210 | 3 | 3.2 | 3 | no |

Full `byRungCell` (all six keyed levels, n / mean / rounded) is in the committed JSON artifact, not reproduced here.

**Full ladder** (all 74 app cells, rungs 1–4 and U; app src/utils/seasonProjection.js ROOKIE_GAMES_* @ c318487): 8 cells differ in n, 1 at one decimal, **0 move in whole games** (the app's rounding: one decimal, then `Math.round`).

| cell | app n | n | app value | value | whole app → whole | moved? |
|---|---|---|---|---|---|---|
| undrafted\|TE\|0 | 204 | 205 | 3.9 | 3.9 | 4 → 4 | no |
| undrafted\|WR\|0 | 469 | 468 | 2.8 | 2.9 | 3 → 3 | no |
| undrafted\|WR | 1006 | 1005 | 2.9 | 2.9 | 3 → 3 | no |
| undrafted\|TE | 456 | 457 | 4 | 4 | 4 → 4 | no |
| U\|WR\|0 | 874 | 873 | 6.3 | 6.3 | 6 → 6 | no |
| U\|WR | 1579 | 1578 | 5 | 5 | 5 → 5 | no |
| U\|TE\|0 | 397 | 398 | 7 | 7 | 7 → 7 | no |
| U\|TE | 736 | 737 | 6 | 6 | 6 → 6 | no |

Cells not listed match on n and one-decimal value.

## §E — D-13: total-points residual (Q2(d), on the legacy/shipped population)

**Population label (F12, mandatory):** rookie-path, season-presence enumerator, predictor years 2013-2024 (absence counted as zero games and zero points), n=2564.

| group | n | mean games | mean pts | E[PPG\|>=6] | n>=6 | product | error |
|---|---|---|---|---|---|---|---|
| r1 | 126 | 12.508 | 152.63 | 11.926 | 112 | 149.17 | -2.27% |
| day2 | 335 | 9.382 | 70.54 | 7.593 | 220 | 71.24 | 0.99% |
| day3 | 862 | 5.884 | 24.37 | 4.115 | 358 | 24.21 | -0.64% |
| undrafted | 1241 | 4.125 | 10.24 | 2.463 | 366 | 10.16 | -0.78% |

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
| undrafted|TE | 269 | 5.28 | 6.77 | 1.290 | 101 | 6.81 | 0.5% |

**Finding (per Q2(d), do not re-fit):** at group level the product is right to within a few percent; every cell outside +/-5% is a QB cell, and each rides on a thin conditional sample. Restricting to debut-equivalent rows (predictorYear === draftYear) does not rescue it. There is no measurable conditional PPG to multiply at QB, not a uniform correction waiting to be applied. The app's docs/projection.md 18% bound reproduces on this population as its own statistic but assumes the sub-six-game population scores nothing per game, which it does not.

## §F — Stated limits

- **Position-resolution asymmetry (§2.3a/risk 3):** 31 of 2564 legacy rows would resolve to a different position under crosswalk-only resolution than under season-keyed advstats-first resolution.
- **Entry-cohort population floor (Q3(c)/risk 4):** entrants are those nflverse has keyed to a sleeper id; the floor sits above the outcome, not correlated with it, but later work must not read these rows as "every entrant".
- **Re-fit trap (Q4(d)):** a re-fit over predictor years 2013-2024 is a re-derivation of the shipped constants, not independent validation — the rows overlap. Genuine out-of-sample evidence needs target seasons the constants never saw: 2025 now, 2026 once it completes.
- **Basis scope (F5):** a zero outcome is read from no `stats` object and is identical under any scoring basis; `half_ppr` is a claim about the rows with `outcomeGames > 0` only.
- **F10 sentinel rows:** 12 legacy rows carry a draftYear:0 sentinel (shipped behaviour, not changed here); entry-cohort excludes them via invalidEntryYear.
- **F12 contamination:** the legacy (season-presence) population is a rookie-PATH population, not a rookie population — see the experience composition in §B.
- **KTC and college stay neutral** — same structural gap as today; no ceiling, no cap, no fitted constant in this slice.
- **Late draftYear (§2.2g):** a player whose `bySleeper.draftYear` is later than a season he already appears in (`sleeperId 8799`, `draftYear 2025`, present in the 2024 predictor panel) gets a one-year cohort here, and his earlier appearance is invisible to the entry-cohort panels while the legacy panel graded it. Not guarded, by design.

## §G — D-14: rookie-ceiling quantile re-derivation

**Independent re-derivation, not out-of-sample validation** (rookie-mirror.md §5): both sides consume the same rows — the app's own fixture is a four-field redaction of these very rows. A re-fit over predictor years the constants were fitted on is a re-derivation, not validation, however clean the predictor is (rookie-outcome-panels.md §1 Q4(d)).

Population: `debut.rows` with `outcomeGames >= 8` and `outcomePPG != null`, grouped by position. knee = p90, asymptote = p99, zero-based index `p*(n-1)` linear interpolation, rounded once to 2dp. Expected values are the app's shipped constants (`41f277e`).

| position | n | observed knee | expected knee | Δ | observed asymptote | expected asymptote | Δ | match |
|---|---|---|---|---|---|---|---|---|
| QB | 50 | 17.8 | 17.8 | 0 | 21.9 | 21.9 | 0 | yes |
| RB | 281 | 12.11 | 12.11 | 0 | 16.87 | 16.87 | 0 | yes |
| WR | 366 | 9.87 | 9.87 | 0 | 14.38 | 14.38 | 0 | yes |
| TE | 176 | 6.21 | 6.21 | 0 | 11.6 | 11.6 | 0 | yes |

**Triage (never retuned here):** n differs → the two repos disagree about the debut population — find which side moved. n matches, a quantile differs by <= 0.01 → a rounding-path difference. n matches, a quantile differs by more → the shipped constant is wrong for the current data; this repo reports the number, changing `ROOKIE_CEILING` is an app-repo slice.

## Not in this slice

- No fitted constant, no cap, no shrinkage beyond the mirrored ceiling above.
- College reconstruction, veteran panel, `assemblePanelRows`' rookie-path exclusion, sensitivity check, Step 4, `predictFullPipeline` — all untouched.
- The draftYear:0 sentinel's effect on `ageAtDraft` is shipped behaviour and is not fixed.
- Genuine out-of-sample evidence for the ceiling constants (D-16) — deferred to season end.
