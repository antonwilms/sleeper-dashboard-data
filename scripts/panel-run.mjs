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
  teamKeyResolver,
  buildTeamTotalsForSeason,
  attachFactorMultipliers,
  gradeExponentFit,
  HISTORY_FLOOR,
  FIT_ALPHA_DEFAULT,
  FIT_ALPHA_SWEEP,
  FIT_COMBINED_CLAMP,
  ENVELOPE_FACTORS,
  FIT_MIN_N_TO_PARAM,
  FIT_MAX_FLAT_ONE_RATE,
  predictFullPipeline,
  computeOptimismStats,
  runSensitivityCheck,
  SENSITIVITY_STEP,
  SENSITIVITY_HOLD_FACTORS,
  computeMaeSweep,
  OPTIMISM_C_GRID,
  computeShrinkageSweep,
  SHRINKAGE_K_GRID,
  groupByQualifyingTier,
  QUALIFYING_TIERS,
  runAblation,
  ABLATION_GRADABLE_FACTORS,
  NOT_GRADABLE_FACTORS,
  runStep4Verdict,
  assembleRookiePanel,
  resolvePosition,
} from '../lib/panel.mjs';

export const DEFAULT_SCORING_SNAPSHOT = '2026-07-05';

export const DEFAULT_LOAD = {
  loadSeasonTotals: (year) => readJson(`nfl/season-totals/${year}.json`),
  loadAdvstats:     (year) => readJson(`nflverse/advstats/${year}.json`),
  loadRoster:       (year) => readJson(`nflverse/roster/${year}.json`),
  loadSnapshot:     (date) => readJson(`snapshots/${date}.json`),
  // R1-SNAPS landed (D6a, finding 3): re-pointed at nflverse/snaps/<year>.json
  // (D4), which supplies offSnaps/teamOffSnaps 2013-2025 — a cross-validated
  // (r>=0.998/position) stand-in for season-totals' own off_snp/tm_off_snp,
  // which are only populated 2020+. resolveSnapCounts (lib/panel.mjs) prefers
  // the season-totals native fields when present; this fills the gap, never
  // overrides a real 2020+ value.
  loadSnapShare:    (year) => readJson(`nflverse/snaps/${year}.json`),
  // D6a — D2 crosswalk (finding 2's position fallback + age's birthdate
  // source) and D5 historical depth charts (Step 8).
  loadPlayerIds:    () => readJson('nflverse/playerids.json'),
  loadDepth:        (year) => readJson(`nflverse/depth/${year}.json`),
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
  withFactorMultipliers = false,
  historyFloor = null,
}) {
  if (!ATTRIBUTION_MODES.includes(attribution)) {
    throw new Error(`[panel] unknown --attribution '${attribution}' — use current-team|per-season-team`);
  }

  const { scoringSettings, basisMeta } = resolveScoring({ basis, scoringFrom, load });
  const scoring = basis === 'half_ppr' ? { basis: 'half_ppr' } : { basis: 'in-basis', scoringSettings };

  // R3-FIT (§3.3): under withFactorMultipliers, load season-totals/outcomes
  // down to historyFloor so multi-season factors (basePPG/momentum/regression/
  // trajectory/shareTrend) see the app's full qualifying history instead of
  // the stock [fromYear-2..] window. advstats/roster are UNCHANGED — they stay
  // [fromYear..toYear] (§3.3); assemblePanelRows' predictor loop is bounded
  // the same way regardless of the widened load, so no spurious rows appear.
  const loadFromYear = (withFactorMultipliers && historyFloor != null) ? historyFloor : fromYear - 2;
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

  // D6a finding 2 — season-independent pid->position crosswalk (nflverse/
  // playerids.json bySleeper), the third resolvePosition fallback. Also the
  // birthdate source for finding 8's age reconstruction (§Design/A). Optional
  // loader — a test harness without loadPlayerIds gets no crosswalk/birthdate
  // (both resolve to their existing neutral defaults).
  const playerIds = typeof load.loadPlayerIds === 'function' ? load.loadPlayerIds() : null;
  const crosswalk = {};
  const birthdateBySleeper = {};
  for (const [sleeperId, entry] of Object.entries(playerIds?.bySleeper ?? {})) {
    if (entry?.birthdate) birthdateBySleeper[sleeperId] = entry.birthdate;
  }
  // Position per-sleeperId: playerids.json's `ids` map (gsis_id-keyed) carries
  // {sleeperId, name, position} — reversed in-memory to sleeperId->position
  // (mirrors the D4 snaps ingest's own pfrId reversal convention).
  for (const entry of Object.values(playerIds?.ids ?? {})) {
    if (entry?.sleeperId && entry?.position) crosswalk[entry.sleeperId] = entry.position;
  }

  // D6a finding 3 — snap-count fallback file per loaded year (2013-2025 via
  // D4); undefined loader (a test harness) or a missing year both resolve to
  // null, which resolveSnapCounts/buildCohortPools treat as "no fallback".
  const snapsByYear = {};
  if (typeof load.loadSnapShare === 'function') {
    for (const y of years) snapsByYear[y] = load.loadSnapShare(y) ?? null;
  }

  const { rows, coverage } = assemblePanelRows(inputsByYear, {
    fromYear, toYear, attribution, minOutcomeGames, minPredictorGames: PANEL_DEFAULTS.minPredictorGames,
    crosswalk, snapsByYear,
  });

  let finalRows = rows;
  let finalCoverage = coverage;

  if (withFactorMultipliers) {
    // Per-loaded-year totals/outcomes/position-source maps (widens the E-0a
    // Y/Y−1-pair team-totals build to every loaded year, ≤14 seasons — §3.4).
    const totalsByYear = {};
    const ppgByYear = {};
    const advstatsByYear = {};
    const rosterByYear = {};
    for (const y of years) {
      totalsByYear[y] = inputsByYear[y].seasonTotals;
      ppgByYear[y] = inputsByYear[y].outcomes;
      advstatsByYear[y] = inputsByYear[y].advstats;
      rosterByYear[y] = inputsByYear[y].roster;
    }
    const teamOf = teamKeyResolver(attribution, totalsByYear, toYear);
    const teamTotalsByYear = {};
    for (const y of years) teamTotalsByYear[y] = buildTeamTotalsForSeason(totalsByYear[y], y, teamOf);

    // D6a — D5 historical depth charts (Step 8), only needed under the fit
    // path (D4/D5's own capture-only families are otherwise unread here).
    const depthByYear = {};
    if (typeof load.loadDepth === 'function') {
      for (const y of years) depthByYear[y] = load.loadDepth(y) ?? null;
    }
    const birthdateOf = (pid) => birthdateBySleeper[pid] ?? null;

    const { rows: fitRows, fitCoverage } = attachFactorMultipliers(rows, {
      totalsByYear, teamTotalsByYear, ppgByYear, advstatsByYear, rosterByYear, fromYear, toYear,
      crosswalk, snapsByYear, birthdateOf, depthByYear,
    });
    finalRows = fitRows;
    finalCoverage = { ...coverage, fitCoverage };
  }

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

  return { rows: finalRows, coverage: finalCoverage, meta };
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

// ─── R3-FIT — fitted per-position exponents (.claude/tasks/r3fit-exponent-harness.md) ──
//
// Mirrors the runFlipGate block above: assemblePanel (withFactorMultipliers)
// → gradeExponentFit per position + WR+TE pool → the §3.0-A sensitivity
// override → buildFitVerdictReport → buildFitVerdictMarkdown → writeFitArtifacts.

const BASELINE_OF_RECORD = 'grading/2026-08-08-e0a-verdict.md';

// §3.0-A sensitivity re-run — a FULL independent re-run (own selectFitFactors,
// own folds) over the debut-Y−1-excluded row set. runFit owns the override
// (base vs sensitivity label) because the sensitivity label is itself the
// output of a grading pass, so it cannot be an input to the very function
// that pass calls (decideFitVerdict) — §0.3 item 49.
function runPositionWithSensitivity(rows, folds, sensitivityRows, sensitivityFolds, position, opts) {
  const baseReport = gradeExponentFit(rows, folds, position, opts);
  const sensitivityReport = gradeExponentFit(sensitivityRows, sensitivityFolds, position, opts);
  const baseVerdict = baseReport.verdict;
  const sensitivityVerdict = sensitivityReport.verdict;
  const verdict = baseVerdict === sensitivityVerdict ? baseVerdict : 'UNSTABLE';
  return {
    ...baseReport,
    baseVerdict, sensitivityVerdict, verdict,
    sensitivityFitFactors: sensitivityReport.fitFactorsEstimated,
  };
}

export function runFit({
  fromYear = PANEL_DEFAULTS.fromYear,
  toYear = PANEL_DEFAULTS.toYear,
  basis = 'half_ppr',
  scoringFrom = DEFAULT_SCORING_SNAPSHOT,
  minOutcomeGames = PANEL_DEFAULTS.minOutcomeGames,
  alpha = FIT_ALPHA_DEFAULT,
  alphaSweep = FIT_ALPHA_SWEEP,
  load = DEFAULT_LOAD,
} = {}) {
  // per-season-team is hardcoded — the app's live DEFAULT_ATTRIBUTION, not
  // user-overridable (§6.3); the CLI-level guard against --fit --attribution
  // lives in bin/panel.mjs (§6.4).
  const panel = assemblePanel({
    fromYear, toYear, attribution: 'per-season-team', basis, scoringFrom, minOutcomeGames, load,
    withFactorMultipliers: true, historyFloor: HISTORY_FLOOR,
  });

  const folds = panelFolds(panel);
  const sensitivityRows = panel.rows.filter(r => !r.debutYMinus1);
  const sensitivityFolds = forwardChainFolds(sensitivityRows.map(r => r.predictorYear), PANEL_DEFAULTS.minTrainSeasons);
  const opts = { alpha, alphaSweep };

  const perPosition = {};
  for (const position of PANEL_POSITIONS) {
    perPosition[position] = runPositionWithSensitivity(panel.rows, folds, sensitivityRows, sensitivityFolds, position, opts);
  }

  // WR+TE pool fallback (assessment §B.4) — cohorts stay position-separate
  // (each row's multipliers were already computed under its TRUE position's
  // cohort pools upstream, in attachFactorMultipliers); only the FIT is
  // pooled, by relabelling rows onto the synthetic 'WRTE' position so the
  // same gradeExponentFit machinery applies unforked.
  const wrteRows = panel.rows.filter(r => r.position === 'WR' || r.position === 'TE').map(r => ({ ...r, position: 'WRTE' }));
  const wrteSensitivityRows = sensitivityRows.filter(r => r.position === 'WR' || r.position === 'TE').map(r => ({ ...r, position: 'WRTE' }));
  const wrte = runPositionWithSensitivity(wrteRows, folds, wrteSensitivityRows, sensitivityFolds, 'WRTE', opts);
  const teShippableAlternative = perPosition.TE.verdict !== 'CLEARS' && wrte.verdict === 'CLEARS';
  const pool = { WRTE: { ...wrte, teShippableAlternative } };

  const fitReport = buildFitVerdictReport({ panel, perPosition, pool, folds, alpha, alphaSweep, basis });
  return { panel, fitReport };
}

// §6.2 — assembles the final FitReport shape from the raw per-position/pool
// grades (mirrors E-0a's buildFitReport, renamed per the §0.3 item 30
// collision check). `coverage` mirrors panel.coverage so buildFitVerdictMarkdown
// stays self-contained on the single `fitReport` argument the task specifies.
export function buildFitVerdictReport({ panel, perPosition, pool, folds, alpha, alphaSweep, basis }) {
  const fc = panel.coverage.fitCoverage;

  let nonFiniteScale = 0;
  for (const report of [...Object.values(perPosition), pool.WRTE]) {
    for (const entry of Object.values(report.foldNeutralization ?? {})) {
      nonFiniteScale += entry.reasons?.nonFiniteScale ?? 0;
    }
  }

  return {
    meta: {
      generatedAt: panel.meta.generatedAt,
      panelYears: panel.meta.panelYears,
      historyFloor: HISTORY_FLOOR,
      attribution: 'per-season-team',
      basis,
      alpha,
      alphaSweep,
      evalYears: folds.map(f => f.evalYear),
      combinedClamp: FIT_COMBINED_CLAMP,
      envelopeFactors: ENVELOPE_FACTORS,
      baselineOfRecord: BASELINE_OF_RECORD,
    },
    coverage: panel.coverage,
    perPosition,
    pool,
    fidelity: {
      snapshotParity: 'Verified by test/panel-fit.test.mjs T-F10 (half-PPR basis, through the exported buildCohortPools, ' +
        '5 of 7 factors against a committed 2025 snapshot fixture) — run `npm test`; a PASS precondition of this fit, not recomputed inline by --fit.',
      uncoveredFactors: ['shareTrend', 'teamRzShare'],
      inputChainResiduals: {
        nullSeasonTeam: fc.nullSeasonTeam,
        positionSource: 'Measured via T-F10 pool-composition tolerance (§3.0-C2) — not a standalone counter; budgeted in T-F10\'s tolerance.',
        liveApiBasisResidual: 'Named, not measurable server-side (§3.0-C3): a client-cached live-API-fallback season would carry league scoring invisibly to this harness.',
        zeroGpWithStats: fc.zeroGpWithStats,
        nonFiniteFantasyPoints: fc.nonFiniteFantasyPoints,
        nonFiniteScale,
        nonPositiveOutcome: fc.nonPositiveOutcome,
        nonPositiveAnchor: fc.nonPositiveAnchor,
      },
    },
    sensitivity: {
      debutYMinus1: fc.debutYMinus1,
      sensitivityFitFactors: {
        ...Object.fromEntries(PANEL_POSITIONS.map(p => [p, perPosition[p].sensitivityFitFactors])),
        WRTE: pool.WRTE.sensitivityFitFactors,
      },
    },
  };
}

// ─── Verdict markdown (§7 artifact 3) ───────────────────────────────────────────

function fitFmt(v, digits = 3) {
  return v == null || !Number.isFinite(v) ? 'n/a' : v.toFixed(digits);
}

const GUARD_PURPOSE_LINE =
  'The first real run reveals whether the identifiability guard is load-bearing or inert — if inert across all ' +
  'positions (nothing pinned, no fold neutralization), it becomes a candidate for removal in a later slice.';

const FIDELITY_GAP_SENTENCE =
  '`shareTrend` and `teamRzShare` are not parity-checked against app-computed ground truth; no committed snapshot ' +
  'exists in the per-season-team + entity-filtered regime (store ends 2026-07-05; R2 flip 07-11; app denominator ' +
  'fix 07-18). They rest on T-F5/T-F17/T-F11/T-F9/T-F14. Closure: extend T-F10 once a post-2026-07-18 snapshot is imported.';

// Overrides §4/§5 — the honest limitations this reconstruction carries,
// stated rather than implied "faithful" or "universal cancellation".
const CLAMP_CONSERVATIVE_APPROXIMATION_NOTE =
  'The app\'s `[0.67, 1.50]` combined-factor envelope is applied in BOTH arms (§1) — this is a CONSERVATIVE ' +
  'APPROXIMATION of the app\'s clamp, not a faithful reconstruction: the reconstructed inner product wraps a reduced ' +
  '5-factor sub-product (ENVELOPE_FACTORS) where production wraps 10 (the other 5 — qbQuality, breakout, bounceBack, ' +
  'tdReliance, efficiency — are HELD-OMITTED). The reduced hand-arm inner product tops out well inside [0.67,1.50] ' +
  '(~1.35 at the extreme), so `clampHits.hand` is 0 **by construction** — not evidence that production\'s clamp is ' +
  'inert on real players. It catches the fitted arm\'s own inflation (exponents > 1 can push the reduced product past ' +
  'where the hand product ever reaches) conservatively; it does not reproduce full production clamp incidence.';

const CANCELLATION_OUTSIDE_CLAMP_NOTE =
  'Cancellation caveat: a held, pinned, held-in-arm, or fold-neutralized factor\'s term is identical in both arms and ' +
  'cancels in ΔMAE — but ONLY on rows where neither arm\'s inner product hits the clamp. On a row where one arm\'s ' +
  'inner product truncates at 1.50 and the other\'s does not, the clamp is a non-linear transform applied after ' +
  'summing, so the shared factor no longer cancels post-clamp. That is correct — it measures the real clamped ' +
  'difference between the two predictions — not a defect in the pin/hold arithmetic.';

function fitCoverageSection(coverage) {
  const fc = coverage.fitCoverage;
  const lines = [];
  lines.push(`- Drop reasons: ${Object.entries(fc.droppedByReason).map(([r, n]) => `${r}=${n}`).join(', ') || 'none'}`);
  lines.push(`- Truncated at ${HISTORY_FLOOR} floor: ${fc.truncatedAt2012}`);
  lines.push(`- Forward-mover neutralized: ${fc.forwardMoverNeutralized}`);
  lines.push(`- teamRzShare lastQSeason team===null (§3.0-C1): ${fc.nullSeasonTeam}`);
  lines.push(`- Debut-in-Y−1 (sensitivity cohort): ${fc.debutYMinus1}`);
  lines.push(`- zeroGpWithStats (expect 0): ${fc.zeroGpWithStats}`);
  lines.push(`- nonFiniteFantasyPoints (expect 0): ${fc.nonFiniteFantasyPoints}`);
  lines.push(`- nonPositiveOutcome (expect ~0): ${fc.nonPositiveOutcome}`);
  lines.push(`- nonPositiveAnchor (expect ~0): ${fc.nonPositiveAnchor}`);
  lines.push('');
  lines.push('**Per-position, per-factor flatOneRate (decision, from selectFitFactors) beside sentinelRate (diagnostic, from fitCoverage):**');
  lines.push('');
  for (const position of PANEL_POSITIONS) {
    const sentinel = fc.sentinelCounts[position] ?? {};
    const flat = fc.flatOneCounts[position] ?? {};
    const factors = [...new Set([...Object.keys(sentinel), ...Object.keys(flat)])];
    lines.push(`- ${position}: ${factors.map(f => `${f} flatOneCount=${flat[f] ?? 0} sentinelCount=${sentinel[f] ?? 0}`).join(', ') || 'n/a'}`);
  }
  lines.push('');
  lines.push('**Share-series coverage:**');
  lines.push('');
  const lengthStats = Object.entries(fc.seriesLengths).map(([p, arr]) =>
    `${p}: n=${arr.length}, min=${arr.length ? Math.min(...arr) : 'n/a'}, max=${arr.length ? Math.max(...arr) : 'n/a'}`);
  lines.push(`- Series length distribution: ${lengthStats.join('; ') || 'n/a'}`);
  lines.push(`- Series drops: ${Object.entries(fc.seriesDrops).map(([r, n]) => `${r}=${n}`).join(', ')}`);
  lines.push(`- recFallbackUsed: ${fc.recFallbackUsed} · subMinDenomKept: ${fc.subMinDenomKept} · shareGtOne: ${fc.shareGtOne}`);
  return lines.join('\n');
}

function guardInstrumentationBlock(report) {
  const lines = [];
  lines.push(`  - Pinned by rule 0b: ${report.pinnedFactors.length > 0 ? report.pinnedFactors.map(f => `${f} (rate=${fitFmt(report.flatOneRates[f])})`).join(', ') : 'none'}`);
  lines.push(`  - Held-in-arm: ${report.heldInArmFactors.length > 0 ? report.heldInArmFactors.join(', ') : 'none'}`);
  lines.push(`  - Every fit candidate's flatOneRate: ${Object.entries(report.flatOneRates).map(([f, r]) => `${f}=${fitFmt(r)}`).join(', ') || 'n/a'}`);
  const neutEntries = Object.entries(report.foldNeutralization ?? {});
  lines.push(`  - Fold-level graceful neutralization: ${neutEntries.length > 0
    ? neutEntries.map(([f, d]) => `${f}: ${d.folds} fold(s) (flatOnTrain=${d.reasons.flatOnTrain}, nonFiniteScale=${d.reasons.nonFiniteScale})`).join('; ')
    : 'none'}`);
  lines.push(`  - shippedRefitNeutralized: ${report.shippedRefitNeutralized?.length ? JSON.stringify(report.shippedRefitNeutralized) : '[] (expected)'}`);
  lines.push(`  - maxAbsWMinus1ByFold: ${(report.maxAbsWMinus1ByFold ?? []).map(v => fitFmt(v, 4)).join(', ') || 'n/a'}`);
  lines.push(`  - clampHits: fitted=${report.clampHits?.fitted ?? 'n/a'}, hand=${report.clampHits?.hand ?? 'n/a'} (hand ≈ 0 expected — see the conservative-approximation note in Methodology)`);
  return lines.join('\n');
}

function wFinalLines(report) {
  if (!report.wFinal) return '  - (no fit run — INSUFFICIENT-POWER)';
  return report.fitFactorsFull.map(factor => {
    const w = report.wFinal[factor];
    const provenance = report.fitFactorsEstimated.includes(factor) ? 'estimated'
      : report.pinnedFactors.includes(factor) ? 'pinned (rule 0b)'
        : report.heldInArmFactors.includes(factor) ? 'held-in-arm (config)' : 'n/a';
    return `  - ${factor}: ${fitFmt(w, 4)} (${provenance})`;
  }).join('\n');
}

function positionSection(position, report) {
  const lines = [`### ${position}`, ''];
  lines.push(`**Base verdict:** ${report.baseVerdict} · **Sensitivity verdict:** ${report.sensitivityVerdict} · **Final verdict: ${report.verdict}**`, '');
  lines.push(`- n fit rows: ${report.nFitRows} · n eval rows (gate numerator): ${report.nEvalRows} · params (|F_p^fit|): ${report.params} · n:p: ${fitFmt(report.nToParam, 1)}`, '');

  if (report.verdict === 'INSUFFICIENT-POWER') {
    lines.push(`n:p < ${FIT_MIN_N_TO_PARAM} — deferred, no fit run (rule 0). Hand-tuned exponents (w=1) stay in production for ${position}.`, '');
    return lines.join('\n');
  }

  lines.push(`- Pooled MAE: fitted=${fitFmt(report.fitted.pooled.mae)}, hand=${fitFmt(report.hand.pooled.mae)}, ΔMAE=${fitFmt(report.deltas.maePooled)}`);
  lines.push(`- ΔMAE per eval year: ${report.deltas.maePerYear.map(y => `${y.evalYear}: ${fitFmt(y.dMae)}`).join('; ')}`);
  lines.push(`- ΔSpearman (pooled, n-weighted): ${fitFmt(report.deltas.spearmanMean)}`);
  const flagged = Math.abs(report.meanLogResidual ?? 0) > 0.03;
  lines.push(`- meanLogResidual (shipped all-rows refit): ${fitFmt(report.meanLogResidual, 4)}${flagged ? ' **[FLAGGED — |mean(y)| > 0.03]**' : ''}`);
  lines.push(`- α-sweep: ${report.sweep.map(s => `α=${s.alpha}: ΔMAE=${fitFmt(s.dMae)}, ΔSpearman=${fitFmt(s.dSpearman)}`).join('; ')}`);
  lines.push('', '**Guard instrumentation:**', guardInstrumentationBlock(report), '');
  lines.push(`**wFinal (full F_p^full length — ${report.fitFactorsFull.length} entries — provenance-labelled):**`, wFinalLines(report), '');
  if (report.verdict === 'CLEARS') {
    lines.push(`**Shippable vector (α=0.5):** \`${JSON.stringify(report.wFinal)}\``, '');
  }
  const sensitivityDiffers = JSON.stringify([...report.sensitivityFitFactors].sort()) !== JSON.stringify([...report.fitFactorsEstimated].sort());
  lines.push(`- Sensitivity re-run F_p^fit: ${report.sensitivityFitFactors.join(', ') || '(none estimated)'}${sensitivityDiffers ? ' — **differs from the base run\'s support**' : ''}`, '');
  return lines.join('\n');
}

export function buildFitVerdictMarkdown(fitReport) {
  const { meta, perPosition, pool, fidelity, coverage } = fitReport;
  const date = meta.generatedAt.slice(0, 10);

  const lines = [
    `# R3-FIT Verdict — ${date}`,
    '',
    `**Config:** predictor years ${meta.panelYears.fromYear}–${meta.panelYears.toYear}, history floor ${meta.historyFloor}, ` +
      `attribution=\`${meta.attribution}\`, basis=\`${meta.basis}\` (the app's own basis for store-served careerStats — no scoring ` +
      `snapshot read), α=${meta.alpha} (sweep: ${meta.alphaSweep.join(', ')})`,
    '',
    `**Baseline of record:** ${meta.baselineOfRecord}`,
    '',
    '**Reproduce:** `node bin/panel.mjs --fit --write`',
    '',
    '## Panel coverage',
    '',
    fitCoverageSection(coverage),
    '',
    '## Guard instrumentation — is the identifiability guard load-bearing or inert?',
    '',
    GUARD_PURPOSE_LINE,
    '',
    '(Per-position detail is reported inside each position\'s section below.)',
    '',
    '## Fidelity',
    '',
    `- Snapshot parity: ${fidelity.snapshotParity}`,
    `- Uncovered factors: ${fidelity.uncoveredFactors.join(', ')}`,
    `- §3.0-C residual — nullSeasonTeam: ${fidelity.inputChainResiduals.nullSeasonTeam}`,
    `- Position-source divergence: ${fidelity.inputChainResiduals.positionSource}`,
    `- Live-API basis residual: ${fidelity.inputChainResiduals.liveApiBasisResidual}`,
    `- zeroGpWithStats (certified inert, expect 0): ${fidelity.inputChainResiduals.zeroGpWithStats}`,
    `- nonFiniteFantasyPoints (certified inert, expect 0): ${fidelity.inputChainResiduals.nonFiniteFantasyPoints}`,
    `- nonFiniteScale (expect 0 — non-zero is a fidelity failure, not a benign neutralization): ${fidelity.inputChainResiduals.nonFiniteScale}`,
    `- nonPositiveOutcome / nonPositiveAnchor (expect ~0): ${fidelity.inputChainResiduals.nonPositiveOutcome} / ${fidelity.inputChainResiduals.nonPositiveAnchor}`,
    '',
    FIDELITY_GAP_SENTENCE,
    '',
    '## Per position',
    '',
  ];

  for (const position of PANEL_POSITIONS) {
    lines.push(positionSection(position, perPosition[position]));
  }

  lines.push(
    '## WR+TE pool result',
    '',
    positionSection('WR+TE (pooled)', pool.WRTE),
    pool.WRTE.teShippableAlternative
      ? '**TE did not clear on its own — the pooled vector is TE\'s shippable alternative.**'
      : '(TE cleared on its own or the pool did not clear — no pooled fallback in play.)',
    '',
    '## Methodology notes',
    '',
    '- Age-blind (no server-side draft_picks→sleeper_id join) + reduced-pipeline (HELD-OMITTED factors — age, depth, ' +
      'team, qbQuality, efficiency, comp, bounceBack, tdReliance, breakout — are out of BOTH arms) + provisional pending ' +
      'R4 forward grading (assessment E-3c). A reduced-pipeline CLEARS is the pre-registered pre-2027 activation ' +
      'criterion (roadmap D-1).',
    '- Held factor list, three ways: HELD-OMITTED (out of both arms — the reduced-pipeline limitation); structural QB ' +
      'sentinels (shareTrend/snapShare/teamRzShare — the app itself neutralizes these for QB); HELD-IN-ARM (QB rzUsage ' +
      '— a real non-neutral app multiplier, reconstructed and carried in both QB arms at w=1, never a fit candidate).',
    '- Omitted-variable caveat: omitting efficiencyFactor risks the usage exponents partially proxying for ' +
      'per-opportunity efficiency; expected modest given the app treats usage/efficiency as orthogonal and ' +
      'teamRzShare\'s partial-β was validated controlling for usage. Efficiency is the named stage-2 priority.',
    '- Support-identity, not vector-identity (§8 item 1): fixing F_p^fit guarantees the shipped refit and every ' +
      'scored fold share an identical factor SUPPORT — not an identical VECTOR. wFinal is an all-rows refit no fold ' +
      'scored out of sample. One bounded exception: per-fold graceful neutralization can hold a retained factor at 1 ' +
      'on a single fold — see foldNeutralization in each position\'s guard block before citing support-identity where ' +
      'it fired materially.',
    `- ${CLAMP_CONSERVATIVE_APPROXIMATION_NOTE}`,
    `- ${CANCELLATION_OUTSIDE_CLAMP_NOTE}`,
    '- Half-PPR denomination (§3.0-C3): the fit optimizes half-PPR accuracy — the app\'s own projectedPPG is ' +
      'half-PPR-denominated on store-served data, so exponents are fit in the units they are applied in. The ' +
      `${meta.baselineOfRecord} baseline of record runs a different basis (custom) and attribution (current-team), so ` +
      'its MAEs are not directly comparable to this fit\'s arms — this fit\'s comparison is internal (fitted vs hand on ' +
      'identical rows).',
    '- Non-independence: recurring players across Y→Y+1 pairs mean rows are not independent; deltas are effect-size ' +
      'estimates, not significance tests.',
    '- Survivorship: outcome gate gamesPlayed(Y+1) ≥ 6 — the standard backtest survivorship caveat applies.',
    `- INSUFFICIENT-POWER deferral (n:p < ${FIT_MIN_N_TO_PARAM}, on pooled EVAL n) + α-stability (ΔMAE sign stable ` +
      'across α∈{0.25,0.5,1}) + the identifiability guard (rule 0b: one selectFitFactors call per position over ' +
      `FIT_CANDIDATES, flat-1.0 rate ≥ ${FIT_MAX_FLAT_ONE_RATE} pins a factor at w=1 in both arms — pin, not drop) + ` +
      'graceful per-fold degenerate-scale neutralization (never aborts the run) — all self-protecting: a thin/noisy ' +
      'panel does not clear.',
    '- The collinearity caveat on shrinkage uniformity: RMS scaling equalizes each factor\'s scale (making α ' +
      'dimensionless and n-independent), but the fitted factors are correlated (the usage trio; momentum/trajectory), ' +
      'so per-coefficient shrinkage is only exactly uniform under column orthogonality — second-order, unavoidable.',
    '- Per-position n is reported beside every number — nFitRows vs nEvalRows (the gate\'s basis) are distinct and ' +
      'both reported, never conflated.',
    '- R1-SNAPS tension: the panel is panel-width-agnostic; this run\'s window is the narrow pre-R1-SNAPS 2020+ ' +
      'default. After R1-SNAPS (fromYear→2013), the identical fit re-runs unchanged (config only) on roughly triple ' +
      'the rows.',
    '- `shareLevel` is not part of this unit (its 2026-08-08 CLEARS on WR/RB is a separate finding requiring its own ' +
      'activation gate — this fit neither reads nor activates it).',
    ''
  );

  return lines.join('\n');
}

// ─── Artifact writes (§7) ────────────────────────────────────────────────────────

export function writeFitArtifacts({ panel, fitReport, verdictMd }) {
  const date = fitReport.meta.generatedAt.slice(0, 10);
  const panelPath = `backtests/${date}-r3fit-panel.json`;
  const fitPath = `backtests/${date}-r3fit-fit.json`;
  const verdictPath = `grading/${date}-r3fit-verdict.md`;

  writeJsonStable(panelPath, panel);
  writeJsonStable(fitPath, fitReport);

  const verdictAbs = repoPath(verdictPath);
  fs.mkdirSync(path.dirname(verdictAbs), { recursive: true });
  fs.writeFileSync(verdictAbs, verdictMd, 'utf8');

  return { panelPath, fitPath, verdictPath };
}

// ─── D6b — full-pipeline calibration + verdicts (.claude/tasks/fullpipeline- ──
// ─── harness.md §D/§E + the Decision section's sensitivity guard) ─────────────
//
// §B basis pin: half_ppr for every panel and verdict (finding 5). This
// function's own header comment IS the basis record the Docs section asks
// for — see fullpipeline-harness.md §B, which states the decision and its
// reason; no separate hand-authored grading/ file was created.

const FULLPIPELINE_BASELINE_OF_RECORD = 'grading/2026-08-08-e0a-verdict.md';

export function runFullPipeline({
  fromYear = PANEL_DEFAULTS.fromYear,
  toYear = PANEL_DEFAULTS.toYear,
  load = DEFAULT_LOAD,
} = {}) {
  const panel = assemblePanel({
    fromYear, toYear, attribution: 'per-season-team', basis: 'half_ppr', load,
    withFactorMultipliers: true, historyFloor: HISTORY_FLOOR,
  });

  const rowsByPosition = {};
  for (const position of PANEL_POSITIONS) {
    rowsByPosition[position] = panel.rows.filter(r => r.position === position);
  }

  // Decision (Session 1, 2026-09-06) — the guard that converts the analogue
  // framing from an argument into a measurement. MUST run, and pass, before
  // any other §D/§E output.
  const sensitivity = runSensitivityCheck(rowsByPosition);

  const meta = {
    generatedAt: new Date().toISOString(),
    panelYears: { fromYear, toYear },
    historyFloor: HISTORY_FLOOR,
    attribution: 'per-season-team (teamOffense alone reconstructed under current-team — Fix pass 1 item 1)',
    basis: 'half_ppr',
    baselineOfRecord: FULLPIPELINE_BASELINE_OF_RECORD,
    goalLine: 'Grade a historical reconstruction of the veteran pipeline, faithful in nine of thirteen steps, ' +
      'with three live-state divergences quantified (teamOffense, age, depth) and one step ungradable (qbQuality).',
    notGradableFactors: NOT_GRADABLE_FACTORS,
    sensitivityStep: SENSITIVITY_STEP,
    sensitivityHoldFactors: SENSITIVITY_HOLD_FACTORS,
  };

  // §E Step 4 — "unaffected... reconstructs from PPG history alone" (the
  // Decision, verbatim). This does not depend on teamOffense/age/depth
  // resolving faithfully to a single historical "current" state the way the
  // aggregate composition does — the comparison is shipped-vs-no-upside on
  // regressionFactor only, with every other factor held identical in both
  // arms (including the three divergent ones, which therefore contribute the
  // SAME term to both sides of the delta and are not what the sensitivity
  // check is testing). Computed UNCONDITIONALLY, before the gate.
  const step4 = {};
  for (const position of PANEL_POSITIONS) {
    step4[position] = runStep4Verdict(rowsByPosition[position], {
      injuryPredicate: (row) => (row.dnpWeeksLastQ ?? 0) >= 3,
    });
  }

  // Rookie panel — an entirely SEPARATE reconstruction (baseline/ageMult/
  // nflDraftMultiplier/ktcMult/collegeContribution), no dependency on the
  // veteran pipeline's teamOffense/age/depth at all. Computed UNCONDITIONALLY,
  // before the gate, for the same reason as Step 4 — its own position/birthdate/draft-info resolution
  // (assemblePanel's internal crosswalk is not exposed outside that
  // function; rebuilt here from the same source, nflverse/playerids.json —
  // a small, deliberate duplication rather than reaching into assemblePanel's
  // closure).
  const playerIds = typeof load.loadPlayerIds === 'function' ? load.loadPlayerIds() : null;
  const crosswalk = {};
  const birthdateBySleeper = {};
  const draftInfoBySleeper = {};
  for (const [sleeperId, entry] of Object.entries(playerIds?.bySleeper ?? {})) {
    if (entry?.birthdate) birthdateBySleeper[sleeperId] = entry.birthdate;
    draftInfoBySleeper[sleeperId] = {
      draftYear: entry?.draftYear ?? null, draftRound: entry?.draftRound ?? null, draftPick: entry?.draftPick ?? null,
    };
  }
  for (const entry of Object.values(playerIds?.ids ?? {})) {
    if (entry?.sleeperId && entry?.position) crosswalk[entry.sleeperId] = entry.position;
  }

  const rookieYears = [];
  for (let y = HISTORY_FLOOR; y <= toYear + 1; y++) rookieYears.push(y);
  const rookieOutcomeMaps = buildOutcomeMaps(rookieYears, { basis: 'half_ppr' }, load);
  const rookieTotalsByYear = {};
  const rookiePpgByYear = {};
  for (const y of rookieYears) {
    rookieTotalsByYear[y] = load.loadSeasonTotals(y) ?? {};
    rookiePpgByYear[y] = rookieOutcomeMaps[y]?.outcomes ?? new Map();
  }
  const rookieAdvstatsByYear = {};
  const rookieRosterByYear = {};
  for (let y = fromYear; y <= toYear; y++) {
    rookieAdvstatsByYear[y] = load.loadAdvstats(y);
    rookieRosterByYear[y] = load.loadRoster(y);
  }
  const rookiePositionOf = (pid, y) => resolvePosition(pid, rookieAdvstatsByYear[y], rookieRosterByYear[y], crosswalk);

  const rookiePanel = assembleRookiePanel({
    totalsByYear: rookieTotalsByYear, ppgByYear: rookiePpgByYear,
    positionOf: rookiePositionOf,
    birthdateOf: (pid) => birthdateBySleeper[pid] ?? null,
    draftInfoOf: (pid) => draftInfoBySleeper[pid] ?? null,
    fromYear, toYear,
  });

  if (!sensitivity.allPass) {
    // Decision section, verbatim: "if they diverge by more than one step,
    // stop and report... D6b narrows to the faithfully-reconstructable
    // steps." §D (calibration constants) and §E's factor-pruning ablation
    // both depend on the same composed aggregate the sensitivity check just
    // found unreliable — neither is produced. Step 4 and the rookie panel
    // are unaffected (computed above) and are still reported: neither reads
    // teamOffense/age/depth's absolute level, only regressionFactor
    // (Step 4) or an entirely separate reconstruction (rookie panel).
    return {
      panel, meta, sensitivity, step4, rookiePanel, stopped: true,
      stopReason: 'Sensitivity check FAILED: the full-stack and held-at-one (teamOffense/age/depth held at 1.0) ' +
        'optimism constants diverge by more than one sweep step (0.02) for at least one position. Per the Decision ' +
        'section, this means the three live-state factors are SHIFTING the aggregate rather than shuffling it — the ' +
        'structural argument for publishing calibration constants does not hold. §D (calibration outputs) and §E\'s ' +
        'factor-pruning ablation are NOT produced. Step 4 and the rookie panel are unaffected and are reported below ' +
        '— the slice narrows to the steps that can be reconstructed faithfully.',
    };
  }

  // §D — calibration outputs, per position, within qualifying-season tiers
  // (item 4), each tier computing items 1-3 over its OWN population.
  const calibration = {};
  for (const position of PANEL_POSITIONS) {
    const rows = rowsByPosition[position];
    const perTier = {};
    const tiers = groupByQualifyingTier(rows);
    for (const tier of QUALIFYING_TIERS) {
      const tierRows = tiers[tier];
      perTier[tier] = {
        n: tierRows.length,
        optimism: computeOptimismStats(tierRows),
        maeSweep: computeMaeSweep(tierRows),
        shrinkageSweep: computeShrinkageSweep(tierRows),
      };
    }
    calibration[position] = {
      n: rows.length,
      optimism: computeOptimismStats(rows),
      maeSweep: computeMaeSweep(rows),
      shrinkageSweep: computeShrinkageSweep(rows),
      byQualifyingTier: perTier,
    };
  }

  // §E — factor pruning (the nine gradable factors only).
  const ablation = {};
  for (const position of PANEL_POSITIONS) {
    ablation[position] = runAblation(rowsByPosition[position], position);
  }

  return { panel, meta, sensitivity, calibration, ablation, step4, rookiePanel, stopped: false };
}

// ─── D6b verdict markdown + artifacts (§E "Files") ─────────────────────────────

function fpFmt(v, digits = 3) {
  return v == null || !Number.isFinite(v) ? 'n/a' : v.toFixed(digits);
}

function coverageRateFor(fitCoverage, position, factor) {
  const byYear = fitCoverage.byYearCoverage?.[`${position}|${factor}`] ?? {};
  const years = Object.keys(byYear).map(Number).sort((a, b) => a - b);
  let total = 0, eligible = 0;
  const perYear = years.map(y => {
    const { total: t, eligible: e } = byYear[y];
    total += t; eligible += e;
    return `${y}: ${(t > 0 ? e / t : 0).toFixed(2)}`;
  });
  return { overall: total > 0 ? eligible / total : null, total, eligible, perYearString: perYear.join(', ') };
}

function sensitivitySection(sensitivity) {
  const lines = ['| Position | Full-stack median ratio | Held-at-1 (teamOffense/age/depth) median ratio | |Δ| | Pass (≤0.02) |', '|---|---|---|---|---|'];
  for (const [position, r] of Object.entries(sensitivity.perPosition)) {
    lines.push(`| ${position} | ${fpFmt(r.full.medianRatio)} (n=${r.full.n}) | ${fpFmt(r.held.medianRatio)} (n=${r.held.n}) | ${fpFmt(r.absDiff, 4)} | ${r.pass ? 'YES' : 'NO'} |`);
  }
  return lines.join('\n');
}

function calibrationSection(position, calib) {
  const lines = [`### ${position}`, ''];
  lines.push(`- Optimism constant (median outcome/fullPipelinePPG): ${fpFmt(calib.optimism.medianRatio)} (mean ${fpFmt(calib.optimism.meanRatio)}, n=${calib.optimism.n})`);
  lines.push(`- MAE sweep (c=0.80..1.00): ${calib.maeSweep.map(s => `c=${s.c.toFixed(2)}:${fpFmt(s.mae)}`).join(', ')}`);
  lines.push(`- Shrinkage sweep (k=0,0.1,0.2,0.3): ${calib.shrinkageSweep.map(s => `k=${s.k}:${fpFmt(s.mae)}`).join(', ')}`);
  lines.push('', '**By qualifying-season tier:**', '');
  for (const tier of QUALIFYING_TIERS) {
    const t = calib.byQualifyingTier[tier];
    lines.push(`- ${tier} seasons (n=${t.n}): optimism median=${fpFmt(t.optimism.medianRatio)}; best MAE sweep c=${
      t.maeSweep.reduce((best, s) => (s.mae != null && (best == null || s.mae < best.mae)) ? s : best, null)?.c ?? 'n/a'
    }`);
  }
  lines.push('');
  return lines.join('\n');
}

function ablationSection(position, ablationReport, fitCoverage) {
  const lines = [`### ${position}`, '', `Shipped: MAE=${fpFmt(ablationReport.shippedMae)}, Spearman=${fpFmt(ablationReport.shippedSpearman)} (n=${ablationReport.n})`, ''];
  lines.push('| Factor | ΔMAE (without − shipped) | ΔSpearman | Coverage rate (overall) |', '|---|---|---|---|');
  for (const [factor, r] of Object.entries(ablationReport.perFactor)) {
    const cov = coverageRateFor(fitCoverage, position, factor);
    lines.push(`| ${factor} | ${fpFmt(r.dMae)} | ${fpFmt(r.dSpearman)} | ${fpFmt(cov.overall, 3)} |`);
  }
  return lines.join('\n');
}

function step4Section(position, s4) {
  const o = s4.overall;
  const lines = [`### ${position}`, '', `Overall (n=${o.n}): shipped MAE=${fpFmt(o.shippedMae)}, no-upside MAE=${fpFmt(o.noUpsideMae)}, ΔMAE=${fpFmt(o.dMae)}, ΔSpearman=${fpFmt(o.dSpearman)}`];
  if (s4.injuryGated) {
    const g = s4.injuryGated;
    lines.push(`Injury-gated proxy (dnpWeeks≥3, n=${g.n}): shipped MAE=${fpFmt(g.shippedMae)}, no-upside MAE=${fpFmt(g.noUpsideMae)}, ΔMAE=${fpFmt(g.dMae)}, ΔSpearman=${fpFmt(g.dSpearman)}`);
  }
  return lines.join('\n');
}

function rookieSection(rookiePanel) {
  const { rows, coverage } = rookiePanel;
  const lines = [
    `- Assembled: ${coverage.assembled}, surviving (outcome gate met): ${coverage.surviving}, drops: ${JSON.stringify(coverage.drops)}`,
    `- Hit the 1.85 cap: ${coverage.hitCapCount}/${coverage.surviving} (${coverage.surviving > 0 ? ((coverage.hitCapCount / coverage.surviving) * 100).toFixed(1) : 'n/a'}%)`,
    '',
  ];
  const byTierPosition = {};
  for (const row of rows) {
    const key = `${row.nflDraftTier ?? 'unmatched'}|${row.position}`;
    (byTierPosition[key] ??= []).push(row);
  }
  lines.push('| Draft tier | Position | n | mean realised PPG | mean projected PPG | ratio (realised/projected) |', '|---|---|---|---|---|---|');
  for (const [key, tierRows] of Object.entries(byTierPosition).sort()) {
    const [tier, position] = key.split('|');
    const meanRealised = tierRows.reduce((s, r) => s + r.outcomePPG, 0) / tierRows.length;
    const meanProjected = tierRows.reduce((s, r) => s + r.projectedPPG, 0) / tierRows.length;
    lines.push(`| ${tier} | ${position} | ${tierRows.length} | ${fpFmt(meanRealised, 1)} | ${fpFmt(meanProjected, 1)} | ${fpFmt(meanRealised / meanProjected, 2)} |`);
  }
  if (rows.length > 0) {
    const topProjected = [...rows].sort((a, b) => b.projectedPPG - a.projectedPPG)[0];
    const sameYearPosition = rows.filter(r => r.predictorYear === topProjected.predictorYear && r.position === topProjected.position)
      .sort((a, b) => b.outcomePPG - a.outcomePPG);
    const finishRank = sameYearPosition.findIndex(r => r.sleeperId === topProjected.sleeperId) + 1;
    lines.push('', `Top projected rookie: pid ${topProjected.sleeperId} (${topProjected.position}, ${topProjected.predictorYear}), ` +
      `projected ${fpFmt(topProjected.projectedPPG, 1)} PPG, finished ranked ${finishRank} of ${sameYearPosition.length} at position that class-year ` +
      `(realised ${fpFmt(topProjected.outcomePPG, 1)} PPG).`);
  }
  return lines.join('\n');
}

export function buildFullPipelineVerdictMarkdown(result) {
  const { meta } = result;
  const date = meta.generatedAt.slice(0, 10);
  const lines = [
    `# Full-Pipeline Verdict — ${date}`,
    '',
    `**${meta.goalLine}**`,
    '',
    `**Config:** predictor years ${meta.panelYears.fromYear}–${meta.panelYears.toYear}, history floor ${meta.historyFloor}, ` +
      `attribution=\`${meta.attribution}\`, basis=\`${meta.basis}\``,
    '',
    `**Baseline of record:** ${meta.baselineOfRecord}`,
    '',
    '**Reproduce:** `node bin/panel.mjs --fullpipeline --write`',
    '',
    '## Sensitivity check (Decision section) — run BEFORE any other output',
    '',
    sensitivitySection(result.sensitivity),
    '',
  ];

  if (result.stopped) {
    lines.push('## STOPPED', '', result.stopReason, '');
    lines.push(
      '## §E — Step 4 verdict (unaffected by the stop — reconstructs from PPG history alone)',
      '',
    );
    for (const position of PANEL_POSITIONS) lines.push(step4Section(position, result.step4[position]));
    lines.push('', '## Rookie panel (unaffected by the stop — an entirely separate reconstruction)', '', rookieSection(result.rookiePanel), '');
    return lines.join('\n');
  }

  lines.push(
    `All positions passed the sensitivity check (≤${meta.sensitivityStep} step) — both the full-stack and ` +
      `held-at-1 (${meta.sensitivityHoldFactors.join('/')}) constants are reported below, side by side, per the Decision section.`,
    '',
    '## §D — Calibration outputs',
    '',
  );
  for (const position of PANEL_POSITIONS) lines.push(calibrationSection(position, result.calibration[position]));

  lines.push(
    '## §E — Step 4 verdict (regression up-side branches, outlierRatio<0.85 forced to neutral)',
    '',
  );
  for (const position of PANEL_POSITIONS) lines.push(step4Section(position, result.step4[position]));

  lines.push(
    '',
    '## §E — Factor pruning (ablation, nine gradable factors; report only, no action)',
    '',
    `**Excluded from this ablation (not gradable — reported separately, per the Decision section):** ${NOT_GRADABLE_FACTORS.join(', ')}. ` +
      'A factor held at 1.0 by construction (qbQuality) or with a named live-state divergence (teamOffense/age/depth) would always look ' +
      'prunable for a reason unrelated to signal — see the not-gradable section below instead.',
    '',
  );
  for (const position of PANEL_POSITIONS) lines.push(ablationSection(position, result.ablation[position], result.panel.coverage.fitCoverage));

  const fc = result.panel.coverage.fitCoverage;
  lines.push(
    '',
    '## Not-gradable factors — measured divergence, not a prune candidate',
    '',
    '- **teamOffense** — named, unclosable live-state divergence: the app\'s current-team attribution reads live Sleeper roster ' +
      'state at snapshot time; measured at 29.0% genuine offseason moves over 587 comparable rows (Fix pass 2). Reconstructed under ' +
      'current-team attribution (Fix pass 1 item 1) but still diverges from any single historical season\'s "current" state.',
    '- **age** — named, unclosable live-state divergence: the app computes ageDelta from live wall-clock age at snapshot time; ' +
      'this reconstruction uses birthdate at lastQSeason. Same formula/curve, different reference date.',
    '- **depth** — named, unclosable live-state divergence: the app reads a live depth chart at snapshot time; this reconstruction ' +
      'reads D5\'s historical chart for the row\'s own season.',
    '- **qbQuality** — EMPTY eligible window, not merely narrow (Fix pass 1 item 2): no KTC coverage in the panel window, dynastyScore ' +
      'unportable, and the app\'s own population is fantasy-roster-scoped. Structurally neutral for 100% of rows.',
    '',
    '## Coverage rate per year, every factor (§D/§E requirement)',
    '',
  );
  for (const position of PANEL_POSITIONS) {
    const factors = [...ABLATION_GRADABLE_FACTORS[position], ...NOT_GRADABLE_FACTORS.filter(f => f !== 'qbQuality' || position !== 'QB')];
    lines.push(`### ${position}`, '');
    for (const factor of factors) {
      const cov = coverageRateFor(fc, position, factor);
      if (cov.total === 0) continue;
      lines.push(`- ${factor}: overall ${fpFmt(cov.overall, 3)} — ${cov.perYearString}`);
    }
    lines.push('');
  }

  lines.push('## Rookie panel', '', rookieSection(result.rookiePanel), '');

  lines.push(
    '## Methodology notes',
    '',
    '- **Analogue framing (verbatim, per the Decision):** ' + meta.goalLine,
    '- The composed 13-factor product (predictFullPipeline, lib/panel.mjs) is a NEW function, not a rewrite of the R3-FIT ' +
      'exponent engine\'s predictWithExponents — that engine stays scoped to the original seven factors and is untouched.',
    '- Step 4 reconstructs from PPG history alone — no live state, no divergence — and proceeds unconditionally, unaffected ' +
      'by the sensitivity gate.',
    '- The injury-gated Step 4 variant uses dnpWeeks≥3 as a proxy (the app\'s own documented ">=3 weeks suggestive of injury" ' +
      'convention) — the hand-authored enrichment/injuries.json has zero entries in this checkout and cannot gate anything.',
    '- Rookie panel is a REDUCED reconstruction beyond finding 9\'s own "3 of 5, not 4" bound: only ageMult and ' +
      'nflDraftMultiplier are real; ktcMult and collegeContribution are both always neutral (KTC history starts ' +
      '2026-05-18, after the whole panel window; college-metrics port was not built this slice). Disclosed, not silently narrowed.',
    '- No app change, no served-family change, no factor pruned or activated on this run.',
    ''
  );

  return lines.join('\n');
}

// Drops the veteran panel's per-row detail (multipliers/shareSeries/
// qualifyingSeasons for every surviving row — already reproducible via
// `node bin/panel.mjs --fit` and, for this file's own composition, via
// `--fullpipeline`) before serializing. Without this the artifact runs to
// several MB, well past every other committed backtests/*.json (largest
// precedent 2.2MB) for row detail this file's own verdict markdown never
// reads. coverage/meta (the actual audit trail) are kept in full; the
// rookie panel's rows ARE kept (they are the deliverable, not a byproduct).
export function writeFullPipelineArtifacts({ result, verdictMd }) {
  const date = result.meta.generatedAt.slice(0, 10);
  const panelPath = `backtests/${date}-fullpipeline-panel.json`;
  const verdictPath = `grading/${date}-fullpipeline-verdict.md`;

  const { rows: _vetRows, ...panelWithoutRows } = result.panel;
  const slimResult = { ...result, panel: panelWithoutRows };

  writeJsonStable(panelPath, slimResult);

  const verdictAbs = repoPath(verdictPath);
  fs.mkdirSync(path.dirname(verdictAbs), { recursive: true });
  fs.writeFileSync(verdictAbs, verdictMd, 'utf8');

  return { panelPath, verdictPath };
}
