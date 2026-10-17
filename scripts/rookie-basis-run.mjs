/**
 * scripts/rookie-basis-run.mjs — D-45 adapter (`bin/backtest.mjs --rookie-basis`): the league-basis refit of the rookie and prior
 * constants, graded out of sample against today's interim under a rule written BEFORE any league result is read
 * (.claude/tasks/rookie-basis-refit.md §4). Offline analysis only: no served file, no manifest entry. The pure logic is
 * lib/rookieBasisRefit.mjs; reached only from bin/backtest.mjs (never from bin/panel.mjs's closure, T-RM1).
 *
 * The rule text (`ROOKIE_BASIS_RULE_MD`) is built from the constants in lib/rookieBasisRefit.mjs and emitted into the verdict; this
 * file was committed (A3a) before the first league run, and a rule change after that commit is a stop, never an amendment.
 *
 * Public exports:
 *   ROOKIE_BASIS_RULE_MD, ROOKIE_BASIS_PIN, ROOKIE_BASIS_LOAD
 *   collectInputs({ load, log })                      → the half and league runs this slice joins (in memory; no panel file is read)
 *   analyze({ inputs, run46, log })                   → { stopped:'G0', g0 } | the full result
 *   runRookieBasis({ load, collect, run46, write, … })
 *   buildLeagueConstantsFile(result, …), buildRookieBasisVerdictMarkdown(result), writeRookieBasisArtifacts(…), rookieBasisMain(…)
 */

import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readJson, repoPath } from '../lib/io.mjs';
import { runRookiePanels, leagueLoadArgs, quantile, LEAGUE_SCORING_FIXTURE } from './panel-run.mjs';
import { runQbRookieLevel } from './qb-rookie-level-run.mjs';
import { INSEASON_DYN_LOAD, runInSeasonDyn, classifyRow } from './inseason-dyn-run.mjs';
import { runInSeason, guardLoad, basisDetailOf } from './inseason-run.mjs';
import { runRookieTotal, ROOKIE_TOTAL_LOAD } from './rookie-total-run.mjs';
import {
  weeksMethodBySeason, slimRookieSnapshot, recoverRookiePosition, SHIPPED_FILES, compareConstantsFiles, decideFile, twoACellResolver,
  dynCellResolver, dynStructure,
} from './league-basis-run.mjs';
import { wiredConstantsOf } from './rookie-constants-file.mjs';
import { leagueBasisLoad, basisScaleOf } from '../lib/leagueBasis.mjs';
import { composeRookieRow, ROOKIE_TOTAL } from '../lib/rookieTotalPoints.mjs';
import { ROOKIE_CALIBRATION, ROOKIE_CEILING, QB_ROOKIE_STARTER_PPG, ROOKIE_TOTAL_FACTOR } from '../lib/rookieMirror.mjs';
import { PROSPECT_MIRROR, prospectPriorPPG } from '../lib/inSeasonEvidence.mjs';
import {
  ROOKIE_BASIS, runF1, runF2, runF3, runF4, runF5, g0bF1, g0bF2, g0bF3, g0bF4, decideFamily, multiplicity, liveEffect, cappedProductOf,
} from '../lib/rookieBasisRefit.mjs';

const POSITIONS = ['QB', 'RB', 'WR', 'TE'];

/** What the plan pins before any league number is read (plan §4.1 G0a / G0d, §4.4). */
export const ROOKIE_BASIS_PIN = Object.freeze({
  scaleSeason: 2026,
  scale2026: Object.freeze({ QB: 1.114, RB: 1.118, WR: 1.101, TE: 1.325 }),
  fixtureSha1: '32e33d61c5cfffacec0a052692fbd61c967b1d6f',   // test/fixtures/league-scoring-2026-10-14.json, the file D-46 D2 pinned
  scaledWeeksShare: 0.005,
  captureDate: '2026-10-16',
  scalesFrom: 2013,
  shippedTwoA: SHIPPED_FILES.twoA.path,
  committed: Object.freeze({
    fullpipelinePanel: 'backtests/2026-09-06-fullpipeline-panel.json',
    rookiePanel: 'backtests/2026-10-10-rookie-panel.json',
    qbRookieLevelConstants: 'backtests/2026-10-04-qb-rookie-level-constants.json',
    rookieTotalPanel: 'backtests/2026-10-11-rookie-total-panel.json',
  }),
});

export const ROOKIE_BASIS_LOAD = {
  ...INSEASON_DYN_LOAD,
  loadCapture: (date) => readJson(`snapshots/${date}.json`),
  loadFile: (rel) => readJson(rel),
  loadFixtureText: () => fs.readFileSync(repoPath(LEAGUE_SCORING_FIXTURE)),
};

// ─── the pre-registered rule (plan §4.3), built from the constants ────────────────────────────────

const floorText = (f) => `${f.min} ${f.kind}`;

