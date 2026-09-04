# Tier 0 / A2 — missed-cron dead-man detector (schedule-driven, zero-config)

**Repo SHAs (verified against origin/main via GitHub MCP, 2026-07-18):**
data `a62b522092faf2cc848ad3e9917744e47527dfd4` · app `2185ef2f143cecb89b2e6b28d86cc8b3863958f3` (both in sync with origin/main).

**Type:** monitoring only. Writes no data files, touches no manifest, serves nothing. Protects
every scheduled capture (the 8 existing crons + the new A4/oline crons, automatically) from the
silent-loss mode that already cost two KTC Mondays (2026-05-25, 2026-06-08 — no run, no trace;
roadmap R0-CRON).

**Unit boundary (one line):** monitoring is its own unit regardless of capture scaffolding (per
the session brief) — it shares no fetch, schema, or manifest surface with A4/oline.

---

## 1. Design — the expected-job set IS the workflow files (auto-registration)

The brief requires the detector to read the expected-job set from config/manifest so new capture
jobs auto-register. **Resolution: the config is the schedule itself.** The detector enumerates
`.github/workflows/*.yml` in the checkout, extracts every `cron:` expression, and cross-checks
each scheduled workflow against the GitHub Actions API for run evidence. There is no second
registry to forget to update: the moment `weekly-playerstate.yml` / `nflverse-oline.yml` (or any
future cron) lands on main, it is covered. A separate config file was considered and rejected —
it recreates the drift problem A2 exists to catch.

**Run-evidence, not file-staleness.** The roadmap sketch (`today − max(ktc/snapshot-*) > 8 days`)
was file-based; rejected because content-hash dedup makes it false-positive-prone: a capture that
ran and found no change writes nothing (`update-ktc.mjs:184-193`, roster, teamcontext…). Run
evidence from the Actions API distinguishes "ran, no change" from "did not run" for every job
uniformly, with zero per-family knowledge.

**Checks per scheduled workflow** (all must hold, else red):
1. **Registered:** the local workflow file has a matching Actions-API workflow (matched on
   `path`).
2. **Enabled:** API `state === "active"`. This directly catches GitHub's 60-day
   `disabled_inactivity` auto-disable — the classic silent-kill of scheduled workflows — plus
   manual disables.
3. **Recent:** latest run (any event — a `workflow_dispatch` rerun counts as coverage, since
   what matters is that capture happened) has `created_at` within the cron's max-age window.
   No runs at all → red once the workflow's own API `created_at` exceeds the window (bootstrap
   grace for freshly added jobs).
4. **Healthy:** that latest run's `conclusion` ∈ {`success`, null (in progress)}. Catches
   ran-but-failed (e.g. a lost rebase-retry push). Note: a KTC quarantine trip deliberately
   fails its run (`weekly-ktc.yml:49-53`) — the detector will re-flag it daily until resolved;
   that is correct behavior (a quarantine needs human review anyway).

**Cadence classification** (pure function over the 5-field cron; malformed → throw = red):

