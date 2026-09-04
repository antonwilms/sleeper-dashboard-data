# S2, slice 7: leave `roster` unconverted — and write down why

**Type:** a decision, plus the two comments that make it durable. **No conversion.**
**No source behaviour change, no served shape, no data, no manifest, no CDN purge.**
**Session model:** plan (opus, this file). Implementation is a separate sonnet session — do not edit
source here.
**Source:** `season-ingest-advstats.md` §11 — the open judgement call. Analysed against live source
2026-09-03 at HEAD `74fe84b`.

> **Recommendation: stop the program at five of six.** Converting `roster` would require adding three
> parameters to `runSeasonKeyedIngest`, **all with exactly one consumer**, including a boolean that
> means "this family's gates run in a different order." That relocates roster's divergence into the
> shared helper instead of removing it — the opposite of what S2 set out to do.
>
> **This is a judgement call and it is reversible.** §2.3 states the case for converting anyway, and
> §6 is the alternative plan if you want it. **This slice should get a reviewer** (slices 3–6 did
> not) precisely because the recommendation is "don't."

**Working-tree note.** `store-audit-2026-08-25.md` is modified and uncommitted. **Do not stage,
commit, revert or edit it.** Nothing here touches it.

---

## 1. Verified facts

### 1.1 · The helper's surface today: 16 parameters, zero flags

`family`, `seasons`, `currentSeason`, `dryRun`, `force`, `deps`, `dataPath`, `derive`,
`gateRowCount`, `minRows`, `validate`, `hash`, `existingHash`, `envelope`, `manifestRecordCount`,
`messages`.

**Every one is either data or a pure callback. There is no flag, and no parameter exists for fewer
than all five consumers.** That is the property that let it absorb `schedule` (fetch-once topology),
`teamcontext` (derive-level assertion), `oline` (destructive validator, pre/post counts), `gamelogs`
(two-stage derive, pre/post counts) and `advstats` (mid-flow third exit) **without a single change
after slice 3**.

### 1.2 · What `roster` would need

Three additions, each with **one** consumer:

| # | need | why the helper cannot express it today |
|---|---|---|
| 1 | **a side-effecting hook on the dedup branch** | `roster` writes `nflverse/last-checked-roster.json` (`identical: true`) when content matches — and logs a *different* message under `--dry-run` without writing. The helper models a dedup hit as a pure `continue`; `messages.dedup` returns a string |
| 2 | **a side-effecting hook after the manifest** | it writes the marker again (`identical: false, file: …`) after a successful write. `afterManifest` **returns a string to log** — it is not a write hook |
| 3 | **`forceGateBeforeDryRun: true`** | `roster` runs the force gate *before* the dry-run exit; the other five run it after. So `roster --year <past> --dry-run` **throws** where its siblings report a plan |

### 1.3 · The marker is a deliberate, documented feature — not incidental

- `README.md:375` — *"A `nflverse/last-checked-roster.json` marker is written on every run (even
  no-change runs) so 'ran, no change' is distinguishable from 'didn't run'."*
- `data-catalog.md:226` — listed with `ktc/last-checked.json` as *"run markers, not data"*.
- **Not manifest-registered** (verified), correctly.
- `CLAUDE.md:325` gives it a rebase rule: *"Watermark files … keep the later timestamp."*
- **No code reads it.** It is an operability signal for humans.

So it cannot be dropped to simplify the conversion, and it is not a defect to clean up.

### 1.4 · The gate inversion is pinned on purpose and is barely reachable

`test/update-roster.test.mjs:112` — *"force gate STILL THROWS under `--dry-run` — the axis-3
characterization"* — exists because slice 1 chose to **characterize, not correct**
(`season-ingest-net.md` §2.2). It is the test that proved the net bites (slice 1 step 5).

**Reachability — more than an earlier draft of this plan claimed.** Two different "smoke" surfaces
exist and they do not agree:

- **`smoke-test.yml`** (the PR workflow) runs six subcommands — `nfl`, `cfbd`, `ktc`, `playerids`,
  `advstats`, `gamelogs`. **No roster.**
- **`npm run smoke`** (package.json, run at the end of *every slice in this program*) runs **twelve**,
  including **`roster --year 2024 --dry-run`** — a *past* season.

So the throw is not confined to a rare manual invocation: **it sits in the command this repo runs as
its standard local gate.** It has never fired only because roster's 2024 content is identical, so the
dedup branch returns before the force gate is reached. **If that season's content ever differed,
every `npm run smoke` here would throw.**

