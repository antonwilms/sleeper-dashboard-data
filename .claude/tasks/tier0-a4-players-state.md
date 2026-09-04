# Tier 0 / A4 — Sleeper players-state weekly capture (capture-only)

**Repo SHAs (verified against origin/main via GitHub MCP, 2026-07-18):**
data `a62b522092faf2cc848ad3e9917744e47527dfd4` · app `2185ef2f143cecb89b2e6b28d86cc8b3863958f3` (both in sync with origin/main).

**Type:** capture-first banking. New date-keyed, append-only snapshot family from the Sleeper
`/v1/players/nfl` endpoint. **NO consumer, enrichment step, or scoring path reads it** — capturing
without consuming is the intended end state of this slice (roadmap R0-SLEEPER; capture-only
doctrine per `data-catalog.md` header).

**Unit boundary (one line):** the only Sleeper-sourced, date-keyed, hard-loss-clock capture —
distinct fetch, distinct key convention, and distinct precedent (mirrors `update-ktc.mjs`) from
the oline unit (nflverse-sourced, year-keyed, soft clock; see `tier0-ordering.md`).

**Merge-with-oline decision (evidence):** REJECTED. Verified live 2026-07-18: Sleeper's payload
has 510 players with `depth_chart_position: "OL"` and **0 of them carry `depth_chart_order`**
(vs. skill positions, which carry both slot and order). Sleeper cannot express OL composition, so
oline sources from nflverse depth_charts instead — no shared fetch, no shared payload.

---

## 1. What is captured and why now

The Sleeper players endpoint is **current-state only** — Sleeper serves no history, and nothing
server-side snapshots it. Every week that passes without capture permanently loses that week's
`status` / `injury_status` / depth-chart state (the app's projection snapshots record `status`
only, and only when the user happens to visit — app `projectionSnapshot.js:85-92`).

Payload surveyed live 2026-07-18 (12,200 records, 9,394 `active`, 14.6 MB raw).

### Field survey — include/exclude (survey once, capture the right set)

**INCLUDED (per-player), with observed evidence:**

| Captured key | Sleeper key | Ephemeral? | Observed 2026-07-18 |
|---|---|---|---|
| `name` | `full_name` | no | join/debug convenience (KTC/advstats/gamelogs precedent: store name) |
| `team` | `team` | weekly | membership key; trades/cuts/signings |
| `position` | `position` | rarely | filter transparency |
| `fantasyPositions` | `fantasy_positions` | rarely | array, e.g. `["RB"]` for FBs |
| `status` | `status` | **yes** | `Active` 8646, `Inactive` 3278, `Injured Reserve` 226, `PUP` 3, `NFI` 1, `Practice Squad` 1 |
| `injuryStatus` | `injury_status` | **yes** | `Questionable` 402, `NA` 83, `IR` 21, `PUP` 5, `Sus` 4, `Out` 4, `DNR` 2, `COV` 2, else null |
| `injuryBodyPart` | `injury_body_part` | **yes** | e.g. `"Neck"` |
| `injuryStartDate` | `injury_start_date` | **yes** | ISO date or null |
| `injuryNotes` | `injury_notes` | **yes** | free text, e.g. `"Soreness"` |
| `practiceParticipation` | `practice_participation` | **yes** | nearly all null in July; populates in-season (practice reports) |
| `practiceDescription` | `practice_description` | **yes** | same |
| `depthChartPosition` | `depth_chart_position` | **yes** | `QB`,`RB`,`LWR`,`RWR`,`SWR`,`TE`,`K`… |
| `depthChartOrder` | `depth_chart_order` | **yes** | int or null |
| `active` | `active` | slowly | bool |
| `teamChangedAt` | `team_changed_at` | **yes** | observed all-null today; populates transiently after team changes — cheap, team-churn-aligned (R2 attribution interest), include |
| `newsUpdated` | `news_updated` | **yes** | epoch-ms of last news item (8,110 non-null) |
| `searchRank` | `search_rank` | **yes** | Sleeper fantasy-relevance rank (Josh Allen 1, CMC 5; irrelevant → 999) — weak market signal, cheap |

**EXCLUDED (deliberate, with reason):**
- Biographical/static: `height`, `weight`, `age`, `birth_date`, `birth_city/state/country`,
  `college`, `high_school`, `years_exp` — static or derivable; not state.
