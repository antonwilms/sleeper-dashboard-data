# LP-2b-2a · Learned projection research — the confirmation path, rehearsed on 2024

**Status:** plan, Rev 2.2 (Session 1, data repo, 2026-11-19). **Approved by Anton 2026-11-19 (Rev 2.2).** Slice 1 of 2 of LP-2b-2 (§3.2). Rev 1: full review, 12 flags (7 should-fix, 5 notes), none blocking; Anton 2026-11-19 "Yes, revise all"; all fixed in Rev 2 (§17). Rev 2: full review, 11 flags (3 should-fix, 8 notes), none blocking; Anton "Yes, revise all"; fixed in Rev 2.1 (§17).

**Review depth: full** — it builds the code path the one-shot 2025 run (LP-2b-2b) will execute unchanged; it touches the held-season boundary and every registration lock.

**Session 2:** **sonnet**, effort **high**, inside `sleeper-dashboard-data/`; read its CLAUDE.md first. Python only. Paths are relative to `research/learned-projection/` unless they start with a repo folder.

**Anchors:**
- data `main` @ `0a0c590`;
- `.cache/panel/meta.json` `generatedAt` `2026-11-12T23:44:16.940Z` (`from` 2014, `to` 2025);
- LP-1a §8 `preregHash` `7ff9087fc4848b0df90383fc5e4397d3d4b085466c228b430211a63ad6e24e5a`;
- caches (SHA-256), never regenerated: `weekly-inputs.pkl` `2431b3978d5a078fb2256e3553ca513f17c62160ec56ac72fb657486f43a1fb2`; `season-prior.jsonl` `55c55e200ce18d549d522ee007e284bbe180ff98209378c4c355a47a9643c56a`; `weekly-preds.jsonl` `44d7132a8418b892c150eb70b7b93394de6c5c2fb01f5b6dbcee9f99196aab29`; `weekly-fits.pkl` `4c6738bbb28502f3c4436f8715c89d95378662739403bda89a12bafe06d9f9b3`; `season-preds.jsonl` `b2fafc889c05b27d2b89c7eea2b710739db5c2ee36f12d924fab1d20768a46a2`;
- development artifacts (SHA-256): `backtests/2026-11-16-learned-s2a-dev-panel.json` `b41169fbeefa2fab2d8a8d6f500590fb65f7b2465353ce67193941322e9995d7`; `backtests/2026-11-18-learned-s2b1b-dev-panel.json` `3a0dcb5148f8720d1ec77c714ed02d3f2f729830645e190c550c1f3f078c6386`;
- canonical season sections: `registry_w.SECTION_SHA` (H `572792a2…087301c`, G `12bd9025…1090500`).

**Series:** **LP-2b-2a** → LP-2b-2b (§16) → LP-3.

---

## 0. What this is, for Anton

The code that will produce the 2025 forecasts and scores, built and proven before 2025 is opened; the held season is a setting. To prove the path computes exactly what the locked procedure computes, it is rehearsed on real data with 2024 treated as the held season. The rehearsal must reproduce the locked 2024 development results: H exactly, G within 5% with the same chosen settings. A fully synthetic end-to-end test also runs the path one season past the last training season — a stand-in for 2025. Nothing in this slice reads 2025 past the trim, writes a start marker or writes a verdict.

## 1. Scope

**In:** §4–§15.

**Out (each a §12 stop):**
- **Protected files.** Any edit to a registered path (`registry.season_code(n)`, `SEASON_HARNESS`, `registry_w.WEEKLY_CODE(n)`, `WEEKLY_HARNESS`), `lp/spec.py`, `lp/spec_wm.py`, `lp/sleeper.py`, any 2b-1a or 2b-1c file (`lp/{spec_w,weekly_data,season_prior,era_w,analysis_w,report_s2b1c}.py`, `run_weekly_inputs.py`, `run_weekly_analysis.py`), `run_season_models.py`, `run_weekly_models.py`, `run_benchmarks.py`, `fetch_sleeper_projections.py`, `candidates/`, any existing test or fixture file.
- **Caches and artifacts.** Writing, regenerating or deleting any `.cache/models/` file other than appending to `run-log.jsonl`; editing any existing `backtests/` or `grading/` file.
- **2025.** Any `--held`/season flag on the CLI; any table, frame, fit or metric holding a row of season > the held season; a held season of 2025 anywhere outside the synthetic tests (§6.1). The marker, the run-log mechanics of the real run, the readiness table and the verdict are LP-2b-2b.
- **Outside this folder:** files outside it, except the §13 docs, this file and the §9 artifact; Node, app or index files; any `bin/` run; served or `manifest.json` writes; network use beyond `npm run smoke`; any new library.
- **The bar.** Any change to LP-1a §8 or to `lp/metrics.py`.

## 2. Facts (2026-11-19, from live source)

