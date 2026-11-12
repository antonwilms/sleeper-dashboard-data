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
`.cache/` is git-ignored and must never be committed. `candidates/` (LP-2) does not exist yet.
