# Unbreak `npm test` on Node 20, then collapse twelve workflows into one

**Type:** one urgent CI fix + a reusable workflow + sparse checkout.
**No served shape, no data, no manifest, no schemaVersion, no CDN purge.**
**Session model:** plan (opus, this file). Implementation is a separate sonnet session — do not edit
source here.
**Source:** `store-audit-2026-08-25.md` **E3** and **S3** (queue row 12), plus a **regression
introduced by `f7fa0e0`** (the E5 merge). Verified against live source 2026-08-31 at HEAD `f7fa0e0`.

> **S1 is deliberately held back — see §1.5.** The queue groups E3·S1·S3, but S1 is a twelve-file
> refactor of *dedup* logic with a silent failure mode, and it shares no edit surface with the other
> two. Bundling it into a workflow rewrite makes one un-reviewable diff. It is the natural next
> slice, and this plan is written so it can follow immediately.

**Working-tree note.** `store-audit-2026-08-25.md` is modified and uncommitted. **Do not stage,
commit, revert or edit it.** Nothing here touches it.

---

## 1. Verified facts

### 1.1 · `npm test` is broken on Node 20 — latent, not yet fired

`f7fa0e0` changed `package.json` to `node --experimental-test-module-mocks --test`, and added
`test/update-playerstats-isolation.test.mjs`, which uses **`t.mock.module` at four call sites**
(`:33`, `:41`, `:70`, `:75`). Both are **Node 22.3+** features.

| fact | value |
|---|---|
| every workflow pins | `node-version: "20"` (12 files) |
| `package.json` declares | `engines.node: ">=20"` |
| **`smoke-test.yml:35` runs** | **`npm test`** |
| `smoke-test.yml` triggers on | `pull_request` only — paths `bin/**`, `lib/**`, `scripts/**`, `package.json`, `enrichment/**`, `.github/workflows/**` |

On Node 20 the flag is unrecognised and Node exits before running any test; `t.mock.module` does not
exist there in any case. **It has not fired yet** because the E5 work went straight to `main` and
smoke-test is PR-triggered — but this slice edits `.github/workflows/**` and `package.json`, so a PR
of *this* work is exactly what trips it.

> **Honest limit on this claim.** No Node 20 is installed here (no nvm/volta; local is v24.2.0), so
> the version boundary is from knowledge, not measurement. What *is* measured: the flag is in
> `package.json`, `t.mock.module` is in the test, all 12 workflows pin 20, and smoke-test runs
> `npm test`. **§4 step 1 measures the boundary directly before anything else is done.**

Only **one** test file uses module mocking, so the fix is contained.

### 1.2 · E3 — twelve workflows, twelve full checkouts

`grep -rn "sparse-checkout\|fetch-depth" .github/workflows/` → **nothing**. Twelve plain
`actions/checkout@v4`.

| | size |
|---|---|
| working tree | **375 MB** |
| `.git` | 47 MB |
| `nflverse/` | 134 MB |
| `college/` | 70 MB |
| `snapshots/` | 59 MB |
| `nfl/` | 26 MB |
| `raw/` | 18 MB |

The audit measured 511 MB pre-E1; the tree is smaller now but has regrown with snapshots and the
advstats re-ingest. **Every scheduled run materialises all of it to write one season file.** No job
needs `college/`, `snapshots/`, or another family's directory.

### 1.3 · S3 — eight uniform callers, and two that must not be flattened

| workflow | purge calls | season-keyed | lines |
|---|---|---|---|
| `nflverse-draft`, `nflverse-playerids`, `weekly-playerstate` | 2 | no | 43–53 |
| **`weekly-ktc`** | 2 | no | **53 — plus a trailing quarantine-check step** |
| `nfl-season-totals`, `nflverse-oline`, `nflverse-schedule`, `nflverse-teamcontext`, `weekly-nflverse-roster` | 2 | yes | 48–58 |
| **`nflverse-playerstats`** | **3** | yes | **80** |
| `cron-deadman`, `smoke-test` | 0 | — | 31, 56 |

`diff nflverse-teamcontext.yml nflverse-schedule.yml` differs in exactly four things: **name, cron
comment + expression, subcommand, commit message**. **Eight** workflows are one template.

**Two of them are not.**

**`nflverse-playerstats.yml`** carries the per-family conditional staging this repo added five commits
ago to avoid an Invariant 3 violation — `git add` scoped to families that completed, purge scoped the
same way. **Forcing it into a generic template is how that gets flattened**, and it is the one piece
of workflow logic here with a correctness argument behind it.

