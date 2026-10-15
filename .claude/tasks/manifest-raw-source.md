# manifest-raw-source — read manifest.json from raw GitHub, stop purging it on jsDelivr

Source: `../future_plans/in-season-notes-plan.md` → "2026-10-13 18:30 — decision: manifest off the
jsDelivr branch cache". Session 1 (planning), parent-folder session, 2026-10-13 ~18:00 UTC. Checked
against data `aeb1add`+ (origin/main), app `8706efe` (clean, level with origin). Session 2 is also a
**parent-folder** session: this is a two-sided change plus a new registry entry, which CLAUDE.md →
Cross-repo contract registry sanctions only when both sides land in one change.

## 0. Goal

`depth`, `oline`, `rosterweekly` (and, as of 17:48 UTC today, `playerstats`) end red because the
final step purges and verifies `manifest.json` on jsDelivr `@main`, and that one path is unfixable
from here (below). Make `manifest.json` stop going through jsDelivr's branch cache for the app, and
stop gating any workflow on it.

**Done means cron-deadman is green on the next depth / oline / rosterweekly (and playerstats) runs**
— see §6 step 3 for the exact sequence. Family files stay on jsDelivr, purged and verified exactly as today.

## 1. Verified facts (re-checked live 2026-10-13; Session 2 must not re-derive)

1. `@main/manifest.json` sticks: after a "finished" purge, edges kept serving the 14:05 and 14:24
   copies for hours against a pushed 15:07 one (depth run 38419231713: purge ok on attempts 3–5, verify
   stale all three; waiting out `throttlingReset` did not help). Query strings are ignored by
   jsDelivr (`?v=` returned the same stale copy). Family files verify fresh first attempt.
2. Throttling is per path and shared: every workflow purges the same `manifest.json`. Both modes
   (throttled; accepted-but-stale) are real; neither is fixable by retrying.
3. `raw.githubusercontent.com/antonwilms/sleeper-dashboard-data/main/manifest.json` returns 200,
   `access-control-allow-origin: *`, `cache-control: max-age=300`, an `etag`, and
   **`content-type: text/plain; charset=utf-8`** — `res.json()` works on it (it ignores the content
   type); do not add a content-type check. Pinned `@<sha>` and the no-ref jsDelivr path were also
   fresh, but only raw tracks `main` with a bounded (5 min) TTL and no purge.
4. App manifest read: `src/api/dataStore.js` `loadManifest` (`:28-51`) fetches
   `` `${BASE_URL}/manifest.json` `` once, 5 s timeout, `cache: 'no-cache'` (P9), validates only
   `typeof manifest.files === 'object'`, stores it under IndexedDB key `data-store/manifest`
   (`MANIFEST_TTL = 60` min), and on any failure sets `sessionDisabled = true`. It is the only place
   the manifest URL is built (grep of `src/` for `manifest.json` finds no other fetch). Two modules
   read the cached object directly (`src/utils/ktcHistory.js:97`, `src/api/ktc.js:131-140`, CR-04) — the
   cache key and object shape do not change, so they are unaffected.
5. `VITE_DATA_STORE_URL=https://cdn.jsdelivr.net/gh/antonwilms/sleeper-dashboard-data@main` (app
   `.env.local:2`; production gets its value wherever the deployment sets it — Anton owns that). Family files are fetched as `` `${BASE_URL}/${relativePath}` `` (`tryDataStore`) and
   stay that way.
6. Data side manifest purging lives in exactly one script and four workflows:
   `scripts/purge-cdn.mjs` (`MANIFEST` const, Phase B, sweep includes the manifest, `readManifest`
   dep, `checkFreshness` manifest branch) / `bin/purge-cdn.mjs` ("No paths = manifest only"), called by
   `.github/workflows/_ingest.yml:105-112` (carries depth, oline, rosterweekly, season-totals, etc.),
   `nflverse-playerstats.yml:101`, `weekly-ktc.yml:70-72`, `daily-snapshot.yml:130`.
   `daily-snapshot.yml:130` and the `else` of `weekly-ktc.yml:72` and the season-empty branch of
   `_ingest.yml:110` call the CLI with **no paths** (manifest only).
7. Registry: no entry covers CDN transport or how the manifest URL is built (grep of
   `cross-repo-registry.md` for jsdelivr/CDN/VITE_DATA finds nothing). CR-04 covers the manifest's
   *shape* only. This is a **new coupling → CR-29** (draft in §5). Highest existing id is CR-28.
