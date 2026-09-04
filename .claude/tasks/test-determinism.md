# Make `npm test` deterministic, and stop tests writing into served directories

**Type:** one test fix (the actual flake) + one injection seam (the actual isolation problem).
**No data, no manifest, no served shape, no CDN purge.**
**Session model:** plan (opus, this file). Implementation is a separate sonnet session — do not edit
source here.
**Source:** intermittent full-suite failures measured **2026-08-31** at HEAD `5acc9eb`.

> **The premise this was filed under is wrong.** It was queued as "fix the test isolation flake", on
> my read that `grade-routing`'s sentinel fixture was breaking a panel test. **It is not.** The flake
> is a **one-millisecond timestamp comparison** with no filesystem involvement at all (§1.1). The
> served-directory pollution is real and worth fixing (§1.3) — but it is not what makes the suite
> red. §1 separates them because the fixes are unrelated.

**Working-tree note.** `store-audit-2026-08-25.md` is modified and uncommitted. **Do not stage,
commit, revert or edit it.** Nothing here touches it.

---

## 1. Verified facts

### 1.1 · The flake is a `generatedAt` millisecond race — not isolation

`test/panel-integration.test.mjs:682-685`:

```js
const withoutFlag   = assemblePanel({ fromYear: 2020, toYear: 2024, scoringFrom: '2026-07-05', load });
const withFlagFalse = assemblePanel({ …, withFactorMultipliers: false, historyFloor: 2012 });
assert.deepEqual(withoutFlag, withFlagFalse);
```

Two calls, each stamping `meta.generatedAt = new Date().toISOString()` (`scripts/panel-run.mjs:180`).
Straddle a millisecond boundary and `deepEqual` fails. The captured assertion:

```
+ actual   generatedAt: '2026-08-30T22:19:37.957Z',
- expected generatedAt: '2026-08-30T22:19:37.958Z',
```

**Nothing else differs** — `rows`, `coverage` and every other `meta` field match. And the test passes
an **injected `load` object**; it reads no files at all, so no fixture, sentinel or directory state can
reach it. Concurrency is not the cause, only a contributing pressure: scheduling jitter under a full
suite widens the chance of straddling the boundary, which is why isolated runs look clean.

### 1.2 · Measured rates

| | failures |
|---|---|
| full suite at HEAD | **2 / 8** |
| full suite at `HEAD~1` (before C4) | **1 / 8** |
| `panel-fit` alone × 6 | 0 |
| `panel-fit` + `grade-routing` × 6 | 0 |
| those two + `fantasyPoints` × 6 | 0 |

**Pre-existing**, not introduced by C4 — the `HEAD~1` run settles that. It needs the full suite's
parallelism to surface, which is exactly why the isolated combinations look stable and why it went
unnoticed.

**This is the part that matters beyond the test:** `npm test` green has been a **~75–85% signal**, and
every slice in this sequence treated a single green run as proof.

### 1.3 · The pollution is real, separate, and *mostly* harmless

`test/grade-routing.test.mjs` writes three files into **served** directories in `before()` and unlinks
them in `after()`:

| file | risk |
|---|---|
| `nfl/season-totals/9999.json` | **the landmine** — a plausible 4-digit year that any year-shaped scan accepts |
| `snapshots/_routing_test_v2_.json` | low — the name is deliberately non-date-shaped |
| `snapshots/_routing_test_v1_.json` | low — same |

**Live blast radius today: one test**, `test/fantasyPoints.test.mjs`'s archive scan, which C4
partly defended (`if (!data) continue`) after hitting a real `Object.values(null)` crash on a file
that vanished mid-scan. `test/panel-integration.test.mjs`'s three `readdirSync` calls enumerate
**`backtests/`**, not these directories, so they are not exposed.

**"Partly" is load-bearing.** That guard covers the `readdir`→`existsSync` window and nothing else;
two narrower windows still *throw* rather than returning `null`, so a rare second red is available
even before this slice lands. §4.1 has the detail and the classification rule — it matters only
because it gives the step-1 gate a second suspect.

So it is a **latent hazard with a confusing failure mode**, not a reliable current failure. It bites
the next person who enumerates `nfl/season-totals/`.

### 1.4 · Why the test writes real files: there is no seam

`scripts/grade-snapshot.mjs` has **no injection surface** — verified, zero `DEFAULT_DEPS`/`load`
pattern. Its two production reads are hardcoded:

