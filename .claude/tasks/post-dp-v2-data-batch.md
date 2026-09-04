# Post-dp-v2 data batch — D-1…D-4 + F-24 (field prune)

The batched data-repo work the app deferred through all of dp-v2 (`4d` of that program's master
plan), now due since Slice 7 landed. Five items. **None blocking anything shipped.**

Everything in §1 was measured against the live files and the live app tree during planning.

---

## 1. Verified facts

| Fact | Evidence |
|---|---|
| `nfl/season-totals/2025.json` is **3.68 MB**, **2832 rows** | measured |
| Rows split three ways: **2768 player** (2.39 MB), **32 `TEAM_<abbr>` offensive aggregates** (0.078 MB), **32 bare-`<abbr>` team-DEFENSE rows** (0.058 MB) | measured |
| **257 distinct stat keys** across the season; a player row carries **mean 19.4 / median 17** (24.6 / 21 restricted to `gamesPlayed > 0`), a `PHI` DEF row 63, a `TEAM_PHI` row 102 | measured (planning first wrote "~32" — wrong) |
| Share of stat-value occurrences on **player** rows: `idp_*` **12.9%**, `bonus_*` 3.0%, defensive 1.8%, kicking 1.5%, returns 1.3%, punting 0.3%, core/other 79.2% | measured over 53,791 values |
| **`fan_pts_allow_{qb,rb,wr,te,k,def}` + `fan_pts_allow` exist on every DEF row, 32/32 populated** — QB 197.0–402.6, RB 289.5–483.0, WR 401.2–666.3, TE 130.7–355.0 | measured |
| Those rows carry `scoringBasis: "half_ppr"` and a 17-week `weeklyPoints` map | measured |
| **The app consumes ZERO `idp_*` and ZERO `fan_pts_allow*` keys** (grep over `src/` excluding `__fixtures__`) | app tree |
| The app is structurally **QB/RB/WR/TE only** — `SKILL_POSITIONS` in both `dynastyScore.js:12` and `ktcMatch.js:19` | app tree |
| Season-totals are at **schemaVersion 3**; the app hard-gates on `MAX_SUPPORTED_SCHEMA = 3` and **rejects anything higher** | `src/api/dataStore.js:8,81` |
| `.claude/tasks/retire-raw-stats.md` was **already implemented** — zero `raw/stats-*.json` files remain and zero manifest entries reference them (187 entries total). It retired whole **files**, not fields, so it does **not** overlap F-24 beyond intent | measured; `git log` is empty only because **`.claude/` is gitignored in this repo** — task files here are local by design, unlike the app repo |

---

## 2. F-24 — the two findings that reshape it

F-24 as written says: drop defensive and kicking/punting fields nothing consumes; keep return stats.
Anton's note added: team defensive strength matters for start/sit, specifically **fantasy points
allowed to a position group, ranked**.

**Finding 1 — the defensive-stat worry is almost entirely moot on cost grounds.** The 32 team-defense
rows total **58 KB of a 3.68 MB file (1.6%)**. Keeping every one of their 63 stats costs essentially
nothing. There is no tension to resolve: **keep the DEF rows whole**. The defensive fields actually
worth pruning are the ones sitting on *player* rows (`idp_*`), which is a different family entirely.

**Finding 2 — the start/sit metric already exists and needs no new ingest.**
`fan_pts_allow_qb/rb/wr/te` are served today, populated for all 32 defenses, in `half_ppr` basis. The
ranked "which defense is soft against WRs" view Anton described is a **pure app-side derivation over
data already on disk**. F-24 must therefore treat these seven keys as **newly load-bearing and
explicitly non-prunable**, not as "defensive fields nothing consumes."

> **Basis caveat, to state rather than silently absorb:** `fan_pts_allow_*` is a **pre-summed
> season total in Sleeper's `half_ppr` basis**, not the league's own scoring. The app's standing
> invariant is *"Fantasy points computed weekly … never sum pre-stored season totals."* For a
> **ranking** the basis barely matters (relative order across 32 defenses is robust). For a number
> shown as points it does. The alternative — deriving points-allowed per position from the app's own
> league-scored `weeklyPoints` joined to the schedule — is exactly right in-basis and needs no new
> data either. **That choice belongs to the app-side feature, not to this prune** (§7).

