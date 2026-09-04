# Tier 0 / oline — OL composition forward capture from nflverse depth charts (capture-only)

**Repo SHAs (verified against origin/main via GitHub MCP, 2026-07-18):**
data `a62b522092faf2cc848ad3e9917744e47527dfd4` · app `2185ef2f143cecb89b2e6b28d86cc8b3863958f3` (both in sync with origin/main).

**Type:** capture-first banking. New year-keyed nflverse served family holding per-team,
per-week offensive-line composition (slot + rank), derived from the nflverse `depth_charts`
release. **NO consumer, enrichment step, or scoring path reads it** — capture-only on arrival
(roadmap R0-OLINE; capture-only doctrine per `data-catalog.md` header).

**Unit boundary (one line):** nflverse-sourced, year-keyed, TEAM-keyed rebuild-from-upstream
family mirroring `update-teamcontext.mjs` — nothing shared with A4's Sleeper fetch or date-keyed
append-only pattern beyond repo-wide libs that already exist.

**Source decision (evidence, verified live 2026-07-18):**
- **Sleeper rejected:** its 510 OL records carry a generic `depth_chart_position: "OL"` and
  **zero** carry `depth_chart_order` — no slots, no ordering, no composition signal.
- **nflverse `depth_charts` chosen:** ESPN-fed, slot-level. 2026 file live (updated through
  2026-07-18, 118 distinct capture days since 2026-03-22); offense rows carry
  `pos_abb ∈ {LT, LG, C, RG, RT}` with `pos_rank` 1..n; spot-check reproduces PHI's and SF's real
  starting fives. Team codes match the schedule/season-totals domain exactly (32 codes incl.
  `LA`, `WAS`, `JAX` — verified; no era remap needed for the ESPN era).
- **Loss clock is SOFT (this is why oline lands third — see `tier0-ordering.md`):** upstream
  retains every dated state inside the yearly file (2025 file: 221 distinct `dt` per team,
  spanning 2025-08 → 2026-03). A missed week is recoverable from upstream, unlike A4. Forward
  capture still starts now per the roadmap; retention upstream is not contractual.
- **Schema-era floor:** `depth_charts_2024.csv` (and earlier) use the legacy NFL-feed schema
  (`season,club_code,week,…,depth_position`) — different columns entirely. The ESPN `dt` schema
  begins with the 2025 file. **`MIN_OLINE_SEASON = 2025`**; pre-2025 backfill would need a
  second parser and is out of scope (reconstructable later, zero loss risk).

**Relation to `enrichment/oline.json` (`.claude/tasks/context-instability-capture.md`):** that
plan captures a *hand-authored preseason judgment* per (year, team); this unit captures the
*mechanical weekly ESPN depth chart* per (team, week). Different grain, different provenance,
different path (`nflverse/oline/` vs `enrichment/oline.json`) — no collision. This unit does not
reopen or modify that plan; if the mechanical series later reduces the judgment slice's value,
that is a roadmap call, not this slice's.

---

## 1. Snapshot schema (exact shape)

New family: **`nflverse/oline/<year>.json`** — year-keyed, TEAM-keyed (second team-keyed family
after teamcontext; no crosswalk read, no Action-ordering dependency). Rebuilt from upstream each
run; content-hash dedup; `--force` required to overwrite completed past seasons; `inProgress:
false` always (Invariant 5).

