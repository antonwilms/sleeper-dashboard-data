# Absence classification — Stage C: correction, wiring, app, CR-28 (L5)

Session 1 (opus, **parent-folder session by Anton's instruction** — writes both repos in one change,
the registry route CLAUDE.md names for a new coupling), 2026-10-05. Stage C of three; D1–D5 are in
`absence-classification-a.md` §0. Planned against data `4f469cc` + Stages A and B, and app `d627562`.

**Precondition: Anton has read Stage B's verdict and chosen (a) or (b).** If (c), or if no choice has
been recorded at the top of this file, stop.

Sonnet implements. This stage changes served data that moves app projections with no app-side
projection diff. That is why Stage B ran first and why §5 adds a grading boundary.

## 0. Decisions specific to Stage C

**C-D1 — the historical correction is an in-place rewrite, not a Sleeper re-fetch.** Anton's note
says "re-ingest completed seasons". Session 1 recommends rewriting the stored files in place with
`classifyAbsences` (the F-24 pattern, `scripts/migrate-f24-prune.mjs`) instead of `--force`
re-fetching 2012–2025 from Sleeper. Two reasons:
- a re-fetch also pulls every unrelated Sleeper stat correction since each season was sealed;
- a re-fetch re-runs the dominant-team rule, which CR-02 calls scoring-load-bearing with no app-side
  diff.

The rewrite changes only `weeklyStatus` `'X'`→`'D'`, `dnpWeeks` and `availability`, and the guards in
§2.2 prove it. A forced re-aggregation of a completed season runs the same `classifyAbsences` (§2.1),
so the two paths agree whenever Sleeper's data has not drifted.

**C-D2 — every season-totals run classifies; a missing roster file is a hard error, except at a
season's very start.** This covers the in-progress run, `--force` and `--dry-run`. Running without
the roster would silently turn already-classified `'D'` back into `'X'` and flip-flop the file.

That risk only exists once a classified file exists, and at a new season's first runs upstream may
not have published the year yet. So:
- **completed season, or `--force`:** throw;
- **in-progress season without `--force`:** if the roster file is missing **and** the existing
  season-totals file is absent, write unclassified with a loud `console.warn` (the next run after the
  roster lands classifies everything). If the season file already exists, throw.
- Below `MIN_ABSENCE_CLASSIFY_SEASON` (2016) the roster is not read at all.

**C-D3 — My Team's in-season tile counts stored `'D'` only.** L1's in-tile inference (an `'X'` in a
week the player's team played) is removed. The store now does this with roster status, which also
keeps practice-squad and released weeks out. L5's note asks for exactly this switch.

**Accepted cost:** a week's gameday inactives reach `'D'` one season-totals run after the games
(Stage A §4 cron note: Sunday's on Tuesday, Monday night's on Friday). Until then the tile shows
them as not missed, where L1's inference counted them immediately.

**C-D4 — no `PRIOR_MODEL_FROM` bump; CR-25 deliberately not fired.** `projectedPPG` moves only
through M3 (×1.05 bounce-back), for the handful of rows Stage B lists. Frozen in-season priors keep
their kickoff values, which is the rule's purpose.

CR-25's Invariant says the constant is "bumped in the same commit as any change that moves
`projectedPPG`/`projectedGames`". Its guard, `src/__tests__/priorModelFrom.test.js:2-8`, pins the
**model**, not its inputs. A data-input correction is not a model change, so CR-25 is not fired. *If Stage B shows more than ~10 M3 flips among today's veterans, stop and ask.*

**C-D6 — the correction is one-way.** `classifyAbsences` only turns `'X'` into `'D'`, and the
in-place rewrite discards the Sleeper-only baseline. So:
- **widening** the status set can be evaluated (`--absence`) and applied (rerun the migration);
- **narrowing** it requires a forced Sleeper re-fetch of every affected season, with the CR-02
  dominant-team risk C-D1 avoids.

CR-28's Mirror says this, instead of promising a before/after check either way.

**C-D5 — the app's API-only mode (no `VITE_DATA_STORE_URL`) keeps Sleeper-only `'D'`.** It has no
roster source. The divergence is documented in CR-28, not built around.

## 1. Findings (data `4f469cc`, app `d627562`)

1. `scripts/update-nfl.mjs:139-146`: `aggregateWeeks(weekData, schedule?.games ?? null)`, then
   `validateNflSeason`, then the hash/dedup. `DEFAULT_DEPS.readJson` is injectable (`:36-45`).
   `test/update-nfl.test.mjs` drives `updateNfl` through injected deps, so its fixtures need a
   roster for the new read (§2.1).
2. `.github/workflows/nfl-season-totals.yml` `sparse-paths` holds `nfl/season-totals` and
   `nflverse/schedule` only.
3. The app tile's inference is at `src/components/portfolio/Portfolio.jsx:589-603` (the comment and
   the `teamPlayed` map; `:603` closes `if (liveTile && liveRows != null)`) and `:611-614` (the live
   branch). Its test is `FP1-1/FP1-2` at
   `Portfolio.test.jsx:714-724`. The `docs/ui.md:81` parenthetical describes the inference.
