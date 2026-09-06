/**
 * lib/args.mjs — CLI argument validation for bin/update.mjs.
 *
 * Pure, no I/O, no network. Catches the silent-retarget paths a bare `option()`/
 * `parseInt()` dispatcher lets through: a malformed --year, a --year with no value,
 * or a typo'd flag name — each of which used to fail loudly with the wrong data
 * (or not at all) rather than failing loudly with the right message.
 */

export const KNOWN_FLAGS   = ['--dry-run', '--force', '--all', '--help', '-h'];
export const KNOWN_OPTIONS = ['--year', '--category'];

/** The only subcommands that honour --all (scripts/update-{schedule,gamelogs,teamcontext,oline,snaps}.mjs). */
export const ALL_SUBCOMMANDS = ['schedule', 'gamelogs', 'teamcontext', 'oline', 'snaps'];

/**
 * CLI sanity bound — deliberately NOT a family coverage floor. `MIN_SCHEDULE_SEASON`
 * (lib/nflverse.mjs) is a CR-18 data-side trigger that encodes historical coverage;
 * importing it here would make this module a live consumer of that trigger and would
 * conflate a typo-bound with a family floor that merely happens to coincide today.
 * If a family's floor ever moves, this bound must not silently move with it.
 */
export const MIN_CLI_YEAR = 1999;

/**
 * Parses and validates argv for bin/update.mjs.
 * Returns { subcommand, year, category, force, dryRun, all } — the exact shape
 * bin/update.mjs's `opts` needs — or throws with a message naming the offending token.
 *
 * Rejects:
 *   - an unrecognized `--token` or `-token`
 *   - `--year` present with a non-four-digit value
 *   - `--year` present with a value starting with `--` (i.e. no value was actually given)
 *   - `--year` present with no value at all (the final token)
 *   - `--year` out of [minYear, maxYear]
 *   - `--all` together with `--year`, ONLY when subcommand is in ALL_SUBCOMMANDS
 *
 * `--year` absent returns year: null — the legitimate "current season" path.
 * `--help`/`-h` are known flags and are never rejected.
 */
export function parseAndValidateArgs(argv, {
  minYear = MIN_CLI_YEAR,
  maxYear = new Date().getUTCFullYear() + 1,
} = {}) {
  const subcommand = argv[0];

  // Unrecognized-token scan. Keys on a leading `-` (not `--`) so single-dash `-h`
  // is caught too. Every other token in argv is either the subcommand (argv[0],
  // skipped) or a value following a known option — those are validated separately
  // below, not scanned here.
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (i === 0) continue; // subcommand
    if (!token.startsWith('-')) continue; // an option's value, not a token itself
    if (KNOWN_FLAGS.includes(token) || KNOWN_OPTIONS.includes(token)) continue;
    const hint = token.startsWith('--y') ? ' (did you mean --year?)' : '';
    throw new Error(`unrecognized option "${token}"${hint}`);
  }

  const force  = argv.includes('--force');
  const dryRun = argv.includes('--dry-run');
  const all    = argv.includes('--all');

  const categoryIdx = argv.indexOf('--category');
  const category = categoryIdx !== -1 && categoryIdx + 1 < argv.length ? argv[categoryIdx + 1] : null;

  let year = null;
  const yearPresent = argv.includes('--year');
  if (yearPresent) {
    const yearIdx = argv.indexOf('--year');
    const yearRaw = yearIdx + 1 < argv.length ? argv[yearIdx + 1] : undefined;

    if (yearRaw === undefined || yearRaw.startsWith('--')) {
      throw new Error(`--year requires a value, e.g. --year 2023`);
    }
    if (!/^\d{4}$/.test(yearRaw)) {
      throw new Error(`--year "${yearRaw}" is not a four-digit year in [${minYear}, ${maxYear}]`);
    }
    year = parseInt(yearRaw, 10);
    if (year < minYear || year > maxYear) {
      throw new Error(`--year "${yearRaw}" is not a four-digit year in [${minYear}, ${maxYear}]`);
    }
  }

  if (all && yearPresent && ALL_SUBCOMMANDS.includes(subcommand)) {
    throw new Error(`--all and --year are mutually exclusive for "${subcommand}" — --all backfills every season`);
  }

  return { subcommand, year, category, force, dryRun, all };
}
