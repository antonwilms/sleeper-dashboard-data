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

`bin/backtest.mjs` and `bin/panel.mjs` are **offline analysis, not the snapshot grader** (`bin/grade.mjs`). `--fit` pins `--basis half_ppr` and `--attribution per-season-team` and rejects an explicit `--attribution`.

**Poisoned-snapshot window (2026-07-16 → 2026-07-18):** app snapshots in this window carry ~½-scale `teamRzShare` and `shareVolatility`. Exclude or correct them in the 2026 grading run — README → [Module notes](README.md#module-notes).

---

## Navigation map

One row per module, one row per *group* of served data. Deep per-file behaviour is in README →
[Module notes](README.md#module-notes) and [File schemas](README.md#file-schemas); per-family
path/source/grain/join/coverage/gate is [data-catalog.md](data-catalog.md).

| Path | Purpose |
|---|---|
| `bin/*.mjs` | Thin CLIs — parse flags, dispatch to a `scripts/` adapter; no logic of their own. Entry points and modes: [Commands](#commands) |
| `bin/import-snapshot.mjs` | One-command projection-snapshot import (newest ~/Downloads export ZIP → manifest → commit + push); see [snapshot-workflow.md](snapshot-workflow.md) |
| `lib/args.mjs` | `bin/update.mjs` arg validation. `MIN_CLI_YEAR = 1999` is a typo bound, **not** a coverage floor (CR-18); `ALL_SUBCOMMANDS` = schedule/gamelogs/teamcontext/oline/snaps |
| `lib/validate.mjs` | Schema validators + `findNonFinite`; holds `NFL_SENTINELS`, `KTC_TOP_QB_SENTINELS` (Invariant 7). `validateNflSeason`'s full-season floor self-calibrates: `Math.max(1, maxGames - 3)`, ≥30 players at or above it |
| `lib/fantasyPoints.mjs` | Scoring dot-product (`calculateFantasyPoints`, `RATE_KEYS`); drives the grading in-basis path — see Cross-repo contract registry |
| `lib/cfbd.mjs` | CFBD fetch helpers; `pivotCfbdRows` is the long-form→pivoted-envelope transform, shared by `update-cfbd.mjs` and `migrate-college-pivot.mjs` |
| `lib/io.mjs` | `readJson`, `writeJsonStable`, `setStepOutput`, `repoPath`, `stableHash`, `sortObjectKeys` (shallow) / `deepSortKeys` (recursive) |
| `lib/{enrichment,ktc,manifest,sleeper}.mjs` | Helpers — enrichment schema validation, KTC scraping, manifest read/write, Sleeper API fetch |
| `lib/seasonIngest.mjs` | `runSeasonKeyedIngest` — shared manifest-registration adapter for the five season-keyed family ingests (`schedule`, `teamcontext`, `oline`, `gamelogs`, `advstats`); hard-codes `inProgress: false`, `schemaVersion: 1` (CR-04 data-side trigger) |
| `lib/registry.mjs`, `scripts/registry-audit.mjs` | Field-block parser + read-only CLI for the mirrored `<!-- CR-REGISTRY-BEGIN -->` region in README.md; reports per-entry cache-field anchor counts, no writes |
| `scripts/update-nfl.mjs` | NFL season-totals ingest. `--year` omitted resolves via `fetchCurrentNflSeason()` + `setStepOutput('season', …)`. Guards `hasNoData` / `shouldSkipCompletedSeason`; `DEFAULT_DEPS` is the injectable I/O+fetch seam |
| `scripts/migrate-*.mjs` | One-shot historical rewrites, `--dry-run` capable — the Invariant 1 exceptions: `migrate-f24-prune.mjs`, `migrate-college-pivot.mjs` |
| `scripts/update-cfbd.mjs` | CFBD ingest — fetch long-form, pivot, validate, write the pivoted envelope; dedup hashes the pivoted form on both sides |
| `scripts/update-ktc.mjs` | KTC snapshot capture; the Spearman ordering guard lives here — `ktcOrderingGuard`, `KTC_ORDERING_THRESHOLD` |
| `scripts/register-snapshots.mjs` | Snapshot manifest registration |
| `scripts/update-{roster,draft,playerids,advstats,schedule,gamelogs,teamcontext,playerstate,oline,snaps}.mjs` | Uniform family ingests — fetch, parse, dedup, write. `teamcontext`/`oline`/`playerstate` are TEAM- or date-keyed and read no crosswalk; the rest re-key to `sleeper_id` (`snaps` via `pfrId`, the rest via `gsisId`) |
| `scripts/update-playerstats.mjs` | Single-fetch orchestrator — one `stats_player_week_<year>.csv` drives `updateAdvStats` + `updateGameLogs` under per-family throw isolation; emits `advstats_ok`/`gamelogs_ok` |
| `lib/nflverse.mjs` | nflverse fetch + CSV-parse helpers. **Coverage floors** (CR-18 trigger sites): `MIN_ROSTER_IDS`, `MIN_DRAFT_YEAR`, `MIN_PLAYERID_ROWS`, `MIN_ADVSTATS_ROWS`, `MIN_SCHEDULE_SEASON`, `MIN_SCHEDULE_GAMES`, `MIN_PLAYERGAME_ROWS`, `MIN_GAMELOG_SEASON`, `MIN_TEAMCONTEXT_ROWS`, `MIN_TEAMCONTEXT_SEASON`, `MIN_OLINE_ROWS`, `MIN_OLINE_SEASON`, `MIN_SNAPS_ROWS`, `MIN_SNAPS_SEASON` (2013 — **not** the 2012 floor its nflverse siblings share; `snap_counts_2012.csv` exists upstream but is header-only). `AY_PER_TARGET_MIN`/`MAX` is a plausibility **band**, not a floor |
| `scripts/grade-snapshot.mjs` | Grading adapter — loads snapshot + outcomes, builds GradeInput, orchestrates `lib/grade.mjs` |
| `scripts/backtest-run.mjs` | Backtest adapter (injectable loader; mirrors `scripts/grade-snapshot.mjs`) |
| `scripts/update-enrichment.mjs` | Enrichment upsert/validate/remove logic |
| `lib/grade.mjs` | Pure scorer — `scoreProjections(GradeInput) → GradeReport`; no I/O |
| `lib/backtest.mjs` | Pure backtest stats (standardized OLS, quintiles, team totals); no I/O. `isTeamAggregateId` is the `TEAM_*` pseudo-row filter |
| `scripts/panel-run.mjs` | Panel adapter (injectable loaders); owns the attribution-mode seam — `runFlipGate`, `runFit`, `assemblePanel` |
| `lib/panel.mjs` | Pure panel/fit logic — feature builders, forward-chain CV, ridge, spearman; no I/O. `buildTeamTotalsForSeason` **must** exclude `TEAM_<abbr>` pseudo-rows (mirror of app `isTeamAggregateId`) |
| `lib/projectionFactors.mjs` | Pure app-factor-multiplier reconstruction for R3-FIT — mirrors the app's leaf factor transforms and their input pipelines. **Cross-repo mirror contract (CR-15)** |
| `scripts/check-crons.mjs` | Dead-man detector for the scheduled workflows; monitoring only, no data-file I/O |
| `.github/workflows/` | Nine uniform ingest jobs (weekly, except `nflverse-snaps.yml`, which is yearly) delegate to the reusable `_ingest.yml` (`workflow_call`) template. Five are deliberately **not** callers: `nflverse-playerstats.yml`, `weekly-ktc.yml`, `cron-deadman.yml`, `smoke-test.yml`, `daily-snapshot.yml` (D1b — runs a browser against the app repo's own build, a shape `_ingest.yml` cannot express; `workflow_dispatch` only in phase 1, no `cron:` line yet, see CR-22). Triggers, per-job detail and why each standalone cannot delegate: README → [GitHub Actions](README.md#github-actions). Purge URLs: Invariant 8 |
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

   *Two documented one-off rewrites have landed under this invariant. What each changed, why, and the proof are in `git log` and in the affected family's row in [data-catalog.md](data-catalog.md).*

2. **Never hand-edit primary data files** (`nfl/`, `college/`, `ktc/`, `snapshots/`). They are script-produced. Only `enrichment/` is hand-authored, and only via `bin/enrich.mjs`—direct JSON edits bypass validation.

3. **manifest.json is the index.** Every script-written file must be registered with `recordCount`, `schemaVersion`, `lastModified`, and `inProgress` maintained. Treat manifest field names as a public API (see Cross-repo contract registry).

4. **schemaVersion discipline.** Current versions: NFL season-totals **v4**, CFBD college stats **v2**, projection snapshots **v3** (D1a — adds `inputStatus`; the D1b commit gate rejects anything below v3), KTC snapshots **v1**. Bump `schemaVersion` only on an incompatible layout change, and raise the app's `MAX_SUPPORTED_SCHEMA` ahead of the bump, never after. That ceiling applies to every family the app reads through `tryDataStore`, not only season-totals; snapshots have no `tryDataStore` reader, so their schemaVersion is independent of it.

5. **Snapshots are permanent.** Keyed by UTC date; never overwritten within a day (first-league-of-the-day-wins). KTC snapshots are append-only with content-hash dedup — no commit when content is unchanged. A scrape that fails the Spearman ordering guard is written to `ktc/quarantine/` (script-produced, unregistered, app-ignored) rather than `ktc/`, so a false trip never permanently loses data; it is not "primary data" under Invariant 2.

   `nfl/players-state/<date>.json` is date-keyed, append-only and content-hash-deduped like KTC (dedup excludes the churning `newsUpdated`/`searchRank`), but registers `inProgress: false` — each dated file is a completed, immutable capture. KTC's `inProgress: true` "current-value marker" is legacy; do not propagate it. As with KTC, a same-day re-run against changed upstream overwrites that day's file: dedup is the only check, there is no code-enforced same-day lock.

   **nflverse roster/draft/playerids/advstats/schedule/gamelogs/teamcontext/oline are script-produced primary data and must never be hand-edited.** They register **`inProgress: false` even while the current-season file mutates weekly** — a deliberate deviation from the `nfl/season-totals` convention, because the app has no live fallback for them and must get them from the store. Weekly mutability is handled by content-hash dedup here plus `lastModified`-driven cache invalidation app-side. Do not change this to `inProgress: true`.

6. **Enrichment schemas are contracts.** Each file has required fields per entry. `injuries.segmentStartWeek` must match an absence segment in the matching season-totals file. `add` is an upsert keyed by natural key. Orphaned entries (no matching season-totals player/team) are flagged by `validate`; the app silently ignores them.

7. **Yearly maintenance.** At each season start, update `NFL_SENTINELS` and `KTC_TOP_QB_SENTINELS` in `lib/validate.mjs` to reflect the current player landscape.

8. **CDN purge URLs for season-keyed files (`nflverse/roster`, `nflverse/advstats`, `nflverse/schedule`, `nflverse/gamelogs`, `nflverse/teamcontext`, `nflverse/oline`, `nflverse/snaps`) must be built from the NFL season surfaced by the node step (`setStepOutput('season', …)` → `${{ steps.fetch.outputs.season }}`), never `date -u +%Y`. Calendar year and resolved season diverge Jan–Feb; KTC is exempt (date-keyed).**

9. **Grading reads are never recomputed.** `bin/grade.mjs` joins captured projections to captured outcomes — it never re-runs the projection pipeline. The GradeReport is fully determined by the snapshot and outcome files at read time. *Clarification: grading MAY recompute actual fantasy points from stored season-totals `stats` under the snapshot's `scoringSettings` (a deterministic dot-product); it never re-runs the projection pipeline.*

---

## Cross-repo contract registry (with sleeper-dashboard)

**A repo-scoped session does not edit the sibling** — the registry's `Mirror` text is how a change
reaches the other side. A session started in the *parent folder* holding both repos can write both,
and that is the one sanctioned way to land a two-sided change: registry-listed contracts and
genuinely new couplings only, both sides in the same change, the registry entry updated or drafted
in that same change. Never edit the sibling incidentally from a repo-scoped session. The **complete enumerated registry** — the entry-format definition and all 21 `CR-NN` entries — lives in [README.md → Cross-repo contract registry](README.md#cross-repo-contract-registry-with-sleeper-dashboard). It is the sole authority for what the app must mirror: the plan-reviewer subagent reads that section and never reads the sibling tree. Its data-side trigger lists are a maintained cache the subagent re-verifies against live source on every review.

**Rule.** Any change touching a listed contract **must emit that entry's `Mirror` text as Session 1 output**, in a `## Cross-repo impact` section of the task file, quoting the `CR-NN` id. Naming the contract in prose is not enough; the mirror instruction itself is the deliverable.

**A coupling that is not listed there does not exist for review purposes.**

---

## Sibling repo

`sleeper-dashboard` is the React app that consumes this repo's files and produces the snapshots imported here; its README documents the projection pipeline and data-store consumption.

The canonical signal/feature registry — classifying every raw source, computed factor, and ephemeral capture by layer, coverage, and reconstructable-vs-ephemeral status — lives in the app repo at `docs/signal-registry.md`.

---

## Workflow convention

**The standard loop is fully in-repo.** Planning, review, approval, implementation and
verification all happen in this repository against live source. Nothing in it waits on a
chat held outside it.

```
Session 1 (planning, opus)
  → plan-reviewer subagent      ← plan gate
  → human approval
Session 2 (implementation, sonnet)
  → done-definition             ← machine gate
  → back to Session 1 to verify ← judgment gate
      → implementation-reviewer on the diff
      → flags: opus triages, writes `## Fix pass N`, fix-applier applies it
      → implementation-reviewer re-run once on the fix diff
  → human sign-off
```

**Opus plans, sonnet implements, opus verifies.** A sonnet session that hits a design question
the task file did not anticipate stops and reports — it never improvises architecture.

- **Session 1** — read relevant code, decide signatures and data shapes, write
  `.claude/tasks/<feature>.md`. **Edit no source files.** Invoke plan-reviewer, report its flags
  verbatim, end the session.
- **Session 2** — read the task file first, implement exactly what it specifies, run the
  done-definition. If something is ambiguous or contradicts existing code, stop and ask. Hand back:
  **the commit SHA or diff range**, every file touched, every deviation from the task file, and
  what each new or changed test asserts.
- **Verification** — paste that hand-back into the still-open Session 1, which invokes
  implementation-reviewer on the diff. **Verification reads the diff, never the hand-back alone** —
  a self-report cannot show what it left out.
- **Fix pass** — if the review flags something, Session 1 triages it and appends `## Fix pass N` to
  the same task file: what to change, where, and what to leave alone. The fix-applier subagent
  implements that section; implementation-reviewer then re-runs **once** on the fix diff. Flags
  surviving that round go to the human — never a third automatic round. **Session 1 still edits no
  source itself**: the fix pass is a written spec and the applier is the only writer, so the task
  file remains the complete record.

The task file is the handoff artifact, not chat history. A planning session that edits source has
broken the handoff.

### Reviews and fixes

Three subagents. The two reviewers are read-only and **advisory** — flags are reported verbatim and
never auto-applied. The human decides; the next step starts only after approval.

- **plan-reviewer** (`.claude/agents/plan-reviewer.md`) — end of Session 1, on the task file.
  Factual/mechanical, conformance to the Invariants, cross-repo intent.
- **implementation-reviewer** (`.claude/agents/implementation-reviewer.md`) — invoked by Session 1
  during verification, on Session 2's diff. Fidelity to the task file including scope beyond its
  touch list; conformance to invariants no test guards; whether new or changed tests assert real
  behaviour rather than having been bent green.
- **fix-applier** (`.claude/agents/fix-applier.md`) — invoked by Session 1 on a `## Fix pass N`
  section. The only agent in this loop that writes. Implements that section exactly and nothing
  else; if the fix looks wrong, incomplete, or reaches beyond what the section names, it stops and
  reports rather than improvising.

### How to talk to Anton

Anton owns *what* and *why*; you own *how*. Lead with outcome and stakes — what a change does for
the product, what it costs, what it risks — not with mechanism. Keep internal machinery out unless
it changes a decision; when a technical term is unavoidable, define it inline in one clause. Give a
clear recommendation with one sentence of justification, or for a real judgment call two options
and a pick. Never walk through code line by line unless asked.

**This governs prose addressed to Anton only.** Task files, hand-backs and review flags are
engineering artifacts — exact paths, function names, data shapes, line anchors. Do not let the
executive register make them vague, and do not let their precision leak into what you say to him.

### The Claude.ai project

**Out of the standard loop.** An exploration tool — open-ended thinking, cross-repo reading,
research that has not become a plan. Not a review gate, authors no task files, nothing waits on it.
Its one residual case is a **brand-new cross-repo coupling absent from the registry**, which no
repo-scoped subagent can reason about; its output is a draft registry entry that returns to
Session 1 and takes the normal gate. Extending an existing entry stays in-repo.

**These sections are mirrored in the sibling repo's CLAUDE.md and change together.**

---

## Done-definition

Before reporting a task complete:
1. Run `npm run smoke` — fix any red.
2. For enrichment changes, run `npm run validate:enrichment` — fix any red.
3. For any change touching a data file, confirm `manifest.json` is updated.
4. Plan review: invoke the plan-reviewer subagent on the task file at the end of Session 1, before Session 2 — see [Workflow convention](#workflow-convention).
5. For any change that adds a served family or alters a family's coverage/schema/gate, update its `data-catalog.md` row in the same change.
6. Hand back to Session 1 for verification — the hand-back contract is in [Workflow convention](#workflow-convention).

---

## Session git workflow

Every session that modifies tracked files commits and pushes its own work — see [git-workflow.md](git-workflow.md) for why.

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

Keep this file current as part of every task's done-definition. If a change adds or renames a `bin/` subcommand, a `package.json` script, a data folder, a manifest field, or an enrichment/snapshot schema, update the relevant section in the same change.

When a change adds, removes, or alters the historical coverage of an ingested field, stat key, data source, or enrichment entry, update the family's row in [data-catalog.md](data-catalog.md) (this repo's storage registry) and note the change (Source / Historical coverage / Reconstructable-vs-ephemeral) in your task summary so the app repo can update the canonical signal registry at `docs/signal-registry.md`.

Contract changes follow the mirror rule in [Cross-repo contract registry](#cross-repo-contract-registry-with-sleeper-dashboard) — including the new-coupling case, which lands in both repos in the same change.
