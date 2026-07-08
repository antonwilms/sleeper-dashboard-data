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
      'the shipped attribution semantics, not a post-flip world. `per-season-team` is reserved for the R2-REANCHOR gate ' +
      'slice (seam: `lib/panel.mjs` `teamKeyResolver` + `scripts/panel-run.mjs` `assemblePanel({ attribution })` / ' +
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
