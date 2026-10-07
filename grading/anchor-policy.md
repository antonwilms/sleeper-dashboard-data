# Grading anchor policy — mechanism-version segmentation

**Not to be confused with `.claude/tasks/anchor-policy.md`**, which is the registry
line-anchor policy. This file is about which captured snapshot rows are safe to compare
against which grading run, given that the app's projection mechanism has changed seven times on the axes this file
tracks — three on the rookie path, one on the veteran path (the Step 4 up-side), one on QB rows of both paths (the
start share), one on rookie QB rows
(the rookie starter level), and once through a data correction rather than app code (the absence classification of served `weeklyStatus`). Earlier
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

Seven changes on the five tracked axes, verified against the actually-committed app files (row 7: the data commit):

| # | commit | date (UTC) | path | mechanism |
|---|---|---|---|---|
| 1 | `f07d9be` | 2026-09-09 14:54 | rookie | calibration |
| 2 | `ed027c7` | 2026-09-11 08:01 | rookie | games ladder |
| 3 | `41f277e` | 2026-09-12 09:23 | rookie | ceiling |
| 4 | `7b5b055` | 2026-09-12 22:27 | veteran | step4-upside (RB/WR/TE up-side removed, QB retained) |
| 5 | `c7a5d84` (Stage A; the model is live only once the Stage B commits ship with it) | 2026-10-04 01:04 (the **app push**, `00c0946..c53db19`); captures check out app `main`, and the push follows commits 2–3, so the Stage A commit time would be too early | both (QB rows) | qb-takeover start share |
| 6 | `f97080a` (the model is live once the push lands; captures check out app `main`) | 2026-10-04 13:43 (the **app push**, `422fcfb..cec846d`, which also carried P11's seam fix `c804ada` — no projection-output change) | rookie (QB rows, yearsExp 0) | rookie QB starter level |
| 7 | data `c7cfcc7` (an input correction — no app commit; was `8b95519` before the push-time rebase) | 2026-10-07 06:50 (the **data push**, `0b41c62..3097397`; CDN purge of all eleven files verified 12/12 immediately after) | veteran (QB/RB/WR/TE) | absence classification (served 'D', CR-28) |

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

### QB rows — both paths

`factors.qbTakeoverBasis` present → captured under the qb-takeover model. Every row carries it from
boundary 5 on (`'none'` on non-QBs, so non-QB rows are unaffected by this axis). Absent on a QB row →
captured under the legacy flat depth factor (0.88 for order 2, 0.68 for order ≥ 3). On a QB row:

- `'chain'` → `projectedPPG = qbStarterPPG × qbStartShare` — **expected points per team game, not per
  game played**; grade it on total points or segment it. `projectedTotalPts = qbStarterPPG × qbStartShare × 17`
  (starter PPG × expected starts), so grading on total points is well-scaled for these rows.
- `'not-evaluated'`, `'no-team'`, `'no-chart'` at order ≥ 2 → depth factor 1.00 where the legacy model had 0.88/0.68.
- `'incumbent'` and `'stale'` → unchanged from legacy.

**Expected segments — QB rows**, a rule and not a date: the first capture whose `capturedAt` is after the
app push of boundary 5 reflects it, and every earlier capture is legacy on this axis.

| capture date | expected QB start-share model |
|---|---|
| `< first capture after the app push` | legacy — no QB row carries `qbTakeoverBasis` — confirmed on `snapshots/2026-10-03.json` (19:20:24 UTC; 737 rows, none carry it) |
| `>= first capture after the app push` | qb-takeover — confirmed: all 738 rows in `snapshots/2026-10-04.json` (captured 19:45:05 UTC) carry `qbTakeoverBasis` (`chain` 54 · `incumbent` 32 · `stale` 20 · `none` 632) |

Boundary 6 was pushed 12 h 39 min later, before the next capture, so no capture reflects boundary 5
without boundary 6.

### Rookie QB rows — boundary 6

`factors.qbStarterBasis` present → captured under the rookie-starter-level model; every row carries it from
boundary 6 on (`null` on non-QBs). On a rookie-path QB row (`projection.confidence === 'rookie'`):

- `'rookie:top12'`, `'rookie:r1'`, `'rookie:day2'`, `'rookie:day3+'` → `qbStarterPPG` = the pinned rookie starter
  level (`backtests/2026-10-04-qb-rookie-level-constants.json` `starterPPG`, half-PPR) × `rookieBasisScale`. If
  `qbTakeoverBasis` is `'chain'`, `projectedPPG` and `projectedTotalPts` move with it (boundary 5's identities on
  the new `qbStarterPPG`); otherwise `projectedPPG` is unchanged from boundary 5. `inSeason.next.prior` and
  `inSeason.start.starterPrior` read this level.
- `'projection'` → unchanged from boundary 5.
- Absent on a rookie-path QB row → pre-boundary: `qbStarterPPG` is the rookie-path level.

Veteran-path rows carry `'projection'`/`null` only; nothing on that path moved.

**Expected segments — rookie QB rows**, a rule and not a date: the first capture whose `capturedAt` is after the
app push of boundary 6 reflects it; every earlier capture is pre-boundary on this axis.

| capture date | expected rookie QB starter level |
|---|---|
| `< first capture after the app push` | rookie-path level — no row carries `qbStarterBasis` — confirmed on `snapshots/2026-10-03.json` (19:20:24 UTC; 737 rows, none carry it) |
| `>= first capture after the app push` | pinned group level — confirmed: every row in `snapshots/2026-10-04.json` carries `qbStarterBasis` (`'projection'` 89 · `'rookie:day3+'` 13 · `'rookie:day2'` 2 · `'rookie:r1'` 1 · `'rookie:top12'` 1 · `null` 632), and each `'rookie:*'` row's `qbStarterPPG` equals the pinned level × `rookieBasisScale` to 3 dp (17 rows) |

### Veteran rows — boundary 7 (input correction)

Unlike boundaries 1–6, this one is a **served-data correction**, not an app-code change: the app reads
`nfl/season-totals/<year>.json` through the CDN, so a veteran row's `projectedGames`, `projectedTotalPts`,
`injurySeasons` and `absenceShapeFactor` moved on the push with no app commit.

- **Not row-detectable.** No factor names the season-totals version, and `inputStatus.careerStats` carries
  per-season provenance, not `lastModified`.
- **Segment by capture.** Captures with `capturedAt` before the data push are legacy on this axis. Captures
  from the first daily capture after the push **and** its CDN purge are corrected.
- **Cross-check (to be confirmed).** For Stage B's 2026 impact movers
  (`grading/2026-10-06-absence-verdict.md`), the first post-push capture's `projection.projectedGames` and
  `factors.injurySeasons` must equal the verdict's "after" values. To be confirmed once that capture exists,
  as boundaries 5 and 6 were.

## Boundaries by path

Rookie boundaries 1–3 are rookie-path only. Boundary 4 is veteran-path only, affects only
rows whose basis starts `removed:`, and a pooled veteran grade spanning it measures the
mechanism change. Boundary 5 is QB-only on both paths; it moves only QB rows whose `qbTakeoverBasis`
is not `incumbent`/`stale`, and a pooled QB grade spanning it measures the mechanism change. Boundary 6 is rookie-QB-only (`yearsExp` 0 with known draft capital); it moves
`qbStarterPPG` on those rows and `projectedPPG`/`projectedTotalPts` only on their `chain` rows, and a pooled rookie QB
grade spanning it measures the mechanism change. Boundary 7 moves veteran rows' `projectedGames`,
`projectedTotalPts`, `injurySeasons` and `absenceShapeFactor`, and `projectedPPG` only on bounce-back flips; a pooled
veteran games grade spanning it measures the correction.

## Why this is written now, not at the first forward grade

Writing this policy with a stale date list is worse than not writing it at all (D-15) — a
reader would trust a table quietly missing a boundary. Boundary 4 exists as of `7b5b055`,
boundary 5 as of the qb-takeover-wiring push and boundary 6 as of the rookie-qb-starter-level push, so the table above is complete,
for the rookie mechanisms, the Step 4 up-side axis, the QB start-share axis and the rookie QB starter level, as of
rookie-qb-starter-level, plus boundary 7 as of absence-classification.
