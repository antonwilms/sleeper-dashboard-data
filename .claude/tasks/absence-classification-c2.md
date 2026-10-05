# Absence classification — Stage C2: app changes and registry span (L5)

The second half of Stage C, split from `absence-classification-c.md` for size only. Read that file's §0 (C-D1…C-D6) and §1 first; section numbers continue from it. The same Session 2 implements C and C2 as one change, in the order C §2 → C2 §3–§4 → C §5–§6, with C's touch list, done-definition and push order.

## 3. App repo

### 3.1 `src/components/portfolio/Portfolio.jsx` (C-D3)

- Delete `:589-603` (the four-line comment and the `teamPlayed` construction, including the closing
  `}` of `if (liveTile && liveRows != null)` at `:603`).
- In the live branch, replace
  ```js
          const played = teamPlayed.get(liveRows[id].team)
          const missed = weeks.filter((w, i) => w === 'D' || (w === 'X' && played?.has(i) === true)).length
          missedSum += missed
          totalSum += weeks.filter(w => w === 'P').length + missed
  ```
  with
  ```js
          // Served 'D' already covers a week Sleeper omitted him while his team played (CR-28).
          missedSum += weeks.filter(w => w === 'D').length
          totalSum += weeks.filter(w => w === 'P' || w === 'D').length
  ```
- No other change. The memo deps stay as they are (`liveRows` is still read).

### 3.2 Tests — `src/components/portfolio/Portfolio.test.jsx`

Rewrite `FP1-1/FP1-2` (`:714-724`) to the new behaviour, with the same fixture:
- rename it to `'FP1-1/FP1-2 a served X week is not a miss — the store classifies absences (CR-28)'`;
- assert the value is `2` (RB `D` + TE `D`) and the tile contains `of 10` (8 P + 2 D);
- keep `not.toMatch(/of 2\d/)`.

FP1-3, FP1-4, S-L1 … S-L5 stay unedited and green.

### 3.3 Comments and docs (mechanism, never availability)

- **`src/utils/availabilityGrid.js`:** in the header, `:6-8`, replace "a completed historical season
  still carries 'X' at every bye and never gets rewritten (data repo Invariant 1)" (verify the exact
  wording first; keep the sentence's grammar) with "a completed historical season still carries 'X'
  at every bye; the one Invariant-1 correction since rewrote only 'X' → 'D' (CR-28)". Then, after the
  header paragraph ending "…still known.", add:
  > Since absence-classification (CR-28) a served `'D'` also covers a week Sleeper omitted the player
  > while nflverse's weekly roster listed him active, inactive or on reserve with a team that played,
  > so `'X'` inside a season means off those lists that week (practice squad, released, unsigned) or
  > no roster coverage (reserve lists are not listed weekly before 2016). The API-only path
  > (`sleeperStats.js`, no data store) does not classify.
- **`docs/ui.md:81`:** replace
  ``(a `'D'`, or an `'X'` in a week where any live row of the player's `team` is `'P'`)``
  with
  ``(its `'D'` weeks; the store also marks `'D'` a week Sleeper omitted the player while the weekly roster listed him active, inactive or on reserve — CR-28)``.
- **`docs/dynasty-scoring.md:133`:** append to that bullet: ``(`dnpWeeks` counts roster-classified absences since absence-classification — CR-28)``.
- **Sweep.** Run `grep -rn "dnpWeeks\|'D'\|did not play\|Did not play" docs/ src/ --include=*.md --include=*.js --include=*.jsx`,
  excluding:
  - `docs/cross-repo-registry.md` (mirrored; edited only by §4);
  - the dated design/strategy docs (`docs/design_*`, `docs/dynasty-*-design*`, and others CLAUDE.md
    scopes out), apart from the named exception `docs/dynasty-scoring.md:133` above;
  - `src/__fixtures__/` and `*.test.*`.
  Any sentence that *defines* `'D'`/`dnpWeeks` as only "Sleeper returned `gp 0`" gets the same CR-28
  clause. Every edit, and every hit left unchanged with its reason, goes in the hand-back. Do not
  edit `STATUS_LABEL` (`'D'` is still "Did not play").
- **`docs/signal-registry.md`** (CR-18). Match the table's header columns exactly (read the header
  row first).
  - **Row 45** (fantasy scoring core), Reconstructable cell: append
    ``; since absence-classification `'D'`/`dnpWeeks`/`availability` also take nflverse weekly roster status where Sleeper omitted the player (CR-28; reserve lists are listed weekly from 2016)``.
  - **Row 69** (injury overlay), after `` reconstructable** from `dnpWeeks`/`gamesPlayed`/`weeklyStatus` `` insert
    `` (roster-classified since absence-classification, CR-28) ``.
  - **New row after 45:** exactly the row Stage A emitted (`absence-classification-a.md` →
    `## Cross-repo impact`, CR-18 deliverable).

