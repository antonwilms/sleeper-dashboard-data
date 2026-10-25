#!/usr/bin/env node
/**
 * bin/season-grade.mjs — January season grade CLI (plans january-grading-run-a §10, january-grading-run-b).
 *
 * Thin: parses flags and dispatches to scripts/season-grade-run.mjs. Report-only — it never proposes a constant.
 *
 * Usage:
 *   node bin/season-grade.mjs [--write] [--json] [--rehearse] [--only <ids>] [--run-date YYYY-MM-DD]
 *
 * Exit codes: 0 = every step ran; 1 = a step failed (or G-SEASON hard-stopped the run).
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { runSeasonGrade, STEPS } from '../scripts/season-grade-run.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const option = (n) => { const i = args.indexOf(n); return i !== -1 && i + 1 < args.length ? args[i + 1] : null; };

function printHelp() {
  console.log(`
sleeper-dashboard-data January season grade

USAGE
  node bin/season-grade.mjs [options]

OPTIONS
  --rehearse             Bypass G-SEASON, write nothing, stamp every section "REHEARSAL — partial season (weeks 1–N)"
  --write                Persist grading/<captureDate>.json (registered), backtests/<runDate>-season-grade.json and
                         grading/<runDate>-season-grade-verdict.md (the last two are unregistered analysis output)
  --json                 Print the aggregate data as JSON instead of the markdown verdict
  --only <ids>           Comma-separated step ids: ${STEPS.map(s => s.id).join(', ')}
                         (Slice B: ros = D-52 ROS grade by checkpoint; games-l6 / override = L6 games check and the healthy
                         override, both need vet-calibration in the same list or report graded: false; rookie = D-16 + D-75,
                         with --write also backtests/<runDate>-rookie-panel.json and -rookie-league-panel.json; d60 = not
                         counted until the 2026 season-totals leave inProgress; listed = D-79/D-80/D-85 text)
  --run-date YYYY-MM-DD  Override the run date used in artifact names (default: today, UTC)
  -h, --help

NOTES
  Trigger: Fri 2027-01-15, at or after 14:00 UTC (week 18 ends 2027-01-10). Offline analysis, not the snapshot grader:
  the veteran replay recomposes projections. Output is numbers and labels only.
`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  (async () => {
    try {
      if (flag('--help') || flag('-h')) { printHelp(); process.exit(0); }
      const onlyRaw = option('--only');
      const runDate = option('--run-date');
      if (runDate != null && !/^\d{4}-\d{2}-\d{2}$/.test(runDate)) {
        console.error(`[season-grade] --run-date must be YYYY-MM-DD, got: ${runDate}`);
        process.exit(1);
      }
      const rehearse = flag('--rehearse');
      const r = await runSeasonGrade({
        only: onlyRaw ? onlyRaw.split(',').map(s => s.trim()).filter(Boolean) : null,
        rehearse, write: flag('--write'), runDate,
        log: (m) => console.error(m),
      });
      if (flag('--json')) process.stdout.write(JSON.stringify(r.data, null, 2) + '\n');
      else process.stdout.write(r.verdict + '\n');
      for (const a of r.artifacts) console.error(`[season-grade] wrote ${a.path}`);
      process.exit(r.exitCode);
    } catch (err) {
      console.error('[season-grade] ' + err.message);
      if (process.env.DEBUG) console.error(err.stack);
      process.exit(1);
    }
  })();
}
