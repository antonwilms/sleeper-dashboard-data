# LP-3 · Learned projection research — data audit + architecture options memo

**PARKED (Anton, 2026-11-11): unrevised. Do not implement. Re-planned after LP-1 is implemented and verified; the full plan review's 8 flags are open. Anton's ruling: this slice may read source documentation and licence pages.**
**Status:** plan, Revision 1 (Session 1, parent folder, 2026-11-11). Sections A (data audit) can start any time; section B (architecture recommendation) is finalised only after LP-2's verdicts exist.
**Review depth: full** — the memo recommends a new cross-repo architecture and names contract changes, even though it changes none.
**Session 2:** **sonnet**, effort **medium**, from the parent folder (reads both repos, writes one file in the data repo). Docs only: no source, test, served-data or registry edit; **no fetch, no capture, no pipeline run**.
**Anchors:** data `main` @ `1a9ad58`; app `main` @ `2c3578b`; LP-1 §2 facts; LP-2 verdicts when present.

---

## 0. What this is, for Anton

One memo with two decisions prepared for you: which extra data would most improve the projections for its cost, and how a learned model should reach the app. It decides nothing itself.

## 1. Deliverable

`research/learned-projection/memos/<date>-data-and-architecture.md` (data repo), opening with a one-page summary in plain language, then the two sections below. Unregistered documentation, like the verdicts.

## 2. Section A — ranked data audit

One row per source, ranked by expected gain per unit of cost:

| Column | Content |
|---|---|
| Source | what it is, where it comes from |
| What it would add | the specific inputs it unlocks, and which LP-2 weakness they address |
| Expected gain | `high` / `medium` / `low` with the basis: an LP-2 ablation or `oracle-` arm where one exists, otherwise the published evidence cited in `sleeper-dashboard/docs/prediction-research-eval.md`, otherwise "unmeasured" — never an invented number |
| Cost | free or paid; ingest effort (new family / widen an existing one / app capture); history depth available |
| As-of quality | whether the historical record is the pre-game version (LP-1 F1, F3, F4, F7 are the model answers) |
| Contracts touched | cross-repo index ids, `data-catalog.md` rows, invariants (capture-only doctrine, Invariant 1 for any backfill, CR-18 signal registry) |

Sources that must appear (the brief's list, plus what LP-1 found missing):
1. Per-game snap counts — nflverse `snap_counts` is per game upstream; the served family aggregates to season (LP-1 F2).
2. Full nflverse play-by-play — today derive-and-discard into `nflverse/teamcontext`; what player-level derivations (routes proxy, red-zone and goal-line opportunity, air yards by depth, EPA per opportunity) a second derive-and-discard pass could bank.
3. Next Gen Stats (nflverse `nextgen_stats`).
4. Injury reports (nflverse `injuries`, practice status and game designation) — the pre-game answer to LP-2's `oracle-teammates` arm.
5. Betting lines with history (opening/look-ahead versus the single stored value, LP-1 F1), including player props as an external benchmark.
6. Contracts (nflverse `contracts` / OverTheCap).
7. Route and participation data (PFF and similar, mostly paid; nflverse `pbp_participation` coverage and its licence change).
8. Sleeper weekly projections history (LP-1 F7) — as a benchmark source, and the case for capturing it forward from now so its timing is known.
9. Pre-game depth charts — forward capture already exists in `nfl/players-state`; what a timestamped weekly capture would need.

For each: verify coverage and licence from the source's own documentation by reading it (web reads are allowed; downloading data files is not). Where a claim cannot be verified, say so.

The LP-2 `oracle-` arms and ablations are the measured part: quote their deltas as the ceiling for injuries/depth timing and the measured value of teammate context, opponent and lines.

## 3. Section B — architecture options

Lay out, for each option: how it works in two sentences, what it costs to build and to keep running, what it does to freshness, which contracts and invariants it touches, how parity between training and serving is tested, and how the side-by-side shadow period would run.

- **(a) Train offline in Python, export parameters, evaluate in the app in JS.** The existing pattern for fitted constants (pinned `backtests/<date>-*-constants.json`, byte-copied app fixture, re-derivation test — CR-25/CR-27). Fits family H naturally (tables of cohort coefficients and shrinkage constants). Family G needs a tree-ensemble evaluator in JS and a model file of hundreds of kilobytes; parity is testable but the model is opaque.
- **(b) Compute projections in the data repo and serve them as a new family.** Ends the capture-only doctrine for that family (the store would publish model output), adds a cross-repo contract, a weekly in-season job, and a snapshot-format question. Sub-option **(b′): serve scoring-free stat projections** (expected key values per player-week) and let the app apply `scoreSeasonStats` — keeps league scoring out of the public store and keeps the app's scoring seam single.
- **(c) Hybrid.** The season/role layer computed offline and served as stat-level baselines; the weekly adjustment (opponent, teammate availability from live Sleeper state) evaluated in the app from exported parameters.
- Any further option Session 2 finds, argued the same way.

Also cover: where the inputs the model needs at run time would come from in the app (today's view-only families becoming projection inputs — list each with its CR id and guard test from LP-1 D2); what a shadow model's snapshot output would require (CR-01 envelope change — **flag, do not design**); how the January season grade would grade the shadow model; and what happens to the `factors` contract (82/69 keys) and `docs/signal-registry.md` if the factor chain is replaced.

**Recommendation rule (fixed now, applied to LP-2's numbers):** if family H is within 2% pooled MAE of family G at every position on the season and weekly gates, recommend (a) with H. If G is ahead by more than that at two or more positions, recommend (c) or (b′) and say which and why. If neither family passed LP-1 §8, recommend no architecture change and name what would have to be true to revisit. State the recommendation in one sentence with its single strongest reason, then the runner-up.

## 4. Section C — decisions needed from Anton

A numbered list, each with a recommendation: every contract or doctrine change the recommended path implies (per family), Python's standing in the data repo beyond research (LP-1 D1), whether to fund any paid source, whether to start forward-capturing Sleeper projections and injury reports now, and whether to proceed to a shadow-model slice.

## 5. Checks (docs-only slice — no tests)

- Every factual claim about either repo cites a path (and symbol or section) that exists at the anchors; Session 2 lists them in the hand-back.
- Every "expected gain" cell names its basis.
- Every contract id cited exists in `sleeper-dashboard/docs/cross-repo-registry.md`.
- `git status` in both repos shows only the memo.

## 6. Pass statement

**LP-3 passes** when the memo ranks all nine sources with every column filled, lays out options (a), (b)/(b′) and (c) on the same criteria, applies the §3 recommendation rule to LP-2's actual labels, and lists the §4 decisions with a recommendation each.

## 7. Stop conditions

LP-2 verdicts absent when section B is due (write section A, hand back, wait); any urge to fetch a data file, edit a registry, or design the snapshot change.

## 8. Done-definition

Memo committed locally in the data repo, no push; hand back SHA, the cited-path list, and any claim left unverified.
