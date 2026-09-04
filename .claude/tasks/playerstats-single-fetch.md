# One fetch, both families — merge the advstats and gamelogs jobs

**Type:** ingest orchestration + one injection seam + a workflow merge.
**No served shape change, no data change, no re-ingest, no schemaVersion move.**
**Session model:** plan (opus, this file). Implementation is a separate sonnet session — do not edit
source here.
**Source:** `store-audit-2026-08-25.md` E5, queue row 11. Re-verified against live source 2026-08-31
at HEAD `e3b3399`.

> **The point is atomicity, not the saved download.** The audit says so and it is right: two jobs
> reading `stats_player_week_<year>.csv` on different days can derive the two families from
> **different upstream revisions of the same file within one week**. nflverse re-publishes; a Friday
> correction currently lands in gamelogs and not in advstats. The C1/C3 slice made this sharper —
> the two families now read that CSV with **deliberately different filters** (advstats REG-only,
> gamelogs REG+POST), so "same source" is already a claim that needs care. Same source, same
> revision, one fetch.

**Working-tree note.** `store-audit-2026-08-25.md` is modified and uncommitted. **Do not stage,
commit, revert or edit it.** Nothing here touches it.

---

## 1. Verified facts

### 1.1 · Two jobs, two fetches, one file

| | advstats | gamelogs |
|---|---|---|
| workflow | `nflverse-advstats.yml` | `nflverse-gamelogs.yml` |
| cron | **Thu 13:41 UTC** | **Sat 13:47 UTC** |
| fetch | `fetchPlayerStatsCsv(year)` | `fetchPlayerStatsCsv(season)` |
| entry | `updateAdvStats({year, dryRun, force})` | `updateGameLogs({year, all, dryRun, force})` |

Each job does its own checkout, `npm ci`, fetch (~8.5 MB), commit, and purge. Both re-key through
`nflverse/playerids.json` and so must run after the Wednesday playerids Action (13:29).

### 1.2 · Nothing consumes either family inside CI — the day constraints are race avoidance only

Grepped every workflow. The cross-references to advstats are **scheduling comments about not racing
the push to main**, not data dependencies:

- `nflverse-schedule.yml` — *"…(Wed), advstats (Thu) so weekly committers don't race the push"*
- `nflverse-gamelogs.yml` — *"Distinct slot from Mon(KTC)/Tue(roster)/Wed(playerids)/Thu(advstats)"*
- `nflverse-teamcontext.yml` — lists the week's slots, runs before Sunday kickoffs

**No job reads advstats or gamelogs output.** The only hard ordering constraint is
**playerids (Wed) before both**. Merging two jobs into one therefore *reduces* the number of weekly
committers racing `main`, from 8 to 7.

### 1.3 · Saturday is the correct merged slot, and it costs nothing

| merged slot | advstats | gamelogs |
|---|---|---|
| **Saturday 13:47** | Thu → Sat: **2 days fresher** | unchanged |
| Thursday 13:41 | unchanged | Sat → Thu: **loses 2 days**, misses Friday upstream corrections |

**Saturday is strictly non-regressive** — one family gains freshness, the other is untouched, and
Saturday is already the slot whose own comment reasons that base player-stats "settle Tue/Wed
post-games; Saturday is safe." Thursday would actively give up the Friday corrections that are the
audit's motivating example.

### 1.4 · Two live hazards the merge introduces

**Failure coupling.** Today a gamelogs failure cannot harm advstats. Merged, the workflow's commit
step runs only if the node step succeeds — so **a gamelogs throw would discard a perfectly good
advstats write**. That is a regression, not a wash, and §3.3 is how it is avoided.

**`setStepOutput('season', …)` collides.** Both scripts write the same key
(`scripts/update-advstats.mjs`, `scripts/update-gamelogs.mjs`) to drive their purge step. In one
process the second overwrites the first. The values are equal in the scheduled case — both resolve
to `currentSeason` — so it is harmless *today* and silently wrong the moment they diverge. §3.2 gives
the output to the orchestrator instead.

### 1.5 · `--all` is a different mode and does not merge

