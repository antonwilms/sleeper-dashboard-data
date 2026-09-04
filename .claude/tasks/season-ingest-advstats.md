# S2, slice 6: rename `rowCount` → `gateRowCount`, then convert `advstats`

**Type:** one mechanical rename across the helper and four call sites + one family converted.
**No served shape, no data, no manifest, no schemaVersion, no CDN purge, no behaviour change.**
**Session model:** plan (opus, this file). Implementation is a separate sonnet session — do not edit
source here.
**Source:** `season-ingest-gamelogs.md` §11.3 (the rename) and §10 (the program). Designed against
live source 2026-09-03 at HEAD `0eb42df`.

> **The rename comes first and stands alone.** It touches every converted family, so landing it
> before `advstats` means the four existing branch-matrix suites verify it in isolation — 35 tests
> that must pass with **zero** assertion changes. Bundled the other way, a rename bug and a
> conversion bug could mask each other.

**Working-tree note.** `store-audit-2026-08-25.md` is modified and uncommitted. **Do not stage,
commit, revert or edit it.** Nothing here touches it.

---

## 1. Verified facts

### 1.1 · The name collision, in the data

The helper's callback and an envelope field share the name `rowCount`. Across the four converted
families they are the **same number twice and a different number twice**:

| family | gate callback | envelope field | |
|---|---|---|---|
| `schedule` | `games => games.length` | `games.length` | same |
| `teamcontext` | `derived => derived.rowCount` | `derived.rowCount` | same |
| **`oline`** | `o => o.preRowCount` | `olRowCount(o.teams)` | **differs** — pre- vs post-drop |
| **`gamelogs`** | `o => o.parsedRowCount` | `o.rowCount` | **differs** — pre- vs post-crosswalk |

`rowCount: o => o.rowCount` is valid, reads correctly, and is **wrong for half the population**.
Slice 5 documented it with a comment; this slice removes it by naming the callback for its one job.

### 1.2 · Rename scope

`lib/seasonIngest.mjs` — 5 references (`:11` and `:47`/`:50`/`:61` JSDoc, `:79` destructure, `:103`
call) plus the §2.3 comment block from slice 5, which names the parameter. Four call sites, one line
each: `schedule:85`, `teamcontext:98`, `oline:110`, `gamelogs:142`.

**`messages.sparsity(season, rowCount)`'s second parameter is a value, not the callback** — the
JSDoc at `:61` describes it. Leave that name alone; renaming it would suggest the message receives
the callback.

### 1.3 · `advstats` exercises no helper path slice 5 did not

Predicted in `season-ingest-gamelogs.md` §11.1 and confirmed:

- **single-season, no loop** — the helper is called with `seasons: [year]`, a one-element array
- **gate count == envelope count** (`Object.keys(players).length`, post-crosswalk, both) — a "same"
  case like schedule and teamcontext, so it adds no new pre/post hazard
- majority gate order (dedup → dry-run → force → write)
- injected-`csv` seam with two distinct log lines, as gamelogs
- envelope: `season: season ?? year`, `rowCount`, `unmapped`, `players`

### 1.4 · Its crosswalk read sits mid-flow, with an early return the helper cannot express

```
1 fetch (or injected)          →  null ⇒ "not published", return
2 aggregate                    →  logs "Aggregated <n> WR/TE/RB players"
3 read nflverse/playerids.json →  missing ⇒ dry-run: WARN + return  |  otherwise: THROW
4 re-key                       →  logs "<u> players had no crosswalk mapping"
5 sparsity gate onwards
```

Step 3 is a **third exit** that is neither "not published" nor "sparsity". If `derive` returned
`null` for it the helper would log `messages.notPublished` — the wrong message — and two of the eight
net tests cover exactly this.

**Resolution: keep steps 1–4 in the caller and hand the helper an already-derived bundle.** That is
`schedule`'s topology (fetch once outside, `derive` closes over the result), applied to a
single-season family. Both early returns keep their exact logs and semantics where they already live,
and the log **order** is preserved — moving the crosswalk read before the fetch would put its warning
ahead of `Aggregated …`, which the byte-diff would catch.

The helper therefore owns steps 5–11: sparsity, validate, dedup, dry-run, force gate, write,
manifest. `messages.notPublished` is never reached for `advstats`; supply it anyway for uniformity.

---

## 2. The decisions

### 2.1 · `gateRowCount`, and only that

Rename the **callback** in the helper and its four call sites. Do **not** rename:
- any envelope field named `rowCount` — that is served shape;
- `messages.sparsity`'s second parameter (§1.2);
- any local variable inside a family script.

**Update slice 5's comment block** at the `rc` computation so it refers to `gateRowCount`. The
comment stays — the rename makes the hazard visible at the call sites, but the comment is what
explains *why* recomputation is required after `validate`, which a name cannot carry.

