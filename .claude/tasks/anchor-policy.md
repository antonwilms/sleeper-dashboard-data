# Anchor policy — settle who owns the rule, then convert the near side

**Type:** registry policy decision + near-side cache conversion + one recurrence guard.
**No source behaviour change, no data, no manifest, no served shape, no CDN purge.**
**Session model:** plan (opus, this file). Implementation is a separate sonnet session — do not edit
source here.
**Source:** escalated across six slices, most recently `test-determinism.md` §8.3-4. Audit **re-run
from scratch 2026-08-31** at HEAD `28ba2dd` — not inherited from `registry-anchor-reconcile.md`.

> **This supersedes `registry-anchor-reconcile.md`.** That file's audit was taken at `c01d9f0`; five
> slices have landed since, one of which (`test-determinism`) corrected twelve anchors. Its census
> survives re-derivation almost exactly; its **§3.4 does not**, and that is the point of this slice.
> §2.2 explains why amending the format spec was the one instruction that could not legitimately
> originate here. §11 records the delta.

**Working-tree note.** `store-audit-2026-08-25.md` is modified and uncommitted. **Do not stage,
commit, revert or edit it.** Nothing here touches it.

---

## 1. The audit, re-derived at `28ba2dd`

Built with a **field-block parser** (§3.3): walk the mirrored region, accumulate each `- **<Field>:**`
line plus its indented continuation lines into one block, tag by entry and field, and split
`Triggers` at the **first `‖` in the whole block**. Anchor regex accepts every form in use —
`symbol:NNN`, `file.ext:NNN`, bare `:NNN`, ranges `:NNN-NNN`, comma lists `:87,93,148,157`.

### 1.1 · Census

| | data side (near) | app side (far) |
|---|---|---|
| cache-field anchor occurrences | **107** | **136** |
| entries carrying them | **20 of 21** | — |
| …carrying an adjacent symbol | 57 (53%) | **33 (24%)** |
| …carrying **no** symbol | 50 | **103** |

**243 anchors in total; 90 carry a symbol.** Roughly **63% of the registry's line anchors cannot be
verified by anyone** — not by either repo's reviewer, not by a test, not by a human without guessing
what the number was meant to point at.

### 1.2 · Of the 57 verifiable data-side anchors, 29 are stale

Resolved against live `lib/`/`scripts/`/`bin/`:

| | count |
|---|---|
| resolve correctly | **28** (23 definition anchors + 5 statement anchors, §1.3) |
| **stale** | **29** |

Whole-file sweeps: **all 8 of CR-18's `lib/nflverse.mjs` parser/aggregator anchors are +9**, and its
four `MIN_*_SEASON` constants are +9 too — one ordinary insertion, twelve anchors invalidated.
`lib/validate.mjs` has drifted unevenly (`validateAdvStats` +37, `validateTeamContext` +103), which
is the accumulated-drift signature rather than a single commit's.

**The prior audit said 33 stale / 24 correct.** The improvement is not decay reversing itself — it is
`test-determinism` having just fixed twelve anchors under reviewer pressure. That is the treadmill
stated as data: a dedicated slice, a review round and a two-repo commit bought a **4-anchor net
reduction in staleness**, against 29 remaining and 50 unverifiable.

### 1.3 · Two anchor semantics, both legitimate — which is why no test can check them

`aggregateWeeks:231` is a **definition** anchor; `aggregateWeeks:297` is a **statement** anchor
pointing at the `Object.entries(stats)` loop *inside* it. Both re-verified live and both correct.

A definition-resolver flags `:297` as stale five times over. A resolver that accepts either cannot
tell a correct statement anchor from a drifted one. **This is not a fixable test-design problem** —
it is why §5's guard asserts symbols and never lines.

### 1.4 · Anchors have silently retargeted onto plausible, wrong code

Re-verified live, all still true:

| anchor | registry claims | live at that line |
|---|---|---|
| `scripts/update-nfl.mjs:93` ×**6** | **the writer** | `d.setManifestInProgress({ … inProgress: false })` — D-5's *seal* |
| `lib/panel.mjs:191`, `:206` | snap/RZ key consumers | `}` — closing braces |
| `lib/backtest.mjs:225` | snap/RZ key consumer | `export function spearman(xs, ys)` — unrelated |
| `lib/panel.mjs:874` | `RZ_CONFIG`-equivalents | a comment that itself cites other line numbers |

The real writer is `d.writeJsonStable(dataPath, totals, { minify: true })` at `scripts/update-nfl.mjs:158`
— **65 lines from where six entries point.** A stale anchor that still resolves is worse than a
dangling one: it reads as confirmation.

### 1.5 · The app side is materially worse, and this repo cannot fix it

**103 of 136 app-side anchors carry no symbol** — bare `:146`, `:87,93,148,157`,
`src/utils/gameLog.js:130-160`. Re-deriving them means reading `src/`, which the registry's own
design forbids this repo's reviewer from doing and which no data-side session can verify.

**This is the fact that shapes the policy.** A rule the data repo cannot apply to the app side is a
rule the data repo cannot land as a global norm — see §2.2.

### 1.6 · The spec never authorized line numbers in the first place

From the entry-format definition, inside the mirrored region, unchanged:

> **`Triggers`** … Triggers are always concrete paths, exported symbols, constant names or served
> JSON paths — **never a category**.

Symbols and constant names. Its own worked example — `lib/nflverse.mjs MIN_SCHEDULE_GAMES` — carries
no number. The generic-path case is blessed in prose, not by an anchor:

> Where a value flows through a generic path that never names it … the **loop** is the trigger.

**Line numbers accreted by convention against the spec, not under it.** That single fact is what
makes this slice possible without a normative change (§2.2).

---

## 2. The policy

### 2.1 · The decision

**Strip `:NNN` from data-side cache fields. Keep — and where absent, re-derive — the symbol. Convert
the near side only. Amend nothing normative.**

Two halves, because "strip the number" is only mechanical where a locator survives it:

- **Rule A — an adjacent symbol exists → drop the number, keep the symbol.** The **57**
  symbol-carrying anchors.
- **Rule B — no symbol → re-derive one from what the entry *describes*.** The **50** symbol-less
  anchors: 25 bare, 15 file-only, 10 ranges. A bare filename counts as symbol-less — the spec calls
  it a *category*. **Never re-derive by following the number** — §1.4 shows they land on closing
  braces.

### 2.2 · Why no spec amendment — the ownership question, settled

`registry-anchor-reconcile.md` §3.4 instructed amending the `Triggers` bullet to say triggers name
symbols, not line numbers. **That instruction cannot legitimately originate in this repo, and it is
also unnecessary.**

**Cannot:** `README.md` states it plainly — *"`sleeper-dashboard` owns the format definition; this
repo mirrors it exactly."* The app's own `CLAUDE.md:227` hosts the definition. And CLAUDE.md's only
route out of the in-repo loop is *"a brand-new cross-repo coupling not yet present in the registry"*
— explicitly **not** this, since *"extending an existing entry is not this case and stays in-repo."*
A normative amendment to app-owned shared prose falls in the gap between those two, and the honest
reading of a gap is that the owner decides.

**Worse, it would be false on arrival.** A spec saying "triggers name symbols, not line numbers"
would be violated by **136 app-side anchors** the moment it landed — 103 of which this repo cannot
convert (§1.5). Landing a norm you have already made unsatisfiable is not a policy; it is a debt
transfer with a rule attached.

**Unnecessary:** §1.6 — the spec already requires symbols and constant names. **Stripping the numbers
returns the registry to its existing spec rather than changing it.** No new normative prose is
needed, so the ownership question does not have to be answered at all to do this work.

