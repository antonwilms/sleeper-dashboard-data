# E2 Phase B: migrate the 27 college files to the pivoted shape

**Type:** one-shot in-place migration + writer/validator change + a two-repo registry correction.
**Served shape changes. `schemaVersion` 1→2. 27 files rewritten. CDN purge required.**
**Session model:** plan (opus, this file). Implementation is a separate sonnet session — do not edit
source here.
**Source:** `college-pivot.md` §2.1 (the program) and §9 (what Phase B needs). Designed against live
source and live data 2026-09-03 at HEAD `a8c1a4b` (data) / `1a02614` (app).

> **GATE: the app you actually run must be on `1a02614` or later.** An earlier draft of this plan
> said "DEPLOYED, not merely pushed" and reasoned about "every returning user." **That was wrong,
> and wrong about how this system is operated** — see §0. There is no deployment. The gate is a
> `git pull` and a dev-server restart, and it is entirely in the operator's hands.

**Working-tree note.** `store-audit-2026-08-25.md` is modified and uncommitted. **Do not stage,
commit, revert or edit it.** Nothing here touches it.

---

## 0. The app is never deployed — what the gate actually means

**Verified against the app repo at `1a02614`:**

| checked | found |
|---|---|
| `.github/` | **does not exist** — the app repo has no CI at all |
| `vercel.json` / `netlify.toml` / `fly.toml` / `Procfile` / Dockerfile | none |
| `package.json` | `"private": true`, **no `homepage`**, scripts are `dev` / `build` / `lint` / `preview` / `test` only |
| any hosted URL in `*.md` / `*.json` / `*.js` | **none** |
| `README.md:26`, `CLAUDE.md:11` | `npm run dev` → `http://localhost:5173` |

**It is a local, single-user tool.** The *data* repo is the thing that is published, via jsDelivr.
So there is no deploy pipeline to wait on, no user population, and the IndexedDB cache holding
~694-day long-form entries is **the operator's own browser profile**.

**The real precondition, and all of it:** be running app code at `1a02614` or later the next time the
dashboard is opened after Phase B's data lands. `git pull` plus a dev-server restart.

**And the blast radius is small.** Phase A already normalises at the cache-hit branch, so a stale
*cache* is handled; the only exposure is a stale *bundle*, which shows up as the CFBD-API fallback
(or a blank college section without a key) and is fixed by rebuilding. One browser, seconds to
recover — not a population, not irreversible.

**Why this correction is recorded rather than quietly edited:** the earlier gate would have blocked
implementation on a condition that cannot be satisfied, because it describes infrastructure that does
not exist. `college-pivot.md`'s Phase A/B ordering argument is still right — the app must understand
the new shape before the data changes — but its *urgency* was overstated by an assumption about
hosting that was never checked.

---

## 1. Verified facts

### 1.1 · The pivot is **numerically** lossless — but not string-lossless

| check | result |
|---|---|
| duplicate `(playerId, statType)` pairs | **0** |
| `null` stat values | **0** |
| values where `parseFloat` is non-finite | **0** |
| distinct statType sets per category, across 9 years each | **1** |

Category sets, stable across every year:

| category | statTypes |
|---|---|
| `passing` | `ATT, COMPLETIONS, INT, PCT, TD, YDS, YPA` (7) |
| `receiving` | `LONG, REC, TD, YDS, YPR` (5) |
| `rushing` | `CAR, LONG, TD, YDS, YPC` (5) |

The records are **dense in every file** — every player carries the full set for its category. So the
validator can assert set *equality*, not a subset.

**Per-player metadata is consistent**: `player`/`team`/`position`/`conference`/`season`/`category`
agree across every row for a given `playerId` — **0 conflicts in 314,871 rows** — so collapsing them
into one record is safe. `conference` is never null and never missing, which makes the ported
`conference ?? null` unexercised on stored data.

### 1.1a · What the pivot *does* discard — state it, do not paper over it

`stat` is stored as a **string** and the pivot emits a **number**. **24,065 of 314,871 values (7.6%)
change textual form**: `"1.000"` → `1`, `"10.0"` → `10`, `"0.500"` → `0.5` — concentrated in the rate
stats `PCT`/`YPA`/`YPC`/`YPR`.

