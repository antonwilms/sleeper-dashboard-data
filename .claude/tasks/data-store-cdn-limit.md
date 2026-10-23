# data-store-cdn-limit — jsDelivr "package size exceeded 50 MB" 403s on family files

Session 1 (opus), 2026-10-23 ~15:30 UTC. **Investigation + recommendation only — no source edited,
no workflow or ingest run, nothing pushed.** Checked against data `5231fb4`, app `ee4939d`.

Review depth: full — recommends changing a CR-29 site (`src/api/dataStore.js` transport) and
proposes a capture-gate change touching CR-01/CR-22/CR-26 readers.

---

## 0. Correction to the problem statement (read first)

The brief says the daily capture "could put pre-fix data into a committed snapshot" via this same
jsDelivr failure. **It cannot, through jsDelivr.** `.github/workflows/daily-snapshot.yml` ("Build the
app" step) builds the app with

```
VITE_DATA_STORE_URL: "https://raw.githubusercontent.com/antonwilms/sleeper-dashboard-data/main"
```

so in CI `BASE_URL` is raw GitHub: `rawManifestUrl(BASE_URL)` returns `null` (the base does not match
`JSDELIVR_BASE_RE`), the manifest comes from `${BASE_URL}/manifest.json` (raw), and every family file
in `tryDataStore` comes from raw. jsDelivr is not on the capture's read path at all. The capture's
residual exposure is a **raw** failure (timeout / HTTP error / GitHub throttling of Actions IPs), which
would take the same silent live-API fallback. That exposure is real but separate, and is what §3e
addresses.

The jsDelivr exposure is therefore **interactive sessions only**: any build using
`.env.local`'s `VITE_DATA_STORE_URL=https://cdn.jsdelivr.net/gh/antonwilms/sleeper-dashboard-data@main`
(Anton's local dev/preview; no hosted deployment config exists in the app repo). The manual
`bin/import-snapshot.mjs` path (§2.3) is the one route by which such a session's output could reach
`snapshots/`.

---

## 1. The limit itself

### 1.1 What jsDelivr documents

- jsDelivr's README (the project's own documentation): packages larger than 150 MB, or single files
  larger than 20 MB (GitHub), are not supported by default; limits can be raised by opening an issue.
  Branch refs are cached 12 h; commit SHAs and exact versions "effectively forever"; aliases 7 days.
  Source: https://github.com/jsdelivr/jsdelivr/blob/master/README.md
- The error text we received names **50 MB** ("configured limit of 50 MB") — the GitHub-source value
  actually enforced, which differs from the README's general 150 MB figure. Many GitHub-source reports
  carry the same 50 MB text, e.g. https://github.com/jsdelivr/jsdelivr/issues/18294,
  https://github.com/openlayers/openlayers.github.io/issues/113,
  https://github.com/jsdelivr/data.jsdelivr.com/issues/12 (npm-source reports cite 150 MB, e.g.
  https://forums.nylas.com/t/nylas-web-elements-version-1-1-3-broken-on-cdn-jsdelivr-net/460).
- **Mechanism, from a jsDelivr maintainer** (MartinKolarik, issue #18294): single files are normally
  fetched individually, so the limit "doesn't usually apply unless you request a directory listing";
  a temporary failure fetching the individual file "triggered fetching the whole tarball (well above
  50 MB) as a fallback." Corroborated by https://github.com/wenbingkun/proxy-config/pull/116 (same
  transient 403 on a 4.5 GB repo; they fall back to raw.githubusercontent.com) and by
  https://github.com/jsdelivr/jsdelivr/issues/18749 / #18750 (cold-cache failures on new refs that
  succeed on retry/purge).

### 1.2 Answers to the brief's questions

| Question | Answer | Basis |
|---|---|---|
| What counts toward 50 MB | The **whole repository at the requested ref** (the tarball jsDelivr falls back to), not the requested file and not only served paths. | Maintainer statement #18294; data.jsdelivr #12 (size grew from an added `docs/` dir). |
| Compressed or unpacked | **Unpacked**, by inference. GitHub's own tarball for `main` measured **44.26 MB** compressed today (`codeload…/tar.gz/refs/heads/main`, one probe), *under* 50 MB, yet we got the 403; unpacked tracked size is **551.7 MB**. | Probe + `git ls-files` sum. Not documented by jsDelivr — inference. |
| Per ref? | Yes — the fallback downloads that ref's tarball. Branch, tag and SHA all resolve to a full-repo tree, so **every ref of this repo is over the limit**. | Mechanism above. |
| Enforced on cache miss only? | Effectively yes: a cached file is served without touching GitHub. The limit bites only on a **cold** path whose individual fetch fails. | Mechanism; issues #18749/#18750. |
| Per-file limit | 20 MB (GitHub source). Largest app-served file is `nflverse/gamelogs/2025.json` at 8.6 MB; largest tracked is `raw/-players-nfl.json` at 18.9 MB (not app-read). | README; measured. |

### 1.3 Why intermittent, not always

