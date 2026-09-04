# Token-efficiency plan

Goal: cut Claude Code token cost in this repo via two independent workstreams.
Planning only — implementer applies. Two **independent** parts; ship A and B
separately if convenient.

Scope facts established during planning:
- `CLAUDE.md` is 218 lines / ~20 KB, auto-loaded every session.
- `README.md` is 869 lines (single file; **no `docs/` dir**) — canonical home for deep detail.
- `npm run smoke` emits **96 lines** on a green run; **39 of them (~41%)** are two
  per-iteration fetch-progress loops that carry no pass/fail signal.
- `npm run validate:enrichment` emits **5 lines** (one per enrichment type + summary) — already terse.

**Hard constraints (do not violate):**
- Do **not** remove, weaken, or reword any entry under `## Invariants` (CLAUDE.md:152–170)
  or `## Cross-repo contracts` (CLAUDE.md:174–193). Load-bearing, mirrored in the app repo.
- Do **not** add a Stop hook (none exists today; out of scope — see "Future items").
- This session edited no source/config/doc. All edits below are for the implementer.

---

# Part A — Trim CLAUDE.md back to "thin"

CLAUDE.md's own mandate (CLAUDE.md:218): "a navigation-and-rules layer, not a second
README; push deep detail into README.md and link to it." Audit finding: the file is
**mostly within scope** (Commands + Invariants + Cross-repo contracts + nav are all
legitimately "thin"). Drift is concentrated in three places: (A1) backtest *methodology
prose* inside Commands, (A2) over-stuffed Navigation-map Purpose cells that enumerate
function APIs / behavioral flows, and (A3) one sibling/self-maintenance duplication.
Realistic trim ≈ 13–16 lines, plus a re-thinning of the nav Purpose column to one-liners.

All Part A edits are in **one file: `CLAUDE.md`**. Nothing in README.md needs to be
*added* — every removed item already has a canonical home there (verified below). Leave
the Commands *command listings* themselves intact (commands are in-scope "thin"); only
the prose commentary is drift.

## File: `CLAUDE.md`

### A1 — Condense Backtest CLI prose (CLAUDE.md:72–86) — HIGH confidence
The command forms stay; the methodology prose is duplicated in README.

Remove/condense:
- The multi-line `--controls` explanation (CLAUDE.md:80–82). Canonical home:
  **README.md:855** (`## Analysis / Backtesting` → "Backtest CLI" flags line — the
  `--controls` semantics are stated there verbatim) and **README.md:825** (snapShare /
  pre-2020 panel).
- The `--validate` criteria restatement on CLAUDE.md:75/78. Canonical home: **README.md:829**
  and **README.md:846**.
