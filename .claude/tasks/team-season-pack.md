# E7: a precomputed team-season pack — routing decision, draft CR-22, and the plan

**Type:** a new served family + a new cross-repo contract. **Read §0 before anything else.**
**New file, new schemaVersion, new app loader, new registry entry. Additive — the week grain stays.**
**Session model:** plan (opus, this file). Implementation is a separate sonnet session — do not edit
source here.
**Source:** `store-audit-2026-08-25.md` **E7**, queue row 13. Measured against live source and live
data 2026-09-03 at HEAD `81ea244` (data) / `969a6ef` (app).

**Working-tree note.** `store-audit-2026-08-25.md` is modified and uncommitted. **Do not stage,
commit, revert or edit it.** Nothing here touches it.

---

## 0. The routing question — answered

The audit attaches a process note to E7:

> This introduces a cross-repo coupling the registry does not list, which by CLAUDE.md's workflow
> convention is the one case that routes to the Claude.ai project for a draft registry entry before
> it becomes a plan.

**On the facts, the audit is right — this is a new coupling, not an extension of CR-10.** CR-10's
`Invariant` pins a *specific* shape:

> served shape (`{ schemaVersion: 1, season, generatedAt, rowCount, teamCount, teams }`; `teams` keyed by **era-accurate** team abbr → `{ games[] }`; each game `{ week, seasonType, gameId, opponent, off:{…}, def:{…} }`; weeks continuous REG→POST) and the shared `MIN_TEAMCONTEXT_ROWS = 60` floor match on both sides.

A season-summary pack is a **different file, a different grain (`(team, season)` vs `(team, week)`),
and a different invariant**. CR-10 cannot absorb it without its `Invariant` ceasing to mean anything.
Note CR-10's App side *already names* `useTeamHistoryLoader.js` — the consumer E7 targets — so the
**consumer** is in scope while the **new artifact** is not. That is exactly what "new coupling" means
here.

**On the routing, the rule's letter and its purpose diverge.** CLAUDE.md gives the reason:

> A repo-scoped subagent can check a plan against a known list, but it cannot reason about a coupling
> that has never been written down, and it cannot read the sibling tree to discover one. Take that
> case to the Claude.ai project, which can hold both repos at once.

**This planning session holds both repos.** It has read live `src/` throughout — the E2 work depended
on it, and Phase A was reviewed by the *app repo's own* plan-reviewer from here. The capability gap
the routing exists to bridge does not exist in this session; it exists for the **plan-reviewer
subagent**, which is repo-scoped by mandate.

**An earlier version of this section argued that §2 could draft CR-22 here, because this session
holds both repos. That argument was reviewed, lost, and is withdrawn — see §0.1.**

### 0.1 · Why the deviation was rejected — and the evidence is in this file

The reviewer's counter-argument is better, and it is empirical rather than procedural:

> The routing rule's product is not the reading — it's **an entry whose far side is authored by
> something that can see the far side**… **CR-22's app side is the part that came out
> underspecified.** It names "a new loader in `src/api/`" and "its validator in `src/api/`" — no
> file, no symbol. The entry-format definition says triggers "are always concrete paths, exported
> symbols, constant names or served JSON paths — **never a category**," and the far side "must be
> correct in this registry… never by re-deriving [it] at review time." So the one field the routing
> exists to get right is the one this draft leaves as a category, on the side no reviewer will ever
> fix.

**That is decisive.** This session claimed the capability the routing exists to obtain, then did not
use it on the only field that mattered. A second point stands too: the claim licensing the deviation
("this session has read live `src/`") is **unverifiable by the gate it is addressed to**, which is
the class of assertion the registry exists to eliminate.

**Decision: E7 routes.** §2 below is a *partial* draft — data side, Invariant, Direction and
data-side Triggers are usable; **the App side and app-side Triggers must be authored against live
`src/` by something that can read it.** `.claude/tasks/team-season-pack-routing-brief.md` is the
hand-off.

**§3–§11 are on hold** and require rework regardless: the review found the rebuild mechanism
impossible as designed, two wrong envelope numbers, an unspecified minify, a missing era-domain
guard, and an unnamed Invariant-1 exception. They are kept for the measurements and the design
reasoning, **not as an implementable plan.**

---

## 1. Verified facts

### 1.1 · The payload, measured

