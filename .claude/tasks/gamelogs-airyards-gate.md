# gamelogs air-yards plausibility gate

**Type:** one validator addition + tests. **No data, no manifest, no served shape, no CDN purge.**
**Session model:** plan (opus, this file). Implementation is a separate sonnet session — do not edit
source here.
**Source:** recorded as out-of-scope by five consecutive slices (`store-audit-2026-08-25.md` C2 §11.1
→ `advstats-2016-gate.md` §12.1 → `reingest-2016.md` §12.1 → `registry-anchor-reconcile.md` §11.1 →
`registry-trigger-corrections.md` §7.2). Verified against live source and data **2026-08-30** at HEAD
`a1a959c`.

**Why it kept coming back.** `nflverse/gamelogs/2016.json` carried the identical air-yards corruption
as advstats — 3.90 against an archive range of 7.74–8.86 — for three months, and nothing caught it.
The advstats gate could not help: the two families validate independently, and gamelogs' validator has
no distributional check at all.

**The finding that shapes this slice.** The audit says *"Same fix, different family."* **It is not.**
Mirroring the advstats gate wholesale would reject three seasons of legitimate data (§1.3). One half
transfers; the other must be deliberately left out, and the reason recorded so a later slice does not
"complete" it.

**Working-tree note.** `store-audit-2026-08-25.md` is modified and uncommitted. **Do not stage,
commit, revert or edit it.** Nothing here touches it.

---

## 1. Verified facts

### 1.1 · What `validateGameLogs` checks today

`lib/validate.mjs` `validateGameLogs` has four checks: the `MIN_PLAYERGAME_ROWS` row floor, a
format-drift guard (<50% of rows carrying any non-identity key), the `findNonFinite` sweep, and
per-game `targetShare ∈ [0,1]`.

**Nothing distributional.** And it already declines the air-yards share explicitly, with a comment:
*"(airYardsShare may be negative — skip)"*. That is correct as far as it goes (§1.3 shows why) but it
leaves the family with no defence against the failure that actually occurred.

### 1.2 · The band fits, and it is the same band

Σ`receivingAirYards` ÷ Σ`targets`, all 14 seasons:

| | range |
|---|---|
| REG-only | **7.74 – 8.86** |
| all rows (REG+POST) | **7.77 – 8.91** |

**Every ratio quoted from here on is the ALL-ROWS measure**, matching §2's decision. The two differ
enough to break a test assertion: fixed 2016 is 8.42 all-rows but 8.38 REG-only, and corrupt 2016 is
3.93 vs 3.90. An earlier draft quoted the REG-only figures throughout while deciding all-rows — copy
the numbers from this plan only after confirming which measure the code accumulates.

Both sit comfortably inside advstats' existing `[AY_PER_TARGET_MIN, AY_PER_TARGET_MAX]` = **[6, 11]**.
That is expected: both families derive from the same `stats_player_week_<year>.csv` and measure the
same physical quantity.

**And the band catches the real failure decisively.** Reconstructed from git, the pre-re-ingest 2016:

| | AY/target | verdict |
|---|---|---|
| corrupt 2016 (`957d27f`) | **3.93** | outside [6, 11] — **throws** |
| fixed 2016 | 8.42 | passes |
| 2017 control | 8.36 | passes |

### 1.3 · The `|airYardsShare| ≤ 1` bound does **not** transfer — this is the slice's real finding

advstats carries that bound, and I verified when planning C2 that **zero** advstats rows violate it.
Gamelogs is different: **five rows exceed it, across three seasons, and all five are legitimate.**

| season | wk | player | share | recAY | tgt |
|---|---|---|---|---|---|
| 2015 | 9 | Sammy Watkins | 1.021 | 143 | 8 |
| 2022 | 6 | D.J. Moore | **1.842** | 35 | 7 |
| 2025 | 10 | Garrett Wilson | 1.316 | 50 | 3 |
| 2025 | 17 | Tetairoa McMillan | 1.140 | 49 | 4 |
| 2025 | 18 | Evan Engram | 1.154 | 30 | 4 |

**Why they are real, not corrupt:** per-game `airYardsShare` divides by the team's **net** air yards
*for that game*, and net air yards can be near zero or negative when passes are thrown behind the
line. A receiver with positive air yards on such a team legitimately exceeds 1. The season-aggregated
advstats denominator is large and stable, so the same thing never happens there.

**A hard `≤ 1` throw would therefore reject 2015, 2022 and 2025 on re-ingest.** That is the trap in
"same fix, different family".

