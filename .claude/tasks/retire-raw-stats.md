# Retire `raw/stats-*.json` weekly dumps

**Type:** data/file retirement + manifest prune, **one commit**. No code-behavior change.
**Session model:** plan (opus). Implementation is a separate sonnet session — do not edit source here.

---

## Summary

Delete the 252 frozen weekly Sleeper dumps `raw/stats-<year>-<week>.json` (2012-W1 … 2025-W9)
and their 252 `manifest.json` entries, in a single commit, leaving the manifest structurally valid
and every other file/entry intact.

**Why it's safe (established):**
- No data-repo reader. `lib/sleeper.mjs` fetches weeks **live** from `STATS_BASE` at runtime;
  season aggregates live in `nfl/season-totals/`. A repo-wide sweep
  (`grep -rn "raw/stats\|stats-20\|stats/20"` over `*.mjs/*.js/*.md/*.yml/*.json` minus `raw/` and
  `manifest.json`) returns **only the 252 manifest entries themselves** — zero code/doc readers.
- No app reader (confirmed externally): `grep raw/stats` over `sleeper-dashboard/src` is empty; the
  app's `stats/<season>/<week>` cache is fed by the live Sleeper API, not these CDN files.
- No writer. `grep -rn "raw/"` over `lib/ scripts/ bin/` finds no code that writes any `raw/` file;
  these are one-time IndexedDB-export artifacts.

**Counts (verified in-place, no write):** `files` entries 345 → **93** after removal (−252). Selecting
by key-prefix `raw/stats-` and by `originalKey` starting `stats/` yield the **identical** 252-key set.
53 surviving entries still carry `originalKey`, so that manifest field remains in use.

### Preserve — do NOT delete (14 `raw/` files + their entries)

```
raw/-league-1312015497465716736.json            raw/-players-nfl.json   (consumed by update-enrichment.mjs)
raw/-league-1312015497465716736-drafts.json     raw/-state-nfl.json
raw/-league-1312015497465716736-rosters.json    raw/cfbd-players-2017.json … raw/cfbd-players-2024.json (8)
raw/-league-1312015497465716736-users.json
```

The `raw/stats-*.json` glob matches none of these (verified: every `raw/stats-*` path conforms to
`raw/stats-<digits>-<digits>.json`).

---

## Step 1 — Delete the files

From the repo root:

```sh
git rm raw/stats-*.json
```

- `git rm` removes from the working tree **and** stages the deletions in one step.
- The glob `raw/stats-*.json` is anchored on the `stats-` prefix → matches exactly the 252 dumps,
  never `-players-nfl.json` / `-state-nfl.json` / `-league-*` / `cfbd-players-*`.
- Sanity after: `git status --porcelain | grep -c '^D  raw/stats-'` → **252**; and
  `ls raw/stats-*.json 2>/dev/null | wc -l` → **0**, while `ls raw/ | wc -l` → **14**.

---

## Step 2 — Remove the 252 manifest entries

**What identifies them:** every `manifest.files[k]` whose key `k` starts with `raw/stats-`
(equivalently, whose `originalKey` starts with `stats/` — same 252-key set). They occupy one
**contiguous block** in `manifest.json` (≈ lines 298–1556; each entry is 5 lines:
`"raw/stats-YYYY-W.json": { originalKey, recordCount, inProgress }`), so the resulting diff is a clean
single-block deletion. **Remove by key pattern, not by line range** (robust to ordering).

**Who writes the manifest:** `lib/manifest.mjs`. Its only mutator is
`updateManifestEntry({ path, … })` — a **single-path upsert** (reads, sets `manifest.files[path]`,
writes via `writeJsonStable`); it has **no delete helper** and never enumerates keys. So the prune is a
one-off operation that must reproduce `writeJsonStable`'s formatting (2-space indent + trailing
newline) to keep the diff to exactly the removed entries.

**Exact prune command** (run from repo root; matches `writeJsonStable` formatting so key order and
all surviving fields are preserved verbatim):

```sh
node -e '
  const fs = require("fs");
  const m = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
  let n = 0;
  for (const k of Object.keys(m.files)) if (k.startsWith("raw/stats-")) { delete m.files[k]; n++; }
  fs.writeFileSync("manifest.json", JSON.stringify(m, null, 2) + "\n");
  console.log(`removed ${n} entries; remaining ${Object.keys(m.files).length}`);
'
```

Expected stdout: **`removed 252 entries; remaining 93`**. Then stage: `git add manifest.json`.

