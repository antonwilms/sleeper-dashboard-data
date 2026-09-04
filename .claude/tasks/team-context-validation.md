# Team-context pack — grain + definition validation

**Type:** validation substrate (planning only — no source edits; spawns fix slices later)
**Date:** 2026-07-05
**Resolved SHAs (verified via GitHub MCP against origin/main at session start):**
- `sleeper-dashboard-data` origin/main = `a817d45b4a293728a53b7041698a00dbaa10f7dc` (= local HEAD; teamcontext ingest landed at this commit)
- `sleeper-dashboard` origin/main = `4230b5ae792e4465098bc980d4ffb005ef119b2a` ("plan: codebase audit"; the team-context loader/join landed one commit earlier at `ae529f5`) — all app-side claims below are grounded at `4230b5a` via MCP reads

**What this validates:** the LANDED pbp-derived team-context pack (`nflverse/teamcontext/<year>.json`, 2012–2025), before the projection refactor fits weights on it. Grain and feature definitions are one-way-door choices; a definition error propagates silently into fitted weights.

**References (not re-derived here):** `sleeper-dashboard/.claude/tasks/projection-model-assessment.md` (mechanism + E-0..E-3 phasing), `sleeper-dashboard/.claude/tasks/codebase-data-audit.md` (F-drift items, capture gaps), data-repo CLAUDE.md invariants (C4 aggregation discipline, reconstructable-vs-ephemeral, cross-repo mirror).

**Disposition vocabulary (fixed):** correct-as-is / fix-now / backtest-gated / re-derive-from-pbp / dependency-for-roadmap / drift-route-to-reconcile / defer.

**Note for plan review:** the data-repo plan-reviewer subagent cannot verify app-side claims. Every app-side claim is tagged **[APP]** with repo/file/line so it can be checked against `sleeper-dashboard@4230b5a` directly.

---

## A. Grain

### A1. Pack stores team-week — the recoverable superset. Confirmed.
1. One row per `(team, gameId)`, offense view + defense view per game; team-season is derivable by summing components; the reverse is not.
2. Data repo: `lib/nflverse.mjs` `aggregateTeamContext` (accumulator keyed `${team}|${gameId}`, line 1011; row emission lines 1189–1232); served shape README.md §`nflverse/teamcontext/<year>.json` (lines 567–615); grain cell `data-catalog.md:180`.
3. Severity: none.
4. **correct-as-is**
5. No action. Season figures must come from the §consumer-recipes (README lines 638–647), never from averaging stored per-game rates (C4 — already documented on both sides).

### A2. Projection needs team-season primarily; team-week serves it and buys three things season grain cannot.
1. The offseason projection consumes prior-season team aggregates (season PROE, season neutral pace, season RZ mix), all recomputable from summed team-week components; team-week additionally enables (a) within-season segment splits (e.g. QB-injury segments via `enrichment/injuries.json` `segmentStartWeek`), (b) leave-one-out defense-faced adjustment (see B4), (c) late-season weighting after coaching changes (`enrichment/coaching.json`).
2. Recipes: README.md:638–647. Segment/coaching overlays: `enrichment/` (CLAUDE.md invariant 6).
3. Severity: none.
4. **correct-as-is**
5. The roadmap consumption spec should state which of (a)–(c) it activates; none require a data-repo change.

### A3. Sub-game detail is not stored — and is re-derivable, so nothing is genuinely lost.
1. The pack is derive-and-discard (the ~140MB pbp CSV is never committed); anything needing play-level data — a true within-game script measure (see B5), situational splits (play-action, shotgun, no-huddle), a huddle-tempo-pure pace variant — is absent from the pack but reconstructable from the nflverse pbp release, which is a persistent, publicly versioned upstream asset.
2. README.md:569–571 ("derive-and-discard"); `data-catalog.md:179` (same); fetch: `lib/nflverse.mjs` `fetchPbpCsv` (line 433).
3. Severity: low (reconstructable → low urgency by definition).
4. **re-derive-from-pbp** (when and only when a backtest shows a play-level feature earns its keep)
5. No action now. Caveat to record: reconstructability rests on nflverse release availability, not on anything banked in this repo — historically stable, but it is an external dependency, not an in-repo guarantee.

