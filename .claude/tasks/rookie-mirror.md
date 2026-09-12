# Rookie-mirror hygiene — reproduce the three shipped rookie mechanisms in the harness

**Type:** CR-15 rookie-half mirror + one re-fit-trap extension + one provenance re-derivation + two
records. **No data file, no manifest entry, no served family, no CDN purge, no scoring path.**
**Capture-only invariant holds:** nothing here feeds projection or scoring; every artifact this slice
writes or reads is unregistered analysis output or a test fixture.
**Session model:** plan (opus, this file) → `plan-reviewer` → implementation (sonnet, separate
session, must not edit app source) → `implementation-reviewer` on the diff.
**Branch + PR** (`smoke-test.yml` is PR-triggered and this touches `lib/`, `scripts/`, `bin/`).
**Source:** `analysis/ranking-and-projection-review-2026-09-04.md` §9.3 item 2 and §9.4's closing
paragraph; backlog items D-14, D-15, D-10 and the residue of D-6.

> **The stake, in the review's own words.** A harness that cannot reproduce the app cannot grade it —
> the same failure mode that produced the D6 stop. The app has shipped three rookie mechanisms
> (`41f277e`, `ed027c7`, `f07d9be`); this repo reproduces none of them.

---

## 0. Corrections to the brief, verified against live source

Five things I checked came out differently from the framing I was handed. Each changes what gets
built or when.

**C1 · The first snapshot carrying all three mechanisms is `2026-09-12`, not `2026-09-13` — and it
does not exist yet.** App `41f277e` was committed `2026-09-12 09:23 UTC`; `daily-snapshot.yml:9`
crons at `29 16 * * *` with `app_ref` defaulting to `main` (`:18`). Today's capture, roughly 16:30
UTC on 2026-09-12, is therefore the first. The newest snapshot on `origin/main` is `2026-09-11`
(`ced227d`), captured before the app commit. **This is a hard sequencing constraint on Session 2** —
see §4.4.

**C2 · `snapshots/2026-09-10.json` carries slice 1 only.** Verified by reading a rookie row: it has
`rookieCalibrationBasis` and `draftCapitalStatus`, has no `rookieGamesBasis` and no
`rookieCeilingBasis`, and reports `projectedGames: 14` — the flat pre-slice-2 default. It is useless
as a three-mechanism parity fixture and must not be substituted for one.

**C3 · D-11 has no separable data half, so it is out entirely — not half-landed.** The brief's read
was that "only its data half can land here." It cannot. D-11's content lives wholly inside the
byte-identical mirrored span (`README.md:1505`–`1748`), which the drift check diffs as one span. That
span has no per-repo halves: the `App side` and `Data side` *fields* are both inside the same mirrored
bytes, so editing either requires the same edit in `sleeper-dashboard/docs/cross-repo-registry.md`
in the same change. A repo-scoped session cannot do that, and a one-sided edit is exactly what the
drift check reports. **The same constraint lands on this slice's own CR-15 amendment** — §9.

**C4 · D-6 is already discharged except for one fixture.** Verified: `README.md:258`/`:265`/`:310`
document the v3 envelope and all six `inputStatus` labels; `data-catalog.md:79`–`80` is at
`schemaVersion: 3` with the commit gate's floors written out; `scripts/register-snapshots.mjs` never
gates on the value (it type-checks at `:65` and passes it through at `:92`); neither
`scripts/grade-snapshot.mjs` nor `lib/panel.mjs` reads it at all. D-6's hint was right on every
point. **The single open item is the v3 fixture** — `test/fixtures/` holds `grade-snapshot.json`
(v1) and `grade-snapshot-v2.json` (v2), and no v3. §1 folds that one item in and strikes the rest
with this evidence.

**C5 · The eight `ROOKIE_CEILING` numbers already re-derive exactly from this repo's own panel.** I
ran the app's quantile convention over `backtests/2026-09-11-rookie-panel.json` `debut.rows`, gated
at `outcomeGames >= 8`:

| position | n | p90 (knee) | p99 (asymptote) |
|---|---|---|---|
| QB | 50 | 17.80 | 21.90 |
| RB | 281 | 12.11 | 16.87 |
| WR | 366 | 9.87 | 14.38 |
| TE | 176 | 6.21 | 11.60 |

All four n, all eight quantiles, and the 873 gated total match the shipped constants and the review's
figures. So D-14's tolerance is **exact equality**, settled empirically rather than chosen — and its
independence is implementation-only, not data-independence. §5.

**Confirmed by plan-reviewer.** All five corrections above held; C5's eight quantiles were
re-derived independently; the CR-15 Mirror quote in §9.1 is byte-identical to
`README.md:1505`–`1748`; `§G` is a free verdict-section letter (`§A`–`§F` are occupied at
`scripts/panel-run.mjs:1956`–`:2076`); the snapshot player block is exactly
`{ nfl_team, status, depthChartOrder, ktc, projection }`, so §4.3's premise holds; and §6.6's
`≤2026-09-08 none` boundary is confirmed too, not only C2's `2026-09-09`–`2026-09-10` row. The suite
stood at 897 passing.

---

## 1. Scope boundary

Five items were named as candidates. Four land, one does not, and one of the four lands narrowed.

### 1.1 · In scope

