# Step 4 boundary parity + the fourth model-change date — D-18 (Part B of 2)

**Repo:** `sleeper-dashboard-data` only. Branch `step4-boundary-parity` + PR.

**CI note:** `smoke-test.yml`'s path filter (`bin/`, `lib/`, `scripts/`, `package.json`, `enrichment/`, workflows) does **not** match `test/`, `grading/` or `data-catalog.md`. This PR triggers no CI, so run `npm test` and `npm run smoke` locally and report them.

**Planned with Part A:** `.claude/tasks/step4-mirror-version.md`. Read its §0–§2 first. The review record for flags 6–8, which land here, is A §10.

**Hard preconditions (Step 0 checks them; if either fails, stop without writing anything):**
1. Part A is merged to `main`: `resolveRegressionBucket` is exported from `lib/projectionFactors.mjs`, and `test/step4-mirror.test.mjs` exists.
2. A **post-boundary capture** exists: a committed `snapshots/<date>.json` in which at least one `projection.confidence !== 'rookie'` row carries `factors.regressionUpsideBasis`.

**Both preconditions were met at plan review (2026-09-13):** Part A merged as `e802e73`, and `snapshots/2026-09-13.json` landed as `1197b33`. So `POST = 2026-09-13` and `POSITIONS = nfl/players-state/2026-09-12.json`. Step 0 still re-checks both.

---

## 0. Facts this part rests on (verified at planning, 2026-09-12 22:40 UTC)

- **Boundary 4 commit time.** `7b5b055` was committed at 2026-09-12 22:27 UTC.
- **Scheduled captures run late.** They are scheduled for 16:29 UTC but start late: committed snapshot commits landed 18:37–19:33 UTC over 2026-09-08…12, and `snapshots/2026-09-12.json` has `capturedAt` 2026-09-12T18:34:49Z.
- **The 2026-09-12 capture is pre-boundary.**
  - 421 veteran rows and 291 rookie rows.
  - 0 rows carry `regressionUpsideBasis` or `outlierRatio`.
  - Veteran `regressionFactorRaw` distribution: 1 ×160 · 1.05 ×63 · 0.95 ×48 · 1.12 ×107 · 0.88 ×43, so 170 up-side rows.
  - All 291 rookie rows carry `rookieCalibrationBasis`, `rookieGamesBasis` and `rookieCeilingBasis`.
- **Snapshot rows carry no position.** Keys are `nfl_team`, `status`, `depthChartOrder`, `ktc`, `projection`.
- **Positions come from `nfl/players-state/<date>.json`**, which is weekly (newest 2026-09-12). Expected shape: `players[pid].position`; Step 0 verifies it.
- **Up-side population estimate** (analysis §9.6, from the 2026-09-12 capture): RB 33 · WR 73 · TE 53 · QB 11.

---

## 1. Q5 · The assertion that proves each side

**Why the design holds.**
- **Same inputs on both sides.** Both captures project from the same `careerStats` (no in-season season-totals exist), so a player's `outlierRatio` is identical pre and post. The post capture's `outlierRatio` (3 dp) can therefore drive the mirror on both sides. An input-identity guard enforces this instead of assuming it.
- **Independent position.** Position comes from players-state, not from the basis suffix (A §0 C5).
- **Discrimination.** Each model must match its own side and fail the other, so no assertion can pass vacuously.

**Headline (T-S4-6).** Across joined veteran rows whose inputs match, the rows whose captured `regressionFactorRaw` changed across the boundary must be exactly the rows whose post-boundary `regressionUpsideBasis` starts `removed:`. Each such row is pre ∈ {1.05, 1.12} and post 1.00; every other joined row's `regressionFactor` is unchanged.

Combined with T-S4-4 and T-S4-5, that proves three things:
- `step4-upside` reproduces the post capture, and `legacy` does not.
- `legacy` reproduces the pre capture, and `step4-upside` does not.
- The boundary moved nothing else **in the Step 4 fields**.

Other factors drift day to day regardless of the boundary. Between 2026-09-12 and 2026-09-13, 38 of the 262 joined non-member veteran rows changed some other factor (`ageDelta` 25, `compPPG` 8, `depthFactor` 5 and others), and 21 changed `projectedPPG`. Every September day pair shows drift of that size. **So T-S4-6's non-member check compares `regressionFactor` only. Never widen it to `projectedPPG` or to all factors.**

---

## 2. Session 2 — steps

