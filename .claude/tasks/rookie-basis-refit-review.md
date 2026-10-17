# D-45 — Stage A verification and fix passes

Part of [`rookie-basis-refit.md`](rookie-basis-refit.md) (split out for size).

## Stage A verification (Session 1, 2026-10-17)

Stage A: local, not pushed — A1 `6d3bdd5`, A2 `3d678c8`, A3a `9621d09` (08:42:41Z), A3b `6aaf7d2` (08:43:37Z); both
artifacts carry `headRev: 9621d09`, no amend/rebase in the reflog, the verdict's rule text is byte-equal to
`ROOKIE_BASIS_RULE_MD`. Verdicts: F1/F2/F3/F5 `do-not-wire`, F4 `stop-and-report`; §4.6 not triggered. `npm test`
1707/1712 (5 skipped), `npm run smoke` green.

- **implementation-reviewer** (full depth, opus, `ef801d0..6aaf7d2`): §2.6 byte identity independently reproduced
  (`--rookie`, `--rookie-total`, `--qb-rookie-level`, `--fullpipeline` — which exits 1 at its sensitivity stop on both
  sides, pre-existing — plus `--inseason`/`--dynasty`); every family verdict re-derives from its entries; floors,
  99% pooled interval, WR-only F5, as-of scales, pinball loss and in-fold arms as specified; Invariant 10, T-RM1 and
  "no served/manifest/registry change" hold; changed D-46 and `bonus_fd_qb` tests are changed per plan, not bent.
- **F4 cause, confirmed pre-existing data drift (not Stage A).** The bot refresh `e97799f` (2026-10-14, an ancestor of
  `ba5c98c`) added sleeperIds 11911 (WR, undrafted 2024) and 13013 (TE, undrafted 2025) to `nflverse/playerids.json`;
  neither exists at `cde2d06` (2026-10-07), the crosswalk the 10-10 panel was built on. The live `rookiePathAll` gains
  exactly (11911, 2024), (11911, 2025), (13013, 2025), all undrafted with `outcomeTotalPts` 0; 0 differences on the
  3,848 common rows; undrafted factor 0.834 live, 0.835 with the three rows removed and on the pinned panel.
