# Absence classification — Stage B: graded before/after check (L5)

Session 1 (opus, parent-folder session), 2026-10-05. Stage B of three; read
`absence-classification-a.md` §0 first, because D1–D5 are fixed there. Planned against data `4f469cc` +
Stage A (verified before this stage starts) and app `d627562`. Sonnet implements. **Offline analysis
only:**
- no served file changes;
- no manifest entry;
- `nfl/season-totals/` is untouched;
- the app is untouched.

The output is a verdict that **Anton reads before Stage C may start**.

## 0. What moves when `'D'` gains weeks, and therefore what to grade

Session 1 read the app (`d627562`) for every reader of `dnpWeeks`/`availability`/`weeklyStatus` on
the scoring side. **Points per game are not computed from them.** Four mechanisms move, plus the
display surfaces they feed (the note below the table):

| # | App site | What it reads | Output it moves |
|---|---|---|---|
| M1 | `src/utils/durabilitySignals.js` `classifyInjurySeason` (`gp < 10 && dnpWeeks >= 3`, plus contributor evidence in this season or ±1) → `seasonProjection.js:886-890` `injurySeasons` (≥3 → `avgGames × 0.78`, ≥2 → `× 0.88`) | `dnpWeeks` | `projectedGames`, `projectedTotalPts`, `factors.durabilityFactor`/`injurySeasons`, the "Injury history ↓" line |
| M2 | `seasonProjection.js:893-921` absence shape (≥2 segments of length ≥2 in a season → recurring; `gp >= 10 && longestAbsence >= 4` → hidden; multipliers 0.90/0.95, 0.93/0.97, clamp [0.85, 1]) | `availability.absenceSegments`/`longestAbsence` | `projectedGames`, `projectedTotalPts`, `factors.absenceShapeFactor` |
| M3 | `projectionSignals.js` `computeBounceBackFlag` branch (b) — a sub-8-GP prior season counts as "down" only if `classifyInjurySeason` → `seasonProjection.js:794` `bounceBackFactor` 1.05 | `dnpWeeks` (via M1's predicate) | **`projectedPPG`** (×1.05) for the few rows that flip |
| M4 | `dynastyScore.js:930-940` `injurySeasonCount` (≥3 → ×0.70, ≥2 → ×0.85 of the durability base) → reliability (weight 0.10) | `dnpWeeks` (via M1) | dynasty score |

**Display surfaces fed by M1/M3/M4** (plan gate, app review):
- the dynasty label `'Bounce-back'` (`dynastyScore.js:1037,1055`, via `computeBounceBackFlag`);
- the "↩ Bounce-back" badge (`dynastySignalBadges.js:25-31`);
- the "⚠ Injury risk" badge (`dynastySignalBadges.js:57-63`, `injurySeasonCount >= 2`);
- the adjustmentSummary lines "Injury history ↓" (`seasonProjection.js:1033`) and "Bounced back
  from lost season ↑" (`:1045`).

They are counted in §4's descriptive section.

`projectedGames` = `round(clamp(avgGames, 8, 17))`, where `avgGames` is the Step 1 recency-weighted
games of the last ≤3 qualifying seasons (`gamesPlayed >= 8`), with weights `[0.2, 0.3, 0.5]` /
`[0.3, 0.7]` / `[1]` (`seasonProjection.js:686-693, 879-923`). It feeds only the veteran path; the
rookie path's games ladder reads no absence field.

**Graded question (primary):** do M1+M2, computed on the corrected `'D'`, predict next season's games
played better or worse than on today's `'D'`? **Secondary, descriptive only:**
- how many M3 bounce-back flags flip, and the outcome of those few;
- how many players' M4 `injurySeasonCount` changes;
- the 2026 impact table: today's veterans, current data vs corrected.

## 1. Findings against live source

1. **Snapshot parity target.** `snapshots/2026-10-04.json` has 738 rows: 306 `confidence:
   'rookie'` and 432 veteran. Veteran rows carry `projection.projectedGames` and
   `projection.factors.{injurySeasons, absenceShapeFactor, durabilityFactor, isBounceBack}`. Rows
   carry **no** position or `yearsExp`.
   - Position comes from `nflverse/playerids.json` `.ids[*].{sleeperId, position}`, as
     `scripts/qb-rookie-level-run.mjs` `positionOfFrom` does.
   - That capture's careerStats (2012–2025, data-store provenance per `inputStatus.careerStats`)
     equal the committed season-totals files, which no commit since has changed (check:
     `git log --oneline 4f469cc -- nfl/season-totals/` shows nothing newer than the 2026 file's own
     in-season commits).
2. **Contributor-evidence constants** (`durabilitySignals.js:19-28`):
   - `SNAP_CONTRIB_FLOOR = 0.40` (`off_snp / tm_off_snp`);
   - `MIN_STARTS = 4`;
   - `START_RATE_FLOOR = 0.50`;
   - `VOLUME_FLOOR = { QB: 15, RB: 8, WR: 4, TE: 3 }` over `VOLUME_KEY` `pass_att`/`rush_att`/`rec_tgt`/`rec_tgt`;
   - priority snap share → starts → volume. **Any one passing signal suffices:** each tier is
     `if (x != null && x >= FLOOR) return true` (`:70-79`), so a snap share **below** the floor
     falls through to starts, then to volume.
   - The file's own header comment (`:52-53`, "falls through … when a higher-priority signal is
     ABSENT, not when it is merely below floor") contradicts the code. **The mirror follows the
     code,** and `docs/dynasty-scoring.md:134` ("any one") agrees with it.
3. **Reusable statistics.** `lib/inSeasonEvidence.mjs` exports `clusteredBootstrap` and
   `bootstrapPairedMean`, with `IN_SEASON_DEFAULTS.bootstrap` (4000 resamples, seed 12345). Loaders
   follow `scripts/inseason-run.mjs`'s `INSEASON_LOAD`. Read both; reuse them, do not re-implement.
4. **Bounce-back reads PPG,** which in the app is league-rescored `fantasyPoints`. The data repo has
   no season rescore mirror, so M3 is computed on served half-PPR `fantasyPoints`. It is therefore
   descriptive, and its parity with the snapshot is **reported, not asserted** (§3).

## 2. `lib/durabilityMirror.mjs` (new, pure)

Header: "Mirror of the app's veteran projected-games rule (`src/utils/durabilitySignals.js`,
`src/utils/seasonProjection.js` Step 1 qualifying/weights and Step 6), the bounce-back predicate
(`src/utils/projectionSignals.js` `computeBounceBackFlag`) and the dynasty durability base
(`src/utils/dynastyScore.js:916-940`), for offline grading only. Mirrored at app `d627562` —
CR-28." The exports:

```js
export const DURABILITY_CONSTANTS = { SNAP_CONTRIB_FLOOR: 0.40, MIN_STARTS: 4, START_RATE_FLOOR: 0.50,
  VOLUME_FLOOR: { QB: 15, RB: 8, WR: 4, TE: 3 }, VOLUME_KEY: { QB: 'pass_att', RB: 'rush_att', WR: 'rec_tgt', TE: 'rec_tgt' } };
export function wasContributorSeason(seasonData, position) { … }          // durabilitySignals.js:63-82
export function classifyInjurySeason(careerStats, playerId, position, season) { … }  // :93-104
export function qualifyingSeasons(careerStats, playerId, { throughSeason }) { … }    // gp >= 8, finite fantasyPoints, seasons <= throughSeason
export function projectedGamesFor(careerStats, playerId, position, { throughSeason }) { … }
  // → { projectedGames, injurySeasons, absenceShapeFactor, avgGamesBase } or null when no qualifying season
export function bounceBackFlag(careerStats, playerId, position, { throughSeason }) { … }  // projectionSignals.js computeBounceBackFlag, PPG = fantasyPoints / gamesPlayed
export function dynastyInjurySeasonCount(careerStats, playerId, position, { throughSeason }) { … } // dynastyScore.js:934-936
```

Read the app source at the pin with `git -C ../sleeper-dashboard show d627562:<path>` (never the
working tree). Translate each function line for line from the app source at `d627562`, keeping the app's names in
comments with the `file:line` they mirror. `throughSeason` restricts every read to seasons
`<= throughSeason`, **including** the ±1 adjacent-season reads in `classifyInjurySeason`. As-of-S+1
the app has no S+1 row, so `careerStats[S+1]` must read as absent. Implement this by passing a
season-filtered view, not by special-casing inside the predicate.

## 3. Parity gate — `test/durability-mirror.test.mjs`

- **DM-0 fixture (committed in this stage).** `test/fixtures/durability-parity-2026-10-04.json` holds
  the **pre-correction** inputs DM-1 needs, so DM-1 stays valid after Stage C rewrites the served
  files (the `test/fixtures/r3fit-parity-2025` precedent):
  - for every veteran snapshot row's player and every season 2012–2025 he has a row in, read from
    the committed files at `4f469cc` via `git show 4f469cc:nfl/season-totals/<y>.json`;
  - the fields kept are `gamesPlayed`, `gamesStarted`, `fantasyPoints`, `dnpWeeks`, `availability`
    and `stats.{off_snp, tm_off_snp, pass_att, rush_att, rec_tgt}`;
  - also the snapshot's `{ id: { projectedGames, injurySeasons, absenceShapeFactor, isBounceBack } }`,
    and positions from `playerids.json` `.ids`;
  - written minified by a committed builder, `test/fixtures/build-durability-parity.mjs` (`git show`
    reads only), which records the source rev in the fixture.
