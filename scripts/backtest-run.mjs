/**
 * scripts/backtest-run.mjs — Backtest orchestration adapter.
 *
 * Mirrors scripts/grade-snapshot.mjs: pure lib layer (lib/backtest.mjs) knows no I/O;
 * this adapter wires file loading (injectable for tests) and orchestration logic.
 *
 * Public exports:
 *   METRICS, POSITIONS, D3_VALIDATE_CONTROLS
 *   normalizeMetric(arg)                                        → string
 *   normalizePosition(arg)                                      → string[]
 *   assembleCohort({ position, fromYear, toYear, minOutcomeGames, load }) → { rows, skippedYears }
 *   runMetric(rows, metric, position, opts)                     → BacktestReport
 *   runValidate({ fromYear, toYear, minOutcomeGames, load })    → ValidateResultRow[]
 */

import { readJson } from '../lib/io.mjs';
import {
  standardizedRegression,
  quintileResponse,
  computeTeamTotals,
  buildCohortRows,
  D3_TARGETS,
  D3_TOLERANCE,
  D3_VALIDATE_CONTROLS,
} from '../lib/backtest.mjs';

export { D3_VALIDATE_CONTROLS };

// ─── Constants ────────────────────────────────────────────────────────────────

export const METRICS   = ['targetShare', 'airYardsShare', 'wopr', 'racr'];
export const POSITIONS = ['WR', 'TE', 'RB'];

const METRIC_CONTROLS = ['overallShare', 'snapShare', 'rzOwnRate'];

const TRADED_CAVEAT =
  "Traded players' `overallShare`/team-totals use full-season season-totals targets attributed " +
  "to their single advstats `team`, slightly overstating shares for that ~2% of rows (affects a control, not the outcome).";

// ─── Metric normalisation ─────────────────────────────────────────────────────

const METRIC_ALIASES = {
  target_share:     'targetShare',
  air_yards_share:  'airYardsShare',
  wopr:             'wopr',
  racr:             'racr',
  targetShare:      'targetShare',
  airYardsShare:    'airYardsShare',
};

export function normalizeMetric(arg) {
  const m = METRIC_ALIASES[arg];
  if (!m) throw new Error(
    `[backtest] unknown --metric '${arg}' — use target_share|air_yards_share|wopr|racr|all`
  );
  return m;
}

export function normalizePosition(arg) {
  if (arg === 'all') return POSITIONS.slice();
  if (['WR', 'TE', 'RB'].includes(arg)) return [arg];
  throw new Error(`[backtest] unknown --position '${arg}' — use WR|TE|RB|all`);
}

// ─── Default (disk-backed) loader ────────────────────────────────────────────

const DEFAULT_LOAD = {
  loadAdvstats:     (year) => readJson(`nflverse/advstats/${year}.json`),
  loadSeasonTotals: (year) => readJson(`nfl/season-totals/${year}.json`),
};

// ─── Cohort assembly ──────────────────────────────────────────────────────────

export function assembleCohort({ position, fromYear, toYear, minOutcomeGames, load }) {
  const { loadAdvstats, loadSeasonTotals } = load ?? DEFAULT_LOAD;
  const rows = [];
  const skippedYears = [];

  for (let Y = fromYear; Y <= toYear - 1; Y++) {
    const advY  = loadAdvstats(Y);
    const totY  = loadSeasonTotals(Y);
    const totY1 = loadSeasonTotals(Y + 1);

    if (!advY) {
      console.warn(`[backtest] advstats/${Y}.json not on disk — skipping year ${Y}`);
      skippedYears.push(Y);
      continue;
    }
    if (!totY || !totY1) {
      console.warn(`[backtest] season-totals missing for ${Y} or ${Y + 1} — skipping year ${Y}`);
      skippedYears.push(Y);
      continue;
    }

    const teamTotals = computeTeamTotals(advY.players, totY);
    const cohortRows = buildCohortRows(advY, totY, totY1, {
      position,
      minOutcomeGames,
      teamTotals,
    });
    rows.push(...cohortRows);
  }

  return { rows, skippedYears };
}

// ─── Metric run ───────────────────────────────────────────────────────────────

function listwiseSurviving(rows, metric) {
  const fields = [metric, ...METRIC_CONTROLS, 'outcomePPG'];
  return rows.filter(r => fields.every(f => r[f] != null && Number.isFinite(r[f])));
}