`updateGameLogs({all: true})` loops `MIN_GAMELOG_SEASON…currentSeason`, fetching per season, and
**deliberately emits no step output and no purge** (*"--all is a manual backfill"*). advstats has no
equivalent. The merged path is the **single-season scheduled case only**; `--all` stays on the
standalone entry point.

### 1.6 · The smoke test pins an entry point

`.github/workflows/smoke-test.yml` runs `node bin/update.mjs advstats --year 2023 --dry-run`. The
standalone subcommands must keep working exactly as they do — the merge **adds** an orchestrator, it
does not replace the two entry points.

---

## 2. The decisions

### 2.1 · An injected CSV, not a rewritten fetch

Add an optional `csv` to both entry points, **default-parameter form**:

```js
export async function updateAdvStats({ year = null, dryRun = false, force = false, csv = null } = {})
export async function updateGameLogs({ year = null, all = false, dryRun = false, force = false, csv = null } = {})
```

When `csv` is non-null the function **skips its own fetch and uses the passed text**; otherwise it
behaves exactly as today. Every existing caller — `bin/update.mjs`, the smoke test, both standalone
workflows' manual dispatch — is unchanged.

This is the seam pattern the repo has now blessed three times: `DEFAULT_DEPS` in
`scripts/update-nfl.mjs`, `DEFAULT_LOAD` in `scripts/panel-run.mjs`, and `DEFAULT_LOAD` in
`scripts/grade-snapshot.mjs`. **Use the same shape, not a new one.**

### 2.2 · One orchestrator subcommand

`node bin/update.mjs playerstats` — resolves the season once, fetches once, drives both families,
owns the step output. Named for the upstream asset (`stats_player_week_<year>.csv`) rather than for
either consumer, because it belongs to neither.

### 2.3 · Alternatives rejected

| option | rejected because |
|---|---|
| Merge on Thursday | §1.3 — gamelogs loses two days and the Friday corrections that motivate the slice |
| Have gamelogs read a CSV advstats cached to disk | Reintroduces the split-brain across a *day* boundary and adds an untracked artifact; §1.4's coupling problem without the atomicity win |
| Fold `--all` in | §1.5 — different mode, no purge, no step output; merging it buys nothing |
| Replace the two subcommands with the orchestrator | §1.6 — the smoke test and every manual backfill depend on them |
| Keep two jobs, just align the days | Two fetches of the same file minutes apart still admit a re-publish between them, and it does not reduce committers |

---

## 3. The edits

### 3.1 · `scripts/update-advstats.mjs` and `scripts/update-gamelogs.mjs`

Add **two** optional parameters per §2.1 — `csv = null` **and `currentSeason = null`**. Guard both:

```js
const cs      = currentSeason ?? await fetchCurrentNflSeason();
const csvText = csv           ?? await fetchPlayerStatsCsv(year);
```

**`currentSeason` matters as much as `csv`.** Both scripts call `fetchCurrentNflSeason()` as their
*unconditional first line* (`scripts/update-advstats.mjs:42`, `scripts/update-gamelogs.mjs:49`) —
it is not gated on `year` being supplied. Injecting only the CSV would leave a merged run making
**three** Sleeper-API calls, contradicting §3.2's "// once" and its own done-definition. Both scripts
need `currentSeason` for `isPast`, so it cannot simply be skipped when `year` is passed.

**Keep the existing null handling.** `fetchPlayerStatsCsv` returns `null` on 404/504 and both scripts
treat that as "not published yet — skip". An injected `csv` must flow through the *same* branch, so a
merged run skips both families identically when upstream has not published.

In gamelogs, the injection applies to the **single-season path only** — inside the `--all` loop the
fetch stays per-season (§1.5).

### 3.2 · `bin/update.mjs` — the `playerstats` subcommand

```
1. currentSeason = await fetchCurrentNflSeason()      // once
2. season        = --year ?? currentSeason
3. csv           = await fetchPlayerStatsCsv(season)  // once
4. setStepOutput('season', season)                    // the ORCHESTRATOR owns this (§1.4)
5. await updateAdvStats({ year: season, csv, currentSeason, dryRun, force })
6. await updateGameLogs({ year: season, csv, currentSeason, dryRun, force })
```

`csv === null` (not published) → log and exit 0 without calling either, matching today's behaviour.

