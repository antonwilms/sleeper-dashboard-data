# Manifest truth — the manifest agrees with what is on disk

**Type:** one regression fix + one one-shot manifest backfill + one ingest run + a guard test.
**Session model:** plan (opus, this file). Implementation is a separate sonnet session — do not edit
source here.
**Sources:** D-5 (`data-repo-backlog.md`, app repo), C5 / C7 / Monitoring (`store-audit-2026-08-25.md`).
Every claim below was **re-verified against live source on 2026-08-29** at data HEAD `2d0f951`,
app HEAD `e32ad7c`.

**The defect class.** Four items, one failure mode: *the manifest says something the disk does not
support.* D-5 leaves a completed season flagged in-progress; C5 leaves 38 entries with no
`lastModified` and 3 completed seasons flagged in-progress; C7 leaves a family's coverage claim
unbacked by a file. Item 4 is the guard that makes the last two unable to recur, and — by an
addition this plan makes — the first one detectable.

**Working-tree note.** `store-audit-2026-08-25.md` is modified and uncommitted in the data repo.
**Do not stage, commit, revert or edit it.** Nothing in this slice touches it. Both repos are
otherwise clean; the app-repo `in-season-app-read.md` §3 work referenced in the brief has already
landed (`e0850b8`).

---

## 1. Verified facts

### 1.1 · D-5 — confirmed, and the mechanism is sharper than recorded

| Claim | Live | Verdict |
|---|---|---|
| `shouldSkipCompletedSeason` returns before `updateManifestEntry` | guard `if` at `scripts/update-nfl.mjs:85`, `return` at `:90`; `d.updateManifestEntry({` at `:148` | **confirmed** |
| A closed season keeps `inProgress: true` | see mechanism below | **confirmed, latent** |
| App falls back to the live-API loop | `dataStore.js:81` `if (entry.inProgress && !allowInProgress) return null;`; the careerStats read at `sleeperStats.js:147` passes **no** `allowInProgress` | **confirmed** |

**Not yet manifested.** All 14 `nfl/season-totals/*` entries currently read `inProgress: false`,
2025 included — F-24's migration (`2b06c5b`, 2026-08-24) sealed them outside `update-nfl.mjs`. D-5 is
**latent**; it fires at the next season rollover.

**The mechanism, precisely — this changes the fix.** The backlog says "once a season closes every
subsequent run skips early." That is not what happens, and the difference matters:

- The workflow runs `node bin/update.mjs nfl` with **no `--year`** (`nfl-season-totals.yml:35`).
- `update-nfl.mjs:75` resolves `year = yearOpt ?? currentSeason`, so on the scheduled path
  `year === currentSeason` **always**, hence `inProgress = year >= currentSeason` is **always true**,
  hence `shouldSkipCompletedSeason` is **never reached on the scheduled path**.
- At rollover the scheduled path simply *moves to the new season*. The season that just closed is
  **never revisited by any automatic path**, so its `inProgress: true` persists.
- The only route back to it is a manual `node bin/update.mjs nfl --year <closed>` — and *that* is the
  path that returns at `:90` before the manifest write.

So the early return is the **second** half of the defect. The first half is that nothing revisits the
closed season at all. **Sealing on the skip path therefore does not make sealing automatic** — it only
makes the manual correction work. That is why §2.4 adds a second call site on the scheduled path
rather than relying on the skip path alone.

**One claim corrected.** The brief says the fallback is "on the wrong scoring basis." The backlog's
own wording — a *mixed*-basis corpus — is the accurate one, and the direction is the reverse of
"wrong":

- Live path: `sleeperStats.js:199` computes `calculateFantasyPoints(stats, scoringSettings)` — the
  **league's own** basis.
- Store path: every stored row carries `scoringBasis: "half_ppr"` (verified: 2832/2832 rows in 2025).
- The app has **no non-fixture reader of `scoringBasis`** (swept `src/`, hits are fixtures only).

So the affected season is served in the league basis while every other season is served half_ppr,
inside one `careerStats` corpus, with nothing able to detect the seam. That is a real correctness
problem and it is worth fixing — but it is a *basis inconsistency*, not a wrong basis, and for a
non-half-PPR league the fallback season is the *more* league-accurate one. Do not restate it as
"wrong basis" in the commit message.

### 1.2 · C5 — confirmed unchanged at HEAD

- **38** entries carry no `lastModified`: **14** `raw/*` + **24** `college/*` (2017–2024). Total
  entries 188.
- `college/{passing,receiving,rushing}/2024.json` are still `inProgress: true`; the 2025 trio is
  correctly `false` with real timestamps.
- The comparison at `src/api/cfbd.js:48` is as the audit describes:
  `new Date(entry.lastModified).getTime() > new Date(record.sourceLastModified).getTime()` —
  `undefined` → `NaN > x` → `false` → the `else` branch returns the cached copy.
  **But do not claim that branch is currently reached.** It requires a truthy
  `record.sourceLastModified`, and `cfbd.js:64-65` stores `entry?.lastModified ?? null` while `:45`
  treats falsy as "fall through to data store" — so an entry cached while `lastModified` was absent
  would already be falling through. Whether any client sits in the stale-forever state is not
  observable from this repo. **C5's justification is Invariant 3 + §5.4's guard, not this app-side
  path** — see §8's CR-04 note.
- **All 38 files share one git commit date**: `2026-05-18T16:05:14+02:00` (one initial-import
  commit; 38/38 resolved, none unresolved). UTC-normalized: **`2026-05-18T14:05:14.000Z`**.

### 1.3 · C7 — confirmed unchanged at HEAD