### 2.1 The prune list

Drop from **player rows only**:

| Family | Keys | Occurrence share | Why safe |
|---|---|---|---|
| `idp_*` | 17 | **12.9%** | zero app readers; app is QB/RB/WR/TE structurally; **absent from every snapshot's `scoringSettings`** |
| punting (`punt*`, `punts`) | 6 | 0.3% | same, verified the same way |

**Total: 13.2% of stat values on player rows** — the large majority of it `idp_*`.

**KICKING IS NOT PRUNED — review caught this and it would have broken grading.**
`buildInBasisOutcomes` runs `calculateFantasyPoints` **key-agnostically over every row**
(`scripts/grade-snapshot.mjs:87-115`, `lib/grade.mjs:283`), and **all 26 files in `snapshots/` carry
all nine kicking keys in `scoringSettings`** — `fgm_0_19`, `fgm_20_29`, `fgm_30_39`, `fgm_40_49`,
`fgm_50_59`, `fgm_60p`, `fgmiss`, `xpm`, `xpmiss` (verified). Pruning them moves every one to
`droppedTerms`, firing the warning on every in-basis `bin/grade.mjs` / `bin/panel.mjs` run and zeroing
kickers in any future K-inclusive snapshot. **This is the identical reasoning that deferred `bonus_*`
— except here the affected league is real, not hypothetical.** `idp_*` and punting are clean by the
same test: absent from every snapshot's `scoringSettings`.

