# S2, slice 2: extract `runSeasonKeyedIngest`, convert `schedule` only

**Type:** one new shared helper + one family converted behind the net.
**No served shape, no data, no manifest, no schemaVersion, no CDN purge, no behaviour change.**
**Session model:** plan (opus, this file). Implementation is a separate sonnet session — do not edit
source here.
**Source:** `store-audit-2026-08-25.md` **S2**, slice 2 of the program in `season-ingest-net.md` §10.
Designed against live source 2026-08-31 at HEAD `22cb899`.

> **One family. The helper lands with a single caller, and that is correct.** A shared spine designed
> against six call sites at once is designed against a map; designed against one and then extended
> five times, each behind its own branch matrix, it is designed against behaviour. Slice 3 is the
> first real test of the signature — if it needs to change then, that is the process working.

**Working-tree note.** `store-audit-2026-08-25.md` is modified and uncommitted. **Do not stage,
commit, revert or edit it.** Nothing here touches it.

---

## 1. Verified facts

### 1.1 · The net is in place and pins schedule's full branch matrix

`test/update-schedule.test.mjs` (HEAD `22cb899`) holds ten tests — two pre-existing `gamesHash`
unit tests plus eight characterizations:

| test | branch |
|---|---|
| `fetchSchedulesCsv() returns null → THROWS, not a clean return` | not-published, **as a throw** |
| `a season with zero rows in the combined file is skipped` | per-season not-published |
| `games.length < MIN_SCHEDULE_GAMES → skipped` | sparsity gate |
| `dedup hit — nothing written` | dedup |
| `--dry-run on a changed past season reports a plan, does NOT throw` | dry-run before force gate |
| `force gate throws on a changed past season without --force` | force gate |
| `write path — data file + manifest entry written, with schedule's own envelope` | write |
| `--all processes every season found in the ONE combined fetch (no re-fetch)` | **topology** |

**These eight are the acceptance criteria for this slice.** They must pass unedited. Any one of them
needing a change means the extraction altered behaviour.

### 1.2 · Schedule's fetch topology is structurally unlike the other multi-season families

```js
const csv = await d.fetchSchedulesCsv();        // ONCE, no season arg, before the loop
if (csv === null) throw new Error(…);           // throws, does not skip
const { gamesBySeason } = parseSchedulesCsv(csv);
for (const season of seasons) {
  const games = gamesBySeason[String(season)] ?? [];   // in-memory split
```

`gamelogs`, `teamcontext` and `oline` fetch **per season inside the loop**. `roster` and `advstats`
are single-season. So the six families use **three** fetch topologies, and the last net test pins
schedule's explicitly ("no re-fetch").

**This is why schedule is the right first conversion.** A helper designed against a per-season
fetcher would bake the fetch into the loop and have to be redesigned when schedule arrived. Starting
here forces the correct boundary immediately: **the helper never fetches.**

### 1.3 · Schedule uses the majority gate order

`DEDUP → DRY-RUN → FORCE-GATE → WRITE`, shared with `advstats`, `gamelogs`, `teamcontext`, `oline`.
Only `roster` inverts the middle two (`season-ingest-net.md` §1.1 axis 3), and the net pins that
inversion deliberately. **The helper implements the majority order**; roster is slice 6's problem and
§7 names the two options rather than deciding now.

---

## 2. The decisions

### 2.1 · The helper never fetches, never resolves seasons, never sets step outputs

`lib/seasonIngest.mjs`:

```js
export async function runSeasonKeyedIngest({
  family,            // 'schedule' — log prefix only
  seasons,           // number[], already resolved by the caller
  currentSeason,     // for isPast
  dryRun, force,
  deps,              // { readJson, writeJsonStable, updateManifestEntry }
  dataPath,          // (season) => string
  derive,            // async (season) => derived | null   ← null or rowCount 0 = not published
  rowCount,          // (derived) => number
  minRows, minRowsLabel,   // see §10.2 — this is schedule-shaped and will not survive slice 3
  validate,          // (derived, { year }) => void, throws
  hash,              // (derived) => string
  existingHash,      // (existingFileContents) => string | null
  envelope,          // (season, derived) => object to write
  manifestRecordCount, // (derived) => number
})
```

**Three responsibilities stay with the caller, deliberately:**