### 3.4 App CLAUDE.md and backlog

- **`CLAUDE.md`:** "all 27 `CR-NN` entries" → "all 28". Check `src/__tests__/claudeMdSize.test.mjs`
  (or its `.js` sibling) stays green.
- **`.claude/tasks/data-repo-backlog.md`:** resolve D-63 in house style (`:397-402` is the model):
  - move the entry under `## Done`;
  - heading becomes `### ~~D-63 · …~~`;
  - add the line `**✅ RESOLVED <date>** — app <sha> + data <sha A>/<sha B>/<sha C> (absence-classification)`.

## 4. Registry span (both repos, byte-identical)

Edit the app's `docs/cross-repo-registry.md` first. Then copy the whole span between the sentinel
comments into the data repo's `cross-repo-registry.md`. Never type the sentinel literals into an
entry.

### 4.1 New entry, appended after CR-27

```
#### CR-28 · Season-totals absence classification (nflverse weekly roster status) *(new — absence-classification, L5, 2026-10)*
- **App side:** every reader of served `'D'` / `dnpWeeks` / `availability`:
  - `classifyInjurySeason` and `wasContributorSeason` in `src/utils/durabilitySignals.js`;
  - `injurySeasons`, `absenceShapeFactor` and `bounceBackFactor` in `computeNextSeasonProjection`
    (`src/utils/seasonProjection.js`; the last fed by `computeBounceBackFlag` in
    `src/utils/projectionSignals.js`), plus its "Injury history ↓" and "Bounced back from lost
    season ↑" summary lines;
  - `injurySeasonCount`, `durabilityScore` and the `'Bounce-back'` label in `computeDynastyScore`
    (`src/utils/dynastyScore.js`);
  - the bounce-back and injury-risk badges in `src/utils/dynastySignalBadges.js`;
  - `buildAvailabilityGrid` in `src/utils/availabilityGrid.js` (rendered by
    `dp/AvailabilityRoleSection.jsx` and `portfolio/Portfolio.jsx`'s `GAMES` strip and `gamesMissedTile`);
  - `buildGameLogRows` in `src/utils/gameLog.js`.

  The shape validator `isValidSeasonTotals` (`src/api/dataStore.js`, requires `dnpWeeks`) is a CR-02
  trigger, referenced not re-listed. The API-only aggregation in `src/api/sleeperStats.js` (no data
  store) does **not** classify.
- **Data side:** `nflverse/rosterweekly/<year>.json` (internal-only, never read by the app), `scripts/update-rosterweekly.mjs`, `.github/workflows/nflverse-rosterweekly.yml`, `parseRosterWeekly` / `ROSTER_WEEKLY_TEAM_ALIAS` / `MIN_ROSTERWEEKLY_SEASON` / `MIN_ROSTERWEEKLY_WEEK_ROWS` / `MIN_ROSTERWEEKLY_WEEK_TEAMS` / `ROSTERWEEKLY_JOIN_RATE_MIN` in `lib/nflverse.mjs`, `validateRosterWeekly` in `lib/validate.mjs`, `classifyAbsences` / `MISSED_ROSTER_STATUSES` / `MIN_ABSENCE_CLASSIFY_SEASON` / `teamPlayedWeeks` in `lib/absence.mjs`, the classification call in `scripts/update-nfl.mjs`, `scripts/migrate-absence-roster.mjs`, and `lib/durabilityMirror.mjs` (offline mirror of the app readers, for `bin/backtest.mjs --absence`, parity-pinned to `test/fixtures/durability-parity-2026-10-04.json`). Data-side readers of the classified fields: `loadAbsenceSegments` in `lib/enrichment.mjs` (`availability.absenceSegments`, Invariant 6 / CR-03) and the `dnpWeeks` reads in `lib/panel.mjs` (`dnpWeeksLastQ`, the outcome `dnpWeeks`)
- **Invariant:** in served season-totals a `weeklyStatus` slot is `'D'` when either:
  - Sleeper returned the player with `gp ≠ 1` (marked `'B'` instead when his row's team had no player
    with `gp === 1` that week; a row with no team is marked `'D'`); or
  - for seasons ≥ `MIN_ABSENCE_CLASSIFY_SEASON` (2016), Sleeper omitted him and the weekly roster
    lists him `ACT`/`INA`/`RES`/`PUP` on a team whose `TEAM_*` row is `'P'` that week.

  The classifier never marks a team-idle week (bye, or the unplayed part of the current week)
  `'D'`. `dnpWeeks` counts the `'D'` slots, and `availability` is computed from the final array.
  2012–2015 weekly status is a season value copied onto every week (not week-accurate), so those
  seasons are Sleeper-only.
- **Direction:** both
- **Triggers:** `classifyInjurySeason` / `wasContributorSeason` in `src/utils/durabilitySignals.js`, `computeNextSeasonProjection` in `src/utils/seasonProjection.js` (`injurySeasons`, `absenceShapeFactor`, `bounceBackFactor`), `computeBounceBackFlag` in `src/utils/projectionSignals.js`, `computeDynastyScore` in `src/utils/dynastyScore.js` (`injurySeasonCount`, `durabilityScore`), `src/utils/dynastySignalBadges.js`, `buildAvailabilityGrid` in `src/utils/availabilityGrid.js`, the `gamesMissedTile` memo in `src/components/portfolio/Portfolio.jsx`, `buildGameLogRows` in `src/utils/gameLog.js`  ‖  `lib/absence.mjs`, `scripts/update-rosterweekly.mjs`, `parseRosterWeekly` / `ROSTER_WEEKLY_TEAM_ALIAS` in `lib/nflverse.mjs`, `validateRosterWeekly` in `lib/validate.mjs`, the classification call in `scripts/update-nfl.mjs`, `scripts/migrate-absence-roster.mjs`, `lib/durabilityMirror.mjs`, `.github/workflows/nflverse-rosterweekly.yml`, `loadAbsenceSegments` in `lib/enrichment.mjs`, `dnpWeeksLastQ` in `lib/panel.mjs`
- **Mirror:** Changing the status set, the team-played source, the 2016 floor or the slot rule changes app `projectedGames`/`projectedTotalPts`, the ×1.05 bounce-back on `projectedPPG` for a few rows, dynasty reliability, the bounce-back/injury-risk badges and labels, and every games-missed display, **with no app-side diff** — add a `grading/anchor-policy.md` boundary. **The correction is one-way:** the stored files no longer hold the Sleeper-only baseline. A widening change can be graded with `bin/backtest.mjs --absence` and applied by re-running `scripts/migrate-absence-roster.mjs`; a narrowing change needs a forced Sleeper re-fetch of every affected season (with CR-02's dominant-team risk) and has no before/after harness. `lib/durabilityMirror.mjs` mirrors the app triggers above at a pinned app SHA; an app change to any of them silently stales that harness, so re-mirror and re-run its DM-1 parity test in the same change. A completed season re-aggregated with `--force` classifies against its own stored roster file, so editing or deleting that file changes a sealed season's `'D'` on the next forced run. The app's API-only mode keeps Sleeper-only `'D'`, so its games-missed counts and durability differ from the store's. In-season, a week's gameday inactives reach `'D'` one season-totals run after the games (the roster refresh runs daily at 06:23 UTC, after the 06:13 run).
```

