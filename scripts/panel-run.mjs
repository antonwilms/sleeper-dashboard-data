/**
 * scripts/panel-run.mjs — E-0a panel orchestration adapter.
 *
 * Mirrors scripts/backtest-run.mjs / scripts/grade-snapshot.mjs: the pure lib
 * layer (lib/panel.mjs) knows no I/O; this adapter wires file loading
 * (injectable for tests), scoring-basis resolution, panel assembly, baseline +
 * candidate grading, and the markdown verdict.
 *
 * Public exports:
 *   DEFAULT_SCORING_SNAPSHOT, DEFAULT_LOAD
 *   resolveScoring({ basis, scoringFrom, load })              → { scoringSettings|null, basisMeta }
 *   buildOutcomeMaps(years, scoring, load)                    → { [year]: { outcomes, droppedTerms, excludedRateKeys, scoredKeyCount } | null }
 *   assemblePanel({ fromYear, toYear, attribution, basis, scoringFrom, minOutcomeGames, load }) → { rows, coverage, meta }
 *   runBaseline(panel, opts)                                  → { [position]: EvaluateModelResult }
 *   runCandidates(panel, opts)                                → CandidateReport[]
 *   buildFitReport(panel, baseline, candidates, opts)         → FitReport
 *   buildVerdictMarkdown(panel, fitReport)                    → string
 *   writeArtifacts({ panel, fitReport, verdictMd })           → { panelPath, fitPath, verdictPath }
 */

import fs from 'fs';
import path from 'path';
import { readJson, writeJsonStable, repoPath } from '../lib/io.mjs';
import { buildInBasisOutcomes, buildHalfPprOutcomes } from './grade-snapshot.mjs';
import {
  PANEL_DEFAULTS,
  PANEL_POSITIONS,
  PANEL_GATES,
  ATTRIBUTION_MODES,
  BASELINE_FEATURES,
  CANDIDATES,
  assemblePanelRows,
  forwardChainFolds,
  evaluateModel,
  gradeCandidate,
  FLIP_THRESHOLDS,
  classifyAttributionCohort,
  pairPredictions,
  summarizeModeDelta,
  summarizeFeatureDelta,
  decideFlipVerdict,
} from '../lib/panel.mjs';

export const DEFAULT_SCORING_SNAPSHOT = '2026-07-05';

export const DEFAULT_LOAD = {
  loadSeasonTotals: (year) => readJson(`nfl/season-totals/${year}.json`),
  loadAdvstats:     (year) => readJson(`nflverse/advstats/${year}.json`),
  loadRoster:       (year) => readJson(`nflverse/roster/${year}.json`),
  loadSnapshot:     (date) => readJson(`snapshots/${date}.json`),
  // Isolated on purpose: R1-SNAPS re-points THIS ONE FUNCTION at nflverse/snaps/<year>.json.
  loadSnapShare:    null,   // null = derive from season-totals off_snp/tm_off_snp (the 2020+ path)
};

// ─── Scoring-basis resolution ──────────────────────────────────────────────────

export function resolveScoring({ basis = 'in-basis', scoringFrom = DEFAULT_SCORING_SNAPSHOT, load = DEFAULT_LOAD }) {
  if (basis === 'half_ppr') {
    return { scoringSettings: null, basisMeta: { type: 'half_ppr', scoringSource: null } };
  }
  const snapshot = load.loadSnapshot(scoringFrom);
  if (!snapshot || !snapshot.scoringSettings) {
    throw new Error(`[panel] snapshot ${scoringFrom} not found or missing scoringSettings — cannot resolve in-basis scoring (use --basis half_ppr to bypass)`);
  }
  return {
    scoringSettings: snapshot.scoringSettings,
    basisMeta: { type: snapshot.scoringBasis ?? 'custom', scoringSource: scoringFrom },
  };
}

// ─── Outcome maps (in-basis or half_ppr) per year ──────────────────────────────

export function buildOutcomeMaps(years, scoring, load = DEFAULT_LOAD) {
  const result = {};
  for (const year of years) {
    const seasonTotals = load.loadSeasonTotals(year);
    if (!seasonTotals) { result[year] = null; continue; }
    if (scoring.basis === 'half_ppr') {
      result[year] = { outcomes: buildHalfPprOutcomes(seasonTotals), droppedTerms: [], excludedRateKeys: [], scoredKeyCount: null };
    } else {
      result[year] = buildInBasisOutcomes(seasonTotals, scoring.scoringSettings);
    }
  }
  return result;
}

// ─── Panel assembly ─────────────────────────────────────────────────────────────

