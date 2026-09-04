# Claude.ai loop removal — data-repo mirror half

**Repo:** `sleeper-dashboard-data` · **Size:** M · **Risk:** process-only (no product/runtime behaviour change)
**Scope:** docs + agent config only. **No edits under `lib/`, `scripts/`, or `bin/`.**

The sibling repo (`sleeper-dashboard`) removed the external Claude.ai project from the standard dev loop and replaced it with an in-repo mechanism: an enumerated cross-repo contract registry (`docs/cross-repo-registry.md`, 18 `CR-NN` entries) plus a three-part plan-reviewer mandate. That change has shipped app-side. This task adopts the mirror half so the two repos agree.

Division of authority:

- The **app repo owns the registry format definition** and prints the full body.
- This repo **mirrors the format and all 18 entries byte-for-byte**, in `README.md` (this repo has no `docs/` tree).
- **App-side content is frozen authority** — this repo cannot read `src/`, so app-side trigger lists and app-side facts are copied exactly, never "tidied" or re-derived.
- **Data-side facts are this repo's responsibility** — they were verified against live source in §1 below before this plan was written.

---

## 1. Verification ledger — data-side facts in the embedded spec

Every data-side fact the embedded mirror spec asserts (and which no app-repo reviewer could have checked, since it cannot read this tree) was verified against live source. One mismatch found; see §1.9.

### 1.1 Manifest-registrar set (CR-04) — **VERIFIED**

Claim: 13 `scripts/update-*.mjs`; 12 of 13 register through `updateManifestEntry`; `update-enrichment.mjs` does **not**; plus three non-`update-*` registrars.

- **13 `scripts/update-*.mjs` — verified.** `ls scripts/update-*.mjs` → 13: `advstats, cfbd, draft, enrichment, gamelogs, ktc, nfl, oline, playerids, playerstate, roster, schedule, teamcontext`.
- **12 of 13 register — verified.** `updateManifestEntry` callers among `scripts/update-*.mjs`: `update-nfl.mjs`, `update-advstats.mjs`, `update-roster.mjs`, `update-ktc.mjs`, `update-gamelogs.mjs`, `update-cfbd.mjs`, `update-oline.mjs`, `update-teamcontext.mjs`, `update-schedule.mjs`, `update-draft.mjs`, `update-playerstate.mjs`, `update-playerids.mjs` = 12.
- **`update-enrichment.mjs` does NOT register — verified.** Absent from the caller set; enrichment registers via `lib/enrichment.mjs` instead.
- **Three non-`update-*` registrars — verified at** `scripts/register-snapshots.mjs`, `scripts/grade-snapshot.mjs`, `lib/enrichment.mjs`. (`lib/manifest.mjs` also matches the grep but is the definition site, not a caller.)
- **Definition anchors — verified at** `lib/manifest.mjs:19` (`readManifest`), `lib/manifest.mjs:34` (`updateManifestEntry`) — both match the registry's cited anchors.

### 1.2 `buildInBasisOutcomes` location (CR-14) — **VERIFIED**

- Exported from **`scripts/grade-snapshot.mjs:87`** — matches the registry's `buildInBasisOutcomes:87`.
- Consumed by **`scripts/panel-run.mjs:92`** (imported at `scripts/panel-run.mjs:24`) — matches the registry's "its call site in `scripts/panel-run.mjs`" and the cited `:92`.
- Also consumed in-repo by in-basis grading at `scripts/grade-snapshot.mjs:131` and `:431` — both cited anchors correct.
- The port import is at **`scripts/grade-snapshot.mjs:20`** (`import { calculateFantasyPoints, RATE_KEYS } from '../lib/fantasyPoints.mjs'`) and is applied at `:109` inside the builder — both cited anchors correct.
- Port definition anchors — verified at `lib/fantasyPoints.mjs:9` (`calculateFantasyPoints`) and `lib/fantasyPoints.mjs:21` (`RATE_KEYS`).

### 1.3 `eraTeam` location (CR-16) — **VERIFIED**

- **Defined in `lib/nflverse.mjs:958`** — matches the registry's `eraTeam:958` (**the definition**).
- **Applied downstream in the same file at `lib/nflverse.mjs:1084-1087`** (`posteam`/`defteam`/`homeTeam`/`awayTeam` pbp remap) — matches the cited `:1084-1087`.
- **NOT in `scripts/update-teamcontext.mjs`** — verified: the only occurrence there is a header comment at `scripts/update-teamcontext.mjs:13`. The registry's explicit note that this script is *not* a trigger "despite owning the teamcontext ingest" is correct as written.

### 1.4 Five shared sparsity constants (CR-06…CR-10) — **VERIFIED**

Defined in `lib/nflverse.mjs`, enforced in `lib/validate.mjs`; every cited anchor matches live source exactly:

| Constant | Registry anchor | Verified at | Enforced at |
|---|---|---|---|
| `MIN_ROSTER_IDS = 1500` | `lib/nflverse.mjs:18` | `lib/nflverse.mjs:18` ✓ | `lib/validate.mjs:310` (`validateRoster:307`) |
| `MIN_ADVSTATS_ROWS = 250` | `lib/nflverse.mjs:35` | `lib/nflverse.mjs:35` ✓ | `lib/validate.mjs:409` (`validateAdvStats:407`) |
| `MIN_SCHEDULE_GAMES = 200` | `lib/nflverse.mjs:45` | `lib/nflverse.mjs:45` ✓ | `lib/validate.mjs:439` (`validateSchedule:435`) |
| `MIN_PLAYERGAME_ROWS = 3000` | `lib/nflverse.mjs:48` | `lib/nflverse.mjs:48` ✓ | `lib/validate.mjs:470` (`validateGameLogs:467`) |
| `MIN_TEAMCONTEXT_ROWS = 60` | `lib/nflverse.mjs:53` | `lib/nflverse.mjs:53` ✓ | `lib/validate.mjs:508` (`validateTeamContext:504`) |

All five are imported into `lib/validate.mjs` at `:295-296`. Every `validate*` anchor the registry cites also checks out: `validateNflSeason:100`, `validateCfbdCategory:204`, `validateKtc:237`, `validateRoster:307`, `validateDraft:339`, `validateAdvStats:407`, `validateSchedule:435`, `validateGameLogs:467`, `validateTeamContext:504`, `validateEnrichmentShape:747`, `findNonFinite:69`.

CR-18's five coverage-floor constants also verified: `MIN_DRAFT_YEAR:25`, `MIN_SCHEDULE_SEASON:38`, `MIN_GAMELOG_SEASON:50`, `MIN_TEAMCONTEXT_SEASON:55`, `MIN_OLINE_SEASON:60` — all exact.

### 1.5 `aggregateWeeks` producer loop (CR-11…CR-13) — **VERIFIED**

- `aggregateWeeks` exported at **`lib/sleeper.mjs:151`** — matches CR-02's `aggregateWeeks:151`.
- The generic sum-all-keys loop `for (const [key, val] of Object.entries(stats))` is at **`lib/sleeper.mjs:216`** — matches the `:216` anchor cited by CR-11, CR-12 and CR-13.
- The registry's rationale holds: `pass_cmp`, `rec_air_yd`, `off_snp`, `tm_off_snp`, `rec_rz_tgt`, `rush_rz_att`, `pass_rz_att` appear nowhere as literals in the producer path — the loop, not the key, is the only greppable trigger. Confirmed by grep across `lib/`, `scripts/`, `bin/`.
- CR-15's half-PPR verbatim claim also verified: `lib/sleeper.mjs:212` (`p.weeklyPoints[week] = stats.pts_half_ppr ?? 0`) and `:240-243` (`fantasyPoints` sum + `scoringBasis = 'half_ppr'`).

### 1.6 `SCHEDULE_TEAM_ALIAS` mirrored per `lib/sleeper.mjs` (CR-16) — **VERIFIED**

- **`lib/sleeper.mjs:22`** — `export const SCHEDULE_TEAM_ALIAS = { LAR: 'LA' };` — matches the registry's `SCHEDULE_TEAM_ALIAS:22`.
- **`lib/sleeper.mjs:25`** — `normalizeTeamForSchedule` — matches `normalizeTeamForSchedule:25`.
- **`lib/sleeper.mjs:21`** — the comment *"Mirrors the app's src/utils/nflStats.js SCHEDULE_TEAM_ALIAS exactly"* — the registry's `Mirror` text quotes this line and cites `:21`. Exact.
- Applied at **`lib/sleeper.mjs:261`** (`p.team = normalizeTeamForSchedule(resolvedTeam)`), producing the per-season `team` — matches CR-02's `:261`.
- Era-domain guard verified at `lib/validate.mjs:515` (comment header; the throw follows at `:517`).

### 1.7 `lib/validate.mjs` as the data-side shape-validator surface — **VERIFIED**

`lib/validate.mjs` holds the full validator surface mirroring the app's `isValid*` family: 13 exported validators (`validateNflSeason`, `validateCfbdCategory`, `validateKtc`, `validateRoster`, `validateDraft`, `validatePlayerIds`, `validateAdvStats`, `validateSchedule`, `validateGameLogs`, `validateTeamContext`, `validateOline`, `validatePlayersState`, `validateEnrichmentShape`). Consistent with the two preserved `> *Note:*` paragraphs: `validatePlayerIds` and `validateOline` exist but `playerids`/`oline` are deliberately **not** cross-repo contracts.

### 1.8 Other data-side anchors spot-checked — all **VERIFIED**

`lib/panel.mjs`: `buildTeamTotalsForSeason:75` (registry cites `:80` for the `isTeamAggregateId` filter — the filter is indeed on `:80`), `buildCohortPools:895`, `predictWithExponents:962`, `attachFactorMultipliers:998`, `selectFitFactors:1206`, RZ denominator accumulation `:87-88`. `scripts/panel-run.mjs`: `resolveScoring:68` (registry cites `:70-77` for the `snapshot.scoringSettings` reads — reads are at `:73`/`:77`, so the cited `:70-77` span is exact), `attachFactorMultipliers` call `:166`, `runFit:878`. `scripts/grade-snapshot.mjs`: `deriveTargetSeason:34`, envelope reads `:168`/`:231`/`:316`. `scripts/update-ktc.mjs`: `snapshotHash:39`, `ktcOrderingGuard:114`, `updateKtc:131`, `updateManifestEntry({ inProgress: true })` `:208-213`, quarantine path `:159`. `lib/ktc.mjs`: `fetchKtcSnapshot:76`. `lib/enrichment.mjs`: `validateEntry:164`, `validateAll:259`. `lib/backtest.mjs`: `isTeamAggregateId:13`. `lib/nflverse.mjs` CR-18 parsers: `parseRosterCsv:164`, `parseDraftCsv:258`, `parsePlayerIdsCsv:350`, `aggregateAdvReceiving:476`, `parsePlayerGameLogs:741`, `parseSchedulesCsv:866`, `aggregateTeamContext:1012`, `aggregateOlineStates:1307` — all eight exact. `.github/workflows/weekly-ktc.yml` exists.

### 1.9 **MISMATCH — `scripts/update-nfl.mjs` "the writer" anchor (CR-02, CR-11, CR-12, CR-13)**

