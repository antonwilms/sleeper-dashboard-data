# P6a — QB backup→starter takeover research (offline backtest)

Session 1 (planning, opus), 2026-10-03, against data `bf697a5`. Source plan: parent folder
`future_plans/in-season-notes-plan.md` §P6 / §P6a. **Offline analysis only**: no ingest run,
no served-family write, no manifest entry, no app change. The output is pinned constants plus a
provenance fixture, consumed later by P6b (the wiring, a separate parent-folder task).

Pattern: Phase 2a (`.claude/tasks/in-season-evidence-2a-backtest.md`). The pure logic goes in a
new `lib/`, the adapter in a new `scripts/`, and a new `bin/backtest.mjs` mode. Every comparison is
leave-one-season-out (LOSO) and every confidence interval comes from the clustered bootstrap.
Decision rules are pre-registered here, and Session 2 applies them **without tuning after seeing
results**.

---

## 0. Goal and fixed decisions

**Product question (Anton, P6).** No flat backup penalty. For a QB who is not his team's starter,
how likely is he to be the starter in each remaining game, given (1) his prospect quality,
(2) the incumbent's quality, and (3) how long he has already sat? Team record is optional.
P6b turns this into ROS = Σ over remaining games of P(start)·starter PPG + (1−P)·backup PPG,
with backup PPG ≈ 0 for a QB. On the dynasty side it applies only a mild discount for sitting
longer than draft capital predicts. Scope is **QB only**; RB/WR/TE keep the existing depth factor.

