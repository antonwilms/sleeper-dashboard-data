# Season-keyed jsDelivr purge URLs

**Type:** bug fix (CI workflows + one shared helper). Test-light, no data-shape change.
**Session model:** this file is the plan (opus). Implementation is a separate sonnet session — do not edit source from the planning session.

---

## Problem

The nflverse weekly Actions build their jsDelivr purge URL from the **calendar year**:

```yaml
YEAR=$(date -u +%Y)
curl -sf ".../nflverse/roster/${YEAR}.json" || true
```

But the data file they just wrote is keyed by the **NFL season**, resolved at runtime by
`fetchCurrentNflSeason()` (`lib/sleeper.mjs:28` → Sleeper `state.nfl.season`, with a Jan–Feb
calendar fallback only when the API is unreachable). The season rolls over ~March, so in the
**Jan–Feb window the two diverge**:

- `update-roster.mjs` writes `nflverse/roster/2025.json` (resolved season = 2025)
- the purge step purges `nflverse/roster/2026.json` (calendar year = 2026)

→ the file that actually changed is **never purged**; stale JSON can be served from the `@main`
CDN cache until jsDelivr's own TTL expires. The `manifest.json` purge (no year in the path) still
fires, which only *partially* masks the bug for app builds that cache-bust off
`manifest.lastModified`; a client reading the season file directly still gets stale bytes.

This is **not a corner case**: the roster job runs every Tuesday year-round, and (see below) its
commit+purge step fires *every* Tuesday — so every Tuesday in Jan–Feb mistargets the purge.

### Why roster purges every week (not just on content change)

`update-roster.mjs` rewrites `nflverse/last-checked-roster.json` with a fresh `checkedAt`
timestamp on the content-identical path (`update-roster.mjs:81-94`). That dirties the working
tree every run → the workflow's `if [[ -n "$(git status --porcelain)" ]]` guard is satisfied
→ commit + purge run weekly regardless of whether roster content changed. So the Jan–Feb
mispurge is hit on every Tuesday in that window.

`update-advstats.mjs` has **no** marker file; its identical path just returns
(`update-advstats.mjs:103-106`), leaving the tree clean → its purge fires only when advstats
content actually changes. The bug is identical in form; only the firing frequency differs.

---

## Scope audit — all workflow purge steps

| Workflow | Purge path (file key) | YEAR source | Verdict |
|---|---|---|---|
| `weekly-nflverse-roster.yml:41,43` | `nflverse/roster/${YEAR}.json` | `date -u +%Y` | **AFFECTED** — season-keyed path built from calendar year |
| `nflverse-advstats.yml:43,45` | `nflverse/advstats/${YEAR}.json` | `date -u +%Y` | **AFFECTED** — same |
| `nflverse-playerids.yml:42` | `nflverse/playerids.json` | — (no `YEAR`) | **Not affected** — path has no season component; one crosswalk file for all years |
| `nflverse-draft.yml:42` | `nflverse/draft/draft_picks.json` | — (no `YEAR`) | **Not affected** — single combined file, no season in path (also runs May 1, far from rollover) |
| `weekly-ktc.yml:43` | `ktc/snapshot-${SNAPSHOT_DATE}.json` | `date -u +%Y-%m-%d` | **Excluded (correct)** — date-keyed; `SNAPSHOT_DATE` *is* the file key, so calendar date is the right source |
| `smoke-test.yml` | — | — | **N/A** — CI; no commit, no purge step |
| every workflow's `manifest.json` purge | `manifest.json` | — | **Correct, leave as-is** — no season in path |

Confirmed by sweep: `grep -rn "purge.jsdelivr\|date -u +%Y\|\${YEAR}\|YEAR=" .github` returns only the
rows above. **Affected = roster + advstats** (exactly the two named in the brief; playerids/draft are
nflverse workflows but structurally immune because their served paths carry no season).

---

## Mechanism: surface the resolved season via `GITHUB_OUTPUT`