- **Anton (2026-10-17):** freeze the crosswalk at `cde2d06` for `rookiePathAll` and re-run F4 only; ratify the
  per-family G0b reading; align the `same`/`WORSE` rule to the plan; add the missing `analyze` test. These are
  authorised rule edits after A3a (§4's "a rule change after A3a is a stop" is lifted for exactly items 2–3 below).
- **Ratified (Anton):** G0b is per family — a family whose G0b fails is `stop-and-report` and its league section is
  not read; G0a/c/d stay global stops (as `scripts/rookie-basis-run.mjs:75` already states). The F1/F2/F3/F5 verdicts
  stand under this reading.
- **Accepted as declared, no change:** implementer interpretations #2–#5, #7–#14; `leagueRatio`'s
  `sourceFantasyPoints !== undefined ?` (null source → null ratio, tested in T7b); `ratioOfMeans`/`runLoyo` inlined
  into F1's own fold loop (same 12-fold structure).
- **Deferred to Stage B/C (recorded, not fixed here):** `scripts/rookie-constants-file.mjs` joins the CR-15/CR-25
  trigger lists in B2; the `rookieConstantsBasis` string is pinned in the bc file before any B1 (moot under no wire);
  `fs` monkey-patching in `test/rookie-basis-panels.test.mjs:87-93` and the `generatedAt` start/end mismatch
  (`rookie-basis-run.mjs:162` vs `:545`) are nits left as they are.

## Fix pass 1 (fix-applier; data repo; local commits, not pushed)

Messages end `(rookie-basis-refit)`. Do only what is below; stop and report on anything that does not fit.

1. **Frozen crosswalk for F4's `rookiePathAll`.**
   - New committed fixture `test/fixtures/rookie-total-crosswalk-2026-10-07.json`, built from
     `git show cde2d06:nflverse/playerids.json` with the existing generator `scripts/fixtures/build-rookie-pin-crosswalk.mjs`
     (add a rev/output argument if it has none; keep its default output byte-identical). Its header records the
     command and the rev.
   - `DEFAULT_LOAD` (`scripts/panel-run.mjs:~105`) gains `loadRookieTotalCrosswalk: () =>
     readJson('test/fixtures/rookie-total-crosswalk-2026-10-07.json')`.
   - `runRookiePanels({ …, rookiePathAllCrosswalk = 'live' })`: with `'frozen'` (and a load that has the loader), the
     `rookiePathAll` assembly (`:2006-2010`) — and only it — takes position, birthdate, draft info **and its entrant
     enumeration** from `pinCrosswalkMaps(load.loadRookieTotalCrosswalk())`, in both bases; `legacyGated`, debut and
     the pin are untouched. Record `rookiePathAllCrosswalk: 'live' | 'frozen'` in meta. Default `'live'` → `--rookie`
     stays byte-identical (re-check the §2.6 hash). If `rookiePathAll`'s entrants cannot be separated from debut's
     without changing debut rows, stop and report.
   - `scripts/rookie-basis-run.mjs` calls `runRookiePanels` with `rookiePathAllCrosswalk: 'frozen'` for both bases.
     G0b F4 and the pinned `rookiePathAll` byRungCell check must now pass (expect 3,848 rows, undrafted 0.835); if not,
     F4 stays `stop-and-report` and you report the numbers.
2. **`same` vs `WORSE` aligned to the plan (§4.3).** A `same` entry never counts as the required `BEATS`, but a `same`
   entry labelled `WORSE` does block a wire. `lib/rookieBasisRefit.mjs:121` (`labelled`) and the rule text
   (`scripts/rookie-basis-run.mjs:90`, `ROOKIE_BASIS_RULE_MD`) change accordingly; update the truth-table test.
3. **Rule text records the ratified G0b reading** with "(ratified by Anton, 2026-10-17)" appended to the G0 sentence
   at `:75`; no other rule wording changes.
4. **Missing `analyze` test** (`test/rookie-basis-run.test.mjs`): one synthetic case where G0b passes and F1 wires —
   assert F4's shipped composition uses the F1 league constants (`predS`), and that a stubbed `run46` returning
   `trips: true` turns F1 into `stop-and-report`; plus one case with `make46` building the two in-season invocations
   with `--rookie-constants` and the shipped 2a path. In-memory only (Invariant 10).
5. **Commits:** (a) items 1–4 code + tests, `npm test` green — commit **before** the re-run; (b) re-run
   `node bin/backtest.mjs --rookie-basis --write`. The artifacts are dated 2026-10-17 and overwrite A3b's three files:
   the diff against `6aaf7d2` must show F1/F2/F3/F5 entries, constants and verdicts unchanged (deep-equal ignoring
   `generatedAt`/`headRev`/runtime and the rule-text edits of items 2–3); only F4's section, G0b-F4, the pinned-artifact
   check, `families.F4` and the verdict lines for F4 move. If anything else moves, stop and report. Commit the
   artifacts alone.
6. **Hand back:** both SHAs; the F4 result in full (G0b, half/interim/league factors, entries Δ [95%] / label, pooled
   [99%], verdict); the confirmation of item 5's unchanged families; the `--rookie` §2.6 hash; `npm test`, `npm run
   smoke`; deviations.

## Fix pass 1 verification (Session 1, 2026-10-17)

Applied as `ec01e2b` (code + tests, before the re-run) and `6bb871d` (artifacts only); local, not pushed. F4: G0b
passes (3,848 rows, 0.796/0.835, frozen `cde2d06` crosswalk); league factors day3 0.866 / undrafted 0.944; both
entries WORSE (Δ +0.677, +0.541), pooled 99% [0.511, 0.652] → `do-not-wire`. F1/F2/F3/F5 unchanged vs `6aaf7d2`
(deep diff); default `--rookie` hash unchanged; `npm test` 1712/1717 (5 skipped), smoke green.

implementation-reviewer round 2 (final automatic round): no blocker; code faithful to Fix pass 1 and §4.2 F4,
re-derived independently. Surviving flags for Anton:
- **should-fix (plan-level): F4 estimator vs loss.** The factor is a ratio of sums (calibrates the mean) but is
  judged by MAE (rewards the median) on a zero-heavy population (37.5% of day-3, 65.9% of undrafted rows score 0).
  League realised totals of these rookies rise faster than the veteran scale (realised league ÷ half 1.245 / 1.298
  vs s ≈ 1.144 / 1.148; mostly WR, then RB), so f_L ≈ f_H × ratio ÷ s. Out of sample the refit is the calibrated
  arm (Σpred ÷ Σreal 1.000 / 1.003 vs interim 0.918 / 0.887; RMSE equal), but any larger factor raises MAE. The
  verdict is the correct reading of the pre-registered rule; it is not evidence that the interim is better calibrated.
- **nit:** no unit test of `runRookiePanels`' `'frozen'` path or the builder's `--rev` mode.
- **nit:** the artifacts do not record that F4's rows used the frozen `cde2d06` crosswalk.
- Reviewer disclosure: it ran the fixture builder by mistake; the pin fixture was rewritten byte-identical (`git
  status` clean — confirmed by Session 1).
