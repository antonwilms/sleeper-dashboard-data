# D1b — server-side daily snapshot capture

**Model:** sonnet implements this file exactly. **Status:** planned (opus, 2026-09-05). **Slice:** D1b of the stellar-data batch (`../analysis/data-stellar-batch-brief.md` Arc A). **Repo:** data, plus a read-only checkout of the app.
**Base:** data `4719464` on `main`; app `2bc5fd0` on `claude-md-slimming`. D1a shipped in app `7466b2e` + `5821210` and is this slice's prerequisite — the envelope now carries `inputStatus`, which is what the commit gate below asserts on.
**Plan gate:** plan-reviewer has not run on this file yet.

**Problem.** The model's own outputs are the only ephemeral family still captured by a human opening a browser. Thirty-four days were lost between July and September, permanently, and the loss clock runs at one snapshot per unopened day. Every other family is on a schedule.

**Goal.** A daily Action that produces `snapshots/<date>.json` without anyone opening the app, byte-identical to what the browser writes, and that fails loudly rather than committing a snapshot whose inputs silently failed.

**Non-goal.** Retiring the manual path. It becomes the documented fallback, not dead code — a broken Action must still leave a way to capture today.

---

## Step 0 — verified against live source, 2026-09-05

| Claim | Verified |
|---|---|
| Dead-man auto-discovers any workflow with a `cron:` line | `scripts/check-crons.mjs` `listScheduledWorkflows:62`, `extractCrons:38` — no expected-set to edit |
| `.github/workflows/**` is a smoke-test path | `.github/workflows/smoke-test.yml:11` — **this slice needs branch + PR**, not a direct push |
| Snapshot registration is version-agnostic | `scripts/register-snapshots.mjs:65,92` — v3 registers with no change |
| Both repos are public | `gh repo view` — cross-repo checkout needs no PAT |
| Rebase-retry commit convention | `.github/workflows/weekly-ktc.yml:52` — `git push \|\| (git pull --rebase && git push)` |
| App writes `[snapshot] wrote projection-snapshots/<date> (<n> bytes)` | `src/App.jsx:700` (app repo) |

**Four corrections to the brief. Implement this file where they differ.**

1. **The proposed cron time is wrong, and backwards.** The brief says "daily, ~06:00 UTC, after `weekly-ktc.yml` on Mondays". `weekly-ktc.yml` runs **Monday 13:17 UTC**, so 06:00 is seven hours *before* it: every Monday snapshot would carry the previous week's KTC values, which is the one day of the week where market data is about to move. `cron-deadman.yml` also documents 05:19 UTC as its quiet slot precisely because the capture crons sit at 13:xx–14:xx. **Use `41 14 * * *`** — after KTC has committed on Mondays, clear of the deadman, off-the-hour by the repo's own politeness convention.

2. **No UI driving is needed, and this is the slice's biggest de-risking.** The brief describes selecting a league in the page. The app's boot effect auto-loads from `localStorage` and refetches the league by id: it reads `sleeper-user` and `sleeper-league` (`src/App.jsx:59-60`, boot effect `:717-738`), and only `storedUser.username` and `storedLeague.league_id` are load-bearing on that path. **Seed both with `page.addInitScript` before first navigation** and the app boots straight into a loaded league. No typing, no waiting on a league list, no click targets — which removes every selector this workflow would otherwise depend on, and with them the most likely source of silent breakage when the UI changes.

3. **Playwright is a real dependency decision, not a detail.** This repo has **zero** `devDependencies` and two runtime deps (`cheerio`, `dotenv`). Adding a browser driver is the largest dependency change it has taken. Install it **in the workflow only** (`npx playwright@<pinned> install --with-deps chromium`), and keep it out of `package.json`, so `npm ci` for every other Action and for `smoke-test.yml` stays as fast and as small as it is today. Pin the exact version in the workflow; an unpinned browser driver is a silent-breakage source in its own right.

4. **This creates a new cross-repo coupling that no `CR-NN` entry covers.** CR-01 governs the *envelope shape*. Nothing governs "the data repo builds and executes the app, and depends on its `localStorage` key names, its console marker, its IndexedDB database/store/key layout, and its build succeeding." That is a `CR-22` candidate and it routes **out** of the in-repo loop: per both CLAUDE.md files, a new coupling lands in **both** registries in the same change, from a session opened in the parent folder. See *Cross-repo impact*.