1. **Fetching** — §1.2. Three topologies; the helper is agnostic because `derive(season)` returns
   already-derived rows. Schedule's `derive` closes over the single parsed `gamesBySeason`; a
   per-season family's `derive` does its own fetch. Schedule's *whole-file* throw stays in the
   caller, before the loop.
2. **Season resolution** — `--all` vs `--year` vs default differ per family (schedule's `--all`
   enumerates the parsed map's keys; others count from a `MIN_*_SEASON` floor).
3. **`setStepOutput('season', …)`** — placement and condition differ across families. **Do not pull
   it in until all six are converted and the pattern is proven.** Moving it now would be designing
   against the map again.

### 2.2 · What the helper owns

Per season, in this exact order:

1. `derived = await derive(season)`; **null or `rowCount === 0` → log "not published", continue**
2. `rowCount < minRows` → log with `minRowsLabel`, continue
3. `validate(derived, { year: season })`
4. `existing = deps.readJson(dataPath(season))`; `hash(derived) === existingHash(existing)` → log
   identical, continue
5. `dryRun` → log the plan, including the `needsForce` suffix, continue
6. `isPast && existing && !force` → **throw**
7. `deps.writeJsonStable(dataPath, envelope(season, derived))`
8. `deps.updateManifestEntry({ path, recordCount: manifestRecordCount(derived), inProgress: false, schemaVersion: 1 })`
9. **the trailing success log** — `[schedule] Wrote <path> (N games) + manifest`
   (`scripts/update-schedule.mjs:118`)

**Step 9 exists because the net cannot see it.** `spyDeps` in `test/update-schedule.test.mjs:64-77`
records `writeJsonStable`, `updateManifestEntry` and `setStepOutput` calls and **captures no console
output at all**. So an extraction that drops or rewords any log line — including this one — passes
all ten tests undetected. The operator-facing output of the weekly Action is the only signal a human
reads when a job misbehaves, and it is the one thing §3.1 asks to preserve that has no automated
guard. §4 step 5's byte-diff and §7's log checklist are the whole defence.

**`inProgress: false` and `schemaVersion: 1` are hard-coded in the helper.** Every one of the six
passes exactly those today, and `inProgress: false` is a documented invariant for these families
(no app live fallback). If a future family needs otherwise, it takes a parameter *then* — not
speculatively now.

### 2.3 · Alternatives rejected

| option | rejected because |
|---|---|
| Helper owns the fetch | §1.2 — three topologies; schedule's single pre-loop fetch would have to be special-cased into a helper meant to remove special cases |
| Convert two or three families this slice | The signature is unproven until a *second* family exercises it; converting three at once means three conversions ride on one untested design |
| Design the signature against all six now | That is designing against the map. Slice 3 is the first real test — let it change the signature if it must |
| Pull `setStepOutput` in now | §2.1 — placement differs; it is the kind of "small uniformity" that flattens a divergence |
| Give the helper a `forceGateBeforeDryRun` flag now | Speculative until slice 6. §7 records the choice without taking it |

---

## 3. The edits

### 3.1 · `lib/seasonIngest.mjs` (new)

`runSeasonKeyedIngest` per §2.1/§2.2. Pure control flow: no imports from `lib/nflverse.mjs`,
`lib/validate.mjs` or any family module. It takes `deps` and callbacks and nothing else, so it has
no opinion about any family.

**Log lines must match today's text.** The net asserts behaviour, not logs — but the operator-facing
output of the weekly Actions is the only signal a human reads. Keep `[schedule] …` wording
byte-identical; the `family` parameter supplies the prefix.

### 3.2 · `scripts/update-schedule.mjs`

Keep, unchanged: the module header, `byGameId`/`gamesHash`, `DEFAULT_DEPS`, the signature, the
pre-loop fetch **and its throw**, `parseSchedulesCsv`, season resolution, and the
`if (!all) d.setStepOutput(…)` line.

Replace only the `for (const season of seasons) { … }` body with one `runSeasonKeyedIngest` call
whose `derive` closes over `gamesBySeason`.

### 3.3 · Nothing else

No other family converted. No test edited. `lib/io.mjs`, `lib/args.mjs`, `bin/update.mjs` untouched.

---

## 4. Step order

1. Write `lib/seasonIngest.mjs` (§3.1). Nothing calls it yet; `npm test` still 662.
2. Convert `update-schedule.mjs` (§3.2).
3. **Run `test/update-schedule.test.mjs` alone.** All ten must pass **unedited**. If any needs a
   change, stop — the extraction altered behaviour and the change is the finding, not the fix.
4. **Prove the helper is load-bearing**: temporarily reorder its steps 5 and 6 (dry-run after force
   gate — roster's ordering), confirm `--dry-run on a changed past season … does NOT throw` goes
   **red**, then revert. Same discipline as slice 1 step 5, now aimed at the shared code.
5. **Diff the live dry-run output** before and after, for a completed season and for `--all`:
   `node bin/update.mjs schedule --year 2023 --dry-run` and `--all --dry-run`. Byte-identical.
6. `npm test` (662, unchanged — this slice adds no tests), `npm run smoke`.
7. Commit; `git -c rebase.autoStash=true pull --rebase origin main`; push. **No CDN purge.**

**Step 4 is the one that cannot be skipped.** The net proved it bites against six copies of the
logic; it has not yet been shown to bite against one shared copy, which is a different claim.

---

## 5. Tests

**This slice adds no tests.** That is the point: the net was written in slice 1 precisely so the
extraction has an acceptance suite it did not author. `npm test` stays at **662**.

If the conversion tempts you to add a test, it is because the extraction changed something the net
does not cover — **report that rather than covering it**.

---

## 6. Cross-repo impact

**Two entries fire: CR-08 and CR-18.** CR-08 names `scripts/update-schedule.mjs` in its data-side
`Triggers`; CR-18's `scripts/update-{…,schedule,…}.mjs` brace expansion covers it. `lib/seasonIngest.mjs`
is new and named by no entry.

**No change owed on either.** No served shape, floor, field, coverage or cadence moves; the emitted
envelope is byte-identical and produced by the same `envelope` callback.

### CR-08 · schedule

> Shape or floor changes land in both repos together. Read-only on the app side — not wired into projection/scoring. Rendered since dp-v2 Slice 4a (`dp/GameLogSection.jsx`) — a shape or floor change now breaks a visible surface, not just a silent loader. **Since D-1 (2026-08-24), `gameType`/`homeTeam`/`awayTeam` are also load-bearing data-side** — `scripts/update-nfl.mjs` reads this family (while `inProgress`) to derive each team's bye week(s) for `nfl/season-totals`; a missing schedule file degrades silently (no byes, no throw), but a `gameType`/`homeTeam`/`awayTeam` rename or reshape would silently stop byes from ever being written, with no validator to catch it (this family stays read-only/view-only on the app side regardless).

**Note what this Mirror means for this slice specifically.** `scripts/update-nfl.mjs` reads
`nflverse/schedule/<year>.json` for bye inference, and a missing or reshaped file **degrades
silently — no byes, no throw, no validator**. So a conversion bug that stopped schedule writing, or
wrote a subtly different envelope, would surface as *wrong bye weeks in season-totals weeks later*,
not as a red test. The net's write-path envelope assertion (§1.1) is the guard; **do not weaken it.**

### CR-18 · signal registry / data-catalog

> This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

**No row edit owed** — no field, stat key, source or coverage changes. No `data-catalog.md` edit
either.

---

## 7. Done-definition

**The helper**
- [ ] `lib/seasonIngest.mjs` created; imports **nothing** from `lib/nflverse.mjs`, `lib/validate.mjs`
      or any family module — `deps` and callbacks only
- [ ] Per-season order is exactly §2.2's eight steps, with **dry-run before force gate**
- [ ] `inProgress: false` and `schemaVersion: 1` hard-coded, not parameterised
- [ ] The helper **never fetches**, **never resolves seasons**, **never calls `setStepOutput`**

**The conversion**
- [ ] Only the `for (const season of seasons)` body replaced in `update-schedule.mjs`
- [ ] Pre-loop `fetchSchedulesCsv()` **and its throw** unchanged; `derive` closes over the single
      parsed `gamesBySeason` — **no per-season re-fetch**
- [ ] `DEFAULT_DEPS`, `gamesHash`, `byGameId`, the signature and the `setStepOutput` line unchanged
- [ ] **Every `console.log` in the replaced loop body appears in the helper with byte-identical
      text** — including the trailing `Wrote … + manifest` line (§2.2 step 9). Diff the log
      statements of the old and new versions directly; **the net cannot check this** (`spyDeps`
      captures no console output)

**Verification**
- [ ] All ten tests in `test/update-schedule.test.mjs` pass **unedited**
- [ ] **The helper was proven to bite** (§4 step 4) — steps 5/6 reordered, the dry-run test went red,
      reverted
- [ ] Live dry-run output byte-identical before/after, for `--year 2023` **and** `--all`
- [ ] `npm test` **still 662** — this slice adds no tests
- [ ] `npm run smoke` green **or** failing only on the known CFBD 429, stated explicitly

**Boundaries**
- [ ] **No other family converted**; no test edited; `lib/io.mjs`, `lib/args.mjs`, `bin/update.mjs`
      untouched
- [ ] CR-08 and CR-18 `Mirror` texts emitted (§6); no registry text edited
- [ ] No served file, manifest, `schemaVersion`, or CDN purge
- [ ] `store-audit-2026-08-25.md` still modified-and-uncommitted, untouched

---

## 8. Settled decisions

- **One family this slice** (header, §2.3) — the signature is unproven until a second caller.
- **The helper never fetches** (§1.2, §2.1) — three topologies across six families.
- **Caller keeps season resolution and `setStepOutput`** (§2.1) — both differ per family.
- **Majority gate order; roster deferred** (§1.3) — the net pins roster's inversion on purpose.
- **No tests added** (§5) — the net is the acceptance suite, and it was written first for exactly
  this reason.
- **`inProgress: false` / `schemaVersion: 1` hard-coded** (§2.2) — parameterise on demand, not
  speculatively.
- **Log text is behaviour here** (§2.2 step 9) — the net captures no console output, so preserving
  it is a manual check, not an asserted one.

---

## 9. Invariant check

- **Invariant 3 (manifest is the index)** — the helper is now the single site calling
  `updateManifestEntry` for converted families, always paired with the write immediately before it.
  That pairing becomes *harder* to break as families convert, which is a real if incidental win.
- **Invariant 1 (append-only)** — no data file rewritten; the force gate is preserved verbatim.
- **Invariant 4 (schemaVersion)** — hard-coded to today's value.
- **CDN purge** — untouched; this slice performs none.

---

## 10. Known signature gaps — recorded now, not designed now

The plan accepts that slice 3 is the first real test of the signature (header). Three gaps are
**already visible** and should not arrive as surprises.

### 10.1 · `roster` needs more than an ordering flag

`roster` performs a **second write on two separate branches**:

- **on a dedup hit** — `d.writeJsonStable(LAST_CHECKED_PATH, { checkedAt, year, identical: true })`
  (`scripts/update-roster.mjs:94-106`), and in dry-run it logs *"would write"* instead;
- **after a successful write** — the same marker with `identical: false` and the data path
  (`:144-151`).

§2.2 models a dedup hit as a **pure `continue` with no side effects**, and steps 7–9 as the only
writes. Neither is true for roster. So slice 6 needs a per-branch hook (`onDedupHit`, `afterWrite`)
or roster stays unconverted — **a structurally bigger divergence than the gate ordering**, which an
earlier draft of this plan named as roster's only risk. It is not.

### 10.2 · Log templates differ per family, and `minRowsLabel` cannot bridge them

Schedule logs sparsity as `season <N> only <n> games (< <MIN>) — preliminary, skipping`. The other
looped families use a different shape — `season=<N>`, a `MIN_X=` prefix, and *"treating as
preliminary/partial"*. And **gamelogs' dry-run line carries clauses schedule's single-count template
cannot express** (`scripts/update-gamelogs.mjs:161` — `<n> game rows, <m> players (<k> unmapped)`).

A label swap cannot produce any of that. Slice 3 will need caller-supplied message builders rather
than a label — **expect the signature to change there**, and prefer changing it to smearing every
family's log text into one template. Log text is operator-facing and §2.2 step 9 explains why it is
worth preserving exactly.

### 10.3 · `roster`'s gate ordering — still open, still slice 6's

`roster` gates force **before** its dry-run exit; the helper implements the opposite. One of:

- **(a)** a `forceGateBeforeDryRun` flag — preserves behaviour, adds a parameter whose only purpose
  is to encode a divergence nobody defends;
- **(b)** change roster to the majority order — almost certainly better behaviour, but a
  **behaviour change** that must be argued and landed as one, with the net's axis-3 test updated
  deliberately;
- **(c)** leave roster unconverted.

**Do not decide this in slices 2–5.** It only becomes concrete when roster is the subject, and (b)
is a product decision wearing a refactor's clothes.
