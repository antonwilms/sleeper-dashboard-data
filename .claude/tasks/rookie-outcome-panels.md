# Rookie outcome panels — D-8, D-9, D-12, D-13

**Model:** sonnet implements this file exactly. **Status:** planned (opus, 2026-09-11), **rewritten after plan-reviewer** — fourteen flags, three fatal to the first draft. This file is the rewrite, not a patch; §10 records every disposition.
**Repo:** data only. **Base:** `5d340d3` on `main` (clean tree).
**Scope source:** `../sleeper-dashboard/.claude/tasks/data-repo-backlog.md` items **D-8, D-9, D-12, D-13**. Those four and nothing else.
**Precedent:** `.claude/tasks/fullpipeline-harness.md` (D6, the harness this extends), `r3fit-exponent-harness.md`, `r3fit-panel-scale-fix.md`. Read the first before implementing.
**Dependencies, all landed:** D2 (`nflverse/playerids.json` v2 `bySleeper`), D6b (`assembleRookiePanel`, `reconstructRookieProjection`, `backtests/2026-09-06-fullpipeline-panel.json`).

**Goal.** Turn the rookie panel from one survivor-gated second-season PPG panel into one harness that can also grade a **debut** season, an **ungated** outcome, and **realised total points** — and make the re-fit trap a thrown error rather than a convention.

**Not in this slice.** No veteran-path work (§8.1's stop stands). No fitted constant of any kind — this slice builds the instrument and publishes measurements; a fit is a later slice. No app change, no served family added or altered. No ceiling and no cap: D-8 unblocks that decision, it does not make it.

---

## 0. Restated context — the app side, verbatim enough to review against

The plan-reviewer cannot read the sibling tree. Everything this plan relies on from it is stated here. Verified 2026-09-11 against `sleeper-dashboard` `origin/main` at **`42d11c5`**.

**Two app slices shipped on the rookie path, both planned from `backtests/2026-09-06-fullpipeline-panel.json`.**

1. **Rookie realisation calibration** (`rookie-calibration.md`, `f07d9be`). Rookie per-game scoring is multiplied by a per-cell constant applied **outside** the existing `[0.45, 1.85]` `rookieMultiplierProduct` clamp:
   ```
   undrafted:     QB 0.67 · RB 0.33 · WR 0.36 · TE 0.28
   day3 (r4-r7):  QB 1.00 (explicit no-op) · RB 0.80 · WR 0.79 · TE 0.71
   r1, day2 (r2-r3): 1.00 — no correction
   ```
   Groups: `r1` = {top-3, top-8, r1-mid, r1-late}, `day2` = {r2, r3}, `day3` = {r4…r7}, `undrafted`. Each constant is Σ realised PPG ÷ Σ projected PPG over that cell of the 1,056-row panel. Downward only, because the panel's early-round "lift" is an artifact of the reconstruction holding `ktcMult` and `collegeContribution` at 1.0. Three additive rookie-path `factors` keys carry it into snapshots: `draftCapitalStatus`, `rookieCalibrationMult`, `rookieCalibrationBasis`. Snapshot `schemaVersion` stayed 3.

2. **Rookie projected games** (`rookie-availability.md`, `ed027c7` through `42d11c5`). `projectedGames` was the literal constant 14 on every rookie-path row in every snapshot ever captured; it is now a five-rung lookup, first hit wins:
   ```
   rung 1  group × position × experienceBucket   floor n >= 30   (28 of 48 cells ship)
   rung 2  group × experienceBucket              floor n >= 30   (10 of 12 cells ship)
   rung 3  group × position                      floor n >= 10   (all 16 ship)
   rung 4  group pooled                          r1 12.2 · day2 10.7 · day3 6.2 · undrafted 3.2
   rung U  position × experienceBucket           only when draft status is 'unknown'
   ```
   `experienceBucket` is `'0'` / `'1'` / `'2+'`. Rounded to whole games, clamped `[0, 17]`; the veteran path's `[8, 17]` floor is deliberately not applied. One additive `factors` key, `rookieGamesBasis`. Fitted on a panel that repo's Session 1 assembled from **this repo's** `nfl/season-totals/*` plus `nflverse/playerids.json`, **with no committed artifact behind it** — that is D-12.

**The instruction that constrains this slice**, quoted from `rookie-calibration.md` §6 under CR-15 and repeated in `rookie-availability.md` §6:

> **The constants must not be re-fitted through a reconstruction that already applies them** — a re-fit is a fit of the *uncorrected* stack, so the calibration multiplier stays out of the predictor whenever the rookie panel is regenerated for fitting.

**The app's stated residual (D-13's premise).** Slice 1's PPG constants are conditioned on a `gp ≥ 6` outcome gate; slice 2's games constants are unconditional. The app bounds the resulting overstatement at **up to 18% for undrafted rookies**, derived as the share of a cohort's games contributed by its sub-six-game population. §1 Q2(d) measures the realised figure; it is not 18%.

**The app-side population figure D-12 must reconcile against.** Slice 2's ladder was fitted on **3,848** rows over target seasons 2013–2025 under this routing predicate, stated in its task file: walk target seasons forward from entry year; stop at the first one preceded by a `gamesPlayed ≥ 8` season; skip a row at `years_exp ≥ 2` on a double-zero-game gap. Group totals r1 152, day2 360, day3 1,119, undrafted 2,217; by experience bucket r1 127/17/8, day2 276/44/40, day3 632/274/213, undrafted 1,036/785/396. §1 Q1(d) reports what this repo's stores produce under that description.

---

## Step 0 — verified against live source, 2026-09-11

Every claim was re-derived by running this repo's own exported functions over its own committed stores. The scratch reproduction reproduced the committed artifact's `assembled 2563 / surviving 1056` exactly, which is what licenses the rest.

**F1 · The rookie predictor is already a draft-time predictor.** `reconstructRookieProjection` (`lib/projectionFactors.mjs:762-779`) takes `{ position, ageAtDraft, draftRound, draftPick }` and reads **no season data at all**. `ktcMult` and `collegeContribution` are hard-wired to `1.0` with a disclosed deviation note (`:706-719`). Nothing in the predictor depends on the player having played.

**F2 · The second-season restriction lives entirely in the assembly loop.** `assembleRookiePanel` (`lib/panel.mjs:1850-1908`) iterates `Object.keys(totalsByYear[Y])`, applies the rookie-path predicate (no `gp ≥ 8` season anywhere `≤ Y`, **or** no season-totals appearance before Y), and takes the outcome from `Y + 1`. Given F1, a debut panel changes the enumerator and the outcome year and changes the predictor not at all.

**F3 · The outcome gate is a three-part OR, and only one part is the gate.** Verbatim, `lib/panel.mjs:1892`:
```js
if (outcomeLookup.ppg == null || !Number.isFinite(outcomeLookup.ppg) || outcomeLookup.gamesPlayed < minOutcomeGames)
```
`computeSeasonPoints` returns `{ ppg: rec.actualPPG, gamesPlayed: rec.actualGames ?? 0 }` (`:120-125`) and `buildHalfPprOutcomes` sets `actualPPG: gp > 0 ? fp / gp : null` (`scripts/grade-snapshot.mjs:70-81`). **So the first clause alone discards every zero-game row**, and relaxing `minOutcomeGames` does nothing for them. Removing the gate means rewriting this condition, not parameterising its threshold. It is also the mechanical reason D-13 must be a *total points* panel: a player who played zero games has no PPG at all.

**F4 · `actualTotalPts` already exists on every outcome record.** Both `buildHalfPprOutcomes` (`:76`) and the in-basis builder (`:111`) emit it; `computeSeasonPoints` simply does not return it. D-13's outcome field is a one-line widening of that helper, and the widening is what keeps the panel basis-aware instead of hard-wired to `half_ppr`.

**F5 · A zero row is basis-free.** A season-totals row with `gamesPlayed: 0` carries `stats: {}` and `fantasyPoints: 0` (2020: 93 such rows, none with a nonzero or undefined `fantasyPoints`). A player absent from the file has no `stats` object at all. A zero outcome is therefore identical under `half_ppr` and in-basis, because neither reads anything.

**F6 · Season-totals inclusion is "appeared in a Sleeper weekly stats response".** `aggregateWeeks` (`lib/sleeper.mjs:231+`) creates a row on the first week a player appears, whether `gp === 1` (played) or `gp === 0` (rostered, did not dress → `dnpWeeks`/`byeWeeks`). Absence means no weekly response all season. "Present with zero games" and "absent" are **different populations**.

**F7 · Position resolution reads advanced stats first.** `resolvePosition(pid, advstatsY, rosterY, crosswalk)` (`lib/panel.mjs:138-146`) tries advstats, then roster, then the season-independent crosswalk; `scripts/panel-run.mjs:1367-1375` loads all three per predictor year for the rookie panel. **Any reassembly of the shipped panel must load advstats**, or it resolves different positions, picks different `ROOKIE_BASELINE_PPG` values, and cannot reproduce the 1,056 rows. `loadAdvstats` in `scripts/panel-run.mjs` and `resolvePosition` in `lib/panel.mjs` are both listed CR-07 data-side triggers — see §4.