The resolved season must come from the **same** `fetchCurrentNflSeason()` call the script keyed the
file on — the YAML cannot re-derive it safely (re-running the Jan–Feb date heuristic in bash could
disagree with Sleeper's authoritative `state.nfl.season`, reintroducing a divergence). So node must
hand the season to the purge step. Three options:

1. **`GITHUB_OUTPUT` step output (CHOSEN).** Node appends `season=<year>` to `$GITHUB_OUTPUT`; the
   `Fetch …` step gets an `id`; the purge step reads `${{ steps.<id>.outputs.season }}`. Idiomatic
   GitHub Actions step-to-step value passing; **uniform** across roster + advstats via one shared
   helper; no coupling to committed data content; no-ops cleanly off-CI.
2. **Marker file the purge step reads.** Roster *already* writes `nflverse/last-checked-roster.json`
   containing `year` and `file` — for roster this needs zero node change (`jq -r .year`). But
   **advstats has no marker file**, so a uniform marker mechanism would require *adding* one to
   advstats (a new committed file + manifest/`git add` considerations), and the marker's `file`
   field is only present on the changed path, not the identical path. More invasive and
   content-coupled than option 1. Rejected for non-uniformity.
3. **stdout capture.** The `Fetch` and `Commit and purge` steps are separate, so this means either
   merging them into one big step or writing stdout to a temp file, then grepping a log line like
   `[roster] year=2025 | …`. Fragile log-format parsing — the exact silent-breakage class we're
   removing. Rejected.

**Decision: option 1.** Extract a tiny `setStepOutput()` helper (one place, unit-testable), call it
from both update scripts right after the season is resolved, and reference it from each purge step.

---

## Edits

### 1. `lib/io.mjs` — add `setStepOutput()` helper

`io.mjs` already does `import fs from 'fs';` (line 8), so `fs.appendFileSync` is in scope. Insert
this new export immediately **after `writeJsonStable` (after line 39)**, before `listDir`:

```js
/**
 * Surfaces a value to the GitHub Actions step-output file ($GITHUB_OUTPUT) so a
 * later step in the same job can read it as ${{ steps.<id>.outputs.<name> }}.
 * No-op outside Actions (GITHUB_OUTPUT unset), so local runs and `npm run smoke`
 * dry-runs are unaffected. Returns true iff a line was written.
 *
 * @param {string} name           Output name (e.g. 'season')
 * @param {string|number} value   Single-line value
 * @returns {boolean}
 */
export function setStepOutput(name, value) {
  const out = process.env.GITHUB_OUTPUT;
  if (!out) return false;
  fs.appendFileSync(out, `${name}=${value}\n`);
  return true;
}
```

Single-line integer value → plain `name=value` form is correct (no heredoc delimiter needed).

### 2. `scripts/update-roster.mjs` — emit the resolved season

Function: `updateRoster()`.

- **Import (line 26):** add `setStepOutput` to the existing `io.mjs` import:
  ```js
  // before
  import { readJson, writeJsonStable } from '../lib/io.mjs';
  // after
  import { readJson, writeJsonStable, setStepOutput } from '../lib/io.mjs';
  ```
- **Emit — immediately after the existing log line (after line 46):**
  ```js
    console.log(`[roster] year=${year} | currentSeason=${currentSeason}`);
    // Surface the resolved NFL season to the Actions purge step (no-op locally).
    setStepOutput('season', year);
  ```

Placement rationale: `year` is fully resolved at line 43 (`year = yearOpt ?? currentSeason`), which
is exactly the value in the `nflverse/roster/${year}.json` path. Emitting here (before any early
`return`) guarantees the season is available even on the content-identical path that still
commits+purges via the rewritten marker.

### 3. `scripts/update-advstats.mjs` — emit the resolved season

Function: `updateAdvStats()`. Structure is identical to roster at lines 42–46.

- **Import (line 29):** add `setStepOutput`:
  ```js
  import { readJson, writeJsonStable, setStepOutput } from '../lib/io.mjs';
  ```
- **Emit — after line 46:**
  ```js
    console.log(`[advstats] year=${year} | currentSeason=${currentSeason}`);
    // Surface the resolved NFL season to the Actions purge step (no-op locally).
    setStepOutput('season', year);
  ```

### 4. `.github/workflows/weekly-nflverse-roster.yml`

**(a) Give the fetch step an `id` (lines 28–29):**

```yaml
# before
      - name: Fetch nflverse roster
        run: node bin/update.mjs roster
# after
      - name: Fetch nflverse roster
        id: fetch
        run: node bin/update.mjs roster
```

**(b) Replace the calendar-year purge derivation (lines 40–43):**

```yaml
# before
            # Purge jsDelivr CDN cache so weekly freshness isn't stuck behind @main cache
            YEAR=$(date -u +%Y)
            curl -sf "https://purge.jsdelivr.net/gh/${{ github.repository_owner }}/sleeper-dashboard-data@main/manifest.json" || true
            curl -sf "https://purge.jsdelivr.net/gh/${{ github.repository_owner }}/sleeper-dashboard-data@main/nflverse/roster/${YEAR}.json" || true
# after
            # Purge jsDelivr CDN cache so weekly freshness isn't stuck behind @main cache.
            # SEASON is the NFL season resolved by the node step (Sleeper state.nfl.season) —
            # the year the roster file is keyed by. NOT the calendar year, which diverges
            # Jan–Feb. See scripts/update-roster.mjs (setStepOutput).
            SEASON="${{ steps.fetch.outputs.season }}"
            curl -sf "https://purge.jsdelivr.net/gh/${{ github.repository_owner }}/sleeper-dashboard-data@main/manifest.json" || true
            if [[ -n "$SEASON" ]]; then
              curl -sf "https://purge.jsdelivr.net/gh/${{ github.repository_owner }}/sleeper-dashboard-data@main/nflverse/roster/${SEASON}.json" || true
            else
              echo "WARN: season step-output empty; skipped season-keyed roster purge"
            fi
```

The `manifest.json` purge stays unconditional (always correct). The empty-`SEASON` guard is
belt-and-suspenders: the node step emits `season` before any early return, so a successful fetch
step always sets it (and a failed fetch step aborts the job before purge) — the guard only makes a
would-be silent mistarget visible in the log.

### 5. `.github/workflows/nflverse-advstats.yml`

**(a) Give the fetch step an `id` (lines 30–31):**

```yaml
# before
      - name: Fetch nflverse advstats
        run: node bin/update.mjs advstats
# after
      - name: Fetch nflverse advstats
        id: fetch
        run: node bin/update.mjs advstats
```

**(b) Replace the calendar-year purge derivation (lines 42–45):**

```yaml
# before
            # Purge jsDelivr CDN cache
            YEAR=$(date -u +%Y)
            curl -sf "https://purge.jsdelivr.net/gh/${{ github.repository_owner }}/sleeper-dashboard-data@main/manifest.json" || true
            curl -sf "https://purge.jsdelivr.net/gh/${{ github.repository_owner }}/sleeper-dashboard-data@main/nflverse/advstats/${YEAR}.json" || true
# after
            # Purge jsDelivr CDN cache. SEASON is the NFL season resolved by the node step
            # (the year the advstats file is keyed by), NOT the calendar year — they diverge
            # Jan–Feb. See scripts/update-advstats.mjs (setStepOutput).
            SEASON="${{ steps.fetch.outputs.season }}"
            curl -sf "https://purge.jsdelivr.net/gh/${{ github.repository_owner }}/sleeper-dashboard-data@main/manifest.json" || true
            if [[ -n "$SEASON" ]]; then
              curl -sf "https://purge.jsdelivr.net/gh/${{ github.repository_owner }}/sleeper-dashboard-data@main/nflverse/advstats/${SEASON}.json" || true
            else
              echo "WARN: season step-output empty; skipped season-keyed advstats purge"
            fi
```

> **Leave untouched:** `nflverse-playerids.yml`, `nflverse-draft.yml` (no season in path),
> `weekly-ktc.yml` (date-keyed, correct), and every `manifest.json` purge line.

---

## Tests to add

**Feasible and worth it — unit test for the helper.** New file `test/io.test.mjs` (the `node --test`
runner already wired as `npm test` picks up any `test/*.test.mjs`):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { setStepOutput } from '../lib/io.mjs';

test('setStepOutput: no-op + false when GITHUB_OUTPUT unset', () => {
  const prev = process.env.GITHUB_OUTPUT;
  delete process.env.GITHUB_OUTPUT;
  try {
    assert.equal(setStepOutput('season', 2025), false);
  } finally {
    if (prev !== undefined) process.env.GITHUB_OUTPUT = prev;
  }
});

test('setStepOutput: appends name=value (coerces number) and accumulates', () => {
  const prev = process.env.GITHUB_OUTPUT;
  const tmp = path.join(os.tmpdir(), `gho-${process.pid}-${Date.now()}`);
  process.env.GITHUB_OUTPUT = tmp;
  try {
    assert.equal(setStepOutput('season', 2025), true);
    setStepOutput('foo', 'bar');
    assert.equal(fs.readFileSync(tmp, 'utf8'), 'season=2025\nfoo=bar\n');
  } finally {
    fs.rmSync(tmp, { force: true });
    if (prev !== undefined) process.env.GITHUB_OUTPUT = prev;
    else delete process.env.GITHUB_OUTPUT;
  }
});
```

Pins: numeric→string coercion (`season=2025`), append/accumulate semantics, and the off-CI no-op +
`false` return. Save/restore of `process.env.GITHUB_OUTPUT` matters because the CI "Unit tests" step
runs with `GITHUB_OUTPUT` set — the `finally` blocks restore the real value so the helper test
doesn't leak into the runner's output file.

**Not feasible / out of scope:**
- A function-level test that `updateRoster`/`updateAdvStats` emit `season` would require mocking
  `fetchCurrentNflSeason()` (network) and the nflverse fetch — heavier than the value justifies; the
  pure-helper test covers the surfacing logic.
- **Workflow purge URLs are not smoke-covered.** `npm run smoke` / `smoke-test.yml` run update-script
  dry-runs + enrichment validate + grade self-test; they never render the workflow YAML, never set
  step `id` outputs, and never hit jsDelivr. Real verification is a **manual `workflow_dispatch`** of
  roster/advstats with the Action log inspected: confirm the emitted `season` and the rendered
  `…/nflverse/<kind>/<season>.json` purge URL match the committed file — ideally exercised once in
  the Jan–Feb window where calendar year ≠ season.

**Benign CI interaction to expect:** `smoke-test.yml` runs `advstats --year 2023 --dry-run`, which
will now call `setStepOutput('season', 2023)`. In CI `GITHUB_OUTPUT` is set, so the dry-run step
appends `season=2023` to its own step-output file. Harmless — that step has no `id` and no consumer.
(roster is not among the smoke-test dry-runs, so only advstats emits there.) Locally, `npm run smoke`
has `GITHUB_OUTPUT` unset → no-op.

---

## Docs updates

**README.md** — the GitHub Actions table (lines 556–563) and the CDN-purge note (line 590) describe
purges as "for changed files" but don't state the derivation, so nothing is factually wrong today.
Add one clarifying line so the season-keyed derivation is documented and the calendar-year form isn't
reintroduced. Recommended insertion right after the KTC dedup note (line 565):

> *Season-keyed purges (roster, advstats) derive the file's NFL season from the node update step via
> a `season` step-output (`GITHUB_OUTPUT`), not `date -u +%Y` — the two diverge in the Jan–Feb
> rollover window, so calendar year would purge the wrong season's file.*

**CLAUDE.md** — add a short note so the convention survives future edits (matches the file's
self-maintenance ethos). Two small touches:
- Under **Invariants**, a new bullet:
  > **CDN purge URLs for season-keyed files (`nflverse/roster`, `nflverse/advstats`) must be built
  > from the NFL season surfaced by the node step (`setStepOutput('season', …)` → `${{ steps.fetch.outputs.season }}`),
  > never `date -u +%Y`. Calendar year and resolved season diverge Jan–Feb; KTC is exempt (date-keyed).**
- Optionally extend the `lib/io.mjs` row in the Navigation map to mention `setStepOutput` alongside
  the JSON helpers.

No `docs/` directory exists in this repo — README.md + CLAUDE.md are the only doc targets.

---

## Cross-repo impact

**None.** The file-key scheme is unchanged — `nflverse/roster/<season>.json` and
`nflverse/advstats/<season>.json` are still written and served at the same paths the app reads over
the CDN (`src/api/nflRoster.js`, `src/api/advStats.js` via `tryDataStore`/`getManifestEntry`). Only
the **purge-URL derivation** changes, which is internal to this repo's CI. The manifest contract,
`lastModified`-driven cache invalidation, `MIN_ROSTER_IDS`/`MIN_ADVSTATS_ROWS`, and served JSON
shapes are all untouched. If anything the app benefits — in the Jan–Feb window the correct season
file is now actually purged, so the CDN stops serving stale roster/advstats bytes — but that requires
**no** app-side change. No signal-registry impact (no ingested field/source/coverage change).

---

## Implementation checklist (Session 2)

1. `lib/io.mjs`: add `setStepOutput()` after `writeJsonStable`.
2. `scripts/update-roster.mjs`: extend io import (line 26); add `setStepOutput('season', year)` after line 46.
3. `scripts/update-advstats.mjs`: extend io import (line 29); add `setStepOutput('season', year)` after line 46.
4. `.github/workflows/weekly-nflverse-roster.yml`: add `id: fetch`; swap purge derivation to `SEASON`.
5. `.github/workflows/nflverse-advstats.yml`: add `id: fetch`; swap purge derivation to `SEASON`.
6. Add `test/io.test.mjs`.
7. README.md + CLAUDE.md notes.
8. **Done-definition:** `npm run smoke` green (includes `npm test` → new `io.test.mjs`); `npm test`
   green. No manifest/data changes, so no manifest update needed. Workflow YAML is validated only at
   dispatch — call out in the PR summary that the real check is a `workflow_dispatch` log inspection
   of the rendered purge URL.
