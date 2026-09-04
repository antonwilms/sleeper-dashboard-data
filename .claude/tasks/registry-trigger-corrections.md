# Registry trigger corrections — three entries, symbols only

**Type:** additive cache corrections to three registry entries, in both repos. **No source change, no
data, no manifest, no test, no CDN purge.**
**Session model:** plan (opus, this file). Implementation is a separate sonnet session — do not edit
source here.
**Source:** the substantive half of the deferred registry backlog — `manifest-truth.md` §12.5,
`repo-weight.md` §11.4, `advstats-2016-gate.md` §12.3, plus two gaps surfaced by review of
`registry-anchor-reconcile.md`. Verified against live source **2026-08-30** at HEAD `c01d9f0`.

**What this is not.** The companion slice (`registry-anchor-reconcile.md`) proposed stripping line
anchors registry-wide. **That is deliberately not here.** `README.md:1078` states
*"`sleeper-dashboard` owns the format definition; this repo mirrors it exactly"*, so the anchor
policy is not this repo's to set alone — see §6. This slice takes only the corrections that are
unambiguous, individually verifiable, and additive.

**The one design rule that makes it safe:** every addition **names a symbol, never a line number**.
That is exactly what the format spec asks for — *"concrete paths, exported symbols, constant names or
served JSON paths"* — so nothing here depends on, touches, or pre-empts the anchor decision.

**Working-tree note.** `store-audit-2026-08-25.md` is modified and uncommitted. **Do not stage,
commit, revert or edit it.** Nothing here touches it.

---

## 1. The corrections

**Nine** additions across three entries — six originally planned, three added by review (§8). Each was re-derived from live source for this plan — **not copied
from the task files that recorded them**, since two earlier slices shipped anchors copied from stale
lists.

### 1.1 · CR-04 · Manifest contract — three additions

CR-04's `Data side` currently reads:

> `manifest.json`, `lib/manifest.mjs` (`readManifest:19`, `updateManifestEntry:34`) — 12 of the 13
> `scripts/update-*.mjs` writers register through `updateManifestEntry` (`update-enrichment.mjs` does
> **not**), plus three non-`update-*` registrars: `scripts/register-snapshots.mjs`,
> `scripts/grade-snapshot.mjs`, and `lib/enrichment.mjs`

**(a) `setManifestInProgress` is a third exported helper and is unnamed.**
`lib/manifest.mjs` exports **three** functions — `readManifest`, `updateManifestEntry`, and
`setManifestInProgress` — and the third writes the manifest itself. It was added by
`manifest-truth.md` §2.2 and is called in production at two sites in `scripts/update-nfl.mjs`. It
mutates `inProgress`, a field CR-04's own `Mirror` names as breaking to rename or remove.

**(b) There is a fourth non-`update-*` registrar.** `scripts/migrate-f24-prune.mjs` imports and calls
`updateManifestEntry`. CR-04 says "three"; live it is four.

**(c) Two scripts write `manifest.json` directly, bypassing `lib/manifest.mjs` entirely** — a category
CR-04's `Data side` does not describe at all:

| script | what it does |
|---|---|
| `scripts/migrate-manifest-truth.mjs` | `readManifest()` → edits `manifest.files` in place → `writeJsonStable('manifest.json', …)`. **Rewrote 38 entries.** |
| `scripts/migrate-drop-cfbd-raw.mjs` | same shape; removed 8 entries |

**(d) One script *reads* the manifest object directly, too.** `bin/import-snapshot.mjs` does
`readJson('manifest.json')` then indexes `manifest.files[destRel]`, bypassing `readManifest`. It is
the read-side twin of (c), and CR-04 names it in neither field.

This is the data-side analogue of the `ktcHistory.js` accessor bypass CR-04 already records app-side —
and CR-04's `Mirror` warns specifically that renaming the top-level `files` map breaks readers
`getManifestEntry` does not shield. These two writers are exactly such readers-and-writers.

### 1.2 · CR-02 · season-totals schemaVersion & row composition — one addition

