# Repo weight — delete the unread CFBD dumps, pack the object store

**Type:** file + manifest-entry retirement (one commit) plus one local maintenance command.
No code-behaviour change, no served family touched.
**Session model:** plan (opus, this file). Implementation is a separate sonnet session — do not edit
source here.
**Sources:** E1 and E4 (`store-audit-2026-08-25.md`, queue row 6). Re-verified against live source
and live `git` state **2026-08-29** at HEAD `62985ff`.

**Working-tree note.** `store-audit-2026-08-25.md` is modified and uncommitted. **Do not stage,
commit, revert or edit it.** Nothing here touches it.

---

## 1. Verified facts

### 1.1 · E1 — the eight files, and that nothing reads them

| Fact | Live |
|---|---|
| Files | `raw/cfbd-players-2017.json` … `2024.json`, **8 files, 207,605,437 bytes (207.6 MB)** |
| `raw/` total | 226,492,169 bytes (226.5 MB) — these eight are **91.7%** of it |
| Manifest entries | 8, all `raw/cfbd-players-*.json`; 189 entries now → **181** after |
| `raw/` entries remaining | **6** (`-players-nfl.json`, `-state-nfl.json`, four `-league-*`) |
| Readers, data repo | **zero** — `grep -rn "cfbd-players" lib/ scripts/ bin/ test/ .github/ *.md` returns nothing outside the audit itself |
| Readers, app repo | **zero.** Three textual hits are naming coincidences, re-confirmed: `src/utils/exportData.js:15-16` maps an **IndexedDB cache key** `cfbd-players/<year>/<category>` to a zip path `college/<category>/<year>.json`; `src/api/cfbd.js:40` builds the same cache key. Neither opens a file in this repo. |
| Only live `raw/` reader anywhere | `scripts/update-enrichment.mjs:50,89` → `raw/-players-nfl.json` — **preserved** |

**The prior task file says "do NOT delete" — address it, do not ignore it.**
`.claude/tasks/retire-raw-stats.md:28-33` lists these eight under *"Preserve — do NOT delete"*. That
was **scope-fencing, not a keep-rationale**: `:52` shows the deletion glob was deliberately narrowed
to `raw/stats-*`, and the only file in that list with a stated reason is `-players-nfl.json`
("consumed by update-enrichment.mjs"). `:180` calls the survivors *"still 'everything else'"*. So this
slice completes what that one deliberately left out of scope; it does not reverse a decision. Say so
in the commit message.

### 1.2 · E4 — the object store

```
count: 1734    size: 89.33 MiB
in-pack: 0     packs: 0     size-pack: 0 bytes
```

Still never packed, as the audit found (it measured 1631 / 88.34 MiB).

### 1.3 · What is actually in these files — and why deletion is still safe

Review flagged, correctly, that the audit argues deletion purely from *"nothing reads them"* and
never from **reconstructability** — which is this repo's actual doctrine. That gap is real, and the
answer changes the justification without changing the conclusion.

**The files are 70% content this repo cannot re-fetch.** Across all eight, 887,567 rows:

| Category | Rows | Ingest path |
|---|---|---|
| `receiving` / `rushing` / `passing` | 265,990 (30%) | **served** — `college/<category>/<year>.json` |
| `defensive` | 426,265 | **none** |
| `fumbles` | 58,404 | **none** |
| `kickReturns` | 41,775 | **none** |
| `interceptions` | 35,912 | **none** |
| `puntReturns` | 22,860 | **none** |
| `kicking` | 20,371 | **none** |
| `punting` | 15,990 | **none** |

`scripts/update-cfbd.mjs:33` hardcodes `ALL_CATEGORIES = ['receiving', 'rushing', 'passing']`, so the
seven remaining categories — **621,577 rows** — have no ingest path at all. Re-fetching them would
need new code, a live `CFBD_API_KEY`, and CFBD still serving 2017.

**But the data is not destroyed by this change — it is archived, and that is verified, not assumed:**

```
$ git cat-file -s 82235d2:raw/cfbd-players-2017.json
23573639
```

The content is retrievable from `82235d2` **byte-identical** (sha256 of `git show` output matches the
working-tree file). And the mechanism is already proven in this repo: `raw/stats-2012-1.json`,
deleted by `retire-raw-stats.md`, is **still retrievable today** at 345,084 bytes. §2's commitment to
never rewrite history is exactly what keeps that true — the 207.6 MB stays in the object store either
way, which is the same fact that makes the clone-size claim false.

