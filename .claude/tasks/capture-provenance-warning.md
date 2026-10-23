# capture-provenance-warning — non-fatal careerStats provenance warning + the CR-30 release rule

Session 1 (opus), 2026-10-23. **Planning only — no source edited.** Checked against data `5231fb4`
(local `main`, 2 behind `origin/main`: `0a0a73a` schedule + `bbcba30` snapshot, data-only), app
`86bac15`.

**Parent:** `.claude/tasks/data-store-cdn-limit.md` → *Revision 1 → Stage 2*. Revision 1's
decisions (D1–D5) are settled and not reopened here. Stage 1 shipped as app `ff9a751` + `511b8cf`
(+ `86bac15`, D-86).

Review depth: full — edits a CR-22 site (`scripts/capture-snapshot.mjs`, the capture path), a CR-01
Data site (`lib/snapshot-capture.mjs`) and the CR-01/CR-30 index entries. Not scoring-affecting: no
app logic changes (one comment), and the capture writes the same bytes and the same exit code.

**Status: approved by Anton 2026-10-24**, with plan-review round 1's six flags folded in (see
*Plan-review round 1 — fixes* at the end; the body below already reflects them). No push before
Anton's sign-off.

**Where:** parent-folder Session 2 on **sonnet** (effort medium), deliberately cross-repo. Read both
repos' `CLAUDE.md` first (neither auto-loads from the parent folder). Run every git/npm command from
inside the repo it targets. Then Session 1 verifies with implementation-reviewer at **full** depth
(`model: opus`, `effort: high`).

---

## 0. One correction to Revision 1's scope statement (wording, not a decision)

Revision 1 Stage 2 item 1 says `seasons` is "2012…`currentSeason − 1`" and gives
`snapshots/2026-06-10…17` (targetSeason 2026, currentSeason 2025) as an offseason case where the
just-completed season is outside `seasons`. The direction of the limit is right, but the example and
the bound mix up two different `currentSeason`s:

- `loadCareerHistory(currentSeason, …)` takes **Sleeper's `nflState.season`**
  (`../sleeper-dashboard/src/App.jsx:1055`) and loads 2012…`nflState.season − 1`
  (`src/api/sleeperStats.js:428-431`).
- The envelope's own `currentSeason` is **the last key of `careerStats`**
  (`src/App.jsx:859-860`; `projectionSnapshot.js:382-383`), i.e. `nflState.season − 1`. So
  `detail.seasons` is 2012…**envelope `currentSeason`**, inclusive.
- `careerStats` has one writer, `loadCareerHistory`'s result (`src/App.jsx:1075`), so an envelope
  `currentSeason` of 2025 means 2025 was in `seasons`. The June 2026 snapshots show exactly that, so
  in June the just-completed 2025 **was** covered. (`2026-06-08` is v2 with no `inputStatus`. From
  `2026-09-07`, v3 shows `seasons` ending at 2025 with 14 entries.)

The real gap is the window **from a season's last game until Sleeper rolls `nflState.season` over to
the next year**. During that window the just-completed season is read through
`loadCurrentSeasonTotals`, outside `seasons`. When Sleeper rolls over is not pinned here; the
snapshots show it had happened by 2026-06-08. Item 1's header and the CR-01 text below use this
wording, not Revision 1's.

---

## 1. Data repo — `lib/snapshot-capture.mjs`

Add two exports **after** `evaluateSnapshotRecord`. `evaluateSnapshotRecord`, its floors and its
header block are **unchanged**.

### 1a. `export function nonDataStoreSeasons(snapshot)`

Pure. No I/O, no mutation, no `try` (it must not need one for any JSON-shaped input).

```js
// returns Array<{ season: unknown, provenance: unknown }>
const detail = snapshot?.inputStatus?.careerStats?.detail
if (!Array.isArray(detail?.seasons)) return []
const out = []
for (const season of detail.seasons) {
  const provenance = detail.provenance?.[String(season)]
  if (provenance !== 'data-store') out.push({ season, provenance })
}
return out
```

