# D-76 · absence-role — Stage C (impact, app side, docs, release)

Second half of `d76-absence-role.md` (same folder), split off to keep each file under 40 KB. Read the
main file first: its §0 decisions (D1–D10), Stage A/B outputs, §6 backlog table, § Cross-repo impact
(CR-28, CR-30 texts) and touch list all apply here; "§Dn", "§An", "§B" refer to it. **Session 2 runs on
sonnet, effort medium**, one Session 2 each for C1, C2 and C3, each ending with a hand-back; neither repo is pushed before Anton signs off C2.


### C1 · Impact measurement (data repo, in the D-76 worktree)

**C1a · `scripts/capture-snapshot.mjs`:** one optional env `SNAPSHOT_OUT_PATH`. When set: it must be
absolute and resolve outside the repo working tree (`path.relative(repoPath(), p)` starts with `..`;
else exit 1); the skip-if-committed check is bypassed; the accepted snapshot is written there with
`writeJsonStableAt` (Stage A's `lib/io.mjs` addition — never `writeJsonStable`, which would rebase the
path under the repo); `setStepOutput` is not called. Unset → byte-identical behaviour (the
daily workflow never sets it). Header comment documents it.

**C1b · New `scripts/absence-role-impact.mjs`** (offline; no served output): (1) a CORS static file
server (`node:http`, `Access-Control-Allow-Origin: *`, JSON content type) over a given root on a given
port; (2) `diffCaptures(before, after)` → per veteran and rookie row: `projection.projectedGames`,
`projectedPPG`, `projectedTotalPts`, `factors.injurySeasons`, `factors.absenceShapeFactor`,
`factors.isBounceBack`, `dynasty.score`, `dynasty.label`; (3) a markdown writer. Pure parts unit-tested
in `test/absence-role-impact.test.mjs` (diff of two tiny fixtures; label flip counted; a row only on
one side reported, not dropped).