**Explicitly keep:** every `kr_*`/`pr_*` return stat (Anton's call); all 32 DEF rows **entire**; all 32
`TEAM_*` rows; every `fan_pts_allow*` key; all nine kicking keys (above); `bonus_*` (3.0%, deferred —
scoring-settings-dependent).

**The filter must be an allowlist-safe DENYLIST of exactly `idp_*` and `punt*`** — never an allowlist
of "keys we know the app reads." CR-11/12/13 exist precisely because keys with no visible consumer
are load-bearing; an allowlist would strip them silently.

### 2.2 The blocker F-24 does not mention — Invariant 1

> *"**Append-only for historical data.** Completed past seasons are never overwritten except to
> correct an error (requires a committed diff explaining why)."*

Rewriting completed seasons to strip fields **is** overwriting them, and it is not error correction.

**SETTLED (Anton, 2026-08-24): forward-prune at ingest PLUS a one-time backfill of history, taken as
an explicit named Invariant-1 exception.** The prune's whole value is payload size and history is the
bulk of the corpus, so a forward-only prune would have delivered little of what F-24 promises.

The exception is not implicit. The implementing session must:
- state the rationale in the backfill commit message, and
- **add the exception to Invariant 1 itself** in `CLAUDE.md`, naming F-24, the date, the families
  removed, and the commit — so a future reader sees a documented carve-out rather than evidence that
  the invariant is not enforced.

Suggested wording for the invariant note:

> *Exception (F-24, 2026-08-24): completed seasons were rewritten once to drop `idp_*`, kicking and
> punting fields. No reader in either repo consumed them. Rationale in commit `<sha>`.*

**The rewrite pass is a full re-derivation, not a scoped field delete — and that is a scoring risk.**
Pruning via `bin/update.mjs nfl --year YYYY --force` re-fetches and re-runs `aggregateWeeks`'
dominant-team resolution against **today's** Sleeper. CR-02's Mirror is explicit that per-season
`team` is scoring-load-bearing in the app since the R2 flip and that changes to it move projections
**with no app-side diff**. So the pass must:
- **diff the `team` field for every row across all 14 seasons, before and after**, and
- **stop and report if any row's `team` changed** — do not silently accept it.

A scoped in-place field delete (read → drop `idp_*`/`punt*` → write) avoids this entirely and is the
safer implementation; prefer it unless re-derivation is needed for another reason.

Belt and braces on a one-way operation: **verify the backfill is reversible from upstream before
running it** — season-totals are rebuildable from Sleeper via `bin/update.mjs nfl --year YYYY
--force`. Confirm that on one season first; if any season is *not* reconstructable, stop and report
rather than rewriting it.

### 2.3 The schema question — this is what makes F-24 cross-repo

Season-totals are `schemaVersion: 3`. The app hard-rejects `schemaVersion > 3`
(`dataStore.js:8,81`). So:

- **Bumping to v4 before the app's ceiling is raised does NOT hard-break it** — planning overstated
  this. `tryDataStore` returns `null` and the app falls through to its live 18-week Sleeper loop
  (`src/api/dataStore.js:81`, `src/api/sleeperStats.js:146-158`). The real cost is subtler and argues
  the same way: the fallback recomputes `weeklyPoints` from league scoring instead of the store's
  `pts_half_ppr`, then **caches that at TTL 999999 with no `sourceLastModified`** (`:203`) — a
  long-lived wrong-basis cache that will not self-heal.
- **Not bumping** means a silently different row shape under an unchanged version number, which is
  worse: a reader cannot tell the files apart.

Removing fields no reader reads is arguably compatible, but the version number is the only signal
downstream has.

**SETTLED (Anton, 2026-08-24): bump to v4 and raise the app's `MAX_SUPPORTED_SCHEMA` to 4 in the same
change.** Ordering still matters — the app's ceiling must be raised and deployed **before** any v4
file is published, to avoid the poisoned long-TTL cache above.

**Also correct CLAUDE.md Invariant 4 in the same change.** It claims `MAX_SUPPORTED_SCHEMA` "gates
only season-totals files"; the gate actually runs inside `tryDataStore` for **every** family
(`src/api/dataStore.js:72-84`). Harmless today (all other families are v1/v2), but raising the ceiling
silently un-gates a future v4 of *any* family, so the wording must stop saying otherwise. This fires
**CR-02 · season-totals schemaVersion & row composition**; emit its `Mirror` verbatim in the
implementing session's `## Cross-repo impact`, per both repos' rule.

---

## 3. D-1 · Byes never resolve in served season-totals

**Found:** dp-v2 Slice 4a (`855aded`) · **Blocking:** no · **Size:** ~~small~~ **medium — planning's
diagnosis was wrong and review corrected it**

Served season-totals never emit `weeklyStatus: 'B'`; real byes land in `'X'`. Cosmetic app-side —
`computeAvailability` builds segments only from `'D'`, so nothing mis-computes; the grid just labels a
bye as an unexplained gap.

**The stated fix cannot work.** `aggregateWeeks` **already implements exactly that rule** —
`teamsPlaying` is built from `gp===1`, and the else-branch writes `'B'` and increments `byeWeeks`
(`lib/sleeper.mjs:177-182,227-229`). It is dead code because **Sleeper omits bye-week teams from the
weekly payload entirely** (verified live on `stats/nfl/2025/6`: 30 distinct teams, zero entries with
`gp===0`). So the fix must **synthesize rows for absent players**, not add a rule — a materially
bigger change than "flip a status."

Four things the implementing session must handle:

1. **The schedule is not plumbed to the aggregation point.** `scripts/update-nfl.mjs` never reads a
   schedule and `aggregateWeeks(weekData)` takes no schedule argument (`lib/sleeper.mjs:151`).
   "The schedule is already in the repo" is file-existence, not availability — it must be threaded.
2. **Week 18 would become a phantom bye for every player in 2012–2020.** Those nine seasons have 17
   REG weeks but `weeklyStatus` is a fixed length-18 array, and `validateNflSeason` would **not**
   catch it (it only checks `byeWeeks === count('B')`, `lib/validate.mjs:151-155`).
3. **`byeWeeks` must be incremented alongside the status flip** or validation throws — every served
   file is `byeWeeks: 0` corpus-wide today (verified 2012–2025).
4. **The per-week team is unavailable exactly when it is needed.** On a bye the player has no row at
   all, so there is nothing carrying his team that week. The app already rejected schedule-based bye
   reconstruction for this reason and wrote down why — *"a traded player would get phantom byes for
   his old team's weeks"* (`sleeper-dashboard/src/utils/availabilityGrid.js:4-8`). Any fix must
   resolve the player's team **for that specific week** from another source, or scope itself to
   players with a single team-stint that season.

Given (4), a defensible narrower scope: emit `'B'` only where the player's season-grain team is
unambiguous, and leave `'X'` otherwise. **Do not** ship a version that invents byes for traded
players — that is strictly worse than the current honest `'X'`.

**Ordering:** still pair with F-24's rewrite pass — both touch every historical file, and the
Invariant-1 carve-out should be spent once.

---

## 4. D-2 · `advStats` carries no EPA

**Found:** dp-v2 (`fb8c2dd`) · **Blocking:** no · **Size:** medium

`nflverse/advstats/<year>.json` has no EPA field, so the pop-up's per-opportunity EPA series was cut
permanently: reconstructing it from gamelogs would cost ~33 MB across five seasons.

**This item is an assessment, not an implementation.** Decide whether to add season-aggregated EPA
columns to the advstats ingest (small, since pbp is already fetched for teamcontext) or leave the
metric cut. Do not implement a 33 MB gamelogs path under any circumstances.

---

## 5. D-3 · Four stat keys load-bearing with no contract

**Found:** dp-v2 Slice 5b planning (`d2f1a4f`) · **Blocking:** no · **Size:** small

`rush_yac`, `rush_btkl`, `rec_drop`, `pass_air_yd` are rendered by Market's Efficiency set but appear
in no `CR-NN` entry, so a data-side rename would break the app with no review gate catching it.

Fix: **a dedicated `data→app` registry entry, not a CR-02 extension.** Review corrected planning
here: the established precedent for per-stat-key preservation is a standalone entry triggered by the
`aggregateWeeks:216` sum loop — **CR-11** (five usage keys), **CR-12** (`pass_cmp` alone), **CR-13**
(`rec_air_yd` alone), each deliberately *not* folded into CR-02. Follow that pattern.

Also: **add the four keys to the app's `ALL_CONTRACT_KEYS`** (`src/__tests__/statKeysContract.test.js:47-77`),
where they are currently absent — so the app-side forcing function covers them too. And note
`src/utils/usageEfficiency.js` is absent from the registry entirely; name it while you are there.

**Interaction with F-24:** all four are `core/other` keys and are **not** on any prune list. Landing
D-3 before the prune is the cheap safeguard — it puts them under contract before anything rewrites
the files they live in.

---

## 6. D-4 · `validateKtc` asserts nothing about the 36 pick rows

**Found:** dp-v2 Slice 7 planning review (`f3996a7`) · **Blocking:** no · **Size:** small

`validateKtc` (`lib/validate.mjs:237`) checks total count 250–600, ≥5 each for QB/RB/WR/TE, non-empty
names, and value range — **nothing about pick rows**. Since dp-v2 Slice 7, the app parses those 36
rows to price draft picks in Portfolio's headline roster value. If KTC's DOM changed and they all
vanished, the scrape would still pass (500 → 464, still ≥250) and **every pick would silently
unprice in a shipped number**.

Fix: assert a **floor, never an equality**. Verified on `ktc/snapshot-2026-08-17.json`: 499 rows, of
which exactly 36 match `^(20\d\d) (Early|Mid|Late) (1st|2nd|3rd|4th)$`, all `position: null`. But 36 =
3 draft classes × 3 tiers × 4 rounds is **upstream-controlled** — `=== 36` would fail on good data the
year KTC publishes a fourth class. Assert **≥1 per round 1–4**, or ≥24 total.

*(Planning's "500 → 464" was illustrative; the live count is 499 → 463. The failure mode it describes
is unchanged.)*

**Do this one first.** It is the smallest item, the only one guarding a number a user already sees,
and it is independent of every other item here.

---

## 7. Explicitly NOT this batch

- **The fantasy-points-allowed ranking surface.** §2's Finding 2 makes it possible with zero new
  ingest, but it is an **app-side feature**, not data work. It belongs in the idea tracker as its own
  row (and should cite F-24 as its origin). Its one real design decision — pre-summed `half_ppr`
  `fan_pts_allow_*` vs. deriving in-basis from `weeklyPoints` + schedule — gets made there.
- **`retire-raw-stats.md`.** A separate, still-unimplemented plan about deleting whole files. Do not
  fold it in.
- **`bonus_*` pruning.** Deliberately deferred (§2.1).

---

## 8. Cross-repo impact

CLAUDE.md makes the `Mirror` text a **Session-1 deliverable**; planning deferred it to the
implementing session, which review correctly flagged as wrong. **Six entries fire**, not one.

**CR-02 · season-totals schemaVersion & row composition** — the v3→v4 bump (§2.3), and the rewrite
pass's re-derivation risk (§2.2).

> A version bump needs both repos. **Per-season `team` is scoring-load-bearing in the app since the
> R2 flip (2026-07-11)** — it feeds projection Steps 3/5h attribution via `resolveAttributedTeam`, so
> any edit to the `aggregateWeeks` dominant-team rule (most played weeks; ties → later stint; zero
> played → last seen; schedule-domain normalization) changes app projections **with no app-side
> diff**. Treat such edits as scoring changes and route them through a graded gate. Renaming the
> `TEAM_` pseudo-id scheme is breaking.

**CR-11 · Snap & red-zone usage stat keys** — F-24 inserts this repo's **first key filter** into the
`Object.entries(stats)` sum loop at `lib/sleeper.mjs:216`, CR-11's named data-side trigger. Its
Invariant says these keys are *"preserved as-is and never stripped or filtered by any schema
operation"* — which is exactly why §2.1 mandates a **denylist**, never an allowlist.

> Do not remove, rename or filter these keys. **The projection degrades silently to neutral when they
> are absent** — no error, no test failure, no visible symptom. The blast radius is wider than the
> projection: `durabilitySignals` mis-classifies contributor seasons, `teamContext`'s RZ denominators
> go to zero (so `teamRzShare` sentinels out), the Outlook snap% column empties, and the data repo's
> own panel/backtest reconstructions drift the same way. The dependency is invisible at runtime; this
> registry entry is the only thing recording it.

**CR-12 · `pass_cmp` stat key (QB passer rating)** — same loop, same filter.

> Preserve `pass_cmp`. Missing `pass_cmp` yields a neutral `efficiencyFactor` (1.0) **and** a null
> `Cmp%` cell in the NFL-stats table — silent in both, no errors, no schema bump. Stored `pass_rtg`
> and `cmp_pct` are weekly sums, are **not** consumed by the app (both surfaces recompute from
> counting stats), and must be preserved as-is rather than "fixed".

**CR-13 · `rec_air_yd` stat key (aDOT diagnostic)** — same loop, same filter.

> Preserve `rec_air_yd`. Missing → `factors.adot: null` **and** empty AY-share / aDOT cells on the
> Outlook tab; no errors, no schema bump. Values run ~½ industry aDOT magnitude (likely air yards on
> completed receptions only) — ranking is preserved, absolute magnitude is not industry-standard; that
> calibration is the app's concern, not the data repo's. `factors.adot` is capture-only and must not
> move `projectedPPG`.

**CR-17 · KTC value snapshots** — D-4 edits `validateKtc`, a named CR-17 data-side trigger; that
entry's Invariant already forward-references this gap.

> Keep the snapshot a **bare array** — wrapping it in the `{ schemaVersion, generatedAt, … }` envelope
> every other family uses fails `isValidKtcSnapshot`, and the whole `ktcHist*` capture family degrades
> to empty with **no error and no test failure**. **Updated, dp-v2 Slice 5a:** `ktcHist*` was never
> only a diagnostic — `market/Market.jsx`'s TREND gutter is a second, real rendering consumer of both
> `computeKtcSignals`'s output and the raw `series`; and the failure mode itself changed: a bad/empty
> snapshot now also produces a **visibly blank TREND column on Market**, the app's primary surface.
> Keep the `ktc/snapshot-YYYY-MM-DD.json` path exactly: the app enumerates candidates by regex over
> manifest keys, so a path change makes every snapshot invisible rather than broken. Renaming
> `name`/`team`/`value`/`position` breaks `matchKTCToSleeper` the same silent way — and the record
> shape is constrained **twice** app-side, since `src/api/ktc.js` scrapes the same KTC DOM into the
> same four fields for the live path. Flipping the manifest entry to `inProgress: false` is breaking
> in the unusual direction — the app deliberately opts this path in. Quarantined scrapes must stay in
> `ktc/quarantine/` and **must never be manifest-registered**.

**CR-18 · Signal registry rows** — F-24 removes 23 ingested stat keys and D-1 changes `weeklyStatus`
coverage. §10 covers `data-catalog.md` but the `docs/signal-registry.md` row edit is the actual
deliverable, since this repo cannot edit that file.

> When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or
> alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact
> `docs/signal-registry.md` row edit the app must make (layer · source · coverage ·
> reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the
> data side in the same change. **Nothing fails in either repo when this drifts** — the registry
> simply becomes wrong, and since it is the inventory that governs snapshot-capture and
> grading-inclusion decisions, a stale row misroutes those decisions months later.

**D-3 adds a seventh** — a new dedicated entry for `rush_yac`/`rush_btkl`/`rec_drop`/`pass_air_yd`,
modelled on CR-11/12/13 (§5). Draft it in the implementing session and land it in both repos.

---

## 9. Suggested order

1. **D-4** — smallest, guards a live shipped number, fully independent.
2. **D-3** — puts four load-bearing keys under contract *before* anything rewrites their files.
3. **App-side `MAX_SUPPORTED_SCHEMA` 3 → 4, shipped first.** Must be live before any v4 file is
   published (§2.3). Trivial change; it is the ordering that matters, not the size.
4. **F-24 + D-1 together, one rewrite pass** over the corpus — both touch every historical
   season-totals file, and doing them separately means overwriting history twice under a carve-out
   that should be used exactly once. Verify reconstructability on one season first (§2.2).
5. **D-2** — assessment; write up the recommendation, implement only if it is cheap.

---

## 10. Done-definition

- [ ] `npm run smoke` green; `npm run validate:enrichment` green
- [ ] `manifest.json` updated for every rewritten file; `python3 -m json.tool manifest.json` parses
- [ ] `data-catalog.md` row updated for any family whose schema or coverage changed
- [ ] §8's six Mirrors carried out; the new D-3 entry drafted and landed in **both** repos
- [ ] App's `MAX_SUPPORTED_SCHEMA = 4` **and** CLAUDE.md Invariant 4's "gates only season-totals"
      wording corrected in the same change
- [ ] `docs/signal-registry.md` row edits emitted for every removed key and for `weeklyStatus`
- [ ] D-3's four keys added to the app's `ALL_CONTRACT_KEYS`
- [ ] The prune is a **denylist** of `idp_*`/`punt*`; kicking, `bonus_*`, returns, DEF/TEAM_ rows and
      every `fan_pts_allow*` key verified still present after the pass
- [ ] `team`-field diff across all 14 seasons is **empty** (§2.2); stop and report if not
- [ ] The Invariant-1 exception is stated in the backfill commit **and** written into Invariant 1
      itself in `CLAUDE.md` (§2.2 gives the wording)
- [ ] Reconstructability verified on one season **before** the backfill runs
- [ ] App's `MAX_SUPPORTED_SCHEMA = 4` shipped **before** the first v4 file is published
- [ ] CDN purge for every changed served file (manifest first), per the session git workflow
- [ ] The app's full suite still green against the rewritten files
