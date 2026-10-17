# D-45 — league-basis refit of the rookie and prior constants

**Session 1, 2026-10-17 (opus), parent folder.**
- Baselines: app `84d6860`, data `ba5c98c` (both clean, pushed). `git pull --rebase` in data on 2026-10-17 → `9c0b9b4`
  (bot commits only: `9d987f9` schedule, `9c0b9b4` snapshot 2026-10-16). Registry region md5
  `d1cdbabc1c3007301bffafa157c38313` on both sides.
- Source: app `.claude/tasks/data-repo-backlog.md` D-45 (and D-46 Done, D-72, D-73); [`league-basis-mirror.md`](league-basis-mirror.md)
  "What this slice does not do" and §0 D1–D7; `grading/2026-10-16-league-basis-verdict.md`; `grading/anchor-policy.md`.
- Companions: [`rookie-basis-refit-registry.md`](rookie-basis-refit-registry.md) — every touched entry's `Mirror`, verbatim;
  [`rookie-basis-refit-bc.md`](rookie-basis-refit-bc.md) — Stages B and C (split for size).
  [`rookie-basis-refit-review.md`](rookie-basis-refit-review.md) — Stage A verification and fix passes.

**The problem.** Since season-rescore (boundary 4a) the app scores every season row in league basis, but five rookie /
prospect constants are still half-PPR numbers that `computeEmpiricalAgeCurves` rescales at runtime by
`positionBasisScale` — one per-position median of league ÷ half-PPR points over **veteran** rows with gp ≥ 10
(`dynastyScore.js:56-81, 141-146`; QB 1.114 / RB 1.118 / WR 1.101 / TE 1.325 as of S = 2026): `ROOKIE_BASELINE_PPG`
(`seasonProjection.js:25`, ×scale `:378`), `ROOKIE_CEILING` (`:62`, ×scale `:340-341`), `QB_ROOKIE_STARTER_PPG` (`:82`,
×scale `:369`), `POSITION_PRIOR_PPG` (`dynastyScore.js:503`, ×scale `:555`); `ROOKIE_CALIBRATION` (`:42`) is a ratio
fitted on half-PPR outcomes and is applied unscaled. Nobody has checked that a veteran-measured scale transports to
rookies (whose points mix differs: receiving share, first downs, the TE premium), or that the fitted constants
re-derived on league outcomes match the scaled ones.

**The fix.** Refit each constant family on league outcomes by **its own committed recipe**, under D-46's `league`
model (`lib/leagueBasis.mjs`, pinned `test/fixtures/league-scoring-2026-10-14.json`), and compare it out of sample
against today's interim (half-PPR × as-of `positionBasisScale`) on league-basis outcomes, under a rule written before
any result is read. Wire only what beats the interim; everything else stays as it is with its comment updated.

**What this slice does not do.** D-72 (R3-FIT exponent verdict under league), D-73 (`K_ROS_POINTS_SHORT.TE` study
pin), in-season k (settled by D-46 — §4.6 re-runs them only as a consistency check and never re-pins), D-65 (the
all-position rookie survivorship gap — a model question, not a basis one). No served file, no workflow, no
`bin/update.mjs` run: every run here is a hand-run of an offline analysis CLI.

---

## 0. Decisions

Session-1 decisions (engineering; stated so review can check them):

1. **S1 · Recipe fidelity first.** Each refit reuses the recipe that produced the shipped half-PPR value. Before any
   league number is read, the half-PPR run of each recipe must reproduce the shipped constant exactly (§4.1 G0). A
   recipe that does not is a stop, not a tune.
2. **S2 · Both arms in-fold.** For fitted constants the interim arm is the half-PPR recipe refitted on the training
   folds × the as-of scale; the refit arm is the league recipe on the same folds. This removes the leakage asymmetry
   that made D-46's dynasty pooled delta read WORSE on identical k (verdict: "fold-k leakage only"). Hand-set constants
   (no recipe) use the shipped value in the interim arm.
3. **S3 · As-of scale (D-46 D4).** The interim arm for target season T uses `reconstructPositionBasisScale` over
   2012…T−1 (`basisScaleOf(load, T, pos)`); G0 asserts T = 2026 gives the four captured values above.
4. **S4 · Populations are basis-invariant.** Every panel's row keys must be identical under `half_ppr` and `league`
   (gates are games-based). A difference is a stop.
5. **S5 · New model, never an overwrite (CR-15).** Candidate league constants enter the data mirror as a constants
   model `league-refit` beside `interim`; `interim` stays the harness default until Stage C flips it for wired
   families only.
6. **S6 · Boundary 10 is written in Stage C,** not B: `grading/anchor-policy.md` is a data-repo file and its row needs
   the app push time (D-46 placed its wire-boundary in C2 for the same reason).
7. **S7 · A wire always adds the rookie factor `rookieConstantsBasis`** (`'interim'` | `'league:<families>'`), under
   either A2 option. Once a family reads a league table at scale 1, `rookieBasisScale` (which keeps the measured
   scale) no longer composes `basePPG`/the knee/the QB level, so every reader of that identity — the app's D-13
   tests, the data side's position recovery and `levelHalf` — must branch on a per-row stamp (plan review, app flag 3).

**Anton (2026-10-17): A1 recommended (transport only); A2 recommended (fingerprint match) plus a visible mismatch
signal (bc §6 B1). Do not reopen.**
- **A1 · What "refit" means for the two hand-set levels** (`ROOKIE_BASELINE_PPG` 13/9/7/5, `POSITION_PRIOR_PPG`
  14/12/9/7 — never fitted, no recipe). *Recommended:* transport only — replace the veteran scale by a ratio measured
  on the population each constant serves (ρ, §4.2 F1/F5); the level itself stays the heuristic. *Alternative:* fit
  the level freely to league outcomes — that is a model change (it would also absorb the D-65 survivorship gap) and
  belongs in D-65.
