# season-totals-cadence — refresh season totals Fri/Mon/Tue mornings (P1)

Source: `../future_plans/in-season-notes-plan.md` § P1. Session 1 (opus), 2026-10-02. Checked against
data `defacb1`, app `d4ccd3b`.

## Goal

`nfl/season-totals/<season>.json` refreshes once a week, Tuesday 15:05 UTC. Thursday's game and
Sunday's games do not reach the store until the following Tuesday afternoon, and `/week` can show
"week N hasn't reached the data store yet" for part of Tuesday. Move the job to **Fri, Mon and Tue
mornings (06:13 UTC)** so each game window lands a few hours after it ends. Harden the two code paths
that the extra runs expose (Steps 2–3), and decide whether the schedule and playerstats jobs follow
(§ Assessment).

## Verified facts (live, 2026-10-02 ~11:00 UTC, a Friday)

1. **Sleeper serves a partly played week before it ends.** `GET api.sleeper.com/stats/nfl/2026/4`
   returned 145 rows, all CLE/PIT (Thursday's game): 95 with `gp: 1`, 50 with `gp` **undefined**
   (not `0`), all on CLE/PIT. No rows for the other 30 teams. Week 3 (complete): 2357 rows, all 32
   teams with `gp: 1` rows, 799 undefined-`gp` rows, all on teams that played. Week 5: `200 []`.
   State: `{"week":4,"display_week":4,"season":"2026"}`.
2. **Unplayed weeks and future seasons return `200 []`, never an HTTP error** (`2026/18`, `2027/1`,
   `2030/5` all `200`, body `[]`), and so does week 18 of the 17-week era (`2012/18`, `2015/18`, `2019/18`:
   `200 []`; `2019/17` returns 1.46 MB). An HTTP or network error therefore always means a real failure,
   including on `--force`/dry-run re-aggregation of old seasons.
3. **`aggregateWeeks` (`lib/sleeper.mjs:231`) handles a partial week correctly.** A team with no row
   in week N leaves its players at `'X'` for that slot (not `'B'` or `'D'`); D-1 bye inference
   (`:343-356`) only rewrites `'X'` on a team's *scheduled* bye week. A player with an undefined `gp`
   lands in the `else` branch → `'D'` if his team played. That is today's behaviour and unchanged.
4. **Re-runs with no upstream change are free.** `updateNfl` compares `nflHash` before writing
   (`scripts/update-nfl.mjs:129-133`), and `_ingest.yml` commits only if `git status` is dirty. So
   three runs a week add commits only when Sleeper's data actually moved.
5. **Two latent failures become more likely with three runs a week:**
   - **(a) Friday of week 1 fails validation.** On that Friday only Thursday's (and any Friday
     international) game has rows — ~145–290 players. `validateNflSeason` throws below 400 players
     (`lib/validate.mjs:111`) → red job, red cron-deadman until Monday. It happens once a season.
   - **(b) A transient Sleeper error silently commits a regressed file.** `fetchSeasonWeeks`
     (`lib/sleeper.mjs:64-103`) catches a failed week, warns, and pushes `entries: []`. A failure on
     a played week drops that week from every player's totals. The self-calibrating floor
     (`max(1, maxGames − 3)`) still passes, so the file is written, committed and purged. The next
     run heals it, but in the meantime the in-season posteriors read the lower totals (CR-21 Mirror:
     a stale file "moves displayed projections and … dynasty scores, silently"). This is the case
     today too. Tripling the run count triples the exposure.
6. **`scripts/check-crons.mjs` already handles a multi-day cron.** `CRON_FIELD_RE` accepts `1,2,5`;
   `cronCadence` classifies any day-of-week ≠ `*` as `weekly` (maxAge 8d); `evaluateWorkflow` takes
   the minimum maxAge across a workflow's cron lines. No change is needed. Step 1 pins it with a test.
