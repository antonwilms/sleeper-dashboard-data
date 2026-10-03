# cdn-purge-verify — loud, retried, verified jsDelivr purge (P8)

Source: `../future_plans/in-season-notes-plan.md` § "Update 2026-10-03", P8. Session 1 (opus),
2026-10-02 ~23:45 UTC. Checked against data `f2d6de9` (origin/main), app `d2c350d`.

## Goal

Every workflow that commits served data purges jsDelivr with `curl -sf … || true`: a failed purge is
invisible and nobody checks that the CDN actually serves the new bytes. Replace the purge lines in
all four committing workflows (eight `curl` lines, fact 7) with one CLI. The CLI (1) purges and verifies the family paths
first and `manifest.json` last, (2) reads and checks the purge API response, (3) **verifies** that the CDN
now serves what was pushed, re-purging on a back-off until it does, (4) re-purges every path
once more at the end (D4), and (5) fails the job loudly (`::error::`, exit 1) if verification never
succeeds.

The investigation also found that the symptom behind P8 is **most likely not the CDN at all** but the
browser's HTTP cache in the app (§ Verified facts 4–5). That fix is app-side and out of this repo's
scope; § App follow-up carries it as a ready-to-plan item. This task still lands, because the
data side has no evidence today that the CDN caught up after any run, and the push→purge gap is
2 s (fact 3).

## Verified facts (live, 2026-10-02 23:40–23:50 UTC)

1. **Every purge in the last three weeks succeeded.** The 45 non-monitoring runs since 2026-09-14
   (`gh run list -L 120`, logs grepped): every purge response is `"status": "finished"`,
   `"throttled": false`, `"providers": {"CF": true, "FY": true}`; zero `throttled: true` or
   `false` providers. Runs with no purge lines are no-change runs. Example, schedule run
   37048924491: push 18:39:52Z, manifest purge `YKfpea9OiDN8hypm` and
   `@main/nflverse/schedule/2026.json` purge `65Io4OaYF7xPZ0cW`, both `finished` at 18:39:55Z.
   Daily snapshot 37063224404: manifest purge `SrShaBpsVFpHiIvr` finished 20:55:16Z.
   → Silent purge *failure* did not cause the 2026-10-03 report. `|| true` is still wrong: it would
   hide the next one.
2. **The CDN matches `origin/main` now.** CDN `manifest.json` vs `git show origin/main:manifest.json`:
   274 entries each, 0 `lastModified` differences; `generatedAt` 2026-10-02T20:55:13.585Z on both;
   `nflverse/schedule/2026.json` lastModified 18:39:52.477Z and `snapshots/2026-10-02.json` present.
   Same result on the `cdn`, `fastly`, `testingcf`, `gcore`, `quantil`, `originfastly` hostnames
   (FRA/AMS/RTM POPs). The schedule file's bytes on the CDN are SHA-256-identical to
   `origin/main` (`299dcf0a…`). First requests were `x-cache: MISS, MISS`, `age: 0` — nothing
   stale was held at those POPs.
