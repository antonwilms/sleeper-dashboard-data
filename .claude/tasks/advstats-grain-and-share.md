# advstats: separate REG from POST, and stop squaring the air-yards weight

**Type:** two correctness fixes in one aggregator + a full 14-season re-ingest.
**Served values change. Served shape changes. `schemaVersion` bumps. CDN purge required.**
**Session model:** plan (opus, this file). Implementation is a separate sonnet session — do not edit
source here.
**Source:** `store-audit-2026-08-25.md` C1 + C3, **both re-verified against live source and live data
2026-08-31** at HEAD `f05b6c9`. Every figure below is re-derived; §10 lists where the audit was wrong.

> **Merged deliberately.** C1 changes which *rows* reach the aggregator; C3 changes the *formula*
> applied to them. Both rewrite every served `nflverse/advstats/<year>.json`. Landing them separately
> means two full 14-season re-ingests and two CDN purges of the same 14 files, and the second would
> invalidate the first's verification baseline.

**Working-tree note.** `store-audit-2026-08-25.md` is modified and uncommitted. **Do not stage,
commit, revert or edit it.** Nothing here touches it.

---

## 1. Verified facts

### 1.1 · C1 — `aggregateAdvReceiving` never reads `season_type`

Live `lib/nflverse.mjs`: the header index block resolves `player_id`, `team`, `targets`, `season`,
`week`, `position`, `player_display_name`, `receiving_air_yards`, `receiving_yards`, `receptions`.
**`season_type` is not among them**, and no row filter exists. Every postseason row is summed.

The column is present and clean upstream — fetched and parsed with the repo's own `splitCsvLine`:

```
stats_player_week_2024.csv → season_type ∈ {REG: 18130, POST: 853}
  REG  weeks 1–18
  POST weeks 19–22
```

The served tell, all 14 seasons, `components.weeks` against the regular-season maximum:

| season | max weeks | reg max | rows over |
|---|---|---|---|
| 2012 | 20 | 17 | 24 |
| 2016 | 19 | 17 | 19 |
| 2021 | 21 | 18 | 16 |
| 2024 | 21 | 18 | 17 |
| 2025 | 21 | 18 | 26 |

**Every season is affected.** But `weeks > regMax` badly *undercounts* the blast radius — a player
with 10 regular weeks and 3 playoff weeks totals 13 and hides under the threshold.

### 1.2 · C1 measured properly — run the real aggregator twice

`aggregateAdvReceiving(fullCsv)` vs `aggregateAdvReceiving(regOnlyCsv)`, 2024:

| | |
|---|---|
| emitted rows | 513 → **511** |
| rows whose `components` change | **140 (27.3%)** |
| **rows that vanish entirely REG-only** | **2** |
| `targetShare` changed / median \|Δ\| | 125 / **0.004** |
| `airYardsShare` changed / median \|Δ\| | 130 / **0.004** |
| max \|Δ\| either ratio | 0.034 |

**Two things the audit missed.** The affected-row count is 27%, not 23%. And **2 rows exist only
because of the postseason** — players whose entire receiving season in this file is playoff games.
They are emitted today into a family whose documented grain is player-season and whose join partner
`nfl/season-totals` is REG-only by construction (`fetchSeasonWeeks` requests `season_type=regular`,
weeks 1–18). Those rows have no regular season to join to.

**The audit's central judgement survives and is confirmed: the ratios are nearly untouched
(median |Δ| 0.004) because postseason enters numerator and denominator together. The damage is in
`components` — the joinable volumes — not the shares.**

### 1.3 · C3 — the air-yards weight is squared and sign-blind

Live, the emit pass:

```js
airNumer += (pTeam.airYards / denomAir) * pTeam.airYards;      // aₜ² / dₜ
const airYardsShare = (airOk && p.recAirYards !== 0)
  ? Math.round(airNumer / p.recAirYards * 1000) / 1000 : null;  // ÷ Σaₜ
```

So `Σ(aₜ²/dₜ) ÷ Σaₜ`. Since `dₜ > 0` is guarded, **every numerator term is non-negative regardless of
`aₜ`'s sign, while the denominator is signed.** The only guard is `p.recAirYards !== 0`.

**Be precise about the failure mode — an earlier draft of this plan was not.** *Exact* cancellation
(`+50 / −50`, `Σaₜ = 0`) is already caught: `p.recAirYards !== 0` nulls it. The bug is ***near*
cancellation**, where the denominator survives the guard as a small non-zero number while the
numerator carries the full squared magnitude of both splits. That is exactly the live shape — Mark
Ingram 2021 at `Σaₜ = −1` and James Robinson 2022 at `Σaₜ = +1` (§1.4). A `+50 / −50` fixture tests
the null condition, **not** the explosion.