### 2.2 · `advstats`: caller keeps 1–4, helper takes 5 onward

```js
// caller, unchanged from today: setStepOutput, fetch/injected-csv branch + its two logs,
// the not-published return, aggregateAdvReceiving + its log, the crosswalk read with its
// dry-run-warn-return / throw divergence, rekeyBySleeper + the unmapped log.

await runSeasonKeyedIngest({
  family: 'advstats',
  seasons: [year], currentSeason, dryRun, force, deps: d,
  dataPath: () => `nflverse/advstats/${year}.json`,
  derive: () => ({ players, season, unmapped }),      // already computed above
  gateRowCount: (o) => Object.keys(o.players).length,
  minRows: MIN_ADVSTATS_ROWS,
  validate: (o, opts) => { validateAdvStats(o.players, opts); console.log('[advstats] Validation passed'); },
  hash: (o) => playersHash(o.players),
  existingHash: (e) => (e?.players ? playersHash(e.players) : null),
  envelope: (s, o) => ({ schemaVersion: 1, season: o.season ?? s, generatedAt: …,
                         rowCount: Object.keys(o.players).length, unmapped: o.unmapped, players: o.players }),
  manifestRecordCount: (o) => Object.keys(o.players).length,
  messages: { … six strings byte-for-byte … },
});
```

`Object.keys(o.players).length` appears three times. **Extract it as a local**, the way `oline` uses
`olRowCount` — three copies is how the gate, envelope and manifest drift apart.

### 2.3 · Alternatives rejected

| option | rejected because |
|---|---|
| Rename and convert in one commit | §header — a rename bug and a conversion bug could mask each other |
| Also rename the envelope `rowCount` fields | Served shape. A rename there is a CR-07/CR-09 shape change |
| Move `advstats`' crosswalk read before the helper call | §1.4 — reorders operator-facing logs |
| Give the helper a third early-exit hook for the crosswalk case | One consumer, and the caller already expresses it correctly |
| Skip the rename, keep slice 5's comment | The comment did not stop the trap existing; it only described it. Two of five call sites are live instances |

---

## 3. The edits

### 3.1 · `lib/seasonIngest.mjs`