- `nflverse/oline/` holds **only** `2026.json`; the manifest holds only `nflverse/oline/2026.json`.
- `data-catalog.md:~197` claims **"Coverage: 2025 → present (`MIN_OLINE_SEASON`)"**.
- `node bin/update.mjs oline --year 2025 --dry-run` passes: **14,368 ol rows, 1,056 states, 32 teams**.

### 1.4 · Backlog claims — one is already done, and a second item is in the same state

- `02cf41d` = `fix: validateKtc asserts a floor on draft-pick rows (D-4)` — **confirmed**.
- `2b06c5b` = `feat: F-24 stat-key prune + D-1 forward bye inference` — **confirmed**.
- D-1 forward-only behaviour **confirmed**: 2025 `weeklyStatus` is `P`/`X`/`D` only (25,946 / 9,927 /
  14,527) and `byeWeeks` is `0` for all 2,800 non-`TEAM_` rows. Correct under Invariant 1 — 2025 was
  already complete when D-1 landed.
- **D-4 is already annotated `✅ RESOLVED 2026-08-24 — data repo 02cf41d`** in the backlog. It is not
  un-struck; it is *struck but still filed under `## Open`*, while `## Done` reads
  *"(none yet — struck-through items move here with their data-repo commit)"*.
- **D-3 is in the identical state** — annotated `✅ RESOLVED 2026-08-24`, still under `## Open`. The
  brief does not mention it. §6 handles both, since the correction is the same one.

---

## 2. D-5 — seal the flag, at two call sites

### 2.1 · Why `updateManifestEntry` cannot be used

`lib/manifest.mjs:34` unconditionally writes `lastModified: new Date().toISOString()` and requires
`recordCount`. On the skip path the data file has not been read (`readJson(dataPath)` is at `:93`,
after the return), and — more importantly — **the served file has not changed**, so stamping a new
`lastModified` would be a false statement in a field Invariant 3 treats as a public API, and would
trigger a pointless refetch of that season for every client.

### 2.2 · New helper in `lib/manifest.mjs`

```js
/**
 * Flips an existing entry's `inProgress` without touching any other field.
 * Metadata-only: `lastModified`, `recordCount` and `schemaVersion` are preserved,
 * because the served file itself has not changed. No-ops (no write) when the entry
 * is absent or already at the requested value, so a repeated run produces no diff.
 * @returns {boolean} true if the manifest was written
 */
export function setManifestInProgress({ path, inProgress }) { … }
```

Contract, all four load-bearing:

1. **No-op when already correct** — returns `false` without writing. The weekly job must not produce
   an empty commit on every run.
2. **No-op when the entry is absent** — returns `false`; never creates a partial entry.
3. **Preserves `lastModified`/`recordCount`/`schemaVersion`** and any legacy fields (`originalKey`),
   same spread-preserve behaviour as `updateManifestEntry`.
4. **Still bumps the manifest's top-level `generatedAt`** when it writes — consistent with
   `updateManifestEntry`.

### 2.3 · Call site

Inside the `shouldSkipCompletedSeason` branch at `scripts/update-nfl.mjs:85-90`, **before** the
`return` at `:90`: call `d.setManifestInProgress({ path: \`nfl/season-totals/${year}.json\`, inProgress: false })`
and log only when it wrote. Add `setManifestInProgress` to `DEFAULT_DEPS` (`:46`) so it is injectable
and control-flow-testable the way `updateManifestEntry` already is.

### 2.3b · The existing tests must stub the new dep — this is a live hazard, not hygiene

`test/update-nfl.test.mjs` has **three** `deps: { … }` blocks (`:106`, `:147`, `:179`). Because
`updateNfl` merges `{ ...DEFAULT_DEPS, ...deps }` (`:70`), any dep a test does not stub resolves to
the **real** implementation. The block at `:140-160` exercises exactly the skip path — `year: 2026`
with `fetchCurrentNflSeason: async () => 2027`, commented *"year (2026) has rolled off current — the
flip"*.

So after §2.3, that test calls the **real** `setManifestInProgress` against the **real**
`manifest.json`. It is inert today only because `nfl/season-totals/2026.json` has no entry yet
(§2.2 contract 2 no-ops). From the first in-season run that entry exists with `inProgress: true`, and
every `npm test` would seal the live in-progress season to `false` — which is precisely the CR-21
failure mode: a half-season served as a complete one.

**Required, all three:**

1. Stub `setManifestInProgress` in **all three** existing deps blocks.
2. The skip-path test (`:140`) asserts it was called **exactly once** with
   `{ path: 'nfl/season-totals/2026.json', inProgress: false }`; the other two assert zero calls.
3. Done-definition gains a hard check: `npm test` must leave `manifest.json` **byte-identical**
   (`git diff --quiet manifest.json` after the run). This catches the same class of leak for any dep
   added later, not just this one.

### 2.4 · The two decisions the brief asks for — plus one it surfaces

**`--dry-run`: the seal must not run, and it already cannot.** `shouldSkipCompletedSeason` is
`!inProgress && !force && !dryRun`, so with `dryRun: true` the guard returns `false` and the branch is
never entered. **No extra condition is needed** — the exemption is structural. Because it is
structural rather than explicit, it is exactly the kind of property a later refactor breaks silently,
so §5.3 adds a test that pins it.

**CDN purge: `manifest.json` only.** No data file is written. Do not purge the season file — its
bytes are unchanged, and purging it would evict a valid CDN copy for no reason.

**The seal is not automatic (§1.1), so the scheduled path seals the prior season too.** The skip path
is unreachable from the scheduled job, so a skip-path-only fix repairs the manual correction route and
nothing else. Two candidates were considered:

- **(A) — considered, rejected.** Skip-path seal only, with the §5.2 test as the tripwire that tells
  you to run `node bin/update.mjs nfl --year <closed season>` by hand.