- **A2 · On a wire, which loads get the league constants.** A load with no league scoring (`rescoreSeasonTotals`
  early return, `sleeperStats.js:316`) is half-PPR and keeps the half constants regardless. The app is multi-league
  (`selectedLeague`) and the refit is fitted to one league's scoring. *Recommended:* league constants only when
  `projectionBasis === 'league'` **and** the live scoring matches the fit's (a fingerprint over the QB/RB/WR/TE-scoring
  keys); any other league, or a later scoring change, gets today's interim (half × `positionBasisScale`).
  *Alternative:* every league-basis load takes the league constants — simpler, but a league with different scoring
  (no first-down bonus, no TE premium) silently gets numbers fitted to Anton's.

---

## 1. Constant inventory

| constant | where | fitted on | what it is | status |
|---|---|---|---|---|
| `ROOKIE_BASELINE_PPG` | `seasonProjection.js:25` (mirror `lib/projectionFactors.mjs:870`) | hand-set | PPG level, × scale | **in scope — F1** (transport, A1) |
| `ROOKIE_CALIBRATION` | `seasonProjection.js:42` (mirror `lib/rookieMirror.mjs:30`) | half-PPR, `2026-09-06-fullpipeline-panel.json` rookiePanel, Σ realised ÷ Σ projected per cell | dimensionless ratio, but its numerator/denominator are points; not scaled today | **in scope — F1** (refit jointly with the baseline it divides) |
| `ROOKIE_CEILING` | `seasonProjection.js:62` (mirror `:44`) | half-PPR p90/p99 of debut PPG, `2026-09-11-rookie-panel.json` | PPG level, × scale | **in scope — F2** |
| `QB_ROOKIE_STARTER_PPG` | `seasonProjection.js:82` (mirror `:203`) | half-PPR `weeklyPoints` in primary games, `2026-10-04-qb-rookie-level-constants.json` | PPG level, × scale | **in scope — F3** |
| `ROOKIE_TOTAL_FACTOR` | `seasonProjection.js:257` (mirror `:181`) | half-PPR, `2026-10-11-rookie-total-panel.json` Σ real ÷ Σ pred total | dimensionless ratio of points; not scaled | **in scope — F4** (measured; expected `same`) |
| `POSITION_PRIOR_PPG` | `dynastyScore.js:503` (mirror `PROSPECT_MIRROR.positionPriorPPG`, `lib/inSeasonEvidence.mjs:630`) | hand-set | PPG level, × scale | **in scope — F5** (transport, A1; decided on the live arm-A population, second-year WRs) |
| `ROOKIE_GAMES_*` (5 tables) | `seasonProjection.js:91-154` | games played | games | **basis-invariant** — G0 asserts the league `--rookie` run's games cells equal the half run's |
| rookie `ageMult`, `ktcMult`, `collegeBase`/adjusts, `nflDraftMultiplier`, `[0.45, 1.85]` clamp | `seasonProjection.js:183-212, 391-471` | hand-set | dimensionless multipliers on a scaled baseline | **basis-invariant** |
| rookie `clamp(…, 0, 40)` | `seasonProjection.js:484` | hand-set | PPG cap | **basis-invariant in practice** — max reachable 13 × 1.114 × 1.85 = 26.8; G0 reports binding rows (expect 0) |
| prospect `ageMultiplier`, `draftMultiplier`, blend 8 : min(gp, 12) | `dynastyScore.js:505-525, 566-571` | hand-set | dimensionless / games | **basis-invariant** |
| `NO_MARKET_CAP` 35 | `dynastyScore.js:535` | hand-set | fraction of the league-basis `positionPeakPPG` | **basis-invariant** (ratio of league values) |
| `?? 20` peak, `?? 7` / `?? 9` fallbacks | `dynastyScore.js:556`, `seasonProjection.js:378`, `dynastyScore.js:555` | hand-set | unreachable for skill positions with loaded curves | **deferred** — noted, no change |
| `MIN_BASIS_SCALE_ROWS` 30 / `positionBasisScale` | `dynastyScore.js:59, 141-146` | — | the interim transport | **kept** for unwired families and the A2 fallback; retired only per wired family |
| in-season k (2a, 2c), `PROSPECT_PRIOR_KIND` | `inSeasonConstants.js` | half-PPR, D-46 league re-fit `do-not-wire` | dimensionless | **out of scope** (D-46); §4.6 consistency re-run when F1/F2/F3/F5 would wire |
| QB takeover hazard/stickiness, `iq` | `qbTakeoverConstants.js` (CR-27) | half-PPR features | categorical; `iq` a points ratio | **deferred** — not a rookie/prior constant; CR-27: basis cancels to first order |
| `QB_SAT_LONGER_DISCOUNT` 0.90 | `qbTakeoverConstants.js:59` | hand-set | dimensionless | **basis-invariant** |
| `SHORT_SEASON_K`, games-calibration | `shortSeasonConstants.js` | games | games | **basis-invariant** |

---

## 2. Stage A1 — `--basis league` for the four modes; the first-down re-route (data; one commit)

Commit messages end `(rookie-basis-refit)`. `npm test` green. `half_ppr` stays the default of every mode and is
byte-identical (§2.6).

