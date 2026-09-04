# Phase 4 — Update Scripts for the Data Store

> Deliverable destination: `.claude/tasks/phase-4-update-scripts.md` in the data repo (`/Users/antonwilms/Claude Projects/Sleeper Dashboard/sleeper-dashboard-data/`). This plan-mode file is identical content; on approval, copy into the data repo at that path.

## Context

Phases 1–3 stood up a longitudinal data store: the app exports IndexedDB to a sibling repo, reads cached NFL/CFBD JSON via jsDelivr, and falls back to live APIs only for in-progress data. Phase 4 closes the loop by making *adding new data* trivial, so the store actually keeps up with the season instead of bit-rotting:

- **Annual cadence** — at season's end (NFL Feb-ish, CFBD post-bowls), fetch the just-completed season and write completed-season JSON.
- **Weekly cadence** — KTC publishes *current values only*. Every week of delay is market-history data we can never recover. Building that history must start now, even before the app reads it.

Without scripts, "update the data store" is a manual browser-export ritual that requires the user's Mac to be on and the user to remember. We replace that with: one CLI per data type + one GitHub Action.

---

## Decisions

### 1. Scripts live in the data repo
The data repo (`sleeper-dashboard-data/`). Reasons:
- The CFBD key, when used for batch updates, is a secret of the *updater*, not the app. Storing it as a repo secret in the data repo keeps it co-located with the Action that uses it.
- GitHub Actions for "write to this repo" should run in this repo (uses `GITHUB_TOKEN` for same-repo commits — no cross-repo PAT needed).
- The data repo currently has zero tooling. Adding scripts there does not bloat the app's bundle, doesn't compete with Vite, and doesn't tempt anyone to import them at runtime.
- The only logic the script needs from the app is fantasy-points math — and decision 3 sidesteps that entirely.

### 2. Code sharing: don't share — sidestep
Rather than copy `calculateFantasyPoints` (drift risk) or publish a package (overkill), the update script uses Sleeper's already-canonical `pts_half_ppr` field. The app's scoring logic exists because *each user's league has unique scoring*. The data store needs a single, documented, deterministic value — and Sleeper's per-stat-line `pts_half_ppr` is exactly that. Zero shared code → zero drift.

If a future need ever requires arbitrary-scoring recomputation from the stored JSON, the right answer is to store **raw per-week stats** (which we already do in `stats`, but only as season totals) — that's a Phase 5+ schema change, not a Phase 4 scoring port.

### 3. Annual update: stats + canonical half-PPR points
**Verification** (from existing data): `nfl/season-totals/2023.json` for player `17` (kicker) shows `stats.pts_half_ppr: 124` alongside `fantasyPoints: 79`. These disagree, which proves the existing `fantasyPoints` field is whatever scoring the original exporter's league used — i.e., it's user-league-contaminated. The app's dataStore validator (`isValidSeasonTotals`) requires `fantasyPoints` to be present.

