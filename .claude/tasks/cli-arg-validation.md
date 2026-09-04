# CLI arg validation — a malformed invocation fails loudly

**Type:** input validation on `bin/update.mjs`, one new pure lib module, one new test file.
No data, no manifest, no served shape, no CDN purge.
**Session model:** plan (opus, this file). Implementation is a separate sonnet session — do not edit
source here.
**Source:** C6 (`store-audit-2026-08-25.md`, queue row 5). Re-verified against live source
**2026-08-29** at HEAD `a805f98`.

**The feature.** *An invocation that cannot do what the operator meant must fail, not silently
retarget.* The audit scoped this to a malformed `--year`. Verification found a second, more likely
path to the same outcome — a typo'd **flag name** — which the audit does not mention and which is
strictly worse. Both are in scope; §2 draws the line.

**Working-tree note.** `store-audit-2026-08-25.md` is modified and uncommitted. **Do not stage,
commit, revert or edit it.** Nothing here touches it.

---

## 1. Verified facts

### 1.1 · Four silent paths, all ending in exit 0

`bin/update.mjs:53-56` — `option()` returns whatever token follows the flag, with no bounds check:

```js
function option(name) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : null;
}
```

`:62-63` — `const yearRaw = option('--year'); const year = yearRaw ? parseInt(yearRaw, 10) : null;`

| # | Invocation | `yearRaw` | `year` | Outcome |
|---|---|---|---|---|
| a | `advstats --year 202x` | `"202x"` | **202** | fetches `stats_player_week_202.csv` → 404 → *"not published yet — skipping"* → **exit 0** |
| b | `advstats --year --dry-run` | `"--dry-run"` | **NaN** | same 404-skip path → **exit 0** |
| c | `advstats --dry-run --year` | `undefined` | **null** | `null` reads as *"current season"* → **silently retargets** |
| d | `advstats --yaer 2023 --dry-run` | `null` | **null** | `--yaer` silently ignored → retargets 2026 → *"not published yet"* → **exit 0** |

Live reproduction of (a), unchanged from the audit:

```
$ node bin/update.mjs advstats --year 202x --dry-run
[advstats] year=202 | currentSeason=2026
[advstats] Fetching stats_player_week_202.csv…
[advstats] year=202 not published yet — skipping
→ exit 0
```

Live reproduction of (d) — **not in the audit, and the sharpest of the four**:

```
$ node bin/update.mjs advstats --yaer 2023 --dry-run
[advstats] year=2026 | currentSeason=2026
[advstats] Fetching stats_player_week_2026.csv…
[advstats] year=2026 not published yet — skipping
→ exit 0
```

One transposed character and the run silently targets the wrong season. In the shell loop the audit
describes — `for y in {2012..2025}; do node bin/update.mjs advstats --yaer $y; done` — that is
fourteen consecutive no-ops, every one green.

### 1.2 · What already works — this bounds the fix

Checked before planning anything, because it removes most of the tempting scope:

- **Thrown errors already exit 1.** `bin/update.mjs:197-201` catches, prints
  `[update] Error: ${err.message}`, and `process.exit(1)`. Measured directly (not through a pipe):
  `gamelogs --year 2005` → **exit 1**; `advstats --year 202x` → **exit 0**. The dispatcher's error
  handling is sound; (a)–(d) are the only silent paths.
- **Below-floor years already fail loudly.** `oline --year 2015` →
  `aggregateOlineStates: required columns missing … (or a pre-2025 legacy-schema asset)`, exit 1.
  `gamelogs --year 2005` → `only 714 game rows — expected ≥ 3000`, exit 1. **So per-subcommand floor
  validation would improve a message, not catch a silent failure** — it is not worth the
  family→floor table it would require. (This also leaves `manifest-truth.md` §5.1's decision to keep
  those floors out of production constants intact and still correct.)
- **Unknown subcommands already exit 1** (`:192-195`).
- **A bad `--category` already fails loudly** — `cfbd --year 2023 --category bogus` →
  `[validate] CFBD bogus 2023: 0 rows — expected ≥ 500`, exit 1.

### 1.3 · A sibling CLI already solved one third of this

`bin/enrich.mjs:42-45` has the bounds check `bin/update.mjs` lacks:

```js
return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
```