- `loadOutcomes` → `readJson('nfl/season-totals/${targetSeason}.json')`
- `gradeSnapshot` → `readJson('snapshots/${snapshotDate}.json')`

So writing real files is the *only* way the test can currently exercise them. **The sibling module
already has the answer**: `scripts/panel-run.mjs:57` `DEFAULT_LOAD` exports exactly the two loaders
needed — `loadSeasonTotals(year)` and `loadSnapshot(date)`.

And the repo has blessed this pattern twice already. CLAUDE.md's Navigation map describes
`update-nfl.mjs`'s `DEFAULT_DEPS` as *"an injectable I/O + fetch surface mirroring
`scripts/panel-run.mjs`'s `DEFAULT_LOAD` pattern — lets `updateNfl({…, deps})` be control-flow-tested
**without touching the network or the real repo file tree**."* That last clause is this slice's whole
rationale, already written down.

---

## 2. Part 1 — the flake

**Fix the assertion, not the production code.** `generatedAt` is a wall-clock stamp that is *supposed*
to differ between two calls; the test's intent — named in its own title — is that **rows, coverage and
meta** are unaffected by the opt-in params. The timestamp is not part of that claim.

Compare the three explicitly, with `generatedAt` excluded from the `meta` comparison:

```js
assert.deepEqual(withoutFlag.rows,     withFlagFalse.rows);
assert.deepEqual(withoutFlag.coverage, withFlagFalse.coverage);
const stripStamp = ({ generatedAt, ...rest }) => rest;
assert.deepEqual(stripStamp(withoutFlag.meta), stripStamp(withFlagFalse.meta));
```

**And keep asserting the field exists**, so the test does not silently stop noticing if `generatedAt`
disappeared from the envelope:

```js
for (const p of [withoutFlag, withFlagFalse])
  assert.match(p.meta.generatedAt, /^\d{4}-\d{2}-\d{2}T/, 'meta.generatedAt present and ISO-shaped');
```

**Do not freeze the clock or inject a `now` into `assemblePanel`.** That would widen a production
signature for a test-only concern, and `panel-run.mjs` is a data-side trigger of four registry entries
(§5) — a change there costs far more than a three-line test fix.

**Do not "fix" this by making `assemblePanel` deterministic.** `generatedAt` is provenance on a written
artifact (`backtests/<date>-e0a-panel.json`); it is *meant* to be wall-clock.

---

## 3. Part 2 — the seam

Give `scripts/grade-snapshot.mjs` the same injection surface its sibling already has, then make
`test/grade-routing.test.mjs` inject instead of writing.

```js
// scripts/grade-snapshot.mjs — mirroring scripts/panel-run.mjs:57
export const DEFAULT_LOAD = {
  loadSeasonTotals: (year) => readJson(`nfl/season-totals/${year}.json`),
  loadSnapshot:     (date) => readJson(`snapshots/${date}.json`),
};

export function loadOutcomes(targetSeason, scoringSettings = null, load = DEFAULT_LOAD) { … }
export function gradeSnapshot({ …, load = DEFAULT_LOAD }) { … }
```

**Default-parameter form, so every existing caller is unchanged** — `bin/grade.mjs` and the
`--self-test` path keep working with no edit. That is what makes this safe to land alongside a flake
fix rather than as its own risky refactor.

**Thread `load` through the internal call.** `gradeSnapshot` calls `loadOutcomes` at
`scripts/grade-snapshot.mjs:248` — `const loaded = loadOutcomes(targetSeason, scoringSettings);`.
That call must become `loadOutcomes(targetSeason, scoringSettings, load)`. It is the **only** path
both `gradeSnapshot` routing tests exercise; miss it and the seam is inert for half the file while
still compiling. It fails loudly rather than silently (the injected fixture is simply not seen), but
it is the one load-bearing wiring step, so it is pinned in §6.

Then `test/grade-routing.test.mjs`:

- delete the `before()`/`after()` write/unlink block entirely,
- pass `load` with the three fixtures served from memory,
- keep every assertion byte-identical — this is a **pure delivery-mechanism change**, and any
  assertion that has to move means the seam is wrong.

### 3.1 · One comment goes stale — correct it, keep the guard

C4 left this at `test/fantasyPoints.test.mjs:112-115`:

```js
// A file can legitimately vanish mid-scan: other test files (e.g.
// test/grade-routing.test.mjs) write/unlink a transient sentinel-year fixture
// under this same real directory, and node:test runs files concurrently.
if (!data) continue;
```