export function assemblePanel({
  fromYear = PANEL_DEFAULTS.fromYear,
  toYear = PANEL_DEFAULTS.toYear,
  attribution = 'current-team',
  basis = 'in-basis',
  scoringFrom = DEFAULT_SCORING_SNAPSHOT,
  minOutcomeGames = PANEL_DEFAULTS.minOutcomeGames,
  load = DEFAULT_LOAD,
}) {
  if (!ATTRIBUTION_MODES.includes(attribution)) {
    throw new Error(`[panel] unknown --attribution '${attribution}' — use current-team|per-season-team`);
  }

  const { scoringSettings, basisMeta } = resolveScoring({ basis, scoringFrom, load });
  const scoring = basis === 'half_ppr' ? { basis: 'half_ppr' } : { basis: 'in-basis', scoringSettings };

  const loadFromYear = fromYear - 2; // basePPG's Y-2 lookback
  const loadToYear = toYear + 1;     // outcome Y+1
  const years = [];
  for (let y = loadFromYear; y <= loadToYear; y++) years.push(y);

  const outcomeMapsByYear = buildOutcomeMaps(years, scoring, load);

  const inputsByYear = {};
  for (const y of years) {
    const seasonTotals = load.loadSeasonTotals(y);
    inputsByYear[y] = {
      seasonTotals: seasonTotals ?? {},
      outcomes: outcomeMapsByYear[y]?.outcomes ?? new Map(),
      advstats: (y >= fromYear && y <= toYear) ? load.loadAdvstats(y) : null,
      roster:   (y >= fromYear && y <= toYear) ? load.loadRoster(y)   : null,
    };
  }

  const { rows, coverage } = assemblePanelRows(inputsByYear, {
    fromYear, toYear, attribution, minOutcomeGames, minPredictorGames: PANEL_DEFAULTS.minPredictorGames,
  });

  const perYearBasis = {};
  for (const y of years) {
    const om = outcomeMapsByYear[y];
    if (om) perYearBasis[y] = { droppedTerms: om.droppedTerms, excludedRateKeys: om.excludedRateKeys, scoredKeyCount: om.scoredKeyCount };
  }

  const meta = {
    generatedAt: new Date().toISOString(),
    panelYears: { fromYear, toYear },
    attribution,
    basis: { type: basisMeta.type, scoringSource: basisMeta.scoringSource, perYear: perYearBasis },
    gates: PANEL_GATES,
    minOutcomeGames,
    minTrainSeasons: PANEL_DEFAULTS.minTrainSeasons,
  };

  return { rows, coverage, meta };
}

// ─── Baseline + candidates ──────────────────────────────────────────────────────

function panelFolds(panel) {
  const years = panel.rows.map(r => r.predictorYear);
  return forwardChainFolds(years, PANEL_DEFAULTS.minTrainSeasons);
}

export function runBaseline(panel, opts = {}) {
  const { ridgeLambda = PANEL_DEFAULTS.ridgeLambda } = opts;
  const folds = panelFolds(panel);
  const report = {};
  for (const position of PANEL_POSITIONS) {
    const posRows = panel.rows.filter(r => r.position === position);
    report[position] = evaluateModel(posRows, folds, BASELINE_FEATURES[position], { ridgeLambda });
  }
  return report;
}

export function runCandidates(panel, opts = {}) {
  const { ridgeLambda = PANEL_DEFAULTS.ridgeLambda, ridgeSweep = PANEL_DEFAULTS.ridgeSweep } = opts;
  const folds = panelFolds(panel);
  const results = [];
  for (const [candidateName, { positions, diagnosticPositions }] of Object.entries(CANDIDATES)) {
    const allPositions = [...positions, ...diagnosticPositions.filter(p => !positions.includes(p))];
    for (const position of allPositions) {
      const diagnostic = diagnosticPositions.includes(position) && !positions.includes(position);
      const graded = gradeCandidate(panel.rows, folds, position, candidateName, candidateName, { ridgeLambda, ridgeSweep });
      results.push({ ...graded, diagnostic });
    }
  }
  return results;
}

export function buildFitReport(panel, baseline, candidates, opts = {}) {
  const { ridgeLambda = PANEL_DEFAULTS.ridgeLambda, ridgeSweep = PANEL_DEFAULTS.ridgeSweep } = opts;
  const evalYears = panelFolds(panel).map(f => f.evalYear);
  return {
    meta: { ...panel.meta, ridgeLambda, ridgeSweep, evalYears, featureNames: BASELINE_FEATURES },
    baseline,
    candidates,
  };
}

// ─── Verdict markdown (§5 artifact 3) ──────────────────────────────────────────

const AGE_BLIND_CAVEAT =
  'Standing caveat: the baseline is age-blind (draft_picks age has no server-side sleeper_id join). ' +
  'A CLEARS verdict here is provisional-pending-age, not cleared for activation — a candidate can clear ' +
  'by proxying for age and add nothing once age is present app-side.';

function fmt(v, digits = 3) {
  return v == null || !Number.isFinite(v) ? 'n/a' : v.toFixed(digits);
}

function coverageTable(coverage) {
  const lines = ['| Position | Year | Assembled | Surviving | Movers | Drop reasons |', '|---|---|---|---|---|---|'];
  for (const row of coverage.perPositionYear) {
    const drops = Object.entries(row.drops).map(([k, v]) => `${k}=${v}`).join(', ') || '—';
    lines.push(`| ${row.position} | ${row.year} | ${row.assembled} | ${row.surviving} | ${row.movers} | ${drops} |`);
  }
  if (coverage.skippedYears.length > 0) {
    lines.push('', `Skipped years (missing season-totals file): ${coverage.skippedYears.join(', ')}`);
  }
  return lines.join('\n');
}

function baselineSection(baseline) {
  const lines = [];
  for (const position of PANEL_POSITIONS) {
    const b = baseline[position];
    if (!b || b.pooled.n === 0) { lines.push(`### ${position}`, '', 'No rows survived listwise for this position.', ''); continue; }
    const perYear = b.perEvalYear.map(f => `${f.evalYear}: n=${f.n}, spearman=${fmt(f.spearman)}`).join('; ');
    lines.push(
      `### ${position}`,
      '',
      `- Pooled MAE: ${fmt(b.pooled.mae, 3)} (n=${b.pooled.n})`,
      `- Per-year: ${perYear}`,
      `- Spearman (n-weighted mean): ${fmt(b.pooled.spearmanMean)}`,
      `- Mover cohort: n=${b.movers.n}, MAE=${fmt(b.movers.mae, 3)}`,
      ''
    );
  }
  return lines.join('\n');
}

