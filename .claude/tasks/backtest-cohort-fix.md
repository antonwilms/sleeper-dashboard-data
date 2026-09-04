# Task: fix the advstats backtest cohort/CLI layer (3 symptoms)

**Repo:** sleeper-dashboard-data
**Scope:** `bin/backtest.mjs`, `lib/backtest.mjs`, new `scripts/backtest-run.mjs`, `test/backtest*.test.mjs`,
docs. **Read-only over data; Cross-repo impact: none.**
**Implementer:** sonnet. Planning-only opus task — **do not edit source from the opus session**.
Don't re-list CLAUDE.md invariants — point to them (this tool is offline analysis: no served file, no
manifest entry, no schemaVersion).

The tool (built last session, 131 suite tests green) produces broken output on real data. I reproduced
both commands read-only and traced each symptom to its offending line. The synthetic unit fixtures
diverged from the real file shapes, which is *why* 131 tests stayed green while the tool was broken.

---

## 0. Reproduction & evidence (traced, not guessed)

Backfill on disk: `nflverse/advstats/{2012–2018,2020–2024}.json` (2019 absent — write failed),
`nfl/season-totals/{2012–2025}.json`. Both reproductions used the default panel, only 2019 skipped.

| Probe | Result |
|---|---|
| `node bin/backtest.mjs --metric target_share --position WR` | **n=0**, all metrics null, "Predictor years:" empty |
| `node bin/backtest.mjs --metric targetShare --position WR` (camelCase) | **n=566**, raw r=**+0.6826**, β=+0.5063, "Outcome years: NaN" |
| `node bin/backtest.mjs --validate` | WR+TE β=−0.0953 / RB β=−0.2823; own-rate β=+0.04/+0.02; "years: none"; n=833/341 |
| advstats envelope keys (2023) | `schemaVersion, season, generatedAt, rowCount, unmapped, players` — **field is `season`, not `year`** |
| existing test helper `makeAdvstats(year, …)` | returns `{ year, players, … }` — **uses `year`**, diverging from production `season` |
| pre-2020 `off_snp` (2015/2018) | 0 of ~230 WRs have `off_snp>0`; 2020/2021 ~85% present → snapShare null pre-2020 |
| `overallShare` vs advstats `targetShare` (2023) | Davante 0.331 vs 0.33, Lamb 0.301 vs 0.299 — **overallShare is computed correctly** (= target_share) |
| teamRzShare control-set sweep (WR+TE, 2012–2024) | controls=[ ]→+0.51; [rzOwnRate]→+0.59 (own-rate −0.24); [overallShare]→−0.06; [overallShare,rzOwnRate]→−0.087; full D3 set→−0.095 |

---

## 1. Root causes & fixes per symptom

### Symptom 1 — path divergence (833 vs 0): metric-name snake_case/camelCase mismatch
**Root cause.** `bin/backtest.mjs:309` does `const metrics = metricArg === 'all' ? METRICS : [metricArg];`
— the single-metric path passes the **raw CLI value** straight through as a **row-field key**. The CLI's
own help (`bin/backtest.mjs:16`) documents snake_case (`target_share|air_yards_share|…`), but the row
fields and `METRICS` are camelCase (`targetShare|airYardsShare|…`). So `--metric target_share` →
`listwiseSurviving(rows,'target_share')` and `standardizedRegression(predictor:'target_share')` read
`row['target_share']` = `undefined` → **every row listwise-dropped → n=0**, all stats null. `--validate`
hardcodes `'teamRzShare'`, so it is unaffected → 833. **The divergence is in the metric-key lookup, not in
`assembleCohort`/`buildCohortRows` (which both paths share correctly).**

**Fix.** Add a metric normalizer (accept both casings, reject unknown) and apply it to the single-metric
path. In `scripts/backtest-run.mjs` (new — §2):
```js
const METRIC_ALIASES = {
  target_share:'targetShare', air_yards_share:'airYardsShare', wopr:'wopr', racr:'racr',
  targetShare:'targetShare', airYardsShare:'airYardsShare',           // camelCase pass-through
};
export function normalizeMetric(arg) {
  const m = METRIC_ALIASES[arg];
  if (!m) throw new Error(`[backtest] unknown --metric '${arg}' — use target_share|air_yards_share|wopr|racr|all`);
  return m;
}
```
`metrics = metricArg === 'all' ? METRICS : [normalizeMetric(metricArg)]`. Also **validate `--position`**:
`all` → `POSITIONS`; `WR|TE|RB` → `[pos]`; anything else → throw (today a bad position silently builds 0
rows). Align `bin/backtest.mjs` help + CLAUDE.md to state both casings are accepted (canonical = snake_case).