1. **`bin/panel.mjs`.** `--rookie` and `--fullpipeline` admit `--basis half_ppr|league` (default `half_ppr`; `in-basis`
   rejected for both). `--rookie` keeps rejecting `--from/--to/--attribution/--min-games`; its error text drops
   `--basis`. The `:102` guard becomes "league is admitted by `--fit`, `--rookie`, `--fullpipeline`". Header doc
   lines `:15, :22, :25` updated. `--write` under league names files `…-rookie-league-panel.json` /
   `…-fullpipeline-league-panel.json` (and the verdict md likewise); half names unchanged. Mechanics: the `:90`
   default must add `rookieMode` to the `half_ppr` default (else a no-flag `--rookie` hits the in-basis rejection);
   the `:98` error text drops "(league: --fit only)"; `:122` stops rejecting `--basis`.
2. **`scripts/panel-run.mjs`.**
   - `runRookiePanels({ load, basis = 'half_ppr' })`: under `league` wrap `load` with
     `leagueBasisLoad(load, leagueLoadArgs(load))` **before the first read** (`:1929` `buildOutcomeMaps`, `:1933`
     `loadSeasonTotals`), so outcomes, `rookiePathStateAt`'s ppg map and totals are league. `meta.basis`/`basisScope.basis`
     = `basis`. `checkReproductionPin` (the half-PPR D-8 pin) is skipped under league with
     `reproductionPin: { skipped: 'pin is half_ppr' }`; `computeCeilingReconciliation`'s `match` against
     `APP_ROOKIE_CEILING` is reported, never thrown on (confirm no throw path; if one exists, gate it on basis).
   - `runFullPipeline({ …, basis = 'half_ppr' })`: same wrap at the top; pass the wrapped `load` to `assemblePanel`
     (the wrap is idempotent, D-46 §1.1) and to the rookie block (`:1440-1460`). `meta.basis` = `basis`. The rookie
     panel's predictor stays the uncorrected scale-1 `reconstructRookieProjection` under both bases (row schema
     unchanged); §4 applies scales itself.
   - The header comment at `:1369-1372` ("§B basis pin: half_ppr for every panel") becomes "default half_ppr;
     `league` (D-45) is admitted and report-only for §D/§E".
3. **`bin/backtest.mjs --rookie-total`** admits `--basis half_ppr|league` and, required with league,
   `--rookie-panel <path>` (the league panel from 2.1; error if missing, error if given under half). `runRookieTotal`
   takes `{ basis, panelPath, rookieConstants }`. `ROOKIE_TOTAL_LOAD` (`rookie-total-run.mjs:26-29`) gains
   `loadSeasonTotals`, `loadLeagueScoring`, `loadLeaguePositionOf` (as `INSEASON_LOAD` has them) so `leagueLoadArgs`
   can build a wrapped load — used only for the scale; the panel already carries league outcomes.
   `composeRookieRow(row, ageAtDraft, { basisScale = 1, rookieConstantsModel, leagueConstants } = {})`
   (`lib/rookieTotalPoints.mjs:27`) passes them to `reconstructShippedRookieProjection`; under league the caller
   passes `basisScaleOf(load, targetSeason, pos)`, and the realised total is the league panel's `outcomeTotalPts`. The `:55` parity check is
   unchanged (it checks the scale-1 uncorrected PPG). `meta.basis`, file names `…-rookie-total-league-panel.json`.