7. **App consumers handle partial weeks correctly** (read, not changed): `buildFpaTable` →
   `collectSeasonFpaRates` divides by each DEF row's own `gamesPlayed` (`src/utils/opponentStrength.js:57`).
   `deriveStoreLag` is per-team against the schedule (`src/hooks/useWeeklyDecision.js:66-98`). The
   posteriors use each player's own `gamesPlayed`. The only readers that see a league-wide figure are
   `maxDefGamesPlayed` → `deriveGamesPlayed` → `n`, whose sole consumer is `buildWeightPanel(n)`
   (`useWeeklyDecision.js:333`), the WeightPanel's display. The lineup's actual points-allowed weight is
   per opponent: `gCur = fpaTable[opponentEra].weights[pos]`, then `FPA_PRIOR_DROP_GAMES` / `blendWeight(gCur, …)`
   (`src/utils/weeklyLineup.js:99-100`), i.e. each DEF's own games. So `n` running one week early cannot move a
   lineup number or cross the drop threshold for a team that has not played. (Plan-review flag 1 was checked
   against this and rejected.) and
   Market's "up to N games played" (`inSeasonEvidence.js:159`, `Market.jsx:1110`). Between Friday and
   Monday both report the Thursday teams' count. Daily snapshots record each player's own `inSeason.n`
   (checked `snapshots/2026-10-01.json`), so later grading can tell a partial-week capture from a
   full one.
8. **The 06:13 UTC slot is clear.** The only nearby crons are cron-deadman (05:19 daily, read-only)
   and registry-mirror (06:41 daily, which commits nothing). The latest Sunday or Monday night games
   finish around 04:30 UTC once US daylight saving ends on 1 Nov. Before that they finish around
   03:30 UTC.
9. **Not verified: when Sleeper's `state.week` rolls over.** `completedWeeks = state.week − 1`. If
   the rollover happens after Tuesday 06:13 UTC, the Tuesday run already holds the complete week and
   the lag notice never shows in a normal week. If it happens before, the notice shows for at most a
   few hours. Either way this beats today's window, which can run up to Tuesday 15:05. See Verification §V2.

## Decisions

- **D-A · Cron `"13 6 * * 1,2,5"` in one line.** Monday catches Saturday and Sunday games. Tuesday
  catches Monday night, so after Tuesday's run the week is complete for every team. Friday catches
  Thursday night plus the midweek NFL stat corrections to the previous week. Christmas 2026 falls on
  a Friday: those games land on Monday.
- **D-B · Partial weeks are written, not held back.** Between Friday and Tuesday the file shows each
  team's games as played so far, under the same `inProgress: true` marking. Fact 7 is why this is
  safe. CR-21 still owes a Mirror note (§ Cross-repo impact).
- **D-C · Fix 5(a) with a narrow opening-week guard, not by loosening the 400 floor.** The floor is
  the CR-02/CR-21 integrity check and stays as it is.
- **D-D · Fix 5(b) with strictness: retry once, then refuse to write.** A red run that keeps the last
  good file beats a green run that publishes holes.
- **D-E · Dead-man window stays at 8 days.** Tightening it for multi-day crons would need a new
  cadence class in `check-crons.mjs` and its tests. It is out of scope. With three runs a week, two
  missed runs in a row now go unflagged, where before it took one.

## Steps

### Step 1 — workflow cadence (`.github/workflows/nfl-season-totals.yml`)

Replace the `- cron: "05 15 * * 2"` line and its comment block (lines 5–12) with:

```yaml
    # Fri, Mon and Tue at 06:13 UTC (season-totals-cadence.md). Each run lands a game window a few
    # hours after it ends: Fri = Thursday night (+ midweek stat corrections to the prior week),
    # Mon = Sat/Sun, Tue = Monday night — after Tuesday's run the week is complete for every team.
    # Between Fri and Tue the in-progress file holds a partly played current week (teams that have
    # played it carry one more gamesPlayed) — CR-21. 06:13 is clear of every committer (KTC 13:17
    # Mon, roster 13:23 Tue, schedule 13:35 Fri); cron-deadman (05:19) and registry-mirror (06:41)
    # commit nothing. Reads nflverse/schedule/<year>.json for D-1 bye inference; the season's
    # schedule is written long before week 1, so the Friday schedule job's timing does not matter.
    - cron: "13 6 * * 1,2,5"
```

Keep the indentation the same as the surrounding YAML. Change nothing else in the file.