- CLAUDE.md:86 entirely ("`--validate` runs on the snap-available ~2020–2024 panel …
  β ≈ +0.52, not the app-side +0.17 (different basis)"). Canonical home: **README.md:827–831**
  (`### D3 self-validation (--validate)`).

Before (CLAUDE.md:72–86):
```
### Backtest CLI — `bin/backtest.mjs`

```sh
node bin/backtest.mjs                         # standardized partial β of advstats metrics vs Y+1 PPG
node bin/backtest.mjs --metric M --position P # M: target_share|air_yards_share|wopr|racr|all (camelCase also accepted)
node bin/backtest.mjs --validate              # qualitative D3 trust check (β>0, own-rate β<0, monotonic, raw r>0)
node bin/backtest.mjs --write                 # persist backtests/<date>-<metric>-<pos>.json
# Flags: --from YYYY, --to YYYY, --min-games N, --by-season, --json, --write, --validate
# --controls overallShare,snapShare,rzOwnRate  (default: all three; comma-separated subset; dropping snapShare
#   recovers pre-2020 seasons at the cost of one control; --metric only, not --validate)
```

Offline analysis (read-only over advstats + season-totals); **not** wired into smoke; not the snapshot grader (that's `bin/grade.mjs`). npm shortcut: `npm run backtest`.

`--validate` runs on the snap-available ~2020–2024 panel (pre-2020 rows dropped — `off_snp` not tracked); measured β ≈ +0.52, not the app-side +0.17 (different basis).
```

After:
```
### Backtest CLI — `bin/backtest.mjs`

```sh
node bin/backtest.mjs                         # standardized partial β of advstats metrics vs Y+1 PPG
node bin/backtest.mjs --metric M --position P # M: target_share|air_yards_share|wopr|racr|all (camelCase also accepted)
node bin/backtest.mjs --validate              # qualitative D3 trust check
node bin/backtest.mjs --write                 # persist backtests/<date>-<metric>-<pos>.json
# Flags: --from YYYY, --to YYYY, --min-games N, --controls, --by-season, --json, --write, --validate
```

Offline analysis (read-only over advstats + season-totals); **not** wired into smoke; not the snapshot grader (`bin/grade.mjs`). npm shortcut: `npm run backtest`. Methodology, `--controls` semantics, and the β-basis caveats: README → [Analysis / Backtesting](README.md#analysis--backtesting).
```

### A2 — Condense over-stuffed Navigation-map Purpose cells — HIGH/MED confidence
The nav table is in-scope ("thin navigation"), but several Purpose cells have grown into
mini-docs that enumerate exported function names or behavioral flows. Condense each to a
one-line "what's in this path." **Preserve every symbol name referenced by an Invariant or
Cross-repo contract** (those rows are the discoverability target for the protected
sections): `MIN_ROSTER_IDS`, `MIN_DRAFT_YEAR`, `MIN_PLAYERID_ROWS`, `MIN_ADVSTATS_ROWS`,
`calculateFantasyPoints`, `RATE_KEYS`, `NFL_SENTINELS`, `KTC_TOP_QB_SENTINELS`. All listed
paths were verified to exist (no stale-nav removals; this is condensation only).

HIGH confidence (pure function-API / flow enumeration → README architecture/schema + code):
- **CLAUDE.md:120** (`lib/nflverse.mjs`) — drop the function-name list; keep the helper
  summary + the four `MIN_*` constant names.
  After: `| `lib/nflverse.mjs` | nflverse fetch + CSV-parse helpers (roster / draft / playerids / advstats); exports `MIN_ROSTER_IDS`, `MIN_DRAFT_YEAR`, `MIN_PLAYERID_ROWS`, `MIN_ADVSTATS_ROWS` sparsity constants |`
  Canonical home: README.md:275/301/326/365 (nflverse schema sections) + the source file.
- **CLAUDE.md:121** (`scripts/grade-snapshot.mjs`) — drop the `(in-basis via
  buildInBasisOutcomes for v2, half_ppr via buildHalfPprOutcomes for v1)` parenthetical.
  After: `| `scripts/grade-snapshot.mjs` | Snapshot adapter — loads snapshot + outcomes, builds GradeInput, orchestrates `gradeSnapshot()` / `runSelfTest()` / `formatHumanReport()` |`
  Canonical home: README.md:764–772 (`### Architecture`) + README.md:782–789 (`### In-basis grading`).
- **CLAUDE.md:122** (`scripts/backtest-run.mjs`) — drop the
  `normalizeMetric/normalizePosition/assembleCohort/runMetric/runValidate` list.
  After: `| `scripts/backtest-run.mjs` | Backtest orchestration adapter (injectable loader; mirrors `scripts/grade-snapshot.mjs`) |`
  Canonical home: README.md:808–857 (`## Analysis / Backtesting`) + source.
- **CLAUDE.md:125** (`lib/grade.mjs`) — drop the `mae, bias, pearson, scoreProjections` list.
  After: `| `lib/grade.mjs` | Pure scorer — `scoreProjections(GradeInput) → GradeReport`; no I/O |`
  Canonical home: README.md:770 (Architecture table, "Pure scorer" row).
- **CLAUDE.md:127** (`lib/backtest.mjs`) — drop the six-function list.
  After: `| `lib/backtest.mjs` | Pure backtest stats (standardized OLS, quintiles, team totals); reuses `pearson` from `lib/grade.mjs`; no I/O |`
  Canonical home: README.md:817–826 (`### Methodology`).

MED confidence:
- **CLAUDE.md:103** (`bin/import-snapshot.mjs`) — condense the ZIP→manifest→commit flow to a
  pointer (the flow is fully documented in the linked workflow file).
  After: `| `bin/import-snapshot.mjs` | One-command projection-snapshot import (newest ~/Downloads export ZIP → manifest → commit + push); see [snapshot-workflow.md](snapshot-workflow.md) |`
  Canonical home: snapshot-workflow.md + README.md:166 (`### snapshots/<date>.json`).
- **CLAUDE.md:105** (`lib/fantasyPoints.mjs`) — drop "ported from the app; mirrors its
  formula" (duplicates the Cross-repo contract at CLAUDE.md:191, which stays intact); keep
  the symbol names + a pointer to the contract.
  After: `| `lib/fantasyPoints.mjs` | Scoring dot-product (`calculateFantasyPoints`, `RATE_KEYS`); used by the grading in-basis path — see Cross-repo contracts |`
  Canonical home: CLAUDE.md:191 (the protected contract row) + README.md:782–789.

LOW / optional (marginal; skip if minimizing churn):
- **CLAUDE.md:104** (`lib/validate.mjs`) — drop the `findNonFinite` symbol (code-only, not
  referenced elsewhere); **keep** `NFL_SENTINELS` + `KTC_TOP_QB_SENTINELS` (Invariant 7
  discoverability). After: `| `lib/validate.mjs` | Schema validators (incl. season-totals finiteness sweep); contains `NFL_SENTINELS` and `KTC_TOP_QB_SENTINELS` |`

### A3 — De-duplicate signal-registry pointer (CLAUDE.md:201 vs 216) — LOW confidence
CLAUDE.md:201 (`## Sibling repo`) restates the "ingest-layer changes must be flagged for
`docs/signal-registry.md`" rule that `## Self-maintenance` (CLAUDE.md:216) already owns in
full. Reduce :201 to the location pointer and let :216 remain the single canonical
statement of the rule.
- Keep on :201: "The canonical signal/feature registry … lives in the app repo at
  `docs/signal-registry.md`."
- Remove from :201: "Ingest-layer changes here must be flagged for it (see Self-maintenance)."
  Canonical home: CLAUDE.md:216 (Self-maintenance) — internal cross-reference; README untouched.

### Part A — explicitly leave intact
- `## Invariants` (152–170) and `## Cross-repo contracts` (174–193) — protected; no edits.
- `## Done-definition` (205–210) — already thin rule list; keep.
- All Commands *command/flag listings* (the cheat sheet, lines 18–93 minus the A1 prose) — keep.
- `## Self-maintenance` (214–218) — keep (it is the canonical home for A3's rule).

---

# Part B — Quiet smoke fetch-progress (verbose → pass/fail + failure detail)

**Audit result:** `validate:enrichment` is already terse (5 lines) — **no change in Part B**.
`npm run smoke` is verbose at 96 lines, but the verbosity is **not** spread across stages —
each stage's summary is already ~1–4 lines of meaningful pass/fail + key metric. The noise is
two per-iteration fetch-progress loops:

1. **NFL week loop** — `lib/sleeper.mjs` `fetchSeasonWeeks`: 1 header + 18 `  Week N/18… NNNN players`
   lines = **19 lines** (smoke output lines 6–24).
2. **KTC page loop** — `lib/ktc.mjs`: `[ktc] Page N: … elements` + `[ktc] Page N: … rows, … new — total …`,
   two per page × 10 pages = **20 lines** (smoke output lines 47–66).

These carry no pass/fail signal. Everything else (validation results, aggregate counts, the
nfl diff, `[dry-run] would write`, errors) is the pass/fail + failure detail and **stays**.

**Approach (recommended): gate the two loops on `!dryRun`.** `smoke` runs nfl and ktc with
`--dry-run`, so threading the existing `dryRun` flag into the two fetch functions and
silencing per-iteration progress when `dryRun` is true makes smoke terse while leaving
**real ingests (weekly GitHub Actions, `npm run update:*`) fully verbose** — which is the
right behavior for CI logs of real writes. This needs **no new flag, no `package.json`
edit, no doc additions** (dry-run is already documented), and trips no Self-maintenance
trigger. Validation/diff/error lines are untouched, so failure detail is fully preserved.

> Alternative (only if interactive `--dry-run` progress must be preserved): add a global
> `--quiet` flag in `bin/update.mjs`, thread it the same way, and append `--quiet` to the
> nfl + ktc invocations in the `smoke` script. Costs one `package.json` edit + flag
> documentation in two places (Self-maintenance trigger). Not recommended — more surface,
> same output win.

Expected result: smoke **96 → ~57 lines** (−39, −41%), exit 0 unchanged; real runs unchanged;
`validate:enrichment` unchanged.

Edits grouped by file:

## File: `lib/sleeper.mjs`
- **:52** — change signature `export async function fetchSeasonWeeks(year)` →
  `export async function fetchSeasonWeeks(year, { dryRun = false } = {})`.
- **:53** — `console.log('[sleeper] Fetching … (18 weeks)…')`: gate behind `if (!dryRun)`.
- **:58** — `process.stdout.write(`  Week ${week}/18…`)`: gate behind `if (!dryRun)`.
- **:75** — `process.stdout.write(` ${entries.length} players\n`)`: gate behind `if (!dryRun)`.
- **:77** — the FAILED branch: **always print**, and make it self-contained (under dryRun the
  `:58` "Week N/18" prefix is suppressed, so the bare ` FAILED …` would lack context).
  Change `process.stdout.write(` FAILED (${err.message}) — skipping\n`)` →
  `console.warn(`[sleeper] Week ${week}/18 FAILED (${err.message}) — skipping`)`.
  (Minor cosmetic: in verbose mode this prints "Week N" twice on a failed week — acceptable;
  failures are rare and clarity wins.)

## File: `scripts/update-nfl.mjs`
- **:25** — `updateNfl({ year, force, dryRun })` already destructures `dryRun`; no change to signature.
- **:39** — `const weekData = await fetchSeasonWeeks(year);` → `await fetchSeasonWeeks(year, { dryRun });`.

## File: `lib/ktc.mjs`
- **:33** — `async function fetchPage(page)` → `async function fetchPage(page, dryRun = false)`.
- **:47** — `console.log('[ktc] Page ${page}: … div.onePlayer elements')`: gate behind `if (!dryRun)`.
- **:76** — `export async function fetchKtcSnapshot()` →
  `export async function fetchKtcSnapshot({ dryRun = false } = {})`.
- **:85** — `players = await fetchPage(page);` → `await fetchPage(page, dryRun);`.
- **:106** — `console.log('[ktc] Page ${page}: … rows, … new — total …')`: gate behind `if (!dryRun)`.
- **Keep always** (terminal/edge, ≤1 line each — failure/stop reasons): :87 (`Page N failed … stopping`),
  :92 (`Page N: no data — stopping`), :108 (`No new players — stopping early`),
  :109 (`Partial page — done`).

## File: `scripts/update-ktc.mjs`
- **:89** — `export async function updateKtc({ dryRun })` already destructures `dryRun`; no change.
- **:96** — `const players = await fetchKtcSnapshot();` → `await fetchKtcSnapshot({ dryRun });`.

## Part B — explicitly leave intact
- `validate:enrichment` (`scripts/update-enrichment.mjs` validate path) — already terse; no change.
- Every nfl/ktc stage-summary, validation, diff, `[dry-run] would write`, and `console.error`
  line — these are the pass/fail + failure detail.
- cfbd / roster / draft / playerids / advstats output — no per-iteration loops; already terse.
  (Minor optional follow-up, not planned here: cfbd repeats the row count across 3 lines per
  category — ~6 collapsible lines total. Low value; skip unless revisited.)

---

# Docs updates (README.md / CLAUDE.md — no docs/ dir)

- **Part A** is itself the CLAUDE.md doc edit (A1–A3 above). **README.md needs no additions** —
  every condensed/removed item already has a canonical home in README (citations inline above)
  or in `snapshot-workflow.md`. Confirmed sections exist: `## Analysis / Backtesting`
  (README:808), `### Architecture` (README:764), `### In-basis grading` (README:782), nflverse
  schema sections (README:275/301/326/365).
- **Part B (recommended `!dryRun` approach):** **no doc changes.** `--dry-run` semantics are
  already documented (CLAUDE.md:33; README:521/536-area; help text in `bin/update.mjs:83`) and
  the behavior ("dry-run validates quietly; real runs print full progress") needs no new prose.
  No new subcommand/script/flag/folder/manifest-field/schema → no Self-maintenance trigger.
- **Only if the `--quiet` alternative is chosen:** document `--quiet` in (a) CLAUDE.md Commands
  flags block (CLAUDE.md:32–34, alongside `--dry-run`/`--force`), (b) README OPTIONS / Update
  scripts (README:530–535 + help text in `bin/update.mjs:82–85`). This is a Self-maintenance
  trigger; the recommended approach avoids it.

---

# Tests to add (smoke / validation coverage — not Vitest)

**None to add.** `npm run smoke` is the coverage and its pass/fail semantics are unchanged.
Verification steps for the implementer (done-definition step 1):
1. Run `npm run smoke` → expect exit 0 and **~57 lines** (down from 96); confirm the NFL
   `Week N/18` block and the `[ktc] Page N` block are gone, while `[nfl] Validation passed`,
   `[nfl] Aggregated: …`, `[ktc] Fetched … players`, `[ktc] Validation passed`,
   `[ktc] [dry-run] would write …`, `[enrichment] All files valid.`, and
   `[grade] Self-test passed ✓` all remain.
2. Failure-path spot check (preserved-detail guarantee): temporarily force a validator to
   throw (or simulate a fetch failure) and confirm smoke still surfaces the error and exits 1.
3. Real-run progress unchanged: `node bin/update.mjs nfl --year 2023 --dry-run` is now quiet,
   but a non-dry-run keeps the `Week N/18` progress (no regression for CI/interactive ingests).
4. `npm run validate:enrichment` unchanged (5 lines).

---

# Cross-repo impact

**None.** Part A touches no Invariant and no Cross-repo contract entry, and every nav
condensation preserves the contract/invariant-referenced symbol names (`MIN_*`,
`calculateFantasyPoints`, `RATE_KEYS`, `NFL_SENTINELS`, `KTC_TOP_QB_SENTINELS`). Part B
changes only CLI stdout verbosity — no served file, manifest field, schema, or shared
constant — and the app does not consume this repo's CLI stdout. Nothing for the sibling
repo (`sleeper-dashboard`) to mirror.

---

# Future items (flagged, not planned here)

- **Stop hook:** none exists in this repo, so there is no per-turn output tax to fix (unlike
  the app's hook change). Explicitly **not** adding one. If a Stop hook is ever introduced,
  keep its output to a single pass/fail line — but that is a separate decision, out of scope.
- **cfbd per-category output** (~6 redundant lines): collapsible but low value; revisit only
  if smoke output is audited again.