**Step 0 · Preconditions.**
- `git switch main && git pull --rebase origin main`, then check both hard preconditions.
- **POST date.** Set `POST` to the earliest committed snapshot that meets precondition 2, normally `2026-09-13`.
- **PRE date.** Set `PRE = 2026-09-12`.
- **Positions file.** Set `POSITIONS` to the newest `nfl/players-state/<date>.json` dated ≤ `POST`.
- **Shape check.** Confirm `players[pid].position` exists in the positions file.
- **Stop-and-report conditions:**
  - no capture dated after 2026-09-12 carries the key;
  - `POST` is a later capture than the first one after the boundary — report why the earlier capture lacks the key;
  - the players-state shape differs.
- **Where the dates live (review flag 6).** `POST` and `PRE` appear in exactly one generator constant, the fixture file name, and the anchor-policy fill cells. Nowhere else in this part hard-codes a date.
- **Branch.** Then `git switch -c step4-boundary-parity`, and include this task file in the commit.

**Commit 1** carries §3 (fixture + tests) and §4 (docs), with the numbers filled in from T-S4-3's pinned counts.

**PR.** Title: `test: Step 4 boundary parity + anchor-policy boundary 4 (D-18)`. Do not merge before verification and human sign-off.

---

## 3. Tests to add

### 3.1 Fixture — `test/fixtures/step4-boundary/boundary-<PRE>-<POST>.slim.json`

Minified JSON, generated by a script kept in a comment above the tests (the T-F10/T-RM10 convention). Shape:

```json
{ "boundary": { "commit": "7b5b055", "committedAt": "2026-09-12T22:27:00Z" },
  "pre":  { "date": "<PRE>",  "schemaVersion": 3, "capturedAt": "...", "rows": { "<pid>": { "confidence": "...", "f": { } } } },
  "post": { "date": "<POST>", "schemaVersion": 3, "capturedAt": "...", "rows": { } },
  "positions": { "date": "<POSITIONS date>", "byPid": { "<pid>": "WR" } } }
```

- **`rows`**: every player in each snapshot.
- **`f`**: only these keys, and only where present: `regressionFactorRaw`, `regressionFactor`, `consistencyScale`, `consistencyScore`, `consistencyBand`, `basePPG`, `outlierRatio`, `regressionUpsideBasis`.
- **`positions.byPid`**: for every pid in either snapshot that has a players-state entry.

### 3.2 `test/step4-mirror.test.mjs` — append T-S4-1…6

**Definitions.**
- `NEAR = 5e-4` (the 3-dp capture band).
- `THRESHOLDS = [0.65, 0.85, 1.15, 1.35]`.
- `round3 = x => Math.round(x * 1000) / 1000`.
- **Veteran row:** `confidence !== 'rookie'`.
- **Checkable row:** a veteran row whose `positions.byPid` entry ∈ QB/RB/WR/TE and whose (post) `outlierRatio` is not within `NEAR` of any threshold.

**Pinning rules.**
- Every count below is **pinned to the observed value**, and every pinned count is reported.
- **Cross-check before pinning.** Post `removed:` counts per position should sit near §0's RB 33 · WR 73 · TE 53, and `retained:QB` near 11. A difference beyond roster churn (±5 per position) is a stop-and-report.

**T-S4-1 · presence.** The fixture exists. Asserted, never skipped.

**T-S4-2 · envelope.**
- `pre.capturedAt < boundary.committedAt < post.capturedAt`.
- Both sides have `schemaVersion === 3`.

**T-S4-3 · D-18 detection rule on real rows.**

| Side | Assertions |
|---|---|
| **pre** | veteran rows `=== 421` and rookie rows `=== 291`; rows carrying `regressionUpsideBasis` (either path) `=== 0`; rows carrying `outlierRatio` `=== 0` |
| **post** | veteran and rookie counts pinned; veteran rows missing `regressionUpsideBasis` or `outlierRatio` `=== 0`; rookie rows carrying either key `=== 0`; basis values ⊆ {`none`, `removed:RB`, `removed:WR`, `removed:TE`, `retained:QB`}, with the distribution pinned |

**Scope check:** post rookie rows lacking the key `> 0`. A presence-only rule would file every one of them as legacy.

**T-S4-4 · post side = `step4-upside`, exact.** For every checkable post row:
- `resolveRegressionBucket(outlierRatio, { position, model: 'step4-upside' })` deep-equals `{ regressionFactorRaw: f.regressionFactorRaw, regressionUpsideBasis: f.regressionUpsideBasis }`.
- `round3(1 + (raw − 1) × f.consistencyScale) === f.regressionFactor`.