function candidateSection(candidates) {
  const lines = [];
  for (const c of candidates) {
    const label = `${c.candidate} — ${c.position}${c.diagnostic ? ' (diagnostic-only)' : ''}`;
    const perYear = c.deltas.maePerYear.map(y => `${y.evalYear}: ΔMAE=${fmt(y.dMae, 3)}`).join('; ');
    const sweep = c.sweep.map(s => `λ=${s.lambda}: ΔMAE=${fmt(s.dMae, 3)}, ΔSpearman=${fmt(s.dSpearman)}`).join('; ');
    lines.push(
      `### ${label}`,
      '',
      `- n candidate-complete: ${c.nCandidateComplete} (full baseline n: ${c.fullBaselineN})`,
      `- ΔMAE pooled: ${fmt(c.deltas.maePooled, 3)}`,
      `- ΔMAE per year: ${perYear}`,
      `- ΔSpearman (n-weighted mean): ${fmt(c.deltas.spearmanMean)}`,
      `- Candidate coefficient (standardized, all-years descriptive fit): ${fmt(c.coefficient.allYears)}`,
      `- λ-sweep: ${sweep}`,
      `- **Verdict: ${c.verdict}**`,
    );
    if (c.candidate === 'shareLevel') {
      lines.push('- Reconciliation (decision 4): decision 4 measured `target_share` partial β ≈ 0 vs volume controls — ' +
        (c.verdict === 'NO-GAIN'
          ? 'this run reconciles with that expectation (share level adds no incremental value once the baseline volume/opportunity features are controlled for).'
          : `this run's verdict (${c.verdict}) diverges from that expectation and should be read alongside the sign/magnitude of the coefficient above before treating it as new signal.`));
    }
    if (c.verdict === 'CLEARS') {
      lines.push(`- ${AGE_BLIND_CAVEAT}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export function buildVerdictMarkdown(panel, fitReport) {
  const { meta } = panel;
  const date = meta.generatedAt.slice(0, 10);
  const lines = [
    `# E-0a Grading Baseline Verdict — ${date}`,
    '',
    `**Config:** predictor years ${meta.panelYears.fromYear}–${meta.panelYears.toYear} (outcomes ${meta.panelYears.fromYear + 1}–${meta.panelYears.toYear + 1}), ` +
      `attribution=\`${meta.attribution}\`, basis=\`${meta.basis.type}\` (scoring source: ${meta.basis.scoringSource ?? 'n/a'}), ` +
      `ridge λ=${fitReport.meta.ridgeLambda} (sweep: ${fitReport.meta.ridgeSweep.join(', ')})`,
    '',
    '**Reproduce:** `node bin/panel.mjs --write`',
    '',
    '## Panel coverage',
    '',
    coverageTable(panel.coverage),
    '',
    '## Baseline accuracy',
    '',
    baselineSection(fitReport.baseline),
    '## Candidates',
    '',
    candidateSection(fitReport.candidates),
    '## Methodology notes',
    '',
    '- **Scoring basis is reported per quantity, not once globally.** The committed outcome (and all PPG-denominated ' +
      `features) is \`${meta.basis.type}\` (pinned snapshot ${meta.basis.scoringSource ?? 'n/a'}). \`consistencyCV\` is ` +
      'derived from stored `weeklyPoints` (half_ppr weekly points, the only per-week series in the store) — it is a ' +
      'half_ppr-basis proxy regardless of the outcome basis, not converted. Any comparison to the old `bin/backtest.mjs` ' +
      'β holds only under a `--basis half_ppr` run.',
    `- **Attribution:** \`${meta.attribution}\` — matches the app's live \`DEFAULT_ATTRIBUTION\`; these numbers describe ` +
      'the shipped attribution semantics, not a post-flip world. `per-season-team` attributes each historical season to ' +
      'that season\'s own v3 team (era-accurate) — implemented for the R2-REANCHOR flip gate (`node bin/panel.mjs ' +
      '--flip-gate`; seam: `lib/panel.mjs` `teamKeyResolver` + `scripts/panel-run.mjs` `assemblePanel({ attribution })` / ' +
      '`bin/panel.mjs --attribution`).',
    '- **Baseline omissions (§2.1):** age curve (no in-repo sleeper_id↔draft_picks join — baseline is age-blind), ' +
      'breakout/bounce-back/TD-reliance buckets, trajectory beyond momentum/basePPG, team offense/QB quality, depth ' +
      'chart, comp blend/KTC market signal. The headline is "incremental value over the reconstructable baseline," not ' +
      'over the full app stack.',
    '- **Non-independence:** recurring players across Y→Y+1 pairs → rows are not independent; deltas are effect-size ' +
      'estimates, not significance tests.',
    '- **Survivorship:** outcome gate `gamesPlayed(Y+1) ≥ 6` — the standard backtest survivorship caveat applies.',
    `- ${AGE_BLIND_CAVEAT}`,
    '- **Null policy:** data holes (`snapShare` pre-2020, missing year file, `teamRzShare`/`share(Y)` below the team ' +
      'denominator floor) → listwise exclusion, counted per dropReason; structural absence (`momentum`/`shareTrend` with ' +
      'no qualifying Y−1) → impute 0 (neutral); degenerate `consistencyCV` → impute the training-fold position mean ' +
      '(recomputed per fold from training rows only — no leakage).',
    '',
  ];
  return lines.join('\n');
}

// ─── Artifact writes (§5) ────────────────────────────────────────────────────────

// Two JSON artifacts via writeJsonStable; the markdown verdict is plain text, not
// JSON, so it is written directly with fs.writeFileSync (writeJsonStable would
// JSON.stringify it and corrupt the file).
export function writeArtifacts({ panel, fitReport, verdictMd }) {
  const date = panel.meta.generatedAt.slice(0, 10);
  const panelPath = `backtests/${date}-e0a-panel.json`;
  const fitPath = `backtests/${date}-e0a-fit.json`;
  const verdictPath = `grading/${date}-e0a-verdict.md`;

  writeJsonStable(panelPath, panel);
  writeJsonStable(fitPath, fitReport);

  const verdictAbs = repoPath(verdictPath);
  fs.mkdirSync(path.dirname(verdictAbs), { recursive: true });
  fs.writeFileSync(verdictAbs, verdictMd, 'utf8');

  return { panelPath, fitPath, verdictPath };
}

// ─── R2 flip gate (roadmap R2-REANCHOR — see .claude/tasks/r2-flip-gate.md) ────
//
// Dual-mode before/after comparison layer. runFlipGate assembles the panel
// twice (once per attribution mode) via the existing assemblePanel, runs the
// existing runBaseline on each, then hands the pre-assembled panels/baselines
// to buildFlipReport, which enforces the §3.2 parity gates before computing any
// metric. Keeping the parity check inside buildFlipReport (rather than only
// inline in runFlipGate) means it can be exercised directly with hand-crafted
// panels — see test T-F7's negative case.

const SHARE_POSITIONS = ['WR', 'RB', 'TE'];
const FLIP_SWEEP_LAMBDAS = [0.5, 1, 2]; // §3.3's pre-registered sweep set (a fixed subset of PANEL_DEFAULTS.ridgeSweep)

// Lite team lookup for cohort classification: reads v3 season-totals for
// [fromYear−1 .. toYear+1] via load.loadSeasonTotals, keeps only { team } per pid.
export function loadTeamLookup(fromYear, toYear, load = DEFAULT_LOAD) {
  const teamsByYear = {};
  for (let y = fromYear - 1; y <= toYear + 1; y++) {
    const seasonTotals = load.loadSeasonTotals(y);
    if (!seasonTotals) continue;
    const yearLookup = {};
    for (const [pid, rec] of Object.entries(seasonTotals)) {
      yearLookup[pid] = { team: rec?.team ?? null };
    }
    teamsByYear[y] = yearLookup;
  }
  return teamsByYear;
}

function flattenPredictions(baselinePosition) {
  const out = [];
  for (const fold of baselinePosition.perEvalYear) {
    for (const p of fold.predictions) {
      out.push({ pid: p.pid, evalYear: fold.evalYear, actual: p.actual, predicted: p.predicted });
    }
  }
  return out;
}

// §3.2 (i)-(iv) parity gates, hard-fail. Operates on pre-assembled panels/baselines
// so it is directly callable with hand-crafted inputs (T-F7), not only via runFlipGate.
function assertFlipParity(panelCT, panelPS, baselineCT, baselinePS) {
  const keyOf = (r) => `${r.sleeperId}|${r.predictorYear}|${r.position}`;
  const ctKeys = panelCT.rows.map(keyOf).sort();
  const psKeys = panelPS.rows.map(keyOf).sort();
  if (JSON.stringify(ctKeys) !== JSON.stringify(psKeys)) {
    throw new Error('[panel] flip-gate parity violation: row sets diverge between attribution modes');
  }

  const psByKey = new Map(panelPS.rows.map(r => [keyOf(r), r]));
  const checkedFeatures = new Set();
  for (const ctRow of panelCT.rows) {
    const psRow = psByKey.get(keyOf(ctRow));
    if (ctRow.outcomePPG !== psRow.outcomePPG) {
      throw new Error(`[panel] flip-gate parity violation: outcomePPG diverges for ${ctRow.sleeperId}/${ctRow.predictorYear}`);
    }
    for (const [key, value] of Object.entries(ctRow.candidates)) {
      if (psRow.candidates[key] !== value) {
        throw new Error(`[panel] flip-gate parity violation: candidate '${key}' diverges for ${ctRow.sleeperId}/${ctRow.predictorYear}`);
      }
    }
    for (const [key, value] of Object.entries(ctRow.features)) {
      if (key === 'shareTrend') continue;
      checkedFeatures.add(key);
      if (psRow.features[key] !== value) {
        throw new Error(`[panel] flip-gate parity violation: feature '${key}' diverges for ${ctRow.sleeperId}/${ctRow.predictorYear}`);
      }
    }
  }

  if (JSON.stringify(panelCT.coverage.perPositionYear) !== JSON.stringify(panelPS.coverage.perPositionYear)) {
    throw new Error('[panel] flip-gate parity violation: coverage.perPositionYear diverges between attribution modes');
  }

  const qbCT = baselineCT.QB?.pooled ?? { mae: null, spearmanMean: null };
  const qbPS = baselinePS.QB?.pooled ?? { mae: null, spearmanMean: null };
  const maeDeltaAbs = (qbCT.mae != null && qbPS.mae != null) ? Math.abs(qbPS.mae - qbCT.mae) : 0;
  const spearmanDeltaAbs = (qbCT.spearmanMean != null && qbPS.spearmanMean != null) ? Math.abs(qbPS.spearmanMean - qbCT.spearmanMean) : 0;
  const qbPass = maeDeltaAbs < 1e-9 && spearmanDeltaAbs < 1e-9;
  if (!qbPass) {
    throw new Error(`[panel] flip-gate parity violation: QB pooled metrics diverge (ΔMAE=${maeDeltaAbs}, ΔSpearman=${spearmanDeltaAbs})`);
  }

  return {
    rowParity: { identical: true, n: panelCT.rows.length, checkedFeatures: [...checkedFeatures].sort() },
    qbInvariance: { maeDeltaAbs, spearmanDeltaAbs, pass: qbPass },
  };
}

function cohortPredicate(cohortByKey, pid, evalYear) {
  return cohortByKey.get(`${pid}|${evalYear}`) ?? null;
}

// Assembles both modes (assemblePanel × 2, identical config), enforces §3.2
// parity gates (throws on violation, via buildFlipReport), classifies rows,
// annotates predictions.
export function runFlipGate({
  fromYear = PANEL_DEFAULTS.fromYear,
  toYear = PANEL_DEFAULTS.toYear,
  basis = 'in-basis',
  scoringFrom = DEFAULT_SCORING_SNAPSHOT,
  minOutcomeGames = PANEL_DEFAULTS.minOutcomeGames,
  ridgeLambda = PANEL_DEFAULTS.ridgeLambda,
  ridgeSweep = PANEL_DEFAULTS.ridgeSweep,
  load = DEFAULT_LOAD,
} = {}) {
  const panelCT = assemblePanel({ fromYear, toYear, attribution: 'current-team', basis, scoringFrom, minOutcomeGames, load });
  const panelPS = assemblePanel({ fromYear, toYear, attribution: 'per-season-team', basis, scoringFrom, minOutcomeGames, load });

  const baselineCT = runBaseline(panelCT, { ridgeLambda });
  const baselinePS = runBaseline(panelPS, { ridgeLambda });

  const teamsByYear = loadTeamLookup(fromYear, toYear, load);
  const cohortByKey = new Map();
  for (const row of panelCT.rows) {
    cohortByKey.set(`${row.sleeperId}|${row.predictorYear}`, classifyAttributionCohort(row.sleeperId, row.predictorYear, teamsByYear));
  }

  const panels = { currentTeam: panelCT, perSeasonTeam: panelPS };
  const baselines = { currentTeam: baselineCT, perSeasonTeam: baselinePS };
  const opts = { fromYear, toYear, basis, scoringFrom, minOutcomeGames, ridgeLambda, ridgeSweep };

  const flipReport = buildFlipReport({ panels, baselines, cohortByKey, opts });

  return { panels, baselines, cohortByKey, flipReport };
}

export function buildFlipReport({ panels, baselines, cohortByKey, opts }) {
  const { rowParity, qbInvariance } = assertFlipParity(panels.currentTeam, panels.perSeasonTeam, baselines.currentTeam, baselines.perSeasonTeam);

  const perPosition = {};
  const featureDelta = { perPosition: {} };
  let pooledSensitivePaired = [];

  for (const position of SHARE_POSITIONS) {
    const predsCT = flattenPredictions(baselines.currentTeam[position]);
    const predsPS = flattenPredictions(baselines.perSeasonTeam[position]);
    const paired = pairPredictions(predsCT, predsPS);

    const sensitivePaired = paired.filter(r => cohortPredicate(cohortByKey, r.pid, r.evalYear)?.sensitive);
    const sensitiveForwardMoverPaired = sensitivePaired.filter(r => cohortPredicate(cohortByKey, r.pid, r.evalYear)?.forwardMover === true);
    const sensitiveNotForwardMoverPaired = sensitivePaired.filter(r => cohortPredicate(cohortByKey, r.pid, r.evalYear)?.forwardMover === false);
    const ym1TeamNullPaired = paired.filter(r => cohortPredicate(cohortByKey, r.pid, r.evalYear)?.segment === 'ym1-team-null');
    const singleTeamPaired = paired.filter(r => cohortPredicate(cohortByKey, r.pid, r.evalYear)?.segment === 'single-team');

    pooledSensitivePaired = pooledSensitivePaired.concat(sensitivePaired);

    const nByYear = {};
    for (const r of sensitivePaired) nByYear[r.evalYear] = (nByYear[r.evalYear] ?? 0) + 1;

    const bCT = baselines.currentTeam[position];
    const bPS = baselines.perSeasonTeam[position];
    const overallCT = { n: bCT.pooled.n, mae: bCT.pooled.mae, spearmanMean: bCT.pooled.spearmanMean, perYear: bCT.perEvalYear.map(f => ({ evalYear: f.evalYear, n: f.n, mae: f.mae, spearman: f.spearman })) };
    const overallPS = { n: bPS.pooled.n, mae: bPS.pooled.mae, spearmanMean: bPS.pooled.spearmanMean, perYear: bPS.perEvalYear.map(f => ({ evalYear: f.evalYear, n: f.n, mae: f.mae, spearman: f.spearman })) };
    const maeDelta = (overallCT.mae != null && overallPS.mae != null) ? overallPS.mae - overallCT.mae : null;
    const relMaeDelta = (maeDelta != null && overallCT.mae > 0) ? maeDelta / overallCT.mae : null;
    const spearmanDelta = (overallCT.spearmanMean != null && overallPS.spearmanMean != null) ? overallPS.spearmanMean - overallCT.spearmanMean : null;

    perPosition[position] = {
      overall: { currentTeam: overallCT, perSeasonTeam: overallPS, delta: { mae: maeDelta, relMae: relMaeDelta, spearman: spearmanDelta } },
      cohorts: {
        sensitive: { ...summarizeModeDelta(sensitivePaired), nByYear },
        sensitiveForwardMover: summarizeModeDelta(sensitiveForwardMoverPaired),
        sensitiveNotForwardMover: summarizeModeDelta(sensitiveNotForwardMoverPaired),
        ym1TeamNull: summarizeModeDelta(ym1TeamNullPaired),
        singleTeam: summarizeModeDelta(singleTeamPaired),
      },
    };

    const rowsCTPos = panels.currentTeam.rows.filter(r => r.position === position);
    const rowsPSPos = panels.perSeasonTeam.rows.filter(r => r.position === position);
    featureDelta.perPosition[position] = summarizeFeatureDelta(rowsCTPos, rowsPSPos, cohortByKey);
  }
  perPosition.QB = { canaryOnly: true };

  const cohortPooledSummary = summarizeModeDelta(pooledSensitivePaired);
  const cohortPooled = { n: cohortPooledSummary.n, relDMae: cohortPooledSummary.mae.relDelta, paired: cohortPooledSummary.paired };

  const teamOfRow = (pid, year) => {
    const row = panels.perSeasonTeam.rows.find(r => r.sleeperId === pid && r.predictorYear === year);
    return row?.team ?? null;
  };
  const topPredShift = [...pooledSensitivePaired]
    .sort((a, b) => Math.abs(b.predShift) - Math.abs(a.predShift))
    .slice(0, 10)
    .map(r => ({ pid: r.pid, team: teamOfRow(r.pid, r.evalYear), evalYear: r.evalYear, predCT: r.predCT, predPS: r.predPS, actual: r.actual }));

  const sweep = FLIP_SWEEP_LAMBDAS.map(lambda => {
    const baseCT = runBaseline(panels.currentTeam, { ridgeLambda: lambda });
    const basePS = runBaseline(panels.perSeasonTeam, { ridgeLambda: lambda });
    const overallDMaeByPosition = {};
    let sweepSensitivePaired = [];
    for (const position of SHARE_POSITIONS) {
      const ctMae = baseCT[position].pooled.mae;
      const psMae = basePS[position].pooled.mae;
      overallDMaeByPosition[position] = (ctMae != null && psMae != null) ? psMae - ctMae : null;

      const paired = pairPredictions(flattenPredictions(baseCT[position]), flattenPredictions(basePS[position]));
      sweepSensitivePaired = sweepSensitivePaired.concat(paired.filter(r => cohortPredicate(cohortByKey, r.pid, r.evalYear)?.sensitive));
    }
    return { lambda, overallDMaeByPosition, cohortDMae: summarizeModeDelta(sweepSensitivePaired).mae.delta };
  });

  const verdictInputsPerPosition = SHARE_POSITIONS.map(position => ({
    position,
    overallRelDMae: perPosition[position].overall.delta.relMae,
    dSpearman: perPosition[position].overall.delta.spearman,
  }));
  const verdictInputs = { sensitivePooledN: cohortPooled.n, perPosition: verdictInputsPerPosition, cohortPooledRelDMae: cohortPooled.relDMae };
  const verdict = decideFlipVerdict(verdictInputs, FLIP_THRESHOLDS);

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      panelYears: { fromYear: opts.fromYear, toYear: opts.toYear },
      modes: ATTRIBUTION_MODES,
      basis: panels.currentTeam.meta.basis.type,
      gates: PANEL_GATES,
      minOutcomeGames: opts.minOutcomeGames,
      minTrainSeasons: PANEL_DEFAULTS.minTrainSeasons,
      ridgeLambda: opts.ridgeLambda,
      ridgeSweep: opts.ridgeSweep,
      evalYears: panelFolds(panels.currentTeam).map(f => f.evalYear),
      thresholds: FLIP_THRESHOLDS,
    },
    rowParity,
    qbInvariance,
    undercountRepair: {
      unattributedByYear: {
        currentTeam: panels.currentTeam.coverage.unattributedByYear,
        perSeasonTeam: panels.perSeasonTeam.coverage.unattributedByYear,
      },
    },
    featureDelta,
    perPosition,
    cohortPooled,
    topPredShift,
    sweep,
    verdict,
    verdictInputs,
  };
}

