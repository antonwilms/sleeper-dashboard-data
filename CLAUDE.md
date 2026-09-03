# sleeper-dashboard-data

Script-driven longitudinal data store consumed by the sleeper-dashboard React app via jsDelivr. See [README.md](README.md) for full context.

---

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

---

## Navigation map

One row per module, one row per *group* of served data. Deep per-file behaviour is in README →
[Module notes](README.md#module-notes) and [File schemas](README.md#file-schemas); per-family
path/source/grain/join/coverage/gate is [data-catalog.md](data-catalog.md).

| Path | Purpose |
|---|---|
| `bin/*.mjs` | Thin CLIs — parse flags and dispatch to a `scripts/` adapter; no logic of their own. Entry points and modes: [Commands](#commands). `bin/import-snapshot.mjs` is the exception below |
| `bin/import-snapshot.mjs` | One-command projection-snapshot import (newest ~/Downloads export ZIP → manifest → commit + push); see [snapshot-workflow.md](snapshot-workflow.md) |
| `lib/args.mjs` | `bin/update.mjs` arg validation — `parseAndValidateArgs(argv, opts)`; `MIN_CLI_YEAR = 1999` is a typo bound, deliberately **not** a coverage floor and not imported from `lib/nflverse.mjs` (CR-18); `ALL_SUBCOMMANDS` = schedule/gamelogs/teamcontext/oline |
| `lib/validate.mjs` | Schema validators + `findNonFinite`; holds `NFL_SENTINELS`, `KTC_TOP_QB_SENTINELS` (Invariant 7). `validateNflSeason`'s full-season floor is **self-calibrating**: `fullSeasonThreshold = Math.max(1, maxGames - 3)`, ≥30 players at or above it |
| `lib/fantasyPoints.mjs` | Scoring dot-product (`calculateFantasyPoints`, `RATE_KEYS`); used by the grading in-basis path — see Cross-repo contract registry |
| `lib/cfbd.mjs` | CFBD fetch helpers; `pivotCfbdRows` — long-form→pivoted-envelope transform shared by `scripts/update-cfbd.mjs` and `scripts/migrate-college-pivot.mjs`; emits `players` in ascending-numeric-`playerId` order (deterministic bytes) |
| `lib/enrichment.mjs` | Enrichment schema validation helpers |
| `lib/io.mjs` | `readJson`, `writeJsonStable`, `setStepOutput`, `repoPath`; `stableHash` + `sortObjectKeys` (shallow) / `deepSortKeys` (recursive, for the CFBD pivot) |
| `lib/ktc.mjs` | KTC scraper helpers |
| `lib/manifest.mjs` | manifest.json read/write helpers |
| `lib/sleeper.mjs` | Sleeper API fetch helpers |
| `scripts/update-nfl.mjs` | NFL season-totals ingest. `--year` optional — omitted resolves via `fetchCurrentNflSeason()` + `setStepOutput('season', …)`. Exported guards `hasNoData(weekData)` and `shouldSkipCompletedSeason({inProgress, force, dryRun})`; `DEFAULT_DEPS` is the injectable I/O+fetch seam |
| `scripts/migrate-*.mjs` | One-shot historical rewrites, script-produced (Invariant 1 exceptions, `--dry-run` capable): `migrate-f24-prune.mjs` (F-24 prune → schemaVersion 4), `migrate-college-pivot.mjs` (E2 Phase B pivot → schemaVersion 2) |
| `scripts/update-cfbd.mjs` | CFBD ingest — fetch long-form, pivot via `pivotCfbdRows`, validate + write the pivoted envelope; dedup hashes the pivoted form both sides (`cfbdHash` with `deepSortKeys`) |
| `scripts/update-ktc.mjs` | KTC snapshot capture logic; exports spearmanRho / ktcOrderingGuard (Spearman ordering guard) + KTC_ORDERING_THRESHOLD |
| `scripts/register-snapshots.mjs` | Snapshot manifest registration |
| `scripts/update-{roster,draft,playerids,advstats,schedule,gamelogs,teamcontext,playerstate,oline}.mjs` | Uniform family ingests — fetch, parse, dedup, write. `teamcontext`/`oline`/`playerstate` are TEAM- or date-keyed and read no crosswalk; the rest re-key to `sleeper_id` |
| `scripts/update-playerstats.mjs` | Single-fetch orchestrator — one `stats_player_week_<year>.csv` fetch drives `updateAdvStats` + `updateGameLogs`; per-family throw isolation; emits `advstats_ok`/`gamelogs_ok` step outputs |
| `lib/nflverse.mjs` | nflverse fetch + CSV-parse helpers. **Coverage floors** (CR-18 trigger sites): `MIN_ROSTER_IDS`, `MIN_DRAFT_YEAR`, `MIN_PLAYERID_ROWS`, `MIN_ADVSTATS_ROWS`, `MIN_SCHEDULE_SEASON`, `MIN_SCHEDULE_GAMES`, `MIN_PLAYERGAME_ROWS`, `MIN_GAMELOG_SEASON`, `MIN_TEAMCONTEXT_ROWS`, `MIN_TEAMCONTEXT_SEASON`, `MIN_OLINE_ROWS`, `MIN_OLINE_SEASON`. `AY_PER_TARGET_MIN`/`MAX` is a plausibility **band**, not a floor |
| `scripts/grade-snapshot.mjs` | Snapshot adapter — loads snapshot + outcomes, builds GradeInput, orchestrates `gradeSnapshot()` / `runSelfTest()` / `formatHumanReport()` |
| `scripts/backtest-run.mjs` | Backtest orchestration adapter (injectable loader; mirrors `scripts/grade-snapshot.mjs`) |
| `scripts/update-enrichment.mjs` | Enrichment upsert/validate/remove logic |
| `lib/grade.mjs` | Pure scorer — `scoreProjections(GradeInput) → GradeReport`; no I/O |
| `lib/backtest.mjs` | Pure backtest stats (standardized OLS, quintiles, team totals); no I/O. `solveOLS` accepts `{ ridgeLambda }`; exports `rankTransform`/`spearman` and `isTeamAggregateId` (the `TEAM_*` pseudo-row filter) |
| `scripts/panel-run.mjs` | Panel orchestration adapter (injectable loaders); attribution-mode seam; `runFlipGate`, `runFit`, `buildFitVerdictReport`, `assemblePanel({withFactorMultipliers, historyFloor})` |
| `lib/panel.mjs` | Pure panel/fit logic — feature builders, forward-chain CV, ridge, spearman; no I/O. `buildTeamTotalsForSeason` excludes `TEAM_<abbr>` pseudo-rows (mirror of app `isTeamAggregateId`; unfiltered they doubled every team denominator) |
| `lib/projectionFactors.mjs` | Pure app-factor-multiplier reconstruction for the R3-FIT fit — mirrors the app's leaf factor transforms and their input pipelines. **Cross-repo mirror contract (CR-15)** |
| `scripts/check-crons.mjs` | Dead-man detector — `extractCrons`, `listScheduledWorkflows`, `cronCadence`, `evaluateWorkflow`, `runDeadman`; monitoring only, no data-file I/O |
| `.github/workflows/` | Eight uniform weekly ingest jobs delegate to the reusable `_ingest.yml` (`workflow_call`) template. **Standalone, deliberately not callers:** `nflverse-playerstats.yml` (per-family conditional staging — an Invariant 3 safeguard), `weekly-ktc.yml` (its quarantine-alarm step cannot exist alongside `uses:`), plus `cron-deadman.yml` and `smoke-test.yml`. Triggers and per-job detail: README → [GitHub Actions](README.md#github-actions). Purge URLs: Invariant 8 |
| `nfl/`, `college/`, `ktc/`, `nflverse/`, `snapshots/` | Served data families — a section each in [data-catalog.md](data-catalog.md), schemas in README → [File schemas](README.md#file-schemas) |
| `ktc/quarantine/` | Scrapes rejected by the Spearman ordering guard — script-produced, **not** manifest-registered, **not** app-read; review and promote manually |
| `nflverse/playerids.json` | gsis_id→sleeper_id crosswalk — **internal-only**: read server-side by `update-advstats.mjs`/`update-gamelogs.mjs`, never by the app |
| `enrichment/` | The only hand-authored tree: coaching / scheme / injuries / notes, edited **only** via `bin/enrich.mjs` (Invariant 2) |
| `backtests/`, `grading/` | Analysis output from `--write`. The `<date>-*-verdict.md` reports are deliberately **unregistered** — a documented Invariant 3 exception |
| `manifest.json` | Index of every script-written file (Invariant 3) |
| `data-catalog.md` | Living dataset index — every ingest slice updates its family's row (Done-definition) |
| `raw/` | Unprocessed Sleeper API responses |

---

## Invariants

1. **Append-only for historical data.** Completed past seasons are never overwritten except to correct an error (requires a committed diff explaining why). Files with `inProgress: true` in manifest.json are in-season and may be re-exported (exception: KTC snapshots always register `inProgress: true` as a "current-value" marker yet remain append-only and are never re-exported — see Invariant 5).

   *Exception (F-24, 2026-08-24): completed seasons were rewritten once to drop `idp_*` and `punt*` fields. No reader in either repo consumed them. Rationale in commit `2b06c5b`.*

   *Exception (E2 Phase B, 2026-09-03): all 27 `college/{passing,receiving,rushing}/<year>.json` files, including completed seasons, were rewritten once from a long-form row array to a pivoted player-keyed envelope (`schemaVersion` 1→2), by `scripts/migrate-college-pivot.mjs` — a pure local transform of bytes already on disk, never a re-ingest, so the shape change cannot be conflated with any upstream CFBD revision. This is a **shape migration, not a correction**, and unlike F-24 it is not byte-preserving: the transform is proven **value**-preserving (reconstructing long-form rows from each pivoted file and comparing to the original as a set, `stat` compared numerically, matches on all 314,871 rows across all 27 files), but 24,065 of those values (7.6%) changed **textual form** in the process (`"1.000"`→`1`, concentrated in the rate stats). The audit trail is git history plus the retained `rowCount` field (source row count, kept as provenance inside the pivoted file) and the committed verification output at `verification/college-pivot-phase-b-roundtrip-proof.txt`. See `data-catalog.md`'s CFBD college stats row for the full accounting.*

2. **Never hand-edit primary data files** (`nfl/`, `college/`, `ktc/`, `snapshots/`). They are script-produced. Only `enrichment/` is hand-authored, and only via `bin/enrich.mjs`—direct JSON edits bypass validation.

3. **manifest.json is the index.** Every script-written file must be registered with `recordCount`, `schemaVersion`, `lastModified`, and `inProgress` maintained. Treat manifest field names as a public API (see Cross-repo contract registry).

4. **schemaVersion discipline.** NFL season-totals are at v4 (per-season `team`; F-24's `idp_*`/`punt*` stat-key prune, 2026-08-24) — the app's `MAX_SUPPORTED_SCHEMA` ceiling was raised to 4 ahead of it. KTC snapshots are at v1. Projection snapshots are at v2 (new envelope fields: `targetSeason`, `currentSeason`, `scoringSettings`). **CFBD college stats are at v2** (E2 Phase B, 2026-09-03 — the long-form row array became a pivoted player-keyed envelope, an incompatible layout change under the app's `MAX_SUPPORTED_SCHEMA=4` ceiling). Bump `schemaVersion` only on an incompatible layout change. Snapshot schemaVersion is independent of the app's `MAX_SUPPORTED_SCHEMA` — that ceiling applies to every family the app reads through `tryDataStore`, not only season-totals; season-totals and CFBD college stats are simply the only families currently above v1, and snapshots have no `tryDataStore` reader in the first place.

5. **Snapshots are permanent.** Keyed by UTC date; never overwritten within a day (first-league-of-the-day-wins). KTC snapshots are append-only with content-hash dedup—no commit when content is unchanged. A scrape that fails the Spearman ordering guard is written to `ktc/quarantine/` (script-produced, unregistered, app-ignored) rather than `ktc/`, so a false trip never permanently loses data; it is not "primary data" under Invariant 2.

   `nfl/players-state/<date>.json` snapshots are date-keyed, append-only, and content-hash-deduped like KTC (dedup excludes the churning `newsUpdated`/`searchRank` fields), but register `inProgress: false` — each dated file is a completed, immutable capture, never re-exported; the KTC `inProgress: true` "current-value marker" is legacy, not a pattern to propagate. Like KTC, a same-day re-run with changed upstream overwrites that day's file — there is no code-enforced same-day lock, only the dedup check.

   **nflverse roster/draft/playerids/advstats/schedule/gamelogs/teamcontext/oline are script-produced primary data and must never be hand-edited.** The current-season roster mutates weekly and is re-ingested by the Tuesday Action; content-hash dedup ensures no commit when unchanged. Roster/draft/playerids/advstats/schedule/gamelogs/teamcontext/oline files are registered **`inProgress: false` even while the current-season file mutates** — deliberate deviation from the `nfl/season-totals` convention. The app has no live fallback for any of these (unlike season-totals where Sleeper is the live source); it must get them from the store. Weekly mutability is handled by content-hash dedup (here) + `lastModified`-driven cache invalidation (app-side). Do not change this to `inProgress: true`.

6. **Enrichment schemas are contracts.** Each file has required fields per entry. `injuries.segmentStartWeek` must match an absence segment in the matching season-totals file. `add` is an upsert keyed by natural key. Orphaned entries (no matching season-totals player/team) are flagged by `validate`; the app silently ignores them.

7. **Yearly maintenance.** At each season start, update `NFL_SENTINELS` and `KTC_TOP_QB_SENTINELS` in `lib/validate.mjs` to reflect the current player landscape.

8. **CDN purge URLs for season-keyed files (`nflverse/roster`, `nflverse/advstats`, `nflverse/schedule`, `nflverse/gamelogs`, `nflverse/teamcontext`, `nflverse/oline`) must be built from the NFL season surfaced by the node step (`setStepOutput('season', …)` → `${{ steps.fetch.outputs.season }}`), never `date -u +%Y`. Calendar year and resolved season diverge Jan–Feb; KTC is exempt (date-keyed).**

9. **Grading reads are never recomputed.** `bin/grade.mjs` joins captured projections to captured outcomes — it never re-runs the projection pipeline. The GradeReport is fully determined by the snapshot and outcome files at read time. *Clarification: grading MAY recompute actual fantasy points from stored season-totals `stats` under the snapshot's `scoringSettings` (a deterministic dot-product); it never re-runs the projection pipeline.*

---

## Cross-repo contract registry (with sleeper-dashboard)

This repo cannot edit the app. The **complete enumerated registry** — the entry-format definition and all 21 `CR-NN` entries — lives in [README.md → Cross-repo contract registry](README.md#cross-repo-contract-registry-with-sleeper-dashboard). It is the sole authority for what the app must mirror: the plan-reviewer subagent reads that section and never reads the sibling tree. Its data-side trigger lists are a maintained cache the subagent re-verifies against live source on every review.

**Rule.** Any change touching a listed contract **must emit that entry's `Mirror` text as Session 1 output**, in a `## Cross-repo impact` section of the task file, quoting the `CR-NN` id. Naming the contract in prose is not enough; the mirror instruction itself is the deliverable.

**A coupling that is not listed there does not exist for review purposes.** Introducing a genuinely new cross-repo coupling is the one residual case that routes to the Claude.ai project — see [Workflow convention](#workflow-convention).

---

## Sibling repo

`sleeper-dashboard` is the React app that consumes this repo's files and produces the snapshots imported here; its README documents the projection pipeline and data-store consumption.

The canonical signal/feature registry — classifying every raw source, computed factor, and ephemeral capture by layer, coverage, and reconstructable-vs-ephemeral status — lives in the app repo at `docs/signal-registry.md`.

---

## Workflow convention

**The standard loop is fully in-repo.** Every step — planning, review, approval, implementation — happens in this repository against live source. Nothing in the standard loop depends on an external tool or on a chat held outside it.

```
Session 1 (planning, opus)
  → plan-reviewer subagent   ← the review gate
  → human approval
  → Session 2 (implementation, sonnet)
```

Features use a two-session flow: **opus plans**, **sonnet implements**.

- Opus session: read relevant code, decide signatures and data shapes, write `.claude/tasks/<feature>.md`. **Do not edit any source files.** End the session.
- Sonnet session: read the task file first, implement exactly what it specifies, run `npm run smoke`. If something is ambiguous or contradicts existing code, stop and ask — do not guess.

The task file is the handoff artifact, not chat history. A planning session that edits source has broken the handoff.

### Plan review

The plan-reviewer subagent (`.claude/agents/plan-reviewer.md`) is the **primary review gate**, not a lint pass. Invoke it on the task file at the end of Session 1, before Session 2. Its mandate is three-part:

1. **Factual / mechanical** — paths, function signatures, emitted JSON shapes, manifest entries, stat keys and step ordering, checked against live source.
2. **Strategic / principles** — whether the planned approach is sound and conforms to the [Invariants](#invariants) above: a plan that is factually accurate but violates an invariant, or solves the problem the wrong way, gets flagged.
3. **Cross-repo intent** — whether the plan touches an entry in [README.md → Cross-repo contract registry](README.md#cross-repo-contract-registry-with-sleeper-dashboard), and if so whether Session 1 emitted that entry's `Mirror` text. The reviewer checks against that registry only; it never reads the sibling tree.

**Flags are advisory input to the human, not an auto-apply queue.** Session 1 reports them verbatim and does not act on them. The human decides what to fix. Session 2 starts only after human approval.

### The Claude.ai project

**Out of the standard loop.** The Claude.ai project is an occasional exploration tool — open-ended thinking, cross-repo reading, research that has not yet become a plan. It is not a review gate, it does not author task files, and no step of the standard loop waits on it.

**The one residual case that still routes there:** a change that introduces a **brand-new cross-repo coupling not yet present in the registry**. A repo-scoped subagent can check a plan against a known list, but it cannot reason about a coupling that has never been written down, and it cannot read the sibling tree to discover one. Take that case to the Claude.ai project, which can hold both repos at once.

Its output is not a decision — it is a **draft registry entry** in the format defined inside the mirrored region of [README.md → Cross-repo contract registry](README.md#cross-repo-contract-registry-with-sleeper-dashboard). That draft returns to Session 1, lands in both repos' registries in the same change, and is then subject to the normal in-repo gate like anything else. Extending an existing entry is *not* this case and stays in-repo.

---

## Done-definition

Before reporting a task complete:
1. Run `npm run smoke` — fix any red.
2. For enrichment changes, run `npm run validate:enrichment` — fix any red.
3. For any change touching a data file, confirm `manifest.json` is updated.
4. Plan review: invoke the plan-reviewer subagent on the task file at the end of Session 1, before Session 2 — see [Workflow convention](#workflow-convention).
5. For any change that adds a served family or alters a family's coverage/schema/gate, update its `data-catalog.md` row in the same change.

---

## Session git workflow

Every session that modifies tracked files commits and pushes its own work — nothing uncommitted is left between sessions. Uncommitted local work colliding with a scheduled Action's push to main (Invariant 8's workflows) is the failure mode this exists to prevent. Read-only sessions (planning that produces no tracked change) do nothing here.

- `git pull --rebase origin main` **before** any push — the scheduled Actions push to main on cron and will reject a stale push.
- `manifest.json` conflicts resolve as a **union** — every entry from both sides, never one side wholesale.
- A session whose purpose is *removing* entries resolves as **union minus its own deletions**; the plain union rule would resurrect a deletion landing in the same rebase window.
- A conflict that is not a clean union: stop and report for a human decision, do not guess.
- Plain `git push origin main` — **never `--force`**, including after a rejected push.

Full sequence, conflict verification commands, and the post-push CDN purge: [git-workflow.md](git-workflow.md).

---

## Self-maintenance

**This file has a hard ceiling of 25,000 bytes, enforced by `test/claudeMdSize.test.mjs`.**
It is a navigation-and-rules layer, not a second README. A change that would breach the ceiling
**prunes in the same commit** — it does not raise the ceiling. Per-file detail belongs in README →
[Module notes](README.md#module-notes); per-family coverage in [data-catalog.md](data-catalog.md).
Nothing here records history — rows state what is true now, and `git log` holds the rest.

Keep this file current as part of every task's done-definition. If a change adds/renames a `bin/` subcommand, a `package.json` script, a data folder, a manifest field, or an enrichment/snapshot schema, update the relevant section in the same change. When a change adds, removes, or alters the historical coverage of an ingested field, stat key, or data source (`nfl`/`cfbd`/`ktc`/`roster`/`draft`/`advstats`/`playerids`/`schedule`/`gamelogs`/`teamcontext`/`enrichment`), flag the canonical signal registry for update: it lives in the app repo at `docs/signal-registry.md`. The same trigger updates the family's row in `data-catalog.md` (this repo — storage registry). Note the change (Source / Historical coverage / Reconstructable-vs-ephemeral) in your task summary so the app repo updates the row. If a change touches an entry in [README.md → Cross-repo contract registry](README.md#cross-repo-contract-registry-with-sleeper-dashboard), emit that entry's `Mirror` text in a `## Cross-repo impact` section of the task file, quoting the `CR-NN` id — naming the contract in prose is not enough. If the change introduces a coupling the registry does not list, add the new entry to **both** repos in the same change (see [Workflow convention](#workflow-convention) for how a genuinely new coupling gets drafted).
