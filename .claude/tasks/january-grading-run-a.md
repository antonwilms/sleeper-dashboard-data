# P3 Slice A — January grading run: D-44 grader basis fix, veteran calibration (replay + G-MECH), orchestrator

**Review depth: full** — it feeds a scoring decision (veteran calibration); it changes the snapshot grader's basis routing (D-44, CR-01's grader); it adds an app-composition mirror (CR-15 coupling); it is new architecture.

**Session 1:** opus, data repo, read against data `12c769b` / app `f7ebfa8`. **Session 2: sonnet**, effort high.

**Revisions (all 2026-10-24, Anton).**
- **Rev 1:** the replay targets aggregate fidelity; R and K are always reported; the run date is 2027-01-15; app-side edits go to §16.
- **Rev 2:** the mechanics gate G-MECH decides R vs K; drift Q is reported only; M10 is bounded.
- **Split:** A/B, with the skipped-M10 caveat.
- §14.2's no-loosening rule binds every gate value.
- The flag history is in `january-grading-run-reviews.md`.

Pre-registration means the rules are frozen in this file, committed before any outcome exists (§13); the pasted brief was truncated at that sentence.

**Split (Anton, 2026-10-24).** P3 is two slices. **This file is Slice A**: the D-44 grader basis fix, veteran calibration (replay R, G-MECH, Q), and the orchestrator (`bin/season-grade.mjs`) with its step registry. **Slice B** (`.claude/tasks/january-grading-run-b.md`) holds the D-52 ROS and games grades, D-16, D-75 and the D-60 recount, plugged into this orchestrator. B starts after A is signed off. §§ numbers are kept from the pre-split plan, so §17's flag map and both review rounds still resolve.

**Goal (P3 overall).** In January one command produces every grade the backlog has parked until the 2026 regular season ends: D-44, D-52, D-16, D-75, D-60. It lists D-79/80/85 but does not build them. Headline output: **veteran calibration**, realised ÷ projected, per position, with CIs. It reports numbers only: no constant, no wiring recommendation.

---

## 1. Facts established in planning

1. **Season end.** Week 18 ends Sun **2027-01-10**, not 2027-01-03.
   - `nfl/season-totals/2026.json` (2026-10-23) has weeks 1–6 played and 95 non-`TEAM_*` `'P'` slots in week 7.
   - `nflverse/schedule/2026.json` has 1 of 14 week-7 games scored. Week 7 began Thu 2026-10-22, so week 1's Thursday is 2026-09-10 (the opener itself was Wed 2026-09-09, §5.1).
2. **Captures.** `snapshots/` holds 100 files, 2026-05-19 → 2026-10-23.
   - v1 (`05-19`, `06-06`, `06-07`) has no `targetSeason` or `scoringSettings`; every other capture has `targetSeason` 2026, and `currentSeason` is 2025 throughout.
   - `projectionBasis: 'league'` from `2026-09-25`.
   - `projectionModelFrom`: `2026-10-11` (capture `10-12`), `2026-10-14` (`10-13`…`10-22`), `2026-10-23` (`10-23`).
   - `inSeason` blocks from `2026-09-27`; `inSeason.frozen` is false on every row of every capture (`notFrozenReason: 'model-changed'`).
   - `inputStatus` exists from `2026-09-07` on, and **no capture has a non-`'data-store'` provenance**.
3. **App veteran composition** (`src/utils/seasonProjection.js` `computeNextSeasonProjection`, app `f7ebfa8` :1013-1054):
   - `combinedNewFactorRaw = qbQuality·momentum·breakout·bounceBack·tdReliance·trajectory·efficiency·snapShare·rzUsage·teamRzShare`
   - `combinedNewFactor = clamp(raw, 0.67, 1.50)`
   - `pipelinePPG = clamp(basePPG·ageDelta·shareTrend·regressionFactor·teamFactor·depthFactor·combinedNewFactor, 0, 40)`
   - `blended = (1−w)·pipelinePPG + w·compPPG` (`w = compBlendWeight`)
   - `projectedPPG = blended`, or `blended·qbStartShare` on a QB `chain` row (`qbStarterPPG = blended`)
   - Non-chain `projectedTotalPts = round1(projectedPPG·projectedGames)`; chain: `round1(qbStarterPPG·qbStartShare·games)`.
4. **Inputs that drift with live state** (the plan-reviewer, confirmed in source):
   - `player.team` → `teamFactor` (:964). The rank comes from `computeTeamContext(…, {attribution:'current-team'})` (`src/App.jsx:239-247`), so it drifts as **any** roster moves.
   - `player.team` → `qbQualityByTeam` (:986).
   - The depth map → `depthOrder`/`depthStale` (:973-980).
   - The live `depth_chart_order` and team → `buildPreseasonQbShares` (`src/utils/qbTakeover.js:129`).
   - `player.age` → `ageDelta` (:725-738) and the breakout gate (`age ≤ 24`, `projectionSignals.js:31-35`).
   - Live `playersMap` → empirical age curves (`computeEmpiricalAgeCurves`, `App.jsx:222-230`; its sample ages use `new Date().getFullYear()`, `dynastyScore.js:86`, so every curve shifts a year on 2027-dated captures) and comps (`findCareerComps`, `careerComps.js:75`).
   - **Not live (correction, round-2 flag 4).** The projection's `historicalTeamTotals`/`historicalShares` are the per-season-team memos (`App.jsx:280-288`). The current-team pair at `App.jsx:293-301` feeds dynasty only. `shareTrend`, `teamRzShareFactor`, `snapShareFactor`, `rzUsageFactor` and `efficiencyFactor` are identical on all 407 common veterans between K and `10-23`, and none is points-based (4a rewrites `fantasyPoints` only, `sleeperStats.js:320-371`).
   - `isTeamChange` is null everywhere (`priorSnapshotTeams.loaded: false`).
   - KTC reaches a veteran projection only through `qbQualityByTeam`. `projectedGames` reads `careerStats` only.
