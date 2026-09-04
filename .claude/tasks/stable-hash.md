# One hashing helper, twelve preserved normalisations

**Type:** shared-helper extraction across twelve ingest scripts.
**No served shape, no data, no manifest, no schemaVersion, no CDN purge, no behaviour change.**
**Session model:** plan (opus, this file). Implementation is a separate sonnet session — do not edit
source here.
**Source:** `store-audit-2026-08-25.md` **S1**, held back from `ci-consolidation.md` §1.5. Census
re-derived from live source 2026-08-31 at HEAD `221ba87`.

> **Say the value plainly: this is a small win.** It removes twelve copies of one expression and
> centralises the digest algorithm. It does **not** remove the twelve normalisations, because §1.1
> shows they are five genuinely different shapes rather than the audit's "ten identical plus two."
> **S2 is where the real duplication is** (~800 lines → ~250). If you want the larger win first,
> skip this and take S2 — nothing here blocks it.

**Working-tree note.** `store-audit-2026-08-25.md` is modified and uncommitted. **Do not stage,
commit, revert or edit it.** Nothing here touches it.

---

## 1. Verified facts

### 1.1 · Five shapes, not two — the audit is wrong about the population

The audit says *"all `sha256(JSON.stringify(key-sorted))`"* with *"the two that genuinely differ"*.
Read live, all twelve:

| shape | functions | normalisation |
|---|---|---|
| **A — object key sort** | `nflHash`, `idsHash`, `playersHash` (advstats, gamelogs, roster), `teamsHash` (teamcontext, oline) — **7** | `Object.keys().sort()` → rebuilt object |
| **B — none at all** | **`cfbdHash`** | **raw `JSON.stringify(rows)` on an array. No sorting.** |
| **C — array sort by comparator** | `gamesHash` (by `gameId`), `snapshotHash` (by `name.localeCompare`) — **2** | `[...arr].sort(cmp)` |
| **D — nested sort** | `picksByYearHash` | years sorted **and** picks within each year sorted by `round \|\| pick` |
| **E — field strip, no sort** | `playersHash` (playerstate) | `stripHashFields` drops `newsUpdated`/`searchRank`; **no key sort** |

7 + 1 + 2 + 1 + 1 = **12**. Only shape A is genuinely duplicated.

**`cfbdHash` is the one the audit's framing would have broken.** It is order-*sensitive* today. A
refactor that gave every family "key sorting for free" would make two different row orders hash
equal — turning a genuine upstream reordering into a silent no-change.

**Shape E does not key-sort either**, so it is order-sensitive on the object too.

### 1.2 · Every dedup is fresh-vs-fresh, and no hash is persisted anywhere

Verified at all twelve call sites. The pattern is always:

```js
const newHash  = someHash(fresh);
const lastHash = existing ? someHash(existing) : null;
if (newHash === lastHash) { /* skip */ }
```

`nfl` (`nflHash(totals) === nflHash(existing)`) and `cfbd`
(`cfbdHash(existing) === cfbdHash(rows)`) inline it but do the same thing.

**No hash is stored** — not in `manifest.json`, not in any served file (checked: advstats carries
`schemaVersion, season, generatedAt, rowCount, unmapped, players`; season-totals is a bare player
map with no envelope, so `nflHash(totals) === nflHash(existing)` compares like with like — not the
latent bug it first looks like).

**This is the safety property that makes the slice tractable, and it corrects `ci-consolidation.md`
§1.5.** That section warned a wrong `stableHash` could "skip a real change silently" as if a stored
digest could go stale. It cannot: both sides are recomputed with the same function on every run, so
changing the function changes both sides identically. The residual risk is narrower and real:

- a normaliser that makes **genuinely different** inputs compare equal → a real change is skipped
- a normaliser that makes **genuinely equal** inputs compare different → churn, and a `lastModified`
  bump the app reads as new data

Both come from changing *normalisation*, never from changing *hashing*. §2 keeps normalisation fixed.

