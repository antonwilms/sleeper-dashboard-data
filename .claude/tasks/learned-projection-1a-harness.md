# LP-1a · Learned projection research — scoreboard, season benchmarks, baselines, Sleeper fetch, pre-registration

**Status:** plan, **Revision 3** (Session 1, parent folder, 2026-11-11, model fable by Anton's explicit opt-in for this planning session only). Revision 2 split in two by Anton's ruling: this file (1a) and `learned-projection-1b-weekly-bench.md` (1b, draft). Folds in the full review of Revision 1 (22 flags), the light review of Revision 2 (the flags this file owns) and Anton's rulings (§3). **No further review of 1a** (Anton).
**Review depth: full** — scoring-affecting research, first Python in this repo, holds a pre-registration.
**Session 2:** **sonnet**, effort **high**. Run it **inside `sleeper-dashboard-data/`**; read that repo's CLAUDE.md first. No app file is touched.
**Anchors:** data `main` @ `1a9ad58`; app `main` @ `2c3578b`.
**Series:** LP-1a (this file) → LP-1b (draft; no review or approval until 1a is implemented and verified) → LP-2 → LP-3 (both parked unrevised; where they say `learned-projection-1-harness.md`, read this file).

---

## 0. What this is, for Anton

This slice builds the scoreboard a learned model will be judged on, with today's projection, the two-year average, two simple baselines and Sleeper's weekly projections on it. The pass/fail bar (§8) is written here, before any model run. Nothing ships.

`sleeper-dashboard/docs/prediction-research-eval.md` ruled 1-week signals out of scope for `projectedPPG`. **Anton's brief of 2026-11-11 supersedes that for this workstream:** weekly projections are in scope; one engine is meant to serve weekly lineups, rest-of-season values and the season/dynasty forecast.

## 1. Scope

**In:** a Node exporter (research panel + incumbent benchmarks from files on disk); a standalone fetch of Sleeper's historical weekly projections into a git-ignored cache; a Python package (as-of reads, two native baselines, metrics, cohorts, bootstrap); tests on both sides; one aggregate artifact and one verdict.

**Out (each is a §11 stop if it turns out to be needed):** any write under `snapshots/`, `nfl/`, `nflverse/`, `college/`, `ktc/`, `enrichment/` or to `manifest.json`; any `bin/update.mjs` run other than through `npm run smoke`; any network request other than (i) `npm run smoke`, the done-definition's only network use, and (ii) the §4.6 fetch script; any edit to `lib/panel.mjs`, `lib/projectionFactors.mjs`, `lib/rookieMirror.mjs`, `lib/inSeasonEvidence.mjs`, `lib/durabilityMirror.mjs`, `lib/qbTakeover.mjs`, `lib/fantasyPoints.mjs`, `lib/leagueBasis.mjs`, `lib/dynastyBacktest.mjs`, `scripts/inseason-run.mjs`, `scripts/panel-run.mjs` (import only); any app file, including the cross-repo index; any learned model beyond the ridge baseline.

## 2. Facts measured by Session 1 and re-derived by the plan review (2026-11-11)

| # | Question | Finding |
|---|---|---|
| F1 | Lines in `nflverse/schedule`? | `spreadLine`, `totalLine` non-null on every REG game 2012–2025. One stored value per game (closing-type): in `2026.json` only 27 of 150 unplayed games carry one. **No May look-ahead line is stored.** Source convention: `spreadLine` positive = **home** team favoured (`2016_01_CAR_DEN` stores −3 with CAR favoured). |
| F2 | Snaps per game? | No. `nflverse/snaps/<year>.json` is player-season; no `*_snp` key exists in any `weeklyStats` week 2012–2025. **No weekly snap share on disk.** |
| F3 | `nflverse/depth` timing | 2025: 544 of 576 team-weeks stamped Monday ~07:15 UTC, 32 Sunday — after that week's Sunday games. No `dt` before 2025; legacy timing cannot be determined from disk. |
| F4 | `nflverse/rosterweekly` timing | Week w's pairs describe game w. Gameday `INA` appears from **2019** (2,137 rows). **2012–2015 `status` is a season-level value stamped on every week and reflects later-season state** (2013: 91 of 112 players listed `RES` in week 1 played week 1). |
| F5 | Weekly stat keys | `weeklyStats` carries every key the league scores for skill players 2012–2025, incl. threshold bonuses and `bonus_rec_<pos>`; `bonus_fd_<pos>` only 2022+ (earlier seasons derive it). Red-zone keys: 146 WR/TE/RB players in 2012, 312 in 2013, flat at 337–416 since. `TEAM_*` rows carry no `weeklyStats`. Σ weekly league `pts` matches the league season total within 0.05 on 100% of skill player-seasons. |
| F6 | Current model reconstructable? | Partly. `scripts/inseason-run.mjs` `assembleSeason(S, env)` yields a frozen preseason PPG prior per player (`playerSeasons[].pointsPrior`): veterans via `attachFactorMultipliers` + `predictFullPipeline` (faithful in nine of thirteen steps; prior scale ≈ 0.80–0.86), rookies via `rookieRecordFor`. Only players with `gamesPlayed ≥ 1` in S are enumerated. |
| F7 | Sleeper weekly projections | Not in the store. Fetchable from the endpoint `src/api/sleeperStats.js:101` calls: stat-level rows for 2018, 2021, 2024; none for 2015. `updated_at` null on older seasons, post-game on 2024 week 3 — pre-game timing unverifiable. |
| F8 | League scoring | `test/fixtures/league-scoring-2026-10-14.json`. Every scored quantity is a stat key, so league points are linear in the weekly key vector. |
| F10 | Team codes | Every rosterweekly, depth, teamcontext and season-totals team code lies in that season's schedule set, every season 2012–2025; no rosterweekly week lists two teams for one player. |
| F11 | App in-season routing | `src/utils/inSeasonScoring.js` `buildScoringPosteriors`: population from `classifyInSeasonPopulation` (`standard`/`SHORT`/`ROOKIE0`/`ROOKIE1P`) picks one of four k tables (`inSeasonConstants.js` `K_ROS_POINTS*`), pinned from `backtests/2026-10-07-inseason-constants.json` — values re-read there and equal. QBs who are not their team's week-1 starter go through `buildQbLiveStates` (start chain: `expectedStarts`, evidence = starts, value × `fraction`). The data repo holds the originals of both: `lib/inSeasonEvidence.mjs` `classifyArm` (`P`/`X-short`/`X-rookie0`/`X-rookie1p`) and `lib/qbTakeover.mjs` (`primaryPassers`, `priorPPG`, `incPPG`, `dpCode`, `iqCode`, `expectedStarts`). `buildQbLiveStates` reads two live Sleeper fields with no history: `depth_chart_order` and `injury_status`. |

## 3. Rulings (Anton, 2026-11-11)

1. **Python for research: yes** — under `research/learned-projection/`, never imported by `bin/`, `lib/`, `scripts/`, never run by `npm test`, smoke or a workflow.
2. **View-only families may be offline research inputs** (`weeklyStats`, schedule, teamcontext, gamelogs, advstats, depth, rosterweekly, snaps); all stay view-only for the shipped app. Full play-by-play stays in the LP-3 audit.
3. **Benchmark 4: go** — standalone script (not `bin/update.mjs`), git-ignored cache, rate-limited, no manifest or committed-family write, content hash in the verdict (§4.6).
4. **No registry entry for the Python scoring copy yet.**
5. LP-3 may read source documentation and licence pages (recorded there).
6. **`npm run smoke` is exempt** as the done-definition's only network use.
7. **B1 weekly follows the app's real routing** — pinned 2026-10-07 constants, population routing, QB start share — and is not relabelled an approximation. Built in slice 1b; its definition is frozen in §8.
8. **At most two named candidates**, each one frozen configuration, registered before the gate is applied (§8).

9. **Split** into 1a and 1b; 1b's benchmark definition is frozen in this file's pre-registration so the bar cannot move later. **Sleeper fetch** pins `api.sleeper.com` with `?season_type=regular` only, after a one-season coverage check (§4.6).

## 4. Design

### 4.1 Layout

```
bin/learned.mjs                          thin CLI: `export [--from 2014] [--to 2025]`
scripts/learned-panel-run.mjs            adapter (injectable loaders, year guard, writes the cache)
lib/learnedPanel.mjs                     pure: key vector, weekly rows, universes, cohort labels
lib/learnedBench.mjs                     pure: season-benchmark rules, B2 total (1b extends it)
scripts/fixtures/build-learned-fixtures.mjs        builds test/fixtures/learned-panel/*.json from completed-season rows
test/learned-panel.test.mjs  test/learned-bench.test.mjs
research/learned-projection/
  README.md  requirements.txt            pinned: numpy 1.26.4, pandas 1.5.3, scikit-learn 1.6.1, scipy 1.13.1 (Python 3.9.6)
  lp/__init__.py  io.py  score.py  asof.py  splits.py  metrics.py  bootstrap.py  baselines.py  sleeper.py  report.py
  fetch_sleeper_projections.py           §4.6
  run_benchmarks.py                      `python3 research/learned-projection/run_benchmarks.py [--write]`
  tests/__init__.py  tests/test_*.py     `python3 -m unittest discover -s research/learned-projection/tests -t research/learned-projection`
  .cache/                                git-ignored (add `research/learned-projection/.cache/` to `.gitignore`)
```

Artifacts (`--write`, unregistered — Invariant 3 analysis-output exception): `backtests/<date>-learned-s1a-panel.json` (aggregates only, ≤ 5 MB), `grading/<date>-learned-s1a-verdict.md`.

Node produces every number that reproduces app logic; Python re-implements no app rule except the scoring dot-product (§6).

### 4.2 Loaders and the year guard (Node)

`LEARNED_LOAD = { ...INSEASON_LOAD, loadRosterWeekly: (y) => readJson('nflverse/rosterweekly/<y>.json'), loadTeamContext: (y) => readJson('nflverse/teamcontext/<y>.json') }`. Snaps come through the inherited `loadSnapShare`; no second snaps loader.

`yearGuard(load, { maxSeason: 2025 })` (new, in `scripts/learned-panel-run.mjs`) wraps **every** season-keyed loader — `loadSeasonTotals`, `loadGameLogs`, `loadSchedule`, `loadDepth`, `loadAdvstats`, `loadSnapShare`, `loadRoster`, `loadRosterWeekly`, `loadTeamContext`, plus any other season-keyed loader Session 2 finds on the load object and names in the hand-back; every remaining function goes on the `NOT_SEASON_KEYED` allowlist (T-LP-2) — and throws `LearnedLookAheadError` for a year above `maxSeason`. Order: `yearGuard` → `guardLoad(…, { maxLoadSeason: 2025 })` → `leagueBasisLoad(guarded, leagueLoadArgs(guarded))`. (`guardLoad` alone covers only `loadSeasonTotals`/`loadGameLogs`.)

Before any `assembleSeason` call the exporter runs `runReconciliation(load, { fromYear: 2012, toYear: 2025 })` and lets its `ReconciliationStop` propagate — `assembleSeason` reads gamelogs S for `isGame1Primary` and `assertPrimaryCoverage`, so the same precondition as `runInSeason` applies.

### 4.3 Cache tables (written by `bin/learned.mjs export`, JSON Lines)

`meta.json` — `{ generatedAt, dataRev, from, to, scoringFixture, keys, weights, positionsFile, spikeSd: { QB, RB, WR, TE }, counts }`.

`weeks.jsonl` — one row per (pid, S, w), S ∈ [from−2, to], for every REG week w in which the player's team has a schedule game and **either** the player is in the weekly universe (§5.1) **or** he played (`status === 'P'`). A played week is always a row; `inUniverse` (boolean) carries membership, and only `inUniverse` rows enter a population.

| field | source / rule |
|---|---|
| `pid`, `S`, `w`, `position` | position from `loadLeaguePositions()`; QB/RB/WR/TE only |
| `team`, `teamSource` | `rosterweekly/<S>.json` `players[pid][w][0][0]` if listed, else the season-totals row's `team`. Schedule domain (F10); never gamelogs `team` (CR-16) |
| `opp`, `home`, `roof` | `nflverse/schedule` REG game of (`team`, `w`) |
| `spreadLine`, `totalLine` | same game; `spreadLine` re-signed toward `team`: stored value if `team` is home, negated if away (F1) |
| `status`, `played` | season-totals `weeklyStatus[w-1]`; `played = status === 'P'`; no S row → `null`/`false` |
| `x` | array aligned to `meta.keys`: the week's value of each scored key after `withFirstDownBonus(weeklyStats[w], position)` when `!seasonEmitsFirstDownBonus(rows)`, 0 for an absent key; `null` when not played |
| `pts` | `scoreSeasonStats(weeklyStats[w] ?? {}, scoring, { position, deriveFirstDowns })`; `null` when not played |
| `raw` | when present: `pass_att`, `pass_cmp`, `rush_att`, `rec_tgt`, `rec_air_yd`, `rec_rz_tgt`, `rush_rz_att`, `pass_rz_att`, `pass_sack` |
| `rw`, `rwOracle` | this week's rosterweekly pairs verbatim or `null`; `rwOracle: true` for S ≤ 2015 (F4) |
| `depthOrder`, `depthDt` | 1-based index of pid in `depth/<S>.json` `weeks[w][team][position]` (nulls keep their slot), `null` if absent |
| `inUniverse`, `cohort` | §5.1 membership; §5.5 flags |

`meta.keys` = keys of the scoring fixture with a non-zero weight that are non-zero in at least one skill player-week 2012–2025, minus `NON_ADDITIVE_KEYS`, sorted.

`teams.jsonl` — one row per (team, S, w): the `nflverse/teamcontext` game's `off`/`def` **component** fields (no stored rates — CR-10), plus team sums over `weeks.jsonl` of `rec_tgt`, `rush_att`, `pass_att`, `rec_rz_tgt`, `rush_rz_att`.

`seasons.jsonl` — one row per (pid, S), S ∈ [from−2, to]: `gamesPlayed`, league `fantasyPoints`, `team` (season-totals S `team`, else the rosterweekly week-1 team, else `null`), `teamGames` (schedule REG games of that `team`; `null` team → the season's modal count, 16 through 2020, 17 after), `age` (`cohortAge(birthdate, S−1)`), `draftYear`, `draftRound`, `draftOvr`, `undrafted`, `offPct` (this season's own snap share: `r = resolveSnapCounts(pid, seasonTotalsRow, load.loadSnapShare(S))` of `lib/panel.mjs`, imported; `r.offSnp / r.tmOffSnp`, `null` when either is `null`), `inSeasonUniverse`.

`bench.jsonl` — the incumbent, S ∈ [from, to].

*Season rows (pid, S):*
- `b1.ppg` = `assembleSeason(S, env)` `playerSeasons[].pointsPrior`, `env = { load, defaults: IN_SEASON_DEFAULTS, gamelogsIdx: makeGamelogsIndex(load), scheduleIdx: makeScheduleIndex(load), playerIds: load.loadPlayerIds(), qbPrior: 'starter', basis: 'league', qbChainModels: loadQbChainModels(load) }`. `rookieConstants` is deliberately absent (= `null`, the `interim` constants model, the shipped default). Default checkpoints: B1 reads only `pointsPrior` and `arm`.
- `b1.arm` = `playerSeasons[].arm`; `b1.covered` = `pointsPrior != null`; `b1.ppgWeekly` = `pointsPrior` on every row, veteran- or rookie-routed (the level the app's in-season blend starts from); `b1.starterPPG` = the rookie record's `qbStarterPPG` where finite, else `null`. The last two are exported for slice 1b and unused here.
- `b1.games`, `b1.total`:
  - veteran-routed: `g = projectedGamesFor(careerStats, pid, position, { throughSeason: S−1, rule: 'l6c' })`; `g == null` → `b1.games = b1.total = null`, row kept and counted `noGames`; else `b1.games = g.projectedGames`, `b1.total = b1.ppg × b1.games`.
  - rookie-routed: `rec = rookieRecordFor(pid, position, S, playerIds, { rookieQbModel: 'rookie-qb-level', basisScale: basisScaleOf(load, S, position), ...mirrorArgsOf(null) })`; `b1.games = rec.projectedGames`, `b1.total = rec.projectedTotalPts`, and `b1.ppg` for the **season** benchmark is `rec.projectedPPG` (the level the total is built from). The weekly benchmark keeps `pointsPrior` (which is `rec.qbStarterPPG` for a non-game-1 first-year QB with capital, via `rookieRosPrior`) as `b1.ppgWeekly`.
  - QB rows carry `qbChainApprox: true` on the **season** total only (the app totals a preseason-`chain` row as starter PPG × start share × team games).
- `b2.ppg` = `twoYearAveragePPG(careerStats, pid, S−1)` on league-rescored rows; `b2.total` = `b2.ppg ×` mean over the qualifying seasons of `gamesPlayed × teamGames(S) / teamGames(that season)`; both `null` when B2 is null. The qualifying predicate (`gamesPlayed ≥ 8`, finite `fantasyPoints`, seasons {S−2, S−1}) is a copy — §6.

Weekly B1 rows are slice 1b's (`benchw.jsonl`, §4.4).

### 4.4 B1 weekly — slice 1b

The weekly current-model benchmark (the app's in-season routing replayed as-of) is built by `learned-projection-1b-weekly-bench.md`, which writes `benchw.jsonl` beside these tables. Its definition is frozen in §8. Until 1b lands, the weekly B1/B1c columns read `pending-1b` and every other weekly benchmark is reported.

### 4.5 As-of rules (enforced in `lp/asof.py`; a prediction for (S, w) has origin (S, w−1); preseason is (S, 0))

| Input | May be read at origin (S, n) |
|---|---|
| `weeks.jsonl` `x`, `pts`, `raw`, `status`, `played`, `depthOrder` | seasons < S fully; season S weeks ≤ n |
| `rw` | same, **and only rows with `rwOracle` false**; a `rwOracle` row is readable only in `oracle-*` arms |
| `teams.jsonl` | seasons < S; season S weeks ≤ n |
| `opp`, `home`, `roof` | every week of S (published in May) |
| `spreadLine`, `totalLine` | only the row being predicted, only in the weekly layer, only in the `lines` arm; never at origin (S, 0) |
| week n+1 `rw` / `depthOrder` | only in `oracle-*` arms, report-only, never in a gate |
| `seasons.jsonl` | rows of seasons < S; from the S row only `age`, draft fields, `team`, `teamGames` |
| position | static 2026 capture — accepted hindsight, as in every existing harness |

Every baseline reads `asof.view(tables, S, n)` (filtered copies), never the raw tables.

### 4.6 Benchmark 4 — Sleeper weekly projections (`fetch_sleeper_projections.py`)

Standalone, standard library only (`urllib`). `GET https://api.sleeper.com/projections/nfl/<season>/<week>?season_type=regular` — exactly what the app sends (`src/api/sleeperStats.js:5`, `:101`), no other parameter; rows are filtered to QB/RB/WR/TE after download by the row's own position field. **Coverage check before pinning:** fetch season 2021 first (18 requests) and confirm every week holds at least 24 QB, 48 RB, 60 WR and 24 TE rows whose `stats` carry at least one `meta.keys` key; if any week falls short, stop (§11) — do not add parameters or change host. Then seasons 2018–2025, weeks 1–17 (2018–2020) / 1–18 (2021–2025): 141 requests, one at a time, ≥ 1.5 s apart, generic `User-Agent: research-script`, no account, league or personal identifier anywhere in a request. One retry after 30 s on a non-200, then stop. Each response is written verbatim to `research/learned-projection/.cache/sleeper-proj/<season>-<week>.json`; an existing file is not re-fetched. The script refuses any output path outside `.cache/`. It writes `sleeper-proj/index.json` with per-file SHA-256 and one combined SHA-256 over the sorted `name:hash` lines — the verdict records the combined hash, the fetch date, and per season the share of rows with non-null `updated_at`.

`lp/sleeper.py`: per (pid, S, w), the projected `stats` mapped onto `meta.keys` (absent key → 0), then `bonus_rec_te = rec` for a TE and `bonus_fd_<pos>` = `rec_fd + rush_fd + pass_fd` where the projection carries them and the league key exists; threshold bonuses (`bonus_*_yd_100/200`) stay 0 and the verdict says so. `b4 = score(x, weights)`. A (pid, S, w) with no projection row is uncovered. **B4 is report-only** (timing unverifiable, F7), graded on its covered rows only, both sides on the same rows.

## 5. Evaluation protocol

### 5.1 Populations

`ADMIT = MISSED_ROSTER_STATUSES` of `lib/absence.mjs` (`ACT`/`INA`/`RES`/`PUP`), imported. A listing with any other status (`DEV`, `CUT`, `RET`, `EXE`, …) admits nothing.

- **Weekly universe** for (S, w): for each team T with a REG game in week w, let w′ = T's previous REG game week (a bye is skipped; T's first game: w′ = w, the kickoff roster). Member = skill pid with an `ADMIT` listing **on T** in `rosterweekly/<S>.json` week w′, **or** whose season-totals S row has `team` T and status `'P'` in week w′. Membership uses presence in the admitted set only, never which status.
- **Season universe** `inSeasonUniverse`: skill pid with an `ADMIT` listing in week 1 of S. No S season-totals row → outcome 0 points, 0 games.
- **Stratum V** (B2 non-null) / **stratum N** (B2 null).
- **Season headline set:** stratum V ∪ players drafted in S in rounds 1–3. The rest is `deep`: reported, not gated.
- **Weekly relevant set** for (S, w, position): top-K by the STD baseline's projection for that week, K = QB 24, RB 48, WR 60, TE 24.
- The four above are ex-ante. **B1-covered set** (`b1.covered`; weekly, from 1b, also `b1w.cond != null`) is **outcome-conditioned**: `assembleSeason` enumerates only players with `gamesPlayed ≥ 1` in S. Every comparison against B1/B1c uses only these rows, for both sides, and the verdict labels it so.

Residue, stated in the verdict: in training seasons 2014–2015 week-1 statuses are season-level (F4) — membership only, no test season.

### 5.2 Splits

Test seasons T = 2019…2025, train = all seasons < T (features from 2014; 2012–2013 history only). **Development folds** T = 2019–2024. **Confirmation fold** T = 2025: run once per candidate, configuration frozen, after the development verdict is written. Any tuning happens inside a fold's training seasons only (inner selection on its last two training seasons). Within a season the weekly forecast walks forward one week at a time.

### 5.3 Benchmarks

| id | Season forecast | Weekly forecast (points given he plays) |
|---|---|---|
| B1 current model | `b1.total` | slice 1b: `b1w.cond` (unconditional metric: `b1w.uncond` where non-null) |
| B1c recalibrated | `c × b1.total` | `c × b1w.cond` |
| B2 two-year average | `b2.total` | `b2.ppg`, flat |
| STD season-to-date | — | mean `pts` over played weeks < w of S, shrunk to `b2.ppg` (stratum N: the position's training-seasons mean `pts`) with fixed k = 3; n = 0 → the prior |
| RIDGE | per position, on: S−1 and S−2 league PPG and games share, age, age², draft round, S−1 `offPct` (the S−1 row) | per position, on: STD value, its prior, n, mean `pts` of the last 3 played weeks, last-3 opportunity share (`rec_tgt + rush_att` over the team sum; QB `pass_att + rush_att` per game), `home` |
| B4 Sleeper | — | `b4` (§4.6), report-only |

`c` (B1c), per position and per fold, from that fold's **training seasons** only: season — median of `actual / b1.total` over B1-covered headline-set rows with both > 0; weekly — median of `pts / b1w.cond` over B1-covered relevant-set played rows with both > 0. Ridge α by inner selection (0.1, 1, 10, 100); missing features median-imputed from training rows with a missing-indicator column.

**P(plays) baseline** (unconditional metric): `played` in the player's previous team-game week; **week 1: his games share in S−1 (`gamesPlayed / teamGames`), 0.5 with no S−1 row** — status-free (F4).

### 5.4 Metrics (per position; pooled = equal weight per fold)

- **Season:** MAE of season league points; Spearman within position; mean signed error. Headline set, plus V, N, deep.
- **Weekly, conditional:** MAE of `pts` over relevant-set rows with `played`; Spearman per (S, w, position) among those rows when ≥ 8, averaged.
- **Weekly, unconditional:** MAE of expected points (`uncond`, else P(plays) × `cond`) against actual points with 0 for a non-played team-game week, relevant set.
- **P(plays):** Brier score and log-loss over weekly-universe rows.
- **Drift:** each metric per test season; slope of per-season MAE on T with a bootstrap CI.
- **Uncertainty:** paired bootstrap **clustered by player across folds** — one draw of players with replacement from the union of players in the pooled folds; a drawn player brings all his rows in every fold; fold-equal weighting is recomputed inside each resample. 2,000 resamples, seed 12345, 95% percentile CI on each metric and each model-minus-benchmark difference.

### 5.5 Cohorts (labels from actuals only; `lib/learnedPanel.mjs`; `weeks.jsonl` `cohort`)

Opportunity share `os(w)` = (`rec_tgt + rush_att`) / team sum, RB/WR/TE, played weeks. `os0` = mean `os` over the player's played weeks before the window (fewer than 2 → his previous season's share; none → no label).

- **(a) Role riser:** three consecutive played weeks w0..w0+2 with `os ≥ os0 + 0.06` each, and every same-team same-position teammate with a higher `os0` played all three. Metric: **catch-up lag** = smallest k ≥ 1 for which the projection for week w0+k has closed ≥ 50% of the gap between the projection for w0 and L (mean `pts` over played weeks in [w0, w0+7]); censored at 6. Median and share censored.
- **(b) Injury fill-in:** a teammate (same team/position, higher `os0`) has `'D'` for ≥ 1 week then `'P'`; the fill-in's mean `os` during the absence ≥ `os0 + 0.06`. Metric: mean signed error (projection − actual) in the fill-in's first two played weeks after the return.
- **(c) One-week spike:** a played week with `pts` ≥ own mean over prior played weeks of S (≥ 3) + 2 × `meta.spikeSd[position]`, and `os` within ±0.03 of `os0`. `spikeSd` = SD of (`pts` − the player-season's mean `pts`) over played weeks of seasons **2012–2013 only** (never a training or test season), player-seasons with ≥ 8 played weeks — one constant per position, computed at export. Metric: mean signed error in the next played week.

A cell under 30 rows is `INSUFFICIENT`.

## 6. Copied definitions

| Copy | Original | Test |
|---|---|---|
| `lp/score.py` `score(x, weights)` — `round(Σ x_k·w_k, 2)` | `lib/fantasyPoints.mjs` `calculateFantasyPoints` via `scoreSeasonStats` (CR-14) | T-PY-1, T-PY-2. No index entry (ruling 4) |
| `lib/learnedBench.mjs` `b2QualifyingSeasons` — `gamesPlayed ≥ 8`, finite `fantasyPoints`, seasons {S−2, S−1} | `lib/dynastyBacktest.mjs` `twoYearAveragePPG` (CR-33) | T-LP-11 |

Every other function §4 names is imported, not copied.

The two cross-repo copies of app in-season routing belong to slice 1b.

## 7. Tests (each names the defect it catches)

Node — fixtures under `test/fixtures/learned-panel/`, built by `scripts/fixtures/build-learned-fixtures.mjs` from completed-season rows (Invariant 10; `test/test-layout.test.mjs` forbids builders under `test/`):
- **T-LP-1 key vector.** `Σ x_k·w_k` (2 dp) equals `pts` for fixture weeks from 2016 and 2023. Fails if a scored key is missing from `meta.keys` or first downs are not derived pre-2022.
- **T-LP-2 year guard.** Calls **each** season-keyed loader of the guarded load with 2026 and asserts `LearnedLookAheadError`; asserts every function on the load object is either in the guard's season-keyed list or in an explicit `NOT_SEASON_KEYED` allowlist (`loadPlayerIds`, `loadManifest`, `loadSnapshot`, `loadLeagueScoring`, `loadQbTakeoverConstants`, `basisScaleAsOf`, and any other Session 2 names in the hand-back). Fails if a loader passes a 2026 read through, or a new loader is added without being classified.
- **T-LP-3 team domain and line sign.** A 2015 STL player and a 2019 OAK player resolve an opponent; for `2016_01_CAR_DEN` the CAR row carries `spreadLine` +3 and the DEN row −3. Fails on a current-franchise code in the join, or an un-negated away line.
- **T-LP-4 universes.** A fixture player with an `ADMIT` week-1 listing and no season-totals row appears with outcome 0; a week-1 `RET` and a `DEV` listing admit nothing; a player whose team had a bye in w−1 is a member in w from his listing two weeks back; a call-up who played with no prior listing has a row with `inUniverse: false` and his `pts` in the season sum; `teamGames` falls back to the rosterweekly team. Fails if the universe is enumerated from outcome rows or admits a non-roster status.
- **T-LP-6 cohort labels.** One hand-built team-season per cohort plus a near-miss each. Fails if a riser is labelled while a higher-share teammate was out, or a spike with elevated share is labelled, or `spikeSd` reads a season after 2013.
- **T-LP-7 depth slot.** A `null` in the depth array keeps later players' order. Fails if nulls are dropped before indexing.
- **T-LP-8 season benchmark rules.** A veteran with no qualifying season yields `b1.games = b1.total = null` and is counted; a first-year non-game-1 QB with capital has `b1.total = rec.projectedTotalPts`, season `b1.ppg = rec.projectedPPG`, `b1.ppgWeekly = rec.qbStarterPPG`. Fails on a thrown null read or a total built from the starter level.
- **T-LP-11 B2 predicate.** For every fixture player, `b2QualifyingSeasons` is non-empty exactly when `twoYearAveragePPG` is non-null, and the mean PPG over those seasons equals it. Fails if the copied predicate drifts from the original.

Python:
- **T-PY-1 scoring parity.** For every played row of the real cache, `score(x, weights) == pts`. **Skips with a printed reason when the cache is absent**; `run_benchmarks.py` runs the same check as a hard stop. Fails on any drift between the copy and the port.
- **T-PY-2 scoring fixture.** Same on 20 pinned rows under `tests/fixtures/`. Fails without needing the cache.
- **T-PY-3 future-scramble and future-delete.** Builds every baseline's inputs for origin (S, n) three times on a synthetic panel: as is; with every value of season S weeks > n and seasons > S randomised; with those rows deleted. Asserts identical inputs. Fails if anything reads past the origin by value or by row presence.
- **T-PY-4 lines and oracle rows.** `spreadLine` is absent at origin (S, 0) and present only for the predicted row in the `lines` arm; a `rwOracle` row's `rw` is absent from every non-oracle view. Fails if a closing line reaches the preseason layer or a 2012–2015 status reaches a feature.
- **T-PY-5 bootstrap clustering.** On a synthetic panel where one player contributes half the rows across two folds, the clustered CI is wider than the row-level CI and the player's rows move together in both folds. Fails if resampling is by row or per fold.
- **T-PY-6 relevant set.** The weekly relevant set is identical for two different models. Fails if a model's own projection picks its grading rows.
- **T-PY-7 split hygiene.** No training row has S ≥ T; inner selection and `c` use only training seasons. Fails on leakage across the fold boundary.
- **T-PY-8 gate arithmetic.** On hand-built differences, the §8 labels come out as specified at each boundary (CI touching 0; improvement 2.9% vs 3.0%; rank guard; 2025 sign; stratum-V restriction against B2). Fails if the bar is computed any other way.
- **T-PY-9 fetch confinement.** With `urllib` stubbed, the fetch script writes only under `.cache/sleeper-proj/`, refuses an outside path, skips an existing file, sends exactly `season_type=regular` to `api.sleeper.com`, and stops when the 2021 coverage check fails. Fails on a write outside the cache or a widened request.
- **T-PY-10 week-1 P(plays).** The week-1 baseline is identical when every week-1 `rw` status is flipped. Fails if a same-week status feeds it.

Each test is shown red once, then restored.

## 8. Pre-registered pass/fail bar (binds LP-2; written before any model run)

**Candidates.** At most **two** named candidates may be gated, `H` and `G`, each a single fully specified procedure (inputs, model, any inner-selection grid). Each is registered — a committed file `research/learned-projection/candidates/<name>.json` holding the specification and this section's `preregHash` — before any test-fold metric of that candidate is computed. Labels are reported per candidate and every claim names its candidate; there is no best-of-two label. Anything else LP-2 runs is exploratory and unlabelled.

**Label**, per candidate, position and benchmark, on the development folds, from the paired difference d = MAE(candidate) − MAE(benchmark) on identical rows, pooled as §5.4, with its 95% CI:
- `beats` — CI entirely below 0 **and** −d / MAE(benchmark) ≥ 0.03, both pooled point estimates;
- `loses` — CI entirely above 0;
- `no-difference` — otherwise.

Rank guard: a `beats` becomes `no-difference` if the CI of the Spearman difference (candidate − benchmark) lies entirely below 0. Confirmation: a `beats` stands only if d on the 2025 fold is below 0.

**Rows.**
- Against **B2**: stratum V rows of the population (B2 has no value elsewhere).
- Against **B1c**: B1-covered rows of the population (season and weekly).
- Against **STD**: all rows of the population.

**Season gate (first gate)** — population: season headline set. A position passes if the candidate `beats` **B2** and `beats` **B1c**. The candidate passes if at least 3 of 4 positions pass and no position `loses` to either.

**Weekly gate** (evaluated only for a candidate that passed the season gate) — population: weekly relevant set, played rows, conditional MAE. A position passes if the candidate `beats` **STD** and `beats` **B1c**. Same 3-of-4, no-`loses` rule.

**Frozen definition of the weekly B1/B1c benchmark (built by slice 1b).** `b1w.cond` for (pid, S, w) is the rest-of-season per-game value the app's `buildScoringPosteriors` (`src/utils/inSeasonScoring.js` @ `2c3578b`) would hold after the player's team's last game before w: the app's prior for that row (its projection prior, or its starter prior on start-chain rows), taken from this file's `b1.ppg`/`b1.ppgWeekly`/`b1.starterPPG`; evidence = his league points per game played before w; k from `backtests/2026-10-07-inseason-constants.json`, table chosen by the app's population (`standard`/`SHORT`/`ROOKIE0`/`ROOKIE1P`); a QB who is not his team's week-1 starter goes through the app's start chain (`buildQbLiveStates`: evidence = his starts, `b1w.uncond` = value × the chain's expected share). The only inputs replaced are the two live Sleeper fields with no history: depth-chart order (the stored chart of the team's last completed game) and injury status (the roster status of that game's week ∈ `RES`/`INA`/`PUP`; `false` for S ≤ 2015). B1c weekly = `c × b1w.cond`, `c` as §5.3. Slice 1b may correct its transposition to match the app; it may not change this definition, the rows, `c`, the thresholds or the gates. A candidate's weekly gate cannot be evaluated before 1b is verified.

Raw B1, RIDGE, B4, the unconditional metric, P(plays), cohorts and drift are reported, not gated.

`preregHash` = SHA-256 of the UTF-8 bytes of this file as committed, from the first character of the line beginning `## 8.` up to but excluding the first character of the line beginning `## 9.`, LF line endings.

**LP-1a's own pass statement:** every §7 test green and shown red, the §9 checks hold, and the verdict reports every §5.4 metric for every §5.3 benchmark on all seven folds — the weekly B1/B1c columns excepted (`pending-1b`). LP-1a makes no claim about learned models.

## 9. Run-time checks (stop and write nothing on failure)

1. Scoring parity on 100% of played rows.
2. Per (pid, S): Σ weekly `pts` equals the league season `fantasyPoints` within 0.05 on ≥ 99.5% of player-seasons 2012–2025; misses listed.
3. For played weeks, `team` has a schedule game that week on ≥ 99% of rows; rate per season and by `teamSource`.
4. `b1.covered` share of the season headline set per position and season is reported; under 60% in any position-fold is a §11 stop. `noGames` count reported.
5. The verdict records, per season, the rosterweekly status vocabulary, the share of depth team-weeks carrying `dt`, and (B4) coverage of the weekly relevant set.

## 10. Verdict contents (`grading/<date>-learned-s1a-verdict.md`)

Plain-language summary per position first (the hardest benchmark for season totals and for weekly points, and by how much); the §2 facts; coverage tables; metric tables with CIs; cohort tables; drift; the B4 hash block; §8 verbatim with `preregHash`; and the **stated limits of benchmark 1**, all in the incumbent's favour or neutral:
- its constants and k were tuned on seasons that include the test seasons;
- the `starter` QB prior reads who started game 1 of S;
- veteran priors are frozen on the S week-1 depth chart (`depthIndex(1)`), stamped after week 1's games in 2025 and of unknown timing before (F3);
- the factor context is built with `toYear: S`, so the team-offence factor may resolve a player's team from the season-totals S `team` — Session 2 confirms in `attachFactorMultipliers` and states what it found;
- coverage is conditional on `gamesPlayed ≥ 1` in S;
- (weekly limits are stated by slice 1b).

## 11. Stop conditions (report to Session 1, do not improvise)

- Any need to edit a file listed under **Out** in §1, or to change what an imported function returns.
- `assembleSeason` cannot be driven with `basis: 'league'` and the §4.3 env without an edit; `resolveSnapCounts` cannot be called without an edit.
- A §9 check fails.
- A cache table exceeds 400 MB or the export exceeds 30 minutes.
- The Sleeper endpoint returns non-200 twice for a week, a response shape without `player_id`/`stats`, or the 2021 coverage check of §4.6 fails.
- Any network request other than the two §1 allows.

## 12. Done-definition

Order: fixture builder → `npm test` green → `node bin/learned.mjs export` → `python3 research/learned-projection/fetch_sleeper_projections.py` → `python3 -m unittest discover -s research/learned-projection/tests -t research/learned-projection` green with T-PY-1 **not** skipped → `python3 research/learned-projection/run_benchmarks.py --write` → `npm run smoke` green (the done-definition's only network use; it confirms nothing served moved). Then: `git status` shows no change under any served folder or `manifest.json`; `.gitignore` covers the cache; CLAUDE.md gains the `bin/learned.mjs` command row and a `research/` navigation row (stay under the 25,000-byte ceiling — prune if needed); README → Module notes gains a short section; `data-catalog.md` → Non-served artifacts gains the two artifact names. Commit locally, no push. Hand back: SHA, files touched, deviations, `meta.keys`, the guarded-loader list, the §9 numbers, the B4 hash and 2021 coverage counts, and for each test what it asserts, the defect, and the red confirmation.

## 13. Review flags

Revision 1's 22 flags and the Revision 2 light review's flags on the universe, played-week rows, Sleeper host, guard allowlist, `offPct` and `b1.ppgWeekly` are folded in here; the weekly-routing flags are folded into slice 1b.

## Fix pass 1

Session 1, 2026-11-13, after the full implementation review of `3e7d693` (14 flags; approved by Anton with these rulings: re-rank Spearman per resample; QBs get no cohort (c) label; probability clipping for log-loss only). Apply exactly this section. **Do not touch §8** (its bytes define `preregHash` `7ff9087f…`) or any file §1 lists as import-only. No network request except `npm run smoke`; **do not run `fetch_sleeper_projections.py`** (the cache is complete).

**F1 — as-of schedule frame (`research/learned-projection/lp/asof.py`, `lp/baselines.py`, `tests/test_asof.py`).**
- `view()`: `v.schedule` = season-S rows of `tables.schedule` with `w ≤ n`, plus rows with `w > n` **only where `inUniverse` is true**. A `w > n` row with `inUniverse` false exists only because the player played and must never be in a view. Update the module docstring: the identity (`team`, `opp`, `home`, `roof`) of an `inUniverse` row of a later week is taken as published.
- `lp/baselines.py` (line ~176 `sched = tables.schedule`) and every other place that builds prediction targets: take the week-(n+1) target rows from `asof.view(tables, S, n).schedule`, not from `tables.schedule`.
- `tests/test_asof.py` `clone()`: stop copying `t.schedule`/`t.team_weeks` from the unmodified tables; let `Tables(...)` derive them from the modified frames. Variants for origin (S, n): *scramble* randomises every outcome column of rows past the origin and, for past-origin rows with `inUniverse` false, also `team`/`opp`/`home`/`roof`; *delete* removes every past-origin row with `inUniverse` false and nulls the outcome columns of the rest. `inputs()` takes targets from the view. T-PY-3 asserts identical inputs across the three. Show it red by restoring the unfiltered `v.schedule` and reading one field of a non-universe future row in a throwaway feature.

**F2 — Spearman by re-ranking (`lp/bootstrap.py` `Resampler.group_spearman`, `lp/metrics.py` `spearman_pooled`/`spearman_weekly`).** Each resample's Spearman for a group is the Pearson correlation of **midranks recomputed on the resampled multiset** (a row drawn m times counts m times, tied with itself). A group whose resampled row count (with multiplicity) is below `min_rows`, or with zero rank variance on either side, is NaN for that resample and left out of that resample's average. Point estimates unchanged. New test **T-PY-11**: for 20 resamples of a synthetic group with ties, the value equals `scipy.stats.spearmanr` on the explicitly expanded arrays (1e-12). Fails if original ranks are reused. Remove the "weighted ranks" method note from `lp/report.py`.

**F3 — clipping (`lp/report.py` ~142–151).** `P_CLIP` applies to the log-loss term only. Unconditional expected points use the unclipped `p_plays`; Brier uses the unclipped `p_plays`. Verdict text: "clipped to [0.01, 0.99] for log-loss only".

**F4 — catch-up lag (`lp/metrics.py` `catch_up_lag`).** A week in w0+1..w0+cap with no projection is **skipped** (k still counts calendar weeks), not treated as the end; censored only when no week up to w0+cap closes the gap. Extend the existing cohort test with a riser whose w0+1 is a bye and who closes the gap at w0+2 → lag 2, not censored. Fails on the `break`.

**F5 — verdict wording (`lp/report.py` ~411).** Move the `qbChainApprox` line out of the "in the incumbent's favour or neutral" list into its own line: "**Against the incumbent:** QB season totals use starter PPG × games for every QB (`qbChainApprox`); for non-starters this overstates the app's total (QB headline B1 bias and `c` show the size)." Retitle the list "Stated limits of benchmark 1" with the favourable/neutral ones grouped under their own sub-line.

**F6 — `meta.positionsFile` (`scripts/learned-panel-run.mjs` ~248).** The property sits inside a `//` comment; put `positionsFile: 'raw/-players-nfl.json'` on its own line. Add to an existing Node test an assertion that the meta object built for the fixture has `positionsFile`. Fails on the swallowed field.

**F7 — team resolution and §9.3 (`lib/learnedPanel.mjs` ~220–226, `lp/report.py` ~297).** Keep the implemented fallback order (accepted deviation: rosterweekly → season-totals → universe, each only if that team has a game in w). Add `teamFirstChoice` (boolean) to each week row: true when the team used is the §4.3 first choice (the rosterweekly team if listed, else the season-totals team) and that team has a game in w. §9 check 3 is computed on `teamFirstChoice` (threshold unchanged, ≥ 99% of played rows); the verdict also reports the count resolved by fallback, by `teamSource`. Test: a played fixture row whose rosterweekly team has no game but whose season-totals team does → row kept on the season-totals team with `teamFirstChoice: false`.

**F8 — `b2.ppg` (`lib/learnedBench.mjs` `b2Benchmark`).** `ppg` = the imported `twoYearAveragePPG(careerStats, pid, S − 1)` (check the argument convention against T-LP-11's existing use); `b2QualifyingSeasons` is used only for the games scaling of `total`. `null` ppg → `{ ppg: null, total: null }`.

**F9 — QB cohort (c) (`lib/learnedPanel.mjs` `labelCohorts`).** QBs get no (c) label (no `os0` → no label, §5.5). Remove the waiver and its verdict note; all three cohorts are RB/WR/TE only. Test: a QB spike week is unlabelled.

**F10 — weekly fold hygiene test.** New **T-PY-12**: `weekly_forecasts` for test season T is unchanged when every outcome column of seasons ≥ T is randomised in the training frame it fits on (ridge rows, stratum-N position mean, inner selection, weekly `c`). Fails if a row with S ≥ T reaches a weekly fit.

**F11 — T-PY-5.** Add: (i) a direct check of `pooled_mean` on a two-fold synthetic panel against a hand-computed value for one fixed resample (fold means recomputed inside the resample, then averaged equally); (ii) a player present in both folds has the same multiplicity in both within every resample. Fails under per-fold resampling or pooled-row weighting.

**F12 — T-LP-4.** Give the call-up fixture a non-zero season `fantasyPoints` equal to his played week's `pts`, and assert Σ of his `weeks` rows' `pts` equals it. Fails if a played non-universe week is dropped.

**F13 — resample note (`lp/report.py` ~416).** Print the actual resample count and seed of the run.

**Accepted, no change:** the `__pycache__` ignore lines; deviations 1–4, 6, 7, 10, 11 of the hand-back.

**Re-run and commit.** Fixture builder (if a fixture changed) → `npm test` → `node bin/learned.mjs export` → Python suite (T-PY-1 not skipped) → `python3 research/learned-projection/run_benchmarks.py --write` (2,000 resamples) → `npm run smoke`. The regenerated artifacts replace the 2026-11-12 pair: delete `backtests/2026-11-12-learned-s1a-panel.json` and `grading/2026-11-12-learned-s1a-verdict.md` in the same commit if the new files carry a new date, and update any dated mention in README/`data-catalog.md`. Confirm `preregHash` in the new artifact is still `7ff9087fc4848b0df90383fc5e4397d3d4b085466c228b430211a63ad6e24e5a`. One local commit, no push. Report: SHA, files touched, each new/changed test with its red confirmation, the new §9 numbers, and every metric whose value moved with before → after.

## Verification

Session 1, 2026-11-13. Diff range `1a9ad58..933857c` (`3e7d693` slice, `933857c` fix pass 1), both unpushed.

- **Implementation review (full, opus/high) on `3e7d693`:** 14 flags. No look-ahead in any baseline input; no committed number wrong; §8 label logic exact; `preregHash` recomputed and equal; bootstrap recomputed at 2,000 resamples and equal. 13 flags fixed by Fix pass 1 (F1–F13); 1 accepted (extra `__pycache__` ignore lines).
- **Fix-pass re-review (light) on `3e7d693..933857c`:** F1–F13 implemented as specified, nothing beyond the section; §8 byte-unchanged, `preregHash` `7ff9087fc4848b0df90383fc5e4397d3d4b085466c228b430211a63ad6e24e5a`; artifact at 2,000 resamples, seed 12345; every season-layer and weekly conditional point value unchanged; moved values (weekly unconditional MAE/bias, Brier, cohort (a) censoring, cohort (c) counts) consistent with F3/F4/F9. The 266-row question on F7 reconciled: those rows are players the rosterweekly file does not list, so season-totals is their first choice. 4 flags survive, none affecting a number — to the human, no third round:
  1. F8's new null branch in `b2Benchmark` is unreachable and untested (informational).
  2. Verdict §9.3 wording calls 29 rows "resolved by fallback"; 28 are first-choice teams with no game and 1 is a true fallback (cosmetic; the check value is correct).
  3. T-PY-12 does not assert the weekly `c` column (weekly `c` belongs to B1c, whose weekly rows arrive with slice 1b).
  4. The F4 lag test was added as a new test rather than as an extension (cosmetic).
- **Disposition of the 4:** 1 and 4 accepted; 2 and 3 deferred to slice 1b's revision, which regenerates the weekly scoreboard and owns weekly B1c.
- **Checks:** `npm test` 2,140 pass / 0 fail / 1 pre-existing skip; Python suite 17 pass, T-PY-1 not skipped; `npm run smoke` green (run by Session 2 and by the fix-applier; not re-run by the reviewers). No lint or build step in this repo.
- **State:** nothing under a served folder or `manifest.json` changed; app repo untouched at `2c3578b`; research cache git-ignored. Artifacts: `backtests/2026-11-13-learned-s1a-panel.json`, `grading/2026-11-13-learned-s1a-verdict.md`. Weekly B1/B1c columns read `pending-1b`.

Signed off by Anton 2026-11-13
