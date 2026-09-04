# CR-04: name `runSeasonKeyedIngest` as the registrar S2 made it

**Type:** one registry field corrected, both repos. **No code, no data, no manifest, no CDN purge.**
**Session model:** plan (opus, this file). Implementation is a separate sonnet session — do not edit
source here.
**Source:** a `[registry-stale]` flag raised during the E7 review, on a plan unrelated to it.
Verified 2026-09-03 at HEAD `81ea244`.

> **This is a defect the S2 program created and never recorded.** Extracting
> `runSeasonKeyedIngest` moved the manifest write for five families out of their own scripts and
> into `lib/seasonIngest.mjs` — and the registry's near side, which the convention says this repo
> maintains, was never updated. It surfaced on a review of E7, which touches none of it.

**Working-tree note.** `store-audit-2026-08-25.md` is modified and uncommitted. **Do not stage,
commit, revert or edit it.** Nothing here touches it.

---

## 1. Verified facts

**`lib/seasonIngest.mjs` appears zero times in the mirrored region** — checked with the anchored
`sed` extract over `README.md`.

**But it is the registrar for five families.** `lib/seasonIngest.mjs:163` calls
`deps.writeJsonStable(path, envelope(season, derived))`, and `:171-175` calls
`deps.updateManifestEntry` with `recordCount`, `inProgress: false`, `schemaVersion: 1` — the last two
**hard-coded in the helper**, not passed by callers.

| family | routes through the helper |
|---|---|
| `schedule`, `teamcontext`, `oline`, `gamelogs`, `advstats` | **yes — five** |
| `roster` | **no** — its only mention is the slice-7 header comment explaining why it is the exception |

**What CR-04's `Data side` currently claims:**

> …12 of the 13 `scripts/update-*.mjs` writers register through `updateManifestEntry`
> (`update-enrichment.mjs` does **not**), plus **five** non-`update-*` registrars: …

That is now **indirectly true at best**. Five of those thirteen no longer call `updateManifestEntry`
themselves; they delegate, and the call site — along with the `inProgress: false` /
`schemaVersion: 1` defaults — lives in a file the entry does not name.

**Scope is CR-04 alone.** Of the family entries, only **CR-02** makes a writer/manifest claim, and
CR-02 is about `scripts/update-nfl.mjs`, which has its own `DEFAULT_DEPS` and **never delegated**.
CR-07/08/09/10 name their `update-*.mjs` entry points, which still exist and are still correct.

---

## 2. The decision

**Correct CR-04's `Data side` to name the helper, and fix the "12 of the 13" phrasing so it says how
those five register.** Nothing else changes — not the `Invariant`, not the `Mirror`, not `Triggers`,
not any app-side text.

**Why `Triggers` does not change:** CR-04's data-side triggers are
`updateManifestEntry` / `readManifest` / `setManifestInProgress` in `lib/manifest.mjs`, and
`manifest.json`. A change to `runSeasonKeyedIngest`'s manifest call would alter *how* five families
register but not the manifest contract itself, which is what CR-04 guards. **Adding it to `Triggers`
would fire the entry on every S2-style refactor** — noise, not signal. `Data side` is the right
field: it is the descriptive inventory, and it is what a reviewer reads to know where to look.

### 2.1 · Alternatives rejected

| option | rejected because |
|---|---|
| Add `runSeasonKeyedIngest` to `Triggers` too | §2 — it would fire CR-04 on refactors that do not touch the manifest contract |
| Also touch CR-07/08/09/10 | §1 — their `update-*.mjs` entry points are still accurate |
| Leave it; the helper is an implementation detail | It hard-codes `inProgress: false` and `schemaVersion: 1` for five families. That is the manifest contract, in one place, unnamed |
| Fold into the next E7 slice | E7 is routed and blocked; this is live and unrelated |

---

## 3. The edit

`CR-04` → **`Data side`**, both repos, byte-identical.

Reword the writer clause to say that **five of the thirteen `scripts/update-*.mjs` writers now
register indirectly**, through `runSeasonKeyedIngest` in `lib/seasonIngest.mjs`, which owns the
`updateManifestEntry` call and hard-codes `inProgress: false` and `schemaVersion: 1` for
`schedule`, `teamcontext`, `oline`, `gamelogs` and `advstats` — and note `roster` is the one
season-keyed family that still registers directly.