**So the transform is numerically lossless and textually lossy, and the decimal formatting is not
recoverable from the pivoted file.** That matters twice:

- **§4 step 3's proof must compare numerically.** A set comparison on the raw strings fails on *all*
  314,871 rows, not zero — the reconstruction can never reproduce `"1.000"` from `1`.
- **§8's Invariant-1 justification cannot claim "content provably preserved" without qualification.**
  The *values* are preserved; their textual representation is not. Say so.

### 1.2 · Do **not** re-run the ingest — migrate in place

`scripts/update-cfbd.mjs` sources from the **live CFBD API** (`fetchCfbdCategory` → `getHeaders()`,
an API key). Re-running it across 27 files would:

- need a key and 27 API calls, and
- **conflate the shape change with whatever CFBD has revised** since each file was written.

That is exactly the confound the advstats slice hit — where a re-ingest silently moved 11 seasons
onto a different upstream tag and inverted the expected row-count direction. **The migration must be
a pure local transform of the bytes already on disk**, which makes it verifiable by round-trip
(§4 step 3) rather than by hoping upstream is stable.

This repo has three precedents: `scripts/migrate-f24-prune.mjs`,
`scripts/migrate-manifest-truth.mjs`, `scripts/migrate-drop-cfbd-raw.mjs`.

### 1.3 · The target envelope is fixed by what Phase A actually shipped

Not by what the program plan proposed — **by the landed code**:

```js
// src/api/dataStore.js — isValidCFBDRows, object branch
typeof parsed.players === 'object' && parsed.players !== null
  && Object.keys(parsed.players).length > 0
  && typeof parsed.rowCount === 'number'

// src/api/cfbd.js — normalizeCollegeStats
if (v && typeof v === 'object' && v.players) return v.players
```

So the envelope **must** carry a non-empty `players` object and a numeric `rowCount`, and `players`'
values are consumed directly as `pivotStatRows` output.

**`rowCount` keeps its repo-wide meaning — source rows — and the map size gets its own key.** Live
envelopes are unanimous: gamelogs `rowCount:6176` + `playerCount:588`; teamcontext `rowCount:570` +
`teamCount:32`; oline `rowCount:14368` + `teamCount:32` + `stateCount:1056`. **Every family carrying
both uses `rowCount` for source rows and a `*Count` for map keys.** An earlier draft made `rowCount`
the player count, inverting that.

Following the convention also **preserves the original long-form row count inside the file** — which
is exactly the provenance §1.1a says is otherwise lost, and the audit trail Invariant 1 wants.

```json
{ "schemaVersion": 2, "season": 2024, "category": "receiving",
  "generatedAt": "…", "rowCount": 20435, "playerCount": 4087,
  "players": { "4685381": { "playerId": "4685381", "player": "…", "team": "Alabama",
                            "position": "WR", "conference": "SEC",
                            "LONG": 34, "REC": 2, "TD": 0, "YDS": 41, "YPR": 20.5 } } }
```

Phase A only requires `typeof rowCount === 'number'`, so this satisfies it unchanged.

### 1.4 · Two writer facts that bite

1. **`updateManifestEntry`'s `schemaVersion` defaults to 1** (`lib/manifest.mjs:34`), and
   `update-cfbd.mjs` **passes none**. That is how all 27 entries read `1` today. **Phase B must pass
   `schemaVersion: 2` explicitly** — omitting it silently leaves the manifest at 1 while the files
   say 2, and the app gates on the manifest value.
2. **The dedup comparison breaks across the shape boundary.** `update-cfbd.mjs` computes
   `cfbdHash(existing) === cfbdHash(rows)` — after this slice `existing` is a pivoted envelope and
   `rows` is a freshly-fetched long-form array, so the hashes can never match and the dedup is dead.
   It must compare **pivoted to pivoted**.

### 1.5 · `validateCfbdCategory` rejects the new shape