### 4.2 Edits to existing entries

- **CR-02 Invariant and CR-02 Mirror** (both carry it): replace the whole sentence pair starting
  "**Since my-team-in-season-tiles** the app counts as a missed game" through
  "…so a traded player's other-stint weeks are judged against that team." with:
  > **Since absence-classification** a `'D'` also marks a week Sleeper omitted the player while nflverse's weekly roster lists him active, inactive or on reserve with a team that played (CR-28, 2016+); the app counts `'D'` only as a missed game, My Team's in-season `GAMES MISSED` tile included. A player whose team has not yet played the partly played current week must be marked `'B'`/`'X'`, never `'D'`. One known gap today: a `gp 0` row with no `team` is marked `'D'`.

  (The old pair's second gap, "a row's `team` is its single season team …", described L1's tile
  inference, which §3.1 removes. The classifier judges each week by the roster's own team for that
  week.)
- **CR-02 Triggers**, app side, the Portfolio parenthetical: replace "counting a `'D'` and an `'X'` in a
  week where a live row with the same `team` is `'P'`" with "counting `'D'` only (CR-28)". Verify the
  exact live wording first.
- **CR-02 Triggers**, data side: append `` `scripts/migrate-absence-roster.mjs` `` after
  `` `scripts/migrate-f24-prune.mjs` ``.
