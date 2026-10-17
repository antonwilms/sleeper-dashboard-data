/**
 * test/registry.test.mjs — the data half of the cross-repo contract index check.
 *
 * The index is the app repo's docs/cross-repo-registry.md (../CLAUDE.md → Cross-repo rule). Every
 * symbol an entry's `Data` field names must resolve — appear as a whole word — in the data-repo
 * file it is grouped under, every `Data` file must exist, and every `test/` path in a `Tests`
 * field must exist. Asserts symbols, never line numbers. The app's
 * src/__tests__/crossRepoIndex.test.js checks the App half, the ids and the size cap.
 *
 * The index lives in the sibling checkout. Locally an absent sibling FAILS — say so, never assume.
 * In GitHub Actions (smoke-test.yml checks out this repo only) it skips with that reason.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.resolve(repoRoot, '..', 'sleeper-dashboard', 'docs', 'cross-repo-registry.md');
const GROUP_RE = /^`([^`]+)`(?: \((`[^`]+`(?:, `[^`]+`)*)\))?$/;
const isRetired = (e) => / — retired \d{4}-\d{2}-\d{2}$/.test(e.title);

export function parseIndex(text) {
  const entries = [];
  let current = null;
  for (const line of text.split('\n')) {
    const header = line.match(/^#### (CR-\d+) · (.+)$/);
    if (header) {
      current = { id: header[1], title: header[2], fields: {} };
      entries.push(current);
      continue;
    }
    const field = current && line.match(/^- \*\*([A-Za-z]+):\*\* (.+)$/);
    if (field) current.fields[field[1]] = field[2];
  }
  return entries;
}

export function parseGroups(value) {
  if (value === 'none') return [];
  return value.split('; ').map((group) => {
    const m = group.match(GROUP_RE);
    if (!m) throw new Error(`malformed site group: ${group}`);
    const symbols = m[2] ? [...m[2].matchAll(/`([^`]+)`/g)].map((s) => s[1]) : [];
    return { file: m[1], symbols };
  });
}

/** Whole-word match: does `symbol` appear anywhere in `source`? (declaration or reference.) */
export function symbolResolvesIn(symbol, source) {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`).test(source);
}

/** Check, skip (CI without the sibling) or fail (local without the sibling). */
export function siblingDecision({ exists, inActions }) {
  if (exists) return { kind: 'check' };
  if (inActions) {
    return { kind: 'skip', reason: 'app index not checked out in GitHub Actions — Data sites are verified by local npm test only' };
  }
  return {
    kind: 'fail',
    reason: `sibling app repo not on disk (no ${indexPath}) — say so in the hand-back; never assume its contents (../CLAUDE.md → Cross-repo rule)`,
  };
}

// ---------------------------------------------------------------------------
// Always-on unit tests (no sibling access)
// ---------------------------------------------------------------------------

test('registry: siblingDecision checks when present, skips only in Actions, fails locally', () => {
  assert.equal(siblingDecision({ exists: true, inActions: false }).kind, 'check');
  assert.equal(siblingDecision({ exists: true, inActions: true }).kind, 'check');
  assert.equal(siblingDecision({ exists: false, inActions: true }).kind, 'skip');
  assert.equal(siblingDecision({ exists: false, inActions: false }).kind, 'fail');
});

test('registry: parses only the documented site grammar', () => {
  assert.deepEqual(parseGroups('none'), []);
  assert.deepEqual(parseGroups('`a.mjs` (`x`, `y`); `b.md`'), [
    { file: 'a.mjs', symbols: ['x', 'y'] },
    { file: 'b.md', symbols: [] },
  ]);
  assert.throws(() => parseGroups('`a.mjs` (x)'), /malformed/);
  assert.throws(() => parseGroups('see `a.mjs`'), /malformed/);
});

test('registry guard: file-scoped resolution catches a symbol present in a sibling file but deleted from its own (STATS_BASE regression)', () => {
  // STATS_BASE is declared independently in both lib/sleeper.mjs and lib/nflverse.mjs. A tree-wide
  // grep would still pass if STATS_BASE were deleted from lib/nflverse.mjs alone (it survives in
  // lib/sleeper.mjs) — this proves the guard checks the NAMED file, not the whole tree.
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

// ---------------------------------------------------------------------------
// Index checks (read the sibling app repo's index — read-only)
// ---------------------------------------------------------------------------

const decision = siblingDecision({ exists: fs.existsSync(indexPath), inActions: process.env.GITHUB_ACTIONS === 'true' });
const indexOpts = { skip: decision.kind === 'skip' ? decision.reason : false };

function liveEntries() {
  return parseIndex(fs.readFileSync(indexPath, 'utf8')).filter((e) => !isRetired(e));
}

test('registry: every Data site in the cross-repo index resolves in this repo', indexOpts, () => {
  if (decision.kind === 'fail') return assert.fail(decision.reason);
  const entries = liveEntries();
  assert.ok(entries.length >= 25, `expected at least 25 live entries, got ${entries.length} — parser may be broken`);

  const failures = [];
  let checkedClaims = 0;
  for (const entry of entries) {
    if (entry.fields.Data === undefined) {
      failures.push(`${entry.id}: no Data field`);
      continue;
    }
    for (const { file, symbols } of parseGroups(entry.fields.Data)) {
      const full = path.join(repoRoot, file);
      if (!fs.existsSync(full)) {
        failures.push(`${entry.id}: file not found — ${file}`);
        continue;
      }
      const src = fs.readFileSync(full, 'utf8');
      for (const symbol of symbols) {
        checkedClaims++;
        if (!symbolResolvesIn(symbol, src)) failures.push(`${entry.id}: \`${symbol}\` does not resolve in ${file}`);
      }
    }
  }

  assert.ok(checkedClaims >= 25, `expected >=25 resolvable claims, got ${checkedClaims} — guard may be vacuous`);
  assert.deepEqual(failures, [], `${failures.length} Data site(s) failed to resolve:\n${failures.join('\n')}`);
});

test('registry: every data test the cross-repo index names exists', indexOpts, () => {
  if (decision.kind === 'fail') return assert.fail(decision.reason);
  const missing = liveEntries()
    .flatMap((e) => (e.fields.Tests ? parseGroups(e.fields.Tests).map((g) => `${e.id}: ${g.file}`) : []))
    .filter((s) => s.split(': ')[1].startsWith('test/'))
    .filter((s) => !fs.existsSync(path.join(repoRoot, s.split(': ')[1])));
  assert.deepEqual(missing, []);
});
