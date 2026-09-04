# R3-FIT — implementation ordering across units

**Type:** Session-1 planning index (no source edited). Companion to the three unit task files below.
**Date:** 2026-07-22.

**Resolved HEADs (verified via GitHub MCP `get_commit main` = local `origin/main` = local HEAD, both trees clean):**
- **Data** `sleeper-dashboard-data`: `79fa9d38934fcea0c1a29b4b778b7aec60cd2df7` ("nflverse: oline 2026-07-22")
- **App** `sleeper-dashboard`: `6a52dc9590e0751b31717d95601651891a15c796` ("fix: scope inProgress bypass to the ktcHist read path")

R3-FIT decomposes into **three independently-implementable units** (+ this index). The split follows the established data→app cross-repo pattern (cf. the R2 arc: data-side `r2-flip-gate.md` gate → app-side `r2-flip-activation.md` activation), because one session cannot edit both repos.

| # | Unit | Repo | Task file | One-line boundary rationale |
|---|---|---|---|---|
| 1 | Panel team-denominator entity filter (the precondition) | **data** | `sleeper-dashboard-data/.claude/tasks/r3fit-panel-scale-fix.md` | Isolates the one-function correctness fix + verified feature scale + refreshed baselines, so the fit sits on a verified-correct panel — small, must-land-first, independently testable |
| 2 | Fitted per-position exponent harness + committed verdict | **data** | `sleeper-dashboard-data/.claude/tasks/r3fit-exponent-harness.md` | The fit itself — factor-multiplier reconstruction + log-space exponent fit + committed CLEARS/NO-GAIN verdict; the largest unit, entirely offline analysis, gated behind unit 1 |
| 3 | Ship CLEARS exponents into `seasonProjection.js` | **app** | `sleeper-dashboard/.claude/tasks/r3fit-activation.md` | The only scoring-affecting production change; separate repo (one session can't edit both), gated on unit 2's committed verdict; ships only positions that cleared |

---

## Recommended order + gating (each gate must be VERIFIED before the next unit starts)

```
Unit 1 (data)  ──lands + verified──►  Unit 2 (data)  ──committed verdict, ≥1 CLEARS──►  Unit 3 (app)
panel entity filter                   exponent fit                                       activation
```

1. **Unit 1 — panel scale fix (data).** Land first. **Verification gate before Unit 2 starts:** (a) `test/panel*.test.mjs` green incl. the doubling-witness + live-spot-check scale tests (`r3fit-panel-scale-fix.md` §3/§5); (b) the refreshed E-0a verdict re-run shows candidate labels **unchanged** and (if run) FLIP-CLEARS **unchanged** (that unit's §4.3 hard guard — if either changed, STOP, do not proceed). Rationale: Unit 2 reconstructs `shareTrendMultiplier` (scale-dependent via its volatility dampener) and every share/RZ factor from the panel's team denominators; on the pre-fix ½-scale denominators the exponents are biased and don't transport (`r3fit-panel-scale-fix.md` §0).

2. **Unit 2 — exponent harness (data).** Build after Unit 1 is verified. **Verification gate before Unit 3 starts:** `node bin/panel.mjs --fit --write` has run and **committed** `grading/<date>-r3fit-verdict.md` + `backtests/<date>-r3fit-{panel,fit}.json`, and the verdict has **≥1 CLEARS position**. If zero positions CLEARS, Unit 3 is a no-op (do not implement it) — record that the gate deferred all positions to the post-R1-SNAPS re-run. Rationale: Unit 3 transcribes the CLEARS exponent vectors from this committed verdict; without it there is nothing authorized to ship (the standing "no fit activates without a committed grading verdict" discipline).

3. **Unit 3 — activation (app).** Build only after a committed verdict with ≥1 CLEARS. Transcribes exponents; ships values-only (no `factors` key change); provisional pending R4 forward grading.

**Units 1→2 are same-repo (data), sequential.** Unit 3 is the cross-repo hop (app), and like every ⚑ activation it is a distinct commit in the sibling repo citing the committed verdict as authorization.

---

## Shared scaffolding (reused, not rebuilt)

- **The E-0a panel harness** (`lib/panel.mjs` + `scripts/panel-run.mjs` + `bin/panel.mjs`): `forwardChainFolds` (season-blocked CV), `solveOLS` (intercept-free ridge-toward-0 — enables the `δ=w−1` reparameterization so ridge-toward-0 == ridge-toward the hand-tuned prior `w=1`), `spearman`, `assemblePanel`, the date-stamped **unregistered** `backtests/`+`grading/` artifact convention (no manifest, no CDN purge), and the pinned in-basis scoring snapshot `DEFAULT_SCORING_SNAPSHOT='2026-07-05'` (pre-poison). Unit 2 adds a `--fit` mode beside `--flip-gate`, not a parallel harness.
- **The entity-filter helper** `isTeamAggregateId` (Unit 1, added to `lib/backtest.mjs`) is reused by Unit 2's share-series reconstruction (`r3fit-exponent-harness.md` §3.4).
- **The app factor transforms** are mirrored once in Unit 2's new `lib/projectionFactors.mjs` (cross-repo mirror contract) and consumed by Unit 3 implicitly (Unit 3 applies exponents to the app's live factors; the reconstruction only needs to match those factors, guarded by Unit 2's parity test).
- **The verdict/gate convention** (E-0a `decideVerdict` ordered rules; the r2-flip `grading/<date>-*-verdict.md` + authorization-record pattern) is reused: Unit 2 produces the verdict, Unit 3 cites it — identical to how `r2-flip-activation.md` cited `grading/2026-07-09-r2flip-verdict.md`.

---

## Cross-cutting facts the reviewer should hold

- **Panel size is the binding constraint** (pre-R1-SNAPS window 2020–2024): pooled eval n WR 339 / RB 197 / TE 164 / QB 92 for ~7 (share) / ~3 (QB) params. Expected: WR most likely CLEARS, QB most likely NO-GAIN. Underpowered positions **shrink harder toward the prior** (ridge + thin-position guard + WR+TE pool), they do not fit noise — and the gate defers them rather than shipping noise (`r3fit-exponent-harness.md` §5). R1-SNAPS (roadmap precondition a, still **open**) widens the window to 2013+ on a config-only re-run; surfaced, not silently ignored.
- **The gate is retrospective, age-blind, reduced-pipeline → provisional** (roadmap D-1; assessment E-3c re-validation at R4). Same standing as the airYardsShare CLEARS.
- **Scope guards honored:** no GBM served (offline challenger deferred, `r3fit-exponent-harness.md` §0/§11); `airYardsShare` NOT activated (R3-EFFACT, gated on R1-AGE); `shareLevel` NOT resurrected (graded-and-parked); no widening into `teamFactor`/R3-TCWIRE, the decision-engine/market-delta arc, or the dynasty-score attribution migration; no direct-to-production exponent change (Unit 3 is verdict-gated).
- **Cross-repo exposures:** Unit 1 — none. Unit 2 — one new **mirror contract** (`lib/projectionFactors.mjs` mirrors app factor transforms; parity-guarded). Unit 3 — values-only, no `factors` key change → no schemaVersion bump / no `register-snapshots.mjs` / no `NUMERIC_FACTOR_KEYS` addition; one scoring-change annotation (exponentiated factor values) for the data `CLAUDE.md` snapshot row.
