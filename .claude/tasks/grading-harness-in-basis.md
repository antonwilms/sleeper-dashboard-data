# Task: grading harness increment 2 — in-basis scoring for v2 snapshots

Upgrade the shipped grading harness to grade **v2** snapshots *in their own
scoring basis*: compute each player's actual target-season PPG with the
snapshot's stored `scoringSettings` (a dot-product over the season-totals `stats`
object), replacing the fixed-half_ppr approximation. **v1** snapshots (no
`scoringSettings`) keep the existing half_ppr/basis-match path **unchanged**.

This is the **plan only** (opus session). It is a **refactor of the shipped
harness**, not a rebuild, and a **new increment file** — do **not** overwrite the
as-built plan `.claude/tasks/grading-harness.md`. Implementation is a sonnet task.
**Do not edit source while planning.**

---

## Pre-flight findings (verified against the committed v2 snapshot + as-built code)

| Item | Finding | Consequence |
|---|---|---|
| **Committed v2 snapshot** | `snapshots/2026-06-13.json`: `schemaVersion 2`, `scoringBasis "custom"`, `targetSeason 2026`, **53 `scoringSettings` keys** (verbatim weights), per-player `projection` (`projectedPPG`, `projectedGames`, `confidence`, `factors`). | Real input exists; design against it. |
| **All 53 keys present in `stats`** | Every `scoringSettings` key (incl. kicker/DST keys `fgm_*`, `pts_allow_*`, `sack`, `def_td`…) appears in the season-totals `stats` key universe (union 2024–25). **0 dropped terms** for this snapshot. Kicker/DST keys are present because the file includes those positions; they're simply `0` for the graded skill players → contribute 0. | In-basis dot-product is exact + complete for this snapshot. Dropped-term detection still required generically (other leagues/seasons may reference an absent key). |
| **No rate keys in `scoringSettings`** | None of the 53 keys are non-additive rate stats. | Rate exclusion is defensive; never triggers on real Sleeper data, but must be tested + guarded. |
| **Non-additive `stats` keys (the denylist)** | Present in `stats` but never summable: `cmp_pct, def_kr_ypa, def_pr_ypa, down_3_pct, down_4_pct, fgm_pct, g2g_pct, kr_ypa, pass_rtg, pass_ypa, pass_ypc, pos_rank_half_ppr, pos_rank_ppr, pos_rank_std, pr_ypa, rec_ypr, rush_ypa, rz_pct`. | `RATE_KEYS` denylist for the defensive guard. |
| **App `calculateFantasyPoints`** | `src/utils/fantasyPoints.js`: loops `Object.entries(scoringSettings)`, skips `multiplier == null` and `statValue == null`, `total += statValue * multiplier`, returns `Math.round(total*100)/100`. Iterates **scoringSettings** keys (not stats keys) → never reads a stat the league doesn't score. | Faithful port = rate-safe by construction (rate keys aren't in scoringSettings; if a player's `stats` holds `rec_ypr`, it's never read). |
| **As-built actuals path** | `scripts/grade-snapshot.mjs → loadOutcomes(targetSeason)` builds `OutcomeRecord` from `gamesPlayed` + `fantasyPoints` (half_ppr): `actualPPG = gp>0 ? fantasyPoints/gp : null`, `played = gp>0`. | In-basis swaps the points source (`fantasyPoints` → dot-product) but keeps **divisor `gamesPlayed`** and the **0-GP rule** identical. |
| **basisMatch wiring** | `buildGradeInputFromSnapshot` sets `outcomeBasis='half_ppr'`, `basisMatch = scoringBasis==='half_ppr'`; `scoreProjections` (lib/grade.mjs:269) emits the "indicative only" caveat when `!basisMatch`. | For in-basis, set `outcomeBasis=scoringBasis`, `basisMatch=true` → that caveat correctly does **not** fire; numbers are authoritative. |
| **Self-test** | `runSelfTest()` builds outcomes inline from `test/fixtures/grade-outcomes-<year>.json` (bypasses `loadOutcomes`); wired into `npm run smoke` via `bin/grade.mjs --self-test`. | Extend it with an in-basis section using new fixtures + a pure in-basis builder it can call directly. |

---

## Routing (the one branch)

```
snapshot.scoringSettings present (v2) → in-basis path  (actuals via calculateFantasyPoints)
snapshot.scoringSettings absent  (v1) → existing half_ppr path, UNCHANGED
```
Branch on `snapshot.scoringSettings != null`. The v1 numeric behavior must be
byte-identical to today (regression-guarded by the existing `runSelfTest`).