**F8 · The entry cohort is enumerable without touching outcomes.** `nflverse/playerids.json` `bySleeper` (6,386 entries) carries `draftYear`, `draftRound`, `draftPick`, `undrafted`, `birthdate` per sleeper id; `ids` carries a season-independent `position`. `nflverse/draft/draft_picks.json` is **not** usable — `picksByYear` 2010–2026 carries `fullName`/`position`/`college`/`age` and **no sleeper or gsis id**, so joining it needs the app's name matcher.

**F9 · `bySleeper.draftPick` is the within-round pick.** Never join it against `draft_picks.json` `pick`, which is the overall selection. The tier table is nonetheless correct as written: for round 1 the within-round pick equals the overall pick, and no other tier row reads `pick`.

**F10 · `bySleeper.draftYear` carries a zero sentinel.** 45 entries have `draftYear: 0`, **13 of them at panel positions**; none is null; every panel-position entrant has a birthdate. In the shipped predictor, `ageAtDraft = draftYear − birthYear` makes a sentinel row a large negative, which falls into `reconstructRookieAgeFactor`'s most favourable `≤ 21 → 1.15` bucket — `sleeperId 686` (QB) carries `projectedPPG 15.0` in the committed panel on that path. Three such rows are in the committed 1,056 (`412`, `686` at `draftYear: 0`; `8799` at `draftYear: 2025` against `predictorYear: 2024`), which are exactly the three the app's own slice 1 named and excluded from its experience cross-tab. **This is shipped behaviour and must not be changed** — changing it breaks the reproduction pin.

**F11 · Roster coverage starts 2016.** `nflverse/roster/<year>.json` exists 2016–2026, shape `{ schemaVersion, season, generatedAt, rowCount, players: { <sleeperId>: { team, position, status, fullName } } }`. It is the only in-store instrument separating "out of the league" from "in the league, never dressed", and it cannot do so for outcome years 2014–2015.

**F12 · The shipped panel's population is not a rookie population.** Over the 2,563 assembled rows, `predictorYear − draftYear` distributes: **1,492 at 0 · 451 at 1 · 255 at 2 · 345 at 3 or more · 12 with no usable draft year · 8 negative**. Over the surviving 1,056: 828 · 126 · 55 · 46 · 0 · 1. So roughly one row in seven is three-plus seasons past draft — journeymen who never qualified, admitted by the `!hasQualifying` disjunct against `HISTORY_FLOOR = 2012`. `sleeperId 144` is a 2008 seventh-rounder graded at `predictorYear 2013`. **Every statistic measured on this population is a rookie-path statistic, not a rookie statistic**, and must be labelled as such wherever it sits beside an entry-cohort number.

**F13 · Artifacts under `backtests/` and `grading/` are unregistered by an established convention** (README `:2011`, `:2025`, `:2046`, `:2085`; `manifest.json` has zero entries under either prefix). No manifest work, no CDN purge, no `data-catalog.md` row.

**F14 · `CLAUDE.md` is 24,384 bytes against a 25,000-byte ceiling** enforced by `test/claudeMdSize.test.mjs` — 616 bytes of headroom. Additions fit or prune in the same commit; never raise the ceiling.

---

## 1. The five questions, resolved

### Q1 · One panel or four → **one harness, one predictor, one outcome record, two enumerators, one shared predicate**

**(a) Four is wrong.** The four items read the same two stores, call the same predictor, and share the rookie-path concept. Four assemblers means four copies of the predicate, and the predicate is the thing most likely to drift — it already exists in two spellings, `assembleRookiePanel`'s inline version (`lib/panel.mjs:1866-1876`) and `assemblePanelRows`' `rookiePathNoQualifying` / `rookiePathYearsExpProxy` exclusion (`:367+`).

**(b) So the predicate is extracted once, and the walk does not get a third spelling.** New exported pure helper:

```js
export function rookiePathStateAt(pid, Y, { totalsByYear, ppgByYear, fromSeason = HISTORY_FLOOR })
// → { hasQualifying, earliestAppearance, isRookiePath }
```
`hasQualifying` is "some season in `[fromSeason, Y]` has a finite PPG and `gamesPlayed >= 8`"; `earliestAppearance` is the first season in `[fromSeason, Y)` with a season-totals row; `isRookiePath = !hasQualifying || earliestAppearance == null`. `assembleRookiePanel` calls it. The entry-cohort walk calls it. **`assemblePanelRows` is not refactored** — that is the veteran panel's exclusion path and touching it is out of scope — but §6 test 10 asserts the new helper and that exclusion agree on a shared synthetic population, which is the drift check without the risky edit.

**(c) Two enumerators are genuinely distinct and cannot be collapsed.**

| enumerator | population | outcome year | serves |
|---|---|---|---|
| `season-presence` | `Object.keys(totalsByYear[Y])`, rookie-path at Y | `Y + 1` | the **shipped** 1,056-row panel — must stay reproducible byte-for-byte, because two app slices' constants are fitted on it |
| `entry-cohort` | `bySleeper` entrants by `draftYear`, walked forward | the target season **`T` itself** | D-8 (`T == entryYear`) and D-12 (all rookie-path `T`) |

`season-presence` is not derivable from `entry-cohort`: it admits players who entered before 2013 and still have no qualifying season (F12), and it conditions on appearance in the predictor year.

**(d) D-9 stops being a panel.** With the gate removed there are no drops — the 1,507 dropped rows become strata of a complete panel, so D-9 is delivered as a **classification on every row**. On the shipped population (2,563 rows, predictor years 2013–2024) it splits four ways: **1,056** played ≥6 games, **467** played 1–5, **366** present with zero games, **674** absent from season-totals. The gate is emphatically not neutral — survival runs from **0.085** to **0.942**:

| cell | absent | 0 games | 1–5 | ≥6 | n | survival |
|---|---|---|---|---|---|---|
| r1\|QB | 4 | 0 | 5 | 37 | 46 | 0.804 |
| r1\|RB | 1 | 0 | 0 | 15 | 16 | 0.938 |
| r1\|TE | 0 | 0 | 1 | 11 | 12 | 0.917 |
| r1\|WR | 1 | 0 | 2 | 49 | 52 | 0.942 |
| day2\|QB | 11 | 18 | 31 | 21 | 81 | 0.259 |
| day2\|RB | 4 | 3 | 13 | 55 | 75 | 0.733 |
| day2\|TE | 5 | 6 | 8 | 46 | 65 | 0.708 |
| day2\|WR | 5 | 3 | 8 | 98 | 114 | 0.860 |
| day3\|QB | 62 | 74 | 84 | 31 | 251 | 0.124 |
| day3\|RB | 46 | 24 | 37 | 116 | 223 | 0.520 |
| day3\|TE | 18 | 11 | 16 | 83 | 128 | 0.648 |
| day3\|WR | 59 | 31 | 42 | 128 | 260 | 0.492 |
| undrafted\|QB | 63 | 40 | 47 | 14 | 164 | 0.085 |
| undrafted\|RB | 111 | 45 | 47 | 101 | 304 | 0.332 |
| undrafted\|TE | 85 | 35 | 47 | 101 | 268 | 0.377 |
| undrafted\|WR | 199 | 76 | 79 | 150 | 504 | 0.298 |

**Population label, mandatory wherever this table appears (F12):** *rookie-path, season-presence enumerator, predictor years 2013–2024; one row in seven is three-plus seasons past draft year.* It settles the `day3:QB` question the app deferred — that cell's 31 surviving rows are **12.4%** of its 251, the most survivor-selected cell in the panel, and the app shipped it clamped at 1.00 on exactly that suspicion. **Report the number; do not re-fit the cell.**

**(e) Outcome is not a parameter either.** Emit all three outcomes on every row (`outcomeGames`, `outcomeTotalPts`, `outcomePPG` — the last null when `outcomeGames === 0`, per F3). Reading a field costs nothing, and one row shape serves D-9, D-12 and D-13 instead of three artifacts.

**Decision:** one module, one row shape, one predictor, one extracted predicate, **two named enumerators**, and a gate that is on or off rather than a free threshold (§2.2c).

### Q2 · What replaces the `gp ≥ 6` gate → **nothing gates; a fixed six-state classification replaces it, and the outcome becomes total points**

**(a) "Outcome" for a player who never played is zero total points, and that is a real observation.** Total points is defined for everyone. PPG is defined for nobody in that population (F3). D-13's outcome field is `actualTotalPts` and this is forced, not chosen.

**(b) A zero row is two populations, and the split is measurable in-store.** Per F6. Cross-referencing the 674 absent rows against the **outcome year's** `nflverse/roster`:

