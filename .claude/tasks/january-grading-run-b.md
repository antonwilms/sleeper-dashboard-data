# P3 Slice B — January grading run: D-52 ROS and games grades, D-16, D-75, D-60 recount

**Review depth: full** — it grades shipped scoring rules (L6c, the in-season override, ROOKIE_TOTAL_FACTOR, the rookie ceiling) for decision input, and it adds parameters to three committed analysis adapters whose committed outputs must stay byte-identical.

**Session 1:** opus, data repo, read against data `12c769b` / app `f7ebfa8`. **Session 2: sonnet**, effort high. **Starts only after Slice A (`.claude/tasks/january-grading-run-a.md`) is signed off.** Its facts (§1), trigger and G-SEASON (§2), K/P/S(i) (§5.1–5.3), CI method and `--rehearse` are A's and are not repeated here. Section numbers are kept from the pre-split plan.

**Goal.** Plug five steps into Slice A's `STEPS` registry: `ros`, `games-l6`, `override`, `rookie`, `d60`, plus `listed` (the §9 table, text only). Numbers only: no constant, no wiring recommendation.

---

## 3. Touch list (Slice B)

| File | Change |
|---|---|
| `lib/seasonGrade.mjs` | ROS grader, checkpoint calendar, L6 games grader (§6) |
| `scripts/season-grade-run.mjs` | append the six steps to `STEPS`; never edit A's steps |
| `scripts/panel-run.mjs` | `runRookiePanels({ …, entryToYear = 2025 })` |
| `scripts/rookie-total-run.mjs` | `runRookieTotal({ …, evaluateTargetSeason = null })` |
| `scripts/inseason-dyn-run.mjs` | `countSatLongerFlagged` (§8) |
| `test/season-grade-b.test.mjs` **(new)**; `test/fixtures/season-grade/` (extend) | §11 |
| `README.md` | the January section gains B's steps |

## 6. D-52

### 6.1 ROS grade by checkpoint (`inSeason.ros`)

- **Calendar:** `T_c` = week c's Thursday = **2026-09-10 (a fixed literal, week 1's Thursday)** + 7(c−1) days. It is *not* derived from `KICKOFF_2026_UTC`: the opener was Wed 2026-09-09, Slice A §5.1. Week c **closes** at `T_c` + 5 days, 06:00 UTC (the Tuesday after Monday night).
- **Checkpoint c's capture:** the first capture with `capturedAt` in [close_c, `T_{c+1}` 23:00 UTC). Otherwise it is the first capture after close_c, flagged `late`.
- **Checkpoints:** c = 3…17. The first `inSeason` capture is 09-27, inside week 3. c = 1 and 2 are listed as `no-inSeason-capture`. Week 18 has no ROS.
- **Rows** with `inSeason.season === 2026`:
  - **(a) per-game rows** (no `start`): prediction `ros.value`. Realised = league points over the player's `'P'` weeks after his n-th `'P'` week (`n = inSeason.n`) ÷ the count of those weeks. Graded if ≥ `IN_SEASON_DEFAULTS.minRosGames` (4).
  - **(b) start rows** (QB `start` present): prediction `ros.value` per team game. Realised = league points over the team's last `start.remaining` scheduled games ÷ `start.remaining`; weeks not played count 0.
- **n-consistency check:** per capture, the share of rows whose n-th `'P'` week ≤ c+1 must be ≥ 99%. Below that, the checkpoint is `n-inconsistent` and excluded.
- **Weekly points:** `rescoreSeasonRowsLeague(2026, S.scoringSettings, positionOf).weeklyPoints` (D-71 → `exact`). Count `scaled` rows.
- **Metrics per checkpoint × position, (a) and (b) separately:**
  - MAE and bias of `value`.
  - Paired Δ|err| (value − comparator) via `bootstrapPairedMean`, against `ros.prior` and against observed-to-date PPG (n ≥ 1).
  - Caveat to print: on live-prior rows `ros.prior` is the current, leaky projection.
- **Empty cells:**
  - n = 0 → `empty` (row printed).
  - n below the minimum → `insufficient` (numbers printed, no label).
  - The frozen/live split is reported only when both groups are non-empty. Otherwise it prints one line: "split degenerate: all rows priorSource live (notFrozenReason counts …)". This is the expected state for 2026.

### 6.2 L6 games check

- **Rows:** P's veterans, using S(i)'s `projectedGames`, `factors.projectedGamesBase` and `factors.shortSeasonState` (leak-free).
- **Grade:** vs 2026 `gamesPlayed`, by state (`short`/`none`/`qual`) and for rel3 (`rel3Of`, S = 2025, rank index built as in `games-cause-run.mjs`).
- **Metrics:** MAE, bias, and paired Δ|err| (L6c − base) with CI.
- Imputed players are excluded and counted.

### 6.3 In-season healthy override

`inSeasonCheck` (`scripts/games-short-run.mjs`, export unchanged), with rows `{ id, S: 2025, sState, star: rel3, p: { SOf0: projectedGames, C0: projectedGamesBase } }` and `store = { 2026: season-totals 2026 }`. Report the groups × checkpoints and `inSeasonRule` verbatim.

### 6.4 `inSeason.next` — recorded, not built

The `next` grade needs 2027 outcomes (≥ 2028-01). The artifact records the count of rows with a `next` block per position × checkpoint.

## 7. D-16 and D-75

- **Panels:** `runRookiePanels({ basis, entryToYear: 2026 })` for `half_ppr` and `league`.
- **D-16** reports:
  - (i) 2026-class debut rows by position × draft group, with outcome classes;
  - (ii) `computeCeilingReconciliation` over classes 2013–2026 vs `APP_ROOKIE_CEILING` (half-PPR);
  - (iii) the QB asymptote leave-one-class-year-out range over 14 classes;
  - (iv) 2026-class QB debuts (gp ≥ 8) above 21.90 (half-PPR) and above 21.90 × `basisScaleOf(load, 2026, 'QB')` (league).
  - Label: `moved` iff the 2013–2026 asymptote is outside [20.50, 21.95]; else `within-fold-spread`.
