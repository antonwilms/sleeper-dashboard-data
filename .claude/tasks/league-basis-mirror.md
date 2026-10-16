# D-46 — the league-basis CR-15 mirror model (W4 step 2)

**Session 1, 2026-10-16 (opus), parent folder.**
- Baselines: app `2267d33`, data `7ead2af` (D-47 signed off; both clean). Registry md5 `23b60290…` (app).
- Source: `../future_plans/in-season-notes-plan.md` → "Close-out programme (2026-10-10)" W4 step 2; backlog
  `sleeper-dashboard/.claude/tasks/data-repo-backlog.md` D-46 (and D-45, which follows); the sketch in
  [`weekly-scoring-keys.md`](weekly-scoring-keys.md) §7.
- Companion: [`league-basis-mirror-registry.md`](league-basis-mirror-registry.md) — §8's entries with every Mirror quoted
  verbatim (split out for size).

**The problem.** Since season-rescore (app `47af353`, live from the 2026-09-25 capture) the app rescores every
season-totals row **at load** (`rescoreSeasonTotals`, `src/api/sleeperStats.js:314-370`): season `fantasyPoints` =
`scoreSeasonStats(stats, league, { position, deriveFirstDowns })`, weeks exact from `weeklyStats` since D-47 (else
ratio-scaled), and `computeEmpiricalAgeCurves` measures `positionBasisScale` (`dynastyScore.js:60-148`), which
multiplies `ROOKIE_BASELINE_PPG`, the `ROOKIE_CEILING` knee/asymptote, the rookie QB starter level and
`POSITION_PRIOR_PPG` (captured per rookie as `factors.rookieBasisScale`). Every data-side reconstruction still runs
on the served half-PPR rows with scale 1:
- the CR-15 mirror (`attachFactorMultipliers`, `reconstructShippedRookieProjection`, `applyRookieCeiling` — no
  `basisScale` parameter, `lib/rookieMirror.mjs:162`), and T-F10's basis claim ("matches by construction",
  `test/panel-fit.test.mjs:1460-1463`), true only before 2026-09-25;
- the CR-25 k-fits (`--inseason`, `--inseason --dynasty`), pinned `half_ppr` (`scripts/inseason-run.mjs:364`,
  `inseason-dyn-run.mjs:1012`), reading half-PPR `weeklyPoints` (`inSeasonEvidence.mjs:95-104`,
  `inseason-run.mjs:168/277/482`, `qbTakeover.mjs:209`) and `PROSPECT_MIRROR.positionPriorPPG` unscaled
  (`inSeasonEvidence.mjs:630, 668`);
- `grading/anchor-policy.md` has no row for the switch.

The app's k carry the note "fitted on the half-PPR panel; k is dimensionless … a league-basis refit is data backlog
D-45" (`inSeasonConstants.js:10-11`). That refit is this slice's graded part.