`lib/validate.mjs:218` requires an array, `rows.length >= 500`, every row carrying
`playerId`/`statType`/`stat`, **and — which an earlier draft missed — an existing
`distinctPlayers < 200` floor** (`:236-241`). A pivoted envelope fails at `Array.isArray`.

So §2.3 is not "replacing a row floor with a player floor" — **the player floor already exists**, and
§2.3 is raising it and adding the statType assertion.

---

## 2. The decisions

### 2.1 · A one-shot migration script, separate from the writer change

`scripts/migrate-college-pivot.mjs` — reads each of the 27 files, pivots, writes the envelope,
updates the manifest entry with `recordCount` = **player count** and `schemaVersion: 2`.

**Pure local transform. No network. No API key.** Idempotent: re-running on an already-pivoted file
is a no-op (detect the envelope and skip).

### 2.2 · `update-cfbd.mjs` emits the new shape for future ingests

The API still returns long-form rows, so the script pivots after fetching. Changes:

- pivot the fetched rows before writing;
- emit the §1.3 envelope;
- **pass `schemaVersion: 2`** to `updateManifestEntry` (§1.4.1);
- `recordCount` becomes the **player count**, not the row count;
- **move the `validateCfbdCategory(rows, …)` call to *after* the pivot.** §2.3 makes the validator
  reject arrays, and the call site currently passes the raw long-form fetch **before every dry-run
  branch** (`scripts/update-cfbd.mjs:50`). Leave it and `npm run smoke` — whose **second** command is
  `node bin/update.mjs cfbd --year 2023 --dry-run` — goes red, along with `smoke-test.yml`;
- **dedup on the pivoted form both sides, with a deterministic normaliser** (§1.4.2). Hashing
  `existing.players` against the newly-pivoted object is necessary but **not sufficient**:
  `stableHash`'s default normaliser is **identity** and `writeJsonStable` does not sort keys, so a
  pivoted object's hash is sensitive to both `playerId` insertion order and per-record statType key
  order — both inherited from CFBD's response row order. Two byte-identical datasets returned in a
  different order would hash differently and trigger a spurious rewrite, commit and CDN purge every
  year. **Pass `sortObjectKeys` (or an equivalent deep normaliser) to `cfbdHash`, and emit players in
  sorted `playerId` order from the pivot**, so the written bytes are deterministic too.

**Keep the pivot function in `lib/cfbd.mjs`, exported**, so the migration script and the writer share
one implementation. Two copies is how the migrated files and future ingests drift apart.

### 2.3 · `validateCfbdCategory` — rewritten, and made stronger

It currently validates a shape that is about to stop existing. Replace with:

- `players` is a non-empty object; `rowCount === Object.keys(players).length`;
- **a player-count floor — measured across all 27, not one file.** The real range is **467–4,251**,
  minimum at `college/passing/2020.json`. An earlier draft cited "1,021–4,087", which was the
  passing/2024 row alone, and proposed `>= 400` believing it had ~2.5× headroom; against 467 the
  margin is **1.17×**. And the categories are not comparable — passing runs 467–1,071 while receiving
  runs 1,919–4,251, **4–9× larger** — so one floor across three families is set by the smallest.

  **Use per-category floors** at roughly half the observed minimum: passing `>= 230`, rushing
  `>= 700`, receiving `>= 950`. That preserves the existing `distinctPlayers >= 200` intent (§1.5)
  for passing while giving the two large families a floor that would actually catch a truncated
  fetch, which a single 400 would not;
- **every record carries exactly the category's statType set** (§1.1), not a subset. This is the
  check that makes **CR-05's invariant mechanically enforceable for the first time** — today nothing
  verifies "the stored set is the set the app expects".
- every stat value is a **finite number** (the string→number change is real; assert it).

### 2.4 · Alternatives rejected

