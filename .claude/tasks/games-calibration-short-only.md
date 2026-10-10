# Projected-games calibration — short-season-only candidates (L6c)

Session 1 (opus), 2026-10-09. A small extension of L6b; its task file is `.claude/tasks/games-calibration-cause-split.md`
and its verdict is `grading/2026-10-09-games-cause-verdict.md`. L6 is `.claude/tasks/projected-games-calibration.md`.

Planned against data `feae053` (clean tree). Sonnet implements it in one Session 2.

**Offline research only.**
- No served file changes, and no manifest entry.
- `nfl/`, `nflverse/` and `snapshots/` are read-only.
- The app is untouched.
- The output is a verdict that **Anton reads before any wiring slice is planned**.

## 0. Question and decisions

L6b's verdict §5 shows where every fitted candidate's gain and loss come from:
- **The gain is on short-season rows.** The star cohort's MAE goes 7.00 → about 5.3 (ΔMAE ≈ −1.6).
- **The loss comes from qualifying rows.** Relevant-player ΔMAE is +0.40…+0.53. Nearly every relevant row is `qual` (1,740 of 1,762), and every candidate also fits k ≈ 0.80–0.87 there.

L6c tests one idea. **Keep the app rule on qualifying S-seasons and fit k only on non-qualifying ones**:
- **`SOf0`:** k by position × S-state (`short` / `none`), floor 0.
- **`SOK1f0`:** the same, with L6b's app-native K1 cause split (`short-inj` / `short-oth` / `none`).

If a candidate passes, the verdict recommends wiring it. If none passes, it recommends closing L6 with no change.

**D1 — fit objective (unchanged).** Each cell's k minimises training SSE.

**D2 — cohorts (unchanged from L6b).**
- `relevant`: top-N by S total points.
- `star`: `rel3 ∧ sState ≠ qual`.
- `R*`: `relevant ∪ star`, the tie-break population.

**D3 — δ (unchanged).** Primary δ = 0.25; δ = 0.10 and 0.50 are also computed and reported.

**D4 — gates (Anton's list).** Gate ids keep L6b's numbers so the two verdicts compare line by line.

| id | gate | vs L6b |
|---|---|---|
| G1 | relevant ΔMAE `ci95[1] ≤ δ` (non-inferior). A null ci fails. | same |
| G3 | star ΔMAE `ci95[1] < 0` (**improved**). A null ci fails. | stricter: L6b only required `≤ δ` |
| G4 | all-veteran ΔMSE `ci95[1] < 0`. A null ci fails. | same (the "all veterans secondary" check) |
| G5 | no position whose relevant ΔMAE `ci95[0] > δ`. A null ci does not fail. | same |

**G2 (relevant bias) is dropped as a gate and reported instead.**
- By construction the candidates leave qualifying rows, and therefore relevant bias (+1.6), unchanged. G2 would fail mechanically.
- Anton's gate list does not include it.
- L6b already showed that removing that bias costs 0.2–0.4 relevant MAE.

**D5 — qualifying rows use the app prediction itself (`r.pred`), not `candidatePred(avgGames, 1, 0)`.**
- On the panel, 21 qualifying rows have `avgGames < 8`, and 11 of them would change if the floor were 0.
- Anton asked for "prediction unchanged". Only non-qualifying rows get floor 0.

**D6 — fit population.** The SO candidates fit on **non-qualifying training rows only**.
- The chain's root `pos` is therefore the pooled non-qualifying k for that position.
- Thin cells (`RB|none`, `QB|none` in the full sample) fall back to that root, never to an all-rows k.

**D7 — references.** L6b's `C3f0` (L6's pick) and `K1f0` are refitted in the same folds. They are tabled and never walked, so each table shows the qualifying-row cost side by side with the candidates.

**D8 — k grid unchanged** at `GAMES_CAL_DEFAULTS.kGrid` (0.50…1.20).
- Session 1's probe shows the lower bound binds: on a 0.20 floor the full-sample optimum is QB `short` 0.34 and WR `none` 0.37.
- That makes the fitted cuts conservative. The harness reports every cell sitting at 0.50; it does not widen the grid.

**D9 — parsimony.** `SOf0` < `SOK1f0`. K1 replaces `SOf0` only when its paired R\* ΔMAE CI upper bound is < 0.

