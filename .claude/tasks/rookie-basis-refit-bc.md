# D-45 — Stages B and C (app wiring, data close-out)

Part of [`rookie-basis-refit.md`](rookie-basis-refit.md) (split out for size). Starts only after Anton's review of Stage A
and Session 1's push of it. `F1…F5`, A1/A2 and §-numbers refer to the main file.

## 6. Stage B — app (`sleeper-dashboard`)

First `git -C ../sleeper-dashboard-data log -1` shows the pushed Stage A. Messages end `(rookie-basis-refit)`.

### B1 — on any `wire` (one commit)

- **Fixture + source.** Byte-copy `backtests/<date>-rookie-league-constants.json` to
  `src/__fixtures__/rookie-league-constants-<date>.json`; add `ROOKIE_LEAGUE_CONSTANTS_SOURCE = { file, commit,
  generatedAt, fixture }` (`QB_ROOKIE_LEVEL_SOURCE`'s shape). The fixture is a test-only provenance oracle
  (`docs/navigation.md:57`): production code never imports it.
- **Tables.** Per wired family a league table beside the half one (`ROOKIE_BASELINE_PPG_LEAGUE`,
  `ROOKIE_CALIBRATION_LEAGUE`, `ROOKIE_CEILING_LEAGUE`, `QB_ROOKIE_STARTER_PPG_LEAGUE`, `ROOKIE_TOTAL_FACTOR_LEAGUE`,
  `POSITION_PRIOR_PPG_LEAGUE` — F5 only for the positions §4.2 F5 lets decide). Half tables stay (half-PPR loads, and
  the fallback under A2-recommended).
- **Fingerprint (A2-recommended only).** Inline the fit's scoring as a runtime constant `ROOKIE_LEAGUE_SCORING_SHA1`
  = sha1 of a canonical serialisation (keys sorted, numbers as JSON, keys restricted to those that score a QB/RB/WR/TE
  stat — IDP/K/DST keys dropped); a helper `scoringFingerprint(settings)` computes it live. A provenance test
  recomputes it from a byte copy of the data repo's `test/fixtures/league-scoring-2026-10-14.json`
  (`src/__fixtures__/league-scoring-2026-10-14.json`).
- **Mismatch signal (Anton, A2).** A league-scored load (`projectionBasis === 'league'`) whose fingerprint does
  not match gets `constantsBasis: 'interim'` — so every rookie row's `rookieConstantsBasis` is `'interim'` — and
  emits **one** diagnostic note per load (a single `console.warn` naming the expected and live fingerprints and
  the differing scoring keys, deduplicated per fingerprint so re-renders and Strict Mode do not repeat it). Test:
  a mismatched league-scored load → `'interim'` on the row and exactly one note; a matching load → no note; a
  half-PPR load → `'interim'` and no note (it is not a mismatch).
- **Selection — `constantsBasis: 'league' | 'interim'`**, computed once in `App.jsx` beside `projectionBasis`
  (`:234`; `leagueData.scoringSettings` is in scope there): `'league'` iff `projectionBasis === 'league'` (and, under
  A2-recommended, the fingerprint matches); else `'interim'`. Thread it through every consumer so the season
  projection and the dynasty priors cannot disagree: `computeNextSeasonProjection` (`App.jsx:484`, `:694`),
  `buildRookieDynastyPriors`' `projectionArgs` (`:581-590`), `computeDynastyScore` ×3 (`:471, :495, :605`) →
  `computeProspectScore` (`dynastyScore.js:735, 1001`), each memo's dependency array. Under `'league'` the wired
  families read their league table at scale 1; unwired families keep half × `positionBasisScale`.
- **Factors.** New rookie factor `rookieConstantsBasis` (mandatory on any wire, both A2 options — §0 S7):
  `'interim'` or `'league:<families>'`, the same domain as the data mirror's string (§3.1). `rookieBasisScale` keeps
  the **measured** scale; readers of the composition identity branch on `rookieConstantsBasis`. 69 → 70 rookie keys:
  `factorsSchema.test.js` (`:18, :82` comments, `:228` count), `CLAUDE.md:99` ("69 rookie keys"),
  `docs/signal-registry.md` row (CR-18). Update the D-13 identity tests (`seasonProjection.test.js:3469-3471, 3521`)
  to branch the same way.
- **Scoring-affecting changes, named** (league loads only):
  - F1 → every rookie-path `basePPG`, `rookieCeilingPPGPre`, `projectedPPG`, `projectedTotalPts`; through
    `projectedPPG`, the 2a ROS/`next` rookie priors (`buildScoringPosteriors`), arm B (`buildRookieDynastyPriors` →
    `buildProspectLevel`) and so the dynasty score of yearsExp 0/1 players; a no-group QB's starter prior (`:508`).
  - F2 → `rookieCeilingKnee/Asymptote`, ceiled `projectedPPG`/total, and the same downstream set as F1.
  - F3 → yearsExp-0 QB `qbStarterPPG`, rookie `chain` rows' `projectedPPG`/total, QB `next`/start priors, frozen
    `starterPPG` read-back.
  - F4 → day-3/undrafted RB/WR/TE `projectedTotalPts` only.
  - F5 → `computeProspectScore`'s `priorPPG` for the decided positions → arm-A starts (second-year WRs), PATH B
    (seasonHistory ≤ 2) and no-entry rows → dynasty score. PATH B was not evaluated (§4.2 F5); say so in the comment.
- **`PRIOR_MODEL_FROM`** (`inSeasonConstants.js:42`): bump in this commit whenever F1, F2, F3 or F4 wires (the rule
  at `:37-38`: any change moving `projectedPPG`/`projectedGames`/rookie `projectedTotalPts`; rookie-total-wiring
  bumped for a total-only change), by rookie-total-wiring's date rule. F5-only: no bump (dynasty-only; the frozen
  prior reads `projectedPPG`/`starterPPG`). Re-record `priorModelFrom.test.js`'s GOLDEN with `recordedUnder` equal to
  it **and add fixtures that exercise the change**: today every fixture runs `scoringSettings: null` / interim, so a
  re-record would only move `recordedUnder` — add one rookie fixture per wired family under `constantsBasis:
  'league'` (F4: a day-3 or undrafted RB/WR/TE total).
