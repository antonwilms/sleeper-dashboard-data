# S2, slice 1: build the safety net the refactor assumes already exists

**Type:** four injection seams + characterization tests for six ingest updaters.
**No spine extraction in this slice.** No served shape, no data, no manifest, no schemaVersion,
no CDN purge, no behaviour change.
**Session model:** plan (opus, this file). Implementation is a separate sonnet session — do not edit
source here.
**Source:** `store-audit-2026-08-25.md` **S2**, queue row 12. Mapped against live source 2026-08-31
at HEAD `250ea4f`.

> **S2 cannot be done as one slice, and its stated precondition is false.** The audit says the six
> updaters are *"about 800 lines"* running *"the same nine-step spine"*, with differences that are
> *"small and parameterisable"*, and advises doing it *"one family at a time **behind the existing
> tests**."* Live: **855 lines**, **eight** divergence axes (§1.1), an **eleven**-step spine in at
> least one family — and **the existing tests do not exist** (§1.2). Three of the six updaters are
> called by no test at all.
>
> So this slice builds the net. **The extraction follows in slices 2–6** (§10), each mechanical and
> provable once the net is in place. Doing it the other way round is an 855-line blind refactor of
> the write path for every season-keyed family in the store.

**Working-tree note.** `store-audit-2026-08-25.md` is modified and uncommitted. **Do not stage,
commit, revert or edit it.** Nothing here touches it.

---

## 1. Verified facts

### 1.1 · Eight divergence axes, not "small and parameterisable"

| # | axis | split |
|---|---|---|
| 1 | **season cardinality** | `roster`, `advstats` are **single-season**; `schedule`, `gamelogs`, `teamcontext`, `oline` loop over `--all` |
| 2 | **last-checked marker** | **`roster` alone** writes `nflverse/last-checked-roster.json`, on *both* the identical and changed paths — 2 extra steps. None of the other five do |
| 3 | **force-gate vs dry-run order** | **`roster` gates force *before* the dry-run exit**; the other five exit dry-run first. So `roster --dry-run` on a changed past season **throws** where the others report a plan |
| 4 | **season adoption** | `season ?? year` (roster, advstats) · `parsed ?? season` (gamelogs) · bare `season` (schedule, teamcontext, oline). `teamcontext` additionally **asserts** — `aggregateTeamContext` throws on a CSV/requested-season mismatch, so the assertion travels with the *derive* function, not the spine |
| 5 | **injection seams** | `advstats`, `gamelogs` take `csv` + `currentSeason` (E5). **The other four take nothing** (§1.3) |
| 6 | **emitted envelope** | six different shapes: `players` · `unmapped, players` · `games` · `playerCount, unmapped, players` · `teamCount, teams` · **`source` (a literal string), `teamCount, stateCount, teams`** |
| 7 | **gates** | per-family `MIN_*` constants and per-family validators, each with its own signature |
| 8 | **test coverage** | §1.2 |

Axes 2 and 3 are both **roster**, which makes it the riskiest conversion and the one to do **last**.
The audit names only axis 4 (teamcontext, gamelogs) and calls the rest small.

### 1.2 · The "existing tests" are not there — this is the headline

| family | dedicated updater test | calls `updateX()` end-to-end |
|---|---|---|
| `roster` | **none** | **no test calls it** |
| `teamcontext` | **none** | **no test calls it** |
| `oline` | `test/oline.test.mjs` | **no** — parser only |
| `schedule` | `test/update-schedule.test.mjs` | **no** — it imports `gamesHash` and nothing else |
| `advstats` | — | yes, **dry-run path only** (`test/update-playerstats.test.mjs`, added by E5) |
| `gamelogs` | — | yes, **dry-run path only** (same file) |

Every other apparent hit is incidental: `args.test.mjs` tests `lib/args.mjs`, `deadman.test.mjs`
tests cron discovery, `manifest.test.mjs` reconciles the catalog, `nflverse.test.mjs` tests the
*parsers*, `stable-hash.test.mjs` is last slice's digest fixture.

**So the control-flow safety net for 855 lines of write-path logic is: two dry-run assertions.**
Not-published skip, sparsity-gate skip, dedup skip, force gate, write, manifest registration and
roster's marker are **entirely uncovered in all six**.

### 1.3 · Four of six cannot be tested at all today

```
roster       await fetchCurrentNflSeason(   await fetchRosterCsv(
schedule     await fetchCurrentNflSeason(   await fetchSchedulesCsv(
teamcontext  await fetchCurrentNflSeason(   await fetchPbpCsv(
oline        await fetchCurrentNflSeason(   await fetchDepthChartsCsv(
```