3. **Purge fires ~2 s after `git push`.** Branch URLs carry `x-jsd-version-type: branch`; whether
   jsDelivr has resolved `main` to the new commit within 2 s is unknown. If a request arrives
   after the purge but before jsDelivr sees the new commit, the old content is re-cached for
   `s-maxage=43200` (12 h), **at the POP of whoever made that request** (e.g. Anton's EU POP). This race is
   **unconfirmed**, and fact 2 cannot show it either way. Verification from the runner sees only
   the runner's own POP, which is probably cold, so it cannot detect a stale fill elsewhere. A verify
   that needs attempt ≥ 2 shows only that jsDelivr took more than 15 s to resolve the branch. The
   unconditional final re-purge (D4) covers the race globally whether or not it is real.
4. **jsDelivr tells browsers to cache for 7 days.** Every response: `cache-control: public,
   max-age=604800, s-maxage=43200`, plus a weak `etag`. A CDN purge cannot reach a browser's cache.
5. **The app fetches with the default cache mode.** `sleeper-dashboard/src/api/dataStore.js:22-26`
   `fetchWithTimeout` calls `fetch(url, { signal })`; `loadManifest` (`:35-47`) keeps the manifest in
   IndexedDB for `MANIFEST_TTL = 60` minutes (`cache.js` multiplies by 60 000 ms), then calls
   `fetchWithTimeout`. The browser can answer that from its HTTP cache with a manifest **up to
   7 days old**, without contacting the CDN. A manifest anywhere between 2026-09-25 18:03Z and
   2026-10-02 18:39Z lists schedule at `2026-09-25T18:03Z` and has no `snapshots/2026-10-02.json`,
   which is exactly what the note reports. The same applies to family files fetched by
   `tryDataStore` (`:98`), which is P0's stale-body hazard.
6. **jsDelivr exposes no branch-resolution endpoint for `gh`.** Both
   `data.jsdelivr.com/v1/packages/gh/antonwilms/sleeper-dashboard-data/resolved?specifier=main`
   and `/v1/package/resolve/gh/…@main` return HTTP 500. Fix option (b), "purge the
   branch-resolution path too", has no handle to purge. Purging `@main/<file>` is the only lever,
   and re-purging after a verification failure replaces (b).
7. **Five purge sites, all `curl -sf … || true`:** `_ingest.yml:107,111` (ten callers),
   `nflverse-playerstats.yml:92,94,97`, `weekly-ktc.yml:55-56`, `daily-snapshot.yml:129`. Every
   one has `bin`, `lib` and `scripts` in its sparse checkout, so a node CLI runs in all of them.
   The purged files are in the checkout too: `manifest.json` is in every base cone, and each family
   path is in its caller's `sparse-paths` or explicit cone.
8. **No registry entry covers purging or CDN caching** (`grep -n "purge\|jsDelivr\|jsdelivr\|
   VITE_DATA_STORE_URL\|max-age" cross-repo-registry.md` → no hits). Three entries still **trigger**
   on the files this plan edits: CR-17 (`weekly-ktc.yml`), and CR-22 and CR-26 (`daily-snapshot.yml`). See
   § Cross-repo impact for why none needs a Mirror action.
11. **The playerstats purge conditions lack the `-f` test that its staging conditions have.**
    Staging (`nflverse-playerstats.yml:78,81`) checks `-f "nflverse/<fam>/${SEASON}.json"`; the
    purges (`:93,96`) do not. `nflverse/gamelogs/2026.json` does not exist on origin/main: the sparsity
    skip still sets `gamelogs_ok=true` (`scripts/update-playerstats.mjs:58-60,82-83`). Today's curl
    just purges a 404. A CLI that refuses missing files would turn the job red every Tue/Sat until
    ~week 9.
12. **The purge response keys `paths` by the full purge path**, e.g.
    `"/gh/antonwilms/sleeper-dashboard-data@main/manifest.json"` (run 37063224404). It is not keyed
    by the repo-relative path.
13. **Date-keyed paths can straddle UTC midnight on a manual run.** The commit step recomputes
    `DATE`/`SNAPSHOT_DATE` (`_ingest.yml:102`, `weekly-ktc.yml:49`) independently of the script's
    own `toISOString()` (`update-playerstate.mjs:31,116`, `update-ktc.mjs:40,138`). The crons cannot
    hit this; `workflow_dispatch` near midnight can.
9. **`daily-snapshot.yml:126-128`'s comment is stale.** It says the snapshot file "has no app-side
   reader". Since CR-26, snapshots are read back through `tryDataStore` (CLAUDE.md Invariant 4). Purging
   only the manifest is still right, because a new dated path has no cached copy to purge (the app
   only requests manifest-listed paths, so no 404 is cached first). Only the comment changes.
10. **CLAUDE.md is 24 971 bytes** against the 25 000 ceiling (`test/claudeMdSize.test.mjs`).

## Decisions

- **D1 — one CLI, `bin/purge-cdn.mjs` → `scripts/purge-cdn.mjs`.** Thin bin, logic in scripts with
  a `DEFAULT_DEPS` seam (the `scripts/update-nfl.mjs` pattern), so the retry/verify control flow is
  unit-testable without network. Not a bash function: four copies of a retry loop in YAML is the
  current problem.
- **D2 — verification, not only the purge response, is the success criterion.** A `finished`
  purge says the CDN dropped its copy; it does not say the next fill is the new commit (fact 3).
- **D3 — what "fresh" means:**
  - `manifest.json`: CDN `generatedAt` ≥ local `generatedAt` (ISO-8601 string compare is valid; both
    are `toISOString()` output, `lib/manifest.mjs:38,72`). Read the **local** value through
    `readManifest()` (`lib/manifest.mjs:19`, injected as a dep), not `JSON.parse` of the raw file. That
    keeps the script off CR-04's list of direct manifest readers. Parsing the CDN body directly is unavoidable
    and fine. "≥" not "=": another workflow may push between our push and our
    check, and a newer manifest is not stale.
  - Any other path: CDN body SHA-256 == local file SHA-256 (raw bytes, `node:crypto`). Each family
    file is written by one workflow, so a concurrent newer version is not a realistic case. Largest
    current file is ~8.6 MB (`nflverse/gamelogs/2025.json`), acceptable to fetch in CI.
  - Verification fetches the plain `cdn.jsdelivr.net/gh/<repo>@main/<path>` URL, with **no** query
    string. A cache-buster would test a different cache key than the one the app hits.
- **D4 — two phases, family paths first and manifest last, then a final sweep.** Manifest-first was
  right when the purges were fire-and-forget curls 2 s apart. With a verify loop of up to ~5 min, it
  would advertise the new `lastModified` while the family bytes are still unverified. In that window
  the app could cache a stale body under the new `lastModified` (Invariant 5's app-side invalidation;
  P0), and no later purge undoes that. So:
  - **Phase A:** the non-manifest paths, if any. **Phase B:** `manifest.json`, which starts only after
    Phase A has verified every path. If Phase A fails, Phase B **still runs**, so the new manifest
    is not left unpurged, and the run still ends red.
  - **Within a phase:** `PURGE_ATTEMPTS = 5`. Before verify attempt *i*, sleep `VERIFY_DELAYS_MS[i]` =
    `[15_000, 30_000, 60_000, 90_000, 120_000]`. Attempt 1 purges every path in the phase, waits, and
    verifies them all. Each later attempt re-purges **only the paths still failing** (purge failure or
    stale), then waits and re-verifies those.
  - **Final sweep:** one unconditional re-purge of every path, family paths then manifest, with
    response checked but no verify and no retry. A failure here prints `::warning::` and does not turn
    the run red. The sweep drops any stale fill made at any POP during the push→purge window (fact 3).
  - **Worst case:** about 10½ min of sleeps plus fetches bounded by D10. That is acceptable: no job sets `timeout-minutes`.
- **D5 — a purge call counts as failed when** the request throws or times out, HTTP is not 2xx, the
  body is not JSON, `status !== 'finished'`, `paths["/gh/${repo}@main/${path}"]` is missing (fact 12:
  the key is the full purge path, leading slash included), its `throttled === true`, or any value in its
  `providers` is not `true`. Each failure prints `::warning::` with the path and reason. It is retried on the
  next attempt and not verified on this one.
- **D10 — every network call has a timeout.** `FETCH_TIMEOUT_MS = 60_000` via
  `AbortSignal.timeout`, applied inside the injected `fetch` wrapper. Node 20's undici defaults allow
  ~5 min for headers plus ~5 min for the body per request, which could multiply into hours. A timeout
  counts as a purge failure or not-fresh, with reason `timeout`.
- **D11 — a missing local non-manifest file is skipped, not thrown.** Print `::warning::missing local
  file <path> — not purged`, and continue with the remaining paths. It does not count as a verification
  failure. This is defence in depth for facts 11 and 13. The playerstats YAML also gains the `-f`
  gates (Step 3), so the normal path never hits it. A missing local `manifest.json`, or one with no
  `generatedAt`, still throws: that is a caller bug.
- **D6 — failure is red.** After the last attempt, any path not verified → `::error::` per path
  (path, last reason, CDN vs local value), exit 1. Under Actions' default `bash -e`, that fails the
  step and the run. The data commit has already landed, which is correct: the store is right and
  delivery is not, and cron-deadman then reports the red conclusion (`check-crons.mjs:163`).
  A no-change run never calls the CLI, so it is never red for this reason.
- **D7 — the repo slug** comes from `--repo owner/name`, else `process.env.GITHUB_REPOSITORY`, else
  usage error (exit 2). Actions always sets `GITHUB_REPOSITORY`; it equals today's
  `${{ github.repository_owner }}/sleeper-dashboard-data`.
- **D8 — option (c) (commit-pinned URL via a pointer file) is deferred.** Nothing shows the CDN is
  stale after a successful purge (facts 1–2). It would change `VITE_DATA_STORE_URL` semantics, so it
  needs a registry entry. Revisit only if the verify loop's logs show stale-after-purge.
- **D9 — Invariant 8 is untouched.** Path construction (`<season>`/`<date>` substitution, the
  empty-season WARN skip) stays in YAML exactly as today. Only the `curl` lines are replaced.

## Steps

### 1. `scripts/purge-cdn.mjs` (new)

```js
export const PURGE_ATTEMPTS = 5;
export const VERIFY_DELAYS_MS = [15_000, 30_000, 60_000, 90_000, 120_000];
export const purgeUrl = (repo, path) => `https://purge.jsdelivr.net/gh/${repo}@main/${path}`;
export const cdnUrl   = (repo, path) => `https://cdn.jsdelivr.net/gh/${repo}@main/${path}`;

export const FETCH_TIMEOUT_MS = 60_000;
export const purgeKey = (repo, path) => `/gh/${repo}@main/${path}`;   // fact 12

export const DEFAULT_DEPS = {
  fetch: url => globalThis.fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }),  // D10
  sleep: ms => new Promise(r => setTimeout(r, ms)),
  readFile: p => fs.readFile(repoPath(p)),   // Buffer; repoPath from lib/io.mjs; ENOENT → D11 skip
  readManifest,                              // lib/manifest.mjs — local generatedAt (D3, CR-04)
  log: (...a) => console.log(...a),          // ::warning::/::error:: lines go through log too
};

