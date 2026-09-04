# Per-season `team` on season-totals records

**Status:** planned (opus). Awaiting sonnet implementation.
**Repo:** `sleeper-dashboard-data` (data). **Cross-repo:** YES — season-totals served shape + schemaVersion. App must be updated to match (see *Cross-repo impact*).

---

## TL;DR / decision summary

Add an additive per-season **`team`** field (normalized to the schedule's abbreviation
domain) to every player record in `nfl/season-totals/<year>.json`, and bump season-totals
`schemaVersion` **2 → 3**.

The big resolution-against-live-source finding: **the per-season team is already in hand.**
Sleeper's weekly stats response carries a top-level `team` per player per week, it is
already fetched in `fetchSeasonWeeks` ([lib/sleeper.mjs:70](lib/sleeper.mjs)) and already
passed into `aggregateWeeks`, which currently uses it *only* to build the bye/DNP
`teamsPlaying` set and then discards it. We persist it instead.

This **supersedes the roster → playerids-crosswalk path the task hypothesized.** That path
is both more expensive and lower-coverage here (justification below). This is NOT the
"STOP, do it app-side" case either — app-side is *more* expensive, not less.

Decisions (all justified in the next section):

| Question | Decision |
|---|---|
| Data-repo or app-side? | **Data-repo.** App-side is materially *more* expensive (needs a roster backfill 2012–2023 + a new multi-file app loader). |
| Source + id path | **Sleeper weekly `team`**, already keyed by `sleeper_id` in `aggregateWeeks`. **No crosswalk, no roster join.** |
| Mid-season trades | **Per-season single team = the player's primary team (most played weeks); ties → most-recent played team.** Per-week is feasible but out of scope (keeps the field additive). Trade weeks on the non-primary team are a documented residual. |
| Abbr normalization | Sleeper → schedule domain. Empirically the **only** divergence across 2012–2025 is **`LAR → LA`** (Rams). Everything else (incl. `SD`/`STL`/`OAK`/`LV`/`LAC`/`WAS`/`JAX`) already matches verbatim and is era-accurate from Sleeper. |
| No-team fallback | **`team: null`** → app degrades that season's matchup to `—`, never a wrong opponent. |

---

## Why data-repo via Sleeper (not the crosswalk, not app-side)

**Evidence gathered (live, read-only).** Distinct team abbreviations, Sleeper weekly stats
(`api.sleeper.com/stats/nfl/<y>/1`) vs the committed schedule (`nflverse/schedule/<y>.json`),
across every relocation boundary in the 2012–2025 range:

| Franchise | Sleeper weekly `team` | Schedule `homeTeam`/`awayTeam` | Action |
|---|---|---|---|
| Rams | `STL` → `LAR` (2016+) | `STL` → `LA` (2016+) | **map `LAR`→`LA`** |
| Raiders | `OAK` → `LV` (2020+) | `OAK` → `LV` (2020+) | none (exact) |
| Chargers | `SD` → `LAC` (2017+) | `SD` → `LAC` (2017+) | none (exact) |
| Washington | `WAS` | `WAS` | none (exact; neither uses `WSH`) |
| Jacksonville | `JAX` | `JAX` | none (exact; neither uses `JAC`) |

Sleeper's weekly `team` is **era-accurate** (it returns `SD`/`STL`/`OAK` for old seasons, not
today's abbr) and **100%-populated** (e.g. 1869/1869 entries carried a team in 2015 W1). The
entire normalization map over the whole backfill range is therefore a single entry,
`{ LAR: 'LA' }` — **independently confirmed by the app**, whose
[src/utils/nflStats.js:1-2](../../sleeper-dashboard/src/utils/nflStats.js) already ships
`SCHEDULE_TEAM_ALIAS = { LAR: 'LA' }` with the comment *"Only LAR differs in the current
domain."*