That materially strengthens §5's case that the inversion is a latent bug — and it does **not** change
§2.1, because fixing it removes only divergence #3 and leaves the two impure hooks (§5).

### 1.5 · What conversion would actually buy

Roster's convertible span is steps 4–10: sparsity, validate, dedup, force, dry-run, write, manifest
— about **45 lines**, replaced by roughly a **25-line** config plus the two hooks. **Net saving:
~20 lines in one file, for three new helper parameters.**

---

## 2. The decision

### 2.1 · Do not convert. Close S2 at five of six.

The three additions in §1.2 are not incremental generality — they are **roster-shaped**. A
`forceGateBeforeDryRun` boolean does not describe a dimension families vary along; it says *"this
one is different"*, and the helper then contains two control flows. The two side-effecting hooks
would be the first non-pure callbacks in a surface that is otherwise entirely data and pure
functions, which is the property that made five conversions need **zero** helper changes after
slice 3.

**S2's goal was removing duplicated control flow. `roster`'s control flow is not duplicated — it is
genuinely different in three ways.** Converting it would move that difference from a file where it
is local, commented and covered by eight tests, into a shared helper where it becomes everyone's.

### 2.2 · Reject the tempting shortcut explicitly

The marker writes *can* be smuggled in without new parameters, by doing the write inside
`messages.dedup` and `messages.afterManifest` and returning the log string:

```js
afterManifest: (s, path, o) => { d.writeJsonStable(LAST_CHECKED_PATH, {…}); return '[roster] Wrote …'; }
```

**Do not do this.** It works, it needs no helper change, and it makes every message builder in the
codebase something a reader must check for side effects. It also cannot express the dry-run branch
of the dedup marker without reading `dryRun` from a closure inside a message function.

### 2.3 · The case for converting anyway, stated fairly

- Uniformity has value: six files reading the same way is easier to onboard to than five plus one.
- The gate inversion is arguably a latent bug (§1.4), and putting it behind an explicit helper flag
  makes it visible rather than buried in one script's ordering.
- Three parameters is not a large surface increase in absolute terms.

**Weighed against §2.1, I do not think these carry it** — mainly because the flag encodes an
accident rather than a dimension. But it is close enough that the human should decide, and §6 makes
that cheap.

### 2.4 · Alternatives rejected

| option | rejected because |
|---|---|
| Convert with three new parameters | §2.1 — relocates the divergence; first flag and first impure callbacks in the helper |
| Side effects inside message builders | §2.2 — poisons a contract used by five other families |
| Drop the last-checked marker to simplify | §1.3 — a documented operability feature with a rebase rule |
| Fix the gate ordering, then convert | Still needs both write hooks, **and** it is a behaviour change the net pins deliberately. If it is worth doing, it is worth doing on its own terms (§5) |
| Leave it unconverted and say nothing | The next person re-derives this analysis from scratch. §3 is the whole point of the slice |

---

## 3. The edits

### 3.1 · `scripts/update-roster.mjs` — a header note

Record, in the module header, that `roster` is the **one season-keyed family that does not use
`runSeasonKeyedIngest`**, naming the three divergences (§1.2) with the one-line reason for each, and
pointing at this task file. Without it the file looks like an oversight.

### 3.2 · `lib/seasonIngest.mjs` — a scope note

State in the JSDoc what the helper **deliberately does not support**: side-effecting branch hooks,
and any reordering of the dedup → dry-run → force sequence. Name `roster` as the known non-consumer
and why. This is the note that stops a future contributor adding the flag without reading §2.1.

**No code change in either file.**

### 3.3 · Nothing else

No test changes — roster's eight already characterize it correctly. No registry text. No workflow.

---

## 4. Step order

1. Add §3.1's header note.
2. Add §3.2's scope note.
3. `npm test` → **662**, unchanged. `npm run smoke`.
4. Commit; `git -c rebase.autoStash=true pull --rebase origin main`; push. **No CDN purge.**

---

## 5. The behaviour question, kept separate

**Should `roster --dry-run` throw on a changed past season?** Every sibling reports a plan. A dry run
that can fail is a poor preview, and this is the only family where `--dry-run` is not a safe
read-only probe.

**Not part of this slice**, deliberately. It is a behaviour change, it would flip a test written to
pin current behaviour, and bundling it with a "leave it alone" decision would make both harder to
review. If wanted it is a ~10-line slice of its own: move the dry-run exit above the force gate,
invert `test/update-roster.test.mjs:112` into a "reports a plan" assertion, and note it in the
module header.

