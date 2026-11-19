# research/learned-projection — LP-1a scoreboard (research only)

Offline research into whether a learned projection beats the app's hand-tuned one. **Not served, not run by `npm test`, `npm run smoke`
or any workflow; nothing in `bin/`, `lib/` or `scripts/` imports this folder.** Task: `.claude/tasks/learned-projection-1a-harness.md`.

```
node bin/learned.mjs export                                            # Node: the research panel -> .cache/panel/ (git-ignored)
python3 research/learned-projection/fetch_sleeper_projections.py       # Benchmark 4 fetch -> .cache/sleeper-proj/ (the one sanctioned network call besides smoke)
python3 -m unittest discover -s research/learned-projection/tests -t research/learned-projection
python3 research/learned-projection/run_benchmarks.py [--write]        # backtests/<date>-learned-s1a-panel.json + grading/<date>-learned-s1a-verdict.md
```

Python 3.9 with the pins in `requirements.txt`. `lp/score.py` is the only copy of an app/Node definition (the scoring dot-product, task §6);
`lp/asof.py` is the only way baselines read the panel. The `lines` and `oracle-*` arms are enforced there and tested but not run in LP-1a.
`.cache/` is git-ignored and must never be committed. 

## LP-2a — season-layer learned models (H partial pooling, G gradient-boosted trees)

Task: `.claude/tasks/learned-projection-2a-season-models.md`. Python only; needs the LP-1a cache plus `nflverse/gamelogs/` (read-only).

```
python3 research/learned-projection/run_season_models.py --smoke      # 2018 only, nothing registered, nothing written
python3 research/learned-projection/run_season_models.py --register   # stamp candidates/H.json and G.json (season layer); then commit the two files
python3 research/learned-projection/run_season_models.py --dev --write   # development folds 2019-2024 only; the 2025 fold is held (R1)
```

`candidates/<name>.json` holds the machine-readable spec and, once stamped, the code / harness / data hashes (`lp/registry.py`); a test-fold fit
refuses to start unless the file is tracked, identical to `HEAD` and every hash recomputes. `append_layer` adds LP-2b's weekly layer without
touching the season section. `.cache/models/` (git-ignored) holds `season-preds.jsonl` and `run-log.jsonl`. Outputs (unregistered, aggregates only):
`backtests/<date>-learned-s2a-dev-panel.json`, `grading/<date>-learned-s2a-dev-verdict.md`. `lp/spec.py` only builds the spec once; it is not hashed.

## LP-2b-1a — weekly inputs (trim, season prior, rows, targets, features, era blend)

Task: `.claude/tasks/learned-projection-2b1a-weekly-inputs.md`. Python only; the inputs every LP-2b weekly candidate is later registered on. **No model is fitted,
nothing is registered, no forecast is compared with an outcome.**

```
python3 research/learned-projection/run_weekly_inputs.py --check [--write] [--date YYYY-MM-DD]
```

`--check` first trims the held 2025 season out of every table (`lp/weekly_data.py` `trim` / `assert_trimmed`; `LAST_SEASON = 2024` is the single source),
re-derives both candidates' season-layer prediction for 2018–2024 through `season_models.fold` plus a copy of `refit`'s body (`lp/season_prior.py`; a hard check
proves it composes to `fold`'s own rows and is checked against `.cache/models/season-preds.jsonl`: H exactly, G within the stated limit), then builds the weekly rows, outcome targets, as-of features (form, usage,
availability, teammate absence, opponent, team, game, gamelogs, bio) and the in-season era blend (`lp/era_w.py`, `lp/spec_w.py`). It writes
`.cache/models/season-prior.jsonl` and `weekly-inputs.pkl` (git-ignored) and, with `--write`, `backtests/<date>-learned-s2b1a-inputs.json` (facts only, ≤ 1 MB).
A player outside the season universe gets a fallback prior from earlier seasons only. Weekly targets are outcomes by design: `targets_at` is never called by an
input builder.

**The 2025 hold.** `registry.require(·, 2025)` holds 2025 only until both layers of both candidates are registered. After LP-2b-1b's registration it no longer holds
2025 by itself: `weekly_data.guard` (every input builder refuses a season above `LAST_SEASON`) and LP-2b-2's start marker do. Nothing in `lp/` or `run_*.py`
passes the confirm flag.

**Stated limit and the one-thread rule.** LP-2a's G (gradient-boosted) development predictions in `season-preds.jsonl` came from an unrecorded thread count and differ from one-thread refits by up to about 2% on RB (2022 `c`, 2024 `kv_bonus_fd_rb`). `run_weekly_inputs.py` therefore runs every G fit with `OMP_NUM_THREADS=1` (set before sklearn is imported) and `PYTHONHASHSEED=0` (a G fit also varies across processes with the hash seed; the CLI re-executes itself once), records both in the artifact and the run-log, keeps H's check against the file exact, and for G requires the same chosen entry per position and fold with every numeric field within 5% relative difference (a stop beyond). The runner also pins `VECLIB_MAXIMUM_THREADS`, `OPENBLAS_NUM_THREADS` and `MKL_NUM_THREADS` to 1 before numpy or sklearn is imported and records all four thread variables and the hash seed. **G is reproducible only approximately, even with every thread pool pinned and `PYTHONHASHSEED=0`. In three pinned real runs on 2026-11-17, G's re-derived prior matched LP-2a's `season-preds.jsonl` exactly in two and differed in one by up to 4.84% relative (2024 RB; 2022 RB 1.10%). This artifact's own gaps are in `vsSeasonPreds` and `composeGap`; H is exact. G's comparison with `season-preds.jsonl` allows 5% relative difference, |d| / (1 + |x|), anything beyond is a stop; its same-run compose check (copy against `fold`) is exact.** Later runners (LP-2b-1b, LP-2b-2) carry the same rule.

