# Projected-games calibration — short seasons split by cause (L6b)

Session 1 (opus), 2026-10-09. This is item L6b of `../future_plans/in-season-notes-plan.md` → "L6 research
verdict (2026-10-08) — decision". It extends L6, whose task file is `.claude/tasks/projected-games-calibration.md`
and whose verdict is `grading/2026-10-08-games-calibration-verdict.md`.

Planned against data `924461b` (clean tree, in sync with origin). Sonnet implements it in one Session 2.

**Offline research only.**
- No served file changes, and no manifest entry.
- `nfl/`, `nflverse/` and `snapshots/` are read-only.
- The app is untouched.
- The output is a verdict that **Anton reads before any wiring slice is planned**.

## 0. Question and decisions

L6's winning candidate was C3f0: k by position × last-season state, floor 0. Anton rejected it, for two reasons:
- It overcorrected fantasy-relevant players: bias +1.62 → −1.00 and MAE +0.53.
- It cut injured starters: Daniels, Garrett Wilson, Aiyuk and Ridley go 17 → 9.

The `short` cell (S-row gp < 8) mixes injured starters with depth players who were benched or cut.

L6b asks three things:

1. **Cause split.** Split `short` (and `none`) by the *cause* of the missed S-season weeks: injured, benched, or cut. Does a calibration fitted on that split beat the app rule? Anton named `nflverse/rosterweekly` as the source.
2. **Relevance as a fit dimension.** L6 fitted one k per cell across relevant and non-relevant players. One k cannot serve both:
   - non-relevant rows need a large cut (C0 bias +4.63);
   - relevant rows need a small one (+1.62).
3. **Season length as an explicit factor.** Histories from 16-game seasons are used to project 17-game seasons.

**Judged primarily on fantasy-relevant players (MAE and bias); all veterans are secondary.** The harness reports the §7-style named-star cases for every candidate.