**Test** — `test/deadman.test.mjs`, `cronCadence: real cron strings …` (`:77-98`): add
`['13 6 * * 1,2,5', 'weekly', 8],    // nfl-season-totals.yml (Fri/Mon/Tue)` and bump the
`weeklyCount` assertion from 7 to 8 (9 if Step 4 lands — see there). This pins the claim that a
multi-day cron classifies weekly rather than throwing or turning daily.

### Step 2 — opening-week guard (`scripts/update-nfl.mjs`)

Add and export, beside `hasNoData`:

```js
// season-totals-cadence.md D-C — the Friday run of week 1 sees only Thursday's (and any Friday
// international) game: ~150–300 players, under validateNflSeason's 400-player floor. That is a
// normal in-progress state, not a broken scrape, so exit cleanly as hasNoData does. Narrow on
// purpose: only when week 1 is the ONLY week with rows AND fewer than half the league has a
// gp === 1 row in it. Monday's run of week 1 (~28+ teams) is past it and validates normally.
export const OPENING_WEEK_MIN_TEAMS = 16;
export function isOpeningWeekPartial(weekData) {
  const week1 = weekData.find(w => w.week === 1);
  if (!week1 || week1.entries.length === 0) return false;           // hasNoData's territory
  if (weekData.some(w => w.week !== 1 && w.entries.length > 0)) return false;
  const teams = new Set();
  for (const { team, stats } of week1.entries) if (stats?.gp === 1 && team) teams.add(team);
  return teams.size < OPENING_WEEK_MIN_TEAMS;
}
```

In `updateNfl`, directly after the existing `hasNoData` block (`:110-113`), add:

```js
  if (isOpeningWeekPartial(weekData)) {
    console.log(`[nfl] Week 1 of ${year} is only partly played (< ${OPENING_WEEK_MIN_TEAMS} teams) — waiting for the next run. Exiting cleanly.`);
    return;
  }
```

Do not touch `validateNflSeason` or `aggregateWeeks`.

**Tests** — `test/update-nfl.test.mjs`, using the existing `countingFn` / injected-deps pattern
(`:95-125`). Build the fixture with a small helper that makes N teams × M players of
`{ player_id, team, stats: { gp: 1, pts_half_ppr: 5 } }` for a given week:

- `isOpeningWeekPartial`, pure: 2 teams in week 1, all other weeks empty → `true`. 16 teams in week
  1 → `false`. 2 teams in week 1 plus one row in week 2 → `false`. All weeks empty → `false`.
  Undefined-`gp` rows on a 3rd team do not count toward the team set: 2 `gp:1` teams + a team with
  only `gp`-undefined rows → `true`.
- `updateNfl`: week 1 with 2 teams × 60 players, weeks 2–18 empty, `fetchCurrentNflSeason → 2026`,
  `readJson → null` → resolves, `writeJsonStable` and `updateManifestEntry` both 0 calls. In the
  same test, assert `assert.throws(() => validateNflSeason(aggregateWeeks(weekData), { year: 2026 }), /expected ≥ 400/)`
  on that fixture, to prove the guard prevents a real throw. Import `aggregateWeeks` from
  `../lib/sleeper.mjs` and `validateNflSeason` from `../lib/validate.mjs`.

### Step 3 — fetch strictness (`lib/sleeper.mjs` `fetchSeasonWeeks`, `scripts/update-nfl.mjs`)

**3a. `fetchSeasonWeeks(year, { dryRun = false, fetchImpl = fetch, delayMs = 200, retryDelayMs = 2000 } = {})`.**
For each week, try up to **2** attempts (a non-OK status or a thrown fetch/JSON error both count as
a failed attempt), with `await delay(retryDelayMs)` between them. On success push `{ week, entries }`
exactly as today (no new key). If both attempts fail, push `{ week, entries: [], failed: true }` and
keep the existing `console.warn` (add `after 2 attempts`). Replace the inter-week `delay(200)` with
`delay(delayMs)`. The function still never throws; the caller decides. Update the JSDoc return type
to `Array<{ week: number, entries: Array, failed?: true }>`. `aggregateWeeks` ignores the extra key
and needs no change.