**`weekly-ktc.yml` has a trailing step that a caller cannot carry.** Its
*"Fail if snapshot was quarantined"* step (`:49-52`) gates on
`steps.capture.outputs.quarantined` and is the **only** thing that turns CI red on an ordering-guard
trip — because `scripts/update-ktc.mjs:150-172` **deliberately exits 0**, with the comment
*"Exit 0 so the workflow's commit step persists the quarantine file; a trailing workflow step turns
CI red."* A job that delegates via `jobs.<x>.uses:` **cannot have `steps:` at all** (GHA schema), and
the template standardises the step id to `fetch`, which would not match the `capture` id this check
reads anyway.

**Folding it in would silently delete the guard's only alarm** — a quarantined snapshot would commit
and the run would show green. That is the failure mode CR-17's own `Mirror` is about. So the
standalone set is **four**, not three.

### 1.4 · The dead-man's discovery survives — verified

`scripts/check-crons.mjs` `extractCrons` scans each `.github/workflows/*.yml` file's **text** for
`cron:` lines and records any file with ≥1. Because every caller keeps its own `on: schedule` block
(the reusable workflow cannot own the schedule — `workflow_call` has no cron), **discovery is
unchanged**. This is the audit's own stated condition and it holds.

### 1.5 · Why S1 is not in this slice

Live census — **twelve** hash functions, not the audit's "thirteen" (its own list sums to eleven; it
predates `playersHash` appearing in a fourth script):

`cfbdHash`, `idsHash`, `nflHash`, `picksByYearHash`, `gamesHash`, `snapshotHash`,
`teamsHash` ×2 (teamcontext, oline), `playersHash` ×4 (advstats, gamelogs, roster, playerstate),
plus the normaliser `stripHashFields`. Twelve `createHash('sha256')` call sites.

The two genuine variants are confirmed: KTC's `snapshotHash` sorts by `name` before hashing
(`scripts/update-ktc.mjs:41-44`), playerstate strips `newsUpdated`/`searchRank`.

**Why it waits:** these hashes are the **content-dedup gate**. A `stableHash` that differs from any
one of them by a key order or a normalisation detail either writes when nothing changed (churn, and
a `lastModified` bump the app treats as new data) or **skips a real change silently**. Verifying that
means recomputing old and new hashes over every family's current served file and asserting equality
— a per-family verification pass that deserves its own slice, not a footnote in a workflow rewrite.

---

## 2. The decisions

### 2.1 · Replace module mocking with the injection seam the repo already uses

`updatePlayerStats` hard-imports the two updaters (`scripts/update-playerstats.mjs:29-30`). Give it
the same seam every other testable entry point here has:

```js
export const DEFAULT_DEPS = { updateAdvStats, updateGameLogs };

export async function updatePlayerStats({ year = null, dryRun = false, force = false, deps = DEFAULT_DEPS } = {}) {
  const d = { ...DEFAULT_DEPS, ...deps };
  …
  await d.updateAdvStats({ … });
  await d.updateGameLogs({ … });
}
```

Then rewrite `test/update-playerstats-isolation.test.mjs` to inject throwing stubs, and **remove
`--experimental-test-module-mocks` from `package.json`**.

**Prefer this over bumping the Node version.** Bumping `smoke-test.yml` to 22 is one line, but it
leaves `engines.node: ">=20"` false and one workflow off-version from eleven others. More to the
point: `scripts/update-nfl.mjs:41` already exports `DEFAULT_DEPS` with the `{ ...DEFAULT_DEPS,
...deps }` merge, and the last two slices added `DEFAULT_LOAD` and the `csv`/`currentSeason` seam.
**Reaching for experimental module mocking in a codebase with four blessed injection seams is against
its own grain** — and it bought a Node-version constraint the repo never had.

### 2.2 · One reusable workflow, eight callers, two left standalone

`.github/workflows/_ingest.yml` with `on: workflow_call`, taking inputs for the four things that
differ: `subcommand`, `commit-scope`, `purge-path` (a template with `<season>`), and whether the job
is season-keyed. Eight callers keep their `name`, their commented `on: schedule`, and
`workflow_dispatch`, and delegate the body.

**`nflverse-playerstats.yml`, `weekly-ktc.yml`, `cron-deadman.yml` and `smoke-test.yml` stay standalone** (§1.3) — eight callers, not nine.

### 2.3 · Sparse checkout lives in the reusable workflow — with a cone per caller