- **(B) — implemented.** The scheduled path *additionally* seals `year - 1` when that entry still
  reads `inProgress: true`.

**Why (A) was rejected.** Review established that the §5.2 tripwire **does not fire when the defect
appears**. Walk the clock: 2026 closes, the flag stays `true`; the manifest's max season-totals year
is still 2026, so "every year strictly below the max is sealed" is still satisfied and the test stays
**green**. It only reddens once `2027.json` enters the manifest — and `hasNoData`
(`scripts/update-nfl.mjs:101-104`) means the preseason runs write nothing, so that is ~Sept 2027.
That is roughly seven months of the exact silent live-API fallback D-5 exists to prevent, with no
signal. A tripwire that fires two-thirds of a year after the event is not a control.

**(B)'s cost is small and bounded.** It is the same `setManifestInProgress` helper at a second call
site, it no-ops (§2.2 contract 1: no write, no commit) on every run except the one immediately after
a rollover, and it only ever touches `year - 1` — never an arbitrary historical season.

**Second call site.** After `year` is resolved (`scripts/update-nfl.mjs:75`) and before the fetch,
when `inProgress` is `true` (i.e. the normal scheduled case): call `setManifestInProgress` for
`nfl/season-totals/${year - 1}.json` with `inProgress: false`. Guard it with `!dryRun` — this one is
**not** structurally exempt the way §2.3's is, because it does not sit behind
`shouldSkipCompletedSeason`. Test both branches.

Both call sites keep the skip-path seal from §2.3 — (B) is additive, not a replacement. The manual
`--year <closed>` route must still work, because it is the correction path when the scheduled job has
been failing.

---

## 3. C5 — backfill `lastModified`, unflag college 2024

### 3.1 · One-shot migration script

`updateManifestEntry` stamps *now* (§2.1), so it cannot write a historical value. New
**`scripts/migrate-manifest-truth.mjs`**, `--dry-run` supported, run once and kept in the tree as the
record of what was done.

**Follow `scripts/migrate-f24-prune.mjs` for structure only — not for its manifest write.** That
script registers through `updateManifestEntry` (`:28` import, `:102` call), which is the exact call
ruled out here. This script must mutate the manifest object **directly**: `readManifest()`, edit the
entries in place, `writeJsonStable('manifest.json', manifest)`. What carries over from the precedent
is the shape — one-shot, `--dry-run`, explicit before/after guards, left in the tree.

**The 38 entries are missing `schemaVersion` too — both fields must be written.** Verified: all 38
share the identical key set `{originalKey, recordCount, inProgress}`. An earlier draft of this plan
took the audit's "no `lastModified`" at face value and would have left §5.4 red on all 38 while its
own guard forbade the fix.

**What it writes:**

| Target | Change |
|---|---|
| 38 entries (14 `raw/*`, 24 `college/*`) | set `lastModified: "2026-05-18T14:05:14.000Z"` |
| the same 38 entries | set `schemaVersion: 1` |
| `college/{passing,receiving,rushing}/2024.json` | `inProgress: true → false` |

`schemaVersion: 1` is the correct value on both grounds: it matches the correctly-formed siblings
(`college/*/2025.json` all carry `schemaVersion: 1`) and it is `updateManifestEntry`'s own default.

**Guards the script must enforce:**

- Entry count unchanged at **188** before and after; no entry created or removed.
- **No entry that already has a `lastModified` is touched** — select strictly on falsy `lastModified`.
- No field other than `lastModified`, `schemaVersion` (and `inProgress` on the three named college
  entries) is written; `recordCount` and `originalKey` preserved byte-for-byte.
- `python3 -m json.tool manifest.json` parses afterwards.

### 3.1b · Invariant 3 reaches the 24, not the 38 — backfill all 38 anyway

Invariant 3 binds **script-written** files. The 24 `college/*` entries are script-written
(`scripts/update-cfbd.mjs`) and are squarely in scope. The 14 `raw/*` files are **not** script-written
— verified: the only `raw/` reference in `lib/`/`scripts/`/`bin/` is
`scripts/update-enrichment.mjs:50,89` *reading* `-players-nfl.json`; nothing writes any `raw/` file
(the same finding `retire-raw-stats.md` established). So Invariant 3 does not require these four
fields on them.

**Backfill all 38 regardless.** Writing two fields on 14 legacy entries costs nothing and lets §5.4
assert over **every** entry with no prefix exemption. A whole-prefix carve-out in the guard is a
permanent hole; this is a one-time write. The distinction is recorded here so the *reasoning* is
right even though the action is the same.

### 3.2 · Backfill all 38, including the eight E1 will delete

Audit item E1 (a later slice) deletes `raw/cfbd-players-*.json` and their entries. Backfilling those
eight now is eight lines of wasted work — and it is still the right call: §5.1's field-completeness
assertion applies to **every** entry, and exempting `raw/` to avoid the waste would put a permanent
hole in the guard to save a one-time cost. Backfill all 38; E1 removes eight of them wholesale.

### 3.2b · The college-2024 flip arms a live refusal — intended, recorded

`scripts/update-cfbd.mjs:69` refuses to overwrite a completed file:
`if (existingEntry && !existingEntry.inProgress && !force)` → error, exit 1. After the flip,
`node bin/update.mjs cfbd --year 2024` will refuse without `--force`.

**That is the point of sealing a completed season**, not a side effect to work around — 2024 college
is complete and should not be silently re-exported. Recorded because it is a live behaviour change
that this plan otherwise describes as metadata-only, and because anyone re-running 2024 afterwards
will hit it and needs to know it was deliberate.

### 3.3 · Honest about what this value is

