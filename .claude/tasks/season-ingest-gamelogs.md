# S2, slice 5: close the log gap, then convert `gamelogs`

**Type:** shared test helper + log assertions for four families + one helper comment + one family
converted.
**No served shape, no data, no manifest, no schemaVersion, no CDN purge, no behaviour change.**
**Session model:** plan (opus, this file). Implementation is a separate sonnet session — do not edit
source here.
**Source:** `season-ingest-oline.md` §5 (the deferred log fix) and §10 (the program). Designed against
live source 2026-09-02 at HEAD `2bb2a9b`.

> **The ordering here is the whole design.** This slice edits `gamelogs`' acceptance suite *and*
> converts `gamelogs` — the exact combination slice 4 refused. It is safe only because the test edits
> land **first, against the unconverted code, where they must already pass.** That is the same
> discipline slice 4 used for its post-drop test, applied to log text. **If the log assertions are
> written after the conversion, they describe the new code instead of constraining it, and this slice
> has verified nothing.**

**Working-tree note.** `store-audit-2026-08-25.md` is modified and uncommitted. **Do not stage,
commit, revert or edit it.** Nothing here touches it.

---

## 1. Verified facts

### 1.1 · The log gap, stated exactly

`spyDeps` is duplicated in **all six** test files — no shared helper — and every copy records the
same three keys: `writeJsonStable`, `updateManifestEntry`, `setStepOutput`. **None captures console
output.**

`lib/seasonIngest.mjs` emits every message through a direct `console.log` (`:95`, `:101`, `:115`,
`:123`, `:137`, `:150`) plus one `throw` (`:129`). So a test **can** capture them —
`t.mock.method(console, 'log', …)` sees all of them, and it is *method* mocking, which needs no
experimental Node flag.

What is currently unverified, measured in slice 3 and unchanged since: `notPublished`, `sparsity`,
`forceGate`, **`afterWrite` and `afterManifest`**. My byte-diffs covered only `dedup` and `dryRun`,
because dry runs never write — so **the two hooks slice 3 added specifically to preserve the
write/log/manifest interleaving have never been verified at all.**

### 1.2 · The helper's `rc` is computed once and must never be reused

```js
const derived = await derive(season);
const rc = derived === null ? 0 : rowCount(derived);   // :93 — sparsity gate ONLY
```

`manifestRecordCount(derived)` is called separately at `:142`, **after `validate`**. That separation
is load-bearing for two families already:

- **`oline`** — `validateOline` mutates `teams` in place; `rc` is the pre-drop count, the manifest
  must carry the post-drop one.
- **`gamelogs`** — `rc` is `parsedRowCount` (pre-crosswalk, from the parser); the envelope's
  `rowCount` is the post-crosswalk total from `players`. **Different numbers, by design.**

Nothing in `lib/seasonIngest.mjs` records this. A future "compute it once and reuse it" change looks
entirely reasonable in isolation and would corrupt both families' manifests silently, permanently, on
append-only data.

### 1.3 · `gamelogs` divergences

| | |
|---|---|
| **two counts** | `parsedRowCount` gates; post-crosswalk `rowCount` goes in the envelope — the oline shape again (§1.2) |
| **two-stage derive** | `parsePlayerGameLogs` → `rekeyGameLogsBySleeper`, plus a conditional `<n> players had no crosswalk mapping — skipped` log |
| **injected csv** | `let csv = !all ? csvOpt : null` then fetch-or-use-injected, with **two different log lines**. Lives in `derive`, closing over `all` and `csvOpt` |
| **crosswalk pre-read** | `cw` is read before the loop, and its failure diverges: warn-and-return under `--dry-run`, **throw** otherwise. Two of the nine tests cover it. Stays in the caller |
| **envelope season** | `season: parsed ?? season` — `derive` must return `parsed` |
| **envelope** | `playerCount`, `unmapped`, `players` |
| **dry-run line** | three clauses: `<r> game rows, <p> players (<u> unmapped)` |

Its net has **nine** tests, including the two crosswalk cases.

