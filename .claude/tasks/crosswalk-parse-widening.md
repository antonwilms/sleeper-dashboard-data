# D2 — crosswalk parse-widening (`nflverse/playerids.json` v1→v2)

**Model:** sonnet implements this file exactly. **Status:** planned (opus, 2026-09-05). **Slice:** D2 of the stellar-data batch (`../analysis/data-stellar-batch-brief.md` Arc A). **Repo:** data only.
**Base:** `6d28047` on `main`. **Size:** the brief says an afternoon; that still holds for the parse, but see *Findings* — two of the fields it promises do not deliver what it expects.
**Plan gate:** plan-reviewer has not run on this file yet.
**Unblocks:** D4 (the `pfr_id` join for snap counts), D6 (age and draft capital in the retrospective harness). Both are data-side.

**Problem.** `scripts/update-playerids.mjs` fetches `db_playerids.csv` every Wednesday and throws away all but three fields. Age, draft capital and five external ids are in the file already, unparsed. Age is the precondition for grading the age curve, which the review names as one of the never-tested factors.

**Capture-only.** Nothing here feeds projection, scoring or grading until a registry entry says so. This slice widens what is served and nothing else.

---

## Step 0 — live source measured, not assumed

The brief requires a live header fetch in Session 1 because upstream names drift. Done 2026-09-05 against `https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv` (2.63 MB, 12,492 rows, 35 columns).

**All eleven column names in the brief are present and exactly as written** — `birthdate`, `draft_year`, `draft_round`, `draft_pick`, `draft_ovr`, `pfr_id`, `ktc_id`, `cfbref_id`, `espn_id`, `college`, `team`. No drift. `age`, `height`, `weight` and `merge_name` are also there and unclaimed.

Row populations: 12,492 total · **6,392 with a `sleeper_id`** · 6,193 with both `sleeper_id` and `gsis_id` (what the parser keeps today) · **199 with a `sleeper_id` but no `gsis_id`**, invisible to the current parser.

Fill rates over the 6,392 rows that have a `sleeper_id`:

| field | rate | field | rate |
|---|---|---|---|
| `draft_year` | 1.000 | `pfr_id` | 0.944 |
| `team` | 1.000 | `cfbref_id` | 0.534 |
| `birthdate` | 0.998 | `draft_round` | 0.584 |
| `college` | 0.999 | `draft_pick` | 0.583 |
| `espn_id` | 0.976 | `draft_ovr` | 0.583 |
| | | **`ktc_id`** | **0.071** |

### Findings that change the slice

**1. `ktc_id` is 7% populated. D7's premise does not hold.** The review's §7.2 and the slice list both say the deterministic KTC join is unlocked because "`ktc_id` is in `db_playerids.csv`". It is in the file, and it is empty for 93% of players who have a Sleeper id. It cannot replace the runtime name match. Parse and serve it anyway — it costs nothing and may fill upstream — but **D7 needs re-scoping before it is planned**, and that is a roadmap correction, not something this slice can fix. Flag it in the hand-back.

**2. A null `draft_round` means undrafted, not unknown. Verified, not inferred.** `draft_year` is 100% populated while `draft_round` is 58%, which looks like sparsity and is not. Cross-checked against this repo's own `nflverse/draft/draft_picks.json` (4,350 picks, 2010–2026), matching on name and draft year:

- rows **with** a `draft_round`: 3,192 of 3,306 appear in the draft file — **96.6%**
- rows **without** one: 4 of 2,519 appear — **0.2%**

So the missing 42% are undrafted free agents, and the absence is itself the signal. Two consequences, both load-bearing: **never gate `draft_round` on a fill rate** (it would fail on every run forever), and **emit an explicit `undrafted: true` rather than leaving a consumer to read `null` as "unknown"**. D6 will otherwise treat UDFAs as missing data instead of as the population they are.