export const ROOKIE_BASIS_RULE_MD = [
  '## Pre-registered decision rule (D-45 §4.3 — committed in A3a, before the first league run)',
  '',
  'Each constant family is refitted on league outcomes by the recipe that produced its shipped half-PPR value and compared out of sample, on league-basis outcomes, against today\'s interim (the half-PPR recipe refitted on the same training folds × the as-of `positionBasisScale`). Both arms are in-fold. Per row `d = loss(refit) − loss(interim)`; an entry\'s and a family\'s delta is the unweighted mean `d`, clustered by player, `bootstrapPairedMean` (4000 resamples, seed 12345), labelled by `compareLabel` on its 95% interval.',
  '',
  '**Gates (G0):** a failure of (a), (c) or (d) stops the run (nothing under the families is read); a failure of a family\'s (b) makes that family `stop-and-report` and its league section is not read (ratified by Anton, 2026-10-17). (a) `basisScaleOf(load, 2026, pos)` = QB 1.114 / RB 1.118 / WR 1.101 / TE 1.325 (the per-target-season table is written to the panel); (b) each half-PPR recipe on the half rows reproduces its shipped constant exactly — F1 `ROOKIE_CALIBRATION` (8 cells, 2 dp, and every row\'s `projectedPPG` = round1(baseline × cappedProduct)), F2 `ROOKIE_CEILING` (8 values, 2 dp), F3 `QB_ROOKIE_STARTER_PPG` (4, 3 dp), F4 `ROOKIE_TOTAL_FACTOR` (2, 3 dp; every row\'s parity holds); (c) half and league row keys are equal per panel and the `rookiePathAll` games cells (`ROOKIE_GAMES_*` material) are equal across bases; (d) the scoring fixture\'s sha1 is the one D-46 D2 pinned, and the weeks-method counts per season are reported (`scaled` > 0.5% of a season\'s weeks is flagged).',
  '',
  '**Families (recipe · folds · arms · entries · loss):**',
  '',
  `- **F1 \`ROOKIE_BASELINE_PPG\` + \`ROOKIE_CALIBRATION\`.** Rows: the legacy gated rookie panel (gp ≥ 6). Recipe: the app's \`tierGroup\`/\`fitCellConstants\`/\`runLoyo\` (rookieCalibration.test.js:81-235) and the five-part minimum-n rule (docs/projection.md:282-288), \`nflDraftTier: null\` mapped to \`undrafted\`. Interim: calibration_H on the training folds' half rows; level = baseline_H × s(pos, y+1) × cappedProduct × calibration_H. Refit: ρ(pos) = Σ league ÷ Σ half outcome over the training rows (3 dp), baseline_L = round3(baseline_H × ρ), calibration_L by the recipe on league outcomes against round1(baseline_L × cappedProduct); level = baseline_L × cappedProduct × calibration_L. Folds: leave-one-predictor-year-out. Loss: |league outcome − clamp(level, 0, 40)|. Entries: group × position (16), floor ${floorText(ROOKIE_BASIS.floors.F1)}. Structural: the set of corrected cells and each cell's minimum-n band are identical under the full-sample league fit. \`same\` is judged on the effective level (baseline × calibration per cell) at ${ROOKIE_BASIS.sameDp.F1} dp.`,
  `- **F2 \`ROOKIE_CEILING\`.** Rows: debut rows with gp ≥ 8 (classes 2013–2025). Recipe: p90 knee / p99 asymptote of debut PPG, 2 dp. Interim: half quantiles of the other classes × s(pos, class); refit: league quantiles of the other classes. Folds: leave-one-class-year-out. Loss: pinball loss at τ = 0.90 (knee) and 0.99 (asymptote) on the held-out league debut PPG. Entries: position × {knee, asymptote} (8), floor ${floorText(ROOKIE_BASIS.floors.F2)}. The family pooled delta counts each row once (the mean of its knee and asymptote deltas). Structural: knee < asymptote at every position. Held-out exceedance vs 10% / 1% is reported for both arms. \`same\` at ${ROOKIE_BASIS.sameDp.F2} dp.`,
  `- **F3 \`QB_ROOKIE_STARTER_PPG\`.** Rows: the Q3 units (rookie-season QBs with ≥ 3 primary games). Recipe: \`levelTable\` (Σ points ÷ Σ primary games, game-weighted, 3 dp). Interim: half level in-fold × s(QB, S); refit: league level in-fold. Folds: leave-one-season-out. Loss: |unit league PPG − group level| per unit. Entries: the four groups, floor ${floorText(ROOKIE_BASIS.floors.F3)}. Structural: no group empty. \`same\` at ${ROOKIE_BASIS.sameDp.F3} dp.`,
  `- **F4 \`ROOKIE_TOTAL_FACTOR\`.** Decided after F1 and F2 on the composition the app would ship (each of F1/F2 at its league value if \`wire\`, else interim, before §4.6). Rows: the day-3 and undrafted RB/WR/TE rows of the league \`rookiePathAll\` panel. Recipe: \`losoMultiplier\` / \`loso.decision\`. Interim: factor_H fitted in-fold on the half scale-1 composition against half realised totals (today's recipe), applied to the shipped composition; refit: factor_L fitted in-fold on the shipped composition against league realised totals, applied to it. Folds: leave-one-season-out. Loss: |league realised total − factor × shipped total|. Entries: day3, undrafted, floor ${floorText(ROOKIE_BASIS.floors.F4)}. Expected \`same\`. \`same\` at ${ROOKIE_BASIS.sameDp.F4} dp.`,
  `- **F5 \`POSITION_PRIOR_PPG\`.** Rows: the 2c Q1 admitted rows of second-year players (yearsExp 1; the one live arm-A population is second-year WRs) with an S+2 outcome, deduplicated to one row per player-season. Prior: the arm-A prior as live (position constant × scale × age × draft, blended 8 : min(gp, 12) with the S-1 season). Interim: constant × s(pos, S); refit: constant × ρA(pos) at scale 1, ρA = Σ league ÷ Σ half \`nextPPG2\` over the training rows (3 dp). Folds: leave-one-season-out. Loss: |league \`nextPPG2\` − prior|. Entries: the four positions, floor ${floorText(ROOKIE_BASIS.floors.F5)}; **only the WR entry decides F5** (and the family pool is the WR rows) — QB/RB/TE are reported, never wired. A WR wire also reaches WR PATH B and no-entry rows, which were not evaluated. \`same\` at ${ROOKIE_BASIS.sameDp.F5} dp.`,
  '',
  '**Per family:**',
  '',
  '- `wire` iff at least one labelled entry is `BEATS`, no labelled entry is `WORSE`, the family pooled delta (all its rows, deduplicated per row) has a **99%** interval entirely below 0, and the structural check holds. A labelled entry is a deciding entry at or above its family floor that is not `same`; an entry below its floor is `INSUFFICIENT` (pooled, never labelled).',
  '- `stop-and-report` iff G0 fails for the family, its structural check fails, a pinned artifact it reproduces did not reproduce at baseline (plan §2.6), or §4.6 trips. Nothing wires from it.',
  '- Otherwise `do-not-wire`, naming the entries.',
  '- **Entries `same`:** the full-sample league value equals the full-sample interim value at the constant\'s committed precision (per family above). A family whose every entry is `same` is `do-not-wire` whatever its pooled delta; a `same` entry never counts as the required `BEATS`, but a `same` entry labelled `WORSE` does block a wire.',
  '- **Multiplicity:** the verdict counts the labelled entries after the floors (at most 16 + 8 + 3 + 2 + 1 = 30 deciding entries) and states the expected spurious `BEATS`/`WORSE` at 95% (0.05 × the count, ≈ 1.5 at 30); the pooled requirement is the guard (D-46\'s), held at 99% because five families are decided at once (0.05 ÷ 5, Bonferroni).',
  '- **§4.6 (only if F1, F2, F3 or F5 is `wire`):** the in-season k re-fit on the composition the app would ship, `--inseason --basis league` and `--inseason --dynasty --basis league --inseason-2a backtests/2026-10-07-inseason-constants.json`, each compared with the shipped file under D-46\'s `compareConstantsFiles`/`decideFile` unchanged. Both `do-not-wire` with `prospectPriorKind`, `decisions` and `reuse` unchanged → the shipped k stand; otherwise every triggering `wire` family becomes `stop-and-report`.',
  '- **Expected, stated so a surprise is visible:** F4 `same`; F1/F5 hinge on whether ρ differs from s by more than a few percent; F2/F3 on whether the rookie points mix differs from the veterans\'.',
  '',
].join('\n');

// ─── collecting the half and league runs ──────────────────────────────────────────────────────────

class RowsCaptured extends Error {}

