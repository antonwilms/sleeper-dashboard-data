# P6a — QB takeover research: registry companion

Companion to `.claude/tasks/qb-takeover-research.md` §8. Session 1, 2026-10-03, against data
`bf697a5`. These are verbatim texts for the two-session registry route (data emits → app applies →
data syncs); nothing here is applied by this task's Session 2.

### CR-09 · nflverse gamelogs — **Mirror text amendment owed (registry route, not edited here)**

CR-09's Mirror names exactly **one** sanctioned analytical gamelogs read (`scripts/inseason-run.mjs`).
This task adds a second. Per the two-session registry route (data emits → app applies → data
syncs), **this task does not edit `cross-repo-registry.md`**. It emits the amendment for the app's
backlog.

Current CR-09 Mirror, verbatim (from `lib/registry.mjs`):

> Shape or floor changes land in both repos together. The per-game `week` and `team` keys are load-bearing beyond display: `resolvePlayerTeam`'s week-grain path matches on `g.week === week` and reads `g.team`, and returns `null` rather than throwing — renaming either key empties every week-grain team join **silently**. Per-game `team` is the **current-franchise** domain in all seasons and is era-remapped app-side (CR-16); do not "fix" it to era-accurate upstream without changing both repos. Per-game rate fields (`racr`/`targetShare`/`airYardsShare`/`wopr`/`pacr`/`passingCpoe`) are single-game values and must never be summed — `passingCpoe` specifically is now also attempt-weighted by a second consumer (`seasonEfficiency.js`'s `CPOE` column), not merely "never summed". `fantasyPoints`/`fantasyPointsPpr` are nflverse default scoring and are never reconciled with `src/utils/fantasyPoints.js` (see CR-14). View-only on both sides — must never feed projection/scoring/grading as per-player values. One sanctioned analytical read: `scripts/inseason-run.mjs` (CR-25) splits season-totals opportunity stats by week from gamelogs, behind a stop that requires ≥ 99% of the skill player-seasons present in gamelogs (gp ≥ 4) to reconcile with season-totals `stats`. It emits only fitted parameters: dimensionless k constants, plus the parameters of the posterior-combination and sort-measure forms built on them. It never emits per-player values. Weekly points there come from season-totals, never from gamelogs `fantasyPoints`. 2019 was backfilled on 2026-07-03 (5,756 rows across 586 players) and is no longer a gap; the family is complete 2012–2025.

Amendment (flag 14 — the inseason-run sentence stays intact):

> CR-09 Data side: append "; read offline (analysis only) by `scripts/qb-takeover-run.mjs` to identify each team-game's primary passer (`team`/`week`/`seasonType`/`attempts`/`sacksSuffered`; `team` mapped to era codes with `eraTeam`) (CR-27)". Triggers (data side): append "`scripts/qb-takeover-run.mjs` (the CR-27 analytical read)". Mirror: insert, immediately after "…never from gamelogs `fantasyPoints`.", the sentence: "A second sanctioned analytical read, `scripts/qb-takeover-run.mjs` (CR-27), uses only `team` (mapped to era codes with `eraTeam`), `week`, `seasonType`, `attempts` and `sacksSuffered` to identify each team-game's primary passer, behind a stop that requires ≥ 99% of each season's REG team-games to have one; it emits only logistic coefficients and per-pattern trial/event counts, never per-player values, and never reads gamelogs `fantasyPoints`."

### CR-27 · QB takeover constants — **new entry, drafted here, lands with P6b**

The coupling exists only once the app pins the constants (P6b). The draft ships now so P6b's
Session 1 starts from it, the same way 2a drafted CR-25.

- **App side:** (P6b) the pinned constants module + byte-identical fixture; the live feature
  builders: draft group from the app's draft data, rookie, prior-start (calendar week), incPPG per
  `definitions.incPPG` (S−1 PPG prior with gp ≥ 4, k = 3, the all-teams calendar-week median, the
  g = 1 rule), benched count, team-game index, win% (`mid` at g = 1), the original-starter flag
  `og`, and depth order from Sleeper `depth_chart_order`, with `d1` for a QB1 who was not last
  game's primary passer. Also the `expectedStarts` port (54-state chain).
- **Data side:** `lib/qbTakeover.mjs` (`QB_TAKEOVER_DEFAULTS` — bins, `incK`, `lambda`;
  `primaryPassers`, `checkpointChart`, `buildRows` and its incPPG helper, `patternTable`,
  `fitLogistic`, `forwardLadder`, `expectedStarts`), `scripts/qb-takeover-run.mjs`,
  `bin/backtest.mjs --qb-takeover`, `backtests/<date>-qb-takeover-constants.json`,
  `test/qb-takeover.test.mjs`.
