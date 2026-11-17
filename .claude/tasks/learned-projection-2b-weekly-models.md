# LP-2b-1 · Learned projection research — weekly layer of H and G (development folds)

**Superseded 2026-11-17 by the split (Anton): not implementable.** Its inputs half (§6) is replaced by `learned-projection-2b1a-weekly-inputs.md`; §7–§15 are the draft basis for LP-2b-1b, to be re-planned after 2b-1a is verified, with the review flags carried as listed in 2b-1a §18–§19.
**Status (history):** plan, **Revision 1** (Session 1, data repo, 2026-11-16). Replaces the 2026-11-14 outline in this file; every outline decision was re-checked against LP-2a as built (`ff651eb`…`2d91356`) and its verdict `grading/2026-11-16-learned-s2a-dev-verdict.md`. Not yet reviewed, not approved.
**Review depth: full** — scoring-affecting research; registers a second layer of both candidates under the frozen LP-1a bar.
**Session 2:** **sonnet**, effort **high**, inside `sleeper-dashboard-data/`; read its CLAUDE.md first. Python only, under `research/learned-projection/` (paths relative to it unless they start with a repo folder).
**Anchors:** data `main` @ `1fe499a`; cache `.cache/panel/` `meta.generatedAt` `2026-11-12T23:44:16.940Z`; LP-1a §8 `preregHash` `7ff9087fc4848b0df90383fc5e4397d3d4b085466c228b430211a63ad6e24e5a`; `.cache/models/season-preds.jsonl` SHA-256 `b2fafc889c05b27d2b89c7eea2b710739db5c2ee36f12d924fab1d20768a46a2`; canonical season section (`json.dumps(layers.season, indent=1, sort_keys=True)`) SHA-256 — H `572792a2214653ac6d09be5f375113160d5a157461b141c63255951cc087301c`, G `12bd9025530022eab79bc27cafc93e94cfd7d497ee715b87f872196b01090500`.
**Series:** LP-1a → LP-1b → LP-2a → **LP-2b-1** → LP-2b-2 (outline, §17) → LP-3.

---

## 0. What this is, for Anton

The two learned models get an in-season layer: each week, points if he plays, the chance he plays, and the rest-of-season total — judged on the frozen weekly scoreboard against the season-to-date average (STD) and the app's in-season model (B1c), 2019–2024 only. 2025 stays sealed for LP-2b-2. Nothing ships; "loses" is a valid result.

## 1. Scope

**In:** §5–§15.

**Out (each a §13 stop):** any edit to a season-hashed path — `lp/io.py`, `asof.py`, `extra.py`, `era.py`, `features.py`, `chain.py`, `model_h.py`, `model_g.py`, `season_models.py`, `baselines.py`, `splits.py`, `evaluate.py`, `registry.py`, `report_s2a.py`, `report.py`, `score.py`, `metrics.py`, `bootstrap.py`, `run_season_models.py` — and to `lp/spec.py`, `lp/sleeper.py`, `run_benchmarks.py`, `fetch_sleeper_projections.py`, `tests/synth.py`, `tests/synth_season.py`, any existing test file; the `season` section of `candidates/*.json`; any file outside `research/learned-projection/` except the four doc files of §14, this task file and the two artifacts; any Node, app or cross-repo-index file; `node bin/learned.mjs export`/`export-weekly`, any `bin/update.mjs` run, any write under a served folder or to `manifest.json`; any network request other than `npm run smoke`; any library beyond `requirements.txt`; **any read of a season-2025 row into a fit, a feature or a metric** (§6.1); the `lines` arm (§4, item 6); a refit of the season layer with any other spec; any change to LP-1a §8, its populations, splits or metrics.

## 2. Facts (Session 1, 2026-11-16; no weekly model fitted, no 2019–2024 weekly candidate metric read)

