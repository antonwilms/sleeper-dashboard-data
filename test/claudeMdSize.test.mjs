/**
 * test/claudeMdSize.test.mjs — CLAUDE.md auto-loads into every session in this repo, so its
 * size is a per-session tax. This is the gate that keeps it from creeping back.
 *
 * statSync().size is exact bytes on disk. readFileSync(...).length would be UTF-16 code units
 * and undercounts every non-ASCII character — and this file is full of —, →, ≥, ·, ½.
 * The two differ by ~2,800 here, which is more than the whole margin.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const claudeMdPath = path.join(__dirname, '..', 'CLAUDE.md');

const CEILING = 25000;

test('CLAUDE.md: exists at the repo root', () => {
  assert.ok(fs.existsSync(claudeMdPath), 'CLAUDE.md is missing from the repo root');
});

test('CLAUDE.md: is at or under the 25,000-byte ceiling', () => {
  const size = fs.statSync(claudeMdPath).size;
  assert.ok(
    size <= CEILING,
    `CLAUDE.md is ${size} bytes; the ceiling is ${CEILING} (over by ${size - CEILING}).\n` +
      'CLAUDE.md is auto-loaded into every session in this repo, so its size is a\n' +
      'per-session tax. Do not raise this ceiling.\n' +
      'Per-file detail belongs in README.md → Module notes. Per-family coverage belongs\n' +
      "in data-catalog.md. A trap specific to one script belongs in that script's own\n" +
      'header comment. Prune in this same commit.'
  );
});
