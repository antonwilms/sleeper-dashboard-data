# D-77 · What counts as a "game played" — decision brief

**Status:** decided, build deferred. Decision brief, not a build plan; no plan-reviewer (per Anton's
instruction for this step). The build plan (`d77-games-played.md`, `Review depth: full` — Invariant-1
rewrite of completed season-totals, scoring-affecting, cross-repo) is written by the off-season Session 1.

## Decision (Anton, 2026-10-28)

- **Definition adopted: (d).** A game counts when the player took at least one snap — offense, defense or
  special teams — per nflverse snap counts. Where nflverse has no record of that team's game, or the player
  recorded a stat that week (Sleeper `weeklyStats` or a gamelog row), Sleeper's `'P'` stands.
- **The 2022 W17 BUF@CIN no-contest counts** as a game played (falls out of the no-record fallback).
- **Build deferred** to the off-season batch, before the 2027 kickoff — not now. Until then season-totals
  `gamesPlayed` stays Sleeper `gp` (documented in data-catalog.md); backlog D-77 carries the prerequisites.
- Measured impact the build must reproduce or explain (§2): 70 historical player-seasons change, 2 drop
  below the 8-game line (4 rise), 6 of 434 current veterans move (Purdy base PPG +1.2%). Numbers are as of
  data `6f820cb` / `snapshots/2026-10-27.json`; re-measure at build time.