- **F1 · Weekly universe** (`weeks` with `inUniverse`): 9,089–9,570 rows per season 2018–2024. 2018–2023: 57,420 rows, 38,697 played (QB 3,854, RB 9,850, WR 15,542, TE 9,451).
- **F2 · No season prior for 7% of played weekly rows.** 2018–2024: 3,096 of 45,395 played weekly-universe rows have (pid, S) outside the season universe (QB 121, RB 809, WR 1,358, TE 808); mean `pts` 3.0 against 6.8 (WR) to 15.7 (QB) inside. The season layer predicts the season universe only.
- **F3 · Season predictions on disk.** `season-preds.jsonl` holds per (cand, pid, T), 2019–2024: `share`, `games`, `ppg`, `total`, `c`, per-game key values `kv_*`, plus arm rows (`arm` key). It holds **no** opportunity or per-opportunity target prediction. `season_models.refit` returns only the composed frame; `fit_family` returns the per-target predictions (native units).
- **F4 · Earliest season the registered season procedure runs.** `splits.inner_split(2016)` has no inner training season; `inner_split(2017)` = ({2014}, (2015, 2016)) — H's leave-one-season-out α then has nothing to leave out. 2018 (inner {2014, 2015}) is what 2a's `--smoke` ran.
- **F5 · Registry as built.** `require(name, T ≥ 2025)` raises `ConfirmationHeld` only until both candidate files hold stamped `season` and `weekly` layers — **after this slice's registration commit the registry no longer holds 2025 by itself.** `append_layer` takes `taskFileSha256` from `env.task_file` (default: the 2a task file) and `data` from `env.data_fn` (default: panel meta + gamelogs hashes; no `benchw`). `require` compares the whole `data` object, so a weekly layer with more data keys needs its own `Env`. `lp/spec.py` is in no hashed map.
- **F6 · Weekly harness as built.** `report.weekly_eval`/`cohort_eval` hard-code `FOLDS = splits.TEST_SEASONS` (seven); `cohort_eval` scores the fixed columns `std`, `b2w`, `ridge`, `b4`. `baselines.weekly_forecasts(wf, T, b4, benchw)` returns the test frame only (`std`, `b2w`, `ridge`, `p_plays`, `relevant`, `b4`, `b1w`, `b1w_uncond`, `c_weekly`, `b1cw`, `b1cw_uncond`); its training frame (2014…T − 1, `add_std`, `mark_relevant`) is internal.
- **F7 · Team defence components** (`io.load_teamctx`): `def_plays`, `def_passPlays`, `def_rushPlays`, `def_epaSum`, `def_epaPlays`, `def_passEpaSum`, `def_passEpaPlays`, `def_rushEpaSum`, `def_rushEpaPlays`, `def_successes`, `def_successPlays`, `def_rzTripsAllowed`, `def_rzTdTripsAllowed`, `def_pointsAllowed`; 7,326 rows 2012–2025.
- **F8 · App constants** (`backtests/2026-10-07-inseason-constants.json`, SHA-256 prefix `7bee9946ba78b988`): `K_ROS_POINTS` k — QB 3, RB 2.5, WR 3, TE 3.5 (games); `K_ROS_OPP`, `K_ROS_SHARE` hold per-position k with `kFit`, `ci95`.
- **F9 · Lines.** `asof.view(..., lines_for=pid)` returns one player's closing line per view.
- **F10 · Scale of the bar.** LP-1b weekly conditional MAE (seven folds): STD 7.15 / 6.37 / 6.34 / 5.64, B1c 7.14 / 6.15 / 6.14 / 5.54 (QB/RB/WR/TE). A `beats` needs ≥ 3% — about 0.17–0.21 points per week.
- **F11 · LP-2a result.** Neither candidate passes the season gate (RB, WR beat B2 and B1c; QB beats B2, ties B1c; TE ties). H's α is 1000 (grid top) on most targets. `roof` values: `outdoors`, `dome`, `closed`, `open`. `benchw` rows 2014–2025; `.cache/sleeper-proj/` holds 2025 files.

## 3. Rulings

### 3.1 Anton, 2026-11-16 (verbatim, before any weekly or 2025 result)