`targetShare` uses the identical weighting and is **fine** — targets are non-negative, so it is a
legitimate volume-weighted average. This is why the bug hid: it is a correct formula reused on a
signed quantity.

### 1.4 · C3's real population — the audit's "~2%" is wrong twice over

Scanning all **6,725** served rows for an implied team air-yards denominator (`airYards ÷ share`)
that is physically impossible **per week** — a team throws ~150–250 air yards a game:

**12 rows. 0.18%.** Not ~2%.

| season | player | airYards | share | weeks | implied AY/week |
|---|---|---|---|---|---|
| 2021 | Mark Ingram | −1 | **−0.465** | 14 | **0** |
| 2022 | James Robinson | 1 | **0.102** | 11 | **1** |
| 2014 | Orleans Darkwa | 1 | 0.057 | 8 | 2 |
| 2024 | Isaiah Williams | 15 | 0.101 | 8 | 19 |
| 2019 | Kenyan Drake | −41 | −0.133 | 14 | 22 |
| 2020 | Ty Johnson | 53 | 0.183 | 11 | 26 |

*(6 more between 38 and 57 AY/week.)*

> **A detector that does not normalise by weeks is useless here** and reports 275 rows (4.09%). Most
> are 1-week players, where a small implied denominator is entirely legitimate — one game's team air
> yards *is* ~100–250. The first cut of this audit made exactly that mistake.

And the multi-team population, measured on the 2022 CSV: **27 of 525 rows (5.1%) are multi-team**,
but **only 2 (0.38%) change under a corrected weight.** The artefact is invisible whenever all team
splits are positive, because `Σ(aₜ²/dₜ)/Σaₜ` and `Σ((aₜ/dₜ)|aₜ|)/Σ|aₜ|` coincide for `aₜ ≥ 0`.
**It bites only when a team split is negative** — which is why it reads as an exotic edge case and is
in fact a systematic sign error.

### 1.5 · The audit's proposed magnitude floor is a catastrophe — measured

The audit says *"add a magnitude floor: null the share when `|recAirYards|` is below ~25."*