**Backlog:** D-77 in `sleeper-dashboard/.claude/tasks/data-repo-backlog.md`. **Evidence:**
`verification/2026-10-18-computed-stats-verification.{md,json}` (V2.11).
**Recomputed on:** data `main` @ `6f820cb` (after D-76 rewrite #5 `76b5ddf`), app `main` @ `91fae73`.

---

## 0 · Summary for Anton

- **Sleeper's count is right 97.5% of the time. The 2.5% it gets wrong are almost all "games" where the
  player never took a snap.** 76 of the 92 cases are Sleeper counting a game he didn't play; 16 are
  Sleeper missing a game he did play.
- **More than a quarter of the cases come from one game:** the Bills–Bengals Monday-night game in 2022
  week 17 (Damar Hamlin), which the NFL declared a no-contest. Sleeper counts it, nflverse doesn't.
  Most of the rest are 2021 data errors: players on IR or the practice squad shown as having played.
- **Today's projections barely move with the fix.** 6 of 434 current veterans change; Brock Purdy is the
  only one that matters (base PPG +1.2%). Counting offensive snaps only would be a different, much bigger
  product change: it moves 131 veterans.
- **Recommendation:** a game counts when the player took a snap in any phase (offense, defense or
  special teams). Where nflverse has no record of a game (the Bills–Bengals no-contest, a missing
  source row), Sleeper's count stands. A history rewrite of the D-76 kind, small in effect.

---

## 1 · Classification of every mismatch

### 1.1 What `nflverse/snaps` `games` counts

`games` in `nflverse/snaps/<year>.json` is **the number of REG-season rows the player has in PFR's
snap-count file**, one row per game (`aggregateSnapCounts`, `lib/nflverse.mjs:1691`: `games: p.rows`,
REG only). PFR lists a player for a game when he took at least one snap **in any phase: offense, defense
or special teams**. So `games` = **any snap including special teams**, not offense only. (Four REG
rows in 2021–2022 across all positions carry 0/0/0 snaps; none is a skill player in this population.)
The served file keeps only the offensive totals (`offSnaps`), not the per-week rows or the ST split. This
brief re-read the upstream `snap_counts_<year>.csv` (2013–2025, the same release the ingest reads) into a
scratch directory to get per-week offense/defense/ST snaps.

**Sleeper's `gp` counts special-teams-only games too.** Week by week, Sleeper `'P'` and a PFR row agree on
358–448 **ST-only** player-weeks per season (offense 0, ST > 0) for skill players. So ST-only appearances
are **not** a cause of the V2.11 mismatches. They only matter for definition (b) below.

### 1.2 Method

Week-level join, every skill player-season (QB/RB/WR/TE by `raw/-players-nfl.json` position) with a snaps
entry, 2013–2025. Sleeper side: `weeklyStatus` on current `main`. Reference side: the PFR row for that week
(offense/defense/ST snaps), `nflverse/gamelogs` REG row, `nflverse/rosterweekly` (team, status) pairs.
The population reproduces V2.11 exactly on current main: 2020 621/5, 2021 663/39, 2022 628/31, 2023
611/5, 2024 615/7, 2025 619/5. **D-76 changed no V2.11 count**, because it only rewrote `'D'`↔`'X'`, never
`'P'`. Each mismatching season has exactly one cause, apart from one row with two (marked).

A supporting check that identifies the "phantom" class: in every positive-direction row (excluding the
no-contest game), **Sleeper's own season `off_snp` equals PFR's offensive total**, so the extra game has
zero snaps in Sleeper's own data too. Sleeper's `gms_active` equals `gp` in every row, so it adds no information.

### 1.3 Causes, V2.11 population (2020–2025, 92 rows)

`+` = Sleeper counts more than PFR, `−` = fewer.

| Cause | Dir | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 | Total |
|---|---|---|---|---|---|---|---|---|
| **No-contest game**, 2022 W17 BUF@CIN: Sleeper `gp=1` (partial Q1 stats for some players); nflverse has no REG rows for either team that week | + | | | 28 | | | | **28** |
| **Phantom, practice squad**: Sleeper `'P'`, rosterweekly `DEV`, no PFR row, no gamelog, 0 pts | + | | 13 | 2 | 1 | | | **16** |
| **Phantom, not on the active roster**: Sleeper `'P'`, rosterweekly `RES` (11+1) / `INA` (2+1) / `EXE` (1); no snap, no stat | + | | 13 | | 1 | 1 | 1 | **16** |
| **Phantom, dressed but no snap**: Sleeper `'P'`, rosterweekly `ACT`, no PFR row, 0 pts. QB 13 (backups), RB 1, TE 1 | + | 1 | 7 | 1 | 1 | 4 | 1 | **15** |
| **PFR row missing**: gamelog has the game (KR stats), PFR has no row (Nyheim Hines, LAC W6–7) | + | | | | | | 1 | **1** |
| **Sleeper missed a played week**: PFR offensive snaps, Sleeper `gp=0` (`'D'`), Sleeper `off_snp` short by exactly those snaps. No stats | − | 3 | 4 | | 1 | 1 | 1 | **10** |
| … same, **with stats** in gamelogs (Jarwin 2021 W18 1 rec 6 yd; Davidson 2024 W13 1 target) | − | | 1 | | | 1 | | **2** |
| … same, **ST-only** week | − | 1 | | | 1 | | 1 | **3** |
| Mixed: Sleeper missed 3 offensive weeks and counted a `CUT` week (Tyler Mabry, SEA 2021) | − | | 1 | | | | | **1** |
| **Total** | | 5 | 39 | 31 | 5 | 7 | 5 | **92** |

Positive 76 = 28 + 16 + 16 + 15 + 1; negative 16. Both match V2.11.

**The candidate causes from the brief:**
- **Practice-squad game-day elevations:** 16 rows are Sleeper `'P'` while rosterweekly shows `DEV`. Whether
  the player was elevated cannot be told from the data, because rosterweekly does not mark elevations. Either way
  he took no snap. Some are implausible as elevations: Devin Smith (JAX 2021) has 4 straight `DEV` weeks
  counted.
- **Special-teams-only appearances:** not a cause. Sleeper and PFR both count them (§1.1); only 3 ST-only
  weeks are Sleeper misses.
- **Traded players:** not a cause. The 5 traded rows in V2.11 are 2 IR phantoms (Dorsett, Arnold), 1 inactive
  phantom (Billy-Johnson) and 2 no-contest rows (Beasley, Hines 2022).
- **Sleeper `gp` errors:** yes. 47 phantom rows (32 of them in 2021) and 16 missed weeks.
- **Found besides:** the 2022 no-contest game (28); one PFR omission (1). There is also one **crosswalk error**
  outside 2020–2025. Sleeper id `3344` (David Morgan, MIN TE 2017) is mapped to PFR `CartKy01` (Kyle
  Carter), so any snaps-based count would cut his 2017 from 15 games to 3. A name check over all 7,647
  skill snaps entries for 2013–2025 finds this as the only real mismatch; the other 12 are name variants
  such as Hines/Miller-Hines.

### 1.4 Outside V2.11

- **2013–2019:** 7 mismatches in total (2014 2, 2015 1, 2017 2, 2018 2). Phantoms (4), the 3344 crosswalk
  error, and a Damien/Damian Williams 2014 pair that looks like a crosswalk swap. Sleeper's `gp` was
  close to clean before 2020.
- **Rows with `gp ≥ 1` and no snaps entry** (V2.11 does not compare them), 2020–2025: 66. 56 played
  according to Sleeper's own snaps or gamelogs, which is a crosswalk gap (D-84 territory). **10 are phantom
  seasons**: gp 1–2, zero Sleeper snaps, no gamelog (2021 7, 2025 3; e.g. Dwayne Haskins 2021, K.J. Costello 2021).

---

## 2 · Candidate definitions and measured impact

Season-totals `gamesPlayed` = count of `'P'` slots. Under each definition a slot that stops counting
is re-classified by D-76's rule (`'D'` if the week's rosterweekly pairs include ACT/INA/RES/PUP or
there is no listing, `'X'` for a role state). A slot that starts counting becomes `'P'`. `dnpWeeks` and
`availability` are recomputed. `fantasyPoints`, `stats`, `weeklyPoints` and `weeklyStats` are left as
they are. Rows with no snaps entry, and all of 2012, keep Sleeper under every definition.