**Registry claims:**
- CR-02 data side: `` `scripts/update-nfl.mjs` (the writer, `:49`/`:53`) ``
- CR-11 / CR-12 / CR-13 triggers: `` the writer `scripts/update-nfl.mjs:49` ``

**MISMATCH: those two lines are not the writer.** Live source:

| Line | Actual content |
|---|---|
| `scripts/update-nfl.mjs:35` | `const dataPath = \`nfl/season-totals/${year}.json\`;` — the served path |
| `scripts/update-nfl.mjs:49` | `const totals = aggregateWeeks(weekData);` — the **aggregate call site** |
| `scripts/update-nfl.mjs:53` | `validateNflSeason(totals, { year });` — the **validate call site** |
| `scripts/update-nfl.mjs:88` | `writeJsonStable(dataPath, totals);` — the **actual write** |
| `scripts/update-nfl.mjs:92` | `updateManifestEntry({ … })` — the manifest registration |

**Correct fact:** the writer in `scripts/update-nfl.mjs` is **`:88`** (`writeJsonStable`), with the served path built at `:35` and the manifest registered at `:92`. Lines `:49`/`:53` are the aggregate and validate call sites respectively.

**Severity: low, but real.** The file-level trigger (`scripts/update-nfl.mjs`) is correct, so nothing goes unreviewed; only the sub-line anchor is wrong. It is worth correcting because the data-repo reviewer's standing re-verification duty (§5, Part 3) will otherwise re-derive and re-flag this on every review of a season-totals change.

**Handling — do NOT fix it unilaterally in this change.** The mirrored region must diff byte-empty against the app's copy, and the registry's own rule is that entry edits land in **both** repos in the same change. So:

1. This change mirrors the region **exactly as the app has it today**, wrong anchor included.
2. The correction is emitted in §7 (Cross-repo impact) as an app-side registry correction for the sibling to apply, paired with the identical edit here in a follow-up change.

---

## 2. Files touched

| File | Change | Anchors |
|---|---|---|
| `README.md` | **Add** one new section between `## Versioning policy` and `## Enrichment overlay` | insert after `README.md:1074` (the `---`), before `README.md:1076` |
| `CLAUDE.md` | **Replace** `:241-266` with a pointer block | `CLAUDE.md:241-266` |
| `CLAUDE.md` | **Add** `## Workflow convention` between `## Sibling repo` and `## Done-definition` | insert after `CLAUDE.md:274`, before `CLAUDE.md:276` (`---`) |
| `CLAUDE.md` | **Edit** Done-definition item 4 | `CLAUDE.md:284` |
| `CLAUDE.md` | **Edit** three stale prose references | `CLAUDE.md:144`, `CLAUDE.md:221`, `CLAUDE.md:272` |
| `CLAUDE.md` | **Edit** the Self-maintenance cross-repo sentence (see D6 — not in the embedded spec; rationale given) | `CLAUDE.md:307` |
| `.claude/agents/plan-reviewer.md` | **Restructure** into the three-part mandate | whole file (24 lines) |
| `data-catalog.md` | **Fix** three dangling pointers left by relocating CLAUDE.md content into README.md (docs-integrity fix, not a family reclassification) | `data-catalog.md:8`, `data-catalog.md:44`, `data-catalog.md:199` |

**Apply the `CLAUDE.md` edits bottom-up** — D6 (`:307`) → D5 (`:284`) → D4 (insert after `:274`) → D3 (`:272`) → D2 (`:241-266`) → D1b (`:221`) → the nav-map row (`:144`) — so every anchor above stays valid as you go. The `README.md`, `data-catalog.md`, and `.claude/agents/` edits are independent of `CLAUDE.md` line numbers and can be done in any order.

