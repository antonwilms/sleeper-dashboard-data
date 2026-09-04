# R2-REANCHOR activation gate — dual-mode before/after grading (r2-flip-gate)

**Type:** Session-1 implementation plan (planning only — no source edited this session). Analysis-only: no served-asset change, no manifest change, no scoring change. This slice builds and runs the flip gate; **it recommends, it does not flip.** `DEFAULT_ATTRIBUTION` stays `'current-team'` app-side; the flip itself is a downstream app-repo slice gated on this verdict.
**Date:** 2026-07-08.
**Data HEAD at planning:** `47071ce3f88371f6ed177e880b118260d2bd0bde` ("feat: e0a grading harness + first committed baseline verdict") — local HEAD = `origin/main` tip, verified via GitHub MCP `get_commit` this session. Every line anchor below is grounded at this SHA.
**Harness state confirmed at this SHA:** `teamKeyResolver(mode, totalsByYear, anchorYear)` exists (`lib/panel.mjs:51`), internal call sites already pass `(pid, season)`, `'per-season-team'` throws the reserved-mode error (`lib/panel.mjs:55-57`); `assemblePanel({ attribution })` validates against `ATTRIBUTION_MODES` which already lists both modes (`scripts/panel-run.mjs:92-94`, `lib/panel.mjs:26`); `bin/panel.mjs --attribution` parses the flag (`bin/panel.mjs:60`). `test/panel.test.mjs` + `test/panel-integration.test.mjs` green at HEAD (`node --test`: fail 0).
**Substrate (reference, not re-derived):** `.claude/tasks/grading-harness-e0a.md` (§9 seam contract, §3 methodology), `grading/2026-07-08-e0a-verdict.md` (committed baseline + mover-cohort Ns), app repo `.claude/tasks/projection-reanchor-per-season-team.md` §7 (read via GitHub MCP at app HEAD `58e9ed8`) — the dual-mode gate contract this fulfills.

---

## 0. Scope and non-goals

In scope: the `'per-season-team'` resolver branch, a dual-mode comparison layer (flip-gate runner + report + verdict markdown + artifact writes), the committed before/after artifacts, tests, docs.

Non-goals (do not build):
- **The flip.** No `DEFAULT_ATTRIBUTION` change anywhere, no app-repo edit, no plan for the app-side activation commit beyond the Cross-repo section (§11).
- **Candidate re-grading.** `airYardsShare`/`shareLevel` grading is E-0a's business; the flip gate compares the *baseline* under two attributions. `runCandidates` is not called by the flip path.
- **New neutralization.** No forward-mover (offseason Y→Y+1) zeroing is added to either arm — see §1.3 for why this is a deliberate decision, not an omission.
- **Panel re-architecture.** E-0a §9's rule stands: the gate attaches at the resolver + runs the assembler twice. `buildPanelRow`, `assemblePanelRows`, `evaluateModel`, `gradeCandidate` are untouched (§4.1 adds only *new* pure exports next to them).
- **R1-SNAPS window widening.** Panel window stays 2020–2024; an UNDERPOWERED verdict defers to the post-R1-SNAPS re-run rather than widening here.

---

## 1. Design overview — what actually diverges between the modes

This section is load-bearing: it is derived from the live code paths at this SHA and everything downstream (cohort, artifacts, parity checks) leans on it. The implementer should re-verify claims (a)–(d) against source before building.

**(a) Season-Y features are mode-identical.** For anchor year Y, `current-team` resolves `teamOf(pid, s) = totalsByYear[Y][pid].team` for every season s (`lib/panel.mjs:52-53`). For s = Y that is *the same expression* per-season mode uses (`totalsByYear[Y][pid].team`). And season-Y team totals group every record by `teamOf(otherPid, Y)` (`lib/panel.mjs:65-79`, built at `lib/panel.mjs:337`), which is also the same expression in both modes. So `share(Y)`, `teamRzShare`, `rzOwnRate`, `snapShare`, `ypt`, all PPG features, and both candidates (`shareLevel = share(Y)`, `airYardsShare` verbatim) are **identical** in both modes.

**(b) The sole divergent quantity is `shareTrend`'s Y−1 leg.** `computeShare(pid, position, Y−1, …)` (`lib/panel.mjs:149-162`, called from `buildPanelRow` at `lib/panel.mjs:264`) diverges twice over: (i) the *bucket* — `teamOf(pid, Y−1)` is the anchor-Y team under current-team vs the actual season-(Y−1) team under per-season; (ii) the *denominator* — season-(Y−1) team totals are grouped by anchor-Y teams under current-team (retired players drop into `unattributed`, movers mis-bucket — the reproduced app undercount, `lib/panel.mjs:338`), vs true season-(Y−1) groupings under per-season. (ii) shifts `shareTrend` slightly for **every** WR/TE/RB row with a Y−1 record, not just movers.

