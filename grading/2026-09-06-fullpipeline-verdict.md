# Full-Pipeline Verdict — 2026-09-06

**Grade a historical reconstruction of the veteran pipeline, faithful in nine of thirteen steps, with three live-state divergences quantified (teamOffense, age, depth) and one step ungradable (qbQuality).**

**Config:** predictor years 2013–2024, history floor 2012, attribution=`per-season-team (teamOffense alone reconstructed under current-team — Fix pass 1 item 1)`, basis=`half_ppr`

**Baseline of record:** grading/2026-08-08-e0a-verdict.md

**Reproduce:** `node bin/panel.mjs --fullpipeline --write`

## Sensitivity check (Decision section) — run BEFORE any other output

| Position | Full-stack median ratio | Held-at-1 (teamOffense/age/depth) median ratio | |Δ| | Pass (≤0.02) |
|---|---|---|---|---|
| QB | 0.882 (n=300) | 0.933 (n=300) | 0.0516 | NO |
| RB | 0.912 (n=588) | 0.884 (n=588) | 0.0283 | NO |
| WR | 0.856 (n=1039) | 0.866 (n=1039) | 0.0098 | YES |
| TE | 0.846 (n=522) | 0.875 (n=522) | 0.0289 | NO |

## STOPPED

Sensitivity check FAILED: the full-stack and held-at-one (teamOffense/age/depth held at 1.0) optimism constants diverge by more than one sweep step (0.02) for at least one position. Per the Decision section, this means the three live-state factors are SHIFTING the aggregate rather than shuffling it — the structural argument for publishing calibration constants does not hold. §D (calibration outputs) and §E's factor-pruning ablation are NOT produced. Step 4 and the rookie panel are unaffected and are reported below — the slice narrows to the steps that can be reconstructed faithfully.

## §E — Step 4 verdict (unaffected by the stop — reconstructs from PPG history alone)

### QB

Overall (n=300): shipped MAE=3.849, no-upside MAE=3.858, ΔMAE=0.009, ΔSpearman=-0.005
Injury-gated proxy (dnpWeeks≥3, n=60): shipped MAE=4.219, no-upside MAE=4.269, ΔMAE=0.050, ΔSpearman=-0.007
### RB

Overall (n=588): shipped MAE=3.362, no-upside MAE=3.343, ΔMAE=-0.019, ΔSpearman=0.002
Injury-gated proxy (dnpWeeks≥3, n=103): shipped MAE=3.423, no-upside MAE=3.386, ΔMAE=-0.037, ΔSpearman=0.003
### WR

Overall (n=1039): shipped MAE=2.870, no-upside MAE=2.837, ΔMAE=-0.033, ΔSpearman=0.004
Injury-gated proxy (dnpWeeks≥3, n=163): shipped MAE=3.239, no-upside MAE=3.218, ΔMAE=-0.021, ΔSpearman=-0.001
### TE

Overall (n=522): shipped MAE=2.154, no-upside MAE=2.142, ΔMAE=-0.012, ΔSpearman=-0.000
Injury-gated proxy (dnpWeeks≥3, n=71): shipped MAE=2.423, no-upside MAE=2.397, ΔMAE=-0.026, ΔSpearman=-0.009

## Rookie panel (unaffected by the stop — an entirely separate reconstruction)

- Assembled: 2563, surviving (outcome gate met): 1056, drops: {"noOutcome":1507}
- Hit the 1.85 cap: 0/1056 (0.0%)

| Draft tier | Position | n | mean realised PPG | mean projected PPG | ratio (realised/projected) |
|---|---|---|---|---|---|
| r1-late | QB | 6 | 13.8 | 13.6 | 1.02 |
| r1-late | RB | 7 | 9.8 | 9.6 | 1.02 |
| r1-late | TE | 7 | 7.0 | 5.0 | 1.41 |
| r1-late | WR | 27 | 8.4 | 7.5 | 1.11 |
| r1-mid | QB | 8 | 15.7 | 14.8 | 1.07 |
| r1-mid | RB | 3 | 16.1 | 11.1 | 1.45 |
| r1-mid | TE | 2 | 9.8 | 6.0 | 1.63 |
| r1-mid | WR | 11 | 9.5 | 8.2 | 1.15 |
| r2 | QB | 10 | 13.7 | 11.5 | 1.19 |
| r2 | RB | 22 | 11.7 | 8.7 | 1.34 |
| r2 | TE | 22 | 5.1 | 4.6 | 1.12 |
| r2 | WR | 53 | 7.3 | 6.7 | 1.09 |
| r3 | QB | 11 | 10.6 | 9.2 | 1.15 |
| r3 | RB | 33 | 9.1 | 7.5 | 1.22 |
| r3 | TE | 24 | 4.0 | 4.0 | 1.02 |
| r3 | WR | 45 | 5.8 | 5.7 | 1.03 |
| r4 | QB | 14 | 9.8 | 8.5 | 1.15 |
| r4 | RB | 39 | 4.8 | 6.7 | 0.72 |
| r4 | TE | 32 | 3.0 | 3.6 | 0.85 |
| r4 | WR | 31 | 3.9 | 5.1 | 0.77 |
| r5 | QB | 8 | 6.4 | 8.1 | 0.79 |
| r5 | RB | 34 | 5.9 | 6.0 | 0.99 |
| r5 | TE | 22 | 2.2 | 3.3 | 0.67 |
| r5 | WR | 34 | 4.3 | 4.6 | 0.93 |
| r6 | QB | 6 | 9.3 | 7.6 | 1.23 |
| r6 | RB | 30 | 3.5 | 5.4 | 0.64 |
| r6 | TE | 18 | 2.0 | 2.8 | 0.73 |
| r6 | WR | 34 | 3.4 | 4.3 | 0.79 |
| r7 | QB | 3 | 10.6 | 6.9 | 1.54 |
| r7 | RB | 13 | 4.8 | 5.2 | 0.92 |
| r7 | TE | 11 | 0.7 | 2.7 | 0.26 |
| r7 | WR | 29 | 2.4 | 3.9 | 0.61 |
| top-3 | QB | 17 | 17.7 | 16.9 | 1.05 |
| top-3 | RB | 1 | 16.7 | 13.5 | 1.24 |
| top-8 | QB | 6 | 16.2 | 15.8 | 1.03 |
| top-8 | RB | 4 | 17.9 | 11.9 | 1.49 |
| top-8 | TE | 2 | 7.5 | 6.5 | 1.15 |
| top-8 | WR | 11 | 10.0 | 8.8 | 1.13 |
| unmatched | QB | 14 | 8.7 | 13.0 | 0.67 |
| unmatched | RB | 101 | 2.8 | 8.6 | 0.33 |
| unmatched | TE | 101 | 1.3 | 4.6 | 0.28 |
| unmatched | WR | 150 | 2.4 | 6.7 | 0.36 |

Top projected rookie: pid 2306 (QB, 2015), projected 19.4 PPG, finished ranked 2 of 7 at position that class-year (realised 16.5 PPG).