**And a share-count guard would not earn its place either.** Corrupt 2016 had **6** such rows against
0–3 in healthy seasons — a real signal, but far too weak to set a threshold on. The aggregate band
separates the same case by more than 2× (3.90 vs 7.74–8.86). **The band is the guard; the share bound
adds risk without adding detection.**

### 1.4 · Mechanical facts

- Gamelogs rows are **flat**: `receivingAirYards` and `targets` sit directly on each game object —
  not nested under `components` as in advstats.
- `AY_PER_TARGET_MIN`/`MAX` are **already imported into `lib/validate.mjs`** (used by
  `validateAdvStats`), so reuse needs no new import.
- `npm run smoke` dry-runs `gamelogs --year 2023` (ratio 7.79 — in band).

---

## 2. The gate

One addition to `validateGameLogs`, mirroring the shape of `validateAdvStats`'s band check.

Accumulate `receivingAirYards` and `targets` across **all** game rows; if `Σtargets > 0`, assert the
ratio falls in `[AY_PER_TARGET_MIN, AY_PER_TARGET_MAX]`, else throw naming the year and the ratio.

**Reuse the constants; do not introduce a second band.** Same source CSV, same quantity, and both
families' ranges (7.74–8.91 and 7.80–9.07) sit inside the same [6, 11]. A band correct for one is
correct for the other, and one definition means one thing to change.

**Guard the denominator — by THROWING, not skipping. This is where the slice inverts advstats.**

`validateAdvStats` skips when `Σtargets === 0`, and that is safe there for a reason that **does not
transfer**: `aggregateAdvReceiving` hard-throws if the `targets` column is missing
(`iTargets === -1`), so by the time the validator runs, targets is guaranteed present. **`parsePlayerGameLogs`
requires only `player_id`, `position`, `season` and `week`** — `targets` is not a required column.

So copying the skip would reinstate the exact failure this slice exists to close:

> nflverse renames `targets` → every game row loses the key → `parsePlayerGameLogs` parses fine
> (required columns present) → the format-drift guard passes (rows still carry `receptions`,
> `receivingYards`) → `MIN_PLAYERGAME_ROWS` passes → **Σtargets = 0 → skip** → a season with
> arbitrarily corrupt air yards writes clean.

`MIN_PLAYERGAME_ROWS` guarantees ≥3,000 game rows spanning QB/RB/WR/TE. A zero target-sum across
that many rows is not an empty season — it is **definitionally column drift**. So:

```
if (sumTargets === 0) throw  // column drift: `targets` absent or renamed upstream
```

This is the one place the two validators should deliberately differ, and the difference must be
commented at both sites so neither is later "harmonised" with the other.

**All rows, not REG-only.** The two measures differ by ≤ 0.09 (§1.2) and both fit the band, so the
filter buys nothing — and an all-rows check keeps working if `seasonType` ever drifts, which a
REG-only filter would not. Record in a comment that REG-only was measured and gives the same verdict.

### 2.1 · What this slice deliberately does **not** add

**No `|airYardsShare| ≤ 1` bound.** §1.3 is the reason, and the existing
*"(airYardsShare may be negative — skip)"* comment should be **extended, not replaced**, to say why the
skip is now a considered decision rather than an omission — naming the five legitimate rows and the
net-air-yards mechanism. Otherwise the next reader sees advstats has the bound, gamelogs does not, and
"fixes" it.

---

## 3. Tests

In `test/nflverse.test.mjs`, beside the existing `validateGameLogs` tests, mirroring C2's pattern:

- synthetic season at ratio **3.93** → **throws**, message contains `3.93`
- synthetic at **8.42** → passes
- ratio exactly at `AY_PER_TARGET_MIN` and `AY_PER_TARGET_MAX` → both pass
- `Σtargets === 0` → **throws** (column-drift signal, §2) — *not* the advstats skip; and no NaN ever reaches a comparison
- **the real `nflverse/gamelogs/2016.json` passes** (it is fixed; **8.42** all-rows)

**And the one that locks in §2.1 — the regression test that matters most:**