All 38 share one timestamp because they arrived in one import commit. `lastModified` therefore
carries no per-file information for these rows — it means *"entered the repo on 2026-05-18"*. That is
sufficient for its only consumer (`cfbd.js:48` needs a valid date strictly older than any future
refresh) and it is honest. Do not fabricate per-file variation to make it look more precise.

---

## 4. C7 — run the command, then the follow-through

**This is a command, not a plan.** The follow-through is the planned part.

1. `node bin/update.mjs oline --year 2025` — writes `nflverse/oline/2025.json` and registers it via
   the script's own `updateManifestEntry` call. Expect **14,368 ol rows, 1,056 states, 32 teams**.
2. **No `data-catalog.md` coverage edit is owed.** The row already claims "2025 → present"; the run
   makes the claim true. Confirm, do not rewrite.
3. **`data-catalog.md`'s reconcile output block does need refreshing** — it is dated `(2026-07-04)`
   and lists four families. §5.4 replaces that section.
4. Commit, then purge jsDelivr: **`manifest.json` first, then `nflverse/oline/2025.json`.**
5. Ordering: this must land **before** §5.1's contiguity assertion, or that test lands red. See §7.

---

## 5. The guard — `test/manifest.test.mjs`

Extend the existing file (two `raw/stats-` tests already there; keep both). All new tests must be
**network-free** — `npm test` runs in ~1.1 s and is wired into `smoke-test.yml`.

### 5.1 · Coverage — contiguity from the family floor

**Deviation from the audit, deliberate.** The audit specifies `[MIN_*_SEASON … currentSeason − 1]`.
`currentSeason` comes from `fetchCurrentNflSeason()`, which is a **live Sleeper API call** — not
permissible in this suite. Replace it with a formulation that needs no upper bound:

> For each season-keyed family, the set of years present must be **contiguous from its floor to its
> own maximum**. A gap is a failure; a family simply not having reached year N yet is not.

This catches C7 exactly — oline floor 2025, present `{2026}`, gap at 2025 — and is red **only** on
oline today (verified against live manifest across all seven families). It also handles the
documented holes correctly without an exception list: **roster 2012–2015 is below the floor, not a
gap inside the range**, so a floor of 2016 excludes it by construction.

Family → floor table — **ten families, not seven**:

| Family | Floor | Source |
|---|---|---|
| `nflverse/schedule` | 1999 | import `MIN_SCHEDULE_SEASON` |
| `nflverse/gamelogs` | 2012 | import `MIN_GAMELOG_SEASON` |
| `nflverse/teamcontext` | 2012 | import `MIN_TEAMCONTEXT_SEASON` |
| `nflverse/oline` | 2025 | import `MIN_OLINE_SEASON` |
| `nflverse/advstats` | 2012 | local table (`data-catalog.md` coverage row) |
| `nflverse/roster` | 2016 | local table — 2012–2015 exist upstream but fail `MIN_ROSTER_IDS` |
| `nfl/season-totals` | 2012 | local table (`data-catalog.md:37`) |
| `college/passing` | 2017 | local table (`data-catalog.md:51`) |
| `college/receiving` | 2017 | local table |
| `college/rushing` | 2017 | local table |

**Do not add the three `MIN_*_SEASON` constants an earlier draft proposed.** Review rejected them on
two grounds, both correct:

- `MIN_SEASON_TOTALS_SEASON` would sit in `lib/nflverse.mjs`, which is scoped to nflverse fetch/CSV
  helpers — but `nfl/season-totals` is a **Sleeper** family (`lib/sleeper.mjs`). Wrong module.
- None of the three would gate anything. The four that exist are enforced in ingest;
  `scripts/update-advstats.mjs` gates on `MIN_ADVSTATS_ROWS` (`:87`) and no season floor at all.
  Inventing production constants that only a test reads puts inert values beside behaviour-enforcing
  ones with nothing marking the difference.

So: **import the four that exist; declare the other six in a commented table in the test file**, each
citing its `data-catalog.md` coverage row. The floor for those six is documentation today, and the
test is honest about being the second reader of it rather than pretending to be the first.

**The three college families were missing from an earlier draft's table** — they are season-keyed
(`college/<category>/<year>.json`), they are the families §3 is repairing, and omitting them would
have silently exempted exactly those from the coverage guard while §5.4 claimed "no exemptions".
Verified contiguous 2017–2025 in all three, so they land green.

### 5.2 · Flag truth — the D-5 tripwire (addition, not in the audit)

> For `nfl/season-totals`, every entry for a year **strictly below the family's maximum year** must
> have `inProgress: false`.

Deterministic, network-free, currently green (2012–2025 all `false`). After a rollover writes
`2026.json`, the max becomes 2026 and **2025 must be sealed** — which is precisely D-5. This is the
mechanism that makes decision (A) in §2.4 workable: it converts a silent, year-later degradation into
a red test the next time anyone runs the suite.

### 5.3 · The `--dry-run` exemption (addition)

Assert `shouldSkipCompletedSeason({ inProgress: false, force: false, dryRun: true }) === false` — the
structural property §2.4 relies on. Add a `updateNfl` control-flow test using the existing
`DEFAULT_DEPS` injection seam: with a completed season and `dryRun: true`, `setManifestInProgress`
must **not** be called; without `dryRun`, it must be called exactly once with `inProgress: false`.

### 5.4 · Field completeness

> Every `manifest.files` entry carries all four of `lastModified`, `schemaVersion`, `recordCount`,
> `inProgress`.

Currently red on 38 entries; green after §3. No exemptions — see §3.2.

### 5.5 · `data-catalog.md` — three edits, not one

Replace the **Catalog-vs-manifest reconcile** section (the `node -e` snippet and its dated
`(2026-07-04)` output block): the snippet covered only advstats/gamelogs/roster/teamcontext — it never
covered `oline`, so promoting it verbatim would **not** have caught C7. Point the section at
`npm test` / `test/manifest.test.mjs` as the live check, with a one-line description of what is
asserted, instead of a hand-refreshed output block that goes stale by construction.