- Deleting keys in place preserves the insertion order of the 93 survivors → no spurious reordering.
- **Leave `generatedAt`/`exportedAt` untouched** for a surgical diff (only the 252 blocks vanish).
  Bumping `generatedAt` to now would be truthful but is cosmetic — the app gates on per-file
  `lastModified`, not top-level `generatedAt`. Recommendation: don't bump.

---

## Step 3 — Re-registration check (deletion won't be undone)

Confirmed none of these re-add `raw/stats` entries on their next run:

| Script | Why it can't re-add `raw/stats` |
|---|---|
| `lib/manifest.mjs` `updateManifestEntry` | Single-path upsert; only ever called with the caller's own data path (`nfl/…`, `nflverse/…`, `snapshots/…`, `grading/…`). Never called with a `raw/stats` path. |
| `scripts/register-snapshots.mjs` | Iterates `snapshots/*.json` only (`listDir('snapshots')`); registers those keys. Never touches `raw/`. |
| `bin/import-snapshot.mjs` | Imports `snapshots/<date>.json` only; verifies `manifest.files[snapshots/<date>.json]` by key. Never touches `raw/`. |
| `scripts/update-{nfl,cfbd,ktc,roster,draft,playerids,advstats}.mjs` | Each writes its own data path + one `updateManifestEntry` for that path. None write `raw/`. |

The original `raw/stats` rows came from a **one-time** IndexedDB export, not any ongoing script.
Nothing regenerates them.

---

## Step 4 — Validation that must stay green

- **There is no manifest structural validator.** `lib/validate.mjs` exports only data-shape
  validators (`validateNflSeason`, `validateCfbd…`, `validateKtc`, `validateRoster`, `validateDraft`,
  `validatePlayerIds`, `validateAdvStats`, `validateEnrichmentShape`, `findNonFinite`) — none inspect
  `manifest.json`. No test asserts a manifest entry count (sweep of `test/` for `raw/`, `manifest.files`,
  `345`/`252` is empty).
- **`npm run smoke`** = `update … --dry-run` ×7 + `enrich validate` + `grade --self-test`. The dry-runs
  don't write the manifest; `readManifest()` only needs `manifest.json` to be valid JSON. The pruned
  manifest re-serializes as valid JSON (verified) → **smoke stays green** by construction.
- The only manifest reads are **by specific key** (`import-snapshot.mjs:212`,
  `register-snapshots.mjs:47`, `manifest.mjs:41`) — none enumerate or count entries, so the shrink is
  invisible to them.

**Run after the change:** `npm run smoke` (must be green) and the guard assertion:

```sh
node -e 'const m=require("./manifest.json");const b=Object.keys(m.files).filter(k=>k.startsWith("raw/stats-"));if(b.length){console.error("FAIL: raw/stats keys remain",b.length);process.exit(1)}console.log("OK: 0 raw/stats keys,",Object.keys(m.files).length,"entries")'
```

---

## Step 5 — CDN purge

After the commit is pushed to `main`, purge the manifest so jsDelivr serves the shrunk index:

```sh
curl -sf "https://purge.jsdelivr.net/gh/antonwilms/sleeper-dashboard-data@main/manifest.json"
```

- **Only `manifest.json` needs an explicit purge.** The 252 deleted files require no purge — no
  consumer (app or repo) requests those paths, so their stale CDN copies are never fetched and age out
  on jsDelivr's own TTL. (A stale cached manifest still listing `raw/stats` wouldn't break the app
  either, since it looks up by key and never asks for them — the purge just keeps the served index
  truthful.)
- Backstop: every weekly Action (`weekly-ktc`, `weekly-nflverse-roster`, …) already purges
  `manifest.json`, so it would refresh within a week regardless; the manual curl makes it immediate.

---

## Single-commit sequence

```sh
cd <repo root>
git rm raw/stats-*.json                                  # 252 deletions, staged
node -e '…prune snippet from Step 2…'                    # manifest.json → 93 entries
git add manifest.json
npm run smoke                                             # must be green
node -e '…guard assertion from Step 4…'                  # must print OK
git status --porcelain | grep -c '^D'                    # expect 252
git commit -m "Retire raw/stats-*.json weekly dumps (unused frozen IndexedDB exports) + manifest entries"
git push
curl -sf "https://purge.jsdelivr.net/gh/antonwilms/sleeper-dashboard-data@main/manifest.json"
```