---

## Design

### A. The workflow — `.github/workflows/daily-snapshot.yml`

Headless app run, not a Node re-implementation. The brief's rationale holds and is not re-litigated here: a port of the app's pipeline memos is a second implementation to keep in sync forever, and the panel harness's parity test already treats app-computed output as ground truth.

- Trigger: `cron: "41 14 * * *"` plus `workflow_dispatch`.
- Checkout this repo (sparse: `bin lib scripts test manifest.json package.json package-lock.json snapshots`), then the app at `antonwilms/sleeper-dashboard` into a separate path, pinned to a **ref that is an input with a default**, not a floating branch — a red app `main` must not silently become a bad snapshot.
- `npm ci && npm run build` in the app, then `npm run preview` (vite preview, port 4173) in the background.
- `VITE_DATA_STORE_URL` points at **raw GitHub**, not jsDelivr: the CDN can serve a stale manifest for minutes after a push, and this job runs shortly after other capture jobs commit. Do **not** set `VITE_CFBD_API_KEY`; the store covers 2017–2025 and the API path is a fallback whose use will now show up in `inputStatus.careerStats` provenance.
- Playwright drives the page, waits for the console marker, reads the IndexedDB record, and writes it to a file. Then `node bin/update.mjs snapshots` registers it, and the commit uses the rebase-retry convention from `weekly-ktc.yml:52`.

### B. Extraction and validation — a pure, testable function

The workflow's own logic must not live in YAML. Put the part worth testing in `lib/` behind a thin `scripts/` orchestrator, matching this repo's existing split.

- `lib/snapshot-capture.mjs` — pure. Given a parsed IndexedDB record, return either the registrable snapshot object or a structured rejection. No I/O, no Playwright import. This is the unit under test.
- `scripts/capture-snapshot.mjs` — the orchestrator that owns Playwright, calls the pure function, and writes the file. Keep every selector, timeout and `page.evaluate` here.
- The IndexedDB read is `sleeper-dashboard` → `cache` → `projection-snapshots/<date>`, and the stored value is a cache *record*, so the snapshot is at `record.data`, not the record itself. `writeProjectionSnapshot` stores through `setCache` (app `src/utils/projectionSnapshot.js:371`), and `loadPriorSnapshotTeams` reads `record.data.players` at `:442` — that is the shape to expect.

### C. The commit gate — where D1a pays off

**Assert before committing, and fail loudly.** The audit's known blind spot is "the job ran but the data didn't land"; this family's version is "the job ran and landed a neutral snapshot". Reject, do not commit, and exit non-zero when any of these holds:

- no record for today's UTC date, or `record.data` is absent;
- `schemaVersion < 3` — a v2 envelope from a stale app build has no `inputStatus`, so it cannot be gated at all and must not enter the series unlabelled;
- `inputStatus.college.loaded !== true`;
- `inputStatus.nflDraft.loaded !== true`;
- `inputStatus.nflDraft.detail.years` does not include `targetSeason` — the D1a rule, which works as written now that those years are numeric (app `5821210`). Note the January–April exception: before that year's draft the class does not exist, and the correct behaviour then is to skip the assertion, not to fail. Gate it on the current month, and say so in a comment.
- `Object.keys(players).length` below a floor. Pin the floor after one real run; recent snapshots carry 715–832 players, so something like 500 is a sane starting guess, but **measure first**.

`priorSnapshotTeams.loaded === false` is **not** a failure. On a fresh runner there is never a prior snapshot in IndexedDB, so it will be false on every single run. Do not gate on it, and write a comment saying why, or someone will "fix" it into the gate later.

### D. Idempotency and the manual path

Skip-if-exists by UTC date is already the app's rule. The Action must **also** skip when `snapshots/<date>.json` is already committed, so a manual import earlier in the day wins and the job is a no-op rather than a conflict. Check the file before driving the browser at all — it makes the common re-run cheap.

### E. Dead-man

No registration step exists: `listScheduledWorkflows` reads `.github/workflows/*.yml` from disk and keeps anything with a `cron:` line. Verify it picks the new file up by running `bin/deadman.mjs` locally against the repo once the workflow is committed, and report the output in the hand-back. The detector's own sparse-checkout already includes `.github`.

---

## Cross-repo impact