**3b. `updateNfl`.** Directly after `const weekData = await d.fetchSeasonWeeks(year, { dryRun });`
(`:106`), **before** the `hasNoData` check, add:

```js
  // season-totals-cadence.md D-D — Sleeper answers unplayed weeks with 200 [], so a failed week is a
  // real failure. Aggregating around it would publish a season with a hole that the self-
  // calibrating floor cannot see. Before hasNoData so an all-failed fetch is not mistaken for preseason.
  const failedWeeks = weekData.filter(w => w.failed).map(w => w.week);
  if (failedWeeks.length) {
    throw new Error(`[nfl] Sleeper fetch failed for week(s) ${failedWeeks.join(', ')} of ${year} — refusing to aggregate a season with holes; the stored file is left as is.`);
  }
```

This throws in `--dry-run` too (smoke goes red on a live Sleeper outage, which is correct).

**Tests.**
- `test/sleeper.test.mjs`: (i) a `fetchImpl` stub that answers `{ ok: true, json: async () => [] }`
  for every week except week 3, which fails once (`{ ok: false, status: 503 }`) then succeeds with
  one row. Assert week 3 has 1 entry and no `failed` key, and `fetchImpl` was called 19 times.
  (ii) Week 3 fails both attempts (once by `ok: false`, once by a thrown error). Assert
  `{ week: 3, entries: [], failed: true }` and that the other 17 weeks have no `failed` key. Pass
  `delayMs: 0, retryDelayMs: 0`.
- `test/update-nfl.test.mjs`: (iii) `fetchSeasonWeeks` returns weeks 1–2 populated (≥ 16 teams so
  no other guard fires), week 3 `failed: true`, rest empty → `assert.rejects(…, /fetch failed for week\(s\) 3/)`,
  `writeJsonStable` and `updateManifestEntry` 0 calls. (iv) All 18 weeks `failed: true` → rejects
  (not the `hasNoData` clean exit).

### Step 4 — playerstats also runs Tuesday (`.github/workflows/nflverse-playerstats.yml`) — **Anton D1, recommended: include**

Add a second cron line under the existing one: `- cron: "47 10 * * 2"`. Extend the comment block
with:

```yaml
    # Tuesday 10:47 UTC (season-totals-cadence.md) — nflverse rebuilds stats_player after Monday night
    # (~05:30 UTC) and daily at ~09:00 UTC, so the completed week lands here Tuesday rather than
    # Saturday. This run re-keys against the PREVIOUS Wednesday's crosswalk: a player first mapped by
    # this week's playerids run is skipped (logged) until Saturday, exactly as he is absent today.
    # Saturday stays the authoritative post-crosswalk run, and still picks up midweek stat corrections.
```

Leave the existing Saturday line and its comment as they are, except one change: "Distinct slot
from Mon(KTC)/Tue(roster)/Wed(playerids)/Fri(schedule). Off-hour :47, distinct day → no race with other
committers" becomes "Distinct time slot from every other committer (Tuesday also runs season-totals at
06:13 and roster at 13:23). Off-hour :47 → no race." Add `['47 10 * * 2', 'weekly', 8]`
to the deadman test case list (weeklyCount 9). If Anton declines D1, skip this step and its doc
edits.

### Step 5 — docs and comments (no behaviour)

- `README.md:1408` (GitHub Actions table, `nfl-season-totals.yml` row): `Tuesday 15:05 UTC` →
  `Fri, Mon, Tue 06:13 UTC`. Replace "Staggered behind the 13:23 roster job so the two Tuesday
  committers don't race the push to main" with "Each run lands a game window hours after it ends;
  between Friday and Tuesday the file holds a partly played current week (CR-21)". Keep the rest of
  the row.
- `data-catalog.md:33`: `Tuesday weekly (in-season-season-totals.md, 2026-08-28)` →
  `Fri/Mon/Tue 06:13 UTC (season-totals-cadence.md, 2026-10; was Tuesday weekly)`. Add one clause:
  "between Friday and Tuesday the current week is partly played; a week-1 run with < 16 teams played
  exits cleanly; any failed Sleeper week fails the run without writing".
