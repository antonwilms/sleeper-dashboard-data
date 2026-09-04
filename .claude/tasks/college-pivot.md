# E2: pivot the college family — the program, and its app-side prerequisite

**Type:** two-repo shape change across three phases. **This file plans the program and specifies
Phase A only.**
**Phase A is an APP-repo change and changes no served data.** Phases B and C get their own slices.
**Session model:** plan (opus, this file). Implementation is a separate sonnet session — do not edit
source here.
**Source:** `store-audit-2026-08-25.md` **E2**, queue row 13. Re-derived against live source and live
data 2026-09-03 at HEAD `a8c1a4b` (data) / `51ace22` (app).

> **The ordering is not negotiable, and getting it backwards is silent.** If the data repo ships
> pivoted files first, `isValidCFBDRows` rejects them, `tryDataStore` returns null, and
> `src/api/cfbd.js` falls through to its **live CFBD API** path — a keyed, rate-limited third-party
> endpoint — for every category × year a user opens. **The symptom has two forms**, depending on
> deployment: with a valid `VITE_CFBD_API_KEY` it quietly costs API quota, visible only in a console
> line and the network tab; **without one** `src/api/cfbd.js` throws on the non-ok response,
> `App.jsx` catches it into a `console.warn`, and `collegeMatches` stays null — **blank, plus a
> warning nobody reads**. **The app must tolerate both shapes before any data moves.**

**Working-tree note.** `store-audit-2026-08-25.md` is modified and uncommitted. **Do not stage,
commit, revert or edit it.** Nothing here touches it.

---

## 1. Verified facts

### 1.1 · The saving is real and larger than the audit's estimate

27 files, 314,871 long-form rows → 59,991 player records. Measured by building the pivoted form and
gzipping both:

| | raw | gzipped |
|---|---|---|
| long form (today) | **70.05 MB** | **5.99 MB** |
| pivoted, app-shaped | **8.27 MB** | **1.70 MB** |
| reduction | **−88%** | **−72%** |

The audit said −86% / −75% on a single file; family-wide, raw is better and gzip slightly worse.
**Gzip is the number that matters** — jsDelivr serves compressed — so the honest headline is
**~4.3 MB off the wire**, not 62 MB.

A row today repeats nine keys to carry one `statType`/`stat` pair, and `stat` is a **string**:

```json
{"season":2024,"playerId":"4685381","player":"Emmanuel Henderson Jr.","position":"WR",
 "team":"Alabama","conference":"SEC","category":"receiving","statType":"LONG","stat":"34"}
```

`season` and `category` are constant per file. Receiving carries 5 `statType`s
(`LONG`, `REC`, `TD`, `YDS`, `YPR`).

### 1.2 · The app already builds the target shape — twice per load

`pivotStatRows` (`src/api/cfbd.js`) turns the rows into
`{ [playerId]: { playerId, player, team, position, conference, ...statTypes } }` — flat, stat types
as **top-level keys**, `parseFloat`ed, `season`/`category` dropped.

**So the served shape should be exactly that object.** `src/utils/collegeMetrics.js` — which CR-05
records as the **only live consumer** since PlayersTab was deleted — reads `rec.YDS`, `rec.TD`,
`rush.YDS`, `pass.ATT` off pivoted records. **If the served shape matches `pivotStatRows`' output,
`collegeMetrics.js` needs no change at all.**

### 1.3 · What blocks it, precisely

```js
export function isValidCFBDRows(parsed) {
  if (!Array.isArray(parsed) || parsed.length === 0) return false;
  const sample = parsed[0];
  return sample != null && 'playerId' in sample && 'statType' in sample && 'stat' in sample;
}
```

A pivoted envelope fails at `Array.isArray` before any field is examined. **No pivoted shape can
pass this validator** — an array of pivoted records would clear `Array.isArray` and still fail on
`statType`. The validator must change either way.