---

## New file: `lib/fantasyPoints.mjs` (port — faithful mirror of the app)

```js
/**
 * lib/fantasyPoints.mjs — port of the app's scoring dot-product.
 * MUST mirror sleeper-dashboard/src/utils/fantasyPoints.js calculateFantasyPoints
 * (Cross-repo contract). Iterates scoringSettings keys, so non-additive rate
 * stats in `stats` are never read unless the league scores them.
 */

/** Faithful mirror — do not add rate-stripping here (keep it identical to the app). */
export function calculateFantasyPoints(stats, scoringSettings) {
  let total = 0;
  for (const [key, multiplier] of Object.entries(scoringSettings)) {
    if (multiplier == null) continue;
    const statValue = stats?.[key];
    if (statValue == null) continue;
    total += statValue * multiplier;
  }
  return Math.round(total * 100) / 100;
}

/** Non-additive stat keys that must never enter a dot-product (defensive guard). */
export const RATE_KEYS = new Set([
  'cmp_pct','def_kr_ypa','def_pr_ypa','down_3_pct','down_4_pct','fgm_pct',
  'g2g_pct','kr_ypa','pass_rtg','pass_ypa','pass_ypc','pos_rank_half_ppr',
  'pos_rank_ppr','pos_rank_std','pr_ypa','rec_ypr','rush_ypa','rz_pct',
]);
```

Rate exclusion is achieved in the **adapter** by stripping `RATE_KEYS` from
`scoringSettings` *before* calling `calculateFantasyPoints` — keeping the port a
byte-faithful mirror (the app never has rate keys in scoringSettings, so on real
data the strip is a no-op and the port matches the app exactly).

---

## Refactor: `scripts/grade-snapshot.mjs`

Extract two pure outcome-builders (testable without file I/O), then route.

```js
import { calculateFantasyPoints, RATE_KEYS } from '../lib/fantasyPoints.mjs';

/** Existing half_ppr logic, factored out unchanged. seasonTotals = parsed file. */
export function buildHalfPprOutcomes(seasonTotals) {
  const map = new Map();
  for (const [id, rec] of Object.entries(seasonTotals)) {
    const gp = rec.gamesPlayed ?? 0;
    const fp = rec.fantasyPoints ?? 0;
    map.set(String(id), {
      actualGames: gp, actualTotalPts: fp,
      actualPPG: gp > 0 ? fp / gp : null, played: gp > 0,
    });
  }
  return map;
}

/**
 * In-basis: actual points = calculateFantasyPoints(stats, sanitizedScoring) per player.
 * @returns {{ outcomes: Map, droppedTerms: string[], excludedRateKeys: string[], scoredKeyCount: number }}
 */
export function buildInBasisOutcomes(seasonTotals, scoringSettings) {
  // 1. exclude non-additive rate keys (weight ≠ 0)
  const excludedRateKeys = Object.keys(scoringSettings)
    .filter(k => RATE_KEYS.has(k) && scoringSettings[k]);
  const scoring = { ...scoringSettings };
  for (const k of excludedRateKeys) delete scoring[k];

  // 2. stats universe across the whole file
  const universe = new Set();
  for (const rec of Object.values(seasonTotals))
    for (const k in (rec.stats ?? {})) universe.add(k);

  // 3. dropped terms = scored (non-zero, non-rate) keys absent from the universe
  const droppedTerms = Object.keys(scoring)
    .filter(k => scoring[k] && !universe.has(k));
  const scoredKeyCount = Object.keys(scoring).filter(k => scoring[k] && universe.has(k)).length;

  // 4. per-player in-basis points (divisor + 0-GP rule unchanged)
  const map = new Map();
  for (const [id, rec] of Object.entries(seasonTotals)) {
    const gp  = rec.gamesPlayed ?? 0;
    const pts = calculateFantasyPoints(rec.stats ?? {}, scoring);
    map.set(String(id), {
      actualGames: gp, actualTotalPts: pts,
      actualPPG: gp > 0 ? pts / gp : null, played: gp > 0,
    });
  }
  return { outcomes: map, droppedTerms, excludedRateKeys, scoredKeyCount };
}
```