| absent-row class | n |
|---|---|
| on the outcome-year roster, never dressed | 302 |
| not on the outcome-year roster | 294 |
| outcome year predates roster coverage (2014, 2015) | 78 |

So 366 + 302 = **668 rows are a league player who scored zero**, and 294 are **out of the league**. The app projects the former and would never render the latter. Both realise zero points, so both belong in a total-points panel; they are different evidence and must be separable. Hence a categorical, not a boolean:

```
outcomeClass ∈ 'played6plus' | 'played1to5' | 'rosteredZero'
             | 'absentOnRoster' | 'absentOffRoster' | 'absentNoRosterFile'
```

**The six-game boundary in `'played6plus'` is fixed and is not the gate.** It is pinned at 6 because that is the boundary the shipped constants were fitted at, and it stays 6 whatever the gate does. `rosteredZero` rows additionally carry `dnpWeeks` from the season-totals row — the in-store witness that the player was in a gameday context at all.

**(c) What it does to the basis pin.** Per F5 a zero is basis-free: it is read from no `stats` object, so `half_ppr` and in-basis agree trivially. `meta.basis: 'half_ppr'` is therefore a claim about a **subset** of the rows, and the artifact must say so rather than let a later in-basis run assume comparability:

```js
meta.basisScope = {
  basis: 'half_ppr',
  appliesTo: 'rows with outcomeGames > 0',
  basisFreeZeroRows: <count>,          // rosteredZero + all three absent classes
  note: 'A zero outcome is read from no stats object and is identical under any scoring basis.',
}
```

**(d) The residual D-13 exists to close is not 18%, and where it bites, the evidence is too thin to fit.** Measured on the shipped panel's own population (2,563 rows, absence counted as zero games and zero points), comparing realised mean total points against the product `E[PPG | gp ≥ 6] × E[games]` — the exact composition the app now ships. Errors are computed at full precision; the columns are what they are derived from.

| group | n | mean games | mean pts | E[PPG\|≥6] | n≥6 | product | error |
|---|---|---|---|---|---|---|---|
| r1 | 126 | 12.508 | 152.63 | 11.926 | 112 | 149.17 | −2.27% |
| day2 | 335 | 9.382 | 70.54 | 7.593 | 220 | 71.24 | +0.99% |
| day3 | 862 | 5.884 | 24.37 | 4.115 | 358 | 24.21 | −0.64% |
| undrafted | 1,240 | 4.126 | 10.25 | 2.463 | 366 | 10.16 | −0.84% |

At group level the product is right to within 2.3%. The app's bound reproduces on this population as its own statistic — the ≥6 sub-population supplies 99% / 95% / 90% / 89% of each group's games — but it assumes the sub-six population scores nothing per game, and it does not. Two biases cancel: `E[PPG | ≥6]` sits below the games-weighted mean PPG by roughly as much as the unconditional games mean overstates the games that actually score.

All sixteen cells, so the partition is complete:

| cell | n | mean games | mean pts | E[PPG\|≥6] | n≥6 | product | error |
|---|---|---|---|---|---|---|---|
| r1\|QB | 46 | 11.33 | 192.18 | 16.396 | 37 | 185.70 | −3.4% |
| r1\|RB | 16 | 13.19 | 180.81 | 13.657 | 15 | 180.10 | −0.4% |
| r1\|TE | 12 | 12.33 | 91.47 | 7.592 | 11 | 93.63 | +2.4% |
| r1\|WR | 52 | 13.38 | 123.09 | 8.994 | 49 | 120.38 | −2.2% |
| day2\|QB | 81 | 3.77 | 38.25 | 12.047 | 21 | 45.36 | **+18.6%** |
| day2\|RB | 75 | 10.41 | 108.46 | 10.155 | 55 | 105.74 | −2.5% |
| day2\|TE | 65 | 10.40 | 47.13 | 4.558 | 46 | 47.40 | +0.6% |
| day2\|WR | 114 | 12.11 | 81.87 | 6.625 | 98 | 80.25 | −2.0% |
| day3\|QB | 251 | 2.02 | 16.28 | 8.899 | 31 | 17.98 | **+10.4%** |
| day3\|RB | 223 | 7.24 | 34.59 | 4.782 | 116 | 34.61 | +0.1% |
| day3\|TE | 128 | 9.33 | 20.98 | 2.296 | 83 | 21.42 | +2.1% |
| day3\|WR | 260 | 6.76 | 25.07 | 3.530 | 128 | 23.85 | −4.9% |
| undrafted\|QB | 164 | 1.43 | 10.36 | 8.658 | 14 | 12.41 | **+19.8%** |
| undrafted\|RB | 304 | 4.68 | 13.33 | 2.838 | 101 | 13.29 | −0.3% |
| undrafted\|TE | 268 | 5.29 | 6.80 | 1.290 | 101 | 6.82 | +0.3% |
| undrafted\|WR | 504 | 4.05 | 10.18 | 2.421 | 150 | 9.81 | −3.7% |

Every cell outside ±5% is a QB cell, and each rides on a thin conditional sample: 21 of 81, 31 of 251, 14 of 164. Restricting to debut-equivalent rows (`predictorYear === draftYear`, n = 1,492) does not rescue it — group errors stay within ±2.4% and `undrafted|QB` goes to **+66.4% on two surviving rows**. That is the finding: **at QB there is no measurable conditional PPG to multiply**, not a 19% correction waiting to be applied.

**This reframes D-13 rather than cancelling it.** The panel is still the right instrument and still must be built; the numbers above are a scratch reproduction, not a published artifact, and the harness's own protocol has to stand behind them. But the later fitting slice should be aimed at whether the QB cells support any conditional estimate at all, not at a uniform 18% correction. Carry this, with its population label, into the verdict.

### Q3 · The debut-season panel (D-8) → **yes, reconstructable, and the predictor needs no change at all**

**(a) The predictor is already draft-time.** Per F1 it consumes position, age at draft, draft round and draft pick. Each is known before a snap, all four come from `bySleeper` and the `ids` crosswalk, and none is a season quantity. The two inputs it cannot reconstruct, KTC and college, are already held at 1.0 across the whole window and stay there. A debut panel's predictor is **the identical function called with the identical arguments**; only the population and the outcome year move.

**(b) The population enumerates cleanly, and the count is independently confirmed.** `bySleeper` filtered to `draftYear ∈ [2013, 2025]`, `draftYear > 0` (F10) and `PANEL_POSITIONS` gives **2,071** entrants: r1 **127**, day2 **276**, day3 **632**, undrafted **1,036**. Those four numbers are exactly the debut-row counts the app's slice 2 reports for its own independently-assembled panel. Two separate assemblies agreeing to the row is the strongest available evidence that the enumeration is right.

**(c) Three limits to state in the verdict, none disqualifying.**
- **Selection floor.** The population is entrants nflverse has keyed to a sleeper id. The floor sits above the outcome rather than correlating with it — 52% of the 1,036 undrafted debut rows played zero games — but a later slice must not read these rows as "every entrant".
- **KTC and college stay neutral.** Same structural gap as today. College data exists in-store from 2017, so a partial reconstruction is possible later; porting `computeCollegeMetrics` is a separate sub-project and is **not** in this slice.
- **Draft-capital resolution has two states here and three in the app.** `bySleeper` gives drafted-or-`undrafted: true`; the app adds `'unknown'` for an entry year outside its loaded draft window. On this population the third state is empty. Mapping: `undrafted: true → 'undrafted'`, absent from `bySleeper` → `'unknown'` (no discount), otherwise `'matched'`. Do not model the app's window test — it is a loader artifact with no analogue here.

**(d) What D-8 does and does not unblock.** It makes "never project a rookie to a level no rookie has reached" answerable, because the debut panel finally contains the case. It does **not** settle the ceiling — that needs a fit, and no fit happens here.

### Q4 · The re-fit trap → **a machine gate on a mandatory declaration, with both arms tested**

The mechanism is precise. `reconstructRookieProjection` is the data side of CR-15, whose Mirror text instructs this repo to mirror the app's changed constants. The instant the realisation calibration and the games ladder land in it, any panel regenerated for fitting runs a predictor that already contains the constants fitted on its predecessor. Convention fails here specifically, because the mirror obligation and the fit obligation pull in opposite directions and live in different slices.

**Four parts. (a) and (b) without (c) are decoration, and (c) without the negative arm is half a test.**

**(a) Two functions, two names — never one function with a flag.**
- `reconstructRookieProjection` — **the fit predictor.** Uncorrected, permanently. Its docstring states that CR-15's rookie mirror does not land here and names where it does.
- `reconstructShippedRookieProjection` — **reserved; not written in this slice.** When CR-15's rookie mirror is discharged it lands here, composes the uncorrected function, and applies the calibration and the ladder. It exists in this plan as a named destination so the mirror has somewhere to go that is not the fit path.

A flag on one function is rejected: a flag defaults, and a default is a convention.