### 1.3 · Four are exported and directly under test

| function | imported by |
|---|---|
| `cfbdHash` | `test/update-cfbd.test.mjs` |
| `nflHash` | `test/update-nfl.test.mjs` |
| `picksByYearHash` | `test/update-draft.test.mjs` |
| `gamesHash` | `test/update-schedule.test.mjs` |

`playersHash`, `idsHash`, `teamsHash`, `snapshotHash` have no importers. Five test files reference
hashing (the four above plus `test/playerstate.test.mjs`).

**Export status — five of twelve are exported, seven are not:**

| exported | not exported |
|---|---|
| `cfbdHash`, `picksByYearHash`, `nflHash`, `gamesHash`, `playersHash` (playerstate) | `idsHash`, `playersHash` (advstats, gamelogs, roster), `teamsHash` (teamcontext, oline), `snapshotHash` |

**This is a hard constraint on §4's baseline**, not a detail: a fixture-generation script cannot
import seven of the twelve, and ESM offers no way to reach a module-private binding from outside.
§4 step 1 handles it.

**Deleting the four exported names would force four test rewrites** for no gain — §2.2.

---

## 2. The decisions

### 2.1 · Unify the hashing. Do not unify the normalisation.

```js
// lib/io.mjs
/**
 * sha256 of a JSON-serialised value, after an optional normaliser.
 *
 * The default normaliser is IDENTITY — stableHash does NOT canonicalise key or element
 * order on its own. Every family that needs canonical order passes its own normaliser,
 * because the families genuinely differ (stable-hash.md §1.1): cfbd is deliberately
 * order-sensitive, playerstate strips two churning fields without sorting, KTC sorts by
 * name, schedule by gameId, draft sorts nested. Adding a sort here would silently change
 * what "unchanged" means for at least two families.
 */
export function stableHash(value, normalize = v => v) {
  return crypto.createHash('sha256').update(JSON.stringify(normalize(value))).digest('hex');
}

/** Shape A's normaliser (stable-hash.md §1.1) — rebuild an object in sorted key order. */
export function sortObjectKeys(obj) {
  return Object.fromEntries(Object.keys(obj).sort().map(k => [k, obj[k]]));
}
```

**Identity default, deliberately.** A key-sorting default would require `cfbdHash` to opt *out*, and
an opt-out that someone forgets is a silent behaviour change in the one family that is
order-sensitive on purpose. The doc comment says so at the definition, where it will be read.

### 2.2 · Keep every named function as a one-line wrapper

```js
export const cfbdHash        = rows        => stableHash(rows);
export const nflHash         = players     => stableHash(players, sortObjectKeys);
export const gamesHash       = games       => stableHash(games, g => [...g].sort(byGameId));
export const picksByYearHash = picksByYear => stableHash(picksByYear, normalizePicksByYear);
```

…and the same for the eight unexported ones.

**Why keep the names:** the four exported ones are imported by name in four tests (§1.3), so deleting
them is four test rewrites for nothing. And the name is where the *intent* lives —
`snapshotHash` says more at its call site than `stableHash(players, p => …)` inlined. The
duplication being removed is the `createHash(…).update(JSON.stringify(…)).digest('hex')` expression
and twelve `import crypto` lines, not the names.

### 2.3 · Alternatives rejected

| option | rejected because |
|---|---|
| One `stableHash` with a key-sorting default | §2.1 — `cfbdHash` and playerstate's `playersHash` are order-sensitive by design; an opt-out someone forgets is a silent dedup change |
| Delete the twelve names, inline `stableHash` at call sites | §2.2 — four test rewrites, and the intent-carrying names are lost |
| Also unify the normalisers into one canonical form | §1.1 — they are five different shapes for five different reasons; unifying them is a behaviour change wearing a refactor's clothes |
| Skip S1, go straight to S2 | Legitimate, and stated in the header. Taken only if the human prefers the larger win first |

---

## 3. The edits