**`scripts/migrate-f24-prune.mjs` is a live `nfl/season-totals/<year>.json` writer** and CR-02 does
not name it (verified: zero occurrences in the entry). It is the script that **produced the
schemaVersion 4 state CR-02's own `Invariant` describes** — it rewrote every completed season, minified,
and bumped the manifest to v4.

### 1.3 · CR-07 · nflverse advstats — two additions plus consumers

CR-07's `Data side` names the served path, the CLI, the writer script, `MIN_ADVSTATS_ROWS`, and
`validateAdvStats`. Missing:

**(a) `aggregateAdvReceiving` — the producer.** `lib/nflverse.mjs` — it computes and emits
`targetShare` / `airYardsShare` / `wopr` / `racr` / `components`, i.e. **the exact served shape
CR-07's own `Invariant` pins**. The entry names the validator of that shape but not the function that
creates it.

**(b) `AY_PER_TARGET_MIN` / `AY_PER_TARGET_MAX`** — `lib/nflverse.mjs`. The ingest-blocking
plausibility band added by `advstats-2016-gate.md`; it can reject a season outright, and it is
currently unnamed in the entry that owns the family.

**(c) Four live consumers of the served shape.** CR-07's data-side `Triggers` are **producer-only**:

| file | consumer symbol |
|---|---|
| `scripts/backtest-run.mjs` | `loadAdvstats` |
| `scripts/panel-run.mjs` | `loadAdvstats` |
| `lib/backtest.mjs` | `buildCohortRows` (reads `advstatsY.players` and the four ratios) |
| `lib/panel.mjs` | `resolvePosition` and `buildPanelRow` (the latter reads the `airYardsShare` candidate) |

**(d) Three sites *define* the served ratio names, and no consumer symbol reaches them.** The format
spec's own bullet — *"`Triggers` must name definition sites, not just call sites"* — covers exactly
this: `CORRUPT_PREDICTOR_SEASONS` (`lib/backtest.mjs`) keys on `airYardsShare`/`wopr`/`racr`, and
`METRICS` / `METRIC_ALIASES` (`scripts/backtest-run.mjs`) list all four literally. A server-side
rename of any ratio resolves to `undefined` in these with **no throw**.

---

## 2. The edits

Both repos, byte-identical: `README.md` (data) and `docs/cross-repo-registry.md` (app). The mirrored
region is byte-identical today — the drift check in §3 step 5 is what confirms it stays so.

**Additive only.** Insert the new names into the existing `Data side` / `Triggers` prose in each
entry's established style. **Do not** renumber, refresh, strip or otherwise touch any existing
anchor — including the ones this plan quotes as stale (`readManifest:19`, `updateManifestEntry:34`,
`MIN_ADVSTATS_ROWS:35`, `validateAdvStats:407`). Those belong to the anchor decision (§6), and
touching them here would quietly pre-empt it.

**Every added name is a bare symbol or path.** No `:NNN` on anything new. If a line number seems
necessary to disambiguate, the name is too vague — qualify it with its file instead.

---

## 3. Step order

1. Apply the nine additions to `README.md` (§1).
2. **Verify additive-only by SEQUENCE, not count.** A count gate is blind to the failure it exists to
   catch: renumbering `readManifest:19` → `:23` leaves the count at 253 and passes. Capture the
   ordered list of anchors before and after and `diff` them — it must be **empty**:
   ```sh
   anchors() { sed -n '/^<!-- CR-REGISTRY-BEGIN -->$/,/^<!-- CR-REGISTRY-END -->$/p' "$1" | grep -oE ':[0-9]+'; }
   anchors README.md > /tmp/before.txt     # before editing
   anchors README.md > /tmp/after.txt      # after editing
   diff /tmp/before.txt /tmp/after.txt     # must produce no output
   ```
   (253 is the current count, useful as a sanity check — but the sequence diff is the actual gate.)
   The companion "no deletions in `git diff`" check is **not** a substitute: extending a `Data side`
   line renders as a `-`/`+` pair, so every edited line looks like a deletion.
