# LP-2a · Learned projection research — first learned models, season layer

**Status:** plan, **Revision 3.1** (Session 1, parent folder, 2026-11-15). Folds in the reviews of Revisions 1–2, the light review of Revision 3 (flags 1–5) and rulings R1–R9 (§3). **Approved by Anton 2026-11-15.**
**Review depth: full** — scoring-affecting research; registers candidates under a frozen bar.
**Session 2:** **sonnet**, effort **high**, inside `sleeper-dashboard-data/`; read its CLAUDE.md first. Python only, under `research/learned-projection/` (paths relative to it unless they start with a repo folder).
**Anchors:** data `main` @ `a0eab8f`; cache `.cache/panel/` with `meta.generatedAt` `2026-11-12T23:44:16.940Z`, `dataRev` `3e7d693…`; LP-1a §8 `preregHash` `7ff9087fc4848b0df90383fc5e4397d3d4b085466c228b430211a63ad6e24e5a` (recomputed 2026-11-15, equal).
**Series:** LP-1a → LP-1b → **LP-2a** → LP-2b (outline) → LP-3.

---

## 0. What this is, for Anton

Two learned models (H borrows from similar players; G is tree-based) forecast next-season league points before week 1, judged on LP-1a's frozen scoreboard and against ridge. Each is committed before it sees a test season; 2025 stays sealed until the weekly models are registered. Nothing ships; "loses" is a valid result.

## 1. Scope

**In:** §4–§14 — features, era, chain, H and G, registration, development-fold evaluation, one artifact, one verdict, tests.

**Out (each a §12 stop):** any edit to `lp/baselines.py`, `lp/metrics.py`, `lp/bootstrap.py`, `lp/report.py`, `lp/splits.py`, `lp/score.py`, `lp/sleeper.py`, `run_benchmarks.py`, `fetch_sleeper_projections.py`, `tests/synth.py`, `tests/test_asof.py` (import only); any file outside `research/learned-projection/` except the three doc files of §13, this task file and the two artifacts; any Node, app or cross-repo-index file; `node bin/learned.mjs export`/`export-weekly`, any `bin/update.mjs` run, any write under a served folder or to `manifest.json`; any network request other than `npm run smoke` (R6); any library beyond `requirements.txt`; **any fit that predicts season 2025** (R1); the weekly layer, weekly P(plays), teammate absence, the `lines` and `oracle-*` arms (LP-2b); any change to LP-1a §8, its populations, splits or metrics.

## 2. Facts (cache = `.cache/panel/`; no model fitted, no 2019–2025 metric read; G5 uses 2014–2018)

- **G1 · Panel shape** — `lp/io.py` `load_cache` on the cache: `weeks` 125,970 rows (= `meta.counts.weeks`) with `pid` (str), `S`, `w`, `position`, `team`, `opp`, `home`, `roof`, `status` (`P`/`D`/`X`/null), `played`, `pts`, nine `RAW_COLS` (0 for an absent key on a played row, NaN when not played), `rw`, `rwOracle`, `depthOrder`, `inUniverse`, `rid`; `X` rows × 27 `meta.keys`; `seasons` with `hasRow`, `gamesPlayed`, `fantasyPoints`, `team`, `teamGames`, `age`, `draftYear`, `draftRound`, `draftOvr`, `undrafted`, `offPct`, `inSeasonUniverse`; `bench` S ≥ 2014. In `seasons.jsonl` the 469 rows without `hasRow` have 0 games and 0 points; `draftYear == 0` on 9 universe rows; `age` and `undrafted` are null on 234 rows, none in a season universe (`undrafted` is object dtype).
- **G2 · Team components** — first row of `teams.jsonl`: `off`/`def` objects (`plays`, `passPlays`, `rushPlays`, `epaSum`, `epaPlays`, `passEpaSum`, `passEpaPlays`, `proePlays`, `proePassPlays`, `proeXpassSum`, `pointsScored`, …); `lp/io.py:66` keeps only `team`, `S`, `w`, `opp`, `sum_*`.
- **G3 · Team codes are era codes** — `teams.jsonl` seasons per code: STL 2012–15 / LA 2016+, SD 2012–16 / LAC 2017+, OAK 2012–19 / LV 2020+; `lib/nflverse.mjs:1180` `eraTeam(abbr, season)` maps exactly these.
- **G4 · View** — `lp/asof.py:45–78`: `view(tables, S, 0)` gives `weeks`/`teams` (seasons < S), `seasons` (< S), `season_row` (`S_ROW_COLS`), `schedule` (season-S identity rows of `inUniverse` weeks), `team_weeks` (derived from `teams`, `:34`), `prior`; no `X`.
- **G5 · Point share by key** — played `weeks` rows 2014–2018, `|meta.weights[k]| × mean(X[:, k])` as a share of the position total, keys ≥ 1%: QB `pass_yd` 47.1, `pass_td` 36.5, `rush_yd` 6.2, `pass_int` 3.9, `rush_td` 3.4, `fum_lost` 2.0; RB `rush_yd` 38.5, `rec_yd` 16.8, `rush_td` 15.6, `rec` 10.3, `bonus_fd_rb` 6.6, `rec_td` 4.8, `kr_yd` 3.3, `bonus_rush_yd_100` 1.5, `fum_lost` 1.3; WR `rec_yd` 47.6, `rec` 18.4, `rec_td` 17.4, `bonus_fd_wr` 5.8, `kr_yd` 3.9, `pr_yd` 1.9, `bonus_rec_yd_100` 1.8, `rush_yd` 1.1; TE `rec_yd` 39.7, `rec_td` 18.0, `rec` 17.9, `bonus_rec_te` 17.1, `bonus_fd_te` 5.1. On TE played rows `X[bonus_rec_te] == X[rec]` does not hold on every row — it is its own target.
- **G6 · Universe** — `seasons.jsonl` rows with `inSeasonUniverse`, 2014–2025, per season: QB 79–108, RB 115–185, WR 163–306, TE 100–170 (2016 highest everywhere; 199 of its rows lack `hasRow`); 88.5% have ≥ 1 game; `offPct` null on 3–31% per season. Every universe pid 2012–2025 has an `inUniverse` week-1 row in `weeks.jsonl`. 2017 MIA and TB (no week-1 game) have **no** universe player. BUF and CIN have 16 `teams.jsonl` rows in 2022. 35–159 player-seasons per season were played outside the universe.
- **G7 · Evaluation code** — `lp/baselines.py:17` `season_targets(tables, T)`, `:93` `season_forecasts(tables, T)` (T ≥ 2015; columns `b1`, `b1c`, `b2`, `ridge`, `T`), `:32` `_prep`; `lp/metrics.py:10` `mae_pooled(err, folds, n_folds, rs, pidx)` (signed errors), `:20` `diff_pooled(abs_m, abs_b, …)`, `:26` `spearman_pooled(pred, actual, folds, n_folds, rs, min_rows, pidx)`, `:59` `label`, `:89` `gate`; `lp/bootstrap.py:13` `Resampler(player_ids, B, seed)`. `lp/report.py:66` `season_eval` hard-codes all seven folds.
- **G8 · Gamelogs** — `nflverse/gamelogs/2023.json`, key list of a game object: `week`, `seasonType` (`REG` and `POST` in every file 2012–2025; 2023: 5,900 / 276), `attempts`, `passingEpa`, `passingCpoe` (absent on some games), `passingAirYards`, `sacksSuffered`, `receptions`, `receivingYardsAfterCatch`, `carries`, `targets`, `rushingFirstDowns`, `receivingFirstDowns`, `rushingEpa`, `receivingEpa` (2024: on all 2,243 REG games with carries, all 4,240 with targets). Keyed by sleeper id; 14–49 played pids per season have no entry — `gl` NaN. `targetShare`/`airYardsShare`/`wopr`/`racr` there and in `nflverse/advstats` derive from the cache's `rec_tgt`, `rec_air_yd`, `rec_yd` — advstats is not read.
- **G9 · Not usable** — no `*_snp` weekly key (LP-1a F2); closing lines only (F1; never readable at (S, 0)); `college/receiving/2024.json` is keyed by CFBD `playerId`, no join in the cache.
- **G10 · Env** — `python3`: 3.9.6, numpy 1.26.4, pandas 1.5.3, scikit-learn 1.6.1, scipy 1.13.1. `HistGradientBoostingRegressor`: `loss='poisson'` needs y ≥ 0 and Σy > 0; deterministic with `early_stopping=False` and float arrays (source read).