**The fix.** Add a scoring-basis model `league` beside the pinned `half_ppr` (a new model, never an overwrite —
CR-15's rule). It is a **loader-level** mirror: one function rescores rows exactly as `rescoreSeasonTotals` does, and
every reader that consumes `fantasyPoints`/`weeklyPoints` — factor reconstruction, outcome maps, checkpoints, QB
start rows, the takeover `ppgAt` — moves to league basis with no edit to fit code, because that is what the app does.
Then grade (§3) and wire only what beats the shipped k.

**What this slice does not do (D-45's):** refit `ROOKIE_BASELINE_PPG`/`ROOKIE_CEILING`/`POSITION_PRIOR_PPG`/
`QB_ROOKIE_STARTER_PPG`, re-measure `ROOKIE_CALIBRATION`, retire `positionBasisScale`, re-route
`qb-rookie-level-run.mjs`'s `bonus_fd_qb` stop, or move `--rookie`, `--fullpipeline`, `--rookie-total`,
`--qb-rookie-level`, `--qb-takeover`, `--games-*`, `--absence` off `half_ppr`. Those modes keep rejecting `--basis`.

---

## 0. Decisions (Anton, 2026-10-16: D1–D7 confirmed). Do not reopen.

1. **D1 · Model, not flag soup.** `SCORING_BASIS_MODELS = ['half_ppr', 'league']` in new `lib/leagueBasis.mjs`.
   `half_ppr` = served rows verbatim, scale 1 — byte-identical to today, and reproduces every committed artifact.
   `league` = rows through `rescoreSeasonRowsLeague`, scale from `reconstructPositionBasisScale`.
2. **D2 · League = one pinned `scoringSettings`.** `test/fixtures/league-scoring-2026-10-14.json` (D-47's copy). The
   run asserts the settings are deep-equal on every capture it reads for parity (2026-09-25 … 2026-10-14) and stops
   if not (verified at plan review: deep-equal on 09-24, 09-25, 10-14). Output `basisDetail` names the fixture.
3. **D3 · Position source = `raw/-players-nfl.json`** (`position`). The app passes the live `/players/nfl` map
   (`App.jsx:930-934` → `src/api/sleeper.js:43-46`, 24 h cache) to both `loadCareerHistory` (`App.jsx:1070`, the
   rescore's position and first-down derivation) and `computeEmpiricalAgeCurves` (`App.jsx:226`); the export is a
   2026-05-18 copy of that map (not bot-written). The run reports pids absent from it, and G1 reports, for qualifying
   pids, the export position vs the position recovered from each parity capture (G1a/G1b), so a miss can be
   attributed. Plan review re-derived G1a with this file: QB 1.114 (435 rows), RB 1.118 (1,300), WR 1.101 (2,028),
   TE 1.325 (1,231) — equal to every captured `rookieBasisScale` on 09-25 (302/302) and 10-14 (310/310).
   `deriveFirstDowns` per season = `!seasonEmitsFirstDownBonus(rows)` (the D-47 port), as the app.
   **Fallback (Anton, 2026-10-16):** if G1 attributes any parity miss to position, switch the position source to an
   overlay — the newest dated `nfl/players-state/<date>.json` `players[pid].position` where present, else the export
   (players-state covers only current QB/RB/WR/TE/FB/K, 878 players on 2026-10-10, so it cannot stand alone for
   2012–2025 retirees). Name the date in `basisDetail.positionFile`, re-run G1 once, and report both runs. The file is
   bot-written: the hand-run may read it; tests keep reading committed fixtures (Invariant 10). If G1 still misses,
   stop and report.
4. **D4 · Scale is as-of.** For a backtest of season S, `positionBasisScale` is measured on seasons 2012…S−1 (what the
   app, with `currentSeason` S, loads — `sleeperStats.js:417`). Parity (§3 G1) uses S = 2026.
5. **D5 · Harness default = the model that produced the shipped constants.** Mirror *parity* selects its model per
   capture from the envelope: `projectionBasis === 'league'` → `league`; absent or `'half_ppr'` (a post-switch
   capture with empty `scoringSettings`, `sleeperStats.js:316`) → `half_ppr`; `'mixed'`/`'unknown'` → skip the
   capture with a logged reason (no model reproduces it; CR-01's per-season `live-api` carve-out lives there). The fit modes'
   default stays `half_ppr` unless §3's verdict is `wire`; on `wire` the default of `--inseason`/`--dynasty` flips to
   `league` in Stage C (CR-15: "the new model becomes the harness default"; until then the default is what the app
   runs). This is a stated exception to CR-15's default rule, so B2 writes it into the CR-15 Invariant; `--fit`
   (G3) keeps `half_ppr` as its default in every outcome.
6. **D6 · `PRIOR_MODEL_FROM`: re-checked, not bumped.** A k re-pin moves no `projectedPPG`/`projectedGames`/rookie
   total (`priorModelFrom.test.js` header: "A bump does not re-fit the k"). CR-25's Invariant asks that at a re-pin it
   "equalled the first capture on the model they were fitted against": the league re-fit reconstructs the current
   model (2026-10-14), so it stays `2026-10-14`. Stage B asserts that and moves nothing. (§7 of the D-47 sketch said
   "bump"; this decision supersedes it. If Anton wants a bump anyway, it is one line plus the golden re-record —
   note it unfreezes nothing new, as every 2026 capture is already refused.)
7. **D7 · Anchor-policy labels.** The switch is a 2026-09-25 change that the table missed; insert it chronologically
   as **boundary 4a** so boundaries 5–9 keep their numbers (they are cited across both repos). A `wire` adds
   **boundary 10** on a new axis (in-season k).

**Route** (registry route: app applies the edit, data byte-copies):
- **Stage A** — data (sonnet), A1–A3.
- **Session 1** reviews Stage A, reads the verdict (§3), then **pushes Stage A** (`git pull --rebase` first; no served
  file changes, so no purge, and CR-24 is unaffected — the registry is untouched). Pushing first freezes the SHAs
  B1 cites (`IN_SEASON_*_SOURCE.commit`, the test's `commit.startsWith`); a later bot-commit rebase cannot rename
  them. Either outcome continues to Stage B; only B1 depends on it.
- **Stage B** — app (sonnet), B1–B3. Session 1 reviews and pushes the app.
- **Stage C** — data (sonnet), C1–C3. Session 1 reviews and pushes data. CR-24 is red between the two pushes,
  same day.

---

## 1. Stage A1 — the league model (data; one commit)

Commit messages end `(league-basis-mirror)`. `npm test` green.

1. **New `lib/leagueBasis.mjs`.** Header: CR-15 mirror of app `rescoreSeasonTotals` (`sleeperStats.js:314-370`) and
   of `computeEmpiricalAgeCurves`' basis block (`dynastyScore.js:40-47, 59, 69, 73-81, 141-146`) @ `2267d33`; imports only
   `lib/fantasyPoints.mjs` (it must never import `lib/rookieMirror.mjs` — T-RM1's closure gets this module as a
   seed's dependency).
   - `SCORING_BASIS_MODELS`, `CURRENT_FIT_BASIS_MODEL = 'half_ppr'` (D5).
   - `rescoreSeasonRowsLeague(rows, scoringSettings, positionOf)` — **verbatim** port, line by line, with the app's
     line numbers in comments: the null/empty-settings early returns; `deriveFirstDowns`; the per-row skip when
     `sourceFantasyPoints`/`sourceWeeklyPoints` is already set; `ratio` with both undefined-ratio rules; the exact-week
     branch and its gate `|Σ − scored| ≤ 0.005·n + 0.01`; the 2-dp `scale`; the array branch; and the output fields
     `fantasyPoints`, `weeklyPoints`, `weeklyPointsMethod`, `scoringBasis: 'league'`, `sourceFantasyPoints`,
     `sourceScoringBasis`, `sourceWeeklyPoints`. `TEAM_*` rows pass through it exactly as in the app (no skip).
     Returns a new object; never mutates `rows`.
   - `reconstructPositionBasisScale(rescoredBySeason, positionOf)` → `{ QB, RB, WR, TE }`: rows with
     `gamesPlayed ≥ 10`, `positionOf(pid)` a skill position, `sourceScoringBasis === 'half_ppr'`, both points finite,
     `sourceFantasyPoints > 0`; median ratio rounded to 3 dp; `< 30` rows → `1`. Constant `MIN_BASIS_SCALE_ROWS = 30`
     with a comment citing `dynastyScore.js:59`. Use the same median as the app (`median` in `dynastyScore.js`;
     read it and copy its even-length rule).
   - `leagueBasisLoad(load, { scoringSettings, positionOf })` → a `load` whose `loadSeasonTotals(y)` returns
     `rescoreSeasonRowsLeague(load.loadSeasonTotals(y), …)` (memoised per year; `null` passes through) and adds
     `basisScaleAsOf(S)` = `reconstructPositionBasisScale` over the rescored seasons 2012…S−1 (memoised). Every other
     loader is passed through unchanged. A load that is already wrapped is returned unchanged (marked by a
     non-enumerable symbol), so the harness and `loadFactorInputs` share **one** instance. Callers on a `half_ppr`
     load (no `basisScaleAsOf`) use scale 1: export `basisScaleOf(load, S, position)` that does exactly that.
   - `loadLeaguePositions()` reads `raw/-players-nfl.json` once → `positionOf(pid)`.
2. **`scripts/panel-run.mjs`.** `resolveScoring` accepts `basis: 'league'` → `{ scoringSettings: <D2 fixture>,
   basisMeta: { type: 'league', scoringSource: 'test/fixtures/league-scoring-2026-10-14.json' } }`.
   `loadFactorInputs`, when `basis === 'league'`, wraps `load` with `leagueBasisLoad` **before any read** and then
   builds outcomes with `buildHalfPprOutcomes` — which now reads league points from the rescored rows. Do **not**
   route `league` through `buildInBasisOutcomes`: that path uses `calculateFantasyPoints` without the first-down
   derivation (2012–2021) and stays exactly as committed for `in-basis`. Today `:167` maps every non-`half_ppr`
   basis to `{ basis: 'in-basis', scoringSettings }`; change it to a three-way mapping (`league` → the half-PPR
   outcome builder over wrapped rows), and set `basisMeta.type`/`perYearBasis` (`:302`) to `'league'`.
   `basis: 'half_ppr'` and `'in-basis'` are byte-identical to today.
3. **Tests — new `test/league-basis.test.mjs`** (in-memory fixtures; never the newest capture, Invariant 10):
   - (a) the port against hand cases: a 2019-style row (no `bonus_fd_*`) derives first downs for a WR, not a K; a
     2023-style row keeps served `bonus_fd_*`; `NON_ADDITIVE_KEYS` are not scored;
   - (b) exact weeks when the gate passes, `'scaled'` when one week's `weeklyStats` is missing a scored key, both
     undefined-ratio rules, `weeklyPoints` absent → `method null`;
   - (c) idempotence (a rescored row passes through), no mutation of the input;
   - (d) `reconstructPositionBasisScale`: gp 9 excluded, 29 rows → 1, 30 rows → median to 3 dp, even-length median,
     a `live-api`-sourced row (`sourceScoringBasis` not `half_ppr`) excluded;
   - (e) **app parity by text**, gated like `test/registry-mirror.test.mjs:104-115` (runs only under
     `REGISTRY_MIRROR=1`, never a folder-exists skip): assert the gate literal `0.005 * n + 0.01` and the
     `Math.round(v * ratio * 100) / 100` scale appear in both `../sleeper-dashboard/src/api/sleeperStats.js` and
     `lib/leagueBasis.mjs` — a drift tripwire, not a proof;
   - (f) a `half_ppr` load is not wrapped and `basisScaleOf` returns 1 (byte identity itself is §1.4's hand-run).
4. **Acceptance (byte identity, hand-run).** On the baseline commit, run `node bin/backtest.mjs --inseason --write`
   and `--inseason --dynasty --write` with the output paths redirected to a scratch dir outside the repo (or copy the
   written constants files there and `git checkout` them); repeat after A1–A3 with no `--basis`. The constants JSON
   must be deep-equal ignoring `generatedAt`/`runtimeMs`; a `half_ppr` run adds **no** top-level key (the league
   provenance key below exists only on `league` files), so a later half-PPR re-pin keeps its shape. Paste both
   hashes in the hand-back.

## 2. Stage A2 — the rookie and prospect mirrors take `basisScale` (data; one commit)

1. **`lib/rookieMirror.mjs`**, verbatim with the app (`seasonProjection.js:335-345, 357-369, 378, 494, 504, 617`):
   - `applyRookieCeiling({ position, projectedPPG, basisScale = 1 })`: `knee = c.knee * basisScale`,
     `asymptote = c.asymptote * basisScale`; the returned knee/asymptote are the scaled ones (the app records those).
   - `resolveRookieQbStarterLevel(…, basisScale = 1)`: level × `basisScale`.
   - `reconstructShippedRookieProjection({ …, basisScale = 1 })`: `baseline = (ROOKIE_BASELINE_PPG[pos] ?? 7) *
     basisScale`; threads the scale to both; returns `rookieBasisScale: basisScale`.
   - Update the `:199` and `:208` comments ("the mirror is basis 1") to "basis 1 under model `half_ppr`".
   - `basisScale = 1` must be byte-identical: T-RM3…T-RM12 and T-QB-4 pass unchanged.
2. **`lib/inSeasonEvidence.mjs`** prospect mirror: `prospectPriorPPG` (and whatever reads
   `PROSPECT_MIRROR.positionPriorPPG`) takes `basisScale = 1` and multiplies the position prior, as
   `computeProspectScore` does (`dynastyScore.js` `priorPPG = POSITION_PRIOR_PPG × basisScale × …`). Read the app's
   two call sites (`dynastyScore.js:735, 1001`) and mirror which one each data-side arm reproduces. The `noMarketCap`
   bound is on `max(peak, 1)`, where peak is league-basis under `league` because `positionPeakPPG` comes from the
   rescored rows — no extra scaling there; state that in a comment.
3. **Harness plumbing.** `scripts/inseason-run.mjs` and `scripts/inseason-dyn-run.mjs` take `basis`
   (`'half_ppr'` default per D5 | `'league'`): pass it to `loadFactorInputs`, wrap their own `load` (the
   `loadSeasonTotals` used directly at `:157-168`, `:270-277`, `assembleSeason`) with the **same** `leagueBasisLoad`
   instance (both scripts name `leagueBasisLoad` literally — the registry claim in B2 binds to it), and pass
   `basisScale = basisScaleOf(load, S, position)` into every `reconstructShippedRookieProjection`/`rookieRecordFor`/
   prospect-prior call for the season whose prior it is. That includes **`rookiePriorFor`** (`inseason-run.mjs:232`),
   which takes a `basisScale` argument and is called by the dynasty run at `inseason-dyn-run.mjs:835`, `:850` (a
   season **S+1** prior → `basisScaleOf(load, S + 1, …)`) and `:878`; the Q4b drift check at `:925` must then compare
   like-scaled values (scale both sides, never one). The Q4 GS arm's rookie starter level (`starterPPG` from
   `backtests/2026-10-04-qb-rookie-level-constants.json`, `INSEASON_DYN_LOAD.loadQbRookieLevelConstants`, `:55`) is
   × scale under `league`, as the app's `resolveRookieQbStarterLevel` does. One loader instance per run, so the
   factor path and the evidence path cannot see different rows.
   - **Constants-file shape.** The writers (`inseason-run.mjs:1479/1503`, `inseason-dyn-run.mjs:1094/1142`) keep the
     existing top-level string `basis`, which becomes `'league'` on a league run; a league file adds one top-level
     `basisDetail: { scoringFixture, positionFile, scaleBySeason }`. There is no `meta` key; do not add one.
   - **`DYN_2A_PIN`** (`inseason-dyn-run.mjs:45-48`) is keyed by qbPrior × basis: `starter.half_ppr` = today's
     2026-10-07 file; `starter.league` = a path passed in by the run (`--inseason-2a <path>`, required with
     `--dynasty --basis league`), so G2 can point the dynasty run at the league 2a file it just wrote.
4. **Tests** (`test/rookie-mirror.test.mjs`, `test/inseason*.test.mjs`): `rookiePriorFor` threads `basisScale`
   and the Q4b drift check passes with both sides scaled; a league dyn run without `--inseason-2a` throws; scale 1.2 multiplies baseline, knee and
   asymptote; the ceiling closed form at a scaled knee; QB level × scale; prospect prior × scale; the harness passes
   the as-of scale for S (a two-season fixture where the scale differs by S).

## 3. Stage A3 — the graded before/after (data; `--basis league`, one commit)

`bin/backtest.mjs`: `--inseason` (and `--inseason --dynasty`) admit `--basis half_ppr|league`; `bin/panel.mjs --fit`
admits `league` beside its two values. Every other mode still rejects it. Update both header doc lists. New
`scripts/league-basis-run.mjs` (`runLeagueBasis`, `bin/backtest.mjs --league-basis`, flags `--json`, `--write`) runs
G1–G3 and writes the verdict. Hand-run, never a test.

**Write the decision rule into the verdict file before reading any result** (Invariant: pre-registered).

### G1 — mirror fidelity (a gate: if it fails, stop and report; G2 is not read)

Snapshot rows carry no position field. Recover a rookie row's position as T-RM10 does, but from
`basePPG / rookieBasisScale ∈ ROOKIE_BASELINE_PPG` (post-switch `basePPG` is baseline × scale, e.g. 14.482 =
13 × 1.114; plan review measured 310/310 rows recovered on 2026-10-14: QB 1.114 ×49, RB 1.118 ×77, WR 1.101 ×125,
TE 1.325 ×59). Pre-switch rows recover from `basePPG` directly.

- **G1a scale.** `reconstructPositionBasisScale` at S = 2026 equals the captured `rookieBasisScale` of every
  rookie-path row of `snapshots/2026-09-25.json` and `2026-10-14.json`, per recovered position, exact at 3 dp.
  Report qualifying-row counts and D3's position diff. A miss names position, both values and counts, and stops (no
  tuning).
- **G1b rookie rows, post-switch — new T-RM16** (T-RM15 is taken, `test/rookie-mirror.test.mjs:822`). Slim fixture
  `test/fixtures/rookie-mirror-parity/snapshot-2026-10-14.slim.json` by the T-RM9/T-RM10 generator pattern (its
  header holds the command); the slim key list adds `rookieBasisScale`, `rookieMultiplierProduct`,
  `rookieTotalFactor`/`rookieTotalBasis`, `qbTakeoverBasis`, `qbStartShare`, `qbStarterPPG`/`qbStarterBasis`.
  Asserted under `league` (captured scale, `CURRENT_*` models), counts pinned:
  - `basePPG === round3(ROOKIE_BASELINE_PPG[pos] × rookieBasisScale)` (the scaled baseline);
  - `rookieCeilingPPGPre` is a captured **input** (the mirror holds ktc/college at 1.0, so it cannot reconstruct
    it); check it equals `basePPG × rookieMultiplierProduct × rookieCalibrationMult` at 3 dp (count pinned);
  - from that input: `rookieCeilingKnee`/`Asymptote` exact (scaled constants), the ceiled level and `projectedPPG`
    at T-RM10's tolerances, `qbStarterPPG` on `rookie:*` rows = `round3(QB_ROOKIE_STARTER_PPG[g] × scale)`
    (T-QB-4's rule), `projectedTotalPts` with `rookieTotalFactor` (boundary 9);
  - `qbTakeoverBasis: 'chain'` rows (46 on 10-14) are excluded from the `projectedPPG`/total assertions with the
    count pinned — the CR-15 Mirror says the reconstruction does not compose share × level.
  Under `half_ppr` (scale 1) report the mismatch count per field — the "before".
- **G1c the boundary.** The same checks on `snapshots/2026-09-24.json` (no `projectionBasis`; models `legacy` on
  boundaries 5, 6, 9) pass under `half_ppr` and fail under `league`; `2026-09-25` the reverse. Counts per side. This
  is anchor-policy boundary 4a's cross-check.
- **G1d veteran `basePPG` — new T-F10L.** T-F10 (`test/panel-fit.test.mjs:1446ff`) asserts `basePPG` exact at 1 dp
  on `snapshots/2026-07-05.json`. Extend its generator to a second fixture
  `test/fixtures/r3fit-parity-2025/league-2026-10-14/` whose career seasons carry league `fantasyPoints` from
  `rescoreSeasonRowsLeague`; T-F10L asserts `basePPG` exact at 1 dp on 10-14's veteran rows (436 candidates),
  counts pinned; the same rows under half-PPR fail (count reported). Fix T-F10's basis comment (`:1460-1463`):
  "true for captures before 2026-09-25 (boundary 4a)". `isTdReliant`, `consistencyScore`, `outlierRatio` are
  reported as match rates, not asserted.

Invariant 10: T-RM16 and T-F10L read only their committed slim fixtures, never `snapshots/` (2026-10-14 is the
newest local capture today).

### G2 — the k re-fit (the wiring decision)

**Order.** (1) `--inseason --basis league` writes `backtests/2026-10-<dd>-inseason-league-constants.json`.
(2) `--inseason --dynasty --basis league --inseason-2a <that file>` writes
`…-inseason-dyn-league-constants.json`. Every other default unchanged — the pinned grading horizon is each mode's
committed seasons, checkpoints, outcomes and populations. (3) For the case where the 2a file turns out
`do-not-wire`, re-run the dynasty step against the shipped 2a file (`--inseason-2a
backtests/2026-10-07-inseason-constants.json`) and decide the dynasty file on **that** run, because that is the 2a k
the app would keep. Both dynasty runs are reported.

**Shipped files:** `backtests/2026-10-07-inseason-constants.json` and `2026-10-11-inseason-dyn-constants.json` (the
files `IN_SEASON_CONSTANTS_SOURCE`/`IN_SEASON_DYN_CONSTANTS_SOURCE` name; assert the commits match).

**Per pinned entry** (each `constants[name][pos]` the app pins): compare the shipped file's emitted `k` with the
league file's emitted `k` — never `pinK(kFit)`, because the emitted k comes from the file's own pin rules
(`pinDecision`, `inseason-run.mjs:634-639`: boundary → null/0, WORSE-vs-study → study; pooled entries re-derive from
`fixtureKey …|ALL`). The out-of-sample comparison is `analyzeKCell(rows, spec, { studyK: shippedK })` on the league
rows of the cell the entry re-derives from (`fixtureKey ?? name|pos`): its `delta` is the paired leave-one-season-out
|error| difference (league fold k − shipped k), clustered by player with the mode's pinned bootstrap, labelled by
`compareLabel`. The shipped k keeps a small leakage advantage (it was fitted on all seasons). Report, per entry:
shipped k and basis, league k and basis, rows, players, the delta and label, and the weeks-method counts. Entries
whose emitted k are identical are `same` (the delta is still reported).

**Excluded from the decision (basis-invariant):** `K_ROS_OPP`, `K_DYN_OPP`, `K_ROS_SHARE` — no points in prior,
evidence or outcome. Listed, not pooled. **Study entries** (`basis: 'study'` — shipped `K_DYN_POINTS_HISTORY.QB`
7.5, `K_ROS_POINTS_SHORT.TE` 4, plus `K_DYN_POINTS.RB`, `K_DYN_OPP.TE`) keep their pin rule under league: they stay
`study` with the study value unless the league run's own rule emits a different basis; they are reported separately
and decided like any other entry on their emitted k.

**Decision (pre-registered), per file:** `wire` iff at least one points entry is `BEATS`, no points entry is
`WORSE`, and the pooled points-only paired delta (all points entries' rows) is `BEATS`. With roughly 40 points entries
at 95% intervals, one spurious `BEATS` or `WORSE` is expected by chance; requiring the pooled delta to be `BEATS` as
well is the guard against that, and the verdict states the exposure. Otherwise `do-not-wire`, naming the entries.
On `wire` the app takes the league file's emitted `k` for every entry (its provenance test re-derives every `K_*`
from one fixture).

**The dynasty file also carries `prospectPriorKind`, `decisions` and `reuse`** (CR-25: `PROSPECT_PRIOR_KIND` must
equal `prospectPriorKind.kind`; a kind cell "flips only on a committed re-run of it"). Pre-registered: list every
difference with `diffDynConstants`. A dynasty `wire` additionally requires `prospectPriorKind.kind`, `decisions` and
`reuse` unchanged from the shipped file; if any changed, the dynasty file is `stop-and-report` (Session 1 takes it to
Anton) rather than wired, because those are decisions, not k.

Expected, stated so a surprise is visible: k is dimensionless and the scale is ~1.10–1.33 per position, so most
entries should be `same`/`NO-GAIN` and `do-not-wire` is the likely outcome. That still lands the mirror model; it
does not re-pin.

### G3 — R3-FIT transport (report-only)

`bin/panel.mjs --fit` twice under the current default models (`step4-upside`, `qb-takeover`), `--basis half_ppr` and
`--basis league`; a per-factor table of the verdict labels and exponents side by side. No exponent is activated and
`--fit`'s default stays `half_ppr`. If any label differs, the verdict says the committed `r3fit-exponent-harness.md`
verdict does not transport to league basis, and Session 1 records a backlog item; nothing else.

### Artifacts and the anchor row (same commit)

- `--write` persists `backtests/2026-10-<dd>-league-basis-panel.json` (G1 counts, G2 entry tables, G3 table) and
  `grading/2026-10-<dd>-league-basis-verdict.md` (unregistered — the documented Invariant-3 exception), with the
  constants files.
- **`grading/anchor-policy.md` boundary 4a** (written in A3, because G1c is its cross-check):
  - table row: `4a` | app `47af353` + fix pass `38acc39` (state whether `38acc39` moved projection output — from its
    diff: it touched backlog text and tests only, confirm) | the **app push**, which git does not record: "pushed
    after 2026-09-25 19:21:51 UTC (`38acc39`), before 20:05:54 UTC (the first league capture,
    `snapshots/2026-09-25.json`)" | both | season rescore (league basis; `positionBasisScale` on rookie constants);
  - a section "Both paths — boundary 4a (scoring basis)": **row-detectable from the envelope** — `projectionBasis`
    `'league'` → league; absent or `'half_ppr'` → half-PPR (a per-season `live-api` provenance in `inputStatus` was
    league-scored even before, CR-01); `'mixed'`/`'unknown'` → unclassified; rookie rows also carry
    `factors.rookieBasisScale`. It moves every `projectedPPG` and `projectedTotalPts` on both paths, so **any pooled
    grade spanning it measures the basis change**; grade each side against outcomes in its own basis (D-44's
    segmentation; D-44 stays open for the grader change). Cross-check: G1c's counts;
  - fix the header counts ("nine changes" → ten; the axis list) and "Boundaries by path".

### Stage A hand-back
SHAs; the acceptance hashes (§1.4); G1 counts and pass/fail; the G2 entry tables, both dynasty runs, the
`diffDynConstants` list and both file verdicts; the G3 table; `npm test` counts; every deviation.

---

## 4. Session 1 between A and B

Run implementation-reviewer on Stage A. Read the verdict against the pre-registered rule, not the narrative. If G1
failed, or a dynasty file is `stop-and-report`, stop and report to Anton. Otherwise push Stage A (§0 Route) and tell
Stage B which file(s) wire, citing the pushed SHAs.

## 5. Stage B — app (`sleeper-dashboard`)

First `git -C ../sleeper-dashboard-data log -1` must show the **pushed** Stage A. Messages end
`(league-basis-mirror)`. One commit per wired file (B1), else one comment commit (B1′); then B2, B3.

- **B1 — per file whose verdict is `wire`.**
  - Copy the constants file byte-for-byte to `src/__fixtures__/inseason-constants-2026-10-<dd>.json` (2a) or
    `src/__fixtures__/inseason-dyn-constants-2026-10-<dd>.json` (dyn) — the names CR-25's trigger globs already
    match; the league provenance is the file's `basis`. Delete the superseded fixture (precedent `df3f19a`).
  - Point `IN_SEASON_CONSTANTS_SOURCE` (or `IN_SEASON_DYN_CONSTANTS_SOURCE`) at it with the pushed data SHA, and set
    every `K_*` of that family to the file's emitted `k` so `src/__tests__/inSeasonConstants.test.js` re-derives them.
  - Re-target the test's hard-coded pins: the static import path (`:4`), `FIXTURE_PATH`/SHA1 (`:11-12`), the length
    (`:80`), the source string (`:84`), `file.basis === 'half_ppr'` → `'league'` (`:87`), the entry count, the
    `STUDY_COMPARATOR` block (`:36-42`, from the league verdict's study entries), the Q4 branch tests built on real
    cells (`:133-152`: re-pick cells that exercise the same branches in the new file, or keep the synthetic values
    and say so); for the dyn file `:158-166` (path, SHA1, length, `commit.startsWith`) and `:184-196` unchanged by
    G2's rule. `src/utils/inSeasonScoring.test.js:344-346` hard-codes `K_DYN_POINTS_HISTORY.RB === 4` and 17.14 —
    update from the new k. Grep `src/` for any other literal k before committing.
  - D6: `PRIOR_MODEL_FROM` stays `2026-10-14`; `priorModelFrom.test.js` passes unchanged.
  - Comments: 2a file — rewrite `inSeasonConstants.js:2-3` (source line), `:10-11` (the "Basis:" sentence → league,
    D-46) and `:34` ("re-fitted against the current … model" → by D-46 in league basis); dyn file — add a "Basis:"
    line to the dyn block (`:51-57`) and update `:52-55`'s "kFit 3.6 → 3.5" if the value moved.
  - Nav docs: `docs/navigation.md:57` and `docs/nav/utils.md:48` name the fixtures — update.
- **B1′ — per file whose verdict is `do-not-wire`:** comment-only. 2a — `:10-11` becomes "fitted on the half-PPR
  panel; the league-basis re-fit (D-46, `grading/2026-10-<dd>-league-basis-verdict.md`) did not beat it out of sample,
  so the half-PPR pins stand". Dyn — add a "Basis:" line to `:51-57` saying the same. No value, fixture or source
  block moves. (One file wiring and the other not = one B1 commit + one B1′ commit.)
- **B2 — registry** (`docs/cross-repo-registry.md`, mirrored region only): the companion's edits for CR-15, CR-25,
  CR-02, CR-14 and CR-01. Gates, all in the hand-back:
  1. run the data repo's claim check (`extractSymbolFileClaims` + `symbolResolvesIn`, `lib/registry.mjs`) over the
     edited region against data HEAD with Stage A pushed: zero unresolved claims (weekly-scoring-keys fix pass 4 is
     what happens when this is skipped);
  2. `git diff --stat` shows only `docs/cross-repo-registry.md`;
  3. record the md5 of the **mirrored region** (between the sentinels), as `weekly-scoring-keys.md:463` did.
- **B3 — backlog** (`.claude/tasks/data-repo-backlog.md`): D-46 "in progress — Stage C pending" (Done only after the
  data push, as D-47's B4); D-45 gains "the `league` model (D-46) supplies league season inputs and
  `positionBasisScale`; its refits run under `--basis league`". A G3 finding becomes a new D-id (grep the highest
  first).

Done (app): `npm test`, `npm run lint`, `npm run build` green; on a B1, a dev-server smoke of one in-season row (the
Market In-season column shows the new k's value). Session 1 reviews and pushes the app (`git pull --rebase` first).

## 6. Stage C — data, same day

- **C1** — registry byte copy of the app's mirrored region. Gate: `REGISTRY_MIRROR=1 node --test
  test/registry-mirror.test.mjs` green, the region md5 equals B2's, `npm test` green (`test/registry.test.mjs`
  resolves every claim), diff touches only `cross-repo-registry.md`.
- **C2** — only if a file wired: flip that mode's default to `league` (D5), keep `--basis half_ppr` reproducing the
  committed files, and add **anchor boundary 10** — table row (app B1 SHA, the app push time, both paths, in-season
  k re-pin) and a section: captures carry `inSeason.ros.k`/`inSeason.next.k`, so a row is classified by comparing
  its `k` with both pins of its entry; entries whose pin did not move are unaffected; projections do not move (D6).
  Cross-check: the first capture after the app push carries the new k on every re-pinned entry — open a dated watch
  D-id, as D-70 did.
- **C3** — docs: `CLAUDE.md` Commands row (`--league-basis`, `--basis league`) and the `--fit` sentence ("pins
  `--basis half_ppr`" → "defaults to `half_ppr`; `league` is report-only"); README backtest section;
  `data-catalog.md` nothing (no served change). `test/claudeMdSize.test.mjs` is at the ceiling: prune in the same
  commit, never raise it. Commit this task file and its companion with review/fix-pass sections.

Done: `npm test`, `npm run smoke` green; `git pull --rebase` (bot commits daily), push. No CDN purge — no served file
changes. After the push Session 1 moves D-46 to Done with the data SHAs.

## 7. Risks and stop conditions

- **G1a misses** on stale positions (D3) or a median rule difference: stop. Do not substitute captured scales into
  the fit — the as-of scale is the model.
- **Weeks fall back.** D-47 measured exact on 100% of weeks; if `scaled` > 0.5% of G2 rows in any season, report it
  in the verdict (the app would scale those weeks too, so the fit stays faithful; it is a data-quality signal).
- **QB takeover features** (`qbTakeover.mjs` `ppgAt`/`priorPPG`) become league points under the wrap. That is what
  the app does (its hazard constants, CR-27, were fitted on half-PPR and applied to league features since 10-04). Not
  refitted here; G2 reports the QB start-chain share distribution under both bases so a basis effect is visible.
- **Runtime.** G2 runs up to five full in-season passes (2a, dyn on the league 2a, dyn on the shipped 2a, plus the
  §1.4 baseline pair); run them in the background and cache nothing in the repo.

## 8. Cross-repo impact

Full text, Mirrors verbatim: [`league-basis-mirror-registry.md`](league-basis-mirror-registry.md).
- **CR-15** fires (the mirror gains a versioned basis model; rookie mirror and prospect prior take `basisScale`).
- **CR-25** fires (a new harness basis; a possible re-pin; the `PROSPECT_MIRROR` scale).
- **CR-02** fires on its Data side only (a new data-side reader of `weeklyStats`/`fantasyPoints`; no row change).
- **CR-01** fires on its Data side only: new offline readers of capture fields (`projectionBasis` for D5's model
  choice, `factors.rookieBasisScale`, `basePPG`, `rookieMultiplierProduct`, `rookieCeiling*`, `qbStarterPPG`) in
  `scripts/league-basis-run.mjs` and the T-RM16/T-F10L generators; `resolveScoring` gains a fixture-read branch; and
  the Mirror gains a boundary-4a "segment by `projectionBasis`" sentence like boundaries 5/6/8/9. No envelope or
  `schemaVersion` change.
- **CR-14** consumer only — the port is read, not edited; B2 adds `lib/leagueBasis.mjs` to its Data-side consumer
  list (cache addition).
- **CR-26** checked: D6 keeps `PRIOR_MODEL_FROM`, so the frozen-prior gate is untouched.
- Not fired: CR-27 (constants untouched; §7 note), CR-28/29 (no served write).

---

## Review record (plan gate, 2026-10-16)

plan-reviewer ran twice: data repo at full depth (15 flags; `npm test` 1542/1546 pass, 4 skipped; registry mirror
21/21) and app repo (17 flags, 1 blocker). Session 1 checked each against live source and applied all of them:
- **Blocker (app):** the CR-25 Data-side wording ("… use in `path`") did not bind in `lib/registry.mjs:178-180` →
  every companion Data-side edit is now the forward form; Session 1 ran `extractSymbolFileClaims` on the proposed text
  and every symbol binds to its intended file. B2 gains the claim-check / registry-only / region-md5 gates.
- **G2 rewritten:** compare emitted `k` (not `pinK(kFit)`) via `analyzeKCell(…, { studyK })`; study and pooled
  entries follow the file's own pin rules; basis-invariant opp/share entries excluded; pooled points-only delta must
  `BEATS` (multiplicity guard); 2a runs first and the dynasty run reads it through a basis-keyed `DYN_2A_PIN`, with a
  second dynasty run on the shipped 2a for the 2a-`do-not-wire` case; a dynasty `wire` needs `prospectPriorKind`/
  `decisions`/`reuse` unchanged, else stop-and-report.
- **Constants shape:** the existing top-level string `basis` carries `'league'`, plus `basisDetail`; no `meta`.
- **G1:** position recovery by `basePPG / rookieBasisScale` (310/310 measured); T-RM15 → T-RM16; `rookieCeilingPPGPre`
  treated as a captured input; `chain` rows excluded with a pinned count; slim key list extended.
- **§2.3:** `rookiePriorFor` (incl. the S+1 call and the Q4b drift check) and the Q4 GS level take the scale.
- **§1:** the `:167` basis mapping and `:302` labels; one shared wrapped loader; scale-1 fallback; test (e) gated by
  `REGISTRY_MIRROR=1`; (f) moved to the hand-run acceptance.
- **Stage B:** Stage A pushed before B1 (SHA stability); B1 lists every hard-coded test pin, fixture names matching
  CR-25's globs, the superseded fixture deleted, nav docs, per-file comments, lint/build/smoke.
- **Registry:** CR-01 fires (Data side + a boundary-4a segment sentence); CR-14 consumer addition in B2; CR-15 states
  the harness-default exception, the `iq` sentence and the `sleeperStats.js` trigger; CR-25 triggers gain
  `rescoreSeasonTotals`/`positionBasisScale`; CR-02 qualifies its half-PPR readers and adds `weekly-basis-run.mjs`
  (`[registry-stale]`).
- **Anchor 4a:** records the push window (after 19:21:51, before 20:05:54 UTC), not the commit time.
- **D3/D5:** position-diff reporting; `'half_ppr'`/`'mixed'`/`'unknown'` envelope values mapped.
- **Verified by reviewers, no flag:** the plan's `rescoreSeasonTotals` description matches every branch; G1a
  re-derived exactly (QB 1.114, RB 1.118, WR 1.101, TE 1.325); D2's settings deep-equal on 09-24/09-25/10-14; the
  wrap reaches every points reader in both in-season modes; D6 is consistent with CR-25/CR-26 and
  `priorModelFrom.test.js`; Mirror quotes byte-equal.
- **Unverified:** G1b–G1d match counts, G2 outcomes and runtime, the app push time of `47af353`/`38acc39`.

---

## Stage A verification (Session 1, 2026-10-16)

Stage A: pushed as `cc6e125..cb27d88` (A1 `1de4942`, A2 `343cb51`, A3 `cb27d88`; plan commit `cc6e125`). The
push-time rebase renamed them from `1d80491`/`69ef2fa`/`af36667`/`88d509f`, which the review and the hand-back cite;
the committed verdict's header still says "generated at `af36667`+local" (Fix pass 1 item 2 regenerates it). Verdict: both files `do-not-wire`; G3
finds QB `sensitivityVerdict` UNSTABLE → CLEARS under league (a backlog item at B3).
- **G1b deviation accepted (Anton, 2026-10-16).** Captured `rookieMultiplierProduct` is rounded (2 dp on 68 rows,
  3 dp on 242), so §3's literal "equals … at 3 dp" cannot hold. The ceiling-input check is redefined as the
  product's rounding bound, `0.005 × baseline × calibration + 5e-4`: 0 rows outside under `league`, 310/310 outside
  under `half_ppr`. Every other G1 field passed as specified. G1 reads PASS.
- **implementation-reviewer** (full depth, `1d80491..88d509f`): ports faithful to `sleeperStats.js:314-370`,
  `dynastyScore.js:40-81, 141-146`, `seasonProjection.js:335-369, 378, 494, 504, 617`; `half_ppr` constants
  deep-equal the shipped 2026-10-07 / 2026-10-11 files; a fresh league 2a run reproduces the committed file;
  `npm test` 1601/1606 (5 skipped), `npm run smoke` exit 0; Invariant 10 holds; registry and manifest untouched.
- **Blocker resolved — pooled-delta reading (Anton, 2026-10-16).** The 2a verdict depends on which rows the pooled
  points delta includes. Pre-registered reading applies: all points entries' rows, deduplicated per cell as
  implemented (`same` entries included) → mean −0.0002 [−0.0032, 0.0027], 147,351 rows, 21 cells, NO-GAIN →
  **2a `do-not-wire`**. Recorded for disclosure: pooling only the 8 entries whose emitted k differs gives −0.0109
  [−0.0194, −0.0031] BEATS, driven almost entirely by `K_ROS_POINTS_SHORT.TE` (shipped `study` 4 vs league pooled
  1.5, Δ −0.141 [−0.225, −0.062], measured on `q4|X-short|ros|ALL` rows of every position — a study-pin question,
  not a basis effect). Backlog: re-examine that study pin independent of basis (Stage B3). A wire would also have
  added `K_DYN_POINTS_WEAK.WR`/`STRONG.WR`, absent from the shipped file — moot under `do-not-wire`.
- **Re-run provenance (review flag 2), answered by Session 2:** between G2 runs 1 and 2 only
  `scripts/league-basis-run.mjs`/`test/league-basis-run.test.mjs` changed — the shipped-commit lookup (`--diff-filter=A`
  → `log -1`), `TEAM_` rows dropped from the per-season weeks table, and wording. `compareConstantsFiles`, `decideFile`'s
  rule, `pooledParts`, `same` handling and `BASIS_INVARIANT_ENTRIES` were untouched; run 1 had identical verdicts and
  pooled deltas (2a −0.0002 NO-GAIN; dyn +0.0120 WORSE, its single entry `same`).
- **Dynasty file `do-not-wire`** (decided on the shipped-2a run): its one decided entry `K_DYN_PROSPECT_A_YE1` is
  `same` (3.5); the pooled WORSE is fold-k leakage on an identical k, not a basis effect.

## Fix pass 1 (deferred to Stage C; minor, no result moves)

From the implementation review; none changes a k, a label or a verdict, so Stage A is pushed without it. Stage C
applies it via fix-applier in its own commit, then implementation-reviewer re-runs once on that diff.
1. `scripts/league-basis-run.mjs:774, 780` — compute the G1b counts in the verdict text from the result
   (`g1.b.league.rows − capturedCeilingInputConsistent`, the 2-dp/3-dp count of `rookieMultiplierProduct`,
   `fields.ceilingInput.fail`) and gate the D3 sentence on `g1.a.pass`, instead of literals.
2. `buildLeagueBasisVerdictMarkdown` — under Verdicts, print both pooled readings (all points entries, the decision;
   differing-only, disclosure) with the `K_ROS_POINTS_SHORT.TE` caveat; when every decided entry is `same`, say the
   pooled delta measures fold-k leakage only. Regenerate `grading/2026-10-16-league-basis-verdict.md` from the
   committed panel JSON (no re-run; constants files untouched).
3. `test/league-basis-run.test.mjs` — the "verdict markdown" test asserts `indexOf('Pre-registered decision rule') <
   indexOf('## Verdicts')` on a synthetic result; assert `cmp.pooled.label`/`rows`/`cells` on the synthetic BEATS
   cell plus a two-entry/one-cell case pinning the dedup and the `same`-included rule.
4. Unit-test `levelOf` (Q4 GS level × scale, `inseason-dyn-run.mjs:898`) and the S+1 prior scale (`priorY2`, `:867`)
   on a wrapped two-season load.
5. `lib/leagueBasis.mjs:195-203` — delete the unused `pidsAbsentFromPlayers` export, or use it in `runG1`
   (`league-basis-run.mjs:255-260`). Pick the delete.

## Stage C hand-back (Session 2, 2026-10-16)

No C2: both constants files were `do-not-wire`. Four commits on data `c8338ba` (not pushed):
- **C1 `b26990b`** — registry byte copy of the app's mirrored region @ `59b8c09`. Touches only `cross-repo-registry.md`
  (14+/14−). Gates: region md5 (`sed -n '/^<!-- CR-REGISTRY-BEGIN -->$/,/^<!-- CR-REGISTRY-END -->$/p' | md5`)
  `d1cdbabc1c3007301bffafa157c38313` on both sides; `REGISTRY_MIRROR=1 node --test test/registry-mirror.test.mjs` 21/21;
  `npm test` 1601 pass / 5 skipped / 0 fail (`test/registry.test.mjs` resolves every claim).
- **Fix pass 1 `5d449c9`** — items 1–5. Files: `scripts/league-basis-run.mjs`, `scripts/inseason-dyn-run.mjs`,
  `lib/leagueBasis.mjs`, `test/league-basis-run.test.mjs`, `test/inseason-dyn.test.mjs`,
  `grading/2026-10-16-league-basis-verdict.md`. `git diff --stat -- backtests` is empty: every constants and panel JSON is
  byte-identical. `npm test` 1605 pass / 5 skipped / 0 fail.
- **C3 `4ea26d0`** — `CLAUDE.md` (Commands row, `--fit` sentence; 24,979 B, ceiling 25,000, pruned "monitoring only;" from
  the Dead-man row, ceiling untouched) and `README.md` (panel flags, `--fit` basis paragraph, new "League-basis graded
  before/after" section). `data-catalog.md` untouched.
- This section (task file commit).

`npm run smoke` exit 0. `npm test` on the last code commit: 1610 tests, 1605 pass, 5 skipped, 0 fail.

**Deviations / notes for review**
1. *Item 2 — differing-only pool.* The panel JSON does not hold the differing-only pooled delta. `compareConstantsFiles`
   now returns `pooledDiffering` (cells where at least one entry's emitted k differs; disclosure only, never read by
   `decideFile`), but the committed verdict was regenerated from the JSON with no G2 re-run, so that one figure (mean
   −0.0109 [−0.0194, −0.0031], BEATS) was injected in memory from the Stage A verification record above; its cells/rows/players
   are therefore omitted from the line. The panel JSON was not edited.
2. *Item 1 — 2-dp/3-dp counts.* `checkRookieRows` gained `productDp2`/`productDp3` for future runs; the regeneration took them
   (68/242) from the committed slim fixture. The text tolerates their absence (prints "—").
3. *Item 4 — small exports.* To unit-test them, `levelOf` and the `priorY2` expression were extracted unchanged into exported
   `rookieQbLevelAt` and `priorY2At` in `scripts/inseason-dyn-run.mjs`; call sites use them (dyn tests 93/93).
4. *Item 3 — fixture.* The verdict-markdown tests build their result from the committed 2026-10-16 panel JSON with the 2a
   comparison swapped, rather than a fully hand-built result (the rest of the result shape is unaffected).
5. The regenerated verdict header still reads "generated at … `af36667`+local" (meta in the JSON; `af36667` was renamed
   `cb27d88` at push). Not touched — outside items 1–5.
6. Dynasty "Pooled points delta" line prints "1 cells" (cosmetic).