Because E3 and S3 touch the same lines, **E3 is written once inside `_ingest.yml`** rather than
twelve times. The base cone is:

```
lib scripts bin manifest.json package.json package-lock.json
```

plus a **`sparse-paths` input the caller supplies**. An earlier draft of this plan said the caller
just passes its family directory and that "nothing else is read." **That was wrong**, and it is the
main way this slice could break production silently. The cones below are derived from an audit of
every `readJson` / `listDir` call in `scripts/update-*.mjs`, not from directory names:

| caller | subcommand | sparse paths | why |
|---|---|---|---|
| `nflverse-draft` | `draft` | `nflverse/draft` | own file only |
| `nflverse-playerids` | `playerids` | `nflverse/playerids.json` | own file only |
| `nflverse-schedule` | `schedule` | `nflverse/schedule` | own file only |
| `nflverse-oline` | `oline` | `nflverse/oline` | own file only |
| `nflverse-teamcontext` | `teamcontext` | `nflverse/teamcontext` | own file only |
| `weekly-nflverse-roster` | `roster` | `nflverse/roster` | own file only |
| `weekly-playerstate` | `playerstate` | `nfl/players-state` | `listDir` + previous snapshot |
| **`nfl-season-totals`** | `nfl` | `nfl/season-totals` **+ `nflverse/schedule`** | **`scripts/update-nfl.mjs:125` reads `nflverse/schedule/<year>.json` on every in-season run** |
| *(standalone)* `nflverse-playerstats` | — | `nflverse/advstats` `nflverse/gamelogs` `nflverse/playerids.json` | both families read the crosswalk |
| *(standalone)* `weekly-ktc` | — | `ktc` | `listDir('ktc')`, previous snapshot, and writes `ktc/quarantine/` |

**The season-totals one is the dangerous entry, and it is dangerous in a way the plan's own gate
would not have caught.** `readJson` returns `null` on a missing file (`lib/io.mjs:24-27`) rather than
throwing, and `aggregateWeeks` treats `schedule === null` as a legitimate default — so a cone missing
`nflverse/schedule` produces a **green run that commits, purges, and silently loses D-1 bye inference
for the rest of the season.** An earlier draft asserted "a cone that omits a needed path fails at
read time." **It does not.**

**One nuance that makes the crosswalk case safer than it looks:** in **cone mode**, specifying
`nflverse/advstats` also includes every file sitting *directly in* `nflverse/` — which is where
`nflverse/playerids.json` lives — because cone mode includes parent-directory files. So that read
would likely survive by accident. **List it explicitly anyway.** Relying on an implicit
parent-directory rule to satisfy a cross-family dependency is exactly the kind of thing that breaks
the day someone switches to `--no-cone`, and the explicit entry documents the dependency.

**`sparse-checkout-cone-mode` must stay on**, and `.github/` is included by checkout regardless.

### 2.4 · Alternatives rejected

| option | rejected because |
|---|---|
| Bump `smoke-test.yml` to Node 22 | §2.1 — leaves `engines` false and one workflow off-version; the seam is the repo's own pattern |
| Bump all twelve to Node 22 | Larger blast radius for a problem caused by one test file, and may surface other Node-20-isms with nothing to catch them |
| Fold `playerstats` into the template | §1.3 — flattens the per-family staging that exists for an Invariant 3 reason |
| E3 as its own pass before S3 | Same twelve files edited twice; the second pass rewrites the first |
| Include S1 | §1.5 — unrelated surface, silent failure mode, needs per-family hash-equality proof |

---

## 3. The edits

### 3.1 · The Node fix (do this first, it is the blocking one)

1. `scripts/update-playerstats.mjs` — export `DEFAULT_DEPS`, add `deps = DEFAULT_DEPS`, merge with
   spread, call through `d.` (§2.1). Default-parameter form; `bin/update.mjs` unchanged.
2. `test/update-playerstats-isolation.test.mjs` — replace all four `t.mock.module` calls with
   injected stubs. **Keep every assertion**: both directions of single-family failure, both families
   attempted, non-zero result. `t.mock.method(globalThis, 'fetch', …)` may stay — that is not
   module mocking and needs no flag.
3. `package.json` — `"test": "node --test"`.

### 3.2 · `.github/workflows/_ingest.yml` (new)

