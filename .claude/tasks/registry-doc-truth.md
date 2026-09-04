# Registry & documentation truth (audit C8)

**Type:** documentation-only correction, **one commit per repo**, landing together. No code, no data,
no manifest change.
**Session model:** plan (opus, this file). Implementation is a separate sonnet session — do not edit
source here.
**Source:** `store-audit-2026-08-25.md` C8, queue row 4. Every claim below was **re-verified against
live source on 2026-08-28**, not taken from the audit.

**Why this slice is first.** Three of the four drifts sit in the documents the plan-reviewer subagent
treats as *sole authority* (`README.md`'s registry, `CLAUDE.md`'s Invariants, and — newly found here —
the subagent's own instructions). Until they are corrected, every later slice in the audit queue is
reviewed against a document that is wrong about which contracts exist. This slice is ~30 minutes and
cannot break `smoke` or `test`.

---

## 1. Verified facts

Each drift re-derived at HEAD `5da6085` (working tree clean).

| # | Claim | Live check | Verdict |
|---|---|---|---|
| C8a | `README.md:1184` (CR-09 Mirror) says *"2019 is absent upstream (known gap; degrades to the empty shape)"* | `nflverse/gamelogs/2019.json` exists on disk (7.86 MB), **5,756 game rows across 586 players**, `schemaVersion: 1`, `generatedAt: 2026-07-03T19:14:46.154Z`; registered in `manifest.json` with `recordCount: 5756`, `lastModified: 2026-07-03T19:14:46.208Z` | **reproduces — false claim** |
| C8b | `data-catalog.md:220` heads the non-served list *"(no manifest entries, not app-consumed)"*, and `:224` lists `raw/` under it | `manifest.json` holds **14 `raw/*` entries** | **reproduces — false for the `raw/` bullet only** |
| C8c | `CLAUDE.md` has two invariants numbered **8** | `CLAUDE.md:239` (CDN purge URLs) and `CLAUDE.md:241` (grading never recomputed) | **reproduces** |
| C8d | `CLAUDE.md:247` (data) and app `CLAUDE.md:227` say *"all 18 `CR-NN` entries"* | `grep -c '^#### CR-[0-9]'` → **21** in `README.md`; **21** in `../sleeper-dashboard/docs/cross-repo-registry.md`. Highest entry: CR-21 | **reproduces in both repos** |

**Mirrored-region state (must stay true).** `README.md:1086–1313` and the app's
`docs/cross-repo-registry.md:19–246` are **currently byte-identical, 228 lines**, verified with the
anchored diff from `CLAUDE.md`'s own drift check:

```sh
diff <(sed -n '/^<!-- CR-REGISTRY-BEGIN -->$/,/^<!-- CR-REGISTRY-END -->$/p' docs/cross-repo-registry.md) \
     <(sed -n '/^<!-- CR-REGISTRY-BEGIN -->$/,/^<!-- CR-REGISTRY-END -->$/p' ../sleeper-dashboard-data/README.md)
```

Use the **anchored** form (`/^…$/`). An unanchored range match sweeps in the inline backticked
sentinel mentions at `docs/cross-repo-registry.md:15` and reports drift that is not there.

---

## 2. A fifth edit site the audit does not name

`.claude/agents/plan-reviewer.md:27` currently reads:

> Read the `## Invariants` section of `CLAUDE.md` (the nine numbered Invariants at `CLAUDE.md:215-237`
> — note CLAUDE.md has two invariants numbered 8, so cite by name as well as number to avoid
> ambiguity) before judging …

Two problems, both created or exposed by C8c:

1. The duplicate-8 caveat becomes **obsolete** the moment the renumber lands. Leaving it in tells the
   reviewer to work around a defect that no longer exists.
2. The line anchor `CLAUDE.md:215-237` is **already wrong** at HEAD — the `## Invariants` heading is
   at `:217` and the nine entries run `:219–241`.

This file is not covered by C8's four rows, but it is the subagent's own instruction sheet and it
goes stale in the same edit. It is in scope here.

---

## 3. The edits

**12 edits across 6 files in two repos** — 8 here, 4 in the app. Each is a literal text replacement;
none is a rewrite.

| Repo | File | Edits |
|---|---|---|
| data | `README.md` | 3 — §3.1a Mirror sentence, §3.1b validator anchor, §3.1c Triggers append |
| data | `data-catalog.md` | 2 — §3.2 heading + `raw/` bullet |
| data | `CLAUDE.md` | 2 — §3.3 renumber, §3.4 count |
| data | `.claude/agents/plan-reviewer.md` | 1 — §3.5 |
| app | `docs/cross-repo-registry.md` | 3 — mirrors of §3.1a/b/c |
| app | `CLAUDE.md` | 1 — count |

### 3.1 · CR-09 — three edits, all INSIDE the mirrored region

Review added 3.1b and 3.1c (both `[registry-stale]`). They are folded in here rather than deferred:
this slice already opens CR-09 in both repos for a synchronized mirrored-region edit, so correcting
the entry's stale data-side facts in the same pass costs one coordination round instead of two.

**3.1a · `README.md:1184` — the Mirror's trailing sentence**

- **Remove:** `2019 is absent upstream (known gap; degrades to the empty shape).`
- **Insert:** `2019 was backfilled on 2026-07-03 (5,756 rows across 586 players) and is no longer a gap; the family is complete 2012–2025.`

Leave every other clause of that Mirror untouched — it is one sentence in a long field.

**3.1b · `README.md:1180` — stale validator anchor**

CR-09's `Data side` reads `` `lib/validate.mjs` `validateGameLogs:467` ``. Live:
`lib/validate.mjs:503`. Replace `validateGameLogs:467` with `validateGameLogs:503`.
(`MIN_PLAYERGAME_ROWS:48` in the same field is **correct** — verified live at `lib/nflverse.mjs:48`.
Do not touch it.)

**3.1c · `README.md:1183` — Triggers omit the producer path**

CR-09's data-side `Triggers` (right of `‖`) name `scripts/update-gamelogs.mjs`,
`MIN_PLAYERGAME_ROWS`/`parsePlayerGameLogs`/`rekeyGameLogsBySleeper`, and `validateGameLogs` — but
not the fetch path the family is actually built on. Append to the data side of that list:

`, fetchPlayerStatsCsv / STATS_BASE in lib/nflverse.mjs (:412 / :69 — the shared stats_player release path; the STATS_BASE tag-switch is what closed the 2019 gap on 2026-07-03)`

This is materially relevant to this slice, not incidental bookkeeping: `STATS_BASE` is the exact
mechanism by which the gap corrected in 3.1a closed.

> ⚠️ All three edits are inside `CR-REGISTRY-BEGIN`/`END` (`README.md:1086–1313`). The **identical**
> three edits must land in the app repo's `docs/cross-repo-registry.md` (Mirror at `:117`, Data side
> and Triggers in the same entry) in the same change, or the byte-identity check in §1 fails. See §5.