**(b) The predictor declares what it applied; the assembler refuses anything that is not an explicit empty declaration.**
```js
// lib/projectionFactors.mjs, module level
const EMPTY_CORRECTIONS = Object.freeze([]);
// in reconstructRookieProjection's return
appliedCorrections: EMPTY_CORRECTIONS,
```
```js
// lib/panel.mjs, in the assembler, per row, immediately after the predictor call
if (!Array.isArray(proj.appliedCorrections)) {
  throw new Error(
    '[rookie-panel] predictor did not declare appliedCorrections — a fit panel requires an ' +
    'explicit declaration that the UNCORRECTED stack ran (CR-15; see ' +
    '.claude/tasks/rookie-outcome-panels.md §1 Q4)'
  );
}
if (proj.appliedCorrections.length) {
  throw new Error(
    `[rookie-panel] predictor applied ${proj.appliedCorrections.join(', ')} — ` +
    'a fit panel must run the UNCORRECTED stack (CR-15 rookie mirror belongs in ' +
    'reconstructShippedRookieProjection; see .claude/tasks/rookie-outcome-panels.md §1 Q4)'
  );
}
```
**A missing field throws.** A predictor that composes corrections and forgets to declare them is exactly the failure this guard exists for, and an optional-chained length check would wave it through. The assembler takes its predictor as an injected callable (default `reconstructRookieProjection`) so the guard is reachable by a test and so a future parity arm gets a loud refusal rather than a silent poisoning. **The guard is unconditional** — there is no opt-out parameter, and a parity panel that genuinely wants the corrected predictor will need its own explicit entry point. Needing to write one is the point.

**(c) Both arms tested.** §6 tests 2 and 3: a stub declaring `['rookieCalibration']` throws; a stub omitting the field entirely throws. Test 4 asserts the real predictor's declaration is present, empty and frozen.

**(d) State the limit the gate cannot reach.** A re-fit over predictor years 2013–2024 is a *re-derivation* of the shipped constants, not independent validation, however clean the predictor is — the rows overlap. Genuine out-of-sample evidence needs target seasons the constants never saw: 2025 is available now for the availability and total-points panels, 2026 once it completes. Put this sentence in the verdict, next to any ratio a reader could mistake for confirmation.

### Q5 · Is anything owed back → **no app change is required, but two registry entries fire and their Mirror text is owed as Session 1 output**

The first draft got this wrong and the reviewer was right. `CLAUDE.md`'s rule is **trigger-based, not direction-based**: *"Any change touching a listed contract must emit that entry's `Mirror` text as Session 1 output, in a `## Cross-repo impact` section of the task file, quoting the `CR-NN` id."* This slice touches four CR-15 data-side triggers (`lib/projectionFactors.mjs`, `lib/panel.mjs`, `scripts/panel-run.mjs`, `test/panel-fit.test.mjs`) and two CR-07 ones (`loadAdvstats` in `scripts/panel-run.mjs`, `resolvePosition` in `lib/panel.mjs`). §4 emits both.

**On substance the answer is unchanged: nothing is owed back to the app.** CR-15's `Direction` is `app→data` and both app slices have already emitted to this repo; CR-07 is `both` but no served shape, sparsity gate or ratio name changes — this is a new read of an already-read family. CR-01 does not fire (no snapshot written or read; the rookie mode pins `half_ppr`, which takes the `scoringSettings: null` branch at `scripts/panel-run.mjs:95-97`). CR-18 does not fire (no ingest added, no field or coverage reclassified; artifacts are unregistered per F13). **`nflverse/playerids.json` is covered by no entry at all** — it is internal-only per `CLAUDE.md`'s navigation row, which is why heavy new reads of it raise no mirror duty.

**Two things the app will want later. Neither is planned here, neither blocks this slice.** Report both in the hand-back so Anton can route them as app slices:
1. The rookie ceiling that D-8 unblocks (`rookie-calibration.md` §1 Q2 defers it explicitly, naming the debut panel as its prerequisite).
2. `docs/projection.md` carries the up-to-18% overstatement as the rookie total-points residual. If Q2(d) survives the harness's own protocol, that figure is a loose bound and the real problem is that the QB cells have no measurable conditional PPG. That is an app docs correction this repo cannot make.

---

## 2. What changes

Three source files plus tests, docs and two artifacts. **No data file, no manifest, no served family, no CDN purge.**

### 2.1 `lib/projectionFactors.mjs`

**a.** Module-level `const EMPTY_CORRECTIONS = Object.freeze([]);`

**b.** `reconstructRookieProjection` returns `appliedCorrections: EMPTY_CORRECTIONS` alongside its existing fields. No other behaviour change — every existing caller and every assertion in `test/panel-fit.test.mjs:2264-2282` keeps passing (they are property assertions, not deep equality).

**c.** Extend the existing deviation comment (`:706-719`) with the Q4 decision in one short paragraph: this is the **uncorrected fit predictor**; CR-15's rookie mirror (`ROOKIE_CALIBRATION`, `DAY3_TIERS`, the five-rung ladder) lands in `reconstructShippedRookieProjection`, which does not exist yet; name this task file. The reasoning lives here, not in source.

### 2.2 `lib/panel.mjs`

**a. `rookiePathStateAt(pid, Y, { totalsByYear, ppgByYear, fromSeason })`** per §1 Q1(b). `assembleRookiePanel`'s inline predicate is replaced by a call to it, with identical semantics — this is an extraction, not a change, and §6 test 1 proves it.

**b. `computeSeasonPoints` widens to return `totalPts`** (F4): `{ ppg, gamesPlayed, totalPts }`, where `totalPts` is `rec.actualTotalPts ?? 0` and stays `0` when the record is missing. Additive; no existing caller reads the new field. **This is what keeps the panel basis-aware** — the total-points outcome flows from whichever outcome map was built, not from a hard-wired read of the season-totals row's `fantasyPoints`.

**c. `classifyRookieOutcome({ pid, outcomeYear, ppgByYear, totalsByYear, rosterByYear })` → `{ outcomeClass, outcomeGames, outcomeTotalPts, outcomePPG, dnpWeeks }`.** Pure. `outcomeGames` / `outcomeTotalPts` / `outcomePPG` come from `computeSeasonPoints(pid, ppgByYear[outcomeYear])` — the outcome map, so in-basis and `half_ppr` both reach it. Presence is `ppgByYear[outcomeYear].has(String(pid))`; `dnpWeeks` is the one field read from the raw `totalsByYear[outcomeYear]` row, because the outcome record does not carry it. Classification order:
1. present, `outcomeGames >= 6` → `'played6plus'`
2. present, `1 <= outcomeGames <= 5` → `'played1to5'`
3. present, `outcomeGames === 0` → `'rosteredZero'`
4. absent, no roster file for `outcomeYear` → `'absentNoRosterFile'`
5. absent, pid in that roster's `players` → `'absentOnRoster'`
6. absent, otherwise → `'absentOffRoster'`

`outcomePPG` is null for every zero-game state; `outcomeTotalPts` is `0` for every absent class; `dnpWeeks` is null when the row is absent. **The `6` in state 1 is a module constant, `OUTCOME_PLAYED_THRESHOLD = 6`, independent of the gate.**

**d. `assembleRookiePanel` is parameterised, its current call signature unchanged in behaviour.**

```js
assembleRookiePanel({
  totalsByYear, ppgByYear, positionOf, birthdateOf, draftInfoOf, fromYear, toYear,
  minOutcomeGames = 6,              // 6 or null ONLY — any other value throws
  enumerator = 'season-presence',   // | 'entry-cohort'
  entrantsBySleeper = null,         // required when enumerator === 'entry-cohort'
  debutOnly = false,                // entry-cohort only: keep rows where targetSeason === entryYear
  rosterByYear = null,              // enables the absent-row split; null → 'absentNoRosterFile'
  predictor = reconstructRookieProjection,
})
```

`minOutcomeGames` accepts **exactly two values**: `6` reproduces today's three-clause drop verbatim (F3), `null` disables the drop entirely — no null-PPG clause, no finiteness clause, no threshold. Anything else throws, because a third value would make `outcomeClass`'s fixed boundary and the gate disagree with nothing to say which is right.

Every row gains `outcomeClass`, `outcomeGames`, `outcomeTotalPts`, `dnpWeeks`, `draftGroup` (`r1`/`day2`/`day3`/`undrafted`/`unknown`) and, under `entry-cohort`, `entryYear`, `targetSeason`, `experienceYears` and `experienceBucket`. Existing fields keep their names and meanings.

**Called with no new options the function must produce the committed artifact's 1,056 rows unchanged** — same ids, same `predictorYear`, same `projectedPPG`, same `outcomePPG`, same order, same `coverage.assembled` / `coverage.surviving` / `coverage.drops` / `coverage.hitCapCount`. §6 test 1 enforces this against the artifact on disk.

**e. The Q4 guard**, per §1 Q4(b), immediately after the predictor call and before any row is pushed.