const FLIP_RECOMMENDATIONS = {
  UNDERPOWERED: 'Defer the flip. Re-run this gate unchanged after R1-SNAPS widens the panel window to 2013+ ' +
    '(same command, no code change — window config only).',
  'FLIP-DEGRADES': 'Do not flip.',
  'FLIP-CLEARS': 'The data-side gate clears; the app-side activation slice may proceed (see ' +
    '.claude/tasks/r2-flip-gate.md §11).',
};

const FLIP_NEUTRALIZATION_STANCE =
  'The panel applies no mover-specific zeroing in either mode — the only neutral-imputation is structural ' +
  '(`share(Y−1)` null → `shareTrend = 0`), and the `shareTrend` code path is mode-blind (only `teamOf` ' +
  'differs). Identical treatment between the two arms is therefore satisfied by code path, vacuously. ' +
  'Forward-mover masking — the app-style zeroing this gate deliberately does not add to either arm — is ' +
  'handled honestly by segmentation (the forwardMover split below), not by modifying the features.';

const FLIP_AGE_BLINDNESS_NOTE =
  'Age-blindness — reduced relevance here: the E-0a baseline is age-blind, and candidate CLEARS verdicts ' +
  'there are correctly held provisional-pending-age (a candidate can proxy age). That discount does not ' +
  'transfer to this verdict: this is a within-panel A/B where both arms are equally age-blind, and age does ' +
  'not change which team a past season belongs to — attribution accuracy and the age omission are orthogonal.';

