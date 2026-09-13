# Grading anchor policy — mechanism-version segmentation

**Not to be confused with `.claude/tasks/anchor-policy.md`**, which is the registry
line-anchor policy. This file is about which captured snapshot rows are safe to compare
against which grading run, given that the app's projection mechanism has changed four times on the axes this file
tracks — three on the rookie path, one on the veteran path (the Step 4 up-side). Earlier
snapshot-schema and factor-set changes (`schemaVersion` 1→2→3; the veteran factor set
widening on 2026-06-06) are out of this file's scope.

D-15 (rookie-mirror.md §1.1, §6.6); D-18 (step4-boundary-parity.md §4.1).

## The rule: segment, never pool, across a model-change boundary

A forward-grading run that pools rows captured under different mechanisms measures the
mechanism change, not the model. Segment by mechanism version, per projection path, before
comparing predictor performance across capture dates.

## Row-level detection is authoritative

Detect a row's mechanism version from the row itself, never from a date-to-version lookup
table. **Scope to the path first**: a key's absence carries meaning only on the path that
can carry it.

### Rookie path — `projection.confidence === 'rookie'`

- `factors.rookieCalibrationBasis` present → calibration mechanism is live for this row.
- `factors.rookieGamesBasis` present → games-ladder mechanism is live for this row.
- `factors.rookieCeilingBasis` present, plus `rookieCeilingKnee`/`rookieCeilingAsymptote` →
  ceiling mechanism is live for this row.

A rookie-path row carrying none of these three predates all three mechanisms.

### Veteran path — `projection.confidence !== 'rookie'`

This axis can only be read on captures whose veteran rows carry `factors.regressionFactorRaw`,
which is every capture from 2026-06-06 on. Veteran rows in earlier captures carry
`regressionFactor` alone (no `regressionFactorRaw`, no `consistency*`), so they are
**unclassified on this axis, not legacy**.

- `factors.regressionUpsideBasis` present → captured under the step4-upside model.
- Absent, on a veteran row that carries `regressionFactorRaw` → captured under the legacy Step 4 table.
- For rows that fired, the value names the position and the outcome: `removed:RB`,
  `removed:WR`, `removed:TE` (up-side not applied) or `retained:QB` (applied). `none` means
  the up-side branch was not reached.
- Classify by `regressionUpsideBasis`, never by `outlierRatio` — it is captured at 3 dp and
  can round across a threshold.

Why the scope comes first: rookie-path rows never carry `regressionUpsideBasis` on either
side of the boundary, so a presence-only rule would put every post-boundary rookie row in
the legacy segment.

Executable check: `test/step4-mirror.test.mjs` T-S4-3 asserts this rule on the committed
captures either side of boundary 4.

## The date table is the cross-check, not the rule

Four model changes on the two tracked axes, verified against the actually-committed app files:

| # | commit | date (UTC) | path | mechanism |
|---|---|---|---|---|
| 1 | `f07d9be` | 2026-09-09 14:54 | rookie | calibration |
| 2 | `ed027c7` | 2026-09-11 08:01 | rookie | games ladder |
| 3 | `41f277e` | 2026-09-12 09:23 | rookie | ceiling |
| 4 | `7b5b055` | 2026-09-12 22:27 | veteran | step4-upside (RB/WR/TE up-side removed, QB retained) |

Scheduled captures (`daily-snapshot.yml`) trigger at 16:29 UTC against app `main` but can
start hours late — `snapshots/2026-09-12.json` has `capturedAt` 18:34:49 UTC. Cross-check a
commit against a capture's `capturedAt`, never against the cron time: a capture can reflect
a commit only if its `capturedAt` is after the commit time. Boundary 4 was committed after
the 2026-09-12 capture, so the first capture reflecting it is a later one.

**Expected segments — rookie path**, verified against the committed snapshot files:

| capture date | expected mechanisms |
|---|---|
| `<= 2026-09-08` | none — confirmed: no rookie row in `snapshots/2026-09-08.json` (285 rookie-path rows) carries `rookieCalibrationBasis`, `rookieGamesBasis` or `rookieCeilingBasis`; every one is flat `projectedGames: 14` |
| `2026-09-09` – `2026-09-10` | calibration only — confirmed: `rookieCalibrationBasis` present across both files' rookie rows (287 / 291), `rookieGamesBasis`/`rookieCeilingBasis` absent from all of them, `projectedGames` still flat 14 everywhere |
| `2026-09-11` | calibration + games — confirmed: `rookieCalibrationBasis` and `rookieGamesBasis` both present (291 rookie rows), `projectedGames` no longer flat 14 on every row, `rookieCeilingBasis` still absent from all of them |
| `>= 2026-09-12` | all three — confirmed: all 291 rookie-path rows in `snapshots/2026-09-12.json` carry `rookieCalibrationBasis`, `rookieGamesBasis` and `rookieCeilingBasis` |

**Expected segments — veteran path**, verified against the committed snapshot files:

| capture date | expected Step 4 model |
|---|---|
| `2026-05-19` (the only capture before 2026-06-06) | unclassified on this axis — confirmed: the 428 veteran rows in `snapshots/2026-05-19.json` carry `regressionFactor` but no `regressionFactorRaw` or `consistency*`, so the Step 4 table they were produced under cannot be read from the row |
| `2026-06-06` – `2026-09-12` | legacy — confirmed: every veteran row in these 59 captures carries `regressionFactorRaw` and none carries `regressionUpsideBasis`; `snapshots/2026-09-12.json` (captured 18:34:49 UTC, before `7b5b055`) has 421 veteran rows, 170 of them at an up-side `regressionFactorRaw` (107 × 1.12, 63 × 1.05). The poisoned 2026-07-16 → 2026-07-18 window sits inside this segment and is excluded on its own axis (`CLAUDE.md`) |
| `>= 2026-09-13` | step4-upside — confirmed: all 422 veteran rows in `snapshots/2026-09-13.json` (captured 18:52:36 UTC) carry `regressionUpsideBasis` (none 252 · removed:RB 34 · removed:WR 73 · removed:TE 52 · retained:QB 11), no rookie-path row carries it, and between the 2026-09-12 and 2026-09-13 captures the veteran rows whose `regressionFactorRaw` moved are exactly the 159 `removed:` rows |

## Boundaries by path

Rookie boundaries 1–3 are rookie-path only. Boundary 4 is veteran-path only, affects only
rows whose basis starts `removed:`, and a pooled veteran grade spanning it measures the
mechanism change.

## Why this is written now, not at the first forward grade

Writing this policy with a stale date list is worse than not writing it at all (D-15) — a
reader would trust a table quietly missing a boundary. Boundary 4 exists as of `7b5b055`,
so the table above is complete, for the rookie mechanisms and the Step 4 up-side axis, as of D-18.
