/**
 * test/capture-target.test.mjs — lib/capture-target.mjs (D-76 C1a).
 * CT-1: SNAPSHOT_OUT_PATH unset/empty reproduces today's capture-snapshot write block exactly.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'

import { resolveCaptureTarget, writeCapturedSnapshot } from '../lib/capture-target.mjs'
import { writeJsonStable, writeJsonStableAt, repoPath } from '../lib/io.mjs'

const REPO = '/repo/root'
const DATE = '2026-10-22'
const SNAP = { schemaVersion: 3, players: { a: { nfl_team: 'SF', projection: { projectedGames: 12.5 } } }, inputStatus: { ktc: { count: 1 } } }

function spyDeps() {
  const calls = { stable: [], at: [], step: [] }
  return {
    calls,
    deps: {
      writeJsonStable: (...args) => calls.stable.push(args),
      writeJsonStableAt: (...args) => calls.at.push(args),
      setStepOutput: (...args) => calls.step.push(args),
    },
  }
}

for (const [label, env] of [['unset', {}], ["''", { SNAPSHOT_OUT_PATH: '' }]]) {
  test(`CT-1 (${label}): committed target, identical write calls and step outputs`, () => {
    const target = resolveCaptureTarget({ env, repoRoot: REPO, dateKey: DATE })
    assert.deepEqual(target, { mode: 'committed', relPath: `snapshots/${DATE}.json` })
    const { calls, deps } = spyDeps()
    writeCapturedSnapshot(target, SNAP, deps)
    assert.equal(calls.stable.length, 1)
    assert.deepEqual(calls.stable[0], [`snapshots/${DATE}.json`, SNAP]) // no third argument
    assert.equal(calls.at.length, 0)
    assert.deepEqual(calls.step, [['wrote', 'true'], ['snapshotPath', `snapshots/${DATE}.json`]])
  })
}

test('CT-1: bytes through the real write path equal JSON.stringify(snapshot, null, 2) + newline', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-target-'))
  try {
    const file = path.join(dir, 'out.json')
    const target = resolveCaptureTarget({ env: {}, repoRoot: REPO, dateKey: DATE })
    // Route the real writeJsonStable's serialisation into a temp file (never into the repo).
    writeCapturedSnapshot(target, SNAP, {
      writeJsonStable: (_rel, value) => writeJsonStableAt(file, value),
      writeJsonStableAt,
      setStepOutput: () => {},
    })
    assert.equal(fs.readFileSync(file, 'utf8'), JSON.stringify(SNAP, null, 2) + '\n')
    assert.equal(typeof writeJsonStable, 'function')
    assert.ok(repoPath('snapshots', `${DATE}.json`).endsWith(`snapshots/${DATE}.json`))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('CT-2: absolute out-of-repo path → out target, writeJsonStableAt only, no step outputs', () => {
  const abs = '/tmp/elsewhere/before.json'
  const target = resolveCaptureTarget({ env: { SNAPSHOT_OUT_PATH: abs }, repoRoot: REPO, dateKey: DATE })
  assert.deepEqual(target, { mode: 'out', absPath: abs })
  const { calls, deps } = spyDeps()
  writeCapturedSnapshot(target, SNAP, deps)
  assert.deepEqual(calls.at, [[abs, SNAP]])
  assert.equal(calls.stable.length, 0)
  assert.equal(calls.step.length, 0)
})

test('CT-3: a relative path and an absolute in-repo path both throw', () => {
  assert.throws(() => resolveCaptureTarget({ env: { SNAPSHOT_OUT_PATH: 'out/before.json' }, repoRoot: REPO, dateKey: DATE }), /absolute/)
  assert.throws(() => resolveCaptureTarget({ env: { SNAPSHOT_OUT_PATH: `${REPO}/snapshots/x.json` }, repoRoot: REPO, dateKey: DATE }), /outside the repo/)
})
