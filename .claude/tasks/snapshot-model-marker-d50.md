# D-50 — Record a model marker in snapshots (parent-folder plan, app capture first)

**Session 1, 2026-10-10 (opus), parent-folder read of both repos.** Close-out programme W2
(`../future_plans/in-season-notes-plan.md`), split out of `provenance-records-w2.md` because the app's capture
changes first.

**Baselines:** app HEAD after W2 Stage B (`c318487` + B1–B5), and data HEAD after W2 Stage A (`b4472ad` + A1–A4).
W2 touches none of D-50's source files; only the backlog file is shared, at different entries.

**Route** (memory: the two-session registry route, CR-24). This is planned from the parent folder. The parent
folder still has no CLAUDE.md and no review gate, so the registry edit goes app first, then a data byte copy.
- **Stage A** is an app-repo session (sonnet), one commit: capture, gate, tests, docs, registry (7 lines), backlog.
- **Stage B** is a data-repo session (sonnet), one commit: README, catalog, one stale comment anchor, and the
  registry byte copy.
- Push app, then data, **on the same day**. Between the two pushes the daily `registry-mirror.yml` run is red, and
  that red is the sync still owed.

**No score change.** The only frozen-prior candidate for 2026 is the last pre-kickoff capture (2026-09-0x). It
predates both `PRIOR_MODEL_FROM` ('2026-10-11') and the new `MODEL_MARKER_FROM`, so it is still refused before any
fetch, exactly as today. Nothing moves until a marked capture becomes a candidate, which happens at the 2027
kickoff at the earliest.

---

## 1. What D-50 buys

Today `PRIOR_MODEL_FROM` is a **date**, because snapshots carry no model identity (`src/utils/inSeasonConstants.js:29-36`).
`selectFrozenPriorCandidate` (`src/utils/inSeasonScoring.js:84-96`) refuses any capture dated before it, before
fetching. The date is set to "the day after the app push", because a capture made on the push day might have run
on either model. With a marker the gate is exact:
1. A capture taken by the new code on the push day counts.
2. A capture dated after the epoch but taken by stale **post-D-50** code (a lagging deploy) is refused. Today it
   would be accepted. Stale pre-D-50 code writes no marker, so the date rule still applies to it.
3. Every capture names its model, so graders can later segment captures by model instead of by
   `grading/anchor-policy.md` dates. That is not in this slice; it is stated in CR-01 as an affordance.

**The marker is `PRIOR_MODEL_FROM`'s own value.** It is already "the identity of the current projection model",
bumped in the same commit as any change that moves `projectedPPG`/`projectedGames`, and
`src/__tests__/priorModelFrom.test.js` reds until it is bumped. A second version string would need a second bump
discipline, so D-50 does not add one.

---

## 2. Design (Stage A, app)

### 2.1 Capture: `src/utils/projectionSnapshot.js`

- Import `PRIOR_MODEL_FROM` from `./inSeasonConstants`. That module is a constants leaf with no imports, so there
  is no cycle.
- `buildProjectionSnapshot`'s return object (`:368`): after `projectionBasis: deriveProjectionBasis(careerStats),`,
  add `projectionModelFrom: PRIOR_MODEL_FROM,`.
- JSDoc `@returns` (`:304-316`): add `projectionModelFrom: string,` after `projectionBasis`.
- `schemaVersion` stays **3**. The key is additive. The data commit gate (`lib/snapshot-capture.mjs`
  `evaluateSnapshotRecord`) reads no envelope key list, and no data reader whitelists keys (verified: grep of
  `scripts/`, `lib/`, `bin/` and the daily workflow).

### 2.2 Constants: `src/utils/inSeasonConstants.js`

- Below `PRIOR_MODEL_FROM` (`:36`), add:
  ```js
  // D-50: the first UTC capture date that can carry the envelope's `projectionModelFrom` (= PRIOR_MODEL_FROM at
  // capture). A candidate dated before both this and PRIOR_MODEL_FROM is refused before fetch (it cannot carry
  // a marker); any later candidate is fetched and its marker decides — equal to PRIOR_MODEL_FROM passes, any
  // other value is refused, absent falls back to the date rule. Safe in both directions: set too early, an
  // unmarked capture is fetched once and refused by date; set too late, a marked capture is refused by date
  // (today's behaviour).
  export const MODEL_MARKER_FROM = '<Stage A commit UTC date + 1 day, YYYY-MM-DD>'
  ```