| | Definition |
|---|---|
| **(a)** | Sleeper `gp` (today) |
| **(b)** | Any **offensive** snap (PFR `offense_snaps > 0`) |
| **(c)** | Any snap, **including ST** (PFR row present = snaps `games`) |
| **(d)** | (c), except that Sleeper's `'P'` stands where nflverse has **no record of that team's game** (no PFR row for any player on that team that week) **or** the player has a stat that week (Sleeper `weeklyStats` or a gamelog row) |

### 2.1 History, 2013–2025 skill player-seasons with a snaps entry (7,647)

| | (b) offense only | (c) any snap | (d) any snap + no-record/stat fallback |
|---|---|---|---|
| Player-seasons changed | **1,691** | 100 | **70** |
| Drop below the 8-game line | **362** (22–33 every season) | 3 | 2 |
| Rise to 8+ games | 2 | 4 | 4 |
| Qualifying (≥ 8 before and after) with a PPG change | 719 | 46 | 22 |
| PPG change, qualifying rows: median / p90 / max | +0.21 / +0.98 / +3.42 | +0.24 / +1.00 / +1.50 | +0.15 / +0.95 / +1.13 |
| Relative PPG change, median / max | +14% / +113% | +7% / +25% | +8% / +67%¹ |
| Changed rows by season | 105–183 every season | 2021 39, 2022 32, others ≤ 7 | 2021 39, 2022 4, others ≤ 7 |

¹ Driven by 3344 (15 → 9). The planned build skips rows whose snaps-entry name does not match (§3); without
that row (d) is 69 rows and max +25%.

- **(b) flips** are ST-heavy depth players and returners: Devin Hester 2013 16 → 0, Taiwan Jones 2013 16 → 3, Eric Weems
  16 → 5. Largest PPG moves: Boston Scott 2021 5.69 → 9.11, Patrick Laird 2019 3.78 → 7.09, Isaiah Davis 2024 2.44 → 4.60.
- **(c) vs (d):** (c) also drops the 2022 no-contest week for every Bills and Bengals player. That raises
  their PPG while leaving that week's points in the total: Josh Allen 24.07 → 25.58, Burrow 21.53 → 22.87,
  Chase 15.22 → 16.49. It also takes the 3344 crosswalk error at face value.
- **(d) flips:** Vannett 2021 8 → 7, Maurice Alexander 2022 8 → 4 (`DEV` phantoms) go below the line;
  Jarwin 2021, Hesse 2021, Mabry 2021 and Ward 2023 rise to 8.
  Largest PPG moves: Purdy 2023 18.04 → 19.16 (W18 inactive phantom), Tre'Quan Smith 2021 5.44 → 6.43,
  Darrell Henderson 2021 11.45 → 12.41, Cam Akers 2020 7.94 → 7.33 (a missed week added).

### 2.2 Current players: mirror pre-estimate on `snapshots/2026-10-27.json`

434 veteran rows (non-rookie path, skill positions), through season 2025. `projectedGames`, injury
seasons, absence shape, bounce-back and the dynasty injury-season count come from `lib/durabilityMirror.mjs`
(`rule: 'l6c'`, CR-28); base PPG from the Step 1 weighted mean of the last 3 qualifying seasons. The
mirror works on half-PPR, while the app uses league-rescored points, so direction is right but magnitudes
are approximate. **The dynasty score itself is not mirrored.** The build must measure it on the real
pipeline with two captures, as D-76 did in C1 (`scripts/absence-role-impact.mjs`).

| Veterans that move | (b) | (c) | (d) |
|---|---|---|---|
| Any field | **131** | 6 | **6** |
| `projectedGames` | 94 | 3 | 3 |
| base PPG | 109 | 5 | 5 |
| injury seasons / absence shape | 15 / 39 | 2 / 2 | 2 / 2 |
| bounce-back flag | 23 | 0 | 0 |
| dynasty injury-season count | 14 | 1 | 1 |
| change veteran ↔ rookie path | 11 | 0 | 0 |
| movers with a KTC value | 55 | 2 | 2 |

