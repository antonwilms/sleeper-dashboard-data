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
 *   --controls overallShare,snapShare,rzOwnRate  comma-separated subset of controls (default: all three);
 *              dropping snapShare widens the panel to pre-2020 seasons; applies to --metric ONLY, not --validate
 *   --validate   D3 qualitative trust check (team-share β>0, own-rate β<0, monotonic, raw r>0)
 *   --json       machine-readable output
 *   --write      persist backtests/<date>-<metric>-<pos>.json
 *   --by-season  per-season breakout in addition to pooled
 *   --inseason   in-season evidence k-fit (Phase 2a graded backtest): re-fits the shrinkage k against the real
 *                reconstructed pre-season projection, answers Q1-Q8, emits the constants table. Takes only
 *                --json / --write / --dynasty; the windows and basis are pinned. --write persists
 *                backtests/<date>-inseason-{panel,constants}.json + grading/<date>-inseason-verdict.md.
 *                Exit 1 if the gamelogs reconciliation stop fires (no artifacts written).
 *   --qb-takeover  QB backup→starter takeover fit (P6a, offline analysis only): a two-state weekly Markov chain
 *                (hazard pUp + stickiness pStay, ridge-logistic over categorical features), forward-ladder
 *                feature selection on leave-one-season-out log-loss, and the rest-of-season start-fraction
 *                comparison. Takes only --json / --write. --write persists
 *                backtests/<date>-qb-takeover-{panel,constants}.json + grading/<date>-qb-takeover-verdict.md.
 *                Exit 1 if the primary-passer coverage stop fires (no artifacts written).
 *   --qb-rookie-level  rookie QB starter level (P12a, offline analysis only): PPG in games a rookie QB starts
 *                (primary passer), by round-based draft group, with held-out comparison against the shipped
 *                ktc-neutral level and the live snapshot's rookie QBs. Takes only --json / --write. --write
 *                persists backtests/<date>-qb-rookie-level-{panel,constants}.json +
 *                grading/<date>-qb-rookie-level-verdict.md. Exit 1 if the coverage or snapshot stop fires.
 *   --absence    graded before/after check of the absence correction (L5 Stage B, offline analysis only):
 *                the mirrored projected-games rule on season-totals with and without `classifyAbsences`
 *                applied, vs next-season games played. Takes only --json / --write. --write persists
 *                backtests/<date>-absence-panel.json + grading/<date>-absence-verdict.md.
 *                Exit 1 if DM-1 parity falls below 99% or the snapshot is missing (nothing written).
 *   --games-calibration  projected-games over-projection (L6, offline analysis only): decomposes the +3.4-game
 *                bias of the mirrored veteran rule into composition / role / injury list / schedule, and tests
 *                held-out multiplicative-scale calibrations by position, age and S-row state. Takes only
 *                --cause / --short / --json / --write. --write persists backtests/<date>-games-calibration-{panel,constants}.json +
 *                grading/<date>-games-calibration-verdict.md. Exit 1 if DM-1 parity falls below 99% or the
 *                snapshot is missing (nothing written).
 *                --cause (L6b) splits short S seasons by cause (K1 app-native / K2 roster-only / K3 roster +
 *                contributor), adds relevance and a season-length factor, and decides per δ; --write persists
 *                backtests/<date>-games-cause-{panel,constants}.json + grading/<date>-games-cause-verdict.md.
 *                --short (L6c) keeps the app prediction on qualifying S seasons and fits k only on non-qualifying
 *                ones (SOf0, SOK1f0); --write persists backtests/<date>-games-short-{panel,constants}.json +
 *                grading/<date>-games-short-verdict.md. Mutually exclusive with --cause.
 *   --dynasty    (with --inseason) dynasty-side (rookies + SHORT veterans) k-fit (Phase 2c, offline
 *                analysis only): the prospect prior (arm A vs arm B), the SHORT-veteran history prior,
 *                and the KTC-anchor report, plus the rookie QB level in the dynasty prior (Q4) and the
 *                sat-longer discount (Q5); runs on the starter QB prior. --write persists
 *                backtests/<date>-inseason-dyn-{panel,constants}.json + grading/<date>-inseason-dyn-verdict.md.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { writeJsonStable } from '../lib/io.mjs';
