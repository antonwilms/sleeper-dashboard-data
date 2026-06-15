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
 *   --metric  target_share|air_yards_share|wopr|racr|all  (snake_case canonical; camelCase accepted)
 *   --position WR|TE|RB|all (default: all)
 *   --from YYYY  predictor-season floor (default: 2012)
 *   --to YYYY    outcome-season ceiling (default: 2025)
 *   --min-games N  min outcome-season gamesPlayed (default: 6)
 *   --validate   D3 qualitative trust check (team-share β>0, own-rate β<0, monotonic, raw r>0)
 *   --json       machine-readable output
 *   --write      persist backtests/<date>-<metric>-<pos>.json
 *   --by-season  per-season breakout in addition to pooled
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { writeJsonStable } from '../lib/io.mjs';
import { D3_TARGETS, D3_TOLERANCE } from '../lib/backtest.mjs';
import {
  METRICS,
  POSITIONS,
  normalizeMetric,
  normalizePosition,
  assembleCohort,
  runMetric,
  runValidate,
} from '../scripts/backtest-run.mjs';

// ─── Arg parsing ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function flag(name) { return args.includes(name); }
function option(name) {
  const i = args.indexOf(name);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}

// ─── I/O helpers ─────────────────────────────────────────────────────────────

function fmt(v, digits = 4) {
  if (v === null || v === undefined) return 'null';
  return Number.isFinite(v) ? v.toFixed(digits) : String(v);
}

// ─── Human-readable formatter — metric run ────────────────────────────────────

function formatHumanReport(report) {
  const { meta, n, rawPearson, standardizedBeta, controlBetas, rSquared, collinearity, quintiles, monotonic, caveats } = report;
  const controls = meta.controls ?? [];
  const minYr = meta.predictorYears[0] ?? null;
  const maxYr = meta.predictorYears[meta.predictorYears.length - 1] ?? null;
  const panelStr = minYr && maxYr ? `${minYr}–${maxYr}` : 'none';
  const lines = [
    `\n── ${meta.metric} / ${meta.position} (n=${n}) ─────────────────────────`,
    `  Predictor years : ${meta.predictorYears.join(', ')}`,
    `  Outcome years   : ${meta.outcomeYears.join(', ')}`,
    `  Effective panel : ${panelStr} (pre-2020 dropped — off_snp not tracked)`,
    `  Raw Pearson r   : ${fmt(rawPearson)}`,
    `  Standardized β  : ${fmt(standardizedBeta)}   (candidate partial β)`,
    `  R²              : ${fmt(rSquared)}`,
    `  Control βs:`,
    ...controls.map(c => `    ${c.padEnd(14)} ${fmt(controlBetas?.[c])}`),
    `  Collinearity (r vs predictor):`,
    ...controls.map(c => {
      const r = collinearity?.[c];
      const fl = r != null && Math.abs(r) > 0.8 ? ' ⚠ HIGH' : '';
      return `    ${c.padEnd(14)} ${fmt(r)}${fl}`;
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

// ─── Human-readable formatter — validate ─────────────────────────────────────

function formatValidateReport(resultRows, { fromYear, toYear, minOutcomeGames }) {
  console.log('[backtest] D3 team-RZ-share self-validation (qualitative trust check)');
  console.log(`[backtest] Panel: ${fromYear}→${toYear}, min-games=${minOutcomeGames}`);

  let hardPass = true;
  for (const r of resultRows) {
    if (!r.diagnostic && !r.pass) hardPass = false;

    const diagNote = r.diagnostic ? ' (diagnostic only — not required for PASS)' : '';
    const minYr = r.predictorYears[0] ?? null;
    const maxYr = r.predictorYears[r.predictorYears.length - 1] ?? null;
    const panelStr = minYr && maxYr ? `${minYr}–${maxYr}` : 'none';

    console.log(`\n  ${r.label}: ${r.statusLabel}${diagNote}`);
    console.log(`    β = ${fmt(r.beta)}  (D3 app-side ref: +${fmt(r.target)} ± ${fmt(r.tol)} — informational)`);
    console.log(`    own-rate β (rzOwnRate) = ${fmt(r.ownRateBeta)}  sign_pass = ${r.signPass}`);
    console.log(`    raw r (teamRzShare) = ${fmt(r.rawPearson)}  raw_pass = ${r.rawPass}`);
    console.log(`    monotonic = ${r.monotonic}`);
    console.log(`    effective panel: ${panelStr} (pre-2020 dropped — off_snp not tracked)`);
    console.log(`    contributing predictor years: ${r.predictorYears.join(', ') || 'none'}`);
    console.log(`    n = ${r.n}`);
    console.log(`    PASS criteria: β>0 ${r.betaPass ? '✓' : '✗'}  own-rate β<0 ${r.signPass ? '✓' : '✗'}  monotonic ${r.monoPass ? '✓' : '✗'}  raw r>0 ${r.rawPass ? '✓' : '✗'}`);

    if (r.diagnostic && !r.pass) {
      console.log('    → RB miss is expected if rushing denominators exclude QB sneaks or stat coverage gaps exist.');
      console.log('    → Do NOT widen D3_TOLERANCE to force a pass — report this β as a finding.');
    }
  }

  console.log(`\n  Overall: ${hardPass ? 'PASS (WR/TE qualitative criteria met)' : 'FAIL (WR/TE qualitative criteria not met)'}`);
  console.log('\n  Note: D3 reference βs (WR/TE: +0.17, RB: +0.20) are app-side 2012–2025 results on');
  console.log('  historicalTeamTotals (all rostered players). Not numerically reproducible from season-totals');
  console.log('  here (measured β ≈ +0.5 on the snap-available 2020–2024 panel). Do not widen tolerance');
  console.log('  or force the numeric match.');

  return hardPass;
}

// ─── Write report ─────────────────────────────────────────────────────────────

function writeReport(report) {
  const date = new Date().toISOString().slice(0, 10);
  const relPath = `backtests/${date}-${report.meta.metric}-${report.meta.position}.json`;
  writeJsonStable(relPath, report);
  console.log(`[backtest] Wrote ${relPath}`);
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

      const fromYear        = parseInt(option('--from')      ?? '2012', 10);
      const toYear          = parseInt(option('--to')        ?? '2025', 10);
      const minOutcomeGames = parseInt(option('--min-games') ?? '6',    10);
      const metricArg       = option('--metric')   ?? 'all';
      const positionArg     = option('--position') ?? 'all';

      if (isNaN(fromYear) || isNaN(toYear) || isNaN(minOutcomeGames)) {
        console.error('[backtest] Error: --from, --to, --min-games must be numeric');
        process.exit(1);
      }

      if (validate) {
        const resultRows = runValidate({ fromYear, toYear, minOutcomeGames });
        if (asJson) {
          console.log(JSON.stringify(resultRows, null, 2));
          const hardPass = resultRows.filter(r => !r.diagnostic).every(r => r.pass);
          process.exit(hardPass ? 0 : 1);
        }
        const pass = formatValidateReport(resultRows, { fromYear, toYear, minOutcomeGames });
        process.exit(pass ? 0 : 1);
      }

      const metrics   = metricArg   === 'all' ? METRICS : [normalizeMetric(metricArg)];
      const positions = normalizePosition(positionArg);

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
