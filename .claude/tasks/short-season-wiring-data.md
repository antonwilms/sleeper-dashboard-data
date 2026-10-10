# Short-season games rule — wiring, data side (Stages A and C)

Session 1 (opus), 2026-10-10. This is the data half of the L6 wiring.

**The design, decisions and in-season check numbers live in the app task file,** `../sleeper-dashboard/.claude/tasks/short-season-wiring.md`. Read its §0 first. This file holds only the data-repo work.

Planned on data `98f07e6` and app `ac26e0b`.

**Order:**
1. **A** (this repo) → push.
2. **B** (app) → push.
3. **C** (this repo), **the same day as B**, because the daily CR-24 mirror run is red from B's push until C lands.

## Stage A — re-mirror and the committed in-season check

### A.1 `lib/durabilityMirror.mjs` — `rule: 'l6c'`

**Add, with a header note:** "short-season rule mirrored from app short-season-wiring (Stage B); the app SHA is filled in by Stage C".

```js
/** L6c SOf0 full-sample k (backtests/2026-10-10-games-short-constants.json @ 4fa7689), resolved
 *  cells['pos|s'][`${pos}|${state}`] ?? cells.pos[pos]. The app pins the same table (src/utils/shortSeasonConstants.js). */
export const SHORT_SEASON_K = Object.freeze({
  short: Object.freeze({ QB: 0.50, RB: 0.51, WR: 0.52, TE: 0.53 }),
  none:  Object.freeze({ QB: 0.50, RB: 0.50, WR: 0.50, TE: 0.55 }),
});
```

**Change `projectedGamesFor(careerStats, playerId, position, { throughSeason, rule = 'pre-l6c' })`:**
- Throw on any `rule` other than `'pre-l6c'` or `'l6c'`.
- Under `'pre-l6c'` (the default), the output is **byte-identical to today**: no new fields are returned. Every existing harness (`--absence`, `--games-calibration`, `--cause`, `--short`) relies on it.
- Under `'l6c'`, compute `projectedGamesBase` = today's `projectedGames`, then the state, **verbatim** (app §2.2's expression):

  ```js
  const lastRows = careerStats?.[throughSeason];   // the same object seasonView exposes
  const shortSeasonState = (lastRows && typeof lastRows === 'object' && Object.keys(lastRows).length > 0)
    ? (!lastRows[playerId] ? 'none' : (lastRows[playerId].gamesPlayed ?? 0) >= 8 ? 'qual' : 'short')
    : null;
  ```

  This equals the L6c panel's `sState` (`enrichRow`, `causeVeterans`). The plan gate checked it on the 2026-10-07 veterans: 0 mismatches (qual 339 / short 96 / none 2).
- `shortSeasonK` = `SHORT_SEASON_K[state]?.[position] ?? null` for `short`/`none`, else `null`.
- `projectedGames` = `shortSeasonK != null ? Math.round(clamp(avgGames * shortSeasonK, 0, 17)) : projectedGamesBase`.
- Return today's fields plus `shortSeasonState`, `shortSeasonK` and `projectedGamesBase`.

This is the exact expression of app §2.2, including the D2 guard.

**Tests, appended to `test/durability-mirror.test.mjs`:**
- **DM-5:**
  - `SHORT_SEASON_K` equals the derivation rule over `backtests/2026-10-10-games-short-constants.json` `candidates.SOf0.k`, read with `fs`;
  - an unknown `rule` throws;
  - `'pre-l6c'` output has no `shortSeason*` keys, and on every DM-1 fixture row it is deep-equal to a call without `rule`.
