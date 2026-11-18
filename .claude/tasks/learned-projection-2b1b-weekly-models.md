# LP-2b-1b · Learned projection research — weekly models, registration, development-fold labels

**Status:** plan, Rev 2.1 (2026-11-18). Slice 1 of 2 (§3.3). Full reviews: Rev 1, 15 flags, fixed; Rev 2, 0 blocking, 8 flags fixed. **Approved by Anton 2026-11-18 (Rev 2.1).** Rev 3 (§17): Anton's pre-registration change to H context; light review, 0 blocking, 4 flags fixed.

**Review depth: full** — scoring-affecting research; it registers the weekly layer and touches the 2025 and registration locks.

**Session 2:** sonnet at high effort, inside `sleeper-dashboard-data/`; read its CLAUDE.md first. Python only. Paths are relative to `research/learned-projection/` unless they start with a repo folder.

**Anchors:**
- data `main` @ `6186371`;
- `.cache/panel/` `meta.generatedAt` `2026-11-12T23:44:16.940Z`;
- LP-1a §8 `preregHash` `7ff9087fc4848b0df90383fc5e4397d3d4b085466c228b430211a63ad6e24e5a`;
- `backtests/2026-11-17-learned-s2b1a-inputs.json` → `sha256`:
  - `season-prior.jsonl` `55c55e200ce18d549d522ee007e284bbe180ff98209378c4c355a47a9643c56a`;
  - `weekly-inputs.pkl` `2431b3978d5a078fb2256e3553ca513f17c62160ec56ac72fb657486f43a1fb2`;
  - `season-preds.jsonl` `b2fafc889c05b27d2b89c7eea2b710739db5c2ee36f12d924fab1d20768a46a2`;
- season sections (canonical `json.dumps(layers.season, indent=1, sort_keys=True)`):
  - H `572792a2214653ac6d09be5f375113160d5a157461b141c63255951cc087301c`;
  - G `12bd9025530022eab79bc27cafc93e94cfd7d497ee715b87f872196b01090500`.

---

## 0. What this is, for Anton

The learned models gain an in-season layer, which predicts each week's points if he plays and the chance he plays. It is locked (registered) before any 2019–2024 weekly score exists. It is then scored on the frozen bar against the season-to-date average (STD) and the app's in-season model (B1c). 2025 stays sealed, and "loses" is a valid result.

## 1. Scope

**In:** §4–§15.

**Out (each a §12 stop):**
- **Protected files.** Any edit to:
  - a season-hashed path (`registry.SEASON_CODE`, `SEASON_HARNESS`);
  - `lp/spec.py`, `lp/sleeper.py`, `run_benchmarks.py`, `fetch_sleeper_projections.py`;
  - a 2b-1a file (`lp/spec_w.py`, `weekly_data.py`, `season_prior.py`, `era_w.py`, `run_weekly_inputs.py`, `tests/synth_weekly.py`);
  - an existing test;
  - the `season` section of the candidate files.
- **Caches.** Regenerating either 2b-1a cache, or running `run_weekly_inputs.py`.
- **LP-2b-1c content** (§16), including the rest-of-season sum (ROS).
- **Outside this folder:** files outside it, except the §13 docs, this file and the §11 outputs; Node, app or index files; any `bin/` run; served or `manifest.json` writes; any network use beyond smoke; any new library.
- **The held season and the bar.** Any 2025 row in a fit, feature, trimmed frame or metric; any change to LP-1a §8.

## 2. Facts (2026-11-18, pre-fit)

- **F1 · `weekly-inputs.pkl`.**
  - Holds `{"H": frame, "G": frame}`, in the same row order.
  - Each frame is 66,990 × 231 (S 2018–2024, w 1–18), with 45,395 played rows.
  - Columns: `spec_w.IDENTITY`, the `inputs_spec()` groups, `targetCols` (`r_<t>`, `e_<t>`, bool `played`, `pts`).
  - There is no `roof` column, and no NaN `pr_*` for the row's position.
- **F2 · `season-prior.jsonl`.**
  - Unblended, one row per (cand `h`/`g`, pid, T, position).
  - Fields: `pr_<t>`, `pr_gamesShare`, `share`, `games`, `ppg`, `total`, `c`, `kv_*`.
  - `ppg` uses `minor = store.minor(list(splits.train_seasons(T)), P)`.
  - The pkl's `pr_<t>` is blended with n/(n + 4), so it equals this value at w = 1.
- **F3 · Weekly targets:** QB 8, RB 11, WR 9, TE 6. Every other key is a minor constant.
- **F4 · Form sums** (`inputs_at`) are `_num_exp` over every played to-date row.
  - The rows include 1,265 non-universe rows.
  - A row with non-finite num or exp contributes 0 to both.
  - A `po` numerator is kept even when its denominator is 0.
  - The decay is a = his later played rows.
  - `targets_at` instead drops `exp = 0` rows (105 played rows).
- **F5 · Registry.**
  - `append_layer` needs the season layer stamped and the weekly layer not. It stamps through `stamp`, which needs every path tracked and equal to HEAD, and leaves the season object byte-identical.
  - `require` compares the whole `data` object, and checks `tracked_clean` on the candidate file.
  - `_head_spec` reads the season spec only.
  - `register` closes on a `dev` entry.
  - `require(·, T ≥ 2025)` raises `ConfirmationHeld` only until all four layers are stamped. **After Commit 2 it no longer holds 2025** (flag 17).
- **F6 · Benchmarks.**
  - `baselines.weekly_forecasts(wf, T, b4, benchw)` returns only the test frame. Its training frame stays internal (`baselines.py:226-261`).
  - `report.weekly_eval` and `report.cohort_eval` hard-code `TEST_SEASONS`.
  - `io.load_benchw()` returns 102,636 rows covering S 2014–**2025**. Its meta matches the anchor and passes `c2`, `c3` and `c6`.
  - Only file hashing and the meta read touch 2025 bytes, as in 2b-1a F8.
- **F7 · State.** The candidate files hold only `layers.season`, and the run-log has no `weekly-dev` entry.
- **F8 · The bar** (s1b `cond`, relevant ∧ played rows, seven folds). Weekly conditional MAE (QB/RB/WR/TE):
  - STD 7.17 / 6.35 / 6.32 / 5.64;
  - B1c 7.14 / 6.15 / 6.14 / 5.54.

  `beats` needs ≥ 3%, about 0.2 points per week.
- **F9 · LP-2a.** Neither candidate passes the season gate:
  - RB and WR beat B2 and B1c;
  - QB beats B2 and ties B1c;
  - TE ties.

## 3. Rulings

### 3.1 Anton, 2026-11-16

Binding as recorded verbatim in 2b-1a §3.1. Item 1 is §3.2; item 2 is in §3.4 and §11; item 3 is in §11 and §13.

### 3.2 Binding decisions (Anton's Session 1 brief, 2026-11-18, verbatim)