**Remove `setStepOutput('season', …)` from neither script** — they still own it on their standalone
paths. The orchestrator setting it first and the callees re-setting it to the same value is
harmless; what matters is that the orchestrator does not *rely* on a callee to set it.

### 3.3 · Isolate failures **without** committing a half-written family

The naive version of this — catch per-family errors, then put `if: always()` on the commit step — is
**wrong, and would introduce a worse bug than the one it fixes.**

Both scripts write the data file *before* registering it: `writeJsonStable` at
`scripts/update-advstats.mjs:137` then `updateManifestEntry` at `:141`; `writeJsonStable` at
`scripts/update-gamelogs.mjs:152` then `updateManifestEntry` at `:164`. **Today a throw in that gap
is contained** — the node step fails, the commit step (no `if: always()`) never runs, nothing lands.
Add error isolation plus `if: always()` and that same throw now reaches a commit step that runs
`git add nflverse/ manifest.json`, **committing an orphaned data file with no manifest entry** —
a direct Invariant 3 violation ("manifest.json is the index").

**Commit only what completed.** The orchestrator tracks per-family outcome and tells the workflow
what is safe to stage:

1. run advstats; record `ok` / `failed`, do not propagate
2. run gamelogs; record `ok` / `failed`
3. `setStepOutput('advstats_ok', …)` and `setStepOutput('gamelogs_ok', …)`
4. if either failed: print both errors, **exit non-zero**

The commit step runs with `if: always()` but stages **path-scoped**, never `nflverse/` wholesale:

- `manifest.json` — always, if anything succeeded
- `nflverse/advstats/<season>.json` — only when `advstats_ok`
- `nflverse/gamelogs/<season>.json` — only when `gamelogs_ok`

A half-written family's file is simply never staged; it dies with the runner's workspace, which is a
fresh checkout every run. **Purge only the families that were actually committed**, for the same
reason.

**This is the whole safety argument for the merge.** Without failure isolation the merge increases
the blast radius of a single-family failure; without path-scoped staging it trades that for a
manifest-integrity bug. Both halves are required.

### 3.4 · Workflows

- **New** `.github/workflows/nflverse-playerstats.yml` — cron `47 13 * * 6` (Saturday, §1.3),
  `workflow_dispatch`, one checkout, `node bin/update.mjs playerstats`, commit with `if: always()`,
  then purge **`manifest.json`, `nflverse/advstats/<season>.json`, `nflverse/gamelogs/<season>.json`**
  from the single `season` output. Purge **after** push, matching every existing workflow.
- **Delete** `nflverse-advstats.yml` and `nflverse-gamelogs.yml`. Their manual-dispatch role is
  covered by the orchestrator's `workflow_dispatch` plus the still-present standalone subcommands.
- Update the **scheduling comments** in every workflow that names a slot this slice moves or renames.
  The list is **five**, not three:
  `nflverse-schedule.yml` (cites "advstats (Thu)"), `nflverse-teamcontext.yml` (enumerates the week),
  **`nflverse-oline.yml`** (*"off-the-hour (gamelogs Sat 13:47…"*) and
  **`weekly-playerstate.yml`** (*"gamelogs runs Sat 13:47"*) — both name a workflow that is about to
  stop existing — plus the merged file's own header.

  **The clock does not move for anyone else.** Because the merged job takes gamelogs' existing
  Saturday 13:47 slot (§1.3), oline (14:37) and playerstate keep their spacing exactly; only the
  *name* they cite changes. That makes this a rename in four comments, not a re-derivation of the
  weekly schedule — but leaving it is precisely the "stale slot map" hazard, now pointing at a
  deleted file.

### 3.5 · `CLAUDE.md` and `data-catalog.md`

`CLAUDE.md`'s workflow table has one row per workflow file (`nflverse-advstats.yml`,
`nflverse-gamelogs.yml`). Replace both with the merged row. In `data-catalog.md`, both families'
**"Served path / subcommand / refresh"** lines name their own day ("Thursday Action", and the
gamelogs equivalent) — both change, and both should say the two families are now derived from a
single fetch, which is the property a future reader needs.

---

## 4. Step order

