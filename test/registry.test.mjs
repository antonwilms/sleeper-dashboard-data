/**
 * test/registry.test.mjs — recurrence guard for the cross-repo contract registry's
 * data-side cache fields (anchor-policy.md §5).
 *
 * Every symbol named in a data-side `Data side`/`Triggers` field must resolve — appear as
 * a whole word — in the file the entry names it against. This reds when a symbol is
 * renamed, moved to another file, or deleted; it stays green through insertion, refactor
 * or reordering, because it asserts symbols, never line numbers (§1.3: a line anchor
 * cannot tell a correct statement anchor from a drifted one — this guard sidesteps that
 * distinction entirely by not using line numbers at all).
 *
 * Deliberately skips non-symbol trigger forms the spec authorizes (served-path templates,
 * globs, brace expansions, the generic-loop trigger, prose literals like `idp_*`/`TEAM_*`)
 * — see lib/registry.mjs's `isCodeSymbolSpan`. Deliberately data-side only: the app side
 * names `src/` symbols this repo cannot resolve (§1.5).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  extractRegistryRegion,
  parseEntries,
  dataSideText,
  extractSymbolFileClaims,
  symbolResolvesIn,
} from '../lib/registry.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const readmePath = path.join(repoRoot, 'README.md');

function loadEntries() {
  const text = fs.readFileSync(readmePath, 'utf8');
  const region = extractRegistryRegion(text);
  return parseEntries(region);
}

test('registry: every data-side symbol resolves in the file its entry names', () => {
  const entries = loadEntries();
  assert.ok(entries.length >= 20, `expected at least 20 entries, got ${entries.length} — parser may be broken`);

  const sourceCache = new Map();
  function readFile(relPath) {
    if (sourceCache.has(relPath)) return sourceCache.get(relPath);
    let src = null;
    try {
      src = fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
    } catch {
      src = null;
    }
    sourceCache.set(relPath, src);
    return src;
  }

  const failures = [];
  let checkedClaims = 0;
  for (const entry of entries) {
    const claims = extractSymbolFileClaims(dataSideText(entry));
    for (const { symbol, file } of claims) {
      if (!file) continue; // no file context in this text — not this guard's job to resolve
      const src = readFile(file);
      if (src === null) {
        failures.push(`${entry.id}: file not found — ${file} (claimed for \`${symbol}\`)`);
        continue;
      }
      checkedClaims++;
      if (!symbolResolvesIn(symbol, src)) {
        failures.push(`${entry.id}: \`${symbol}\` does not resolve in ${file}`);
      }
    }
  }

  assert.ok(checkedClaims > 50, `expected >50 resolvable claims, got ${checkedClaims} — guard may be vacuous`);
  assert.deepEqual(failures, [], `${failures.length} data-side symbol(s) failed to resolve:\n${failures.join('\n')}`);
});

test('registry guard: file-scoped resolution catches a symbol present in a sibling file but deleted from its own (STATS_BASE regression)', () => {
  // STATS_BASE is declared independently in both lib/sleeper.mjs and lib/nflverse.mjs; CR-09's
  // trigger is specifically "STATS_BASE in lib/nflverse.mjs". A tree-wide grep would still pass
  // if STATS_BASE were deleted from lib/nflverse.mjs alone (it survives in lib/sleeper.mjs) —
  // this proves the guard checks the NAMED file, not the whole tree.
  const nflverseSrc = fs.readFileSync(path.join(repoRoot, 'lib/nflverse.mjs'), 'utf8');
  const sleeperSrc = fs.readFileSync(path.join(repoRoot, 'lib/sleeper.mjs'), 'utf8');

  assert.ok(symbolResolvesIn('STATS_BASE', nflverseSrc), 'sanity: STATS_BASE currently resolves in lib/nflverse.mjs');
  assert.ok(symbolResolvesIn('STATS_BASE', sleeperSrc), 'sanity: STATS_BASE also exists in lib/sleeper.mjs');

  const nflverseSrcWithoutStatsBase = nflverseSrc.replace(/STATS_BASE/g, 'RENAMED_BASE');
  assert.equal(
    symbolResolvesIn('STATS_BASE', nflverseSrcWithoutStatsBase),
    false,
    'guard must red when STATS_BASE is renamed/deleted from its own file, even though it survives in lib/sleeper.mjs'
  );
});