| option | rejected because |
|---|---|
| Re-run `update-cfbd.mjs --force` across 27 files | §1.2 — API key, 27 calls, and conflates shape with upstream revision |
| Migrate and change the writer in one commit | The migration is verifiable by round-trip; the writer is not. Separate commits keep the proof clean |
| Keep `recordCount` as the row count | It would no longer describe the file. Invariant 3 says the manifest is the index |
| Assert statTypes as a subset | §1.1 shows the data is dense; a subset check would pass on a file that silently lost a stat |
| Leave `validateCfbdCategory` accepting both shapes | Nothing writes long-form after this slice; a validator with a dead branch invites the wrong one being fixed later |

---

## 3. The edits

### 3.1 · `lib/cfbd.mjs`

Export `pivotCfbdRows(rows)` — long-form array → `{ [playerId]: { playerId, player, team, position,
conference, ...statTypes } }`, values `parseFloat`ed. **This is the app's `pivotStatRows` logic,
ported**; keep the field order and the `conference ?? null` behaviour identical so the served bytes
match what the app builds today.

### 3.2 · `scripts/migrate-college-pivot.mjs` (new)

Per §2.1. Loops `college/*/**.json`, skips already-pivoted files, writes the envelope, updates the
manifest. `--dry-run` reports per-file before/after counts and sizes without writing.

### 3.3 · `scripts/update-cfbd.mjs`

Per §2.2. Note its force gate uses `process.exit(1)` rather than a throw — **leave that as is**;
changing it is unrelated and would alter CLI behaviour.

### 3.4 · `lib/validate.mjs`

`validateCfbdCategory` per §2.3.

### 3.4a · `test/fixtures/hash-baseline.json` — it pins one of the 27 files