After part 2 that is **false** — nothing writes into `nfl/season-totals/` during a suite run any more,
so the named writer is gone and the comment points at a file that no longer does this.

**Correct the comment; keep `if (!data) continue`.** The scan still reads a real served directory, the
guard costs one line, and a bare `Object.values(null)` crash is a bad way to learn that a future test
started writing there. Say that: the guard is retained deliberately as defence on a real-directory
scan, and note that the writer it was added for was removed by this slice. Do **not** delete the guard
and do **not** leave the stale attribution — a comment naming a behaviour that no longer exists is
worse than no comment, because the next reader will go looking for it.

Comment-only. No assertion in that file moves.

**`runSelfTest` keeps reading `test/fixtures/` directly** (`:313`, `:317`, `:424`). Those are committed
fixture files under `test/`, not served data — out of scope, and `npm run smoke` depends on them.

---

## 4. Step order

1. **Part 1 first, and prove it independently.** Apply §2, then run the full suite **20×** and record
   the failure count. Expect **0/20**. A smaller sample cannot distinguish a fix from luck at a 1-in-4
   base rate — 8 runs would miss a real regression more than 10% of the time.

   **If a red appears in this gate, read the assertion before concluding anything.** There is a
   second, rarer failure path that part 1 cannot fix and part 2 removes — see §4.1. Classify the
   failure; do not assume the §2 fix failed.
2. Add the seam (§3), defaults only, **including the `:248` threading**; confirm `bin/grade.mjs` and
   `npm run smoke` are untouched.
3. Rewrite `grade-routing.test.mjs` to inject; **delete the `before`/`after` file writes**.
4. **Confirm the pollution is gone at the source, not by observation.** A runtime check cannot prove
   this: the baseline tree is already dirty (`store-audit-2026-08-25.md`), so "`git status` stays
   clean" is false on the first sample; and a post-run sample is vacuous because `after()` unlinks all
   three files *today* too, so it cannot tell before from after. A test asserting the file is absent is
   itself racy under `node --test` concurrency. The sound check is static:
   - `test/grade-routing.test.mjs` imports **neither** `fs` **nor** `writeJsonStable`/`repoPath`,
   - and `grep -nE "nfl/season-totals|snapshots/" test/grade-routing.test.mjs` returns only fixture
     *keys*, no write path.
5. **Re-run the full suite 20× again** after part 2. Still 0/20.
6. **Re-anchor the registry (§5.1)** — five anchors this change shifts, plus the seven stale
   `RATE_KEYS:21` citations, in **both** repos' mirrored region. Verify by byte-diff.
7. One commit per repo: data-repo `fix: deterministic panel-integration assertion + injectable loaders
   for grade-snapshot`, app-repo the §5.1 anchor corrections. (`.claude/` is gitignored, so this task
   file is never part of either commit.)
8. `git -c rebase.autoStash=true pull --rebase origin main`, then push.

**Do not combine steps 1 and 2 into one verification run.** If the suite still flakes afterwards, you
need to know which half is responsible.

**Step 8 uses `-c rebase.autoStash=true` deliberately.** The tree carries the uncommitted
`store-audit-2026-08-25.md`; `rebase.autoStash` is **unset** in this repo, so a plain
`git pull --rebase` aborts before it starts. The `-c` form autostashes and restores for this one
command **without writing to `.git/config`**, and the audit file comes back modified-and-uncommitted
exactly as it started. Do not `git stash` it by hand, do not `git add` it, do not set the config
persistently.

### 4.1 · How to classify a red in the step-1 gate

Two independent causes can produce a red before part 2 lands, and they look nothing alike:

| assertion you see | cause | what it means |
|---|---|---|
| `generatedAt` differing by ~1 ms at `panel-integration.test.mjs:684` | the flake (§1.1) | §2 did not take — fix it |
| `ENOENT` or a `JSON.parse` `SyntaxError` from the `nfl/season-totals` scan in `fantasyPoints.test.mjs` | the pollution (§1.3) | **expected**; part 2 is the fix — do not touch §2 |