// Pure: classify one purge response. Returns { ok: true } | { ok: false, reason }.
export function checkPurgeResponse(httpStatus, body, repo, path) { … }  // D5, body = parsed JSON or null

// Pure: freshness of one path. Returns { fresh: bool, cdnValue, localValue }.
// manifest → compare CDN JSON generatedAt with localValue (string from readManifest); else sha256 hex of both buffers.
export function checkFreshness(path, cdnBuf, local) { … }               // D3

/**
 * @param {object} opts
 * @param {string}   opts.repo   owner/name
 * @param {string[]} opts.paths  repo-relative; manifest.json is pulled out, de-duplicated, and run last (D4)
 * @param {object}  [opts.deps]
 * @returns {Promise<{ ok: boolean, results: Array<{ path, verified, skipped, attempts, lastReason }> }>}
 */
export async function purgeAndVerify({ repo, paths, deps = {} }) { … }
```

Behaviour:
- `paths` normalisation: strip a leading `./` or `/`, drop empties, de-duplicate, then remove
  `manifest.json` from the family list. It always runs as Phase B, even when not passed. No path may
  contain `..` or start with `http`; otherwise throw `Error('invalid purge path: …')` before any
  fetch.
- Phases and the final sweep as D4. Purges and verifications are sequential, in list order.
- Read local state once, before Phase A: `readFile` per family path (ENOENT → D11 skip, recorded as
  `skipped: true`), and `readManifest().generatedAt`. A falsy manifest or `generatedAt` throws before
  any fetch.
- CDN fetch for verification: `fetch(cdnUrl(...))`. Non-2xx, a network error, or (manifest) unparsable
  JSON counts as not fresh, with that reason. Record `x-cache` and `age` response headers in the log
  line when present.
- Log one line per purge (`purge <path> attempt <n>: finished CF=true FY=true` or the failure
  reason) and one line per verification (`verify <path> attempt <n>: fresh|STALE cdn=<v> local=<v>
  x-cache=… age=…`), with values shortened to 16 chars for hashes. These lines are the evidence for
  fact 3's race, so keep them even on success.
- No retry on the CDN fetch beyond the attempt loop. Every fetch is bounded by D10.
- `ok` is true iff every non-skipped path, the manifest included, verified. The final sweep does not affect `ok`.

### 2. `bin/purge-cdn.mjs` (new, thin)

```
node bin/purge-cdn.mjs [--repo owner/name] <path> [<path> …]
```
Parses argv with a hand-rolled loop over `process.argv.slice(2)` (no new dependency).
`bin/deadman.mjs` is the model for the file's shape (header doc, import from `scripts/`,
`process.exit`), not for argv: it takes no flags. `--help` prints usage, exit 0.
No paths is fine (manifest only). It resolves the repo per D7 and calls `purgeAndVerify`. Exit 0 if
`ok`, else 1; a usage error exits 2. It prints a final summary line: `cdn-purge: N/N verified` or
`cdn-purge: FAILED <paths>`.

### 3. Workflows — replace the `curl` lines only

| File | Replace | With |
|---|---|---|
| `_ingest.yml:107-112` | manifest curl + the guarded family curl | keep the `if season-keyed && empty SEASON` guard verbatim; WARN branch → `node bin/purge-cdn.mjs`; else branch → `node bin/purge-cdn.mjs "${PURGE_PATH}"` |
| `nflverse-playerstats.yml:92-98` | three curls | build `PURGE_PATHS=()`; append `nflverse/advstats/${SEASON}.json` / `nflverse/gamelogs/${SEASON}.json` under the **staging** conditions copied verbatim from `:78`/`:81`, **including the `-f` test** (fact 11 — gamelogs/2026 does not exist until ~wk 9); `node bin/purge-cdn.mjs "${PURGE_PATHS[@]}"` |
| `weekly-ktc.yml:54-56` | two curls + comment | `node bin/purge-cdn.mjs "ktc/snapshot-${SNAPSHOT_DATE}.json"`. If the capture wrote to `ktc/quarantine/` and not `ktc/`, the snapshot path does not exist locally. Gate the argument on `[[ -f "ktc/snapshot-${SNAPSHOT_DATE}.json" ]]`, else manifest only. The next step, "Fail if snapshot was quarantined" (`:61-65`), has a plain `if:`, so a red purge step would **skip** it and lose the quarantine reason. Change its condition to `always() && steps.capture.outputs.quarantined == 'true'` |
| `daily-snapshot.yml:126-129` | comment + curl | `node bin/purge-cdn.mjs`. Rewrite the comment: a new dated snapshot path has no cached copy to purge, so the manifest is the only purge needed; snapshots *are* read back via `tryDataStore` (CR-26) |

Each callsite gets `env: GITHUB_REPOSITORY` for free from Actions; do not pass `--repo` in YAML.
In `_ingest.yml` and `nflverse-playerstats.yml`, replace the `# Purge jsDelivr CDN cache — …`
comment with one that names the CLI and says it verifies, family paths first and manifest last. The
`_ingest.yml` header and `purge-path` description never mention curl; leave them alone. The
`_ingest.yml` playerstate `<date>` path needs no YAML gate: D11 skips a midnight-straddle mismatch
(fact 13).

