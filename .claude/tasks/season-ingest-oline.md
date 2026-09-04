# S2, slice 4: convert `oline` — and close a hole in its own net first

**Type:** one net addition + one family converted.
**No served shape, no data, no manifest, no schemaVersion, no CDN purge, no behaviour change.**
**Session model:** plan (opus, this file). Implementation is a separate sonnet session — do not edit
source here.
**Source:** `season-ingest-extract.md` §10 program, slice 4. Designed against live source 2026-09-01
at HEAD `993e8c5`.

> **This slice adds a test, which slices 2 and 3 deliberately did not.** Not a relaxation of the
> rule — an application of it. §1.2 found a divergence in `oline` that **its own net does not
> cover**, and the rule is *report it rather than cover it silently*. This reports it, adds the
> missing case **against the unconverted code where it must already pass**, and only then converts.

**Working-tree note.** `store-audit-2026-08-25.md` is modified and uncommitted. **Do not stage,
commit, revert or edit it.** Nothing here touches it.

---

## 1. Verified facts

### 1.1 · Oline's net has seven tests and one gap

`test/update-oline.test.mjs`: `fetchDepthChartsCsv null → skipped` · `rowCount < MIN_OLINE_ROWS →
skipped` · `dedup hit` · `--dry-run … does not throw` · `force gate throws` ·
`write path … including the literal source string` · `--all fetches once per season`.

**None of them exercises §1.2.** Grepping the file for `drop`, `preRowCount`, `recount` or
`post-drop` returns nothing.

### 1.2 · `validateOline` mutates in place, and the counts are recomputed after it — deliberately

```js
const { teams, rowCount: preRowCount, stateCount } = aggregateOlineStates(csv, { season });

if (preRowCount < MIN_OLINE_ROWS) { … skip … }   // gate uses the RAW pre-drop count

validateOline(teams, { year: season });          // drops ragged records from `teams` IN PLACE

const teamCount = Object.keys(teams).length;     // recomputed POST-drop
const rowCount  = Object.values(teams).reduce(…) // recomputed POST-drop
```

Both choices carry comments explaining them:

- the gate is pre-drop because *"a preliminary/truncated fetch should be rejected on its own terms,
  before `validateOline`'s drops are even applied"*;
- the counts are post-drop because *"this family is append-only, so a stale (overstated) count would
  be permanent."*

**So `oline` needs two different row counts from one derive** — pre-drop for the sparsity gate,
post-drop for the envelope, the dry-run message and the manifest `recordCount`. `stateCount` is
unaffected by drops.

### 1.3 · The helper already supports this, by not caching — and that is fragile

`lib/seasonIngest.mjs` calls `rowCount(derived)` once for the gate (`:93`), then separately
`hash(derived)` (`:112`), `envelope(season, derived)` (`:133`) and `manifestRecordCount(derived)`
(`:142`) — all **after** `validate`. Since `validateOline` mutates `teams` in place, the later
callbacks observe the post-drop object naturally.

**This works by accident of ordering, not by design, and it is a live trap.** If anyone later
"optimises" the helper to compute the row count once and reuse it for `manifestRecordCount`,
`oline`'s manifest gains the **pre-drop, overstated** count — permanently, on an append-only family,
with no validator to catch it. §2.2 adds the test that makes that regression loud.

### 1.4 · Oline's other divergences are already-solved shapes

- `write → log → manifest → log` interleaving — same as `teamcontext`; `afterWrite`/`afterManifest`
  (slice 3) handle it. **This is those hooks' second consumer**, which is the first evidence they
  generalise.
- Envelope carries a literal `source: 'nflverse depth_charts (ESPN feed)'` and three counts —
  expressible in `envelope`; the net already asserts the literal.
- Wrong-asset `dt`-year mismatch throws inside `aggregateOlineStates` → travels in `derive`, like
  teamcontext's season guard.
- Log text differs from both converted families — `messages` (slice 3) handles it.

---

## 2. The decisions

### 2.1 · `derive` returns the bundle, not just `teams`

```js
derive: async (season) => {
  console.log(`[oline] Fetching depth_charts_${season}.csv…`);
  const csv = await d.fetchDepthChartsCsv(season);
  if (csv === null) return null;                       // → messages.notPublished
  const { teams, rowCount: preRowCount, stateCount } = aggregateOlineStates(csv, { season });
  console.log(`[oline] Derived ${preRowCount} ol rows across ${stateCount} states for season ${season}`);
  return { teams, preRowCount, stateCount };
},
rowCount: (o) => o.preRowCount,                        // PRE-drop — gate only
```

Then everything downstream recomputes from `o.teams`, which `validate` has mutated:

```js
validate: (o, opts) => { validateOline(o.teams, opts); console.log('[oline] Validation passed'); },
hash:     (o) => teamsHash(o.teams),
manifestRecordCount: (o) => olRowCount(o.teams),       // POST-drop
envelope: (season, o) => ({ schemaVersion: 1, season, generatedAt: …,
  source: 'nflverse depth_charts (ESPN feed)',
  rowCount: olRowCount(o.teams), teamCount: Object.keys(o.teams).length,
  stateCount: o.stateCount, teams: o.teams }),
```

Extract the post-drop row count into one local helper (`olRowCount`) so the envelope, the manifest
and the dry-run message cannot drift from each other — today the same reduce is written once and
read three times from locals; after conversion it must be one function called three times.

**`rowCount` is the only callback that may return the pre-drop number. Everything else recomputes.**

### 2.2 · Add the missing test **before** converting

One test in `test/update-oline.test.mjs`, written against the **unconverted** code, where it must
already pass:

> **`updateOline`: when `validateOline` drops records, the envelope and manifest carry the
> POST-drop count, not the aggregator's pre-drop count.**

Drive it with a fixture whose rows include at least one ragged record `validateOline` removes, then
assert `calls.writeJsonStable[0][1].rowCount` and
`calls.updateManifestEntry[0][0].recordCount` are **both** the post-drop value and **neither** equals
`preRowCount`.

**Then convert.** If the test passes before and after, the trap in §1.3 is closed permanently — for
`oline` and for any future family that validates destructively.

### 2.3 · Alternatives rejected

| option | rejected because |
|---|---|
| Convert `oline` and trust §1.3's ordering | It works by accident; the failure is silent, permanent, and on an append-only family |
| Add a second `postRowCount` callback to the helper | Two count callbacks invites passing the wrong one; recomputation from the mutated object is already correct and needs no new surface |
| Change `validateOline` to be non-mutating | A real improvement and out of scope — it would change what `teams` means for every consumer, which is a behaviour slice, not a refactor one |
| Also fold in the log-assertion fix | §5 — it edits every test file including `oline`'s, during `oline`'s own conversion |

---

## 3. The edits

### 3.1 · `test/update-oline.test.mjs`

Add §2.2's test. **Nothing else in the file changes**; the other seven must pass untouched
throughout.

### 3.2 · `scripts/update-oline.mjs`

Replace the `for (const season of seasons)` body with one `runSeasonKeyedIngest` call per §2.1. Keep
unchanged: the module header, `teamsHash`, `DEFAULT_DEPS`, the signature, season resolution, the
`if (!all) d.setStepOutput(…)` line. Add the local `olRowCount(teams)` helper.

`messages` reproduces oline's six strings **byte-for-byte**, including `already exists` in the
force-gate throw and the three-count dry-run line
(`<r> ol rows, <t> teams, <s> states`). `afterWrite` → `Wrote … (<r> ol rows, <t> teams, <s> states)`;
`afterManifest` → `Manifest updated`.

### 3.3 · `lib/seasonIngest.mjs`

**No change expected.** If one turns out to be needed, that is a finding — report it before making
it, since `oline` is the hooks' second consumer and a change here would mean slice 3's design did
not generalise.

---

## 4. Step order

1. Add §2.2's test. **Run it against unconverted `oline` — it must pass.** A test that only passes
   after the conversion proves nothing about the conversion.
2. Convert `oline` (§3.2).
3. **Run all eight oline tests** — the seven originals unedited, plus the new one.
4. **Run `schedule`'s ten and `teamcontext`'s eight.** They share the helper; if §3.3 held, they are
   untouched, and this confirms it.
5. **Byte-diff live output**, before and after:
   `oline --year 2025 --dry-run` and `oline --all --dry-run`.
   **Use 2025 or later** — `MIN_OLINE_SEASON` gates earlier years and 2023 fails on a legacy-schema
   asset before reaching any branch this slice touches.
6. `npm test` → **662** (661 + the one added). `npm run smoke`.
7. Commit; `git -c rebase.autoStash=true pull --rebase origin main`; push. **No CDN purge.**

**Step 1 before step 2, and step 4 after step 3.** The first makes the new test meaningful; the
second catches a helper regression before it ships.

---

## 5. The log-assertion gap — deferred to slice 5, deliberately

Slice 3's verification established that **`spyDeps` captures no console output**, so every string in
`messages`, `afterWrite` and `afterManifest` is unasserted. My independent byte-diff of slice 3
covered `dedup` and `dryRun` only — `notPublished`, `sparsity`, `forceGate` and **both post-write
hooks** were never exercised, because dry runs never write.

**The fix is not folded in here.** `spyDeps` is duplicated in all six test files with no shared
helper, so closing the gap means extracting a shared helper and touching every one — including
`test/update-oline.test.mjs`, **during `oline`'s own conversion**. That would mean rewriting a
family's acceptance suite in the slice that converts it, which is the one property this program has
protected since slice 1.