### CR-01 · Projection snapshot envelope — touched, `Direction: app→data`

> **Mirror:** State the new envelope shape and whether the snapshot `schemaVersion` bumped. On a bump, `scripts/register-snapshots.mjs` expectations, `scripts/grade-snapshot.mjs` reads and the README snapshot section all need updating in the data repo. **`scoringSettings` has a second reader beyond grading** — `scripts/panel-run.mjs` `resolveScoring` pins the fit's basis from a committed snapshot, so dropping or renaming that envelope field breaks the R3-FIT path (CR-15) as well as in-basis grading. This snapshot `schemaVersion` is independent of `dataStore.js` `MAX_SUPPORTED_SCHEMA` (a ceiling on every family read through `tryDataStore`, not season-totals-scoped — snapshots have no `tryDataStore` reader in the first place). Additive `factors` keys (`isTeamChange`/`prevTeam`/`newTeam`/`depthStale`) do **not** bump the version.

No version bump here. This slice consumes the v3 envelope rather than changing it, and the README snapshot section is updated as the Mirror asks. Record that conclusion; do not skip the block.

### CR-22 · candidate — the data repo executes the app

**This is the item that routes out of the in-repo loop. Do not draft the entry inside this slice.**

The coupling is new and real: after this slice the data repo depends on the app's build succeeding, on the `localStorage` keys `sleeper-user` / `sleeper-league`, on the console marker `[snapshot] wrote …`, on the IndexedDB layout `sleeper-dashboard` → `cache` → `projection-snapshots/<date>`, and on the cache-record shape `record.data`. Every one of those is app-internal today, guarded by nothing, and renameable by an app slice that has no reason to know this workflow exists. That is exactly the silent app→data failure `CR-NN` entries exist to record.

**Hand this back rather than implementing it.** A new entry lands in both registries in the same change, from a session opened in the parent folder, and the registry region is sentinel-bounded and must stay byte-identical (see the app repo's *Drift check*). Session 2 stops at naming the coupling; Anton opens the parent-folder session.

---

## Docs/README updates

- **`snapshot-workflow.md`** — restructure. The Action becomes the primary path; the existing capture/export/import steps become "Fallback: manual capture", kept intact because a broken Action must still leave a way to capture today. Add what to do when the job fails its gate, which is to read the rejection reason rather than re-run blindly.
- **`data-catalog.md`** — snapshots row: refresh becomes the daily Action, and note the v3 envelope.
- **`README.md`** — the snapshot section, per CR-01's Mirror.
- **`git-workflow.md`** — one line if the new job changes the set of scheduled committers to `main`, since that file's rebase guidance is written around them.

## Tests to add

`test/` (node:test, matching the repo's existing style):

1. `lib/snapshot-capture.mjs` accepts a valid v3 record fixture and returns a registrable object.
2. It rejects each gate condition separately, with a distinguishable reason: missing record, `schemaVersion` 2, `college.loaded === false`, `nflDraft.loaded === false`, `detail.years` without `targetSeason`, player count under the floor.
3. It does **not** reject on `priorSnapshotTeams.loaded === false`. This is the regression test for the fresh-runner case, and it is the one most likely to be broken later by someone tightening the gate.
4. The January–April draft-year exception: the same record that fails in September passes in February.
5. Round-trip: the accepted object registers through `registerSnapshots` and lands in `manifest.json`, reusing the existing `test/register-snapshots.test.mjs` helpers.

Playwright itself is exercised by the workflow's first real run, not by a unit test. Report that run's outcome in the hand-back; a green suite here proves the extraction logic, not the capture.

## Risks

- **A red app `main` becomes a missing snapshot.** Pinning the app ref to a workflow input with a default bounds this, and the gate turns a bad build into a loud failure rather than a neutral snapshot. Accepted.
- **This is the largest item in Arc A.** If it stalls, D1a already closed the labelling gap and the manual path still works. Prefer landing the pure extraction plus the gate first, with the workflow behind `workflow_dispatch` only, and switch on the cron in a follow-up once one manual dispatch has gone green end to end. That staging is recommended, not optional-by-default: turn the cron on only after a dispatch run has produced a committed snapshot.
- **Secrets.** `SNAPSHOT_LEAGUE_ID` is the only one needed. Do not add `VITE_CFBD_API_KEY`.