`on: workflow_call` with inputs: `subcommand`, **`sparse-paths`** (§2.3's per-caller cone, not a
family directory), `commit-scope`, `purge-path`, `season-keyed` (boolean). Body: sparse checkout (§2.3) → setup-node 20 → `npm ci` →
`node bin/update.mjs <subcommand>` (id `fetch`) → the existing commit-and-purge block, unchanged in
behaviour: `git add`, commit, `git push || (git pull --rebase && git push)`, **purge after push**,
manifest first then the season-keyed file when `season-keyed`.

### 3.3 · Eight callers

Each reduces to `name`, the **verbatim** `on: schedule` block including its comment, `workflow_dispatch`,
and a `jobs.<x>.uses: ./.github/workflows/_ingest.yml` with `with:`.

**Cron expressions and their comments are copied byte-for-byte.** They encode a hand-tuned
non-colliding weekly schedule, and one of them is a registry trigger (§6).

### 3.4 · Four standalone workflows

`nflverse-playerstats.yml` and `weekly-ktc.yml` keep their bodies **unchanged** — the first for its
per-family staging, the second for its quarantine alarm (§1.3). Both get the §2.3 cone added inline:
`nflverse/advstats nflverse/gamelogs nflverse/playerids.json` and `ktc` respectively.

`cron-deadman.yml` and `smoke-test.yml` get cones appropriate to what they read. **Be conservative
with `smoke-test.yml`** — it runs the whole test suite plus several dry-runs across families, so it
reads `test/`, `test/fixtures/`, `enrichment/`, and multiple family directories. If narrowing it is
not obviously safe, **leave it a full checkout**; it runs on PRs, not on a schedule, so it is not
where the weekly cost is.

### 3.5 · `CLAUDE.md`

The workflow table has one row per file. Add `_ingest.yml` and note which callers delegate to it.

---

## 4. Step order

1. **Measure the Node boundary before touching anything.** Obtain Node 20 and run `npm test` at
   current HEAD. Record the exact failure. If it *passes* on Node 20, §1.1's premise is wrong and
   §3.1 is optional cleanup rather than a fix — **say so and continue**; the seam is still the
   better pattern.
2. Apply §3.1. Run `npm test` on Node 20 **and** locally. Both must pass.
3. **Re-derive the cone table yourself** (§2.3) before writing any workflow — grep every
   `readJson` / `listDir` / `repoPath` call in `scripts/update-*.mjs`, including variable paths like
   `readJson(dataPath)`. **Diff your table against §2.3's and reconcile any difference.** Two entries
   in that table are cross-family reads that a family-directory cone would miss.
4. Write `_ingest.yml` (§3.2). Convert **one** caller — `nflverse-draft.yml`, the simplest,
   non-season-keyed, not a registry trigger — and **dispatch it manually** to confirm it commits and
   purges.
5. Convert the remaining seven callers. Copy cron blocks verbatim (§3.3).
6. Add cones to the four standalone workflows (§3.4).
7. **Verify cron discovery is intact**: run the dead-man's own discovery and **diff the before/after
   list of scheduled files and expressions**. This is §1.4's condition.
8. `npm test`, `npm run smoke`.
9. Commit; `git -c rebase.autoStash=true pull --rebase origin main`; push. **No CDN purge.**
10. **Dispatch `nfl-season-totals.yml` specifically**, and verify the schedule read *by its effect*,
    not by exit status. A cone missing `nflverse/schedule` **exits 0 and commits** (§2.3) — so check
    the run's log for the bye-inference path actually finding the schedule file, or assert the
    written output carries bye data. **Do not treat a green run as proof.**

**Steps 3, 4 and 10 are the ones that cannot be skipped.** Step 3 is where the cones become correct;
step 4 catches template errors on the cheapest caller; step 10 is the only check that exercises the
one job whose cone failure is silent.

## 5. Tests

1. **Failure isolation, both directions** — carried over from the existing isolation test, now via
   injected `deps` rather than module mocks. Same assertions.