**So the honest justification is three-part, not one:** nothing reads them, *and* they stay
permanently recoverable from a named commit, *and* history is never rewritten. Recovery is one
command:

```sh
git show 82235d2:raw/cfbd-players-2017.json > raw/cfbd-players-2017.json
```

Put that command in the commit message. A future reader finding "deleted 208 MB of CFBD data" must
not have to work out that 70% of it has no ingest path *and* that it is one command away.

### 1.4 · Two audit claims that do not survive checking

- **"`enrich validate` flags every player added since as an orphan."** It does not — `node bin/enrich.mjs validate`
  runs **clean** today ("All files valid"). The playerId existence check has nothing to check:
  `coaching` (95 entries) and `scheme` (0) are team-keyed, and the two player-keyed files —
  `injuries` and `notes` — are both **0 entries**. The stale map is a latent problem, not a current
  one. See §7.
- **"a 15-month-old snapshot."** `raw/-players-nfl.json` was committed **2026-05-18**; the audit ran
  2026-08-25. That is ~3 months, not 15.

---

## 2. What this actually saves — the honest accounting

The audit says E1 *"removes 41% of every clone and checkout."* **Half of that is right**, and the
half that is wrong changes what this slice is for. Worked through against live state:

| Surface | Effect | Why |
|---|---|---|
| Working tree | **−207.6 MB**, immediately | `git rm` |
| Actions checkout | **−207.6 MB per run**, ~16 scheduled runs/week | **Thirteen** workflows use bare `actions/checkout@v4`; **no workflow sets `fetch-depth`**, so each gets the v4 default shallow checkout (single commit) — it materialises the current tree, not history |
| Full `git clone` | **no change** | The blobs stay reachable from `82235d2` ("Initial data export"), the **only** commit that touches them. Shrinking a clone would need a history rewrite |
| Local `.git` | **no change from E1**; E4 packs 1734 loose objects (89.33 MiB) | Deletion does not unreference historical blobs |
| Clone transfer size | **no change from E4** | GitHub already serves packed objects; `git gc` is local-only |

**A history rewrite is explicitly out of scope.** It would invalidate every existing clone and every
commit sha this repo's task files, registry entries and Invariant-1 exception cite by name — F-24's
`2b06c5b`, D-4's `02cf41d`, and the shas recorded in the app repo's backlog. The 207.6 MB in history
is the price of that, and it is the right price.

So: **E1 is an Actions-checkout and working-tree win. E4 is a local-disk win.** Neither makes a
`git clone` smaller. Frame the commit message that way rather than repeating the 41% figure.

---

## 3. E1 — the deletion

Five artifacts change together, in one commit: the files, the manifest entries, two new guard tests,
three doc sites, and CLAUDE.md's union-rule clause.

### 3.1 · The files

```sh
git rm raw/cfbd-players-2017.json raw/cfbd-players-2018.json \
       raw/cfbd-players-2019.json raw/cfbd-players-2020.json \
       raw/cfbd-players-2021.json raw/cfbd-players-2022.json \
       raw/cfbd-players-2023.json raw/cfbd-players-2024.json
```

Name all eight explicitly. **Do not use `raw/cfbd-players-*.json`** — a glob that silently matches
nothing (or more than intended) is the failure mode this whole audit queue exists to close.

### 3.2 · The manifest entries — a one-shot script, not a hand edit

