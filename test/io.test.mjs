import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { setStepOutput, writeJsonStable, writeJsonStableAt, repoPath } from '../lib/io.mjs';

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

test('writeJsonStable: default is 2-space pretty-printed with trailing newline', () => {
  const rel = `.tmp-test-io-pretty-${process.pid}.json`;
  const abs = repoPath(rel);
  try {
    writeJsonStable(rel, { b: 2, a: 1 });
    const raw = fs.readFileSync(abs, 'utf8');
    assert.equal(raw, '{\n  "b": 2,\n  "a": 1\n}\n');
  } finally {
    fs.rmSync(abs, { force: true });
  }
});

test('writeJsonStable: minify:true writes no whitespace (still trailing newline)', () => {
  const rel = `.tmp-test-io-minify-${process.pid}.json`;
  const abs = repoPath(rel);
  try {
    writeJsonStable(rel, { b: 2, a: 1 }, { minify: true });
    const raw = fs.readFileSync(abs, 'utf8');
    assert.equal(raw, '{"b":2,"a":1}\n');
  } finally {
    fs.rmSync(abs, { force: true });
  }
});

test('writeJsonStable: minify:true round-trips to the same value as the pretty default', () => {
  const rel = `.tmp-test-io-roundtrip-${process.pid}.json`;
  const abs = repoPath(rel);
  const value = { nested: { a: [1, 2, 3], b: null }, s: 'x' };
  try {
    writeJsonStable(rel, value, { minify: true });
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(abs, 'utf8')), value);
  } finally {
    fs.rmSync(abs, { force: true });
  }
});

test('IO-1: writeJsonStableAt writes the same bytes as writeJsonStable (pretty and minified) at the absolute path given', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'io1-'));
  const rel = `test-io1-${process.pid}-${Date.now()}.json`;
  const value = { b: [1, 2, { c: 3 }], a: 'x' };
  try {
    const written = [];
    for (const minify of [false, true]) {
      writeJsonStable(rel, value, { minify });
      const viaRel = fs.readFileSync(repoPath(rel));
      const abs = path.join(dir, 'nested', `out-${minify}.json`);
      writeJsonStableAt(abs, value, { minify });
      written.push(abs);
      assert.ok(fs.readFileSync(abs).equals(viaRel), `bytes differ (minify=${minify})`);
      assert.equal(fs.readFileSync(abs, 'utf8').endsWith('\n'), true);
    }
    for (const abs of written) {
      assert.equal(fs.existsSync(repoPath(abs)), false, `absolute path was rebased under the repo: ${abs}`);
    }
  } finally {
    fs.rmSync(repoPath(rel), { force: true });
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
