import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { setStepOutput } from '../lib/io.mjs';

test('setStepOutput: no-op + false when GITHUB_OUTPUT unset', () => {
  const prev = process.env.GITHUB_OUTPUT;
  delete process.env.GITHUB_OUTPUT;
  try {
    assert.equal(setStepOutput('season', 2025), false);
  } finally {
    if (prev !== undefined) process.env.GITHUB_OUTPUT = prev;
  }
});

test('setStepOutput: appends name=value (coerces number) and accumulates', () => {
  const prev = process.env.GITHUB_OUTPUT;
  const tmp = path.join(os.tmpdir(), `gho-${process.pid}-${Date.now()}`);
  process.env.GITHUB_OUTPUT = tmp;
  try {
    assert.equal(setStepOutput('season', 2025), true);
    setStepOutput('foo', 'bar');
    assert.equal(fs.readFileSync(tmp, 'utf8'), 'season=2025\nfoo=bar\n');
  } finally {
    fs.rmSync(tmp, { force: true });
    if (prev !== undefined) process.env.GITHUB_OUTPUT = prev;
    else delete process.env.GITHUB_OUTPUT;
  }
});