**Job timeout:** none of the four workflows sets `timeout-minutes` (verified by grep; the default is
360 min), so D4's ~10½ min worst case needs no change.

### 4. Tests — `test/purge-cdn.test.mjs` (new)

All through `purgeAndVerify` with injected `fetch`/`sleep`/`readFile`/`log`, plus direct cases
for the two pure functions. The fake `fetch` routes on URL prefix (`purge.jsdelivr.net` vs
`cdn.jsdelivr.net`) and returns scripted responses per call index. `sleep` records its argument and
resolves immediately.

Purge-response fixtures are built from the **verbatim** jsDelivr shape (fact 12, run 37063224404):
`{"id":"…","status":"finished","timestamp":"…","paths":{"/gh/<repo>@main/<path>":{"throttled":false,"providers":{"CF":true,"FY":true}}}}`,
with the key built by literal string concatenation in the test, **not** via `purgeKey`. Otherwise
a wrong key format would pass.

1. **Happy path:** manifest + one family file; purges `finished`; CDN bytes == local → `ok`. Purge
   sequence is `[family, manifest]` (verified phases), then the sweep `[family, manifest]`. `sleep` is
   called twice with 15 000 (once per phase).
2. **Manifest last and de-duplicated:** `paths = ['manifest.json', 'nflverse/x.json',
   './nflverse/x.json']` → phase purge order `[nflverse/x.json, manifest.json]`. With `paths = []`,
   only the manifest phase runs, plus a one-path sweep.