**Model shape (Session 1 decision).** A two-state weekly Markov chain over a team's game
sequence:
- **Hazard** `pUp`: P(a non-starter QB is his team's primary passer in game g).
- **Stickiness** `pStay`: P(a backup-origin starter stays primary passer in game g).

Both are logistic models over **categorical** (binned) features. With categorical features the
MLE depends only on the per-pattern counts (trials, events). So the fixture's pattern table is an
exact set of sufficient statistics, and every pinned coefficient re-derives from it, which is the
same provenance property the 2a k have. A chain, rather than a single "takeover" event, is needed
because ROS needs P(start) in *every* remaining week, including injury fill-ins and incumbents
returning.

**Probe facts (Session 1, read-only scratch scripts over the committed store, 2013–2025):**
- 6,814 REG team-games; 6,806 (99.88%) have a primary passer under §3.1.
- Hazard rows (g ≥ 2): order ≥ 2 only 8,873 rows / 450 events (5.1%). **Widened population
  (§3.3, with `dp = d1`): 9,397 / 605** (reviewer re-probe, round 2).
- g = 1 rows (2013–2024): 554 rows, 13 events.
- Stickiness rows: 1,319 rows, 1,008 stay (76%). Unaffected by the flag-5 widening, since stickiness membership
  does not depend on `dp`.
- Raw first-start rates by draft group, before any model: top-3 rookies 6/26, top-12 rookies 7/42,
  R1 rookies 5/49, day-2 rookies 12/194, day-3 / UDFA about 3%. Previously-started backups run
  about 2× the first-start rate.

  The rookie top-pick cells are tiny, which is why this plan uses a ridge-penalised pooled model
  with a forward ladder rather than cell tables.

**Data-domain facts the implementation must respect (each one silently drops rows if wrong):**
1. **Team codes.** `nflverse/gamelogs` `games[].team` is the **current-franchise** domain in every
   season (LA/LAC/LV; CR-09). `nflverse/schedule` and `nflverse/depth` are **era-coded**
   (STL ≤2015, SD ≤2016, OAK ≤2019; probe confirmed 0 schedule↔depth mismatches). Map gamelogs →
   era with `eraTeam(team, S)` from `lib/nflverse.mjs` (import only, no edit). Never apply
   `eraTeam` to depth or schedule. The first probe, without this mapping, silently lost
   about 290 rows.
2. **Draft capital** comes from `nflverse/playerids.json` `bySleeper[pid]`: `draftOvr` (overall),
   `draftYear`, `undrafted`, `birthdate`. Do not join `nflverse/draft/draft_picks.json`: it is
   name-keyed, and its `pick` is overall while `bySleeper.draftPick` is within-round (see the
   `lib/rookieMirror.mjs` header warning).
3. **Weekly points** come from `nfl/season-totals/<S>.json` `[pid].weeklyPoints` (Sleeper,
   `scoringBasis: 'half_ppr'`; QB scoring is reception-basis invariant). **Never** use gamelogs
   `fantasyPoints` (CR-09 Mirror). Gamelogs are read only for dropbacks, team and week, to identify
   the primary passer.
4. **Snaps are not weekly.** `nflverse/snaps` is season-aggregate, so it is not used.
   Starter identity is the primary passer (§3.1), not games started. Season-totals `gamesStarted`
   is season-grain only.
5. **Depth-chart timing differs by era** (§3.2). ESPN-era (2025+) week-w charts are the last
   snapshot *on a week-w gameday*, often the Monday after the Sunday game, i.e. post-game.
   Probe, QB1(chart w) agreement:

   | Era | vs primary of game w | vs primary of game w−1 |
   |---|---|---|
   | Legacy | 86.9% | 91.9% |
   | ESPN | 88.5% | 89.3% |

6. **Transport risk (for P6b, measured here, not fixed).** The app's live input is Sleeper
   `depth_chart_order`, not nflverse. The only measurement is data-catalog D5's: QB depth-1
   agreement of 68.8% (n = 32). It compares the app snapshot of 2026-09-05 (season 2026) against
   nflverse 2025 week 18, so offseason moves inflate it. It is a cross-season upper bound on
   disagreement, not a same-week agreement rate. The verdict must state plainly how much the pinned
   model leans on `dp`, because that is the input whose live source differs.

**Seasons.** Outcome seasons S = 2013–2025 (`MIN_DEPTH_SEASON` floor; 2025 is complete).
Season-totals years read:
- S−1 = 2012–2024 for incumbent priors;
- S = 2013–2025 for `weeklyPoints`;
- up to 2025 for Q5's S+1/S+2.

**Never read any family for a year > 2025.** The
in-progress 2026 depth file registers `inProgress: false` (Invariant 5's nflverse convention), so
the manifest guard alone cannot catch it; the loop bound plus a loader spy test (§7 T9) can.

### Questions (the verdict answers each with a measured result, or says plainly why not)

- **Q1 Timing.** Report the era agreement table above from the run, not the probe. Also report a
  sensitivity check: the hazard ladder's final model refitted with legacy checkpoints read from
  chart(w−1) instead of chart(w). Report-only; the primary analysis stays as §3.2.
- **Q2 Hazard.** Which features carry held-out signal for `pUp`? Pin the ladder's final model
  (§4.4).
- **Q3 Stickiness.** Same question for `pStay`; pin its final model.
- **Q4 ROS.** Does the chain's expected remaining-start fraction beat three baselines held-out:
  (a) the pooled chain (H0+S0), (b) the empirical per-depth-order rate, and (c) the app's current
  flat multiplier read as a start share (QB2 0.88, QB3+ 0.68, rookie 1.0)?
  - Report a paired ΔMAE with its label for (a) and (b).
  - For (c), report its MAE **only**, with no label. Against a population with a ~5%-per-game
    hazard the comparison is decided in advance, and reading a PPG multiplier as a start share is a
    framing, not an equivalence; the verdict says both.
  - The verdict must also note **selection optimism**: the ladder chose the features using every
    season's LOSO result, and Q4 is evaluated on those same seasons.
- **Q5 Dynasty (report-only, no constant).** For drafted QBs (draftOvr ≤ 100, entry classes
  2013–2023): does rookie-season sitting beyond what the chain predicts from week 1 relate to next-
  and S+2-season primary-passer share and PPG? Show tables with n; Anton decides on the "mild
  discount".
- **Q6 Raw rates.** Show the unmodelled event/trial table by draft group × rookie × prior-start
  state, and by depth order (`d1`/`d2`/`d3`, by era). Data over verdicts: this table ships in the
  verdict whatever the ladder picks.

**Review-driven population change (flag 5).** The hazard population includes **order-1
non-incumbents** (`dp = d1`). The live probe found 527 such entries with 156 events (29.6%): a
backup already promoted to chart QB1, or a displaced starter listed first. Leaving them out would
drop a third of all takeover events, and would leave P6b with no P(start) for a Sleeper QB1 who did
not start last game.

---

## 1. Touch list

| File | Change |
|---|---|
| `lib/qbTakeover.mjs` | **new**, pure, no I/O (§3, §4) |
| `scripts/qb-takeover-run.mjs` | **new**, adapter with injectable loaders (§5) |
| `bin/backtest.mjs` | add `--qb-takeover` mode: import, dispatch, header doc (§5.4). **CR-25 trigger** (§8) |
| `package.json` | add script `"backtest:qb-takeover": "node bin/backtest.mjs --qb-takeover"` |
| `test/qb-takeover.test.mjs` | **new** (§7) |
| `backtests/<date>-qb-takeover-{panel,constants}.json`, `grading/<date>-qb-takeover-verdict.md` | run output, committed (§6). Unregistered, the documented Invariant 3 exception for analysis artifacts |
| `README.md` | Module notes paragraph + `--qb-takeover` in the backtest CLI flags (§9) |
| `CLAUDE.md` | It is **24,986 / 25,000 bytes**, so the prune below is mandatory and lands in the same commit. **Additions:** <ul><li>Commands-table Backtest cell: append `; --qb-takeover (QB takeover fit)`</li><li>"Other shortcuts" line: add `` `backtest:qb-takeover` `` after `` `backtest:inseason` ``</li><li>`lib/backtest.mjs` row: append `; lib/qbTakeover.mjs is --qb-takeover's pure fit`</li><li>`scripts/backtest-run.mjs` row: after `` `scripts/backtest-run.mjs` (advstats) `` insert `` , `qb-takeover-run.mjs` (`--qb-takeover`) `` (not after `--dynasty`, where the sentence goes on to claim a `lib/rookieMirror.mjs` reach)</li></ul>**Prune (move, not delete):** <ul><li>From the `lib/panel.mjs` row, move the sentence beginning "`resolvePosition` gains a season-independent crosswalk fallback" through "(finding 3)." verbatim to the end of README → Module notes → "`lib/panel.mjs` — dispatch lists and the in-season seams", collapsing the double space it leaves.</li><li>From the `lib/projectionFactors.mjs` row, move "; `compBlend` is a stated architecture deviation — a synthetic ratio factor, since the app's comp blend is a post-hoc convex combination, not a multiplier" verbatim to the same README subsection, as a sentence of its own.</li></ul>`test/claudeMdSize.test.mjs` must pass |
| `README.md` (prune target) | receives the two moved sentences above |

**Do not edit:** `lib/inSeasonEvidence.mjs`, `scripts/inseason-run.mjs`, `lib/nflverse.mjs`,
`lib/panel.mjs`, `lib/projectionFactors.mjs`, `cross-repo-registry.md`, `data-catalog.md`, any
served file, or `manifest.json`. Imports from the first three are allowed: `IN_SEASON_DEFAULTS`,
`mulberry32`, `clusteredBootstrap`, `bootstrapPairedMean`, `compareLabel`, `bySeason`,
`ageOnDate`, `INSEASON_LOAD`, `guardLoad`, `eraTeam`, and `DEPTH_ESPN_FROM_SEASON`.

---

## 2. Definitions

- **Team-game sequence.** For each S and era-coded team T, take the REG games from
  `nflverse/schedule/<S>.json` (`gameType === 'REG'`) sorted by `week`. Index them g = 1..G_T.
  Byes are skipped: transitions are game-to-game, never calendar-week.
- **Dropbacks** = `attempts + sacksSuffered` (absent key = 0) on a gamelogs REG game row.
- **Checkpoint for game g.** The state known before game g: everything from games 1..g−1, plus
  the depth chart chosen by §3.2.

---

## 3. `lib/qbTakeover.mjs` — data primitives

### 3.1 `primaryPassers(gamelogsFile, S) → Map<"${T}|${week}", { pid, dropbacks, attempts }>`

- Iterate all players' `games` with `seasonType === 'REG'` and `dropbacks > 0`. Do not filter on
  the player's `position`. A non-QB trick-play pass never out-throws a real passer, and filtering
  would drop mis-positioned QBs.
- Key `${eraTeam(g.team, S)}|${g.week}`, keeping the max dropbacks. Tie-break: more `attempts`,
  then lexicographically smaller `pid`, so the result is deterministic and test-pinned.
- A team-game with no entry has no primary. Its rows are skipped and counted in the run's
  `coverage` (§5.2).

### 3.2 `checkpointChart(depthFile, S, T, weeks, i, { espnFrom = DEPTH_ESPN_FROM_SEASON }) → (string|null)[] | null`

`weeks` is team T's sorted REG week list and i is the 0-based game index.
- **Legacy (S < espnFrom):** `depthFile.weeks[weeks[i]]?.[T]?.QB`.
- **ESPN (S ≥ espnFrom):** use `depthFile.weeks[weeks[i] − 1]?.[T]?.QB` when present. That is the
  chart for the calendar week just before game g's week. After a bye it is the team's own bye-week
  chart, which is still pre-game; the reviewer found it present for 32/32 post-bye ESPN-era games,
  because depth buckets on the league-wide gameday index. Otherwise fall back to
  `depthFile.weeks[weeks[i−1]]?.[T]?.QB`. At i = 0 in the ESPN era return `null`: there is no
  pre-game chart, and those rows are excluded and counted.
- The `espnFrom` default must equal `DEPTH_ESPN_FROM_SEASON`; import it from `lib/nflverse.mjs`
  rather than duplicating it. If it is not exported, stop and report.
- `null` array entries are **unknown, never dropped or re-indexed** (data-catalog D5). Depth order
  of id x = `array.indexOf(x) + 1`.
- Signature note: pass `T` as an explicit argument (`checkpointChart(depthFile, S, T, weeks, i, opts)`).

### 3.3 Row assembly (pure, given loaded files)

`buildRows({ S, gamelogs, schedule, depth, seasonTotals, seasonTotalsPrev, bySleeper, espnFrom = DEPTH_ESPN_FROM_SEASON })
→ { hazard: HazardRow[], stick: StickRow[], g1: HazardRow[], excluded: {...counts}, agreement: {...} }`

For each team T and game index i (g = i + 1) with a primary passer P_g:
- **Incumbent** `inc`:
  - g ≥ 2: P_{g−1}.pid. If game g−1 has no primary passer, skip game g for T and count it in
    `excluded.noPrevPrimary`.
  - g = 1: chart index 0 of the checkpoint chart. If null or missing, skip the team's g = 1 rows
    and count them.
- **Hazard population:** every non-null id x in the checkpoint chart at **any order** with
  x ≠ inc (flag 5: order-1 non-incumbents are rows with `dp = d1`).
  - Outcome `y = (P_g.pid === x) ? 1 : 0`.
  - g = 1 rows go to `g1`, not `hazard`. They feed Q4/Q5 starting states and a report-only rate,
    but are never fitted. Reason: they have no in-season incumbent evidence and only 13 events.
- **Stickiness population (g ≥ 2):** `inc` is a **backup-origin starter**, meaning `inc` ≠ P_1.pid
  (not the team's game-1 primary passer). Outcome `y = (P_g.pid === inc) ? 1 : 0`.
  - If P_1 is missing, T's whole season is excluded from stickiness (`excluded.noGame1Primary`).
  - A primary-less game breaks the `st` streak.
- `agreement`: for every g ≥ 2 with a non-null chart index 0, record two flags per era:
  chart-index-0 === P_g.pid and chart-index-0 === P_{g−1}.pid, using chart(w) in **both** eras,
  i.e. the raw week chart rather than the checkpoint rule. This is Q1.

Row fields (both populations): `{ S, team, g, week, pid, cluster: \`${S}|${team}\`, y, f: {feature codes §3.4} }`,
plus in-memory raw values `draftOvr, age, incPPG, incRel, benched, winPct, depthOrder`.
- `age` = `ageOnDate(birthdate, \`${S}-09-01\`)`, the 2c convention, recorded in `definitions`.
- Raw rows **never reach a committed artifact** (§6.1).

### 3.4 Features: codes and bins (all pre-registered here)

**Hazard features:**

| Key | Levels (code 0 = reference) | Definition |
|---|---|---|
| `dg` draft group | `udfa`(0), `day3`(1), `day2`(2), `r1`(3), `top12`(4) | from `bySleeper[x]`: `undrafted === true` or `draftOvr == null` → udfa; ≤12 top12; ≤32 r1; ≤100 day2; else day3. **No `bySleeper` row → row excluded** (`excluded.noCrosswalk`) |
| `rk` rookie | `vet`(0), `rookie`(1) | rookie iff `draftYear === S` |
| `ps` prior start | `first`(0), `re`(1) | `re` iff x was primary passer of any team-game of S (any team) whose calendar `week` < the week of game g. Calendar week, not game index, because index g means different times on different teams |
| `iq` incumbent quality | `mid`(0), `weak`(1), `strong`(2), `unknown`(3) | `incRel` = incPPG ÷ the median incPPG over **all teams' incumbents as of calendar week w**, where w is game g's week. Each team's incumbent at w is the primary of its last game with week < w, and incPPG uses obs weeks < w; teams with null incPPG are left out of the median. This set is reproducible live and does not leak across byes. Cutpoints: `weak` < 0.85 ≤ `mid` ≤ 1.10 < `strong`. `unknown` when incPPG is null or no median exists. **At g = 1** (w = the team's first week), the incumbent is chart index 0, his incPPG is his S−1 prior, and the median is taken over every team's week-1 chart-index-0 QB's S−1 prior (null priors left out) |
| `bn` benched | `b0`(0) 0–2, `b1`(1) 3–7, `b2`(2) 8+ | count of team T's games 1..g−1 in which x appeared, non-incumbent, in that game's checkpoint chart and was not primary. ESPN-era counts start at game 2 (no game-1 checkpoint), a one-game offset recorded in `definitions.bnEraOffset` |
| `wk` season stage | `early`(0) g ≤ 6, `mid`(1) 7–12, `late`(2) ≥ 13 | g (team-game index, not calendar week) |
| `dp` depth order | `d2`(0), `d1`(1), `d3`(2) ≥3 | order in the checkpoint chart (`d1` = order-1 non-incumbent, flag 5) |
| `wp` win% | `mid`(0) 0.35–0.65, `losing`(1) < 0.35, `winning`(2) > 0.65 | team T's wins ÷ games over games 1..g−1 from schedule `homeScore`/`awayScore` (a tie counts 0.5). At g ≥ 2 it always exists; **g = 1 → `mid`** |
| `og` original starter | `no`(0), `yes`(1) | `yes` iff x === P_1.pid, i.e. the team's game-1 primary passer coming back (round 2 flag 3: 61% of `d1` rows and 65% of their events). Lets the ladder separate "injured starter returns" from a backup takeover |

**incPPG** (the incumbent's quality, a 2a-style posterior):
- Inputs: prior = his S−1 season-totals PPG (`fantasyPoints / gamesPlayed`, gp ≥ 4, else null);
  obs = mean of his S `weeklyPoints` over weeks < the week of game g; n = count of those weeks.
- If prior is non-null: `(prior·k + obs·n)/(k + n)` with **k = 3, a fixed constant of this
  definition** (`QB_TAKEOVER_DEFAULTS.incK`, recorded in `definitions.incPPG`). If n = 0, use the
  prior.
- If prior is null: obs if n ≥ 2, else null.
- Review decision (flag 2): this is a **self-contained data-side definition**, *not* the app's
  displayed posterior. The 2a k was fitted on the reconstructed projection prior with gp ≥ 8, and
  has separate SHORT/rookie cells. k = 3 matches 2a's veteran QB value only numerically, and is not
  read from that file. P6b recomputes incPPG from these exact inputs. There is no CR-25 dependency.

**Stickiness features:**
- `st` streak: `s1`(0) = 1 consecutive start, `s2`(1) = 2–3, `s3`(2) = 4+. These are consecutive
  primary games ending at g−1.
- `dg3` collapsed draft group: `late`(0) day3 + udfa, `day2`(1), `r1`(2) top12 + r1. Collapsed
  because 1,319 rows cannot carry five levels.
- `rk` rookie: same as hazard.
- `dq` displaced quality: the `iq` bins applied to the **game-1 primary passer's** incPPG at this
  checkpoint (he is the incumbent who may return).

---

## 4. `lib/qbTakeover.mjs` — fitting

### 4.1 Pattern tables (the sufficient statistics)

`patternTable(rows, keys)` → array `[S, ...codes(keys), trials, events]`, sorted lexicographically,
one entry per distinct (S, codes). `keys` is the full feature list for that model family:
- hazard: `dg, rk, ps, iq, bn, wk, dp, wp, og`
- stickiness: `st, dg3, rk, dq`

Any sub-model is fitted from this table by summing over the omitted keys. The fit must therefore
take only the table as input: `fitFromPatterns(table, keys, usedKeys, opts)`. The row-level path
and the table path must agree exactly (§7 T4).

### 4.2 `fitLogistic(patterns, usedKeys, { lambda = 1.0, maxIter = 100, tol = 1e-10 })`

- Design: an intercept, plus one-hot dummies for every non-reference level of each used key.
- Binomial log-likelihood over patterns (trials, events), minus `lambda/2 · Σ β²` over
  **non-intercept** coefficients.
- Newton–Raphson with the exact Hessian, solved by Gaussian elimination with partial pivoting.
  Write the solver in the file; no dependency.
- Converged when max |Δβ| < tol. If not converged after maxIter, throw.
- Returns `{ coef: { intercept, '<key>=<level>': β, … }, iterations, logLik }`.
- Coefficients are stored unrounded in the panel. Constants store them `Math.round(β·1e4)/1e4`,
  and §7 T5 checks the rounding.
- λ = 1.0 is pre-registered. Without it, a fold whose training set has zero events in a cell
  (e.g. top12 rookies) diverges. It is not tuned.

`predict(model, codes) = 1/(1+exp(−(intercept + Σ β)))`

### 4.3 Held-out scoring

- `losoLogistic(rows, keys)` uses the `bySeason` grouping. Per held-out S, fit on the other
  seasons' **pattern table** and predict each held-out row.
- Per-row log-loss: `−[y·ln p + (1−y)·ln(1−p)]` with p clipped to [1e-6, 1−1e-6].
- Paired comparison of model B vs A:
  - per-row diff = ll_B − ll_A;
  - CI = `bootstrapPairedMean(rows.map(r => r.cluster), diffs, IN_SEASON_DEFAULTS.bootstrap)`.
    Clusters are **team-seasons**, because a team-season's rows share incumbent and outcome
    history;
  - label = `compareLabel(ci95)` (BEATS = CI entirely < 0).
- Also report pooled held-out Brier score and calibration by decile of p (rows, mean p, mean y).

### 4.4 Pre-registered forward ladders (Session 2 applies; never reorders)

`forwardLadder(rows, candidates)`:
1. Start with F = {} (intercept only).
2. For each candidate c in order, compare LOSO(F ∪ {c}) against LOSO(F).
3. Adopt c iff the label is BEATS. Record `{ c, mean, ci95, label, adopted }` every time.

A candidate is never revisited. Do **not** reuse `ladderPick`: it compares alternatives by MAE,
and log-loss is the right loss for a probability.

- **Hazard order:** `dp`, `og`, `dg`, `ps`, `rk`, `iq`, `bn`, `wk`, `wp`. (`og` comes right after `dp`, so
  that the returning-starter effect is not credited to Anton's factors.)
  - `dp` is first. Once the population includes `d1` (event rate ~30% vs ~5%), chart order is the
    dominant signal, and it is the one input P6b always has live (Sleeper `depth_chart_order`).
    Testing Anton's factors *after* it asks the question that matters: do they add anything beyond
    the chart?
  - Then come Anton's three factors: prospect via draft capital, the prior-start state (about 2×
    in the raw table), rookie, incumbent, benched. `wk` and `wp` are optional.
  - Transport caveat: §0 fact 6.
- **Stickiness order:** `st`, `dg3`, `dq`, `rk`.

**Final model per family** = the ladder's F. Refit on **all** seasons' pattern table; those are the
pinned coefficients.

### 4.5 The chain (Q4, and the function P6b ports)

`expectedStarts({ hazard, stick, start, remaining })`:
- `start` gives the hazard codes at the first remaining game and the stickiness codes to use once
  the player is starter.
- **Exact forward recursion over an expanded state space** (flag 6; no Monte Carlo, no occupancy
  approximation). State = (role, ps, c, s):
  - role ∈ {B, S};
  - ps ∈ {first, re} for B;
  - c = benched count, capped at 8 (enough for every `bn` bin);
  - s = current streak, capped at 4, for S.

  That is 9 (B, first) + 9 (B, re) + 9 × 4 (S, carrying c so a demoted starter resumes his count)
  = 54 states.
- Transitions into game j, where the `wk` code is computed from that game's index:
  - **(B, ps, c)** → starter with p = `pUp(codes with ps, bn(c))`, landing in (S, c, s = 1);
    otherwise stays B with (ps, min(c+1, 8)).
  - **(S, c, s)** → stays starter with p = `pStay(st(s), …)`, moving to (S, c, min(s+1, 4));
    otherwise drops to (B, re, c) with **no increment**. In the demotion game he was the incumbent
    (P_{g−1}), and §3.4 `bn` counts only non-incumbent games (round 2 flag 2).
- Held at checkpoint values: `iq`, `dq`, `wp`, `dg`/`dg3`, `rk`, `dp`, and `og`. A demoted starter
  re-enters B at the checkpoint `dp`, a stated simplification.
- **Returning original starter (`og = yes`).** Once he is starter again, the chain uses the
  backup-origin `pStay` with `dq = unknown`. That is an approximation, since the stickiness model
  is fitted only on backup-origin starters, and it is stated in the `chain` block.
- `expected` = Σ_j P(role = S at game j). Returns `{ perGame, expected, fraction: expected/remaining }`.
- The state definition and transition rules are written verbatim into the constants file's `chain`
  block, and P6b ports them verbatim.

---

## 5. `scripts/qb-takeover-run.mjs`

### 5.1 Loaders

- `QB_TAKEOVER_LOAD = INSEASON_LOAD` (it already carries season-totals, gamelogs, schedule, depth,
  playerids and the manifest). No constants-file loader is needed (flag 2).
- Wrap with `guardLoad`. It memoises and refuses `inProgress` season-totals/gamelogs, and enforces
  `maxLoadSeason` on those two **only**. depth/2026 and schedule/2026 register `inProgress: false`,
  so only the loop bounds keep them out.
- `runQbTakeover` requests:
  - depth/schedule/gamelogs only for S ∈ [2013, 2025];
  - season-totals only for years in [2012, 2025].

  §7 T9 spies this.

### 5.2 `runQbTakeover({ load = QB_TAKEOVER_LOAD, defaults = QB_TAKEOVER_DEFAULTS, log = () => {} })`

1. **Coverage.** For each S, the fraction of schedule REG team-games with a primary passer.
   **Stop** (throw `CoverageStop`, write nothing, CLI exit 1) if any season has a rate < 0.99, a
   **zero REG team-game denominator**, or a non-finite rate (flag 8: a schedule field rename
   must not pass as NaN). The probe measured 0.9988 pooled. Report per-season numbers either way.
2. Build rows per S (§3.3). Two passes are needed: first the per-(S, calendar week) incumbent
   incPPG medians over all teams, then the rows.
3. Q1 agreement table plus the legacy chart(w−1) sensitivity: rebuild the hazard rows with
   `espnFrom = 2013`, fit the ladder-final keys, and report pooled LOSO log-loss in both versions.
4. Q6 raw tables, including `d1` split by `og` and by era.
5. Hazard ladder and stickiness ladder (§4.4), then the final refits.
6. **Q4.** Take the hazard rows with ≥ 4 remaining team games, g from 2 to G_T−3 (2a's
   `minRosGames = 4`).
   - Actual: the fraction of games g..G_T in which x was primary.
   - Predicted: LOSO `expectedStarts` from fold-fitted final models.
   - Baselines:
     - (a) the pooled chain, H0 + S0 fitted per fold;
     - (b) the per-depth-order empirical fraction, fitted per fold;
     - (c) the constant 0.88 / 0.68, or 1.0 for `rk = rookie`.
   - Paired ΔMAE with team-season clusters via `bootstrapPairedMean` + `compareLabel` for (a) and
     (b). For (c), MAE only, with no label (§0 Q4).
   - Report pooled, by `dg`, and **pooled excluding `og = yes` rows** (round 2 flag 3).
7. **Q5** (report-only).
   - Population: drafted QBs with draftOvr ≤ 100 and draftYear ∈ [2013, 2023] who appear in a g = 1
     row (S = draftYear) or first appear as a hazard row in their rookie season.
   - Expected rookie-season starts: from their first rookie-season row via `expectedStarts` with the
     final models.
   - Actual: primary games from that row's game g to the season's end (not the full season, which
     would bias a benched game-1 starter into `earlier`).
   - Residual group: `sat-longer` if actual < expected − 1, `on-track` within ±1, `earlier` if
     > +1.
   - For each group report n, the S+1 primary-game share (S+1 schedule/gamelogs, ≤ 2025) and the
     S+1 PPG (season-totals, gp ≥ 4). Repeat for S+2 (≤ 2025).
   - Also give the same breakdown by `dg`. **No constant is pinned from Q5.**
8. Assemble `{ panel, constants, verdictInput }`.

### 5.3 Artifact writing

`writeQbTakeoverArtifacts({ result, verdictMd })` copies the 2a order exactly
(`scripts/inseason-run.mjs:1606–1620`):
1. Serialise all three artifacts.
2. Check the caps: panel 5 MB, constants 300 KB.
3. Throw before writing anything if a cap trips.
4. Then `fs.writeFileSync` each one.

Do **not** use `writeJsonStable`, which writes immediately. The constants text comes from a new
`formatQbTakeoverConstantsJson(file)`: one line per top-level key, and one line per pattern array
in `fixture`, so diffs are readable. `formatConstantsJson` destructures the 2a shape and cannot be
reused.

### 5.4 `bin/backtest.mjs --qb-takeover`

- Accepts only `--json` and `--write`. Any other `--` flag → error, **exit 1**, mirroring the live
  `--inseason` rejection at `bin/backtest.mjs:174–181` (`rejected = args.filter(...)`).
- Dispatch `--qb-takeover` **before** the `--inseason` and bare-`--dynasty` branches, so
  `--qb-takeover --dynasty` reaches this rejection rather than `--dynasty requires --inseason`.
- `CoverageStop` → exit 1, no artifacts.
- Add a header usage block like the `--inseason` one.
- **Seam** (flag 11, mirrors `inSeasonMain` at `scripts/inseason-run.mjs:1631–1651`):
  `export function qbTakeoverMain({ load = QB_TAKEOVER_LOAD, write = false, asJson = false, writeArtifacts = writeQbTakeoverArtifacts, log = console.log, logErr = console.error })`.
  - It returns 1 on `CoverageStop` (logged via `logErr`) and 0 otherwise.
  - Like `inseason-run.mjs:1638–1643`, it **always** builds `buildQbTakeoverVerdictMarkdown(result)`,
    calls `writeArtifacts` only when `write` is set, then does
    `log(asJson ? JSON.stringify(...) : verdictMd)`.
  - The bin does `process.exit(qbTakeoverMain({ write, asJson }))` with the reject list
    `['--qb-takeover', '--json', '--write']`, placed before `bin/backtest.mjs:174`.

---

## 6. Outputs (`--write`; `<date>` = UTC run date)

### 6.1 `backtests/<date>-qb-takeover-panel.json`

**No per-player records** (flag 13; CR-09's Mirror bars per-player values from the sanctioned
analytical reads, and the 2a panel has none).

Contents:
- the full-key pattern tables (hazard + stickiness, per S);
- ladders with every step;
- per-fold coefficients;
- calibration tables;
- Q1/Q4/Q5/Q6 aggregate tables (Q5 by group only, never named players);
- coverage and excluded counts.

Analysis-only: never app-read (§8 CR-09).

### 6.2 `backtests/<date>-qb-takeover-constants.json` — the file P6b pins

```json
{
  "source": "sleeper-dashboard-data backtests/<date>-qb-takeover-constants.json (node bin/backtest.mjs --qb-takeover --write)",
  "generatedAt": "…", "basis": "half_ppr",
  "definitions": {
    "primaryPasser": "max(attempts+sacksSuffered) per team-game, REG; ties: attempts, then pid",
    "population": "…§3.3 verbatim…", "checkpoint": {"legacy": "chart(week of game g)", "espn": "chart(week of game g − 1) if present, else chart(week of previous team game)", "espnFrom": 2025}, "bnEraOffset": "ESPN-era bn counts start at game 2",
    "teamDomain": "gamelogs eraTeam()-mapped to schedule/depth era codes",
    "incPPG": {"k": 3, "priorMinGames": 4, "obsMinGamesNoPrior": 2, "medianSlice": "all teams' incumbents as of calendar week w"}, "ageRefDate": "S-09-01",
    "bins": {"…": "every §3.4 cutpoint and level list"}, "lambda": 1.0
  },
  "hazard": {"features": ["…ladder F…"], "coef": {"intercept": 0, "dg=top12": 0}, "rows": 0, "events": 0, "ladder": []},
  "stickiness": {"features": [], "coef": {}, "rows": 0, "events": 0, "ladder": []},
  "chain": {"states": "…§4.5 state definition verbatim…", "transitions": "…§4.5 verbatim…"},
  "q4": {"pooled": {"maeChain": 0, "vsPooled": {}, "vsDepthRate": {}, "maeAppFlat": 0}},
  "fixture": {"hazardKeys": ["dg","rk","ps","iq","bn","wk","dp","wp","og"], "hazardPatterns": [], "stickKeys": ["st","dg3","rk","dq"], "stickPatterns": []},
  "verification": {"refitFromFixture": "exact (|Δβ| < 1e-9)"}
}
```

The values shown are placeholders for shape only. `verification` is computed in-run: refit the
final models from `fixture` and assert agreement before writing.

### 6.3 `grading/<date>-qb-takeover-verdict.md`

- Sections Q1–Q6, each with numbers and n.
- Ladder tables.
- The pinned coefficients **and** a plain-language table of `pUp` for representative cases:
  top-12 rookie vs day-3 vet, weak vs strong incumbent, b0 vs b2, all at `wk=mid`.
- A "For P6b" section listing every input P6b must compute live, the transport caveats
  (Sleeper vs nflverse depth, with the cross-season caveat of §0 fact 6; Sleeper's live depth order
  is the app's only `dp` source; `iq` is a ratio to the all-teams median, so the half-PPR vs league
  basis cancels to first order), and "what
  this does NOT model" (injury status, coach changes, trades after the checkpoint).
- `**Reproduce:** node bin/backtest.mjs --qb-takeover --write`.

---

## 7. Tests — `test/qb-takeover.test.mjs` (fixture loaders only, except T10)

- **T1 primaryPassers.** Max dropbacks; tie-break attempts, then pid; `eraTeam` applied (a 2015 `LA`
  row keys as `STL|w`); `dropbacks = 0` rows ignored.
- **T2 checkpointChart.**
  - legacy reads chart(w);
  - ESPN reads chart(w − 1) when present, including a post-bye game reading the team's own
    bye-week chart;
  - ESPN falls back to chart(previous team game's week) when chart(w − 1) is absent;
  - ESPN i = 0 → null;
  - null entries keep their index (depth order of the id after a null = its index + 1).
- **T3 Row assembly** on a synthetic 2-team season:
  - hazard/stick/g1 membership;
  - an order-1 non-incumbent becomes a `dp = d1` hazard row;
  - `ps` flips to `re` after a start on another team in an earlier **calendar week**, even when
    that team's game index is higher;
  - `ps` does **not** flip for a start in the same or a later calendar week;
  - `bn` counts only non-incumbent chart games where x was not primary;
  - `incRel` uses the all-teams median as of the calendar week: a bye team's incumbent is included
    with obs weeks < w only;
  - a primary-less game g−1 → `excluded.noPrevPrimary`, and that game breaks the `st` streak;
  - missing P_1 → `excluded.noGame1Primary`;
  - the demotion game does **not** increment the demoted starter's `bn`;
  - `og = yes` for P_1 listed at chart order 1 after missing games;
  - g = 1 codes: `wp = mid`, and `iq` from the week-1 prior median;
  - win% ties count 0.5;
  - missing crosswalk → excluded count.
- **T4 Pattern sufficiency.** Fitting from rows equals fitting from `patternTable` (|Δβ| < 1e-12).
  Marginalising the full-key table to a sub-key model equals building the sub-key table directly.
- **T5 fitLogistic.**
  - On a 2-level single-feature table with known counts and λ = 0, β equals the closed-form log-odds
    difference.
  - With λ > 0 the coefficient shrinks toward 0.
  - A zero-event cell converges with λ = 1.
  - Non-convergence throws.
  - Rounding to 1e-4 is applied only in the constants.
- **T6 forwardLadder.** Synthetic rows where feature A carries signal and B is noise: A adopted,
  B not; every step recorded; order respected (a later candidate never displaces an adopted one).
- **T7 expectedStarts.**
  - Hand-computed 3-game recursion over the expanded states, with pUp depending on `ps` and `bn`
    and pStay on `st`. The expected value equals a brute-force enumeration of all 2³ role paths.
  - A demoted starter re-enters (B, re) with its count **unchanged**.
  - `c` caps at 8 and `s` caps at 4.
  - Probability mass sums to 1 every game.
  - fraction = expected/remaining.
- **T8 incPPG.**
  - prior-only at n = 0;
  - posterior with k = 3 (`QB_TAKEOVER_DEFAULTS.incK`);
  - no prior and n < 2 → null → `iq = unknown`.
- **T9 Loader ceiling.** A spy load records every requested year.
  - No year > 2025 is requested for any family.
  - Specifically, no depth or schedule 2026 read.
  - Season-totals years ⊆ [2012, 2025].
  - A stub manifest marking a gamelogs year `inProgress` throws via `guardLoad`.
- **T10 Live smoke (read-only, the only live-store test).**
  - `runQbTakeover()` on the real store completes without `CoverageStop`;
  - hazard rows within ±5% of 9,400, events within ±5% of 606 (reviewer probe: order ≥ 2 rows
    8,873 / 450, plus `d1` rows 527 / 156, before the bye-chart rule). If outside the band, stop
    and report the actual numbers rather than retuning;
  - the constants `verification` is exact.
  - Skip with a message if `nflverse/depth/2013.json` is absent.
  - Mark it `{ timeout: 600_000 }`. If the runtime exceeds 60 s, report that in the hand-back
    rather than shrinking the test.
- **T11 CLI.** Through `qbTakeoverMain` with an injected `load` and a spy `writeArtifacts`, as
  `test/inseason.test.mjs:480–483` does for `inSeasonMain`:
  - `CoverageStop` → returns 1 and `writeArtifacts` is never called;
  - success with `write: true` → returns 0 and the spy is called once.

  The bin-level reject list (`--qb-takeover --dynasty` → exit 1) is asserted with a `spawnSync`
  of `bin/backtest.mjs`. It must reject before any load.
- **T12 Coverage stop edge cases.** A season with zero REG team-games, or one whose rate is NaN,
  throws `CoverageStop`. A rate of exactly 0.99 passes.
- **T13 Writer.** A panel over the cap throws before **any** file is written (assert on a temp
  directory).

---

## 8. Cross-repo impact

Machine check (Session 1, `lib/registry.mjs` over every entry's data-side `Triggers`, against
`bin/backtest.mjs`, `lib/inSeasonEvidence.mjs`, `scripts/inseason-run.mjs`, `eraTeam`,
`nflverse/depth`, `playerids`, `backtests/`) found:

### CR-25 · In-season evidence definitions and fitted k — **fires** (`bin/backtest.mjs` is a listed data-side trigger)

No CR-25 definition, k, or fit rule changes. The new mode only adds a dispatch branch. Mirror text,
verbatim:

> An app-side change to any mirrored definition stales every fitted k: mirror the definition into `lib/inSeasonEvidence.mjs` (never into the frozen `PHASE1_K`), re-run `node bin/backtest.mjs --inseason --write`, and re-pin from the new constants file — never hand-edit a `K_*`. The dynasty-side 2c k (`--inseason --dynasty`) also mirror the prospect prior and the SHORT history slot: a change to `POSITION_PRIOR_PPG`, the age or draft multipliers, the completed-season blend, the prospect-path gate, the rookie-draft pick source or `recencyWeightedPPG` re-fits them via `node bin/backtest.mjs --inseason --dynasty --write`. The data side approximates the league's rookie-draft pick from NFL draft order (skill-position rank into a 12-team, 5-round draft) and ages players on 1 September; both are stated in that constants file's `fit`, and neither is an app definition. A data-side change to the fit (grid, loss, rounding, checkpoints, arms, prior, the pin rules in `buildConstants`/`decideOwnVsPooled`/`ladderPick`) writes a new dated constants file; the app keeps its pinned copy until it deliberately re-pins by copying that file byte-for-byte with its data commit SHA, and a re-pin re-checks `PRIOR_MODEL_FROM` (a frozen prior captured before the current model is refused — CR-26). An app-side model change bumps `PRIOR_MODEL_FROM` at once; if it also changes a CR-15-mirrored factor, the k are stale until re-fitted — a bump is not a re-fit. The Q4 NO-GAIN pooled-pin *decision* (own k BEATS pooled out of sample) is taken and tested data-side; the app's provenance test checks only which fixture cell each `k` re-derives from. These k partly compensate for the projection's known optimism (c ≈ 0.80–0.86): correcting that optimism is a re-fit, not a re-pin. The definitions flow app→data and the constants data→app. **Nothing fails in either repo when this drifts** — the app blends with constants fitted under definitions it no longer uses. Later consumers (the rest-of-season posterior grader) extend this entry rather than adding another. Since in-season-evidence-2c-wiring the app applies the 2c verdict's reuse rows (arm B at the 2a rookie k, SHORT-recent at `K_DYN_POINTS_HISTORY`); a data-side run that pins `K_DYN_PROSPECT_B_*` or `K_DYN_POINTS_SHORT_HISTORY` as new constants transports only after a deliberate app re-pin. The app's dynasty-side rookie prior holds `ktcMult` and `collegeContribution` at 1.0 to equal the data side's arm-B prior: porting either into the data reconstruction changes arm B and re-fits these k. Which `yearsExp` × position cells start from the projection (`PROSPECT_PRIOR_KIND`) follows a two-season (S+2) arm comparison on the 2c Q1 rows — only a WORSE cell keeps the position baseline; a cell flips only on a committed re-run of it. The second-year-WR arm-A k are pinned from the 2c panel's pooled YE1 fit (`IN_SEASON_DYN_PANEL_SOURCE`), not from a constants file, until the data side emits them. The no-market cap's placement (starting value only) was chosen on the 2c Q1 cap rows (cap-before BEATS cap-after, pooled −16.3 score points): a change to the cap or its placement re-runs that comparison.

**No coupling to CR-25's constants** (flag 2). `incPPG` uses its own fixed k = 3 and never reads
the 2a file.

### Registry drafts — companion file `.claude/tasks/qb-takeover-research-registry.md`

The companion holds every verbatim text this task emits through the two-session route
(data emits → app applies → data syncs). **This task edits no registry text.** Its contents:
- **CR-09** Mirror/Data-side/Triggers amendment (a second sanctioned analytical gamelogs read);
- **CR-27** new-entry draft (QB takeover constants; lands with P6b);
- **CR-08** data-side append (flag 17, pre-existing `[registry-stale]`);
- **CR-16** data-side consumer append (flag 18);
- the three signal-registry *Current use* row edits;
- the app backlog line.

Session 2 does not touch the companion. It is the input to the next registry-sync batch.

### Not fired

- **CR-15** (no factor mirror touched; `reconstructDepthFactor` is unchanged and unread).
- **CR-06** / **CR-18** (no ingest, draft or playerids change).
- **CR-21** (no live-season read).
- **CR-01** (no snapshot read).

---

## 9. Docs

- **README → Module notes.** One paragraph, mirroring the 2a paragraph:
  - what `--qb-takeover` fits;
  - the primary-passer definition;
  - the era-team mapping;
  - the checkpoint timing rule;
  - categorical features making the pattern table exact sufficient statistics;
  - LOSO log-loss and the team-season cluster bootstrap (4000 resamples, seed 12345, `mulberry32`);
  - the 0.99 coverage stop;
  - "no gamelogs points are read".
- **README → backtest flags:** add `--qb-takeover`.
- **CLAUDE.md:** §1 touch-list rows only.
- **`data-catalog.md`:** none. No family coverage, schema or gate changes, and consumption notes
  live in the app's signal registry (§8).

---

## 10. Done-definition and git

1. `npm test` green, including the new file and `test/claudeMdSize.test.mjs`.
2. `npm run smoke` green.
3. `node bin/backtest.mjs --qb-takeover --write` exits 0. Commit the three artifacts with the
   code, as separate commits: code + tests first, then artifacts. The constants commit SHA is
   what P6b pins.
4. `manifest.json` is unchanged (`git diff --stat manifest.json` empty).
5. `git pull --rebase origin main`, then `git push origin main` (never `--force`).
6. Hand back to Session 1, including:
   - the commit range and every file touched;
   - any deviation from this file;
   - what each test asserts;
   - the coverage per season;
   - the run's hazard/stick row and event counts;
   - both ladder tables;
   - Q4's three labels;
   - the T10 runtime.

**Stop and ask (do not improvise) if:**
- coverage < 0.99 in any season;
- `DEPTH_ESPN_FROM_SEASON` is not exported;
- any fold's logistic fit fails to converge at λ = 1;
- the T10 row counts fall outside ±5% of the probe;
- the hazard ladder adopts nothing (verdict = pooled rate; this is reportable, but confirm it before
  writing constants).

---

## 11. Findings for P6b (carried forward, not acted on here)

1. The app's rookie path hardcodes `depthFactor: 1.0` (`seasonProjection.js` ~l.492). The vet
   path's Step 8 is 1.05 / 0.88 / 0.68, mirrored by `reconstructDepthFactor` (CR-15). Replacing
   either is a CR-15 change and re-fits R3-FIT exponents before any activation (CR-15 Mirror).
2. P6b needs a live "primary passer last game" signal. Sleeper weekly rows provide pass attempts
   per player-week, which is the live analogue of §3.1. Verify the key in P6b.
3. g = 1 (pre-kickoff, e.g. Mendoza today) has no fitted model here (13 events). P6b uses the
   hazard model at `bn=b0`, `wk=early`, `ps=first`, `wp=mid`, `og=no`, with `iq` from the
   §3.4 g = 1 rule. That is extrapolation to g = 1, and the verdict reports the g = 1 raw rate beside it so the gap is
   visible.
4. ROS uses the starter PPG from the existing projection. The chain supplies only P(start).

---

## Review record — plan gate round 1 (2026-10-03)

plan-reviewer (full depth) raised 20 flags. It ran `node --test test/registry.test.mjs` (green,
2/2) and a live re-probe of §3.1/§3.3 (8,873 rows / 450 events at order ≥ 2; 6,806 / 6,814 team-games
with a primary). Anton delegates review calls, so Session 1 checked each flag against live source
and decided as follows. **All 20 were applied.**

| # | Flag (short) | Decision |
|---|---|---|
| 1 | T9 capped season-totals at 2024, but S weeklyPoints and Q5 read 2025 | Applied: season-totals ⊆ [2012, 2025]; T9 asserts no year > 2025 for any family, and no depth/schedule 2026 |
| 2 | incPPG ≠ the app's posterior; 2a k was fitted on a different prior/population | Applied: incPPG is self-contained with a fixed k = 3 (`QB_TAKEOVER_DEFAULTS.incK`); no read of the 2a file; CR-25 coupling removed |
| 3 | incRel median per (S, g) leaks across byes and can't be built live | Applied: median over all teams' incumbents as of calendar week w, obs weeks < w |
| 4 | `ps` "before game g, any team" ill-defined | Applied: calendar week < week of game g; T3 case added |
| 5 | Order-1 non-incumbents (527 rows, 156 events) were excluded | Applied: population widened, `dp = d1`; `dp` moved to first in the ladder (the dominant signal and the always-available live input). Verified: an order-2-only population would leave P6b without P(start) for a promoted Sleeper QB1 |
| 6 | Chain approximations under-specified | Applied: exact recursion over 54 expanded states (§4.5); T7 checks against brute-force enumeration |
| 7 | Q4 baseline (c) is a foregone strawman; selection optimism | Applied: (c) reports MAE only, no label; verdict notes selection optimism |
| 8 | Coverage stop is silent on a 0/NaN denominator | Applied: stop on zero/non-finite; T12 |
| 9 | Missing previous / game-1 primary unhandled | Applied: `excluded.noPrevPrimary`, `excluded.noGame1Primary`; the streak breaks |
| 10 | `writeJsonStable` writes before the cap check; `formatConstantsJson` shape-bound | Applied: serialise → cap → write (2a order); new `formatQbTakeoverConstantsJson`; T13 |
| 11 | CLI seam undefined | Applied: `qbTakeoverMain({...})` mirrors `inSeasonMain`; T11 rewritten |
| 12 | CLAUDE.md at 24,986 / 25,000 bytes | Verified (`wc -c`). Applied: exact additions plus a named prune that moves 2 sentences (~296 B) to README Module notes; shortcut added |
| 13 | Panel would carry per-player rows (CR-09) | Applied: the panel holds pattern tables and aggregates only |
| 14 | CR-09 amendment wording made the inseason sentence false for both readers | Applied: CR-09 Mirror quoted verbatim; a separate appended sentence (companion) |
| 15 | CR-27 draft had no Triggers | Applied (companion) |
| 16 | 68.8% is a cross-season comparison | Applied: restated in §0, CR-27 Mirror and the verdict caveat |
| 17 | CR-08 lacks the analytical schedule readers (`[registry-stale]`) | Applied: append emitted (companion); on the backlog line |
| 18 | CR-16 should record the new `eraTeam` consumer | Applied: append emitted with CR-16 Mirror verbatim (companion) |
| 19 | ESPN-era post-bye chart is fresher; `bn` era offset | Applied: chart(w−1) first, else the previous game's week; `definitions.bnEraOffset`; T2 |
| 20 | `age` reference date missing | Applied: `${S}-09-01` (2c convention) |

**Size.** The main file is ~42 KB after moving every registry draft into
`qb-takeover-research-registry.md` (8.8 KB). The remaining excess over the 40 KB signal is the
mandatory verbatim CR-25 Mirror (~3.5 KB) plus the test list. It is one analysis, with no natural
seam left to split on, so it is kept whole. Flagged to Anton.

**T10 band.** Re-based to ≈ 9,400 rows / ≈ 606 events for the widened population. Out-of-band is a
stop-and-report, never a retune.

## Review record — plan gate round 2 (2026-10-03, scoped)

plan-reviewer raised 7 flags, none blocking. It ran `test/registry.test.mjs` and
`test/claudeMdSize.test.mjs` (4/4 green), checked the three quoted Mirrors by string containment,
and re-probed live with the §3.2 ESPN rule: **9,397 rows / 605 events**, `d1` 527 / 156, 0 missing
crosswalk, and 0 ESPN fallbacks or nulls at g ≥ 2. All 7 flags plus its out-of-scope Q5 note were
applied:

| # | Flag | Decision |
|---|---|---|
| 1 | The CLAUDE.md insertion would claim qb-takeover reaches `rookieMirror` | Applied: insert after "`scripts/backtest-run.mjs` (advstats)"; collapse the double space |
| 2 | A demotion incremented `bn`, contradicting §3.4 | Applied: (B, re, c) with no increment; T7 and T3 updated |
| 3 | 61% of `d1` rows are the game-1 starter returning | Applied option (a), plus a pre-registered `og` feature second in the hazard ladder; the chain approximation is stated; Q4 is also reported excluding `og = yes`; Q6 splits `d1` by `og` |
| 4 | g = 1 codes undefined | Applied: `wp = mid`; `iq` from the week-1 chart-index-0 prior median; T3 case |
| 5 | Verdict built only on `write` | Applied: always build, write on `write`, log as `inSeasonMain` does |
| 6 | No `espnFrom` path in `buildRows`; §3.2 header lacked `T` | Applied |
| 7 | CR-27 Triggers/field order | Applied in the companion |
| — | §0 counts stale; Q5 actual counted the whole season | Applied |

No third automatic round. Remaining judgment items go to Anton: the slice size (~47 KB), and the
`dp`-first / `og` ordering.

---

## Verification record (2026-10-03)

**What was reviewed:** Session 2's hand-back, range `fadbc2e..75c9a80` (`3913d81` code/tests/docs,
`75c9a80` artifacts). implementation-reviewer read the diff.

**Checks run:**
- `npm test`: 1,248 passed, 0 failed, 4 skipped.
- Smoke: green.
- `--qb-takeover --json` re-run: panel identical apart from `generatedAt`; constants identical key by
  key; fixture refit difference ≤ 3.3e-16.
- Session 1 re-ran the fit independently: coefficients equal the committed file exactly.

**Deviations:** all six disclosed deviations were accepted.
- The row-count gap is the §3.3 exclusions themselves. The stickiness gap comes from
  `noGame1Primary` (TEN 2013/2014: 21 rows, 19 stays), not from `noPrevPrimary` as Session 2 guessed.
- All 8 primary-less team-games are TEN, in games where Jake Locker started (2013 g1–3/7–8, 2014
  g1–3). Session 1 checked the Fitzpatrick rows: Locker is unmapped in gamelogs (crosswalk
  attrition, `unmapped` 82 in 2013). 2013 coverage is 0.9902, so one more gap would trip the stop.

**Reviewer flag triage:**
- Flags 1, 2, 3, 5, 6, 7 and 9 → Fix pass 1 below.
- Flag 4 is not changed: the stickiness rows lack in-memory raw fields that nothing reads.
- Flag 8 is accepted: the README section sits beside the 2a section, which matches "mirroring the
  2a paragraph".

## Fix pass 1

Applied by fix-applier. **The pinned coefficients and fixture must not change.** Every item below
touches verdict text, `definitions` text, tests or CLAUDE.md only.

### 1. Verdict quantifies the dependence on `dp` (reviewer flag 1)

**Where:** `scripts/qb-takeover-run.mjs`, `buildQbTakeoverVerdictMarkdown`, the "For P6b" transport
bullet (~l.467).

**Change:** replace the "`dp` is / is NOT in the final hazard model" clause with a generated
sentence that lists every adopted hazard feature with its ladder Δ log-loss and CI, taken from
`result.ladders.hazard`. Example:

> "Ladder Δ log-loss per adopted feature: dp −0.0196 [−0.0242, −0.0148], og …, rk …, iq …; `dp` alone carries N× the next-largest gain."

N is computed as |Δ_dp| ÷ max |Δ| over the other adopted features, one decimal. If `dp` was not
adopted, keep the existing "NOT" wording.

### 2. Extrapolated g = 1 `pUp` beside the raw rate (reviewer flag 2)

**Where:** `scripts/qb-takeover-run.mjs`, where `g1Rate` is assembled, and the verdict's "Game-1
rows" subsection and §11.3 bullet (~l.468).

**Change:**
- For every g1 row, apply the **final** hazard model (all-season fit) to that row's own codes, which
  are already built per §3.4's g = 1 rules (`og = no`, `wp = mid`, `iq` from the week-1 rule).
- Report `meanPredicted` beside `events/rows`, pooled and by `dp`. Add it to the `g1Rate` object
  and to the `g1ByDepth` table as a `mean pUp` column.
- Rewrite the bullet's "the raw g = 1 rate above shows the gap" to quote both numbers.

### 3. Constants `definitions` completeness (reviewer flag 3)

**Where:** `scripts/qb-takeover-run.mjs`, `binsDefinition` (l.185–200) and `definitions.population`
(~l.335).

**Change:**
- **`iq`:** append `; at g = 1: incumbent = chart index 0, incPPG = his S−1 prior, median over every team's week-1 chart-index-0 QB's S−1 prior (null priors omitted)`.
- **`wp`:** insert `a tie counts 0.5;` before `g = 1 → mid`.
- **`population`:** replace the paraphrase with this exact text:

  > "Incumbent inc: g ≥ 2 → primary passer of game g−1 (game skipped if g−1 has none); g = 1 → chart index 0 of the checkpoint chart. Hazard: every non-null id x in the checkpoint chart at any order with x ≠ inc; y = 1 iff x is primary passer of game g; g = 1 rows are reported, never fitted. Stickiness (g ≥ 2): inc ≠ the team's game-1 primary passer (team-season excluded if game 1 has none); y = 1 iff inc is primary passer of game g; a primary-less game breaks the st streak. Excluded and counted: no crosswalk row, no primary in g, no primary in g−1, no checkpoint chart."

### 4. Primary-less team-games listed (reviewer flag 9)

**Where:** `scripts/qb-takeover-run.mjs` (coverage assembly) and the verdict's Coverage section.

**Change:**
- Add `coverage.missing: [{ S, team, g, week }]`, sorted by S, team, g, to the panel.
- Print it in the verdict under the coverage table, followed by one line giving each season's
  margin above the 0.99 floor.
- Generated data only. No player names are hard-coded; the Locker attribution lives in this task
  file.

### 5. T11 timing claim (reviewer flag 5)

**Where:** `test/qb-takeover.test.mjs:727–732`.

**Change:** delete the `t0` / `< 20_000` assertion, and rename the test to drop "before any load".
The exit-status and stderr assertions stay.

### 6. T7 streak cap (reviewer flag 6) — revised after fix-applier stop

`test/qb-takeover.test.mjs:527–529`. The first spec (an exact `stSeen` call sequence) was wrong.
`expectedStarts` (`lib/qbTakeover.mjs:646`) precomputes `pStay` once per `st` code, so `stick` is
called exactly 3 times whatever `remaining` is.

**Detect the cap through `perGame` instead:**
- `stick: (c) => [1, 1, 0.5][c.st]`, `hazard: () => 0`.
- Start `{ role: 'S', c: 0, s: 1, g: 1, hazardCodes: {}, stickCodes: {} }`, `remaining: 6`.
- Assert that `perGame` deep-equals `[1, 1, 1, 0.5, 0.25, 0.125]`, exact floats.

Hand derivation:
- s goes 1 → 2 → 3 → 4, with `st` codes 0, 1, 1 and pStay 1, so games 1–3 are 1.
- From s = 4 (`st` 2, pStay 0.5) the starter mass halves each game. The capped s stays 4, and the
  demoted mass sits in B with pUp 0.

Without the cap, `sIdx(0, 5)` aliases `sIdx(1, 1)` (`st` 0, pStay 1), so game 5 would read 0.5,
not 0.25. Keep the c-cap half of the test unchanged. If the asserted values differ, stop and report.

### 7. CLAUDE.md backticks (reviewer flag 7)

**Where:** `CLAUDE.md:16` and `:66`.

**Change:**
- Line 16: write `` `--qb-takeover` `` with backticks.
- Line 66: write `` `lib/qbTakeover.mjs` is `--qb-takeover`'s pure fit ``.
- `test/claudeMdSize.test.mjs` must stay green.

### 8. Re-run and commit

1. `npm test` and `npm run smoke` green.
2. `node bin/backtest.mjs --qb-takeover --write`.
   - **Assert before committing:** `hazard.coef`, `stickiness.coef`, `hazard.features`,
     `stickiness.features` and `fixture` are byte-identical to `75c9a80`'s constants. If not, stop.
   - If the UTC date is no longer 2026-10-03, the run writes a new dated trio. `git rm` the
     2026-10-03 trio in the same commit, so exactly one qb-takeover constants file exists.
3. Commit code/tests/CLAUDE.md, then the artifacts, as two commits.
4. `git pull --rebase origin main`, then `git push origin main`.
5. Hand back: the SHAs and the item-by-item diff summary. **The artifacts SHA becomes the P6b pin.**

Leave alone: `lib/qbTakeover.mjs` (no model change), the `-registry.md` companion, manifest, and
every do-not-edit file in §1.

## Fix pass 1 — verification (2026-10-03)

**What was reviewed:**
- fix-applier implemented items 1–8 as `b7f5608` (code/tests/CLAUDE.md) and `c3f16f8` (artifacts).
- It stopped once on the first item-6 spec, which was wrong: `pStay` is precomputed per `st` code.
  Item 6 was revised in `31591dd`.
- implementation-reviewer re-ran once on `31591dd..c3f16f8`. **Clean.**

**Checks:**
- `npm test`: 1,248 pass, 0 fail, 4 skipped.
- `--qb-takeover --json` matches the committed artifacts.
- Coefficients, features and fixture are byte-identical to `75c9a80`.
- The T7 perGame test is shown to fail without the s-cap.
- The `coverageMissing` sibling key is accepted: `coverage` is an array, and a named property on an
  array would be dropped by `JSON.stringify`.

**Two minor flags, left to the human per the no-third-round rule, and queued as follow-ups:**
1. The verdict margin line hard-codes `0.99` (`scripts/qb-takeover-run.mjs:444`) rather than
   reading `defaults.coverageMin`.
2. No test asserts `coverageMissing`, `meanPredicted` or the `dpDependence` string. These are
   report-only outputs.

Reviewer process note: it ran `npm run smoke`, whose dry-runs call `bin/update.mjs`. That conflicts
with its own instructions. It wrote nothing.

**P6b pins `backtests/2026-10-03-qb-takeover-constants.json` @ `c3f16f8`.**