**f. `coverage` gains the D-9 and D-12 breakdowns:**
- `byOutcomeClass` — the six-state totals;
- `byCellOutcomeClass` — six-state counts keyed `<group>|<position>`;
- `byRungCell` — for each of the ladder's four group-keyed levels (`<group>|<position>|<bucket>`, `<group>|<bucket>`, `<group>|<position>`, `<group>`) and the unknown ladder's two (`U|<position>|<bucket>`, `U|<position>`): `n`, mean `outcomeGames` unrounded, and the same rounded to whole games. **This is D-12's actual deliverable** — without it §4 risk 1's "which rungs move" cannot be computed;
- `byExperience` — rows by `predictorYear − draftYear` bucket under `season-presence` (F12's contamination, made visible in the artifact rather than only in this file), and by `experienceBucket` under `entry-cohort`;
- `invalidEntryYear` — entrants excluded by the `draftYear > 0` filter (F10), counted, not silent. **Counted at panel positions only** (13, not the crosswalk-wide 45 — see §2.2g's filter order), because the number a verdict reader needs is "rows that would otherwise be in this cohort", and the other 32 are removed by the position filter regardless.

When `minOutcomeGames` is null, `drops` is `{}` and `surviving === assembled`; assert that relationship in code, do not leave it implicit.

**g. `enumerateEntryCohortRows({ entrantsBySleeper, totalsByYear, ppgByYear, fromEntryYear, toEntryYear, fromTarget, toTarget })` → `[{ sleeperId, entryYear, targetSeason, experienceYears, experienceBucket }]`.** Pure. Four explicit year bounds, no shared pair. `experienceBucket` is `'0'` / `'1'` / `'2+'` from `experienceYears = targetSeason − entryYear`, matching the app's ladder key.

Entrant filter, **in this order**: position in `PANEL_POSITIONS` first, then `draftYear != null && draftYear > 0` (increments `invalidEntryYear`), then `draftYear ∈ [fromEntryYear, toEntryYear]`. Position first is what makes the counter mean "entrants this cohort lost to the sentinel" (13) rather than "sentinel entries in the crosswalk" (45).

Walk `T` from `max(entryYear, fromTarget)` to `toTarget`:
- **stop** when `rookiePathStateAt(pid, T − 1, …).hasQualifying` — the player left the rookie path;
- **stop** when `T − entryYear >= 2` and `gamesOf(T−1) === 0 && gamesOf(T−2) === 0`;
- otherwise emit.

**`gamesOf(s)` is the season-totals row's `gamesPlayed`, or `0` when the player is absent from that season.** Stating this is load-bearing: F6 keeps absence and rostered-zero distinct as *outcome classes*, but both are zero games for the purpose of deciding where the walk ends, which is the only reading consistent with the app's own "absence counted as 0 games, the honest denominator". The double-zero rule **stops** the walk; it does not skip one row and continue. §4 risk 1 depends on which, and stopping is the reading that lands closest to the app's own count.

A player whose `draftYear` is later than a season he already appears in (`sleeperId 8799`, F10) simply gets a one-year cohort and his earlier appearance is invisible here. Note it in the verdict; do not guard it.

### 2.3 `scripts/panel-run.mjs`

**a. `runRookiePanels({ load })`** — a new top-level mode, years fixed in the mode (§2.4). It does **not** touch the veteran stack: no `assemblePanel`, no `attachFactorMultipliers`, no sensitivity check. D6b's stop is a veteran-path stop and is irrelevant here; say so in a comment so nobody re-gates this behind it.

Shared inputs, built once:
- `totalsByYear` over `HISTORY_FLOOR … 2025`;
- `ppgByYear` from `buildOutcomeMaps(years, { basis: 'half_ppr' }, load)`;
- **`advstatsByYear` and `rosterByYear`** over every predictor and target year in range — `positionOf` is `resolvePosition(pid, advstatsByYear[y], rosterByYear[y], crosswalk)`, identical to `scripts/panel-run.mjs:1373`. **Omitting advstats breaks the reproduction pin** (F7);
- `rosterByYear` again as the outcome-year roster for `classifyRookieOutcome` (same files, one load);
- `crosswalk` and `entrantsBySleeper` from `nflverse/playerids.json` as at `:1344-1354`.

**`positionOf` for the `entry-cohort` enumerator is the season-independent crosswalk only** — a debut row has no season in which to look up advstats, and a player must carry one position across his whole cohort or the same person gets two different `ROOKIE_BASELINE_PPG` values in two panels. The verdict states this asymmetry explicitly and reports how many `legacy` rows would change position under crosswalk-only resolution, so the gap is quantified rather than asserted.

Three assemblies:

| key | enumerator | gate | years | what it is |
|---|---|---|---|---|
| `legacy` | `season-presence` | 6 | predictor 2013–2024 | the reproduction pin, plus D-9's strata |
| `debut` | `entry-cohort`, `debutOnly` | none | entry 2013–2025, target 2013–2025 | D-8 |
| `rookiePathAll` | `entry-cohort` | none | entry 2013–2025, target 2013–2025 | D-12 and D-13 |

**b. `buildRookieVerdictMarkdown(result)`** in the R3-FIT verdict format. Goal line, config, reproduce command, then: **§A** reproduction pin, pass or fail against the committed artifact; **§B** D-9's stratum tables with their population label (F12) and the experience composition; **§C** the debut panel by group × position; **§D** the availability panel, the `byRungCell` rung table rounded as the app rounds, and the reconciliation against 3,848 with the per-bucket delta and any rung whose rounded value differs; **§E** the total-points residual per Q2(d), labelled with its population; **§F** stated limits — Q3(c), Q4(d), F5's basis scope, F10's sentinel rows, F12's contamination, the position-resolution asymmetry.

**c. `writeRookieArtifacts(...)`** → `backtests/<date>-rookie-panel.json` and `grading/<date>-rookie-verdict.md`. Rows are kept in the JSON, per the existing note at `scripts/panel-run.mjs:1646`.

### 2.4 `bin/panel.mjs`

`--rookie`, mutually exclusive with `--fit`, `--flip-gate` and `--fullpipeline`. It **rejects `--from`, `--to`, `--attribution`, `--basis` and `--min-games`**: the three assemblies carry three different year semantics (predictor years, entry years, target years), so one CLI pair cannot express them; the basis is pinned `half_ppr`; no attribution seam is used; and the gate is structural, not a knob. Honours `--json` and `--write`. Add it to the usage block with a one-line note on why the year flags are rejected. **No new `package.json` script** — `--fullpipeline` added none either, and F14 leaves no room to document a fourth shortcut in `CLAUDE.md`.

---

## 3. Deliberately not in this slice

1. **CR-15's rookie mirror is not discharged.** `reconstructRookieProjection` reproduces neither the realisation calibration nor the games ladder, exactly as today, and `reconstructShippedRookieProjection` is a reserved name with no body. Discharging it here would put the corrected constants one import from the fit path before the Q4 guard has ever run against real data. It becomes safe once this slice lands, and it is a small follow-up slice.
2. **Any fitted constant.** No re-fit of the calibration, no re-fit of the ladder, no ceiling, no cap, no shrinkage.
3. **College reconstruction.** `collegeContribution` stays 1.0.
4. **Any change to the veteran panel, `assemblePanelRows`' rookie-path exclusion, the sensitivity check, Step 4, or `predictFullPipeline`.**
5. **Any change to the `draftYear: 0` sentinel's effect on `ageAtDraft`** (F10). It is shipped behaviour and the reproduction pin depends on it. Count and report; do not fix.
6. **`grading/anchor-policy.md`.** Both app slices' CR-01 text suggests recording the two model-change dates there so forward grading segments rookie rows correctly. The file does not exist and nothing references it. It is a real obligation and a *snapshot-grading* concern — these panels read season-totals and no snapshot, so it bites nothing here. Out of scope; flag it in the hand-back.
7. **`gamesStarted` as a second outcome.**

---

## 4. Cross-repo impact

Two entries fire on their data-side `Triggers`. Each `Mirror` text is quoted verbatim, per the rule that the mirror instruction itself is the deliverable, followed by what this change requires under it. **`README.md`'s mirrored `<!-- CR-REGISTRY-BEGIN -->` region is not edited** — no new coupling, so the drift check stays empty.

### CR-15 · R3-FIT factor-multiplier mirror

> Re-mirror the changed constant/gate/branch and **re-fit before any further exponent activation** — otherwise the fit reconstructs a factor the app no longer produces and the committed verdict in `.claude/tasks/r3fit-exponent-harness.md` stops transporting. Which positions a factor is gated to is itself part of the mirror. Note the known parity gap: `shareTrend` and `teamRzShare` have no end-to-end app-ground-truth check until a post-2026-07-18 snapshot is imported. **Nothing app-side fails when this drifts.** **Scope note reversed (D6a, 2026-09-06):** `dynastyScore.js` was previously named in `lib/projectionFactors.mjs:110` only as a *contrast* and marked deliberately not a trigger; D6a's age port (Step 2) draws `computeEmpiricalAgeCurves` straight out of it, so `dynastyScore.js` is now mirrored and is a trigger like the other ten app-side modules. The old contrast is still accurate as far as it goes — `weightedLinearRegression`'s copy in that file remains unfloored where the mirrored one floors the denominator at 4 — it just no longer means the whole file is out of scope.

**Under it, for this change.** `Direction` is `app→data`, and all four data-side triggers are touched. **Nothing is owed back to the app** — the app has already emitted its side twice (`rookie-calibration.md` §6 and `rookie-availability.md` §6) and this slice is the receiving end. What this slice does under the entry is narrower than what the entry asks, and the deviation is deliberate: it **does not re-mirror** the realisation calibration or the games ladder into `lib/projectionFactors.mjs` (§3 item 1), so the known parity gap widens from the two factors the entry already names to the rookie path as a whole. That gap is disclosed here and in the verdict rather than closed.

No exponent activation follows from this slice, so the entry's re-fit clause is not triggered: **no fit of any kind runs here** (§3 item 2).

**On the entry's `Invariant` and the two-function split.** The `Invariant` demands that `lib/projectionFactors.mjs` reproduce the app's behaviour exactly, and the `Data side` names the file wholesale, so the registry cannot express "this one exported function must never mirror". It does not need to: the invariant is a property of the **file**, and it is satisfied once `reconstructShippedRookieProjection` exists and carries the mirror. `reconstructRookieProjection` is then the uncorrected factor the shipped one composes — the same relationship `predictFullPipeline` already has to its held-at-one arms. **No registry amendment is required, and this slice drafts none.** If Anton reads the `Invariant` the other way — that every exported reconstruction must individually match the app — the fix is one Claude.ai draft entry and the follow-up mirror slice waits for it; nothing in *this* slice changes either way, because it adds no corrected reconstruction at all.

### CR-07 · nflverse advstats (view-only)

> Served-shape or sparsity-gate changes need the app loader updated in the same cycle. **Now breaks a visible surface, not just a silent loader** — Market's `RACR` column would go blank for every WR/TE with no error. Ratios are recomputed season-level and never aggregated weekly. Activation into projection is parked — see the advstats grading-findings doc.

**Under it, for this change.** `Direction` is `both`. Two data-side triggers are touched — `loadAdvstats` in `scripts/panel-run.mjs` (a new call site inside `runRookiePanels`) and `resolvePosition` in `lib/panel.mjs` (called through the extracted predicate, unchanged in behaviour). **Nothing is owed to the app.** No served shape changes, no `MIN_ADVSTATS_ROWS` change, no ratio name changes, no new field read — this is one additional offline reader of a family this repo already reads for exactly this purpose, and the family stays out of projection and scoring on both sides as the `Invariant` requires. The only new dependency is on `players[pid].position`, which `resolvePosition` already consumes.

### Entries checked and not fired

- **CR-01 · Projection snapshot envelope** — no snapshot is written or read. The rookie mode pins `half_ppr`, which takes the `scoringSettings: null` branch at `scripts/panel-run.mjs:95-97` and never reaches `resolveScoring`'s snapshot load.
- **CR-18 · Signal registry rows** — no ingested field, stat key, source, coverage or reconstructable-vs-ephemeral status changes. Artifacts are unregistered analysis output (F13).
- **CR-02, CR-16** — read-only consumers; no shape, key or join semantics change.
- **`nflverse/playerids.json` is covered by no entry.** It is internal-only per `CLAUDE.md`'s navigation row, which is why this slice's heavy new reads of `bySleeper` raise no mirror duty. Stated because the first draft wrongly filed it under CR-06.

### Registry work this slice cannot do

**CR-06's data-side `Triggers` are stale and are not fixed here.** They list only writers and validators (`scripts/update-roster.mjs`, `scripts/update-draft.mjs`, `MIN_ROSTER_IDS`, `validateRoster`/`validateDraft`) and name no consumer of the served roster shape `players[<sleeperId>].position`, although live ones exist — `loadRoster` at `scripts/panel-run.mjs:77`, `:164`, `:1371` and `resolvePosition` at `lib/panel.mjs:141` — and this slice adds another, plus a first consumer of `players` as a **membership set** (§2.2c's `absentOnRoster` test). CR-07 lists its analogous consumers, so the omission is near-side cache drift rather than policy. The entries live inside the `<!-- CR-REGISTRY-BEGIN -->` sentinels and are byte-identical across both repos, so a one-sided addition is precisely what the drift check reports. **Route to the next paired session**, alongside the app's existing D-11 item; do not edit the registry from this slice.

---

## 5. Risks

1. **The availability population does not reconcile exactly, and D-12's whole point is provenance.** Re-deriving the app's predicate from this repo's stores under §2.2g's rules gives **3,941** rows (r1 153, day2 361, day3 1,137, undrafted 2,290) against the app's **3,848** (r1 152, day2 360, day3 1,119, undrafted 2,217). Debut and second-year buckets match to the row — r1 127/17, day2 276/44, day3 632/274, undrafted 1,036/785 on both sides — and **the entire 93-row delta sits in the `2+` bucket** (mine 9/41/231/469 against the app's 8/40/213/396; those four sum to the group totals above, which is the arithmetic check on this row — an earlier draft printed 9/46/278/469, which are the figures for the rejected skip-and-continue reading of the double-zero rule and do not sum, corrected in fix pass 1). The predicate as written in the app's task file therefore does not uniquely determine the population past experience 2. **Resolution: the panel publishes its own predicate as the definition and reports the delta in verdict §D, with the per-bucket difference and the `byRungCell` rung table.** Do not tune the predicate to hit 3,848 — a predicate reverse-engineered to match a number is worth less than a stated one that differs by 2.4%.