- **Tests.** Per wired family a provenance test re-deriving the league values from the fixture
  (`qbRookieLevelConstants.test.js` pattern); half provenance tests unchanged (`seasonProjection.test.js:3206` holds
  under interim); selection tests (league tables at scale 1; `'interim'` byte-identical to today; fingerprint
  mismatch → interim, under A2-recommended); golden.
- **PROVISIONAL tags — rewrite, never delete** while a fallback derivation remains. The five tags today:
  `seasonProjection.js:24` (baseline), `:56` (ceiling), `:75` (QB level), `dynastyScore.js:58`
  (`MIN_BASIS_SCALE_ROWS`), `:502` (`POSITION_PRIOR_PPG`). Wired family: "league table (D-45) on league loads ·
  half-PPR × positionBasisScale remains the fallback on half/mismatched loads"; F1/F5 add "hand-set level,
  transported by ρ". Unwired: "league-basis refit (D-45, `grading/<date>-rookie-basis-verdict.md`) did not beat the
  interim; half-PPR × positionBasisScale stands". `:58`: "retired for <families> on league loads; kept for <the
  rest> and the fallback". `ROOKIE_CALIBRATION`/`ROOKIE_TOTAL_FACTOR` have no tag — update their comments
  (`seasonProjection.js:256` "(D-45)"). Paste `grep -rn "PROVISIONAL(" src/` output.
- **Docs.** `docs/projection.md` (rookie sections, `:352` "(D-45)"), `docs/dynasty-scoring.md:72`
  (`POSITION_PRIOR_PPG`, basis scale), `docs/navigation.md`/`docs/nav/utils.md` fixture lists, `docs/signal-registry.md`.

### B1′ — no wire
Comment-only commit: the five tags rewritten as "did not beat the interim" (`:58` with its own wording), the
calibration/total comments updated. No value, fixture or table moves; no `PRIOR_MODEL_FROM` move.