4. **Registry, current text** (identical in both repos at L2's sync; anchored on text, because
   line numbers differ between the two files):
   - CR-02's Invariant and Mirror each end with the L1 sentence that starts
     "**Since my-team-in-season-tiles** the app counts as a missed game a `'D'` …" and ends
     "… so a traded player's other-stint weeks are judged against that team." (quoted in full in §4.2).
   - CR-02's Triggers (app side, Portfolio parenthetical) say "in-season the `GAMES MISSED` tile
     reads the live season-totals rows' `weeklyStatus` the same way, counting a `'D'` and an `'X'`
     in a week where a live row with the same `team` is `'P'`".
   - CR-21's App side has "since my-team-in-season-tiles also `weeklyStatus` and `team`
     for the in-season `GAMES MISSED` tile".
   - The registry's own preamble says "all 27 `CR-NN` entries" in both CLAUDE.md files.
5. `grading/anchor-policy.md` tracks six boundaries, all app-code changes. This is the first one
   caused by a data correction. No snapshot row records which season-totals version it read:
   `inputStatus.careerStats` carries per-season provenance, not `lastModified`.

## 2. Data repo

### 2.1 Forward wiring — `scripts/update-nfl.mjs`

Directly after `const totals = aggregateWeeks(…)` and its log line:

```js
  // absence-classification (CR-28): an 'X' week Sleeper omitted becomes 'D' when the weekly roster lists
  // the player ACT/INA/RES/PUP on a team that played. Every mode classifies — a run without it would
  // turn classified 'D' back into 'X'.
  let classified = totals;
  if (year >= MIN_ABSENCE_CLASSIFY_SEASON) {
    const rosterPath = `nflverse/rosterweekly/${year}.json`;
    const roster = d.readJson(rosterPath);
    if (!roster?.players) {
      const msg = `[nfl] ${rosterPath} missing — run 'node bin/update.mjs rosterweekly --year ${year}' first (absence classification, CR-28).`;
      if (!inProgress || force || existing) throw new Error(msg);   // C-D2
      console.warn(`${msg} Writing UNCLASSIFIED — first file of an in-progress season.`);
    } else {
      const r = classifyAbsences(totals, roster.players, { season: year });
      classified = r.totals;
      console.log(`[nfl] Absence classification: ${r.changedSlots} week(s) 'X' → 'D' ${JSON.stringify(r.byStatus)}`);
    }
  }
  console.log(`[nfl] Absence classification: ${changedSlots} week(s) 'X' → 'D' ${JSON.stringify(byStatus)}`);
```

From there on, use `classified` wherever `totals` is used: `validateNflSeason`, the hash, the diff,
the write, `recordCount`. Import `classifyAbsences` and `MIN_ABSENCE_CLASSIFY_SEASON` from
`../lib/absence.mjs`. `existing` is the `d.readJson(dataPath)` value already read at `:122`, and
`force` is the destructured option.

- Update the D-1 comment block above `aggregateWeeks` with one sentence: bye inference stays
  forward-only, absence classification does not (C-D2).
- `.github/workflows/nfl-season-totals.yml`: add `nflverse/rosterweekly` to `sparse-paths`, and
  extend the cron comment: "reads nflverse/rosterweekly/<year>.json (refreshed daily at 06:23 UTC,
  after this job, so classification lags one run) for absence classification (CR-28)".
- **Tests:** in `test/update-nfl.test.mjs`, every existing fixture's injected `readJson` returns a
  minimal `{ players: {} }` for the rosterweekly path. This is a behaviour change, so update the
  fixtures; no assertion is loosened. Add:
  - **NFL-1:** a missing roster throws for:
    - a completed season (`--force` and `--dry-run`);
    - an in-progress season with an existing season file;
    - an in-progress season with `--force`.

    It **warns and writes unclassified** for an in-progress season with no season file yet. It is
    never read for a season below 2016.
  - **NFL-2:** a fixture week where a KC `TEAM_*` row plays and a KC player is absent from the
    Sleeper week with `INA` in the roster. The written totals carry `'D'` and `dnpWeeks` + 1.