## 3. Rulings (Anton, 2026-11-15; LP-1a rulings 1, 2, 6, 8 carry over)

- **R1. Registration is per layer.** The `weekly` section of a candidate is committed before any weekly test-fold metric, by an append mode that leaves the `season` section, its `specSha256` and `code` map byte-identical. LP-2b may not edit a season-hashed file. **The 2025 confirmation is held:** no 2025 run for either layer until both layers of both candidates are registered; this slice reports development folds only.
- **R2.** Inner selection may choose E0 or E1, on training seasons only; the verdict reports the choice per position and fold.
- **R3.** `gl` gains rushing and receiving EPA per play and joins H's descriptors; gamelogs features are inside both candidates.
- **R4.** The era-team mapping is a Python copy of `eraTeam` with a §15 entry and an equality test; no index line.
- **R5.** H's cohort mean never sees a training row's own season (§8.1).
- **R6.** `npm run smoke` stays (LP-1a ruling 6), the only network use.
- **R7.** Each candidate ends with a per-position median calibration (§7.3); the draft's trend-extrapolated era arm is dropped.
- **R9.** `def_*` and per-week `extras` load now (§5.1–5.2), so LP-2b edits no season-hashed file; `--smoke` exercises evaluation and report.
- **R8.** At origin (S, 0) the forecast is `games share × team games × points per game`; LP-2b replaces it with a sum over weeks for later origins.

## 4. Layout

```
lp/io.py            + load_teamctx(panel_dir)                     (additive)
lp/asof.py          + optional X, teamctx, extras in Tables/view  (additive, §5.1)
lp/extra.py         gamelogs season aggregates, year guard        (§5.2)
lp/era.py           era_team, league means, units, season weights (§5.3, §6)
lp/features.py      universe, kickoff roster, features            (§5.3–5.6)
lp/chain.py         targets, composition                          (§7.1, §7.4)
lp/model_h.py  lp/model_g.py                                      (§8)
lp/season_models.py fold driver: inner selection, calibration, ablations
lp/registry.py      registration and locks                        (§9)
lp/evaluate.py  lp/report_s2a.py                                  (§10, §11)
run_season_models.py   --smoke | --register [--reregister "<reason>"] | --dev [--write]   [--date] [--resamples 2000]
candidates/H.json  G.json
tests/synth_season.py  test_season_features.py  test_season_models.py  test_registry.py  test_evaluate.py
.cache/models/      git-ignored: season-preds.jsonl, run-log.jsonl
```

Artifacts (unregistered, Invariant 3 exception; aggregates only, ≤ 5 MB): `backtests/<date>-learned-s2a-dev-panel.json`, `grading/<date>-learned-s2a-dev-verdict.md`.

## 5. Inputs

### 5.1 As-of access (`lp/asof.py`, additive)

`Tables.__init__(weeks, teams, seasons, bench, X=None, teamctx=None, extras=None)`; `from_panel` unchanged; new `Tables.from_panel_full(panel, teamctx, extras)`. `view()` adds, when present: `v.X = tables.X[v.weeks["rid"].to_numpy()]` (row-aligned with `v.weeks`); `v.teamctx` = rows with `S′ < S`, or `S′ == S` and `w ≤ n`; `v.extras` = rows with `S′ < S`, or `S′ == S` and `w ≤ n` (per-week rows, §5.2). Every existing attribute is unchanged. Features, league means and training targets are read only through a view. Two named exceptions read `tables` directly, both membership-only and ex-ante: `features.universe(tables, S)` = pids of the season-S `seasons` rows with `inSeasonUniverse` (equal to `baselines.season_targets(tables, S)["pid"]` — asserted in T-M-3), and the fold driver's `baselines.season_targets(tables, s)` for `s ≤ T − 1` (the `actual` and `headline` of inner-validation seasons, §7.3). Training **targets** of season S′ come from `view(tables, S′ + 1, 0)`. Season-T outcomes are read only by `evaluate.py`.

`io.load_teamctx(panel_dir=PANEL_DIR)` → `team`, `S`, `w` + `off_<field>` and `def_<field>` for every numeric field of `off` and `def` (`def_*` is unused here; loaded for LP-2b, R9).

### 5.2 Gamelogs aggregates (`lp/extra.py`)