| Pattern | Kind | maxAgeDays |
|---|---|---|
| day-of-week field ≠ `*` | weekly | 8 (7 + 1 grace — matches the roadmap's ">8 days") |
| day-of-month ≠ `*` AND month ≠ `*` | yearly | 368 (covers `nflverse-draft.yml`'s `0 12 1 5 *`) |
| day-of-month ≠ `*` | monthly | 33 |
| otherwise | daily | 2 |

Multiple crons in one workflow → maxAge = min over them. `smoke-test.yml` has no cron
(pull_request only) → naturally out of scope; no exemption list needed. The detector's own
workflow has a cron and is deliberately **not** excluded: it self-checks for free.

**Failure-domain honesty (stated limitation):** the detector runs inside GitHub Actions — the
same system it monitors. Mitigations: (a) daily cadence (a single skipped scheduler tick
self-heals next day); (b) a `push` trigger on main, so any human push (most working sessions —
the Session git workflow ends in a push) re-fires the check even if *all* crons are dead — note
GitHub does not fire `push` workflows for pushes made with `GITHUB_TOKEN`, so Action data-pushes
don't recurse (documented behavior, and desirable); (c) check 2 catches the auto-disable state
directly. Residual risk — a total, silent, multi-day Actions-scheduler outage with no human push
— is accepted and documented in the README section (§Docs).

**Surfacing a miss (repo-convention mechanism):** non-zero exit → red run → GitHub's default
failure notification to the repo owner, plus `::error::` annotations per finding (the
`weekly-ktc.yml:49-53` quarantine precedent) and a markdown table appended to
`$GITHUB_STEP_SUMMARY`. No auto-issues, no external services — consistent with the repo's
existing alerting (red CI is the alarm).

---

## 2. Implementation — edits grouped by file

### NEW `scripts/check-crons.mjs` (all logic; pure where possible, I/O injected)

```js
/** Parse one workflow YAML text for cron expressions (regex: /^\s*-\s*cron:\s*["']([^"']+)["']/gm).
 *  No YAML dependency (repo deps are cheerio + dotenv only); the quoted-cron-line convention
 *  holds for all 8 existing workflows. Pure. */
export function extractCrons(yamlText)                       // → string[]

/** List scheduled workflows from a workflows dir (default '.github/workflows' via listDir).
 *  Reads each *.yml / *.yaml; keeps those with ≥1 cron. */
export function listScheduledWorkflows(dir?)                 // → [{ file, path, crons }]

/** Classify a 5-field cron per the §1 table. Throws on malformed input. Pure. */
export function cronCadence(cronExpr)                        // → { kind, maxAgeDays }

/** Evaluate one workflow against API evidence. Pure — `now` injected.
 *  status ∈ 'ok' | 'ok-bootstrap' | 'unregistered' | 'disabled' | 'missing-run' | 'stale' | 'failed' */
export function evaluateWorkflow({ local, apiWorkflow, latestRun, now })  // → { status, detail, maxAgeDays }

/** Orchestrator. fetchImpl injected for tests. ~1 + N API calls (N ≈ 10 workflows):
 *    GET /repos/{repo}/actions/workflows?per_page=100          (match by .path)
 *    GET /repos/{repo}/actions/workflows/{id}/runs?per_page=1  (latest run, any event)
 *  Auth: Bearer ${token}; Accept: application/vnd.github+json.
 *  Returns { results, failures } and writes the human report (console + ::error:: lines +
 *  appendStepSummary markdown table: workflow | cadence | last run | conclusion | status). */
export async function runDeadman({ repoFullName, token, now = new Date(), fetchImpl = fetch })
```

### NEW `bin/deadman.mjs` (thin CLI, repo bin-convention)

```js
// Reads GITHUB_REPOSITORY + GITHUB_TOKEN (local use: GITHUB_REPOSITORY=antonwilms/sleeper-dashboard-data
// GITHUB_TOKEN=$(gh auth token) node bin/deadman.mjs). Calls runDeadman; prints report;
// process.exit(failures.length ? 1 : 0). No flags. Fails fast with a clear message if either
// env var is missing.
```

### `lib/io.mjs` — one new helper

After `setStepOutput` (lines 51–56), mirroring its no-op-outside-Actions posture:

```js
/** Append markdown to $GITHUB_STEP_SUMMARY; no-op when unset (local runs). Returns true iff written. */
export function appendStepSummary(markdown)
```

### NEW `.github/workflows/cron-deadman.yml`

```yaml
name: Cron dead-man detector

on:
  schedule:
    # Daily 05:19 UTC — quiet slot, well clear of the 13:xx-14:xx capture crons; a missed
    # scheduler tick self-heals the next day.
    - cron: "19 5 * * *"
  push:
    branches: [main]   # human pushes re-arm the detector even if all crons are dead;
                       # GITHUB_TOKEN pushes from capture Actions do not trigger this (no recursion)
  workflow_dispatch: {}

permissions:
  contents: read
  actions: read

jobs:
  deadman:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - name: Install dependencies
        run: npm ci
      - name: Check scheduled captures ran
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: node bin/deadman.mjs
```

(`GITHUB_REPOSITORY` is provided by the runner automatically.)

### Step sequence

1. `extractCrons` / `listScheduledWorkflows` / `cronCadence` / `evaluateWorkflow` (pure, with
   tests as you go) → 2. `runDeadman` + `appendStepSummary` → 3. `bin/deadman.mjs` →
4. local run with `gh auth token` — expect all 8 current workflows `ok` (or real findings —
   report them, don't paper over) → 5. tests green under `npm test` → 6. workflow file →
7. docs → 8. commit/push per Session git workflow (no purge — no served files) →
9. `workflow_dispatch` once; confirm green run + step summary table renders.

**Ordering note:** lands second (after A4, before oline — `tier0-ordering.md`). Zero coupling:
if it lands before either capture, they auto-register on merge; if after, same.

---

## 3. Docs updates

**CLAUDE.md**
- Navigation map: rows for `scripts/check-crons.mjs`, `bin/deadman.mjs`,
  `.github/workflows/cron-deadman.yml` ("daily dead-man check: every scheduled workflow must
  have a recent successful run; red = a capture silently missed").
- Commands: add a one-line `node bin/deadman.mjs` entry (env-vars note) near the other bin CLIs
  (after the Panel CLI block, ~line 107).
- No invariant changes; no smoke-line change (network + token — not a smoke concern; `npm test`
  covers the logic).

**README.md**
- GitHub Actions section (line 826): add the detector row + a short paragraph: what it checks
  (the four §1 checks), the cadence table, the auto-registration property ("any new workflow
  with a `cron:` line is covered on merge — do not add a parallel job registry"), and the stated
  residual-risk limitation.

**data-catalog.md** — none (no served family). Explicitly: the detector writes nothing.

## 4. Tests to add

`test/deadman.test.mjs` (`node --test`; no network — `fetchImpl`/`now` injected):

| Check | Input | Expected |
|---|---|---|
| extractCrons | weekly-ktc.yml-style text; multi-cron text; no-cron (smoke-test.yml-style) text | `["17 13 * * 1"]`; both crons; `[]` |
| cronCadence weekly | each of the 8 real cron strings (hardcoded in fixture) | 7 weekly / 1 yearly, correct maxAgeDays |
| cronCadence daily/monthly | `"19 5 * * *"`, `"0 3 15 * *"` | daily:2 / monthly:33 |
| cronCadence malformed | `"not a cron"`, 4-field string | throws |
| evaluateWorkflow ok | run 2 days old, success, weekly | `ok` |
| evaluateWorkflow stale | run 9 days old, success, weekly | `stale` |
| evaluateWorkflow failed | run 1 day old, conclusion `failure` | `failed` |
| evaluateWorkflow in-progress | latest run conclusion null | `ok` |
| evaluateWorkflow disabled | API state `disabled_inactivity` | `disabled` |
| evaluateWorkflow unregistered | no API workflow for path | `unregistered` |
| evaluateWorkflow bootstrap | no runs, API created_at 1 day ago, weekly | `ok-bootstrap` |
| evaluateWorkflow never-ran | no runs, API created_at 30 days ago, weekly | `missing-run` |
| runDeadman end-to-end | injected fetch fixtures: 2 workflows, one stale | `failures.length === 1`; summary table mentions both |
| Self-coverage | `listScheduledWorkflows('.github/workflows')` against the real repo dir | includes `cron-deadman.yml` itself + ≥ 8 others once all Tier 0 units land (assert ≥ 9 at implementation time against the then-real set) |

Smoke (`npm run smoke`): no addition — say so explicitly (needs a token + live API; the unit
suite above runs in `npm test`, which `smoke-test.yml` already executes).

## 5. Cross-repo impact

**None.** No served file, no manifest touch, no app-visible surface. (If the app repo ever grows
its own scheduled workflows, this detector does not cover them — repo-scoped by design; noted
here so the sibling repo doesn't assume coverage.)

## 6. Explicitly out of scope

- Staleness of the **manual** projection-snapshot import (`snapshots/` — `bin/import-snapshot.mjs`
  is user-run, not a cron). The audit's "snapshot-import stall" concern is real but is a separate
  roadmap item; folding a manual-process monitor into a cron detector would blur its contract.
  Flagged for the roadmap, not planned here.
- Auto-creating issues, re-enabling disabled workflows, or retrying missed captures — surface
  only; humans act.
- The A1/ktcHist app-repo fix (separate session per the brief).
