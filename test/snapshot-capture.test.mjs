/**
 * test/snapshot-capture.test.mjs — Unit tests for the D1b commit gate (lib/snapshot-capture.mjs).
 *
 * Run with: node --test (or npm test)
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'

import { evaluateSnapshotRecord, KTC_COUNT_FLOOR, DEPTH_CHART_COUNT_FLOOR, PLAYERS_COUNT_FLOOR } from '../lib/snapshot-capture.mjs'
import { nonDataStoreSeasons, provenanceWarningLine } from '../lib/snapshot-capture.mjs'
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

test('evaluateSnapshotRecord: passes per-player dynasty blocks (and a null) through unchanged', () => {
  const record = makeRecord()
  const dyn = {
    score: 72, label: 'Strong', confidence: 'high',
    components: { ageAdjusted: { value: 60, weight: 0.3 }, trajectory: null },
    qbQualityScore: 74, qbModifierApplied: 7,
    dynastyScoreBase: { score: 65, label: 'Solid', confidence: 'moderate', components: null },
  }
  const expected = JSON.parse(JSON.stringify(dyn))
  record.data.players.p0.dynasty = dyn
  record.data.players.p1.dynasty = null
  for (const id of Object.keys(record.data.players)) {
    if (id !== 'p0' && id !== 'p1') record.data.players[id].dynasty = { score: 50, label: 'Mid', confidence: 'low', components: null, qbQualityScore: null, qbModifierApplied: null }
  }
  const result = evaluateSnapshotRecord(record, { now: new Date('2026-09-06T16:29:00Z') })
  assert.equal(result.ok, true)
  assert.deepEqual(result.snapshot.players.p0.dynasty, expected)
  assert.equal(result.snapshot.players.p1.dynasty, null)
})

test('evaluateSnapshotRecord: a record with no dynasty keys is also accepted (the gate does not require the field)', () => {
  const record = makeRecord()
  assert.ok(Object.values(record.data.players).every(p => !('dynasty' in p)))
  const result = evaluateSnapshotRecord(record, { now: new Date('2026-09-06T16:29:00Z') })
  assert.equal(result.ok, true)
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

// ─── provenance warning (capture-provenance-warning) ─────────────────────────

const CAREER_SEASONS = Array.from({ length: 14 }, (_, i) => 2012 + i) // 2012–2025

/** A 14-season careerStats block, every provenance 'data-store' unless overridden. */
function makeCareerStats(provenanceOverrides = {}) {
  const provenance = {}
  for (const s of CAREER_SEASONS) provenance[String(s)] = 'data-store'
  Object.assign(provenance, provenanceOverrides)
  return { loaded: true, count: 14, detail: { seasons: [...CAREER_SEASONS], provenance } }
}

function snapWith(careerStats) {
  return makeRecord({ careerStats }).data
}

function deepFreeze(o) {
  if (o !== null && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o)
    for (const v of Object.values(o)) deepFreeze(v)
  }
  return o
}

const PW_LINE = '::warning title=careerStats provenance::2026-10-23: completed seasons not from the data store — 2019 (live-api), 2021 (null)'

// PW-1 · nonDataStoreSeasons

test('PW-1 nonDataStoreSeasons: all 14 seasons data-store → []', () => {
  assert.deepEqual(nonDataStoreSeasons(snapWith(makeCareerStats())), [])
})

test('PW-1 nonDataStoreSeasons: one live-api season → only that season', () => {
  assert.deepEqual(
    nonDataStoreSeasons(snapWith(makeCareerStats({ 2019: 'live-api' }))),
    [{ season: 2019, provenance: 'live-api' }],
  )
})

test('PW-1 nonDataStoreSeasons: null and cache-hit are both listed, in seasons order', () => {
  assert.deepEqual(
    nonDataStoreSeasons(snapWith(makeCareerStats({ 2023: 'cache-hit', 2014: null }))),
    [{ season: 2014, provenance: null }, { season: 2023, provenance: 'cache-hit' }],
  )
})