### 3.1 · `lib/io.mjs`

Add `stableHash` and `sortObjectKeys` per §2.1, with the doc comment **verbatim** — it is the only
place the identity-default decision is recorded.

### 3.2 · The twelve call sites

Each script: drop `import crypto`, import `stableHash` (and `sortObjectKeys` where shape A), and
replace the function body with a one-line wrapper (§2.2). **No call site's arguments change**, and
no `newHash`/`lastHash` line moves.

Shape-specific normalisers stay local to their script:
`byGameId` in `update-schedule.mjs`, `byName` in `update-ktc.mjs`, `normalizePicksByYear` in
`update-draft.mjs`, `stripHashFields` in `update-playerstate.mjs` — **unchanged**.

### 3.3 · Do not touch `writeJsonStable`

`writeJsonStable` is a data-side trigger of CR-11, CR-12, CR-13, CR-19 and CR-20. It lives in the
same file and is **not** part of this slice. Leaving it alone is what keeps those five entries from
firing (§6).

---

## 4. Step order

1. **Add `export` to the seven unexported hash functions — and change nothing else.** A separate,
   behaviour-neutral commit: seven one-word edits, no body touched, no call site touched. **Without
   this step 2 is impossible** — a fixture script cannot import a module-private binding (§1.3).
   Run `npm test` to confirm the export-only change is inert.

   *Do not skip this by transcribing the seven normalisers into the fixture script.* A baseline
   copied from a reading of the code proves the copy matches the refactor, not that the refactor
   matches the code — which is the entire point of the fixture.

2. **Capture the baseline digests, with the old bodies still in place.** For each of the twelve
   families, compute the current function's digest over the **current served file's** real input and
   write them to a committed fixture, e.g. `test/fixtures/hash-baseline.json`.
   **This is the whole verification and it must exist before any function body is edited** — after
   the refactor the old implementations are gone and there is nothing left to compare against.

   Every hashed input is reachable from a served file: whole-file for `cfbd` and `nfl` (a bare
   player map), and the named sub-object otherwise — `.players`, `.teams`, `.games`, `.ids`,
   `.picksByYear`. For the two `listDir`-driven families use the most recent snapshot on disk —
   `ktc/<latest>.json` (a bare array) and `nfl/players-state/<latest>.json` (`.players`).
3. Add `stableHash` + `sortObjectKeys` to `lib/io.mjs` (§3.1). Nothing calls them yet.
4. Convert **one** script — `update-cfbd.mjs`, the shape-B outlier and the one most likely to expose
   a wrong default. Run its existing test.
5. Convert the remaining eleven, shape by shape: the seven of shape A together, then C, D, E.
6. **Assert every digest matches the step-2 fixture.** Twelve equalities, each proving the new path
   is bit-identical to the old on real data.
7. `npm test` (baseline **598**), `npm run smoke`.
8. Commit; `git -c rebase.autoStash=true pull --rebase origin main`; push. **No CDN purge.**

**Steps 1 and 2 must both precede step 3.** The baseline is only meaningful while the old
implementations exist, and it cannot be taken at all until the seven are reachable.

**Note on smoke:** `npm run smoke` currently fails on CFBD with a live-API 429, unrelated to any of
this (`ci-consolidation` verified `scripts/update-cfbd.mjs` was untouched there). If it fails the
same way here, run the other smoke commands individually and say so — **do not treat a CFBD 429 as
this slice's failure, and do not "fix" it by changing `cfbdHash`.**

---

## 5. Tests

1. **Twelve digest-equality assertions** against the step-2 fixture (§4 step 6). This is the slice's
   reason to exist as a reviewable change rather than a blind edit.
2. **`stableHash` does not canonicalise by default** — `stableHash({b:1,a:2}) !== stableHash({a:2,b:1})`.
   Pins §2.1's identity default against a future "helpful" sort.
3. **`sortObjectKeys` does** — the same two objects hash equal through it.
4. **`cfbdHash` stays order-sensitive** — two arrays with the same rows in different orders hash
   **differently**. This is the regression guard for the one family the audit's framing would have
   broken.