- **Invariant:** the app's live feature definitions and bins equal the constants file's
  `definitions`; every pinned coefficient re-derives from that file's `fixture` by its `lambda`;
  the app's chain reproduces `expectedStarts`'s §4.5 state space and transitions exactly.
- **Direction:** both. Definitions flow app→data; constants flow data→app.
- **Triggers:** `<P6b app files>` ‖ `QB_TAKEOVER_DEFAULTS`, `primaryPassers`, `checkpointChart`,
  `buildRows` (and the incPPG helper, named at implementation), `fitLogistic`, `forwardLadder`,
  `expectedStarts` in `lib/qbTakeover.mjs`; `scripts/qb-takeover-run.mjs`; `bin/backtest.mjs`;
  `test/qb-takeover.test.mjs`.
- **Mirror:** a change to any live feature definition or bin re-runs
  `node bin/backtest.mjs --qb-takeover --write` and re-pins by byte copy, never by hand-editing a
  coefficient. `incPPG`'s k = 3 is this entry's own constant and is not tied to CR-25. The app's
  `dp` comes from Sleeper while the fit used nflverse charts. The only agreement measurement
  (QB depth-1 68.8%, n = 32) compares a 2026 preseason app snapshot against nflverse 2025 week 18,
  a cross-season upper bound on disagreement. So a pinned `dp` coefficient is applied to a
  differently-maintained chart. A returning original starter (`og = yes`) reuses the
  backup-origin `pStay` with `dq = unknown`, which is an approximation. **Nothing fails in either
  repo when this drifts.**

### Signal registry (app `docs/signal-registry.md`) — row edits owed (checked during planning)

The *Current use* cells for three rows gain a consumer:

| Row | Append to *Current use* |
|---|---|
| "nflverse historical depth charts" (§3A) | "; offline QB takeover fit (`--qb-takeover`, P6a): checkpoint QB charts define the backup population and `dp`; analysis only" |
| "nflverse per-game player stats" | "; offline primary-passer identification for the QB takeover fit (P6a, CR-27); emits coefficients only" |
| "nflverse playerids crosswalk" | "; `draftOvr`/`draftYear`/`undrafted` read offline by the QB takeover fit (P6a) for draft group and rookie; still no app loader" |

**Backlog line for the app** (`sleeper-dashboard/.claude/tasks/data-repo-backlog.md`, next free D-id):

> P6a QB takeover: apply the CR-09 Mirror/Data-side/Triggers amendment, the CR-08 and CR-16 data-side appends, add the CR-27 draft at P6b, and make the three signal-registry *Current use* edits (data `.claude/tasks/qb-takeover-research.md` §8).

### CR-08 · nflverse schedule — data-side append owed (flag 17, `[registry-stale]`, pre-existing)

CR-08's data-side Triggers name no analytical schedule reader. Live readers are
`scripts/inseason-run.mjs:46` and `:247–253` (`makeScheduleIndex`), which read
`gameType`/`homeTeam`/`awayTeam`/`week`. This task adds a third that also reads
`homeScore`/`awayScore` for win%. Append to CR-08 Data side:

> "; read offline (analysis only) by `scripts/inseason-run.mjs` (`makeScheduleIndex`: `gameType`/`homeTeam`/`awayTeam`/`week`, CR-25) and `scripts/qb-takeover-run.mjs` (also `homeScore`/`awayScore`, CR-27)"

Add both files to its data-side Triggers.

### CR-16 · Team era remap — data-side consumer append owed (flag 18)

> CR-16 Data side: append "; `lib/qbTakeover.mjs` `primaryPassers` applies `eraTeam` to gamelogs per-game `team` to join schedule/depth (CR-27) — an unmirrored franchise move silently drops that team's primary passers and is caught only in aggregate by the 0.99 coverage stop".

CR-16's Mirror text, verbatim:

> A future franchise move (or any change to an existing mapping) updates **both repos in the same change** — and there are **two** mirrored constants here, not one: the era remap *and* the schedule-domain alias (`lib/sleeper.mjs:21` says so in a comment: *"Mirrors the app's `src/utils/nflStats.js` `SCHEDULE_TEAM_ALIAS` exactly"*). A one-sided edit to either produces silently empty joins rather than an error — the team key simply never matches. Note `scripts/update-teamcontext.mjs` is **not** a trigger despite owning the teamcontext ingest: it names `eraTeam` only in a header comment (`:13`) and calls it via `aggregateTeamContext`, so grepping it for the remap finds nothing. **D-1 (2026-08-24) is a new consumer of this composition, not a new mapping** — `aggregateWeeks` joins a single-team row's already-normalized `team` against the nflverse schedule's bye weeks, so a future franchise move that isn't mirrored here silently loses that team's bye inference (degrades to `'X'`, no throw) in addition to the pre-existing teamcontext/schedule join failures this entry already covers.

