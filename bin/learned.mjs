#!/usr/bin/env node
/**
 * bin/learned.mjs — LP-1a learned-projection research CLI. Offline; writes only the git-ignored research cache.
 *
 * Usage: node bin/learned.mjs export [--from 2014] [--to 2025] | export-weekly
 *   export   assemble the per-player-week research panel + season benchmarks into research/learned-projection/.cache/panel/
 *   export-weekly   LP-1b: replay the app's in-season logic week by week over the cached panel → benchw.jsonl + benchw.meta.json beside it
 *
 * Thin: parses flags and dispatches to scripts/learned-panel-run.mjs. See .claude/tasks/learned-projection-1a-harness.md.
 */
import { runExport, runExportWeekly } from '../scripts/learned-panel-run.mjs';

const args = process.argv.slice(2);
const cmd = args[0];
function opt(name, dflt) {
  const i = args.indexOf(name);
  if (i < 0) return dflt;
  const v = Number(args[i + 1]);
  if (!Number.isInteger(v)) { console.error(`[learned] ${name} needs an integer year`); process.exit(2); }
  return v;
}

if (cmd === 'export-weekly') {
  try {
    const m = runExportWeekly({ log: (x) => console.log(`[learned] ${x}`) });
    console.log(`[learned] wrote benchw: ${m.counts.rows} rows, condNull ${m.counts.condNull}, qbOmitted ${m.counts.qbOmitted}, routeMismatch ${m.counts.routeMismatch}, ${(m.runtimeMs / 1000).toFixed(0)}s`);
    process.exit(0);
  } catch (e) {
    console.error(`[learned] ${e.name}: ${e.message}`);
    if (e.detail) console.error(JSON.stringify(e.detail).slice(0, 2000));
    process.exit(1);
  }
}
if (cmd !== 'export') {
  console.error('Usage: node bin/learned.mjs export [--from 2014] [--to 2025] | export-weekly');
  process.exit(2);
}
const from = opt('--from', 2014), to = opt('--to', 2025);
if (from < 2014 || to > 2025 || from > to) { console.error('[learned] --from must be ≥ 2014 and --to ≤ 2025'); process.exit(2); }
try {
  const meta = runExport({ from, to, log: (m) => console.log(`[learned] ${m}`) });
  console.log(`[learned] wrote panel: ${meta.counts.weeks} week rows, ${meta.counts.seasons} season rows, ${meta.counts.bench} bench rows, ${meta.keys.length} keys, ${(meta.runtimeMs / 1000).toFixed(0)}s`);
} catch (e) {
  console.error(`[learned] ${e.name}: ${e.message}`);
  if (e.detail) console.error(JSON.stringify(e.detail).slice(0, 2000));
  process.exit(1);
}