3. Apply the identical change to the app repo's `docs/cross-repo-registry.md`.

   **On "this repo cannot edit the app":** that rule governs *decisions* — this repo does not choose
   app-side behaviour or re-derive app-side triggers. A mirrored-region edit is the one case where the
   **implementation** session writes both copies, because the format spec requires it: far-side
   correctness *"is kept correct by the both-repos-same-change rule."* Precedent: the C8 slice landed
   `2d0f951` (data) and `e32ad7c` (app) as one change. **If the app-side half cannot land for any
   reason, do not land the data-side half either** — revert and report. A one-repo landing is the
   drift this whole mechanism exists to prevent.
4. `npm test` and `npm run smoke` — both expected untouched (**570**); this slice changes no code, so
   any red means something outside the registry was edited.
5. **Anchored drift check, run from the app repo — must report no output:**
   ```sh
   diff <(sed -n '/^<!-- CR-REGISTRY-BEGIN -->$/,/^<!-- CR-REGISTRY-END -->$/p' docs/cross-repo-registry.md) \
        <(sed -n '/^<!-- CR-REGISTRY-BEGIN -->$/,/^<!-- CR-REGISTRY-END -->$/p' ../sleeper-dashboard-data/README.md)
   ```
   Anchored form only — an unanchored range match sweeps in the inline backticked sentinel mentions
   and reports drift that is not there.
6. Two commits, one per repo, landing together:
   `docs: name setManifestInProgress, the direct manifest writers, and advstats' producer/band/consumers (CR-02/04/07)`.
7. `git pull --rebase origin main`, then **push**, in each repo. No CDN purge — no served file changes.

---

## 4. Cross-repo impact

**Three entries fire — CR-02, CR-04 and CR-07 — and all three Mirrors are emitted below.**

An earlier draft argued no Mirror was owed, on the ground that the Rule fires on *listed triggers* and
no entry's `Triggers` names `README.md`. Review pointed at `CLAUDE.md:288`, which phrases the same
obligation **entry-wise**: *"whether the plan touches an entry in README.md → Cross-repo contract
registry, and if so whether Session 1 emitted that entry's `Mirror` text."* Editing an entry's
`Data side` is touching that entry. **The narrower trigger reading is not worth defending for three
entries** — emitting them costs a page and removes the argument entirely.

### CR-02 · season-totals schemaVersion & row composition

**Mirror (live `README.md`, verbatim):**

> A version bump needs both repos. **Per-season `team` is scoring-load-bearing in the app since the R2 flip (2026-07-11)** — it feeds projection Steps 3/5h attribution via `resolveAttributedTeam`, so any edit to the `aggregateWeeks` dominant-team rule (most played weeks; ties → later stint; zero played → last seen; schedule-domain normalization) changes app projections **with no app-side diff**. Treat such edits as scoring changes and route them through a graded gate. Renaming the `TEAM_` pseudo-id scheme is breaking. **F-24 (2026-08-24), schemaVersion 3→4:** `idp_*`/`punt*` are dropped from every non-`TEAM_*` row's `stats` — a denylist, never an allowlist; CR-11/12/13/19's keys, kicking and `bonus_*` are unaffected, and no `schemaVersion` key is ever written into the season file itself (manifest-only). **D-1, same change, forward-only:** `aggregateWeeks` now also infers a single-team row's bye week(s) from the schedule and writes `'B'` into an `'X'` slot (history keeps `'X'`; a slot already `'D'` is left alone) — this **falsifies a written app-side assumption with no app-side diff**: `src/utils/availabilityGrid.js:4` states the served season-totals *"never emit `'B'`"*, and `src/utils/gameLog.js:130-160` already renders a `kind: 'bye'` row straight off served `weeklyStatus` — so forward seasons now produce real bye rows in `dp/GameLogSection.jsx` with no app-side code change at all. Correct the app comment in the same change.


### CR-04 · Manifest contract

**Mirror (live `README.md`, verbatim):**

