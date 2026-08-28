# Store audit — 2026-08-25

Point-in-time review of this repo: are the derivations correct, is the pipeline efficient, and
what is quietly not landing. **Read-only** — every figure below was re-derived from the working
tree with throwaway scripts, plus five live HEAD/GET requests to nflverse, KeepTradeCut and
GitHub to confirm upstream availability. Nothing in the repository was modified to produce it.

**Working-tree state at audit time.** The audit ran against the tree at commit `da0bda4`
**plus uncommitted in-flight work** — a then-partial weekly Action for `nfl/season-totals`
(`.github/workflows/nfl-season-totals.yml`, plus changes to `scripts/update-nfl.mjs`,
`bin/update.mjs`, `lib/validate.mjs` and two test files). *That work has since landed as
`697ae73` + `f788832`; see the [Addendum](#addendum--2026-08-28).* It is unrelated to every
finding below and invalidates none of them: the `lib/validate.mjs` change is scoped to
`validateNflSeason` and does not touch `validateAdvStats` (C2), and the `bin/update.mjs` change
is help text only, so the unvalidated `--year` in C6 is still live. Two figures below are
tree-state figures rather than `da0bda4` figures and are marked as such.

Worth recording what that work closes, since this audit does not list it as a finding: until it
landed, `nfl/season-totals` — the canonical outcome store the app reads and grading joins
against — was the only served family with **no scheduled refresh at all**, and the dead-man
could not see the gap because there was no workflow for it to check.

Unlike [data-catalog.md](data-catalog.md) and [README.md](README.md), this file is **not a
living document** — it is a dated snapshot of findings. Items resolved here should be struck
in the queue at the bottom, not silently deleted, so the record of what was found stays intact.

| | |
|---|---|
| HEAD | `da0bda4` + uncommitted in-flight work (see below) |
| Unit tests | 509 / 509 pass, 1.28 s *(working tree — includes ~190 lines of in-flight tests)* |
| Source | 11,571 LOC across `lib/` + `scripts/` + `bin/` |
| Tracked tree | 511 MB |
| Manifest | 188 entries |
| Findings | 8 correctness · 8 efficiency · 3 structure |

---

## Summary

The engineering here is disciplined: honest nulls, content-hash dedup, fail-loud header guards,
training-only standardisation inside the CV folds, a Spearman ordering guard with a quarantine
path, and a dead-man detector that auto-discovers its own expected-job set. The tests pass in
1.3 seconds and the ingest scripts are fast. The findings below are not about a shaky
foundation — they cluster in three places:

1. **One upstream grain leaks in unlabelled** (C1) — and one upstream season is silently
   corrupt (C2).
2. **A monitoring blind spot between "the job ran" and "data landed"** — which is how C7
   happened and how C5 persisted.
3. **A lot of dead weight nobody has taken out** (E1, E2, E4).

---

## What checks out

Stated first because it bounds what the findings mean. These were re-derived independently,
not taken on trust.

- **Team-context scores are exact.** Cross-checked **7,658** team-games (2012–2025) against
  `nflverse/schedule`: **zero** mismatches on `off.pointsScored`. The "last row of the game in
  CSV order holds the final score" assumption in `aggregateTeamContext` holds across all 14
  seasons.
- **Derived rates land where the physics says they must.** PROE median −0.018…+0.015 by season
  (must be ≈0 — `xpass` is league-calibrated); EPA/play median ≈0; success rate .414–.453;
  RZ trips/game 2.97–3.44. Team-game counts are exactly `games × 2` in every season
  (534 for 2012–2019, 570 for 2021+).
- **Manifest and disk agree.** 188 entries, 0 dangling. One unregistered file on disk —
  `ktc/last-checked.json` — which is a run marker and correctly excluded by design.
- **Schedule integrity.** 28 seasons 1999–2026, no duplicate `gameId` anywhere, game-type
  composition correct per era (248 REG + 11 playoff in 1999; 272 + 13 in 2025).
- **The KTC 500-row cap is not truncating.** The scraper stops at page 9 (10 × 50). Pages 10
  and 11 fetched live return **0** rows each. *Caveat:* page 9 returns a full 50, so the
  "partial page" stop condition never fires and only the hard bound `page <= 9` ends the loop.
  If KTC ever ranks past 500, the snapshot silently shortens with no signal.
- **The gamelogs↔season-totals PPR gap is entirely the interception rule.** Every QB delta
  equals their INT count exactly (Josh Allen 2023: 18 INT → 18.0 pts; Mahomes: 14 → 14.0).
  nflverse scores −2, Sleeper −1. Already documented at `README.md:567` and CR-14.
- **Ingest is fast** — see E8, which argues *against* optimising it.

---

## Correctness

Ranked by how much each can move a number something downstream believes.

### C1 · advstats silently mixes regular season and postseason — **defect**

`aggregateAdvReceiving` (`lib/nflverse.mjs`) never reads `season_type`. It sums every row in
`stats_player_week_<year>.csv`, playoffs included. The tell is in the served data:
`components.weeks` reaches **19 in 2016 and 21 in 2024** — three playoff games past a
regular-season maximum of 18.

Postseason volume folded into the season components:

| Season | Rows affected | Median inflation | Max |
|---|---|---|---|
| 2022 | 118 / 521 (23%) | +12.2% | +500% |
| 2023 | 122 / 491 (25%) | +12.5% | +60% |
| 2024 | 119 / 507 (23%) | +11.8% | +400% |

2024 examples — REG targets vs. served `components.targets`:

| Player | REG | POST | Effect |
|---|---|---|---|
| Tyler Higbee | 12 | +15 | targetShare .172 → **.138** REG-only |
| Marquise Brown | 15 | +13 | targetShare .175 |
| A.J. Brown | — | — | targetShare .326 → **.343** REG-only |

**Be precise about the blast radius.** I recomputed the shares REG-only and the *ratios* barely
move — median |Δ| of **0.0032** across the 137 playoff-team rows in 2024, because postseason
enters numerator and denominator together. The recomputation reproduced the served values
exactly (.172 = .172), confirming the model. The damage is elsewhere:

1. The served `components` block (`targets`, `airYards`, `recYards`, `receptions`, `weeks`) is
   REG+POST, while its join partner `nfl/season-totals` is REG-only by construction —
   `fetchSeasonWeeks` requests `season_type=regular`, weeks 1–18.
2. `lib/backtest.mjs` `buildCohortRows` puts an advstats predictor and a season-totals-derived
   control (`overallShare`, collinear at r = 0.87) into the same regression. The residual
   between two nominally-equivalent measures is therefore partly playoff contamination — which
   is by construction correlated with team quality, which is correlated with the outcome.
3. Individual rows move materially (Higbee −20% relative).

None of this is documented. `gamelogs` and `teamcontext` both carry `seasonType` per row, and
the docs say "after the consumer's seasonType filter"; the advstats catalog row says only
*"Grain: player-season (WR/TE/RB)"* and gives the consumer no way to separate the two.

**Fix.** Cheapest honest version: split `components` into `reg`/`post` sub-objects, leave the
ratios as they are, document it in `data-catalog.md`. If the served shape shouldn't move yet,
the one-line version is documenting the grain — an undocumented mismatch is worse than a
documented one. Note this is CR-11's served shape; a `components` change needs the mirror.

### C2 · 2016 air yards are upstream-broken, and no guard catches it — **defect**

Air yards per target is stable at 7.8–8.9 in every season of the archive except one. 2016 is
at **3.96** — roughly half. Two independent ingest paths agree, so it is upstream data, not a
parser bug.

Σ receiving air yards ÷ Σ targets, by season:

| Source | 2012 | 2015 | **2016** | 2017 | 2024 |
|---|---|---|---|---|---|
| advstats | 9.07 | 8.53 | **3.96** | 8.42 | 7.80 |
| gamelogs (REG only) | 8.86 | 8.41 | **3.90** | 8.36 | 7.74 |

Null `airYardsShare` count is 26–55 in every season — and **104 in 2016**.

So `airYardsShare`, `wopr` and `racr` for 2016 are not comparable to any other season, and
`wopr` is precisely what `bin/backtest.mjs` exists to grade. `validateAdvStats`
(`lib/validate.mjs:429`) checks three things: row count, the >50%-all-null drift guard, and
`targetShare ∈ [0,1]`. Nothing distributional, and `airYardsShare` has no bound in either
direction.

This is currently out of reach — the default panel is 2020–2024 because the `snapShare` control
listwise-drops pre-2020 rows. **That is exactly why it matters now:** closing the `off_snp`
2012–2019 hole is already on the roadmap (PFR snap counts via the `pfr_id` already present in
the DynastyProcess crosswalk), and the day that lands, the panel widens straight onto a corrupt
2016.

**Fix — before the panel widens, not after.** Add a per-season plausibility gate to
`validateAdvStats`: assert Σ`airYards` ÷ Σ`targets` falls in roughly [6, 11], and bound
`|airYardsShare| ≤ 1`. Then decide explicitly whether 2016 ships with a flag or is excluded
from analysis — the repo's doctrine is that gaps stay honest and documented.

### C3 · `airYardsShare` weights by squared magnitude — **defect**

`lib/nflverse.mjs` builds the share as a volume-weighted average of per-team shares:
`airNumer += (a_t / d_t) * a_t`, divided by the season total. For a single-team player that
reduces to `a / d` — correct. For a traded player it is `Σ aₜ²/dₜ ÷ Σ aₜ`: the numerator is
sign-blind (a negative team split contributes *positively*) while the denominator is signed.
The only guard is `p.recAirYards !== 0`.

Served rows where the season air-yard total cannot support the share:

| Player | Teams | Season air yards | Emitted |
|---|---|---|---|
| James Robinson 2022 | JAX→NYJ | **1** | airYardsShare .102, wopr .133 |
| Orleans Darkwa 2014 | MIA→NYG | **1** | airYardsShare .057 |
| Eric Tomlinson 2020 | BAL→NYG | 34 | airYardsShare .134 |
| Mark Ingram 2021 | NO→HOU | −1 | airYardsShare −.465 |

A player with +50 and −50 on two teams divides by ≈0 and the share explodes with nothing to
stop it. The negative-emission decision for RBs is deliberate and documented; the squaring is
not — it is an artefact of reusing the `targetShare` weighting on a signed quantity.

**Fix.** Weight by `|airYards|` (or by targets, which is what the volume actually is) and add a
magnitude floor: null the share when `|recAirYards|` is below ~25 — the same reasoning as
`MIN_POOLED_GAMES` nulling a noisy rate rather than emitting it. Affects ~2% of rows, all
multi-team.

### C4 · 25 non-additive stat keys are summed across weeks — **hazard**

`aggregateWeeks` (`lib/sleeper.mjs`) sums every key it finds:
`p.stats[key] = (p.stats[key] ?? 0) + val`. Sleeper's weekly payload contains rates, ratings,
ranks and "longest" values, and they all get added up.

Real served values from `nfl/season-totals/2024.json`:

| Key | Value | Note |
|---|---|---|
| `cmp_pct` | **1078.96** | 17-game QB — 17 weekly percentages, added |
| `pos_rank_half_ppr` | **2147** | sum of weekly positional ranks; present on 2,221 rows |
| `rec_lng` / `rush_lng` / `pass_td_lng` | summed | "longest" — should be max; on 473 / 321 / 63 rows |
| `fgm_pct`, `pass_rtg`, `rush_ypa`, `kr_ypa`, … | 25 keys total | 0.20 MB per season, minified |

The trap is half-known: `data-catalog.md` flags `pass_rtg` and `cmp_pct` as "weekly sums, never
season-valid", and the read side is defended by `RATE_KEYS` in `lib/fantasyPoints.mjs`, which
the in-basis grader strips before the dot product. But `RATE_KEYS` lists 18 keys and **misses
all nine `*_lng` keys**. Checked against the live league: none of its 53 scoring keys is in the
summed set, so today's practical exposure is display and analysis, not scoring.

**Fix.** Two independent moves. Small and safe: extend `RATE_KEYS` to the `_lng` family so the
defensive guard is complete. Larger: F-24 set the precedent for dropping keys no reader
consumes — these 25 are a better candidate than `idp_*` ever was, since they are not merely
unused but arithmetically wrong.

### C5 · 38 manifest entries have no `lastModified` — **defect**

Invariant 3 requires `recordCount`, `schemaVersion`, `lastModified` and `inProgress` on every
registered file. Thirty-eight entries have no `lastModified` at all: the 14 `raw/*` files and
**24 app-consumed `college/*` files (2017–2024)**. They predate `updateManifestEntry` and came
straight from the original IndexedDB export.

That is not cosmetic. In the app, `src/api/cfbd.js:48` decides freshness with
`new Date(entry.lastModified).getTime() > new Date(record.sourceLastModified).getTime()`. With
`undefined` that is `NaN > x` → **false**, so a cached college season is treated as fresh
forever and can never be refetched. (`sleeperStats.js:128` degrades safely by falling back to
live Sleeper; the CFBD path has no live fallback.)

`college/*` manifest state:

| Years | inProgress | lastModified |
|---|---|---|
| 2017–2023 | false | **missing** |
| 2024 | **true** | **missing** |
| 2025 | false | 2026-06-27 |

Second defect on the same rows: `college/{passing,receiving,rushing}/2024.json` are still
`inProgress: true` — a completed season flagged re-exportable — while the complete 2025 files
sit correctly at `false`.

**Fix.** Backfill `lastModified` on all 38 (each file's git commit date is the honest value),
flip the three 2024 college entries to `inProgress: false`, and add the assertion to the test
suite so it cannot recur — see [Monitoring](#monitoring-liveness-vs-landing).

### C6 · A malformed `--year` exits 0 having done nothing — **defect**

`bin/update.mjs:62` does `parseInt(yearRaw, 10)` with no validation, and `option()` returns
whatever token follows the flag. Verified live:

```
$ node bin/update.mjs advstats --year 202x --dry-run
[advstats] year=202 | currentSeason=2026
[advstats] Fetching stats_player_week_202.csv…
[advstats] year=202 not published yet — skipping
→ exit 0
```

A typo silently becomes a successful no-op. `--year` with no value at all yields `null`, which
every updater reads as "current season" — so a malformed backfill quietly retargets today
instead of erroring. In a shell loop over seasons that is invisible.

**Fix.** Three lines in the dispatcher: reject a `--year` that is not four digits in
[1999, currentSeason + 1], and reject a value beginning with `--`.

### C7 · `nflverse/oline/2025.json` is missing, and the catalog says it isn't — **gap**

`data-catalog.md` records the family's coverage as **"2025 → present"**. On disk there is one
file: 2026. The upstream asset exists and is clean:

```
$ node bin/update.mjs oline --year 2025 --dry-run
[oline] Derived 14368 ol rows across 1056 states for season 2025
[oline] Validation passed
[oline] [dry-run] would write nflverse/oline/2025.json: 14368 ol rows, 32 teams, 1056 states
```

The Saturday Action landed 2026-07-22 and has run every week since, but `bin/update.mjs oline`
with no `--year` only ever writes the current season. The `--all` backfill was never run, and
nothing checks. The dead-man sees a green workflow every Saturday, because a green workflow is
all it is designed to see.

**Fix.** `node bin/update.mjs oline --year 2025`, then the coverage assertion below so the next
one surfaces on its own.

### C8 · Four documentation drifts, two inside the review gate — **drift**

The registry is, by this repo's own rule, the *sole authority* the plan-reviewer subagent reads.
A stale line there is not a typo — it is a wrong answer given to every future plan review.

| Location | Claim | Reality |
|---|---|---|
| `README.md:1184` (CR-09 Mirror) | "2019 is absent upstream (known gap; degrades to the empty shape)" | False — `nflverse/gamelogs/2019.json` is on disk with 4,073 targeted REG rows and registered; B1 filled it on 2026-07-03 |
| `data-catalog.md:224` | "`raw/` — … no manifest entries" | False — the manifest holds 14 `raw/*` entries |
| `CLAUDE.md` | two invariants numbered **8** | CDN purge URLs, and grading-never-recomputed |
| `CLAUDE.md:247` (data) and `CLAUDE.md:227` (app) | "the entry-format definition and **all 18** `CR-NN` entries" | False as of 2026-08-26 — both registries hold **21**. CR-19, CR-20 and CR-21 landed without updating the count |

The fourth is the same class as the first and lands in the same sentence that tells the
plan-reviewer subagent what to treat as the complete registry — an undercount there is an
instruction to ignore three live contracts. It is present in **both** repos and must be fixed
in both, in one change.

**Fix.** Correct the CR-09 Mirror text first (it is the one that can cause a bad decision), fix
the `raw/` line, renumber the invariant, correct the 18 → 21 count in both repos. The catalog's "Last reconciled against manifest.json"
header is worth treating as a claim the reconcile script should be able to verify.

---

## Efficiency

Measured, not estimated — including the one that turns out not to be worth doing.

### E1 · 208 MB of `raw/` has no reader in either repo — **waste**

`raw/` is 216 MB of a 511 MB tracked tree — **42%**. Exactly one file in it is ever read:
`raw/-players-nfl.json` (18 MB), by `scripts/update-enrichment.mjs:50,89` for playerId
existence checks.

| Contents | Files | Size | Readers |
|---|---|---|---|
| `cfbd-players-2017…2024` | 8 | **208 MB** | none |
| `-players-nfl.json` | 1 | 18 MB | `enrich validate` — frozen at 2026-05-18 |
| `-league-…`, `-state-nfl` | 5 | 24 KB | none |

Two consequences. The obvious one: 41% of every clone, every Actions checkout and every future
push carries files nothing opens. The quieter one: the player map that *is* read is a 15-month-old
snapshot, so `enrich validate` flags every player added since as an orphan.

**Fix.** Delete the eight CFBD manifests and their manifest entries — they are non-served
artefacts by the catalog's own classification, so Invariant 1 does not cover them. Then either
refresh `-players-nfl.json` on a cadence, or point the enrichment validator at
`nfl/players-state/<latest>.json`, which is captured weekly and already contains what the check
needs.

### E2 · The college family is stored in long form and costs 6× what it should — **shape**

`college/receiving/2024.json` is 20,435 rows describing 4,087 players. Every row repeats
`season`, `playerId`, `player`, `position`, `team`, `conference` and `category` to carry one
`statType`/`stat` pair — and `stat` is a *string*. Pivoted to one record per player:

| Form | Raw | Gzipped | Records |
|---|---|---|---|
| long (today) | 4.78 MB | 0.52 MB | 20,435 rows |
| pivoted | **0.66 MB** | **0.13 MB** | 4,087 players |
| reduction | **−86%** | **−75%** | ~70 MB → ~10 MB family-wide |

The app already pivots this client-side (`pivotStatRows`), so the work is being done twice and
the wire is carrying the un-pivoted form for no one's benefit. This is the only place in the
repo where a shape change buys a real over-the-wire win rather than a disk win.

**Fix.** Not a quick one: `statType` keys are a cross-repo contract, so it needs a
`schemaVersion` bump, an app mirror, and a one-shot historical rewrite — F-24 is the precedent
for all three. Worth queueing behind the correctness items and doing when CFBD is next touched
anyway.

### E3 · Every scheduled run checks out the whole 511 MB tree to write one file — **ci**

Twelve workflows, twelve plain `actions/checkout@v4`, no `sparse-checkout` and no `fetch-depth`
tuning. About 16 scheduled runs a week each materialise the entire working tree — including the
208 MB from E1 — in order to write a single season file.

A cone of `lib scripts bin manifest.json package*.json` plus the one family directory the job
touches covers everything each run actually needs: the content-hash dedup reads the existing
target file, and the commit step's `git add nflverse/` stays inside the cone. Compounds with
E1 — fixing E1 alone already removes 41% of the checkout.

### E4 · `.git` has never been packed — **git**

```
$ git count-objects -vH
count: 1631    size: 88.34 MiB
in-pack: 0     packs: 0     size-pack: 0 bytes
```

128 commits, all loose objects. Weekly full-file rewrites of an 8 MB gamelogs season are the
textbook case for delta compression, and none of it has happened yet. `git gc --aggressive` is
the entire fix; run it when no Action is mid-push.

### E5 · advstats and gamelogs fetch the same CSV on different days — **coherence**

Both call `fetchPlayerStatsCsv(year)` for `stats_player_week_<year>.csv` (8.5 MB). advstats runs
Thursday 13:41 UTC; gamelogs runs Saturday 13:47 UTC. That is two downloads, two parses, two
full checkouts and two CDN purges of one upstream file.

The sharper point is not the duplicated work — it is that the two families can be derived from
**different upstream revisions** of the same file within a single week. nflverse re-publishes; a
Friday correction lands in gamelogs and not in advstats. Anything joining them across that seam
(`lib/panel.mjs` resolves position from advstats while the app reads gamelogs for the same
players) silently sees a split-brain week. One job emitting both keeps them atomic and halves
the cost.

### E6 · Minifying the rest of the store is a disk win, not a bandwidth win — **don't**

Everything except `nfl/season-totals` is 2-space pretty-printed, and F-24 set the precedent for
minifying. It looks like an obvious extension. It mostly is not — gzip already removes almost
all of the whitespace:

| Measure | Before | After | Δ |
|---|---|---|---|
| All served families, on disk | 237.4 MB | 164.3 MB | **−31%** |
| All served families, gzipped | 18.9 MB | 17.2 MB | −9% |
| `JSON.parse`, gamelogs 2024 | 19.1 ms | 16.6 ms | −13% |

Worth doing as part of the repo-weight cleanup alongside E1 and E4. Not worth doing as a
performance change, and not worth the churn on its own — the honest ranking is low.

### E7 · The 14-season team page ships 13.4 MB to compute 19 numbers per team-season — **payload**

`useTeamHistoryLoader` fetches all fourteen `nflverse/teamcontext/<year>.json` files — 13.4 MB
pretty, ~1.4 MB gzipped, fourteen round trips. `environment.js` then reduces each one with
`sumRegOff` / `sumRegDef` to **17 offence sums and 2 defence sums per team-season** and discards
the rest.

A precomputed season-summary pack — 32 teams × 14 seasons × 19 numbers ≈ 120 KB in a single
file — is roughly a **100× reduction** on that route, and the derivation belongs in this repo,
where every other derivation lives. It is additive: the week grain stays, because other surfaces
need it.

**Process note.** This introduces a cross-repo coupling the registry does not list, which by
CLAUDE.md's workflow convention is the one case that routes to the Claude.ai project for a draft
registry entry before it becomes a plan.

### E8 · Ingest is not a bottleneck — don't optimise the parsers — **verified**

I expected the pbp path to be slow: a 19.4 MB gzip expanding to ~150 MB of CSV, 372 columns,
parsed character-by-character by a hand-written quote-aware splitter. It is not.

| Run | Wall | Peak RSS |
|---|---|---|
| `teamcontext --year 2024` (pbp → 570 team-game rows) | **2.89 s** | 420 MB |
| `gamelogs --year 2024` | **1.07 s** | 239 MB |
| `advstats --year 2024` | **0.83 s** | 138 MB |
| `node bin/panel.mjs` (full E-0a) | **1.39 s** | — |
| `node --test` (509 tests, working tree) | **1.28 s** | — |

`splitCsvLine` costs ~0.8 s per pbp-scale season in a micro-benchmark, and V8's no-match fast
path means the `\r\n` normalisation does not copy the 150 MB string at all. Early-exiting the
splitter at the last needed column would cut that 0.8 s to 0.15 s — i.e. save about half a
second, once a week. Leave it alone; the clarity is worth more than the milliseconds.

---

## Monitoring: liveness vs. landing

The dead-man detector is genuinely good — it auto-discovers its expected-job set from the
workflow files themselves, so there is no second registry to forget. And it works: the KTC
record shows two 14-day gaps (2026-05-18 → 06-01 → 06-15) that stop dead once
`cron-deadman.yml` landed on 2026-07-21. Weekly ever since.

But it proves *liveness* — the job ran and went green — and nothing proves *landing*. Every
updater exits 0 on a 404 ("not published yet — skipping"), on a sparsity-gate skip, and on a
hash-dedup no-op. A family can be green for months while writing nothing at all. That is
precisely how oline 2025 went missing under a workflow that has run flawlessly every Saturday
since July.

The right check already exists in the repo — the `node -e` catalog-vs-manifest reconcile snippet
in `data-catalog.md`. It just is not wired into anything. Promoting it to a test in
`test/manifest.test.mjs` costs about thirty lines and catches C5 and C7 in one pass:

1. For each season-keyed family, every year in `[MIN_*_SEASON … currentSeason − 1]` has a
   manifest entry. → catches **C7** (oline 2025).
2. Every manifest entry carries `lastModified`, `schemaVersion`, `recordCount`, `inProgress`.
   → catches **C5** (38 missing `lastModified`).

---

## Duplication worth collapsing

Not urgent, and each carries regression risk against a suite that currently passes 509/509.
Listed by ratio of lines removed to risk taken.

### S1 · Thirteen near-identical content-hash functions — **low risk**

`playersHash` (×3), `teamsHash` (×2), `gamesHash`, `idsHash`, `nflHash`, `cfbdHash`,
`picksByYearHash`, `snapshotHash` — all `sha256(JSON.stringify(key-sorted))`. One
`stableHash(value, normalize?)` in `lib/io.mjs` covers every one; the two that genuinely differ
(playerstate strips the churning `newsUpdated`/`searchRank` fields, KTC sorts an array by name)
pass a normaliser rather than reimplementing the hash.

### S2 · Six season-keyed updaters repeat the same nine-step spine — **real risk**

`roster`, `advstats`, `schedule`, `gamelogs`, `teamcontext`, `oline` — about 800 lines — all run:
resolve seasons → fetch → parse → sparsity gate → validate → hash dedup → dry-run branch → force
gate → write + manifest + `setStepOutput`. A
`runSeasonKeyedIngest({ fetch, derive, validate, path, minRows, minSeason })` collapses that to
roughly 250.

The differences that matter are small and parameterisable — teamcontext *asserts* the season
rather than adopting it, gamelogs falls back to `parsed ?? season` — but they are exactly the
kind of detail a refactor flattens by accident. Worth doing; worth doing one family at a time
behind the existing tests.

### S3 · Eight scheduled workflows are ~95% identical — **low risk**

`diff .github/workflows/nflverse-advstats.yml .github/workflows/nflverse-gamelogs.yml` differs in
four things: name, cron, subcommand, purge path. About 400 lines of YAML that a `workflow_call`
reusable plus eight ~12-line callers would express in ~150.

The callers keep their own `on: schedule` block, so `check-crons.mjs`'s discovery
(`extractCrons` scanning `.github/workflows/*.yml` for `cron:` lines) keeps working unchanged —
worth verifying explicitly in the plan, since the dead-man's whole value rests on it.

---

## Queue

Ordered by value over effort. The first five are afternoons; the rest are slices.

| # | Item | Do | Why now | Effort |
|---|---|---|---|---|
| 1 | C7 | Run `oline --year 2025` | Closes a coverage hole the catalog already claims is closed | minutes |
| 2 | C5 | Backfill 38 `lastModified`; unflag college 2024 | An app cache that can never invalidate is a live bug | ~1 h |
| 3 | — | Promote the reconcile snippet to two tests | Makes C5 and C7 unable to recur; wires an existing check in | ~1 h |
| 4 | C8 | Fix CR-09, the `raw/` line, the duplicate invariant 8, the 18 → 21 count (both repos) | CR-09 and the entry count are authority for every future plan review | ~30 m |
| 5 | C6 | Validate `--year` in the dispatcher | Silent successful no-ops are the worst failure mode for a backfill | ~30 m |
| 6 | E1 + E4 | Delete 208 MB of unread `raw/`; `git gc` | Removes 41% of every clone and checkout; nothing reads it | ~1 h |
| 7 | C2 | Air-yards plausibility gate in `validateAdvStats` | Must land **before** the snap-count backfill widens the panel onto 2016 | ~2 h |
| 8 | C4 | Extend `RATE_KEYS` to the `_lng` family | Completes a guard that already exists and is incomplete | ~30 m |
| 9 | C3 | Re-weight `airYardsShare`; add a magnitude floor | ~2% of rows carry values the underlying volume cannot support | slice |
| 10 | C1 | Split `components` REG/POST, or document the grain | Undocumented grain mismatch across the store's main analysis join | slice |
| 11 | E5 | Merge advstats + gamelogs into one job | Halves the cost and removes a split-brain week | slice |
| 12 | E3 · S1 · S3 | Sparse checkout; shared `stableHash`; reusable workflow | Cheap, low-risk, compounding | slice |
| 13 | E2 · E7 | Pivot college; precomputed team-season pack | Biggest payload wins, but both need an app mirror | 2 slices |

---

## Addendum — 2026-08-28

State three days after the audit, re-verified against both trees. Recorded here rather than
edited into the findings above, so the dated snapshot stays intact.

**Landed since the audit (data repo).** The in-season season-totals work described in the
provenance note above is committed: `697ae73` (self-calibrating validator floor, preseason
no-op, season-close skip, weekly cron) and `f788832` (correcting the floor's
backwards-compatibility claim). `nfl/season-totals/2026.json` still does not exist, which is
correct — it is preseason and `hasNoData` no-ops. CR-20 landed at `199fa4d`.

**In flight (app repo).** §3 of `in-season-app-read.md` — `loadCurrentSeasonTotals`, the
`currentSeasonTotals` wiring in `App.jsx`, the `opponentStrength.js` row-map refactor, and a
CR-21 draft — is uncommitted in the app working tree.

**Registry mirror verified.** Both registries now hold CR-01…CR-21, and the mirrored region is
**byte-identical**, 228 lines, under the repo's own anchored check:

```sh
diff <(sed -n '/^<!-- CR-REGISTRY-BEGIN -->$/,/^<!-- CR-REGISTRY-END -->$/p' docs/cross-repo-registry.md) \
     <(sed -n '/^<!-- CR-REGISTRY-BEGIN -->$/,/^<!-- CR-REGISTRY-END -->$/p' ../sleeper-dashboard-data/README.md)
```

Use the anchored form. An unanchored range match (`awk '/CR-REGISTRY-BEGIN/,/CR-REGISTRY-END/'`)
sweeps in the *inline* backticked mentions of the sentinel and reports drift that is not there —
which is exactly what the mirrored region's own first bullet warns about. I made that mistake
before re-running it correctly.

**Findings status.**

| Finding | Status |
|---|---|
| C8a–c (CR-09 2019 line, `raw/` line, duplicate invariant 8) | **unchanged** — all three still present |
| C8d (18 → 21 count) | **new**, introduced by CR-19/20/21 landing |
| C5 (38 entries missing `lastModified`) | **unchanged** — still 38, and now more load-bearing: `loadCurrentSeasonTotals` makes permanent-TTL + `lastModified` compare the invalidation mechanism in a second loader. Season-totals entries all carry the field, so that loader is not hit; the 24 app-consumed `college/*` files still cannot invalidate |
| all others | not re-checked; no committed change touches them |

---

## Not covered

Scoped out of this pass, listed so the gaps are honest rather than implied-clean:
`lib/enrichment.mjs` (528 lines) and the enrichment CLI beyond confirming `validate` passes;
`bin/import-snapshot.mjs`; the R3-FIT exponent-fit path in `lib/panel.mjs`
(`fitExponents` / `attachFactorMultipliers` / `lib/projectionFactors.mjs`) beyond reading its
structure; and `scripts/grade-snapshot.mjs`'s snapshot adapter beyond the in-basis outcome
builder.
