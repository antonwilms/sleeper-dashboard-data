# CLAUDE.md slimming (data repo)

**Session 1 (opus, planning) — revision 2.** No source files edited by this session.
**Goal:** `CLAUDE.md` ≤ 25,000 bytes, enforced by a test under `npm test`, with no loss of
load-bearing information.

> **Revision 2 incorporates the plan-reviewer's flags.** Eleven were raised; all eleven are
> resolved here. The material ones: the r1 byte projection was wrong (r1 would have landed at
> **25,718 — 718 over**), several line anchors were off by one, `## Commands` was not actually
> lossless, and a CR-18 `Mirror` **is** owed. §9 records the disposition of each flag.
>
> **The r2 projection is not an estimate.** Every replacement text below was assembled against
> live `CLAUDE.md` and measured: **24,013 bytes, 987 under the ceiling** (§1).

---

## 0. Findings that change the shape of the task

### 0.1 The stated diagnosis is real but insufficient on its own

`CLAUDE.md` is **41,030 bytes** on disk (`wc -c`). The brief quotes 38,227 — that is the
**character** count (`wc -m`); the file is full of `—`, `→`, `≥`, `½`, `·`, and UTF-8 makes those
3 bytes each. The ceiling is a byte ceiling (`statSync().size`), so **41,030 is the number that
matters and 16,030 bytes must go.**

| Section | Bytes | In scope? |
|---|---:|---|
| (preamble) | 173 | — |
| `## Commands` | 8,086 | not named in the brief — **must be pruned anyway, see below** |
| `## Navigation map` | 17,239 | yes (item 1) |
| `## Invariants` | 6,258 | **protected** (item 3) |
| `## Cross-repo contract registry` | 1,084 | **protected** (item 3) |
| `## Sibling repo` | 531 | light trim only |
| `## Workflow convention` | 3,257 | **protected** (item 3) |
| `## Done-definition` | 556 | **protected** (item 3) |
| `## Session git workflow` | 2,385 | yes (item 2) |
| `## Self-maintenance` | 1,462 | yes (item 5) |
| **Total** | **41,030** | |

Item 3 fixes 11,155 bytes as untouchable. Doing **only** items 1 and 2 as scoped in the brief
sheds roughly 7,600 bytes and lands the file near **33,400** — missing the ceiling by ~8,400.

The brief's framing says the nav map is "mostly healthy one-line rows". That is true — 61 of the
77 rows average 145 bytes. But those 61 rows total **8,873 bytes** while the 16 fat rows total
only 8,312. **The healthy rows are, in aggregate, the larger half of the problem.** Pruning
paragraphs cannot reach 25,000; the row *count* has to come down too.

**Scope extensions, both consistent with item 1's rule and with CLAUDE.md's own closing line:**

- **`## Commands` (8,086 → 2,267).** Not protected by item 3. Largely duplicates `README.md` →
  `### Subcommands` (README:897–974). CLAUDE.md keeps the entry points, the flags, and the facts
  that live nowhere else.
- **Row consolidation, not just row shortening.** 35 data/workflow rows → 9; 9 boilerplate ingest
  rows → 1; 6 `bin/*` "thin CLI over X" rows → 1 (they became redundant the moment `## Commands`
  grew an entry-point table — see §4.3f).

If the human rejects the `## Commands` prune, **25,000 is not reachable without touching an
item-3-protected section.**

### 0.2 "README in scope for one correction only" vs. item 1's migration requirement

The Constraints scope README to **one correction**; item 1 requires detail to **move into**
README. Reconciled as: the one-correction limit governs corrections to existing drifted prose; it
does not forbid the additions item 1 mandates. This plan makes exactly one **correction** (the two
missing Actions rows, and nothing else in that table) and one **addition** (a new `### Module
notes` subsection receiving the migrated detail). No other existing README text is touched.

### 0.3 Two dangling doc citations (observation)

`CLAUDE.md:146`, `:154`, `:205` cite `in-season-season-totals.md §2.1–§2.4`; `README.md:1311`
(CR-21) cites `in-season-app-read.md`. **Neither file exists in this repo** — both are in the
sibling app repo at `sleeper-dashboard/.claude/tasks/`. Where §5.2 carries that detail into
README, it cites them **qualified**. `README.md:1311` is left alone (outside the permitted
correction, and registry content besides).

### 0.4 CI path filter will not run the new test on a CLAUDE.md-only PR (observation, no edit)

`.github/workflows/smoke-test.yml:4–11` triggers on `bin/`, `lib/`, `scripts/`, `package.json`,
`enrichment/`, `.github/workflows/`. It lists neither `CLAUDE.md` nor `test/`, so a PR that only
grows `CLAUDE.md` will not run the new gate. Adding both to that `paths:` list would close it —
a `.github/` change, not a `bin/`/`lib/` behaviour change. **Not planned**; raised for the human.

---

## 1. Projected byte count — measured, not estimated

Every replacement text in §4 was assembled against live `CLAUDE.md` and the result measured.

| Section | Now | After | Δ |
|---|---:|---:|---:|
| (preamble) | 173 | 173 | 0 |
| `## Commands` | 8,086 | 2,272 | −5,814 |
| `## Navigation map` | 17,239 | 7,066 | −10,173 |
| `## Invariants` | 6,258 | 6,257 | 0 *(byte-identical; Δ is the trailing-newline join)* |
| `## Cross-repo contract registry` | 1,084 | 1,083 | 0 *(byte-identical)* |
| `## Sibling repo` | 531 | 434 | −97 |
| `## Workflow convention` | 3,257 | 3,256 | 0 *(byte-identical)* |
| `## Done-definition` | 556 | 555 | 0 *(byte-identical)* |
| `## Session git workflow` | 2,385 | 1,089 | −1,296 |
| `## Self-maintenance` | 1,462 | 1,820 | +358 |
| **Total** | **41,030** | **24,013** | **−17,017** |

**Projected: 24,013 bytes — 987 under the ceiling.**

The four protected sections were diffed against the original after assembly and are
**byte-identical**; the −1 in the table is an artifact of how the sections were split for
measurement, not an edit.

After editing, confirm:

```bash
wc -c CLAUDE.md
```