**One consequence worth knowing:** doing that would remove divergence #3, leaving only the two write
hooks — which does not change §2.1's conclusion, since those two are the impure ones.

---

## 6. If you want it converted instead

Overruling §2.1 is a self-contained slice, not a redesign:

1. Add `onDedup(ctx)` and **`onAfterManifest(ctx)`** — **side-effecting, returning nothing**,
   distinct from the string-returning `messages.*`. Both default to no-ops, so the five converted
   families are untouched.

   **Name the second one `onAfterManifest`, not `onAfterWrite`.** The helper already has an
   `messages.afterWrite` slot at step **7a — between the write and the manifest update**
   (`lib/seasonIngest.mjs`). Roster's marker write happens **after** `updateManifestEntry`. A hook
   called `onAfterWrite` would sit next to a message builder called `afterWrite` that fires at a
   *different* point, and **neither of step 3's nor step 4's checks would catch the mistake** — the
   eight tests assert `writeJsonStable` and `updateManifestEntry` on separate spy channels with no
   cross-channel ordering assertion, and a dry-run byte-diff never reaches either. If this
   alternative is taken, **add an ordering assertion** to the write-path test first.
2. Add `forceGateBeforeDryRun = false`, honoured in the helper's step sequence.
3. Convert `roster`; its **eight tests must pass unedited**, including `:112`'s axis-3 case — that
   test is the acceptance criterion and it already pins every divergence.
4. Byte-diff `roster --year 2023 --dry-run`.

The net makes this safe. The question is not whether it can be done — it is whether the helper should
carry it.

---

## 7. Done-definition

- [ ] `scripts/update-roster.mjs` header records the exception and its three reasons, pointing here
- [ ] `lib/seasonIngest.mjs` JSDoc records what it deliberately does not support, naming `roster`
- [ ] **No code change in either file** — comments only, verified by `git diff`
- [ ] No test, registry, workflow or served-file change
- [ ] `npm test` = **662**; `npm run smoke` green or the known CFBD 429, stated
- [ ] CR-06 / CR-18 Mirrors emitted (§8); **no registry text edited**
- [ ] `store-audit-2026-08-25.md` still modified-and-uncommitted, untouched

---

## 8. Cross-repo impact

**Two entries fire: CR-06 and CR-18** — CR-06 names `scripts/update-roster.mjs` in its data-side
`Triggers`, and this slice edits that file (comments only); CR-18's brace expansion covers it.

**No change owed on either.** Nothing executes differently.

### CR-06 · roster / draft

> Shape or sparsity-constant changes land in both repos together. **`MIN_ROSTER_IDS` is declared twice** — `lib/nflverse.mjs:18` (data) and `src/api/nflRoster.js:38` (app) — with no shared source; editing one and not the other is the whole failure mode this entry exists for. The app has no live fallback for either family — it must get them from the store.

**No change owed.** `MIN_ROSTER_IDS` is untouched — this slice adds no code at all.

### CR-18 · signal registry / data-catalog

> This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.

**No row edit owed.**

---

## 9. What S2 delivered

| | |
|---|---|
| families through one spine | **5 of 6** |
| helper changes after slice 3 | **zero** — `oline`, `gamelogs` and `advstats` all landed without touching it |
| helper surface | 16 parameters, **no flags, no impure callbacks** |
| tests | 0 → **50** branch-matrix tests across six families, every helper message asserted |
| seams | all six now injectable (`DEFAULT_DEPS`), where four had none |

The audit projected *"~800 lines → roughly 250."* Actual: the control flow is now written once
instead of six times, but per-family configuration is real and the saving is smaller than that. **The
duplication that mattered was never the line count — it was six independently-drifting copies of the
same gate sequence**, which is what produced the eight divergence axes in the first place. Five of
six now cannot drift.

---

## 10. Out-of-scope observations (not edits)

1. **`roster` and `ktc` both keep last-checked markers; `playerstate` does too.** Three of nine
   families answer *"did it run?"* and six do not. Whether that asymmetry is intentional is a
   question for whoever next touches operability, not for this slice.
2. **The two smoke surfaces disagree** (§1.4). `smoke-test.yml` runs six subcommands; `npm run smoke`
   runs twelve. So `roster`, `schedule`, `teamcontext`, `oline`, `draft` and `playerstate` are
   covered locally but **not in the PR gate** — a divergence worth a deliberate decision rather than
   an accident, since the local script is the more thorough of the two.
3. **S2's real output is the net, not the helper.** The 50 characterization tests would still be
   worth having if every conversion were reverted tomorrow; the helper is the smaller half.