**The name collision is the trap.** The helper's callback is called `rowCount`, and for `gamelogs` it
must return `parsedRowCount` — while the envelope field *also* called `rowCount` is a different
number. Writing `rowCount: o => o.rowCount` compiles, reads correctly, and is wrong.

---

## 2. The decisions

### 2.1 · One shared `spyDeps`, with console capture

`test/helpers/spy-deps.mjs`, exporting the helper all six files already have plus a `logs` array:

```js
export function spyDeps(overrides = {}, t) {
  const calls = { writeJsonStable: [], updateManifestEntry: [], setStepOutput: [] };
  const logs = [];
  if (t) t.mock.method(console, 'log', (...a) => { logs.push(a.join(' ')); });
  return { deps: { …defaults, ...overrides }, calls, logs };
}
```

The two families with an input seam (`gamelogs`, `advstats`) pass their extra defaults through
`overrides` — that is the only difference between the 19-line and 14-line copies today.

**Mechanical for five files, mechanical-plus-assertions for four.** No test's existing assertions
change.

### 2.2 · Assert log text on the branches the byte-diffs never reached

For each of `schedule`, `teamcontext`, `oline` and `gamelogs`, add log assertions to the tests that
already exercise these branches — **new assertions in existing tests, not new tests**:

| branch | assert |
|---|---|
| not-published | the exact `notPublished` string |
| sparsity | the exact `sparsity` string, `MIN_*` value included |
| force gate | already asserted via the throw message — **leave it** |
| **write path** | **both** `afterWrite` and `afterManifest` strings, in order |

Dedup and dry-run are already covered by my byte-diffs; asserting them too is cheap and makes the
set uniform — **do it**, so the next family's conversion has a complete template.

**Assert full strings, not fragments.** `assert.ok(log.includes('skipping'))` passes on a reworded
message and is the reason this gap existed.

### 2.3 · One comment at the helper's `rc` site

At `lib/seasonIngest.mjs:93`, stating: `rc` is the **pre-validate** count and feeds the sparsity gate
only; `manifestRecordCount` and `envelope` are called separately, after `validate`, and must
recompute; `oline` and `gamelogs` both depend on the two being different (§1.2); reusing `rc` for the
manifest corrupts them silently on append-only data.

**A comment, not a guard.** A runtime assertion that the two differ would be wrong — for `schedule`
and `teamcontext` they are legitimately equal.

### 2.4 · Alternatives rejected

| option | rejected because |
|---|---|
| Convert `gamelogs` first, add log assertions after | §header — assertions written against converted code constrain nothing |
| Log assertions for the three converted families only, `gamelogs` in slice 6 | Leaves the write-path hooks unverified for the family most likely to expose them, and splits one mechanical change across two slices |
| Snapshot-match whole log output per test | Brittle against unrelated additions and it hides *which* string changed |
| Assert log fragments | §2.2 — a fragment passes on a reworded message |
| A runtime guard instead of §2.3's comment | §2.3 — the counts are legitimately equal for two families |

---

## 3. The edits

### 3.1 · `test/helpers/spy-deps.mjs` (new) and all six test files

Extract per §2.1; each file imports it and deletes its local copy. **No existing assertion changes.**

### 3.2 · Log assertions (§2.2) in four files

`schedule`, `teamcontext`, `oline`, `gamelogs`. **These land while `gamelogs` is still unconverted
and must pass** — that is what makes them an acceptance criterion for step 4.

### 3.3 · `lib/seasonIngest.mjs`

§2.3's comment. **No code change.**

### 3.4 · `scripts/update-gamelogs.mjs`

Replace the `for (const season of seasons)` body with one `runSeasonKeyedIngest` call. Keep
unchanged: the module header, `playersHash`, `DEFAULT_DEPS`, the signature **including `csv` and
`currentSeason`**, season resolution, the crosswalk pre-read **and its dry-run/throw divergence**,
and the `if (!all) d.setStepOutput(…)` line.