8. `CLAUDE.md` (data) is **24 976 / 25 000 bytes** (`test/claudeMdSize.test.mjs`). Every edit to it
   must be net-negative or prune in the same commit (§4 step D7).

## 2. Decisions (settled — Session 2 does not reopen)

- **D1 — App reads raw first, jsDelivr second, both for `manifest.json` only.** The raw URL is
  *derived* from `VITE_DATA_STORE_URL`, not a new env var (no deployment config change): a base of the
  form `https://cdn.jsdelivr.net/gh/<owner>/<repo>@<ref>` maps to
  `https://raw.githubusercontent.com/<owner>/<repo>/<ref>/manifest.json`. A base that does not match
  that form (custom host, local test server) has **no raw candidate** and behaves exactly as today
  (single fetch of `${BASE_URL}/manifest.json`).
- **D2 — Fallback is any failure of the raw attempt**: network error, timeout, non-2xx, unparsable
  body, or missing `files` object → try `${BASE_URL}/manifest.json` (the jsDelivr copy). Only if both
  fail does the existing session-disable path run. Timeouts: raw **4000 ms**, fallback **5000 ms**
  (worst case 9 s to disable, was 5 s; the typical path is unchanged). Log the fallback once via
  `logOnce('manifest-raw-fail', …)`; the success `console.info` names the source used.
- **D3 — The manifest leaves the purge script entirely.** No best-effort jsDelivr manifest purge
  (that is the decision: stop purging and verifying it). The jsDelivr copy therefore goes stale
  and is only a fallback; this is accepted (risk R2).
