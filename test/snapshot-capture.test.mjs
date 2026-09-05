/**
 * test/snapshot-capture.test.mjs — Unit tests for the D1b commit gate (lib/snapshot-capture.mjs).
 *
 * Run with: node --test (or npm test)
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'

import { evaluateSnapshotRecord, KTC_COUNT_FLOOR, DEPTH_CHART_COUNT_FLOOR, PLAYERS_COUNT_FLOOR } from '../lib/snapshot-capture.mjs'
import { registerSnapshots } from '../scripts/register-snapshots.mjs'
import { readManifest } from '../lib/manifest.mjs'
import { repoPath, writeJsonStable } from '../lib/io.mjs'

// ─── Fixture builder ──────────────────────────────────────────────────────────

function makePlayers(count) {
  const players = {}
  for (let i = 0; i < count; i++) players[`p${i}`] = { nfl_team: 'SF' }
  return players
}

/** A valid, accepted v3 record — override any field/inputStatus entry per test. */
function makeRecord(overrides = {}) {
  const {
    schemaVersion = 3,
    targetSeason = 2026,
    playerCount = PLAYERS_COUNT_FLOOR + 1,
    college = { loaded: true, count: 100 },
    nflDraft = { loaded: true, count: 50, detail: { years: [2024, 2025, 2026], matched: 10 } },
    ktc = { loaded: true, count: KTC_COUNT_FLOOR + 1, detail: { rows: 500 } },
    priorSnapshotTeams = { loaded: false, count: 0 },
    depthChart = { loaded: true, count: DEPTH_CHART_COUNT_FLOOR + 1 },
    careerStats = { loaded: true, count: 14, detail: { seasons: [], provenance: {} } },
  } = overrides

  return {
    data: {
      schemaVersion,
      capturedAt: '2026-09-06T16:29:00.000Z',
      targetSeason,
      players: makePlayers(playerCount),
      inputStatus: { college, nflDraft, ktc, priorSnapshotTeams, depthChart, careerStats },
    },
  }
}

// ─── 1. Accepts a valid v3 record ─────────────────────────────────────────────

test('evaluateSnapshotRecord: accepts a valid v3 record and returns the registrable snapshot', () => {
  const record = makeRecord()
  const result = evaluateSnapshotRecord(record, { now: new Date('2026-09-06T16:29:00Z') })
  assert.equal(result.ok, true)
  assert.equal(result.snapshot, record.data)
})

// ─── 2. Each gate condition rejects separately, with a distinguishable reason ─

test('evaluateSnapshotRecord: rejects with missing-record when record is null', () => {
  assert.deepEqual(evaluateSnapshotRecord(null), { ok: false, reason: 'missing-record' })
})

test('evaluateSnapshotRecord: rejects with missing-record when record.data is absent', () => {
  assert.deepEqual(evaluateSnapshotRecord({}), { ok: false, reason: 'missing-record' })
})

test('evaluateSnapshotRecord: rejects a v2 envelope (schemaVersion 2) — no inputStatus to gate on', () => {
  const record = makeRecord({ schemaVersion: 2 })
  const result = evaluateSnapshotRecord(record)
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'schema-version-below-3')
})

test('evaluateSnapshotRecord: rejects when college.loaded === false', () => {
  const record = makeRecord({ college: { loaded: false, count: 0 } })
  const result = evaluateSnapshotRecord(record, { now: new Date('2026-09-06T16:29:00Z') })
  assert.deepEqual(result, { ok: false, reason: 'college-not-loaded' })
})

test('evaluateSnapshotRecord: rejects when nflDraft.loaded === false', () => {
  const record = makeRecord({ nflDraft: { loaded: false, count: 0, detail: { years: [], matched: 0 } } })
  const result = evaluateSnapshotRecord(record, { now: new Date('2026-09-06T16:29:00Z') })
  assert.deepEqual(result, { ok: false, reason: 'nfldraft-not-loaded' })
})

test('evaluateSnapshotRecord: rejects when detail.years is missing targetSeason (September, post-draft)', () => {
  const record = makeRecord({
    targetSeason: 2026,
    nflDraft: { loaded: true, count: 50, detail: { years: [2024, 2025], matched: 10 } },
  })
  const result = evaluateSnapshotRecord(record, { now: new Date('2026-09-06T16:29:00Z') })
  assert.deepEqual(result, { ok: false, reason: 'nfldraft-target-year-missing' })
})

test('evaluateSnapshotRecord: rejects when player count is under the floor', () => {
  const record = makeRecord({ playerCount: PLAYERS_COUNT_FLOOR - 1 })
  const result = evaluateSnapshotRecord(record, { now: new Date('2026-09-06T16:29:00Z') })
  assert.deepEqual(result, { ok: false, reason: 'players-below-floor' })
})