> A synthetic season containing a row with `airYardsShare = 1.842` (D.J. Moore's real 2022 value)
> **passes**, with a comment naming §1.3.

Without it, a future slice adds the advstats bound in good faith and silently breaks re-ingest of
three seasons. That test is the only thing standing between this decision and its quiet reversal.

**Also verify against the real corrupt file:** reconstruct the pre-re-ingest 2016 with
`git show 957d27f:nflverse/gamelogs/2016.json`, run the validator against it, confirm it **throws**.
The fixture proves the logic; the real corrupt file proves the gate is aimed correctly. Do not commit
that file — read it through `git show` in the test, or verify by hand and record the result in the
commit message.

---

## 4. Step order

1. Extend `validateGameLogs` with the band check (§2); extend the `airYardsShare` skip comment (§2.1).
2. Add the tests (§3), including the `1.842` regression test.
3. **Verify against the real corrupt 2016** (`git show 957d27f:…`) — must throw at **3.93**. And
   against live 2016 (**8.42**) and 2023 (7.79) — must pass.
4. **Run the validator across all 14 served seasons** and confirm every one passes. The band was
   derived from exactly this data, so a failure means the accumulation is wrong, not the band.
5. `npm test` — baseline **570** plus the new cases. `npm run smoke` — its `gamelogs --year 2023`
   dry-run exercises the new gate on real data.
6. **`data-catalog.md`**: the gamelogs **Sparsity gate** row gains the band, matching how the advstats
   row records it (that row was moved there by `reingest-2016.md` §6 — follow the same placement).
7. **`CLAUDE.md` Navigation map** — its `lib/nflverse.mjs` row currently scopes the band by name:
   *"air-yards-per-target plausibility band for `validateAdvStats`"*. That becomes wrong the moment
   `validateGameLogs` shares it. CLAUDE.md → *Self-maintenance* requires the fix in the same change.
8. **Registry**: add `AY_PER_TARGET_MIN`/`MAX` to CR-07's `Triggers` and record `validateGameLogs` as
   their second consumer (§5). Mirrored region → **both repos, byte-identical, same change**; if the
   app-side half cannot land, revert the data-side half rather than shipping drift.
9. One commit per repo: `fix: air-yards plausibility gate for gamelogs (closes the C2 §11.1 gap)`.
   No data file, no manifest, no CDN purge.
10. `git pull --rebase origin main`, then push, in each repo. Then run the anchored drift check.

---

## 5. Cross-repo impact

**Two entries fire: CR-09 and CR-07.**

### CR-09 · nflverse gamelogs (view-only) — `Direction: both`

Fires because `validateGameLogs` in `lib/validate.mjs` is a named data-side trigger.

**Mirror (live `README.md`, CR-09, verbatim):**

> Shape or floor changes land in both repos together. The per-game `week` and `team` keys are load-bearing beyond display: `resolvePlayerTeam`'s week-grain path matches on `g.week === week` and reads `g.team`, and returns `null` rather than throwing — renaming either key empties every week-grain team join **silently**. Per-game `team` is the **current-franchise** domain in all seasons and is era-remapped app-side (CR-16); do not "fix" it to era-accurate upstream without changing both repos. Per-game rate fields (`racr`/`targetShare`/`airYardsShare`/`wopr`/`pacr`/`passingCpoe`) are single-game values and must never be summed — `passingCpoe` specifically is now also attempt-weighted by a second consumer (`seasonEfficiency.js`'s `CPOE` column), not merely "never summed". `fantasyPoints`/`fantasyPointsPpr` are nflverse default scoring and are never reconciled with `src/utils/fantasyPoints.js` (see CR-14). View-only on both sides — must never feed projection/scoring/grading. 2019 was backfilled on 2026-07-03 (5,756 rows across 586 players) and is no longer a gap; the family is complete 2012–2025.

**Mirror instruction to the app repo: no code change owed; one fact worth recording.** This adds an
**ingest-time** validation gate. No served shape, key, floor or value changes — `MIN_PLAYERGAME_ROWS`
is untouched and no existing file is rewritten, so nothing the app fetches moves by a byte.

The fact: **per-game `airYardsShare` legitimately exceeds 1** (§1.3, five rows across 2015/2022/2025,
max 1.842), because the per-game denominator is team *net* air yards. This Mirror already warns that
per-game rate fields "must never be summed"; the same reasoning explains why they must not be assumed
bounded either. Any app-side display or filter treating `airYardsShare` as a 0–1 fraction will
mis-render those rows.

### CR-07 · nflverse advstats (view-only) — `Direction: both`

Fires because this slice makes `AY_PER_TARGET_MIN`/`MAX` **shared across two families**.