- **D4 — Do not verify the raw copy in workflows.** It is GitHub itself behind a 5-minute cache; a
  verify step could only add a new flake, and deadman does not need it. (The plan's "verify raw
  instead, or drop that step" → drop.)
- **D5 — New date-keyed paths keep their family purge.** With a raw manifest, the app can see a new
  path (`snapshots/<date>.json`, `ktc/snapshot-<date>.json`) seconds after the push, possibly before
  jsDelivr has resolved the new commit, and a 404 may be cached. So the job must purge and verify that
  path (it already does for ktc; `daily-snapshot.yml` today purges only the manifest on the stated
  theory that a new path has "no cached copy" — that theory depended on the jsDelivr manifest gate and
  no longer holds). `daily-snapshot.yml` therefore changes from "purge manifest" to "purge the new
  snapshot path".
- **D6 — Keep from the previous slice**: "a throttled purge is still verified" for family files
  (`aeb1add`). Nothing else in `scripts/purge-cdn.mjs` changes except the manifest removal.
- **D7 — Registry: new CR-29**, not an edit of CR-04 (different surface: transport, not shape).
  Both registry files get the identical entry; both CLAUDE.md "all 28 `CR-NN` entries" → 29.

## 3. Cross-repo order

App first, then data (CLAUDE.md → Cross-repo contract registry; memory: registry edits land app side
first). **Gate between them: the app change must be live in production before data stops purging.**
Until a build with D1/D2 is deployed, the deployed app still reads the jsDelivr manifest, which D3
leaves to go stale. Session 2 pushes the app commit, then **asks Anton to confirm the deployed bundle
contains the change** (e.g. the production bundle's network tab shows `raw.githubusercontent.com`)
before pushing the data commit. Anton owns how the app is deployed; do not guess.

## 4. Steps

### A. App repo (`sleeper-dashboard`), one commit

**A1. `src/api/dataStore.js`**

- Add an exported pure helper:
  `export function rawManifestUrl(baseUrl)` → `string | null`. Regex on the trimmed base (no
  trailing slash tolerated: strip one): `^https://cdn\.jsdelivr\.net/gh/([^/@]+)/([^/@]+)@([^/]+)$`
  → `` `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/manifest.json` ``; anything else
  → `null`. (A sha ref maps to a raw sha URL — also correct and immutable.)
- `loadManifest`: keep the placeholder guard, the `getCache('data-store/manifest')` early return and
  `setCacheWithMeta` exactly as they are. Replace the single `try` with an ordered candidate list:
  `[rawManifestUrl(BASE_URL) (4000 ms), `${BASE_URL}/manifest.json` (5000 ms)]` with nulls dropped,
  looping with the shared validation (`res.ok`, `res.json()`, `typeof manifest.files === 'object'`).
  First success wins and is cached under the same key with the same TTL. If a non-last candidate
  fails, `logOnce('manifest-raw-fail', …)` (message names the failed URL and the reason) and continue;
  if the last fails, the existing `logOnce('manifest-fail', …)` + `sessionDisabled = true` + `return null`.
- Keep `fetchWithTimeout` and its `cache: 'no-cache'` unchanged.
- Update the header comment above `loadManifest` (one paragraph: raw primary, why — jsDelivr `@main`
  manifest staleness, in-season-notes 2026-10-13 18:30 — and CR-29).

**A1b. R4 amendment (2026-10-15, in-season-notes "D-70 closed; review of manifest-raw-source.md") —
body-vs-entry check, `src/api/dataStore.js` + eight persist sites.** The raw manifest can list a new
`lastModified` before jsDelivr serves the new bytes; a loader would then cache the *old* body under the
*new* `lastModified` and keep it until the next change (typically a week). Guard it app-side:

- Verified 2026-10-15 against the live store (all manifest entries with a local file): data writes
  `generatedAt` **0–73 ms before** the entry's `lastModified` (`updateManifestEntry` stamps after the
  file write; 156/156 within 0.1 s). So the review note's literal "`generatedAt` ≥ `lastModified`"
  would flag every file; the check is **"not more than `GENERATED_AT_SKEW_MS = 60_000` older"**.
- Add `export function expectedRecordCount(relativePath, json)` → `number | null`, a prefix table
  matching how each writer computes `recordCount` (verified per family on the live store):
  `college/` → `json.playerCount`; `nfl/season-totals/` → `Object.keys(json).length`;
  `nflverse/{advstats,depth,gamelogs,oline,roster,rosterweekly,schedule,snaps,teamcontext}/` →
  `json.rowCount`; `enrichment/` → `json.entries.length`; `ktc/snapshot-` → `json.length`;
  `snapshots/` → `Object.keys(json.players).length`; anything else (incl. `nflverse/draft/`, whose
  `recordCount` is not derivable from the body) → `null`. A non-number result → `null`.
- Add `export function bodyMatchesEntry(relativePath, json, entry)` → `boolean`: `false` if
  `expectedRecordCount` is a number and `!== entry.recordCount`, or if `json.generatedAt` is a string
  and `Date.parse(entry.lastModified) - Date.parse(json.generatedAt) > GENERATED_AT_SKEW_MS`; else
  `true` (unparseable dates → that half is skipped). Pure.
- `tryDataStore`: after `validate` passes, if `!bodyMatchesEntry(relativePath, json, entry)` →
  add `relativePath` to a module-level `staleServed` Set and
  `logOnce(`stale-body:${relativePath}`, …)` naming the path, the expected/actual count and the
  `generatedAt`/`lastModified` pair; otherwise delete it from the Set. **Still return `json`** (use the
  body this session — it is a valid, merely older file). Return type is unchanged.
- `export function wasServedStale(relativePath)` → `staleServed.has(relativePath)`.
- Persist sites — wrap the cache write in `if (!wasServedStale(path))` (the returned value is
  unchanged): `nflRoster.js` (`:94-99` write), `advStats.js` (`:74-79`), `nflSchedule.js` (`:84-89`),
  `nflGameLogs.js` (`:90-95`), `teamContext.js` (`:106-111`), `nflDraft.js` (`:118-128`, both writes),
  `sleeperStats.js` (`:212` and `:388`), `cfbd.js` (`:88`; the `:102` API-path write is untouched).
  **Not guarded, deliberately:** `frozenPrior.js` (`snapshots/<date>.json` is never rewritten —
  `capture-snapshot.mjs:65` skips an existing file — so the hazard is a 404, covered by D5's purge);
  `ktc.js`, `ktcHistory.js` (a same-day KTC re-dispatch *can* rewrite `ktc/snapshot-<date>.json`,
  `update-ktc.mjs:177`, but both caches are TTL-bounded — 3 days / 1 day — not `lastModified`-keyed
  forever, so the exposure is bounded; accepted); `enrichment.js` (does not persist). The next load sees no cached record matching the `lastModified` and re-fetches.

**A2. `src/api/dataStore.test.js`** (vitest; `fetchSpy` is the shared mock — it resolves the same
manifest body for every URL):

- Existing assertions that name the manifest URL or count manifest fetches change to match D1:
  `:100` (`toBe(`${URL}/manifest.json`)` → the raw URL), and re-read the count assertions at
  `:76 :88 :110 :379 :396 :410 :426 :443 :457 :471 :533` — those stay valid when the raw fetch
  succeeds (one manifest call). The tests that make the manifest fail (`:69/:76`, `:81/:88`,
  `:528-533`) use one-shot mocks (`mockResolvedValueOnce` / `mockRejectedValueOnce`): after the change
  the raw attempt consumes the one-shot and the jsDelivr fallback gets the default **success** mock,
  so `isDataStoreReady()` would turn true. Give each **two** one-shot failures (raw, then fallback) so
  it still asserts "data store disabled", and change the call-count expectation to two with a comment.
- New tests (names illustrative): `rawManifestUrl` table — jsDelivr `@main` → raw `main`; `@v1.2`;
  `@<40-hex>`; trailing slash; `http://localhost:5173/data` → `null`; a `<user>` placeholder base →
  still maps (the placeholder guard runs first in `loadManifest`, so assert it never fetches);
  `loadManifest` primary success fetches only the raw URL; raw 503 → second fetch to the jsDelivr
  URL and the manifest loads; raw network throw → fallback; raw 200 with a body lacking `files` →
  fallback; raw timeout (AbortError) → fallback; both fail → `isDataStoreReady()` false and exactly two
  fetches; a non-matching base fetches exactly once and never contacts `raw.githubusercontent.com`.
  Each asserts the URLs in call order, not only the count.
- R4 tests (A1b). `dataStore.test.js`: `expectedRecordCount` table, one row per prefix above plus
  `nflverse/draft/…` → `null` and an unknown prefix → `null`; `bodyMatchesEntry` — count equal +
  `generatedAt` 50 ms before → `true`; count off by one → `false`; count equal + `generatedAt` 2 days
  before → `false`; no `generatedAt` and `null` count → `true`; `tryDataStore` with a mismatched body
  returns the body **and** `wasServedStale(path)` is `true`; a later matching fetch of the same path
  clears it (these carry the real count/`generatedAt` comparison). **The mismatch → not-persisted
  test** in `nflSchedule.test.js`: its factory spreads `importOriginal` but replaces `tryDataStore` and
  `getManifestEntry` with `vi.fn()`, so the real comparison never runs there — add
  `wasServedStale: vi.fn(() => false)` to the factory and, in this test, `mockReturnValue(true)`;
  the loader must return the body's games and `setCacheWithMeta` must **not** be called. A companion
  case with `wasServedStale` → `false` asserts it **is** called (the guard, not the mock, decides).
  No "second load re-fetches" assertion (`getCacheRecord` is mocked `null`, so it would be vacuous).
  Must fail against the pre-change `nflSchedule.js` (stash it, expect red).
- Mocks: `cfbd.test.js`, `nflDraft.test.js`, `nflRoster.test.js`, `sleeperStats.test.js` mock
  `./dataStore` with a bare factory; add `wasServedStale: vi.fn(() => false)` to each so the existing
  assertions hold. `advStats`, `nflGameLogs`, `teamContext` spread the original — no change.

**A3. `docs/integrations.md`**: the manifest URL list (`:118-123`), "Fetched once per session from
`<baseUrl>/manifest.json`" (`:153`), the HTTP caching paragraph (add: the manifest alone is read from
raw GitHub, `max-age=300`, still `no-cache`), and the Failure-modes table (`:171-180`: manifest
timeout row now means *both* sources failed; add a row for "raw fails, jsDelivr works"; add a row for
"family body disagrees with its manifest entry (R4) → used for the session, not cached, warning
`stale-body:<path>`").

**A4. `docs/cross-repo-registry.md`**: add CR-29 (§5 verbatim) after CR-28 and the CR-26 Data-side/Triggers fix (§5b) inside the mirrored span;
`CLAUDE.md` line 145: "all 28" → "all 29". Nothing else in the registry changes.

**A5. Run**: `npm test`, `npm run lint`, `npm run build` (whatever the app `package.json` names them —
read it). Commit message ends `(manifest-raw-source)`. Do **not** push yet if the data commit is not
ready; push order is app, then data.

### B. Data repo (`sleeper-dashboard-data`), one commit

**B1. `scripts/purge-cdn.mjs`**

- Delete: `const MANIFEST`, the `readManifest` import and `DEFAULT_DEPS.readManifest`, the
  `local.set(MANIFEST, …)` and "no generatedAt" throw, the `checkFreshness` manifest branch (keep the
  function, SHA-256 only, same signature minus the special case; update its test), Phase B
  (`runPhase([MANIFEST])`), and `MANIFEST` from the sweep and from `out`.
- `normalisePaths`: a path equal to `manifest.json` now **throws**
  `invalid purge path: manifest.json is not purged (CR-29)` (was silently pulled out). An empty
  family list also throws `no paths to purge` — callers must not call with nothing.
- Update the header docblock (no Phase B, no manifest, CR-29 pointer) and the `purgeAndVerify`
  `@param` comment ("manifest.json … run last (D4)" is gone). `PURGE_ATTEMPTS`, `VERIFY_DELAYS_MS`,
  `checkPurgeResponse` (incl. `throttled: true`) and the throttled-is-verified loop (`aeb1add`) stay.

**B2. `bin/purge-cdn.mjs`**: no paths → usage error exit 2 (was "manifest only"); update the usage
text, the `--help` line ("manifest.json is always purged last" → "manifest.json is not purged, CR-29")
and the docblock. Exit codes otherwise unchanged (0 verified, 1 stale, 2 usage/invalid/local read).

**B3. `test/purge-cdn.test.mjs`**: the harness defaults to `paths: []` / `manifest.json` in many
tests. Rewrite to family paths; keep coverage of: purge 503 then success; throttled+fresh;
throttled+stale; stale then fresh re-purge only the stale path; never fresh (5 purges + sweep, one
`::error::`); invalid paths throw before any fetch **including `manifest.json`**; empty path list
throws before any fetch; missing local file skipped; AbortError retried; sweep failure non-fatal;
every purge 503 sleeps all but the last; non-2xx verify; header logging; `checkFreshness` is SHA-256
only. Delete: every test whose subject is Phase B / manifest freshness / `readManifest`
(`falsy readManifest()…`, `newer CDN manifest counts as fresh`, `seconds-stale manifest…`, the
manifest half of `checkFreshness`). The new `manifest.json`-throws test must fail on the pre-change
script (verify by stashing the script).

**B4. Workflows** (read each call site in full before editing; line numbers are as of `aeb1add`):

| File | Current | New |
|---|---|---|
| `_ingest.yml:105-112` | season-empty → `node bin/purge-cdn.mjs` (manifest only); else purge path | season-empty → replace the `WARN:` echo with `::error::` + `exit 1` (the family file is already committed and the raw manifest lists it; an unpurged family file is the R4 hazard, so this step must not stay green); else unchanged. Also fix the `season-keyed` input description (`:50-51`, "the manifest purge still runs either way"). Update the comment above (`(family path first, manifest last)` → family path only). |
| `nflverse-playerstats.yml:101` | `node bin/purge-cdn.mjs "${PURGE_PATHS[@]}"` | guard: `if (( ${#PURGE_PATHS[@]} )); then node bin/purge-cdn.mjs "${PURGE_PATHS[@]}"; else echo "WARN: no completed family path to purge"; fi` (an empty array would now exit 2). Fix the comment (`manifest last`). |
| `weekly-ktc.yml:70-72` | snapshot exists → purge it; else `node bin/purge-cdn.mjs` | snapshot exists → unchanged; else → no CLI call (echo that a quarantined capture has nothing to purge). Fix the comment (`verifies, manifest last`). |
| `daily-snapshot.yml:126-130` | `node bin/purge-cdn.mjs` (manifest only) | purge the new snapshot path (D5): use the path the capture **actually wrote**, not a date recomputed in the workflow: `scripts/capture-snapshot.mjs` fixes `dateKey = utcDateKey()` at capture start (`:38`, `:61`, written at `:123`), while the workflow's `SNAPSHOT_DATE=$(date -u …)` runs after Playwright and the register step and is wrong for a run that crosses 00:00 UTC (yesterday's 16:29 cron started 23:07Z). Add `setStepOutput('snapshotPath', snapshotRelPath)` in `capture-snapshot.mjs` (same helper the `update-*` scripts use; CR-22/CR-26 data side), read it as a step output, and guard on the file existing like `weekly-ktc.yml:69`; if the output is empty print a `::warning::` (never silent). Rewrite the comment: the stated theory (“a new dated snapshot path has no cached copy”) is replaced by D5. |

No change to `cron-deadman.yml`, `check-crons.mjs`, or any schedule.

**B5. Docs (data)**: `CLAUDE.md` — Commands table `Purge` row to
`` `<path>…` — jsDelivr family purge + verify; exit 1 if stale `` (shorter), registry paragraph
"all 28" → "all 29", and **prune enough that the file stays ≤ 25 000 bytes** (net must be ≤ +24 B; the
Purge row edit alone is net-negative — measure with `wc -c`, run `test/claudeMdSize.test.mjs`).
`README.md` — `scripts/purge-cdn.mjs` section (`:1533-1542`: drop the manifest freshness rule and Phase
B), the Actions sentence (`:1587`: "family files are verified before the manifest" → family files only;
the manifest is read from raw GitHub, CR-29), the CDN paragraph (`:1670`: add that `manifest.json` is
not purged). `git-workflow.md` step 5 (`:55-64`): "then `manifest.json` last (the CLI orders this for
you)" → family files only; `manifest.json` needs no purge. `README.md:1581` (daily-snapshot row: "purges the jsDelivr manifest cache") and the `checkPurgeResponse` docstring (`scripts/purge-cdn.mjs:43-44`, "shared by every workflow that purges manifest.json") change too. `data-catalog.md`: no change (no family
touched). `.claude/tasks/cdn-purge-verify.md` and `deadman-purge-throttle.md`: append one line each
pointing here (they are historical records; do not rewrite them).