`lib/manifest.mjs` has **no delete helper**: `updateManifestEntry` is a single-path upsert. Follow
`scripts/migrate-manifest-truth.mjs` (slice 2's precedent) rather than
`retire-raw-stats.md`'s inline `node -e`, so formatting is guaranteed by the same writer the rest of
the repo uses.

**`scripts/migrate-drop-cfbd-raw.mjs`**, `--dry-run` supported, kept in the tree:

- Selects strictly on key prefix `raw/cfbd-players-` — never a line range, never `originalKey`.
- `readManifest()` → `delete manifest.files[k]` → `writeJsonStable('manifest.json', manifest)`.
  `writeJsonStable` writes `JSON.stringify(value, null, 2) + '\n'` (`lib/io.mjs:43-48`), byte-identical
  to the file's current formatting, so the diff is exactly the removed entries.
- Guards: exactly **8** keys removed; entry count **189 → 181**; every surviving entry byte-identical;
  `python3 -m json.tool manifest.json` parses.
- Leave `generatedAt` alone or bump it — either is defensible; state which in the script header.

`originalKey` survives the prune in **45** entries (53 today, 8 removed), so that legacy field stays
in use and no doc claim about it goes stale.

### 3.3 · Three doc sites, not one

Review caught that an earlier draft swept only `data-catalog.md`. Two more assert the deleted files
exist, and one of them was *justified by their existence*:

| Site | Current text | Action |
|---|---|---|
| `CLAUDE.md:207` | `| \`raw/\` | Unprocessed Sleeper API responses and CFBD player manifests |` | drop "and CFBD player manifests" |
| `README.md:70` | `(league data, player map, CFBD player manifests, etc.)` | drop "CFBD player manifests, " |
| `data-catalog.md:224` | see below | see below |

`.claude/tasks/retire-raw-stats.md:184-186` explicitly recorded `CLAUDE.md:207` as needing **no
change** — *because* `cfbd-players` survived that slice. This slice removes that justification, so
the line has to move now. That is a dated record of a completed task and must **not** itself be
edited (§10.3); it is cited only to show the reasoning that is being superseded.

### 3.4 · `data-catalog.md:224` — the count slice 1 deferred here

The line currently reads *"…CFBD player manifests, 14 files). These 14 are registered in
`manifest.json`…"*. Slice 1 (`registry-doc-truth.md` §3.2) deliberately wrote the *fact* to survive
this deletion and left the **counts** for E1. Update both `14`s to `6`, drop "CFBD player manifests"
from the parenthetical, and note the retirement alongside the existing `raw/stats-*` sentence — that
sentence is the template.

---

### 3.5 · Two guard tests — the precedent is in the same file

An earlier draft relied on a **manual** `grep -c` to confirm the deletion stuck. That is the wrong
instrument for a revert that §4 describes as silent, and the repo already has the right one:
`test/manifest.test.mjs:12-21` holds two tests from the previous retirement slice —
*"no retired `raw/stats-` entries remain"* and *"no `raw/stats-*.json` files on disk"*.

Extend that file with the exact analogues:

```js
test('manifest: no retired raw/cfbd-players entries remain', …)   // Object.keys(m.files) prefix check
test('manifest: no raw/cfbd-players-*.json files on disk',   …)   // fs.readdirSync('raw') prefix check
```

`npm test` then goes **555 → 557**, and §4's union-rebase revert becomes a **red test** instead of a
silent success. This is the difference between the plan asserting the deletion held and CI proving it
on every run, forever.

---

## 4. The rebase hazard — the union rule is wrong for this slice

**This is the one way the slice silently undoes itself.** CLAUDE.md → Session git workflow says:

> `manifest.json`: resolve as a **union** — keep every entry from both sides.

That rule exists for concurrent **additions**, and its verification step only checks that *"the
entries this session wrote are still present"*. This slice writes no entries — it **removes** eight.
A mechanical union resolve against an Action's push would **resurrect all eight**, the manifest would
parse, every existing check would stay green, and the deletion would be silently reverted.

There is a scheduled job on nearly every day of the week (deadman daily 05:19; roster Tue, playerids
Wed, advstats Thu, schedule Fri, gamelogs+oline+playerstate Sat, teamcontext Sun, KTC Mon,
season-totals Tue), so the rebase window is not theoretical.

**Required:**

1. On any `manifest.json` rebase conflict during this slice, the union rule **does not apply to the
   eight `raw/cfbd-players-*` keys**. Keep the other side's additions; keep these eight deleted.
2. Verify **absence**, not presence, after resolving — and verify it by running `npm test`, not by
   eye. §3.5's two guard tests exist precisely so this step cannot be skipped or fudged.
3. Re-run the §3.2 count guard (181 entries) after any rebase, not just after the initial write.

**Amend CLAUDE.md in the same commit.** The union rule is deletion-blind and this slice is the first
to stress it — `retire-raw-stats.md` deleted 252 entries and never addressed it either. Add one
clause to the `manifest.json` bullet in Session git workflow: *a change whose purpose is removing
entries resolves as union-of-additions **minus** its own deletions, and verifies by grepping that the
removed keys are absent.* One sentence, and it stops the next deletion slice walking into the same
trap.

---

## 5. E4 — pack the object store

```sh
git gc --aggressive --prune=now
```

**Framed honestly:** this is a **local** operation. It shrinks this working copy's `.git` (1734 loose
objects, 89.33 MiB) by delta-compressing weekly full-file rewrites of multi-MB season JSON — the
textbook case for it. It does **not** affect clones, Actions, the CDN or the app; GitHub already
serves packed objects.