/** The augmented 2c rows before the S+1-outcome filter, from `runInSeasonDyn` (stopped right after the rows exist). */
function collectDynRows({ load, basis, log }) {
  let pre = null;
  try {
    runInSeasonDyn({
      load, qbPrior: 'starter', qbResearch: false, basis, inseason2a: basis === 'league' ? SHIPPED_FILES.twoA.path : null,
      onRows: (_rows, preFilterRows) => { pre = preFilterRows; throw new RowsCaptured(); }, log,
    });
  } catch (e) { if (!(e instanceof RowsCaptured)) throw e; }
  return pre;
}

/**
 * Every run this slice joins, in memory (no panel file is read; only the shipped constants / fixtures it compares against).
 * `scaleOf(T, pos)` = the as-of scale of target season T on the league basis (plan S3).
 */
export function collectInputs({ load = ROOKIE_BASIS_LOAD, log = () => {} } = {}) {
  const guarded = guardLoad(load, { maxLoadSeason: 2025 });
  const lg = leagueBasisLoad(guarded, leagueLoadArgs(guarded));
  const scaleOf = (T, pos) => basisScaleOf(lg, T, pos);
  const scaleByTarget = {};
  for (let T = ROOKIE_BASIS_PIN.scalesFrom; T <= ROOKIE_BASIS_PIN.scaleSeason; T++) scaleByTarget[T] = Object.fromEntries(POSITIONS.map((p) => [p, scaleOf(T, p)]));

  const runBasis = (basis) => {
    log(`${basis}: --rookie panels …`);
    const rookie = runRookiePanels({ load, basis, rookiePathAllCrosswalk: 'frozen' });
    log(`${basis}: --qb-rookie-level …`);
    let captured = null;
    const qb = runQbRookieLevel({ load, basis, onGames: (x) => { captured = x; } });
    log(`${basis}: 2c Q1 rows …`);
    const dynRows = collectDynRows({ load, basis, log: (m) => log(`[${basis} 2c] ${m}`) });
    return { rookie, qb, games: captured.games, units: captured.units, dynRows };
  };
  const half = runBasis('half_ppr');
  const league = runBasis('league');

  const fixtureBytes = load.loadFixtureText();
  const fixtureSha1 = crypto.createHash('sha1').update(fixtureBytes).digest('hex');

  // The pinned artifacts the app copies (plan §2.6): reproduced by today's code?
  const C = ROOKIE_BASIS_PIN.committed;
  const fullpipeline = load.loadFile(C.fullpipelinePanel), rookiePanel = load.loadFile(C.rookiePanel);
  const qbConstants = load.loadFile(C.qbRookieLevelConstants), totalPanel = load.loadFile(C.rookieTotalPanel);
  const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const pinnedRows = fullpipeline?.rookiePanel?.rows ?? [], gated = half.rookie.legacy.gated.rows;
  const rowsReproduce = pinnedRows.length === gated.length && pinnedRows.every((pr, i) => Object.keys(pr).every((k) => gated[i][k] === pr[k]));
  let totalReproduces = false;
  try { totalReproduces = sameJson(runRookieTotal({ load: ROOKIE_TOTAL_LOAD }).loso.decision, totalPanel?.loso?.decision); } catch { totalReproduces = false; }
  const pinned = {
    F1: { ok: rowsReproduce, what: `${C.fullpipelinePanel} rookiePanel.rows (committed fields)` },
    F2: { ok: sameJson(half.rookie.ceiling.observed, rookiePanel?.ceiling?.observed), what: `${C.rookiePanel} ceiling.observed` },
    F3: { ok: sameJson(half.qb.constants.starterPPG, qbConstants?.starterPPG) && sameJson(half.qb.constants.fixture, qbConstants?.fixture), what: `${C.qbRookieLevelConstants} starterPPG + fixture` },
    F4: {
      ok: totalReproduces && sameJson(half.rookie.rookiePathAll.coverage.byRungCell, rookiePanel?.rookiePathAll?.coverage?.byRungCell),
      what: `${C.rookieTotalPanel} loso.decision, and ${C.rookiePanel} rookiePathAll byRungCell cells`,
      detail: { lososDecision: totalReproduces, rookiePathAllCells: sameJson(half.rookie.rookiePathAll.coverage.byRungCell, rookiePanel?.rookiePathAll?.coverage?.byRungCell), rowsNow: half.rookie.rookiePathAll.rows.length, rowsPinned: rookiePanel?.rookiePathAll?.rows?.length ?? null },
    },
  };

  const captureSnap = load.loadCapture(ROOKIE_BASIS_PIN.captureDate);
  return {
    generatedAt: new Date().toISOString(), headRev: gitHead(),
    scaleOf, scaleByTarget, playerIds: load.loadPlayerIds(), half, league, fixtureSha1, pinned,
    weeks: weeksMethodBySeason(lg), capture: captureSnap ? Object.entries(slimRookieSnapshot(captureSnap).players) : [],
    basisDetail: basisDetailOf(lg, { from: ROOKIE_BASIS_PIN.scalesFrom, to: ROOKIE_BASIS_PIN.scaleSeason }),
  };
}

const gitHead = () => { try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repoPath('.'), encoding: 'utf8' }).trim(); } catch { return 'unknown'; } };

// ─── building each family's rows from the two runs ────────────────────────────────────────────────

const rowKey = (r) => `${r.sleeperId}|${r.predictorYear}|${r.targetSeason ?? ''}`;
const keySet = (rows, fn = rowKey) => rows.map(fn).sort();
const sameKeys = (a, b) => a.length === b.length && a.every((k, i) => k === b[i]);

function ageAtDraftOf(playerIds, row) {
  const b = playerIds?.bySleeper?.[row.sleeperId];
  const birthYear = typeof b?.birthdate === 'string' ? parseInt(b.birthdate.slice(0, 4), 10) : null;
  return (row.draftYear != null && birthYear != null) ? row.draftYear - birthYear : null;
}

/** F1 rows: the half gated panel joined to its league twin by (player, predictor year). */
export function f1Rows({ halfGated, leagueGated, playerIds, scaleOf }) {
  const twin = new Map(leagueGated.map((r) => [rowKey(r), r]));
  return halfGated.map((r) => {
    const l = twin.get(rowKey(r));   // undefined only when G0c is about to fail (analyze stops on it)
    return {
      id: r.sleeperId, key: rowKey(r), year: r.predictorYear, pos: r.position, tier: r.nflDraftTier,
      cp: cappedProductOf({ position: r.position, ageAtDraft: ageAtDraftOf(playerIds, r), draftRound: r.draftRound, draftPick: r.draftPick }),
      prH: r.projectedPPG, oH: r.outcomePPG, oL: l?.outcomePPG ?? null, s: scaleOf(r.predictorYear + 1, r.position),
    };
  });
}