> - Anton 2026-11-16 — progression per position: the weekly layer is built for all four positions for H and G; weekly labels (LP-1a §8 per-position arithmetic, preregHash 7ff9087f…e24e5a unchanged) are labelled for RB and WR and report-only for QB and TE. The overall 3-of-4 weekly gate is still computed and printed; it is expected to fail by construction and is not the product decision. The verdict states this rule and its date.
> - Anton 2026-11-17 — G reproducibility (2b1a §20 + §19): every G fit with OMP_NUM_THREADS, VECLIB_MAXIMUM_THREADS, OPENBLAS_NUM_THREADS, MKL_NUM_THREADS = 1 set before numpy/sklearn import and PYTHONHASHSEED=0 (re-exec), all recorded in artifact and run-log. Stated limit: G reproducible only approximately (one of four pinned 2b1a runs off by up to 4.84%); H exact.
> - Caches by SHA: read season-prior.jsonl and weekly-inputs.pkl as written by the final 2b1a run, verify each SHA-256 against the 2b1a artifact before use, never regenerate before registration; a needed re-run is a stop for Anton.
> - No re-registration path: after the registration commit, fix passes touch only tests, docs and the verdict; a code defect found after --dev is a §14-style stop for Anton.
> - No edit to any season-hashed path (2a §9) or any 2b1a module; new code in new modules only.
> - All LP-2a and LP-2b-1 carry-overs listed in 2b1a §19.

The source of bullet 2 is 2b-1a §20, and it stays binding. "§14-style" in bullet 4 means §12 here.

### 3.3 Anton, 2026-11-18 (verbatim)

> Split approved as proposed. 2b-1b: registered code plus labels; 2b-1c: report-only, outline only, planned after 2b-1b is verified. Conditions: both hooks (fitted-model cache by SHA, variant switch) are tested before registration, each test named with the fixture fact that makes its red step bite. Arms in 2b-1c reuse the registered calibration (settles flag 15). Note in the 2b-1c outline: the rest-of-season forecast is exploratory here; replacing the app's ROS later needs its own registered, tested run.

### 3.4 Carried

**Rulings carried:**
- LP-2a R1, R6 and R7;
- LP-1a rulings 1, 2, 6 and 8;
- from 2b-1a §3.3: training from 2018, `eraN0 = 4`, and the `lines` arm in LP-3;
- no best-of-two.

**Carry-over map (2b-1a §19):**
- LP-2a flags: 4 → §10.2; 9 → §11; the unused import → §4.
- LP-2b-1 flags: 2 and 7 → §6.6; 6 and 8 → §8; 9 → §6.1; 11 → §6.4; 17 → §11; 18 → §12.
- The fallback note → §6.5; the benchw trim → §10.6.
- Flags 3, 5, 14 and 15 → LP-2b-1c.

## 4. Layout

```
lp/spec_wm.py (§7, not hashed, like spec.py)   lp/weekly_h.py (§6.2)   lp/weekly_g.py (§6.3)   lp/pplays.py (§6.4)
lp/weekly_models.py (§6)   lp/registry_w.py (§8)   lp/evaluate_w.py (§9)   lp/report_s2b.py (§11)
run_weekly_models.py --init-weekly | --smoke | --register-weekly | --dev [--write] [--date] [--resamples]   (§10)
tests/synth_wmodels.py  test_weekly_models.py  test_weekly_registry.py  test_weekly_eval.py
.cache/models/  git-ignored, new: weekly-preds.jsonl, weekly-fits.pkl
```

Modules import each other as modules (`import lp.weekly_h as weekly_h`), never as `from … import <function>`, so that `mock.patch.object` sees every call. The runner imports only what it uses.

## 5. Inputs and the held season

- **Caches.**
  - A cache is used only once `registry.sha_file(path)` equals `INPUTS_SHA` / `PRIOR_SHA`. Those are runner constants equal to the anchors (T-B-16).
  - On a mismatch the runner returns 2 before `pd.read_pickle`.
  - Nothing here writes either cache.
- **Rows.** Fold T trains on `TRAIN_FROM ≤ S < T` and predicts S = T.
- **History (H only).** `weekly_h.history(tables, store, seasons)` mirrors F4.
  - It calls `weekly_data._check_targets(store, spec_w.inputs_spec())` first.
  - It then runs `weekly_data._num_exp` on every played `weeks` row, for the targets of `store.pos[pid]`. A row with a non-finite num or exp contributes 0 to both.
  - Returns `pid, S, w, num_<t>, exp_<t>`.
- **2025.** Trimming follows §10 steps 4 and 6. `fold_w` runs `weekly_data.guard(T, confirm)` first and asserts S ≤ `LAST_SEASON`. Nothing passes `confirm=True`.

## 6. Weekly candidates (per position P, target t)

### 6.1 Composition (`weekly_models.compose`)
- **Clip.** `q_t` is in native units (`pg`: per game; `po`: per opportunity). It is clipped by `chain.clip_bounds(r, e, t)`, computed over the fit's training rows with e > 0 and finite r.
- **Points.** `ppg = chain.season_points({**q, "gamesShare": ones}, store.struct, P, minor_S, store.weights, ones, 1.0)["ppg"]`, on arrays, with `minor_S = store.minor(list(splits.train_seasons(S)), P)` (F2). Then `cond = c_w[P] × ppg` and `uncond = p × cond`.
- **The n = 0 identity** (flag 9): at w = 1, with `noPrior` = 0, the unclipped composition of q = `pr` equals F2's `ppg`. A fitted prediction agrees with it only where no clip binds.

### 6.2 H (`lp/weekly_h.py`; imports `model_h.Cohort`)
1. **Evidence.**
   - The evidence is his season-S `hist` rows with week ≤ origin n, where n defaults to w − 1 (§6.6).
   - a_j is the number of his later such rows, so the latest row gets ρ⁰.
   - `E = Σ ρ^{a_j} exp_j`, `N = Σ ρ^{a_j} num_j`, and `b = pr + (N − pr·E)/(k + E)`. With E = 0, b = pr exactly.
   - Two exact cross-checks (§10 step 7): at ρ = 1, E = `ex_t` and N/E = `std_t`; at ρ = `gRecDecay`, N/E = `rec_t`.
2. **(k, ρ).**
   - `k = kMultW × median(e)`, with the median over training rows with e > 0.
   - Minimise Σ e·(r − b)² over training rows with e > 0 and finite r: `kMultW` in the outer loop, `rhos` in the inner loop, first minimum on ties.
3. **Context.**
   - Fit `Cohort(X_ctx, r − b, e, α)` on the same rows; then q = b + `predict`. `X_ctx` = the `ctxGroups` columns, then the `ctxCols`.
   - With ≥ 2 training seasons, α ∈ `ctxAlphas`, including `"off"` (§17), is chosen by leave-one-season-out (Σ weighted SSE, first minimum), with b from the full-training (k, ρ).
   - With fewer training seasons, α = `ctxDefaultAlpha` = `"off"` (§17).
4. **Recorded** per (P, t): k; k in games (k ÷ median(e) for `po`, k for `pg`); ρ; α; median(e).

### 6.3 G (`lp/weekly_g.py`)
- Model: `HistGradientBoostingRegressor(loss="squared_error", early_stopping=False, random_state=spec["seed"], **spec["gPoint"])`.
- Data: the `gGroups` columns in spec order; target r − pr, weight e, on rows with e > 0 and finite r.
- Prediction: q = pr + `predict`. A target with no training row is a §12 stop.