**Constraints, corrected.** The audit says *"run it when no Action is mid-push."* A local `gc` cannot
collide with a remote Action push — they share no state. The real constraint is narrower: do not run
it while **this clone** is mid-rebase or has an in-flight `git` operation. Run it after §3's commit
has been pushed and the tree is clean.

**Do not expect E1's 207.6 MB back.** Those blobs stay reachable from `82235d2` (§2). `gc` repacks
them more efficiently; it does not remove them. If `.git` does not shrink much, that is the expected
result, not a failed run.

Not a task-file-sized item on its own — it is one command with no reviewable design. It rides here
because it is the other half of the audit's queue row 6 and shares this slice's "repo weight" framing.

---

## 6. Step order

1. Run the §3.2 script with `--dry-run`; confirm exactly 8 keys and 189 → 181.
2. `git rm` the eight files, **named explicitly** (§3.1).
3. Run the script for real; verify entry count and that `python3 -m json.tool manifest.json` parses.
4. Add §3.5's two guard tests. **They must be red before step 3 and green after** — write them, watch
   them fail against a manifest that still has the entries, then confirm they pass. A guard never
   observed failing is not a guard.
5. Update the three doc sites (§3.3) and `data-catalog.md:224`'s counts (§3.4), plus CLAUDE.md's
   union-rule clause (§4).
6. `npm test` — expect **557** (555 + 2). The two pre-existing `raw/stats-` tests still resolve:
   `fs.readdirSync('raw')` works with 6 files remaining. Slice 2's field-completeness assertion covers
   fewer entries and stays green; the contiguity assertion does not cover `raw/`.
7. `npm run smoke` — regression check only; nothing invokes these files.
8. One commit: `chore: retire 8 unread raw/cfbd-players dumps (207.6 MB) + manifest entries (E1)`.
   Files: the 8 deletions, `manifest.json`, `scripts/migrate-drop-cfbd-raw.mjs`,
   `test/manifest.test.mjs`, `data-catalog.md`, `CLAUDE.md`, `README.md`.
   The message must carry §1.3's recovery command and the three-part justification.
9. `git pull --rebase origin main` — **apply §4's deletion-aware resolve**, not the plain union rule.
   Re-run `npm test` after any rebase. Then plain `git push`, never `--force`.
10. **CDN purge: `manifest.json` only.** The eight deleted paths need no purge — nothing reads them,
    and a cached jsDelivr copy of a now-absent file expires on its own. Purging a path that no longer
    exists is a no-op, not a safeguard.
11. **After the push lands and the tree is clean:** `git gc --aggressive --prune=now` (§5). Not part
    of the commit; nothing to review.

---

## 7. Cross-repo impact

**Two entries fire: CR-04 and CR-18.**

### CR-04 · Manifest contract — `Direction: data→app`

Fires because `manifest.json` is a literal data-side trigger and §3.2 removes eight entries from it.

**Mirror (live `README.md`, CR-04, verbatim):**

> New families are additive and need no app change (the app already keys by path). Renaming or removing `recordCount` / `schemaVersion` / `lastModified` / `inProgress` is breaking and needs both repos. **Renaming the top-level `files` map, or the per-entry `lastModified`, breaks a second app-side reader that `getManifestEntry` does not shield** — `ktcHistory.js` enumerates `Object.keys(manifest.files)` to discover KTC snapshots and compares `lastModified` for cache invalidation (CR-17); it degrades to an empty history with no error. Note the `inProgress` convention split: nflverse families register `inProgress: false` even while the current season mutates; KTC's `inProgress: true` is a legacy current-value marker, not a pattern to propagate (CR-17). **A second `allowInProgress: true` opt-in exists since in-season-app-read.md — `loadCurrentSeasonTotals` (CR-02) — and it is NOT the same situation as KTC's.** KTC's `inProgress: true` is a mislabel: a KTC snapshot is a completed, immutable capture registered with a "current value" flag that is wrong about the file. An in-progress season-totals file genuinely *is* incomplete and genuinely *should* be read while incomplete — that is the entire point of reading it. The convention this Mirror warns against is using `inProgress` to mean "latest"; season-totals uses it to mean "not finished," which is its actual, documented meaning. Do not read this Mirror's "not a pattern to propagate" line as blocking a genuinely-incomplete family from opting in the same way — read it as blocking a *mislabeled* one.

**Mirror instruction to the app repo: no change owed.** No field is added, renamed or removed — eight
whole entries are removed from a family the app never keys. The one app-side reader that enumerates
the map rather than going through `getManifestEntry` is `ktcHistory.js`, and it filters to KTC
snapshots; removing `raw/*` keys cannot affect it. Nothing app-side reads `raw/`.

