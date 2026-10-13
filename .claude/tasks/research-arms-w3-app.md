# W3 — Stage B (app repo): companion to `research-arms-w3.md`

Stage B is an app-repo session (sonnet), run after Stage A is committed. It changes docs and the backlog only: no
source, test, fixture or constant changes, and no registry edit.

**Before writing any data SHA:** run `git -C ../sleeper-dashboard-data pull --rebase` and cite the IDs it has
afterwards (both CLAUDE.md files, "Cross-repo commit IDs"). The SHAs and run dates come from Stage A's hand-back;
`<A1>`…`<A5>`, `<dynDate>` and `<rtDate>` below are placeholders for them.

## Stage B — app repo (sonnet). Five commits, in this order

All edits are to `.claude/tasks/data-repo-backlog.md` unless a commit names another file.

**Moving an entry to Done.** Each commit that resolves an entry:
- cuts the whole entry out of `## Open`;
- pastes it at the top of `## Done`, so B3's entry ends up first;
- wraps its heading text in `~~…~~`;
- inserts a `**✅ RESOLVED <date> by research-arms-w3** — …` line directly under the heading.

This is the D-50 / D-54 pattern. The entry's body is left as it is.

**Commit messages** end with `(research-arms-w3)`.

### B1 — D-68

Move D-68 to Done. Resolved line:
> **✅ RESOLVED 2026-10-12 by research-arms-w3** — data `<A1>`: `snapshots/2026-10-07.json` (first capture after the
> 2026-10-07 06:50 UTC push) carries the verdict's "after" `projectedGames`/`injurySeasons` on all 15 movers;
> 35 rows change `projectedGames` against `snapshots/2026-10-06.json`, as the verdict counted; anchor-policy
> boundary 7 reads "confirmed".

### B2 — D-55

Move D-55 to Done. Resolved line:
> **✅ RESOLVED <date> by research-arms-w3** — data `<A2>` (arm), `<A4>` (committed re-run,
> `grading/<dynDate>-inseason-dyn-verdict.md` §D-55): with rows lacking an S+1 outcome admitted (11,887 rows, 1,096
> player-seasons), second-year WRs are still the only WORSE cell (+0.416 [0.143, 0.699]); `PROSPECT_PRIOR_KIND`
> equals the measured kind, no flip. The survivor subset reproduces 2c-wiring §1b exactly.

Use the A4 numbers verbatim. If they differ from these, use A4's.

### B3 — D-56 (+ `docs/signal-registry.md`)

1. Move D-56 to Done. Resolved line:
   > **✅ RESOLVED <date> by research-arms-w3** — (a) data `<A3>`/`<A4>`: the arm-A ladder [YE1 pooled, own
   > position] keeps WR on the pooled rung; `K_DYN_PROSPECT_A_YE1` = 3.5 in every cell, emitted in
   > `backtests/<dynDate>-inseason-dyn-constants.json`, equal to the shipped pin. The app re-pin (provenance only, no
   > value moves) is owed to the next slice that touches `src/utils/inSeasonConstants.js` — tracked in D-69's
   > research-arms-w3 addition. (b) No snapshot field: the dynasty-side rookie prior is the neutral ceiled level
   > (never the QB chain), a closed form of captured `projection.factors` (`lib/rookieCapturedLevel.mjs`
   > `rookieCapturedLevel(f, { neutral: true }).dynastyPrior`); the composition reproduces 307/307 and 310/310
   > rookie rows of `snapshots/2026-10-11.json` / `2026-10-10.json` and is re-checked on the newest capture
   > (`test/rookie-captured-level.test.mjs`).
2. `docs/signal-registry.md:142`, the "In-season posterior" row's last cell. Replace `a rookie's \`next\` is not the
   dynasty prior` with:
   `a rookie's \`next\` is not the dynasty prior; that prior is the neutral ceiled level (never the QB chain), which a grader derives from the same capture's rookie \`factors\` (data \`rookieCapturedLevel\`, D-56)`.

   Nothing else in the row changes.

### B4 — D-13 (+ `docs/projection.md`)

1. **D-13 stays in `## Open`**, because its decision is still pending. Insert this status line directly under its
   heading, using the numbers from `grading/<rtDate>-rookie-total-verdict.md` and A5's §D, not this file's:
   > **Research done <date> by research-arms-w3 — Anton approved wiring the factor; separate parent-folder slice planned after W3** — data `<A5>`
   > (`bin/backtest.mjs --rookie-total`): on W2's availability panel (3,848 rows), the shipped composition
   > (calibrated PPG × ladder games) overstates realised total points — day3 RB/WR/TE ×<ρ> [<ci>], undrafted ×<ρ>
   > [<ci>]; a per-group multiplier (≈0.82) beats it out of sample. Not wired: it would move `projectedTotalPts`
   > only. §E's "few percent" was a cell-mean product on another population.
