# Capture plan — team-context-instability (ephemeral components, capture-only)

**Type:** capture-first banking (record now, NO activation, accrues for future grading).
**Status:** plan only. No source edited by this session.
**Precedent mirrored:** advstats capture-only ingest (`nflverse/advstats/*` recorded as app
`factors`, excluded from `NUMERIC_FACTOR_KEYS` in `lib/grade.mjs`, "emitted … capture-only;
not nulled" assertion in `test/nflverse.test.mjs:504`). This is the repo's "sosFactor
capture-first" analog: a signal family is *written and served* but no projection/grading path
reads it, so it banks for later backtesting without moving `projectedPPG`.

---

## 0. Thesis (what actually needs capturing, and what does NOT)

The named churn family is **QB1 / OC / HC / OL continuity + scheme**. Applying the
reconstructable-vs-ephemeral rule field-by-field against *live source and ingested data*
(not grep alone), **four of the five are already banked and must NOT be duplicated; exactly
one is genuinely ephemeral and captured nowhere.**

| Candidate signal | Already banked where? | Reconstructable? | Decision |
|---|---|---|---|
| **HC / OC identity + continuity** | `enrichment/coaching.json` — 95 entries (all 2026), already carries `tenureStart`, `isNew`, `predecessor` per (year, team, role) | Identity is public record; YoY change derives from the yearly coaching file | **Do not capture.** Continuity is derivable from the existing yearly coaching identity. |
| **QB1 + skill-position depth-chart order at snapshot time** | `snapshots/<date>.json` → `teamDepthCharts[team].{QB,RB,WR,TE}[].depthOrder` and per-player `players[id].depthChartOrder`. Verified present (e.g. Joe Burrow `depthOrder:1`) across all teams in `2026-06-13.json` | QB *identity* is public record; the contemporaneous depth-order is already snapshotted | **Do not capture.** App-owned snapshot already banks this; duplicating it here would collide with an existing contract. |
| **Scheme label + scheme change** | `enrichment/scheme.json` — schema-ready (`offense`/`defense`/`tempo`/`changedFromPrev`), currently empty `[]` | Label is a judgment, NOT reconstructable — but the capture *mechanism already exists* | **Do not add schema.** Capture is already enabled; it is empty only because no one has authored entries. No code change; documentation + guard coverage only. |
| **Returning-starter counts / "OL changed" flags** | — | Derivable by diffing two consecutive years of captured OL units | **Do not capture.** Store raw ephemeral state; derive continuity at grade time (mirrors advstats: capture raw, derive ratios later). |
| **Offensive-line unit at snapshot time (projected starters, L→R)** | **Nowhere.** Snapshot omits OL entirely (verified: only QB/RB/WR/TE positions exist in `teamDepthCharts` across every team). `nflverse/roster/<year>.json` has `{team,position,status,fullName}` but **no depth/starter order**. Post-season snap-count leaders (nflverse) are an *outcome*, not the preseason projection | The *preseason projected* unit is a contemporaneous judgment — NOT reconstructable. Actual realized snaps are reconstructable but are a different (outcome) signal | **CAPTURE (new).** This is the one irreducibly-ephemeral, uncaptured component, and it is exactly the task's stated example of an ephemeral field ("depth-chart order at snapshot time … not [reconstructable]"). |

**Net:** add **one** new capture-only enrichment family — `enrichment/oline.json` — holding the
contemporaneous projected offensive-line unit per (year, team). Everything else in the family
is already banked; the plan documents those decisions so a future grading session can assemble
the whole context-instability feature from: coaching.json (HC/OC churn) + snapshot depth charts
(QB1 churn) + scheme.json (scheme churn) + **oline.json (OL churn, new)**.

**Why enrichment, not the snapshot:** the snapshot is written by the app
(`src/utils/projectionSnapshot.js`) and is out of scope ("do not touch the app side").
The enrichment overlay is this repo's only hand-authored, contemporaneous capture surface,
and OL data is a judgment no API serves — so enrichment is the correct and only in-scope home.
No change to `bin/update.mjs` (snapshot registration / season-totals / roster writing) is
needed; the manifest entry is produced automatically by the enrichment write path (§3).

---

## 1. New captured fields & data shapes

New file: **`enrichment/oline.json`** (5th enrichment type). Shares the standard wrapper:

```json
{
  "schemaVersion": 1,
  "updatedAt": "ISO8601",
  "entries": [ … ]
}
```

Entry shape — **one per (year, team)**:

```json
{
  "id":               "oline-2026-SF-1a2b3c",
  "year":             2026,
  "team":             "SF",
  "capturedAt":       "2026-06-17T00:00:00.000Z",
  "projectedStarters": [
    { "slot": "LT", "name": "Trent Williams",  "playerId": "4500", "depthOrder": 1 },
    { "slot": "LG", "name": "Aaron Banks",      "playerId": null,   "depthOrder": 1 },
    { "slot": "C",  "name": "Jake Brendel",     "playerId": null,   "depthOrder": 1 },
    { "slot": "RG", "name": "Dominick Puni",    "playerId": null,   "depthOrder": 1 },
    { "slot": "RT", "name": "Colton McKivitz",  "playerId": null,   "depthOrder": 1 }
  ],
  "source":           "team depth chart 2026-06-17",
  "notes":            ""
}
```

Field semantics and the ephemeral/reconstructable call for each:

| Field | Type | Required | Ephemeral? | Notes |
|---|---|---|---|---|
| `id` | string | yes (generated) | — | `oline-<year>-<team>-<6hex>`; deterministic (mirrors existing ID format). |
| `year` | int | yes | — | Capture season. `[2012, currentYear+1]` (reuses `assertValidYear`). |
| `team` | string | yes | — | NFL abbr; reuses `assertValidTeam`. |
| `capturedAt` | ISO string | auto-set on add | **yes** | "As-of" marker — the contemporaneous timestamp. The whole point of capture-first: it records *when* this unit state was true. |
| `projectedStarters` | array (1–5) | yes, non-empty | **yes** | The ephemeral payload: the projected L→R starting five at snapshot time. |
| `…[].slot` | enum `LT,LG,C,RG,RT` | yes per element | — | Positional slot. Carries the order; this IS the "depth-chart order at snapshot time" the task names. |
| `…[].name` | string | yes per element | **yes** | Player name. Required so the entry is meaningful even when no Sleeper id exists (backups/UDFAs). |
| `…[].playerId` | string \| null | optional per element | — | Sleeper `player_id` **if known**. **NOT validated against the skill `playerMap`** (linemen are absent from it — see §2). Opaque identifier; `null`/absent is fine. |
| `…[].depthOrder` | int | optional (default 1) | **yes** | Reserved for future backup-depth capture; for a starters-only unit every slot is `1`. Honors the literal "depth-chart order at snapshot time" framing while keeping the v1 capture to starters. |
| `source` | string | optional | — | Provenance. |
| `notes` | string | optional | — | Free text (e.g. "LG unsettled — Banks vs rookie"). |

**Continuity is derived, not stored.** "Returning starters", "OL changed YoY", churn magnitude
are computed later by diffing consecutive (year, team) entries — never written here (mirrors
advstats storing raw components and deriving ratios at read time).

**Placement (snapshot vs enrichment vs manifest):**
- **Enrichment** (`enrichment/oline.json`): all new fields. It is the only hand-authored,
  contemporaneous, no-API surface this repo owns — and OL is a judgment.
- **Snapshot:** nothing. Skill depth is already there; OL would require an app-side writer (out of scope).
- **Manifest:** one auto-generated `files["enrichment/oline.json"]` entry
  (`schemaVersion:1`, `inProgress:false`, `recordCount`, `lastModified`) — written by the
  existing `writeEnrichment → updateManifestEntry` path, no manifest code change.

---

## 2. Function signatures / code touch-points (for the implementing session)

All in the existing enrichment stack — additive, no new module.

**`lib/enrichment.mjs`**
- `ENRICHMENT_TYPES` → add `'oline'`. (Also update the same const in `bin/enrich.mjs`.)
- New slot const: `const OLINE_SLOTS = ['LT', 'LG', 'C', 'RG', 'RT'];`
- `generateId(type, fields)` — add case:
  `case 'oline': key = String(fields.team); break;` prefix `'oline'`.
  (Hash already covers the full `projectedStarters` array → deterministic & content-addressed.)
- `validateEntry(type, entry, context)` — add `case 'oline'`:
  ```
  requireFields(entry, ['year', 'team', 'projectedStarters']);
  assertValidTeam(entry.team);
  assertValidYear(entry.year);
  if (!Array.isArray(entry.projectedStarters) || entry.projectedStarters.length === 0)
    throw new Error('[enrichment] oline: projectedStarters must be a non-empty array');
  const seenSlots = new Set();
  for (const s of entry.projectedStarters) {
    if (!OLINE_SLOTS.includes(s.slot))
      throw new Error(`[enrichment] oline: invalid slot "${s.slot}" (LT|LG|C|RG|RT)`);
    if (seenSlots.has(s.slot))
      throw new Error(`[enrichment] oline: duplicate slot "${s.slot}"`);
    seenSlots.add(s.slot);
    if (!s.name || typeof s.name !== 'string' || s.name.trim() === '')
      throw new Error('[enrichment] oline: each starter needs a non-empty name');
    if (s.playerId != null && typeof s.playerId !== 'string')
      throw new Error('[enrichment] oline: playerId must be a string or null');
    // NOTE: deliberately NOT checked against playerMap — OL are absent from the skill map.
  }
  ```
- `naturalKey(type, entry)` — add `case 'oline': return \`${entry.year}|${entry.team}\`;`
- `validateAll(context)` — add an `oline` per-type uniqueness block (duplicate `(year, team)`),
  mirroring the existing `scheme` block.

**`scripts/update-enrichment.mjs`**
- `buildEntryFields(type, flags)` — add `case 'oline'`:
  ```
  case 'oline':
    return compact({
      year:              f(flags.year),
      team:              f(flags.team),
      capturedAt:        new Date().toISOString(),
      projectedStarters: buildStarters(flags),   // assembles array from --lt/--lg/--c/--rg/--rt (+ *-id)
      source:            f(flags.source),
      notes:             f(flags.notes),
    });
  ```
  New local helper `buildStarters(flags)`: for each slot in `OLINE_SLOTS`, if `flags['<slot>']`
  is set, push `{ slot, name, playerId: flags['<slot>Id'] ?? null, depthOrder: 1 }`. Skips unset
  slots (a partial/TBD unit is valid). Returns the ordered array.
- `runAdd` already loads `playerMap` for injuries/notes; oline ignores it (no coupling). No change
  to `runValidate`/`runList`/`runRemove` — they are type-agnostic and pick up `oline` for free.

**`bin/enrich.mjs`**
- `ENRICHMENT_TYPES` → add `'oline'`.
- Parse the new flags into `fields`: `--lt/--lg/--c/--rg/--rt` (names) and
  `--lt-id/--lg-id/--c-id/--rg-id/--rt-id` (optional Sleeper ids). Keep camelCase keys
  (`ltId`, …) consistent with existing `option()` usage.
- Add an `oline add` block to `printHelp()` (OPTIONS + EXAMPLE).

**No changes** to `lib/manifest.mjs`, `bin/update.mjs`, or any grading/projection module.

CLI shape:
```bash
node bin/enrich.mjs oline add --year 2026 --team SF \
  --lt "Trent Williams" --lt-id 4500 \
  --lg "Aaron Banks" --c "Jake Brendel" --rg "Dominick Puni" --rt "Colton McKivitz" \
  --source "team depth chart 2026-06-17"
```

---

## 3. Step sequence (with a hard confirm-gate)

**Step A — capture write path (lib + CLI), prove on one real entry.**
1. Add `'oline'` to both `ENRICHMENT_TYPES`; add `OLINE_SLOTS`; implement `generateId`,
   `validateEntry`, `naturalKey`, `validateAll` cases; add `buildEntryFields`/`buildStarters`;
   wire `bin/enrich.mjs` flags + help.
2. Dry-run: `node bin/enrich.mjs oline add --year 2026 --team SF --lt "Trent Williams" … --dry-run`
   → expect "would add entry oline-2026-SF-…", no write.
3. Real add for one team, then `node bin/enrich.mjs validate` → expect
   `[enrichment] oline: 1 entries — OK` and overall "All files valid."
4. Confirm `enrichment/oline.json` exists with the wrapper, and `manifest.json` now has a
   `files["enrichment/oline.json"]` entry (`inProgress:false`, `schemaVersion:1`, correct
   `recordCount`/`lastModified`) — written automatically by `writeEnrichment`.

> **⛔ Confirm it works before continuing.** Do not proceed to Step B until `validate` is green,
> the manifest entry is present and correct, and `npm run smoke` passes (it runs
> `node bin/enrich.mjs validate`). If red, fix Step A first.

**Step B — guard + docs + registry (no behavior change).**
5. Add the capture-only guard test (§ Tests to add) under `npm test`; run `npm test` → green.
6. Apply all Docs updates (§ below).
7. Flag the app-repo signal registry and state the cross-repo contract in the task summary
   (§ Cross-repo impact).

---

## 4. Constraints honored (capture-only enforcement)

- **No projection/grading path may read `oline`.** Enforced two ways:
  (a) it is a *new* enrichment file the app's `loadEnrichment` does not fetch, so it cannot
  reach `projectedPPG`/dynasty even accidentally on the app side; (b) a repo-side guard test
  (below) fails if any grading/backtest module starts referencing it — the analog of the
  advstats view-only enforcement, written so "a future session can't wire these in by accident."
- **Additive & optional.** New file + new type; existing four files and the app tolerate its
  presence (served, unfetched) and its absence (an initial empty `[]` is valid, like `scheme.json`).
  No schemaVersion bump anywhere (the family is new, not an incompatible change to an existing
  layout). `MAX_SUPPORTED_SCHEMA` (season-totals only) is untouched. An initial empty `[]` is
  valid, exactly like `scheme.json` today.
- **No fabricated history.** `capturedAt` and absence-of-past-entries are expected; never
  backfill prior seasons. A player traded after capture does **not** mutate the prior entry —
  the captured unit is a historical, contemporaneous fact (Invariant 1: append-only; correction
  only on genuine error with a committed diff).
- **`inProgress:false`** for current-year oline files — consistent with the other enrichment
  files and the roster precedent (Invariant 5: hand-authored / no live app fallback ⇒ `false`).

---

## 5. Docs updates

**`README.md`**
- *Enrichment overlay → Structure* block: add a line
  `  oline.json      — projected offensive-line unit per team per year (capture-only)`.
- *Entry schemas*: add a new subsection **`#### Offensive-line continuity (oline.json)`**
  with the JSON example from §1, the "Required: `id`, `year`, `team`, `projectedStarters`
  (≥1 slot, each with `slot`+`name`)" line, and a bold note: *"Capture-only — banked for a
  future multi-year context-instability grade; no projection or grading path reads it.
  `playerId` is an opaque Sleeper id when known and is NOT validated against the skill player
  map (linemen are absent from it)."*
- *CLI* block: add the `node bin/enrich.mjs oline add …` example from §2.
- *App consumption*: append — *"`oline.json` is served but not yet fetched by `loadEnrichment`
  (which fetches the original four). It is banked for future consumption and, when wired, must
  be treated capture-only."*

**`CLAUDE.md`**
- *Commands → Enrichment CLI*: add
  `node bin/enrich.mjs oline add --year YYYY --team ABBR --lt "Name" --lg … --rt …` to the usage list.
- *Navigation map* → `enrichment/` description: change to
  `Hand-authored overlay: coaching.json, scheme.json, oline.json, injuries.json, notes.json`.
- *Cross-repo contracts* → **Enrichment schemas** row: extend the "This repo" cell with
  `+ oline.json (projected OL unit per year/team, capture-only)` and the "App counterpart" cell
  with `loadEnrichment fetches a fixed four-file list — must tolerate the new oline.json file
  (present or absent) and, if a loader is added, treat it strictly capture-only (never feed
  projectedPPG/dynasty); mirror field names/shapes exactly.`
- *Self-maintenance*: no rule change needed; the signal-registry flag is covered by the existing
  instruction (this plan's task summary will carry the Source/Coverage/Reconstructable note).

**`enrichment/README.md`**
- *Files* table: add row `| \`oline.json\` | One entry per (team, year): projected starting
  offensive line. Capture-only. |`.
- *Adding entries*: add the `oline add` example.
- Add a one-line capture-only note near the top mirroring the README bold note.

*(If, when implementing, any of the above wording already exists, upsert it rather than
duplicate — there are no current oline references to collide with, verified.)*

---

## 6. Tests to add (smoke / validation coverage — `node --test`, not Vitest)

This repo runs `node --test` (`npm test`) and `npm run smoke` (which includes
`node bin/enrich.mjs validate`). Two buckets:

**(a) Validation coverage — exercised by `npm run validate:enrichment` / `npm run smoke`.**
`validateAll` now covers `oline`. Add a `node:test` file `test/enrichment-oline.test.mjs`
(mirroring how the enrichment helpers are unit-tested) asserting, via `validateEntry`/`validateAll`
against in-memory fixtures:
| Check | Input | Expected |
|---|---|---|
| Happy path | full 5-slot unit, valid team/year | passes |
| **Missing field** (name-only slot) | a slot with `name` but no `playerId` | passes (playerId optional) |
| **Empty unit** | `projectedStarters: []` | throws "non-empty array" |
| Invalid slot | a slot `"FB"` | throws "invalid slot" |
| Duplicate slot | two `LT` | throws "duplicate slot" |
| **Empty file** (initial state, "empty scheme" analog) | `oline.json` = `{…,"entries":[]}` | `validateAll` passes (0 entries — OK) |
| **(year,team) duplicate** | two entries same year+team | `validateAll` throws "duplicate (year, team) pair" |
| **Traded player mid-window** | same `name`/`playerId` in `(2026,SF)` and `(2027,WAS)` | both valid; no cross-entry mutation (asserts capture is contemporaneous, not corrected on trade) |
| playerMap independence | slot `playerId` absent from `playerMap` | passes (no skill-map coupling) |

Smoke itself needs **no new line** — `node bin/enrich.mjs validate` already runs in
`npm run smoke` and now validates the (initially empty, then populated) `oline.json`. Optionally
add `node bin/enrich.mjs oline add --year 2026 --team SF --lt … --dry-run` to the smoke chain for
CLI-path parity; recommend leaving smoke lean and relying on `npm test` for the CLI path.

**(b) Capture-only guard — `test/enrichment-capture-only.test.mjs` (runs under `npm test`).**
Spirit of `test/nflverse.test.mjs:504` ("capture-only; not nulled"), but enforcing
*non-consumption*:
- Reads the source text of `lib/grade.mjs`, `scripts/grade-snapshot.mjs`, `lib/backtest.mjs`,
  `scripts/backtest-run.mjs`, `lib/fantasyPoints.mjs` and asserts none contain `oline`,
  `projectedStarters`, or `enrichment/oline`. **Fails loudly if a future session wires OL into a
  projection/grading path.**
- Asserts `NUMERIC_FACTOR_KEYS` (from `lib/grade.mjs`) contains no oline-derived key.
- Inputs: the on-disk module sources + the exported const. Expected: all assertions pass today;
  the test is the tripwire for accidental activation.

---

## 7. Cross-repo impact

These fields land in jsDelivr-served files (`enrichment/oline.json`, plus the `manifest.json`
entry) that `sleeper-dashboard` consumes.

- **Contract touched:** **Enrichment schemas** (CLAUDE.md Cross-repo contracts) —
  app side: `src/api/enrichment.js` (`loadEnrichment`), `src/utils/enrichmentLookup.js`.
- **What a future `sleeper-dashboard` session MUST mirror:**
  1. **Tolerate-and-ignore now.** `loadEnrichment` fetches a fixed four-file list; it must not
     assume the enrichment set is exactly those four, and must tolerate the new served
     `enrichment/oline.json` (and its `manifest.json` entry) being present *or* absent. No app
     change is required for banking — the file is served but unconsumed until a deliberate task.
  2. **Exact shape, when consumed.** If/when a loader is added, mirror the field
     names/shapes verbatim: `{ id, year, team, capturedAt, projectedStarters:
     [{ slot:"LT|LG|C|RG|RT", name, playerId:string|null, depthOrder:int }], source, notes }`,
     one entry per (year, team).
  3. **Strictly capture-only.** OL must never feed `projectedPPG` or dynasty scoring — display/
     diagnostic only, exactly like the advstats `factors` and aDOT capture-only families.
- **Signal registry flag** (app repo `docs/signal-registry.md`) — add a row for the new
  ingest-layer capture:
  - **Source:** hand-authored enrichment (`enrichment/oline.json`).
  - **Historical coverage:** contemporaneous-only, no backfill; absent from past snapshots by design.
  - **Reconstructable-vs-ephemeral:** **ephemeral** (preseason projected OL unit; realized snap
    counts are a separate, reconstructable outcome signal and are explicitly out of scope).
  - **Layer/coverage:** capture-only; not consumed by any projection/grading path.

---

## 8. Explicitly out of scope (restated)

- Weekly injury designation / any in-season short-horizon capture — separate decision.
- Activating, consuming, or grading any of this now; `projectedPPG`, dynasty scoring, app code.
- Re-capturing HC/OC/QB1 identity (banked) or scheme schema (already enabled) — documentation
  only for those.
- Any historical backfill of OL units.