**(c) Row sets, drops, and folds are identical by construction.** Every drop decision in `buildPanelRow` (`lib/panel.mjs:222-294`) happens on mode-identical quantities: gates/games/outcome/basePPG are team-free; `noTeam` reads v3 directly (`lib/panel.mjs:259`); `noTeamDenominator` fires on `share(Y)`/`teamRzShare(Y)` — mode-identical per (a). A null `share(Y−1)` imputes `shareTrend = 0` (`lib/panel.mjs:265`), never drops. So both runs produce the same (sleeperId × predictorYear × position) row set and the same folds — the comparison is a **paired** design, which is what gives a small cohort usable power (§3.3).

**(d) QB is attribution-invariant.** The QB feature path touches no team key. QB metrics must come out byte-identical across modes — used as a runtime canary (§4.2), not reported as a finding.

**1.3 Neutralization stance (the §7 requirement).** Reanchor §7 requires movers be "neutralized identically" in both modes so the diff isolates attribution from §4b's trend-transfer question. At this SHA the panel applies **no mover-specific zeroing in either mode** — the only neutral-imputation is structural (`share(Y−1)` null → `shareTrend = 0`), and the `shareTrend` code path is mode-blind (only `teamOf` differs). Identical treatment is therefore satisfied *by code path*, vacuously. We deliberately do **not** add app-style forward-mover zeroing to both arms: (i) it would change the current-team arm's numbers away from the committed E-0a baseline, destroying the byte-for-byte confirmation this task demands; (ii) it would zero out exactly the rows where attribution bites, gutting cohort power; (iii) the app-side masking it models is handled honestly by *segmentation* instead (§2.3). Guard: no edit in this slice may introduce a mode-conditional branch anywhere except `teamKeyResolver`.

**1.4 One asymmetric-imputation channel exists and is counted, not hidden.** A row with a Y−1 record whose v3 `team` is null (or whose true Y−1 team denominator is < `TEAM_DENOM_MIN`) gets `share(Y−1) = null → shareTrend = 0` under per-season while current-team computes a (mis-bucketed) value — and vice versa is possible. This is legitimate attribution semantics, but it means the mode diff on those rows mixes re-bucketing with imputation. The report counts them per position (`asymmetricImputationN`) and the `ym1-team-null` segment isolates the v3-null case (§2.2).

---

## 2. The attribution-sensitive cohort (deliverable — get this exactly right)

**2.1 The trap, stated.** Two wrong cohorts are nearby:
- The **offseason-mover cohort the app's neutralization targets** is *forward* movers — team(Y+1) ≠ team(Y), players changing teams between the predictor season and the projected season. Their panel features **do not differ at all between modes** (attribution reads only Y and Y−1). Using this cohort would measure pure noise.
- The **player-grain "moved at any point in 2020–2024" cohort** dilutes: a 2020→2021 mover contributes 2022+ rows whose team-keyed window {Y−1, Y} is single-team — those rows carry only second-order denominator drift. Player-grain N looks bigger; the delta drowns.

The correct cohort is **row-grain**: rows whose *own* team-keyed feature window {Y−1, Y} spans more than one resolvable team. That is where the first-order divergence of §1(b)(i) lives.

**2.2 Row segments (computed by the flip layer, §4.2, from v3 team fields — attribution-independent ground truth):**

| Segment | Rule (per row, WR/TE/RB) | Mode divergence |
|---|---|---|
| `historical-mover` | Y−1 record exists, `team(Y−1)` ≠ `team(Y)`, both non-null | First-order: Y−1 leg re-bucketed. Equals the committed `mover` flag (`computeMover`, `lib/panel.mjs:138-143`) — assert equivalence in T-F2 |
| `ym1-team-null` | Y−1 record exists, v3 `team` null | Asymmetric imputation (§1.4) |
| `single-team` | Y−1 record exists, same team both seasons | Second-order denominator drift only |
| `no-ym1-record` | no Y−1 record | None (`shareTrend = 0` both modes) |

**Attribution-sensitive := `historical-mover` ∪ `ym1-team-null`.** QB rows are classified but excluded from all cohort analysis (§1(d)).