**What "which rungs move" can and cannot mean here — a defect in this plan, corrected in fix pass 1.** The consequential quantity is whether a shipped rung's **rounded** value moves, and §2.2f's `byRungCell` computes this panel's own rung values. But the app's rung 1, 2, 3 and U cell values are **not in this repo** — §0 restates the ladder's shape, floors and rung-4 pooled values only, not its 74 cells — so a moved-or-not comparison is computable for **rung 4 alone**. Verdict §D checks rung 4 against the four quoted values and must **state explicitly that rungs 1–3 and U are not checkable in this repo and why**, so silence is not read as "no rung moved". Restating the app's cell tables here is a prerequisite for the later fitting slice, not work for this one.
2. **Roster coverage starts 2016** (F11), so `absentOnRoster` vs `absentOffRoster` is unavailable for outcome years 2014–2015 — 78 of the legacy panel's 674 absences. `'absentNoRosterFile'` is a real third state; never fold it into `absentOffRoster`.
3. **Position resolution differs between the two enumerators** by construction (§2.3a): season-keyed advstats-first for `season-presence`, crosswalk-only for `entry-cohort`. The verdict must report how many `legacy` rows would change position under crosswalk-only resolution, so a later slice comparing the two panels knows the size of the seam rather than assuming it is zero.
4. **The entry-cohort population is floored at "nflverse assigned a sleeper id"** (Q3(c)). Above the outcome rather than correlated with it, but a later slice must not read these rows as "every entrant".
5. **Zero rows dominate some cells.** `undrafted|QB` is 164 rows of which 14 played six games; at debut it is 44 of which 2 did. Every statistic this harness reports on such a cell carries its n, and the verdict must not print a cell mean without one.
6. **`CLAUDE.md` has 616 bytes of headroom** (F14). The two rows this slice touches are edited tightly or pruned in the same commit.

---

## 6. Tests to add

All in `test/panel-fit.test.mjs` unless noted, extending the existing `D6b — assembleRookiePanel` block at `:2284`.