`rowCount` → `gateRowCount` (§1.2's five references) and the slice-5 comment updated to match. **No
logic change.**

### 3.2 · The four converted call sites

One line each in `schedule`, `teamcontext`, `oline`, `gamelogs`. **Nothing else.**

### 3.3 · `scripts/update-advstats.mjs`

Steps 5–11 replaced by one `runSeasonKeyedIngest` call per §2.2. Keep unchanged: the module header,
`playersHash`, `DEFAULT_DEPS`, the signature **including `csv` and `currentSeason`**, the year
resolution, `setStepOutput`, the fetch/injected branch and both its logs, the not-published return,
`aggregateAdvReceiving` and its log, the crosswalk read **and its dry-run/throw divergence**,
`rekeyBySleeper` and the unmapped log.

### 3.4 · Log assertions for `advstats`

Slice 5 added them for four families; `advstats` was not one. Add the same set — `sparsity`, `dedup`,
`dryRun`, `afterWrite`, `afterManifest` — as **new assertions inside its existing tests**, using
`test-support/spy-deps.mjs`. **These land before the conversion** (§4 step 3) and must pass against
the unconverted code.

`notPublished` is unreachable for `advstats` (§1.4) — do not assert it.

---

## 4. Step order

1. **Rename** (§3.1, §3.2). Run the full suite: **662**, with **no assertion edited**. This is the
   rename verified in isolation against 35 branch-matrix tests.
2. Commit the rename on its own.
3. **Add `advstats`' log assertions** (§3.4) and run them against the **unconverted** family. All
   must pass. Any failure is a finding — report before adjusting.
4. **Convert `advstats`** (§3.3).
5. Run `advstats`' eight tests plus the new assertions; then `schedule`, `teamcontext`, `oline`,
   `gamelogs`.
6. **Byte-diff** `advstats --year 2023 --dry-run`, before and after.
7. `npm test` → **662** (assertions live inside existing tests). `npm run smoke`.
8. Commit; `git -c rebase.autoStash=true pull --rebase origin main`; push. **No CDN purge.**

**Step 1 before step 3.** A green suite after the rename is the evidence it was mechanical.

---

## 5. Tests

**No new cases.** New assertions inside `advstats`' existing eight (§3.4). `npm test` stays **662**.

---

## 6. Cross-repo impact

**Two entries fire: CR-07 and CR-18.** CR-07 names `scripts/update-advstats.mjs`; CR-18's brace
expansion covers it. `lib/seasonIngest.mjs`, `test-support/` and `test/` are named by no entry.

**No change owed on either.** No served shape, floor, field, coverage or cadence moves — and §2.1
explicitly forbids renaming the envelope's `rowCount`, which *would* be a shape change.

### CR-07 · advstats

> Served-shape or sparsity-gate changes need the app loader updated in the same cycle. **Now breaks a visible surface, not just a silent loader** — Market's `RACR` column would go blank for every WR/TE with no error. Ratios are recomputed season-level and never aggregated weekly. Activation into projection is parked — see the advstats grading-findings doc.

**No change owed.** The envelope is byte-identical and the sparsity gate keeps `MIN_ADVSTATS_ROWS`
applied to the same post-crosswalk count. Note the Mirror's warning is about *served shape* — which
is exactly why §2.1 renames only the callback and leaves every `rowCount` **field** alone.

### CR-18 · signal registry / data-catalog

> This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

**No row edit owed.**

---

## 7. Done-definition

**Rename**
- [ ] `gateRowCount` in `lib/seasonIngest.mjs` (all five references) and in `schedule`,
      `teamcontext`, `oline`, `gamelogs` — one line each
- [ ] **No envelope `rowCount` field renamed**; `messages.sparsity`'s parameter untouched
- [ ] Slice 5's comment block updated to say `gateRowCount`
- [ ] Landed as **its own commit**, suite **662** green with no assertion edited

**advstats log assertions**
- [ ] `sparsity`, `dedup`, `dryRun`, `afterWrite`, `afterManifest` asserted full-string via
      `test-support/spy-deps.mjs`
- [ ] `notPublished` **not** asserted — unreachable (§1.4)
- [ ] **Passed against unconverted `advstats`** before step 4

**Conversion**
- [ ] Steps 1–4 stay in the caller: `setStepOutput`, fetch/injected branch **and both logs**, the
      not-published return, `aggregateAdvReceiving` + log, the crosswalk read **with its
      dry-run-warn-return / throw divergence**, `rekeyBySleeper` + the unmapped log
- [ ] Helper called with `seasons: [year]`
- [ ] `Object.keys(players).length` extracted to **one local**, used by gate, envelope and manifest
- [ ] Envelope keeps `season: season ?? year`, `rowCount`, `unmapped`, `players`
- [ ] Both crosswalk tests still pass — warn-and-return under dry-run, throw otherwise
- [ ] All eight advstats tests pass unedited beyond the added assertions

**Regression**
- [ ] `schedule`, `teamcontext`, `oline`, `gamelogs` all pass
- [ ] `lib/seasonIngest.mjs` has **no logic change** — rename and comment only
- [ ] Byte-diff clean for `advstats --year 2023 --dry-run`
- [ ] `npm test` = **662**; `npm run smoke` green or the known CFBD 429, stated
- [ ] CR-07 / CR-18 Mirrors emitted; **no registry text edited**
- [ ] `roster` untouched
- [ ] `store-audit-2026-08-25.md` still modified-and-uncommitted, untouched

---

## 8. Settled decisions

- **Rename lands first, on its own commit** (§header, §4) — otherwise two bug classes can mask.
- **Only the callback is renamed** (§2.1) — envelope fields are served shape (CR-07).
- **The comment stays** (§2.1) — a name cannot carry *why* recomputation is required.
- **advstats keeps steps 1–4 in the caller** (§1.4) — the crosswalk exit is a third exit the helper
  cannot express, and moving the read reorders logs.
- **One local for the player count** (§2.2) — three copies is how gate, envelope and manifest drift.
- **`notPublished` unasserted for advstats** (§3.4) — unreachable, and asserting it would be false
  coverage.

---

## 9. Invariant check

- **Invariant 3 (manifest is the index)** — `recordCount` and the envelope `rowCount` come from one
  local, so they cannot disagree.
- **Invariant 1 / 4** — no data file rewritten, no `schemaVersion` change.

---

## 10. Program status

| slice | family | state |
|---|---|---|
| 1–5 | seams, net, helper, `schedule`, `teamcontext`, `oline`, `gamelogs`, log gap | done |
| **6** | **rename + `advstats`** | **this** |
| 7 | `roster` | last — and the only one still genuinely open |

---

## 11. What is left, honestly

After this slice five of six families route through one spine, every helper message is asserted, and
the pre/post count hazard is named at every call site rather than described in a comment.

**`roster` remains unsolved and this slice does not make it easier.** It needs, from
`season-ingest-extract.md` §10.1/§10.3:

- a **second write on the dedup-hit branch** (`last-checked-roster.json`, dry-run-aware) and
  **another after the successful write** — the helper models a dedup hit as a pure `continue`;
- its **force gate before the dry-run exit**, inverted from the other five and pinned deliberately by
  the net.

Slice 7 must choose between a per-branch hook, a behaviour change argued on its own terms, or leaving
`roster` unconverted. **All three are defensible and it is a judgement call, not a mechanical step** —
worth a reviewer, unlike slices 3–6.
