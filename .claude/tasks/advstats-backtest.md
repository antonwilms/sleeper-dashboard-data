# Task: advstats retrospective signal backtest (`lib/backtest.mjs` + `bin/backtest.mjs`)

**Repo:** sleeper-dashboard-data
**Purpose:** Offline, read-only backtest to **gate activation** of the Phase-1a advstats metrics
(`target_share`, `air_yards_share`, `wopr`, `racr`) by measuring their predictive value vs next-season
PPG, **controlling for the volume/share/usage signals the model already has**. Because advstats are
reconstructable from history, this can be measured now without forward snapshots.
**Implementer:** sonnet. Planning-only opus task — **do not edit source from the opus session**.

> This is **not** the snapshot grading harness. `bin/grade.mjs`/`lib/grade.mjs` score forward
> `projectedPPG` against captured outcomes (invariant 8). This tool is offline retrospective analysis:
> **no served file, no ingest, no manifest entry, no schemaVersion, no production path.** It mirrors the
> grade *split* (pure stats in `lib/`, I/O+CLI in `bin/`, dated results folder) but is otherwise separate.

It must clear the empirical bar the project already uses: the aDOT same-season **r = 0.289** study
(demoted to capture-only as volume-confounded) and the **D3 team-RZ-share standardized partial β of
+0.20 RB / +0.17 WR/TE** (2012–2025, controlling for own-rate, overall-share, snap-share). The D3 result
is the **self-validation anchor** (decision 8).

Don't re-list CLAUDE.md invariants — point to them. Cross-repo impact: **none** (§Cross-repo impact).

---

## 0. Grounding (verified against the repo, 2026-06-14)

- **Architecture to mirror:** `lib/grade.mjs` (pure: `mae`/`bias`/`pearson`/`scoreProjections`, no I/O) +
  `scripts/grade-snapshot.mjs` adapter + `bin/grade.mjs` CLI + `grading/<date>.json` via `--write`.
  This tool mirrors that split: pure `lib/backtest.mjs`, I/O+CLI `bin/backtest.mjs`, `backtests/` folder.
  **Reuse `pearson` from `lib/grade.mjs`** (`import { pearson } from '../lib/grade.mjs'`) — don't duplicate it.
- **Predictors — `nflverse/advstats/<year>.json`** (Phase 1a, sleeper-keyed, **WR/TE/RB**, 2012+). Per-player:
  `{ gsisId, name, position, team, targetShare, airYardsShare, wopr, racr, components:{ targets, airYards,
  recYards, receptions, weeks } }`. (RB `racr`/`airYardsShare` are frequently `null` — net-negative
  behind-LOS air yards — which is exactly the RB-noise signal decision 6 expects.)
  **`team` here is the only per-player team source for historical seasons in this repo** (see next point).
- **Outcome + controls — `nfl/season-totals/<year>.json`** (sleeper-keyed, 2012–2025 present). Per-player:
  top-level `fantasyPoints`, `gamesPlayed`; `stats{ rec_tgt, rush_att, rec_rz_tgt, rush_rz_att, pass_rz_att,
  off_snp, tm_off_snp, … }`. **Critical finding: season-totals records carry NO per-player `team` or
  `position`.** `position` comes from the advstats record; **`team` for team-relative denominators
  (overall share, team-RZ-share) must come from the advstats `team` field** — so team grouping only covers
  WR/TE/RB. Consequence (decision 8 caveat): receiving team-totals (`rec_tgt`, `rec_rz_tgt`) are faithful
  (all receivers are in the cohort), but rushing team-totals (`rush_att`, `rush_rz_att`) **undercount QB
  sneaks/scrambles** — the RB β tolerance is loosened accordingly.
- **Both sources are sleeper-keyed → the cohort join is directly on `sleeper_id`. No crosswalk needed.**
- season-totals canonical basis is `half_ppr` across all years → outcome PPG is basis-consistent across the panel.

**Prerequisite (runbook):** advstats files for the backfill window must exist on disk first
(`for y in $(seq 2012 2025); do node bin/update.mjs advstats --year "$y" --force; done`). The tool reads
them read-only; it never writes or ingests.

---

## 1. Methodology decisions 1–8 (recommendation + justification)