/** F2 rows: debut rows with gp >= 8, half joined to league by (player, target season). */
export function f2Rows({ halfDebut, leagueDebut, scaleOf }) {
  const twin = new Map(leagueDebut.map((r) => [rowKey(r), r]));
  return halfDebut.filter((r) => r.outcomeGames >= 8 && r.outcomePPG != null).map((r) => ({
    id: r.sleeperId, key: rowKey(r), pos: r.position, classYear: r.entryYear, yH: r.outcomePPG, yL: twin.get(rowKey(r))?.outcomePPG ?? null, s: scaleOf(r.entryYear, r.position),
  }));
}

/** F3 inputs: every primary game with both bases' points, and the league Q3 units. */
export function f3Inputs({ halfGames, leagueGames, leagueUnits }) {
  const twin = new Map(leagueGames.map((g) => [`${g.pid}|${g.S}|${g.week}`, g]));
  const games = halfGames.map((g) => ({ pid: g.pid, S: g.S, group: g.group, ptsH: g.pts, ptsL: twin.get(`${g.pid}|${g.S}|${g.week}`)?.pts ?? null }));
  const units = leagueUnits.map((u) => ({ pid: u.pid, S: u.S, group: u.group, yL: u.y }));
  return { games, units };
}

/** F5 rows: the 2c Q1 admitted rows of second-year players, deduplicated to one per player-season, half joined to league. */
export function f5Rows({ halfDyn, leagueDyn, scaleOf }) {
  const admitted = (rows) => {
    const m = new Map();
    for (const r of rows) {
      if (r.ye !== 1 || !classifyRow(r).q1 || !Number.isFinite(r.nextPPG2)) continue;
      const k = `${r.sleeperId}|${r.S}`;
      if (!m.has(k)) m.set(k, r);
    }
    return m;
  };
  const h = admitted(halfDyn), l = admitted(leagueDyn);
  return {
    halfKeys: [...h.keys()].sort(), leagueKeys: [...l.keys()].sort(),
    rows: [...l].filter(([k]) => h.has(k)).map(([k, r]) => ({
      id: r.sleeperId, key: k, S: r.S, pos: r.position, age: r.age, pickForA: r.pickForA, sm1: r.sm1, yH: h.get(k).nextPPG2, yL: r.nextPPG2,
      s: scaleOf(r.S, r.position), livePrior: r.prospectPrior,
    })),
  };
}

// ─── analyze ───────────────────────────────────────────────────────────────────────────────────────

/** The league constants file (plan §4.5): `families.{F1…F5}` = { verdict, constants, provenance } for EVERY family. */
export function buildLeagueConstantsFile({ generatedAt, basisDetail, fixtureSha1, families, headRev }) {
  const out = {};
  for (const f of ROOKIE_BASIS.families) {
    const r = families[f];
    out[f] = {
      verdict: r.verdict,
      constants: r.result.constants,
      provenance: {
        recipe: r.result.recipe, folds: r.result.folds, rows: r.result.rows,
        fullSample: r.result.fullSample, pooled: r.result.pooled,
        entries: r.result.entries.map((e) => ({ key: e.key, rows: e.rows, players: e.players, mean: e.mean, ci95: e.ci95, label: e.label, same: e.same, deciding: e.deciding !== false })),
        structural: r.result.structural, reasons: r.decision.reasons, pinnedOk: r.pinnedOk,
      },
    };
  }
  return {
    source: `sleeper-dashboard-data backtests/${generatedAt.slice(0, 10)}-rookie-league-constants.json (node bin/backtest.mjs --rookie-basis --write)`,
    generatedAt, basis: 'league', basisDetail: { ...basisDetail, scoringFixtureSha1: fixtureSha1 }, headRev,
    note: 'Constants for EVERY family are recorded; only a family whose verdict is `wire` is read by the app. Unwired families are never read.',
    families: out,
  };
}

const nonEmpty = (o) => o && Object.keys(o).length > 0;

/**
 * G0 → families → decisions → (§4.6 when a prior-moving family wires) → result. `run46(constantsFile)` is injected (heavy).
 * Returns { stopped: 'G0', g0 } before any family section is computed when a gate fails.
 */
