# Registry anchor reconcile — drop the line numbers, keep the symbols

**Type:** registry cache maintenance across both repos, plus one recurrence guard. **No source
behaviour change, no data, no manifest, no CDN purge.**
**Session model:** plan (opus, this file). Implementation is a separate sonnet session — do not edit
source here.
**Source:** escalated across four slices (`manifest-truth.md` §12.5, `repo-weight.md` §11.4,
`advstats-2016-gate.md` §12.3-4, `reingest-2016.md` §12.4). Audit re-run **2026-08-30** at HEAD
`c01d9f0`.

> **This is v2.** v1's audit used a regex requiring an identifier before the colon, so it silently
> missed every bare `` `:179` `` and range `` `:874-886` `` — ~40% of the population — then reported
> its output as comprehensive. Review caught it. The conclusion survives and is stronger; every
> number and every mechanical instruction here is rebuilt. §10 records what changed and why it
> matters that *this* slice made *this* mistake.

**Working-tree note.** `store-audit-2026-08-25.md` is modified and uncommitted. **Do not stage,
commit, revert or edit it.** Nothing here touches it.

---

## 1. The audit

Every colon-anchor in a **data-side cache field** — a `Data side` field, or the text right of `‖` in
a `Triggers` field — across all **21** entries, resolved against live `lib/`/`scripts/`/`bin/`.
Field blocks include **continuation lines** (§3.2). App-side anchors are frozen authority and are
neither counted nor touched.

| | count |
|---|---|
| Data-side anchor occurrences | **107**, across **20 of 21** entries |
| …carrying a symbol (`validateAdvStats:407`) — *verifiable* | 57 |
| …of those, **stale** | **33** (58%) |
| …of those, resolving correctly | 24 |
| **…carrying no symbol — *unverifiable by any means*** | **50** |
| — `file.mjs:NNN` | 15 |
| — bare `:NNN` | 25 |
| — range `:NNN-NNN` | 10 |

Entries with stale symbol anchors: **CR-03, 05, 06, 07, 08, 09, 10, 11, 12, 13, 15, 16, 17, 18, 19,
20** — sixteen.

**The headline is not the 58%. It is the 50.** Almost half of all data-side anchors carry no symbol,
so no check — human or automated — can tell whether they still point where they claim. They are
unfalsifiable by construction.

### 1.1 · Drift is largely uniform per file, which explains the mechanism

`lib/nflverse.mjs` anchors below line 43 are **all +9**, traceable to one commit: **C2 (`957d27f`)
inserted nine lines at `:43-44`** — two constants and a comment — invalidating sixteen anchors across
three entries in a completely ordinary change.

**Stated precisely, because v1 overstated it:** the +9 is not universal even within that file —
`MIN_ROSTER_IDS:18`, `MIN_DRAFT_YEAR:25` and `MIN_ADVSTATS_ROWS:35` sit *above* the insertion and all
still resolve. `lib/panel.mjs` is not uniformly +4 either (`buildTeamTotalsForSeason` is +2, CR-11's
rz accumulation +1). The mechanism — an insertion shifts everything below it — holds; "exactly +N,
every one" did not.

**Refreshing the numbers is therefore a treadmill.** The next constant added above line 43 breaks
them again, nothing fails, and the next slice inherits the backlog.

### 1.2 · Anchors have silently retargeted — the failure mode that matters

`scripts/update-nfl.mjs:93` is named as **the writer** in six places. Live:

```
scripts/update-nfl.mjs:93  →  const sealed = d.setManifestInProgress({ path: `nfl/season-totals/…
```

That is D-5's seal, not the writer. CR-11's naked consumer list is worse:

| anchor | registry says | live |
|---|---|---|
| `lib/panel.mjs:191`, `:206` | snap/RZ key consumers | **`}`** — closing braces |
| `lib/backtest.mjs:225` | snap/RZ key consumer | `export function spearman(xs, ys)` — **unrelated** |
| `lib/panel.mjs:874` | `RZ_CONFIG`-equivalents | a *comment* citing other line numbers |

**A stale anchor that still resolves is worse than one that obviously breaks.** These do not dangle;
they point at real, plausible, wrong code, and nothing in either repo can detect it.

### 1.3 · The format spec never asked for line numbers

From the registry's own entry-format definition, inside the mirrored region:

> **`Triggers`** … Triggers are always concrete paths, **exported symbols, constant names** or served
> JSON paths — never a category.

Symbols and constant names. Line numbers accreted by convention; dropping them **returns the registry
to its own spec**. The spec's worked example — `lib/nflverse.mjs MIN_SCHEDULE_GAMES` — is already
line-number-free.

The one case that looks like it needs a number is blessed by the same section:

> Where a value flows through a generic path that never names it — season-totals aggregation is a
> sum-all-keys loop — the **loop** is the trigger, because the key name greps to nothing.

The prose carries that (`the Object.entries(stats) loop in aggregateWeeks`); the number is redundant.

### 1.4 · A near-miss worth recording

v1 claimed the registry *contradicts itself* about `aggregateWeeks` — `:231` in CR-02, `:297`
elsewhere. **Wrong, and caught before it shipped.** `:231` is the definition; `:297` is the
`Object.entries(stats)` loop inside it, and live source still matches both. Two anchor semantics,
both correct.

### 1.5 · Contract-text anchors all resolve — and are out of scope

Four data-side anchors sit in `Mirror`/`Invariant` rather than cache fields:
`lib/fantasyPoints.mjs:21`, `lib/nflverse.mjs:18`, `lib/projectionFactors.mjs:110`,
`lib/sleeper.mjs:21`. **All four resolve** — they sit above C2's insertion, which is why. Left alone
(§2): editing contract text is a different act with different obligations.

---

## 2. The decision

**Drop `:NNN` from data-side cache fields. Keep — and where necessary, restore — the symbol.**

"Strip the number" is only mechanical for anchors that *have* a locator beside them, which is why the
rule has two halves.

### 2.1 · Rule A — anchor has an adjacent symbol or description → drop the number

Covers the large majority.

| before | after |
|---|---|
| `` `lib/nflverse.mjs` `MIN_SCHEDULE_GAMES:45` `` | `` `lib/nflverse.mjs` `MIN_SCHEDULE_GAMES` `` |
| `` `normalizeTeamForSchedule` at `:342` (writes the per-season `team`) `` | `` `normalizeTeamForSchedule` (writes the per-season `team`) `` |
| `` `aggregateWeeks` (`Object.entries(stats)` at `:297`) `` | `` `aggregateWeeks` (the `Object.entries(stats)` loop) `` |
| `` (the writer, `:93`; aggregate call `:54`, validate call `:58`) `` | `` (the writer; the aggregate and validate calls) `` |
| `` the era-domain guard at `:515` `` | `` the era-domain guard `` |

### 2.2 · Rule B — naked number lists → **re-derive the symbol**, do not just delete

v1 claimed "nothing is lost". False for ~12 anchors that have no locator at all. Stripping
`` `lib/panel.mjs` (`:87-88`, `:179`, `:191`/`:206`, …) `` leaves `` `lib/panel.mjs` () `` — a bare
filename for a 1,300-line module, which the spec calls a *category*, not a trigger.

**Re-derive from what the entry describes, never from the line number** — §1.2 shows those numbers
now point at closing braces and unrelated functions, so following them would encode today's noise.

| Entry | Naked list | Re-derive by |
|---|---|---|
| **CR-11** | `lib/panel.mjs` ×6, `lib/backtest.mjs` ×3 | grepping both files for the entry's own five keys (`off_snp`, `tm_off_snp`, `rec_rz_tgt`, `rush_rz_att`, `pass_rz_att`) and naming the **enclosing functions** |
| **CR-01** | `scripts/grade-snapshot.mjs` envelope reads ×3 | naming the functions that read `targetSeason` / `currentSeason` / `scoringSettings` |

~12 anchors of genuine re-derivation. This is the part that *improves* the registry rather than
merely de-risking it, and it is **not** optional: leaving bare filenames trades a fragile trigger for
a useless one.

### 2.3 · Alternatives rejected

| Option | Rejected because |
|---|---|
| **Refresh all 33 stale numbers** | §1.1 — the next ordinary insertion re-breaks them. One commit of accuracy for permanent two-repo debt, and it does nothing for the 50 unverifiable anchors. |
| **Keep anchors + a test asserting line numbers** | Turns *every insertion above an anchor* into a red test requiring a synchronized two-repo registry edit — a heavy tax on routine work, protecting a field the spec never asked for. It cannot distinguish definition from statement anchors (§1.4), and cannot check the 50 symbol-less ones at all. |
| **Drop anchors app-side too** | Not this repo's to make — frozen authority. §11.2 flags it. |

**Scope boundary:** cache fields only. `Mirror`, `Invariant`, `Direction`, `App side` untouched.

---

## 3. The edits — registry

Both repos, byte-identical. `README.md` and `docs/cross-repo-registry.md` are currently
byte-identical across the mirrored region (verified); they must stay so.

### 3.1 · What to strip

Apply Rule A/B to all **107** data-side cache-field occurrences across 20 entries. **Do not touch**
anything left of `‖`, or in `App side`/`Invariant`/`Mirror`/`Direction`.

### 3.2 · CR-19 is hard-wrapped, and a line-scoped edit cannot reach it

**CR-19 is the only entry with indented continuation lines** (verified across all 21). Its
`Data side` and `Triggers` wrap onto lines beginning with two spaces, not `- **`, and its `‖` sits
mid-continuation. A line-scoped rule leaves 8 data-side anchors unstripped.

**The naive fix is dangerous:** CR-19's `App side` also wraps, carrying six frozen anchors
(`sackPct:597`, `ayPerAtt:598`, `yac:605`, `btkl:606`, `drops:616`,
`src/utils/outlookPositionStats.js:128`). "Also process continuation lines" strips those.

**Required approach — parse field *blocks*, not lines:** walk the region accumulating each
`- **<Field>:**` line plus every following indented continuation line into one block, tagged with its
field name and entry. Edit only blocks tagged `Data side` or `Triggers`, and within `Triggers` only
the text after the **first** `‖` in the whole block.

### 3.3 · The post-edit trap, counted correctly

`lib/fantasyPoints.mjs:21` occurs **six** times: three in cache fields (CR-11/12/13 `Triggers`),
**once in contract text** (CR-14 `Mirror`), and twice inside CR-19's wrapped fields. A global
find-and-replace edits the `Mirror` and silently falsifies §7's argument. **Strip five, leave
CR-14's.** Same shape for `scripts/update-nfl.mjs:93` (6) and `findNonFinite:69` (3).

### 3.4 · Amend the format spec in the same change

The entry-format definition is inside the mirrored region. Add to the `Triggers` bullet:

> Triggers name **symbols, not line numbers** — line anchors drift silently on any insertion above
> them, and an anchor with no symbol beside it cannot be verified at all.

**This is normative prose, not a cache field** — §7 accounts for it explicitly rather than pretending
the slice touches only cache.

---

## 4. Substantive cache corrections owed in the same pass

Deferred backlog plus two the reviewer surfaced. All cache fields, so they ride along. **Re-verify
each against live source — do not copy from the task files that recorded them**; two earlier slices
shipped anchors copied from stale lists.

| Entry | Correction |
|---|---|
| **CR-04** | add **`setManifestInProgress`** (`lib/manifest.mjs`) — a third live manifest writer |
| **CR-04** | add **`scripts/migrate-manifest-truth.mjs`** and **`scripts/migrate-drop-cfbd-raw.mjs`** — both write `manifest.json` directly via `writeJsonStable` after editing `manifest.files` in place, bypassing `updateManifestEntry` entirely. The first rewrote 38 entries |
| **CR-07** | add **`AY_PER_TARGET_MIN`/`AY_PER_TARGET_MAX`** (`lib/nflverse.mjs`) — the ingest-blocking band, currently unnamed |
| **CR-07** | add **`aggregateAdvReceiving`** (`lib/nflverse.mjs`) — the **producer** of the served shape CR-07's own `Invariant` describes, absent from its triggers |
| **CR-07** | add the four live consumers: `scripts/backtest-run.mjs`, `lib/backtest.mjs`, `scripts/panel-run.mjs`, `lib/panel.mjs` |

---

## 5. The recurrence guard — assert symbols, not lines

New test in `test/registry.test.mjs`:

> **Every symbol named in a data-side cache field resolves in the file the entry names.**

**Two corrections to v1's design, both load-bearing:**

1. **Accept every trigger form the spec authorizes.** Live data-side triggers legitimately include
   served-path templates (`nflverse/advstats/<year>.json`), globs (`enrichment/*.json`), brace
   expansions (`scripts/update-{nfl,cfbd,…}.mjs`), the blessed generic-loop trigger
   (`` `Object.entries(stats)` ``), and prose backticks (`idp_*`, `TEAM_*`, `inProgress`). v1's
   resolver would have reddened on all of these, and v1's "fix the registry, not the test" would then
   have instructed **deleting spec-authorized triggers**. The test must recognise and skip non-symbol
   forms, asserting only on identifiers that claim to be symbols.
2. **Resolve against the file the entry names, not the whole tree.** v1 grepped `lib/`/`scripts/`/`bin/`
   for a bare identifier, so a symbol deleted from its own file still passes if the name exists
   elsewhere. Live instance: **`STATS_BASE` is declared in both `lib/sleeper.mjs` and
   `lib/nflverse.mjs`**, and CR-09's trigger is specifically "`STATS_BASE` in `lib/nflverse.mjs`".

**Why this guarantee and not the line-number one:** it reds exactly when a symbol is **renamed, moved
between files, or deleted** — each a registry-worthy event — and stays green through every insertion,
refactor and reordering. It is the reviewer's standing duty, automated.

Expect failures on first run; fix the **registry**, and record what it surfaced in the commit
message. Data-side only — the app side names `src/` symbols this repo cannot see.

---

## 6. Step order

1. **Write the field-block parser and audit resolver first**, and commit its baseline output. It is
   both the measurement and §5's test engine; everything downstream is checked against it.
2. Apply Rule A across all 20 entries (§2.1), block-scoped (§3.2).
3. Apply Rule B — re-derive CR-11's and CR-01's naked lists (§2.2).
4. Apply §4's substantive corrections.
5. Amend the format spec (§3.4).
6. **Verify by count, not by label:**
   - data-side cache-field colon-anchors: **107 → 0**
   - **app-side colon-anchors unchanged** — capture with the same parser *before* editing, assert
     equality after. Do **not** use v1's "21"; it counted one form only and a correct implementation
     would fail that gate.
   - `git diff` shows no change inside any `App side`/`Invariant`/`Mirror`/`Direction` **block** —
     block-scoped, so CR-19's unlabelled continuations are covered. v1's label-scoped gate was blind
     exactly there.
   - CR-14's `Mirror` still contains `lib/fantasyPoints.mjs:21`.
7. Add §5's test; fix what it surfaces in the registry.
8. Apply the identical change to the app repo's `docs/cross-repo-registry.md`.
9. **Anchored drift check — must report no output:**
   ```sh
   diff <(sed -n '/^<!-- CR-REGISTRY-BEGIN -->$/,/^<!-- CR-REGISTRY-END -->$/p' docs/cross-repo-registry.md) \
        <(sed -n '/^<!-- CR-REGISTRY-BEGIN -->$/,/^<!-- CR-REGISTRY-END -->$/p' ../sleeper-dashboard-data/README.md)
   ```
   Anchored form only; an unanchored match sweeps in the inline sentinel mentions.
10. `npm test`, `npm run smoke`.
11. Two commits, one per repo, landing together:
    `docs: registry triggers name symbols, not line numbers (+ CR-04/CR-07 corrections)`.
12. `git pull --rebase origin main`, then **push**, in each repo. No CDN purge — no served file changes.

---

## 7. Cross-repo impact

**No entry's `Mirror` text is owed — but not for v1's reason, which was wrong.**

v1 argued that `Data side`/`Triggers` are "cache, not contract", quoting half of `CLAUDE.md:248`. The
registry's own format spec pre-empts that:

> **The near side of `‖` is a maintained cache.** … That does not make the near side low-stakes: **it
> is the *far*-side authority for the sibling repo's reviewer, which cannot read this side's live
> source at all.**

The data-side trigger list is *simultaneously* this repo's cache and the app repo's frozen authority.
"Cache, therefore not contract" does not survive that. §3.4 also amends **normative shared prose**,
which is neither cache nor one of the four fields §2 leaves untouched.

**The correct reason no Mirror is owed is the trigger test itself:** the Rule fires when a change
touches an entry's listed triggers. **No entry's data-side `Triggers` names `README.md`,
`docs/cross-repo-registry.md`, or any test file** — and those are exactly what this slice edits. So on
the registry's own test it touches no entry, and v1's "emit all 21 Mirrors" fallback is unnecessary
rather than merely bulky.

**Two consequences, load-bearing rather than incidental:**

1. **§6 steps 8–9 are the mechanism the spec relies on.** Far-side correctness "is kept correct by the
   both-repos-same-change rule — never by re-deriving them at review time." Landing this in one repo
   only would leave the app's reviewer holding an authority the data repo has abandoned.
2. **The drift check cannot catch what this slice is about.** It verifies the two repos agree with
   *each other*, not that either agrees with source — it passes happily on two identically-wrong
   registries, which is precisely the state that produced this slice. §5's test is the first check of
   the second kind, and it exists only on the data side.

---

## 8. Done-definition

**Audit & strip**
- [ ] Field-**block** parser written (handles CR-19's continuation lines); baseline output committed
- [ ] Data-side cache-field colon-anchors: **107 → 0**
- [ ] App-side colon-anchor count **identical before and after**, measured with the same parser
- [ ] No diff inside any `App side`/`Invariant`/`Mirror`/`Direction` block, CR-19's unlabelled
      continuations included
- [ ] CR-14's `Mirror` still contains `lib/fantasyPoints.mjs:21` (§3.3)

**Rule B**
- [ ] CR-11's `lib/panel.mjs` ×6 and `lib/backtest.mjs` ×3 replaced with **enclosing-function symbols
      re-derived from the entry's five keys** — not from the stale line numbers
- [ ] CR-01's three envelope reads replaced with symbols
- [ ] **No bare filename left standing alone** in any data-side trigger list

**Corrections**
- [ ] CR-04 gains `setManifestInProgress`, `migrate-manifest-truth.mjs`, `migrate-drop-cfbd-raw.mjs`
- [ ] CR-07 gains `AY_PER_TARGET_MIN`/`MAX`, `aggregateAdvReceiving`, and the four consumers
- [ ] Each re-verified against live source, not copied from the recording task files

**Guard**
- [ ] `test/registry.test.mjs` added; resolves **against the file the entry names**; skips
      spec-authorized non-symbol forms (templates, globs, brace expansions, prose backticks)
- [ ] Verified it would catch `STATS_BASE` being deleted from `lib/nflverse.mjs` while surviving in
      `lib/sleeper.mjs` — the case v1's tree-wide resolver would have missed
- [ ] Initial failures fixed in the registry and recorded in the commit message

**Landing**
- [ ] Format spec amended (§3.4)
- [ ] Anchored drift check reports **no output** after both repos land
- [ ] `npm test` green (baseline **570** + new); `npm run smoke` green
- [ ] Both repos committed and pushed; no CDN purge; no data or manifest change
- [ ] `store-audit-2026-08-25.md` still modified-and-uncommitted, untouched

---

## 9. Settled decisions

- **Drop line numbers rather than refresh** (§2.3) — refreshing is a treadmill and does nothing for
  the 50 symbol-less anchors.
- **Rule B re-derives rather than deletes** (§2.2) — a bare filename is a category, which the spec
  forbids; and the stale numbers cannot be followed, since they point at braces.
- **No line-number test** (§2.3) — it would tax every routine insertion with a two-repo edit.
- **Symbol-existence test, file-scoped and form-aware** (§5).
- **Cache fields only; contract text untouched** (§1.5, §2).
- **No Mirror emissions — because no trigger names these files** (§7), *not* because trigger lists sit
  outside the contract.
- **Block-scoped editing** (§3.2) — the only approach that reaches CR-19 without eating frozen anchors.

---

## 10. What v1 got wrong, and why it belongs in the record

v1's audit used `[A-Za-z_][A-Za-z0-9_./-]*:[0-9]+` — identifier, colon, digits. Bare `` `:179` `` and
ranges `` `:874-886` `` have no leading identifier, so **35 anchors were invisible**: the population
came out 65 instead of 107, 12 entries instead of 20. Every derived instruction inherited the gap —
the strip count, the app-side gate, the "nothing is lost" claim, the test design.

**This is the same defect the slice exists to fix, one level up.** A measurement that looked precise,
was quietly incomplete, and had no way to announce its own incompleteness. The registry's line anchors
fail exactly that way; so did the audit of them. Recorded because the next person measuring this
should distrust a clean-looking number, and because §5's test is the answer in both cases: assert what
can be checked, and never present the unverifiable as verified.

---

## 11. Out-of-scope observations (not edits)

1. **`validateGameLogs` still has no distributional guard** — fourth slice running to note it
   (`advstats-2016-gate.md` §12.1, `reingest-2016.md` §12.1). gamelogs 2016 was corrupt for three
   months with nothing to catch it.
2. **The app side carries the same fragility** and this repo cannot verify it. After this lands the
   app repo has a working precedent and a reusable parser; its own `CLAUDE.md:227` calls its app-side
   list a maintained cache, so the argument is symmetric.
3. **`lib/validate.mjs` drift is accumulated, not single-commit** (+14 … +57 across 9 anchors), unlike
   `lib/nflverse.mjs`'s clean +9 — it has absorbed many slices' insertions and is where an
   anchor-style regression would be least visible if anchors were kept.