`tryDataStore(dsPath, { validate: isValidCFBDRows })` returning null falls through to the live API
(§header). The manifest ceiling is not the issue: college entries are `schemaVersion: 1` and
`MAX_SUPPORTED_SCHEMA = 4`.

Data side, `validateCfbdCategory` (`lib/validate.mjs:218`) requires an array of ≥500 rows each
carrying `playerId`/`statType`/`stat` — **it must change too**, in Phase B.

### 1.4 · The IndexedDB cache is a **fourth** shape source, and it fires first

**This is the flag that reshaped Phase A.** `getBulkPlayerStats` checks the cache *before* the data
store (`src/api/cfbd.js:42-56`) and returns `record.data` **verbatim**:

```js
const record = await getCacheRecord(cacheKey);
if (record && record.data !== null) {
  if (record.sourceLastModified) {
    const entry = await getManifestEntry(dsPath);
    if (entry && …lastModified > …sourceLastModified) { /* fall through */ }
    else { console.log(`[cfbd] cache hit: … (${record.data.length} entries)`); return record.data; }
  }
}
```

Entries written by today's app are **long-form arrays** at TTL `999999` (~694 days), and **Phase A
changes no manifest `lastModified`**, so the freshness compare keeps returning them.

**So if Phase A drops the `pivotStatRows` calls in `collegeMatch.js` while the cache still holds
long-form arrays, the app reads long-form data into pivoted-shape code — the first time it is opened
after the change, not at Phase B.** (There is one user and no deployment — see
`college-pivot-phase-b.md` §0. The failure is real; the population is one browser.) `Object.entries(array)` yields index keys, `receiving` becomes
`{statType:'LONG', stat:'34'}` with no `YDS`, `computeTeamTotals` sums `undefined ?? 0`, and **every
`domRating`/`peakDominator` goes null with every rookie's `collegeBase` at 1.0** — silently, with no
error and no test failure.

That is precisely the failure class the header exists to prevent, reproduced *inside* the phase meant
to prevent it. **§2.2 normalises at every exit, including the cache hit, and caches the normalised
value.**

### 1.5 · Phase A is small but not as covered as it looks

App-side surface: `isValidCFBDRows` (`src/api/dataStore.js:108`), the whole load path in
`src/api/cfbd.js` **including the cache branch** (§1.4), `pivotStatRows`, the three call sites in
`src/utils/collegeMatch.js:125-127`, and **`src/utils/exportData.js` `classifyKey`** (§5).

**Two coverage facts the plan must not assume away:**

- **`isValidCFBDRows` has no test anywhere in `src/`** — the only references are its definition and
  its single use. `src/api/cfbd.test.js`, which an earlier draft named as the guard, tests only
  `collegeFetchYears`. Widening it ships untested unless §4 adds one.
- **`src/utils/collegeMatch.test.js` cannot pass unedited.** It `vi.mock`s `pivotStatRows` and
  `computeTeamTotals` (`:5-8`) and feeds `matchCollegeToSleeper` placeholder input
  (`receiving: { 2020: [{}] }`) while supplying the *real* pivoted data through
  `mockReturnValueOnce` chains. Drop the three calls and the suite receives `[{}]` as its pivoted
  data; every match assertion fails. **§4 handles this explicitly.**

---

## 2. The program

### 2.1 · Three phases, in this order

| phase | repo | change | ships when |
|---|---|---|---|
| **A** | **app** | accept **both** shapes; normalise to the pivoted object at the loader boundary | **first — this slice** |
| B | data | rewrite 27 files pivoted, `schemaVersion` 1→2, update `validateCfbdCategory`, purge CDN | after A is **running locally** (§B.0 — there is no deployment) |
| C | app | delete the long-form branch and `pivotStatRows` | after B, optional, no hurry |

This is expand → migrate → contract. **A is safe to ship alone** — it changes no data and no
behaviour against today's files. **B without A is the silent-API-fallback regression.**

### 2.2 · Phase A: one `normalize()`, applied at **every** exit and every cache write

`getBulkPlayerStats` has **four** value sources, not three (§1.4). Route all of them through one
function:

```js
// returns the pivoted object for any accepted input
function normalizeCollegeStats(v) {
  if (Array.isArray(v))                 return pivotStatRows(v);        // long form: cache, store, live API
  if (v && typeof v === 'object' && v.players) return v.players;        // pivoted envelope
  return null;                                                          // caller treats as miss
}
```

| source | today | after Phase A |
|---|---|---|
| **cache hit** (`:42-56`) | returns `record.data` verbatim | **normalised** — this is §1.4's fix |
| data store (`:61`) | long-form array | normalised |
| live CFBD API (`:70-76`) | long-form array | normalised |
| *(future)* pivoted envelope | — | `players` returned directly |

**Cache the normalised value, not the raw one.** `setCacheWithMeta` is called at `:62` with
`dsResult` and at `:76` with `data`, both **pre-normalisation**. An earlier draft of this plan said
"cache semantics unchanged" — that was wrong, and following it literally would re-create §1.4's bug
on every subsequent session, permanently for API-only deployments (`VITE_DATA_STORE_URL` unset).

`collegeMatch.js:125-127` then stops calling `pivotStatRows` and consumes what the loader returns.

**Normalising at the loader, not at each call site**, is what makes Phase C a deletion rather than
another migration, and it keeps the live-API path — the fallback for a genuinely missing file —
working unchanged after the data moves.

`isValidCFBDRows` becomes shape-tolerant: today's long-form check, **or** an object with a `players`
object and a numeric `rowCount`. Keep it strict about both — a validator that accepts anything
reintroduces the silent fallback in a new form.

### 2.3 · The served shape for Phase B (decided now, so A can be written against it)

```json
{ "schemaVersion": 2, "season": 2024, "category": "receiving",
  "generatedAt": "…", "rowCount": 4087,
  "players": { "4685381": { "playerId": "4685381", "player": "…", "team": "Alabama",
                            "position": "WR", "conference": "SEC",
                            "LONG": 34, "REC": 2, "TD": 0, "YDS": 41, "YPR": 20.5 } } }
```

- **`players` keyed by `playerId`**, matching every other family's envelope convention.
- **`playerId` retained inside the record** even though it is the key — `pivotStatRows` includes it
  today and `collegeMatch.js` may read it off the value.
- **Stat values are numbers**, `parseFloat`ed at ingest. This is where the string→number change lands.
- `season` and `category` promoted to the envelope; dropped from every record.

### 2.4 · Alternatives rejected

| option | rejected because |
|---|---|
| Ship B first, fix the app after | §header — silent fallback to a keyed, rate-limited API |
| Serve an **array** of pivoted records | Still fails `isValidCFBDRows`, so it buys nothing; and every other family keys by id |
| Keep `stat` as strings | The app `parseFloat`s every value on every load; numbers are the point |
| Normalise in `collegeMatch.js` instead of the loader | Leaves three call sites to migrate in Phase C instead of one, and strands the live-API path |
| Skip the envelope, serve a bare `{playerId: {...}}` map | No `schemaVersion` to gate on, and the manifest ceiling is the mechanism the app already uses |
| Do A and B in one slice | They are in different repos with a rebuild between them; that is the whole ordering constraint |

---

## 3. The edits — Phase A only, app repo

### 3.1 · `src/api/dataStore.js`

`isValidCFBDRows` accepts either:
- `Array.isArray(parsed) && parsed.length > 0` with `playerId`/`statType`/`stat` on `parsed[0]` — today's check, unchanged; **or**
- a non-null object with a `players` object (non-empty) and a numeric `rowCount`.

### 3.2 · `src/api/cfbd.js`

Add `normalizeCollegeStats` (§2.2). Apply it at **all three** live return points — the cache hit, the
data-store branch, the live-API branch — and pass the **normalised** value to both `setCacheWithMeta`
calls (`:62`, `:76`).

**Three `.length` log sites print `undefined` for a pivoted object**, not one:

| line | log |
|---|---|
| `:50` | `[cfbd] cache hit: … (${record.data.length} entries)` |
| `:66` | `[cfbd] loaded from data store: … (${dsResult.length} rows)` |
| `:126` | `loadCollegeStats`'s per-year line — `rec: ${receiving[year].length}` |

Fix all three to report the record count and which shape was seen. **`:126` is the one that matters
most** — it reports all three categories per year and is what a human will read when confirming
Phase B took effect.

### 3.3 · `src/utils/collegeMatch.js`

Drop the three `pivotStatRows` calls at `:125-127`; use the loader's return directly.
`computeTeamTotals` consumes the pivot output and is unaffected.

### 3.4 · Keep `pivotStatRows` exported

Phase A still needs it for the long-form and live-API paths. **It is deleted in Phase C, not here.**

---

## 4. Step order — Phase A

1. **Add a test for `isValidCFBDRows` first** — it has none anywhere in `src/` (§1.5). Put it in
   `src/api/dataStore.test.js`: today's long-form array accepted, a pivoted envelope accepted, and
   **the rejections** (bare array of pivoted records, `players` present but empty, `rowCount`
   missing, `null`). Write it against the **current** implementation: the long-form and rejection
   cases must pass before the widening, the pivoted case after.
2. Widen `isValidCFBDRows` (§3.1). Step 1's pivoted case now passes; the rest still do.
3. Add `normalizeCollegeStats` and apply it at all three exits **and both cache writes** (§3.2).
   Fix the three `.length` logs.
4. **Rewrite `src/utils/collegeMatch.test.js`** (§1.5). It cannot pass unedited: it mocks
   `pivotStatRows`/`computeTeamTotals` and feeds placeholder input while injecting the real pivoted
   data through `mockReturnValueOnce`. Drop the `pivotStatRows` mock and **pass pivoted objects
   directly** as input; keep `computeTeamTotals` mocked and **keep every assertion byte-identical**.
   If an assertion has to change, the normalisation altered behaviour — report it.
5. Drop the three `pivotStatRows` calls in `collegeMatch.js:125-127` (§3.3).
6. **The no-op proof, on the instrument that survives the change:** `collegeMetrics.test.js` passes
   **unedited**, and a new cache-path test asserts that a **long-form array already in the cache**
   still yields pivoted output. That second test is §1.4's regression guard and is the most important
   thing this slice adds.
7. Full app suite. Record before/after counts.
8. Commit and push. **Phase B must not start until the locally-run app is on this commit** — a
   `git pull` and a dev-server restart. This repo has no CI and is never deployed
   (`college-pivot-phase-b.md` §0); an earlier draft of this plan wrongly assumed a hosted app with
   a user base.

**An earlier draft made step 4 the linchpin and required `collegeMatch.test.js` to pass unedited.
That was impossible** — the file's whole design routes real data through the mock this slice
removes. Step 6 is the replacement, and it tests the thing that actually breaks.

## 5. Cross-repo impact

**CR-05 fires**, on the app side — `pivotStatRows`, `isValidCFBDRows` and `collegeMatch.js` are all
named in its app-side `Triggers`, and Phase A edits all three.

### CR-05 · CFBD college stats

> Adding or removing a `statType` must be coordinated — the pivot silently drops unknown types and yields empty columns for missing ones. Renaming one is worse than dropping it: `YDS`/`TD`/`ATT` are read by name in `src/utils/collegeMetrics.js:69-124`, so renaming those nulls the dominator rating and the QB college score, with no error and no test failure. (Note the name list in `collegeMetrics.js:57-59` is a *comment* recording the confirmed 2023 field names; it is documentation, not a read.)

**No `statType` is added, removed or renamed in any phase** — that is the specific hazard this Mirror
guards, and the pivot preserves the set exactly. **What does change is where the pivot happens and
what type the values are** (string → number), which the Mirror does not cover.