export function analyze({
  inputs, run46 = null, quantile: q = quantile, log = () => {}, captureDate = ROOKIE_BASIS_PIN.captureDate,
  shipped = { calibration: ROOKIE_CALIBRATION, ceiling: ROOKIE_CEILING, qbLevels: QB_ROOKIE_STARTER_PPG, totalFactor: ROOKIE_TOTAL_FACTOR },   // injectable for tests
}) {
  const { scaleOf, playerIds, half, league } = inputs;
  const scale2026 = Object.fromEntries(POSITIONS.map((p) => [p, scaleOf(ROOKIE_BASIS_PIN.scaleSeason, p)]));

  // ── half-only material first (G0 reads no league outcome)
  const f1 = f1Rows({ halfGated: half.rookie.legacy.gated.rows, leagueGated: league.rookie.legacy.gated.rows, playerIds, scaleOf });
  const f2 = f2Rows({ halfDebut: half.rookie.debut.rows, leagueDebut: league.rookie.debut.rows, scaleOf });
  const f3 = f3Inputs({ halfGames: half.games, leagueGames: league.games, leagueUnits: league.units });
  const f5 = f5Rows({ halfDyn: half.dynRows, leagueDyn: league.dynRows, scaleOf });

  // F4 rows (the half composition; the ship composition is added after F1/F2 are decided)
  const decisionRow = (r) => ROOKIE_TOTAL.decisionGroups.includes(r.draftGroup) && ROOKIE_TOTAL.decisionPositions.includes(r.position);
  const f4Half = half.rookie.rookiePathAll.rows.filter(decisionRow);
  const f4Twin = new Map(league.rookie.rookiePathAll.rows.map((r) => [rowKey(r), r]));
  let parityFails = 0;
  const f4Base = f4Half.map((r) => {
    const age = ageAtDraftOf(playerIds, r);
    if (!Number.isFinite(age)) throw new Error(`[rookie-basis] sleeperId ${r.sleeperId} has no birthdate in nflverse/playerids.json`);
    const c = composeRookieRow(r, age);
    if (!c.parity) parityFails++;
    return { r, age, predH: c.predTotal, realH: r.outcomeTotalPts, league: f4Twin.get(rowKey(r)) };
  });

  // ── G0
  const scaleOk = POSITIONS.every((p) => scale2026[p] === ROOKIE_BASIS_PIN.scale2026[p]);
  const keysEqual = {
    legacyGated: sameKeys(keySet(half.rookie.legacy.gated.rows), keySet(league.rookie.legacy.gated.rows)),
    debut: sameKeys(keySet(half.rookie.debut.rows), keySet(league.rookie.debut.rows)),
    rookiePathAll: sameKeys(keySet(half.rookie.rookiePathAll.rows), keySet(league.rookie.rookiePathAll.rows)),
    f3Games: sameKeys(half.games.map((g) => `${g.pid}|${g.S}|${g.week}`).sort(), league.games.map((g) => `${g.pid}|${g.S}|${g.week}`).sort()),
    f5Rows: sameKeys(f5.halfKeys, f5.leagueKeys),
  };
  const gamesCells = JSON.stringify(half.rookie.rookiePathAll.coverage.byRungCell) === JSON.stringify(league.rookie.rookiePathAll.coverage.byRungCell);
  const g0b = {
    F1: g0bF1({ rows: f1, shippedCalibration: shipped.calibration }), F2: g0bF2({ rows: f2, quantile: q, shipped: shipped.ceiling }), F3: g0bF3({ games: f3.games, shipped: shipped.qbLevels }),
    F4: { ...g0bF4({ rows: f4Base.map((x) => ({ predH: x.predH, realH: x.realH, season: x.r.targetSeason, group: x.r.draftGroup })), shipped: shipped.totalFactor }), parityFails },
  };
  g0b.F4.ok = g0b.F4.ok && parityFails === 0;
  const g0 = {
    a: { ok: scaleOk, scale2026, pinned: ROOKIE_BASIS_PIN.scale2026, scaleByTarget: inputs.scaleByTarget },
    b: g0b,
    c: { ok: Object.values(keysEqual).every(Boolean) && gamesCells, keysEqual, gamesCellsEqual: gamesCells },
    d: { ok: inputs.fixtureSha1 === ROOKIE_BASIS_PIN.fixtureSha1, fixtureSha1: inputs.fixtureSha1, pinnedSha1: ROOKIE_BASIS_PIN.fixtureSha1, weeksBySeason: inputs.weeks },
  };
  // a, c and d are global gates: a failure stops the run. G0b is per family: a failed recipe-fidelity check makes THAT family
  // `stop-and-report` (plan §4.3 "G0 fails for it") and its league section is not computed ("nothing under §4.2 is read").
  g0.ok = g0.a.ok && g0.c.ok && g0.d.ok;
  g0.familiesFailed = Object.entries(g0b).filter(([, x]) => !x.ok).map(([fam]) => fam);
  g0.failed = [g0.a.ok ? null : 'a', ...g0.familiesFailed.map((fam) => `b:${fam}`), g0.c.ok ? null : 'c', g0.d.ok ? null : 'd'].filter(Boolean);
  if (!g0.ok) {
    log(`G0 FAILED: ${g0.failed.join(', ')} — the run stops, nothing under the families is read`);
    return { stopped: 'G0', generatedAt: inputs.generatedAt, g0, pinned: inputs.pinned };
  }
  log(g0.familiesFailed.length ? `G0 passed except the recipe-fidelity check for ${g0.familiesFailed.join(', ')} (those families: stop-and-report)` : 'G0 passed');

  // ── F1, F2, F3, F5 (F4 needs the F1/F2 verdicts). A family whose G0b failed is not computed: stop-and-report.
  const results = {};
  const pinnedOf = (f) => inputs.pinned[f]?.ok !== false;
  const failedB = new Set(g0.familiesFailed);
  const skipped = (id) => ({
    id, skipped: true, recipe: 'G0b failed — the half-PPR recipe does not reproduce its shipped constant; the league section was not read',
    folds: 0, rows: 0, entries: [], pooled: null, structural: { ok: true }, constants: null, fullSample: null, g0b: g0b[id],
  });
  const decide = (f, result, extra = {}) => decideFamily({ entries: result.entries, pooled: result.pooled, structuralOk: result.structural.ok, g0Ok: result.g0b.ok, pinnedOk: pinnedOf(f), ...extra });
  results.F1 = failedB.has('F1') ? skipped('F1') : runF1({ rows: f1, s2026: scale2026, shippedCalibration: shipped.calibration });
  results.F2 = failedB.has('F2') ? skipped('F2') : runF2({ rows: f2, quantile: q, s2026: scale2026, shipped: shipped.ceiling });
  results.F3 = failedB.has('F3') ? skipped('F3') : runF3({ games: f3.games, units: f3.units, sQB: (S) => scaleOf(S, 'QB'), s2026QB: scale2026.QB, shipped: shipped.qbLevels });
  // F5: the interim recompute must equal the live arm-A prior carried on the league run's rows (internal consistency)
  const f5Check = f5.rows.map((r) => Math.abs(r.livePrior - prospectLive(r)) < 1e-9);
  results.F5 = runF5({ rows: f5.rows, s2026: scale2026 });
  results.F5.consistency = { rows: f5.rows.length, liveRecomputeMatches: f5Check.filter(Boolean).length };
  const decisions = { F1: decide('F1', results.F1), F2: decide('F2', results.F2), F3: decide('F3', results.F3), F5: decide('F5', results.F5) };

  // ── F4 on the composition the app would ship (F1/F2 at league if wire, else interim; before §4.6)
  if (failedB.has('F4')) {
    results.F4 = skipped('F4');
  } else {
    const shipConstants = {};
    if (decisions.F1.verdict === 'wire') Object.assign(shipConstants, results.F1.constants);
    if (decisions.F2.verdict === 'wire') Object.assign(shipConstants, results.F2.constants);
    const shipArgs = nonEmpty(shipConstants) ? { rookieConstantsModel: 'league-refit', leagueConstants: shipConstants } : {};
    const f4Rows = f4Base.map((x) => ({
      id: x.r.sleeperId, season: x.r.targetSeason, group: x.r.draftGroup, predH: x.predH, realH: x.realH,
      predS: composeRookieRow(x.r, x.age, { basisScale: scaleOf(x.r.targetSeason, x.r.position), ...shipArgs }).predTotal, realL: x.league.outcomeTotalPts,
    }));
    results.F4 = runF4({ rows: f4Rows, shipped: shipped.totalFactor });
    results.F4.composition = { F1: decisions.F1.verdict === 'wire' ? 'league' : 'interim', F2: decisions.F2.verdict === 'wire' ? 'league' : 'interim' };
    results.F4.g0b = { ...results.F4.g0b, parityFails, ok: results.F4.g0b.ok && parityFails === 0 };
  }
  decisions.F4 = decide('F4', results.F4);

  // ── §4.6
  const triggers = ['F1', 'F2', 'F3', 'F5'].filter((f) => decisions[f].verdict === 'wire');
  let section46 = { ran: false, triggers, note: triggers.length ? null : 'no prior-moving family wires — §4.6 not run' };
  const buildFile = (verdicts) => buildLeagueConstantsFile({
    generatedAt: inputs.generatedAt, basisDetail: inputs.basisDetail, fixtureSha1: inputs.fixtureSha1, headRev: inputs.headRev,
    families: Object.fromEntries(ROOKIE_BASIS.families.map((f) => [f, { verdict: verdicts[f], result: results[f], decision: decisions[f], pinnedOk: pinnedOf(f) }])),
  });
  if (triggers.length) {
    if (typeof run46 !== 'function') throw new Error('[rookie-basis] a prior-moving family wires but no run46 was supplied');
    log(`§4.6: ${triggers.join(', ')} wire — re-running the in-season k under the league constants …`);
    section46 = { ran: true, triggers, ...run46(buildFile(Object.fromEntries(ROOKIE_BASIS.families.map((f) => [f, decisions[f].verdict])))) };
    if (section46.trips) {
      for (const f of triggers) decisions[f] = decideFamily({ entries: results[f].entries, pooled: results[f].pooled, structuralOk: results[f].structural.ok, g0Ok: results[f].g0b.ok, pinnedOk: pinnedOf(f), trip46: true });
    }
  }

  const families = Object.fromEntries(ROOKIE_BASIS.families.map((f) => [f, { verdict: decisions[f].verdict, decision: decisions[f], result: results[f], pinnedOk: pinnedOf(f) }]));
  const constantsFile = buildFile(Object.fromEntries(ROOKIE_BASIS.families.map((f) => [f, decisions[f].verdict])));
  const wired = ROOKIE_BASIS.families.filter((f) => decisions[f].verdict === 'wire');
  const live = liveEffect(inputs.capture, {
    recover: recoverRookiePosition,
    league: { F1: results.F1.constants, F2: results.F2.constants, F3: results.F3.constants, F4: results.F4.constants },
  });
  return {
    stopped: null, generatedAt: inputs.generatedAt, headRev: inputs.headRev, captureDate,
    g0, pinned: inputs.pinned, families, multiplicity: multiplicity(results), section46, wired, live, constantsFile,
  };
}