| | raw | gzipped | requests |
|---|---|---|---|
| `nflverse/teamcontext/<year>.json` × 14 | **12.79 MB** | **1.26 MB** | **14** |
| derived pack | **172 KB** | **32 KB** | **1** |
| reduction | 76× | **41×** | 14 → 1 |

The audit estimated *"≈120 KB … roughly a 100× reduction"*. **172 KB and 41× on the wire** — the size
estimate was optimistic and the reduction was quoted on the raw axis. **Gzip is what jsDelivr
serves**, so the honest headline is **~1.23 MB and 13 round trips saved** on the team-detail route.

Larger than E2's ~4.3 MB? No — but E2 was a whole-family rewrite, and this is one route.

### 1.2 · What the app actually reduces to

`src/utils/environment.js`:

- `OFF_SUM_FIELDS` — **17** fields summed over REG games: `plays`, `passPlays`, `proeXpassSum`,
  `proePlays`, `neutralSeconds`, `neutralGaps`, `successes`, `successPlays`, `rzTdTrips`, `rzTrips`,
  `epaSum`, `epaPlays`, `passEpaSum`, `passEpaPlays`, `rushEpaSum`, `rushEpaPlays`, `pointsScored`
- `sumRegDef` — **2**: `epaSum`, `epaPlays`
- plus `games` (the REG game count `sumRegOff` returns)

**20 numbers per team-season**, from ~17 game rows each carrying two nested objects. 32 teams ×
14 seasons.

Both reducers filter `seasonType === 'REG'` — **the pack is regular-season only**, and that must be
stated in its own invariant, not inferred.

### 1.3 · The pack cannot live in `nflverse/teamcontext/`

`test/manifest.test.mjs:66-72` maps `nflverse/teamcontext` → `MIN_TEAMCONTEXT_SEASON` in
`FAMILY_FLOORS` and asserts **contiguous year coverage** across exactly ten families. That directory
is year-keyed by contract. A non-year file there is at best ignored and at worst a reconciliation
failure.

**Serve it at `nflverse/team-season-summary.json`** — a sibling, single file, not year-keyed, not a
family.

### 1.4 · It cannot be written by the per-season ingest

`scripts/update-teamcontext.mjs` writes **one season at a time** and now runs through
`runSeasonKeyedIngest`. The pack spans all seasons, so it must be **derived from the 14 files on
disk after any of them changes** — a rebuild-all step, not a per-season write.

That makes its freshness a real hazard: **the pack can silently lag the week grain**, and the two
would then disagree on a page that shows both.

---

## 2. Draft CR-22 — the new registry entry

**PARTIAL — the App side and app-side Triggers are placeholders and must not land as written**
(§0.1). Data side, Invariant, Direction and data-side Triggers are usable as a starting point.

```
#### CR-22 · Team-season summary pack
- **App side:** ⚠️ PLACEHOLDER — must name concrete files and exported symbols, authored against live `src/`. Known anchors: `src/utils/environment.js` (`OFF_SUM_FIELDS`, `sumRegOff`, `sumRegDef`, `computeTeamSeasonMetrics`, `buildTeamMetricsTable`, `buildLeagueRankTable`), `src/hooks/useTeamHistoryLoader.js`. The new loader and its validator do not exist yet and must be named when they do.
- **Data side:** `nflverse/team-season-summary.json`, `scripts/build-team-season-summary.mjs` (the deriver), `lib/teamSummary.mjs` `summariseTeamSeasons` (the pure reduction), `lib/validate.mjs` `validateTeamSeasonSummary`, `.github/workflows/nflverse-teamcontext.yml` (rebuilds the pack after any season write)
- **Invariant:** every value in the pack equals what `environment.js`'s `sumRegOff`/`sumRegDef` would compute from `nflverse/teamcontext/<year>.json` for the same `(team, season)` — **regular season only** (`seasonType === 'REG'`), 17 offence sums + 2 defence sums + the REG game count. The pack is a **cache of a derivation, never a second source of truth**: when it disagrees with the week grain, the week grain is right.
- **Direction:** data→app
- **Triggers:** the new loader and its validator in `src/api/`, `OFF_SUM_FIELDS` and `sumRegDef` in `src/utils/environment.js`  ‖  `scripts/build-team-season-summary.mjs`, `summariseTeamSeasons` in `lib/teamSummary.mjs`, `validateTeamSeasonSummary` in `lib/validate.mjs`, `nflverse/team-season-summary.json`
- **Mirror:** This pack is **derived, not sourced** — it duplicates numbers that also exist in `nflverse/teamcontext/<year>.json`, so the only failure that matters is **drift**, and drift is silent on both sides. Adding a field to `OFF_SUM_FIELDS` app-side without regenerating the pack yields a column of zeros with no error; regenerating the pack from a changed `aggregateTeamContext` without telling the app yields numbers that disagree with the week-grain view rendered beside them. **Any change to the summed field set is a both-repos change in the same cycle.** The pack is regular-season only; a consumer wanting POST must read the week grain (CR-10), not extend this file. If the pack is missing or stale the app must fall back to the week grain rather than render zeros — **absence is recoverable, silent disagreement is not.**
```

