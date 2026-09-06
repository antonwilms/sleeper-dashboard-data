# D4 — snap counts 2012–2019 (R1-SNAPS)

**Model:** sonnet implements this file exactly. **Status:** planned (opus, 2026-09-05). **Slice:** D4 of the stellar-data batch (`../analysis/data-stellar-batch-brief.md` Arc A). **Repo:** data only.
**Base:** `f23d8ae` on `main` (D2 merged). **Size:** the brief says one slice; that holds.
**Plan gate:** plan-reviewer run 2026-09-05, fifteen flags, all folded in. Its most consequential finding is that this repo already ships a seam built for this exact slice, and the first draft of this file planned the wiring somewhere else entirely.

**Both prerequisites are met.** D2 shipped the `pfrId` join key (PR #3, merged). D3's C2 is closed — verified today, see the brief's annotated D3 block: the 2016 air-yards corruption was fixed by a re-ingest, `CORRUPT_PREDICTOR_SEASONS` is empty on purpose, and 2016 now measures 8.43 air yards per target inside the [6, 11] band.

**Problem.** Sleeper's `off_snp` exists from 2020 only, so every grading run listwise-drops pre-2020 rows wherever snap share is a control. The effective panel is 2020–2024. nflverse snap counts cover 2012+ at player-game grain and would roughly triple it.

**Capture-only.** This slice banks the family and wires one panel fallback behind a measured gate. Nothing reaches projection or scoring.

---

## Step 0 — live source measured

Fetched `snap_counts_2016.csv` and `snap_counts_2022.csv` from the nflverse-data `snap_counts` release, 2026-09-05.

**All sixteen columns the brief lists are present and exactly as named** — `game_id, pfr_game_id, season, game_type, week, player, pfr_player_id, position, team, opponent, offense_snaps, offense_pct, defense_snaps, defense_pct, st_snaps, st_pct`. No drift.

| | 2016 | 2022 |
|---|---|---|
| rows | 23,890 | 26,381 |
| REG rows | 22,904 | 25,168 |
| REG rows with offensive snaps | 9,262 | 9,985 |
| skill-position rows (QB/RB/WR/TE/FB/HB) | 6,051 | 6,609 |
| **skill join rate via D2 `pfrId`** | **0.990** | **0.999** |
| team-game offensive snaps: median / min / max | 67 / 44 / 95 | 66 / 41 / 100 |

### Findings that change the slice

**1. The join works, comfortably.** D2's crosswalk yields 6,025 `pfrId → sleeperId` pairs, and the skill-position join rate is 99.0% in 2016 and 99.9% in 2022 against the brief's 0.85 gate. The join is not the risk in this slice.

**2. `MIN_SNAPS_ROWS` is off by roughly 3x in the brief.** It guesses "~3,000 player-games/season". Measured REG rows are 22,904 (2016) and 25,168 (2022); rows carrying offensive snaps are ~9,300 and ~10,000. **Pin the gate against the population you actually keep**, and say which one it counts. If the served family is offensive players only, a floor around 7,000 has sensible headroom under the ~9,300 observed; if it counts every REG row, the floor belongs near 18,000. Measure once at implementation and write the observed number in the comment.

**3. `eraTeam` must NOT be applied to this source, and the brief's "era-accurate, `eraTeam`" wording invites exactly that mistake.** `eraTeam` (`lib/nflverse.mjs:1080`) maps *modern* codes back to historical ones — `LA`→`STL` at ≤2015, `LAC`→`SD` at ≤2016, `LV`→`OAK` at ≤2019. This source is **already historically coded**: 2016 carries `LA`, `OAK` and `SD`; 2022 carries `LA`, `LAC` and `LV`. Feeding it through `eraTeam` is a no-op today, because none of its three rules matches an already-historical code, but writing the call implies the input is modern and the next person to touch it will reason from that. **Do not call `eraTeam` here.** Instead follow the repo's own precedent: `validateTeamContext` (`lib/validate.mjs:730-743`) encodes per-year team-code assertions that fire on **every** ingest. `validateSnaps` should carry the same, covering the three boundary pairs specifically — 2015/2016 for `STL`↔`LA`, 2016/2017 for `SD`↔`LAC`, 2019/2020 for `OAK`↔`LV`. A one-off hand-back comparison does not run in CI and does not cover the boundaries, which is where this breaks.

**4. The team-snap derivation needs stating as an assumption, because it is one.** A team's offensive snaps for a game is taken as the **max** `offense_snaps` across that team's players in that game. Measured medians of 66–67 with a 41–100 range are consistent with real offensive play counts, so the assumption holds on this data. It is still an assumption — an offensive lineman who never leaves the field is what makes it true — so put it in the catalog and in the code comment, not just in this file.

---

## Design

### A. Ingest — new family, existing spine

- `scripts/update-snaps.mjs`, `bin/update.mjs snaps --year|--all`, `.github/workflows/nflverse-snaps.yml` (yearly, post-season). In-season weekly refresh is out of scope.
- Follow the season-keyed updater spine the other nflverse ingests use rather than inventing one. The audit's S2 item notes six updaters already share that shape; match it.
- Parser and aggregator go in `lib/nflverse.mjs` beside `aggregateAdvReceiving`, which is the closest existing analogue: same release, same REG-only rule, same season-grain output.
- **REG only.** Skip any row whose `game_type` is not `REG`, the same way `aggregateAdvReceiving` does. This is the C1 defect that was fixed in `e3b3399`; do not reintroduce it in a new family.

### B. Served shape — `nflverse/snaps/<year>.json`, `schemaVersion: 1`

`{ schemaVersion, season, generatedAt, rowCount, playerCount, unmapped, players: { [sleeper_id]: { pfrId, position, team, [traded, teams,] games, offSnaps, teamOffSnaps, offPct } }, byPfr: { … } }`

**Match the sibling families' field names; an earlier draft of this file invented two.** Every season-keyed family carries `generatedAt` (`scripts/update-gamelogs.mjs:150-158`), which the first draft omitted, and both advstats and gamelogs report the miss count as **`unmapped`**, not `unmatchedCount`. Use `unmapped`.

`byPfr` **is** a departure and is deliberate: advstats and gamelogs drop unmapped rows and keep only a count. At a 99% join rate the residue is small and worth retaining, because the rows that fail to join are the interesting ones. Say so in the catalog rather than letting a reader assume it is the house pattern.

`offPct` is computed from the summed numerator and denominator, never by averaging a stored per-game rate — CR-10's rule, and why the source's own `offense_pct` is not carried through.

**Traded players need week-restricted denominators, and this is what the cross-validation actually measures.** `aggregateAdvReceiving` already solves this: it emits `traded` and `teams[]` and uses *week-restricted* team totals, "only the weeks the player was on each team" (`lib/nflverse.mjs:560-566`, `:782-790`). Sleeper's `tm_off_snp` accumulates only over the weeks a player has a row, so a denominator summed over **all** of a team's games would depress `offPct` for every partial season. That would fail the r ≥ 0.95 gate for a reason that has nothing to do with the two sources disagreeing. Mirror the advstats treatment: per team-stint denominators, `traded: true` and `teams[]` ordered by snaps when a player appears for more than one team.

### C. Gates

`MIN_SNAPS_ROWS` per finding 2, measured and commented. `MIN_SNAPS_SEASON = 2012`. Join rate ≥ 0.85 over skill-position rows, which measured 0.99 and 0.999 — a floor against a broken crosswalk, not a target.

**Two of these need code the first draft did not place, and one of them contradicts the spine.**

- `runSeasonKeyedIngest` step 2 **logs `messages.sparsity` and `continue`s** below `minRows` (`lib/seasonIngest.mjs:128-133`); it does not throw. So "below `MIN_SNAPS_ROWS` throws" is only true if a second floor lands in `validateSnaps`. Decide which behaviour you want and make the test assert that one: a skip is right for a season upstream has not published yet, a throw is right for a season that exists and came back short. Both are defensible; a test asserting the opposite of the code is not.
- Nothing today rejects a `--year` below a family floor. `lib/args.mjs` bounds only at `MIN_CLI_YEAR = 1999` and is explicit that this is "deliberately NOT a family coverage floor". `MIN_SNAPS_SEASON` therefore needs its own check in the ingest, in the same place `MIN_SCHEDULE_SEASON` does its work.
- **Add `'snaps'` to `ALL_SUBCOMMANDS` (`lib/args.mjs:14`).** That list is the whitelist gating the `--all`-plus-`--year` conflict rejection. Without it, `bin/update.mjs snaps --all --year 2016` validates cleanly and silently ignores `--year` — the exact silent retarget that module exists to catch. This slice asks for `--all`, so it must be on the list.

### D. Panel fallback — through the seam that already exists

**Use `DEFAULT_LOAD.loadSnapShare` in `scripts/panel-run.mjs:63`.** It is `null` today and carries the comment *"Isolated on purpose: R1-SNAPS re-points THIS ONE FUNCTION at nflverse/snaps/<year>.json"*. R1-SNAPS is this slice. Someone built the switch in advance; an earlier draft of this file planned the wiring inside `lib/panel.mjs` instead and never mentioned it. **`loadSnapShare: null` is also the "ships disabled" default**, so the gate in this section has a real home rather than a flag this file would have had to invent.

**Snaps are read at four places, not one.** Re-pointing only the first is the failure this slice exists to prevent:

| site | what it feeds |
|---|---|
| `lib/panel.mjs:181` `computeSnapShare` | the row's own `snapShare`; `null` drops the row as `missingSnap` (`:282-283`) |
| `lib/panel.mjs:915-917` | the per-position **cohort pool**, gated on `off_snp >= 100 && tm_off_snp > 0` |
| `lib/panel.mjs:1135-1136` `attachFactorMultipliers` | `sentinelHit.snapShare` and the reconstructed multiplier |
| `lib/backtest.mjs:291-292` | the backtest's own read of the same keys |

**The silent-neutral path, stated so it cannot be rediscovered later.** Widen `computeSnapShare` alone and pre-2020 rows enter `buildPanelRow` while the cohort pool for those seasons stays empty. `reconstructSnapShareFactor` then hits `pool.length > 0 ? percentileRank(pool, raw) : 50` (`lib/projectionFactors.mjs:256`) and returns a **neutral multiplier that looks computed**, with `sentinelHit.snapShare` true and no error anywhere. That is the same defect class as the draft-capital and college windows this arc was created to close. **Every one of the four sites must take its snaps from the same resolved source, or none of them may.**

**The gate.** On 2020–2024 both sources exist. Compute Pearson r and mean absolute difference of snap share per position across that overlap and report both in the hand-back. **If r < 0.95 the sources are not interchangeable, `loadSnapShare` stays `null`, and the family is banked capture-only.** Do not enable on the strength of the ingest working.

**The enable path is three edits, not one, and none may be done early.** When the gate passes: point `loadSnapShare` at the new family; flip `PANEL_DEFAULTS.fromYear` from 2020 to 2013 (`lib/panel.mjs:21`, whose in-source note already says *"flip fromYear→2013 post-R1-SNAPS"*); and revisit the pre-2020-is-undroppable assertions at `lib/backtest.mjs:290` and `bin/backtest.mjs:119`. A passing cross-validation with only the first edit leaves the widening half-applied.

---

### E. Invariant 8 — the purge wiring is not optional

The workflow bullet in §A is not enough on its own. A season-keyed family delegating to `_ingest.yml` must pass `season-keyed: true` and `purge-path: nflverse/snaps/<season>.json`, **and** the script must call `d.setStepOutput('season', seasons[0])` in single-season mode the way `scripts/update-gamelogs.mjs:103` does. Without that step output the season-keyed purge is skipped with a WARN and stale CDN copies serve indefinitely — a warning in a log nobody reads, not a failure. Verify the purge fired on the first real run and say so in the hand-back.

---

## Cross-repo impact

`lib/panel.mjs` is a near-side `Triggers` entry for **four** entries — CR-02, CR-07, CR-11 and CR-15. The first draft of this file quoted none of them. Two carry real obligations here.

### CR-15 · R3-FIT factor-multiplier mirror — the consequential one (`Direction: app→data`)

> **Mirror:** Re-mirror the changed constant/gate/branch and **re-fit before any further exponent activation** — otherwise the fit reconstructs a factor the app no longer produces and the committed verdict in `.claude/tasks/r3fit-exponent-harness.md` stops transporting. Which positions a factor is gated to is itself part of the mirror. Note the known parity gap: `shareTrend` and `teamRzShare` have no end-to-end app-ground-truth check until a post-2026-07-18 snapshot is imported. **Nothing app-side fails when this drifts.** Scope note, verified by grep so it need not be re-derived: `dynastyScore.js` is named in `lib/projectionFactors.mjs:110` only as a *contrast* (its `weightedLinearRegression` copy is unfloored where the mirrored one floors the denominator at 4) — it is **not** mirrored and is deliberately not a trigger.

**This is why the fallback ships disabled.** Enabling a snap source the app has no counterpart for makes the fit reconstruct a factor the app does not produce, for exactly the pre-2020 rows this slice adds. The entry's own text says nothing app-side fails when this drifts. So: while `loadSnapShare` stays `null`, nothing is due. **The moment it is re-pointed, a re-fit is required before any further exponent activation**, and that is part of the enable path in §D, not a follow-up.

### CR-11 · Snap & red-zone usage stat keys (`Direction: data→app`)

> **Mirror:** Do not remove, rename or filter these keys. **The projection degrades silently to neutral when they are absent** — no error, no test failure, no visible symptom. The blast radius is wider than the projection: `durabilitySignals` mis-classifies contributor seasons, `teamContext`'s RZ denominators go to zero (so `teamRzShare` sentinels out), the Outlook snap% column empties, and — since dp-v2 Slice 5b — Market's Efficiency `SNAP%`/`RZ SH` columns go blank the same way, and the data repo's own panel/backtest reconstructions drift the same way. The dependency is invisible at runtime; this registry entry is the only thing recording it.

Read, not changed. This slice adds a second *source* for snap share and touches none of CR-11's keys in `nfl/season-totals`. Record that conclusion — the entry exists precisely because this dependency is invisible at runtime, and "we added a parallel source and left your keys alone" is the thing a future reader needs to know.

### CR-18 · Signal registry rows (`Direction: data→app`)

> **Mirror:** This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

A brand-new ingested family is this entry's central case. Emit the `docs/signal-registry.md` row edit as hand-back output: raw ingested data · source nflverse `snap_counts` (PFR) · coverage 2012+ · reconstructable · current use unused/candidate. Update `data-catalog.md` in the same change.

**Near-side maintenance this change creates, in the same commit:** `scripts/update-snaps.mjs`, the new parser and aggregator in `lib/nflverse.mjs`, and `MIN_SNAPS_SEASON` all belong in CR-18's data-side `Triggers`, which enumerates the coverage-floor constants explicitly. Adding the family without adding its triggers is how the list goes stale.

**`[registry-stale]` — report, do not fix.** CR-18's data-side list omits `scripts/update-playerstats.mjs`, the live owner of the `stats_player_week_<year>.csv` upstream asset for two families. This is the second slice to hit it; D2 reported the same thing. Flag it again rather than editing the registry.

### CR-02 and CR-07 — touched only as readers

Both name `lib/panel.mjs`. This slice changes neither the season-totals row composition nor the advstats served shape, so no Mirror is due. State that rather than leaving them unmentioned.

### No new coupling yet

No app reader in this arc, so no new `CR-NN`. When the app reads the family, that is a parent-folder session taking the next free number — **not CR-22, which D1b's plan already claims**.

### CR-10 is referenced, not touched

The never-average-a-stored-rate rule shapes `offPct` in §B. No new rate contract, so no Mirror.

## Docs/README updates

- **`data-catalog.md`** — new family row: source, coverage 2012+, REG-only grain, the team-snap max derivation from finding 4, the gates with their measured values, and the `byPfr` bucket.
- **`README.md`** — the served-shape section for the new family, and the Analysis/Backtesting note on panel width: state the panel is still 2020+ until the cross-validation passes, so nobody reads the ingest as a widening.
- **`.github/workflows/`** — the new workflow needs its README table row. It **should** delegate to `_ingest.yml`; only add it to the standalone list if it genuinely cannot, with the reason.
- **`CLAUDE.md`** — Invariant 8's family list needs `nflverse/snaps` added, since the purge rules are enumerated per family there.

## Tests to add

`test/update-snaps.test.mjs`:

1. A fixture CSV produces the served shape, with `offPct` computed from sums.
2. Postseason rows are excluded — a fixture with a `POST` row must not change any total.
3. The team-snap derivation takes the max across a team's players in a game, not the sum and not the mean.
4. An unmatched `pfr_player_id` lands in `byPfr` and increments `unmatchedCount`, and does not appear in `players`.
5. Team codes pass through unchanged: a 2016 fixture carrying `SD` stays `SD`, and nothing remaps it. This is finding 3's regression test.

`test/panel.test.mjs`: the fallback selects nflverse only when Sleeper's value is absent, and `snapSource` records which source fed the row in both directions.

6. Traded players: a fixture where one player appears for two teams produces `traded: true`, `teams[]` ordered by snaps, and **week-restricted** denominators — each stint's `offPct` uses only that stint's team games, not the season's.
7. Per-year team-code assertions in `validateSnaps`, covering all three boundary pairs (2015/2016, 2016/2017, 2019/2020), in `validateTeamContext`'s style.

Gate tests in `lib/validate.mjs`'s style: a join rate under 0.85 throws; a season before `MIN_SNAPS_SEASON` is rejected. **For `MIN_SNAPS_ROWS`, assert whichever behaviour §C settles on** — the spine logs and continues rather than throwing, so a test asserting a throw contradicts the code unless a second floor is added deliberately.

`lib/args.mjs`: `snaps --all --year 2016` is rejected as a conflict once `'snaps'` is on `ALL_SUBCOMMANDS`. The regression test for §C's third bullet.

## Risks

- **The cross-validation is the real gate, and it can fail.** If r < 0.95 the slice still succeeds: the family is banked, the panel is unchanged, and the finding is that the two sources measure different things. Write that outcome up rather than treating it as a failed slice.
- **Backfilling fourteen seasons is a lot of committed data.** Measure the served size for one season before running `--all`, and report it. If it is large, minify as `update-nfl.mjs` and the D2 crosswalk already do.
- **The join rate is measured at 2016 and 2022 only, both after 2015.** The crosswalk is bounded by Sleeper's player universe, so coverage against 2012–2015 can only be worse, by an unmeasured amount. If a floor season trips the 0.85 throw partway through `--all`, earlier seasons are already written and committed. **That is the expected shape of the failure, not a corrupt state** — report which seasons landed and do not roll back.
- **Do not re-derive a completed season in place** without a named Invariant-1 exception. This is a new family, so the first write of each season is an addition, not a re-derivation — but a second pass over an already-written season is not.