/** The interim arm-A prior as live — the half position constant × the as-of scale, blended with S-1 — recomputed from the row fields. */
function prospectLive(r) {
  return prospectPriorPPG({ position: r.pos, age: r.age, pick: r.pickForA, sm1: r.sm1, basisScale: r.s, positionPriorPPG: { [r.pos]: PROSPECT_MIRROR.positionPriorPPG[r.pos] } }).prospectPPG;
}

// ─── §4.6 (in-memory) ──────────────────────────────────────────────────────────────────────────────

/**
 * §4.6's trip rule: the shipped k stand only if BOTH the 2a and the dynasty comparison are `do-not-wire` and the dynasty structure
 * (`prospectPriorKind`, `decisions`, `reuse`) is unchanged; anything else trips.
 */
export function section46Trips({ twoA, dyn, structureChanged }) {
  return !(twoA.verdict === 'do-not-wire' && dyn.verdict === 'do-not-wire' && !structureChanged);
}

/** The k re-fit under the league constants, compared with the shipped files by D-46's machinery. Heavy: two in-season passes. */
export function make46({ load = ROOKIE_BASIS_LOAD, log = () => {}, runners = { runInSeason, runInSeasonDyn } } = {}) {   // `runners`: test seam only (the in-season passes are heavy)
  return function run46(constantsFile) {
    const rc = wiredConstantsOf(constantsFile);
    rc.ref = `in-memory @ ${crypto.createHash('sha1').update(JSON.stringify(constantsFile)).digest('hex')}`;
    const shipped2a = readJson(SHIPPED_FILES.twoA.path), shippedDyn = readJson(SHIPPED_FILES.dyn.path);
    let hook = null;
    const r2a = runners.runInSeason({ load, basis: 'league', rookieConstants: rc, onStore: (h) => { hook = h; }, log: (m) => log(`[4.6 2a] ${m}`) });
    const rescoredBy = (S) => hook.load.loadSeasonTotals(S);
    const cmp2a = compareConstantsFiles({ shipped: shipped2a, league: r2a.constants, cellOf: twoACellResolver(hook), rescoredBy });
    const v2a = decideFile({ comparison: cmp2a, kind: '2a' });
    let dynRows = null;
    const rd = runners.runInSeasonDyn({ load, qbPrior: 'starter', basis: 'league', inseason2a: SHIPPED_FILES.twoA.path, rookieConstants: rc, onRows: (x) => { dynRows = x; }, log: (m) => log(`[4.6 dyn] ${m}`) });
    const structure = dynStructure({ shipped: shippedDyn, league: rd.constants });
    const cmpD = compareConstantsFiles({ shipped: shippedDyn, league: rd.constants, cellOf: dynCellResolver(dynRows), rescoredBy });
    const vD = decideFile({ comparison: cmpD, kind: 'dyn', structural: structure });
    const trips = section46Trips({ twoA: v2a, dyn: vD, structureChanged: structure.changed });
    return {
      rookieConstants: rc.ref, wiredFamilies: rc.wiredFamilies,
      twoA: { verdict: v2a, pooled: cmp2a.pooled },
      dyn: { verdict: vD, pooled: cmpD.pooled, structure: { changed: structure.changed, kindEqual: structure.kindEqual, decisionsChanged: structure.decisionsChanged.length, reuseChanged: structure.reuseChanged.length } },
      trips,
    };
  };
}

// ─── verdict markdown ─────────────────────────────────────────────────────────────────────────────

const f = (v, d = 3) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(d));
const ci = (c, d = 3) => (c ? `[${f(c[0], d)}, ${f(c[1], d)}]` : '—');
const md = (headers, rows) => [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);

function entryTable(entries) {
  return md(['entry', 'rows', 'players', 'Δ [95%]', 'label', 'same'], entries.map((e) => [
    e.key + (e.deciding === false ? ' (report only)' : ''), String(e.rows), String(e.players), `${f(e.mean, 4)} ${ci(e.ci95, 4)}`,
    e.label ?? '—', e.same ? `yes (${e.sameDetail.league} vs ${e.sameDetail.interim ?? `${e.sameDetail.effectiveLeague} vs ${e.sameDetail.effectiveInterim}`})` : 'no',
  ]));
}
const pooledLine = (p) => `**Pooled Δ** (${p.rows} rows, ${p.players} players): ${f(p.mean, 4)}, 95% ${ci(p.ci95, 4)}, **99% ${ci(p.ci99, 4)}**${p.decidingPositions ? ` — deciding positions: ${p.decidingPositions.join(', ')}` : ''}.`;