- **DM-1 (asserted).** Load the DM-0 fixture: never the live `nfl/season-totals/`, which Stage C
  rewrites. For each veteran snapshot row whose position ∈
  {QB, RB, WR, TE}, compute `projectedGamesFor(…, { throughSeason: 2025 })`. Compare with
  `projection.projectedGames`, `factors.injurySeasons` and `factors.absenceShapeFactor` (3 dp).
  - **Assert ≥ 99% of rows match all three exactly.** Print every mismatch: id, mirror vs snapshot.
  - **Stop condition:** below 99%, Session 2 stops and reports. It does not tune the mirror to the
    snapshot.
  - Rows with no qualifying season in the mirror (the app routed them by `yearsExp`) are counted
    and reported, not failed.
- **DM-2 (reported, not asserted).** For the same rows, compare `bounceBackFlag` with
  `factors.isBounceBack`; log the agreement rate (§1.4).
- **DM-3 unit.**
  - `wasContributorSeason` fall-through, matching the code (§1.2):
    - snap share present but below the floor, with ≥4 starts → **true**;
    - below-floor snap share, no starts, volume above the floor → **true**;
    - all three below or absent → **false**.
  - `classifyInjurySeason` adjacent rescue respects `throughSeason`.

## 4. Harness — `bin/backtest.mjs --absence`, `scripts/absence-run.mjs`

Follows `--qb-rookie-level`'s shape: rejects any flag other than `--json`/`--write`; `--write`
persists `backtests/<date>-absence-panel.json` and `grading/<date>-absence-verdict.md`.

**Inputs.**
- Committed season-totals 2012–2025 ("before").
- "After" = each season passed through Stage A's `classifyAbsences(totals, rosterweekly[y].players)`
  in memory. Reads `nflverse/rosterweekly/<y>.json`; a missing year throws.
- `playerids.json`: position from `.ids`, `draftYear` from `.bySleeper`.

**Panel.** For predictor season S = 2015 … 2024 and outcome season S+1:
- The population is QB/RB/WR/TE players with ≥1 qualifying season ≤ S under **both** versions, and
  who are veterans at S+1. A veteran means rookie year ≤ S−1, where rookie year is `draftYear` when
  present, else the first season with a season-totals row for the player.
- The prediction is `projectedGamesFor(version, id, pos, { throughSeason: S })` for each version.
- The outcome is S+1 `gamesPlayed` from the committed file (identical under both versions; D3).
- A player with **no** S+1 season-totals row is included with outcome 0 only when
  `rosterweekly[S+1]` lists him in ≥1 REG week with a status in `MISSED_ROSTER_STATUSES` (on a team
  all year, never played). Otherwise he is excluded. Count both groups.

**Metrics (before vs after):**
- MAE and mean signed error, over all rows, by position and by predictor-season bucket (2015, 2016–2020,
  2021–2024).
- The same over the **changed rows** only (the prediction differs between versions).
- ΔMAE = after − before with a player-clustered paired bootstrap 95% CI (`bootstrapPairedMean`,
  defaults).
- Spearman ρ of prediction vs outcome, both versions.

**Descriptive:**
- M1: distribution of `injurySeasons` (0/1/2/≥3) per version.
- M2: count of rows whose `absenceShapeFactor` changes.
- M3: count of bounce-back flips (on → off, off → on) per version and the S+1/S PPG ratio of the
  flipped rows (n is small; no CI).
- M4: count of players whose `dynastyInjurySeasonCount` (throughSeason 2025) changes, and the
  0/1/2/≥3 transition matrix. The ≥2 crossings are the "⚠ Injury risk" badge flips: count them,
  with names among today's veterans.
- **Per-season correction totals over all rows** (every position, not just the panel):
  `changedSlots`/`changedRows`/`byStatus` for each season 2012–2025. These go in the panel JSON and
  in verdict §1, because Stage C §2.3 step 2 checks the migration dry-run against them.
  - Expected, from Session 1 and the plan gate's measurements: 0 for 2012–2015 (floor, D4), then
    1,900 · 1,702 · 1,749 · 1,888 · 2,457 · 1,928 · 2,715 · 2,622 · 2,593 · 2,571 for 2016–2025.
  - Report the harness's own numbers, not these.