**CR-05's `Invariant` — *"the confirmed `statType` set stored per category is exactly the set the
app's pivot expects"* — becomes tautological after Phase B**, since the stored set *is* the pivoted
set. That is a registry-text change, and it belongs to **Phase B**, landing in both repos in the same
change. **Phase A must not touch registry text.**

**No data-side entry fires in Phase A** — no data-repo file changes.

**CR-04 does not fire, and is dismissed here by name.** Its Triggers read *"`getManifestEntry` and
the validator block in `src/api/dataStore.js`"*, which literally covers editing `isValidCFBDRows`.
Phase A touches no manifest field name, shape or read, and gates on none of `schemaVersion` /
`inProgress` / `lastModified`. The trigger text over-covers; saying so here saves the next reviewer
the same trip.

### 5.1 · Two `[registry-stale]` findings on CR-05 — recorded, deferred to Phase B

Both are real gaps in CR-05's **app side**, which is frozen authority from the data repo's seat and
must be corrected in both repos in one change. **Phase A does not edit registry text** (§5), so they
ride with Phase B:

1. **`computeTeamTotals` (`src/api/cfbd.js:103`) is an unlisted live consumer.** It reads the
   `YDS`/`TD` statType literals off pivoted records. CR-05's app side names only `pivotStatRows:85`
   in that file and asserts `collegeMetrics.js` is *"now the only live consumer"* — that is wrong.
   Under CR-05's own rename hazard this zeroes every team denominator, nulling every dominator
   rating a **second** way, independently of `collegeMetrics.js:69-124`.
2. **`src/utils/exportData.js` `classifyKey` is an unlisted producer at CR-05's own served path.**
   It routes the `cfbd-players/<year>/<category>` cache value to `college/<category>/<year>.json` in
   the export ZIP, and `exportAllData` writes `record.data` verbatim. It appears in neither CR-05's
   app side nor its Triggers.

   **This has a Phase A consequence**, not just a bookkeeping one: because §2.2 now caches the
   *normalised* value, **an export from the new app writes pivoted objects into that path** — a
   shape change to the export payload, arriving before Phase B. §6 pins it as a deliberate,
   acknowledged effect rather than a surprise.

---

## 6. Done-definition — Phase A

**Validator**
- [ ] `src/api/dataStore.test.js` gains an `isValidCFBDRows` test — **written before the widening**,
      covering both accepted shapes **and the rejections** (bare array of pivoted records, empty
      `players`, missing `rowCount`, `null`)
- [ ] `isValidCFBDRows` accepts both shapes and **rejects everything else** — no loosening to
      `typeof === 'object'`

**Normalisation**
- [ ] One `normalizeCollegeStats`, applied at **all three** exits — **cache hit included** (§1.4)
- [ ] **Both `setCacheWithMeta` calls store the normalised value** (`:62`, `:76`)
- [ ] **A test proves a long-form array already in the cache still yields pivoted output** — the
      §1.4 regression guard, and the single most important thing this slice adds
- [ ] All **three** `.length` logs fixed (`:50`, `:66`, `:126`) to report record count and shape

**Call sites**
- [ ] `collegeMatch.js:125-127` no longer calls `pivotStatRows`; `computeTeamTotals` unchanged
- [ ] `pivotStatRows` **still exported** — Phase C deletes it, not this slice
- [ ] `collegeMetrics.js` **untouched**, and `collegeMetrics.test.js` passes **unedited**
- [ ] `collegeMatch.test.js` **rewritten** to pass pivoted objects directly (§4 step 4) with
      **every assertion byte-identical** — a changed assertion is a finding, not a fix

**Boundaries**
- [ ] **No registry text edited** — both §5.1 findings deferred to Phase B
- [ ] **No data-repo file touched**; no served file, no manifest, no CDN purge
- [ ] **Acknowledged side effect:** an export from the new app now writes *pivoted* objects to
      `college/<category>/<year>.json` in the ZIP (§5.1.2). Deliberate, recorded, not a surprise
- [ ] App suite green; before/after counts recorded
- [ ] Pulled and running locally before Phase B is implemented — **not** "deployed"; there is no
      deployment (`college-pivot-phase-b.md` §0)