export function buildRookieBasisVerdictMarkdown(result) {
  const L = [];
  const out = (...s) => L.push(...s);
  out('# D-45 — league-basis refit of the rookie and prior constants (verdict)', '');
  out(`Generated ${result.generatedAt}${result.headRev ? ` (data \`${result.headRev}\`)` : ''}. Offline analysis: no served file, no manifest entry. League scoring: \`${LEAGUE_SCORING_FIXTURE}\`. **Reproduce:** \`node bin/backtest.mjs --rookie-basis --write\`.`, '');
  out(ROOKIE_BASIS_RULE_MD);

  const g0 = result.g0;
  if (result.stopped) {
    out('## STOPPED at G0', '', `Failed gates: ${g0.failed.join(', ')}. Nothing under the families was read; no constants file is written.`, '');
  } else {
    out('## Verdicts (read from the rule above, not from the narrative)', '');
    out(md(['family', 'verdict', 'why'], ROOKIE_BASIS.families.map((fam) => [fam, `**${result.families[fam].verdict}**`, result.families[fam].decision.reasons.join(' ')])), '');
    const m = result.multiplicity;
    out(`Multiplicity: ${m.labelledEntries} labelled entries after the floors (at most ${m.maxEntries}); expected spurious \`BEATS\`/\`WORSE\` at 95%: ${m.expectedSpurious.toFixed(2)} (${m.expectedSpuriousAtMax.toFixed(2)} at ${m.maxEntries}); the pooled 99% requirement is the guard.`, '');
  }

  out('## G0', '');
  out(`- **G0a** scale 2026 (${g0.a.ok ? 'PASS' : 'FAIL'}): ${POSITIONS.map((p) => `${p} ${g0.a.scale2026[p]} (pinned ${g0.a.pinned[p]})`).join(', ')}.`);
  out(`- **G0b** recipe fidelity: ${Object.entries(g0.b).map(([fam, x]) => `${fam} ${x.ok ? 'PASS' : `FAIL ${JSON.stringify(x.mismatches ?? x.calibrationMismatches ?? x)}`}`).join('; ')}.`);
  out(`- **G0c** populations (${g0.c.ok ? 'PASS' : 'FAIL'}): ${Object.entries(g0.c.keysEqual).map(([k, v]) => `${k} ${v ? 'equal' : 'DIFFER'}`).join(', ')}; ROOKIE_GAMES cells ${g0.c.gamesCellsEqual ? 'equal' : 'DIFFER'}.`);
  out(`- **G0d** settings (${g0.d.ok ? 'PASS' : 'FAIL'}): fixture sha1 \`${g0.d.fixtureSha1}\` (pinned \`${g0.d.pinnedSha1}\`).`, '');
  const flagged = Object.entries(g0.d.weeksBySeason ?? {}).filter(([, c]) => c.flag).map(([S]) => S);
  out('Weeks method per season (league rows):', '', md(['season', 'exact weeks', 'scaled weeks', 'scaled share', 'flag'], Object.entries(g0.d.weeksBySeason ?? {}).map(([S, c]) => [S, String(c.exactWeeks), String(c.scaledWeeks), pct(c.scaledShare), c.flag ? '**>0.5%**' : ''])), '',
    flagged.length ? `Seasons with scaled weeks above 0.5%: ${flagged.join(', ')} (reported).` : 'No season has scaled weeks above 0.5%.', '');
  out('Pinned artifacts the app copies, reproduced by today\'s code at baseline (plan §2.6):', '', md(['family', 'reproduced', 'artifact'], Object.entries(result.pinned).map(([fam, x]) => [fam, x.ok ? 'yes' : '**NO**', x.what + (x.detail ? ` — ${JSON.stringify(x.detail)}` : '')])), '');
  out('As-of scale per target season (league basis):', '', md(['target season', ...POSITIONS], Object.entries(g0.a.scaleByTarget ?? {}).map(([T, s]) => [T, ...POSITIONS.map((p) => String(s[p]))])), '');
  if (result.stopped) return L.join('\n');

  for (const fam of ROOKIE_BASIS.families) {
    const { result: r, decision, verdict } = result.families[fam];
    if (r.skipped) {
      out(`## ${fam} — not computed`, '', `**Verdict: \`${verdict}\`** — ${decision.reasons.join(' ')} ${r.recipe}. G0b: ${JSON.stringify(r.g0b)}.`, '');
      continue;
    }
    out(`## ${fam} — ${r.recipe}`, '', `${r.folds} folds, ${r.rows} rows. **Verdict: \`${verdict}\`** — ${decision.reasons.join(' ')}`, '');
    if (fam === 'F1') {
      out(md(['', ...POSITIONS], [
        ['half baseline', ...POSITIONS.map((p) => String(r.fullSample.half.baselinePPG[p]))],
        ['scale 2026 (s)', ...POSITIONS.map((p) => String(r.fullSample.interim.scale[p]))],
        ['interim baseline (half × s)', ...POSITIONS.map((p) => f(r.fullSample.interim.baselinePPG[p]))],
        ['ρ', ...POSITIONS.map((p) => f(r.fullSample.league.rho[p]))],
        ['league baseline (half × ρ)', ...POSITIONS.map((p) => f(r.fullSample.league.baselinePPG[p]))],
      ]), '');
      out(md(['cell', 'n', 'band', 'raw ratio (half)', 'raw ratio (league)', 'half c', 'league c'], Object.entries(r.fullSample.cells).filter(([c]) => !c.startsWith('r1:') && !c.startsWith('day2:')).map(([c, v]) => [c, String(v.n), v.band, f(v.rawHalf), f(v.rawLeague), f(r.fullSample.half.calibration[c.split(':')[0]][c.split(':')[1]], 2), f(v.c, 2)])), '');
      out(`Structural: corrected cells half ${r.structural.correctedHalf.join(', ') || 'none'} / league ${r.structural.correctedLeague.join(', ') || 'none'}; bands identical: ${JSON.stringify(r.structural.bandsHalf) === JSON.stringify(r.structural.bandsLeague)} → **${r.structural.ok ? 'holds' : 'FAILS'}**. Clamp(…, 0, 40) binding rows: interim ${r.clampBinding.interim}, refit ${r.clampBinding.refit}.`, '');
    } else if (fam === 'F2') {
      out(md(['position', 'n', 'half knee / asymptote', 'interim (× s)', 'league knee / asymptote'], POSITIONS.map((p) => [p, String(r.fullSample.league[p].n), `${r.fullSample.half[p].knee} / ${r.fullSample.half[p].asymptote}`, `${r.fullSample.interim[p].knee} / ${r.fullSample.interim[p].asymptote}`, `${r.fullSample.league[p].knee} / ${r.fullSample.league[p].asymptote}`])), '');
      out('Held-out exceedance (nominal 10% above the knee, 1% above the asymptote):', '', md(['position', 'n', 'interim knee', 'interim asymptote', 'refit knee', 'refit asymptote'], POSITIONS.map((p) => { const x = r.exceedance[p]; return [p, String(x.n), pct(x.interim.knee), pct(x.interim.asymptote), pct(x.refit.knee), pct(x.refit.asymptote)]; })), '');
      out(`Structural: knee < asymptote at every position → **${r.structural.ok ? 'holds' : 'FAILS'}** (fold violations: ${r.structural.foldViolations}).`, '');
    } else if (fam === 'F3') {
      out(md(['group', 'units', 'half', 'interim (× s)', 'league'], Object.keys(r.fullSample.half).map((g) => [g, String(r.fullSample.unitsByGroup[g]), f(r.fullSample.half[g]), f(r.fullSample.interim[g]), f(r.fullSample.league[g])])), '', `Structural: no group empty → **${r.structural.ok ? 'holds' : 'FAILS'}**; fold fallbacks to the pool: ${r.fallbacks}.`, '');
    } else if (fam === 'F4') {
      out(md(['group', 'half (today)', 'league'], Object.keys(r.fullSample.half).map((g) => [g, f(r.fullSample.half[g]), f(r.fullSample.league[g])])), '', `Shipped composition: F1 ${r.composition.F1}, F2 ${r.composition.F2}.`, '');
    } else {
      out(md(['', ...POSITIONS], [
        ['half constant', ...POSITIONS.map((p) => String(r.fullSample.half[p]))],
        ['interim (× s)', ...POSITIONS.map((p) => f(r.fullSample.interim[p]))],
        ['ρA', ...POSITIONS.map((p) => f(r.fullSample.rho[p]))],
        ['league constant', ...POSITIONS.map((p) => f(r.fullSample.league[p]))],
      ]), '', `Live-prior recompute matches the league run's arm-A prior on ${r.consistency.liveRecomputeMatches} of ${r.consistency.rows} rows. A WR wire also reaches WR PATH B and no-entry rows, which were not evaluated.`, '');
    }
    out(entryTable(r.entries), '', pooledLine(r.pooled), '');
  }

  out('## §4.6 — consistency re-run of the in-season k', '');
  const s = result.section46;
  if (!s.ran) out(s.note ?? 'Not run.', '');
  else {
    out(`Run under \`${s.rookieConstants}\` (wired: ${s.wiredFamilies.join(', ')}). 2a: **${s.twoA.verdict.verdict}** (${s.twoA.verdict.reason}). Dynasty: **${s.dyn.verdict.verdict}** (${s.dyn.verdict.reason}); structure changed: ${s.dyn.structure.changed}. **Trips: ${s.trips}.**`, '');
  }

  out('## Live 2026 effect of each family\'s league value vs the interim (report-only)', '',
    `On the ${result.captureDate} capture's non-chain rookie rows, each family swapped alone into the interim reconstruction. F1/F2 move \`projectedPPG\`, F3 \`qbStarterPPG\` (rookie:* QB rows), F4 \`projectedTotalPts\`; F5 moves no captured field (dynasty score only).`, '',
    md(['family', 'rows', 'moved ≥ 0.1', 'mean move (all rows)', 'mean |move| (moved)'], ['F1', 'F2', 'F3', 'F4'].map((fam) => { const x = result.live[fam]; return [fam, String(x.rows), String(x.moved), f(x.meanMove, 3), f(x.meanMovedAbs, 3)]; })), '');
  out('**What this does not model:** the live ktc/college multipliers (the reconstruction holds them at 1.0 as the shipped constants were fitted); PATH B and no-entry prospects for F5; any in-season k beyond §4.6.', '');
  return L.join('\n');
}

