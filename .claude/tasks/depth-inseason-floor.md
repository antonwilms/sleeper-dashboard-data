# Depth — in-season row floor for the current season

**Model:** sonnet implements this file exactly. **Status:** planned (opus, 2026-09-28). **Repo:** data only.
**Base:** `eafdfb3` on `main`. **Size:** small: one validator branch plus a shrink guard, one constant, one call site, tests, and four doc edits.
**Plan gate:** plan-reviewer ran 2026-09-28 and raised nine flags. All were verified against source and applied; see the review record at the end.

## Problem (verified against live CI, 2026-09-28)

`nflverse-depth.yml` has failed on all three of its scheduled runs (2026-09-12, 09-19, 09-26). The 09-26 log:

```
[depth] Parsed 1717 skill-position rows for season 2026 (era=ESPN)
[depth] 20 distinct skill-position ids had no crosswalk mapping (join rate 0.9660)
Error: [validate] depth 2026: only 1663 joined skill-position rows — expected ≥ 3500.
```

`validateDepth` (`lib/validate.mjs:980`) applies `MIN_DEPTH_ROWS = 3500` (`lib/nflverse.mjs:133`) to every season. That floor was calibrated only against **completed** seasons (D5, `historical-depth-charts.md`), so the premise in its throw text, "this season is already published", is false for the current season. The dead-man run (`bin/deadman.mjs`, via `cron-deadman.yml`) goes red because of it. Its 2026-09-27 table has `nflverse-depth.yml` as the **only** `failed` row. Every other workflow is `ok`. `nflverse/depth/2026.json` has never been written.

## Measurements (live, 2026-09-28, joined non-null skill rows per week)

| Season | Per-week range | Weeks |
|---|---|---|
| 2013 (legacy, floor) | 423–437 | 18 |
| 2017 (legacy) | 454 (wk1, 30 teams) · 463–483 | 18 |
| 2024 (legacy) | 427–475 | 19 |
| 2025 (ESPN) | 549–617 | 18 |
| 2026 (ESPN, live) | 555 / 558 / 569 | 3 (wk 1–3, all 32 teams) |

The lowest full week ever measured is 423. Half of that is ≈ 211. `3500 / 18 ≈ 194` gives the same number, so this floor keeps `MIN_DEPTH_ROWS`' own ~50% rationale.

## Decision

**A per-week floor for the in-progress season, with the latest week allowed to be partial.**

- New constant in `lib/nflverse.mjs`, placed directly after `MIN_DEPTH_ROWS`: `export const MIN_DEPTH_ROWS_PER_WEEK = 200;`. Its doc comment carries the table above in one or two lines, plus the ~50%-of-423 rationale.
- The in-season floor is `MIN_DEPTH_ROWS_PER_WEEK × max(1, weekCount − 1)`, where `weekCount = Object.keys(weeks).length`.
  - **Why `− 1`:** in the ESPN era a week bucket exists as soon as any team has a chart dated in that week's window (`aggregateDepthEspn`'s max-`dt` reduction). The newest week can hold only a few teams on a Saturday run, and counting it at full weight would throw on correct data.
  - Today: 3 weeks gives a floor of 400 against 1,663 rows, a 4× margin.
  - Mid-season, a fetch that thins rows *inside* weeks still trips the floor. It does **not** catch a fetch that loses whole trailing weeks, because `weekCount` shrinks along with the data. The next bullet covers that case.