That closes path (c) — `--year` as the final token yields `null` rather than `undefined`. Part of
this fix is simply bringing `bin/update.mjs`'s `option()` up to its sibling's standard. `enrich.mjs`
still does a bare `parseInt` in `optionInt:47-50`, so it retains (a) and (b) — see §11.

---

## 2. Scope — the severity split

**In scope:** anything that makes a run **target something other than what was asked**, silently.
That is (a)–(d).

**Out of scope:** an option that is *ignored* without changing the target. Deliberately excluded:

| Case | Why excluded |
|---|---|
| `nfl --category passing` | `--category` is only read by `cfbd`; elsewhere it is inert. No retarget. |
| `ktc --year 2023` | `--year` is inert for `ktc`/`draft`/`playerids`/`snapshots`/`playerstate`. No retarget. |
| Per-subcommand floors (`oline --year 2015`) | Already fails loudly (§1.2). |

Rejecting those would need a per-subcommand applicability table maintained in lockstep with the help
text — new surface, new drift risk, guarding a benign outcome. **The rule is: reject what
misdirects, not what is merely unused.**

**One combination is in scope, but only on four subcommands.** `--all` together with `--year` is a
silent retarget *where `--all` is honoured*: `scripts/update-schedule.mjs:55` does
`if (all) seasons = <every season>`, so `--all` wins and `--year` is discarded without a word.

But `all` is destructured by only **4 of 12** updaters — verified against every signature:

| Accepts `--all` | Ignores `--all` |
|---|---|
| `schedule`, `gamelogs`, `teamcontext`, `oline` | `nfl`, `cfbd`, `roster`, `advstats`, `playerids`, `draft`, `ktc`, `playerstate` |

On the eight that ignore it, `nfl --all --year 2023` honours `--year` — `--all` is *merely unused*,
which §2's own rule says **not** to reject. So the combination check must be **subcommand-scoped to
the four**, not blanket. That list is not new drift surface: `printHelp`'s OPTIONS block already
documents it verbatim as *"Backfill all seasons (schedule/gamelogs/teamcontext/oline subcommands)"*,
and §5 binds the two together with a test.

---

## 3. `lib/args.mjs` — one export, not three

`bin/update.mjs` exports nothing and is a thin dispatcher; the house pattern keeps logic in
`lib/`/`scripts/` where `node --test` can reach it.

**One exported function does all of it.** An earlier draft split this into `assertKnownTokens` +
`parseYearOption` and left the `--all`/`--year` combination check homeless — it needs the
*subcommand* (§2), which neither of those two takes. Review was right that Session 2 would have had
to invent a third export. One entry point also guarantees there is exactly **one** `--year` parser
(§4).

```js
// lib/args.mjs — pure, no I/O, no network

export const KNOWN_FLAGS   = ['--dry-run', '--force', '--all', '--help', '-h'];
export const KNOWN_OPTIONS = ['--year', '--category'];
/** The only subcommands that honour --all (scripts/update-{schedule,gamelogs,teamcontext,oline}.mjs). */
export const ALL_SUBCOMMANDS = ['schedule', 'gamelogs', 'teamcontext', 'oline'];

/** CLI sanity bound — deliberately NOT a family coverage floor. See note below. */
export const MIN_CLI_YEAR = 1999;

/**
 * Parses and validates argv for bin/update.mjs.
 * Returns { subcommand, year, category, force, dryRun, all } — the exact shape
 * bin/update.mjs's `opts` needs — or throws with a message naming the offending token.
 *
 * Rejects (all four are §1.1's silent paths):
 *   - an unrecognized `--token`                        → (d)
 *   - `--year` present with a non-four-digit value     → (a)
 *   - `--year` present with a value starting with `--` → (b)
 *   - `--year` present with no value at all            → (c)
 *   - `--year` out of [minYear, maxYear]
 *   - `--all` together with `--year`, ONLY on ALL_SUBCOMMANDS
 *
 * `--year` absent returns year: null — the legitimate "current season" path.
 */
export function parseAndValidateArgs(argv, {
  minYear = MIN_CLI_YEAR,
  maxYear = new Date().getUTCFullYear() + 1,
} = {});
```

