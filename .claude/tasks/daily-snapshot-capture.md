# D1b — server-side daily snapshot capture

**Model:** sonnet implements this file exactly. **Status:** planned (opus, 2026-09-05). **Slice:** D1b of the stellar-data batch (`../analysis/data-stellar-batch-brief.md` Arc A). **Repo:** data, plus a read-only checkout of the app.
**Base:** data `4719464` on `main`; app `2bc5fd0` on `claude-md-slimming`. D1a shipped in app `7466b2e` + `5821210` and is this slice's prerequisite — the envelope now carries `inputStatus`, which is what the commit gate below asserts on.
**Plan gate:** plan-reviewer run 2026-09-05, eleven flags, all folded in. Two of its findings corrected errors in this file's own first draft: the proposed cron collided with Saturday's oline job, and the dead-man check as written could not run under the staged rollout this file recommends.

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

1. **The proposed cron time is wrong, and backwards.** The brief says "daily, ~06:00 UTC, after `weekly-ktc.yml` on Mondays". `weekly-ktc.yml` runs **Monday 13:17 UTC**, so 06:00 is seven hours *before* it: every Monday snapshot would carry the previous week's KTC values, which is the one day of the week where market data is about to move.

   **Use `29 16 * * *`.** A daily job has to clear *every* weekly slot, not just Monday's, and the occupied set is 13:17 Mon · 13:23 Tue · 13:29 Wed · 13:35 Fri · 13:47 Sat · 13:53 Sun · 14:11 Sat · 14:37 Sat · 15:05 Tue · 12:00 May 1 · 05:19 daily. 16:29 sits clear of all of them, after the latest weekly committer (`nfl-season-totals.yml`, Tuesday 15:05), and off-the-hour by the repo's politeness convention. An earlier draft of this file said 14:41, which is four minutes behind Saturday's `nflverse-oline.yml` — tighter than any existing spacing in the table, and the kind of thing the repo's own staggering rationale exists to avoid.

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
- **Purge jsDelivr after committing.** Every other committing workflow does: the eight ingest jobs get it from `_ingest.yml`'s `purge-path` input, and the standalone `weekly-ktc.yml` and `nflverse-playerstats.yml` each purge inline. A standalone workflow cannot reuse `_ingest.yml`, so purge `manifest.json` explicitly, in the same `|| true` non-fatal style the others use. The snapshot file itself has no app-side reader and does not need purging; the manifest does, because `ktcHistory.js` enumerates `manifest.files` from the CDN.
- **Do not inherit `weekly-ktc.yml`'s no-op branch.** That file's commit step wraps everything in `if [[ -n "$(git status --porcelain)" ]] … else echo "No changes to commit."` and exits green. Copied wholesale, a run that captured *nothing* becomes an indistinguishable green, which is the failure mode this whole slice exists to end. The two cases must have separate, explicit exits: an already-committed date (design D) is a green skip; an empty working tree after a capture that was supposed to produce a file is a **red** failure.
- **Give the console-marker wait a real timeout budget.** Playwright's default is 30 seconds and a cold run will blow through it: fresh runner, no cache, full career load from raw GitHub, then the projection pipeline. Budget **180 seconds** for the marker and fail with the page's captured console output attached, not a bare timeout. Pipe the page's console to the job log from the start — when this breaks at 16:29 UTC unattended, that log is the only evidence there will be.

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
- `inputStatus.nflDraft.detail.years` does not include `targetSeason` — the D1a rule, which works as written now that those years are numeric (app `5821210`). Note the pre-draft exception: before that year's draft the class does not exist, and the correct behaviour then is to skip the assertion, not to fail. **The boundary is May 1**, because `nflverse-draft.yml` runs `0 12 1 5 *` and that ingest is what puts the class in the store. Skip the assertion when the UTC month is January through April; assert it from May onward. A May 1 run at 16:29 UTC is safely after that job's 12:00 commit. Put the reasoning in the comment, not just the month number.
- `inputStatus.ktc.loaded !== true`, **or** `inputStatus.ktc.count` below a floor. This is the gap most worth closing: KTC is the one input the app fetches by scraping a third-party page live rather than reading from the store, so it is by far the likeliest thing a headless CI runner loses — a blocked request, a changed page, a proxy that only exists in dev. Losing it empties the market factors while every other label stays green, which is precisely the silent-neutral commit this arc exists to prevent. Recent snapshots match 436–464 players; pin the floor after one real run.
- `inputStatus.depthChart.count` below a floor. Cheap, and a zero here means the roster load degraded.
- `Object.keys(players).length` below a floor. Pin the floor after one real run; recent snapshots carry 715–832 players, so something like 500 is a sane starting guess, but **measure first**.

**Pin every floor from one observed run, and write the observed number in the comment beside it.** A floor invented at planning time is either so low it never fires or so high it fires on a good day.