```js
derive: async (season) => { …injected-csv branch, fetch, parse, re-key, unmapped log… 
                            return { players, parsed, parsedRowCount, playerCount, rowCount, unmapped }; },
rowCount: (o) => o.parsedRowCount,      // GATE ONLY — not o.rowCount (§1.3)
envelope: (season, o) => ({ schemaVersion: 1, season: o.parsed ?? season, generatedAt: …,
                            rowCount: o.rowCount, playerCount: o.playerCount,
                            unmapped: o.unmapped, players: o.players }),
manifestRecordCount: (o) => o.rowCount,
```

---

## 4. Step order

1. Extract the shared `spyDeps` (§3.1). `npm test` → **662**, unchanged, no assertion touched.
2. Add the log assertions (§3.2). **Run them — all must pass against current code, with `gamelogs`
   still unconverted.** Any that fails is a real finding about an already-converted family: report it
   before adjusting anything.
3. Add the helper comment (§3.3). Suite still 662.
4. Convert `gamelogs` (§3.4).
5. **Run `gamelogs`' nine tests plus the new log assertions.** All pass unedited.
6. **Run `schedule`, `teamcontext` and `oline`.** They share the helper.
7. **Byte-diff live output**, before and after: `gamelogs --year 2023 --dry-run`. Skip `--all` here —
   it is a 14-season backfill fetching ~8.5 MB per season.
8. `npm test` (662 + the added assertions live inside existing tests, so the **test count does not
   change** — only assertion count). `npm run smoke`.
9. Commit; `git -c rebase.autoStash=true pull --rebase origin main`; push. **No CDN purge.**

**Steps 1–3 must all precede step 4.** That is the difference between this slice verifying something
and merely asserting it.

---

## 5. Tests

**No new test cases.** New *assertions* inside existing ones (§2.2), and one shared helper. `npm test`
should still report **662**.

If a log assertion cannot be added to an existing test because no test reaches that branch, that is a
net gap — **report it** (as slice 4 did for oline's post-drop count) rather than adding a test to
paper over it.

---

## 6. Cross-repo impact

**Two entries fire: CR-09 and CR-18.** CR-09 names `scripts/update-gamelogs.mjs` and
`parsePlayerGameLogs`; CR-18's brace expansion covers it. `lib/seasonIngest.mjs` and everything under
`test/` are named by no entry.

**No change owed on either.** No served shape, floor, field, coverage or cadence moves.

### CR-09 · gamelogs

> Shape or floor changes land in both repos together. The per-game `week` and `team` keys are load-bearing beyond display: `resolvePlayerTeam`'s week-grain path matches on `g.week === week` and reads `g.team`, and returns `null` rather than throwing — renaming either key empties every week-grain team join **silently**. Per-game `team` is the **current-franchise** domain in all seasons and is era-remapped app-side (CR-16); do not "fix" it to era-accurate upstream without changing both repos. Per-game rate fields (`racr`/`targetShare`/`airYardsShare`/`wopr`/`pacr`/`passingCpoe`) are single-game values and must never be summed — `passingCpoe` specifically is now also attempt-weighted by a second consumer (`seasonEfficiency.js`'s `CPOE` column), not merely "never summed". `fantasyPoints`/`fantasyPointsPpr` are nflverse default scoring and are never reconciled with `src/utils/fantasyPoints.js` (see CR-14). View-only on both sides — must never feed projection/scoring/grading. 2019 was backfilled on 2026-07-03 (5,756 rows across 586 players) and is no longer a gap; the family is complete 2012–2025.

**Note what this Mirror means here.** The per-game `week`/`team` keys live **inside** each player's
`games` array — the helper never inspects them, and `envelope` passes `o.players` through by
reference. So the conversion cannot reshape them. **The risk it does carry is `playerCount` /
`rowCount` / `unmapped`** — the three envelope counts — which is exactly what §1.3's name collision
threatens.

### CR-18 · signal registry / data-catalog

> This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

**No row edit owed.**

---

## 7. Done-definition