**On CR-22's `Direction: data→app`** — that makes it one of the silent ones from this repo's seat:
nothing here fails when it drifts. Its `Mirror` says so explicitly, because the drift *is* the
contract.

---

## 3. The decisions

### 3.1 · Derive from the served files, not from pbp

`summariseTeamSeasons` reads `nflverse/teamcontext/<year>.json` — **the same bytes the app would
have** — and reduces them. Not a re-derivation from play-by-play.

That is what makes the invariant checkable: the pack is a pure function of files already on disk, so
§6's equivalence test can recompute it and compare. Re-deriving from pbp would introduce a second
path to the same numbers and the drift would be unfalsifiable.

### 3.2 · Port the reducers, do not reinvent them

`lib/teamSummary.mjs` implements `sumRegOff`/`sumRegDef` **as `environment.js` implements them
today** — same 17 + 2 fields, same `seasonType === 'REG'` filter, same `?? 0` coalescing. The field
list is the contract (CR-22's Triggers name it on both sides).

**Do not "improve" the reduction while porting it.** `?? 0` on a missing field is load-bearing: it is
what makes a season with a missing stat sum to a number rather than `NaN`.

### 3.3 · The app keeps the week-grain fallback

CR-22's Mirror requires it: if the pack is absent or fails validation, the app falls back to
`useTeamHistoryLoader`'s 14-season fetch. **Absence must degrade to slow, never to wrong.**

That also means Phase-A-style expand/migrate sequencing is unnecessary here — the pack is **additive**
and the app works without it. **The app change can land before or after the data change**, which is
what makes this materially simpler than E2.

### 3.4 · Rebuilt by the teamcontext workflow, after any season write

`.github/workflows/nflverse-teamcontext.yml` gains a step: after the ingest, run the deriver and
commit the pack alongside. The pack is then always at most one workflow run behind the week grain,
and never ahead of it.

**`--all` backfills must rebuild it too**, which is why the deriver is a standalone script rather
than a step inside `runSeasonKeyedIngest`.

### 3.5 · Alternatives rejected

| option | rejected because |
|---|---|
| Put the pack in `nflverse/teamcontext/` | §1.3 — that directory is year-keyed and family-reconciled |
| Derive inside `update-teamcontext.mjs` | §1.4 — it writes one season; the pack spans all, including under `--all` |
| Re-derive from pbp | §3.1 — a second path to the same numbers makes drift unfalsifiable |
| Ship it as a replacement, dropping the week fetch | §3.3 — the week grain has five other consumers (CR-10); this is additive |
| Extend CR-10 instead of a new entry | §0 — CR-10's Invariant is a precise shape statement about a different file at a different grain |
| Per-season pack files | Defeats the point: 14 requests is the cost being removed |

---

## 4. The edits

### 4.1 · `lib/teamSummary.mjs` (new)

`summariseTeamSeasons(byYear)` — pure, no I/O. Takes `{ [year]: teamcontextFile }`, returns
`{ [year]: { [team]: { …17 off sums, defEpaSum, defEpaPlays, games } } }`. Ports §3.2's reducers
verbatim.

### 4.2 · `scripts/build-team-season-summary.mjs` (new)

Reads every `nflverse/teamcontext/<year>.json`, calls `summariseTeamSeasons`, writes the envelope,
registers the manifest entry. `--dry-run` reports per-season team counts and the output size.
**Content-hash dedup** like every other writer — a rebuild that changes nothing must not commit.

Envelope, following this repo's conventions (`rowCount` = source rows, a family `*Count` beside it):

```json
{ "schemaVersion": 1, "generatedAt": "…",
  "rowCount": 7168, "seasonCount": 14, "teamCount": 32,
  "seasons": { "2024": { "KC": { "plays": 1067, …, "defEpaSum": …, "defEpaPlays": …, "games": 17 } } } }
```

`rowCount` is the total REG team-game rows consumed — the provenance link back to the week grain.

### 4.3 · `lib/validate.mjs` — `validateTeamSeasonSummary`

Asserts: `seasonCount` and `teamCount` match the data; every season has ≥ 30 teams (32 modern, fewer
never — but leave headroom for an in-progress season); **every team-season carries all 20 keys**; all
values finite; `games` ≤ 18.

### 4.4 · `.github/workflows/nflverse-teamcontext.yml`

Per §3.4 — rebuild + commit the pack after the ingest step, in the same job, with the pack's path
added to the purge list.

### 4.5 · `data-catalog.md`

A new family row: served path, deriver, grain, the REG-only scope, and that it is a **derived cache**
whose source of truth is CR-10's week grain.

### 4.6 · The registry — both repos

Add CR-22 (§2) to `README.md` and `docs/cross-repo-registry.md`, **byte-identical**, in one change.
**Update the entry-count line** if the registry states one ("all 21 `CR-NN` entries" appears in the
app's `CLAUDE.md:227` — that becomes 22).

---

## 5. Step order

1. **Land CR-22 in both repos first** (§4.6). The entry is the contract; writing code against an
   unwritten contract is what §0 exists to prevent. Anchored region diff = zero bytes.
2. `lib/teamSummary.mjs` (§4.1) + unit tests porting `environment.js`'s reducers.
3. **The equivalence test (§6.1) — before the deriver writes anything.** For all 14 seasons × 32
   teams, assert `summariseTeamSeasons` equals an independent reduction of the same files.
4. `scripts/build-team-season-summary.mjs` (§4.2); `--dry-run` across all 14.
5. `validateTeamSeasonSummary` (§4.3); wire it into the deriver.
6. Generate the pack for real. Verify size (~172 KB) and the manifest entry.
7. `data-catalog.md` (§4.5); the workflow step (§4.4).
8. `npm test`, `npm run smoke`. Commit; `git -c rebase.autoStash=true pull --rebase origin main`;
   push. **Purge `manifest.json` first, then `nflverse/team-season-summary.json`.**
9. **App side is a separate slice** — the loader, the validator, and the `useTeamHistoryLoader`
   bypass. §3.3 makes the ordering free: the pack can sit unread until the app is ready.

**Step 1 before step 2, and step 3 before step 4.** The first is the routing convention's whole
point; the second is the only proof the pack is not a second source of truth.

---

## 6. Tests

### 6.1 · The equivalence test — the one that matters

For every `(team, season)` in all 14 files: `summariseTeamSeasons`' output equals a reduction
computed independently in the test from the same file. **Assert all 20 values, not a sample.**
32 × 14 = 448 team-seasons.

This is CR-22's `Invariant` made executable, and it is the only thing standing between "a cache" and
"a second source of truth that drifts".

### 6.2 · Others

- REG-only: a fixture with POST games contributes nothing to the sums.
- Missing-field coalescing: a game missing an `off` key sums as 0, not `NaN` (§3.2).
- `validateTeamSeasonSummary` rejects a missing key, a non-finite value, a short season.
- Deriver dedup: a rebuild with unchanged inputs writes nothing.

---

## 7. Cross-repo impact

**CR-22 is created by this slice** (§2, §4.6) — that is the coupling being written down.

**CR-10 fires.** Its data side names `nflverse/teamcontext/<year>.json`, which §3.1's deriver now
reads. Its shape does not change, and its Mirror's hazards are untouched — but the new pack is a
second consumer of that family and CR-10's data side should say so.

> Shape or floor changes land in both repos together. **First TEAM-keyed family** — row identity is `(team, week)`, not `sleeper_id`; do not force it through player-keyed loader helpers. Per-week rates are single-game values: aggregate the `*Sum`/`*Plays` components, never sum or average stored rates. **`rushPlays` is a counting component, not a rate — safe to sum directly across weeks**, unlike its rate siblings. View-only on both sides. Team-key domain is CR-16.

**Note how directly this Mirror bears on the pack.** *"Per-week rates are single-game values:
aggregate the `*Sum`/`*Plays` components, never sum or average stored rates."* The pack stores
**exactly** those components — `epaSum`/`epaPlays`, `proeXpassSum`/`proePlays`,
`successes`/`successPlays` — and **no rates**. That is not incidental: a pack storing `epaPerPlay`
would violate CR-10's Mirror, and the app must keep dividing at read time.

**CR-18 fires** — a new served family, a new ingest script, and a `data-catalog.md` row. The emitted
`docs/signal-registry.md` row edit:

> **team-season summary (`nflverse/team-season-summary.json`)** — *Layer*: derived cache. *Source*: reduced from `nflverse/teamcontext/<year>.json` (CR-10), not from pbp. *Coverage*: 2012–2025, **regular season only**. *Reconstructable*: fully — it is a pure function of the week grain and can be rebuilt at any time. *Current use*: the team-detail route's 14-season window, replacing 14 fetches with 1.

---

## 8. Done-definition

**The contract**
- [ ] CR-22 added to **both** repos, byte-identical; anchored region diff = zero bytes
- [ ] Registry entry-count references updated (app `CLAUDE.md:227` says "all 21")
- [ ] **Landed before any deriver code** (§5 step 1)

**The derivation**
- [ ] `summariseTeamSeasons` ports `environment.js`'s 17 + 2 fields and its `REG` filter **verbatim**,
      `?? 0` coalescing included
- [ ] **Equivalence test over all 448 team-seasons, asserting all 20 values** (§6.1)
- [ ] Pack derived from the **served files**, not from pbp (§3.1)
- [ ] Envelope: `rowCount` = REG team-game rows consumed, plus `seasonCount` / `teamCount`
- [ ] Stores **components only, no rates** — CR-10's Mirror (§7)
- [ ] **Regular season only**, asserted by a POST-bearing fixture
- [ ] Deriver dedups on content hash

**Landing**
- [ ] `validateTeamSeasonSummary` wired into the deriver
- [ ] `nflverse-teamcontext.yml` rebuilds and commits the pack, including under `--all`
- [ ] `data-catalog.md` row, stating it is a derived cache whose truth is CR-10
- [ ] Pack ≈172 KB; manifest entry registered
- [ ] Purge **`manifest.json` first**, then the pack
- [ ] `npm test` green; `npm run smoke` green
- [ ] **No app-repo source change** — that is a separate slice (§5 step 9)
- [ ] `store-audit-2026-08-25.md` still modified-and-uncommitted, untouched

---

## 9. Settled decisions

- **The coupling is written down before it is planned** (§0, §5 step 1) — the routing rule's substance.
- **Drafted in this session, not the Claude.ai project** (§0) — this session holds both repos, which
  is the capability the routing exists to obtain. **Overrulable.**
- **New entry, not an extension of CR-10** (§0) — different file, grain and invariant.
- **`nflverse/team-season-summary.json`**, outside the year-keyed family directory (§1.3).
- **Derived from the served files** (§3.1) — makes the invariant checkable.
- **Components only, never rates** (§7) — CR-10's Mirror says so directly.
- **Additive; the app keeps its week-grain fallback** (§3.3) — absence degrades to slow, never wrong,
  and that is why no expand/migrate sequencing is needed.

---

## 10. Invariant check

- **Invariant 1 (append-only)** — the pack is a *new* file; no historical file is rewritten. Its own
  regeneration overwrites only itself, which is correct for a derived cache.
- **Invariant 3 (manifest is the index)** — one new entry, `recordCount` = REG team-game rows.
- **Invariant 4 (schemaVersion)** — new family at v1. No existing family moves.
- **CDN purge** — a *new* file self-serves on first request, but the **manifest** is an overwrite and
  must be purged. §5 step 8.
- **The derived-cache question** — this is the repo's first artifact that duplicates numbers held
  elsewhere. CR-22's `Invariant` and §6.1's test exist precisely to keep "cache" from becoming
  "second source of truth"; that is the whole risk of this slice.

---

## 11. Out-of-scope observations (not edits)

1. **The app-side slice is genuinely separate and safe to defer** (§3.3, §5 step 9). Until it lands,
   the pack is written and unread — which is a legitimate state for an additive cache, and lets the
   data side be verified on its own.
2. **This is the repo's first derived duplicate.** Every other family is a distinct source. If the
   pattern spreads, "derived cache" deserves a first-class convention — a naming rule, a mandatory
   equivalence test, a `derivedFrom` manifest field — rather than being re-argued per artifact.
3. **`useTeamHistoryLoader` fetching 14 seasons is only the team-detail route.** CR-10's App side
   lists five other consumers on a five-season window; none of them is helped by this pack, and none
   is harmed.