- External IDs (`gsis_id`, `espn_id`, `yahoo_id`, `rotowire_id`, `sportradar_id`, `stats_id`,
  `oddsjam_id`, `opta_id`, `swish_id`, `pandascore_id`, `fantasy_data_id`, `kalshi_id`) — crosswalk
  territory (`nflverse/playerids.json`); duplicating weekly would bloat every snapshot.
- Name variants (`first_name`, `last_name`, `search_*`, `hashtag`), `sport`, `player_shard`,
  `number` (jersey), `team_abbr` — redundant or worthless.
- `metadata` — Sleeper-internal bookkeeping (`injury_override_regular_<yr>_<wk>` keys,
  `channel_id`, `rookie_year`…): historical overrides, not weekly state.
- `competitions` — observed empty array for all 12,200 records.
- OL players entirely — see merge decision above (no order/slot data exists).

### Membership filter (stable series semantics)

Include player iff **`active === true` AND `team !== null` AND
(`position` ∈ SKILL or `fantasy_positions` ∩ SKILL ≠ ∅)** where
`SKILL = {QB, RB, WR, TE, FB, K}`.

- Observed size: 1,012 players (offseason 90-man high-water; in-season ~800).
  ≈360 KB compact / ≈480 KB at `writeJsonStable`'s 2-space indent → ~25 MB/yr at weekly cadence
  (repo context: `snapshots/` is 59 MB, `nflverse/gamelogs/` 106 MB — in-family).
- `team !== null` gives clean longitudinal semantics: a player disappearing from the series
  means exactly "no longer rostered". The teamless-active tail (2,251 players) is mostly
  retired/unsigned noise with null depth/practice fields; excluded deliberately.
- DEF pseudo-players (`position: "DEF"`) excluded by the SKILL filter.

---

## 2. Snapshot schema (exact shape)

New family: **`nfl/players-state/<YYYY-MM-DD>.json`** (UTC date key, bare-date filename mirroring
`snapshots/<date>.json`; `nfl/` because that is the repo's Sleeper-sourced tree, per
`nfl/season-totals/`). Append-only; never overwritten within a day; content-hash dedup vs. the
most recent prior snapshot (KTC pattern) so an unchanged offseason week produces no commit.

```json
{
  "schemaVersion": 1,
  "date": "2026-07-18",
  "capturedAt": "2026-07-18T14:11:32.000Z",
  "source": "sleeper:v1/players/nfl",
  "positions": ["QB", "RB", "WR", "TE", "FB", "K"],
  "playerCount": 1012,
  "players": {
    "4046": {
      "name": "Patrick Mahomes",
      "team": "KC",
      "position": "QB",
      "fantasyPositions": ["QB"],
      "status": "Active",
      "injuryStatus": null,
      "injuryBodyPart": null,
      "injuryStartDate": null,
      "injuryNotes": null,
      "practiceParticipation": null,
      "practiceDescription": null,
      "depthChartPosition": "QB",
      "depthChartOrder": 1,
      "active": true,
      "teamChangedAt": null,
      "newsUpdated": 1774912523407,
      "searchRank": 3
    }
  }
}
```

**Forward-stability rules (a later shape change orphans the series — versioned up front):**
- Every captured key is written explicitly, `null` when upstream is null/absent — absence never
  means "not captured".
- The envelope self-describes its membership rule (`positions`) so filter evolution is visible
  per-file without external context.
- Additive-only within `schemaVersion: 1` (new keys may appear; existing keys never change
  meaning/type). Removing/renaming a key or changing the filter to a **narrower** set ⇒ bump
  `schemaVersion` to 2. Do not enum-validate `status`/`injuryStatus` values (Sleeper adds
  statuses; store verbatim).
- `players` keys written in sorted `sleeper_id` order (stable diffs + stable content hash).

**Manifest entry** (auto via `updateManifestEntry`, `lib/manifest.mjs:34`):

```json
"nfl/players-state/2026-07-18.json": {
  "schemaVersion": 1,
  "recordCount": 1012,
  "inProgress": false,
  "lastModified": "2026-07-18T14:11:35.120Z"
}
```

`inProgress: false` — **deliberate deviation from KTC's `inProgress: true` "current-value marker"
quirk** (Invariant 1). Each dated file is a completed, immutable capture, never re-exported; the
nflverse convention (Invariant 5: no app live fallback ⇒ `false`) applies. Propagating KTC's quirk
to a second family is what produced the app-side ktcHist inProgress contract bug — do not repeat it.