**So the policy is near-side and self-executing:** each repo's near-side list is that repo's to
maintain — the spec already says the reviewer *"re-verifies it against live source on every review"*
— and this slice does the data repo's half under the rule that already exists. The app side gets a
measured, evidenced handoff (§6), not an imposed norm.

### 2.3 · Scope boundary

| touched | untouched |
|---|---|
| `Data side` blocks | `App side`, `Invariant`, `Mirror`, `Direction` |
| data side of `Triggers` (right of the first `‖`) | app side of `Triggers` (left of `‖`) — **frozen authority** |
| — | **all 11 contract-text anchors** (§3.4) |

### 2.4 · Alternatives rejected

| option | rejected because |
|---|---|
| **Refresh the 29 stale numbers** | §1.2 — a whole slice bought a net −4 last time. The next insertion re-breaks them, and it does nothing for the 50 unverifiable ones. |
| **Anchors + a test asserting line numbers** | Turns every insertion above an anchor into a red test needing a synchronized two-repo edit — a tax on routine work, protecting a field the spec never asked for. It cannot distinguish §1.3's two semantics, and cannot check the 50 symbol-less anchors at all. |
| **Amend the spec / convert both sides** | §2.2 and §1.5. Not this repo's to author, and 103 app-side anchors are un-re-derivable from here. |
| **Do nothing until the app converts too** | Blocks a self-contained, in-spec near-side improvement on a repo that has not been asked yet. §6 asks it. |

---

## 3. The edits — registry, both repos, byte-identical

`README.md` and the app's `docs/cross-repo-registry.md` are byte-identical across the mirrored region
today (verified: 228 lines, 67,327 bytes). **They must stay so** — this is a far-side correction for
the app's reviewer, and the both-repos-same-change rule is the only thing keeping it honest.

### 3.1 · Rule A — drop the number, keep the locator

| before | after |
|---|---|
| `` `lib/nflverse.mjs` `MIN_SCHEDULE_GAMES:45` `` | `` `lib/nflverse.mjs` `MIN_SCHEDULE_GAMES` `` |
| `` `normalizeTeamForSchedule` at `:25` (writes the per-season `team`) `` | `` `normalizeTeamForSchedule` (writes the per-season `team`) `` |
| `` `aggregateWeeks:297` `` (the loop) | `` the `Object.entries(stats)` loop in `aggregateWeeks` `` |
| `` `validateGameLogs:503` `` | `` `validateGameLogs` `` |

§1.3's statement anchors become **prose**, which is what the spec's generic-path bullet already
prescribes. Nothing is lost: the loop is named, and it greps.

### 3.2 · Rule B — re-derive, never delete

Deleting a naked list leaves `` `lib/panel.mjs` () `` — a bare filename for a 1,300-line module,
which the spec calls a *category* and forbids.

| entry | naked anchors | re-derive by |
|---|---|---|
| **CR-11** | `lib/panel.mjs` ×6, `lib/backtest.mjs` ×3 | grepping both files for the entry's own five keys (`off_snp`, `tm_off_snp`, `rec_rz_tgt`, `rush_rz_att`, `pass_rz_att`) and naming the **enclosing functions**. Live hits confirm these exist — `lib/panel.mjs:181`, `:916`, `:1136`, `:878`; `lib/backtest.mjs:242-243`, `:290-292`, `:301-314`. Name the functions, not these numbers. |
| **CR-01** | `scripts/grade-snapshot.mjs` envelope reads ×3 | name the functions reading `targetSeason` / `currentSeason` / `scoringSettings`. **These three were re-anchored six days ago** (`:177`/`:241`/`:326`) and are correct today — which is exactly why they should stop being numbers. |
| **6 entries** | `scripts/update-nfl.mjs:93` "the writer" | the writer is **`writeJsonStable` at `scripts/update-nfl.mjs:158`** (§1.4). Replace all six with a symbol-bearing description — *the `writeJsonStable` call in `updateNfl`* — **not** with `:158`. |