> New families are additive and need no app change (the app already keys by path). Renaming or removing `recordCount` / `schemaVersion` / `lastModified` / `inProgress` is breaking and needs both repos. **Renaming the top-level `files` map, or the per-entry `lastModified`, breaks a second app-side reader that `getManifestEntry` does not shield** — `ktcHistory.js` enumerates `Object.keys(manifest.files)` to discover KTC snapshots and compares `lastModified` for cache invalidation (CR-17); it degrades to an empty history with no error. Note the `inProgress` convention split: nflverse families register `inProgress: false` even while the current season mutates; KTC's `inProgress: true` is a legacy current-value marker, not a pattern to propagate (CR-17). **A second `allowInProgress: true` opt-in exists since in-season-app-read.md — `loadCurrentSeasonTotals` (CR-02) — and it is NOT the same situation as KTC's.** KTC's `inProgress: true` is a mislabel: a KTC snapshot is a completed, immutable capture registered with a "current value" flag that is wrong about the file. An in-progress season-totals file genuinely *is* incomplete and genuinely *should* be read while incomplete — that is the entire point of reading it. The convention this Mirror warns against is using `inProgress` to mean "latest"; season-totals uses it to mean "not finished," which is its actual, documented meaning. Do not read this Mirror's "not a pattern to propagate" line as blocking a genuinely-incomplete family from opting in the same way — read it as blocking a *mislabeled* one.


### CR-07 · nflverse advstats (view-only)

**Mirror (live `README.md`, verbatim):**

> Served-shape or sparsity-gate changes need the app loader updated in the same cycle. **Now breaks a visible surface, not just a silent loader** — Market's `RACR` column would go blank for every WR/TE with no error. Ratios are recomputed season-level and never aggregated weekly. Activation into projection is parked — see the advstats grading-findings doc.


**Mirror instruction, all three: no app-side code change is owed — the registry edit *is* the
deliverable.** Nothing about any served shape, key, floor, schemaVersion or invariant changes. Each
addition names a **data-repo** symbol the app's reviewer cannot discover on its own, because it
cannot read this side's live source. Getting those names into the app's copy is the entire point of
the change, which is why §3 steps 3 and 5 are load-bearing: the format spec states far-side
correctness *"is kept correct by the both-repos-same-change rule — never by re-deriving them at
review time."*

---

## 5. Done-definition

- [ ] **CR-04** gains `setManifestInProgress`; `scripts/migrate-f24-prune.mjs` as a **fourth**
      non-`update-*` registrar (the "three" count corrected); and `scripts/migrate-manifest-truth.mjs`
      + `scripts/migrate-drop-cfbd-raw.mjs` described as **direct writers that bypass
      `lib/manifest.mjs`**, and `bin/import-snapshot.mjs` as the **read-side** bypass
- [ ] **CR-02** gains `scripts/migrate-f24-prune.mjs` as a `nfl/season-totals/<year>.json` writer
- [ ] **CR-07** gains `aggregateAdvReceiving`, `AY_PER_TARGET_MIN`/`AY_PER_TARGET_MAX`, the four
      consumers (`loadAdvstats` ×2, `buildCohortRows`, `resolvePosition`/`buildPanelRow`), and the
      three ratio-name **definition** sites (`CORRUPT_PREDICTOR_SEASONS`, `METRICS`, `METRIC_ALIASES`)
- [ ] **No added name carries a `:NNN`**
- [ ] **No existing anchor renumbered, refreshed, stripped or otherwise touched** — the ordered
      anchor **sequence** diffs empty before/after (§3 step 2). A count check alone does not
      establish this
- [ ] CR-02, CR-04 and CR-07 `Mirror` texts emitted (§4); app-side half landed in the same change, or
      the data-side half reverted
- [ ] Every addition re-verified against live source during implementation, not taken from this plan
      on trust
- [ ] Anchored drift check reports **no output** after both repos land
- [ ] `npm test` green at **570**; `npm run smoke` green
- [ ] Both repos committed and pushed; no CDN purge; no data, manifest or source change
- [ ] `store-audit-2026-08-25.md` still modified-and-uncommitted, untouched

---

## 6. Settled decisions

- **Symbols only, no line numbers on anything added** — conformant with the format spec, and it keeps
  this slice completely independent of the anchor decision.
- **Existing anchors untouched** — even the stale ones this plan quotes. Refreshing them here would
  pre-empt a policy question this repo cannot settle alone.