5. **Measured.**
   - On `2026-10-23`, recomposing §1.3 reproduces `projectedPPG` within 0.10 on 421 of 422 non-chain veterans (max 0.102).
   - The `depthFactor` branch matches 434 of 434.
   - `teamFactor` and `qbQualityScore` are constant within team **across veteran rows**. Rookie-path rows carry a neutral `teamFactor` 1.0, so every per-team table is built from veteran rows only.
   - K vs `10-23`: 17 absent, 12 team changes, 156 order changes. K's and S's `teamFactor` tables differ on 27 of 32 teams (max 0.035).
6. **The data-side mirror cannot carry the replay.**
   - Its sensitivity check failed (`grading/2026-09-06-fullpipeline-verdict.md`: holding teamOffense/age/depth at 1 moves the median ratio by 0.052 QB, 0.028 RB, 0.029 TE).
   - It carries stated deviations (age, teamOffense rank, qbQuality, compBlend, envelope).
   - It omits breakout/bounceBack/tdReliance.
   - No end-to-end parity test exists. A mirror replay would grade the mirror.
7. **Measured split.** G-MECH passes on all ten same-segment pairs today (§5.4). Drift with comps and the age curve left live reaches about 0.006, so drift is reported and never decides.

## 2. Trigger and completeness gate

- **Trigger:** Fri **2027-01-15**, at or after 14:00 UTC. By then the schedule (Fri 13:35), season-totals (Fri 06:13) and playerstats (Tue 2027-01-12) runs all carry week 18 and Thursday stat corrections. Accepted by Anton.
- **G-SEASON** is a hard stop with no writes:
  - (a) `nflverse/schedule/2026.json` has 272 `REG` games, all scored.
  - (b) In season-totals 2026, the week-18 `'P'` count is ≥ 0.85 × the median of weeks 1–17.
  - (c) Every non-`TEAM_*` row with `gamesPlayed > 0` has `weeklyStats`.
  - (d) The manifest `lastModified` of season-totals 2026 ≥ that of schedule 2026 − 24 h.
- `--rehearse` bypasses G-SEASON, writes nothing, and stamps every section `REHEARSAL — partial season (weeks 1–N)`.

## 3. Touch list