export function runMetric(rows, metric, position, { minOutcomeGames, fromYear, toYear }) {
  const surviving = listwiseSurviving(rows, metric);
  const predictorYears = [...new Set(surviving.map(r => r.predictorYear))].sort((a, b) => a - b);
  const outcomeYears   = predictorYears.map(y => y + 1);

  const regression = standardizedRegression(rows, {
    predictor: metric,
    controls:  METRIC_CONTROLS,
    outcome:   'outcomePPG',
  });

  const { bins, monotonic } = quintileResponse(surviving, metric, 'outcomePPG');

  const caveats = [
    'Recurring players across Y→Y+1 pairs → rows non-independent; SEs optimistic (decision 7).',
    TRADED_CAVEAT,
  ];
  if (position === 'RB') {
    caveats.push('RB rushing team-totals undercount QB sneaks (no QB team available) — affects overallShare/teamRzShare denominators for RB only.');
  }
  if (regression.n > 0 && regression.n < 30) {
    caveats.push('n below 30 — interpret with caution.');
  }

  return {
    meta: {
      metric,
      position,
      predictorYears,
      outcomeYears,
      minOutcomeGames,
      controls:    METRIC_CONTROLS,
      generatedAt: new Date().toISOString(),
    },
    n:               regression.n,
    rawPearson:      regression.rawPearson,
    standardizedBeta: regression.beta,
    controlBetas:    regression.controlBetas,
    rSquared:        regression.rSquared,
    collinearity:    regression.collinearity,
    quintiles:       bins,
    monotonic,
    caveats,
  };
}

// ─── Validate run ─────────────────────────────────────────────────────────────

export function runValidate({ fromYear, toYear, minOutcomeGames, load }) {
  // WR and TE pooled as WRTE; RB separate (diagnostic only)
  const positionGroups = [
    { label: 'WR+TE', positions: ['WR', 'TE'], targetKey: 'WRTE', diagnostic: false },
    { label: 'RB',    positions: ['RB'],        targetKey: 'RB',   diagnostic: true  },
  ];

  const resultRows = [];

  for (const { label, positions, targetKey, diagnostic } of positionGroups) {
    const rows = positions.flatMap(pos => {
      const { rows: r } = assembleCohort({ position: pos, fromYear, toYear, minOutcomeGames, load });
      return r;
    });

    // Listwise survive on validate fields (D3_VALIDATE_CONTROLS + teamRzShare + outcomePPG)
    const validateFields = ['teamRzShare', ...D3_VALIDATE_CONTROLS, 'outcomePPG'];
    const surviving = rows.filter(r => validateFields.every(f => r[f] != null && Number.isFinite(r[f])));
    const predictorYears = [...new Set(surviving.map(r => r.predictorYear))].sort((a, b) => a - b);

    const regression = standardizedRegression(rows, {
      predictor: 'teamRzShare',
      controls:  D3_VALIDATE_CONTROLS,
      outcome:   'outcomePPG',
    });

    const { monotonic } = quintileResponse(surviving, 'teamRzShare', 'outcomePPG');

    const beta        = regression.beta;
    const ownRateBeta = regression.controlBetas?.rzOwnRate ?? null;
    const rawPearson  = regression.rawPearson;

    // Informational D3 anchor (not used for PASS)
    const target = D3_TARGETS[targetKey];
    const tol    = D3_TOLERANCE[targetKey];

    // Qualitative PASS criteria (§1 symptom 3 fix)
    const betaPass = beta != null && beta > 0;
    const signPass = ownRateBeta != null && ownRateBeta < 0;
    const rawPass  = rawPearson != null && rawPearson > 0;
    const monoPass = monotonic;
    const pass = betaPass && signPass && rawPass && monoPass;

    const statusLabel = diagnostic
      ? (pass ? 'DIAGNOSTIC-PASS' : 'DIAGNOSTIC-FAIL')
      : (pass ? 'PASS' : 'FAIL');

    resultRows.push({
      label, targetKey, diagnostic,
      target, tol,           // informational D3 anchor
      beta, ownRateBeta, rawPearson, monotonic,
      betaPass, signPass, rawPass, monoPass,
      pass, statusLabel,
      predictorYears,
      n: regression.n,
    });
  }

  return resultRows;
}