**Cadence:** weekly, Saturday 14:11 UTC (`"11 14 * * 6"`) + `workflow_dispatch`. Saturday morning
UTC sits after Friday injury designations (~20:00–22:00 Z Friday) and before Sunday games — the
highest-information weekly sample point in-season. Off-the-hour minute per repo politeness
convention; does not collide with gamelogs (Sat 13:47). Cadence densification later would be
additive (date-keyed series) — no schema risk.

---

## 3. Implementation — edits grouped by file

### NEW `scripts/update-playerstate.mjs`

Mirror `scripts/update-ktc.mjs` structure (fetch → build → validate → dedup → write → manifest;
its dedup block is `update-ktc.mjs:180-193`, manifest step `:208-214`).

```js
export const SKILL_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'FB', 'K'];

/** Filter predicate — see §1 membership filter. Pure. */
export function isCapturedPlayer(p)            // → boolean

/** Map one raw Sleeper record to the captured shape (§2), all keys explicit, ?? null. Pure. */
export function pickPlayerState(p)             // → object

/** Filter + pick + sort keys. Pure. */
export function buildPlayersState(rawPlayersMap) // → { [sleeper_id]: pickedState } (sorted keys)

/** sha256 of JSON.stringify(players) — keys already sorted by construction. */
function playersHash(players)                  // → hex string

/** Orchestrator, mirrors updateKtc({ dryRun }). */
export async function updatePlayerState({ dryRun = false } = {})
```

`updatePlayerState` step order:
1. `const raw = await fetchPlayersMap({ dryRun })` (new lib helper, below).
2. `const players = buildPlayersState(raw)`; log count.
3. `validatePlayersState(players)` (new validator, below) — hard-throws.
4. Dedup: find latest existing `nfl/players-state/*.json` via `listDir` (lexicographic sort =
   chronological, same as `findLastSnapshot`, `update-ktc.mjs:47-53`); compare
   `playersHash(players)` vs. hash of prior file's `.players`. Identical → log "no change", return
   (no write, no manifest, **no last-checked marker** — run-evidence liveness is the A2 detector's
   job; noted deviation from KTC/roster).
5. Dry-run: print plan (`would write nfl/players-state/<date>.json: N players`), return.
6. `writeJsonStable('nfl/players-state/<date>.json', envelope)`.
7. `updateManifestEntry({ path, recordCount: playerCount, inProgress: false })`.