- **D-75:** `runRookieTotal({ basis: 'league', panelPath, evaluateTargetSeason: 2026 })`, with the league panel injected via `loadLeaguePanel`.
  - Rows: `targetSeason === 2026`, groups `day3`/`undrafted`, positions RB/WR/TE.
  - **Both arms = `predTotal × factor`**, where `predTotal` is `composeRookieRow`'s legacy, pre-factor total at `basisScaleOf(load, 2026, pos)`. Shipped factor 0.796/0.835. League factor read from `backtests/2026-10-17-rookie-league-constants.json` `families.F4.constants.totalFactor`.
  - Bias: `Σpred ÷ Σreal` per group, with cluster-bootstrap CI.
  - Guard: paired Δ|error| (league − shipped) CI lower bound ≤ 0.
  - Label: `league-better-calibrated` iff `|ratio_L − 1| < |ratio_H − 1|` and the guard passes; else `shipped-stands`. Below 30 rows: `insufficient`.

## 8. D-60 — recount only

- New export `countSatLongerFlagged({ load, seasonsTo = DYN_DEFAULTS.seasons.to, maxLoadSeason = IN_SEASON_DEFAULTS.maxLoadSeason })`.
- It threads both ceilings as parameters through `weekOneRoles`, `ppgFrom`, the Q5 checkpoint-row path, and the hard-coded `guardLoad(load, { maxLoadSeason: 2025 })` at `scripts/inseason-dyn-run.mjs:1068`, for the count path only.
- `obsBy` feeds only `obs`, so no k-fit assembly is needed. The stop condition below is not expected to fire.
- January calls it with `seasonsTo: 2025, maxLoadSeason: 2026` and reports `flaggedWithY1`.
- At ≥ 20 it reports "D-60 re-run owed" (a follow-up slice). The full re-run is not done in January.
- **Stop condition:** if the count needs anything beyond the Q5 path, stop and report. D-60 then leaves the January run; it is not blocking.

## 9. Listed, not built

| Item | Does January produce its input? |
|---|---|
| D-79 `SHORT_SEASON_K` refit | Partly. The refit needs no 2026 data. §6.2 is its first out-of-sample season. |
| D-80 durability constants | No. It needs a data-rev comparison mode; §6.2 is a symptom check only. |
| D-85 healthy-cut override | Partly. §6.3 grades it on 2026 with post-D-76 `'D'`; the historical re-run is still owed. |

## 10. Orchestrator hooks (Slice B)

- Steps append in this order: `ros` (§6.1), `games-l6` (§6.2), `override` (§6.3, plus §6.4's `next` counts), `rookie` (§7), `d60` (§8), `listed` (§9).
- Each reads Slice A's `ctx` (K, P, S(i), classification, loads, `KICKOFF_2026_UTC`), and reruns nothing A computed.
- New artifacts: `backtests/<runDate>-rookie-panel.json` and `backtests/<runDate>-rookie-panel-league.json` (unregistered, README §Analysis). B's aggregates go into A's `season-grade.json` under keys `ros`, `gamesL6`, `override`, `rookie`, `d60`.
- Verdict sections follow A's, in step order.

## 11. Tests (Slice B; Invariant 10 as in Slice A)

- **`test/season-grade-b.test.mjs`** on fixtures:
  - the calendar (close times, the `late` flag, `no-inSeason-capture` for c = 1, 2);
  - the n-split and the n-consistency flag;
  - start-row team-game realisation;
  - `empty` / `insufficient`;
  - the degenerate frozen split line;
  - L6 cells and rel3;
  - the `inSeasonCheck` row shape;
  - the D-75 arms (`predTotal × factor`, the league factor read from the constants file) and its label rule;
  - the D-16 label rule.
- **Byte-identity, on memLoad fixtures** (the `test/rookie-basis-panels.test.mjs` precedent):
  - `runRookiePanels` default ≡ explicit `entryToYear: 2025`;
  - `runRookieTotal` with `evaluateTargetSeason: null` ≡ omitted;
  - `countSatLongerFlagged` default ≡ explicit `seasonsTo: 2024, maxLoadSeason: 2025`.
- **Live check (not a test):** the 13-player count is checked live once in Session 2's hand-back.

## 13. Pre-registration (Slice B; frozen at this commit)

| Item | Rule |
|---|---|
| CI | as Slice A §13 |
| Minimum sample | ROS ≥ 30 players per cell; L6 state ≥ 20; D-75 ≥ 30 rows; below → `insufficient` (numbers printed, no label) |
| ROS | `value-beats-<cmp>` iff Δ\|err\| CI upper < 0 |
| L6 | `l6c-beats-base` iff CI upper < 0; `base-beats-l6c` iff CI lower > 0; else `no-difference` |
| D-16 / D-75 / D-60 | §7 / §7 / §8 |
| Never output | a constant, a multiplier, or a recommendation to wire |

## 14. Done-definition and hand-back (Slice B)

1. `npm test` and `npm run smoke` green.
2. `node bin/season-grade.mjs --rehearse` runs all steps on today's partial data; paste B's sections.
3. README updated.
4. Commit; push only after Anton's sign-off.
5. Hand-back: SHA range, files touched, deviations, what each test asserts, and the live `countSatLongerFlagged` default count (expected 13).

Flags from both review rounds that land in B: 1-9 (§6.1), 1-14 (§7), 1-16 (§8). The full map is Slice A §17.
