import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { readManifest } from '../lib/manifest.mjs';

test('manifest: no retired raw/stats- entries remain', () => {
  const m = readManifest();
  const leftover = Object.keys(m.files).filter(k => k.startsWith('raw/stats-'));
  assert.deepEqual(leftover, [], `unexpected raw/stats entries: ${leftover.length}`);
});

test('manifest: no raw/stats-*.json files on disk', () => {
  const present = fs.readdirSync('raw').filter(f => f.startsWith('stats-'));
  assert.deepEqual(present, [], `unexpected raw/stats files: ${present.length}`);
});
