# Air-yards plausibility gate + the 2016 disposition (C2)

**Type:** one validator gate, one metric-scoped analysis exclusion, two doc rows. **No data rewrite,
no re-ingest, no served-shape change.**
**Session model:** plan (opus, this file). Implementation is a separate sonnet session — do not edit
source here.
**Source:** C2 (`store-audit-2026-08-25.md`, queue row 7). Re-verified against live source and live
data **2026-08-29** at HEAD `9ea2eed`.

**Why now.** The audit says this *"must land before the snap-count backfill widens the panel onto a
corrupt 2016."* That ordering still holds — R1-SNAPS is `open` and unplanned. But verification found
the exposure is **not** purely future: a documented flag reaches corrupt 2016 **today** (§1.4).

**Working-tree note.** `store-audit-2026-08-25.md` is modified and uncommitted. **Do not stage,
commit, revert or edit it.** Nothing here touches it.

---

## 1. Verified facts

### 1.1 · 2016 is out of band, and only 2016

Σ`airYards` ÷ Σ`targets`, recomputed from served `components` across all 14 seasons:

| 2012 | 2013 | 2014 | 2015 | **2016** | 2017 | 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 9.07 | 8.71 | 8.54 | 8.53 | **3.96** | 8.42 | 8.26 | 8.31 | 8.04 | 7.84 | 7.87 | 7.82 | 7.80 | 7.95 |

Healthy range **7.80–9.07**. A `[6, 11]` band flags **exactly 2016** and leaves ≥1.8 of margin on
each side. Null `airYardsShare` count is 12–55 everywhere and **104** in 2016.

### 1.2 · It is two defects, not one — and that rules out salvage

The audit reports the aggregate. Broken down against 2015/2017 as controls:

| | 2015 | **2016** | 2017 |
|---|---|---|---|
| rows with `airYards == 0` | 36 | **104** | 32 |
| …of rows with **≥10 targets** | 1 | **21** | 0 |
| median AY/target (≥10 tgt, AY≠0) | 7.79 | **3.76** | 8.11 |

Two independent failures: **21 players with ten or more targets and literally zero air yards** (not a
plausible value — that is missing data), **and** the rows that *do* have air yards are themselves
roughly halved (3.76 vs ~8).

**So 2016 cannot be rescued by filtering the zero rows** — the survivors are corrupt too. Any
per-row repair is off the table; the season is unusable for air-yards-derived metrics as a whole.

### 1.3 · But `targetShare` is fine — the exclusion is metric-scoped

`targetShare` is `targets ÷ team targets`; it never touches air yards. Measured:

| | 2015 | **2016** | 2017 |
|---|---|---|---|
| Σ `targetShare` | 42.51 | **41.95** | 42.07 |
| median `targetShare` (≥10 tgt) | 0.1000 | **0.0985** | 0.1020 |
| median `racr` (≥10 tgt) | 0.884 | **1.808** | 0.832 |

`targetShare` is **normal**. `racr` (= `recYards ÷ airYards`) is **doubled**, exactly as a halved
denominator predicts. `wopr` (`1.5·targetShare + 0.7·airYardsShare`) is contaminated but mildly at
the median, because the clean term carries the larger weight.

**This is the key design fact:** the answer is not "exclude 2016". It is *exclude the three
air-yards-derived metrics for 2016 and keep `targetShare`* — which preserves a full extra season of
signal for the one metric that is sound.

### 1.4 · The exposure is reachable **today**, not only after R1-SNAPS

The audit says this is *"currently out of reach — the default panel is 2020–2024."* True of the
**default** invocation, and I confirmed it: `node bin/backtest.mjs --metric air_yards_share
--position WR` reports `Effective panel : 2020–2024 (snapShare in controls — pre-2020 rows excluded)`.

But `bin/backtest.mjs:21-22` documents a supported flag that drops the control:

```
$ node bin/backtest.mjs --metric air_yards_share --position WR --controls overallShare,rzOwnRate
── airYardsShare / WR (n=1373) ──
  Predictor years : 2012, 2013, 2014, 2015, 2016, 2017, …
  Effective panel : 2012–2024
```

**2016 is graded today**, with no warning, via a documented flag. There are therefore two paths:

1. **Today, manually** — drop `snapShare` from `--controls`.
2. **Automatically, when R1-SNAPS lands** — the pre-2020 exclusion is *listwise deletion on a null
   control* (`lib/backtest.mjs:273`: *"snapShare — null for pre-2020 seasons"*), **not** a year
   filter. The moment `off_snp` exists pre-2020, those rows stop being dropped and the panel widens
   **with no code change**. `lib/panel.mjs:21` already carries the companion intent in a source
   comment: `fromYear: 2020, toYear: 2024,  // …(flip fromYear→2013 post-R1-SNAPS)`.

### 1.5 · What 2016 does to the result

Per-predictor-season standardized β, `airYardsShare` / WR, widened panel:

| Season | 2012 | 2013 | 2014 | 2015 | **2016** | 2017 | 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| raw r | .595 | .627 | .541 | .694 | **.370** | .564 | .621 | .696 | .456 | .604 | .627 | .625 | .617 |
| β | .286 | .474 | .229 | .301 | **−.036** | .304 | .321 | .423 | −.095 | .209 | .226 | .160 | .324 |

2016 has the **lowest raw r of thirteen seasons** and a **sign-flipped β** — into a harness whose
entire purpose is grading `airYardsShare`/`wopr` as positive predictors.

**Do not over-claim this.** 2020 also shows a negative β (−.095) and is **not** corrupt — its ratio
is 8.04, comfortably in band. A negative single-season β is a *consequence*, not a diagnosis. What
identifies 2016 is its **input distribution** (§1.1, §1.2); the β is what that costs.

### 1.6 · Mechanical facts for the implementation