2. **`DEFAULT_DEPS` default path** — `updatePlayerStats` with no `deps` still calls the real
   updaters (the regression guard for §2.1's default-parameter form).
3. **No new test needs the experimental flag** — after §3.1, `grep -r "mock.module" test/` returns
   nothing. Make that an explicit check, not an assumption.

Workflow changes have no unit-test surface; steps 3, 6 and 9 are their verification.

---

## 6. Cross-repo impact

**Two entries fire: CR-17 and CR-21.** Both name a workflow file this slice converts, on the data
side. No other entry names `.github/`, `package.json`, or `lib/io.mjs` in its data-side `Triggers`.

**Nothing about either contract changes.** Cadence, `inProgress` marking, served shape, snapshot
path and record shape are all preserved exactly — this slice moves *where the YAML lives*, not what
it does or when.

### CR-17 · KTC snapshots

> Keep the snapshot a **bare array** — wrapping it in the `{ schemaVersion, generatedAt, … }` envelope every other family uses fails `isValidKtcSnapshot`, and the whole `ktcHist*` capture family degrades to empty with **no error and no test failure**. **Updated, dp-v2 Slice 5a:** the earlier note here said the Explorer's ~30-day KTC Δ cell was the only other thing that degraded and that it was gone, making `ktcHist*` "the only thing that degrades" — that is now stale twice over. First, `ktcHist*` was never only a diagnostic: `market/Market.jsx`'s TREND gutter is a second, real rendering consumer of both `computeKtcSignals`'s output and the raw `series`. Second, and more than bookkeeping, **the failure mode itself changed**: before this slice a bad/empty snapshot produced a silent gap in `factors` with no visible symptom anywhere; now it also produces a **visibly blank TREND column on Market, the app's primary surface** (every row's gutter renders `—`, the `band: 'none'` state) — something a user watching the app would actually notice, not just something a diagnostic dump would show. Keep the `ktc/snapshot-YYYY-MM-DD.json` path exactly: the app enumerates candidates by regex over manifest keys, so a path change makes every snapshot invisible rather than broken. Renaming `name`/`team`/`value`/`position` breaks `matchKTCToSleeper` the same silent way — and note the record shape is constrained **twice** on the app side, since `src/api/ktc.js` scrapes the same KTC DOM into the same four fields for the live path; the two scrapers are independent implementations of one shape, so a KTC markup change can break them separately. Flipping the manifest entry to `inProgress: false` is breaking in the unusual direction — the app deliberately opts this path in, so the change must be paired with revisiting `allowInProgress: true` app-side. Quarantined scrapes must stay in `ktc/quarantine/` and **must never be manifest-registered**: a registered quarantine file enters the app's 8-snapshot window as if it were good data.

**No change owed.** `weekly-ktc.yml` becomes a thin caller; the snapshot path, shape, cadence and
`inProgress` marking are untouched.

### CR-21 · in-season season-totals cadence

> If the weekly job stops running, starts writing partial weeks under a different marking, or the `inProgress` flag's meaning changes, **the app has no way to tell** — it will render a half-season's rates as though they were a season's, with no error and no test failure. The floor in `validateNflSeason` is deliberately self-calibrating (`max(1, maxGames - 3)`) so a partial season validates; that means **the validator no longer distinguishes "early season" from "broken scrape" by games played alone**, and the app-side consumer must not assume it does. Any change to the job's cadence, the `inProgress` marking, or that floor is a both-repos change. See CR-04's Mirror for why this family's `inProgress: true` opt-in is a legitimate exception to that entry's "not a pattern to propagate" line — its `inProgress` flag is accurate, not a mislabel.

**No change owed — and this Mirror names the exact risk this slice must not take.** *"Any change to
the job's cadence … is a both-repos change."* `nfl-season-totals.yml`'s cron is copied **byte-for-byte**
into its caller (§3.3), and §7 pins that as a checked item. **If cadence changes at all, this stops
being a no-op refactor and owes both repos a change.**

---

## 7. Done-definition

**The Node fix**
- [ ] Node 20 boundary **measured** at HEAD before the fix (§4 step 1), and the result recorded —
      including if it contradicts §1.1
- [ ] `DEFAULT_DEPS` exported from `scripts/update-playerstats.mjs`; `deps = DEFAULT_DEPS`,
      spread-merged; `bin/update.mjs` unchanged
- [ ] `test/update-playerstats-isolation.test.mjs` injects stubs; **every existing assertion kept**
- [ ] `package.json` back to `"test": "node --test"`; `engines.node: ">=20"` is true again
- [ ] `grep -r "mock.module" test/` returns **nothing**
- [ ] `npm test` green on **Node 20** and on the local version

**Workflows**
- [ ] `_ingest.yml` created with `on: workflow_call`
- [ ] **Eight** callers converted; **four left standalone** — `nflverse-playerstats.yml`
      (per-family staging), **`weekly-ktc.yml` (its trailing quarantine alarm)**, `cron-deadman.yml`,
      `smoke-test.yml`
- [ ] `weekly-ktc.yml`'s *"Fail if snapshot was quarantined"* step still present and still reading
      the **`capture`** step id — a quarantined snapshot must still turn CI red
- [ ] Every cron expression **and its comment** copied byte-for-byte — diff them to prove it
- [ ] `nflverse-playerstats.yml`'s per-family conditional staging and scoped purge **unchanged**
- [ ] One simple caller dispatched and observed to commit+purge **before** the other eight converted
- [ ] One season-keyed caller dispatched after conversion (§4 step 9)

**Sparse checkout**
- [ ] Cone table **re-derived from a live read audit** (§4 step 3) and reconciled against §2.3
- [ ] Base cone `lib scripts bin manifest.json package*.json` in `_ingest.yml`; per-caller paths
      passed as an input
- [ ] **`nfl-season-totals` cone includes `nflverse/schedule`** — the silent-degradation case
- [ ] **`nflverse-playerstats` cone lists `nflverse/playerids.json` explicitly**, not relying on
      cone mode's parent-directory rule
- [ ] `weekly-ktc` cone covers `ktc` including the `quarantine/` write path
- [ ] `smoke-test.yml` left at full checkout unless narrowing is obviously safe
- [ ] `nfl-season-totals` dispatched and its schedule read verified **by effect, not exit status**

**Guards**
- [ ] `scripts/check-crons.mjs` finds the **same scheduled files and expressions** before and after
      — diffed, not assumed
- [ ] `npm test` green (baseline **597**); `npm run smoke` green

**Cross-repo**
- [ ] CR-17 and CR-21 `Mirror` texts emitted (§6); **no registry text edited**
- [ ] Cadence provably unchanged for `nfl-season-totals.yml` (CR-21) and `weekly-ktc.yml` (CR-17)

**Both**
- [ ] No served file, no `manifest.json`, no `schemaVersion` change; **no CDN purge**
- [ ] `store-audit-2026-08-25.md` still modified-and-uncommitted, untouched

---

## 8. Settled decisions

- **Injection seam, not a Node bump** (§2.1) — the repo's own pattern, four precedents; a bump leaves
  `engines` lying.
- **`playerstats` and `weekly-ktc` stay standalone** (§1.3) — the first for its conditional staging,
  the second because a `uses:` caller cannot carry the trailing step that is the ordering guard's
  only alarm. Four standalone, eight callers.
- **Cones come from a read audit, not from family directories** (§2.3) — two ingests read across
  families, and one of those failures is silent.
- **E3 rides inside S3** (§2.3) — same lines; doing E3 first means editing twelve files twice.
- **S1 held for its own slice** (§1.5) — dedup logic, silent failure mode, needs per-family
  hash-equality proof.
- **Cron blocks copied byte-for-byte** (§3.3, §6) — one is a CR-21 trigger and cadence is the
  contract.
- **Convert one caller and dispatch it before the other eight** (§4 step 3) — a workflow verified
  only locally is verified where it does not run.

---

## 9. Invariant check

- **Invariant 3 (manifest is the index)** — unchanged. `_ingest.yml` reproduces the existing
  commit-and-purge block verbatim, and the one workflow with bespoke staging is not touched.
- **CDN purge rule** — preserved: purge after push, manifest first, then the season file. This slice
  performs no purge of its own.
- **Append-only / capture-only** — no data file is read or written.
- **Invariant 4 (schemaVersion)** — nothing served changes.

---

## 10. Out-of-scope observations (not edits)

1. **S1 is the natural next slice** and this plan leaves it clean: twelve hash functions, two genuine
   variants (`snapshotHash` sorts by name, playerstate strips two fields), and the verification it
   needs is per-family old-vs-new hash equality on the current served files.
2. **S2 (six season-keyed updaters, ~800 lines → ~250) remains the largest duplication** and the
   audit's own advice — one family at a time behind the existing tests — still stands. It is a bigger
   slice than S1 and should follow it.
3. **`raw/` is back to 18 MB** after E1 removed 208 MB. Worth a glance during the next weight pass to
   confirm it is all still read by something.
4. **`readJson` returning `null` rather than throwing is load-bearing in both directions.** It is
   why the C4 archive-scan guard exists, why `update-nfl`'s optional schedule read is safe, and why
   a missing sparse-checkout path degrades silently instead of failing. Any future change to that
   function's contract touches far more than its call sites.
5. **`f7fa0e0` shipped a latent CI break that no gate caught** — `npm test` passed locally on Node 24
   and smoke-test is PR-triggered, so nothing ran it on Node 20. A push-triggered job that runs
   `npm test` on the pinned version would have caught it same-day. Not proposed here (it changes CI
   cost and cadence), but it is the gap that let this through.