Keep every other clause intact: the `update-enrichment.mjs` exception, the five non-`update-*`
registrars, the two direct-writing migrations, and `bin/import-snapshot.mjs`'s direct read.

---

## 4. Step order

1. Edit CR-04's `Data side` in `README.md`.
2. Apply the identical edit to the app's `docs/cross-repo-registry.md`.
3. **Anchored region diff = zero bytes**, `sed` form.
4. `npm test` — **`test/registry.test.mjs` now resolves a new claim**, `runSeasonKeyedIngest` in
   `lib/seasonIngest.mjs`. It must pass; if it does not, the symbol or path in the new text is wrong.
5. Commit in both repos; `git -c rebase.autoStash=true pull --rebase origin main`; push.

**No CDN purge** — no served file changes.

---

## 5. Cross-repo impact

**CR-04 fires** — this slice edits it.

> New families are additive and need no app change (the app already keys by path). Renaming or removing `recordCount` / `schemaVersion` / `lastModified` / `inProgress` is breaking and needs both repos. **Renaming the top-level `files` map, or the per-entry `lastModified`, breaks a second app-side reader that `getManifestEntry` does not shield** — `ktcHistory.js` enumerates `Object.keys(manifest.files)` to discover KTC snapshots and compares `lastModified` for cache invalidation (CR-17); it degrades to an empty history with no error. Note the `inProgress` convention split: nflverse families register `inProgress: false` even while the current season mutates; KTC's `inProgress: true` is a legacy current-value marker, not a pattern to propagate (CR-17). **A second `allowInProgress: true` opt-in exists since in-season-app-read.md — `loadCurrentSeasonTotals` (CR-02) — and it is NOT the same situation as KTC's.** KTC's `inProgress: true` is a mislabel: a KTC snapshot is a completed, immutable capture registered with a "current value" flag that is wrong about the file. An in-progress season-totals file genuinely *is* incomplete and genuinely *should* be read while incomplete — that is the entire point of reading it. The convention this Mirror warns against is using `inProgress` to mean "latest"; season-totals uses it to mean "not finished," which is its actual, documented meaning. Do not read this Mirror's "not a pattern to propagate" line as blocking a genuinely-incomplete family from opting in the same way — read it as blocking a *mislabeled* one.

**No change owed app-side.** No manifest field is renamed, removed or reshaped; no value changes.
This corrects a **descriptive inventory**, and the Mirror's breaking cases are untouched.

**Note the Mirror's `inProgress` discussion is now partly enforced by the helper** — it hard-codes
`inProgress: false` for five families, which is the convention that Mirror describes. Naming the
helper is what makes that visible.

---

## 6. Done-definition

- [ ] CR-04's `Data side` names `runSeasonKeyedIngest` in `lib/seasonIngest.mjs` as the registrar for
      the five converted families, and says the `inProgress: false` / `schemaVersion: 1` defaults live
      there
- [ ] The "12 of the 13" clause corrected to distinguish direct from delegated registration
- [ ] `roster` noted as the one season-keyed family still registering directly
- [ ] **No other CR-04 field changed** — `Invariant`, `Direction`, `Triggers`, `Mirror`, `App side`
      all byte-identical
- [ ] **No other entry changed** — CR-02/07/08/09/10 untouched (§1)
- [ ] Both repos edited; **anchored region diff = zero bytes**
- [ ] `npm test` green (**669**), `test/registry.test.mjs` resolving the new symbol claim
- [ ] No served file, manifest, `schemaVersion` or CDN purge
- [ ] `store-audit-2026-08-25.md` still modified-and-uncommitted, untouched

---

## 7. Settled decisions

- **`Data side`, not `Triggers`** (§2) — adding it to triggers would fire CR-04 on refactors that
  never touch the manifest contract.
- **CR-04 only** (§1) — every other entry's writer claim is still accurate.
- **Descriptive correction, no behaviour change** (§5) — no Mirror obligation beyond emitting it.

---

## 8. Out-of-scope observations (not edits)

1. **This was found by a reviewer on an unrelated plan**, doing the standing near-side
   re-verification duty. That duty is the only thing that catches this class of drift — no test does,
   because `test/registry.test.mjs` verifies that *listed* symbols resolve, never that live producers
   are listed. The two halves are complementary and only one is automated.
2. **The S2 program should have carried this.** Five slices moved the manifest write and none updated
   the registry; the near-side duty caught it four slices later. Worth remembering that a refactor
   which relocates a *contract-bearing call* is a registry event even when no contract changes.
