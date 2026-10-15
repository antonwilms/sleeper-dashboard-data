# D-47 — per-week scoring keys in season-totals (W4 step 1)

**Session 1, 2026-10-15 (opus), parent folder.**
- Baselines: app `0f13091`, data `edb0713`. Both are pushed and clean.
- Source: `../future_plans/in-season-notes-plan.md` → "Close-out programme (2026-10-10)", W4 step 1.
  Backlog: `sleeper-dashboard/.claude/tasks/data-repo-backlog.md` D-47 (and D-46, D-45 for §7).
- Origin: `sleeper-dashboard/.claude/tasks/season-rescore.md` §2.2 (the ratio heuristic and its
  measured error) and `weekly-points-display-basis.md` (the half-PPR display and its captions).

**The problem.** The store keeps one number per played week, `weeklyPoints` = Sleeper's `pts_half_ppr`.
Since season-rescore the app scores every season from `stats` × the league's `scoringSettings`, but it
can only *scale* weeks: each week × (rescored season ÷ half-PPR season) (`rescoreSeasonTotals`,
`src/api/sleeperStats.js:311-351`). Measured error against true weekly league scores: median 4.6%,
p90 18.9% (weeks ≥ 5 true points; 2025 weeks 1/5/9/13). The app works around this in two ways:
- the Game log and Distribution display the served half-PPR weeks with a basis caption;
- every SD/mean surface (Market ±SD, Floor-risk tile, Overview) carries a `PROVISIONAL(heuristic)` tag
  naming D-47.

**The fix.** Serve, for each played week, that week's values of the scoring stat keys. The app can
then score every week exactly, through the same seam it uses for seasons.

**Not scoring-affecting.** In the app, `weeklyPoints` feeds only `src/utils/outlookConsistency.js`
(header: "view-only; never feeds projectedPPG, dynasty score, or any factors entry"), `gameLog.js` and
`usePlayerProfile.js:98`. Projection and dynasty score read season PPG; `computeConsistency` in
`regressionSignals.js` takes season PPGs, not weeks. So:
- there is no `PRIOR_MODEL_FROM` bump and no anchor boundary;
- snapshots do not change;
- every data-side fit keeps reading the unchanged half-PPR `weeklyPoints` (`inSeasonEvidence.mjs`,
  `inseason-run.mjs`, `qbTakeover.mjs`, `qbRookieLevel.mjs`, `panel.mjs:173`).

Moving those fits to league basis is D-46 (§7), not this slice. W4's "PRIOR_MODEL_FROM, anchor
boundaries and mirrors" requirement applies to D-46/D-45. This step needs only the CR-02 and CR-14
mirrors.

**The grade still runs before wiring.** The "graded before/after, wired only if it beats the shipped
model" rule is met by §3. The shipped model is the ratio scaling. The new path is exact by
construction wherever the served keys are complete, so the grade mainly tests two things: that the
exclusion list drops nothing a league scores, and that the migration attached the right weeks. It also
re-measures the ratio error on all 14 seasons. Truth comes from the same Sleeper API, so it is not
independent of the source. It is independent of the exclusion list and of the aggregation, and those
are what can be wrong.

---

## 0. Decisions (Anton, 2026-10-15). Do not reopen.

Approved as planned, including D4: the history rewrite is Invariant-1 exception #4.

1. **D1 · New field, `weeklyPoints` untouched.** Add `weeklyStats: { [week]: { [key]: number } }` to
   season-totals rows.
   - `weeklyPoints` stays `pts_half_ppr` and `scoringBasis` stays `'half_ppr'`. This avoids the CR-02
     Mirror trap ("changing the basis `weeklyPoints` is written on — D-47 included — without changing
     `scoringBasis` …"), and every data-side fit keeps its input.
   - Keys are the same week numbers as `weeklyPoints` (strings `"1"`–`"18"`), and only `'P'` weeks.
   - Only non-zero values are stored. A `'P'` week with no non-zero kept key is omitted, which means
     zero points.
   - The field is present on every non-`TEAM_*` row with `gamesPlayed > 0` that passed the guards. It
     is never on `TEAM_*` rows: the app never scores them per week, and they are the largest rows.
     `<abbr>` DEF rows get it (DEF scoring is per game).
   - An absent field means the app falls back to ratio scaling for that row.
2. **D2 · Exclusion list, not allowlist.** This follows CR-02's stance (`lib/sleeper.mjs:179-185`,
   "A DENYLIST, never an allowlist"). The kept keys are every key of the week's `stats` except:
   - F-24's `isPrunedStatKey` (`idp_*`, `punt*`);
   - `RATE_KEYS` (`lib/fantasyPoints.mjs:29`) and any other `*_lng`;
   - Sleeper's own computed points and ranks: `pts_half_ppr`, `pts_ppr`, `pts_std`, `pts_idp`,
     `pos_rank_*`, `fan_pts_allow*`;
   - participation and snap counts: `gp`, `gs`, `gms_active`, `snp`, `*_snp`;
   - `rec_ypt`, a rate.

   The `RATE_KEYS` members are held as a **frozen copy** inside the exact set, not read live from
   `lib/fantasyPoints.mjs`. That way a future CR-14 re-port that grows `RATE_KEYS` cannot silently
   change served bytes, or break the migration's idempotency guard on rows already migrated.

   Null and zero values are dropped. `pts_allow*` and `yds_allow*` are **kept**, because they are DEF
   scoring keys.
   - Measured on 2025 week 5: about 76 KB raw / 13 KB gz per week, so about +1.3 MB raw / +220 KB gz
     per season. Today's 2025 file is 2,072 KB raw / 257 KB gz.
   - The full per-week stats would be about 4× that, and the league's 53 keys alone about ¼. The
     league-only set is rejected: the store stays league-agnostic, and a league that later scores a
     new key would silently fall back.
3. **D3 · No `schemaVersion` bump.** The change is additive and optional per row. Data Invariant 4
   bumps only on an incompatible layout change. `isValidSeasonTotals` (`src/api/dataStore.js:190`)
   only checks for presence, so the app tolerates the field before Stage B.
