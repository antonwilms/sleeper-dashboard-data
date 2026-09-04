# S2, slice 3: convert `teamcontext`, and unpin three drifting fixtures

**Type:** one family converted + the helper's first signature change + three one-line fixture fixes.
**No served shape, no data, no manifest, no schemaVersion, no CDN purge, no behaviour change.**
**Session model:** plan (opus, this file). Implementation is a separate sonnet session — do not edit
source here.
**Source:** `season-ingest-extract.md` §10 (the program), plus the fixture defect found in slice 2's
verification. Designed against live source 2026-09-01 at HEAD `ea0356e`.

> **This slice changes `lib/seasonIngest.mjs`, and that is the plan working, not a failure.**
> `season-ingest-extract.md` §10.2 predicted the signature would need message builders when a
> per-season-fetch family arrived. It does — and the divergence is **wider than predicted**: not two
> log lines but **every one**, plus a different write/manifest/log interleaving (§1.2).

**Review note.** Skipped deliberately this round — see §12 for why, and for the one thing that
justification does *not* cover.

**Working-tree note.** `store-audit-2026-08-25.md` is modified and uncommitted. **Do not stage,
commit, revert or edit it.** Nothing here touches it.

---

## 1. Verified facts

### 1.1 · The net already pins teamcontext's full matrix

`test/update-teamcontext.test.mjs` — eight tests, all of which must pass **unedited**:

`fetchPbpCsv returns null → skipped` · `rowCount < MIN_TEAMCONTEXT_ROWS → skipped` ·
**`CSV season disagreeing with the requested season THROWS (wrong-asset guard)`** · `dedup hit` ·
`--dry-run on a changed past season … does not throw` · `force gate throws` ·
`write path … teamcontext's own envelope` · `--all fetches once per season in range`

The wrong-asset guard lives inside `aggregateTeamContext`, which this slice passes as `derive` —
**so it travels with the callback and needs no helper support.** That is the axis-4 divergence
(`season-ingest-net.md` §1.1) resolving itself for free.

### 1.2 · Every log differs, and so does the write/manifest interleaving

Line-by-line against `schedule`:

| | `schedule` | `teamcontext` |
|---|---|---|
| per-season preamble | — | `season=<n> \| currentSeason=<m>` |
| fetch | outside the loop | `Fetching play_by_play_<n>.csv.gz…` inside |
| not published | `season <n> not published yet — skipping` | `season=<n> not published yet — skipping` |
| after derive | — | `Derived <r> team-game rows for season <n>` |
| sparsity | `season <n> only <r> games (< <MIN>) — preliminary, skipping` | `season=<n> only <r> team-game rows (< MIN_TEAMCONTEXT_ROWS=<MIN>) — treating as preliminary/partial, skipping` |
| after validate | — | `Validation passed` |
| dedup | `season <n>: identical to <path> — no change.` | `Content identical to existing <path> — no change.` |
| dry-run | one count | **two counts** (`<r> team-game rows, <t> teams`) |
| force gate | `<path> **exists** for completed season <n>.` | `<path> **already exists** for completed season <n>.` |
| **write → manifest → log** | write, manifest, **one** log: `Wrote <path> (<n> games) + manifest` | write, **log** `Wrote <path> (<r> team-game rows, <t> teams)`, manifest, **log** `Manifest updated` |

**Not one line matches.** The last row is the structural one: the helper's steps 7–9 are
`write → manifest → log`; teamcontext is `write → log → manifest → log`. A `minRowsLabel` swap
cannot express any of this.

### 1.3 · Three fixture baselines are still pinned to weekly-rewritten files

Slice 2's verification found `test/fixtures/hash-baseline.json` pinning digests against mutable
files. `ea0356e` fixed **roster only**. Measured by rewrite history, not filename:

| entry | file | rewrites (120d) | next scheduled rewrite |
|---|---|---|---|
| `gamesHash` | `nflverse/schedule/2026.json` | **11** | Fri `35 13 * * 5` |
| `idsHash` | `nflverse/playerids.json` | **9** | Wed `29 13 * * 3` |
| `olineTeamsHash` | `nflverse/oline/2026.json` | **7** | Sat `37 14 * * 6` |