No ordering guard (KTC's Spearman guard defends a scraped ranking; this is a first-party API —
`validatePlayersState`'s floors are the breakage tripwire).

### `lib/sleeper.mjs` — one new export

Insert after `fetchSeasonWeeks` (which ends before `aggregateWeeks`, line 129):

```js
/**
 * Fetch the full Sleeper players map (GET /v1/players/nfl, ~15 MB).
 * Returns the raw parsed object { [sleeper_id]: playerRecord }.
 * Throws on non-OK response or non-object payload.
 */
export async function fetchPlayersMap({ dryRun = false } = {})  // dryRun only quiets progress logging
```

Use the same fetch/error style as `fetchSeasonWeeks` (line 64ff).

### `lib/validate.mjs` — new validator + floor

Append after `validateTeamContext` (line 504–580), before `validateEnrichmentShape` (line 581):

```js
export const MIN_PLAYERSTATE_ROWS = 600;   // observed 1,012 offseason / ~800 in-season

/**
 * validatePlayersState(players) — hard-throws on:
 *  - count < MIN_PLAYERSTATE_ROWS
 *  - fewer than 28 distinct team values
 *  - any record missing a non-empty string `team`, `position`, or `name`
 *  - any record where `active !== true`
 *  - `depthChartOrder` present but not a positive integer
 * Does NOT enum-validate status strings (forward-stability, §2).
 */
export function validatePlayersState(players)
```

### `bin/update.mjs` — dispatcher wiring

- Imports block (lines 31–41): add
  `import { updatePlayerState } from '../scripts/update-playerstate.mjs';`
- `printHelp()` SUBCOMMANDS (lines 74–93): add
  `playerstate                 Weekly Sleeper players-state snapshot (status/injury/depth), date-keyed`
- EXAMPLES (lines 101–125): add `node bin/update.mjs playerstate` and
  `node bin/update.mjs playerstate --dry-run`
- Switch (lines 140–177): add
  ```js
  case 'playerstate':
    await updatePlayerState(opts);
    break;
  ```

### `package.json` — smoke line

Append to the `"smoke"` script (line 15): `&& node bin/update.mjs playerstate --dry-run`
(precedent: roster/draft/schedule/teamcontext are in `npm run smoke` but not `smoke-test.yml`
steps — do NOT touch `smoke-test.yml`).

### NEW `.github/workflows/weekly-playerstate.yml`

Clone the `weekly-ktc.yml` skeleton (its commit+purge block is `weekly-ktc.yml:32-47`), which
already carries the two required conventions — **rebase-retry push** (`git push || (git pull
--rebase && git push)`) and the **jsDelivr purge** (manifest first, then the dated file). No
manifest union-merge is needed inside the workflow: rebase conflicts on manifest.json only arise
in local sessions (CLAUDE.md Session git workflow §3); Actions serialize via the rebase-retry.

```yaml
name: Weekly players-state snapshot

on:
  schedule:
    # Saturday 14:11 UTC — after Friday injury designations, before Sunday games.
    # Off-the-hour to be polite to shared GHA runners; gamelogs runs Sat 13:47.
    - cron: "11 14 * * 6"
  workflow_dispatch: {}   # manual trigger for testing / immediate first capture

permissions:
  contents: write

jobs:
  playerstate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - name: Install dependencies
        run: npm ci
      - name: Capture players-state snapshot
        id: capture
        run: node bin/update.mjs playerstate
      - name: Commit and purge if changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          if [[ -n "$(git status --porcelain)" ]]; then
            SNAPSHOT_DATE=$(date -u +%Y-%m-%d)
            git add nfl/players-state/ manifest.json
            git commit -m "playerstate: snapshot ${SNAPSHOT_DATE}"
            # Retry with rebase on push rejection (multiple weekly committers on main)
            git push || (git pull --rebase && git push)
            # Purge jsDelivr CDN cache (manifest first, then the dated file). Date-keyed
            # family — exempt from the Invariant 8 season-output rule, same as KTC.
            curl -sf "https://purge.jsdelivr.net/gh/${{ github.repository_owner }}/sleeper-dashboard-data@main/manifest.json" || true
            curl -sf "https://purge.jsdelivr.net/gh/${{ github.repository_owner }}/sleeper-dashboard-data@main/nfl/players-state/${SNAPSHOT_DATE}.json" || true
          else
            echo "No changes to commit."
          fi
```

### Step sequence

1. `lib/sleeper.mjs` `fetchPlayersMap` → 2. `scripts/update-playerstate.mjs` pure helpers →
3. `lib/validate.mjs` validator → 4. `bin/update.mjs` wiring → 5. run
   `node bin/update.mjs playerstate --dry-run` locally, expect "would write … ~1000 players" →
6. real local run once; confirm file + manifest entry shape (§2) → 7. tests (§Tests) →
8. `package.json` smoke line; `npm run smoke` green → 9. workflow file → 10. docs (§Docs) →
11. commit/push per CLAUDE.md Session git workflow (incl. purge for the newly served file) →
12. **trigger `workflow_dispatch` once** so the series starts immediately, not next Saturday
   (loss-clock). Verify the Actions run commits and purges.

---

## 4. Capture-only enforcement

- No app loader, no enrichment step, no grading/backtest/panel read — nothing in this plan touches
  `lib/grade.mjs`, `lib/backtest.mjs`, `lib/panel.mjs`, `lib/fantasyPoints.mjs`, or their
  `scripts/` adapters.
- Tripwire test (§Tests, precedent `context-instability-capture.md` §6b): source-grep those seven
  modules for `players-state` / `playerstate` — fails loudly if a future session wires it in
  without a graded gate.

## 5. Docs updates

**README.md**
- Folder structure (§ line 25): add `nfl/players-state/` line —
  `— weekly Sleeper players-state snapshots (status/injury/depth), date-keyed, capture-only`.
- File schemas: new subsection `### \`nfl/players-state/<date>.json\`` inserted after
  `### nfl/season-totals/<year>.json` (line 72–119 block): paste §2 JSON, the membership filter,
  the include/exclude table (condensed), dedup semantics ("an unchanged week writes nothing —
  absence of a date means either 'no change' or 'not captured'; run-evidence lives in the A2
  detector"), and a bold **Capture-only** note ("no app, projection, grading, or backtest path
  reads this family; activation requires a graded gate").
- Update scripts → Subcommands (line 743ff): add the `playerstate` block with both commands.
- Smoke (line 818): reflect the added dry-run.
- GitHub Actions (line 826): add a row for `weekly-playerstate.yml` (Saturday, content-hash dedup,
  CDN purge).

**CLAUDE.md**
- Commands → Update CLI (lines 20–44): add `node bin/update.mjs playerstate` line.
- Smoke line (line 112): add `+playerstate` to the dry-run list.
- Navigation map (lines 118–184): three new rows — `scripts/update-playerstate.mjs`,
  `nfl/players-state/`, `.github/workflows/weekly-playerstate.yml`.
- Invariant 5 (lines 197–199): add a sentence — players-state snapshots are date-keyed,
  append-only, content-hash-deduped like KTC but register `inProgress: false` (completed
  immutable captures; the KTC `true` quirk is legacy, not a pattern).
- Cross-repo contracts (lines 215–233): no new row needed (no app counterpart); instead extend
  the **Manifest contract** row's "This repo" cell with "new `nfl/players-state/*` entries are
  additive; app must ignore unknown families (it already keys `getManifestEntry` by path)".

**data-catalog.md**
- New family section (append, following the §format at the top of the file): Served path /
  subcommand / refresh (`nfl/players-state/<date>.json`; `bin/update.mjs playerstate`; Saturday
  Action), Source (Sleeper `/v1/players/nfl`), Grain (player-week snapshot, date-keyed),
  Join id (sleeper_id native), Coverage (**2026-07 onward — no backfill possible, upstream is
  current-state only; this is the whole point of the capture**), schemaVersion 1, Sparsity gate
  (`MIN_PLAYERSTATE_ROWS = 600` + ≥28 teams), Null semantics (all keys explicit, null = upstream
  null), Capture-only doctrine line. Update the `_Last reconciled_` line (line 29).

## 6. Tests to add

`test/playerstate.test.mjs` (`node --test`, runs under `npm test`; fixtures in-memory):

| Check | Input | Expected |
|---|---|---|
| Filter includes | active rostered QB | in `buildPlayersState` output |
| Filter excludes teamless | active QB, `team: null` | absent |
| Filter excludes inactive | `active: false`, rostered WR | absent |
| Filter excludes non-skill | OL (`position:"G"`), DEF pseudo-player | absent |
| FB via fantasy_positions | `position:"FB"`, `fantasy_positions:["RB"]` | present |
| Pick shape | record with missing/undefined injury fields | every §2 key present, `null` where absent |
| Key order | unsorted input map | output keys sorted (stable hash guarantee) |
| Validator floor | 599 synthetic valid records (generated in a loop) | throws (< MIN_PLAYERSTATE_ROWS) |
| Validator team spread | 600 records all on one team | throws (< 28 teams) |
| Validator happy path | 600 synthetic records across 32 teams | passes |
| Status not enum-gated | record with novel `status:"Future-Status-X"` | validator passes |
| Dedup hash | same players, different insertion order | equal hashes |
| **Capture-only tripwire** | source text of `lib/grade.mjs`, `scripts/grade-snapshot.mjs`, `lib/backtest.mjs`, `scripts/backtest-run.mjs`, `lib/panel.mjs`, `scripts/panel-run.mjs`, `lib/fantasyPoints.mjs` | none contain `players-state` or `playerstate` |

Smoke: covered by the new `playerstate --dry-run` line in `npm run smoke` (live fetch + validate,
no write — same live-network posture as the existing `ktc --dry-run` smoke step).

## 7. Cross-repo impact

**None requiring app changes now.** The family is additive: new manifest entries under a path the
app never reads; `dataStore.js` `getManifestEntry` is path-keyed and ignores unknown families
(same posture as `backtests/`/`grading/` non-entries — but here entries exist and are simply
unread). Two flags for the app repo, to note in the task summary:
1. `docs/signal-registry.md` (canonical registry): add a row — Source: Sleeper `/v1/players/nfl`
   weekly Action; Coverage: 2026-07→ (no backfill possible); **ephemeral** (current-state-only
   upstream); Layer: capture-only, consumed by nothing.
2. If players-state is ever activated, it must arrive through a graded gate and a Cross-repo
   contract row — not this slice.