Removing it dangles two references that must be fixed in the same edit:

1. **`data-catalog.md:256`** — the Drift-prevention anchor reads *"(3) the reconcile one-liner
   above"*. Repoint it at the test; it is the whole reason anchor (3) exists, and it is now stronger
   (CI-enforced rather than run-by-hand).
2. **`data-catalog.md:28`** — the header line `_Last reconciled against manifest.json: 2026-08-24_`.
   §3 and §4 both invalidate that date. Once the reconcile is a test, a hand-maintained "last
   reconciled" stamp is the wrong artifact entirely — every `npm test` run reconciles. Replace the
   date with a pointer to the test rather than bumping it to 2026-08-29, which would just restart the
   same staleness clock.

---

## 6. Backlog correction (app repo, `.claude/tasks/data-repo-backlog.md`)

Part of this slice's done-definition. The data repo cannot edit the app repo — this lands as a
separate app-repo commit.

1. **Move D-4 to `## Done`.** It is already annotated `✅ RESOLVED 2026-08-24 — data repo 02cf41d`
   but is still filed under `## Open`, and `## Done` reads *"(none yet)"*. Follow the file's own
   convention: struck items move to `## Done` with their data-repo commit.
2. **Move D-3 to `## Done` as well** — identical state (`✅ RESOLVED 2026-08-24`, still under
   `## Open`), not mentioned in the brief. Same correction, same commit.
3. **Restate D-1; do not strike it.** Replace the "The fix" paragraph with a resolution note:

   > **✅ RESOLVED FORWARD-ONLY 2026-08-24 — data repo `2b06c5b`.** `aggregateWeeks` now infers a
   > single-team row's bye week(s) from the schedule and writes `'B'` into an `'X'` slot, forward
   > seasons only. **Completed 2012–2025 files keep `'X'` permanently, by decision** — a historical
   > rewrite would be an Invariant 1 exception, and D-1's own impact analysis (below) establishes
   > that `'B'` vs `'X'` is indistinguishable to every scoring path, so the rewrite buys a pop-up
   > legend at the cost of re-touching fourteen sealed seasons. Verified 2026-08-29: 2025 still reads
   > `P`/`X`/`D` with `byeWeeks: 0` across all 2,800 non-`TEAM_` rows — **correct behaviour, not an
   > outstanding bug.** The historical half is closed by decision; the forward half is shipped.

   Keep the existing impact analysis and the *"Do not fix this app-side"* warning — both are still
   load-bearing for anyone reading the file.
4. **Update D-5's mechanism paragraph** to §1.1's corrected version (the scheduled path never reaches
   the skip; the closed season is never revisited), and mark it resolved with this slice's data-repo
   commit once §2 lands.

---

## 7. Step order

Ordering is load-bearing in two places.

1. **§2 (D-5)** — helper + call site + tests. Self-contained; no data or manifest change lands from it
   (the seal no-ops, since every season entry is already `false`).
2. **§3 (C5)** — run `migrate-manifest-truth.mjs`. Manifest-only.
3. **§4 (C7)** — run `oline --year 2025`. **Must precede §5.1**, or the contiguity assertion is red on
   arrival.
4. **§5 (guard)** — add the tests *last*, so every one of them is green the first time it runs. A test
   added before its fix is a test somebody learns to ignore.
5. **§6 (backlog)** — app repo, separate commit, after the data-repo commit exists (it cites the sha).

**Commits.** Three in the data repo — `fix: seal a completed season's inProgress on the skip path
(D-5)`, `fix: backfill 38 manifest lastModified + unflag college 2024 (C5)`, `feat: oline 2025
backfill + manifest/coverage guard tests (C7)` — or two if §4 and §5 land together. One in the app
repo for §6. `git pull --rebase origin main` before each push; `manifest.json` conflicts resolve as a
**union** (CLAUDE.md → Session git workflow).

**CDN purge** is owed once, after §4: `manifest.json` first, then `nflverse/oline/2025.json`.
§3 changes `manifest.json` only — purge it there too, or fold both into the §4 purge if the commits
are adjacent.

---

## 8. Cross-repo impact

**Three entries fire: CR-21, CR-04, CR-18.** CR-02 is argued and **excluded** below; CR-05 does not
fire. Checked against each entry's data-side `Triggers` (right of `‖`) in live `README.md`.

### CR-21 · In-progress season-totals reads — `Direction: both`

Fires on §2: its data-side triggers are *"the `inProgress` marking, `hasNoData`,
`shouldSkipCompletedSeason` in `scripts/update-nfl.mjs`"* — all three named, and §2 edits two of them.

**Mirror (live `README.md`, CR-21, verbatim):**

> If the weekly job stops running, starts writing partial weeks under a different marking, or the `inProgress` flag's meaning changes, **the app has no way to tell** — it will render a half-season's rates as though they were a season's, with no error and no test failure. The floor in `validateNflSeason` is deliberately self-calibrating (`max(1, maxGames - 3)`) so a partial season validates; that means **the validator no longer distinguishes "early season" from "broken scrape" by games played alone**, and the app-side consumer must not assume it does. Any change to the job's cadence, the `inProgress` marking, or that floor is a both-repos change. See CR-04's Mirror for why this family's `inProgress: true` opt-in is a legitimate exception to that entry's "not a pattern to propagate" line — its `inProgress` flag is accurate, not a mislabel.

