# R2 Flip Gate Verdict — 2026-07-09

**Config:** predictor years 2020–2024, modes=`current-team`, `per-season-team`, basis=`custom`, ridge λ=1 (report sweep: 0.5, 1, 2)

**Reproduce:** `node bin/panel.mjs --flip-gate --write`

## Parity + QB canary

- Row parity: identical=true, n=1309, checked features: basePPG, consistencyCV, gamesPlayedY, intRate, momentum, rushYd, rzOwnRate, snapShare, tdRate, teamRzShare, ypa, ypt
- QB invariance: ΔMAE=0.000000000, ΔSpearman=0.000000000, pass=true

## Undercount repair (coverage.unattributedByYear, both modes)

| Year | current-team unattributed (this/prior) | per-season-team unattributed (this/prior) |
|---|---|---|
| 2020 | 0/409 | 0/0 |
| 2021 | 0/278 | 0/0 |
| 2022 | 0/639 | 0/0 |
| 2023 | 0/586 | 0/0 |
| 2024 | 0/544 | 0/0 |

## The attribution-sensitive cohort

Not the offseason-mover cohort the app's neutralization targets (forward movers team(Y+1)≠team(Y) — their panel features do not differ at all between modes, since attribution reads only Y and Y−1). The correct cohort is row-grain: rows whose own team-keyed feature window {Y−1, Y} spans more than one resolvable team (`historical-mover` ∪ `ym1-team-null`). Segment N per position (feature-level join):

| Position | Segment | n | mean |Δ| | p90 |Δ| | max |Δ| |
|---|---|---|---|---|---|
| WR | historical-mover | 105 | 0.0092 | 0.0229 | 0.0732 |
| WR | single-team | 357 | 0.0048 | 0.0124 | 0.0251 |
| WR | no-ym1-record | 95 | 0.0000 | 0.0000 | 0.0000 |
| WR | asymmetricImputationN | 0 | | | |
| RB | historical-mover | 64 | 0.0259 | 0.0555 | 0.4126 |
| RB | single-team | 217 | 0.0125 | 0.0358 | 0.0611 |
| RB | no-ym1-record | 52 | 0.0000 | 0.0000 | 0.0000 |
| RB | asymmetricImputationN | 0 | | | |
| TE | historical-mover | 43 | 0.0071 | 0.0176 | 0.1040 |
| TE | single-team | 198 | 0.0034 | 0.0089 | 0.0182 |
| TE | no-ym1-record | 26 | 0.0000 | 0.0000 | 0.0000 |
| TE | asymmetricImputationN | 0 | | | |

## Overall accuracy, before/after (all rows, per position)

| Position | MAE (current-team) | MAE (per-season) | ΔMAE | relΔMAE | Spearman (current-team) | Spearman (per-season) | ΔSpearman |
|---|---|---|---|---|---|---|---|
| WR | 2.693 (n=339) | 2.694 (n=339) | 0.001 | 0.0005 | 0.706 | 0.705 | -0.001 |
| RB | 3.258 (n=197) | 3.259 (n=197) | 0.001 | 0.0002 | 0.665 | 0.670 | 0.005 |
| TE | 2.384 (n=164) | 2.379 (n=164) | -0.005 | -0.0020 | 0.702 | 0.703 | 0.001 |

## Sensitive-cohort accuracy, before/after

### WR

- Sensitive cohort: n=69, ΔMAE=-0.004, relΔMAE=-0.0016, % rows improved=58.0
  - forwardMover=true (app-projection-path neutralized; dynasty-channel proxy): n=33, ΔMAE=0.001
  - forwardMover=false (app-realizable projection-path slice): n=36, ΔMAE=-0.009
- ym1-team-null (asymmetric imputation, §1.4): n=0, ΔMAE=n/a
- single-team (second-order denominator drift, contrast): n=213, ΔMAE=0.003

### RB