Direct calls, no seam. `updateRoster`, `updateSchedule`, `updateTeamContext` and `updateOline` take
only `{ year, all, dryRun, force }`. **A characterization test cannot run them without hitting the
network**, so the seams are a precondition for the net, which is a precondition for the extraction.

`advstats` and `gamelogs` have **half** the seam needed — `csv` and `currentSeason` from the E5
slice. That is *input* injection, and it is not enough.

**Every family reads its existing served file unseamed:**

```
roster:71   schedule:76   teamcontext:93   oline:102   advstats:107   gamelogs:131
  const existing = readJson(dataPath);
```

`readJson` resolves through `lib/io.mjs`'s hardcoded `repoPath()`. So the **force-gate** and
**dedup-hit** branches — two of §5's six rows, and the two most valuable to pin — cannot be reached
by injecting inputs at all. Neither can the **write path**, which calls `writeJsonStable` and
`updateManifestEntry` directly against the real tree.

**The seam that does reach them already exists in this repo.** `scripts/update-nfl.mjs` exports:

```js
export const DEFAULT_DEPS = {
  fetchCurrentNflSeason, fetchSeasonWeeks,
  readJson, writeJsonStable, updateManifestEntry, setManifestInProgress,
  diffSummary, setStepOutput,
};
```

That is *I/O* injection, and it is what a branch matrix needs. §3.1 uses it. An earlier draft of this
plan explicitly forbade it in favour of copying E5's `csv` seam — **that was wrong**, and it would
have produced a net that could only test two of six branches.

---

## 2. The decisions

### 2.1 · This slice is seams + net. No spine, no conversion.

Two commits:

1. **Seams** — give **all six** updaters a `deps = DEFAULT_DEPS` I/O surface, in the exact form
   `scripts/update-nfl.mjs` already uses. Behaviour-neutral: every existing caller is unchanged.
   advstats and gamelogs **keep** their `csv`/`currentSeason` parameters — those are production
   input injection used by the playerstats orchestrator, a different seam for a different job
   (§3.1).
2. **Net** — characterization tests pinning each of the six updaters' branch matrix (§5).

**Why no extraction here.** The net is what makes the extraction reviewable; landing both together
means the tests and the code they pin were written in the same breath, which is how a refactor
"proves" the behaviour it just changed. Splitting them means slices 2–6 each get a red/green signal
they can trust.

### 2.2 · Characterize, do not correct

Several divergences look like defects — roster's force-gate ordering (axis 3) most of all, since it
makes `--dry-run` throw where every sibling reports a plan. **Pin the current behaviour anyway,
including the parts that look wrong.**

A characterization test's job is to make a refactor detectable, not to improve the subject. Deciding
whether roster's ordering is a bug is a separate question with its own reasoning; folding it into
the net would mean the net encodes an opinion, and slice 2 could then "pass" while changing
behaviour the tests were written to permit.

**Record the candidates in §11 and leave them alone.**

### 2.3 · Alternatives rejected

| option | rejected because |
|---|---|
| Extract the spine now, tests after | §1.2 — 855 lines of write-path with two dry-run assertions under it |
| Extract + convert one family, net for that family only | Slices 3–6 then each need their own net-writing step anyway, and the cross-family divergence map (§1.1) is what makes the spine's parameters right — it is cheaper to see all six at once |
| Net without seams, mocking `globalThis.fetch` | Fragile and indirect: these call typed fetchers in `lib/nflverse.mjs`, not `fetch` directly. The seam is the pattern the repo already blessed three times |
| Fix roster's ordering while here | §2.2 — a correction hidden inside a net |
| Skip S2 | Legitimate — it is the largest remaining duplication and also the highest-risk. But the net in this slice is worth having even if the extraction never happens |

---

## 3. The edits

### 3.1 · One I/O seam, all six — the `update-nfl.mjs` pattern

Each of the six exports a `DEFAULT_DEPS` naming exactly the I/O it performs, and takes
`deps = {}` merged over it:

```js
export const DEFAULT_DEPS = {
  fetchCurrentNflSeason, fetchXCsv,          // the family's own fetcher
  readJson, writeJsonStable, updateManifestEntry, setStepOutput,
};

export async function updateX({ year = null, /* all, */ dryRun = false, force = false, deps = {} } = {}) {
  const d = { ...DEFAULT_DEPS, ...deps };
  …
}
```

