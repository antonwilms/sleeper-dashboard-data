# Grading anchor policy — rookie mechanism-version segmentation

**Not to be confused with `.claude/tasks/anchor-policy.md`**, which is the registry
line-anchor policy (how `docs/cross-repo-registry.md`/`README.md` entries anchor to source
line numbers). This file is about a different kind of anchor entirely: which captured
snapshot rows are safe to compare against which grading run, given that the app's rookie
projection has changed mechanism three times.

D-15 (rookie-mirror.md §1.1, §6.6).

## The rule: segment, never pool, across a model-change boundary

A forward-grading run that pools rows captured under different rookie mechanisms measures
the mechanism change, not the model. Any grading run that includes rookie-path rows must
segment by mechanism version before comparing predictor performance across dates.

## Row-level detection is authoritative

Per D-15's own reasoning, detect a row's mechanism version from the row itself, never from a
date-to-version lookup table:

- `factors.rookieCalibrationBasis` present → calibration mechanism is live for this row.
- `factors.rookieGamesBasis` present → games-ladder mechanism is live for this row.
- `factors.rookieCeilingBasis` present, plus `rookieCeilingKnee`/`rookieCeilingAsymptote` →
  ceiling mechanism is live for this row.

A row carrying none of these three fields predates all three mechanisms.

## The date table is the cross-check, not the rule

Three model changes, verified against the actually-committed app files (not inherited from
an earlier draft of this policy):

| commit | date (UTC) | mechanism |
|---|---|---|
| `f07d9be` | 2026-09-09 14:54 | calibration |
| `ed027c7` | 2026-09-11 08:01 | games ladder |
| `41f277e` | 2026-09-12 09:23 | ceiling |

Captures land at 16:29 UTC daily (`daily-snapshot.yml`) against app `main`.

**Expected segments**, verified against the actually-committed snapshot files:

| capture date | expected mechanisms |
|---|---|
| `<= 2026-09-08` | none — confirmed: no rookie row in `snapshots/2026-09-08.json` (285 rookie-path rows) carries `rookieCalibrationBasis`, `rookieGamesBasis` or `rookieCeilingBasis`; every one is flat `projectedGames: 14` |
| `2026-09-09` – `2026-09-10` | calibration only — confirmed: `rookieCalibrationBasis` present across both files' rookie rows (287 / 291), `rookieGamesBasis`/`rookieCeilingBasis` absent from all of them, `projectedGames` still flat 14 everywhere |
| `2026-09-11` | calibration + games — confirmed: `rookieCalibrationBasis` and `rookieGamesBasis` both present (291 rookie rows), `projectedGames` no longer flat 14 on every row, `rookieCeilingBasis` still absent from all of them |
| `>= 2026-09-12` | all three — the first automated capture with all three is `2026-09-12` (app `41f277e` committed 2026-09-12 09:23 UTC, before the day's 16:29 UTC capture; rookie-mirror.md §0 C1). Not yet captured as of this slice — see rookie-mirror.md §4.4/§11 |

## Veteran-path rows are unaffected

All three boundaries above are rookie-path only. A veteran-path row (one with qualifying
prior seasons) carries none of `rookieCalibrationBasis`/`rookieGamesBasis`/`rookieCeilingBasis`
regardless of capture date, and needs no segmentation on this axis.

## Why this is written now, not at the first forward grade

Writing this policy with a stale two-date list would be worse than not writing it at all
(D-15) — a reader would trust a table that is quietly missing the third boundary. The third
date exists as of `41f277e`, so the table above is complete as of this slice.