- **DM-6 (`'l6c'` units):**
  - a qualifying last season gives `projectedGames === projectedGamesBase`;
  - a gp-4 WR gives `round(clamp(avgGames × 0.52, 0, 17))`, and floor 0 holds below 8;
  - a missing row for a TE gives k 0.55 and state `'none'`;
  - `throughSeason` absent from careerStats, or `careerStats[throughSeason] = {}`, gives state `null` and no change (the app's non-empty guard).

### A.2 `scripts/games-short-run.mjs` — the in-season override check (pre-registered)

**Add a step, after impact:** `inSeasonCheck(fit.oos, c.store)`.
- **Rows:** the non-qualifying out-of-sample rows.
- **Per row,** `ws = store[S + 1]?.[id]?.weeklyStatus`. Count rows whose `ws` is not an array (no S+1 row, or no `weeklyStatus`) as `noRow` and skip them. The expected count is `noRow` = 31.
- Slot i is week i+1, written as `weeklyStatus[week - 1]` (`lib/sleeper.mjs:307`). Every season has length 18; a 17-week season's slot 17 is `'X'`.
- **At each checkpoint w ∈ `[1, 2, 4, 6, 8, 10, 12]`:**
  - `n` = `'P'` count in `ws.slice(0, w)`;
  - `d` = `'D'` count in the same slots;
  - `rem` = `'P'` count in `ws.slice(w)`.
- **Groups:**
  - `healthy` (`d === 0 && n >= 1`, the app's exact test);
  - `missed` (`d >= 1 && n >= 1`);
  - `notPlayed` (`n === 0`);
  - `healthyStar` (`healthy ∧ star`).
- **Per group,** report n, mean `rem`, and MAE and bias for:
  - `cut` = `max(0, p.SOf0 − n) − rem`;
  - `base` = `max(0, p.C0 − n) − rem`.
- **Decision (pre-registered)** — `inSeasonRule`:
  - A checkpoint is evaluable for a group when that group's n ≥ 30.
  - `'override'` iff all three hold:
    - healthy is evaluable at ≥ 4 checkpoints;
    - at every evaluable healthy checkpoint, `healthy.base.mae < healthy.cut.mae`;
    - at every evaluable missed checkpoint, `missed.cut.mae < missed.base.mae`.
  - Otherwise `'preseason-only'`.
  - An empty or thin group is skipped, never compared as null.
- Put it in the result as `inSeasonCheck: { checkpoints, groups, noRow, inSeasonRule }`.
- **Verdict:** add a new **`## 8. In-season override check`**; the live file ends at `## 8. Limits`, which becomes `## 9. Limits`. It has one table per group (rows w; columns n, actual remaining, cut MAE/bias, base MAE/bias) and the decision line. Add one Limits bullet: "'D' reaches the live file one season-totals run after the games (CR-28), so the app's healthy test lags by up to one run".

**Expected** (Session 1 probe, which the app task §0 D3 tables): `'override'`, with the healthy/missed MAEs as tabled there. **If any tabled number differs by more than 0.05, or the rule comes out `'preseason-only'`: stop and report. Do not adjust.**

**Tests (append to `test/games-calibration.test.mjs`):**
- **GCS-7:** a unit fixture for `inSeasonCheck` (export it):
  - a healthy row, a missed row and a not-played row with hand-computed `rem`/`n`;
  - the decision is `'override'` on a fixture built for it, and `'preseason-only'` when the missed-group condition flips;
  - a `missed.n < 30` checkpoint is ignored.
- **GCS-5:** add an assertion that `r.inSeasonCheck.inSeasonRule` is one of the two values.

### A.3 Done-definition (Stage A)

1. **Before any edit**, capture `--games-calibration --json`, `--cause --json`, `--cause` (markdown), `--short --json` and `--absence --json` into `$TMPDIR/*-before.*`.
2. `npm test` and `npm run smoke` must be green.
3. **Regression after the edits:**
   - the first three outputs, normalised as in L6c done-step 3, must be identical;
   - `--short --json` may differ **only** by the new `inSeasonCheck` key. Prove it with `jq -S 'del(.inSeasonCheck,.meta.generatedAt,.meta.panelRev,.constants.generatedAt,.constants.panelRev)'` on both files, then `diff`. The diff must be empty;
   - `--absence --json` is unchanged apart from its timestamp/rev fields.
4. **Mirror cross-check against L6c §7.** In a scratch script, run `projectedGamesFor(store, id, pos, { throughSeason: 2025, rule: 'l6c' })` over the 2026-10-07 snapshot's veterans, built exactly as `causeVeterans` does. Expect:
   - 98 whose `projectedGames` ≠ the `'pre-l6c'` value;
   - each of those 98 equal to SOf0's games, **recomputed in the same scratch script** with `fitShortCandidate(c.rows, 'SOf0', …)` + `shortPred` over `buildCauseRows` (the panel artifact keeps games for named stars only);
   - Daniels, Wilson, Aiyuk and Ridley at 9.

   Paste the counts.
5. Run `node bin/backtest.mjs --games-calibration --short --write`. It regenerates the dated games-short artifacts.
   - **If this runs on UTC 2026-10-10**, it rewrites `backtests/2026-10-10-games-short-constants.json`; only `generatedAt`/`panelRev` change. Expected and harmless: the app pins the file **at commit `4fa7689`** through `git show`, never from the working tree (app D5).

**Commits:**
1. `short-season-wiring A1: durabilityMirror rule 'l6c' (SHORT_SEASON_K), in-season override check in --short`: code, tests and this task file.
2. `grading: games-short verdict <date> (in-season override check)`: the artifacts.

Pull with rebase, then **push**. Hand back:
- SHAs;
- `inSeasonRule` and the check tables;
- the regression diffs;
- the step-4 counts.

## Stage C — registry sync, anchor-policy boundary 8, mirror SHA (after B is pushed, same day)

**C.1 Registry byte sync.**
- Copy the app's CR-REGISTRY span (app `docs/cross-repo-registry.md`, at B's pushed SHA) into this repo's `cross-repo-registry.md`.
- **Gate:** run `diff <(sed -n '/^<!-- CR-REGISTRY-BEGIN -->$/,/^<!-- CR-REGISTRY-END -->$/p' cross-repo-registry.md) <(sed -n '/^<!-- CR-REGISTRY-BEGIN -->$/,/^<!-- CR-REGISTRY-END -->$/p' ../sleeper-dashboard/docs/cross-repo-registry.md) | grep -c '^<'`. It must print 10. The same command with `'^>'` must print 11. These are the **10 modified + 1 added** physical lines:
  - CR-01 Invariant, Triggers and Mirror;
  - CR-21 App side and Mirror;
  - CR-25 Mirror;
  - CR-26 Mirror;
  - CR-28 Data side, Triggers and Mirror, plus the one added App-side sub-bullet.
- Any other difference: stop and report.
- Run `REGISTRY_MIRROR=1 node --test test/registry-mirror.test.mjs` and `node --test test/registry.test.mjs`.

**C.2 `grading/anchor-policy.md` boundary 8.**
- **Date table:** add row 8, matching rows 5–6: app **B1** SHA (the model commit) · B's UTC push time and push range · veteran · short-season games rule (L6c). Change the intro from "Seven changes on the five tracked axes" to "Eight changes on six tracked axes".
- **Add a section, "### Veteran rows — boundary 8 (short-season rule)",** saying:
  - it is row-detectable through `factors.shortSeasonState`. Absent means pre-boundary; `'qual'` rows are unchanged; on `'short'`/`'none'` rows, `projectedGames` moves (by about half), and `projectedTotalPts` moves with it except on QB `chain` rows; `projectedPPG` does not move;
  - `factors.projectedGamesBase` is the pre-boundary value on post-boundary rows, so one capture grades both rules;
  - the in-season healthy override lives only in the app's displayed copy, never in a snapshot `projection`;
  - **cross-check (to be confirmed, D-67):** the first post-push capture's `'short'`/`'none'` veteran rows equal the mirror's `rule: 'l6c'`.
- **"Boundaries by path":** add one sentence for boundary 8.
- **Closing paragraph:** add "plus boundary 8 as of short-season-wiring".

**C.3 Mirror ↔ app check, then the SHA.**
- Before writing the SHA, open app B1's `src/utils/seasonProjection.js` Step 6 block (`git -C ../sleeper-dashboard show <B1>:src/utils/seasonProjection.js`).
- Confirm it matches `rule: 'l6c'` token for token on these points:
  - the guard, including the non-empty clause;
  - `!rows[id]` falsiness;
  - `>= 8`;
  - the `?? null` k lookup;
  - `clamp(…, 0, 17)` and `Math.round`;
  - the K table (both sides' `SHORT_SEASON_K`).
- Paste both blocks into the hand-back. **Any difference: stop and report.** This is the only parity guard until D-67's capture-based DM-1.
- Then replace the Stage-C placeholder in the `lib/durabilityMirror.mjs` header with the app B1 SHA.

**C.4 Done.**
- `npm test` must be green, including `REGISTRY_MIRROR=1`.
- Commit `short-season-wiring C1: registry sync (app <B2>), anchor-policy boundary 8, mirror app SHA`.
- Pull with rebase, then push.
- Hand back the SHA and the line-count gate output.

## Cross-repo impact

The app task file's `## Cross-repo impact` emits the Mirror text for CR-01, CR-18, CR-21, CR-25, CR-26 and CR-28. On the data side:

- **CR-28 fires** through `lib/durabilityMirror.mjs` (a listed data-side trigger). The re-mirror is Stage A. C.3's block compare guards parity until the first post-push capture; DM-1 on the new rule is D-67, because no post-boundary capture exists yet. The Mirror, verbatim:

  > Changing the status set, the team-played source, the 2016 floor or the slot rule changes app `projectedGames`/`projectedTotalPts`, the ×1.05 bounce-back on `projectedPPG` for a few rows, dynasty reliability, the bounce-back/injury-risk badges and labels, and every games-missed display, **with no app-side diff** — add a `grading/anchor-policy.md` boundary. **The correction is one-way:** the stored files no longer hold the Sleeper-only baseline. A widening change can be graded with `bin/backtest.mjs --absence` and applied by re-running `scripts/migrate-absence-roster.mjs`; a narrowing change needs a forced Sleeper re-fetch of every affected season (with CR-02's dominant-team risk) and has no before/after harness. `lib/durabilityMirror.mjs` mirrors the app triggers above at a pinned app SHA; an app change to any of them silently stales that harness, so re-mirror and re-run its DM-1 parity test in the same change. A completed season re-aggregated with `--force` classifies against its own stored roster file, so editing or deleting that file changes a sealed season's `'D'` on the next forced run. The app's API-only mode keeps Sleeper-only `'D'`, so its games-missed counts and durability differ from the store's. In-season, a week's gameday inactives reach `'D'` one season-totals run after the games (the roster refresh runs daily at 06:23 UTC, after the 06:13 run).

  The new text this slice appends is app task §4.1 items 7–10.
- **CR-25 and CR-27 fire** through the whole-file `bin/backtest.mjs` trigger only if Stage A touches it, and it does not: the change is inside `scripts/games-short-run.mjs`. No fit, constant or pin moves.
- **CR-24:** Stage C is the byte sync it enforces.
- **Route:** two-session (app applies, data syncs), per the standing decision. Do not convert this to a parent-folder session if a reviewer flags it.

## Plan gate (plan-reviewer, data side, 2026-10-10) — decisions

There were 11 flags (1 high, 4 medium, 6 low). Session 1 checked each one and applied all of them. The reviewer independently reproduced:
- every tabled in-season check number;
- `override`;
- `noRow` = 31;
- the 98 changed veterans;
- the four stars at 9.

| # | flag | decision |
|---|---|---|
| 1 | HIGH: the CR-28 sub-bullet's punctuation/wrap breaks the 9+1 gate | Applied: the app §4.1 item 7 is one unwrapped physical line, and `:298`'s period is left as is; C.1 states the diff command and the counts |
| 2 | The verdict renumbering leaves a gap | Applied: §8 check, §9 Limits |
| 3 | The `--short` jq filter misses `.constants.*`; "first four" is wrong | Applied |
| 4 | A.5 rewrites the file the app pins | Applied: the app copies through `git show 4fa7689:…`; noted here |
| 5 | No mirror ↔ app parity guard before D-67 | Applied: C.3 block compare, stop on difference |
| 6 | State expression paraphrased | Applied: verbatim |
| 7 | Step 4 comparison source missing | Applied: recompute with `fitShortCandidate`/`shortPred` |
| 8 | Empty-group and missing-`ws` semantics; `noRow` | Applied: n ≥ 30 evaluable, ≥ 4 healthy checkpoints, `noRow` = 31 |
| 9 | Anchor text: `chain` exception; row 8 should cite B1 | Applied |
| 10 | CR-28 Triggers omit `enrichRow`/`accountWeeks`/`causeVeterans` | Applied in the app §4.1 item 9 (same line, count unchanged) |
| 11 | CR-28 Mirror not quoted in full | Applied: quoted verbatim |

## Stage A verification record (Session 1, 2026-10-10, `b788678`, `8f54db1`)

- **implementation-reviewer** found no blocking flags and two low test flags; the fix is below.
- **Independently confirmed:**
  - `'pre-l6c'` is byte-identical: L6, L6b JSON and markdown, `--absence` and `--short` (minus `inSeasonCheck`);
  - the committed artifacts equal a fresh run;
  - `inSeasonRule` is `override`, with `noRow` 31;
  - the step-4 count is 98 = SOf0, with 0 state mismatches;
  - the constants-file diff from `4fa7689` is `generatedAt`/`panelRev` only.
- **Session 1 also re-ran `--short --json` itself:** the week-4 numbers match app §0 D3.

## Fix pass A-1 (tests only)

Scope: `test/durability-mirror.test.mjs` and `test/games-calibration.test.mjs`. Change no source and no artifacts.

1. **DM-6 `short` / `none` cases.** Replace the expected `projectedGames` that is computed from the function's own `avgGames` with a **hand-computed literal**. Write the arithmetic as a comment: the fixture's weighted gp × multipliers × k, then the round. Keep the existing k/state/`< 8` assertions.
2. **DM-5.** Delete the tautological "`'pre-l6c'` deep-equals a call without `rule`" assertion; the default makes it always pass. In its place, assert on the DM-1 fixture rows that an explicit `rule: 'pre-l6c'` returns exactly the key set `['projectedGames','injurySeasons','absenceShapeFactor','avgGamesBase','avgGames','recent']`, sorted. Keep the no-`shortSeason*`-keys assertion.
3. **GCS-7.** Add three cases:
   - **(a)** a healthy group with n < 30 at one checkpoint is skipped, rather than compared. Build a fixture where that checkpoint's healthy base would *lose*, and assert the result is still `override` when the other ≥ 4 checkpoints pass;
   - **(b)** a row present in S+1 **without** `weeklyStatus` counts toward `noRow`;
   - **(c)** at w = 1, `missed.n` is 0 and that checkpoint does not affect the decision.

Run `npm test`. Commit `short-season-wiring A1 fix pass: honest DM-5/DM-6 expectations, GCS-7 skip/noRow/w=1 cases`, then pull with rebase and push. Hand back the SHA and what each changed test asserts.

## Stage C verification record (Session 1, 2026-10-10, `9927921`)

- **implementation-reviewer** found no blocking issues.
- **Confirmed independently:**
  - the span is byte-identical to app `origin/main` (`59fc51d`; fix pass B-1 made no registry change). Session 1 also checked it;
  - the gate is 10 `<` / 11 `>` against the parent commit;
  - `REGISTRY_MIRROR=1` registry tests pass 23/23, and `npm test` is green;
  - anchor-policy boundary 8 is complete, and the extra top-summary edit is accurate;
  - the mirror header names `e3de164`, and the only token difference from app Step 6 is the accepted `?.`.
- **Two low notes, left as is:**
  - the boundary-8 section sits above the boundary-7 section (cosmetic);
  - row 8 does not mention app fix pass `59fc51d`. That is defensible: it changes only the displayed in-season copy, never `seasonProjection.js` or a snapshot.
- **Slice complete.** Open: D-67 (DM-1 parity and the boundary-8 cross-check on the first capture from 2026-10-11), and the D-52 first independent check on 2026 actual games.