**3. This slice is covered by CR-18, which the brief says it is not.** The brief states "registry: CR-06 covers roster & draft, **not** playerids — playerids is internal-only today… no CR entry is needed now." That is wrong on the second half: `scripts/update-playerids.mjs` is named explicitly in CR-18's data-side `Triggers`, and CR-18 fires on exactly this change — a data-repo change that "adds, removes or reclassifies an ingested field". Its Mirror must be emitted. See *Cross-repo impact*. The brief is right that CR-06 does not cover playerids and right that no app reader changes.

**4. The served file grows sevenfold. Minify it.** Measured by building the real output:

| variant | pretty | minified |
|---|---|---|
| current v1 (3 fields) | 0.67 MB | — |
| v2, `bySleeper` carrying the brief's 8-field subset | 4.08 MB | **2.79 MB** |
| v2, `bySleeper` duplicating every field | 4.92 MB | 3.38 MB |
| v2, `bySleeper` as a bare pointer to `gsis_id` | 2.60 MB | 1.80 MB |

`writeJsonStable` already takes `{ minify: true }` and both `update-nfl.mjs:153` and the F-24 migration use it. **Write minified, with the brief's 8-field `bySleeper`.** The pointer variant saves a further 1 MB but forces every consumer through a two-step lookup and leaves the 199 gsis-less rows with no payload at all; duplication inside a single generated file cannot drift, because both indexes come from one parse in one run. If a reviewer prefers the pointer, the number above is what it buys.

**5. `CR-22` is already claimed by D1b.** That slice's task file names its coupling as the CR-22 candidate. The brief also calls this slice's future coupling a CR-22 candidate. Whichever lands first takes the number; say "the next free `CR-NN`" in the hand-back rather than a literal 22.

---

## Design

### A. Parse — `parsePlayerIdsCsv` in `lib/nflverse.mjs:359`

Keep the existing header-lookup-by-name approach and the fail-loud on missing `gsis_id`/`sleeper_id` (`:376`). Add index lookups for the eleven columns, each `null` when the field is empty or the literal `NA` — the existing `'NA'` sentinel handling at `:393` is the pattern.

Coerce the five numeric fields (`draft_year`, `draft_round`, `draft_pick`, `draft_ovr`, plus nothing else) to `Number`, `null` on failure. Leave every id as a string: `sleeper_id` and `gsis_id` are already strings here and `pfr_id`/`cfbref_id` are not numeric at all.

Emit `undrafted: draftRound === null` per finding 2, so the meaning is in the data rather than in a consumer's head.

### B. Shape — `schemaVersion: 2`, additive

`ids` stays keyed by `gsis_id` and keeps `sleeperId`, `name`, `position` with their current names and types, so `rekeyBySleeper` and `rekeyGameLogsBySleeper` are untouched. It gains the new fields.

Add `bySleeper`, keyed by `sleeper_id`, carrying `{ gsisId, pfrId, ktcId, cfbrefId, birthdate, draftYear, draftRound, draftPick, draftOvr, undrafted }`. This is the index D4 and D6 actually consume, and it is the only place the 199 gsis-less rows can appear.

**The dedup rule is not "keep last" for `bySleeper`.** Measured: 5 duplicated `gsis_id` keys with **zero** conflicting `sleeper_id`, so the existing keep-last comment at `:401` is still true and stays. But there are **6 duplicated `sleeper_id` keys, and one conflicts**: sleeper `133` appears with `gsis_id` `NA` and with `00-0022897`. Naive keep-last would store `gsisId: null` and silently drop that player's only join. **When a `sleeper_id` repeats, prefer the row that has a `gsis_id`**; fall back to last-wins when neither or both have one. Comment the reason at the site.

### C. Gates — pinned from the measurements above

`MIN_PLAYERID_ROWS = 5000` stays. Add two fill-rate gates in `validatePlayerIds` (`lib/validate.mjs`), both measured over rows carrying a `sleeper_id`:

- `birthdate` ≥ **0.95** (measured 0.998)
- `pfr_id` ≥ **0.85** (measured 0.944)