### 6.4 P(plays) and horizon (`lp/pplays.py`)
- **P(plays) models.** One per family, on every training row (byes have no row). Target: `played`. Features: `pplaysCols`.
  - H: `LogisticRegression(C, max_iter)` taken from `spec["pplays"]`, on `baselines._prep` (training medians plus missing indicators) followed by `StandardScaler`.
  - G: `HistGradientBoostingClassifier(early_stopping=False, random_state=seed, **gPoint)`.
- **Horizon** (flag 11).
  - Origin rows have w = n + 1, n ∈ `rosOrigins`.
  - For each of his later rows in the season, h = 1 + the number of his rows with n + 1 < w′ ≤ that row's week. h counts **his rows**, so a bye or an out-of-universe week adds nothing.
  - `p_h = pr_gamesShare + (p − pr_gamesShare) × φ^(h−1)`.
  - φ ∈ `phis` minimises the Brier score of `p_h` against `played` over pairs with h ≥ 2, where p is the origin row's `p_oof`; ties take the first minimum.
  - φ is used only by 2b-1c.

### 6.5 Cross-fitting and calibration (`weekly_models`)
- **Groups.** `xfit_groups(pids, K)`: sorted unique training pids, index mod K, K = `crossFolds`.
- **Out-of-fold values.** Each group's `ppg_oof` and `p_oof` come from §6.2–§6.4 fitted on the other groups by the same procedure (H refits k, ρ and α).
- **Final models.** Fitted on all training rows.
- **Fallback prior.** It reads only earlier seasons, so it is out-of-fold for every group.
- **`c_w[P]`.** The median of `pts / ppg_oof` over P's relevant, played training rows with both values > 0. It is 1 when there are fewer than `calibMinRows` such rows.
- **`train_relevant(wf, T)`.** A **copy** of `weekly_forecasts`' internal training frame: 2014 ≤ S < T, played-row `pos_mean`, `add_std`, `mark_relevant`. It returns `pid, S, w, relevant`.

### 6.6 Fold driver
`fold_w(frame, T, store, name, spec, rel, hist=None, train=None, pred=None, variant=None, confirm=False, env=None, env_w=None)` → `(preds, fits)`.
1. `weekly_data.guard(T, confirm)` (flag 2).
2. For T ≥ `registry.EVAL_START`: `registry.require(name, T, "season", env)` and `(…, "weekly", env_w)`, both through the module. `env_w=None` means `registry_w.weekly_env()`.
3. Assert max S ≤ `LAST_SEASON` over the selected rows.
4. Select rows with the boolean masks `train` and `pred`. The defaults are 2018 ≤ S < T and S = T; `--smoke` passes within-season masks (flag 7). An empty training set raises.
5. `fit_w(frame_tr, rel_tr, hist, store, spec, variant)` → `Fits`.
6. `predict_w(fits, frame_pr, hist, store, origin=None)` → `pid, S, w, position, T, cand, cond, ppg, p, uncond, c_w, noPrior`.
   - `origin` is a per-row n (default w − 1); H reads only the `hist` weeks ≤ n.
   - A non-finite `cond` or `p` raises.

### 6.7 The two hooks LP-2b-1c depends on
- **Fits persistence.**
  - `Fits` is a plain picklable class. Per position it holds the columns, clip bounds, per-target models (H's k, ρ, α, median(e), `Cohort`; G's regressor), the P(plays) model and its scaler, `c_w`, φ, `variant` and `specSha256`.
  - `predict_w` reads only `Fits`, the frame, `hist` and `store`.
  - The runner pickles `{(cand, T): Fits}` (protocol 4) to `.cache/models/weekly-fits.pkl`, which is read back only after a SHA check, and records the SHA in the artifact.
- **Variant switch.** `variant` is `None` (registered; `REGISTERED = {}`) or a dict with any of:
  - `dropGroups`: remove these groups from the H context, the G features and the P(plays) design;
  - `addCols`: append these frame columns to all three;
  - `hContext: False` — q = b;
  - `gPrior: False` — G target r, no `prior` columns, q = `predict`;
  - `fixedCalib: {"c_w": {P: x}, "phi": {P: x}}` — no cross-fitting; use these values.
  
  An unknown key raises; `None` and `{}` take one path. For future-week rows, 2b-1c supplies the frame and `origin`; `predict_w` never reads outcome columns.

## 7. Weekly spec (`spec_wm.default_spec_w(name)`)

```
name, family ("H"/"G"), trainFrom 2018 (== spec_w.TRAIN_FROM, asserted), lastSeason 2024 (asserted == LAST_SEASON in `default_spec_w` and `register_weekly` only), seed 0,
kMultW [0.5,1,2,3,4,6,8,12,16,24,32], rhos [0.6,0.75,0.85,0.92,1.0],
ctxGroups ["usage","avail","absence","opp","team","game","gl","bio"], ctxCols ["nP","wk","noPrior"], ctxAlphas [1,10,100,1000,"off"], ctxDefaultAlpha "off" (§17),
gGroups ["form","usage","avail","absence","opp","team","game","gl","bio","prior"],
gPoint {learning_rate 0.05, max_iter 300, max_leaf_nodes 8, min_samples_leaf 100, l2_regularization 1.0},
pplaysCols = spec_w.AVAIL + ["pr_gamesShare","noPrior","nP","wk","age","exp"], pplays {"C": 1.0, "max_iter": 1000},
phis [0,0.25,0.5,0.7,0.85,0.95,1.0], rosOrigins [0,4,8,12], crossFolds 4, calibMinRows 30
```

- **Per-family nulls.** In H's spec, `gGroups` and `gPoint` are null. In G's spec, `kMultW`, `rhos`, `ctx*` and `pplays` are null; G keeps `gPoint` because its P(plays) model uses it.
- **Spec source.** Code reads it from the candidate file only: the Commit 1 spec in `--smoke`, the stamped spec in `--dev`.

## 8. Registration (`lp/registry_w.py`)

**Hashed paths.**
- `WEEKLY_CODE(name)` = `registry.season_code(name)` + `lp/` {`spec_w`, `weekly_data`, `season_prior`, `era_w`, `weekly_h` (H) | `weekly_g` (G), `pplays`, `weekly_models`}`.py`.
- `WEEKLY_HARNESS` = `lp/` {`evaluate_w`, `report_s2b`, `registry_w`, `registry`, `report`, `score`, `metrics`, `bootstrap`}`.py` + `run_weekly_models.py`.

**Data and environment.**
- `weekly_data_hashes(benchw=…, benchw_meta=…, inputs=…, prior=…)` = `registry.default_data()` plus the four file hashes (`benchwSha256`, `benchwMetaSha256`, `weeklyInputsSha256`, `seasonPriorSha256`). The paths default to the real files, and a regenerated cache fails `require`. The name avoids clashing with `weekly_data` (flag 8).
- `weekly_env(task_file=<this file>, data_fn=None, **kw)` = `registry.Env(task_file, data_fn or weekly_data_hashes, **kw)`. Season checks use `registry.Env()`.

**`head_layer(env, name, layer)`** is its own HEAD reader (flag 8): it returns `layers.<layer>` from `git show HEAD:./<rel>`, and raises `NotRegistered` if that layer is missing.

