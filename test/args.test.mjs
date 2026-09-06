/**
 * test/args.test.mjs — lib/args.mjs's parseAndValidateArgs (cli-arg-validation.md).
 *
 * Pure function, no network, no fixtures.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

import { parseAndValidateArgs, KNOWN_FLAGS, KNOWN_OPTIONS } from '../lib/args.mjs';

// ═══════════════════════════════════════════════════════════════════
// Rejections — every row of §1.1
// ═══════════════════════════════════════════════════════════════════

test('parseAndValidateArgs: --year 202x throws, message names 202x', () => {
  assert.throws(() => parseAndValidateArgs(['advstats', '--year', '202x']), /202x/);
});

test('parseAndValidateArgs: --year --dry-run throws (value starts with --)', () => {
  assert.throws(() => parseAndValidateArgs(['advstats', '--year', '--dry-run']));
});

test('parseAndValidateArgs: --dry-run --year (present, no value) throws, not year:null', () => {
  assert.throws(() => parseAndValidateArgs(['advstats', '--dry-run', '--year']));
});

test('parseAndValidateArgs: --yaer 2023 throws, names --yaer, hints --year', () => {
  assert.throws(() => parseAndValidateArgs(['advstats', '--yaer', '2023']), /--yaer/);
  try {
    parseAndValidateArgs(['advstats', '--yaer', '2023']);
    assert.fail('expected throw');
  } catch (err) {
    assert.match(err.message, /--yaer/);
    assert.match(err.message, /--year/);
  }
});

test('parseAndValidateArgs: --year 1998 throws (below minYear)', () => {
  assert.throws(() => parseAndValidateArgs(['advstats', '--year', '1998']));
});

test('parseAndValidateArgs: --year 2099 throws (above maxYear)', () => {
  assert.throws(() => parseAndValidateArgs(['advstats', '--year', '2099']));
});

test('parseAndValidateArgs: schedule --all --year 2015 throws (combination, ALL_SUBCOMMANDS member)', () => {
  assert.throws(() => parseAndValidateArgs(['schedule', '--all', '--year', '2015']));
});

test('parseAndValidateArgs: snaps --all --year 2016 throws — snaps is on ALL_SUBCOMMANDS (§C regression)', () => {
  assert.throws(() => parseAndValidateArgs(['snaps', '--all', '--year', '2016']));
});

// ═══════════════════════════════════════════════════════════════════
// Acceptances — the ones a false positive would break
// ═══════════════════════════════════════════════════════════════════

test('parseAndValidateArgs: --year 2023 accepted, year: 2023', () => {
  const opts = parseAndValidateArgs(['advstats', '--year', '2023']);
  assert.equal(opts.year, 2023);
});

test('parseAndValidateArgs: --dry-run alone → year: null, no throw', () => {
  const opts = parseAndValidateArgs(['advstats', '--dry-run']);
  assert.equal(opts.year, null);
});

test("parseAndValidateArgs: ['nfl'] → year: null — the Tuesday Action's exact invocation", () => {
  const opts = parseAndValidateArgs(['nfl']);
  assert.equal(opts.year, null);
  assert.equal(opts.subcommand, 'nfl');
});

test('parseAndValidateArgs: cfbd --year 2023 --category passing → no throw (a value is not a token)', () => {
  const opts = parseAndValidateArgs(['cfbd', '--year', '2023', '--category', 'passing']);
  assert.equal(opts.year, 2023);
  assert.equal(opts.category, 'passing');
});

test('parseAndValidateArgs: nfl --help and nfl -h → no throw (still ignored, not an error)', () => {
  assert.doesNotThrow(() => parseAndValidateArgs(['nfl', '--help']));
  assert.doesNotThrow(() => parseAndValidateArgs(['nfl', '-h']));
});

test('parseAndValidateArgs: nfl --all --year 2023 → no throw — nfl is not in ALL_SUBCOMMANDS', () => {
  assert.doesNotThrow(() => parseAndValidateArgs(['nfl', '--all', '--year', '2023']));
});

test('parseAndValidateArgs: schedule --all → no throw (the documented --all path)', () => {
  assert.doesNotThrow(() => parseAndValidateArgs(['schedule', '--all']));
});

test('parseAndValidateArgs: snaps --all → no throw (the documented --all path)', () => {
  assert.doesNotThrow(() => parseAndValidateArgs(['snaps', '--all']));
});

// ═══════════════════════════════════════════════════════════════════
// Every real scheduled/CI invocation validates clean
// ═══════════════════════════════════════════════════════════════════

const REAL_INVOCATIONS = [
  ['nfl'],
  ['advstats'],
  ['gamelogs'],
  ['schedule'],
  ['teamcontext'],
  ['roster'],
  ['oline'],
  ['playerids'],
  ['draft'],
  ['ktc'],
  ['playerstate'],
  ['nfl', '--year', '2023', '--dry-run'],
];

for (const argv of REAL_INVOCATIONS) {
  test(`parseAndValidateArgs: real invocation ${JSON.stringify(argv)} validates clean`, () => {
    assert.doesNotThrow(() => parseAndValidateArgs(argv));
  });
}

// ═══════════════════════════════════════════════════════════════════
// Help-surface binding — every `-`-prefixed token in printHelp()'s full
// text must equal KNOWN_FLAGS ∪ KNOWN_OPTIONS.
// ═══════════════════════════════════════════════════════════════════

test('parseAndValidateArgs: KNOWN_FLAGS ∪ KNOWN_OPTIONS matches every -prefixed token in printHelp()', () => {
  const source = fs.readFileSync(new URL('../bin/update.mjs', import.meta.url), 'utf8');
  const helpMatch = source.match(/function printHelp\(\) \{\s*console\.log\(`([\s\S]*?)`\);\s*\}/);
  assert.ok(helpMatch, 'could not locate printHelp() template literal in bin/update.mjs');
  const helpText = helpMatch[1];

  const tokens = new Set(helpText.match(/(?<!\S)-{1,2}[a-zA-Z][\w-]*/g) ?? []);
  const known = new Set([...KNOWN_FLAGS, ...KNOWN_OPTIONS]);

  // --help/-h are deliberately absent from printHelp()'s documented surface — they're known
  // (so the validator doesn't reject them) but making `nfl --help` actually print help is a UX
  // improvement that's explicitly out of scope for this slice. Every OTHER known token must be
  // documented, and every documented token must be known — that's the drift this test guards.
  const undocumentedInKnown = [...known].filter(k => !tokens.has(k) && k !== '-h' && k !== '--help');
  const unknownInHelp = [...tokens].filter(t => !known.has(t));

  assert.deepEqual(unknownInHelp, [], `printHelp() documents tokens missing from KNOWN_FLAGS/KNOWN_OPTIONS: ${unknownInHelp.join(', ')}`);
  assert.deepEqual(undocumentedInKnown, [], `KNOWN set has tokens printHelp() never documents: ${undocumentedInKnown.join(', ')}`);
});