Both sit far enough below today's value to absorb normal churn and far enough above zero to catch a column that stops being populated, which is the actual failure mode. **Do not add a gate for `draft_round`, `draft_pick`, `draft_ovr` (finding 2) or `ktc_id` (finding 1)** — a fill-rate gate on any of those fires on correct data. Write that reason into the code, or someone adds one later.

---

## Cross-repo impact

### CR-18 · Signal registry rows — touched, `Direction: data→app`

> **Mirror:** This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

`scripts/update-playerids.mjs` is a named data-side trigger of this entry, and this slice adds eleven ingested fields to a served family. Emit the exact `docs/signal-registry.md` row edit the app must make — layer, source, coverage, reconstructable-vs-ephemeral, current use — as hand-back output, and update this repo's `data-catalog.md` playerids row in the same change. **This repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.** Nothing fails in either repo when this drifts, which is exactly why it has to be written down.

The row's honest content: coverage is historical and complete for all players, the family stays **internal-only** (no app reader), and the new fields are capture-only until a registry entry says otherwise. Note that age becomes *reconstructable* for grading from this point, since `birthdate` plus a season gives an as-of age for any historical season.

### No CR-06, and no new coupling yet

CR-06 covers roster and draft, not playerids — the brief is right about that. No app reader changes in this slice, so no new coupling is created and no new entry is due **now**. When the app reads `bySleeper`, that is a new coupling and lands in both registries from a parent-folder session. Record it in `.claude/tasks/data-repo-backlog.md`'s app-side mirror as the next free `CR-NN`, not as CR-22 (finding 5).

---

## Docs/README updates

- **`data-catalog.md`** — the playerids row: the new fields, the two new gates with their measured values, and the `undrafted` semantics. State that `ktc_id` is served but 7% populated, so nobody plans a join on it.
- **`README.md` → `nflverse/playerids.json` (`:431`)** — the served-shape section: `schemaVersion: 2`, the `bySleeper` index, the field list, the dedup rule for repeated `sleeper_id`, and that the file is now minified.
- **`CLAUDE.md`** — Invariant 4's version list does not currently name playerids; add it at v2 if the list is meant to be exhaustive, and leave it alone if it is not. Check before editing rather than assuming.

## Tests to add

`test/nflverse.test.mjs`:

1. A fixture with every new column parses, and each field lands with the right type — numbers coerced, ids left as strings.
2. `NA` and empty string both become `null`, per column.
3. `undrafted` is `true` exactly when `draftRound` is null, and false for a drafted player.
4. Duplicate `gsis_id` with matching `sleeper_id` still keeps last and stays lossless — the existing guarantee, now pinned by a test rather than a comment.
5. **Duplicate `sleeper_id` where one row has a `gsis_id` and the other has `NA` resolves to the row with the id.** This is the sleeper-`133` case; without this test the naive implementation passes everything else.
6. `bySleeper` includes rows that have no `gsis_id`, with `gsisId: null`.
7. `ids` round-trips: every `gsis_id` in `ids` appears in `bySleeper` under its `sleeperId`, and the shared fields agree.

`test/manifest.test.mjs` — reconcile still passes with the v2 entry.

`lib/validate.mjs` coverage: each new gate throws below its threshold and passes above it, and **a fixture where every `draft_round` is null still passes** (the regression test for finding 2).

## Risks

- **The brief called this an afternoon and the parse still is.** The cost is in the two findings, which are roadmap corrections rather than code. Do not let them expand the slice: parse, serve, gate, test, document, hand back.
- **Size.** 2.79 MB minified is a fourfold growth in a file the app does not read. Acceptable now; it would need revisiting the day an app reader appears, and the pointer variant's number is recorded above for that conversation.
- **Do not touch `rekeyBySleeper` / `rekeyGameLogsBySleeper`.** They consume `ids` keyed by `gsis_id`, which this slice leaves alone. If either needs a change, stop and report — that would mean the additive promise broke.