- Append to the `PRIOR_MODEL_FROM` comment (`:29-35`): "Captures record it as the envelope's `projectionModelFrom`
  (D-50); the frozen-prior gate compares that marker, and the capture date only for unmarked captures. It is the
  model identity, so a bump must move it strictly later than its current value (the day after the push, or the
  next unused date) — two model changes pushed the same day must not share a value."
- Do **not** change `PRIOR_MODEL_FROM`. D-50 moves no projection, so `priorModelFrom.test.js` stays green with
  `GOLDEN` untouched.

### 2.3 Gates: `src/utils/inSeasonScoring.js`

- `selectFrozenPriorCandidate({ manifestPaths, kickoffDate, epoch = PRIOR_MODEL_FROM, markerFrom = MODEL_MARKER_FROM })`
  (`:84-96`). Replace `if (best < epoch) return { dateKey: best, reason: 'model-changed' }` with
  `if (best < epoch) return { dateKey: best, reason: best < markerFrom ? 'model-changed' : 'model-by-marker' }`.
  Add `MODEL_MARKER_FROM` to the `./inSeasonConstants` import (`:15`). Update the comment above the function: a new
  reason `'model-by-marker'` means "dated before the epoch, but late enough to carry a marker, so fetch it and let
  `checkFrozenSnapshot` decide".
- `checkFrozenSnapshot(env, { leagueId, liveSeason, projectionBasis, dateBeforeEpoch = false, modelFrom = PRIOR_MODEL_FROM })`
  (`:100-105`). **First** check, before `league`:
  ```js
  const marker = typeof env?.projectionModelFrom === 'string' ? env.projectionModelFrom : null
  if (marker !== null ? marker !== modelFrom : dateBeforeEpoch) return 'model-changed'
  ```
  The model check comes first so precedence matches today, where a model refusal pre-empts every other gate.
  Update the comment to `→ null | 'model-changed' | 'league' | 'season' | 'basis'`.
- `trimFrozenSnapshot` (`:110-134`): `env` gains
  `projectionModelFrom: typeof snapshot?.projectionModelFrom === 'string' ? snapshot.projectionModelFrom : null`.
  Update its comment.

### 2.4 Loader: `src/api/frozenPrior.js`

- `loadFrozenPrior` (`:31-56`):
  - Keep the early return for `'model-changed'`, unchanged (no fetch).
  - For `'model-by-marker'` and `null`, call `readAndGate(cand.dateKey, { leagueId, liveSeason, projectionBasis, dateBeforeEpoch: cand.reason === 'model-by-marker' })`.
  - `readAndGate` passes `gateArgs` through to `checkFrozenSnapshot` as today. A `'model-changed'` result returns
    `{ status: 'refused', reason: 'model-changed', dateKey }`, the same shape as the pre-fetch refusal, so Market's
    existing label (`Market.jsx:349`) covers it with no UI change.
- **Cached trims made before D-50** have no `env.projectionModelFrom`. The marker reads as null and the date rule
  applies. That is correct, because snapshots are immutable and such a capture is unmarked. Do **not** force a
  re-trim. Only a trim cached by pre-D-50 code of a capture made by post-D-50 code could lose its marker, and that
  case degrades to today's date rule.

### 2.5 Tests (Vitest)

