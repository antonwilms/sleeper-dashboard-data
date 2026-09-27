# In-season evidence — Phase 2c: rookies and short-history players on the dynasty side (offline)

Session 1 (opus), 2026-09-27. Implementation: Session 2 (sonnet). **Offline analysis only.**
Companion (registry text, not for Session 2): `.claude/tasks/in-season-evidence-2c-registry.md`.

## 0. Goal and fixed decisions

Phase 2b is live (app `4b5e8e1`). Veterans with a full last season (the **standard** population) have a
dynasty level that updates with the live season via `K_DYN_POINTS_HISTORY`. Two groups were left
unchanged because nothing measured a weight for the prior their dynasty score actually uses:

- **Prospects.** The app's `computeProspectScore` (`src/utils/dynastyScore.js:532`) builds a prior PPG as
  `POSITION_PRIOR_PPG[pos] × ageMultiplier(age) × draftMultiplier(pick)`. It blends that prior with the
  **last completed** season at `8 : min(gp, 12)`, normalises against the position peak, and then lets KTC
  anchor 60% of the score. The live season never enters.
- **SHORT veterans** (last season < 8 games). Their dynasty score reads only completed seasons of ≥ 8 games.

Anton's goal is that breakouts and waiver pickups, who mostly fall in these two groups, move dynasty
value in-season. This slice measures how, reusing the Phase 2a machinery (`scripts/inseason-run.mjs`
`assembleSeason`, `lib/inSeasonEvidence.mjs`). It answers:

- **Q1** Which prior should the prospect side use?
- **Q2** What is the history-prior k for SHORT veterans?
- **Q3** How much of the signal does the KTC anchor leave on the table?

**Never write** `nfl/`, `nflverse/`, `college/`, `ktc/`, `snapshots/`, `enrichment/`, `manifest.json`,
`cross-repo-registry.md` or `.github/workflows/`. Outputs go to `backtests/` and `grading/` only
(unregistered; this is the documented Invariant 3 exception for analysis output).

**Basis: pinned `half_ppr`.** k is dimensionless, so the half-PPR panel is acceptable, and the verdict
says so. It fits arm A exactly: `POSITION_PRIOR_PPG` is half-PPR-calibrated, and the app scales it by
`positionBasisScale`, which is 1 on a half-PPR basis. A league-basis refit stays with backlog D-45.