**Mirror instruction to the app repo: no code change owed, one comprehension note.** §2 does not
change the flag's *meaning* — it makes the flag start telling the truth again at season close, which
is the meaning CR-21's Invariant already asserts (*"a season-totals file marked `inProgress: true` is
incomplete by design"*). D-5 was a case of that Invariant being false in the data. No app-side
loader, gate, or shape changes. Record in the app repo only if D-5's resolution note in §6 is
considered insufficient — no `docs/cross-repo-registry.md` edit is owed.

### CR-04 · Manifest contract — `Direction: data→app`

Fires on §2 (new export in `lib/manifest.mjs`), §3 (38 entries rewritten in `manifest.json`), and §4
(one new entry). Data-side triggers: *"`updateManifestEntry` / `readManifest` in `lib/manifest.mjs`,
`manifest.json`"*.

**Mirror (live `README.md`, CR-04, verbatim):**

> New families are additive and need no app change (the app already keys by path). Renaming or removing `recordCount` / `schemaVersion` / `lastModified` / `inProgress` is breaking and needs both repos. **Renaming the top-level `files` map, or the per-entry `lastModified`, breaks a second app-side reader that `getManifestEntry` does not shield** — `ktcHistory.js` enumerates `Object.keys(manifest.files)` to discover KTC snapshots and compares `lastModified` for cache invalidation (CR-17); it degrades to an empty history with no error. Note the `inProgress` convention split: nflverse families register `inProgress: false` even while the current season mutates; KTC's `inProgress: true` is a legacy current-value marker, not a pattern to propagate (CR-17). **A second `allowInProgress: true` opt-in exists since in-season-app-read.md — `loadCurrentSeasonTotals` (CR-02) — and it is NOT the same situation as KTC's.** KTC's `inProgress: true` is a mislabel: a KTC snapshot is a completed, immutable capture registered with a "current value" flag that is wrong about the file. An in-progress season-totals file genuinely *is* incomplete and genuinely *should* be read while incomplete — that is the entire point of reading it. The convention this Mirror warns against is using `inProgress` to mean "latest"; season-totals uses it to mean "not finished," which is its actual, documented meaning. Do not read this Mirror's "not a pattern to propagate" line as blocking a genuinely-incomplete family from opting in the same way — read it as blocking a *mislabeled* one.

**Mirror instruction to the app repo: no change owed.** No field is added, renamed or removed —
`setManifestInProgress` writes an **existing** field on an existing entry, and §3 fills fields that
were contractually required all along for the 24 script-written college rows (Invariant 3, §3.1b).
§4 adds a new entry, which this Mirror states is additive and needs no app change.

**Do not promise an app-side refetch.** An earlier draft claimed §3 would trigger a one-time refetch
of college 2017–2024. That claim is not supportable from this repo and is withdrawn. The reachability
of `cfbd.js:48`'s stale-forever branch depends on what each client previously stored as
`sourceLastModified`, which this repo cannot observe — and the live code makes the pessimistic case
unlikely rather than certain: `cfbd.js:64-65` writes `sourceLastModified: entry?.lastModified ?? null`,
and `:45` treats a falsy value as *"fall through to data store for migration"*, so an entry cached
while `lastModified` was absent would have stored `null` and would already be falling through.

**C5 does not need that claim to be justified.** It is required by Invariant 3 for the 24
script-written rows and by §5.4's guard regardless of whether the app-side bug is currently reachable
for any given client. State it that way in the commit message; leave the app-side effect for the app
repo to determine, since the registry gives this repo no authority over it.

### CR-18 · Signal registry rows (`docs/signal-registry.md`) — `Direction: data→app`

Fires on §4 and §5.4: `data-catalog.md` is CR-18's first data-side trigger, `scripts/update-oline.mjs`
is in its ingest list, and §4 alters `nflverse/oline`'s **historical coverage** — CR-18's `Invariant`
scope verbatim.

**Mirror (live `README.md`, CR-18, verbatim):**

> This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

**Mirror instruction to the app repo: no row edit is owed — verify, do not rewrite.** Checked, not
assumed: `docs/signal-registry.md:70` (oline) already reads **"2025 onward (2026 live; pre-2025 exists
upstream in a legacy `depth_charts` schema, currently unparsed)"**, and `data-catalog.md` already
reads **"Coverage: 2025 → present"**. Both already describe the post-§4 state — C7 is a case of the
**data** being wrong about the docs rather than the docs being wrong about the data, which is the
inverse of the usual CR-18 trigger. Session 2 must re-read both rows before concluding the null; if
either has drifted since 2026-08-29, emit the row edit instead.

### CR-02 — argued and excluded

CR-02's data-side triggers name `scripts/update-nfl.mjs` **unqualified**, and §2 edits that file, so a
literal reading fires it. It is excluded on CR-21's own explicit scoping rule, quoted from CR-21's
Data side:

> *"the underlying writer and validator are CR-02's triggers (and CR-20's, for the DEF rows
> specifically), not re-listed here, so a shared-script edit does not fire three entries for one
> change"*

§2 touches `shouldSkipCompletedSeason`, the skip branch, and (per §2.4's option B) a second
`setManifestInProgress` call after the year is resolved — all `inProgress`-marking code, which CR-21
claims as its own. It does not touch `aggregateWeeks`, `normalizeTeamForSchedule`, the writer
(live `:144`), `validateNflSeason`, or the served row shape, and CR-02's `Invariant` (schemaVersion +
row composition) is untouched: schemaVersion stays 4, no key is added or removed, no row changes.
**If the reviewer disagrees, the resolution is to emit CR-02's Mirror as well — not to redesign §2.**

**CR-05 (CFBD statType keys) does not fire.** Its data-side triggers are `scripts/update-cfbd.mjs`,
`lib/cfbd.mjs`, `validateCfbdCategory`. §3 touches none of them — the college work is entirely
`manifest.json` metadata, which is CR-04. No college file's *content* is read or written.

