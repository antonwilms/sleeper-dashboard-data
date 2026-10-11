# W3 — D-13 companion: composed rookie total points (`--rookie-total`)

Part of `research-arms-w3.md`, split out to keep that file under 40 KB. Section numbers are kept, so "§7.x" means
this file. Stage A commit A5 implements this file. The baselines, rules, precondition and hand-back are in the main
file.

---

## 7. D-13 — the composed rookie total points

### 7.1 What was measured, and why §E said "a few percent"

**Population.** W2's committed availability panel: `backtests/2026-10-10-rookie-panel.json` `rookiePathAll.rows`
(data `7e900fc`). It has 3,848 rows and is the population the app's games ladder reproduces (0 of 74 cells move).

**Prediction.** The **shipped** per-row composition, `reconstructShippedRookieProjection(...).projectedTotalPts`.
That is the calibrated, ceiled PPG × the ladder's games, rounded as the app rounds.
- Inputs: position, `draftRound`, `draftPick`, `experienceYears`, and `draftCapitalStatus` (`'undrafted'` for the
  undrafted group, else `'matched'`).
- `ageAtDraft` = `draftYear − birthYear` from `nflverse/playerids.json`, the same derivation as
  `inseason-run.mjs:221-223`.
- **Parity.** `reconstructRookieProjection(...).projectedPPG` equals the row's own `projectedPPG` on 3,848 of 3,848
  rows.

**Outcome.** `outcomeTotalPts`. Absent rows count as zero.

| slice | n | players | Σpred / Σreal | 95% CI (player-clustered) |
|---|---|---|---|---|
| all rows | 3,848 | — | 1.167 | — |
| r1, non-QB | 95 | 86 | 0.863 | [0.760, 0.995] |
| day2, non-QB | 295 | 249 | 1.136 | [1.032, 1.262] |
| **day3, non-QB** | 875 | 555 | **1.257** | [1.127, 1.409] |
| **undrafted, non-QB** | 2,026 | 963 | **1.197** | [1.051, 1.374] |
| QB, all groups | 557 | 218 | 1.286 | [1.098, 1.529] |

**Where it comes from (all rows).** The games side is nearly right: Σ predPPG × realGames is within 3% of the
shipped total. The PPG side is not:
- rows that went on to play 1–5 games realise 0.47 of their predicted PPG;
- rows that played ≥ 6 games realise 0.93 of it on this population.

So low-game players score less per game, as D-13 suspected. The calibration was fitted on the legacy gated panel,
so it does not see this.

**Why §E disagreed.** §E multiplied cell means, E[PPG | gp ≥ 6] × E[games], on the legacy season-presence
population. Two biases cancelled there. The app does something else: it multiplies a **per-row** calibrated PPG by
a **ladder** games value on the entry-cohort population.