**Why `MIN_CLI_YEAR = 1999` and not an import of `MIN_SCHEDULE_SEASON`.** An earlier draft imported
it. Review flagged that `MIN_SCHEDULE_SEASON:38` is named in **CR-18's data-side trigger list** as a
constant that *encodes historical coverage* — importing it would make `lib/args.mjs` a live consumer
of a coverage floor that CR-18's list does not name, and would conflate two different things that
merely coincide today. A CLI typo-bound and the schedule family's earliest season are not the same
fact; if schedule's floor ever moves, the CLI bound must not silently move with it. Declare it
locally, with that reasoning in a comment.

**Why the whole argv, not the parsed value.** Path (c) is indistinguishable from "flag absent" once
`option()` has collapsed both to a falsy value — the function needs `argv.includes('--year')` to tell
*present-but-empty* from *absent*.

**Why the upper bound is calendar-derived, not `currentSeason + 1`.** The audit specifies
`[1999, currentSeason + 1]`, but `currentSeason` comes from `fetchCurrentNflSeason()` — an async
network call — and argv parsing is synchronous. `new Date().getUTCFullYear() + 1` is available
synchronously and is deliberately **loose**: the job is catching typos, not enforcing family floors
(§1.2 shows those already hold). Invariant 8's Jan–Feb calendar/season divergence makes this bound one
year more permissive in those months — the harmless direction.

**`--help` and `-h` are in `KNOWN_FLAGS` so they stay silently ignored.** `bin/update.mjs:141`
accepts them only as `args[0]`; `nfl --help` is ignored today. Without them in the known set this
slice would flip that into a hard error carrying a nonsense *"did you mean --year?"* hint. Note `-h`
is single-dash, so the unrecognized-token scan must key on a leading `-`, not `--`, or it will never
see it. Making `nfl --help` actually print help is a UX improvement and **out of scope** — §11.

**Error messages name the offending token and the rule**, e.g.
`--year "202x" is not a four-digit year in [1999, 2027]` and
`unrecognized option "--yaer" (did you mean --year?)`. The near-miss hint is the point: (d) is a
typo, and the operator must see it immediately. Suppress the hint when the token is a known flag.

---

## 4. Call site — one parser, inside the `try`

**This is a restructure, not an insertion.** `const opts = { year, category, force, dryRun, all }` is
built at `bin/update.mjs:148`, **outside** the `try` that opens at `:151`. Calling a validator inside
that try would validate a value that never reaches `opts` — leaving two `--year` parsers in the file,
with the *untested* one (`:63`, bare `parseInt`) still feeding every ingest script. Review caught
this; it is the difference between a fix and a decoration.

Required sequence:

1. **Delete** the top-level `yearRaw`/`year` derivation at `bin/update.mjs:62-63`. It becomes the
   only removed line pair, and its removal is what guarantees a single parser.
2. Keep `option()`/`flag()` for `--category` and the booleans, and give `option()` the
   `i + 1 < args.length` bounds check its sibling `bin/enrich.mjs:42-45` already has.
3. Inside the existing `try`, as the **first** statement:
   `const opts = parseAndValidateArgs(args);`
4. Dispatch on `opts.subcommand` as before.

A throw then lands in the existing handler at `:197-201` — `[update] Error: ${err.message}` and
`process.exit(1)` — identical to every other error this CLI raises. **Do not add a second error
path.** The help short-circuit at `:138-142` stays where it is, ahead of validation, so
`node bin/update.mjs` with no arguments still prints help and exits 0.

---

## 5. Tests — `test/args.test.mjs` (new)

Pure function, no network, no fixtures. `parseAndValidateArgs` is the only entry point.

**Rejections — every row of §1.1**
- `['advstats','--year','202x']` → throws, message names `202x`
- `['advstats','--year','--dry-run']` → throws (value starts with `--`)
- `['advstats','--dry-run','--year']` → throws (present, no value) — **must not return `year: null`**
- `['advstats','--yaer','2023']` → throws, message names `--yaer`, hint suggests `--year`
- `['advstats','--year','1998']` → throws (below `minYear`)
- `['advstats','--year','2099']` → throws (above `maxYear`)
- `['schedule','--all','--year','2015']` → throws (combination, on an `ALL_SUBCOMMANDS` member)

**Acceptances — the ones a false positive would break**
- `['advstats','--year','2023']` → `year: 2023`
- `['advstats','--dry-run']` → `year: null`, no throw
- `['nfl']` → `year: null` — **the Tuesday Action's exact invocation** (`nfl-season-totals.yml:35`)
- `['cfbd','--year','2023','--category','passing']` → no throw (a value is not a token)
- `['nfl','--help']` and `['nfl','-h']` → no throw (§3: still ignored, not an error)
- `['nfl','--all','--year','2023']` → **no throw** — `nfl` is not in `ALL_SUBCOMMANDS`, so `--all` is
  merely unused and §2's rule says leave it. This test is the guard on §2's own boundary.
