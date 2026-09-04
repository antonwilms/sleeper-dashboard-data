# R3-FIT precondition — panel team-denominator entity filter (TEAM_* exclusion)

**Repo:** `sleeper-dashboard-data` (DATA). One session, this repo only — do not edit the app repo.
**Type:** Session-1 implementation plan (planning only — no source edited this session). Correctness fix to an offline analysis module + a reproducibility refresh of two committed analysis verdicts. **No served-asset shape change, no manifest schema change, no scoring change, no cross-repo contract change.**
**Date:** 2026-07-22.

**Resolved HEADs (session-start discipline — verified via GitHub MCP `get_commit main` = local `origin/main` = local HEAD, both trees clean):**
- **Data** `sleeper-dashboard-data`: `a74d7f9d1f410007db021eb34d3a084b4af22618` ("nflverse: schedule 2026-08-07", github-actions bot) — re-verified 2026-08-08; the 14 commits since the original `79fa9d3` anchor are scheduled-Action data captures only (ktc/players-state/oline/playerids/roster/schedule + manifest.json); `git diff --stat` confirms zero change to `lib/panel.mjs`, `lib/backtest.mjs`, `test/*.mjs`, `CLAUDE.md`, `data-catalog.md`, `README.md` — all cited line anchors below are still valid.
- **App** `sleeper-dashboard`: `6a52dc9590e0751b31717d95601651891a15c796` ("fix: scope inProgress bypass to the ktcHist read path")

Every line anchor below is grounded at the data SHA above; re-verify before editing (a scheduled Action may have pushed).

**Substrate (read, do not re-derive):** app `.claude/tasks/projection-model-assessment.md` §E-2 (fit preconditions), app `.claude/tasks/roadmap.md` R3-FIT row, app `src/utils/teamContext.js:35` (`isTeamAggregateId` — the app-side fix landed 2026-07-18), app `docs/signal-registry.md:80,92` (the scale-invariance evidence), data `.claude/tasks/grading-harness-e0a.md` (the harness this panel belongs to), data `CLAUDE.md` "Poisoned-snapshot window" note.

---

## 0. Why this exists (the R3-FIT precondition)

`lib/panel.mjs` `buildTeamTotalsForSeason` (lines 67–81) sums each team's share denominators by iterating **every** record in a season-totals file:

```js
for (const [pid, rec] of Object.entries(totalsSeason)) {
  const team = teamOf(pid, season);
  if (team == null) { unattributed++; continue; }
  ...
  totals[team].recTgt += s.rec_tgt || 0;   // etc.
}
```

Store-served season-totals carry one `TEAM_<abbr>` **whole-team aggregate pseudo-row** per team (full stat keys, its own per-season `team` field) alongside the real player rows (data `CLAUDE.md` cross-repo season-totals row; app `CLAUDE.md` Cross-repo contracts). `teamOf('TEAM_KC', s)` resolves `totalsByYear[s]['TEAM_KC'].team === 'KC'`, so the aggregate's team totals are added to `totals['KC']` **on top of** the sum of KC's individual players — every team denominator is ≈ **doubled**, so every reconstructed `share` / `teamRzShare` is ≈ **half** its true value. This is the exact defect the app fixed on 2026-07-18 (`teamContext.js` `isTeamAggregateId`); the data panel builder still has it.