5. The four existing imported-by-name tests (§1.3) must pass **unedited**. If any needs a change,
   §2.2's wrapper form was done wrong.

---

## 6. Cross-repo impact

**One entry fires: CR-17.** Its data-side `Triggers` names `scripts/update-ktc.mjs` *"(incl.
`ktcOrderingGuard`, `snapshotHash` and the `updateManifestEntry({ inProgress: true })` call)"* —
`snapshotHash` by name, and this slice rewrites its body.

**No other entry fires.** CR-11, CR-12, CR-13, CR-19 and CR-20 name `writeJsonStable`, which shares
`lib/io.mjs` with the new helper but is **not edited** (§3.3). Adding an export to a file is not
touching a different symbol in it.

### CR-17 · KTC snapshots

> Keep the snapshot a **bare array** — wrapping it in the `{ schemaVersion, generatedAt, … }` envelope every other family uses fails `isValidKtcSnapshot`, and the whole `ktcHist*` capture family degrades to empty with **no error and no test failure**. **Updated, dp-v2 Slice 5a:** the earlier note here said the Explorer's ~30-day KTC Δ cell was the only other thing that degraded and that it was gone, making `ktcHist*` "the only thing that degrades" — that is now stale twice over. First, `ktcHist*` was never only a diagnostic: `market/Market.jsx`'s TREND gutter is a second, real rendering consumer of both `computeKtcSignals`'s output and the raw `series`. Second, and more than bookkeeping, **the failure mode itself changed**: before this slice a bad/empty snapshot produced a silent gap in `factors` with no visible symptom anywhere; now it also produces a **visibly blank TREND column on Market, the app's primary surface** (every row's gutter renders `—`, the `band: 'none'` state) — something a user watching the app would actually notice, not just something a diagnostic dump would show. Keep the `ktc/snapshot-YYYY-MM-DD.json` path exactly: the app enumerates candidates by regex over manifest keys, so a path change makes every snapshot invisible rather than broken. Renaming `name`/`team`/`value`/`position` breaks `matchKTCToSleeper` the same silent way — and note the record shape is constrained **twice** on the app side, since `src/api/ktc.js` scrapes the same KTC DOM into the same four fields for the live path; the two scrapers are independent implementations of one shape, so a KTC markup change can break them separately. Flipping the manifest entry to `inProgress: false` is breaking in the unusual direction — the app deliberately opts this path in, so the change must be paired with revisiting `allowInProgress: true` app-side. Quarantined scrapes must stay in `ktc/quarantine/` and **must never be manifest-registered**: a registered quarantine file enters the app's 8-snapshot window as if it were good data.

**No change owed.** The snapshot stays a bare array; path, record shape, `inProgress` marking and the
quarantine rule are untouched. `snapshotHash`'s **normalisation is preserved exactly** (sort by
`name.localeCompare`, §2.2), so what counts as an unchanged snapshot — and therefore when a new
snapshot is written into the app's 8-snapshot window — does not move.

---

## 7. Done-definition

- [ ] The seven unexported hash functions given `export` in a **separate, body-unchanged commit**
      first; `npm test` green after it
- [ ] `test/fixtures/hash-baseline.json` committed **before** any function body is edited, with a
      digest per family computed by calling the **real current function** on a real served file —
      not by a transcription of its normaliser
- [ ] All twelve exported after the refactor (the four already-imported names plus the eight others)
- [ ] `stableHash` + `sortObjectKeys` in `lib/io.mjs`, with §2.1's doc comment verbatim
- [ ] **Identity default** — `stableHash` does not sort unless given a normaliser
- [ ] All twelve converted to one-line wrappers; **no call site's arguments changed**; no
      `newHash`/`lastHash` line moved
- [ ] Shape-specific normalisers (`byGameId`, `byName`, `normalizePicksByYear`, `stripHashFields`)
      **unchanged and still local to their scripts**