3. **Purge HTTP 503 then success:** a `::warning::` line is logged, re-purge on attempt 2, and
   verified → `ok`.
4. **`throttled: true`** and **`providers.FY: false`**: each is a purge failure with a reason naming
   the field.
5. **Stale then fresh:** the CDN manifest `generatedAt` is older on the first verify and equal on the
   second → `ok`, with 2 phase purges + 1 sweep purge of manifest.json. With two family files, one
   fresh on attempt 1 and one stale, the fresh one is **not** re-purged on attempt 2.
6. **Newer CDN manifest is fresh** (`generatedAt` later than local) → `ok` on attempt 1.
7. **Never fresh:** family-file hash mismatch on every attempt → `ok: false`, with 5 phase purges of
   that path. **The manifest phase still runs afterwards** and verifies. Phase A's `sleep` calls equal
   `VERIFY_DELAYS_MS`, and one `::error::` line names the path.
8. **Invalid path** (`../x`, `https://…`) throws before any fetch.
9. **Missing local family file** (ENOENT): a `::warning::` is logged, the path is never purged or
   verified, `skipped: true`, the manifest still runs, and the result is `ok` (D11). A **falsy
   `readManifest()`** throws before any fetch.
10. `checkPurgeResponse` with a non-JSON body (`null`), with a `paths` key in **repo-relative**
    form (`"manifest.json"`), and with `throttled: true` → each gives `ok: false`.
11. **Fetch throws (simulated timeout, `AbortError`)** on the first purge → warning, retried, `ok`.
12. **Sweep failure is non-fatal:** a sweep purge returns 503 → `::warning::`, and the result is still `ok`.

No network in any test. `npm test` picks up the new file automatically (`node --test`).

### 5. Docs

- **CLAUDE.md** (ceiling!): add to the Commands table, after Dead-man, exactly this row (~105 bytes;
  the reviewer measured the earlier ~155-byte draft at 25 035 total, 35 over):
  `| Purge | \`bin/purge-cdn.mjs\` | \`<path>…\` — jsDelivr purge + verify, manifest last; exit 1 if stale |`.
  In the Navigation `.github/workflows/` row, change `Purge URLs: Invariant 8` →
  `Purge: \`bin/purge-cdn.mjs\`; URLs: Invariant 8`. **Prune in the same commit:** in that same row,
  replace `(D1b — runs a browser against the app repo's own build, a shape \`_ingest.yml\` cannot
  express; **phase 2** — \`cron: "29 16 * * *"\` is live since CR-22 landed in both registries, in
  addition to the \`workflow_dispatch\` trigger)` with `(D1b — a browser capture against the app's
  build, which \`_ingest.yml\` cannot express; cron + \`workflow_dispatch\`)`. The history is
  already in README → GitHub Actions. Expected total 24 986 (Session 1 simulated the three edits on the live file). Run `node --test
  test/claudeMdSize.test.mjs`. If it is still over, stop and report; do not prune other rows on your
  own initiative. Report the final byte count.
- **README → How the data is consumed** (`README.md:1501`): replace the purge sentence with: jsDelivr
  caches `@main` for 12 h at the edge and tells browsers to cache for 7 days. Workflows purge and
  verify with `node bin/purge-cdn.mjs <paths>`. Manual sessions use
  `GITHUB_REPOSITORY=antonwilms/sleeper-dashboard-data node bin/purge-cdn.mjs <paths>`.