### 3.2 · `data-catalog.md:220` + `:224` — the `raw/` classification

The parenthetical is true for four of the five bullets and false only for `raw/`. Fix it at both ends
rather than deleting the useful classification:

- **`:220`** — replace `Outside the catalog contract (no manifest entries, not app-consumed):`
  with `Outside the catalog contract (not app-consumed; unregistered except where noted):`
- **`:224`** — in the `raw/` bullet, after `…CFBD player manifests, 14 files)`, insert:
  `These 14 are registered in `manifest.json` (the only entries in this section that are) but are not a served family.`

**Write it count-durable.** Audit item E1 (queue row 6) deletes the eight `raw/cfbd-players-*.json`
files and their manifest entries; the surviving statement *"registered in manifest.json"* stays true
at six entries. The literal `14 files` count in the same bullet is E1's to update — flag it there, do
not pre-empt it here.

### 3.3 · `CLAUDE.md:241` — renumber the second invariant 8 → 9

Change the leading `8.` at `:241` (**Grading reads are never recomputed**) to `9.`

**Renumber the second, not the first — this is load-bearing.** **Six** live references to invariant 8
exist, and **all six point at the first 8** (the CDN-purge / season-output rule):

| Site | Text |
|---|---|
| `CLAUDE.md:314` | "(Invariant 8's workflows)" |
| `schedule-ingest-guide.md:192` | "CLAUDE.md invariant 8" |
| `scripts/update-nfl.mjs:76` | "surfaces the resolved season to the Actions purge step, per Invariant 8" |
| `.github/workflows/nflverse-schedule.yml:38` | "(setStepOutput) and CLAUDE.md invariant 8" |
| `.github/workflows/nflverse-oline.yml:38` | "SEASON from the node step (Invariant 8)" |
| `.github/workflows/weekly-playerstate.yml:38` | "exempt from the Invariant 8 season-output rule" |

