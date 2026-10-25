# Grading anchor policy — mechanism-version segmentation

**Not to be confused with `.claude/tasks/anchor-policy.md`**, which is the registry
line-anchor policy. This file is about which captured snapshot rows are safe to compare
against which grading run, given that the app's projection mechanism has changed twelve times on the axes this file
tracks — three on the rookie path, one on the veteran path (the Step 4 up-side), one on every row of both paths (the
scoring basis: the load-time season rescore, boundary 4a), one on QB rows of both paths (the
start share), one on rookie QB rows
(the rookie starter level), twice through a data correction rather than app code (the absence classification of served `weeklyStatus`, then its role-week demotion), once on the veteran path (the short-season games rule), once on the rookie path's season total (the total-points factor), and once on the rookie path through an app-side join correction (the KTC / draft / college id joins). Earlier
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
- `factors.rookieTotalBasis` present → the total-points factor is live (boundary 9).

A rookie-path row carrying none of these four keys predates all four mechanisms.

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

Twelve changes on nine tracked axes (row 11 is filled at release), verified against the actually-committed app files (row 7: the data commit):

| # | commit | date (UTC) | path | mechanism |
|---|---|---|---|---|
| 1 | `f07d9be` | 2026-09-09 14:54 | rookie | calibration |
| 2 | `ed027c7` | 2026-09-11 08:01 | rookie | games ladder |
| 3 | `41f277e` | 2026-09-12 09:23 | rookie | ceiling |
| 4 | `7b5b055` | 2026-09-12 22:27 | veteran | step4-upside (RB/WR/TE up-side removed, QB retained) |
| 4a | app `47af353` + fix pass `38acc39` (the fix pass touched backlog text and tests only — no projection-output change; the model is live once the push lands; captures check out app `main`) | 2026-09-25, the **app push**, which git does not record: pushed after 19:21:51 UTC (`38acc39`), before 20:05:54 UTC (the first league capture, `snapshots/2026-09-25.json`) | both | season rescore — the league scoring basis (every season row rescored at load; `positionBasisScale` on the rookie constants) |
| 5 | `c7a5d84` (Stage A; the model is live only once the Stage B commits ship with it) | 2026-10-04 01:04 (the **app push**, `00c0946..c53db19`); captures check out app `main`, and the push follows commits 2–3, so the Stage A commit time would be too early | both (QB rows) | qb-takeover start share |
| 6 | `f97080a` (the model is live once the push lands; captures check out app `main`) | 2026-10-04 13:43 (the **app push**, `422fcfb..cec846d`, which also carried P11's seam fix `c804ada` — no projection-output change) | rookie (QB rows, yearsExp 0) | rookie QB starter level |
| 7 | data `c7cfcc7` (an input correction — no app commit; was `8b95519` before the push-time rebase) | 2026-10-07 06:50 (the **data push**, `0b41c62..3097397`; CDN purge of all eleven files verified 12/12 immediately after) | veteran (QB/RB/WR/TE) | absence classification (served 'D', CR-28) |
| 8 | `e3de164` (B1, the model commit; the model is live once the push lands; captures check out app `main`) | 2026-10-10 12:45:38 (the **app push**, `ac26e0b..98a8a69`) | veteran (QB/RB/WR/TE) | short-season games rule (L6c) |
| 9 | `26de86c` (the model is live once the push lands; captures check out app `main`) | 2026-10-13 10:51 (the **app push**, `6b725e6..e9414f8`) | rookie (RB/WR/TE, day-3/undrafted) | total-points factor (D-13) |
| 10 | data `76b5ddf` + app `c39f8b4` (a served-data correction with its model pin: `PRIOR_MODEL_FROM` in the app commit) | 2026-10-23 12:38:58 UTC (the **data push**, `6971064..3041353`) · app push 2026-10-23 12:43:20 UTC (`11c2b53..3ec9298`) · CDN purge of the nine rewritten/regenerated paths verified 9/9 (exit 0, 12:41 UTC, before the app push) | veteran (QB/RB/WR/TE) | absence role — role weeks 'D' → 'X' in served `weeklyStatus` (D-76, CR-28) |
| 11 | _TBD at release (§9.4 of `join-defects-id-crosswalk.md`):_ app `<release SHA>` | _TBD at release:_ `<push time> UTC` (the **app push**, `<range>`) | rookie (QB/RB/WR/TE) | ID-first joins (KTC alias, draft id, college id) — CR-31 |

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
| `>= first capture after the app push` | + total-points factor — confirmed (D-70): all 311 rookie-path rows in `snapshots/2026-10-13.json` (captured 21:24:51 UTC, `projectionModelFrom` `2026-10-14`) carry `rookieTotalFactor`/`rookieTotalBasis` (day3:RB 33 · day3:TE 19 · day3:WR 36 · undrafted:RB 34 · undrafted:TE 25 · undrafted:WR 59 · none 105); every factor < 1 is 0.796 on a day-3 or 0.835 on an undrafted RB/WR/TE, none on a `chain` row, and each such row's `projectedTotalPts` equals `projectedPPG` × `projectedGames` × factor within the PPG rounding; none of the 439 veteran rows carries the keys |

**Expected segments — veteran path**, verified against the committed snapshot files:

| capture date | expected Step 4 model |
|---|---|
| `2026-05-19` (the only capture before 2026-06-06) | unclassified on this axis — confirmed: the 428 veteran rows in `snapshots/2026-05-19.json` carry `regressionFactor` but no `regressionFactorRaw` or `consistency*`, so the Step 4 table they were produced under cannot be read from the row |
| `2026-06-06` – `2026-09-12` | legacy — confirmed: every veteran row in these 59 captures carries `regressionFactorRaw` and none carries `regressionUpsideBasis`; `snapshots/2026-09-12.json` (captured 18:34:49 UTC, before `7b5b055`) has 421 veteran rows, 170 of them at an up-side `regressionFactorRaw` (107 × 1.12, 63 × 1.05). The poisoned 2026-07-16 → 2026-07-18 window sits inside this segment and is excluded on its own axis (`CLAUDE.md`) |
| `>= 2026-09-13` | step4-upside — confirmed: all 422 veteran rows in `snapshots/2026-09-13.json` (captured 18:52:36 UTC) carry `regressionUpsideBasis` (none 252 · removed:RB 34 · removed:WR 73 · removed:TE 52 · retained:QB 11), no rookie-path row carries it, and between the 2026-09-12 and 2026-09-13 captures the veteran rows whose `regressionFactorRaw` moved are exactly the 159 `removed:` rows |

### Both paths — boundary 4a (scoring basis)

**Row-detectable from the envelope**, not from a factor: `projectionBasis` `'league'` → league basis; absent or `'half_ppr'` →
half-PPR; `'mixed'` / `'unknown'` → unclassified (no model reproduces it). A per-season `live-api` provenance in `inputStatus`
was league-scored even before the boundary (CR-01), which is why the envelope field and not the provenance decides. Rookie-path rows
also carry `factors.rookieBasisScale` (the `positionBasisScale` the rookie baseline, ceiling knee/asymptote and QB starter level were
multiplied by); its absence on a rookie row is a pre-boundary capture.

- It moves **every** `projectedPPG` and `projectedTotalPts` on both paths (rows on the half-PPR basis become league-basis rows;
  on the rookie path the constants also scale), so **any pooled grade spanning it measures the basis change, not the model**.
  Grade each side against outcomes in its own basis (D-44's segmentation); D-44 stays open for the grader change.
- **Cross-check — confirmed (D-46, `grading/2026-10-16-league-basis-verdict.md` G1c).** The `half_ppr` model of
  `lib/leagueBasis.mjs` reproduces every scale-dependent rookie field (`basePPG`, the ceiling input, knee/asymptote, the ceiled level
  and total) of all 302 rookie rows of `snapshots/2026-09-24.json` (no `projectionBasis`; 0 mismatches) and fails on them under
  `league` (938); on `snapshots/2026-09-25.json` (first `projectionBasis: 'league'`) the `league` model matches all 302 (0) and
  `half_ppr` fails (956).

Executable check: `test/rookie-mirror.test.mjs` T-RM16 (the 310 rookie rows of 2026-10-14, exact under `league`, the "before" counts under
`half_ppr` pinned) and `test/panel-fit.test.mjs` T-F10L (the 436 veteran `basePPG` exact under league rows, 11 under half-PPR).

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

Executable check: `test/qb-mirror.test.mjs` T-QB-2 (depth factor, both sides of the boundary, 58 veteran QB rows
each) and T-QB-3 (the 54 `chain` shares to 4 dp on `snapshots/2026-10-04.json`).

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

Executable check: `test/qb-mirror.test.mjs` T-QB-4 (`QB_ROOKIE_STARTER_PPG` equals the pinned file; the 17 `rookie:<group>` rows of `snapshots/2026-10-04.json` carry the level × `rookieBasisScale`).

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
- **Cross-check — confirmed (D-68).** `snapshots/2026-10-06.json` (21:07:01 UTC, before the 2026-10-07 06:50 UTC push)
  carries the "before" `projectedGames` and `factors.injurySeasons` of all 15 movers in
  `grading/2026-10-06-absence-verdict.md` §5; `snapshots/2026-10-07.json` (21:39:01 UTC, the first capture after the
  push and its purge) carries their "after" values on all 15. Between the two, exactly 35 rows change `projectedGames`
  (the verdict's 35, none rookie-path), 19 change `injurySeasons`, 63 change `absenceShapeFactor`, and one flips
  `isBounceBack` off→on (`4972`, the verdict's one flip). The 2026-10-08 and 2026-10-09 captures hold the same values.

### Veteran rows — boundary 8 (short-season rule)

Row-detectable through `factors.shortSeasonState`. Absent means pre-boundary.

- `'qual'` rows are unchanged.
- On `'short'`/`'none'` rows, `projectedGames` moves (by about half), and `projectedTotalPts` moves with it except on QB `chain` rows (whose total is `qbStarterPPG × qbStartShare × 17`, independent of games). `projectedPPG` does not move.
- `factors.projectedGamesBase` is the pre-boundary value on post-boundary rows, so one capture grades both rules.
- The in-season healthy override lives only in the app's displayed copy, never in a snapshot `projection`.
- **Post-push display fix, not a boundary:** app `59fc51d` (pushed 2026-10-10 13:06:03 UTC, 20 min after the
  boundary push) extends the healthy override to the QB start-chain branch of `applyInSeasonProjection`
  (displayed `projectedGames` only; the chain total never reads games). `writeProjectionSnapshot` reads the raw
  `seasonProjections`, so no capture differs on it and nothing segments on it.
- **Cross-check (to be confirmed, D-67):** the first post-push capture's `'short'`/`'none'` veteran rows equal the mirror's `rule: 'l6c'` (`lib/durabilityMirror.mjs`).

### Veteran rows — boundary 10 (input correction)

A second **served-data correction** on the absence axis (boundary 7 was the first), this time `'D'` → `'X'`: a week the weekly roster lists in a role state (practice squad, released, exempt) no longer counts as a missed game. The data push moves a veteran row's `projectedGames`, `projectedTotalPts`, `injurySeasons` and `absenceShapeFactor`, and `projectedPPG` only on bounce-back flips; the app commit moves `PRIOR_MODEL_FROM` in the same release.

- **Row-detectable, unlike boundary 7.** The release pairs the data push with a `PRIOR_MODEL_FROM` bump, and captures record it as the envelope's `projectionModelFrom` (D-50). A capture whose `projectionModelFrom` is at or after the boundary's value is corrected; an earlier or absent marker is legacy on this axis. Detect by the envelope field, never by a date lookup.
- **Cross-check — open (D-83).** After the first post-push capture: **exact** on the season-totals-determined fields — the set of veteran rows whose `projectedGames`, `factors.injurySeasons`, `factors.absenceShapeFactor` or `factors.isBounceBack` change between the last pre-push and the first post-push capture, and their before/after values, equal the impact verdict's (`grading/2026-10-22-absence-role-verdict.md`; rows present in both captures only). **Report-only** on `projectedPPG`, `projectedTotalPts` and `dynasty.score`/`label`: the captures are a day apart, so live Sleeper/KTC/depth state moves them; report agreement in direction with the verdict's movers, no pass/fail.

### Rookie rows — boundary 11 (join correction)

An **app-side join correction** (CR-31): the app's KTC, draft and college matchers key on the nflverse player-id crosswalk (KTC name alias, `draftYear` + `draftOvr`, `espnId` = CFBD athlete id) with name fallback. Players whose join changed move on the rookie path only: `projectedPPG`, `projectedGames` and `projectedTotalPts` through draft capital, college metrics and the KTC position percentile (and dynasty scores with them). The veteran projection does not move — measured, see `grading/2026-10-25-join-fix-verdict.md`; the veteran path reads none of the three joins.

- **Row-detectable through the envelope.** The release pairs the app push with a `PRIOR_MODEL_FROM` bump (the envelope's `projectionModelFrom`), and `inputStatus.playerIds.loaded` says whether the joins ran on the crosswalk. A capture whose `projectionModelFrom` is at or after the boundary's value is corrected; an earlier or absent marker is legacy on this axis. Detect by the envelope field, never by a date lookup.
- **Cross-check — open.** After the first post-push capture: **exact** on the set of rookie-path rows whose `factors.nflDraftMatchSource` changed between the last pre-push and the first post-push capture — equal to the verdict's "Rows whose `nflDraftMatchSource` changed" list. **Report-only** on `projectedPPG` and `dynasty.score`/`label`: the captures are a day apart, so live state moves them; report agreement in direction with the verdict's movers, no pass/fail.
- **No new veteran segment** (rookie-only, like boundaries 6 and 9); the release registers its `PRIOR_MODEL_FROM` value as an L6 marker so the capture maps to a segment.

## Boundaries by path

Rookie boundaries 1–3 are rookie-path only. Boundary 4 is veteran-path only, affects only
rows whose basis starts `removed:`, and a pooled veteran grade spanning it measures the
mechanism change. Boundary 5 is QB-only on both paths; it moves only QB rows whose `qbTakeoverBasis`
is not `incumbent`/`stale`, and a pooled QB grade spanning it measures the mechanism change. Boundary 6 is rookie-QB-only (`yearsExp` 0 with known draft capital); it moves
`qbStarterPPG` on those rows and `projectedPPG`/`projectedTotalPts` only on their `chain` rows, and a pooled rookie QB
grade spanning it measures the mechanism change. Boundary 7 moves veteran rows' `projectedGames`,
`projectedTotalPts`, `injurySeasons` and `absenceShapeFactor`, and `projectedPPG` only on bounce-back flips; a pooled
veteran games grade spanning it measures the correction. Boundary 8 is veteran-only and row-detectable through
`factors.shortSeasonState`; it moves `projectedGames` on `'short'`/`'none'` rows (and `projectedTotalPts` except on QB
`chain` rows), and a pooled veteran games grade spanning it measures the rule. Boundary 9 is rookie-only (RB/WR/TE, day-3 and undrafted) and row-detectable through `factors.rookieTotalBasis`; it moves `projectedTotalPts` only, so a pooled rookie total-points grade spanning it measures the factor, and a PPG or games grade does not see it. Boundary 4a is both-path and row-detectable through the envelope's `projectionBasis` (rookie rows also through `factors.rookieBasisScale`); it moves every `projectedPPG` and `projectedTotalPts`, so a pooled grade of either spanning it measures the scoring basis. Boundary 10 is veteran-only, a served-data correction on the absence axis like boundary 7 (`'D'` → `'X'` for role-state weeks), and row-detectable through the envelope's `projectionModelFrom`; it moves veteran rows' `projectedGames`, `projectedTotalPts`, `injurySeasons` and `absenceShapeFactor`, and `projectedPPG` only on bounce-back flips, so a pooled veteran games grade spanning it measures the correction. Boundary 11 is rookie-only (an app-side join correction, CR-31) and row-detectable through the envelope's `projectionModelFrom` and `inputStatus.playerIds`; it moves rookie-path `projectedPPG`, `projectedGames` and `projectedTotalPts` for players whose KTC, draft or college join changed, so a pooled rookie grade spanning it measures the join correction.

## Veteran segments for the January season grade (machine-readable)

`lib/seasonGrade.mjs` `VETERAN_SEGMENTS` is mirrored **byte-for-byte** as the JSON block below (`test/season-grade.test.mjs` deep-equals the two). Boundaries 6, 9 and 11 are rookie-only and have no veteran segment; boundary 9's marker date maps to L5, and boundary 11's marker (registered at release) maps to L6. `L0` is the first capture after the earliest 2026 regular-season kickoff (`KICKOFF_2026_UTC` = 2026-09-10T00:20:00Z: nflverse `games.csv` `2026_01_NE_SEA`, Wed 2026-09-09 20:20 ET); `K`, the last capture before it, is `2026-09-09`. A capture's segment is the **last** entry (array order) whose detector fires; the run stops if the capture's date lies outside [that entry's `firstCapture`, the next's), if a non-null `projectionModelFrom` is not a listed marker or maps to another segment, or if the newest 2026 capture does not classify to the last entry. **A new veteran boundary is added here and to `VETERAN_SEGMENTS` first** (and re-opens the season-grade plan for its segment-dependent spans).

Detector vocabulary: `capturedAfter` (`capturedAt > utc`); `vetRowKey` (every veteran row has `factors[key] !== undefined`); `envelopeEquals` (`snapshot[field] === value`); `markerIn` (`projectionModelFrom` ∈ `markers`).

<!-- veteran-segments:begin -->
```json
[
  {"id":"L0","boundary":"none","firstCapture":"2026-09-10","detector":{"kind":"capturedAfter","utc":"2026-09-10T00:20:00Z"},"markers":[]},
  {"id":"L1","boundary":"4","firstCapture":"2026-09-13","detector":{"kind":"vetRowKey","key":"regressionUpsideBasis"},"markers":[]},
  {"id":"L2","boundary":"4a","firstCapture":"2026-09-25","detector":{"kind":"envelopeEquals","field":"projectionBasis","value":"league"},"markers":[]},
  {"id":"L3","boundary":"5","firstCapture":"2026-10-04","detector":{"kind":"vetRowKey","key":"qbTakeoverBasis"},"markers":[]},
  {"id":"L4","boundary":"7","firstCapture":"2026-10-07","detector":{"kind":"capturedAfter","utc":"2026-10-07T06:50:00Z"},"markers":[]},
  {"id":"L5","boundary":"8","firstCapture":"2026-10-10","detector":{"kind":"vetRowKey","key":"shortSeasonState"},"markers":["2026-10-11","2026-10-14"]},
  {"id":"L6","boundary":"10","firstCapture":"2026-10-23","detector":{"kind":"markerIn","markers":["2026-10-23"]},"markers":["2026-10-23"]}
]
```
<!-- veteran-segments:end -->

## Why this is written now, not at the first forward grade

Writing this policy with a stale date list is worse than not writing it at all (D-15) — a
reader would trust a table quietly missing a boundary. Boundary 4 exists as of `7b5b055`,
boundary 5 as of the qb-takeover-wiring push and boundary 6 as of the rookie-qb-starter-level push, so the table above is complete,
for the rookie mechanisms, the Step 4 up-side axis, the QB start-share axis and the rookie QB starter level, as of
rookie-qb-starter-level, plus boundary 7 as of absence-classification, boundary 8 as of short-season-wiring, boundary 9 as of rookie-total-wiring and boundary 10 as of absence-role; boundary 4a (the 2026-09-25 scoring-basis switch, which the table had missed) as of D-46, inserted chronologically so boundaries 5–9 keep their numbers.
