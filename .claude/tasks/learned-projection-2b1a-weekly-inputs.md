# LP-2b-1a · Learned projection research — weekly inputs (trim, season prior, rows, targets, features, era blend)

**Status:** plan, **Revision 3.1** (Session 1, data repo, 2026-11-17). First of two slices split from LP-2b-1 Revision 1 (`learned-projection-2b-weekly-models.md`, reviewed 2026-11-17 at full depth). Revision 1 of this file: full review, 18 flags, all fixed in Revision 2; Revision 2: full review, 9 flags, all fixed in Revision 3; Revision 3: full review of the changes, 5 flags (none blocking), fixed in Revision 3.1 (§18). **Approved by Anton 2026-11-17 (Revision 3.1).**
**Review depth: full** — the inputs every weekly candidate is later registered on; as-of and held-season guards.
**Session 2:** **sonnet**, effort **high**, inside `sleeper-dashboard-data/`; read its CLAUDE.md first. Python only, under `research/learned-projection/` (paths relative to it unless they start with a repo folder).
**Anchors:** data `main` @ `5fad322` (planned at `1fe499a`; the commits since touch captures, docs and agent files only, nothing under `research/`); cache `.cache/panel/` `meta.generatedAt` `2026-11-12T23:44:16.940Z`; LP-1a §8 `preregHash` `7ff9087fc4848b0df90383fc5e4397d3d4b085466c228b430211a63ad6e24e5a`; `.cache/models/season-preds.jsonl` SHA-256 `b2fafc889c05b27d2b89c7eea2b710739db5c2ee36f12d924fab1d20768a46a2`; canonical season sections (`json.dumps(layers.season, indent=1, sort_keys=True)`) SHA-256 — H `572792a2214653ac6d09be5f375113160d5a157461b141c63255951cc087301c`, G `12bd9025530022eab79bc27cafc93e94cfd7d497ee715b87f872196b01090500`.
**Series:** LP-2a → **LP-2b-1a** → LP-2b-1b (outline, §19) → LP-2b-2 (outline, §19) → LP-3.

---

## 0. What this is, for Anton

The inputs the weekly models will learn from: each player-week of 2018–2024 with its season forecast, what he had done so far that season, who on his team was missing, the opponent's defence, and the league's in-season level — built strictly from what was known before the game, with 2025 cut off at the door. No model is fitted, no forecast is scored. The output is a facts file Session 1 checks before any weekly model is committed.

## 1. Scope

**In:** §6–§17.

**Out (each a §14 stop):** any weekly model, P(plays), calibration, composition of points, registration, label or metric comparing a forecast with an outcome (LP-2b-1b); any write to `candidates/*.json`; loading `benchw` or B4; any edit to a season-hashed path — `lp/io.py`, `asof.py`, `extra.py`, `era.py`, `features.py`, `chain.py`, `model_h.py`, `model_g.py`, `season_models.py`, `baselines.py`, `splits.py`, `evaluate.py`, `registry.py`, `report_s2a.py`, `report.py`, `score.py`, `metrics.py`, `bootstrap.py`, `run_season_models.py` — or to `lp/spec.py`, `lp/sleeper.py`, `run_benchmarks.py`, `fetch_sleeper_projections.py`, `tests/synth.py`, `tests/synth_season.py`, any existing test file; any file outside `research/learned-projection/` except the four doc files of §15, this task file, the superseded Revision 1 file (§15) and the one artifact; any Node, app or cross-repo-index file; `node bin/learned.mjs`, `bin/update.mjs`, any write under a served folder or to `manifest.json`; any network request other than `npm run smoke`; any library beyond `requirements.txt`; **any season-2025 row or value in a table past the trim, a feature or a fit** (§6).

## 2. Facts (Session 1, 2026-11-16/17; confirmed by the two 2026-11-17 full reviews)

- **F1 · Weekly universe** (`weeks` with `inUniverse`): 9,089–10,179 rows per season 2018–2024 (2021 highest); 2018–2023: 57,420 rows, 38,697 played.
- **F2 · No season prior for 7%.** 2018–2024: 3,096 of 45,395 played weekly-universe rows have (pid, S) outside the season universe (QB 121, RB 809, WR 1,358, TE 808); mean `pts` 3.0.
- **F3 · Season layer as built.** `season_models.refit` returns `(frame, info, units)`; `fit_family` returns `(preds, info)` — per-target predictions clipped (`season_models.py:226-227`) and de-normalised (native). `season-preds.jsonl`: `cand` is lowercase `h`/`g`; composed values only (`share`, `games`, `ppg`, `total`, `c`, `kv_*`; arm rows carry `arm`); 6,750 composed rows, no `null` today, though non-finite values would be written as `null` (`run_season_models.py:143`).
- **F4 · Earliest season the registered procedure runs:** 2018 (`inner_split(2017)` has one inner season).
- **F5 · Trimming is neutral for the season layer:** per-player season features do not depend on which later-universe subjects are present (`features.py:153-321`); position is constant per pid; an untrimmed `view(2025, 0)` holds no 2025 week row; `Store.max_season` is unused. The §7 equality check confirms it on the real cache.
- **F6 · `features.player_seasons(v, keys)`** gives per (pid, s) over `v.weeks` played rows: `g`, sums of `RAW_COLS` and of every `X` key, `pts`, `oppo`, the four CR-10 shares (`tgtShare`, `rushShare`, `rzShare` from `v.teams`; `airShare` from `v.weeks` summed by (team, S, w)), `lastTeam`. Opportunity targets and `po` denominators are raw `weeks` columns (`io.RAW_COLS`), not `X` keys.
- **F7 · Team context** (`io.load_teamctx`): one row per (team, S, w). `features.season_features` divides team totals by `n` = that team's `teamctx` row count (`features.py:256-279`; formulas `:274-279`); `gl` ratios `:311-319`. Defence fields: `def_plays`, `def_passPlays`, `def_rushPlays`, `def_epaSum`, `def_epaPlays`, `def_passEpaSum`, `def_passEpaPlays`, `def_rushEpaSum`, `def_rushEpaPlays`, `def_successes`, `def_successPlays`, `def_rzTripsAllowed`, `def_rzTdTripsAllowed`, `def_pointsAllowed`. `tests/synth_season.py:52-53` sets `off_plays = off_epaPlays = off_proePlays = 60` and few `def_*`.
- **F8 · 2025 bytes touched before the trim** (none reaches a table past the trim, a feature or a fit): `io.load_cache` parses every row; `io.load_teamctx` parses every row; `registry.require` hashes the gamelogs files via `extra.file_hashes()` (2025 included). The gamelogs are loaded with `extra.build_extras(last=LAST_SEASON)`, so the 2025 gamelogs file is never parsed.
- **F9 · `Store.feats(S)` covers `subjects(S)`** = the universes of S…S + 3 (`season_models.py:44-59`); a non-universe pid is in it only if he joins a later universe — future information. `features.season_features(v, pids, roster, …)` computes `bio` for any pid list from `v.season_row` and `v.seasons`.
- **F10 · `tests/test_asof.py` `scrambled`/`deleted`** (`:30-70`) rebuild `Tables(w, tm, se, be)` without `X`, `teamctx`, `extras`; `deleted` drops later `seasons`/`bench` rows.
- **F11 · Every team's last game is the season's final week** (2018–2025).
- **F12 · `report.cohort_eval` filters `weeks` on `TEST_SEASONS` (2025 included)** — for LP-2b-1b.
- **F13 · The season lock is reached through the module.** `season_models.fold` calls `registry.require(name, T, "season", env)` itself for T ≥ 2019 (`season_models.py:318-322`), via the `registry` module attribute; the real check reads the candidate files' git state, `.cache/panel/meta.json` and the gamelogs hashes (`registry.py:50-53`, `:173-206`). `mock.patch.object(registry, "require", …)` intercepts both the runner's and `fold`'s calls.
- **F14 · `make_panel` is too uniform for these tests:** `opp = "ZZZ"` on every row (`synth_season.py:37,50`), every `seasons` row `inSeasonUniverse = True` (`:57,141`), `rwOracle = False` (`:40`), no byes (`:90-98`), `teamctx` with only `def_plays` and `def_pointsAllowed` (`:52-53`). `baselines.season_targets` indexes the raw `inSeasonUniverse` column (`baselines.py:20`), so it must hold booleans.