**2.3 The overlap with the neutralization target, reasoned explicitly.** Independently of the segments above, each sensitive row is flagged `forwardMover` (team(Y+1) ≠ team(Y), both non-null — Y+1 team is in `totalsByYear` since the assembler loads `toYear + 1`). For a player who is *both* multi-team-history and a forward mover, the app's Step 3/5h neutralization will suppress the corrected `shareTrend` at flip — the panel's measured delta on that row will **not** materialize in the app's projection path. It **will** materialize in the dynasty share-boost, which has no neutralization (reanchor §4b's named asymmetry). So the report splits the sensitive cohort into `forwardMover: false` (the app-realizable projection-path slice — this is where the flip's projection effect is actually visible) and `forwardMover: true` (the slice whose feature-level delta is a direct proxy for the ungated dynasty-channel exposure, §11(a)). The **verdict's cohort clause is evaluated on the full sensitive cohort** (pre-registered, matches the prompt's criterion); the split is mandatory supporting evidence in both artifacts.

**2.4 Expected N and power honesty.** From the committed E-0a verdict's mover counts (eval years 2022–2024, and mover ≡ `historical-mover`): WR 69, RB 35, TE 28 — pooled 132 (+ whatever `ym1-team-null` adds). Pooled across share positions the gate is expected to be powered (§3.4's N_MIN = 60); **TE alone (~28) and RB alone (~35) are individually thin** — the verdict must state per-position cohort N next to every per-position cohort number and must not present a per-position cohort delta as decisive where n < 30. Within-year cohort Spearman follows the existing n ≥ 10 rule (`lib/panel.mjs:500-505`) and will frequently be null — report the n so the null is legible.

---

## 3. Comparison methodology (pre-registered here; the verdict may not move these goalposts)

**3.1 The run.** `runFlipGate` assembles the panel **twice** via the existing `assemblePanel` — once per mode, all other config identical (defaults: 2020–2024, in-basis, pinned snapshot `2026-07-05`, λ=1.0) — then runs `runBaseline` per mode on the same folds (`forwardChainFolds`, eval years 2022–2024). Per E-0a §9 this is exactly the sanctioned attachment: resolver + run-the-assembler-twice. Duplicate file I/O is accepted (deterministic, seconds).

**3.2 Parity gates (hard-fail, not warnings).** Before any metric is reported: (i) row-set identity on (sleeperId, predictorYear, position); (ii) per-row equality of every feature except `shareTrend`, and of both candidates and `outcomePPG` (strict `===` — same floats through the same code path); (iii) `coverage.perPositionYear` deep-equal; (iv) QB pooled MAE/Spearman |Δ| < 1e-9. Any violation throws — it would mean §1's analysis no longer matches the code, and silently proceeding would corrupt the verdict. `coverage.unattributedByYear` is *expected* to differ (it quantifies the undercount repair — report both modes' counts in the verdict as evidence).

**3.3 Metrics.** Per position (WR/RB/TE; QB canary-only):
- **Overall:** pooled MAE, per-eval-year within-year Spearman + n-weighted mean, per mode; deltas (per-season − current-team; negative ΔMAE = per-season better); relative ΔMAE (÷ current-team MAE).
- **Sensitive cohort:** same, on predictions joined back to rows by (pid, evalYear) and filtered to sensitive segments; plus the forwardMover split (§2.3) and the `single-team` segment for contrast.
- **Paired per-row deltas (the small-N instrument):** for each eval row, `Δ|resid| = |pred_ps − actual| − |pred_ct − actual|` and `predShift = pred_ps − pred_ct`. Report mean/median Δ|resid|, % rows improved, max |predShift|, per position and pooled across share positions (pooled with the stated caveat that PPG scales differ by position). The verdict md lists the top 10 |predShift| rows (pid, team, year, both predictions, actual) for eyeball audit.
- **Feature-level delta (mechanism evidence, pre-model):** per position × segment, stats of `shareTrend_ps − shareTrend_ct` (n, mean |Δ|, p90 |Δ|, max |Δ|) + `asymmetricImputationN` (§1.4). This is what proves the delta flows through the one predicted channel.
- **λ-sweep:** overall + cohort ΔMAE recomputed at λ ∈ {0.5, 1, 2} and reported. Verdict labels are computed at λ=1 only (pre-registered); a sign flip to material degradation elsewhere in the sweep must be flagged in the verdict prose but does not move the label.
- **C4 discipline:** unchanged and unthreatened — both modes compute every rate as a ratio of summed season components (`buildTeamTotalsForSeason` sums, `computeShare`/`computeTeamRzShare` divide); nothing in this slice averages per-game values. T-F4 pins it under the new mode.

**3.4 Flip-verdict rules (ordered, pure, table-tested).** Pre-registered thresholds, exported as `FLIP_THRESHOLDS` (§4.1): `nMinSensitivePooled = 60`, `overallRelMaeTol = +0.005` (the E-0a NO-GAIN convention), `overallSpearmanTol = −0.01`, `cohortRelMaeTol = +0.02` (wider — cohort n is an order of magnitude smaller; deliberate, stated).

1. **UNDERPOWERED** — pooled sensitive-cohort eval-row N across WR/RB/TE < 60. Recommendation text: defer the flip, re-run this gate after R1-SNAPS widens the panel to 2013+ (the re-run is: same command, no code change — window config only). Expected not to trigger at ~132.
2. **FLIP-DEGRADES** — any share position's overall relΔMAE > +0.005, OR any share position's n-weighted ΔSpearman < −0.01, OR pooled sensitive-cohort relΔMAE > +0.02. Recommendation text: do not flip; **required investigation section** in the verdict: was current-team compensating — check (i) whether the degradation concentrates in the `forwardMover: true` slice (trend-transfer question masquerading as attribution, reanchor §4b) and (ii) whether it concentrates in rows whose per-season Y−1 share was null-imputed (asymmetric imputation, §1.4 — provenance/fallback analogue), before concluding correct attribution genuinely predicts worse.
3. **FLIP-CLEARS** — otherwise (no overall degradation beyond tolerance on any share position AND sensitive cohort improves or holds). Recommendation text: the data-side gate clears; the app-side activation slice may proceed per §11.