## 1. Probe (Session 1 scratch script, read-only; the expectations Session 2 checks)

Same panel, folds and bootstrap as L6b. The tables give out-of-sample ΔMAE / ΔMSE vs C0, with 95% CIs.

| cohort (n OOS) | C3f0 ΔMAE | SOf0 ΔMAE | SOK1f0 ΔMAE |
|---|---|---|---|
| relevant (1240) | +0.53 [0.40, 0.66] | 0.00 [−0.02, 0.03] | 0.00 [−0.02, 0.03] |
| star (239) | −1.62 [−2.29, −0.95] | −1.61 [−2.33, −0.86] | −1.69 [−2.41, −0.94] |
| R\* (1469) | +0.18 [0.00, 0.35] | −0.26 [−0.39, −0.14] | −0.27 [−0.40, −0.15] |
| all veterans (3130), ΔMSE | −15.11 [−17.20, −13.11] | −11.27 [−13.18, −9.44] | −11.43 [−13.36, −9.58] |

- **Relevant bias:** C0 +1.62, SOf0 +1.56, SOK1f0 +1.57.
- **G1 is close to automatic.** Only 10 out-of-sample relevant rows are non-qualifying.
- **Relevant by position:** no CI lower bound exceeds 0.02, so G5 passes.
- **Paired R\* SOK1f0 − SOf0:** −0.012 [−0.026, +0.001]. The interval crosses 0, so K1 does not replace SOf0.
- **Expected verdict:** (W) SOf0 at every δ.

**Out-of-sample star rows by K1 state:**

| K1 state | n | actual mean | actual median | C0 | SOf0 | SOK1f0 |
|---|---|---|---|---|---|---|
| short-inj | 170 | 7.98 | 7 | 13.62 | 7.54 | 7.58 |
| short-oth | 45 | 5.44 | 4 | 13.18 | 7.49 | 7.02 |
| none | 24 | 8.88 | 10.5 | 13.50 | 7.13 | 7.13 |

**Full-sample k (non-qualifying rows):**
- SOf0: `pos|s` RB short 0.51, QB short 0.50, TE none 0.55, WR short 0.52, WR none 0.50, TE short 0.53. Root `pos`: RB 0.50, QB 0.50, TE 0.53, WR 0.50.
- SOK1f0: TE short-inj 0.73, RB short-inj 0.59, WR short-inj 0.52, QB short-inj 0.50; the rest are 0.50–0.55.

**Guardrail consequence (for Anton, not a gate):** Daniels, Wilson, Aiyuk and Ridley are all `short` in 2025, so SOf0 still takes them 17 → about 9. This is the same cut Anton rejected in L6. What changes is that qualifying players (e.g. St. Brown, Sutton, 17 → 13 under C3f0) are now untouched. The star table above is the data behind the cut.

## 2. Pure code — `lib/gamesCalibration.mjs`

Add a new section, `// ─── L6c short-season-only ───`, at the end of the file. Add every export to the header Exports block, under a new `L6c (…games-calibration-short-only.md) additions:` paragraph.

```js
export const SHORT_CANDIDATES = Object.freeze({
  SOf0:   { levels: ['pos|s', 'pos'], floor: 0 },
  SOK1f0: { levels: ['pos|k1', 'pos'], floor: 0 },
});
export const SHORT_CANDIDATE_IDS = Object.freeze(Object.keys(SHORT_CANDIDATES));
/** CAUSE_CANDIDATES entries refitted on all rows in the same folds: tabled, never walked (D7). */
export const SHORT_REFERENCE_IDS = Object.freeze(['C3f0', 'K1f0']);
export const SHORT_ALL_IDS = Object.freeze(['C0', ...SHORT_REFERENCE_IDS, ...SHORT_CANDIDATE_IDS]);
export const SHORT_TIERS = Object.freeze([['SOf0'], ['SOK1f0']]);
export const isShortFitRow = (r) => r.sState !== 'qual';
```

**`fitShortCandidate(trainRows, candId, { minCellTrainPlayers, kGrid } = {})`**

```js
fitCandidate(trainRows.filter(isShortFitRow), candId, { minCellTrainPlayers, kGrid, candidates: SHORT_CANDIDATES })
```