- **The anchor policy is deferred to the format owner.** `README.md:1078`: *"`sleeper-dashboard` owns
  the format definition; this repo mirrors it exactly."* A registry-wide anchor change would also make
  the app side's 136 anchors non-conformant on landing, while this repo declines to touch them as
  frozen authority. That needs the app repo's agreement first — the evidence is ready in
  `registry-anchor-reconcile.md` §1 (107 anchors, ~29 stale symbol anchors, ~16 with no locator at
  all, two now pointing at closing braces and at `spearman`).
- **Additive only** — no restructuring, no re-derivation of existing lists, nothing that needs a
  parser. Six named additions is the whole change.

---

## 7. Out-of-scope observations (not edits)

1. **The anchor question is unresolved and the evidence is stale-dated the moment source moves.**
   `registry-anchor-reconcile.md` holds a verified audit; it should be raised with the app repo while
   it is fresh.
2. **`validateGameLogs` still has no distributional guard** — fifth slice running to note it
   (`advstats-2016-gate.md` §12.1, `reingest-2016.md` §12.1). gamelogs 2016 was corrupt for three
   months with nothing to catch it, and the advstats gate could not help because the families validate
   independently.
3. **CR-18 carries a stale-anchored duplicate of a symbol this slice adds.** CR-18's data-side
   `Triggers` names `aggregateAdvReceiving:476`; live is `:485`. After this lands, CR-07 will name the
   same symbol correctly and bare, while CR-18 still points nine lines off. Left alone deliberately
   (§6) — it is an anchor, not a missing name — but it is the sharpest illustration of why the anchor
   policy needs settling: the registry will contain both forms of the same fact, one right and one
   wrong.
4. **CR-04's `Data side` will still say `readManifest:19` / `updateManifestEntry:34` after this lands**
   — both stale by the anchor audit. That is deliberate (§6), and it is the clearest single argument
   for settling the anchor policy soon: this slice adds correct symbol-only names directly beside
   incorrect line-anchored ones, in the same sentence.

---

## 8. Review disposition (2026-08-30)

Seven flags, all verified against live source, all accepted. The reviewer independently confirmed all
six original additions as absent-from-entry and live-in-source; the flags refined the change rather
than challenging it.

| # | Flag | Call | Landed |
|---|---|---|---|
| 1 | `[mechanical]` count gate blind to a renumber | **Accepted** | §3 step 2 — sequence diff |
| 2 | `[ordering]` app-repo edit mechanism unstated | **Accepted** | §3 step 3 — plus an abort rule |
| 3 | `[registry-stale]` CR-04 misses `bin/import-snapshot.mjs` read bypass | **Accepted** | §1.1(d) |
| 4 | `[registry-stale]` CR-07 misses three ratio-name definition sites | **Accepted** | §1.3(d) |
| 5 | `[registry-stale]` CR-18's `aggregateAdvReceiving:476` stale duplicate | **Recorded, not fixed** | §7.3 |
| 6 | `[mechanical]` "the `airYardsShare` candidate read" is not a symbol | **Accepted** | §1.3(c) — `buildPanelRow` |
| 7 | `[cross-repo]` Self-maintenance phrases the Rule entry-wise | **Accepted** | §4 — three Mirrors emitted |

**Flag 1 is the one that would have mattered.** The gate was `wc -l` on the anchor count, which
returns 253 whether or not `readManifest:19` became `:23` — it was blind to precisely the failure it
existed to catch. It is now an ordered-sequence diff, and the "no deletions in `git diff`" companion
check is explicitly marked as no substitute, since extending a line renders as a `-`/`+` pair.

**Flag 7 settles an argument two earlier drafts spent effort on.** `CLAUDE.md:288` phrases the
obligation entry-wise — *"touches an entry"* — not trigger-wise. Editing an entry's `Data side` is
touching it. For three entries the honest move is to emit the Mirrors rather than defend the narrower
reading, which is what §4 now does.

**Flag 2 resolved an ambiguity in practice rather than in principle.** "This repo cannot edit the app"
governs *decisions*; a mirrored-region edit is the one case where the implementation session writes
both copies, as the C8 slice did (`2d0f951` + `e32ad7c`). §3 step 3 now says so, and adds the missing
abort rule: if the app-side half cannot land, revert the data-side half rather than shipping drift.