## 3. Rulings

### 3.1 Anton, 2026-11-16 (verbatim, before any weekly or 2025 result)

> 1. **Progression per position (replaces the outline's "only a candidate that passed the season gate").** LP-2a: neither H nor G passes the season gate (beats B2 and B1c at RB and WR only; QB beats B2, ties B1c; TE ties). For both candidates, the weekly layer is built for all four positions; weekly labels (LP-1a §8 per-position arithmetic, `preregHash` `7ff9087f…e24e5a` unchanged) are **labelled for RB and WR** and **report-only for QB and TE**. The overall weekly gate (3 of 4) is still computed and printed; it is expected to fail by construction and is not the product decision. State this rule and its date (2026-11-16, before any weekly or 2025 result) in the verdict.
> 2. **Carried from LP-2a, fix in new modules only:** flag 4 (`--register` before the anchor check), flag 9 (verdict prints the registration commit as "code commit"), unused `spec` import — never in a season-hashed file (outline lists them). H's α at the top of its grid: report whether the weekly prior inherits it; no season-layer refit.
> 3. **Workflow:** follow the data repo's pre-verification rebase rule (`1fe499a`): rebase onto `origin/main` before writing `## Verification`; self-cited IDs only after it; the sign-off request carries the `Rebased onto origin/main` line. The verdict prints file/registration hashes, not its own commit IDs, where possible.

### 3.2 Anton, 2026-11-17 (verbatim)

> Split. 2b-1a: trim, season prior, weekly rows, targets, features and era blend, with T-W-1/2/3/6/7 — no model, registration or metric. 2b-1b: models, P(plays), cross-fitting, registration, evaluation and the dev run, planned only after 2b-1a is verified. Address every flag that falls in 2b-1a's scope (blocking 1–2, should-fix 4–5 where they touch inputs, and the notes), carry the rest into the 2b-1b outline, then re-run plan-reviewer on 2b-1a at full depth.

Anton, 2026-11-17, on the review of Revision 1: "Yes, revise" (all 18 flags).

### 3.3 Carried from LP-2b-1 Revision 1 §4

Weekly training starts 2018 (F4). Within-season era blend with `eraN0 = 4` (§9). The `lines` arm is deferred to LP-3. LP-2a R1 (2025 held; no season-hashed edit) and R6 hold.

## 4. What this slice hands to LP-2b-1b

The modules of §5, frozen by verification (2b-1b may change them only through its own task file, before its registration — they enter its hashed `code` map); `.cache/models/season-prior.jsonl` and `.cache/models/weekly-inputs.pkl` with SHA-256 recorded; the facts artifact.

## 5. Layout

```
lp/spec_w.py         inputs_spec(): groups → feature names, targetCols, priorCols, gRecDecay, eraN0, trainFrom 2018 (not hashed, like spec.py)
lp/weekly_data.py    LAST_SEASON, seasons(), trim, trim_frame, assert_trimmed, guard, rows_at, targets_at,
                     team_block, gl_block, bio_block, inputs_at, attach_prior                     (§6, §10–§11)
lp/season_prior.py   derive, prior_refit, check_against_file, fallback                          (§7–§8)
lp/era_w.py          season_only, mu_std, ratio, blend                                           (§9)
run_weekly_inputs.py --check [--write] [--date]; main(argv=None, deps=None)                     (§12)
tests/synth_weekly.py  test_weekly_inputs.py  test_season_prior.py
.cache/models/       git-ignored: season-prior.jsonl, weekly-inputs.pkl
```

Artifact (unregistered, Invariant 3 exception; facts only, ≤ 1 MB): `backtests/<date>-learned-s2b1a-inputs.json`.

## 6. Trim and the held season (`lp/weekly_data.py`)

- `LAST_SEASON = 2024`; a test asserts `== splits.CONFIRM_FOLD − 1`. **The single source** of the held boundary: every function below reads `weekly_data.LAST_SEASON` **at call time** (never a default argument value, never `spec_w`). `seasons()` = `range(spec_w.inputs_spec()["trainFrom"], LAST_SEASON + 1)` — the prior and input seasons.
- `trim(tables, last=None)` (`last=None` → `LAST_SEASON`) → new `asof.Tables(weeks, teams, seasons, bench, X, teamctx, extras)`: rows with `S > last` removed from `weeks`, `teams`, `seasons`, `bench`, `teamctx`, `extras` (in memory — `trim` reads nothing from disk); `X` **copied**, every row whose rid is not in the kept `weeks["rid"]` set to NaN (rid alignment kept).
- `trim_frame(df, last=None)` drops rows with `S > last` (for `benchw`/B4 in LP-2b-1b).
- `assert_trimmed(tables, last=None, frames=())` raises `AssertionError` unless max `S ≤ last` in `weeks`, `teams`, `seasons`, `bench`, `teamctx`, `extras` and every frame passed, and every `X` row whose index is not in `weeks["rid"]` is all-NaN.
- `guard(S, confirm=False)` raises `registry.ConfirmationHeld` when `S > LAST_SEASON` unless `confirm=True`. Called first by `derive`, `fallback`, `mu_std`, `bio_block`, `inputs_at` and `targets_at` (cheap defence for LP-2b-1b and LP-2b-2, which may call them on untrimmed tables). No code in this slice passes `confirm=True`.

## 7. Season prior (`lp/season_prior.py`)

- `prior_refit(store, spec, family, pos, T, entry)` — **copy** of `season_models.refit`'s body up to and including the `fit_family` **call** (`fit_family` is called, not copied — its clip stays inside it): `mu = store.mu(T)`, `tr = list(splits.train_seasons(T))`, `u = era.Units(mu, entry["era"], T − 1)`, `d = season_models.build_data(store, spec, pos, tr, [T], u, (), False, hist=(family == "H"))`, `preds, info = season_models.fit_family(family, spec, d, pos, entry["lam"], entry.get("g"), u, False, store, targets)` with `targets = store.spec_for(False)["targets"][pos]` (what `refit`'s `_targets` returns), `minor = store.minor(tr, pos)`; returns `(preds, d, minor, info)`.
- `derive(store, name, spec, T, env=None, confirm=False)`: `guard(T, confirm)`; `main, out = season_models.fold(store, name, spec, T, env)` (calls `registry.require(name, T, "season", env)` itself for T ≥ 2019); per position `prior_refit(..., out["details"][pos]["entry"])`; **hard check**: `season_models.compose(store, spec, pos, d, preds, minor, out["details"][pos]["c"])` equals the position's `main` rows exactly (pids in order; `share`, `games`, `ppg`, `total`, every `kv_*`; NaN equals NaN). Returns one frame row per (pid, T, position): `pr_<t>` for every weekly target (§10) and `pr_gamesShare` (native units, unblended), `c`, `era`, `lam`, `g` (G only), and for H `alpha_<t>` per season target.
- `check_against_file(derived, path, sha)`: the file's SHA-256 equals `sha`, else raise. For candidate `h`/`g` (lowercase, F3) and T in `[T for T in splits.DEV_FOLDS if T in weekly_data.seasons()]` (no season literal): the file's rows of that `cand` without an `arm` key have the same pid set per T as the derived composed rows, and equal values on `share`, `games`, `ppg`, `total`, `c` and every `kv_*`, `|Δ| ≤ 1e-9 × (1 + |x|)`; a JSON `null` is read as NaN and equals a derived NaN. Any miss raises.
- Seasons `weekly_data.seasons()` (2018…2024) for H and G; 2018 has no file reference (the compose check still runs). Cached as `season-prior.jsonl`.