`undefined` options fall through to `fitCandidate`'s defaults. Do not change `fitCandidate`.

**`shortPred(model, r)`** returns:
- `{ p: r.pred, k: 1, requested: null, used: 'qual', fallback: false }` when `r.sState === 'qual'` (D5);
- otherwise `const kk = kFor(model, r); return { p: candidatePred(r.avgGames, kk.k, model.floor), ...kk }`.

`model` is a `fitShortCandidate` result, so it carries `levels` and `floor`.

**`shortEligibility(summary, delta)` → `{ eligible, failed }`.**
- `summary` has the same shape as `causeEligibility`'s; the `relevant.bias` / `c0Bias` fields are present but **not gated**.
- Apply G1, G3, G4 and G5 exactly as tabled in D4. Push the failing ids in that order.

**`decideShort({ summaries, paired, delta, recon, tolerance = GAMES_CAL_DEFAULTS.reconcileTolerance })`** returns `{ outcome, pick, eligibility, text }`, following `decideCause`'s structure:
- `S` on a recon breach, with the same text as `decideCause`.
- Compute eligibility for every key of `summaries` (references included). Walk only `SHORT_TIERS`.
- The first eligible tier member is the incumbent. A later one replaces it only when `paired(member, incumbent)` is non-null and its `[1] < 0`.
- Texts:
  - W: `` `(W) wire ${pick} at δ = ${delta} — relevant players non-inferior and injured-star error improved; a wiring slice (app seasonProjection.js Step 6, CR-28) is planned separately after Anton reads this verdict.` ``
  - N: `` `(N) no change at δ = ${delta} — no candidate is eligible; recommend closing L6 with no change.` ``

## 3. Runner

### 3.1 Refactor in `scripts/games-cause-run.mjs` (behaviour-preserving; guarded by done-step 3)

The only changes to this file are extractions and exports:

1. **`export function buildCauseRows({ load = GAMES_CAL_LOAD, defaults = GAMES_CAL_DEFAULTS, log = () => {} } = {})`.**
   - Move into it the body of `runGamesCause` from `// step 1` (`const g = guardLoad(…)`, `:288`) through the end of `// step 3`, the `reconInfo` object (`:349`). The moved code is unchanged, including the ParityStop / SnapshotStop throws and the closed-set throws.
   - It returns `{ g, from, to, fixture, parity, snapshot, positionOf, bySleeper, store, rosterByYear, panelCounts, rankIndex, rows, reconMean, reconInfo }`.
   - `runGamesCause` begins by destructuring that call and is otherwise unchanged.
2. **`export function causeVeterans({ store, rosterByYear, snapshot, positionOf, bySleeper, names, defaults, rankIndex, to })`.**
   - It is `impactAll`'s per-veteran loop (`:231-250`), minus the `games` computation.
   - It returns the people array. Each entry is `{ ...row, avgGames, avgGamesL, projectedGames: r.projectedGames, name, ppg }`.
   - `impactAll` maps those people to add `games` exactly as now. Its output must be byte-identical; `rowOf` picks explicit fields, so the new `projectedGames` field does not leak.
3. **`export`** `cellMetrics` and `cellTable`, each with a trailing parameter `ids = CAUSE_ALL_IDS` that replaces the hard-coded `CAUSE_ALL_IDS` loop. Existing call sites pass nothing.

Do not refactor anything else in this file. `scripts/games-calibration-run.mjs` is untouched.

### 3.2 `scripts/games-short-run.mjs` (new)

The header follows `games-cause-run.mjs`. Exports:
- `runGamesShort({ load, defaults = GAMES_CAL_DEFAULTS, causeDefaults = CAUSE_DEFAULTS, log })`
- `buildGamesShortVerdictMarkdown(result)`
- `writeGamesShortArtifacts({ result, verdictMd, root })`
- `gamesShortMain({ load, defaults, causeDefaults, write, asJson, writeArtifacts, log, logErr })`

Import `buildCauseRows`, `causeVeterans`, `cellMetrics`, `cellTable`, `ParityStop` and `SnapshotStop` from `games-cause-run.mjs`. Copy only the trivial helpers (`round3`, `mean`, `rawMean`, `rawMae`, `f2`, `fCi`, `sgn`, `POSITIONS`). Write the summaries builder locally (step 6).

