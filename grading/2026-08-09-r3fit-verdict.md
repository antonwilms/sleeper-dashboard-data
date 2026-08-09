# R3-FIT Verdict — 2026-08-09

**Config:** predictor years 2020–2024, history floor 2012, attribution=`per-season-team`, basis=`half_ppr` (the app's own basis for store-served careerStats — no scoring snapshot read), α=0.5 (sweep: 0.1, 0.25, 0.5, 1, 2)

**Baseline of record:** grading/2026-08-08-e0a-verdict.md

**Reproduce:** `node bin/panel.mjs --fit --write`

## Panel coverage

- Drop reasons: rookiePathYearsExpProxy=182, rookiePathNoQualifying=7, nonPositiveOutcome=3
- Truncated at 2012 floor: 52
- Forward-mover neutralized: 296
- teamRzShare lastQSeason team===null (§3.0-C1): 0
- Debut-in-Y−1 (sensitivity cohort): 215
- zeroGpWithStats (expect 0): 0
- nonFiniteFantasyPoints (expect 0): 0
- nonPositiveOutcome (expect ~0): 3
- nonPositiveAnchor (expect ~0): 0

**Per-position, per-factor flatOneRate (decision, from selectFitFactors) beside sentinelRate (diagnostic, from fitCoverage):**

- QB: momentum flatOneCount=66 sentinelCount=43, trajectory flatOneCount=6 sentinelCount=6, regression flatOneCount=87 sentinelCount=0
- RB: shareTrend flatOneCount=118 sentinelCount=99, teamRzShare flatOneCount=89 sentinelCount=88, snapShare flatOneCount=5 sentinelCount=3, momentum flatOneCount=160 sentinelCount=147, trajectory flatOneCount=12 sentinelCount=12, regression flatOneCount=103 sentinelCount=0, rzUsage flatOneCount=1 sentinelCount=0
- WR: shareTrend flatOneCount=203 sentinelCount=172, teamRzShare flatOneCount=153 sentinelCount=151, snapShare flatOneCount=10 sentinelCount=3, momentum flatOneCount=223 sentinelCount=190, trajectory flatOneCount=22 sentinelCount=22, regression flatOneCount=177 sentinelCount=0, rzUsage flatOneCount=3 sentinelCount=0
- TE: shareTrend flatOneCount=85 sentinelCount=65, teamRzShare flatOneCount=60 sentinelCount=57, momentum flatOneCount=101 sentinelCount=92, trajectory flatOneCount=8 sentinelCount=8, regression flatOneCount=83 sentinelCount=0, snapShare flatOneCount=3 sentinelCount=0, rzUsage flatOneCount=1 sentinelCount=0

**Share-series coverage:**

- Series length distribution: TE: n=242, min=1, max=11; WR: n=466, min=1, max=12; RB: n=283, min=1, max=11
- Series drops: belowGp8=6608, nullTeam=0, noTeamEntry=0, zeroOwnVolume=16, nonFinite=0
- recFallbackUsed: 0 · subMinDenomKept: 0 · shareGtOne: 0

## Guard instrumentation — is the identifiability guard load-bearing or inert?

The first real run reveals whether the identifiability guard is load-bearing or inert — if inert across all positions (nothing pinned, no fold neutralization), it becomes a candidate for removal in a later slice.

(Per-position detail is reported inside each position's section below.)

## Fidelity

- Snapshot parity: Verified by test/panel-fit.test.mjs T-F10 (half-PPR basis, through the exported buildCohortPools, 5 of 7 factors against a committed 2025 snapshot fixture) — run `npm test`; a PASS precondition of this fit, not recomputed inline by --fit.
- Uncovered factors: shareTrend, teamRzShare
- §3.0-C residual — nullSeasonTeam: 0
- Position-source divergence: Measured via T-F10 pool-composition tolerance (§3.0-C2) — not a standalone counter; budgeted in T-F10's tolerance.
- Live-API basis residual: Named, not measurable server-side (§3.0-C3): a client-cached live-API-fallback season would carry league scoring invisibly to this harness.
- zeroGpWithStats (certified inert, expect 0): 0
- nonFiniteFantasyPoints (certified inert, expect 0): 0
- nonFiniteScale (expect 0 — non-zero is a fidelity failure, not a benign neutralization): 0
- nonPositiveOutcome / nonPositiveAnchor (expect ~0): 3 / 0

`shareTrend` and `teamRzShare` are not parity-checked against app-computed ground truth; no committed snapshot exists in the per-season-team + entity-filtered regime (store ends 2026-07-05; R2 flip 07-11; app denominator fix 07-18). They rest on T-F5/T-F17/T-F11/T-F9/T-F14. Closure: extend T-F10 once a post-2026-07-18 snapshot is imported.

## Per position

### QB

**Base verdict:** UNSTABLE · **Sensitivity verdict:** UNSTABLE · **Final verdict: UNSTABLE**

- n fit rows: 129 · n eval rows (gate numerator): 79 · params (|F_p^fit|): 3 · n:p: 26.3

- Pooled MAE: fitted=3.287, hand=3.338, ΔMAE=-0.052
- ΔMAE per eval year: 2022: -0.109; 2023: -0.030; 2024: -0.015
- ΔSpearman (pooled, n-weighted): -0.002
- meanLogResidual (shipped all-rows refit): -0.1445 **[FLAGGED — |mean(y)| > 0.03]**
- α-sweep: α=0.5: ΔMAE=-0.052, ΔSpearman=-0.002; α=0.1: ΔMAE=0.100, ΔSpearman=-0.022; α=0.25: ΔMAE=0.012, ΔSpearman=-0.005; α=1: ΔMAE=-0.067, ΔSpearman=-0.007; α=2: ΔMAE=-0.057, ΔSpearman=0.000

**Guard instrumentation:**
  - Pinned by rule 0b: none
  - Held-in-arm: rzUsage
  - Every fit candidate's flatOneRate: momentum=0.512, regression=0.674, trajectory=0.047
  - Fold-level graceful neutralization: none
  - shippedRefitNeutralized: [] (expected)
  - maxAbsWMinus1ByFold: 1.9168, 1.1775, 1.2277
  - clampHits: fitted=0, hand=0 (hand ≈ 0 expected — see the conservative-approximation note in Methodology)

**wFinal (full F_p^full length — 4 entries — provenance-labelled):**
  - momentum: 0.6157 (estimated)
  - regression: 0.3661 (estimated)
  - trajectory: -0.6068 (estimated)
  - rzUsage: 1.0000 (held-in-arm (config))

- Sensitivity re-run F_p^fit: momentum, regression, trajectory

### RB

**Base verdict:** UNSTABLE · **Sensitivity verdict:** INSUFFICIENT-POWER · **Final verdict: UNSTABLE**

- n fit rows: 283 · n eval rows (gate numerator): 164 · params (|F_p^fit|): 7 · n:p: 23.4

- Pooled MAE: fitted=3.071, hand=3.113, ΔMAE=-0.041
- ΔMAE per eval year: 2022: -0.182; 2023: 0.081; 2024: -0.041
- ΔSpearman (pooled, n-weighted): -0.032
- meanLogResidual (shipped all-rows refit): -0.2917 **[FLAGGED — |mean(y)| > 0.03]**
- α-sweep: α=0.5: ΔMAE=-0.041, ΔSpearman=-0.032; α=0.1: ΔMAE=0.040, ΔSpearman=-0.036; α=0.25: ΔMAE=0.000, ΔSpearman=-0.032; α=1: ΔMAE=-0.090, ΔSpearman=-0.023; α=2: ΔMAE=-0.127, ΔSpearman=-0.013

**Guard instrumentation:**
  - Pinned by rule 0b: none
  - Held-in-arm: none
  - Every fit candidate's flatOneRate: shareTrend=0.417, regression=0.364, momentum=0.565, trajectory=0.042, snapShare=0.018, rzUsage=0.004, teamRzShare=0.314
  - Fold-level graceful neutralization: none
  - shippedRefitNeutralized: [] (expected)
  - maxAbsWMinus1ByFold: 4.2197, 3.6298, 2.7168
  - clampHits: fitted=0, hand=0 (hand ≈ 0 expected — see the conservative-approximation note in Methodology)

**wFinal (full F_p^full length — 7 entries — provenance-labelled):**
  - shareTrend: 0.2322 (estimated)
  - regression: 0.3944 (estimated)
  - momentum: 0.2213 (estimated)
  - trajectory: 0.7236 (estimated)
  - snapShare: -0.9562 (estimated)
  - rzUsage: -1.5171 (estimated)
  - teamRzShare: -0.6918 (estimated)

- Sensitivity re-run F_p^fit: shareTrend, regression, momentum, trajectory, snapShare, rzUsage, teamRzShare

### WR

**Base verdict:** UNSTABLE · **Sensitivity verdict:** UNSTABLE · **Final verdict: UNSTABLE**

- n fit rows: 464 · n eval rows (gate numerator): 283 · params (|F_p^fit|): 7 · n:p: 40.4

- Pooled MAE: fitted=2.579, hand=2.861, ΔMAE=-0.282
- ΔMAE per eval year: 2022: -0.195; 2023: -0.326; 2024: -0.328
- ΔSpearman (pooled, n-weighted): -0.012
- meanLogResidual (shipped all-rows refit): -0.2836 **[FLAGGED — |mean(y)| > 0.03]**
- α-sweep: α=0.5: ΔMAE=-0.282, ΔSpearman=-0.012; α=0.1: ΔMAE=-0.258, ΔSpearman=-0.021; α=0.25: ΔMAE=-0.272, ΔSpearman=-0.015; α=1: ΔMAE=-0.280, ΔSpearman=-0.008; α=2: ΔMAE=-0.252, ΔSpearman=-0.005

**Guard instrumentation:**
  - Pinned by rule 0b: none
  - Held-in-arm: none
  - Every fit candidate's flatOneRate: shareTrend=0.438, regression=0.381, momentum=0.481, trajectory=0.047, snapShare=0.022, rzUsage=0.006, teamRzShare=0.330
  - Fold-level graceful neutralization: none
  - shippedRefitNeutralized: [] (expected)
  - maxAbsWMinus1ByFold: 5.3918, 5.4338, 5.0860
  - clampHits: fitted=0, hand=0 (hand ≈ 0 expected — see the conservative-approximation note in Methodology)

**wFinal (full F_p^full length — 7 entries — provenance-labelled):**
  - shareTrend: 0.9892 (estimated)
  - regression: 0.3992 (estimated)
  - momentum: 1.1410 (estimated)
  - trajectory: 0.5658 (estimated)
  - snapShare: -3.8625 (estimated)
  - rzUsage: -1.7391 (estimated)
  - teamRzShare: 1.1681 (estimated)

- Sensitivity re-run F_p^fit: shareTrend, regression, momentum, trajectory, snapShare, rzUsage, teamRzShare

### TE

**Base verdict:** UNSTABLE · **Sensitivity verdict:** INSUFFICIENT-POWER · **Final verdict: UNSTABLE**

- n fit rows: 241 · n eval rows (gate numerator): 146 · params (|F_p^fit|): 7 · n:p: 20.9

- Pooled MAE: fitted=1.790, hand=1.926, ΔMAE=-0.136
- ΔMAE per eval year: 2022: -0.223; 2023: -0.099; 2024: -0.088
- ΔSpearman (pooled, n-weighted): -0.016
- meanLogResidual (shipped all-rows refit): -0.2362 **[FLAGGED — |mean(y)| > 0.03]**
- α-sweep: α=0.5: ΔMAE=-0.136, ΔSpearman=-0.016; α=0.1: ΔMAE=-0.116, ΔSpearman=-0.016; α=0.25: ΔMAE=-0.133, ΔSpearman=-0.012; α=1: ΔMAE=-0.136, ΔSpearman=-0.007; α=2: ΔMAE=-0.121, ΔSpearman=-0.009

**Guard instrumentation:**
  - Pinned by rule 0b: none
  - Held-in-arm: none
  - Every fit candidate's flatOneRate: shareTrend=0.353, regression=0.344, momentum=0.419, trajectory=0.033, snapShare=0.012, rzUsage=0.004, teamRzShare=0.249
  - Fold-level graceful neutralization: none
  - shippedRefitNeutralized: [] (expected)
  - maxAbsWMinus1ByFold: 5.0601, 4.5654, 4.5311
  - clampHits: fitted=0, hand=0 (hand ≈ 0 expected — see the conservative-approximation note in Methodology)

**wFinal (full F_p^full length — 7 entries — provenance-labelled):**
  - shareTrend: 0.4697 (estimated)
  - regression: 0.8002 (estimated)
  - momentum: 0.8533 (estimated)
  - trajectory: 0.4355 (estimated)
  - snapShare: -2.9972 (estimated)
  - rzUsage: -0.4729 (estimated)
  - teamRzShare: 2.0082 (estimated)

- Sensitivity re-run F_p^fit: shareTrend, regression, momentum, trajectory, snapShare, rzUsage, teamRzShare

## WR+TE pool result

### WR+TE (pooled)

**Base verdict:** UNSTABLE · **Sensitivity verdict:** UNSTABLE · **Final verdict: UNSTABLE**

- n fit rows: 705 · n eval rows (gate numerator): 429 · params (|F_p^fit|): 7 · n:p: 61.3

- Pooled MAE: fitted=2.314, hand=2.543, ΔMAE=-0.229
- ΔMAE per eval year: 2022: -0.194; 2023: -0.248; 2024: -0.245
- ΔSpearman (pooled, n-weighted): -0.018
- meanLogResidual (shipped all-rows refit): -0.2674 **[FLAGGED — |mean(y)| > 0.03]**
- α-sweep: α=0.5: ΔMAE=-0.229, ΔSpearman=-0.018; α=0.1: ΔMAE=-0.205, ΔSpearman=-0.021; α=0.25: ΔMAE=-0.218, ΔSpearman=-0.019; α=1: ΔMAE=-0.225, ΔSpearman=-0.012; α=2: ΔMAE=-0.200, ΔSpearman=-0.008

**Guard instrumentation:**
  - Pinned by rule 0b: none
  - Held-in-arm: none
  - Every fit candidate's flatOneRate: shareTrend=0.409, regression=0.369, momentum=0.460, trajectory=0.043, snapShare=0.018, rzUsage=0.006, teamRzShare=0.302
  - Fold-level graceful neutralization: none
  - shippedRefitNeutralized: [] (expected)
  - maxAbsWMinus1ByFold: 5.2020, 5.1078, 4.9809
  - clampHits: fitted=0, hand=0 (hand ≈ 0 expected — see the conservative-approximation note in Methodology)

**wFinal (full F_p^full length — 7 entries — provenance-labelled):**
  - shareTrend: 0.7531 (estimated)
  - regression: 0.5474 (estimated)
  - momentum: 1.0184 (estimated)
  - trajectory: 0.5353 (estimated)
  - snapShare: -3.6535 (estimated)
  - rzUsage: -1.3536 (estimated)
  - teamRzShare: 1.4973 (estimated)

- Sensitivity re-run F_p^fit: shareTrend, regression, momentum, trajectory, snapShare, rzUsage, teamRzShare

(TE cleared on its own or the pool did not clear — no pooled fallback in play.)

## Methodology notes

- Age-blind (no server-side draft_picks→sleeper_id join) + reduced-pipeline (HELD-OMITTED factors — age, depth, team, qbQuality, efficiency, comp, bounceBack, tdReliance, breakout — are out of BOTH arms) + provisional pending R4 forward grading (assessment E-3c). A reduced-pipeline CLEARS is the pre-registered pre-2027 activation criterion (roadmap D-1).
- Held factor list, three ways: HELD-OMITTED (out of both arms — the reduced-pipeline limitation); structural QB sentinels (shareTrend/snapShare/teamRzShare — the app itself neutralizes these for QB); HELD-IN-ARM (QB rzUsage — a real non-neutral app multiplier, reconstructed and carried in both QB arms at w=1, never a fit candidate).
- Omitted-variable caveat: omitting efficiencyFactor risks the usage exponents partially proxying for per-opportunity efficiency; expected modest given the app treats usage/efficiency as orthogonal and teamRzShare's partial-β was validated controlling for usage. Efficiency is the named stage-2 priority.
- Support-identity, not vector-identity (§8 item 1): fixing F_p^fit guarantees the shipped refit and every scored fold share an identical factor SUPPORT — not an identical VECTOR. wFinal is an all-rows refit no fold scored out of sample. One bounded exception: per-fold graceful neutralization can hold a retained factor at 1 on a single fold — see foldNeutralization in each position's guard block before citing support-identity where it fired materially.
- The app's `[0.67, 1.50]` combined-factor envelope is applied in BOTH arms (§1) — this is a CONSERVATIVE APPROXIMATION of the app's clamp, not a faithful reconstruction: the reconstructed inner product wraps a reduced 5-factor sub-product (ENVELOPE_FACTORS) where production wraps 10 (the other 5 — qbQuality, breakout, bounceBack, tdReliance, efficiency — are HELD-OMITTED). The reduced hand-arm inner product tops out well inside [0.67,1.50] (~1.35 at the extreme), so `clampHits.hand` is 0 **by construction** — not evidence that production's clamp is inert on real players. It catches the fitted arm's own inflation (exponents > 1 can push the reduced product past where the hand product ever reaches) conservatively; it does not reproduce full production clamp incidence.
- Cancellation caveat: a held, pinned, held-in-arm, or fold-neutralized factor's term is identical in both arms and cancels in ΔMAE — but ONLY on rows where neither arm's inner product hits the clamp. On a row where one arm's inner product truncates at 1.50 and the other's does not, the clamp is a non-linear transform applied after summing, so the shared factor no longer cancels post-clamp. That is correct — it measures the real clamped difference between the two predictions — not a defect in the pin/hold arithmetic.
- Half-PPR denomination (§3.0-C3): the fit optimizes half-PPR accuracy — the app's own projectedPPG is half-PPR-denominated on store-served data, so exponents are fit in the units they are applied in. The grading/2026-08-08-e0a-verdict.md baseline of record runs a different basis (custom) and attribution (current-team), so its MAEs are not directly comparable to this fit's arms — this fit's comparison is internal (fitted vs hand on identical rows).
- Non-independence: recurring players across Y→Y+1 pairs mean rows are not independent; deltas are effect-size estimates, not significance tests.
- Survivorship: outcome gate gamesPlayed(Y+1) ≥ 6 — the standard backtest survivorship caveat applies.
- INSUFFICIENT-POWER deferral (n:p < 20, on pooled EVAL n) + α-stability (ΔMAE sign stable across α∈{0.25,0.5,1}) + the identifiability guard (rule 0b: one selectFitFactors call per position over FIT_CANDIDATES, flat-1.0 rate ≥ 0.9 pins a factor at w=1 in both arms — pin, not drop) + graceful per-fold degenerate-scale neutralization (never aborts the run) — all self-protecting: a thin/noisy panel does not clear.
- The collinearity caveat on shrinkage uniformity: RMS scaling equalizes each factor's scale (making α dimensionless and n-independent), but the fitted factors are correlated (the usage trio; momentum/trajectory), so per-coefficient shrinkage is only exactly uniform under column orthogonality — second-order, unavoidable.
- Per-position n is reported beside every number — nFitRows vs nEvalRows (the gate's basis) are distinct and both reported, never conflated.
- R1-SNAPS tension: the panel is panel-width-agnostic; this run's window is the narrow pre-R1-SNAPS 2020+ default. After R1-SNAPS (fromYear→2013), the identical fit re-runs unchanged (config only) on roughly triple the rows.
- `shareLevel` is not part of this unit (its 2026-08-08 CLEARS on WR/RB is a separate finding requiring its own activation gate — this fit neither reads nor activates it).
