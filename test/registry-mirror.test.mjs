/**
 * test/registry-mirror.test.mjs — the registry drift check (CR-24).
 *
 * The cross-repo registry's mirrored span (between the CR-REGISTRY sentinel lines) must be
 * byte-identical in this repo's cross-repo-registry.md and the app repo's
 * docs/cross-repo-registry.md. The structural half (RM-U/RM-S) runs in every `npm test`,
 * locally and in CI, and never reads the sibling tree. The cross-repo half (RM-X) only runs
 * with REGISTRY_MIRROR=1 — set by registry-mirror.yml — and then a missing/wrong sibling
 * FAILS rather than silently skipping, so this check cannot pass by comparing nothing.
 *
 * Run locally: REGISTRY_MIRROR=1 node --test test/registry-mirror.test.mjs
 * (compares working trees — both checkouts should be on `main`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { REGISTRY_BEGIN, REGISTRY_END, extractRegistryRegion, parseEntries } from '../lib/registry.mjs';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_REGISTRY_REL = 'cross-repo-registry.md';
const APP_REGISTRY_REL = 'docs/cross-repo-registry.md';
const APP_PACKAGE_NAME = 'sleeper-dashboard';
const appDir = path.resolve(repoRoot, '..', 'sleeper-dashboard');

/** Split on sentinel lines matched exactly (sed `^…$` semantics: no trim, no \r strip). */
export function extractMirroredSpan(text, label) {
  const lines = text.split('\n');
  const beginIdx = [];
  const endIdx = [];
  lines.forEach((line, i) => {
    if (line === REGISTRY_BEGIN) beginIdx.push(i);
    if (line === REGISTRY_END) endIdx.push(i);
  });
  if (beginIdx.length !== 1 || endIdx.length !== 1) {
    throw new Error(
      `${label}: expected exactly one BEGIN and one END sentinel line, found BEGIN×${beginIdx.length} END×${endIdx.length}`
    );
  }
  const b = beginIdx[0];
  const e = endIdx[0];
  if (e < b) {
    throw new Error(`${label}: END sentinel (line ${e + 1}) precedes BEGIN (line ${b + 1})`);
  }
  return lines.slice(b, e + 1).join('\n');
}

const ENTRY_HEADER_RE = /^#### (CR-\d+)/;

/** First differing line between two span texts, or null if identical. */
export function firstDifference(a, b) {
  if (a === b) return null;
  const aLines = a.split('\n');
  const bLines = b.split('\n');
  const maxLen = Math.max(aLines.length, bLines.length);
  let diffIdx = -1;
  for (let i = 0; i < maxLen; i++) {
    if (aLines[i] !== bLines[i]) {
      diffIdx = i;
      break;
    }
  }
  let entry = '(entry format block)';
  for (let i = diffIdx; i >= 0; i--) {
    const m = (aLines[i] ?? '').match(ENTRY_HEADER_RE);
    if (m) {
      entry = m[1];
      break;
    }
  }
  const truncate = (s) => (s.length > 300 ? s.slice(0, 300) : s);
  return {
    line: diffIdx + 1,
    a: diffIdx < aLines.length ? truncate(aLines[diffIdx]) : '<missing>',
    b: diffIdx < bLines.length ? truncate(bLines[diffIdx]) : '<missing>',
    entry,
  };
}

const SED_RANGE_RE = /sed -n '\/\^<!-- CR-REGISTRY-BEGIN -->\$\/,\/\^<!-- CR-REGISTRY-END -->\$\/p' ([^\s)]+)/g;

/** The two file paths named by the app's documented drift-check `sed` range lines. */
export function parseDocumentedDiffPaths(text) {
  const matches = [...text.matchAll(SED_RANGE_RE)].map((m) => m[1]);
  if (matches.length !== 2) {
    throw new Error(`documented drift command: expected exactly 2 sed range lines, found ${matches.length}`);
  }
  return matches;
}

function readPackageName(dir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    return pkg.name ?? null;
  } catch {
    return null;
  }
}

/**
 * Decide whether the cross-repo tests compare, skip, or fail — without ever reading the
 * sibling tree unless REGISTRY_MIRROR=1. `readPackageName` is a thunk so a plain `npm test`
 * never touches the sibling.
 */