**B6. Registry (data copy)**: add CR-29 (§5) at the identical position inside the mirrored span
(`<!-- CR-REGISTRY-BEGIN/END -->` — do not write either sentinel literal or a `sed` range literal in
the entry, CR-24). Then `node --test test/registry-mirror.test.mjs`, `test/registry.test.mjs`, and
`REGISTRY_MIRROR=1` with the app checked out beside (it is — parent folder) to prove byte-identity.

**B7. Run**: `npm test`, `npm run smoke`. Commit message ends `(manifest-raw-source)`. Push app first
(see §3 gate), `git pull --rebase` before each push (scheduled Actions push to main).

## 5. Cross-repo impact — CR-29 (draft entry, verbatim for both registry files)

```
#### CR-29 · Manifest transport (raw GitHub primary, jsDelivr fallback) *(new — manifest-raw-source.md, 2026-10-13)*
- **App side:** `src/api/dataStore.js` — `rawManifestUrl` (derives `https://raw.githubusercontent.com/<owner>/<repo>/<ref>/manifest.json` from `VITE_DATA_STORE_URL` when that has the form `https://cdn.jsdelivr.net/gh/<owner>/<repo>@<ref>`) and `loadManifest` (raw first, `${VITE_DATA_STORE_URL}/manifest.json` second, session disabled only if both fail). Family files are unchanged: `` `${VITE_DATA_STORE_URL}/<path>` `` via `tryDataStore`.
- **Data side:** `manifest.json` at the repository root of a public repository, committed in the same commit as the family files it indexes; `scripts/purge-cdn.mjs` and `bin/purge-cdn.mjs` (purge and verify family paths only; `manifest.json` is rejected as a path); the purge call sites in `.github/workflows/_ingest.yml`, `nflverse-playerstats.yml`, `weekly-ktc.yml`, `daily-snapshot.yml`.
- **Invariant:** the app can read `manifest.json` from `raw.githubusercontent.com/<owner>/<repo>/<ref>/manifest.json`, where owner, repo and ref are the ones in `VITE_DATA_STORE_URL`; no workflow purges or verifies `manifest.json` on jsDelivr, and none may fail on its freshness; every family file a job commits (including a new date-keyed path) is purged and verified on jsDelivr before the job ends, because the raw manifest can list a path before jsDelivr has resolved the commit; a job that cannot name the path to purge fails rather than succeeding unpurged; and because that window cannot be closed from the data side alone, the app checks every family body against its entry before persisting it — `expectedRecordCount(path, body)` must equal `recordCount` where derivable, and a body `generatedAt` must be no more than 60 s older than `lastModified` — and a mismatched body is used for the session but never cached under that `lastModified`.
- **Direction:** both
- **Triggers:** `rawManifestUrl`, `loadManifest`, `expectedRecordCount`, `bodyMatchesEntry` and `wasServedStale` in `src/api/dataStore.js` and the `wasServedStale` guards in its eight persisting loaders, the value of `VITE_DATA_STORE_URL`  ‖  how any writer computes `recordCount` or stamps `generatedAt` relative to `updateManifestEntry` in `lib/manifest.mjs`,  `scripts/purge-cdn.mjs`, `bin/purge-cdn.mjs`, the purge steps of `.github/workflows/_ingest.yml`, `nflverse-playerstats.yml`, `weekly-ktc.yml`, `daily-snapshot.yml`, and the repository's visibility, default branch name or owner/name
- **Mirror:** Renaming or transferring the repository, renaming `main`, making it private, or moving `manifest.json` off the repository root breaks the raw candidate and the app silently falls back to the jsDelivr manifest, which is no longer purged and can be hours stale — **nothing app-side goes red**; update `VITE_DATA_STORE_URL` and `rawManifestUrl` in the same cycle. Changing the base URL to a form `rawManifestUrl` does not match turns the raw candidate off with no error (the capture build in `daily-snapshot.yml:75` deliberately uses a `raw.githubusercontent.com` base, which does not match, so it reads the manifest exactly as before). A workflow that adds a purge of `manifest.json` re-creates the throttling red this entry removed; a workflow that commits a new family path without purging it exposes a possible cached 404. The raw copy lags a push by up to 5 minutes (`max-age=300`), the jsDelivr family file lags by at most the job's verify loop: a manifest that is briefly *older* than the files is harmless (older `lastModified`, newer bytes), a manifest *newer* than a stale family file is not (the app would cache stale bytes under the new `lastModified`) — which is why the job's family verify must finish before the job succeeds, and why the app refuses to cache a body that disagrees with its entry. Changing what a family's `recordCount` counts, or writing `generatedAt` more than 60 s before the manifest stamp, makes every load of that family look stale: nothing goes red, the app just stops caching it and re-fetches each session — update `expectedRecordCount` in the same cycle.
```

### 5b. Other registry entries this change touches (quoted by id, per the standing rule)

- **CR-17** (KTC snapshot shape) — trigger hit: `weekly-ktc.yml` purge lines. Quarantine rule
  untouched (a quarantined capture still writes only `ktc/quarantine/`, is never registered, and now
  calls no purge); path and bare-array shape unchanged. Mirror: no action, nothing it lists changes.
- **CR-22** (daily snapshot capture) — trigger hit: `daily-snapshot.yml`, and
  `scripts/capture-snapshot.mjs` with the new step output. No app surface the workflow drives changes.
  Mirror: no app action.
- **CR-26** (snapshot read-back) — path template `snapshots/<date>.json`, UTC-date keying and manifest
  key unchanged. **Registry fix riding along (plan-reviewer, registry-stale):** CR-26's Data side omits
  `scripts/capture-snapshot.mjs`, the writer of the served file; add it to CR-26's Data side and
  Triggers in both registry copies, in the same mirrored-span edit as CR-29.
- **CR-04** (manifest contract) — trigger hit: the validator block in `src/api/dataStore.js` (A1b
  reads `recordCount` and `lastModified` per entry). No field name or shape changes; the new
  *semantic* dependency on `recordCount` is owned by CR-29's Invariant/Mirror, not CR-04. Mirror: no
  action.

Reviewer note: CLAUDE.md says the registry entry format has exactly the six fields above in that
order, and `Triggers` uses `‖` — both honoured.

## 6. Acceptance / verification (Session 2 runs; Session 1 re-checks from the diff)

Offline:
- App: `npm test`, lint, build green; the new `dataStore.test.js` cases fail against the pre-change
  `dataStore.js` (stash the source, run the file, expect red on the fallback tests).
- Data: `npm test` (the purge tests as listed, the registry tests, `claudeMdSize`), `npm run smoke`.
- `grep -rn "purge-cdn.mjs$\|purge-cdn.mjs *$" .github` finds **no** call without a path argument.
- `diff` of the mirrored registry span between the two repos is empty (CR-24 test with
  `REGISTRY_MIRROR=1`).

Live (after both are pushed and the app deploy is confirmed, §3):
1. `curl -sI https://raw.githubusercontent.com/antonwilms/sleeper-dashboard-data/main/manifest.json`
   still shows `access-control-allow-origin: *` and a 200.