`MAX_SEASON = 2025`. `load_gamelogs_season(year, repo=REPO)` raises `LookAheadError` above it; reads `nflverse/gamelogs/<year>.json`, keeps `seasonType == 'REG'`, returns **one row per (sleeper id, `week`)**: `gl_att`, `gl_passEpa`, `gl_cpoeAtt` (`passingCpoe × attempts` when `passingCpoe` is finite, else 0), `gl_cpoeDen` (`attempts` on those games, else 0), `gl_passAy`, `gl_sacks`, `gl_rec`, `gl_yac`, `gl_carries`, `gl_tgt`, `gl_rushFd`, `gl_recFd`, `gl_rushEpa`, `gl_recEpa` (absent → 0). `build_extras(first=2012, last=MAX_SEASON)` → rows `pid` (str), `S`, `w`; `file_hashes()` → `{ year: sha256 }` of the gamelogs files 2012…`MAX_SEASON` (stateless). No team field is read. Season features sum a season's rows, then divide.

### 5.3 Universe, kickoff roster, era team

`era.era_team(abbr, season)` — **copy** of `lib/nflverse.mjs` `eraTeam` (§15). Every season-(S − l) lookup or comparison of a season-S team uses `era_team(team_k, S − l)`.

`kickoff(v, pids)` at origin (S, 0): `team_k` = `team` of the pid's lowest-`w` row in `v.schedule`; none → `v.season_row.team`; neither → NaN, and his `team` descriptors NaN. `teamGames_k` = count of `v.team_weeks` rows of `team_k`. **The kickoff roster of a team is always the season universe of the origin season of the features being computed** (`features.universe(tables, S)` for a view at (S, 0) — S − l for H's history descriptors, never the predicted season) with that `team_k`, whoever the features are computed for. A pid outside that universe (H's history descriptors only, §8.1) gets `team_k` by the same rule and is compared against that roster, never added to it. Null `age`, `undrafted`, draft fields → NaN.

### 5.4 Player-season aggregates

`player_seasons(v)` → one row per (pid, s) with a played row in `v.weeks`: `g` (played rows), sums of the raw columns and of every `meta.keys` column of `v.X`, `pts`; `lastTeam` (team of the last played week); `trailOut` (consecutive not-played rows at the end of his season-s rows, by `w`); `dWeeks` (`status == 'D'`); `depthEnd` (last non-null `depthOrder`); `late` (mean `oppo` of the last 6 played weeks ÷ season mean; NaN under 8). **`oppo`** = `pass_att + rush_att` (QB), `rush_att + rec_tgt` (others). A share = Σ player value ÷ Σ team value over the weeks he played, on that week's `team`; team sums from `v.teams` (`sum_rec_tgt`, `sum_rush_att`, `sum_rec_rz_tgt + sum_rush_rz_att`) and, for air yards, `v.weeks` summed by (team, s, w) (CR-10: sum components, then divide).

### 5.5 Kinds

`pg` — per game, exposure `g`. `po` — per unit of a denominator, exposure = its season sum. `raw` — everything else (shares, fractions, counts, flags, team and gamelogs quantities). **E1 divides `pg` and `po` values only, by `mu(P, q, s)` with P and q as listed in §5.6; `raw` is never divided.** Besides the §7.1 targets, two quantities have a league mean: `ppg` (`pts / g`) and `oppoPg` (`oppo / g`).

### 5.6 Features (`features.season_features(v, pids, units)`; lags l ∈ {1, 2, 3} are seasons S − l; missing → NaN; P = the row's position unless stated)

- **`hist`** — per lag: `pass_att`, `rush_att`, `rec_tgt` per game — `pg` with q = that opportunity where it is a §7.1 opportunity target of the position, otherwise `raw` (an off-position league mean is near zero); the rate of every other §7.1 target of the position (its kind and q); `ppg` (`pg`, q = `ppg`); and `raw`: `g`, `gs` (`gamesPlayed / teamGames`, NaN without a `v.seasons` row), `tgtShare`, `rushShare`, `rzShare`, `airShare`, `adot` (`rec_air_yd / rec_tgt`), `racr` (`rec_yd / rec_air_yd`), `offPct` (lags 1–2). Lag 1 only, `raw`: `late`, `tdPts` = (`pass_td`, `rush_td`, `rec_td` sums × their `meta.weights`) ÷ `pts`, NaN when `pts ≤ 0`.
- **`dur`** (`raw`) — `gs1`, `gs2`, `gs3` (shared with `hist`), `trailOut1`, `dWeeks1`.
- **`bio`** (`raw`) — `age`, `age²`, `exp` (`S − draftYear` when `0 < draftYear ≤ S`, else the count of earlier seasons with a `hasRow` row; capped at 10), `isRookie` (`draftYear == S`), `draftRound`, `logOvr` (`log(draftOvr)`; NaN when undrafted or null), `undrafted`, `isRookie × logOvr`, `(exp ≤ 1) × logOvr`.
- **`role`** — `depthEnd1`, `posRank1` = 1 + the number of **other** same-position kickoff-roster players with a strictly higher lag-1 `oppoPg` (NaN without lag-1 games) (`raw`); `compOpp`, `compTop` = sum and max of the other same-position roster players' lag-1 `oppoPg`, a mate without lag-1 games counting 0, no mates → 0 (`pg`, q = `oppoPg`).
- **`team`** — with `t1 = era_team(team_k, S − 1)`: `teamChange` (`lastTeam` of S − 1 ≠ `t1`; NaN without lag-1 games); from `v.teamctx`/`v.teams` season S − 1 rows of `t1`: `tmPassPg`, `tmRushPg`, `tmPtsPg` (`off_passPlays`, `off_rushPlays`, `off_pointsScored` ÷ games), `tmEpaPlay` (`off_epaSum / off_epaPlays`), `tmPassEpaPlay` (`off_passEpaSum / off_passEpaPlays`), `tmProe` (`(off_proePassPlays − off_proeXpassSum) / off_proePlays`); `vacTgt`, `vacRush` = 1 − (Σ over kickoff-roster pids of their S − 1 `rec_tgt`/`rush_att` on rows with `team == t1`) ÷ (`t1`'s S − 1 `sum_rec_tgt`/`sum_rush_att`); `qbNew` (the kickoff QB's `lastTeam` ≠ `t1`) — all `raw`. Kickoff QB = the kickoff-roster QB with the most S − 1 `pass_att` (> 0; ties → lowest pid; none → NaN): `qbYpa1` (`po`, P = QB, q = `pass_yd`), `qbTdRate1` (`po`, QB, `pass_td`), `qbAttPg1` (`pg`, QB, `pass_att`). On a QB row every `qb*` is NaN.
- **`gl`** (`raw`; from `v.extras`, lags 1–2; zero denominator → NaN) — `passEpaAtt`, `cpoe` (`gl_cpoeAtt / gl_cpoeDen`), `sackRate` (`gl_sacks / (gl_att + gl_sacks)`), `passAyAtt`, `yacRec`, `rushFdAtt` (`gl_rushFd / gl_carries`), `recFdTgt`, `rushEpaAtt` (`gl_rushEpa / gl_carries`), `recEpaTgt` (`gl_recEpa / gl_tgt`).

**`DESC`** (H's cohort inputs) = `bio` ∪ `role` ∪ `team` ∪ `gl` ∪ {`gs1`, `gs2`, `trailOut1`, `offPct1`}. G uses every feature. Missing values: H — `baselines._prep` then `StandardScaler`, medians and scaler refitted inside every fit; G — native. Every matrix is a float array.

## 6. Era handling (`lp/era.py`)

- **League mean** `mu(v, P, q, s)`: among position P's top-N of season s by Σ `oppo` — over every pid with a played row in `v.weeks`, ties at the cut by ascending pid (N = QB 32, RB 64, WR 96, TE 32) — Σ numerator ÷ Σ exposure.
- **E0** raw. **E1**: a `pg`/`po` feature of season s is divided by `mu[s]`; a **target** of season S′ by `mu[S′ − 1]`; a prediction for T is multiplied by `mu[T − 1]`. The target season's own mean is never used.
- **Raw fallback, once per fit:** a (P, q) whose `mu` is non-finite or ≤ 0 in any season from 2012 to the predicted season − 1 stays raw for the whole fit; listed in the verdict.
- **Season weights** `w(s) = exp(−λ · (s_max − s))`, `s_max` = the last season of the fit's training seasons 𝒯 — also inside every leave-out refit of that fit.
- **17 games:** all volume is per game or per opportunity; season length enters only through `teamGames_k`. **Drift:** §10.3.

## 7. The stat chain

### 7.1 Targets (fixed, from G5)

| Position | Opportunities per game (`pg`) | Per opportunity (`po`, denominator) | Per game direct (`pg`) |
|---|---|---|---|
| QB | `pass_att`, `rush_att` | `pass_yd`, `pass_td`, `pass_int` / `pass_att`; `rush_yd`, `rush_td` / `rush_att` | `fum_lost` |
| RB | `rush_att`, `rec_tgt` | `rush_yd`, `rush_td` / `rush_att`; `rec`, `rec_yd`, `rec_td` / `rec_tgt`; `bonus_fd_rb` / (`rush_att + rec_tgt`) | `kr_yd`, `bonus_rush_yd_100`, `fum_lost` |
| WR | `rec_tgt` | `rec`, `rec_yd`, `rec_td`, `bonus_fd_wr` / `rec_tgt` | `kr_yd`, `pr_yd`, `bonus_rec_yd_100`, `rush_yd` |
| TE | `rec_tgt` | `rec`, `rec_yd`, `rec_td`, `bonus_rec_te`, `bonus_fd_te` / `rec_tgt` | — |

**Yardage targets** = those ending `_yd`. Plus a **games-share** target per position: `gamesPlayed / teamGames` of S′ (`raw`), on every universe row (no `hasRow` → 0). Every other `meta.keys` key is **minor**: Σ key ÷ Σ `g` over the fit's training rows at the position, raw.

### 7.2 Training rows and weights

For training seasons 𝒯: rows = `features.universe(tables, S′)` for S′ ∈ 𝒯, features at origin (S′, 0), targets from `player_seasons(view(tables, S′ + 1, 0))` and that view's `seasons`. A `pg` target is fitted on rows with `g > 0`, weight `g · w(S′)`; a `po` target on rows with denominator > 0, weight `denominator · w(S′)`; games share on all rows, weight `w(S′)`. The `g`-weighted fit estimates E[season sum] ÷ E[games], so `E[games] × rate` is the expected season sum (likewise per opportunity).

Clipping applies to **predictions only**, in model units (before × `mu`), with bounds from that fit's own training targets (the inner fit uses its own): [min, max] of the target among training rows at or above the median exposure (median over rows with exposure > 0); additionally ≥ 0 for every non-yardage target; games share to [0, 1]. Training targets are not winsorised.

### 7.3 Inner selection and calibration (per candidate, fold T, position)

1. For every grid entry (§8), fit on 2014…T − 3 and predict T − 2 and T − 1 (`splits.inner_split`).
2. Choose the entry with the lowest MAE of composed season points (§7.4, c = 1) on those seasons' **headline** rows pooled by row (`actual`, `headline` from `baselines.season_targets(tables, s)`); a tie goes to the earlier entry.
3. `c` = median of `actual / predicted` over those rows of the chosen entry with both > 0; under 30 rows → 1.
4. Refit the chosen entry on 2014…T − 1, predict T, multiply by `c`.

### 7.4 Composition (`chain.season_points`)

Per-game key value = opportunity per game × rate (`bonus_fd_rb`: × the sum of both predicted opportunities), or the direct `pg` prediction, or the minor constant. `ppg = Σ_k meta.weights[k] × value_k` over `meta.keys`, unrounded. `games = share × teamGames_k`. `total = c × games × ppg`. The frame keeps `share`, `games`, `ppg`, `total`, `c` and every per-game key value.

## 8. The two candidates

### 8.1 H — partial pooling (`lp/model_h.py`; numpy + `sklearn.linear_model.Ridge`)

For one target (rate `r` in target units, exposure `e`) on training seasons 𝒯; `m_(−A)` = the cohort ridge of `r` on `DESC` fitted on 𝒯 without the seasons in A (weights §7.2), `m_all` on all of 𝒯:

1. **α** ∈ (1, 10, 100, 1000): the value minimising Σ over s ∈ 𝒯 of the weighted squared error of `m_(−{s})` on season s; one α per target and fit, used in every refit.
2. **History deviation** of row (i, S), lag l with `e_l > 0`: `D_l = r_(i,S−l) − m_(−A)(d_(i,S−l))`, where `d_(i,S−l)` are his descriptors at origin (S − l, 0) (any pid, seasons ≥ 2012, §5.3), `r_(i,S−l)` is in target units (under E1 ÷ `mu[S − l − 1]`), and **A = {S, S − l} ∩ 𝒯 for a training row, {P − l} ∩ 𝒯 for a predicted row of season P** (P = T in the refit, T − 2 or T − 1 in the inner fit). If 𝒯 without A is empty, or under E1 `mu[S − l − 1]` does not exist (S − l = 2012), that lag has `e_l = 0`. `e_l` is the raw exposure of S − l; for games share `e_l = 1` when a `v.seasons` row of S − l exists (with or without `hasRow`), else 0.
3. **Prediction** = `m°(d_(i,S)) + dev`, `dev = Σ_l δ^(l−1) e_l D_l ÷ (k + Σ_l δ^(l−1) e_l)`, and 0 when that denominator is 0; `m°` = `m_(−{S})` for a training row, `m_all` for a predicted row.
4. **(k, δ)** per position and target: minimise the weighted squared error of step 3 over training rows; `k = K_MULT ×` the target's median training exposure (rows with exposure > 0), `K_MULT` ∈ (0, 0.1, 0.2, 0.35, 0.5, 0.75, 1, 1.5, 2, 3, 5, 10), δ ∈ (0.5, 0.65, 0.8, 0.9, 1.0); first minimum, k outer.
5. **Grid:** (era, λ) for era in (E1, E0), λ in (0, 0.1, 0.2, 0.35) — 8 entries in that order.

### 8.2 G — gradient-boosted trees (`lp/model_g.py`)

`HistGradientBoostingRegressor(early_stopping=False, random_state=0)`, one model per position and target on all features, weights §7.2. `loss='squared_error'` for yardage targets and games share; `loss='poisson'` for every other target (target clipped to ≥ 0; an all-zero training target is a §12 stop). Points (`learning_rate`, `max_iter`, `max_leaf_nodes`, `min_samples_leaf`, `l2_regularization`): g1 (0.05, 100, 4, 20, 1.0); g2 (0.05, 200, 4, 20, 1.0); g3 (0.05, 200, 8, 20, 1.0); g4 (0.03, 300, 6, 40, 10.0). **Grid:** (era, λ, g) for era in (E1, E0), λ in (0, 0.2), g in (g1…g4) — 16 entries in that order; one entry per position and fold for all its targets.

## 9. Registration and locks (`lp/registry.py`)

`candidates/<name>.json` = `{ name, preregHash, layers: { season: { spec, specSha256, code, harness, data, taskFileSha256, registeredAt, python, requirements, reregistrations } } }`, written with `json.dumps(obj, indent=1, sort_keys=True)`. A layer is **stamped** when its `spec`, `specSha256`, `code`, `harness`, `data` and `registeredAt` are all non-null.

- `spec` = the machine-readable §5.6–§8 of that candidate — keys `features` (group → names with kind, P, q), `desc`, `targets`, `topN`, `grid`, `alphas`, `kMult`, `deltas`, `gPoints`, `losses`, `calibMinRows`, `seed` — **the only place the code reads these from**. Commit 1 holds both files with `spec` filled and every other season field `null` (unstamped).
- `registry.stamp(spec, code_paths, harness_paths)` → a stamped layer: `specSha256` (SHA-256 of `json.dumps(spec, sort_keys=True, separators=(',', ':'))`), `code` and `harness` = `{ path: sha256 }`, `data` = `{ panelGeneratedAt, panelDataRev, gamelogs: extra.file_hashes() }`, date, versions. It refuses unless every hashed path is tracked and identical to `HEAD`. Season `code`: `lp/io.py`, `asof.py`, `extra.py`, `era.py`, `features.py`, `chain.py`, `model_h.py` or `model_g.py`, `season_models.py`, `baselines.py`, `splits.py`. Season `harness`: `lp/evaluate.py`, `registry.py`, `report_s2a.py`, `report.py`, `score.py`, `metrics.py`, `bootstrap.py`, `run_season_models.py`.
- `--register` stamps the `season` layer of both files, sets `preregHash` (= `report.PREREG_HASH`) and `taskFileSha256` of this file (recorded, not checked). It refuses when the layer is already stamped, when a file's `spec` differs from its `HEAD` version, or when `.cache/models/run-log.jsonl` has a `dev` entry, unless `--reregister "<reason>"` (appends `{ at, reason, previous }`) — **a §12 stop first; only on Anton's ruling**.
- `registry.require(name, T, layer='season')` — layer-generic — raises `NotRegistered` unless the file is tracked and identical to `HEAD` (`git ls-files --error-unmatch`, `git diff --quiet HEAD --`), `preregHash` matches, the named layer is stamped, its `specSha256` recomputes, and every `code`, `harness` and `data` value of that layer matches disk. **For T ≥ 2025 it raises `ConfirmationHeld` unless both candidate files hold a stamped `season` and a stamped `weekly` layer** — never true in this slice. **`season_models.fold(T, …)` calls `require(name, T)` itself, before any fit, whenever T ≥ 2019**; T ≤ 2018 needs nothing.
- `registry.append_layer(name, 'weekly', spec, code_paths, harness_paths)` (for LP-2b; built and tested here): refuses unless `season` is stamped and `weekly` absent; adds `stamp(...)` as `layers.weekly` and writes the file with the `season` object untouched — its canonical JSON, `specSha256` and `code` map byte-identical, never re-hashed.
- `--smoke` predicts 2018 only, needs no registration, then runs `evaluate` and `report_s2a` with `folds = (2018,)` to stdout; it writes nothing. `--dev` calls `require(name, T)` for both candidates and every T in 2019…2024 **first**, then appends a `dev` run-log entry, then fits those folds for H, G and the §10.4 arms; `season-preds.jsonl`'s SHA-256 goes into the artifact.
- The runner's first step in every mode: `report.prereg_hash` of `.claude/tasks/learned-projection-1a-harness.md` equals `report.PREREG_HASH`, else return 2 — before `io.load_cache()`; then `score.parity` and `meta.generatedAt` = the anchor as hard stops.

No best-of-two: every label names its candidate.

## 10. Evaluation (`lp/evaluate.py`) — development folds only

### 10.1 Frame

`evaluate` and `report_s2a` take an explicit `folds` tuple (`DEV_FOLDS` under `--dev`, `(2018,)` under `--smoke`); rows of any other season are dropped. `sf` = `baselines.season_forecasts(tables, T)`, T ∈ `folds`, plus `h`, `g` (`total`) merged on (`pid`, `T`). A null candidate value on any universe row is a hard stop.

### 10.2 Season-gate labels — LP-1a §8 with `lp/metrics.py` unchanged

Per candidate and position: `f` = index of T in `folds`, `nf = len(folds)`; `rs = Resampler(pids of every universe row of the position in `folds`, B, seed=12345)`; `pi = rs.idx(rows["pid"])`.

- Rows vs **B2**: headline rows with `stratum == 'V'` (`b2` non-null — asserted). Rows vs **B1c**: headline rows with `b1_covered` and `b1c` non-null.
- `d = diff_pooled(|cand − actual|, |bench − actual|, f, nf, rs, pi)`; `benchMae = mae_pooled(bench − actual, f, nf, rs, pi)`; `rankCi = bootstrap.ci95(spearman_pooled(cand, actual, f, 6, rs, pidx=pi)["boot"] − spearman_pooled(bench, actual, …)["boot"])`; `label = metrics.label(d["value"], d["ci"], benchMae["value"], rankCi)`.
- Every label is printed "**unconfirmed** — the 2025 fold is held (R1)". `provisional = metrics.gate({ pos: { "B2": label_B2, "B1c": label_B1c } })` is reported as provisional; no candidate "passes" here.

### 10.3 Reported, not gated

- **vs RIDGE** (and raw B1) on headline, V, N, deep rows: the same `d`, CI, relative improvement, Spearman difference and label arithmetic, headed "report-only — no gate".
- Per candidate and set: MAE, mean signed error, Spearman with CIs; MAE per fold with `metrics.drift`; per-fold `d` against B2, B1c, RIDGE with the slope of `d` on T and its CI (`Resampler.per_fold_mean`). Drift and slopes are skipped when `len(folds) < 3`.
- Components: MAE of `games` vs `gamesPlayed`; MAE of `ppg` on rows with ≥ 1 game; per position and key Σ predicted ÷ Σ actual.
- Per fold and position: the chosen grid entry (era, λ, g), `c`; for H the `k` multiple, δ, α per target. H − G paired difference.

### 10.4 Exploratory — unlabelled, never a candidate

The candidate's chosen entry per fold and position with one change, `c` recomputed by one inner fit, reported as the change in pooled headline MAE with its CI and no label: a feature group removed (`gl`, `team`, `role`; `dur` — for H the group's members leave `DESC`, for G its columns are dropped, `gs` stays in `hist`); era forced to E0 and to E1; λ forced to each grid value; `c = 1`; a **direct arm** (same family predicting `ppg` in one model, same games model).

## 11. Verdict

Opens with one plain paragraph per position and candidate: vs the two-year average, recalibrated current model and RIDGE — points, percent, CI, unconfirmed label. Then: the label table; §10.3; §10.4 titled "Exploratory — not candidates, no label"; registration commit ids, hashes, `reregistrations`; kickoff fallbacks and raw-fallback quantities; run times; versions; LP-1a §8 verbatim with `preregHash`; and **stated limits**: 2025 is held, so no label is final and no candidate has passed the gate; benchmark numbers are pooled over six folds and differ from the seven-fold s1a/s1b tables; the kickoff roster is the week-1 listing; `teamGames_k` counts games played (BUF, CIN 2022: 16), as B2's total does; 2017 MIA and TB have no universe player; positions are a static 2026 capture; B1c's limits as in the s1b verdict; 2014–2015 universes rest on season-level statuses (membership only); no feature is asserted equal to an app factor.

**LP-2a passes** when the verdict exists, every §14 test is green and was shown red, both candidates were registered before their first test-fold fit (run-log and commit order), labels come from `lp/metrics.py` unchanged under the same `preregHash`, and no 2025 fit ran.

## 12. Stops (report to Session 1, never improvise)

- Any need to touch §1's **Out** or change what an imported function returns.
- Any change to a `code`, `harness` or `data` item or to `spec` after the first `--dev` run.
- `--smoke`: a candidate's 2018 headline MAE above B2's at ≥ 3 positions (report, do not tune).
- A relative improvement over B1c above 25% at any position — suspected leak: run T-M-1 on the real cache, report.
- A fold over 60 min, `--dev` over 6 h, an aggregate over 5 MB.
- The cache is absent or its `generatedAt` differs from the anchor.
- A target with no training rows or an all-zero Poisson target; any design question this file does not answer.

## 13. Done-definition

1. Code, tests, `candidates/*.json` with `spec` only; `python3 -m unittest discover -s research/learned-projection/tests -t research/learned-projection` green, T-PY-1 not skipped; each §14 test shown red once and restored; `--smoke` clean. **Commit 1** (includes this task file).
2. `--register`. **Commit 2** (the two candidate files only).
3. `--dev --write` (2,000 resamples). `npm test`, `npm run smoke` green. Docs: `research/learned-projection/README.md`; repo `README.md` → Module notes; `data-catalog.md` → Non-served artifacts (two names); `CLAUDE.md` navigation row names this task file (under 25,000 bytes). Nothing changed under a served folder or `manifest.json`. **Commit 3.** No push.

Hand back: the three SHAs; files touched; deviations; `preregHash` unchanged; the run-log; unconfirmed labels; the RIDGE table; chosen entries; run times; per test its assertion, defect and red confirmation.

## 14. Tests (each shown red once, then restored; panels from the new `tests/synth_season.py` — `tests/synth.py` is not edited)

- **T-M-1 as-of.** `season_features`, `kickoff`, `player_seasons`, `mu` at (S, 0) are identical across: as built; *scramble* — every outcome column, `X`, `teamctx`, `extras` and `sum_*` of season ≥ S randomised, plus `team`/`opp`/`home`/`roof` of every season-S week row except each universe pid's lowest-`w` row; *delete* — those season-S rows and the `teamctx`/`extras` rows of season ≥ S removed, outcome columns and `X` of the kept rows nulled, the season-S (`team`, `S`, `w`) rows kept with `sum_*` nulled. Also: at origin (S, 3) `v.teamctx` and `v.extras` hold no season-S row with `w > 3` and none of a later season; every pre-existing view attribute is equal with and without the optional tables. Fails if a feature reads a season-S outcome, a later-week roster row, or a week past the origin. Red: take `team_k` from the pid's highest-`w` row.
- **T-M-2 era units.** A target of S′ is divided by `mu[S′ − 1]`, a prediction for T multiplied by `mu[T − 1]`; `qbYpa1` on a WR row is divided by the QB mean; `compOpp` by `oppoPg`; `tmEpaPlay`, `cpoe`, `tgtShare` are never divided. Fails on the target season's own mean or a wrong (P, q). Red: de-normalise with `mu[T]`.
- **T-M-3 universe, kickoff roster, relocation.** `features.universe` equals `season_targets(...)["pid"]`; S − 1 targets 50 / 30 / 20 on a team where the 30 moved and the 20 is outside the universe → `vacTgt` 0.5; a non-universe pid gets a `team_k` but does not change a teammate's `posRank1`/`compOpp`; a 2020 `LV` player whose 2019 rows are `OAK` has `teamChange` false and finite `tm*`/`vac*`; a 16-game team in a 17-game season has `teamGames_k` 16. Fails if the roster includes non-universe players or a relocated team reads as a move. Red: compare `team_k` unmapped.
- **T-M-4 `era_team` equals `eraTeam`.** For the 35 team codes of `teams.jsonl` 2012–2025 (the 32 current ones plus `STL`, `SD`, `OAK`), hard-coded, × seasons 2012–2025, `era.era_team` equals `lib/nflverse.mjs` `eraTeam`, evaluated by `node --input-type=module -e` importing the original by absolute file URL (needs no cache; fails, never skips, if node is unavailable). Fails if the copy drifts. Red: change one cutoff year.
- **T-M-5 composition.** `total = c × share × teamGames_k × Σ weight × value` on a hand-built row with a `po` key, the two-denominator `bonus_fd_rb`, a direct key and a minor key. Fails on a hard-coded 17, a dropped minor term or a rounded `ppg`. Red: drop the minor constants.
- **T-M-6 H.** Synthetic players with known `k`, δ: the fit returns both within one grid step; zero history exposure gives exactly the cohort mean; with a recording ridge, the seasons behind each `D_l` of a training row (i, S) exclude S and S − l; for an inner-fit predicted row of season P they exclude P − l; a lag whose exclusion empties 𝒯 has `e_l = 0`; `k = 0` with no history gives the cohort mean, not NaN. Fails if the cohort mean has seen the row's own season. Red: A = {S − l}.
- **T-M-7 fold isolation.** H and G predictions for T are identical when every outcome of seasons ≥ T (weeks, `X`, `seasons` except `inSeasonUniverse` and the `S_ROW_COLS` of T, `teams` `sum_*`, bench, `teamctx`, `extras`) is randomised — covering inner selection, `c`, `mu`, the raw fallback, minor constants, clip bounds. Fails on any cross-fold leak. Red: compute `c` on season T.
- **T-M-8 weights and determinism.** Where the per-game rate rises with games, `games × rate` from the weighted fit is within 2% of the mean season sum and the unweighted fit off by more than 5%; `w(s)` equals `exp(−λ(s_max − s))` with `s_max = T − 3` in the inner fit and `T − 1` in the refit, and λ = 0 gives equal weights; two runs of each family are identical. Fails on an unweighted fit, a wrong `s_max` or an unseeded source. Red: `s_max = T − 1` in the inner fit.
- **T-M-9 league mean.** On a hand-built season `mu` equals Σ numerator ÷ Σ exposure over exactly the top-N by `oppo` (a player ranked N + 1 does not move it; it is not the mean of player rates); a (P, q) with one non-positive season is raw in every season of the fit. Fails on a mean of rates, a wrong N or a per-view fallback. Red: average the player rates.
- **T-M-10 registration.** In a temporary git repository: `require` raises for T = 2019 when the file is missing, untracked, modified, unstamped, or carries a stale `preregHash`, `specSha256`, `code`, `harness` or `data` value — for `layer='season'` and for `layer='weekly'`; passes when clean; T = 2018 needs nothing; `season_models.fold(2019, …)` called directly, unregistered, raises before any fit; `--register` refuses after a `dev` run-log entry, on an already-stamped layer, on a `spec` differing from `HEAD`, and when a hashed path differs from `HEAD`; `--dev` run unregistered raises and leaves no run-log entry. Fails if a test-fold fit can start unregistered. Red: skip the `harness` comparison.
- **T-M-11 held confirmation and append.** `require(name, 2025)` and `require(name, 2026)` raise `ConfirmationHeld` with a stamped season layer, and with a stamped weekly layer on one candidate only; pass with both layers stamped on both; `--dev` never requests 2025. In the temporary repo a season-hashed file is changed **and committed** (so `require(season)` now fails) and included in the weekly paths; `append_layer` succeeds and `json.dumps(layers["season"], indent=1, sort_keys=True)` is byte-identical before and after; it refuses an unstamped season or an existing `weekly`. Fails if 2025 can run in this slice or the append rewrites the season section. Red: let `append_layer` re-stamp the season `code`.
- **T-M-12 label wiring.** Hand-built frame: B2 rows are stratum V only; B1c rows covered only; a 2025 row in the frame is ignored; a null candidate value raises; the label equals `metrics.label` on hand-computed inputs, with `mae_pooled` fed signed errors; with `folds = (2018,)` it runs, a 2018-only pid is in the resampler universe and drift is skipped. Fails if 2025 enters the pooled label, uncovered rows are scored or the one-fold smoke path crashes. Red: pool over `TEST_SEASONS`.
- **T-M-13 gamelogs reader.** `load_gamelogs_season(2026)` raises; a `POST` game is not summed; `cpoe` is attempt-weighted and skips games without one; `v.extras` at (S, 0) holds no season ≥ S (fixture: a hand-written file under `tests/fixtures/`). Fails on a look-ahead read, a post-season sum or an averaged rate. Red: drop the `seasonType` filter.
- **T-M-14 prereg pin.** `run_season_models.main` returns 2 on a task-file copy with one §8 character changed, with `io.load_cache` patched to raise. Fails if the check is missing or runs after the load. Red: move it below the load.

## 15. Copied definitions

| Copy | Original | Test |
|---|---|---|
| `lp/era.py` `era_team(abbr, season)` — `LA` ≤ 2015 → `STL`, `LAC` ≤ 2016 → `SD`, `LV` ≤ 2019 → `OAK`, else unchanged | `lib/nflverse.mjs` `eraTeam` (a CR-16 Data site; the copy stays inside this repo — no index line, R4) | T-M-4 (evaluates both sides) |

Nothing else is copied.

## 16. Later — LP-2b

Outline in `learned-projection-2b-weekly-models.md`: weekly layer via `append_layer`, no season-hashed edit (§9), owns the 2025 confirmation.

## Fix pass 1

From the full implementation review of `a0eab8f..47b3434` (2026-11-16). **Tests only.** The `code`/`harness` files of §9 are registered and frozen (§12): **no file in a stamped `code` or `harness` map, no `candidates/*.json`, no artifact under `backtests/` or `grading/` is changed by this pass.** A red step may edit such a file temporarily; after each red, `git diff --quiet HEAD -- research/learned-projection/lp research/learned-projection/run_season_models.py research/learned-projection/candidates` must pass, and at the end `registry.require(name, T)` passes for both candidates and every T in 2019…2024. Edits go only in `research/learned-projection/tests/`. One commit, `LP-2a: fix pass 1 (tests)`; no push. If any item needs a non-test edit to work, stop and report.

1. **G seed (review flag 2) — `tests/test_season_models.py`, class `TestWeightsDeterminism`.** Add `test_g_receives_seed`: patch `lp.model_g.HistGradientBoostingRegressor` with a `mock.Mock(wraps=<the real class>)`, call `model_g.fit_target` once on a tiny float frame with `spec["seed"] = 12345`, and assert every constructor call has `random_state == 12345` and `early_stopping is False`. Asserts G is seeded from the spec; fails if `random_state` is dropped or not read from `spec`. Red: remove `random_state=spec["seed"]` from `lp/model_g.py` temporarily.
2. **Lock constants (flag 5) — `tests/test_registry.py`.** Add `test_lock_constants_match_splits`: `registry.EVAL_START == season_models.EVAL_START == splits.DEV_FOLDS[0]`, `registry.CONFIRM_SEASON == splits.CONFIRM_FOLD`, and `splits.DEV_FOLDS[-1] + 1 == splits.CONFIRM_FOLD`. Names `lp/splits.py` as the original (copied-definitions rule). Fails if a guard constant drifts from the split definitions. Red: set `season_models.EVAL_START = 2020` temporarily.
3. **Spec equals registered spec (flag 6) — `tests/test_registry.py`.** Add `test_default_spec_is_the_registered_spec`: for `H` and `G`, `json.loads(json.dumps(spec.default_spec(name), sort_keys=True)) == json.load(open(candidates/<name>.json))["layers"]["season"]["spec"]` (read the file directly, real repo path). Fails if the tests' spec builder drifts from what was registered. Red: change one `kMult` value in `lp/spec.py` temporarily.
4. **One-fold universe (flag 7, second half) — `tests/test_evaluate.py`, `test_one_fold_smoke_path`.** Also evaluate the same frame without the `QB_only2018` row and assert `out["QB"]["h"]["labels"]["B2"]["n"]` is exactly 1 larger with it (if the `QB1` copy is not a headline stratum-V row, pick the first QB headline V row of 2018 instead). Fails if a 2018-only pid is dropped from the pooled rows. Red: drop the added row before the second evaluate.
5. **Weekly stale hashes (flag 8) — `tests/test_registry.py`, `test_weekly_layer_checks`.** Mirror `test_stale_hashes` for `layer='weekly'`: a stale `preregHash`, an edited weekly `spec` (its `specSha256` no longer recomputes), and a changed file of `WEEKLY_CODE` each make `require(..., 'weekly')` raise; each restored state passes. Fails if the weekly layer skips a check the season layer makes. Red: in `registry.require` temporarily skip the `specSha256` comparison.

**Left alone (Session 1 triage):** flag 1 (§10.4 arms pooled over unequal fold subsets) — exploratory and unlabelled; fixing it needs a hashed file; recorded as a stated limit in the Verification and carried to LP-2b. Flag 4 (`--register` before the anchor check), the unused `spec` import in `run_season_models.py`, and flag 9 (verdict prints the registration commit as "code commit", no hash maps) — hashed files; recorded in the Verification and carried to LP-2b. Flag 7, first half (δ recovery is a direction check) — accepted: the grid's lower half is the meaningful band. Flag 3 (`learned-projection-3-audit-architecture.md` in Commit 1) — Anton's call, not this pass.

Hand back: the commit SHA, files touched, and per new test its assertion, defect and red confirmation, plus the final `git diff --quiet` and `require` results.

## Verification

Session 1, 2026-11-16. Reviewed the diff `a0eab8f..47b3434` and the fix diff `52362af`, not the hand-back alone.

- **Commits (main, unpushed):** `7093a9d` code, tests, unstamped specs, task files (the **code commit**; the verdict's "code commit (HEAD)" line prints `73b34f5`, review flag 9) · `73b34f5` registration (candidate files only) · `47b3434` dev verdict, aggregate, docs · `52362af` fix pass 1 (tests) · this commit (verification record, 2b carry-over lines).
- **Review:** full (opus, high), 9 flags, none blocking. Fixed in Fix pass 1: 2, 5, 6, 7 (second half), 8. Accepted: 1 (stated limit below), 7 (first half). Deferred to LP-2b (hashed files): 4, 9, the unused `spec` import. Flag 3 — Commit 1 also carries `learned-projection-3-audit-architecture.md` (parked, "do not implement") and the 2b outline: kept, since rewriting unpushed commits would blur the registration-before-fit evidence; Anton decides at sign-off.
- **Fix-pass re-review:** light (sonnet) — no flags. Five new/extended tests, each shown red with its defect and restored; no stamped file changed.
- **Locks:** stamped `code`/`harness`/`data` hashes equal HEAD; `specSha256` recomputes; `preregHash` `7ff9087f…e24e5a` unchanged; registration commit 17:23:49Z before the only `dev` run-log entry 17:24:03Z; `season-preds.jsonl` holds no 2025 row; `require` passes for H and G, T 2019–2024, after the fix pass.
- **Checks:** Python suite 66 OK at `52362af` (T-PY-1 run); `npm test` 2150 pass / 0 fail and `npm run smoke` exit 0 at `47b3434` (the fix pass touched Python tests only).
- **Result (unconfirmed, 2025 held):** QB, RB, WR — H and G `beats` B2; RB, WR `beats` B1c; QB vs B1c no-difference; TE no-difference throughout; provisional gate False for both. Against RIDGE (report-only) no candidate is clearly better anywhere; G at WR beats on arithmetic only.
- **Stated limits added by verification:** §10.4 era and λ arms pool only the folds where the forced value differs from the chosen one, so their row counts differ from the other arms (flag 1); H's α often sits at the grid maximum 1000, so the α grid may be short — a note for LP-2b, the season spec is frozen.