If it exceeds 25,000, prune from the `## Navigation map` retained rows (§4.3e) — never from
`## Invariants`, `## Cross-repo contract registry`, `## Done-definition`, or `## Workflow
convention`, and never by raising the ceiling.

---

## 2. Files touched

| File | Action |
|---|---|
| `CLAUDE.md` | Rewrite `## Commands`, `## Navigation map`, `## Session git workflow`, `## Self-maintenance`; one-sentence trim to `## Sibling repo` |
| `git-workflow.md` | **New file** at repo root — receives the git recipe |
| `test/claudeMdSize.test.mjs` | **New file** — the size gate |
| `README.md` | Two new rows in the Actions table (correction); one new `### Module notes` subsection (migration sink) |

Not touched: `data-catalog.md`, `snapshot-workflow.md`, anything under `bin/`, `lib/`, `scripts/`,
`.github/`, `package.json` (`"test": "node --test"` at `package.json:20` already auto-discovers
`test/*.test.mjs` — verified against Node v24.2.0 in this working copy).

---

## 3. Step sequence

1. Create `git-workflow.md` (§4.1) — must exist before CLAUDE.md links to it.
2. Add `### Module notes` to `README.md` (§5.2) — same reason.
3. Correct the README Actions table (§5.1).
4. `CLAUDE.md` edits **bottom-up** so anchors stay valid: §4.6 → §4.5 → §4.4 → §4.3 → §4.2.
5. Add `test/claudeMdSize.test.mjs` (§6.1).
6. `wc -c CLAUDE.md` → expect ≈24,013, must be ≤ 25,000.
7. `npm test` → expect green (669 passing today, plus the 2 new cases).
8. `npm run smoke` → green (Done-definition step 1).
9. Link check (§6.3).

---

## 4. Edits to `CLAUDE.md`

**Line anchors below are corrected against the live file** (r1 had three off-by-one errors).
Verified boundaries:

| Section | Heading | Content lines | Following `---` |
|---|---:|---:|---:|
| `## Commands` | 7 | 7–134 | **136** |
| `## Navigation map` | 138 | 138–218 | **220** |
| `## Sibling repo` | 262 | 262–267 | **268** |
| `## Session git workflow` | 319 | 319–331 | **333** |
| `## Self-maintenance` | 335 | 335–339 | *(EOF)* |

**Replace only the content lines. Do not delete the `---` rules or the blank lines around them.**

### 4.1 New file `git-workflow.md` (repo root)

**Why a new file, not `snapshot-workflow.md`.** `snapshot-workflow.md` (2,321 B) is a
single-purpose human runbook for one round trip — browser capture → **Export** click →
`npm run import:snapshot`. Its audience is a person with the app open, its numbered steps are that
one flow, and `bin/import-snapshot.mjs` already commits and pushes on its own. The session git
sequence applies to **every** session, including the majority that never touch `snapshots/`.
Appending it there would bury a universal rule inside a narrow runbook. **Use `git-workflow.md`.**

Create with exactly this content:

~~~markdown
# Session git workflow

Every session that modifies tracked files ends by committing and pushing its own work — no
uncommitted work is left between sessions. Uncommitted local work colliding with a scheduled
Action's push to `main` (the Invariant 8 workflows) is the known failure mode this sequence
exists to prevent. Read-only sessions — planning that produces no tracked change — do nothing
here.