4. **D4 · History gets it by an Invariant-1 rewrite (#4).** `scripts/migrate-weekly-stats.mjs`
   **re-fetches** 2012–2025 and adds `weeklyStats` **only**.
   - Every other field must be deep-equal, so CR-02's dominant-team risk and CR-28's absence state
     cannot move.
   - A row whose fresh fetch disagrees with the stored row gets no field (§4). It is not "corrected".
   - This is an enrichment, not an error correction, and Invariant 1 names corrections. It is recorded
     as the same kind of named exception as F-24 (#1). **Confirmed by Anton 2026-10-15.**
   - The alternative is forward-only (2026+): no rewrite, but no exact history, so every surface stays
     PROVISIONAL for completed seasons. Not recommended.
5. **D5 · App scoring seam.** Weekly scoring uses `scoreSeasonStats(weekStats, scoringSettings,
   { position, deriveFirstDowns })` (`src/utils/fantasyPoints.js:68`), unchanged. It is valid per week
   for the same reason it is valid per season. `deriveFirstDowns` stays the season-level flag
   `rescoreSeasonTotals` already computes (`seasonEmitsFirstDownBonus` over season `stats`).
   - `src/utils/fantasyPoints.js` is **not edited**, so CR-14's app trigger does not fire.
   - The season `fantasyPoints` is still `scoreSeasonStats(row.stats)`. This keeps the CLAUDE.md
     invariant "Fantasy points: weekly, or one season seam".
6. **D6 · Per-row fallback.** A row uses exact weeks only when |Σ exact weeks − rescored season| ≤
   0.005 × weeks + 0.01. Otherwise it uses ratio scaling, as today. The row records
   `weeklyPointsMethod: 'exact' | 'scaled'`. This catches a missing key without needing a key-list
   contract.
7. **D7 · Display.** Game log and Distribution show exact league weeks with **no** basis caption when
   a season is exact. The half-PPR display and its captions stay only for seasons that fall back.
   Exact rows lose their PROVISIONAL tags; the tags stay on the fallback branch.
8. **D8 · Data-side first-down port lands here.** The grade must score 2012–2021 weeks the way the app
   does, so this slice ports `withFirstDownBonus` / `seasonEmitsFirstDownBonus` / `scoreSeasonStats`
   to `lib/fantasyPoints.mjs`. That is the CR-14 port D-45 lists as its prerequisite, so D-45 inherits
   it.

**Route** (registry route: app applies the edit, data byte-copies):
- **Stage A** — data repo (sonnet), A1–A3. Not pushed.
- Session 1 reads the verdict.
  - `do-not-wire` → stop and report to Anton; nothing is pushed.
  - `wire` → Stage B.
- **Stage B** — app repo (sonnet), B1–B4. Session 1 reviews and **pushes the app**. The app tolerates
  rows without the field.
- **Stage C** — data repo (sonnet), C1–C4: migration write, docs, registry byte copy. Session 1 reviews
  and pushes data. CR-02 stays red between the two pushes, on the same day.

---

## 1. Stage A1 — producer, validator, scoring port (data; one commit)

Commit messages end `(weekly-scoring-keys)`. `npm test` must be green.

1. **`lib/sleeper.mjs`.**
   - Export `WEEKLY_STATS_EXCLUDED_EXACT`, a frozen `Set` of the exact keys in D2: `gp`, `gs`,
     `gms_active`, `snp`, `pts_half_ppr`, `pts_ppr`, `pts_std`, `pts_idp`, `rec_ypt`, plus a
     **literal copy** of today's 29 `RATE_KEYS`.
     - Add a test that the copy ⊇ `RATE_KEYS` at the time of writing.
     - If `RATE_KEYS` later grows, that test fails, and the fix is a deliberate CR-02 change.
   - Export `isWeeklyStatsExcluded(key)`. It is true for `isPrunedStatKey(key)`,
     `key.endsWith('_lng')`,
     `key.endsWith('_snp')`, `key.startsWith('pos_rank_')`, `key.startsWith('fan_pts_allow')`, or
     membership in the exact set.
   - Export `weeklyScoringStats(stats)`. It returns a new object with the kept keys whose value is a
     finite non-zero number.
   - In `aggregateWeeks`'s `gp === 1` branch, for non-`TEAM_*` ids:
     `const ws = weeklyScoringStats(stats); if (Object.keys(ws).length) p.weeklyStats[week] = ws`.
   - Initialise `weeklyStats: {}` on non-`TEAM_*` rows only.
   - In the final loop, `delete p.weeklyStats` when `p.gamesPlayed === 0`, so the field means
     "covered".
   - Update the header doc block (`:210-220`) with the new field and the exclusion rule.
   - The dedup (first-seen) already applies, because the field is built from `uniqueEntries`.
2. **`lib/validate.mjs` `validateNflSeason`.** Add an opt `{ requireWeeklyStats = false }`. In the row
   loop, for non-`TEAM_*` rows:
   - if `weeklyStats` is present, it must be a plain object;
   - each key must be a week whose `weeklyStatus[w-1] === 'P'`;
   - each value must be a plain object of finite, non-zero numbers with no `isWeeklyStatsExcluded` key;
   - when `requireWeeklyStats` is set, every row with `gamesPlayed > 0` must carry the field;
   - a `TEAM_*` row carrying it fails.

   `scripts/update-nfl.mjs` passes `requireWeeklyStats: true`. The migration in Stage C passes `false`,
   because rows that fail the guards legitimately lack the field. The error message shape matches the
   existing `weeklyPoints keys=` throw.
3. **`lib/fantasyPoints.mjs`, the CR-14 port.** Add verbatim ports of the app's `NON_ADDITIVE_KEYS`
   (as an alias: `export const NON_ADDITIVE_KEYS = RATE_KEYS`; the CR-14 Mirror requires the two lists
   to be identical), `seasonEmitsFirstDownBonus`, `withFirstDownBonus` and `scoreSeasonStats`.
   - Each gets a comment naming its app line (`src/utils/fantasyPoints.js:26/37/52/68` @ `0f13091`).
   - `calculateFantasyPoints` is unchanged.
   - `scripts/qb-rookie-level-run.mjs:97-99`'s "this run does not port that" stop stays. Do not
     re-route it in this slice; it is D-45's.
4. **Tests.**
   - `test/sleeper.test.mjs`:
     - (a) a played week carries only kept non-zero keys; each of `pts_half_ppr`, `rec_lng`,
       `pass_rtg`, `off_snp`, `snp`, `gp`, `idp_tkl`, `punts`, `pos_rank_ppr` and `fan_pts_allow_qb` is
       dropped; `pts_allow_14_20` and `bonus_fd_wr` are kept;
     - (b) a `gp 0` week and a bye add nothing;
     - (c) a row with no played weeks has no `weeklyStats`;
     - (d) a `TEAM_*` row never has it;
     - (e) for every kept key, Σ over weeks of `weeklyStats[w][k]` === `stats[k]`;
     - (f) a duplicate entry in a week is ignored (first-seen).
   - `test/validate*.mjs` (use the file `validateNflSeason` tests already live in):
     - one throw per rule in step 2;
     - `requireWeeklyStats` absent → a row without the field passes.
   - New `test/fantasy-points-season.test.mjs`:
     - the ports against hand-computed cases: a 2019-style season (no `bonus_fd_*`) derives
       `bonus_fd_wr` = `pass_fd + rec_fd + rush_fd` for a WR and nothing for a K;
     - a 2023-style row keeps its served `bonus_fd_*`;
     - `NON_ADDITIVE_KEYS` keys are not scored;
     - the alias is the same Set.
   - **Exclusion vs scoring keys.** Copy `scoringSettings` from `snapshots/2026-10-14.json` to
     `test/fixtures/league-scoring-2026-10-14.json`. That file is the newest capture today, so tests must not read
     it directly (Invariant 10); the committed fixture copy is what the test reads. Assert that no key of it is
     `isWeeklyStatsExcluded`. If one is, stop and report.
5. **`scripts/update-nfl.mjs`.** No structural change. The forward write now carries the field, and the
   `nflHash` skip simply sees a changed 2026 file once.

## 2. Stage A2 — the raw-week cache (data; same commit as A3)

Both the grade and the migration must score the **same** fetched bytes. Add an optional `cacheDir` to
`fetchSeasonWeeks`'s opts:
- when set, week *w* of *year* is read from `<cacheDir>/<year>-<w>.json` if that file exists;
- otherwise it is fetched and written there (the raw response array, before normalisation);
- a failed week is never written.

`cacheDir` must resolve outside the repo; throw if it is inside `process.cwd()`. It is the only
non-repo write in this slice. Test both the cache-hit and the inside-repo throw with an injected
`fetchImpl`.

## 3. Stage A3 — the graded before/after (data; `bin/backtest.mjs --weekly-basis`)

`scripts/weekly-basis-run.mjs` (`runWeeklyBasis`), wired as `--weekly-basis` in `bin/backtest.mjs`.
- Flags: `--weeks-cache <dir>` (required), `--json`, `--write`. Add it to the header doc list (`:12-70`).
- It is offline analysis and writes nothing to `nfl/`.
- It is a hand-run script, never a test (it reads current files and the network).

**Inputs.**
- Seasons 2012–2025: the stored `nfl/season-totals/<y>.json` plus the cached weeks.
- `scoringSettings` from `snapshots/2026-10-14.json` (the league basis; the date is pinned in the
  output).
- Position: `raw/-players-nfl.json` `position`, because that is the app's `playersMap` source, else
  `null`.
- `deriveFirstDowns` per season: `!seasonEmitsFirstDownBonus(stored rows)`.

**For every non-`TEAM_*` row and every `'P'` week of the stored file.** "rawWeekStats" is the
**first-seen** entry for that `player_id` in that week, the same dedup `aggregateWeeks` applies
(duplicates were seen in 2015 W1/W14). Export a small `firstSeenEntries(entries)` helper from
`lib/sleeper.mjs` and use it in both `aggregateWeeks` and the grade, so they cannot pick different
duplicates.
- **Truth T** = `scoreSeasonStats(rawWeekStats, ss, { position, deriveFirstDowns })` on the
  fresh week's **full** stats, with nothing excluded.
- **Before B** = the stored `weeklyPoints[w]` × the app ratio `scoreSeasonStats(stored stats) ÷ stored
  fantasyPoints`, rounded to 2 dp, with the app's undefined-ratio rules (`sleeperStats.js:326-330`).
  Port those lines with a comment citing them.
- **After A** = `scoreSeasonStats(weeklyScoringStats(rawWeekStats), …)`, i.e. what the migration
  would serve. Rows the migration guards would reject (§4) are counted under their reason and are not
  scored as A. They score as B, because that is what the app would show.

**Metrics (panel JSON).**
- Absolute error |·−T|: median, p90, p99 and max, for B and for A.
- Relative error on weeks with T ≥ 5: median and p90, for B and A. These compare directly with
  4.6 / 18.9.
- The share of weeks with |A−T| ≤ 0.011.
- All of the above by position (QB/RB/WR/TE/K/DEF/other) and by season.
- Season-sum check: the share of rows with |Σ A − scoreSeasonStats(stored stats)| ≤ 0.005·G + 0.01,
  which is D6's app gate.
- Coverage: rows given `weeklyStats` ÷ played rows, per season.
- Size: added bytes per season, raw and gzip (`zlib.gzipSync` of the minified file with and without
  the field).
- **Report-only:** per (pid, season) with ≥ 8 games, |SD_A − SD_B| of population weekly SD; median and
  p90.

**Decision (pre-registered; write it into the verdict before reading the results).** `wire` iff all of
these hold:
- (a) |A−T| ≤ 0.011 on ≥ 99.9% of weeks, and A's p99 ≤ 0.05;
- (b) B's median relative error ≥ 1%, so there is something to fix;
- (c) coverage ≥ 99.5% in every season;
- (d) the season-sum check passes on ≥ 99.5% of covered rows;
- (e) the added gzip size is ≤ 400 KB in every season.

Otherwise the verdict is `do-not-wire`, naming the failed criterion. If (a) fails, list the top keys
by contributed |A−T|: an excluded key a league scores is the expected cause. Then stop; do not edit
the exclusion list inside this run.

`--write` persists `backtests/2026-10-<dd>-weekly-basis-panel.json` and
`grading/2026-10-<dd>-weekly-basis-verdict.md` (unregistered, the documented Invariant-3 exception).
The verdict states the honest framing from this file's header: T is from the same API, so the grade
tests the exclusion list and the aggregation.

The migration's `--dry-run` (§4) is part of this commit. The grade calls its pure row guard
(`attachWeeklyStats`, exported) so the A population is exactly what C1 will write.

### Stage A hand-back
- SHAs.
- The verdict line and every criterion value.
- The size table.
- The migration dry-run's per-season attached/omitted counts by reason.
- `npm test` counts.
- Every deviation.

---

## 4. The migration — `scripts/migrate-weekly-stats.mjs` (written in A3, run with `--write` in C1)

Header modelled on `scripts/migrate-absence-roster.mjs:1-21`, titled "Invariant-1 rewrite #4". Usage:
`--weeks-cache <dir>` (required), `--dry-run`.

For every completed (`inProgress: false`) season 2012–2025:
1. Fetch the weeks through the cache, then `aggregateWeeks(weekData)` with **no schedule**. Use it
   only as the source of `weeklyStats`; nothing else of the fresh aggregation is written.
2. `attachWeeklyStats(storedRow, freshRow)` (pure, exported). It attaches `freshRow.weeklyStats` iff:
   - the fresh row exists;
   - its `'P'` week set equals the stored `'P'` set;
   - its `weeklyPoints` deep-equal the stored ones;
   - for every key in the union of kept stored-`stats` keys and fresh `weeklyStats` keys, Σ weeks ===
     stored `stats[k]` (|Δ| ≤ 1e-6; an absent stored key means 0).

   Otherwise it returns the row unchanged, with a reason: `missing` / `weeks` / `points` / `sums`.
   `TEAM_*` and `gamesPlayed 0` rows are skipped.
3. **Guards** (each a throw naming the season and id):
   - the id set is unchanged;
   - every field other than `weeklyStats` is deep-equal before/after;
   - omitted ÷ played rows ≤ 0.5% per season;
   - `validateNflSeason(after, { year })` passes;
   - idempotent: a row that already carries `weeklyStats` must re-derive to a deep-equal value.
4. Write with `writeJsonStable(…, { minify: true })`. Then call `updateManifestEntry` with the same
   `recordCount`, `schemaVersion: 4` and `inProgress: false`. `lastModified` moves, so every app
   client re-fetches each season once (`sleeperStats.js:176-180`), and CR-29's R4 guard sees an
   unchanged `recordCount`.
5. Print per season: attached, omitted by reason, and raw/gz bytes before → after.

Tests (`test/migrate-weekly-stats.test.mjs`), on small in-memory fixtures:
- each reason;
- each guard throw;
- idempotence;
- a `TEAM_*` row left untouched.

---

## 5. Stage B — app repo (`sleeper-dashboard`). Four commits

First, `git -C ../sleeper-dashboard-data log -1` must show the Stage A commits (local is fine). Commit
messages end `(weekly-scoring-keys)`. `npm test` must be green.

### B1 — exact weeks in `rescoreSeasonTotals` (`src/api/sleeperStats.js`, tests)

1. Inside the row loop, after `scored`, when `row.weeklyStats` is a plain object and `row.weeklyPoints`
   is a plain object (not an array):
   ```js
   const exact = {}
   let sum = 0
   for (const w of Object.keys(row.weeklyPoints)) {
     exact[w] = scoreSeasonStats(row.weeklyStats[w] ?? {}, scoringSettings, { position, deriveFirstDowns })
     sum += exact[w]
   }
   const n = Object.keys(exact).length
   if (Math.abs(sum - scored) <= 0.005 * n + 0.01) { weeklyPoints = exact; method = 'exact' }
   ```
   Otherwise the existing ratio path runs with `method = 'scaled'`. Rows with `weeklyPoints == null`
   get `method = null`. Add `weeklyPointsMethod: method` to the output row.
2. The pass-through guard (`sourceFantasyPoints`/`sourceWeeklyPoints` already set) is unchanged.
   `sourceWeeklyPoints` is still the served half-PPR series.
3. The comment block (`:300-311`): replace the PROVISIONAL line with
   `// PROVISIONAL(heuristic): weeklyPoints scaled by the season's league/half-PPR ratio — fallback only, for rows without served weeklyStats or failing the season-sum check · per-week scoring keys absent or incomplete for this row · weeklyStats on every played row (D-47)`.
   Add one sentence: "Rows with served `weeklyStats` are scored week by week through the same
   `scoreSeasonStats` seam (D-47) and kept only if they sum to the season within rounding."
4. **Tests**, in `src/api/sleeperStats.test.js`:
   - (a) a WR row with `weeklyStats` in a 2023-style season gets exact weeks equal to hand-computed
     values, with `weeklyPointsMethod 'exact'`;
   - (b) a 2019-style season derives `bonus_fd_*` per week, so the weeks sum to the derived season;
   - (c) a row whose `weeklyStats` omits a scored key fails the sum check and gets ratio weeks,
     `'scaled'`;
   - (d) a row with no `weeklyStats` is unchanged from today (same numbers as the existing ratio
     tests);
   - (e) an array `weeklyPoints` stays on the ratio path;
   - (f) a second pass is a no-op;
   - (g) `fantasyPoints` is identical with and without `weeklyStats`.

   Any existing assertion that moves is a stop-and-report.

### B2 — display and PROVISIONAL tags (`outlookConsistency.js`, `GameLogSection.jsx`, `DistributionSection.jsx`, the four SD call sites)

1. `resolveDisplayWeeklyPoints` (`src/utils/outlookConsistency.js:32`): the first branch is
   `if (seasonData?.weeklyPointsMethod === 'exact') return { weeklyPoints: seasonData.weeklyPoints ?? null, basis: 'league_exact' }`.
   Extend the JSDoc basis union.
2. `GameLogSection.jsx:68-72`: `'league_exact'` → `basisCopy = null`.
3. `DistributionSection.jsx:42-55`: count `'league_exact'` seasons with `'league'` for the mix test.
   - When every season is `'league_exact'`: no copy.
   - When exact seasons are mixed with live-API `'league'` seasons and there is no half-PPR season:
     "Per-game points are league-scored. <live seasons> use the scoring settings in effect when they
     were first loaded." The existing "first loaded" sentence must never cover exact seasons, which
     are scored on read with current settings.
   - When half-PPR is mixed with exact seasons: keep the existing mix sentence.
   - Replace "League scoring isn't available week by week for stored seasons." with "Some stored
     seasons don't carry weekly scoring stats."
   - Update the comment `:16-19`.
4. `extractGamePoints`'s PROVISIONAL (`outlookConsistency.js:19`) and the four call-site tags
   (`PlayerDetailModal.jsx:91`, `PlayerDetailTabs.jsx:89`, `Market.jsx:560`, `Market.jsx:578`): reword
   each to
   `// PROVISIONAL(heuristic): per-game SD/mean over weeklyPoints — exact league weeks where served weeklyStats sum to the season, ratio-scaled otherwise · fallback rows lack per-week scoring keys · weeklyStats on every played row (D-47)`.
   Keep the tags: the fallback branch is still a heuristic at those sites, as CLAUDE.md requires.
5. **Tests.**
   - `outlookConsistency.test.js`: `'league_exact'` resolves to the scored series; the existing
     branches are unchanged.
   - Component tests, if `GameLogSection`/`DistributionSection` already have them (grep `dist-basis`):
     an all-exact season renders no caption; a mixed season renders the new sentence.
6. Paste `grep -rn "PROVISIONAL(" src/ | grep D-47` into the hand-back.
7. **Docs** (Self-maintenance; each sentence becomes false once exact weeks ship):
   - `docs/ui.md:309`: Game log `PTS` is exact league-scored for a store season whose row has
     `weeklyPointsMethod 'exact'`, and served half-PPR otherwise.
   - `docs/ui.md:311`: the Distribution SD equals the Overview ±SD for exact and live-API league rows.
   - `docs/integrations.md:206`: rescored rows carry exact `weeklyPoints` when served `weeklyStats`
     sum to the season, ratio-scaled otherwise, plus `weeklyPointsMethod`.
   - `docs/nav/utils.md:39`: `resolveDisplayWeeklyPoints` gains the `'league_exact'` basis.
   - `docs/navigation.md:67`: the `rescoreSeasonTotals` row names the exact path and
     `weeklyPointsMethod`.
8. **`CLAUDE.md` invariant "Fantasy points: weekly, or one season seam"** (`:103`). After "Score
   per-week stats with `calculateFantasyPoints(weekStats, scoringSettings)`", add: "— except served
   season-totals `weeklyStats`, which `rescoreSeasonTotals` scores through `scoreSeasonStats` with
   the season's `deriveFirstDowns` flag, so 2012–2021 weeks rebuild `bonus_fd_*` like their season
   (D-47)".
   - CLAUDE.md is at 24,891 B and `src/__tests__/claudeMdSize.test.js` enforces its ceiling. If the
     edit breaches it, prune in the same commit by moving detail to the docs the section already
     points at. Never raise the ceiling.

### B3 — registry (`docs/cross-repo-registry.md`, mirrored region only)

"Append" means add the text at the end of the field, after "; " or one space, as in
`rookie-total-wiring.md` A3. Never write the region sentinels.

**CR-02**
- *App side*, append: `since weekly-scoring-keys, \`rescoreSeasonTotals\` also scores served \`weeklyStats\` week by week (D-47) and sets \`weeklyPointsMethod\`, read by \`resolveDisplayWeeklyPoints\``.
- *Data side*, append: `since weekly-scoring-keys \`weeklyScoringStats\`/\`isWeeklyStatsExcluded\`/\`WEEKLY_STATS_EXCLUDED_EXACT\` in \`lib/sleeper.mjs\` (the per-week field), \`scripts/migrate-weekly-stats.mjs\` (Invariant-1 rewrite #4: adds \`weeklyStats\` only to 2012–2025)`.
- *Invariant*, append:
  > **Since weekly-scoring-keys (still v4, no bump)** a non-`TEAM_*` row with `gamesPlayed > 0` may carry
  > `weeklyStats: { [week]: { [key]: number } }` — that `'P'` week's non-zero stat values, every key
  > except `idp_*`/`punt*`, `RATE_KEYS`/`*_lng`, `pts_half_ppr`/`pts_ppr`/`pts_std`/`pts_idp`,
  > `pos_rank_*`, `fan_pts_allow*`, `gp`/`gs`/`gms_active`, `*_snp` and `rec_ypt`; a played week with no
  > such value is omitted; for every kept key the weeks sum to the season `stats` value. `weeklyPoints`
  > stays `pts_half_ppr` and `scoringBasis` stays `'half_ppr'`. Absent field = not covered (the app
  > ratio-scales that row).
- *Mirror*, append:
  > **weekly-scoring-keys (D-47):** the exclusion list is a denylist like F-24 — adding a key to it, or
  > zero-filling or dropping one from `weeklyStats`, silently moves that row's displayed weeks and
  > ±SD back to ratio scaling (the app's season-sum check catches the drop, but nothing fails). A new
  > exclusion must be checked against every key any league's `scoringSettings` can carry. Changing
  > `weeklyPoints`' basis still needs `scoringBasis` in the same change.
- *Triggers*: append `` , `weeklyPointsMethod` / `resolveDisplayWeeklyPoints`'s `'league_exact'` branch `` to the
  app half, and `` , `weeklyScoringStats`/`isWeeklyStatsExcluded` in `lib/sleeper.mjs`,
  `scripts/migrate-weekly-stats.mjs` `` to the data half.

- *App side* and *Triggers* — fix the stale anchors (registry-stale, app plan-reviewer):
  - `isValidSeasonTotals:119` → `:190`;
  - the `entry.schemaVersion` read `:214` → `:215`;
  - `buildSeasonPositionRanks` (`src/utils/seasonRanks.js:20`) → `:17`.

  Each "replace" substring must occur exactly once in its field; assert that first.
- *Data side*, also append (registry-stale, data plan-reviewer — the field's basis is governed here,
  but its readers were unlisted): `; the served-\`weeklyPoints\` (half-PPR) readers \`lib/qbTakeover.mjs\`, \`lib/qbRookieLevel.mjs\`, \`lib/inSeasonEvidence.mjs\`, \`scripts/inseason-run.mjs\` and \`lib/panel.mjs\` (the weekly CV at \`:178\`)`.
  Add the same five files to the data half of *Triggers*.

**CR-04**
- *Data side* and the data half of *Triggers*: append `scripts/migrate-weekly-stats.mjs` (the
  Invariant-1 rewrite #4 registrar: `recordCount` unchanged, `schemaVersion: 4`), next to the
  existing migrate registrars, in their own wording pattern.

**CR-14**
- *App side*, append: `since weekly-scoring-keys \`rescoreSeasonTotals\` also scores served per-week \`weeklyStats\` through \`scoreSeasonStats\`, with the season-level \`deriveFirstDowns\` flag (\`seasonEmitsFirstDownBonus\` over the season's \`stats\`)`.
- *Invariant*, append:
  > **Since weekly-scoring-keys** the same derivation applies per week: a served `weeklyStats` week is
  > scored with `scoreSeasonStats` under the **season's** emission flag, never `calculateFantasyPoints`
  > alone. A data-side consumer scoring those weeks in a custom basis must do the same.
- *Data side*, append: `since weekly-scoring-keys also \`scoreSeasonStats\`, \`withFirstDownBonus\`, \`seasonEmitsFirstDownBonus\` and \`NON_ADDITIVE_KEYS\` (an alias of \`RATE_KEYS\`) in \`lib/fantasyPoints.mjs\` — ports of the app's season scoring, consumed by \`scripts/weekly-basis-run.mjs\` (\`--weekly-basis\`)`.
- *Mirror*, append:
  > **weekly-scoring-keys** ported the first-down derivation and `scoreSeasonStats` to the data side;
  > `scripts/qb-rookie-level-run.mjs` still stops on a non-zero `bonus_fd_qb` (D-45 re-routes it). A
  > change to `scoreSeasonStats`/`withFirstDownBonus` app-side re-ports these.
- *Triggers*: append `` , `scripts/weekly-basis-run.mjs`, `lib/qbRookieLevel.mjs` `` to the data half.
  `lib/qbRookieLevel.mjs` imports `calculateFantasyPoints`/`RATE_KEYS` (`:16`), a pre-existing
  registry-stale gap.

**CR-02 Invariant text above:** it lists `snp` with the other exclusions. Write it as
"`gp`/`gs`/`gms_active`/`snp`, `*_snp`".

**Gates.**
- Claim check, as `rookie-total-wiring.md` A3: run `lib/registry.mjs` `extractSymbolFileClaims` +
  `symbolResolvesIn` from the data repo over the edited region against data HEAD (with Stage A
  committed). Zero unresolved claims.
- `git diff --stat` shows only the registry.
- Record the region md5.

### B4 — backlog (`.claude/tasks/data-repo-backlog.md`)
1. **Do not move D-47 to Done here.** The data SHAs are unpushed, and C1 has not run. Append to D-47
   only: "**In progress (weekly-scoring-keys):** app \`<B1>\` consumes \`weeklyStats\` with ratio
   fallback; data Stage C (history migration) pending."

   Session 1 moves D-47 to Done in a separate app commit **after** the data push, citing data SHAs
   taken from a fresh `git pull --rebase` (CLAUDE.md "Cross-repo commit IDs"):
   `**✅ RESOLVED <date> by weekly-scoring-keys** — data \`<A1>\`/\`<C1>\`: \`weeklyStats\` per played week (denylist), 2012–2025 by Invariant-1 rewrite #4; app \`<B1>\`: exact weeks via \`scoreSeasonStats\`, ratio fallback per row; verdict \`grading/<date>-weekly-basis-verdict.md\`.`
2. D-45: append "The CR-14 first-down port landed in weekly-scoring-keys (`lib/fantasyPoints.mjs`)."
3. `docs/signal-registry.md`: add a row for season-totals `weeklyStats`, shaped like the existing
   season-totals rows. It is a raw source (Sleeper weekly stats), reconstructable (re-fetchable),
   2012+ after the migration, and view-only (displayed weeks and ±SD; no projection input). Match the
   table's column count exactly. This is the data CLAUDE.md Self-maintenance hand-off.

### Stage B hand-back
- SHAs.
- The PROVISIONAL grep.
- The registry md5.
- `npm test` counts.
- Every deviation.

## 6. Session 1 between stages, then Stage C

**Between B and C (Session 1):**
1. Run implementation-reviewer on B1..B4.
2. Smoke-test with the dev server and a local store (`VITE_DATA_STORE_URL` pointed at the working tree,
   Stage A applied to **2025 only** via `--dry-run`-equivalent output in a scratch store):
   - a WR's 2025 Game log has no caption and the weeks sum to the season line;
   - Distribution has no caption;
   - Market ±SD is present.

   If a local store is not practical, say so in the sign-off; do not claim it was checked.
3. `git pull --rebase`, then push the app. If the rebase renamed SHAs, fix B4's citations in the same
   session.

**Stage C — data (sonnet), same day:**
- **C1** — `node scripts/migrate-weekly-stats.mjs --weeks-cache <the A3 dir>`. Use the **same cache**,
  so the bytes are the ones graded. If the cache is gone, re-run A3's grade first and compare its
  verdict. One commit: 14 season files + `manifest.json`. The message names Invariant-1 rewrite #4, the
  verdict file and the per-season attached/omitted counts.
- **C2** — docs:
  - `data-catalog.md` season-totals row: the field, the exclusion rule and the rewrite note, as #3's
    `:38`;
  - README's season-totals section;
  - `CLAUDE.md`:
    - the "`scripts/migrate-*.mjs`" row (`:56`): add `migrate-weekly-stats.mjs`;
    - the Commands table's Backtest row: add `--weekly-basis`.

    The file is at 24,968 B against the 25,000 B ceiling (`test/claudeMdSize.test.mjs`), so prune in
    the same commit, per its Self-maintenance rule. Suggested cut: the `scripts/backtest-run.mjs` row's
    adapter enumeration, which README → Module notes already holds. Never raise the ceiling.
- **C3** — registry byte copy. `REGISTRY_MIRROR=1 node --test test/registry-mirror.test.mjs` must be
  green, the md5 must equal Stage B's, and the diff must touch only `cross-repo-registry.md`.
- **C4** — commit this task file, with the review and fix-pass sections appended.

Done: `npm test` and `npm run smoke` are green. `git pull --rebase` first (the bot commits daily).
Then push. **Straight after the push**, run `node bin/purge-cdn.mjs` on all 14
`nfl/season-totals/<2012–2025>.json` paths, and do not sign off until its verify passes 14/14.

This is required by CR-29. `recordCount` is unchanged, so the app's R4 check cannot catch a stale
pre-migration body served under the new `lastModified`, and completed seasons never move
`lastModified` again. A client that loads inside that window stays on ratio fallback for good.  If
the verify cannot pass, stop and report to Anton; do not sign off.

**After the push (Session 1):**
- Move D-47 to Done in the app backlog (B4.1's deferred step), using the pushed data SHAs.
- Dispatch `nfl-season-totals.yml` once, or wait for the next Fri/Mon/Tue run. 2026 must then carry
  `weeklyStats` with `requireWeeklyStats` passing.
- Open a backlog watch **D-71 · first forward run carries `weeklyStats`**. Grep the highest D-id
  first.

---

## 7. Sketch — how D-46 and D-45 build on this (not planned here)

**D-46 · league-basis CR-15 mirror model** (W4 step 2; scoring-affecting).
- The data-side reconstructions pin `half_ppr`, while the app has scored in league basis since
  season-rescore. This covers the R3-FIT panel, the rookie mirror and the in-season k-fits (CR-25).
- Add a model `league` beside the pinned one (a new model, never an overwrite), with these pieces:
  - Season inputs are scored with D-47's ported `scoreSeasonStats` under the capture's
    `scoringSettings`.
  - `positionBasisScale` is reproduced the way `computeEmpiricalAgeCurves` builds it (median rescored ÷
    served PPG, gp ≥ 10, 30-row floor).
  - `factors.rookieBasisScale` is checked against post-switch captures.
  - The in-season and dynasty k-fits score **weeks** from `weeklyStats` in place of half-PPR
    `weeklyPoints`. This is the part only D-47 makes possible: `inSeasonEvidence.mjs:95-104`,
    `inseason-run.mjs:168/277/482` and `qbRookieLevel.mjs:85` all read per-week points.
- Graded before/after: capture parity under `half_ppr` vs `league` on post-switch snapshots, then the
  k re-fit under league basis against the shipped k. It is wired (re-pin k, bump `PRIOR_MODEL_FROM`,
  anchor boundary) only if the re-fit beats the shipped k on the pinned grading horizon.
- `grading/anchor-policy.md` has no row for the season-rescore switch yet, so D-46 adds it,
  row-detectable through the capture's `projectionBasis`.

**D-45 · custom-basis full-pipeline backtest + rookie-constant refit** (W4 step 3; scoring-affecting).
- It needs D-46's `league` model and D-47's CR-14 port for 2012–2021 outcomes, which is now done.
- Run the full-pipeline backtest in league basis. Refit `ROOKIE_BASELINE_PPG`, `ROOKIE_CEILING` and
  `POSITION_PRIOR_PPG` in basis, re-measure `ROOKIE_CALIBRATION`, and retire `positionBasisScale`.
- Re-route `qb-rookie-level-run.mjs`'s `bonus_fd_qb` stop through the port.
- Each refit is graded against the scale-only shipped composition and wired only where it wins, with
  `PRIOR_MODEL_FROM`, a boundary and the CR-15/CR-25 mirrors.

---

## 8. Cross-repo impact

The full section, with every touched entry's Mirror quoted verbatim, is in
[`weekly-scoring-keys-registry.md`](weekly-scoring-keys-registry.md). It is split out for size.

Entries that fire:
- **CR-02** (edited);
- **CR-14** (edited);
- **CR-04** (edited — the migration writes the manifest);
- **CR-18** (the signal-registry row edit, B4.3);
- **CR-29** (the migration is a new `recordCount` writer, so the post-push purge is mandatory);
- **CR-11, CR-12, CR-13** (the `validateNflSeason` edit; their keys are untouched);
- **CR-25, CR-27** (the `bin/backtest.mjs` dispatch only; a disjoint new mode, so no re-fit or re-pin
  is owed).

CR-15 and CR-28 do not fire beyond the guards described in §4.

---

## Review record (plan gate, 2026-10-15)

plan-reviewer ran twice at full depth: the data-repo definition (12 flags) and the app-repo definition
(6 flags). Session 1 checked every flag against live source and applied all of them:
- **Applied:**
  - `snp` excluded;
  - the `RATE_KEYS` copy frozen inside the exclusion set;
  - first-seen dedup shared by the aggregator and the grade;
  - the Invariant-10 wording fixed;
  - the Distribution mixed exact/live-API case;
  - the stale docs (`ui.md`, `integrations.md`, `nav/utils.md`, `navigation.md`) and the app
    CLAUDE.md "Fantasy points" invariant;
  - CR-14 App side/Invariant for the per-week use;
  - CR-02 stale anchors and the unlisted data-side `weeklyPoints` readers;
  - CR-14's missing `lib/qbRookieLevel.mjs` trigger;
  - CR-04 for the new registrar;
  - the B4 ordering: D-47 moves to Done only after the data push;
  - the mandatory 14-path purge/verify (CR-29).
- **Entries that fire:** CR-04, CR-11/12/13, CR-18, CR-25/27 and CR-29. Their Mirrors are quoted in
  `weekly-scoring-keys-registry.md`, which was split out to keep this file under 40 KB.
- **Unverified by the reviewers:** the `snp` key's presence. Session 1 found no `"snp":` key in 2024;
  it is excluded either way.

---

## Fix pass 1 (Stage A, after implementation-reviewer on `edb0713..bcb5254`)

The reviewer confirmed the verdict is real. It raised three flags. Two are fixed here; the third
(A2's `cacheDir` landed in the A1 commit rather than with A3) is **accepted**, with no action. One
commit, message ending `(weekly-scoring-keys fix pass 1)`. `npm test` and `npm run smoke` must be green.
Do not re-run the grade or the migration, and do not touch `backtests/`, `grading/`, `nfl/` or
`manifest.json`.

1. **Make the migration's structural guards testable**
   (`scripts/migrate-weekly-stats.mjs`, `test/migrate-weekly-stats.test.mjs`).
   - Move the id-set check and the field-equality loop (`:105-115`) into an exported pure function
     `assertStructuralGuards(before, after, { relPath, year })`. It throws with the same message
     shapes as today (`row id set changed`, `field "<k>" changed`) through the same `fail` prefix.
   - `migrateSeasonRows` calls it at the same point. There is no behaviour change.
   - Add three tests that call `assertStructuralGuards` directly with a tampered `after`:
     - (a) an extra id throws `row id set changed`;
     - (b) a missing id throws the same;
     - (c) a changed non-`weeklyStats` field (e.g. `gamesPlayed`) throws `field "gamesPlayed"
       changed`.
   - Add a fourth test: a difference only in `weeklyStats` passes.
2. **Make the exclusion set truly immutable** (`lib/sleeper.mjs`, `test/sleeper.test.mjs`).
   `Object.freeze(new Set(...))` does not stop `.add`/`.delete`.
   - Keep the exported name `WEEKLY_STATS_EXCLUDED_EXACT`, because the B3 registry text names it, but
     make it a **frozen array** of the same keys in the same order: `Object.freeze([...])`.
   - Build a module-private `const EXCLUDED_EXACT_SET = new Set(WEEKLY_STATS_EXCLUDED_EXACT)` and use
     it in `isWeeklyStatsExcluded`.
   - In WS-0:
     - assert `Object.isFrozen(WEEKLY_STATS_EXCLUDED_EXACT)`;
     - assert that a `push` attempt throws in strict mode (test files are ES modules, so they are
       strict);
     - replace `.has(k)` with `.includes(k)` in the ⊇ RATE_KEYS loop.
   - Grep for other `.has(` uses of the export and update them.
3. **Make the grade test fail if A ignored the exclusion list** (`test/weekly-basis-run.test.mjs`).
   Add a case whose scoring settings score an **excluded** key that is present and non-zero in the
   raw week (e.g. `off_snp: 1`). Assert:
   - T includes that key's points;
   - A does not, so A ≠ T for that week, by exactly the excluded key's contribution;
   - the week is not within the 0.011 tolerance.

   This proves A is computed from `weeklyScoringStats`, not from the raw stats.

Hand back: the SHA, the files touched, what each new or changed test asserts, `npm test` counts, and
every deviation.

---

## Fix pass 2 (Stage B, after implementation-reviewer on app `0f13091..c39117f`)

Six flags were raised. Five are fixed here. The sixth (commit messages lack the Mirror text) is
**accepted** with no action: the Mirror text is in the registry region and the companion file, and
Session 1 checks the region md5 at C3.

Scope:
- App repo only, one commit, message ending `(weekly-scoring-keys fix pass 2)`. `npm test` green.
- Do not push and do not touch the data repo.
- Touch only what the five steps below name.

1. **CLAUDE.md "Fantasy points" invariant** (`:103`).
   - Replace `season-level dot-products are valid only because scoring keys are per-game counts (detail: docs/integrations.md)`
     with `season-level dot-products (it, \`getCategoryPoints\`, \`computeTdReliance\`) are valid only because scoring keys are per-game counts`.
     That restores the consumer list the prune dropped and removes the dangling pointer.
   - The file must stay ≤ 25,000 B (`src/__tests__/claudeMdSize.test.js`; today 24,982 B, and this
     adds about 17 B). If it would exceed the ceiling, also shorten the D-47 clause:
     replace `, so 2012–2021 weeks rebuild \`bonus_fd_*\` like their season (D-47)` with
     ` (2012–2021 weeks rebuild \`bonus_fd_*\`; D-47)`.
   - Report the final byte count.
2. **CR-14 Data side wording** (`docs/cross-repo-registry.md`, mirrored region, CR-14 *Data side*).
   - Replace `\`seasonEmitsFirstDownBonus\`, \`NON_ADDITIVE_KEYS\` in \`lib/fantasyPoints.mjs\` (an alias of \`RATE_KEYS\`)`
     with `\`seasonEmitsFirstDownBonus\` and \`NON_ADDITIVE_KEYS\` (an alias of \`RATE_KEYS\`) in \`lib/fantasyPoints.mjs\``,
     which is the task file's §5 B3 text.
   - Assert the old substring occurs exactly once, and keep the edit inside the sentinels.
   - Report the new region md5 (the lines between and including the `<!-- CR-REGISTRY-BEGIN -->` /
     `<!-- CR-REGISTRY-END -->` sentinels, via the `sed -n` span the registry's own manual-diff
     command uses).
3. **Signal registry "Fantasy scoring core" row** (`docs/signal-registry.md:45`).
   - In its reconstructability cell, replace the clause saying `weeklyPoints` is scaled by the season
     ratio, and that Game log/Distribution display `sourceWeeklyPoints`, with this: since D-47,
     `weeklyPoints` are exact league-scored weeks when served `weeklyStats` sum to the season
     (`weeklyPointsMethod 'exact'`, displayed with no caption), and ratio-scaled otherwise, with
     Game log/Distribution showing the served half-PPR `sourceWeeklyPoints` and a basis caption.
   - Keep the column count. Change no other row.
4. **`extractGamePoints` JSDoc** (`src/utils/outlookConsistency.js:12-13`). Replace "the SCALED series
   (league/half-PPR ratio applied)" with "the league-basis series — exact weeks for
   `weeklyPointsMethod 'exact'` rows, ratio-scaled otherwise". The PROVISIONAL line is unchanged.
5. **Tests** (`src/api/sleeperStats.test.js`), two new cases in the D-47 block:
   - (h) A row whose `weeklyPoints` has a played week with **no** `weeklyStats` entry. It scores that
     week 0, still passes the sum check when the season `stats` are the sum of the other weeks, and
     gets `weeklyPointsMethod 'exact'`.
   - (i) The tolerance edge. With n weeks, a season total that differs from Σ exact by just under
     `0.005·n + 0.01` gets `'exact'`, and one just over it gets `'scaled'`. Build this by setting the
     row's `stats` so `scoreSeasonStats(stats)` lands on each side. Use a single scored key with
     multiplier 1 (e.g. `rec: 1`) so the arithmetic is exact.

Hand back:
- the SHA, the files touched and what each new test asserts;
- the CLAUDE.md byte count;
- the new registry md5;
- the `npm test` counts;
- every deviation.

---

## Fix pass 3 (Stage B, Anton-directed: two flags surviving the re-review of `c39117f..a18b921`)

Scope:
- App repo only, one commit, message ending `(weekly-scoring-keys fix pass 3)`. `npm test` green.
- Do not push.
- Touch only the two places below.

1. **Test (h)** (`src/api/sleeperStats.test.js:502-507`). Make the assertion able to fail.
   - Change the row to `weeklyPoints: { 1: 3, 2: 2, 3: 1.5 }, fantasyPoints: 6.5`, keeping
     `stats: { rec: 5 }` and `weeklyStats: { 1: { rec: 3 }, 2: { rec: 2 } }`.
   - Keep both assertions: `weeklyPointsMethod === 'exact'`, and
     `weeklyPoints` `toEqual({ 1: 3, 2: 2, 3: 0 })`.
   - Why: a served non-zero week 3 means the test now fails under ratio scaling (ratio 5/6.5) and also
     if a missing week falls back to the served value (1.5).
   - Add a one-line comment saying so.
2. **`extractGamePoints` JSDoc** (`src/utils/outlookConsistency.js:12-13`).
   - Use the spec text with the dash: "the league-basis series — exact weeks for
     `weeklyPointsMethod 'exact'` rows, ratio-scaled otherwise."
   - Re-wrap the comment block to its surrounding width (about 100 columns). No other wording changes.

Hand back: the SHA, the diff summary and the `npm test` counts.