**3.5 Age-blindness — reduced relevance, stated so the verdict is not wrongly discounted.** The E-0a baseline is age-blind, and candidate CLEARS verdicts are correctly held provisional-pending-age (a candidate can proxy age). That discount does **not** transfer here: this is a within-panel A/B where both arms are equally age-blind, and age does not change which team a past season belongs to — attribution accuracy and the age omission are orthogonal. The verdict md must carry this paragraph verbatim-ish so a future reader doesn't apply the candidate-verdict caveat to the flip verdict. (The generic caveats that *do* transfer: row non-independence, gp ≥ 6 survivorship, reconstructable-baseline-not-full-app-stack.)

---

## 4. Edits, grouped by file

### 4.1 `lib/panel.mjs` (one modified function + new pure exports; nothing else touched)

1. **`teamKeyResolver` — the one behavioral edit** (function at `lib/panel.mjs:51-59`). Replace the throw branch (lines 55-57) with:
   ```js
   if (mode === 'per-season-team') {
     return (pid, season) => totalsByYear[season]?.[pid]?.team ?? null;
   }
   ```
   The `'current-team'` branch (lines 52-54) and the unknown-mode throw (line 58) are **byte-for-byte untouched**. Numeric `season` against string-keyed `totalsByYear` is fine (property coercion; the current-team branch already relies on it with `anchorYear`). Rewrite the seam comment block (lines 44-50): drop "R2 adds the per-season-team branch … resolver-only change", describe both modes ('current-team' = anchor-year stand-in reproducing the app's mis-attribution; 'per-season-team' = each season's own v3 team, era-accurate) and point at this task file for the gate semantics.