**Slice 5 takes it**, applied to the three families converted by then (`schedule`, `teamcontext`,
`oline`) plus `gamelogs` as it converts. Cost of waiting: `oline` ships with the same unverified log
text as its two predecessors, for one slice.

---

## 6. Cross-repo impact

**One entry fires: CR-18**, via its `scripts/update-{…,oline}.mjs` brace expansion. **No entry names
`oline` outside it** — there is no `CR-nn · oline` contract; the family is data-side-only with no
app loader.

### CR-18 · signal registry / data-catalog

> This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

**No row edit owed** — no field, stat key, source or coverage changes. No `data-catalog.md` edit.

---

## 7. Done-definition

**The net gap**
- [ ] §2.2's post-drop test added and **passing against unconverted `oline`** before any conversion
- [ ] It asserts **both** the envelope `rowCount` and the manifest `recordCount` are post-drop, and
      that neither equals `preRowCount`
- [ ] The other seven oline tests untouched throughout

**The conversion**
- [ ] Only the loop body replaced; header, `teamsHash`, `DEFAULT_DEPS`, signature, season resolution
      and `setStepOutput` unchanged
- [ ] `derive` returns `{ teams, preRowCount, stateCount }`; **`rowCount` is the only callback
      returning the pre-drop number**
- [ ] `envelope`, `manifestRecordCount` and the dry-run message all recompute from `o.teams` through
      **one** `olRowCount` helper — no duplicated reduce
- [ ] Fetch, `Derived …` logs in `derive`; `Validation passed` in `validate`
- [ ] Wrong-asset `dt`-year throw still fires from `aggregateOlineStates`
- [ ] Envelope keeps the literal `source: 'nflverse depth_charts (ESPN feed)'` and all three counts
- [ ] `afterWrite` / `afterManifest` reproduce the two-log interleaving

**Regression**
- [ ] `lib/seasonIngest.mjs` **unchanged** — if it needed changing, that was reported first (§3.3)
- [ ] `schedule`'s ten and `teamcontext`'s eight all pass unedited
- [ ] Byte-diff clean for `oline --year 2025 --dry-run` and `--all --dry-run`
- [ ] `npm test` = **662**; `npm run smoke` green or the known CFBD 429, stated
- [ ] CR-18 Mirror emitted; **no registry text edited**
- [ ] `gamelogs`, `advstats`, `roster` untouched
- [ ] `store-audit-2026-08-25.md` still modified-and-uncommitted, untouched

---

## 8. Settled decisions

- **Add the post-drop test, before converting** (§2.2) — the net's gap is exactly the divergence
  that makes this conversion risky.
- **`derive` returns a bundle; only `rowCount` is pre-drop** (§2.1) — everything else recomputes
  from the mutated object.
- **One `olRowCount` helper, called three times** (§2.1) — three copies of the reduce is how the
  envelope and manifest drift apart.
- **No helper change expected; a needed one is a finding** (§3.3) — oline is `afterWrite`/
  `afterManifest`'s second consumer and the first test of whether slice 3 generalised.
- **Log fix deferred to slice 5** (§5) — it would rewrite `oline`'s acceptance suite during
  `oline`'s conversion.
- **`validateOline` stays mutating** (§2.3) — changing it is a behaviour slice.

---

## 9. Invariant check

- **Invariant 1 (append-only)** — §1.2's post-drop recount exists *because* of it: an overstated
  count on a completed season would be permanent. §2.2 is the guard.
- **Invariant 3 (manifest is the index)** — `recordCount` must equal what the file holds; the new
  test asserts exactly that alignment.
- **Invariant 4 (schemaVersion)** — unchanged, hard-coded in the helper.

---

## 10. Program status

| slice | family | state |
|---|---|---|
| 1 | seams + net (all six) | done |
| 2 | extract helper + `schedule` | done |
| 3 | `teamcontext` + fixtures | done `993e8c5` |
| **4** | **`oline`** | **this** |
| 5 | `gamelogs` **+ the log-assertion fix** (§5) | next |
| 6 | `advstats` | seamed; shares a CSV with gamelogs |
| 7 | `roster` | last — two extra writes + the gate inversion |

---

## 11. Out-of-scope observations (not edits)

1. **`validateOline` mutating its input is unusual in this codebase.** Every other family's validator
   throws or returns; this one edits `teams` in place and the caller depends on it. It works, it is
   commented, and §2.2 now pins it — but a non-mutating `validateOline` returning
   `{ teams, dropped }` would remove a whole class of ordering hazard. A behaviour slice, not this one.
2. **No registry entry covers `oline` beyond CR-18's catch-all.** It is the only season-keyed family
   without its own `CR-nn`, which is correct today (no app loader) and worth revisiting if the app
   ever reads it.
3. **`stateCount` survives drops untouched** while `rowCount` and `teamCount` do not — a genuine
   asymmetry, documented in the source, and easy to get wrong when reading the envelope quickly.