function flipFmt(v, digits = 3) {
  return v == null || !Number.isFinite(v) ? 'n/a' : v.toFixed(digits);
}

function flipUndercountTable(undercountRepair) {
  const ct = undercountRepair.unattributedByYear.currentTeam;
  const ps = undercountRepair.unattributedByYear.perSeasonTeam;
  const years = [...new Set([...Object.keys(ct), ...Object.keys(ps)])].sort();
  const lines = ['| Year | current-team unattributed (this/prior) | per-season-team unattributed (this/prior) |', '|---|---|---|'];
  for (const y of years) {
    const c = ct[y] ?? {}; const p = ps[y] ?? {};
    lines.push(`| ${y} | ${c.thisYear ?? 'n/a'}/${c.priorYear ?? 'n/a'} | ${p.thisYear ?? 'n/a'}/${p.priorYear ?? 'n/a'} |`);
  }
  return lines.join('\n');
}

function flipSegmentTable(featureDelta) {
  const segments = ['historical-mover', 'ym1-team-null', 'single-team', 'no-ym1-record'];
  const lines = ['| Position | Segment | n | mean |Δ| | p90 |Δ| | max |Δ| |', '|---|---|---|---|---|---|'];
  for (const [position, data] of Object.entries(featureDelta.perPosition)) {
    for (const segment of segments) {
      const s = data.perSegment[segment];
      if (!s) continue;
      lines.push(`| ${position} | ${segment} | ${s.n} | ${flipFmt(s.meanAbsDelta, 4)} | ${flipFmt(s.p90AbsDelta, 4)} | ${flipFmt(s.maxAbsDelta, 4)} |`);
    }
    lines.push(`| ${position} | asymmetricImputationN | ${data.asymmetricImputationN} | | | |`);
  }
  return lines.join('\n');
}