| File | Change |
|---|---|
| `scripts/grade-snapshot.mjs` | D-44 (§4) |
| `bin/grade.mjs` | help text only |
| `lib/vetReplay.mjs` **(new, pure)** | composition, substitution, gates (§5.3–5.4) |
| `lib/seasonGrade.mjs` **(new, pure)** | `VETERAN_SEGMENTS`, `MARKER_SEGMENT`, `KICKOFF_2026_UTC`, metrics, labels (§5.5); Slice B adds the ROS/games graders |
| `scripts/season-grade-run.mjs` **(new)** | adapter + orchestrator, injectable `DEFAULT_LOAD`, per-step isolation (§10) |
| `bin/season-grade.mjs` **(new)** | thin CLI: `--write`, `--json`, `--rehearse`, `--only <steps>` |
| `lib/projectionFactors.mjs` | `reconstructDepthFactor(…, { position, model, qbRole = null })`: under `qb-takeover`, a non-stale QB with `qbRole === 'backup'` → 1.00 (the app's :975 case; also covers a second order-1 QB). Default null is byte-identical (the `lib/panel.mjs:1505` caller is unchanged). `lib/vetReplay.mjs` calls this; it does **not** fork the branch |
| `test/grade-routing.test.mjs`, `test/grade.test.mjs` | §11 |
| `test/vet-replay.test.mjs`, `test/season-grade.test.mjs` **(new)**; `test/fixtures/season-grade/` **(new)**; `test/panel-fit.test.mjs` (one `qbRole` case) | §11 |
| `package.json` | `"grade:season": "node bin/season-grade.mjs"` |
| `README.md` | Grading harness → basis routing; new section "January season grade" |
| `CLAUDE.md` | Commands row + navigation rows (< 25,000 B; now 19,687) |
| `data-catalog.md` | `grading/` row: league-routed `grading/<date>.json`, new unregistered artifacts |
| `grading/anchor-policy.md` | new subsection with the machine-readable veteran segment table (§5.2) |
| `.claude/tasks/app-repo-backlog.md` | one entry pointing to §16 (cross-repo rule) |

Untouched: `lib/grade.mjs`, `buildInBasisOutcomes`, every pinned constant, every committed artifact.

## 4. D-44 — routing in `scripts/grade-snapshot.mjs`

Fix sites: `loadOutcomes` (:136-149) and `gradeSnapshot` (:256-259).

New export `resolveOutcomeBasis(snapshot) → { model: 'half_ppr'|'league'|null, classification, provenance, caveats[] }`:

| Envelope | Provenance (`inputStatus.careerStats.detail.provenance`) | model | classification |
|---|---|---|---|
| no `scoringSettings` (v1) | — | `half_ppr` | `half_ppr` |
| `projectionBasis` absent / `'half_ppr'` | no `inputStatus` (v2) | `half_ppr` | `half_ppr`, caveat "provenance unrecorded" |
| same | all `'data-store'` | `half_ppr` | `half_ppr` |
| same | any season ≠ `'data-store'` | `null` | `mixed`: skip, return null, exit 0, log the seasons |
| `'league'` | any | `league` | `league`; a non-`data-store` season adds a caveat only (CR-01) |
| anything else | any | `null` | `unknown`: skip |

- **`loadOutcomes(targetSeason, { model, scoringSettings, positionOf }, load)`** replaces the 3-arg form.
  - `half_ppr` → `buildHalfPprOutcomes`.
  - `league` → new `buildLeagueOutcomes(rows, scoringSettings, positionOf)`: `rescoreSeasonRowsLeague` (`lib/leagueBasis.mjs`), then the half-PPR builder's shape on the rescored `fantasyPoints`.
- **`positionOf` seam:** `DEFAULT_LOAD.loadPositionOf` (default `loadLeaguePositions()` over `raw/-players-nfl.json`), falling back to `buildPositionMap(snapshot)` and then null. If `load.loadPositionOf` is **absent** (e.g. the v1 test's `load`, `test/grade-routing.test.mjs:158`), that source is skipped, not an error. Counts go to `meta.positionSource`. Tests inject a map.
- **`basisMatch` seam:** `buildGradeInputFromSnapshot(…, { outcomeBasis = null })`.
  - Non-null sets `meta.outcomeBasis = outcomeBasis`, `basisMatch = true`, `inBasis = (outcomeBasis === 'league')`.
  - The default null keeps today's computation (:169-171), so `test/grade.test.mjs` is unchanged.
  - `gradeSnapshot` always passes `resolveOutcomeBasis(…).model`.
- **Meta and report:** adds `meta.outcomeModel`, `meta.basisClassification`, `meta.provenance` (additive; `schemaVersion` stays 1). `formatHumanReport` prints them. `--strict-basis` keeps its v1-only meaning.

## 5. Veteran calibration (headline)

### 5.1 Population and K

- `KICKOFF_2026_UTC` = **`2026-09-10T00:20:00Z`**. Source: nflverse `games.csv` (fetched 2026-10-24 by Session 2): `2026_01_NE_SEA`, gameday 2026-09-09 (Wed), gametime 20:20 ET. **Correction (Session 1, 2026-10-24):** the plan had assumed a Thu 09-10 opener (2026-09-11T00:20Z); the Thu 09-10 game, SF@LA, is the second game.
- **K** = the last capture with `capturedAt <` kickoff = **`snapshots/2026-09-09.json`** (19:22:18Z). Verified: no `projectionBasis`; 424 veterans, none with `regressionUpsideBasis`/`qbTakeoverBasis`; `teamFactor` constant within team (32 teams). `2026-09-10` (19:12Z) is after kickoff and is L0's first capture. K-vs-S counts quoted elsewhere were measured on `09-10` (illustrative; the run recomputes on K).
- **Guard:** K's envelope has no `projectionBasis`, and K's veteran rows carry no `regressionUpsideBasis` or `qbTakeoverBasis`; else stop.
- **P** = K's rows with `projection.confidence !== 'rookie'`.
- **Position:** K's `teamDepthCharts`, then `raw/-players-nfl.json`, then `nflverse/roster/2026.json`. `UNK` is pooled only, with a count.
- **Outcome:** the 2026 row in the segment's basis; no row → 0 games, 0 points.

### 5.2 Segments

| Id | Rows | Model | Outcome basis | Label |
|---|---|---|---|---|
| **R** | P, replayed (§5.3) | the newest veteran segment's model on K's inputs | league (`buildLeagueOutcomes`, S's `scoringSettings`) | **headline if §5.4 passes**, clean |
| **K** | P as captured | September (legacy Step 4, half-PPR, legacy QB depth, pre-7/8/10) | half-PPR (D-44) | clean, **not the shipping model** |
| **L0…Lm** | the first capture of each veteran segment after kickoff | that segment's | its D-44 basis | **leaky** |
| **S** | **composite, not a capture**: the per-player rows S(i) R draws from (§5.3), as captured | newest | league | **leaky**; no `grading/<date>.json` (its first capture is already Lm's report) |

**R and K are always both reported**, each with its own label, plus `R − K` (§5.5).

**`VETERAN_SEGMENTS`** lives in `lib/seasonGrade.mjs`. It is mirrored **byte-for-byte** as the fenced ```json block between `<!-- veteran-segments:begin -->` and `<!-- veteran-segments:end -->` in a new anchor-policy subsection. Boundaries 6 and 9 are rookie-only and get no veteran segment; b9's marker maps to L5. The literal content:

```json
[
  {"id":"L0","boundary":"none","firstCapture":"2026-09-10","detector":{"kind":"capturedAfter","utc":"2026-09-10T00:20:00Z"},"markers":[]},
  {"id":"L1","boundary":"4","firstCapture":"2026-09-13","detector":{"kind":"vetRowKey","key":"regressionUpsideBasis"},"markers":[]},
  {"id":"L2","boundary":"4a","firstCapture":"2026-09-25","detector":{"kind":"envelopeEquals","field":"projectionBasis","value":"league"},"markers":[]},
  {"id":"L3","boundary":"5","firstCapture":"2026-10-04","detector":{"kind":"vetRowKey","key":"qbTakeoverBasis"},"markers":[]},
  {"id":"L4","boundary":"7","firstCapture":"2026-10-07","detector":{"kind":"capturedAfter","utc":"2026-10-07T06:50:00Z"},"markers":[]},
  {"id":"L5","boundary":"8","firstCapture":"2026-10-10","detector":{"kind":"vetRowKey","key":"shortSeasonState"},"markers":["2026-10-11","2026-10-14"]},
  {"id":"L6","boundary":"10","firstCapture":"2026-10-23","detector":{"kind":"markerIn","markers":["2026-10-23"]},"markers":["2026-10-23"]}
]
```

**Detector vocabulary** (the code dispatches on `kind`; an unknown kind throws):

| kind | fires iff |
|---|---|
| `capturedAfter` | `capturedAt > utc` |
| `vetRowKey` | **every** veteran row (`projection.confidence !== 'rookie'`) has `factors[key] !== undefined` |
| `envelopeEquals` | `snapshot[field] === value` |
| `markerIn` | `snapshot.projectionModelFrom` ∈ `markers` |

L0's `utc` is `KICKOFF_2026_UTC`. If Session 2's `games.csv` check gives a different instant, it **stops and reports**; it does not edit the literal.

**Classification and precedence.** For a capture with `targetSeason === 2026`:
- If `capturedAt ≤ KICKOFF_2026_UTC`, it is `pre-kickoff` (K-era).
- Otherwise its segment is the **last entry in array order whose detector fires**.
- **Cross-checks (each a stop):**
  - (i) The capture's date must lie in [that entry's `firstCapture`, the next entry's `firstCapture`).
  - (ii) A non-null `projectionModelFrom` must be in `MARKER_SEGMENT` (derived from the `markers` columns), and must map to the same segment.
  - (iii) The **newest** `targetSeason === 2026` capture must classify to the last entry.
  - Every stop message says: "anchor policy stale — pin boundary N in grading/anchor-policy.md's JSON block and VETERAN_SEGMENTS first".
- **A new veteran boundary re-opens this plan.** Before the run it must go through a Session 1 revision, which adds the segment and **re-pins** M10's A, the Q-within span and Q-cross's B, and re-states R's model/S. The "frozen" pre-registration covers metrics, CIs, tolerances and labels; the segment-dependent spans are re-pinned by rule, never by judgment on the day.
- **Boundary-equality guard (stop).** For each consecutive pair (K, L0's first capture), (last capture of Lj, first capture of Lj+1) up to the S segment:
  - (a) `shareTrend`, `teamRzShareFactor`, `snapShareFactor`, `rzUsageFactor` and `efficiencyFactor` are equal on all common veterans. Today: 0 diffs, K vs `10-23` on 407 veterans. A difference means a boundary changed a factor this plan treats as boundary- and roster-independent.
  - (b) Every veteran `teamFactor` equals `1 + (16 − r)/200` for an integer r ∈ [1, 32] within 0.0005.
  - (c) Every veteran `qbQualityFactor` equals `1 + (qbQualityScore − 50)/1000` within 0.0015, or is 1 with a null score. Those are the K-sourced formulas.
  - Any failure: stop and report. January then needs a plan decision; nothing is improvised.

**Why one capture per segment, never pooled:** pooling measures the mechanism change, and daily rows are not independent. The first capture is the least leaky.
- **Inventory only** (not graded): v1/v2 and summer captures (pre-kickoff, K's veteran model bar untracked June–July changes and the poisoned 07-16→07-18 window).

### 5.3 Replay R — the shipping model on pre-kickoff inputs (aggregate fidelity)

**Source row S(i):** the earliest capture holding i as a veteran that meets all of: `targetSeason 2026`, `currentSeason 2025`, `max(inputStatus.careerStats.detail.seasons) = 2025`, `projectionBasis 'league'`, and segment = the last segment in `VETERAN_SEGMENTS`.

**Factor sourcing rule.** A factor comes from **K** iff (a) it drifts with live state (§1.4) and (b) K captured it. Anton fixed `teamFactor` and `qbQualityFactor` to K even though (c) fails for them (no boundary between K and S changed the formula or basis); the boundary-equality guard (§5.2) checks their formulas. Otherwise a factor comes from **S** (`careerStats ≤ 2025` under the shipping model). Uncaptured drift stays live.

| factor | source | how |
|---|---|---|
| `teamFactor` | **K** (Anton; (c) fails on basis, half-PPR rank) | K's veteran-row table team → `teamFactor` at `T_K = K.nfl_team`. Sensitivity: S's table |
| `qbQualityFactor` (RB/WR/TE) | **K** (Anton; (c) partial) | K's captured per-team `qbQualityFactor` at `T_K` (veteran rows; faithful value, not recomputed from the rounded score); none → 1.0 |
| `depthFactor`, `depthStale` | K's order, current branch | `reconstructDepthFactor(order_K, recentStarter(i), { position, model: 'qb-takeover', qbRole })`, extended per §3, not forked. `recentStarter` = `gamesStarted ≥ 8` in i's last qualifying season ≤ 2025 (gp ≥ 8, finite fp) from served season-totals |
| QB role / share | K's QB rooms, current chain | `reconstructQbPreseasonShares` on K's teams and orders. `priorOf` = league-rescored 2025 PPG. Models = `pinnedQbChainModels(readJson('backtests/2026-10-03-qb-takeover-constants.json'))`. rk ⇔ `playerids.bySleeper[id].draftYear === 2026`, or (no crosswalk entry ∧ K row `confidence === 'rookie'`); rk moves only that rookie QB's own share, so veteran shares are unaffected. `qbRole` feeds the depth call |
| `shareTrend`, `teamRzShareFactor`, `snapShareFactor`, `rzUsageFactor`, `efficiencyFactor` | **S** (corrected, round-2 flag 4: not live-dependent) | identical to K's on all common veterans today; guarded by the boundary-equality guard (a) |
| `ageDelta` | S's curve at K's age | `table_S[pos][ageAt(K date)]`. The table maps (pos, `ageAt(S(i) capture date)`) → the **mode** of `ageDelta` over that capture's veteran rows; ties go to the smallest value. `ageAt` = floor whole years from `playerids.bySleeper[id].birthdate` at the capture's `capturedAt` (UTC). No birthdate, or no cell → S's value (counted) |
| `breakoutFactor` | age at K | if `ageAt(K) === ageAt(S)` or `ageAt(K) > 24` → S's value; else (age differs and ≤ 24, where the curve level is uncaptured) → K's captured `breakoutFactor` (counted) |
| `compPPG`, `compBlendWeight`, empirical-curve level | **S, live** (uncaptured, or basis-dependent) | reported as drift (§5.4 Q); never decides |
| everything else (`basePPG`, `regressionFactor`, `momentumFactor`, `trajectoryFactor`, `bounceBackFactor`, `tdRelianceFactor`, `projectedGames`, …) | **S** | not live-dependent |

**Recomposition (delta form).** B(f) is §1.3 on factor set f.
- In-envelope factors combine as `combinedNewFactorRaw' = raw_S · Π(f'_j / f_S,j)` over the substituted in-envelope factors.
- Non-chain: `p'_i = projectedPPG_S + B(f') − B(f_S)`.
- Chain QB: `blended' = qbStarterPPG_S + B(f') − B(f_S)` (with `qbStarterPPG_S = blended_S`; on a QB that is not chain in S use `projectedPPG_S`), then `p' = blended' · share'`.
- `G' = projectedGames_S`.
- `T' = round1(p'·G')`, or `round1(blended'·share'·17)` on a chain row.

**Unreplayable players** (no S(i)) are imputed: `p' = p_K·ρ_pos`, `T' = T_K·ρ^T_pos`, `G' = G_K·ρ^G_pos`, where ρ = Σ replayed ÷ Σ K-captured at that position. ρ is **re-estimated inside every bootstrap resample**.
- **R-full** (with imputed players) is R.
- **R-replayed** is reported beside it, with K-captured calibration on both subsets.

### 5.4 Gates — R is headline only if G1–G3 and G-MECH pass; G5 and G6 degrade instead; Q never decides

- **G1 identity:** B(f_S) reproduces `projectedPPG` within 0.15 on 100% of non-chain veteran rows of every capture contributing an S(i). Report the max (today 0.102 on `10-23`).
- **G2 depth:** recomputed `depthStale` and `depthFactor` on those captures' own orders equal the captured values on 100% of veteran rows.
- **G3 tables:** on K and every S(i) capture, `teamFactor` and `qbQualityFactor` are constant within team across veteran rows. K's table covers every `T_K`.

**G-MECH — the mechanics gate (decides R vs K).**

*Method.* For a pair (A, B) in the same segment, replay A's inputs onto B's veteran rows with the §5.3 recomposition:
- A's veteran-row `teamFactor` table at A's team, and A's per-team `qbQualityFactor`;
- A's `depthFactor`;
- A's `shareTrend`, `teamRzShareFactor`, `snapShareFactor`, `rzUsageFactor`, `efficiencyFactor`, `breakoutFactor`;
- **and A's `ageDelta`, `compPPG` and `compBlendWeight`**.

All inputs are then fixed, so any difference is a mechanics error.

Rows: veterans present in both A and B. Rows that are `chain` in **A or B** are excluded and counted; their shares are G5's job, and on R chain status comes from K's rooms.
- **Games:** `G_B = G_A` is **asserted** on every gated row. A mismatch is a G-MECH failure: within a segment `projectedGames` is identical today (0 differences on every pair).
- **Position source:** A's `teamDepthCharts` (the `buildPositionMap(A)` rule). Rows not on A's charts are `UNK`: they count in rule (a) and in the "rows" column, are **excluded from (b)**, and their count is reported per pair.
- **Ratios in (b)** use **unrounded** `p_R` (`Σp_R`) and `T_R = round1(p_R·G_B)`, against captured `p_A` and `T_A`. This is exactly how the §5.4 table was computed.

*PASS* requires both, on every pair:
- **(a) Zero veteran row mismatches beyond display rounding.** A row matches iff both hold:
  - `|round1(p_R) − p_A| ≤ 0.1`: at most one 0.1 step of `projectedPPG`'s 1-dp display rounding.
  - `|T_R − T_A| ≤ 0.1·G_A + 0.1`, where `T_R = round1(p_R·G_B)`: one PPG display step carried through G games, plus one step of `projectedTotalPts`' own 1-dp rounding. Comparisons use a 1e-9 slack.
  - *Why this bound.* `p_A` and `p_B` are each rounded to 1 dp (±0.05 each), and the factors to 3 dp. A correct replay can therefore sit up to one display step from `p_A`, but never two.
- **(b) Backstop:** per position (QB/RB/WR/TE), `|Σp_R/Σp_A − 1| ≤ 0.003` and `|ΣT_R/ΣT_A − 1| ≤ 0.003`.

*Pairs (pre-registered).* M1–M9 are fixed committed pairs, so their results are deterministic in January. M10 is pair (4):

| pair | segment | rows | rows beyond rounding | max display steps | worst \|PPG ratio\| | worst \|total ratio\| |
|---|---|---|---|---|---|---|
| M1 `09-13→09-24` | L1 | 417 | 0 | 1 | 0.0020 | 0.0005 |
| M2 `09-25→10-03` | L2 | 425 | 0 | 1 | 0.0010 | 0.0010 |
| M3 `10-04→10-06` | L3 | 422 | 0 | 1 | 0.0004 | 0.0005 |
| M4 `10-07→10-09` | L4 | 425 | 0 | 1 | 0.0010 | 0.0010 |
| M5 `10-10→10-22` | L5 | 415 | 0 | 1 | 0.0008 | 0.0005 |
| M6 `10-13→10-14` | L5 | 424 | 0 | 1 | 0.0004 | 0.0005 |
| M7 `10-15→10-16` | L5 | 426 | 0 | 1 | 0.0007 | 0.0004 |
| M8 `10-13→10-22` | L5 | 419 | 0 | 1 | 0.0008 | 0.0006 |
| M9 `10-21→10-22` | L5 | 424 | 0 | 0 | 0.0001 | 0.0005 |
| M10 = pair (4) | last segment | — | — | — | — | — |

Today's values (data `12c769b`); the tests reproduce M6 on fixtures, and the rehearsal reproduces the whole table.

**Pair (4) / M10, bounded window.** A = the first capture of the last segment in `VETERAN_SEGMENTS`. B = the last capture of that segment with `capturedAt ≤ A.capturedAt + 9 days` **and** `capturedAt < 2027-01-01T00:00Z` (age curves shift with the calendar year, `dynastyScore.js:86`). If no such B ≠ A exists, M10 is `skipped`, and the gate decides on M1–M9. **R stays the headline, with the fixed caveat "mechanics of the newest model version unverified"** in its label (§13). Today L6 has one capture, so M10 is skipped. Its window analogue on L5, `10-10→10-19`, gives 419 rows, 0 beyond rounding, worst ratios 0.0007 and 0.0004.

**Headroom.** The backstop of 0.003 is 1.5× today's worst (0.0020). The row rule passes on every pair with at most one display step. The bug probe from rev 1 (rookie rows in the team table) produced 0.0075 ratio and many multi-step rows, so it fails both (a) and (b).

- **G5 QB chain (veteran rows only):** run on each S(i) capture's own QB rooms (rk from S's `factors.rookieGamesBasis` ending `|0`, the T-QB-3 rule, `test/qb-mirror.test.mjs:139-140`). The reconstruction must reproduce `qbTakeoverBasis` and every chain `qbStartShare` (4 dp) on **veteran** QB rows. Rookie-path QB rows are reported, not gated: 3 of 54 / 3 of 58 rookie shares miss today because of the crosswalk gaps 13310, 13428, 13602. On failure, R drops veteran QB rows whose K role is `backup` or `chain` (counted).
- **G6 age table:** share-in-mode = Σ over (pos, age) cells of the mode count ÷ Σ all counts, on each S(i) capture. It must be ≥ 0.98 (today 0.993 on `09-10`, `10-14`, `10-22`, `10-23`). On failure, S's `ageDelta` is kept everywhere and the count of P players with a birthday between K and S(i) is reported.