**Why not the roster → playerids crosswalk (the task's hypothesis):**
- `nflverse/roster/<year>.json` exists **only for 2024–2026** (verified: `ls nflverse/roster/`).
  Season-totals span **2012–2025**. The crosswalk path cannot backfill 2012–2023 without
  *first* backfilling 12 new roster files — strictly more committed-data churn than this task.
- Old-season `sleeper_id` coverage in the roster CSV is sparser than Sleeper's native keying;
  Sleeper weekly stats are already `sleeper_id`-keyed with ~100% team coverage.
- It would need a second normalization domain (roster abbrs) and a join. Sleeper needs neither.

**Why not app-side (the task's STOP-and-flag clause):** consuming `nflverse/roster/<year>.json`
in the app would require (a) the same 2012–2023 roster backfill above, (b) a *new* per-season
multi-file app loader (14+ roster fetches) + join + its own normalization, and (c) handling
the same sparse-old-`sleeper_id` problem. That is **more** work than persisting a field we
already compute. The fix belongs in the data repo. **STOP clause not triggered.**

**Net:** zero new fetches, zero new dependencies, one-line normalization, full 2012–2025
coverage, and the data we re-publish already lives in `aggregateWeeks`.

---

## Chosen rules, stated precisely

**Per-season team (single value).** For each player, within `aggregateWeeks`:
- Tally **played** weeks (`gp === 1`) per team → `playedCounts`.
- `team` = the team with the **most played weeks**; ties broken by the **most recent** played
  week (higher week index wins).
- If the player has **zero played weeks** (all `B`/`D`/`X` but present in some week with a
  team): `team` = the team of their **most-recent appearance** (any status).
- If no entry ever carried a team: `team = null`.
- Finally normalize: `team = normalizeTeamForSchedule(team)` (applies `LAR → LA`).

Rationale: "most played weeks" minimizes the number of mis-joined weeks for the residual
mid-season-trade case; for the dominant single-team and offseason-change cases every candidate
rule coincides, so the offseason bye-week false-positive is fixed regardless.

**Mid-season trade residual (documented, accepted).** A traded player's weeks on the
*non-primary* team still join to the wrong opponent. This is strictly better than today
(today *all* weeks use current team, which may be neither). Per-week team is available from
Sleeper and could be a future enhancement, but it changes the served shape (per-week team
array) and the app's join, so it is **out of scope** to keep this change additive.

**Fallback.** `team: null` is valid and expected for: players with no team in any week, and
(transiently) any not-yet-rewritten v2 file. The app maps `null → —` (never a wrong opponent).

---

## Served-record shape diff (one player, 2015 — a relocation season)

`team` is **additive**; no existing field changes; the `pass_rtg`/`cmp_pct` weekly-sum behavior
and C4 recompute are untouched. Implementer note: initialize `team` in the record **literal**
(right after `stats`) so JSON key order is deterministic and the diff stays clean.

```diff
  "2306": {                          // (a 2015 St. Louis Rams player)
    "stats":         { "rec": 84, "rec_yd": 1070, "...": "..." },
+   "team":          "STL",          // ← NEW: per-season, schedule-domain abbr (null if unknown)
    "gamesPlayed":   15,
    "gamesStarted":  15,
    "byeWeeks":      1,
    "dnpWeeks":      0,
    "weeklyPoints":  { "1": 12.3, "...": "..." },
    "fantasyPoints": 168.7,
    "scoringBasis":  "half_ppr",
    "weeklyStatus":  ["P","P","...","X"],
    "availability":  { "...": "..." }
  }
```

For a 2016+ Rams player the served value is **`"LA"`** (Sleeper `LAR` normalized), matching
`nflverse/schedule/2016.json` `homeTeam`/`awayTeam` verbatim.

---

## Function signatures

New, in `lib/sleeper.mjs` (near the top, after the `*_BASE` constants ~line 16; exported):

```js
// Sleeper weekly team-abbr → nflverse schedule team-abbr domain.
// Empirically (2012–2025) the only divergence is the Rams; everything else
// (SD/STL/OAK/LV/LAC/WAS/JAX) already matches the schedule verbatim and is era-accurate.
// Mirrors the app's src/utils/nflStats.js SCHEDULE_TEAM_ALIAS exactly.
export const SCHEDULE_TEAM_ALIAS = { LAR: 'LA' };

/** @param {string|null|undefined} team @returns {string|null} */
export function normalizeTeamForSchedule(team) {
  if (!team) return null;
  return SCHEDULE_TEAM_ALIAS[team] ?? team;
}
```

New, in `lib/validate.mjs` (near `NFL_SENTINELS`, ~line 32; module-local const):

```js
// Schedule team-abbr domain that a normalized season-totals `team` must fall in.
// = the current 32 + historical relocated abbrs present in the 2012–2025 backfill
// range (SD ≤2016, STL ≤2015, OAK ≤2019). Derived from nflverse/schedule/<year>.json.
// Update at relocation/expansion (see Yearly maintenance, Invariant 7).
const SCHEDULE_TEAMS = new Set([
  'ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND',
  'JAX','KC','LA','LAC','LV','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SEA','SF',
  'TB','TEN','WAS', /* historical: */ 'SD','STL','OAK',
]);
```

Existing signatures are unchanged: `aggregateWeeks(weekData)`,
`validateNflSeason(totals, { year })`, `nflHash(players)`,
`updateManifestEntry({ path, recordCount, inProgress, schemaVersion })`.

---

## Edits, grouped by file (with anchors)

### `lib/sleeper.mjs` — capture + normalize the team
- **Add** `SCHEDULE_TEAM_ALIAS` + `normalizeTeamForSchedule` after the `*_BASE` constants
  (~line 16). Signatures above.
- **`aggregateWeeks`** ([lib/sleeper.mjs:117](lib/sleeper.mjs)):
  - In the record initializer ([:149-159](lib/sleeper.mjs)) add **`team: null,`** immediately
    after `stats: {}` (fixed key position → deterministic output).
  - Maintain a transient side map keyed by `player_id`, e.g.
    `teamTracking[pid] = { playedCounts: Map<team,{count,lastWeek}>, lastSeenWeek, lastSeenTeam }`,
    updated inside the existing per-entry loop ([:148-184](lib/sleeper.mjs)): on `gp === 1`
    with a `team`, bump `playedCounts` and record `lastWeek`; on **any** entry with a `team`,
    update `lastSeen*`. (Weeks already arrive in ascending order, and per-week dupes are
    already collapsed at [:129-139](lib/sleeper.mjs).) Do **not** serialize this map.
  - Resolve and assign in the final per-player pass ([:188-194](lib/sleeper.mjs)): change
    `for (const p of Object.values(totals))` → `for (const [pid, p] of Object.entries(totals))`
    and set `p.team = normalizeTeamForSchedule(resolve(teamTracking[pid]))` using the rule in
    *Chosen rules*. Keep the existing `fantasyPoints`/`scoringBasis`/`availability` lines as-is.
  - **Untouched:** the `teamsPlaying` bye/DNP logic ([:143-146](lib/sleeper.mjs), [:176](lib/sleeper.mjs))
    and all stat summation. Team capture is read-only over the same `team` field.

### `scripts/update-nfl.mjs` — schemaVersion bump
- **`updateManifestEntry({ … schemaVersion: 2 })`** ([scripts/update-nfl.mjs:96](scripts/update-nfl.mjs))
  → **`schemaVersion: 3`**. (One line.) `nflHash` ([:26-30](scripts/update-nfl.mjs)) and the
  idempotency/diff/force flow ([:57-98](scripts/update-nfl.mjs)) need **no change** — `nflHash`
  hashes whole player objects, so adding `team` changes the hash, the backfill rewrites each
  file exactly once, and re-runs are no-ops automatically.

### `lib/validate.mjs` — team-domain check
- **Add** the `SCHEDULE_TEAMS` const (~line 32).
- **`validateNflSeason`**, inside the per-player loop ([lib/validate.mjs:110-156](lib/validate.mjs)),
  add: if `p.team !== null` and `!SCHEDULE_TEAMS.has(p.team)` → `throw` with a descriptive
  message naming the player, the bad abbr, and the year (house style; fail loud so a new abbr
  forces a `SCHEDULE_TEAMS`/alias update). `null` is allowed. No finiteness concern — `team` is
  a string, ignored by `findNonFinite` ([:59-78](lib/validate.mjs)).

> No new files; no shared-helper fork. The alias map (sleeper.mjs) and the valid set
> (validate.mjs) are kept in their respective concern-modules; a unit test (below) asserts the
> alias *values* ⊆ `SCHEDULE_TEAMS` to prevent drift.

---

## schemaVersion bump

- Per-file season-totals `schemaVersion`: **2 → 3**, written by
  [scripts/update-nfl.mjs:96](scripts/update-nfl.mjs) on every (re)write; lands in
  `manifest.json` `files["nfl/season-totals/<year>.json"].schemaVersion`.
- This is an **incompatible-by-policy** bump (Invariant 4) even though the field is additive,
  because the contract changes and we want the app's `MAX_SUPPORTED_SCHEMA` gate to coordinate
  the rollout. **Rollout order is load-bearing — see *Cross-repo impact*.**
- Top-level `manifest.schemaVersion` is **unchanged** (per-file versioning only, per the
  manifest helper at [lib/manifest.mjs:34-50](lib/manifest.mjs)).

---

## Manifest & CDN-purge handling

- **Manifest:** handled by the existing `updateManifestEntry` call — each rewritten season file
  gets `schemaVersion: 3`, refreshed `recordCount`, `lastModified`, and unchanged `inProgress`.
  Nothing else to touch.
- **Purge:** there is **no NFL season-totals GitHub Action** (verified: only roster/draft/
  playerids/advstats/schedule/ktc/smoke exist). The nfl update is operator-run, so the backfill
  purge is **manual**, mirroring the documented jsDelivr pattern
  ([nflverse-schedule.yml:40-42](.github/workflows/nflverse-schedule.yml)):
  ```sh
  # after committing the backfilled files + manifest:
  curl -sf "https://purge.jsdelivr.net/gh/<owner>/sleeper-dashboard-data@main/manifest.json" || true
  for y in $(seq 2012 2024); do
    curl -sf "https://purge.jsdelivr.net/gh/<owner>/sleeper-dashboard-data@main/nfl/season-totals/${y}.json" || true
  done
  ```
- The CLAUDE.md Invariant-8 season-keyed-purge rule does **not** apply: season-totals are keyed
  by the operator's explicit `--year`, not a weekly cron, so there is no calendar-vs-season
  rollover hazard here.

---

## Backfill + weekly-refresh sequence

Large one-time committed-data change (like the schedule backfill) — **run by the operator, not
the agent.** App coordination (see *Cross-repo impact*) **must ship first.**

1. **Land the code change** (this task): `lib/sleeper.mjs`, `scripts/update-nfl.mjs`,
   `lib/validate.mjs`, tests, docs. `npm run smoke` + `npm test` green.
2. **(Cross-repo, first)** Ship the app PR that bumps `MAX_SUPPORTED_SCHEMA` 2→3 and reads
   `sd.team`. Until this is live, do **not** publish v3 files (the app would reject them — see
   below).
3. **Backfill completed seasons** (operator):
   ```sh
   for y in $(seq 2012 2024); do node bin/update.mjs nfl --year "$y" --force; done
   ```
   `--force` is required (completed-season guard, [update-nfl.mjs:74-78](scripts/update-nfl.mjs)).
   Each run rewrites the file (hash changed by `team`) at `schemaVersion: 3`.
4. **In-progress season** (2025/2026): the next ordinary `node bin/update.mjs nfl --year <cur>`
   run (no `--force` needed) now stamps `team` automatically via the modified `aggregateWeeks`.
   No new Action and no `aggregateWeeks` caller changes — capture is intrinsic. *Note:* the
   in-progress file is `inProgress: true`, so the app never serves it from the store anyway
   (`dataStore.js` short-circuits on `inProgress`); `team` starts mattering when the season
   completes and the file flips to `inProgress: false`.
5. **Commit** the rewritten `nfl/season-totals/*.json` + `manifest.json` with a message
   explaining the schema bump (satisfies Invariant 1's "committed diff").
6. **Purge** jsDelivr (manifest + each rewritten season file), per above.
7. **Verify** in the app that historical game logs render correct opponents and that a known
   team-change star resolves to its per-season team.

---

## Docs updates

There is no `docs/` in this repo. Required edits:

### `README.md`
- **§`nfl/season-totals/<year>.json`** ([README.md:64-103](README.md)):
  - Line 66 prose — change *"Manifest entries for these files are at `schemaVersion: 2` as of
    Phase 5"* → *"…at `schemaVersion: 3`"* and add a sentence:
    > Each record also carries a per-season **`team`** — the player's primary NFL team that
    > season (most played weeks; ties → most-recent), normalized to the schedule's
    > `homeTeam`/`awayTeam` abbreviation domain (`api.sleeper.com` weekly `team`, with
    > `LAR → LA`; era-accurate, so 2012–2016 Rams = `STL`, etc.). `null` when no team can be
    > resolved. This lets consumers join each game to the correct opponent without relying on a
    > player's current team. Mid-season trades collapse to the primary team (a documented
    > residual).
  - JSON sample ([:69-89](README.md)) — add `"team": "STL",` right after the `"stats"` line.
- **Manifest example** ([README.md:497-501](README.md)) — bump the shown
  `nfl/season-totals/2024.json` `schemaVersion` `2 → 3`.
- **Manifest field table** ([README.md:520](README.md)) — *"NFL season-totals files are at `2`
  after Phase 5"* → *"at `3`"* (note `team` added).
- **(optional)** coverage line ([README.md:28](README.md)) may note per-season team is now carried.

### `CLAUDE.md`
- **Navigation map** ([CLAUDE.md:130](CLAUDE.md)) — `nfl/season-totals/` *"(schemaVersion 2)"* →
  *"(schemaVersion 3)"*.
- **Invariant 4** ([CLAUDE.md:164](CLAUDE.md)) — *"NFL season-totals are at v2 (Phase 5)"* →
  *"at v3 (per-season `team`)"*.
- **Cross-repo contracts → season-totals schemaVersion row** ([CLAUDE.md:187](CLAUDE.md)) —
  *"Writes v2"* → *"Writes v3"*; *"advertises `MAX_SUPPORTED_SCHEMA=2`"* → *"=3"*. Extend the
  row (or add a sibling row) to state the contract:
  > Each record carries an additive per-season `team` (schedule-domain abbr, or `null`); the app
  > joins game logs on `careerStats[season][pid].team` instead of current team.
- **Signal-registry flag** (Self-maintenance, [CLAUDE.md:223](CLAUDE.md)): this **adds a field's
  historical coverage** (per-season team, reconstructable from Sleeper weekly, 2012–present), so
  the task summary must flag `docs/signal-registry.md` (in the **app** repo) for a new/updated
  row: *Source = Sleeper weekly `team`; Coverage = 2012–present; Reconstructable.*

---

## Tests to add (`node --test` + smoke; no Vitest here)

**`test/sleeper.test.mjs`** (mirrors the existing `AW*` `aggregateWeeks` suite; import
`aggregateWeeks`, `normalizeTeamForSchedule` from `../lib/sleeper.mjs`):
- **AW-team-1 (single team):** one team across played weeks → `team` = that team.
- **AW-team-2 (relocation normalize):** entries with `team: 'LAR'` → resolved `team === 'LA'`.
  And `team: 'STL'` (old season) → `'STL'` (unchanged, era-accurate).
- **AW-team-3 (mid-season trade, plurality):** weeks 1–3 played for `A`, weeks 4–10 played for
  `B` → `team === 'B'` (most played weeks).
- **AW-team-4 (trade tie → most-recent):** equal played weeks for `A` then `B` → `team === 'B'`.
- **AW-team-5 (never played):** only `gp:0` entries, all `team: 'C'` → `team === 'C'`
  (most-recent appearance), `gamesPlayed === 0`.
- **AW-team-6 (no team):** entries with `team: null` only → `team === null` (and still a valid
  record — exercises the fallback).
- **norm-1:** `normalizeTeamForSchedule('LAR') === 'LA'`; `('OAK')==='OAK'`; `('KC')==='KC'`;
  `(null)===null`; `(undefined)===null`.
- **drift guard:** every value of `SCHEDULE_TEAM_ALIAS` is a member of `SCHEDULE_TEAMS`
  (import the set; or re-assert the 32 current + SD/STL/OAK here).

**`test/validate-finiteness.test.mjs`** (or a sibling validate test; import `validateNflSeason`):
- **valid:** a minimal totals map where every player has `team` in `SCHEDULE_TEAMS` or `null`
  → does **not** throw (build a fixture passing the existing player-count/`weeklyStatus`
  invariants).
- **invalid:** one player with `team: 'XYZ'` → **throws** (message names player + abbr + year).
- **null allowed:** one player with `team: null` → does **not** throw on the team check.

**`test/update-nfl.test.mjs`** — extend the `nflHash` suite: two otherwise-identical player maps
differing only in `team` hash **differently** (mirrors the existing `off_snp` case at
[:12-22](test/update-nfl.test.mjs)) — proves the backfill detects the change and re-runs stay
no-ops.

**Smoke (free coverage, no new wiring):** `npm run smoke` already runs
`node bin/update.mjs nfl --year 2023 --dry-run`, which live-fetches, aggregates **with team**,
and runs `validateNflSeason` — so the new team-domain check is exercised against real 2023 data
every smoke run. Confirm smoke stays green (2023 has no relocations; all teams in domain).

---

## Cross-repo impact — **KEY SECTION** (app = `sleeper-dashboard`; do not edit it here)

**New contract (this repo publishes):** `nfl/season-totals/<year>.json` at **`schemaVersion: 3`**;
each record gains an additive **`team`** (string in the schedule `homeTeam`/`awayTeam`
abbreviation domain — i.e. `LAR → LA` already applied — or **`null`**). All other fields,
including the `pass_rtg` recompute (C4), are unchanged.

**What the app must mirror — and the load-bearing order:**

1. **`MAX_SUPPORTED_SCHEMA` 2 → 3, shipped FIRST.** The gate at
   [src/api/dataStore.js:81](../../sleeper-dashboard/src/api/dataStore.js) is
   `if (entry.schemaVersion > MAX_SUPPORTED_SCHEMA) return null` (currently `=2`,
   [:8](../../sleeper-dashboard/src/api/dataStore.js)). If the data repo publishes v3 while the
   app is still at 2, the app treats **every** season-totals file as "too new" and falls back to
   **API-only mode** (the ~7-minute career load) — a severe, repo-wide regression. So the app
   PR must be live **before** step 3 of the backfill. (`isValidSeasonTotals`,
   [:101-105](../../sleeper-dashboard/src/api/dataStore.js), only checks
   `gamesPlayed`/`fantasyPoints`/`dnpWeeks` — it does **not** need updating; `team` is additive.)
   - Safe interleaving: with the app at v3-capable and data still v2, the gate passes,
     `sd.team` is `undefined` → join degrades to `—` (never wrong). After the v3 backfill +
     purge, opponents become correct. **No regression window in the app-first order.**

2. **Join on the per-season team in `GameLogPanel`** (one line). At
   [src/components/players/NflStatsTab.jsx:61](../../sleeper-dashboard/src/components/players/NflStatsTab.jsx)
   the panel already computes `const sd = careerStats?.[season]?.[playerId]`. Change the
   `buildGameLog` call ([:66-72](../../sleeper-dashboard/src/components/players/NflStatsTab.jsx))
   from `playerTeam` (the `row.nfl_team` *current*-team prop passed at
   [:345](../../sleeper-dashboard/src/components/players/NflStatsTab.jsx)) to
   **`playerTeam: sd.team ?? null`**. This is strictly correct *and* fixes a second latent bug:
   the panel has a **season selector**, but the current-team prop ignored it — `sd` is keyed by
   the selected `season`, so per-season team is right for every selected season. Do **not** fall
   back to current team when `sd.team` is null (that reintroduces the bug); `null → —` is the
   intended degrade. Update the team-change note ([:84](../../sleeper-dashboard/src/components/players/NflStatsTab.jsx))
   to use `sd.team` for its label too.

3. **The `teamConsistent` bye-week guard can be simplified/removed.**
   `buildGameLog` ([src/utils/nflStats.js:50-116](../../sleeper-dashboard/src/utils/nflStats.js))
   exists to detect a wrong-team join: the guard at
   [:64-73](../../sleeper-dashboard/src/utils/nflStats.js) flips `teamConsistent=false` when a
   played week isn't in the team's schedule, and the task's residual false-positive is two teams
   sharing a bye. With a correct per-season `team`, the join is right by construction, so the
   guard is largely redundant. **Recommendation:** keep it one more cycle as a cheap correctness
   *assertion* (it now mainly catches a mid-season-trade week landing off-schedule), then remove
   or downgrade it once verified. This is the app session's call; flag it in that PR.
   `normalizeTeamForSchedule`/`SCHEDULE_TEAM_ALIAS`
   ([:1-7](../../sleeper-dashboard/src/utils/nflStats.js)) stay as a harmless idempotent no-op on
   the already-normalized served value (`LA → LA`); safe to keep.

4. **Docs (both repos).** App: update its CLAUDE.md *Cross-repo contracts → season-totals
   schemaVersion* and *nflverse schedule* rows (the latter currently says *"the join uses the
   player's current team … a known app-side gap"* — that gap is now closed); and the canonical
   **`docs/signal-registry.md`** row (per-season team, Sleeper-weekly source, 2012–present,
   reconstructable). Data repo: the README/CLAUDE.md edits in *Docs updates* above.

**One-repo-can't-edit-the-other:** this plan changes only the data repo. The four items above
are the app session's responsibility; the data-repo task summary must call them out so
`sleeper-dashboard` is updated to match, and must state the **app-ships-first** ordering.

---

## Done-definition (this task)
1. `npm run smoke` green (incl. the 2023 nfl dry-run exercising the team-domain validation).
2. `npm test` green (new sleeper/validate/nflHash team tests).
3. `manifest.json` updated for every rewritten file (handled by the backfill runs).
4. Task summary flags: the Cross-repo contract change (season-totals shape + schemaVersion,
   **app ships first**) and the app-repo `docs/signal-registry.md` row.
