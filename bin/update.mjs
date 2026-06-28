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

import { updateNfl }          from '../scripts/update-nfl.mjs';
import { updateCfbd }         from '../scripts/update-cfbd.mjs';
import { updateKtc }          from '../scripts/update-ktc.mjs';
import { registerSnapshots }  from '../scripts/register-snapshots.mjs';
import { updateRoster }       from '../scripts/update-roster.mjs';
import { updateDraft }        from '../scripts/update-draft.mjs';
import { updatePlayerIds }    from '../scripts/update-playerids.mjs';
import { updateAdvStats }     from '../scripts/update-advstats.mjs';
import { updateSchedule }    from '../scripts/update-schedule.mjs';
import { updateGameLogs }    from '../scripts/update-gamelogs.mjs';

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
const all        = flag('--all');
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
  snapshots                   Register any untracked snapshots/*.json in manifest.json
                              (run after copying snapshot files from the app export ZIP)
  roster                      Fetch nflverse season roster for current year (keyed by sleeper_id)
  roster --year YYYY          Fetch nflverse season roster for a specific year
  draft                       Fetch nflverse combined draft picks (all years ≥ 2010)
  playerids                   Fetch nflverse gsis_id→sleeper_id crosswalk (DynastyProcess)
  advstats --year YYYY        nflverse advanced receiving stats (WR/TE/RB), re-keyed to sleeper_id
  schedule                    nflverse NFL schedules + results (per-season; current season by default)
  schedule --year YYYY        Schedule for a specific season
  schedule --all              Backfill every season (≥ 1999)
  gamelogs                    nflverse per-game player stats (QB/RB/WR/TE/FB), keyed by sleeper_id
  gamelogs --year YYYY        Per-game logs for a specific season
  gamelogs --all              Backfill every season (≥ 2012)

OPTIONS
  --dry-run   Fetch + validate, print diff/plan, but don't write any files
  --force     Overwrite completed-season files (skipped by default; nfl/cfbd/roster/advstats/gamelogs only)
  --year YYYY Target season year (nfl, cfbd, roster subcommands)
  --all       Backfill all seasons (schedule subcommand only)

EXAMPLES
  node bin/update.mjs nfl  --year 2024
  node bin/update.mjs cfbd --year 2023 --dry-run
  node bin/update.mjs ktc
  node bin/update.mjs nfl  --year 2023 --force
  node bin/update.mjs snapshots
  node bin/update.mjs snapshots --dry-run
  node bin/update.mjs roster
  node bin/update.mjs roster --year 2024 --dry-run
  node bin/update.mjs roster --year 2024 --force
  node bin/update.mjs draft
  node bin/update.mjs draft --dry-run
  node bin/update.mjs playerids
  node bin/update.mjs playerids --dry-run
  node bin/update.mjs advstats --year 2023
  node bin/update.mjs advstats --year 2023 --dry-run
  node bin/update.mjs schedule
  node bin/update.mjs schedule --year 2023 --dry-run
  node bin/update.mjs schedule --all
  node bin/update.mjs gamelogs --year 2023
  node bin/update.mjs gamelogs --year 2023 --dry-run
  node bin/update.mjs gamelogs --all
`);
}

if (!subcommand || subcommand === '--help' || subcommand === '-h') {
  printHelp();
  process.exit(0);
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

const opts = { year, category, force, dryRun, all };

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
      case 'snapshots':
        registerSnapshots({ dryRun });
        break;
      case 'roster':
        await updateRoster(opts);
        break;
      case 'draft':
        await updateDraft(opts);
        break;
      case 'playerids':
        await updatePlayerIds(opts);
        break;
      case 'advstats':
        await updateAdvStats(opts);
        break;
      case 'schedule':
        await updateSchedule(opts);
        break;
      case 'gamelogs':
        await updateGameLogs(opts);
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
