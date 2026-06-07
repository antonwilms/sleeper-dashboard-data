#!/usr/bin/env node
/**
 * bin/grade.mjs — Grading harness CLI.
 *
 * Joins a captured projection snapshot to the following season's outcomes
 * and emits accuracy diagnostics (MAE, bias, calibration, factor correlations).
 *
 * Usage:
 *   node bin/grade.mjs <snapshotDate> [options]
 *   node bin/grade.mjs --self-test
 *
 * See --help for full option list.
 *
 * Exit codes:
 *   0  — success, nothing-to-grade (missing outcome file, strict-basis skip),
 *         or self-test passed.
 *   1  — real error (missing snapshot, unparseable file, bad argument).
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { gradeSnapshot, runSelfTest } from '../scripts/grade-snapshot.mjs';

// ─── Argument parsing (mirrors update.mjs / enrich.mjs pattern) ──────────────

const args = process.argv.slice(2);

function flag(name) {
  return args.includes(name);
}

function option(name) {
  const i = args.indexOf(name);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}

// ─── Help ─────────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
sleeper-dashboard-data grading harness

USAGE
  node bin/grade.mjs <snapshotDate> [options]
  node bin/grade.mjs --self-test

ARGUMENTS
  <snapshotDate>           UTC date of the snapshot to grade, e.g. 2026-06-06
                           (reads snapshots/<snapshotDate>.json)

OPTIONS
  --target-season YYYY     Override the derived target season
  --write                  Persist grading/<snapshotDate>.json + update manifest
  --json                   Print the GradeReport as JSON to stdout (no file write)
  --strict-basis           Skip if snapshot scoringBasis !== half_ppr
  --dry-run                Compute + print, never write (suppresses --write)
  --self-test              Run the fixture self-check and exit
                           (used by npm run smoke)
  -h, --help

EXAMPLES
  node bin/grade.mjs 2026-06-06                       # human report to stdout
  node bin/grade.mjs 2026-06-06 --json                # machine-readable report
  node bin/grade.mjs 2026-06-06 --write               # persist grading/2026-06-06.json
  node bin/grade.mjs 2026-06-06 --target-season 2026  # override season join
  node bin/grade.mjs 2026-06-06 --strict-basis        # skip non-half_ppr snapshots
  node bin/grade.mjs --self-test                      # fixture check (smoke)

NOTES
  The grading harness reads captured projections and captured outcomes — it
  never re-runs the projection pipeline. The scorer is decoupled from the
  snapshot format via a GradeInput interface (lib/grade.mjs).

  Until nfl/season-totals/2026.json exists (~early 2027), running this command
  will print "outcome not available yet" and exit 0 — that is the expected state.

  All current snapshots are 'custom' scoring basis; actual outcomes are
  canonical half_ppr. The absolute PPG MAE/bias conflates basis offset with
  projection error. Use --strict-basis to skip non-half_ppr snapshots entirely.
  See README.md Grading harness section for full details.
`);
}

// ─── Main (only runs when invoked directly, not when imported) ────────────────

const isMain = process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  (async () => {
    try {
      if (flag('--help') || flag('-h') || args.length === 0) {
        printHelp();
        process.exit(0);
      }

      // ── --self-test ─────────────────────────────────────────────────────────
      if (flag('--self-test')) {
        runSelfTest();
        process.exit(0);
      }

      // ── Normal grading ──────────────────────────────────────────────────────
      const snapshotDate = args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a));
      if (!snapshotDate) {
        console.error('[grade] Error: missing <snapshotDate> argument (expected YYYY-MM-DD).');
        console.error('[grade] Run with --help for usage.');
        process.exit(1);
      }

      const targetSeasonRaw = option('--target-season');
      const targetSeason    = targetSeasonRaw != null ? parseInt(targetSeasonRaw, 10) : null;
      if (targetSeasonRaw != null && (isNaN(targetSeason) || targetSeason < 2000)) {
        console.error(`[grade] Error: --target-season must be a 4-digit year, got: ${targetSeasonRaw}`);
        process.exit(1);
      }

      gradeSnapshot({
        snapshotDate,
        targetSeason,
        write:       flag('--write'),
        json:        flag('--json'),
        strictBasis: flag('--strict-basis'),
        dryRun:      flag('--dry-run'),
      });

      process.exit(0);
    } catch (err) {
      console.error('[grade] ' + err.message);
      if (process.env.DEBUG) console.error(err.stack);
      process.exit(1);
    }
  })();
}
