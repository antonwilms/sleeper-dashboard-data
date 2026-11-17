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
proves it composes to `fold`'s own rows and equals `.cache/models/season-preds.jsonl`), then builds the weekly rows, outcome targets, as-of features (form, usage,
availability, teammate absence, opponent, team, game, gamelogs, bio) and the in-season era blend (`lp/era_w.py`, `lp/spec_w.py`). It writes
`.cache/models/season-prior.jsonl` and `weekly-inputs.pkl` (git-ignored) and, with `--write`, `backtests/<date>-learned-s2b1a-inputs.json` (facts only, ≤ 1 MB).
A player outside the season universe gets a fallback prior from earlier seasons only. Weekly targets are outcomes by design: `targets_at` is never called by an
input builder.

**The 2025 hold.** `registry.require(·, 2025)` holds 2025 only until both layers of both candidates are registered. After LP-2b-1b's registration it no longer holds
2025 by itself: `weekly_data.guard` (every input builder refuses a season above `LAST_SEASON`) and LP-2b-2's start marker do. Nothing in `lp/` or `run_*.py`
passes the confirm flag.

**Stated limit and the one-thread rule.** LP-2a's G (gradient-boosted) development predictions in `season-preds.jsonl` came from an unrecorded thread count and differ from one-thread refits by up to about 2% on RB (2022 `c`, 2024 `kv_bonus_fd_rb`). `run_weekly_inputs.py` therefore runs every G fit with `OMP_NUM_THREADS=1` (set before sklearn is imported) and `PYTHONHASHSEED=0` (a G fit also varies across processes with the hash seed; the CLI re-executes itself once), records both in the artifact and the run-log, keeps H's check against the file exact, and for G requires the same chosen entry per position and fold with every numeric field within 5% relative difference (a stop beyond). The runner also pins `VECLIB_MAXIMUM_THREADS`, `OPENBLAS_NUM_THREADS` and `MKL_NUM_THREADS` to 1 before numpy or sklearn is imported and records all four thread variables and the hash seed. **G is reproducible only approximately, even on one thread; H is exact** (two pinned one-thread real-data runs differed from each other, by up to 4.8% against the file on RB 2024; G's comparison with `season-preds.jsonl` therefore allows 5% relative difference, |d| / (1 + |x|), anything beyond is a stop, while its same-run compose check — copy against `fold` — stayed exact in both runs and is kept exact; the maximum gaps are in the artifact). Later runners (LP-2b-1b, LP-2b-2) carry the same rule.