**The mirror itself (CR-15's rookie half).** The whole point of the slice. Reproduces
`ROOKIE_CALIBRATION` + `resolveRookieCalibration`, the five `ROOKIE_GAMES_*` tables +
`resolveRookieGames`, `ROOKIE_CEILING` + `applyRookieCeiling`, and `rookieProjection`'s ordering.
§2 decides where it lives; §3 keeps it out of the fit path; §4 proves it against a real snapshot.

**D-14 — the ceiling quantiles in a verdict.** In. Not because it is cheap but because it produces
the *provenance* of eight of the numbers the mirror must hold, from this repo's own committed panel,
and because `runRookiePanels`'s existing `availability` block is an exact structural precedent
(observed / expected / delta against the app's fitted cells, reported and not asserted). Same files,
same verdict builder, one new section. §5.

**D-15 — `grading/anchor-policy.md`.** In. §9.3 item 2 puts it in this hygiene slice, and the mirror
is what makes it actionable rather than aspirational: once the harness reproduces all three
mechanisms it can also reproduce the *wrong version* of them against a snapshot captured before a
boundary, which is a silent wrong grade. The policy is the rule that says which captured rows are
comparable. Three model-change dates now, not two (D-15's own correction), and the review's
`anchor-policy.md` reference is a **different file** from `.claude/tasks/anchor-policy.md`, which is
the registry line-anchor policy — §6.6 disambiguates both in prose so nobody conflates them again.

**D-10 — record the `bySleeper.undrafted` dependency.** In. Two corrections to the original
justification. `resolveDraftGroup` (`lib/panel.mjs:1909`) already branches on
`draftInfo?.undrafted === true`, so this slice is **not** the first data-side consumer of the flag.
And the mirror as specified does not depend on the flag at all: §6.1 deliberately does not port
`resolveDraftCapitalStatus`, taking `draftCapitalStatus` as a parameter, and the app derives
`'undrafted'` from `nflDraftMatchSource` plus `nflDraftYears` membership — never from
`bySleeper.undrafted`. The surviving argument for keeping it in scope: the app's shipped constants
(undrafted: QB 0.67 · RB 0.33 · WR 0.36 · TE 0.28) were **fitted** on a panel whose `draftGroup` came
from that flag, so a change to the derivation invalidates the constants even though no code in
either repo reads the flag on the live path. It goes in `data-catalog.md`'s crosswalk row as that
record. It does **not** go in the mirror module's docstring as a dependency — only the never-join
warning belongs there (`bySleeper.draftPick` is within-round, `draft_picks.json`'s `pick` is
overall), since that one is genuinely about panel joins.

**D-6, narrowed to one fixture.** In. Per C4 the only thing D-6 still owes is a committed v3 snapshot
fixture. The parity fixture (§4.4) cannot double as it — the grader's self-test needs
`scoringSettings` for `buildInBasisOutcomes` and asserts hardcoded expected grades, and the
registrar is not exercised by the grading self-test at all — so D-6's residue is a **second,
full-envelope fixture**, `test/fixtures/grade-snapshot-v3.json` (§6.14), wired into the grader's
self-test alongside `grade-snapshot-v2.json`. The justification is not that it comes free: the
marginal cost is a second fixture plus one self-test read. It is that D-6's residue is one fixture of
a family this slice is already reading and slimming, so the context is loaded and the cost is small.
**Strictly bounded to:** two fixtures, one self-test read, one registrar-acceptance assertion, and
striking D-6's other four bullets in the backlog with C4's evidence. Explicitly **not** a
snapshot-schema sweep, a v4 design, or any `inputStatus` consumer work.

### 1.2 · Out of scope, with reasons

**D-11 — excluded whole.** See C3. There is no half of it this session can land.

**D-16 — excluded.** The backlog defers it to season end by name, and it is the one item that would
give D-14 genuine out-of-sample data. Nothing here pulls it forward.

**D-9, D-12, D-13 — excluded, named so nobody folds them in.** D-9 widens drop coverage, D-12 and
D-13 build new panels. All three are adjacent to the rookie panel this slice reads and none is on the
critical path to reproducing the app.

**`docs/projection.md`'s 18 % residual line — excluded, app file.** §9.3 item 2's fourth sub-item.
Unreachable from here; emitted as owed in §9.3.

**The CR-15 registry amendment itself — cannot land here.** §9.2. Emitted as text, not applied.

### 1.3 · The sprawl guard

This slice touches exactly fourteen files (§6). If implementation finds a fifteenth, it stops and
asks rather than widening — the backlog is the place for what it found.

---

## 2. Where the mirror lives → **a new module, `lib/rookieMirror.mjs`**

CR-15's `Data side` names `lib/projectionFactors.mjs`. I am putting the mirror somewhere else, and
the first reason is decisive on its own.

**(a) The import-graph test is impossible unless the mirror is a separate module.** `lib/panel.mjs:22`
already imports `reconstructRookieProjection` from `lib/projectionFactors.mjs`. That module is
therefore *inside* the fit path's import closure today. Put the corrected constants there and "the
fitting path can import them" becomes true by construction, and the negative statement §3 is asked
to assert becomes unassertable. One import edge decides the file layout.

**(b) The shapes do not match.** `lib/projectionFactors.mjs` is a registry of factor reconstructors —
thirteen entries in `FACTOR_RECONSTRUCTORS`, each a `factor → number` under one of four `kind`s
(`bucket` / `cohort` / `external` / `derived`), consumed uniformly by `attachFactorMultipliers`. The
rookie mirror is not a factor. It is a whole projection: baseline × four multipliers →
`[0.45, 1.85]` product clamp → a calibration multiplier applied *outside* that clamp →
`clamp(…, 0, 40)` on the resulting level → a ceiling on the finished level → a five-rung games
ladder → total points. Two of its four multipliers are structurally neutral in this repo. It cannot enter `FACTOR_RECONSTRUCTORS` and would sit in that file as an unrelated second
concern with its own five constant tables.

**(c) It keeps the reserved name's promise while moving it where the guard can see it.**
`reconstructShippedRookieProjection` currently exists only as a name in
`lib/projectionFactors.mjs`'s deviation comment (`:706`–`:729`), with **no file named**. Moving the
reserved name into `lib/rookieMirror.mjs` and pointing that comment at the file is strictly more
information than the comment carries today.

**Direction of the one import edge matters and is part of the design.** `lib/rookieMirror.mjs`
imports `lib/projectionFactors.mjs`, because `reconstructShippedRookieProjection` must *compose*
`reconstructRookieProjection` rather than copy the uncorrected stack. That edge points
mirror → factors and never the reverse, which is exactly what makes the closure assertion in §3.3
both true and meaningful. §3.3 asserts the edge exists, so a future copy-paste is caught too.

**The cost, stated rather than buried.** CR-15's `Data side` and `Triggers` do not name
`lib/rookieMirror.mjs`, and per C3 this session cannot add it. Until a both-repos session lands the
amendment in §9.2, CR-15's trigger list is knowingly incomplete: a future edit to the mirror will not
fire CR-15 by grep. `test/registry.test.mjs` does not red on this — it asserts every *named* symbol
resolves, never that every source symbol is named — so nothing fails, which is precisely why the
amendment has to be written down as owed rather than left to be noticed. An incomplete registry that
is recorded as incomplete is a smaller defect than a fit path one import from its own corrections.

---

## 3. The re-fit trap — how the existing guard extends to three mechanisms

**The trap, restated precisely.** Today `reconstructShippedRookieProjection` is an empty reserved
name the fitting path cannot reach, so the guard has nothing to catch. The moment the mirror lands the
corrected constants become importable, and a fit that reaches them re-fits on already-corrected
predictions: every subsequent ratio, MAE and verdict is circular, and **nothing fails**. That last
clause is the whole problem — this is a silent-wrong-answer failure, the class §9.4 and the D6 stop
both name.

**What the guard covers today.** `assembleRookiePanel` (`lib/panel.mjs:2053`–`2067`), per row,
immediately after the predictor call: `proj.appliedCorrections` must be an array (missing throws) and
must be empty (non-empty throws). Unconditional, no opt-out. Tested both arms plus the real
predictor's declaration (`test/panel-fit.test.mjs:2418`–`2459`).

**What three mechanisms change.** The guard sits at *one seam* — the predictor's return. Two of the
three new mechanisms do not naturally live there: the games ladder produces `projectedGames`, and the
ceiling rewrites `projectedPPG` after the clamp. A corrected predictor that returns all of them is
caught by the existing check **provided it declares**. The hole the mirror opens is a *caller* that
applies a correction after assembly — `runRookiePanels`, or a new mode, multiplying `panel.rows`'
`projectedPPG` by a calibration cell, or overwriting a games column — without ever touching the
predictor. The guard sees nothing.

Four extensions, and an honest scope statement about what they close. (3.1) and (3.3) close the
**import seam** and the **declaration seam**; (3.2) is provenance, not a third seam closed; (3.4) is
the assertion that has to be deleted for the trap to spring. **The inlining seam is not closed**, and
nothing short of a constant-scan would close it: an inlined literal `0.33` in
`scripts/panel-run.mjs` passes the import check (3.3), the declaration check (3.1), and the real
predictor's own guard (3.4) untouched, because it never calls the predictor at all.

**Residual hole.** The one real backstop: `§A`'s reproduction pin and D-14's `ceiling` block both
move if a caller silently corrects rows, so the pin is what would catch it — after the fact, in a
verdict a human reads, not in CI.

### 3.1 · A three-token vocabulary, and the guard's message names all three

In `lib/rookieMirror.mjs`:

```js
export const ROOKIE_CORRECTIONS = Object.freeze(['rookieCalibration', 'rookieGames', 'rookieCeiling']);
```

`reconstructShippedRookieProjection` returns `appliedCorrections` listing exactly the mechanisms it
applied, frozen. **The guard's logic does not change** — it already refuses any non-empty
declaration, which is the design working as built. What changes is the two error messages in
`lib/panel.mjs`: they currently say the mirror "belongs in `reconstructShippedRookieProjection`" and
name no file and no mechanism. They gain the module path and the three token names, so the throw is
self-documenting to whoever hits it.

The three token strings therefore exist twice, deliberately. `ROOKIE_CORRECTIONS` in
`lib/rookieMirror.mjs` is the **authoritative copy**; `lib/panel.mjs` carries them as literals in
its two error messages with a comment saying why it cannot import them. A sonnet session that
imports `ROOKIE_CORRECTIONS` into `lib/panel.mjs` will red T-RM1 — that is the test working, and
the fix is the literal, not an exemption.

### 3.2 · Stamp the panel — provenance, not a second guard

`assembleRookiePanel` records the declaration it has already validated onto the assembly:
`coverage.predictorCorrections = [...proj.appliedCorrections]` (empty, by the time the per-row guard
has passed). **This is not a guard and does not add reach.** `runRookiePanels` has no assembler seam
to stub, and the per-row throw described above already fires before the stamp is ever written, so no
assertion on the stamp could ever catch anything that the per-row guard did not already catch — it
reads the same fact from the same source. The plan previously overstated this as defence-in-depth;
it is not. Its value is narrower and real: it puts the fact into the **committed artifact**, so a
human reading a written panel JSON can see `predictorCorrections: []` without re-deriving it. No
assertion anywhere checks that it is empty.

### 3.3 · The import-graph test — the fitting path must not be able to reach the mirror

Static, no module execution, no bundler. In `test/rookie-mirror.test.mjs`:

- **Entry points:** `bin/panel.mjs`, `scripts/panel-run.mjs`, `lib/panel.mjs`, `lib/backtest.mjs`,
  `lib/projectionFactors.mjs`.
- **Walk:** for each file, extract relative specifiers from `import … from '…'`, `export … from '…'`
  and dynamic `import('…')`; resolve against the file's directory; recurse. Ignore bare specifiers
  and `node:` builtins.
- **Assert 1 (the point):** `lib/rookieMirror.mjs` is **not** in the transitive closure.
- **Assert 2 (anti-vacuity, traversal-only):** seed a second walk from **`bin/panel.mjs` alone** and
  assert its closure contains `scripts/panel-run.mjs`, `lib/panel.mjs` (both direct,
  `bin/panel.mjs:51`–`:52`), `lib/projectionFactors.mjs`, `lib/backtest.mjs`, `lib/io.mjs` and
  `scripts/grade-snapshot.mjs` (all transitive). The last four are reachable only by traversal, so a
  walker whose regex matched nothing fails this assertion. Assert 1 (mirror absent) runs against the
  full five-seed closure. Seeding `lib/projectionFactors.mjs` and `lib/backtest.mjs` directly in the
  five-entry-point list would make them members by seeding, not by traversal, which is why this
  assertion uses its own single-seed walk instead.
- **Assert 3 (the edge that must exist):** `lib/rookieMirror.mjs`'s own closure *does* contain
  `lib/projectionFactors.mjs`. The mirror composes the uncorrected predictor; a mirror that imported
  nothing would be a copy-paste of the uncorrected stack, and the two would then drift
  independently.
- **Not entry points, deliberately:** `test/**`. Tests import both sides by design — that is how §4
  works — and including them would make the assertion unsatisfiable. Stated in the test's own header
  so the exclusion reads as a decision rather than an oversight.

**Consequence for §4 and §5, made explicit:** the parity check lives in `test/`, importing the mirror
directly. It must never be reachable from a `bin/` subcommand. If a future slice wants a parity CLI,
adding it to `bin/panel.mjs` will red this test — correctly — and that slice needs its own entry
point outside the fit path.

### 3.4 · Refuse the real corrected predictor, not just a stub

Today's tests 2 and 3 use inline stubs. Add one that injects the real thing:
`assembleRookiePanel({ ...minimalFixture(), predictor: reconstructShippedRookieProjection })` throws,
and the message contains at least one of the three tokens. This is the single assertion whose
deletion springs the trap, which is what makes its deletion visible in a diff.

### 3.5 · The limit the guard cannot reach, carried forward

`rookie-outcome-panels.md` §1 Q4(d) already says it and it stays true with three mechanisms: a re-fit
over predictor years the constants were fitted on is a *re-derivation*, not validation, however clean
the predictor is. This sentence goes next to any ratio in the new verdict section a reader could
mistake for confirmation.

---

## 4. Parity evidence

### 4.1 · What T-F10 does, and why the rookie case is not the same shape

T-F10 reconstructs veteran factors from store files and compares them to a committed slim snapshot's
`factors` — exact for pool-independent quantities, `POOL_TOLERANCE = 3e-3` for cohort-dependent ones,
with a named residual (the position-source drift at pid 3198).

The rookie case is **structurally easier**, and that is the whole answer to the ktc/college worry.

### 4.2 · The ktc/college question → **it does not break this comparison, because this comparison does not reconstruct them**

The app captures each mechanism's *inputs* alongside its outputs on every rookie row:

| mechanism | captured inputs | captured outputs |
|---|---|---|
| calibration | `draftCapitalStatus`, `nflDraftTier`, position | `rookieCalibrationMult`, `rookieCalibrationBasis` |
| ceiling | `rookieCeilingPPGPre` (3 dp), position | `projectedPPG` (1 dp), `rookieCeilingBasis`, `rookieCeilingKnee`, `rookieCeilingAsymptote` |
| games | `draftCapitalStatus`, `nflDraftTier`, position, experience bucket (inside `rookieGamesBasis`) | `projectedGames`, `rookieGamesBasis` |

`ktcMult` and `collegeContribution` enter only `rookieMultiplierProduct`, **upstream of all three**,
and `rookieCeilingPPGPre` is captured *after* they have done their work. So each mechanism is a pure
function of fields the snapshot already carries, and the reconstruction never has to produce ktc or
college at all.

**The honest assertion is therefore mechanism parity, exact, on captured inputs — not end-to-end
level parity.** ktc/college being live-valued in the snapshot and held neutral in the historical
panel breaks a *different* comparison — snapshot `projectedPPG` against a panel-reconstructed
`projectedPPG` — which this slice must not assert and which `reconstructRookieProjection`'s own
deviation note (`lib/projectionFactors.mjs:706`–`719`) already disclaims. Do not smuggle that
comparison in under a tolerance.

**What mechanism parity proves.** The three mirrored constant tables value-for-value on live rows;
the ladder's rung order, its per-rung n floors, and its absent-cell-is-absent-on-purpose rule; the
ceiling's closed form, its identity-below-knee branch and its rounding; the calibration's placement
*outside* the `[0.45, 1.85]` clamp; and the ordering, to differing strength at its two seams:

- **calibration → ceiling: observable exactly.** `rookieCeilingPPGPre` is captured at 3 dp and is
  the ceiling's own input, so the seam is checkable to capture precision.
- **ceiling → games: observable only up to capture rounding, and only on rows where the ceiling
  fires.** `projectedTotalPts` still discriminates the wrong order, because multiplying
  `projectedPPGPre` by games instead of the ceiled value diverges by
  `(pre − ceiled) × projectedGames` — at least an order of magnitude above the rounding noise on any
  firing row. It does not *pin* the seam on rows where the ceiling is inert, where both orders agree.

So the ordering claim is verified exactly at one seam and to within capture rounding at the other, on
the subset of rows where the second seam is live at all.

**What it cannot prove.** Three things, each stated in the test's header:

1. That the harness can reconstruct a *historical* rookie's `projectedPPG`. It cannot: KTC history
   starts 2026-05-18 and `computeCollegeMetrics` is unported. Unchanged by this slice.
2. That rows whose `rookieGamesBasis` carries no experience bucket (`gp:…`, `g:…`, `u:<pos>`) select
   the right rung. `yearsExp` is not captured, and those three rungs are reached precisely *because*
   the bucketed rungs missed, so the selection cannot be replayed. Those rows admit value-agreement
   only. Count them and pin the count, so a change in the mix is visible rather than silent.
3. Anything about the 2026 class as out-of-sample evidence. That is D-16.
4. That the ordering seam is reachable through the composed mirror on a real row. With `ktcMult` and
   `collegeContribution` pinned at 1.0, no `day3` non-QB row can reach its knee and no row can carry
   both a calibration discount and a level above its knee, so the ordering is unreachable through the
   neutral-ktc/college composition and is verified only by direct call (T-RM8) plus the snapshot's
   `rookieCeilingPPGPre`, where live ktc and college values make it reachable. This is a real
   consequence of the two structural neutralities, not a test-design choice.

### 4.3 · Resolving position and experience from a row that carries neither

The snapshot's player block is `{ nfl_team, status, depthChartOrder, ktc, projection }` — **no
`position`** (`src/utils/projectionSnapshot.js` `buildPlayersBlock`). Two recoveries, both from
inside the row, which is what lets this test avoid depending on a 2026 position fixture at all — and
that matters, because 2026 roster and advstats files are mid-season.

- **Position** from `factors.basePPG` (13 / 9 / 7 / 5 → QB / RB / WR / TE), disambiguated by
  `factors.rookieCeilingKnee` (17.80 / 12.11 / 9.87 / 6.21, and `null` for any position outside the
  four). The disambiguation is load-bearing: the app's `ROOKIE_BASELINE_PPG[position] ?? 7` sends an
  unrecognised position to 7, colliding with WR, and `applyRookieCeiling` returns a `null` knee for
  exactly those rows. Assert both maps are injective in the test, so a future baseline edit that
  collides reds here instead of silently mislabelling.
- **Experience bucket** from `rookieGamesBasis`'s own segment, replayed with a representative
  `yearsExp` (`'0'`→0, `'1'`→1, `'2+'`→2). Exact, because `resolveRookieGames` consumes `yearsExp`
  only through `expBucket`. State that reasoning in the test — it is the reason a representative is
  legitimate rather than a fudge.

### 4.4 · The fixture, and the sequencing constraint Session 2 must respect

**Fixture:** `test/fixtures/rookie-mirror-parity/snapshot-2026-09-12.slim.json`. Every row of the
first automated capture carrying all three mechanisms with `projection.confidence === 'rookie'`,
narrowed to `{ projection: { projectedPPG, projectedGames, projectedTotalPts, factors: <the rookie
keys only> } }`, plus the envelope's `schemaVersion`, `capturedAt`, `targetSeason`, `currentSeason`.
Same slimming convention as T-F10's snapshot fixture, with the generator inlined as a comment in the
test the way T-F10 does at `:1425`–`1475`. **This is the parity fixture only** — D-6's v3 residue is
a separate, full-envelope fixture, `test/fixtures/grade-snapshot-v3.json` (§1.1, §6.14), because the
grader's self-test needs `scoringSettings` and hardcoded expected grades this rows-only file cannot
carry.

**Presence is asserted, never skipped** — `assert.ok(fs.existsSync(...))` per T-F10's Fix-pass-1 item
5, because a `t.skip` on a missing fixture is a green silent gate.

**The constraint (C1).** That snapshot does not exist yet; it lands roughly 16:30 UTC today. Session 2
must, before writing the fixture: `git pull`, confirm `snapshots/2026-09-12.json` exists, and confirm
a rookie row in it carries `rookieCeilingBasis`, `rookieGamesBasis` and `rookieCalibrationBasis`. If
that capture failed or was skipped, use the next available date and change the fixture name in the one
place it appears. **Do not hand-write or synthesize the fixture** — a hand-made parity fixture asserts
the mirror against itself and is worse than no test. If no qualifying snapshot exists when Session 2
runs, it lands §§2, 3, 5 and 6 and stops on §4, reporting that explicitly rather than weakening it.

---

## 5. D-14 — the independent re-derivation, its tolerance, and what a mismatch means

**Where it lands.** A new `ceiling` block on `runRookiePanels`'s returned result, structurally
identical to the existing `availability` block (`observed` / `expected` / delta), rendered as a new
`§G` by `buildRookieVerdictMarkdown`. Derived from the `debut` assembly's own rows — the same rows the
app's `src/__fixtures__/rookie-debut-panel-2026-09-11.json` is a redaction of. No new CLI flag;
`--rookie` already runs the debut assembly.

**Computation, pinned to the app's convention.** A different convention is a different number, not a
tolerance question, so the convention is part of the mirror:

- population: `debut.rows` with `outcomeGames >= 8` and `outcomePPG != null`, grouped by `position`
- quantile: zero-based index `p·(n−1)`, linear interpolation between adjacent order statistics,
  rounded once to 2 dp
- `knee = p90`, `asymptote = p99`

**Tolerance: exact equality. Verified, not chosen** — C5's table reproduces all four n, all eight
quantiles and the 873 gated total against the committed panel today.

**Why exact rather than a band.** Both sides consume the *same rows*. There is no sampling
difference, no pool composition, no divergent float path — unlike T-F10's cohort factors, where
`POOL_TOLERANCE` earns its keep. A band here would only hide a real defect.

**So state what this is and is not.** It is two independent *implementations* of one quantile over one
dataset. It catches a transcription error, an off-by-one in the index convention, a gate written `> 8`
instead of `>= 8`, a rounding applied twice, and a population defined on the wrong assembly. It is
**not** independent data and therefore **not** out-of-sample validation — the app's fixture is a
four-field redaction of these very rows. Genuine data independence is D-16, deferred to season end.
That sentence goes in §G next to the numbers, per §3.5.

**What a mismatch means — a finding, reported, never retuned.** The `ceiling` block reports
`observed`, `expected` (a hardcoded copy of the app's eight shipped numbers with `41f277e` named
beside them), `delta` and `match: boolean`. Triage:

- **n differs** → the two repos disagree about the debut population. Either the panel regenerated and
  moved (a season-totals or roster backfill, a crosswalk change) or the app's fixture is stale.
  Identify which. Do not touch a constant.
- **n matches, a quantile differs by ≤ 0.01** → a rounding-path difference. Find it. Do not widen
  anything.
- **n matches, a quantile differs by more** → the shipped constant is wrong for the current data.
  This repo reports the number; changing `ROOKIE_CEILING` is an app-repo slice.

**No test asserts `match === true`, and that is deliberate and safe.** It follows the `availability`
precedent, which already reports non-zero bucket deltas (r1 153 vs 152, day3 1137 vs 1119) with no
test asserting them. App-side drift is not left unguarded, because it is caught somewhere better: the
mirror holds its own copy of the eight numbers, and §7's parity test asserts those against the
snapshot's captured `rookieCeilingKnee` / `rookieCeilingAsymptote`. So a changed app constant reds a
test, while D-14's block is the provenance record. One test asserts the harness's own derivation is
stable against the committed panel — a reproduction pin, not a parity gate.

---

## 6. What changes — fourteen files

### 6.1 `lib/rookieMirror.mjs` (new)

Header docstring: this is the **corrected** reconstruction, it is deliberately unreachable from the
fit path, it names `lib/projectionFactors.mjs`'s `reconstructRookieProjection` as the uncorrected
predictor, and it carries the `bySleeper.draftPick`/`draft_picks.json` `pick` never-join warning.
D-10's `bySleeper.undrafted` record lives in `data-catalog.md` only (§1.1) — the mirror does not
depend on that flag and the docstring must not claim it does.

Contents, each a verbatim port with the app's own line reference in a comment:
`ROOKIE_CALIBRATION`, `DAY3_TIERS`, `R1_TIERS`, `DAY2_TIERS`, `ROOKIE_CEILING`, the five
`ROOKIE_GAMES_*` tables, `resolveRookieCalibration`, `resolveRookieGames`, `applyRookieCeiling`,
`ROOKIE_CORRECTIONS`, and `reconstructShippedRookieProjection`, which composes
`reconstructRookieProjection` and then applies calibration → `clamp(…, 0, 40)` on the resulting
level → ceiling → games → total points **in that order**, with the ordering's load-bearing nature
stated in a comment and both seams named at their differing observability strength (§4.2).

`resolveDraftCapitalStatus` is **not** ported: its inputs (`nflDraftMatchSource`, `currentSeason`,
`nflDraftYears`) are live app state, and every parity row carries `draftCapitalStatus` already. The
mirror takes it as a parameter. Stated as a deviation, not omitted silently.

`reconstructShippedRookieProjection` calls `reconstructRookieProjection` for its factor work and
then recomputes the level from that call's **`cappedProduct`** field:
`projectedPPGPre = clamp(ROOKIE_BASELINE_PPG[position] × cappedProduct × rookieCalibrationMult, 0, 40)`.
It must never read the uncorrected call's `projectedPPG`, which is rounded and pre-clamped. State
this in the function's own comment, because it is the single most plausible silent mirroring error
in the slice.

### 6.2 `lib/projectionFactors.mjs`
Extend the deviation comment (`:706`–`:729`) so the reserved name carries its file: the mirror lives
in `lib/rookieMirror.mjs`, and it is three mechanisms now, not two. No behaviour change.

### 6.3 `lib/panel.mjs`
Guard messages name the module and the three tokens (§3.1). `coverage.predictorCorrections` stamp
(§3.2). No change to the guard's logic or to any assembly's rows — the reproduction pin must stay
byte-identical.

### 6.4 `scripts/panel-run.mjs`
`runRookiePanels`: compute the `ceiling` block (§5), no stamp assertion (§3.2 — provenance only).
`buildRookieVerdictMarkdown`: render `§G`, including §3.5's sentence.

### 6.5 `bin/panel.mjs`
Docstring only — `--rookie` now also reports the ceiling quantiles. **No new flag**, and nothing that
would put the mirror in this file's import closure (§3.3).

### 6.6 `grading/anchor-policy.md` (new, D-15)
Opens by disambiguating itself from `.claude/tasks/anchor-policy.md` (registry line anchors — a
different subject that happens to share the word). Then:

- **The rule: segment, never pool, across a model-change boundary.** A forward-grading run that pools
  rows captured under different rookie mechanisms measures the mechanism change, not the model.
- **Row-level detection is authoritative**, per D-15's own reasoning: the presence of
  `factors.rookieCalibrationBasis`, `factors.rookieGamesBasis` and `factors.rookieCeilingBasis`, plus
  `rookieCeilingKnee`/`rookieCeilingAsymptote`, identifies a row's mechanism version from the row,
  with no date-to-version lookup.
- **The date table is the cross-check, not the rule.** Three model changes: `f07d9be` 2026-09-09
  14:54 UTC (calibration), `ed027c7` 2026-09-11 08:01 UTC (games ladder), `41f277e` 2026-09-12 09:23
  UTC (ceiling); captures land at 16:29 UTC daily against app `main`. Expected segments: `≤2026-09-08`
  none · `2026-09-09`–`2026-09-10` calibration only · `2026-09-11` calibration + games ·
  `≥2026-09-12` all three. **Session 2 verifies each boundary against the actual committed files and
  corrects the table rather than inheriting it** — `2026-09-10` is confirmed (C2), the rest are not.
- **Veteran-path rows are unaffected** by all three; the boundaries are rookie-path only.
- **Why this is written now and not at the first forward grade:** writing it with a stale two-date
  list is worse than not writing it (D-15), and the third date exists as of `41f277e`.

### 6.7 `test/fixtures/rookie-mirror-parity/snapshot-2026-09-12.slim.json` (new)
§4.4. Parity fixture only, rookie rows narrowed as described there. D-6's v3 residue is the separate
`test/fixtures/grade-snapshot-v3.json` (§6.14).

### 6.8 `test/rookie-mirror.test.mjs` (new)
§7.1–§7.4.

### 6.9 `test/panel-fit.test.mjs`
One test added beside the existing §6 tests 2–4 block at `:2418` (§3.4). Nothing existing changes.

### 6.10 `data-catalog.md`
Crosswalk row gains D-10's two sentences. Snapshots row gains one sentence pointing at
`grading/anchor-policy.md` for mechanism-version segmentation.

### 6.11 `README.md` → Analysis / Backtesting
`:2114`'s sentence — *"`reconstructShippedRookieProjection` is a reserved name with no body yet"* —
becomes false the moment §6.1 lands and must be corrected in the same change. Replace with: the
corrected predictor now exists in `lib/rookieMirror.mjs`, is deliberately outside the fit path's
import closure, and is guarded by both the per-row declaration check and the import-graph test.
Document `§G`. Also correct `:2103`'s "one predictor" to name two, one per purpose. **All of this is
outside the mirrored span (`:1505`–`:1748`) and so is legitimately editable from this repo.**

### 6.12 `scripts/grade-snapshot.mjs`
`runSelfTest` (`:434`) gains a v3 read beside its existing `grade-snapshot-v2.json` read. Required
by T-RM13.

### 6.13 `CLAUDE.md`
The `.github/workflows/` navigation row still describes `daily-snapshot.yml` as "`workflow_dispatch`
only in phase 1, no `cron:` line yet", false since phase 2. C1's whole sequencing argument and
§6.6's date table rest on that cron being live, so the one stale row is corrected here. **This
supersedes §8's "CLAUDE.md — No edit" row.**

### 6.14 `test/fixtures/grade-snapshot-v3.json` (new)
A full-envelope v3 fixture, D-6's residue (§1.1): `schemaVersion`, `capturedAt`, `targetSeason`,
`currentSeason`, `scoringBasis`, `scoringSettings`, and a small player set, shaped like
`grade-snapshot-v2.json` so the grader's self-test's existing code path applies. Wired into
`runSelfTest` (§6.12) and T-RM13.

---

## 7. Tests to add

All in `test/rookie-mirror.test.mjs` unless stated. Run with `npm test` (`node --test`).

### 7.1 · The re-fit-trap extension

**T-RM1 · the fitting path cannot reach the mirror** (§3.3).
*Inputs:* repo source files, walked statically from `bin/panel.mjs`, `scripts/panel-run.mjs`,
`lib/panel.mjs`, `lib/backtest.mjs`, `lib/projectionFactors.mjs`.
*Expected:* the full five-seed closure excludes `lib/rookieMirror.mjs`; a second, single-seed walk
from `bin/panel.mjs` alone includes `scripts/panel-run.mjs`, `lib/panel.mjs` (direct) and
`lib/projectionFactors.mjs`, `lib/backtest.mjs`, `lib/io.mjs`, `scripts/grade-snapshot.mjs`
(transitive-only, anti-vacuity); `lib/rookieMirror.mjs`'s own closure includes
`lib/projectionFactors.mjs` (the composition edge).
*Edge cases:* `export … from` re-exports are followed; dynamic `import('…')` with a literal is
followed; bare and `node:` specifiers ignored; a specifier without an extension or resolving to a
missing file fails the test loudly rather than being skipped, so a rename cannot empty the graph;
`test/**` is excluded by design and the header says why.
*How it fails usefully:* adding `import { … } from './rookieMirror.mjs'` anywhere in the fit path
reds it, naming the file and the path that reached it.

**T-RM2 · the guard refuses the real corrected predictor** (§3.4, in `test/panel-fit.test.mjs`).
*Inputs:* the existing `minimalFixture()` at `:2419`, `predictor: reconstructShippedRookieProjection`.
*Expected:* throws; message matches `/rookieCalibration|rookieGames|rookieCeiling/` and `/CR-15/`.

**T-RM3 · the corrected predictor declares exactly what it applied.**
*Inputs:* three rows — an undrafted WR (calibration + games fire, ceiling does not), a top-3 QB with
a pre-ceiling level above 17.80 (all three fire), a `day3` QB (calibration basis present at mult
1.00).
*Expected:* `appliedCorrections` is frozen, is a subset of `ROOKIE_CORRECTIONS`, and declares each
mechanism by its own explicit condition, not a shared "moved a number" test:

- `rookieCalibration` — declared when `rookieCalibrationMult < 1`. Mirrors the app's own
  `adjustmentSummary` gate, so the `day3:QB` row at mult 1.00 does **not** declare.
- `rookieCeiling` — declared when `rookieCeilingBasis !== 'none'`. Mirrors the app's gate, which
  fires on the basis string and not on the size of the move.
- `rookieGames` — declared when `resolveRookieGames` returned a basis other than `'default'`, i.e.
  whenever the ladder resolved a real cell rather than falling through to the flat 14 —
  `reconstructRookieProjection` returns no games column, so `rookieGames` has no uncorrected
  baseline to have "moved" against.

**T-RM4 · the panel stamp is present and empty** (§3.2, provenance only).
*Inputs:* `assembleRookiePanel` with the default predictor.
*Expected:* `coverage.predictorCorrections` is present and `[]`, and appears in the written panel
JSON. No assertion that any assembly's stamp is non-empty, and no stubbed-assembler case — there is
no assembler seam to stub and no assertion for it to drive.

**T-RM14 · the two token copies agree.**
*Inputs:* `lib/panel.mjs` read as **text** (never imported into an assertion about its imports) and
`ROOKIE_CORRECTIONS` from `lib/rookieMirror.mjs`.
*Expected:* each member of `ROOKIE_CORRECTIONS` appears as a literal in `lib/panel.mjs`'s source
text. Reading it as text rather than importing it keeps T-RM1 green.

### 7.2 · Mirror unit behaviour

**T-RM5 · `resolveRookieCalibration`, every cell plus the negatives.**
*Inputs:* all 8 populated cells; `day3:QB` (1.00 with basis `day3:QB`); `draftCapitalStatus:
'unknown'`; a `matched` row at an `r1`/`day2` tier; an unrecognised position.
*Expected:* the shipped multipliers and basis strings; `1.00`/`'none'` on every negative.

**T-RM6 · `resolveRookieGames`, all five rungs and first-hit-wins.**
*Inputs:* one row per rung — a `gpe` hit; an `r1|1` row (absent from rung 1, absent from rung 2, so
it must fall to `gp:r1|QB`); a `g:` fall-through; an `unknown` row with and without a bucket; a row
with no resolvable group at all.
*Expected:* the shipped value and basis per rung; `raw = 14` / `basis 'default'` on the last;
`Math.round` then clamp to `[0, 17]`; **no floor at 8** — assert a `day3|QB|0` row returns 2, because
copying the veteran floor is the single most likely mirroring error and it would erase slice 2's
whole finding.
*Edge cases:* an absent cell is never backfilled from a neighbour (assert `r1|1` does **not** return
rung 2's `r1|0` value of 12.8); `yearsExp` of `null` yields a `null` bucket and skips rungs 1–2.

**T-RM7 · `applyRookieCeiling`, the closed form and its branches.**
*Inputs:* per position — a level below the knee, exactly at the knee, just above, far above; an
unrecognised position; a non-finite level.
*Expected:* identity at or below the knee with the knee/asymptote still reported; above the knee,
`knee + (a − knee)·(1 − e^{−(x−knee)/(a−knee)})` to full float precision; strictly increasing and
**strictly below the asymptote** at every tested level (assert monotonicity across a swept range, so
a hard cap substituted later reds); `'none'` with `null` knee on an unrecognised position; non-finite
passes through unchanged.

**T-RM8 · ordering is load-bearing.**
*Inputs:* a direct unit call, not a row through the composed mirror — with `ktcMult` and
`collegeContribution` pinned at 1.0, no `day3` non-QB row can reach its knee (day3 TE tops out near
4.26 against a 6.21 knee; day3 RB near 7.66 against 12.11), so no composed row can carry both a
calibration discount and a level above its knee. Pass a synthetic pre-calibration level and a
synthetic `cappedProduct` directly to `applyRookieCeiling` and to the composition step, chosen so the
two orderings differ observably.
*Expected:* matches calibration-then-ceiling; the test states the other order's number explicitly so
the diff between them is on the record rather than implied.

### 7.3 · Parity against the real snapshot (§4)

**T-RM9 · fixture presence.** `assert.ok(fs.existsSync(...))` for the slim snapshot. Never `t.skip`.

**T-RM10 · rookie mechanism parity, exact, on captured inputs.**
*Inputs:* every rookie-path row of the slim fixture. Position and bucket recovered per §4.3.
*Expected, per row:*
- `resolveRookieCalibration` returns the row's `rookieCalibrationMult` (to the captured 3 dp) and its
  `rookieCalibrationBasis`, exactly.
- `applyRookieCeiling({ position, projectedPPG: factors.rookieCeilingPPGPre })` — `rookieCeilingPPGPre`
  is captured at 3 dp while the app feeds full precision, so this is a **documented
  capture-precision residual** (T-F10's style), not a tolerance chosen to pass:
  - level: `|round(mirrorCeiled, 1) − projection.projectedPPG| ≤ 0.1`, with the **exact-match count
    pinned** to the observed number so a real divergence moves it;
  - basis: asserted exactly, except for rows whose `rookieCeilingPPGPre` is within 5e-4 of the knee
    (where the ≤5e-4 input error can flip which side of the knee the row falls on), which are
    counted and skipped with the count pinned (expect 0);
  - `rookieCeilingKnee` / `rookieCeilingAsymptote`: exact, unaffected by input precision — this is
    the app-constant drift guard (§5) and must stay exact.
- `resolveRookieGames` returns the row's `projectedGames` and `rookieGamesBasis` exactly, for rows
  whose basis carries a bucket.
- total points, per item 1's two-seam finding: `|round(mirrorCeiled × projectedGames, 1) −
  projection.projectedTotalPts| ≤ 0.1`, with its own exact-match count pinned too.
*Expected, per file:* a non-zero checked count, asserted (the T-F10 lesson — a fixture that silently
matched zero rows passes vacuously); the count of bucket-less rows pinned to the observed number, so
a change in the rung mix is visible; the position-recovery maps asserted injective.
*Edge cases:* a row with `rookieCeilingKnee: null` is a position outside the four and is counted and
skipped, not silently dropped; a row with `rookieCalibrationBasis: 'none'` still asserts the
multiplier is exactly 1.00.
*Stated in the header, not implied:* this asserts mechanism parity on captured inputs, not
end-to-end level parity; ktc/college are never reconstructed here; historical `projectedPPG` parity
remains out of reach.

### 7.4 · D-14 (§5)

**T-RM11 · the eight quantiles re-derive from the committed panel.**
*Inputs:* `backtests/2026-09-11-rookie-panel.json` `debut.rows`, gated `outcomeGames >= 8` and
`outcomePPG != null`.
*Expected:* exactly C5's table — n QB 50, RB 281, WR 366, TE 176; p90 17.80 / 12.11 /
9.87 / 6.21; p99 21.90 / 16.87 / 14.38 / 11.60; gated total 873. Exact equality, no tolerance.
*Edge cases:* the gate is `>= 8` not `> 8` (assert a row at exactly 8 games is included); the
quantile index is `p·(n−1)` zero-based (assert the QB p99 worked example — `0.99 × 49 = 48.51`,
interpolating 49 % from the 49th to the 50th order statistic); rounding applied once, not per
operand.

**T-RM12 · the `ceiling` block's shape and its `expected` provenance.**
*Inputs:* `runRookiePanels`'s result under the existing default load.
*Expected:* a `ceiling` block with `observed`, `expected`, `delta`, `match` per position; `expected`
equals the app's shipped `ROOKIE_CEILING` and names `41f277e`; `§G` of the rendered verdict contains
the eight numbers and §3.5's re-derivation-is-not-validation sentence. **No assertion that `match`
is true** — §5.

**T-RM13 · D-6's v3 fixture is wired in — two concrete assertions.**
*Inputs:* `test/fixtures/grade-snapshot-v3.json` (§6.14) via the grading self-test path that already
reads `grade-snapshot-v2.json` (`scripts/grade-snapshot.mjs:434`); `shouldSkipSnapshot`
(`scripts/register-snapshots.mjs:32`) called directly.
*Expected:*
(a) `runSelfTest`'s v3 path produces the fixture's hardcoded expected grades, proving the grader is
schema-version-agnostic in fact rather than by reading the source;
(b) `shouldSkipSnapshot` and the registrar's type-check accept `schemaVersion: 3`, asserted against
the exported `shouldSkipSnapshot` directly, since the grading self-test never reaches the registrar.

---

## 8. Docs / README updates

| File | Edit | Why |
|---|---|---|
| `README.md` → Analysis / Backtesting (`:2103`, `:2114`) | Correct the reserved-name sentence, which this slice makes false; name both predictors and their purposes; document `§G` and the import-graph guard | Outside the mirrored span, so editable here; a false sentence about the trap is the worst possible residue of a slice about the trap |
| `data-catalog.md` → crosswalk row | D-10: the `bySleeper.undrafted` derivation (`draftRound === null`, `lib/nflverse.mjs:548`, `MAX_UNDRAFTED_RATE = 0.75` in `lib/validate.mjs`) is the population the app's shipped calibration constants were **fitted** on; if the derivation changes, the constants are fitted to a population that no longer exists, even though no code on the live path reads the flag | D-10 (§1.1) — the never-join warning goes in the mirror's docstring (§6.1), not here |
| `data-catalog.md` → projection-snapshots row | One sentence pointing at `grading/anchor-policy.md` for mechanism-version segmentation | D-15's rule needs to be findable from the family it governs |
| `grading/anchor-policy.md` (new) | §6.6 in full | D-15 |
| `CLAUDE.md` → `.github/workflows/` navigation row | Correct the stale "`workflow_dispatch` only in phase 1, no `cron:` line yet" description of `daily-snapshot.yml`, false since phase 2 (§6.13) | C1's sequencing argument and §6.6's date table both rest on that cron being live |
| App-repo `docs/signal-registry.md` | **Owed, not made** — D-10's crosswalk row wants the same note on the app side | Unreachable; §9.3 |

---

## 9. Cross-repo impact

### 9.1 · CR-15 · R3-FIT factor-multiplier mirror — **fires**

This slice touches four CR-15 data-side triggers: `lib/projectionFactors.mjs`, `lib/panel.mjs`,
`scripts/panel-run.mjs`, `test/panel-fit.test.mjs`. Mirror text, quoted:

> **Mirror:** Re-mirror the changed constant/gate/branch and **re-fit before any further exponent
> activation** — otherwise the fit reconstructs a factor the app no longer produces and the committed
> verdict in `.claude/tasks/r3fit-exponent-harness.md` stops transporting. Which positions a factor is
> gated to is itself part of the mirror. Note the known parity gap: `shareTrend` and `teamRzShare`
> have no end-to-end app-ground-truth check until a post-2026-07-18 snapshot is imported. **Nothing
> app-side fails when this drifts.** **Scope note reversed (D6a, 2026-09-06):** `dynastyScore.js` was
> previously named in `lib/projectionFactors.mjs:110` only as a *contrast* and marked deliberately not
> a trigger; D6a's age port (Step 2) draws `computeEmpiricalAgeCurves` straight out of it, so
> `dynastyScore.js` is now mirrored and is a trigger like the other ten app-side modules. The old
> contrast is still accurate as far as it goes — `weightedLinearRegression`'s copy in that file remains
> unfloored where the mirrored one floors the denominator at 4 — it just no longer means the whole file
> is out of scope.

**On substance:** the re-fit clause does **not** bite. No exponent is activated here, no veteran
factor changes, and the rookie mirror is deliberately outside the fit path's import closure (§3.3), so
no fit reconstructs anything new. Direction is `app→data` and the app has already emitted — this
slice is the data side discharging, three mechanisms late.

### 9.1b · CR-18 · Signal registry rows — **fires**

This slice edits `data-catalog.md`, a CR-18 data-side trigger. Mirror text, quoted in full:

> **Mirror:** This entry's data side is the one genuinely open set in the registry — a brand-new
> ingest adds a script the list above cannot already name. The listed sites are every one that
> exists today; a *new* one is caught by the near-side re-verification duty (the data repo's
> reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this
> list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source —
> or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact
> `docs/signal-registry.md` row edit the app must make (layer · source · coverage ·
> reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the
> data side in the same change. **Nothing fails in either repo when this drifts** — the registry
> simply becomes wrong, and since it is the inventory that governs snapshot-capture and
> grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo
> cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

**The emitted row edit — the whole deliverable:**

- **Layer:** derived/crosswalk (rookie realisation population)
- **Source:** `bySleeper.undrafted`, derived in `lib/nflverse.mjs:548` as `draftRound === null`
- **Historical coverage:** as far back as `nflverse` draft data is ingested (`MIN_DRAFT_YEAR` in
  `lib/nflverse.mjs`)
- **Reconstructable vs. ephemeral:** reconstructable — deterministic from `draft_picks.json`
- **Current use:** the population the app's shipped rookie-calibration constants (undrafted: QB
  0.67 · RB 0.33 · WR 0.36 · TE 0.28) were fitted on. No code on the live path reads the flag; a
  change to the derivation invalidates the fitted constants without any code failing.

### 9.2 · The CR-15 amendment this slice cannot make — **owed to a both-repos session**

`lib/rookieMirror.mjs` must join CR-15's `Data side` and its data-side `Triggers`, and the entry's
`Invariant` should extend to the rookie mechanisms. Per C3 that text is inside the byte-identical
mirrored span and cannot be committed from this repo. **The exact edit, for whoever runs the
both-repos session:**

- **Data side**, append: `lib/rookieMirror.mjs` (`ROOKIE_CALIBRATION`, `ROOKIE_CEILING`, the five
  `ROOKIE_GAMES_*` tables, `resolveRookieCalibration`, `resolveRookieGames`, `applyRookieCeiling`,
  `reconstructShippedRookieProjection`, `ROOKIE_CORRECTIONS`) — **the corrected rookie reconstruction,
  deliberately outside `bin/panel.mjs --fit`'s import closure**, parity-guarded by
  `test/rookie-mirror.test.mjs`.
- **Invariant**, append: the three rookie mechanisms reproduce the app's behaviour exactly, *including
  `rookieProjection`'s ordering* — calibration inside, then the ceiling on the finished level, then the
  games ladder, then total points — and including the absence of a lower games clamp at 8.
- **Triggers**, data side, append: `lib/rookieMirror.mjs`, `test/rookie-mirror.test.mjs`.
- **Mirror**, append: a change to any of the three app-side rookie mechanisms, or to their ordering,
  re-mirrors here; the mirror must never become reachable from the fit path, which
  `test/rookie-mirror.test.mjs`'s import-graph assertion enforces.

Until that lands, CR-15's trigger list is knowingly incomplete and **no test reds** —
`test/registry.test.mjs` asserts named→resolves, never source→named (§2, cost paragraph).

**Append to the same both-repos edit:** correct CR-15's stale `Data side` cache, which omits
`predictFullPipeline`, `D6_NEW_FACTORS` / `FULL_FACTORS_D6` / `ENVELOPE_FACTORS_D6_ADDITIONS`,
`assembleRookiePanel` and `rookiePathStateAt` in `lib/panel.mjs`, and `runFullPipeline` /
`runRookiePanels` in `scripts/panel-run.mjs`. The file-level `Triggers` still cover all of them, so
nothing mis-fires today and this is a cache correction rather than a contract change — but doing it
in the same edit avoids a second both-repos session.

### 9.3 · Owed to the app repo, not made here

1. `docs/signal-registry.md`'s crosswalk row wants D-10's note (the app's constants are fitted to the
   `bySleeper.undrafted` population).
2. `docs/projection.md`'s 18 % rookie total-points residual line is stale per §9.3 item 2. Unchanged
   by this slice, still owed.
3. D-11's two stale trigger lists, plus §9.2's amendment — all three need one both-repos session.
4. §9.4's undischarged smoke on the ceiling render (a fresh build against a cleared browser cache) is
   an app-repo item and is not touched here.

### 9.4 · Entries that do not fire

**CR-01** (projection snapshots): this slice *reads* a committed snapshot into a test fixture and
writes none. No envelope field, no `schemaVersion`, no `factors` shape changes. The D-6 residue
documents v3 rather than altering it.
**CR-07**: no new read of advstats or a position source — the parity test recovers position from
inside the snapshot row precisely so it does not add one (§4.3).
**CR-11** (snap & red-zone usage stat keys): its data-side `Triggers` name `lib/panel.mjs` and
`lib/projectionFactors.mjs` as whole files, and this slice edits both, so it is named here rather
than silently passed over. Mirror text, quoted:

> **Mirror:** Do not remove, rename or filter these keys. **The projection degrades silently to
> neutral when they are absent** — no error, no test failure, no visible symptom. The blast radius
> is wider than the projection: `durabilitySignals` mis-classifies contributor seasons, `teamContext`'s
> RZ denominators go to zero (so `teamRzShare` sentinels out), the Outlook snap% column empties, and
> — since dp-v2 Slice 5b — Market's Efficiency `SNAP%`/`RZ SH` columns go blank the same way, and the
> data repo's own panel/backtest reconstructions drift the same way. The dependency is invisible at
> runtime; this registry entry is the only thing recording it.

**Substantive finding:** this slice adds no read, write, removal or filter of `off_snp`,
`tm_off_snp`, `rec_rz_tgt`, `rush_rz_att` or `pass_rz_att` — the rookie mirror composes
`reconstructRookieProjection`'s output and never touches these five keys, so nothing drifts.
**Direction:** data→app; nothing fails in either repo when it does not fire.

---

## 10. Done-definition

1. `npm run smoke` green.
2. `npm test` green, including `test/rookie-mirror.test.mjs` and the T-F10 / `§6 tests 2–4` blocks
   unchanged in `test/panel-fit.test.mjs`.
3. `node bin/panel.mjs --rookie` reproduces the existing `§A` pin **byte-identically** — the mirror
   must not perturb any assembly — and renders `§G`.
4. `node bin/panel.mjs --rookie --write` writes both artifacts; the new `ceiling` block appears in
   `backtests/<date>-rookie-panel.json`.
5. `data-catalog.md`, `README.md` and `grading/anchor-policy.md` updated per §8.
6. Branch pushed, PR opened, `smoke-test.yml` green on the PR. **Verify `origin/` contains the
   commit** — §8.3's process lesson, three publication failures in this programme.
7. Hand back: the diff, the `§G` numbers, the parity test's checked-row count and bucket-less count,
   and an explicit statement of whether §4 landed or was blocked on the snapshot (§4.4).

## 11. Risks

- **The parity fixture does not exist yet** (C1/§4.4). The one real schedule risk. Mitigation: the
  plan says stop and report rather than synthesize.
- **Transcribing 74 ladder cells plus 8 calibration and 8 ceiling constants by hand.** T-RM5/6/7 pin
  every cell, and T-RM10 pins them again against the live app. Two independent nets.
- **The veteran games floor at 8 creeping in** — the most plausible single mirroring error, and it
  would silently erase slice 2's finding. T-RM6 asserts against it by name.
- **A future slice adding a parity CLI** would red T-RM1. That is the test working; §3.3 says what
  such a slice must do instead.

---

## Fix pass 1 — plan-reviewer, 2026-09-12

Seventeen flags. Every one is accepted; four falsify claims the plan makes and are corrected rather
than softened. **This section edits only this task file.** No source, no fixture, no test — the
slice has not been implemented yet, so the artifact under repair is the plan.

Apply the items below exactly and in order. Where an item says *replace*, replace the named text in
full; where it says *append*, add without disturbing what is there.

### 1 · §4.2 — the ceiling→games seam is not exactly observable (flag 1)

The plan claims both seams of `rookieProjection`'s ordering are observable in the capture. That is
false. The app computes `projectedTotalPts` from the **full-precision** `ceiledPPG`
(`seasonProjection.js:440`) but stores `projectedPPG` rounded to 1 dp (`:471`), so
`round(projectedPPG × projectedGames, 1) === projectedTotalPts` fails on most rows — the reviewer
measured 268 of 291 in `snapshots/2026-09-10.json`.

**Replace** §4.2's "this is the part worth stating loudly" paragraph with a two-seam statement of
differing strength:

- **calibration → ceiling: observable exactly.** `rookieCeilingPPGPre` is captured at 3 dp and is
  the ceiling's own input, so the seam is checkable to capture precision.
- **ceiling → games: observable only up to capture rounding, and only on rows where the ceiling
  fires.** `projectedTotalPts` still discriminates the wrong order, because multiplying
  `projectedPPGPre` by games instead of the ceiled value diverges by
  `(pre − ceiled) × projectedGames` — at least an order of magnitude above the rounding noise on any
  firing row. It does not *pin* the seam on rows where the ceiling is inert, where both orders agree.

Add one sentence: "So the ordering claim is verified exactly at one seam and to within capture
rounding at the other, on the subset of rows where the second seam is live at all."

### 2 · §6.1 — compose from `cappedProduct`, never from the returned `projectedPPG` (flag 2)

`reconstructRookieProjection` returns `projectedPPG` already rounded to 1 dp **and** already clamped
to `[0, 40]`, both before any calibration exists. Composing from it cannot reproduce the app, which
evaluates `clamp(baseline × rookieMultiplierProduct × rookieCalibrationMult, 0, 40)` as one
full-precision expression.

**Append** to §6.1, as an explicit implementation instruction:

> `reconstructShippedRookieProjection` calls `reconstructRookieProjection` for its factor work and
> then recomputes the level from that call's **`cappedProduct`** field:
> `projectedPPGPre = clamp(ROOKIE_BASELINE_PPG[position] × cappedProduct × rookieCalibrationMult, 0, 40)`.
> It must never read the uncorrected call's `projectedPPG`, which is rounded and pre-clamped. State
> this in the function's own comment, because it is the single most plausible silent mirroring error
> in the slice.

### 3 · §2(b) and §6.1 — the `[0, 40]` clamp is missing from the stack description (flag 3)

**Replace** both stack descriptions so the order reads: baseline × four multipliers → `[0.45, 1.85]`
product clamp → calibration multiplier applied outside that clamp → **`clamp(…, 0, 40)` on the
resulting level** → ceiling on the finished level → games ladder → total points.

### 4 · §1.3, §6 — the file count is fourteen, not eleven (flags 4, 17)

Three files the plan needs and omits. **Replace** §1.3's "exactly eleven files" with "exactly
fourteen files", and **append** to §6:

- **§6.12 `scripts/grade-snapshot.mjs`** — `runSelfTest` (`:434`) gains a v3 read beside its existing
  `grade-snapshot-v2.json` read. Required by T-RM13; flagged as a twelfth file the plan's own sprawl
  guard would have stopped.
- **§6.13 `CLAUDE.md`** — the `.github/workflows/` navigation row still describes
  `daily-snapshot.yml` as "`workflow_dispatch` only in phase 1, no `cron:` line yet", false since
  phase 2. C1's whole sequencing argument and §6.6's date table rest on that cron being live, so the
  one stale row is corrected here. **This supersedes §8's "CLAUDE.md — No edit" row**, which must be
  changed to name this edit.
- **§6.14 `test/fixtures/grade-snapshot-v3.json`** — see item 5.

### 5 · §1.1, §4.4, §6.7, T-RM13 — two fixtures, not one double-duty file (flag 5)

The plan has one slim rookie-rows-only file serving both the parity test and D-6. It cannot: the
grader's self-test needs `scoringSettings` for `buildInBasisOutcomes` and asserts hardcoded expected
grades, and the registrar is not exercised by the grading self-test at all.

**Replace** with two fixtures:

- `test/fixtures/rookie-mirror-parity/snapshot-<date>.slim.json` — rookie rows only, as §4.4
  already specifies. Parity only.
- `test/fixtures/grade-snapshot-v3.json` — a **full-envelope** v3 slice: `schemaVersion`,
  `capturedAt`, `targetSeason`, `currentSeason`, `scoringBasis`, `scoringSettings`, and a small
  player set, shaped like `grade-snapshot-v2.json` so the self-test's existing code path applies.

**Replace** §1.1's D-6 justification. The "free by-product" argument does not survive: the marginal
cost is a second fixture plus one self-test read, not zero. The honest justification is that D-6's
residue is one fixture of a family this slice is already reading and slimming, so the context is
loaded and the cost is small — not that it comes for free.

**Replace** T-RM13 with two concrete assertions: (a) `runSelfTest`'s v3 path produces the fixture's
hardcoded expected grades, proving the grader is schema-version-agnostic in fact rather than by
reading; (b) `shouldSkipSnapshot` and the registrar's type-check accept `schemaVersion: 3` — assert
against the exported `shouldSkipSnapshot` directly (`scripts/register-snapshots.mjs:32`), since the
grading self-test never reaches the registrar.

### 6 · §3.3 Assert 2, T-RM1 — the anti-vacuity assertion is itself vacuous (flag 6)

Both named members are entry points in the same list, so they are in the closure by seeding, not by
traversal. **Replace** Assert 2 with a traversal-only formulation, verified against live source:

> Seed a second walk from **`bin/panel.mjs` alone** and assert its closure contains
> `scripts/panel-run.mjs`, `lib/panel.mjs` (both direct, `bin/panel.mjs:51`–`:52`),
> `lib/projectionFactors.mjs`, `lib/backtest.mjs`, `lib/io.mjs` and `scripts/grade-snapshot.mjs`
> (all transitive). The last four are reachable only by traversal, so a walker whose regex matched
> nothing fails this assertion. Assert 1 (mirror absent) runs against the full five-seed closure.

### 7 · §3.2, T-RM4 — the stamp is not a guard; demote it to provenance (flag 7)

The reviewer is right twice: `runRookiePanels` has no assembler seam to stub, and the per-row guard
throws before the stamp is written, so the stamp's assertion can never fire in production. It was
defence-in-depth that reads the same fact from the same source and adds no reach.

**Replace** §3.2 and T-RM4 with the demoted version: `assembleRookiePanel` records
`coverage.predictorCorrections = []` as a **provenance field in the committed artifact**, with no
assertion anywhere that it is empty. T-RM4 becomes: the field is present and empty on every
assembly, and appears in the written panel JSON. Say plainly in §3.2 that this is a record for a
reader of the artifact, not a gate, and that the plan previously overstated it.

### 8 · T-RM3 — define the declaration rule for all three tokens (flag 8)

`rookieGames` has no uncorrected baseline to have "moved", since `reconstructRookieProjection`
returns no games column. **Replace** the rule with three explicit conditions:

- `rookieCalibration` — declared when `rookieCalibrationMult < 1`. Mirrors the app's own
  `adjustmentSummary` gate, so the `day3:QB` row at mult 1.00 does **not** declare.
- `rookieCeiling` — declared when `rookieCeilingBasis !== 'none'`. Mirrors the app's gate, which
  fires on the basis string and not on the size of the move.
- `rookieGames` — declared when `resolveRookieGames` returned a basis other than `'default'`, i.e.
  whenever the ladder resolved a real cell rather than falling through to the flat 14.

### 9 · T-RM8 — the ordering case is unreachable through the composed mirror (flag 9)

With `ktcMult` and `collegeContribution` pinned at 1.0, no `day3` non-QB row can reach its knee
(day3 TE tops out near 4.26 against a 6.21 knee; day3 RB near 7.66 against 12.11), and no row can
carry both a calibration discount and a level above its knee. **Replace** T-RM8's input with a
direct unit call: pass a synthetic level to `applyRookieCeiling` and a synthetic product to the
composition, assert the calibration-then-ceiling answer, and state the other order's number
explicitly as the plan already requires.

**Append** this as a named limit in §4.2's "what it cannot prove" list, as a fourth item: the
ordering seam is **unreachable through the neutral-ktc/college composition** and is verified only by
direct call plus the snapshot's `rookieCeilingPPGPre`, where live ktc and college values make it
reachable. This is a real consequence of the two structural neutralities, not a test-design choice.

### 10 · §3.1 vs §3.3 — the three tokens must be duplicated, and the plan must say so (flag 10)

`lib/panel.mjs` must name the tokens in its error messages and must not import
`lib/rookieMirror.mjs`. **Append** to §3.1:

> The three token strings therefore exist twice, deliberately. `ROOKIE_CORRECTIONS` in
> `lib/rookieMirror.mjs` is the **authoritative copy**; `lib/panel.mjs` carries them as literals in
> its two error messages with a comment saying why it cannot import them. A sonnet session that
> imports `ROOKIE_CORRECTIONS` into `lib/panel.mjs` will red T-RM1 — that is the test working, and
> the fix is the literal, not an exemption.

**Append** a new test, **T-RM14**: the two copies agree. Read `lib/panel.mjs` as **text** (never
import it into an assertion about its imports) and assert each member of `ROOKIE_CORRECTIONS`
appears in it. Text-read keeps T-RM1 green.

### 11 · T-RM10 — state the capture-precision tolerance (flag 11)

`rookieCeilingPPGPre` is captured at 3 dp while the app feeds full precision, so the ≤5e-4 input
error can flip a 1-dp level comparison at a boundary, and a level within 5e-4 of the knee can flip
`rookieCeilingBasis`. **Replace** T-RM10's "exactly" on the ceiling assertion with:

- level: `|round(mirrorCeiled, 1) − projection.projectedPPG| ≤ 0.1`, with the **exact-match count
  pinned** to the observed number so a real divergence moves it;
- basis: asserted exactly, except for rows whose `rookieCeilingPPGPre` is within 5e-4 of the knee,
  which are counted and skipped with the count pinned (expect 0);
- `rookieCeilingKnee` / `rookieCeilingAsymptote`: exact, unaffected by input precision — this is the
  app-constant drift guard and must stay exact.
- total points: `|round(mirrorCeiled × projectedGames, 1) − projectedTotalPts| ≤ 0.1`, per item 1,
  with its exact-match count pinned too.

Name this a documented capture-precision residual in T-F10's style, not a tolerance chosen to pass.

### 12 · §1.1 — the D-10 justification is wrong (flag 12)

Two corrections. `resolveDraftGroup` (`lib/panel.mjs:1909`) already branches on
`draftInfo?.undrafted === true`, so this slice is **not** the first data-side consumer. And the
mirror as specified does not depend on the flag at all: §6.1 deliberately does not port
`resolveDraftCapitalStatus`, taking `draftCapitalStatus` as a parameter, and the app derives
`'undrafted'` from `nflDraftMatchSource` plus `nflDraftYears` membership — never from
`bySleeper.undrafted`.

**Replace** §1.1's D-10 paragraph with the surviving argument: the record is still worth making
because the app's shipped constants were **fitted** on a panel whose `draftGroup` came from that
flag, so a change to the derivation invalidates the constants even though no code in either repo
reads the flag on the live path. Keep it in scope as a `data-catalog.md` record. **Remove** the
dependency claim from the mirror module's docstring (§6.1); the never-join warning stays there,
since that one is genuinely about panel joins.

### 13 · §3 — the guard's reach is imports and declarations only (flag 13)

§3 names its own hole — a caller applying a correction after assembly — and then does not close it.
An inlined literal `0.33` in `scripts/panel-run.mjs` passes (3.1), (3.3) and (3.4), and the demoted
stamp from item 7 never looked at rows.

**Replace** §3's opening claim ("Four extensions ... close the seams") with an honest scope
statement: the extensions close the **import seam** and the **declaration seam**. The **inlining
seam is not closed**, and nothing short of a constant-scan would close it. **Append** a short
"Residual hole" paragraph naming the one real backstop: `§A`'s reproduction pin and D-14's `ceiling`
block both move if a caller silently corrects rows, so the pin is what would catch it — after the
fact, in a verdict a human reads, not in CI.

### 14 · §9.4 → §9.1 — CR-18 fires (flag 14)

The plan edits `data-catalog.md`, a CR-18 data-side trigger, and owes the app-side
`docs/signal-registry.md` note. **Move CR-18 out of §9.4**, quote its `Mirror` text in full in a new
§9.1b, and emit the **exact row edit** the Mirror text demands rather than a one-line description:
layer · source · coverage · reconstructable-vs-ephemeral · current use, for the crosswalk row,
recording that `bySleeper.undrafted` (derived `draftRound === null`) is the population the app's
rookie realisation constants are fitted to. The emitted row is the whole deliverable.

### 15 · §9.4 — CR-11 needs explicit does-not-fire treatment (flag 15)

CR-11's data-side `Triggers` name `lib/panel.mjs` and `lib/projectionFactors.mjs` as whole files and
this slice edits both. **Append** it to §9.4 with its `Mirror` text quoted, and the substantive
finding: no stat key is added, removed, renamed or filtered, so nothing drifts. `Direction: data→app`;
nothing fails in either repo when it does.

### 16 · §9.2 — correct CR-15's whole `Data side` cache, not only the append (flag 16)

**Append** to §9.2's amendment: the same both-repos edit should correct CR-15's stale `Data side`
cache, which omits `predictFullPipeline`, `D6_NEW_FACTORS` / `FULL_FACTORS_D6` /
`ENVELOPE_FACTORS_D6_ADDITIONS`, `assembleRookiePanel` and `rookiePathStateAt` in `lib/panel.mjs`,
and `runFullPipeline` / `runRookiePanels` in `scripts/panel-run.mjs`. The file-level `Triggers`
still cover all of them, so nothing mis-fires today and this is a cache correction rather than a
contract change — but doing it in the same edit avoids a second both-repos session.

### 17 · §0 — record what the review verified, so it is not re-checked

**Append** to §0 a short "Confirmed by plan-reviewer" note: all five corrections held; C5's eight
quantiles were re-derived independently; the CR-15 Mirror quote in §9.1 is byte-identical to
`README.md:1505`–`1748`; `§G` is a free verdict-section letter (`§A`–`§F` are occupied at
`scripts/panel-run.mjs:1956`–`:2076`); the snapshot player block is exactly
`{ nfl_team, status, depthChartOrder, ktc, projection }`, so §4.3's premise holds; and §6.6's
`≤2026-09-08 none` boundary is confirmed too, not only C2's `2026-09-09`–`2026-09-10` row. The suite
stood at 897 passing.