function flipOverallTable(perPosition) {
  const lines = ['| Position | MAE (current-team) | MAE (per-season) | ΔMAE | relΔMAE | Spearman (current-team) | Spearman (per-season) | ΔSpearman |', '|---|---|---|---|---|---|---|---|'];
  for (const position of SHARE_POSITIONS) {
    const p = perPosition[position];
    lines.push(`| ${position} | ${flipFmt(p.overall.currentTeam.mae)} (n=${p.overall.currentTeam.n}) | ${flipFmt(p.overall.perSeasonTeam.mae)} (n=${p.overall.perSeasonTeam.n}) | ` +
      `${flipFmt(p.overall.delta.mae)} | ${flipFmt(p.overall.delta.relMae, 4)} | ${flipFmt(p.overall.currentTeam.spearmanMean)} | ${flipFmt(p.overall.perSeasonTeam.spearmanMean)} | ${flipFmt(p.overall.delta.spearman)} |`);
  }
  return lines.join('\n');
}

function flipCohortSection(perPosition) {
  const lines = [];
  for (const position of SHARE_POSITIONS) {
    const c = perPosition[position].cohorts;
    lines.push(`### ${position}`, '');
    lines.push(`- Sensitive cohort: n=${c.sensitive.n}, ΔMAE=${flipFmt(c.sensitive.mae.delta)}, relΔMAE=${flipFmt(c.sensitive.mae.relDelta, 4)}, % rows improved=${flipFmt(c.sensitive.paired.pctImproved, 1)}`);
    if (c.sensitive.n > 0 && c.sensitive.n < 30) {
      lines.push(`  - **n < 30 — do not present this position's cohort delta as decisive (§2.4).**`);
    }
    lines.push(`  - forwardMover=true (app-projection-path neutralized; dynasty-channel proxy): n=${c.sensitiveForwardMover.n}, ΔMAE=${flipFmt(c.sensitiveForwardMover.mae.delta)}`);
    lines.push(`  - forwardMover=false (app-realizable projection-path slice): n=${c.sensitiveNotForwardMover.n}, ΔMAE=${flipFmt(c.sensitiveNotForwardMover.mae.delta)}`);
    lines.push(`- ym1-team-null (asymmetric imputation, §1.4): n=${c.ym1TeamNull.n}, ΔMAE=${flipFmt(c.ym1TeamNull.mae.delta)}`);
    lines.push(`- single-team (second-order denominator drift, contrast): n=${c.singleTeam.n}, ΔMAE=${flipFmt(c.singleTeam.mae.delta)}`, '');
  }
  return lines.join('\n');
}