1. **Reproduction pin — the gate on this whole slice.** Load `backtests/2026-09-06-fullpipeline-panel.json`, rebuild the inputs the way `runRookiePanels` does **including advstats** (F7), run `assembleRookiePanel` with default options, and assert the row arrays are deeply equal on `sleeperId`, `predictorYear`, `projectedPPG`, `outcomePPG` and `nflDraftTier`, in order, plus `coverage.assembled === 2563`, `coverage.surviving === 1056`, `coverage.drops.noOutcome === 1507`, `coverage.hitCapCount === 0`. Comparing against the artifact on disk is the point — a hand-copied count would pass a refactor that changed which rows survive.
2. **The guard fires on a declared correction.** Inject `predictor: () => ({ projectedPPG: 5, hitCap: false, nflDraftTier: 'r4', appliedCorrections: ['rookieCalibration'] })`; assert a throw matching `/CR-15/`.
3. **The guard fires on a missing declaration.** Inject the same stub with `appliedCorrections` omitted entirely; assert a throw matching `/did not declare/`. This is the arm that catches a future shipped predictor that composes corrections and forgets to say so.
4. **The uncorrected predictor declares nothing.** `reconstructRookieProjection({...}).appliedCorrections` has length 0 and `Object.isFrozen` is true.
5. **Outcome classification, all six states**, on synthetic outcome maps and rosters: `gamesPlayed` 8 / 3 / 0 / absent-with-roster-hit / absent-with-roster-miss / absent-with-no-roster-file. Assert `outcomeTotalPts === 0` and `outcomePPG === null` for every zero-game state, and that `dnpWeeks` survives on `rosteredZero` and is null when absent.
6. **The classification boundary is independent of the gate.** With `minOutcomeGames: null`, a 7-game row still classifies `'played6plus'` and a 3-game row still classifies `'played1to5'`; and `minOutcomeGames: 8` throws.
7. **Entry-cohort walk, four cases.** (a) an entrant with a `gamesPlayed >= 8` season at `entryYear + 1` emits rows for `entryYear` and `entryYear + 1` and stops; (b) an entrant with zero games in two consecutive seasons stops at the second and emits nothing after; (c) an entrant **absent** from two consecutive seasons stops identically — the rule reads games with absence as zero (§2.2g), and this is the case that decides §5 risk 1; (d) `debutOnly` emits exactly one row per entrant, with `targetSeason === entryYear`.
8. **Debut rows grade the target season, not the one after.** Under `entry-cohort`, a synthetic entrant scoring in `entryYear` and nothing after has a nonzero `outcomeTotalPts` on his debut row. This catches someone copying the `Y + 1` offset across.
9. **No leakage.** Spy on the injected predictor and assert it is called with exactly `{ position, ageAtDraft, draftRound, draftPick }` and no season-derived value, under both enumerators. The machine form of F1.
10. **The predicate has one meaning.** On a shared synthetic population, `rookiePathStateAt(pid, Y, …).isRookiePath` agrees row-for-row with `assemblePanelRows`' `rookiePathNoQualifying` / `rookiePathYearsExpProxy` exclusion — the drift check §1 Q1(b) promises, without refactoring the veteran path.
11. **Ungated coverage is self-consistent.** With `minOutcomeGames: null`: `coverage.surviving === coverage.assembled`, `coverage.drops` empty, `byOutcomeClass` counts sum to `assembled`, and every `byCellOutcomeClass` cell sums to its own n.
12. **`invalidEntryYear` is counted, not silent.** An entrant with `draftYear: 0` is excluded from the cohort and increments the counter (F10).
13. **Basis-free zeros** (`test/panel.test.mjs`): a `gamesPlayed: 0` row yields `outcomeTotalPts === 0` and `outcomePPG === null` whether the outcome map came from `buildHalfPprOutcomes` or the in-basis builder — reachable because §2.2c reads the map, not the raw row.
14. **`computeSeasonPoints`' widening is additive**: `totalPts` is `0` for a missing record and equals `actualTotalPts` otherwise, and `ppg`/`gamesPlayed` are unchanged for every existing case.

`test/panel-integration.test.mjs` gains the existing-shape check for the two new artifacts, mirroring the `-e0a-panel` / `-r3fit-panel` blocks at `:218`, `:604` — present-if-written, required top-level keys, no assertion on values.

---

## 7. Docs updates

- **`CLAUDE.md`** — `scripts/panel-run.mjs` row gains `runRookiePanels`; `lib/panel.mjs` row gains one clause naming the two enumerators, `rookiePathStateAt` and the uncorrected-predictor guard. Re-check the 25,000-byte ceiling in the same commit and prune there if it breaches (F14).
- **`README.md` → Analysis / Backtesting** — a rookie-harness section shaped like the R3-FIT and D6b sections: what it grades, the three assemblies, the two artifact names, the unregistered convention, the `--rookie` flag and its rejected flags, and the Q4 decision in two sentences.
- **No `data-catalog.md` change** — no family added, altered or reclassified (F13, §4).
- **No registry edit.** The mirrored region is untouched and `node scripts/registry-audit.mjs`'s drift check must return empty.

---

## 8. Done-definition

The standard `CLAUDE.md` list, and specifically:
1. `npm run smoke` green.
2. `npm test` green, including the reproduction pin (§6 test 1). **That test failing means the slice invalidated two shipped app slices' evidence base and must stop, not be updated to match.**
3. No `manifest.json` change (F13). Confirm, do not assume.
4. `node bin/panel.mjs --rookie --write` run for real, both artifacts committed, verdict §A reading pass.
5. `node scripts/registry-audit.mjs` drift check empty.
6. `CLAUDE.md` under 25,000 bytes.
7. Plan review done (this file, §10) before implementation starts.

## 9. Hand-back should report

The commit SHA or diff range, **verified present on `origin/`** — a hand-back SHA is not evidence of publication; the coverage numbers from all three assemblies; whether the reproduction pin passed; the observed availability row count against 3,941 and against the app's 3,848 with the per-bucket `2+` delta; which shipped rungs, if any, change rounded value; the count of `legacy` rows whose position would change under crosswalk-only resolution; the total-points residual table actually produced against §1 Q2(d); and any deviation from the row shapes in §2.2, which should be none.

Also carry forward, for Anton to route as separate work: the rookie ceiling D-8 unblocks; the app's `docs/projection.md` 18% figure if Q2(d) holds; CR-06's stale trigger list (§4); and `grading/anchor-policy.md` (§3 item 6).

---

## 10. Review pass — plan-reviewer flags and dispositions

Run 2026-09-11 on the first draft. Fourteen flags; **three were fatal**. Every flag is dispositioned; nothing is declined silently.

| # | Flag | Disposition |
|---|---|---|
| 1 | `minOutcomeGames: null` does not ungate — the null-PPG clause still drops every zero row | **Fatal, fixed.** F3 states the three-clause OR verbatim; §2.2d restricts the parameter to `6`-or-`null` and specifies that `null` removes the whole condition, not the threshold. Test 6 pins it. |
| 2 | advstats omitted from the new runner's shared inputs, so the reproduction pin cannot pass | **Fatal, fixed.** New F7; §2.3a loads advstats and names the consequence; test 1 rebuilds inputs the same way. The reviewer's CR-07 note is carried into §4. |
| 3 | §Q5's "no contract touched" is false — the mirror rule is trigger-based | **Fatal, fixed.** Q5 rewritten and the error named; §4 added, emitting CR-15 and CR-07 verbatim. Substance unchanged: nothing owed back. |
| 4 | `classifyRookieOutcome` bypasses the outcome map, so test 9 cannot test what it claims | **Fixed.** §2.2b widens `computeSeasonPoints` per F4 and §2.2c reads the map; only `dnpWeeks` comes from the raw row. Test 13 is now reachable. |
| 5 | The guard passes silently when `appliedCorrections` is absent | **Fixed.** §1 Q4(b) throws on a non-array; test 3 covers that arm. |
| 6 | The walk rules are undefined on absent seasons, and the 93-row delta sits there | **Fixed.** §2.2g defines `gamesOf` as games-with-absence-as-zero and says why; test 7(c) pins it. |
| 7 | `enumerateEntryCohortRows` has no entry-year window; one CLI year pair for three semantics; `experience` vs `experienceBucket` | **Fixed.** §2.2g takes four explicit bounds and returns both `experienceYears` and `experienceBucket`; §2.4 rejects `--from`/`--to` outright. |
| 8 | `outcomeClass` hard-wires 6 while the gate is a parameter | **Fixed.** §2.2c pins `OUTCOME_PLAYED_THRESHOLD = 6` as independent of the gate; §2.2d admits only two gate values; test 6 asserts the independence. |
| 9 | Q1(c)/Q2(d) are measured on a population that is not a rookie population | **Fixed, and the finding was material.** New F12 with the measured experience distribution; every affected table now carries a mandatory population label; §2.2f adds `byExperience` so the artifact shows it too; verdict §B/§E must label. |
| 10 | `bySleeper.draftYear` has a zero sentinel that reaches the most favourable age bucket, silently dropped by the new filter | **Fixed.** New F10 with counts; §2.2g filters explicitly and counts `invalidEntryYear`; §3 item 5 forbids changing the shipped sentinel path; test 12 pins the counter. |
| 11 | Q2(d)'s table is not re-derivable and does not partition the cells | **Fixed.** Full-precision columns including `E[PPG\|≥6]` and `n≥6`, all sixteen cells, and the debut-restricted check that shows the QB cells are thin rather than correctable. |
| 12 | §4 risk 1's mitigation has no computation anywhere | **Fixed.** §2.2f adds `byRungCell` across all six keyed levels; §2.3b's verdict §D must name which rungs move; §9 asks for it. |
| 13 | Q1(a) argues predicate drift, then adds a third spelling | **Fixed.** §1 Q1(b) extracts `rookiePathStateAt` as the single definition used by both enumerators; test 10 asserts it agrees with `assemblePanelRows`' exclusion. `assemblePanelRows` itself is **not** refactored — §3 item 4 — because that is the veteran path. |
| 14 | CR-06's data-side triggers are stale; playerids is covered by no entry | **Acknowledged, routed, not fixed.** §4 "Registry work this slice cannot do" records the staleness and the extra consumer this slice adds; the entries are inside the mirrored sentinels, so it is a both-repos same-change edit. Q5 corrects the playerids misfiling. |