### 2.2 Historical correction — `scripts/migrate-absence-roster.mjs` (new)

Model it on `scripts/migrate-f24-prune.mjs` (read it). Header: "Invariant-1 correction #3 —
absence-classification-c.md C-D1: rewrites `weeklyStatus`/`dnpWeeks`/`availability` of completed
seasons in place; never re-fetches."

Behaviour:
- **Scope:** every `nfl/season-totals/<y>.json` whose manifest entry has `inProgress: false` and
  `y >= MIN_ABSENCE_CLASSIFY_SEASON`. Today that is 2016–2025, so 2012–2015 are untouched (D4) and
  2026 is excluded; the next nfl run classifies it (C-D2).
- **Per season:**
  - read the roster file, throwing if it is missing;
  - run `classifyAbsences`;
  - **guards**, each a throw naming the season and id:
    - the id set is unchanged;
    - for every row, every field other than `weeklyStatus`/`dnpWeeks`/`availability` is deep-equal
      to before;
    - every changed slot went `'X'` → `'D'`;
    - `dnpWeeks` after − before equals the row's changed-slot count;
    - `validateNflSeason(after, { year })` passes.
  - If `changedSlots > 0`: `writeJsonStable(path, after, { minify: true })` and
    `updateManifestEntry({ path, recordCount: Object.keys(after).length, inProgress: false, schemaVersion: 4 })`.
- `--dry-run` reports only.
- Prints a per-season table: changed slots, changed rows, `byStatus`.
- **Idempotent:** a second run reports 0 everywhere. Assert this in a test.
- **Test** (`test/migrate-absence-roster.test.mjs`), against a tmp repo root, the F-24 test pattern
  if one exists, else injected I/O:
  - **MIG-1:** the guards throw on a doctored classifier result: a `'P'` → `'D'` change, and a
    `stats` change.
  - **MIG-2:** writes and manifest updates happen only for changed seasons.
  - **MIG-3:** a second run is idempotent.
  - **MIG-4:** `inProgress: true` seasons are skipped.

### 2.3 Run order (Session 2, in this order)

1. Code commit: §2.1 + §2.2 + tests + workflow + docs (§2.4).
2. `node scripts/migrate-absence-roster.mjs --dry-run`. Compare per-season `changedSlots` with Stage
   B's per-season all-row totals (verdict §1 / panel JSON); they must be equal season by season. On
   any difference, stop and report.
3. **Not within ±20 min of 06:13 UTC on Mon/Tue/Fri** (the season-totals cron). First run
   `git pull --rebase origin main`. Then `node scripts/migrate-absence-roster.mjs`, then
   `node bin/update.mjs nfl` (classifies 2026 in-progress; its normal path). A cron commit to the
   minified `2026.json` between pull and push is a non-union conflict: stop and report.
4. `npm test` and `npm run smoke` green, then the data commit `nfl: absence correction 2012–2025 +
   2026 run (CR-28, Invariant 1)`. Its body is the per-season table from step 3 and a
   two-sentence why.

### 2.4 Data docs

- **`data-catalog.md`:**
  - season-totals row: `'D'` semantics (CR-28 wording), the correction note "Invariant-1 rewrite #3
    (absence-classification, `<commit>`)", effective 2016+;
  - rosterweekly row: consumer now present tense.
- **Panel/backtest note** (`README.md` Module notes, `scripts/panel-run.mjs` section, one
  sentence): R3-FIT, D-12 and other panels re-run on corrected season-totals read the new
  `dnpWeeks`/`absenceSegments` (`lib/panel.mjs:1606,1967`, `scripts/panel-run.mjs:1371`), so their
  outputs are not comparable with verdicts dated before absence-classification.
- **`README.md`:** Module notes for `update-nfl.mjs` (classification step) and the migration script;
  the File-schemas season-totals `weeklyStatus` description.
- **`CLAUDE.md`:**
  - Invariant 1's "Two documented one-off rewrites" → "Three";
  - the `scripts/migrate-*.mjs` row: add `migrate-absence-roster.mjs`;
  - the registry paragraph "all 27 `CR-NN` entries" → "all 28" (also the app CLAUDE.md, §3.4);
  - keep ≤ 25,000 bytes.

## 3–4. App repo and registry span

These are in `absence-classification-c2.md`. Same session and same change: C and C2 are one
implementation, split only for size. Implement C §2, then C2 §3–§4, then C §5–§6.

## 5. `grading/anchor-policy.md` — boundary 7