// ─── artifacts / CLI ──────────────────────────────────────────────────────────────────────────────

const replacer = (k, v) => (typeof v === 'function' ? undefined : v instanceof Set ? [...v] : v);

export function writeRookieBasisArtifacts({ result, verdictMd, root = null }) {
  const date = result.generatedAt.slice(0, 10);
  const panelPath = `backtests/${date}-rookie-basis-panel.json`;
  const constantsPath = `backtests/${date}-rookie-league-constants.json`;
  const verdictPath = `grading/${date}-rookie-basis-verdict.md`;
  const abs = (rel) => (root ? `${root}/${rel}` : repoPath(rel));
  const { constantsFile, verdictMd: _v, ...panel } = result;
  const panelJson = JSON.stringify(panel, replacer, 2) + '\n';
  fs.mkdirSync(abs('backtests'), { recursive: true });
  fs.mkdirSync(abs('grading'), { recursive: true });
  fs.writeFileSync(abs(panelPath), panelJson, 'utf8');
  if (!result.stopped) fs.writeFileSync(abs(constantsPath), JSON.stringify(constantsFile, replacer, 2) + '\n', 'utf8');
  fs.writeFileSync(abs(verdictPath), verdictMd.endsWith('\n') ? verdictMd : verdictMd + '\n', 'utf8');
  return { panelPath, constantsPath: result.stopped ? null : constantsPath, verdictPath, panelBytes: Buffer.byteLength(panelJson) };
}

export function runRookieBasis({ load = ROOKIE_BASIS_LOAD, log = () => {}, collect = collectInputs, run46 = null, write = false, writeArtifacts = writeRookieBasisArtifacts } = {}) {
  const t0 = Date.now();
  const generatedAt = new Date().toISOString();
  if (write) {
    // Pre-registration (as D-46): the rule is in the verdict file before anything is read.
    const stub = ['# D-45 — league-basis refit (verdict)', '', `Pre-registration written ${generatedAt}, **before any league result was read**. This file is overwritten by the full verdict at the end of the run.`, '', ROOKIE_BASIS_RULE_MD].join('\n') + '\n';
    fs.mkdirSync(repoPath('grading'), { recursive: true });
    fs.writeFileSync(repoPath(`grading/${generatedAt.slice(0, 10)}-rookie-basis-verdict.md`), stub, 'utf8');
  }
  const inputs = collect({ load, log });
  const result = analyze({ inputs, run46: run46 ?? make46({ load, log }), log });
  result.meta = { runtimeMs: Date.now() - t0 };
  result.verdictMd = buildRookieBasisVerdictMarkdown(result);
  if (write) result.written = writeArtifacts({ result, verdictMd: result.verdictMd });
  return result;
}

/** The `--rookie-basis` branch body of `bin/backtest.mjs`. Exit 1 if G0 stops the run (no constants file is written then). */
export function rookieBasisMain({ load = ROOKIE_BASIS_LOAD, write = false, asJson = false, log = console.log, logErr = console.error, ...rest } = {}) {
  const result = runRookieBasis({ load, write, log: (m) => logErr(`[backtest] ${m}`), ...rest });
  if (result.written) logErr(`[backtest] Wrote ${result.written.panelPath} (${result.written.panelBytes} B), ${result.written.constantsPath ?? '(no constants file — stopped)'}, ${result.written.verdictPath}`);
  if (asJson) { const { verdictMd, constantsFile, ...rest2 } = result; log(JSON.stringify({ ...rest2, constantsFile }, replacer, 2)); } else log(result.verdictMd);
  return result.stopped ? 1 : 0;
}