**Citation corrected:** the previous slice landed those constants in CR-07's **`Data side`** field
only — its `Triggers` field does not name them. So the entry needs a *data-side* correction here, not
merely a mirror note: add the two constants to CR-07's `Triggers`, and record `validateGameLogs` as a
second live consumer of them. The registry's own format rule — *"a shared constant's definition is a
trigger in its own right"* — is what makes that owed.

**Mirror (live `README.md`, CR-07, verbatim):**

> Served-shape or sparsity-gate changes need the app loader updated in the same cycle. **Now breaks a visible surface, not just a silent loader** — Market's `RACR` column would go blank for every WR/TE with no error. Ratios are recomputed season-level and never aggregated weekly. Activation into projection is parked — see the advstats grading-findings doc.

**Mirror instruction to the app repo: no code change owed.** The band's *value* does not change and
neither does advstats' behaviour. What changes is its **scope**: after this slice, widening or
narrowing `[6, 11]` alters the ingest gate for **two** families, not one. That is a cache fact worth
carrying in CR-07 alongside the constants, so a future band change is not made on advstats' evidence
alone.

### CR-18 · Signal registry rows (`docs/signal-registry.md`) — `Direction: data→app`

Fires because **`data-catalog.md` is a named CR-18 data-side trigger** and §4 step 6 edits the
gamelogs **Sparsity gate** row. An earlier draft dismissed CR-18 on its `Invariant`'s substance
(coverage unchanged, no field reclassified) — but the Rule tests the `Triggers` field, and the sibling
slice fired CR-18 on exactly this artifact (`advstats-2016-gate.md` §8). Same artifact, same entry.

**Mirror (live `README.md`, CR-18, verbatim):**

> This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

**Mirror instruction to the app repo: no row edit is owed — verify, do not rewrite.** No season's
coverage moves, and no ingested field is added, removed or reclassified; the gamelogs row's coverage
cell (*"2012–2025, no gap"*) stays true. What changes is a **gate**, and the signal registry's rows do
not carry gates — `data-catalog.md` does, which is why §4 step 6 edits it there. Session 2 should
confirm the gamelogs row still reads accurately before recording the null.

**No other entry fires.** CR-02 is untouched (no season-totals surface); CR-11/CR-15 are untouched
(neither `lib/backtest.mjs` nor `lib/panel.mjs` is edited).

---

## 6. Done-definition

- [ ] `validateGameLogs` throws when Σ`receivingAirYards` ÷ Σ`targets` falls outside
      `[AY_PER_TARGET_MIN, AY_PER_TARGET_MAX]`, naming year and ratio
- [ ] **Throws** when `Σtargets === 0` — the advstats *skip* is deliberately inverted here, because
      `parsePlayerGameLogs` does not require the `targets` column while `aggregateAdvReceiving` does
      (§2). Commented at both validators so neither is later harmonised with the other
