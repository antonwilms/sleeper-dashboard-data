# P12a — Rookie QB starter level: registry companion

Companion to `.claude/tasks/qb-rookie-level-research.md` §8. Session 1, 2026-10-04, against data `c2e3ce8`.
Verbatim texts for the two-session registry route (data emits → app applies → data syncs, CR-24 byte
identity). **Nothing here is applied by this task's Session 2.** They land with P12b's registry span (or the
next registry-sync batch, whichever is first), and every anchor below is re-checked against the live registry
then. **Route it at the next registry-sync batch, not with P12b** (plan gate flag 8): until it lands, CR-09
lists only two sanctioned gamelogs reads while a third runs. Only the CR-27 extension waits for P12b.

### CR-09 · nflverse gamelogs — amendment (a third sanctioned analytical read)

- **Data side:** append, after "…(`team` mapped to era codes with `eraTeam`) (CR-27)":
  > ; read offline (analysis only) by `scripts/qb-rookie-level-run.mjs` through the same `primaryPassers` call and fields, to find each rookie QB's primary-passer games (CR-27)
- **Triggers (data side):** append after "`scripts/qb-takeover-run.mjs` (the CR-27 analytical read)":
  > , `scripts/qb-rookie-level-run.mjs` (the CR-27 rookie starter-level read)
- **Mirror:** insert, immediately after the sentence ending "…never per-player values, and never reads gamelogs `fantasyPoints`.":
  > A third, `scripts/qb-rookie-level-run.mjs` (CR-27), reuses that primary-passer identification unchanged to select rookie QBs' primary games, whose points come from season-totals `weeklyPoints`; it emits only draft-group aggregates (a group-keyed fixture of rookie, game and point sums; any report cell under three rookies is suppressed), never per-player or per-rookie-season values.

### CR-01 · Projection snapshot envelope — data-side append

- **Data side:** append at the end of the bullet ("…the gate is the most consequential envelope consumer in this repo"):
  > ; `scripts/qb-rookie-level-run.mjs` (`bin/backtest.mjs --qb-rookie-level`, offline) reads one pinned snapshot's `scoringSettings`, `targetSeason` and, for rookie-route QBs, `projection.confidence`/`projectedPPG` and `factors.qbStarterPPG`/`qbTakeoverBasis`/`rookieBasisScale`/`ktcMult`/`collegeContribution`, plus `players[id].nfl_team`/`depthChartOrder` — renaming any of these breaks its live-level comparison

### CR-08 · nflverse schedule — data-side + triggers append

- **Data side:** append at the end of the bullet:
  > ; and `scripts/qb-rookie-level-run.mjs` (`coverageFor` and the team-game index: `gameType`/`homeTeam`/`awayTeam`/`week`, CR-27)
- **Triggers (data side):** append `, `scripts/qb-rookie-level-run.mjs``.

### CR-16 · Era-accurate team-code remap — data-side append (optional, coverage honesty)

- **Data side:** append at the end of the bullet:
  > ; `rookieStarterGames` in `lib/qbRookieLevel.mjs` joins `primaryPassers`' era-coded keys to schedule teams for the team-game index and start origin (CR-27) — an unmirrored franchise move drops games silently, caught only by the 0.99 coverage stop

### CR-15 · R3-FIT factor-multiplier mirror — data-side consumer append

- **Data side:** append at the end of the bullet ("…for the prospect-score peak normaliser"):
  > ; `scripts/qb-rookie-level-run.mjs` (`bin/backtest.mjs --qb-rookie-level`) reads the corrected rookie reconstruction through `rookiePriorFor` (`scripts/inseason-run.mjs`) as its ktc-neutral comparator — outside `bin/panel.mjs`'s closure

### CR-14 · `calculateFantasyPoints` port — data-side append

- **Data side:** append at the end of the bullet ("…by `buildOutcomeMaps` in `scripts/panel-run.mjs` on the R3-FIT path"):
  > ; `leagueRatio` in `lib/qbRookieLevel.mjs` (`--qb-rookie-level`, report-only league cross-check) scores season `stats` with `RATE_KEYS` stripped, the app's season-scoring convention

### CR-27 · QB takeover constants — extension draft (lands with P12b)

P12b finalises the app side. Data-side texts:
- **Data side:** append "; `lib/qbRookieLevel.mjs` (`QB_ROOKIE_DEFAULTS`, `GROUPS`, `rookieGroup`, `rookieStarterGames`, `levelTable`), `scripts/qb-rookie-level-run.mjs`, `bin/backtest.mjs --qb-rookie-level`, `backtests/<date>-qb-rookie-level-constants.json`, `test/qb-rookie-level.test.mjs`".
- **Triggers (data side):** append "; `QB_ROOKIE_DEFAULTS`, `rookieGroup`, `rookieStarterGames`, `levelTable` in `lib/qbRookieLevel.mjs`; `scripts/qb-rookie-level-run.mjs`; `test/qb-rookie-level.test.mjs`".
- **Invariant:** append "The app's rookie QB starter level uses the pinned `starterPPG` values of the rookie-level constants file (half-PPR, × the runtime `positionBasisScale`), its groups equal that file's `definitions.groups` (round-based, within-round pick), and every value re-derives exactly from its `fixture`."
- **Mirror:** append "**Rookie starter level (P12):** a change to the primary-passer definition, the rookie or group definition, the seasons or the estimator re-runs `node bin/backtest.mjs --qb-rookie-level --write`, and the app re-pins by byte copy with the data commit SHA. The values are PPG **when he is the primary passer** — a selected subset for day-2/day-3 rookies — so they are a starter level for ROS = share × level, never a talent estimate. Changing the rookie route's shared `projectedPPG` instead of `qbStarterPPG` alone also moves the dynasty rookie prior (CR-25 re-fit)."

### Signal registry (`docs/signal-registry.md`, app) — CR-18 row edits

- **nflverse per-game player stats** row (*Current use*), append after "…offline primary-passer identification for the QB takeover fit (P6a, CR-27); emits coefficients only":
  > ; the same identification selects rookie QBs' primary games for the rookie starter-level fit (P12a, CR-27); emits group aggregates only
- **nflverse playerids crosswalk** row, append after "…`draftOvr`/`draftYear`/`undrafted` read offline by the QB takeover fit (P6a) for draft group and rookie":
  > ; `draftRound`/`draftPick`/`undrafted`/`draftYear` read offline by the rookie starter-level fit (P12a) for its round-based group and rookie flag
- **QB start share** row, append at the end of *Current use*:
  > ; `qbStarterPPG` of 2026 rookie QBs is read back offline from a pinned snapshot and compared with the rookie starter-level fit (P12a, view in the verdict only)

### App backlog line

> **D-61 (registry sync, P12a, next batch):** apply `.claude/tasks/qb-rookie-level-research-registry.md` (data) byte-exact — CR-09 Data side + Triggers + Mirror; CR-08 Data side + Triggers; CR-01/CR-14/CR-15/CR-16 data-side texts; the three signal-registry appends. CR-27's extension lands with P12b.

(Session 1 of P12b re-checks the next free `D-NN` id; D-58..D-60 are taken.)