test('evaluateSnapshotRecord: rejects when depthChart.count is under the floor', () => {
  const record = makeRecord({ depthChart: { loaded: true, count: DEPTH_CHART_COUNT_FLOOR - 1 } })
  const result = evaluateSnapshotRecord(record, { now: new Date('2026-09-06T16:29:00Z') })
  assert.deepEqual(result, { ok: false, reason: 'depthchart-below-floor' })
})

// ─── 3. ktc.loaded and a below-floor ktc.count each reject, distinguishably ───

test('evaluateSnapshotRecord: rejects when ktc.loaded === false', () => {
  const record = makeRecord({ ktc: { loaded: false, count: 0, detail: { rows: 0 } } })
  const result = evaluateSnapshotRecord(record, { now: new Date('2026-09-06T16:29:00Z') })
  assert.deepEqual(result, { ok: false, reason: 'ktc-not-loaded' })
})

test('evaluateSnapshotRecord: rejects when ktc.count is below the floor even though ktc.loaded === true', () => {
  const record = makeRecord({ ktc: { loaded: true, count: KTC_COUNT_FLOOR - 1, detail: { rows: 500 } } })
  const result = evaluateSnapshotRecord(record, { now: new Date('2026-09-06T16:29:00Z') })
  assert.deepEqual(result, { ok: false, reason: 'ktc-below-floor' })
})

// ─── 4. priorSnapshotTeams.loaded === false must NEVER reject ─────────────────

test('evaluateSnapshotRecord: does not reject on priorSnapshotTeams.loaded === false (fresh-runner case)', () => {
  const record = makeRecord({ priorSnapshotTeams: { loaded: false, count: 0 } })
  const result = evaluateSnapshotRecord(record, { now: new Date('2026-09-06T16:29:00Z') })
  assert.equal(result.ok, true)
})

// ─── 5. Pre-draft exception boundary ──────────────────────────────────────────

function recordMissingTargetYear() {
  return makeRecord({
    targetSeason: 2026,
    nflDraft: { loaded: true, count: 50, detail: { years: [2024, 2025], matched: 10 } },
  })
}

test('pre-draft exception: the same record rejects in September (post-draft)', () => {
  const result = evaluateSnapshotRecord(recordMissingTargetYear(), { now: new Date('2026-09-06T16:29:00Z') })
  assert.deepEqual(result, { ok: false, reason: 'nfldraft-target-year-missing' })
})

test('pre-draft exception: the same record passes in February (pre-draft)', () => {
  const result = evaluateSnapshotRecord(recordMissingTargetYear(), { now: new Date('2026-02-06T16:29:00Z') })
  assert.equal(result.ok, true)
})

test('pre-draft exception: April is still pre-draft (assertion skipped)', () => {
  const result = evaluateSnapshotRecord(recordMissingTargetYear(), { now: new Date('2026-04-30T16:29:00Z') })
  assert.equal(result.ok, true)
})

test('pre-draft exception: May is on the assert side of the boundary', () => {
  const result = evaluateSnapshotRecord(recordMissingTargetYear(), { now: new Date('2026-05-01T16:29:00Z') })
  assert.deepEqual(result, { ok: false, reason: 'nfldraft-target-year-missing' })
})

// ─── 6. Round-trip: the accepted object registers through registerSnapshots ───

test('round-trip: an accepted snapshot registers through registerSnapshots and lands in manifest.json', () => {
  const dateKey = `9999-01-0${process.pid % 9 + 1}` // collision-avoiding fake date, not a real capture day
  const relPath = `snapshots/${dateKey}.json`
  const abs = repoPath(relPath)
  const manifestAbs = repoPath('manifest.json')
  const manifestBackup = fs.readFileSync(manifestAbs, 'utf8')

  try {
    const record = makeRecord({ playerCount: PLAYERS_COUNT_FLOOR + 5 })
    const result = evaluateSnapshotRecord(record, { now: new Date('2026-09-06T16:29:00Z') })
    assert.equal(result.ok, true)

    writeJsonStable(relPath, result.snapshot)
    registerSnapshots()

    const manifest = readManifest()
    const entry = manifest.files[relPath]
    assert.ok(entry, `expected ${relPath} to be registered in manifest.json`)
    assert.equal(entry.recordCount, PLAYERS_COUNT_FLOOR + 5)
    assert.equal(entry.schemaVersion, 3)
    assert.equal(entry.inProgress, false)
  } finally {
    fs.rmSync(abs, { force: true })
    fs.writeFileSync(manifestAbs, manifestBackup, 'utf8')
  }
})