- `['schedule','--all']` → no throw (the documented `--all` path)

**Every real scheduled invocation validates clean.** Swept from live workflow files, these are the
only shapes CI and cron ever produce — assert each:
`['nfl']`, `['advstats']`, `['gamelogs']`, `['schedule']`, `['teamcontext']`, `['roster']`,
`['oline']`, `['playerids']`, `['draft']`, `['ktc']`, `['playerstate']`, plus smoke's
`['nfl','--year','2023','--dry-run']` shape. **No workflow passes `--all`** — an earlier draft
claimed `['schedule','--all']` was a workflow invocation; it is not, it is the documented manual
backfill, and it is tested as such.

**Bind the known-token set to the documented surface.** Nothing otherwise stops `printHelp` and
`lib/args.mjs` drifting apart — and the new failure mode is a hard reject, so a flag documented in
help but missing from `KNOWN_FLAGS` would be *broken outright* rather than quietly ignored. Add a
test that scans `bin/update.mjs`'s `printHelp()` output for every `-`-prefixed token and asserts the
set equals `KNOWN_FLAGS ∪ KNOWN_OPTIONS`. Scan the **whole** help text, not just the OPTIONS block —
`--category` appears only in SUBCOMMANDS. Same "promote the doc to a test" move `manifest-truth.md`
§5.5 made for the reconcile snippet.

**One stale help line, fixed in passing.** `printHelp`'s OPTIONS block says
`--year YYYY  Target season year (nfl, cfbd, roster subcommands)` — but `advstats`, `schedule`,
`gamelogs`, `teamcontext` and `oline` all take `--year` too. Correct it in the same change: the test
above reads this text, and leaving a known-false line in the source of truth a test binds to is
exactly how the next drift starts.

## 6. Step order

1. `lib/args.mjs` + `test/args.test.mjs` — pure, green before anything is wired.
2. Restructure `bin/update.mjs` per §4: delete `:62-63`, move `opts` inside the `try` and build it
   from `parseAndValidateArgs(args)`, give `option()` its bounds check. Fix the stale `--year` help
   line (§5) in the same pass, since the help-surface test reads it.
3. Re-run every §1.1 case by hand and confirm each now exits **1** with a message naming the token.
   Then re-run the acceptance list — `nfl`, `nfl --help`, `nfl --all --year 2023`,
   `schedule --all` — and confirm each still exits **0**.
4. `npm run smoke` — it invokes twelve subcommands with real flags and is the strongest available
   proof the validator rejects nothing legitimate.

One commit: `fix: reject malformed update-CLI invocations instead of silently retargeting (C6)`.
No data files, so **no CDN purge and no manifest change**.

**CLAUDE.md upkeep** (Self-maintenance): add a `lib/args.mjs` row to the Navigation map. No
`data-catalog.md` change is owed — no family's coverage, schema or gate moves.

---

## 7. Cross-repo impact

**No registry entry fires.** Verified rather than assumed:

- Grepping every `Triggers` field's **data side** (right of `‖`) across the whole
  `CR-REGISTRY-BEGIN`/`END` region for `bin/update` returns **0 matches**. Seven entries
  (CR-01/06/07/08/09/10/17) name `bin/update.mjs <subcommand>` in their **Data side** prose, but the
  reviewer's check — and the rule in CLAUDE.md — is the `Triggers` list.
- `lib/args.mjs` and `test/args.test.mjs` are new files named by no entry.
- **CR-18 does not fire.** Its data-side triggers are `data-catalog.md`, *the signal-registry and
  Sibling-repo pointers in `CLAUDE.md`*, the ingest scripts, the field-producing parsers, and the
  coverage-floor constants. This slice edits `CLAUDE.md`'s **Navigation map** — not those pointers —
  and touches no ingest script, no parser, and no floor constant. Its `Invariant` is also not
  engaged: nothing here adds, removes or reclassifies an ingested field, stat key or source, and no
  family's historical coverage changes.
- **CR-21 does not fire** even though `scripts/update-nfl.mjs` is its trigger — this slice does not
  edit that file. Validation lives in the dispatcher and in `lib/args.mjs`.