- Order is `seasons` order. Every non-`'data-store'` value is listed: `'cache-hit'`, `'live-api'`,
  `null`, a missing key (`undefined`), any other value, and every season when `provenance` itself
  is missing or not an object. `String(season)` is used because `buildCareerStatsStatus` writes
  numeric `seasons` with string `provenance` keys (`projectionSnapshot.js:310-321`).
- `snapshot` that is `null`, `undefined`, a primitive or an array → `[]` (optional chaining yields
  `undefined` → not an array).

**JSDoc header (required content, wording free):**
- what it is for: the capture's non-fatal provenance warning (data-store-cdn-limit Revision 1, D3).
  It never gates; `evaluateSnapshotRecord` is the gate.
- the vocabulary: `'data-store'|'cache-hit'|'live-api'|null`, emitted by `getSeasonTotals`'s
  `onPath` (`../sleeper-dashboard/src/api/sleeperStats.js`) and assembled by
  `buildCareerStatsStatus` (`src/utils/projectionSnapshot.js`); CR-01.
- **scope limit:** `detail.seasons` is 2012…the envelope's `currentSeason` (= Sleeper
  `nflState.season − 1`). From a season's last game until Sleeper rolls `nflState.season` over, the
  just-completed season is read as the in-progress file, outside `seasons`, and is **not covered**.
  The in-progress read records no provenance at all (data-store-cdn-limit §2.2). This is a known
  limit, not a bug to fix here.
- `'cache-hit'` is listed because it hides the original source. A fresh CI runner has no
  IndexedDB, so on the daily job it should not occur.

### 1b. `export function provenanceWarningLine(snapshot, dateKey, find = nonDataStoreSeasons)`

Returns the single workflow-command line, or `null`. **Never throws**: the whole body is in
`try { … } catch { return null }`. `find` is injectable only so a test can make it throw.

- `const list = find(snapshot)`. If it is not a non-empty array → `null`.
- Each entry renders as `` `${season} (${label})` ``, where `label` is `'missing'` for `undefined`,
  else `String(provenance)` (so `null` → `null`). Entries are joined with `', '`.
- The message is passed through the GitHub workflow-command data escape: `%`→`%25`, `\r`→`%0D`,
  `\n`→`%0A`, in that order. This is a small local `escapeData` helper, not exported.
- The returned line is exactly:

  ```
  ::warning title=careerStats provenance::${dateKey}: completed seasons not from the data store — 2019 (live-api), 2021 (null)
  ```

  The separator is an em dash (U+2014) with single spaces around it. `dateKey` is passed in as-is
  and never derived here.

## 2. Data repo — `scripts/capture-snapshot.mjs`

- Import: extend line 28 to
  `import { evaluateSnapshotRecord, provenanceWarningLine } from '../lib/snapshot-capture.mjs'`.
- Insert directly after the `[capture] wrote …` `console.log` (`:133`), still inside the outer `try`
  and before `} finally {`:

  ```js
      // Non-fatal (data-store-cdn-limit D3): runs only after the commit decision and the write; never
      // touches the exit code, step outputs or the written file.
      try {
        const warning = provenanceWarningLine(result.snapshot, dateKey)
        if (warning) console.log(warning)
      } catch {}
  ```

- That is the only change to the script. It runs only on the accepted path, after
  `evaluateSnapshotRecord` returned `ok` and `writeCapturedSnapshot` wrote the file and set
  `wrote`/`snapshotPath`. It fires the same way under `SNAPSHOT_OUT_PATH`, where it is just a log
  line. Use stdout (`console.log`), as `scripts/purge-cdn.mjs:111,140` do for their `::warning::`
  lines.
- Header comment (`:1-23`): add one sentence after the exit-code paragraph: *"An accepted snapshot
  whose completed seasons were not all read from the data store logs one non-fatal `::warning::`
  (`provenanceWarningLine`) after the write; it never changes the exit code, step outputs or the
  file."*
- **No** retry, issue filing, workflow, permission or `daily-snapshot.yml` change.

## 3. Data repo — tests in `test/snapshot-capture.test.mjs`

