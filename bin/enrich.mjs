#!/usr/bin/env node
/**
 * bin/enrich.mjs — CLI for hand-curated enrichment overlay.
 *
 * Usage:
 *   node bin/enrich.mjs coaching add --year 2025 --team SF --role HC --name "Kyle Shanahan"
 *   node bin/enrich.mjs scheme   add --year 2024 --team MIA --offense "wide zone"
 *   node bin/enrich.mjs injuries add --player 6803 --year 2023 --segment-start 2 --type ACL
 *   node bin/enrich.mjs notes    add --player 4034 --year 2024 --body "Slot-heavy..."
 *   node bin/enrich.mjs notes    add --team SF    --year 2025 --body "..." --tag scheme
 *   node bin/enrich.mjs validate
 *   node bin/enrich.mjs list coaching [--year 2024]
 *   node bin/enrich.mjs remove <id>
 *
 * npm shortcuts: npm run enrich, npm run validate:enrichment
 *
 * Exit codes: 0 on success, 1 on validation failure, 2 on usage error.
 * Mirrors bin/update.mjs conventions.
 */

import { createRequire } from 'module';

// Load .env before anything else (mirrors bin/update.mjs pattern)
try {
  const require = createRequire(import.meta.url);
  const dotenv = require('dotenv');
  dotenv.config();
} catch {
  // dotenv not installed; continue
}

import { updateEnrichment } from '../scripts/update-enrichment.mjs';

// ─── Argument parsing ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function flag(name) {
  return args.includes(name);
}

function option(name) {
  const i = args.indexOf(name);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}

function optionInt(name) {
  const v = option(name);
  return v != null ? parseInt(v, 10) : null;
}

// ─── Help ─────────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
sleeper-dashboard-data enrichment overlay CLI

USAGE
  node bin/enrich.mjs <type> <action> [options]
  node bin/enrich.mjs validate
  node bin/enrich.mjs list <type> [--year YYYY]
  node bin/enrich.mjs remove <id>

TYPES
  coaching    Coaching staff entries (HC/OC/DC per team per year)
  scheme      Offensive/defensive scheme entries (per team per year)
  injuries    Injury enrichment for known absence segments
  notes       Free-form notes (per player or per team)

ACTIONS
  add         Upsert an entry (validates before write; idempotent)
  list        Print current entries for a type
  remove      Remove an entry by id (scans all types)
  validate    Validate all four enrichment files

OPTIONS (common)
  --dry-run       Validate + show diff, no writes
  --force         Overwrite an existing entry with different fields

OPTIONS (coaching add)
  --year YYYY     Season year (required)
  --team ABBR     NFL team abbreviation (required)
  --role ROLE     HC | OC | DC (required)
  --name NAME     Staff member name (required)
  --tenure-start YYYY
  --is-new        Flag as new hire this season
  --predecessor NAME
  --source TEXT
  --notes TEXT

OPTIONS (scheme add)
  --year YYYY
  --team ABBR
  --offense TEXT
  --defense TEXT
  --tempo fast|slow|medium
  --changed-from-prev
  --source TEXT
  --notes TEXT

OPTIONS (injuries add)
  --player ID         Sleeper player_id (required)
  --year YYYY         Season year (required)
  --segment-start N   Segment start week (required, must exist in season-totals)
  --segment-end N     Segment end week (defaults to season end)
  --type TEXT         Injury type (e.g. ACL, hamstring)
  --body-part TEXT    Body part (e.g. knee, hamstring)
  --severity TEXT     season-ending | multi-week | single-game | playing-through
  --date-injured YYYY-MM-DD
  --date-returned YYYY-MM-DD
  --source TEXT
  --notes TEXT

OPTIONS (notes add)
  --player ID         Sleeper player_id (required if --team not set)
  --team ABBR         NFL team (required if --player not set)
  --year YYYY         Optional
  --body TEXT         Note body (required)
  --tag TEXT          Category tag (e.g. usage, scheme, injury)
  --source TEXT

EXAMPLES
  node bin/enrich.mjs coaching add --year 2025 --team SF --role HC --name "Kyle Shanahan"
  node bin/enrich.mjs scheme   add --year 2024 --team MIA --offense "wide zone / play-action"
  node bin/enrich.mjs injuries add --player 6803 --year 2023 --segment-start 2 --type ACL \\
      --body-part knee --severity season-ending --date-injured 2023-09-11
  node bin/enrich.mjs notes    add --player 4034 --year 2024 --body "Slot-heavy in 11-personnel"
  node bin/enrich.mjs validate
  node bin/enrich.mjs list injuries --year 2023
  node bin/enrich.mjs remove inj-6803-2023-w2-9e1f
`);
}

if (args.length === 0 || flag('--help') || flag('-h')) {
  printHelp();
  process.exit(0);
}

// ─── Subcommand routing ───────────────────────────────────────────────────────

const ENRICHMENT_TYPES = ['coaching', 'scheme', 'injuries', 'notes'];

const firstArg = args[0];

// Standalone: validate / remove / list (no type prefix required for validate)
let type   = null;
let action = null;

if (firstArg === 'validate') {
  action = 'validate';
} else if (firstArg === 'remove') {
  action = 'remove';
} else if (ENRICHMENT_TYPES.includes(firstArg)) {
  type = firstArg;
  action = args[1] ?? null;
  if (!action) {
    console.error(`[enrich] Missing action for type "${type}". Use: add | list\n`);
    printHelp();
    process.exit(2);
  }
} else {
  console.error(`[enrich] Unknown subcommand: "${firstArg}"\n`);
  printHelp();
  process.exit(2);
}

// ─── Parse flags into fields ──────────────────────────────────────────────────

const dryRun = flag('--dry-run');
const force  = flag('--force');

const fields = {
  // shared
  year:            optionInt('--year'),
  team:            option('--team'),
  source:          option('--source'),
  notes:           option('--notes'),

  // coaching
  role:            option('--role'),
  name:            option('--name'),
  tenureStart:     optionInt('--tenure-start'),
  isNew:           flag('--is-new') || undefined,
  predecessor:     option('--predecessor'),

  // scheme
  offense:         option('--offense'),
  defense:         option('--defense'),
  tempo:           option('--tempo'),
  changedFromPrev: flag('--changed-from-prev') || undefined,

  // injuries
  player:          option('--player'),
  segmentStart:    optionInt('--segment-start'),
  segmentEnd:      optionInt('--segment-end'),
  type:            option('--type'),
  bodyPart:        option('--body-part'),
  severity:        option('--severity'),
  dateInjured:     option('--date-injured'),
  dateReturned:    option('--date-returned'),

  // notes
  body:            option('--body'),
  tag:             option('--tag'),

  // remove
  id:              args[1] !== action ? args[1] : null,  // remove <id>
};

// For 'remove', the id is the second positional arg
if (action === 'remove') {
  fields.id = args[1] ?? null;
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

(async () => {
  try {
    await updateEnrichment({ type, action, force, dryRun, fields });
  } catch (err) {
    console.error(`\n[enrich] Error: ${err.message}`);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  }
})();
