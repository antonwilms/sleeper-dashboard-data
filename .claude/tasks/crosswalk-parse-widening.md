# D2 — crosswalk parse-widening (`nflverse/playerids.json` v1→v2)

**Model:** sonnet implements this file exactly. **Status:** planned (opus, 2026-09-05). **Slice:** D2 of the stellar-data batch (`../analysis/data-stellar-batch-brief.md` Arc A). **Repo:** data only.
**Base:** `6d28047` on `main`. **Size:** the brief says an afternoon; that still holds for the parse, but see *Findings* — two of the fields it promises do not deliver what it expects.
**Plan gate:** plan-reviewer run 2026-09-05, twelve flags, all folded in. One was an outright contradiction in this file's own first draft: it promised `bySleeper` would carry the 199 gsis-less rows while telling the implementer to leave in place the row filter that drops them.
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

Keep the existing header-lookup-by-name approach and the **header** fail-loud at `:376` — that one guards against upstream renaming a join column and must not move. Add index lookups for the eleven columns, each `null` when the field is empty or the literal `NA`.

**The per-row filter has to change, and an earlier draft of this file was self-contradictory about it.** Line `:393` currently reads `if (!gsis || gsis === 'NA' || !sleeperId || sleeperId === 'NA') continue;`, which drops every gsis-less row — so `bySleeper` could not contain the 199 sleeper-only rows this file promises in §B and test 6. Split the condition by index:

- **skip the row entirely** only when `sleeper_id` is missing or `NA`;
- **add to `ids`** only when `gsis_id` is present and not `NA` (preserving today's `ids` population exactly);
- **add to `bySleeper`** for every surviving row, with `gsisId: null` where there is none.

`ids` therefore keeps its current 6,193-row shape and `bySleeper` gains the extra 199. Anything else either breaks the additive promise or silently drops the rows the index exists to serve.

Coerce the five numeric fields (`draft_year`, `draft_round`, `draft_pick`, `draft_ovr`, plus nothing else) to `Number`, `null` on failure. Leave every id as a string: `sleeper_id` and `gsis_id` are already strings here and `pfr_id`/`cfbref_id` are not numeric at all.

Emit `undrafted: draftRound === null` per finding 2, so the meaning is in the data rather than in a consumer's head.

**Say what `draftYear` means for those rows, in the code and in the catalog.** It is 100% populated while 42% of rows are undrafted, so for that 42% it is an *entry* year, not draft capital. D6 reads both fields and would otherwise treat an undrafted player's entry year as a draft year. `undrafted` is what disambiguates them; neither field means anything alone.

### B. Shape — `schemaVersion: 2`, additive

`ids` stays keyed by `gsis_id` and keeps `sleeperId`, `name`, `position` with their current names and types, so `rekeyBySleeper` and `rekeyGameLogsBySleeper` are untouched. It gains the new fields.

Add `bySleeper`, keyed by `sleeper_id`, carrying `{ gsisId, pfrId, ktcId, cfbrefId, birthdate, draftYear, draftRound, draftPick, draftOvr, undrafted }`. This is the index D4 and D6 actually consume, and it is the only place the 199 gsis-less rows can appear.

**`rowCount` keeps counting `ids`, not `bySleeper`.** It feeds `MIN_PLAYERID_ROWS` in two places (`scripts/update-playerids.mjs:41-45`, `lib/validate.mjs:460`) and is the manifest's served `recordCount`, currently 6,185. Redefining it would move a sparsity floor and a manifest number for a reason unrelated to sparsity. Add `sleeperRowCount` beside it for the new index and leave `rowCount` alone.

**The dedup rule is not "keep last" for `bySleeper`.** Measured: 5 duplicated `gsis_id` keys with **zero** conflicting `sleeper_id`, so the existing keep-last comment at `:401` is still true and stays. But there are **6 duplicated `sleeper_id` keys, and one conflicts**: sleeper `133` appears with `gsis_id` `NA` and with `00-0022897`. Naive keep-last would store `gsisId: null` and silently drop that player's only join. **When a `sleeper_id` repeats, prefer the row that has a `gsis_id`**; fall back to last-wins when neither or both have one. Comment the reason at the site.

### C. Gates — pinned from the measurements above

`MIN_PLAYERID_ROWS = 5000` stays.

**`validatePlayerIds` needs a second argument first.** It is called as `validatePlayerIds(ids)` (`scripts/update-playerids.mjs:54`) and receives only the gsis-keyed map, whose population is 6,193. Both new gates are specified over the 6,392 rows that carry a `sleeper_id`, and that denominator exists only in `bySleeper`. Widen the signature to `validatePlayerIds(ids, bySleeper)` and update the one call site; compute the rates over `bySleeper`. Without this the gates would silently measure a different population than the one they are pinned against.

Add two fill-rate gates, both over `bySleeper`:

- `birthdate` ≥ **0.95** (measured 0.998)
- `pfr_id` ≥ **0.85** (measured 0.944)

Both sit far enough below today's value to absorb normal churn and far enough above zero to catch a column that stops being populated, which is the actual failure mode. **Do not add a gate for `draft_round`, `draft_pick`, `draft_ovr` (finding 2) or `ktc_id` (finding 1)** — a fill-rate gate on any of those fires on correct data. Write that reason into the code, or someone adds one later.

### D. Two write-path hazards, both silent

**1. Content-hash dedup would let `bySleeper` go stale.** `idsHash` hashes `ids` alone (`scripts/update-playerids.mjs:26`, compared at `:59-60`), and skips the write when it matches. A week in which only sleeper-only rows change — the 199, or the sleeper-`133` class resolving differently — produces an identical `ids` hash, no write, and a served `bySleeper` that quietly drifts from upstream. No error, no failing gate, and nothing downstream notices. **Hash both indexes.** Keep `idsHash`'s export and behaviour for anything already using it; add the combined hash at the comparison site.

**2. `schemaVersion` is written twice and nothing cross-checks them.** The output object carries it (`:75`) and `updateManifestEntry` carries it again (`:89`). Both must become 2. `test/manifest.test.mjs:110` only asserts presence, so missing the second site drifts the file against its own manifest entry silently. Add a test asserting the two agree.

---

## Cross-repo impact

### CR-18 · Signal registry rows — touched, `Direction: data→app`

> **Mirror:** This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

`scripts/update-playerids.mjs` is a named data-side trigger of this entry, and this slice adds eleven ingested fields to a served family. Emit the exact `docs/signal-registry.md` row edit the app must make — layer, source, coverage, reconstructable-vs-ephemeral, current use — as hand-back output, and update this repo's `data-catalog.md` playerids row in the same change. **This repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.** Nothing fails in either repo when this drifts, which is exactly why it has to be written down.

The row's honest content: coverage is historical and complete for all players, the family stays **internal-only** (no app reader), and the new fields are capture-only until a registry entry says otherwise. Note that age becomes *reconstructable* for grading from this point, since `birthdate` plus a season gives an as-of age for any historical season.

### No CR-06, and no new coupling yet

CR-06 covers roster and draft, not playerids — the brief is right about that. No app reader changes in this slice, so no new coupling is created and no new entry is due **now**. When the app reads `bySleeper`, that is a new coupling and lands in both registries from a parent-folder session, taking the next free `CR-NN` rather than 22 (finding 5).

**Do not try to record that in `.claude/tasks/data-repo-backlog.md`** — an earlier draft of this file said to, and that file lives in the *app* repo, which this repo cannot edit. Name it in the hand-back instead and let Anton carry it.

**The "internal-only" premise is load-bearing, so cite it.** This slice is capture-only because there is no app loader: the `> *Note:*` paragraph at `README.md:1472` records that `src/api/playerIds.js` was cut, and `data-catalog.md:143` agrees ("internal-only … no app loader"). Both sit outside the sentinel region, so they are this repo's own text, not mirrored. **`CLAUDE.md` Invariant 5 contradicts them** by listing `playerids` among the families whose `inProgress: false` is justified "because the app has no live fallback for them and must get them from the store", and `scripts/update-playerids.mjs:11` repeats the same stale claim in a comment. Two of the three sources say internal-only and they are the specific ones; Invariant 5's blanket list is the stale one. Report this rather than rewriting the invariant on the way past — a version bump on a family the app genuinely read would be an out-of-loop cross-repo action under Invariant 4, and it is only in-loop here because the loader was cut.

**`[registry-stale]` — report, do not fix.** CR-18's near-side triggers enumerate twelve ingest scripts as `update-{nfl,cfbd,ktc,roster,draft,playerids,advstats,schedule,gamelogs,teamcontext,playerstate,oline}.mjs`. Fourteen exist: `scripts/update-enrichment.mjs` and `scripts/update-playerstats.mjs` are live writers absent from the list. Flag both in the hand-back; do not edit the registry.

---

## Docs/README updates

- **`data-catalog.md`** — the playerids row: the new fields, the two new gates with their measured values, and the `undrafted` semantics. State that `ktc_id` is served but 7% populated, so nobody plans a join on it.
- **`README.md` → `nflverse/playerids.json` (`:431`)** — the served-shape section: `schemaVersion: 2`, the `bySleeper` index, the field list, the dedup rule for repeated `sleeper_id`, and that the file is now minified. **Three existing claims in that section go false and must be corrected in the same edit**, not left for a reader to trip over:
  - `:454` "**Forward map only.** The map is a bijection (`gsis_id` and `sleeper_id` each unique) … **No reverse index is served**". This slice serves exactly that reverse index. Note also that the bijection half was *already* false before this slice: the measurements in Step 0 found 5 duplicated `gsis_id` and 6 duplicated `sleeper_id` values, one of the latter conflicting. Correct both halves.
  - `:461` "the app re-asserts the same gate on `rowCount`" — there is no app loader (see *Cross-repo impact*), so this describes something that does not exist.
  - `:465` "the app has no live fallback — it must read the crosswalk from the store" — same stale premise, and the same one Invariant 5 repeats.
- **`CLAUDE.md`** — two separate things. Invariant 4's version list does not name playerids; add it at v2 only if the list is meant to be exhaustive, checking rather than assuming. Invariant 5's stale grouping of playerids under "the app has no live fallback for them" is a **report, not an edit** — see *Cross-repo impact*. Also correct the same stale claim in `scripts/update-playerids.mjs:11`'s header comment, which this slice is editing anyway.

## Tests to add

**Two existing tests break and must be updated, not worked around.** `test/nflverse.test.mjs:259-260` asserts `deepEqual(ids['00-0034796'], { sleeperId, name, position })` on the whole entry object, so every added field fails it. Update both to the full new shape. Do **not** loosen them to a subset match or a property check: the strict whole-object form is what makes this file's "additive, current names and types" promise verifiable, and weakening it to accommodate the change is the one edit that would make the promise unfalsifiable.

`test/nflverse.test.mjs`, new cases:

1. A fixture with every new column parses, and each field lands with the right type — numbers coerced, ids left as strings.
2. `NA` and empty string both become `null`, per column.
3. `undrafted` is `true` exactly when `draftRound` is null, and false for a drafted player.
4. Duplicate `gsis_id` with matching `sleeper_id` still keeps last and stays lossless — the existing guarantee, now pinned by a test rather than a comment.
5. **Duplicate `sleeper_id` where one row has a `gsis_id` and the other has `NA` resolves to the row with the id.** This is the sleeper-`133` case; without this test the naive implementation passes everything else.
6. `bySleeper` includes rows that have no `gsis_id`, with `gsisId: null`.
7. `ids` round-trips: every `gsis_id` in `ids` appears in `bySleeper` under its `sleeperId`, and the shared fields agree.

8. A row with a `sleeper_id` and no `gsis_id` is skipped from `ids` but present in `bySleeper` with `gsisId: null` — the split-filter behaviour from §A. Paired with test 6 this is what pins the 199 rows.
9. Content-hash dedup notices a change confined to sleeper-only rows: two parses whose `ids` are identical but whose `bySleeper` differs must produce different hashes, or the write is skipped and the index goes stale (§D1).

`test/manifest.test.mjs` — reconcile still passes with the v2 entry, and the `schemaVersion` in the written file equals the one in its manifest entry (§D2).

`lib/validate.mjs` coverage: each new gate throws below its threshold and passes above it, and **a fixture where every `draft_round` is null still passes** (the regression test for finding 2).

## Risks

- **The brief called this an afternoon and the parse still is.** The cost is in the two findings, which are roadmap corrections rather than code. Do not let them expand the slice: parse, serve, gate, test, document, hand back.
- **Size.** 2.79 MB minified is a fourfold growth in a file the app does not read. Acceptable now; it would need revisiting the day an app reader appears, and the pointer variant's number is recorded above for that conversation.
- **Do not touch `rekeyBySleeper` / `rekeyGameLogsBySleeper`.** They consume `ids` keyed by `gsis_id`, which this slice leaves alone. If either needs a change, stop and report — that would mean the additive promise broke.

---

## Fix pass 1

Session 1 triage of the implementation-reviewer flags on `5cba77f..74288f5` (PR #3). **The fix-applier implements this section and nothing else.** Work on the existing `d2-crosswalk-parse-widening` branch and push to the same PR; do not open a new one.

Two of these trace to gaps in this file rather than to the implementation. Noted where they do, so the record is honest about where the defect entered.

### 1. Three of the eleven columns were dropped — **must fix**

`parsePlayerIdsCsv` indexes eight new columns (`lib/nflverse.mjs:416-423`). `espn_id`, `college` and `team` are indexed nowhere. This is a consequence of the declared deviation that the hand-back did not mention: §B put those three in `ids` ("it gains the new fields"), the implementation correctly left `ids` alone, and nothing in this file then forced the question — so they fell through the gap.

**This file caused that, and the brief asked for eleven.** Do not narrow the brief silently.

**Fix.** Add `espnId`, `college` and `team` to `bySleeper`, alongside the eight already there. All three are plain strings through `playerIdCell`. Measured cost is roughly 0.15 MB on a 1.68 MB file, which is not a reason to drop a field the brief named. Update the `bySleeper` shape in the JSDoc, the README served-shape section and the `data-catalog.md` row, whose current "not parsed by this slice" line becomes wrong.

**Also fix the false comment this created.** `test/nflverse.test.mjs:253` reads "the wide header carries all eleven columns `parsePlayerIdsCsv` now indexes" while the parser indexed eight. After this fix the comment becomes true; make sure it is, rather than leaving it to be true by luck.

### 2. Two size figures are presented as measured and are wrong — **must fix (this file's error)**

`README.md:441` says "roughly a sevenfold size increase over v1 (measured: 0.67 MB v1 → 2.79 MB v2 minified)" and `scripts/update-playerids.mjs:85` repeats "sevenfold". Both come from this file's Step 0 table, which costed a variant where `ids` also carried the new fields. The shipped shape measures **1.68 MB**, about **2.5×**.

**Fix.** Correct both sites to the measured 1.68 MB and ~2.5×, and re-measure after fix 1 lands rather than adjusting the number by arithmetic — the point of the flag is that a figure labelled "measured" must come from the thing that was built. Step 0's table stays as it is: it is a record of what was costed at planning time, and it is now annotated by this section.

### 3. A `draft_round` format change would read as "everyone undrafted" — **must fix**

`undrafted: draftRound === null` cannot distinguish undrafted from unparseable, and §C deliberately leaves the draft fields ungated, so an upstream format change yields `undrafted: true` on 100% of rows with nothing to catch it. Finding 2 is why a fill-rate *floor* is wrong there; it is not a reason to have no check at all.

**Fix.** Add a ceiling rather than a floor, in `validatePlayerIds`: throw when the undrafted rate exceeds **0.75** (measured 0.42). A ceiling respects finding 2 — the legitimate 42% passes comfortably — while catching the one failure mode the absent floor leaves open. Comment it as the counterpart to the deliberately-ungated fields, so the next reader sees why it is a ceiling.

### 4. Both §D fixes are pinned by tests that cannot fail — **must fix**

- **Dedup (§D1).** `test/nflverse.test.mjs:447` asserts only that `idsHash` matches while `bySleeperHash` differs. Reverting `scripts/update-playerids.mjs:74` to the old single-hash comparison leaves it green, so the test does not pin the fix. **Extract the comparison into a small pure predicate** — `shouldWritePlayerIds(existing, ids, bySleeper)` in the same module, exported — and test that directly: identical both → false; `bySleeper`-only change → **true**; `ids`-only change → true; no existing file → true. Keep `idsHash` and `bySleeperHash` exported as they are.
- **Manifest (§D2).** `test/manifest.test.mjs:124` compares the served file's `schemaVersion` to its manifest entry, and both are still 1 because the data file has not been regenerated — so it passes on the pre-change state and would pass on a broken one. **Rewrite it against a constructed fixture** rather than the live file: given a written file and its manifest entry, the two agree. Do not regenerate `nflverse/playerids.json` in this PR to make the test meaningful; the Wednesday Action owns that write.

### 5. `sourceSeason` changed behaviour unasked — **must fix**

The widened row filter means the first row to reach the `sourceSeason` capture can now be a gsis-less one, so a leading such row's `db_season` can win where it previously could not (`lib/nflverse.mjs:445-449`). No line of this file asked for that and no test pins it.

**Fix.** Restore the prior behaviour by capturing `sourceSeason` only from rows that have a `gsis_id`, and add a one-line comment saying the widened filter is why the guard is explicit now. Add a test with a leading gsis-less row carrying a different `db_season`.

### 6. Two test names now describe behaviour the diff removed — **must fix**

`test/nflverse.test.mjs:273` and `:283` are named "row missing gsis_id is skipped" and "row with NA gsis_id is skipped". Those rows are no longer skipped: they land in `bySleeper`. Rename both and extend each to assert the row is absent from `ids` **and** present in `bySleeper` with `gsisId: null`. A test whose name asserts the opposite of the behaviour is worse than no test.

### 7. Widen the NA coverage — **must fix**

`test/nflverse.test.mjs:366` ("NA and empty string both become null, per column") exercises the literal `NA` for two of the eight columns only; the rest are empty-string. The `NA` sentinel is the one upstream-specific case here, so cover every column for both forms, including the three added in fix 1.

### No change — considered and dismissed

- **`ids` not gaining the new fields.** Session 2's stated reason was wrong — `rekeyBySleeper` and `rekeyGameLogsBySleeper` read only `crosswalkIds[gsis]?.sleeperId`, so extra fields would have been harmless. But the outcome is better than what §B specified: one payload, no duplication, and 1.68 MB against the 2.79 MB §B would have produced. **Keep it.** §B's "it gains the new fields" is superseded by this section; fix 1 is what closes the real gap it left.
- **Invariant 4's version list left unedited.** Verified correct: the list omits every other v1 family, so it is not exhaustive and playerids does not belong in it.
- **The two strict `deepEqual` tests passing unmodified.** Correct and expected once `ids` is unchanged. Leave them strict.
- **CR-18's Mirror absent from the commit message.** The task file carries it and the hand-back emitted the row edit in full, which is the deliverable. No commit-message rewrite.

### Leave alone

`ids`'s shape and population. `rekeyBySleeper` / `rekeyGameLogsBySleeper`. `MIN_PLAYERID_ROWS` and `rowCount`'s meaning. The two-argument `validatePlayerIds` signature and both fill-rate floors. The `bySleeper` dedup preference logic, which the review verified correct in all four orderings. `CLAUDE.md` — Invariant 5 stays a report, not an edit. Do not touch the registry, and do not regenerate any data file.