- [ ] **Twelve digest equalities pass** against the fixture
- [ ] `cfbdHash` still **order-sensitive**; playerstate's `playersHash` still **does not key-sort**
- [ ] The four existing name-importing tests pass **unedited**
- [ ] `import crypto` removed from all twelve scripts
- [ ] **`writeJsonStable` untouched** — verified by `git diff` on `lib/io.mjs`
- [ ] CR-17 `Mirror` emitted (§6); no registry text edited
- [ ] `npm test` green (baseline **598** + new); `npm run smoke` green **or** failing only on the
      pre-existing CFBD 429, stated explicitly
- [ ] No served file, manifest, `schemaVersion`, or CDN purge
- [ ] `store-audit-2026-08-25.md` still modified-and-uncommitted, untouched

---

## 8. Settled decisions

- **Unify hashing, preserve normalisation** (§2.1) — the five shapes exist for five reasons.
- **Identity default** (§2.1) — a sorting default makes `cfbdHash` opt out, and a forgotten opt-out
  is a silent dedup change.
- **Keep all twelve names as wrappers** (§2.2) — four are imported by name in tests; the names carry
  intent.
- **Export the seven, then baseline, then refactor** (§4 steps 1–2) — seven of twelve are
  module-private, so the fixture is impossible until they are reachable; and a transcribed baseline
  would verify the transcription, not the refactor.
- **`writeJsonStable` is out of scope** (§3.3) — it is a trigger of five registry entries.
- **A CFBD 429 in smoke is not this slice's failure** (§4).

---

## 9. Invariant check

- **Invariant 1 (append-only)** — no data file is read for content or written.
- **Invariant 3 (manifest is the index)** — untouched; no manifest field changes, and no hash was
  ever stored there (§1.2).
- **Invariant 4 (schemaVersion)** — nothing served changes.
- **Idempotency / content-hash dedup** — this is the one invariant the slice operates *on*, and §4
  step 6's twelve equalities are the proof it is preserved rather than assumed.

---

## 10. Where the audit was wrong

| audit claim | verified |
|---|---|
| "Thirteen near-identical content-hash functions" | **Twelve** functions (plus one normaliser, `stripHashFields`); the audit's own list sums to eleven |
| "all `sha256(JSON.stringify(key-sorted))`" | **Five shapes** (§1.1). `cfbdHash` sorts nothing; playerstate's `playersHash` sorts nothing |
| "the two that genuinely differ … pass a normaliser" | **Five** differ. The audit names KTC and playerstate but misses `cfbdHash` (no sort), `gamesHash` (array-by-`gameId`) and `picksByYearHash` (nested) |
| "One `stableHash(value, normalize?)` covers every one" | True, **but only with an identity default**. The audit's framing implies a canonicalising default, which would silently change dedup for cfbd and playerstate |

The audit's *direction* is right and the helper is worth extracting. Its census is not, and the one
detail it got wrong — that key-sorting is universal — is precisely the detail a mechanical refactor
would have propagated.

---

## 11. Out-of-scope observations (not edits)

1. **S2 is the real duplication** — six season-keyed updaters, ~800 lines of identical nine-step
   spine, which the audit rates a *real* risk against S1's *low* one. This slice leaves it untouched
   and slightly easier: after it, the hash step of that spine is one line everywhere.
2. **`cfbdHash`'s order-sensitivity looks unintentional but is not this slice's call.** Every other
   family canonicalises; cfbd does not, so a pure upstream row reorder rewrites the file and bumps
   `lastModified`. Whether that is a bug or a deliberate conservatism is a data question, not a
   refactor question — deciding it here would hide a behaviour change inside a helper extraction.
3. **`npm run smoke`'s CFBD 429 has now been observed across two slices.** It is a live third-party
   rate limit, not a regression, but it means smoke is not currently a clean gate and the next person
   to see it red will spend time on it. Worth a retry/backoff or a documented note.