`loadOutcomes` (return shape changes from `Map|null` to an object|null — sole
caller is `gradeSnapshot`; update it):
```js
export function loadOutcomes(targetSeason, scoringSettings = null) {
  const data = readJson(`nfl/season-totals/${targetSeason}.json`);
  if (!data) return null;
  if (scoringSettings) {
    return { ...buildInBasisOutcomes(data, scoringSettings), inBasis: true };
  }
  return { outcomes: buildHalfPprOutcomes(data), inBasis: false,
           droppedTerms: [], excludedRateKeys: [], scoredKeyCount: null };
}
```

`gradeSnapshot` — route + thread metadata:
```js
const scoringSettings = snapshot.scoringSettings ?? null;       // v2 → object, v1 → null
const loaded = loadOutcomes(targetSeason, scoringSettings);
if (!loaded) { /* existing "not found / not available yet" message + return null */ }
const { outcomes, inBasis, droppedTerms, excludedRateKeys, scoredKeyCount } = loaded;

const gradeInput = buildGradeInputFromSnapshot(snapshot, outcomes, {
  targetSeason, snapshotDate, source: 'snapshot',
  inBasis, droppedTerms, excludedRateKeys, scoredKeyCount,
});
```
(Strict-basis flag: `--strict-basis` currently skips non-half_ppr snapshots. For
v2 in-basis it no longer needs to skip — but keep the flag's documented behavior
for v1; for v2 simply note in-basis makes it moot. Simplest: only apply the
strict-basis skip when `scoringSettings == null` — i.e. v1. State this.)

`buildGradeInputFromSnapshot` — meta for the two paths:
```js
const inBasis = !!opts.inBasis;
const outcomeBasis = inBasis ? scoringBasis : 'half_ppr';
const basisMatch   = inBasis ? true : (scoringBasis === 'half_ppr');
// meta gains: inBasis, droppedTerms, excludedRateKeys, scoredKeyCount
return { meta: { targetSeason, snapshotDate, capturedAt, scoringBasis,
  outcomeBasis, basisMatch, inBasis,
  droppedTerms: opts.droppedTerms ?? [], excludedRateKeys: opts.excludedRateKeys ?? [],
  scoredKeyCount: opts.scoredKeyCount ?? null, source }, projections, outcomes };
```

## Refactor: `lib/grade.mjs` (caveats only; scorer stays source-agnostic)

`scoreProjections` already passes `meta` through (`report.meta = {...meta}`) and
builds caveats. Add to the caveats block (after the existing `!meta.basisMatch`
caveat, which now fires **only** for v1 non-half_ppr):
```js
if (meta.inBasis && meta.excludedRateKeys?.length) {
  caveats.push(`Excluded ${meta.excludedRateKeys.length} non-additive rate key(s) from ` +
    `in-basis scoring: ${meta.excludedRateKeys.join(', ')} (these contribute 0).`);
}
if (meta.inBasis && meta.droppedTerms?.length) {
  caveats.push(`${meta.droppedTerms.length} scored stat key(s) absent from ` +
    `season-totals — omitted from actuals (in-basis totals undercount by these): ` +
    `${meta.droppedTerms.join(', ')}.`);
}
```
No structural change to the report shape beyond the meta fields riding through.
The in-basis report is authoritative: `basisMatch === true` → no indicative-only
caveat. (`NUMERIC_FACTOR_KEYS`, calibration, games, MetricBlocks — all unchanged.)

## Refactor: `formatHumanReport` (basis + scoring lines)

Replace the single Basis line with a branch:
- **in-basis:** `Basis: in-basis (<scoringBasis>) — authoritative` and a second
  line `Scored keys: <scoredKeyCount>  dropped: <droppedTerms.length>  rate-excluded: <excludedRateKeys.length>`.
- **v1:** the existing `outcomes=half_ppr, snapshot=<basis> ⚠ MISMATCH` line, unchanged.

(Match the existing box width / padding style.)

---

## Data shapes (additions only)

**Consumed from the v2 snapshot:** `scoringSettings` (verbatim weights, object),
`scoringBasis`, `targetSeason`, plus the existing per-player `projection`.

**Stat keys multiplied:** the `scoringSettings` keys with non-zero weight, minus
`RATE_KEYS`, that exist in the target season-totals `stats` universe. Each
multiplied by `stats[key] ?? 0` per player (via `calculateFantasyPoints`).

**In-basis actual PPG:** `calculateFantasyPoints(rec.stats, sanitizedScoring) ÷ rec.gamesPlayed`
(0 GP → `actualPPG = null`, `played = false`; **unchanged** divisor + rule).

**`meta` additions** (ride through into `report.meta`):
`inBasis: boolean`, `droppedTerms: string[]`, `excludedRateKeys: string[]`,
`scoredKeyCount: number|null`, and for in-basis `outcomeBasis = scoringBasis`,
`basisMatch = true`.