**`runGamesShort` steps:**

1. **Rows.** `const c = buildCauseRows({ load, defaults, log })`.
2. **Descriptives:**
   - panel rows by `sState`;
   - non-qualifying rows by `k1`;
   - relevant non-qualifying rows: all, and out-of-sample (after step 3);
   - star rows;
   - qualifying rows with `avgGames < 8`, and how many of those have `pred !== Math.round(clamp(avgGames, 0, 17))` (D5's evidence).
3. **Held-out fit.**
   - Same folds as L6b: `forwardChainFolds(predictorSeasons, minTrainSeasons)`.
   - Per fold, fit the references with `fitCandidate(train, id, { minCellTrainPlayers, kGrid, candidates: CAUSE_CANDIDATES })` and the candidates with `fitShortCandidate(train, id, { minCellTrainPlayers, kGrid })`.
   - Each out-of-sample row is `{ id, S, position, sState, k1, relevant, star, outcome, p }`, where:
     - `p.C0 = r.pred`;
     - each reference `p[id] = candidatePred(r.avgGames, kFor(m, r).k, CAUSE_CANDIDATES[id].floor)`;
     - each candidate `p[id] = shortPred(m, r).p`.
   - **Assert** that every qualifying out-of-sample row has `p.SOf0 === p.C0 && p.SOK1f0 === p.C0`; throw otherwise.
   - Count fallbacks for the candidates on non-qualifying rows only, keyed as in L6b.
   - The per-fold info is `{ evalYear, trainYears, trainRows, trainShortRows, evalRows, evalShortRows, fallbackRows, fallbackCells, thinTrainCells, boundaryCells }`, where `boundaryCells[id]` lists the `level|key` cells with `k === kGrid.from`.
4. **Tables:** `cellMetrics(rows, bootstrap, SHORT_ALL_IDS)` over:
   - relevant, star, rStar, pooled;
   - `nonQual` (all non-qualifying out-of-sample rows);
   - notRelevant;
   - `byPosition[p]`, `relevantByPosition[p]`;
   - `starByK1[state]`, for each K1 state present among star rows;
   - era2020 (S ≥ 2020).
5. **Outcomes (§1's star table).** For star rows, and separately for all non-qualifying rows, compute values per K1 state plus `all`:
   - n;
   - mean and median of `outcome`;
   - per id in `SHORT_ALL_IDS`, the mean `p` and the MAE.
6. **Decisions.**
   - Build summaries for `SHORT_REFERENCE_IDS` and `SHORT_CANDIDATE_IDS` with a **local rewrite** of L6b's private `summariesFor` (`games-cause-run.mjs:211-224`). It has the same fields, iterates over these ids, and uses a locally copied `POSITIONS = ['QB', 'RB', 'WR', 'TE']`. Do not export or change L6b's version. `relevant.bias` / `c0Bias` are raw means.
   - `paired(hi, lo)` = R\* ΔMAE ci95, cached.
   - Run `decideShort` once per δ in `causeDefaults.deltas`.
   - Add a `relevantBias` object `{ C0, …ids }` (raw), which the verdict prints.
7. **Full-sample constants.**
   - Fit the candidates with `fitShortCandidate(c.rows, …)` and the references with `fitCandidate(c.rows, …, CAUSE_CANDIDATES)`.
   - Per id, write `{ floor, fitRows: 'non-qual' | 'all', k: { [level]: { [key]: k } }, thinCells, boundaryCells }`.
   - The candidates map is keyed in `SHORT_ALL_IDS` order, without C0.
   - Keep L6b's constants-file wrapper: `{ generatedAt, panelRev, candidates, fallbacks }`. `fallbacks` is per fold, as in L6b `:391`, and covers the candidates only.
8. **2026 impact.**
   - `const people = causeVeterans({ …, names: c.g.loadPlayersRaw?.() ?? {} })`.
   - Each person's `games`:
     - `C0 = projectedGames`;
     - references via `candidatePred(x.avgGames, kFor(full[id], x).k, floor)`;
     - candidates via `shortPred(full[id], { ...x, pred: x.projectedGames }).p`.
   - Per id, report:
     - n veterans, and n whose games changed;
     - n non-qualifying veterans (the only ones a candidate can change);
     - mean Δ by position;
     - `rel3` veterans cut by ≥ `causeDefaults.starCutGames`;
     - rank changes by position, ranked on `ppg × games` as L6b does.
   - **Named stars:** the `causeDefaults.pinned` ids, then every non-pinned `rel3` veteran whose games change by ≥ `autoStarMinDelta` under **a candidate**. References do not select. Sort by max |Δ| over the candidates, then by name; cap at `autoStarCap` and report the overflow count. A pinned id that is not a veteran prints `not a 2026 veteran`.

**Result:**

```js
{ meta, parity, panelCounts, recon, descriptives, qb: { folds, tables }, outcomes, constants, decisions, relevantBias, impact, rows }
```

- `meta` is L6b's, with `causeDefinitions` replaced by `candidates` (the spec objects plus `references`) and `kGrid` added.
- `rows` holds the **out-of-sample rows** only. The full panel rows are already in L6b's artifact.

### 3.3 Artifacts, main, CLI

**Artifacts:**
- `backtests/<date>-games-short-panel.json` (the result minus `constants`);
- `backtests/<date>-games-short-constants.json`;
- `grading/<date>-games-short-verdict.md`.

The writer and `gamesShortMain` mirror `writeGamesCauseArtifacts` / `gamesCauseMain`, including exit 1 on `ParityStop`/`SnapshotStop` with nothing written.

**`bin/backtest.mjs`:**
- Next to the `--cause` check (`:204`), add: `--short` without `--games-calibration` → `[backtest] Error: --short requires --games-calibration`, exit 1.
- In the branch:
  - add `'--short'` to the accepted flags;
  - change the reject text's tail to `it takes only --cause, --short, --json and --write`;
  - before dispatch, `--cause` together with `--short` → `[backtest] Error: --cause and --short are mutually exclusive`, exit 1;
  - dispatch `--short` to `gamesShortMain({ write, asJson })`.
- Header doc: add one `--short (L6c)` entry under `--games-calibration`, naming the three artifacts. Also update the existing "Takes only --cause / --json / --write" text (`:51`) to include `--short`.

## 4. Verdict — `grading/<date>-games-short-verdict.md`

The title is `# Projected-games calibration — short-season-only candidates (L6c) — <date>`. Sections:

1. **What was compared.**
   - Panel, folds, D1, and the two candidates in one sentence each. Qualifying rows keep the app prediction.
   - The references.
   - Cohort n (all and out-of-sample). Include this sentence: "`relevant` holds only N non-qualifying out-of-sample rows, so G1 mainly confirms that relevant players are left alone; the star cohort carries the evidence."
   - δ values.
2. **Parity and reconciliation:** L6b §2's bullets, without the K-state line, plus the D5 descriptives and the qualifying-row invariant ("held for all N out-of-sample qualifying rows").
3. **Held-out results**, using `cellTable(t, SHORT_ALL_IDS)`. Order: relevant · star · R\* · all veterans · non-qualifying rows · not relevant · by position · relevant by position · star by K1 state · eval S ≥ 2020 · fallbacks.
   - The fallbacks table gets an extra column: cells at the grid floor, by candidate.
4. **What short-season stars actually played:** step 5's tables, star first, then all non-qualifying rows.
5. **Full-sample k tables**, nested by level. State the fit population. Mark boundary cells `(at grid floor 0.50)`.
6. **Decision.**
   - The D4 gate text, the tier order and the R\* rule. Add "G2 (relevant bias) is reported, not gated".
   - One table: candidate × δ. Candidates come first, then the references, labelled `(reference)`.
   - A relevant-bias line: C0 and every id.
   - One bullet per δ; the default is bold.
   - Close with "The choice is Anton's."
7. **2026 impact and named stars.**
   - The summary table: id, changed, non-qual, mean Δ QB/RB/WR/TE, rel3 cut ≥ 4, rank changes.
   - The named-star table: player, pos, S-state, K1, rel3, then C0, C3f0, K1f0, SOf0, SOK1f0.
8. **Limits.**
   - The 0.50 grid floor binds for the cells listed in §5. The fitted cuts are therefore conservative; the grid is pre-registered.
   - **This is not an independent confirmation.** The candidates were chosen from L6b §5's out-of-sample breakdown. The gates were set after a Session 1 probe of this exact run: G2 was dropped and G3 tightened. These held-out CIs re-score the same panel, folds and seed that suggested the candidates, so a (W) carries that selection effect. The first clean test is forward grading (2026 outcomes).
   - `relevant` has few non-qualifying rows (see §1).
   - Qualifying-row bias (+1.6 relevant) is left in place by design.
   - Ranks use half-PPR; the app uses league scoring.
   - Floor 0 applies to non-qualifying rows only, and needs an app clamp change for those rows.
   - L6b's chain-QB, snapshot-scoring and rookie lines.
   - **Wireability:** SOf0 needs only last-season gp and position. SOK1f0 also needs `classifyInjurySeason`, which is CR-28-mirrored and app-native. Both would wire as an app `seasonProjection.js` Step 6 change under CR-28, with a `grading/anchor-policy.md` boundary.

## 5. Tests — append to `test/games-calibration.test.mjs` (prefix `GCS-`)

1. **GCS-1 `fitShortCandidate`.** A WR fixture:
   - 45 qualifying players with outcome = avgGames (k 1 would be optimal);
   - 45 `short` players with SSE optimum exactly 0.60.

   Assert:
   - `cells['pos|s']['WR|short'].k === 0.6`;
   - `cells['pos'].WR.k === fitK(short rows only, 0)`, which differs from `fitK(all rows, 0)`;
   - no `WR|qual` key exists in any level.
2. **GCS-2 `shortPred`.**
   - A qualifying row with `avgGames 7.4`, `pred 8` → `p === 8` (floor 8 kept).
   - A qualifying row with `avgGames 15.6` → `p === r.pred`, even though the model's root k is 0.5.
   - A `short` row → `candidatePred(avgGames, k, 0)`.
   - A thin `none` cell falls back to `pos` with `fallback: true`.
   - Under SOK1f0, `short-inj` and `short-oth` rows take their own, different k.
3. **GCS-3 `shortEligibility`.**
   - G1, G3, G4 and G5 each fail alone and are named.
   - A star ci of `[-0.5, 0]` fails G3 (strict `< 0`).
   - A summary whose relevant bias equals C0's +1.6 is eligible, because bias is not gated.
   - A null ci fails G1, G3 and G4, but not G5.
4. **GCS-4 `decideShort`.**
   - Only SOf0 eligible → W SOf0.
   - SOK1f0 eligible with paired `[-0.03, 0.001]` → SOf0. With paired `[-0.03, -0.001]` → SOK1f0. With a null paired → SOf0.
   - Only SOK1f0 eligible → SOK1f0.
   - An eligible C3f0 with the best R\* MAE is never picked.
   - Nothing eligible → N, and the text matches `/recommend closing L6 with no change/`.
   - A recon breach → S.
5. **GCS-5 end to end** with `syntheticLoad({ withCause: true })` and `smallDefaults`:
   - exit 0, and exactly one write;
   - `decisions` has keys `0.1`, `0.25`, `0.5`;
   - `Object.keys(r.constants.candidates)` equals `['C3f0', 'K1f0', 'SOf0', 'SOK1f0']`;
   - `constants.candidates.SOf0.fitRows === 'non-qual'`;
   - the verdict has `## 6. Decision` and `## 7. 2026 impact`;
   - **every qualifying `rows` entry has `p.SOf0 === p.C0 && p.SOK1f0 === p.C0`**;
   - an independent check: `buildCauseRows({ load: syntheticLoad({ withCause: true }), defaults: smallDefaults })`, keep its non-qualifying rows for one position, and assert `constants.candidates.SOf0.k.pos[pos] === fitK(those rows mapped to { avgGames, outcome }, 0, smallDefaults.kGrid)`;
   - the real writer under a tmp root writes the three `games-short` paths;
   - a parity break → exit 1, and nothing written. Use the prefix-neutral regex `/parity .* below 99%/`: `buildCauseRows` keeps L6b's `[games-cause]` message prefix unchanged, which is accepted.
6. **GCS-6 CLI.**
   - `--short` alone → exit 1 and `/--short requires --games-calibration/`.
   - `--games-calibration --cause --short` → exit 1 and `/mutually exclusive/`.
   - `--games-calibration --short --bogus` → exit 1, `/rejects --bogus/` and `/takes only --cause, --short, --json and --write/`.

**One existing assertion changes:** in GCC-8 (`:764`), the regex becomes `/takes only --cause, --short, --json and --write/`. Every other GC-/GCC- test, and `test/durability-mirror.test.mjs`, must pass unchanged.

## 6. Touch list, done-definition, commits

**Touch list (exhaustive):**
- `lib/gamesCalibration.mjs`: §2 only. Additive; no existing function changes.
- `scripts/games-cause-run.mjs`: §3.1 only.
- `scripts/games-short-run.mjs`: new.
- `bin/backtest.mjs`: §3.3.
- `test/games-calibration.test.mjs`: §5.
- `README.md`:
  - the CLI line (`:1313`): `--games-calibration [--cause | --short]`. The parenthetical becomes "(takes only `--cause`/`--short`/`--json`/`--write`; `--cause` or `--short` alone is rejected; `--cause` and `--short` are mutually exclusive)";
  - the artifact lists (`:1326-1327`): add `<date>-games-short-{panel,constants}.json` and `<date>-games-short-verdict.md`;
  - `:1405`: add `--games-calibration --short`;
  - a new paragraph **L6c — `--games-calibration --short`** after the L6b paragraph (`:1441-1454`). It covers the qualifying-rows-unchanged rule, the two candidates, the non-qualifying fit population, the gates (G2 reported only, G3 strict), the references and the artifacts.
- `CLAUDE.md` line 16: `` `--games-calibration [--cause]` `` → `` `--games-calibration [--cause/--short]` ``. That is +8 bytes, 24,969 → 24,977 ≤ 25,000. Change nothing else.
- Generated artifacts: the three dated `games-short` files.

No `package.json` script, no manifest, no data-catalog row, no registry edit.

**Done-definition:**
1. **Before any edit**, run:

   ```sh
   node bin/backtest.mjs --games-calibration --json > "$TMPDIR/l6-before.json"
   node bin/backtest.mjs --games-calibration --cause --json > "$TMPDIR/l6b-before.json"
   node bin/backtest.mjs --games-calibration --cause > "$TMPDIR/l6b-before.md"
   ```
2. Implement. `npm test` and `npm run smoke` must both be green.
3. **Regression.** Re-run both commands into `*-after.json`. For each pair, run:

   ```sh
   jq -S 'del(.meta.generatedAt,.meta.panelRev,.constants.generatedAt,.constants.panelRev)'
   ```

   on both files, then `diff` them. **Both diffs must be empty.**

   The `cellTable` extraction only feeds the markdown, so also diff the L6b verdict text. In step 1, add `node bin/backtest.mjs --games-calibration --cause > "$TMPDIR/l6b-before.md"`; in step 3, write the matching `l6b-after.md`. Normalise both files with:

   ```sh
   grep -v '^# Projected-games' | sed -E 's/data `[0-9a-f]{7}`/data REV/'
   ```

   That drops the dated title and the panelRev. **This diff must be empty too.** Paste every command and its output into the hand-back.
4. Run `node bin/backtest.mjs --games-calibration --short --write` and report the wall time. Then check:
   - DM-1 ≥ 99%, recon mean 0, and the qualifying-row invariant held.
   - **Reference equivalence.** In `relevant`, `star`, `rStar` and `pooled`, the C0, C3f0 and K1f0 entries must equal `l6b-after.json`'s `qb.tables` (n, bias, mae, rmse, dMse, dMae, CIs included). Same rows, same folds, same seed. A difference means the fold or row path diverged: **stop and report**.
   - Compare with §1's probe. If any §1 ΔMAE or ΔMSE mean or CI bound differs by more than 0.05, **stop and report; do not adjust**. Report the verdict line at each δ and the four named stars' games.
5. `test/claudeMdSize.test.mjs` is green, and `wc -c CLAUDE.md` = 24,977.

**Commits** (pull with rebase before push, per git-workflow.md):
1. `Games calibration L6c: short-season-only candidates (--games-calibration --short)`: code, tests, docs.
2. `grading: games-short verdict <date>`: the three artifacts.

Session 2 hands back:
- the SHAs;
- every file touched;
- every deviation;
- what each GCS test asserts;
- the step 3 diffs;
- the step 4 numbers.

## Cross-repo impact

**No app change. No served-file change.**

- **CR-25** and **CR-27** fire through the whole-file `bin/backtest.mjs` trigger. Only the `--games-calibration` branch changes; no fit, constant or pin moves. Their Mirror texts are quoted by reference to `cross-repo-registry.md`, as L6b did. They open:
  - CR-25: "An app-side change to any mirrored definition stales every fitted k: mirror the definition into `lib/inSeasonEvidence.mjs` (never into the frozen `PHASE1_K`), re-run `node bin/backtest.mjs --inseason --write`, and re-pin from the new constants file — never hand-edit a `K_*`." **App action: none.**
  - CR-27: "A change to any feature definition or bin on either side re-runs `node bin/backtest.mjs --qb-takeover --write` and the app re-pins by byte copy with the data commit SHA — never by hand-editing a coefficient." **App action: none.**
- **CR-28 does not fire.** `lib/durabilityMirror.mjs` is untouched. `lib/gamesCalibration.mjs` and the runners are not listed Triggers.
- Add to the pending **D-66** list:
  - `scripts/games-short-run.mjs` reads rosterweekly indirectly, through `buildCauseRows` → `causeStates`.
  - **CR-28.** The data-side text describes `lib/durabilityMirror.mjs` as being "for `bin/backtest.mjs --absence`" only. It should also name its other consumers: `lib/gamesCalibration.mjs:29`, `scripts/games-calibration-run.mjs:25`, `scripts/games-cause-run.mjs:22` and `scripts/games-short-run.mjs`. Any of them goes stale when the app changes a mirrored rule.
  - **CR-01.** The Triggers list `scripts/qb-rookie-level-run.mjs` as a snapshot `projection.confidence`/`projectedPPG` reader. Add the other readers: `scripts/games-cause-run.mjs` (`causeVeterans`, after §3.1), `scripts/games-calibration-run.mjs:248,259`, `scripts/absence-run.mjs:267` and `scripts/games-short-run.mjs`.

**If Anton wires a candidate:**
- It is an app `seasonProjection.js` Step 6 change under CR-28, with a `grading/anchor-policy.md` boundary and the floor-0 clamp for non-qualifying rows only.
- SOf0 needs only app data. SOK1f0 also uses the CR-28-mirrored `classifyInjurySeason`.
- No new served signal and no new coupling are needed.

## Plan gate (plan-reviewer, 2026-10-09) — decisions

There were 8 flags (2 medium, 6 low). Session 1 checked each one against live source and applied all of them; Anton delegates review calls. The reviewer also confirmed:
- the anchors and the probe numbers (from the L6b panel artifact);
- that the reference-equivalence check can actually pass (the bootstrap re-seeds on every call);
- that D5/D6 can be built as written;
- the CLAUDE.md arithmetic.

| # | flag | decision |
|---|---|---|
| 1 | MED: the regression cannot see the `cellTable` extraction (it only feeds the markdown) | Applied: done-steps 1/3 also diff the normalised L6b verdict markdown |
| 2 | MED: L6c is not an independent confirmation (candidates come from L6b §5; gates set after the probe) | Applied: a §4.8 Limits line, which is also called out to Anton |
| 3 | `summariesFor` is private and hard-coded | Applied: a local rewrite; `POSITIONS` copied |
| 4 | Stale "takes only" texts (`bin/backtest.mjs:51`, README `:1313`) | Applied: both added to the touch list |
| 5 | Constants-file wrapper unspecified | Applied: L6b's wrapper kept; GCS-5 checks `Object.keys(constants.candidates)` |
| 6 | `[games-cause]` prefixes surface under `--short` | Applied: accepted as a known deviation; GCS-5 uses a prefix-neutral regex |
| 7 | CR-01 Triggers omit the other snapshot readers | Applied: added to D-66 |
| 8 | CR-28 data-side text names only `--absence` as a mirror consumer | Applied: added to D-66 |