export function siblingDecision({ mode, readPackageName }) {
  if (mode === undefined || mode === '') {
    return {
      kind: 'skip',
      reason: 'REGISTRY_MIRROR not set — cross-repo span comparison not run. Run: REGISTRY_MIRROR=1 node --test test/registry-mirror.test.mjs',
    };
  }
  if (mode !== '1') {
    return { kind: 'fail', reason: `REGISTRY_MIRROR must be "1" or unset, got "${mode}"` };
  }
  const name = readPackageName();
  if (name === null) {
    return { kind: 'fail', reason: `REGISTRY_MIRROR=1 but no sibling app repo at ${appDir} (no readable package.json)` };
  }
  if (name !== APP_PACKAGE_NAME) {
    return { kind: 'fail', reason: `REGISTRY_MIRROR=1 but ${appDir} is package "${name}", not "${APP_PACKAGE_NAME}"` };
  }
  return { kind: 'compare' };
}

// ---------------------------------------------------------------------------
// RM-U: always-on unit tests (no sibling access)
// ---------------------------------------------------------------------------

test('RM-U1: extracts the sentinel-delimited span', () => {
  const text = 'intro\n<!-- CR-REGISTRY-BEGIN -->\nbody\n<!-- CR-REGISTRY-END -->\nouter';
  assert.equal(extractMirroredSpan(text, 'x'), '<!-- CR-REGISTRY-BEGIN -->\nbody\n<!-- CR-REGISTRY-END -->');
});

test('RM-U2: an inline sentinel mention before the real BEGIN does not confuse extraction', () => {
  const text =
    'intro\nProse mentions `<!-- CR-REGISTRY-BEGIN -->` inline.\n<!-- CR-REGISTRY-BEGIN -->\nbody\n<!-- CR-REGISTRY-END -->\nouter';
  assert.equal(extractMirroredSpan(text, 'x'), '<!-- CR-REGISTRY-BEGIN -->\nbody\n<!-- CR-REGISTRY-END -->');
});

test('RM-U3: no sentinels throws BEGIN×0 END×0, never returns empty string', () => {
  const texts = ['# README\nno sentinels here\n', 'totally different text\nwith no markers\n'];
  for (const text of texts) {
    assert.throws(() => extractMirroredSpan(text, 'x'), /BEGIN×0 END×0/);
  }
});

test('RM-U4: two BEGIN lines and one END throws BEGIN×2 END×1', () => {
  const text = '<!-- CR-REGISTRY-BEGIN -->\na\n<!-- CR-REGISTRY-BEGIN -->\nb\n<!-- CR-REGISTRY-END -->';
  assert.throws(() => extractMirroredSpan(text, 'x'), /BEGIN×2 END×1/);
});

test('RM-U5: END before BEGIN throws precedes BEGIN', () => {
  const text = '<!-- CR-REGISTRY-END -->\nbody\n<!-- CR-REGISTRY-BEGIN -->';
  assert.throws(() => extractMirroredSpan(text, 'x'), /precedes BEGIN/);
});

test('RM-U6: \\r\\n line endings do not match the sentinel lines', () => {
  const text = 'intro\r\n<!-- CR-REGISTRY-BEGIN -->\r\nbody\r\n<!-- CR-REGISTRY-END -->\r\nouter';
  assert.throws(() => extractMirroredSpan(text, 'x'), /BEGIN×0 END×0/);
});

test('RM-U7: firstDifference(x, x) is null', () => {
  const x = 'a\nb\nc';
  assert.equal(firstDifference(x, x), null);
});

test('RM-U8: a trailing-space difference is located at its line, under the nearest CR- entry', () => {
  const a = 'format-block line\n#### CR-01 · X\n- **Triggers:** foo';
  const b = 'format-block line\n#### CR-01 · X\n- **Triggers:** foo ';
  const diff = firstDifference(a, b);
  assert.equal(diff.line, 3);
  assert.equal(diff.entry, 'CR-01');
});

test('RM-U9: an extra final line reports the shorter side as <missing>', () => {
  const b = 'line1\nline2';
  const a = 'line1\nline2\nline3';
  const diff = firstDifference(a, b);
  assert.equal(diff.line, 3);
  assert.equal(diff.b, '<missing>');
});

test('RM-U10: a difference above the first #### CR- line reports the entry format block', () => {
  const a = 'header line one\nheader line two';
  const b = 'header line one\nheader line DIFFERENT';
  const diff = firstDifference(a, b);
  assert.equal(diff.entry, '(entry format block)');
});

test('RM-U11: parses the A4 two-line documented diff command', () => {
  const text = [
    "diff <(sed -n '/^<!-- CR-REGISTRY-BEGIN -->$/,/^<!-- CR-REGISTRY-END -->$/p' docs/cross-repo-registry.md) \\",
    "     <(sed -n '/^<!-- CR-REGISTRY-BEGIN -->$/,/^<!-- CR-REGISTRY-END -->$/p' ../sleeper-dashboard-data/cross-repo-registry.md)",
  ].join('\n');
  assert.deepEqual(parseDocumentedDiffPaths(text), [
    'docs/cross-repo-registry.md',
    '../sleeper-dashboard-data/cross-repo-registry.md',
  ]);
});