2. In the Browser pane load the deployed app (or `preview_start` against the built app with the same
   `.env`), read the network log: the first manifest request is `raw.githubusercontent.com`, 200, and
   the data store reports ready. Block that host once (devtools or a bad ref in a local build) and
   confirm the jsDelivr fallback loads and the console shows the one-time warning.
3. **Deadman sequence** (this is the Done). First one direct run proving the new purge path:
   `GITHUB_REPOSITORY=antonwilms/sleeper-dashboard-data node bin/purge-cdn.mjs nflverse/oline/2026.json`
   must print `cdn-purge: 1/1 verified` and no `manifest.json` line. All four families committed
   today (`7ed3f98`, `b170170`, `098a185`, `6814121`), so a dispatch will usually be a **no-change run
   that skips the purge step and would have been green before this change** — it proves nothing about
   the fix alone; require the direct run (or one dispatched run that changed data and shows
   family-only `n/n verified`). The data push also re-triggers `cron-deadman.yml` (`on: push`) before
   any dispatch; that run is **expected red** (the four latest runs are still failures), so Session 2
   does not stop on it. Then dispatch, one at a time, waiting for each run to finish
   before the next (parallel dispatches race on `manifest.json` in `git pull --rebase` — this already
   cost a round): `nflverse-depth`, `nflverse-oline`, `nflverse-rosterweekly`, `nflverse-playerstats`.
   Each must conclude **success** (a no-change run is success; a changed run exercises the new
   purge path and must show `cdn-purge: n/n verified` for family paths only and no `manifest.json`
   line). Then `gh workflow run cron-deadman.yml` and confirm it concludes **success** with no row
   `failed`/`missed` (`nflverse-snaps.yml` legitimately reports `ok-bootstrap`). Report the four run ids and the deadman run id.