**All three fire within a week.** Roster went first only because Tuesday came first. The other eight
entries point at completed seasons or dated snapshots — immutable under Invariant 1.

---

## 2. The decisions

### 2.1 · The helper stops owning log text

Add a `messages` object supplying the **six** strings tied to the helper's own branches. Everything
else moves into the caller's existing callbacks, where it already belongs:

```js
messages: {
  notPublished:  (season) => string,
  sparsity:      (season, rowCount) => string,
  dedup:         (season, path) => string,
  dryRun:        (season, path, derived, needsForce) => string,
  forceGate:     (season, path) => string,        // the throw message
  afterWrite:    (season, path, derived) => string | null,   // null = log nothing here
  afterManifest: (season, path, derived) => string | null,
}
```

- **`schedule`**: `afterWrite: null`, `afterManifest: … 'Wrote <path> (<n> games) + manifest'`
- **`teamcontext`**: `afterWrite: … 'Wrote <path> (<r> team-game rows, <t> teams)'`,
  `afterManifest: … 'Manifest updated'`

That pair of hooks reproduces both interleavings exactly (§1.2's last row) without the helper knowing
either family exists.

**Everything else stays in the caller.** The preamble and fetch logs go in `derive`; the
`Derived <r> rows` log goes in `derive`; `Validation passed` goes in the `validate` callback, which
already wraps `validateTeamContext`. No new hook needed for any of them.

**`minRowsLabel` is deleted.** It was schedule-shaped and its only consumer is now
`messages.sparsity`.

### 2.2 · Fix all three fixtures, not just the one that fired

Re-point each at an immutable source, digest recaptured from the current implementation:

| entry | from | to |
|---|---|---|
| `gamesHash` | `nflverse/schedule/2026.json` | `nflverse/schedule/2023.json` |
| `olineTeamsHash` | `nflverse/oline/2026.json` | `nflverse/oline/2025.json` |
| `idsHash` | `nflverse/playerids.json` | **see below** |

**`playerids.json` has no immutable version** — it is a single crosswalk file refreshed weekly, not
season-keyed. Two honest options; **take (a)**:

- **(a) Drop the `idsHash` entry and its test.** The digest cannot be stable, and a test that must be
  regenerated on a schedule is not a test. Its loss is small: `idsHash` is shape A, byte-identical
  to six siblings that remain pinned.
- (b) Keep it and regenerate weekly — rejected; a self-updating expectation asserts nothing.

### 2.3 · Rename the roster test to say what it now proves

`ea0356e` recaptured roster's digest from the **current** implementation — the pre-refactor function
was deleted in `250ea4f`. So that entry is a change-detector, not a pre-refactor baseline, while its
test is still named `roster playersHash matches the pre-refactor baseline digest`, alongside eleven
siblings for which the claim holds.

**Rename it** to say it pins current behaviour. Same for `gamesHash` and `olineTeamsHash` once
re-pointed (§2.2) — their digests are also recaptured, not original.

**This is a real, if small, loss of evidence and should be labelled rather than smoothed over.** The
original verification did happen and passed on all twelve; what is gone is repeatability for three
of them.

### 2.4 · Alternatives rejected

| option | rejected because |
|---|---|
| Keep `minRowsLabel`, add only a sparsity builder | §1.2 — every line differs, not one |
| Let teamcontext's log order change to match the helper | Operator-facing output is behaviour (`season-ingest-extract.md` §2.2 step 9) |
| A single `log(event, ctx)` callback instead of seven builders | Turns six typed strings into a stringly-typed switch in every caller |
| Fix only the fixture that fired | §1.3 — three more fire within the week |
| Regenerate `idsHash` weekly | §2.2 — an expectation that updates itself asserts nothing |

---

## 3. The edits

### 3.1 · `lib/seasonIngest.mjs`

Replace the six hard-coded log/throw templates with `messages` lookups (§2.1). Split step 9 into
`afterWrite` (between write and manifest) and `afterManifest`. Delete `minRowsLabel`. **No change to
the branch order or the gate logic** — steps 1–8 keep their sequence exactly.

### 3.2 · `scripts/update-schedule.mjs`

Add a `messages` object reproducing its current six strings **byte-for-byte**, with
`afterWrite: () => null`. **No other change.** Its ten tests must stay green throughout — they are
the regression guard for the signature change.

### 3.3 · `scripts/update-teamcontext.mjs`

Replace the `for (const season of seasons)` body with one `runSeasonKeyedIngest` call. Keep
unchanged: the module header, `teamsHash`, `DEFAULT_DEPS`, the signature, season resolution, the
`if (!all) d.setStepOutput(…)` line. `derive` performs the preamble log, the fetch, the null check's
*return value* (`null`), `aggregateTeamContext` — which carries the wrong-asset throw (§1.1) — and
the `Derived …` log. `validate` wraps `validateTeamContext` plus its `Validation passed` log.

### 3.4 · `test/fixtures/hash-baseline.json` and `test/stable-hash.test.mjs`

§2.2's re-points and the `idsHash` removal; §2.3's renames.

---

## 4. Step order

1. **Fixtures first** (§3.4) — they are independent, and doing them first means a green baseline for
   everything after. `npm test` → **661** (662 − the dropped `idsHash` test).
2. Change the helper's signature (§3.1). `schedule` will not compile against it yet.
3. Update `schedule`'s call site (§3.2). **Run its ten tests — all must pass unedited.** This is the
   proof the signature change is behaviour-preserving for the already-converted family.
4. Convert `teamcontext` (§3.3). **Run its eight tests — all must pass unedited.**
5. **Byte-diff the live output** for both families, before and after:
   `schedule --year 2023 --dry-run`, `schedule --all --dry-run`,
   `teamcontext --year 2023 --dry-run`. Byte-identical.
6. `npm test` → **661**. `npm run smoke`.
7. Commit; `git -c rebase.autoStash=true pull --rebase origin main`; push. **No CDN purge.**

**Step 3 before step 4.** If the signature change breaks schedule, that must surface before a second
family is built on it.

---

## 5. Tests

**No tests added.** The nets for both families already exist and are the acceptance criteria. One
test is **removed** (`idsHash`, §2.2) and three are **renamed** (§2.3).

If the conversion tempts you to add a test, the extraction changed something the net does not cover
— **report it rather than covering it**.

---

## 6. Cross-repo impact

**Two entries fire: CR-10 and CR-18.** CR-10 names `scripts/update-teamcontext.mjs`; CR-18's brace
expansion covers it. `lib/seasonIngest.mjs` and everything under `test/` are named by no entry.

**No change owed on either.** No served shape, floor, field, coverage or cadence moves.

### CR-10 · teamcontext

> Shape or floor changes land in both repos together. **First TEAM-keyed family** — row identity is `(team, week)`, not `sleeper_id`; do not force it through player-keyed loader helpers. Per-week rates are single-game values: aggregate the `*Sum`/`*Plays` components, never sum or average stored rates. **`rushPlays` is a counting component, not a rate — safe to sum directly across weeks**, unlike its rate siblings. View-only on both sides. Team-key domain is CR-16.

***"Do not force it through player-keyed loader helpers"* is aimed exactly at this slice.**
`runSeasonKeyedIngest` is key-agnostic by construction — it never inspects the derived value, only
counts it via `rowCount` and hands it to `hash`, `envelope` and `manifestRecordCount`. **Keep it
that way**: no helper code may assume `players`, `sleeper_id`, or any row identity.

### CR-18 · signal registry / data-catalog

> This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

**No row edit owed.**

---

## 7. Done-definition

**Helper**
- [ ] `messages` object with all seven builders; `minRowsLabel` **deleted**
- [ ] Step 9 split into `afterWrite` and `afterManifest`, so both interleavings are expressible
- [ ] **Branch order and gate logic unchanged** — steps 1–8 identical to slice 2
- [ ] Helper still imports **nothing** and remains key-agnostic (CR-10, §6)

**schedule (regression)**
- [ ] `messages` reproduces its six strings byte-for-byte; `afterWrite` returns null
- [ ] **All ten tests pass unedited**

**teamcontext**
- [ ] Only the loop body replaced; header, `teamsHash`, `DEFAULT_DEPS`, signature, season
      resolution and `setStepOutput` unchanged
- [ ] Preamble, fetch, `Derived …` logs live in `derive`; `Validation passed` in `validate`
- [ ] Wrong-asset throw still fires from `aggregateTeamContext` inside `derive`
- [ ] **All eight tests pass unedited**
- [ ] Write/manifest/log interleaving preserved: `write → Wrote… → manifest → Manifest updated`

**Fixtures**
- [ ] `gamesHash` → `schedule/2023`, `olineTeamsHash` → `oline/2025`, both digests recaptured
- [ ] `idsHash` entry **and its test removed**
- [ ] Three renamed tests say they pin **current behaviour**, not a pre-refactor baseline
- [ ] No baseline entry points at a file with >4 rewrites in 120 days

**Verification**
- [ ] Live byte-diff clean for all three commands (§4 step 5)
- [ ] `npm test` = **661**; `npm run smoke` green or the known CFBD 429, stated
- [ ] CR-10 / CR-18 Mirrors emitted; **no registry text edited**
- [ ] `store-audit-2026-08-25.md` still modified-and-uncommitted, untouched

---

## 8. Settled decisions

- **Helper stops owning log text** (§2.1) — every line differs across families.
- **Two post-write hooks, not one** (§2.1) — the interleaving differs structurally.
- **Non-branch logs live in the caller's callbacks** (§2.1) — no hook needed for them.
- **All three fixtures fixed, `idsHash` dropped** (§2.2) — a weekly-regenerated expectation asserts
  nothing.
- **Recaptured digests get renamed tests** (§2.3) — label the evidence loss.
- **schedule's ten tests are the signature-change guard** (§4 step 3) — run before teamcontext.

---

## 9. Invariant check

- **Invariant 1 (append-only)** — the fixtures now point only at files that invariant protects; that
  is the actual fix, not a workaround.
- **Invariant 3 (manifest is the index)** — write and manifest stay adjacent in the helper, with
  only a log between them for teamcontext.
- **Invariant 4 (schemaVersion)** — unchanged, still hard-coded.

---

## 10. Program status

| slice | family | state |
|---|---|---|
| 1 | seams + net (all six) | done `7b47754` `22cb899` |
| 2 | extract helper + `schedule` | done `10e8f8d` |
| **3** | **`teamcontext`** + fixtures | **this** |
| 4 | `oline` | richest envelope |
| 5 | `gamelogs`, `advstats` | already seamed; share one CSV |
| 6 | `roster` | **last** — `season-ingest-extract.md` §10.1/§10.3 |

---

## 11. Out-of-scope observations (not edits)

1. **`roster`'s two extra writes remain the program's hardest problem** — the last-checked marker on
   both the dedup and post-write branches. §2.1's `afterWrite`/`afterManifest` hooks help but do not
   solve the dedup-branch write, which the helper still models as a pure `continue`.
2. **`playerids` will never have a stable digest fixture** (§2.2). If content-hash regression cover
   is wanted there, it needs a different mechanism — a property test rather than a pinned digest.
3. **Four slices in, the helper owns only control flow and gate ordering.** That is a smaller win
   than the audit's "800 → 250" implies, and it is the right one: the divergences that caused the
   original problem were all in ordering and gating, never in the logs.

---

## 12. Why no reviewer this round

`season-ingest-net.md` built the net specifically so later slices need less external verification,
and this is the first slice where that pays out. Both failure modes have automated acceptance
criteria that did not come from this session: **schedule's ten tests** catch a signature change that
breaks the converted family, and **teamcontext's eight** catch a conversion that changes behaviour.
The divergence analysis a reviewer would perform (§1.2) is in this plan, done line-by-line against
live source.

**What that does not cover: log text.** `spyDeps` captures no console output
(`season-ingest-extract.md` §2.2 step 9), so every string in §1.2's table is unasserted. §4 step 5's
byte-diff is the only guard, and it is a manual one. **If the byte-diff is skipped, this slice has no
verification of the thing it changes most.**