`priorSnapshotTeams.loaded === false` is **not** a failure. On a fresh runner there is never a prior snapshot in IndexedDB, so it will be false on every single run. Do not gate on it, and write a comment saying why, or someone will "fix" it into the gate later.

### D. Idempotency and the manual path

Skip-if-exists by UTC date is already the app's rule. The Action must **also** skip when `snapshots/<date>.json` is already committed, so a manual import earlier in the day wins and the job is a no-op rather than a conflict. Check the file before driving the browser at all — it makes the common re-run cheap.

### E. Dead-man — phase 2 only

No registration step exists: `listScheduledWorkflows` reads `.github/workflows/*.yml` from disk and keeps anything with a `cron:` line (`scripts/check-crons.mjs:62`, `extractCrons:38`). The detector's own sparse-checkout already includes `.github`.

**That is exactly why this verification cannot run in phase 1.** A `workflow_dispatch`-only file has no `cron:` line, so `listScheduledWorkflows` skips it and `bin/deadman.mjs` reports nothing — not a failure, just silence, which would read as a pass. Do not attempt this check while the workflow is dispatch-only and do not report a clean deadman run as evidence in phase 1. It belongs to the cron switch-on: add the `cron:` line and the deadman picks the file up in the same change, and *that* is when running `bin/deadman.mjs` against the repo proves something.

---

## Cross-repo impact

### CR-01 · Projection snapshot envelope — touched, `Direction: app→data`

> **Mirror:** State the new envelope shape and whether the snapshot `schemaVersion` bumped. On a bump, `scripts/register-snapshots.mjs` expectations, `scripts/grade-snapshot.mjs` reads and the README snapshot section all need updating in the data repo. **`scoringSettings` has a second reader beyond grading** — `scripts/panel-run.mjs` `resolveScoring` pins the fit's basis from a committed snapshot, so dropping or renaming that envelope field breaks the R3-FIT path (CR-15) as well as in-basis grading. This snapshot `schemaVersion` is independent of `dataStore.js` `MAX_SUPPORTED_SCHEMA` (a ceiling on every family read through `tryDataStore`, not season-totals-scoped — snapshots have no `tryDataStore` reader in the first place). Additive `factors` keys (`isTeamChange`/`prevTeam`/`newTeam`/`depthStale`) do **not** bump the version.

No version bump here. This slice consumes the v3 envelope rather than changing it, and the README snapshot section is updated as the Mirror asks. Record that conclusion; do not skip the block.

**CR-01's data-side trigger list gains two files the moment this lands.** `lib/snapshot-capture.mjs` and `scripts/capture-snapshot.mjs` become readers of `schemaVersion`, `inputStatus`, `players` and `targetSeason`, and the commit gate is then the most consequential envelope consumer in this repo. Add both to the entry's data-side `Triggers` and `Data side` in the same change. This is the app reviewer's only far-side authority for what this repo reads, so an omission here is invisible from over there — the registry's own rule, not a formality.

### CR-18 · Signal registry rows (`docs/signal-registry.md`) — touched via `data-catalog.md` (`Direction: data→app`)

> **Mirror:** This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

The Docs list below rewrites this family's `data-catalog.md` row: its source and provenance stop being an app-side export imported by hand, and its refresh stops being "daily via app export". The field set also grows by six `inputStatus` labels. That is exactly the "alters its historical coverage or reconstructable-vs-ephemeral status" trigger, and this entry is one where **nothing fails in either repo when it drifts** — so emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use) as hand-back output. This repo cannot edit that file; the emitted row edit is the whole deliverable.

Note the interaction with D1a: the app-side §3C rows were already moved to `v2+ snapshots` coverage and a v3 envelope reference. The row edit this slice emits is about the *capture mechanism* changing from human to scheduled, not about the version again.

### CR-22 · candidate — the data repo executes the app

**This is the item that routes out of the in-repo loop. Do not draft the entry inside this slice.**

The coupling is new and real: after this slice the data repo depends on the app's build succeeding, on the `localStorage` keys `sleeper-user` / `sleeper-league`, on the console marker `[snapshot] wrote …`, on the IndexedDB layout `sleeper-dashboard` → `cache` → `projection-snapshots/<date>`, and on the cache-record shape `record.data`. Every one of those is app-internal today, guarded by nothing, and renameable by an app slice that has no reason to know this workflow exists. That is exactly the silent app→data failure `CR-NN` entries exist to record.