import { D3_TARGETS, D3_TOLERANCE, isCorruptPredictorSeason } from '../lib/backtest.mjs';
import {
  METRICS,
  POSITIONS,
  normalizeMetric,
  normalizePosition,
  normalizeControls,
  assembleCohort,
  runMetric,
  runValidate,
} from '../scripts/backtest-run.mjs';
import { inSeasonMain } from '../scripts/inseason-run.mjs';
import { inSeasonDynMain } from '../scripts/inseason-dyn-run.mjs';
import { qbTakeoverMain } from '../scripts/qb-takeover-run.mjs';
import { qbRookieLevelMain } from '../scripts/qb-rookie-level-run.mjs';
import { absenceMain } from '../scripts/absence-run.mjs';
import { gamesCalibrationMain } from '../scripts/games-calibration-run.mjs';
import { gamesCauseMain } from '../scripts/games-cause-run.mjs';
import { gamesShortMain } from '../scripts/games-short-run.mjs';

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
  const { meta, n, rawPearson, standardizedBeta, controlBetas, rSquared, collinearity, quintiles, monotonic, caveats, excludedSeasons } = report;
  const controls = meta.controls ?? [];
  const minYr = meta.predictorYears[0] ?? null;
  const maxYr = meta.predictorYears[meta.predictorYears.length - 1] ?? null;
  const panelStr = minYr && maxYr ? `${minYr}–${maxYr}` : 'none';
  const snapNote = controls.includes('snapShare') ? ' (snapShare in controls — pre-2020 rows excluded)' : '';
  const excludedLine = excludedSeasons && excludedSeasons.length
    ? [`  Excluded seasons : ${excludedSeasons.join(', ')} (upstream-corrupt air yards — advstats-2016-gate.md)`]
    : [];
  const lines = [
    `\n── ${meta.metric} / ${meta.position} (n=${n}) ─────────────────────────`,
    `  Predictor years : ${meta.predictorYears.join(', ')}`,
    `  Outcome years   : ${meta.outcomeYears.join(', ')}`,
    `  Effective panel : ${panelStr}${snapNote}`,
    ...excludedLine,
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
    console.log(`    effective panel: ${panelStr} (pre-2020 dropped — off_snp not tracked; ` +
      `see nflverse/snaps for a wider, cross-validated source this standalone D3 tool does not read)`);
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

      if (flag('--cause') && !flag('--games-calibration')) {
        console.error('[backtest] Error: --cause requires --games-calibration');
        process.exit(1);
      }
      if (flag('--short') && !flag('--games-calibration')) {
        console.error('[backtest] Error: --short requires --games-calibration');
        process.exit(1);
      }
      if (flag('--games-calibration')) {
        const rejected = args.filter(a => a.startsWith('--') && !['--games-calibration', '--cause', '--short', '--json', '--write'].includes(a));
        if (rejected.length) {
          console.error(
            `[backtest] Error: --games-calibration rejects ${rejected.join(', ')} — the seasons, folds, candidates and basis are pinned ` +
            'by the task file, not knobs; it takes only --cause, --short, --json and --write'
          );
          process.exit(1);
        }
        if (flag('--cause') && flag('--short')) {
          console.error('[backtest] Error: --cause and --short are mutually exclusive');
          process.exit(1);
        }
        if (flag('--short')) process.exit(gamesShortMain({ write, asJson }));
        process.exit(flag('--cause') ? gamesCauseMain({ write, asJson }) : gamesCalibrationMain({ write, asJson }));
      }

      if (flag('--absence')) {
        const rejected = args.filter(a => a.startsWith('--') && !['--absence', '--json', '--write'].includes(a));
        if (rejected.length) {
          console.error(
            `[backtest] Error: --absence rejects ${rejected.join(', ')} — the seasons, snapshot and basis are pinned ` +
            'by the task file, not knobs; it takes only --json and --write'
          );
          process.exit(1);
        }
        process.exit(absenceMain({ write, asJson }));
      }

      if (flag('--qb-rookie-level')) {
        const rejected = args.filter(a => a.startsWith('--') && !['--qb-rookie-level', '--json', '--write'].includes(a));
        if (rejected.length) {
          console.error(
            `[backtest] Error: --qb-rookie-level rejects ${rejected.join(', ')} — the seasons, groups, snapshot and basis (half_ppr) are pinned ` +
            'by the task file, not knobs; it takes only --json and --write'
          );
          process.exit(1);
        }
        process.exit(qbRookieLevelMain({ write, asJson }));
      }

      if (flag('--qb-takeover')) {
        const rejected = args.filter(a => a.startsWith('--') && !['--qb-takeover', '--json', '--write'].includes(a));
        if (rejected.length) {
          console.error(
            `[backtest] Error: --qb-takeover rejects ${rejected.join(', ')} — the seasons, features, ladder order and basis (half_ppr) are pinned ` +
            'by the task file, not knobs; it takes only --json and --write'
          );
          process.exit(1);
        }
        process.exit(qbTakeoverMain({ write, asJson }));
      }

      const dynasty = flag('--dynasty');
      if (flag('--inseason')) {
        const rejected = args.filter(a => a.startsWith('--') && !['--inseason', '--json', '--write', '--dynasty'].includes(a));
        if (rejected.length) {
          console.error(
            `[backtest] Error: --inseason rejects ${rejected.join(', ')} — the seasons, checkpoints and basis (half_ppr) are pinned ` +
            'by the task file, not knobs; it takes only --json, --write and --dynasty'
          );
          process.exit(1);
        }
        process.exit(dynasty ? inSeasonDynMain({ write, asJson }) : inSeasonMain({ write, asJson }));
      }
      if (dynasty) {
        console.error('[backtest] Error: --dynasty requires --inseason');
        process.exit(1);
      }

      const fromYear        = parseInt(option('--from')      ?? '2012', 10);
      const toYear          = parseInt(option('--to')        ?? '2025', 10);
      const minOutcomeGames = parseInt(option('--min-games') ?? '6',    10);
      const metricArg       = option('--metric')   ?? 'all';
      const positionArg     = option('--position') ?? 'all';
      const controlsArg     = option('--controls');
      const controls        = controlsArg != null ? normalizeControls(controlsArg) : null;

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
          const report = runMetric(rows, metric, position, { minOutcomeGames, fromYear, toYear, controls });

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
              // advstats-2016-gate.md §5.4 — skip rather than let runMetric's own filter
              // reduce this single-season slice to n=0 and print a degenerate block.
              if (isCorruptPredictorSeason(metric, Y)) continue;
              const sr = runMetric(seasonRows, metric, position, { minOutcomeGames, fromYear: Y, toYear: Y + 1, controls });
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