**Out of sample.** A per-group multiplier fitted leave-one-target-season-out (all positions) beats the shipped
total on MAE:
- day2 −3.07 [−4.51, −1.55];
- day3 −1.91 [−2.18, −1.64] (non-QB decision rows, §7.2's fit: −2.21 [−2.57, −1.83]);
- undrafted −0.86 [−0.92, −0.80] (non-QB decision rows: −0.75 [−0.80, −0.70]);
- r1 NO-GAIN.

Full-sample multipliers: day2 0.816, day3 0.816, undrafted 0.824, r1 0.993.

### 7.2 Decision rule (pre-registered here; Session 2 does not tune it)

- **Decision population:** non-QB rows of the two calibrated groups, `day3` and `undrafted`.
  - r1 and day2 are reported only. They carry no PPG calibration (`ROOKIE_CALIBRATION`'s own scope), because the
    neutral reconstruction understates them.
  - QB is reported only. A live backup rookie QB's total is the chain's, which this reconstruction does not
    compose (CR-15 Mirror).
- **A group is `correct`** when all three hold:
  - ρ = Σpred / Σreal ≥ 1.05 with CI lower bound > 1, or ρ ≤ 0.95 with CI upper bound < 1;
  - **and** its LOSO multiplier (fitted on that group's decision rows, folds by `targetSeason`) gives a ΔMAE
    labelled `BEATS`.
- **Verdict:** `recommend` when either group is `correct`, else `close`.
- **Primary metric:** bias. MAE rewards shrinking toward the median on a zero-heavy outcome, so it only confirms
  that the correction does not hurt out of sample.

### 7.3 A5 spec

**`lib/rookieTotalPoints.mjs`** (new, pure, no I/O). Imports `reconstructShippedRookieProjection` from
`./rookieMirror.mjs`, `reconstructRookieProjection` from `./projectionFactors.mjs`, and `clusteredBootstrap`,
`bootstrapPairedMean`, `compareLabel`, `IN_SEASON_DEFAULTS` from `./inSeasonEvidence.mjs`.

- `export const ROOKIE_TOTAL = Object.freeze({ decisionGroups: ['day3', 'undrafted'], decisionPositions: ['RB',
  'WR', 'TE'], materiality: 0.05, groups: ['r1', 'day2', 'day3', 'undrafted'], bootstrap:
  IN_SEASON_DEFAULTS.bootstrap })`.
- `export function composeRookieRow(row, ageAtDraft)` → `{ parity, predTotal, predPPG, predGames, gamesBasis }`.
  - `parity` is `reconstructRookieProjection({ position, ageAtDraft, draftRound, draftPick }).projectedPPG ===
    row.projectedPPG`.
  - The rest comes from `reconstructShippedRookieProjection` with the §7.1 inputs and the default QB model.
- `export function biasSummary(rows)`. `rows` carry `{ sleeperId, predTotal, predPPG, outcomeTotalPts,
  outcomeGames }`. Returns `{ n, players, meanPred, meanReal, ratio, ci95, gamesHeldRatio, ppgRealOverPred: { gp6,
  gp1to5 } }`.
  - `ratio` = Σpred / Σreal. `ci95` from `clusteredBootstrap` over per-player `{ p, a }` sums; the statistic is
    `a > 0 ? p / a : null`.
  - `gamesHeldRatio` = Σ(predPPG × outcomeGames) / Σreal.
  - `ppgRealOverPred.gp6` = Σreal / Σ(predPPG × outcomeGames) over rows with outcomeGames ≥ 6; `gp1to5` the same
    over 1–5. Each is null when its denominator is 0.
- `export function losoMultiplier(rows, keyFn)`. For each distinct `targetSeason`, fit `m[key]` = Σreal / Σpred over
  the other seasons' rows (1 when Σpred is 0), and apply it to that season's rows. Returns `{ preds: number[]`
  (aligned to `rows`)`, folds: [{ S, m }], fullSample: { [key]: m } }`.
- `export function maeDelta(rows, shipped, corrected)`. Takes per-row diffs `|corrected − real| − |shipped − real|`
  and passes them to `bootstrapPairedMean(sleeperIds, diffs, ROOKIE_TOTAL.bootstrap)`. Returns `{ maeShipped,
  maeCorrected, mean, ci95, label }`.
- `export function decideRookieTotal(decisionByGroup)`. The input is `{ day3: { bias, loso }, undrafted: … }`.
  Applies §7.2 and returns `{ perGroup: { day3: 'correct'|'none', undrafted: … }, verdict: 'recommend'|'close' }`.

**`scripts/rookie-total-run.mjs`** (new adapter).
- **Pin.** `export const ROOKIE_TOTAL_PIN = Object.freeze({ path: 'backtests/2026-10-10-rookie-panel.json', commit:
  '7e900fc5c45ca223cfb8eeb4892f8c53b1195c03', rows: 3848 })`.
- **Loaders.** `export const ROOKIE_TOTAL_LOAD = { loadPanel: () => readJson(ROOKIE_TOTAL_PIN.path),
  loadPlayerIds: () => readJson('nflverse/playerids.json') }`.
- **`export function runRookieTotal({ load = ROOKIE_TOTAL_LOAD, pin = ROOKIE_TOTAL_PIN } = {})`.** Throw:
  - unless `rookiePathAll.rows.length === pin.rows`;
  - when any row lacks a birthdate;
  - when any row's `parity` is false. The message gives the count.

  It returns `{ meta: { generatedAt, panel: \`${pin.path} @ ${pin.commit}\`, rows, basis: 'half_ppr' },
  bias: { all, byGroup, byGroupNonQB, byGroupPosition, byExperience, qb, target2025 }, loso: { byGroupAll, decision },
  decision, candidateMultipliers }`.
  - `candidateMultipliers` = `losoMultiplier`'s `fullSample` per group over non-QB rows, rounded to 3 dp, and
    labelled "candidate — not pinned anywhere".
  - `target2025` = the `targetSeason === 2025` rows, labelled in-sample.
- **`export function buildRookieTotalVerdictMarkdown(result)`.** The title is `# D-13 — composed rookie total points
  (shipped PPG × availability games) vs realised`. Sections:
  - **§A** population and parity;
  - **§B** bias tables: group, group non-QB, group × position, experience, QB;
  - **§C** decomposition;
  - **§D** LOSO;
  - **§E** decision, stating the §7.2 rule verbatim;
  - **§F** limitations, the four in §7.5;
  - **§G** "What a correction would move" (§7.5);
  - and `**Reproduce:** \`node bin/backtest.mjs --rookie-total --write\``.
- **`writeRookieTotalArtifacts` and `rookieTotalMain({ write, asJson })`.** Same shape as `absenceMain`. Write
  `backtests/<date>-rookie-total-panel.json` (the result, no per-row data) and
  `grading/<date>-rookie-total-verdict.md`. Both are unregistered, as `backtests/` and `grading/` are.

**`bin/backtest.mjs`.**
- Add a `--rookie-total` branch shaped like `--absence`'s. It accepts only `--json` and `--write` and rejects
  everything else with exit 1.
- Add one header-comment bullet.
- Import `rookieTotalMain`.

**Tests** — `test/rookie-total.test.mjs`:
1. `composeRookieRow` equals `reconstructShippedRookieProjection`'s `projectedTotalPts` on a hand-built undrafted WR
   row. `parity` is false when `row.projectedPPG` is altered.
2. `biasSummary` on four synthetic rows, two players, with exact `ratio`, `gamesHeldRatio` and `players`; `ci95`
   brackets `ratio`.
3. `losoMultiplier`: season A's held-out prediction uses only season B's ratio (exact values).
4. `decideRookieTotal`, with five cases:
   - correct on over-statement;
   - none at ρ 1.04;
   - none when the CI covers 1;
   - none when LOSO is NO-GAIN;
   - `recommend` iff either group is correct.
5. `runRookieTotal` with a stub load:
   - throws on a row-count mismatch;
   - throws on a parity mismatch;
   - on a 6-row stub, returns the documented keys.
6. CLI: `--rookie-total --from 2013` exits 1.

**README.** Add a new `### D-13 composed rookie total points (\`bin/backtest.mjs --rookie-total\`)` section,
directly after the `### Rookie QB starter level` section's body. One paragraph stating:
- the population and pin;
- the composition;
- that it sits outside `bin/panel.mjs`'s closure because it reaches `lib/rookieMirror.mjs` (T-RM1);
- the §7.2 rule;
- the artifacts.

In the `### D-8/D-9/D-12/D-13` section, append one sentence: "§E's cell-mean residual is not the shipped
composition; `--rookie-total` measures that (research-arms-w3)."

**`CLAUDE.md`** (24,993 bytes; measured):
- Backtest row: append `, \`--rookie-total\`` after `\`--games-calibration [--cause/--short]\``.
- `scripts/backtest-run.mjs` row: replace `\`qb-rookie-level-run.mjs\` (\`--qb-rookie-level\`) reach` with
  `\`qb-rookie-level-run.mjs\` (\`--qb-rookie-level\`), \`rookie-total-run.mjs\` reach`.
- Prune: the `lib/registry.mjs` row loses `; reports per-entry cache-field anchor counts, no writes`. The
  `scripts/registry-audit.mjs` header keeps that detail.
- The `lib/backtest.mjs` row does not get a `lib/rookieTotalPoints.mjs` mention; there is no byte room for it.
  README carries the module.
- Expected size ≈ 24,980 bytes. `test/claudeMdSize.test.mjs` must pass.
- No `package.json` script: the shortcut list would need another CLAUDE.md byte, and `npm run backtest --
  --rookie-total` already works.

### 7.4 A5 gates (stop and report on any failure)

- **D1.** Parity holds on 3,848 / 3,848 rows; no birthdate is missing.
- **D2.** `bias.all.ratio` is 1.167 ± 0.001. The non-QB day3 and undrafted ratios and CIs match §7.1 to 3 dp.
  These use the same bootstrap seed; a difference means the composition differs, so find out why.
- **D3.** `decision.verdict === 'recommend'` and both groups are `correct`. If either is not, report it. **Do not
  change the rule.**
- **D4.** `npm test` and `npm run smoke` are green.

Message: `D-13: composed rookie total points vs realised (--rookie-total) — shipped composition overstates
day3/undrafted; recommendation, no change (research-arms-w3)`.

### 7.5 Limitations and stakes (verbatim into §F and §G)

**Limitations (§F):**
- **KTC and college are neutral.** The live season projection multiplies by `ktcMult` (0.70–1.30) and
  `collegeContribution`, which history cannot reconstruct; KTC history starts 2026-05-18. The measured bias belongs
  to the neutral composition, which is the composition the PPG calibration itself was fitted on.
- **QB is not composed.** A `chain` row's total is the starter level × share × team games (CR-15).
- **Not out of sample.** The games ladder and the PPG calibration were fitted on overlapping rows, target seasons
  ≤ 2025. 2025 is shown but is in-sample; 2026 is the first clean season, once it completes (D-16's trigger).
- **MAE favours shrinkage** on a zero-heavy outcome. Bias is the primary metric.

**What a correction would move (§G):**
- It moves `projectedTotalPts` of day-3 and undrafted RB/WR/TE rookie-path rows, by about −20%.
- It does not move `projectedPPG`, `projectedGames`, the dynasty score or the in-season k.
- The consumers that read `projectedTotalPts` are app `App.jsx`, `inSeasonScoring.js`, `PlayerCard.jsx` and
  `MyTeamView.jsx`.
- It would be an app slice: re-mirror in CR-15, a new rookie anchor-policy boundary, and the slice decides whether
  it touches `PRIOR_MODEL_FROM`.
- The proper fix stays D-13's original two-part model (PPG given a real season × probability of playing). The
  multiplier is the cheap version.

---