Append a section (`// ─── provenance warning (capture-provenance-warning) ───`). Reuse
`makeRecord` and pass its `.data` as the snapshot. Add a local builder for a 14-season `careerStats`
(2012–2025), with every provenance `'data-store'` unless overridden. Do **not** edit an existing
test.

**PW-1 · `nonDataStoreSeasons`**
- all 14 `'data-store'` → `[]`;
- one season `'live-api'` → `[{ season: 2019, provenance: 'live-api' }]` only;
- `null` and `'cache-hit'` are both listed, in `seasons` order;
- a season whose key is absent from `provenance` → listed with `provenance: undefined`;
- `seasons` present and `provenance` missing → every season listed with `undefined`, no throw. Also
  `provenance: null` gives the same result;
- `careerStats` missing, `detail` missing, `seasons` missing, `seasons` not an array → `[]`;
- `null`, `undefined`, `42`, `'x'`, `[]` as the whole input → `[]`, no throw;
- `makeRecord()`'s default `careerStats` (`seasons: []`) → `[]`.

**PW-2 · `provenanceWarningLine` output**
- the 2019 `live-api` + 2021 `null` case with `dateKey` `'2026-10-23'` → `assert.equal` against the
  exact literal line in §1b;
- a missing key renders `(missing)`;
- all `'data-store'` → `null`; empty or missing `seasons` → `null`;
- a provenance value containing `'%'` and `'\n'` renders escaped (`%25`, `%0A`) and the result has
  no raw newline.

**PW-3 · "byte-identical to today" on a clean capture.** These pin, at unit level, that the new
code adds nothing to a clean run and cannot change what is written:
- an all-`'data-store'` snapshot gives `provenanceWarningLine` → `null`, so the script prints no
  extra line;
- **no mutation:** deep-freeze a snapshot (a small recursive `Object.freeze` in the test file). Then
  call `nonDataStoreSeasons` directly, where ES-module strict mode makes any write throw: no throw,
  and the expected result. Also `JSON.stringify(snapshot)` before === after a
  `provenanceWarningLine` call on an unfrozen dirty snapshot;
- `evaluateSnapshotRecord` on the same clean record still returns `{ ok: true, snapshot }` with
  `result.snapshot === record.data` (the gate is untouched).

**PW-4 · a helper failure cannot fail the capture**
- `provenanceWarningLine(snap, d, () => { throw new Error('boom') })` → `null`, does not throw;
- a snapshot whose `inputStatus` is a getter that throws (`Object.defineProperty`) →
  `provenanceWarningLine` returns `null` and does not throw. `nonDataStoreSeasons` itself is
  allowed to throw on this input; do not assert either way for it;
- `find` returning a non-array (`null`, `{}`) → `null`.

**PW-5 · script wiring (source-text; precedent `test/manifest.test.mjs:135`,
`test/inseason.test.mjs:555`).** The script imports Playwright and runs `main()` on import, so it
cannot be imported. Read `scripts/capture-snapshot.mjs` as text and assert:
- `provenanceWarningLine(` occurs exactly once outside the import line;
- its index is after the index of `writeCapturedSnapshot(target` and after `[capture] wrote`;
- the slice from that index to the next `} finally {` contains `} catch {}`, and contains none of
  `process.exitCode`, `setStepOutput`, `writeJsonStable`, `writeCapturedSnapshot`, `return`,
  `throw`.

These guard placement and isolation. They are deliberately coarse. If the reviewer judges them too
brittle, the fallback is to drop PW-5. Never weaken PW-1…4.

The warning's real emission on Actions is not exercised (side effect only). **Do not dispatch
`daily-snapshot.yml` in any form.** It has no dry-run input, it runs `origin/main` code (the new code
is unpushed until sign-off), and a dispatch on a day not yet captured commits a real, permanent
snapshot (Invariant 5). The hand-back reports the live check as **"not done — first real capture
after push"**.

## 4. CR-30 release rule — six sites, one rule