4. If any of the four ends red, stop and report — do not retry in a loop, do not re-add a manifest
   purge.

## 7. Risks and what is deliberately out of scope

- **R1 — the app deploy gap** (§3). Mitigated by the order and the confirm gate.
- **R2 — the fallback copy is stale by design** (D3). It is used only when raw fails; a stale
  fallback is the old failure mode, not a new one, and is bounded by the next family-file change.
  If it ever matters, a once-per-day best-effort manifest purge is a separate, optional slice.
- **R3 — raw lag (≤ 5 min) after a push** means a freshly pushed capture can be invisible for a few
  minutes. Harmless direction (old manifest, new bytes; a changed `lastModified` re-fetches next time).
- **R4 — the opposite direction** (raw manifest newer than a stale jsDelivr family file): bounded by
  the family purge+verify finishing inside the job (D5, CR-29 Mirror), **and** guarded app-side by
  A1b (amended 2026-10-15): a mismatched body is used for the session but not cached, so the next
  load re-fetches. Residual: `nflverse/draft/` has no derivable count (its `generatedAt` still
  guards it), and a stale body with an identical count and no `generatedAt` (season-totals) passes —
  bounded by the family purge as before.
- **R5 — GitHub rate limits on raw** are generous for a single-user app (one request per session per
  60-minute cache TTL); not mitigated.
