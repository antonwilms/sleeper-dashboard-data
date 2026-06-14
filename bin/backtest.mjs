#!/usr/bin/env node
/**
 * bin/backtest.mjs — Advstats signal backtest CLI.
 *
 * Offline, read-only retrospective analysis. Joins nflverse advstats predictors
 * to nfl/season-totals outcome/controls on sleeper_id, fits per-position
 * standardized OLS for Y→Y+1 lag cohorts, and reports standardized partial β.
 *
 * NOT the snapshot grader (bin/grade.mjs). No served file, no manifest entry,
 * no schemaVersion, no production path.
 *
 * Prerequisite: run the advstats backfill before --validate:
 *   for y in $(seq 2012 2025); do node bin/update.mjs advstats --year "$y" --force; done
 *
 * Usage: node bin/backtest.mjs [options]
 *   --metric  target_share|air_yards_share|wopr|racr|all (default: all)
 *   --position WR|TE|RB|all (default: all)
 *   --from YYYY  predictor-season floor (default: 2012)
 *   --to YYYY    outcome-season ceiling (default: 2025)
 *   --min-games N  min outcome-season gamesPlayed (default: 6)
 *   --validate   D3 team-RZ-share self-validation (PASS/FAIL per position)
 *   --json       machine-readable output
 *   --write      persist backtests/<date>-<metric>-<pos>.json
 *   --by-season  per-season breakout in addition to pooled
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { readJson, writeJsonStable } from '../lib/io.mjs';
import {
  standardizedRegression,
  quintileResponse,
  computeTeamTotals,
  buildCohortRows,
  D3_TARGETS,
  D3_TOLERANCE,
} from '../lib/backtest.mjs';

// ─── Arg parsing (mirrors bin/grade.mjs) ─────────────────────────────────────

const args = process.argv.slice(2);
function flag(name) { return args.includes(name); }
function option(name) {
  const i = args.indexOf(name);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CONTROLS = ['overallShare', 'snapShare', 'rzOwnRate'];
const METRICS   = ['targetShare', 'airYardsShare', 'wopr', 'racr'];
const POSITIONS = ['WR', 'TE', 'RB'];

const TRADED_CAVEAT =
  "Traded players' `overallShare`/team-totals use full-season season-totals targets attributed " +
  "to their single advstats `team`, slightly overstating shares for that ~2% of rows (affects a control, not the outcome).";

// ─── I/O helpers ─────────────────────────────────────────────────────────────

function loadAdvstats(year) {
  return readJson(`nflverse/advstats/${year}.json`);
}

function loadSeasonTotals(year) {
  return readJson(`nfl/season-totals/${year}.json`);
}

// ─── Cohort assembly ──────────────────────────────────────────────────────────

function assembleCohort({ position, fromYear, toYear, minOutcomeGames }) {
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

// ─── Report assembly ──────────────────────────────────────────────────────────

// Rows that survive listwise deletion for a given metric + controls + outcome.
function listwiseSurviving(rows, metric) {
  const fields = [metric, ...CONTROLS, 'outcomePPG'];
  return rows.filter(r => fields.every(f => r[f] != null && Number.isFinite(r[f])));
}

function runMetric(rows, metric, position, { minOutcomeGames, fromYear, toYear }) {
  const surviving = listwiseSurviving(rows, metric);
  const predictorYears = [...new Set(surviving.map(r => r.predictorYear))].sort((a, b) => a - b);
  const outcomeYears   = predictorYears.map(y => y + 1);

  const regression = standardizedRegression(rows, {
    predictor: metric,
    controls:  CONTROLS,
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
      controls:     CONTROLS,
      generatedAt:  new Date().toISOString(),
    },
    n:                regression.n,
    rawPearson:        regression.rawPearson,
    standardizedBeta:  regression.beta,
    controlBetas:      regression.controlBetas,
    rSquared:          regression.rSquared,
    collinearity:      regression.collinearity,
    quintiles:         bins,
    monotonic,
    caveats,
  };
}

// ─── Human-readable formatter ─────────────────────────────────────────────────

function fmt(v, digits = 4) {
  if (v === null || v === undefined) return 'null';
  return Number.isFinite(v) ? v.toFixed(digits) : String(v);
}

function formatHumanReport(report) {
  const { meta, n, rawPearson, standardizedBeta, controlBetas, rSquared, collinearity, quintiles, monotonic, caveats } = report;
  const lines = [
    `\n── ${meta.metric} / ${meta.position} (n=${n}) ─────────────────────────`,
    `  Predictor years : ${meta.predictorYears.join(', ')}`,
    `  Outcome years   : ${meta.outcomeYears.join(', ')}`,
    `  Raw Pearson r   : ${fmt(rawPearson)}`,
    `  Standardized β  : ${fmt(standardizedBeta)}   (candidate partial β)`,
    `  R²              : ${fmt(rSquared)}`,
    `  Control βs:`,
    ...CONTROLS.map(c => `    ${c.padEnd(14)} ${fmt(controlBetas?.[c])}`),
    `  Collinearity (r vs predictor):`,
    ...CONTROLS.map(c => {
      const r = collinearity?.[c];
      const flag = r != null && Math.abs(r) > 0.8 ? ' ⚠ HIGH' : '';
      return `    ${c.padEnd(14)} ${fmt(r)}${flag}`;
    }),
    `  Quintiles (monotonic: ${monotonic}):`,
    ...(quintiles || []).map(b =>
      `    Q${b.q}: n=${b.n}  pred=${fmt(b.meanPredictor)} → outcome=${fmt(b.meanOutcome)}`
    ),
    `  Caveats:`,
    ...caveats.map(c => `    • ${c}`),
  ];
  return lines.join('\n');
}

// ─── Write report ─────────────────────────────────────────────────────────────

function writeReport(report) {
  const date = new Date().toISOString().slice(0, 10);
  const relPath = `backtests/${date}-${report.meta.metric}-${report.meta.position}.json`;
  writeJsonStable(relPath, report);
  console.log(`[backtest] Wrote ${relPath}`);
}

// ─── --validate mode ─────────────────────────────────────────────────────────

function runValidate({ fromYear, toYear, minOutcomeGames, json: asJson }) {
  console.log('[backtest] D3 team-RZ-share self-validation');
  console.log(`[backtest] Panel: ${fromYear}→${toYear}, min-games=${minOutcomeGames}`);

  // WR and TE pooled as WRTE; RB separate (diagnostic only per correction 1)
  const positionGroups = [
    { label: 'WR+TE', positions: ['WR', 'TE'], targetKey: 'WRTE', diagnostic: false },
    { label: 'RB',    positions: ['RB'],        targetKey: 'RB',   diagnostic: true  },
  ];

  let hardPass = true;
  const resultRows = [];

  for (const { label, positions, targetKey, diagnostic } of positionGroups) {
    const rows = positions.flatMap(pos => {
      const { rows: r } = assembleCohort({ position: pos, fromYear, toYear, minOutcomeGames });
      return r;
    });

    const fields = ['teamRzShare', ...CONTROLS, 'outcomePPG'];
    const surviving = rows.filter(r => fields.every(f => r[f] != null && Number.isFinite(r[f])));
    const predictorYears = [...new Set(surviving.map(r => r.predictorYear))].sort((a, b) => a - b);

    const regression = standardizedRegression(rows, {
      predictor: 'teamRzShare',
      controls:  CONTROLS,
      outcome:   'outcomePPG',
    });

    const { monotonic } = quintileResponse(surviving, 'teamRzShare', 'outcomePPG');

    const target = D3_TARGETS[targetKey];
    const tol    = D3_TOLERANCE[targetKey];
    const beta   = regression.beta;
    const ownRateBeta = regression.controlBetas?.rzOwnRate ?? null;

    const betaPass = beta != null && Math.abs(beta - target) <= tol;
    const signPass = ownRateBeta != null && ownRateBeta < 0;
    const monoPass = monotonic;
    const pass = betaPass && signPass && monoPass;

    if (!diagnostic && !pass) hardPass = false;

    const statusLabel = diagnostic
      ? (pass ? 'DIAGNOSTIC-PASS' : 'DIAGNOSTIC-FAIL')
      : (pass ? 'PASS' : 'FAIL');

    resultRows.push({
      label, targetKey, diagnostic, target, tol,
      beta, ownRateBeta, monotonic,
      betaPass, signPass, monoPass,
      pass, statusLabel,
      predictorYears,
      n: regression.n,
    });
  }

  if (asJson) {
    console.log(JSON.stringify(resultRows, null, 2));
  } else {
    for (const r of resultRows) {
      const diagNote = r.diagnostic ? ' (diagnostic only — not required for done-definition)' : '';
      console.log(`\n  ${r.label}: ${r.statusLabel}${diagNote}`);
      console.log(`    β = ${fmt(r.beta)}  target = ${fmt(r.target)} ± ${fmt(r.tol)}`);
      console.log(`    own-rate β (rzOwnRate) = ${fmt(r.ownRateBeta)}  sign_pass = ${r.signPass}`);
      console.log(`    monotonic = ${r.monotonic}`);
      console.log(`    contributing predictor years: ${r.predictorYears.join(', ') || 'none'}`);
      console.log(`    n = ${r.n}`);
      if (r.diagnostic && !r.pass) {
        console.log('    → RB miss is expected if rushing denominators exclude QB sneaks or stat coverage gaps exist.');
        console.log('    → Do NOT widen D3_TOLERANCE to force a pass — report this β as a finding.');
      }
    }
    console.log(`\n  Overall: ${hardPass ? 'PASS (WR/TE within tolerance)' : 'FAIL (WR/TE outside tolerance)'}`);
  }

  return hardPass;
}

// ─── Main ────────────────────────────────────────────────────────────────────

const isMain = process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  (() => {
    try {
      const validate  = flag('--validate');
      const asJson    = flag('--json');
      const write     = flag('--write');
      const bySeason  = flag('--by-season');

      const fromYear      = parseInt(option('--from') ?? '2012', 10);
      const toYear        = parseInt(option('--to')   ?? '2025', 10);
      const minOutcomeGames = parseInt(option('--min-games') ?? '6', 10);
      const metricArg     = option('--metric')   ?? 'all';
      const positionArg   = option('--position') ?? 'all';

      if (isNaN(fromYear) || isNaN(toYear) || isNaN(minOutcomeGames)) {
        console.error('[backtest] Error: --from, --to, --min-games must be numeric');
        process.exit(1);
      }

      if (validate) {
        const pass = runValidate({ fromYear, toYear, minOutcomeGames, json: asJson });
        process.exit(pass ? 0 : 1);
      }

      const metrics   = metricArg   === 'all' ? METRICS   : [metricArg];
      const positions = positionArg === 'all' ? POSITIONS : [positionArg];

      for (const position of positions) {
        const { rows } = assembleCohort({ position, fromYear, toYear, minOutcomeGames });

        for (const metric of metrics) {
          const report = runMetric(rows, metric, position, { minOutcomeGames, fromYear, toYear });

          if (asJson) {
            console.log(JSON.stringify(report, null, 2));
          } else {
            console.log(formatHumanReport(report));
          }

          if (write) writeReport(report);
        }

        if (bySeason) {
          for (let Y = fromYear; Y <= toYear - 1; Y++) {
            const seasonRows = rows.filter(r => r.predictorYear === Y);
            if (seasonRows.length === 0) continue;
            for (const metric of metrics) {
              const sr = runMetric(seasonRows, metric, position, { minOutcomeGames, fromYear: Y, toYear: Y + 1 });
              if (asJson) console.log(JSON.stringify(sr, null, 2));
              else        console.log(formatHumanReport(sr));
              if (write)  writeReport(sr);
            }
          }
        }
      }

      process.exit(0);
    } catch (err) {
      console.error('[backtest] ' + err.message);
      if (process.env.DEBUG) console.error(err.stack);
      process.exit(1);
    }
  })();
}