1. Add the `csv` parameter to both scripts (§3.1). Existing tests must stay green untouched — if any
   test needs editing, the default-parameter form was done wrong.
2. Add the `playerstats` subcommand (§3.2) with the error handling in §3.3.
3. Tests (§5).
4. **Dry-run the orchestrator**: `node bin/update.mjs playerstats --year 2023 --dry-run`. Confirm one
   fetch, both families reporting, and a `season` output of 2023.
5. **Verify the standalone paths still work** — `advstats --year 2023 --dry-run` and
   `gamelogs --year 2023 --dry-run`, plus `gamelogs --all --dry-run`. §1.6 depends on these.
6. Write the merged workflow; delete the two old ones; update the slot comments (§3.4) and the docs
   (§3.5).
7. `npm test`, `npm run smoke`.
8. Commit, `git -c rebase.autoStash=true pull --rebase origin main`, push. **No CDN purge** — no
   served file changes in this slice.
9. **Trigger the merged workflow manually once** (`workflow_dispatch`) and confirm it commits and
   purges correctly before relying on the Saturday cron. A scheduled job that fails silently is not
   noticed for a week — which is the whole reason this repo's workflows carry the comments they do.

---

## 5. Tests

1. **Injected CSV is used and no fetch occurs** — call `updateAdvStats({ csv, dryRun: true })` with a
   fixture and assert the emitted plan matches, with the fetch stubbed to throw if called.
2. **Same for `updateGameLogs`.**
3. **`csv: null` still fetches** — the default path is unchanged (the regression guard for §2.1).
4. **One family throwing does not prevent the other from running** (§3.3) — the load-bearing test.
   Assert both were attempted and the process result is a failure.
5. **`--all` ignores an injected csv** and still fetches per season (§1.5).

---

## 6. Cross-repo impact

**Three entries fire on `Triggers`: CR-07, CR-09, CR-18** — all three name the ingest scripts this
slice edits, on the data side.

**No served shape, field, floor or value changes.** Same aggregators, same validators, same emitted
files. This slice changes *when* and *how many times* the source CSV is fetched, nothing a consumer
can observe in the data.

### CR-07 · advstats

> Served-shape or sparsity-gate changes need the app loader updated in the same cycle. **Now breaks a visible surface, not just a silent loader** — Market's `RACR` column would go blank for every WR/TE with no error. Ratios are recomputed season-level and never aggregated weekly. Activation into projection is parked — see the advstats grading-findings doc.

**No change owed.** No served shape or sparsity gate moves.

### CR-09 · gamelogs

> Shape or floor changes land in both repos together. The per-game `week` and `team` keys are load-bearing beyond display: `resolvePlayerTeam`'s week-grain path matches on `g.week === week` and reads `g.team`, and returns `null` rather than throwing — renaming either key empties every week-grain team join **silently**. Per-game `team` is the **current-franchise** domain in all seasons and is era-remapped app-side (CR-16); do not "fix" it to era-accurate upstream without changing both repos. Per-game rate fields (`racr`/`targetShare`/`airYardsShare`/`wopr`/`pacr`/`passingCpoe`) are single-game values and must never be summed — `passingCpoe` specifically is now also attempt-weighted by a second consumer (`seasonEfficiency.js`'s `CPOE` column), not merely "never summed". `fantasyPoints`/`fantasyPointsPpr` are nflverse default scoring and are never reconciled with `src/utils/fantasyPoints.js` (see CR-14). View-only on both sides — must never feed projection/scoring/grading. 2019 was backfilled on 2026-07-03 (5,756 rows across 586 players) and is no longer a gap; the family is complete 2012–2025.

**No change owed.** No shape or floor moves.

### CR-18 · signal registry / data-catalog

> This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

**No `docs/signal-registry.md` row edit is owed.** CR-18 fires on *"adds, removes or reclassifies an
ingested field, stat key or source — or alters its historical coverage."* This slice does none of
those: same source, same fields, same coverage. It changes refresh cadence only, which the app's
signal registry does not record. **The `data-catalog.md` half of the instruction does apply** (§3.5).

---

## 7. Done-definition