- **Week-set shrink guard (review flag 1).** If an existing served current-season file holds more weeks than the fresh derive, throw rather than overwrite. Upstream rebuilds the whole CSV each time, so a REG week never legitimately disappears; fewer weeks than last run means the fetch was truncated. This does not protect the very first write of a season, which is accepted.
- **Why not a flat ~400 (the brief's alternative):** by week 10 a flat 400 would pass a fetch that lost 90% of its rows. The scaled floor costs one line more.
- **Completed seasons are unchanged:** still `MIN_DEPTH_ROWS = 3500`, with the same throw text.
- **The week-1 checks, team count, QB1, era guards, join rate and finiteness are all unchanged.**

## Changes

### 1. `lib/validate.mjs` — `validateDepth`

- Signature becomes `validateDepth(weeks, { year, joinRate, currentSeason, existingWeekCount })`.
- `const inSeason = typeof currentSeason === 'number' && year >= currentSeason;`
  - **Why `currentSeason` omitted means completed:** existing callers and tests that do not pass it keep today's strict behaviour.
- In the row-count block, after `rowCount` is computed:
  - `inSeason`:
    - `weekCount = Object.keys(weeks).length`.
    - **Shrink guard first:** if `typeof existingWeekCount === 'number' && weekCount < existingWeekCount`, throw
      `` `[validate] depth ${year}: only ${weekCount} weeks derived but the served file already holds ${existingWeekCount} — refusing to overwrite (possible truncated fetch).` ``
    - Then `floor = MIN_DEPTH_ROWS_PER_WEEK * Math.max(1, weekCount - 1)`. Throw if `rowCount < floor`, with a **distinct** message:
      `` `[validate] depth ${year}: only ${rowCount} joined skill-position rows across ${weekCount} weeks — in-season floor is ${floor} (${MIN_DEPTH_ROWS_PER_WEEK}/week, latest week may be partial). Possible truncated fetch.` ``
  - Otherwise: the existing `MIN_DEPTH_ROWS` throw, byte-for-byte. `existingWeekCount` is ignored for completed seasons.
- Add `MIN_DEPTH_ROWS_PER_WEEK` to the existing import at `lib/validate.mjs:404`.
- Update the JSDoc:
  - Add `@param {number} [opts.currentSeason]` with one sentence: "omitted ⇒ completed-season floor".
  - Add `@param {number} [opts.existingWeekCount]` with one sentence: "week count of the already-served current-season file; in-season only".
  - Fix the row-floor comment above the block so it no longer claims every season is already published.

### 2. `scripts/update-depth.mjs`

- **In `derive`**, after `weeks` is joined: read the season's own served file **only when `season === currentSeason`**, as `const existingSelf = season === currentSeason ? d.readJson(`nflverse/depth/${season}.json`) : null;`. Return `existingWeekCount: existingSelf?.weeks ? Object.keys(existingSelf.weeks).length : null` on the derived object.
  - This must be a separate read. The spine reads `existing` only *after* `validate` (`lib/seasonIngest.mjs:139`), so the value cannot be shared.
  - Do **not** add `existingWeekCount` to the `envelope`.
- The `validate` callback (line 242) becomes `validateDepth(o.weeks, { year, joinRate: o.joinRate, currentSeason, existingWeekCount: o.existingWeekCount ?? undefined });`. `currentSeason` is already in scope from line 97.
- File doc → "Sparsity" bullet: replace the "every season this family backfills is already complete/published" premise. Completed seasons get `MIN_DEPTH_ROWS`. The current season gets the per-week floor in `validateDepth`. The spine's `minRows: 1` is unchanged.
- File doc → "--force" bullet: add that the current season is overwritten weekly **without** `--force`. The spine's `isPast = season < currentSeason` (`lib/seasonIngest.mjs`) already does this. Verified, and no code change is needed.
- File doc → the "Capture-only … read by no other script" line (`:47`) is stale (review flag 9). `scripts/panel-run.mjs:92` and `scripts/inseason-run.mjs:290` both call `loadDepth`. Reword it to: "Wires no factor. Read offline by `scripts/panel-run.mjs` and `scripts/inseason-run.mjs` (`loadDepth`); neither reads the current season."
- `SPINE_MIN_ROWS` stays at 1. **Do not** touch `lib/seasonIngest.mjs`.

### 3. Tests

**`test/depth.test.mjs`.** Add a small helper next to `fatWeeks` called `nWeeks(n, teams = TEAM32)`. It builds weeks `1..n`, and each team gets the `padPos` shape (13 ids per team, so 416 rows per 32-team week). Then add these tests:

- **a.** In-season partial season passes: `nWeeks(3)` with `{ year: 2026, joinRate: 1, currentSeason: 2026 }` → `doesNotThrow`. The fixture has 1,248 rows against a floor of 400.
- **b.** A thin completed season still throws: the same `nWeeks(3)` object with `{ year: 2025, joinRate: 1, currentSeason: 2026 }` → throws `/expected ≥ 3500/`.
- **c.** Omitting `currentSeason` keeps the completed floor: `nWeeks(3)` with `{ year: 2026, joinRate: 1 }` → throws `/expected ≥ 3500/`.
- **d.** A too-thin in-season file throws: 3 weeks where every team has only `makeWeek1`'s 4 ids (128 rows per week, 384 total, floor 400), with `currentSeason: 2026` and `year: 2026` → throws `/in-season floor is 400/`.
- **e.** A partial latest week is tolerated, and the floor scales. Every call uses `{ year: 2026, joinRate: 1, currentSeason: 2026 }` (review flag 5):
  - `nWeeks(3)` plus a week `4` containing only 2 teams in the `padPos` shape: 1,274 rows against a floor of `200 × 3 = 600` → `doesNotThrow`.
  - **The `− 1` pin:** 3 weeks × 32 teams × **5 ids** per team (`QB:['1'], RB:['2','3'], WR:['4'], TE:['5']`) gives 480 rows. The floor with `− 1` is 400, so it passes. Without the `− 1` the floor would be 600 and it would throw. Assert `doesNotThrow`.
  - **Scaling:** 6 weeks × 32 × 4 ids gives 768 rows against a floor of `200 × 5 = 1000` → throws `/in-season floor is 1000/`.
- **e2. Shrink guard.** `nWeeks(3)` with `{ year: 2026, joinRate: 1, currentSeason: 2026, existingWeekCount: 4 }` → throws `/refusing to overwrite/`. The same call with `existingWeekCount: 3` → `doesNotThrow` (equal is fine). The same call with `year: 2025` (completed) and `existingWeekCount: 4` → throws `/expected ≥ 3500/`, not the shrink message, because the guard is in-season only.

**`test/update-depth.test.mjs`.** Add two tests, modelled on the existing qb1Changed test at `:298`, which uses the `__priorSeasonPath` override:

- **f.** The current season writes without `--force`. Set `fetchCurrentNflSeason: async () => 2016` and run `updateDepth({ year: 2016, deps })` against `makeLegacyCsv(2016, 3)`: 3 weeks × 32 × 4 × 3 = 1,152 rows, which is below 3500 and above 400. The crosswalk comes from `makeCrosswalkIds`, and the prior-season 2015 file carries a `week1Qb1`. `dataPathResult` is an existing 2016 file holding **2 weeks** with different content. That makes the hash differ and keeps the shrink guard from firing. Assert:
  - one `writeJsonStable` call to `nflverse/depth/2016.json`;
  - one `updateManifestEntry` call with `inProgress: false`;
  - no force-gate throw.
- **g.** The same fixture with `fetchCurrentNflSeason: async () => 2017`, so 2016 is a completed season → rejects `/expected ≥ 3500/`. Validate runs before the force gate (spine step 3 vs step 6), so no `force` flag is needed.
- **h.** Shrink guard end-to-end: the fixture from f, but with `dataPathResult` holding **4 weeks** → rejects `/refusing to overwrite/`, and `writeJsonStable` is never called.

**Existing test `update-depth.test.mjs:199`** (ESPN-era schedule fetch, 1 row, year 2025) rejects at the week-1 team-count gate (1 team is below 30), before any row floor. It is unaffected. Leave it alone.

### 4. Docs (Self-maintenance: gate change → catalog row)

- `data-catalog.md` depth "Sparsity gates" row (around `:255`): after the `MIN_DEPTH_ROWS` clause, add the in-season floor, the rule, and the measurement table above in compressed form. Also reword the trailing premise, "every season this family backfills is already complete/published".
- `README.md:1104` gates list: add a sub-bullet for `MIN_DEPTH_ROWS_PER_WEEK`. Also reword the "(… since every season it backfills is already complete/published)" parenthetical at `:1102` in the same way.
- **`CLAUDE.md`: exactly one edit (review flag 4).** The file is at 24,998 of its 25,000-byte ceiling (`test/claudeMdSize.test.mjs`).
  - Invariant 5's third paragraph (`:98`) lists the weekly-mutating `inProgress: false` families as `roster/draft/playerids/advstats/schedule/gamelogs/teamcontext/oline`. That list omits `snaps` and `depth`, and depth is the family this change first makes mutate weekly.
  - Replace the exact substring `**nflverse roster/draft/playerids/advstats/schedule/gamelogs/teamcontext/oline are script-produced` with `**All \`nflverse/\` families are script-produced`. This is a net −52 bytes. It was verified 2026-09-28: every `nflverse/` manifest entry across all ten families registers `inProgress: false`.
  - Make no other `CLAUDE.md` edit. The floors list at `:60` is a pointer, so `MIN_DEPTH_ROWS_PER_WEEK` is not added there.

## Out of scope — do not change (checked; recorded for Anton)

- **`validateSnaps` has the same full-season-only assumption** (`MIN_SNAPS_ROWS = 3000`, no in-season branch). It is not firing. `nflverse-snaps.yml` is yearly (`cron: "5 14 15 2 *"`), it targets the just-completed season, and the dead-man lists it as `ok-bootstrap`. A manual in-season `workflow_dispatch` of snaps would throw the same way. Leave it: snaps is yearly by design.
- **`gamelogs` has the same assumption in a different place, and it fails silently rather than red.** `scripts/update-gamelogs.mjs:143` passes the spine `minRows: MIN_PLAYERGAME_ROWS` (3000), so the current season is **skipped and continued**, not thrown. 2025 measured 292–362 rows per REG week, which means `nflverse/gamelogs/2026.json` will not exist until about week 9. It is absent on `origin/main` today. This is a data-availability question, not a CI one, and it may matter to app consumers. **It is not fixed here.** It is raised to Anton as a separate slice.
- `teamcontext` (60), `oline` (160) and `advstats` (250 players) floors are already one-to-two-week sized. Not affected.
- `lib/seasonIngest.mjs`: untouched. `inProgress: false` is unchanged (Invariant 5).

## Cross-repo impact

- **CR-18** fires on its triggers, because both `scripts/update-depth.mjs` and `data-catalog.md` are listed. Mirror text, verbatim:
  > When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

  **Row edit emitted: none.** No field, stat key or source is added or reclassified. Historical coverage stays "2013–present" (`MIN_DEPTH_SEASON` is untouched). The served shape is identical. The data-side half, the `data-catalog.md` row, is done in §4.
- **CR-04** (manifest fields): does not fire in code. The first real Action run adds the path `nflverse/depth/2026.json`, which is additive. Mirror text, verbatim (first sentence, which is the governing clause here):
  > New families are additive and need no app change (the app already keys by path).

  `inProgress: false` and `schemaVersion: 1` are unchanged.
- **CR-16** (era-remap): its data-side triggers name `validateDepth`'s era-domain guard. **Does not fire.** Only the row-count block changes, and the era guard at `lib/validate.mjs:1006-1018` is untouched.

The registry is stale, noted for Anton but not edited here (review flag 8). CR-04's data side says five families delegate to `runSeasonKeyedIngest`. Live source has seven, since `update-snaps.mjs:120` and `update-depth.mjs:145` also delegate. This is a mirrored region, so the fix goes by the two-session route.

## Verification (Session 2)

1. Run `npm test`, then `npm run smoke`. Both must be green.
2. Run `node bin/update.mjs depth --dry-run` against live upstream. Expect `[depth] Validation passed` and a `[dry-run] would write nflverse/depth/2026.json: ~1663 joined rows …` plan line with **no** "needs --force" suffix. Paste both lines in the hand-back.
3. Commit (message: `depth: in-season per-week row floor for the current season`) and push. **Do not** run a real (non-dry-run) ingest locally. The weekly Action writes the file.
4. Hand-back: the SHA, every file touched, deviations, what each new test asserts, and the dry-run lines.
5. **After Anton's OK only:** `gh workflow run nflverse-depth.yml`. Otherwise the next scheduled run is Sat 2026-10-03 14:50 UTC, and the dead-man clears on its first run after a green depth run.

## Review record (plan-reviewer, 2026-09-28)

Opus made each call after checking the flag against live source.

| # | Flag | Decision |
|---|---|---|
| 1 | The scaled floor misses a fetch truncated by whole trailing weeks, because `weekCount` shrinks with the data | **Applied.** Added an in-season week-set shrink guard against the served file (§1, §2, tests e2/h). I chose this over deriving expected weeks from the gameday index: that index exists only for the ESPN era and would add a second calendar source. |
| 2 | CR-16 names `validateDepth` | **Applied.** Listed CR-16 as not firing, with the reason. |
| 3 | CR-18/CR-04 Mirror text not quoted | **Applied.** |
| 4 | Invariant 5's `inProgress: false` family list omits depth and snaps | **Applied.** One byte-negative `CLAUDE.md` edit, "All `nflverse/` families". Verified that all ten families' manifest entries are `false`. |
| 5 | Test e is under-pinned; nothing tests the `− 1` | **Applied.** Args and regexes are pinned, and a 5-ids-per-team fixture (480 rows, between 400 and 600) now pins the `− 1`. |
| 6 | `currentSeason` anchor was :104 but is :97 | **Fixed.** |
| 7 | Test :199 rejects at the team-count gate, and `force: true` in test g does nothing | **Fixed** the wording and dropped `force` from test g. |
| 8 | CR-04's data side undercounts `runSeasonKeyedIngest` callers (5 vs 7) | **Not applied here.** It is a mirrored region, so it goes by the two-session route and is noted for Anton. |
| 9 | The "Capture-only … read by no other script" doc line is stale | **Applied** in the §2 doc edit. |