**2026 impact table** (throughSeason 2025, today's veterans, i.e. snapshot veteran rows):
- count of changed `projectedGames`;
- mean change;
- the largest 15 movers by |Δ games| (Sleeper name from `raw/-players-nfl.json`, position, before →
  after, `injurySeasons` before → after);
- the M3 flips among today's veterans, by name.

**Verdict file sections:**
1. What was compared.
2. Parity (DM-1 rate, DM-2 rate).
3. Primary result (table + ΔMAE CI).
4. Descriptive M1–M4.
5. 2026 impact.
6. Era note. Existing `'D'` already tripled from 2021 (Sleeper began returning inactives with
   `gp 0`). The correction adds 2016–2020 reserve weeks and 2021+ inactive weeks, and leaves
   2012–2015 near-unchanged (D4).
7. **Recommendation:** one of the three outcomes below.

**Recommendation outcomes:**
- **(a) ship.** ΔMAE CI upper bound ≤ 0, or the CI spans 0. The corrected data does not predict games
  worse; Stage C proceeds as planned.
- **(b) ship the data, re-tune separately.** The CI lies entirely above 0, i.e. the old thresholds
  (`dnp ≥ 3`, ×0.88/×0.78) were tuned on the undercount and penalise more now. Stage C still corrects
  the data, because the stored value is wrong regardless. A follow-up slice re-fits M1/M2's
  thresholds as a CR-15-style app change. The verdict quantifies how much worse.
- **(c) stop.** Parity < 99%, or the panel shows a defect: report it, no recommendation.

The harness computes and prints which of (a)/(b)/(c) the numbers meet. **The choice is Anton's.**

## 5. Tests — `test/absence-run.test.mjs`

- **AR-1:** a tiny synthetic 3-season store with an injected loader. One player gains 2 `'D'` via
  `classifyAbsences` in S, crossing `dnp ≥ 3` with `gp < 10` and with contributor evidence. Assert
  his `injurySeasons` before = 0, after = 1, and that `projectedGames` changes only if a second
  injury season exists (≥2 rule): build both cases.
- **AR-2:** the outcome-0 inclusion rule (on a reserve list in S+1, no row → included at 0; no
  roster row → excluded).
- **AR-3:** the CLI rejects an unknown flag. `--write` writes both artifacts at the dated paths
  (tmp repo root, the existing harness test pattern).

## 6. Touch list, done-definition, commit

Touch list: `lib/durabilityMirror.mjs` (new), `scripts/absence-run.mjs` (new), `test/fixtures/durability-parity-2026-10-04.json` + `test/fixtures/build-durability-parity.mjs` (new, DM-0), `bin/backtest.mjs`
(dispatch + help), `package.json` (`backtest:absence` script), the two new test files, `README.md`
(Module notes: `lib/durabilityMirror.mjs` as an offline mirror, CR-28), `CLAUDE.md` (Commands table
Backtest row: add `--absence`; the `lib/backtest.mjs` row: name `lib/durabilityMirror.mjs` as
`--absence`'s mirror; keep ≤ 25,000 bytes, pruning as Stage A did), the run's two artifacts, and this
task file.

**Not touched:** `nfl/`, `manifest.json`, `lib/absence.mjs` (Stage A's; read only),
`cross-repo-registry.md`, the app repo.

Done-definition:
- `npm test` green, with DM-1 ≥ 99%;
- `npm run smoke` green;
- `node bin/backtest.mjs --absence --write` run, and both artifacts committed.

Commits:
1. `Absence graded check: durability mirror + --absence harness (L5 Stage B)`.
2. `grading: absence verdict <date>`.

Push after Session 1 verification. Hand back the verdict's §3 table and §7 recommendation verbatim.

## Cross-repo impact (Stage B)

- **If Anton picks (c),** Stage C does not run, and `lib/durabilityMirror.mjs` would sit pushed with
  no registry entry. In that case the follow-up is Session 1's call before anything else lands:
  either remove the mirror and the harness, or land CR-28 on its own.

- No served contract changes.
- `lib/durabilityMirror.mjs` is a new data-side mirror of app source. Its registry home is the new
  CR-28, drafted in Stage C (the coupling's other half lands there). Until Stage C, a change to the
  four app sites in §0 silently stales the mirror. Stage C's registry entry lists them as app-side
  triggers.
- No CR-15 change: `lib/projectionFactors.mjs` is not touched, and the R3-FIT path does not read
  this mirror.