function flipTopPredShiftTable(topPredShift) {
  const lines = ['| pid | team | year | pred (current-team) | pred (per-season) | actual | predShift |', '|---|---|---|---|---|---|---|'];
  for (const r of topPredShift) {
    lines.push(`| ${r.pid} | ${r.team ?? 'n/a'} | ${r.evalYear} | ${flipFmt(r.predCT)} | ${flipFmt(r.predPS)} | ${flipFmt(r.actual)} | ${flipFmt(r.predPS - r.predCT)} |`);
  }
  return lines.join('\n');
}

function flipSweepTable(sweep) {
  const lines = ['| λ | ΔMAE WR | ΔMAE RB | ΔMAE TE | cohort ΔMAE |', '|---|---|---|---|---|'];
  for (const s of sweep) {
    lines.push(`| ${s.lambda} | ${flipFmt(s.overallDMaeByPosition.WR)} | ${flipFmt(s.overallDMaeByPosition.RB)} | ${flipFmt(s.overallDMaeByPosition.TE)} | ${flipFmt(s.cohortDMae)} |`);
  }
  return lines.join('\n');
}

export function buildFlipVerdictMarkdown(flipReport) {
  const { meta } = flipReport;
  const date = meta.generatedAt.slice(0, 10);
  const lines = [
    `# R2 Flip Gate Verdict — ${date}`,
    '',
    `**Config:** predictor years ${meta.panelYears.fromYear}–${meta.panelYears.toYear}, modes=\`${meta.modes.join('\`, \`')}\`, ` +
      `basis=\`${meta.basis}\`, ridge λ=${meta.ridgeLambda} (report sweep: ${FLIP_SWEEP_LAMBDAS.join(', ')})`,
    '',
    '**Reproduce:** `node bin/panel.mjs --flip-gate --write`',
    '',
    '## Parity + QB canary',
    '',
    `- Row parity: identical=${flipReport.rowParity.identical}, n=${flipReport.rowParity.n}, checked features: ${flipReport.rowParity.checkedFeatures.join(', ')}`,
    `- QB invariance: ΔMAE=${flipFmt(flipReport.qbInvariance.maeDeltaAbs, 9)}, ΔSpearman=${flipFmt(flipReport.qbInvariance.spearmanDeltaAbs, 9)}, pass=${flipReport.qbInvariance.pass}`,
    '',
    '## Undercount repair (coverage.unattributedByYear, both modes)',
    '',
    flipUndercountTable(flipReport.undercountRepair),
    '',
    '## The attribution-sensitive cohort',
    '',
    'Not the offseason-mover cohort the app\'s neutralization targets (forward movers team(Y+1)≠team(Y) — their ' +
      'panel features do not differ at all between modes, since attribution reads only Y and Y−1). The correct ' +
      'cohort is row-grain: rows whose own team-keyed feature window {Y−1, Y} spans more than one resolvable team ' +
      '(`historical-mover` ∪ `ym1-team-null`). Segment N per position (feature-level join):',
    '',
    flipSegmentTable(flipReport.featureDelta),
    '',
    '## Overall accuracy, before/after (all rows, per position)',
    '',
    flipOverallTable(flipReport.perPosition),
    '',
    '## Sensitive-cohort accuracy, before/after',
    '',
    flipCohortSection(flipReport.perPosition),
    '## Top 10 |predShift| rows (pooled sensitive cohort, eyeball audit)',
    '',
    flipTopPredShiftTable(flipReport.topPredShift),
    '',
    '## λ-sweep',
    '',
    flipSweepTable(flipReport.sweep),
    '',
    '## Verdict',
    '',
    `**${flipReport.verdict}**`,
    '',
    FLIP_RECOMMENDATIONS[flipReport.verdict],
    '',
  ];

  if (flipReport.verdict === 'FLIP-DEGRADES') {
    lines.push(
      '### Required investigation (§3.4.2)',
      '',
      'Before concluding correct attribution genuinely predicts worse, check whether current-team was ' +
        'compensating: (i) does the degradation concentrate in the forwardMover=true slice (a trend-transfer ' +
        'question masquerading as attribution — reanchor §4b)? (ii) does it concentrate in rows whose per-season ' +
        'Y−1 share was null-imputed (asymmetric imputation, §1.4)? See the forwardMover split and the ' +
        '`ym1-team-null` row above for the numbers.',
      ''
    );
  }

  lines.push(
    '## Methodology notes',
    '',
    `- ${FLIP_AGE_BLINDNESS_NOTE}`,
    '- **Non-independence:** recurring players across Y→Y+1 pairs → rows are not independent; deltas are ' +
      'effect-size estimates, not significance tests.',
    '- **Survivorship:** outcome gate `gamesPlayed(Y+1) ≥ 6` — the standard backtest survivorship caveat applies.',
    `- **Neutralization stance:** ${FLIP_NEUTRALIZATION_STANCE}`,
    '- **C4 discipline:** unchanged and unthreatened — both modes compute every rate as a ratio of summed season ' +
      'components; nothing in this slice averages per-game values.',
    '- This verdict recommends; the flip itself is a separate app-repo activation commit gated on it.',
    ''
  );

  return lines.join('\n');
}