- Sensitive cohort: n=35, ΔMAE=-0.061, relΔMAE=-0.0241, % rows improved=45.7
  - forwardMover=true (app-projection-path neutralized; dynasty-channel proxy): n=10, ΔMAE=-0.012
  - forwardMover=false (app-realizable projection-path slice): n=25, ΔMAE=-0.081
- ym1-team-null (asymmetric imputation, §1.4): n=0, ΔMAE=n/a
- single-team (second-order denominator drift, contrast): n=129, ΔMAE=0.015

### TE

- Sensitive cohort: n=28, ΔMAE=-0.027, relΔMAE=-0.0099, % rows improved=64.3
  - **n < 30 — do not present this position's cohort delta as decisive (§2.4).**
  - forwardMover=true (app-projection-path neutralized; dynasty-channel proxy): n=9, ΔMAE=-0.060
  - forwardMover=false (app-realizable projection-path slice): n=19, ΔMAE=-0.011
- ym1-team-null (asymmetric imputation, §1.4): n=0, ΔMAE=n/a
- single-team (second-order denominator drift, contrast): n=119, ΔMAE=0.003

## Top 10 |predShift| rows (pooled sensitive cohort, eyeball audit)

| pid | team | year | pred (current-team) | pred (per-season) | actual | predShift |
|---|---|---|---|---|---|---|
| 2749 | MIA | 2022 | 11.674 | 12.314 | 18.013 | 0.640 |
| 3198 | BAL | 2024 | 18.671 | 18.206 | 17.868 | -0.465 |
| 4111 | CHI | 2023 | 9.217 | 8.783 | 3.468 | -0.435 |
| 3202 | LV | 2023 | 3.381 | 3.744 | 6.712 | 0.363 |
| 4034 | SF | 2022 | 18.890 | 19.252 | 24.691 | 0.362 |
| 4149 | NO | 2023 | 6.626 | 6.310 | 3.589 | -0.316 |
| 4111 | CAR | 2022 | 7.192 | 7.497 | 10.217 | 0.305 |
| 5850 | GB | 2024 | 15.639 | 15.345 | 15.423 | -0.294 |
| 4089 | LAC | 2022 | 7.515 | 7.776 | 7.773 | 0.261 |
| 4866 | PHI | 2024 | 19.926 | 19.692 | 14.519 | -0.234 |

## λ-sweep

| λ | ΔMAE WR | ΔMAE RB | ΔMAE TE | cohort ΔMAE |
|---|---|---|---|---|
| 0.5 | 0.001 | 0.002 | -0.005 | -0.024 |
| 1 | 0.001 | 0.001 | -0.005 | -0.024 |
| 2 | 0.001 | -0.001 | -0.003 | -0.023 |

## Verdict

**FLIP-CLEARS**

The data-side gate clears; the app-side activation slice may proceed (see .claude/tasks/r2-flip-gate.md §11).

## Methodology notes

- Age-blindness — reduced relevance here: the E-0a baseline is age-blind, and candidate CLEARS verdicts there are correctly held provisional-pending-age (a candidate can proxy age). That discount does not transfer to this verdict: this is a within-panel A/B where both arms are equally age-blind, and age does not change which team a past season belongs to — attribution accuracy and the age omission are orthogonal.
- **Non-independence:** recurring players across Y→Y+1 pairs → rows are not independent; deltas are effect-size estimates, not significance tests.
- **Survivorship:** outcome gate `gamesPlayed(Y+1) ≥ 6` — the standard backtest survivorship caveat applies.
- **Neutralization stance:** The panel applies no mover-specific zeroing in either mode — the only neutral-imputation is structural (`share(Y−1)` null → `shareTrend = 0`), and the `shareTrend` code path is mode-blind (only `teamOf` differs). Identical treatment between the two arms is therefore satisfied by code path, vacuously. Forward-mover masking — the app-style zeroing this gate deliberately does not add to either arm — is handled honestly by segmentation (the forwardMover split below), not by modifying the features.
- **C4 discipline:** unchanged and unthreatened — both modes compute every rate as a ratio of summed season components; nothing in this slice averages per-game values.
- This verdict recommends; the flip itself is a separate app-repo activation commit gated on it.