- Out of scope: commit-pinned URLs for family files (plan: only if family files start sticking);
  changing `cron-deadman` or `check-crons.mjs`; the GitHub cron lateness; any `lib/manifest.mjs`
  change; `ktcHistory.js`/`ktc.js` (read the cached object, unaffected).

## 8. Touch list

App: `src/api/dataStore.js`, `src/api/dataStore.test.js`, the A1b persist sites
(`src/api/{nflRoster,advStats,nflSchedule,nflGameLogs,teamContext,nflDraft,sleeperStats,cfbd}.js`),
`src/api/nflSchedule.test.js` (R4 test), `src/api/{cfbd,nflDraft,nflRoster,sleeperStats}.test.js` (mock line),
`docs/integrations.md`,
`docs/cross-repo-registry.md`, `CLAUDE.md` (one number).
Data: `scripts/capture-snapshot.mjs` (one step output), `scripts/purge-cdn.mjs`, `bin/purge-cdn.mjs`, `test/purge-cdn.test.mjs`,
`.github/workflows/{_ingest,nflverse-playerstats,weekly-ktc,daily-snapshot}.yml`, `CLAUDE.md`,
`README.md`, `git-workflow.md`, `cross-repo-registry.md`, `.claude/tasks/{cdn-purge-verify,deadman-purge-throttle}.md`
(one pointer line each).
Not touched: `lib/**`, any served data file, `manifest.json`, `cron-deadman.yml`, `check-crons.mjs`.

## Post sign-off (2026-10-15)

- `daily-snapshot.yml` empty/missing `snapshotPath` branch: `::warning::` → `::error::` + `exit 1`, to match the CR-29 Invariant ("a job that cannot name the path to purge fails rather than succeeding unpurged"). Supersedes the B4 table's "print a `::warning::`".