Rule: **a release that rewrites a completed season-totals file in place pushes the app's
`SEASON_TOTALS_CACHE_REVISION` bump only after BOTH the jsDelivr purge verifies AND raw GitHub
serves the new bytes.** (Raw is the family-file fallback since CR-29 Stage 1, and after one
jsDelivr failure it serves the rest of that session; `max-age=300`.)

| # | Repo · site | Change |
|---|---|---|
| 4.1 | data `git-workflow.md` step 5 | **New** statement (step 5 has none today) — text in §4.1 below, outside this table |
| 4.2 | app `docs/cross-repo-registry.md` CR-30 | Invariant becomes, verbatim (Revision 1 Stage 2 item 3's approved text): *"An in-place rewrite of a completed season-totals file ships with a `SEASON_TOTALS_CACHE_REVISION` bump, pushed after its purge verifies and raw GitHub serves the new bytes (raw is the family-file fallback, and after one jsDelivr failure it serves the rest of that session)."* App/Data/Tests unchanged. |
| 4.3 | app `src/api/sleeperStats.js:11` | Comment only. `Push the bump only after the data purge verifies (bin/purge-cdn.mjs).` → `Push the bump only after the data purge verifies (bin/purge-cdn.mjs) and raw GitHub serves the new bytes (data git-workflow.md step 5).` Wrap so no line exceeds the file's existing comment width. No code change. |
| 4.4 | data `CLAUDE.md:55` (`scripts/migrate-*.mjs` row) | `push after purge verifies;` → `push after purge verifies and raw GitHub serves the new bytes;` |
| 4.5 | data `README.md:1527` | `push it after the purge verifies;` → `push it after the purge verifies and raw GitHub serves the new bytes ([git-workflow.md](git-workflow.md) step 5);` |
| 4.6 | data `scripts/migrate-absence-role.mjs:12-14` (header) | `push it after the purge verifies;` → `push it after the purge verifies and raw GitHub serves the new bytes;` Rewrap the three-line block; comment only. |

### 4.1 `git-workflow.md` step 5 — text to append

Append this to the end of step 5, as a paragraph followed by a fenced block, indented to match the
step's list item:

> **CR-30 releases.** For an in-place rewrite of a completed season-totals file, also confirm raw
> GitHub serves the new bytes before pushing the app's `SEASON_TOTALS_CACHE_REVISION` bump. Run this
> for every rewritten path; each must print `match`. Raw caches for up to 5 minutes, so if one
> differs, wait and re-run. Do not push the app until every path matches.

```sh
for p in nfl/season-totals/2025.json; do   # list every rewritten path
  raw=$(curl -sfL "https://raw.githubusercontent.com/antonwilms/sleeper-dashboard-data/main/$p" | shasum -a 256 | cut -d' ' -f1)
  loc=$(shasum -a 256 "$p" | cut -d' ' -f1)
  [ "$raw" = "$loc" ] && echo "match $p" || echo "DIFFERS $p"
done
```

This compares the hash field only: `shasum` prints `<hash>  -` for stdin and `<hash>  <path>` for a
file. `curl -f` turns an HTTP error into an empty body, which then prints `DIFFERS`. Session 2 runs
the loop once against one unchanged completed file (e.g. `nfl/season-totals/2020.json`) to confirm
it prints `match`, and reports the output.

A grep for `purge verif` / `SEASON_TOTALS_CACHE_REVISION` outside `.claude/tasks/` in both repos at
`5231fb4`/`86bac15` finds **five** existing statements of the ordering (4.2–4.6). 4.1 adds a sixth,
new one; `git-workflow.md` step 5 has none today. `docs/integrations.md:132,209`
mention the revision but not the release order, so they are left alone. Session 2 re-runs that grep
after editing and reports the hits.

## 5. CR-01 — provenance-vocabulary coupling (app `docs/cross-repo-registry.md`)

Replace the CR-01 entry's fields with:

```
- **Invariant:** The v3 envelope the app writes (`targetSeason`, `scoringSettings`, `inputStatus`, `projectionBasis`) is what the data gate and grader read. `inputStatus.careerStats.detail.provenance` values are `'data-store'|'cache-hit'|'live-api'|null`; the capture warns (never rejects) on any season in `detail.seasons` (2012…the envelope's `currentSeason`) not `'data-store'`. From a season's last game until Sleeper's `nflState.season` rolls over, the just-completed season is outside `seasons` and not covered.
- **App:** `src/utils/projectionSnapshot.js` (`writeProjectionSnapshot`, `buildCareerStatsStatus`); `src/api/sleeperStats.js` (`getSeasonTotals`)
- **Data:** `lib/snapshot-capture.mjs` (`evaluateSnapshotRecord`, `nonDataStoreSeasons`); `scripts/grade-snapshot.mjs` (`gradeSnapshot`)
- **Tests:** `test/snapshot-capture.test.mjs`
```

The index is 8,714 bytes against a 12,000 cap (`crossRepoIndex.test.js`). §4.2 plus §5 add about
550 bytes. Both index tests resolve symbols whole-word per file. `buildCareerStatsStatus` is
module-private, which is fine: it only has to appear in the file. `nonDataStoreSeasons` must exist in
the data working tree before the data `npm test` runs.

## 6. Operator doc — data `snapshot-workflow.md`

After the rejection table's closing paragraph ("A rejection almost always means…"), add:

> **A provenance warning is not a rejection.** An accepted capture may log
> `::warning title=careerStats provenance::<date>: completed seasons not from the data store — <season> (<provenance>), …`.
> The snapshot is still written and committed. The listed seasons were read from the live Sleeper
> API (pre-D-76 classification) or by an unknown path. The daily job builds the app with
> `VITE_DATA_STORE_URL` set to raw GitHub, a single-source base with no jsDelivr step and no
> fallback (CR-29, Guard 1). So the cause is raw GitHub failing for those files on that run: an HTTP
> error, timeout, parse error or network error. The snapshot is kept as captured;
> whether the frozen prior should refuse such a snapshot is a backlog decision for before the 2027
> kickoff. It does not cover the just-completed season between its last game and Sleeper's season
> rollover (CR-01).

No `data-catalog.md` change: the family's coverage, schema and gate are unchanged.

## 7. Housekeeping — separate commits

**Data repo** (one commit, `plan: capture-provenance-warning + data-store-cdn-limit record`):
- add the untracked `.claude/tasks/data-store-cdn-limit.md`;
- add this file, `.claude/tasks/capture-provenance-warning.md`;
- `.claude/tasks/app-repo-backlog.md`: keep the existing uncommitted edits (the two new entries) and
  strike the CR-29 one. Its heading becomes `### ~~Family-file raw fallback (CR-29)~~`, with a new
  line directly under it: `**✅ Done 2026-10-23** — app \`ff9a751\` (fix pass \`511b8cf\`).` The body
  is left verbatim, as the file's own header asks ("Strike through and note the app commit when
  done"). The "Frozen prior…" entry stays open.

**App repo** (one commit, `docs(tasks): snapshot-dynasty-capture task file; D-86 resolved`).
**Created only after the data push** (§8 step 8), citing commit A's *pushed* SHA. It is never
rewritten afterwards:
- add the long-untracked `.claude/tasks/snapshot-dynasty-capture.md` unchanged;
- `.claude/tasks/data-repo-backlog.md` D-86: strike it and move it verbatim to
  `data-repo-backlog-resolved.md` → `## Done` (that file's convention, `data-repo-backlog.md:19`).
  Add a `**✅ RESOLVED <push date>**` line citing commit A's pushed data SHA. In the moved
  text, amend D-86's last sentence "Stage 2 … is independent and still open." to note it is planned
  in data `.claude/tasks/capture-provenance-warning.md`. *(Not in the brief. It follows directly from
  the strike, so a stale D-86 isn't left asking for work that's already done.)*

**Cross-repo commit IDs:** `ff9a751`/`511b8cf` are already on app `origin/main`, so commit A can
cite them as-is. Commit A's own SHA is cited only once it is pushed. That is why commit C waits for
the data push, so no commit is ever rewritten to fix a citation.

## 8. Commit order, tests, push

**Session 2 (before sign-off):**

1. **Data:** `git pull --rebase origin main` first (it was 2 behind at planning).
2. Data commit A = §7 data housekeeping.
3. Edit the data feature (§1, §2, §3, §4.1, §4.4–4.6, §6) and the app files (§4.2, §4.3, §5).
4. Run **both** suites before either feature commit: data `npm run smoke` and `npm test`
   (`registry.test.mjs`, `claudeMdSize.test.mjs` — data `CLAUDE.md` is 19,651 B against a 25,000
   cap). In the app, run `npm test` (`crossRepoIndex.test.js`), `npm run lint` and `npm run build`.
   No app smoke run: the app change is a comment and a doc. Run the §4.1 loop once against an
   unchanged completed file. **Never dispatch `daily-snapshot.yml`** (§3).
5. Data commit B, `feat: capture provenance warning + CR-30 raw-serves release rule`: §1–§3, §4.1,
   §4.4–4.6, §6.
6. App commit D, `docs: CR-01 provenance coupling, CR-30 raw-serves release rule`: §4.2, §4.3, §5.
   **Do not create commit C yet.** Leave `snapshot-dynasty-capture.md` untracked and D-86 where it
   is.
7. **Push nothing.** Hand back to Session 1. Then implementation-reviewer runs (full) on A, B and D,
   followed by Anton's sign-off. The data-side "commit and push every session" rule is about
   *uncommitted* work; committed local work only needs the rebase at push time.

**Push step (only after Anton's sign-off):**

8. **Data first:** `git pull --rebase origin main`, then `git push origin main`. Record the pushed
   SHAs of A and B (`git log origin/main`).
9. **App:** create commit C (§7 app housekeeping) citing A's pushed SHA, then
   `git pull --rebase origin main` and `git push origin main` (D and C together).
10. Never `--force`. If a push is rejected, `pull --rebase` and retry. A rejected **app** push never
    changes the data SHA C cites, since data is already pushed.

**Hand-back (step 7):** SHAs A, B, D; every file touched; every deviation; the §4 grep output; the
§4.1 loop output; the live check as "not done — first real capture after push"; and what each
PW-1…5 test asserts. **Push report (after step 10):** the pushed SHAs A–D, and C's diff.

## 9. Out of scope

- Any gate change to `evaluateSnapshotRecord`; any retry, issue filing or workflow edit (D3).
- Covering the rollover-window season or recording in-progress provenance (§0; data-store-cdn-limit
  §2.2).
- D2 (frozen prior refusal) and D4 (`bin/import-snapshot.mjs` gate); both already sit in backlogs.
- Pinning the date Sleeper rolls `nflState.season` over.

---

## Plan-review round 1 — fixes (accepted by Anton 2026-10-24)

The plan-reviewer (opus, full) raised six flags. All six were accepted and are **already applied in
the body above**. This section is the record; where it and the body differ, the body wins.

1. **Operator text cause (§6).** The daily job's `VITE_DATA_STORE_URL` is raw GitHub
   (`daily-snapshot.yml:75`), a single-candidate base under Guard 1. So the cause is raw GitHub
   failing, not jsDelivr.
2. **Commit order (§7, §8).** Data is pushed first. App housekeeping commit C is created only after
   that push, citing A's pushed SHA. No history rewriting.
3. **No dispatch (§3, §8 step 4).** No `workflow_dispatch` of `daily-snapshot.yml` in any form. The
   live check is reported as "not done — first real capture after push".
4. **Checksum command (§4.1).** It moved out of the table into a fenced block and compares the hash
   field only (`cut -d' ' -f1`). Session 2 runs it once against an unchanged file.
5. **Count (§4).** There are five existing statements of the ordering, plus one new one in
   `git-workflow.md` step 5.
6. **CR-30 text (§4.2).** Revision 1's full approved invariant is restored, including "after one
   jsDelivr failure it serves the rest of that session".

Also approved: the §0 offseason-scope correction, and moving D-86 to resolved (§7).
