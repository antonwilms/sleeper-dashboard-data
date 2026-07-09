#!/usr/bin/env node
/**
 * bin/panel.mjs — E-0a grading-panel CLI (R1-HARNESS).
 *
 * Offline, read-only analysis. Builds the feature→outcome panel (season-totals
 * v3 + advstats + roster-position + a pinned scoring snapshot), fits a
 * ridge-regularized baseline per position under season-blocked forward-chaining
 * CV, and grades the standing candidates (airYardsShare, shareLevel) for
 * incremental held-out value. NOT the snapshot grader (bin/grade.mjs). No served
 * file, no manifest entry, no production path — see README → Analysis / Backtesting.
 *
 * Usage: node bin/panel.mjs [options]
 *   --from YYYY --to YYYY             predictor-year range (default 2020–2024)
 *   --attribution current-team|per-season-team   seam flag (default current-team)
 *   --basis in-basis|half_ppr         default in-basis
 *   --scoring-from YYYY-MM-DD         scoring-source snapshot (default 2026-07-05)
 *   --min-games N                     outcome gate (default 6)
 *   --ridge X                         default 1.0 (sweep always reported)
 *   --flip-gate                       R2 dual-mode attribution comparison (both modes; drop --attribution)
 *   --json                            machine-readable FitReport (FlipReport under --flip-gate) to stdout
 *   --write                           persist the three artifacts (backtests/ + grading/)
 */

import path from 'path';
import { fileURLToPath } from 'url';
import {
  assemblePanel,
  runBaseline,
  runCandidates,
  buildFitReport,
  buildVerdictMarkdown,
  writeArtifacts,
  runFlipGate,
  buildFlipVerdictMarkdown,
  buildMergedFlipPanel,
  writeFlipArtifacts,
  DEFAULT_SCORING_SNAPSHOT,
} from '../scripts/panel-run.mjs';
import { PANEL_DEFAULTS } from '../lib/panel.mjs';

// ─── Arg parsing ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function flag(name) { return args.includes(name); }
function option(name) {
  const i = args.indexOf(name);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}

// ─── Main ────────────────────────────────────────────────────────────────────

const isMain = process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  (() => {
    try {
      const asJson = flag('--json');
      const write = flag('--write');

      const fromYear = parseInt(option('--from') ?? String(PANEL_DEFAULTS.fromYear), 10);
      const toYear = parseInt(option('--to') ?? String(PANEL_DEFAULTS.toYear), 10);
      const minOutcomeGames = parseInt(option('--min-games') ?? String(PANEL_DEFAULTS.minOutcomeGames), 10);
      const ridgeLambda = parseFloat(option('--ridge') ?? String(PANEL_DEFAULTS.ridgeLambda));
      const attribution = option('--attribution') ?? 'current-team';
      const basis = option('--basis') ?? 'in-basis';
      const scoringFrom = option('--scoring-from') ?? DEFAULT_SCORING_SNAPSHOT;
      const flipGate = flag('--flip-gate');

      if ([fromYear, toYear, minOutcomeGames, ridgeLambda].some(v => isNaN(v))) {
        console.error('[panel] Error: --from, --to, --min-games, --ridge must be numeric');
        process.exit(1);
      }
      if (!['in-basis', 'half_ppr'].includes(basis)) {
        console.error("[panel] Error: --basis must be 'in-basis' or 'half_ppr'");
        process.exit(1);
      }
      if (flipGate && args.includes('--attribution')) {
        console.error('[panel] Error: flip-gate runs both modes; drop --attribution');
        process.exit(1);
      }

      if (flipGate) {
        const { panels, cohortByKey, flipReport } = runFlipGate({ fromYear, toYear, basis, scoringFrom, minOutcomeGames, ridgeLambda, ridgeSweep: PANEL_DEFAULTS.ridgeSweep });
        const verdictMd = buildFlipVerdictMarkdown(flipReport);

        if (asJson) {
          console.log(JSON.stringify(flipReport, null, 2));
        } else {
          console.log(verdictMd);
        }

        if (write) {
          const mergedPanel = buildMergedFlipPanel({ panels, cohortByKey });
          const { panelPath, fitPath, verdictPath } = writeFlipArtifacts({ mergedPanel, flipReport, verdictMd });
          console.log(`[panel] Wrote ${panelPath}`);
          console.log(`[panel] Wrote ${fitPath}`);
          console.log(`[panel] Wrote ${verdictPath}`);
        }
      } else {
        const panel = assemblePanel({ fromYear, toYear, attribution, basis, scoringFrom, minOutcomeGames });
        const baseline = runBaseline(panel, { ridgeLambda });
        const candidates = runCandidates(panel, { ridgeLambda, ridgeSweep: PANEL_DEFAULTS.ridgeSweep });
        const fitReport = buildFitReport(panel, baseline, candidates, { ridgeLambda, ridgeSweep: PANEL_DEFAULTS.ridgeSweep });
        const verdictMd = buildVerdictMarkdown(panel, fitReport);

        if (asJson) {
          console.log(JSON.stringify(fitReport, null, 2));
        } else {
          console.log(verdictMd);
        }

        if (write) {
          const { panelPath, fitPath, verdictPath } = writeArtifacts({ panel, fitReport, verdictMd });
          console.log(`[panel] Wrote ${panelPath}`);
          console.log(`[panel] Wrote ${fitPath}`);
          console.log(`[panel] Wrote ${verdictPath}`);
        }
      }

      process.exit(0); // verdicts are findings, not pass/fail
    } catch (err) {
      console.error('[panel] ' + err.message);
      if (process.env.DEBUG) console.error(err.stack);
      process.exit(1);
    }
  })();
}
