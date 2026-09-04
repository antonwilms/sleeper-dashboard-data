# CLAUDE.md pass 2 — mirrored workflow block, history pruning, implementation-reviewer

**Session 1 (opus, planning). Edit no source files.** Session 2 implements exactly what is below.

Baseline: `CLAUDE.md` is **24,013 bytes**; `test/claudeMdSize.test.mjs` enforces a 25,000-byte
ceiling via `fs.statSync().size` (exact bytes on disk — the test's own header warns that
`readFileSync().length` undercounts by ~2,800 here, so every number in this file is `wc -c`).

---

## 0. Findings that change the shape of the task

### 0.1 The ≤19,000 target is not reachable under the stated constraints

Measured, by assembling the full post-edit file and running `wc -c` on it — not estimated:

| Variant | Bytes | vs. baseline |
|---|---|---|
| Baseline | 24,013 | — |
| The six changes exactly as specified | **21,200** | −2,813 |
| Plus the four flagged dedupes in §7 | **20,729** | −3,284 |
| Target | 19,000 | −5,013 |

The gap is **2,200 bytes** as specified, **1,729** with the flagged dedupes. Closing it requires
cutting something a constraint protects. The three levers, measured:

- `### How to talk to Anton` inside the mirrored block — **776 bytes**. Blocked: the block is
  pasted verbatim and the sibling carries identical text.
- The six-row CLI table in `## Commands` → README → *Update scripts* — **676 bytes**. Not in the
  six changes; `## Commands` was pass 1's work and is already lean.
- The twelve `MIN_*` floor names in the `lib/nflverse.mjs` row → README — **305 bytes**. Blocked:
  item 3 says retain floors.

**Recommendation: land 20,729 and leave the ceiling at 25,000.** The file drops 13.7% and gains the
verification half of the loop. Reaching 19,000 means trading away either mirror fidelity or the
constants a session must not guess at, which costs more than the ~1.7 KB saves.

### 0.2 Item 3's premises do not match the file — the test still applies

Item 3 describes `scripts/update-nfl.mjs` as "~1,800 characters" narrating "a fixed bug's history",
and `_ingest.yml` as exceeding 1,000. Measured, the navigation map's longest rows are:

| Row | Bytes |
|---|---|
| `.github/workflows/` (the `_ingest.yml` row) | 489 |
| `lib/nflverse.mjs` | 425 |
| `scripts/update-nfl.mjs` | 307 |
| `scripts/update-{roster,…}.mjs` | 278 |
| `lib/args.mjs` | 275 |

Nothing is near 1,800, and the `update-nfl.mjs` row narrates no bug — it states flag resolution and
two exported guards, all present tense. The **fixed-bug narration is in the `lib/panel.mjs` row**
("unfiltered they doubled every team denominator"), which item 3 does not name.

So the numbers are wrong but the test is right, and §4.2 applies the test item 3 actually states —
present tense, one or two lines, keep gates/floors/`CR-NN`/constants — to the rows that fail it.
The consequence is that the map yields **916 bytes**, not the ~2,700 the stated figures imply. That
is the single largest reason for the shortfall in §0.1.

### 0.3 The supplied block is byte-identical to the sibling minus the two app-only bullets

Verified by `diff` against `sleeper-dashboard/CLAUDE.md:165–234` with the two `*(app-only)*` bullets
(run-the-app, screenshot-is-not-sign-off) stripped: **identical**. Two mechanical notes for
Session 2:

- The paste lost the **opening** fence of the flow diagram and carries a stray closing fence plus an
  outer wrapper. §4.1 restores the fence exactly as the sibling has it. Paste §4.1, not the prompt.
- The block ends at *"These sections are mirrored in the sibling repo's CLAUDE.md and change
  together."* The sibling's next line (`**Sibling repo:** …`) is **not** part of it.

### 0.4 The "adapt the registry link" clause has no target (observation)

The supplied block contains no markdown links at all. The only registry link in the sibling's
neighbouring text is on its line 236, outside the block. **No adaptation is made.** The data repo's
registry link already reads `[README.md → Cross-repo contract registry]` at `CLAUDE.md:115` and is
untouched. Flagging rather than inventing a link.

### 0.5 `.claude/` is gitignored — the new agent file needs an inline changelog

`.gitignore:5` (and a duplicate at `:7`) ignores `.claude/`, so `plan-reviewer.md` has never been
tracked; its header comment says so and records changes inline because a diff cannot.
`implementation-reviewer.md` inherits the same problem, so §6 carries the same inline changelog
convention. Session 2 must not "fix" this by tracking the file.

### 0.6 Item 5 is a pointer (observation)

Per the correction: done-definition step 6 points at `## Workflow convention` for the hand-back
contract and does not restate the commit-SHA / files-touched / deviations / test-assertions list,
which the mirrored Session 2 bullet already carries. 121 bytes, not 214.

---

## 1. Files touched

| File | Change |
|---|---|
| `CLAUDE.md` | Six edits — §4.1 through §4.6 |
| `.claude/agents/implementation-reviewer.md` | New, §6. Untracked (`.gitignore:5`) — does not appear in the commit |
| `README.md` | One addition under `### GitHub Actions`, §5 |

Not touched, per constraint: `data-catalog.md`, `git-workflow.md`, `manifest.json`, any file under
`lib/`, `scripts/`, `bin/`, or any served data family.

---

## 2. Step sequence

1. `.claude/agents/implementation-reviewer.md` first (§6) — the mirrored block in §4.1 references
   it by path, and the repo should not carry a dangling reference even briefly.