**Report:** unchanged top-level shape (`counts`, `overall`, `byPosition`,
`byConfidence`, `calibration`, `games`, `factorDiagnostics`, `caveats`) — the
in-basis info surfaces via `report.meta.*` and two new caveats. Metrics
(MAE/bias per position / per confidence tier / overall) are unchanged in
definition; their *values* now reflect in-basis actuals for v2.

---

## Step sequence (for sonnet)

1. Add `lib/fantasyPoints.mjs` (`calculateFantasyPoints` faithful mirror + `RATE_KEYS`).
2. `scripts/grade-snapshot.mjs`: add `buildHalfPprOutcomes` (factor out existing) + `buildInBasisOutcomes`; refactor `loadOutcomes` to the object return; route in `gradeSnapshot`; thread meta in `buildGradeInputFromSnapshot`; gate `--strict-basis` to v1 only.
3. `lib/grade.mjs`: add the dropped-term + rate-excluded caveats (meta-driven).
4. `formatHumanReport`: in-basis basis + scoring lines.
5. Add fixtures + extend `runSelfTest` (below); add `test/fantasyPoints.test.mjs`.
6. Run `npm run smoke` (covers `grade --self-test`) and `npm test` green; manifest untouched (no `--write` in smoke).
7. Apply Docs updates.

---

## Docs updates