## 8. Fallback prior (F2)

`fallback(tables, store, S)`: `guard(S)`; reads only `v = asof.view(tables, S, 0)`. Pool = `v.weeks` rows of seasons 2014…S − 1 with `inUniverse` and `played` whose (pid, s) is **not** in `features.universe(tables, s)` (membership only, the 2a exception). A row's position is `store.pos[pid]` (the static map 2a uses), not the `weeks` column. Per position and weekly target: Σ numerator ÷ Σ exposure over the pool (§10 definitions); `gamesShare` = Σ `played` ÷ row count over all `inUniverse` rows of the pool's (pid, s). An empty pool → NaN (reported). One rule for training and test rows; it reads only seasons before the row's own, so it is as-of for every row and for every later cross-fit group (recorded for 2b-1b).

## 9. Era blend (`lp/era_w.py`)

- `season_only(v)`: a shallow copy of `v` whose `weeks` keeps the season-`v.S` rows, `X` the same rows (`v.X[mask]`), `teams` the season-`v.S` rows; other attributes unchanged.
- `mu_std(tables, store, S, n)`: `guard(S)`; `era.league_means(features.player_seasons(season_only(asof.view(tables, S, n)), store.keys), store.struct)` restricted to season S (`{(P, q): d[S]}`); empty at n = 0.
- `ratio(mu, store, S, P, q)` = `mu[(P, q)] / store.mu(S)[(P, q)][S − 1]` when both exist, are finite and > 0, else 1.
- `blend(prior, ratio, n, n0)` = `prior × (1 + ω (ratio − 1))`, `ω = n / (n + n0)`, `n0 = spec_w["eraN0"]`. Applied by `attach_prior` to the `pg`/`po` weekly targets; never to `pr_gamesShare`.

## 10. Weekly rows and targets (`lp/weekly_data.py`)

**Weekly targets** of position P = its season targets (2a §7.1) except `gamesShare`. Names in `inputs_spec()["targetCols"]`.

- `rows_at(v)` = `v.schedule` rows with `w == v.n + 1` and `inUniverse` (`pid`, `S`, `w`, `position`, `team`, `opp`, `home`, `roof`). The runner asserts the (pid, S, w) set per season of `seasons()` equals `baselines.build_weekly_frame(T_trim, seasons=seasons())`'s.
- `targets_at(tables, rows, store)`: `guard` on every row's S; outcome by design — never called by `inputs_at`, `fallback` or any feature builder. For each row, per weekly target t: columns `r_<t>`, `e_<t>` from that week's `weeks`/`X` row — `pg` → `r` = the week's `X` key, or the raw column for `pass_att`, `rush_att`, `rec_tgt` (F6), `e = 1`; `po` → `r` = key ÷ Σ denominator raw columns, `e` = that sum, and `e = 0`, `r` NaN when it is 0; not played → `e = 0`, `r` NaN. Plus `played`, `pts`.

## 11. Features

`inputs_at(tables, store, S, n, spec_w, bio)`: `guard(S)`; builds `v = asof.view(tables, S, n)` itself and reads only `v`, `store.keys` and the `bio` frame passed in (the output of `bio_block(tables, store, S, pids)` for season S — the caller computes it once per S); emits row identity plus exactly the names of every non-prior group of `inputs_spec()` (asserted). `attach_prior(frame, prior, fallback, mu, store, spec_w)` adds the `prior` group.