Captured rows: upstream offense rows with `pos_abb ∈ {LT, LG, C, RG, RT}` — **all ranks kept**
(starters and depth; rank is data, don't pre-filter). Skill/defense/ST rows are dropped: skill
depth is already banked (app snapshots + A4 weekly), defense/ST are out of the dashboard's
scope, and the trim is loss-free (upstream archives the full chart).

**Weekly reduction:** upstream is near-daily. One state per (team, ISO-week): bucket rows by
`isoWeekKey(dt)`; within a bucket keep only rows from the **max `dt`** (the week's latest chart).
Loss-free reduction — the daily grain stays recoverable upstream. "Per team/week" is the stated
capture grain of this item.

```json
{
  "schemaVersion": 1,
  "season": 2026,
  "generatedAt": "2026-07-18T14:37:20.000Z",
  "source": "nflverse depth_charts (ESPN feed)",
  "rowCount": 6812,
  "teamCount": 32,
  "stateCount": 544,
  "teams": {
    "SF": {
      "states": [
        {
          "week": "2026-W29",
          "date": "2026-07-18",
          "dt": "2026-07-18T08:46:51Z",
          "ol": [
            { "slot": "LT", "rank": 1, "name": "Trent Williams",  "gsisId": "00-0027857", "espnId": "3116365" },
            { "slot": "LG", "rank": 1, "name": "Robert Jones",    "gsisId": "00-0036596", "espnId": "4051305" },
            { "slot": "C",  "rank": 1, "name": "Jake Brendel",    "gsisId": "00-0032701", "espnId": "2578355" },
            { "slot": "RG", "rank": 1, "name": "Dominick Puni",   "gsisId": "00-0039351", "espnId": "4429795" },
            { "slot": "RT", "rank": 1, "name": "Colton McKivitz", "gsisId": "00-0036256", "espnId": "3921690" },
            { "slot": "LT", "rank": 2, "name": "Austen Pleasants","gsisId": "00-0035829", "espnId": "3912092" }
          ]
        }
      ]
    }
  }
}
```

Field semantics:
- `week` — ISO-8601 week key of `dt` (`YYYY-Www`); `date`/`dt` — the chosen (max) upstream
  timestamp for that week. States sorted ascending by `dt`; `ol` sorted slot order
  (LT,LG,C,RG,RT) then `rank`.
- `gsisId` — **verbatim string, format NOT validated**: UDFAs carry non-gsis placeholder ids
  (observed `"WIL597533"`, `"CRU840186"`). Null when upstream empty. Same for `espnId`.
- **No sleeper_id re-key** — OL are largely absent from the DynastyProcess crosswalk
  (fantasy-oriented); joins are name/gsis-based later if ever needed. Keeps the family free of
  the playerids Action-ordering dependency (teamcontext precedent).
- `rowCount` = total `ol` entries across all states (= manifest `recordCount`);
  `stateCount` = total (team, week) states.

**Forward-stability:** additive-only within schemaVersion 1; changing the reduction rule, slot
set, or rank coverage ⇒ bump to 2. Bye/offseason weeks with no upstream `dt` are simply absent
states (honest-nulls convention — never fabricated).

**Manifest entry** (auto via `updateManifestEntry`):

```json
"nflverse/oline/2026.json": {
  "schemaVersion": 1,
  "recordCount": 6812,
  "inProgress": false,
  "lastModified": "2026-07-18T14:37:22.000Z"
}
```

**Cadence:** weekly, Saturday 14:37 UTC (`"37 14 * * 6"`) + `workflow_dispatch` — pre-Sunday
state, off-the-hour, no collision (gamelogs Sat 13:47, playerstate Sat 14:11). Season-keyed
family ⇒ **Invariant 8 applies**: the purge URL must use the node-step `season` output, never
`date -u +%Y`.

---

## 2. Implementation — edits grouped by file

### `lib/nflverse.mjs`

- Near the base constants (lines 59–66): add
  `const DEPTHCHARTS_BASE = 'https://github.com/nflverse/nflverse-data/releases/download/depth_charts';`
- Near the MIN constants (lines 53–55): add
  ```js
  export const MIN_OLINE_ROWS = 160;    // ~430 OL entries per full week across 32 teams; 160 ≈ one thin week
  export const MIN_OLINE_SEASON = 2025; // ESPN dt-schema era only (2024- files use the legacy NFL-feed schema)
  ```
- After `fetchPbpCsv` (line 433ff): add
  ```js
  /** Fetch depth_charts_<year>.csv; text on success, null on 404/504 (fetchRelease). */
  export async function fetchDepthChartsCsv(year)
  ```
  (plain CSV, not gz — use `fetchRelease`, line ~125.)
- After `aggregateTeamContext` (line 996 → end of file): add
  ```js
  export const OLINE_SLOTS = ['LT', 'LG', 'C', 'RG', 'RT'];

  /** ISO-8601 week key for a YYYY-MM-DD or ISO timestamp string, e.g. '2026-W29'. Pure. */
  export function isoWeekKey(dateStr)

  /**
   * Parse depth_charts CSV (ESPN dt schema) → { teams, rowCount, teamCount, stateCount }.
   * - splitCsvLine (line 77) for quoted-name safety; header lookup BY NAME (drift-safe).
   * - Hard-throws if required columns missing: dt, team, player_name, espn_id, gsis_id,
   *   pos_abb, pos_rank  (header-drift tripwire; also trips on a legacy-schema asset).
   * - Hard-throws if any dt year ∉ {season, season+1} (wrong-asset guard — teamcontext
   *   precedent: season is asserted, not adopted).
   * - Keeps rows with pos_abb ∈ OLINE_SLOTS; buckets per (team, isoWeekKey(dt)); keeps max-dt
   *   rows per bucket; sorts states by dt, ol by slot-then-rank (§1).
   */
  export function aggregateOlineStates(csv, { season })
  ```

### NEW `scripts/update-oline.mjs`

Mirror `scripts/update-teamcontext.mjs` end-to-end (season resolution via
`fetchCurrentNflSeason`; `--year`/`--all`/`--dry-run`/`--force`; 404 → "not published yet —
skipping"; sparsity gate; sha256 content-hash dedup over the stable-sorted `teams` object —
`teamsHash` pattern, `update-teamcontext.mjs:44-48`; `inProgress: false`;
`setStepOutput('season', …)` in single-season mode — `update-teamcontext.mjs:72`).

```js
export async function updateOline({ year = null, all = false, dryRun = false, force = false } = {})
```

Per-season flow: fetch → `aggregateOlineStates` → `validateOline` → sparsity gate
(`rowCount < MIN_OLINE_ROWS` → "preliminary, skip") → past-season `--force` guard → dedup →
write `nflverse/oline/<season>.json` → `updateManifestEntry({ path, recordCount: rowCount,
inProgress: false })`. `--all` iterates `MIN_OLINE_SEASON..currentSeason`.

### `lib/validate.mjs`

Append after `validateTeamContext` (lines 504–580):

```js
/**
 * validateOline(payload, { year }) — hard-throws on:
 *  - season mismatch with `year`
 *  - team key outside the schedule-domain team set (reuse the domain check
 *    validateTeamContext applies — same key domain by construction)
 *  - any state missing week/date/dt, or ol empty
 *  - any ol entry with slot ∉ {LT,LG,C,RG,RT}, non-integer rank < 1, or empty name
 *  - duplicate (slot, rank) within one state
 * Does NOT validate gsisId/espnId formats (§1 — placeholder ids are real upstream data).
 */
export function validateOline(payload, { year })
```

### `bin/update.mjs`

- Imports (lines 31–41): `import { updateOline } from '../scripts/update-oline.mjs';`
- Help SUBCOMMANDS (lines 74–93):
  ```
  oline                       nflverse OL composition per team-week (ESPN depth charts), TEAM-keyed
  oline --year YYYY           OL composition for a specific season (≥ 2025)
  oline --all                 Backfill ESPN-era seasons (≥ 2025)
  ```
- OPTIONS `--all` line (line 99): add `oline` to the subcommand list; same for `--force`
  (line 97).
- EXAMPLES (lines 101–125): `node bin/update.mjs oline --year 2025 --dry-run`,
  `node bin/update.mjs oline --all`.
- Switch (lines 140–177): `case 'oline': await updateOline(opts); break;`

### `package.json`

Append to `"smoke"` (line 15): `&& node bin/update.mjs oline --year 2025 --dry-run`
(2025 = completed ESPN-era season, stable fixture semantics like the other smoke years).

### NEW `.github/workflows/nflverse-oline.yml`

Clone `nflverse-teamcontext.yml` (purge block lines 35–56) — carries rebase-retry push +
manifest-then-file jsDelivr purge + the Invariant 8 season-output purge pattern:

```yaml
name: Weekly nflverse oline

on:
  schedule:
    # Saturday 14:37 UTC — pre-Sunday OL state; off-the-hour (gamelogs Sat 13:47,
    # playerstate Sat 14:11). Upstream ESPN charts refresh daily ~07:30 UTC.
    - cron: "37 14 * * 6"
  workflow_dispatch: {}   # manual trigger for backfill / corrections

permissions:
  contents: write

jobs:
  oline:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - name: Install dependencies
        run: npm ci
      - name: Fetch nflverse oline
        id: fetch
        run: node bin/update.mjs oline
      - name: Commit and purge if changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          if [[ -n "$(git status --porcelain)" ]]; then
            git add nflverse/ manifest.json
            git commit -m "nflverse: oline $(date -u +%Y-%m-%d)"
            # Retry with rebase on push rejection (multiple weekly committers on main)
            git push || (git pull --rebase && git push)
            # Purge jsDelivr CDN cache. SEASON from the node step (Invariant 8) — calendar
            # year and NFL season diverge Jan–Feb; never date -u +%Y here.
            SEASON="${{ steps.fetch.outputs.season }}"
            curl -sf "https://purge.jsdelivr.net/gh/${{ github.repository_owner }}/sleeper-dashboard-data@main/manifest.json" || true
            if [[ -n "$SEASON" ]]; then
              curl -sf "https://purge.jsdelivr.net/gh/${{ github.repository_owner }}/sleeper-dashboard-data@main/nflverse/oline/${SEASON}.json" || true
            else
              echo "WARN: season step-output empty; skipped season-keyed oline purge"
            fi
          else
            echo "No changes to commit."
          fi
```

### Step sequence

1. `lib/nflverse.mjs` additions → 2. `scripts/update-oline.mjs` → 3. `validateOline` →
4. `bin/update.mjs` wiring → 5. `node bin/update.mjs oline --year 2025 --dry-run` then
   `--year 2026 --dry-run` (expect ~32 teams, states since 2026-03, no writes) → 6. real run
   `oline --year 2025` + `oline` (current season); confirm files + manifest entries → 7. tests →
8. smoke line; `npm run smoke` green → 9. workflow file → 10. docs → 11. commit/push + purge per
   Session git workflow → 12. `workflow_dispatch` once to verify the Action end-to-end.

---

## 3. Capture-only enforcement

Same posture as A4: no loader, no projection/grading/backtest read; tripwire test greps
`lib/grade.mjs`, `scripts/grade-snapshot.mjs`, `lib/backtest.mjs`, `scripts/backtest-run.mjs`,
`lib/panel.mjs`, `scripts/panel-run.mjs`, `lib/fantasyPoints.mjs` for `nflverse/oline` /
`aggregateOlineStates` / `OLINE_SLOTS`.

## 4. Docs updates

**README.md**
- Folder structure (line 25 block): add `nflverse/oline/` line.
- File schemas: new subsection `### \`nflverse/oline/<year>.json\`` after
  `### nflverse/teamcontext/<year>.json` (line 567 block): §1 JSON + field semantics + the
  ESPN-era floor (2025) + weekly-reduction rule + bold **Capture-only** note + the placeholder-id
  caveat.
- Update scripts → Subcommands (line 743ff): add the `oline` block (three command forms).
- Smoke (line 818): reflect the added dry-run.
- GitHub Actions (line 826): add `nflverse-oline.yml` row.

**CLAUDE.md**
- Commands → Update CLI (lines 20–44): add the three `oline` lines; extend the `--force`/`--all`
  flag comments (lines 42–43) with `oline`.
- Smoke line (line 112): add `+oline`.
- Navigation map: rows for `scripts/update-oline.mjs`, `nflverse/oline/`,
  `.github/workflows/nflverse-oline.yml`; extend the `lib/nflverse.mjs` row (line 144) with
  `MIN_OLINE_ROWS`, `MIN_OLINE_SEASON`, `fetchDepthChartsCsv`, `aggregateOlineStates`,
  `isoWeekKey`, `OLINE_SLOTS`.
- Invariant 5 (lines 197–199): add `oline` to the "script-produced primary data … `inProgress:
  false`" family list (both sentences that enumerate roster/draft/…/teamcontext).
- **Invariant 8 (line 205): add `nflverse/oline` to the season-keyed purge-URL family list.**
- Cross-repo contracts (lines 215–233): new row **nflverse oline** — This repo: served shape per
  §1, `MIN_OLINE_ROWS` shared sparsity constant, TEAM-keyed, view-only; App counterpart: none
  today (capture-only; tolerate-and-ignore); if ever consumed, a loader must follow the
  teamcontext row's pattern and never touch projection/scoring/grading.

**data-catalog.md**
- New family section (append): path/subcommand/refresh, Source + provenance (nflverse
  `depth_charts` release, ESPN feed; legacy-schema pre-2025 files deliberately unparsed),
  Grain (team × ISO-week × slot-rank), Join ids (team abbr schedule-domain; gsisId/espnId
  verbatim, no sleeper re-key), Coverage (2025→; upstream retains daily grain — our weekly
  reduction is loss-free), schemaVersion 1, Sparsity gate (`MIN_OLINE_ROWS`), Null semantics
  (absent week = no chart published; placeholder ids verbatim), capture-only doctrine line.
  Update `_Last reconciled_` (line 29).

## 5. Tests to add

`test/oline.test.mjs` (`node --test`; hand-built fixture CSV: ESPN header + ~20 rows across 2
teams × 2 ISO-weeks × ranks 1–2, one quoted `"Smith, Jr."` name, one WR row, one placeholder-id
row, two dt values inside one ISO-week):

| Check | Input | Expected |
|---|---|---|
| Aggregation shape | fixture CSV | teams/states/ol per §1; WR row dropped; slot-then-rank order |
| Weekly reduction | two dt in one ISO-week | only max-dt rows kept; `date`/`dt` from max |
| isoWeekKey | `2026-01-01`, `2026-12-31`, mid-year date | correct ISO year-week incl. year-boundary cases |
| Quoted names | `"Smith, Jr."` row | parsed intact via splitCsvLine |
| Placeholder ids | `WIL597533` row | kept verbatim; validator passes |
| Wrong-asset guard | fixture with dt year = season+3 | `aggregateOlineStates` throws |
| Header drift | legacy-2024-schema header | throws (missing dt/pos_abb columns) |
| Validator | duplicate (slot,rank) in one state; bad slot; empty ol | each throws |
| Sparsity | fixture yielding rowCount < 160 | update script skips (gate), no write |
| **Capture-only tripwire** | source text of the seven §3 modules | none reference `nflverse/oline`, `aggregateOlineStates`, `OLINE_SLOTS` |

Smoke: the new `oline --year 2025 --dry-run` line exercises live fetch + parse + validate.

## 6. Cross-repo impact

**No app change required now.** Additive family + manifest entries the app ignores. Flags for the
app repo (task summary): add a `docs/signal-registry.md` row — Source: nflverse `depth_charts`
(ESPN) weekly Action; Coverage: 2025→ (pre-2025 exists upstream in a legacy schema, unparsed);
**reconstructable** (upstream archives daily states — this family is a forward-capture
convenience + insurance, not the only copy); Layer: capture-only. The new CLAUDE.md Cross-repo
contracts row (§4) records the tolerate-and-ignore posture; any future consumption must mirror
the served shape verbatim and stay out of projection/scoring/grading without a graded gate.
