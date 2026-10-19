# D-76 · Practice-squad weeks are not missed games (absence-role)

**Backlog:** `sleeper-dashboard/.claude/tasks/data-repo-backlog.md` → D-76. **Evidence:**
`verification/2026-10-18-computed-stats-verification.{md,json}` (V2.12; `v2.info.dnpBySeason`,
`v2.info.dnpNegative`). **Repos:** both — data (classifier, migration, rewrite, impact, data docs) and
app (cache revision, model pin, docs, registry). **Scoring-affecting.** Planned 2026-10-19 (Session 1,
opus, from the parent folder; no source edited).

**Session 2 runs on sonnet, effort medium.** Each stage is its own Session 2 and ends with a hand-back
(SHA or diff range, every file touched, every deviation, what each test asserts). Anton approves the
next stage. implementation-reviewer runs at effort high (scoring-affecting).

Read first: data `CLAUDE.md` (Invariants 1–3, 8, 10), app `CLAUDE.md` (Invariants, Done-definition),
CR-28/CR-29 in `sleeper-dashboard/docs/cross-repo-registry.md`.

---

## 0. Decisions (settled — do not reopen)

**D1 · A role week becomes `'X'`.** No new code. `'X'` already means "no game recorded", and the
app documents it as covering a week the player was "off those lists that week (practice squad, released,
unsigned)" (`src/utils/availabilityGrid.js:13-17`). Today the same real-world state gets two codes:
a practice-squad week Sleeper *omits* is `'X'` (`classifyAbsences` never promotes `DEV`), the same
week Sleeper *returns with `gp 0`* is `'D'`. After this slice both are `'X'`. Every reader checked:

| reader | reads | effect of `'D'` → `'X'` |
|---|---|---|
| `durabilitySignals.js` `classifyInjurySeason` (app) / `durabilityMirror.mjs` (data) | `dnpWeeks ≥ 3` | intended: fewer false injury seasons |
| `seasonProjection.js:700,914-959` | `dnpWeeks` via the above; `availability.absenceSegments`/`longestAbsence` | intended; `'X'` already breaks a run (`computeAvailability`) |
| `projectionSignals.js` `computeBounceBackFlag` | `classifyInjurySeason` | intended |
| `dynastyScore.js:911-940` | `dnpWeeks` via `classifyInjurySeason` | intended |
| `inSeasonScoring.js:536-540` `isHealthyCutRow` | live `dnpWeeks === 0` | intended: a cut veteran on the practice squad reads healthy |
| `availabilityGrid.js`, `Portfolio.jsx:586-600` | counts `'D'` as missed, `'P'+'D'` as total | intended: the week leaves both counts |
| `gameLog.js:150-157` | any non-`'B'`, non-empty code renders a row | none — `'D'` and `'X'` render alike |
| `lib/validate.mjs:150-167` | `dnpWeeks === count('D')` | kept by the classifier |
| `lib/enrichment.mjs` `loadAbsenceSegments` | `absenceSegments` | `enrichment/injuries.json` has 0 entries; nothing can orphan |
| `lib/gamesCalibration.mjs` `accountWeeks`, `migrate-weekly-stats.mjs` | `'P'` only | none — `'P'` never changes |
| `scripts/games-short-run.mjs:242` `inSeasonCheck` | `count(head, 'D')` splits S+1 cut rows into healthy / missed | the split behind `isHealthyCutRow`'s override verdict moves; not refit here (§6 D-85) |
| `lib/panel.mjs:1614,1975` | `dnpWeeks` (Step-4 proxy; rookie outcome field) | report-only fields; see §6 |

A new code (`'S'`, say) would need every reader above plus `isValidSeasonTotals` and the grid labels
changed, and would still disagree with the thousands of omitted practice-squad weeks already stored as
`'X'`. Rejected.