Renumbering the second entry leaves all six correct with **zero collateral edits**. Renumbering the
first would silently invalidate all six — including three CI workflow comments and one live source
comment.

> **Sweep method matters here.** An earlier draft of this section reported only *one* reference,
> because the sweep was `grep "Invariant [0-9]" --include="*.md"` — case-sensitive, Markdown-only. It
> missed every lowercase spelling and every `.mjs`/`.yml` hit. The correct sweep is
> `grep -rni "invariant 8"` across `*.md`, `*.mjs`, `*.yml`, `*.js`. Session 2: re-run the
> case-insensitive form before editing and confirm the table above still holds.

### 3.4 · `CLAUDE.md:247` — the entry count (data repo)

Replace `the entry-format definition and all 18 `CR-NN` entries` with
`the entry-format definition and all 21 `CR-NN` entries`.

### 3.5 · `.claude/agents/plan-reviewer.md:27` — reviewer instructions

Replace `the nine numbered Invariants at `CLAUDE.md:215-237` — note CLAUDE.md has two invariants
numbered 8, so cite by name as well as number to avoid ambiguity`
with `the nine numbered Invariants under that heading`.

Drop the duplicate-8 caveat entirely; keep the surrounding "read it, do not rely on memory" instruction.

**Drop the line range, do not update it.** Review's call, and it is right: the sentence already names
the `## Invariants` heading, which is a durable anchor that survives every future edit. The numeric
range has already drifted once (`215-237` was wrong at HEAD before this slice touched anything);
replacing it with `219-241` only resets the clock on the same defect. A heading reference cannot go
stale.

### 3.6 · App repo — two edits, same change

Not editable from this repo. Emitted as mirror instructions in §5:

- `docs/cross-repo-registry.md:117` — the identical CR-09 sentence replacement from §3.1
- `CLAUDE.md:227` — `all 18 `CR-NN` entries` → `all 21 `CR-NN` entries`

---

## 4. Ordering

1. **§3.1 and §3.6's registry edit are one atomic pair.** Land them together or the drift check fails.
   Everything else is independent and order-free.
2. This slice should land **before** the rest of the audit queue, for the reason in the header.
3. `git pull --rebase origin main` before pushing (CLAUDE.md → Session git workflow). No data files
   are touched, so **no CDN purge is owed** and no `manifest.json` union-resolve is expected.

---

## 5. Cross-repo impact

**Two registry entries fire: CR-09 and CR-18.** An earlier draft claimed only CR-09; review caught
CR-18 and is correct — `data-catalog.md` is the **first item** in CR-18's data-side `Triggers` (right
of `‖`), and §3.2 edits it.