2. `README.md` §5 — the destination for detail §4.2 removes, so the pointer resolves when it lands.
3. `CLAUDE.md` §4.1 → §4.6, in file order.
4. `npm test` — `test/claudeMdSize.test.mjs` is the gate.
5. `npm run smoke`.

---

## 3. Projected byte count

Measured per section by assembling the post-edit file:

| Section | Before | After | Δ |
|---|---|---|---|
| `# sleeper-dashboard-data` | 173 | 173 | 0 |
| `## Commands` | 2,273 | 2,200 | −73 |
| `## Navigation map` | 7,067 | 6,084 | −983 |
| `## Invariants` | 6,258 | 4,363 | **−1,895** |
| `## Cross-repo contract registry` | 1,084 | 921 | −163 |
| `## Sibling repo` | 435 | 435 | 0 |
| `## Workflow convention` | 3,257 | 3,590 | **+333** |
| `## Done-definition` | 556 | 677 | +121 |
| `## Session git workflow` | 1,090 | 922 | −168 |
| `## Self-maintenance` | 1,820 | 1,364 | −456 |
| **Total** | **24,013** | **20,729** | **−3,284** |

Without the four §7 dedupes (Commands, registry, git workflow, merged helper rows): **21,200**.
Headroom under the 25,000 ceiling goes from 987 to **4,271**.

---
## 4. Edits to `CLAUDE.md`

Line anchors are against the current 202-line file. Apply top-down; later anchors shift.

### 4.1 `## Workflow convention` — replace lines 131–165

Replaces the heading through the last line of `### The Claude.ai project`. Line 166 (blank),
167 (`---`) and 168 (blank) stay. **Paste verbatim** — the sibling carries identical text and
the two repos 'change together'. No registry-link adaptation is made (§0.4). Old: 3,251 bytes.
New: 3,584 bytes.

~~~markdown
## Workflow convention

**The standard loop is fully in-repo.** Planning, review, approval, implementation and
verification all happen in this repository against live source. Nothing in it waits on a
chat held outside it.

```
Session 1 (planning, opus)
→ plan-reviewer subagent ← plan gate
→ human approval
Session 2 (implementation, sonnet)
→ done-definition ← machine gate
→ back to Session 1 to verify ← judgment gate
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

The task file is the handoff artifact, not chat history. A planning session that edits source has
broken the handoff.

### Reviews

Two subagents, both read-only and both **advisory** — flags are reported verbatim and never
auto-applied. The human decides; the next step starts only after approval.

- **plan-reviewer** (`.claude/agents/plan-reviewer.md`) — end of Session 1, on the task file.
  Factual/mechanical, conformance to the Invariants, cross-repo intent.
- **implementation-reviewer** (`.claude/agents/implementation-reviewer.md`) — invoked by Session 1
  during verification, on Session 2's diff. Fidelity to the task file including scope beyond its
  touch list; conformance to invariants no test guards; whether new or changed tests assert real
  behaviour rather than having been bent green.

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
~~~

### 4.2 `## Navigation map` — replace the table rows, lines 43–79

The header, the three-line preamble and the table head (lines 35–42) are unchanged. Applies the
test in item 3: present tense, one or two lines, **retain gates, floors, `CR-NN` ids and
constants a session must not guess at**. What leaves, and where it goes:

| Row | Cut | Destination |
|---|---|---|
| `lib/panel.mjs` | `unfiltered they doubled every team denominator` — the fixed-bug narration | `git log`; the rule (`must` exclude `TEAM_<abbr>`) stays |
| `.github/workflows/` | the per-workflow reasons each standalone cannot delegate | README → GitHub Actions (§5) |
| `scripts/migrate-*.mjs` | dates and schemaVersion transitions | Invariant 1's pointer (§4.3) |
| `lib/cfbd.mjs` | the deterministic-byte ordering note | README → Module notes |
| `scripts/panel-run.mjs`, `scripts/check-crons.mjs`, `lib/backtest.mjs` | export lists | grep; they are not constants |
| `lib/args.mjs` | `not imported from lib/nflverse.mjs` | `MIN_CLI_YEAR = 1999`, the not-a-floor rule and CR-18 all stay |

Kept intact and deliberately still long: the twelve `MIN_*` names in `lib/nflverse.mjs` (floors,
CR-18 trigger sites), the self-calibrating threshold formula in `lib/validate.mjs`,
`KTC_ORDERING_THRESHOLD`, CR-15 on `lib/projectionFactors.mjs`.

