# D4 — snap counts 2012–2019 (R1-SNAPS)

**Model:** sonnet implements this file exactly. **Status:** planned (opus, 2026-09-05). **Slice:** D4 of the stellar-data batch (`../analysis/data-stellar-batch-brief.md` Arc A). **Repo:** data only.
**Base:** `f23d8ae` on `main` (D2 merged). **Size:** the brief says one slice; that holds.
**Plan gate:** plan-reviewer has not run on this file yet.

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

**3. `eraTeam` must NOT be applied to this source, and the brief's "era-accurate, `eraTeam`" wording invites exactly that mistake.** `eraTeam` (`lib/nflverse.mjs:1080`) maps *modern* codes back to historical ones — `LA`→`STL` at ≤2015, `LAC`→`SD` at ≤2016, `LV`→`OAK` at ≤2019. This source is **already historically coded**: 2016 carries `LA`, `OAK` and `SD`; 2022 carries `LA`, `LAC` and `LV`. Feeding it through `eraTeam` is a no-op today, because none of its three rules matches an already-historical code, but writing the call implies the input is modern and the next person to touch it will reason from that. **Do not call `eraTeam` here.** Instead verify the codes agree with what the store already serves: compare the distinct team set for one backfilled season against that season's `nfl/season-totals` team codes, and fail loudly on a mismatch. Report the comparison in the hand-back.

**4. The team-snap derivation needs stating as an assumption, because it is one.** A team's offensive snaps for a game is taken as the **max** `offense_snaps` across that team's players in that game. Measured medians of 66–67 with a 41–100 range are consistent with real offensive play counts, so the assumption holds on this data. It is still an assumption — an offensive lineman who never leaves the field is what makes it true — so put it in the catalog and in the code comment, not just in this file.

---

## Design

### A. Ingest — new family, existing spine

- `scripts/update-snaps.mjs`, `bin/update.mjs snaps --year|--all`, `.github/workflows/nflverse-snaps.yml` (yearly, post-season). In-season weekly refresh is out of scope.
- Follow the season-keyed updater spine the other nflverse ingests use rather than inventing one. The audit's S2 item notes six updaters already share that shape; match it.
- Parser and aggregator go in `lib/nflverse.mjs` beside `aggregateAdvReceiving`, which is the closest existing analogue: same release, same REG-only rule, same season-grain output.
- **REG only.** Skip any row whose `game_type` is not `REG`, the same way `aggregateAdvReceiving` does. This is the C1 defect that was fixed in `e3b3399`; do not reintroduce it in a new family.

### B. Served shape — `nflverse/snaps/<year>.json`, `schemaVersion: 1`

`{ schemaVersion, season, rowCount, playerCount, unmatchedCount, players: { [sleeper_id]: { pfrId, position, team, games, offSnaps, teamOffSnaps, offPct } }, byPfr: { … } }`

- `offPct` is computed from the summed numerator and denominator, never by averaging a stored per-game rate. That is CR-10's rule and the reason `offense_pct` in the source is not carried through.
- Unmatched rows are kept under `byPfr`, keyed by `pfr_player_id`, with `unmatchedCount` in the envelope. Never drop silently — the same honest-null pattern advstats uses. At a 99% join rate this bucket is small, which is exactly why it must be visible rather than inferred from a row-count difference.

### C. Gates

`MIN_SNAPS_ROWS` per finding 2, measured and commented. `MIN_SNAPS_SEASON = 2012`. Join rate ≥ 0.85 over skill-position rows, which measured 0.99 and 0.999 — the gate is a floor against a broken crosswalk, not a target.

### D. Panel fallback — gated on evidence, not on landing

`lib/panel.mjs`'s snap-share feature falls back to this family when Sleeper's `off_snp` is absent for the season, recording `snapSource: 'sleeper' | 'nflverse'` per row so any grading run can tell which fed it.

**The fallback ships disabled until the cross-validation passes.** On 2020–2024 both sources exist. Compute Pearson r and mean absolute difference of snap share per position across that overlap and report both in the hand-back. **If r < 0.95 the two are not interchangeable, the fallback stays off, and the family is banked capture-only.** Do not enable it on the strength of the ingest working; the whole point of the number is that a plausible-looking series can still be measuring something else.

---

## Cross-repo impact

### CR-18 · Signal registry rows — touched, `Direction: data→app`

A new ingested family is precisely this entry's trigger. Emit the `docs/signal-registry.md` row edit as hand-back output: raw ingested data · source nflverse `snap_counts` (PFR) · coverage 2012+ · reconstructable · current use unused/candidate. Update `data-catalog.md` in the same change. This repo cannot edit the app's registry file; the emitted row is the deliverable.

### No new coupling yet

No app reader in this arc, so no new `CR-NN` is due. When the app reads the family, that is a new coupling from a parent-folder session, taking the next free number — **not CR-22, which D1b's plan already claims**. Name it in the hand-back rather than writing it anywhere.

### CR-10 is referenced, not touched

The never-average-a-stored-rate rule shapes `offPct` above. This slice creates no new rate contract, so no Mirror is due — but say so rather than leaving it unmentioned.

---

## Docs/README updates

- **`data-catalog.md`** — new family row: source, coverage 2012+, REG-only grain, the team-snap max derivation from finding 4, the gates with their measured values, and the `byPfr` bucket.
- **`README.md`** — the served-shape section for the new family, and the Analysis/Backtesting note on panel width: state the panel is still 2020+ until the cross-validation passes, so nobody reads the ingest as a widening.
- **`.github/workflows/`** — the new workflow needs its README table row and, if it cannot delegate to `_ingest.yml`, an entry in the standalone list with its reason.

## Tests to add

`test/update-snaps.test.mjs`:

1. A fixture CSV produces the served shape, with `offPct` computed from sums.
2. Postseason rows are excluded — a fixture with a `POST` row must not change any total.
3. The team-snap derivation takes the max across a team's players in a game, not the sum and not the mean.
4. An unmatched `pfr_player_id` lands in `byPfr` and increments `unmatchedCount`, and does not appear in `players`.
5. Team codes pass through unchanged: a 2016 fixture carrying `SD` stays `SD`, and nothing remaps it. This is finding 3's regression test.

`test/panel.test.mjs`: the fallback selects nflverse only when Sleeper's value is absent, and `snapSource` records which source fed the row in both directions.

Gate tests in `lib/validate.mjs`'s style: below `MIN_SNAPS_ROWS` throws; a season before `MIN_SNAPS_SEASON` is rejected; a join rate under 0.85 throws.

## Risks

- **The cross-validation is the real gate, and it can fail.** If r < 0.95 the slice still succeeds: the family is banked, the panel is unchanged, and the finding is that the two sources measure different things. Write that outcome up rather than treating it as a failed slice.
- **Backfilling fourteen seasons is a lot of committed data.** Measure the served size for one season before running `--all`, and report it. If it is large, minify as `update-nfl.mjs` and the D2 crosswalk already do.
- **Do not re-derive a completed season in place** without a named Invariant-1 exception. This is a new family, so the first write of each season is an addition, not a re-derivation — but a second pass over an already-written season is not.