Both Mirror texts are reproduced below **exactly as they appear in live `README.md`**, each on a
single unwrapped line inside a fenced block. Do not reflow them: an earlier draft presented a
line-wrapped blockquote as "verbatim", which silently inserted a space inside
`` `pacr`/`passingCpoe` `` — in a document whose whole subject is a byte-identity-checked region.

### CR-09 · nflverse gamelogs (view-only) — `Direction: both`

Fires because §3.1a–c edit the entry itself.

**Mirror (live `README.md:1184`, verbatim):**

```text
Shape or floor changes land in both repos together. The per-game `week` and `team` keys are load-bearing beyond display: `resolvePlayerTeam`'s week-grain path matches on `g.week === week` and reads `g.team`, and returns `null` rather than throwing — renaming either key empties every week-grain team join **silently**. Per-game `team` is the **current-franchise** domain in all seasons and is era-remapped app-side (CR-16); do not "fix" it to era-accurate upstream without changing both repos. Per-game rate fields (`racr`/`targetShare`/`airYardsShare`/`wopr`/`pacr`/`passingCpoe`) are single-game values and must never be summed — `passingCpoe` specifically is now also attempt-weighted by a second consumer (`seasonEfficiency.js`'s `CPOE` column), not merely "never summed". `fantasyPoints`/`fantasyPointsPpr` are nflverse default scoring and are never reconciled with `src/utils/fantasyPoints.js` (see CR-14). View-only on both sides — must never feed projection/scoring/grading. 2019 is absent upstream (known gap; degrades to the empty shape).
```

**Mirror instruction to the app repo (three edits, one change):**

1. `docs/cross-repo-registry.md:117`, CR-09 `Mirror` — replace the trailing sentence
   `2019 is absent upstream (known gap; degrades to the empty shape).` with
   `2019 was backfilled on 2026-07-03 (5,756 rows across 586 players) and is no longer a gap; the family is complete 2012–2025.`
2. Same entry, `Data side` — `validateGameLogs:467` → `validateGameLogs:503`.
3. Same entry, `Triggers` (data side, right of `‖`) — append
   `, fetchPlayerStatsCsv / STATS_BASE in lib/nflverse.mjs (:412 / :69 — the shared stats_player release path; the STATS_BASE tag-switch is what closed the 2019 gap on 2026-07-03)`.

All three byte-identical to §3.1a–c. Change nothing else in the entry.

**No app *code* change is owed.** The corrected sentence removes a false gap claim; it does not alter
the served shape, the floor, or the view-only boundary. App code that degrades gracefully on a
missing 2019 stays correct — it simply never fires now.

### CR-18 · Signal registry rows (`docs/signal-registry.md`) — `Direction: data→app`

Fires on two counts: §3.2 edits `data-catalog.md` (a listed data-side trigger), and §3.1a corrects a
**historical-coverage** claim, which is CR-18's `Invariant` scope verbatim ("historical coverage …
accurate as of the change that touched it").

**Mirror (live `README.md`, CR-18 `Mirror` field, verbatim):**

```text
This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.
```

**Mirror instruction to the app repo: no row edit is owed. Both target rows are already correct.**
Verified, not assumed:

- `docs/signal-registry.md:59` (gamelogs) already reads **"2012–2025, no gap (2019 and 2025 filled)"**.
- `data-catalog.md:173` (gamelogs) already reads **"2012–2025 complete (2019/2025 filled by B1)"**.
- `raw/` has **no** signal-registry row at all and never should — it is a non-served artifact, outside
  CR-18's "ingested field, stat key or source" scope. §3.2 reclassifies nothing; it corrects a false
  statement about manifest registration.

**This is the finding, not a formality.** When B1 closed the 2019 gap on 2026-07-03 it updated the
data catalog *and* the app's signal registry — and missed only the registry entry. CR-18's own Mirror
warns that "nothing fails in either repo when this drifts"; that is exactly what happened, and it is
why the stale line survived nearly two months into a document the plan-reviewer treats as sole
authority. Session 2 should re-verify both quoted rows before concluding no edit is owed; if either
has drifted since 2026-08-28, emit the row edit rather than the null.