---

## 9. Done-definition

- [ ] `setManifestInProgress` exported from `lib/manifest.mjs`; no-ops (no write) on an absent entry
      and on an already-correct value; preserves `lastModified`/`recordCount`/`schemaVersion`/legacy
      fields; bumps top-level `generatedAt` only when it writes
- [ ] **Call site 1** — inside the skip branch, before the `return` at `scripts/update-nfl.mjs:90`
- [ ] **Call site 2 (§2.4 option B)** — after the year resolve, seals `year - 1` when `inProgress` is
      true; guarded on `!dryRun`; both branches tested
- [ ] `setManifestInProgress` added to `DEFAULT_DEPS`; logs only when it writes
- [ ] **All three existing `deps` blocks in `test/update-nfl.test.mjs` stub it** (`:106`, `:147`,
      `:179`); the skip-path test asserts exactly one call with `inProgress: false`, the others zero
- [ ] **`npm test` leaves `manifest.json` byte-identical** — `git diff --quiet manifest.json` after the
      run. This is the guard against any future dep leaking into the real manifest, not just this one
- [ ] `--dry-run` reaches neither call site (§5.3 + the option-B guard)
- [ ] `scripts/migrate-manifest-truth.mjs` written to mutate the manifest **directly**
      (`readManifest` + `writeJsonStable`), NOT via `updateManifestEntry`; run once; kept in the tree
- [ ] After it: **0** entries with a falsy `lastModified`, **0** with a falsy `schemaVersion`; entry
      count still **188**; `recordCount`/`originalKey` byte-identical; no entry that already had a
      `lastModified` was touched
- [ ] `college/{passing,receiving,rushing}/2024.json` now `inProgress: false`; the 2025 trio unchanged
- [ ] `nflverse/oline/2025.json` written and registered — 14,368 rows / 1,056 states / 32 teams
- [ ] **No new `MIN_*_SEASON` constants added.** The test imports the four that exist and declares the
      other six in a commented local table citing their `data-catalog.md` coverage rows
- [ ] Coverage assertion covers **ten** families including `college/{passing,receiving,rushing}`
- [ ] Four new assertions green: contiguity (§5.1), season-totals flag truth (§5.2), dry-run
      exemption (§5.3), field completeness (§5.4) — no prefix exemptions in §5.4
- [ ] The two pre-existing `raw/stats-` tests still present and green
- [ ] `data-catalog.md`: reconcile section repointed at the test; **`:256` drift-prevention anchor (3)
      repointed**; **`:28` "Last reconciled" stamp replaced with a pointer, not re-dated**. Coverage
      rows themselves unchanged (already correct)
- [ ] `npm test` green (baseline **523** + the new assertions); `npm run smoke` green
- [ ] `python3 -m json.tool manifest.json` parses
- [ ] CDN purge run: `manifest.json` first, then `nflverse/oline/2025.json`
- [ ] App repo: D-4 **and D-3** moved to `## Done` with shas; D-1 restated (not struck); D-5's
      mechanism paragraph corrected and marked resolved with this slice's sha
- [ ] `store-audit-2026-08-25.md` still shows as modified-and-uncommitted, untouched by this slice
- [ ] CR-18 discharged: both `docs/signal-registry.md:70` and the oline catalog row re-read and
      confirmed still accurate; null row edit recorded in the commit message
- [ ] Commit message for §3 justifies C5 on **Invariant 3 + the guard**, and makes no claim about an
      app-side college refetch (§8)

---

## 10. Settled decisions

- **A new `setManifestInProgress` helper, not `updateManifestEntry`** (§2.1) — the latter stamps
  `lastModified: now` and would assert a change to bytes that did not change.
- **Option (B): the scheduled path seals `year - 1` too** (§2.4) — chosen over the skip-path-only fix
  once review established that §5.2's tripwire stays green for ~7 months after the defect appears.
- **A one-shot migration script for C5** (§3.1) — structure from `migrate-f24-prune.mjs`, but writing
  the manifest directly, because that precedent's own write path is the one ruled out.
- **Both `lastModified` and `schemaVersion` backfilled** (§3.1) — all 38 lack both.
- **Backfill all 38 though Invariant 3 only reaches 24** (§3.1b) — a prefix exemption in the guard
  costs more than a one-time write on 14 legacy rows.
- **Contiguity-from-floor instead of `[floor … currentSeason−1]`** (§5.1) — `currentSeason` requires a
  live API call, which this suite cannot make.
- **No new `MIN_*_SEASON` constants** (§5.1) — they would gate nothing, and a Sleeper family's floor
  does not belong in `lib/nflverse.mjs`.
- **Ten families in the coverage table**, college included (§5.1).
- **Tests land last** (§7) — every assertion green on first run.
- **D-1 restated, not struck** (§6.3) — the forward half shipped; the historical half is closed by
  decision under Invariant 1, which is a different status from both "done" and "outstanding".

---

## 11. Review disposition (2026-08-29)

The plan-reviewer raised **12 flags** on the first draft. All adjudicated; nothing outstanding. Two
changed the design rather than the wording (flags 4 and 8); one is partially rejected.