- **CR-02 Data side** (prose): where it names `scripts/migrate-f24-prune.mjs`, add
  `` `scripts/migrate-absence-roster.mjs` `` (absence-classification: rewrites only `weeklyStatus`
  `'X'` → `'D'`, `dnpWeeks` and `availability` of completed 2016+ seasons).
- **CR-21 App side:** "since my-team-in-season-tiles also `weeklyStatus` and `team` for the
  in-season `GAMES MISSED` tile" → "since my-team-in-season-tiles also `weeklyStatus` for the
  in-season `GAMES MISSED` tile, counting `'D'` only since absence-classification".
- **CR-21 Mirror:** append
  > **Since absence-classification** every run also classifies omitted weeks against `nflverse/rosterweekly/<year>.json` (CR-28), refreshed daily at 06:23 UTC — after the 06:13 run — so a week's gameday inactives reach `'D'` one run after the games (Sunday's on Tuesday, Monday night's on Friday). The first runs of a season, before upstream publishes that year's roster, write unclassified.
- **CR-16 Data side:** append
  `` ; `ROSTER_WEEKLY_TEAM_ALIAS` in `lib/nflverse.mjs` (NFL GSIS codes `ARZ`/`BLT`/`CLV`/`HST`/`SL` → schedule domain, 2012–2015 weekly rosters; data-only, the app never reads that family — CR-28) ``.
- **CR-04 Data side** (`[registry-stale]`, corrected here; counts measured at `4f469cc` plus
  Stage A):
  - Replace "12 of the 13 `scripts/update-*.mjs` writers register through `updateManifestEntry`,
    directly or indirectly (`update-enrichment.mjs` does **not**). **Five of those twelve now
    register indirectly**: `schedule`, `teamcontext`, `oline`, `gamelogs` and `advstats` delegate to
    `runSeasonKeyedIngest`" with "16 of the 17 `scripts/update-*.mjs` writers register through
    `updateManifestEntry`, directly or indirectly (`update-enrichment.mjs` does **not**). **Eight
    register through `runSeasonKeyedIngest`** — `schedule`, `teamcontext`, `oline`, `gamelogs`,
    `advstats`, `snaps`, `depth` and `rosterweekly` — and `playerstats` registers through two of them
    (`updateAdvStats`/`updateGameLogs`)".
  - Then "hard-coding `inProgress: false` and `schemaVersion: 1` for all five" → "for all eight".
  - Then "Plus **five** non-`update-*` registrars: …, and `scripts/migrate-college-pivot.mjs` (…)"
    → "Plus **six** …", appending `` , and `scripts/migrate-absence-roster.mjs` (absence-classification — `recordCount` unchanged, `schemaVersion: 4`) ``.
  - Verify each quoted fragment against live text before replacing.
  - CR-04 Triggers, data side: add `` `scripts/migrate-absence-roster.mjs` `` after
    `` `scripts/migrate-college-pivot.mjs` ``.
- **CR-18 Data side and Triggers**, data side: add `` `scripts/update-rosterweekly.mjs` ``,
  `` `parseRosterWeekly` `` and `` `MIN_ROSTERWEEKLY_SEASON` `` in `lib/nflverse.mjs`, matching the
  entry's existing pattern for the other nflverse ingests. Read it and mirror the form exactly.


**Gates.**
- `REGISTRY_MIRROR=1 node --test test/registry-mirror.test.mjs` in the data repo is green.
- Data `test/registry.test.mjs` is green. Mind the parser trap: a symbol in parentheses binds to the
  previous file, so CR-28's data-side symbols are written "`sym` in `file`", as above.
- The app's documented drift command (CLAUDE.md / `docs/cross-repo-registry.md` → *Drift check*)
  shows no diff between the two spans.

## Cross-repo impact

This stage **is** the cross-repo change. New coupling **CR-28** (§4.1), edits to **CR-02, CR-21,
CR-16, CR-04** (§4.2), and **CR-18** row edits (§3.3), all landing in both repos in this change
(parent-folder session).

