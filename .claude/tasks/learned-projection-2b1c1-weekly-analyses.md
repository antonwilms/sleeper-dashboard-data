# LP-2b-1c-i · Learned projection research — why the weekly layer ties B1c (report-only)

**Status:** plan, Rev 1.1 (2026-11-19). Slice 1 of 2 of LP-2b-1c (§3.1). Rev 1: full review, 15 flags (0 blocking), all applied in Rev 1.1; flag 15's open decision is in §3.1 and R3. **Approved by Anton 2026-11-19 (Rev 1.1).**

**Review depth: full** — none of plan-reviewer's mandatory triggers applies (no served write), but the slice drives the registered fold driver with an unregistered spec beside the 2025 lock, and its season-edge rule decides whether LP-2b-2 is planned; unsure → full.

**Session 2:** sonnet at **high** effort, inside `sleeper-dashboard-data/`; read its CLAUDE.md first. Python only. Paths are relative to `research/learned-projection/` unless they start with a repo folder.

**Anchors** (data `main` @ `d640fc1`; every SHA-256 re-checked 2026-11-19):
- `.cache/panel/` `meta.generatedAt` `2026-11-12T23:44:16.940Z` (= `run_season_models.ANCHOR_GENERATED_AT`);
- LP-1a §8 `preregHash` `7ff9087fc4848b0df90383fc5e4397d3d4b085466c228b430211a63ad6e24e5a`;
- caches: `weekly-inputs.pkl` `2431b397…a1fb2` (= `run_weekly_models.INPUTS_SHA`), `season-prior.jsonl` `55c55e20…c56a` (= `PRIOR_SHA`), `weekly-preds.jsonl` `44d7132a8418b892c150eb70b7b93394de6c5c2fb01f5b6dbcee9f99196aab29`, `weekly-fits.pkl` `4c6738bbb28502f3c4436f8715c89d95378662739403bda89a12bafe06d9f9b3` (both = the 2b-1b artifact's `sha256` entries);
- artifacts: `backtests/2026-11-18-learned-s2b1b-dev-panel.json` `3a0dcb5148f8720d1ec77c714ed02d3f2f729830645e190c550c1f3f078c6386`; `backtests/2026-11-16-learned-s2a-dev-panel.json` `b41169fbeefa2fab2d8a8d6f500590fb65f7b2465353ce67193941322e9995d7`; `backtests/2026-10-07-inseason-constants.json` `7bee9946ba78b988e74921186fa779dd46f09e189e335338e8c990a8b8da830b`;
- candidate files: `H.json` `9a870f27…c98121`, `G.json` `c99becf0…ed8cc9f`; season sections `572792a2…` / `12bd9025…` (`registry_w.SECTION_SHA`).

---

## 0. What this is, for Anton

The weekly layer of H beats the season-to-date average at RB and WR but only ties the app's in-season model (B1c). This slice asks why, from cached results plus three cheap H-only arms. It answers four questions in plain language (§9). Nothing is registered, labelled or gated, and nothing feeds LP-2b-2. 2025 stays sealed.

## 1. Scope

**In:**
- §5 grid edges, both layers and both candidates;
- §6 error surfaces at those edges, plus the season-edge rule;
- §7 override speeds;
- §8.1 H and G against STD and B1c by week band, per fold, drift, and H − G;
- §8.2 three exploratory H arms: the k sweep (route a), the widened k grid (route b) and no-context;
- the runner, report and tests.

**Out (each a §12 stop):**
- **Protected files.** Any edit to a registered path: `registry.SEASON_CODE` / `season_code(·)`, `SEASON_HARNESS`, `registry_w.WEEKLY_CODE(·)`, `WEEKLY_HARNESS`, `lp/spec.py`, `lp/spec_wm.py`, the 2b-1a files (2b-1b §1), `candidates/`, an existing test or fixture, `run-log.jsonl`.
- **Caches.** Regenerating or writing any cache, or running `run_weekly_inputs.py`, `run_weekly_models.py` or `run_season_models.py`.
- **G.** Any G fit; any season-layer fit.
- **LP-2b-1c-ii content** (§13).
- **Outside this folder:** Node, app or index files; any `bin/` run; served or `manifest.json` writes; the network; any new library.
- **The held season and the bar.** Any 2025 row in a frame, fit or metric; any change to LP-1a §8; any label, gate or `M.label` call on an arm or band.

## 2. Facts (2026-11-19, from live source and caches)

- **F1 · Variant switch.** `weekly_models.VARIANT_KEYS = ("dropGroups", "addCols", "hContext", "gPrior", "fixedCalib")`, and `check_variant` raises on any other key (`lp/weekly_models.py:15-37`). **No key sets k**, so "k beyond the grid" cannot go through `variant` (Anton approved routes (a) and (b), §3.1).
- **F2 · `fold_w` reads the grid from its `spec` argument** (`fit_w(frame[tr], rel, hist, store, spec, variant)`; `weekly_h.fit_target` reads `spec["kMultW"]`, `spec["rhos"]`, `spec["ctxAlphas"]`).
  - `registry.require` checks the candidate file, its hashes and the data hashes, never the passed spec (`lp/registry.py:173-207`).
  - `Fits.specSha256 = registry.spec_sha(spec)` records the spec actually used.
- **F3 · Cached weekly fits.** `weekly-fits.pkl` = `{(cand, T): Fits}`, 12 keys, about 5 s to load.
  - Each H `pos[P].targets[t]` holds `k`, `kGames`, `kMult`, `rho`, `rhoIdx`, `alpha`, `alphaSse`, `medE`, `cohort`, and **`gridSse`: the full (kMultW × rhos) training SSE matrix** (`weekly_h.py:146-147`).
  - Example, checked while planning: H 2024 WR `rec_yd` at the chosen ρ has SSE(24)/SSE(32) = 1.00039, so the error falls 0.04% over the last k step.
  - In H 2024, 10 of 34 targets carry a `cohort` (α ≠ "off").
  - `pos[P].c_w`, `.phi`, `.facts` (`phiBrier`, …) are present.
- **F4 · The season layer keeps no error surface.**
  - `model_h.fit_target` (`lp/model_h.py:47-136`) returns only `pred, alpha, kmult, delta, k`; the LOSO α SSEs and the (kMult × δ) SSE grid are discarded, and no season fits cache exists.
  - Cached: the 2a artifact `results[P][cand]["chosen"][str(T)]` = `entry, index, innerMae, c, cRows, params, fallback, seconds`. `innerMae` is the inner-season MAE of **every** entry of the spec's `grid`, in grid order (H: 8 = E1 × λ{0, 0.1, 0.2, 0.35}, then E0; G: 16 = E1 × λ{0, 0.2} × g1…g4, then E0). `params[t] = {alpha, kmult, delta}` (H).
  - So, from cache: the λ (and era, g) surface yes; α / k-multiple / δ surfaces no (§6.2, §9 (2)).
- **F5 · Grids** (stamped specs).
  - Weekly H: `kMultW` [0.5 … 32] (11), `rhos` [0.6, 0.75, 0.85, 0.92, 1.0], `ctxAlphas` [1, 10, 100, 1000, "off"], `phis` [0 … 1.0] (7, both families).
  - Weekly G: one fixed point, no grid.
  - Season H: `alphas` [1, 10, 100, 1000], `kMult` [0, 0.1, 0.2, 0.35, 0.5, 0.75, 1, 1.5, 2, 3, 5, 10], `deltas` [0.5, 0.65, 0.8, 0.9, 1.0], `grid` era {E1, E0} × λ {0, 0.1, 0.2, 0.35}.
  - Season G: era × λ {0, 0.2} × `gPoints` {g1…g4} (unordered).
- **F6 · benchw** rows carry `n`, `k`, `population`, `kind`, `liveChain`, `preChain` (B1's evidence count and its k from the population table).
  - App constants (`inseason-constants.json` `constants`): `K_ROS_POINTS` QB 3 / RB 2.5 / WR 3 / TE 3.5; `K_ROS_OPP` 2.5 / 1.5 / 3 / 3.5; `K_ROS_POINTS_SHORT` 1.5 / 1.5 / 1 / 4.
  - **Disclosure:** while planning, Session 1 counted `kind` and the chain flags over all benchw rows, 2025 included. No forecast or outcome column was read or printed.
- **F7 · Timings** (2b-1b, cross-fitted). H per fold 4 / 19 / 30 / 53 / 84 / 128 s; load + trim 6.5 s, build 64.6 s, checks 17.3 s.
  - A `fixedCalib` refit skips the four cross-fits, about ¼ of the cost.
  - **Expected run time of this slice: about 12 min:**
    - loads ≈ 2 min;
    - two H refits on six folds (check (b) and route (b)) ≈ 3 min;
    - no-context ≈ 0.5 min;
    - predict-only sweeps and origin-0 runs ≈ 1 min;
    - bootstrap tables ≈ 5 min.
- **F8 · Seen while planning.** RB H 2024 `innerMae` (E1: 53.44, 52.89, 52.29, 51.73; E0: 53.09, 52.56, 52.03, 51.56) falls about 1% per λ step to the edge. The §6.2 thresholds were set with this one row seen; no other surface was looked at.

## 3. Rulings

### 3.1 Anton, 2026-11-19 (verbatim)

> 1. Split approved: 1c-i as proposed (incl. H vs B1c by week band), 1c-ii outline only, planned after 1c-i is verified. Both override-speed routes approved. (b) conditions: every output labelled exploratory with its own spec hash, never a candidate; nothing from it feeds a label, gate or LP-2b-2; if a widened H clearly beats the registered H, report it as a finding for Anton, no substitution. Addition to 1c-i: from the cached season-layer fits (no refit), report the training-error surface at the season α / k-multiple / δ grid edges, i.e. how much error was still falling at the edge, per position. If it is still clearly falling at RB or WR, flag it as a stop for Anton before LP-2b-2 is planned. Write the 1c-i task file, set the review depth, run plan-reviewer, report flags with triage.

**The routes approved**, as proposed by Session 1 the same day:
- **(a)** predict-only k scaling on a deep copy of the cached H fits;
- **(b)** a refit through the registered `fold_w`, with H's stamped spec whose `kMultW` is extended by 48, 64, 96 and 128, under the registered calibration.

**The addition meets F4.** The α / k-multiple / δ surfaces are not cached, so this slice reports what is cached (§6.2) and states the gap (§9 (2)). That item stays open for Anton; no refit is planned.

**Open for Anton (review flag 15).** Many RB and WR season target-folds sit on those unrecorded edges (2a artifact, H season params):
- α at 1000: RB 63/72, WR 54/60;
- kMult at 10: RB 43/72, WR 24/60;
- δ at 0.5: RB 22/72, WR 29/60.

So LP-2b-2 planning waits on Anton's ruling on those edges, whatever this slice's λ rule shows (R3, §9).

### 3.2 Binding (Anton's 1c brief, 2026-11-19)

- Nothing is registered. Registered code is untouched; new code goes in new unhashed modules with their own runner.
- Caches are read by SHA only, never regenerated. A needed re-run is a stop for Anton.
- Arms reuse the registered calibration (`fixedCalib`, no cross-fitting; Anton 2026-11-18, settles flag 15).
- ROS is exploratory (it belongs to 1c-ii).
- **G pin rule:** all four thread variables = 1 and `PYTHONHASHSEED=0`, recorded. This slice fits no G, and the record is kept anyway.
- **2025 untouched:** every frame is trimmed and asserted, and `weekly_data.guard(T)` runs on every per-fold call.
- Carry-overs 3, 5, 11 and 14 go to 1c-ii (§13). Flag 15 is settled above.
- **No label, no gate:** everything here is report-only and printed as such.

### 3.3 Carried

The rulings of 2b-1b §3 and the §11 limits stand. Under LP-1a §8, at most two candidates (H, G) may be gated, and there is no re-registration path (2b-1b flag 18). So a weekly candidate found here cannot be gated without a ruling by Anton (§9 (4)).

## 4. Layout (all new, none in a registered path list)

```
lp/analysis_w.py      pure functions (§5–§8); imports lp modules as modules
lp/report_s2b1c.py    the report markdown
run_weekly_analysis.py  [--write] [--date YYYY-MM-DD] [--resamples 2000]
tests/test_weekly_analysis.py   (fixtures: tests/synth_wmodels.py, tests/e2e_w.py — imported, never edited)
```

- **Imports.** Import modules as modules (2b-1b §4).
- **Runner pins.** The runner's first non-stdlib import is `import run_weekly_models as rwm`. It sets the four thread variables before numpy, so the pin code is **imported, not copied**.
- **Hash seed.** Under `__main__`, the runner's first statement after the imports is `_ensure_seed(os.execv)`, a local wrapper that calls `rwm._ensure_hash_seed(execv=execv)`. The `rwm` import has already loaded numpy, pandas, sklearn and `lp` by then. That is harmless, because the seed applies at interpreter start and the re-exec restarts it (review flag 9). `_threads()` is recorded through `rwm._threads()`. Those values describe this process only because `rwm` is its first non-stdlib import.

## 5. Grid-edge table (`analysis_w.grid_edges`)

### 5.1 Rule

A chosen value v in an ordered grid gets one of these classes:
- `interior`;
- `edge-low` / `edge-high` when v is the grid's first or last element and that end is not a natural limit;
- `limit-low` / `limit-high` when it is one.

**Natural limits:**
- weekly ρ 1.0 (no decay);
- weekly α "off" (α = ∞);
- φ 0 and φ 1.0;
- season kMult 0;
- season δ 1.0 (equal lag weights);
- season λ 0.

Two-point grids (season G λ) print `two-point`; unordered ones (era, season G `g`) print `n/a`. A weekly α taken from `ctxDefaultAlpha` because the fold has fewer than 2 training seasons (fold 2019, `alphaSse` None) prints `default`. It is not a fitted choice, so it is left out of the shares and the ≥ 4-of-6 list (review flag 10). Every other grid end is an edge, including weekly `kMultW` 0.5 and 32, ρ 0.6, α 1, season α 1 and 1000, kMult 10, δ 0.5 and λ 0.35.

### 5.2 Rows (per candidate, layer, T, position, target or position-level setting)

- **Weekly H** (cached `Fits`): `kMult`, `rho`, `alpha` per target; `phi` per position.
- **Weekly G**: `phi` per position. The point model has no grid, so it prints "no fitted grid".
- **Season H** (2a artifact): `params[t].alpha`, `.kmult`, `.delta` per target (gamesShare included); `entry.era`, `entry.lam` per position.
- **Season G**: `entry.era`, `entry.lam`, `entry.g`.

### 5.3 Output

- Every row, with its grid and class.
- A summary: per (cand, layer, setting, position), the share of (T, target) cells per class, plus the list of targets at an edge in ≥ 4 of 6 folds.

## 6. Error surfaces at the edges

### 6.1 Weekly H (`analysis_w.weekly_surface`, from `gridSse`)

For each (T, P, t) whose `kMult` or `rho` is at an **edge** (not a limit), take the last-step drop along that axis, holding the other axis at its chosen index:
- `drop = (SSE[neighbour] − SSE[edge]) / SSE[edge]`;
- `neighbour` is the grid point adjacent to the edge.

Report the drop per row and its median per (P, axis, end). **Report-only:** route (b) answers the k-high edge with test-fold numbers (§8.2).

### 6.2 Season (`analysis_w.season_surface`, from `innerMae`)

**H.** At the chosen era, the λ profile `innerMae[era, λ]`. When the chosen λ is 0.35, `drop = (MAE(0.2) − MAE(0.35)) / MAE(0.35)`.

**G.** At the chosen (era, g), `drop = (MAE(λ 0) − MAE(λ 0.2)) / MAE(λ 0.2)` when the chosen λ is 0.2.

**Season-edge rule (R-S), stated before the run.** "Still clearly falling" at position P and candidate c means both of these hold:
- the edge is chosen and drop > 0 in ≥ 4 of the 6 folds;
- the mean drop over those folds is ≥ 0.5%.

If R-S holds at RB or WR for either candidate, the report and the hand-back print **"STOP for Anton before LP-2b-2 is planned: the season λ surface is still falling at the edge (P, c)"**. The run continues and returns 0; this is a reporting stop, not a run failure.

**α / k-multiple / δ.** The report prints the edge shares from §5 and this sentence: "The season layer's α / k-multiple / δ training errors are not recorded (`model_h.fit_target` keeps only the argmin; no season fits cache), so whether error was still falling at those edges cannot be judged without a refit — open for Anton." It prints no inferred number.

## 7. Override speeds (`analysis_w.override_speeds`)

### 7.1 Per target

Per (T, P, t): H's `kGames`, classed by the stamped season spec's target definition:
- `volume` (`kind` pg with `role` opp);
- `efficiency` (`kind` po);
- `other` (pg).

The table shows the median and range over folds beside the app's `K_ROS_POINTS[P]` and `K_ROS_OPP[P]`, read from the anchored `inseason-constants.json`. `kGames` ≡ `kMult` by construction, so each cell also prints its share at the 32 edge: the median and range are cut off there (review flag 11; 63 of 204 cached target-folds sit at 32).

### 7.2 Points-level evidence weight

- **H, empirical — two measures, both on one scale** (review flags 1–3).
  - Per fold, `predict_w(fits, frame_T, hist, store, origin=np.zeros(len(frame_T), int))` gives `ppg0`. The origin must be an array in `frame_T` row order: a scalar 0 raises at `ns[idx]` (`weekly_models.py:261,275`).
  - `m = sum_pts / n` comes from the `weekly_forecasts` test frame (n ≥ 1). Its evidence scale is `x = m / c_w[P]`: `ppg` is pre-calibration, and cond = c_w × ppg.
  - On relevant played rows with |x − ppg0| ≥ 1, per (P, n) for n = 1…12, take λ(n) = Σ (ppg − ppg0)(x − ppg0) / Σ (x − ppg0)², the least-squares slope through the origin.
  - **λ_H,nc** — the shrinkage path alone. `fits` is the no-context arm's `Fits` (§8.2 item 3), and `ppg` is that arm's ppg. Here `origin` removes every in-season input, so this is the headline override speed.
  - **λ_H** — registered H: the cached `Fits` and `ppg` from `weekly-preds.jsonl`. Its context ridge still reads the row's week-w to-date columns at origin 0 (usage, avail, absence, team, gl, `nP`, `wk`). The report states that λ_H therefore understates H's total response to the season so far.
  - Rows and players are counted. A cell with < 30 rows prints INSUFFICIENT.
- **B1, analytic.**
  - λ_B1(n) = median of `n_b/(n_b + k_b)` over the same rows' benchw `n`, `k`, restricted to rows with `kind` ∈ {null, "original", "none"} (review flag 4).
  - The QB start chain's "preseason" (weight 0), "starter" and "backup" states (weight starts/(starts + K) toward the starter prior, `lib/learnedBench.mjs:326-344`) are excluded whatever `liveChain` is. The QB note says so and gives the excluded share.
  - Both values are printed per (P, n), with the share of rows per `population`.

## 8. Comparisons (`analysis_w.paired` and helpers)

**`paired(wk, a, b, rows_mask, folds, B)`** is a **copy** of the per-(c, bench) block of `evaluate_w.labels` (§11):
- per position, `rs = bs.Resampler(<all rows of P in folds>["pid"], B, seed=bs.SEED)`;
- `gid` over sorted (T, w) of all position rows;
- `d = M.diff_pooled`, `cm`, `bm` from `M.mae_pooled`, and the Spearman difference from `M.spearman_weekly`;
- **no `M.label`**.

It returns n, `aMae`, `bMae`, d (value, CI), pct = −d/bMae, and dSpearman (value, CI); per fold, `rs.per_fold_mean(|ea| − |eb|)` and `M.drift` over that. When compared with `labels`, `aMae` ↔ `candMae` and `bMae` ↔ `benchMae` (T-C-1, check 5(c)).

**Arm columns.** `predict_w` sets `cand = "h"` for every H arm (`weekly_models.py:282`). So each arm's `cond` is renamed before the merge into `wk`, to `h_ks0.25` … `h_ks8`, `h_wide` and `h_noctx`. A name clash with the cached `h` raises (review flag 14).

**Rows.** STD and arm-versus-H use relevant ∧ played rows. B1c uses the same rows with `b1cw` non-null (2b-1b §9).

### 8.1 Bands, folds, H − G

- **Week band** by origin n = w − 1: `0-3`, `4-8`, `9+`.
- Per position and band: H and G versus STD and B1c. The band mask restricts rows; the resampler universe stays position-wide.
- Per position, all bands together: the per-fold d and drift of H and G versus STD and B1c, plus H − G (a = h, b = g, relevant ∧ played rows).

### 8.2 Exploratory H arms (each prints "exploratory — not a candidate, no label", with its spec SHA-256)

Each arm is compared with registered H, with B1c and with STD. Before each fold, `weekly_data.guard(T)` runs and `fixedCalib(T)` = `{"c_w": {P: fits.pos[P].c_w}, "phi": {P: fits.pos[P].phi}}` is taken from the cached H `Fits`.

1. **k sweep (route a), `analysis_w.scale_k(fits, s)`.**
   - Builds a `copy.deepcopy` with every H target's `k` multiplied by s, at every position; nothing else changes.
   - Run `predict_w` on fold T's frame, for s ∈ {0.25, 0.5, 2, 4, 8}.
   - Recorded: the per (T, P) count of targets that keep a `cohort` (their context term was fitted at s = 1); the arm's `specSha256` (the stamped spec's, plus `"kScale": s`); and the SHA-256 of `json.dumps({"base": specSha256, "kScale": s}, sort_keys=True)`.
2. **Widened grid (route b), `analysis_w.widened_spec(spec)`.**
   - Deep copy, `kMultW` = stamped + [48, 64, 96, 128] (ascending).
   - Then `weekly_models.fold_w(frames["H"], T, store, "H", spec_b, rel, hist, variant={"fixedCalib": fixedCalib(T)}, env=registry.Env(), env_w=registry_w.weekly_env())`.
   - Recorded: `fits.specSha256`; per (T, P, t) the chosen `kMult`, `rho` and `alpha`; the count choosing > 32.
3. **No context.** The same call with the stamped spec and `variant={"hContext": False, "fixedCalib": fixedCalib(T)}`.

**Finding rule (R-W).** If route (b) or a sweep arm has d(arm − H) with its CI entirely below 0 and −d/MAE(H) ≥ 1% at a position, the report prints **"FINDING for Anton: <arm> beats the registered H at <P> on the development folds — exploratory, no substitution, no label"**. If it holds at RB or WR, the hand-back leads with it.

## 9. Report (`grading/<date>-learned-s2b1c1-report.md`) and artifact

**Artifact:** `backtests/<date>-learned-s2b1c1-analysis.json`, at most 5 MB, unregistered, with no commit id. It holds:
- every §5–§8 table;
- the checks' maxima;
- seconds, threads (`rwm._threads()`), versions;
- the `sha256` of every §10 step 2 input and of both candidate files;
- every arm's spec hash;
- `exploratory: true` on every arm and band entry.

**Report**, in order:

0. **Answers for Anton.** Plain language, four short paragraphs, written by Session 2 from the mechanical outcome lines the runner prints in §0a. No claim may go beyond those lines.
   - (1) Why the weekly layer ties B1c: slow override, something else, or no edge.
   - (2) Whether a grid-edge setting plausibly costs accuracy.
   - (3) A recommendation on LP-2b-2.
   - (4) Whether a new weekly candidate is worth registering, and what it would change.
   
   §0a, the rule outcomes, is printed by the runner:
   - **R1 (override speed).**
     - "slow override costs accuracy at P" if an s < 1 arm satisfies R-W at P;
     - "override is too fast / the grid too narrow at P" if s > 1 or route (b) does;
     - otherwise "override speed does not explain the tie at P".
     - Plus, per band, whether H − B1c has its CI entirely below 0, entirely above 0, or neither, and the band where |d| is largest.
   - **R2 (edges).** R-W for route (b); the §6.1 medians; R-S per position and candidate; and the F4 sentence.
   - **R3 (LP-2b-2).** The rule always prints "LP-2b-2 planning waits on Anton's ruling on the unrecorded season α / k-multiple / δ edges (§3.1)", with the §5 season edge shares for RB and WR beside it. When R-S printed a STOP, it adds "and the season λ surface is still falling at the edge (R-S)". It never prints "proceed" (review flag 15).
   - **R4 (new candidate).** "a candidate change is indicated at P: <arm>" if R-W holds at RB or WR; otherwise "no candidate change is indicated". Always followed by §3.3's sentence: gating a third weekly candidate or re-registering needs a ruling by Anton, and any setting chosen from these development-fold numbers has been selected on them.
1. The rulings of §3.1, verbatim.
2. The §5 tables, then §6, §7 and §8 (bands, folds and H − G, then the arms).
3. The checks, hashes, times, versions and threads.
4. **Limits:**
   - everything is report-only, with no label and no gate, and 2025 is held;
   - arm numbers are on the development folds the registered fits were evaluated on, so selection from them is not clean evidence;
   - route (a) keeps context terms fitted at s = 1 on the counted targets;
   - the season α / k / δ surfaces are not recorded (F4);
   - B1c rows are outcome-conditioned;
   - fold 2019 has one training season;
   - the 2b-1b limits apply.

## 10. Runner (`run_weekly_analysis.py`)

Every step returns 2 on failure, through `rwm._stop`-style messages.

**`Deps`** (a dataclass; every field patchable — review flag 6).
- `task_file`, `anchor`.
- Loaders: `load_meta`, `load_benchw_meta`, `load_cache`, `load_teamctx`, `load_extras`, `load_benchw`.
- Paths with their pinned SHA constants: `inputs`, `prior`, `preds`, `fits`, `benchw`, `art_2b1b`, `art_2a`, `constants`.
- `env`, `env_w`, `out_dir`, `verdict_dir`.

The defaults mirror `rwm.Deps`. The tests build `Deps` from `e2e_w.deps_for` and `e2e_w.dev_run()`. That run's fits, preds and 2b-1b artifact use `--resamples 60`, so check 5(c) in the tests runs at 60. Two more fixtures come from new test-only helpers in `test_weekly_analysis.py`, not edits to `e2e_w`:
- the 2a-shaped artifact holds `results[P][cand]["chosen"]` for the e2e folds, with planted values;
- the constants file holds `constants.K_ROS_POINTS` and `K_ROS_OPP`.

**Folds.** `folds = tuple(T for T in splits.DEV_FOLDS if T <= weekly_data.LAST_SEASON)`, as at `run_weekly_models.py:239`, used in steps 3–6 and the fits-key assertion (review flag 7).

1. **Prereg hash.** `report.prereg_hash(<run_season_models.LP1A_TASK_FILE text>)[0] == report.PREREG_HASH`, before any load.
2. **Anchors, before any JSON, pickle or registry read:**
   - the panel meta `generatedAt == run_season_models.ANCHOR_GENERATED_AT`;
   - the benchw meta `panelGeneratedAt` equals it, with `c2`, `c3` and `c6` passing;
   - by `registry.sha_file`: `weekly-inputs.pkl`, `season-prior.jsonl`, `weekly-preds.jsonl`, `weekly-fits.pkl`, `benchw.jsonl` (`4ec9ba99d7bc4de7220f776d10fd12c0c448134f1be1513c7922c3a037c175b7`, the 2b-1b artifact's entry; review flag 12), the 2b-1b artifact, the 2a artifact and `inseason-constants.json` each equal the runner constants (the §0 anchors).
3. **Locks.** `registry.require(n, T, "season", registry.Env())` and `(…, "weekly", registry_w.weekly_env())` for n ∈ H, G and every T in `folds`. The runner writes **no** run-log entry.
4. **Load, trim, build** exactly as `run_weekly_models.main` steps 4–6, calling the same functions:
   - `from_panel_full`, `weekly_data.trim`, `assert_trimmed`, `score.parity`;
   - `pd.read_pickle(inputs)`, `Store` with H's stamped season spec, `weekly_h.history`, `baselines.build_weekly_frame(…, range(FIRST_TRAIN_SEASON, LAST_SEASON + 1))`;
   - `benchw = weekly_data.trim_frame(load_benchw()[0])`;
   - preds = `weekly-preds.jsonl`;
   - `assert_trimmed(T_trim, frames=[benchw, frames["H"], frames["G"], wf, hist, preds])`, and assert max `T` of preds ≤ `LAST_SEASON`.
   
   Then the pickle load of `weekly-fits.pkl`, and assert its keys == {(c, T)} for c ∈ h, g and T ∈ `folds`. (The pickle is our own cache, loaded only after its SHA-256 matched in step 2.)
5. **Runtime checks** (tolerance 1e-9 × (1 + |x|)):
   - **(a)** `predict_w(scale_k(fits_h_T, 1.0), …)` `cond` equals the cached `h` rows for every T, and the cached `Fits` are unchanged afterwards (`k` per target re-read).
   - **(b)** The no-change refit, `fold_w(…, stamped H spec, variant={"fixedCalib": fixedCalib(T)})`, reproduces the cached `h` `cond` and every target's (`kMult`, `rho`, `alpha`), for every T. This licenses routes (b) and no-context.
   - **(c)** `paired` reproduces the 2b-1b artifact's `results` for h and g against STD and B1c at every position: n, `candMae`, `benchMae`, d and dSpearman, value and CI.
   
   A miss is a §12 stop.
6. **Analyses** §5–§8. `wk` = the concatenated `weekly_forecasts(wf, T, None, benchw)` frames for `folds`, merged with the cached `h`, `g` and each arm's renamed `cond` (§8).
7. **Outputs.** With `--write`: the artifact and the report. Without it: print §0a and the summary tables and write nothing.

Per-fold seconds are recorded; over 60 min in total is a §12 stop.

## 11. Copied definitions

| Copy | Original | Test |
|---|---|---|
| `analysis_w.paired` (the per-(c, bench) arithmetic, without `M.label`) | `lp/evaluate_w.py` `labels` | T-C-1, runtime check 5(c) |
| λ_B1 = n/(n + k) (a report-only restatement of B1's evidence weight) | the app's `posteriorOf` weight (CR-25); data side `lib/learnedBench.mjs` `posteriorValue` | T-C-7, pinned to hand values computed from `posteriorValue`'s formula at three (n, k) pairs |

Everything else is imported, the thread pins included (§4). The λ_B1 restatement reads only benchw's own `n` and `k`; it feeds no forecast, so it is not a coupling and needs no index entry (review flag 5).

## 12. Stops (report to Session 1, never improvise)

- **Scope.** A need to touch §1 **Out**, or to change an imported function.
- **Caches and locks.** A SHA off its anchor; a `require` failure; a needed regeneration (for Anton).
- **Checks.** Any §10 step 5 miss.
- **Results.**
  - A pooled gain of more than 12% over STD, B1c or H — a suspected leak (re-run 2b-1b's T-B-9 on real data and report). It applies per position (all folds), and per position and band (all folds) — never to a single fold or a fold × band cell (review flag 13).
  - An R-W or R-S outcome is **reported, not a stop of the run**.
- **Budgets.** Over 60 min in total, or an artifact over 5 MB.
- **Other.** Any open design question.

## 13. Later (outline only) — LP-2b-1c-ii

Planned after this slice is verified and signed off. It reuses this runner and these modules.
- RIDGE, B2, raw B1 and B4 (B4 trimmed and asserted).
- Unconditional MAE, and P(plays) Brier and log-loss against persistence, through `report.expected_points` and `report.P_CLIP` (flag 5).
- Cohorts by aliasing `report.cohort_eval` on trimmed `weeks`, with all four outputs asserted (flags 3 and 14).
- ROS through a new future-week builder and `predict_w(…, origin=n)` (flag 11), with the n = 0 week-sum identity against LP-2a `total`. **ROS is exploratory; replacing the app's ROS needs its own registered, tested run** (Anton 2026-11-18).
- Arms under `fixedCalib`: no-absence, no-opp, no-era-blend (rebuilt prior frame), c_w = 1 (from the cached `ppg`, no fit), oracle-status (a stop if the inputs lack a target-week status column), and G no-prior. Each G fit follows the pin rule.
- Budget: about 50 min, G dominating.

**Depends on:** 1c-i verified and its caches unchanged.

## 14. Done-definition

1. **Commit A** — the new modules, the runner, the tests and this file. Before committing:
   - the full Python suite is green (`python3 -m unittest discover -s research/learned-projection/tests -t research/learned-projection`);
   - every §15 test has been shown red and restored;
   - `git diff --stat` touches no §1 Out path.
2. **Run** `--write`. Then `require` still passes for both candidates, layers and `DEV_FOLDS`; `registry_w.section_hash` equals `SECTION_SHA`; and every cache SHA is unchanged.
3. **Commit B** — the artifact, the report with §0 written, and the docs:
   - the research README;
   - the repo README's LP Module-notes row;
   - `data-catalog.md` Non-served artifacts: the two new outputs;
   - the `CLAUDE.md` LP row: this task file and the three new files (keep it under 25,000 bytes).
   
   `npm test` and `npm run smoke` are green. No served-folder or `manifest.json` change.
4. No push and no rebase.

**Hand-back:**
- the SHAs, files and deviations;
- the check maxima, §0a verbatim, the run times and the threads;
- per test: the assertion, the defect, the Fact and the red step.

## 15. Tests (`tests/test_weekly_analysis.py`; each shown red once, then restored; every Fact asserted in `setUp`)

Fixtures: `synth_wmodels` (H `Fits` from `fit_w` on a stated DGP) and hand-built `wk` frames. Any test reaching `fold_w` patches `registry.require`.

### T-C-1 · `paired` equals `evaluate_w.labels` (copy)
- **Asserts.** On a hand `wk` (two folds, two positions, h, g, std, b1cw), `paired(wk, "h", col, …)` equals `labels(wk, folds, B=200)["h"][P][bench]` for both benchmarks and positions: n, `candMae`, `benchMae`, d and dSpearman, value and CI, exactly. The output has no `label` key.
- **Fails if** the resampler universe, the group ids or the rows drift from the original.
- **Red:** build the `Resampler` on the relevant ∧ played rows only.
- **Fact:** one pid appears only in non-relevant rows, so the two universes differ.

### T-C-2 · Week bands
- **Asserts.**
  - Rows at w = 4, 5, 9 and 10 fall in bands `0-3`, `4-8`, `4-8` and `9+`.
  - The three band row sets partition the comparison rows.
  - A band's d equals `paired` run on a frame holding only that band's rows plus the position's other rows marked not relevant (same universe).
- **Fails if** bands use w instead of w − 1, or the universe shrinks to the band.
- **Red:** band on w.
- **Fact:** the fixture has rows at w = 4, 5, 9 and 10, and some pid appears only outside the band.

### T-C-3 · Edge classes
- **Asserts.** On a hand `Fits` and a hand 2a-shaped dict:
  - weekly `kMult` 32 → `edge-high`, 0.5 → `edge-low`, 8 → `interior`;
  - ρ 1.0 → `limit-high`, 0.6 → `edge-low`;
  - α "off" → `limit-high`, 1 → `edge-low`, 1000 → `interior`;
  - φ 0.95 → `interior`;
  - season α 1000 → `edge-high`; kMult 0 → `limit-low`, 10 → `edge-high`; δ 1.0 → `limit-high`, 0.5 → `edge-low`; λ 0.35 → `edge-high`;
  - season G λ → `two-point`, g → `n/a`;
  - the ≥ 4-of-6 list holds exactly the planted target.
- **Fails if** "off" or a limit is read as an edge, or the last element as interior.
- **Red:** drop the limit table.
- **Fact:** the fixture holds each listed value.

### T-C-4 · Surfaces and R-S
- **Asserts.**
  - On a hand 11 × 5 `gridSse` with the chosen (kMult 32, ρ index 2), the k-high drop equals (SSE[9, 2] − SSE[10, 2]) / SSE[10, 2].
  - An interior choice gives no row.
  - On hand `innerMae` lists for six folds:
    - drops > 0 in 4 folds with a mean of 0.6% → R-S holds and the STOP line prints;
    - 3 folds → it does not;
    - 4 folds with a mean of 0.4% → it does not.
  - The G λ drop reads the (era, g) pair of the chosen entry.
- **Fails if** the drop reads the wrong axis or column, or R-S ignores a threshold.
- **Red:** read row-wise (the ρ direction).
- **Fact:** the hand matrix's row-wise and column-wise last-step drops differ.

### T-C-5 · k sweep (route a)
- **Asserts.**
  - `scale_k(fits, 1.0)` predictions equal the original's exactly.
  - At s = 2 every target's `k` doubles; `rho`, the cohort's predictions on a probe matrix, bounds, `c_w` and φ are unchanged.
  - After two sweeps (s = 2, then 4) the original `Fits`' `k` values are unchanged, and the s = 4 copy has 4 × k, not 8 ×.
  - The cohort count matches the planted targets.
- **Fails if** the sweep mutates in place or touches more than k.
- **Red:** scale without `deepcopy`.
- **Fact:** the fixture's s = 2 prediction differs from s = 1 by > 1e-6 on some row with E > 0.

### T-C-6 · Widened spec and the `fixedCalib` route (route b, no-context, check (b))
- **Asserts.**
  - `widened_spec(spec)` equals `spec` except `kMultW` = stamped + [48, 64, 96, 128], and the input `spec` is unchanged.
  - `registry.spec_sha` of the two differs, and the arm output records the widened one.
  - `fold_w` with `fixedCalib` from the fixture `Fits` makes zero `weekly_models.xfit_groups` calls (patched counter), and its `c_w` / φ equal the given ones.
  - With the unchanged spec, its predictions equal the fixture `Fits`' exactly (check (b) logic).
  - `hContext: False` gives no cohort anywhere.
- **Fails if** the arm cross-fits, edits the stamped spec, or the reproduction is not exact.
- **Red:** omit `fixedCalib`.
- **Fact:** the fixture's registered `c_w` differs from 1 by more than 1e-3 at some position.

### T-C-7 · Override speeds
- **Asserts.**
  - Rows built with ppg = ppg0 + 0.4 (m/c_w − ppg0) and c_w = 0.9 give λ = 0.4 (to 1e-12), and rows with |m/c_w − ppg0| < 1 are excluded.
  - The `origin` passed to `predict_w` is an array of zeros in frame row order (a scalar would raise).
  - λ_B1 is the median of n/(n + k) over rows with `kind` ∈ {null, "original", "none"}, and it equals hand values at (n, k) = (1, 2.5), (4, 3) and (8, 1.5).
  - The target classes follow the season spec (`rush_att` → volume, `rush_yd` → efficiency, `kr_yd` → other).
  - A cell under 30 rows prints INSUFFICIENT.
- **Fails if** start-chain rows count, the scales are mixed, or the slope is not through the origin.
- **Red** (each shown once): keep the "starter"/"backup"/"preseason" rows; use m instead of m/c_w.
- **Fact:**
  - a QB "backup" row with `liveChain` False has n/(n + k) far from the others, so the median moves;
  - c_w ≠ 1, so the unscaled slope differs from 0.4 by more than 1e-3.

### T-C-8 · Anchors, caches and the held season (runner)
- **Asserts.**
  - The runner returns 2 on each one-byte-changed copy of each step-2 input. The meta loaders are injected through `Deps`, so step 2 itself needs no `json.load`. `pd.read_pickle`, `pickle.load` and the artifact/preds readers are patched to raise, so the SHA check precedes every read (review flag 8 (i)).
  - On a preds file with one T = 2025 row, **with `Deps.preds_sha` re-pinned to that file's SHA**, it returns 2, and the stop message names the trim check, not the anchor (flag 8 (ii)).
  - It returns 2 on a `require` failure.
  - On an `e2e_w` run with `LAST_SEASON` patched to L, every `weekly_data.guard` call (recorded) has T ≤ L, and no frame passed to `paired` or `predict_w` has S > L, while benchw holds S = L + 1.
- **Fails if** a cache is read unverified or a held row reaches a frame.
- **Red:** hash after loading.
- **Fact:** the changed copy's SHA differs from the constant, and benchw has S = L + 1 rows.

### T-C-9 · Report-only and isolation
- **Asserts.**
  - The artifact and report hold no `label` key, and no "beats" or "loses" outside the verbatim quotes of §3.1 and the R-W/R-S lines.
  - Every arm and band entry has `exploratory: true` and a spec hash.
  - Run in temporary directories, the runner writes only into `out_dir` / `verdict_dir`: `candidates/` and `.cache/models/` are byte-identical, mtimes included, and the run-log is unchanged.
  - No new file appears in `SEASON_CODE`, `season_code(·)`, `SEASON_HARNESS`, `WEEKLY_CODE(·)` or `WEEKLY_HARNESS`.
  - The report has no `git rev-parse` output.
- **Fails if** a label leaks or a registered path is written.
- **Red:** add `M.label(...)` to the arm output.
- **Fact:** the fixture arm's numbers give `M.label` = "beats", so a leaked label would show.

### T-C-10 · Pins
- **Asserts.**
  - A subprocess importing `run_weekly_analysis` sees the four thread variables = "1", with numpy not preloaded, and `threadpool_info()` all at one thread.
  - With `PYTHONHASHSEED` unset, `_ensure_seed(fake_execv)` calls the fake once with `sys.executable`, the same argv and seed "0". With the seed already "0", it does not call it.
  - `_threads()` is `rwm._threads()`.
- **Fails if** numpy is imported before `run_weekly_models`.
- **Red:** move `import numpy` above it.
- **Fact:** the subprocess starts with the variables unset.

## Fix pass 1

From the full implementation review of `f49d85e..0448d63` (2026-11-19), triaged by Session 1 and approved by Anton ("Yes, fix pass 1"). Applier: the fix-applier subagent.

**Scope.** Only these files:
- `research/learned-projection/lp/analysis_w.py`;
- `tests/test_weekly_analysis.py`;
- the two regenerated outputs, `backtests/2026-11-19-learned-s2b1c1-analysis.json` and `grading/2026-11-19-learned-s2b1c1-report.md`, regenerated with `--write --date 2026-11-19`.

Do not touch `run_weekly_analysis.py` or `lp/report_s2b1c.py` unless an item below names them. Do not touch any registered path, `candidates/`, an existing test or fixture other than `test_weekly_analysis.py`, a cache, `run-log.jsonl`, a served folder or `manifest.json`. Do not run any other runner. Stop and report if an item needs more than it names, or if the rerun changes any §0a rule line other than through items 1–2's table.

1. **λ_B1 on the λ_H cell's rows** (review flag 1).
   - In `override_levels`, `b1_weight` must receive exactly the rows `lambda_cells` used for that (P, n) cell for registered H: n ≥ 1, |x − ppg0_h| ≥ 1.
   - Expose that row set from `lambda_cells`, for example by adding the filtered frame's index to the cell, and reuse it. Do not recompute the filter separately.
   - `b1Rows` ≤ `rows` must then hold in every cell.
2. **Finite B1 inputs** (flag 2). In `b1_weight`:
   - keep only plain-kind rows with finite `nB` and `kB` and `nB + kB > 0`;
   - record `"b1Missing"`, the number of plain-kind rows dropped for a missing or non-finite value;
   - carry it into `override_levels` output and the §4.2 report column.
   
   A cell with no usable row gives `lambda` None and `"status": "no-b1-rows"`.
3. **Tests for items 1–2** (flag 6). Add `TestOverrideLevels`, which calls `override_levels` on a hand frame.
   - **Asserts:**
     - every cell's `b1Rows` ≤ `rows`;
     - λ_B1 equals the median of n/(n + k) over the cell's filtered plain rows only;
     - a plain row with NaN `nB` is dropped and counted in `b1Missing`, and λ_B1 stays finite.
   - **Fact, asserted in setUp:**
     - one plain row has |x − ppg0| < 1 and an n/(n + k) far from the rest, so including it moves the median;
     - one plain row has `nB` NaN.
   - **Red:** show each item's defect separately. For item 1, revert to `sub = rows[(position == P) & (n == n)]`. For item 2, remove the finite mask. Then restore.
4. **Rule-logic tests** (flag 5). Add `TestRuleOutcomes` on hand inputs to `r_w`, `rule_outcomes`, `finding_line`, `rename_arm` and `merge_arm`.
   - **Asserts:**
     - `r_w` holds only when the CI is entirely below 0 **and** −d/MAE(H) ≥ 0.01 (cases: CI below with 0.5% → no; CI below with 1.2% → yes; CI spanning 0 with 3% → no);
     - an s < 1 arm meeting R-W gives "slow override costs accuracy at P";
     - an s > 1 or `h_wide` arm gives the "too fast / the grid too narrow" line;
     - R3 always has the "waits on Anton's ruling" sentence and appends the R-S clause only when an R-S stop is passed;
     - R4 names an arm only for RB/WR hits;
     - `merge_arm` raises when the arm column already exists in `wk`.
   - **Fact:** the planted inputs include each case above.
   - **Red:** swap the CI test to "entirely above 0" in `r_w`, then restore. A second red: remove the clash raise, then restore.
5. **Leak stop** (flag 7).
   - Show `test_leak_check_flags_a_pooled_gain_above_twelve_percent` red: compare with `>=` against 0 in `leak_check`, then restore.
   - Add one e2e test: `run_once`-style, but with `A.LEAK_GAIN` patched to 0.0 instead of 10.0. `main` returns 2, and the stop message names the leak check.
   - **Fact:** the e2e run's max pooled gain is > 0.
   - **Red:** make `main` ignore `leak_check`'s result. That edit is in `run_weekly_analysis.py`; this item names it, and you revert it right after showing red.
6. **Rerun and report §0** (flags 3–4).
   - Run `python3 research/learned-projection/run_weekly_analysis.py --write --date 2026-11-19`. It must return 0, with checks (a)–(c) at max 0 and the anchors unchanged.
   - Then rewrite the report's `## 0. Answers for Anton` from the regenerated §0a lines and tables only:
     - **(1)** No "none improves anywhere". State that no arm meets the finding rule (CI below 0 and ≥ 1%). Name every arm-and-position cell whose d against H has its CI entirely below 0 but is under 1%, with its d and percentage (h_ks2 at WR was one).
     - **(2)** Split the weekly answer by edge. Only the k-high edge has development-fold evidence (route (b)). Give the k-low and ρ-low training-SSE medians per position and their target-fold counts, and say they have no test-fold arm in this slice. Include QB's k-high median.
     - **(3)** and **(4)** follow §0a as before.
   - Every sentence must trace to a line of §0a or a table in the report.
7. **Checks and commit.**
   - The full Python suite, `npm test` and `npm run smoke` must be green.
   - Make one commit, `LP-2b-1c-i: fix pass 1 (override weights, rule tests, report §0)`, staging by name: the two code/test files, the two outputs, and this task file (this section).
   - No push, no rebase.

**Accepted, not fixed — flag 8.** `paired` filters null `b` for every benchmark, where `evaluate_w.labels` filters only B1c, and it omits the null-candidate raise. STD is never null on the real rows, and check 5(c) matched n exactly. This is recorded in Verification.

**Hand back:**
- the commit SHA and files touched;
- the red confirmation for items 3, 4 and 5;
- the regenerated §0a lines verbatim, and a diff of the report's §0;
- the new §4.2 WR row values.

## Verification

Session 1, 2026-11-19. I reviewed the diff itself, not only the hand-backs.

**Rebase.** `git pull --rebase origin main` at 2026-11-19T10:43Z. `origin/main` is `f49d85e` (`git ls-remote` confirms it). It is the slice's own base, so no capture commit came in and every id below is final.

**Commits** (main, unpushed, on top of `f49d85e`, Anton's signed settings commit, which is outside this slice):
- `ade861b` — Commit A: modules, runner, tests, task file;
- `0448d63` — Commit B: the artifact, the report with §0, docs;
- `15fb428` — Fix pass 1: override weights, rule tests, report §0;
- this commit — this record.

**Reviews:**
- **Full implementation review** (opus, high) of `f49d85e..0448d63`: 8 flags, none blocking.
  - Flags 1–7 were fixed in Fix pass 1:
    - λ_B1 had been computed on the unfiltered cell rows; I confirmed this at `analysis_w.py:291`;
    - WR λ_B1 was NaN at n ≥ 2, from a missing benchw value;
    - two §0 overstatements;
    - no tests of the rule logic or `override_levels`;
    - the leak test was never shown red, and the leak stop had no end-to-end test.
  - **Flag 8 is accepted.** `paired` drops null-`b` rows for every benchmark, where `evaluate_w.labels` drops them only for B1c, and it omits the null-candidate raise. STD is never null on the real rows, and check 5(c) matched n and every value exactly.
- **Fix-pass re-review** (light) of `0448d63..15fb428`: no flags.
  - `run_weekly_analysis.py` is byte-identical to `0448d63`.
  - The artifact differs only in `overrideLevels` and `seconds`, and §0a is identical.
  - `b1Rows ≤ rows` in every cell, and WR λ_B1 is finite.

**Deviations** (all accepted):
- the `analysis_w.refit` and `analysis_w.origin0_ppg` helpers;
- an extra `leak_check` unit test (shown red in Fix pass 1);
- the leak limit read at call time;
- the e2e test rewrites its temporary candidate files to carry the full season grid (temp files only);
- Fix pass 1's one-column change in `lp/report_s2b1c.py`, which item 2 requires.

**Locks**, re-checked by Session 1 on `15fb428`:
- `require` passes for H and G, on both layers, for 2019–2024;
- `registry_w.section_hash` equals `SECTION_SHA` for both;
- the cache SHAs are unchanged: `weekly-inputs` `2431b397…`, `season-prior` `55c55e20…`, `weekly-preds` `44d7132a…`, `weekly-fits` `4c6738bb…`, `benchw` `4ec9ba99…`;
- there is no diff in `candidates/`, the registered weekly code, `manifest.json` or the served folders;
- no run-log entry was written;
- no label, gate or `M.label` appears anywhere.

**Result** (report-only; development folds; 2025 held):
- **Override speed does not explain the tie** at any position. No arm meets the finding rule (CI below 0 and ≥ 1%). The only arm cell with its CI below 0 is h_ks2 (k × 2) at WR: d −0.019 [−0.036, −0.002], 0.3%. The widened k grid changes nothing (|d| ≤ 0.003 everywhere).
- **Against B1c by band**, only RB weeks 10 and later are distinguishable (d −0.110, H better).
- **Weekly grid edges:**
  - k-high has a training-error drop of 0.02–0.05% per last step, with route (b) as the test-fold evidence;
  - RB k-low (0.32%, 5 target-folds) and ρ-low (0.42%, 11) have no test-fold arm.
- **Season:** R-S holds for RB H (6 of 6 folds, mean drop 1.19%), so the runner printed **STOP for Anton before LP-2b-2 is planned**. The season α / k-multiple / δ errors are unrecorded, and their edge shares are high (α at an edge in 88% of RB and 90% of WR target-folds).
- **R4:** no candidate change is indicated.

**Checks** (Session 1, on `15fb428`):
- Python suite: 214 tests OK;
- `npm test`: 2150 pass / 0 fail / 1 skipped;
- `npm run smoke`: exit 0;
- `CLAUDE.md`: 24,126 bytes;
- artifact: 754,552 bytes.

Signed off by Anton 2026-11-19

**Ruling (Anton, 2026-11-19, verbatim):**

> proceed to LP-2b-2 with the registered candidates. Record the RB season-λ edge (a training-error drop, not a test result) and the unrecorded season α / k-multiple / δ edges as stated limits in the LP-2b-2 outline and README; wider season grids go to the off-season model work, tested on the 2026 season.

Both limits were recorded in the same push:
- in `.claude/tasks/learned-projection-2b1b-weekly-models.md` §16, the LP-2b-2 outline;
- in `research/learned-projection/README.md`.