4. **`bin/backtest.mjs --qb-rookie-level`** admits `--basis half_ppr|league`.
   - Under league `runQbRookieLevel` wraps `load` before `guardLoad` (`:85`), so `weeklyPoints` in primary games are
     league (exact weeks, D-47). `constants.basis`/`meta.basis` = `'league'` plus top-level
     `basisDetail: { scoringFixture, positionFile }` (D-46 shape); `definitions.outcome` says league;
     `definitions.leagueScaling` = `'none — league outcome'`. Q4: `fitLeague` = the league fit value directly (not
     × `basisScale`); add `gapLeague = round3(levelLeague − fitLeague)`; `reconHalf` keeps scale 1 and a new
     `reconLeague` passes `basisScaleOf(load, targetSeason, 'QB')` to `rookiePriorFor`.
   - **The CR-14 re-route (both bases).** Delete the `bonus_fd_qb` `SnapshotStop` (`:97-100`). `leagueRatio(rec,
     scoringSettings, { deriveFirstDowns })` scores with `scoreSeasonStats(rec.stats, scoringSettings, { position:
     'QB', deriveFirstDowns })` from `lib/fantasyPoints.mjs` (the D-47 port; it already excludes `NON_ADDITIVE_KEYS`,
     so the manual `RATE_KEYS` strip goes). The caller computes `deriveFirstDowns = !seasonEmitsFirstDownBonus(rows)`
     once per season over that season's **served** rows (`ctx.get(S).st`). Under league the ratio's denominator is
     `rec.sourceFantasyPoints ?? rec.fantasyPoints` (a wrapped row's `fantasyPoints` is already league) and
     `leagueByRatio` is reported as the season-ratio cross-check of the exact-week league level. Update the CR-14
     sentence in `leagueRatio`'s header. Under league `leagueRatio` still reads the 2026-10-03 snapshot's settings
     while the wrap reads the D2 fixture: assert they deep-equal on every key `scoreSeasonStats` reads (0 differing
     keys at plan review) and stop otherwise.
5. **Tests** (in-memory fixtures; never `snapshots/` or current-season files — Invariant 10):
   - CLI: each mode admits `league`, rejects an unknown basis; `--rookie-total --basis league` without
     `--rookie-panel` exits 1; `--rookie-panel` under half exits 1; `--rookie` still rejects `--from`.
   - `test/qb-rookie-level.test.mjs`: replace the test asserting the `bonus_fd_qb` stop (find it; if none exists, add)
     with: a 2019-style QB row (no `bonus_fd_*` in the season) under settings `bonus_fd_qb: 1` gets
     `pass_fd + rush_fd + rec_fd` points; a 2023-style row keeps its served `bonus_fd_qb`; no throw. Under settings
     without `bonus_fd_qb`, `leagueRatio` equals today's value on a fixture row (byte identity of the re-route).
   - `runRookiePanels`/`runFullPipeline` on a two-season in-memory load: league outcome PPG ≠ half on a row whose
     stats score differently; row keys identical across bases; `meta.basis` set.
6. **Acceptance — byte identity (hand-run).** On `ba5c98c` and again after A1–A3, with **no** `--basis`, run
   `node bin/panel.mjs --rookie --json`, `node bin/panel.mjs --fullpipeline --json`,
   `node bin/backtest.mjs --rookie-total --json`, `node bin/backtest.mjs --qb-rookie-level --json` with output to a
   scratch dir outside the repo; deep-equal ignoring `generatedAt`/`runtimeMs`. Paste the four hashes. Separately
   confirm the pinned artifacts the app copies are reproduced by today's code: `starterPPG` + `fixture` of
   `backtests/2026-10-04-qb-rookie-level-constants.json`; `loso.decision` of `2026-10-11-rookie-total-panel.json`;
   `ceiling.observed` and `rookiePathAll` cells of `2026-10-10-rookie-panel.json`; `rookiePanel.rows` of
   `2026-09-06-fullpipeline-panel.json` (model-independent). A pre-existing non-reproduction at `ba5c98c` is reported,
   not fixed, and the family it feeds becomes `stop-and-report`.

## 3. Stage A2 — the `league-refit` constants model in the mirror (data; one commit)

1. **`lib/rookieMirror.mjs`.** `ROOKIE_CONSTANTS_MODELS = Object.freeze(['interim', 'league-refit'])`,
   `CURRENT_ROOKIE_CONSTANTS_MODEL = 'interim'`. `reconstructShippedRookieProjection` gains
   `rookieConstantsModel = CURRENT_ROOKIE_CONSTANTS_MODEL, leagueConstants = null`. Under `league-refit` each family
   present in `leagueConstants` (`{ baselinePPG?, calibration?, ceiling?, qbStarterPPG?, totalFactor? }`, the §4.5
   file's `families.<f>.constants`) replaces its half table and takes scale 1; an absent family keeps half × `basisScale`.
   `league-refit` without `leagueConstants` throws. Returns `rookieConstantsBasis`: `'interim'` or
   `'league:<families, sorted, comma-joined>'` — the same domain as the app's factor (bc §6 B1). Thread the override
   through the internal helpers by argument (`resolveRookieCalibration`, `applyRookieCeiling`,
   `resolveRookieQbStarterLevel`, `resolveRookieTotalFactor`, the baseline at `:269`) — never by mutating the exported tables. `interim` must be
   byte-identical: T-RM3…T-RM16 and T-QB-4 pass unchanged.
2. **`lib/inSeasonEvidence.mjs`.** The prospect prior (`:669-680`) takes `positionPriorPPG =
   PROSPECT_MIRROR.positionPriorPPG`; a league-refit caller passes F5's prior and `basisScale = 1`.
3. **Harness plumbing.** `scripts/inseason-run.mjs` and `scripts/inseason-dyn-run.mjs` accept `rookieConstants`
   (a file path; CLI `--rookie-constants <path>`, admitted only with `--basis league`): it sets
   `rookieConstantsModel: 'league-refit'` on every `reconstructShippedRookieProjection`/`rookiePriorFor` call and
   F5's prior on the prospect prior. `rookiePriorFor` (`inseason-run.mjs:236`) gains the two arguments; its callers
   at `inseason-dyn-run.mjs:852, 883, 918` (Q4a, all positions) and `qb-rookie-level-run.mjs` pass them; the Q4b
   assert at `:897` compares like-modelled values. The dynasty run's Q1 rows gain the fields F5 needs to recompute
   the arm-A prior (`pickForA`, `age`, `completedGp`, `completedPPG` — whatever `prospectPriorPPG`'s sm1 blend reads,
   `lib/inSeasonEvidence.mjs:669-684`), exposed through `runInSeasonDyn({ onRows })` (`:1042`); additive row fields
   only, constants output byte-identical. The constants files record `basisDetail.rookieConstants: <path @ sha1>` only when given (a
   half run adds no key). `scripts/rookie-total-run.mjs` takes the same option (F4).
4. **Tests.** `interim` byte identity (existing suites); `league-refit` with a synthetic `leagueConstants`: baseline
   replaced and unscaled, an absent family still × scale, calibration cell override, ceiling closed form at the
   league knee, QB level override, total factor override; `rookieConstantsBasis` strings; throw without constants;
   `--rookie-constants` rejected under half.

## 4. Stage A3 — the refit and the verdict (data; two commits, in order)

**A3a — rule first.** New `lib/rookieBasisRefit.mjs` (pure) and `scripts/rookie-basis-run.mjs` (`runRookieBasis`,
`bin/backtest.mjs --rookie-basis`, takes only `--json`/`--write`). The verdict builder emits the §4.3 rule section
from constants in the script. A3a commits the code, its synthetic-input tests and **no artifact**; it is committed
before the first league run, so the rule's commit time precedes every result (review checks the order). **A3b** — the
hand-run's artifacts, one commit. A rule change after A3a is a stop, never an amendment.

`runRookieBasis` assembles everything in memory from the A1 modes (half and league runs of `runRookiePanels`,
`runQbRookieLevel`, the 2c Q1 rows), joins half and league rows by key, and never reads a panel file except the
shipped constants/fixtures it compares against. Two small library additions, byte-identical by default and tested
so: `clusteredBootstrap`/`bootstrapPairedMean` (`lib/inSeasonEvidence.mjs:278-329`) gain an optional `levels`
argument that adds `ci99` beside the unchanged `ci95`; `computeCeilingReconciliation` and `quantile`
(`scripts/panel-run.mjs:1878, 1894`) are exported. T-RM1 (`test/rookie-mirror.test.mjs:103`) must stay green: the
`bin/panel.mjs --fit` closure must not reach `lib/rookieMirror.mjs` or `lib/rookieBasisRefit.mjs` (which imports
the mirror) — `scripts/rookie-basis-run.mjs` is reached only from `bin/backtest.mjs`.

### 4.1 G0 — gates (a failure stops the run; nothing under §4.2 is read)
- **G0a scale.** `basisScaleOf(load, 2026, pos)` = QB 1.114, RB 1.118, WR 1.101, TE 1.325; the per-T table for every
  target season used below is written to the panel.
- **G0b recipe fidelity.** Each half-PPR recipe on the half-PPR rows reproduces its shipped constant exactly:
  F1 `ROOKIE_CALIBRATION` (all 8 cells, 2 dp, via the ported recipe, §4.2); F2 `ROOKIE_CEILING` (8 values, 2 dp);
  F3 `QB_ROOKIE_STARTER_PPG` (4, 3 dp); F4 `ROOKIE_TOTAL_FACTOR` (2, 3 dp).
- **G0c populations (S4).** Half and league row-key sets equal per panel; `ROOKIE_GAMES_*` cells equal across bases
  (the games invariance claim, §1).
- **G0d settings.** The fixture is the one D-46 D2 pinned (file sha1 recorded); weeks method counts per season
  reported (`scaled` > 0.5% of a family's rows in any season → reported, as D-46 §7).

### 4.2 Families (recipe · folds · arms · entries · loss)

Common: losses are per row; the paired difference is `d = loss(refit) − loss(interim)`; entry and family deltas are
the unweighted mean `d`, clustered by `sleeperId` with `bootstrapPairedMean` (`IN_SEASON_DEFAULTS.bootstrap`, 4000,
seed 12345), labelled by `compareLabel`. **Labelling floors are per family** (pre-registered here; `cellVerdict`'s
60 players / 300 rows would leave F1 and F3 with no labelled entry): an entry below its family's floor is
`INSUFFICIENT` — pooled, not labelled. Full-sample league constants (all folds) are what the app would pin.

- **F1 — rookie PPG level: `ROOKIE_BASELINE_PPG` + `ROOKIE_CALIBRATION`.** Rows: the legacy gated rookie panel
  (`runRookiePanels` legacyGated — equal key for key to the `2026-09-06-fullpipeline-panel.json` rookiePanel, 1,056
  rows, confirmed at plan review), outcome PPG (gp ≥ 6). *Recipe:* port `tierGroup`/`ratioOfMeans`/
  `fitCellConstants`/`runLoyo` (app `src/__tests__/rookieCalibration.test.js:81-235`) and the five-part minimum-n
  rule (app `docs/projection.md:282-288`) verbatim into `lib/rookieBasisRefit.mjs`, citing both, with one stated
  mapping: data rows carry `nflDraftTier: null` where the app fixture says `'unmatched'` (366 rows), and both map to
  `undrafted` (plan review reproduced all 8 shipped cells at 2 dp with it). *Prediction both arms:* `cappedProduct`
  recomputed per row by `reconstructRookieProjection` from the row's position/age/draft fields (G0b asserts
  round1(baseline_H × cappedProduct) equals the row's `projectedPPG` on every row); the recipe's denominator is
  that level at the arm's baseline, rounded to 1 dp as the recipe rounds `pr`, in both arms. *Refit arm:* ρ(pos) =
  Σ league outcome ÷ Σ half outcome over the training rows of that position (3 dp); baseline_L = baseline_H × ρ
  (3 dp); calibration_L by the recipe on league outcomes vs baseline_L × `cappedProduct`. *Interim arm:*
  calibration_H by the recipe on half rows; level baseline_H × s(pos, y+1) × `cappedProduct` × calibration_H.
  *Folds:* leave-one-predictor-year-out (12, 2013–2024). *Loss:* |league outcome − clamp(level, 0, 40)| on the
  pre-ceiling level. *Entries:* group × position, group ∈ {r1, day2, day3, undrafted} (16); floor rows ≥ 30 (the
  recipe's own band). In a corrected n ≥ 30 cell ρ cancels, so ρ moves only r1, day2, below-band and capped cells;
  `same` is judged on the **effective level** (baseline × calibration per cell). *Structural check:*
  the set of corrected cells and each cell's minimum-n band are identical under the full-sample league fit.
- **F2 — `ROOKIE_CEILING`.** Rows: `runRookiePanels` debut rows, gp ≥ 8, classes 2013–2025 (QB 50 / RB 281 / WR 366 /
  TE 176 = 873; the observed quantiles equal `ROOKIE_CEILING`). *Recipe:* `computeCeilingReconciliation`'s quantile
  (p90 knee, p99 asymptote, 2 dp). *Folds:* leave-one-class-year-out (13), the committed Q5 protocol (app
  `.claude/tasks/rookie-ceiling.md` Q5). *Interim:* half quantiles in-fold × s(pos, class). *Loss:* pinball loss at
  τ = 0.90 against the knee and τ = 0.99 against the asymptote, on held-out league debut PPG (a proper score for a
  quantile, so the delta is paired). *Entries:* position × {knee, asymptote} (8); floor rows ≥ 30 (all four
  positions clear it). Held-out exceedance vs 10% / 1% reported for both arms (disclosure, as Q5). *Structural:*
  knee < asymptote at every position.
- **F3 — `QB_ROOKIE_STARTER_PPG`.** Rows: `runQbRookieLevel` Q3 units (rookie-season, ≥ `minUnitGames` primary
  games; 68 at plan review: top12 27 / r1 8 / day2 14 / day3+ 19). *Recipe:* `levelTable` (Σ points ÷ Σ primary
  games, game-weighted, 3 dp). *Folds:* leave-one-season-out over 2013–2025. *Interim:* half level in-fold × s(QB, S).
  *Loss:* |unit league PPG − group level|, unweighted per unit as `losoCompare` averages (`lib/qbRookieLevel.mjs:255-256`).
  *Entries:* the four groups; floor players ≥ `QB_ROOKIE_DEFAULTS.thinPlayers` (10) — r1 (8) is `INSUFFICIENT`.
  *Structural:* no group empty.
- **F4 — `ROOKIE_TOTAL_FACTOR`.** Decided **after** F1 and F2, on the composition the app would ship (each of F1/F2
  at its league value if `wire`, else interim) — the D-46 2a→dynasty pattern. Rows: league rookiePathAll panel.
  *Recipe:* `losoMultiplier` / `loso.decision` (`lib/rookieTotalPoints.mjs`). *Folds:* leave-one-season-out.
  *Interim arm:* factor_H fitted in-fold on the interim composition against half realised totals (today's recipe),
  applied to the shipped composition. *Refit arm:* factor_L fitted in-fold on the shipped composition against league
  realised totals, applied to it. *Loss:* |league realised total − predicted total|. *Entries:* day3, undrafted
  (RB/WR/TE pooled per group, as shipped); floor rows ≥ 30. Expected `same`.
- **F5 — `POSITION_PRIOR_PPG`.** Live, the arm-A prior (`POSITION_PRIOR_PPG × scale × age × draft`, then the
  completed-season blend 8 : min(gp, 12)) serves second-year WRs (`PROSPECT_PRIOR_KIND`, `inSeasonConstants.js:64-67`
  — every other yearsExp 0/1 cell starts from the projection), PATH B (seasonHistory ≤ 2, blended 0.4,
  `dynastyScore.js:576`) and rows with no prospect entry (`:1001`). Only the first is evaluable on the data side.
  *Rows:* the 2c Q1 admitted rows (S+2 outcome `nextPPG2`, gp ≥ `nextMinGames`) **deduplicated to one row per
  player-season** (the prior does not vary by checkpoint). *Prior:* the arm-A prior **as live**, including the sm1
  blend, recomputed from the §3.3 row fields with the position constant swapped. *Refit arm:* ρA(pos) = Σ league
  `nextPPG2` ÷ Σ half `nextPPG2` over training rows (3 dp); prior_L = prior_H × ρA (3 dp). *Interim:* prior_H ×
  s(pos, S). *Folds:* leave-one-season-out. *Loss:* |league `nextPPG2` − prior|. *Entries:* the four positions;
  floor players ≥ 30. **Only the WR entry decides F5** (the one live arm-A population); QB/RB/TE are reported, never
  wired. A WR wire also reaches WR PATH B and no-entry rows, which were not evaluated — the verdict says so.

### 4.3 Decision rule (pre-registered; A3a writes it into the verdict)

Per family:
- **`wire`** iff at least one labelled entry is `BEATS`, no labelled entry is `WORSE`, the family's pooled delta
  (all its rows, deduplicated per row) has a **99%** interval entirely below 0, and the structural check holds.
- **`stop-and-report`** iff G0 fails for it, its structural check fails, a pinned artifact it reproduces did not
  reproduce at baseline (§2.6), or §4.6 trips. Session 1 takes it to Anton; nothing wires from it.
- Otherwise **`do-not-wire`**, naming the entries.
- **Multiplicity, stated in the verdict:** the verdict counts the labelled entries after the floors (at most
  16 + 8 + 3 + 2 + 1 = 30 deciding entries) and states the expected spurious `BEATS`/`WORSE` at 95% (≈ 1.5 at 30); the pooled requirement is the guard (D-46's), and it is held at 99% because five families are
  decided at once (0.05 ÷ 5, Bonferroni).
- **Entries `same`:** full-sample league value equals full-sample interim value at the constant's committed precision.
  A family whose every entry is `same` is `do-not-wire` whatever its pooled delta (a pooled delta on identical values
  measures fold noise only). A `same` entry never counts as the required `BEATS`.
- **Expected, stated so a surprise is visible:** F4 `same`; F1/F5 hinge on whether ρ differs from s by more than a
  few percent; F2/F3 on whether the rookie points mix differs from the veterans'.

### 4.4 What the verdict reports
Per family: the recipe and fold count; full-sample half value, interim (× s as of 2026), league value and ρ where used;
per entry rows / players / delta [95%] / label; the pooled delta [99%]; the verdict. G0 results. Exceedance table
(F2). Weeks-method counts. For every family: the live 2026 effect of the league value vs the interim on the
2026-10-16 capture's rookie rows (count of rows whose `projectedPPG` would move by ≥ 0.1, mean move) — report-only.

### 4.5 Artifacts (A3b)
`backtests/<date>-rookie-basis-panel.json` (G0, every entry table), `backtests/<date>-rookie-league-constants.json` —
the file the app byte-copies on a wire: top-level `basis: 'league'`, `basisDetail` (D-46 shape), and
`families.{F1…F5}` = `{ verdict, constants, provenance }` for **every** family (an unwired family's constants are
recorded, never read by the app), plus `grading/<date>-rookie-basis-verdict.md` (unregistered, the documented
Invariant-3 exception). The league panels from A1's modes are not written by `--rookie-basis` (in memory); a
standalone `--write` of each mode is not part of this slice.

### 4.6 Consistency re-run of the in-season k (only if F1, F2, F3 or F5 is `wire`)
Those families move a prior a CR-25 k is fitted against (F1 and F2: the ceiled `projectedPPG` is the 2a ROS/`next`
rookie prior and arm B; F3: a yearsExp-0 QB's `next` prior, CR-25 (c); F5: arm A). CR-25: "a change … re-fits these k". Run `--inseason --basis league
--rookie-constants <file>` and `--inseason --dynasty --basis league --inseason-2a backtests/2026-10-07-inseason-constants.json
--rookie-constants <file>`; compare each with the shipped file under D-46's `compareConstantsFiles`/`decideFile`
unchanged. Both `do-not-wire` with `prospectPriorKind`, `decisions`, `reuse` unchanged → the shipped k stand (the
re-fit is discharged with no re-pin) and the families keep their verdict. Otherwise every triggering family becomes
`stop-and-report` — k are out of this slice's scope, so Anton decides whether a k re-pin opens.

## 5. Stage A hand-back — then STOP

SHAs (A1, A2, A3a, A3b; local, not pushed); the four §2.6 hashes and the pinned-artifact checks; G0; every family's
tables and verdict; §4.6 if run; `npm test` counts; `npm run smoke`; every deviation. **Stage A is committed locally
and not pushed.** Session 1 runs implementation-reviewer on it, reads the verdict against §4.3 (not the narrative),
and stops for Anton's review (relayed to Cowork). Nothing in Stage B starts before that.

After Anton's sign-off Session 1 pushes Stage A (`git pull --rebase` first; no served file → no purge; registry
untouched → CR-24 unaffected), so B cites pushed SHAs.

---

## 6–7. Stages B and C

In [`rookie-basis-refit-bc.md`](rookie-basis-refit-bc.md) (split for size): B1 wire / B1′ no wire, B2 registry, B3
backlog; C1 byte copy, C2 default flip + anchor boundary 10, C3 docs.

## 8. Risks and stop conditions

- **A recipe does not reproduce its shipped value (G0b)** — most likely F1 (the recipe lives only in an app test
  today). Stop; do not tune the port.
- **ρ ≈ s** for every position → F1/F5 `do-not-wire` with near-zero deltas; that is an answer, not a failure.
- **F1 cell structure moves** (a cell crosses the n bands or the ≤ 1.00 cap): stop-and-report — a new correction cell
  is a calibration-scope decision (rookie-calibration §3(b)), not a basis one.
- **Runtime:** two `--fullpipeline` passes are not needed by §4 (F1 reads `--rookie`'s legacyGated); `--fullpipeline
  --basis league` is exercised by the A1 tests and one hand-run for the §2.6 hash only. §4.6 adds up to two in-season
  passes. Run hand-runs in the background; cache nothing in the repo.
- **Thin cells:** F3 r1 (8 units), F1 `undrafted:QB` (n = 14) and other sub-30 cells — `INSUFFICIENT`; their
  constants follow the family verdict (not wired individually). F5's QB/RB/TE never wire (§4.2).

## 9. Cross-repo impact

Every entry's `Mirror`, verbatim: [`rookie-basis-refit-registry.md`](rookie-basis-refit-registry.md) (CR-14, 15, 25,
27, 01, 26, 02, 18). The rule requires those Mirrors as Session-1 output; the edits below are what B2/C1 apply.

**Fire in every outcome (Stage A edits their data-side triggers):**
- **CR-14** — the `bonus_fd_qb` stop is replaced by the port. Data side: "`leagueRatio` in `lib/qbRookieLevel.mjs`
  (`--qb-rookie-level`, report-only league cross-check) scores season `stats` with `RATE_KEYS` stripped, the app's
  season-scoring convention" → "`leagueRatio` in `lib/qbRookieLevel.mjs` (`--qb-rookie-level`, report-only
  season-ratio cross-check) scores season `stats` through the `lib/fantasyPoints.mjs` port `scoreSeasonStats`, its
  `deriveFirstDowns` flag set per season by `seasonEmitsFirstDownBonus` in `scripts/qb-rookie-level-run.mjs` (D-45)"
  (this wording binds under `extractSymbolFileClaims`/`symbolResolvesIn` once A1 lands — checked at plan review; the
  first draft did not). Triggers gain `scripts/qb-rookie-level-run.mjs`. Mirror: "`scripts/qb-rookie-level-run.mjs`
  still stops on a non-zero `bonus_fd_qb` (D-45 re-routes it)." → "`scripts/qb-rookie-level-run.mjs` scores through
  the same port since D-45 (no `bonus_fd_qb` stop)."
- **CR-15** — Data side and Triggers gain `lib/rookieBasisRefit.mjs`, `scripts/rookie-basis-run.mjs`,
  `ROOKIE_CONSTANTS_MODELS`/`CURRENT_ROOKIE_CONSTANTS_MODEL`; the rookie/full-pipeline panels admit `league`.
- **CR-25** — `lib/inSeasonEvidence.mjs`, `scripts/inseason-run.mjs`, `scripts/inseason-dyn-run.mjs`, `bin/backtest.mjs`
  change: plumbing only (`--rookie-constants`, prior override, Q1 row fields, `ci99`); the half/interim path is
  byte-identical; no re-fit or re-pin owed.
- **CR-27** — `scripts/qb-rookie-level-run.mjs`, `lib/qbRookieLevel.mjs`, `test/qb-rookie-level.test.mjs`,
  `bin/backtest.mjs` change: Data side gains the league mode and the first-down re-route; pinned constants unchanged.

**Fire on a wire (Session 1 drafts exact text from the verdict into the bc file before Stage B):**
- **CR-15** Invariant: rookie mechanisms versioned by constants model (`interim` before boundary 10, `league-refit`
  after, per family), `rookieConstantsBasis` per row; App side gains the `constantsBasis` selection in `App.jsx` and
  `src/__fixtures__/rookie-league-constants-*.json`; name the identity readers (bc §7 C2).
- **CR-25** (any wire — B1 changes `computeProspectScore`'s signature and `inSeasonConstants.js`): §4.6's result
  ("re-fitted under `--rookie-constants`; D-46's rule kept the shipped k"), the bump (or F5-only no-bump), an F5
  edit of its `POSITION_PRIOR_PPG` sentence; App side gains the selection and fixture glob.
- **CR-01** (any F1–F4 wire, either A2 option): captured `projectedPPG`/`projectedTotalPts`/`qbStarterPPG` move —
  a boundary-10 segment sentence by `rookieConstantsBasis` (additive key, no `schemaVersion` bump); on F3 its
  Invariant sentence "`qbStarterPPG` is then the pinned rookie starter level × `rookieBasisScale` (CR-27)" changes.
- **CR-27** (F3 wire): Invariant "half-PPR, × the runtime `positionBasisScale`" → the league file's values at scale 1
  on league loads; App side gains the league constants block and fixture glob.
- **CR-18** (any wire): `docs/signal-registry.md` row for `rookieConstantsBasis`.
- **CR-26** (on a bump): one sentence — every 2026 pre-kickoff capture is already refused (`model`); no new consequence.

**Checked, not fired:** CR-02 (`lib/qbRookieLevel.mjs` is already listed as a served-`weeklyPoints` reader with
"rescored weeks under `league`, D-46"); CR-08/CR-09 (scripts match textually; their schedule/gamelog reads do not
change); CR-22; CR-24 except the same-day byte copy; CR-28/29 (no served write).

## 10. Size

Large (as D-46). Stage A ≈ 1,500–2,000 lines incl. tests over ~14 files, 4 commits, one long sonnet session;
hand-runs ≈ 30–60 min (each A1 mode per basis, the 2c Q1 assembly per basis, §4.6's two in-season passes if
triggered). Stage B: B1 ≈ 400–700 lines over ~15 files (depends on which families wire); B1′ ≈ 20 lines; B2 registry.
Stage C small. Reviews: plan (done), A, B, C, fix passes as needed.

## 11. Decided

A1, A2: answered 2026-10-17 (§0).

---

## Review record (plan gate, 2026-10-17)

plan-reviewer ran twice at full depth: data repo (1 blocker, 17 more; `npm test` 1605/1610 pass, 5 skipped) and app
repo (3 blockers, 11 more; app `npm test` 2958 green). Session 1 checked each against source and applied all of them:
- **Blockers:** per-family labelling floors (cellVerdict's 60/300 made F1/F3 unwireable); F2 added to §4.6 and CR-25;
  `PRIOR_MODEL_FROM` bump owed for F1–F4 (the `:37-38` rule; rookie-total-wiring precedent), none for F5-only;
  `rookieConstantsBasis` mandatory on any wire (S7) because `rookieBasisScale` no longer composes the constants.
- **F1:** null tier → undrafted (16 entries, not 20); `cappedProduct` recomputed with matching rounding; `same` on the
  effective level (ρ cancels in corrected cells). **F3:** unweighted per unit. **F4:** interim arm defined.
  **F5:** decided on the live arm-A population (second-year WRs) only, prior as live (sm1 blend), deduplicated to
  player-season, row fields via `runInSeasonDyn({ onRows })`.
- **Mechanics:** `ci99` added to the bootstrap; `ROOKIE_TOTAL_LOAD` and `composeRookieRow` gain what league needs;
  `bin/panel.mjs:90/98/122`; anchors (`:236`, `:852/883/897/918`, `:269`); settings-equality assert in the re-route;
  T-RM1 closure note.
- **Stage B (bc file):** fingerprint as an inlined canonical sha1 + provenance test; every `constantsBasis` call
  site; golden fixtures under league; PROVISIONAL tags rewritten, not deleted; doc touch list (`CLAUDE.md:99`,
  `docs/dynasty-scoring.md:72`, `docs/projection.md:352`); A2 reframed around multi-league risk.
- **Registry:** CR-14 Data-side wording re-written so its claims bind; CR-25/CR-27 fire every outcome; CR-01 on any
  F1–F4 wire; CR-18 added; CR-02/08/09 checked, not fired. Companion Mirrors byte-equal (both reviewers).
- **Verified, no flag:** the re-route is byte-identical (0 differences over 16,360 QB rows 2013–2025); every pinned
  artifact's numbers re-derive (calibration 8/8, ceiling 8/8, QB level, total factor); legacyGated = the 09-06 panel
  key for key; no step writes a served file or triggers a writing workflow.
- **Unverified:** end-to-end hand-run reproduction at HEAD, the Q5 fold protocol detail, Q1 row counts under
  half_ppr, live effect sizes, `lib/rookieCapturedLevel.mjs`'s use of `rookieBasisScale`.