### Symptom 2 — year accounting empty: `buildCohortRows` reads `.year`, envelope has `.season`
**Root cause.** `lib/backtest.mjs:279` sets `predictorYear: advstatsY.year`, but the advstats envelope
field is **`season`** (confirmed on disk). So `predictorYear` is `undefined` on **every** row →
`predictorYears = [...new Set([undefined])].sort()` → joins to `''` → "predictor years: none" in *both*
runs (including n=833), and `outcomeYears = predictorYears.map(y=>y+1)` → `[NaN]`. The existing unit test
passed only because the fixture helper `makeAdvstats` emits `{ year }` (the wrong field) — masking the bug.

**Fix.** `lib/backtest.mjs` buildCohortRows: `predictorYear: advstatsY.season ?? advstatsY.year`
(canonical `season`; tolerate `year` for safety). This single fix also **restores honest effective-panel
reporting** (decision below) since `predictorYears` derives from surviving rows. Update the test helper to
the production shape (§3) so the fixture can never diverge again.

### Symptom 3 — "sign-flipped" βs: NOT an orientation bug; it is `overallShare` collinearity
**Root cause (brief's hypothesis disproven by trace).** The brief suspected a negated outcome / reversed
Y→Y+1 lag. **Ruled out:** `targetShare` β = **+0.51** and *every* raw correlation vs next-season PPG is
positive (teamRzShare +0.56, overallShare +0.69, snapShare +0.54). A flipped outcome/lag would flip
`targetShare` too — it doesn't. Orientation verified correct: `outcomePPG = totalsY1.fantasyPoints /
totalsY1.gamesPlayed` is from Y+1, positive, entering standardization unnegated. Values verified correct:
`overallShare` matches the independently-derived advstats `targetShare` to rounding.

The negative team-RZ-share **partial** β is **pure multicollinearity**: `overallShare` *is* target-share
here and is ~0.83-collinear with `teamRzShare` (algebraically team-RZ-share ≈ own-rate × overall-share ×
team-ratio). The control-set sweep shows controlling for own-rate **alone** reproduces the D3 qualitative
pattern (team-share +0.59, own-rate −0.24); adding `overallShare` inverts it. **No control set reproduces
the numeric +0.17/+0.20 anchor** on this repo's files (it is +0.5–0.6 without overall-share, or −0.06 to
−0.10 with it). The app-side D3 number was measured on a different basis (its `historicalTeamTotals` over
all rostered players + factor transforms, 2012–2025 with snap-share neutralized pre-2020) and is not
numerically reproducible from season-totals here.

**Fix (resolution — owner deferred the call; chosen approach + rationale).** Make `--validate` a faithful
**qualitative** D3 trust check, and remove the unreproducible numeric gate:
- **D3 `--validate` control set = `['rzOwnRate', 'snapShare']`** (drop `overallShare`). Rationale: the
  app's D3 distinguishes team-share from **own-rate** (corr ≈ 0.39 — our teamRzShare~rzOwnRate = 0.408
  matches); `overallShare` (corr 0.83, = target_share) is redundant with the predictor under test and
  inverts the partial. The tool's existing collinearity flag (`|r|>0.8`) is exactly why it must be excluded
  — surface that in the output.
- **PASS criteria (replace the numeric ±tolerance gate):** `teamRzShare β > 0` **and** `rzOwnRate β < 0`
  **and** `monotonic` quintiles **and** `pearson(teamRzShare, outcomePPG) > 0`. On the effective
  (snap-available) 2020–2024 panel this PASSes (team-share ≈ +0.52, own-rate ≈ −0.23).
- **Keep the app-side reference visible, do not gate on it.** Print `D3_TARGETS` (+0.17/+0.20) and the
  measured β with a one-line note: "*Reference is the app-side 2012–2025 result on `historicalTeamTotals`;
  not numerically reproducible from season-totals (measured β ≈ +0.5 on the snap-available 2020–2024
  panel). Do not widen tolerance or force the numeric match.*" Keep `D3_TARGETS`/`D3_TOLERANCE` exported
  as informational constants; `D3_TOLERANCE` no longer feeds PASS.
- **Do NOT change the advstats metric runs' controls** — they keep `[overallShare, snapShare, rzOwnRate]`.
  There `overallShare` collinearity is the *intended* decision-4 check (target_share's +0.51 partial
  despite r=0.895, with the HIGH flag firing, is a real finding: it carries signal beyond season-totals
  overall-share — not a bug).

### off_snp-2020+ handling — confirmed correct, report the panel honestly
`buildCohortRows` already sets `snapShare = null` when `off_snp` is absent/0 (it is **not** coerced to 0),
and listwise deletion drops those rows. Confirmed pre-2020 `off_snp` is absent → any model with `snapShare`
as a control (all metric runs and the new `--validate` set) has an **effective panel of ~2020–2024**. After
the symptom-2 fix this is reported correctly. **Add an explicit effective-panel line** to both report
formatters: `Effective panel: <minYr>–<maxYr> (pre-2020 dropped — off_snp not tracked)`.

---

## 2. Refactor for testability (required by the integration-test mandate)

The current monolithic `bin/backtest.mjs` runs only as a CLI and can't be integration-tested. Mirror the
**grade split** (`lib/grade.mjs` pure / `scripts/grade-snapshot.mjs` adapter / `bin/grade.mjs` CLI): extract
orchestration into a new **`scripts/backtest-run.mjs`** with an **injectable loader**, leaving `bin/` thin.

`scripts/backtest-run.mjs` exports:
- `normalizeMetric(arg)`, `normalizePosition(arg)` (§1).
- `assembleCohort({ position, fromYear, toYear, minOutcomeGames, load })` — `load = { loadAdvstats(year),
  loadSeasonTotals(year) }`; defaults to disk-backed readers (current `loadAdvstats`/`loadSeasonTotals`).
  Same year loop / skip logic as today.
- `runMetric(rows, metric, position, opts)` — unchanged logic (controls `[overallShare, snapShare,
  rzOwnRate]`), now reachable from tests.
- `runValidate({ fromYear, toYear, minOutcomeGames, load })` — D3 controls `[rzOwnRate, snapShare]`,
  qualitative PASS (§1 symptom 3); returns the result rows (don't `process.exit` inside).
- `D3_VALIDATE_CONTROLS = ['rzOwnRate', 'snapShare']` constant.

`bin/backtest.mjs` keeps arg parsing, the disk-backed `load`, the human/JSON formatters (add the
effective-panel line), `--write`, and `process.exit`; it imports the orchestration from
`scripts/backtest-run.mjs`. No behavior change beyond §1 fixes.

---

## 3. Tests to add (`node --test`, not Vitest)

### 3a. Fix the fixture-shape divergence (the reason 131 stayed green)
In `test/backtest.test.mjs`, change `makeAdvstats` to the **production envelope**:
```js
function makeAdvstats(season, players) {
  return { schemaVersion: 1, season, generatedAt: '2026-01-01T00:00:00.000Z',
           rowCount: players.length, unmapped: 0,
           players: Object.fromEntries(players.map(p => [p.sleeperId, p])) };
}
```
The existing `assert.equal(row.predictorYear, Y)` (B.1) now genuinely exercises the `.season` read and
would have caught symptom 2. Optionally give fixture players the full advstats per-player shape
(`gsisId/name/components`) so future field reads can't silently diverge.

### 3b. Unit-coverage gaps
- **`normalizeMetric`**: `target_share`→`targetShare`, `air_yards_share`→`airYardsShare`, camelCase passes
  through, `wopr`/`racr` unchanged, unknown throws. **`normalizePosition`**: `WR/TE/RB`/`all` ok, unknown throws.
- **`buildCohortRows` predictorYear from `season`**: build with `makeAdvstats(2021, …)` → assert every
  `row.predictorYear === 2021` (not undefined).

### 3c. Integration test — `test/backtest-integration.test.mjs` (the class of bug that escaped)
Use in-memory fixtures via the injectable `load` (no disk). Shapes mirror real files:
- advstats per year (via `makeAdvstats(season, players)`), each player:
  `{ gsisId, name, position:'WR'|'TE'|'RB', team, targetShare, airYardsShare, wopr, racr,
     components:{ targets, airYards, recYards, receptions, weeks } }`.
- season-totals per year: `{ [sleeperId]: { stats:{ rec_tgt, rush_att, rec_rz_tgt, rush_rz_att,
  off_snp, tm_off_snp }, gamesPlayed, fantasyPoints } }`.

**Fixture panel (3 predictor years incl. a pre-2020 year):**
- **2019** (pre-snap): season-totals rows **omit `off_snp`/`tm_off_snp`** → snapShare null → must drop.
- **2020, 2021**: full stats incl. `off_snp`.
- Outcomes in **2020, 2021, 2022** season-totals.
- ≥6 WRs + a few TEs across **2 teams** per year so each team `rec_tgt`/`rec_rz_tgt` ≥ `TEAM_DENOM_MIN`
  (20) and there is share variance. **Plant `outcomePPG` increasing in `targetShare`** (e.g.
  `fantasyPoints(Y+1) = round(gamesPlayed × (4 + 40 × targetShare(Y)))`, `gamesPlayed ≥ 6`) so the raw
  target_share↔next-PPG correlation is strongly positive. Give ≥5 survivors for 2020+2021 (k+1 with k=4).

**Assertions (each maps to a symptom):**
1. **n>0** for a single-position metric run: `runMetric(assembleCohort({position:'WR',…,load}), 'targetShare', 'WR', …).n > 0`. *(symptom 1)*
2. **snake_case == camelCase**: `normalizeMetric('target_share') === normalizeMetric('targetShare')`, and a
   single-metric run via each yields identical n>0. *(symptom 1)*
3. **Contributing years populated & correct**: metric run's `meta.predictorYears` deep-equals `[2020, 2021]`
   (2019 dropped for missing off_snp; 2022 has no Y+1) — **not `[]`/`[undefined]`/`[NaN]`**. *(symptom 2)*
4. **Positive raw correlation**: `runMetric(...).rawPearson > 0` (planted positive) for `targetShare`/WR. *(orientation)*
5. **Single vs pooled agree on overlap**: WR rows from `assembleCohort({position:'WR'})` equal the WR-subset
   of the `--validate` WR+TE pooling (same sleeperId set; identical `targetShare`/`teamRzShare`/`outcomePPG`
   per row). *(symptom 1 path-divergence guard)*
6. **Pre-2020 drop, cohort still builds**: `assembleCohort` over 2019→2020 builds rows (length>0) but those
   rows have `snapShare === null` and are absent from `runMetric`'s surviving set / `predictorYears`. *(off_snp handling)*
7. **`--validate` qualitative PASS**: with planted data where higher `teamRzShare` → higher next-PPG and
   higher `rzOwnRate` → lower next-PPG, `runValidate({…,load})` returns `teamRzShare β > 0`, `rzOwnRate β < 0`,
   `monotonic === true`, raw r > 0 → PASS, with `predictorYears` populated. *(symptom 3 resolution)*

---

## 4. Step sequence (implementer)
1. `lib/backtest.mjs`: `predictorYear: advstatsY.season ?? advstatsY.year`. Add `D3_VALIDATE_CONTROLS`
   (or define it in the adapter). Keep `D3_TARGETS`; mark `D3_TOLERANCE` informational.
2. New `scripts/backtest-run.mjs`: extract `normalizeMetric`/`normalizePosition`/`assembleCohort`/
   `runMetric`/`runValidate` with injectable `load`; `--validate` uses `[rzOwnRate, snapShare]` + qualitative PASS.
3. `bin/backtest.mjs`: import from the adapter; apply `normalizeMetric`/`normalizePosition`; add the
   effective-panel line + the D3 reference note to formatters; keep `--write`/exit codes.
4. `test/backtest.test.mjs`: fix `makeAdvstats` to the production `season` envelope; add 3b unit tests.
5. `test/backtest-integration.test.mjs`: add 3c with assertions 1–7.
6. Docs (§5). Run `node --test` (all green) and re-run both repro commands to confirm: metric run n>0 with
   positive raw r and populated years; `--validate` PASS with positive team-share β / negative own-rate β.

---

## 5. Docs updates
Minimal — runbook/clarity only.
- **README.md** Backtest section: add **Effective panel** note ("~2020–2024; pre-2020 rows dropped because
  `off_snp` is not tracked before 2020"); state the **D3 `--validate` is a qualitative trust check**
  (team-share β>0, own-rate β<0, monotonic, raw r>0) — the app-side +0.17/+0.20 anchor is **not numerically
  reproducible** here (different basis: app `historicalTeamTotals` over all rostered players, 2012–2025);
  clarify `--metric` accepts both `target_share` and `targetShare`. Add a **2019 advstats gap** runbook line
  (see §6).
- **CLAUDE.md** Backtest CLI block: change the `--metric M` line to canonical snake_case
  (`target_share|air_yards_share|wopr|racr|all`) and note camelCase is accepted; add one line that
  `--validate` is a qualitative D3 check on the ~2020–2024 snap-available panel. **Navigation map:** add
  `| `scripts/backtest-run.mjs` | Backtest orchestration adapter — `normalizeMetric`/`assembleCohort`/`runMetric`/`runValidate` with injectable loader; mirrors `scripts/grade-snapshot.mjs` |`
  and update the `bin/backtest.mjs` row to "thin CLI over `scripts/backtest-run.mjs`".

---

## 6. 2019 advstats write failure (note only — do not fix here)
`nflverse/advstats/2019.json` is missing (backfill write failed). Runbook: re-run
`node bin/update.mjs advstats --year 2019 --force` to fill it. **Impact on this tool: none** — 2019 is a
pre-2020 predictor year, so its rows are dropped for missing `off_snp` regardless; filling the gap will not
change any backtest result on the effective 2020–2024 panel. Investigating the write failure itself is a
separate `update-advstats` task.

---

## 7. Cross-repo impact
**None.** Read-only over `nflverse/advstats/*` and `nfl/season-totals/*`; touches only
`lib/backtest.mjs`, `bin/backtest.mjs`, new `scripts/backtest-run.mjs`, `test/backtest*.test.mjs`, and docs.
No served file, manifest entry, schemaVersion, or contract changes. The app consumes nothing from this tool.