**Verified clean by the reviewer and not flagged:** `npm test` green at 867 tests; F5 reproduces exactly; Q3(b)'s entry cohort reproduces exactly at 2,071 = 127/276/632/1,036; every stratum table sums to 2,563 and its group totals match Q2(d)'s 126/335/862/1,240; F13 holds; F14 holds; adding `appliedCorrections` breaks no existing assertion.

---

## Fix pass 1

Implementation review of `5d340d3..4534898`, run 2026-09-11. Eight flags, all confirmed against the diff by Session 1. Six are fixed below; two are accepted with a recorded statement. **Implement exactly this section and nothing else.** The eight items are independent — none changes a signature, a row shape, or any number in a committed artifact except `meta` and the verdict prose named here.

Two corrections to the task file itself were made by Session 1, not by this pass, and are already in the file above: §5 risk 1's per-bucket `2+` figures (the implementation's 9/41/231/469 are right and the plan's 9/46/278/469 were a paste of the rejected skip-and-continue reading), and §5 risk 1's new paragraph bounding what "which rungs move" can mean. Do not re-edit those.

### 1 · `meta.basisScope` is missing from the artifact — must fix

§1 Q2(c) specifies it exactly and the committed artifact carries a bare `meta.basis: 'half_ppr'`, which is the state that section forbids. In `runRookiePanels`' `meta` object (`scripts/panel-run.mjs`), add:

```js
basisScope: {
  basis: 'half_ppr',
  appliesTo: 'rows with outcomeGames > 0',
  basisFreeZeroRows: <count>,
  note: 'A zero outcome is read from no stats object and is identical under any scoring basis.',
},
```

`basisFreeZeroRows` is computed, not hard-coded: the sum of `rosteredZero`, `absentOnRoster`, `absentOffRoster` and `absentNoRosterFile` in the **ungated legacy** assembly's `byOutcomeClass` (1,040 on current data). Leave `meta.basis` in place beside it; it is referenced by `test/panel-integration.test.mjs`. Add one assertion to that integration test that `meta.basisScope.appliesTo` is present and `meta.basisScope.basisFreeZeroRows` is a positive integer — shape only, no value, per §6's convention for that file.

### 2 · §6 test 11's cell-sum arm asserts nothing — must fix

`assert.ok(cellTotal > 0)` passes under any miscount. §6 test 11 specifies "every `byCellOutcomeClass` cell sums to its own n". Replace that assertion with a real one: build the expected per-cell row count from the returned `rows` (group by `` `${draftGroup}|${position}` ``) and assert each `byCellOutcomeClass` cell's six-state sum equals that cell's row count, and that the set of cell keys is identical on both sides. Keep the existing `surviving === assembled`, `drops` empty and `byOutcomeClass` sum assertions unchanged.

### 3 · §6 test 10 compares aggregate counts, not rows — must fix

`assert.equal(myRookiePathCount, attachedRookiePathCount)` passes on offsetting per-row disagreements, which is exactly the drift this test exists to catch. §6 test 10 specifies row-for-row agreement. Change it to collect two **sets of pids** — those `rookiePathStateAt` marks `isRookiePath` at Y, and those `assemblePanelRows` excludes via `rookiePathNoQualifying` or `rookiePathYearsExpProxy` at the same Y — and assert the sets are equal, reporting the symmetric difference in the assertion message. Keep the existing non-empty sanity assertion. Do not modify `assemblePanelRows`.

### 4 · `coverage.byRungCell` has no assertion — must fix

§2.2f calls it D-12's actual deliverable and nothing tests it. Add one new test after §6 test 12, named `§6 test 15 — byRungCell and byExperience`, on a **synthetic** population small enough to compute by hand:

- Assert all six keyed levels are present for a drafted entrant: `<group>|<position>|<bucket>`, `<group>|<bucket>`, `<group>|<position>`, `<group>`.
- Assert `n` and `meanOutcomeGames` on at least two cells against hand-computed values, and that `meanOutcomeGamesRounded` is the whole-game rounding of `meanOutcomeGames` for those cells.
- Assert the `U|<position>|<bucket>` and `U|<position>` levels populate for an entrant whose `draftGroup` resolves `unknown`. That branch is dead on live data (zero `unknown` rows) and is reachable only synthetically, which is the reason to test it at all.
- Assert `byExperience` buckets a `season-presence` assembly into `0` / `1` / `2` / `3plus` / `noDraftYear` / `negative` correctly, with at least one row in the `negative` and `noDraftYear` buckets, and that the buckets sum to `assembled`.

### 5 · §6 test 7(d) never exercises `debutOnly` — must fix

It filters the enumerator's output by hand, so the real option is touched only by test 8 with a single entrant and "one row per entrant" is asserted nowhere. Rewrite 7(d) to call `assembleRookiePanel` with `enumerator: 'entry-cohort'`, `debutOnly: true` and **at least three entrants with different entry years and different multi-season histories**, then assert: exactly one row per entrant, every row's `targetSeason === entryYear`, every row's `experienceBucket === '0'`, and the row count equals the entrant count. Keep 7(a), (b) and (c) as they are.

### 6 · `invalidEntryYear` counts 45 where the verdict reads as 13 — must fix

`enumerateEntryCohortRows` increments the counter before the `PANEL_POSITIONS` filter, so it reports every `draftYear <= 0` entry in the crosswalk, while the verdict prints it as rows excluded from a cohort — overstating the sentinel's effect on the panel by roughly 3.5×. Reorder the entrant filter to position-first, per §2.2g as amended:

```js
const position = entrant?.position ?? null;
if (!PANEL_POSITIONS.includes(position)) continue;
const draftYear = entrant?.draftYear ?? null;
if (draftYear == null || draftYear <= 0) { invalidEntryYear++; continue; }
if (draftYear < fromEntryYear || draftYear > toEntryYear) continue;
```

Update the function's header comment, which currently says the count is taken "independently of the year-range/position filter" — it is now position-dependent and year-range-independent, and the comment should say why (the number a verdict reader needs is rows this cohort lost, not crosswalk health). §6 test 12 must still pass; extend it to assert that a `draftYear: 0` entrant at a **non-panel** position does **not** increment the counter. Expect the verdict's two `invalidEntryYear excluded:` lines to read 13 after the re-run.

### 7 · The late-`draftYear` case is not noted in the verdict — must fix

§2.2g says "Note it in the verdict; do not guard it" and verdict §F has no mention. Add one line to §F: a player whose `bySleeper.draftYear` is later than a season he already appears in (`sleeperId 8799`, `draftYear 2025`, present in the 2024 predictor panel) gets a one-year cohort, and his earlier appearance is invisible to the entry-cohort panels while the legacy panel graded it. Not guarded, by design.

### 8 · Verdict §D's rung check is silent about what it did not check — must fix

Only rung 4 is compared, and §5 risk 1 requires §D to name the rungs that move **or state that none do**. Silence reads as the latter. Add two sentences to §D, after the rung-4 table: the comparison is computable for rung 4 only, because the app's rung 1, 2, 3 and U cell values are not in this repo — §0 restates the ladder's shape, floors and rung-4 pooled values, not its 74 cells — and this panel's own values for every rung are in `coverage.byRungCell` in the JSON artifact, awaiting a slice that restates the app's tables. Do **not** attempt the comparison.

### Accepted, with no change

- **`DEFAULT_LOAD.loadRookiePinArtifact`** is an addition beyond §2.3's literal text. It is the right shape — a fixed path to the pre-existing pin artifact, routed through the same injectable-loader seam as every other load, failing closed to `pass: false` when the artifact is missing — and it does not weaken §6 test 1, which rebuilds its inputs from live stores on one side. Kept; recorded here as the slice's one deviation.
- **The 13-vs-12 sentinel note in the hand-back.** 13 is the crosswalk count at panel positions; 12 is the subset landing in the legacy 2013–2024 assembled population. Both are correct at their own denominator and the verdict already distinguishes them. No change.

### Done-definition for this fix pass

`npm test` green — every assertion changed here must be *stronger* than what it replaced, so a green run that required loosening one is a failure, not a pass. Re-run `node bin/panel.mjs --rookie --write` and commit both regenerated artifacts: expect `meta.basisScope` present, both `invalidEntryYear excluded:` lines reading 13, §D carrying the two new sentences and §F the late-`draftYear` line. `CLAUDE.md` under 25,000 bytes (unchanged by this pass). `node scripts/registry-audit.mjs` drift empty. Report the diff range, which assertions changed and what each now asserts, and the two `invalidEntryYear` figures observed.