### CR-18 · Signal registry rows (`docs/signal-registry.md`) — `Direction: data→app`

Fires because `data-catalog.md` is CR-18's **first** data-side trigger and §3.3 edits it.

**Mirror (live `README.md`, CR-18, verbatim):**

> This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

**Mirror instruction to the app repo: no row edit is owed.** `raw/` is a **non-served artifact** by
`data-catalog.md`'s own classification — it sits under *"Outside the catalog contract"*, has no
signal-registry row, and never should: CR-18's Invariant scopes to *"every ingested field, stat key
and source"*, and these are one-time IndexedDB export dumps that no ingest produces and no pipeline
consumes. Nothing here adds, removes or reclassifies an ingested field, and no served family's
historical coverage moves — the served `college/*` family is untouched on disk and in the manifest.

**The null stands on that reasoning alone.** An earlier draft told Session 2 to "confirm
`docs/signal-registry.md` has no `raw/` row" — review was right to strike it: the registry is the
**sole authority** for the app side, Session 2 must not read the sibling tree (which is checked out
locally, making the misroute easy to take), and a null that depends on a check the implementation
session is forbidden to perform is not a discharge. If the reasoning above is wrong, the registry is
where that gets corrected — not `../sleeper-dashboard`.

**One caveat worth stating rather than burying.** §1.3 establishes that seven CFBD categories
(621,577 rows) have no ingest path. If any of them is ever promoted to a served family, that *is* a
CR-18 event and will need its own row — but it is an event for the slice that promotes it, not for
this one, which removes nothing from the served surface.

**CR-05 (CFBD statType keys) does not fire**, despite the filenames. Its data-side triggers are
`scripts/update-cfbd.mjs`, `lib/cfbd.mjs`, `validateCfbdCategory` — none touched. The deleted files
are raw CFBD **API dumps**, not the served `college/{passing,receiving,rushing}/<year>.json` family,
which is unchanged on disk and in the manifest.

---


## 8. Done-definition

- [ ] Eight files removed via `git rm`, **named explicitly**, no glob
- [ ] `scripts/migrate-drop-cfbd-raw.mjs` selects on the `raw/cfbd-players-` key prefix, writes
      through `writeJsonStable`, `--dry-run` supported, kept in the tree
- [ ] Entry count **189 → 181**; the 6 surviving `raw/` entries byte-identical; **45** entries still
      carry `originalKey`; `python3 -m json.tool manifest.json` parses
- [ ] **§3.5's two guard tests added, observed RED before the prune and GREEN after**
- [ ] `raw/-players-nfl.json` still present and still read by `scripts/update-enrichment.mjs:50,89`
- [ ] All **three** doc sites corrected: `CLAUDE.md:207`, `README.md:70`, `data-catalog.md:224`
      (both `14`s → `6`, parenthetical no longer claims CFBD manifests)
- [ ] **CLAUDE.md's `manifest.json` union-rule bullet gained the deletion clause** (§4)
- [ ] `npm test` green at **557**; `npm run smoke` green
- [ ] Rebase used the **deletion-aware** resolve (§4); `npm test` re-run after any rebase
- [ ] Commit message carries §1.3's `git show 82235d2:…` recovery command **and** the three-part
      justification (unread · archived in history · history never rewritten); states this completes
      `retire-raw-stats.md`'s deliberately-fenced scope; claims the Actions-checkout/working-tree
      saving, **not** "41% of every clone"
- [ ] CDN purge: `manifest.json` only
- [ ] `git gc --aggressive --prune=now` run **after** the push on a clean tree; `.git` size recorded
      before/after
- [ ] `store-audit-2026-08-25.md` still modified-and-uncommitted, untouched

---

## 9. Settled decisions

- **Deletion is justified three ways, not one** (§1.3) — unread, *and* permanently recoverable from
  `82235d2`, *and* history is never rewritten. The "unread" argument alone would not clear the bar,
  because 70% of the content has no ingest path.
- **No history rewrite** (§2) — it would break every existing clone and invalidate commit shas cited
  by name in both repos. It is also what keeps §1.3's recovery path valid, so it is load-bearing in
  both directions.
- **Named files, not a glob** (§3.1).
- **A one-shot script, not an inline `node -e`** (§3.2) — slice 2's precedent; `writeJsonStable`
  guarantees formatting.
- **Two guard tests, not a manual grep** (§3.5) — the revert §4 describes is silent, so the check
  must be automated.