> 1. **Progression per position (replaces the outline's "only a candidate that passed the season gate").** LP-2a: neither H nor G passes the season gate (beats B2 and B1c at RB and WR only; QB beats B2, ties B1c; TE ties). For both candidates, the weekly layer is built for all four positions; weekly labels (LP-1a §8 per-position arithmetic, `preregHash` `7ff9087f…e24e5a` unchanged) are **labelled for RB and WR** and **report-only for QB and TE**. The overall weekly gate (3 of 4) is still computed and printed; it is expected to fail by construction and is not the product decision. State this rule and its date (2026-11-16, before any weekly or 2025 result) in the verdict.
> 2. **Carried from LP-2a, fix in new modules only:** flag 4 (`--register` before the anchor check), flag 9 (verdict prints the registration commit as "code commit"), unused `spec` import — never in a season-hashed file (outline lists them). H's α at the top of its grid: report whether the weekly prior inherits it; no season-layer refit.
> 3. **Workflow:** follow the data repo's pre-verification rebase rule (`1fe499a`): rebase onto `origin/main` before writing `## Verification`; self-cited IDs only after it; the sign-off request carries the `Rebased onto origin/main` line. The verdict prints file/registration hashes, not its own commit IDs, where possible.

### 3.2 Carried

LP-2a R1 (per-layer registration; 2025 held; no season-hashed edit), R6 (`npm run smoke` the only network use), R7 (median calibration per position), and LP-1a rulings 1, 2, 6, 8. No best-of-two: every label names its candidate.

## 4. Open questions settled here (Session 1 recommendations — Anton may overrule at approval)

1. **Training start: 2018.** The weekly prior of a training season S′ must be a season-layer prediction from a fit on seasons < S′. The registered procedure first runs as built at T = 2018 (F4); 2016–2017 would need a different procedure, i.e. a prior unlike the test-season prior. So weekly training rows are 2018…T − 1: fold 2019 trains on one season, 2024 on six. The verdict states this and prints per-fold differences.
2. **Residuals against the season layer, per chain target.** Both candidates predict each §7.1 (2a) target of week w as the season-layer prediction plus a learned weekly correction (H: shrunk in-season deviation plus a context ridge on what remains; G: trees on the residual, squared error). Reason: one season of weekly rows cannot re-learn the season layer, and anchoring makes the n = 0 identity (§9.2) exact. G's Poisson loss is dropped for the weekly layer (a residual is signed).
3. **G budget: one pre-registered point, no grid** — (`learning_rate` 0.05, `max_iter` 300, `max_leaf_nodes` 8, `min_samples_leaf` 100, `l2_regularization` 1.0). Fold 2019 has no inner season to select on. Training rows per fold ≤ ~45k (F1), so cost is set by cross-fitting (§8.4): about 5 × 40 fits per fold. Budget: a fold ≤ 60 min, `--dev` ≤ 6 h, the season-prior derivation ≤ 2 h.
4. **Within-season era blend** (`lp/era_w.py`, §6.4): the prior of a `pg`/`po` target is scaled toward the league's season-to-date level, weight n / (n + 4).
5. **No season weights** in the weekly layer (λ = 0): at most six training seasons.
6. **`lines` arm deferred to LP-3.** The as-of API reads one line per view (F9); the arm needs lines on every training row, i.e. a second as-of reader. It was exploratory and report-only; nothing else depends on it.

## 5. Layout

```
lp/spec_w.py         weekly spec builder (written once into candidates/*.json; not hashed, like spec.py)
lp/weekly_data.py    trim, weekly rows, per-week targets, features (§6)
lp/season_prior.py   season-layer per-target predictions 2018–2024 (§6.3)
lp/era_w.py          within-season era blend (§6.4)
lp/weekly_h.py  lp/weekly_g.py  lp/pplays.py                       (§8)
lp/weekly_models.py  fold driver: cross-fitting, calibration, φ, composition, arms, ROS (§8–§9)
lp/registry_w.py     weekly paths, weekly Env, --register-weekly (§10)
lp/evaluate_w.py  lp/report_s2b.py                                 (§11, §12)
run_weekly_models.py   --smoke | --register-weekly | --dev [--write]   [--date] [--resamples 2000]
tests/synth_weekly.py  test_weekly_features.py  test_weekly_models.py  test_weekly_registry.py  test_weekly_evaluate.py
.cache/models/       git-ignored: season-prior.jsonl, weekly-preds.jsonl, run-log.jsonl (appended)
```

Artifacts (unregistered, Invariant 3 exception; aggregates only, ≤ 5 MB): `backtests/<date>-learned-s2b1-dev-panel.json`, `grading/<date>-learned-s2b1-dev-verdict.md`.

## 6. Inputs

### 6.1 2025 is never reached

`weekly_data.LAST_SEASON = 2024` (= `splits.CONFIRM_FOLD − 1`, asserted). `trim(tables, last)` returns new `asof.Tables` with every row of `weeks`, `teams`, `seasons`, `bench`, `teamctx` with `S > last` removed (`X` unchanged — rows are reached only through `weeks["rid"]`), `extras = extra.build_extras(last=last)`. `benchw` rows with `S > last` are dropped on load; `sleeper.load_projections(..., seasons=range(2018, last + 1))`. The runner builds the trimmed tables once and never holds the untrimmed ones past that call. `weekly_models.fold_w(..., T, confirm=False)` and `season_prior.derive(..., T, confirm=False)` raise `registry.ConfirmationHeld` for T ≥ 2025 unless `confirm=True`; no 2b-1 code passes `confirm=True` (LP-2b-2's runner will, after its start marker). `extra.file_hashes()` (byte hashes of the gamelogs files, 2025 included) is the only touch of a 2025 file — a hash, never parsed.

### 6.2 Weekly rows

For season S and origin n (week w = n + 1): `v = asof.view(T_trim, S, n)`; rows = `v.schedule` rows with `w == n + 1` and `inUniverse` — the same rows `baselines.build_weekly_frame` produces (asserted equal as (pid, S, w) sets per season). Seasons 2018…2024; features cached per (S, w). Outcome of a row: `played`, `pts` and the row's key vector from `tables.weeks`/`X` — read only for **training targets** (seasons < T) and by `evaluate_w` (season T).

Per-week **targets** of a played row (§7.1 of 2a, native units, no era division): `pg` — the week's key value, exposure 1; `po` — key ÷ denominator, exposure = denominator (0 → excluded for that target); opportunity targets are `pg`. `gamesShare` is not a weekly target (P(plays) replaces it).

### 6.3 Season prior (`lp/season_prior.py`)

`derive(store, name, spec, T, env, confirm=False)` for T ∈ 2018…2024: `main, out = season_models.fold(store, name, spec, T, env)` (this calls `registry.require(name, T, "season", env)` itself for T ≥ 2019), then for each position `preds = prior_refit(store, spec, name, pos, T, out["details"][pos]["entry"])` — a **copy** of the body of `season_models.refit` that returns `fit_family`'s clipped, de-normalised per-target predictions (§16). Hard check, every (name, pos, T): `season_models.compose(store, spec, pos, d, preds, minor, c)` equals `main` rows of that position exactly (same pids, `total` and every `kv_*` equal). For T ∈ 2019…2024 the composed frame also equals the `season-preds.jsonl` rows of that candidate without an `arm` key, |Δ| ≤ 1e-9 × (1 + |x|) on `total`, `ppg`, `share` and every `kv_*`, and the file's SHA-256 equals the anchor; else stop (§13). Output per (cand, pid, T): every target's prediction, `gamesShare`, the season `c`, the chosen entry; H's α per target (from `out["details"]`). Cached in `season-prior.jsonl` (SHA-256 into the artifact). The prior of a weekly row (pid, S, w) is the derive output of (pid, T = S); the season `c` is never applied to it.

**Fallback prior** (F2), per fold, position and target, from that fold's training rows whose (pid, S) has no derive output: exposure-weighted mean target; `gamesShare` fallback = their share of played rows. Such rows carry `noPrior = 1`.

### 6.4 Era blend (`lp/era_w.py`)

`mu_std(tables_trim, struct, S, n)` = `era.league_means(features.player_seasons(season_only(view(S, n)), keys), struct)` restricted to season S — the 2a league-mean rule (top-N by Σ `oppo`, Σ numerator ÷ Σ exposure) over season-S weeks ≤ n only; `season_only` keeps the view's season-S rows of `weeks`/`X`/`teams`. `mu_prev` = `store.mu(S)[(P, q)][S − 1]`. For a `pg`/`po` target (P, q) with both finite and > 0: `ratio = mu_std / mu_prev`, else 1; `prior × (1 + ω(n)(ratio − 1))`, `ω(n) = n / (n + eraN0)`, `eraN0 = 4` (spec). At n = 0 the prior is unchanged. Applied to derive and fallback priors alike; never to `gamesShare` or minor constants.

### 6.5 Features (`weekly_data.features_w(v, rows, prior, spec_w)`; missing → NaN; all through `v`)

For row (pid, S, w = n + 1) of team τ (the row's `team`), opponent o, position P; "played weeks" = his season-S rows with `played` and `w ≤ n`; w′ = τ's last `v.team_weeks` week < w (none → `first = 1`).

- **`prior`** — `pr_<t>` per target (after §6.4), `pr_gs`, `noPrior`.
- **`form`** (per target t) — `ex_<t>` (Σ exposure to date), `std_<t>` (Σ key ÷ Σ exposure to date), `rec_<t>` (same with weight `gRecDecay^a`, a = number of his later played weeks, `gRecDecay = 0.7`), `dstd_<t>` = `std_<t> − pr_<t>`, `drec_<t>` = `rec_<t> − pr_<t>`; `nP` (played weeks), `wk` (= w).
- **`usage`** (CR-10: components summed, then divided; team sums from `v.teams` rows of the week's `team`; air yards from `v.weeks` by (team, S, w)) — to date and over the last 3 played weeks: `tgtSh`, `rushSh`, `rzSh`, `airSh`, `oppoPg` (`oppo` as 2a), each also `…3`.
- **`avail`** — `playedPrev` (a played row at w′), `runP` / `runN` (consecutive τ team-game weeks ≤ n he played / did not play, counted back from w′), `wkSince` (τ team-game weeks since his last played week; NaN if none in S), `prevD`, `prevX`, `prevNone` (his `status` at w′: `D`, `X`, no row or null), `rwPrev_ACT/INA/RES/PUP/other` (his `rw` pairs at w′ on τ; all NaN where `rwOracle` — the view masks it), `depthPrev` (his `depthOrder` at w′), `depthChg` (`depthPrev` − his `depthOrder` at τ's game before w′), `gsStd` (played weeks ÷ τ team-game weeks ≤ n), `gsPrev` (S − 1 `gamesPlayed / teamGames`, `v.seasons`), `first`. At `first = 1` every lagged-status field is NaN — never S − 1's last week (LP-1a F4).
- **`absence`** (lagged only, never week w) — a **mate** is a pid ≠ his, of position P (for `qbOut`: QB), with ≥ 1 played S row on τ at w ≤ n; his `share` = Σ his `oppo` on τ ÷ Σ τ's team `oppo` (QB: `pass_att`; others `rec_tgt + rush_att`) over the weeks he played on τ. **Out** = no played row of the mate on τ at w′. `vacShare` = Σ `share` of mates out; `retShare` = Σ `share` of mates out whose `rw` at w′ lists τ with `ACT` (NaN for S ≤ 2015, where `rw` is masked); `qbOut` (non-QB rows) = the QB mate with the most `pass_att` on τ to date is out. `first = 1` → 0, 0, 0.
- **`opp`** — opponent o's defence over S weeks ≤ n (`v.teamctx` rows of o) and over all of S − 1 (rows of `era.era_team(o, S − 1)`): `oEpa` (Σ `def_epaSum` ÷ Σ `def_epaPlays`), `oPassEpa`, `oRushEpa`, `oSucc` (`def_successes / def_successPlays`), `oRzTd` (`def_rzTdTripsAllowed / def_rzTripsAllowed`), `oPtsPg` (Σ `def_pointsAllowed` ÷ games), each `…` (to date; NaN with no game) and `…1` (S − 1); `oG` (o's games to date). Never a stored rate (CR-10).
- **`team`** — τ over S weeks ≤ n: `tPassPg`, `tRushPg`, `tPtsPg` (`off_passPlays`, `off_rushPlays`, `off_pointsScored` ÷ games), `tEpa` (`off_epaSum / off_epaPlays`), `tProe` (2a's `tmProe` formula).
- **`game`** — `home`; `dome` (`roof` ∈ {`dome`, `closed`}).
- **`gl`** (`v.extras` season-S rows w ≤ n, summed then divided as 2a §5.6) — `passEpaAtt`, `cpoe`, `rushEpaAtt`, `recEpaTgt`, `rushFdAtt`, `recFdTgt`, `yacRec`.
- **`bio`** — `age`, `exp`, `isRookie` from `store.feats(S)` where the pid is in it, else NaN.

H's context set `CTX` = `usage` ∪ `avail` ∪ `absence` ∪ `opp` ∪ `team` ∪ `game` ∪ `gl` ∪ `bio` ∪ {`nP`, `wk`, `noPrior`}. G uses every feature. The spec (§10) lists every name per group.

## 7. Composition

**Conditional points** of a row: per-target weekly predictions `q_t` (§8), clipped per target by `chain.clip_bounds` over that fit's training weekly targets; `ppg = chain.season_points(q ∪ {gamesShare: 1}, struct, P, minor, weights, team_games = 1, c = 1)["ppg"]`, `minor` = `store.minor(splits.train_seasons(S), P)` — the season layer's own minor constants for that season. `cond = c_w × ppg` (§8.4). **Unconditional** `uncond = p × cond`, p = the candidate's P(plays).

## 8. The weekly candidates (per position and target; training rows = played weekly-universe rows of 2018…T − 1, weight = exposure)

### 8.1 H (`lp/weekly_h.py`; numpy + `model_h.Cohort`, imported)

1. **Credibility.** Evidence over his played weeks j < w of S: `E = Σ ρ^a_j e_j`, `N = Σ ρ^a_j key_j` (a_j = his later played weeks; `key_j` = the numerator, i.e. `e_j × r_j`). `b = pr + (N − pr × E) / (k + E)`; E = 0 → `b = pr`.
2. **(k, ρ):** `k = kMultW × ` the target's median weekly exposure over training rows (rows with exposure > 0), `kMultW` ∈ (0.5, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32), ρ ∈ (0.6, 0.75, 0.85, 0.92, 1.0); minimise the weighted SSE of `r − b` over training rows; first minimum, k outer.
3. **Context.** `model_h.Cohort(CTX, r − b, e, α)`; α ∈ (1, 10, 100, 1000) by leave-one-season-out over the training seasons when there are ≥ 2 (Σ weighted SSE, first minimum), else 100. `q = b + Cohort.predict(CTX)`.

The fitted k (also in games: ÷ the median weekly exposure per played game of the target's denominator, 1 for `pg`) and ρ are reported beside the app's `K_ROS_POINTS`, `K_ROS_OPP`, `K_ROS_SHARE` (F8) — comparison only.

### 8.2 G (`lp/weekly_g.py`)

`HistGradientBoostingRegressor(loss='squared_error', early_stopping=False, random_state=spec_w["seed"], **gPoint)` on all features, target `r − pr`, weight = exposure; `q = pr + prediction`. Float arrays.

### 8.3 P(plays) (`lp/pplays.py`) — per candidate family, per position; rows = every weekly-universe row of 2018…T − 1 (byes have no row), target `played`

Features: `avail` ∪ {`pr_gs`, `noPrior`, `nP`, `wk`, `age`, `exp`}. H: `LogisticRegression(C=1.0, max_iter=1000)` on `baselines._prep` (median + missing indicators, training medians) and `StandardScaler`. G: `HistGradientBoostingClassifier(early_stopping=False, random_state=seed, **gPoint)`. Benchmark: persistence `p_plays` (LP-1a §5.3) from `weekly_forecasts`.

### 8.4 Cross-fitting, calibration, horizon

- **Cross-fit:** training rows are split into `crossFolds = 4` groups by player (sorted unique pids of the fold's training rows, index mod 4); each group's out-of-fold `ppg` and `p` come from a fit on the other three with the same procedure (H refits k, ρ, α inside). The final models are fitted on all training rows.
- **`c_w`** per position: median of `pts / ppg_oof` over training rows that are relevant and played with both > 0 — relevant flags from the LP-1b recipe: training frame = `build_weekly_frame` rows with 2014 ≤ S < T, `pos_mean` = mean `pts` of its played rows by position, `baselines.add_std`, `baselines.mark_relevant` (§16). Under `calibMinRows = 30` rows → 1.
- **Horizon φ** per position: for h ≥ 2, `p_h = pr_gs + (p − pr_gs) × φ^(h−1)`; φ ∈ (0, 0.25, 0.5, 0.7, 0.85, 0.95, 1.0) minimising Brier of `p_h` (from `p_oof` at origin n) against `played` over training pairs (pid at origin n ∈ `rosOrigins` with a row at n + 1; his `v.schedule` rows of weeks n + h, h ≥ 2).

## 9. Rest-of-season sum (report-only) and the n = 0 identity

### 9.1 ROS

At origin (S, n), n ∈ `rosOrigins` = (0, 4, 8, 12), for each pid with a weekly row at n + 1: the future weeks are his `v.schedule` rows with w > n (the published identity of weekly-universe rows, LP-1a §4.5 — a stated limit: membership of later weeks rests on later roster listings). A future week's features are the origin-n features with that week's `opp`, `home`, `roof`, `wk`. `ROS = pts_{≤n} + Σ_w p_{h(w)} × cond_w`. Actual = `pts_{≤n}` + Σ `pts` over his played rows among those weeks. Benchmarks on the same rows: STD-ROS = `pts_{≤n}` + (number of future weeks) × `p_plays × std` at n + 1; B1c-ROS = `pts_{≤n}` + (number of future weeks) × `b1cw_uncond` (else `p_plays × b1cw`) at n + 1, B1-covered rows; at n = 0 also 2a's `total`. Reported on the rows relevant at n + 1: MAE with CI, d against each, no label.

### 9.2 n = 0 identity

For a season-universe pid at n = 0 with the context stage removed (H: q = b; G: q = pr), `c_w = c` (season) and `p = gamesShare` every week, Σ over the `v.team_weeks` weeks of his kickoff team `team_k` of `p × cond` equals 2a's `total` of that row (T-W-4; tolerance 1e-9). The full model's n = 0 forecast differs from 2a's; the verdict reports per position the mean of `ROS_0 / total` and its MAE against actual season points beside 2a's, and attributes the gap to `c_w` vs `c`, P(plays) vs games share, and weekly context.

## 10. Registration (`lp/registry_w.py`)

- `WEEKLY_CODE(name)` = `registry.season_code(name)` ∪ `lp/weekly_data.py`, `season_prior.py`, `era_w.py`, `weekly_h.py` (H) or `weekly_g.py` (G), `pplays.py`, `weekly_models.py`. `WEEKLY_HARNESS` = `lp/evaluate_w.py`, `report_s2b.py`, `registry_w.py`, `registry.py`, `report.py`, `score.py`, `metrics.py`, `bootstrap.py`, `run_weekly_models.py`.
- `weekly_env()` = `registry.Env(task_file=<this file>, data_fn=weekly_data)`; `weekly_data()` = `registry.default_data()` plus `benchwSha256`, `benchwMetaSha256` (file bytes), `constantsSha256` (F8 file). Season checks always use `registry.Env()`.
- **Weekly spec** (`spec_w.default_spec_w(name)`): `name`, `features` (group → names), `ctx`, `targets` (season targets minus `gamesShare`), `kMultW`, `rhos`, `ctxAlphas`, `ctxDefaultAlpha` 100, `gPoint`, `gRecDecay`, `pplays`, `phis`, `eraN0`, `crossFolds`, `rosOrigins`, `calibMinRows`, `trainFrom` 2018, `lastSeason` 2024, `seed` 0; null for the other family's keys. The code reads these from the candidate file only (smoke: from `default_spec_w`).
- **Commit 1** writes `layers.weekly = { "spec": <spec>, every other stamp key null }` into both candidate files; the season section stays byte-identical (canonical hashes in the header).
- **`--register-weekly`**: the LP-1a prereg check, then the cache anchor (`generatedAt`) and the `benchw` checks (§12 runner steps) — **before any registry read or write** (fixes 2a flag 4). Then, for both candidates, refuse when: the weekly layer is already stamped; its `spec` differs from the HEAD version of the file; the run-log holds a `weekly-dev` entry; `require(name, 2024, "season")` fails. Else `registry.append_layer(name, "weekly", head_spec, WEEKLY_CODE(name), WEEKLY_HARNESS, weekly_env())` for H then G, after both pass every check. No re-registration path in this slice.
- **`--dev`**: for both candidates and every T in `splits.DEV_FOLDS`, `registry.require(name, T, "season", registry.Env())` and `registry.require(name, T, "weekly", weekly_env())` **first**; then append `{ mode: "weekly-dev", at, folds, date }`; then derive priors 2018…2024, fit, evaluate.
- **`--smoke`** (no registration needed): season prior at T = 2018 only; fits on 2018 weeks ≤ 9, predicts 2018 weeks ≥ 10 (2018 is no development fold); STD, B1c and the relevant flags for `c_w` (weeks ≤ 9) from `weekly_forecasts(wf, 2018, b4, benchw)`; `evaluate_w` and `report_s2b` with `folds = (2018,)` to stdout; writes nothing.

## 11. Evaluation (`lp/evaluate_w.py`) — development folds only

### 11.1 Frame

Per T ∈ `folds`: `wk_T = baselines.weekly_forecasts(wf, T, b4, benchw)` with `wf = baselines.build_weekly_frame(T_trim, seasons=range(2014, 2025))`, merged on (pid, S, w) with `h`, `g` (`cond`), `h_p`, `g_p`, `h_uncond`, `g_uncond`. Rows of any season outside `folds` are dropped. A null candidate `cond` or `p` on any weekly-universe row is a hard stop.

### 11.2 Weekly labels — LP-1a §8, `lp/metrics.py` unchanged

Per candidate and position: `rs = Resampler(pids of every weekly-universe row of the position in folds, B, seed 12345)`; f = index of T in `folds`; groups = (T, w).
- Rows vs **STD**: relevant and played. Rows vs **B1c**: relevant, played, `b1cw` non-null (B1-covered, outcome-conditioned — labelled so).
- `d = diff_pooled(|cand − pts|, |bench − pts|, f, nf, rs, pi)`; `benchMae = mae_pooled(bench − pts, …)`; `rankCi = ci95(spearman_weekly(cand, …)["boot"] − spearman_weekly(bench, …)["boot"])`; `label = metrics.label(d.value, d.ci, benchMae.value, rankCi)`.
- Every label prints "**unconfirmed** — the 2025 fold is held". RB and WR are **labelled**; QB and TE are **report-only (Anton, 2026-11-16)**. A labelled position passes when it `beats` STD and `beats` B1c. `metrics.gate` over all four positions is printed as "overall weekly gate (3 of 4) — expected to fail by construction; not the product decision".

### 11.3 Reported, not gated

- vs RIDGE, B2 (`b2w`), raw B1 (`b1w`, covered rows) and B4 (covered rows) on the same rows as the label arithmetic, headed "report-only — no gate"; H − G paired.
- Per candidate: MAE, bias, Spearman with CIs; MAE and `d` (vs STD, B1c) per fold, slopes on T, `metrics.drift` (skipped with < 3 folds).
- Unconditional MAE (relevant set, `actual0`) vs STD (`p_plays × std`), B1c (`b1cw_uncond`, else `p_plays × b1cw`); P(plays) Brier and log-loss (clip 0.01, log-loss only) over weekly-universe rows vs persistence, paired d with CI.
- §9.1 ROS and §9.2 n = 0 comparison.
- **Cohorts** (LP-1a §5.5) for H, G, STD, RIDGE, B1, B1c: `report.cohort_eval` called twice — on `wk` as is (STD, B2, RIDGE, B4) and on a copy with `std := h`, `b2w := g`, `ridge := b1w`, `b4 := b1cw`, its outputs renamed H, G, B1, B1c (no copy of the cohort code).
- **Override speeds**: per position, target and fold, H's k (native and in games) and ρ, beside F8's app constants; G's override shows only through cohort (a)'s catch-up lag.
- Per fold and position: H's α (context), `c_w`, φ; fallback-prior rows; the season prior's chosen entry and **inherited α**: the share of H's season targets at α = 1000 (the weekly layer inherits it; no refit).

### 11.4 Exploratory — unlabelled, never a candidate

Each on **all six folds** (every arm states its folds and n — the 2a §10.4 flag 1 does not recur): `no-absence`, `no-opp`, `no-era-blend`, `c_w = 1`, `oracle-status` (adds his week-(n + 1) `rw` status and `depthOrder` from `view(..., oracle=True).next_week`), H `no-context` (q = b), G `no-prior` (target r, no `prior`/`dstd`/`drec` features). Reported as the change in pooled conditional MAE against the candidate on the STD label rows, with CI, no label.

## 12. Runner and verdict

`run_weekly_models.main(argv=None, task_file=LP1A_TASK_FILE, env=None, env_w=None)`, every mode in this order: (1) `report.prereg_hash` of the LP-1a task file equals `report.PREREG_HASH`, else return 2 — before `io.load_cache`; (2) cache `generatedAt` = anchor; `score.parity`; `benchw.meta.panelGeneratedAt` = anchor and its checks `c2`, `c3`, `c6` pass (as `run_benchmarks.py`); (3) trim (§6.1); then the mode. Imports only what it uses.

**Verdict** (`grading/<date>-learned-s2b1-dev-verdict.md`): opens with the §3.1 decision 1 rule and its date; then one plain paragraph per position and candidate — vs STD and B1c (points per week, percent, CI, label or "report-only"), P(plays) vs persistence, the three cohorts, fitted override speeds beside the app's; the label table; §11.3; §11.4 headed "Exploratory — not candidates, no label"; **registration and data facts as hashes only** — per candidate and layer `specSha256`, a combined SHA-256 over the sorted `path:hash` lines of `code` and of `harness`, `data`, the candidate file's SHA-256, `season-prior.jsonl`, `weekly-preds.jsonl` and `season-preds.jsonl` SHA-256 — **no commit id** (fixes 2a flag 9); run times; versions; LP-1a §8 verbatim with `preregHash`; **stated limits**: 2025 held, no label final; training starts 2018 (fold 2019 trains on one season; training-season priors come from fits on fewer seasons than test priors); static 2026 positions; B1c's and B4's limits as in the s1b verdict; B1c rows outcome-conditioned; ROS future-week membership; `lines` deferred; H's α inherited at the grid top; no feature asserted equal to an app factor.

**LP-2b-1 passes** when the verdict exists, every §15 test is green and was shown red, both weekly layers were registered before their first test-fold weekly fit (run-log and commit order), labels come from `lp/metrics.py` unchanged under the same `preregHash`, the season sections are byte-identical to the header hashes, and no 2025 row reached a fit, feature or metric.

## 13. Stops (report to Session 1, never improvise)

- Any need to touch §1's **Out** or change what an imported function returns.
- `season-preds.jsonl` SHA-256 differs from the anchor, or a derived prior differs from it beyond §6.3's tolerance (on trimmed tables).
- Any change to a weekly `code`, `harness`, `data` item or `spec` after the first `weekly-dev` entry.
- `--smoke`: a candidate's conditional MAE above STD's at ≥ 3 positions (report, do not tune).
- A relative improvement over STD or B1c above 12% at any position (smoke or dev) — suspected leak: run T-W-1 and T-W-12 on the real cache, report.
- A fold over 60 min, `--dev` over 6 h, the prior derivation over 2 h, an aggregate over 5 MB.
- The cache or `benchw` absent or off-anchor; a target with no training rows; any design question this file does not answer.

## 14. Done-definition

1. Code, tests, both candidate files with the unstamped weekly layer; `python3 -m unittest discover -s research/learned-projection/tests -t research/learned-projection` green (the 2a suite included); each §15 test shown red once and restored; `--smoke` clean. **Commit 1** (includes this task file).
2. `--register-weekly`. **Commit 2** (the two candidate files only).
3. `--dev --write` (2,000 resamples). `npm test`, `npm run smoke` green. Docs: `research/learned-projection/README.md`; repo `README.md` → Module notes (LP row); `data-catalog.md` → Non-served artifacts (two names); `CLAUDE.md` LP navigation row names this task file and the new modules (under 25,000 bytes — prune the row's wording if needed). Nothing under a served folder or `manifest.json` changed. **Commit 3.** No push, no rebase (Session 1 rebases before verification, §3.1 item 3; no artifact cites a commit id).

Hand back: the three SHAs; files touched; deviations; `preregHash` unchanged; season-section hashes unchanged; the run-log; the labels; the RIDGE table; fitted k, ρ, `c_w`, φ; run times; per test its assertion, defect and red confirmation.

## 15. Tests (each shown red once, then restored; panels from the new `tests/synth_weekly.py`, which may import `tests/synth_season.py`)

- **T-W-1 as-of.** `features_w` at origin (S, n) is identical across: as built; *scramble* — every outcome column, `X`, `teamctx`, `extras`, `sum_*` of season-S weeks > n and of later seasons randomised, and `rw`/`depthOrder` of week n + 1; *delete* — those rows removed. Covers `vacShare`, `retShare`, `qbOut`, `opp`, `usage`, `form`, `mu_std`. Fails if a feature reads week w or later. Red: take `vacShare`'s "out" from week w instead of w′.
- **T-W-2 2025 never reached.** On a synthetic panel whose last season L + 1 is poisoned (NaN outcomes), with `LAST_SEASON` patched to L: `trim` leaves no row with S > L in any table, `benchw` or B4; with `weekly_h.fit`, `weekly_g.fit`, `pplays.fit`, `season_prior.derive` and `evaluate_w.evaluate` patched to record the seasons of every row they receive, a `--dev`-path run records none > L; `fold_w(..., L + 1)` and `derive(..., 2025)` raise `ConfirmationHeld` without `confirm=True`. Also `LAST_SEASON == splits.CONFIRM_FOLD − 1` and the runner's folds are `splits.DEV_FOLDS`. Fails if a held-season row reaches a fit or metric. Red: skip `trim` in the runner.
- **T-W-3 prior is the season layer.** On a synthetic panel: `prior_refit` composed with `c` equals `season_models.refit`'s frame and `fold`'s main rows exactly (names `season_models.refit` as the original); the runtime check raises on a perturbed `season-preds` copy. Fails if the copy drifts or the prior is not the registered fit. Red: drop the clip in `prior_refit`.
- **T-W-4 n = 0 identity.** §9.2 on a hand-built row with a `po` key, `bonus_fd_rb`, a direct key and a minor key, a 16-game team in a 17-game season: equals `c × share × teamGames_k × ppg` within 1e-9. Fails on a hard-coded 17, a dropped minor term or a missing denominator. Red: omit the minor constants.
- **T-W-5 H credibility.** Synthetic players with known k, ρ: the fit returns both within one grid step; E = 0 gives exactly the prior; the most recent played week has weight ρ⁰; a not-played week contributes nothing; with one training season α = 100. Fails on an off-by-one decay or unweighted evidence. Red: weight the most recent week ρ¹.
- **T-W-6 teammate absence.** Hand-built team: a mate with share 0.3 who missed w′ → `vacShare` 0.3 on the row of w; with `rw` at w′ `ACT` → `retShare` 0.3 (S ≥ 2016), NaN (S ≤ 2015); a mate who misses only week w → 0; the top passer missing w′ → `qbOut` 1 on a WR row; `first` → 0. Fails on a same-week read. Red: same as T-W-1's.
- **T-W-7 opponent and era.** `oEpa` = Σ components ÷ Σ plays (not a mean of weekly rates); S − 1 uses `era_team` (2020 `LV` opponent reads 2019 `OAK`); `mu_std` uses weeks ≤ n only and equals `era.league_means` on that slice; ω(0) = 0; `eraN0` is read from the spec. Fails on averaged rates, an unmapped relocation or a full-season mean. Red: use the full season-S rows in `mu_std`.
- **T-W-8 P(plays) and φ.** At `first = 1` every status/`rw`/depth lag is NaN even when S − 1 has a final-week status; synthetic data with a known decay recovers φ within one grid step; both families are deterministic across two runs. Fails on an S − 1 status read or an unseeded model. Red: fill `prevD` from S − 1's last week.
- **T-W-9 cross-fitting and calibration.** Groups are disjoint, cover every training pid and depend only on sorted pids; `c_w` uses out-of-fold `ppg` only (an in-sample `ppg` gives a different value on the fixture); relevant flags on training rows reproduce `baselines.weekly_forecasts`' `c_weekly` when used with `b1w` (names `weekly_forecasts` as the original); < 30 rows → 1. Fails if calibration sees in-sample predictions or the relevant set drifts from LP-1b's. Red: compute `c_w` on in-sample `ppg`.
- **T-W-10 weekly registration.** In a temporary git repository: `require(..., "weekly")` raises for the unstamped Commit-1 layer, a stale `benchw` hash, a changed weekly code or harness file, a stale `specSha256`; passes when clean. `--register-weekly` with the anchor mismatched returns 2 and leaves both candidate files byte-identical (fixes flag 4); refuses an already-stamped weekly layer, a spec differing from HEAD, a `weekly-dev` run-log entry; after it, each season section's canonical bytes are unchanged and `require(..., "season")` still passes. `--dev` unregistered returns 2 and appends no run-log entry. Fails if a weekly test-fold fit can start unregistered or registration rewrites the season section. Red: run the anchor check after `append_layer`.
- **T-W-11 label wiring.** Hand-built frame: STD rows = relevant ∧ played; B1c rows also need `b1cw`; a row of a season outside `folds` is ignored; a null candidate value raises; the label equals `metrics.label` on hand-computed inputs with `spearman_weekly` over (T, w) groups; QB/TE print "report-only", RB/WR labelled; the overall gate prints; `folds = (2018,)` runs (smoke). Fails if QB/TE gain labels, uncovered rows are scored or 2025 enters the pool. Red: pool over `TEST_SEASONS`.
- **T-W-12 fold isolation.** For fold T on a synthetic panel: every fitted object (k, ρ, α, trees, `c_w`, φ, fallback priors, clip bounds) is identical when all season-T outcomes are randomised; a prediction for (T, w0) is identical when season-T outcomes of weeks ≥ w0 are randomised. Fails on any cross-fold or within-season look-ahead. Red: compute the fallback prior with season T rows.
- **T-W-13 cohort aliasing.** `evaluate_w`'s H cohort output equals `report.cohort_eval` on a frame with `std := h`; the B1c output equals it with `std := b1cw`. Fails on a crossed mapping. Red: map `ridge := b1cw`.
- **T-W-14 G seed and point.** With `HistGradientBoostingRegressor`/`Classifier` wrapped by `mock.Mock(wraps=…)`, every construction gets `random_state == spec_w["seed"]`, `early_stopping is False` and `gPoint`'s values; the regressor's loss is `squared_error`. Fails if a seed or a parameter is not read from the spec. Red: drop `random_state`.
- **T-W-15 prereg pin and verdict hashes.** `run_weekly_models.main` returns 2 on a task-file copy with one §8 character changed, with `io.load_cache` patched to raise; the verdict built from a fixture result contains the combined `code`/`harness` hashes and no string equal to `git rev-parse --short HEAD` or the candidate files' last commit. Fails if the check runs late or a commit id is printed. Red: print `HEAD` as "code commit".

## 16. Copied definitions

| Copy | Original | Test |
|---|---|---|
| `season_prior.prior_refit` — body of `season_models.refit` up to `fit_family`, returning its predictions | `lp/season_models.py` `refit` | T-W-3, plus the runtime compose check (§6.3) |
| `weekly_models` training-frame relevant flags (2014 ≤ S < T, `pos_mean`, `add_std`, `mark_relevant`) | `lp/baselines.py` `weekly_forecasts` (its internal training frame) | T-W-9 |

Nothing crosses repos; no index line. Nothing else is copied: cohorts are reused by aliasing (T-W-13), league means and composition by import.

## 17. Later — LP-2b-2 (outline only; planned after this slice is verified and signed off)

Own task file `learned-projection-2b2-confirmation.md`, own sign-off. The one-shot 2025 fold for **both layers of both candidates**: a new runner (not in any hashed map) builds tables trimmed at 2025, writes a start marker under `.cache/models/` and a `confirm` run-log entry **before the first 2025 fit**, and refuses if either exists (a crash cannot allow a second run); it calls `season_models.fold(..., 2025)` (the registry passes once both weekly layers are stamped) and `weekly_models.fold_w(..., 2025, confirm=True)`; `metrics.confirm(label, d_2025)` per labelled cell (season: all four positions; weekly: RB, WR labelled, QB, TE report-only per §3.1); no refit, no tuning, no re-registration. Depends on: LP-2b-1 verified, both weekly layers stamped, this file's §6.1 guard unchanged.