### Decision 1 — Outcome & min-games gate
**Outcome = Y+1 PPG = `fantasyPoints / gamesPlayed`**, gated to **outcome-season `gamesPlayed ≥ 6`**.
Justification: PPG on ≤5 games is injury/small-sample noise that inflates outcome variance and biases
correlations; 6 (~⅓ of a 17-game season) suppresses that while retaining the cohort. Tunable via
`--min-games N` (report it in `meta`). Predictor-season games are gated implicitly by the opportunity
gates (decision 2).

### Decision 2 — Cohort gates (predictor season Y), mirroring existing study gates
Per the app's C1 opportunity minimums (docs/projection.md): **RB `rush_att ≥ 30`; WR/TE `rec_tgt ≥ 20`.**
**Do NOT add a receiving-volume floor for RB** — keeping low-target RBs in is the whole point of the
RB-inclusion test (decision 6); their noisy `air_yards_share`/`racr` should show weak/insignificant β
(many rows null → listwise-dropped per metric, with surviving n reported). Per-metric **listwise deletion**:
drop any row whose predictor or any control is `null`/non-finite, and whose team denominator < 20
(the D3 team-denominator guard). Report the surviving `n` per (metric, position).

### Decision 3 — Control covariates (the crux): raw VALUES from season-totals, per position
Controls are recomputed as **raw covariate values from season-totals stat keys** (NOT the app's production
factor multipliers — those aren't needed; we want the underlying volume signal). The control set is the
same three the existing studies control for, identical for the self-validation and the advstats run:

| Control | WR/TE | RB |
|---|---|---|
| `overallShare` | `rec_tgt / teamΣ rec_tgt` | `rush_att / teamΣ rush_att` |
| `snapShare` | `off_snp / tm_off_snp` | `off_snp / tm_off_snp` |
| `rzOwnRate` (D2 own-rate) | `rec_rz_tgt / rec_tgt` | `rush_rz_att / rush_att` |

`snapShare` needs no team grouping (`tm_off_snp` is the team total embedded per player). `overallShare`
needs team totals → summed over the advstats cohort grouped by advstats `team` (decision-0 caveat applies
to rushing). Keeping controls strictly season-totals-derived keeps them **independent of the advstats
predictors**, so a near-zero advstats partial β is interpretable (decision 4). Team-RZ-share (D3) is a
known model signal not in this three-control set; it correlates with `rzOwnRate` (≈0.39) and `overallShare`,
so the three-control set is a reasonable proxy — an `--controls extended` option may add it later (out of
scope for the first pass).

### Decision 4 — Collinearity framing
`target_share` (advstats) ≈ `overallShare` (the control) — expect its **partial β ≈ 0** because it
duplicates a signal already modeled. The candidates that may add **new** signal are `air_yards_share` /
`wopr` / `racr`. The report therefore shows, per candidate: **raw Pearson r** (unadjusted) **and the
standardized partial β** (adjusted), plus the **pairwise correlation of the candidate with each control**,
and **flags** `|r| > 0.8` against any control. So a near-zero partial β reads as **"duplicates volume,"**
not "unrelated to PPG." (For `target_share` vs `overallShare` this is a genuine cross-source check —
advstats nflverse-denominator share vs season-totals-recomputed share should be r ≈ 0.95+.)

### Decision 5 — OLS
Hand-rolled **standardized multiple regression** via normal equations (no heavy dependency — mirrors the
repo's minimal-dep posture). z-score every column (predictor + controls + outcome) → fit **without
intercept** (standardized ⇒ intercept ≈ 0); solve `(XᵀX)β = Xᵀy` by inverting the small `k×k` (k ≤ 5)
Gram matrix via Gauss-Jordan with a singularity guard. The β are **standardized partial coefficients**.
Report: candidate β, each control's β (so own-rate's negative β is visible), raw r, n, R², and the
quintile means (monotonic?).

### Decision 6 — Per-position separate models (WR/TE/RB)
Fit **separate models per position** (WR, TE, RB — and optionally WR+TE pooled). RB is the empirical test
of the Phase-1a RB-inclusion decision: its air-yards metrics are expected noisy (low n after null-drop,
weak β); this run confirms or refutes keeping RB in advstats. Report n prominently per position.

### Decision 7 — Pooling
Pool predictor seasons **2012–2024 → outcomes 2013–2025** (`--from`/`--to` default to this), each row a
(player, Y→Y+1) pair. Optional `--by-season` breakout. **Caveat (stated in every report):** players recur
across pairs → rows are **non-independent**; standard errors are optimistic. First pass does **not** build
clustering — the caveat is explicit and βs are read as effect-size estimates, not significance tests.

### Decision 8 — Self-validation anchor (required)
Before trusting advstats numbers, reproduce the **D3 team-RZ-share** result. Predictor =
**team-RZ-share** (`rush_rz_att / teamΣ rush_rz_att` for RB; `rec_rz_tgt / teamΣ rec_rz_tgt` for WR/TE),
fit with the **same three controls** (decision 3) on 2012–2025 → expect standardized partial β
**≈ +0.20 RB / +0.17 WR/TE**, **own-rate β negative**, **monotonic quintiles** (matches docs/projection.md
Step 5h). Runs as a CLI **`--validate`** mode that loads the real files, fits, and prints **PASS/FAIL** vs
the targets within tolerance: **±0.06 for WR/TE; ±0.08 for RB** (RB looser — rushing team-totals undercount
QB sneaks, decision-0 caveat). PASS also requires the correct **sign**, **own-rate β < 0**, and **monotonic
quintiles**. If it reproduces, the regression machinery is trustworthy; if not, the regression is wrong and
the advstats numbers must not be believed. (A *synthetic* planted-β version of this gates CI — §Tests —
since the real check needs the full backfill on disk and can't be a hermetic unit test.)

---

## 2. `lib/backtest.mjs` — pure stats & cohort transforms (no I/O)

```js
import { pearson } from '../lib/grade.mjs';            // reuse — do not duplicate

export const D3_TARGETS   = { RB: 0.20, WRTE: 0.17 };  // published anchor (decision 8)
export const D3_TOLERANCE = { RB: 0.08, WRTE: 0.06 };
export const TEAM_DENOM_MIN = 20;                       // D3 team-denominator guard
export const DEFAULT_GATES  = { RB: { rush_att: 30 }, WR: { rec_tgt: 20 }, TE: { rec_tgt: 20 } };

// z-score a column. sd = sample stdev (n−1). sd===0 → { z: zeros, mean, sd:0, degenerate:true }.
export function standardize(values) → { z:number[], mean, sd, degenerate }

// Solve standardized OLS without intercept. X: n×k (already standardized), y: n (standardized).
// Gram solve with Gauss-Jordan inverse; singular/degenerate → { beta:null, singular:true }.
export function solveOLS(X, y) → { beta:number[]|null, rSquared:number|null, singular:boolean }

// Build standardized design from rows, listwise-delete null/non-finite, fit, and diagnose.
//   rows: [{ [predictor]:num, [control]:num..., [outcome]:num }]
export function standardizedRegression(rows, { predictor, controls, outcome }) → {
  n,                              // surviving rows after listwise deletion
  beta,                           // candidate predictor's standardized partial β  (null if singular)
  controlBetas: { [control]: β },
  rSquared,
  rawPearson,                     // pearson(predictor, outcome) unadjusted
  collinearity: { [control]: r, flagged:boolean },   // |r|>0.8 against any control ⇒ flagged
  singular,
}

// Quintile response of outcome across predictor quintiles (decision 5).
export function quintileResponse(rows, predictor, outcome, bins = 5) → {
  bins: [{ q, n, meanPredictor, meanOutcome }],
  monotonic,                      // meanOutcome non-decreasing across q
}

// Team totals for a single predictor-season, grouped by advstats `team` (decision 0 caveat).
//   advstatsPlayers: advstatsY.players ; totalsY: season-totals[Y] map
export function computeTeamTotals(advstatsPlayers, totalsY) → {
  [team]: { recTgt, rushAtt, recRzTgt, rushRzAtt }     // summed over the WR/TE/RB cohort on that team
}

// Pure cohort builder for one Y→Y+1 pair and one position. No disk.
export function buildCohortRows(advstatsY, totalsY, totalsY1, {
  position, minOutcomeGames, gates = DEFAULT_GATES, teamTotals,   // teamTotals from computeTeamTotals
}) → [{
  sleeperId, position, team,
  // predictors (from advstats):
  targetShare, airYardsShare, wopr, racr,
  // controls (from season-totals[Y] + teamTotals):
  overallShare, snapShare, rzOwnRate,
  // self-validation predictor (from season-totals[Y] + teamTotals):
  teamRzShare,
  // outcome (from season-totals[Y+1]):
  outcomePPG,
}]
// Inclusion: player present in advstatsY(position) ∧ totalsY ∧ totalsY1; predictor-season opp gate
// passes; outcome gamesPlayed ≥ minOutcomeGames; team denominator ≥ TEAM_DENOM_MIN for any team-relative
// field (else that field is null → listwise-dropped per model). One row per (player, Y).
```

`solveOLS` math: standardized, intercept-free ⇒ `XᵀX` is the k×k correlation-scaled Gram; `Xᵀy` the
predictor-outcome covariances. β = (XᵀX)⁻¹(Xᵀy). Invert via Gauss-Jordan on the augmented `[G | I]`; if any
pivot |.| < 1e-10 → `singular:true, beta:null` (handles perfectly-collinear inputs — decision 4 extreme).

---

## 3. `bin/backtest.mjs` — I/O, CLI, report (mirror `bin/grade.mjs`)

```
node bin/backtest.mjs                              # all metrics × all positions, pooled 2012→2025, stdout
node bin/backtest.mjs --metric air_yards_share --position WR
node bin/backtest.mjs --metric all --position RB --from 2015 --to 2024
node bin/backtest.mjs --min-games 8                # override outcome games floor
node bin/backtest.mjs --validate                  # D3 self-validation (PASS/FAIL vs +0.20/+0.17)
node bin/backtest.mjs --json                       # machine-readable BacktestReport(s)
node bin/backtest.mjs --write                      # persist backtests/<date>-<metric>-<pos>.json
node bin/backtest.mjs --by-season                  # per-season breakout in addition to pooled
```

Flags: `--metric target_share|air_yards_share|wopr|racr|all` (default `all`), `--position WR|TE|RB|all`
(default `all`), `--from YYYY` (default 2012), `--to YYYY` (outcome ceiling, default 2025), `--min-games N`
(default 6), `--validate`, `--json`, `--write`, `--by-season`. Mirror `bin/update.mjs`'s `flag()`/`option()`
arg parsing and the `bin/grade.mjs` dispatch/try-catch shape.

Internals:
- `loadAdvstats(year)` / `loadSeasonTotals(year)` via `lib/io.readJson`; a missing advstats year → warn +
  skip that pair (report which years contributed). A missing season-totals year → skip pair.
- `assembleCohort({ position, fromYear, toYear, minOutcomeGames })`: for each predictor year Y in
  `[fromYear, toYear-1]`, `teamTotals = computeTeamTotals(advstats[Y].players, totals[Y])`, then
  `buildCohortRows(advstats[Y], totals[Y], totals[Y+1], {...})`; concat into the pooled row set.
- `runMetric(rows, metric, position)` → `standardizedRegression(rows, { predictor:metric,
  controls:['overallShare','snapShare','rzOwnRate'], outcome:'outcomePPG' })` + `quintileResponse(rows,
  metric, 'outcomePPG')` → assemble a **BacktestReport**.
- `runValidate({ fromYear, toYear })` → for each of {RB, WR+TE}: `standardizedRegression(rows,
  { predictor:'teamRzShare', controls:[...3], outcome:'outcomePPG' })`; compare β to `D3_TARGETS` within
  `D3_TOLERANCE`, assert own-rate β < 0 and monotonic quintiles; print PASS/FAIL per position + overall.
- `formatHumanReport(report)` to stdout; `writeReport(report)` → `backtests/<YYYY-MM-DD>-<metric>-<position>.json`.
  **No manifest write** (constraint).

**BacktestReport shape:**
```json
{
  "meta": { "metric":"air_yards_share", "position":"WR", "predictorYears":[2012,"…",2024],
            "outcomeYears":[2013,"…",2025], "minOutcomeGames":6,
            "controls":["overallShare","snapShare","rzOwnRate"], "generatedAt":"…" },
  "n": 612,
  "rawPearson": 0.21,
  "standardizedBeta": 0.08,
  "controlBetas": { "overallShare": 0.34, "snapShare": 0.05, "rzOwnRate": -0.02 },
  "rSquared": 0.18,
  "collinearity": { "overallShare": 0.74, "snapShare": 0.31, "rzOwnRate": 0.12, "flagged": false },
  "quintiles": [ { "q":1,"n":122,"meanPredictor":0.05,"meanOutcome":7.1 }, "…" ],
  "monotonic": true,
  "caveats": [
    "Recurring players across Y→Y+1 pairs → rows non-independent; SEs optimistic (decision 7).",
    "RB rushing team-totals undercount QB sneaks (no QB team available) — affects overallShare/teamRzShare denominators for RB only.",
    "n below 30 — interpret with caution."          // when applicable
  ]
}
```

---

## 4. Docs updates

No `docs/` in this repo. Edit README.md and CLAUDE.md; where a quoted "before" can't be matched verbatim,
edit the real text to the specified end state.

### 4.1 README.md
- **New section `## Analysis / Backtesting`** (place after the grading section, before any appendix).
  Document: purpose (offline activation-gate for advstats signals; read-only, no served file); inputs
  (`nflverse/advstats/<year>.json` predictors + `nfl/season-totals/<year>.json` outcome/controls, joined on
  `sleeper_id`); methodology summary (Y→Y+1 lag, per-position WR/TE/RB models, **standardized partial β**
  controlling for overall-share/snap-share/own-rate, raw r, quintile response); the **collinearity framing**
  (decision 4 — target_share ≈ overall share); the **D3 self-validation** (`--validate`, +0.20 RB / +0.17
  WR/TE ± tol) as the trust check; the **prerequisite** (run the advstats backfill first); and the
  **non-independence caveat**. State explicitly: *not* the snapshot grader, no production path, no manifest entry.
- **Commands** — add a Backtest CLI block mirroring the Grading CLI block, listing the flags from §3.
- **`npm run` shortcut** — document `npm run backtest` (added in §4.3).

### 4.2 CLAUDE.md
- **Commands** — add a `### Backtest CLI — bin/backtest.mjs` subsection after the Grading CLI block:
  ```sh
  node bin/backtest.mjs                         # standardized partial β of advstats metrics vs Y+1 PPG
  node bin/backtest.mjs --metric M --position P # M: target_share|air_yards_share|wopr|racr|all
  node bin/backtest.mjs --validate              # D3 team-RZ-share self-validation (trust check)
  node bin/backtest.mjs --write                 # persist backtests/<date>-<metric>-<pos>.json
  # Flags: --from YYYY, --to YYYY, --min-games N, --by-season, --json, --write, --validate
  ```
  Add one line: *"Offline analysis (read-only over advstats + season-totals); **not** wired into smoke; not
  the snapshot grader (that's `bin/grade.mjs`)."* Add `npm run backtest` to the npm-shortcuts line.
- **Navigation map** — add rows:
  ```
  | `lib/backtest.mjs` | Pure backtest stats — `standardize`, `solveOLS`, `standardizedRegression`, `quintileResponse`, `computeTeamTotals`, `buildCohortRows`; reuses `pearson` from `lib/grade.mjs`; no I/O |
  | `bin/backtest.mjs` | Advstats signal-backtest CLI — joins advstats + season-totals on sleeper_id, builds Y→Y+1 cohort, fits per-position standardized OLS, `--validate` D3 anchor, `--write` to `backtests/` |
  | `backtests/` | Backtest reports written by `bin/backtest.mjs --write`, one JSON per metric/position run (analysis only — no manifest entry) |
  ```
- **Smoke & validation** — leave unchanged. Add nothing to `npm run smoke` (constraint: only OLS/matrix
  unit tests gate CI via `npm test`).

### 4.3 package.json
Add `"backtest": "node bin/backtest.mjs"` to `scripts`. **Do not** touch the `smoke` script.

### 4.4 New folder
Create `backtests/.gitkeep` (mirrors `grading/.gitkeep`). Outputs are analysis artifacts; not in the manifest.

---

## 5. Tests to add — `test/backtest.test.mjs` (`node --test`, not Vitest)

Mirror `test/nflverse.test.mjs` style. These (matrix/OLS/builder) are the **only** CI gate for this tool.

**A. OLS recovers known coefficients (decision 5):**
- `Y = 2·X1 + 0·X2`, X1 ⊥ X2, **no noise** → standardized β1 ≈ **1.0**, β2 ≈ **0** (assert `|β1−1| < 1e-6`,
  `|β2| < 1e-6`; `singular === false`). (Standardized slope of a noiseless single driver is its r = 1.)
- Noise variant: `Y = 3·X1 + deterministic-pattern-uncorrelated-with-X1` → β1 high, **X2's β ≈ 0** within
  tolerance — the core "X2 adds nothing" assertion the brief names.
- **Collinearity:** `X2 = X1` (perfectly collinear) → `singular === true`, `beta === null`, **no NaN**.

**B. `buildCohortRows` (lag, gates, join, team totals):**
- Fixtures: `advstats[Y]` with 4 WRs (one with `totals[Y].rec_tgt = 10` → **sub-gate, dropped**); `totals[Y]`;
  `totals[Y+1]` where one player is **missing** (→ dropped) and one has `gamesPlayed = 3 < min` (→ dropped).
  Assert: surviving row count; `outcomePPG === totals[Y+1].fantasyPoints / gamesPlayed` (correct **lag**);
  `overallShare === rec_tgt / teamΣrec_tgt`; `snapShare === off_snp/tm_off_snp`; `rzOwnRate` correct.
- **Team totals:** two WRs on `KC` with `rec_tgt` 100 / 50 → `computeTeamTotals` gives `KC.recTgt === 150`,
  shares 0.667 / 0.333. A team with `teamΣrec_tgt < 20` → that player's `overallShare`/`teamRzShare` null.

**C. `quintileResponse` (binning):**
- 10 ascending values → 5 bins of 2; assert bin means and `monotonic === true`.
- A non-monotonic outcome series → `monotonic === false`.

**D. Synthetic D3 self-validation (machinery proof, gates CI):**
- Construct a fixture cohort where `teamRzShare` is planted with a **known β ≈ +0.18** vs `outcomePPG`
  (e.g. `outcomePPG = 0.18·z(teamRzShare) + 0.30·z(overallShare) − 0.10·z(rzOwnRate) + fixed residual`),
  run `standardizedRegression(predictor:'teamRzShare', controls:[3])`; assert recovered β within ±0.03 of
  0.18 **and** `controlBetas.rzOwnRate < 0` (planted negative). This proves the machinery reproduces a
  known partial β with the expected own-rate sign.
- **Note in the test file header:** the *real* empirical D3 reproduction (+0.20 RB / +0.17 WR/TE on
  2012–2025) is the **`--validate` CLI mode**, which needs the full advstats backfill + season-totals on
  disk and is therefore **not a hermetic unit test**. The synthetic planted-β test above is the CI gate;
  `--validate` is the manual trust check before believing any advstats run.

---

## 6. Cross-repo impact

**None.** This tool is read-only over files already in this repo (`nflverse/advstats/*`, `nfl/season-totals/*`),
writes only to a new `backtests/` analysis folder, adds no served file, no manifest entry, no schemaVersion,
and changes no Cross-repo contract. The app (`sleeper-dashboard`) consumes nothing from it. Its **output** is
evidence that informs a *future* app decision — whether to activate each advstats metric per position as a
live `factors` multiplier (vs leaving it capture-only) — but that activation, if it happens, is a separate
app-side task with its own plan. Nothing here obligates or changes the sibling repo.

---

## 7. Done-definition
1. `npm test` green — Sections A–D pass (the OLS/matrix/builder/quintile + synthetic-D3 tests).
2. `npm run smoke` unchanged and still green (this tool is **not** added to smoke).
3. After the advstats backfill is on disk, `node bin/backtest.mjs --validate` **PASSes** (β within
   ±0.06 WR/TE / ±0.08 RB of +0.17 / +0.20, own-rate β negative, monotonic quintiles) — the gate for
   trusting any advstats β it reports.
4. README.md + CLAUDE.md + package.json edits (§4) applied; `backtests/.gitkeep` created.
5. Task summary states Cross-repo impact: none.