- `src/utils/projectionSnapshot.test.js`: the built envelope has `projectionModelFrom === PRIOR_MODEL_FROM`.
- `src/utils/inSeasonScoring.test.js`:
  - `selectFrozenPriorCandidate`:
    - `epoch '2026-10-11'`, `markerFrom '2026-10-12'`, candidate `2026-09-08` gives `'model-changed'`.
    - The same epoch with `markerFrom '2026-09-01'`, candidate `2026-09-08`, gives `'model-by-marker'`.
    - Candidate ≥ epoch gives `null` (unchanged).
    - The existing `:81` case still holds on the defaults.
  - `checkFrozenSnapshot`:
    - A marker equal to `modelFrom` passes even with `dateBeforeEpoch: true`.
    - A marker not equal gives `'model-changed'` even with `dateBeforeEpoch: false` and every other field
      matching.
    - No marker plus `dateBeforeEpoch: true` gives `'model-changed'`.
    - No marker plus `false` gives `null` (today's behaviour).
    - A non-string marker (`123`) counts as absent.
    - Precedence: a marker mismatch and a wrong `leagueId` together give `'model-changed'`.
    - The existing `:102-111` cases are unchanged.
  - `trimFrozenSnapshot`: keeps a string marker, and gives `null` when it is absent or non-string. **Update the
    existing exact `toEqual` at `:122`** to include `projectionModelFrom: null` in `env`, and rename that test to
    "…projectionBasis and projectionModelFrom default to null".
- `src/api/frozenPrior.test.js`:
  - The existing "model-epoch path: refused before any fetch" stays green on the defaults. Add
    `expect(MODEL_MARKER_FROM > '2026-09-08').toBe(true)` beside its `PRIOR_MODEL_FROM` assertion.
  - New cases in the same file, using the existing `CAPTURE = '2027-09-01'` (dated after `PRIOR_MODEL_FROM`):
    - A raw snapshot whose `projectionModelFrom` differs from `PRIOR_MODEL_FROM` gives
      `{ status: 'refused', reason: 'model-changed', dateKey: CAPTURE }`, and `tryDataStore` was called once
      (fetched, then refused).
    - A raw snapshot with `projectionModelFrom: PRIOR_MODEL_FROM` gives `status: 'ok'`.
    - A raw snapshot with no marker gives `status: 'ok'` (date ≥ epoch, as today).
- New file `src/api/frozenPriorMarker.test.js` exercises the `'model-by-marker'` path end to end. `loadFrozenPrior`
  takes `MODEL_MARKER_FROM` from the module, so this file needs its own hoisted mock:
  - Mock `../utils/inSeasonConstants` with
    `vi.mock('../utils/inSeasonConstants', async (orig) => ({ ...(await orig()), MODEL_MARKER_FROM: '2026-09-01' }))`.
  - Copy the cache and dataStore mocks from `frozenPrior.test.js` (not its `raw()`/`args`, which are 2027).
  - `listManifestPaths` → `['snapshots/2026-09-08.json']`; raw =
    `{ capturedAt: '2026-09-08T16:29:00Z', leagueId: 'L1', targetSeason: 2026, projectionBasis: 'league', players: { a: { projection: { projectedPPG: 12.3, factors: {} } } }, projectionModelFrom: <case> }`;
    call `loadFrozenPrior({ liveSeason: 2026, kickoffDate: '2026-09-09', leagueId: 'L1', projectionBasis: 'league' })`.
    Assert `tryDataStore` was called once in every case:
    - Marker equal to `PRIOR_MODEL_FROM` gives `status: 'ok'` after one fetch.
    - No marker gives `{ status: 'refused', reason: 'model-changed', dateKey: '2026-09-08' }` after one fetch.
    - Marker `'2026-10-05'` gives the same refusal.
- `src/__tests__/qbFrozenPriorRollover.test.js:78` asserts `reason: 'model-changed'` for `2026-09-09`. It stays
  green provided `MODEL_MARKER_FROM` > 2026-09-09, which it is. Do not edit it.

### 2.6 Docs (app)

- `docs/integrations.md`:
  - A `**projectionModelFrom**` paragraph after the `inSeason` paragraph (around `:431`): the envelope carries
    `PRIOR_MODEL_FROM` at capture, and the frozen-prior gate compares it (CR-26).
  - `:433` ("Model pin") and `:437` ("refused before any fetch"): restate as marker-first; unmarked captures by
    date; refused before fetch only when dated before both `PRIOR_MODEL_FROM` and `MODEL_MARKER_FROM`.
- `docs/nav/utils.md:48`: add `MODEL_MARKER_FROM` to the inSeasonConstants export list and restate "a captured
  prior dated earlier is refused" marker-first. `:26` (projectionSnapshot.js row): name the `projectionModelFrom`
  envelope key.
- `docs/signal-registry.md` §3C (`:126-131`):
  - Add `projectionModelFrom` to the envelope list sentence.
  - Add a row after "Projection output":
    `| Projection model marker (\`projectionModelFrom\`) | ephemeral capture | \`PRIOR_MODEL_FROM\` (\`src/utils/inSeasonConstants.js\`) at capture → snapshot envelope | captures made since D-50 shipped; earlier captures carry none | **Ephemeral** (the code's model identity at capture; not derivable from the data) | frozen-prior model gate (\`checkFrozenSnapshot\`, CR-26); lets graders segment captures by model |`.
  - The file is in `docsAvailabilityClaims.test.js`'s scope; the wording above states mechanism and makes no
    availability claim.
- Backlog `.claude/tasks/data-repo-backlog.md`: strike D-50 and move it to the top of `## Done`, in W1's format.
  Use `**✅ RESOLVED <date> by snapshot-model-marker-d50 Stage A** — snapshots carry \`projectionModelFrom\`; the
  frozen-prior gate compares it (data byte copy per data task \`snapshot-model-marker-d50.md\` Stage B).`

### 2.7 Registry: `docs/cross-repo-registry.md`, exactly 7 physical lines

Edit only these lines, by appending or replacing exactly the text quoted. Never write the sentinel literals or a
`sed` range literal.

1. **CR-01 Invariant** (`:50`): append to the end of the line:
   ` **Since snapshot-model-marker (D-50, still v3, no bump)** the envelope carries top-level \`projectionModelFrom\` — the app's \`PRIOR_MODEL_FROM\` at capture, a \`YYYY-MM-DD\` string naming the projection model the capture ran; absent means a capture made by code that predates the marker — additive only.`
2. **CR-01 Mirror** (`:53`): append to the end of the line:
   ` **snapshot-model-marker (D-50):** additive envelope key, no version bump. A grader may segment captures across app-model boundaries (those that bump \`PRIOR_MODEL_FROM\`) by \`projectionModelFrom\`; served-data corrections and row-detectable axes are still segmented as \`grading/anchor-policy.md\` says, and an absent marker is segmented by date as before. Never strip or rewrite the key on import: the frozen-prior gate reads it (CR-26).`
3. **CR-26 App side** (`:279`): in the `selectFrozenPriorCandidate` parenthetical, change "refused before fetch when
   earlier than \`PRIOR_MODEL_FROM\`" to "refused before fetch when earlier than both \`PRIOR_MODEL_FROM\` and
   \`MODEL_MARKER_FROM\`", and append to the end of the line:
   `; since snapshot-model-marker (D-50) \`trimFrozenSnapshot\` also keeps the envelope's \`projectionModelFrom\`, \`checkFrozenSnapshot\` refuses (\`'model-changed'\`, checked first) a marked capture whose marker differs from \`PRIOR_MODEL_FROM\` and an unmarked one dated before it, and \`selectFrozenPriorCandidate\` refuses before fetch only a capture dated before both \`PRIOR_MODEL_FROM\` and \`MODEL_MARKER_FROM\` (\`src/utils/inSeasonConstants.js\`)`
4. **CR-26 Invariant** (`:281`): append to the end of the line:
   ` Since snapshot-model-marker (D-50) a capture may carry top-level \`projectionModelFrom\`; when present on a capture dated on or after \`MODEL_MARKER_FROM\` (or \`PRIOR_MODEL_FROM\`), it, not the capture date, decides the model gate.`
5. **CR-26 Triggers** (`:283`): in the app half (before ` ‖ `), after
   `` `selectFrozenPriorCandidate`/`checkFrozenSnapshot`/`trimFrozenSnapshot` in `src/utils/inSeasonScoring.js` ``,
   insert `` , `PRIOR_MODEL_FROM`/`MODEL_MARKER_FROM` in `src/utils/inSeasonConstants.js` ``.
6. **CR-26 Mirror** (`:284`): replace the two-sentence span from `A frozen prior pins the projection model:` through
   `against the capture date.` with:
   `A frozen prior pins the projection model: a capture is refused when its \`projectionModelFrom\` differs from the app's \`PRIOR_MODEL_FROM\` (CR-25) or, unmarked, when it is dated before it, so an app model change after kickoff unfreezes the rest of that season rather than keeping a stale prior. The data side needs no action for that — it is decided by the app constant against the capture's marker, or against the capture date when a capture carries none.`
7. **CR-25 Invariant** (`:273`): append to the end of the line:
   ` Since snapshot-model-marker (D-50) \`PRIOR_MODEL_FROM\` is also the model identity captures record as \`projectionModelFrom\`, so each bump moves it to a value not used before.`

Line numbers are those at `c318487`. Re-derive them with `grep -n '^#### CR-01 \|^#### CR-26 '` before editing.

**Gate:** `git diff --stat -- docs/cross-repo-registry.md` shows 7 insertions / 7 deletions. Record the span md5 in
the hand-back:

use the anchored `sed -n` range from the registry's own *Drift check* command (app `docs/cross-repo-registry.md:334`)
piped to `md5`. The same command on the data copy must give the same hash (today both give `5eb1d2e0…`). Do not use
an unanchored range: it also matches lines that mention the markers inline.

### 2.8 Stage A done-definition

- `npm test`, `npm run lint` and `npm run build` are green or clean.
- Smoke (CLAUDE.md → Workflow convention recipe): first delete today's `projection-snapshots/<today>` IndexedDB
  record (the writer skips if one exists), then load the app, wait for the daily snapshot effect, and confirm
  that the IndexedDB `projection-snapshots/<today>` record's `data.projectionModelFrom === '2026-10-11'`.
- One commit: `D-50: snapshots carry projectionModelFrom; frozen-prior gate compares the model marker; registry CR-01/CR-25/CR-26 (7 lines); backlog close (snapshot-model-marker-d50)`.
- Hand-back:
  - The SHA.
  - The `MODEL_MARKER_FROM` value.
  - The registry diff stat and the span md5.
  - Every file touched.
  - What each new or changed test asserts.

---

## 3. Stage B — data repo (sonnet), one commit

1. **Registry byte copy.** Copy the app's mirrored span (at Stage A's SHA) into `cross-repo-registry.md` byte for
   byte.
   - `git diff --stat -- cross-repo-registry.md` must show 7 insertions / 7 deletions.
   - `cmp` the two spans and record the md5 with the same anchored command (equal to Stage A's).
   - `REGISTRY_MIRROR=1 node --test test/registry-mirror.test.mjs` must be green with the app checked out as the
     sibling.
2. **README** → snapshot section (after the `inputStatus` paragraph ending `:323`, before the per-player
   `inSeason` paragraph): add a paragraph.
   `**\`projectionModelFrom\` (D-50, still v3 — additive, no bump).** The app's \`PRIOR_MODEL_FROM\` at capture: a
   \`YYYY-MM-DD\` string naming the projection model the capture ran on. The app's frozen-prior gate compares it
   (CR-26). Absent on captures made by code that predates D-50. A grader may segment app-model boundaries by
   it; served-data corrections and row-detectable axes are segmented as \`grading/anchor-policy.md\` says.
   Importers and the commit gate pass it through untouched.`
3. **`data-catalog.md`** → Projection snapshots (`:74`): one clause naming the additive `projectionModelFrom`
   envelope key (D-50).
4. **Stale anchor:** `lib/snapshot-capture.mjs:75` cites app `projectionSnapshot.js:371` for the cache write. That
   line is now `:406` and moves again with Stage A. Replace `` `projectionSnapshot.js:371` `` with
   `` `projectionSnapshot.js` `writeProjectionSnapshot`'s `setCache` call ``. Comment only.
5. `npm test` and `npm run smoke` green.
6. Commit: `D-50: registry byte copy (app <SHA>), README/catalog projectionModelFrom, snapshot-capture comment anchor (snapshot-model-marker-d50)`.
7. Push the same day as the app.
8. **Post-push check (Session 1):** the first daily capture after the app push
   (`.github/workflows/daily-snapshot.yml`, cron `29 16 * * *` UTC) must carry `projectionModelFrom` equal to the
   app's `PRIOR_MODEL_FROM`. Run `node -e` on `snapshots/<date>.json`.

---

## 4. Cross-repo impact

- **CR-01** (envelope). Its Mirror says: "State the new envelope shape and whether the snapshot `schemaVersion`
  bumped. On a bump, `scripts/register-snapshots.mjs` expectations, `scripts/grade-snapshot.mjs` reads and the README
  snapshot section all need updating in the data repo. …" (truncated; the rest concerns `scoringSettings`, the
  `MAX_SUPPORTED_SCHEMA` ceiling and per-slice additive keys) → The new shape is the top-level additive
  `projectionModelFrom` (string). There is **no bump**, so register and grade need nothing. The README snapshot
  section is updated in Stage B §3.2. Registry text is in §2.7, items 1–2.