- `.github/workflows/daily-snapshot.yml:3-5` comment: "sits after the latest weekly committer
  (nfl-season-totals.yml, Tuesday 15:05)" → "sits after the latest weekly committer
  (nflverse-depth.yml, Saturday 14:50)". **Comment only — the cron line is not touched.**
- `.github/workflows/nflverse-depth.yml:10-12` occupied-slot list: replace `15:05 Tue` with
  `06:13 Mon/Tue/Fri` (and add `10:47 Tue` if Step 4). Comment only.
- `test/args.test.mjs:74` test name: "the Tuesday Action's exact invocation" → "the scheduled
  Action's exact invocation". Name only.
- If Step 4: `README.md:574` ("Weekly Saturday refresh"), `:655`, `:1412` and `data-catalog.md:175`,
  `:199`: say "Tuesday 10:47 + Saturday 13:47 UTC". Add the crosswalk caveat once, at `:574`.
- `CLAUDE.md` navigation row for `scripts/update-nfl.mjs`: in "Guards `hasNoData` / `shouldSkipCompletedSeason`",
  insert ` / \`isOpeningWeekPartial\`` after `hasNoData`'s closing backtick. Nothing else in CLAUDE.md
  (24,946 / 25,000 bytes — this adds 25; `test/claudeMdSize.test.mjs` must stay green).

## Assessment — should schedule and playerstats follow?

**Schedule (`nflverse-schedule.yml`, Fri 13:35): no, not now.** Upstream `games.csv` updates many
times a day (15 commits in the 11 hours to 10:45 UTC on 2026-10-02), so freshness is limited only by
our job. But nothing that reads the **live** season's file uses the fields that change after games:
- App: `/week`'s `buildRegWeekIndex` and Portfolio SOS read only opponents and byes, which are fixed
  for the season.
- Data: `update-nfl.mjs` reads only `homeTeam`/`awayTeam`/`gameType` for byes.

Scores and lines get their first live-season consumers in P2 (W-L-T records) and P4 (Vegas implied
totals). P4 wants lines *before kickoff*, which argues for a Saturday or Sunday-morning run, not
Monday or Tuesday. Decide the slot in P2/P4 planning, against the consumer's actual need.

**Playerstats (`nflverse-playerstats.yml`, Sat 13:47): add Tuesday, keep Saturday (Step 4, D1).**
nflverse rebuilds `stats_player` after each game window and daily at 09:00 UTC (its `update_data.yaml`
cron, confirmed by run history; `stats_player_week_2026.csv` was updated 2026-10-02 09:04 UTC). A
Tuesday run makes the completed week visible four days sooner, before Wednesday waivers and Sunday
lineups. Today the only live-season reader is Market's live RACR column (`loadAdvStatsForSeason`,
`App.jsx:1147`). The 2026 gamelogs file stays below `MIN_PLAYERGAME_ROWS` for several more weeks,
and P5c plans to read Sleeper weekly rows for the current season instead. The value is modest. The
cost is one cron line plus docs, and there is no new failure mode: a skip is logged, a gamelogs skip
below the floor is silent, and content-hash dedup holds. Recommended, but Anton's call.

## Cross-repo impact

**CR-21 fires** — its Data side names "the weekly workflow's own cadence
(`.github/workflows/nfl-season-totals.yml`)" and `hasNoData`'s siblings; Step 2 adds one. Mirror, verbatim (`cross-repo-registry.md:236`):

> If the weekly job stops running, starts writing partial weeks under a different marking, or the `inProgress` flag's meaning changes, **the app has no way to tell on `/teams` or `/portfolio`** — it will render a half-season's rates as though they were a season's, with no error and no test failure. `/week` compares each team's DEF-row `gamesPlayed` against that team's scheduled REG games through Sleeper's completed weeks and states the lag (`deriveStoreLag`), so a stopped job surfaces there as a lag notice that never clears. The floor in `validateNflSeason` is deliberately self-calibrating (`max(1, maxGames - 3)`) so a partial season validates; that means **the validator no longer distinguishes "early season" from "broken scrape" by games played alone**, and the app-side consumer must not assume it does. Any change to the job's cadence, the `inProgress` marking, or that floor is a both-repos change. See CR-04's Mirror for why this family's `inProgress: true` opt-in is a legitimate exception to that entry's "not a pattern to propagate" line — its `inProgress` flag is accurate, not a mislabel. **Since in-season-evidence-2b-2 a mis-marked or stale in-progress file also moves displayed projections and veterans' and rookies' dynasty scores, silently** — `gamesPlayed` counting inactive weeks over-weights every posterior.