- [ ] **Reuses the existing constants** — no second band introduced, no new import needed
- [ ] **No `|airYardsShare|` bound added**; the existing skip comment extended to record §1.3's reason
- [ ] Tests: **3.93** throws · **8.42** passes · both band edges pass · `Σtargets === 0` **throws**
      (§2's inversion, not a skip) · real `gamelogs/2016.json` passes
- [ ] **The `1.842` regression test present** — a synthetic row at D.J. Moore's real 2022 value passes,
      commented with §1.3
- [ ] Real corrupt 2016 (`git show 957d27f:nflverse/gamelogs/2016.json`) verified to **throw**; result
      recorded in the commit message; that file **not** committed
- [ ] **All 14 served seasons pass** the new gate
- [ ] `npm test` green (baseline **570** + new); `npm run smoke` green
- [ ] `data-catalog.md` gamelogs **Sparsity gate** row records the band, matching advstats' placement
- [ ] **`CLAUDE.md` Navigation map no longer scopes the band to `validateAdvStats` alone**
- [ ] CR-07's `Triggers` gains the two constants and names `validateGameLogs` as a second consumer;
      landed in **both** repos; anchored drift check reports no output
- [ ] No data file, no `manifest.json`, no CDN purge
- [ ] `store-audit-2026-08-25.md` still modified-and-uncommitted, untouched

---

## 7. Settled decisions

- **Reuse `AY_PER_TARGET_MIN`/`MAX`** (§2) — same CSV, same quantity, both ranges inside [6, 11]. One
  definition, one thing to change.
- **All rows, not REG-only** (§2) — differ by ≤ 0.09, and all-rows survives a `seasonType` drift.
- **No `|airYardsShare| ≤ 1` bound** (§1.3, §2.1) — five legitimate rows exceed it; a hard throw would
  reject three seasons. The audit's "same fix, different family" is wrong on this half.
- **No share-count guard either** (§1.3) — 6 corrupt vs 0–3 healthy is too weak to threshold; the
  band separates the same case by more than 2×.
- **A regression test locks the omission in** (§3) — otherwise a later slice "completes" the mirror
  and breaks re-ingest silently.

---

## 8. Out-of-scope observations (not edits)

1. **The five `|airYardsShare| > 1` rows are worth a catalog note of their own.** `data-catalog.md`'s
   gamelogs **Null semantics** row says nothing about per-game rate fields being unbounded. That is a
   consumer-facing fact (CR-09's Mirror names `seasonEfficiency.js` as a live per-game rate consumer),
   but it is a documentation slice, not this one.
2. **The advstats/gamelogs grain mismatch (C1) is still open** — advstats `components` remain REG+POST
   while gamelogs carries `seasonType` per row. This slice's all-rows choice is deliberately neutral on
   it: the band fits either way, so nothing here pre-empts C1.
3. **CR-09's data-side anchors have drifted, and one points at the wrong function.**
   `validateGameLogs:503` is live at `:524`, and `:503` now falls inside `validateSchedule`
   (`:492`–`:520`) — the wrong-function failure mode again, on the exact function this slice edits.
   Same entry: `MIN_PLAYERGAME_ROWS:48` (live `:57`), `fetchPlayerStatsCsv:412` (live `:421`),
   `STATS_BASE:69` (live `:78`). Left alone deliberately — these are anchors, and the anchor policy
   belongs to the app repo as format owner (`registry-anchor-reconcile.md`). Recorded because this is
   now the second entry where a stale anchor resolves to plausible-but-wrong code.
4. **`validateTeamContext` and `validateSchedule` have no distributional checks either.** No known
   corruption in those families, so this is an observation rather than a queued item — but the pattern
   that produced this slice was "no distributional check anywhere until a family broke".

---

## 9. Review disposition (2026-08-30)

Six flags, all verified against live source, all accepted. One inverted a core mechanic.

| # | Flag | Call | Landed |
|---|---|---|---|
| 1 | `[edge-case]` the `Σtargets === 0` skip silently disables the gate on column drift | **Accepted — mechanic inverted** | §2 — throw, not skip |
| 2 | `[cross-repo]` CR-18 fires on `data-catalog.md` | **Accepted** | §5 |
| 3 | `[mechanical]` figures were REG-only while §2 chose all-rows | **Accepted** | §1.2 + every downstream figure |
| 4 | `[mechanical]` `CLAUDE.md` Navigation map scopes the band to `validateAdvStats` | **Accepted** | §4 step 7 |
| 5 | `[registry-stale]` CR-07's `Triggers` omits the band constants | **Accepted** | §4 step 8, §5 |
| 6 | `[registry-stale]` CR-09's `validateGameLogs:503` is live `:524`, and `:503` is inside `validateSchedule` | **Recorded, not fixed** | §8.4 |

**Flag 1 is the one that mattered, and the irony is worth stating.** This plan's headline finding is
*"same fix, different family — do not copy the advstats gate wholesale."* It then copied the advstats
`Σtargets === 0` **skip** wholesale. That skip is safe in advstats only because
`aggregateAdvReceiving` hard-throws when the `targets` column is missing; `parsePlayerGameLogs`
requires only `player_id`/`position`/`season`/`week`, so the precondition does not transfer. Copied
across, it would have reinstated the exact silent-pass this slice exists to close — a renamed
`targets` column would sail through the row floor, the drift guard, and then the gate itself. §2 now
throws, and the divergence is commented at both validators.

**Flag 3 would have produced a failing test on first run.** All-rows and REG-only differ by enough to
break an assertion: fixed 2016 is 8.42 vs 8.38, corrupt 2016 is 3.93 vs 3.90. The plan quoted REG-only
figures throughout while §2 chose all-rows, and the sibling test at `test/nflverse.test.mjs` asserts on
the ratio *string* (`/3\.96/`), so Session 2 would have copied `/3\.90/` and watched it fail.

**Flag 2 is the same CR-18 miss the C2 slice already made once.** `data-catalog.md` is a named trigger;
the Rule tests the `Triggers` field, not the `Invariant`'s subject matter. Dismissing it on substance
was the identical error, on the identical artifact, one slice later.
