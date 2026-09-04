# Re-ingest 2016 — advstats + gamelogs (retires C2's workaround)

**Type:** two-family re-ingest of one completed season under Invariant 1's error-correction
allowance, plus retirement of the analysis exclusion C2 added as a workaround.
**Session model:** plan (opus, this file). Implementation is a separate sonnet session — do not edit
source here.
**Source:** found during C2's implementation review (`957d27f`), not in the audit. Verified against
live source, live data and live upstream **2026-08-30** at HEAD `957d27f`.

**The finding.** C2 gated and excluded 2016 because the served air-yards data is corrupt. It is —
but **upstream is not**. The corruption came from the frozen legacy `player_stats` tag; B1's
`STATS_BASE` switch on 2026-07-03 fixed the source and re-ingested only 2019 and 2025. 2016 kept the
bad data. Re-fetching it today returns clean data that **passes C2's own gate**. So the fix is to
correct the data, not to keep routing around it.

**Working-tree note.** `store-audit-2026-08-25.md` is modified and uncommitted. **Do not stage,
commit, revert or edit it.** Nothing here touches it.

---

## 1. Verified facts

### 1.1 · Both families are corrupt, from one CSV

`advstats` and `gamelogs` both derive from `stats_player_week_<year>.csv` via `fetchPlayerStatsCsv`
(`lib/nflverse.mjs:421` — re-derived live, **not** copied from CR-09's trigger list, which says `:412`; see §11.5). One bad source file, two bad served families:

| Family | served 2016 | live 2016 | neighbours (2015 / 2017) |
|---|---|---|---|
| advstats (Σ AY ÷ Σ tgt) | **3.96** | **8.48** | 8.53 / 8.42 |
| gamelogs, REG-only | **3.90** | **8.38** | 8.41 / 8.36 |

Row-level, advstats: `airYards == 0` falls from **104 → 30** rows, and among players with ≥10
targets from **21 → 1**. 2015 and 2017 carry 36/1 and 32/0 respectively, so the live 2016 figures are
ordinary.

### 1.2 · 2016 is the only casualty — checked, not assumed

Twelve seasons came from the legacy tag, so the obvious worry was that 2016 is the tip of something.
It is not. Served vs live, advstats:

| 2012 | 2014 | **2016** | 2018 | 2020 | 2022 | 2024 |
|---|---|---|---|---|---|---|
| −0.17 | −0.02 | **+4.52** | 0.00 | −0.01 | −0.01 | −0.01 |

Every season except 2016 matches within ±0.02, apart from 2012's −0.17 — an ordinary upstream
revision, with both values comfortably in band. **Only 2016 needs re-ingesting.**

### 1.3 · C2's gate already validates the fix

`node bin/update.mjs advstats --year 2016 --dry-run` **passes** at HEAD — the band added by C2 accepts
the live data. That is the confirmation this slice is built on: the guard that was written to catch
the corruption now certifies its replacement.

### 1.4 · The diff is wider than air yards

This replaces whole season files, not selected fields. Record counts move:

| | served | live |
|---|---|---|
| advstats players | 482 | ~484 (486 aggregated, 2 unmapped) |
| gamelogs game rows | 5,796 | 5,804 |

So the change is an **upstream revision**, of which the air-yards correction is the dominant part but
not the whole. §7's verification must therefore confirm the change is *explicable*, not assert that
only air yards moved.

### 1.5 · Mechanical facts

- `--force` is required for both families — `scripts/update-advstats.mjs:112,120` gates completed
  past seasons behind it; `update-gamelogs.mjs` mirrors this.
- Content-hash dedup means a no-op run writes nothing; `--force` is what makes the write happen.
- `CORRUPT_PREDICTOR_SEASONS` / `isCorruptPredictorSeason` live in `lib/backtest.mjs:23,30`, consumed
  at `scripts/backtest-run.mjs:138`, `bin/backtest.mjs:210`, `lib/panel.mjs:294`.
- `data-catalog.md` carries C2's known-bad note in the advstats **Null semantics** row, and both
  families carry a **Provenance split** line naming 2019/2025 as the current-tag seasons.

---

## 2. Scope

**In:** re-ingest 2016 for both families; empty the exclusion set; correct the docs; purge the CDN.

**Out, deliberately:**

| Not doing | Why |
|---|---|
| Re-ingesting other seasons | §1.2 — only 2016 diverges materially. 2012's −0.17 is an ordinary revision, in band both ways, and re-ingesting it would rewrite a completed season for no correction. |
| Removing C2's gate | It is a permanent forward guard and it just proved its worth by validating the replacement (§1.3). |
| Adding the same gate to `validateGameLogs` | Still owed (C2 §12.1) and still a separate slice — but note §11.1: this re-ingest changes the argument for it. |
| Deleting the exclusion **mechanism** | §5 — the set is emptied, the machinery stays. Reasoning and the alternative are both recorded there. |

---

## 3. The re-ingest

```sh
node bin/update.mjs advstats --year 2016 --force
node bin/update.mjs gamelogs --year 2016 --force
```

Both write their season file **and** update their manifest entry (`recordCount`, `lastModified`)
through the scripts' own `updateManifestEntry` call. No hand-editing of either.

**Run advstats first.** Not load-bearing — the two are independent — but advstats is the family C2
gated, so a failure there is the informative one and should surface before gamelogs runs.

**Expect the gate to pass, and treat a failure as a stop.** If `validateAdvStats` throws, upstream
has changed since 2026-08-30 and the whole premise of this slice is void — stop and re-verify §1.1
rather than reaching for `--force` harder or touching the band.

---

## 4. Invariant 1 — this uses the allowance, it is not an exception to it

Invariant 1 reads: *"Completed past seasons are never overwritten **except to correct an error**
(requires a committed diff explaining why)."*

This is precisely that carve-out, so — unlike F-24 — **no new exception note belongs in CLAUDE.md**.
F-24 needed one because dropping unread fields is not an error correction; this is. What the
invariant *does* require is the committed diff explaining why, and that requirement is met by the
commit message, which must state:

- what was wrong (served 3.96 / 3.90 vs an 7.80–9.07 archive band),
- why it was wrong (legacy `player_stats` tag; B1's 2026-07-03 `STATS_BASE` switch fixed the source
  but re-ingested only 2019 and 2025),
- what replaced it (live 8.48 / 8.38), and
- that only 2016 was affected (§1.2, with the seasons checked named).

The durable record of the re-ingest belongs in `data-catalog.md`'s Provenance split lines (§6), where
the family's ingest history already lives — not in Invariant 1.

---

## 5. Retiring C2's exclusion

C2's `CORRUPT_PREDICTOR_SEASONS` becomes **false** the moment 2016 is clean. Remove the 2016 entries:

```js
export const CORRUPT_PREDICTOR_SEASONS = {
  // Empty since <sha> (2026-08-30): 2016's air-yards corruption was a stale legacy-tag
  // ingest, corrected by re-ingesting from the current stats_player tag — not a permanent
  // property of the season. See reingest-2016.md.
  // Populate per metric if a served season is ever found unfit for grading; the machinery
  // at scripts/backtest-run.mjs (runMetric's first statement), bin/backtest.mjs (--by-season)
  // and lib/panel.mjs:294 reads this and needs no further wiring.
};
```

**Keep the machinery, empty the set.** The three call sites and their tests stay.

*Reasoning, and the alternative.* The gate (§1.3) only guards data at **ingest**; it cannot help with
a season already on disk and already served. The exclusion set is the only lever for that case, it
cost a reviewed slice to build, and an explicitly-empty registry carrying its own provenance is not
the same thing as orphaned dead code. **The counter-argument is real** — the C6 slice's own lesson was
that unused helpers left behind are a defect, and an empty set with three call sites is a larger
version of that. If Anton prefers, ripping the mechanism out entirely is a clean alternative and the
git history preserves it; say so before Session 2 starts, because it changes §5 from a one-line edit
to a four-file removal.

### 5.1 · Two comment sites also assert the corruption as fact

Neither is in the snippet above, and both become false:

- **`lib/backtest.mjs:17-22`** — the JSDoc directly above the set: *"2016: Σ airYards ÷ Σ targets =
  3.96 … 21 rows carry ≥10 targets with zero air yards."* Replace with the provenance comment, not
  merely delete — the *reason* the set is empty is the useful part.
- **`lib/panel.mjs:20-23`** — `PANEL_DEFAULTS`' inline note: *"see `CORRUPT_PREDICTOR_SEASONS` in
  ./backtest.mjs — 2016 stays excluded from `airYardsShare` regardless of this bound."* The pointer
  is still worth keeping for the R1-SNAPS session; the "2016 stays excluded" clause is not.

**Editing `lib/panel.mjs` is not free** — bare `lib/panel.mjs` is a named data-side trigger of CR-11
and CR-15, exactly as C2 established. §8 emits both.

### 5.2 · The tests need a save/restore, because there is no injection seam

C2's exclusion tests will fail against an empty set. An earlier draft said to "re-point them at a
synthetic season", which has **nowhere to point**: `runMetric` reads module-scope
`CORRUPT_PREDICTOR_SEASONS` directly (`scripts/backtest-run.mjs:26,138`) and `buildPanelRow` calls the
statically-imported `isCorruptPredictorSeason` — `buildPanelRow`'s `config` (`lib/panel.mjs:237`)
carries only the games minimums. Neither accepts an injected exclusion.

**The tests are already synthetic**, which makes this easy: `test/backtest-integration.test.mjs:336`
builds a standalone 2015–2017 fixture and merely *uses 2016 as a year label*. They fail only because
the set no longer lists 2016 — not because any real data changed.

So: **populate the set inside the test and restore it afterwards.** `CORRUPT_PREDICTOR_SEASONS` is an
`export const` binding around a **mutable object**, so a `before`/`after` pair that sets
`CORRUPT_PREDICTOR_SEASONS.airYardsShare = [2016]` and deletes it again works with no production
change. Restore in `after`, not at the end of the test body, so a failing assertion cannot leak the
entry into other tests.

**Do not add an injection seam for this.** It would widen a production signature to serve a test, and
the save/restore is three lines. **Do not delete the tests** either — they are the only coverage of
the three call sites, and they matter precisely for whenever the set is next populated.

---

## 6. Docs

**`data-catalog.md`, advstats — Null semantics: drop the corruption claims, KEEP the band.** An
earlier draft said to remove C2's sentence entirely. That would delete the **only** record in
`data-catalog.md` of the `AY_PER_TARGET_MIN`/`MAX` gate — the family's **Sparsity gate** row names
only `MIN_ADVSTATS_ROWS = 250`, and the band appears nowhere else in the file. §2 keeps that gate
deliberately and §1.3 leans on it, so deleting its sole catalog record would breach CLAUDE.md's
Done-definition item 5 (a family's row must reflect its gate).

Remove only the claims that become false — that 2016 is upstream-corrupt and excluded from analysis
— and retain a clause recording that ingest asserts Σ`airYards` ÷ Σ`targets` ∈ [6, 11]. Better still,
move the band to the **Sparsity gate** row where it belongs, and leave Null semantics as
*"ratios null on zero denominators; RB negatives emitted"*.

**`data-catalog.md`, both families — Provenance split:** 2016 joins the current-tag group. The
advstats line currently reads *"seasons 2012–2018 and 2020–2024 were fetched from the legacy
`player_stats` tag … Seasons 2019 and 2025 were added by B1 on 2026-07-03 from the current
`stats_player` tag"*. It becomes 2012–2015, 2017–2018 and 2020–2024 from the legacy tag; **2016**,
2019 and 2025 from the current tag — with 2016 noted as a **2026-08-30 correction** of a corrupt
legacy-tag ingest, not an original fill. Mirror the same change in the gamelogs Provenance line.

**Coverage rows are unchanged** in both families — 2012–2025 was complete before and after. Do not
touch them.

---

## 7. Step order

**The baseline must come after the set is emptied — an earlier draft had this backwards.** At HEAD
the exclusion is live, so `bin/backtest.mjs:210` `continue`s over Y=2016 and `runMetric` filters those
rows out: running the baseline command today yields **zero** 2016 blocks (verified). A true
before/after needs the *same code* on both sides, differing only in the data.

1. **Empty the set** (§5) and fix the two comment sites (§5.1). Do not touch the data yet.
2. **Capture the "before"** with the corrupt file still on disk:
   `node bin/backtest.mjs --metric air_yards_share --position WR --controls overallShare,rzOwnRate --by-season`
   → 2016 now appears, with the sign-flipped β (expect ≈ −0.036, raw r ≈ 0.370). Save the output.
3. `node bin/update.mjs advstats --year 2016 --force` — expect the gate to pass (§3).
4. `node bin/update.mjs gamelogs --year 2016 --force`.
5. Verify the served files: advstats ratio ≈ **8.48**, gamelogs REG-only ≈ **8.38**; manifest
   `recordCount`/`lastModified` updated for both; **no other season's file changed**.
6. **Capture the "after"** — same command as step 2. 2016's β should now sit in line with its
   neighbours rather than sign-flipped. Both numbers go in the commit message.
7. Restore the exclusion tests with the save/restore pattern (§5.2).
8. Docs (§6).
9. `npm test` — count should not drop from **570**. `npm run smoke` green.
10. One commit: `fix: re-ingest 2016 advstats + gamelogs from the current stats_player tag`.
    Files: two season files, `manifest.json`, `lib/backtest.mjs`, `lib/panel.mjs`, the revised tests,
    `data-catalog.md`.
11. `git pull --rebase origin main` — **manifest conflicts resolve as a union** (this slice adds and
    removes no entries; it only updates two existing ones, so the standard rule applies unmodified,
    unlike `repo-weight.md`).
12. **`git push origin main`** — plain push, never `--force`.
13. **CDN purge, and only now** — `manifest.json` first, then **both season files**. These are
    re-runs of existing seasons with live cached copies at the old bytes, so the season files
    themselves must be purged. **Purging before the push would re-cache the old bytes and silently
    undo the whole slice** — CLAUDE.md's sequence is commit → pull --rebase → resolve → push → purge,
    and an earlier draft of this plan omitted the push between the last two.

*A note on the "before" value:* it is **not** unrecoverable, contrary to an earlier draft. The
pre-re-ingest file is in git, so the baseline can be re-derived later from
`git show <sha>:nflverse/advstats/2016.json`. Capturing it in step 2 is convenience, not necessity —
but the commit message is much more useful with it.

---

## 8. Cross-repo impact

**Five entries fire: CR-07, CR-09, CR-18, CR-11, CR-15.** The first three change **served values**
for one season — no shape, no floor, no schemaVersion. The last two fire on **file identity**: §5
edits `lib/backtest.mjs` and `lib/panel.mjs`, and both are named data-side triggers. An earlier draft
said "three", repeating the omission C2's review already caught once for `lib/panel.mjs`.

### CR-07 · nflverse advstats (view-only) — `Direction: both`

Fires on `scripts/update-advstats.mjs` / `validateAdvStats`, both named data-side triggers.

**Mirror (live `README.md`, CR-07, verbatim):**

> Served-shape or sparsity-gate changes need the app loader updated in the same cycle. **Now breaks a visible surface, not just a silent loader** — Market's `RACR` column would go blank for every WR/TE with no error. Ratios are recomputed season-level and never aggregated weekly. Activation into projection is parked — see the advstats grading-findings doc.

**Mirror instruction to the app repo: no code change owed; one behavioural note.** No served shape,
key, or gate changes — `MIN_ADVSTATS_ROWS` is untouched, and the row shape is identical. But **2016's
served values change materially**: `racr` was reading ~2× true (median 1.808 vs ~0.85) and now reads
correctly. CR-07 records Market's `RACR` column as this family's first UI consumer, so any surface
that can select 2016 will show different — and now correct — numbers after the CDN purge. This is a
**correction, not a regression**, and it is the direct undoing of the fact emitted in C2's own CR-07
mirror.

### CR-09 · nflverse gamelogs (view-only) — `Direction: both`

Fires on `scripts/update-gamelogs.mjs` and on `fetchPlayerStatsCsv` / `STATS_BASE` — the latter added
to this entry's triggers by the C8 slice, and the exact mechanism at issue here.

**Mirror (live `README.md`, CR-09, verbatim):**

> Shape or floor changes land in both repos together. The per-game `week` and `team` keys are load-bearing beyond display: `resolvePlayerTeam`'s week-grain path matches on `g.week === week` and reads `g.team`, and returns `null` rather than throwing — renaming either key empties every week-grain team join **silently**. Per-game `team` is the **current-franchise** domain in all seasons and is era-remapped app-side (CR-16); do not "fix" it to era-accurate upstream without changing both repos. Per-game rate fields (`racr`/`targetShare`/`airYardsShare`/`wopr`/`pacr`/`passingCpoe`) are single-game values and must never be summed — `passingCpoe` specifically is now also attempt-weighted by a second consumer (`seasonEfficiency.js`'s `CPOE` column), not merely "never summed". `fantasyPoints`/`fantasyPointsPpr` are nflverse default scoring and are never reconciled with `src/utils/fantasyPoints.js` (see CR-14). View-only on both sides — must never feed projection/scoring/grading. 2019 was backfilled on 2026-07-03 (5,756 rows across 586 players) and is no longer a gap; the family is complete 2012–2025.

**Mirror instruction to the app repo: no code change owed; two facts.** No shape or floor change —
`MIN_PLAYERGAME_ROWS` and the per-game key set are untouched. But (a) 2016's per-game
`receivingAirYards` and the rate fields derived from it change materially, and (b) **the row count
changes**, 5,796 → 5,804, so any app-side assumption keyed to a fixed 2016 row count would move.
`seasonEfficiency.js` is named in this Mirror as a live consumer of per-game rate fields; its 2016
outputs will change.

### CR-18 · Signal registry rows (`docs/signal-registry.md`) — `Direction: data→app`

Fires on `data-catalog.md` (§6) and on the ingest scripts, all named triggers.

**Mirror (live `README.md`, CR-18, verbatim):**

> This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

**Mirror instruction to the app repo — and a correction to what C2 emitted.**

**C2's two CR-18 row edits must NOT be applied.** They state that 2016 is upstream-corrupt and
excluded from analysis. If they were applied and then this slice landed, the registry would assert
the opposite of the truth. If they have already been applied, revert them.

The row edit actually owed is smaller: **no coverage-cell change at all.** Coverage was and remains
*"2012–2025, no gap"* for both families, and after this slice that is true in substance as well as in
file presence. The only thing worth adding is to the advstats **provenance/source** cell, matching
§6's data-side edit: 2016 was re-ingested on 2026-08-30 from the current `stats_player` tag,
correcting a corrupt legacy-tag ingest.

**The `✅` in the "Coverage verification — data-checked, not assumed" table now stands correctly** —
but for a reason it does not record. It certified 2016 on row counts and null rates, which could
never have detected this. If that table is edited at all, note that the 2026-08-30 check was
distributional (Σ airYards ÷ Σ targets), not just count-based.

**The row edit is owed for BOTH families, not just advstats.** §6 changes the Provenance split line
for advstats *and* gamelogs, so `docs/signal-registry.md`'s **gamelogs** row needs the identical 2016
note in its source/provenance cell. An earlier draft emitted only the advstats half, which would have
left the app applying half a correction — the worse of the two failure modes, since a half-corrected
registry reads as deliberate.

---

### CR-11 · Snap & red-zone usage stat keys — `Direction: data→app`

Fires because bare **`lib/backtest.mjs`** is a named data-side trigger and §5 edits it (and
`lib/panel.mjs`, likewise named).

**Mirror (live `README.md`, CR-11, verbatim):**

> Do not remove, rename or filter these keys. **The projection degrades silently to neutral when they are absent** — no error, no test failure, no visible symptom. The blast radius is wider than the projection: `durabilitySignals` mis-classifies contributor seasons, `teamContext`'s RZ denominators go to zero (so `teamRzShare` sentinels out), the Outlook snap% column empties, and — since dp-v2 Slice 5b — Market's Efficiency `SNAP%`/`RZ SH` columns go blank the same way, and the data repo's own panel/backtest reconstructions drift the same way. The dependency is invisible at runtime; this registry entry is the only thing recording it.

**Mirror instruction to the app repo: no change owed.** This Mirror governs the five snap/RZ stat
keys in `nfl/season-totals`. §5 touches none of them — it empties an exclusion set and edits two
comments. `snapShare` and `rzOwnRate` remain computed from the same keys for every season. The entry
fires on the file, not on its subject matter.

### CR-15 · R3-FIT factor-multiplier mirror — `Direction: both`

Fires for the same reason — `lib/panel.mjs` is a named trigger and §5.1 edits its `PANEL_DEFAULTS`
comment.

**Mirror (live `README.md`, CR-15, verbatim):**

> Re-mirror the changed constant/gate/branch and **re-fit before any further exponent activation** — otherwise the fit reconstructs a factor the app no longer produces and the committed verdict in `.claude/tasks/r3fit-exponent-harness.md` stops transporting. Which positions a factor is gated to is itself part of the mirror. Note the known parity gap: `shareTrend` and `teamRzShare` have no end-to-end app-ground-truth check until a post-2026-07-18 snapshot is imported. **Nothing app-side fails when this drifts.** Scope note, verified by grep so it need not be re-derived: `dynastyScore.js` is named in `lib/projectionFactors.mjs:110` only as a *contrast* (its `weightedLinearRegression` copy is unfloored where the mirrored one floors the denominator at 4) — it is **not** mirrored and is deliberately not a trigger.

**Mirror instruction to the app repo: no re-mirror owed; the re-fit clause needs one check.** No
factor transform, constant, gate or position-gating changes — the edit is a comment and an emptied
set, and `lib/projectionFactors.mjs` is untouched.

**But 2016's underlying data now changes**, which is a different trigger for the same clause than C2
faced. C2 checked and found the one committed artifact (`grading/2026-08-09-r3fit-verdict.md`) was
fitted over 2020–2024, so 2016 sat outside its panel. **That finding still holds and needs no
re-check** — the panel bound has not moved. Record it in the commit message rather than re-deriving
it.

---

## 9. Done-definition

**Re-ingest**
- [ ] `advstats --year 2016 --force` run; `validateAdvStats` **passed** (not bypassed, band untouched)
- [ ] `gamelogs --year 2016 --force` run
- [ ] Served advstats 2016 ratio ≈ **8.48**; `airYards == 0` ≈ 30 rows, ≤2 of them with ≥10 targets
- [ ] Served gamelogs 2016 REG-only ratio ≈ **8.38**
- [ ] `manifest.json` `recordCount`/`lastModified` updated for both by the scripts, not by hand
- [ ] **No other season's file changed** — `git status` shows exactly two data files

**Exclusion retirement**
- [ ] `CORRUPT_PREDICTOR_SEASONS` empty, with the provenance comment (§5)
- [ ] **Both** comment sites corrected: `lib/backtest.mjs:17-22` JSDoc and `lib/panel.mjs:20-23`
      `PANEL_DEFAULTS` note — the pointer survives, the "2016 stays excluded" clause does not (§5.1)
- [ ] The three call sites unchanged and still wired
- [ ] Exclusion tests kept, using **save/restore of the exported object** in `before`/`after` —
      **no injection seam added**, no test deleted; restore in `after` so a failure cannot leak (§5.2)

**Proof**
- [ ] Baseline captured **after** emptying the set and **before** the re-ingest (§7 steps 1–2) —
      the sequence an earlier draft had backwards
- [ ] Before/after `--by-season` β for `airYardsShare`/WR 2016 both in the commit message; the after
      value in line with neighbours rather than sign-flipped
- [ ] `npm test` count does not drop from **570**; `npm run smoke` green

**Docs & cross-repo**
- [ ] `data-catalog.md` advstats: corruption/exclusion claims removed, **the `[6, 11]` band record
      retained** (moved to Sparsity gate or kept in Null semantics) — it is the only catalog record
      of a live gate (§6)
- [ ] Provenance split lines updated in **both** families; Coverage rows untouched
- [ ] Commit message satisfies Invariant 1's "committed diff explaining why" (§4, four elements)
- [ ] **No CLAUDE.md exception note added** — this uses the allowance (§4)
- [ ] CR-18: C2's two emitted row edits recorded as **superseded**; the replacement provenance edit
      emitted for **both** advstats and gamelogs rows (§8)
- [ ] CR-15: C2's finding restated (the one r3fit artifact is 2020–2024, 2016 outside its panel) —
      **not** re-derived
- [ ] Sequence honoured: commit → `pull --rebase` → **push** → purge. CDN purge is `manifest.json`
      **then both season files**, and only after the push (§7 steps 10–13)
- [ ] `store-audit-2026-08-25.md` still modified-and-uncommitted, untouched

---

## 10. Settled decisions

- **Re-ingest rather than keep the workaround** — the data is fixable; C2's exclusion was correct for
  a state that no longer needs to exist.
- **Both families in one slice** — one CSV, one corruption, one fix.
- **Only 2016** (§1.2) — verified across seven seasons; 2012's −0.17 is an ordinary revision.
- **Invariant 1's allowance, not an exception** (§4).
- **Keep the exclusion machinery, empty the set** (§5) — the gate cannot help with already-served
  data. The counter-argument is recorded; ripping it out is one instruction away.
- **Save/restore in tests, not an injection seam** (§5.2) — three lines, no production signature
  widened to serve a test.
- **Keep the band's catalog record** (§6) — deleting it would drop a live gate's only documentation.
- **Empty the set before capturing the baseline** (§7) — the exclusion is live at HEAD, so the
  "before" is otherwise unobtainable on identical code.

---

## 11. Review disposition (2026-08-30)

Eleven flags, all verified against live source, all accepted. Two were ordering errors that would
have produced a wrong or self-defeating run; three were repeats of mistakes this planning line has
now made more than once.

| # | Flag | Call | Landed |
|---|---|---|---|
| 1 | `[ordering]` baseline impossible at HEAD; "unrecoverable" premise false | **Accepted — resequenced** | §7 steps 1–2 |
| 2 | `[ordering]` no `push` between rebase and purge | **Accepted** | §7 steps 12–13 |
| 3 | `[mechanical]` no seam to "re-point" tests at | **Accepted — design changed** | §5.2 |
| 4 | `[mechanical]` two comment sites assert the corruption | **Accepted** | §5.1 |
| 5 | `[cross-repo]` CR-11 fires on `lib/backtest.mjs` | **Accepted** | §8 |
| 6 | `[edge-case]` deleting Null semantics loses the band's only record | **Accepted** | §6 |
| 7 | `[cross-repo]` CR-18 row edit was advstats-only | **Accepted** | §8 |
| 8 | `[registry-stale]` CR-09 anchors +9 | **Confirmed, deferred** | §12.4 |
| 9 | `[registry-stale]` CR-18 anchors +9 | **Confirmed, deferred** | §12.4 |
| 10 | `[registry-stale]` CR-07 omits the band; anchor drifted again | **Confirmed, deferred** | §12.4 |
| 11 | `[mechanical]` §1.1 copied a stale anchor | **Accepted** | §1.1 |

**Flag 1 was the ordering error that mattered.** At HEAD the exclusion is live, so the baseline
command yields **zero** 2016 blocks — verified by running it. The plan asked for a "before" value that
could not be produced, and justified the step with a claim ("cannot be recovered afterwards") that is
simply false, since the pre-re-ingest file is in git. §7 now empties the set first, so before and
after differ only in the data.

**Flag 2 would have silently undone the slice.** Purging jsDelivr between the rebase and the push
re-caches the old bytes.

**Flag 11 is the one worth naming.** §1.1 cited `fetchPlayerStatsCsv` at `:412` — copied from CR-09's
trigger list, which *this planning line wrote* in the C8 slice, rather than re-derived. That is
exactly the trap flagged in others three slices running, and it is what §12.4 is about.

---

## 12. Out-of-scope observations (not edits)

1. **`validateGameLogs` still has no distributional guard**, and this slice sharpens the case rather
   than settling it: gamelogs 2016 was corrupt for three months with nothing to catch it, and the
   advstats gate would not have helped because the families validate independently. C2 §12.1 already
   records it; this is the second slice to touch the consequence without fixing the cause.
2. **The `--controls` escape that made C2's exposure reachable is still open.** It was never the real
   defect and is out of scope, but with 2016 clean there is now no known corrupt season behind it —
   worth remembering that this is a coincidence of data, not a guard.
3. **C2's §1.4/§5.5 carry a premise that verification later disproved.** `bin/panel.mjs --from 2013`
   does not in fact reach 2016 today: `lib/panel.mjs:283` returns `missingSnap` unconditionally,
   before `:292` is ever evaluated. The `:294` guard is still correct as a **forward** guard for when
   R1-SNAPS supplies pre-2020 `off_snp`, but the "reachable today" justification was wrong — mine and
   the reviewer's, caught by the implementation session. Worth correcting in that task file so the
   record does not carry a false premise forward.
4. **The registry's line anchors are structurally fragile, and this slice proves it.** Not four
   stale entries — a whole class. **C2's own commit (`957d27f`) added nine lines to
   `lib/nflverse.mjs` at `:43-44`, shifting every anchor below it by exactly nine** and invalidating
   trigger anchors across **CR-07, CR-09 and CR-18** in one routine insertion:

   | symbol | registry | live |
   |---|---|---|
   | `MIN_PLAYERGAME_ROWS` | :48 | **:57** |
   | `MIN_GAMELOG_SEASON` | :50 | **:59** |
   | `STATS_BASE` | :69 | **:78** |
   | `fetchPlayerStatsCsv` | :412 | **:421** |
   | `aggregateAdvReceiving` | :476 | **:485** |
   | `validateGameLogs` | :503 | **:524** |

   plus eight more parser anchors in CR-18 and `validateAdvStats:407` → live `:444` in CR-07 (C2
   recorded `:443`; C2's own edit moved it again). CR-07 also does not name `AY_PER_TARGET_MIN`/`MAX`
   at all — the ingest-blocking band this slice depends on.

   **This changes what the reconcile slice should be.** Re-deriving today's line numbers would buy
   one commit's worth of accuracy: the next insertion near the top of a shared module invalidates
   them again, silently, and nothing fails when it does. The slice should decide whether line anchors
   belong in the registry at all — symbol names are stable, greppable, and cannot drift — and if they
   stay, whether a test should assert them the way `test/manifest.test.mjs` asserts coverage. Flag 11
   above is the same defect turned inward: this planning line copied a stale anchor from a list it
   had itself written.
