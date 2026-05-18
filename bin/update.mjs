#!/usr/bin/env node
/**
 * bin/update.mjs — CLI dispatcher for the sleeper-dashboard-data update scripts.
 *
 * Usage:
 *   node bin/update.mjs nfl  --year 2024
 *   node bin/update.mjs cfbd --year 2024
 *   node bin/update.mjs cfbd --year 2024 --category receiving
 *   node bin/update.mjs ktc
 *   node bin/update.mjs <any> --dry-run    # fetch + validate, no writes
 *   node bin/update.mjs <any> --force      # overwrite completed-season files
 *
 * npm shortcuts: npm run update:nfl, update:cfbd, update:ktc, smoke
 *
 * Environment:
 *   CFBD_API_KEY  — required for cfbd subcommand; loaded from .env if present
 */

import { createRequire } from 'module';

// Load .env before any other imports so env vars are available to lib/* modules.
// Using dotenv/config directly to keep this file import-only.
try {
  const require = createRequire(import.meta.url);
  const dotenv = require('dotenv');
  dotenv.config();
} catch {
  // dotenv not installed yet; continue (env vars set by CI environment)
}

import { updateNfl }  from '../scripts/update-nfl.mjs';
import { updateCfbd } from '../scripts/update-cfbd.mjs';
import { updateKtc }  from '../scripts/update-ktc.mjs';

// ─── Argument parsing ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function flag(name) {
  return args.includes(name);
}

function option(name) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : null;
}

const subcommand = args[0];
const dryRun     = flag('--dry-run');
const force      = flag('--force');
const yearRaw    = option('--year');
const year       = yearRaw ? parseInt(yearRaw, 10) : null;
const category   = option('--category');

// ─── Help ─────────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
sleeper-dashboard-data update scripts

USAGE
  node bin/update.mjs <subcommand> [options]

SUBCOMMANDS
  nfl  --year YYYY            Fetch NFL season totals for YYYY from Sleeper
  cfbd --year YYYY            Fetch CFBD college stats for YYYY (all categories)
  cfbd --year YYYY --category receiving|rushing|passing
  ktc                         Capture a KTC dynasty value snapshot for today

OPTIONS
  --dry-run   Fetch + validate, print diff, but don't write any files
  --force     Overwrite completed-season files (skipped by default)

EXAMPLES
  node bin/update.mjs nfl  --year 2024
  node bin/update.mjs cfbd --year 2023 --dry-run
  node bin/update.mjs ktc
  node bin/update.mjs nfl  --year 2023 --force
`);
}

if (!subcommand || subcommand === '--help' || subcommand === '-h') {
  printHelp();
  process.exit(0);
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

const opts = { year, category, force, dryRun };

(async () => {
  try {
    switch (subcommand) {
      case 'nfl':
        await updateNfl(opts);
        break;
      case 'cfbd':
        await updateCfbd(opts);
        break;
      case 'ktc':
        await updateKtc(opts);
        break;
      default:
        console.error(`Unknown subcommand: ${subcommand}\n`);
        printHelp();
        process.exit(1);
    }
  } catch (err) {
    console.error(`\n[update] Error: ${err.message}`);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  }
})();