## 6. Done-definition

- [ ] All four audit drifts corrected: CR-09 sentence, `data-catalog.md` classification, invariant
      renumber, `18 → 21` in **both** repos
- [ ] **CR-09's two stale data-side facts also corrected** (§3.1b/c) — `validateGameLogs:503`, and
      `fetchPlayerStatsCsv`/`STATS_BASE` added to the data-side Triggers, in **both** repos
- [ ] `.claude/agents/plan-reviewer.md:27` updated — duplicate-8 caveat dropped and the numeric range
      **removed entirely** (not replaced); the `## Invariants` heading is the only anchor left
- [ ] The **second** invariant 8 (`:241`) was renumbered, not the first; re-ran
      `grep -rni "invariant 8"` across `*.md`/`*.mjs`/`*.yml`/`*.js` and **all six** sites in §3.3's
      table still resolve to the CDN-purge invariant
- [ ] `grep -c '^#### CR-[0-9]' README.md` → `21`, and the count sentence in both CLAUDE.md files says 21
- [ ] Anchored mirrored-region diff (§1) reports **no output** after both repos land — run it last,
      after all four registry edits (three CR-09 + none elsewhere) are in
- [ ] `data-catalog.md`'s `raw/` statement is phrased to survive E1's delete (§3.2)
- [ ] **CR-18 discharged:** re-verified `docs/signal-registry.md:59` and `data-catalog.md:173` still
      read "no gap / complete"; if so, no row edit owed and that is recorded in the commit message
- [ ] `npm test` green, `npm run smoke` green (should be untouched — docs-only)
- [ ] No data file, `manifest.json`, or CDN purge involved; commit contains only `.md` files
- [ ] Both repos committed and pushed; `git pull --rebase origin main` before each push

---

## 7. Settled decisions

- **This slice is docs-only.** The audit's C8 mixes four drifts of different kinds; all four are text.
  No behaviour changes here, so it carries no smoke risk and can land ahead of everything else.
- **Renumber the second 8, not the first** (§3.3) — forced by **six** live external references, three
  of them CI workflow comments.
- **CR-09's stale data-side facts are folded in, not deferred** (§3.1b/c) — the entry is already being
  opened in both repos for a synchronized edit; deferring would cost a second coordination round for
  two one-token corrections.
- **CR-18 is emitted with a null row edit, not omitted** (§5) — the trigger fired, so the Mirror is
  owed; the honest discharge is the evidenced "already correct", not silence.
- **`data-catalog.md`'s wording is E1-durable** (§3.2) — avoids editing the same line twice.
- **The `14 files` count stays for E1 to fix** — not pre-empted here.

---

## 8. Out-of-scope observations (not edits — for awareness)

Found while verifying; **not** part of this slice, recorded so they are not lost:

1. **`data-catalog.md:222`** describes *"the registered `grading/<date>.json` family from
   `bin/grade.mjs`"*, but `manifest.json` holds **zero** `grading/*` entries and `grading/` contains
   only four unregistered `*-verdict.md` files. The sentence is forward-looking rather than drifted
   (no `grading/<date>.json` has been produced yet), so it is not a C8-class false claim — but it
   reads as describing something that exists.
2. **The audit misattributes C1's cross-repo entry.** `store-audit-2026-08-25.md` C1 says a
   `components` change *"is CR-11's served shape"*. It is **CR-07** — CR-07's `Invariant` explicitly
   names `components`, while CR-11 governs five snap/red-zone stat keys in `nfl/season-totals` and has
   nothing to do with advstats. Correct this when C1 is planned; do not carry the audit's citation
   forward.