| guard | 2022 rows nulled | 2024 rows nulled |
|---|---|---|
| **`|Σaₜ| < 25`** (the audit's) | **128 (26.7%)** | **130 (28.1%)** |
| `|Σaₜ| < 0.10·Σ|aₜ|` (cancellation-targeted) | 1 (0.21%) | 0 |

**The audit's floor would null more than a quarter of every season to fix twelve rows across
fourteen years** — because most low-air-yard players are single-team deep-bench players whose share
is small but perfectly correct. §2.2 rejects it.

### 1.6 · The corrected weight needs no floor at all

Under `Σ((aₜ/dₜ)·|aₜ|) ÷ Σ|aₜ|` the denominator is a sum of magnitudes: **it cannot cancel**, so the
explosion mechanism is gone by construction rather than by threshold. Measured:

| | 2022 | 2024 |
|---|---|---|
| current range | [−0.092, 0.476] | [−0.062, 0.508] |
| **fixed range** | **[−0.092, 0.476]** | **[−0.062, 0.508]** |
| fixed rows with \|share\| > 1 | 0 | 0 |
| rows nulled, current vs fixed | 46 / 46 | 51 / 51 |

**Identical distributions.** The fix moves only the pathological rows — James Robinson 2022 goes
`0.102 → −0.001` — and leaves everything else bit-for-bit alone.

### 1.7 · The re-ingest will not be blocked by C2's own guard

`validateAdvStats` throws when season `Σairyards ÷ Σtargets` leaves `[AY_PER_TARGET_MIN=6,
AY_PER_TARGET_MAX=11]`, computed **from `components`** (`lib/validate.mjs`) — which this slice
changes. Measured shift:

| | REG+POST | REG-only | Δ |
|---|---|---|---|
| 2022 | 7.860 | 7.859 | −0.001 |
| 2024 | 7.789 | 7.762 | −0.027 |

Served band margins across all 14 seasons run **1.796 – 2.474**. A shift of ~0.03 is two orders of
magnitude inside the margin. **Verify all 14 anyway** (§4 step 5) — but this is not an ordering
hazard, and the guard is doing its job by being checked rather than assumed.

### 1.8 · `components` has no app-side reader

Grepped live `src/`: the only occurrence of `components` is a **JSDoc comment** in
`src/api/advStats.js` describing the row shape. The app consumes `racr` (Market's RACR column) and
the ratios. `isValidAdvStats` checks only that `players` is an object and `rowCount` is a number —
**it does not inspect `components` at all**, so an app-side load would silently accept any grain.

Data-side, the sole `components` reader is `lib/validate.mjs`'s band (§1.7).

**`schemaVersion` is currently `1` in all 14 files**, and advstats routes through `tryDataStore`,
whose ceiling is `MAX_SUPPORTED_SCHEMA = 4`. **A bump to `2` is safely under the ceiling** and will
not break the app loader.

### 1.9 · The re-ingest also changes provenance for 11 seasons — measured

`STATS_BASE` points at the **current** `stats_player` release. But `data-catalog.md` records that
seasons **2012–2015, 2017–2018 and 2020–2024** are served from the **frozen legacy `player_stats`
tag** (2019 and 2025 came from the current tag on 2026-07-03; 2016 was re-ingested from it on
2026-08-30). **Re-ingesting moves 11 seasons onto the current tag as a side effect of this slice.**

Measured — served (legacy) vs the current tag through the *same unmodified* aggregator:

| | served rows | current-tag rows | Δ rows | Δ ayPerTarget |
|---|---|---|---|---|
| 2022 | 521 | 525 | **+4** | −0.010 |
| 2024 | 507 | 513 | **+6** | −0.007 |

**Modest — nothing like 2016's 3.96 → 8.48 — but it is a real confound, and it inverts one of this
plan's own expectations.** For 2024: served 507 → current tag 513 → REG-only **511**. The net row
count **rises by 4**, because the tag adds 6 rows and the grain fix removes 2. An earlier draft of
§7 asserted "row counts drop slightly," which is simply false.

**Consequence for verification (§4 step 7):** the served diff carries *two* changes, and only one is
this slice's subject. Separate them — compare against `aggregateAdvReceiving(currentTagCsv)`
unfiltered, not against the served file, to isolate the grain effect. And §3.4 must retire the
now-obsolete "Provenance split" paragraph, because after this slice **all 14 seasons come from the
current tag** and the split no longer exists.

---

## 2. The decisions

### 2.1 · C1 — advstats becomes REG-only, and says so

**Filter to `season_type === 'REG'` at read time.** Ratios, `components` and `weeks` all become
regular-season. Update `data-catalog.md`'s advstats row to state the grain explicitly.

**Do NOT bump `schemaVersion`.** An earlier draft did; three independent facts kill it:

1. **Invariant 4** — *"Bump `schemaVersion` only on an incompatible layout change."* The served
   layout here is **byte-identical**: same keys, same nesting, same types. Only *values* and row
   membership move. A bump would misreport a data correction as a shape change.
2. **CR-07's `Invariant` pins `schemaVersion: 1`** as part of the served shape it guards. Bumping
   falsifies a registry entry, which would force a two-repo mirrored-region edit — scope this slice
   explicitly does not take.
3. **The repo has already settled this.** The 2016 advstats re-ingest (`c01d9f0`) corrected values
   across a whole season and **kept `schemaVersion: 1`**. Same class of change, same answer.

The mechanisms that *do* announce a value correction are already in place: `lastModified` changes in
the manifest (Invariant 3), git history is the audit trail (Versioning policy), and `data-catalog.md`
records what changed and when. That is the repo's actual convention for this, and it needs no bump.

**Note this also removes a latent bug the reviewer caught:** `scripts/update-advstats.mjs` carries
the literal `schemaVersion: 1` **twice** — once in the written file and once in `updateManifestEntry`.
A bump that edited only the first would leave the manifest saying 1 while the file said 2, and the
app gates on the **manifest** value.

This is what makes the family consistent with its own documented grain *and* with its join partner.
The 2 postseason-only rows stop being emitted, which is correct — they have no regular season.

**Do not add a `postseason` sibling block.** The audit's "cheapest honest version" was splitting
`components` into `reg`/`post`. Rejected: **no consumer exists for it** — not one app reader (§1.8),
and the single data-side reader is a validator that wants the REG figure. Shipping an unread block
to 14 files is the same waste E1 removed 208 MB of. POST data stays one `season_type` filter away in
the source CSV for anyone who later needs it, and `data-catalog.md` will say so.

**Do not simply document the mismatch and leave the values.** That was the audit's fallback. It
leaves a family whose volumes silently disagree with the season-totals they get regressed against —
`buildCohortRows` puts an advstats predictor and a season-totals-derived control (collinear at
r = 0.87) in the same model, so the residual carries playoff contamination that is correlated with
team quality, which is correlated with the outcome. Documenting that is not fixing it.

### 2.2 · C3 — weight by magnitude, add no floor

```js
airNumer += (pTeam.airYards / denomAir) * Math.abs(pTeam.airYards);
airDenom += Math.abs(pTeam.airYards);
…
const airYardsShare = (airOk && airDenom > 0)
  ? Math.round(airNumer / airDenom * 1000) / 1000 : null;
```

**No magnitude floor** — §1.5 measured the audit's suggestion nulling 27% of rows, and §1.6 shows the
corrected weight removes the failure mode by construction. A threshold guarding a bug that no longer
exists is pure loss.

**The null condition changes from `p.recAirYards !== 0` to `airDenom > 0`,** and this is a deliberate
improvement, not a side effect: a player with perfectly cancelling splits (`Σaₜ = 0`, `Σ|aₜ| > 0`)
currently nulls despite having real air-yard activity on both teams. Measured on 2022 and 2024, **no
row changes null status** — but verify across all 14 (§5).

Single-team players are algebraically untouched: `(a/d)·|a| ÷ |a| = a/d`.

### 2.3 · Alternatives rejected

| option | rejected because |
|---|---|
| `components` split into `reg`/`post` | §2.1 — zero consumers on either side; unread served bytes |
| Document the grain, leave values | §2.1 — the regression contamination is the actual defect |
| `\|recAirYards\| < 25` floor | §1.5 — nulls 27% of rows to fix 12 across 14 seasons |
| Cancellation-ratio guard | §1.6 — corrected weight makes it dead code |
| Weight by targets instead of \|airYards\| | Changes single-team players too (`a/d` no longer recovered exactly), so it is a redefinition of the metric rather than a bug fix. Out of scope. |
| Land C1 and C3 separately | Two 14-season re-ingests and two purges of the same files |
| Bump `schemaVersion` 1 → 2 | §2.1 — Invariant 4 (layout unchanged), CR-07's `Invariant` pins `1`, and the 2016 re-ingest set the precedent by not bumping |

---

## 3. The edits

### 3.1 · `lib/nflverse.mjs` — `aggregateAdvReceiving`

1. Resolve `const iType = header.indexOf('season_type');`.
2. In the single accumulation pass, **skip non-REG rows**:
   `if (iType !== -1 && fields[iType]?.trim() !== 'REG') continue;`
   — placed **before** the team-total accumulation, so playoff volume leaves the denominators too.
3. **When the column is absent (`iType === -1`), do not silently pass everything.** Every season
   2012–2025 has it (verified 2022/2024 directly; the ingest hard-throws on missing `targets`
   already). Follow that precedent: **throw**, with the same "possible upstream CSV format change"
   wording as the existing required-columns guard. A silent fallback here reintroduces exactly the
   defect being fixed, and it would be undetectable.
4. Replace the air-yards numerator with the magnitude-weighted form and its own denominator (§2.2).

### 3.2 · `scripts/update-advstats.mjs` — **no change**

Both `schemaVersion: 1` literals stay (§2.1). The aggregator owns the shape and the values; this
script's write path, force gate and manifest call are all correct as they stand.

### 3.3 · `lib/validate.mjs`

No logic change. The band inputs shift by ~0.03 (§1.7), well inside margin.

### 3.4 · `data-catalog.md` — three edits, not one

1. **The advstats row** — state the grain is **regular season only**, that `season_type === 'REG'` is
   filtered at ingest, and that postseason is deliberately excluded and recoverable from the same
   source CSV. Record the re-ingest date. **No schemaVersion note** — it does not change (§2.1).
2. **The "Provenance split" paragraph is now obsolete** (§1.9). It currently says 2012–2015,
   2017–2018 and 2020–2024 come from the frozen legacy `player_stats` tag. After this slice **all 14
   seasons come from the current `stats_player` tag.** Replace the split with a single statement of
   uniform provenance, keeping the historical note about *why* the split existed (2019's broken
   legacy asset, 2025 never mirrored, 2016's corruption) since that is the audit trail.
3. **The gamelogs sparsity-gate line** — it documents the shared air-yards band as
   `Σreceivingairyards ÷ Σtargets` **"(all rows, REG+POST)"**. That parenthetical is a comparison to
   advstats' basis, and after this slice the two families no longer share it: gamelogs stays REG+POST,
   advstats becomes REG-only, **using the same `AY_PER_TARGET_MIN`/`MAX` constants**. Say so
   explicitly. Leaving it silent makes the shared constants look like a shared basis, which is
   exactly the kind of undocumented grain mismatch this slice exists to remove.

### 3.5 · One registry correction — CR-07's `Triggers`

CR-07's **`Data side`** names `aggregateAdvReceiving` as "the producer". Its **`Triggers`** list does
not. So a change confined to that function — **this slice** — does not literally trip the list the
reviewer checks against, and CR-07 fires here only because its `Invariant` pins the shape being
changed.

**Add `aggregateAdvReceiving` to CR-07's data-side `Triggers`.** Both repos, byte-identical, in the
same change. This is the near-side re-verification duty the registry spec describes, discharged at
the moment it was found.

**Scope it to that one symbol.** The reviewer also flagged `rekeyBySleeper`, `computeTeamTotals` and
`CANDIDATES.airYardsShare` as uncovered consumers. Those are real and recorded in §11 — but they are
not touched by this slice, and folding a four-symbol trigger expansion into a 14-season correctness
re-ingest turns one reviewable change into two. The line is principled: **add the producer this slice
edits, defer the consumers it does not.**

---

## 4. Step order

1. **Capture a full before-baseline**: for all 14 seasons, record per-season `rowCount`,
   `Σcomponents.targets`, `Σcomponents.airYards`, `ayPerTarget`, and the count of non-null
   `airYardsShare`. Commit it as the comparison artifact. **Without this the re-ingest cannot be
   verified**, because the files it would be compared against are the ones being overwritten.
2. **Update the test fixtures first.** `test/nflverse.test.mjs`'s `ADV_HEADER` has **no
   `season_type` column**, and all **9** `aggregateAdvReceiving` tests build through `makeAdvCsv`.
   §3.1's throw reds every one of them. Add `season_type` to `ADV_HEADER` and a `REG` value to each
   fixture row **before** the aggregator change, so the 9 failures never appear and a real failure
   is never mistaken for expected fixture churn.
3. Apply §3.1's `season_type` filter and throw. Run existing tests.
4. Apply §3.1's magnitude weighting. Run existing tests.
5. Add §5's tests. They must fail before the fix and pass after — **write them against the two
   worked cases in §1.4/§1.6 (Mark Ingram 2021, James Robinson 2022), not invented fixtures.**
6. **Verify the `season_type` value set across all 14 source CSVs** — assert every row is `REG` or
   `POST`. §3.1's guard catches a missing *column*; it does **not** catch an unexpected *value*. The
   literal `'REG'` is verified on 2022 and 2024 only. If an older season spells it differently, the
   filter drops every row and the season exits **quietly** through the sparsity gate — the opposite
   of the loud failure that guard exists for.
7. **Dry-run all 14 and check the band.** `ayPerTarget` ∈ `[6, 11]` and `|airYardsShare| ≤ 1` for
   every row.

   **Know what this gate does not prove.** `updateAdvStats` returns at the dry-run exit *before* the
   force gate, so **all 14 dry-runs pass even though every real write would throw** without
   `--force` (step 8). The dry-run validates the data, not the write path. Confirm `--force` is on
   the real command by reading it, not by inferring it from a green dry-run.
8. **Re-ingest 2012–2025 with `--force`**, one season per invocation:
   `node bin/update.mjs advstats --year <y> --force`. Every season 2012–2025 is a completed past
   season with an existing file, so **all 14 throw without it**.
9. **Assert each season actually wrote.** Two paths exit 0 without writing — a 404/504 fetch skip
   and the `MIN_ADVSTATS_ROWS` sparsity gate — so a season can be silently skipped while its
   neighbours convert, leaving the store half-converted with no signal. After each invocation,
   confirm the file's `generatedAt` advanced. **Do not rely on the loop's exit status.**
10. **Diff against step 1's baseline, separating the two effects** (§1.9). The served diff carries
    both the grain fix *and* an 11-season provenance move onto the current tag. Isolate the grain
    effect by comparing against `aggregateAdvReceiving(currentTagCsv)` unfiltered. Expect: every
    season's `weeks` maximum ≤ the regular-season max; ratios move ~0.004 median; and **row counts
    may rise, not fall** — 2024 goes 507 → 511 because the tag adds 6 rows and the grain fix removes
    2.
11. `npm test`, `npm run smoke`.
12. Commit, then `git -c rebase.autoStash=true pull --rebase origin main` and **push**.
13. **Purge the CDN only after the push has landed** — `manifest.json` first, then all 14 season
    files. Purging before the commit reaches `main` re-caches the *old* content and pins it, which
    is worse than not purging. This is the order `.github/workflows/nflverse-advstats.yml` uses.

**Do not reorder 7 before 3–5.** The band check is only meaningful against the finished aggregator.

## 5. Tests

Add to the nflverse test file (or a new `test/advstats-grain.test.mjs`):

1. **REG filter** — a fixture CSV with REG weeks and POST weeks 19–22 for one player: emitted
   `components.weeks` counts only the REG weeks, `targets`/`airYards` exclude POST, and the team
   denominator excludes POST too (assert the *share*, not just the components — a filter applied to
   the player but not the team totals would pass a components-only test).
2. **Postseason-only player is not emitted** — the §1.2 case, 2 real rows in 2024.
3. **Missing `season_type` throws** — §3.1 step 3, with the format-change wording. Note this test
   needs a fixture built *without* the column, so it cannot use the updated `makeAdvCsv` helper
   (§4 step 2) — build its header inline.
4. **Magnitude weighting, *near*-cancellation** — **not `+50 / −50`.** That case has
   `Σaₜ = 0`, which the *current* code already nulls via `p.recAirYards !== 0`; it would test the
   null condition and nothing else. Use the live shape instead: splits that nearly cancel to a small
   non-zero total, e.g. `+50 / −49` (`Σaₜ = 1`, `Σ|aₜ| = 99`) — the James Robinson / Mark Ingram
   pattern. Assert the current formula produces an inflated share and the fixed one produces a
   bounded value. **This is the test that would have failed to catch the bug if written the obvious
   way**, so it carries a comment saying why the exact-cancellation fixture is wrong.
5. **Single-team invariance** — for `aₜ ≥ 0` on one team the emitted share is *unchanged*, asserted
   against a pre-fix expected value. This is the regression guard that proves the fix is surgical.
6. **No floor** — a legitimate low-volume single-team player (`|Σa|` well under 25) still emits a
   non-null share. This pins §2.2's decision against a future "add a floor" change.

---

## 6. Cross-repo impact

**Two entries fire: CR-07 and CR-18.** Determined with the repo's own registry parser over every
data-side field, not by grep.

**CR-11 does *not* fire, contrary to the audit**, which says *"Note this is CR-11's served shape; a
`components` change needs the mirror."* CR-11 covers the season-totals snap/red-zone stat keys
(`off_snp`, `tm_off_snp`, `rec_rz_tgt`, `rush_rz_att`, `pass_rz_att`) and names no advstats surface
at all.

### CR-07 · advstats served shape

> Served-shape or sparsity-gate changes need the app loader updated in the same cycle. **Now breaks a visible surface, not just a silent loader** — Market's `RACR` column would go blank for every WR/TE with no error. Ratios are recomputed season-level and never aggregated weekly. Activation into projection is parked — see the advstats grading-findings doc.

**Assessment against that text.** `racr` is unchanged in definition (`recYards / recAirYards`) but its
inputs become REG-only, so **Market's RACR column changes value for the ~27% of rows with postseason
volume** — it does not go blank. `isValidAdvStats` does not inspect `components` or ratio ranges, so
**no app-side load fails**; the app needs no code change. **`schemaVersion` stays at 1** (§2.1), so
CR-07's `Invariant` — which pins `schemaVersion: 1` as part of the served shape — remains true and
needs no edit. **What the app owes is awareness, not a change.**

**One registry edit is owed, and it is not a `Mirror` matter:** CR-07's data-side `Triggers` omits
`aggregateAdvReceiving`, the producer this slice edits (§3.5). That is near-side cache maintenance
under the standing re-verification duty, landing byte-identically in both repos.

### CR-18 · signal registry / data-catalog

> This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

**This slice reclassifies an ingested source's coverage**, so CR-18 fires squarely. The emitted row
edit for the app's `docs/signal-registry.md`:

> **advstats (`targetShare` / `airYardsShare` / `wopr` / `racr`)** — *Coverage* changes from
> **2012–2025, regular season + postseason combined (undocumented)** to **2012–2025, regular season
> only**. *Source* unchanged (nflverse `stats_player` release, `stats_player_week_<year>.csv`), now
> filtered on `season_type === 'REG'` at ingest. *Reconstructable* — unchanged, and postseason
> remains reconstructable from the same source CSV. *Current use* unchanged. Served
> `schemaVersion` **unchanged at 1** — the layout does not move, only values and row membership.
> Ratio values move by a median of 0.004 (max 0.034) and `components` volumes change for ~27% of
> rows; two postseason-only rows per season are no longer emitted. Separately, all 14 seasons move
> onto the current `stats_player` release tag, retiring the 2012–2024 legacy-tag provenance split.

---

## 7. Done-definition

**C1 — the grain**
- [ ] `season_type` resolved and non-`REG` rows skipped **before** team-total accumulation
- [ ] Missing `season_type` column **throws**, matching the existing required-columns wording
- [ ] `season_type` value set asserted as `{REG, POST}` across **all 14** source CSVs (§4 step 6)
- [ ] `components.weeks` ≤ regular-season max for **every row of every season** post-re-ingest
- [ ] The 2 postseason-only 2024 rows are no longer emitted
- [ ] **`schemaVersion` still `1`** — in the served files *and* both literals in
      `scripts/update-advstats.mjs`

**C3 — the weight**
- [ ] Numerator weights by `Math.abs(pTeam.airYards)`; denominator is `Σ|aₜ|`
- [ ] Null condition is `airDenom > 0`, **not** `p.recAirYards !== 0`
- [ ] **No magnitude floor added**
- [ ] James Robinson 2022 moves `0.102 → ≈ −0.001`; Mark Ingram 2021 no longer emits `−0.465`
- [ ] Single-team rows with non-negative splits are **bit-identical** to their pre-fix values

**Tests**
- [ ] `ADV_HEADER` gained `season_type` and all 9 existing fixtures a `REG` value — **before** the
      aggregator change, so the 9 reds never appear
- [ ] The near-cancellation test uses `+50 / −49`-shaped splits, **not** `+50 / −50`, and says why

**Re-ingest**
- [ ] Step 1 baseline captured and committed **before** any file is overwritten
- [ ] All 14 dry-run-validated before the first write (`ayPerTarget` ∈ [6,11], `|airYardsShare| ≤ 1`)
- [ ] Re-ingest run **with `--force`** — without it all 14 throw
- [ ] **Each season confirmed to have actually written** (`generatedAt` advanced), not inferred from
      exit status — a 404/504 skip and the sparsity gate both exit 0 silently
- [ ] Diff vs baseline **separates the grain effect from the provenance move** (§1.9); row counts
      may **rise** (2024: 507 → 511)

**Docs & cross-repo**
- [ ] `data-catalog.md`: advstats row states REG-only grain; the **"Provenance split" paragraph is
      retired** (all 14 now on the current tag); the **gamelogs sparsity-gate line** records that it
      stays REG+POST while advstats does not, on the same shared constants
- [ ] `aggregateAdvReceiving` added to CR-07's data-side `Triggers`, **both repos byte-identical**;
      anchored drift check reports no output
- [ ] CR-07 and CR-18 `Mirror` texts emitted (§6); CR-18's `docs/signal-registry.md` row edit written
      out for the app repo
- [ ] No other registry text edited — no `Invariant`, no `Mirror`, no app-side trigger

**Landing**
- [ ] Push **before** any purge; then purge `manifest.json`, then the 14 season files
- [ ] `npm test` green (baseline **582** + new); `npm run smoke` green
- [ ] `store-audit-2026-08-25.md` still modified-and-uncommitted, untouched

## 8. Settled decisions

- **REG-only, not a `reg`/`post` split** (§2.1) — no consumer exists on either side for a POST block.
- **No magnitude floor** (§2.2, §1.5) — the audit's ~25 threshold nulls 27% of rows; the corrected
  weight removes the failure mode by construction.
- **Null on `Σ|aₜ| > 0`, not `Σaₜ ≠ 0`** (§2.2) — perfect-cancellation players have real activity.
- **Throw on a missing `season_type` column** (§3.1) — a silent fallback reintroduces the defect
  undetectably; matches the existing `targets` precedent.
- **Merged into one re-ingest** (header) — two would mean two purges and a destroyed baseline.
- **Baseline captured before writing** (§4 step 1) — the comparison files are the ones overwritten.
- **Don't reweight by targets** (§2.3) — that redefines the metric rather than fixing the sign error.
- **No `schemaVersion` bump** (§2.1) — Invariant 4 (layout unchanged), CR-07's `Invariant` pins `1`,
  and the 2016 re-ingest already set the precedent for a value correction without one.
- **Fixtures updated before the aggregator** (§4 step 2) — so 9 expected reds never appear and can
  never mask a real one.
- **Push before purge** (§4 steps 12–13) — purging first re-caches and pins the old content.

---

## 9. Invariant check

- **Invariant 1 (append-only, "except to correct an error")** — this is a correction to a data error
  in 14 completed seasons, the same justification `reingest-2016.md` used. In scope.
- **Invariant 3 (manifest is the index)** — 14 entries get new `lastModified`; the manifest is
  rewritten through `updateManifestEntry` by the normal ingest path. `schemaVersion` stays `1` on
  both sides of that call, so file and manifest cannot disagree.
- **Invariant 4 (schemaVersion discipline)** — *"bump only on an incompatible layout change."* The
  layout is byte-identical; only values and row membership move. **No bump** (§2.1). This is the
  invariant an earlier draft of this plan violated.
- **CDN purge rule** — §4 step 9. Overwrites of existing files need manifest **and** file purged.
- **Rate-stat trap** — untouched: ratios are already recomputed from summed components, never
  averaged weekly, and this slice preserves that.

---

## 10. Where the audit was wrong

| audit claim | verified |
|---|---|
| C1 affects 23% of 2024 rows | **27.3%** (140/513) |
| C1 — no mention of vanishing rows | **2 rows per season are postseason-only** and should never have been emitted |
| C3 affects "~2% of rows, all multi-team" | **0.18%** pathological (12 / 6,725); multi-team is 5.1% but only **0.38%** change under the fix |
| C3 fix: "add a magnitude floor ~25" | **nulls 26.7–28.1% of rows** — the single worst instruction in the audit |
| "this is CR-11's served shape" | **CR-11 does not name any advstats surface.** CR-07 and CR-18 fire |
| C1 fix: split `components` into `reg`/`post` | No consumer on either side (§1.8); REG-only is the correct grain |

And one this plan got wrong on its own, caught at review: an earlier draft bumped `schemaVersion`
1 → 2. That violates Invariant 4 (the layout does not change), falsifies CR-07's `Invariant`, and
contradicts the 2016 re-ingest's own precedent — three signals pointing the same way, none of which
the draft checked.

The audit's *diagnoses* are both correct and its central judgement — that C1's damage is in the
joinable components rather than the ratios — held up under measurement. **Its prescriptions are where
it went wrong**, and the magnitude floor would have done far more damage than the bug.

---

## 11. Out-of-scope observations (not edits)

1. **`gamelogs` shares `fetchPlayerStatsCsv` and carries `seasonType` per row** — it does the right
   thing. advstats was the outlier, and the two families are now consistent. Worth a line in whatever
   slice next touches `parsePlayerGameLogs`.
2. **CR-07's trigger text was mildly garbled by the anchor slice.** Pre-strip it read *"the latter
   reads the `airYardsShare` candidate"*; it now reads *"the latter reads `airYardsShare` in
   `lib/panel.mjs`"* — a redundant file reference inside a clause that already names the file. Not
   this slice's to fix (no anchor is involved, and the registry is not being edited here), but it is
   a small quality regression from a mechanical rewrite.
3. **The re-ingest invalidates the inputs of committed analysis artifacts, and nothing will say so.**
   `backtests/<date>-e0a-*`, `-r2flip-*`, `-r3fit-*` and their `grading/<date>-*-verdict.md` were all
   fit on the `airYardsShare`/`targetShare` values this slice rewrites. **No registry entry fires** —
   CR-15's triggers are the panel and factor sources, untouched — and **no re-fit is in scope here**.
   But the next reader of those verdicts has no way to know their inputs moved. Recorded so that
   whoever next runs a fit knows the baseline shifted under it.
4. **Three more CR-07 trigger gaps, deferred** (§3.5): `rekeyBySleeper` (produces the served
   `players` map), `computeTeamTotals` in `lib/backtest.mjs` (reads the served `team` field), and
   `CANDIDATES.airYardsShare` in `lib/panel.mjs` (a served-ratio-name definition site of the same
   class as the already-listed `METRICS`/`CORRUPT_PREDICTOR_SEASONS`). None is touched by this slice.
5. **`isValidAdvStats` validates almost nothing** — `players` is an object, `rowCount` is a number.
   It would accept a file with every ratio null, the wrong grain, or zero components. The data side
   carries all the real validation. That asymmetry is fine while advstats is data-driven, but it
   means the app cannot detect an advstats regression on its own.
