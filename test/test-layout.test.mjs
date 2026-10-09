/**
 * test/test-layout.test.mjs — bare `node --test` (package.json `test`) executes every .mjs/.js/.cjs
 * under test/, not just *.test.*. A fixture builder or helper placed there runs on every `npm test`;
 * the fixture builders read `git show <rev>`, which a shallow CI checkout cannot serve. Helpers
 * belong in test-support/, fixture builders in scripts/fixtures/ (README → Smoke test).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));

test('every script under test/ is a *.test file', () => {
  const offenders = fs.readdirSync(TEST_DIR, { recursive: true })
    .filter((rel) => /\.(mjs|js|cjs)$/.test(rel) && !/\.test\.(mjs|js|cjs)$/.test(rel));
  assert.deepEqual(offenders, [], 'move these to test-support/ (helpers) or scripts/fixtures/ (fixture builders)');
});