## LP-2b-1b — weekly models, registration, development-fold labels

Task: `.claude/tasks/learned-projection-2b1b-weekly-models.md` (Revision 3). Python only; the weekly layer of the two learned candidates, H (partial pooling) and G
(gradient-boosted trees): per row (pid, season, week) the points if he plays (`cond`) and the chance he plays (`p`), `uncond = p x cond`. It reads the two 2b-1a caches by SHA-256
(a mismatch returns 2 before any pickle is read; nothing here writes either cache).

```
python3 research/learned-projection/run_weekly_models.py --init-weekly        # the UNSTAMPED weekly layer (the spec) into candidates/H.json and G.json
python3 research/learned-projection/run_weekly_models.py --smoke              # 2018 only (weeks 1-9 -> 10+), unregistered, prints the label arithmetic
python3 research/learned-projection/run_weekly_models.py --register-weekly    # stamp the weekly layer of both candidates atomically; then commit the two files
python3 research/learned-projection/run_weekly_models.py --dev --write        # folds 2019-2024 only, single use; the 2025 fold is held
```

- **Layout.** `lp/spec_wm.py` (the weekly spec, not hashed), `weekly_h.py` (evidence blend toward the prior with (k, rho) fitted by weighted squared error, then a context ridge whose alpha is chosen
  by leave-one-season-out over a grid that includes `"off"`; `"off"` is also the default with fewer than two training seasons), `weekly_g.py`, `pplays.py` (P(plays) and the horizon decay),
  `weekly_models.py` (composition, cross-fitting, the calibration `c_w`, `fit_w` / `predict_w` / `fold_w`, and the two hooks LP-2b-1c depends on: `Fits` persistence and the `variant` switch),
  `registry_w.py`, `evaluate_w.py` (LP-1a §8 labels through `lp/metrics.py` unchanged), `report_s2b.py` (the verdict).
- **Labels.** RB and WR are labelled; QB and TE are report-only (Anton, 2026-11-16). The overall 3-of-4 weekly gate is printed and is expected to fail by construction. Every label is unconfirmed.
- **Registration.** `registry_w.register_weekly` stamps via `registry.append_layer` (the season sections stay byte-identical). There is NO re-registration path: after the registration commit a change to
  weekly code, harness, data or spec makes `registry.require(..., "weekly", ...)` raise. A second `--dev` is refused (one `weekly-dev` run-log entry).
- **The 2025 hold.** After this registration `registry.require(·, 2025)` no longer holds 2025 by itself: `weekly_data.guard` and LP-2b-2's marker do.
- **Outputs (unregistered, report-only).** `backtests/<date>-learned-s2b1b-dev-panel.json` (<= 5 MB, no commit id), `grading/<date>-learned-s2b1b-dev-verdict.md`; git-ignored
  `.cache/models/weekly-preds.jsonl` and `weekly-fits.pkl` (a pickled `{(cand, T): Fits}`, read back only after a SHA check).
- Every G fit runs on one thread with `PYTHONHASHSEED=0` (the runner pins and re-executes itself); G is reproducible only approximately, H exactly.


## LP-2b-1c-i — why the weekly layer ties B1c (report-only)

Task: `.claude/tasks/learned-projection-2b1c1-weekly-analyses.md` (Rev 1.1). Python only; **report-only**: nothing is registered, labelled or gated, nothing feeds LP-2b-2, 2025 stays out of every frame,
no G model and no season-layer model is fitted, and no cache, candidate file or run-log entry is written. It reads the 2b-1a / 2b-1b caches and artifacts by SHA-256 only (a mismatch returns 2 before any
JSON, pickle or registry read).

```
python3 research/learned-projection/run_weekly_analysis.py [--write] [--date YYYY-MM-DD] [--resamples 2000]   # without --write: prints the §0a rule outcomes and the report, writes nothing
```

- **Layout.** `lp/analysis_w.py` (pure: grid edges, error surfaces and the season-edge rule R-S, override speeds, the `paired` copy of `evaluate_w.labels` without `M.label`, week bands, the exploratory H arms,
  the rule outcomes), `lp/report_s2b1c.py` (the report), `run_weekly_analysis.py` (imports `run_weekly_models` first, for the thread pins and the hash-seed re-exec); all new and unhashed.
- **What it answers.** Grid-edge tables for both layers and both candidates; the error surface at the weekly H edges and the season λ surface (the season α / k-multiple / δ surfaces are not recorded —
  reported as a gap); H's override speed against the app's `K_ROS_*` constants and B1's analytic weight; H and G against STD and B1c by week band (origin n = w − 1), per fold, with drift and H − G; three
  exploratory H arms — the k sweep (predict-only, deep copy of the cached fits), a widened k grid refitted through the registered `fold_w` under the cached calibration (`fixedCalib`), and no context.
- **Outputs (unregistered, report-only).** `backtests/<date>-learned-s2b1c1-analysis.json` (<= 5 MB, no commit id) and `grading/<date>-learned-s2b1c1-report.md`. Every arm and band carries
  `exploratory: true` and its spec hash; there is no label anywhere. Runtime checks (a) `scale_k(1.0)`, (b) the no-change `fixedCalib` refit and (c) `paired` against the 2b-1b artifact must reproduce the cached
  results to 1e-9 or the run returns 2.