**Q — drift, reported next to R every run, never deciding.** "Live" replay = the §5.3 rule (S's comps; S's age table at A's age). "Mech" = A's comps and `ageDelta`. Both are replayed onto B's rows from A's inputs. Per position:
- `Q_ppg = Σp_live/Σp_mech − 1`
- `Q_tot = ΣT_live/ΣT_mech − 1`
- the live row share with `|round1(p_live) − p_A| > 0.1`

Two spans:
- **Q-within:** A = first capture of the last segment; B = its last capture with `capturedAt < 2027-01-01T00:00Z` (no 9-day bound). Skipped if B = A. Today L6 has one capture; the L5 analogue `10-13→10-22`: QB 0.0015/0.0018, RB −0.0009/−0.0010, WR 0.0017/0.0017, TE 0.0004/−0.0013; 54/419 rows.
- **Q-cross — labelled "drift plus cross-boundary mechanics":** A = L2's `firstCapture` from `VETERAN_SEGMENTS` (today `2026-09-25`, the first league-scored capture; comps are basis-dependent, so no earlier A); B = the first capture of the last segment. Across the boundaries in between, formula changes to `qbQualityFactor`/`depthFactor`/`teamFactor` also enter Q-cross, hence the label. Rule (a) of G-MECH is never applied to Q, where `G` legitimately differs. Today, B = `10-23`: QB 0.0001/0.0000, RB 0.0039/0.0037, WR 0.0025/0.0030, TE −0.0020/−0.0041; 119/409 rows. Report also the share of P whose S(i) is not B.

The verdict prints Q-within ("drift") and Q-cross ("drift plus cross-boundary mechanics") directly under the R/K headline table.

- **Stop rule:** if G1–G3 or G-MECH fail, R is still computed and reported, labelled "replay failed gate X — not headline". The headline becomes K, labelled "September model — not the shipping model; model changes since are unmeasured".

### 5.5 Metrics (each of R, K, L0…Lm, S; per position QB/RB/WR/TE; pooled)

For rows with projection `p` (PPG), `G`, `T`, and outcome `a` (points), `g` (games):

- **R_ppg** `= Σ a_i / Σ (p_i·g_i)` over `g_i > 0`, excluding chain rows (per-team-game `p`).
- **R_tot** `= Σ a_i / Σ T_i` over all rows, including 0-game players and chain rows.
- **Secondary:**
  - `R_games = Σ g / Σ G`.
  - `Med_ppg` = median of `(a/g)/p` over `g ≥ 6`, non-chain. This is the history-comparable statistic, matching `grading/2026-09-06-fullpipeline-verdict.md`.
  - MAE/bias PPG over `g ≥ 6`.
- **Pooled:** ratio-of-sums over all positions, and the unweighted mean of the four position ratios.
- **R − K:** per position, on the common cohort (P members graded in both, which is all of P except outcome-basis edge cases), on the same resample.
- **Segment differences:** `R_x − R_R` on the common cohort.
- **Heterogeneity:**
  - (a) Each position vs pooled: `R_pos − R_pooled` on the same resample, with CI.
  - (b) Permutation test: shuffle position labels within the cohort (4,000 permutations, seed 12345, mulberry32). Statistic `max_pos |R_pos − R_pooled|`; report the p-value.

## 6–9. Moved to Slice B

§6 (D-52), §7 (D-16, D-75), §8 (D-60) and §9 (D-79/80/85 listing) live in `.claude/tasks/january-grading-run-b.md`, under the same section numbers.

## 10. Orchestrator

- **Order:** G-SEASON → inventory (every capture: date, D-44 classification, segment, provenance, marker) → D-44 GradeReports for K and L0…Lm (one capture each; S is a composite and gets none) → §5 (gates first) → [Slice B steps].
- **Step registry:** `scripts/season-grade-run.mjs` exports `STEPS`, an ordered array of `{ id, run(ctx) → { section, artifacts } }`. Slice A ships `season-gate`, `inventory`, `d44`, `vet-calibration`. Slice B appends `ros`, `games-l6`, `override`, `rookie`, `d60`, `listed` without touching A's steps. `--only <ids>` filters by `id`; an unknown id throws. `ctx` carries the loads, `KICKOFF_2026_UTC`, K, the classification, S and P, so B reuses them.
- **Isolation:** each step after G-SEASON runs in its own try/catch (the `update-playerstats.mjs` precedent). Exit 1 if any step failed.
- **Offline analysis, not the snapshot grader** (Invariant 9): R recomposes projections.
- **Artifacts (`--write`):**
  - `grading/<captureDate>.json` per graded capture (registered, as `bin/grade.mjs --write` does);
  - `backtests/<runDate>-season-grade.json` (aggregates only);
  - `grading/<runDate>-season-grade-verdict.md`.
  - The last two are unregistered (README §Analysis convention). Slice B adds its rookie panels.
- **Verdict layout:**
  - Top line: report-only, no constant proposed.
  - Then the headline table: R and K side by side, each labelled, R − K, per position + pooled, R_ppg/R_tot with CIs and labels.
  - Directly under it: Q-within and Q-cross (drift, labelled "reported, not deciding").
  - Then: gates (G1–G3, the G-MECH table M1–M10 with rows beyond rounding and max steps, G5, G6, the boundary-equality guard), segments, heterogeneity, then each Slice B step's section in registry order.

## 11. Tests (Invariant 10: no test reads `ktc/`, current-season `nfl/`/`nflverse/`, `nflverse/playerids.json` or the newest capture)

- **`test/grade-routing.test.mjs`.** These existing tests are **declared rewritten** (D-44 changes the behaviour; not bent green):
  - "loadOutcomes v2 … → buildInBasisOutcomes path" (:88): v2 now reaches half-PPR or league via `model`, never `buildInBasisOutcomes`.
  - "loadOutcomes v1 …" (:114): new signature.
  - "loadOutcomes returns null for missing year" (:136): new signature.
  - "gradeSnapshot v2 … → meta.inBasis true" (:143): a v2 capture with no `projectionBasis` is half-PPR.
  - New cases:
    - league → rescored outcomes, proven by decoy `fantasyPoints`;
    - all-`data-store` → half-PPR;
    - a `live-api` season → `mixed`, returns null;
    - `'unknown'` → null;
    - `positionSource` counts via the injected `loadPositionOf`.
- **`test/grade.test.mjs`:** unchanged. Add one case: `outcomeBasis: 'half_ppr'` on a `'custom'` envelope gives `basisMatch` true.
- **`test/vet-replay.test.mjs`** runs on `test/fixtures/season-grade/` **trimmed copies** of committed captures, about 60 veteran rows each from `2026-10-13`, `10-14`, `10-22` and `2026-09-09` (K), plus a fixture birthdate map:
  - G1/G2/G3 pass on them;
  - G-MECH on the trimmed `10-13→10-14` pair: 0 rows beyond rounding and ratios ≤ 0.003, against values computed in the test file;
  - the row-rule boundary (a row exactly one step off passes; two steps fail; the total bound at `0.1·G + 0.1`);
  - a deliberate rookie-row pollution of the team table fails G3 and G-MECH;
  - M10 window selection (the 9-day bound, the `< 2027-01-01` bound, `skipped` when B = A);
  - Q arithmetic (`Q_ppg`/`Q_tot`) on the trimmed pair;
  - `reconstructDepthFactor` with `qbRole: 'backup'` → 1.00, with the default call byte-identical (also in `test/panel-fit.test.mjs`'s existing cases);
  - G5 gating only veteran rows;
  - age-table mode and smallest-value tie-break;
  - substitution identity (S's own inputs → S's values);
  - delta form with the envelope binding;
  - a chain row;
  - the breakout age rule (each branch);
  - imputation with ρ re-estimated per resample.
- **`test/season-grade.test.mjs`** runs on fixtures (synthetic 2026 season-totals with `weeklyStats`, a 272-game schedule, trimmed captures):
  - G-SEASON pass and each fail case;
  - hand-computed R_ppg/R_tot/R_games/Med_ppg, chain exclusion, 0-game rows; `insufficient` below the minimum;
  - bootstrap and permutation determinism;
  - `STEPS` registry order, `--only` filtering, an unknown id throwing, and per-step isolation (a throwing step is reported, the next still runs, exit 1);
  - classification stops (i), (ii) and (iii);
  - `VETERAN_SEGMENTS` deep-equals the JSON block parsed from `grading/anchor-policy.md` (between the two markers);
  - each detector `kind` on trimmed fixture captures straddling its boundary (b4: `09-12`/`09-13`; b4a: `09-24`/`09-25`; b5: `10-03`/`10-04`; b8: `10-09`/`10-10`; b10: a trimmed copy of `10-23` vs `10-22`, as fixtures, never the live newest file), the L4 `capturedAfter` rule, last-firing precedence, and an unknown `kind` throwing;
  - the boundary-equality guard, (a)–(c), pass and fail.
- **Smoke:** `npm run smoke` unchanged.

## 12. Cross-repo

- **New coupling:** `lib/vetReplay.mjs` mirrors the composition (:1013-1054), `teamFactor` (:964), and the breakout gate (`projectionSignals.js:31-35`); it reads the live inputs set up at `App.jsx:222-247` (age curves, `computeTeamContext` current-team). The depth branch stays in `lib/projectionFactors.mjs` `reconstructDepthFactor`, already CR-15. This joins CR-15.
- **CR-01:** `resolveOutcomeBasis` is a new consumer of `projectionBasis`/`inputStatus`. Today `gradeSnapshot` reads only `scoringSettings`, `scoringBasis`, `targetSeason` and `capturedAt`.
- Both registry edits are app-side (§16). Session 2 adds one `.claude/tasks/app-repo-backlog.md` entry pointing to §16 (blocking: no; land after the data commit, since `registry.test` resolves Data sites) and flags it in the hand-back.
- G1/G2/G-MECH fail loudly if an app change goes unsynced.

## 13. Pre-registration (frozen at this commit)

| Item | Rule |
|---|---|
| Reported always | R and K, each labelled, plus R − K |
| Headline | R if G1–G3 and G-MECH pass; else K, labelled "not the shipping model". If M10 is `skipped`, R stays the headline with the fixed caveat **"mechanics of the newest model version unverified"** |
| Primary | R_ppg and R_tot per position + pooled (both forms) |
| Secondary | R_games; Med_ppg (g ≥ 6); MAE/bias (g ≥ 6); R-replayed; L/S segments |
| CI | 95% percentile, player-cluster bootstrap, `clusteredBootstrap` (`lib/inSeasonEvidence.mjs`), 4,000 resamples, seed 12345, unstratified within the cell; differences on the same resampled clusters; ρ re-estimated per resample |
| G-MECH | pairs M1–M10 (§5.4; M10 bounded to ≤ first + 9 days and < 2027-01-01). Every pair: 0 veteran rows with `\|round1(p_R) − p_A\| > 0.1` or `\|T_R − T_A\| > 0.1·G_A + 0.1`, and per position `\|PPG ratio − 1\|` and `\|total ratio − 1\|` ≤ 0.003 |
| Q | Q-within and Q-cross (§5.4), every run, printed under the headline; never decides |
| Minimum sample | ≥ 20 graded players per cell (R_ppg, Med_ppg), ≥ 20 rows (R_tot); below → `insufficient` (numbers printed, no label). Slice B's minimums are in its §13 |
| Calibration label | `optimistic` if CI upper < 1; `pessimistic` if CI lower > 1; else `within-CI` |
| History | `consistent-with-history` iff the 2026-09-06 mirror median (QB 0.882, RB 0.912, WR 0.856, TE 0.846) lies inside Med_ppg's CI; else `differs-from-history` (statistic matched; mirror vs app and half vs league stated) |
| R − K, segments | CI contains 0 → `agrees`, else `differs` |
| Heterogeneity | per position `differs-from-pooled` iff the (R_pos − R_pooled) CI excludes 0; `positions-differ` iff permutation p < 0.05 |
| Sensitivity (report-only) | S's `teamFactor` table; S's values for every K-sourced factor; K' = the capture before K; R-replayed |
| Never output | a constant, a multiplier, or a recommendation to wire |

## 14. Done-definition and hand-back (Slice A)

1. `npm test` and `npm run smoke` green.
2. `node bin/season-grade.mjs --rehearse` runs end to end on today's partial data. Paste the G1–G3, the G-MECH table (must reproduce §5.4's M1–M9 values to 4 dp), G5, G6, the guard and Q blocks, and the R/K headline table. A gate that fails in rehearsal is reported, never fixed by loosening a §13 value.
3. **M10.** First `git pull --rebase origin main` on the working branch, to get the newest captures; never push. If a capture of the current segment (L6) exists with `capturedAt ≤ 2026-10-23T20:02:03Z + 9 days` other than `2026-10-23`, run M10 (the latest such capture as B) and append a `## M10 result` section to this file: pair, rows, rows beyond rounding, max steps, worst ratios per position, PASS/FAIL. If none exists yet, append the section stating "not yet available (newest capture <date>)". M10 then stays open, and Session 1 runs it at verification or later, recording it in the same section.
4. README, CLAUDE.md (size test), data-catalog, the anchor-policy JSON block and the app-repo-backlog entry are updated.
5. **Commit; do not push.** Anton signs off first (2026-10-24 instruction). No served data or manifest entry changes.
6. Hand-back: SHA range, files touched, deviations, and what each new or changed test asserts (call out the four declared `grade-routing` rewrites and the `reconstructDepthFactor` default byte-identity).

## 15. Questions for Anton

None open. The run date and replay approach were decided in Revision 1; the gate split and tolerances in Revision 2; the skipped-M10 caveat, the M10 follow-up and the A/B split on 2026-10-24.

## 16. App-side edits for a later parent-folder session (not made here)

1. App `.claude/tasks/data-repo-backlog.md`: change the trigger for D-16, D-44, D-52, D-60 and D-75 from "≥ 2027-01-05" to **Fri 2027-01-15 (≥ 14:00 UTC; week 18 ends 2027-01-10)**, citing this task file.
2. `docs/cross-repo-registry.md` **CR-15**:
   - Data += `lib/vetReplay.mjs` (`recompose`);
   - App += `src/App.jsx` (the `computeTeamContext` current-team memo and the `computeEmpiricalAgeCurves` memo, :222-247; **not** the dynasty-only `computeHistoricalShares` current-team memo at :293-301), `src/utils/teamContext.js` (`computeTeamContext`), `src/utils/projectionSignals.js` (`computeBreakoutFlag`);
   - Tests += `test/vet-replay.test.mjs`.
3. **CR-01:** Data += `scripts/grade-snapshot.mjs` (`resolveOutcomeBasis`).
4. Land after the data commit, so `test/registry.test.mjs` resolves the new Data sites.

## 17. Flag → section map

Moved to `.claude/tasks/january-grading-run-reviews.md`: every flag from both plan-review rounds, mapped to its section here or in Slice B.

## M10 result

Run 2026-10-24 by Session 2 after `git pull --rebase origin main` on `claude/p3-slice-a-037aa6` (up to date; origin/main carried no capture newer than `2026-10-23`).

**Not yet available (newest capture 2026-10-23).** L6 holds one capture, `2026-10-23` (`capturedAt` 2026-10-23T20:02:03Z); no other L6 capture exists with `capturedAt ≤ 2026-11-01T20:02:03Z`. M10 is `skipped`; R stays the headline with the fixed caveat "mechanics of the newest model version unverified". M10 stays open: Session 1 runs it at verification or later (pair A = `2026-10-23`, B = the latest L6 capture with `capturedAt ≤ A + 9 days` and `< 2027-01-01`) and records it in this section.
