/**
 * test/capture-target.test.mjs — lib/capture-target.mjs (D-76 C1a).
 * CT-1: SNAPSHOT_OUT_PATH unset/empty reproduces today's capture-snapshot write block exactly.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'

import { resolveCaptureTarget, writeCapturedSnapshot, emitsStepOutputs, shouldSkipCommitted } from '../lib/capture-target.mjs'
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

test('CT-1: bytes through the real writeJsonStable equal JSON.stringify(snapshot, null, 2) + newline', () => {
  const rel = `test-ct1-${process.pid}-${Date.now()}.json`
  try {
    writeJsonStable(rel, SNAP)
    assert.equal(fs.readFileSync(repoPath(rel), 'utf8'), JSON.stringify(SNAP, null, 2) + '\n')
  } finally {
    fs.rmSync(repoPath(rel), { force: true })
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
  // a sibling segment that merely starts with ".." is still inside the repo
  assert.throws(() => resolveCaptureTarget({ env: { SNAPSHOT_OUT_PATH: `${REPO}/..x/out.json` }, repoRoot: REPO, dateKey: DATE }), /outside the repo/)
  // a real parent-relative path is outside
  assert.deepEqual(
    resolveCaptureTarget({ env: { SNAPSHOT_OUT_PATH: `${REPO}/../x.json` }, repoRoot: REPO, dateKey: DATE }),
    { mode: 'out', absPath: `${REPO}/../x.json` },
  )
})

test('CT-4: emitsStepOutputs is true for unset and empty, false for any non-empty value', () => {
  assert.equal(emitsStepOutputs({}), true)
  assert.equal(emitsStepOutputs({ SNAPSHOT_OUT_PATH: '' }), true)
  assert.equal(emitsStepOutputs({ SNAPSHOT_OUT_PATH: '/tmp/x.json' }), false)
  assert.equal(emitsStepOutputs({ SNAPSHOT_OUT_PATH: 'relative' }), false)
})

test('CT-5: shouldSkipCommitted only for a committed target whose path exists; exists unused for out', () => {
  const committed = { mode: 'committed', relPath: `snapshots/${DATE}.json` }
  const seen = []
  assert.equal(shouldSkipCommitted(committed, (p) => { seen.push(p); return true }), true)
  assert.deepEqual(seen, [committed.relPath])
  assert.equal(shouldSkipCommitted(committed, () => false), false)
  const out = { mode: 'out', absPath: '/tmp/x.json' }
  assert.equal(shouldSkipCommitted(out, () => { throw new Error('exists must not be consulted') }), false)
})