### A4. Rows include postseason (REG+POST); every season-aggregate recipe needs an explicit REG-only convention before fitting.
1. Row counts confirm POST inclusion (534 rows 2012–2020 era, 570 with 17-game + expanded playoffs; e.g. `2024.json` rowCount 570 = 32×17 REG + 13 playoff games × 2 views); playoff teams carry up to ~4 extra rows, so unfiltered season sums are inconsistently sampled across teams — a silent skew in fitted weights, not a crash.
2. `seasonType` is on every row (`lib/nflverse.mjs:1191`); the README recipes mention the seasonType filter only on `playsPerGame` (README.md:646), not on the other five recipes; verified counts from `nflverse/teamcontext/2015.json` (534) / `2020.json` (538) / `2024.json` (570) + manifest `recordCount`s.
3. Severity: **medium** — definitional skew that would corrupt fitted weights, but two-way-door (filterable at read time; no data change needed).
4. **dependency-for-roadmap**
5. The projection consumption spec must fix `seasonType === 'REG'` as the default basis for all season aggregates (and say so once, not per-feature). Optional doc nicety: extend the README recipe preamble to say the filter applies to all recipes — route via reconcile if picked up (drift-route-to-reconcile, doc-only).

---

## B. Feature definitions

### B1. PROE — correctly defined: actual dropback rate minus situation-conditioned expected dropback rate.
1. `proe = (proePassPlays − proeXpassSum) / proePlays` over countable plays where `xpass` is non-null; nflverse `xpass` is the nflfastR expected-dropback model conditioned on game state (down/distance/yardline/score differential/time), i.e. a league-baseline situational expectation — exactly what PROE requires, NOT a league-flat baseline; computed on `posteam` rows only, so it is the team's **offensive** tendency.
2. Accumulation `lib/nflverse.mjs:1133–1137`; emission line 1207; README definition lines 623–625; honest-null-below-2006 guard `lib/validate.mjs:534`; true mathematical [-1,1] bound (not a tighter "typical" band) `lib/validate.mjs:546–553`.
3. Severity: none.
4. **correct-as-is**
5. Two interpretation notes to carry into the consumption spec, no data change: (a) **no neutral-situation filter is applied — deliberately fine**, because xpass already conditions on situation (filtering would also shrink samples; a neutral-filtered variant would need play-level re-derivation → re-derive-from-pbp if ever wanted); (b) `pass==1` is nflverse's **dropback** flag (includes sacks/scrambles), consistent on both sides of the subtraction since xpass predicts dropback probability — "passPlays" throughout the pack means dropbacks. Recommended backtest sanity check: reconcile 2–3 derived season-PROE values against published nflfastR/rbsdm figures.

### B2. Pace — neutral-script, not raw: matches predictive intent, with one known confound.
1. `neutralSecPerPlay` is situation-neutral seconds per snap: game-clock gaps between consecutive countable plays in the same `(gameId, posteam, fixed_drive)`, both endpoints neutral (`wp ∈ [0.2,0.8]`, `qtr ≤ 3`, `half_seconds_remaining > 120`), gap clamped to [5,45]s, chain broken by any intervening non-countable row — this is the game-script-decontaminated variant, not raw seconds/play (raw volume ships separately as `plays`/`passPlays`/`rushPlays`).
2. `lib/nflverse.mjs:1090–1114` (pace chain); emission line 1213–1214; README lines 626–630; range guard `lib/validate.mjs:554`.
3. Severity: low (definition matches intent; the residual confound below is second-order).
4. **correct-as-is**, weight **backtest-gated**
5. Carry one caveat into the spec: gaps are measured on the **game clock**, so clock-stopping outcomes (incompletions, out-of-bounds) systematically shrink gaps — pass-heavy teams read slightly "faster" than their true huddle tempo even in neutral situations. If a backtest shows pace matters and the confound bites, a huddle-tempo-pure variant is a play-level re-derivation (re-derive-from-pbp), not a fix to this asset.