**Production/verification split.** Session 2 produces the mirrored region by copying it from the embedded copy in §4 R1 below (pasted verbatim from the app repo's Session 1 output) — it does not read `../sleeper-dashboard` at all. The drift check that confirms the mirrored region diffs byte-empty against the app's live copy (§6 T1) is a **manual step the human runs**, since only the human has both repos checked out side-by-side; it is not a task for this session or either subagent, and no CI gate should be added for it.

---

## 3. Step sequence

1. **Copy the mirrored region** verbatim from the embedded copy in §4 R1 below — do not retype it, do not re-fetch it, do not read `../sleeper-dashboard`. Byte-identity is the whole point.
2. **`README.md`** — insert the new section (framing prose → mirrored region → the two `> *Note:*` paragraphs). §4 D1a.
3. **`CLAUDE.md`** — apply D6, D5, D4, D3, D2, D1b **in that order** (bottom-up), then the nav-map row edit at `:144`.
4. **`.claude/agents/plan-reviewer.md`** — replace with the three-part mandate. §5.
5. **`data-catalog.md`** — fix the three dangling pointers left by the relocation. §4 D7.
6. **Verify** — run `npm run smoke` (§6 T2); the drift check (§6 T1) is a manual step for the human to run afterward, not part of this session.
7. **Commit** per CLAUDE.md → *Session git workflow* (`feat: cross-repo registry mirror + workflow convention`). No served data files are written, so **no CDN purge** is needed (step 5 of that workflow does not apply).

---

## 4. Docs updates

Every `README.md`, `CLAUDE.md` and `data-catalog.md` edit, with concrete before/after text.

### R1 — The mirrored region (embedded, not fetched)

The 173-line span below — both sentinels included — is pasted verbatim from the app repo's Session 1 output for this same change. Session 2 copies it byte-for-byte into `README.md` at the position marked in D1a; it does not read `../sleeper-dashboard` to obtain it, and does not regenerate or re-derive it. Do not reflow, re-wrap, re-indent, or "fix" anything inside it — including the anchor identified in §1.9.

After both repos have landed their halves, the human runs the drift check (§6 T1) from a machine with both repos checked out side-by-side to confirm this copy is byte-empty-diff against the app's live `docs/cross-repo-registry.md`. That confirmation is out of scope for this session.

### D1a — `README.md`: new section

**Where:** between the `---` at `README.md:1074` and `## Enrichment overlay` at `README.md:1076`.

**Insert exactly this** (the full 173-line mirrored region from R1 is embedded below, verbatim):

````markdown
## Cross-repo contract registry (with sleeper-dashboard)

This repo cannot edit the app. The registry below is the **complete enumerated list** of contracts the two repos share, and it is byte-identical to the copy in `sleeper-dashboard/docs/cross-repo-registry.md` — `sleeper-dashboard` owns the format definition; this repo mirrors it exactly. (The app keeps its copy under `docs/`; this repo has no `docs/` tree and keeps it here, per CLAUDE.md's push-detail-into-README rule. Only the host file differs — the format and every entry are identical.) It is the sole authority for what the app must mirror; the plan-reviewer subagent checks against this list and never reads the sibling tree. Its **data-side** trigger lists are a maintained cache this repo's reviewer re-verifies against live `lib/`/`scripts/`/`bin/` on every review; the **app-side** lists are frozen authority here, since `src/` is unreachable from this repo.

**Rule.** Any change touching a listed contract **must emit that entry's `Mirror` text as Session 1 output**, in a `## Cross-repo impact` section of the task file, quoting the `CR-NN` id.

**A coupling that is not listed here does not exist for review purposes.** Introducing a genuinely new cross-repo coupling is the one residual case that routes to the Claude.ai project — see CLAUDE.md → Workflow convention.

Everything between the two sentinel comments below is the **mirrored region**, byte-identical to `sleeper-dashboard/docs/cross-repo-registry.md`; the drift check diffs exactly that span. Repo-specific text — this framing, the non-entry notes that follow, the next heading — stays outside the sentinels.

<!-- CR-REGISTRY-BEGIN -->

## Entry format

Field order is fixed; no field is optional.

```
#### CR-NN · <short contract name>
- **App side:** <files / symbols / constants in sleeper-dashboard>
- **Data side:** <files / scripts / served paths in sleeper-dashboard-data>
- **Invariant:** <the single thing that must stay true across both repos>
- **Direction:** app→data | data→app | both
- **Triggers:** <app-side paths/symbols>  ‖  <data-side paths/symbols>
- **Mirror:** <instruction to emit for the other repo when this entry is touched>
```

- **Ids are permanent.** Never renumbered, never reused. A retired contract keeps its id and starts its `Invariant` with `**RETIRED (<date>):**`. An id present in one repo's registry and absent from the other *is* the drift signal.
- **`Direction`** — `app→data`: the app defines, the data repo mirrors. `data→app`: the data repo defines, the app follows. `both`: a shared constant or shape; neither leads, both change together.
- **`Triggers`** — app-side list, then `‖`, then data-side list. Each repo's reviewer evaluates **only its own side**; that is what makes the check possible without cross-repo reads. Triggers are always concrete paths, exported symbols, constant names or served JSON paths — never a category.
- **`Direction: app→data` entries are the silent ones** — nothing app-side fails when they drift. Their `Mirror` text says so.
- **`Triggers` must name definition sites, not just call sites.** A shared constant's *definition* (`lib/nflverse.mjs MIN_SCHEDULE_GAMES`) and a shape's *validator* (`lib/validate.mjs validateSchedule`, `src/api/dataStore.js isValidSchedule`) are triggers in their own right. Where a value flows through a generic path that never names it — season-totals aggregation is a sum-all-keys loop — the **loop** is the trigger, because the key name greps to nothing.
- **The two sides carry different completeness burdens.** Each repo's reviewer can read its own tree and cannot read the other one, so:
  - **The far side of `‖` is frozen authority.** A reviewer cannot fall back on live source for the repo it cannot read, so a trigger missing there is invisible. Far-side triggers must be correct in this registry and are kept correct by the both-repos-same-change rule — never by re-deriving them at review time.
  - **The near side of `‖` is a maintained cache.** The reviewer re-verifies it against live source on every review (see the plan-reviewer mandate) and flags consumers the entry does not list. So the near-side list should be accurate, but it is not required to be provably exhaustive at any one point in time — a gap in it is self-healing rather than silent, because the standing re-verification duty catches it at the next relevant review. That does not make the near side low-stakes: it is the *far*-side authority for the sibling repo's reviewer, which cannot read this side's live source at all.

  Read from `sleeper-dashboard`, "near" is the app side and "far" is the data side; read from `sleeper-dashboard-data`, it is the reverse. The wording is deliberately perspective-neutral so this bullet mirrors byte-for-byte like the rest of the registry.
- New coupling → new highest-numbered entry, added to **both** repos in the same change.

#### CR-01 · Projection snapshot envelope
- **App side:** `src/utils/projectionSnapshot.js` (writer, `schemaVersion: 2`), `src/utils/exportData.js` `classifyKey` (routes `projection-snapshots/<date>` → `snapshots/<date>.json`), `src/utils/seasonProjection.js` (the verbatim `projection` payload)
- **Data side:** `snapshots/<date>.json`, `bin/update.mjs snapshots`, `scripts/register-snapshots.mjs`, `scripts/grade-snapshot.mjs` (`deriveTargetSeason:34` is the v1-only fallback; envelope reads at `:168`/`:231`/`:316`), `lib/grade.mjs` (scores the snapshot payload), `scripts/panel-run.mjs` `resolveScoring` (`:70-77`, reads `snapshot.scoringSettings`), `bin/import-snapshot.mjs`, README snapshot section
- **Invariant:** the snapshot envelope the app writes is byte-compatible with what the importer and grader expect — at v2 that includes top-level `targetSeason`, `currentSeason` and verbatim `scoringSettings`, with `projection` as unmodified `computeNextSeasonProjection` output.
- **Direction:** app→data
- **Triggers:** `src/utils/projectionSnapshot.js`, `classifyKey` in `src/utils/exportData.js`, the `factors` object shape in `src/utils/seasonProjection.js`  ‖  `scripts/register-snapshots.mjs`, `scripts/grade-snapshot.mjs`, `lib/grade.mjs`, `resolveScoring` in `scripts/panel-run.mjs`, `bin/import-snapshot.mjs`
- **Mirror:** State the new envelope shape and whether the snapshot `schemaVersion` bumped. On a bump, `scripts/register-snapshots.mjs` expectations, `scripts/grade-snapshot.mjs` reads and the README snapshot section all need updating in the data repo. **`scoringSettings` has a second reader beyond grading** — `scripts/panel-run.mjs` `resolveScoring` pins the fit's basis from a committed snapshot, so dropping or renaming that envelope field breaks the R3-FIT path (CR-15) as well as in-basis grading. This snapshot `schemaVersion` is independent of `dataStore.js` `MAX_SUPPORTED_SCHEMA` (season-totals only). Additive `factors` keys (`isTeamChange`/`prevTeam`/`newTeam`/`depthStale`) do **not** bump the version.

#### CR-02 · season-totals schemaVersion & row composition
- **App side:** `src/api/dataStore.js` `MAX_SUPPORTED_SCHEMA = 3`, `src/utils/teamContext.js` `isTeamAggregateId`, `src/utils/playerTeam.js` `resolvePlayerTeam` (season grain reads `careerStats[season][pid].team`)
- **Data side:** `nfl/season-totals/<year>.json` (written v3), `lib/sleeper.mjs` `aggregateWeeks:151` (dominant-team derivation) and `normalizeTeamForSchedule` at `:261` (writes the per-season `team`), `scripts/update-nfl.mjs` (the writer, `:49`/`:53`), `lib/validate.mjs` `validateNflSeason:100`, `lib/backtest.mjs` `isTeamAggregateId` (the data-side `TEAM_` filter), `lib/panel.mjs` `buildTeamTotalsForSeason` (`:80`, applies that filter), `data-catalog.md` season-totals row
- **Invariant:** the app's supported-schema ceiling covers what the data repo writes, and the served row set is player rows **plus** `TEAM_<abbr>` whole-team aggregate pseudo-rows **plus** `<abbr>` DEF rows — consumers must exclude `TEAM_*` from any cross-player summation.
- **Direction:** both
- **Triggers:** `MAX_SUPPORTED_SCHEMA` in `src/api/dataStore.js`; `isTeamAggregateId` in `src/utils/teamContext.js`; the per-season-`team` readers `resolvePlayerTeam` (`src/utils/playerTeam.js:53-63`) and `resolveAttributedTeam` (`src/utils/teamContext.js:18`, consumed at `:164`/`:195`/`:247`/`:281`, `src/utils/teamRzShare.js:85`, `src/utils/seasonProjection.js:488`); the cross-row summers `computeTeamContext` (`src/utils/teamContext.js:154`, loops `:161`/`:192` — a separate summer from `computeHistoricalShares` that does **not** apply `isTeamAggregateId`; see its own note `:148-152`), `computeHistoricalShares` (`:269`, row loop `:275`), `computeHistoricalTeamTotals` (`:242-246`), `buildTeamShareTotals` (`src/utils/outlookPositionStats.js:38-40`), `computeEmpiricalAgeCurves` (`src/utils/dynastyScore.js:63-64`) and `buildSeasonPositionRanks` (`src/utils/seasonRanks.js:20`)  ‖  `aggregateWeeks` in `lib/sleeper.mjs`, `scripts/update-nfl.mjs`, `validateNflSeason` in `lib/validate.mjs`, `isTeamAggregateId` in `lib/backtest.mjs`, `buildTeamTotalsForSeason` in `lib/panel.mjs`
- **Mirror:** A version bump needs both repos. **Per-season `team` is scoring-load-bearing in the app since the R2 flip (2026-07-11)** — it feeds projection Steps 3/5h attribution via `resolveAttributedTeam`, so any edit to the `aggregateWeeks` dominant-team rule (most played weeks; ties → later stint; zero played → last seen; schedule-domain normalization) changes app projections **with no app-side diff**. Treat such edits as scoring changes and route them through a graded gate. Renaming the `TEAM_` pseudo-id scheme is breaking.

#### CR-03 · Enrichment schemas
- **App side:** `src/api/enrichment.js` (`loadEnrichment:44`, called from `src/App.jsx:268`), `src/utils/enrichmentLookup.js` (`findInjuryForWeek`, `getCoaching`, `getScheme`, `getNotes`), `src/components/AvailabilityHistory.jsx:116` (the injury-payload consumer)
- **Data side:** `enrichment/*.json`, `bin/enrich.mjs`, `lib/enrichment.mjs` (`validateEntry:164`, `validateAll:259`), `lib/validate.mjs` `validateEnrichmentShape:747`, `npm run validate:enrichment`
- **Invariant:** every field the app's null-safe lookups read exists, with the same name and shape, in the enrichment files the data repo authors and validates.
- **Direction:** data→app
- **Triggers:** `src/api/enrichment.js`, `src/utils/enrichmentLookup.js`, `src/components/AvailabilityHistory.jsx`  ‖  `enrichment/*.json`, `bin/enrich.mjs`, `lib/enrichment.mjs`, `validateEnrichmentShape` in `lib/validate.mjs`
- **Mirror:** Any field add, rename or removal must be mirrored in the app's loader and lookups. `injuries.segmentStartWeek` must continue to match an absence segment in the matching season-totals file; orphaned entries are validator-flagged and silently ignored app-side.

#### CR-04 · Manifest contract
- **App side:** `src/api/dataStore.js` — `getManifestEntry:65` plus every validator gating on `schemaVersion` / `inProgress` / `lastModified` (nine `src/api/*` modules go through the accessor; the field names are the contract, so the definition site is the surface). **Plus one accessor bypass:** `src/utils/ktcHistory.js` `loadKtcHistory:92-126` reads the manifest **object** directly — `getCache('data-store/manifest')`, then `Object.keys(manifest.files)` and `manifest.files[path].lastModified` — so it depends on the top-level `files` map and the per-entry `lastModified` by name, not through `getManifestEntry`. The module's own header (`:4-6`) flags this as a deliberate "Coupling note".
- **Data side:** `manifest.json`, `lib/manifest.mjs` (`readManifest:19`, `updateManifestEntry:34`) — 12 of the 13 `scripts/update-*.mjs` writers register through `updateManifestEntry` (`update-enrichment.mjs` does **not**), plus three non-`update-*` registrars: `scripts/register-snapshots.mjs`, `scripts/grade-snapshot.mjs`, and `lib/enrichment.mjs`
- **Invariant:** manifest field names and shape are a public API; the app keys entries by served path and must ignore unknown families — and the `files` map plus per-entry `lastModified` are readable directly, not only through the app's accessor.
- **Direction:** data→app
- **Triggers:** `getManifestEntry` and the validator block in `src/api/dataStore.js`, the direct `manifest.files` / `lastModified` reads in `src/utils/ktcHistory.js` (`:92-126`)  ‖  `updateManifestEntry` / `readManifest` in `lib/manifest.mjs`, `manifest.json`
- **Mirror:** New families are additive and need no app change (the app already keys by path). Renaming or removing `recordCount` / `schemaVersion` / `lastModified` / `inProgress` is breaking and needs both repos. **Renaming the top-level `files` map, or the per-entry `lastModified`, breaks a second app-side reader that `getManifestEntry` does not shield** — `ktcHistory.js` enumerates `Object.keys(manifest.files)` to discover KTC snapshots and compares `lastModified` for cache invalidation (CR-17); it degrades to an empty history with no error. Note the `inProgress` convention split: nflverse families register `inProgress: false` even while the current season mutates; KTC's `inProgress: true` is a legacy current-value marker, not a pattern to propagate (CR-17).

#### CR-05 · CFBD statType keys
- **App side:** `src/api/cfbd.js` `pivotStatRows:85`, `src/api/dataStore.js` `isValidCFBDRows:107` (gates on `playerId` / `statType`), `src/utils/collegeMatch.js:125-127` (pivots all three categories), `src/utils/collegeMetrics.js:69-124` (reads the literals `YDS`, `TD`, `ATT` — dominator rating and the QB score), `src/components/PlayersTab.jsx:681-683` (reads `PCT`, and `COMPLETIONS` as its fallback, for the Player Profile college stat line; also `YDS`/`TD`/`INT` at `:678-680`, `CAR` at `:691` (rush category), and `REC` at `:697` (rec category))
- **Data side:** `scripts/update-cfbd.mjs`, `lib/cfbd.mjs`, `lib/validate.mjs` `validateCfbdCategory:204`, `college/<category>/<year>.json`
- **Invariant:** the confirmed `statType` set stored per category is exactly the set the app's pivot expects.
- **Direction:** both
- **Triggers:** `pivotStatRows` in `src/api/cfbd.js`, `isValidCFBDRows` in `src/api/dataStore.js`, `src/utils/collegeMatch.js`, the `YDS`/`TD`/`ATT` reads in `src/utils/collegeMetrics.js`, the `PCT`/`COMPLETIONS`/`CAR`/`REC` reads in `src/components/PlayersTab.jsx`  ‖  `scripts/update-cfbd.mjs`, `lib/cfbd.mjs`, `validateCfbdCategory` in `lib/validate.mjs`
- **Mirror:** Adding or removing a `statType` must be coordinated — the pivot silently drops unknown types and yields empty columns for missing ones. Renaming one is worse than dropping it, and the blast radius differs by key: `YDS`/`TD`/`ATT` are read by name in `src/utils/collegeMetrics.js:69-124`, so renaming those nulls the dominator rating and the QB college score; `PCT` and `COMPLETIONS` are read only in `src/components/PlayersTab.jsx:682-683`, where `PCT ?? (COMPLETIONS / ATT)` builds the completion-% term — renaming both silently drops that term from the Player Profile college stat line, which still renders without it. No error, no test failure, in either case. (Note the name list in `collegeMetrics.js:57-59` is a *comment* recording the confirmed 2023 field names; it is documentation, not a read.)

#### CR-06 · nflverse roster & draft
- **App side:** `src/api/nflRoster.js` `loadCurrentRoster:55` (`MIN_ROSTER_IDS = 1500` at `:38`), `src/api/nflDraft.js` `loadNflDraftPicks:50`, `src/api/dataStore.js` `isValidRoster:113` / `isValidDraft:118`, `src/utils/nflDraftMatch.js`, `src/utils/relevance.js` (consumes the roster-id Set for the stale-team gate)
- **Data side:** `nflverse/roster/<year>.json`, `nflverse/draft/draft_picks.json`, `bin/update.mjs roster` / `draft`, `scripts/update-roster.mjs`, `scripts/update-draft.mjs`, `lib/nflverse.mjs` `MIN_ROSTER_IDS:18` (**the definition**), `lib/validate.mjs` `validateRoster:307` / `validateDraft:339`
- **Invariant:** the served shapes (`players` keyed by `sleeper_id`; `rowCount`; `picksByYear`) and the shared `MIN_ROSTER_IDS = 1500` sparsity gate match on both sides.
- **Direction:** both
- **Triggers:** `src/api/nflRoster.js`, `src/api/nflDraft.js`, `MIN_ROSTER_IDS` in `src/api/nflRoster.js`, `isValidRoster` / `isValidDraft` in `src/api/dataStore.js`, `src/utils/relevance.js`  ‖  `scripts/update-roster.mjs`, `scripts/update-draft.mjs`, `MIN_ROSTER_IDS` in `lib/nflverse.mjs`, `validateRoster` / `validateDraft` in `lib/validate.mjs`
- **Mirror:** Shape or sparsity-constant changes land in both repos together. **`MIN_ROSTER_IDS` is declared twice** — `lib/nflverse.mjs:18` (data) and `src/api/nflRoster.js:38` (app) — with no shared source; editing one and not the other is the whole failure mode this entry exists for. The app has no live fallback for either family — it must get them from the store.

#### CR-07 · nflverse advstats (view-only)
- **App side:** `src/api/advStats.js` `loadAdvStats:46` (`MIN_ADVSTATS_ROWS = 250` at `:35`), `src/api/dataStore.js` `isValidAdvStats:122`, `src/App.jsx:893` (the call site), `src/components/AdvancedStatsPanel.jsx`, guarded by `src/__tests__/advStatsViewOnly.test.js`
- **Data side:** `nflverse/advstats/<year>.json`, `bin/update.mjs advstats`, `scripts/update-advstats.mjs`, `lib/nflverse.mjs` `MIN_ADVSTATS_ROWS:35` (**the definition**), `lib/validate.mjs` `validateAdvStats:407`
- **Invariant:** served shape (`players` keyed by `sleeper_id`; per-player `targetShare`/`airYardsShare`/`wopr`/`racr`/`components`; `rowCount`; `schemaVersion: 1`; `inProgress: false`) and the shared `MIN_ADVSTATS_ROWS = 250` gate match, and the family stays out of projection/scoring on both sides.
- **Direction:** both
- **Triggers:** `src/api/advStats.js`, `MIN_ADVSTATS_ROWS` in `src/api/advStats.js`, `isValidAdvStats` in `src/api/dataStore.js`, `src/components/AdvancedStatsPanel.jsx`  ‖  `scripts/update-advstats.mjs`, `MIN_ADVSTATS_ROWS` in `lib/nflverse.mjs`, `validateAdvStats` in `lib/validate.mjs`
- **Mirror:** Served-shape or sparsity-gate changes need the app loader updated in the same cycle. Ratios are recomputed season-level and never aggregated weekly. Activation into projection is parked — see the advstats grading-findings doc.

#### CR-08 · nflverse schedule (read-only)
- **App side:** `src/api/nflSchedule.js` `loadNflSchedule:60`, `src/api/dataStore.js` `isValidSchedule:135` + `MIN_SCHEDULE_GAMES = 200` (`:130`), `src/utils/nflStats.js` `buildGameLog`, `src/components/players/NflStatsTab.jsx:273` (the only live call site), guarded by `src/__tests__/scheduleViewOnly.test.js`
- **Data side:** `nflverse/schedule/<year>.json`, `bin/update.mjs schedule`, `scripts/update-schedule.mjs` (← nflverse `nfldata` `games.csv`), `lib/nflverse.mjs` `MIN_SCHEDULE_GAMES:45` (**the definition**), `lib/validate.mjs` `validateSchedule:435`
- **Invariant:** served shape (`{ schemaVersion: 1, season, generatedAt, rowCount, games[] }`, each game carrying the 15 named fields; null `homeScore`/`awayScore`/`result`/`temp`/`wind` and `result === 0` are valid) and the shared `MIN_SCHEDULE_GAMES = 200` floor match on both sides.
- **Direction:** both
- **Triggers:** `src/api/nflSchedule.js`, `isValidSchedule` + `MIN_SCHEDULE_GAMES` in `src/api/dataStore.js`, `buildGameLog` in `src/utils/nflStats.js`, `src/components/players/NflStatsTab.jsx`  ‖  `scripts/update-schedule.mjs`, `MIN_SCHEDULE_GAMES` in `lib/nflverse.mjs`, `validateSchedule` in `lib/validate.mjs`
- **Mirror:** Shape or floor changes land in both repos together. Read-only — not wired into projection/scoring. The app-side consumer is `NflStatsTab`'s game log, joining on the per-season `team` from season-totals v3 (CR-02).

#### CR-09 · nflverse gamelogs (view-only)
- **App side:** `src/api/nflGameLogs.js`, `src/api/dataStore.js` `isValidGameLogs` + `MIN_PLAYERGAME_ROWS = 3000`, `src/utils/playerTeam.js` `resolvePlayerTeam` (week grain reads `games[].week` and `games[].team`), guarded by `src/__tests__/gameLogsViewOnly.test.js`
- **Data side:** `nflverse/gamelogs/<year>.json`, `bin/update.mjs gamelogs`, `scripts/update-gamelogs.mjs`, `lib/nflverse.mjs` `MIN_PLAYERGAME_ROWS:48` (**the definition**) + `parsePlayerGameLogs` / `rekeyGameLogsBySleeper`, `lib/validate.mjs` `validateGameLogs:467`
- **Invariant:** served shape (`{ schemaVersion: 1, season, generatedAt, rowCount, playerCount, unmapped, players }`; `players` keyed by `sleeper_id` → `{ gsisId, name, position, games[] }`; each game carrying `week`, `seasonType`, `team`, `opponent` plus sparse per-game stats where an absent key is null and a present `0` is a real zero) and the shared `MIN_PLAYERGAME_ROWS = 3000` floor match on both sides.
- **Direction:** both
- **Triggers:** `src/api/nflGameLogs.js`, `isValidGameLogs` + `MIN_PLAYERGAME_ROWS` in `src/api/dataStore.js`, `resolvePlayerTeam` in `src/utils/playerTeam.js`  ‖  `scripts/update-gamelogs.mjs`, `MIN_PLAYERGAME_ROWS` / `parsePlayerGameLogs` / `rekeyGameLogsBySleeper` in `lib/nflverse.mjs`, `validateGameLogs` in `lib/validate.mjs`
- **Mirror:** Shape or floor changes land in both repos together. The per-game `week` and `team` keys are load-bearing beyond display: `resolvePlayerTeam`'s week-grain path matches on `g.week === week` and reads `g.team`, and returns `null` rather than throwing — renaming either key empties every week-grain team join **silently**. Per-game `team` is the **current-franchise** domain in all seasons and is era-remapped app-side (CR-16); do not "fix" it to era-accurate upstream without changing both repos. Per-game rate fields (`racr`/`targetShare`/`airYardsShare`/`wopr`/`pacr`/`passingCpoe`) are single-game values and must never be summed. `fantasyPoints`/`fantasyPointsPpr` are nflverse default scoring and are never reconciled with `src/utils/fantasyPoints.js` (see CR-14). View-only on both sides — must never feed projection/scoring/grading. 2019 is absent upstream (known gap; degrades to the empty shape).

#### CR-10 · nflverse teamcontext (view-only)
- **App side:** `src/api/teamContext.js` (loader — distinct from `src/utils/teamContext.js`) incl. the shape-reading lookups `getTeamSeasonRows:121` / `getTeamWeekRow:131`, `src/api/dataStore.js` `isValidTeamContext:171` + `MIN_TEAMCONTEXT_ROWS = 60` (`:164`), `src/utils/playerTeam.js` (join), guarded by `src/__tests__/teamContextViewOnly.test.js`
- **Data side:** `nflverse/teamcontext/<year>.json`, `bin/update.mjs teamcontext`, `scripts/update-teamcontext.mjs` (← nflverse pbp), `lib/nflverse.mjs` `MIN_TEAMCONTEXT_ROWS:53` (**the definition**) + `aggregateTeamContext`, `lib/validate.mjs` `validateTeamContext:504` (incl. the era-domain guard at `:515`)
- **Invariant:** served shape (`{ schemaVersion: 1, season, generatedAt, rowCount, teamCount, teams }`; `teams` keyed by **era-accurate** team abbr → `{ games[] }`; each game `{ week, seasonType, gameId, opponent, off:{…}, def:{…} }`; weeks continuous REG→POST) and the shared `MIN_TEAMCONTEXT_ROWS = 60` floor match on both sides.
- **Direction:** both
- **Triggers:** `src/api/teamContext.js` (incl. `getTeamSeasonRows` / `getTeamWeekRow`), `isValidTeamContext` + `MIN_TEAMCONTEXT_ROWS` in `src/api/dataStore.js`, `src/utils/playerTeam.js`  ‖  `scripts/update-teamcontext.mjs`, `MIN_TEAMCONTEXT_ROWS` / `aggregateTeamContext` in `lib/nflverse.mjs`, `validateTeamContext` in `lib/validate.mjs`
- **Mirror:** Shape or floor changes land in both repos together. **First TEAM-keyed family** — row identity is `(team, week)`, not `sleeper_id`; do not force it through player-keyed loader helpers. Per-week rates are single-game values: aggregate the `*Sum`/`*Plays` components, never sum or average stored rates. View-only on both sides. Team-key domain is CR-16.

#### CR-11 · Snap & red-zone usage stat keys *(reconciliation — new to this repo's list, already tracked by the sibling)*
- **App side:** `src/utils/usageMetrics.js` `computeUsageFactors` (`RZ_CONFIG:59-61`, snap share `:87-88`/`:141-142` — reads `off_snp`, `tm_off_snp`, `rec_rz_tgt`, `rush_rz_att`, `pass_rz_att`), `src/utils/teamRzShare.js` (`RZ_SHARE_CONFIG:45-46`), `src/utils/durabilitySignals.js:34-35` (`off_snp`/`tm_off_snp` → contributor-season classification; imported by `seasonProjection.js`, `dynastyScore.js`, `projectionSignals.js`), `src/utils/teamContext.js:254-255` (accumulates `rush_rz_att`/`rec_rz_tgt` into the `rushRz`/`recRz` denominators `teamRzShare.js` divides by), `src/utils/outlookUsage.js:62-63` (view-only per-season snap%)
- **Data side:** the generic sum-all-keys loop in `lib/sleeper.mjs` `aggregateWeeks` (`Object.entries(stats)` at `:216`) writing `nfl/season-totals/<year>.json` — these keys are preserved as-is and never stripped or filtered by any schema operation. Data-side **consumers** of the same keys: `lib/panel.mjs` (`:87-88`, `:179`, `:191`/`:206`, `RZ_CONFIG`-equivalents `:874-886`, `:911-912`, `:1131-1132`), `lib/backtest.mjs` (`:225-226`, `:274-275`, `:284-297`), `lib/projectionFactors.mjs`
- **Invariant:** the five usage stat keys survive season-totals aggregation unmodified, and both repos read them under the same names.
- **Direction:** data→app
- **Triggers:** `src/utils/usageMetrics.js`, `src/utils/teamRzShare.js`, `src/utils/durabilitySignals.js`, the RZ denominator block in `src/utils/teamContext.js`, `src/utils/outlookUsage.js`  ‖  the `Object.entries(stats)` sum loop in `lib/sleeper.mjs` `aggregateWeeks:216`, the writer `scripts/update-nfl.mjs:49`, `validateNflSeason` / `findNonFinite:69` in `lib/validate.mjs`, `RATE_KEYS` in `lib/fantasyPoints.mjs:21` (the one key filter that exists on this data today, read-side), `lib/panel.mjs`, `lib/backtest.mjs`, `lib/projectionFactors.mjs`
- **Mirror:** Do not remove, rename or filter these keys. **The projection degrades silently to neutral when they are absent** — no error, no test failure, no visible symptom. The blast radius is wider than the projection: `durabilitySignals` mis-classifies contributor seasons, `teamContext`'s RZ denominators go to zero (so `teamRzShare` sentinels out), the Outlook snap% column empties, and the data repo's own panel/backtest reconstructions drift the same way. The dependency is invisible at runtime; this registry entry is the only thing recording it.

#### CR-12 · `pass_cmp` stat key (QB passer rating) *(reconciliation — new to this repo's list, already tracked by the sibling)*
- **App side:** `src/utils/efficiencyMetrics.js` `passerRating` (`:37`, `:178` — `pass_cmp`, `pass_att`, `pass_yd`, `pass_td`, `pass_int`), reused view-only by `src/utils/outlookPositionStats.js`, and `src/utils/nflStats.js:28` (`compPct` recomputed as `pass_cmp/pass_att`, never the stored `cmp_pct`)
- **Data side:** the generic sum-all-keys loop in `lib/sleeper.mjs` `aggregateWeeks` (`:216`) into `nfl/season-totals/<year>.json`. **`pass_cmp` appears nowhere in `lib/`, `scripts/` or `bin/`** — the key is carried by a loop that never names it, which is exactly why the loop, not the key, is the data-side trigger.
- **Invariant:** `pass_cmp` is preserved through season-totals aggregation.
- **Direction:** data→app
- **Triggers:** `passerRating` in `src/utils/efficiencyMetrics.js`, the `compPct` line in `src/utils/nflStats.js`  ‖  the `Object.entries(stats)` sum loop in `lib/sleeper.mjs` `aggregateWeeks:216`, the writer `scripts/update-nfl.mjs:49`, `validateNflSeason` in `lib/validate.mjs`, `RATE_KEYS` in `lib/fantasyPoints.mjs:21`
- **Mirror:** Preserve `pass_cmp`. Missing `pass_cmp` yields a neutral `efficiencyFactor` (1.0) **and** a null `Cmp%` cell in the NFL-stats table — silent in both, no errors, no schema bump. Stored `pass_rtg` and `cmp_pct` are weekly sums, are **not** consumed by the app (both surfaces recompute from counting stats), and must be preserved as-is rather than "fixed".

#### CR-13 · `rec_air_yd` stat key (aDOT diagnostic) *(reconciliation — new to this repo's list, already tracked by the sibling)*
- **App side:** `src/utils/seasonProjection.js:445`/`:453` — reads `rec_air_yd` and `rec_tgt` to compute the capture-only `factors.adot` (WR/TE); `src/utils/outlookPositionStats.js:51` (per-season-team air-yards denominator), `:153` (AY share), `:141` (the aDOT cell)
- **Data side:** the generic sum-all-keys loop in `lib/sleeper.mjs` `aggregateWeeks` (`:216`) into `nfl/season-totals/<year>.json`; confirmed present 2012–present. **`rec_air_yd` appears nowhere in `lib/`, `scripts/` or `bin/`** — same generic-path situation as CR-12.
- **Invariant:** `rec_air_yd` is preserved through season-totals aggregation.
- **Direction:** data→app
- **Triggers:** the aDOT block in `src/utils/seasonProjection.js`, the air-yards denominator / AY-share / aDOT builders in `src/utils/outlookPositionStats.js`  ‖  the `Object.entries(stats)` sum loop in `lib/sleeper.mjs` `aggregateWeeks:216`, the writer `scripts/update-nfl.mjs:49`, `validateNflSeason` in `lib/validate.mjs`, `RATE_KEYS` in `lib/fantasyPoints.mjs:21`
- **Mirror:** Preserve `rec_air_yd`. Missing → `factors.adot: null` **and** empty AY-share / aDOT cells on the Outlook tab; no errors, no schema bump. Values run ~½ industry aDOT magnitude (likely air yards on completed receptions only) — ranking is preserved, absolute magnitude is not industry-standard; that calibration is the app's concern, not the data repo's. `factors.adot` is capture-only and must not move `projectedPPG`.

#### CR-14 · `calculateFantasyPoints` port *(reconciliation — new to this repo's list, already tracked by the sibling)*
- **App side:** `src/utils/fantasyPoints.js` `calculateFantasyPoints(stats, scoringSettings):12` — the source of truth. (`src/App.jsx:788`/`:790`/`:795` and `src/api/sleeperStats.js:199` call it but do not define the math, so they are not triggers.)
- **Data side:** `lib/fantasyPoints.mjs` — a hand-maintained mirror (`calculateFantasyPoints:9`, plus `RATE_KEYS:21`); imported by `scripts/grade-snapshot.mjs:20`, which defines `buildInBasisOutcomes:87` (applying the port at `:90`/`:109`); that builder is consumed by in-basis grading (`scripts/grade-snapshot.mjs:131`/`:431`) **and** by `scripts/panel-run.mjs:92` on the R3-FIT path
- **Invariant:** the data repo's port reproduces the app's scoring formula exactly — loop `scoringSettings` keys, skip null multiplier or stat, round to 2 dp.
- **Direction:** app→data
- **Triggers:** `src/utils/fantasyPoints.js`  ‖  `lib/fantasyPoints.mjs`, `buildInBasisOutcomes` in `scripts/grade-snapshot.mjs`, its call site in `scripts/panel-run.mjs`
- **Mirror:** Any change to the scoring math must be ported to `lib/fantasyPoints.mjs` in the same cycle, or in-basis grades silently diverge from how the app actually scored — **and so does the R3-FIT panel** (CR-15), which builds its outcome column from the same port. **Nothing app-side fails when this drifts** — the divergence appears only as wrong grades and a wrong fit. Low churn (the dot-product is stable), which is exactly why the drift would go unnoticed. Note one deliberate asymmetry: `RATE_KEYS` (`lib/fantasyPoints.mjs:21`) is a data-side-only defensive guard excluding non-additive keys from the dot-product; it has **no app counterpart** and must not be "mirrored back" into the app.

#### CR-15 · R3-FIT factor-multiplier mirror *(reconciliation — new to this repo's list, already tracked by the sibling)*
- **App side:** `src/utils/momentum.js`, `src/utils/regressionSignals.js`, `src/utils/teamContext.js` (`computeShareTrend`, `computeHistoricalShares`, `computeHistoricalTeamTotals`, `resolveAttributedTeam`), `src/utils/usageMetrics.js`, `src/utils/teamRzShare.js`, `src/utils/seasonProjection.js` (qualifying-season builder, rookie-vs-veteran routing, basePPG per-length weight table, label→factor maps, forward-mover neutralization, `combinedNewFactorRaw` membership and its `[0.67, 1.50]` clamp)
- **Data side:** `lib/projectionFactors.mjs`, `lib/panel.mjs` (`predictWithExponents:962`, `attachFactorMultipliers:998`, `buildCohortPools:895`, `selectFitFactors:1206`), `scripts/panel-run.mjs` (`runFit:878`, the `attachFactorMultipliers` call at `:166`), `bin/panel.mjs --fit`, parity-guarded by `test/panel-fit.test.mjs`
- **Invariant:** every mirrored constant, gate, shrinkage K, qualifying threshold, routing condition, sentinel branch, series-construction branch, denominator accumulator, cohort reference season, position gating, and the `combinedNewFactorRaw` membership/clamp range reproduce the app's behaviour exactly.
- **Direction:** app→data
- **Triggers:** any of the six listed `src/utils/` modules  ‖  `lib/projectionFactors.mjs`, `lib/panel.mjs`, `scripts/panel-run.mjs`, `test/panel-fit.test.mjs`
- **Mirror:** Re-mirror the changed constant/gate/branch and **re-fit before any further exponent activation** — otherwise the fit reconstructs a factor the app no longer produces and the committed verdict in `.claude/tasks/r3fit-exponent-harness.md` stops transporting. Which positions a factor is gated to is itself part of the mirror. Note the known parity gap: `shareTrend` and `teamRzShare` have no end-to-end app-ground-truth check until a post-2026-07-18 snapshot is imported. **Nothing app-side fails when this drifts.** Scope note, verified by grep so it need not be re-derived: `dynastyScore.js` is named in `lib/projectionFactors.mjs:110` only as a *contrast* (its `weightedLinearRegression` copy is unfloored where the mirrored one floors the denominator at 4) — it is **not** mirrored and is deliberately not a trigger.

#### CR-16 · Era-accurate team-code remap *(reconciliation — was buried in the teamcontext prose)*
- **App side:** `src/utils/playerTeam.js` `eraTeam(abbr, season):32` — LA→STL ≤2015, SD/LAC ≤2016, OAK/LV ≤2019 — **and** `src/utils/nflStats.js` `SCHEDULE_TEAM_ALIAS:2` (`{ LAR: 'LA' }`) + `normalizeTeamForSchedule:4`, which `playerTeam.js:63` composes with `eraTeam`
- **Data side:** `lib/nflverse.mjs` `eraTeam:958` (**the definition**), applied to pbp at `:1084-1087`; `lib/sleeper.mjs` `SCHEDULE_TEAM_ALIAS:22` + `normalizeTeamForSchedule:25` (the data-side mirror of the app's alias, applied at `:261` to produce the season-totals `team`); `lib/validate.mjs:515` era-domain guard
- **Invariant:** both repos map franchise abbreviations to the same era-accurate code for the same season **through the same two-stage composition** (schedule-domain alias, then era remap), so team keys join across teamcontext, schedule and season-totals.
- **Direction:** both
- **Triggers:** `eraTeam` in `src/utils/playerTeam.js`, `SCHEDULE_TEAM_ALIAS` / `normalizeTeamForSchedule` in `src/utils/nflStats.js`  ‖  `eraTeam` in `lib/nflverse.mjs`, `SCHEDULE_TEAM_ALIAS` / `normalizeTeamForSchedule` in `lib/sleeper.mjs`, the era-domain guard in `lib/validate.mjs`
- **Mirror:** A future franchise move (or any change to an existing mapping) updates **both repos in the same change** — and there are **two** mirrored constants here, not one: the era remap *and* the schedule-domain alias (`lib/sleeper.mjs:21` says so in a comment: *"Mirrors the app's `src/utils/nflStats.js` `SCHEDULE_TEAM_ALIAS` exactly"*). A one-sided edit to either produces silently empty joins rather than an error — the team key simply never matches. Note `scripts/update-teamcontext.mjs` is **not** a trigger despite owning the teamcontext ingest: it names `eraTeam` only in a header comment (`:13`) and calls it via `aggregateTeamContext`, so grepping it for the remap finds nothing.

#### CR-17 · KTC value snapshots *(new — found by the completeness sweep, absent from both repos)*
- **App side:** `src/utils/ktcHistory.js` — `isValidKtcSnapshot:27`, the `SNAPSHOT_RE` manifest enumeration `/^ktc\/snapshot-(\d{4}-\d{2}-\d{2})\.json$/` (`:19`), the `tryDataStore(s.path, { validate: isValidKtcSnapshot, allowInProgress: true })` fetch (`:147`), and the downstream extractors `computeKtcSignals` (consumed by `src/utils/seasonProjection.js:11`/`:307` for the `ktcHist*` capture factors) and `computeKtcRecentDelta:338` (consumed by `src/components/PlayersTab.jsx:9`/`:1873` for the Explorer's ~30-day Δ cell); `src/api/dataStore.js` `tryDataStore:72` `allowInProgress` opt-in (`:80`); `src/utils/ktcMatch.js` `matchKTCToSleeper:64` (consumes `name`/`team`/`position`), called on the store path at `ktcHistory.js:176` and on the live path at `src/App.jsx:249`; `src/api/ktc.js:51` — the app's own DOM scraper, which emits the **identical** `{ name, team, value, position }` record
- **Data side:** `ktc/snapshot-<YYYY-MM-DD>.json`, `scripts/update-ktc.mjs` (`updateKtc:131`, `ktcOrderingGuard:114`, `KTC_ORDERING_THRESHOLD`, `snapshotHash:39` for content-hash dedup, the `updateManifestEntry({ inProgress: true })` call at `:208-213`), `lib/ktc.mjs` `fetchKtcSnapshot:76`, `lib/validate.mjs` `validateKtc:237` + `KTC_TOP_QB_SENTINELS`, `bin/update.mjs ktc`, `.github/workflows/weekly-ktc.yml`, `ktc/quarantine/` (script-produced, unregistered, app-ignored)
- **Invariant:** a served KTC snapshot is a **bare top-level JSON array** of `{ name, team, value, position }` objects satisfying `isValidKtcSnapshot` (non-empty array whose first element has a string `name` and a numeric `value`), published at exactly `ktc/snapshot-<YYYY-MM-DD>.json` and registered with `schemaVersion: 1` and `inProgress: true` — the one family the app's read path opts into via `allowInProgress: true`.
- **Direction:** both
- **Triggers:** `isValidKtcSnapshot`, `SNAPSHOT_RE`, the `allowInProgress: true` call site, `computeKtcSignals` and `computeKtcRecentDelta` in `src/utils/ktcHistory.js`, `matchKTCToSleeper` in `src/utils/ktcMatch.js`, the record shape emitted by `src/api/ktc.js`, the `allowInProgress` branch of `tryDataStore` in `src/api/dataStore.js`  ‖  `scripts/update-ktc.mjs` (incl. `ktcOrderingGuard`, `snapshotHash` and the `updateManifestEntry({ inProgress: true })` call), `fetchKtcSnapshot` in `lib/ktc.mjs`, `validateKtc` in `lib/validate.mjs`, `.github/workflows/weekly-ktc.yml`
- **Mirror:** Keep the snapshot a **bare array** — wrapping it in the `{ schemaVersion, generatedAt, … }` envelope every other family uses fails `isValidKtcSnapshot`, and the whole `ktcHist*` capture family plus the Explorer's ~30-day KTC Δ cell degrade to empty with **no error and no test failure**. Keep the `ktc/snapshot-YYYY-MM-DD.json` path exactly: the app enumerates candidates by regex over manifest keys, so a path change makes every snapshot invisible rather than broken. Renaming `name`/`team`/`value`/`position` breaks `matchKTCToSleeper` the same silent way — and note the record shape is constrained **twice** on the app side, since `src/api/ktc.js` scrapes the same KTC DOM into the same four fields for the live path; the two scrapers are independent implementations of one shape, so a KTC markup change can break them separately. Flipping the manifest entry to `inProgress: false` is breaking in the unusual direction — the app deliberately opts this path in, so the change must be paired with revisiting `allowInProgress: true` app-side. Quarantined scrapes must stay in `ktc/quarantine/` and **must never be manifest-registered**: a registered quarantine file enters the app's 8-snapshot window as if it were good data.

#### CR-18 · Signal registry rows (`docs/signal-registry.md`) *(new — found by the completeness sweep, absent from both repos)*
- **App side:** `docs/signal-registry.md` (the canonical rows), the signal-registry sentence in `CLAUDE.md` → *Self-maintenance*
- **Data side:** the signal-registry sentence in `CLAUDE.md` → *Self-maintenance*, the Sibling-repo pointer in `CLAUDE.md` → *Sibling repo*, `data-catalog.md` (data-side storage index — its header explicitly says the app's registry is the field-level index and to *"link, don't merge"*), and any ingest that adds/removes/reclassifies a field, stat key or source — `scripts/update-*.mjs`, `lib/sleeper.mjs`, `lib/nflverse.mjs`
- **Invariant:** every ingested field, stat key and source in the data repo has a current row in the app repo's `docs/signal-registry.md`, with its layer, source, historical coverage, reconstructable-vs-ephemeral status and current use accurate as of the change that touched it.
- **Direction:** data→app
- **Triggers:** `docs/signal-registry.md`  ‖  `data-catalog.md`, the signal-registry and Sibling-repo pointers in `CLAUDE.md`, the ingest scripts `scripts/update-{nfl,cfbd,ktc,roster,draft,playerids,advstats,schedule,gamelogs,teamcontext,playerstate,oline}.mjs`, the field-producing parsers/aggregators in `lib/nflverse.mjs` (`parseRosterCsv:164`, `parseDraftCsv:258`, `parsePlayerIdsCsv:350`, `aggregateAdvReceiving:476`, `parsePlayerGameLogs:741`, `parseSchedulesCsv:866`, `aggregateTeamContext:1012`, `aggregateOlineStates:1307`), `aggregateWeeks` in `lib/sleeper.mjs`, `lib/cfbd.mjs`, `lib/ktc.mjs`, and the **coverage-floor constants that encode historical coverage** — `MIN_DRAFT_YEAR:25`, `MIN_SCHEDULE_SEASON:38`, `MIN_GAMELOG_SEASON:50`, `MIN_TEAMCONTEXT_SEASON:55`, `MIN_OLINE_SEASON:60` in `lib/nflverse.mjs`
- **Mirror:** This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

<!-- CR-REGISTRY-END -->

> *Note: `nflverse/playerids.json` (the `gsis_id → sleeper_id` crosswalk) is **internal to this repo** — consumed server-side by `scripts/update-advstats.mjs` and `scripts/update-gamelogs.mjs` to re-key gsis-keyed stats. It is not a cross-repo contract (the planned `src/api/playerIds.js` app loader was cut). `MIN_PLAYERID_ROWS` remains an internal sparsity constant.*

> *Note: `nflverse/oline/<year>.json` (OL composition per team-week, ESPN depth charts) is **capture-only** — no app loader exists or is planned; there is no live consumer to keep in sync. It is not a cross-repo contract. `MIN_OLINE_ROWS` remains an internal sparsity constant (same precedent as `MIN_PLAYERID_ROWS` above). If a consumer is ever built, it must follow the teamcontext loader's pattern and stay out of projection/scoring/grading without a graded gate.*

---
````

**Notes for the implementer:**

- The two `> *Note:*` paragraphs are **moved** from `CLAUDE.md:264` and `CLAUDE.md:266` (they are deleted there by D2). Copy them verbatim — they are unchanged.
- Both notes sit **outside** the sentinels, after `<!-- CR-REGISTRY-END -->`. They are repo-specific and must never enter the diff.
- The `## Entry format` block sits **inside** the sentinels. Do not lift it out — the app deliberately moved it in so the drift check covers the format definition itself.
- `README.md` must contain the literal lines `<!-- CR-REGISTRY-BEGIN -->` and `<!-- CR-REGISTRY-END -->` exactly **once each**, each alone on its line. Never write a sentinel as a bare line anywhere else in the file; the drift check anchors on `^…$`.
- Terminate the section with a `---` before `## Enrichment overlay`, matching the file's existing section separators.
- `README.md` has no table of contents, so no index row needs adding.

### D1b — `CLAUDE.md:221`: Invariant 3 stale reference

**Before:**
```
3. **manifest.json is the index.** Every script-written file must be registered with `recordCount`, `schemaVersion`, `lastModified`, and `inProgress` maintained. Treat manifest field names as a public API (see Cross-repo contracts).
```

**After:**
```
3. **manifest.json is the index.** Every script-written file must be registered with `recordCount`, `schemaVersion`, `lastModified`, and `inProgress` maintained. Treat manifest field names as a public API (see Cross-repo contract registry).
```

Prose-only rename. Nothing else on the line changes.

### D2 — `CLAUDE.md:241-266`: replace the section

**Delete** lines 241–266 in full: the `## Cross-repo contracts (with sleeper-dashboard)` heading (`:241`), the lead prose (`:243`), the entire 16-row table (`:245-262` — header `:245`, separator `:246`, rows `:247-262`), and both `> *Note:*` paragraphs (`:264`, `:266`). Keep the `---` at `:268`.

**Replace with:**

```markdown
## Cross-repo contract registry (with sleeper-dashboard)

This repo cannot edit the app. The **complete enumerated registry** — the entry-format definition and all 18 `CR-NN` entries — lives in [README.md → Cross-repo contract registry](README.md#cross-repo-contract-registry-with-sleeper-dashboard). It is the sole authority for what the app must mirror: the plan-reviewer subagent reads that section and never reads the sibling tree. Its data-side trigger lists are a maintained cache the subagent re-verifies against live source on every review.

**Rule.** Any change touching a listed contract **must emit that entry's `Mirror` text as Session 1 output**, in a `## Cross-repo impact` section of the task file, quoting the `CR-NN` id. Naming the contract in prose is not enough; the mirror instruction itself is the deliverable.

**A coupling that is not listed there does not exist for review purposes.** Introducing a genuinely new cross-repo coupling is the one residual case that routes to the Claude.ai project — see [Workflow convention](#workflow-convention).
```

The two `> *Note:*` paragraphs are not lost — D1a re-homes them in `README.md`, outside the sentinels.

Link-anchor check: the README heading `## Cross-repo contract registry (with sleeper-dashboard)` slugs to `#cross-repo-contract-registry-with-sleeper-dashboard`; the new CLAUDE.md heading of the same text slugs identically, which is what `[Workflow convention](#workflow-convention)` and D3 rely on.

### D3 — `CLAUDE.md:272`: Sibling repo stale reference

**Before:**
```
`sleeper-dashboard` is the React app that consumes this repo's files and produces the snapshots imported here. Its README documents the projection pipeline and data-store consumption. See Cross-repo contracts above.
```

**After:**
```
`sleeper-dashboard` is the React app that consumes this repo's files and produces the snapshots imported here. Its README documents the projection pipeline and data-store consumption. See [Cross-repo contract registry](#cross-repo-contract-registry-with-sleeper-dashboard) above.
```

Prose rename plus a live in-file anchor. Do **not** touch `CLAUDE.md:274` (the signal-registry pointer) — CR-18's data side names it as a trigger, and it is still accurate.

### D4 — `CLAUDE.md`: new `## Workflow convention` section

**Where:** between `## Sibling repo` and `## Done-definition` — insert after `CLAUDE.md:274`, before the `---` at `CLAUDE.md:276`.

**Insert exactly this** (plus a trailing `---` separator):

````markdown
## Workflow convention

**The standard loop is fully in-repo.** Every step — planning, review, approval, implementation — happens in this repository against live source. Nothing in the standard loop depends on an external tool or on a chat held outside it.

```
Session 1 (planning, opus)
  → plan-reviewer subagent   ← the review gate
  → human approval
  → Session 2 (implementation, sonnet)
```

Features use a two-session flow: **opus plans**, **sonnet implements**.

- Opus session: read relevant code, decide signatures and data shapes, write `.claude/tasks/<feature>.md`. **Do not edit any source files.** End the session.
- Sonnet session: read the task file first, implement exactly what it specifies, run `npm run smoke`. If something is ambiguous or contradicts existing code, stop and ask — do not guess.

The task file is the handoff artifact, not chat history. A planning session that edits source has broken the handoff.

### Plan review

The plan-reviewer subagent (`.claude/agents/plan-reviewer.md`) is the **primary review gate**, not a lint pass. Invoke it on the task file at the end of Session 1, before Session 2. Its mandate is three-part:

1. **Factual / mechanical** — paths, function signatures, emitted JSON shapes, manifest entries, stat keys and step ordering, checked against live source.
2. **Strategic / principles** — whether the planned approach is sound and conforms to the [Invariants](#invariants) above: a plan that is factually accurate but violates an invariant, or solves the problem the wrong way, gets flagged.
3. **Cross-repo intent** — whether the plan touches an entry in [README.md → Cross-repo contract registry](README.md#cross-repo-contract-registry-with-sleeper-dashboard), and if so whether Session 1 emitted that entry's `Mirror` text. The reviewer checks against that registry only; it never reads the sibling tree.

**Flags are advisory input to the human, not an auto-apply queue.** Session 1 reports them verbatim and does not act on them. The human decides what to fix. Session 2 starts only after human approval.

### The Claude.ai project

**Out of the standard loop.** The Claude.ai project is an occasional exploration tool — open-ended thinking, cross-repo reading, research that has not yet become a plan. It is not a review gate, it does not author task files, and no step of the standard loop waits on it.

**The one residual case that still routes there:** a change that introduces a **brand-new cross-repo coupling not yet present in the registry**. A repo-scoped subagent can check a plan against a known list, but it cannot reason about a coupling that has never been written down, and it cannot read the sibling tree to discover one. Take that case to the Claude.ai project, which can hold both repos at once.

Its output is not a decision — it is a **draft registry entry** in the format defined inside the mirrored region of [README.md → Cross-repo contract registry](README.md#cross-repo-contract-registry-with-sleeper-dashboard). That draft returns to Session 1, lands in both repos' registries in the same change, and is then subject to the normal in-repo gate like anything else. Extending an existing entry is *not* this case and stays in-repo.

---
````

**Deliberate deviations from the app's copy, per the spec — do not "restore" them:**

- **No "Which model for which task" table.** The app's model-routing table is app-specific; this repo does not carry one.
- **`npm run smoke` replaces `npm run build`** in the sonnet bullet — this repo has no build step.
- **No "Visual verification is the user's job" bullet.** That paragraph is about the app's dev server; there is nothing to visually verify here.
- **Links point at this repo's own sections** — `#invariants` (this file) and `README.md#cross-repo-contract-registry-with-sleeper-dashboard`, never `docs/cross-repo-registry.md`.
- The Claude.ai subsection points at the mirrored region in `README.md` for the entry format, since this repo has no `docs/` file to link.

### D5 — `CLAUDE.md:284`: Done-definition item 4

**Before:**
```
4. Plan review: invoke the plan-reviewer subagent on the task file at the end of Session 1, before Session 2.
```

**After:**
```
4. Plan review: invoke the plan-reviewer subagent on the task file at the end of Session 1, before Session 2 — see [Workflow convention](#workflow-convention).
```

Items 1, 2, 3 and 5 are unchanged.

### D6 — `CLAUDE.md:307`: Self-maintenance cross-repo sentence

**Not in the embedded spec.** Flagged and included because the change makes the existing sentence self-contradictory: the new registry section states the rule as *"must emit that entry's `Mirror` text… naming the contract in prose is not enough"*, while Self-maintenance still says only *"state that explicitly in your task summary"* — the weaker, pre-registry formulation. The app repo's own Self-maintenance was updated to the mirror rule in the same change; leaving this one behind reintroduces the ambiguity the registry exists to remove. If the reviewer or the human prefers to hold strict spec scope, drop D6 — nothing else in this plan depends on it.

**Before** (the final sentence of `CLAUDE.md:307`):
```
If a change affects a Cross-repo contract, state that explicitly in your task summary so the sibling repo can be updated to match.
```

**After:**
```
If a change touches an entry in [README.md → Cross-repo contract registry](README.md#cross-repo-contract-registry-with-sleeper-dashboard), emit that entry's `Mirror` text in a `## Cross-repo impact` section of the task file, quoting the `CR-NN` id — naming the contract in prose is not enough. If the change introduces a coupling the registry does not list, add the new entry to **both** repos in the same change (see [Workflow convention](#workflow-convention) for how a genuinely new coupling gets drafted).
```

The rest of `:307` — the signal-registry / `data-catalog.md` sentences — is **unchanged** (CR-18 names it as a trigger).

### D1c — `CLAUDE.md:144`: Navigation map stale reference

**Before:**
```
| `lib/fantasyPoints.mjs` | Scoring dot-product (`calculateFantasyPoints`, `RATE_KEYS`); used by the grading in-basis path — see Cross-repo contracts |
```

**After:**
```
| `lib/fantasyPoints.mjs` | Scoring dot-product (`calculateFantasyPoints`, `RATE_KEYS`); used by the grading in-basis path — see Cross-repo contract registry |
```

Prose-only rename inside the Navigation map's `lib/fantasyPoints.mjs` row, same pattern as D1b/D3. No new row is added and no other row changes — the registry lives in an existing `README.md` section, so it introduces no new file to index.

### D7 — `data-catalog.md`: three dangling pointers

Relocating the `> *Note:*` MIN_OLINE_ROWS paragraph and the deleted Cross-repo contracts table (D2) leaves three `data-catalog.md` references pointing at locations that no longer hold that content. This is a docs-integrity fix — no served family is added, removed, or reclassified.

**`data-catalog.md:8`** (doctrine line, wraps onto `:9`):

Before:
```
**Doctrine:** all banked data is capture-only/view-only unless a Cross-repo contract in CLAUDE.md
says otherwise — it never silently feeds projection/scoring/grading. Gaps are honest: an
```

After:
```
**Doctrine:** all banked data is capture-only/view-only unless an entry in the Cross-repo contract
registry (README.md) says otherwise — it never silently feeds projection/scoring/grading. Gaps are honest: an
```

**`data-catalog.md:44`** (season-totals `team` row):

Before:
```
- **`team` (v3, per-season):** scoring-load-bearing in the app since the R2 flip (2026-07-11) — projection attribution consumes it; the `aggregateWeeks` dominant-team rule is a silent-scoring-change surface (see CLAUDE.md cross-repo contracts).
```

After:
```
- **`team` (v3, per-season):** scoring-load-bearing in the app since the R2 flip (2026-07-11) — projection attribution consumes it; the `aggregateWeeks` dominant-team rule is a silent-scoring-change surface (see README.md → Cross-repo contract registry).
```

**`data-catalog.md:199`** (oline sparsity gate):

Before:
```
- **Sparsity gate:** `MIN_OLINE_ROWS = 160` (internal — see CLAUDE.md Cross-repo contracts note; no app counterpart)
```

After:
```
- **Sparsity gate:** `MIN_OLINE_ROWS = 160` (internal — see README.md → Cross-repo contract registry note; no app counterpart)
```

The `MIN_OLINE_ROWS` note this line points at is one of the two `> *Note:*` paragraphs D1a moves from `CLAUDE.md:264`/`:266` into `README.md`, outside the sentinels — so the pointer now needs to name the file that actually holds it.

### Docs explicitly NOT changed

- **`README.md` §`How the data is consumed`, §`manifest.json` shape, §`Update scripts`** — untouched; the registry is additive.
- **`CLAUDE.md` Navigation map (`:136-211`)** — no new row added and no other row touched besides `:144` (D1c); the registry lives in an existing `README.md` section, so it introduces no new file to index.
- **`CLAUDE.md:274`** (signal-registry pointer) and **`CLAUDE.md` Invariants 1, 2, 4–8** — untouched.
- **No `## Drift check` section is added to `README.md`.** The spec places the drift-check command in the app's file only; adding a second copy here would be new repo-specific text the spec does not call for, and it would need to stay outside the sentinels anyway. The command lives in §6 T1 of this task file for the human to run.

---

## 5. `.claude/agents/plan-reviewer.md` — three-part mandate

Replace the current 24-line file. **Keep this repo's existing mechanical checks verbatim** — they are sharper and more domain-specific than the app's Part 1 (append-only, idempotency, capture-only, rate-stat aggregation, CDN purge ordering) and must not be flattened into the app's generic wording. Add Part 2 and Part 3 around them.

**Frontmatter:** keep `name: plan-reviewer`, `tools: Read, Grep, Glob`, `model: opus`. Update `description` to reflect the widened mandate, mirroring the app's phrasing:

```
description: Read-only reviewer for Session 1 task files in the data repo — the primary review gate. Invoke after a task file is written to .claude/tasks/ and before Session 2 implementation. Checks the plan against live source, against this repo's invariants, and against the cross-repo contract registry.
```

**Body structure:**

**Preamble** — keep the existing repo-context sentence (`Node.js ingest pipeline, append-only JSON served via jsDelivr CDN`) and the targeted-reads instruction (existing `:10`). Add the app's framing that this is the only review before human approval — there is no external reviewer behind it. Then: *"Your mandate has three parts. Run all three on every task file."*

**`## 1. Factual / mechanical`** — carry over the existing bullets from `:13-19` **unchanged in substance**:

- Wrong file or symbol targeted (path or function does not match live source).
- A data shape that does not match live source — an emitted JSON field, manifest entry, or output key the plan assumes but the script does not produce, or vice versa.
- Step ordering that would break intermediate state — manifest written before the data file it references; a CDN purge sequenced wrong (re-runs of an existing season require purging both manifest and the season file; new season files self-serve on first request); a backfill run before its guard/validation gate.
- A capture-only invariant violation — treating an ephemeral signal (depth chart order, injury designation, coaching staff, KTC values) as backfillable, or treating reconstructable historical data as capture-only.
- An append-only or idempotency violation — mutating historical snapshots, or a guard relying on count-based change detection instead of content-hash idempotency or rank-correlation (count-based guards false-positive on any broad recalibration).
- A per-season aggregation trap — a rate stat summed across weeks instead of recomputed from components (e.g. `pass_rtg`).
- A missing validation/smoke check the change clearly needs, or a missing edge case.

Drop the old `:20` bullet ("A cross-repo contract the plan touches but does not flag…") — Part 3 subsumes it with a stronger, enumerated check.

**`## 2. Strategic / principles`** — new. Mirror the app's Part 2, retargeted:

- Instruct the reviewer to **read the `## Invariants` section of `CLAUDE.md`** (the 9 numbered invariants at `CLAUDE.md:215-237`) before judging — read it, do not rely on memory, do not restate it in the output.
- Ask whether the plan is the right shape: does it violate a documented invariant or route around one instead of through it; is a factually-correct plan still solving the problem the wrong way (a new script where an existing ingest already owns the family, a fork of logic that has a single source today); does it widen a boundary this repo deliberately holds narrow (a view-only family reaching into projection/scoring/grading, an ephemeral input treated as reconstructable, a hand-edit to script-produced primary data).
- Require flagging **the specific invariant by number and name**. No stylistic preferences; do not re-litigate a design the plan states as a settled decision with a reason.

Note for the author of this file: the numbering in `CLAUDE.md` has **two invariants numbered 8** (`:235` CDN purge URLs, `:237` grading reads are never recomputed) — nine invariants under eight numbers. Word the instruction as "the nine numbered Invariants in `CLAUDE.md`" and have the reviewer cite by name as well as number, so the duplicate does not make a flag ambiguous. Do not renumber `CLAUDE.md` in this change; that is an unrelated edit.

**`## 3. Cross-repo intent`** — new. The mirror image of the app's Part 3:

- Read the registry in **`README.md` → *Cross-repo contract registry***, the enumerated `CR-NN` list.
- **For the app side it is the only authority** — the reviewer cannot read the sibling repo, so treat app-side triggers as complete and never infer beyond them. **You cannot read the sibling repo — do not try, and do not infer its contents.**
- Check the plan's touched artifacts against each entry's `Triggers` field, **data side only — the part to the right of `‖`**.
- For every entry the plan touches: if the task file has no `## Cross-repo impact` section quoting that entry's id and `Mirror` text, flag it and include the `Mirror` text in the `MIRROR` block so the planning session has it. If the section exists but the mirror text is incomplete or contradicts the entry, flag the difference.
- Pay particular attention to **`Direction: data→app`** entries — those are the silent ones **from this repo's seat**: nothing here fails when they drift. (This is the mirror image of the app's emphasis on `app→data`; do not copy the app's direction verbatim.)

**`### Standing duty: re-verify the data side against live source`** — the mirror image of the app's app-side duty:

- The registry's **data-side** trigger list is a maintained cache, not the authority — the reviewer can read live `lib/`, `scripts/` and `bin/`, so it is the thing that keeps the list honest.
- On **every** review, for each registry entry whose data shape, served field or stat key the planned change reads or writes: grep live `lib/`/`scripts/`/`bin/` for that entry's stat keys, served shape fields, constants and exported symbols; compare against the entry's data-side `Triggers` (right of `‖`); flag as `[registry-stale]` any live producer or consumer the entry does not cover, naming `file:line` and the entry id. Comment-only and test-only hits are not consumers.
- Do this even when the plan's own mirror text is correct — a stale trigger list is a defect in its own right.
- **App-side triggers are frozen authority — never re-derive or "correct" them.** If a data-side fact in an entry looks wrong, flag it; do not edit the mirrored region, since any entry edit must land in both repos in the same change.
- Do not apply fixes; report and let the human decide.
- If the plan appears to create a cross-repo coupling **no registry entry covers**, flag `[registry-gap]` — that is the one case routing out of the in-repo loop. Do not attempt to draft the entry.

**`## Output`** — keep the existing restraint sentences (`:22`) and adopt the app's two-block format:

```
FLAGS
FLAG [category]: <one-line problem> — <file:symbol or line anchor>
…

MIRROR
CR-NN · <contract name> — <the entry's Mirror text>
…
```

Categories: `mechanical`, `shape`, `ordering`, `edge-case`, `invariant`, `strategy`, `cross-repo`, `registry-gap`, `registry-stale`. Omit `FLAGS` if there are none; omit `MIRROR` if the plan touches no registry entry; if both are empty, output exactly `No blocking issues found.` and nothing else.

---

## 6. Tests to add

No unit tests. This change touches only Markdown and agent configuration — there is no runtime behaviour, no served file, no schema, and no manifest entry to assert on. Two verification gates instead:

### T1 — Drift check: the mirrored region must diff to empty

Run from the **app** repo root once both halves have landed:

```bash
diff <(sed -n '/^<!-- CR-REGISTRY-BEGIN -->$/,/^<!-- CR-REGISTRY-END -->$/p' "docs/cross-repo-registry.md") <(sed -n '/^<!-- CR-REGISTRY-BEGIN -->$/,/^<!-- CR-REGISTRY-END -->$/p' "../sleeper-dashboard-data/README.md")
```

Or equivalently from **this** repo's root:

```bash
diff <(sed -n '/^<!-- CR-REGISTRY-BEGIN -->$/,/^<!-- CR-REGISTRY-END -->$/p' "../sleeper-dashboard/docs/cross-repo-registry.md") <(sed -n '/^<!-- CR-REGISTRY-BEGIN -->$/,/^<!-- CR-REGISTRY-END -->$/p' "README.md")
```

**Pass = empty output.** Any output is a mirror defect and must be fixed before commit.

Sanity checks to run alongside it:

```bash
grep -c '^<!-- CR-REGISTRY-BEGIN -->$' README.md && grep -c '^<!-- CR-REGISTRY-END -->$' README.md && sed -n '/^#### CR-01 ·/,/^<!-- CR-REGISTRY-END -->$/p' README.md | grep -c '^#### CR-'
```

Expect `1`, `1`, `18`. A count of `0` for either sentinel means it was indented or wrapped; a count above `1` means a sentinel was written as a bare line somewhere it should have been inline-backticked. The third check deliberately slices from the first real entry heading (`^#### CR-01 ·`), not from `BEGIN` — the `## Entry format` block sitting inside the sentinels contains its own literal `#### CR-NN · <short contract name>` template line, which also matches `^#### CR-` and would inflate a whole-region count to 19.

This is a **manual check for the human**, not CI and not something either subagent can run — neither can read the other tree. Do not add a CI gate for it; that would give a build step cross-repo access, which is the coupling this design avoids.

### T2 — `npm run smoke` stays green

```bash
npm run smoke
```

Expected: unchanged and green. `smoke` chains 12 ingest dry-runs (`nfl`, `cfbd`, `ktc`, `roster`, `draft`, `playerids`, `advstats`, `schedule`, `gamelogs`, `teamcontext`, `playerstate`, `oline`) plus `bin/enrich.mjs validate` and `bin/grade.mjs --self-test`; none of them read `README.md`, `CLAUDE.md` or `.claude/`, so this is a **regression guard confirming nothing was touched under `lib/`/`scripts/`/`bin/`**, not a test of the change. Any red here means the docs-only constraint was violated.

`npm run validate:enrichment` is **not applicable** — no enrichment file or schema changes. (It runs inside `smoke` anyway.)

### T3 — Link-anchor spot check

Confirm the three new in-repo links resolve: `CLAUDE.md` → `README.md#cross-repo-contract-registry-with-sleeper-dashboard` (D2, D4, D6), `CLAUDE.md#workflow-convention` (D2, D5), `CLAUDE.md#invariants` (D4), and `CLAUDE.md#cross-repo-contract-registry-with-sleeper-dashboard` (D3). Visual check on GitHub after push, or by heading-slug inspection.

---

## 7. Cross-repo impact

**Not "none" — one app-side registry correction is required.**

This change does not touch any listed contract behaviourally; it adopts the registry format and mirrors the body. But live verification (§1) found one data-side fact wrong in the frozen spec, and because the mirrored region must stay byte-identical, this repo **cannot** fix it alone.

### Correction the sibling must apply — `scripts/update-nfl.mjs` writer anchor

**Affects four entries: CR-02, CR-11, CR-12, CR-13.**

The registry cites `scripts/update-nfl.mjs:49` (and `:53` in CR-02) as **"the writer"** of `nfl/season-totals/<year>.json`. Verified against live source, those lines are not the writer:

- `scripts/update-nfl.mjs:49` — `const totals = aggregateWeeks(weekData);` (aggregate call site)
- `scripts/update-nfl.mjs:53` — `validateNflSeason(totals, { year });` (validate call site)
- `scripts/update-nfl.mjs:88` — `writeJsonStable(dataPath, totals);` — **the actual write**
- `scripts/update-nfl.mjs:35` — `const dataPath = \`nfl/season-totals/${year}.json\`;` — the served path
- `scripts/update-nfl.mjs:92` — `updateManifestEntry({ … })` — the manifest registration

**Requested edit, inside the mirrored region, in both repos in the same change:**

- **CR-02**, data side: `` `scripts/update-nfl.mjs` (the writer, `:49`/`:53`) `` → `` `scripts/update-nfl.mjs` (the writer, `:88`; aggregate call `:49`, validate call `:53`) ``
- **CR-11 / CR-12 / CR-13**, data-side triggers: `` the writer `scripts/update-nfl.mjs:49` `` → `` the writer `scripts/update-nfl.mjs:88` `` (three occurrences, one per entry)

**Sequencing — deliberate, do not shortcut:**

1. **This change mirrors the region exactly as the app has it today**, wrong anchor included. Byte-identity is the invariant; a unilateral "improvement" here breaks the drift check on day one and is exactly the failure mode the sentinel design exists to catch.
2. The correction lands as a **follow-up change touching both repos together**, per the registry's own rule (*"Adding, editing or retiring an entry means editing inside the sentinels in both repos in the same change"*).

**Severity: low.** The file-level trigger `scripts/update-nfl.mjs` is correct in all four entries, so no producer goes unreviewed; only the sub-line anchor misleads. It is worth fixing because this repo's reviewer, under its new standing re-verification duty (§5, Part 3), will re-derive and re-flag it on every season-totals review until it is corrected.

### Everything else verified clean

All other data-side facts named in the mirror spec were checked against live source and are correct as written — the CR-04 registrar set (13 `update-*` scripts, `update-enrichment.mjs` excluded, three non-`update-*` registrars), `buildInBasisOutcomes` (CR-14), `eraTeam` (CR-16), the five shared sparsity constants (CR-06…CR-10), the `aggregateWeeks` producer loop (CR-11…CR-13), `SCHEDULE_TEAM_ALIAS` (CR-16), and `lib/validate.mjs` as the shape-validator surface. Full evidence in §1. No other app-side correction is requested.