test('RM-U12: parses the pre-A4 (stale README.md) documented diff command', () => {
  const text = [
    "diff <(sed -n '/^<!-- CR-REGISTRY-BEGIN -->$/,/^<!-- CR-REGISTRY-END -->$/p' docs/cross-repo-registry.md) \\",
    "     <(sed -n '/^<!-- CR-REGISTRY-BEGIN -->$/,/^<!-- CR-REGISTRY-END -->$/p' ../sleeper-dashboard-data/README.md)",
  ].join('\n');
  assert.deepEqual(parseDocumentedDiffPaths(text), [
    'docs/cross-repo-registry.md',
    '../sleeper-dashboard-data/README.md',
  ]);
});

test('RM-U13: a wrong count of sed range lines throws "expected exactly 2"', () => {
  const one = "sed -n '/^<!-- CR-REGISTRY-BEGIN -->$/,/^<!-- CR-REGISTRY-END -->$/p' a.md";
  const three = [one, one, one].join('\n');
  assert.throws(() => parseDocumentedDiffPaths('no sed lines here'), /expected exactly 2/);
  assert.throws(() => parseDocumentedDiffPaths(one), /expected exactly 2/);
  assert.throws(() => parseDocumentedDiffPaths(three), /expected exactly 2/);
});

test('RM-U14: siblingDecision covers every mode without reading the sibling unless REGISTRY_MIRROR=1', () => {
  function spy(returnValue) {
    const s = { calls: 0 };
    s.thunk = () => {
      s.calls++;
      return returnValue;
    };
    return s;
  }

  let s = spy(APP_PACKAGE_NAME);
  let d = siblingDecision({ mode: undefined, readPackageName: s.thunk });
  assert.equal(d.kind, 'skip');
  assert.match(d.reason, /REGISTRY_MIRROR=1 node --test/);
  assert.equal(s.calls, 0);

  s = spy(APP_PACKAGE_NAME);
  d = siblingDecision({ mode: '', readPackageName: s.thunk });
  assert.equal(d.kind, 'skip');
  assert.equal(s.calls, 0);

  s = spy(APP_PACKAGE_NAME);
  d = siblingDecision({ mode: 'true', readPackageName: s.thunk });
  assert.equal(d.kind, 'fail');
  assert.match(d.reason, /must be "1" or unset/);
  assert.equal(s.calls, 0);

  s = spy(APP_PACKAGE_NAME);
  d = siblingDecision({ mode: '0', readPackageName: s.thunk });
  assert.equal(d.kind, 'fail');
  assert.match(d.reason, /must be "1" or unset/);
  assert.equal(s.calls, 0);

  s = spy(null);
  d = siblingDecision({ mode: '1', readPackageName: s.thunk });
  assert.equal(d.kind, 'fail');
  assert.match(d.reason, /no sibling app repo/);
  assert.equal(s.calls, 1);

  s = spy('some-other-package');
  d = siblingDecision({ mode: '1', readPackageName: s.thunk });
  assert.equal(d.kind, 'fail');
  assert.match(d.reason, /is package "some-other-package"/);
  assert.equal(s.calls, 1);

  s = spy(APP_PACKAGE_NAME);
  d = siblingDecision({ mode: '1', readPackageName: s.thunk });
  assert.equal(d.kind, 'compare');
  assert.equal(s.calls, 1);
});

// ---------------------------------------------------------------------------
// RM-S: on the real data file (no sibling access)
// ---------------------------------------------------------------------------

test('RM-S1: the data registry file exists, has one sentinel pair, and parses to >=20 entries', () => {
  const text = fs.readFileSync(path.join(repoRoot, DATA_REGISTRY_REL), 'utf8');
  const span = extractMirroredSpan(text, DATA_REGISTRY_REL);
  const entries = parseEntries(span);
  assert.ok(entries.length >= 20, `expected at least 20 entries, got ${entries.length}`);
});

test('RM-S2: no other top-level *.md file has a stray sentinel line', () => {
  const offenders = [];
  for (const name of fs.readdirSync(repoRoot)) {
    if (!name.endsWith('.md')) continue;
    if (name === DATA_REGISTRY_REL) continue;
    const full = path.join(repoRoot, name);
    if (!fs.statSync(full).isFile()) continue;
    const lines = fs.readFileSync(full, 'utf8').split('\n');
    if (lines.includes(REGISTRY_BEGIN) || lines.includes(REGISTRY_END)) {
      offenders.push(name);
    }
  }
  assert.deepEqual(offenders, [], `unexpected sentinel line(s) found in: ${offenders.join(', ')}`);
});