The repo has been over 50 MB unpacked for months, so the size is not the trigger. A 403 needs three
things together: (1) a cold jsDelivr path, (2) a failed **individual-file** fetch from GitHub on
jsDelivr's side, and (3) the tarball fallback, which always fails for us. The D-76 release lined all
three up: rewrite #5 (`76b5ddf`) rewrote 8 of the 14 completed `nfl/season-totals/*.json` files in
place (2017, 2018, 2020–2025; 2012–2016 and 2019 untouched) and `3041353` rewrote 2026;
`purge-cdn.mjs` purged them (cold paths); `@main` was moving (74 commits since 2026-10-16, ~10/day —
each one re-resolves the branch); and the app's CR-30 revision bump made every visitor refetch all
14 completed seasons within the same minutes — one after another, since `loadCareerHistory` is
sequential. A per-file fetch failure under that burst — plausibly GitHub's tightened anonymous throttling
of raw downloads (https://github.blog/changelog/2025-05-08-updated-rate-limits-for-unauthenticated-requests/,
https://github.com/orgs/community/discussions/159123) applied to jsDelivr's origin fetches — produced
the fallback → 403. Minutes later the individual fetches succeeded and everything served normally.

**Consequence:** this is not a growth problem we can trim our way out of; it is a property of serving
any file from a >50 MB repo through jsDelivr's GitHub source. It recurs, unpredictably, whenever many
paths go cold at once — that is, on exactly the releases that matter (CR-30 rewrites).

---

## 2. Exposure so far

### 2.1 Snapshots since 2026-09-01

Read every `snapshots/2026-09-*.json` / `2026-10-*.json` (local data repo at `5231fb4`; no newer
remote commit at the time).

| Dates | Count | `schemaVersion` | `inputStatus.careerStats.detail.provenance` |
|---|---|---|---|
| 09-02, 09-03, 09-05 | 3 | 2 | no `inputStatus` (pre-D1a) — not determinable |
| 09-07 … 10-22 (09-18 absent) | 45 | 3 | **all 14 seasons (2012–2025) `"data-store"`, every capture** |

No capture used the live-API fallback. That matches §0: the capture reads raw, and runs in a fresh
browser context (`scripts/capture-snapshot.mjs`, `browser.newContext()`), so `'cache-hit'` never
appears either. **Today's 2026-10-23 capture — the first after the D-76 release — had not run at
15:25 UTC** (cron `29 16 * * *`; recent captures land ~16:30–20:15). Check its provenance once it
lands; it is the first snapshot under the new model date.

### 2.2 What a visitor can see

Nothing visible on screen. Trace:

- `tryDataStore` (`src/api/dataStore.js`): `if (!res.ok) return null;` — **a 403 (or any HTTP error)
  is silent**: no `logOnce`, unlike timeouts, shape mismatches and stale bodies. A jsDelivr 403
  leaves no console trace in `[dataStore]`.
- `getSeasonTotals` (`src/api/sleeperStats.js:174`) then runs the 18-week live loop (classifier from
  `gp` alone — the pre-D-76 behaviour, per its own header comment) and logs only
  `[perf][career] <season> live-api <ms>` to the console. The visitor sees a slow career-load
  progress bar, nothing else.
- `onPath('live-api')` → `App.jsx` `careerProvenance` → used only by `projectionSnapshot.js`
  (`buildCareerStatsStatus`). No component renders it.
- The live result is persisted (`setCache(cacheKey, totals, 999999)`, no `sourceLastModified`). On
  the **next** session the "live-API-sourced entry" branch sees a usable manifest entry and migrates
  to the data store, so the damage self-heals after one session — provided the data store answers
  then; if it fails again the live loop repeats. Within the affected session, that season's
  durability/availability, the projection and the dynasty score built on it carry the pre-D-76
  classification.
- **The in-progress season is a second, unlabelled path.** `loadCurrentSeasonTotals`
  (`src/api/sleeperStats.js:406`) reads `nfl/season-totals/<live season>.json` through `tryDataStore`
  (`allowInProgress: true`); on a `null` it returns `{ players: {}, season, complete: false }` — no
  live fallback, no provenance label, and nothing in `inputStatus.careerStats` (whose `seasons` are
  2012…`currentSeason − 1` only, per `loadCareerHistory`). The 2026 file is rewritten daily and was
  reclassified today (`3041353`), so it is the path most often cold on jsDelivr. A failure there
  shows the visitor the live season as not-loaded rather than as pre-D-76 data; nothing records it.

### 2.3 The ungated import path

`bin/import-snapshot.mjs` (manual ZIP import from `~/Downloads`) does not call
`evaluateSnapshotRecord` (only `scripts/capture-snapshot.mjs` does), and first-league-of-the-day
wins. An export from a jsDelivr-backed local session that hit the fallback, imported before the
day's CI capture, would commit a snapshot with a `live-api` season. None did since 09-01 (§2.1).

---

## 3. Options

Sizes for reference (unpacked, tracked). Read by the app's season/family loaders: `nfl/season-totals`
43.0 MB, `nflverse/` 159.2 MB (gamelogs 111.6, teamcontext 13.7, rosterweekly 9.0, depth 6.1, oline
5.8 …), `college/` 15.5 MB, `ktc/` 1.0 MB, `enrichment/` ≈0 — **~219 MB**. **Also served:**
`snapshots/` 257.0 MB (100 files, ~3.5 MB/day) — the app reads one `snapshots/<date>.json` through
`tryDataStore` for the frozen prior (CR-26), so the full served set is **~476 MB**, growing ~3.5 MB/day.
Not app-read: `backtests/` 33.0, `raw/` 18.9, `nfl/players-state` 7.1, `verification/` 3.5.

### a. Family files raw-first from raw.githubusercontent.com (jsDelivr as fallback)

Generalise CR-29: derive a raw base from `BASE_URL` (as `rawManifestUrl` already does) and have
`tryDataStore` fetch `raw/<path>` first, `${BASE_URL}/<path>` only on HTTP error/timeout. A base
that is not jsDelivr-shaped (the CI capture's raw base) keeps a single candidate — unchanged
behaviour there.

- **Fixes:** the 403 class entirely for interactive sessions (raw serves single blobs; no
  package-size concept). Also fixes branch-cache staleness: raw sent `cache-control: max-age=300`
  in today's probe vs jsDelivr's `s-maxage=43200` on `@main`, so new bytes are visible within ~5 min
  without a purge. Manifest and family files then come from the same origin, so they move together.
- **Proven path:** the CI capture has read every family through raw, cold, daily since 09-07 — 45
  consecutive all-`data-store` captures.
- **CORS / compression:** probe showed `access-control-allow-origin: *` and `content-encoding: gzip`
  (gamelogs 2025: 8.6 MB → 522 KB on the wire; jsDelivr's brotli 460 KB). ETag present, so the app's
  `cache: 'no-cache'` revalidation keeps working.
- **File size:** no raw serve limit that matters; GitHub itself rejects pushes >100 MB/file and warns
  >50 MB. Largest served file is 8.6 MB.
- **Rate limits — the real risk:** GitHub tightened unauthenticated raw limits in May 2025 and does
  not publish the number. Limits are per client IP, so they scale with visitors, not with total
  traffic. A cold visit is roughly 40–60 file requests; repeat visits are mostly IndexedDB hits (TTL
  999999 for completed seasons). The jsDelivr fallback covers a throttled raw. Low risk at this
  app's scale; it would become a problem only with many visitors behind one NAT/IP.
- **Cost:** small, app repo only — `dataStore.js` (~20 lines: a `rawBaseUrl` helper reusing
  `JSDELIVR_BASE_RE`, a candidate loop in `tryDataStore` mirroring `loadManifest`'s), its tests,
  `docs/integrations.md` HTTP-caching/manifest paragraphs, the CR-29 entry. Also log non-OK statuses
  (see e1).
- **Contracts:** CR-29 invariant text widens ("Manifest **and family files** read raw-first; jobs
  purge every family path, never the manifest"). Data side unchanged: purges still matter because
  jsDelivr remains the fallback. CR-30's "pushed after its purge verifies" ordering stays correct but
  matters less (it now protects only the fallback path). CR-26 (`frozenPrior.js` reads through
  `tryDataStore`) and CR-04 are untouched in shape. CR-22: no change (the CI base is already raw and
  stays single-candidate).
- **Capture-only invariant:** no effect — transport only; no data written, no family's consumption
  class changes.
- **Scoring-affecting:** not in the steady state (identical bytes from either origin). It removes a
  failure mode that silently produced pre-D-76 scores, so it is classed as a reliability change.

### b. Pin jsDelivr to a tag or commit SHA

- **Does not escape the limit.** The fallback downloads the pinned ref's tarball, which is the whole
  repo at that commit — over 50 MB unpacked at any ref since well before 09-01. Pinning only changes
  cache lifetime (SHA = permanent) and removes the need to purge.
- It also adds a chicken-and-egg problem: the app needs the SHA of the commit that wrote the bytes,
  which the manifest (inside that commit) cannot name; resolving `main` → SHA needs the GitHub API
  (60 req/h anonymous).
- **Verdict:** rejected — it fixes staleness, not the 403.

### c. Shrink what jsDelivr sees (move snapshots/backtests elsewhere)

- **Does not get under the limit.** Even moving snapshots out (which also means moving a served
  family and its CR-26 reader, not just "history") and every non-app-read path still leaves ~219 MB
  unpacked (gamelogs alone is 111.6 MB). Getting a jsDelivr-served repo under 50 MB unpacked means
  splitting the served families across 5+ repos (gamelogs needs two or three of its own), each with
  its own manifest/purge/commit path — a large CR-04/CR-29 rewrite for no gain over (a).
- **Still worth it later, for a different reason (repo growth):** see §4. If done, it touches
  CR-26 (`frozenPrior.js`'s `listManifestPaths('snapshots/')` + `tryDataStore('snapshots/<date>.json')`
  would read a second store/manifest), `scripts/register-snapshots.mjs`, `daily-snapshot.yml`'s
  register/commit/purge step, `bin/import-snapshot.mjs`, `bin/grade.mjs` and the backtests that
  read snapshots, and Invariant 3 (manifest is the index — a second index). Large; not for this bug.

### d. A different static host (GitHub Pages, object store + CDN)

- Only if (a) proves rate-limited. GitHub Pages (Actions-deployed from the data repo, publishing
  the served subset only): CORS `*`, short cache, 1 GB published-site limit and 100 GB/month soft
  bandwidth — the full served set (~476 MB incl. snapshots, +3.5 MB/day) reaches 1 GB around
  **late March 2027**; without snapshots (~219 MB) it fits for years. It adds a deploy job per data commit
  (~10/day; Pages has a soft 10 builds/hour limit) and a lag between push and serve.
  An object store (R2/S3 + CDN) adds an account, credentials in Actions, and a sync step — a new
  external dependency for a hobby-scale app.
- **Verdict:** keep as the documented fallback plan; don't build.

### e. Hardening regardless of transport

The fallback silently swaps model generations. Options, cheapest first:

- **e1 — Make HTTP failures visible (app, trivial).** `tryDataStore`'s `if (!res.ok) return null`
  gets a `logOnce('http-fail:<path>', …status…)` like its siblings. Diagnostics only.
- **e2 — Retry once on the alternate origin (app).** Delivered by (a)'s candidate loop.
- **e3 — Capture-side retry, then warn (data).** After the capture reads its record, if any season
  in `inputStatus.careerStats.detail.seasons` (all completed seasons — the live season is not in
  this list today) has provenance ≠ `'data-store'`, re-run the capture once in a fresh browser
  context before committing (nothing is committed yet, so first-league-of-the-day is unaffected).
  If it persists, **commit anyway** and emit `::warning::` plus an issue via the existing
  capture-only issue path (`scripts/check-crons.mjs`'s `fileCaptureIssues` pattern).
- **e4 — Commit gate rejects** (`lib/snapshot-capture.mjs` new reason
  `careerstats-not-data-store`). Weighed against the asymmetric-loss rule: a rejected capture loses
  the day's ephemeral inputs (depth chart, KTC, status — unrecoverable) to protect a field the
  snapshot **already labels honestly** (provenance is recorded per season). A labelled
  live-API season is recoverable downstream; a missing day is not. **Not recommended**; e3 gets
  the benefit without the loss.
- **e5 — Readers honour the label (app, scoring-affecting).** `frozenPrior.js`/`checkFrozenSnapshot`
  could refuse a snapshot whose provenance contains `'live-api'` (falls back to "live prior,
  flagged" — existing path), and the grader could exclude those players' seasons. Changes in-season
  scoring in the failure case only. Needs Anton's call (Q2).
- **e6 — Gate the manual import (data).** `bin/import-snapshot.mjs` calls `evaluateSnapshotRecord`
  (and the e3 provenance check as a warning). Closes §2.3.

---

## 4. Growth — when each option stops working

| Option | Binding constraint | When |
|---|---|---|
| Status quo / b (jsDelivr) | 50 MB unpacked per ref | **Already exceeded** (551.7 MB). Fails on every cold-path origin hiccup. |
| jsDelivr per-file | 20 MB/file | Largest served 8.6 MB; season files grow ~0 after completion. Not in sight. |
| a (raw) per-file | GitHub 100 MB push limit | Not in sight. |
| a (raw) rate limit | Undocumented, per IP | Independent of repo size; ~one new season file per family per year. Risk only at many visitors per IP. |
| All options — working tree | Every Actions job checks out the repo; GitHub advises repos stay < 1 GB (soft) / 5 GB | 551.7 MB + ~3.5 MB/day snapshots ⇒ ~1 GB around **late Feb 2027**. The packed `.git` is far smaller (pack 44 MB; snapshots delta-compress well), so GitHub-side repo size is years away; the cost felt first is checkout time per job. This is the trigger for option c. |
| d (Pages) | 1 GB published site | Full served set ~476 MB incl. snapshots → ~late March 2027; ~219 MB without snapshots → years. |

---

## 5. Recommendation (original — **superseded by Revision 1 below**; kept as the record)

**Adopt (a) + e1 now, e3 + e6 next, defer (c) to a growth slice; reject (b) and (d); do not adopt
e4.**

### Stage 1 — app repo, small, not scoring-affecting (review depth full: CR-29 site)

- `src/api/dataStore.js`: add `rawBaseUrl(baseUrl)` (shares `JSDELIVR_BASE_RE` with
  `rawManifestUrl`, which can be rewritten as `rawBaseUrl(b) && \`${…}/manifest.json\``);
  `tryDataStore` tries `[raw, BASE_URL]` with per-candidate timeouts (raw 15 s, jsDelivr 15 s —
  Session 1 of that slice to decide whether the second attempt shortens), keeps the
  validate/`bodyMatchesEntry`/`staleServed` logic applied to whichever body succeeds, and logs every
  non-OK status once (e1). Non-jsDelivr bases keep one candidate.
- Tests in `src/api/dataStore.test.js` (or the existing CR-29 test file): raw-first order, fallback
  on 403/timeout, single candidate for a raw base, stale-body still detected via the fallback.
- `docs/integrations.md` (manifest + HTTP caching paragraphs), `docs/navigation.md` dataStore row,
  `docs/cross-repo-registry.md` CR-29 invariant text. Data-side `scripts/purge-cdn.mjs` header
  comment mentions "the app reads it [manifest] from raw GitHub" — still true; optional wording
  touch via `.claude/tasks/data-repo-backlog.md` if the app slice runs repo-scoped.
- Size: ~30 lines source + ~60 lines tests + docs. One Session 2.

### Stage 2 — data repo, small (depth full: touches the CR-22 capture path)

- e3 in `scripts/capture-snapshot.mjs` (+ a pure helper in `lib/snapshot-capture.mjs`, e.g.
  `nonDataStoreSeasons(snapshot)`, unit-tested in `test/snapshot-capture.test.mjs`): one retry in a
  fresh context, then commit with `::warning::` + issue. `evaluateSnapshotRecord` unchanged.
- e6 in `bin/import-snapshot.mjs`: run `evaluateSnapshotRecord`; print the provenance warning.
- No CR invariant text changes (CR-22's fixed points are untouched; CR-01's envelope unchanged).
- Not scoring-affecting.

### Stage 3 — optional, app repo, scoring-affecting: e5 (only if Anton says yes, Q2)

### Stage 4 — deferred: option c for repo growth, planned before ~Feb 2027; park in `PARKED.md`.

---

## 6. Questions for Anton (answered 2026-10-23 — see Revision 1)

1. **Raw-first for everything (recommended) or jsDelivr-first with raw only as fallback?**
   Raw-first gives fresher data and matches how the manifest and the daily capture already read;
   jsDelivr-first keeps more traffic on a real CDN but keeps the stale-branch and 403 path as the
   normal route. I recommend raw-first.
2. **Should a snapshot that recorded a live-API season be refused as a frozen in-season prior
   (e5)?** It changes in-season scoring only when that rare failure occurs; the alternative is to
   rely on Stages 1–2 making it near-impossible. I lean no for now — revisit if a labelled snapshot
   ever lands.
3. **Confirm: warn, don't reject (e3 over e4).** Rejecting the day's capture loses depth chart,
   KTC and status data that can't be recaptured, to protect a field the snapshot already labels.
4. **Check today's 2026-10-23 capture** (first after D-76) once it lands — I can't, it had not run at
   15:25 UTC.

---

## Revision 1 — Anton's decisions and review fixes (2026-10-23)

Supersedes §5 and §6. Answers to the first plan review (12 flags, reported verbatim in the session).
Flags are cited by content because the numbering in the answers did not follow the report's order.

**Second review round (2026-10-23): all 10 flags folded in below, unreviewed, on Anton's approval.**
They are: the in-progress test location, the `next` log values, validator-throw classification, the
career-load budget claim, staleness scope, the offseason `seasons` scope, the missing `provenance`
object, the warning's date variable, the stale CR-30 copies, and the D2 backlog pointer. Q1 and Q2
are answered (both accepted). **This is the final task file pending Anton's approval. Stage 1's app
Session 1 starts only after that.**

### Decisions

- **D1 — jsDelivr first, raw.githubusercontent.com as the family-file fallback** (not raw-first).
  The bug is the live-API fallback after a jsDelivr refusal; a raw fallback fixes that while the
  normal path keeps CR-30's "purge verifies before the app ships" guarantee. The manifest stays
  raw-first (CR-29, unchanged).
- **D2 — Frozen prior does not refuse a live-API-labelled snapshot now** (the frozen prior is unused
  this season). Backlog item to decide before the 2027 kickoff — added to
  `.claude/tasks/app-repo-backlog.md`.
- **D3 — Capture warns, never rejects; no retry, no issue filing.** The capture reads raw and 45/45
  snapshots are clean, so the retry's risks outweigh its value. Option e4 stays rejected; e3 shrinks
  to one non-fatal `::warning::` line.
- **D4 — Gating `bin/import-snapshot.mjs` (e6) moves to the backlog** as its own item
  (`../PARKED.md` §3 — it is data-side work, and the data repo keeps no self-backlog).
- **D5 — Wording fixes accepted:** §1.3 (which files D-76 rewrote; sequential refetch) and §3/§4
  (snapshots are a served family; full served set ~476 MB) are corrected in place above. §2.2 now
  records the unlabelled in-progress path.

### Stage 1 — app repo: family-file raw fallback (CR-29)

**Where:** its own Session 1 **in the app repo** (`sleeper-dashboard`), which writes the app task file
from this spec; Session 2 on sonnet. Review depth **full** (changes a CR-29 site and CR-26
behaviour). Not scoring-affecting: identical bytes on either host; it removes a failure mode that
silently produced pre-D-76 classification. Tracked by the `app-repo-backlog.md` entry
"Family-file raw fallback (CR-29)".

**`src/api/dataStore.js`**

1. **`rawBaseUrl(baseUrl)`** (exported): for a jsDelivr `gh/<owner>/<repo>@<ref>` base returns
   `https://raw.githubusercontent.com/<owner>/<repo>/<ref>`, else `null`; same `JSDELIVR_BASE_RE`,
   same trim/trailing-slash handling. `rawManifestUrl(b)` becomes `rawBaseUrl(b)` + `/manifest.json`,
   with outputs identical to today (its existing tests stay unchanged).
2. **Candidates in `tryDataStore`**, in order:
   `{ host: 'primary', url: \`${BASE_URL}/${relativePath}\`, ms: 15_000 }`, then, only when
   `rawBaseUrl(BASE_URL)` is non-null, `{ host: 'raw', url: \`${raw}/${relativePath}\`, ms: 10_000 }`.
   Raw is only ever tried after a primary failure on that call or an earlier one (rule 4).
3. **Fallback triggers: HTTP error, timeout or JSON parse error only.** The failure classification
   is scoped to **`fetchWithTimeout(...)` and `res.json()` only**, with each candidate's fetch and
   parse in their own `try`:
   - `HTTP <status>` for `!res.ok`;
   - `timeout` for an `AbortError` from `fetchWithTimeout`;
   - `parse-error` for a `SyntaxError` from `res.json()`;
   - `network` for any other throw from those two calls, such as a `TypeError`; `network` counts as
     a failure too.

   `validate(json)` runs **outside** that `try`, on the parsed body, in its own `try`. A `false`
   return **or a throw** from `validate` is a `shape-mismatch`. That matters because, for example,
   `isValidSeasonTotals`'s `'gamesPlayed' in sample` throws a `TypeError` on a primitive sample. A
   shape-mismatch keeps today's log and returns `null`; it **does not try raw and does not add the
   host to `failedHosts`**.

   A stale body (`bodyMatchesEntry` false) is also not a trigger: it keeps today's `staleServed`
   handling, applied to whichever host served the body. Today's catch-all, which logs every throw as
   "timeout", is replaced by this classification.
4. **Per-session host skip.** Add module state `failedHosts = new Set()`. The first failure of a host
   adds it to `failedHosts`, and the rest of the page session's `tryDataStore` calls skip it.
   - **Guard 1 (single-candidate base):** a base with no raw candidate never skips its only host.
     This covers the CI capture's raw `VITE_DATA_STORE_URL` and any other non-jsDelivr base. They
     keep today's per-path behaviour exactly, so one transient raw failure in CI cannot blank every
     later read. Without this guard, the capture would fail `college-not-loaded` and lose the day.
   - **Guard 2 (both hosts failed):** once both hosts are in `failedHosts`, revert to today's
     behaviour, which tries the primary per path at 15 s, rather than returning `null` for every
     later read. This narrows the literal "skip that host for the rest of the session" rule
     (**accepted by Anton, Q1**).
   - `failedHosts` is not cleared by `invalidateManifest`.
5. **Logging: every failed fetch, once per host+path.**
   `logOnce(\`fetch-fail:${host}:${relativePath}\`, \`fetch failed host=${hostname} path=${relativePath} status=${reason} — ${next}\`)`.
   Here `hostname` is `new URL(url).hostname`, and `next` is computed only from facts
   `tryDataStore` has: **`trying raw`** when a raw candidate remains for this call, else
   **`no more hosts`**. Whether the caller then goes to the live API is the caller's business and is
   not logged here. Log `host-skipped:${host}` once when a host is first skipped.
6. `MAX_SUPPORTED_SCHEMA`, the `inProgress` gate, `validate`, `bodyMatchesEntry` and
   `wasServedStale` are unchanged and applied to the body that succeeded.

**Time budget (fixes the timeout flag).** The numbers are header waits; body reads have no timer of
their own, as today.
- **One `tryDataStore` call:** worst case 15 s (primary) + 10 s (raw) = **25 s**, and only on the
  call that sees the primary's first failure. After that, each call waits on at most one host: raw at
  10 s, or the primary at 15 s under Guard 2.
- **`loadFrozenPrior`** (30 s race, `FROZEN_PRIOR_TIMEOUT_MS`): its single read is ≤ 25 s of header
  waits, leaving ≥ 5 s for the body. A snapshot is ~3.5 MB, ~0.5 MB gzipped. If that is exceeded, the
  race resolves `timeout` → "live prior, flagged", which is today's outcome on a jsDelivr hang. If
  the primary already failed earlier in the session, the read is raw-only (≤ 10 s).
- **`loadCareerHistory`** (14 seasons, sequential):
  - **Raw survives:** the fallback adds ≤ 25 s once per session, and every later season goes
    straight to raw. Total timeout cost is ≤ 25 s, against today's worst case of 14 × 15 s = 210 s.
  - **Both hosts fail:** season 1 costs 15 + 10 = 25 s, and Guard 2 sends the other 13 to the
    primary at 15 s each, so the total is 25 + 195 = **220 s**. That is **10 s worse** than today's
    210 s, the price of one raw timeout. It is accepted, because the outcome (live-API seasons) is
    the same as today.
- **Requests already in flight** when a host first fails each pay their own ≤ 25 s once, in parallel
  rather than added together.

**Residual staleness on the fallback (shrunk CR-30 flag).** Raw sends `max-age=300`, so within
~5 min of a push it can serve pre-push bytes. A session reaches raw only after a jsDelivr failure.
**But under rule 4, from that first failure on, raw serves every later family path in the session**,
including paths jsDelivr would have served, and the ~5-minute window applies to all of them. Raw is
not limited to the one file that failed. Sessions with no jsDelivr failure never read raw.
- For a completed season-totals file rewritten in place, `bodyMatchesEntry` cannot detect this: the
  file has no `generatedAt` and its `recordCount` is unchanged. Such a body would persist under the
  new `SEASON_TOTALS_CACHE_REVISION` with TTL 999999.
- The release rule (Stage 2, item 3) closes this for CR-30 releases: the app push waits for raw too.
- For the in-progress file (`loadCurrentSeasonTotals`, keyed by `lastModified`), the residual is a
  body up to one daily rewrite stale. That is no worse than today's jsDelivr branch-cache exposure.

**In-progress path (fixes that flag).** `loadCurrentSeasonTotals` reads through `tryDataStore`, so it
gets the same fallback with no code change of its own. It still records no provenance (§2.2), and
this slice leaves that as is.

**Tests — all in `src/api/dataStore.test.js`** (`src/api/sleeperStats.test.js` mocks `./dataStore`
wholesale, `:10-15`, so the real fallback cannot run there):
- **Keep unchanged** the P9 test "family-file fetch revalidates with no-cache and adds no query
  string" (the `it(…)` block at `dataStore.test.js:107-116`). The primary URL does not change under D1, so its
  `fetchSpy.mock.calls[1][0] === \`${URL}/nfl/season-totals/2023.json\`` assertion must still hold.
  Do not edit it.
- **Primary 403 → raw:** the second family fetch URL is
  `https://raw.githubusercontent.com/validuser/sleeper-dashboard-data/main/nfl/season-totals/2023.json`,
  the call returns the JSON, and one `[dataStore]` warning names host, path and `HTTP 403`. Add the
  same test for a primary timeout (`AbortError`) and for a primary `SyntaxError` from `json()`.
- **Validate failure on the primary → no raw fetch, returns `null`**, and the same for a validator
  that **throws**. Neither adds the primary to `failedHosts`: the next path still fetches the primary.
- **Log `next`:** a primary failure logs `trying raw`; a raw failure logs `no more hosts`.
- **Skip:** after a primary failure, the next `tryDataStore` for another path fetches only the raw
  URL.
- **Guard 2:** once both hosts have failed, the next path fetches the primary again.
- **Guard 1:** with `VITE_DATA_STORE_URL` set to a raw base, a family 403 makes the next path still
  fetch that base.
- **Stale via fallback:** when raw serves a body whose `recordCount` disagrees with the entry,
  `wasServedStale(path)` is true.
- **In-progress path:** for a manifest entry with `inProgress: true`,
  `tryDataStore(path, { allowInProgress: true })` gets a primary 403, then the body from raw, and
  returns it. That is the call `loadCurrentSeasonTotals` makes.
- **Test isolation:** `failedHosts` is module state, so each test needs a fresh module instance, the
  way the file's existing tests get a clean `manifestPromise`/`sessionDisabled`. Session 1 of the app
  slice confirms the mechanism the file uses.

**Docs/index (same change):**
- `docs/integrations.md`: the data-store fetch description, the HTTP-caching note and the
  failure-mode table get the fallback, budgets and log line.
- `docs/navigation.md`: the `dataStore.js` row.
- `docs/cross-repo-registry.md` **CR-29** is retitled **"Data-store transport"**. Its invariant
  becomes *"Manifest read raw-first; family files read from `VITE_DATA_STORE_URL` first, raw GitHub
  on HTTP error/timeout/parse error; jobs purge every family path, never the manifest."* Its App
  sites are `src/api/dataStore.js` (`rawManifestUrl`, `loadManifest`, `rawBaseUrl`,
  `tryDataStore`). Data sites are unchanged, and `test/registry.test.mjs` checks only Data sites.
- **CR-30 text is Stage 2's, not Stage 1's.**

### Stage 2 — data repo + index: provenance warning and the CR-30 release rule

**Where:** a **parent-folder** Session 1/2. This is deliberately cross-repo: it edits data source and
the app repo's `docs/cross-repo-registry.md` in one piece of work, as the cross-repo rule requires for
a new coupling. Review depth **full** (CR-01 and CR-22 sites). Not scoring-affecting. It is
independent of Stage 1 and can land in either order.

1. **`lib/snapshot-capture.mjs` — `export function nonDataStoreSeasons(snapshot)`**, pure and never
   throwing.
   - It reads `snapshot?.inputStatus?.careerStats?.detail`, and returns `[]` when that or its
     `seasons` array is missing.
   - Otherwise it returns `[{ season, provenance }]`, in `seasons` order, for each season whose
     `detail.provenance?.[String(season)] !== 'data-store'`. That includes `'cache-hit'`,
     `'live-api'`, `null`, a missing key and a missing `provenance` object (every season listed with
     `undefined`).
   - **Scope, documented in the helper's header and not widened:** `seasons` is the keys of
     `careerStats` from `loadCareerHistory(currentSeason, …)`, i.e. 2012…`currentSeason − 1`
     (`../sleeper-dashboard/src/api/sleeperStats.js:428-431`, `src/App.jsx:1070`). In season that
     is every completed season. **In the offseason** the app writes
     `targetSeason = currentSeason + 1`, e.g. `snapshots/2026-06-10…17` (targetSeason 2026,
     currentSeason 2025). The just-completed season is then read as the in-progress file, outside
     `seasons`, and **the warning does not cover it**.
   - `evaluateSnapshotRecord` is **unchanged**.
2. **`scripts/capture-snapshot.mjs`:** add one block after the `[capture] wrote …` line (`:133`),
   i.e. after `evaluateSnapshotRecord` returned `ok` and the file is written.
   - It is wrapped in its own `try { … } catch {}`, so it never touches `process.exitCode` and never
     throws. When `nonDataStoreSeasons(result.snapshot)` is non-empty, it prints exactly one line:
     `::warning title=careerStats provenance::${dateKey}: completed seasons not from the data store — 2019 (live-api), 2021 (null)`.
     It uses the in-scope `dateKey` (`scripts/capture-snapshot.mjs:66`); no second date is derived.
   - No retry, no issue, no workflow or permission change.
3. **CR-30 release rule.**
   - `git-workflow.md` step 5 gets one sentence: *"For an in-place rewrite of a completed
     season-totals file (CR-30), also confirm raw GitHub serves the new bytes before pushing the
     app's `SEASON_TOTALS_CACHE_REVISION` bump: the sha256 of
     `https://raw.githubusercontent.com/antonwilms/sleeper-dashboard-data/main/<path>` equals the
     local file's."*
   - The CR-30 invariant in the registry becomes *"An in-place rewrite of a completed season-totals
     file ships with a `SEASON_TOTALS_CACHE_REVISION` bump, pushed after its purge verifies and raw
     GitHub serves the new bytes (raw is the family-file fallback, and after one jsDelivr failure it
     serves the rest of that session)."* Sites are unchanged.
   - **Update every other statement of the old ordering in the same change:**
     - the App site comment at `../sleeper-dashboard/src/api/sleeperStats.js:11`
       (`SEASON_TOTALS_CACHE_REVISION`) — the one a releasing session reads;
     - `CLAUDE.md:55` (the `scripts/migrate-*.mjs` row);
     - `README.md:1527`;
     - the `scripts/migrate-absence-role.mjs:13` header (`migrateAbsenceRole`).

     Each gets the same "and raw GitHub serves the new bytes" clause. The data `CLAUDE.md` stays
     under its 25,000-byte ceiling (`test/claudeMdSize.test.mjs`).
4. **CR-01 index (provenance-vocabulary coupling).**
   - Append to the invariant: *"`inputStatus.careerStats.detail.provenance` values are
     `'data-store'|'cache-hit'|'live-api'|null`; the capture warns on any season in `seasons`
     (2012…`currentSeason − 1`) not `'data-store'`. In the offseason the just-completed season is
     outside `seasons` and is not covered."*
   - App sites: `src/utils/projectionSnapshot.js` (`writeProjectionSnapshot`,
     `buildCareerStatsStatus`) and `src/api/sleeperStats.js` (`getSeasonTotals`).
   - Data sites: `lib/snapshot-capture.mjs` (`evaluateSnapshotRecord`, `nonDataStoreSeasons`) and
     `scripts/grade-snapshot.mjs` (`gradeSnapshot`).
   - Edit both working trees, then run both `npm test` suites (data `test/registry.test.mjs`, app
     `src/__tests__/crossRepoIndex.test.js`) before either commit.
5. **Tests — `test/snapshot-capture.test.mjs`:**
   - all 14 `data-store` → `[]`;
   - one `live-api` → that season only;
   - `null` and `cache-hit` are listed;
   - a missing key is listed as `undefined` provenance;
   - `seasons` present but no `provenance` object → every season listed as `undefined`, no throw;
   - missing `careerStats` / missing `seasons` → `[]`;
   - a non-object input → `[]`, with no throw.

   The warning line itself is not unit-tested (side-effect only). The hand-back shows its absence
   on a clean `workflow_dispatch` dry run if one is run, and otherwise says so.

### Deferred

- **Backlog (D2):** `app-repo-backlog.md`, "Frozen prior and live-API-labelled snapshots — decide
  before 2027 kickoff".
- **Backlog (D4):** `../PARKED.md` §3, "Gate `bin/import-snapshot.mjs` with `evaluateSnapshotRecord`".
  Its spec notes from the review: refuse or warn is undecided; wrap the file as `{ data }`; take
  `now` from `snapshot.capturedAt`; a provenance warning there would fire on most local exports
  because `'cache-hit'` hides the source.
- **Option c for repo growth** (snapshots out, ~1 GB working tree by ~late Feb 2027) is unchanged
  from §5 Stage 4 and not yet written anywhere.

### Questions for Anton — answered 2026-10-23

1. Guards 1 and 2 on the skip rule — **accepted.**
2. Stage 2 runs from the parent folder — **accepted.**

No open questions. Awaiting Anton's approval of this task file before Stage 1's app-repo Session 1.