- **Intro:** "changed six times … one on rookie QB rows (the rookie starter level)" gains ", and once
  through a data correction rather than app code (the absence classification of served
  `weeklyStatus`)"; "six" → "seven".
- **Date table row:**
  `| 7 | data `<migration commit>` (an input correction — no app commit) | <data push UTC> + CDN purge | veteran (QB/RB/WR/TE) | absence classification (served 'D', CR-28) |`.
  Fill the push time in a post-push commit, as P12b did.
- **New section** "### Veteran rows — boundary 7 (input correction)":
  - It is not row-detectable: no factor names the season-totals version, and `inputStatus` carries
    provenance, not `lastModified`.
  - Segment by capture. Captures with `capturedAt` before the data push are legacy. Captures from the
    first daily capture after the purge are corrected.
  - **Cross-check:** for Stage B's 2026 impact movers, the first post-push capture's
    `projection.projectedGames` and `factors.injurySeasons` equal the verdict's "after" values.
    Record it as "to be confirmed" until that capture exists, as boundaries 5 and 6 were.
- **"Boundaries by path":** add a sentence. Boundary 7 moves veteran rows' `projectedGames`,
  `projectedTotalPts`, `injurySeasons` and `absenceShapeFactor`, and `projectedPPG` only on
  bounce-back flips. A pooled veteran games grade spanning it measures the correction.
- **Closing paragraph:** add "boundary 7 as of absence-classification".

## 6. Touch list, commits, push

**Data:**
- `scripts/update-nfl.mjs`, `lib/absence.mjs` (no change expected; import only),
  `scripts/migrate-absence-roster.mjs` (new);
- `test/update-nfl.test.mjs`, `test/migrate-absence-roster.test.mjs` (new);
- `.github/workflows/nfl-season-totals.yml`;
- `data-catalog.md`, `README.md`, `CLAUDE.md`, `cross-repo-registry.md`, `grading/anchor-policy.md`;
- `nfl/season-totals/2012…2026.json` (only changed ones), `manifest.json`;
- this task file.

**App:**
- `src/components/portfolio/Portfolio.jsx`, `Portfolio.test.jsx`;
- `src/utils/availabilityGrid.js` (comment only);
- `docs/ui.md`, `docs/dynasty-scoring.md`, any sweep hits (§3.3), `docs/signal-registry.md`,
  `docs/cross-repo-registry.md`;
- `CLAUDE.md`, `.claude/tasks/data-repo-backlog.md`.

**Not touched:** `lib/sleeper.mjs`, `lib/nflverse.mjs`, `lib/durabilityMirror.mjs`, any app
projection or scoring module, `src/api/sleeperStats.js`, `PRIOR_MODEL_FROM` (C-D4).

**Done-definition:**
- data: `npm test` and `npm run smoke` green; `REGISTRY_MIRROR=1 node --test
  test/registry-mirror.test.mjs` green;
- app: `npm test`, `npm run lint` (0) and `npm run build` clean;
- `grep -rn "PROVISIONAL(" src/` unchanged;
- **App smoke** (`.claude/launch.json`, Anton's league), **against the migrated store**. The app
  reads the CDN, so this runs after the data push and purge; if Session 2 cannot push yet, it
  reports the smoke as pending. Report:
  - My Team tile 3 text (Daniels' 2026 week 3 now counts through `'D'`: confirm in
    `nfl/season-totals/2026.json` that 11566's slot 3 is `'D'` after step 3 of §2.3);
  - one veteran from Stage B's mover list: the pop-up's projected games (and the "Injury history ↓"
    line) after the correction, against the "after" value in Stage B's 2026 impact table. The
    "before" value comes from that table, since the app can only show the corrected state;
  - no console errors.

**Commits:**
- data: code, then the correction (§2.3), then the registry byte copy + anchor-policy;
- app: one commit;
- then a post-push data commit filling the boundary-7 push time.

**Push order — data first:**
1. Data push (git-workflow.md: `pull --rebase` first, `manifest.json` union).
2. `bin/purge-cdn.mjs` for every rewritten `nfl/season-totals/<y>.json`, manifest last.
3. App push.

Data first is regression-free. Until the app lands, the old app's L1 inference counts `'D'` plus
`'X'`-in-played-weeks, and with classified data each miss is still counted once. App first would
briefly undercount.

The registry-mirror daily run is red between the two pushes; keep that window minutes long.

## Cross-repo impact

In `absence-classification-c2.md` → `## Cross-repo impact` (CR-28 new; CR-02, CR-04, CR-16, CR-18 and CR-21 edited; CR-03 quoted; CR-25 deliberately not fired).