2. `docs/projection.md:256`. Replace exactly the span that starts `**Measured directly**` and ends
   `waiting to be applied.` with:
   > **Measured directly** (data repo, `grading/<rtDate>-rookie-total-verdict.md`, `bin/backtest.mjs --rookie-total`,
   > the availability panel's 3,848 rookie-path rows with the shipped per-row composition): the product overstates
   > realised total points — day-3 RB/WR/TE ×<ρ>, undrafted ×<ρ>, both CIs above 1 — because players who go on to
   > play 1–5 games realise under half their projected PPG. The earlier `2026-09-11-rookie-verdict.md` §E figure
   > (close to zero) multiplied cell means on a different population and does not describe this composition. A
   > per-group total-points multiplier is a recommendation, not shipped.

   Every other sentence of the paragraph stays as it is, including the "Still a large improvement…" and "The
   proper fix…" sentences.

### B5 — D-69 extension (registry cache additions queued)

Do not move D-69. Append to its body:
> **Added by research-arms-w3:** CR-25 Data side `runS2ArmComparison` (`scripts/inseason-dyn-run.mjs`),
> `SHIPPED_PROSPECT_PRIOR_KIND`, `SHIPPED_K_DYN_PROSPECT_A_YE1` (`lib/inSeasonEvidence.mjs`); CR-25 Mirror's last
> arm-A sentence becomes "…are emitted as `K_DYN_PROSPECT_A_YE1` by `--inseason --dynasty` since research-arms-w3;
> the app's pin re-derives from the 2c panel until it re-pins from that file." CR-15 Data side
> `rookieCapturedLevel` (`lib/rookieCapturedLevel.mjs`), `lib/rookieTotalPoints.mjs` and
> `scripts/rookie-total-run.mjs` (`bin/backtest.mjs --rookie-total`) composing `reconstructShippedRookieProjection`;
> CR-15 Mirror's "still does not compose share × level" sentence gains "(the reconstruction; `rookieCapturedLevel`
> composes it from a capture's own factors, for capture parity only)". CR-25 Data side also `rookieCapturedLevel`
> (its neutral prior rests on the ktc/college-1.0 and no-takeover-input sentences). CR-01 Data side
> `test/rookie-captured-level.test.mjs` and `lib/rookieCapturedLevel.mjs` (read rookie `projection.factors` keys of
> `snapshots/2026-10-10.json`, `2026-10-11.json` and the newest capture). **Also owed (app, no value moves):**
> re-pin `K_DYN_PROSPECT_A_YE1` from `backtests/<dynDate>-inseason-dyn-constants.json` in the next slice touching
> `src/utils/inSeasonConstants.js` (D-56(a)).

## Gates

- **Backlog headings.** `grep -c '^### ' .claude/tasks/data-repo-backlog.md` is unchanged, because entries move and
  are not deleted. Open loses 3 (D-55, D-56, D-68) and Done gains 3; D-13 stays open with its status line.
- **Doc edits.** `git diff --stat` shows only `.claude/tasks/data-repo-backlog.md`, `docs/signal-registry.md` and
  `docs/projection.md`.
- **Tests.** `npm test` is green. Nothing should touch them; this is run as a guard.

## Hand-back (Stage B)

Give back the SHAs B1–B5, the data SHAs as cited (after the pull), and any deviation.

---

## Stage B resolution (Session 1, 2026-10-13): use these values, not the placeholders

Data was pushed 2026-10-13 (`1dd73f5..bc2666e`). The push rebase renamed every Stage A commit, so these are the
**pushed** IDs. Re-check them with `git -C ../sleeper-dashboard-data pull --rebase` and
`git -C ../sleeper-dashboard-data branch -r --contains <sha>` before writing them.

| placeholder | value |
|---|---|
| `<A0>` | `0f59a00` (task files) |
| `<A1>` | `c2a8344` (D-68) |
| `<A2>` | `63b785a` (D-55) |
| `<A3>` | `e3c54e7` (D-56) |
| `<A4>` | `0370478` (re-run) |
| `<A5>` | `52d1001` (D-13) |
| fix pass | `bc2666e` |
| `<dynDate>`, `<rtDate>` | `2026-10-11` (the run date, not the commit date) |
| `<date>` in resolved lines | `2026-10-13` (B1's "2026-10-12" also becomes 2026-10-13) |

**D-55 (B2).** Cite the committed figures exactly as written. They supersede both the hand-back and this file's
earlier rounding:
- admitted: 11,887 rows, 1,096 player-seasons, WR|YE1 **+0.4161 [0.1429, 0.6987]**;
- survivors WR|YE1: +0.5475 [0.2450, 0.8511].

**D-13 (B4)**, from `grading/2026-10-11-rookie-total-verdict.md`:
- Status line: day3 RB/WR/TE **×1.257 [1.127, 1.409]**, undrafted **×1.197 [1.051, 1.374]**.
- The multiplier wording becomes "per-group multipliers (day3 0.796, undrafted 0.835 on the decision rows) beat it
  out of sample (ΔMAE −2.21 / −0.75)". Use these figures, not "≈0.82": the decision-population multipliers are what
  the wiring slice will pin.
- `docs/projection.md` uses the same two ρ values.

**Fix-pass ID.** Add `bc2666e` to B3's data list (`<A3>`/`<A4>` → `` `e3c54e7`/`0370478` (fix pass `bc2666e`) ``).

**Gate.** The backlog heading count stays **64**.

**Commit messages** end `(research-arms-w3)`. Do not push; Session 1 verifies first.