test('RM-S3: extractRegistryRegion agrees with extractMirroredSpan on the data file (F8 pin)', () => {
  const text = fs.readFileSync(path.join(repoRoot, DATA_REGISTRY_REL), 'utf8');
  assert.equal(extractRegistryRegion(text), extractMirroredSpan(text, DATA_REGISTRY_REL));
});

// ---------------------------------------------------------------------------
// RM-X: cross-repo tests (REGISTRY_MIRROR=1 only)
// ---------------------------------------------------------------------------

const decision = siblingDecision({ mode: process.env.REGISTRY_MIRROR, readPackageName: () => readPackageName(appDir) });
const testOpts = { skip: decision.kind === 'skip' ? decision.reason : false };

test('RM-X1: the app registry file exists and is readable', testOpts, () => {
  if (decision.kind === 'fail') return assert.fail(decision.reason);
  const appRegistryPath = path.join(appDir, APP_REGISTRY_REL);
  assert.ok(
    fs.existsSync(appRegistryPath),
    `sibling present at ${appDir} but ${APP_REGISTRY_REL} is missing — registry moved or renamed? Update this test and both registry docs together (CR-24)`
  );
});

test('RM-X2: the app span extracts and parses to >=20 entries', testOpts, () => {
  if (decision.kind === 'fail') return assert.fail(decision.reason);
  const appText = fs.readFileSync(path.join(appDir, APP_REGISTRY_REL), 'utf8');
  const appSpan = extractMirroredSpan(appText, 'app ' + APP_REGISTRY_REL);
  const entries = parseEntries(appSpan);
  assert.ok(entries.length >= 20, `expected at least 20 entries, got ${entries.length}`);
});

test('RM-X3: the mirrored span is byte-identical between data and app copies', testOpts, () => {
  if (decision.kind === 'fail') return assert.fail(decision.reason);
  const dataText = fs.readFileSync(path.join(repoRoot, DATA_REGISTRY_REL), 'utf8');
  const appText = fs.readFileSync(path.join(appDir, APP_REGISTRY_REL), 'utf8');
  const dataSpan = extractMirroredSpan(dataText, DATA_REGISTRY_REL);
  const appSpan = extractMirroredSpan(appText, 'app ' + APP_REGISTRY_REL);
  const diff = firstDifference(dataSpan, appSpan);
  if (diff) {
    assert.fail(
      `mirrored span differs at span line ${diff.line} (${diff.entry}):\n  data: ${diff.a}\n  app:  ${diff.b}\nSync the data copy from the app copy via the two-session route — never edit one side alone.`
    );
  }
});

test('RM-X4: the app documented drift command resolves to exactly these two files', testOpts, () => {
  if (decision.kind === 'fail') return assert.fail(decision.reason);

  const appRegistryPath = path.join(appDir, APP_REGISTRY_REL);
  if (!fs.existsSync(appRegistryPath)) {
    assert.fail(`expected app registry ${appRegistryPath} does not exist — registry moved or renamed? (CR-24)`);
  }
  const dataRegistryPath = path.join(repoRoot, DATA_REGISTRY_REL);
  if (!fs.existsSync(dataRegistryPath)) {
    assert.fail(`expected data registry ${dataRegistryPath} does not exist — registry moved or renamed? (CR-24)`);
  }

  const appText = fs.readFileSync(appRegistryPath, 'utf8');
  const [p1, p2] = parseDocumentedDiffPaths(appText);

  const expectedApp = fs.realpathSync(appRegistryPath);
  const expectedData = fs.realpathSync(dataRegistryPath);

  const abs1 = path.resolve(appDir, p1);
  if (!fs.existsSync(abs1)) {
    assert.fail(`app drift command path "${p1}" resolves to ${abs1} which does not exist`);
  }
  const real1 = fs.realpathSync(abs1);
  if (real1 !== expectedApp) {
    assert.fail(`app drift command path "${p1}" resolves to ${real1}, but this test compares ${expectedApp}`);
  }

  const abs2 = path.resolve(appDir, p2);
  if (!fs.existsSync(abs2)) {
    assert.fail(`app drift command path "${p2}" resolves to ${abs2} which does not exist`);
  }
  const real2 = fs.realpathSync(abs2);
  if (real2 !== expectedData) {
    assert.fail(`app drift command path "${p2}" resolves to ${real2}, but this test compares ${expectedData}`);
  }
});