test('PW-1 nonDataStoreSeasons: a season absent from provenance is listed with provenance undefined', () => {
  const cs = makeCareerStats()
  delete cs.detail.provenance['2017']
  const out = nonDataStoreSeasons(snapWith(cs))
  assert.equal(out.length, 1)
  assert.equal(out[0].season, 2017)
  assert.equal(out[0].provenance, undefined)
  assert.ok('provenance' in out[0])
})

test('PW-1 nonDataStoreSeasons: seasons present, provenance missing or null → every season listed with undefined', () => {
  const expected = CAREER_SEASONS.map(season => ({ season, provenance: undefined }))
  const missing = makeCareerStats()
  delete missing.detail.provenance
  assert.deepEqual(nonDataStoreSeasons(snapWith(missing)), expected)
  const nulled = makeCareerStats()
  nulled.detail.provenance = null
  assert.deepEqual(nonDataStoreSeasons(snapWith(nulled)), expected)
})

test('PW-1 nonDataStoreSeasons: careerStats / detail / seasons missing, or seasons not an array → []', () => {
  const noCareer = makeRecord().data
  delete noCareer.inputStatus.careerStats
  assert.deepEqual(nonDataStoreSeasons(noCareer), [])
  assert.deepEqual(nonDataStoreSeasons(snapWith({ loaded: true, count: 14 })), [])
  assert.deepEqual(nonDataStoreSeasons(snapWith({ loaded: true, count: 14, detail: { provenance: {} } })), [])
  assert.deepEqual(nonDataStoreSeasons(snapWith({ loaded: true, count: 14, detail: { seasons: '2012', provenance: {} } })), [])
  assert.deepEqual(nonDataStoreSeasons(snapWith({ loaded: true, count: 14, detail: { seasons: { 0: 2012 }, provenance: {} } })), [])
})

test('PW-1 nonDataStoreSeasons: null / undefined / 42 / "x" / [] as the whole input → [], no throw', () => {
  for (const input of [null, undefined, 42, 'x', []]) {
    assert.deepEqual(nonDataStoreSeasons(input), [])
  }
})

test("PW-1 nonDataStoreSeasons: makeRecord()'s default careerStats (seasons: []) → []", () => {
  assert.deepEqual(nonDataStoreSeasons(makeRecord().data), [])
})

// PW-2 · provenanceWarningLine output

test('PW-2 provenanceWarningLine: 2019 live-api + 2021 null renders the exact workflow-command line', () => {
  const snap = snapWith(makeCareerStats({ 2019: 'live-api', 2021: null }))
  assert.equal(provenanceWarningLine(snap, '2026-10-23'), PW_LINE)
})

test('PW-2 provenanceWarningLine: a missing provenance key renders (missing)', () => {
  const cs = makeCareerStats()
  delete cs.detail.provenance['2020']
  assert.equal(
    provenanceWarningLine(snapWith(cs), '2026-10-23'),
    '::warning title=careerStats provenance::2026-10-23: completed seasons not from the data store — 2020 (missing)',
  )
})

test('PW-2 provenanceWarningLine: all data-store, or empty/missing seasons → null', () => {
  assert.equal(provenanceWarningLine(snapWith(makeCareerStats()), '2026-10-23'), null)
  assert.equal(provenanceWarningLine(makeRecord().data, '2026-10-23'), null)
  assert.equal(provenanceWarningLine(snapWith({ loaded: true, count: 14, detail: { provenance: {} } }), '2026-10-23'), null)
})

test('PW-2 provenanceWarningLine: % and newline in a provenance value are escaped, no raw newline', () => {
  const line = provenanceWarningLine(snapWith(makeCareerStats({ 2018: '50%\nbad' })), '2026-10-23')
  assert.equal(
    line,
    '::warning title=careerStats provenance::2026-10-23: completed seasons not from the data store — 2018 (50%25%0Abad)',
  )
  assert.ok(!line.includes('\n'))
  assert.ok(!line.includes('\r'))
})

// PW-3 · byte-identical to today on a clean capture