**D2 · One predicate decides both directions.** From 2016, for a non-`TEAM_*` row and week `i`, let
`pairs` = `rosterWeekly[id][i+1]` and `missed` = some pair has a status in `MISSED_ROSTER_STATUSES`
(unchanged: ACT/INA/RES/PUP) on a team that played week `i` (`teamPlayedWeeks`).
- `'X'` with `pairs` non-empty and `missed` → `'D'` (today's rule, unchanged).
- **new:** `'D'` with `pairs` non-empty and not `missed` → `'X'`.
- `pairs` empty (no roster listing that week): the slot is left as Sleeper wrote it, in both directions.
- `'P'` and `'B'` are never touched. Below 2016 nothing changes (`MIN_ABSENCE_CLASSIFY_SEASON`).

Why the empty-`pairs` case is left alone: `validateRosterWeekly` admits a week with as few as 24 teams
(`MIN_ROSTERWEEKLY_WEEK_TEAMS`), so "no listing" can mean "team missing from the file", not "not on a
roster". Cost: 6–53 `'D'` slots per season 2021–2025 stay `'D'` (2–36 of them skill), measured below.

Every non-MISSED status found in a `'D'` slot is a role state, not an absence, and is demoted by the
same predicate: `DEV` (practice squad), `CUT`, `EXE`, `E01`, `E14`, `TRC`, `TRD`. `RES`, `INA`, `PUP`
and `ACT` stay `'D'`. The status set itself does not change, so `'X'` → `'D'` and `'D'` → `'X'` can
never disagree.

**D3 · Scope of seasons: every classified season, 2016–2025, plus 2026 in-progress.** The bug exists
in every classified season; it is large from 2021 only because Sleeper's weekly responses started
returning practice-squad players with `gp 0` that year (2016–2020: 3,388 `DEV` weeks in 2020 are `'X'`,
2 are `'D'`). Expected changes (`'D'` → `'X'`, computed in Session 1 from the committed files):

| season | slots | rows | skill slots | skill rows | by status |
|---|---|---|---|---|---|
| 2016 | 0 | 0 | 0 | 0 | — (file not rewritten) |
| 2017 | 1 | 1 | 0 | 0 | DEV 1 |
| 2018 | 3 | 3 | 1 | 1 | DEV 3 |
| 2019 | 0 | 0 | 0 | 0 | — (file not rewritten) |
| 2020 | 10 | 10 | 1 | 1 | TRC 6, TRD 2, DEV 2 |
| 2021 | 5,474 | 633 | 2,598 | 273 | DEV 5,450, CUT 18, E14 5, TRC 1 |
| 2022 | 5,595 | 632 | 2,516 | 266 | DEV 5,575, CUT 17, TRC 2, TRD 1 |
| 2023 | 5,509 | 589 | 2,513 | 264 | DEV 5,471, EXE 29, CUT 6, E01 2, TRC 1 |
| 2024 | 5,543 | 610 | 2,706 | 272 | DEV 5,511, CUT 19, EXE 13 |
| 2025 | 4,624 | 537 | 2,344 | 248 | DEV 4,599, CUT 20, EXE 5 |
| **2016–2025** | **26,759** | **3,015** | **12,679** | **1,325** | |
| 2026 (live) | 1,261 | 371 | 642 | 181 | DEV 1,239, EXE 18, CUT 4 |

Skill = Sleeper `position` in QB/RB/WR/TE from `raw/-players-nfl.json`. Pending `'X'` → `'D'`
promotions in the completed files: 0 (they were all applied by rewrite #3). Including 2017/2018/2020
widens the brief's 2021–2025 range by 14 slots; leaving them out would leave three files that the
ingest's own classifier disagrees with. **Anton confirms the range at the Stage A approval.**

**D4 · In place, never a re-fetch — Invariant-1 rewrite #5.** Same reason as rewrite #3
(`scripts/migrate-absence-roster.mjs` header): a Sleeper re-fetch would also pull unrelated stat
corrections and re-run CR-02's dominant-team rule. In place is exact here: a slot demoted by D2 has no
MISSED listing, so it cannot be a slot rewrite #3 promoted; applying D2 to a stored file therefore gives
the same `weeklyStatus` as a fresh aggregation followed by D2. The rewrite runs the ingest's own
classifier (`classifyAbsences`, the function `update-nfl.mjs` calls) — no hand edit. Fields that change:
`weeklyStatus`, `dnpWeeks`, and `availability` (derived: `absenceSegments`, `longestAbsence`,
`returnedFromAbsence`; `firstWeek`/`lastWeek`/`absenceCause` cannot change because `'P'` does not).
Nothing else, guarded. `gamesPlayed` is untouched (D-77 stays open).

**D5 · 2020 and the negatives (brief point 2) share no cause with D-76 beyond the one 2020 row.**
- 2020 `devToDRate` 0.001: Sleeper's 2020 weekly responses omit practice-squad players (3,388 `DEV`
  weeks are `'X'`), so there is almost nothing to demote. Its 20 mismatches: 1 is D-76 (pid `7496`,
  week 1 `TEN/DEV` = `'D'`; fixed here), 5 positives are `gamesPlayed` < `snaps.games` (D-77's cause),
  14 negatives (below).
- The 48 negatives (all seasons): **22** have a snaps entry and Δ = `snaps.games − gamesPlayed` exactly
  (every one; D-77's cause — Sleeper `gp 1` in weeks with no snap). **26** have no `nflverse/snaps`
  entry, which V2.12 scores as 0 games (`scripts/verify/lib/v2GradeInputs.mjs:479`), so the reference
  counts every eligible week as missed — a reference artifact. Neither shares D-76's cause: both are
  backlogged (§6), not fixed here.
- Predicted V2.12 after the rewrite (in-memory, Session 1): ≈1,281 of 1,387 mismatches resolve; ≈110
  remain (D-77 and the no-snaps artifact), 4 rows newly negative. Stage C re-measures.
- Unmeasured by V2.12 and not fixable by D2: skill player-seasons with **no** rosterweekly entry at all
  (join gap) keep their Sleeper `'D'` — 322–698 skill `'D'` slots per season 2021–2025. Backlogged (§6).

**D6 · App live path (brief point 3): no app classifier change.** The 2026 season reaches the app only
through the served file (`loadCurrentSeasonTotals`, `src/api/sleeperStats.js:385-406`), which
`update-nfl.mjs` classifies on every run — the data fix covers it. The app's own `gp`-based
aggregation (`getSeasonTotals` step 3, `sleeperStats.js:220-283`) runs only in API-only mode (no data
store) and already skips classification entirely; it cannot read `rosterweekly` (internal-only, never
app-read — adding a read would be a new coupling). It stays as is; a one-line note is added to its comment block (§C2).

**D7 · Cache reach (brief point 5): the manifest path works, but a stale CDN edge can pin the old file
permanently — closed with a purge gate plus an app cache revision.**
- Works: a completed season cached in IndexedDB carries `sourceLastModified`; `getSeasonTotals`
  (`sleeperStats.js:166-201`) refetches when the manifest's `lastModified` is newer. The migration moves
  `lastModified` (`updateManifestEntry`). The manifest is read raw-first (CR-29, `max-age=300`) and
  cached 60 min (`MANIFEST_TTL`), so a browser asks again within ~65 min.
- Trap: the family file comes from jsDelivr (`max-age=604800, s-maxage=43200`, revalidated `no-cache`).
  If the edge still serves the old body, `bodyMatchesEntry` (`dataStore.js:131-139`) cannot tell —
  season-totals has no `generatedAt` and the rewrite keeps `recordCount` — so the old body is persisted
  under the **new** `sourceLastModified` with TTL 999999 and never refetched.
- Close: (1) purge-and-verify every rewritten path (`bin/purge-cdn.mjs`) right after the data push, and
  push the app only after it exits 0; (2) the app adds `SEASON_TOTALS_CACHE_REVISION` (§C2): a
  data-store-sourced completed-season record cached under an older revision is refetched once, so any
  client that cached during the window self-heals when the app ships. Registered as new **CR-30**.
- Daily captures read `raw.githubusercontent.com` with a fresh browser (`daily-snapshot.yml`), so they
  see the new data on the first capture after the push regardless of jsDelivr.
- The live 2026 cache (`season-totals-live/<season>`) keys on `lastModified` equality; a stale-edge copy
  there self-heals on the next 2026 write (cron Mon/Tue/Fri 06:13 UTC). Not covered by the revision.

**D8 · Model pin and one coordinated push (brief point 6).** The model-pin rule wants
`PRIOR_MODEL_FROM` bumped in the same change that moves projections, but the change is a data push and
the constant is in the app. The closest honest equivalent: the data commits stay on a local branch and
reach `main` in **one push window together with the app bump** (§C3), ordered data push → purge
verified → app push, with no daily capture in between. The bump's value is the UTC date of the first
`daily-snapshot` run (16:29 UTC cron) that starts after the app push — the constant's documented
meaning, "first UTC capture date on the current projection model" — and must be strictly later than
`2026-10-14`. With §C3's window (after day D's capture has landed, finished before 06:00 UTC on D+1)
that value is always D+1. In-season cost: none added — the pre-kickoff frozen prior
is already refused (`model-changed`) since the earlier mid-season bumps; captures from the push on
carry the new `projectionModelFrom`, which makes boundary 10 row-detectable (unlike boundary 7).
**Release rule (Anton, 2026-10-19):** nothing is pushed in either repo before Anton signs off C2; if the
purge or the app push is not done by 14:00 UTC on D+1, the data push is reverted through the normal
path and the release is redone another night — data and `PRIOR_MODEL_FROM` are never out of step across
a 16:29 UTC capture (§C3).

**D9 · Impact is measured on the real pipeline, before the push.** The app's full pipeline (App.jsx
memos) cannot be called offline, and the durability mirror covers games/injury/bounce-back but not the
dynasty score. Snapshots carry `dynasty` (score, label, components) since app `49e2ceb`. So Stage C
captures two snapshots from one local app build, against two local copies of the data tree that differ
only in season-totals, and diffs them (§C1). Session 1's mirror pre-estimate over the 435 veterans in
`snapshots/2026-10-18.json`: 2 `projectedGames` movers (+1 each), 6 `injurySeasons`, 8
`absenceShapeFactor`, 1 bounce-back flip (moves `projectedPPG` ×1.05), 30 dynasty injury-season
counts; in-season, 35 of 102 short-season-cut rows read healthy (live `dnpWeeks` → 0).

**D10 · No constant is refitted here (brief point 7).** §6 lists each with a backlog item.

---

## Stage A — classifier, migration, tests, dry-run diff (data repo; nothing in `nfl/` written)

**Isolated worktree, Stages A–C.** From the primary checkout on an up-to-date `main`:
`git worktree add -b d76-absence-role "../sleeper-dashboard-data-d76" main`, then inside it `npm ci`
(lockfile packages only) and `ln -s "../sleeper-dashboard-data/.env" .env` — `git worktree add` copies
no untracked files, and `npm run smoke`'s `cfbd --dry-run` throws without `CFBD_API_KEY`
(`lib/cfbd.mjs:18`). `.env` is gitignored; never `git add` it (check `git status` before every commit). Every Stage A–C data step runs **inside that worktree**; the primary
checkout stays on `main`, so `bin/import-snapshot.mjs` (which commits and runs a bare `git push` from
the primary checkout) keeps working on `main` throughout. All committed inputs the stages read
(`nfl/`, `nflverse/`, `raw/-players-nfl.json`, `snapshots/`) are tracked, so the worktree has them.
**Do not merge or push to `main`** before §C3 — the scheduled `nfl-season-totals` job would apply the
new classifier to 2026 at its next run, ahead of the model pin (D8). Commit on the branch; hand back
the branch SHA. The worktree is removed (`git worktree remove`) only after §C3 step 7.

### A1 · `lib/absence.mjs` `classifyAbsences`

Signature unchanged: `classifyAbsences(totals, rosterWeekly, { season })`. Implement D2 in the existing
per-slot loop (one predicate helper, e.g. `missedOnRoster(pairs, played, i)`, used by both branches).
Return shape grows, keeping every existing key and meaning:
`{ totals, changedSlots, changedRows, byStatus, promotedSlots, demotedSlots, demotedByStatus }`.
- `changedSlots` = `promotedSlots + demotedSlots`; `changedRows` = rows with any change.
- `byStatus` keeps today's meaning (promotions, keyed by the matching MISSED status).
- `demotedByStatus`: demotions keyed by the slot's distinct statuses, sorted and `+`-joined
  (e.g. `"DEV"`, `"CUT+DEV"`).
- A changed row: shallow clone, fresh `weeklyStatus`, `dnpWeeks = (row.dnpWeeks ?? 0) + promoted −
  demoted`, `availability = computeAvailability(next)`. Input never mutated; unchanged rows keep their
  reference.
- Header comment: replace "turns such an 'X' into 'D'" with the two-direction rule and D2's empty-pairs
  reason; cite D-76.

`scripts/update-nfl.mjs:166-168`: log line becomes
`Absence classification: <promotedSlots> 'X' → 'D' <byStatus>, <demotedSlots> 'D' → 'X' <demotedByStatus>`.
No other change there.

`scripts/migrate-absence-roster.mjs`: code unchanged. Add one header line: superseded by rewrite #5
(`migrate-absence-role.mjs`); once rewrite #5 is on disk a re-run is a no-op (the classifier is
idempotent on the stored files); run against files not yet rewritten (between the D-76 classifier
commit and rewrite #5) it throws at its `'X'`→`'D'`-only guard on the first demotion — by design.

`lib/io.mjs`: add `writeJsonStableAt(absPath, value, { minify })` — the same serialization and
trailing newline as `writeJsonStable`, at an absolute path; `writeJsonStable` becomes
`writeJsonStableAt(repoPath(relPath), …)` (byte-identical output for every existing caller). Needed
because `repoPath` is `path.join(REPO_ROOT, …)`, so an absolute path handed to `writeJsonStable` lands
inside the repo. Unit test **IO-1** (in the existing io test file, or a new `test/io.test.mjs`): both
writers produce identical bytes for the same value, minified and pretty, and `writeJsonStableAt`
writes to the absolute path given (a temp dir via `fs.mkdtempSync(os.tmpdir())`). Goes in the
existing `test/io.test.mjs`.

### A2 · New `scripts/migrate-absence-role.mjs` (Invariant-1 rewrite #5)

Modelled on `migrate-absence-roster.mjs` (same `DEFAULT_DEPS` seam, same season selection: manifest
entries `nfl/season-totals/<y>.json` with `inProgress: false` and `y ≥ MIN_ABSENCE_CLASSIFY_SEASON`).
Per season: read file + `nflverse/rosterweekly/<y>.json` (missing → throw), run `classifyAbsences`, run
`assertRoleGuards`, then write or report.

`assertRoleGuards(before, after, rosterPlayers, { relPath, year })` — each a throw naming season, id
and slot:
1. Row id set unchanged.
2. Every field other than `weeklyStatus`/`dnpWeeks`/`availability` deep-equal.
3. Every changed slot is `'D'` → `'X'`; zero `'X'` → `'D'` (a promotion means a rosterweekly file
   changed after rewrite #3 — stop).
4. **Independent re-derivation**, not trusting the classifier: for each changed slot the roster lists
   the player that week and no pair is MISSED on a team that played (team-played re-read from `before`'s
   `TEAM_*` rows).
5. `before.dnpWeeks − after.dnpWeeks` = changed-slot count.
6. `after.availability` deep-equals `computeAvailability(after.weeklyStatus)`, and its `firstWeek`,
   `lastWeek`, `absenceCause` equal `before`'s.
7. `validateNflSeason(after, { year })` passes.
8. Idempotent: `classifyAbsences(after, …)` returns `changedSlots === 0`.

**I/O seam.** Every read and write goes through the script's `DEFAULT_DEPS` (pattern of
`migrate-absence-roster.mjs`): `readManifest`, `readJson`, `writeJsonStable`, `writeJsonStableAt`,
`writeText` (absolute path, for the MD), `exists` (absolute path, for the refuse-overwrite check),
`gitShow`, `updateManifestEntry`, `validateNflSeason`, `classifyAbsences`. Tests inject all of them;
no test touches the real repo, `verification/` or the filesystem outside a `fs.mkdtempSync` temp dir.

Modes (exactly three; `--report <basePath>` is **required** in every mode — no default — and names
`<basePath>.md` + `<basePath>.json`):
- `--dry-run --out-dir <dir> --report <basePath>`: `<dir>` must be absolute and resolve outside the
  repo working tree (`path.relative(repoPath(), dir)` starts with `..`; else throw). Writes each changed
  season to `<dir>/nfl/season-totals/<y>.json` with **`writeJsonStableAt`** and `{ minify: true }`
  (never `writeJsonStable`); never writes the repo's data files or the manifest. Writes the A3 report.
- `--report <basePath>` (no other flag): Stage B only. Writes changed seasons in place with
  `writeJsonStable(relPath, …, { minify: true })`, `updateManifestEntry({ path, recordCount,
  inProgress: false, schemaVersion: 4 })`; unchanged seasons are not written. Writes the A3 report.
- `--report-only --before-rev <rev> --report <basePath>`: writes nothing but the report. "Before" =
  each season file read via `git show <rev>:nfl/season-totals/<y>.json` (`execFileSync`, `maxBuffer
  1 << 30`, pattern of `scripts/fixtures/build-durability-parity.mjs`); "after" = the working tree;
  the report also checks `classifyAbsences(after)` changes nothing.

**`<basePath>` resolution (all modes):** a relative `<basePath>` resolves against the repo root and
must lie under `verification/` (else throw); an absolute one must resolve outside the repo working
tree (same `path.relative` test as `--out-dir`; else throw). Both are written with `writeJsonStableAt`
(JSON) and `fs.writeFileSync` on the resolved absolute path (MD) — never through `writeJsonStable`/
`repoPath`, which would rebase an absolute path under the repo. The writer refuses an existing
`<basePath>.json` (no silent overwrite).

**Report JSON shape** (fixed, so runs can be compared): `{ meta, seasons, totals }`. `meta` holds
everything mode-specific (`generatedAt`, `mode`, `outDir`, `beforeRev`, the `--report-only`
idempotency result, tool version); `seasons` is `{ [year]: { beforeSha256, afterSha256, beforeBytes,
afterBytes, rows, leafChangesByField, availabilityChangesBySubfield, demotedSlots, demotedSkillSlots,
changedRows, changedSkillRows, demotedByStatus, dnpDeltaHistogram, segmentShapeChanges, topSkillRows,
residual } }`; `totals` sums `seasons`. In dry-run, `afterSha256` is the would-be file's; in the other
modes, the working-tree file's — so the two agree exactly when the rewrite reproduced the dry-run.

### A3 · Field-level diff report (`fieldDiff` + report writer, in the same script)

`fieldDiff(before, after)` — a generic recursive leaf diff, independent of the guards: every
`(id, path)` whose value differs (arrays by index). The report, per season:
- sha256 and byte size of the stored file and of the would-be file; row count before/after.
- leaf-change counts grouped by top-level field and by `availability.*` subfield. **Assert** the
  top-level set ⊆ {`weeklyStatus`, `dnpWeeks`, `availability`} and `availability` changes only in
  `absenceSegments`, `longestAbsence`, `returnedFromAbsence`.
- slots demoted (all / skill), rows changed (all / skill), `demotedByStatus`, histogram of per-row
  `dnpWeeks` deltas, and how many rows' `absenceSegments` change shape.
- the 20 skill rows with the largest `dnpWeeks` drop: id, name, position, team, before → after.
- the residual: `'D'` slots left with no roster listing, split "player has no rosterweekly entry in the
  season" vs "listed in other weeks only" (all / skill).
- spot rows: pid `2944` 2021 (expected `dnpWeeks` 16 → 0) and pid `7496` 2020 (2 → 1).
Totals across seasons. The JSON holds the same numbers; the MD is for Anton.

**Expected:** exactly §D3's table for 2016–2025; any difference → stop and report before handing back.

### A4 · Tests (`npm test`)

`test/absence.test.mjs` — existing A-1…A-7 stay green unchanged (A-1's second case still holds: an
`ACT` listing keeps `'D'`). Add:
- **A-8** `DEV` on a team that played turns a Sleeper `'D'` into `'X'`; `dnpWeeks` −1; `availability`
  recomputed; `demotedSlots` 1, `demotedByStatus` `{ DEV: 1 }`, `byStatus` `{}`.
- **A-9** each of `CUT`, `EXE`, `TRC`, `TRD`, `E14`, `E01` demotes; each of `ACT`, `INA`, `RES`, `PUP`
  keeps `'D'`.
- **A-10** traded week `[['NYJ','DEV'],['KC','INA']]`, KC played → stays `'D'`;
  `[['NYJ','CUT'],['KC','DEV']]` → `'X'`, `demotedByStatus` `{ 'CUT+DEV': 1 }`.
- **A-11** a `'D'` week with no listing stays `'D'`; a player absent from `rosterWeekly` entirely keeps
  every `'D'`.
- **A-12** one row with both a promotion and a demotion: `changedSlots` 2, `dnpWeeks` net 0, segments
  recomputed.
- **A-13** season 2015 with `DEV` listings: input returned by reference, nothing demoted.
- **A-14** a demoted slot inside a `'D'` run splits the segment: `['P','D','D','D','P']` with week 3
  `DEV` → `absenceSegments` `[{2,2,1},{4,4,1}]`, `longestAbsence` 1.

`test/update-nfl.test.mjs` — **NFL-3**: an injected week where Sleeper returns a player with `gp 0`
while his team played and the roster lists him `DEV` writes `'X'`, not `'D'`, and `dnpWeeks` 0
(pattern of NFL-2 at `:433`).

New `test/migrate-absence-role.test.mjs` (injected in-memory repo, as `migrate-absence-roster.test.mjs`):
- **MR-1** each guard 2–8 throws on a doctored classifier result (a stats change; a `'P'`→`'X'`; an
  `'X'`→`'D'`; a demotion whose roster pair is `ACT`; a `dnpWeeks` mismatch; a stale `availability`).
- **MR-2** write mode (`--report` only) writes only the changed completed season and its manifest entry; skips
  `inProgress` and pre-2016 seasons; a second run writes nothing. Report writes go to the injected
  `writeJsonStableAt`/`writeText` only.
- **MR-3** `--dry-run --out-dir` writes the season under the out dir only — through an injected
  `writeJsonStableAt`, asserted to receive the absolute out-dir path, while the injected repo writer
  and manifest are never called — and refuses an out dir inside the repo; a missing `--report` and an
  existing `<basePath>.json` both throw; a relative `<basePath>` outside `verification/` and an absolute
  `<basePath>` inside the repo both throw; an absolute `<basePath>` outside the repo is written at exactly
  that path (asserted on the injected `writeJsonStableAt` argument), and a relative one at
  `<repo>/verification/…` (asserted on the injected writer's argument — nothing reaches disk).
- **MR-5** `--report-only --before-rev` (injected `gitShow`) reports the same counts as the dry-run did
  for the same before/after pair, and writes nothing but the report (injected writers only).
- **MR-4** `fieldDiff` reports exactly the changed leaves of a two-row fixture and the report's
  top-level assertion throws when a fixture changes `stats`.

Invariant 10: no test reads `nfl/`, `nflverse/` or `snapshots/` live files.

### A5 · Data docs (Stage A commit)

- `README.md` → *Module notes*: `lib/absence.mjs` paragraph (`:1418-1430`) rewritten for D2 (both
  directions, empty-pairs rule, new return keys); `scripts/migrate-*.mjs` list gains
  `migrate-absence-role.mjs` (#5); the `migrate-absence-roster.mjs` bullet notes it is superseded; the
  list intro gains the CR-30 sentence (§ Cross-repo impact). `lib/io.mjs` exports line adds
  `writeJsonStableAt`.
- `CLAUDE.md` navigation rows: `lib/absence.mjs` purpose → "Pure weekly-roster absence classifier
  (`classifyAbsences`) for season-totals `weeklyStatus` — `'X'`↔`'D'` by roster status";
  `scripts/migrate-*.mjs` list adds `migrate-absence-role.mjs` (#5) and the CR-30 clause (short form).
  Stay under 25,000 bytes.
- `scripts/migrate-absence-role.mjs` header carries the CR-30 sentence; the entry point is exported as
  `migrateAbsenceRole` (CR-30's Data symbol).

### A6 · Run, then hand back

1. `npm test`, `npm run smoke` — green.
2. `node scripts/migrate-absence-role.mjs --dry-run --out-dir <abs path outside the repo> --report
   verification/<UTC date>-absence-role-diff` — commit the report pair with the code (unregistered:
   Invariant 3's documented `verification/` exception). The would-be season files stay outside the
   repo; keep them until Stage B (their sha256 is the Stage B proof).
3. `node bin/backtest.mjs --absence` (report-only, no `--write`). This is the **only** run in which it
   measures D-76: its "before" is the committed files and its "after" is `classifyAbsences(before)`, so
   once Stage B lands the two are identical and the run is vacuous. Before running it, update
   `scripts/absence-run.mjs` so its output is honest about two directions: `correctStore` records
   `promotedSlots`, `demotedSlots`, `byStatus`, `demotedByStatus` alongside `changedSlots`/`changedRows`;
   `buildAbsenceVerdictMarkdown` §1 prose says "reclassified by `classifyAbsences` (omitted `'X'` →
   `'D'` and role `'D'` → `'X'`, CR-28)" and its corrections table gains `promoted | demoted |
   demotedByStatus` columns. `test/absence-run.test.mjs` AR-1 additionally asserts
   `promotedSlots === 2`, `demotedSlots === 0` for its 2018 correction. Paste the run's §1 table, §3
   and §5 into the hand-back; it is not written to `grading/` (C1 cites it).
4. Hand back: branch SHA, files, deviations, test assertions, the report path, and the §D3 comparison.

**Stop conditions:** any guard throw on real data; any count off §D3; `--absence` parity below its
floor.

---

## Stage B — the rewrite commit (data repo, after Anton approves the A diff)

In the `d76-absence-role` worktree:
1. `node scripts/migrate-absence-role.mjs --report verification/<UTC date>-absence-role-rewrite`
   (write mode). Expected writes: 2017, 2018, 2020–2025 (8 files) + their manifest entries; 2016 and
   2019 untouched.
2. Proof, in order:
   a. Every written file's sha256 equals the would-be file's sha256 in Stage A's out dir (and its
      report's JSON).
   b. Idempotency on disk: `--dry-run --out-dir <fresh abs dir> --report <that dir>/idempotency` (scratch,
      not committed) reports zero changes and writes no season file.
   c. `--report-only --before-rev <Stage A commit SHA> --report <scratch>/from-git` — its per-season
      `seasons` and `totals` deep-equal Stage A's committed `verification/…-absence-role-diff.json`
      `seasons` and `totals` (`meta` is never compared).
   Commit only the step-1 report pair; the 2b/2c reports stay in scratch.
3. `npm test`, `npm run smoke`, `npm run validate:enrichment`.
4. Commit: `data: Invariant-1 rewrite #5 — practice-squad and other role weeks 'D' → 'X' (D-76)`; body:
   what (fields, seasons, slot counts), why (V2.12, mechanism), proof (report path, guard list).
   **Do not push.**
5. Hand back the SHA.

---

## Stage C — impact, app side, docs, coordinated push

Planned in [`d76-absence-role-c.md`](d76-absence-role-c.md): C1 impact measurement; C2 app change (in an app
worktree, branch `d76-absence-role`) and data docs, committed in both repos but **not pushed**, then implementation-reviewer (effort high) and
Anton's sign-off; C3 a separate release session (pull, data push, purge, app push, live checks) with a
revert rule. The §C references in this file point there.

---

## 6. Constants fitted on the faulty data, and backlog (brief point 7)

No refit in this slice. Items go to `sleeper-dashboard/.claude/tasks/data-repo-backlog.md` in C2
(numbers are the next free ids at that time; D-79 onward as of today):

| item | what read `dnpWeeks`/`'D'` | likely to move |
|---|---|---|
| **D-79 · `SHORT_SEASON_K` (L6c)** — `backtests/2026-10-10-games-short-constants.json`, pinned in `src/utils/shortSeasonConstants.js` / `lib/durabilityMirror.mjs` | predictor `avgGames` from `projectedGamesFor` (injury multiplier, absence shape); outcome `gamesPlayed` unaffected | low — 2 of 435 veterans' `projectedGames` move; re-run `--games-calibration --short` after the push and compare k; **Anton 2026-10-19:** practice-squad history may be a real next-season signal as a role input (Stage A graded check: MAE 4.872 → 4.874 after the fix) — test it as a separate input, not by restoring the old `'D'` |
| **D-85 · In-season healthy-cut override** (`isHealthyCutRow`, `inSeasonScoring.js:536-540`; verdict `inSeasonRule` of `scripts/games-short-run.mjs` `inSeasonCheck`) | `count(head, 'D')` sorts S+1 cut rows into `healthy` (no `'D'`) vs `missed`; practice-squad weeks put rows in `missed` | low–medium — membership of the two groups changes for cut rows with role weeks; re-run `--games-calibration --short` after the push and confirm the override verdict and both groups' MAE ordering still hold |
| **D-80 · Durability rule constants** — `classifyInjurySeason` trigger (gp < 10 ∧ dnp ≥ 3), ×0.88/×0.78, absence-shape 0.95/0.90/0.97/0.93 and clamp 0.85, dynasty ×0.85/×0.70 | hand-set (no fit artifact), but validated by the boundary-7 graded check on the faulty data | low–medium; the graded check of D-76 itself is Stage A step 3's `--absence` run (pre-rewrite — afterwards `--absence` is vacuous, before = after). A post-push check of the rule constants needs a mode comparing a committed data rev with the working tree; scope that in this item, do not re-run `--absence` as is; **Anton 2026-10-19:** practice-squad history may be a real next-season signal as a role input (Stage A graded check: MAE 4.872 → 4.874 after the fix) — test it as a separate input, not by restoring the old `'D'` |
| **D-81 · Games-calibration candidates** — `backtests/2026-10-08-games-calibration-constants.json`, `2026-10-09-games-cause-constants.json` (report-only, not wired except via L6c) | `projectedGamesFor`, `classifyInjurySeason` (K1) | low; refresh only if D-79 moves |
| **D-82 · In-season k** (`K_ROS_*`, `K_DYN_*`, `inSeasonConstants.js`) | fitted on the boundary-6 model's errors, which include `projectedGames`; CR-25: a bump does not refit | low; fold into the next scheduled k refit, no separate run |
| **D-67 (append)** · DM parity on the short-season rule | the DM-0 fixture is pinned at `4f469cc` (pre-correction), so DM-1 is unaffected; the planned post-boundary-8 fixture rebuild must pin a data rev before boundary 10, or be rebuilt after it | n/a — note only |
| **D-83 · Watch: boundary-10 cross-check** | first capture after the C3 push vs the last before. **Exact** on the season-totals-determined fields — the set of veteran rows whose `projectedGames`, `factors.injurySeasons`, `factors.absenceShapeFactor` or `factors.isBounceBack` change, and their before/after values, must equal the C1 verdict's (rows present in both captures only; Step 6 reads only `careerStats`, which does not change between the two captures). **Report-only** on `projectedPPG`, `projectedTotalPts`, `dynasty.score`/`label`: the captures are a day apart, so live Sleeper/KTC/depth state moves them; report agreement in direction with C1's movers and the count of other movers, with no pass/fail | n/a |
| **D-77 (append)** | 22 of V2.12's 48 negatives are exactly `snaps.games − gamesPlayed` — D-77's cause; ids in the D-76 Stage A report | n/a |
| **D-84 · playerids crosswalk coverage for fringe/UDFA players** (low priority) | players outside the `nflverse/playerids.json` crosswalk have no rosterweekly entry, so their Sleeper `'D'` weeks are never checked and remain (2025: 510 rows / 5,350 `'D'` slots; 322–698 skill slots/season 2021–2025). Only 8 of the 2025 rows are in the projection snapshot, none with KTC | low impact on scores; extend crosswalk coverage for fringe/UDFA players, then re-run the classifier through the normal ingest (completed seasons need another Invariant-1 rewrite) |

Checked and **not** dependent (no item): `ROOKIE_GAMES_*` ladder and `ROOKIE_TOTAL_FACTOR` (outcome is
`gamesPlayed`/points; `dnpWeeks` at `lib/panel.mjs:1975,2228` is a carried, unread field); the Step-4
up-side verdict (`dnpWeeksLastQ ≥ 3` at `lib/panel.mjs:1614` is a report-only sensitivity, not the
decision input); `lib/inSeasonEvidence.mjs` (never reads `'X'`/`'D'`); QB takeover / rookie QB level
(no `dnpWeeks` read).

App-side item (data `.claude/tasks/app-repo-backlog.md`, in C2's data docs commit): **V2.12 scores a row
with no `nflverse/snaps` entry as 0 games** (`scripts/verify/lib/v2GradeInputs.mjs:479`) — 26 of the 48
negatives and ~100–130 positives per season 2021–2025 are reference artifacts; compare those rows as
"no reference" instead.

---

## Cross-repo impact

Both sides edited in this piece of work (parent-folder slice). Entries after the change. CR-28's text
changes in C2; **CR-30 is added only in C3 step 5**, once `scripts/migrate-absence-role.mjs` is on data
`main` (data `test/registry.test.mjs` requires every listed Data file to exist):

```
#### CR-28 · Season-totals absence classification
- **Invariant:** `'D'` only in a played team-week; 2016+, a week the weekly roster lists is `'D'` only if rostered ACT/INA/RES/PUP, else `'X'`.
- **App:** `src/utils/durabilitySignals.js` (`classifyInjurySeason`)
- **Data:** `lib/absence.mjs` (`classifyAbsences`); `lib/durabilityMirror.mjs`
- **Tests:** `test/durability-mirror.test.mjs`; `test/absence.test.mjs`

#### CR-30 · Season-totals cache revision
- **Invariant:** An in-place rewrite of a completed season-totals file ships with a `SEASON_TOTALS_CACHE_REVISION` bump, pushed after its purge verifies.
- **App:** `src/api/sleeperStats.js` (`SEASON_TOTALS_CACHE_REVISION`)
- **Data:** `scripts/migrate-absence-role.mjs` (`migrateAbsenceRole`); `scripts/purge-cdn.mjs` (`purgeAndVerify`)
- **Tests:** `src/api/sleeperStats.test.js`
```

CR-30's Data side names the trigger site (the season-totals migration) as well as the purge, so
`test/registry.test.mjs` reds if the migration's entry point is renamed or removed. The convention for
future rewrites is carried in text the next migration's author reads: the
`scripts/migrate-absence-role.mjs` header, the README `scripts/migrate-*.mjs` list intro, and data
`CLAUDE.md`'s `scripts/migrate-*.mjs` row all say "an in-place rewrite of a completed
`nfl/season-totals` file triggers CR-30 — bump the app's `SEASON_TOTALS_CACHE_REVISION` and push it after
the purge verifies; a new season-totals `migrate-*` adds itself to CR-30's Data field".

`crossRepoIndex.test.js` (app) and `test/registry.test.mjs` (data) must stay green with both entries.
Unchanged but read: CR-02 (dominant-team rule — untouched, rewrite is in place), CR-21/CR-25/CR-26
(in-season lag note, k not refit, frozen-prior gate), CR-29 (manifest transport — the purge step).

---

## Touch list

Data: `lib/absence.mjs`, `lib/io.mjs` (`writeJsonStableAt`), `scripts/update-nfl.mjs` (log line),
`scripts/migrate-absence-roster.mjs` (header line), `scripts/migrate-absence-role.mjs` (new),
`scripts/absence-run.mjs` (two-direction labels), `scripts/capture-snapshot.mjs` (env),
`scripts/absence-role-impact.mjs` (new), `test/io.test.mjs`, `test/absence-run.test.mjs`,
`test/absence.test.mjs`, `test/update-nfl.test.mjs`,
`test/migrate-absence-role.test.mjs` (new), `test/absence-role-impact.test.mjs` (new), `README.md`,
`CLAUDE.md`, `data-catalog.md`, `grading/anchor-policy.md`, `grading/<date>-absence-role-verdict.md`
(new), `verification/<date>-absence-role-diff.{md,json}` and
`verification/<date>-absence-role-rewrite.{md,json}` (new), `.claude/tasks/app-repo-backlog.md`,
`nfl/season-totals/{2017,2018,2020…2025}.json` (Stage B, migration only), `nfl/season-totals/2026.json`
(C3, `update-nfl` only), `manifest.json` (script-written only).

App: `src/utils/cache.js`, `src/utils/cache.test.js`, `src/api/sleeperStats.js`, `src/api/sleeperStats.test.js`,
`src/utils/inSeasonConstants.js`, `src/__tests__/priorModelFrom.test.js`, `src/utils/availabilityGrid.js`
(comment), `src/utils/inSeasonScoring.js` (comment), `docs/cross-repo-registry.md` (CR-28 in C2, CR-30 in C3),
`docs/signal-registry.md`, `docs/projection.md`, `docs/dynasty-scoring.md`, `docs/integrations.md`,
`.claude/tasks/data-repo-backlog.md` (+ `-resolved.md` after C3).

Out of scope: `gamesPlayed` (D-77), any refit (§6), the API-only aggregation's classification, any other
family or file, any workflow run.

---

## Fix pass 1 (Stage A, after implementation-reviewer on `c01cb10`)

Apply in the D-76 worktree (`../sleeper-dashboard-data-d76`, branch `d76-absence-role`) as **one new
commit** on top of `c01cb10`. Tests only, plus one comment line. No change to any guard's logic, the
classifier, the report, or any data file. Do not push or merge.

1. **Guard-before-write test (coverage gap).** In `test/migrate-absence-role.test.mjs` add **MR-6**:
   run `migrateAbsenceRole` in **write mode** and again in **dry-run mode** over the existing injected
   repo, with `deps.classifyAbsences` replaced by a wrapper that calls the real classifier and then
   doctors its result (one changed row's `stats` altered — guard 2). Assert each run throws (guard-2
   message) **and** that the injected `writeJsonStable`, `updateManifestEntry`, `writeJsonStableAt` and
   `writeText` were never called (the throw happened before any write). This must fail if the
   `assertRoleGuards(...)` call at `scripts/migrate-absence-role.mjs:432` is removed or moved after the
   writes at `:434-440` — check that by temporarily moving it, then restore it before committing.
2. **Guard-6 test honesty.** At `test/migrate-absence-role.test.mjs:110-113` the "fixed availability
   subfield changed" case must assert only `/availability is not computeAvailability/` (the check that
   actually fires), and its comment says so. In `scripts/migrate-absence-role.mjs:121-123` add a one-line
   comment above the `AVAILABILITY_FIXED` loop: defence in depth — unreachable while guard 3 holds
   (`firstWeek`/`lastWeek` derive from `'P'` slots, `absenceCause` is constant). No logic change.
3. **IO-1 vacuous check.** In `test/io.test.mjs`, replace
   `assert.equal(fs.existsSync(repoPath('nested')), false, …)` with a check on the path a rebase would
   actually produce: `assert.equal(fs.existsSync(repoPath(abs)), false, …)` for each `abs` written in
   the loop.

Leave alone: the `scripts/update-nfl.mjs:154-157` comment rewrite (accepted: comment-only, accurate —
record it as an accepted deviation in the hand-back); everything else in `c01cb10`.

Done: `npm test` green in the worktree; hand back the new commit SHA, the files touched, and confirm the
MR-6 move-check was done.