The rules themselves are in [CLAUDE.md → Session git workflow](CLAUDE.md#session-git-workflow).
This file is the procedure.

## End-of-session sequence

1. **Commit.** Stage this session's changes with a descriptive message — planning:
   `plan: <feature>`; implementation: `feat: <feature>` / `fix: <feature>`.

2. **Rebase before pushing.**

   ```sh
   git pull --rebase origin main
   ```

   The weekly and scheduled Actions push to `main` on cron and will reject a stale push.

3. **Resolve conflicts.** They are almost always machine-generated bookkeeping files.

   - **`manifest.json` — resolve as a union.** Keep every entry from both sides. Never resolve
     by preferring one side wholesale: that silently drops the other side's entries, a real
     data-visibility loss even though the file still parses. After resolving, verify both:

     ```sh
     python3 -m json.tool manifest.json > /dev/null && echo "parses"
     ```

     and that the entries this session wrote are still present — grep their **full-path keys
     with extension** (e.g. `nflverse/advstats/2019.json`), not a bare fragment.

   - **A session whose purpose is *removing* entries resolves as union-of-additions minus its
     own deletions.** The plain union rule is written for concurrent additions and will
     silently resurrect a deletion that lands in the same rebase window. Verify by grepping
     that the removed keys are **absent** — not by eye.

   - **Watermark files** (`nflverse/last-checked-*.json` and similar): keep the later
     timestamp.

   - **Anything that is not a clean union** — the same entry edited incompatibly on both sides
     — stop and report for a human decision. Do not guess.

4. **Push.**

   ```sh
   git push origin main
   ```

   Plain push, **never `--force`**. If it is still rejected, an Action pushed during the
   rebase: `git pull --rebase origin main` again and retry. Never force.

5. **Purge the CDN** if this session wrote served data files (anything under `nflverse/`,
   `ktc/`, `nfl/`, `college/`, `snapshots/`, plus `manifest.json`). Purge exactly the changed
   files, **`manifest.json` first**, then the data files, so the app sees fresh data instead of
   stale cache. Method: [README → How the data is consumed](README.md#how-the-data-is-consumed).
~~~

### 4.2 `## Commands` — replace CLAUDE.md:7–134

Six `###` subsections collapse into an entry-point table plus the facts that live nowhere else.
Replacement (**2,267 bytes** as written; 2,272 in situ once the trailing blank line before the `---` is counted):

~~~markdown
## Commands

**Requires Node ≥ 20** (native fetch). `npm install`; `cp .env.example .env` and set `CFBD_API_KEY` — needed only by the `cfbd` subcommand, everything else runs unauthenticated.

| CLI | Entry | Subcommands / modes |
|---|---|---|
| Update | `bin/update.mjs` | `nfl`, `cfbd`, `ktc`, `snapshots`, `roster`, `draft`, `playerids`, `advstats`, `schedule`, `gamelogs`, `playerstats`, `teamcontext`, `playerstate`, `oline` |
| Enrichment | `bin/enrich.mjs` | `coaching`/`scheme`/`injuries`/`notes` `add`, `validate`, `list`, `remove` |
| Grading | `bin/grade.mjs` | `<snapshotDate>`, `--self-test` |
| Backtest | `bin/backtest.mjs` | offline analysis over advstats + season-totals |
| Panel | `bin/panel.mjs` | E-0a baseline, `--flip-gate` (R2), `--fit` (R3-FIT) |
| Dead-man | `bin/deadman.mjs` | monitoring only; needs `GITHUB_REPOSITORY` + `GITHUB_TOKEN` |

Every update subcommand is `node bin/update.mjs <subcommand> [--year YYYY]`. Flags: `--dry-run` (fetch + validate, no writes); `--force` (overwrite a completed-season file — nfl/cfbd/roster/advstats/schedule/gamelogs/playerstats/teamcontext/oline); `--all` (backfill; schedule/gamelogs/teamcontext/oline only). Per-subcommand semantics, the analysis CLIs' full flag lists, and coverage floors: README → [Update scripts](README.md#update-scripts) and [Module notes](README.md#module-notes).

```sh
npm run smoke               # all dry-runs + validate:enrichment + grade --self-test
npm test                    # node --test — unit validators under test/
```

Other shortcuts: `update:nfl`, `update:cfbd`, `update:ktc`, `import:snapshot`, `enrich`, `grade`, `backtest`, `panel`, `panel:flip`, `panel:fit`, `validate:enrichment`.

`bin/backtest.mjs` and `bin/panel.mjs` are **offline analysis, read-only, not wired into smoke, and not the snapshot grader** (`bin/grade.mjs`). `--fit` pins `--basis half_ppr` and `--attribution per-season-team` (the app's live default, load-bearing for the reconstruction) and rejects an explicit `--attribution`.

**Poisoned-snapshot window (2026-07-16 → 2026-07-18):** app snapshots in this window carry ~½-scale `teamRzShare` and `shareVolatility`. Exclude or correct them in the 2026 grading run — README → [Module notes](README.md#module-notes).
~~~

**Losslessness — the r1 gaps, now closed.** The reviewer found three facts that r1 deleted with
nowhere to land. All three are handled:

- `--force`'s **family list** now appears inline above (README:965 omits `playerstats`).
- `node bin/update.mjs playerstats` and `… snapshots` have no invocation line in README. The
  generic form `node bin/update.mjs <subcommand> [--year YYYY]` above covers both, and both
  subcommands are named in the table.
- The **panel/backtest flag lists** (`--ridge X`, `--scoring-from YYYY-MM-DD`,
  `--attribution current-team|per-season-team`, `--from/--to`, `--min-games`, `--controls`,
  `--by-season`, `--alpha`, `--json`, `--write`, `--validate`) appear **nowhere** in README's
  159,973 bytes. They move to README `### Module notes` (§5.2), which is why that subsection is a
  precondition for this edit and not optional.

The **full** poisoned-window explanation (the app-side 2026-07-18 share-denominator fix, and the
separate 2026-08-08 `buildTeamTotalsForSeason` entity-filter fix) also moves to `### Module
notes`; the date range and the grading-run action stay here, because they are the gate.

**Dropped as genuinely duplicated by README:897–974** — the 27 literal invocation lines, the
enrich/grade usage blocks, and the `npm run smoke` expansion (verbatim in `package.json:16`).

### 4.3 `## Navigation map` — replace CLAUDE.md:138–218

77 rows → 36 rows plus an intro. Total **7,066 bytes** (from 17,239).

**4.3a — intro** (replaces the bare heading + table header):

~~~markdown
## Navigation map

One row per module, one row per *group* of served data. Deep per-file behaviour is in README →
[Module notes](README.md#module-notes) and [File schemas](README.md#file-schemas); per-family
path/source/grain/join/coverage/gate is [data-catalog.md](data-catalog.md).

| Path | Purpose |
|---|---|
~~~

**4.3b — the 13 overgrown module rows → 12.** Replace in place with exactly:

~~~markdown
| `lib/args.mjs` | `bin/update.mjs` arg validation — `parseAndValidateArgs(argv, opts)`; `MIN_CLI_YEAR = 1999` is a typo bound, deliberately **not** a coverage floor and not imported from `lib/nflverse.mjs` (CR-18); `ALL_SUBCOMMANDS` = schedule/gamelogs/teamcontext/oline |
| `lib/validate.mjs` | Schema validators + `findNonFinite`; holds `NFL_SENTINELS`, `KTC_TOP_QB_SENTINELS` (Invariant 7). `validateNflSeason`'s full-season floor is **self-calibrating**: `fullSeasonThreshold = Math.max(1, maxGames - 3)`, ≥30 players at or above it |
| `lib/cfbd.mjs` | CFBD fetch helpers; `pivotCfbdRows` — long-form→pivoted-envelope transform shared by `scripts/update-cfbd.mjs` and `scripts/migrate-college-pivot.mjs`; emits `players` in ascending-numeric-`playerId` order (deterministic bytes) |
| `lib/io.mjs` | `readJson`, `writeJsonStable`, `setStepOutput`, `repoPath`; `stableHash` + `sortObjectKeys` (shallow) / `deepSortKeys` (recursive, for the CFBD pivot) |
| `lib/nflverse.mjs` | nflverse fetch + CSV-parse helpers. **Coverage floors** (CR-18 trigger sites): `MIN_ROSTER_IDS`, `MIN_DRAFT_YEAR`, `MIN_PLAYERID_ROWS`, `MIN_ADVSTATS_ROWS`, `MIN_SCHEDULE_SEASON`, `MIN_SCHEDULE_GAMES`, `MIN_PLAYERGAME_ROWS`, `MIN_GAMELOG_SEASON`, `MIN_TEAMCONTEXT_ROWS`, `MIN_TEAMCONTEXT_SEASON`, `MIN_OLINE_ROWS`, `MIN_OLINE_SEASON`. `AY_PER_TARGET_MIN`/`MAX` is a plausibility **band**, not a floor |
| `lib/panel.mjs` | Pure panel/fit logic — feature builders, forward-chain CV, ridge, spearman; no I/O. `buildTeamTotalsForSeason` excludes `TEAM_<abbr>` pseudo-rows (mirror of app `isTeamAggregateId`; unfiltered they doubled every team denominator) |
| `scripts/update-nfl.mjs` | NFL season-totals ingest. `--year` optional — omitted resolves via `fetchCurrentNflSeason()` + `setStepOutput('season', …)`. Exported guards `hasNoData(weekData)` and `shouldSkipCompletedSeason({inProgress, force, dryRun})`; `DEFAULT_DEPS` is the injectable I/O+fetch seam |
| `scripts/update-cfbd.mjs` | CFBD ingest — fetch long-form, pivot via `pivotCfbdRows`, validate + write the pivoted envelope; dedup hashes the pivoted form both sides (`cfbdHash` with `deepSortKeys`) |
| `scripts/update-playerstats.mjs` | Single-fetch orchestrator — one `stats_player_week_<year>.csv` fetch drives `updateAdvStats` + `updateGameLogs`; per-family throw isolation; emits `advstats_ok`/`gamelogs_ok` step outputs |
| `scripts/panel-run.mjs` | Panel orchestration adapter (injectable loaders); attribution-mode seam; `runFlipGate`, `runFit`, `buildFitVerdictReport`, `assemblePanel({withFactorMultipliers, historyFloor})` |
| `scripts/check-crons.mjs` | Dead-man detector — `extractCrons`, `listScheduledWorkflows`, `cronCadence`, `evaluateWorkflow`, `runDeadman`; monitoring only, no data-file I/O |
| `scripts/migrate-*.mjs` | One-shot historical rewrites, script-produced (Invariant 1 exceptions, `--dry-run` capable): `migrate-f24-prune.mjs` (F-24 prune → schemaVersion 4), `migrate-college-pivot.mjs` (E2 Phase B pivot → schemaVersion 2) |
~~~

The last row replaces **two** rows (`migrate-f24-prune.mjs` at :155, `migrate-college-pivot.mjs`
at :156). The `verify-college-pivot-roundtrip.mjs` note moves to README `### Module notes`; its
committed output at `verification/college-pivot-phase-b-roundtrip-proof.txt` is already covered by
Invariant 1's E2 Phase B exception (protected, unchanged).

**4.3c — collapse the 13 `.github/workflows/*` rows into 1.** They are at **`CLAUDE.md:203–210`
and `:213–217`** — *not* a single contiguous block: `raw/` (:211) and `manifest.json` (:212) sit
between them and belong to 4.3d. Delete all 13, insert:

~~~markdown
| `.github/workflows/` | Eight uniform weekly ingest jobs delegate to the reusable `_ingest.yml` (`workflow_call`) template. **Standalone, deliberately not callers:** `nflverse-playerstats.yml` (per-family conditional staging — an Invariant 3 safeguard), `weekly-ktc.yml` (its quarantine-alarm step cannot exist alongside `uses:`), plus `cron-deadman.yml` and `smoke-test.yml`. Triggers and per-job detail: README → [GitHub Actions](README.md#github-actions). Purge URLs: Invariant 8 |
~~~

Lossless because §5.1 completes README's Actions table, and the sparse-checkout rationale stays in
`_ingest.yml`'s own file — the not-a-caller reasoning at **`.github/workflows/_ingest.yml:1–11`**
and the "derived from a live read audit of `scripts/update-*.mjs`, NOT a family-directory guess"
text at **`.github/workflows/_ingest.yml:23–27`**, inside the `sparse-paths` input description.

**4.3d — collapse 22 data-directory rows into 8.** Delete rows prefixed `| \`nfl/`, `| \`college/`,
`| \`ktc/`, `| \`enrichment/`, `| \`snapshots/`, `| \`grading/`, `| \`nflverse/`, `| \`raw/`,
`| \`backtests/`, `| \`manifest.json`, `| \`data-catalog.md`. Insert:

~~~markdown
| `nfl/`, `college/`, `ktc/`, `nflverse/`, `snapshots/` | Served data families — a section each in [data-catalog.md](data-catalog.md), schemas in README → [File schemas](README.md#file-schemas) |
| `ktc/quarantine/` | Scrapes rejected by the Spearman ordering guard — script-produced, **not** manifest-registered, **not** app-read; review and promote manually |
| `nflverse/playerids.json` | gsis_id→sleeper_id crosswalk — **internal-only**: read server-side by `update-advstats.mjs`/`update-gamelogs.mjs`, never by the app |
| `enrichment/` | The only hand-authored tree: coaching / scheme / injuries / notes, edited **only** via `bin/enrich.mjs` (Invariant 2) |
| `backtests/`, `grading/` | Analysis output from `--write`. The `<date>-*-verdict.md` reports are deliberately **unregistered** — a documented Invariant 3 exception |
| `manifest.json` | Index of every script-written file (Invariant 3) |
| `data-catalog.md` | Living dataset index — every ingest slice updates its family's row (Done-definition) |
| `raw/` | Unprocessed Sleeper API responses |
~~~

The three retained singletons carry gates `data-catalog.md` does not state in those words. The
nflverse `inProgress: false` deviation is **already** in Invariant 5 (protected, unchanged) — that
is what lets the per-family rows go.

**4.3e — collapse 9 boilerplate ingest rows into 1:**

~~~markdown
| `scripts/update-{roster,draft,playerids,advstats,schedule,gamelogs,teamcontext,playerstate,oline}.mjs` | Uniform family ingests — fetch, parse, dedup, write. `teamcontext`/`oline`/`playerstate` are TEAM- or date-keyed and read no crosswalk; the rest re-key to `sleeper_id` |
~~~

Keep as their own rows: `scripts/update-ktc.mjs` (exports `spearmanRho` / `ktcOrderingGuard` /
`KTC_ORDERING_THRESHOLD` — the ordering gate), `scripts/update-enrichment.mjs`,
`scripts/register-snapshots.mjs`, plus the four covered by 4.3b.

**4.3f — collapse 6 `bin/*` rows into 1 (new in r2).** `bin/update.mjs`, `bin/enrich.mjs`,
`bin/grade.mjs`, `bin/backtest.mjs`, `bin/panel.mjs`, `bin/deadman.mjs` are all "thin CLI over
`scripts/…`" and total 937 bytes. `## Commands` now carries an entry-point table naming every one
of them with its modes, so these rows are pure duplication. Replace all six with:

~~~markdown
| `bin/*.mjs` | Thin CLIs — parse flags and dispatch to a `scripts/` adapter; no logic of their own. Entry points and modes: [Commands](#commands). `bin/import-snapshot.mjs` is the exception below |
| `bin/import-snapshot.mjs` | One-command projection-snapshot import (newest ~/Downloads export ZIP → manifest → commit + push); see [snapshot-workflow.md](snapshot-workflow.md) |
~~~

Also tighten two retained rows (they were the longest survivors):

~~~markdown
| `lib/backtest.mjs` | Pure backtest stats (standardized OLS, quintiles, team totals); no I/O. `solveOLS` accepts `{ ridgeLambda }`; exports `rankTransform`/`spearman` and `isTeamAggregateId` (the `TEAM_*` pseudo-row filter) |
| `lib/projectionFactors.mjs` | Pure app-factor-multiplier reconstruction for the R3-FIT fit — mirrors the app's leaf factor transforms and their input pipelines. **Cross-repo mirror contract (CR-15)** |
~~~

**4.3g — retained verbatim (13 rows, 1,394 B):** `lib/fantasyPoints.mjs`, `lib/enrichment.mjs`,
`lib/ktc.mjs`, `lib/manifest.mjs`, `lib/sleeper.mjs`, `lib/grade.mjs`, `scripts/update-ktc.mjs`,
`scripts/register-snapshots.mjs`, `scripts/update-enrichment.mjs`, `scripts/grade-snapshot.mjs`,
`scripts/backtest-run.mjs`, plus the two tightened in 4.3f. **This is the fallback prune pool if
`wc -c` comes in over** — but note it is only 1,394 bytes against a 987-byte margin, so a large
overrun means re-checking the §4 texts were transcribed exactly, not shaving index rows.

### 4.4 `## Session git workflow` — replace CLAUDE.md:319–331

Replacement (**1,084 bytes** as written; 1,089 in situ). Retains every rule item 2 names:

~~~markdown
## Session git workflow

Every session that modifies tracked files commits and pushes its own work — nothing uncommitted is left between sessions. Uncommitted local work colliding with a scheduled Action's push to main (Invariant 8's workflows) is the failure mode this exists to prevent. Read-only sessions (planning that produces no tracked change) do nothing here.

- `git pull --rebase origin main` **before** any push — the scheduled Actions push to main on cron and will reject a stale push.
- `manifest.json` conflicts resolve as a **union** — every entry from both sides, never one side wholesale.
- A session whose purpose is *removing* entries resolves as **union minus its own deletions**; the plain union rule would resurrect a deletion landing in the same rebase window.
- A conflict that is not a clean union: stop and report for a human decision, do not guess.
- Plain `git push origin main` — **never `--force`**, including after a rejected push.

Full sequence, conflict verification commands, and the post-push CDN purge: [git-workflow.md](git-workflow.md).
~~~

### 4.5 `## Sibling repo` — replace CLAUDE.md:264 only

One sentence; the rest of the section is untouched.

**Before (`CLAUDE.md:264`):**

> `sleeper-dashboard` is the React app that consumes this repo's files and produces the snapshots imported here. Its README documents the projection pipeline and data-store consumption. See [Cross-repo contract registry](#cross-repo-contract-registry-with-sleeper-dashboard) above.

**After:**

> `sleeper-dashboard` is the React app that consumes this repo's files and produces the snapshots imported here; its README documents the projection pipeline and data-store consumption.

**Leave `CLAUDE.md:266` (the `docs/signal-registry.md` paragraph) unchanged** — CR-18's data side
names it explicitly (README:1257, 1260).

### 4.6 `## Self-maintenance` — replace CLAUDE.md:335–339

Result (**1,820 bytes**). `CLAUDE.md:337` — the whole "Keep this file current…" paragraph — is
**preserved verbatim**; only the opener is added and the old closing line removed.

~~~markdown
## Self-maintenance

**This file has a hard ceiling of 25,000 bytes, enforced by `test/claudeMdSize.test.mjs`.**
It is a navigation-and-rules layer, not a second README. A change that would breach the ceiling
**prunes in the same commit** — it does not raise the ceiling. Per-file detail belongs in README →
[Module notes](README.md#module-notes); per-family coverage in [data-catalog.md](data-catalog.md).
Nothing here records history — rows state what is true now, and `git log` holds the rest.

<<< CLAUDE.md:337 VERBATIM — "Keep this file current as part of every task's done-definition. …" >>>
~~~

**Delete** the old final line (`CLAUDE.md:339`, "Keep this file thin — a navigation-and-rules
layer, not a second README; push deep detail into README.md and link to it.") — the new opener
says it better.

**Do not paraphrase `CLAUDE.md:337`.** It contains the `docs/signal-registry.md` trigger and the
`## Cross-repo impact` / `CR-NN` mirror rule, both CR-18 data-side sites.

---

## 5. Docs updates

Two changes to `README.md`, and no others. `data-catalog.md` is **not** edited (Constraints; it is
current and reconciled by `test/manifest.test.mjs`).

### 5.1 `README.md` — the one correction: two missing Actions rows

**Anchors corrected in r2 (r1's were one line low).** The table is **`README.md:993–1005`** under
`### GitHub Actions` (README:991). The `weekly-nflverse-roster.yml` row is at **`:996`**;
`smoke-test.yml` is the last row at **`:1005`**. **Change nothing else in this table.**

**Insert after `:996`** (both Tuesday jobs; season-totals is staggered behind roster):

~~~markdown
| `nfl-season-totals.yml` | Tuesday 15:05 UTC + `workflow_dispatch` | Runs `node bin/update.mjs nfl` (no `--year` — the live season is resolved inside the script via `fetchCurrentNflSeason()`), commits if content hash changed, purges jsDelivr CDN cache; delegates to `_ingest.yml`. Staggered behind the 13:23 roster job so the two Tuesday committers don't race the push to main; its sparse-checkout cone includes `nflverse/schedule` for D-1's in-season bye inference |
~~~

**Append after `:1005`** as the last row:

~~~markdown
| `_ingest.yml` | `workflow_call` (reusable — no schedule of its own) | Shared body for the eight uniform weekly ingest jobs: sparse checkout (per-caller cone input), `npm ci`, `node bin/update.mjs <subcommand>`, commit + CDN purge. Callers: `weekly-nflverse-roster.yml`, `nfl-season-totals.yml`, `nflverse-draft.yml`, `nflverse-playerids.yml`, `nflverse-schedule.yml`, `nflverse-teamcontext.yml`, `nflverse-oline.yml`, `weekly-playerstate.yml`. Not used by `nflverse-playerstats.yml` or `weekly-ktc.yml` — see the file's own header for why |
~~~

Cron verified at `.github/workflows/nfl-season-totals.yml:12` (`cron: "05 15 * * 2"`); caller list
at `.github/workflows/_ingest.yml:1–11`.

### 5.2 `README.md` — the one addition: new `### Module notes` subsection

**Location:** insert immediately after the `### Subcommands` fenced block closes
(**`README.md:973`**) and before `### Environment variables` (**`README.md:975`**). This puts it
under `## Update scripts` — the matching section — and creates the `README.md#module-notes` anchor
that §4.2, §4.3 and §4.6 link to by name. **This subsection is a precondition for §4.2**, not a
nicety: it is the only home for the panel/backtest flag lists.

~~~markdown
### Module notes

Per-file behaviour that a session needs only when editing that file. The one-line index is
[CLAUDE.md → Navigation map](CLAUDE.md#navigation-map).

#### Analysis CLI flags

Neither analysis CLI is wired into `npm run smoke`, and neither is the snapshot grader.

`bin/backtest.mjs` — `--metric target_share|air_yards_share|wopr|racr|all` (camelCase also
accepted), `--position P`, `--from YYYY`, `--to YYYY`, `--min-games N`, `--controls`,
`--by-season`, `--json`, `--write`, `--validate`.

`bin/panel.mjs` — `--from/--to YYYY`, `--attribution current-team|per-season-team`,
`--basis in-basis|half_ppr`, `--scoring-from YYYY-MM-DD`, `--min-games N`, `--ridge X`,
`--flip-gate`, `--fit`, `--alpha X`, `--json`, `--write`. `--fit` defaults `--basis` to
`half_ppr` (the app's own basis for store-served `careerStats`) while every other mode keeps
`in-basis`, and it **rejects an explicit `--attribution`** because it pins `per-season-team` —
the app's live default, load-bearing for the reconstruction.

Writes land in `backtests/` (`<date>-<metric>-<pos>.json`, `<date>-e0a-{panel,fit}.json`,
`<date>-r2flip-*`, `<date>-r3fit-*`) and `grading/` (`<date>-*-verdict.md`). Methodology:
[Analysis / Backtesting](#analysis--backtesting).

#### The poisoned-snapshot window (2026-07-16 → 2026-07-18)

App snapshots written in this window carry ~½-scale `teamRzShare` and `shareVolatility`, captured
before the share-denominator fix (app, 2026-07-18) corrected the doubled `TEAM_*` denominator.
Those fields are unreliable at absolute scale in that window; exclude or correct them in the 2026
grading run.

The same doubled-denominator root cause was present in `lib/panel.mjs`'s
`buildTeamTotalsForSeason` and was corrected separately on 2026-08-08 (entity filter). The
retrospective E-0a/flip panels reconstruct from season-totals rather than snapshots, so that fix
corrects the panel builder — **not** the snapshot window, which remains a forward-grading
exclusion.

#### `lib/validate.mjs` — self-calibrating full-season floor

`validateNflSeason`'s full-season floor is not a fixed constant. It computes
`fullSeasonThreshold = Math.max(1, maxGames - 3)`, where `maxGames` is the season file's own
observed maximum `gamesPlayed`, and requires at least 30 players at or above it
(`lib/validate.mjs:123–127`). A complete season (`maxGames = 17`) yields a threshold of 14 —
numerically identical to the old fixed floor — while a partial in-season file yields a lower
threshold instead of throwing on every run before week 14. Rationale:
`sleeper-dashboard/.claude/tasks/in-season-season-totals.md` §2.1 (sibling repo).

#### `scripts/update-nfl.mjs` — the two scheduled-path guards

Both are pure and exported for direct unit testing.

- `hasNoData(weekData)` — Sleeper serves 0 entries across all 18 weeks before a season starts.
  The guard exits cleanly rather than letting the <400-player floor throw (§2.2).
- `shouldSkipCompletedSeason({ inProgress, force, dryRun })` — a completed season on the
  scheduled path **skips** rather than risking the write path. The older refusal guard tested the
  manifest's stale `existingEntry.inProgress` and could still write a sealing regression on the
  first run after `state.season` rolls over; see the fix's own header comment in the file.
  `--force` still overrides for a deliberate interactive correction, and `--dry-run` stays exempt
  so a completed season can be previewed without `--force` (§2.3).

`--year` is optional: when omitted the live season resolves via `fetchCurrentNflSeason()` and is
surfaced with `setStepOutput('season', …)` for the workflow's Invariant 8 purge URL — matching
`update-teamcontext.mjs` and `update-schedule.mjs` (§2.4). `DEFAULT_DEPS` is an injectable
I/O + fetch surface mirroring `scripts/panel-run.mjs`'s `DEFAULT_LOAD` pattern, so
`updateNfl({ …, deps })` can be control-flow-tested without touching the network or the real repo
file tree. Section references are to
`sleeper-dashboard/.claude/tasks/in-season-season-totals.md` (sibling repo).

#### `lib/nflverse.mjs` — floors vs. bands

The `MIN_*` constants are **coverage floors** and encode historical coverage — they are CR-18
trigger sites, so changing one is a signal-registry event. `AY_PER_TARGET_MIN` / `MAX` are
different: an air-yards-per-target plausibility **band** shared by `validateAdvStats` and
`validateGameLogs`, not a coverage floor. `lib/args.mjs`'s `MIN_CLI_YEAR = 1999` is a third thing
again — a CLI typo-sanity bound, deliberately not imported from here.

#### `scripts/migrate-*.mjs` — one-shot rewrites

- `migrate-f24-prune.mjs` — drops `idp_*`/`punt*` from every completed season file, minifies,
  bumps the manifest to `schemaVersion` 4. Invariant 1 exception; rationale in commit `2b06c5b`.
- `migrate-college-pivot.mjs` — rewrites all 27 `college/{passing,receiving,rushing}/<year>.json`
  files from a long-form row array to the pivoted player-keyed envelope via `lib/cfbd.mjs`
  `pivotCfbdRows`, bumping `schemaVersion` to 2 and setting `recordCount` to the player count.
  Idempotent (skips an already-pivoted file); a pure local transform with no network.
  `scripts/verify-college-pivot-roundtrip.mjs` is the one-shot proof script — deliberately not a
  committed test, because its **output** is committed instead, at
  `verification/college-pivot-phase-b-roundtrip-proof.txt`. Full accounting: Invariant 1's E2
  Phase B exception in [CLAUDE.md](CLAUDE.md#invariants) and the CFBD row in
  [data-catalog.md](data-catalog.md).

#### `scripts/update-playerstats.mjs` — single-fetch orchestration

Fetches `stats_player_week_<year>.csv` once and drives both `updateAdvStats` and `updateGameLogs`
off the shared csv/`currentSeason` (each script's §3.1 injection seam), isolating a per-family
throw so neither blocks the other, and surfacing `advstats_ok` / `gamelogs_ok` step outputs for
the workflow's path-scoped commit. See `.claude/tasks/playerstats-single-fetch.md` §3.3.
~~~

### 5.3 Sections needing no edit

`data-catalog.md` (Constraints); `snapshot-workflow.md` (§4.1 explains why); 
`schedule-ingest-guide.md`; `package.json`; every `.github/workflows/*.yml` (§0.4 flags the one
gap, deliberately not acted on).

---

## 6. Tests to add

### 6.1 New — `test/claudeMdSize.test.mjs`

Mirrors `sleeper-dashboard/src/__tests__/claudeMdSize.test.js` in shape and failure message,
translated from `vitest` to `node:test` + `node:assert/strict` (this repo's convention — every
file under `test/` uses it, e.g. `test/io.test.mjs:1–2`). Path resolution follows
`test/registry.test.mjs:31–33` (`fileURLToPath` → `repoRoot`) rather than the app's bare relative
`'CLAUDE.md'`, so it is correct regardless of the cwd `node --test` runs from.

```javascript
/**
 * test/claudeMdSize.test.mjs — CLAUDE.md auto-loads into every session in this repo, so its
 * size is a per-session tax. This is the gate that keeps it from creeping back.
 *
 * statSync().size is exact bytes on disk. readFileSync(...).length would be UTF-16 code units
 * and undercounts every non-ASCII character — and this file is full of —, →, ≥, ·, ½.
 * The two differ by ~2,800 here, which is more than the whole margin.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const claudeMdPath = path.join(__dirname, '..', 'CLAUDE.md');

const CEILING = 25000;

test('CLAUDE.md: exists at the repo root', () => {
  assert.ok(fs.existsSync(claudeMdPath), 'CLAUDE.md is missing from the repo root');
});

test('CLAUDE.md: is at or under the 25,000-byte ceiling', () => {
  const size = fs.statSync(claudeMdPath).size;
  assert.ok(
    size <= CEILING,
    `CLAUDE.md is ${size} bytes; the ceiling is ${CEILING} (over by ${size - CEILING}).\n` +
      'CLAUDE.md is auto-loaded into every session in this repo, so its size is a\n' +
      'per-session tax. Do not raise this ceiling.\n' +
      'Per-file detail belongs in README.md → Module notes. Per-family coverage belongs\n' +
      "in data-catalog.md. A trap specific to one script belongs in that script's own\n" +
      'header comment. Prune in this same commit.'
  );
});
```

**Inputs:** the on-disk `CLAUDE.md`. No fixtures, no network, no env.
**Expected:** both pass at the projected 24,013 bytes.

**Deliberate deviation from the app's test.** The app's third case caps its `## Traps` section at
3,000 bytes. This repo's CLAUDE.md **has no `## Traps` section**, so that assertion would
early-return and never assert anything; it is omitted rather than carried as a permanent no-op. A
sub-cap on `## Navigation map` (the equivalent sink here) is **not** planned — it is 36 rows of
genuine index, and a byte cap would fight the file's purpose rather than its bloat. Raised for the
human to overrule.

**Edge cases:**
- File missing or renamed → first test fails cleanly instead of the second throwing `ENOENT`.
- Multibyte growth → caught, because `statSync().size` is bytes, not code units. This is exactly
  the failure mode that made the brief's 38,227 understate the problem by 2,803 bytes.
- Someone raises `CEILING` to green a red test → not mechanically preventable; the failure
  message says "Do not raise this ceiling", and §4.6 puts the same rule in `## Self-maintenance`.

### 6.2 Existing tests — re-run, expected green

`npm test` is green today: **669 pass / 0 fail.** It stays green under this change.

- `test/manifest.test.mjs` — reconciles `data-catalog.md`. No data file or manifest entry is
  touched, so it must stay green untouched. This is why `data-catalog.md` is out of scope.
- `test/registry.test.mjs` — **correction to r1.** r1 called this "the mechanical check" on the
  CR-18 claim and "the test most at risk". It is neither: it reads `README.md` only, and of the
  200 data-side symbol/file claims it resolves, **zero name `CLAUDE.md`**. It is unaffected by
  this change. **No test in this repo reads `CLAUDE.md` today** — which is precisely the gap
  `test/claudeMdSize.test.mjs` starts to close, though even that one checks size, not content.
  The CR-18 trigger-site edits in §4.5/§4.6 therefore have **no automated guard**; they are
  protected only by the instruction to preserve `CLAUDE.md:337` and `:266` verbatim.
- `npm run smoke` — Done-definition step 1. Unaffected, but required before reporting done.

### 6.3 Manual verification (no new test)

**Corrected in r2** — r1's regex excluded `#`, so every anchor-only link reduced to an empty path
and printed a spurious `BROKEN:`. This version skips pure-anchor links and checks only file paths:

```bash
grep -o ']([^)#][^)]*)' CLAUDE.md | sed 's/^](//; s/)$//; s/#.*$//' | sort -u | while read -r f; do [ -e "$f" ] || echo "BROKEN: $f"; done
```

Expect zero output. `git-workflow.md` must exist (§4.1) before this runs.

Anchor targets are not covered by that command — verify **`README.md#module-notes`** by hand,
since §5.2 creates it. The other five (`#update-scripts`, `#analysis--backtesting`,
`#github-actions`, `#file-schemas`, `#how-the-data-is-consumed`) already exist, as do the
in-file anchors `#commands`, `#navigation-map`, `#invariants`, `#session-git-workflow`.

**No new `npm run smoke` or `validate:enrichment` coverage is added.** This change touches
documentation and one test file; it adds no ingest, validator, data shape, or CLI surface, so
there is nothing for the smoke path or the enrichment validator to exercise.

---

## 7. Cross-repo impact

**CR-18 · Signal registry rows (`docs/signal-registry.md`) — mirror owed.**

r1 asserted "None" on the reasoning that the named sentences survive verbatim. That was wrong.
CR-18's data-side `Triggers` name *"the signal-registry and Sibling-repo pointers in `CLAUDE.md`"*
(README:1256–1262), and the registry Rule keys on **touching a listed trigger site**, not on
whether the wording survived. §4.5 rewrites `## Sibling repo` and §4.6 rewrites
`## Self-maintenance`. The `Mirror` text is therefore emitted verbatim, as the Rule requires:

> **CR-18 · Signal registry rows (`docs/signal-registry.md`)** — This entry's data side is the one
> genuinely open set in the registry — a brand-new ingest adds a script the list above cannot
> already name. The listed sites are every one that exists today; a *new* one is caught by the
> near-side re-verification duty (the data repo's reviewer re-derives its own side against live
> `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes
> or reclassifies an ingested field, stat key or source — or alters its historical coverage or
> reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app
> must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update
> the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in
> either repo when this drifts** — the registry simply becomes wrong, and since it is the
> inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes
> those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted
> row edit is the whole deliverable.

**What the sibling repo actually has to do: nothing.** The `Mirror` deliverable is "the exact
`docs/signal-registry.md` row edit the app must make", and **this change edits no row**: it
ingests nothing, removes nothing, reclassifies nothing, and alters no field's coverage or
reconstructable-vs-ephemeral status. Both named pointer sentences are preserved verbatim by
instruction (§4.5, §4.6). The emitted row edit is therefore **empty** — but per the Rule, emitting
the entry and stating that is the deliverable, not silently concluding "None".

**CR-15 · R3-FIT factor-multiplier mirror** — the `lib/projectionFactors.mjs` row is reworded in
§4.3f and now names `CR-15` explicitly, which it did not before. No app-side change: the mirror
contract itself is unchanged, only its one-line description.

**CR-04 · Manifest contract** — untouched. No manifest field renamed, added or removed.

**The 25,000-byte ceiling is a shared convention, not a registered contract.** The app enforces it
at `src/__tests__/claudeMdSize.test.js`; this adds the data-side equivalent. Each test reads only
its own repo's `CLAUDE.md`, neither imports from the other, and drift between the two ceilings
breaks nothing. **Adding a `CR-NN` for it would be wrong** — the registry is for couplings where
one repo's change silently breaks the other.

---

## 8. Out of scope — flagged, not done

1. **`smoke-test.yml` `paths:` filter** (§0.4) — the new test won't run on a CLAUDE.md-only PR.
2. **README CR-21's `in-season-app-read.md` citation** (§0.3) — dangling here, lives in the
   sibling. Outside the one permitted README correction.
3. **README drift generally** — at 159,973 bytes it has other drift; none is touched.
4. **A `## Navigation map` sub-cap test** (§6.1) — considered and rejected with reasons.
5. **Content guard for CR-18's `CLAUDE.md` trigger sites** (§6.2) — no test reads `CLAUDE.md`
   content in either repo. Worth a future `registry.test.mjs` extension; not this change.

---

## 9. Disposition of plan-reviewer flags (r1 → r2)

| # | Flag | Disposition |
|---|---|---|
| 1 | Projection wrong — r1 lands at 25,718, +718 over | **Fixed.** r2 assembled against live source and measured: **24,013**, 987 margin. New cut in §4.3f (six `bin/*` rows → 1, −707) plus two tightened rows and the §4.5 trim. |
| 2 | §4.3e pool understated (20 rows / 2,696 B, not 18 / 2,469) | **Fixed.** Recounted; pool is now §4.3g at 13 rows / 1,394 B after §4.3f absorbs the `bin/*` rows, with an explicit note that it cannot absorb a large overrun. |
| 3 | Three section ranges off by one, would delete the `---` | **Fixed.** §4 opens with a verified boundary table; ranges are now 7–134, 138–218, 264, 319–331, 335–339. |
| 4 | §4.3b workflow range wrong (:203–:213 sweeps `raw/`+`manifest.json`, omits four) | **Fixed.** Now §4.3c, stated as **:203–210 and :213–217**, explicitly non-contiguous. |
| 5 | README Actions-table anchors one line low | **Fixed.** Table is :993–1005; roster row :996; `smoke-test.yml` :1005. |
| 6 | `_ingest.yml` rationale cited at :1–11, actually at :23–27 | **Fixed.** §4.3c now cites both — :1–11 for the not-a-caller reasoning, :23–27 for the read-audit text. |
| 7 | §4.2 not lossless — `playerstats`/`snapshots` invocations, `--force` family list | **Fixed.** `--force` families inline; generic invocation form covers both subcommands. |
| 8 | Panel flags `--ridge`/`--scoring-from`/`--attribution` survive nowhere | **Fixed.** Full flag lists for both analysis CLIs added to README `### Module notes` (§5.2), now a stated precondition for §4.2. |
| 9 | CR-18 `Mirror` is owed; §7's "None" is wrong | **Fixed.** §7 emits the `Mirror` text verbatim and states the row edit is empty, rather than concluding "None". |
| 10 | `registry.test.mjs` doesn't read `CLAUDE.md`; r1's claim false | **Fixed.** §6.2 corrected; the absence of any content guard is now stated plainly and added to §8. |
| 11 | §6.3 link checker prints spurious `BROKEN:` for anchors | **Fixed.** Regex excludes pure-anchor links and strips `#fragments`. |