test('PW-3 clean capture: an all-data-store snapshot gives no warning line', () => {
  assert.equal(provenanceWarningLine(snapWith(makeCareerStats()), '2026-10-23'), null)
})

test('PW-3 no mutation: nonDataStoreSeasons on a deep-frozen snapshot does not throw and returns the expected list', () => {
  const frozen = deepFreeze(snapWith(makeCareerStats({ 2019: 'live-api', 2021: null })))
  assert.deepEqual(nonDataStoreSeasons(frozen), [
    { season: 2019, provenance: 'live-api' },
    { season: 2021, provenance: null },
  ])
})

test('PW-3 no mutation: provenanceWarningLine leaves a dirty snapshot byte-identical', () => {
  const snap = snapWith(makeCareerStats({ 2019: 'live-api', 2021: null }))
  const before = JSON.stringify(snap)
  assert.equal(provenanceWarningLine(snap, '2026-10-23'), PW_LINE)
  assert.equal(JSON.stringify(snap), before)
})

test('PW-3 gate untouched: evaluateSnapshotRecord still accepts the clean record and returns record.data', () => {
  const record = makeRecord({ careerStats: makeCareerStats() })
  const result = evaluateSnapshotRecord(record, { now: new Date('2026-09-06T16:29:00Z') })
  assert.deepEqual(result, { ok: true, snapshot: record.data })
  assert.equal(result.snapshot, record.data)
})

// PW-4 · a helper failure cannot fail the capture

test('PW-4 provenanceWarningLine: a throwing find → null, no throw', () => {
  const snap = snapWith(makeCareerStats({ 2019: 'live-api' }))
  assert.equal(provenanceWarningLine(snap, '2026-10-23', () => { throw new Error('boom') }), null)
})

test('PW-4 provenanceWarningLine: a throwing inputStatus getter → null, no throw', () => {
  const snap = makeRecord().data
  Object.defineProperty(snap, 'inputStatus', { get() { throw new Error('boom') } })
  assert.equal(provenanceWarningLine(snap, '2026-10-23'), null)
})

test('PW-4 provenanceWarningLine: find returning a non-array → null', () => {
  const snap = snapWith(makeCareerStats({ 2019: 'live-api' }))
  assert.equal(provenanceWarningLine(snap, '2026-10-23', () => null), null)
  assert.equal(provenanceWarningLine(snap, '2026-10-23', () => ({})), null)
})

// PW-5 · script wiring (source text — the script imports Playwright and runs main() on import)

test('PW-5 capture-snapshot.mjs: the warning runs once, after the write, isolated in its own try/catch', () => {
  const src = fs.readFileSync('scripts/capture-snapshot.mjs', 'utf8')
  const body = src
    .split('\n')
    .filter(l => !/^import .*from '\.\.\/lib\/snapshot-capture\.mjs'/.test(l))
    .join('\n')

  assert.equal(body.split('provenanceWarningLine(').length - 1, 1, 'provenanceWarningLine( must be called exactly once')

  const callIdx = body.indexOf('provenanceWarningLine(')
  const writeIdx = body.indexOf('writeCapturedSnapshot(target')
  const wroteIdx = body.indexOf('[capture] wrote')
  assert.ok(writeIdx !== -1 && wroteIdx !== -1, 'write call and [capture] wrote line must exist')
  assert.ok(callIdx > writeIdx, 'the warning must run after writeCapturedSnapshot(target')
  assert.ok(callIdx > wroteIdx, 'the warning must run after the [capture] wrote line')

  const finallyIdx = body.indexOf('} finally {', callIdx)
  assert.ok(finallyIdx !== -1, 'the warning must sit before the outer } finally {')
  const slice = body.slice(callIdx, finallyIdx)
  assert.ok(slice.includes('} catch {}'), 'the warning must be wrapped in its own try { … } catch {}')
  for (const banned of ['process.exitCode', 'setStepOutput', 'writeJsonStable', 'writeCapturedSnapshot', 'return', 'throw']) {
    assert.ok(!slice.includes(banned), `the warning block must not contain ${banned}`)
  }
})