- [ ] `csv` added to both entry points, **default-parameter form**; no existing test edited
- [ ] Injected `csv` flows through the **same 404/504-skip branch** as a fetched one
- [ ] `--all` unchanged: still fetches per season, still emits no step output and no purge
- [ ] **Both** `csv` and `currentSeason` injected; a merged run makes **one** `fetchCurrentNflSeason`
      and **one** `fetchPlayerStatsCsv` — verified by counting calls, not by reading the plan
- [ ] The orchestrator owns `setStepOutput('season', …)`; standalone paths still set their own
- [ ] **A throw in one family does not prevent the other from running, and the job still fails**
- [ ] **`git add` is path-scoped per family, never `nflverse/` wholesale** — a half-written family's
      file is never staged (§3.3)
- [ ] **No orphaned data file can be committed without its manifest entry** — the Invariant 3 case
      an unguarded `if: always()` would have created
- [ ] Merged workflow on **Saturday** `47 13 * * 6`; commit step `if: always()` **with path-scoped
      staging**; purge after push, covering `manifest.json` + only the committed families' files
- [ ] `nflverse-advstats.yml` and `nflverse-gamelogs.yml` deleted
- [ ] Slot-map comments updated in **all five** workflows (§3.4) — `nflverse-oline.yml` and
      `weekly-playerstate.yml` included; neither may still name a deleted workflow file
- [ ] `CLAUDE.md` workflow table: two rows → one; `data-catalog.md` refresh lines updated for both
      families (§3.5)
- [ ] Standalone `advstats --year 2023 --dry-run` (the smoke test's own command) still passes
- [ ] `npm test` green (baseline **588** + new); `npm run smoke` green
- [ ] **Merged workflow triggered manually once and observed to commit and purge**
- [ ] No served file changed; no CDN purge in this slice; no `schemaVersion` move
- [ ] `store-audit-2026-08-25.md` still modified-and-uncommitted, untouched

---

## 8. Settled decisions

- **Saturday, not Thursday** (§1.3) — the only non-regressive slot.
- **Injected `csv`, default-parameter form** (§2.1) — the repo's existing seam pattern, third use.
- **Standalone subcommands survive** (§1.6, §2.3) — the smoke test and every manual backfill use them.
- **`--all` stays out** (§1.5) — different mode, no purge, no step output.
- **Per-family error isolation is mandatory, not optional** (§3.3) — without it the merge increases
  the blast radius of a single failure, which would make this a net loss.
- **`if: always()` requires path-scoped staging** (§3.3) — the two go together. `if: always()` alone
  would commit a data file whose manifest entry never got written, which is worse than the failure
  it was added to prevent.
- **Inject `currentSeason` alongside `csv`** (§3.1) — both scripts fetch it unconditionally, so the
  CSV seam alone does not deliver the "one fetch" the slice is named for.
- **No CDN purge in this slice** (§4 step 8) — nothing served changes.

---

## 9. Invariant check

- **Invariant 3 (manifest is the index)** — unchanged, **but only because of §3.3's path-scoped
  staging.** The obvious `if: always()` design violates it by committing a written data file whose
  `updateManifestEntry` never ran. This is the invariant this slice came closest to breaking.
- **CDN purge rule** — the merged workflow purges manifest + both season files after push, exactly
  as the two workflows did separately.
- **Capture-only** — neither family is ephemeral; both are reconstructable from the upstream CSV.
  Nothing about this slice changes that.
- **Append-only** — no historical file is rewritten.

---

## 10. Out-of-scope observations (not edits)

1. **`fetchPlayerStatsCsv` now has three callers**, the third being
   `scripts/advstats-verify-season-type.mjs` from the C1/C3 slice. That script is a one-shot
   verification tool; if it is not going to be re-run, it is a candidate for deletion in whatever
   slice next touches `scripts/`.
2. **E3 (sparse checkout) compounds with this.** This slice removes one full 511 MB checkout per
   week; E3 would shrink the six that remain. They are independent but the win multiplies, and E3 is
   the next queue item.
3. **Seven weekly committers still race `main`** through the `git push || (git pull --rebase && git push)`
   retry. One fewer than before. That retry is load-bearing and appears verbatim in every workflow —
   S3 (reusable workflow) is where that duplication gets collapsed.