Then every `readJson(`, `writeJsonStable(`, `updateManifestEntry(`, `setStepOutput(` and fetch call
inside becomes `d.…`. **This is a mechanical rename, not a restructure** — no branch moves.

**Three things this template must get right, which an earlier draft did not:**

1. **`roster` has no `all`.** `lib/args.mjs:14` — `ALL_SUBCOMMANDS = ['schedule', 'gamelogs',
   'teamcontext', 'oline']`. Roster and advstats are single-season and their signatures have no
   `all`. Do not add one.
2. **`advstats` and `gamelogs` keep `csv`/`currentSeason`** alongside `deps`. Those are used in
   production by `bin/update.mjs playerstats`; removing or folding them breaks the single-fetch
   orchestrator. They gain `deps`; they lose nothing.
3. **`schedule` is structurally different and its template differs.** `fetchSchedulesCsv()`
   (`lib/nflverse.mjs:871`) **takes no season argument**, is called **once before the season loop**,
   and **throws** on null rather than skipping — it fetches one combined `games.csv` and splits it
   by season. So schedule has **no "not published → skip" branch at all**, and an injected CSV for
   schedule means the whole combined file. Copying gamelogs' per-season form here is incoherent.

### 3.2 · No other source change

No spine, no shared helper, no envelope change, no gate reordering, no constant moved.

---

## 4. Step order

1. Add the `deps` seam to all six (§3.1) — mechanical `d.` rewrites, no branch moved. `npm test`
   must stay green with **no test edited**; advstats' and gamelogs' `csv`/`currentSeason` tests in
   particular must pass untouched.
2. **Verify the seams are inert against live behaviour**: for each of the six, run
   `node bin/update.mjs <family> --year <a completed season> --dry-run` before and after, and diff
   the output. Identical output is the evidence the seam changed nothing. For `oline`, use a season
   ≥ `MIN_OLINE_SEASON` — earlier years fail on a legacy-schema asset before reaching any branch
   this slice cares about.
3. Write the net (§5), one family at a time, **starting with `roster`** — it carries three of the
   eight divergence axes, so if the test shape can express roster it can express the rest.