The second row exists because C4's guard is a **partial** defence (§1.3). `if (!data)
continue` covers the `readdir`→`existsSync` window, but not two others: `readJson` is TOCTOU-unsafe
(`existsSync` then `readFileSync` — an unlink landing between them **throws** `ENOENT`, it does not
return `null`; `lib/io.mjs:24-28`), and `writeJsonStable` is a non-atomic truncating `writeFileSync`,
so a concurrent reader can catch a 0-byte file and throw a `SyntaxError` (`lib/io.mjs:43-48`).

**Do not "fix" `readJson` or `writeJsonStable`.** Hardening shared I/O to paper over a test that
should not be writing there is the wrong direction. Part 2 removes the only concurrent writer, which
removes both windows. Low probability either way — but §4 exists precisely to stop a residual red
being misread, and an unclassified red has two suspects.

---

## 5. Cross-repo impact

**CR-01 fires on `Triggers`.** Its data-side list names `scripts/grade-snapshot.mjs` whole-file, and
§3 edits that file.

**CR-14 does *not* fire on `Triggers`** — its data-side trigger is symbol-scoped
(`buildInBasisOutcomes` in `scripts/grade-snapshot.mjs`), and §3 does not edit that function. It is
carried here anyway for two reasons: over-inclusion of a Mirror is harmless, and its **Data side**
anchors shift (§5.1), so the entry is edited by this slice regardless.

**No third entry.** A full sweep of the mirrored region for `grade-snapshot` — matching bare `:NNN`
and range forms, not just `symbol:NNN` — returns exactly two entries with line anchors into that file
(CR-01, CR-14) and one prose mention with no anchor and no trigger (CR-04's **Data side**; its
`Triggers` are `lib/manifest.mjs` symbols and `manifest.json` only, so it does not fire).

**Part 1 fires nothing.** `test/panel-integration.test.mjs` is not a trigger of any entry — the only
test file in any data-side `Triggers` list is `test/panel-fit.test.mjs` (CR-15), which this slice does
not touch. §3.1's comment-only edit to `test/fantasyPoints.test.mjs` fires nothing either.

### CR-01 · Projection snapshot envelope

> State the new envelope shape and whether the snapshot `schemaVersion` bumped. On a bump, `scripts/register-snapshots.mjs` expectations, `scripts/grade-snapshot.mjs` reads and the README snapshot section all need updating in the data repo. **`scoringSettings` has a second reader beyond grading** — `scripts/panel-run.mjs` `resolveScoring` pins the fit's basis from a committed snapshot, so dropping or renaming that envelope field breaks the R3-FIT path (CR-15) as well as in-basis grading. This snapshot `schemaVersion` is independent of `dataStore.js` `MAX_SUPPORTED_SCHEMA` (a ceiling on every family read through `tryDataStore`, not season-totals-scoped — snapshots have no `tryDataStore` reader in the first place). Additive `factors` keys (`isTeamChange`/`prevTeam`/`newTeam`/`depthStale`) do **not** bump the version.

### CR-14 · `calculateFantasyPoints` port

> Any change to the scoring math must be ported to `lib/fantasyPoints.mjs` in the same cycle, or in-basis grades silently diverge from how the app actually scored — **and so does the R3-FIT panel** (CR-15), which builds its outcome column from the same port. **Nothing app-side fails when this drifts** — the divergence appears only as wrong grades and a wrong fit. Low churn (the dot-product is stable), which is exactly why the drift would go unnoticed. Note one deliberate asymmetry: `RATE_KEYS` (`lib/fantasyPoints.mjs:21`) is a data-side-only defensive guard excluding non-additive keys from the dot-product; it has **no app counterpart** and must not be "mirrored back" into the app.

**Both Mirrors above are quoted byte-exact as the registry reads them today** — which is why CR-14's
still says `RATE_KEYS (lib/fantasyPoints.mjs:21)`. That citation is stale (§5.1 corrects it to `:29`);
the quote is deliberately left as-is so it matches what you will find in the file before editing.

### 5.1 · Anchor corrections — mirrored region, both repos

This slice **shifts five live-accurate line anchors**. Inserting `DEFAULT_LOAD` above `loadOutcomes`
(`scripts/grade-snapshot.mjs:127`) moves every anchor below it. All five are correct *today*, so
leaving them is an active degradation caused by this change, not inherited debt.

**Do not relocate `DEFAULT_LOAD` to dodge this.** Placing it at the foot of the file would keep the
numbers stable (default-parameter expressions evaluate at call time, so a later `const` is legal), but
§1.4's whole justification is *mirroring the sibling*, and `scripts/panel-run.mjs` declares its
`DEFAULT_LOAD` near the top. Write the source clearly; pay the bookkeeping.

**Re-anchor semantically, not arithmetically.** Do not add an offset — after the edit, locate each
line and confirm it resolves to the code named here:

| entry · field | anchor | must resolve to |
|---|---|---|
| CR-01 · Data side | `:168` | `const proj = player.projection;` |
| CR-01 · Data side | `:231` | the `?? (snapshot.targetSeason != null ? … : deriveTargetSeason(…))` resolution |
| CR-01 · Data side | `:316` | `const targetSeason  = deriveTargetSeason(snapshot.capturedAt);` (in `runSelfTest`) |
| CR-14 · Data side | `:131` | `return { ...buildInBasisOutcomes(data, scoringSettings), inBasis: true };` |
| CR-14 · Data side | `:431` | `const builderResult = buildInBasisOutcomes(v2SeasonTotals, …);` |

`deriveTargetSeason:34`, `grade-snapshot.mjs:20`, `buildInBasisOutcomes:87`, `:90`, `:109` and
`panel-run.mjs:92`/`:70-77` sit **above** the insertion point or in another file — leave them alone.

**Also fold in the stale `RATE_KEYS` anchor.** `RATE_KEYS` is defined at `lib/fantasyPoints.mjs:29`;
the registry says `:21`, which is now the opening line of its doc comment. HEAD `5acc9eb` (C4) shifted
it. This slice does not touch `lib/fantasyPoints.mjs`, so `:29` is stable.

It appears **7 times across 6 entries** — CR-11, CR-12, CR-13 (`Triggers`), CR-14 (`Data side` **and**
`Mirror`), CR-19 (`Triggers` **and** `Mirror`, both hard-wrapped, so grep for the continuation lines
too). It is folded in rather than deferred for one reason: **CR-14's `Data side` line carries both a
shifting anchor and the stale one.** Correcting `:131`/`:431` on that line and knowingly leaving
`RATE_KEYS:21` wrong two clauses earlier is not defensible. The verification is a single byte-diff
either way.

Change **only the number** — `:21` → `:29`. No other word of any entry moves.

**Both repos, same commit.** The region between `<!-- CR-REGISTRY-BEGIN -->` and
`<!-- CR-REGISTRY-END -->` is byte-identical across `README.md` (data) and
`docs/cross-repo-registry.md` (app). Apply the identical edit to both and **verify by diffing the two
extracted regions — they must be byte-identical, zero output.** This is the one check that covers all
twelve corrections at once.

**This is bookkeeping, not a contract change.** No app-side trigger is re-derived or "corrected" —
app-side text is frozen authority and is not touched. No invariant, direction or mirror instruction
changes.

**Mirror instruction to the app repo, both entries: no behavioural change owed.** The seam is
**additive and default-valued** — no envelope field, snapshot shape, scoring math or `RATE_KEYS`
behaviour changes, and every existing call site resolves to the same reads it makes today. The only
observable difference is that a test injects fixtures instead of writing three files into served
directories, which the app never sees. `calculateFantasyPoints` is not edited, so CR-14's port stays
in sync.

**The app repo does receive one edit: the §5.1 anchor corrections.** That is mirrored-region
bookkeeping — twelve line numbers — not a contract change, and it must land in the same change on both
sides.

---

## 6. Done-definition

**Part 1 — the flake**
- [ ] `test/panel-integration.test.mjs:684` compares `rows`, `coverage` and `meta`-minus-`generatedAt`
- [ ] `generatedAt` still asserted **present and ISO-shaped** in both results
- [ ] No production file touched for this part — `scripts/panel-run.mjs` unchanged
- [ ] **Full suite 20× → 0 failures**, run and recorded *before* part 2 begins

**Part 2 — the seam**
- [ ] `DEFAULT_LOAD` exported from `scripts/grade-snapshot.mjs`, mirroring `scripts/panel-run.mjs`
- [ ] `loadOutcomes` and `gradeSnapshot` take `load = DEFAULT_LOAD` — **default-parameter form**
- [ ] **`gradeSnapshot`'s internal call threads it** — `:248` reads
      `loadOutcomes(targetSeason, scoringSettings, load)`
- [ ] `bin/grade.mjs` **unchanged**; `runSelfTest`'s `test/fixtures/` reads **unchanged**
- [ ] `grade-routing.test.mjs`'s `before`/`after` write/unlink block **deleted**; fixtures injected
- [ ] **Every assertion in that file byte-identical** — a moved assertion means the seam is wrong
- [ ] `grade-routing.test.mjs` imports **neither `fs` nor `writeJsonStable`/`repoPath`** — the
      static check from §4 step 4, not a runtime observation
- [ ] `test/fantasyPoints.test.mjs`'s C4 comment no longer names `grade-routing.test.mjs` as a live
      concurrent writer (§3.1); the `if (!data) continue` guard itself **stays**
- [ ] **Full suite 20× → 0 failures** again after part 2

**Registry (§5.1)**
- [ ] CR-01's `:168`/`:231`/`:316` re-anchored and each **verified to resolve to the named line**
- [ ] CR-14's `:131`/`:431` re-anchored and verified the same way
- [ ] All **7** `lib/fantasyPoints.mjs:21` citations → `:29` (CR-11, CR-12, CR-13, CR-14 ×2, CR-19 ×2
      — CR-19's two are hard-wrapped across lines)
- [ ] **Only numbers changed** — no other word of any entry, and **no app-side trigger touched**
- [ ] Mirrored regions of `README.md` and the app's `docs/cross-repo-registry.md` **diff to zero bytes**

**Both**
- [ ] `npm run smoke` green
- [ ] No data file, no `manifest.json`, no served-shape change, no CDN purge
- [ ] `store-audit-2026-08-25.md` still modified-and-uncommitted, untouched

---

## 7. Settled decisions

- **The flake is not an isolation problem** (§1.1) — it is a timestamp comparison in a test that reads
  no files. Fixing isolation would not have fixed it.
- **Fix the assertion, not `assemblePanel`** (§2) — `generatedAt` is deliberate provenance on a written
  artifact, and `panel-run.mjs` is a four-entry trigger.
- **Default-parameter seam** (§3) — leaves every existing caller untouched, which is what makes the two
  parts safe to land together.
- **20 runs, not 8** (§4) — at a ~1-in-4 base rate, 8 runs is not enough to distinguish a fix from luck.
- **Verify part 1 before adding part 2** (§4) — otherwise a residual flake has two suspects.
- **`runSelfTest`'s `test/fixtures/` reads stay** (§3) — committed fixtures under `test/`, not served
  data.
- **`DEFAULT_LOAD` goes where the sibling puts it** (§5.1) — above `loadOutcomes`, accepting the
  five-anchor shift, rather than at the foot of the file to protect line numbers. Source clarity
  outranks registry bookkeeping.
- **`readJson`/`writeJsonStable` are not hardened** (§4.1) — removing the only concurrent writer is
  the fix; hardening shared I/O to tolerate a test that should not be writing there is the wrong
  direction.
- **The pollution check is static, not runtime** (§4 step 4) — the baseline tree is already dirty and
  `after()` already unlinks, so no runtime observation can distinguish before from after.
- **The stale `RATE_KEYS:21` is folded in, not deferred** (§5.1) — CR-14's `Data side` line carries a
  shifting anchor *and* the stale one; correcting one and leaving the other is not defensible, and the
  byte-diff verification is the same single check.

---

## 8. Out-of-scope observations (not edits)

1. **`npm test` green has been a ~75–85% signal for this whole sequence.** Every slice's
   done-definition treated one green run as proof. Nothing needs revisiting — the failure mode is a
   spurious red, not a spurious green — but it is worth knowing that "tests green" carried less
   information than it appeared to.
2. **`lib/manifest.mjs`, `lib/enrichment.mjs` and `scripts/backtest-run.mjs` all stamp
   `new Date().toISOString()`** into written artifacts. None is currently compared across two calls in
   a test, but the same flake shape is available to any future test that deep-compares whole outputs.
3. **The anchor backlog shrinks but does not close.** §5.1 clears the twelve this slice can justify
   touching. Still open, untouched here: CR-09's `validateGameLogs:503` resolving inside
   `validateSchedule`, and four entries citing a stale `scripts/update-nfl.mjs:93` writer anchor.
   Those need the deliberate two-repo pass `registry-anchor-reconcile.md` describes — the app repo
   owns the format definition, so the *policy* question (whether line anchors belong in the mirrored
   region at all, given they drift silently on any insertion above them) is not this slice's to
   settle.
4. **C4 shipped a stale anchor of its own.** Inserting 8 keys into `RATE_KEYS` moved its definition
   from `:21` to `:29` and left 7 citations behind — the same failure mode §5.1 exists to prevent,
   one slice earlier and unnoticed until this review. Worth knowing that the *only* thing that caught
   it was a reviewer re-verifying anchors against live source, which is a standing duty precisely
   because nothing else does.