- `validateAdvStats` is at **`lib/validate.mjs:443`** (the audit's `:429` has drifted). It checks
  three things: `MIN_ADVSTATS_ROWS`, `targetShare ∈ [0,1]`, and the >50%-all-null drift guard.
  Nothing distributional; `airYardsShare` has no bound in either direction.
- **`|airYardsShare| > 1` occurs in zero rows** across all 14 seasons today. The bound is a forward
  guard, and it must be on the **absolute value** — negative shares are deliberate and documented
  (`data-catalog.md` advstats: *"RB negatives emitted"*).
- **`predictorYear` is already on every cohort row** (`lib/backtest.mjs:313`). The exclusion needs no
  new plumbing.
- `assembleCohort` (`scripts/backtest-run.mjs:92`) maintains a `skippedYears` array but **nothing in
  the backtest path reports it** — `bin/backtest.mjs:185` destructures `{ rows }` only. The repo's
  only `skippedYears` print site is `scripts/panel-run.mjs:252-253`, over a *different* array
  (`lib/panel.mjs:329`). §5.3 therefore adds a print site rather than reusing one.
- `METRICS = ['targetShare','airYardsShare','wopr','racr']` (`scripts/backtest-run.mjs:32`).
- There is **no existing season-exclusion concept** anywhere in `lib/backtest.mjs`, `lib/panel.mjs`,
  or their runners. This introduces one.

---

## 2. Scope

**In:** the validator gate, the metric-scoped analysis exclusion, and the two doc rows that record
the known-bad season.

**Out, deliberately:**

| Not doing | Why |
|---|---|
| Re-ingesting or repairing 2016 | Upstream is broken; two independent ingest paths (advstats **and** gamelogs, 3.90) agree, so it is not a parser bug. §1.2 rules out per-row salvage. |
| Deleting 2016 | Invariant 1. The repo's doctrine is that gaps stay honest and documented, and `nflverse/gamelogs/2016.json` independently corroborates the corruption — deleting destroys the evidence. |
| Excluding 2016 wholesale from analysis | §1.3 — `targetShare` is sound; a wholesale exclusion throws away a good season of the one clean metric. |
| Widening the gate to other families | `validateGameLogs` has the same blind spot for 2016 (§12.1), but that is a second family and a second slice. |

---

## 3. The gate — `validateAdvStats` (`lib/validate.mjs:443`)

Two additions, both **fail-loud throws**, consistent with the function's existing style.

### 3.1 · Per-season air-yards plausibility band

```js
const AY_PER_TARGET_MIN = 6;
const AY_PER_TARGET_MAX = 11;
```

Sum `components.airYards` and `components.targets` across all rows; if `Σtargets > 0`, assert the
ratio falls in `[6, 11]`, else throw naming the year and the computed ratio.

**Guard the denominator.** `Σtargets === 0` must **skip** the check, not divide by zero — an empty or
near-empty season is already caught by `MIN_ADVSTATS_ROWS` above it, and a NaN comparison would pass
silently, which is the exact failure class this slice exists to close.

**Where the constants live:** next to `MIN_ADVSTATS_ROWS` in `lib/nflverse.mjs`, exported, so the
band is greppable from one place. They are a **validation band, not a coverage floor** — do not add
them to any list CR-18 names (§8).

### 3.2 · `|airYardsShare| ≤ 1`

In the existing per-player loop, alongside the `targetShare` bound:

```js
if (p.airYardsShare != null && Math.abs(p.airYardsShare) > 1) throw …
```

**Absolute value, not `< 0`.** Negative shares are legitimate and documented for RBs. Zero rows
violate this today; it is a forward guard, and it is the bound that would have caught C3's
squared-weighting blowup had it ever exceeded 1.

### 3.3 · The gate makes 2016 un-reingestable — that is correct, and it needs saying

After this lands, `node bin/update.mjs advstats --year 2016 --force` **throws**. That is the intended
behaviour: re-fetching 2016 would rewrite a served file with the same corrupt upstream. The existing
file stays on disk untouched — the gate runs at ingest, not at read.

**Do not add a bypass flag.** If a future upstream correction makes 2016 plausible, the ratio moves
into band and the gate passes on its own. A bypass would be a way to write corrupt data deliberately,
which is what the gate exists to prevent.

**Smoke is unaffected**: `npm run smoke` dry-runs `advstats --year 2023` (ratio 7.82, in band).

---

## 4. The 2016 disposition — ship flagged

The audit asks for an explicit decision. **2016 ships, flagged, and is excluded per-metric from
analysis.** Not deleted (Invariant 1, and the gamelogs corroboration is evidence worth keeping), not
repaired (§1.2), not wholesale-excluded (§1.3).

The flag lives in **three** places, because three different readers need it:

1. `data-catalog.md`'s advstats row — the human-facing storage registry (§6).
2. The exclusion set in code (§5) — the machine-facing one, so analysis cannot silently include it.
3. `docs/signal-registry.md` via CR-18's mirror (§8) — the app-facing inventory.

---

## 5. The analysis exclusion — metric-scoped, on `predictorYear`

### 5.1 · Where the set lives: `lib/backtest.mjs`

```js
// lib/backtest.mjs — beside isTeamAggregateId, and next to where predictorYear is stamped (:313)
/**
 * Predictor seasons whose air-yards inputs are upstream-corrupt and must not be graded.
 * 2016: Σ airYards ÷ Σ targets = 3.96 vs a 7.80–9.07 archive range; 21 rows carry ≥10 targets
 * with zero air yards, and the surviving rows' median is 3.76 vs ~8 (advstats-2016-gate.md §1.2).
 * targetShare is unaffected (§1.3) and is deliberately NOT excluded.
 */
export const CORRUPT_PREDICTOR_SEASONS = {
  airYardsShare: [2016],
  wopr:          [2016],
  racr:          [2016],
  // targetShare: intentionally absent — verified sound in 2016
};

export function isCorruptPredictorSeason(metric, year) { … }
```

**Not `scripts/backtest-run.mjs`.** An earlier draft put it there, which would have made §5.4's
requirement unsatisfiable: no `lib/` module imports from `scripts/` anywhere in the repo, and
`lib/panel.mjs` is declared pure with imports only from `./backtest.mjs` and `./projectionFactors.mjs`.
`lib/backtest.mjs` is already imported by **both** consumers (`lib/panel.mjs:10`,
`scripts/backtest-run.mjs`) and is where `predictorYear` is stamped — it is the only site that works.

### 5.2 · Where the filter is applied: the FIRST statement of `runMetric`

**This is the load-bearing detail, and the obvious site is wrong.** `runMetric`
(`scripts/backtest-run.mjs:132`) does:

```js
const surviving      = listwiseSurviving(rows, metric, effectiveControls);   // :134
const predictorYears = [...new Set(surviving.map(r => r.predictorYear))]…;   // :135
const regression     = standardizedRegression(rows, { … });                  // :139  ← UNFILTERED
const { bins, monotonic } = quintileResponse(surviving, metric, 'outcomePPG');
```

`predictorYears` and the quintiles come from `surviving`; **β, R² and collinearity come from raw
`rows`**. Filtering at the `surviving` site would drop 2016 from the *reported* panel while leaving
it in the regression — and §9's "loses 2016 from its predictor years" check would have **passed on a
contaminated β**. A verification step that cannot fail is worse than none.

**So: filter `rows` as the very first statement of `runMetric`, before anything derives from it.**

```js
export function runMetric(allRows, metric, position, { … }) {
  const excludedSeasons = CORRUPT_PREDICTOR_SEASONS[metric] ?? [];
  const rows = excludedSeasons.length
    ? allRows.filter(r => !excludedSeasons.includes(r.predictorYear))
    : allRows;
  …
}
```

One filter point that every downstream consumer inherits. Do not add a second.

### 5.3 · Reporting — a new print site, not a reuse

An earlier draft said to *"reuse `assembleCohort`'s existing `skippedYears` reporting path."* **There
is no such path in the backtest flow.** `assembleCohort` returns `{ rows, skippedYears }`
(`scripts/backtest-run.mjs:122`) but `bin/backtest.mjs:185` destructures `{ rows }` only, and
`runValidate` destructures `{ rows: r }`. The repo's sole `skippedYears` *reporting* site is
`scripts/panel-run.mjs:252-253`, over `lib/panel.mjs:329`'s **separate** array.

So: `runMetric` returns `excludedSeasons` in its result object, and `formatHumanReport`
(`bin/backtest.mjs`) prints a line when it is non-empty —
`Excluded seasons : 2016 (upstream-corrupt air yards — advstats-2016-gate.md)`. A silent exclusion is
the same defect class as a silent inclusion.

### 5.4 · `bin/backtest.mjs --by-season` must skip, not print a degenerate block

`bin/backtest.mjs:199-210` builds `seasonRows` from the **unfiltered** cohort and `continue`s only on
`length === 0`. With §5.2's filter inside `runMetric`, Y=2016 still enters and `runMetric` returns
`n: 0`, `predictorYears: undefined`, `standardizedBeta: null` — **verified by direct call** — which
`formatHumanReport` renders as a full degenerate block. Skip `(metric, Y)` in that loop when Y is
excluded for the metric. **`bin/backtest.mjs` is in scope for this slice** — an earlier draft's step
list omitted it.

### 5.5 · `lib/panel.mjs` is in scope **now**, not after R1-SNAPS

An earlier draft deferred the panel. That contradicted this plan's own §1.4 argument: `bin/panel.mjs
--from 2013` grades corrupt 2016 **today**, by the identical documented-flag reasoning used for
`--controls`. Verified: `bin/panel.mjs:66` honours `--from`, `scripts/panel-run.mjs:137` loads
advstats for every `y ∈ [fromYear..toYear]`, and `lib/panel.mjs:44` lists `airYardsShare` as a graded
CANDIDATE (WR/TE; RB diagnostic), read raw at `:292`. **`--write` persists a verdict to `grading/`**,
so a corrupt result gets committed.

Seam: at `lib/panel.mjs:292`, where `anchorYear` is already in scope (it becomes `predictorYear` at
`:299`) —

```js
candidates.airYardsShare = isCorruptPredictorSeason('airYardsShare', anchorYear)
  ? null
  : (advstatsY?.players?.[pid]?.airYardsShare ?? null);
```

Nulling listwise-drops the row downstream, which is how the panel already handles an absent
candidate — no new mechanism.

The `fromYear: 2020, … // (flip fromYear→2013 post-R1-SNAPS)` comment at `lib/panel.mjs:21` should
also point at `CORRUPT_PREDICTOR_SEASONS`, so the R1-SNAPS session sees it — but that comment is now
a courtesy, not the guard. The guard is at `:292`.

### 5.6 · Requirements

- `targetShare` output **byte-identical** before/after on every invocation — the regression proof
  that the scoping is right.
- The default `2020–2024` backtest panel is unaffected today (2016 already listwise-drops); the
  exclusion bites on either §1.4 path. It must be in place **before** it is needed.

---

## 6. Docs

- **`data-catalog.md`** advstats row: coverage stays *"2012–2025 complete"* (the file **is** there —
  do not imply a gap), and **Null semantics** gains the known-bad note: 2016's `airYardsShare` /
  `wopr` / `racr` are upstream-corrupt and excluded from analysis; `targetShare` is sound.
- **`CLAUDE.md`**: add the two band constants to the `lib/nflverse.mjs` exports list in the
  Navigation map, matching how the other sparsity constants are recorded.

---

## 7. Step order

Four source files, not two. An earlier draft's list omitted `bin/backtest.mjs` and `lib/panel.mjs`.

1. **Gate** — band constants in `lib/nflverse.mjs`; the two checks in `validateAdvStats` (§3).
2. **Gate tests** — synthetic season at 3.96 throws, 7.82 passes, `Σtargets === 0` skips (no NaN
   pass), `airYardsShare` `-0.5` passes / `1.5` throws. **Then run the gate against the real
   `nflverse/advstats/2016.json` and confirm it throws**, and against 2023 and confirm it passes.
   The fixture proves the logic; the real file proves it is pointed at the right thing.
3. **Exclusion set** — `CORRUPT_PREDICTOR_SEASONS` + `isCorruptPredictorSeason` in
   **`lib/backtest.mjs`** (§5.1), never `scripts/backtest-run.mjs`.
4. **Filter** — first statement of `runMetric` (§5.2), returning `excludedSeasons` in the result.
5. **Report** — new print line in `formatHumanReport` (§5.3). There is no existing path to reuse.
6. **`--by-season`** — skip `(metric, Y)` in `bin/backtest.mjs:199-210` (§5.4), so no degenerate
   `n=0` block is printed.
7. **Panel** — the `:292` candidate null in `lib/panel.mjs` (§5.5), plus the `:21` comment pointer.
8. **Exclusion tests** — `airYardsShare`/`wopr`/`racr` drop 2016 on a widened panel; `targetShare`
   does **not**; the exclusion line prints; `--by-season` emits no 2016 block for the three.
9. **Regression proof, both harnesses:**
   - `node bin/backtest.mjs --metric target_share --position WR --controls overallShare,rzOwnRate`
     → **byte-identical** before/after.
   - same flags, `--metric air_yards_share` → 2016 gone from predictor years **and n drops**.
     Checking predictor years alone is insufficient — §5.2 explains why that check could pass on a
     contaminated β.
   - `node bin/panel.mjs --from 2013` (no `--write`) → 2016 rows absent from the `airYardsShare`
     candidate.
10. Docs (§6).
11. `npm test`, `npm run smoke`.
12. One commit: `fix: air-yards plausibility gate + 2016 analysis exclusion (C2)`.
    No data file changes → **no manifest change, no CDN purge.**

---

## 8. Cross-repo impact

**Two entries fire: CR-07 and CR-18.**

### CR-07 · nflverse advstats (view-only) — `Direction: both`

Fires because `validateAdvStats` in `lib/validate.mjs` is a named data-side trigger.

**Mirror (live `README.md`, CR-07, verbatim):**

> Served-shape or sparsity-gate changes need the app loader updated in the same cycle. **Now breaks a visible surface, not just a silent loader** — Market's `RACR` column would go blank for every WR/TE with no error. Ratios are recomputed season-level and never aggregated weekly. Activation into projection is parked — see the advstats grading-findings doc.

**Mirror instruction to the app repo: no code change owed, one fact worth recording.** This slice
adds a **validation** gate; it changes no served field, no shape, and not `MIN_ADVSTATS_ROWS` (the
sparsity gate this Mirror names). No existing file is rewritten, so nothing the app already fetches
changes by a byte.

The fact worth passing on: **2016's `racr` is roughly 2× its true value** (median 1.808 vs ~0.85) and
`airYardsShare`/`wopr` are depressed, because upstream air yards for that season are ~half. CR-07
records Market's `RACR` column as this family's first UI consumer. If any app surface can select
2016, those values are **wrong, not blank** — which is the failure mode this Mirror does *not* cover,
since it anticipates a blank column from a loader failure. Whether 2016 is reachable app-side is an
app-side question this repo cannot answer, and app-side triggers are frozen authority: the deliverable
here is the fact, not a claim about the app's behaviour.

### CR-18 · Signal registry rows (`docs/signal-registry.md`) — `Direction: data→app`

Fires because §6 edits `data-catalog.md`, CR-18's first data-side trigger.

**Mirror (live `README.md`, CR-18, verbatim):**

> This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

**Mirror instruction to the app repo — a real row edit is owed, and it is TWO rows, not one.**
`docs/signal-registry.md` carries advstats in two places. Both assert a clean 2016; both need the
qualification.

**Row 1 — the main registry row.** Currently *"**2012–2025, no gap** (2019 and 2025 filled);
`airYardsShare`/`racr` ~10–25% null (RB)"*. Its **coverage** cell should become:

> **2012–2025, no gap** (2019 and 2025 filled); `airYardsShare`/`racr` ~10–25% null (RB). **2016's
> air-yards-derived values (`airYardsShare`, `wopr`, `racr`) are upstream-corrupt** — Σ airYards ÷
> Σ targets is 3.96 vs a 7.80–9.07 archive range, 21 rows carry ≥10 targets with zero air yards, and
> `racr` reads ~2× true. Excluded from data-repo analysis per metric; `targetShare` is unaffected and
> retained.

**Row 2 — the *"Coverage verification — data-checked, not assumed"* table, and this is the more
load-bearing of the two.** It currently reads:

> ✅ **2012–2025, no gap** (2019 and 2025 filled). All years clear `MIN_ADVSTATS_ROWS=250` (min 324
> in 2012). `racr`/`airYardsShare` null for ~10–25% of rows (RBs / no-air-yards) every year.

That row is a **verification claim** in a section whose whole premise is *data-checked, not assumed*
— and the checks it records are row counts and null rates, neither of which looks at the air-yards
distribution. The `✅` therefore certifies 2016 as clean on evidence that could never have detected
this. It needs the same qualification **plus** an explicit note that the null-rate figure understates
2016 (104 null vs 12–55 elsewhere). Leaving a green tick next to a season this slice is excluding
from analysis is precisely the *"stale row misroutes those decisions months later"* failure the
Mirror above describes.

This is squarely CR-18's stated trigger — *"alters its … reconstructable-vs-ephemeral status"* is not
the case here, but the row's **coverage** claim materially changes: "no gap" is true of file presence
and misleading about usability. That distinction is exactly what this entry exists to keep straight,
and it is the inventory that *"governs … grading-inclusion decisions"* — which is precisely what
§5 is.

### CR-11 · Snap & red-zone usage stat keys — `Direction: data→app`

Fires because **bare `lib/panel.mjs` is a named data-side trigger**, and §5.5 edits it for real (not
just the `:21` comment an earlier draft proposed). An earlier draft omitted this entry entirely.

**Mirror (live `README.md`, CR-11, verbatim):**

> Do not remove, rename or filter these keys. **The projection degrades silently to neutral when they are absent** — no error, no test failure, no visible symptom. The blast radius is wider than the projection: `durabilitySignals` mis-classifies contributor seasons, `teamContext`'s RZ denominators go to zero (so `teamRzShare` sentinels out), the Outlook snap% column empties, and — since dp-v2 Slice 5b — Market's Efficiency `SNAP%`/`RZ SH` columns go blank the same way, and the data repo's own panel/backtest reconstructions drift the same way. The dependency is invisible at runtime; this registry entry is the only thing recording it.

**Mirror instruction to the app repo: no change owed.** This Mirror governs the five snap/RZ **stat
keys** (`off_snp`, `tm_off_snp`, `rec_rz_tgt`, `rush_rz_att`, `pass_rz_att`) in `nfl/season-totals`.
§5.5 touches none of them — it nulls one **advstats-sourced candidate** (`airYardsShare`) for one
corrupt season. `snapShare` and `rzOwnRate` remain computed from the same keys, unchanged, for every
season including 2016. The entry fires on the file, not on its subject matter.

### CR-15 · R3-FIT factor-multiplier mirror — `Direction: both`

Fires for the same reason: `lib/panel.mjs` is a named data-side trigger. An earlier draft dismissed
this entry by reasoning only about `lib/projectionFactors.mjs` — which is untouched, but is not the
file the trigger names.

**Mirror (live `README.md`, CR-15, verbatim):**

> Re-mirror the changed constant/gate/branch and **re-fit before any further exponent activation** — otherwise the fit reconstructs a factor the app no longer produces and the committed verdict in `.claude/tasks/r3fit-exponent-harness.md` stops transporting. Which positions a factor is gated to is itself part of the mirror. Note the known parity gap: `shareTrend` and `teamRzShare` have no end-to-end app-ground-truth check until a post-2026-07-18 snapshot is imported. **Nothing app-side fails when this drifts.** Scope note, verified by grep so it need not be re-derived: `dynastyScore.js` is named in `lib/projectionFactors.mjs:110` only as a *contrast* (its `weightedLinearRegression` copy is unfloored where the mirrored one floors the denominator at 4) — it is **not** mirrored and is deliberately not a trigger.

**Mirror instruction to the app repo: no re-mirror owed, but the re-fit clause is live.** No factor
transform, constant, gate or position-gating changes — `airYardsShare` is a graded **candidate**
(`lib/panel.mjs:44`), not a mirrored factor multiplier, and `lib/projectionFactors.mjs` is untouched,
so nothing the app produces is reconstructed differently.

**But the second half of this Mirror does apply.** Any committed R3-FIT verdict produced with
`--from` ≤ 2016 was fitted over corrupt 2016 `airYardsShare` and no longer reproduces after this
slice. Session 2 must **check `backtests/` and `grading/` for `*-r3fit-*` artifacts whose panel
includes 2016** and, if any exist, record in the commit message that they are superseded — the
Mirror's own words are *"re-fit before any further exponent activation."* Do not silently invalidate
a committed verdict.

**CR-02 does not fire.** No season-totals shape, key or schemaVersion is touched.

---


## 9. Done-definition

**Gate**
- [ ] `AY_PER_TARGET_MIN = 6` / `MAX = 11` exported from `lib/nflverse.mjs` beside `MIN_ADVSTATS_ROWS`
- [ ] `validateAdvStats` throws outside `[6, 11]`, naming year and ratio; **skips** when
      `Σtargets === 0` (no divide-by-zero, no NaN pass)
- [ ] Throws on `|airYardsShare| > 1`; **`-0.5` passes** (RB negatives are legitimate)
- [ ] Verified against the **real** 2016 file (throws) and 2023 (passes)
- [ ] No bypass flag added (§3.3)

**Exclusion**
- [ ] `CORRUPT_PREDICTOR_SEASONS` + `isCorruptPredictorSeason` live in **`lib/backtest.mjs`**;
      `lib/panel.mjs` imports them through its existing `./backtest.mjs` import — **no new
      `lib/ → scripts/` import anywhere**
- [ ] Covers `airYardsShare`/`wopr`/`racr` for 2016 and **not** `targetShare`
- [ ] Filter is the **first statement of `runMetric`**, so `standardizedRegression` at `:139` sees
      the filtered set — **not** applied at the `surviving` site
- [ ] `runMetric` returns `excludedSeasons`; `formatHumanReport` prints it; never silent
- [ ] `bin/backtest.mjs --by-season` **skips** excluded `(metric, Y)` — no `n=0` degenerate block
- [ ] `lib/panel.mjs:292` nulls the candidate for an excluded season; `:21`'s comment points at the set

**Proof**
- [ ] `--metric target_share … --controls overallShare,rzOwnRate` output **byte-identical**
- [ ] `--metric air_yards_share` same flags: 2016 gone from predictor years **and n drops**
- [ ] `node bin/panel.mjs --from 2013` excludes 2016 from the `airYardsShare` candidate
- [ ] `npm test` green (baseline **557** + new); `npm run smoke` green

**Docs & cross-repo**
- [ ] `data-catalog.md` advstats **Null semantics** gains the 2016 note; **Coverage stays
      "2012–2025 complete"** — the file is present and must not be implied missing
- [ ] `CLAUDE.md` Navigation map lists the two new constants
- [ ] CR-18's row edits emitted — **two** rows, including the `✅` in the "Coverage verification —
      data-checked, not assumed" table
- [ ] CR-15: `backtests/`/`grading/` checked for `*-r3fit-*` artifacts fitted over 2016; if any, the
      commit message records them as superseded
- [ ] No data file, no `manifest.json` change, no CDN purge
- [ ] `store-audit-2026-08-25.md` still modified-and-uncommitted, untouched

---

## 10. Settled decisions

- **Ship 2016 flagged; do not delete or repair** (§4) — Invariant 1, and `gamelogs/2016.json`
  corroborates at 3.90, which is evidence worth keeping.
- **Metric-scoped, not season-wholesale** (§1.3, §5) — `targetShare` measures sound in 2016.
- **Band `[6, 11]`** (§3.1) — flags exactly 2016 with ≥1.8 margin against a 7.80–9.07 range.
- **`|airYardsShare| ≤ 1`, absolute value** (§3.2) — RB negatives are deliberate.
- **No bypass flag** (§3.3).
- **The set lives in `lib/backtest.mjs`** (§5.1) — the only module both consumers already import.
- **The filter is `runMetric`'s first statement** (§5.2) — the `surviving` site would leave β
  contaminated while the report claimed exclusion.
- **`lib/panel.mjs` is in scope now** (§5.5) — it is reachable today by the same argument §1.4 makes
  for backtest, and `--write` commits a verdict.
- **Negative β is not the diagnosis** (§1.5) — 2020 has one and is clean.

---

## 11. Review disposition (2026-08-29)

Eight flags, all verified against live source, all accepted. Four changed the design; three were
defects in this plan's own reasoning rather than in the source.

| # | Flag | Call | Landed |
|---|---|---|---|
| 1 | `[mechanical]` β sees unfiltered `rows`; filter site wrong | **Accepted — design changed** | §5.2 |
| 2 | `[mechanical]` `--by-season` prints a degenerate block; `bin/backtest.mjs` omitted | **Accepted** | §5.4, §7 |
| 3 | `[mechanical]` no `skippedYears` reporting path to reuse | **Accepted** | §5.3 |
| 4 | `[strategy]` set unimportable from `lib/panel.mjs` | **Accepted — design changed** | §5.1 |
| 5 | `[edge-case]` panel reachable today; deferral contradicts §1.4 | **Accepted — scope widened** | §5.5 |
| 6 | `[registry-stale]` CR-07 anchor `:407` → live `:443` | **Confirmed, deferred** | §12.3 |
| 7 | `[registry-stale]` CR-07 names no consumers | **Confirmed, deferred** | §12.3 |
| 8 | `[cross-repo]` CR-11 and CR-15 omitted | **Accepted** | §8 |

**Flags 1, 3 and 4 were one design error in three places** — an exclusion set sited where the panel
could not import it, applied at a site the regression does not read, reported through a path that does
not exist. Collapsing to a single `lib/backtest.mjs` set filtered at `runMetric`'s first statement
fixes all three, which is why §5 is a rewrite.

**Flag 1 is the one that mattered most.** As first written this plan would have shipped a fix whose
own verification step passed on a still-contaminated β: `predictorYears` derives from `surviving`
(`:135`) while `standardizedRegression` takes raw `rows` (`:139`), so the report would have said
"2016 excluded" while the coefficient still included it.

**Flag 5 caught an internal contradiction.** §1.4 argues at length that a documented flag reaches
2016 today — then §5 deferred the panel to R1-SNAPS, when `bin/panel.mjs --from 2013` reaches it by
the identical argument, and `--write` commits the result.

**Flag 8 followed from flag 5.** Once `lib/panel.mjs` is genuinely edited rather than comment-touched,
CR-11 and CR-15 both fire on it as a named trigger. The earlier dismissal of CR-15 reasoned about
`lib/projectionFactors.mjs`, which the entry does not name.

---

## 12. Out-of-scope observations (not edits)

1. **`validateGameLogs` has the same blind spot.** `nflverse/gamelogs/2016.json` carries the same
   corrupt air yards (3.90 by the audit's measurement) and its validator has no distributional check
   either. Same fix, different family — and the app reads per-game `airYardsShare` from it (CR-09).
   Worth its own slice; this one does not widen to a second family.
2. **2020's β is negative (−.095) with a clean input distribution** (ratio 8.04). Probably a real
   COVID-season effect, but it is unexplained and sits in the same harness. Worth a look before
   R1-SNAPS widens the panel and it gets pooled without comment.
3. **CR-07 is stale in two ways, and this slice edits one of its triggers.**
   - Its `Data side` anchors `validateAdvStats:407`. Live is **`:443`** — and `:407` is now
     `validatePlayerIds`, so the anchor does not merely drift, it points at **the wrong function**.
     This plan corrects the *audit's* stale `:429` (§1.6) but the registry's own anchor is untouched.
   - Its `Triggers` are **producer-only** — `scripts/update-advstats.mjs`, `MIN_ADVSTATS_ROWS`,
     `validateAdvStats` — and name **no in-repo consumer** of the served advstats shape, though four
     are live: `scripts/backtest-run.mjs` (`loadAdvstats`), `lib/backtest.mjs:242-244,313`,
     `scripts/panel-run.mjs:59,137`, and `lib/panel.mjs:292`. §5.5 edits the last of these.

   Deferred on the rule applied consistently since the C8 slice: fold a registry correction in only
   when the entry is already being opened. This slice touches CR-07's trigger but does not edit the
   entry, and any entry edit is a synchronized two-repo change.

4. **The deferred-staleness backlog is now four entries across four slices, and that is a pattern
   rather than an accident.** CR-02's `update-nfl.mjs` anchors (`manifest-truth.md` §12.5), CR-04's
   missing `setManifestInProgress` (`repo-weight.md` §11.4), and CR-07's two above. Every one was
   found by the reviewer's standing re-verification duty, which is working exactly as designed — but
   nothing consumes its output, so the findings accumulate instead of landing.

   **Recommend a dedicated registry-reconcile slice** rather than a fifth deferral. It would be
   docs-only, would open the mirrored region once for all four, and would pay the two-repo
   coordination cost a single time instead of four. `registry-doc-truth.md` is the precedent for
   exactly that shape.
