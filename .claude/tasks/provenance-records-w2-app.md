# W2 — Stage B (app repo): companion to `provenance-records-w2.md`

Read `provenance-records-w2.md` §1, §2 and §5 first; this file holds only the app-side commits. The anchors cited
here were verified at app `c318487`.

## Stage B — app repo (sonnet). Five commits, in this order

Start from `c318487`. Each commit strikes its own backlog entry and moves it to the top of `## Done` (newest first),
in W1's format: `### ~~D-n · title~~`, then `**✅ RESOLVED 2026-10-1x by provenance-records-w2** — <evidence>.`,
then the original `**Found:**` line and body, unchanged. Fill `<A1>`…`<A4>` and `<D>` from the Stage A hand-back.

- **B1 · D-9.** `docs/projection.md:296`. After "…overstates how good a random day-3 QB pick actually is.", insert
  " The data repo's ungated breakdown puts numbers on it (backlog D-9, `grading/2026-09-12-rookie-verdict.md` §B): of
  251 day-3 QB rookie-path rows, 31 reached `gp ≥ 6`, 84 played 1–5 games, 74 were rostered without playing and 62
  were absent — so the clamp stands."
  - Evidence line: "data `4534898` (§B strata). The clamp is kept: 31 of 251 survive the gate."
  - Commit: `D-9: projection.md states the day3:QB survivor share (data rookie verdict §B); backlog close (provenance-records-w2)`.
- **B2 · D-10.** `docs/signal-registry.md:64`. Replace `` `lib/nflverse.mjs:548` `` with
  `` `parsePlayerIdsCsv`, `lib/nflverse.mjs:573` ``.
  - Evidence: "Recorded on both sides: data `data-catalog.md` crosswalk row (`be514ca`, anchor refreshed `<A1>`)
    and this repo's `docs/signal-registry.md` crosswalk row. The never-join warning lives in data
    `lib/rookieMirror.mjs`'s docstring."
  - Commit: `D-10: signal-registry crosswalk anchor (lib/nflverse.mjs:573); backlog close (provenance-records-w2)`.
- **B3 · D-12.**
  - `src/utils/seasonProjection.js:84-88`: replace the 5-line comment with exactly 5 lines:
    ```
    // Rookie availability (calibration arc slice 2). Mean realised games played by rookie-path players,
    // target seasons 2013-2025; src/__fixtures__/rookie-games-panel-2026-09-09.json pins every value.
    // Provenance (D-12): data backtests/<D>-rookie-panel.json rookiePathAll re-derives all 74 cells under
    // the same recipe (grading/<D>-rookie-verdict.md §D, data <A3>). Ladder order and floors are in
    // docs/projection.md → Rookie path → Projected games.
    ```
  - `docs/projection.md:252` (the Projected games **Validation.** paragraph): replace the clause
    "— **no committed data-repo artifact backs this panel** (unlike the realisation-calibration fixture, which is a
    trimmed copy of a SHA-anchored data-repo artifact); the fixture's own `source` block carries the full join and
    predicate as the interim provenance story." with "; the fixture's own `source` block carries the full join
    and predicate, and the data repo re-derives the panel from its own stores under that recipe (`node bin/panel.mjs
    --rookie`, `grading/<D>-rookie-verdict.md` §D, data `<A3>`: 3,848 rows, no cell moves in whole games; n differs
    by one in a few undrafted cells where the weekly crosswalk refresh has since resolved or dropped a player)."
    In the closing parenthetical "(a committed availability panel, filed as a data-repo ask, not planned in this
    slice)", append " — since delivered, backlog D-12". Leave the rest unchanged.
  - Evidence: "data `<A2>` (pin), `<A3>` (panel): 3,848 rows, 0 of 74 cells move in whole games."
  - Commit: `D-12: availability ladder provenance points at the data panel; backlog close (provenance-records-w2)`.
- **B4 · D-14.** Backlog only.
  - Evidence: "data `be514ca` (`bin/panel.mjs --rookie` §G + `test/rookie-mirror.test.mjs` T-RM11). All eight
    quantiles match exactly, re-confirmed in `grading/<D>-rookie-verdict.md` §G."
  - Commit: `D-14: backlog close — ceiling quantiles re-derived in data §G (provenance-records-w2)`.
- **B5 · D-54.** Backlog only, plus one new Open entry:
  - `### D-69 · Registry cache additions from W2 (CR-15, CR-25 Data side)`, Found: provenance-records-w2 plan
    gate. Blocking: no. Size: small, two-session route, ride the next registry sync. Body: add to CR-15's Data
    side `enumerateEntryCohortRows` and `scripts/panel-run.mjs`'s `APP_ROOKIE_GAMES_CELLS`/`APP_RUNG4_POOLED`/
    `APP_AVAILABILITY_RECONCILE`/`APP_ROOKIE_CEILING`; add to CR-25's Data side `blend` and
    `scripts/inseason-dyn-run.mjs` `capStartPPG`.
  - Evidence: "(b)/(d) CR-25 App side (2026-10-04). (a)/(c)/(e) data `<A4>`: Q3 starts from the capped value, the
    mirror states the SHORT slot, and `--inseason --dynasty` reports the cap-placement comparison (pooled BEATS
    −16.25 [−18.03, −14.44], reproduced exactly; `grading/<D>-inseason-dyn-verdict.md`). Constants unchanged; no
    re-pin."
  - Commit: `D-54: backlog close; file D-69 (registry cache additions) (provenance-records-w2)`.

**Gates:**
- `npm test`, `npm run lint` and `npm run build` are green or clean.
- `git diff --stat c318487 -- src/utils/seasonProjection.js` shows **5 insertions / 5 deletions**, all within
  `:84-88`.
- `docs/cross-repo-registry.md` is untouched.
- The `### D-` entries under `## Open` drop by 5 (D-9, D-10, D-12, D-14, D-54).

Hand-back: the SHAs, the files touched and any deviation.

---