- **README → GitHub Actions table** (`:1406-1413` and the rows not shown there): no per-row edits.
  Add one sentence under the table: every committing workflow purges through `bin/purge-cdn.mjs`, and a
  CDN that still serves old bytes after ~5 min of retries per phase fails the run (family files are verified before the manifest).
- **README → Module notes:** one short entry for `scripts/purge-cdn.mjs` (D3 freshness rules, D4
  schedule).
- **`git-workflow.md` step 5:** replace "Method: README → How the data is consumed" with the
  manual command above. Change "**`manifest.json` first**, then the data files" to "the data files,
  then `manifest.json` last (the CLI orders this for you)". Add one clause on why: the manifest must
  not advertise a new `lastModified` before the family bytes are fresh (D4).
- `data-catalog.md`: no change (no family coverage, schema or gate changes).

## App follow-up (not a mirror; app-internal, for the app repo's own Session 1)

This is P0, promoted from "unconfirmed" to "mechanism confirmed in code, symptom matching". It needs no
registry entry: fetch cache mode is app-internal, and no CR covers it (fact 8). Suggested scope:

- `src/api/dataStore.js` `fetchWithTimeout`: pass `cache: 'no-cache'` for the manifest fetch. The
  browser then revalidates with the ETag (fact 4) on every call: a 304 when unchanged, the fresh body
  when changed. The IndexedDB 60-min TTL stays as the first layer.
- Family-file fetches in `tryDataStore`: the same `cache: 'no-cache'`. Prefer it over `?v=<lastModified>`.
  Whether jsDelivr keys its edge cache on query strings is unverified, and a cache-buster could
  bypass the edge on every load.
- **Confirm before planning it** (Anton, ~1 min). In the app's own tab (the browser cache is
  partitioned per top-level site, so a blank tab will not see it), run in DevTools console:
  ```js
  const u='https://cdn.jsdelivr.net/gh/antonwilms/sleeper-dashboard-data@main/manifest.json';
  const [a,b]=await Promise.all([fetch(u,{cache:'force-cache'}),fetch(u,{cache:'no-store'})].map(p=>p.then(r=>r.json())));
  [a.generatedAt,b.generatedAt]
  ```
  Two different timestamps means the browser cache is serving an old manifest, which confirms the
  mechanism. The Network tab showing `manifest.json … (disk cache)` is the same signal.

## Cross-repo impact

**Three entries trigger on edited files; none needs a Mirror action.** Each Mirror text is quoted
below (abridged where marked; the full text is in `cross-repo-registry.md`). In every case, this
change touches only the purge lines and one comment. None of the surfaces those entries protect
changes.

- **CR-17 · KTC snapshot** (trigger `.github/workflows/weekly-ktc.yml`). Mirror: "Keep the snapshot
  a **bare array** — wrapping it in the `{ schemaVersion, generatedAt, … }` envelope every other
  family uses fails `isValidKtcSnapshot` […] Quarantined scrapes must stay in `ktc/quarantine/` and
  **must never be manifest-registered**." → No action needed. The snapshot shape, the quarantine
  path and the registration rule are untouched. The `-f "ktc/snapshot-…"` gate keeps a quarantined
  run from even purging a `ktc/` path. The `always()` change only makes the quarantine alarm fire
  more reliably.
- **CR-22 · daily-snapshot headless capture** (trigger `.github/workflows/daily-snapshot.yml`).
  Mirror: "Before renaming or restructuring any of the App-side surfaces above, check whether
  `.github/workflows/daily-snapshot.yml` depends on it […] **Nothing app-side fails when this
  drifts** […]" → No action needed. The capture steps, `app_ref`, cron and every app surface the
  workflow reads are unchanged. Only the post-commit purge line and its comment change.
- **CR-26 · snapshot read-back (frozen prior)** (trigger `.github/workflows/daily-snapshot.yml`).
  Mirror: "Renaming the `snapshots/<date>.json` template or its manifest key, re-keying captures off
  UTC date, rewriting a committed snapshot […] silently turns every frozen prior into the live one
  […]" → No action needed. The template, key, UTC dating and commit are unchanged. The corrected
  comment now *cites* CR-26 (fact 9).

Also unchanged: Invariant 8 path construction (D9) and `VITE_DATA_STORE_URL` semantics (D8 defers the
only option that would change them). CR-04 is not triggered, because the local manifest is read via
`readManifest()` (D3). The App follow-up is app-internal and is **not** a Mirror instruction.

## Touch list

New: `scripts/purge-cdn.mjs`, `bin/purge-cdn.mjs`, `test/purge-cdn.test.mjs`.
Edit: `.github/workflows/_ingest.yml`, `.github/workflows/nflverse-playerstats.yml`,
`.github/workflows/weekly-ktc.yml`, `.github/workflows/daily-snapshot.yml`, `CLAUDE.md`,
`README.md`, `git-workflow.md`.
Nothing else. No data files, no `manifest.json`, no `package.json` script (CI calls the bin directly).

## Done-definition