- **CR-18 does not fire — but only because §3 dropped the `MIN_SCHEDULE_SEASON` import.** An earlier
  draft had `lib/args.mjs` importing it as the CLI's lower bound. CR-18's data-side `Triggers`
  explicitly name *"the coverage-floor constants that encode historical coverage — `MIN_DRAFT_YEAR:25`,
  `MIN_SCHEDULE_SEASON:38`, …"*, so that import would have made this module a live consumer of a
  CR-18 trigger, and CR-18's list would not have named it. `MIN_CLI_YEAR = 1999`, declared locally,
  removes the coupling entirely rather than documenting it. Session 2: if you find yourself importing
  anything from `lib/nflverse.mjs` into `lib/args.mjs`, stop — that is this decision being undone.

Nothing in this slice changes a served byte, a manifest field, or a gate. If Session 2 finds itself
editing a `scripts/update-*.mjs` file, the scope has drifted — stop and re-check §2.

---

## 8. Done-definition

- [ ] `lib/args.mjs` exports **one** function — `parseAndValidateArgs(argv, opts)` — plus
      `KNOWN_FLAGS`, `KNOWN_OPTIONS`, `ALL_SUBCOMMANDS`, `MIN_CLI_YEAR`. Pure, no I/O, no network
- [ ] It **imports nothing from `lib/nflverse.mjs`** — `MIN_CLI_YEAR` is local (§7, CR-18)
- [ ] Returns `{ subcommand, year, category, force, dryRun, all }`; `year: null` when `--year` is
      absent; throws when present-but-invalid
- [ ] **`bin/update.mjs:62-63`'s `yearRaw`/`year` derivation is deleted** — exactly one `--year`
      parser exists in the file afterwards (grep `parseInt` in `bin/update.mjs` → 0 hits)
- [ ] `opts` is built **inside** the `try` from `parseAndValidateArgs(args)`, not at `:148`
- [ ] `option()` gained the `i + 1 < args.length` bounds check (matching `bin/enrich.mjs:42-45`)
- [ ] Failures print `[update] Error: …` and exit 1 through the **existing** handler at `:197-201`;
      no second error path added
- [ ] The help short-circuit at `:138-142` still runs ahead of validation — bare
      `node bin/update.mjs` prints help and exits **0**
- [ ] `--help`/`-h` on a subcommand (`nfl --help`) still exits 0, **not** an error with a
      "did you mean --year?" hint; the unrecognized-token scan keys on a leading `-`, so `-h` is seen