**The log gap**
- [ ] `test/helpers/spy-deps.mjs` created; **all six** test files use it; every local copy deleted
- [ ] It captures `console.log` via `t.mock.method` — **no experimental Node flag added**
- [ ] Log assertions added for `notPublished`, `sparsity`, `dedup`, `dryRun`, **`afterWrite` and
      `afterManifest`** across `schedule`, `teamcontext`, `oline`, `gamelogs`
- [ ] **Full-string equality, not `includes`**
- [ ] **They passed against unconverted `gamelogs`** (§4 step 2) — reported if any did not

**The comment**
- [ ] `lib/seasonIngest.mjs:93` documents why `rc` is gate-only and must not be reused for the
      manifest, naming `oline` and `gamelogs`
- [ ] **No code change** in the helper

**The conversion**
- [ ] Only the loop body replaced; header, `playersHash`, `DEFAULT_DEPS`, the signature **with `csv`
      and `currentSeason`**, season resolution, the crosswalk pre-read **and its dry-run/throw
      divergence**, and `setStepOutput` all unchanged
- [ ] **`rowCount: o => o.parsedRowCount`** — the gate count, *not* the envelope's `rowCount`
- [ ] Envelope carries `season: o.parsed ?? season` and all three counts correctly
- [ ] `--all` still ignores an injected `csv` and fetches per season
- [ ] Both crosswalk tests still pass — warn-and-return under dry-run, throw otherwise
- [ ] All nine gamelogs tests pass unedited (beyond the added log assertions)

**Regression**
- [ ] `schedule`, `teamcontext`, `oline` all pass
- [ ] Byte-diff clean for `gamelogs --year 2023 --dry-run`
- [ ] `npm test` = **662** (assertions added inside existing tests; no new cases)
- [ ] CR-09 / CR-18 Mirrors emitted; **no registry text edited**
- [ ] `advstats`, `roster` untouched
- [ ] `store-audit-2026-08-25.md` still modified-and-uncommitted, untouched

---

## 8. Settled decisions

- **Log assertions land before the conversion** (header, §4) — otherwise they describe rather than
  constrain.
- **Full-string equality** (§2.2) — a fragment passes on a reworded message.
- **New assertions in existing tests, not new tests** (§5) — the branches are already reached.
- **A comment, not a guard, at `rc`** (§2.3) — the counts are legitimately equal for two families.
- **`rowCount` returns `parsedRowCount` for gamelogs** (§1.3) — the name collision is the trap.
- **No `--all` byte-diff for gamelogs** (§4 step 7) — a 14-season, ~120 MB backfill.

---

## 9. Invariant check

- **Invariant 3 (manifest is the index)** — §2.3's comment protects exactly this: `recordCount` must
  match what the file holds, and for two families that is not the gate count.
- **Invariant 1 (append-only)** — no data file rewritten; the force gate is unchanged.
- **Invariant 4 (schemaVersion)** — unchanged, hard-coded in the helper.

---

## 10. Program status

| slice | family | state |
|---|---|---|
| 1–4 | seams, net, helper, `schedule`, `teamcontext`, `oline` | done |
| **5** | **`gamelogs`** + log gap + helper comment | **this** |
| 6 | `advstats` | seamed; shares a CSV with gamelogs |
| 7 | `roster` | last — two extra writes + the gate inversion |

After this slice **every message the helper emits is asserted**, so slices 6 and 7 inherit a complete
acceptance template rather than a manual byte-diff.

---

## 11. Out-of-scope observations (not edits)

1. **`advstats` (slice 6) should be nearly free** — it shares `parsePlayerGameLogs`' source CSV, has
   the same injected-`csv` seam, and is single-season, so it exercises no helper path this slice does
   not. If it needs a helper change, that is a surprise worth stopping for.
2. **`roster` remains the only genuinely unsolved conversion** — two extra writes on separate
   branches plus the gate inversion (`season-ingest-extract.md` §10.1/§10.3). Nothing in slices 2–5
   has made it easier.
3. **The `rowCount` callback name is now a known hazard** (§1.3) for two of five converted families.
   Renaming it `gateRowCount` would remove the trap outright — a one-line change across five call
   sites, worth doing in slice 6 or 7 rather than mid-conversion here.