### 3.3 · CR-19 is hard-wrapped, and a line-scoped edit cannot reach it

**CR-19 is the only *entry* with indented continuation lines** (re-verified across all 21; the
format-spec's `CR-NN` template block also wraps, but it is not an entry and carries no anchors). Its
`Data side` and `Triggers` wrap onto two-space-indented lines and its `‖` sits mid-continuation, so a
line-scoped rule silently misses 8 data-side anchors.

**The naive fix is dangerous:** CR-19's `App side` also wraps, carrying six **frozen** anchors
(`sackPct:597`, `ayPerAtt:598`, `yac:605`, `btkl:606`, `drops:616`,
`src/utils/outlookPositionStats.js:128`). "Also process continuation lines" strips those.

**Required: parse field blocks, edit within the block, split `Triggers` at the block's first `‖`.**
This is the same hazard that defeated `grep -m1` in `rate-keys-lng` and again in
`test-determinism`'s review — third occurrence, same entry.

### 3.4 · Contract-text anchors must survive untouched

**11 anchors across 6 entries sit in `Mirror`/`Invariant`, not cache fields:** CR-02 (`:4`,
`:130-160`), CR-05 (`:69-124`, `:57-59`), CR-06 (`:18`, `:38`), CR-14 (`:29`), CR-15 (`:110`),
CR-16 (`:21`, `:13`). Editing contract text is a different act with different obligations — leave
every one.

**The find-and-replace trap, counted at current HEAD:** the `RATE_KEYS` anchor occurs **7** times —
**six in cache fields** (CR-11/12/13 `Triggers`; CR-14 `Data side`, in the bare `RATE_KEYS:29` form
with no filename; CR-19 `Data side` *and* `Triggers`) and **once in contract text** (CR-14 `Mirror`).
A global replace edits that `Mirror` and silently falsifies §8's argument. **Strip the six; leave
CR-14's `Mirror`.** Same shape for `scripts/update-nfl.mjs:93` (6 occurrences) and `findNonFinite:69`
(3).

Note the two spellings — `` `lib/fantasyPoints.mjs:29` `` and the bare `` `RATE_KEYS:29` `` — so a
pattern matching only the filename form misses CR-14's `Data side`. That exact miss happened in the
`test-determinism` review.

> The prior audit counted 6 occurrences with one in contract text, at `:21`. It is now 7 at `:29`,
> still one in contract text. **Re-count at implementation time; do not trust this paragraph either**
> — it has been wrong once already in this very file (§11).

---

## 4. Substantive cache corrections owed in the same pass

Deferred backlog. All cache fields, so they ride along. **Re-verify each against live source — do not
copy from the task files that recorded them**; two earlier slices shipped anchors copied from stale
lists.

| entry | correction |
|---|---|
| **CR-04** | add **`setManifestInProgress`** (`lib/manifest.mjs`) — a third live manifest writer |
| **CR-04** | add **`scripts/migrate-manifest-truth.mjs`** and **`scripts/migrate-drop-cfbd-raw.mjs`** — both write `manifest.json` directly via `writeJsonStable` after editing `manifest.files` in place, bypassing `updateManifestEntry`. The first rewrote 38 entries |
| **CR-07** | add **`AY_PER_TARGET_MIN`/`AY_PER_TARGET_MAX`** (`lib/nflverse.mjs`) — the ingest-blocking band, currently unnamed |
| **CR-07** | add **`aggregateAdvReceiving`** (`lib/nflverse.mjs`) — the **producer** of the served shape CR-07's own `Invariant` describes, absent from its own triggers |
| **CR-07** | add the four live consumers: `scripts/backtest-run.mjs`, `lib/backtest.mjs`, `scripts/panel-run.mjs`, `lib/panel.mjs` |

---

## 5. The recurrence guard — assert symbols, never lines

New `test/registry.test.mjs`:

> **Every symbol named in a data-side cache field resolves in the file the entry names.**

Two design constraints, both load-bearing:

1. **Accept every trigger form the spec authorizes.** Live data-side triggers legitimately include
   served-path templates (`nflverse/advstats/<year>.json`), globs (`enrichment/*.json`), brace
   expansions (`scripts/update-{nfl,cfbd,…}.mjs`), the blessed generic-loop trigger
   (`` `Object.entries(stats)` ``) and prose backticks (`idp_*`, `TEAM_*`, `inProgress`). A resolver
   that reds on these would push the next session toward **deleting spec-authorized triggers**.
   Recognise and skip non-symbol forms; assert only on identifiers claiming to be symbols.
2. **Resolve against the file the entry names, not the whole tree.** A tree-wide grep passes when a
   symbol is deleted from its own file but exists elsewhere. Live instance: **`STATS_BASE` is
   declared in both `lib/sleeper.mjs` and `lib/nflverse.mjs`**, and CR-09's trigger is specifically
   *"`STATS_BASE` in `lib/nflverse.mjs`"*.

**Why this guarantee:** it reds exactly when a symbol is **renamed, moved between files, or deleted**
— each a registry-worthy event — and stays green through every insertion, refactor and reordering.
It is the reviewer's standing duty, automated. **Data side only**; the app side names `src/` symbols
this repo cannot resolve, and §1.5 is why that asymmetry is correct rather than a gap.

Expect failures on first run. **Fix the registry, not the test**, and record what it surfaced in the
commit message.

---

## 6. The app-side handoff

The app side is worse (§1.5) and this repo cannot convert it. **An unrecorded ask is a lost one** —
the app's own `CLAUDE.md:250` says so about the reverse direction.

**There is no data→app ask channel, and the reason is structural:** the app repo **tracks**
`.claude/tasks/` (that is how `data-repo-backlog.md` survives), while **this repo gitignores
`.claude/` entirely** — so no durable ask can live on this side. That asymmetry is why the channel
exists in one direction only.

**Write the ask into the app repo's tracked task directory** as
`.claude/tasks/registry-anchor-appside.md`, carrying: the 136/33/103 split, the field-block parser,
the Rule A/B formulation, this slice's commit as precedent, and the explicit statement that **the
data repo is not asking for a spec amendment** — the app owns that call and may reasonably decide
line anchors are worth keeping on a side whose reviewer *can* read `src/`.

**Do not** edit the app's `CLAUDE.md`, and **do not** add normative prose to the mirrored region.
One task file, self-contained.

---

## 7. Step order

1. **Write the field-block parser and audit resolver first; commit its baseline output.** It is both
   the measurement and §5's engine. Everything downstream is checked against it.
2. Capture **app-side anchor count = 136** with that parser *before* any edit. This is the gate.
3. Rule A across all 20 entries (§3.1), block-scoped.
4. Rule B re-derivations (§3.2) — CR-11, CR-01, and the six `update-nfl.mjs:93` sites.
5. §4's substantive corrections.
6. **Verify by count, not by label:**
   - data-side cache-field anchors: **107 → 0**
   - **app-side anchors: 136 → 136**, same parser, asserted equal
   - `git diff` shows no change inside any `App side`/`Invariant`/`Mirror`/`Direction` **block** —
     block-scoped, so CR-19's unlabelled continuations are covered
   - all **11** contract-text anchors (§3.4) still present
7. Add §5's test; fix what it surfaces **in the registry**.
8. Apply the identical mirrored-region change to the app's `docs/cross-repo-registry.md`.
9. **Anchored drift check — must report no output:**
   ```sh
   diff <(sed -n '/^<!-- CR-REGISTRY-BEGIN -->$/,/^<!-- CR-REGISTRY-END -->$/p' docs/cross-repo-registry.md) \
        <(sed -n '/^<!-- CR-REGISTRY-BEGIN -->$/,/^<!-- CR-REGISTRY-END -->$/p' ../sleeper-dashboard-data/README.md)
   ```
   **Anchored form only.** An unanchored match sweeps in the registry's own inline sentinel mentions
   and reports a false divergence — this cost a round during `test-determinism` verification.
10. Write §6's app-side task file.
11. `npm test` (baseline **580** tests / 62 suites, + new), `npm run smoke`.
12. Two commits, landing together:
    data — `docs: registry data-side triggers name symbols, not line numbers (+ CR-04/CR-07 corrections)`
    app  — the mirrored-region change plus the §6 task file.
13. `git -c rebase.autoStash=true pull --rebase origin main`, then push, **in each repo**. The
    autostash form is required here, not optional: the tree carries the uncommitted audit file and
    `rebase.autoStash` is unset. No CDN purge — no served file changes.

---

## 8. Cross-repo impact

**No entry's `Mirror` text is owed.** The Rule fires when a change touches an entry's listed
triggers. **No entry's data-side `Triggers` names `README.md`, `docs/cross-repo-registry.md`, or any
test file** — and those are exactly what this slice edits. On the registry's own test, it touches no
entry.

**That is the reason — not "trigger lists are cache, so they're outside the contract."** The spec
refutes that directly:

> **The near side of `‖` is a maintained cache.** … That does not make the near side low-stakes: **it
> is the *far*-side authority for the sibling repo's reviewer, which cannot read this side's live
> source at all.**

The data-side list is simultaneously this repo's cache **and the app repo's frozen authority**. Two
consequences:

1. **Steps 8–9 are the mechanism the spec depends on**, not tidiness. Far-side triggers *"are kept
   correct by the both-repos-same-change rule — never by re-deriving them at review time."* Landing
   this in one repo only would leave the app's reviewer holding an authority this repo had abandoned.
2. **The drift check cannot catch what this slice is about.** It verifies the two copies agree with
   *each other*, not that either agrees with source — it passes happily on two identically-wrong
   registries, which is the state that produced this slice. §5's test is the first check of the
   second kind, and it exists only on the data side.

---

## 9. Done-definition

**Audit & strip**
- [ ] Field-**block** parser written (handles CR-19's continuations); baseline output committed
- [ ] Data-side cache-field anchors: **107 → 0**
- [ ] App-side anchors **136 → 136**, measured with the same parser before and after
- [ ] No diff inside any `App side`/`Invariant`/`Mirror`/`Direction` block, CR-19's unlabelled
      continuations included
- [ ] All **11** contract-text anchors intact (§3.4), CR-14's and CR-19's `Mirror` among them

**Rule B**
- [ ] CR-11's `lib/panel.mjs` ×6 / `lib/backtest.mjs` ×3 replaced with **enclosing-function symbols
      re-derived from the five keys** — not from the stale numbers
- [ ] CR-01's three envelope reads replaced with symbols
- [ ] All **6** `update-nfl.mjs:93` sites name the real writer (`writeJsonStable` in `updateNfl`),
      **without** substituting `:158`
- [ ] **No bare filename left standing alone** in any data-side trigger list

**Corrections**
- [ ] CR-04 gains `setManifestInProgress`, `migrate-manifest-truth.mjs`, `migrate-drop-cfbd-raw.mjs`
- [ ] CR-07 gains `AY_PER_TARGET_MIN`/`MAX`, `aggregateAdvReceiving`, the four consumers
- [ ] Each re-verified against live source, not copied from §4

**Guard**
- [ ] `test/registry.test.mjs` added; resolves **against the file the entry names**; skips
      spec-authorized non-symbol forms
- [ ] Verified it would catch `STATS_BASE` deleted from `lib/nflverse.mjs` while surviving in
      `lib/sleeper.mjs`
- [ ] First-run failures fixed **in the registry** and recorded in the commit message

**Policy boundary**
- [ ] **The entry-format definition is byte-unchanged** — no normative prose added anywhere
- [ ] App-side task file written to the app repo's **tracked** `.claude/tasks/`
- [ ] App's `CLAUDE.md` **not** edited

**Landing**
- [ ] Anchored drift check reports **no output** after both repos land
- [ ] `npm test` green (**580** baseline + new); `npm run smoke` green
- [ ] Both repos committed and pushed; no CDN purge; no data or manifest change
- [ ] `store-audit-2026-08-25.md` still modified-and-uncommitted, untouched

---

## 10. Settled decisions

- **Drop line numbers rather than refresh** (§2.4) — last slice's dedicated effort bought a net −4
  against 29 stale and 50 unverifiable.
- **No spec amendment** (§2.2) — the app owns the format definition; the existing spec already
  requires symbols, so stripping *returns to* the spec; and a symbols-only norm would be violated by
  136 app-side anchors on arrival.
- **Near side only** (§2.3) — 103 of 136 app-side anchors need `src/` to re-derive.
- **Rule B re-derives rather than deletes** (§3.2) — a bare filename is a category, which the spec
  forbids; and the stale numbers cannot be followed, since they point at braces.
- **No line-number test** (§2.4) — it would tax every routine insertion with a two-repo edit and
  cannot distinguish §1.3's two anchor semantics.
- **Symbol-existence test, file-scoped and form-aware** (§5).
- **Block-scoped editing** (§3.3) — the only approach that reaches CR-19 without eating frozen anchors.
- **No Mirror emissions — because no trigger names these files** (§8), *not* because trigger lists sit
  outside the contract.
- **The app-side ask lives in the app repo** (§6) — this repo gitignores `.claude/`, so it cannot hold
  a durable ask.

---

## 11. What changed since `registry-anchor-reconcile.md`

| | that file (`c01d9f0`) | here (`28ba2dd`) |
|---|---|---|
| data-side anchors | 107 / 20 entries | **107 / 20** — unchanged |
| stale (of the symbol-carrying) | 33 | **29** |
| resolve correctly | 24 | **28** |
| app-side anchors | "not v1's 21" | **136**, split **33 / 103** |
| `RATE_KEYS` anchor | `:21`, 6 occurrences, 1 in contract text | **`:29`, 7 occurrences, 1 in contract text, in two spellings** |
| spec amendment | **instructed** (§3.4) | **rejected** (§2.2) |
| app-side handoff | "flagged" as an observation | **a written task file** (§6) |

**The one substantive reversal is the spec amendment**, and it matters beyond this slice: that
instruction would have had a data-repo session write normative prose into a definition the app repo
owns, creating 136 instant violations it had no power to fix. The measurement that exposed it — the
33/103 app-side split — is one nobody had taken, in a file whose whole subject is unverified numbers.

---

## 12. Out-of-scope observations (not edits)

1. **The app side is the larger problem and is now measured.** 136 anchors, 76% symbol-less, in the
   half of the registry whose reviewer *can* read its own source. §6 hands it over with evidence
   rather than an instruction.
2. **`lib/validate.mjs` drift is accumulated, not single-commit** (+37, +103 across its anchors),
   unlike `lib/nflverse.mjs`'s clean +9 — it is where an anchor-style regression would be least
   visible if anchors were kept.
3. **Three consecutive slices have now been caught by CR-19's hard wrap** (`rate-keys-lng`'s
   `grep -m1`, `test-determinism`'s review, §3.3 here). It is the only wrapped entry, and every
   line-oriented tool aimed at the registry fails on it the same way. After this slice the parser
   exists; the next registry task should use it rather than rediscover the trap.
4. **The unanchored-sentinel false positive** (§7 step 9) cost a verification round this week. The
   registry warns about it in its own prose three lines above the canonical command — which is
   itself an argument for tools over conventions.