### B3. Red-zone tendencies — clean definitions, correct denominators.
1. `rzPlays` = countable plays at `yardline_100 ≤ 20`; `rzTrips` = distinct `fixed_drive` with ≥1 countable RZ play; `rzPassRate = rzPassPlays / (rzPassPlays + rzRushPlays)` (denominator excludes no_plays and two-point attempts via the countable-play basis); `rzTdTrips`/`rzFgTrips` settle per drive from `fixed_drive_result` ('Touchdown' = possessing team scored, so defensive scores don't pollute it).
2. Accumulation `lib/nflverse.mjs:1138–1143`; drive settle lines 1169–1179; emission 1208–1212; README lines 631–633.
3. Severity: none.
4. **correct-as-is**
5. Two semantics notes for consumers: (a) a TD scored from outside the 20 on a drive that never snapped inside it is **not** an RZ trip — correct for trip semantics, but it means `rzTdTrips ≠ team offensive TDs`; don't use it as a TD count. (b) Forward-feature validity of the conversion rate is handled in E3 (mean-reverting; tendency vs conversion distinction).

### B4. Defense-faced EPA/success — raw (unadjusted) by design; team-week grain makes leave-one-out a consumer-side recipe, and the roadmap must mandate it.
1. The `def` block stores raw per-game EPA/success allowed (same plays as the opponent's `off` block, attributed to the defense as "faced/allowed") — no opponent adjustment and no leave-one-out in stored values; **this is the right storage decision** because the per-game components (`epaSum`/`epaPlays` per game) let a consumer compute LOO exactly (exclude the game(s) vs the player's own team before summing) without re-deriving pbp — an aggregated-grain asset could not.
2. Accumulation `lib/nflverse.mjs:1146–1161`; emission 1217–1229; README lines 634–636.
3. Severity: **medium if omitted at consumption** — without LOO, a strong offense inflates its own opponents' EPA-allowed, biasing any strength-of-schedule adjustment derived from it; zero severity at the storage layer.
4. Storage: **correct-as-is**. Consumption: **dependency-for-roadmap**.
5. The roadmap consumption spec must write the LOO recipe explicitly (per-game component sums minus own-matchup games, then divide) — name it as a required step, not an optional refinement.

### B5. Game-script — quantified only as final score; the advertised feature name overstates what shipped, and final margin is a leaky proxy for team quality.
1. The only game-script-adjacent fields are `pointsScored`/`pointsAllowed` (final score per game); `wp` is consumed solely as the pace-neutrality gate (`lib/nflverse.mjs:1095`) — there is no within-game script measure (no time-weighted lead/deficit, no mean win-probability, no snaps-while-trailing), yet README line 573, `data-catalog.md:187`, and the a817d45 commit message all list "game script" as a shipped derived feature.
2. Emission of score fields `lib/nflverse.mjs:1181–1187, 1215, 1228`; README feature list line 573 vs. definitions lines 634–636 (score fields are listed under "Defense-faced / offense quality", tacitly conceding there is no separate script feature); `data-catalog.md:187`.
3. Severity: **medium** — not one-way-door (a true script measure is re-derivable from pbp), but the naming drift invites the refactor to treat final margin as "script context" when it is in fact the team-quality **outcome** — double-counting quality and mislabeling it as situation would corrupt fitted weights exactly the way this validation exists to prevent.
4. **re-derive-from-pbp** (if the model needs a true script measure: e.g. mean point differential across snaps, or share of snaps trailing by 7+) + **drift-route-to-reconcile** (README/data-catalog wording: either stop listing "game script" as a feature or define it honestly as "final score only").
5. Route the doc wording to the next reconcile pass; hold the derived-feature decision until a backtest shows a script measure earns a weight. E5 covers the leakage classification of the score fields themselves.

---

## C. Era-accurate remapping

### C1. `eraTeam` covers every franchise relocation in the 2012+ panel, with correct boundary years — verified in shipped data, no double-counts.
1. `LA→STL` (season ≤ 2015), `LAC→SD` (≤ 2016), `LV→OAK` (≤ 2019) are the complete relocation set for 2012–2025 (Washington's renames kept abbr `WAS` in nflverse; no other franchise moved); boundary files verified directly: `2015.json` keys STL/SD/OAK, `2016.json` LA/SD/OAK, `2017.json` LA/LAC/OAK, `2019.json` LA/LAC/OAK, `2020.json` LA/LAC/LV — exactly 32 teams every season, never both codes of a pair in one file.
2. `lib/nflverse.mjs` `eraTeam` (lines 942–947), applied to all four team columns at parse (lines 1068–1071); both-directions regression guard `lib/validate.mjs:515–528`; data verified in `nflverse/teamcontext/{2015,2016,2017,2019,2020}.json`.
3. Severity: none.
4. **correct-as-is**
5. No action. The wrong-asset season guard (`lib/nflverse.mjs:1031–1039` — CSV's own season column asserted against the requested season, stronger than gamelogs' fallback) is what makes the remap trustworthy: remap correctness depends on season correctness, and season is asserted, not adopted.

### C2. Join-domain agreement verified against live served data on both sides of each boundary.
1. teamcontext keys match the era-accurate join domain in fact, not just by intent: `nflverse/schedule/2024.json` uses LA/LAC/LV; `nfl/season-totals/2024.json` per-season `team` values use LA/LAC/LV (and 2012/2015 use STL/SD/OAK; 2016 uses LA); i.e. a season-totals v3 `team` string is directly usable as a teamcontext key in every season.
2. Verified by direct read of `nflverse/schedule/2024.json` (`homeTeam`/`awayTeam` domain) and `nfl/season-totals/{2012,2015,2016,2024}.json` (`team` field domain) at `a817d45`.
3. Severity: none.
4. **correct-as-is**
5. No action.

### C3. [APP] The app mirrors `eraTeam` line-for-line; the mirror is a cross-repo contract with no shared code.
1. `sleeper-dashboard` `src/utils/playerTeam.js` exports an `eraTeam` identical to the data repo's (same three rules, same boundary years), with an explicit comment in **both** repos that a future franchise move must update both together.
2. [APP] `src/utils/playerTeam.js` (eraTeam export, ~line 33 at `4230b5a`); data side `lib/nflverse.mjs:942–947`.
3. Severity: none today; a future relocation updated in only one repo is a silent wrong-team join for that season — the both-directions validator (C1) would catch the data side but nothing catches the app side except `playerTeam.test.js`.
4. **correct-as-is**
5. Named in Cross-repo impact below so the roadmap treats the mirror as a contract row, not an implementation detail.

---

## D. Join integrity & consumption dependency

### D1. [APP] View-layer join path is correct and single-pointed.
1. `resolvePlayerTeam({careerStats, gameLogPlayers}, pid, season[, week])` is the SINGLE player→team resolution point: season grain reads `careerStats[season][pid].team` (season-totals v3 — already era-accurate; the app comment records an exhaustive 2012–2025 scan verifying the normalization chain is an identity on that domain); week grain reads gamelogs `games[].team` (**current-franchise domain in every season**) and applies `eraTeam` — the load-bearing remap; output feeds `getTeamSeasonRows`/`getTeamWeekRow` in the loader. Sleeper's `playerMap[pid].team` (current team, incl. `LAR`) is deliberately NOT an input.
2. [APP] `src/utils/playerTeam.js` (`resolvePlayerTeam`, lines ~50–66); `src/api/teamContext.js` (`getTeamSeasonRows`/`getTeamWeekRow`, tail of file); loader cache key `nfl-teamcontext/<year>` with (season, team) access pattern, `MIN_TEAMCONTEXT_ROWS` enforced at three layers (tryDataStore validate, cache-hit guard, post-fetch re-assert).
3. Severity: none.
4. **correct-as-is**
5. No action. Note for hygiene: `src/utils/teamContext.js` (projection module, `compute*` exports) and `src/api/teamContext.js` (pack loader, `load*/get*` exports) share a filename — the loader header documents the non-collision; keep the naming discipline when the refactor touches either.

### D2. [APP] **The precondition, stated explicitly for the roadmap:** the projection pipeline still attributes historical player-seasons to the player's CURRENT team — pack consumption before per-season re-anchoring would silently corrupt fitted weights.
1. The projection-side team attribution (`computeTeamContext`, `computeHistoricalTeamTotals`, `computeHistoricalShares` in the app's `src/utils/teamContext.js`) keys every season's totals by `playersMap[pid].team` — Sleeper's current team — so a player's 2023 stats would join his 2026 team's 2023 context; season-totals v3 ships the per-season `team` field (the fix's raw material), but the projection-pipeline re-anchoring is **still deferred** per the projection-model assessment and the codebase-data audit.
2. [APP] `src/utils/teamContext.js` — `computeTeamContext` (`player?.team` from playersMap, ~line 118), `computeHistoricalTeamTotals` (~line 195, with an in-code comment acknowledging the limitation), `computeHistoricalShares` (~line 224); consumed by `src/utils/seasonProjection.js` / `dynastyScore.js`. Deferral: `sleeper-dashboard/.claude/tasks/projection-model-assessment.md`, `codebase-data-audit.md`.
3. Severity: **high** — this is the one finding in this document that, if unhandled, corrupts every fitted weight touching team context, silently and systematically (players who changed teams are exactly the high-signal cases).
4. **dependency-for-roadmap**
5. The roadmap session must sequence **per-season-team re-anchoring of the projection pipeline BEFORE any teamcontext consumption** — name it as a blocking precondition, not a parallel slice.

### D3. [APP] The view-only contract is real, enforced, and will (by design) fail the moment the refactor wires consumption — amending it is itself a roadmap step, and `resolvePlayerTeam` is inside the fence.
1. Both repos declare the pack view-only ("must never feed projection/scoring/grading": data CLAUDE.md contract row; app loader header), and the app enforces it with a source-scanning test over 14 named pipeline modules that forbids importing `api/teamContext` **and** `playerTeam`/`resolvePlayerTeam` — so the projection refactor cannot reuse the existing join helper as-is; it needs a deliberate contract amendment (both repos' wording + the test's PIPELINE fence) or a projection-legal resolution path, decided as its own reviewed step.
2. [APP] `src/__tests__/teamContextViewOnly.test.js` (PIPELINE list of 14 modules; regexes on `api/teamContext`, `loadTeamContext|getTeamSeasonRows|getTeamWeekRow`, `playerTeam`, `resolvePlayerTeam`); data side CLAUDE.md Cross-repo contracts → "nflverse teamcontext" row; `data-catalog.md:186`.
3. Severity: none (the fence working as designed); flagged so the roadmap doesn't discover it as a surprise red test.
4. **dependency-for-roadmap**
5. Roadmap must include an explicit "amend the view-only contract" step covering: data CLAUDE.md row, app loader header, the test's PIPELINE fence, and the decision on whether `resolvePlayerTeam` becomes projection-legal or gets a projection-side sibling.

### D4. Multi-team seasons join to a single team's context at season grain — the consumption spec must pick a policy; the data supports all of them.
1. Season-totals v3 carries ONE `team` per player-season, so a mid-season-traded player's season joins one team's context rows; the week-grain path (gamelogs `games[].team` + `eraTeam`) already resolves per-week attribution at the view layer, and the pack's team-week grain supports week-weighted blends if the spec wants them.
2. Data: `nfl/season-totals/<year>.json` per-record `team` (schemaVersion 3); [APP] week grain in `src/utils/playerTeam.js` (`resolvePlayerTeam` week branch).
3. Severity: low-medium (affects a small player subset, but trades are correlated with role changes — the exact cases a projection cares about).
4. **dependency-for-roadmap**
5. Spec decision to make once: dominant-team season join (cheapest) vs. games-weighted blend across teams (team-week grain already pays for it). No data-repo change either way.

### D5. Doc drift (two items, both data-repo, both doc-only).
1. (a) `data-catalog.md:186` Consumption cell still reads "banked view-only **until the app loader ships**" — the loader shipped in app `ae529f5`; (b) `data-catalog.md:181` lists "gamelogs `games[].team`" among era-accurate join ids without noting that gamelogs is current-franchise domain and needs the `eraTeam` remap first (the provenance note at line 179 states the direction, but the Join-ids cell reads as if domains already agree — a trap for a future consumer reading only that cell).
2. `data-catalog.md:181, 186`.
3. Severity: low (docs only; the code is right).
4. **drift-route-to-reconcile**
5. Fold both into the next docs-reconcile pass; no dedicated slice.

---

## E. Leakage / temporal validity (as offseason next-season projection inputs)

All features derive from completed prior-season pbp and are available at offseason projection time (files are static once a season completes; the current-season file mutates weekly but an offseason projection reads only seasons < targetSeason). Availability is clean across the board; the classifications below are about what each feature *encodes*.

### E1. PROE (prior season) — valid forward feature.
1. Coaching/scheme-driven tendency, situation-adjusted by construction (B1), does not encode next-season outcomes; persistence breaks on coaching change — `enrichment/coaching.json` is the conditioning overlay.
2. Feature per B1; overlay `enrichment/coaching.json`.
3. Severity: none.
4. **backtest-gated** (weight, not validity — per the projection-model assessment's fitted-weights phasing)
5. Enter the backtest with a coaching-change interaction in mind.

### E2. Neutral pace + volume (prior season) — valid forward feature, second-order.
1. Neutral pace is scheme-persistent-ish and forward-legal; raw `passRate` is script-confounded (prefer PROE for tilt); `plays`-based volume is forward-legal but weak.
2. Per B2; recipes README.md:645–646.
3. Severity: none.
4. **backtest-gated**
5. If pace earns a weight, revisit the game-clock confound (B2 caveat) before trusting small coefficients.

### E3. RZ: tendency is forward-valid; conversion is a regression signal, not a persistence signal.
1. `rzPassRate` (scheme tendency) is forward-legal; `rzTdTrips/rzTrips` conversion is heavily mean-reverting and correlated with the TD outcomes that dominate PPG — using prior-season conversion as a persistence feature is not target leakage (different season) but fits noise; its correct forward use is inverted: as an expected-TD-regression signal.
2. Per B3; consumer recipe README.md:644.
3. Severity: low-medium (a fitted positive weight on prior conversion would be the model learning luck).
4. **backtest-gated** (with the mean-reversion framing fixed in the spec before fitting)
5. Spec should predeclare: tendency features enter as levels, conversion enters (if at all) as a regression-to-mean term.

### E4. Defense-faced EPA/success — same-season-adjustment-only; NOT a forward predictor.
1. Legitimate use is same-season: strength-of-schedule adjustment of a player's prior-season inputs (with LOO per B4) and grading-side context; as a next-season predictor it is misaligned — schedules turn over year to year, and defensive quality itself is unstable enough year-over-year that even "projected next-season SOS" is a separate modeling exercise (next-season schedule from the schedule family + a defense projection), not a read of this feature.
2. Per B4; schedule family `nflverse/schedule/<year>.json` for the forward-schedule half if ever attempted.
3. Severity: **medium if misused** — wiring prior-season defense-faced directly as a next-season feature would inject schedule noise into every weight sharing a fit with it.
4. Classification: **same-season-grading/adjustment-only** (formally: dependency-for-roadmap — the spec must carry this constraint)
5. The consumption spec lists defense-faced under input-adjustment/grading, never under forward features.

### E5. `pointsScored`/`pointsAllowed` ("game script") — forward-legal only as an explicit team-quality prior; never as within-target-season context.
1. Prior-season team points as a next-season feature is not leakage (prior outcome → next outcome), but it is heavily collinear with the player's own prior production (his TDs are in `pointsScored`) and it is team-quality **outcome**, not situation (B5); any same-target-season use would be near-tautological (encodes the target's components).
2. Per B5; emission `lib/nflverse.mjs:1215, 1228`.
3. Severity: medium (same root as B5 — mislabeling outcome as context).
4. **backtest-gated** if entered honestly as a team-quality prior; **same-season-grading-only** for any within-season use; the "script" framing routes to B5's re-derive decision.
5. Rename in the spec: call it team scoring environment, not game script; fit it (if at all) with the collinearity acknowledged.

### E6. In-season availability caveat (only if the refactor ever does in-season updates — out of scope for the offseason model).
1. The weekly refresh runs Sunday 13:53 UTC before kickoffs, so week N lands complete on the following Sunday — up to a week of lag; irrelevant for offseason projection (complete-season reads), stated so nobody discovers it as a "gap" later.
2. `.github/workflows/nflverse-teamcontext.yml` (cron comment); README.md:672–675.
3. Severity: none for the offseason model.
4. **defer**
5. Revisit only if an in-season update mode is ever specced.

---

## Cross-repo impact

What the app repo must mirror or consume, and every contract touched:

1. **`eraTeam` mirror (contract, no shared code):** data `lib/nflverse.mjs:942–947` ↔ app `src/utils/playerTeam.js`. Any future relocation/rename updates both together (both files say so). Unchanged by this validation; named so the roadmap treats it as a contract row.
2. **`MIN_TEAMCONTEXT_ROWS = 60` shared constant:** data `lib/nflverse.mjs:53` ↔ app `src/api/dataStore.js` (loader enforces at three layers). Unchanged.
3. **Served shape @ schemaVersion 1:** CLAUDE.md Cross-repo contracts "nflverse teamcontext" row ↔ app loader pass-through. No change proposed to the shape by any finding above — every fix here is consumer-side convention, doc wording, or roadmap sequencing. The pack's stored bytes are validated **correct-as-is**.
4. **View-only contract amendment (future, when the refactor activates consumption):** touches data CLAUDE.md contract-row wording, app loader header, and app `src/__tests__/teamContextViewOnly.test.js` (PIPELINE fence + the `resolvePlayerTeam` prohibition) — one reviewed step, both repos, per D3.
5. **Roadmap preconditions to carry forward by name (per D2/A4/B4/E4):** (a) per-season-team re-anchoring of the projection pipeline BEFORE teamcontext consumption — blocking; (b) REG-only aggregation convention; (c) LOO recipe for defense-faced; (d) defense-faced and within-season score fields classified same-season-only.
6. **Data-repo-only doc drift (no app action):** `data-catalog.md:181, 186` per D5; README "game script" wording per B5 — route to reconcile.

---

## Summary table

| # | Finding | Severity | Disposition |
|---|---|---|---|
| A1 | Team-week grain confirmed (recoverable superset) | — | correct-as-is |
| A2 | Team-week serves projection's team-season need + 3 extras | — | correct-as-is |
| A3 | Sub-game detail absent but reconstructable upstream | low | re-derive-from-pbp |
| A4 | POST rows included; REG-only convention unfixed | medium | dependency-for-roadmap |
| B1 | PROE correctly situation-conditioned (xpass), offense-side | — | correct-as-is |
| B2 | Pace is neutral-script (correct intent); game-clock confound | low | correct-as-is / backtest-gated |
| B3 | RZ definitions + denominators correct | — | correct-as-is |
| B4 | Defense-faced raw by design; LOO must be mandated at consumption | medium | correct-as-is (storage) / dependency-for-roadmap |
| B5 | "Game script" = final score only; leaky-proxy naming drift | medium | re-derive-from-pbp + drift-route-to-reconcile |
| C1 | Era remap complete + boundary-verified in data | — | correct-as-is |
| C2 | Join-domain agreement verified live both sides of boundaries | — | correct-as-is |
| C3 | [APP] eraTeam mirror exact; contract named | — | correct-as-is |
| D1 | [APP] Single-point join helper correct across both grains | — | correct-as-is |
| D2 | [APP] Projection still current-team-anchored — blocking precondition | **high** | dependency-for-roadmap |
| D3 | [APP] View-only fence blocks loader AND resolvePlayerTeam from projection | — | dependency-for-roadmap |
| D4 | Multi-team seasons: single-team join at season grain; policy needed | low-med | dependency-for-roadmap |
| D5 | data-catalog Consumption cell stale + Join-ids domain trap | low | drift-route-to-reconcile |
| E1 | PROE forward-valid | — | backtest-gated |
| E2 | Neutral pace/volume forward-valid, second-order | — | backtest-gated |
| E3 | RZ conversion = regression signal, not persistence | low-med | backtest-gated |
| E4 | Defense-faced: same-season-adjustment-only | medium | dependency-for-roadmap |
| E5 | Score fields: team-quality prior at best; never within-season | medium | backtest-gated / same-season-only |
| E6 | Weekly-refresh lag irrelevant offseason | — | defer |

No finding proposes a change to the pack's stored bytes or schema. The single high-severity item (D2) is a sequencing constraint on the projection refactor, not a data defect.