**Horizon: next season only.** The outcome is S+1 PPG with gp ≥ 6 (2a's `nextPPG`), for outcome seasons
S = 2014..2024. That is the dynasty horizon. No rest-of-season cell is fitted.

### Session 1 decisions

| # | Decision | Reason |
|---|---|---|
| D1 | New sub-mode **`bin/backtest.mjs --inseason --dynasty`**, adapter **`scripts/inseason-dyn-run.mjs`**, pure additions to `lib/inSeasonEvidence.mjs`. Rows come from 2a's exported `assembleSeason(S, env)`, unchanged. | The Q1 arm-B prior and the Q2 projection prior are exactly 2a's `pointsPrior`: the shipped rookie projection on the rookie route, and the frozen full-pipeline projection on the veteran route. Re-deriving them would fork the harness. |
| D2 | **Arm A = the app's prospect PPG as `computeProspectScore` computes it before normalisation.** That is the prior PPG, and for a player with a completed-season row in S-1 (gp > 0) it is the `8 : min(gp, 12)` blend with the S-1 PPG. | "Define the prior exactly as the app sees it." The live posterior would replace this value (§12). |
| D3 | **Q1 population = prospect path by years of experience.** `YE = S − draftYear` (from `playerids.bySleeper`, `draftYear > 0`; undrafted entries carry their entry year). Subgroups **YE0** and **YE1**. `draftYear` null or ≤ 0 → excluded and counted. | The app's prospect path is `yearsExp <= 1` (`dynastyScore.js` `isTrueProspect`). Its second clause, yearsExp ≤ 3 with no qualifying season **and** a KTC value, cannot be reconstructed, because KTC history starts 2026-05-18. That clause is counted, not modelled (§5.4). |
| D4 | **Dynasty-pick proxy.** The app's `pick` is the league's own rookie-draft pick (`App.jsx:917-925`, `selectRookieDraft`: 12 teams, 5 rounds, 60 picks, `pick_no` overall). The proxy ranks the draft class D = S's skill-position draftees (`draftOvr` ascending, ties by sleeperId). Rank r ≤ 60 → `{ round: ceil(r/12), pick: r }`, else `null`; undrafted → `null`. | The league draft is not reconstructable. NFL skill-position order is the standard proxy. Its influence is measured by the arm A-nullpick diagnostic (§5.1). |
| D5 | **YE1 gets `pick = null` in arm A.** | This is faithful to the app. `selectRookieDraft` reads only the **most recent** rookie draft, so every second-year player gets `draftMultiplier(null) = 0.75` and loses the premium-pick exemption from the cap of 35. That is a live app quirk: it is reported to Anton, and its cost is measured by diagnostic A-YE1-withPick. It is not fixed here. |
| D6 | **Age** = whole years on `${S}-09-01` from `birthdate`; null → the app's default 23 (`player.age ?? 23`). | Sleeper's `age` is the current integer age. Kickoff is the in-season reference date. `ageAtSeason` (season − birth year) is off by one for players born after 1 September, and `ageMultiplier` steps at integers. |
| D7 | **Q2 prior H = PPG of the last qualifying season L** (gp ≥ 8, L ≤ S-2). The primary population is **SHORT-recent (L = S-2)**. | This is the slot the app's level would substitute: `recencyWeightedPPG`'s `lastQ` and `ageAdjScore`'s `currentPPG`. It is the analogue of how 2b-2 wires `K_DYN_POINTS_HISTORY` (prior = raw last-season PPG in the `lastQ` slot). With L ≤ S-3 the app routes to **PATH A3 "Limited Data"** (`seasonsSinceLastQS >= 2`, score `15 + ktc·0.2`). No PPG enters there, so no k can move that group without a routing change. SHORT-stale is fitted and reported only. |
| D8 | **Pin rule = a preference ladder** (§3.4). A less-preferred candidate replaces the current one only if it **BEATS** it out of sample. 2a's Q4 NO-GAIN pooled rule is the two-rung case, extracted from `buildConstants` so both branches get unit tests (owed from 2a). | Anton's rule: pin pooled unless own BEATS pooled. The same logic generalises to "reuse an existing constant unless a new one BEATS it". |
| D9 | **Every arm runs the prior-calibration diagnostic** `(c, k)` on a wider grid, c ∈ 0.50..1.50 step 0.02, reported and never pinned. | Arm B and the Q2 projection prior carry 2a's optimism (c ≈ 0.80–0.86). Arm A is a hand-set heuristic whose scale may sit outside 0.80–1.10. H carries a stale-level bias of its own. Each k is fitted against its prior's miscalibration, so the re-fit dependency is recorded per arm. |
| D10 | **Keep 2a's gamelogs reconciliation stop** (`runReconciliation`, exit 1 below 0.99), although 2c uses no gamelogs-derived quantity: n and `obsPPG` come from season-totals `weeklyPoints`, and outcomes from season-totals. | `assembleSeason` still loads gamelogs (for 2a fields 2c drops). CR-09 sanctions that read only "behind a stop", so every path that loads gamelogs keeps the stop. Test 9 asserts that no gamelogs-derived field (`obsOpp`, `obsShare`, `O`, `mover`, `missedInWindow`, `oppMissingWeeks`) survives into the 2c analysis rows. |

**Grounding probe (Session 1, scratchpad, read-only).** Player-seasons with gp ≥ 1 in S, S = 2014..2024, and
an S+1 outcome (gp ≥ 6):
- YE0: 735 of 1,169 (QB 55 · RB 222 · WR 302 · TE 156)
- YE1: 706 of 1,098 (QB 37 · RB 224 · WR 277 · TE 168)
- SHORT-recent: 221 of 527 (QB 26 · RB 63 · WR 74 · TE 58)
- SHORT-stale: 65 of 198
- `draftYear` unusable: 39

Every YE ≤ 1 player-season routed to 2a's rookie route. Expect the QB cells to be INSUFFICIENT and most
Q2 position cells to fall back to pooled. More than half of all SHORT player-seasons have no S+1 outcome:
the survivorship bias is large, and §5.4 must report it.

---

## 1. Touch list

| File | Change |
|---|---|
| `scripts/inseason-run.mjs` | Extract the Q4 own-vs-pooled block of `buildConstants` into an import of `decideOwnVsPooled`. Remove the unused `q4NoGainPooled`. Export `SPEC`. **No output change** (§2). |
| `lib/inSeasonEvidence.mjs` | Additive pure exports (§3). `fitCK` gains an optional third parameter `grid = OPTIMISM_C` (the default is byte-identical). |
| `scripts/inseason-dyn-run.mjs` | **New** adapter (§4). |
| `bin/backtest.mjs` | Accept `--dynasty` together with `--inseason` (§8). |
| `test/inseason-dyn.test.mjs` | **New** (§10). |
| `README.md` | Docs (§11). |
| `CLAUDE.md` | One row (§11). |
| `backtests/`, `grading/` | Three artifacts, in a separate commit (§9). |

`lib/panel.mjs`, `scripts/panel-run.mjs`, `lib/projectionFactors.mjs` and `lib/rookieMirror.mjs` **must not change**.

---

## 2. `scripts/inseason-run.mjs` — extract the pooled rule (byte-identical)

In the Q4 loop of `buildConstants` (~L1029), keep the caller's existing gate **unchanged**, including
`own.delta?.label === 'NO-GAIN'`:
`if (own && own.verdict !== 'INSUFFICIENT' && own.delta?.label === 'NO-GAIN' && pooled && pooled.verdict !== 'INSUFFICIENT')`.
Inside it, replace only the three statements that build `foldKOf`, `pooledPreds` and `vsPooled` with
`const { choice, vsPooled } = decideOwnVsPooled({ own, pooled, spec })`, and branch on
`choice === 'own'`. Everything else stays in the caller, byte-for-byte:
- the `r4` rounding into `cell.vsPooled`;
- `cell.pinnedToPooledUnderNoGainRule`;
- both note strings, and the `put` / manual pooled entry with `fixtureKey`, fixture and `pinnedFrom`;
- the `continue`.

Delete `q4NoGainPooled` and its return key. It is unused: `runInSeason` reads only `pinned.constants`,
`.fixture` and `.pinnedFrom`, and the verdict recomputes its own list at ~L1356. Add `SPEC` and `entryOf`
to the exports, because the adapter needs `SPEC.pointsNext` and the pooled-entry recipe (§6).

**Byte-identity gate.** Before the first edit, save `node bin/backtest.mjs --inseason --json` to the
scratchpad. After the change, run it again and diff both outputs after deleting `meta.generatedAt`,
`meta.runtimeMs`, `constants.generatedAt` and `constants.source` (the source carries the date). The diff
must be empty, and the hand-back states it. Existing `test/inseason.test.mjs` stays green and unchanged.

---

## 3. `lib/inSeasonEvidence.mjs` — additive pure exports

### 3.1 Constants

```js
export const DYN_DEFAULTS = {
  seasons: { from: 2014, to: 2024 },          // outcome season S; next-season outcome S+1 <= 2025
  rookieDraft: { teams: 12, rounds: 5 },      // D4 proxy — the verified league (app src/utils/rookieDraft.js header)
  kickoffMonthDay: '09-01',                   // D6
  nBands: [[1, 4], [5, 8], [9, 40]],          // Q3 reporting bands
};
export const DYN_OPTIMISM_C = Array.from({ length: 51 }, (_, i) => Math.round((0.50 + 0.02 * i) * 100) / 100); // 0.50 … 1.50
// FROZEN mirror of app src/utils/dynastyScore.js as of app 4b5e8e1 (read by Session 1 2026-09-27). CR-25.
export const PROSPECT_MIRROR = {
  positionPriorPPG: { QB: 14, RB: 12, WR: 9, TE: 7 }, fallbackPriorPPG: 9,
  priorWeight: 8, evidenceWeightCap: 12, ktcShare: 0.60, noMarketCap: 35, defaultAge: 23,
};
```

### 3.2 Prospect mirror (exact copies of the app's branches)

- `ageMultiplier(age)`: ≤21 → 1.20; 22 → 1.10; 23 → 1.00; 24 → 0.88; else 0.75.
- `draftMultiplier(pick)`: `null` → 0.75. Round 1 with pick ≤ 3 → 1.30, ≤ 8 → 1.15, otherwise (≤ 12 and 13+)
  → 1.05. Round 2 → 0.90, round 3 → 0.78, else 0.65.
- `prospectPriorPPG({ position, age, pick, sm1 })` → `{ priorPPG, prospectPPG }`.
  - `priorPPG = (positionPriorPPG[position] ?? 9) × ageMultiplier(age ?? 23) × draftMultiplier(pick)`.
  - `sm1 = { gamesPlayed, fantasyPoints } | null`. When gp > 0 and both values are finite:
    `ew = min(gp, 12)`, `prospectPPG = (priorPPG·8 + (fp/gp)·ew) / (8 + ew)`. Otherwise `prospectPPG = priorPPG`.
- `modelScore(ppg, peak)` = `100 · min(ppg / max(peak, 1), 1)` (the app's `normalisePPG × 100`, unrounded).
- `ageOnDate(birthdate, isoDate)`: whole years; null or unparsable → null.
- `dynastyPickProxy(classEntries, { teams, rounds })` → `Map<sleeperId, { round, pick } | null>` (D4).
  `classEntries` = `[{ sleeperId, draftOvr, undrafted, position }]` for one draft year. Only QB/RB/WR/TE
  entries that are not undrafted and have a finite `draftOvr` are ranked. Undrafted → `null`.

### 3.3 History prior (Q2)

`historyPriorOf({ ppgBySeason, S, floor })`, where `ppgBySeason: (y) => { ppg, gamesPlayed }` →
`{ L, H, recency, stale }`:
- `L` = the largest y ≤ S-2 (down to `floor`) with gp ≥ 8 and a finite ppg, or null.
- `H` = that season's ppg.
- `recency` = `0.7·H + 0.3·ppg(previous qualifying season before L)`, or `H` when there is none. This is
  `recencyWeightedPPG`'s formula applied at L.
- `stale = L != null && L <= S-3`.

S-1 is never read; the population already has S-1 gp < 8.

### 3.4 Pin ladder (D8)

- `decideOwnVsPooled({ own, pooled, spec })` → `{ choice: 'own' | 'pooled' | null, vsPooled }`. This is
  the own-vs-pooled comparison only. It does **not** check `own.delta` (the 2a caller keeps its NO-GAIN
  gate). It returns `{ choice: null, vsPooled: null }` unless own and pooled are both non-INSUFFICIENT.
  Otherwise it builds `foldKOf` from `pooled.folds` and the pooled held-out predictions over
  `own.orderedRows` (`blend(r[spec.prior], r[spec.obs], r.n, foldKOf.get(r.S))`), then
  `vsPooled = pairedDelta(own.orderedRows, pooledPreds, own.heldOut)` — exactly 2a's three statements.
  `'own'` iff `vsPooled?.label === 'BEATS'`, else `'pooled'`. It returns `vsPooled` unrounded.
- `ladderPick(rows, rungs)`. `rows` is the `orderedRows` array that every rung's `preds` is aligned to.
  `rungs = [{ id, preds }]` is ordered from most to least preferred, with `preds[i] = { pred, actual }`.
  Start at rung 0. For i = 1..: move to rung i iff
  `pairedDelta(rows, rungs[current].preds, rungs[i].preds)?.label === 'BEATS'` (B = rung i). Return
  `{ id, steps: [{ from, to, mean, ci95, label }] }`. A rung is compared only against the current rung,
  never skipped over.
- **Rung predictions** (the adapter builds them; all are aligned to one `orderedRows`):
  - fixed-k rung: `blend(r[prior], r.obsPPG, r.n, kFixed(r))`;
  - pooled rung: `blend(…, foldKOf(pooled).get(r.S))`, with fold k from `pooled.folds`, as in `decideOwnVsPooled`;
  - own rung: `own.heldOut` (require `own.orderedRows` aligned to `rows` via `assertAligned`).
- `assertAligned(a, b)`: throws unless `a.length === b.length` and `sleeperId`, `S`, `W` match index-wise.
  Call it before every paired comparison between two `analyzeKCell` results.

---

## 4. `scripts/inseason-dyn-run.mjs`

The file exports exactly `INSEASON_DYN_LOAD`, `runInSeasonDyn`, `buildInSeasonDynVerdictMarkdown`,
`writeInSeasonDynArtifacts` and `inSeasonDynMain`. All live in this file, because companion §A registers
them here.
- `runInSeasonDyn({ load = INSEASON_DYN_LOAD, log = () => {}, assemble = assembleSeason } = {})` → result
  object. `assemble` is the test seam (test 9).
- `inSeasonDynMain({ load = INSEASON_DYN_LOAD, write = false, asJson = false, writeArtifacts = writeInSeasonDynArtifacts, log = console.log, logErr = console.error } = {})`
  → exit code: 1 on `ReconciliationStop`, else 0. The body mirrors `inSeasonMain`.
- `writeInSeasonDynArtifacts({ result, verdictMd })` → `{ panelPath, panelBytes, constantsPath, constantsBytes, verdictPath }`.
  It throws above `ARTIFACT_CAPS`.

Imports from `./inseason-run.mjs`: `assembleSeason`, `makeGamelogsIndex`, `makeScheduleIndex`,
`guardLoad`, `runReconciliation`, `ReconciliationStop`, `INSEASON_LOAD`, `pinDecision`, `fixtureFrom`,
`makePut`, `entryOf`, `addFoldK`, `verifyConstants`, `formatConstantsJson`, `ARTIFACT_CAPS` and `SPEC`.

Other imports:
- `IN_SEASON_DEFAULTS`, `analyzeKCell`, `pairedDelta`, `blend`, `fitCK`, `spearman` and the §3 additions
  from `../lib/inSeasonEvidence.mjs`;
- `loadFactorInputs` from `./panel-run.mjs`;
- `computeSeasonPoints` and `HISTORY_FLOOR` from `../lib/panel.mjs`;
- `reconstructAgeCurves` from `../lib/projectionFactors.mjs`;
- `readJson` and `repoPath` from `../lib/io.mjs`.

It must **not** import `assembleRookiePanel` (T-RM1 holds unchanged).
`INSEASON_DYN_LOAD = { ...INSEASON_LOAD, loadInSeasonConstants: () => readJson('backtests/2026-09-26-inseason-constants.json') }`
is a read-only source for the 2a pinned k. Never hard-code those k.

### 4.1 Setup

1. `g = guardLoad(load, { maxLoadSeason: 2025 })` (the in-progress guard, as in 2a). Then
   `runReconciliation(g, { fromYear: 2012, toYear: 2025 })`, which throws `ReconciliationStop` below 0.99 (D10).
2. `inputs = loadFactorInputs({ fromYear: 2013, toYear: 2024, basis: 'half_ppr', withFactorMultipliers: true, historyFloor: HISTORY_FLOOR, load: g })`.
   This gives outcome maps for HISTORY_FLOOR..2025, plus `crosswalk` and `birthdateBySleeper`.
3. `env` exactly as `runInSeason` builds it (`playerIds: g.loadPlayerIds()`, `defaults: IN_SEASON_DEFAULTS`).
4. `peakByS[S]` = `reconstructAgeCurves(qualifyingRows ≤ S-1, pid => birthdateBySleeper[pid] ?? null).positionPeakPPG`.
   Each qualifying row is `{ pid, position: crosswalk[pid], season, ppg, gamesPlayed }`, built from the
   outcome maps (non-`TEAM_`; the function applies gp ≥ 10 itself).
5. `pickProxy[D]` = `dynastyPickProxy` over `playerIds.bySleeper` entries with `draftYear === D`, with
   position from `crosswalk`.

### 4.2 Row augmentation, per S in 2014..2024

Call `assemble(S, env)`. Keep rows with a finite `nextPPG`. **Project each row onto an explicit field
list:** `sleeperId`, `S`, `W`, `n`, `position`, `arm`, `obsPPG`, `nextPPG`, and `pointsPrior` renamed
to `projPrior`. Then add the fields below. No other 2a field is carried (D10).
- `ye`, from D3; `draftTier` = `'premium'` (proxy round ≤ 2) | `'late'` (round 3–5) | `'none'` (null proxy or undrafted).
  YE1 rows get the tier of their own class too, for diagnostics.
- `age` = `ageOnDate(birthdate, \`${S}-09-01\`)`.
- `sm1` = `computeSeasonPoints(pid, outcomes[S-1])`, mapped to `{ gamesPlayed, fantasyPoints: totalPts }`, or null when gp is 0.
- `prospectPrior` (arm A) = `prospectPriorPPG({ position, age, pick: ye === 0 ? proxy : null, sm1 }).prospectPPG`.
- Diagnostic priors, reported only: `prospectPriorNullPick` (pick null for all), and
  `prospectPriorYE1Pick` (YE1 with its own class proxy).
- `projPrior` = 2a's `pointsPrior` (arm B on the rookie route; the projection prior on the veteran route).
- `histPrior`, `recencyPrior`, `L`, `stale` from `historyPriorOf` (veteran-route X-short rows only).
- `peak` = `peakByS[S][position]`.
- `k2a` (number) and `k2aName`: the 2a pinned k the app would apply to **this row** today, read from the
  loaded 2a constants file by the row's own 2a arm, which is the app's own ROOKIE0/ROOKIE1P routing.
  - `X-rookie0` → `K_DYN_POINTS_ROOKIE0[pos]`, `X-rookie1p` → `K_DYN_POINTS_ROOKIE1P[pos]`, `X-short` →
    `K_DYN_POINTS_SHORT[pos]`.
  - `kStd` = `K_DYN_POINTS_HISTORY[pos]`.
  - A YE1 player with no S-1 appearance (missed rookie year) is `X-rookie0` and therefore takes the
    ROOKIE0 k. §5.4 counts those rows.

### 4.3 Populations

- **Q1:** `ye ∈ {0, 1}`, finite `prospectPrior`, finite `projPrior`, and the 2a arm is `X-rookie0` or
  `X-rookie1p`. A row with YE ≤ 1 in any other arm is counted as `routeMismatch` and dropped (the probe
  expects 0).
- **Q2 primary:** arm `X-short`, `L === S-2`, finite `histPrior` and finite `projPrior`.
- **Q2 stale:** `stale === true`; reported only.
- **Q2 noL:** `L === null` **must be 0**. An `X-short` row is veteran-routed, and `rookiePathStateAt`
  already requires a gp ≥ 8 season ≤ S-1 on the same outcome maps. A non-zero count means
  `historyPriorOf` and `rookiePathStateAt` have drifted: throw.

---

## 5. Analyses (all comparisons are LOSO held-out on paired rows; every CI uses 2a's clustered bootstrap)

Every cell uses `analyzeKCell(rows, spec, { studyK })` with `spec = { prior: '<field>', obs: 'obsPPG', outcome: 'nextPPG' }`.
The min-n rule is 2a's (`cellVerdict`: ≥ 60 players and ≥ 300 rows). Cells run per position and pooled
(`ALL`). Before running two arms on the same population, filter the rows so that every prior used in
that comparison is finite, so the arms' `orderedRows` align; then `assertAligned`.

### 5.1 Q1 — prospect prior: arm A vs arm B

Per subgroup g ∈ {YE0, YE1}, on the pooled-position rows R_g:
- **A**: `analyzeKCell(R_g, {prior: 'prospectPrior', …})`.
- **B-refit**: `analyzeKCell(R_g, {prior: 'projPrior', …}, { studyK: r => r.k2a })`. Its
  `delta` is refit vs 2a's pinned k (**B-2a**).
- **ΔAB** = `pairedDelta(rows, A.heldOut, Brefit.heldOut)`. Here Δ = B − A, so BEATS means B is better.
- Per position: the same three, reported.
- Also report the prior-only MAE of each arm, i.e. how good each prior is at n = 0. Arm B at n = 0 would
  also change every pre-kickoff prospect score (§12).
- Diagnostics (reported, never pinned):
  - A-nullpick and A-YE1-withPick: k, and held-out MAE vs A.
  - `(c, k)` for A and B via `fitCK(rows, spec, DYN_OPTIMISM_C)`, flagging c at 0.50 or 1.50 as a boundary.
  - The same A/B comparison split by `draftTier` (the waiver-pickup lens: `none` = UDFA or unpriced).

### 5.2 Q2 — SHORT-recent: history prior vs projection prior

On the Q2 primary rows (pooled positions, then per position):
- **Hist**: `analyzeKCell(rows, {prior: 'histPrior', …}, { studyK: r => r.kStd })`. Its `delta`
  is own k vs the standard `K_DYN_POINTS_HISTORY`.
- **Proj**: `analyzeKCell(rows, {prior: 'projPrior', …}, { studyK: r => r.k2a })`. Its `delta`
  is refit vs 2a's `K_DYN_POINTS_SHORT`.
- **ΔHP** = `pairedDelta(rows, Proj.heldOut, Hist.heldOut)`. Δ = Hist − Proj; BEATS means history is better.
- Diagnostics:
  - `recencyPrior`: k and MAE.
  - SHORT-stale: Hist and Proj cells, reported only.
  - `(c, k)` for Hist and Proj.

### 5.3 Q3 — the KTC anchor (rookies; the Q1-recommended arm per subgroup)

For each Q1 row, take the recommended arm's held-out prediction `xn`, that arm's prior `x0`, the outcome
`y`, and `p = peak`. Then `Δu = modelScore(xn, p) − modelScore(x0, p)` and `Δr = modelScore(y, p) − modelScore(x0, p)`.
Report pooled, per subgroup and per n band (`DYN_DEFAULTS.nBands`):

| metric | definition |
|---|---|
| realised movement | mean \|Δr\| (score points) |
| update, model share alone | mean \|Δu\| |
| update under the anchor | 0.4 · mean \|Δu\| — the KTC-valued player's final-score move, KTC held fixed |
| left on the table | 0.6 · mean \|Δu\| (score points); also as a share of mean \|Δr\| |
| captured by the model share | `1 − mean|Δr − Δu| / mean|Δr|` |
| rank agreement | Spearman(Δu, Δr) — the anchor rescales and does not reorder within prospects |
| peak clamp | share with xn ≥ p; share with y ≥ p; mean `(100·y/p − 100)⁺` (realised movement the clamp discards whatever the anchor) |
| cap of 35 (no KTC value **and** no R1/R2 pick) | among rows with `draftTier !== 'premium'` (YE1: all, per D5): row share; share with `modelScore(xn) > 35`; mean `(modelScore(xn) − 35)⁺` and `(modelScore(y) − 35)⁺`. **Upper bound**: KTC is unknown historically, and a KTC value lifts the cap. |

State in the verdict:
- **Measured:** the model-share numbers above.
- **Not measurable yet: whether KTC itself moves with in-season evidence** (so that the anchored 60% is
  not really lost). KTC history starts 2026-05-18 (`ktc/`, weekly). The first test, KTC percentile change
  vs in-season `obs − prior`, becomes possible after the 2026 regular season (~Jan 2027). The version
  graded against S+1 outcomes needs the 2027 season (~Jan 2028).
- **Do not propose changing the anchor.**

### 5.4 Excluded-population report (always produced)

For each population, give counts, players, the mean of each prior, mean n, and mean `obs − prior` for:

- **Q1:**
  - YE ≤ 1 player-seasons with gp ≥ 1, and their rows.
  - Rows without an S+1 outcome, split absent vs gp < 6 (the **washout survivorship**: a bust has no
    outcome, so every fitted number describes survivors).
  - `draftYear` unusable.
  - `routeMismatch`.
  - YE1 rows in arm `X-rookie0` (missed rookie year).
  - YE 2–3 rookie-route rows with no qualifying season. They are prospect-path in the app only with a
    KTC value, which is unreconstructable, so they are excluded.
- **Q2:**
  - The SHORT split recent / stale / noL.
  - Rows without an S+1 outcome, including retirements.
  - Rows without a `projPrior` (2a attach drops).

---

## 6. Pre-registered decision rules (Session 2 applies; never tunes after seeing results)

| Q | Rule |
|---|---|
| Q1 prior, per subgroup | **Arm B** iff ΔAB is **BEATS** on the pooled-position rows. NO-GAIN or WORSE → **arm A**. Ties go to A because B swaps the prior, which moves every prospect's score before kickoff, while A only adds live evidence. |
| Q1 k, arm B chosen | Ladder `[2a pinned (k2a), B-refit own subgroup pooled, B-refit own position]`. If it ends on rung 0 → **"reuse 2a constants"** (a `reuse` entry, no new constant). Otherwise pin `K_DYN_PROSPECT_B_YE<g>` from the rung reached. |
| Q1 k, arm A chosen | Ladder `[subgroup pooled, own position]` → `K_DYN_PROSPECT_YE<g>` per position. |
| Q2 prior | **History**, unless ΔHP is **WORSE**. WORSE → **no wiring recommendation** for SHORT: state the measured gap, and state that putting a projection into the history slot is the mismatch 2b-2 rejected (projection optimism entering the dynasty score). |
| Q2 k, history chosen | Ladder per position `[K_DYN_POINTS_HISTORY[pos] (reuse), SHORT-recent pooled, own position]`. Rung 0 → `reuse` entry; otherwise `K_DYN_POINTS_SHORT_HISTORY`. |
| Q3 | Report only (§5.3). |
| all | The 2a boundary rule (`pinDecision`: `high` → `k: null`, `prior-only`; `low` → `k: 0`, `observed-only`) applies to every pinned cell first. An INSUFFICIENT pooled cell stops the ladder at rung 0. For the arm-A ladder (rung 0 = pooled) that writes `P.put(NAME, pos, { k: null, kFit: null, ci95: null, rows, players, basis: 'insufficient' }, null, '<cellKey> INSUFFICIENT')`. For a fixed rung 0 (Q1 arm B, Q2) it writes a `reuse` entry and nothing in `constants`. |

**Where each ladder runs.** For a position whose own cell is non-INSUFFICIENT, the whole ladder runs on
that position's `orderedRows`. For a position whose own cell is INSUFFICIENT, the own rung is dropped:
the steps before it run **once on the pooled (ALL) rows**, with fixed-k rungs using each row's own
`kFixed(r)`, and that single outcome applies to every INSUFFICIENT position of the constant. Rung
predictions are built as in §3.4.

**Entry recipe per ladder outcome** (for constant name `NAME`, position `pos`; all go through `makePut()`'s `P`):
- **own** → `P.put(NAME, pos, pinDecision(own, null), own, '<cellKey>')`. The fixture key is `NAME|pos`.
- **pooled** → the 2a Q4 manual recipe:
  `P.constants[NAME] ??= {}; const p = pinDecision(pooled, null); P.constants[NAME][pos] = { ...entryOf({ ...p, basis: p.basis === 'fitted' ? 'pooled' : p.basis }), fixtureKey: \`${NAME}|ALL\` }`,
  then `P.fixture[\`${NAME}|ALL\`] = fixtureFrom(pooled)` and `P.pinnedFrom[\`${NAME}|${pos}\`] = '<pooled cellKey> (ladder: pooled rung)'`.
  `putWithPooled` must **not** be used here: it falls back to pooled only when own is INSUFFICIENT.
- **fixed (reuse)** → nothing in `constants`. Set `reuse[\`${NAME}|${pos}\`] = { reuses: [...distinct k2aName or 'K_DYN_POINTS_HISTORY' over the rung's rows], k: [...distinct k values], source }`.
  For Q1 YE1, `reuses` may name both `K_DYN_POINTS_ROOKIE0` and `K_DYN_POINTS_ROOKIE1P`, because the app
  routes each row by ROOKIE0/ROOKIE1P.
- Then `addFoldK({ constants: P.constants, fixture: P.fixture })` and `verifyConstants`.

A ladder rung that is a fixed k (2a pinned, `K_DYN_POINTS_HISTORY`) was fitted on other rows,
including rows from the held-out season. The verdict states this. It favours the fixed rung, which is
the conservative direction.

---

## 7. Outputs (`--write`)

`writeInSeasonDynArtifacts({ result, verdictMd })`, date = `result.meta.generatedAt.slice(0, 10)`. The
caps are 2a's `ARTIFACT_CAPS`.

- **`backtests/<date>-inseason-dyn-panel.json`**: `{ meta, coverage, excluded, q1, q2, q3, diagnostics, ladders }`.
  Aggregates and per-fold results only, **no per-row data**.
- **`backtests/<date>-inseason-dyn-constants.json`**: 2a's format (`source`, `generatedAt`, `basis`,
  `fit`, `constants`, `fixture`, `foldK` via `addFoldK`), plus:
  - `fit.prospectPrior` and `fit.historyPrior`: one-sentence definitions, including D4/D5/D6 verbatim.
  - `fit.priorCalibration`: per-arm c values with this sentence: "Each k is fitted against its prior's
    miscalibration: re-fit if `POSITION_PRIOR_PPG`/the age or draft multipliers (arm A), the rookie
    calibration (arm B), or the projection (Q2 projection prior) change."
  - `decisions: { q1: { YE0, YE1 }, q2 }`.
  - `reuse: { "<NAME>|<POS>": { reuses: ["<2a name>", …], k: [<distinct k>, …], source: "backtests/2026-09-26-inseason-constants.json @ a071bdb324976203ed915e14a57b88fb740fb0b6" } }`.

  `verifyConstants` must pass. `reuse` is outside `constants` and is not re-derived. If every decision is
  a reuse, `constants` is `{}`.
- **`grading/<date>-inseason-dyn-verdict.md`**:
  - First lines: one plain answer line each for Q1–Q3, then the constants/reuse table
    (name · cell · k · CI · basis/rung).
  - Then these sections: §Prior calibration (read before using these k), §Q1, §Q2, §Q3, excluded
    population, and **Limitations**. The Limitations must cover:
    - the half-PPR basis;
    - the D4 pick proxy (a 12-team league shape, applied to any league);
    - the D5 YE1 quirk;
    - the D6 age date;
    - survivorship;
    - KTC unmeasurable;
    - that the prospect score's other 40% inputs (clamp, cap) are reported, not fitted;
    - the fixed-rung leakage note (§6).
  - A `Reproduce:` line.

---

## 8. CLI — `bin/backtest.mjs`

`--inseason --dynasty [--json] [--write]`. The `--inseason` branch already rejects other flags: allow
`--dynasty` there, and reject `--dynasty` without `--inseason` with the same style of message. With
`--dynasty` the bin calls `process.exit(inSeasonDynMain({ write, asJson }))`. Update the file's header
comment block. No new `package.json` script (CLAUDE.md has no byte budget for it).

---

## 9. Cross-repo impact

**Session 2 edits no registry file.** The exact CR-25 edit is in the companion, and it is applied by the
two-session route: the app applies first, then a data session syncs byte-for-byte. **The sync lands after
Session 2's commit 1**, because `test/registry.test.mjs` resolves the new data-side symbols. Keep the red
mirror window the same day.

### CR-25 · In-season evidence definitions and fitted k — fires (`lib/inSeasonEvidence.mjs`, `scripts/inseason-run.mjs`, `bin/backtest.mjs`; new mirrored app definitions)

> An app-side change to any mirrored definition stales every fitted k: mirror the definition into `lib/inSeasonEvidence.mjs` (never into the frozen `PHASE1_K`), re-run `node bin/backtest.mjs --inseason --write`, and re-pin from the new constants file — never hand-edit a `K_*`. A data-side change to the fit (grid, loss, rounding, checkpoints, arms, prior, the pin rules in `buildConstants`) writes a new dated constants file; the app keeps its pinned copy until it deliberately re-pins by copying that file byte-for-byte with its data commit SHA, and a re-pin re-checks `PRIOR_MODEL_FROM` (a frozen prior captured before the current model is refused — CR-26). An app-side model change bumps `PRIOR_MODEL_FROM` at once; if it also changes a CR-15-mirrored factor, the k are stale until re-fitted — a bump is not a re-fit. The Q4 NO-GAIN pooled-pin *decision* (own k BEATS pooled out of sample) is taken and tested data-side; the app's provenance test checks only which fixture cell each `k` re-derives from. These k partly compensate for the projection's known optimism (c ≈ 0.80–0.86): correcting that optimism is a re-fit, not a re-pin. The definitions flow app→data and the constants data→app. **Nothing fails in either repo when this drifts** — the app blends with constants fitted under definitions it no longer uses. Later consumers (the rest-of-season posterior grader) extend this entry rather than adding another.

**Under it.** The pin-rule extraction is a refactor with byte-identical output (§2), so the 2a constants
file does not change and nothing is owed app-side for 2a. The new mode mirrors **new app definitions**:
the prospect prior and its completed-season blend, the KTC share and the cap, the prospect-path gate, the
most-recent-rookie-draft pick source, and the SHORT history slot with the A3 stale route. Those enter
CR-25's App side, Triggers, Invariant and Mirror, and the new data-side symbols enter Data side and
Triggers (companion §A). The 2c constants file is a new dated file. The app pins nothing from it until
a later app task wires the recommendation (§12).

### CR-15 · R3-FIT factor-multiplier mirror — fires (`scripts/inseason-run.mjs` is a data-side trigger)

> Re-mirror the changed constant/gate/branch and **re-fit before any further exponent activation** — otherwise the fit reconstructs a factor the app no longer produces and the committed verdict in `.claude/tasks/r3fit-exponent-harness.md` stops transporting. Which positions a factor is gated to is itself part of the mirror. Note the known parity gap: `shareTrend` and `teamRzShare` have no end-to-end app-ground-truth check until a post-2026-07-18 snapshot is imported. **Nothing app-side fails when this drifts.** **Scope note reversed (D6a, 2026-09-06):** `dynastyScore.js` was previously named in `lib/projectionFactors.mjs` (the comment above `weightedLinearRegressionSlope`) only as a *contrast* and marked deliberately not a trigger; D6a's age port (Step 2) draws `computeEmpiricalAgeCurves` straight out of it, so `dynastyScore.js` is now mirrored and is a trigger like the other ten app-side modules. The old contrast is still accurate as far as it goes — `weightedLinearRegression`'s copy in that file remains unfloored where the mirrored one floors the denominator at 4 — it just no longer means the whole file is out of scope. A change to any of the three app-side rookie mechanisms, or to their ordering, re-mirrors here; the mirror must never become reachable from the fit path, which `test/rookie-mirror.test.mjs`'s import-graph assertion enforces. **A gate change that captured snapshots already carry is added as a new model, never an overwrite (`7b5b055`, Step 4 up-side):** the retired behaviour stays reproducible for parity against pre-boundary captures and for re-running committed verdicts, the new model becomes the harness default, and the boundary gets a row in `grading/anchor-policy.md`. A mirrored-factor change, or a change to any of the three rookie mechanisms, also stales the in-season k constants fitted by `bin/backtest.mjs --inseason` over this reconstruction (CR-25): re-run it before re-pinning them.

**Under it.** No mirrored constant, gate, branch or ordering changes. The last Mirror sentence now also
covers `--inseason --dynasty`: arm B, the Q2 projection prior and the Q3 peak all come from this
reconstruction. Companion §B.3 extends that sentence. The `inseason-run.mjs` edit only
moves the pin-rule code (byte-identical, §2). `reconstructAgeCurves` is imported read-only. The prospect
mirror lives in `lib/inSeasonEvidence.mjs` (CR-25), not in `lib/projectionFactors.mjs`, because it
serves only the in-season k. The new adapter reaches `lib/rookieMirror.mjs` only transitively, through
`assembleSeason`. It is outside T-RM1's fit-entry closure, and it never calls `assembleRookiePanel`.
Nothing is owed app-side.

### CR-09 · nflverse gamelogs (view-only) — fires (`scripts/inseason-run.mjs` is a data-side trigger; 2c adds a route into its gamelogs read)

> Shape or floor changes land in both repos together. The per-game `week` and `team` keys are load-bearing beyond display: `resolvePlayerTeam`'s week-grain path matches on `g.week === week` and reads `g.team`, and returns `null` rather than throwing — renaming either key empties every week-grain team join **silently**. Per-game `team` is the **current-franchise** domain in all seasons and is era-remapped app-side (CR-16); do not "fix" it to era-accurate upstream without changing both repos. Per-game rate fields (`racr`/`targetShare`/`airYardsShare`/`wopr`/`pacr`/`passingCpoe`) are single-game values and must never be summed — `passingCpoe` specifically is now also attempt-weighted by a second consumer (`seasonEfficiency.js`'s `CPOE` column), not merely "never summed". `fantasyPoints`/`fantasyPointsPpr` are nflverse default scoring and are never reconciled with `src/utils/fantasyPoints.js` (see CR-14). View-only on both sides — must never feed projection/scoring/grading as per-player values. One sanctioned analytical read: `scripts/inseason-run.mjs` (CR-25) splits season-totals opportunity stats by week from gamelogs, behind a stop that requires ≥ 99% of the skill player-seasons present in gamelogs (gp ≥ 4) to reconcile with season-totals `stats`. It emits only fitted parameters: dimensionless k constants, plus the parameters of the posterior-combination and sort-measure forms built on them. It never emits per-player values. Weekly points there come from season-totals, never from gamelogs `fantasyPoints`. 2019 was backfilled on 2026-07-03 (5,756 rows across 586 players) and is no longer a gap; the family is complete 2012–2025.

**Under it.** The `inseason-run.mjs` edit is byte-identical (§2). The 2c route loads gamelogs only
through the sanctioned read in `scripts/inseason-run.mjs` (`assembleSeason` → `makeGamelogsIndex`), and
it runs the same reconciliation stop first (D10). It drops every gamelogs-derived field before analysis
(§4.2, test 9), and it emits only k constants. The Mirror stays true without an edit, and nothing is
owed app-side.

### Not fired

- **CR-06:** 2c reads `nflverse/playerids.json` (internal-only), not `nflverse/draft/draft_picks.json`.
- **CR-17:** KTC files are not read. Their start date is stated from the `ktc/` listing.
- **CR-01, CR-02, CR-21:** no snapshot or season-totals change. The 2026 in-progress file is never read,
  by the guard.
- **CR-18:** no ingested-field change.

---

## 10. Tests — `test/inseason-dyn.test.mjs` (fixture loaders only; no live-store read)

1. **2a byte-identity** is the §2 manual gate, reported in the hand-back. `test/inseason.test.mjs` passes unchanged.
2. **`decideOwnVsPooled`, both branches (owed from 2a).** Build synthetic `own`/`pooled` objects with
   `verdict`, `folds` (per-S k), `orderedRows` and `heldOut`:
   - (a) own's held-out errors are uniformly smaller than the pooled-k predictions → `'own'`, label BEATS;
   - (b) own's errors equal the pooled predictions' errors plus symmetric noise → `'pooled'`;
   - (c) pooled INSUFFICIENT → `null`.

   Also: the helper ignores `own.delta`. The synthetic `own` of case (a), given `delta.label: 'BEATS'`,
   still returns `'own'`. The NO-GAIN gate stays in 2a's caller, which the §2 byte-identity gate covers.
3. **`ladderPick`:**
   - stays on rung 0 when rung 1 is NO-GAIN;
   - climbs to rung 1 on BEATS;
   - reaches rung 2 only when rung 2 BEATS rung 1, even where rung 2 would BEAT rung 0 but not rung 1;
   - `steps` records each comparison.
4. **`prospectPriorPPG` golden values** (hand-computed from the app formula):
   - RB, age 21, `{1, 2}` → 12·1.2·1.3 = **18.72**;
   - WR, age 25, `null` → 9·0.75·0.75 = **5.0625**;
   - TE, age null, `{2, 20}` → 7·1.0·0.90 = **6.3**;
   - QB, age 22, `{1, 13}` → 14·1.1·1.05 = **16.17**;
   - round 4 → 0.65;
   - blend: RB, age 23, `{1, 10}` → prior 12·1.0·1.05 = 12.6; with `sm1 = { gamesPlayed: 4, fantasyPoints: 60 }`
     → `prospectPPG` = (12.6·8 + 15·4)/12 = **13.4**;
   - `gamesPlayed: 16` → evidence weight 12;
   - `gamesPlayed: 0`, or a non-finite fp → prior unchanged.
5. **`dynastyPickProxy`:**
   - a class of 70 skill-position draftees plus 10 non-skill: rank 1 → `{1, 1}`, 12 → `{1, 12}`,
     13 → `{2, 13}`, 60 → `{5, 60}`, 61 → `null`;
   - non-skill entries consume no ranks;
   - undrafted → `null`;
   - a `draftOvr` tie resolves by sleeperId.
6. **`ageOnDate`:** `2003-09-02` on `2025-09-01` → 21; `2003-09-01` → 22; null → null.
7. **`historyPriorOf`:**
   - L skips S-1;
   - picks the latest gp ≥ 8 season ≤ S-2;
   - recency is 0.7/0.3, with the single-season fallback;
   - `stale` at L = S-3;
   - L null when there is none.
8. **`modelScore`:** clamps at the peak; `max(peak, 1)`; linear below the peak.
9. **Population routing** (a fixture `assembleSeason` substitute via an injectable `assemble` parameter on `runInSeasonDyn`):
   - YE from `draftYear`;
   - `draftYear` 0/null → excluded and counted;
   - YE1 gets `pick: null` in `prospectPrior` but its own proxy in `prospectPriorYE1Pick`;
   - a YE ≤ 1 row in arm `P` → `routeMismatch`;
   - an X-short row with L = S-3 → stale, not primary;
   - a fixture row carrying `obsOpp`/`obsShare`/`O`/`mover`/`missedInWindow`/`oppMissingWeeks` comes out
     without any of them (D10);
   - an X-short fixture row with no qualifying season → throws (noL drift, §4.3).
10. **`assertAligned`** throws on a length mismatch and on a sleeperId/S/W mismatch.
11. **Constants file:**
    - `verifyConstants` passes on a synthetic dyn file built by the writer;
    - a tampered `foldK` is caught;
    - `reuse` entries are ignored by the verifier. `runInSeasonDyn` throws when a reuse names a
      constant/position absent from the loaded 2a file: test it with an injected `loadInSeasonConstants`
      that lacks the key.
12. **CLI:**
    - `inSeasonDynMain` with an injected small fixture load returns 0 (the fixture needs at least one
      gp ≥ 4 player-season that reconciles against gamelogs: `runReconciliation` treats an empty
      population as rate 0 and stops) and calls a spy `writeArtifacts`
      only when `write: true`;
    - a fixture that trips the reconciliation stop, run with `write: true`, returns 1 and never calls
      the spy;
    - `bin/backtest.mjs --dynasty` without `--inseason` exits non-zero before loading anything (spawnSync).
13. **Static:** `scripts/inseason-dyn-run.mjs` source does not reference `assembleRookiePanel`; T-RM1 stays green.

---

## 11. Docs

- **README → `#### Analysis CLI flags`:** change `--inseason (takes only --json/--write; …)` to say it
  takes only `--json`/`--write`/`--dynasty`. Add the three `-inseason-dyn-*` artifacts to the
  "Writes land in" list.
- **README → after `### In-season evidence k-fit`:** add a new
  `### In-season dynasty-side k-fit (\`bin/backtest.mjs --inseason --dynasty\`)` section containing:
  - the purpose (Q1–Q3);
  - the populations;
  - D4/D5/D6 in one line each;
  - the ladder rule;
  - the artifacts;
  - the reproduce line.
- **CLAUDE.md** (ceiling 25,000, `<=`; currently 24,993). Make exactly two replacements, which Session 1
  measured at **24,998** bytes:
  - In the Commands table's Backtest row, replace `` `--inseason` (in-season evidence k-fit) `` with
    `` `--inseason [--dynasty]` (in-season k-fits) ``.
  - Replace the `scripts/backtest-run.mjs` row's Purpose cell with exactly:
    `Backtest adapters (injectable loaders): \`scripts/backtest-run.mjs\` (advstats); \`scripts/inseason-run.mjs\` (\`--inseason\`), \`inseason-dyn-run.mjs\` (\`--dynasty\`) reach \`lib/rookieMirror.mjs\` outside \`bin/panel.mjs\`'s closure`

  Change nothing else. `test/claudeMdSize.test.mjs` must pass.
- `data-catalog.md`: no change.

---

## 12. Done-definition, git, hand-back

1. Capture the §2 baseline **before** the first edit.
2. `npm test` and `npm run smoke` are green.
3. Run `node bin/backtest.mjs --inseason --dynasty`, then with `--write`. For determinism, run
   `--inseason --dynasty --json` twice and diff `.constants` after dropping `generatedAt` and `source`.
   The diff must be empty.
4. **Commit 1:** code, tests and docs, **plus the two Session 1 task files**, staged explicitly
   (`git add .claude/tasks/in-season-evidence-2c-dynasty-backtest.md .claude/tasks/in-season-evidence-2c-registry.md <files>`).
   **Commit 2:** the three artifacts. Then `git pull --rebase origin main` and a plain `git push origin main`.
5. **Hand-back:**
   - both SHAs, every file touched, every deviation, and what each test asserts;
   - the §2 diff (expected empty), runtime and artifact sizes;
   - **the verdict's Q1–Q3 answer lines and the constants/reuse table, pasted verbatim**;
   - the excluded-population summary;
   - every INSUFFICIENT cell and every ladder step.

**Stop and ask** if:
- the §2 diff is non-empty;
- `routeMismatch > 0` on more than 1% of Q1 rows;
- any `(c, k)` fit hits c = 0.50 or 1.50 on a *pinned* arm (report it, do not widen the grid);
- a pre-registered rule does not decide a case;
- an artifact exceeds its cap.

---

## 13. For the later app wiring task

Moved to the companion §E. It is not for Session 2.

---

## Review record — plan gate round 1 (2026-09-27)

plan-reviewer ran a full review and raised 13 flags. Session 1 checked each one against live source, because Anton delegates review calls. All 13 held, and all 13 are applied.

| # | Flag | Decision |
|---|---|---|
| 1 | `decideOwnVsPooled` dropped the NO-GAIN gate, which would change 2a's constants. | **Applied.** The gate stays in 2a's caller. The helper replaces only the three comparison statements, and rounding, mutations and `put` stay with the caller (§2, §3.4). Test 2 now also covers the helper ignoring `delta`. |
| 2 | `ladderPick` had no `rows` argument for clustering. | **Applied.** The signature is now `ladderPick(rows, rungs)`. |
| 3 | Rung predictions, where a ladder runs with an INSUFFICIENT own cell, and the pooled-entry recipe were all unstated. | **Applied.** §3.4 defines the rung predictions. §6 says where each ladder runs and gives the entry recipe per outcome, without `putWithPooled`. |
| 4 | YE1 rows span two 2a arms. | **Applied.** `k2a` is chosen per row by the app's routing, `reuses` may name both, and §5.4 counts the YE1 × X-rookie0 rows. |
| 5 | Adapter signatures, file placement and imports were incomplete. | **Applied** (§4). |
| 6 | CR-09 fires: `inseason-run.mjs` is a trigger, and the stop condition is part of its sanctioned read. | **Applied.** D10 now keeps the reconciliation stop, gamelogs-derived fields are dropped (test 9), and §9 has a CR-09 subsection. |
| 7 | The CR-15 Mirror quote was truncated, and its last sentence names only `--inseason`. | **Applied.** The full quote is in §9, companion §B.3 extends the sentence, and the sync gate is now 8 lines. |
| 8 | CR-25's app-side Triggers missed `isTrueProspect`, `normalisePPG`, `ageAdjScore`, `seasonsSinceLastQS` and `rookieDraftPicks`. | **Applied** (companion §A.4). |
| 9 | CR-25 wording: the pin-rule location, missing data-side symbols, and an ambiguous fifth insertion. | **Applied** (companion §A.2, §A.5). |
| 10 | The determinism check compared markdown, not constants. | **Applied.** It now uses `--json` and diffs `.constants`. |
| 11 | The Commands row was not updated. | **Applied.** Both CLAUDE.md edits are measured together at 24,998 bytes (§11). |
| 12 | "Q2 noL" can never occur. | **Applied.** It is now an assertion that throws on drift (§4.3, test 9). |
| 13 | Size. | The main file is ~46 KB after the fixes, and §13 moved to the companion. The 2a precedent is the same: this is one analysis whose three questions share one row assembly and one fitting core, so a split would duplicate the harness spec. **Anton decides.** Session 1 recommends not splitting. |

## Review record — plan gate round 2 (2026-09-27)

This round re-checked the round-1 fixes and raised 4 new flags. All 4 held and are applied:

| # | Flag | Decision |
|---|---|---|
| 1 | `k2a`/`kStd` are per-row numbers but were indexed by position, so the comparator k silently became prior-only. | **Applied.** `studyK: r => r.k2a` / `r => r.kStd`. |
| 2 | The pooled recipe did not create `P.constants[NAME]`. | **Applied.** Prefixed with `??= {}`. |
| 3 | The "insufficient pooled" rule conflicted with fixed-rung ladders. | **Applied.** It now splits by rung-0 type. |
| 4 | The `reuse` shape was inconsistent between §6 and §7, and test 11 was aimed at the wrong function. | **Applied.** §7 uses the array form, and test 11 targets `runInSeasonDyn`. Test 12 also carries the reviewer's note about the reconciliation fixture. |

The reviewer confirmed that the CR-09, CR-15 and CR-25 quotes in §9 match the registry verbatim, that
the companion anchors are unique, that the §C count is 8, and that CLAUDE.md comes to 24,998 bytes.
The only item still open is the size flag, which goes to Anton.