// The two panels are ~97% identical bytes (only shareTrend diverges, §1) — commit
// one merged file instead of two full copies. QB rows carry no shareTrend feature,
// so their perSeasonTeam sub-object is omitted entirely (not shareTrend: null).
export function buildMergedFlipPanel({ panels, cohortByKey }) {
  const { attribution: _attribution, ...metaRest } = panels.currentTeam.meta;
  const psByKey = new Map(panels.perSeasonTeam.rows.map(r => [`${r.sleeperId}|${r.predictorYear}`, r]));

  const rows = panels.currentTeam.rows.map(ctRow => {
    const key = `${ctRow.sleeperId}|${ctRow.predictorYear}`;
    const psRow = psByKey.get(key);
    const cohort = cohortByKey.get(key) ?? { segment: 'no-ym1-record', sensitive: false, forwardMover: false };
    const merged = { ...ctRow, attributionCohort: cohort };
    if (ctRow.position !== 'QB') {
      merged.perSeasonTeam = { shareTrend: psRow.features.shareTrend };
    }
    return merged;
  });

  return {
    meta: {
      ...metaRest,
      modes: ATTRIBUTION_MODES,
      rowParity: { identical: true, n: panels.currentTeam.rows.length },
    },
    coverage: {
      perPositionYear: panels.currentTeam.coverage.perPositionYear,
      skippedYears: panels.currentTeam.coverage.skippedYears,
      unattributedByYear: {
        currentTeam: panels.currentTeam.coverage.unattributedByYear,
        perSeasonTeam: panels.perSeasonTeam.coverage.unattributedByYear,
      },
    },
    rows,
  };
}

// §5 artifact names — distinct from the e0a family, no manifest calls (unregistered analysis, same convention).
export function writeFlipArtifacts({ mergedPanel, flipReport, verdictMd }) {
  const date = mergedPanel.meta.generatedAt.slice(0, 10);
  const panelPath = `backtests/${date}-r2flip-panel.json`;
  const fitPath = `backtests/${date}-r2flip-fit.json`;
  const verdictPath = `grading/${date}-r2flip-verdict.md`;

  writeJsonStable(panelPath, mergedPanel);
  writeJsonStable(fitPath, flipReport);

  const verdictAbs = repoPath(verdictPath);
  fs.mkdirSync(path.dirname(verdictAbs), { recursive: true });
  fs.writeFileSync(verdictAbs, verdictMd, 'utf8');

  return { panelPath, fitPath, verdictPath };
}