- **CR-26** (read-back). Its Mirror says: "…A frozen prior pins the projection model: a capture dated before the
  app's `PRIOR_MODEL_FROM` (CR-25) is refused, so an app model change after kickoff unfreezes the rest of that
  season rather than keeping a stale prior. The data side needs no action for that — it is decided by the app
  constant against the capture date." → It now reads the marker first, and the date only for unmarked captures.
  The data side needs no code change; the only data-side rule is "never strip the key on import". Registry text is
  in §2.7, items 3–6.
- **CR-25** (`PRIOR_MODEL_FROM`'s home; `src/utils/inSeasonConstants.js` is a whole-file trigger). Its Mirror is
  about re-fitting the k on a model change and is unchanged: D-50 moves no model. Its Invariant gains one sentence
  (§2.7 item 7) because the constant now doubles as the stored model identity.
- **CR-22** (the data repo runs the app's capture). The capture now writes one more key; the gate reads no key list.
  Stage B's edit to `lib/snapshot-capture.mjs` is comment-only, so its Mirror ("Before renaming or restructuring
  any of the App-side surfaces above, check whether `.github/workflows/daily-snapshot.yml` depends on it …") is not
  engaged. No edit.
- **CR-18 / signal registry:** the new ephemeral capture row is in app `docs/signal-registry.md` (§2.6). It is not
  a data ingest, so there is nothing for `data-catalog.md` beyond §3.3.

## 5. Risks

1. **An extra fetch.** A candidate dated in `[MODEL_MARKER_FROM, PRIOR_MODEL_FROM)` is now fetched once, about
   2.2 MB, before being judged. The trim is then cached permanently by `dateKey`. Today such a candidate is refused
   without a fetch. This is bounded at one fetch per device per season, and it is the price of an exact comparison.
2. **`MODEL_MARKER_FROM` is a guess at the first marked capture date.** Both directions are safe (§2.2 comment), so
   the value only trades one possible extra fetch against one day of exactness.
3. **Same-day bumps collide.** Two model changes pushed on one UTC day that both set `PRIOR_MODEL_FROM` to the next
   day would share a marker, so a capture by the first would be silently accepted under the second. That nearly
   happened on 2026-10-04 (P6b fix and P12b). `priorModelFrom.test.js` does not catch it. The §2.2 comment and the
   CR-25 Invariant sentence make "strictly later than the current value" the rule.

## Review record

**Plan gate, 2026-10-10 (plan-reviewer, 13 flags). All verified against source; all applied.**
- 1 (HIGH, md5 command): confirmed. The two repos gave different hashes; the anchored form gives `5eb1d2e0…` in
  both. §2.7 now points at the registry's own anchored `sed` command.
- 2 (HIGH, `inSeasonScoring.test.js:122` exact `toEqual`): confirmed; §2.5 now updates it.
- 3 (same-day bump collision): applied in §2.2 and §5.3, and as registry line 7 (CR-25 Invariant).
- 4 (CR-26 contradicting sentences): items 3 and 6 now rewrite in place; the line count is unchanged.
- 5 (grading over-promise, boundary 7 is a data correction): reworded in CR-01 and the README.
- 6 (stale app docs): integrations `:433/:437` and nav/utils `:26/:48` were added to §2.6.
- 7 (marker test fixture): stated explicitly.
- 8 (smoke false fail): delete today's record first.
- 9 ("absent" wording): applied.
- 10 (README placement): applied.
- 11 (CR-25 Invariant): taken as a 7th line. The reviewer's `:272` is the Data side line; the Invariant is `:273`.
  Counts are now 7/7 in both stages.
- 12 (quotes): CR-01 is marked truncated; CR-22 is noted as comment-only.
- 13 (anchors): fixed.