**Script writes:**
- `stats` — raw season totals from Sleeper, unchanged
- `gamesPlayed`, `gamesStarted`, `byeWeeks`, `dnpWeeks` — computed from per-week `gp` (matches app logic)
- `weeklyPoints` — `{ [week]: weeklyStats.pts_half_ppr ?? 0 }`
- `fantasyPoints` — `sum(weeklyPoints)`
- **New top-level sentinel:** `scoringBasis: "half_ppr"` on each player entry, so the app can later distinguish data-store points (canonical half-PPR) from in-app live points (user's league). This is additive and doesn't break the existing validator.

Missing `pts_half_ppr` (rare: stat lines with zero offensive production) is treated as `0`, documented in script comments. Deterministic.

### 4. KTC weekly: GitHub Action
- **Schedule:** `cron: "17 13 * * 1"` — Monday 13:17 UTC (~9:17am ET, well after KTC's overnight value updates). Off-the-hour to be polite to shared GHA runners.
- **Workflow:** checkout → setup-node → `npm ci` → `node scripts/update-ktc.mjs` → git-commit-if-changed.
- **Secrets:** none (KTC is public scrape).
- **Polite scrape:** sequential page fetches (0..9), 1.5s sleep between pages, descriptive `User-Agent: sleeper-dashboard-data/1.0 (+https://github.com/antonwilms/sleeper-dashboard-data)`. Check `keeptradecut.com/robots.txt` before first run.
- **Fail loudly:** error exit if total players < 250 OR if delta vs last snapshot > 30% of players (catches selector breakage masquerading as data).
- **Dedup:** hash normalized snapshot content; skip writing/commit if identical to most recent. Touch a `ktc/last-checked.json` so "ran, no change" is distinguishable from "didn't run."
- **Path:** `.github/workflows/weekly-ktc.yml` in the data repo.

### 5. CFBD API key
- **Local:** `.env` in data repo (gitignored — add `.env` to `.gitignore`). `CFBD_API_KEY=…`.
- **Action:** repo secret `CFBD_API_KEY`, surfaced as `env.CFBD_API_KEY` in the workflow step.
- **`.env.example`** committed showing required vars without values.

### 6. Manifest updates
The manifest is the contract between writer and reader. The script touches it in exactly one place: a `updateManifest({ path, recordCount, inProgress })` helper:

```
const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
manifest.schemaVersion ??= 1;
manifest.generatedAt = new Date().toISOString();
manifest.files[path] = {
  recordCount,
  inProgress,
  lastModified: new Date().toISOString(),
};
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 2) + '\n');
```

Notes:
- The existing manifest uses `inProgress` and `recordCount`. We add `lastModified` (additive, app ignores unknown fields).
- `inProgress: true` only for the current-year file. Completed-season files are always written with `inProgress: false`.
- One manifest write per script run, after all data files have been written and validated.

### 7. Script structure: one entry point, subcommands
Single `bin/update.mjs` with subcommands. Reasons: fewer files, shared utilities (`manifest.mjs`, `validate.mjs`, `io.mjs`) co-located, one help surface.

```
sleeper-dashboard-data/
  package.json
  .env.example
  .gitignore
  bin/
    update.mjs                  # CLI dispatcher
  scripts/
    update-nfl.mjs              # subcommand: nfl
    update-cfbd.mjs             # subcommand: cfbd
    update-ktc.mjs              # subcommand: ktc (also called by Action)
  lib/
    manifest.mjs                # read/write manifest.json
    sleeper.mjs                 # weekly stats fetch + gp logic
    cfbd.mjs                    # CFBD fetch + pivot
    ktc.mjs                     # KTC fetch + cheerio parse
    validate.mjs                # sanity checks
    io.mjs                      # JSON read/write with stable formatting
  .github/
    workflows/
      weekly-ktc.yml
      smoke-test.yml            # PR check: dry-run all scripts
```

CLI:
```
node bin/update.mjs nfl --year 2024
node bin/update.mjs cfbd --year 2024            # all three categories
node bin/update.mjs cfbd --year 2024 --category receiving
node bin/update.mjs ktc                          # always writes today's snapshot
node bin/update.mjs <any> --dry-run             # fetch + validate, no writes
node bin/update.mjs <any> --force               # overwrite completed-season file
```

### 8. Idempotency / re-runs
Safe-by-default:
- **In-progress year (current season):** silent overwrite. That's the point of `inProgress: true`.
- **Completed-season file already exists** (`inProgress: false` in manifest): refuse with a diff summary unless `--force`. Diff summary = "N players changed, top-5 diffs by abs(fantasyPoints delta)."
- **Identical output:** no-op, no manifest touch, exit 0 with "no change".
- **`--dry-run`:** fetch, transform, validate, *print diff summary*, but don't write. Used by the smoke-test workflow.

### 9. Sanity checks (in `lib/validate.mjs`)
Per data type, run after transform, before write. Throws with clear message → non-zero exit → red CI.

**NFL season totals:**
- Player count ≥ 400 (a season touches ~500–600 players including kickers/DST).
- At least 30 players have `gamesPlayed ≥ 14` (catches "only fetched 2 weeks" failures).
- Hardcoded sentinel players present for the year — e.g., for 2024: Lamar Jackson (`6783`) has `gamesPlayed ≥ 15`. List lives in `lib/validate.mjs` as `NFL_SENTINELS[year]`.
- Sum of all `fantasyPoints` is within ±20% of last completed season's total (catches scoring or aggregation regressions).

**CFBD per category:**
- Rows ≥ 500.
- All rows have non-null `playerId`, `statType`, `stat`.
- Distinct player count ≥ 200.

**KTC:**
- Players ≥ 250, ≤ 600.
- All positions in `{QB, RB, WR, TE, RDP}` present at non-trivial counts.
- All `value` integers in `[0, 9999]`.
- Top-10 by value contains ≥ 3 of `{Josh Allen, Patrick Mahomes, Jayden Daniels, C.J. Stroud, Joe Burrow, Lamar Jackson}` (rough sanity — list maintained near top of file).

---

## Scope

### In phase 4
- `update-nfl.mjs` — annual completed-season writer
- `update-cfbd.mjs` — annual completed-season writer, all three categories
- `update-ktc.mjs` — single snapshot writer
- `weekly-ktc.yml` — GitHub Action (this is the urgent one — every week missed is irrecoverable market history)
- `smoke-test.yml` — PR check that runs each script with `--dry-run` against a known year

### Deferred
- **App-side reading of KTC history.** Today the app reads only the latest KTC values (3-day TTL). Building UI/queries over historical snapshots is Phase 5 or 6 work and requires a separate manifest/index strategy for time-series data.
- **Backfill / rescoring of existing NFL files** to remove user-league-scoring contamination. The new sentinel `scoringBasis: "half_ppr"` makes a future migration tractable; doing the migration itself is one explicit run of `update-nfl.mjs --year YYYY --force` per year, but should be a separate, intentional task (and may want the app's render path updated first so old/new files coexist cleanly).
- **Retention/compression of old KTC snapshots.** At ~52/year, the repo grows ~50KB/week. Fine for years. Revisit when it crosses ~1000 snapshots.

---

## Critical files

**Read (already done in planning):**
- `sleeper-dashboard/src/api/sleeperStats.js` — `getSeasonTotals` is the algorithmic model for `update-nfl.mjs`. The script reimplements its weekly-aggregation loop in Node, using `pts_half_ppr` directly instead of `calculateFantasyPoints`.
- `sleeper-dashboard/src/api/cfbd.js` — `getBulkPlayerStats` shape is the output target. Script reuses the same `/stats/player/season?year=X&category=Y` endpoint.
- `sleeper-dashboard/src/api/ktc.js` — pagination loop and selectors translate to cheerio.
- `sleeper-dashboard/src/api/dataStore.js` — validators (`isValidSeasonTotals`, `isValidCFBDRows`) define the contract the script must satisfy.
- `sleeper-dashboard-data/manifest.json` — schema target.

**Create (new):**
- `sleeper-dashboard-data/package.json`
- `sleeper-dashboard-data/.gitignore` (add `.env`, `node_modules`)
- `sleeper-dashboard-data/.env.example`
- `sleeper-dashboard-data/bin/update.mjs`
- `sleeper-dashboard-data/scripts/update-{nfl,cfbd,ktc}.mjs`
- `sleeper-dashboard-data/lib/{manifest,sleeper,cfbd,ktc,validate,io}.mjs`
- `sleeper-dashboard-data/.github/workflows/{weekly-ktc,smoke-test}.yml`
- `sleeper-dashboard-data/README.md` updates (or new `SCRIPTS.md`) documenting usage

---

## Dependencies (package.json)

```json
{
  "name": "sleeper-dashboard-data",
  "type": "module",
  "private": true,
  "scripts": {
    "update": "node bin/update.mjs",
    "update:nfl": "node bin/update.mjs nfl",
    "update:cfbd": "node bin/update.mjs cfbd",
    "update:ktc": "node bin/update.mjs ktc",
    "smoke": "node bin/update.mjs nfl --year 2023 --dry-run && node bin/update.mjs cfbd --year 2023 --dry-run && node bin/update.mjs ktc --dry-run"
  },
  "engines": { "node": ">=20" },
  "dependencies": {
    "cheerio": "^1.0.0",
    "dotenv": "^16.4.0"
  }
}
```

Node 20+ for native `fetch`. No transitive bloat — cheerio is the only heavy dep, and only `update-ktc` imports it.

---

## Representative pseudocode: `update-nfl.mjs`

```js
import { fetchSeasonWeeks } from '../lib/sleeper.mjs';
import { readJson, writeJsonStable } from '../lib/io.mjs';
import { updateManifestEntry, readManifest } from '../lib/manifest.mjs';
import { validateNflSeason } from '../lib/validate.mjs';
import { diffSummary } from '../lib/diff.mjs';

export async function updateNfl({ year, force, dryRun }) {
  const path = `nfl/season-totals/${year}.json`;
  const manifest = readManifest();
  const existingEntry = manifest.files[path];
  const existing = existingEntry ? readJson(path) : null;

  // 1. Fetch — 18 weeks reg + playoffs handled by Sleeper's 'all' season-type pull.
  // Mirrors src/api/sleeperStats.js getSeasonTotals weekly loop.
  // 200ms delay per request, matches app behaviour.
  const weeks = await fetchSeasonWeeks(year);

  // 2. Aggregate. For each player, sum stats across weeks; track gp logic
  //    (gp===1 = played, gp===0 with team-on-bye = bye, else dnp).
  // 3. Compute weeklyPoints from each week's pts_half_ppr (?? 0).
  // 4. Compose entries with scoringBasis: "half_ppr".
  const totals = aggregateWeeks(weeks);

  // 5. Validate. Throws on failure → non-zero exit.
  validateNflSeason(totals, { year });

  // 6. Decide write.
  const inProgress = year >= currentNflSeason();
  if (existing && !inProgress && !force) {
    const summary = diffSummary(existing, totals);
    if (summary.identical) {
      console.log(`No change for ${path}.`); return;
    }
    throw new Error(
      `${path} already exists for a completed season. ` +
      `Diff: ${summary.text}. Pass --force to overwrite.`
    );
  }

  if (dryRun) {
    console.log(`[dry-run] would write ${path}: ${Object.keys(totals).length} players`);
    return;
  }

  // 7. Write atomically: temp file → rename.
  writeJsonStable(path, totals);

  // 8. Manifest.
  updateManifestEntry({
    path,
    recordCount: Object.keys(totals).length,
    inProgress,
  });

  console.log(`Wrote ${path} (${Object.keys(totals).length} players, inProgress=${inProgress}).`);
}
```

The CFBD script is the same shape but with `pivotStatRows`-style output (kept in row form on disk to match existing files). The KTC script skips the year/diff machinery and is keyed by today's date.

---

## GitHub Action: `.github/workflows/weekly-ktc.yml`

```yaml
name: Weekly KTC snapshot

on:
  schedule:
    - cron: "17 13 * * 1"  # Monday 13:17 UTC
  workflow_dispatch: {}

permissions:
  contents: write

jobs:
  snapshot:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci
      - name: Capture KTC snapshot
        run: node bin/update.mjs ktc
      - name: Commit if changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          if [[ -n "$(git status --porcelain)" ]]; then
            git add ktc/ manifest.json
            git commit -m "ktc: snapshot $(date -u +%Y-%m-%d)"
            git push
          else
            echo "No changes."
          fi
```

The smoke-test workflow runs on PRs and is the same shape minus the commit step, invoking `npm run smoke`.

---

## Setup steps (before first run)

1. In the data repo, create `package.json` and `npm install`.
2. Add `.env` locally with `CFBD_API_KEY=…` (mirror of the value in the app's `.env`).
3. Add the same value as a GitHub repo secret named `CFBD_API_KEY` under the data repo's Settings → Secrets and variables → Actions.
4. Confirm `keeptradecut.com/robots.txt` does not disallow `/dynasty-rankings`. If it does, stop and reconsider — don't ship the Action.
5. Enable Actions in the data repo settings.
6. Push the workflow files; verify `workflow_dispatch` runs cleanly before relying on the cron.

---

## Acceptance test

For each script type, run against a year that's already in the store. Output must be byte-identical (or near-identical with explainable diffs) to the existing file.

```bash
cd "sleeper-dashboard-data"
node bin/update.mjs nfl --year 2023 --dry-run
# Expect: "would write nfl/season-totals/2023.json: ~550 players"
# Expect: validation passes, sentinels found.

node bin/update.mjs nfl --year 2023
# Expect: refuses (completed season, file exists). Diff summary printed.

node bin/update.mjs nfl --year 2023 --force
# Expect: writes file. Diff against previous version should be limited to:
#   - scoringBasis field added on every entry (new)
#   - fantasyPoints / weeklyPoints rewritten to canonical half-PPR
#     (old values were user-league-contaminated)
#   - stats fields identical
# Confirm sentinel: player 6783 (Lamar Jackson) gamesPlayed === 17.

node bin/update.mjs cfbd --year 2023
# Expect: writes college/receiving/2023.json, college/rushing/2023.json,
#   college/passing/2023.json. Each is an array of normalized stat rows.
# Compare row count to existing files — should be ±2% (CFBD occasionally restates).

node bin/update.mjs ktc
# Expect: writes ktc/snapshot-YYYY-MM-DD.json with ~300–500 entries.
# Run twice in quick succession: second run should detect identical content
# and not produce a new commit (in CI; locally it overwrites today's file).
```

Final acceptance: trigger `weekly-ktc` workflow manually (`workflow_dispatch`), confirm green status and a commit appears on `main` from `github-actions[bot]`.