### B2 — registry (`docs/cross-repo-registry.md`, mirrored region only; same day as C1)
Every outcome: CR-14 (main §9 exact text), CR-15/CR-25/CR-27 data-side additions. On a wire, the conditional edits
of main §9. Session 1 drafts the conditional text from the verdict, before B starts, into this file. Gates (D-46 B2):
claim check (`extractSymbolFileClaims` + `symbolResolvesIn`) against pushed data HEAD — zero unresolved; diff only
the registry; region md5 recorded.

### B3 — backlog
D-45 → "in progress — Stage C pending"; each `stop-and-report` family and any §4.6 trip becomes a new D-id (grep the
highest first).

Done (app): `npm test`, `npm run lint`, `npm run build`; on B1 a dev-server smoke of one rookie row (pop-up `basePPG`
and the Market projection show the league value) and one second-year WR's dynasty score if F5 wired. Session 1
reviews and pushes (`git pull --rebase` first).

## 7. Stage C — data, same day

- **C1** registry byte copy (`REGISTRY_MIRROR=1 node --test test/registry-mirror.test.mjs`, md5 equal to B2's,
  `npm test`, diff only `cross-repo-registry.md`).
- **C2 — only on a wire.** `CURRENT_ROOKIE_CONSTANTS_MODEL` → `league-refit` for the wired families (reading the
  committed league constants file); `interim` keeps reproducing pre-boundary captures and committed artifacts. Every
  data reader of the composition identity branches on `rookieConstantsBasis`: `scripts/league-basis-run.mjs:98-103`
  (position recovery `basePPG / rookieBasisScale`), `lib/qbRookieLevel.mjs:212` (`levelHalf`), T-RM16; check
  `lib/rookieCapturedLevel.mjs`. Mirror parity on the first post-push capture's rookie rows (slim fixture, counts
  pinned, T-RM16 pattern) once it exists — until then a dated watch D-id (as D-70). **Anchor boundary 10** in
  `grading/anchor-policy.md`: table row (app B1 SHA, app push time, path rookie [+ dynasty if F5], wired families);
  section: `factors.rookieConstantsBasis` present → post-boundary, value names the constants; F5-only moves no
  captured projection field (dynasty score is not captured — say so); header counts, "Boundaries by path".
- **C3** docs: `CLAUDE.md` Commands row (`--rookie-basis`; `--basis league` on `--rookie`/`--fullpipeline`/
  `--rookie-total`/`--qb-rookie-level`; `--rookie-constants`) under the 25,000-byte ceiling (prune if needed, never
  raise); README backtest section; task files with review/fix-pass sections.

Done: `npm test`, `npm run smoke`, `git pull --rebase`, push. No CDN purge. Session 1 moves D-45 to Done with both
repos' SHAs.

---

## Drafted for the outcome (Session 1, 2026-10-17): no family wires → B1′ + B2 + B3, then C1 + C3