**`init_weekly(env)`** (`--init-weekly`).
- Refuses if a `layers.weekly` exists.
- Otherwise writes `{"spec": default_spec_w(name), other STAMP_KEYS: null, "taskFileSha256": null, "reregistrations": []}` via `registry.write`.
- If a season section then differs from its header hash, it restores both files and raises.

**`register_weekly(env_s, env_w)`** (`--register-weekly`; atomic, flag 6).
1. Checks both candidates before any write:
   - `require(name, 2024, "season", env_s)`;
   - the weekly layer exists and is unstamped;
   - its spec equals `head_layer(…)["spec"]` and `default_spec_w(name)`;
   - there is no `weekly-dev` run-log entry;
   - the candidate file and every hashed path are `tracked_clean`.
2. Then runs `registry.append_layer(name, "weekly", spec, WEEKLY_CODE(name), WEEKLY_HARNESS, env_w)` for H, then G.
3. A raise, or a changed season section, restores both files and re-raises.

There is no re-registration path (flag 18).

## 9. Labels (`lp/evaluate_w.py`) — LP-1a §8, `lp/metrics.py` unchanged

**Call.** `labels(wk, folds, B=bs.B_DEFAULT)`. `wk` = the concatenated `weekly_forecasts` test frames, merged on (pid, S, w) with `h`, `g` (cond) and `h_p`, `g_p`. Rows outside `folds` are dropped first. A null `h` or `g` raises.

**Per candidate c and position P:**
- **Resampling.** `rs = bs.Resampler(<P's remaining pids>, B)`, seed `bs.SEED`. f = the index of T in `folds`; nf = `len(folds)`; groups = the sorted (T, w).
- **Rows.** STD: relevant ∧ played. B1c: the same rows with `b1cw` non-null (B1-covered and outcome-conditioned, printed so).
- **Arithmetic.**
  - `d = M.diff_pooled(|c − pts|, |bench − pts|, f, nf, rs, pi)`;
  - `bm`, `cm` from `M.mae_pooled`;
  - `rank = bs.ci95(M.spearman_weekly(c,…)["boot"] − M.spearman_weekly(bench,…)["boot"])`;
  - `label = M.label(d["value"], d["ci"], bm["value"], rank)`.
  
  Recorded: n, cm, bm, d, pct = −d/bm, rank and the label.

**Labelled and report-only positions.**
- RB and WR are **labelled**. Each passes when it `beats` both STD and B1c.
- QB and TE get the same numbers, marked **report-only (Anton, 2026-11-16)**.
- `M.gate` over all four positions prints as "overall weekly gate (3 of 4): <result> — expected to fail by construction; not the product decision".
- Every label reads "**unconfirmed** — the 2025 fold is held".

## 10. Runner (`run_weekly_models.py`)

- **Thread pin** (copied, §15), before any numpy import:
  - `THREAD_VARS` = "1";
  - `_SKLEARN_PRELOADED` and `_NUMPY_PRELOADED` are recorded;
  - under `__main__`, `_ensure_hash_seed(execv)` re-executes with `PYTHONHASHSEED=0`.
  
  The pin state is recorded in the artifact and in every run-log entry.
- **`Deps`** (all fields patchable):
  - `task_file` = `LP1A_TASK_FILE` (step 1 only), `anchor`;
  - `load_meta`, `load_cache`, `load_teamctx`, `load_extras`, `load_benchw`;
  - `inputs_path`, `inputs_sha`, `prior_path`, `prior_sha`;
  - `env`, `env_w`;
  - `cache_dir`, `out_dir`, `verdict_dir`, `runlog`.

**Steps (every mode, in this order):**
1. **Prereg hash.** `report.prereg_hash(<LP-1a text>)[0] == report.PREREG_HASH`, before any load. Otherwise return 2.
2. **Anchor checks, before any registry access (flag 4).** Return 2 unless all hold:
   - `load_meta()["generatedAt"] == anchor`;
   - the benchw meta `panelGeneratedAt == anchor`, with `c2`, `c3` and `c6` passing;
   - both cache SHAs match.
3. **Mode.**
   - `--init-weekly` and `--register-weekly` run §8 and return.
   - `--dev`:
     - return 2 without `--write`;
     - `require` season and weekly for both candidates and every T in `DEV_FOLDS`, and return 2 on any failure;
     - return 2 if a `weekly-dev` entry already exists (a second `--dev` is a stop for Anton: G is not reproducible run to run);
     - `folds = [T for T in DEV_FOLDS if T <= weekly_data.LAST_SEASON]`;
     - use the stamped specs;
     - the run-log entry is written at step 8.
   - `--smoke` reads the working-copy specs, unlocked.
4. **Load and trim.** Load via `from_panel_full`; `trim`, `assert_trimmed`, drop the untrimmed references; `score.parity` on the trimmed tables.
5. **Build.** Read both caches, then build:
   - `store = season_models.Store(T_trim, keys, weights, <H season spec>)`;
   - `hist = weekly_h.history(T_trim, store, weekly_data.seasons())`;
   - `wf = baselines.build_weekly_frame(T_trim, seasons=range(FIRST_TRAIN_SEASON, LAST_SEASON + 1))`.
6. **Trim benchw.** `benchw = weekly_data.trim_frame(load_benchw()[0])`, then `assert_trimmed(T_trim, frames=[benchw, H, G, wf, hist])`.
7. **Runtime checks.** Return 2 on any miss. Tolerance 1e-9 × (1 + |x|); NaN equals NaN.
   - (a) Unclipped `chain.season_points` on q = `pr` gives F2's `ppg` on every w = 1, `noPrior` = 0 row.
   - (b) The §6.2 cross-checks hold on every pkl row and target.
8. **Fit.**
   - `--smoke`: T = 2018. Train on w ≤ 9 and predict w ≥ 10; `rel` comes from `weekly_forecasts(wf, 2018, None, benchw)`.
   - `--dev`: append `{mode: "weekly-dev", at, folds, date, threads}` first, then for each T: `wk_T = weekly_forecasts(wf, T, None, benchw)`, `rel = train_relevant(wf, T)`, and `fold_w` for H and G.
   - Seconds are recorded per fold.
9. **Labels.** `evaluate_w.labels(wk, folds, B)`, with `--resamples` default 2,000. Under `--smoke`: `folds = (2018,)`, w ≥ 10.
10. **Outputs.**
    - `--dev` writes `weekly-preds.jsonl` (sorted keys, non-finite → null) and `weekly-fits.pkl`, plus the artifact and the verdict with `--write`.
    - `--smoke` only prints.

## 11. Artifact and verdict

**Artifact:** `backtests/<date>-learned-s2b1b-dev-panel.json`, at most 5 MB. It is unregistered (the Invariant 3 exception) and carries **no commit id** (LP-2a flag 9). It holds:
- slice, date, `preregHash`, folds;
- the §9 results;
- per candidate, T and P: k, k in games, ρ, α, `c_w`, φ, and the row and `noPrior` counts;
- H's inherited α share, from the 2b-1a artifact;
- check maxima, seconds, threads, versions, limits;
- `sha256` of the 2b-1a and 2a files, both new caches and both candidate files;
- per candidate and layer: `specSha256`, a combined SHA-256 over the sorted `path:hash` lines of `code`, the same for `harness`, and `data`.

