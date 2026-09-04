# Complete `RATE_KEYS` — the `_lng` family (C4)

**Type:** one-line set extension + the guard's first tests. **No data, no manifest, no served shape,
no CDN purge.**
**Session model:** plan (opus, this file). Implementation is a separate sonnet session — do not edit
source here.
**Source:** C4 (`store-audit-2026-08-25.md`, queue row 8). Verified against live source and data
**2026-08-30** at HEAD `d28ff21`.

**Scope:** the audit's *"small and safe"* half only. The larger half — pruning the 25 non-additive
keys from served season-totals — stays deferred, with the reasoning restated in §5.

**Working-tree note.** `store-audit-2026-08-25.md` is modified and uncommitted. **Do not stage,
commit, revert or edit it.** Nothing here touches it.

---

## 1. Verified facts

### 1.1 · Eleven keys, not nine

The audit says `RATE_KEYS` *"misses all nine `*_lng` keys"*. The served archive carries **eleven**,
and all eleven are absent:

`def_kr_lng` · `def_pr_lng` · `fgm_lng` · `kr_lng` · `pass_lng` · `pass_td_lng` · `pr_lng` ·
`rec_lng` · `rec_td_lng` · `rush_lng` · `rush_td_lng`

The arithmetic closes: **25** non-additive keys on non-`TEAM_*` rows = **14** already in `RATE_KEYS`
+ **11** `_lng` uncovered. (`RATE_KEYS` holds 18; the other four — `down_3_pct`, `down_4_pct`,
`g2g_pct`, `rz_pct` — are guarded but do not appear on non-`TEAM_*` rows, which is why 18 − 14 = 4.)

### 1.2 · What `RATE_KEYS` actually does — and it is narrower than "excluded from scoring"

`calculateFantasyPoints` (`lib/fantasyPoints.mjs`) does **not** consult `RATE_KEYS` at all. It dots
every key in the scoring settings against `stats`.

The guard lives one level up, in `buildInBasisOutcomes` (`scripts/grade-snapshot.mjs`):

```js
const excludedRateKeys = Object.keys(scoringSettings)
  .filter(k => RATE_KEYS.has(k) && scoringSettings[k]);
const scoring = { ...scoringSettings };
for (const k of excludedRateKeys) delete scoring[k];
```

It **sanitises the league's scoring settings** before the dot product. So `RATE_KEYS` bites **only on
keys a league actually scores**. A key in the set that no league scores costs nothing and changes
nothing.

`excludedRateKeys` is also surfaced — `lib/grade.mjs` prints *"Excluded N non-additive rate key(s)…"*
in the grade report, and `scripts/panel-run.mjs` threads it into the per-year basis record.

### 1.3 · Zero behavioural change today

The live league scores **53** keys. Overlap with the 11 `_lng` keys: **none**. Overlap with all 25
non-additive keys: **none**.

So this extension is **inert on every current artifact** — no grade output moves, no panel basis
record changes, no report line appears. It is purely forward protection.

**And the forward case is real, not theoretical.** "Longest reception" bonuses are an ordinary fantasy
scoring option. If a league ever scores `rec_lng`, the grader would today multiply that league's
weight by a **sum of seventeen weekly longest-receptions** — a number with no meaning — and silently
fold it into the in-basis outcome the whole grading harness is measured against. The 11 are
non-additive in exactly the way the 18 already listed are; that, not today's league, is the
justification.

### 1.4 · The guard **is** already tested — an earlier draft claimed otherwise

`grep -rn RATE_KEYS test/` returns nothing, and an earlier draft concluded from that "no test coverage
at all… never been asserted". **False.** The tests assert the guard's *output*, not the set:

- `test/grade-routing.test.mjs` — `SCORING_V2` scores `rec_ypr: 2`; the test asserts
  `excludedRateKeys` deep-equals `['rec_ypr']` **and** that `p2.actualPPG === 12.0`, which is the
  value only reachable if `rec_ypr: 99` contributed **0**. That is the guard, end to end.
- `test/panel-integration.test.mjs` exercises the same on the panel path.
- `scripts/grade-snapshot.mjs`'s `--self-test` covers it again, and `npm run smoke` runs it.

**So this slice is narrower than an earlier draft claimed.** The guard's *mechanism* is covered; what
is uncovered is **which keys are in the set** — nothing asserts the `_lng` family belongs, and nothing
would notice a twelfth arriving. Tests 1, 2 and 4 (§3) are the real addition; test 3 is a `rec_lng`
re-parameterisation of coverage that already exists, worth keeping as a pin on the new keys but not
as this slice's justification.