`cfbdHash`'s baseline entry is **`college/receiving/2023.json`**, which this slice rewrites. **`npm
test` goes red at §4 step 8** unless it is handled, and no earlier draft mentioned it.

There is no immutable college file left after this slice, so the S1 precedent applies exactly
(`test/stable-hash.test.mjs` — roster, games and oline were re-pointed and their tests renamed to say
they pin *current behaviour*, not a pre-refactor baseline):

**Re-capture the digest from the migrated file and rename the test.** `cfbdHash` is now a
change-detector for this family, not a pre-refactor proof — and say so in the test name, as the other
three do.

### 3.5 · `data-catalog.md` and `CLAUDE.md`

**`data-catalog.md`** — the college row: new shape, `schemaVersion: 2`, `rowCount`/`playerCount`
semantics, the statType sets, and **the Invariant-1 justification** (§8), including §1.1a's textual
lossiness.

**`CLAUDE.md`** — two Invariants go stale the moment this lands, and an earlier draft named neither:

- **Invariant 4** enumerates each family's `schemaVersion` by name. College leaving v1 makes it wrong.
- **Invariant 1**'s append-only exception clause is where F-24's precedent actually lives — §8 cites
  F-24, so this rewrite belongs in the same place, not only in a commit message.

### 3.6 · CR-05 — both repos, byte-identical, same change

The entry is stale in four ways, three of them found by the **app repo's own plan-reviewer** during
Phase A (which is the legitimate authority for app-side text — this session is not re-deriving it):

| field | correction |
|---|---|
| **App side** | `pivotStatRows` no longer called from `collegeMatch.js`; add **`normalizeCollegeStats`** in `src/api/cfbd.js` as the new boundary; add **`computeTeamTotals`** — a live consumer reading `YDS`/`TD` off pivoted records, which the entry currently denies exists by asserting `collegeMetrics.js` is *"now the only live consumer"*; add **`src/utils/exportData.js` `classifyKey`**, a producer writing to this entry's own served path |
| **Data side** | add `scripts/migrate-college-pivot.mjs`; note the served shape is now the pivoted envelope |
| **Invariant** | currently *"the confirmed `statType` set stored per category is exactly the set the app's pivot expects"* — **tautological after this slice**, since the stored set *is* the pivoted set. Restate as: the stored envelope is byte-compatible with `normalizeCollegeStats`, and the statType set per category is what `collegeMetrics.js` and `computeTeamTotals` read by name |
| **Triggers** | add `normalizeCollegeStats`, `computeTeamTotals`, `classifyKey` app-side; `migrate-college-pivot.mjs` data-side |

**Verify the mirrored regions diff to zero bytes** with the anchored `sed` form after both repos land.

---

## 4. Step order

0. **Confirm the running app is on `1a02614` or later** (§0) — `git pull` in the app repo and
   restart the dev server. There is nothing to deploy.
1. `pivotCfbdRows` in `lib/cfbd.mjs` (§3.1) + unit tests. No file written yet.
2. Write the migration script (§3.2). **Run it `--dry-run` across all 27.**
3. **Prove the transform preserves the values before writing anything.** For each of the 27: pivot in
   memory, reconstruct the long-form rows from the pivoted object, and assert the reconstruction
   equals the original file's rows as a **set** — **comparing `stat` numerically, via
   `parseFloat` on both sides.** §1.1's zero duplicates makes it reversible; §1.1a is why a raw
   string comparison fails on every row rather than none. **This is the migration's whole proof, and
   it proves value preservation, not byte preservation.**
4. Run the migration for real. 27 files rewritten, 27 manifest entries updated.
5. **Verify the output against Phase A's actual contract** (§1.3): every file must satisfy
   `isValidCFBDRows`' object branch — non-empty `players`, numeric `rowCount`. Assert it directly,
   in a script, against all 27.
6. Update `update-cfbd.mjs` (§3.3) and `validateCfbdCategory` (§3.4). Run
   `node bin/update.mjs cfbd --year 2023 --dry-run` and confirm it reports the pivoted plan and the
   dedup compares like with like.
7. Re-capture the `cfbdHash` baseline and rename its test (§3.4a). `data-catalog.md` and
   **`CLAUDE.md` Invariants 1 and 4** (§3.5).
8. **Data-side CR-05 edit + `npm test` + `npm run smoke`**, then commit and
   `git -c rebase.autoStash=true pull --rebase origin main`; push.
9. **Purge the CDN — `manifest.json` FIRST, then the 27 files.** That order is `CLAUDE.md` → Session
   git workflow; an earlier draft gave none.
10. **App repo: the CR-05 app-side edit** (§3.6), committed and pushed there.
11. **Only now, the zero-byte region diff** between the two repos' mirrored regions, anchored form.
    It cannot pass before step 10 — an earlier draft placed it at step 7, which would have stranded
    27 rewritten files uncommitted while waiting for a cross-repo edit this session cannot make from
    one side.
12. **Confirm in the app.** Load a college-backed view; the console should report `pivoted` as the
    source shape (Phase A's log). A returning user's cache may still serve long-form until it ages
    out — expected and handled.

**Steps 3 and 5 are the ones that cannot be skipped.** Step 3 proves the values survived; step 5
proves the app will accept what was written. **Step 11 cannot be attempted before step 10.**

---

## 5. Tests

- `pivotCfbdRows` — round-trip on a fixture, dense-record and missing-statType cases.
- `validateCfbdCategory` — accepts a good envelope; rejects a short one, a wrong statType set, a
  non-finite value, a `rowCount` mismatch.
- The 27-file round-trip (§4 step 3) is a **one-shot verification script**, not a committed test —
  its input disappears when the migration runs. **Commit its output** as the record.

---

## 6. Cross-repo impact

**CR-05 fires on both sides**, and unlike Phase A this slice **does** edit registry text (§3.6).

### CR-05 · CFBD college stats

> Adding or removing a `statType` must be coordinated — the pivot silently drops unknown types and yields empty columns for missing ones. Renaming one is worse than dropping it: `YDS`/`TD`/`ATT` are read by name in `src/utils/collegeMetrics.js:69-124`, so renaming those nulls the dominator rating and the QB college score, with no error and no test failure. (Note the name list in `collegeMetrics.js:57-59` is a *comment* recording the confirmed 2023 field names; it is documentation, not a read.)

**No `statType` is added, removed or renamed** — §1.1 confirms the sets are preserved exactly, and
§2.3's new set-equality assertion makes that mechanically checkable for the first time. What changes
is the container and the value type (string → number), which this Mirror does not cover and which
Phase A already absorbed.

### CR-18 · signal registry / data-catalog — **fires**

An earlier draft omitted it. §3.1 edits `lib/cfbd.mjs`, §3.3 edits `scripts/update-cfbd.mjs` and
§3.5 edits `data-catalog.md` — **three** of CR-18's data-side triggers. `Direction: data→app`, so
nothing fails in either repo when it drifts; the emitted `docs/signal-registry.md` row edit is the
whole deliverable:

> **college (`college/<category>/<year>.json`)** — *Source* unchanged (CFBD
> `/stats/player/season`). *Coverage* unchanged (2017–2025, three categories). **Shape changed**:
> long-form `{playerId, statType, stat}` rows → a pivoted envelope keyed by `playerId` with stat
> types as numeric fields; `schemaVersion` 1 → 2. *Reconstructable* — unchanged. *Current use*
> unchanged (`collegeMetrics.js` dominator rating and QB score, via `normalizeCollegeStats`). No
> stat key added, removed or renamed.

### CR-04 · manifest contract — **fires, and needs an entry edit**

An earlier draft dismissed it flatly; that was wrong on the facts. CR-04's **Data side** enumerates
manifest registrars **by name** — *"four non-`update-*` registrars: … `scripts/migrate-f24-prune.mjs`"*
— and `scripts/migrate-college-pivot.mjs` becomes a **fifth**. Its App side also covers *"every
validator gating on `schemaVersion`"*, and this moves college 1 → 2.

**No manifest field is renamed, removed or reshaped**, so the Mirror's breaking cases are not
triggered — but **the new registrar must be added to CR-04's data side**, in both repos, in this same
change.

> New families are additive and need no app change (the app already keys by path). Renaming or removing `recordCount` / `schemaVersion` / `lastModified` / `inProgress` is breaking and needs both repos. **Renaming the top-level `files` map, or the per-entry `lastModified`, breaks a second app-side reader that `getManifestEntry` does not shield** — `ktcHistory.js` enumerates `Object.keys(manifest.files)` to discover KTC snapshots and compares `lastModified` for cache invalidation (CR-17); it degrades to an empty history with no error. Note the `inProgress` convention split: nflverse families register `inProgress: false` even while the current season mutates; KTC's `inProgress: true` is a legacy current-value marker, not a pattern to propagate (CR-17). **A second `allowInProgress: true` opt-in exists since in-season-app-read.md — `loadCurrentSeasonTotals` (CR-02) — and it is NOT the same situation as KTC's.** KTC's `inProgress: true` is a mislabel: a KTC snapshot is a completed, immutable capture registered with a "current value" flag that is wrong about the file. An in-progress season-totals file genuinely *is* incomplete and genuinely *should* be read while incomplete — that is the entire point of reading it. The convention this Mirror warns against is using `inProgress` to mean "latest"; season-totals uses it to mean "not finished," which is its actual, documented meaning. Do not read this Mirror's "not a pattern to propagate" line as blocking a genuinely-incomplete family from opting in the same way — read it as blocking a *mislabeled* one.

And CR-18's:

> This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

---

## 7. Done-definition

**Gate**
- [ ] App repo pulled to `1a02614`+ and the dev server restarted before any file is written (§0) —
      **not** "deployed"; there is no deployment

**Migration**
- [ ] `pivotCfbdRows` exported from `lib/cfbd.mjs`, shared by the migration script and the writer —
      **one implementation, not two**
- [ ] **Round-trip proof run and its output committed** (§4 step 3): all 27 files reconstruct to the
      original row set, **compared numerically** — a raw string comparison fails on every row (§1.1a)
- [ ] The proof is described as **value**-preserving, not byte-preserving; §1.1a's 24,065 reformatted
      values (7.6%) are stated in the commit message and `data-catalog.md`
- [ ] 27 files rewritten to the §1.3 envelope; migration is idempotent on re-run
- [ ] **All 27 verified against `isValidCFBDRows`' object branch** (§4 step 5)
- [ ] Envelope carries **`rowCount` = source rows AND `playerCount` = map size** (§1.3) — the repo's
      convention, and it preserves the original row count as provenance
- [ ] Players emitted in **sorted `playerId` order** so the written bytes are deterministic
- [ ] 27 manifest entries: `recordCount` = player count, **`schemaVersion: 2` passed explicitly**

**Writer & validator**
- [ ] `update-cfbd.mjs` pivots before writing, emits the envelope, passes `schemaVersion: 2`
- [ ] **`validateCfbdCategory` is called AFTER the pivot** — before the dry-run branches; otherwise
      `npm run smoke`'s second command and `smoke-test.yml` both go red
- [ ] **Dedup compares pivoted to pivoted with a deterministic normaliser** (§1.4.2) — `cfbdHash`
      with `sortObjectKeys`, not `stableHash`'s identity default
- [ ] `process.exit(1)` force gate left alone
- [ ] `validateCfbdCategory` asserts non-empty `players`, `playerCount` match, **per-category floors**
      (passing ≥230, rushing ≥700, receiving ≥950 — §2.3, not one 400 across all three), **exact
      statType set equality**, and finite numeric values
- [ ] `cfbdHash`'s baseline re-captured and its test **renamed to say it pins current behaviour**
      (§3.4a) — otherwise `npm test` reds on a file this slice rewrites

**Docs & cross-repo**
- [ ] `data-catalog.md` college row updated, including the **Invariant-1 justification**
- [ ] `CLAUDE.md` **Invariants 1 and 4** updated (§3.5) — 4 names each family's schemaVersion; 1 is
      where F-24's exception clause lives
- [ ] CR-05 corrected **and CR-04 gains the new registrar**, both repos
- [ ] CR-05, CR-04 and **CR-18** Mirrors emitted (§6); CR-18's `docs/signal-registry.md` row edit
      written out for the app repo
- [ ] Anchored mirrored-region diff = **zero bytes**, run **after** the app-side commit (§4 step 11)

**Landing**
- [ ] `npm test` green; `npm run smoke` green
- [ ] **CDN purged: `manifest.json` FIRST, then the 27 files** (§4 step 9)
- [ ] App console reports `pivoted` as the source shape on a fresh load (§4 step 11)
- [ ] `store-audit-2026-08-25.md` still modified-and-uncommitted, untouched

---

## 8. Invariant check

- **Invariant 1 (append-only, "except to correct an error")** — this rewrites 27 **completed-season**
  files, and it is **not** a correction; it is a shape migration. That needs the same explicit
  justification F-24 used — **and the honest version of it**: the *values* are provably preserved
  (§4 step 3), but **the textual form of 24,065 values is not** (§1.1a). The audit trail is git
  history plus the retained `rowCount` (§1.3). **State all of that in the commit message, in
  `data-catalog.md`, and in `CLAUDE.md` Invariant 1 where F-24's clause already lives** — not only
  in a commit message.
- **Invariant 3 (manifest is the index)** — `recordCount` changes meaning (rows → players) for 27
  entries. That is the point: it must describe the file.
- **Invariant 4 (schemaVersion discipline)** — *"bump only on an incompatible layout change."* This
  is one, unambiguously — unlike the advstats slice, where the layout was byte-identical and the bump
  was correctly rejected. Under the app's `MAX_SUPPORTED_SCHEMA = 4`.
- **CDN purge rule** — 27 overwrites need file **and** manifest purges (§4 step 10).

---

## 9. Out-of-scope observations (not edits)

1. **Phase C** — deleting `pivotStatRows` and the long-form branch app-side — becomes possible once
   every cache entry written before Phase A has aged out (TTL ~694 days) **or** the loader stops
   accepting arrays. In practice it is gated on the live-API fallback, which still returns long-form
   and always will. **Phase C may never be fully reachable**; that is worth deciding deliberately
   rather than leaving as an open item.
2. **The live CFBD API fallback keeps the long-form path alive permanently** (§9.1). If that fallback
   were removed — the store is complete 2017–2025 — Phase C would become a clean deletion.
3. **`recordCount` changing meaning across a schemaVersion boundary** is worth a convention. Nothing
   in the manifest says which version's semantics an entry uses; the `schemaVersion` field is the
   only signal, and only for families that bump it.