**Verdict:** `grading/<date>-learned-s2b1b-dev-verdict.md`. In order:
1. The progression rule, verbatim from 2b-1a §3.1 item 1, with its date (2026-11-16, before any weekly or 2025 result).
2. Per labelled position and candidate, one plain paragraph against STD and against B1c: points per week, percent, CI, label. QB and TE get the same paragraph, headed "report-only".
3. The label table and the gate line.
4. The fit facts.
5. Hashes only.
6. Times, versions, threads.
7. LP-1a §8 verbatim, with `preregHash`.
8. **Limits:**
   - 2025 is held, so no label is final;
   - training starts in 2018, so fold 2019 has one season;
   - G is reproducible only approximately, even when fully pinned (one of four 2b-1a runs was off by up to 4.84%); H is exact;
   - B1c rows are outcome-conditioned (the s1b limits);
   - H's α is inherited at the grid top;
   - F4's weeks count as evidence but are never scored;
   - positions are static;
   - no feature is asserted to equal an app factor;
   - after registration, `require(·, 2025)` no longer holds 2025 — `weekly_data.guard` and LP-2b-2's marker do (flag 17);
   - the tables come in 2b-1c.

**LP-2b-1b passes** when:
- the verdict exists;
- every §14 test is green and was shown red;
- both weekly layers were stamped before the `weekly-dev` entry;
- the labels come from an unchanged `metrics.py` under the same `preregHash`;
- the season sections match the header;
- no 2025 row reached a fit, frame or metric.

## 12. Stops (report to Session 1, never improvise)

- **Scope.** A need to touch §1 **Out**, or to change an imported function's return.
- **For Anton:**
  - a cache SHA off its anchor, or a needed regeneration;
  - after Commit 2, any change to weekly code, harness, data or spec, or a code defect found after `--dev` (fixes then touch only tests, docs, verdict);
  - a second `--dev`.
- **Checks:** a §10 step 7 miss.
- **Results:**
  - in `--smoke`, a candidate's MAE above STD's at ≥ 3 positions (report it; do not tune);
  - a gain of more than 12% over STD or B1c anywhere — a suspected leak (run T-B-9 on real data and report).
- **Budgets.** Over 60 min per (candidate, fold), 6 h for `--dev`, 5 MB for the artifact or 2 GB for the fits.
- **Other.** A target with no training row; a non-finite `cond`/`p`; any open design question.

## 13. Done-definition

1. **Commit 1** — code, tests, both candidate files, this file. Before committing:
   - run `--init-weekly`; the season sections stay unchanged;
   - `python3 -m unittest discover -s research/learned-projection/tests -t research/learned-projection` is green, including the 2a and 2b-1a suites;
   - every §14 test has been shown red and restored;
   - `--smoke` is clean.
2. **Commit 2** — `--register-weekly`; commit only the two candidate files, by name.
3. **Commit 3** — `--dev --write`; `npm test` and `npm run smoke` green. Docs:
   - the research README;
   - the repo README's Module notes LP row;
   - `data-catalog.md` Non-served artifacts: both outputs and both git-ignored caches;
   - the `CLAUDE.md` LP row: this file and the new modules (keep CLAUDE.md under 25,000 bytes).
   
   No served-folder or `manifest.json` change.
4. No push, no rebase (§3.1 item 3).

**Hand-back:**
- the three SHAs, files and deviations;
- `preregHash` and the section hashes, both unchanged;
- the run-log tail, labels, fit facts, check maxima, run times and new cache SHAs;
- per test: the assertion, the defect, the Fact and the red step.

## 14. Tests (each shown red once, then restored)

Fixtures:
- **Model tests:** `tests/synth_wmodels.py` builds the pkl schema from a stated DGP, plus `hist`.
- **Runner/registry tests:** `make_weekly_panel`, caches from one 2b-1a run, `test_registry.Repo`.

Any test that reaches `fold_w` patches `registry.require`. Every test asserts its Fact in `setUp`.

### T-B-1 · n = 0 identity
- **Asserts.** Fixture: a hand-built RB row with `rush_yd` (`po`), `bonus_fd_rb` (two denominators), a direct `pg` key and a minor dict.
  - `compose(q = pr)` ppg equals `chain.season_points` ppg.
  - A fitted q with a binding clip differs from it.
- **Fails if:** a minor term or a denominator is dropped.
- **Red:** omit the minor constants.
- **Fact:** a minor key has a non-zero weight.