**C1c · Run** (needs Anton's OK first: it downloads Playwright + Chromium, `npm install --no-save
--no-package-lock playwright@1.63.0`, as `daily-snapshot.yml` does — state name, source and size when
asking):
1. Two **detached** worktrees outside the repo (git refuses a branch already checked out elsewhere —
   `main` is in the primary checkout, `d76-absence-role` in the D-76 worktree):
   `git worktree add --detach <before> $(git merge-base d76-absence-role origin/main)` and
   `git worktree add --detach <after> <Stage B SHA>`. Remove both after step 7.
2. Build the app once from app `main` (pre-bump) with `VITE_DATA_STORE_URL=http://localhost:8787`
   (non-jsDelivr base → manifest from `${BASE}/manifest.json`, `rawManifestUrl` returns null);
   `npm run preview -- --port 4173 --strictPort`.
3. Serve `<before>` on 8787 → capture to `<scratch>/before.json` (`SNAPSHOT_LEAGUE_ID` = the
   `leagueId` of `snapshots/2026-10-18.json`); serve `<after>` → `<scratch>/after.json`; serve
   `<before>` again → `<scratch>/before2.json`. Back to back, one session.
4. `before` vs `before2` is the noise floor (live Sleeper/KTC state moving between runs) — it must be
   empty on every compared field, or report the noise and stop.
5. Write `grading/<UTC date>-absence-role-verdict.md` (unregistered `<date>-*-verdict.md`):
   counts of rows whose `projectedGames`, `projectedPPG`, `projectedTotalPts`, dynasty score, label
   move; the distribution of each move; the 20 largest movers by |Δ dynasty score| and by
   |Δ projectedTotalPts| (name, position, team, before → after, injurySeasons before → after); label
   transitions; the in-season count of short-season-cut rows whose live `dnpWeeks` goes to 0 (from the
   two trees' `nfl/season-totals/2026.json` once 2026 is regenerated in the `<after>` worktree with
   `node bin/update.mjs nfl --dry-run` — if a dry-run cannot emit the file, compute it in memory with
   `classifyAbsences` on the stored 2026 file and say so); the Stage A `--absence` §3/§5 summary; and the
   V2.12 re-measure: app `node_modules/.bin/vite-node scripts/verify/computed-stats.mjs -- --data
   <after> --out <after>/verification --only v2 --no-fetch` (copy back only the V2.12 numbers; the
   harness output in the worktree is not committed).
6. Compare with §D9's pre-estimate; a mover count more than 3× the estimate → stop and report.
7. Commit C1a/C1b/test/verdict on the branch.

### C2 · App change and data docs — committed, reviewed, signed off; **nothing pushed**

One Session 2. It commits in both repos and pushes **neither**. Hand-back → Session 1 runs
implementation-reviewer (effort high) on the C1+C2 diffs (both repos) → fix pass if needed → Anton's
sign-off. C3 starts only after that sign-off.

**App worktree** (why: an unpushed commit on app `main` would ship with the next app session's push):
from the app primary checkout on an up-to-date `main`, `git worktree add -b d76-absence-role
"../sleeper-dashboard-d76" main`; inside it `npm ci` and `ln -s "../sleeper-dashboard/.env.local"
.env.local` (gitignored; never `git add` it). All C2 app work happens there; the app primary checkout
stays on `main` and other app sessions keep pushing it normally. Fix passes from the review land on the
same branch.

**App commit** (sleeper-dashboard, branch `d76-absence-role` in the app worktree, local):
- `src/utils/cache.js`: `setCacheWithMeta` stores `meta.sourceRevision ?? null`; `getCacheRecord`
  returns `sourceRevision`. No TTL change.
- `src/api/sleeperStats.js`: `export const SEASON_TOTALS_CACHE_REVISION = 1` with a header comment
  (CR-30: bump on any in-place rewrite of a completed season-totals file that keeps `recordCount`; push
  only after the purge verifies). In `getSeasonTotals`: a record with `sourceLastModified` whose
  `sourceRevision !== SEASON_TOTALS_CACHE_REVISION` is treated as stale (log
  `[career] <season>: cache predates revision <n> — refreshing from data store`) and falls through to
  step (2); step (2) writes `sourceRevision: SEASON_TOTALS_CACHE_REVISION`. Live-API-sourced records
  (no `sourceLastModified`) and `loadCurrentSeasonTotals` are unchanged.
- `src/utils/inSeasonConstants.js`: `PRIOR_MODEL_FROM` = D+1, where D is the UTC date whose
  `daily-snapshot` capture opens the planned §C3 window (D8: the first capture on the new model); prepend
  the boundary to the history sentence ("absence-role (D-76), a served-data correction — the first
  capture after the coordinated push; before it rookie-total-wiring …").
- `src/__tests__/priorModelFrom.test.js`: `GOLDEN.recordedUnder` = the new value; `GOLDEN.outputs`
  unchanged (fixtures do not read served data — if any output moves, stop).
- `src/utils/availabilityGrid.js` header (`:5-17`): the corrections are now two (`'X'`→`'D'` CR-28 and
  `'D'`→`'X'` D-76); a served `'X'` also covers a week Sleeper returned the player without a game while
  the weekly roster listed him in a role state; the API-only path still writes `'D'` for those weeks.
- `src/utils/inSeasonScoring.js:550-551` limit note: add that a role week also reads `'D'` until the
  roster refresh lists it (same one-run lag).
- `src/api/sleeperStats.js` `getSeasonTotals` comment block (`:158-163`, "Aggregate all 18 weeks…"): add
  one line — the API-only path (step 3) classifies from Sleeper `gp` alone: no roster check in either
  direction, so a role week Sleeper returns with `gp 0` stays `'D'` there (data-store path: CR-28, D-76).
- Tests: `src/api/sleeperStats.test.js` — **SR-1** a data-store record with an older (or null)
  `sourceRevision` and an up-to-date `sourceLastModified` is refetched and re-cached with the current
  revision; **SR-2** a current-revision record is a cache hit (no fetch); **SR-3** a live-API record (no
  `sourceLastModified`) keeps today's path. `src/utils/cache.test.js` — **CA-1** the revision
  round-trips through `setCacheWithMeta`/`getCacheRecord`, and an absent `meta.sourceRevision` reads
  back `null`. Lint, build; smoke: preview loads, Market renders, no `NaN`.
- Docs: `docs/cross-repo-registry.md` **CR-28 text only** (main file § Cross-repo impact). **CR-30 is
  not added in C2**: its Data site `scripts/migrate-absence-role.mjs` exists only on the data branch
  until C3 step 3, and data `test/registry.test.mjs` requires every listed Data file to exist on the
  checkout it runs in. It lands in C3 step 5 (text fixed in the main file). The `SEASON_TOTALS_CACHE_REVISION`
  header comment cites "CR-30" from C2 on; that is intentional and harmless (no test resolves it).
  `docs/signal-registry.md` rows at `:45` and `:47` ("since D-76 a week the roster lists in a role state
  is `'X'`"); `docs/projection.md` after *Boundary 9* (`:358`): "Boundary 10 — a served-data correction
  (D-76) moved `projectedGames`/`injurySeasons`/`absenceShapeFactor`/bounce-back; `PRIOR_MODEL_FROM`
  bumped with the coordinated push"; `docs/dynasty-scoring.md:133` add "role weeks (practice squad,
  released, exempt) are `'X'` since D-76"; `docs/integrations.md` *Career history loader* → *Cache
  reuse* gains the revision sentence. All phrased as mechanism (`docsAvailabilityClaims.test.js`).
- Backlog (app `.claude/tasks/data-repo-backlog.md`): add main file §6's items; D-76 moves to the
  resolved file in C3.

**Data docs commit** (D-76 worktree, branch `d76-absence-role`, local):
`data-catalog.md` season-totals `'D'` semantics (`:38`) rewritten for D2 + "**Correction note:
Invariant-1 rewrite #5 (absence-role, `<SHA>`)** — 2017, 2018, 2020–2025 in place
(`scripts/migrate-absence-role.mjs`; only `'D'` → `'X'`, `dnpWeeks`, `availability`)", with `<SHA>`
the branch's Stage B SHA (C3 step 6 rewrites it after the rebase); rosterweekly *Consumption* (`:279`)
and *Keep-rationale* (`:280`) name both directions; `grading/anchor-policy.md`: intro counts (eleven
changes; twice through a data correction), date-table row 10 with the data/app SHAs as placeholders
`TBD-C3` and the push-time and purge-result cells `TBD-C3`, and a section *Veteran rows — boundary 10
(input correction)* modelled on boundary 7's, stating it **is** row-detectable by
`projectionModelFrom` and that the cross-check is open (D-83). Data `.claude/tasks/app-repo-backlog.md`:
the V2.12 no-snaps item (main file §6).

Hand-back: both repos' SHAs, every file, deviations, test assertions.
### C3 · Release (separate Session 2, after Anton signs off C2)

**Permitted edits in this session — only these, all specified below; anything else → stop:** the
`PRIOR_MODEL_FROM` / `GOLDEN.recordedUnder` date if the release night differs from the one C2 planned;
the CR-30 index entry; SHA citations, push time and purge result (step 6); D-76's move to the resolved
backlog file; the stop/reset of step 3; the revert R1–R5 (revert commits, the 2026 regeneration, the
manifest bump, the anchor-policy row-10 "released then reverted" line); the redo preamble (RD1–RD3).

**Window and deadline.** Opens when day D's `daily-snapshot` commit has landed on data `main` (the
16:29 UTC cron can start hours late — check `git log origin/main -- snapshots/D.json`). The **data push
(step 3) must finish before 06:00 UTC on D+1**, ahead of the 06:13 UTC Mon/Tue/Fri `nfl-season-totals`
cron and the 06:23 UTC daily `nflverse-rosterweekly` cron; if it cannot, stop before step 3 and restart
on another night (that night's D+1 for `PRIOR_MODEL_FROM`). No `bin/import-snapshot.mjs` run until the
hand-back. **Revert trigger, and only this:** the data push (step 3) succeeded and the app push (step 5)
has not succeeded by **14:00 UTC on D+1** — whether the purge kept failing or the app step did. Then run
R1–R5 and stop. Data and `PRIOR_MODEL_FROM` are never out of step across a 16:29 UTC capture. A failure
**before** step 3's push → the step-3 reset, no revert. A failure **after** step 5's push (steps 6–7) →
no revert: data and app are already consistent; fix forward within the permitted edits or stop and
report.

**Worktrees** (from Stage A / C2): data `../sleeper-dashboard-data-d76`, app `../sleeper-dashboard-d76`,
each with its `.env` / `.env.local` link. Check `git status` before every commit — never stage `.env*`.

Steps, in order:
1. Data, D-76 worktree: `git fetch origin`; `git rebase origin/main`. Expect a `manifest.json` conflict
   (at least top-level `generatedAt`; Anton 2026-10-19). **Resolve by regenerating, never by hand-editing:**
   `git checkout --ours manifest.json` (during a rebase, `--ours` is the upstream side), then for every
   `nfl/season-totals/<y>.json` the commit being replayed changed, re-run the manifest writer —
   `node -e` calling `updateManifestEntry({ path, recordCount: Object.keys(readJson(path)).length,
   inProgress: false, schemaVersion: 4 })` from `lib/manifest.mjs`/`lib/io.mjs` — then `git add
   manifest.json` and `git rebase --continue`. Confirm afterwards with `git diff origin/main --
   manifest.json` that only those entries' `lastModified` and the top-level `generatedAt` differ. A
   conflict in any other file → `git rebase --abort`, stop. Re-run Stage B step 2b (idempotency) — zero
   changes.
2. Data, same worktree: `node bin/update.mjs nfl` (2026 in-progress, normal ingest, new classifier);
   `npm run smoke`; commit on the branch (`data: 2026 season-totals reclassified (D-76)`).
3. Data, primary checkout (on `main`; precondition: `git status` clean and `git log origin/main..main`
   empty): `git merge --ff-only d76-absence-role`; immediately `git pull --rebase origin main` (manifest
   conflicts: union rule; a conflict on any other file → `git rebase --abort`); `npm run smoke`;
   `git push origin main` (never `--force`). Record the push time (UTC) and the pushed range
   (`<old origin/main>..<new origin/main>`).
   **Stop before a successful push** (rebase conflict, red smoke, rejected push twice): confirm
   `git log origin/main..main` lists only D-76 commits, then `git reset --hard origin/main` in the primary
   checkout, so no later `import-snapshot` push can ship them. The branch keeps them. Report; no revert.
4. `GITHUB_REPOSITORY=antonwilms/sleeper-dashboard-data node bin/purge-cdn.mjs
   nfl/season-totals/2017.json nfl/season-totals/2018.json nfl/season-totals/2020.json …
   nfl/season-totals/2026.json` (9 paths). Exit 0 required. Exit 1 → re-run the whole command, waiting
   ≥ 10 min between runs, until exit 0 or the revert trigger.
5. App, app worktree: `git fetch origin`; `git rebase origin/main` (conflict → stop; revert trigger
   applies); confirm `PRIOR_MODEL_FROM` equals the UTC date of the first 16:29 capture after now (D+1 when
   this runs before 16:29 on D+1) — if not, amend the date and `GOLDEN.recordedUnder`; add the **CR-30
   entry** to `docs/cross-repo-registry.md` (main file § Cross-repo impact; the migration script is now on
   data `main`) in its own commit; `npm test`, `npm run lint`, `npm run build` (red → only a permitted edit
   may fix it, else stop; revert trigger applies). Then in the app primary checkout (on `main`, clean):
   `git pull --rebase origin main`; `git merge --ff-only d76-absence-role`; `git push origin main`.
6. Follow-ups, one commit per repo, pushed the same session after `git pull --rebase`: data —
   `data-catalog.md` correction-note SHA, anchor-policy row 10 (data and app SHAs as pushed, push time
   from step 3, purge result from step 4); app — D-76 moved verbatim to `data-repo-backlog-resolved.md`,
   cited data SHAs rewritten (CLAUDE.md cross-repo commit IDs). Data `npm test` (the registry test now
   resolves CR-30) and app `npm test` green.
7. Live checks: fetch
   `https://cdn.jsdelivr.net/gh/antonwilms/sleeper-dashboard-data@main/nfl/season-totals/2021.json`; pid
   `2944` has `dnpWeeks` 0. Preview the app from the pushed `main` against the real store in a **fresh**
   browser profile: the console shows `[career] <season>: loaded from data store` for each completed
   season and, on reload, `cache-hit`; the `cache predates revision` log appears only in a browser that
   cached under the pre-bump app (covered by SR-1, not a live requirement). Market renders, no `NaN`.
   A failed live check → report to Anton (no revert — see the trigger). Remove the data, app and C1
   worktrees and delete both local `d76-absence-role` branches once they are fully merged. Hand back:
   every SHA (both repos), push times, the purge output, the live-check results.

**Revert (R1–R5; only on the trigger above):**
- R1. Data, primary checkout: `git pull --rebase origin main`; `git revert --no-commit <range pushed in
  step 3>` (newest first). Conflict rules, applied in order: `manifest.json` → `git checkout --ours
  manifest.json` (keep current `origin/main`'s manifest wholesale; R2–R3 rewrite the entries this revert
  touches); `nfl/season-totals/2026.json` → `git checkout --ours` it too (R2 regenerates it); any other
  conflict → `git revert --abort`, stop, report to Anton immediately (the 16:29 capture will record the
  out-of-step state; say so). `git commit -m "data: revert D-76 release — app could not follow before 14:00 UTC"`.
- R2. `node bin/update.mjs nfl` — the reverted (pre-D-76) code regenerates 2026 and its manifest entry.
- R3. For each of the 8 completed paths (2017, 2018, 2020–2025): move `lastModified` forward through the
  manifest writer — `node -e` calling `updateManifestEntry({ path, recordCount:
  Object.keys(readJson(path)).length, inProgress: false, schemaVersion: 4 })` from
  `lib/manifest.mjs`/`lib/io.mjs` — so a browser that cached the D-76 body refetches (script-written, not a
  hand edit).
- R4. `npm run smoke`; commit (R2+R3); `git pull --rebase origin main`; `git push origin main`; purge the
  same 9 paths (exit 0; retry as step 4).
- R5. R1 also reverted the C2 data docs commit, so re-add to `grading/anchor-policy.md` only date-table
  row 10, reading "released then reverted" with the push, revert and purge times (no boundary-10
  section, no intro-count change); commit and push. The app branch stays unpushed. Stop and hand back.

**Redo on a later night (RD1–RD3, then steps 1–7):** after a revert, `origin/main` holds the D-76
commits **and** their revert, so a plain rebase of the branch would drop the D-76 commits as already
upstream.
- RD1. Data, D-76 worktree: `git fetch origin`; `git reset --hard origin/main` (the branch now equals
  `main`, revert included); `git revert --no-edit <the R1 revert commit>` (revert of the revert —
  restores the classifier, migration, rewritten files and docs; manifest conflict → `--ours`, then RD2).
- RD2. Manifest: run R3's `updateManifestEntry` call for the 8 completed paths again (so browsers that
  cached the restored pre-D-76 body refetch); remove the "released then reverted" row-10 line from R5 only
  if C2's row 10 is back (the revert-of-revert restores it — keep exactly one row 10, its cells `TBD-C3`);
  `npm run smoke`; commit.
- RD3. Proof before step 1: Stage B step 2b (idempotency, zero changes) and step 2c with
  `--before-rev <the R1 revert commit>` — `seasons` and `totals` deep-equal Stage A's report. Then set the
  new night's `PRIOR_MODEL_FROM` in the app worktree (amend) and run steps 1–7 (step 1's rebase is now a
  no-op or a clean rebase onto newer `origin/main`).