For row (pid, S, w = n + 1), team τ (the row's `team`), opponent o, position P; **to-date** = season-S rows with `w ≤ n`; w′ = τ's last `v.team_weeks` week < w (none → `first = 1`). "His row at w′" = his `v.weeks` row of week w′ on any team (a traded player's status follows him); no row → treated as no row.

- **`form`** per weekly target t (not `gamesShare`) — `ex_<t>` (Σ exposure to date), `std_<t>` (Σ numerator ÷ Σ exposure; NaN at 0), `rec_<t>` (same with weight `gRecDecay^a` per played week, a = his later played weeks to date, `gRecDecay = 0.7`); `nP` (played weeks to date), `wk` (= w).
- **`usage`** — `ps = features.player_seasons(era_w.season_only(v), store.keys)` (reuse): `tgtSh`, `rushSh`, `rzSh`, `airSh` (its four shares), `oppoPg` (`oppo / g`). Last 3 played weeks: `player_seasons` on `season_only(v)` with `weeks`/`X` cut to each pid's last 3 played season-S rows and `teams` uncut → `tgtSh3`, `rushSh3`, `rzSh3`, `oppoPg3`; its `airShare` is **discarded** (its team air-yard sum comes from the cut `weeks`, F6).
- **`avail`** — `playedPrev` (his row at w′ is played), `runP`, `runN` (consecutive τ team-game weeks ≤ n he played / did not play, counted back from w′; "played week x" = he has a played row of week x on any team, so a traded player's games for his old team count; a τ week without any row of his counts as not played), `wkSince` (τ team-game weeks since his last played week; NaN if none in S), `prevD`, `prevX`, `prevNone` (his row at w′: `status` `D`, `X`, or no row / null), `rwPrev_ACT`/`_INA`/`_RES`/`_PUP`/`_other` (the statuses in his row-at-w′ `rw` pairs; all NaN where the view masks `rw` or he has no row), `depthPrev`, `depthChg` (his row-at-w′ `depthOrder` minus his `depthOrder` at τ's game before w′; NaN when w′ is τ's first game or either value is missing), `gsStd` (played weeks ÷ τ team-game weeks ≤ n), `gsPrev` (`v.seasons` S − 1 `gamesPlayed / teamGames`), `first`. At `first = 1` every lagged status, `rw` and depth field is NaN — never S − 1's last week.
- **`absence`** — a **mate** is another pid with ≥ 1 played to-date row on τ. Share — non-QB rows: mates of position P, Σ (`rec_tgt + rush_att`) ÷ Σ τ's (`sum_rec_tgt + sum_rush_att`) over the weeks the mate played on τ; QB rows: QB mates, Σ `pass_att` ÷ Σ τ's `sum_pass_att` over those weeks (same components, ≤ 1). **Out** = no played row of the mate on τ at w′. `vacShare` = Σ share of mates out; `retShare` = Σ share of mates out whose week-w′ `rw` pairs list τ with `ACT` (NaN where `rw` is masked). `qbOut` (non-QB rows; **NaN on QB rows**): the QB mate with the most to-date `pass_att` on τ (ties → lowest pid) is out; no QB mate → NaN. `first = 1` → `vacShare = retShare = 0`, `qbOut` NaN.
- **`opp`** — o's `v.teamctx` rows to date and of all of S − 1 (rows of `era.era_team(o, S − 1)`): `oEpa` (Σ `def_epaSum` ÷ Σ `def_epaPlays`), `oPassEpa`, `oRushEpa`, `oSucc` (`def_successes / def_successPlays`), `oRzTd` (`def_rzTdTripsAllowed / def_rzTripsAllowed`), `oPtsPg` (Σ `def_pointsAllowed` ÷ row count); no suffix = to date (NaN with no row), suffix `1` = S − 1; `oG` (to-date rows). Zero denominator → NaN.
- **`team`** — `team_block(v, teams)`: per team, its to-date `v.teamctx` rows ÷ their count `m`: `tPassPg`, `tRushPg`, `tPtsPg` (`off_passPlays`, `off_rushPlays`, `off_pointsScored`), `tEpa` (`off_epaSum / off_epaPlays`), `tProe` (`(off_proePassPlays − off_proeXpassSum) / off_proePlays`) — **copies** of `features.py:274-279` (§17); row value = τ's.
- **`game`** — `home`; `dome` (`roof` ∈ {`dome`, `closed`}).
- **`gl`** — `gl_block(v, pids)`: per pid, his to-date `v.extras` rows summed, then `passEpaAtt`, `cpoe`, `rushEpaAtt`, `recEpaTgt`, `rushFdAtt`, `recFdTgt`, `yacRec` with the formulas of `features.py:311-319` via `features._ratio` — **copies** (§17).
- **`bio`** — `bio_block(tables, store, S, pids)` = `features.season_features(asof.view(tables, S, 0), pids, features.universe(tables, S), {**store.struct}, store.pos, store.keys, ps=store.ps(S))[["pid", "age", "exp", "isRookie"]]` for **every** row pid of season S (reuse; computed once per S). Never `store.feats(S)` (F9).
- **`prior`** — `pr_<t>` per weekly target and `pr_gamesShare` from the candidate's derive frame for (pid, T = S), else the fallback with `noPrior = 1` (else 0); `pr_<t>` **blended** (§9) with the row's n; then `dstd_<t> = std_<t> − pr_<t>`, `drec_<t> = rec_<t> − pr_<t>` against the blended value. Names in `inputs_spec()["priorCols"]`.

## 12. Runner (`run_weekly_inputs.py`)

`main(argv=None, deps=None)`; `deps` (default `Deps()`) holds every outside dependency, each patchable by tests: `task_file` (= `run_season_models.LP1A_TASK_FILE`, imported), `anchor` (= `run_season_models.ANCHOR_GENERATED_AT`, imported), `load_cache` (`io.load_cache`), `load_teamctx`, `load_extras` (`lambda: extra.build_extras(last=weekly_data.LAST_SEASON)`), `load_spec(name)` (`layers.season.spec` of `candidates/<name>.json`), `env` (default `registry.Env()`, passed to every `registry.require` call and to `season_prior.derive(…, env=deps.env)` → `season_models.fold`), `season_preds_path`, `season_preds_sha` (anchors; `None` skips `check_against_file` — tests only), `cache_dir`, `out_dir`, `check_parity` (default true). The season lock is not a `Deps` member: every lock check — the runner's and `fold`'s — goes through the module attribute `registry.require` (F13), which synthetic tests patch with `mock.patch.object(registry, "require", …)`; no unit test reaches the real lock. `main` calls every recorded function through its module (`weekly_data.inputs_at`, `season_prior.derive`, …; `import lp.weekly_data as weekly_data` style, never `from … import <function>`), so `mock.patch.object` sees each call.

`--check` in order: (1) `report.prereg_hash` of `deps.task_file` equals `report.PREREG_HASH`, else return 2 — before `load_cache`; (2) load panel, teamctx, extras; build `asof.Tables`; `trim`; `assert_trimmed`; drop every untrimmed reference; (3) `meta.generatedAt == deps.anchor`, else return 2; `score.parity(X_trim[weeks_trim.rid][:, Xw-order], weeks_trim.pts, weights)` on the trimmed tables only (`Xw` order = `panel.Xw`'s column order, recomputed from `meta`), else return 2; (4) both season specs (`features`/`targets` equal, as 2a); `registry.require(name, T, "season", deps.env)` for both and every T ≥ 2019 in `seasons()` **before any fit**; (5) `Store(T_trim, …)`; `derive` H and G for `seasons()`; `check_against_file`; (6) per S in `seasons()`: `fallback`, `bio = bio_block(T_trim, store, S, <every row pid of S>)`; per (S, n): `mu_std`, `inputs_at(…, bio)`, `targets_at`, `attach_prior` (H and G); the §10 row-set assertion; (7) `assert_trimmed` on the tables and every frame; write `season-prior.jsonl` and `weekly-inputs.pkl` (`pandas.to_pickle` of `{"H": frame, "G": frame}`, each identity + features + priors + targets) under `deps.cache_dir`; print facts; with `--write` the artifact under `deps.out_dir`. Imports only what it uses. Writes no run-log entry and no candidate file.

**Artifact facts** (no forecast compared with an outcome): max S per trimmed table and the all-NaN check of `X`; parity; per candidate, T, position: prior rows, max |Δ| vs `season-preds.jsonl`, the chosen season entry, and for H the share of season targets at α = 1000 (the weekly prior inherits it, no refit — §3.1 item 2); fallback values and fallback-row counts per season, position, target; weekly rows per season and position; NaN share per feature and position (pooled) and per season for `rwPrev_*`, `retShare`, `opp…`, `bio`; the `mu_std` ratio range per (P, q) at n = 4, 8, 16; run times; SHA-256 of `season-preds.jsonl`, `season-prior.jsonl`, `weekly-inputs.pkl`, both candidate files; versions. **No commit id** (§3.1 item 3).

## 13. (no evaluation in this slice)

## 14. Stops (report to Session 1, never improvise)

- Any need to touch §1's **Out** or change what an imported function returns.
- `season-preds.jsonl` SHA-256 differs from the anchor; a compose check or `check_against_file` fails; the §10 row-set assertion fails; `assert_trimmed` fails.
- A candidate file differs from HEAD or its canonical season section from the header hash.
- The prior derivation over 2 h, `--check` over 3 h, the artifact over 1 MB.
- The cache absent or off-anchor; a feature that cannot be computed as specified; any design question this file does not answer.

## 15. Done-definition

1. Code and tests; `python3 -m unittest discover -s research/learned-projection/tests -t research/learned-projection` green (the 2a suite included); each §16 test shown red once and restored; `--check` (no write) clean. **Commit 1** — this task file, the code and tests, **and `learned-projection-2b-weekly-models.md` as it stands** (the whole superseded Revision 1 rewrite of the outline, with its superseded marker — it is uncommitted today). Stage only the paths of this slice by name; never `git add -A` (other local changes may exist).
2. `--check --write`. `npm test`, `npm run smoke` green. Docs: `research/learned-projection/README.md` (including: after LP-2b-1b's registration, `require(·, 2025)` no longer holds 2025 by itself — the `guard` and LP-2b-2's marker do); repo `README.md` → Module notes (LP row); `data-catalog.md` → Non-served artifacts (one name); `CLAUDE.md` LP navigation row names this task file and the new modules (under 25,000 bytes; prune the row's wording if needed). Nothing under a served folder, `manifest.json` or `candidates/` changed. **Commit 2.** No push, no rebase (Session 1 rebases before verification, §3.1 item 3; the artifact cites no commit id).

Hand back: both SHAs; files touched; deviations; `preregHash` and season-section hashes unchanged; the facts summary; run times; per test its assertion, defect and red confirmation.

## 16. Tests (each shown red once, then restored; panels from the new `tests/synth_weekly.py`, which may import `tests/synth_season.py` and `tests/test_asof.py` (import only); season fits on synthetic panels use `spec.small_spec(name, synth_season.SMALL_TOPN)` with `calibMinRows = 1` and `grid` cut to its first entry — the three overrides of 2a's helper, `tests/test_season_models.py:14-18`)

`synth_weekly.make_weekly_panel(seed, seasons=range(2012, 2022), W=8)` builds its own panel (it may reuse `synth_season.Rows`; `make_panel` is too uniform, F14) **with `X`, `teamctx` and `extras`**. It must have, each asserted in the fixture:
- **Teams:** the four `synth_season.TEAMS`.
- **Real, paired opponents:** each (S, w) pairs the playing teams (A plays B ⇔ B plays A). `opp`, `home` (exactly one side) and `roof` (both sides equal) are set on the weeks frame **before** `asof.Tables(...)` is built, so `schedule` carries them (`Rows.week` hard-codes `home`, `roof`, `rwOracle`, `synth_season.py:38-40`; `Tables` snapshots `schedule` at construction, `asof.py:34`); the pairing is asserted on `tables.schedule`.
- **Byes:** a bye of team τ in (S, w) = **no `teams`, `teamctx` or `weeks` row** of τ that week. Each team has one bye in weeks 2…W − 1, two teams per bye week (the other two play each other); every team plays week W (T-W-16 relies on F11); `seasons.teamGames` = the team's game count. Asserted on `tables.team_weeks` (some team has a gap, so w′ ≠ w − 1 somewhere).
- **Out-of-universe players:** per position, at least one player with played `inUniverse` rows and `inSeasonUniverse` False in **each of 2014…2018** (so `fallback(…, 2018)` has a pool — asserted finite per position and weekly target with exposure), and at least one with `inSeasonUniverse` False in 2018 and True in 2019.
- **Historic rosters:** `rwOracle = (S ≤ 2015)`.
- **Booleans** in `inSeasonUniverse`, `inUniverse`, `played` and `hasRow`.
- **Every `def_*` field of F7.**
- **Pairwise-distinct copied denominators:** `off_plays`, `off_epaPlays`, `off_proePlays`, `off_passPlays` are pairwise distinct; so are `def_epaPlays` and `def_plays`; and so are `gl_att`, `gl_carries`, `gl_tgt`, `gl_rec`, `gl_cpoeDen`.

It provides `scrambled_full(t, S, n)` / `deleted_full(t, S, n)`: the `test_asof` semantics (F10) extended to `X` (past-origin rows randomised / NaN), `teamctx` and `extras` (past-origin rows randomised / removed), and later seasons' `seasons` and `bench` rows (scrambled — `inSeasonUniverse` re-drawn as booleans — / deleted). Every synthetic test that reaches `season_models.fold` at T ≥ 2019 patches `registry.require` with `mock.patch.object` (F13); none reaches the real lock.

- **T-W-1 as-of** (flags 1, 9). Origin pinned to **S = 2018** (no lock reached) and an n ≥ 2 such that some team τ's bye is week n (so w′ = n − 1). For each variant (as built, `scrambled_full`, `deleted_full`) rebuild **everything** from that variant's tables — `Store`, `derive` (H, at T = S), `fallback`, `bio_block`, `mu_std`, `inputs_at`, `attach_prior` — and assert the final frame at origin (S, n) is identical; the compared frame holds the §11 columns only (never the season prior's `games`/`total`, which `deleted_full`'s shorter `team_weeks` changes). Fixture asserts, so both reds must show: the scramble flips the week-w `played` of a mate **of the same position** as some row of week n + 1 whose share from that mate is > 0; and a pid outside the S universe but inside the S + 1 universe **has a row in `rows_at(view(S, n))`**. `fallback(…, S)` is also identical when **all** season-S rows are scrambled. Fails if any input reads week w or later, a later season, or (fallback) season S. Red 1: in `vacShare`, read the mate's week-w `played` from `tables.weeks` instead of w′ through the view. Red 2: take `bio` from `store.feats(S)`.
- **T-W-2 held season** (flags 2, 5, 6, 7, 8, 18). L = 2020 on `make_weekly_panel` (seasons 2012–2021), `registry.require` patched to pass, `weekly_data.LAST_SEASON` patched to L (so `seasons()` = 2018…2020): `trim` leaves no row with `S > L` in any table and NaN in every `X` row of a dropped rid, reading no file (`open` patched to raise inside `trim`); `assert_trimmed` raises on the untrimmed tables, on an untrimmed frame and on a trimmed table whose `X` keeps one dropped row; `trim_frame` cuts a `benchw`-shaped and a B4-shaped frame. With `derive`, `fallback`, `mu_std`, `bio_block`, `inputs_at`, `targets_at` wrapped to record the max `S` of **every table reachable from the `tables`/`store` they receive** (and whether any reachable `X` row of a season > L is finite), `main(["--check"], deps=<synthetic loaders, season_preds_sha None, temp dirs>)` records none. `derive`, `fallback`, `mu_std`, `bio_block`, `inputs_at`, `targets_at` at S = L + 1 raise `ConfirmationHeld`; with `season_models.fold` patched to raise a sentinel, `derive(..., L + 1, confirm=True)` raises the sentinel (it passed the guard and reached `fold`). Unpatched: `LAST_SEASON == splits.CONFIRM_FOLD − 1`; `spec_w.inputs_spec()` has no `lastSeason`. Static: no file under `lp/` or `run_*.py` contains `confirm=True`. Fails if a held-season row or value is reachable from any input builder. Red 1: in `main`, skip `trim` **and** the first `assert_trimmed` (the recorders turn red). Red 2: skip only `trim` (the first `assert_trimmed` turns red). Red 3: keep `X` unchanged in `trim`.
- **T-W-3 prior is the season layer** (flags 2, 10, 13). On `make_weekly_panel` at T = 2019 with `registry.require` patched (so `check_against_file` has a season to compare), the fixture asserting `out["details"][pos]["c"] ≠ 1` for at least one position (so composing with c = 1 would show): `prior_refit`'s `preds` composed with `c` equal `season_models.refit`'s frame and `fold`'s main rows exactly (names `season_models.refit` as the original); `check_against_file` passes on a file written from those rows (lowercase `cand`) with one NaN written as `null`, and raises on a copy with one `kv_` value with |x| ≥ 0.01 multiplied by 1 + 1e-6, on a copy missing one pid, and on a wrong SHA. Fails if the copy drifts or the prior is not the registered fit. Red: in `prior_refit` use `splits.train_seasons(T − 1)`.
- **T-W-6 teammate absence** (flags 12, 15). Hand-built team: a WR mate with share 0.3 who missed w′ → `vacShare` 0.3 on the WR row of w; with `rw` at w′ `ACT` → `retShare` 0.3 (S ≥ 2016), NaN (S ≤ 2015); a mate who misses only week w → 0; the top passer missing w′ → `qbOut` 1 on a WR row, NaN on a QB row; two QB mates tied on `pass_att` → the lower pid decides; no QB mate → NaN; a QB mate's share uses `pass_att` over `sum_pass_att` and stays ≤ 1 when he also rushes; a player traded in at w′ keeps his own row-at-w′ `status`; `first` → 0, 0, NaN. Fails on a same-week read or mismatched share components. Red: use `oppo` as the QB numerator.
- **T-W-7 opponent and era.** `oEpa` = Σ components ÷ Σ plays (not a mean of weekly rates); the S − 1 lookup uses `era_team` (a 2020 `LV` opponent reads 2019 `OAK`); `mu_std` uses weeks ≤ n only and equals `era.league_means` on that slice; ω(0) = 0 leaves the prior unchanged; `eraN0` is read from the spec; `pr_gamesShare` is never blended; `dstd_` uses the blended prior. Fails on averaged rates, an unmapped relocation or a full-season mean. Red: use the full season-S rows in `mu_std`.
- **T-W-16 copies and reuse** (flags 3, 4, 5). `team_block(view(S, n_last), [τ])` with n_last = S's final week equals `features.season_features`' `tmPassPg`, `tmRushPg`, `tmPtsPg`, `tmEpaPlay`, `tmProe` at origin (S + 1, 0) for a pid with `era_team(team_k, S) == τ`; `gl_block(view(S, n_last), [pid])` equals his lag-1 `gl` values (names `features.py` as the original); `player_seasons(season_only(v))` equals `player_seasons(v)` on season-S rows (all columns, `airShare` included); last-3 `tgtSh3`/`rushSh3`/`rzSh3` equal a hand computation and no `airSh3` is emitted. Fails if a copied formula drifts or the season slice changes a share. Red: divide `tProe` by `off_plays`.
- **T-W-17 targets** (flags 10, 13). A played RB row: `r_rush_att` from the raw column with `e_rush_att = 1`; `r_rush_yd` = key ÷ `rush_att`, `e_rush_yd = rush_att`; `bonus_fd_rb` over `rush_att + rec_tgt`; a zero denominator → `e = 0`, `r` NaN; a not-played row → `e = 0`; no `r_gamesShare` column; `inputs_at` never calls `targets_at` (patched to raise). Fails on an `X` lookup of an opportunity or a missing exclusion. Red: read `rush_att` from `X`.

## 17. Copied definitions

| Copy | Original | Test |
|---|---|---|
| `season_prior.prior_refit` — `refit`'s body through the `fit_family` call | `lp/season_models.py` `refit` | T-W-3 and the runtime compose check (§7) |
| `team_block`: `tPassPg`, `tRushPg`, `tPtsPg`, `tEpa`, `tProe` | `lp/features.py:274-279` (`tm_col` lambdas) | T-W-16 |
| `gl_block` ratios | `lp/features.py:311-319` | T-W-16 |

Reused by import, not copied: `fit_family` (with its clip), `oppo` and the four shares (`features.player_seasons`), `bio` (`features.season_features`), league means (`era.league_means`), `era_team`, `_ratio`, the prereg path and anchor (`run_season_models.LP1A_TASK_FILE`, `ANCHOR_GENERATED_AT`). Nothing crosses repos; no index line.

## 18. Disposition of the reviews

**LP-2b-1 Revision 1 review** — flags 1, 2 (input half), 4, 5 (input half), 10, 12, 13, 16 fixed here; 19 done (split); 3, 5 (`expected_points`, `P_CLIP`), 6, 7, 8, 9, 11, 14, 15, 17, 18 → LP-2b-1b (§19; 17 also in this slice's README line).

**LP-2b-1a Revision 1 review (18 flags)** — all fixed in Revision 2: 1 → §11 `bio_block`, F9; 2 → §7; 3 → `team_block`/`gl_block`; 4 → fixture denominators; 5, 6, 8, 17 → §6; 7 → §12 `Deps`; 9 → `scrambled_full`/`deleted_full`; 10 → §7, §10, §11 names; 11 → §19; 12 → F1; 13 → F3, §7; 14 → §12; 15 → §11; 16 → §15; 18 → T-W-2 reds.

**LP-2b-1a Revision 2 review (9 flags)** — all fixed in Revision 3: 1 lock reached from tests → F13, `Deps.env`, tests patch `registry.require`, T-W-1 at S = 2018; 2 → F14, `make_weekly_panel`; 3 → T-W-1 fixture asserts; 4 → `inputs_at(…, bio)`; 5 → module-attribute calls, `bio_block` raise, `fold` sentinel; 6 → `DEV_FOLDS` ∩ `seasons()`; 7 → `depthChg`, `runP`/`runN`, `store.pos`, booleans; 8 → §19; 9 → header.

**LP-2b-1a Revision 3 review (5 flags, none blocking)** — fixed in Revision 3.1: byes defined as missing rows and asserted on `team_weeks`; out-of-universe players in 2014…2018 with a finite fallback asserted; all three `small_spec` overrides and c ≠ 1 asserted in T-W-3; `home`/`roof` set before `Tables` and asserted on `schedule`; size kept flat.

## 19. Later (outlines only)

**LP-2b-1b — weekly models, registration, evaluation.** Planned only after this slice is verified and signed off. Draft basis: Revision 1 §7–§15 of `learned-projection-2b-weekly-models.md` (its §6 is superseded by this file). Scope: H and G weekly on the residual against the blended `pr_<t>` (H credibility + context ridge; G one fixed point), P(plays) per family, player-grouped cross-fitting, `c_w`, horizon φ, per-week composition, ROS and the n = 0 identity, registration through `registry.append_layer`, development-fold evaluation (§3.1 item 1), cohorts (on trimmed `weeks`, F12), override speeds, arms, the runner (`--smoke`/`--register-weekly`/`--dev`) and verdict. **LP-2a carry-overs (§3.1 item 2), each in a new module only:** LP-2a flag 4 — the anchor check runs before any registry read or write; LP-2a flag 9 — the verdict prints hashes, never a registration commit as "code commit"; the unused `spec` import — the new runner imports only what it uses. **Held-season inputs:** `benchw` and B4 pass through `weekly_data.trim_frame` and `assert_trimmed(frames=…)` before any use; every 2b-1b test reaching `fold` patches `registry.require` (F13). **LP-2b-1 review flags carried:** 2 (`fold_w` guard via `weekly_data.guard`), 3 (cohort aliasing test asserts all four outputs), 5 (import `report.expected_points`, `report.P_CLIP`), 6 (atomic registration pre-check), 7 (`fold_w` with explicit train/predict row selections, for `--smoke`'s within-season split), 8 (own HEAD reader for `layers.weekly.spec`; no `weekly_data` name clash), 9 (`season_points` with arrays; the n = 0 identity only where the weekly clip does not bind), 11 (horizon across byes), 14 (cohort `weeks` trimmed), 15 (whether arms re-run cross-fitting), 17 (`require(·, 2025)` passes after registration — README and verdict), 18 (no re-registration path: after Commit 2, fix passes touch only tests, docs and the verdict; a code defect is a stop for Anton). Flag 4's note: the §8 fallback reads only seasons before the row's own, so it is out-of-fold for every cross-fit group (2b-1b confirms). **One-thread rule (Anton, 2026-11-17, from the 2b-1a G reproduction finding):** every G fit of the new runner runs with `OMP_NUM_THREADS=1` set before sklearn is imported and, because a G fit also varies across processes with `PYTHONHASHSEED`, under seed 0 (the CLI re-executes itself); the thread count and seed are recorded in the artifact and the run-log. A registered 2b-1b weekly layer's G fits are produced under this rule.
**Second-ruling additions (§20):** also `VECLIB_MAXIMUM_THREADS`, `OPENBLAS_NUM_THREADS`, `MKL_NUM_THREADS` = 1 before numpy or sklearn is imported; all four thread variables plus the hash seed recorded in the artifact and run-log. **Stated limit:** G is reproducible only approximately, even on one thread (comparison with another run's file: 5% relative difference; the same-run compose check stayed exact in both 2b-1a real-data runs and is kept exact); H is exact.
**Caches consumed by SHA (2b-1a implementation review):** 2b-1b reads `season-prior.jsonl` and `weekly-inputs.pkl` as written by the final 2b-1a run, verifies each SHA-256 against the 2b-1a artifact before any use, and never regenerates them before its registration — G is not reproducible run to run, so a regeneration can change them or hit the 5% stop; a needed re-run is a stop for Anton.
Depends on: this slice's modules and caches unchanged.

**LP-2b-2 — the one-shot 2025 confirmation**, both layers of both candidates (start marker and run-log entry before the first 2025 fit; refuses if either exists; `confirm=True` only there). **Same one-thread rule** as LP-2b-1b: every G fit (both layers) with `OMP_NUM_THREADS=1` before sklearn is imported and `PYTHONHASHSEED=0`, both recorded in the run-log entry and the artifact; the 2025 G fits are not comparable to a differently-threaded run.
**Stated limit:** G is reproducible only approximately, even on one thread (all four thread variables and `PYTHONHASHSEED=0` pinned, recorded); H is exact.
Depends on LP-2b-1b verified.

## 20. Ruling during implementation (Anton, 2026-11-17)

LP-2a's `season-preds.jsonl` and verdict stay (not regenerated). The G prior is the one-thread refit (`OMP_NUM_THREADS=1`, plus `PYTHONHASHSEED=0` — found during the determinism check, §19); `season_prior.check_against_file` keeps H exact and, for G, requires the same chosen entry per position and fold (read from the registered dev run's aggregate) with every numeric field within 5% relative difference (|d| / (1 + |x|), a §14 stop beyond), reporting the maxima. The artifact and the research README state the limit: LP-2a's G dev predictions came from an unrecorded thread count and differ from one-thread refits by up to about 2% on RB (2022 `c`, 2024 `kv_bonus_fd_rb`). Thread count and hash seed are recorded in the artifact and a run-log entry (`mode: weekly-inputs-check`).

**Second ruling (Anton, 2026-11-17, verbatim), after the one-thread real run failed G's same-run compose check (G T=2021 QB, `kv_rush_yd`; H exact on every T, G exact 2018–2020):**

> Approved, with one cheap check first. Keep PYTHONHASHSEED=0. Also pin the other thread pools in the new runner only, before numpy and sklearn are imported: VECLIB_MAXIMUM_THREADS=1, OPENBLAS_NUM_THREADS=1, MKL_NUM_THREADS=1 (record them in the artifact). Rerun the real-data sequence twice. If G’s same-run check is then exact everywhere, keep it exact. If not, extend the §20 5% rule to the same-run check: same chosen entry, exact; numbers within 5% (|d| / (1 + |x|)), otherwise a §14 stop. Report the maximum gap per candidate, season and position in the artifact and the hand-back. Add the stated limit (G reproducible only approximately, even on one thread; H exact) to the README, the artifact and the LP-2b-1b and LP-2b-2 outlines. Then continue to Commit 2 and the sign-off request.

Under the repo's workflow, Session 2 hands back to Session 1, which verifies the diff and sends the sign-off request.

**First ruling, verbatim** (pasted by Anton into Session 2 on 2026-11-17; the paragraph above is Session 2's summary of it, and the hash-seed rule in it was Session 2's own addition, kept by the second ruling):

> Ruling (Anton, 2026-11-17): keep LP-2a’s season-preds and verdict; do not regenerate. (1) Pin every G fit to one thread from the new code only (e.g. set OMP_NUM_THREADS=1 before sklearn is imported in run_weekly_inputs.py and any later runner); record the thread count in the artifact and run-log; no edit to a season-hashed file. First confirm one-thread determinism: three identical G fits (RB 2022 and 2024, plus the T=2018 RB case that failed at 2 threads) give bit-identical output. (2) H keeps the exact check. G’s check_against_file becomes: same chosen entry per position and fold, exact; numeric fields reported as max relative difference, with a §14 stop if any exceeds 5%. (3) Add a stated limit to the LP-2b-1a artifact and the README: LP-2a’s G dev predictions came from an unrecorded thread count and differ from one-thread refits by up to ~2% on RB (2022 c, 2024 kv_bonus_fd_rb). (4) Carry the one-thread rule into the LP-2b-1b and LP-2b-2 outlines. Then finish the done-definition and send the sign-off request.

These rulings supersede §12's "Writes no run-log entry": the runner appends one `mode: weekly-inputs-check` entry per run.

## Fix pass 1

From the full implementation review of `5fad322..d6a75d9` (2026-11-17), triaged by Session 1. Applier: the fix-applier subagent. **Scope:** only the items below; no season-hashed path, `candidates/`, `manifest.json` or served folder; no change to any feature, prior, trim or guard logic. Stop and report if an item needs more than it names.

1. **Stated limit matches the facts** (review flag 1). Replace `STATED_LIMITS`' G sentence (`run_weekly_inputs.py:59-65`), the research README (`README.md:43,53`) and the `lp/season_prior.py:36-38` docstring with: "G is reproducible only approximately, even with every thread pool pinned and `PYTHONHASHSEED=0`. In three pinned real runs on 2026-11-17, G's re-derived prior matched LP-2a's `season-preds.jsonl` exactly in two and differed in one by up to 4.84% relative (2024 RB; 2022 RB 1.10%). This artifact's own gaps are in `vsSeasonPreds` and `composeGap`. H is exact." Do not write "equals" for G anywhere.
2. **Unused import** (flag 2): remove `splits` from the runner's imports if it is unused, after checking with `grep`.
3. **Artifact facts completed** (flag 5):
   - `alphaShareAt1000` per candidate, T **and position**.
   - `xFiniteOutsideWeeks` computed from the trimmed `X` (number of finite values in rows not referenced by `weeks["rid"]`), not a literal.
   - New `noPriorRows`: per season and position, the count of weekly rows with `noPrior = 1`, plus that count as a share of played rows.
4. **Numpy pre-import recorded** (flag 8): record `"numpyPreloaded": "numpy" in sys.modules` at the pin point in the artifact's `threads` block.
5. **`check_against_file` refuses a missing G entry check** (flag 13): raise `PriorCheckError` when candidate `g` is checked with `entries=None`; update tests to pass explicit entries. New test assertion: `entries=None` with a `g` row raises. Show it red by temporarily removing the raise, then restore.
6. **T-W-3 independent of `derive`** (flag 9): `test_copy_composes_to_refit_and_fold` builds its own `prior_refit`/`refit`/`fold` result, not `setUpClass`'s `derived`; the `derived` frame is built lazily for the tests that use it. Re-show the red (`train_seasons(T − 1)` in `prior_refit`) with `derive`'s runtime compose check bypassed by a patch, so that test's own assertion turns red.
7. **T-W-1 exact** (flag 10): compare with `check_exact=True`. If that fails on the as-built panel, stop and report the columns and gaps.
8. **Thread-pin test reaches the pools** (flag 11): in `TestThreadPin`'s subprocess, also assert every `threadpoolctl.threadpool_info()` entry has `num_threads == 1`. Red: move the pin loop below `import numpy` temporarily.
9. **Regenerate:** `python3 research/learned-projection/run_weekly_inputs.py --check --write` once (it overwrites the 2026-11-17 artifact; date as today). Whatever G's gaps are, the artifact reports them; a §14 stop (> 5% or a changed entry) is reported, not retried.
10. Full Python suite, `npm test`, `npm run smoke` green. One commit, `LP-2b-1a: fix pass 1`, staging only the touched paths by name. No push.

**Left alone (Session 1):**
- Flag 3: the verbatim first ruling is added to §20 above.
- Flag 4: `Deps.section_sha` and its §14 check are accepted and recorded in Verification.
- Flag 6: the four interpretations are accepted and recorded in Verification.
- Flag 7: `panelMeta.dataRev` is the panel's export provenance, not a self-cited commit; accepted.
- Flag 12: §19's 2b-1b outline gains the consume-by-SHA rule.

Hand back: the commit SHA, files touched, the new artifact's G gaps and cache SHA-256s, and each test's red confirmation.

## Verification

Session 1, 2026-11-17. Reviewed the diff, not the hand-back alone.

- **Rebase:** onto `origin/main` `20bae6e` at 2026-11-17T18:04Z; 2 capture commits taken in (`84f7cee` season-totals, `20bae6e` rosterweekly). Commit ids below are post-rebase.
- **Commits (main, unpushed):**
  - `f3fbedb` code, tests, both task files;
  - `5121ea3` facts artifact, docs, the G reproducibility rulings;
  - `2396670` fix pass 1;
  - this commit, the verification record.
  - Beneath them sits `7412863`, an unrelated agent/docs commit (`.claude/agents/plan-reviewer.md`, `CLAUDE.md`, `git-workflow.md`) that is not part of this slice and was not reviewed here; it goes out with the push.
- **Review:** full (opus, high), 13 flags, none blocking.
  - Fixed in Fix pass 1: 1, 2, 5, 8, 9, 10, 11, 13.
  - Fixed in the task file: 12 (§19 consume-by-SHA).
  - Accepted:
    - 3: the verbatim first ruling is added to §20.
    - 4: `Deps.section_sha` and its canonical-season-section check are a §14 stop, correct as built.
    - 6: interpretations — `runP`/`runN` 0 at `first`, a mate's zero-denominator share counts 0, `oG` 0 with no rows, `dome` NaN with no roof.
    - 7: `panelMeta.dataRev` is export provenance, not a self-cited id.
- **Fix-pass re-review:** light (sonnet), no flags. One observation accepted: research README line 53 still opens with the first ruling's "about 2%" sentence before the new limit (redundant, not wrong).
- **Deviations from the task file (all reviewed and accepted):**
  - the CLI re-executes with `PYTHONHASHSEED=0` (approved by the second ruling);
  - `check_against_file` returns per-cell gaps and reads chosen entries via `season_prior.dev_entries`;
  - `compare_compose` helper; `derive(…, gaps=)`;
  - `Deps.entries_path`, `runlog`, `section_sha`;
  - one `weekly-inputs-check` run-log entry per run (the rulings supersede §12);
  - `trim_frame`/`assert_trimmed` accept `T`-keyed frames;
  - `Fallback(val, cnt)`;
  - `inputs_at` asserts the store's targets equal `inputs_spec()`;
  - extra tests beyond §16, each shown red.
- **Locks:**
  - no season-hashed path, `candidates/`, `manifest.json` or served folder changed;
  - `preregHash` `7ff9087f…e24e5a` and both canonical season-section hashes unchanged;
  - 2025 absent from every table and frame (max S 2024; `xFiniteOutsideWeeks` 0).
- **Result (final artifact `backtests/2026-11-17-learned-s2b1a-inputs.json`):**
  - H against `season-preds.jsonl` within 1.33e-13 relative; G exact except one 3.27e-16 cell.
  - Same-run compose check exact for H and G.
  - Caches: `season-prior.jsonl` `55c55e200ce18d549d522ee007e284bbe180ff98209378c4c355a47a9643c56a`, `weekly-inputs.pkl` `2431b3978d5a078fb2256e3553ca513f17c62160ec56ac72fb657486f43a1fb2` — the files LP-2b-1b consumes (§19).
  - Across four pinned real runs, G matched the file exactly in three and by up to 4.84% in one: the stated limit.
- **Checks after the rebase:** Python suite 98 tests OK; `npm test` 2150 pass / 0 fail / 1 skipped; `npm run smoke` exit 0; `CLAUDE.md` 23,742 bytes.