---

## 2. The change

Add the eleven `_lng` keys to `RATE_KEYS` (`lib/fantasyPoints.mjs`).

**Explicit list, not a suffix match.** The set is an explicit list today and should stay one —
greppable, diffable, and it cannot silently swallow a future key that merely happens to end in `_lng`
but *is* additive. Add a comment recording that the `_lng` family is the selection criterion, so a
twelfth key is recognised as belonging rather than debated.

**Keep the existing 18 untouched and the ordering alphabetical**, matching current style.

**No other code changes.** `buildInBasisOutcomes` already does the filtering; nothing about the
mechanism moves.

---

## 3. Tests — pinning the set, not the mechanism

New tests in `test/fantasyPoints.test.mjs` (the file exists; `RATE_KEYS` is absent from it).

1. **All eleven `_lng` keys are in `RATE_KEYS`** — the direct assertion.
2. **The pre-existing 18 are still present** — guards against an accidental replacement rather than
   an extension. Assert the full 29-key set, so either direction of drift fails.
3. **The mechanism, re-parameterised onto a new key**: call `buildInBasisOutcomes` with a synthetic
   `scoringSettings` that scores `rec_lng` at a non-zero weight, and assert (a) the key appears in
   `excludedRateKeys`, and (b) it contributes **0** to the outcome. **This duplicates coverage that
   already exists** for `rec_ypr` (§1.4) — keep it, because it pins one of the *new* keys to the
   behaviour rather than only to the set, but do not present it as the guard's first behavioural test.
4. **Recurrence guard — the served archive's `_lng` set is fully covered.** Scan
   `nfl/season-totals/*.json` for every key ending `_lng` and assert each is in `RATE_KEYS`. Red
   exactly when upstream introduces a twelfth — a registry-worthy event nothing would catch today.

   **Scan ALL rows, including `TEAM_*`.** `buildInBasisOutcomes` has **no entity filter** — it
   iterates every row in the file, `TEAM_*` included, so a `TEAM_*`-only `_lng` key would be scored
   and a non-`TEAM_*` scan would not see it. (Today `TEAM_*` carries 9 of the 11, with `def_kr_lng`
   and `def_pr_lng` non-`TEAM_*`-only, so a filtered scan is adequate only by coincidence.)

   **Guard against passing vacuously.** A glob that matches zero files must not report green while
   asserting nothing. Follow the repo's precedent for reading the real archive from a test —
   `test/panel-integration.test.mjs` uses an explicit `t.skip(…)` when the file is absent (sparse
   checkout) — or assert a floor on files scanned.

**Do not add a test asserting the league's scoring settings lack `_lng` keys.** That is a fact about
one league at one moment, not a property of this repo, and it would red on any league change.

---

## 4. Step order

1. **Write tests 1, 2 and 4 FIRST and watch them fail** against the un-extended set. They are the
   real addition (§1.4), and a test written after the fix cannot demonstrate it was ever red.
   An earlier draft had the extension as step 1, which made §7's "observed failing before the fix"
   unachievable without reverting.
2. Extend `RATE_KEYS` with the eleven keys + the selection-criterion comment (§2); confirm 1/2/4 go
   green. Then add test 3 (§3) — it duplicates existing coverage, so it will pass immediately.
3. `npm test` — baseline **576** plus the new cases.
4. `npm run smoke` — includes `grade --self-test`, which exercises `buildInBasisOutcomes`. Expect
   green and **unchanged output**: §1.3 establishes no current league key is affected, so any
   observable difference means the filter is catching something it should not.
5. **`CLAUDE.md`** — the Navigation map's `lib/fantasyPoints.mjs` row names `RATE_KEYS`; confirm its
   description still reads accurately with 29 keys and correct it if it quotes a count or scope.
6. One commit: `fix: complete RATE_KEYS with the 11 _lng keys + first tests for the guard (C4)`.
   No data file, no manifest, no CDN purge.
7. `git pull --rebase origin main`, then push.

---

## 5. The prune stays deferred — restated, not re-decided

The audit's larger move is dropping the 25 non-additive keys from served season-totals, on the F-24
precedent. **Still the right call, still not now.**

**It clears F-24's bar on the data side, which is the half this repo can establish.** Zero reads of
any `_lng` key in `lib/`, `scripts/` or `bin/` outside comments — verified archive-wide.