3. **The audit's `_lng` count is short by two.** C4 says `RATE_KEYS` *"misses all nine `*_lng` keys"*.
   The served archive carries **11**: `def_kr_lng`, `def_pr_lng`, `fgm_lng`, `kr_lng`, `pass_lng`,
   `pass_td_lng`, `pr_lng`, `rec_lng`, `rec_td_lng`, `rush_lng`, `rush_td_lng` — all 11 absent from
   `RATE_KEYS`. C4's extension list is therefore **11 keys, not 9**.

   Stated unambiguously, because an earlier draft's phrasing was misread as claiming `RATE_KEYS`
   holds 14 keys:

   - `RATE_KEYS` (`lib/fantasyPoints.mjs:21`) holds **18** keys.
   - The served 2024 file carries **25** non-additive keys on non-`TEAM_*` rows.
   - The two sets **overlap in 14**. So: 25 = 14 covered + **11 `_lng` uncovered**.
   - The other 4 of the 18 (`down_3_pct`, `down_4_pct`, `g2g_pct`, `rz_pct`) are guarded by
     `RATE_KEYS` but do not appear in 2024 non-`TEAM_*` rows — which is why 18 − 14 = 4 rather than 0.

---

## 9. Plan-review disposition (2026-08-28)

The plan-reviewer subagent raised **8 flags** on the first draft. All were adjudicated before this
revision; nothing below is outstanding. Recorded so Session 2 does not re-open settled ground.

| # | Flag | Call | Where it landed |
|---|---|---|---|
| 1 | `[cross-repo]` CR-18 fires — `data-catalog.md` is its first data-side trigger | **Accepted** | §5 — CR-18 added with Mirror text |
| 2 | `[cross-repo]` CR-09's coverage correction is CR-18 `Invariant` scope | **Accepted** | §5 — same section; row edit is null, evidenced |
| 3 | `[mechanical]` invariant-8 reference sweep was Markdown-only and case-sensitive | **Accepted** | §3.3 — six sites tabulated; sweep method recorded |
| 4 | `[registry-stale]` CR-09 `validateGameLogs:467` → live `:503` | **Accepted, folded in** | §3.1b + §5 mirror instruction 2 |
| 5 | `[registry-stale]` CR-09 Triggers omit `fetchPlayerStatsCsv`/`STATS_BASE` | **Accepted, folded in** | §3.1c + §5 mirror instruction 3 |
| 6 | `[mechanical]` §8.3 arithmetic "does not close" | **Wording accepted, premise rejected** | §8.3 — see below |
| 7 | `[mechanical]` §5's Mirror quote was labelled verbatim but was reflowed | **Accepted** | §5 — both Mirrors now single-line fenced blocks, machine-extracted |
| 8 | `[edge-case]` §3.5 swaps one drifting line anchor for another | **Accepted** | §3.5 — range dropped entirely, not updated |

**On flag 6 — the one partial reject.** The reviewer read "25 non-additive keys = 14 in `RATE_KEYS` +
11 `_lng`" as asserting `RATE_KEYS` holds 14 keys, and computed 18 + 11 = 29. The original arithmetic
was correct — "14 in `RATE_KEYS`" meant *14 of the 25 are covered by* `RATE_KEYS`, not that the set
has 14 members. `RATE_KEYS` holds 18: the 14 overlapping keys plus `down_3_pct`, `down_4_pct`,
`g2g_pct`, `rz_pct`, which are guarded but absent from 2024 non-`TEAM_*` rows. The **defect was the
phrasing**, which invited exactly this misreading in a note written to be carried into C4 — so §8.3
is now spelled out set by set. The reviewer's `_lng` = 11 confirmation stands and matches.

**Two flags changed the shape of the slice, not just its prose.** Flags 1/2 mean this task file emits
**two** Mirror texts where the draft emitted one; flags 4/5 mean the mirrored-region edit is **three**
paired edits, not one. Both raise the app-side coordination cost of §3.1 — accepted deliberately,
since all of it lands in a single synchronized change.