### T-B-2 · H evidence
- **Asserts.** Fixture: raw played rows passed through `history` — e = 1, 3, 2, one row with exp = 0 and num ≠ 0, and one `pg` row with NaN num; ρ = 0.5, k = 2.
  - E, N and b equal hand values.
  - E = 0 gives b = pr.
  - At ρ = 1, E = `ex_t` and N/E = `std_t`; at ρ = 0.7, N/E = `rec_t` (same rows through `inputs_at`'s rule).
- **Fails if:** the decay is off by one, the zero-denominator numerator is dropped, or the NaN week counts.
- **Red:** drop rows with exp = 0.
- **Fact:** that week's num ≠ 0.

### T-B-3 · H fit picks the weighted argmin; α rule
- **Asserts.** Fixture: a `po` DGP with exposures 1–20 and noise ∝ 1/e, plus deviations heavier for high-e players.
  - The chosen (k, ρ) equals the argmin of an in-test weighted SSE over the grid.
  - One training season gives α = `"off"` (§17, T-B-17).
  - With two seasons, α is the argmin of the recorded leave-one-season-out SSEs.
- **Fails if:** the SSE is unweighted, or α ignores the season count.
- **Red:** unweighted SSE.
- **Fact:** the in-test unweighted argmin differs from the weighted one.

### T-B-4 · History includes played non-universe weeks
- **Asserts.** Fixture: a copy of `make_weekly_panel` with one earlier played row of a universe pid set to `inUniverse` False.
  - Through the §6.2 cross-checks, `history` reproduces `inputs_at`'s `ex_t`, `std_t` and `rec_t` on every row.
  - Scrambling weeks ≥ w leaves E and N unchanged.
- **Fails if:** non-universe rows are dropped, or week ≥ w is read.
- **Red:** universe rows only.
- **Fact:** that pid-season has a universe row at a later w, and the flipped row has exp > 0.

### T-B-5 · G and P(plays) read the spec
- **Asserts**, with both estimators wrapped by `mock.Mock(wraps=…)`:
  - each estimator is built with `random_state == spec["seed"]`, `early_stopping is False` and the `gPoint` values;
  - the regressor's loss is `squared_error`;
  - the fit target is r − pr (r under `gPrior: False`);
  - the logistic model gets the spec's `C` and `max_iter`.
- **Fails if** a seed or parameter is not read from the spec, or the residual is wrong.
- **Red:** drop `random_state`.
- **Fact:** the test seed is 7, not `None`.

### T-B-6 · P(plays) determinism; horizon across byes
- **Asserts:**
  - two fits in one process give identical p, for both families;
  - a DGP with φ = 0.7 recovers φ within one grid step;
  - an origin at n + 1, a bye at n + 2 and a row at n + 3 give h = 2;
  - the pairs used to fit φ exclude h = 1.
- **Fails if** h counts calendar weeks.
- **Red:** h = w − n.
- **Fact:** at n + 2 the team has no game and the pid has no row.

### T-B-7 · Cross-fitting and calibration
- **Asserts:**
  - groups are disjoint, cover every pid, and survive a row shuffle;
  - `c_w` equals a hand median of `pts / ppg_oof`;
  - fewer than `calibMinRows` rows gives 1;
  - the final models' row count equals the training count.
- **Fails if:** calibration sees in-sample predictions, or groups depend on row order.
- **Red:** `c_w` from in-sample ppg.
- **Fact:** the medians of `pts/ppg_in-sample` and `pts/ppg_oof` differ by more than 1e-6 at some position.

### T-B-8 · Relevant-flag copy (original: `baselines.weekly_forecasts`)
- **Asserts.** Fixture: synthetic `wf`/`benchw`, with `baselines.RELEVANT_K` patched to 2 for both calls. The median of `pts / b1w` over `train_relevant(wf, T)`'s relevant, played, covered rows (both > 0) equals `weekly_forecasts(…)["c_weekly"]` exactly, per position.
- **Fails if** the copy drifts. **Red:** `pos_mean` over all rows.
- **Fact:** that `pos_mean` changes the per-position median over the copy's relevant rows.

### T-B-9 · Fold isolation
- **Asserts:**
  - Randomising every season-T outcome column (`r_*`, `e_*`, `played`, `pts`) and season-T `hist` row leaves unchanged: k, ρ, α, tree outputs on a probe matrix, P(plays), `c_w`, φ and the clip bounds.
  - Randomising weeks ≥ w0 leaves the (T, w0) predictions unchanged.
  - With `origin` = n, randomising `hist` weeks > n leaves a later row's prediction unchanged.
- **Fails if** anything looks ahead. **Red:** clip bounds over train ∪ predict; separately, ignore `origin`.
- **Fact:** the randomised season-T r exceeds the training maximum for some target, and `hist` holds rows between n and w.

### T-B-10 · Held season
- **Asserts:**
  - `fold_w(…, LAST_SEASON + 1)` raises `ConfirmationHeld`.
  - A row with S > `LAST_SEASON` raises.
  - `spec["lastSeason"] == LAST_SEASON == CONFIRM_FOLD − 1`.
  - The `--dev` folds equal `DEV_FOLDS` today.
  - With `LAST_SEASON` patched to L = 2021 (the panel's last season) and the temp spec's `lastSeason` set to L, `--dev --write` returns 0 when benchw holds 2022. The test records the S of every frame argument, including the `benchw` passed to `weekly_forecasts`, `fit_w` and `labels`; none is above L.
- **Fails if** a held row reaches a fit or metric. **Red:** skip `trim_frame` and drop benchw from step 6's frames.
- **Fact:** benchw has S = L + 1 rows.

### T-B-11 · Hook 1, fits persistence
- **Asserts**, for H and G:
  - `predict_w` gives identical output after a pickle round trip;
  - `weekly-fits.pkl` reloads to the same predictions;
  - the artifact's `sha256["weekly-fits.pkl"]` is the SHA of the file.
- **Fails if** state is lost or the SHA is wrong. **Red:** `Fits.__getstate__` drops the clip bounds.
- **Fact:** at least one raw prediction lies outside its bounds.

### T-B-12 · Hook 2, variant switch
- **Asserts:**
  - `None` and `{}` give identical `Fits` and predictions;
  - `fixedCalib` set to the registered `c_w` and φ gives identical cond, p and uncond, with zero cross-fit calls;
  - `dropGroups: ["absence"]` removes exactly those columns from every recorded design, and `addCols` appends;
  - `hContext: False` gives q = clip(b);
  - `gPrior: False` leaves no `prior` columns;
  - an unknown key raises.
- **Fails if** the default path differs, or a variant does more than it names.
- **Red:** `fixedCalib` uses 1.
- **Fact:** the registered `c_w` differs from 1 by more than 1e-3 at some position.

### T-B-13 · Weekly registration (temp git repo)
- **Setup.**
  - `Repo`, with stubs for every `WEEKLY_CODE`/`WEEKLY_HARNESS` path.
  - `registry.default_data` is patched.
  - `weekly_data_hashes` points at temp copies, each made stale by appending one byte.
- **Asserts.**
  - `require(…, "weekly")` raises on:
    - the `init_weekly` layer;
    - a stale benchw hash or a stale `weeklyInputsSha256`;
    - a changed code or harness file;
    - a stale `specSha256`.
  - It passes when the repo is clean.
  - `init_weekly` refuses an existing key.
  - `--register-weekly`:
    - with the anchor mismatched, returns 2 and leaves both files byte-identical;
    - refuses a stamped layer, a spec differing from HEAD, and a `weekly-dev` entry;
    - with `append_layer` raising on G, leaves H unchanged.
  - After a register and a commit in the temp repo:
    - the sections are canonical;
    - the season `require` passes;
    - `require(·, 2025)` does not raise `ConfirmationHeld` (flag 17), but `fold_w(…, 2025)` does.
  - `--dev`:
    - returns 2 when unregistered, with no run-log entry;
    - returns 2 on a second run;
    - when a step-7 check fails, writes no `weekly-dev` entry.
- **Fails if:** a test-fold fit can start unregistered, a section is rewritten, or a failed check uses up `--dev`.
- **Red:** run the anchor check after `register_weekly`.
- **Fact:** the test anchor differs from the meta, and with a matching anchor `--register-weekly` changes both files.

### T-B-14 · Label wiring (hand-built `wk`)
- **Asserts:**
  - STD rows are relevant ∧ played, and B1c rows also need `b1cw`;
  - a null candidate value raises;
  - the label equals `metrics.label` on hand-computed `diff_pooled`, `mae_pooled` and `spearman_weekly` over (T, w);
  - QB and TE print "report-only", RB and WR are labelled;
  - the gate line prints;
  - `folds = (2018,)` runs.
- **Fails if** QB or TE gain labels, uncovered rows are scored, or a season outside `folds` is pooled.
- **Red:** pool over `TEST_SEASONS`.
- **Fact:** `folds` = (2019, 2020), and the 2021 rows have errors of at least 10.

### T-B-15 · Pins, prereg, verdict
- **Asserts:**
  - a subprocess import sees all four thread variables set to "1", with numpy not preloaded, and every `threadpool_info()` entry with `num_threads == 1`;
  - `THREAD_VARS` equals the original's (`run_weekly_inputs.py`). Given a fake execv and no seed, both `_ensure_hash_seed` re-execute once with seed 0 and the same argv and env;
  - `main` returns 2 on an LP-1a copy with one §8 character changed, with `load_cache` and `load_meta` raising; `taskFileSha256` is this file's;
  - the verdict holds the combined hashes and the rule with its date, and no `git rev-parse --short HEAD` or last-commit id.
- **Fails if** a pin or the prereg check runs late, or a commit id is printed.
- **Red:** move the pin below `import numpy`.
- **Fact:** the subprocess starts unpinned.

### T-B-16 · Caches by SHA
- **Asserts:**
  - every mode returns 2 on a one-byte-changed cache, before `pd.read_pickle` and before any fit (both patched to raise);
  - `INPUTS_SHA` and `PRIOR_SHA` equal the 2b-1a artifact's entries;
  - a source scan finds no new module that writes a path named `weekly-inputs.pkl` or `season-prior.jsonl`.
- **Fails if** a cache is used unverified, or regenerated.
- **Red:** check the SHA after loading.
- **Fact:** the copy's SHA differs.

## 15. Copied definitions

| Copy | Original | Test |
|---|---|---|
| `weekly_models.train_relevant` | `lp/baselines.py` `weekly_forecasts`, internal training frame | T-B-8 |
| `run_weekly_models` `THREAD_VARS`, pin loop, `_ensure_hash_seed` | `run_weekly_inputs.py` | T-B-15 |
| `weekly_h.history` + §6.2 evidence sums | `lp/weekly_data.py` `inputs_at` form block | T-B-4, step 7(b) |

There is no cross-repo copy, and everything else is imported.

## 16. Later (outlines only)

**LP-2b-1c — report-only weekly analyses.**

Its own task file, runner and unhashed modules, planned after this slice is signed off.
- It reads both new caches and the 2b-1a caches by SHA.
- It changes no registered code: it calls `predict_w`, and calls `fold_w` through `variant`.

**Scope:**
- RIDGE, B2, raw B1 and B4 (B4 trimmed and asserted); H − G;
- per-fold MAE, d and drift;
- unconditional MAE, and P(plays) Brier and log-loss vs persistence, via `report.expected_points` and `report.P_CLIP` (flag 5);
- cohorts by aliasing `report.cohort_eval` on trimmed `weeks`, with all four outputs asserted (flags 3, 14);
- H's override speeds beside `K_ROS_*`;
- ROS sums from a new unregistered future-week builder through `predict_w(…, origin=n)` (flag 11), and the n = 0 week-sum identity vs LP-2a `total`;
- arms via `variant`, on all six folds: `no-absence`, `no-opp`, `no-era-blend` (rebuilt prior frame), `c_w = 1`, `oracle-status`, H `no-context`, G `no-prior`.

**Arms reuse the registered calibration** (`fixedCalib`, no cross-fitting; Anton 2026-11-18, settles flag 15).

**The rest-of-season forecast is exploratory here; replacing the app's ROS later needs its own registered, tested run** (Anton 2026-11-18).

Same pin rule. **Depends on:** this slice verified and its caches unchanged.

**LP-2b-2** (the 2025 confirmation): as outlined in 2b-1a §19, with the same pin rule.

## 17. Revision 3: H context "off" option (Anton, 2026-11-18, before registration)

### 17.1 Ruling (verbatim)

> 1. Don’t register yet. One spec revision first (Anton, 2026-11-18): add an “off” option (context adjustment zero, i.e. α = ∞) to H’s ctxAlphas, chosen by the same leave-one-season-out rule; and set the fewer-than-2-training-seasons default (ctxDefaultAlpha) to “off” instead of 100, because with one training season the adjustment cannot be validated (this affects the 2019 fold and --smoke). Record the reason: decided before any dev-fold result, prompted by the smoke diagnostic; no value is fitted to 2018. Update the task file, specs and tests (one test: with one training season H’s prediction equals the season prior plus no context term; red: default back to 100; fixture fact: training set spans exactly one season). Light plan review, then Session 2 applies it, re-runs --smoke for the record (no stop on its numbers), and proceeds to Commit 2 (registration) and Commit 3 (--dev).

**Reason, recorded as ruled:**
- The change was decided before any development-fold result.
- It was prompted by the Session 2 smoke diagnostic: H's context term made H worse than STD at every position on the one-season 2018 split, and no single input group or the week inputs explained it.
- No value is fitted to 2018. `"off"` is a candidate on the same grid, chosen by the same rule.

### 17.2 Change

**Spec** (`spec_wm.default_spec_w("H")`):
- `ctxAlphas` = `[1, 10, 100, 1000, "off"]`. `"off"` is last, so a tie keeps the finite α under the first-minimum rule.
- `ctxDefaultAlpha` = `"off"`.
- G's spec is unchanged: these keys are null there.

**`"off"` means α = ∞:**
- No `Cohort` is fitted, and q = clip(b).
- In leave-one-season-out, its held-out SSE is Σ e·(r − b)² with the same b as the finite αs.
- `Fits`, the artifact and the verdict record α as the string `"off"`, never a float. That replaces `float(alpha)` in `weekly_h` and the `%g` formatting in `report_s2b`.

**Where `"off"` applies:**
- Every fold with fewer than 2 training seasons, which is fold 2019 and `--smoke`.
- Any fold where leave-one-season-out picks it.
- Also inside the cross-fit refits (§6.5).

`variant` `hContext: False` stays as it is.

**Candidate files:**
- The Commit 1 weekly spec is stale.
- Restore both files to their pre-Commit-1 bytes (`git show 6186371:research/learned-projection/candidates/<name>.json`), then re-run `--init-weekly`.
- Both canonical season sections must still equal the header hashes. `register_weekly` then sees the new spec in the working file, at HEAD after the commit, and in `default_spec_w`.

**Verdict:**
- The verdict adds this ruling and its reason after the §3.2 rule.
- A stated limit: in folds with one training season (2019) H carries no context term by construction.
- The §11 limit and `report_s2b.py`'s string read "H's season-layer α is inherited at its grid top; the weekly context α is chosen by leave-one-season-out over a grid that includes 'off'".
- The fit-facts table renders α = None (`hContext: False`) as "—" and `"off"` as "off".

### 17.3 Tests

**T-B-17 · One training season, no context term.**
- **Asserts:**
  - On a fixture whose training rows span exactly one season, with `default_spec_w("H")` unshrunk in `ctxAlphas`/`ctxDefaultAlpha`, H's prediction equals clip(b) exactly on every row and target. Here b is the season prior plus the credibility deviation; with E = 0, b = pr.
  - The recorded α is `"off"` and no `Cohort` is constructed (patched counter).
  - `default_spec_w("H")["ctxDefaultAlpha"] == "off"`.
- **Fails if:** a one-season fold fits a context ridge.
- **Red:** set the default back to 100.
- **Fact:** the training set's unique S has length 1, and at that row set a 100-α Cohort's prediction differs from 0 by more than 1e-6 on at least one row.

**Also:**
- T-B-3 asserts that `"off"` competes in leave-one-season-out. On a two-season fixture where the context columns are pure noise, `"off"` is chosen, and the recorded `alphaSse` holds five entries.
- T-B-11 round-trips a `Fits` whose α is `"off"`.
- T-B-3's in-test recompute loop gets an `"off"` branch, so it builds no `Cohort` there and takes the held-out SSE as Σ e·(r − b)².
- T-B-9's `_probe_state` records the ridge output only when `cohort is not None`, and the string `"off"` otherwise.
- The fixture's facts are unchanged.

### 17.4 Order for Session 2

1. Apply §17.2–§17.3 as new commits on top of `214ed3c`. Session 1 edits nothing but this file.
2. Run the full suite green, with T-B-17's red shown.
3. Re-run `--smoke` for the record. **§12's smoke stop does not apply to its numbers** (Anton).
4. Make **Commit 1b**: code, tests, both candidate files and this task file, staged by name.
5. Then Commit 2 (`--register-weekly`) and Commit 3 (`--dev --write`), exactly as in §13.
6. The hand-back adds the new smoke table and α as chosen per fold and position.

Every other §12 stop still applies.

## Fix pass 1

From the full implementation review of `6186371..1dd0cd4` (2026-11-18), triaged by Session 1. Applier: the fix-applier subagent.

**Scope.** Test files only: `research/learned-projection/tests/test_weekly_models.py`, `tests/test_weekly_registry.py`, and the fixtures `tests/synth_wmodels.py` and `tests/e2e_w.py` where a setUp needs them. Do not touch any registered path: no `WEEKLY_CODE` or `WEEKLY_HARNESS` file, `candidates/`, artifact, verdict, cache, run-log, served folder or `manifest.json`. Do not run `--dev`, `--register-weekly` or `--init-weekly`. Stop and report if an item needs more than it names.

1. **Facts in setUp** (review flag 3). Move each Fact assertion into `setUp`/`setUpClass` (or a helper called from there) for:
   - T-B-7: `test_fact_in_sample_and_oof_medians_differ` stops being a separate test method; its check runs in setUp;
   - T-B-8, T-B-10 (runner), T-B-11, T-B-13 and T-B-15.
   
   The assertions themselves do not change.
2. **T-B-13 Fact** (flag 4). Replace `assertNotEqual("OTHER", "ANCHOR")` with a setUp check on the actual deps: `d = self._deps("OTHER"); self.assertNotEqual(d.load_meta()["generatedAt"], d.anchor)`, adapted to the test's helper names.
3. **T-B-17** (flag 5). Replace the no-op `self.assertTrue(len(w1))` with a real check: on the `w1` rows (E = 0), each target's q equals `np.clip(pr_t, *bounds_t)` exactly. Keep `w1` non-empty as part of the Fact.
4. **T-B-1** (flag 6). Add one assertion through the predict path: for a row whose raw q lies outside its clip bounds, `predict_w`'s `ppg` equals `compose` of the clipped q. Fact: that row's raw q is outside its bounds, asserted in setUp.
5. **Red steps.**
   - Re-show the red for each test whose assertions moved or changed: T-B-1, T-B-13 and T-B-17, using the reds in §14/§17.3. Restore each afterwards.
   - For the tests in item 1, a green run is enough, because only the location of each Fact changed.
6. **Checks and commit.**
   - Run the full Python suite, `npm test` and `npm run smoke`; all must be green.
   - Make one commit, `LP-2b-1b: fix pass 1 (tests)`, staging only the touched test files by name.
   - No push, no rebase.

**Accepted by Session 1, not fixed.** Each would need a registered-code change, which is not allowed after Commit 2 (§3.2). Both are recorded in Verification.
- **Flag 1.** `lp/evaluate_w.py:9` and `lp/report_s2b.py:3-4` use `from … import <name>` for constants and helpers, against §4's rule. This has no effect today: no test patches those names.
- **Flag 2.** The artifact's `sha256` omits `season-preds.jsonl`. Session 1 re-hashed the file on disk; it still equals the anchor `b2fafc88…68a46a2`.

**Hand back:** the commit SHA, the files touched, and the red confirmation for items 3 and 4 and for the moved T-B-13 Fact.

## Verification

Session 1, 2026-11-18. I reviewed the diff itself, not only the hand-back.

**Rebase.** Onto `origin/main` `b6888f9` at 2026-11-18T16:29Z. Two capture commits came in, `43c5c96` (nflverse roster) and `b6888f9` (rosterweekly); neither touches this slice. All commit ids below are post-rebase.

**Commits** (main, unpushed):
- `e5d7dc3` — code, tests, unstamped weekly specs, task file;
- `819a567` — §17 "off" option (Commit 1b);
- `fdd3ee6` — weekly registration, the two candidate files only;
- `59ba7a8` — dev run, verdict, docs;
- `2bffeae` — fix pass 1 (tests only);
- this commit — the Fix pass 1 section and this record.

**Reviews:**
- **Full implementation review** (opus, high) of `6186371..1dd0cd4`: 6 flags, none blocking.
  - Flags 3–6 were fixed in Fix pass 1: Facts moved into setUp, the T-B-13 tautology replaced, real assertions for T-B-17 and the T-B-1 predict path.
  - Flags 1–2 are accepted, because a fix would change registered code after Commit 2 (§3.2):
    - flag 1: `evaluate_w.py:9` and `report_s2b.py:3-4` import names, against §4's import rule; no test patches those names;
    - flag 2: the artifact's `sha256` omits `season-preds.jsonl`. I re-hashed it on disk today: `b2fafc889c05b27d2b89c7eea2b710739db5c2ee36f12d924fab1d20768a46a2`, equal to the anchor.
- **Fix-pass re-review** (light): no flags. Two low observations accepted: T-B-1 compares through `_ppg_rows`, and setUp Facts re-run per test (cost only).

**Deviations** (all reviewed and accepted):
- extra `Deps` fields: `load_benchw_meta`, `benchw_path`, `benchw_meta_path`, `section_sha`, `s2b1a_artifact`;
- additions: `registry_w.SECTION_SHA`, `spec_wm.NoTrainingRows`, `weekly_h.crosscheck`, `weekly_models.n0_check`;
- the `tests/e2e_w.py` fixture, and `HistIndex` rebuilt per call;
- flag 1 above.

**Locks:**
- `require` passes after the rebase for H and G, on both layers, for 2019–2024.
- The canonical season sections still match the header hashes, `572792a2…` and `12bd9025…`.
- The weekly layers were stamped (`fdd3ee6`) before the single `weekly-dev` run-log entry. The review verified the stamped code and harness hashes against the committed blobs.
- `preregHash` is unchanged.
- No 2025 row reached any fit, frame or metric: `weekly-preds.jsonl` is S/T 2019–2024 only.
- After registration `require(·, 2025)` no longer holds 2025 by itself (flag 17); `weekly_data.guard` does.

**Result** (unconfirmed, with 2025 held):
- H beats STD at RB (−0.27 points per week, 4.2%) and at WR (3.2%), and ties B1c at both. G ties STD and B1c at RB and WR.
- No labelled position passes. The 3-of-4 gate fails for both candidates, as expected.
- QB and TE are report-only: ties, except G, which loses to STD at QB and to B1c at TE.
- H's context α is `"off"` for most targets in every fold, and `"off"` everywhere in 2019.
- Fit-facts observation for LP-2b-1c: H's credibility k sits at the grid top (`kMultW` 32) for most rate targets, so the in-season override of the prior is slow.

**Checks after the rebase:**
- Re-run by Session 1 on the rebased HEAD: `npm test` 2150 pass / 0 fail / 1 skipped, and `npm run smoke` exit 0.
- Python suite: 164 tests OK on `51a968e` (the applier's run). The rebase changed no file under `research/`.
- The light re-review re-ran the two touched modules: 62 tests OK.
- `CLAUDE.md` is 23,941 bytes.

Signed off by Anton 2026-11-19