### README.md
- Grading section (the as-built harness's README block, if present): add that for
  **v2 snapshots** the harness grades **in-basis** — actuals recomputed from
  season-totals `stats` under the snapshot's stored `scoringSettings` via
  `lib/fantasyPoints.mjs` — so absolute MAE/bias are authoritative (no half_ppr
  caveat); it reports `scoredKeyCount`, dropped terms (scored keys absent from
  the data), and rate-excluded keys. **v1 snapshots** still grade in half_ppr with
  the indicative-only caveat. If the README has no grading section, add a short
  one; if it does, append these sentences.

### CLAUDE.md
- **Navigation map:** add `lib/fantasyPoints.mjs` row — "Scoring dot-product
  (`calculateFantasyPoints`) ported from the app; mirrors its formula; used by the
  grading in-basis path. Also exports `RATE_KEYS`." Update the
  `scripts/grade-snapshot.mjs` row to mention in-basis outcome building
  (`buildInBasisOutcomes`).
- **Invariant 8** ("Grading reads are never recomputed"): add a clarifying
  sentence — *grading MAY recompute actual fantasy points from stored season-totals
  `stats` under the snapshot's `scoringSettings` (a deterministic dot-product); it
  never re-runs the projection pipeline.* (The invariant's intent — no projection
  recompute — is preserved.)
- **Cross-repo contracts table:**
  - Update the last row's note: change "the in-basis grading consumer … is a
    future data-repo task" → "**implemented**: `lib/fantasyPoints.mjs` +
    `buildInBasisOutcomes`; grades v2 snapshots in-basis."
  - Add a row **`calculateFantasyPoints` port**: this repo's `lib/fantasyPoints.mjs`
    must mirror the app's `src/utils/fantasyPoints.js` `calculateFantasyPoints`
    formula; if the app changes its scoring math, mirror it here (else in-basis
    grades diverge from how the app actually scored).

---

## Tests / validation

### A. `test/fantasyPoints.test.mjs` (`node --test`) — port fidelity
- app sanity: `calculateFantasyPoints({pass_yd:300,pass_td:3},{pass_yd:0.04,pass_td:4})` → `24`.
- null multiplier skipped; absent stat skipped; 2-dp rounding (e.g. `{rec:0.5}`×`{rec:3}` → `1.5`).
- **rate key in `stats` but not in `scoringSettings` is ignored:** `calculateFantasyPoints({rec:80, rec_ypr:999}, {rec:0.5})` → `40` (proves rate stats can't leak in via the data).

### B. In-basis self-test (extend `runSelfTest`, runs in `npm run smoke`)
New fixtures:
- `test/fixtures/grade-snapshot-v2.json` — `schemaVersion 2`, `scoringBasis "custom"`, `targetSeason` set, players p1–p5, and
  `scoringSettings: { rush_yd:0.1, rush_td:6, rec:0.5, rec_yd:0.1, rec_td:6, bonus_xyz:5, rec_ypr:2 }`
  (`bonus_xyz` = scored key absent from the fixture totals → **dropped term**;
  `rec_ypr` = rate key → **excluded**).
- `test/fixtures/grade-season-totals-v2.json` — the actuals (p1–p4; p5 omitted → absent):

| id | pos | conf | stats | gp | in-basis pts | actualPPG | projGames | projPPG | decoy `fantasyPoints` (half_ppr) |
|---|---|---|---|---|---|---|---|---|---|
| p1 | QB | high | `{rush_yd:700, rush_td:7}` | 16 | 70+42 = 112 | 7.0 | 16 | 9.0 (+2) | 480 |
| p2 | RB | high | `{rush_yd:1200, rush_td:10, rec_ypr:99}` | 15 | 120+60 = 180 | 12.0 | 14 | 15.0 (+3) | 300 |
| p3 | RB | low | `{rush_yd:600, rush_td:8}` | 12 | 60+48 = 108 | 9.0 | 13 | 10.0 (+1) | 200 |
| p4 | WR | medium | `{}` | 0 | 0 | — (dnp) | 0 | 12.0 | 0 |
| p5 | WR | rookie | *(absent from totals)* | — | — | — (absent) | 10 | 8.0 | — |

The **decoy half_ppr `fantasyPoints`** differ wildly from in-basis points, so the
clean errors below only hold if the **in-basis** path was used (p2's `rec_ypr:99`
likewise must be ignored, proving rate exclusion). Set each `projPPG = actualPPG + error`.

Expected (assert):
- `counts`: projected 5, graded 3, dnp 1, absent 1.
- `meta.inBasis === true`, `meta.basisMatch === true`, `meta.outcomeBasis === 'custom'`.
- `meta.excludedRateKeys` = `['rec_ypr']`; `meta.droppedTerms` = `['bonus_xyz']`; `meta.scoredKeyCount === 5`.
- `byPosition.QB`: n 1, maePPG 2.0, biasPPG 2.0.
- `byPosition.RB`: n 2, maePPG 2.0, biasPPG 2.0 (errors +3, +1).
- `byConfidence.high`: n 2, maePPG 2.5, biasPPG 2.5; `byConfidence.low`: n 1, maePPG 1.0, biasPPG 1.0; medium n 0, rookie n 0.
- `calibration.monotonic === false` (high 2.5 > low 1.0).
- `games`: n 4, mae 0.5, bias 0 (diffs 0, −1, +1, 0).
- caveats: **no** half_ppr "indicative" caveat; **one** dropped-term caveat (mentions `bonus_xyz`); **one** rate-excluded caveat (mentions `rec_ypr`).
- pure-builder unit: `buildInBasisOutcomes(fixtureTotals, fixtureScoring)` returns the `droppedTerms`/`excludedRateKeys`/`scoredKeyCount` above and p1 `actualPPG === 7.0` (proves the dot-product, not the decoy).

### Edge cases (all covered by the above)
- **v1 fallback unchanged:** the existing `runSelfTest` v1 section stays as-is and must still pass (regression guard that v1 numbers/behavior didn't move).
- **scored-but-absent key counted:** `bonus_xyz` → `droppedTerms`, surfaced, points omitted.
- **rate-key exclusion:** `rec_ypr` in scoringSettings stripped (and `rec_ypr:99` in p2's stats never read).
- **0-GP player:** p4 → `actualPPG null`, `played false`, counted in `dnp` and in the games block — identical to the as-built rule.

---

## Cross-repo impact

1. **NEW contract — `calculateFantasyPoints` port.** `lib/fantasyPoints.mjs` must
   mirror `sleeper-dashboard/src/utils/fantasyPoints.js` `calculateFantasyPoints`
   exactly (loop scoringSettings keys, skip null multiplier/stat, 2-dp round). If
   the app changes its scoring formula, mirror it here or in-basis grades stop
   reflecting how the app actually scored. (Low churn — the dot-product is stable;
   the app file even self-tests it.) Add to the CLAUDE.md cross-repo table.
2. **Dependence on the v2 snapshot shape.** The in-basis path reads
   `snapshot.scoringSettings` (verbatim weights), `snapshot.scoringBasis`, and
   `snapshot.targetSeason`. These are the existing v2 snapshot-shape contract
   (app `projectionSnapshot.js` writer). If the app renames/removes them or stops
   capturing `scoringSettings`, v2 grading silently falls back to v1/half_ppr
   (graceful, but loses in-basis fidelity). No app change required for this task —
   just naming the dependency.

No change to the served snapshot shape, manifest fields, or season-totals from
this repo — the harness only **reads**.