Then:
- **Failure lists empty.** If every failure is a basis suffix ≠ players-state position with a matching raw, stop and report; do not pin.
- **Discrimination:** the rows where `legacy` raw ≠ captured raw are exactly the rows whose basis starts `removed:`. Count pinned, `> 0`.
- **Pinned:** checked, near-threshold skips, no players-state entry, position outside the four.

**T-S4-5 · pre side = `legacy`, exact.**
- **Join.** Take pids that are veteran rows in both captures.
- **Input-identity guard.** `basePPG`, `consistencyScore`, `consistencyBand` and `consistencyScale` must be equal pre vs post. Rows failing the guard are excluded; that count is pinned, expected 0.
- **Checkability** is judged on the post `outlierRatio`.
- For each checkable joined row:
  - `resolveRegressionBucket(post.outlierRatio, { position, model: 'legacy' })` returns `regressionFactorRaw === pre.f.regressionFactorRaw` and `regressionUpsideBasis === null`;
  - `round3(1 + (raw − 1) × pre.f.consistencyScale) === pre.f.regressionFactor`.
- **Discrimination:** the rows where `step4-upside` raw ≠ pre captured raw are exactly the rows whose **post** basis starts `removed:`. Count pinned, `> 0`.

**T-S4-6 · the boundary moved exactly the removed rows.** Over guard-passing joined veteran pids, using captured values only (so no `NEAR` band applies):
- The set `{ pre raw ≠ post raw }` equals the set `{ post basis starts removed: }`.
- Each member has pre raw ∈ {1.05, 1.12} and post raw `=== 1`.
- Every non-member has `pre.f.regressionFactor === post.f.regressionFactor`. This is the Step 4 field only; other fields drift day to day (§1).
- Member count pinned.

### 3.3 Edge cases covered

| Edge case | Covered by |
|---|---|
| Rookie rows on both sides | T-S4-3 |
| 3-dp rounding at thresholds | `NEAR` skip, counted |
| No players-state entry, or a non-skill position | counted |
| Roster churn | join, counted |
| Changed career inputs | identity guard, counted |
| `retained:QB` rows | must *not* move (T-S4-6 non-members) |
| `none` rows | identical under both models (outside T-S4-4/5 discrimination sets) |

---

## 4. Docs updates

### 4.1 `grading/anchor-policy.md` — full rewrite

Replace the file with the text below. The `<fill>` cells come from T-S4-3's pinned counts and the §4.4 command.

```markdown
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
| `2026-05-19` – `2026-06-05` | unclassified on this axis — confirmed: veteran rows in these <fill: A> captures carry `regressionFactor` but no `regressionFactorRaw` or `consistency*` (e.g. `snapshots/2026-05-19.json`, 428 veteran rows), so the Step 4 table they were produced under cannot be read from the row |
| `2026-06-06` – `2026-09-12` | legacy — confirmed: every veteran row in these <fill: B> captures carries `regressionFactorRaw` and none carries `regressionUpsideBasis`; `snapshots/2026-09-12.json` (captured 18:34:49 UTC, before `7b5b055`) has 421 veteran rows, 170 of them at an up-side `regressionFactorRaw` (107 × 1.12, 63 × 1.05). The poisoned 2026-07-16 → 2026-07-18 window sits inside this segment and is excluded on its own axis (`CLAUDE.md`) |
| `>= 2026-09-13` | step4-upside — confirmed: all 422 veteran rows in `snapshots/2026-09-13.json` (captured 18:52:36 UTC) carry `regressionUpsideBasis` (none 252 · removed:RB 34 · removed:WR 73 · removed:TE 52 · retained:QB 11), no rookie-path row carries it, and between the 2026-09-12 and 2026-09-13 captures the veteran rows whose `regressionFactorRaw` moved are exactly the 159 `removed:` rows |

## Boundaries by path

Rookie boundaries 1–3 are rookie-path only. Boundary 4 is veteran-path only, affects only
rows whose basis starts `removed:`, and a pooled veteran grade spanning it measures the
mechanism change.

## Why this is written now, not at the first forward grade

Writing this policy with a stale date list is worse than not writing it at all (D-15) — a
reader would trust a table quietly missing a boundary. Boundary 4 exists as of `7b5b055`,
so the table above is complete, for the rookie mechanisms and the Step 4 up-side axis, as of D-18.
```

### 4.2 `data-catalog.md` — snapshots row (`:84-87`)

Replace the "Mechanism-version segmentation (D-15)" bullet with:

`- **Mechanism-version segmentation (D-15, D-18):** a projection row can come from one of four successive app mechanisms depending on capture date — three on the rookie path (calibration, games ladder, ceiling) and one on the veteran path (the Step 4 up-side gate, app \`7b5b055\`) — see [grading/anchor-policy.md](grading/anchor-policy.md) for the per-path row-level detection rule and the \`capturedAt\` cross-check before pooling rows across capture dates in any grading run.`

### 4.3 `README.md` — Part A's "Step 4 regression model" paragraph (review flag 8)

Append the following sentence to the end of that paragraph:

`Parity against the captures either side of the boundary: \`test/step4-mirror.test.mjs\` T-S4-1…6 (\`grading/anchor-policy.md\`, boundary 4).`

### 4.4 The all-captures check (fills `<fill: A>` and `<fill: B>`)

```sh
node --input-type=module -e "import fs from 'fs'; let pre=0,preRaw=0,leg=0,legMissingRaw=0,basisHits=0; for (const f of fs.readdirSync('snapshots').filter(f=>/^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f.slice(0,10)<='2026-09-12').sort()) { const s=JSON.parse(fs.readFileSync('snapshots/'+f,'utf8')); const vet=Object.values(s.players??{}).filter(p=>p.projection && p.projection.confidence!=='rookie'); const isPre=f.slice(0,10)<'2026-06-06'; if (isPre) pre++; else leg++; for (const p of vet) { const fa=p.projection.factors||{}; if ('regressionUpsideBasis' in fa) basisHits++; if (isPre && 'regressionFactorRaw' in fa) preRaw++; if (!isPre && !('regressionFactorRaw' in fa)) legMissingRaw++; } } console.log('pre0606', pre, 'withRaw', preRaw, '| legacy', leg, 'missingRaw', legMissingRaw, '| basisHits', basisHits)"
```

Expected output: `pre0606 <A> withRaw 0 | legacy <B> missingRaw 0 | basisHits 0`, with A + B = 60 (the total the plan review measured). Any non-zero `withRaw`, `missingRaw` or `basisHits` is a stop.

---

## 5. Cross-repo impact

The `lib/registry.mjs` fire list over this part's touched files matches three entries: CR-15, CR-02 and CR-18.

### 5.1 CR-15 · R3-FIT factor-multiplier mirror — **fires; discharged here, nothing owed app-side**

Since the registry sync (app `9a9a237`, data `dd6b419`), `test/step4-mirror.test.mjs` is a CR-15 data-side trigger, and this part appends T-S4-1…6 to it.

> **Mirror (verbatim):** Re-mirror the changed constant/gate/branch and **re-fit before any further exponent activation** — otherwise the fit reconstructs a factor the app no longer produces and the committed verdict in `.claude/tasks/r3fit-exponent-harness.md` stops transporting. Which positions a factor is gated to is itself part of the mirror. Note the known parity gap: `shareTrend` and `teamRzShare` have no end-to-end app-ground-truth check until a post-2026-07-18 snapshot is imported. **Nothing app-side fails when this drifts.** **Scope note reversed (D6a, 2026-09-06):** `dynastyScore.js` was previously named in `lib/projectionFactors.mjs` (the comment above `weightedLinearRegressionSlope`) only as a *contrast* and marked deliberately not a trigger; D6a's age port (Step 2) draws `computeEmpiricalAgeCurves` straight out of it, so `dynastyScore.js` is now mirrored and is a trigger like the other ten app-side modules. The old contrast is still accurate as far as it goes — `weightedLinearRegression`'s copy in that file remains unfloored where the mirrored one floors the denominator at 4 — it just no longer means the whole file is out of scope. A change to any of the three app-side rookie mechanisms, or to their ordering, re-mirrors here; the mirror must never become reachable from the fit path, which `test/rookie-mirror.test.mjs`'s import-graph assertion enforces. **A gate change that captured snapshots already carry is added as a new model, never an overwrite (`7b5b055`, Step 4 up-side):** the retired behaviour stays reproducible for parity against pre-boundary captures and for re-running committed verdicts, the new model becomes the harness default, and the boundary gets a row in `grading/anchor-policy.md`.

How this part discharges it:
- **No mirrored constant, gate or branch changes.** Nothing needs re-mirroring, and there is no re-fit obligation.
- **The Mirror's last clause is delivered here.** "The boundary gets a row in `grading/anchor-policy.md`" is §4.1's boundary 4 row.
- **No registry text changes, and no app-side action is owed.**

### 5.2 CR-02, CR-18 — do not fire

