# D-46 — league-basis mirror: graded before/after (verdict)

Generated 2026-10-16T08:51:09.053Z (data `cb27d88`, the pushed commit holding the run's code). Scoring settings: `test/fixtures/league-scoring-2026-10-14.json`; positions: `raw/-players-nfl.json`. `node bin/backtest.mjs --league-basis --write`.

## Pre-registered decision rule (written before any G2 result was read)

Per constants file, on **emitted** `k` (never `pinK(kFit)`): for each pinned points entry compare the shipped file's emitted `k` with the league file's emitted `k`. The out-of-sample comparison is `analyzeKCell(rows, spec, { studyK: shippedK })` on the league rows of the cell the entry re-derives from (`fixtureKey ?? name|pos`); its `delta` is the paired leave-one-season-out |error| difference (league fold k − shipped k), clustered by player with the mode's pinned bootstrap, labelled by `compareLabel` (`BEATS` = the league k is better out of sample). The shipped k keeps a small leakage advantage (fitted on all seasons).

- **Excluded (basis-invariant):** `K_ROS_OPP`, `K_DYN_OPP`, `K_ROS_SHARE` — no points in prior, evidence or outcome. Listed, not pooled.
- **Study entries** (`basis: 'study'`) keep their pin rule under league and are decided like any other entry on their emitted k.
- **`wire`** iff at least one points entry is `BEATS`, no points entry is `WORSE`, and the pooled points-only paired delta (all points entries' rows) is `BEATS`. Otherwise **`do-not-wire`**, naming the entries.
- **Multiplicity exposure:** with roughly 40 points entries at 95% intervals, one spurious `BEATS` or `WORSE` is expected by chance; requiring the pooled delta to be `BEATS` as well is the guard against that.
- **Dynasty file (additionally):** a `wire` requires `prospectPriorKind.kind`, `decisions` and `reuse` unchanged from the shipped file (every difference listed with `diffDynConstants`); if any changed, the dynasty file is **`stop-and-report`** (a decision, not a k). The dynasty file is decided on the run paired with the 2a k the app would keep: the league 2a file if the 2a file wires, else the shipped 2a file.
- **Data-quality signal:** report `scaled` weeks above 0.5% of the G2 rows in any season.
- **G3 is report-only:** no exponent is activated; any label difference between bases means the committed `r3fit-exponent-harness.md` verdict does not transport to league basis (Session 1 records a backlog item).

## Verdicts

- **`backtests/2026-10-07-inseason-constants.json` (2a): `do-not-wire`** — BEATS K_ROS_POINTS_SHORT.TE; no WORSE entry; pooled points delta NO-GAIN.
- **`backtests/2026-10-11-inseason-dyn-constants.json` (dynasty): `do-not-wire`** — decided on the shipped-2a run: no BEATS entry; no WORSE entry; pooled points delta WORSE.
- **Pooled points delta, 2a — the decision reading** (all points entries' rows, deduplicated per cell, `same` included): 21 cells, 147351 rows, 1720 players, mean -0.0002 [-0.003, 0.003] → **NO-GAIN**.
  - *Disclosure only — not the decision:* pooling only the cells where an emitted k differs: mean -0.0109 [-0.019, -0.003] → **BEATS** (taken from the Stage A run record in `.claude/tasks/league-basis-mirror.md` → "Stage A verification"; not recomputed from the panel JSON, which does not hold it).
  - Caveat: this reading is driven almost entirely by `K_ROS_POINTS_SHORT.TE` (shipped 4 (study) vs league 1.5 (pooled), Δ -0.141 [-0.225, -0.062], measured on `q4|X-short|ros|ALL` rows) — a study-pin question, not a basis effect; backlog D-73 re-examines it independent of basis.
- **Pooled points delta, dynasty (deciding run) — the decision reading** (all points entries' rows, deduplicated per cell, `same` included): 1 cells, 7583 rows, 684 players, mean 0.0120 [0.007, 0.017] → **WORSE**.
  - Every decided entry's emitted k is identical, so this pooled delta measures fold-k leakage only (the shipped k was fitted on all seasons), not a basis effect.
- **G3:** a verdict label differs between bases — the committed `r3fit-exponent-harness.md` verdict does not transport to league basis (Session 1 records a backlog item).
- **Exposure (stated, as pre-registered):** with roughly 40 points entries at 95% intervals, one spurious `BEATS` or `WORSE` is expected by chance; the pooled-delta requirement is the guard.

## G1 — mirror fidelity (a gate)

**PASS.** Scoring settings deep-equal on every capture read: 2026-09-24 true, 2026-09-25 true, 2026-10-14 true.

### G1a — `reconstructPositionBasisScale` at S = 2026 vs the captured `rookieBasisScale`

| position | mirror scale | qualifying rows |
|---|---|---|
| QB | 1.114 | 435 |
| RB | 1.118 | 1300 |
| WR | 1.101 | 2028 |
| TE | 1.325 | 1231 |

**2026-09-25** (unrecovered 0)

| position | rookie rows | captured scale | match | export position diff | absent from export |
|---|---|---|---|---|---|
| QB | 47 | 1.114 | true | 0 | 0 |
| RB | 71 | 1.118 | true | 1 | 0 |
| WR | 124 | 1.101 | true | 0 | 1 |
| TE | 60 | 1.325 | true | 1 | 0 |

**2026-10-14** (unrecovered 0)

| position | rookie rows | captured scale | match | export position diff | absent from export |
|---|---|---|---|---|---|
| QB | 49 | 1.114 | true | 0 | 0 |
| RB | 77 | 1.118 | true | 3 | 0 |
| WR | 125 | 1.101 | true | 0 | 1 |
| TE | 59 | 1.325 | true | 1 | 0 |

D3: qualifying (gp >= 10, half-PPR source) pids absent from `raw/-players-nfl.json`: 39; the rookie-row position diffs between the export and the position recovered from the capture are in the tables above (they touch no qualifying history, so no scale moved). No parity miss was attributable to position, so the players-state overlay fallback was not used.

### G1b — rookie rows on 2026-10-14 (310 rows; 46 `chain` rows excluded from level/total)

**Under `league` (captured scale):**

| field | checked | mismatches |
|---|---|---|
| basePPG | 310 | 0 |
| ceilingInput | 310 | 0 |
| kneeAsymptote | 310 | 0 |
| level | 264 | 0 |
| qbStarter | 49 | 0 |
| totalFactor | 264 | 0 |
| total | 264 | 0 |

**Under `half_ppr` (scale 1) — the "before":**

| field | checked | mismatches |
|---|---|---|
| basePPG | 310 | 310 |
| ceilingInput | 310 | 310 |
| kneeAsymptote | 310 | 310 |
| level | 264 | 17 |
| qbStarter | 49 | 20 |
| totalFactor | 264 | 0 |
| total | 264 | 24 |

Capture consistency of the ceiling input to the literal 3 dp: 125/310. **Deviation from the plan, stated:** the plan's literal "equals … at 3 dp" cannot hold — the captured `rookieMultiplierProduct` is rounded to 2 dp on 68 rows and 3 dp on 242, so a literal check misses on `ceilingInput` only (185 of 310 rows; the cause is capture rounding, not position, so D3's overlay fallback does not apply). The check is the product's rounding bound (half a unit at 2 dp × baseline × calibration, plus the 3-dp capture of the input): 0 rows outside it under `league`, 310 of 310 outside it under `half_ppr`.

### G1c — the boundary (rows checked under legacy rookie-QB / rookie-total models)

**2026-09-24** (pre-switch, envelope model `half_ppr`)

| model | rows | mismatches (all fields) |
|---|---|---|
| half_ppr | 302 | 0 |
| league | 302 | 938 |

**2026-09-25** (post-switch, envelope model `league`)

| model | rows | mismatches (all fields) |
|---|---|---|
| half_ppr | 302 | 956 |
| league | 302 | 0 |

### G1d — veteran `basePPG` (T-F10L)

436 veteran candidates: exact at 1 dp under league rows **436**, under half-PPR rows 11 (425 fail). Match rates (reported, not asserted): consistencyScore 436/436 league vs 218 half-PPR; outlierRatio 99 vs 56; `isTdReliant` has no data-side mirror (reported as unreconstructed); consistencyScore / outlierRatio are match rates, not asserted.

## G2 — the k re-fit

Shipped files (the commits the app names are asserted against the last commit touching each file):

| file | app names | last commit touching it | match |
|---|---|---|---|
| `backtests/2026-10-07-inseason-constants.json` | `f2c3b83` | `f2c3b83` | true |
| `backtests/2026-10-11-inseason-dyn-constants.json` | `0370478` | `0370478` | true |

### 2a — `--inseason --basis league`

League file `backtests/2026-10-16-inseason-league-constants.json`. Reconciliation 7032/7033.

| entry | shipped k (basis) | league k (basis) | rows / players | Δ|err| league fold − shipped [95% CI] | label |  | weeks exact/scaled/none (player-seasons) |
|---|---|---|---|---|---|---|---|
| K_ROS_POINTS.QB | 3 (fitted) | 2.5 (fitted) | 3124 / 78 | 0.0023 [-0.013, 0.019] | NO-GAIN |  | 309/0/0 |
| K_ROS_POINTS.RB | 2.5 (fitted) | 2.5 (fitted) | 9213 / 308 | 0.0047 [0.001, 0.009] | same |  | 890/0/0 |
| K_ROS_POINTS.WR | 3 (fitted) | 3 (fitted) | 12845 / 406 | 0.0038 [0.001, 0.006] | same |  | 1251/0/0 |
| K_ROS_POINTS.TE | 3.5 (fitted) | 3 (fitted) | 8495 / 240 | -0.0008 [-0.005, 0.003] | NO-GAIN |  | 798/0/0 |
| K_DYN_POINTS.QB | 4.5 (fitted) | 4 (fitted) | 2726 / 61 | 0.0094 [-0.004, 0.024] | NO-GAIN |  | 235/0/0 |
| K_DYN_POINTS.RB | 4.5 (study) | 4 (fitted) | 6840 / 221 | 0.0096 [-0.001, 0.020] | NO-GAIN | study | 587/0/0 |
| K_DYN_POINTS.WR | 4 (fitted) | 4 (fitted) | 10001 / 304 | 0.0040 [0.001, 0.007] | same |  | 861/0/0 |
| K_DYN_POINTS.TE | 4.5 (fitted) | 4 (fitted) | 6471 / 178 | 0.0006 [-0.007, 0.007] | NO-GAIN |  | 554/0/0 |
| K_DYN_POINTS_HISTORY.QB | 7.5 (study) | 7.5 (study) | 3193 / 70 | 0.0115 [0.001, 0.022] | same | study | 275/0/0 |
| K_DYN_POINTS_HISTORY.RB | 4 (fitted) | 4 (fitted) | 8871 / 275 | 0.0038 [0.000, 0.007] | same |  | 763/0/0 |
| K_DYN_POINTS_HISTORY.WR | 6 (fitted) | 6 (fitted) | 12506 / 365 | 0.0006 [-0.001, 0.002] | same |  | 1079/0/0 |
| K_DYN_POINTS_HISTORY.TE | 5.5 (fitted) | 5 (fitted) | 8068 / 224 | -0.0023 [-0.008, 0.003] | NO-GAIN |  | 695/0/0 |
| K_ROS_POINTS_ROOKIE0.QB | 2.5 (pooled) | 2.5 (pooled) | 9815 / 1063 | 0.0057 [0.003, 0.009] | same |  | 1063/0/0 |
| K_ROS_POINTS_ROOKIE0.RB | 2.5 (pooled) | 2.5 (pooled) | 9815 / 1063 | 0.0057 [0.003, 0.009] | same |  | 1063/0/0 |
| K_ROS_POINTS_ROOKIE0.WR | 2.5 (fitted) | 2.5 (pooled) | 9815 / 1063 | 0.0057 [0.003, 0.009] | same |  | 1063/0/0 |
| K_ROS_POINTS_ROOKIE0.TE | 2.5 (pooled) | 2.5 (pooled) | 9815 / 1063 | 0.0057 [0.003, 0.009] | same |  | 1063/0/0 |
| K_DYN_POINTS_ROOKIE0.QB | 6.5 (pooled) | 6 (pooled) | 8072 / 764 | 0.0021 [-0.003, 0.007] | NO-GAIN |  | 764/0/0 |
| K_DYN_POINTS_ROOKIE0.RB | 6.5 (pooled) | 6 (pooled) | 8072 / 764 | 0.0021 [-0.003, 0.007] | NO-GAIN |  | 764/0/0 |
| K_DYN_POINTS_ROOKIE0.WR | 6.5 (pooled) | 6 (pooled) | 8072 / 764 | 0.0021 [-0.003, 0.007] | NO-GAIN |  | 764/0/0 |
| K_DYN_POINTS_ROOKIE0.TE | 6.5 (pooled) | 6 (pooled) | 8072 / 764 | 0.0021 [-0.003, 0.007] | NO-GAIN |  | 764/0/0 |
| K_ROS_POINTS_ROOKIE1P.QB | 2.5 (pooled) | 2.5 (pooled) | 10857 / 1089 | 0.0043 [0.002, 0.006] | same |  | 1145/0/0 |
| K_ROS_POINTS_ROOKIE1P.RB | 2.5 (pooled) | 2.5 (pooled) | 10857 / 1089 | 0.0043 [0.002, 0.006] | same |  | 1145/0/0 |
| K_ROS_POINTS_ROOKIE1P.WR | 3 (fitted) | 3 (fitted) | 4384 / 439 | 0.0052 [0.002, 0.008] | same |  | 452/0/0 |
| K_ROS_POINTS_ROOKIE1P.TE | 2.5 (pooled) | 2.5 (pooled) | 10857 / 1089 | 0.0043 [0.002, 0.006] | same |  | 1145/0/0 |
| K_DYN_POINTS_ROOKIE1P.QB | 3.5 (pooled) | 3.5 (pooled) | 8690 / 752 | 0.0060 [0.001, 0.011] | same |  | 789/0/0 |
| K_DYN_POINTS_ROOKIE1P.RB | 3.5 (pooled) | 3.5 (pooled) | 8690 / 752 | 0.0060 [0.001, 0.011] | same |  | 789/0/0 |
| K_DYN_POINTS_ROOKIE1P.WR | 3.5 (pooled) | 3.5 (pooled) | 8690 / 752 | 0.0060 [0.001, 0.011] | same |  | 789/0/0 |
| K_DYN_POINTS_ROOKIE1P.TE | 3.5 (pooled) | 3.5 (pooled) | 8690 / 752 | 0.0060 [0.001, 0.011] | same |  | 789/0/0 |
| K_ROS_POINTS_SHORT.QB | 1.5 (pooled) | 1.5 (pooled) | 4397 / 418 | 0.0052 [-0.000, 0.011] | same |  | 508/0/0 |
| K_ROS_POINTS_SHORT.RB | 1.5 (pooled) | 1.5 (pooled) | 4397 / 418 | 0.0052 [-0.000, 0.011] | same |  | 508/0/0 |
| K_ROS_POINTS_SHORT.WR | 1 (fitted) | 1 (fitted) | 1662 / 162 | 0.0127 [0.003, 0.024] | same |  | 187/0/0 |
| K_ROS_POINTS_SHORT.TE | 4 (study) | 1.5 (pooled) | 4397 / 418 | -0.1409 [-0.225, -0.062] | BEATS | study | 508/0/0 |
| K_DYN_POINTS_SHORT.QB | 2.5 (pooled) | 2.5 (pooled) | 2724 / 221 | 0.0231 [0.010, 0.036] | same |  | 256/0/0 |
| K_DYN_POINTS_SHORT.RB | 2.5 (pooled) | 2.5 (pooled) | 2724 / 221 | 0.0231 [0.010, 0.036] | same |  | 256/0/0 |
| K_DYN_POINTS_SHORT.WR | 2.5 (pooled) | 2.5 (pooled) | 2724 / 221 | 0.0231 [0.010, 0.036] | same |  | 256/0/0 |
| K_DYN_POINTS_SHORT.TE | 2.5 (pooled) | 2.5 (pooled) | 2724 / 221 | 0.0231 [0.010, 0.036] | same |  | 256/0/0 |
| K_DYN_POINTS_WEAK.WR | — | 8 (fitted) | 3114 / 158 | — | shipped-missing |  | — |
| K_DYN_POINTS_STRONG.WR | — | 3 (fitted) | 6887 / 210 | — | shipped-missing |  | — |

Pooled points-only paired delta: 21 cells, 147351 rows, 1720 players, mean -0.0002 [-0.003, 0.003] → **NO-GAIN**. Excluded (basis-invariant): K_ROS_OPP, K_DYN_OPP, K_ROS_SHARE.

Structural differences (an entry on one side only — not decided by the rule, and a wiring would have to carry them): `K_DYN_POINTS_WEAK.WR` (league file only), `K_DYN_POINTS_STRONG.WR` (league file only).

Note on pooled cells: where a league entry pins from a pooled-positions cell (`fixtureKey` …`|ALL`), the delta is measured on that cell's rows (all positions), as the plan prescribes — so a position's shipped k (e.g. a `study` TE value) is judged on rows it was never fitted on.

### 2b — `--inseason --dynasty --basis league --inseason-2a <league 2a file>`

Paired 2a: `backtests/2026-10-16-inseason-league-constants.json (uncommitted league 2a file)`. File verdict on this run: **do-not-wire** (informational) — no BEATS entry; no WORSE entry; pooled points delta WORSE; structure changed (kind / decisions / reuse).

| entry | shipped k (basis) | league k (basis) | rows / players | Δ|err| league fold − shipped [95% CI] | label |  | weeks exact/scaled/none (player-seasons) |
|---|---|---|---|---|---|---|---|
| K_DYN_PROSPECT_A_YE1.QB | 3.5 (pooled) | 3.5 (pooled) | 7583 / 684 | 0.0120 [0.007, 0.017] | same |  | 684/0/0 |
| K_DYN_PROSPECT_A_YE1.RB | 3.5 (pooled) | 3.5 (pooled) | 7583 / 684 | 0.0120 [0.007, 0.017] | same |  | 684/0/0 |
| K_DYN_PROSPECT_A_YE1.WR | 3.5 (pooled) | 3.5 (pooled) | 7583 / 684 | 0.0120 [0.007, 0.017] | same |  | 684/0/0 |
| K_DYN_PROSPECT_A_YE1.TE | 3.5 (pooled) | 3.5 (pooled) | 7583 / 684 | 0.0120 [0.007, 0.017] | same |  | 684/0/0 |

Pooled points-only paired delta: 7583 rows, mean 0.0120 [0.007, 0.017] → **WORSE**.

`prospectPriorKind.kind` unchanged: **true**; `decisions` changed: 0; `reuse` changed: 8.

`diffDynConstants` (league − shipped; 48 differences):

| path | shipped | league |
|---|---|---|
| `constants.K_DYN_PROSPECT_A_YE1.QB.kFit` | 3.6 | 3.7 |
| `constants.K_DYN_PROSPECT_A_YE1.QB.ci95` | [2.7,4.8] | [2.8,4.9] |
| `constants.K_DYN_PROSPECT_A_YE1.QB.foldK.2014` | 3.4 | 3.5 |
| `constants.K_DYN_PROSPECT_A_YE1.QB.foldK.2015` | 3.2 | 3.3 |
| `constants.K_DYN_PROSPECT_A_YE1.QB.foldK.2016` | 3.4 | 3.5 |
| `constants.K_DYN_PROSPECT_A_YE1.QB.foldK.2017` | 3.8 | 3.9 |
| `constants.K_DYN_PROSPECT_A_YE1.QB.foldK.2020` | 3.6 | 3.7 |
| `constants.K_DYN_PROSPECT_A_YE1.QB.foldK.2021` | 3.9 | 4 |
| `constants.K_DYN_PROSPECT_A_YE1.QB.foldK.2022` | 3.7 | 3.8 |
| `constants.K_DYN_PROSPECT_A_YE1.QB.foldK.2023` | 3.8 | 3.9 |
| `constants.K_DYN_PROSPECT_A_YE1.RB.kFit` | 3.6 | 3.7 |
| `constants.K_DYN_PROSPECT_A_YE1.RB.ci95` | [2.7,4.8] | [2.8,4.9] |
| `constants.K_DYN_PROSPECT_A_YE1.RB.foldK.2014` | 3.4 | 3.5 |
| `constants.K_DYN_PROSPECT_A_YE1.RB.foldK.2015` | 3.2 | 3.3 |
| `constants.K_DYN_PROSPECT_A_YE1.RB.foldK.2016` | 3.4 | 3.5 |
| `constants.K_DYN_PROSPECT_A_YE1.RB.foldK.2017` | 3.8 | 3.9 |
| `constants.K_DYN_PROSPECT_A_YE1.RB.foldK.2020` | 3.6 | 3.7 |
| `constants.K_DYN_PROSPECT_A_YE1.RB.foldK.2021` | 3.9 | 4 |
| `constants.K_DYN_PROSPECT_A_YE1.RB.foldK.2022` | 3.7 | 3.8 |
| `constants.K_DYN_PROSPECT_A_YE1.RB.foldK.2023` | 3.8 | 3.9 |
| `constants.K_DYN_PROSPECT_A_YE1.WR.kFit` | 3.6 | 3.7 |
| `constants.K_DYN_PROSPECT_A_YE1.WR.ci95` | [2.7,4.8] | [2.8,4.9] |
| `constants.K_DYN_PROSPECT_A_YE1.WR.foldK.2014` | 3.4 | 3.5 |
| `constants.K_DYN_PROSPECT_A_YE1.WR.foldK.2015` | 3.2 | 3.3 |
| `constants.K_DYN_PROSPECT_A_YE1.WR.foldK.2016` | 3.4 | 3.5 |
| `constants.K_DYN_PROSPECT_A_YE1.WR.foldK.2017` | 3.8 | 3.9 |
| `constants.K_DYN_PROSPECT_A_YE1.WR.foldK.2020` | 3.6 | 3.7 |
| `constants.K_DYN_PROSPECT_A_YE1.WR.foldK.2021` | 3.9 | 4 |
| `constants.K_DYN_PROSPECT_A_YE1.WR.foldK.2022` | 3.7 | 3.8 |
| `constants.K_DYN_PROSPECT_A_YE1.WR.foldK.2023` | 3.8 | 3.9 |
| `constants.K_DYN_PROSPECT_A_YE1.TE.kFit` | 3.6 | 3.7 |
| `constants.K_DYN_PROSPECT_A_YE1.TE.ci95` | [2.7,4.8] | [2.8,4.9] |
| `constants.K_DYN_PROSPECT_A_YE1.TE.foldK.2014` | 3.4 | 3.5 |
| `constants.K_DYN_PROSPECT_A_YE1.TE.foldK.2015` | 3.2 | 3.3 |
| `constants.K_DYN_PROSPECT_A_YE1.TE.foldK.2016` | 3.4 | 3.5 |
| `constants.K_DYN_PROSPECT_A_YE1.TE.foldK.2017` | 3.8 | 3.9 |
| `constants.K_DYN_PROSPECT_A_YE1.TE.foldK.2020` | 3.6 | 3.7 |
| `constants.K_DYN_PROSPECT_A_YE1.TE.foldK.2021` | 3.9 | 4 |
| `constants.K_DYN_PROSPECT_A_YE1.TE.foldK.2022` | 3.7 | 3.8 |
| `constants.K_DYN_PROSPECT_A_YE1.TE.foldK.2023` | 3.8 | 3.9 |
| `reuse.K_DYN_PROSPECT_B_YE0|QB.k` | [6.5] | [6] |
| `reuse.K_DYN_PROSPECT_B_YE0|RB.k` | [6.5] | [6] |
| `reuse.K_DYN_PROSPECT_B_YE0|WR.k` | [6.5] | [6] |
| `reuse.K_DYN_PROSPECT_B_YE0|TE.k` | [6.5] | [6] |
| `reuse.K_DYN_PROSPECT_B_YE1|RB.k` | [3.5,6.5] | [3.5,6] |
| `reuse.K_DYN_PROSPECT_B_YE1|WR.k` | [3.5,6.5] | [3.5,6] |
| `reuse.K_DYN_PROSPECT_B_YE1|TE.k` | [3.5,6.5] | [3.5,6] |
| `reuse.K_DYN_POINTS_SHORT_HISTORY|TE.k` | [5.5] | [5] |

### 2c — the same on the shipped 2a file (`--inseason-2a backtests/2026-10-07-inseason-constants.json`)

Paired 2a: `backtests/2026-10-07-inseason-constants.json @ f2c3b83b31acc589dac78b6d61a704ac02a57477`. File verdict on this run: **do-not-wire** (the deciding run) — no BEATS entry; no WORSE entry; pooled points delta WORSE.

| entry | shipped k (basis) | league k (basis) | rows / players | Δ|err| league fold − shipped [95% CI] | label |  | weeks exact/scaled/none (player-seasons) |
|---|---|---|---|---|---|---|---|
| K_DYN_PROSPECT_A_YE1.QB | 3.5 (pooled) | 3.5 (pooled) | 7583 / 684 | 0.0120 [0.007, 0.017] | same |  | 684/0/0 |
| K_DYN_PROSPECT_A_YE1.RB | 3.5 (pooled) | 3.5 (pooled) | 7583 / 684 | 0.0120 [0.007, 0.017] | same |  | 684/0/0 |
| K_DYN_PROSPECT_A_YE1.WR | 3.5 (pooled) | 3.5 (pooled) | 7583 / 684 | 0.0120 [0.007, 0.017] | same |  | 684/0/0 |
| K_DYN_PROSPECT_A_YE1.TE | 3.5 (pooled) | 3.5 (pooled) | 7583 / 684 | 0.0120 [0.007, 0.017] | same |  | 684/0/0 |

Pooled points-only paired delta: 7583 rows, mean 0.0120 [0.007, 0.017] → **WORSE**.

`prospectPriorKind.kind` unchanged: **true**; `decisions` changed: 0; `reuse` changed: 0.

`diffDynConstants` (league − shipped; 40 differences):

| path | shipped | league |
|---|---|---|
| `constants.K_DYN_PROSPECT_A_YE1.QB.kFit` | 3.6 | 3.7 |
| `constants.K_DYN_PROSPECT_A_YE1.QB.ci95` | [2.7,4.8] | [2.8,4.9] |
| `constants.K_DYN_PROSPECT_A_YE1.QB.foldK.2014` | 3.4 | 3.5 |
| `constants.K_DYN_PROSPECT_A_YE1.QB.foldK.2015` | 3.2 | 3.3 |
| `constants.K_DYN_PROSPECT_A_YE1.QB.foldK.2016` | 3.4 | 3.5 |
| `constants.K_DYN_PROSPECT_A_YE1.QB.foldK.2017` | 3.8 | 3.9 |
| `constants.K_DYN_PROSPECT_A_YE1.QB.foldK.2020` | 3.6 | 3.7 |
| `constants.K_DYN_PROSPECT_A_YE1.QB.foldK.2021` | 3.9 | 4 |
| `constants.K_DYN_PROSPECT_A_YE1.QB.foldK.2022` | 3.7 | 3.8 |
| `constants.K_DYN_PROSPECT_A_YE1.QB.foldK.2023` | 3.8 | 3.9 |
| `constants.K_DYN_PROSPECT_A_YE1.RB.kFit` | 3.6 | 3.7 |
| `constants.K_DYN_PROSPECT_A_YE1.RB.ci95` | [2.7,4.8] | [2.8,4.9] |
| `constants.K_DYN_PROSPECT_A_YE1.RB.foldK.2014` | 3.4 | 3.5 |
| `constants.K_DYN_PROSPECT_A_YE1.RB.foldK.2015` | 3.2 | 3.3 |
| `constants.K_DYN_PROSPECT_A_YE1.RB.foldK.2016` | 3.4 | 3.5 |
| `constants.K_DYN_PROSPECT_A_YE1.RB.foldK.2017` | 3.8 | 3.9 |
| `constants.K_DYN_PROSPECT_A_YE1.RB.foldK.2020` | 3.6 | 3.7 |
| `constants.K_DYN_PROSPECT_A_YE1.RB.foldK.2021` | 3.9 | 4 |
| `constants.K_DYN_PROSPECT_A_YE1.RB.foldK.2022` | 3.7 | 3.8 |
| `constants.K_DYN_PROSPECT_A_YE1.RB.foldK.2023` | 3.8 | 3.9 |
| `constants.K_DYN_PROSPECT_A_YE1.WR.kFit` | 3.6 | 3.7 |
| `constants.K_DYN_PROSPECT_A_YE1.WR.ci95` | [2.7,4.8] | [2.8,4.9] |
| `constants.K_DYN_PROSPECT_A_YE1.WR.foldK.2014` | 3.4 | 3.5 |
| `constants.K_DYN_PROSPECT_A_YE1.WR.foldK.2015` | 3.2 | 3.3 |
| `constants.K_DYN_PROSPECT_A_YE1.WR.foldK.2016` | 3.4 | 3.5 |
| `constants.K_DYN_PROSPECT_A_YE1.WR.foldK.2017` | 3.8 | 3.9 |
| `constants.K_DYN_PROSPECT_A_YE1.WR.foldK.2020` | 3.6 | 3.7 |
| `constants.K_DYN_PROSPECT_A_YE1.WR.foldK.2021` | 3.9 | 4 |
| `constants.K_DYN_PROSPECT_A_YE1.WR.foldK.2022` | 3.7 | 3.8 |
| `constants.K_DYN_PROSPECT_A_YE1.WR.foldK.2023` | 3.8 | 3.9 |
| `constants.K_DYN_PROSPECT_A_YE1.TE.kFit` | 3.6 | 3.7 |
| `constants.K_DYN_PROSPECT_A_YE1.TE.ci95` | [2.7,4.8] | [2.8,4.9] |
| `constants.K_DYN_PROSPECT_A_YE1.TE.foldK.2014` | 3.4 | 3.5 |
| `constants.K_DYN_PROSPECT_A_YE1.TE.foldK.2015` | 3.2 | 3.3 |
| `constants.K_DYN_PROSPECT_A_YE1.TE.foldK.2016` | 3.4 | 3.5 |
| `constants.K_DYN_PROSPECT_A_YE1.TE.foldK.2017` | 3.8 | 3.9 |
| `constants.K_DYN_PROSPECT_A_YE1.TE.foldK.2020` | 3.6 | 3.7 |
| `constants.K_DYN_PROSPECT_A_YE1.TE.foldK.2021` | 3.9 | 4 |
| `constants.K_DYN_PROSPECT_A_YE1.TE.foldK.2022` | 3.7 | 3.8 |
| `constants.K_DYN_PROSPECT_A_YE1.TE.foldK.2023` | 3.8 | 3.9 |

### Weeks and the QB start chain

Per-season weeks scored exactly vs ratio-scaled (the app would scale those weeks too; > 0.5% scaled in a season is a data-quality signal):

| season | rows | exact weeks | scaled weeks | scaled share | flag |
|---|---|---|---|---|---|
| 2012 | 1253 | 15652 | 0 | 0.000% |  |
| 2013 | 1572 | 19114 | 0 | 0.000% |  |
| 2014 | 1898 | 21962 | 0 | 0.000% |  |
| 2015 | 2083 | 23379 | 0 | 0.000% |  |
| 2016 | 2103 | 23427 | 0 | 0.000% |  |
| 2017 | 2121 | 23407 | 0 | 0.000% |  |
| 2018 | 2139 | 23424 | 0 | 0.000% |  |
| 2019 | 2146 | 23424 | 0 | 0.000% |  |
| 2020 | 2318 | 24276 | 0 | 0.000% |  |
| 2021 | 2814 | 25940 | 0 | 0.000% |  |
| 2022 | 2754 | 25826 | 0 | 0.000% |  |
| 2023 | 2745 | 25878 | 0 | 0.000% |  |
| 2024 | 2784 | 25944 | 0 | 0.000% |  |
| 2025 | 2800 | 25946 | 0 | 0.000% |  |

QB start-chain share distribution (median chain share per season; `half_ppr` = the committed 2026-10-07 panel, `league` = this run):

| season | half_ppr: incumbent / chain / stale / median share | league: incumbent / chain / stale / median share |
|---|---|---|
| 2014 | 31 / 39 / 6 / 0.1558 | 31 / 39 / 6 / 0.1558 |
| 2015 | 32 / 44 / 5 / 0.1558 | 32 / 44 / 5 / 0.1558 |
| 2016 | 32 / 46 / 5 / 0.1558 | 32 / 46 / 5 / 0.1345 |
| 2017 | 30 / 40 / 3 / 0.1558 | 30 / 40 / 3 / 0.1558 |
| 2018 | 32 / 42 / 5 / 0.1558 | 32 / 42 / 5 / 0.1534 |
| 2019 | 32 / 41 / 5 / 0.1558 | 32 / 41 / 5 / 0.1558 |
| 2020 | 32 / 43 / 7 / 0.1131 | 32 / 43 / 7 / 0.1131 |
| 2021 | 32 / 39 / 4 / 0.1558 | 32 / 39 / 4 / 0.1558 |
| 2022 | 32 / 40 / 4 / 0.1131 | 32 / 40 / 4 / 0.1131 |
| 2023 | 32 / 37 / 7 / 0.1558 | 32 / 37 / 7 / 0.1558 |
| 2024 | 32 / 36 / 6 / 0.1558 | 32 / 36 / 6 / 0.1558 |
| 2025 | 32 / 46 / 5 / 0.1131 | 32 / 46 / 5 / 0.1131 |

## G3 — R3-FIT transport (report-only; no exponent is activated; `--fit` still defaults to `half_ppr`)

| position | verdict half_ppr | verdict league | base half_ppr | base league | sensitivity half_ppr | sensitivity league | differs |
|---|---|---|---|---|---|---|---|
| QB | UNSTABLE | UNSTABLE | UNSTABLE | UNSTABLE | UNSTABLE | CLEARS | **yes** |
| RB | UNSTABLE | UNSTABLE | UNSTABLE | UNSTABLE | UNSTABLE | UNSTABLE | no |
| WR | UNSTABLE | UNSTABLE | UNSTABLE | UNSTABLE | UNSTABLE | UNSTABLE | no |
| TE | UNSTABLE | UNSTABLE | UNSTABLE | UNSTABLE | UNSTABLE | UNSTABLE | no |
| WRTE | UNSTABLE | UNSTABLE | UNSTABLE | UNSTABLE | UNSTABLE | UNSTABLE | no |

Fitted exponents (`wFinal`), half_ppr → league:

| position | exponents |
|---|---|
| QB | momentum 0.10 → 0.13; regression 0.69 → 0.77; trajectory -0.43 → -0.34; rzUsage 1.00 → 1.00 |
| RB | shareTrend 0.90 → 0.35; regression 1.61 → 1.61; momentum 0.72 → 0.97; trajectory 1.03 → 1.13; snapShare -0.28 → -0.78; rzUsage -1.60 → -1.33; teamRzShare -1.68 → -1.52 |
| WR | shareTrend 1.02 → 0.86; regression 1.98 → 1.69; momentum 1.09 → 1.16; trajectory 1.44 → 1.37; snapShare -3.34 → -3.49; rzUsage -0.17 → 0.05; teamRzShare -0.19 → -0.25 |
| TE | shareTrend 1.39 → 1.33; regression 1.93 → 1.84; momentum 0.68 → 0.68; trajectory 0.94 → 0.99; snapShare -1.97 → -2.06; rzUsage -0.65 → -0.38; teamRzShare -0.02 → -0.16 |
| WRTE | shareTrend 1.15 → 1.03; regression 1.95 → 1.75; momentum 0.93 → 0.98; trajectory 1.28 → 1.25; snapShare -2.86 → -3.02; rzUsage -0.32 → -0.07; teamRzShare -0.16 → -0.24 |

**Reproduce:** `node bin/backtest.mjs --league-basis --write` (about 3 min).