**The app-side half is recorded as app-verified, not asserted here.** An earlier draft cited
`nflStats.js`, `efficiencyMetrics.js` and `columnDescriptors.js` by name and quoted their contents.
Those readings were made against the sibling tree during C4's original investigation, but **the
registry is the only app-side authority available at review time**, and `columnDescriptors.js` appears
in no `CR-NN` entry at all — so a reviewer cannot confirm any of it. Whoever plans the prune must
re-establish the app-side position through the registry, or take it to the app repo. Do not let this
plan's recollection stand as the evidence. None of the 25 collides with CR-11/13/19/20's **trigger** keys.

**But CR-12 constrains it, and quoting that Mirror verbatim is what surfaced this.** CR-12's own text
says: *"Stored `pass_rtg` and `cmp_pct` are weekly sums, are **not** consumed by the app (both
surfaces recompute from counting stats), and **must be preserved as-is rather than 'fixed'**."*
`pass_rtg` and `cmp_pct` **are two of the 25**. So the prune is not a free 25 — it is at most 23, and
a registry entry explicitly forbids the other two. Whoever plans it must either honour that or amend
CR-12 in both repos as part of the same change. An earlier draft of this plan asserted the opposite,
from a paraphrase.

**Why it waits:** pruning rewrites every completed season under Invariant 1 and bumps
`schemaVersion` 4→5. Doing it standalone pays a full historical rewrite and CDN purge for keys that
cost 0.20 MB/season. Riding the next season-totals schemaVersion bump pays that once instead of twice.

**One wrinkle to carry forward when it happens:** those app tooltips *name the keys*. Pruning makes
user-visible text refer to keys that no longer exist — not breaking, but a documentation-sync item
that belongs in the same change.

---

## 6. Cross-repo impact

**Five entries fire: CR-11, CR-12, CR-13, CR-14 and CR-19.** All five name `lib/fantasyPoints.mjs` in
their data-side `Triggers`; four also name `RATE_KEYS` directly. (CR-20 names neither and does not
fire.)

**One instruction covers all five, because they say the same thing:** `RATE_KEYS` is a **data-side-only
defensive guard with no app counterpart**, and extending it changes no served byte, no stat key, and
no app-visible behaviour. CR-14's `Mirror` states the rule explicitly and it governs the other four:
the set *"has no app counterpart and must not be 'mirrored back' into the app."* **So the app-side
deliverable here is: do nothing, deliberately.**

### CR-11 · Snap & red-zone usage stat keys

> Do not remove, rename or filter these keys. **The projection degrades silently to neutral when they are absent** — no error, no test failure, no visible symptom. The blast radius is wider than the projection: `durabilitySignals` mis-classifies contributor seasons, `teamContext`'s RZ denominators go to zero (so `teamRzShare` sentinels out), the Outlook snap% column empties, and — since dp-v2 Slice 5b — Market's Efficiency `SNAP%`/`RZ SH` columns go blank the same way, and the data repo's own panel/backtest reconstructions drift the same way. The dependency is invisible at runtime; this registry entry is the only thing recording it.

**None of CR-11's five keys is in the 25**, so the added filter cannot reach them — verified.

### CR-12 · `pass_cmp` stat key (QB passer rating)

> Preserve `pass_cmp`. Missing `pass_cmp` yields a neutral `efficiencyFactor` (1.0) **and** a null `Cmp%` cell in the NFL-stats table — silent in both, no errors, no schema bump. Stored `pass_rtg` and `cmp_pct` are weekly sums, are **not** consumed by the app (both surfaces recompute from counting stats), and must be preserved as-is rather than "fixed".

`pass_cmp` is **not** in the 25 and is not affected. **But note what this Mirror says about two keys
that *are*:** *"Stored `pass_rtg` and `cmp_pct` are weekly sums, are **not** consumed by the app …
and must be preserved as-is rather than 'fixed'."* That is a constraint on the **prune** (§5), not on
this slice — adding a key to `RATE_KEYS` removes nothing from served data. Carry it into whichever
slice eventually prunes: CR-12 explicitly requires two of the 25 to stay served.

### CR-13 · `rec_air_yd` stat key (aDOT diagnostic)

> Preserve `rec_air_yd`. Missing → `factors.adot: null` **and** empty AY-share / aDOT cells on the Outlook tab; no errors, no schema bump. Values run ~½ industry aDOT magnitude (likely air yards on completed receptions only) — ranking is preserved, absolute magnitude is not industry-standard; that calibration is the app's concern, not the data repo's. `factors.adot` is capture-only and must not move `projectedPPG`.

`rec_air_yd` is **not** in the 25 and is not affected.