## 7. Settled decisions

- **App tolerates first, data migrates second** (§2.1) — B-first is a silent fallback to a keyed API.
- **Normalise at the loader, not the call sites** (§2.2) — makes Phase C a deletion and keeps the
  live-API path working.
- **Served shape is `players` keyed by `playerId`, values numeric** (§2.3) — matches
  `pivotStatRows`' output and every other family's envelope.
- **`playerId` stays inside the record** (§2.3) — the app reads it off the value today.
- **`pivotStatRows` survives Phase A** (§3.4).
- **Registry text waits for Phase B** (§5) — an entry edit must land in both repos in one change.
- **Normalise at every exit including the cache, and cache the normalised value** (§2.2) — the cache
  is a fourth shape source that fires *before* the data store, holds long-form arrays for ~694 days,
  and is unaffected by any `lastModified` change Phase A makes.
- **`collegeMatch.test.js` gets rewritten, not preserved** (§4 step 4) — it routes real data through
  the very mock this slice removes, so "passes unedited" was never achievable there.
- **The cache-path regression test is the no-op proof** (§4 step 6) — not `collegeMatch.test.js`.

---

## 8. Invariant check

- **Invariant 4 (schemaVersion)** — Phase B's 1→2 bump *is* an incompatible layout change, so it is
  warranted here in a way the advstats bump was not. Under `MAX_SUPPORTED_SCHEMA = 4`.
- **Invariant 1 (append-only)** — Phase B rewrites 27 completed-season files. That is a **shape
  migration, not a correction**, so it needs the same explicit justification F-24 used: the audit
  trail is git history plus a `data-catalog.md` note.
- **Invariant 3 (manifest is the index)** — 27 entries get new `recordCount` (rows → players),
  `schemaVersion` and `lastModified` in Phase B.
- **CDN purge** — Phase B overwrites 27 existing files: purge each **and** `manifest.json`.

---

## 9. What Phase B will need (not planned here)

Recorded so Phase A is written against a known destination:

1. `lib/cfbd.mjs` + `scripts/update-cfbd.mjs` — emit the §2.3 envelope; `parseFloat` at ingest.
2. `lib/validate.mjs` `validateCfbdCategory` — currently requires an array of ≥500 rows with
   `playerId`/`statType`/`stat`. Needs a player-count floor instead, and a `statType`-set assertion
   to keep CR-05's invariant checkable.
3. **A one-shot rewrite of 27 files** — `cfbdHash` is order-sensitive by design
   (`stable-hash.md` §1.1), so the dedup gate will fire on every file, which is correct here.
4. `data-catalog.md` — the college row, plus the Invariant-1 justification.
5. **CR-05's `Invariant` and `App side` text** — both repos, same change (§5).
6. CDN purge for 27 files + manifest.

---

## 10. Out-of-scope observations (not edits)

1. **The real win is ~4.3 MB gzipped, not 62 MB raw** (§1.1). Still the largest over-the-wire saving
   available in this repo, and the audit's own framing — *"the only place where a shape change buys a
   real over-the-wire win"* — holds. But the raw number oversells it by 14×.
2. **The live-API fallback is a latent cost centre.** Any future validator tightening silently routes
   college reads to a keyed endpoint. Worth a deliberate decision about whether that fallback should
   log louder, or exist at all now that the store is complete for 2017–2025.
3. **`conference` is `?? null` in the pivot but always present in the data** — checked across the
   sample. The null-coalesce may be vestigial.
4. **CR-05's app side is stale in two ways** (§5.1) and its `isValidCFBDRows:107` anchor is `:108`
   live. The anchor is cosmetic; the two unlisted consumers are not.
5. **This review could only happen in the app repo.** The data repo's plan-reviewer cannot read
   `src/` by mandate, so it could not have found §1.4 — the flag that reshaped the phase. Any
   future app-primary slice planned from the data repo needs the app's own reviewer, not this
   repo's.