Both name `data-catalog.md`. This part edits only the snapshots row's segmentation note: no field, stat key, source, coverage or reconstructability changes, so no `docs/signal-registry.md` row edit is owed.

---

## 6. Done-definition and hand-back

**Done-definition:**
- `npm test` and `npm run smoke` pass locally (no CI runs on this PR).
- No `manifest.json` or served-file change.

**Hand-back must report:**
- the SHA and PR URL;
- the files touched;
- deviations from this task file;
- the `POST` / `POSITIONS` dates, with the Step 0 evidence;
- every pinned count, plus the §3.2 cross-check against 33 / 73 / 53 / 11;
- the §4.4 output;
- the filled anchor-policy cells.

## 7. Risks

| Risk | Handling |
|---|---|
| The first post capture fails the D1b gate or lands late | Step 0 picks the first qualifying capture and reports why |
| A players-state position differs from the app's live position | Shows as a T-S4-4 suffix failure; stop-and-report, never pinned away |
| Weekly players-state lags the post capture by up to 6 days | Counted via the no-entry and outside-four pins |

---

## 8. Expected values (measured at plan review, 2026-09-13)

The plan-reviewer re-derived these against the committed files. Session 2 pins the **observed** values, and **each must equal the value here**. Any difference is a stop-and-report, not a re-pin.

**Suite baseline:** `npm test` 1008 / 1008 on `main` before Part B.

| Check | Expected |
|---|---|
| T-S4-2 | pre `capturedAt` 2026-09-12T18:34:49.006Z < `7b5b055` 2026-09-12T22:27:00Z < post 2026-09-13T18:52:36.415Z; both `schemaVersion` 3 |
| T-S4-3 pre | 421 veteran rows, 291 rookie rows; 0 rows carry `regressionUpsideBasis`; 0 carry `outlierRatio` |
| T-S4-3 post | 422 veteran rows, 291 rookie rows; every veteran row carries both keys; 0 rookie rows carry either; basis distribution none 252 · removed:RB 34 · removed:WR 73 · removed:TE 52 · retained:QB 11 |
| Positions | `nfl/players-state/2026-09-12.json` `players[pid].position` for 848 players |
| T-S4-4 | checked 419 · failures 0 · near-threshold skips 2 (`8137` WR ratio 1.35, `11635` WR ratio 0.85) · no players-state entry 1 (`8204`, a veteran present only in post) · outside the four 0 · discrimination 159 |
| T-S4-5 | joined 421 · identity-guard failures 0 · checked 419 · near-threshold skips 2 · discrimination 159 |
| T-S4-6 | members 159; the moved set equals the removed set; every member goes 1.05/1.12 → 1; no non-member's `regressionFactor` changed |
| §4.4 | 60 captures dated ≤ 2026-09-12 in total; `withRaw 0`, `missingRaw 0`, `basisHits 0` |

---

## 9. Review record — plan-reviewer, 2026-09-13

The review ran at full depth. All four flags were verified before disposition, and all four were accepted.

| # | Flag | Verified | Disposition |
|---|---|---|---|
| 1 | cross-repo — §5 says CR-15 does not fire, but `test/step4-mirror.test.mjs` is now a CR-15 trigger, and the Mirror's last clause is this part's deliverable | Correct: the trigger was added by R5 in the registry sync (`9a9a237`/`dd6b419`) | **Fixed.** §5.1 quotes the Mirror text and records §4.1 as discharging it; nothing is owed app-side. |
| 2 | edge-case — §4.1 files pre-2026-06-06 veteran rows as "legacy Step 4" and overclaims "four changes / complete" | Correct: Session 1 re-ran the key scan. `2026-05-19` has 428 veteran rows and 0 carry `regressionFactorRaw`/`consistencyScale`; from `2026-06-06` every veteran row carries both (schemaVersion 1→2 on 06-08, →3 on 09-07) | **Fixed.** The veteran rule is scoped to rows carrying `regressionFactorRaw`; 05-19…06-05 is "unclassified on this axis"; the claims are scoped to the two tracked axes; §4.4 now verifies the 06-06 split. |
| 3 | edge-case — §1 "moved nothing else" holds only for the Step 4 fields | Correct (reviewer measurement: 38/262 non-members drift on other factors, 21 on `projectedPPG`) | **Fixed.** §1 and T-S4-6 now scope the claim to `regressionFactor` and forbid widening the check. |
| 4 | mechanical — `data-catalog.md` anchor `:85-87` | Correct: the bullet starts at `:84` | **Fixed** (§4.2). |

The reviewer's MIRROR block matches §5.1 verbatim.