### CR-14 · `calculateFantasyPoints` port — **the governing entry**

> Any change to the scoring math must be ported to `lib/fantasyPoints.mjs` in the same cycle, or in-basis grades silently diverge from how the app actually scored — **and so does the R3-FIT panel** (CR-15), which builds its outcome column from the same port. **Nothing app-side fails when this drifts** — the divergence appears only as wrong grades and a wrong fit. Low churn (the dot-product is stable), which is exactly why the drift would go unnoticed. Note one deliberate asymmetry: `RATE_KEYS` (`lib/fantasyPoints.mjs:21`) is a data-side-only defensive guard excluding non-additive keys from the dot-product; it has **no app counterpart** and must not be "mirrored back" into the app.

**This is the entry that settles the whole section.** The change is to `RATE_KEYS`, which this Mirror
names as the deliberate data-side-only asymmetry. **The scoring math is untouched** —
`calculateFantasyPoints` is not edited, so the port stays in sync and neither in-basis grading nor the
R3-FIT panel diverges.

### CR-19 · Market Efficiency stat keys

> Do not remove, rename or filter `pass_sack`, `pass_air_yd`, `rush_yac`, `rush_btkl` or `rec_drop`. They drive five columns of Market's Efficiency set plus the Outlook `sacks` metric, and **nothing in either repo fails when they vanish** — no error, no test failure. `rush_yac`, `rush_btkl` and `rec_drop` degrade to `—`, which reads as "this player has no data" rather than "the pipeline broke." `pass_sack` and `pass_air_yd` were worse until this entry was written: their call sites divided by a denominator that survives the key's absence, so a missing key rendered a confident **`0.0`** rather than blanking. Both were hardened in the same change; the hazard is recorded because the *shape* invites the identical bug in any future consumer that divides by a surviving denominator. These keys are **view-only** — unlike CR-11/12/13 they never touch `projectedPPG`, the dynasty score or any `factors` entry, so changes need no graded gate; the cost of losing them is silent display corruption, not silent scoring drift.

**None of CR-19's five keys is in the 25** — verified. The added filter cannot reach them.

---

## 7. Done-definition

- [ ] All **eleven** `_lng` keys added to `RATE_KEYS`; the pre-existing 18 unchanged; set size **29**
- [ ] Selection-criterion comment added (the `_lng` family), so a twelfth key is recognised
- [ ] `calculateFantasyPoints` **not** edited — the CR-14 port stays byte-identical
- [ ] **Tests 1, 2 and 4 observed failing** against the un-extended set before the fix (test 3
      duplicates existing coverage and will pass immediately — §1.4)
- [ ] Four tests present: eleven-covered · full 29-key set · `rec_lng` scored → excluded **and
      contributes 0** · archive `_lng` scan fully covered by `RATE_KEYS`
- [ ] **Test 4 scans ALL rows including `TEAM_*`** (no entity filter in `buildInBasisOutcomes`) and
      **cannot pass vacuously** — explicit skip or a floor on files scanned
- [ ] **No test asserts the live league's scoring settings** (§3)
- [ ] `npm test` green (baseline **576** + new); `npm run smoke` green with **unchanged** output
- [ ] `CLAUDE.md` Navigation map's `lib/fantasyPoints.mjs` row still accurate at 29 keys
- [ ] No data file, no `manifest.json`, no CDN purge, no served-shape change
- [ ] `store-audit-2026-08-25.md` still modified-and-uncommitted, untouched

---

## 8. Settled decisions

- **Eleven, not the audit's nine** (§1.1) — verified archive-wide; the arithmetic closes at 25 = 14 + 11.
- **Explicit list, not a suffix match** (§2) — consistent with the existing set, and it cannot swallow
  a future additive key that happens to end `_lng`.
- **Tests 1/2/4 are the addition; test 3 is a pin, not the point** (§1.4, §3) — the mechanism is
  already covered by `grade-routing`/`panel-integration`/`--self-test`. What is uncovered is *which
  keys are in the set*.
- **No assertion about the live league's scoring** (§3) — a fact about one league at one moment.
- **The prune stays deferred to the next schemaVersion bump** (§5) — it clears F-24's bar, but doing
  it standalone pays a historical rewrite twice.
- **One mirror instruction for five entries** (§6) — they say the same thing, and CR-14's Mirror
  states the rule that governs the rest.

---

## 9. Out-of-scope observations (not edits)