The marking and the floor are unchanged. The cadence changes, and partial weeks are now written
under the **same** marking (D-B). No app code change is needed (Fact 7). The both-repos part is a
registry text change. **Route: two-session (Anton's 2026-09-13 override — not a parent-folder session; app applies first, this repo
syncs; the daily registry-mirror run is red in between — keep it same-day).** Exact edits to CR-21
in the mirrored region:

1. In `- **Data side:**`, replace `the weekly workflow's own cadence (\`.github/workflows/nfl-season-totals.yml\`)`
   with `the workflow's own cadence (\`.github/workflows/nfl-season-totals.yml\`, Fri/Mon/Tue 06:13 UTC since season-totals-cadence.md)`,
   and after `\`shouldSkipCompletedSeason\`` insert ` / \`isOpeningWeekPartial\``.
2. Append to the end of `- **Mirror:**` (after "…over-weights every posterior."):

   ` **Since season-totals-cadence.md (2026-10) the job runs Friday, Monday and Tuesday mornings, so between Friday and Tuesday the file holds a partly played current week under the same \`inProgress: true\` marking** — teams that have played it carry one more \`gamesPlayed\` than teams that have not. Per-team and per-player readers (\`buildFpaTable\`'s per-DEF rates, \`deriveStoreLag\`, the posteriors' own \`n\`) read this correctly; the two league-max readers (\`maxDefGamesPlayed\` → the \`/week\` WeightPanel's displayed \`n\` — the lineup's own points-allowed weight reads each opponent's games, not this \`n\` — and Market's "up to N games played") report the leading teams' count. A new reader that infers "weeks complete" from a league-wide max \`gamesPlayed\` will be one week early from Friday to Tuesday.`

3. In `- **Triggers:**`, data side (right of the `‖` separator), replace `` `hasNoData`, `shouldSkipCompletedSeason` in `scripts/update-nfl.mjs` ``
   with `` `hasNoData`, `isOpeningWeekPartial`, `shouldSkipCompletedSeason` in `scripts/update-nfl.mjs` ``.

No sentinel literals or `sed` ranges appear in any of the three edits. Session 2 here edits **neither** registry
copy. The app session applies these three edits to `docs/cross-repo-registry.md` first. A data-repo
sync session then copies the span byte-for-byte, gated on exactly 3 changed lines in the CR-21
entry, and runs `REGISTRY_MIRROR=1 node --test test/registry-mirror.test.mjs`. The app session records it as backlog **D-57** in app
`.claude/tasks/data-repo-backlog.md` (the next free id after D-56).

**Order (strict):** Session 2's implementation commit is pushed first → the app session applies the
registry edits → the data sync lands the same day. A sync before the implementation exists would
name `isOpeningWeekPartial` before `scripts/update-nfl.mjs` defines it, and `test/registry.test.mjs`
(which resolves Data-side symbols) would fail.

**CR-02 fires** (its data-side triggers include `scripts/update-nfl.mjs`). Mirror, verbatim (`cross-repo-registry.md:53`):