**CR-25 deliberately not fired** (C-D4). **CR-03** (enrichment schemas) is touched because served
`availability.absenceSegments` change across 2016–2025. `enrichment/injuries.json` holds 0 entries,
so nothing is orphaned, and the post-migration `npm run smoke` (`bin/enrich.mjs validate`) checks
it. CR-03 Mirror, quoted: "Any field add, rename or removal must be mirrored in the app's loader and
lookups. `injuries.segmentStartWeek` must continue to match an absence segment in the matching
season-totals file; orphaned entries are validator-flagged and silently ignored app-side."

Current Mirror text of each touched existing entry, quoted verbatim from the app's `docs/cross-repo-registry.md` at `d627562` (byte-identical to the data copy):

- **CR-02** (the L1 sentence pair at its end is replaced (§4.2); the rest is unchanged): "A version bump needs both repos. **Per-season `team` is scoring-load-bearing in the app since the R2 flip (2026-07-11)** — it feeds projection Steps 3/5h attribution via `resolveAttributedTeam`, so any edit to the `aggregateWeeks` dominant-team rule (most played weeks; ties → later stint; zero played → last seen; schedule-domain normalization) changes app projections **with no app-side diff**. Treat such edits as scoring changes and route them through a graded gate. Renaming the `TEAM_` pseudo-id scheme is breaking. **F-24 (2026-08-24), schemaVersion 3→4:** `idp_*`/`punt*` are dropped from every non-`TEAM_*` row's `stats` — a denylist, never an allowlist; CR-11/12/13/19's keys, kicking and `bonus_*` are unaffected, and no `schemaVersion` key is ever written into the season file itself (manifest-only). **D-1, same change, forward-only:** `aggregateWeeks` now also infers a single-team row's bye week(s) from the schedule and writes `'B'` into an `'X'` slot (history keeps `'X'`; a slot already `'D'` is left alone) — this **falsifies a written app-side assumption with no app-side diff**: `src/utils/availabilityGrid.js:4` states the served season-totals *"never emit `'B'`"*, and `src/utils/gameLog.js:130-160` already renders a `kind: 'bye'` row straight off served `weeklyStatus` — so forward seasons now produce real bye rows in `dp/GameLogSection.jsx` with no app-side code change at all. Correct the app comment in the same change. **Since season-rescore.md the app rescores every season's `fantasyPoints` from `stats` × the league's `scoringSettings`** (projections, dynasty score, the in-season blend): do not remove, rename, filter or zero-fill a scoring key — a dropped key silently lowers every projection that depends on it; a zero-filled pre-2022 `bonus_fd_*` silently switches off first-down reconstruction for that season. A new F-24 denylist prefix must be checked against every key any league's `scoringSettings` can carry. **Since weekly-points-display-basis.md the app displays served `weeklyPoints` verbatim** (the pop-up's Game log `PTS` and Distribution histogram) and labels them half-PPR from the row's served `scoringBasis`: changing the basis `weeklyPoints` is written on — D-47 included — without changing `scoringBasis` in the same change mislabels every displayed week, with no app-side diff and no failing test. **Since my-team-in-season-tiles** the app counts as a missed game a `'D'` in the live (in-progress) file's `weeklyStatus`, or an `'X'` in a week where any row with the same `team` is `'P'` (Sleeper omits inactive players, so their slot stays `'X'`). A player whose team has not yet played the partly played current week must be marked `'B'`/`'X'`, never `'D'`, or My Team's GAMES MISSED tile shows phantom misses with no app-side diff. Two known gaps today: a `gp 0` row with no `team` is marked `'D'`, and a row's `team` is its single season team (the dominant-team rule above), so a traded player's other-stint weeks are judged against that team."
- **CR-21** (one sentence appended (§4.2)): "If the weekly job stops running, starts writing partial weeks under a different marking, or the `inProgress` flag's meaning changes, **the app has no way to tell in Market's In-season column set, My Team's in-season columns and header tiles or the in-season seam** — it will read a half-season's rates as though they were a season's, with no error and no test failure. Since defence-numbers-rebuild no surface states a store lag: `/week`, `/teams` and Portfolio read points allowed from Sleeper's weekly stat rows, not from this file, so a stopped job no longer shows in those columns at all. Portfolio's in-season columns and header tiles (my-team-in-season-columns.md, my-team-in-season-tiles.md) do read this file, so a stopped job leaves their so-far PPG, games, rank, so-far lineup PPG and games-missed count silently stale. The floor in `validateNflSeason` is deliberately self-calibrating (`max(1, maxGames - 3)`) so a partial season validates; that means **the validator no longer distinguishes "early season" from "broken scrape" by games played alone**, and the app-side consumer must not assume it does. Any change to the job's cadence, the `inProgress` marking, or that floor is a both-repos change. See CR-04's Mirror for why this family's `inProgress: true` opt-in is a legitimate exception to that entry's "not a pattern to propagate" line — its `inProgress` flag is accurate, not a mislabel. **Since in-season-evidence-2b-2 a mis-marked or stale in-progress file also moves displayed projections and veterans' and rookies' dynasty scores, silently** — `gamesPlayed` counting inactive weeks over-weights every posterior. **Since season-totals-cadence.md (2026-10) the job runs Friday, Monday and Tuesday mornings, so between Friday and Tuesday the file holds a partly played current week under the same `inProgress: true` marking** — teams that have played it carry one more `gamesPlayed` than teams that have not. Per-player readers (the posteriors' own `n`) read this correctly; the league-max reader (Market's "up to N games played") reports the leading teams' count. A new reader that infers "weeks complete" from a league-wide max `gamesPlayed` will be one week early from Friday to Tuesday. Points allowed no longer read this file (defence-numbers-rebuild). **Since qb-takeover-wiring** a modelled QB's ROS evidence is his starts from Sleeper's weekly rows, so a stale or mis-marked file moves neither those QBs' ROS rate nor their points-so-far total."
- **CR-16** (unchanged; only Data side is edited): "A future franchise move (or any change to an existing mapping) updates **both repos in the same change** — and there are **two** mirrored constants here, not one: the era remap *and* the schedule-domain alias (`lib/sleeper.mjs:21` says so in a comment: *"Mirrors the app's `src/utils/nflStats.js` `SCHEDULE_TEAM_ALIAS` exactly"*). A one-sided edit to either produces silently empty joins rather than an error — the team key simply never matches. Note `scripts/update-teamcontext.mjs` is **not** a trigger despite owning the teamcontext ingest: it names `eraTeam` only in a header comment (`:13`) and calls it via `aggregateTeamContext`, so grepping it for the remap finds nothing. **D-1 (2026-08-24) is a new consumer of this composition, not a new mapping** — `aggregateWeeks` joins a single-team row's already-normalized `team` against the nflverse schedule's bye weeks, so a future franchise move that isn't mirrored here silently loses that team's bye inference (degrades to `'X'`, no throw) in addition to the pre-existing teamcontext/schedule join failures this entry already covers."
- **CR-04** (unchanged — its first sentence covers the new family; Data side and Triggers edited): "New families are additive and need no app change (the app already keys by path). Renaming or removing `recordCount` / `schemaVersion` / `lastModified` / `inProgress` is breaking and needs both repos. **Renaming the top-level `files` map, or the per-entry `lastModified`, breaks a second app-side reader that `getManifestEntry` does not shield** — `ktcHistory.js` enumerates `Object.keys(manifest.files)` to discover KTC snapshots and compares `lastModified` for cache invalidation (CR-17); it degrades to an empty history with no error. Note the `inProgress` convention split: nflverse families register `inProgress: false` even while the current season mutates; KTC's `inProgress: true` is a legacy current-value marker, not a pattern to propagate (CR-17). **A second `allowInProgress: true` opt-in exists since in-season-app-read.md — `loadCurrentSeasonTotals` (CR-02) — and it is NOT the same situation as KTC's.** KTC's `inProgress: true` is a mislabel: a KTC snapshot is a completed, immutable capture registered with a "current value" flag that is wrong about the file. An in-progress season-totals file genuinely *is* incomplete and genuinely *should* be read while incomplete — that is the entire point of reading it. The convention this Mirror warns against is using `inProgress` to mean "latest"; season-totals uses it to mean "not finished," which is its actual, documented meaning. Do not read this Mirror's "not a pattern to propagate" line as blocking a genuinely-incomplete family from opting in the same way — read it as blocking a *mislabeled* one. A third `allowInProgress: true` opt-in exists since advstats-live-season-column.md — `loadAdvStatsForSeason` (CR-07), the live-season exact-year advstats read; same genuinely-incomplete case as season-totals, so a future `inProgress: true` on the live advstats file would still render."
- **CR-18** (unchanged; its row-edit deliverable is §3.3): "This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable."