- **The union rule is suspended for this slice's own deletions, and CLAUDE.md is amended** (§4).
- **E4 is framed as a local-disk win** (§5) — it does not shrink clones and will not reclaim E1's
  bytes.
- **`enrich validate`'s stale player map is out of scope** (§10.1) — the audit's stated symptom does
  not currently occur.

---

## 10. Review disposition (2026-08-29)

Seven flags, all verified against live source, all accepted. One reframed the slice's justification;
none changed its outcome.

| # | Flag | Call | Landed |
|---|---|---|---|
| 1 | `[strategy]` deletion argued from "unread", never reconstructability | **Accepted — justification rebuilt** | §1.3 |
| 2 | `[mechanical]` doc sweep missed `CLAUDE.md:207`, `README.md:70` | **Accepted** | §3.3 |
| 3 | `[edge-case]` no durable guard; manual grep instead | **Accepted** | §3.5, §6 step 4 |
| 4 | `[cross-repo]` CR-18 null contingent on reading the sibling tree | **Accepted** | §7 |
| 5 | `[registry-stale]` CR-04 omits `setManifestInProgress` | **Confirmed, deferred** | §11.4 |
| 6 | `[mechanical]` post-E1 `raw/` is 18.9 MB, not 8.4 | **Accepted** | §10.2 |
| 7 | `[mechanical]` 91.7% not 96%; thirteen workflows not twelve | **Accepted** | §1.1, §2 |

**Flag 1 was the important one, and its strongest form does not hold.** The reviewer is right that
the audit — and this plan's first draft — argued only from "nothing reads them", and right that 70%
of the content (621,577 rows across seven categories) has no ingest path: `update-cfbd.mjs:33` fetches
three of ten categories. But "no ingest path" is not "destroyed". The content stays in the object
store, byte-identical, retrievable from `82235d2` — **verified empirically**, including the proof that
`raw/stats-2012-1.json` from the *previous* retirement slice is still retrievable today. The right
answer was to rebuild the justification (§1.3) and put the recovery command in the commit message,
not to abandon the deletion or to keep arguing from "unread".

**Flag 5 is a defect this planning line introduced.** `setManifestInProgress` was added to
`lib/manifest.mjs` by `manifest-truth.md` §2.2 and wired into `scripts/update-nfl.mjs:93,98` — a third
production manifest writer that CR-04's Data side and Triggers never gained. Neither that slice's
review nor its planning caught it. Deferred here on the same rule applied consistently: this slice
touches CR-04's `manifest.json` trigger but does not open CR-04's entry, and opening the mirrored
region requires a synchronized two-repo edit. §11.4 records it with evidence.

---

## 11. Out-of-scope observations (not edits)

1. **`raw/-players-nfl.json` is a frozen 2026-05-18 snapshot** and the audit's second E1 recommendation
   (refresh it on a cadence, or point `enrich validate` at `nfl/players-state/<latest>.json`) still
   stands as a **latent** improvement — but §1.4 shows the symptom it cites does not occur today,
   because both player-keyed enrichment files are empty. It becomes real the moment `injuries.json`
   or `notes.json` is populated. Its own slice, not this one: it changes validator behaviour, whereas
   this slice changes no behaviour at all.
2. **E3 (sparse checkout) compounds with this and is not planned here** — audit queue row 12 pairs it
   with S1/S3. After E1 the remaining `raw/` is **18.9 MB** (`-players-nfl.json` alone is 18.86 MB), so E3's marginal win shrinks accordingly;
   worth re-measuring before planning it rather than carrying the audit's pre-E1 figure.
3. **`retire-raw-stats.md`'s "Preserve — do NOT delete" list is now stale** in the sense that eight of
   its fourteen entries have been retired. That file is a dated record of a completed task, like the
   audit itself, so it should **not** be edited — noted only so a future reader does not treat it as
   a live instruction.
4. **CR-04's data-side triggers are stale — `setManifestInProgress` is missing.** Added to
   `lib/manifest.mjs:64` by `manifest-truth.md` §2.2 and called in production at
   `scripts/update-nfl.mjs:93` and `:98`, it is a **third** manifest writer alongside
   `updateManifestEntry` / `readManifest`, and it mutates the per-entry `inProgress` field CR-04's own
   Mirror names as breaking to rename or remove. Not test-only. Deferred rather than folded in
   (§10), because correcting it is a mirrored-region edit landing in both repos and this slice opens
   no registry entry. The next slice that opens CR-04 should carry it.
