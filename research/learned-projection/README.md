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