2. **New pure exports — append after `decideVerdict` (ends `lib/panel.mjs:612`);** no existing function modified:
   ```js
   export const FLIP_VERDICTS = ['FLIP-CLEARS', 'FLIP-DEGRADES', 'UNDERPOWERED'];
   export const FLIP_THRESHOLDS = {
     nMinSensitivePooled: 60, overallRelMaeTol: 0.005,
     overallSpearmanTol: -0.01, cohortRelMaeTol: 0.02,
   };

   // Row-grain attribution segments (§2.2) from a lite team lookup
   // { [year]: { [pid]: { team } } } built from v3 season-totals — ground truth,
   // attribution-independent (same convention as computeMover).
   export function classifyAttributionCohort(pid, anchorYear, teamsByYear)
     → { segment: 'historical-mover'|'ym1-team-null'|'single-team'|'no-ym1-record',
         sensitive: boolean, forwardMover: boolean }

   // Paired join of two modes' prediction lists on (pid, evalYear); throws on
   // set mismatch (parity gate §3.2 at prediction grain).
   export function pairPredictions(predsCT, predsPS)
     → [{ pid, evalYear, actual, predCT, predPS, deltaAbsErr, predShift }]

   // MAE/paired/Spearman summary over one already-filtered paired subset.
   // Within-year Spearman per mode via the existing spearman() with the n≥10 rule.
   export function summarizeModeDelta(pairedRows)
     → { n, mae: { currentTeam, perSeasonTeam, delta, relDelta },
         paired: { meanDeltaAbsErr, medianDeltaAbsErr, pctImproved, maxAbsPredShift },
         spearmanByYear: { [year]: { n, currentTeam, perSeasonTeam } } }

   // shareTrend_ps − shareTrend_ct distribution per segment (§3.3 mechanism
   // evidence) over rows joined by (sleeperId, predictorYear).
   export function summarizeFeatureDelta(rowsCT, rowsPS, cohortByKey)
     → { perSegment: { [segment]: { n, meanAbsDelta, p90AbsDelta, maxAbsDelta } },
         asymmetricImputationN }

   // §3.4 ordered rules. Pure, table-tested (T-F6).
   export function decideFlipVerdict({ sensitivePooledN, perPosition, cohortPooledRelDMae },
                                     thresholds = FLIP_THRESHOLDS) → verdict
   // perPosition: [{ position, overallRelDMae, dSpearman }] — share positions only.
   ```
   Design note (deliberate, so the implementer doesn't "improve" it): cohort classification lives in the flip layer, **not** as a new `buildPanelRow` field. Keeping `PanelRow` and the e0a artifact shape frozen is what makes the byte-for-byte confirmation (§6) trivial and honors E-0a §9's two-attachment-points rule. The committed r2flip panel rows get `attributionCohort` attached at merge time in `panel-run` (§4.2), not in lib assembly.

### 4.2 `scripts/panel-run.mjs` (new exports appended after `writeArtifacts`, ends line 325; existing exports untouched)

```js
// Lite team lookup for cohort classification: reads v3 season-totals for
// [fromYear−1 .. toYear+1] via load.loadSeasonTotals, keeps only { team } per pid.
export function loadTeamLookup(fromYear, toYear, load) → { [year]: { [pid]: { team } } }

// Assembles both modes (assemblePanel × 2, identical config), enforces §3.2
// parity gates (throws on violation), classifies rows, annotates predictions.
export function runFlipGate({ fromYear, toYear, basis, scoringFrom, minOutcomeGames,
                              ridgeLambda, ridgeSweep, load })
  → { panels: { currentTeam, perSeasonTeam },      // full assemblePanel outputs, in-memory
      baselines: { currentTeam, perSeasonTeam },   // runBaseline outputs per mode
      cohortByKey,                                  // Map('pid|year' → classifyAttributionCohort result)
      flipReport }                                  // buildFlipReport output

export function buildFlipReport({ panels, baselines, cohortByKey, opts }) → FlipReport
export function buildFlipVerdictMarkdown(flipReport) → string
export function buildMergedFlipPanel({ panels, cohortByKey }) → MergedFlipPanel
export function writeFlipArtifacts({ mergedPanel, flipReport, verdictMd })
  → { panelPath, fitPath, verdictPath }             // §5 names; NO manifest calls
```

**`FlipReport` shape (the fit artifact):**
```js
{ meta: { generatedAt, panelYears, modes: ['current-team','per-season-team'], basis,
          gates, minOutcomeGames, minTrainSeasons, ridgeLambda, ridgeSweep, evalYears,
          thresholds: FLIP_THRESHOLDS },
  rowParity: { identical: true, n, checkedFeatures },   // §3.2 (i)-(iii) evidence
  qbInvariance: { maeDeltaAbs, spearmanDeltaAbs, pass }, // §3.2 (iv)
  undercountRepair: { unattributedByYear: { currentTeam, perSeasonTeam } },
  featureDelta: { perPosition: { WR: summarizeFeatureDelta, RB, TE } },
  perPosition: { WR: {
      overall: { currentTeam: { n, mae, spearmanMean, perYear }, perSeasonTeam: {…},
                 delta: { mae, relMae, spearman } },
      cohorts: { sensitive: summarizeModeDelta + { nByYear, byPosition n },
                 sensitiveForwardMover: summarizeModeDelta,      // §2.3 split
                 sensitiveNotForwardMover: summarizeModeDelta,
                 ym1TeamNull: summarizeModeDelta,                 // §1.4 isolate
                 singleTeam: summarizeModeDelta } },              // drift contrast
    RB: {…}, TE: {…}, QB: { canaryOnly: true } },
  cohortPooled: { n, relDMae, paired: {…} },           // WR+RB+TE sensitive, §3.3 scale caveat in verdict
  sweep: [{ lambda, overallDMaeByPosition, cohortDMae }],
  verdict: 'FLIP-CLEARS'|'FLIP-DEGRADES'|'UNDERPOWERED',
  verdictInputs: { sensitivePooledN, perPosition, cohortPooledRelDMae } }
```

**`MergedFlipPanel` (the both-mode panel artifact — single file, not two):** the two panels are ~97% identical bytes (e0a panel is 833 KB; §1 proves only `shareTrend` diverges), so committing two full copies is waste and hides the diff. Shape:
```js
{ meta: { …currentTeam panel meta minus attribution, modes: [both], rowParity: { identical, n } },
  coverage: { perPositionYear,            // shared — §3.2 (iii) asserted identical
              skippedYears,
              unattributedByYear: { currentTeam, perSeasonTeam } },
  rows: [ { …current-team PanelRow verbatim,
            attributionCohort: { segment, sensitive, forwardMover },
            perSeasonTeam: { shareTrend } } ] }      // the ONLY nested divergent value
```
Merge asserts (again) that no key other than `features.shareTrend` differs; QB rows get `perSeasonTeam: { shareTrend: null }` omitted (no shareTrend feature).

**Verdict markdown (`buildFlipVerdictMarkdown`) required sections, in order:** header (date, config, both modes, reproduce command `node bin/panel.mjs --flip-gate --write`); parity + QB-canary statement; undercount-repair table (unattributed counts per year per mode); cohort-definition paragraph (§2.1's trap stated, so the artifact is self-explaining) + segment N table per position; feature-delta table; overall before/after table per position; sensitive-cohort before/after incl. the forwardMover split + per-position n warnings (§2.4); top-10 predShift rows; λ-sweep table; **the verdict label + its §3.4 recommendation text** (+ the required investigation section when FLIP-DEGRADES); methodology notes — §3.5's age-blindness-reduced-relevance paragraph, non-independence, survivorship, the §1.3 neutralization stance ("identical-by-code-path; forward-mover masking handled by segmentation, not zeroing"), C4 statement, and "this verdict recommends; the flip is a separate app-repo activation commit gated on it."

### 4.3 `bin/panel.mjs` (flag + dispatch + header)

- Header usage comment (lines 12-21): add `--flip-gate` line; fix the `--attribution` line ("'per-season-team' throws (reserved for R2)" → "current-team|per-season-team").
- Arg parsing (after line 62): `const flipGate = flag('--flip-gate');`. Guard: `--flip-gate` together with `--attribution` is a config error (exit 1, "flip-gate runs both modes; drop --attribution") — placed with the other validation at lines 64-71.
- Dispatch (inside the try, branching before the existing single-mode path at line 73): when `flipGate`, call `runFlipGate({ fromYear, toYear, basis, scoringFrom, minOutcomeGames, ridgeLambda, ridgeSweep: PANEL_DEFAULTS.ridgeSweep })`, print `buildFlipVerdictMarkdown` (or `flipReport` JSON under `--json`), and under `--write` call `buildMergedFlipPanel` + `writeFlipArtifacts` and log the three paths — mirroring lines 79-90. Single-mode path (incl. plain `--attribution per-season-team`, which now works for ad-hoc runs) unchanged. Exit codes unchanged (verdicts are findings; parity-gate throws exit 1 via the existing catch).

### 4.4 `package.json`

Scripts block: add `"panel:flip": "node bin/panel.mjs --flip-gate",` after `"panel"` (line 16). Not wired into smoke (same stance as panel/backtest).

---

## 5. Committed artifacts (the deliverable)

Written by `--flip-gate --write`, date-stamped, named to never collide with the e0a family:

1. **`backtests/<YYYY-MM-DD>-r2flip-panel.json`** — the MergedFlipPanel (§4.2). ~0.9 MB expected.
2. **`backtests/<YYYY-MM-DD>-r2flip-fit.json`** — the FlipReport (§4.2).
3. **`grading/<YYYY-MM-DD>-r2flip-verdict.md`** — the human-readable verdict (§4.2 template).

Manifest stance: none registered — the exact unregistered-analysis precedent E-0a documented (CLAUDE.md `backtests/`/`grading/` rows; the Invariant-3 exception boundary is already written down). No served file changes → **no CDN purge owed**. The `<date>-e0a-*` naming stays exclusively E-0a's; the T-12 artifact test's regexes (`test/panel-integration.test.mjs:208-210`) will not match r2flip files, so T-12 needs **no edit** — r2flip artifacts get their own validation test (T-F8).

---

## 6. Byte-for-byte confirmation that 'current-team' is unchanged

Three independent checks, all required before the gate run is trusted:

1. **Static:** the only behavioral diff in `lib/panel.mjs` is inside the `mode === 'per-season-team'` branch; `git diff` shows no change to the current-team branch, `buildPanelRow`, `assemblePanelRows`, or any metric function.
2. **Regression vs the committed artifact:** data inputs are unchanged since the e0a run (same HEAD). Run `node bin/panel.mjs --json > /tmp/post-edit-fit.json` and compare `jq -S 'del(.meta.generatedAt)' /tmp/post-edit-fit.json` against `jq -S 'del(.meta.generatedAt)' backtests/2026-07-08-e0a-fit.json` — must be byte-identical (`diff` empty). This proves the default e0a path is untouched end-to-end.
3. **In-run parity gates** (§3.2): within the flip run itself, the current-team arm's rows equal the per-season arm's rows on every mode-identical quantity, and QB is invariant — so the before/after isolates attribution and nothing else.

---

## 7. The run

```sh
node bin/panel.mjs --flip-gate            # dry: verdict md to stdout, no writes
node bin/panel.mjs --flip-gate --write    # persist the three §5 artifacts
```
Inspect the verdict (coverage sane, parity `identical: true`, QB canary pass, cohort Ns ≈ §2.4 expectations, verdict label consistent with the printed inputs) before committing.

---

## 8. Step sequence for the implementer

1. `lib/panel.mjs`: resolver branch + seam-comment rewrite (§4.1.1). Immediately update the stale throw test (T-F1 replaces `test/panel.test.mjs:158-162` — step 3) or this step leaves `npm test` red; fine to do 1+3 together.
2. `lib/panel.mjs`: new pure exports (§4.1.2).
3. Tests T-F1–T-F6 (§10) against the pure layer.
4. `scripts/panel-run.mjs`: `loadTeamLookup`, `runFlipGate`, `buildFlipReport`, `buildFlipVerdictMarkdown`, `buildMergedFlipPanel`, `writeFlipArtifacts` (§4.2).
5. `bin/panel.mjs` + `package.json` (§4.3/§4.4). Tests T-F7–T-F8.
6. `npm test` green; `npm run smoke` green (must be untouched by this slice).
7. **Byte-for-byte confirmation** (§6 check 2) — do this BEFORE the gate run; if the diff is non-empty, stop and fix, do not run the gate.
8. **The gate run:** `node bin/panel.mjs --flip-gate --write` (§7); inspect; then docs (§9).
9. Session git workflow (CLAUDE.md): commit source + tests + docs + the three artifacts (`feat: r2 flip gate — dual-mode attribution comparison + committed verdict`), `git pull --rebase origin main` (manifest untouched this slice → any conflict is other-side-only; resolve per the standing union rule), `git push origin main`. No CDN purge (no served file).
10. Task summary must state: the verdict label + its recommendation; the §2 cohort definition and per-position Ns; the §1.3 neutralization stance; the §11 cross-repo items verbatim enough for the app session to act without re-reading this file.

---

## 9. Docs updates

1. **`README.md:1146`** (E-0a Attribution-mode paragraph) — replace the last sentence "`'per-season-team'` is reserved for the R2-REANCHOR gate slice and throws if requested." with: "`'per-season-team'` attributes each historical season to that season's own v3 team (era-accurate) — implemented for the R2-REANCHOR flip gate; see the R2 flip gate subsection below."
2. **`README.md` — new sub-subsection after line 1159** ("Reproduce: `node bin/panel.mjs --write`."), titled **"### R2 flip gate (`--flip-gate`) — dual-mode attribution comparison"**, ~25 lines covering: purpose (the activation gate for the app's `DEFAULT_ATTRIBUTION` flip; recommends, never flips); what diverges and why (one paragraph of §1: only `shareTrend`'s Y−1 leg; rows/folds identical; QB canary); the attribution-sensitive cohort definition incl. the §2.1 trap sentence ("not the offseason-mover cohort the app's neutralization targets") and the forwardMover split; verdict labels + the §3.4 thresholds verbatim; artifact names (`<date>-r2flip-{panel,fit}.json`, `<date>-r2flip-verdict.md`, unregistered); reproduce: `node bin/panel.mjs --flip-gate --write`; the §3.5 age-blindness note in one line.
3. **`CLAUDE.md:93-98` Panel CLI block** — add under the `--write` line: `node bin/panel.mjs --flip-gate --write    # R2 flip gate: both attribution modes + before/after verdict (backtests/<date>-r2flip-*, grading/<date>-r2flip-verdict.md)`; in the Flags comment change `--attribution current-team` → `--attribution current-team|per-season-team` and append `--flip-gate`. Add `npm run panel:flip` to the npm-shortcut sentence.
4. **`CLAUDE.md` navigation map** — `bin/panel.mjs` row (line 149): append "; `--flip-gate` runs the R2 dual-mode attribution comparison". `scripts/panel-run.mjs` row (line 150): append "; R2 flip-gate runner (`runFlipGate` — both modes, parity-gated, verdict per `.claude/tasks/r2-flip-gate.md`)". `backtests/` row (line 152): append "; and `<date>-r2flip-{panel,fit}.json` from `--flip-gate --write`". `grading/` row (line 161): append "; and `<date>-r2flip-verdict.md` (same unregistered convention)".
5. **`data-catalog.md:196`** (`backtests/` bullet) — append: "…and the R2 flip-gate artifacts (`<date>-r2flip-{panel,fit}.json`) from `bin/panel.mjs --flip-gate --write`." **`data-catalog.md:197`** — extend the grading bullet to "…unregistered analysis reports (`<date>-e0a-verdict.md`, `<date>-r2flip-verdict.md`)…". **`data-catalog.md:92`** (grading-reports Note) — same two-name extension.
6. **In-code headers** — `bin/panel.mjs:12-21` usage block (§4.3); `lib/panel.mjs:44-50` seam comment (§4.1.1).
7. **Deliberately NOT edited:** `grading/2026-07-08-e0a-verdict.md` and the e0a backtests JSONs (committed dated snapshots — their "reserved for R2" wording was true at their date); `.claude/tasks/grading-harness-e0a.md` (historical plan). The data CLAUDE.md **Cross-repo contracts table is untouched in this slice** — the season-totals-v3 row's flip-time annotation is an [on-flip] item recorded in §11(c), not done now.

---

## 10. Tests to add

Extend `test/panel.test.mjs` (pure units) and `test/panel-integration.test.mjs` (injectable-loader end-to-end + committed-artifact validation). All `node --test`, run by existing `npm test`. The existing integration fixture already contains a mover (w2: KC through 2022, DAL from 2023 — `test/panel-integration.test.mjs:102`) — reuse it.

- **T-F1 (edit + add) resolver behavior** — REPLACE the throw assertion at `test/panel.test.mjs:158-162` with: multi-team fixture (pid team 'A' in the 2020 file, 'B' in 2021) → `teamKeyResolver('per-season-team', …)` returns 'A' for `(pid, 2020)`, 'B' for `(pid, 2021)`; v3 `team: null` season → null; season absent from `totalsByYear` → null; anchorYear argument ignored. Keep/extend the current-team assertions and the unknown-mode throw (line 166) unchanged.
- **T-F2 both-mode parity + sole-divergence** — fixture with a mover: assemble under both modes → identical row keys, drop counts, and every feature/candidate/outcome except `shareTrend`; the mover row's `shareTrend` differs; `classifyAttributionCohort` marks it `historical-mover` and equals the row's committed `mover` flag; QB rows byte-equal.
- **T-F3 neutralized-AND-multi-team overlap (the prompt's named edge)** — a player with team 'A' (Y−1) → 'B' (Y) → 'C' (Y+1): `segment === 'historical-mover'` AND `forwardMover === true`; his `shareTrend` still differs across modes (no forward zeroing exists in the panel — §1.3); `buildFlipReport` buckets him under `sensitiveForwardMover` and NOT under `sensitiveNotForwardMover`.
- **T-F4 C4 under per-season mode** — fixture where averaging per-game shares would differ from ratio-of-sums: `share(Y−1)` under per-season mode equals summed `rec_tgt` ÷ summed true-Y−1-team `recTgt` (mirror of e0a T-1, exercised through the new resolver).
- **T-F5 asymmetric imputation** — Y−1 record with `team: null`: per-season `shareTrend === 0` (null leg imputed), current-team `shareTrend` computed; `segment === 'ym1-team-null'`; `summarizeFeatureDelta` counts it in `asymmetricImputationN`.
- **T-F6 flip-verdict rules** — table-driven over `decideFlipVerdict`: one case per label; ordering edges (UNDERPOWERED wins even when deltas degrade; cohort degradation beyond +2% → FLIP-DEGRADES even when every overall improves; overall Spearman drop beyond −0.01 → FLIP-DEGRADES; all boundaries land exactly on the thresholds → FLIP-CLEARS side per §3.4's strict `>` comparisons).
- **T-F7 flip-gate integration** — synthetic multi-year dataset (reuse/extend the T-11 fixture: mover + hole year + QB) through `runFlipGate` with injectable `load` → FlipReport well-formedness (every §4.2 key; `rowParity.identical === true`; `qbInvariance.pass === true`; verdict ∈ `FLIP_VERDICTS`); `buildFlipVerdictMarkdown` contains the cohort table, the undercount table, and the verdict line; `buildMergedFlipPanel` rows carry `attributionCohort` + `perSeasonTeam.shareTrend` and nothing else diverges. Also a negative test: tamper one per-season row's `snapShare` before the parity check → `runFlipGate`'s parity gate throws.
- **T-F8 committed r2flip artifact validation** — sibling of T-12 (same skip-if-absent pattern, `test/panel-integration.test.mjs:201-221`): glob `backtests/*-r2flip-panel.json` / `*-r2flip-fit.json` / `grading/*-r2flip-verdict.md`; when present validate: fit `verdict ∈ FLIP_VERDICTS`, `meta.modes` lists both modes, `rowParity.identical === true`, panel rows carry `attributionCohort.segment` ∈ the four segments, verdict md contains the reproduce command. **T-12 itself needs no edit** (e0a-scoped regexes, `test/panel-integration.test.mjs:208-210`; its `attribution === 'current-team'` assertion at line 221 keeps guarding e0a artifacts only).

---

## 11. Cross-repo impact — what the app repo does when this verdict clears

**Contracts: none in this slice.** No served shape, no manifest field, no scoring math, no `bin/update.mjs` subcommand. The artifacts are additive and unregistered. Everything below is the *downstream* app-repo activation slice, recorded here so the verdict is actionable.

**On FLIP-CLEARS, the app-repo activation slice is:**
1. **The flip itself: one line** — `DEFAULT_ATTRIBUTION = 'current-team'` → `'per-season-team'` in `src/utils/teamContext.js`, plus the single T-1 assertion update the reanchor plan pre-arranged (its parity test pins the constant) and the reanchor §9 items marked [on-flip]. State the flip date in the activation commit message (snapshot pre/post cohorts are date-distinguishable — reanchor §11.2).
2. **(a) Dynasty share-boost — the ungated channel.** The boost (`dynastyScore.js:895-903`) has no team-change neutralization, so the flip moves dynasty scores for movers through a channel this gate's *accuracy* metrics don't cover (the panel grades next-season PPG, not dynasty scores). Decision for this plan: **do not extend this gate to compute dynasty-score deltas** (that requires app-side scoring code; out of the data repo's reach and this slice's scope). Instead this gate ships the decision input: the `sensitiveForwardMover` segment's feature-level `shareTrend` delta distribution (§2.3/§3.3) is precisely the input shift the boost will consume ungated. The app-side flip slice must read that block and decide hold-the-boost-at-flip vs accept-and-monitor; if the distribution shows large shifts (e.g. p90 |Δ| comparable to the boost's ±8/4-point trigger sensitivity), holding the boost at flip is the conservative default. The verdict md must carry this pointer explicitly.
3. **(b) Provenance-dependent fallback — document at flip.** Post-flip, v3-served seasons get per-season attribution while live-API-aggregated seasons and v1/v2 cache entries silently fall back to current-team (reanchor §1's load-bearing fallback) — the same player can get different projections by cache provenance. The app-side slice must document this (reanchor §9 item 4's [on-flip] rewrite + one explicit provenance sentence) and should log/flag fallback engagement if cheap. This gate cannot measure it (the panel reads served v3 only — the fallback never fires here); the DEGRADES-investigation clause (§3.4.2(ii)) is the nearest data-side analogue and the verdict should say so.
4. **(c) v3 `team` graduates to scoring-load-bearing.** At flip, season-totals v3's per-season `team` — today display-only in the app — starts feeding Step 3/5h and dynasty scoring. The data repo's dominant-team derivation (`lib/sleeper.mjs` `aggregateWeeks` lines 198-239: most played weeks, ties → later stint, zero-played → last seen) becomes a **silent-scoring-change surface**: any future edit to that rule changes app scoring with no app-side diff. [On-flip data-repo doc item]: annotate the season-totals row of CLAUDE.md's Cross-repo contracts table ("per-season `team` is scoring-load-bearing post-flip (R2); changes to the dominant-team rule in `aggregateWeeks` are scoring changes — flag cross-repo") and mirror one line in `data-catalog.md`'s season-totals section. Not done in this slice (§9.7) — it belongs to the flip commit's cross-repo coordination so the annotation's effective-date matches reality.

**On FLIP-DEGRADES:** no app action; the required investigation section (§3.4.2) runs first, here in the data repo.
**On UNDERPOWERED:** no app action; re-run this gate unchanged after R1-SNAPS widens the panel window.