1. **`down_3_pct`, `down_4_pct`, `g2g_pct` and `rz_pct` are live protection, not dead entries.** An
   earlier draft called them "a guard for keys that are not there". They **are** served — on
   `TEAM_*` rows — and `buildInBasisOutcomes` scores `TEAM_*` rows (no entity filter), so a league
   scoring any of them would hit exactly the corruption `RATE_KEYS` exists to stop. The conclusion an
   earlier draft reached (do not "tidy" them away) was right; its stated reason was backwards.
2. **`excludedRateKeys` threads into `scripts/panel-run.mjs`'s per-year basis record**, not just the
   grade report. If the prune ever lands, that field goes permanently empty and the panel's basis
   provenance loses a signal it currently carries.
3. **Four of the five firing entries cite a stale writer anchor.** CR-11, CR-12, CR-13 and CR-19 all
   name *"the writer `scripts/update-nfl.mjs:93`"* in their data-side `Triggers`; live `:93` is
   `d.setManifestInProgress(...)` — the prior-season sealing guard — and the actual writer is
   `d.writeJsonStable(dataPath, totals, { minify: true })` further down. CR-20 carries the same stale
   anchor without firing here. That is **four more instances** of an anchor resolving to
   plausible-but-wrong code, on top of CR-09's `validateGameLogs:503` landing inside
   `validateSchedule`. Anchor policy — the app repo owns the format definition.
4. **CR-14 omits the third live consumer of `excludedRateKeys`.** Its data side enumerates
   `buildInBasisOutcomes`'s chain through `scripts/grade-snapshot.mjs` and `scripts/panel-run.mjs`,
   but not `lib/grade.mjs`, which renders the guard's **only user-visible surface** — *"Excluded N
   non-additive rate key(s)…"* in the grade report. `lib/grade.mjs` is a CR-02 trigger for the
   snapshot envelope, not a CR-14 trigger for this shape. A cache addition for whichever slice next
   opens CR-14.
5. **CR-09's stale anchors are still uncorrected** (`validateGameLogs:503` resolves inside
   `validateSchedule`) — same anchor policy.

---

## 10. Review disposition (2026-08-30)

Eight flags, all verified against live source, all accepted. One deflated the slice's stated value;
two corrected claims that were backwards.

| # | Flag | Call | Landed |
|---|---|---|---|
| 1 | `[mechanical]` the guard IS already behaviourally tested | **Accepted — framing corrected** | §1.4, §3 |
| 2 | `[ordering]` extension sequenced before the failing test | **Accepted** | §4 steps 1–2 |
| 3 | `[edge-case]` test 4 must scan `TEAM_*` rows too | **Accepted** | §3 item 4 |
| 4 | `[edge-case]` test 4 could pass vacuously | **Accepted** | §3 item 4 |
| 5 | `[mechanical]` §9.1's reason was backwards | **Accepted** | §9.1 |
| 6 | `[cross-repo]` app-side prune evidence exceeds registry authority | **Accepted** | §5 |
| 7 | `[registry-stale]` four firing entries cite a stale writer anchor | **Recorded** | §9.3 |
| 8 | `[registry-stale]` CR-14 omits `lib/grade.mjs` as an `excludedRateKeys` consumer | **Recorded** | §9.4 |

**Flag 1 is the one that changes what this slice is.** An earlier draft claimed `RATE_KEYS` had *"no
test coverage at all"* on the strength of `grep -rn RATE_KEYS test/` returning nothing. The tests
assert the guard's **output** — `test/grade-routing.test.mjs` scores `rec_ypr: 2`, asserts
`excludedRateKeys` deep-equals `['rec_ypr']`, and pins `p2.actualPPG === 12.0`, a value reachable only
if the key contributed 0. That is the mechanism, end to end. So the slice's real contribution is
narrower and more honest: **the mechanism is covered; the set's membership is not.** Tests 1, 2 and 4
are the addition.

**Flags 3 and 5 both trace to one missed fact:** `buildInBasisOutcomes` iterates **every** row
including `TEAM_*`, with no entity filter. That makes a `TEAM_*`-only `_lng` key scoreable (so test 4
must scan all rows), and it makes `down_3_pct`/`down_4_pct`/`g2g_pct`/`rz_pct` live protection rather
than the dead entries §9.1 called them — they are served on `TEAM_*` rows.

**A hypothesis worth recording:** `TEAM_*` rows carry **9** of the 11 `_lng` keys (`def_kr_lng` and
`def_pr_lng` are non-`TEAM_*`-only). That is very likely the source of the audit's "nine" — the count
this plan corrects to eleven. Not asserted, but it fits exactly.
