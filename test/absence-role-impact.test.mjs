/**
 * test/absence-role-impact.test.mjs — pure parts of scripts/absence-role-impact.mjs (D-76 C1b).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'

import { diffCaptures, isEmptyDiff, topMovers, moverRows, reliabilityMoves, renderVerdict, startStaticServer, FIELD_NAMES } from '../scripts/absence-role-impact.mjs'

const row = ({ g = 16, ppg = 10, pts = 160, inj = 0, shape = 1, bb = false, score = 50, label = 'Solid', team = 'SF' } = {}) => ({
  nfl_team: team,
  projection: { projectedGames: g, projectedPPG: ppg, projectedTotalPts: pts, factors: { injurySeasons: inj, absenceShapeFactor: shape, isBounceBack: bb } },
  dynasty: score == null ? null : { score, label },
})
const snap = (players) => ({ players })

test('identical captures → empty diff', () => {
  const d = diffCaptures(snap({ a: row(), b: row({ g: 12 }) }), snap({ a: row(), b: row({ g: 12 }) }))
  assert.equal(d.rowsCompared, 2)
  assert.ok(isEmptyDiff(d))
  assert.ok(FIELD_NAMES.every((n) => d.counts[n] === 0))
})

test('per-field counts, deltas and distributions; label flip counted', () => {
  const before = snap({ a: row({ g: 12, pts: 120, inj: 2, score: 60, label: 'Solid' }), b: row({ bb: false }), c: row() })
  const after = snap({ a: row({ g: 13, pts: 130, inj: 1, score: 63, label: 'Strong' }), b: row({ bb: true, ppg: 10.5 }), c: row() })
  const d = diffCaptures(before, after)
  assert.equal(d.counts.projectedGames, 1)
  assert.equal(d.counts.projectedTotalPts, 1)
  assert.equal(d.counts.injurySeasons, 1)
  assert.equal(d.counts.dynastyScore, 1)
  assert.equal(d.counts.dynastyLabel, 1)
  assert.equal(d.counts.isBounceBack, 1)
  assert.equal(d.counts.projectedPPG, 1)
  assert.equal(d.distributions.projectedGames.get('+1'), 1)
  assert.equal(d.distributions.dynastyLabel.get('Solid → Strong'), 1)
  assert.equal(d.distributions.isBounceBack.get('false → true'), 1)
  assert.deepEqual(d.movers.map((m) => m.id), ['a', 'b'])
  assert.deepEqual(d.movers[0].changes.dynastyScore, { before: 60, after: 63, delta: 3 })
})

test('a row on only one side is reported, not dropped', () => {
  const d = diffCaptures(snap({ a: row(), gone: row() }), snap({ a: row(), fresh: row() }))
  assert.deepEqual(d.onlyBefore, ['gone'])
  assert.deepEqual(d.onlyAfter, ['fresh'])
  assert.equal(d.rowsCompared, 1)
  assert.equal(isEmptyDiff(d), false)
})

test('null dynasty on one side is a move with null delta; topMovers ranks by |delta|', () => {
  const before = snap({ a: row({ score: null }), b: row({ score: 50 }), c: row({ score: 50 }) })
  const after = snap({ a: row({ score: 40 }), b: row({ score: 45 }), c: row({ score: 58 }) })
  const d = diffCaptures(before, after)
  assert.equal(d.counts.dynastyScore, 3)
  assert.deepEqual(topMovers(d, 'dynastyScore').map((m) => m.id), ['c', 'b'])
})

test('renderVerdict reports a non-empty noise floor and one-sided rows', () => {
  const noise = diffCaptures(snap({ a: row() }), snap({ a: row({ score: 51 }) }))
  const diff = diffCaptures(snap({ a: row(), gone: row() }), snap({ a: row({ g: 15, pts: 150 }) }))
  const md = renderVerdict({ date: '2026-10-22', after: snap({ a: row({ g: 15, pts: 150 }) }), noise, diff, info: { a: { name: 'Pat Example', position: 'WR', team: 'SF' } }, sections: [{ title: 'Extra', body: 'hello' }] })
  assert.match(md, /NOT EMPTY/)
  assert.match(md, /only in before: 1 \(gone\)/)
  assert.match(md, /Pat Example/)
  assert.match(md, /## Extra/)
})

test('static server sends CORS + JSON and refuses path escapes', async () => {
  const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'impact-srv-'))
  fs.writeFileSync(path.join(dir, 'manifest.json'), '{"ok":true}')
  const server = await startStaticServer(dir, 0)
  try {
    const { port } = server.address()
    const r = await fetch(`http://localhost:${port}/manifest.json`)
    assert.equal(r.headers.get('access-control-allow-origin'), '*')
    assert.match(r.headers.get('content-type'), /json/)
    assert.deepEqual(await r.json(), { ok: true })
    assert.equal((await fetch(`http://localhost:${port}/nope.json`)).status, 404)
    const rawStatus = (rawPath) => new Promise((resolve, reject) => {
      http.request({ host: 'localhost', port, path: rawPath, method: 'GET' }, (res) => { res.resume(); resolve(res.statusCode) }).on('error', reject).end()
    })
    assert.equal(await rawStatus('/%2e%2e/%2e%2e/etc/hosts'), 403)
    assert.equal(await rawStatus('/%E0%A4%A'), 400)
  } finally {
    server.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('moverRows keeps only movers whose changes include a requested field', () => {
  const d = diffCaptures(
    snap({ a: row({ g: 12 }), b: row({ inj: 1 }), c: row({ score: 50 }), d: row() }),
    snap({ a: row({ g: 13 }), b: row({ inj: 0 }), c: row({ score: 51 }), d: row() }),
  )
  assert.deepEqual(moverRows(d, ['projectedGames', 'injurySeasons']).map((m) => m.id), ['a', 'b'])
  assert.deepEqual(moverRows(d, ['isBounceBack']), [])
})

test('reliabilityMoves lists ids present on both sides whose reliability value moved', () => {
  const r = (v) => ({ dynasty: { components: { reliability: { value: v } } } })
  const before = snap({ a: r(0.5), b: r(0.5), c: r(0.5), gone: r(1) })
  const after = snap({ a: r(0.6), b: r(0.5), c: { dynasty: null }, fresh: r(1) })
  assert.deepEqual(reliabilityMoves(before, after), ['a', 'c'])
})