- **F1 · The run-log is git-ignored.** `registry.Env.runlog` = `.cache/models/run-log.jsonl` (`registry.py:44`); `.gitignore:21` ignores `research/learned-projection/.cache/`. (Hence 2b's committed marker.)
- **F2 · The season code holds 2025 only through `require`.** `season_models.fold` calls `registry.require(name, T, "season", env)` for T ≥ 2019 (`season_models.py:318-322`) and has no guard of its own; `require(·, T ≥ 2025)` raises `ConfirmationHeld` only until all four layers are stamped (`registry.py:173-186`). They are stamped, so `require(·, 2025)` passes today (2b-1b F5, flag 17). `weekly_data.guard` (`weekly_data.py:31-34`) is the only remaining hold; `season_prior.derive` calls it first (`season_prior.py:59`).
- **F3 · The boundary is one module attribute.** `weekly_data.LAST_SEASON = 2024` is read at call time by `guard`, `trim`, `trim_frame`, `assert_trimmed`, `seasons()`; `fold_w` asserts every selected row S ≤ `LAST_SEASON` (`weekly_models.py:296-305`); `targets_at` and `season_prior.fallback` call `guard(S)` without `confirm` (`weekly_data.py:115-116`, `season_prior.py:165`). A held season > 2024 is reachable only by raising `LAST_SEASON`; then `guard(held)` passes without `confirm`, and `confirm=True` would only switch the guard off for T > held — never passed (§5).
- **F4 · No 2025 product exists.** `weekly-inputs.pkl` holds S 2018–2024; `season-prior.jsonl`, `season-preds.jsonl`, `weekly-preds.jsonl` hold T ≤ 2024; `weekly-fits.pkl` keys T 2019–2024. A held-season run derives the prior, builds the inputs and fits both weekly layers itself.
- **F5 · The existing builders the path calls or copies** (call order in §6.2):
  - season prior and totals: `season_prior.derive` (`season_prior.py:54-88`) runs `season_models.fold` plus its exact compose check; returns the composed frame (`share`, `games`, `ppg`, `total`, `c`, `kv_*`) with `pr_<t>`, `pr_gamesShare`, `era`, `lam`, `g`, `alpha_<t>`;
  - weekly inputs for one season: `run_weekly_inputs.py:237-249` (step 6);
  - weekly fold: `run_weekly_models.py:263-337` (parity `:256-260`, preds merge `:329-331`, `TOL` `:67`, `_threads` `:157-159`);
  - season evaluation: `run_season_models.py:127-135`; `evaluate.evaluate` writes `chosen` only with `details` (`evaluate.py:110-111`).
- **F6 · The development numbers to reproduce for 2024.**
  - Season: `results[pos][cand]["labels"][bench]["dByFold"]["2024"]` in the s2a dev panel; it is `rs.per_fold_mean(...)` point = the fold's plain mean of |e_c| − |e_b| (`bootstrap.py:50-58`), the same number as `pooled_mean`'s point with one fold (`bootstrap.py:44`). Chosen entries: `results[pos][cand]["chosen"]["2024"]["entry"]` (read by `season_prior.dev_entries`).
  - Weekly: per-row predictions in `weekly-preds.jsonl` (`pid, S, w, position, T, cand, cond, ppg, p, uncond, c_w, noPrior`); fit facts `fit[cand]["2024"][pos]` in the s2b1b dev panel, from `Fits.pos[P].facts` (`weekly_models.py:233-234`) — H per target under `facts["targets"][t]`: `k`, `kGames`, `rho`, `alpha`, `medE`, `kMult`; plus `cW`, `phi`; G `cW`, `phi`, per target `iter`.
- **F7 · Cost:** about 40 min per rehearsal (season folds 466 + 353 s, weekly 128 + 360 s, inputs ~30 s, build 72 s).
- **F8 · 2025 bytes before the trim** (2b-1a F8): the loaders parse every row and `require` hashes the gamelogs; none reaches a table past the trim.
- **F9 · The synthetic panel.** `synth_weekly.make_weekly_panel()` spans 2012–2021; every player's last season is 2019 or 2021 (`synth_weekly.py:76-77`). `tests/e2e_w.py` builds its caches with `LAST_SEASON` patched to 2021 and the panel's last season; its benchw adds a stand-in L + 1 copy.
- **F11 · `CLAUDE.md` is 24,126 bytes** (ceiling 25,000).
- **F12 · `dstd_<t>` / `drec_<t>` are differences.** `attach_prior` sets them to `std_<t> − pr_<t>` and `rec_<t> − pr_<t>` (`weekly_data.py:479-482`); they sit near 0, so a relative measure |d| / (1 + |x|) inflates a small `pr_` gap there. They are in `priorCols` (`spec_w.py:43-46`).

## 3. Rulings

### 3.1 Binding (Anton's LP-2b-2 brief, 2026-11-19, verbatim)

> - Anton 2026-11-16 — weekly labels: RB and WR labelled, QB and TE report-only; overall 3-of-4 weekly gate printed, expected to fail by construction. Season labels per LP-1a §8 for all four positions.
> - Anton 2026-11-17 — G pins: OMP/VECLIB/OPENBLAS/MKL threads = 1 before numpy/sklearn import, PYTHONHASHSEED=0 (re-exec), all recorded in artifact and run-log. Stated limit: G reproducible only approximately; H exact.
> - Anton 2026-11-19 — proceed with the registered candidates (no new candidate, no re-registration). Stated limits to carry into the verdict and README: (1) season λ for RB under H was still falling at the grid edge in training error (6/6 folds, mean 1.19%; a training-error drop, not a test result); (2) season α / k-multiple / δ edges have no recorded error. Wider season grids belong to the off-season model work, tested on the 2026 season.
> - One-shot mechanics: a start marker and a run-log entry are written and committed (or otherwise made durable — state how) before the first 2025 fit; the runner refuses if either exists. require(·, 2025) / weekly_data.guard / registry locks all checked before any 2025 row is read. No code change after the marker; a defect found after it is a stop for Anton, never a rerun.
> - Caches read by SHA only (2b-1a season-prior, weekly-inputs; 2b-1b weekly-preds, weekly-fits), never regenerated.
> - A full dry run on a synthetic 2025 stand-in (never real 2025) proves the whole path end to end before the real run; the real run is a separate, explicitly approved step.

### 3.2 Anton, 2026-11-19 (verbatim)

> 1. Split approved: LP-2b-2a (confirmation path rehearsed on 2024, held season as a setting, H exact / G within 5% with same chosen settings, plus synthetic end-to-end; no marker, no verdict) now; LP-2b-2b outline only, planned after 2a is verified. Readiness rule for 2b (Anton, 2026-11-19): a candidate and position are ready to shadow only if the candidate beats both benchmarks at that position on 2019–2024 (LP-1a §8 labels) and on 2025 the paired difference d is below 0 against both — the pre-registered confirmation clause, per position; no new threshold. For 2b's outline: the marker commit is pushed to origin before the first 2025 fit (pre-approved by Anton for that single push), closing the local-reset gap. Write and review the 2a plan at full depth with opus.

### 3.3 Carried
LP-2a R1 (2025 held), LP-1a §8 unchanged; 2b-1b §3.2 bullets (caches by SHA, no re-registration, no edit to a season-hashed or 2b-1a path); the module-import rule (2b-1b §4: `import lp.x as x`, so `mock.patch.object` sees every call); the 2b-1a §20 G rules (same-run compose check exact; comparison with another run's file: same chosen entry, numbers within 5% as |d| / (1 + |x|)).

**"Exact" in this file** means |a − b| ≤ 1e-9 · (1 + |b|) with NaN equal to NaN and identical NaN patterns — the `TOL` of `run_weekly_models.py:67` and of `season_prior.check_against_file`'s H branch. **"Within 5%"** means |a − b| / (1 + |b|) ≤ 0.05 (`season_prior.G_REL_LIMIT`).

## 4. Layout (all new; none in a registered path list)

```
lp/confirm.py        boundary, held_inputs, run_held, compare helpers (§5–§7)
run_confirm.py       --rehearse [--write] [--date YYYY-MM-DD] [--resamples N]   (§8)
tests/e2e_c.py       synthetic fixture: L0 = 2020 caches + a dev run; panel season 2021 is the stand-in held season (§14)
tests/test_confirm.py
```
`run_confirm.py` has no option that names a season. 2b adds `--confirm` to the same runner and calls the same `run_held`.

## 5. The held-season boundary (`confirm.boundary`)

`boundary(held)` — a context manager.
- `base = weekly_data.LAST_SEASON` on entry. Refuses (`ValueError`) unless `held in (base, base + 1)`.
- Sets `weekly_data.LAST_SEASON = held` for the body and restores `base` on every exit, including a raise.
- Refuses re-entry (a nested `boundary` raises).
- It is the **only** place in this slice that writes `weekly_data.LAST_SEASON`. No call in this slice passes `confirm=True` (F3), and neither new file contains that literal anywhere, comments and docstrings included — `tests/test_weekly_inputs.py:228-236` fails on it: inside the body `guard(held)` passes on its own, and `guard` keeps refusing any T > held.

With `held == base` (the rehearsal) it changes nothing; with `held == base + 1` (the synthetic stand-in; 2b's 2025) it is the unlock F3 describes.

## 6. The path (`confirm.run_held`)

### 6.1 Signature
`run_held(tables, store, cache, specs_s, specs_w, held, benchw, env, env_w, B, log=…)` → `Held` (a plain class) with: `derived` {name: frame}, `rows` {name: new held-season input frame}, `preds` {name: frame}, `fits` {name: Fits}, `season` (`evaluate.evaluate` result), `weekly` (`evaluate_w.labels` result), `wk` (the merged weekly frame), `gaps` (compose gaps), `seconds`.
- `tables`: built by the caller with `extra.build_extras(last=held)`, already `weekly_data.trim(…, last=held)`-ed.
- `store`: `season_models.Store(tables, keys, weights, specs_s["H"])`.
- `cache`: {name: frame} from `weekly-inputs.pkl` (SHA checked by the caller).
- `benchw`: already `trim_frame(…, last=held)`.

### 6.2 Steps, in this order
1. **Before anything:** `weekly_data.assert_trimmed(tables, last=held, frames=[benchw, *cache.values()])`; then for both names `registry.require(n, held, "season", env)` and `registry.require(n, held, "weekly", env_w)` (through the module). A raise propagates.
2. Enter `boundary(held)`. Everything below runs inside it.
3. **Season prior and totals.** For H then G: `season_prior.derive(store, n, specs_s[n], held, env=env, gaps=gaps)` → `derived[n]` (rows T = held only).
4. **Weekly inputs for S = held:** `held_inputs(tables, store, held, derived)` (§6.3) → `rows[n]`.
5. **Frames.** `frame[n] = concat(cache[n][cache[n]["S"] < held], rows[n])`, `ignore_index=True`. Assert identical column lists and dtypes between the two parts first; raise on a mismatch. Cache rows with S ≥ held are kept aside (the rehearsal compares them, §7) and never enter `frame`.
6. **History and benchmarks.** `hist = weekly_h.history(tables, store, range(spec_w.TRAIN_FROM, held + 1))`; `wf = baselines.build_weekly_frame(tables, seasons=range(splits.FIRST_TRAIN_SEASON, held + 1))`; `wk = baselines.weekly_forecasts(wf, held, None, benchw)`; `rel = weekly_models.train_relevant(wf, held)`.
7. **Runtime checks on the new rows** (raise `confirm.CheckError` on a miss, before any weekly fit): `weekly_models.n0_check(rows[n], derived[n], store, TOL) <= TOL` and `max(weekly_h.crosscheck(rows[n], hist).values()) <= TOL` for both names.
8. **Weekly fold.** For H then G: `weekly_models.fold_w(frame[n], held, store, n, specs_w[n], rel, hist, env=env, env_w=env_w)` with default masks (trains on `TRAIN_FROM ≤ S < held`, predicts S = held) → `preds[n]`, `fits[n]`.
9. **Season evaluation.** `sf = evaluate.build_frame(tables, [held], {"h": derived["H"], "g": derived["G"]})`; `season = evaluate.evaluate(sf, (held,), B)` — no `details` (optional; `derive` does not return `fold`'s details and `season_models.fold` is never called a second time). The chosen entry per position is read from `derived[n]`'s `era`, `lam`, `g` columns.
10. **Weekly evaluation.** `wk = merge_preds(wk, preds)` — a function of `lp/confirm.py`, a **copy** of `run_weekly_models.py:329-331` (§11; `fold_w` returns one frame per name, so `pd.concat(preds[n], ignore_index=True)` becomes `preds[n]`): each name's `pid, S, w, cond, p` renamed to `h`/`g` and `h_p`/`g_p`, left-merged on (pid, S, w); then `weekly = evaluate_w.labels(wk, (held,), B)`.
11. Leave the boundary; return.

`run_held` logs seconds per step and writes no file.

### 6.3 `held_inputs(tables, store, S, derived)` — a copy (§11)
A **copy** of `run_weekly_inputs.main` step 6's loop body for one season S (`run_weekly_inputs.py:237-249`, from the `fallback` line to the `append`), with `T` → `tables`, `seas` → `[S]`, and the `mu_range` bookkeeping dropped:
`fb = season_prior.fallback(tables, store, S)`; the in-universe schedule of `asof.view(tables, S, 0)`; `bio = weekly_data.bio_block(tables, store, S, sorted(pids))`; for each `w` in sorted weeks: `n = w − 1`, `mu = era_w.mu_std(tables, store, S, n)`, `fr = weekly_data.inputs_at(tables, store, S, n, spec_w.inputs_spec(), bio)`, `tg = weekly_data.targets_at(tables, fr[["pid","S","w","position"]], store)`, per name `pd.concat([weekly_data.attach_prior(fr, derived[n], fb, mu, store, spec), tg.drop(columns=["pid","S","w"])], axis=1)`. Returns {name: frame} in the same row order as the 2b-1a cache.

## 7. The rehearsal comparison (`confirm.compare_*`, run only by `--rehearse`)

All comparisons are on held = 2024. Each returns the per (cand, position[, column]) `maxAbs` / `maxRel` it saw; a miss raises `confirm.RehearsalMismatch` naming the cand, position, column and first key.

| # | What | Against | H | G |
|---|---|---|---|---|
| R1 | `derived[n]` composed values (`share`, `games`, `ppg`, `total`, `c`, `kv_*`), pid set, NaN pattern | `season-preds.jsonl` rows `cand`, `T` = 2024, no `arm` | exact | same chosen entry per position as `season_prior.dev_entries(<s2a dev panel>)[(g, 2024, pos)]` (exact); numbers within 5% |
| R2 | `derived[n]` `pr_<t>`, `pr_gamesShare` | `season-prior.jsonl` rows `cand`, `T` = 2024 | exact | within 5% |
| R3 | `rows[n]` vs the cache rows S = 2024 | same identity columns in the same order (both) | every column exact | every column outside `priorCols` exact (`std_<t>`, `rec_<t>` included); `pr_<t>`, `pr_gamesShare` within 5%; `noPrior` exact; `dstd_<t>`, `drec_<t>` (F12): absolute gap ≤ the absolute gap of the matching `pr_<t>` on the same row + 1e-9 · (1 + |x|) |
| R4 | `preds[n]` (`cond`, `ppg`, `p`, `uncond`, `c_w`, `noPrior`), same (pid, S, w) set | `weekly-preds.jsonl` rows `cand`, `T` = 2024 | exact | within 5% |
| R5 | `fits[n].pos[P].facts` | s2b1b dev panel `fit[cand]["2024"][P]` | per target `facts["targets"][t]` `k`, `kGames`, `rho`, `alpha`, `kMult`, `medE`, and `cW`, `phi`: equal (`alpha` `"off"` compares as a string) | `phi` equal; `cW` within 5% |
| R6 | `season[pos][cand]["labels"][bench]["d"]["value"]` for B2 and B1c | s2a dev panel `dByFold["2024"]` | exact | reported only |
| R7 | `weekly[cand][pos][bench]` `n`, `candMae.value`, `benchMae.value`, `d.value` for STD and B1c | `evaluate_w.labels` on the same `wk` with the `weekly-preds.jsonl` T = 2024 predictions merged instead, folds (2024,) | equal (exact) | reported only |

R6–R7 prove the one-fold scoring; R1–R5 the forecasts. The G weekly frame's `pr_` columns differ from the cache by R2's gap, and `dstd_`/`drec_` by the same gap in absolute terms (F12); R4's G gap is reported and checked at 5%, never tuned. G `phi` "equal" is Anton's "same chosen settings"; a different φ is a §12 stop, reported with both Brier rows.

## 8. Runner (`run_confirm.py --rehearse`)

- **Thread pin** — a copy (§11) of `run_weekly_models.py:16-35` at the top (pin block plus the `__main__` `_ensure_hash_seed()` call), before any other import: `THREAD_VARS` = "1", `_SKLEARN_PRELOADED`, `_NUMPY_PRELOADED`, `_ensure_hash_seed(execv)` under `__main__`. `_threads()` — a copy (§11) of `run_weekly_models.py:157-159` reading **this** module's pre-import flags (importing `run_weekly_models._threads` would report that module's flags).
- **`Deps`** (every field patchable): `task_file` (LP-1a), `anchor`; `load_meta`, `load_benchw_meta`, `load_cache`, `load_teamctx`, `load_extras(last)`, `load_benchw`; paths and SHAs of the five caches and the two dev artifacts (§0 anchors); `env`, `env_w`, `section_sha`; `expected_last` (default `splits.CONFIRM_FOLD − 1` = 2024) and `panel_to` (default 2025) — the two literals of steps 2–3, patchable so the synthetic fixture (L0 = 2020, panel to 2021) can pass them; `out_dir`, `runlog` (bool).
- **Imported, not copied:** `run_weekly_models._clean`, `_read_prior`, `_registration`.

**Steps, in this order.** Every failure returns 2 via `_stop`, with no artifact written: step 3's `require`/`section_hash` calls sit in their own `try` (as `run_weekly_models.py:229-236`) catching `registry.NotRegistered`, `registry.ConfirmationHeld`; steps 4–7 run inside one `try` that turns `AssertionError`, `ValueError`, `KeyError`, `registry.NotRegistered`, `registry.ConfirmationHeld`, `spec_wm.NoTrainingRows`, `confirm.RehearsalMismatch`, `confirm.CheckError` and `season_prior.PriorCheckError` into `_stop(<type>: <message>)`.
1. **Prereg hash** of the LP-1a file — before any load.
2. **Anchors, before any registry access or cache read:** panel meta `generatedAt` and `to == panel_to`; benchw meta `panelGeneratedAt` and `c2`, `c3`, `c6`; the five cache SHAs and the two dev-artifact SHAs (each file must exist).
3. **Locks.** `registry_w.section_hash` equals `section_sha` for both names (skipped when `section_sha` is None, as `run_weekly_models`); `registry.require` season and weekly for both names and every T in `splits.DEV_FOLDS` that is ≤ `weekly_data.LAST_SEASON`; both weekly specs have `lastSeason == weekly_data.LAST_SEASON == expected_last` and `trainFrom == spec_w.TRAIN_FROM`. `held = weekly_data.LAST_SEASON` (2024) — the rehearsal has no other source for it. **One rehearsal:** if the run-log holds a `confirm-rehearsal` entry, return 2 unless `--again "<reason>"` is given; the reason is written into the new entry. `--again` is used only after Anton's ruling (§12).
4. **Load and trim at held.** `panel = load_cache()`; `meta = panel.meta` (kept, as `run_weekly_models.py:249` keeps `pmeta`; it feeds `parity` and the `Store`'s keys and weights — `load_meta()` is only step 2's anchor source); `tables = weekly_data.trim(asof.Tables.from_panel_full(panel, load_teamctx(), load_extras(held)), last=held)`; drop the untrimmed references; `assert_trimmed`; `confirm.parity(tables, meta)` — a **copy** (§11) of `run_weekly_models.py:256-260` returning `(rows, mismatches)`; any mismatch stops. `benchw = trim_frame(load_benchw()[0], last=held)`.
5. **Caches.** `cache = pd.read_pickle(inputs_path)` — our own git-ignored cache, read only after its SHA-256 matched the anchor in step 2 (as `run_weekly_models`); the other caches are read only by §7's comparisons.
6. **Run-log entry** `{mode: "confirm-rehearsal", at, date, held, threads, again}` (when `runlog`), then `run_held(...)`.
7. **Compare** R1–R7.
8. **Budget:** over 2 h total returns 2.
9. **Output.** Prints a summary (per R-check maxima, seconds, threads). With `--write`, writes `backtests/<date>-learned-s2b2a-rehearsal.json` (§9). Writes nothing else; no cache, no verdict, no candidate file.

## 9. Artifact (`backtests/<date>-learned-s2b2a-rehearsal.json`, ≤ 1 MB, unregistered — the Invariant 3 exception, no commit id)

`slice`, `date`, `preregHash`, `held` (2024), the label "rehearsal — 2024 re-run through the confirmation path; not a result"; per R-check and (cand, position): `maxAbs`, `maxRel` and pass; R5's chosen settings side by side; R6/R7 numbers side by side; seconds per step (the budget basis for 2b); threads; versions; `sha256` of the five caches, both dev artifacts and both candidate files; `registration` (as `run_weekly_models._registration`, imported); the stated limits: G approximate (H exact), the 2b-1a §20 G history, the two 2026-11-19 season-grid limits (§3.1). R6/R7 are a wiring check: the artifact prints no label and no gate; this slice writes no verdict.

## 10. (folded into §9)

## 11. Copied definitions

| Copy | Original | Test |
|---|---|---|
| `confirm.held_inputs` | `run_weekly_inputs.main` step 6 loop body (`run_weekly_inputs.py:237-249`) | T-R-2 |
| `run_confirm` `THREAD_VARS`, pin loop, `_ensure_hash_seed` | `run_weekly_models.py:16-35` (itself a copy of `run_weekly_inputs.py`) | T-R-8 |
| `run_confirm._threads` | `run_weekly_models.py:157-159` | T-R-8 |
| `confirm.parity` | `run_weekly_models.py:256-260` (scoring parity on trimmed tables) | T-R-9 |
| `confirm.merge_preds` | `run_weekly_models.py:329-331` (preds merged onto `wk`) | T-R-9 |

Everything else is imported (`run_weekly_models._clean`, `_read_prior`, `_registration`). No cross-repo copy.

## 12. Stops (report to Session 1, never improvise)

- **Scope:** a need to touch §1 **Out**; a registered function whose return lacks what §6 needs (do not work around it).
- **For Anton:** any cache or dev-artifact SHA off its anchor; any R-check miss on the real rehearsal (report every maximum; never loosen a tolerance, never re-run to get a pass — `--again` only after Anton's ruling; the runner only refuses a repeat without a recorded reason (§8 step 3), the ruling itself is process); a `CheckError` or `PriorCheckError` on real data.
- **Budget:** over 2 h for the rehearsal, 1 MB for the artifact.
- **Other:** any open design question.

## 13. Done-definition

1. **Commit A** — `lp/confirm.py`, `run_confirm.py`, `tests/e2e_c.py`, `tests/test_confirm.py`, this file. Before committing: the full Python suite (`python3 -m unittest discover -s research/learned-projection/tests -t research/learned-projection`) green, every §14 test shown red and restored.
2. **Commit B** — run `python3 research/learned-projection/run_confirm.py --rehearse --write` **once**; commit the artifact and docs:
   - research README (path, rehearsal, result, limits); repo README Module notes LP row; `data-catalog.md` Non-served artifacts;
   - `CLAUDE.md` LP row: append `2b-2a = lp/confirm.py + run_confirm.py, rehearsal only`, keeping the file under 25,000 bytes (F11; prune in the same commit if needed).
   `npm test` and `npm run smoke` green. No served-folder or `manifest.json` change.
3. Stage by name. No push, no rebase.

**Hand-back:** SHAs, files, deviations, run-log tail, R-check maxima, seconds, threads; per test: assertion, defect, Fact, red seen.

## 14. Tests (`tests/test_confirm.py`; each shown red once, then restored; every Fact asserted in `setUp`/`setUpClass`)


**Fixture `tests/e2e_c.py`** (new; may import `tests/e2e_w.py`, `synth_weekly`, `synth_season`, `synth_wmodels`, never edits them; built once per process):
- `L0 = 2020`. Panel = `synth_weekly.make_weekly_panel()` (2012–2021); season 2021 is the stand-in held season (F9).
- **Specs and base (own, not `e2e_w`'s, flag 3):** season spec `e2e_w.season_spec(n)`; weekly spec `weekly_spec_c(n)` = `swm.small_spec_w(n)` with `lastSeason = L0`; `fake_require_c` returns these; `make_base_c()` calls `e2e_w.make_base()` with `e2e_w.weekly_spec` patched to `weekly_spec_c` (no copy, `tests/e2e_w.py:65-78`).
- **Caches:** one `run_weekly_inputs.main(["--check"])` with `LAST_SEASON` patched to `L0` and `registry.require` patched (as `e2e_w.build`) → `weekly-inputs.pkl`, `season-prior.jsonl`.
- **Benchw:** as `e2e_w.build`'s random rows, over every panel season (2021 included; no extra copy).
- **Season dev stand-in (flag 3):** with `LAST_SEASON = L0` and `require` patched, `store` on the tables trimmed at `L0`; for T in (2018, 2019, `L0`) and both names, `fr, out = season_models.fold(store, n, season_spec(n), T)`; the composed rows are written as a stand-in `season-preds.jsonl` in `run_season_models`' row format (`cand` lowercase, no `arm` rows); `evaluate.evaluate(evaluate.build_frame(tables_L0, folds, {h, g}), folds, 60, details={c: {T: out["details"]}})` is written as `{"results": …}` (through `run_weekly_models._clean`) — the stand-in s2a panel, carrying `dByFold` and `chosen`.
- **Weekly dev stand-in:** one `run_weekly_models.main(["--dev","--write","--resamples","60"])` with `LAST_SEASON = L0`, `require` patched to `fake_require_c`, every `Deps` path in a temp folder → `weekly-preds.jsonl`, `weekly-fits.pkl`, the stand-in s2b1b panel.
- `rehearse_deps(**over)` points every `run_confirm.Deps` field at these files with their SHAs, `expected_last = L0`, `panel_to = 2021`, `section_sha = None`, `load_meta` returning `{generatedAt: ANCHOR, to: 2021}`, and `env`/`env_w` at a **fresh** `make_base_c()` on every call (Rev2-3). Every `rehearse_deps` run patches `registry.require` with `fake_require_c` (temp candidates are untracked; the `e2e_w` rule); T-R-7's failure case patches it to raise; a test that needs two runs on one base passes `base=` explicitly.
- **`RecC`** (flag 4, Rev2-1): wraps a callable and records, per call and **per argument position/name**, the maximum season seen in that argument: a DataFrame's `S` (else `T`) column; an `asof.Tables`' `weeks`, `teams`, `seasons`, `bench`, `teamctx`, `extras`; a `season_models.Store`'s `.tables` likewise.
- **setUpClass Facts:** the panel has played rows of S = 2021 at every position; the caches' max S is `L0`; the stand-in s2a panel has `chosen[str(L0)]` and `dByFold[str(L0)]` for both candidates; H's stand-in `season-preds.jsonl` rows at T = `L0` equal the cached prior's composed values exactly.

### T-R-1 · Boundary
- **Asserts:** inside `boundary(L0 + 1)`, `LAST_SEASON == L0 + 1`; after a normal exit and after a raise inside, `LAST_SEASON == L0`; `boundary(L0 + 2)` and `boundary(L0 − 1)` raise; nested entry raises; outside, `weekly_data.guard(L0 + 1)` raises `ConfirmationHeld`; inside `boundary(L0)`, `weekly_data.guard(L0 + 1)` raises (no call passes `confirm`, flag 9).
- **Fails if** the unlock outlives the body or widens past held. **Red:** remove the restore on the exception path.
- **Fact:** `LAST_SEASON == L0` under the patch in setUp.

### T-R-2 · `held_inputs` equals the 2b-1a builder (copy)
- **Asserts:** for each S in 2018..L0 and both names, `held_inputs(tables_L0, store, S, prior_from_cache)[n]` equals the fixture cache's rows of S — same columns, order, dtypes, every value exact.
- **Fails if** the copy drifts from `run_weekly_inputs` (e.g. week origin or fallback). **Red:** use `n = w` instead of `w − 1`.
- **Fact:** each S has ≥ 2 weeks with a non-zero form column, and ≥ 1 `noPrior = 1` row overall.

### T-R-3 · Rehearsal reproduces the dev fold (synthetic)
- **Asserts:** a clean `run_confirm.main(["--rehearse","--write"], deps=rehearse_deps())` returns 0; the artifact's R1–R7 entries all pass; H maxima ≤ 1e-9 relative. Then, each in its own run with a fresh base and the stand-in file's SHA updated in deps (flag 5 — every perturbation stated in the check's own measure m = |Δ| / (1 + |x|)):
  - one H `ppg` in the stand-in `weekly-preds.jsonl` moved so that m = 1e-6 → returns 2, message names R4 and `h`;
  - one G `cond` moved so that m = 0.06 → returns 2 naming R4 and `g`;
  - one G `cond` moved so that m = 0.01 → returns 0;
  - one G chosen entry changed in the stand-in s2a panel (`chosen[str(L0)][pos]["entry"]["lam"]` to another grid value) → returns 2 naming R1.
- **Fails if** a comparison is skipped or uses the wrong tolerance per candidate. **Red:** apply the 5% limit to H as well.
- **Fact:** on each perturbed row, setUp computes the check's own measure |a − b'| / (1 + |b'|) between the clean run's value a and the perturbed file value b' (the form of `season_prior.py:139-140`) and asserts it is > 0.05 for the 0.06 case, ≤ 0.05 for the 0.01 case, > 1e-9 for the H case; each move is made in the direction of the row's existing gap.

### T-R-4 · No row past the held season reaches anything (rehearsal)
- **Asserts:** a successful `--rehearse` with every one of `season_models.fold`, `season_prior.derive`, `weekly_data.inputs_at`, `weekly_data.targets_at`, `weekly_models.fit_w`, `weekly_models.predict_w`, `baselines.weekly_forecasts`, `evaluate.evaluate`, `evaluate_w.labels` wrapped by `RecC`, the run returns 0 (asserted first), then: every argument's recorded maximum is ≤ `L0`; `fit_w`'s first argument (`frame_tr`) is < `L0` on every call; each wrapped callable was called ≥ 1 time.
- **Fails if** a held row (2025 in the real run) reaches a table, fit or metric. **Red:** in step 4 trim tables and benchw with `last = held + 1` **and** patch `weekly_data.assert_trimmed` module-wide to a no-op (both the runner's and `run_held`'s calls), so the run returns 0 and only the recorder can catch it.
- **Fact:** the panel and benchw hold rows of S = `L0 + 1` (setUpClass); a `RecC` call on the untrimmed `Tables` records `L0 + 1` (the recorder can see it).

### T-R-5 · Synthetic stand-in end to end (held = L0 + 1, through `run_held`)
- **Asserts:** with tables trimmed at `L0 + 1`, the fixture's caches (max S = `L0`) and `require` patched, `run_held(…, held = L0 + 1, …)` returns; `derived[n]["T"]` all `L0 + 1`; `preds[n]` rows all S = `L0 + 1`; `fit_w`'s first argument (`frame_tr`, `RecC`) has max S = `L0` on every call; `season["folds"] == [L0 + 1]`; `weekly` has all four positions for both candidates; `LAST_SEASON == L0` after the return and `weekly_data.guard(L0 + 1)` raises again.
- **Fails if** the path cannot reach a season past the last training season, or trains on it. **Red:** pass `train` = (S ≤ held) to `fold_w` in step 8.
- **Fact:** the new `L0 + 1` rows include played rows with finite `r_<t>` at every position.

### T-R-6 · Held-fold evaluation wiring (synthetic)
- **Asserts:** in T-R-3's clean run, R6 matched each H season `d` (B2, B1c, every position) with the stand-in `dByFold[str(L0)]` and R7 each H weekly `n`, `candMae`, `benchMae`, `d` with `evaluate_w.labels` on the dev predictions — both exact; a run with the red applied returns 2 with a message naming R6 (not a traceback, flag 8).
- **Fails if** `run_held` scores the wrong candidate, fold or rows. **Red:** swap the candidates in step 9 (`{"h": derived["G"], "g": derived["H"]}`).
- **Fact:** at `L0`, H and G totals differ on ≥ 1 row per position, and the stand-in `dByFold[str(L0)]` differs between `h` and `g` for ≥ 1 (position, benchmark).

### T-R-7 · Runner order, refusals and writes
- **Asserts:**
  - a wrong prereg hash returns 2 with `load_meta`, `load_cache` and `registry.require` never called (counters);
  - each wrong SHA (five caches, two dev artifacts) or a missing file returns 2 before `registry.require` and `load_cache`;
  - a `require` failure (`NotRegistered`) at step 3 returns 2 (not a traceback) with no run-log entry and no `fold_w` call;
  - a weekly spec with `lastSeason != expected_last` returns 2;
  - `run_held` patched to raise each of `AssertionError`, `ValueError`, `ConfirmationHeld`, `spec_wm.NoTrainingRows` — each on its own fresh base — returns 2, writes no artifact, and the patch's call counter shows `run_held` was entered once (flag 8, Rev2-3);
  - after a successful run, every cache and dev-artifact file's SHA is unchanged, the out folder holds only the artifact, and the run-log gained exactly one `confirm-rehearsal` entry with `held == L0`, the thread record and `again: null`;
  - a second `--rehearse` on the same base (`base=` passed) returns 2 before `load_cache`; `--rehearse --again "test"` returns 0 and its entry carries `again: "test"` (flag 10);
  - `run_confirm.main(["--rehearse","--held","2025"])` exits through argparse (SystemExit 2).
- **Fails if** a check runs after a load or a write, or a second rehearsal runs silently. **Red:** (a) move step 2's SHA loop after step 4; (b) remove the run-log refusal — each shown separately.
- **Fact:** with all checks passing, `load_cache` is called exactly once; before the second run the base's run-log holds one `confirm-rehearsal` entry.

### T-R-8 · Pins and `_threads` (copies)
- **Asserts:** `run_confirm.THREAD_VARS == run_weekly_models.THREAD_VARS`; the pin loop and `_ensure_hash_seed` source equal `run_weekly_models`' (whitespace-normalised); in a subprocess with every `THREAD_VARS` entry "8" (as `tests/test_weekly_inputs.py:243-249`) importing `run_confirm`, every `threadpoolctl.threadpool_info()` entry has `num_threads == 1`; `_ensure_hash_seed` with a fake `execv` re-executes once when `PYTHONHASHSEED != "0"` and not when it is; `run_confirm._threads()` has exactly `run_weekly_models._threads()`'s keys, and its `numpyPreloaded` follows `run_confirm._NUMPY_PRELOADED` (patched True, then False).
- **Fails if** a G fit can run multi-threaded or unseeded, or the record reports another module's flags. **Red:** move the pin loop below `import numpy`.
- **Fact:** `os.cpu_count() > 1`; the subprocess reports ≥ 1 threadpool.

### T-R-9 · `parity` and `merge_preds` (copies)
- **Asserts:** the normalised source of `confirm.parity`'s body and of `merge_preds`' body each contain the original lines `run_weekly_models.py:256-257` and `:329-331` read from that file at test time (whitespace-normalised; renames listed in the test, plus the one substitution `pd.concat(preds[n], ignore_index=True)` → `preds[n]` — so a drift in the original is seen); `confirm.parity(tables, meta)` equals `score.parity` called as those lines do, on the fixture's trimmed tables (0 mismatches) and after one played row's `pts` is raised by 1 (1 mismatch); `confirm.merge_preds(wk, preds)` equals the merge those lines perform on the stand-in dev predictions (every column, `check_exact=True`).
- **Fails if** either copy drifts. **Red:** (a) drop `[:, order]` in `confirm.parity`; (b) merge `ppg` instead of `cond` — each shown separately.
- **Fact:** `order` is not the identity permutation (the setUp reverses the meta's `weights` key order if the fixture's happens to be); `ppg != cond` on ≥ 1 stand-in prediction row.

## 15. Real-data rehearsal acceptance (Commit B)

Passes when: rc 0; R1–R3 (G at 5%), R4 H, R4c, R5–R7 pass (Fix pass 1); within budget; every cache SHA unchanged (re-hashed after); exactly one new `confirm-rehearsal` run-log entry, `held: 2024`; no label or gate printed. A miss is a §12 stop.

## 16. Later (outline only) — LP-2b-2b, the one-shot 2025 run

Planned after 2a is verified and signed off. **Frozen from 2a:** `lp/confirm.py` byte-identical (2b pins its SHA-256 and checks it before the marker); `run_confirm.py`'s pin block, existing `Deps` fields and `--rehearse` path. 2b adds only `--confirm`, new `Deps` fields, new functions and its own tests.
- **`--confirm`:** held = `LAST_SEASON + 1` = 2025; tables loaded with `load_extras(2025)`, trimmed at 2025; the same `run_held`.
- **Marker:** a tracked file holding time, HEAD, the SHA-256 of both 2a files and every registered path, cache SHAs, threads; committed by name and **pushed to origin before the first 2025 fit** (Anton's single pre-approved push, 2026-11-19; 2b's code is pushed first; rebase and push-guard handled in 2b), plus a `confirm-2025` run-log entry. Refuses if the marker is in the working tree, any local or remote history, or the run-log, or any hashed path differs from HEAD.
- **Order:** §8 steps 1–3, `require(·, 2025)` for both layers and `weekly_data.guard(2025)` raising outside the boundary → marker, push, run-log → first 2025 row past the trim. No code change after the marker; a defect is a stop for Anton, never a rerun.
- **Readiness** (§3.2): per candidate and position, season vs B2 and B1c, weekly vs STD and B1c (RB/WR labelled); `metrics.confirm(dev_label, d_2025)` (`metrics.py:73-77`); ready only if the dev labels beat both and d_2025 < 0 against both.
- **Verdict:** plain language first; 2025 beside 2019–2024; readiness; every limit (G approximate / H exact; the two season-grid limits; LP-1a F3's 2025 week-1 depth chart favouring weekly B1c; B1c outcome-conditioned; static positions).
- **Tests:** a second run after the marker refuses (local and pushed); no 2025 row reaches a fit or metric before the push; the synthetic dry run cannot write or push the real marker or read real 2025.
- **The real run** is a separate step on Anton's explicit go-ahead.

## 17. Review disposition

Three full reviews (opus): Rev 1, 12 flags; Rev 2, 11; Rev 2.1, 4 (merge copy anchor, §16 guard, `require` patch, size) — all fixed, the last in Rev 2.2 without a fourth review (Anton). Record: the plan-reviewer log in `.claude/reviews/`.

## Fix pass 1

From the one real rehearsal's §12 stop (2026-11-20: R4 G RB 16.6% > 5%; H exact everywhere; G R1 4.84%, R2 3.97%) and Session 1's diagnostic: G's weekly fold T = 2024 re-fitted on the **cached** 2b-1a inputs matched `weekly-preds.jsonl` bit-exactly at every position. Applier: fix-applier. **Scope:** `lp/confirm.py`, `run_confirm.py`, `tests/test_confirm.py` (and `tests/e2e_c.py` only if a setUp needs it). Nothing in §1 Out. Do **not** run `--rehearse` on real data. Stop and report if an item needs more.

**Ruling (Anton, 2026-11-20, verbatim):**

> R4 G is split. (a) Gate: a G weekly re-fit on the cached S = 2024 season inputs (the cached season-prior.jsonl prior, as in the diagnostic) must match weekly-preds.jsonl T = 2024 exactly; add it to the rehearsal as its own check. (b) The end-to-end R4 G gap becomes report-only, with the stated limit: G's weekly forecasts inherit its season-forecast variation (up to 16.6% at RB in the rehearsal); a same-input re-fit is exact. H is exact everywhere and G's R1–R3 stay at 5%. Write this as Fix pass 1, have fix-applier apply it and implementation-reviewer re-run once, then re-run the rehearsal once with --again and reason 'Anton ruling 2026-11-20'. A G season miss over 5% on the re-run is a stop for me, not a retry

1. **Expose the fold inputs.** `Held` gains `rel` and `hist`; `run_held` step 6 assigns them. Nothing else in `run_held` changes.
2. **`confirm.refit_cached(cache_frame, held, store, spec, rel, hist, env, env_w)`** → `(preds, fits)`: inside `boundary(held)`, asserts `cache_frame["S"].max() == held` (rehearsal only), then `weekly_models.fold_w(cache_frame, held, store, "G", spec, rel, hist, env=env, env_w=env_w)` with default masks — the diagnostic's call.
3. **Check R4c** — `confirm.compare_cached_refit(ck, preds, preds_file, held)`: G only; the same (pid, S, w) set as `weekly-preds.jsonl` `cand == "g"`, `T == held`; `cond`, `ppg`, `p`, `uncond`, `c_w`, `noPrior` **exact** (`TOL`), never report-only.
4. **R4 for G is report-only:** `compare_preds` passes `report_only=(cand == "g")`; H unchanged (exact, fails).
5. **Runner** (`--rehearse`, step 7): after `run_held`, `p, _ = confirm.refit_cached(cache["G"], held, store, specs_w["G"], res.rel, res.hist, deps.env, deps.env_w)`, timed as `seconds["fit G cached"]`, inside the existing step 4–7 `try`; then `compare_cached_refit`. Artifact: R4c entries beside R4, R4 G marked report-only. `STATED_LIMITS` gains: "G's weekly forecasts inherit its season-forecast variation (up to 16.6% at RB in the rehearsal); a same-input re-fit is exact (Anton, 2026-11-20)." The module docstrings say the same.
6. **§15 acceptance** — done by Session 1 in this file (not the applier).
7. **Tests** (each red shown, then restored; Facts in setUp):
   - **T-R-3 changes.** The clean run's artifact holds R4c `g` entries with maxRel ≤ 1e-9 and R4 `g` marked report-only. A G `cond` in the stand-in `weekly-preds.jsonl` moved by m = 1e-6 (the check's own measure, b′) → returns 2 naming **R4c**, no artifact. The former 0.06 / 0.01 G cases become: m = 0.06 → returns 2 naming R4c (not R4). **Red:** compare R4c with `G_LIMIT` instead of `TOL`. **Fact:** m on the perturbed row > 1e-9.
   - **T-R-10 · R4c reads the cache, not the rebuilt rows.** *(Revised by Session 1, 2026-11-20, after the applier's stop: scaling `pr_` alone breaks `run_held`'s check (a), the n = 0 identity.)* `season_models.fit_family` is wrapped (`mock.patch.object`, so `refit`, `run_entry` and `season_prior.prior_refit` all see it) so that for family `"G"` every returned per-target prediction is × (1 + 1e-3) — a consistent stand-in for G's season-fit variation: `derive`'s same-run compose check and check (a) stay exact, R1/R2/R3 stay within 5%. **Asserts:** rc 0; R4 `g` maxRel > 1e-9 and report-only; R4c `g` maxRel ≤ 1e-9. **Fails if** the gate check re-fits on the rebuilt frame. **Red:** pass `run_held`'s combined frame (cache S < held + rebuilt rows) to `refit_cached`. **Fact** (setUp, from one wrapped `derive` call at T = `L0`): G's chosen entries equal the unwrapped ones, and ≥ 1 RB `pr_` value differs from the cache by m > 1e-9. If the chosen entries change, use 1e-4 and re-assert; if they still change, stop and report.
   - **Unit:** `compare_preds` on a hand-built pair with a G gap of m = 0.2 records a report-only miss and no failure; with an H gap of 1e-6 records a failure. **Red:** drop `report_only` for G.
8. Full Python suite green; `npm test`, `npm run smoke` green. One commit `LP-2b-2a: fix pass 1 (R4 G split, Anton ruling 2026-11-20)`, staged by name. No push.

**Then (not the applier):** implementation-reviewer once; the real rehearsal once with `--rehearse --write --again "Anton ruling 2026-11-20"`; a G R1–R3 miss over 5%, an H miss or an R4c miss is a stop for Anton, not a retry; then Commit B as §13.

## Fix pass 2

From the full implementation review of `0a0c590..8bae628` (2026-11-20; 0 blocking, 1 should-fix, 3 notes), approved by Anton 2026-11-20 ("Yes, Fix pass 2 first"). Applier: fix-applier. **Scope:** `run_confirm.py` (console text only) and `tests/test_confirm.py`. No change to `lp/confirm.py` or to any computation; nothing in §1 Out; no real `--rehearse`. Stop and report if an item needs more.

1. **Console marks report-only** (flag 1). The pass line reads "rehearsal passed: R1–R3, R4 H, R4c, R5 within tolerance; R4 G, R6 G, R7 G report-only"; every per-check maxima line for a report-only slot ends " (report-only)". Same text on the stop path. No artifact change.
2. **Name the failing entry** (flag 2). `test_g_cond_moved_by_1e6_fails_r4c` and `TestCachedRefit.test_refit_on_the_rebuilt_frame_goes_red` assert the miss line `"R4c g"` (the form the 6% test uses), not the bare `"R4c"`. **Red:** for the first, compare R4c with `G_LIMIT` (as before) — the tightened assertion must go red; re-show it.
3. **The R4c Fact against the re-fit** (flag 3). `_perturbed_preds`' reference value comes from the clean run's **R4c** re-fit predictions (spy `compare_cached_refit`), and setUp asserts on the perturbed row that the re-fit value equals the end-to-end value within 1e-9 on the synthetic fixture (so the measure is valid for both).
4. **Value misses fail the gates** (flag 4) — new unit tests on hand-built frames, each through the real `Checker`:
   - **R1** `compare_season`: a G composed value (`total`) off by m = 0.06 → one miss "R1 g"; m = 0.04 → none; an H value off by 1e-6 → one miss "R1 h". **Red:** pass `limit = 1.0` for G in `compare_season`.
   - **R2**: a G `pr_<t>` off by m = 0.06 → miss "R2 g"; H 1e-6 → "R2 h". **Red:** as R1 for the R2 call.
   - **R3** `compare_inputs`: a G `pr_<t>` off by m = 0.06 → miss; a G non-prior column off by 1e-6 → miss; a G `dstd_<t>` gap ≤ the row's `pr_<t>` absolute gap → none, and 2 × that gap → miss (F12); an H column off by 1e-6 → miss. **Red:** drop the `allowed` argument check (treat `dstd_`/`drec_` as within 5%) — the 2 × case must go red.
   - **R5** `compare_fits`: a G `phi` different → miss; a G `cW` off by m = 0.06 → miss; an H `k` different → miss. **Red:** skip the `phi` comparison for G.
   - **Fact** (each setUp): the measure on every perturbed cell, computed as the check computes it, sits on the stated side of its limit.
5. Show each new or tightened test red with its named step, then restore. Full Python suite, `npm test`, `npm run smoke` (exit code captured, not piped through `tail`) green. One commit `LP-2b-2a: fix pass 2 (tests, console)`, staged by name; do not stage the task file. No push.

**Then (not the applier):** implementation-reviewer once at light depth on the Fix pass 2 diff; then the rehearsal re-run as Fix pass 1 says.

## Verification

Session 1, 2026-11-21. Reviewed the diffs, not the hand-backs alone.

- **Rebase:** onto `origin/main` `f24032c` at 2026-11-21T12:50Z; 6 capture commits taken in (snapshot, schedule, rosterweekly, season-totals); none touches `research/`. Push-time rebase onto `683aac2` (2026-11-21): 2 more capture commits (rosterweekly, playerstats: `manifest.json`, `nflverse/{advstats,gamelogs,rosterweekly}/2026.json`); none touches `research/`. Ids below are after the push-time rebase.
- **Commits** (main, unpushed): `67ddde3` Commit A (path, tests, task file Rev 2.2); `31d8895` Fix pass 1 (R4 G split, Anton 2026-11-20); `461797d` Fix pass 2 (tests, console); `019f73e` Commit B (rehearsal artifact, docs); `fdde5f2` (Fix passes 1–2 text, verification); `LP-2b-2a: sign-off` (sign-off line, these id fixes).
- **The first real rehearsal** (Commit A, 2026-11-20) stopped on R4 G RB, 16.6% against the 5% limit; H exact; G R1 4.84%, R2 3.97%. Session 1's diagnostic (scratch script, read-only): G's weekly fold T = 2024 re-fitted on the cached 2b-1a inputs equalled `weekly-preds.jsonl` bit-exactly at every position. Anton's ruling → Fix pass 1.
- **Reviews:** full implementation review (opus, high) of `0a0c590..8bae628`: 0 blocking, 1 should-fix, 3 notes → Fix pass 2 (Anton). Light re-review of the Fix pass 2 diff: 0 blocking, 0 should-fix, 2 wording notes accepted (the item-3 Fact sits in `_perturbed_preds`; the pass line does not name R6/R7 H). Fix pass 1's T-R-10 was revised by Session 1 after the applier's stop (the `pr_`-only wrap broke check (a)); its red is a permanent negative-control test, judged equivalent by the review.
- **Re-run** (Session 1, `--rehearse --write --again "Anton ruling 2026-11-20"`, on `80f79d3` = pre-rebase Fix pass 2, now `461797d`): rc 0; every check passed — H ≤ 8.3e-15, G exact on every check that run (R1–R4, R4c, R5–R7), 1252 s, threads pinned, `PYTHONHASHSEED=0`; run-log holds two `confirm-rehearsal` entries (`again` null, then the ruling).
- **Deviations accepted:** `Checker` accumulates misses and raises once; the runner prints every maximum on a stop; the prereg test edits a copy of the LP-1a file; the R4 unit test uses a G gap of 2.0 on 5.0 (m = 0.25).
- **Locks after the rebase:** `require` passes for H and G, both layers, 2019–2024; `section_hash` equals `SECTION_SHA` for both; no diff in `candidates/`, registered paths, caches, `manifest.json` or served folders. `require(·, 2025)` passes too, as F2 states — `weekly_data.guard` and 2b's marker are the holds.
- **Checks** (Session 1, post-rebase): `npm test` 2150 pass / 0 fail / 1 skipped; `npm run smoke` exit 0; Python suite 259 OK (the applier's run on `80f79d3`; the rebase changed nothing under `research/`); `CLAUDE.md` 24,192 bytes.
- **Size:** this file is over 40 KB with the two fix passes and this record (Rev 2.2 was 39,988 bytes).

Signed off by Anton 2026-11-21