- **(d) / (c) movers (identical):** Brock Purdy base PPG 19.59 → 19.82 (+1.2%; KTC 7137, dynasty 74), the
  only fantasy-relevant one. Marcus Mariota: injury seasons 0 → 1, absence shape 0.97 → 0.95, dynasty injury
  count 4 → 5 (KTC 1559), from his 2021 W10 dressed-no-snap phantom becoming `'D'`. Also Laquon Treadwell
  (games 12 → 11, PPG +13%), Nick Vannett (games 8 → 10), Alex Bachman (games 12 → 13) and Jonathan Ward
  (PPG 0.58 → 0.37), none of whom has a KTC value. (c) and (d) differ only on players no longer in the
  snapshot (the 2022 Bills/Bengals rows feed no current 3-season window except through qualifying,
  where they change nothing).
- **(b) largest movers with KTC values:** Kyren Williams projected games 14 → 16, Tank Bigsby 17 → 13 (PPG
  +20%), Sean Tucker PPG +50%, Will Shipley 15 → 12, Drew Lock PPG +23%, Keaton Mitchell PPG −25%,
  Chris Rodriguez PPG +18%.

### 2.3 Fitted or validated constants that read `gamesPlayed`

| Constant (site) | How it reads it | Under (d) | Under (b) |
|---|---|---|---|
| 8-game qualifying gate (app `seasonProjection.js:689`, mirrors) | hand-set gate | 6 of 7,647 rows cross it | 364 cross; gate would need rethinking |
| `SHORT_SEASON_K` L6c (`shortSeasonConstants.js`, D-79) | outcome `gamesPlayed`, short/none state | re-run `--games-calibration --short`; low | refit |
| Games-calibration candidates (D-81) | outcome `gamesPlayed` | low; only if D-79 moves | refit |
| Durability rule constants (D-80: gp < 10 ∧ dnp ≥ 3, ×0.88/×0.78, absence shape) | `gamesPlayed`, `dnpWeeks`, `availability` | low (2 rows' injury seasons move) | re-validate |
| In-season k `K_ROS_*`/`K_DYN_*` (CR-25, D-82) | errors include `projectedGames`, PPG | fold into next scheduled refit | refit |
| R3-FIT exponents (CR-15, `lib/panel.mjs` `gamesPlayedY`, `minOutcomeGames`, gp ≥ 8/10 gates) | PPG outcomes, games feature | low; next scheduled check | refit |
| QB takeover / rookie-QB level (CR-27, `lib/qbTakeover.mjs` `priorPPG`) | backup-QB PPG with `priorMinGames` | **check**: 13 of the 47 phantoms are backup QBs; low | refit |
| League-basis scale (`lib/leagueBasis.mjs`, gp ≥ 10), rookie panels (D-8–D-13) | gates, PPG outcomes | low | refit |
| Age curves / position peak PPG (app runtime) | computed from careerStats at load | moves automatically, nothing pinned | moves |

Under (d), nothing listed is likely to need a refit. Each should get a check, folded into the backlog
items D-76 already opened (D-79–D-82) plus CR-15 and CR-27. Under (b), every row needs a refit.

---

## 3 · What the change involves (for recommendation (d))

1. **Per-week snap input.** The served `nflverse/snaps` has no per-week rows. Add an additive per-player
   `weeks` field (REG weeks with a PFR row, plus off/def/ST snaps), with no `schemaVersion` bump, and
   re-ingest 2013–2025 with `--force --all`. That is itself an in-place rewrite of a completed `nflverse/` family
   (an enrichment, like rewrite #4). The alternative is a migration that reads the upstream CSV and keeps
   nothing (as the `oline` pbp family does). The served field is preferable: the rewrite can be reproduced
   from committed data, and the forward ingest needs it anyway.
2. **Invariant-1 rewrite #6 of completed season-totals 2013–2025**, `scripts/migrate-games-played.mjs`
   (`--dry-run`, dry-run diff report in `verification/`). It writes `'P'` ↔ `'D'`/`'X'` slots, `gamesPlayed`,
   `dnpWeeks` and `availability` only. `team` is held, with an assertion (CR-02 dominant-team rule: no
   changed row may move `team`). `stats`, `fantasyPoints`, `weeklyPoints`, `weeklyStats`, `gamesStarted` and the raw
   `stats.gp` / `gms_active` sums stay Sleeper's. Nothing reads `stats.gp`, but the data-catalog row must
   say it no longer equals `gamesPlayed`. The 2 missed weeks with stats stay short by ≤ 1.1 pts.
   **Guard:** skip any row whose snaps-entry name does not match Sleeper's (3344), and file the crosswalk error
   separately. Optional: also zero the 10 no-entry phantom seasons (zero Sleeper snaps, no stat, no
   gamelog; 2020+ only, since Sleeper's snap keys start in 2020). Expected size: about 70 rows, about 90 slots.
   2012 is untouched.
3. **Forward and in-season.** `update-nfl.mjs` SKIPs completed seasons, so the rule has to be applied
   while a season is in progress or a phantom is sealed in. The snaps family is refreshed yearly (mid-February). Two
   options: (i) move snaps to a weekly in-season refresh and apply the rule on every `update-nfl.mjs` run,
   with the no-record fallback keeping Sleeper's `'P'` for weeks PFR has not published yet; or (ii) keep
   in-season files on Sleeper and accept a yearly February rewrite. Recommend (i). Whether the upstream
   `snap_counts_<year>.csv` updates in-season, and how fast, is **unverified**; Session 1 must measure it.
   2026 phantoms so far are unmeasured, but the 2023–2025 rate is 4–7 rows a season.
4. **Release, as with D-76:** C1-style impact capture (two local captures, `absence-role-impact.mjs`);
   CR-30 `SEASON_TOTALS_CACHE_REVISION` bump; **`PRIOR_MODEL_FROM` bump** (app `inSeasonConstants.js`,
   currently `2026-10-28`, boundary 11), which would make this **boundary 12**, with a new
   `grading/anchor-policy.md` row; data push → purge verified → app push, all in one window between two
   16:29 UTC captures.
5. **Cross-repo entries.** **CR-28** widens from "absence classification" to played/absence
   classification. Its invariant gains the `'P'` definition, and its Data side gains the migration and
   the snaps `weeks` reader (the app side, `durabilitySignals.js`, is unchanged). **CR-30** Data field adds
   `migrate-games-played.mjs`. The definition is also the app's PPG denominator (CR-02 rows), so add one line
   to CR-02's invariant or create a new entry; the registry decides which. **App verify harness**
   (`scripts/verify/lib/v2GradeInputs.mjs`, V2.11) must compare against the new definition. Exempt no-record
   team-weeks and name-mismatch rows, or the no-contest game reports 28 false defects every run. That is an
   app-side line in `.claude/tasks/app-repo-backlog.md`. Plus the data-catalog season-totals row gets a
   definition and a correction note, and the README/CLAUDE.md `scripts/migrate-*` list.
6. **Scope estimate:** medium. Two data slices (snaps `weeks`; migration plus forward rule) and one small
   app slice (CR-30, `PRIOR_MODEL_FROM`, V2.11), using the D-76 pattern.

Under (c) the work is the same, without the fallback logic. Under (b) it is the same rewrite with about 1,700 rows
changed and every fitted constant in §2.3 refitted, so it is a model project in its own right.

---

## 4 · Recommendation and the question

**Recommend (d): a game counts when the player took at least one snap (offense, defense or special
teams). Where nflverse has no record of the game, or he recorded a stat, Sleeper's count stands.**

Product reasoning: PPG is meant to answer "what does he score when he's actually on the field". A game
where he never took a snap, whether in street clothes, on IR or on the practice squad, only dilutes that
number, and it also hides a missed game from the durability signals. Snaps are the most direct evidence
of being on the field, and PFR counts them independently of Sleeper. Counting special teams keeps the
definition Sleeper already uses for 400 player-weeks a season. Dropping them, as (b) does, would quietly
turn this into a different metric ("PPG per offensive game"). That would reprice 131 current veterans and
force every fitted constant to be refitted; it is a product idea, not a data fix. The no-record fallback keeps the
2022 Bills–Bengals no-contest game as Sleeper scored it: the points stay, so the game should too. It also
keeps us from inheriting PFR's own gaps. Cost: a D-76-sized rewrite with about 70 historical rows and 6
current veterans moved (Purdy +1.2% base PPG is the only fantasy-relevant one). It also needs a weekly
snaps refresh in-season so the rule keeps holding for 2026 onward.

**The question for you:** Should a "game played" mean *took at least one snap, offense, defense or special
teams, with Sleeper's count standing where nflverse has no record of the game* (recommended, moves 6
current veterans, Purdy +1.2%)? Or do you want PPG to measure *offensive games only*? That second option is
a larger product change: it raises PPG for return specialists and gadget players, pushes 362 historical
seasons below the 8-game line, moves 131 current veterans, and means refitting the projection constants.
Or should we leave Sleeper's count as is and only document the 2.5% gap? A third, smaller choice sits
inside the first: should the 2022 Bills–Bengals no-contest game count as a game played (recommended,
since its points count) or not?