Verdict: data `grading/2026-10-17-rookie-basis-verdict.md` @ `6bb871d` (pushed `eb1b661..2c01446`): F1–F5 all
`do-not-wire` (F4 after Fix pass 1; Anton 2026-10-17: keep do-not-wire — it also fails D-13's own per-player rule).
No value, table, fixture, factor key or `PRIOR_MODEL_FROM` moves. Messages end `(rookie-basis-refit)`.

### B1′ — exact replacements (one app commit)
- `src/utils/seasonProjection.js:24` → `// PROVISIONAL(heuristic): hand-set half-PPR baseline · scaled at runtime by positionBasisScale; D-45's league-basis refit (data grading/2026-10-17-rookie-basis-verdict.md) did not beat it out of sample · a league-basis refit that beats the interim`
- `:56` → `// PROVISIONAL(heuristic): half-PPR-calibrated knee/asymptote · scaled at runtime by positionBasisScale; D-45's league-basis refit (data grading/2026-10-17-rookie-basis-verdict.md) did not beat it out of sample · a league-basis refit that beats the interim`
- `:75` → `// PROVISIONAL(heuristic): half-PPR-calibrated starter level · scaled at runtime by positionBasisScale; D-45's league-basis refit (data grading/2026-10-17-rookie-basis-verdict.md) did not beat it out of sample · a league-basis refit that beats the interim`
- `:256` → `// Applied to projectedTotalPts only, never projectedPPG/projectedGames. Half-PPR fit, applied without a basis rescale: D-45's league refit was better calibrated on league totals but worse per player, so it stands (re-measured for the 2026 class, D-75).`
- `ROOKIE_CALIBRATION` comment block (`:34-41`): add as its last line `// Half-PPR fit, applied unscaled; D-45's league-basis refit did not beat it out of sample (data grading/2026-10-17-rookie-basis-verdict.md).`
- `src/utils/dynastyScore.js:58` → `// PROVISIONAL(heuristic): measured basis scale, interim single scale per position · transports the half-PPR rookie and prior constants; D-45's league-basis refit wired no family, so it serves all five · a league-basis refit that beats it`
- `:502` → `// PROVISIONAL(heuristic): hand-set half-PPR prior PPG · scaled at runtime by positionBasisScale (computeProspectScore's basisScale); D-45's league-basis refit did not beat it out of sample · a league-basis refit that beats the interim`
- `docs/projection.md:166` — replace "Interim until the data-side custom-basis refit (D-45); tagged `PROVISIONAL(heuristic)`." with "D-45's league-basis refit (data `grading/2026-10-17-rookie-basis-verdict.md`) did not beat this interim for any family, so it stands; tagged `PROVISIONAL(heuristic)`."
- `docs/projection.md:352` — replace "Half-PPR fit; dimensionless (D-45), so no basis rescale." with "Half-PPR fit, applied without a basis rescale; D-45's league refit (day-3 0.866, undrafted 0.944) was better calibrated on league totals but worse per player, so the half-PPR factor stands (re-measured for the 2026 class, D-75)."
- `docs/dynasty-scoring.md:72` — replace "interim until the data-side refit, D-45" with "D-45's league-basis refit did not beat it, so it stands".
- Gate: `grep -rn "D-45" src docs` shows only the new wording; paste `grep -rn "PROVISIONAL(" src/` (same five sites, same count). No test changes are owed (comments/docs only); `docsAvailabilityClaims.test.js` must stay green.

### B2 — registry edits (app `docs/cross-repo-registry.md`, mirrored region only; one commit)
- **CR-14** — Data side: replace "`leagueRatio` in `lib/qbRookieLevel.mjs` (`--qb-rookie-level`, report-only league cross-check) scores season `stats` with `RATE_KEYS` stripped, the app's season-scoring convention" with "`leagueRatio` in `lib/qbRookieLevel.mjs` (`--qb-rookie-level`, report-only season-ratio cross-check) scores season `stats` through the `lib/fantasyPoints.mjs` port `scoreSeasonStats`, its `deriveFirstDowns` flag set per season by `seasonEmitsFirstDownBonus` in `scripts/qb-rookie-level-run.mjs` (D-45)". Triggers: after `lib/qbRookieLevel.mjs` add `, scripts/qb-rookie-level-run.mjs`. Mirror: replace "`scripts/qb-rookie-level-run.mjs` still stops on a non-zero `bonus_fd_qb` (D-45 re-routes it)." with "`scripts/qb-rookie-level-run.mjs` scores through the same port since D-45 (no `bonus_fd_qb` stop)."
- **CR-15** — Data side: append, before its final period if any, "; since rookie-basis-refit (D-45) `lib/rookieMirror.mjs` (`ROOKIE_CONSTANTS_MODELS`, `CURRENT_ROOKIE_CONSTANTS_MODEL`), `lib/rookieBasisRefit.mjs`, `scripts/rookie-basis-run.mjs` (`runRookieBasis`), `scripts/rookie-constants-file.mjs` (`wiredConstantsOf`) and `scripts/panel-run.mjs` (`runRookiePanels`, `runFullPipeline` — their `league` basis)". Triggers: append `, lib/rookieBasisRefit.mjs, scripts/rookie-basis-run.mjs, scripts/rookie-constants-file.mjs` to the data-side list. Mirror: append " **rookie-basis-refit (D-45):** the rookie constants are versioned by model — `interim` (half-PPR × `positionBasisScale`, the app's only model) and `league-refit` (a family's league table at scale 1, reproducible, unshipped); no family wired (`grading/2026-10-17-rookie-basis-verdict.md`). A later wire adds a family to `league-refit` as a new model, never an overwrite."
- **CR-25** — Triggers: append `, scripts/rookie-constants-file.mjs` to the data-side list. Mirror: append " **rookie-basis-refit (D-45):** `--inseason`/`--inseason --dynasty` take `--rookie-constants <file>` (league basis only) to re-fit the k against a candidate league rookie or prospect prior; plumbing only — no k moved, and the half-PPR path is byte-identical. `POSITION_PRIOR_PPG` and the rookie constants keep their half-PPR values × `positionBasisScale`."
- **CR-27** — Mirror: append " **rookie-basis-refit (D-45):** `--qb-rookie-level` admits `--basis league`; the league refit of the starter level did not beat the half-PPR level × `positionBasisScale` (`do-not-wire`), so the pinned file stands."
- Gates: claim check (`extractSymbolFileClaims` + `symbolResolvesIn` from `../sleeper-dashboard-data/lib/registry.mjs`) over the edited region against data HEAD `2c01446` — zero unresolved; `git diff --stat` only the registry; region md5 (`sed -n '/^<!-- CR-REGISTRY-BEGIN -->$/,/^<!-- CR-REGISTRY-END -->$/p' docs/cross-repo-registry.md | md5`) recorded.

### B3 — backlog (app `.claude/tasks/data-repo-backlog.md`; one commit)
- D-45 entry: add under its heading "**In progress — Stage C pending (2026-10-17).** Data `eb1b661..2c01446`: league-basis refit of the five rookie/prior families (`grading/2026-10-17-rookie-basis-verdict.md`); all `do-not-wire` (F4 after Fix pass 1, frozen `cde2d06` crosswalk). Interim half-PPR × `positionBasisScale` stands; app comments only (B1′)." — it moves to Done after Stage C's push.
- New **D-75**, placed directly after D-16:
  `### D-75 · Re-measure the ROOKIE_TOTAL_FACTOR bias on league basis for the 2026 class`
  `**Watch (dated 2027-01-05, with D-16).** Trigger: D-16's 2026-class debut append. Then re-measure, on league basis, the day-3 / undrafted RB/WR/TE total-points bias of the shipped composition for the 2026 class — the first class the factor never saw.`
  `**Found:** rookie-basis-refit (D-45, data `6bb871d`) · **Blocking:** no · **Size:** small, deferred until season end`
  Body: "D-45's F4 found the league ratio-of-sums factor higher than the shipped half-PPR one (day-3 0.866 vs 0.796, undrafted 0.944 vs 0.835) and better calibrated out of sample (Σpred ÷ Σreal 1.000 / 1.003 vs 0.918 / 0.887), but worse per player (Δ |error| +0.68 / +0.54 points; MAE favours a smaller factor on a population where 38% / 66% of seasons score 0). It is `do-not-wire` under D-45's pre-registered rule and also fails D-13's own rule, which required the per-player error to beat. Pre-register the re-measure with **bias primary** (Σpred ÷ Σreal on league totals, per group) and a guard that the per-player error is **no worse** (paired Δ |error| CI not above 0). Wiring a league factor would bump `PRIOR_MODEL_FROM` (it moves rookie `projectedTotalPts`)."
- Gate: the new D-id is the highest (`grep -o "D-[0-9]\+" … | sort -n` → D-75).

### C (data, same day, after the app push)
- **C1** registry byte copy of the app region at the pushed app SHA; gates as §7.
- **C3** docs: `CLAUDE.md` Commands → Backtest row gains `--rookie-basis` and the `--basis league` note on `--rookie-total`/`--qb-rookie-level`; Panel row notes `--rookie`/`--fullpipeline` admit `--basis league`; README backtest section: one paragraph "League-basis refit of the rookie and prior constants (D-45)" naming the command, the five families and the verdict path. Ceiling 25,000 bytes (prune, never raise).
- Then Session 1 pushes data and moves D-45 to Done (app) with both repos' SHAs.
