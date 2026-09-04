# Routing brief for the Claude.ai project — draft CR-22

**What is needed back:** a complete `CR-22` registry entry, in the format defined inside the mirrored
region, **with a concrete App side and app-side `Triggers`**. Nothing else. Per CLAUDE.md the output
is *"not a decision — it is a draft registry entry"*, which returns to a Session 1 here, lands in both
repos in one change, and is then subject to the normal in-repo gate.

**Why this routed.** A data-repo planning session drafted CR-22 in-repo and the plan-reviewer rejected
it. The rejection was empirical: the draft's App side read *"a new loader in `src/api/`"* and *"its
validator in `src/api/`"* — **categories**, which the entry-format definition forbids, on the frozen
far side no data-repo reviewer can ever repair. That is precisely the field the routing exists to get
right. Full reasoning: `.claude/tasks/team-season-pack.md` §0.1.

**Repos:**
- data — `sleeper-dashboard-data` (this brief lives here)
- app — `sleeper-dashboard`

---

## 1. What the coupling is

The team-detail route loads all 14 `nflverse/teamcontext/<year>.json` files and reduces each to a
handful of season sums per team. E7 proposes a precomputed pack so that route fetches one small file.

**Measured (2026-09-03, HEAD `81ea244`):**

| | raw | gzipped | requests |
|---|---|---|---|
| 14 × `nflverse/teamcontext/<year>.json` | 12.79 MB | 1.26 MB | 14 |
| derived pack (minified) | 172 KB | **32 KB** | 1 |

**41× on the wire, 14 round trips → 1.** Pretty-printed it is 266 KB / 36 KB, so the deriver must
minify.

**It is additive.** The week grain stays — CR-10 lists five other consumers. The app must keep its
week-grain fallback, so absence degrades to *slow*, never to *wrong*.

## 2. What is already settled (data side — reuse as-is)

- **Served path:** `nflverse/team-season-summary.json`. **Not** inside `nflverse/teamcontext/`, which
  is year-keyed and family-reconciled by `test/manifest.test.mjs`.
- **Grain:** `(team, season)`, **regular season only** (`seasonType === 'REG'`).
- **Content:** per team-season, 17 offence sums + 2 defence sums + the REG game count = 20 numbers.
  The 17 are `environment.js`'s `OFF_SUM_FIELDS`; the 2 are `def.epaSum` / `def.epaPlays`.
- **Components only, never rates.** CR-10's Mirror says *"aggregate the `*Sum`/`*Plays` components,
  never sum or average stored rates."* The pack stores `epaSum`/`epaPlays`,
  `proeXpassSum`/`proePlays`, `successes`/`successPlays` — the app keeps dividing at read time.
- **35 distinct era-accurate team keys** across the 14 seasons (STL, SD, OAK alongside LA, LAC, LV) —
  **not 32**. The team-key domain is CR-16's; the entry's Invariant should say so, as CR-10's does.
- **7,326** REG team-game rows total (the pack's `rowCount`, this repo's "source rows" convention).
- **Derived from the served files**, not re-derived from play-by-play — that is what makes the
  invariant checkable rather than a second path to the same numbers.

## 3. What is needed from you — the App side

Author against **live `src/`** in `sleeper-dashboard`:

1. **The reader surface.** `src/utils/environment.js` is the consumer — `OFF_SUM_FIELDS`,
   `sumRegOff`, `sumRegDef`, and whichever of `computeTeamSeasonMetrics` / `buildTeamMetricsTable` /
   `buildLeagueRankTable` actually read these sums. Name the ones that do, by symbol.
2. **The 14-season loader being replaced.** `src/hooks/useTeamHistoryLoader.js` — confirm the symbol
   and how the fallback in §1 would be expressed.
3. **The new loader and validator.** They do not exist yet. Decide where they belong by convention
   (`src/api/` alongside `teamContext.js`? a validator in `src/api/dataStore.js` beside
   `isValidTeamContext`?) and **name the files and exported symbols the app will add**, so the entry
   is correct the day it lands.
4. **App-side `Triggers`** — concrete paths and symbols only. A rename of any of them must fire the
   entry.

**One gap the reviewer flagged in the partial draft:** its Invariant named `sumRegOff` while the
app-side Triggers listed only `OFF_SUM_FIELDS` and `sumRegDef`, so a `sumRegOff` rename would fire
nothing. Whatever the Invariant names must appear in Triggers.

## 4. The partial draft — data side usable, App side to be replaced

```
#### CR-22 · Team-season summary pack
- **App side:** ⚠️ TO BE AUTHORED — see §3.
- **Data side:** `nflverse/team-season-summary.json`, `scripts/build-team-season-summary.mjs` (the deriver), `lib/teamSummary.mjs` `summariseTeamSeasons` (the pure reduction), `lib/validate.mjs` `validateTeamSeasonSummary`
- **Invariant:** every value in the pack equals what `environment.js`'s `sumRegOff`/`sumRegDef` would compute from `nflverse/teamcontext/<year>.json` for the same `(team, season)` — **regular season only** (`seasonType === 'REG'`), 17 offence sums + 2 defence sums + the REG game count, keyed by **era-accurate** team abbr (CR-16's domain, 35 keys across 2012–2025). The pack is a **cache of a derivation, never a second source of truth**: when it disagrees with the week grain, the week grain is right.
- **Direction:** data→app
- **Triggers:** ⚠️ app side TO BE AUTHORED  ‖  `scripts/build-team-season-summary.mjs`, `summariseTeamSeasons` in `lib/teamSummary.mjs`, `validateTeamSeasonSummary` in `lib/validate.mjs`, `nflverse/team-season-summary.json`
- **Mirror:** This pack is **derived, not sourced** — it duplicates numbers that also exist in `nflverse/teamcontext/<year>.json`, so the only failure that matters is **drift**, and drift is silent on both sides. Adding a field to `OFF_SUM_FIELDS` app-side without regenerating the pack yields a column of zeros with no error; regenerating the pack from a changed `aggregateTeamContext` without telling the app yields numbers that disagree with the week-grain view rendered beside them. **Any change to the summed field set is a both-repos change in the same cycle.** The pack is regular-season only; a consumer wanting POST must read the week grain (CR-10), not extend this file. If the pack is missing or stale the app must fall back to the week grain rather than render zeros — **absence is recoverable, silent disagreement is not.**
```

## 5. Constraints the entry must respect

- **Entry format**, from inside the mirrored region: field order fixed, no field optional, ids
  permanent and never reused. Triggers are *"concrete paths, exported symbols, constant names or
  served JSON paths — never a category."*
- **The far side of `‖` is frozen authority** — app-side triggers must be right in the registry
  because the data repo's reviewer can never re-derive them.
- **CR-22 is the next id** — 21 entries exist today. Both repos' `CLAUDE.md` say *"all 21 `CR-NN`
  entries"* (data `:254`, app `:227`) and both need updating when it lands.
- The entry must land in `README.md` (data) and `docs/cross-repo-registry.md` (app)
  **byte-identically**, verified by the anchored `sed` diff.

## 6. Known defects in the rest of the plan — not your problem, but do not inherit them

`.claude/tasks/team-season-pack.md` §3–§11 need rework and are on hold. Flagged: the rebuild
mechanism is impossible (`nflverse-teamcontext.yml` is a `uses:` caller and GHA forbids `steps:`
beside `uses:`); `_ingest.yml`'s `purge-path` is a scalar, not a list; the pack overwrites 13
completed seasons on every rebuild with no `--force` gate and no named Invariant-1 exception; the
proposed equivalence test proves only self-consistency, not cross-repo equality. **The entry does not
depend on any of these.**