Expected commit: 252 file deletions + 1 `manifest.json` modification (−252 entry blocks)
+ docs (Step: Docs) + 1 new test (Step: Tests).

---

## Docs updates

This repo has no `docs/` dir — targets are README.md and CLAUDE.md.

- **README.md line 439 — required edit.** The `raw/<name>.json` section lists weekly stats as raw/
  contents:
  > before: …league data, roster snapshots, the Sleeper player map, **weekly stats,** etc.
  > after:  …league data, roster snapshots, the Sleeper player map, etc.
- **README.md line 56** (`raw/  — Everything else exported from IndexedDB`): **no change** — stays
  accurate; the league/players/state/cfbd survivors are still "everything else."
- **README.md line 472** (`files[*].originalKey` doc) and the line-453 example
  (`nfl/season-totals/2024.json` with `originalKey`): **no change** — 53 survivors still carry
  `originalKey`, and the documented example was never a `raw/stats` row.
- **CLAUDE.md** `raw/` Navigation-map row ("Unprocessed Sleeper API responses and CFBD player
  manifests"): **no change** — the survivors (league/players/state = Sleeper API responses;
  cfbd-players = CFBD manifests) keep the description accurate. No invariant or cross-repo-contract
  row mentions `raw/stats`, so nothing else to touch.

Net: one sentence in README. (Confirmed by sweep that no other doc names `raw/stats`.)

---

## Tests to add

**Add a small regression guard** — `test/manifest.test.mjs` (the `npm test` → `node --test` runner
auto-discovers `test/*.test.mjs`):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { readManifest } from '../lib/manifest.mjs';

test('manifest: no retired raw/stats- entries remain', () => {
  const m = readManifest();
  const leftover = Object.keys(m.files).filter(k => k.startsWith('raw/stats-'));
  assert.deepEqual(leftover, [], `unexpected raw/stats entries: ${leftover.length}`);
});

test('manifest: no raw/stats-*.json files on disk', () => {
  const present = fs.readdirSync('raw').filter(f => f.startsWith('stats-'));
  assert.deepEqual(present, [], `unexpected raw/stats files: ${present.length}`);
});
```

This pins the retirement (guards against a re-add or an accidental restore) and runs inside `npm run
smoke`. Do **not** assert a hard entry count (e.g. `=== 93`) — that would break on every legitimate
future file addition; assert the invariant (zero `raw/stats`) instead.

*Out of scope (note only):* a broader "every `manifest.files` key resolves to a file on disk"
integrity validator would be a nice general guard, but it's a larger, separate change and not needed
to make this retirement safe.

---

## Cross-repo impact

**Functionally none — the manifest simply shrinks (345 → 93 entries).**

- **App reads the manifest by specific key, not by enumeration.** `dataStore.js getManifestEntry(key)`
  looks up one path and gates on `schemaVersion`/`inProgress`/`lastModified` (per the Manifest-contract
  row in both CLAUDE.md files). The external grep (`raw/stats` over `sleeper-dashboard/src` → empty)
  confirms the app never constructs a `raw/stats` key, so removing those entries cannot break a lookup.
  Season-week stats reach the app from the **live Sleeper API**, not from these CDN files.
- **No contract field changes, no `schemaVersion` bump.** Field names/shape of the manifest and of
  every surviving entry are untouched.
- **Sibling repo must mirror: nothing functional.** No app code change is required. Optional only:
  if any app-side doc inventories the served file set, it can note the `raw/stats` dumps are retired —
  but there is no code dependency to update.
- **Signal registry (`docs/signal-registry.md`, app repo): no flag required.** `raw/stats` is not an
  ingested source for any computed signal (it has no reader); the stats coverage the app actually uses
  is served by `nfl/season-totals/` (2012–present), which is unchanged. Historical coverage of every
  ingested field/source is unaffected.

---

## Done-definition checklist (Session 2)

1. `git rm raw/stats-*.json` → 252 staged deletions; `ls raw/ | wc -l` = 14.
2. Run prune snippet → `removed 252 entries; remaining 93`; `git add manifest.json`.
3. README.md line 439 edit; new `test/manifest.test.mjs`.
4. `npm run smoke` green; guard assertion prints OK; `npm test` green (incl. new test).
5. Single commit (252 deletions + manifest + README + test); push.
6. `curl` purge `manifest.json` on jsDelivr.
7. PR summary: note the manifest cross-repo contract is touched but **no app change is needed**
   (manifest shrinks; app reads by key); no signal-registry flag required.