1. `npm test` green, including `test/purge-cdn.test.mjs` and `test/claudeMdSize.test.mjs`.
2. `npm run smoke` green.
3. `node bin/purge-cdn.mjs --help` prints usage and exits 0. `node bin/purge-cdn.mjs ../x` exits non-zero
   **before** any network call. Do **not** run a real purge from Session 2. The first live run is
   Session 1's verification.
4. `grep -rn "purge.jsdelivr" .github` → no hits. `grep -rn "|| true" .github/workflows` → no hits
   on a purge line.
5. The repo has no YAML parser dependency (do not add one). Check the four edited workflows with
   `ruby -ryaml -e 'ARGV.each{|f| YAML.load_file(f)}' .github/workflows/*.yml` (system Ruby on
   macOS). If that is unavailable, say so in the hand-back.
6. Hand-back per CLAUDE.md: SHA range, files, deviations, what each test asserts, final CLAUDE.md
   byte count.

## Verification (Session 1, after hand-back and push)

1. implementation-reviewer on the diff.
2. **Live run:** the next scheduled committing run after the push (the daily snapshot fires
   every day, roughly 19:00–22:00 UTC). In its log: purge lines `finished`, verify lines, and the
   `cdn-purge: N/N verified` summary, and the sweep lines. Record which attempt verified each path.
   Attempt ≥ 2 means jsDelivr took more than 15 s to resolve the branch (fact 3); it says nothing
   about other POPs. Record it in the P8 note.
3. **Independent check**, ≥ 5 min after that run:
   ```sh
   git fetch -q origin && curl -sS https://cdn.jsdelivr.net/gh/antonwilms/sleeper-dashboard-data@main/manifest.json \
     | python3 -c "import json,sys,subprocess;c=json.load(sys.stdin);g=json.loads(subprocess.check_output(['git','show','origin/main:manifest.json']));print(c['generatedAt'],g['generatedAt'],sum(c['files'].get(k)!=v for k,v in g['files'].items()))"
   ```
   Expect equal `generatedAt` (or the CDN one newer) and `0` differing entries.
4. Repeat 2–3 for one `_ingest.yml` caller (the nfl season-totals run, Mon/Tue 06:13 UTC), so the
   family-file SHA path is exercised live.
5. Hand the § App follow-up console check to Anton. If it confirms, open the app-side P0 task.

## Plan-review record (2026-10-03, round 1 — 11 flags, all applied)

Each flag was checked against live source before it was applied. Anton delegates these calls.

| # | Sev | Flag | Decision |
|---|---|---|---|
| 1 | HIGH | Playerstats purge conditions lack `-f`; gamelogs/2026 is absent while `gamelogs_ok=true`, so the job goes red Tue/Sat | **Applied.** Confirmed at `nflverse-playerstats.yml:78,81` vs `:93,96` and `git ls-tree`. Step 3 copies the staging conditions including `-f`. D11 makes a missing family file warn-and-skip (defence in depth). Test 9 rewritten |
| 2 | MED | Purge response `paths` key format unspecified | **Applied.** Fact 12 and D5: the key is `/gh/<repo>@main/<path>`, confirmed in run 37063224404's log. `purgeKey` was added. Test fixtures are verbatim and build the key literally. Test 10 covers a repo-relative key failing |
| 3 | MED | CLAUDE.md lands 35 bytes over | **Applied.** Shorter row. Session 1 simulated all three edits on the live file: 24 986. Session 2 stops if it is over rather than pruning freely |
| 4 | MED | CR-17/22/26 trigger on edited files | **Applied.** § Cross-repo impact quotes each entry's Mirror text and gives the no-action reason. Fact 8 corrected |
| 5 | MED | Runner-POP verification cannot observe the race | **Applied.** D4 adds an unconditional final re-purge sweep. Fact 3 and Verification 2 now state what attempt ≥ 2 does and does not mean |
| 6 | MED | Manifest-first plus a ~5 min verify widens the stale-body window | **Applied.** D4: family paths are verified first and the manifest last. The manifest phase runs even if the family phase fails. git-workflow.md step 5 reworded to match |
| 7 | LOW | No fetch timeout | **Applied.** D10: `AbortSignal.timeout(60 s)` in the injected fetch. Test 11 |
| 8 | LOW | A date-keyed path can straddle midnight on a manual run | **Applied** via D11 (fact 13). No YAML gate is added for playerstate |
| 9 | LOW | `bin/deadman.mjs` takes no argv | **Applied.** Step 2 names it as a shape model only |
| 10 | LOW | Site counts inconsistent; `_ingest.yml` header never says curl | **Applied.** Counts are now four workflows and eight lines; the header/description edit is dropped |
| 11 | LOW | Script would be a new direct manifest reader (CR-04) | **Applied.** The local `generatedAt` is read via `readManifest()` (D3), so CR-04 does not change |

## Implementation record