- [ ] `nfl --all --year 2023` does **not** throw — `--all` is inert there (§2's own boundary)
- [ ] `schedule --all --year 2015` **does** throw
- [ ] All four §1.1 invocations re-run by hand: each exits **1** with a message naming the token
- [ ] Every real scheduled/CI invocation validates clean — the eleven bare-subcommand shapes plus
      smoke's `--year YYYY --dry-run` shape
- [ ] The help-surface test passes: every `-`-prefixed token in `printHelp()`'s **full** text equals
      `KNOWN_FLAGS ∪ KNOWN_OPTIONS`
- [ ] `printHelp`'s stale `--year YYYY  Target season year (nfl, cfbd, roster subcommands)` line
      corrected to name every subcommand that takes `--year`
- [ ] `test/args.test.mjs` green; `npm test` green (baseline **528** + the new cases)
- [ ] `npm run smoke` green — all twelve dry-runs still accepted
- [ ] `CLAUDE.md` Navigation map has a `lib/args.mjs` row
- [ ] No data file, no `manifest.json` change, no CDN purge; the commit contains only
      `lib/args.mjs`, `bin/update.mjs`, `test/args.test.mjs`, `CLAUDE.md`
- [ ] `store-audit-2026-08-25.md` still modified-and-uncommitted, untouched

---

## 9. Settled decisions

- **Reject what misdirects, not what is merely unused** (§2) — the scoping rule. It is why
  per-subcommand applicability tables stay out, and why the `--all`/`--year` check is scoped to the
  four subcommands that honour `--all`.
- **One export, not three** (§3) — the combination check needs the subcommand, and a single entry
  point is what guarantees a single `--year` parser.
- **The call site is a restructure** (§4) — `opts` moves inside the `try` and `:62-63` is deleted.
  Inserting a validator without moving `opts` would leave the untested `parseInt` feeding every
  ingest.
- **`MIN_CLI_YEAR` is local, not `MIN_SCHEDULE_SEASON`** (§3, §7) — avoids making `lib/args.mjs` a
  consumer of a CR-18 coverage-floor trigger, and avoids conflating a typo-bound with a family floor.
- **`--help`/`-h` stay silently ignored** (§3) — preserving today's behaviour; making them print help
  is out of scope.
- **No per-subcommand year floors** (§1.2) — below-floor years already exit 1 with specific messages.
- **Calendar-derived upper bound, deliberately loose** (§3) — `currentSeason` is async, argv parsing
  is not.
- **Scope is `bin/update.mjs` only** — the data-ingest dispatcher. Other CLIs: §11.

---

## 10. Review disposition (2026-08-29)

Seven flags, all accepted; three changed the design rather than the wording. Nothing outstanding.

| # | Flag | Call | Landed |
|---|---|---|---|
| 1 | `[mechanical]` `--all`/`--year` check has no home | **Accepted — design changed** | §3, one export |
| 2 | `[ordering]` `opts` frozen at `:148`, outside the `try` → two parsers | **Accepted — design changed** | §4 restructure; `:62-63` deleted |
| 3 | `[edge-case]` `--all`/`--year` rejection is subcommand-blind | **Accepted — design changed** | §2, scoped to `ALL_SUBCOMMANDS` |
| 4 | `[edge-case]` `--help`/`-h` would become a hard error | **Accepted** | §3, both in `KNOWN_FLAGS`; scan keys on `-` |
| 5 | `[mechanical]` no workflow passes `--all` | **Accepted** | §5, rationale corrected, real shapes enumerated |
| 6 | `[edge-case]` nothing binds `KNOWN_FLAGS` to `printHelp` | **Accepted** | §5, help-surface test + stale line fixed |
| 7 | `[strategy]` `MIN_SCHEDULE_SEASON` is a CR-18 trigger | **Accepted** | §3/§7, local `MIN_CLI_YEAR` |

**Flags 1, 2 and 3 were one defect wearing three hats** — a design that split validation across two
functions neither of which had the subcommand, wired at a call site that could not receive the
result. Collapsing to a single `parseAndValidateArgs` that returns the whole `opts` object resolves
all three at once and is why §3 and §4 are rewrites rather than patches.

**Flag 2 was the serious one.** As first written, the plan would have shipped a validator that threw
correctly on bad input while the *valid* path still ran through the unvalidated `parseInt` at `:63`
— a fix that looked complete and left the load-bearing parser untested. That is a planning error, not
a source defect: the call site was specified without checking where `opts` is constructed.

**Flag 6 is the one that keeps this from rotting.** The change converts a silent-ignore into a hard
reject, which means the known-token list becomes load-bearing: a flag documented in help but missing
from `lib/args.mjs` would be broken outright rather than quietly dropped. The help-surface test is
what makes that safe, and it turned up the stale `--year` line as a side effect.

---

## 11. Out-of-scope observations (not edits)

1. **`bin/enrich.mjs` retains paths (a) and (b).** `optionInt:47-50` is a bare `parseInt`, so
   `--year 202x` yields `202` and `--segment-start 2x` yields `2`. It *writes* enrichment data, so
   the blast radius is real — but it is a different CLI with its own arg surface and its own
   validation layer (`bin/enrich.mjs validate`), and folding it in would double this slice.
   `lib/args.mjs` is deliberately shaped so `enrich.mjs` can adopt it unchanged.
2. **`bin/panel.mjs:66-68` and `bin/backtest.mjs:157-159`** parse `--from`/`--to`/`--min-games` with
   bare `parseInt` and string defaults. Both are analysis-only, read-only, and not in `smoke`, so a
   malformed value produces a wrong report rather than missing data — lower severity, same fix
   available.
3. **The audit's C6 is one of two halves.** Its fix sketch — *"reject a `--year` that is not four
   digits … and reject a value beginning with `--`"* — covers (a) and (b) only. Path (d), the typo'd
   flag name, is the more likely operator error and produces the same silent retarget; path (c) is
   what the audit's own prose describes (*"a malformed backfill quietly retargets today"*) but its
   fix sketch does not catch. Worth noting when the audit's queue row 5 is struck: it is being
   closed wider than written.