| # | Flag | Call | Landed |
|---|---|---|---|
| 1 | `[mechanical]` existing tests don't stub the new dep → real `manifest.json` write | **Accepted** | §2.3b + done-definition `git diff --quiet` check |
| 2 | `[shape]` the 38 also lack `schemaVersion` | **Accepted** | §3.1 — both fields, `schemaVersion: 1` |
| 3 | `[invariant]` Invariant 3 still violated after §3 | **Accepted, scope refined** | §3.1b — Invariant 3 reaches the 24 script-written rows, not the 14 `raw/`; backfill all 38 anyway |
| 4 | `[edge-case]` §5.2 tripwire fires ~7 months late | **Accepted — design changed** | §2.4 now implements option (B) |
| 5 | `[mechanical]` cited precedent uses `updateManifestEntry` | **Accepted** | §3.1 — structure only, write directly |
| 6 | `[edge-case]` college-2024 flip arms `update-cfbd.mjs:69` refusal | **Accepted** | §3.2b |
| 7 | `[edge-case]` CR-04 refetch promise unsupported | **Accepted, and withdrawn outright** | §8 CR-04 |
| 8 | `[strategy]` the three new constants gate nothing / wrong module | **Accepted — design changed** | §5.1 — no new constants |
| 9 | `[edge-case]` college families missing from the floor table | **Accepted** | §5.1 — ten families |
| 10 | `[mechanical]` dangling `data-catalog.md` refs at `:28` and `:256` | **Accepted** | §5.5 |
| 11 | `[registry-stale]` CR-04 Data side misses three live sites | **Confirmed, deferred** | §12.4 |
| 12 | `[registry-stale]` CR-02 anchors stale | **3 of 4 accepted; 1 rejected** | §8 + §12.5 |

**Flag 7 is right, for a different reason than given.** The reviewer supposed a client might have
stored a *valid* `sourceLastModified` against an entry lacking `lastModified`. Live code makes that
unlikely: `cfbd.js:64-65` stores `entry?.lastModified ?? null` and `:45` treats falsy as
"fall through to data store". Either way the conclusion holds — the app-side effect is not
determinable from this repo, so the promise is withdrawn rather than restated.

**Flag 12 is 3 of 4.** The three `scripts/update-nfl.mjs` anchors in CR-02's Data side are stale
(`:93`→`:144` writer, `:54`→`:112` aggregate, `:58`→`:116` validate) and §8's own repetition of `:93`
is corrected. The fourth sub-claim is **wrong**: the entry cites `normalizeTeamForSchedule` at `:342`
and describes it as *"writes the per-season `team`"* — live `lib/sleeper.mjs:342` is exactly
`p.team = normalizeTeamForSchedule(resolvedTeam);`. `:25` is the function *definition*, not the write
site the entry names. `aggregateWeeks:231` is also correct. No correction owed there.

**Why 11 and 12 are deferred, not folded in.** Both are edits to entries inside the byte-identical
mirrored region, and this slice opens **neither** CR-02 nor CR-04's entry. Folding them in would mean
a synchronized two-repo registry edit for a slice that otherwise touches no registry text — the
opposite trade from the C8 slice, where the CR-09 staleness was folded in precisely *because* that
entry was already being opened. Recorded with evidence in §12 so the next slice that opens either
entry carries them.

---
## 12. Out-of-scope observations (not edits)

1. **The store and live paths disagree on scoring basis generally** (§1.1) — stored rows are
   `half_ppr`, the live path computes the league's settings, and nothing reads `scoringBasis` to
   detect which a given season came from. D-5 makes this *visible* for one season but does not cause
   it; it is pre-existing and affects any season served from cache-vs-store. Worth its own item.
2. **`data-catalog.md:222`** still describes *"the registered `grading/<date>.json` family"*; the
   manifest holds **zero** `grading/*` entries and `grading/` holds only four unregistered
   `*-verdict.md` files. Forward-looking rather than drifted — carried over from the C8 slice's §8.
3. **The backlog's `## Done` convention has never been exercised** — D-3 and D-4 both sat annotated
   under `## Open`. §6 is the first use; if items keep being annotated in place, the section is doing
   no work and the convention should be dropped rather than repeatedly repaired.

4. **CR-04's `Data side` is stale — three live sites it does not name** (review `[registry-stale]`,
   confirmed against live source):
   - `scripts/migrate-f24-prune.mjs:28,102` — a **fourth** registrar via `updateManifestEntry`; the
     entry enumerates exactly three non-`update-*` registrars (`register-snapshots.mjs`,
     `grade-snapshot.mjs`, `lib/enrichment.mjs`).
   - `scripts/update-cfbd.mjs:69` — reads `existingEntry.inProgress` directly to gate the
     completed-file refusal (the same consumer §3.2b arms).
   - `bin/import-snapshot.mjs:209-213` — reads `manifest.files[destRel]` via
     `readJson('manifest.json')`, bypassing `readManifest`. This is the **data-side analogue of the
     `ktcHistory.js` accessor bypass** the entry already records app-side, and it is exactly the kind
     of direct-`files`-map reader CR-04's Mirror warns a rename would break.

   *Not folded into this slice.* Correcting it is an edit inside the byte-identical mirrored region,
   and this slice opens neither CR-04's nor CR-02's entry — so it would mean a synchronized two-repo
   registry change for a slice that otherwise touches no registry text. (The opposite call from the
   C8 slice, where CR-09's staleness *was* folded in precisely because that entry was already open.)
   The next slice that opens CR-04 should carry it.

5. **CR-02's `Data side` anchors for `scripts/update-nfl.mjs` are stale** — the writer is cited as
   `:93` (live `:144`), the aggregate call as `:54` (live `:112`), the validate call as `:58` (live
   `:116`). Same deferral reasoning as 4.

   **Two sub-claims in the same review flag are wrong and must not be "corrected":**
   `aggregateWeeks:231` is **right** (live `lib/sleeper.mjs:231`), and `normalizeTeamForSchedule` at
   `:342` is **right** — the entry describes that anchor as *"writes the per-season `team`"*, and
   live `:342` is `p.team = normalizeTeamForSchedule(resolvedTeam);`. `:25` is the function
   *definition*, not the write site the entry names. Changing `:342` to `:25` would make a correct
   anchor wrong.