**D1 — fit objective (unchanged from L6, Anton's call).** Each cell's k minimises training SSE, because totals are expectations. Only the *decision* changes (§5).

**D2 — judging cohorts (recommended; Anton can change it at plan approval).** There are two primary cohorts:
- **`relevant`**: the verdict's cell, i.e. top-N by S total points (QB 32 / RB 60 / WR 84 / TE 32), as Anton named it.
- **`star`**: `rel3 ∧ sState ≠ qual`, where `rel3` = top-N in **any of S, S−1, S−2**.

Why `star` is needed: Session 1's probe shows `relevant` holds only **22 non-qual rows out of 1,762**. Ranking by S total points excludes almost every player whose S was cut short, so `relevant` cannot see the injured-star harm at all.
- `star` is 344 panel rows, 239 of them out-of-sample, with the rank index over 2013–2025 as specified in §3.1.
- Aiyuk (gp 0 in 2025, short in 2024) is in `rel3` only through 2023. A 2-season window would miss him.

`R*` = `relevant ∪ star` is the population for the tie-break (§5).

**D3 — non-inferiority margin δ on relevant MAE (Anton's knob; all three values are computed, so no re-run).**
- Default **δ = 0.25** games. δ = 0.10 and δ = 0.50 are reported alongside it.
- Session 1's in-sample probe (k applied uniformly to relevant rows) shows the trade-off is inherent. Relevant outcomes are left-skewed (median 15, mean 12.76, C0 mean prediction 14.56):

  | k | relevant bias | relevant MAE |
  |---|---|---|
  | 1.00 (C0) | +1.80 | 3.26 |
  | 0.95 | +1.01 | 3.28 |
  | 0.92 | +0.62 | 3.34 |
  | 0.90 | +0.28 | 3.43 |
  | 0.85 (≈ SSE optimum) | −0.40 | 3.62 |

  Removing the bias costs about 0.2–0.4 MAE. **No rule can improve both.** δ is how much MAE Anton will pay for calibration.
- On `star` rows the two goals agree. C0's bias is +5.80 and MAE 6.75; k 0.6 gives +0.81 and 5.29 (outcome median 7). So the data may show that cutting injured stars is *accurate on average*. §7's named cases let Anton judge the individual players.

**D4 — cause definitions.** Three are tested, and their agreement is reported:
- **K1, app-native:** wireable with no new data.
- **K2, roster-only:** Anton's literal definition.
- **K3, roster + contributor:** K2 with one refinement for injured players who never reached injured reserve.

§1 explains why K3 exists: K2 classifies Jayden Daniels as *benched*. Wireability is part of the parsimony order in §5:
- K1 needs nothing new.
- K2 and K3 need a new served signal, because the app never reads rosterweekly.

## 1. Findings against live source

**rosterweekly carries only the coarse `status`.**
- The file is `nflverse/rosterweekly/<y>.json`, shaped `players[id][week] = [[team, status], …]`.
- It has no `status_description_abbr`.
- 2023 vocabulary: ACT 21,237 · DEV 5,566 · RES 3,419 · INA 2,685 · CUT 503 · RET 190 · EXE 29 · TRC/TRD/TRT/E01 < 10 · PUP 1.

So:
- **"Injured" = RES/PUP.**
- **INA mixes healthy scratches with injured gameday inactives**; the injury report is not ingested.
- RES also covers non-injury reserve (NFI, and COVID in 2020–21). It cannot be split.
- Era caveats, unchanged from L6:
  - INA is absent in 2016–2018 (gameday inactives show as ACT);
  - DEV is nearly absent in 2016;
  - before 2016 the status is a season-level value (`MIN_ABSENCE_CLASSIFY_SEASON`).

**Probe on the L6 panel** (4,362 rows; Session 1 scratch script, read-only): S-season accounting via `accountWeeks` on the S row, rule as in §2.2.

| K2 → K3 (non-qual rows) | n | C0 bias |
|---|---|---|
| short-inj → short-inj | 259 | +4.56 |
| short-bench → short-inj | 33 | +6.48 |
| short-bench → short-bench | 161 | +7.14 |
| short-cut → short-cut | 285 | +7.91 |
| none-inj → none-inj | 58 | +6.34 |
| none-cut → none-cut | 78 | +8.76 |
| unk (S = 2015) | 97 | +7.21 |

The split separates injured short seasons (+4.6) from benched or cut ones (+7 to +8).

The 2026 cases (S = 2025) from L6 §7:

| player | id | 2025 S-season slots | K1 | K2 | K3 | rel3 |
|---|---|---|---|---|---|---|
| Jayden Daniels | 11566 | played 7, INA 10 | short-inj | **short-bench** | short-inj | yes |
| Garrett Wilson | 8146 | played 7, RES 8, INA 2 | short-inj | short-inj | short-inj | yes |
| Brandon Aiyuk | 6803 | RES 17 | short-inj | short-inj | short-inj | yes (2023) |
| Calvin Ridley | 4981 | played 7, RES 7, INA 3 | short-inj | short-inj | short-inj | yes |
| Braelon Allen | 11576 | played 4, RES 13 | **short-oth** | short-inj | short-inj | yes |
| AJ Dillon | 6828 | played 7, INA 9, ACT 1 | short-oth | short-bench | short-bench | yes |
| Austin Trammell | 7746 | played 6, DEV 10, ACT 1 | **short-inj** | short-cut | short-cut | no |
| Carson Steele | 11582 | DEV 17 | short-oth | short-cut | short-cut | no |

The remaining pinned names are in §6.3.

Two conclusions follow:
- K2 misfiles Daniels, because a contributor's injury absences can be all INA.
- K1 misfiles Trammell (a practice-squad stint counted as "dnp ≥ 3") and Allen (not a contributor in S or S−1).

**Season-length reach.**
- The factor (§2.3) changes the prediction input only for rows whose recent qualifying seasons include a ≤ 2020 season while S+1 ≥ 2021. That is **1,389 of 4,362 panel rows**.
- It touches **20 of the 437 2026 veterans** in the 2026-10-07 snapshot, so for current projections it is close to a no-op.
- The L6 "schedule −2.75" term is mostly *not* season length. It is −2.16 in outcome 2016–2020, where history and outcome are both 16-game seasons, and −3.27 in 2021–2025. At most the ≈ 1.1 difference can be season length.
- Report this as found; do not pre-judge it.

**Code facts the plan relies on:**
- `accountWeeks` (`lib/gamesCalibration.mjs:80-108`) is season-agnostic. Passing the S row as `s1Row`, the S−1 row as `s0Row`, `rosterByYear[S].players[id]` and `teamPlayedWeeks(store[S])` gives S-season accounting. Its team fallback order is: the row's own team, then the earlier row's team.
- `cellKey` (`:221-227`) hard-codes four levels. `fitCandidate` (`:235-259`) and `kFor` (`:262-275`) look up the module-level `CANDIDATES`, so they need the generalisation in §2.4.
- `enrichRow` (`:161-187`) caches `teamPlayedWeeks` by season in `ctx.playedCache`. The same cache can serve S-season accounting.
- `relevant` uses a rank index built only over the panel's S seasons (`scripts/games-calibration-run.mjs:318-319`).
- `projectedGamesFor` (`lib/durabilityMirror.mjs:109-146`) does not expose the recent qualifying seasons or their weights. The season-length factor needs them (§2.3).
- `classifyInjurySeason` (`durabilityMirror.mjs:78-87`) is gp < 10 ∧ dnp ≥ 3 ∧ contributor in S, S−1 or S+1. Under `seasonView(store, S)` the S+1 read is absent, so this is the as-of-S app flag.
- `decompCell` (`games-calibration-run.mjs:97-104`) is not exported.
- CLAUDE.md is 24,959 bytes; the ceiling (`test/claudeMdSize.test.mjs`) is 25,000. §8 adds exactly 10 bytes.
- `test/games-calibration.test.mjs` `syntheticLoad` (`:323-360`) has every player with gp ≥ 8 and empty rosterweekly, so it yields no non-qual rows. §6 adds an option.

## 2. Pure code — `lib/gamesCalibration.mjs` (+ one additive mirror field)

### 2.1 `lib/durabilityMirror.mjs` — additive field `recent`

In `projectedGamesFor`, add to the returned object (`:145`):

```js
recent: recent.map((s, i) => ({ season: s.season, gamesPlayed: s.gamesPlayed, w: gpWeights[i] })),
```

- Nothing else changes. `projectedGames`, `avgGamesBase` and `avgGames` are byte-identical.
- The DM parity test must stay green.
- Extend the file header to say `recent` is an offline-only additive field, as was done for `avgGames`.

### 2.2 Cause classification (new section `// ─── L6b cause split ───` after `enrichRow`)

```js
export const SEASON_GAMES = (y) => (y <= 2020 ? 16 : 17);   // NFL regular-season games per team
```

**`rosterCause(counts, { contributor, contributorAbsence })` → `'inj' | 'bench' | 'cut'`**. `counts` are from `accountWeeks`. The three groups are:

- `inj = reserve` (+ `inactive + activeNoPlay` when `contributorAbsence && contributor`)
- `bench = activeNoPlay + inactive` (0 for those slots when they moved to `inj`)
- `cut = practiceSquad + offRoster + otherStatus`

The label is:
- `inj` if `inj > 0 && inj ≥ bench && inj ≥ cut`;
- else `bench` if `bench > 0 && bench ≥ cut`;
- else `cut`. This includes the all-zero case.

**`causeStates(row, ctx)` → `{ k1, k2, k3, sCounts }`** for a panel row `{ id, S, position, sState }`:

**K1:**
- `qual` → `'qual'`;
- `none` → `'none'`;
- `short` → `classifyInjurySeason(seasonView(store, S), id, position, S) ? 'short-inj' : 'short-oth'`.
- K1 never returns `unk`.

**K2 / K3:**
- `qual` → `'qual'`.
- If `S < MIN_ABSENCE_CLASSIFY_SEASON` (2016; import it from `lib/absence.mjs`) → `'unk'`.
- Otherwise, compute:

  ```js
  w = accountWeeks({ s1Row: store[S]?.[id], s0Row: store[S-1]?.[id],
                     rwPlayer: rosterByYear[S]?.players?.[id], played: playedFor(S) })
  ```

  `playedFor(S)` uses `ctx.playedCache` exactly as `enrichRow` does.
  - If `w.skipped`, the label is `'cut'`.
  - Otherwise, the label is `rosterCause(w.counts, …)`:
    - **K2:** `contributorAbsence: false`.
    - **K3:** `contributorAbsence: true`, `contributor = wasContributorSeason(store[S]?.[id], position) || wasContributorSeason(store[S-1]?.[id], position)`. This is the S/S−1 part of the app's own contributor test.
  - The state string is `` `${sState}-${label}` `` (e.g. `short-inj`, `none-cut`).
- `sCounts` = `w.counts` when computed, else `null`.

K3's choice to count a contributor's ACT-not-playing slots as injury is pre-registered. It makes the rule era-uniform: INA is absent in 2016–2018, so those inactives show as ACT. The cost is that a benched contributor (e.g. a QB benched for performance) counts as injured. §7 lists this as a limit.

**`rel3`:**

```js
[S, S-1, S-2].some((y) => { const k = rankIndex.get(`${y}|${id}`); return k != null && k <= defaults.relevantTopN[position]; })
```

`rankIndex` must cover seasons `predictorSeasons.from − 2 … seasons.to`; see §3.

### 2.3 Season-length factor

**`avgGamesSeasonLength(r, outcomeSeason)`**, where `r` is `projectedGamesFor`'s result:

```js
const L1 = SEASON_GAMES(outcomeSeason);
if (r.recent.every((s) => SEASON_GAMES(s.season) === L1)) return r.avgGames;   // exact: no float round-trip
const baseL = r.recent.reduce((a, s) => a + s.w * s.gamesPlayed * (L1 / SEASON_GAMES(s.season)), 0);
return r.avgGames * (baseL / r.avgGamesBase);        // same injury and absence-shape multipliers
```

`avgGamesBase` is > 0 because every qualifying season has gp ≥ 8.
- The early return is required. Without it, `(a·b)/b` drifts by one unit in the last place on 190 untouched panel rows, and one input combination rounds differently (plan gate flag 1).
- When every recent season has the same length as the outcome season, the result `=== avgGames`; test it.

### 2.4 Generalise the cell machinery

L6 output must stay identical; §8's regression step checks this.

1. **`cellKey(level, r)`.** Replace the body with a dimension map:

   ```js
   const DIMS = {
     pos: (r) => r.position,
     age: (r) => (r.ageBucket === 'unk' ? null : r.ageBucket),
     s:   (r) => r.sState,
     rel: (r) => (r.rel3 ? 'rel' : 'oth'),
     k1:  (r) => r.k1,
     k2:  (r) => (r.k2 === 'unk' ? null : r.k2),
     k3:  (r) => (r.k3 === 'unk' ? null : r.k3),
   };
   function cellKey(level, r) {
     const parts = level.split('|').map((d) => DIMS[d](r));
     return parts.some((p) => p == null) ? null : parts.join('|');
   }
   ```

   - **Export `cellKey`** (for GCC-5), and add it plus every new §2.2–2.6 export to the header Exports block (`:5-13`).
   - It must produce exactly L6's keys for `pos`, `pos|s`, `pos|age`, `pos|age|s`.
   - It must throw on an unknown dimension: `DIMS[d]` is undefined, so it throws a TypeError. Wrap that in a clear `Error` naming the level.

2. **`fitCandidate(trainRows, candId, { minCellTrainPlayers, kGrid, candidates = CANDIDATES } = {})`.**
   - Read `{ levels, floor, avgKey = 'avgGames' }` from `candidates[candId]`.
   - Fit each cell with `fitK(g.rows.map((r) => ({ avgGames: r[avgKey], outcome: r.outcome })), floor, kGrid)`.
   - Return `{ id, floor, levels, avgKey, cells, thin }`. `levels` and `avgKey` are new; everything else is unchanged.
   - The thin/root logic is unchanged. The root is the **last** level in the chain (`level === levels[levels.length - 1]`), which equals `'pos'` for every candidate in both registries.

3. **`kFor(model, r)`.**
   - Use `model.levels ?? CANDIDATES[model.id].levels`.
   - Keep the unk-age rule verbatim.
   - With the new null keys, an `unk` k2/k3 row skips every level containing that dimension and lands on `pos|s`. That is the intended routing.

### 2.5 Candidates (pre-registered)

```js
export const CAUSE_CANDIDATES = Object.freeze({
  C3f0:   { levels: ['pos|s', 'pos'], floor: 0 },                         // L6's pick, refitted (reference)
  K1f0:   { levels: ['pos|k1', 'pos'], floor: 0 },
  R0f0:   { levels: ['pos|rel|s', 'pos|s', 'pos'], floor: 0 },
  RK1:    { levels: ['pos|rel|k1', 'pos|k1', 'pos'], floor: 8 },
  RK1f0:  { levels: ['pos|rel|k1', 'pos|k1', 'pos'], floor: 0 },
  K2f0:   { levels: ['pos|k2', 'pos|s', 'pos'], floor: 0 },
  K3f0:   { levels: ['pos|k3', 'pos|s', 'pos'], floor: 0 },
  RK2:    { levels: ['pos|rel|k2', 'pos|k2', 'pos|s', 'pos'], floor: 8 },
  RK3:    { levels: ['pos|rel|k3', 'pos|k3', 'pos|s', 'pos'], floor: 8 },
  RK2f0:  { levels: ['pos|rel|k2', 'pos|k2', 'pos|s', 'pos'], floor: 0 },
  RK3f0:  { levels: ['pos|rel|k3', 'pos|k3', 'pos|s', 'pos'], floor: 0 },
  RK1f0L: { levels: ['pos|rel|k1', 'pos|k1', 'pos'], floor: 0, avgKey: 'avgGamesL' },
  RK3f0L: { levels: ['pos|rel|k3', 'pos|k3', 'pos|s', 'pos'], floor: 0, avgKey: 'avgGamesL' },
});
export const CAUSE_CANDIDATE_IDS = Object.freeze(Object.keys(CAUSE_CANDIDATES));
// L0 is the no-fit season-length-only rule: round(clamp(avgGamesL, 8, 17)). It is not in the fit registry.
export const CAUSE_ALL_IDS = Object.freeze(['C0', 'L0', ...CAUSE_CANDIDATE_IDS]);
/**
 * §5 parsimony order: fewer dimensions < more; floor 8 < floor 0; no L < L; and every app-native
 * candidate (K1, s, rel) < every roster-cause one (K2, K3), which needs a new served signal.
 * C3f0 is REFERENCE-ONLY: tabled and constants written, never in the walk (Anton rejected it, L6).
 */
export const CAUSE_TIERS = Object.freeze([
  ['L0'], ['K1f0'], ['R0f0'], ['RK1'], ['RK1f0'], ['RK1f0L'],
  ['K2f0', 'K3f0'], ['RK2', 'RK3'], ['RK2f0', 'RK3f0'], ['RK3f0L'],
]);
```

`minCellTrainPlayers` (40) and `kGrid` are unchanged.

### 2.6 Decision helpers

Add to `GAMES_CAL_DEFAULTS`? **No**: add a separate frozen `CAUSE_DEFAULTS`, so L6's object stays byte-identical:

```js
export const CAUSE_DEFAULTS = deepFreeze({
  deltas: [0.10, 0.25, 0.50], primaryDelta: 0.25, biasGate: 1.0,
  pinned: ['11566', '8146', '6803', '4981', '6931', '6828', '7746', '11576', '5121', '8414', '4274', '4017', '8253', '7537', '11582'],
  autoStarMinDelta: 3, autoStarCap: 40, starCutGames: 4,
});
```

`pinned` lists the 15 L6 §7 names in its table order, by Sleeper id. Session 1 resolved the ids against `raw/-players-nfl.json`, and each is a 2026-10-07 snapshot veteran.

**`causeEligibility(summary, delta, biasGate)` → `{ eligible, failed: [gate ids] }`.**

The summary is:

```js
{ relevant: { dMae, bias, c0Bias }, star: { dMae }, pooled: { dMse }, rStar: { mae },
  relevantByPosition: { QB: { dMae }, … } }
```

`relevant.bias` / `c0Bias` are the **raw** means (`mean(pred − outcome)`, computed in the runner, not `pooledStats`' 3-dp `bias`). `rStar.mae` is the raw R\* MAE.

`dMae` / `dMse` are `deltaStats` objects (`mean`, `ci95`) against C0. The gates are:

| id | gate |
|---|---|
| G1 | relevant ΔMAE `ci95[1] ≤ delta` (non-inferior). A null ci fails. |
| G2 | `|relevant bias| ≤ biasGate` **and** `|relevant bias| < |C0 relevant bias|` |
| G3 | star ΔMAE `ci95[1] ≤ delta`. A null ci fails. |
| G4 | pooled (all veterans) ΔMSE `ci95[1] < 0`. A null ci fails (as L6 `:335`). |
| G5 | no position whose relevant ΔMAE `ci95[0] > delta`. A null ci at a position does not fail. |

Use raw, unrounded values, as L6's `deltaStats` already keeps them.

**`decideCause({ summaries, paired, delta, recon, tolerance, biasGate })`** returns `{ outcome: 'W'|'N'|'S', pick, eligibility, text }`. It copies L6's `decide` structure (`:351-370`):
- `S` on a recon breach.
- Walk `CAUSE_TIERS`. Within a tier, take the eligible member with the lowest raw **R\*** MAE. Exact ties keep `CAUSE_TIERS` array order (stable sort).
- A later tier replaces the incumbent only when `paired(member, incumbent)`, the R\* ΔMAE ci95, has an upper bound < 0. A null paired ci (under 30 players) keeps the incumbent.
- C3f0 is never walked; its eligibility is still computed and tabled.
- Text:
  - W: `(W) wire <id> at δ = <delta> — …`. If the id contains `K2` or `K3`, append: `; needs a new served roster-cause signal (the app does not read rosterweekly)`.
  - N: `(N) no change at δ = <delta> — no candidate is eligible.`

## 3. Runner — `scripts/games-cause-run.mjs` (new)

The header follows `games-calibration-run.mjs`. Exports:

- `runGamesCause({ load, defaults = GAMES_CAL_DEFAULTS, causeDefaults = CAUSE_DEFAULTS, log })`
- `buildGamesCauseVerdictMarkdown(result)`
- `writeGamesCauseArtifacts({ result, verdictMd, root })`
- `gamesCauseMain({ load, defaults, causeDefaults, write, asJson, writeArtifacts, log, logErr })`

Reuse, do not copy:
- `GAMES_CAL_LOAD`, `ParityStop`, `SnapshotStop` and `panelEligibility` from `games-calibration-run.mjs`;
- `buildPanel` and `parityReport` from `absence-run.mjs`;
- everything in §2.

Export `decompCell` from `games-calibration-run.mjs`; adding `export` is the **only** change to that file. Everything else the new runner needs from it that is private (`cellMetrics`, `ALL_IDS`, `cellTable`, `impactFor`'s veteran walk, the load/panel block of `runGamesCalibration`) is **copied locally** into `games-cause-run.mjs`, generalised there to `CAUSE_ALL_IDS`. Do not refactor L6's file.

### 3.1 `runGamesCause` steps

1. **Load, gate and build the panel.**
   - Copy `runGamesCalibration`'s body from `:283` through the GC-2 check (`:315`): parity stop, snapshot stop, `positionOf` / `bySleeper` / `draftYearOf`, store and roster loads.
   - Use `buildPanel` and the `panelEligibility` equality check. Copy the block; do not factor it out of L6's file.
2. **Build the rank index** over seasons `predictorSeasons.from − 2 … seasons.to`, i.e. 2013–2025. `rows = panelRows.map((r) => enrichRow(r, ctx))`, unchanged.
   - Then, per row, add `causeStates`, `rel3`, `avgGamesL = avgGamesSeasonLength(projectedGamesFor(store, id, position, { throughSeason: S }), S + 1)`, and `relevant` (the field already on the row).
   - Assert `star === (rel3 && sState !== 'qual')` consistency: compute it once and store it as `r.star`.
   - Throw if `rel3` is false for a row whose `relevant` is true. S is in the window, so this indicates an index bug.
   - **Throw on any `k1`/`k2`/`k3` value outside the closed sets:**
     - K1: `qual`, `short-inj`, `short-oth`, `none`;
     - K2/K3: `qual`, `unk`, and `{short,none}-{inj,bench,cut}`.
3. **Reconciliation.** Same as L6 (`recon`, `accountingSkipped`), on S+1.
4. **Cause descriptives (Q-A extension).**
   - Crosstabs K1×K2 and K2×K3. Each cell shows n, C0 bias, n relevant and n rel3.
   - `decompCell` on cells keyed by each K-state, for all rows and for `star` rows. Build the cells from `rows.filter((r) => r.dec)` only, as `runQa` does (`:122`): `decompCell` dereferences `r.dec`.
   - The mean S-season `sCounts` per K3 state, by era of S: 2016–2018 vs 2019+.
   - The count of `unk` rows.
5. **Season-length descriptives.**
   - n of rows with `avgGamesL !== avgGames`, by outcome season.
   - Mean `round(clamp(avgGamesL, 8, 17)) − G` (the L-schedule term) vs L6's schedule term, by outcome era 2016–2020 / 2021–2025.
   - For the 2026 veterans: n with `avgGamesL !== avgGames`.
6. **Held-out fit.**
   - Same folds as L6: `forwardChainFolds([from..to], minTrainSeasons)`, eval S 2018–2024.
   - Per fold, fit every `CAUSE_CANDIDATES` entry with `{ candidates: CAUSE_CANDIDATES }`.
   - The out-of-sample row carries `{ id, S, position, sState, k1, k2, k3, rel3, relevant, star, outcome, p }`, with:
     - `p.C0 = r.pred`;
     - `p.L0 = candidatePred(r.avgGamesL, 1, 8)`;
     - for each candidate, `p[id] = candidatePred(r[spec.avgKey ?? 'avgGames'], kFor(model, r).k, spec.floor)`.
   - Record fallbacks per fold as L6 does.
7. **Tables.** These use the local copy of `cellMetrics` over `CAUSE_ALL_IDS` (see the start of §3). The tables are:
   - `relevant`, `star`, `rStar` (relevant ∨ star), `pooled`, `notRelevant`;
   - `byPosition[p]`, `relevantByPosition[p]`;
   - `byK3[state]` (all OOS rows by K3 state, `unk` excluded; it does not occur out of sample);
   - `era2020` (S ≥ 2020).
8. **Decisions.**
   - Build each candidate's summary (§2.6) from the tables. `L0` is a candidate; `C0` is not.
   - `paired(hi, lo)` = `deltaStats(rStarRows, p[hi], p[lo], 'mae', bootstrap).ci95`, cached.
   - Run `decideCause` once per `delta` in `causeDefaults.deltas`, giving `decisions[delta]`.
   - The headline is `primaryDelta`.
9. **Full-sample constants.** Fit every candidate on all rows. Unlike L6's flat map, write `k` **nested by level**, `{ [level]: { [key]: k } }`: keys collide across levels in the new chains (`pos|k2`'s `WR|qual` vs `pos|s`'s `WR|qual`). Also write `floor`, `avgKey` and `thinCells`.
10. **2026 impact, for every candidate** (not only picks).
    - Veterans are taken as in L6's `impactFor` (`:244-278`): the snapshot is `defaults.snapshotDate` (the same pinned `'2026-10-07'`), with S = `seasons.to` (2025) and outcome 2026.
    - Build each veteran's row with `sState`, `causeStates`, `rel3` and `avgGamesL` exactly as in step 2.
    - Per candidate, report:
      - n veterans and mean change by position;
      - n `rel3` veterans cut by ≥ `starCutGames`;
      - rank changes by position (projectedPPG × games, as L6).
    - **Named-star table:** the 15 `pinned` ids, plus every veteran with `rel3` whose games change by ≥ `autoStarMinDelta` under **any** candidate. The latter are sorted by max |Δ|, then name, and capped at `autoStarCap`; list the overflow count.
    - Each line has name, pos, K1/K2/K3, rel3, C0 games, and every candidate's games.
    - A pinned id missing from the snapshot or with no qualifying season gives a row reading `not a 2026 veteran`, and does not throw.

### 3.2 Result shape and artifacts

The result is:

```js
{ meta, parity, panelCounts, recon, cause, seasonLength, qb: { folds, tables }, constants, decisions, impact, rows }
```

- `meta` adds `primaryDelta`, `deltas` and `causeDefinitions`; a one-line text per K.
- Each `rows` entry adds `k1, k2, k3, rel3, star, avgGamesL (3 dp), sCounts` to L6's row fields.

The artifacts are:
- `backtests/<date>-games-cause-panel.json` (the result minus `constants`);
- `backtests/<date>-games-cause-constants.json`;
- `grading/<date>-games-cause-verdict.md`.

Writer and main mirror `writeGamesCalibrationArtifacts` / `gamesCalibrationMain` (`:485-522`), including exit 1 on `ParityStop`/`SnapshotStop` with nothing written.

### 3.3 CLI — `bin/backtest.mjs`

In the `--games-calibration` branch (`:200-210`):
- Accepted flags become `--games-calibration`, `--cause`, `--json`, `--write`.
- With `--cause`, dispatch `gamesCauseMain({ write, asJson })`; otherwise behaviour is unchanged.
- Reject message: `--games-calibration rejects … it takes only --cause, --json and --write`. The existing test regex `/--games-calibration rejects --bogus/` must still match.
- Before the other modes, add: `--cause` without `--games-calibration` → `[backtest] Error: --cause requires --games-calibration`, exit 1. This is the `--dynasty` pattern (`:260-263`).
- Header doc: one entry under `--games-calibration` describing `--cause` and its three artifacts.

## 4. Verdict file — `grading/<date>-games-cause-verdict.md`

The sections, in order:

1. **What was compared.**
   - Panel, folds and D1 (SSE fit).
   - D2's cohorts, with their n (all rows and out-of-sample).
   - D3's δ values.
   - The cause definitions in one line each.
2. **Parity and reconciliation**, as L6 §2, plus the K-state closed-set assertion ("held for all n rows").
3. **Cause split.**
   - The crosstabs.
   - Decomposition by K-state, all rows and star rows.
   - S-season mean slot counts per K3 state by era.
   - The `unk` count.
   - Era caveat text: L6's, plus "RES includes non-injury reserve (NFI; COVID 2020–21)".
4. **Season-length factor.** The step 5 numbers. If the 2026-touch n is under 5% of veterans, state it plainly: the factor affects n of 437 current veterans.
5. **Held-out results.** One table per cohort, in this order: relevant · star · R\* · all veterans · not relevant · by position · relevant by position · by K3 state · eval S ≥ 2020 · fallbacks.
   - Use L6's `cellTable` columns over `CAUSE_ALL_IDS`.
6. **Full-sample k tables**, as L6 §5.
7. **Decision.**
   - The gate text (G1–G5, tier order, R\* tie-break).
   - One table: candidate × δ ∈ {0.10, 0.25, 0.50}, each cell `eligible` or `fails G…`.
   - Then three bullets, one per δ, with the decision text; the default δ is bolded.
   - Close with "The choice is Anton's."
8. **2026 impact and named stars.**
   - The per-candidate summary table: n, mean Δ by position, rel3 cut ≥ 4, rank changes.
   - The named-star table (pinned, then auto). Columns are C0, L0, then candidates in `CAUSE_CANDIDATE_IDS` order.
9. **Limits.**
   - L6's limits.
   - INA is mixed: K2 counts it as bench, K3 as injury only for contributors.
   - K3 counts a benched contributor as injured.
   - RES includes non-injury reserve.
   - S = 2015 rows are `unk` for K2/K3 and fit via `pos|s`.
   - `rel3` ranks on served half-PPR; the app ranks on league scoring.
   - Floor 0 needs an app clamp change.
   - **Wireability:**
     - K1 and rel use app data (`classifyInjurySeason` is CR-28-mirrored; season ranks exist app-side);
     - K2/K3 need a new served signal, a new coupling, and a registry entry before any wiring.

## 5. Decision rule (pre-registered, computed by the harness)

§2.6 is the rule. In words:
- A candidate is eligible when:
  - relevant-player MAE is no worse than C0 by more than δ (CI upper bound);
  - relevant bias is within ±1.0 and smaller in size than C0's;
  - injured-star MAE is no worse than C0 by more than δ;
  - squared error across all veterans improves (CI below 0);
  - no position's relevant MAE is significantly worse by more than δ.
- Among eligible candidates, walk the parsimony tiers. A more complex candidate replaces the simpler one only if it beats it on R\* MAE with a paired CI below 0.
- K2/K3 sit above every app-native candidate, so needing a new served signal must be paid for with a significant gain.
- C3f0 (L6's rejected pick) is tabled for reference and never picked.
- The named-star table is a **guardrail for Anton, not a gate**.

## 6. Tests — append to `test/games-calibration.test.mjs` (prefix `GCC-`)

Add `syntheticLoad` option `{ withCause = false }`. When it is true:
- Players `P0`–`P11` get a short S season in 2019 and 2021: gp 4, i.e. 4 `'P'` then 13 slots that are `'D'` (scenarios a–c) or `'X'` (scenario d). **`dnpWeeks` = the number of `'D'` slots** (13 or 0).
- Their 2019/2021 rosterweekly listings for those 13 weeks cycle through four scenarios by `i % 4`. The expected states are pre-stated and asserted in GCC-7:

  | `i % 4` | scenario | setup | K1 | K2 | K3 |
  |---|---|---|---|---|---|
  | 0 | a: RES | `['KC','RES']`; contributor (base `gamesStarted`) | short-inj | short-inj | short-inj |
  | 1 | b: INA, contributor | `['KC','INA']`; `gamesStarted` 4 in S | short-inj | short-bench | short-inj |
  | 2 | c: INA, non-contributor | `['KC','INA']`; `gamesStarted: 0, stats: {}` in **both S and S−1** (S−1 stays gp ≥ 8, so it still qualifies) | short-oth | short-bench | short-bench |
  | 3 | d: DEV | `['KC','DEV']`; slots `'X'`, `dnpWeeks` 0 | short-oth | short-cut | short-cut |

- Default `false` leaves GC-7 unchanged.

1. **GCC-1 `rosterCause`.** Cover:
   - RES-majority → inj;
   - a Daniels-shaped case (INA 10, contributor): K2 bench, K3 inj;
   - a non-contributor with INA → bench under both;
   - DEV-majority → cut;
   - the tie order `inj ≥ bench ≥ cut` (equal counts → inj; bench = cut → bench);
   - all zero → cut.
2. **GCC-2 `causeStates`.**
   - S = 2015 short row → k2/k3 `unk`, while k1 is still computed.
   - A `none` row whose S−1 team played and that has no rosterweekly listing → `none-cut`.
   - K1 equals `classifyInjurySeason(seasonView(store, S), …)`.
   - **No leak:** adding an S+1 contributor row for the player does not change k1/k2/k3.
3. **GCC-3 `rel3`.**
   - Top-N only in S−2 → true; only in S−3 → false; only in S+1 → false (no leak).
   - A relevant row is always rel3.
4. **GCC-4 `avgGamesSeasonLength`.**
   - History 2018/2019/2020 → outcome 2021 equals `avgGames × 17/16` to 1e-12.
   - Mixed 2019/2020/2021 history equals the hand-computed weighted value.
   - An all-16 history into a 16-game outcome, or all-17 into 17, equals `avgGames` exactly.
   - The new `recent` field's weights sum to 1, and `projectedGames` is unchanged.
5. **GCC-5 generalised cells.**
   - Every L6 candidate's `cellKey` output is identical to the pre-change strings for a row set covering every age bucket including `unk`; hard-code the expected keys.
   - `pos|rel|k2 → pos|k2 → pos|s → pos`: an `unk` k2 row lands on `pos|s`.
   - A thin `pos|rel|k3` cell falls back to `pos|k3`.
   - An unknown dimension throws.
   - `avgKey: 'avgGamesL'` fits on the L input: give a fixture where `avgGames` and `avgGamesL` differ and assert that k differs.
6. **GCC-6 `causeEligibility` / `decideCause`.**
   - Each gate G1–G5 fails alone, and is named.
   - A K2 candidate tied with K1 (paired CI crossing 0) → K1 is picked; a null paired CI also keeps K1.
   - An eligible C3f0 with the best R\* MAE is never picked.
   - Equal R\* MAE inside a tier → `CAUSE_TIERS` array order wins.
   - A K3 candidate with a paired CI below 0 replaces it, and its text names the served-signal need.
   - Three deltas give three decisions; one fixture should be eligible at 0.50 and not at 0.10.
   - `S` on a recon breach.
7. **GCC-7 end to end** with `syntheticLoad({ withCause: true })` and `smallDefaults`:
   - exit 0, one write;
   - `decisions` has keys `0.1`, `0.25`, `0.5`;
   - constants keys equal `CAUSE_CANDIDATE_IDS`;
   - the verdict has `## 7. Decision` and `## 8. 2026 impact`;
   - every scenario row's k1/k2/k3 equals the pre-stated table above (assert per player, not just non-zero counts);
   - the real writer under a tmp root writes the three `games-cause` paths;
   - a parity break → exit 1 and nothing written.
8. **GCC-8 CLI.**
   - `--cause` alone → exit 1 and `/--cause requires --games-calibration/`.
   - `--games-calibration --cause --bogus` → exit 1 and `/rejects --bogus/`.

Existing GC-1…GC-7 and `test/durability-mirror.test.mjs` must pass unchanged.

## 7. Limits that bound the verdict (state them, do not fix them)

- The causes are rosterweekly statuses, not injury reports.
- A K2/K3 win is research evidence only. Wiring needs a new served signal, which is a separate, larger decision.
- `rel3`'s three-season window is pre-registered. It is not tuned.
- δ and the cohorts are Anton's (D2/D3), and all three δ values are computed.

## 8. Touch list, done-definition, commits

**Touch list (exhaustive):**
- `lib/durabilityMirror.mjs`: §2.1 only.
- `lib/gamesCalibration.mjs`: §2.2–2.6.
- `scripts/games-calibration-run.mjs`: `export` on `decompCell` only.
- `scripts/games-cause-run.mjs`: new.
- `bin/backtest.mjs`: §3.3.
- `test/games-calibration.test.mjs`: §6.
- `README.md`:
  - the `--games-calibration` CLI line (`:1313`): add `[--cause]`;
  - the artifact lists (`:1326-1327`): add `<date>-games-cause-{panel,constants}.json` and `<date>-games-cause-verdict.md`;
  - the `durabilityMirror` note (`:1417-1418`): add one sentence on `recent`;
  - README.md:1405 "used only by `bin/backtest.mjs --absence`" is stale since L6: change it to name `--absence`, `--games-calibration` and `--games-calibration --cause`;
  - the `gamesCalibration.mjs` note: one paragraph on L6b, covering the cause states, candidates, the gates and δ, and its artifacts.
- `CLAUDE.md` line 16: replace `` `--games-calibration` |`` with `` `--games-calibration [--cause]` |``. That is +10 bytes, giving 24,969 ≤ 25,000. Change nothing else in CLAUDE.md.
- Generated artifacts: the three dated `games-cause` files.

No `package.json` script, no manifest, no data-catalog row, no registry edit.

**Done-definition:**
1. **Before any edit:** `node bin/backtest.mjs --games-calibration --json > "$TMPDIR/l6-before.json"`.
2. Implement. Run `npm test` and `npm run smoke`; both must be green.
3. **L6 regression:** run `node bin/backtest.mjs --games-calibration --json > "$TMPDIR/l6-after.json"`. Then:

   ```sh
   jq -S 'del(.meta.generatedAt,.meta.panelRev,.constants.generatedAt,.constants.panelRev)' "$TMPDIR/l6-before.json" > "$TMPDIR/a.json"
   ```

   Do the same for `l6-after.json` into `"$TMPDIR/b.json"`, then `diff "$TMPDIR/a.json" "$TMPDIR/b.json"`. **The diff must be empty.** Paste the command and its (empty) output into the hand-back. Nothing is written inside the repo.
4. Run `node bin/backtest.mjs --games-calibration --cause --write` and report the wall time. Then check:
   - DM-1 ≥ 99%;
   - recon mean 0;
   - the K-state assertion held;
   - Daniels / Wilson / Aiyuk / Ridley's K1/K2/K3 equal §1's table. If any differs, **stop and report**; do not adjust the rules.
   - **Copied-path equivalence:** the cause run's C3f0 out-of-sample predictions (per `id|S`) and its full-sample k equal L6's C3f0 from `"$TMPDIR/l6-after.json"` (same rows, same folds; compare the flat L6 map against the nested one). A difference means the copied load/panel/enrich path diverged: stop and report.
5. `test/claudeMdSize.test.mjs` is green, and `wc -c CLAUDE.md` = 24,969.

**Commits** (pull with rebase before push, per git-workflow.md):
1. `Games calibration L6b: cause split + relevance + season-length candidates (--games-calibration --cause)`: code, tests, docs.
2. `grading: games-cause verdict <date>`: the three artifacts.

Session 2 hands back:
- the SHAs;
- every file touched;
- every deviation;
- what each GCC test asserts;
- the step 3 regression output;
- the step 4 numbers.

## Cross-repo impact

**No app change. No served-file change.** Three data-side Triggers fire on the touch list. None of the contracts' behaviour moves.

- **CR-28**, via `lib/durabilityMirror.mjs` (one additive return field, `recent`; mirrored behaviour unchanged, DM-1 re-runs green in this change). Mirror text, verbatim:

  > Changing the status set, the team-played source, the 2016 floor or the slot rule changes app `projectedGames`/`projectedTotalPts`, the ×1.05 bounce-back on `projectedPPG` for a few rows, dynasty reliability, the bounce-back/injury-risk badges and labels, and every games-missed display, **with no app-side diff** — add a `grading/anchor-policy.md` boundary. **The correction is one-way:** the stored files no longer hold the Sleeper-only baseline. A widening change can be graded with `bin/backtest.mjs --absence` and applied by re-running `scripts/migrate-absence-roster.mjs`; a narrowing change needs a forced Sleeper re-fetch of every affected season (with CR-02's dominant-team risk) and has no before/after harness. `lib/durabilityMirror.mjs` mirrors the app triggers above at a pinned app SHA; an app change to any of them silently stales that harness, so re-mirror and re-run its DM-1 parity test in the same change. A completed season re-aggregated with `--force` classifies against its own stored roster file, so editing or deleting that file changes a sealed season's `'D'` on the next forced run. The app's API-only mode keeps Sleeper-only `'D'`, so its games-missed counts and durability differ from the store's. In-season, a week's gameday inactives reach `'D'` one season-totals run after the games (the roster refresh runs daily at 06:23 UTC, after the 06:13 run).

  **App action: none.**
- **CR-25** and **CR-27**, via the whole-file `bin/backtest.mjs` trigger. Only the `--games-calibration` branch changes; the `--inseason`, `--dynasty`, `--qb-takeover` and `--qb-rookie-level` branches are untouched, so no fit, constant or pin moves. Their Mirror texts are long; they are quoted by reference to `cross-repo-registry.md` (each entry's `Mirror` field, read at `924461b`). They open:
  - CR-25: "An app-side change to any mirrored definition stales every fitted k: mirror the definition into `lib/inSeasonEvidence.mjs` (never into the frozen `PHASE1_K`), re-run `node bin/backtest.mjs --inseason --write`, and re-pin from the new constants file — never hand-edit a `K_*`." **App action: none.**
  - CR-27: "A change to any feature definition or bin on either side re-runs `node bin/backtest.mjs --qb-takeover --write` and the app re-pins by byte copy with the data commit SHA — never by hand-editing a coefficient." **App action: none.**

**Registry staleness (no edit in this slice; registry edits go two-session):** add to the pending **D-66** list. CR-28's data-side Triggers should name every rosterweekly status reader:
- `lib/gamesCalibration.mjs` `statusClass` / `accountWeeks` (`:65-108`; its own RES/PUP/INA/ACT/DEV/CUT vocabulary) and its `teamPlayedWeeks` use (`:176`);
- the new `causeStates` / `rosterCause`;
- `hasReserveListing` in `scripts/absence-run.mjs:126` and `scripts/games-calibration-run.mjs:57`.

**If the verdict picks a K2/K3 candidate and Anton wants it wired, that is a new coupling.**
- The app would need a served per-player S-season cause, and the app's `docs/signal-registry.md` row for rosterweekly ("never read by the app") changes.
- It needs a drafted registry entry and a parent-folder wiring slice.
- A K1/rel/C3 pick wires as an app `seasonProjection.js` Step 6 change under CR-28, as L6 stated.

## Plan gate (plan-reviewer, 2026-10-09) — decisions

15 flags. Session 1 checked each against live source and applied all of them (Anton delegates review calls).

| # | flag | decision |
|---|---|---|
| 1 | HIGH: `avgGamesSeasonLength` is not exact on untouched rows (190 rows drift; one rounding flip possible) | Applied: same-length early return, ratio computed once (§2.3) |
| 2 | `cellKey` is private, but GCC-5 tests it | Applied: export it, and update the header Exports |
| 3 | The `withCause` fixture cannot produce K1 short-inj or K3 short-bench | Applied: `dnpWeeks` = 'D' count, S−1 non-contributor, a pre-stated expected table asserted per player |
| 4 | Touch list vs "factor/generalise L6's file" contradiction | Applied: local copies only; `export decompCell` is the sole L6 change |
| 5 | `decompCell` on skipped rows | Applied: filter `r.dec` first |
| 6 | Summary lacks R\* MAE; tie-break unstated | Applied: `rStar.mae` (raw), stable sort by tier order |
| 7 | Tiers contradict parsimony; C3f0 status unclear | Applied: R0f0 in its own tier; RK1f0L before K2/K3; C3f0 reference-only (never walked) |
| 8 | Null and rounding rules (G4, bias, null paired) | Applied: G4 null fails; raw bias; null paired keeps the incumbent |
| 9 | Flat constants keys collide across levels | Applied: nested by level |
| 10 | Star count 329 vs 344 | Applied: 344. Session 1's probe used L6's narrower rank index for the D2 count |
| 11 | Regression files written in the repo root | Applied: `$TMPDIR` |
| 12 | Copied-path equivalence and the S+1 rank leak are untested | Applied: C3f0 equivalence check in done-step 4; GCC-3 S+1 case |
| 13 | `impactFor` anchor; stale README:1405; header Exports | Applied |
| 14 | CR-25/27/28 Triggers fire; Mirror text not quoted | Applied: CR-28 verbatim, as L6 did. CR-25/27 by opening sentence plus a pointer to the registry field, because they fire only through the whole-file `bin/backtest.mjs` trigger and quoting both in full would add about 7 KB (the 40 KB threshold) for branches this slice does not touch |
| 15 | CR-28 Triggers omit rosterweekly readers | Folded into the D-66 list (names `statusClass`/`accountWeeks`) |