**Session 2 override: three rows added, not in the original table.** `lib/seasonIngest.mjs`
(`runSeasonKeyedIngest`) is a live **CR-04 data-side trigger** — README.md:1245 names it as the
call five of the twelve `updateManifestEntry` registrars (`schedule`, `teamcontext`, `oline`,
`gamelogs`, `advstats`) now delegate through — and had no navigation-map row at all, in either the
old file or this plan's replacement table. Dropping it silently would violate this task's own
"retain every `CR-NN` id" constraint (§4.2's opening test), just applied to a row that was already
missing rather than one being cut. `lib/registry.mjs` and `scripts/registry-audit.mjs` (the
field-block parser and read-only CLI for the mirrored `<!-- CR-REGISTRY-BEGIN -->` region) are
likewise absent from every version of the map; added here as one row since one is a thin CLI
wrapper over the other, on the same "thin CLI, no logic of its own" precedent as the `bin/*.mjs`
row. None of the three carries a `§7`-style optional dedupe — they are additions, not folds.

Old: 6,745 bytes. New: 5,829 (5,762 with the §7.4 merged helper row) **before the three added
rows**; see the assembled file's `wc -c` in §8 for the actual final count including them.

~~~markdown
| `bin/*.mjs` | Thin CLIs — parse flags, dispatch to a `scripts/` adapter; no logic of their own. Entry points and modes: [Commands](#commands) |
| `bin/import-snapshot.mjs` | One-command projection-snapshot import (newest ~/Downloads export ZIP → manifest → commit + push); see [snapshot-workflow.md](snapshot-workflow.md) |
| `lib/args.mjs` | `bin/update.mjs` arg validation. `MIN_CLI_YEAR = 1999` is a typo bound, **not** a coverage floor (CR-18); `ALL_SUBCOMMANDS` = schedule/gamelogs/teamcontext/oline |
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
| `scripts/update-{roster,draft,playerids,advstats,schedule,gamelogs,teamcontext,playerstate,oline}.mjs` | Uniform family ingests — fetch, parse, dedup, write. `teamcontext`/`oline`/`playerstate` are TEAM- or date-keyed and read no crosswalk; the rest re-key to `sleeper_id` |
| `scripts/update-playerstats.mjs` | Single-fetch orchestrator — one `stats_player_week_<year>.csv` drives `updateAdvStats` + `updateGameLogs` under per-family throw isolation; emits `advstats_ok`/`gamelogs_ok` |
| `lib/nflverse.mjs` | nflverse fetch + CSV-parse helpers. **Coverage floors** (CR-18 trigger sites): `MIN_ROSTER_IDS`, `MIN_DRAFT_YEAR`, `MIN_PLAYERID_ROWS`, `MIN_ADVSTATS_ROWS`, `MIN_SCHEDULE_SEASON`, `MIN_SCHEDULE_GAMES`, `MIN_PLAYERGAME_ROWS`, `MIN_GAMELOG_SEASON`, `MIN_TEAMCONTEXT_ROWS`, `MIN_TEAMCONTEXT_SEASON`, `MIN_OLINE_ROWS`, `MIN_OLINE_SEASON`. `AY_PER_TARGET_MIN`/`MAX` is a plausibility **band**, not a floor |
| `scripts/grade-snapshot.mjs` | Grading adapter — loads snapshot + outcomes, builds GradeInput, orchestrates `lib/grade.mjs` |
| `scripts/backtest-run.mjs` | Backtest adapter (injectable loader; mirrors `scripts/grade-snapshot.mjs`) |
| `scripts/update-enrichment.mjs` | Enrichment upsert/validate/remove logic |
| `lib/grade.mjs` | Pure scorer — `scoreProjections(GradeInput) → GradeReport`; no I/O |
| `lib/backtest.mjs` | Pure backtest stats (standardized OLS, quintiles, team totals); no I/O. `isTeamAggregateId` is the `TEAM_*` pseudo-row filter |
| `scripts/panel-run.mjs` | Panel adapter (injectable loaders); owns the attribution-mode seam — `runFlipGate`, `runFit`, `assemblePanel` |
| `lib/panel.mjs` | Pure panel/fit logic — feature builders, forward-chain CV, ridge, spearman; no I/O. `buildTeamTotalsForSeason` **must** exclude `TEAM_<abbr>` pseudo-rows (mirror of app `isTeamAggregateId`) |
| `lib/projectionFactors.mjs` | Pure app-factor-multiplier reconstruction for R3-FIT — mirrors the app's leaf factor transforms and their input pipelines. **Cross-repo mirror contract (CR-15)** |
| `scripts/check-crons.mjs` | Dead-man detector for the scheduled workflows; monitoring only, no data-file I/O |
| `.github/workflows/` | Eight uniform weekly ingest jobs delegate to the reusable `_ingest.yml` (`workflow_call`) template. Four are deliberately **not** callers: `nflverse-playerstats.yml`, `weekly-ktc.yml`, `cron-deadman.yml`, `smoke-test.yml`. Triggers, per-job detail and why each standalone cannot delegate: README → [GitHub Actions](README.md#github-actions). Purge URLs: Invariant 8 |
| `nfl/`, `college/`, `ktc/`, `nflverse/`, `snapshots/` | Served data families — a section each in [data-catalog.md](data-catalog.md), schemas in README → [File schemas](README.md#file-schemas) |
| `ktc/quarantine/` | Scrapes rejected by the Spearman ordering guard — script-produced, **not** manifest-registered, **not** app-read; review and promote manually |
| `nflverse/playerids.json` | gsis_id→sleeper_id crosswalk — **internal-only**: read server-side by `update-advstats.mjs`/`update-gamelogs.mjs`, never by the app |
| `enrichment/` | The only hand-authored tree: coaching / scheme / injuries / notes, edited **only** via `bin/enrich.mjs` (Invariant 2) |
| `backtests/`, `grading/` | Analysis output from `--write`. The `<date>-*-verdict.md` reports are deliberately **unregistered** — a documented Invariant 3 exception |
| `manifest.json` | Index of every script-written file (Invariant 3) |
| `data-catalog.md` | Living dataset index — every ingest slice updates its family's row (Done-definition) |
| `raw/` | Unprocessed Sleeper API responses |
~~~

### 4.3 Invariant 1 — replace lines 87–89 (both exception paragraphs)

Line 85 (the invariant itself) is **unchanged** — the rule is not in scope. Lines 87 (F-24,
2026-08-24, 179 bytes) and 89 (E2 Phase B, 2026-09-03, 1,159 bytes) narrate finished rewrites:
row counts, a 7.6% figure, a proof-file path, a schemaVersion transition. All of it is `git log`
and `data-catalog.md` material and none of it changes what a session may do. Delete lines 87,
88 and 89; insert one indented line in their place. Old: 1,341 bytes. New: 198.

~~~markdown
   *Two documented one-off rewrites have landed under this invariant. What each changed, why, and the proof are in `git log` and in the affected family's row in [data-catalog.md](data-catalog.md).*
~~~

The `data-catalog.md` CFBD college stats row already carries the full E2 accounting, and
commit `2b06c5b` carries F-24's. **Neither file is edited** — this is a pointer at what is
already there.

### 4.4 Invariant 4 — replace line 95

Same test. The rule is *bump only on an incompatible layout change*, plus the app-ceiling
relationship and the snapshot carve-out — all kept. What goes is the dated narration of how each
family reached its current version (`F-24's idp_*/punt* stat-key prune, 2026-08-24`; `E2 Phase B,
2026-09-03 — the long-form row array became a pivoted player-keyed envelope`), now covered by
§4.3's pointer. **Current version numbers are the rule and stay.** Old: 930 (corrected from 929;
`wc -c` on line 95 including its trailing newline). New: 475.

~~~markdown
4. **schemaVersion discipline.** Current versions: NFL season-totals **v4**, CFBD college stats **v2**, projection snapshots **v2**, KTC snapshots **v1**. Bump `schemaVersion` only on an incompatible layout change, and raise the app's `MAX_SUPPORTED_SCHEMA` ahead of the bump, never after. That ceiling applies to every family the app reads through `tryDataStore`, not only season-totals; snapshots have no `tryDataStore` reader, so their schemaVersion is independent of it.
~~~

### 4.5 Invariant 5 — replace lines 97–101

**Invariant 5 carries no dated narration**, so the item-2 test finds nothing to cut on that
criterion. What it does carry is the `inProgress` rationale stated twice — once for
`players-state`, once for the nflverse families. Every rule survives verbatim in substance:
first-league-of-the-day-wins; content-hash dedup; quarantine is not primary data under
Invariant 2; the `newsUpdated`/`searchRank` dedup exclusion; `inProgress: false` for
`players-state`; KTC's marker is legacy, do not propagate; no code-enforced same-day lock;
nflverse families are never hand-edited; `inProgress: false` while the current-season file
mutates; the no-live-fallback reason; `lastModified` cache invalidation; do not change this to
`inProgress: true`. Old: 1,754 (corrected from 1,749; `wc -c` on lines 97–101 including their
trailing newlines). New: 1,457.

~~~markdown
5. **Snapshots are permanent.** Keyed by UTC date; never overwritten within a day (first-league-of-the-day-wins). KTC snapshots are append-only with content-hash dedup — no commit when content is unchanged. A scrape that fails the Spearman ordering guard is written to `ktc/quarantine/` (script-produced, unregistered, app-ignored) rather than `ktc/`, so a false trip never permanently loses data; it is not "primary data" under Invariant 2.

   `nfl/players-state/<date>.json` is date-keyed, append-only and content-hash-deduped like KTC (dedup excludes the churning `newsUpdated`/`searchRank`), but registers `inProgress: false` — each dated file is a completed, immutable capture. KTC's `inProgress: true` "current-value marker" is legacy; do not propagate it. As with KTC, a same-day re-run against changed upstream overwrites that day's file: dedup is the only check, there is no code-enforced same-day lock.

   **nflverse roster/draft/playerids/advstats/schedule/gamelogs/teamcontext/oline are script-produced primary data and must never be hand-edited.** They register **`inProgress: false` even while the current-season file mutates weekly** — a deliberate deviation from the `nfl/season-totals` convention, because the app has no live fallback for them and must get them from the store. Weekly mutability is handled by content-hash dedup here plus `lastModified`-driven cache invalidation app-side. Do not change this to `inProgress: true`.
~~~

### 4.6 `## Done-definition` — insert after line 176

A pointer, not a copy. The mirrored Session 2 bullet in §4.1 already carries the commit-SHA /
files-touched / deviations / test-assertions list; restating it here would create exactly the
duplication item 6 removes elsewhere. Steps 1–5 unchanged. +121 bytes.

~~~markdown
6. Hand back to Session 1 for verification — the hand-back contract is in [Workflow convention](#workflow-convention).
~~~

### 4.7 `## Self-maintenance` — replace lines 194–202

The mirror rule is stated in full at `CLAUDE.md:117` (`**Rule.** Any change touching a listed
contract **must emit that entry's `Mirror` text as Session 1 output**, in a `## Cross-repo
impact` section of the task file, quoting the `CR-NN` id`) and again, near-verbatim, in the
closing sentences of `## Self-maintenance`. The new-coupling routing is likewise stated at
`:119` and repeated here. **`## Cross-repo contract registry` is the canonical statement and is
not edited by this item**; `## Self-maintenance` becomes a pointer to it.

Also folded: the signal-registry trigger keeps its full trigger list semantics but loses the
nine-way family enumeration, which the navigation map and `data-catalog.md` both carry.
Old: 1,820. New: 1,364.

**Session 2 override:** the family enumeration is still cut, but `enrichment` stays named in the
rewritten sentence below (`"field, stat key, data source, or enrichment entry"`) rather than
dropping to a bare "ingested field, stat key, or data source." Enrichment is hand-authored, not
ingested (Invariant 2/6), and CR-18's data side is silent on `scripts/update-enrichment.mjs`
(§11) — leaving it unnamed here would read as excluding it from the signal-registry duty
entirely, not just trimming the enumeration.

~~~markdown
## Self-maintenance

**This file has a hard ceiling of 25,000 bytes, enforced by `test/claudeMdSize.test.mjs`.**
It is a navigation-and-rules layer, not a second README. A change that would breach the ceiling
**prunes in the same commit** — it does not raise the ceiling. Per-file detail belongs in README →
[Module notes](README.md#module-notes); per-family coverage in [data-catalog.md](data-catalog.md).
Nothing here records history — rows state what is true now, and `git log` holds the rest.

Keep this file current as part of every task's done-definition. If a change adds or renames a `bin/` subcommand, a `package.json` script, a data folder, a manifest field, or an enrichment/snapshot schema, update the relevant section in the same change.

When a change adds, removes, or alters the historical coverage of an ingested field, stat key, data source, or enrichment entry, update the family's row in [data-catalog.md](data-catalog.md) (this repo's storage registry) and note the change (Source / Historical coverage / Reconstructable-vs-ephemeral) in your task summary so the app repo can update the canonical signal registry at `docs/signal-registry.md`.

Contract changes follow the mirror rule in [Cross-repo contract registry](#cross-repo-contract-registry-with-sleeper-dashboard) — including the new-coupling case, which lands in both repos in the same change.
~~~

---

## 5. `README.md` — two additions and one citation repair

Under `### GitHub Actions` (README.md:1088), add the four standalone-workflow reasons §4.2
removes from the navigation map, so the pointer resolves to real content rather than to a
heading. Nothing else in README changes; the mirrored registry region is untouched.

~~~markdown
**Why four workflows are standalone rather than `_ingest.yml` callers.**

- `nflverse-playerstats.yml` — per-family conditional staging. One CSV fetch drives two families,
  and each is staged only if its own step output says it succeeded; the reusable template has no
  seam for that. This is an Invariant 3 safeguard: a failed family must not be registered.
- `weekly-ktc.yml` — its quarantine-alarm step runs after the ingest and inspects
  `ktc/quarantine/`. A `uses:` job body cannot carry additional steps, so delegating would drop
  the alarm.
- `cron-deadman.yml` — monitoring, not ingest. It writes no data file.
- `smoke-test.yml` — CI, not ingest. It writes no data file.
~~~

**5.2 `#### `lib/cfbd.mjs` — deterministic pivot output`, inserted before `#### `scripts/migrate-*.mjs``.**
Added after implementation-reviewer flagged that §4.2 routed the ascending-numeric-`playerId`
ordering note here but §5 added no destination, leaving it in neither doc. States the guarantee and
why it exists (deterministic written bytes, so a re-fetch in a different row order does not produce
a spurious rewrite/commit/CDN purge), and distinguishes it from `cfbdHash`, which is already
order-insensitive through `deepSortKeys`. Source of truth remains the JSDoc at `lib/cfbd.mjs:63-66`.

**5.3 Dangling citation repair at `README.md:1061-1062`.** The `migrate-college-pivot.mjs` bullet
cited *"Invariant 1's E2 Phase B exception in CLAUDE.md"*, which §4.3 deletes. Repointed at the
CFBD college stats row in `data-catalog.md`, which is where Invariant 1's new one-line pointer
sends the reader. `data-catalog.md` itself is not edited.

---

## 6. New file — `.claude/agents/implementation-reviewer.md`

Sibling of `.claude/agents/plan-reviewer.md` (9,561 bytes): same frontmatter fields, same
`Review depth` construction with the same `full`/`scoped` split and the same
"depth never licenses passing something you believe is wrong" clause, same three-part mandate
framing, same Bash-is-read-only paragraph, same advisory close, same fenced output contract with
a category list and the same "if both are empty, output exactly ..." terminator.

The mandate is this repo's, not a generic one. Named explicitly: **capture-only** (a skipped or
overwritten snapshot is unrecoverable — there is no upstream to re-fetch from), **append-only
discipline**, **manifest registration**, and **the union-resolve rule in `git-workflow.md`**,
including the removing-session variant and the grep-full-path-keys verification.

Tools `Read, Grep, Glob, Bash`; Bash restricted to read-only git inspection plus `npm test` /
`npm run smoke`. The prohibition names the actual write surfaces in this repo — `bin/update.mjs`,
`bin/enrich.mjs`, `bin/import-snapshot.mjs`, `scripts/update-*.mjs`, `scripts/migrate-*.mjs` —
and covers `--dry-run` too. Advisory; flags reported verbatim, never auto-applied.

Carries the inline changelog header per §0.5. 8,113 bytes.

~~~markdown
---
name: implementation-reviewer
description: Read-only reviewer for Session 2 diffs in the data repo — the verification gate. Invoke from the still-open Session 1 after Session 2 hands back, on the diff, never on the hand-back alone. Checks fidelity to the task file, conformance to invariants no test guards, and whether new or changed tests assert real behaviour.
tools: Read, Grep, Glob, Bash
model: opus
---

<!-- Changelog (this file is gitignored via .gitignore:5 and has never been tracked, so a diff
     cannot show what changed here — record it inline or it is unrecoverable).
     2026-09-04 · Created. Sibling of plan-reviewer.md; the verification half of the loop the
     mirrored CLAUDE.md → Workflow convention block describes. -->

You are an implementation reviewer for the sleeper-dashboard-data repo (Node.js ingest pipeline, append-only JSON served via jsDelivr CDN). A Session 2 has implemented a task file and handed back a commit SHA or diff range. Your job is to check what actually landed against what was planned, and against the rules no test enforces.

**Read the diff, never the hand-back alone.** A self-report cannot show what it left out. Start from the diff range named in the invocation (`git show <sha>` / `git diff <base>..<head>` / `git diff --stat`), then read the task file it implements — the one named in the invocation, or the most recently modified file in `.claude/tasks/` if none is named. Read live source only where the diff touches it.

If no diff range is supplied, say so and stop. Do not review a hand-back narrative as if it were a diff.

## Review depth

The invocation may set a depth. **Default to `full` whenever it is unset or you are unsure.**

**`full`** — run everything below at full strength. **Required, and not overridable, whenever the diff does any of:** add, rewrite or delete a file under `nfl/`, `college/`, `ktc/`, `nflverse/` or `snapshots/`; change an emitted shape, field, stat key or null semantics; move a `schemaVersion`; touch `manifest.json`; change a validator threshold or coverage floor; or edit the mirrored registry region of `README.md`.

**`scoped`** — permitted only when the diff touches **none** of the above: orchestration, CI, workflows, tests, docs, or refactors with no served-output change. In `scoped` mode, spend the saved effort on fidelity and on the mechanical risks specific to the change.

**Depth never licenses passing something you believe is wrong.** If a `scoped` review turns up something that needs full-strength verification, do that part at full strength and say so.

Your mandate has three parts. Run all three on every diff.

## 1. Fidelity to the task file

The task file is the contract. Flag ONLY divergence that matters:
- **Something specified that is not in the diff** — a step, an edit, a test, a doc row the plan called for and the diff does not contain. Absence is the failure this review exists to catch, and the hand-back is the least likely place to disclose it.
- **Something in the diff the task file did not specify.** Scope beyond the plan's touch list is a finding even when the extra change looks correct — it did not go through the plan gate. Name the file and what it does.
- **A specified thing implemented differently** — a different symbol, signature, file, ordering or data shape than the plan named, without the task file's own "settled decision" cover.
- **A deviation the hand-back did not disclose.** Compare the hand-back's list of files touched against `git diff --stat`. An undisclosed file is a finding in its own right, separately from whether its content is correct.

Do not re-litigate the plan itself. If the plan was wrong, that was plan-reviewer's gate; say so in one line and move on.

## 2. Invariant conformance — the rules no test guards

Read the `## Invariants` section of `CLAUDE.md` (the nine numbered Invariants under that heading) before judging — read it, do not rely on memory, do not restate it in your output. Then check the diff against the four risks that are specific to this repo and that `npm run smoke` cannot see:

- **Capture-only.** An ephemeral signal — depth chart order, injury designation, coaching staff, KTC values, `nfl/players-state` — exists only in the snapshot that captured it. A skipped, overwritten or de-duplicated-away snapshot is **unrecoverable**: there is no upstream to re-fetch it from. Flag any diff that widens a dedup exclusion, relaxes a same-day write, drops a scheduled capture, or treats a captured signal as backfillable.
- **Append-only discipline (Invariants 1, 2, 5).** Completed past seasons and dated snapshots are not rewritten. Flag a diff that writes over a completed-season file without the `--force` path and a committed rationale, hand-edits script-produced primary data, mutates a historical snapshot, or introduces a count-based change detector where content-hash idempotency is the rule.
- **Manifest registration (Invariant 3).** Every script-written file is registered with `recordCount`, `schemaVersion`, `lastModified` and `inProgress` maintained. Flag a new written path with no registration, a registration written before the data file it references, a field silently dropped, or an `inProgress` value that contradicts Invariant 5's family-by-family rule.
- **The union-resolve rule (`git-workflow.md`).** `manifest.json` conflicts resolve as a union of both sides; a session whose purpose is *removing* entries resolves as union-of-additions minus its own deletions. Flag any sign the diff resolved a manifest conflict by preferring one side wholesale — entries present before the range and absent after, with no removal in the task file's scope. Verify by grepping full-path keys with extension (`nflverse/advstats/2019.json`), not a bare fragment.

Flag by the specific invariant's number and name, or by `git-workflow.md` for the union rule.

## 3. Test honesty

A green run proves nothing about a test that was bent to be green. For every new or changed test in the diff:
- **What does it actually assert?** State it in one clause. A test that constructs the expected value from the same code path under test asserts nothing.
- **Was an existing assertion weakened rather than the code fixed?** A tightened threshold loosened, a case removed, an `assert.ok` softened to a truthiness check, a fixture regenerated from current output, a skip or `only` left in.
- **Does the change the diff makes have a test at all?** A new guard, floor, or emitted field with no assertion is a finding — name the untested behaviour.
- **Fixtures.** A committed fixture regenerated from the new behaviour is not a regression test. Flag it and say what the old fixture proved.

Run `npm test` and `npm run smoke` yourself and report red. A hand-back's claim that they passed is not evidence.

## Bash is for reading only

Use Bash for `git show`, `git log`, `git diff`, `git stat`, `sed -n`, `grep`, `npm test` and `npm run smoke`. **Never** edit, stage, commit, push, or write any file. **Never** run `bin/update.mjs`, `bin/enrich.mjs`, `bin/import-snapshot.mjs`, any `scripts/update-*.mjs` or `scripts/migrate-*.mjs`, or any command that fetches, writes a data file, or touches `manifest.json` — including with `--dry-run`. You are a verification gate, not an implementer, and this repo's data is append-only: a write from a reviewer is not undoable.

Do not apply fixes. Report and let the human decide.

## Output

Stay silent on solid work. Do not restate or summarize the diff. Do not rewrite it. Do not propose stylistic changes. Do not edit any file.

Output format:

```
FLAGS
FLAG [category]: <one-line problem> — <file:symbol or line anchor>
…

TESTS
<test name or path> — asserts: <one clause>; <weakened | new | unchanged>
…
```

Categories: `fidelity`, `scope-creep`, `undisclosed`, `invariant`, `capture-only`, `append-only`, `manifest`, `git-workflow`, `test-honesty`, `coverage-gap`. Omit `FLAGS` if there are none; omit `TESTS` if the diff adds or changes no test; if both are empty, output exactly "No blocking issues found." and nothing else.
~~~

---

## 7. Flagged dedupes — beyond the six items, human call

Each is the same duplication test item 6 applies, found in a neighbouring section. Together
they are **471 bytes** (21,200 → 20,729). Skipping any of them is safe; skipping all of them
still lands the six items.

**7.1 `## Commands` line 29 — 315 → 243 bytes (−73).** `offline analysis, read-only, not wired
into smoke` — `read-only` and the adapter relationship now sit in the `scripts/backtest-run.mjs`
and `scripts/panel-run.mjs` rows. The `--fit` pinning (`--basis half_ppr`,
`--attribution per-season-team`) is a constant a session must not guess at and stays, as does
`not the snapshot grader`. The parenthetical `(the app's live default, load-bearing for the
reconstruction)` goes to README → Module notes.

**7.2 `## Cross-repo contract registry` line 119 — 238 → 76 bytes (−163).** The sentence
`Introducing a genuinely new cross-repo coupling is the one residual case that routes to the
Claude.ai project — see [Workflow convention]` is now stated by `### The Claude.ai project`
inside the mirrored block. The load-bearing half — **a coupling that is not listed there does
not exist for review purposes** — stays.

**7.3 `## Session git workflow` line 182 — 344 → 177 bytes (−168).** This paragraph is the
rationale, and `git-workflow.md`'s opening paragraph states it in the same words.
`git-workflow.md` is **not edited** — the constraint holds. The five conflict-resolution rules
at lines 184–188 are untouched, because `git-workflow.md:9` names CLAUDE.md as where the rules
live.

**7.4 Navigation map — merge four one-line helper rows (−67).**
`lib/enrichment.mjs`, `lib/ktc.mjs`, `lib/manifest.mjs` and `lib/sleeper.mjs` carry no constant,
gate or contract between them. One row:

~~~markdown
| `lib/{enrichment,ktc,manifest,sleeper}.mjs` | Helpers — enrichment schema validation, KTC scraping, manifest read/write, Sleeper API fetch |
~~~

---

## 8. Tests

No new test. `test/claudeMdSize.test.mjs` already gates this change and needs no edit — the ceiling
stays at 25,000 and the file lands well under it.

| Check | Command | Expected |
|---|---|---|
| Size gate | `npm test` | green; passed at **21,155 bytes** — actual, `wc -c` after implementation. §3's 20,729 projection predates the Session 2 overrides (§9 correction, the follow-ups note, and the three §4.2 rows overrides 2–4 require); it was never re-derived per the instruction not to re-derive the aggregate. Still 3,845 bytes of headroom under the 25,000 ceiling |
| Byte count is exact | `wc -c CLAUDE.md` | 21,155 |
| Full suite | `npm test` | green — no source file changed, so nothing else should move |
| Smoke | `npm run smoke` | green |

Manual verification, no test:

1. **Mirror fidelity.** `diff <(sed -n '<new range>p' CLAUDE.md) <(sed -n '165,234p' ../sleeper-dashboard/CLAUDE.md)` shows only the two `*(app-only)*` bullets. Any other difference means the block was edited, which breaks the change-together contract.
2. **No dangling anchors.** Every `](#...)` and `](README.md#...)` in the new text resolves — `#workflow-convention`, `#invariants`, `#commands`, `#cross-repo-contract-registry-with-sleeper-dashboard`, `README.md#module-notes`, `README.md#github-actions`, `README.md#file-schemas`.
3. **`.claude/agents/implementation-reviewer.md` exists** and does not appear in `git status` (§0.5).
4. **Nothing lost from Invariant 5.** Read the twelve rules listed in §4.5 back out of the new text.

---

## 9. Cross-repo impact

**Correction (Session 2 override):** §9 as originally drafted said "no registry entry is
touched." That is wrong. §4.7 rewrites `## Self-maintenance`, and the signal-registry sentence it
rewrites is a named **data-side trigger** of `CR-18 · Signal registry rows` in the mirrored
registry (`README.md:1355–1361`). Quoted verbatim:

> #### CR-18 · Signal registry rows (`docs/signal-registry.md`) *(new — found by the completeness sweep, absent from both repos)*
> - **App side:** `docs/signal-registry.md` (the canonical rows), the signal-registry sentence in `CLAUDE.md` → *Self-maintenance*
> - **Data side:** the signal-registry sentence in `CLAUDE.md` → *Self-maintenance*, the Sibling-repo pointer in `CLAUDE.md` → *Sibling repo*, `data-catalog.md` (data-side storage index — its header explicitly says the app's registry is the field-level index and to *"link, don't merge"*), and any ingest that adds/removes/reclassifies a field, stat key or source — `scripts/update-*.mjs`, `lib/sleeper.mjs`, `lib/nflverse.mjs`
> - **Invariant:** every ingested field, stat key and source in the data repo has a current row in the app repo's `docs/signal-registry.md`, with its layer, source, historical coverage, reconstructable-vs-ephemeral status and current use accurate as of the change that touched it.
> - **Direction:** data→app
> - **Triggers:** `docs/signal-registry.md`  ‖  `data-catalog.md`, the signal-registry and Sibling-repo pointers in `CLAUDE.md`, the ingest scripts `scripts/update-{nfl,cfbd,ktc,roster,draft,playerids,advstats,schedule,gamelogs,teamcontext,playerstate,oline}.mjs`, the field-producing parsers/aggregators in `lib/nflverse.mjs` (`parseRosterCsv`, `parseDraftCsv`, `parsePlayerIdsCsv`, `aggregateAdvReceiving`, `parsePlayerGameLogs`, `parseSchedulesCsv`, `aggregateTeamContext`, `aggregateOlineStates`), `aggregateWeeks` in `lib/sleeper.mjs`, `lib/cfbd.mjs`, `lib/ktc.mjs`, and the **coverage-floor constants that encode historical coverage** — `MIN_DRAFT_YEAR`, `MIN_SCHEDULE_SEASON`, `MIN_GAMELOG_SEASON`, `MIN_TEAMCONTEXT_SEASON`, `MIN_OLINE_SEASON` in `lib/nflverse.mjs`
> - **Mirror:** This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

**No app-side edit is owed by this change.** CR-18's Mirror text obligates a row edit only "when a
data-repo change adds, removes or reclassifies an ingested field, stat key or source." §4.7
rewrites the *pointer sentence itself* — tightening its wording (folding the nine-way family
enumeration, per §7 below, while keeping `enrichment` named per override) — it does not touch any
ingested field, stat key, source, or their historical coverage. The app repo's copy of the
signal-registry sentence and Sibling-repo pointer are current and intact; nothing in
`docs/signal-registry.md` is stale as a result of this change. The trigger fires on this diff (it
touches a named site), but the Invariant it guards is unaffected, so the Mirror's row-edit
deliverable is empty for this change.

**The rest of §9's original analysis stands.** `README.md`'s addition (§5) is one subsection under
*GitHub Actions*, outside the `<!-- CR-REGISTRY-BEGIN -->` sentinels. The new untracked agent file
(§6) triggers no registry entry. Checked against all 21 entries' data-side triggers: besides
CR-18's `CLAUDE.md` sentence above, none names `CLAUDE.md`, `README.md` prose outside the mirrored
region, or `.claude/`.

**A documentation mirror is touched, and it is already satisfied.** The block in §4.1 declares
itself mirrored with the sibling's `CLAUDE.md` and states that the two change together. §0.3
verifies the sibling already carries this text, so **this change brings the data repo up to the
sibling and requires no app-side edit.** The two app-only bullets are absent here by design.

This is the direction the mirror is meant to work in: the data repo was the stale copy.

---

## 10. Out of scope — flagged, not done

- **The 19,000 target.** Not reached. §0.1 gives the measured gap and the three constraint-blocked
  levers. Reaching it is a human decision about which constraint to relax.
- **`.gitignore` has `.claude/` twice** (lines 5 and 7) and `.DS_Store` twice (4 and 6). Harmless,
  not this task's file.
- **`## Commands` line 31, the poisoned-snapshot window (2026-07-16 → 2026-07-18).** Dated and
  history-shaped, so item 2's test would cut it — but it is a live operational warning about
  snapshots still on disk and still ungraded, not a record of a finished rewrite. Kept.
- **`## Sibling repo` (435 bytes).** The sibling's copy folds this into a one-line trailer after
  the mirrored block. Not folded here, because the block as supplied stops before that line (§0.3)
  and the data repo's version carries the `docs/signal-registry.md` pointer the trailer does not.
- **`README.md` is 167,006 bytes.** Every "push detail to README" rule in this file points there.
  It has no ceiling and no test. Worth its own pass.

---

## 11. Follow-ups — pre-existing, out of scope

Three `registry-stale` gaps in CR-18's own trigger enumeration, found while verifying §9's
cross-repo impact against live source. All three are pre-existing (not introduced by this task)
and none is touched — this task edits no registry entry text. Recorded here so they aren't lost:

- **CR-18's data-side trigger list omits `scripts/update-playerstats.mjs`.** It is the orchestrator
  that drives `updateAdvStats`/`updateGameLogs` off one CSV fetch, both of which sit under
  CR-18's Invariant, but the entry's `scripts/update-{...}.mjs` enumeration (README.md:1360) does
  not include `playerstats` in the brace list.
- **CR-18's data-side trigger list omits `scripts/migrate-f24-prune.mjs`.** It reclassified
  historical coverage (dropped `idp_*`/`punt*` stat keys from every NFL season file, 2026-08-24) —
  exactly the kind of change CR-18's Mirror says should emit a `docs/signal-registry.md` row edit —
  but the trigger list names no `migrate-*.mjs` script at all.
- **CR-18's data-side trigger list omits `scripts/update-enrichment.mjs`.** Enrichment is a
  hand-authored signal source (Invariant 2/6) with its own `docs/signal-registry.md` classification
  concerns, but the entry's data-side prose and trigger list name only ingest scripts and
  `lib/nflverse.mjs`/`lib/sleeper.mjs` — not the enrichment writer.