Session 2: `e218508` (range `5879103..e218508`). It touches the 10 touch-list files only. `npm test`: 1185
pass / 0 fail / 4 skipped. The skips are conditional skips in `panel-integration`, `registry-mirror` and
`fantasyPoints`, which this change does not touch. Smoke is green, and CLAUDE.md is 24 986 bytes. Deviations
2 (exit 2 for every pre-fetch error) and 3 (an extra KTC comment, `::error::` lines carrying
the reason) are accepted. Deviation 1 is corrected below.

## Implementation-review record (round 1, 5 flags, all confirmed against source)

| # | Sev | Flag | Decision |
|---|---|---|---|
| 1 | MED | When every purge in an attempt fails, `runPhase` skips the sleep, so a fast 503 or `throttled` burns all 5 attempts in seconds (`scripts/purge-cdn.mjs:194-197`) | **Fix.** This breaks the Goal's "re-purging on a back-off". Single-path phases (every manifest phase, and every `_ingest`/KTC Phase A) can fail no other way |
| 2 | LOW | `short()` cuts the 24-char `generatedAt` to 16, so a seconds-stale manifest logs identical values (`:34`) | **Fix.** The verify lines are the fact-3 evidence |
| 3 | LOW | Empty or missing `providers` passes `checkPurgeResponse` (`:50`) | **Fix.** Nothing shows a purge happened |
| 4 | LOW | The bin header says exit 2 is for usage errors only (`bin/purge-cdn.mjs:9`) | **Fix** (doc only) |
| 5 | LOW | Untested: a non-2xx verify, header logging, empty providers | **Fix** (tests) |

## Fix pass 1

Touch only `scripts/purge-cdn.mjs`, `bin/purge-cdn.mjs` and `test/purge-cdn.test.mjs`.

1. **`runPhase` back-off** (`scripts/purge-cdn.mjs` ~l.185-200). The sleep must happen on every
   attempt except a fully failed **last** attempt:
   ```js
   const last = i === PURGE_ATTEMPTS - 1;
   if (purged.length || !last) await d.sleep(VERIFY_DELAYS_MS[i]);
   for (const p of purged) await verifyOne(p, attempt);
   ```
   Keep the delay index attempt-based. Do not change anything else in `runPhase`.
2. **`short()`** (`:34`): shorten only a 64-char lowercase hex string (a SHA-256), i.e. `typeof v
   === 'string' && /^[0-9a-f]{64}$/.test(v) ? v.slice(0, 16) : v`. ISO timestamps and reason
   strings pass through unchanged.
3. **`checkPurgeResponse`** (`:50`): before the provider loop, if `entry.providers` is not a
   non-null object or has zero keys, return `{ ok: false, reason: 'providers missing' }`.
4. **`bin/purge-cdn.mjs` header** (`:9`): change "2 on usage error" to "2 on a usage error, an
   invalid path, or a local read failure (all before any network call)".
5. **Tests** (`test/purge-cdn.test.mjs`):
   - Test "purge HTTP 503 then success": change the expected sleeps from `[30_000]` to
     `[15_000, 30_000]` and its comment accordingly.
   - Add a test where every purge returns 503 on all attempts (manifest only). Expected sleeps are
     `VERIFY_DELAYS_MS.slice(0, 4)` (no sleep after the failed 5th attempt), 5 phase purges, and
     `ok: false`.
   - Add a test where `checkPurgeResponse` gets a body whose path entry has `providers: {}`, and one with
     `providers` absent. Each must give `ok: false`, with a reason containing `providers missing`.
   - Add a test where the CDN verify returns 404 on attempt 1 and fresh on attempt 2 for a family file. The
     attempt-1 verify log line must contain `STALE` and `HTTP 404`, and the result is `ok`.
   - Add a test where the CDN response carries headers `x-cache: HIT` and `age: 12`. The verify log
     line must contain `x-cache=HIT age=12`. If the harness's fake response has no `headers.get`,
     extend the harness minimally.
   - Add a test where a stale manifest is off by seconds (local `…T20:55:13.585Z`, CDN
     `…T20:55:01.000Z`). The verify log line must contain both full timestamps.

Done-definition for the fix: `npm test` green, `npm run smoke` green, one commit, push. Hand back
the SHA.

## Verification record

- Fix pass 1: `2b4685a` (a26046b..2b4685a). The implementation-reviewer re-review came back **clean**. `npm test`
  passes 1190, fails 0 and skips 4 (all 4 skips predate this change); `test/purge-cdn.test.mjs` passes 19/19; smoke is green.
- **Still open:** Verification steps 2–4, the live run. The first committing run after `2b4685a` is the
  daily snapshot on 2026-10-03, at roughly 19:00–22:00 UTC. The first `_ingest.yml` caller to run is the nfl season
  totals on Mon 2026-10-05 at 06:13 UTC. Record here which attempt verified each path, and the independent CDN-vs-origin check.
- **Still open:** step 5, Anton's browser-cache console check (§ App follow-up). This gates the app-side P0 task.