> A version bump needs both repos. **Per-season `team` is scoring-load-bearing in the app since the R2 flip (2026-07-11)** — it feeds projection Steps 3/5h attribution via `resolveAttributedTeam`, so any edit to the `aggregateWeeks` dominant-team rule (most played weeks; ties → later stint; zero played → last seen; schedule-domain normalization) changes app projections **with no app-side diff**. Treat such edits as scoring changes and route them through a graded gate. Renaming the `TEAM_` pseudo-id scheme is breaking. **F-24 (2026-08-24), schemaVersion 3→4:** `idp_*`/`punt*` are dropped from every non-`TEAM_*` row's `stats` — a denylist, never an allowlist; CR-11/12/13/19's keys, kicking and `bonus_*` are unaffected, and no `schemaVersion` key is ever written into the season file itself (manifest-only). **D-1, same change, forward-only:** `aggregateWeeks` now also infers a single-team row's bye week(s) from the schedule and writes `'B'` into an `'X'` slot (history keeps `'X'`; a slot already `'D'` is left alone) — this **falsifies a written app-side assumption with no app-side diff**: `src/utils/availabilityGrid.js:4` states the served season-totals *"never emit `'B'`"*, and `src/utils/gameLog.js:130-160` already renders a `kind: 'bye'` row straight off served `weeklyStatus` — so forward seasons now produce real bye rows in `dp/GameLogSection.jsx` with no app-side code change at all. Correct the app comment in the same change. **Since season-rescore.md the app rescores every season's `fantasyPoints` from `stats` × the league's `scoringSettings`** (projections, dynasty score, the in-season blend): do not remove, rename, filter or zero-fill a scoring key — a dropped key silently lowers every projection that depends on it; a zero-filled pre-2022 `bonus_fd_*` silently switches off first-down reconstruction for that season. A new F-24 denylist prefix must be checked against every key any league's `scoringSettings` can carry. **Since weekly-points-display-basis.md the app displays served `weeklyPoints` verbatim** (the pop-up's Game log `PTS` and Distribution histogram) and labels them half-PPR from the row's served `scoringBasis`: changing the basis `weeklyPoints` is written on — D-47 included — without changing `scoringBasis` in the same change mislabels every displayed week, with no app-side diff and no failing test.

No app action. `aggregateWeeks`, `validateNflSeason`, the served shape, its keys and
`schemaVersion` are untouched. Steps 2–3 add only no-write and throw-before-write branches, plus a
retry inside the fetch.

**CR-22 (daily-snapshot.yml)**: comment-only edit (Step 5); cron and steps untouched; no Mirror owed.
**Not fired:** CR-20 (DEF keys untouched), CR-04 (`inProgress` unchanged), CR-18 (no coverage floor
touched; `OPENING_WEEK_MIN_TEAMS` is a run-gate, not a served-coverage floor). Playerstats cadence
(Step 4) appears in no registry entry. CR-18 lists `data-catalog.md` as a data-side trigger: Step 5
changes only a refresh-cadence description, not a field's coverage or reconstructable status, so
there is no signal-registry reclassification. CR-26 lists `daily-snapshot.yml` as the capture
cadence: Step 5's edit there is comment-only, and the cron is unchanged.

## Touch list

`.github/workflows/nfl-season-totals.yml`, `lib/sleeper.mjs` (`fetchSeasonWeeks` only),
`scripts/update-nfl.mjs`, `test/update-nfl.test.mjs`, `test/sleeper.test.mjs`,
`test/deadman.test.mjs`, `test/args.test.mjs` (name only), `README.md`, `data-catalog.md`,
`.github/workflows/daily-snapshot.yml` (comment), `.github/workflows/nflverse-depth.yml` (comment), `CLAUDE.md` (one row, Step 5);
if D1: `.github/workflows/nflverse-playerstats.yml`. Nothing else — in particular **not**
`cross-repo-registry.md`, `lib/validate.mjs`, `scripts/check-crons.mjs`, any data file
or `manifest.json`.

## Done-definition

1. `npm test` green, `npm run smoke` green. Smoke runs `nfl --year 2023 --dry-run` (a completed
   season), so it does **not** exercise the live path.
2. Run `node bin/update.mjs nfl --dry-run` (no `--year` → live 2026; dry-run writes nothing and
   skips the year−1 seal). It must exit 0 and print either a diff or "No change". If run Friday
   to Monday, it covers a partly played week. Paste the last 5 lines of output into the hand-back.
3. Sanity: `node --input-type=module -e` importing `extractCrons` from `scripts/check-crons.mjs` on the new workflow file returns
   `['13 6 * * 1,2,5']` (and `['47 13 * * 6','47 10 * * 2']` for playerstats if D1).
4. Hand back: SHA(s), files touched, deviations, and what each new test asserts.

## Verification (Session 1, after hand-back)

- **V1** — implementation-reviewer on the diff.
- **V2** — after the first scheduled runs (Mon 2026-10-05 and Tue 2026-10-06, 06:13 UTC), check
  the Actions runs and the `nfl: season-totals` commits. On Tuesday, record `state.week` before and
  after ~06:13 to pin Fact 9. Also open `/week` Tuesday morning: the lag notice should be absent. After the Monday run,
  confirm that the week-5 `weeklyStatus` slot of the Monday-night teams' players is `'X'`, not `'B'`
  (plan-review flag 6). Fact 1 showed unplayed teams have no rows on Friday. A placeholder row at
  Monday 06:13 would mark a false bye until Tuesday.

## Plan-review record (2026-10-02, round 1 — 9 flags)

Triaged by Session 1 on Anton's standing delegation. Each flag was checked against live source.
- **1 (HIGH, `/week` n drives blend weights) — rejected.** `n` feeds only `buildWeightPanel(n)`
  (`useWeeklyDecision.js:333`). The lineup's points-allowed weight is per opponent (`weeklyLineup.js:99-100`).
  Fact 7 and the Mirror sentence were sharpened to say so.
- **2 (Triggers list) — applied** as the third CR-21 edit; the sync gate is now 3 lines.
- **3 (sync order) — applied** (§ Cross-repo impact, Order).
- **4 (smoke never runs the live path) — applied** (Done-definition 1–2).
- **5 (old week 18 may 404) — rejected.** Probed `2012/18`, `2015/18`, `2019/18`: all `200 []` (Fact 2).
- **6 (Monday placeholder rows → false bye) — applied as a check in V2.** It cannot be probed until Monday.
- **7 (Mirrors truncated) — applied.** Both are now quoted verbatim from the registry.
- **8 (CR-18/CR-26 not-fired reasons) — applied.**
- **9 (playerstats "distinct day" comment) — applied** in Step 4.


## Implementation record

Session 2 pushed `dc87b48` (`defacb1..dc87b48`), Step 4 included (Anton approved D1). Implementation-reviewer
found no blocking issues and raised 3 low flags, all accepted → Fix pass 1. Live `nfl --dry-run` on a
partly played week 4: 2516 players, validates.

## Fix pass 1

Three items. Change nothing else.

1. **`test/sleeper.test.mjs`, test "fetchSeasonWeeks: a week failing both attempts …" (~`:622-633`).**
   After the existing assertions add `assert.equal(week3Calls, 2);`, which pins the 2-attempt ceiling.
   (Test (i) cannot pin it, because week 3 succeeds on attempt 2.) Do not touch `lib/sleeper.mjs`.
2. **`data-catalog.md:33`.** Replace the span
   `— in-season files (between Friday and Tuesday the current week is partly played; a week-1 run with < 16 teams played exits cleanly; any failed Sleeper week fails the run without writing) (\`inProgress: true\`) are re-exported weekly;`
   with
   `— in-season files (\`inProgress: true\`) are re-exported on every run; between Friday and Tuesday the current week is partly played, a week-1 run with < 16 teams played exits cleanly, and any failed Sleeper week fails the run without writing;`
   Leave the rest of the line as it is.
3. **`.github/workflows/daily-snapshot.yml:4`, comment only.** Replace `clears all thirteen occupied weekly slots` with
   `clears every occupied weekly slot`. Do not touch the cron line or anything else.

Done: `npm test` green. Commit as `season-totals-cadence: fix pass 1`, then `git pull --rebase origin main` and push.
Hand back the SHA and the diff stat.

## Verification record

Fix pass 1 was applied as `6f6f61d` (3 files, 3 lines). Implementation-reviewer re-ran once on
`dc87b48..6f6f61d` and found no flags; `npm test` reports 1171 pass, 0 fail, 4 skipped. Session 1 verified the slice.
Still owed:
- D-57: the app applies the three CR-21 edits, then the data sync lands the same day.
- V2: after the first Mon/Tue runs (2026-10-05 and 2026-10-06), check that the MNF teams' week-5
  slot is `'X'`, record the time of Sleeper's week rollover, and confirm `/week` shows no lag notice on Tuesday.