**Hand this back rather than implementing it.** A new entry lands in both registries in the same change, from a session opened in the parent folder, and the registry region is sentinel-bounded and must stay byte-identical (see the app repo's *Drift check*). Session 2 stops at naming the coupling; Anton opens the parent-folder session.

**Bound the window it leaves open.** CLAUDE.md is blunt that a coupling not in the registry does not exist for review purposes, so until CR-22 lands the app's reviewer has no far-side trigger for the `localStorage` key names, the console marker, or the IndexedDB layout — and an app slice can rename any of them with nothing to catch it. The staged rollout in *Risks* supplies the natural bound, so use it: **the cron is switched on only after CR-22 exists in both registries**, not merely after one green dispatch. Until then the workflow is `workflow_dispatch` only, and a rename breaks a manual run someone is watching rather than a silent daily one.

---

## Docs/README updates

- **`snapshot-workflow.md`** — restructure. The Action becomes the primary path; the existing capture/export/import steps become "Fallback: manual capture", kept intact because a broken Action must still leave a way to capture today. Add what to do when the job fails its gate, which is to read the rejection reason rather than re-run blindly.
- **`data-catalog.md`** — snapshots row: refresh becomes the daily Action, and note the v3 envelope.
- **`README.md`** — the snapshot section, per CR-01's Mirror.
- **`CLAUDE.md`** — two lines this slice falsifies. Invariant 4's version list still reads "projection snapshots **v2**"; D1a made the envelope v3 and this slice's gate rejects anything below 3, so the invariant and the gate would contradict each other. The `.github/workflows/` row (`CLAUDE.md:70`) also names exactly four deliberate non-callers; `daily-snapshot.yml` makes five, and that row names them individually so it cannot be left alone.
- **`README.md`** — beyond CR-01's snapshot section: the GitHub Actions table needs a `daily-snapshot.yml` row, and the "Why four workflows are standalone rather than `_ingest.yml` callers" list (`README.md:1119`) needs its fifth entry, and its heading count. This one has the clearest reason of the set: it runs a browser against another repo's build, which `_ingest.yml`'s shape cannot express.
- **`git-workflow.md`** — one line if the new job changes the set of scheduled committers to `main`, since that file's rebase guidance is written around them.

## Tests to add

`test/` (node:test, matching the repo's existing style):

1. `lib/snapshot-capture.mjs` accepts a valid v3 record fixture and returns a registrable object.
2. It rejects each gate condition separately, with a distinguishable reason: missing record, `schemaVersion` 2, `college.loaded === false`, `nflDraft.loaded === false`, `detail.years` without `targetSeason`, player count under the floor.
3. `ktc.loaded === false` and a below-floor `ktc.count` each reject, with distinguishable reasons. This is the gate guarding the input most likely to fail on a runner, so it gets its own case rather than riding along with the college/draft ones.
4. It does **not** reject on `priorSnapshotTeams.loaded === false`. This is the regression test for the fresh-runner case, and it is the one most likely to be broken later by someone tightening the gate.
5. The pre-draft exception, at its boundary: the same record that rejects in September passes in February, and April and May fall on opposite sides of the rule.
6. Round-trip: the accepted object registers through `registerSnapshots` and lands in `manifest.json`, reusing the existing `test/register-snapshots.test.mjs` helpers.

Playwright itself is exercised by the workflow's first real run, not by a unit test. Report that run's outcome in the hand-back; a green suite here proves the extraction logic, not the capture.

## Risks

- **A red app `main` becomes a missing snapshot.** Pinning the app ref to a workflow input with a default bounds this, and the gate turns a bad build into a loud failure rather than a neutral snapshot. Accepted.
- **This is the largest item in Arc A.** If it stalls, D1a already closed the labelling gap and the manual path still works. **Land it in two phases, and treat that as the plan rather than a fallback.**
  - *Phase 1* — the pure extraction, the gate, the tests, and the workflow behind `workflow_dispatch` only. Hand back with one manual dispatch run gone green end to end, the observed counts for every floor, and CR-22 named. No `cron:` line, and therefore no deadman check (§E).
  - *Phase 2* — add the `cron:` line, verify `bin/deadman.mjs` now discovers the file, and retire the manual path to fallback status in the docs. **Gated on CR-22 landing in both registries**, per *Cross-repo impact*.
  Splitting this way also keeps phase 1 reviewable: a browser driver, a cross-repo checkout, a new gate and a new scheduled committer in one diff is more than one review can hold.
- **Secrets.** `SNAPSHOT_LEAGUE_ID` is the only one needed. Do not add `VITE_CFBD_API_KEY`.

---

## Phase 2 — closing the capture gap (planned opus, 2026-09-07)

**Base:** data `fb45d12`, app `3d15296` (app is on `main` now, not `claude-md-slimming` — check before editing). **Plan gate:** not run.

Phase 1 is merged and the workflow triggers only on manual dispatch. Phase 2 turns the schedule on. It is **two sessions in a fixed order**, because D1b's own gate says the cron waits for `CR-22`, and only a parent-folder session can create that entry.

**Why this is now urgent rather than tidy.** D6b's result is that three factors cannot be graded retrospectively and need a forward window instead. The daily capture is the only thing that builds that window, and it is not running. Every day without it is a row that cannot be recreated — the thirty-four days lost this summer are the precedent, and they are gone for good.

### Session A — parent folder (`Claude Projects/Sleeper Dashboard`), first

The only session that can edit both registries in one change. Four jobs, one commit per repo.

**A1. Sync the mirrored `CR-REGISTRY` region.** It is four edits out of sync, all data-side ahead of app-side, enumerated in `PARKED.md` → *Cross-repo registry drift*: two CR-01 additions from D1b phase 1, CR-18's trigger additions from D4, and CR-15's extension from D6a. **The fourth is the one to read carefully** — it reverses CR-15's own scope note, which deliberately excludes the file D6a's age port draws from.

**Use the documented line-anchored check, not a plain string search.** The files mention the sentinels inline in prose, and a naive `index()` match hits the prose instead of the sentinel line. That mistake truncated the data repo's whole region once already. Finish with the check returning empty output.

**A2. Author the two coupling entries, resolving the number collision.** `CR-22` has two claimants: E7's precomputed team-season pack (parked, blocked on it) and D1b's data-repo-executes-the-app coupling. **Give `CR-22` to D1b** — it is the one blocking live work — and `CR-23` to E7. Write both in the same change so the collision cannot recur.

E7's entry has a specific failure to avoid, recorded in `PARKED.md`: a previous attempt was rejected because its App side named *"a new loader in `src/api/`"*, a category, which the entry format forbids. A parent-folder session can read `src/`, so name concrete files and exported symbols. That is the whole reason E7 has been parked.

D1b's `CR-22` covers what the workflow depends on across the boundary: the two `localStorage` keys, the `[snapshot] wrote …` console marker, and the IndexedDB layout (`sleeper-dashboard` → `cache` → `projection-snapshots/<date>`). All three are app-side surfaces a rename would break silently.

**A3. Write the four owed `docs/signal-registry.md` rows.** All four are emitted verbatim in their slices' hand-backs; none exists in the file today (verified: zero rows for both new families).

| owed by | edit |
|---|---|
| D4 | new row, `nflverse/snaps` family — raw ingested, nflverse snap counts, coverage 2013+, reconstructable, unused/candidate |
| D5 | new row, `nflverse/depth` family — same shape, coverage 2013+, reconstructable |
| D5 | **reclassify** the existing depth-chart-order row (`:120`) from *ephemeral capture* to reconstructable 2013+, noting Sleeper's `depth_chart_order` remains the live input |
| D2 | playerids row — age becomes reconstructable from `birthdate` |

The reclassification carries a caveat D5 emitted with it: the served depth array can hold `null` where an id failed to join, and a consumer must read that as **unknown**, never as "no one", and never re-index around it.

**A4. Clear the four items from `PARKED.md`** as they land, and move E7 out of blocked once `CR-23` exists.

### Session B — data repo, after A

**B1. Dispatch one run** with `app_ref=main`. This is the **first end-to-end proof of the v3 envelope**: D1a shipped `inputStatus` app-side, the gate rejects anything below schemaVersion 3, and every committed snapshot to date is v2. Nothing has yet demonstrated that the app writes what the gate accepts.

**B2. Verify the committed file**, not the run's exit code. Confirm `schemaVersion: 3`, an `inputStatus` block present, and that the gate passed on real data rather than a fixture. Report the actual counts for `college`, `nflDraft`, `ktc` and `depthChart`.

**If the gate rejects the real capture, that is the finding, not an obstacle.** Report it and stop. Do not relax a floor to make the first run pass — the floors exist because a silently-neutral capture is worse than no capture, which is the defect this whole arc was built to end.

**B3. Add the cron** at `29 16 * * *`. Verified free against all thirteen occupied slots, clear of every weekly committer, and after the latest of them at 15:05 Tuesday.

**B4. Verify the dead-man now discovers it.** §E explains why this could not run in phase 1: `listScheduledWorkflows` keeps only files carrying a `cron:` line, so a dispatch-only file returns silence that reads as a pass. Adding the line and running `bin/deadman.mjs` in the same change is the first time this check proves anything. Report its output.

**B5. Retire the manual path** to fallback status in `snapshot-workflow.md`, and set the `data-catalog.md` snapshots row's refresh to the daily Action.

### Risks

- **Do not turn the cron on before `CR-22` exists.** That gate is D1b's own, and the reason is that until the entry exists the app can rename any of the three surfaces above with nothing to catch it.
- **A1's region must be byte-identical at the end.** Verify with the documented check; a partial sync is worse than none, because it makes the check noisy and the next reader stops trusting it.
- **The first scheduled run is unattended.** Confirm the manual dispatch is green before the cron's first fire, not after.