4. Run the full suite. Record the new count.
5. **Prove the net actually bites**: temporarily invert one branch in one updater (e.g. swap
   roster's force gate and dry-run exit), confirm a test goes red, then revert. **A characterization
   suite that has never failed is not known to test anything.**
6. `npm test`, `npm run smoke`.
7. Two commits (seams, then net); `git -c rebase.autoStash=true pull --rebase origin main`; push.
   **No CDN purge.**

**Step 5 is the one that cannot be skipped.** It is the only step that distinguishes a net from a
set of assertions that happen to pass.

---

## 5. The net — a branch matrix, driven by `deps`

For each of the six, pin every reachable exit. **`deps` is what makes this possible**: inject
`readJson` to control what "already exists on disk" means, and capture `writeJsonStable` /
`updateManifestEntry` calls instead of performing them.

| branch | how it is driven | assertion |
|---|---|---|
| **not published** (fetch returns null) | **mock `globalThis.fetch`** — see below | returns cleanly, nothing written |
| **sparsity gate** (rowCount < `MIN_*`) | injected `csv` (advstats/gamelogs) or `deps.fetchXCsv` | returns cleanly, nothing written, logs the constant |
| **dedup hit** | `deps.readJson` returns content that hashes equal | no data-file write; **roster additionally writes its last-checked marker** (axis 2) |
| **force gate** | `deps.readJson` returns an existing file + a past season + no `--force` | **throws**; for roster, that this fires **before** the dry-run exit (axis 3) |
| **dry-run** | `dryRun: true` | nothing written; for the five non-roster families this is reached **even on a past season without `--force`** |
| **write path** | `deps.readJson` returns null | `deps.writeJsonStable` and `deps.updateManifestEntry` both called, with the family's own envelope fields (axis 6) |

**The "not published" branch cannot be driven by injection.** `csv: null` is indistinguishable from
"not injected" and falls through to a real fetch — the seam has no way to express "the fetch returned
null." Use the precedent already in the repo: `t.mock.method(globalThis, 'fetch', …)`, as
`test/update-playerstats.test.mjs` does. (This is *method* mocking, not module mocking — it needs no
experimental Node flag.) Alternatively inject `deps.fetchXCsv` returning `null`, which is cleaner
once `deps` exists; **pick one and use it consistently.**

**Two families need a different matrix:**

- **`schedule` has no not-published branch** — `fetchSchedulesCsv()` throws on null (§3.1). Pin the
  **throw**, not a clean return.
- **`roster` and `advstats` have no `--all` case.**

**Multi-season families get one extra case:** `--all` still fetches per season and **ignores an
injected `csv`**. That is the property `test/update-playerstats.test.mjs` actually pins for gamelogs
— by asserting the **fetch call count**, not by asserting anything about step outputs. (An earlier
draft of this plan attributed a step-output assertion to that file; it contains none.)

**No test may write into `nflverse/`, `nfl/`, or `manifest.json`** — with `deps` there is no reason
to, since the writers are injected.

## 6. Cross-repo impact

**Four entries fire on `Triggers`: CR-06, CR-08, CR-10 and CR-18** — the first three name
`scripts/update-roster.mjs`, `update-schedule.mjs` and `update-teamcontext.mjs` respectively; CR-18's
brace expansion `scripts/update-{…}.mjs` covers all six, `oline` and `advstats` included.

**CR-07 and CR-09 also fire** — they name `scripts/update-advstats.mjs` and
`scripts/update-gamelogs.mjs`, which gain `deps` under the revised §3.1. Their `Mirror` texts are
quoted in `advstats-grain-and-share.md` §6 and `playerstats-single-fetch.md` §6 respectively; **no
change is owed on either** for the same reason as the four below — no served shape, floor, field or
cadence moves. Re-quote them byte-exact at implementation time rather than copying from here.

**No change is owed on any of them.** Every one is about *shape, floor or stat-key* changes. This
slice adds two optional parameters and some tests: no served shape, no sparsity constant, no field,
no coverage, no cadence.

### CR-06 · roster / draft

> Shape or sparsity-constant changes land in both repos together. **`MIN_ROSTER_IDS` is declared twice** — `lib/nflverse.mjs:18` (data) and `src/api/nflRoster.js:38` (app) — with no shared source; editing one and not the other is the whole failure mode this entry exists for. The app has no live fallback for either family — it must get them from the store.

**No change owed.** `MIN_ROSTER_IDS` is read by the net, never modified.

### CR-08 · schedule

> Shape or floor changes land in both repos together. Read-only on the app side — not wired into projection/scoring. Rendered since dp-v2 Slice 4a (`dp/GameLogSection.jsx`) — a shape or floor change now breaks a visible surface, not just a silent loader. **Since D-1 (2026-08-24), `gameType`/`homeTeam`/`awayTeam` are also load-bearing data-side** — `scripts/update-nfl.mjs` reads this family (while `inProgress`) to derive each team's bye week(s) for `nfl/season-totals`; a missing schedule file degrades silently (no byes, no throw), but a `gameType`/`homeTeam`/`awayTeam` rename or reshape would silently stop byes from ever being written, with no validator to catch it (this family stays read-only/view-only on the app side regardless).

**No change owed.** Note this Mirror describes the same silent-degradation path the previous slice
hit from the sparse-checkout side — a reminder that `schedule`'s consumers are wider than its own
family, and a reason the net should pin `updateSchedule`'s write path precisely.

### CR-10 · teamcontext

> Shape or floor changes land in both repos together. **First TEAM-keyed family** — row identity is `(team, week)`, not `sleeper_id`; do not force it through player-keyed loader helpers. Per-week rates are single-game values: aggregate the `*Sum`/`*Plays` components, never sum or average stored rates. **`rushPlays` is a counting component, not a rate — safe to sum directly across weeks**, unlike its rate siblings. View-only on both sides. Team-key domain is CR-16.

**No change owed** — and *"do not force it through player-keyed loader helpers"* is a standing
warning aimed squarely at slices 2–6: the extracted spine must stay key-agnostic.

### CR-18 · signal registry / data-catalog

> This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

**No row edit owed.** No field, stat key, source or coverage changes. No `data-catalog.md` edit
either — refresh cadence and grain are untouched.

---

## 7. Done-definition

**Seams**
- [ ] `DEFAULT_DEPS` + `deps = {}` spread-merge on **all six**, matching `scripts/update-nfl.mjs`
- [ ] `deps` covers `readJson`, `writeJsonStable`, `updateManifestEntry`, `setStepOutput` and the
      family's fetchers — the force-gate, dedup and write branches are all reachable through it
- [ ] **`roster` did not gain an `all` parameter** (`ALL_SUBCOMMANDS` excludes it)
- [ ] **advstats and gamelogs kept `csv`/`currentSeason`** — the playerstats orchestrator still works
- [ ] `schedule`'s single pre-loop `fetchSchedulesCsv()` (no season arg, throws on null) is preserved
- [ ] `--all` still fetches per season in the four multi-season families
- [ ] `npm test` green with **no existing test edited**
- [ ] Dry-run output byte-identical before and after, for all six (§4 step 2)

**Net**
- [ ] Every branch in §5's matrix pinned for **all six** families
- [ ] roster's two extra behaviours pinned explicitly: the **last-checked marker on both paths**, and
      the **force gate firing before the dry-run exit**
- [ ] Each family's own envelope fields asserted on the write path (axis 6), including oline's
      literal `source`
- [ ] `teamcontext`'s derive-level season assertion pinned (axis 4)
- [ ] **`schedule`'s not-published branch pinned as a THROW**, not a clean return
- [ ] The not-published branch driven consistently (fetch mock or `deps.fetchXCsv` → null), not by
      `csv: null`, which is indistinguishable from "not injected"
- [ ] **No test writes into `nflverse/`, `nfl/`, or `manifest.json`**
- [ ] **The net was proven to bite** (§4 step 5) — one branch inverted, a test went red, reverted

**Boundaries**
- [ ] **No spine extracted, no shared helper added, no gate reordered, no envelope changed**
- [ ] Nothing in §11 acted on
- [ ] CR-06 / CR-08 / CR-10 / CR-18 `Mirror` texts emitted (§6); no registry text edited

**Both**
- [ ] `npm test` green (baseline **614** + new); `npm run smoke` green **or** failing only on the
      known CFBD 429, stated explicitly
- [ ] No served file, manifest, `schemaVersion`, or CDN purge
- [ ] `store-audit-2026-08-25.md` still modified-and-uncommitted, untouched

---

## 8. Settled decisions

- **Net before extraction** (§2.1) — the audit's "behind the existing tests" describes tests that do
  not exist.
- **Characterize, do not correct** (§2.2) — roster's ordering stays as-is; a net that encodes an
  opinion cannot detect a refactor that shares it.
- **Use `update-nfl.mjs`'s `DEFAULT_DEPS` I/O seam, not E5's `csv` input seam** (§1.3, §3.1) — the
  force-gate, dedup and write branches all go through `readJson`/`writeJsonStable`, which input
  injection cannot reach. advstats and gamelogs keep both seams; they serve different purposes.
- **Roster first in the net, last in the extraction** (§4 step 3, §10) — it carries three of the
  eight axes.
- **Prove the net bites** (§4 step 5) — an all-green characterization suite is unfalsified, not
  verified.

---

## 9. Invariant check

- **Invariant 1 (append-only)** — no data file written; the net must not touch served directories.
- **Invariant 3 (manifest is the index)** — `updateManifestEntry` is *asserted on*, never called for
  real by a test.
- **Invariant 4 (schemaVersion)** — nothing served changes.
- **Capture-only** — no ephemeral family is re-derived; the seams inject inputs, not history.

---

## 10. The rest of the program

| slice | family | why in this order |
|---|---|---|
| 2 | extract `runSeasonKeyedIngest` + convert **`schedule`** | shortest (104 lines), multi-season so the loop is in the spine from day one, standard gate order, no marker |
| 3 | `teamcontext` | multi-season, exercises the derive-level season assertion (axis 4) |
| 4 | `oline` | multi-season, exercises the richest envelope (axis 6) |
| 5 | `gamelogs`, then `advstats` | already seamed; single/multi pair sharing one CSV |
| 6 | **`roster`** | **last** — three axes (single-season, marker, gate order) |

Each conversion is one family, behind the net, with the branch matrix as the acceptance test.

---

## 11. Divergences that look like defects — recorded, not acted on (§2.2)

1. **`roster --dry-run` throws on a changed past season.** Its force gate precedes the dry-run exit;
   every sibling reports a plan instead. A dry run that can fail on a *past* season makes
   `--dry-run` unusable as a safe preview for exactly the case it is most wanted.
2. **Only roster keeps a last-checked marker.** `ktc`, `playerids` and `playerstate` also keep one,
   but the other five season-keyed families do not — so "when did we last confirm this family was
   unchanged?" is answerable for four of nine families and not the rest.
3. **Three season-adoption idioms across six families** (axis 4) for what is arguably one question:
   trust the parsed season, the requested one, or assert they agree. `teamcontext` asserts and is
   the only one that can catch a wrong-asset fetch.
4. **`oline`'s envelope carries a literal `source` string** no other family emits. Either it is
   useful provenance every family should carry, or it is a leftover.