**Why this must land before any R3-FIT fit (state this in the summary):**
1. **`shareTrendMultiplier` is scale-dependent.** Most factors the fit touches are cohort-percentile transforms and are ≈ scale-invariant to a uniform halving (halving every share preserves within-cohort ranks — app `docs/signal-registry.md:92` documents exactly this: post-bug snapshots' `teamRzShare` factor is "≈ unaffected — percentile vs an equally-scaled cohort"). **But the Step-3 share-trend factor's volatility dampener is not** — `shareVolatility` is an absolute-scale SD of shares, so halving biases the volatility label toward `entrenched` (app `signal-registry.md:80`), which changes `shareTrendMultiplier = 1 + (shareTrendRaw − 1) × volatilityScale`. The exponent harness reconstructs this factor from the panel's shares; on half-scale shares its volatility leg is biased. The fit must run on true-scale shares.
2. **Panel↔app factor-construction parity (transportability).** A fitted exponent `wᵢ` is only shippable if the panel reconstructs `fᵢ` the way the app now computes it. The app computes shares from **entity-filtered** denominators since 2026-07-18; the panel must match, or the exponents are fit against a factor the app no longer produces.
3. **Repo self-consistency.** The committed E-0a verdict's "Reproduce: `node bin/panel.mjs --write`" must reproduce from current code.

**What does NOT need fixing here (state it explicitly so nobody widens scope):**
- **`lib/backtest.mjs` `computeTeamTotals` (lines 206–221) is unaffected** — it iterates `Object.entries(advstatsPlayers)` (line 208 / the caller passes `advstatsY.players`), i.e. only real WR/TE/RB players present in advstats. Advstats has no `TEAM_*` rows, so the pseudo-rows never enter. Membership-gated by construction. Leave it untouched (a guard there would be dead code).
- **App snapshots in the poisoned window 2026-07-16→07-18** carry ½-scale `teamRzShare`/`shareVolatility` (data `CLAUDE.md` "Poisoned-snapshot window"). **The R3-FIT retrospective panel does not consume app snapshots** — it reconstructs from `nfl/season-totals/` + advstats + roster, and reads exactly **one** snapshot (`2026-07-05`, pre-poison) solely for `scoringSettings`. So the poisoned window does not enter the fit. It stays a forward-grading (R4) concern, already documented in `CLAUDE.md`. **No snapshot exclusion or correction is part of R3-FIT.**

---

## 1. Scope and non-goals

In scope: one entity-filter helper + its use in `buildTeamTotalsForSeason`; tests (unit + a scale-verification assertion); a reproducibility re-run of the two committed panel verdicts; docs.

Non-goals (do NOT do):
- The exponent fit itself — that is `r3fit-exponent-harness.md` (this fix is its precondition).
- Any `computeTeamTotals` edit in `lib/backtest.mjs` (membership-gated; §0).
- Re-opening the R2 flip decision. The refresh in §4 must confirm **FLIP-CLEARS is unchanged** — if it changes, STOP (see §4.3).
- Any snapshot edit / exclusion / correction (§0).
- App-repo edits.

---

## 2. Edits, grouped by file

### 2.1 `lib/backtest.mjs` — add the entity-filter helper (1 additive export)

Add next to `TEAM_DENOM_MIN` (line 6), mirroring app `src/utils/teamContext.js:35`:

```js
// Whole-team aggregate pseudo-rows (`TEAM_<abbr>`) carry full team stat keys and
// their own `team` field; unfiltered they double every team denominator. Mirror of
// the app's src/utils/teamContext.js isTeamAggregateId (id-prefix filter, NOT a
// team-code check — 'TEAM_IND' → true, '6813' → false, 'IND' DEF row → false).
export function isTeamAggregateId(id) {
  return typeof id === 'string' && id.startsWith('TEAM_');
}
```

Rationale for placement: `lib/panel.mjs` already imports team-totals primitives from `lib/backtest.mjs` (line 10: `DEFAULT_GATES, TEAM_DENOM_MIN, solveOLS, spearman`); this keeps the team-totals helpers co-located. DEF `<abbr>` rows need no filter (they carry no offensive stat keys → contribute 0 → harmless; app CLAUDE.md).

### 2.2 `lib/panel.mjs` — apply the filter in `buildTeamTotalsForSeason` (2 edits)

1. **Import (line 10)** — add `isTeamAggregateId`:
   ```js
   import { DEFAULT_GATES, TEAM_DENOM_MIN, isTeamAggregateId, solveOLS, spearman } from './backtest.mjs';
   ```
2. **`buildTeamTotalsForSeason` (lines 67–81)** — skip aggregate rows at the top of the loop body, and count them (so the fix is observable in coverage):
   ```js
   export function buildTeamTotalsForSeason(totalsSeason, season, teamOf) {
     const totals = {};
     let unattributed = 0;
     let aggregateRowsExcluded = 0;
     for (const [pid, rec] of Object.entries(totalsSeason)) {
       if (isTeamAggregateId(pid)) { aggregateRowsExcluded++; continue; }  // TEAM_* pseudo-rows double the denominator
       const team = teamOf(pid, season);
       if (team == null) { unattributed++; continue; }
       // ...unchanged summation...
     }
     return { totals, unattributed, aggregateRowsExcluded };
   }
   ```
   Update the function's header comment (currently lines 63–66) to note the exclusion. The extra return field `aggregateRowsExcluded` is additive and optional to consume — see §2.3 for wiring it into coverage (recommended, small).

### 2.3 `lib/panel.mjs` — surface the exclusion count in coverage (optional-but-recommended, 1 small edit)

`assemblePanelRows` (lines 302–385) already tracks `unattributedByYear` (lines 341–344) from the two `buildTeamTotalsForSeason` calls (lines 339–340). Add a sibling `aggregateRowsExcludedByYear[Y] = { thisYear, priorYear }` from the same two results, and include it in the returned `coverage` object (line 377–384). This makes "the entity filter fired on N rows/team-year" auditable in the committed panel artifact and in the verification test — a cheap, permanent regression witness. If the implementer judges this noise, it may be dropped, but the count is the cleanest scale-verification hook (§3).

---

## 3. Scale verification (how we confirm the fix is right BEFORE the fit uses it)

Two independent checks, both in tests (§5):

1. **Doubling witness (unit, hand-computed fixture).** A one-team fixture with 3 real player rows + one `TEAM_<abbr>` aggregate row whose stat keys equal the sum of the three players. Pre-fix, `buildTeamTotalsForSeason` returns a denominator = 2× the player sum; post-fix it returns exactly the player sum. Assert the post-fix denominator equals the hand-summed player total and that `aggregateRowsExcluded === 1`. Assert a derived `computeShare`/`computeTeamRzShare` on that fixture returns the true (un-halved) share.
2. **Live-data spot check (integration, injectable loader).** Feed one real committed season-totals file (e.g. `nfl/season-totals/2023.json`) through the injectable `load` path; assert that for a known high-volume team the reconstructed `recTgt`/`rushAtt` denominators are within a plausible band (not ≈2× the summed real players) and that `aggregateRowsExcluded` per team-year equals the team count (~32). This is the "feature scale is right before fitting" gate the R3-FIT precondition demands.

---

## 4. Reproducibility refresh of the two committed verdicts

Because the panel builder changed, the two committed date-stamped analysis verdicts should be re-run so the repo reproduces. Both are **date-stamped** (`grading/<date>-*.md`, `backtests/<date>-*.json`) — re-running today writes NEW files (`2026-07-22-*`) and does **not** clobber the historical `2026-07-08-e0a-*` / `2026-07-09-r2flip-*` artifacts (which remain the pre-fix record and the R2 authorization).

### 4.1 E-0a baseline — REQUIRED
Run `node bin/panel.mjs --write`. Writes `backtests/2026-07-22-e0a-{panel,fit}.json` + `grading/2026-07-22-e0a-verdict.md`.
**Expected:** candidate verdicts materially unchanged (airYardsShare CLEARS WR/TE; shareLevel UNSTABLE WR / DEGRADES TE / NO-GAIN RB) — the E-0a fit is standardized-linear and scale-invariant (halving z-scores identically). Coverage `Surviving` counts may shift by a **handful** of rows at the `TEAM_DENOM_MIN=20` floor (pre-fix, doubled denominators lifted a few true-sub-20 team-years over the floor; post-fix they drop). This is expected and correct.
**Guard:** if any candidate's verdict LABEL flips, STOP and report — the labels are robust to scale; a flip means something else moved.

### 4.2 R2 flip gate — OPTIONAL (run only if cheap; do not treat as re-opening R2)
Optionally run `node bin/panel.mjs --flip-gate --write` → `2026-07-22-r2flip-*`. FLIP-CLEARS is a landed, common-mode result (both arms used the same doubled denominators, so the A/B is unchanged in substance). Value of re-running is marginal (reproducibility only). If run, the verdict **must** remain FLIP-CLEARS.

### 4.3 Hard guard (both)
The R2 flip is **activated in production** (`DEFAULT_ATTRIBUTION='per-season-team'` since 2026-07-11). This fix must NOT change the FLIP-CLEARS verdict or the E-0a candidate labels. If either changes, **STOP, do not commit, and report** — the fix has a side effect that needs human review. (It should not: the E-0a/flip fits are scale-invariant; only floor-margin coverage shifts.)

---

## 5. Tests to add

All in `test/panel.test.mjs` (pure-lib units) and `test/panel-integration.test.mjs` (injectable-loader), run by `npm test` (`node --test`). Reuse the existing fixture idiom in those files.

- **T-P1 entity filter (pure):** `isTeamAggregateId('TEAM_IND') === true`, `isTeamAggregateId('6813') === false`, `isTeamAggregateId('IND') === false`, `isTeamAggregateId(6813) === false` (non-string), `isTeamAggregateId(null) === false`. (Mirror app `teamContext.test.js` T-N5, lines 714–717.)
- **T-P2 doubling witness (pure, §3.1):** one-team fixture, 3 player rows + a `TEAM_<abbr>` aggregate row = sum of the three. Assert `buildTeamTotalsForSeason(...).totals[T].recTgt` equals the hand-summed player total (NOT 2×), `.aggregateRowsExcluded === 1`, `.unattributed === 0`. Add a pre-fix contrast comment documenting the value that WOULD have appeared (2×) so the regression intent is legible.
- **T-P3 share scale (pure):** using the T-P2 fixture, assert `computeShare` (lines 151–164) and `computeTeamRzShare` (lines 183–196) return the true (un-halved) share for a known player, and that a below-`TEAM_DENOM_MIN` team-year yields `null` (floor still enforced on the corrected denominator).
- **T-P4 coverage surfacing (pure, only if §2.3 done):** assert `assemblePanelRows(...).coverage.aggregateRowsExcludedByYear` is present and non-zero for a fixture year containing an aggregate row.
- **T-P5 live spot check (integration, §3.2):** injectable `load` over one real season-totals file; assert per-team denominators are not ≈2× the summed real players and `aggregateRowsExcluded` ≈ team count. Skip (`t.skip`) if the file is absent (keeps CI green in a sparse checkout).
- **Regression:** the existing `test/panel.test.mjs` / `test/panel-integration.test.mjs` suites and `test/backtest.test.mjs` must stay green with **zero** edits except where a fixture deliberately included a `TEAM_*` row expecting the old doubled denominator (if any exists, update its expectation to the corrected value and note why — never edit-to-green).

`npm run smoke` is unaffected (panel is not in smoke) but must still pass (`grade --self-test` unchanged).

---

## 6. Docs updates

- **`CLAUDE.md` (data) — Navigation map, `lib/panel.mjs` row:** append "; `buildTeamTotalsForSeason` excludes `TEAM_<abbr>` aggregate pseudo-rows (entity filter, mirror of app `isTeamAggregateId`) — unfiltered they doubled every team denominator". **`lib/backtest.mjs` row:** append "; exports `isTeamAggregateId` (TEAM_* pseudo-row filter)".
- **`CLAUDE.md` (data) — "Poisoned-snapshot window" note (Grading CLI section):** append one sentence: "The same doubled-denominator root cause was present in `lib/panel.mjs` `buildTeamTotalsForSeason` and was corrected 2026-07-22 (entity filter); the retrospective E-0a/flip panels reconstruct from season-totals, not snapshots, so this corrects the panel builder, not the snapshot window (which stays a forward-grading exclusion)."
- **`data-catalog.md` — season-totals section (row-composition contract):** if a `TEAM_<abbr>` row-composition note exists there, append "Analysis consumers (`lib/panel.mjs`) exclude `TEAM_*` via `isTeamAggregateId`." If no such note exists, add a one-line bullet under the season-totals row-composition contract. (Implementer: grep `TEAM_` in `data-catalog.md` first; edit the existing note if present, else add.)
- **No README.md change** (verified: no attribution/denominator prose in README's Analysis section beyond the panel subsection, which describes methodology not the entity filter). Implementer: re-grep `TEAM_\|denominator\|isTeamAggregate` in `README.md` to confirm before declaring no-change.

If, after the §4.1 re-run, the implementer commits the refreshed `2026-07-22-e0a-*` artifacts, no doc change is owed for them (backtests/grading are unregistered analysis — `grading-harness-e0a.md` §5 manifest stance).

---

## 7. Cross-repo impact

**None.** No served-file shape, no manifest field/schema, no scoring math (`lib/fantasyPoints.mjs` untouched; `buildInBasisOutcomes` reused read-only), no `bin/update.mjs` subcommand, nothing the app loads changes. `isTeamAggregateId` is an internal analysis helper (the app already has its own copy in `teamContext.js`; this is an independent mirror, not a shared contract). The refreshed verdicts are new, unregistered, analysis-only files.

Coordination note for the task summary (informational, not a contract): the app fixed the same defect app-side on 2026-07-18; this closes the data-side (panel) manifestation. The two fixes are independent (each repo filters its own denominators) and change together only if the `TEAM_` id scheme itself changes upstream (already a documented breaking-change surface in both CLAUDE.md files).

---

## 8. Step sequence for the implementer

1. `lib/backtest.mjs`: add `isTeamAggregateId` (§2.1). Run `test/backtest.test.mjs` — stays green.
2. `lib/panel.mjs`: import it (§2.2.1); filter in `buildTeamTotalsForSeason` + count (§2.2.2); optionally surface `aggregateRowsExcludedByYear` in coverage (§2.3).
3. Tests T-P1…T-P5 (§5). `npm test` green.
4. Re-run `node bin/panel.mjs --write` (§4.1, REQUIRED); inspect the refreshed verdict; confirm candidate labels unchanged (§4.3 guard). Optionally `--flip-gate --write` (§4.2), confirm FLIP-CLEARS.
5. Docs (§6).
6. `npm test` green; `npm run smoke` green.
7. Session git workflow (data `CLAUDE.md`): commit (`fix: exclude TEAM_* aggregate rows from panel team denominators (R3-FIT precondition)`), `git pull --rebase origin main` before push (manifest union rule if a scheduled Action pushed — this session touches no served data files, so any conflict is other-side-only), `git push origin main`. **No CDN purge** (no served file changed).
8. Task summary must state: the fix + scale-verification result; E-0a candidate labels unchanged (+ FLIP-CLEARS unchanged if re-run); that this unblocks `r3fit-exponent-harness.md`; §7 (no cross-repo contract).

**Out of scope, do not do:** the exponent fit; editing `computeTeamTotals`; any snapshot edit; touching the R2 activation; app-repo edits.
