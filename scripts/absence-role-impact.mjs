/**
 * scripts/absence-role-impact.mjs — D-76 C1: measure the absence-role rewrite on the real pipeline.
 *
 * Offline; writes no served output. Three pieces:
 *   serve   — a CORS static file server over a data-tree root (the app is built with
 *             VITE_DATA_STORE_URL pointing at it, so a capture reads that tree as its data store).
 *   diff    — `diffCaptures(before, after)` over two captured snapshots (pure).
 *   report  — `renderVerdict(...)` markdown writer (pure) + a CLI that reads the capture files.
 *
 * CLI:
 *   node scripts/absence-role-impact.mjs serve --root <dir> [--port 8787]
 *   node scripts/absence-role-impact.mjs report --before <f> --before2 <f> --after <f>
 *        --after-tree <dir> --out <md> [--section "<title>=<md file>"]…
 */

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// ─── compared fields ─────────────────────────────────────────────────────────

const get = (o, keys) => keys.reduce((v, k) => (v == null ? undefined : v[k]), o)

/** [name, extractor, numeric?] — one row of the diff per entry. */
export const FIELDS = [
  ['projectedGames', (p) => get(p, ['projection', 'projectedGames']), true],
  ['projectedPPG', (p) => get(p, ['projection', 'projectedPPG']), true],
  ['projectedTotalPts', (p) => get(p, ['projection', 'projectedTotalPts']), true],
  ['injurySeasons', (p) => get(p, ['projection', 'factors', 'injurySeasons']), true],
  ['absenceShapeFactor', (p) => get(p, ['projection', 'factors', 'absenceShapeFactor']), true],
  ['isBounceBack', (p) => get(p, ['projection', 'factors', 'isBounceBack']), false],
  ['dynastyScore', (p) => get(p, ['dynasty', 'score']), true],
  ['dynastyLabel', (p) => get(p, ['dynasty', 'label']), false],
]
export const FIELD_NAMES = FIELDS.map(([n]) => n)

const same = (a, b) => a === b || (Number.isNaN(a) && Number.isNaN(b))
const round3 = (x) => Math.round(x * 1000) / 1000

/**
 * @param {{players?: Record<string, object>}} before
 * @param {{players?: Record<string, object>}} after
 * @returns {{
 *   rowsCompared: number, onlyBefore: string[], onlyAfter: string[],
 *   counts: Record<string, number>,
 *   distributions: Record<string, Map<string, number>>,
 *   movers: Array<{ id: string, changes: Record<string, {before: any, after: any, delta: number|null}> }>,
 * }}
 */
export function diffCaptures(before, after) {
  const bp = before?.players ?? {}
  const ap = after?.players ?? {}
  const onlyBefore = Object.keys(bp).filter((id) => !(id in ap)).sort()
  const onlyAfter = Object.keys(ap).filter((id) => !(id in bp)).sort()
  const counts = Object.fromEntries(FIELD_NAMES.map((n) => [n, 0]))
  const distributions = Object.fromEntries(FIELD_NAMES.map((n) => [n, new Map()]))
  const movers = []
  let rowsCompared = 0

  for (const id of Object.keys(bp).sort()) {
    if (!(id in ap)) continue
    rowsCompared++
    const changes = {}
    for (const [name, extract, numeric] of FIELDS) {
      const b = extract(bp[id])
      const a = extract(ap[id])
      if (same(a, b)) continue
      counts[name]++
      const numericDelta = numeric && typeof a === 'number' && typeof b === 'number'
      const delta = numericDelta ? round3(a - b) : null
      const key = numericDelta ? (delta > 0 ? `+${delta}` : `${delta}`) : `${b ?? 'null'} → ${a ?? 'null'}`
      distributions[name].set(key, (distributions[name].get(key) ?? 0) + 1)
      changes[name] = { before: b ?? null, after: a ?? null, delta }
    }
    if (Object.keys(changes).length) movers.push({ id, changes })
  }
  return { rowsCompared, onlyBefore, onlyAfter, counts, distributions, movers }
}

/** True iff a diff reports nothing — no moved field, no one-sided row. */
export const isEmptyDiff = (d) => d.movers.length === 0 && d.onlyBefore.length === 0 && d.onlyAfter.length === 0

export function topMovers(diff, field, n = 20) {
  return diff.movers
    .filter((m) => m.changes[field]?.delta != null)
    .sort((x, y) => Math.abs(y.changes[field].delta) - Math.abs(x.changes[field].delta) || (x.id < y.id ? -1 : 1))
    .slice(0, n)
}

/** Movers whose change set includes any of `fields` (diff order, i.e. sorted by id). */
export function moverRows(diff, fields) {
  return diff.movers.filter((m) => fields.some((f) => m.changes[f]))
}

/** Count of rows present in both captures whose `dynasty.components.reliability.value` moved. */
export function reliabilityMoves(before, after) {
  const rel = (p) => get(p, ['dynasty', 'components', 'reliability', 'value'])
  const bp = before?.players ?? {}
  const ap = after?.players ?? {}
  return Object.keys(bp).filter((id) => id in ap && !same(rel(bp[id]), rel(ap[id]))).sort()
}

// ─── markdown ────────────────────────────────────────────────────────────────

const fmt = (v) => (v == null ? '—' : typeof v === 'number' ? String(v) : String(v))

function distributionTable(map) {
  const rows = [...map.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  return ['| move | rows |', '|---|---|', ...rows.map(([k, n]) => `| ${k} | ${n} |`)].join('\n')
}

function moverTable(movers, field, info, snapshot) {
  const lines = [
    `| # | player | pos | team | ${field} before → after | Δ | injurySeasons before → after |`,
    '|---|---|---|---|---|---|---|',
  ]
  movers.forEach((m, i) => {
    const meta = info?.[m.id] ?? {}
    const c = m.changes[field]
    const inj = m.changes.injurySeasons
    const injCell = inj ? `${fmt(inj.before)} → ${fmt(inj.after)}` : `${fmt(get(snapshot, ['players', m.id, 'projection', 'factors', 'injurySeasons']))} (unchanged)`
    const team = meta.team ?? get(snapshot, ['players', m.id, 'nfl_team'])
    lines.push(`| ${i + 1} | ${meta.name ?? m.id} | ${meta.position ?? '?'} | ${fmt(team)} | ${fmt(c.before)} → ${fmt(c.after)} | ${c.delta > 0 ? '+' : ''}${c.delta} | ${injCell} |`)
  })
  return lines.join('\n')
}

/**
 * @param {{
 *   date: string, before: object, after: object, noise: ReturnType<typeof diffCaptures>,
 *   diff: ReturnType<typeof diffCaptures>, info?: Record<string, {name?: string, position?: string, team?: string}>,
 *   meta?: Record<string, string>, sections?: Array<{title: string, body: string}>,
 * }} args
 */
export function renderVerdict({ date, after, noise, diff, info = {}, meta = {}, sections = [] }) {
  const out = []
  out.push(`# D-76 absence-role — impact verdict (${date})`, '')
  for (const [k, v] of Object.entries(meta)) out.push(`- **${k}:** ${v}`)
  out.push('', '## Noise floor (before vs before2)', '')
  out.push(isEmptyDiff(noise)
    ? `Empty on every compared field (${noise.rowsCompared} rows compared, no one-sided rows).`
    : `**NOT EMPTY** — ${noise.movers.length} moving rows, ${noise.onlyBefore.length} only in before, ${noise.onlyAfter.length} only in before2.`)
  out.push('', '## Rows moved (before vs after)', '')
  out.push(`Rows compared: ${diff.rowsCompared}; only in before: ${diff.onlyBefore.length}${diff.onlyBefore.length ? ` (${diff.onlyBefore.join(', ')})` : ''}; only in after: ${diff.onlyAfter.length}${diff.onlyAfter.length ? ` (${diff.onlyAfter.join(', ')})` : ''}.`, '')
  out.push('| field | rows moved |', '|---|---|', ...FIELD_NAMES.map((n) => `| ${n} | ${diff.counts[n]} |`), '')
  out.push('## Distribution of each move', '')
  for (const n of FIELD_NAMES) {
    out.push(`### ${n}`, '')
    out.push(diff.distributions[n].size ? distributionTable(diff.distributions[n]) : '_no moves_', '')
  }
  out.push('## Label transitions', '')
  out.push(diff.distributions.dynastyLabel.size ? distributionTable(diff.distributions.dynastyLabel) : '_no label moves_', '')
  out.push('## 20 largest movers by |Δ dynasty score|', '')
  const byScore = topMovers(diff, 'dynastyScore')
  out.push(byScore.length ? moverTable(byScore, 'dynastyScore', info, after) : '_none_', '')
  out.push('## 20 largest movers by |Δ projectedTotalPts|', '')
  const byPts = topMovers(diff, 'projectedTotalPts')
  out.push(byPts.length ? moverTable(byPts, 'projectedTotalPts', info, after) : '_none_', '')
  for (const s of sections) out.push(`## ${s.title}`, '', s.body.trimEnd(), '')
  return out.join('\n')
}

// ─── static server ───────────────────────────────────────────────────────────

/** CORS static file server over `root` (JSON content type). Resolves once listening. */
export function startStaticServer(root, port) {
  const absRoot = path.resolve(root)
  const server = http.createServer((req, res) => {
    const headers = { 'Access-Control-Allow-Origin': '*' }
    if (req.method === 'OPTIONS') { res.writeHead(204, { ...headers, 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 'Access-Control-Allow-Headers': '*' }); return res.end() }
    let rel
    try { rel = decodeURIComponent((req.url ?? '/').split('?')[0]) } catch { res.writeHead(400, headers); return res.end() }
    const file = path.resolve(absRoot, '.' + rel)
    if (file !== absRoot && !file.startsWith(absRoot + path.sep)) { res.writeHead(403, headers); return res.end() }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404, headers); return res.end() }
      res.writeHead(200, { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(req.method === 'HEAD' ? undefined : buf)
    })
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, () => resolve(server))
  })
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const o = { section: [] }
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue
    const k = argv[i].slice(2)
    const v = argv[++i]
    if (k === 'section') o.section.push(v)
    else o[k] = v
  }
  return o
}

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'))

function loadInfo(tree) {
  const info = {}
  for (const season of [2025, 2026]) {
    const f = path.join(tree, 'nflverse', 'roster', `${season}.json`)
    if (!fs.existsSync(f)) continue
    for (const [id, r] of Object.entries(readJson(f).players ?? {})) info[id] = { name: r.fullName, position: r.position, team: r.team }
  }
  return info
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2)
  const a = parseArgs(rest)
  if (cmd === 'serve') {
    const port = Number(a.port ?? 8787)
    await startStaticServer(a.root, port)
    console.log(`[impact] serving ${path.resolve(a.root)} on http://localhost:${port}`)
    return
  }
  if (cmd === 'report') {
    const before = readJson(a.before)
    const after = readJson(a.after)
    const noise = diffCaptures(before, readJson(a.before2))
    const diff = diffCaptures(before, after)
    const date = new Date().toISOString().slice(0, 10)
    const sections = a.section.map((s) => { const i = s.indexOf('='); return { title: s.slice(0, i), body: fs.readFileSync(s.slice(i + 1), 'utf8') } })
    fs.writeFileSync(a.out, renderVerdict({ date, before, after, noise, diff, info: loadInfo(a['after-tree']), meta: { 'capturedAt (before / after)': `${before.capturedAt} / ${after.capturedAt}` }, sections }))
    console.log(`[impact] wrote ${a.out}; noise ${isEmptyDiff(noise) ? 'empty' : 'NOT EMPTY'}; movers ${diff.movers.length}`)
    if (!isEmptyDiff(noise)) process.exitCode = 2
    return
  }
  console.error('usage: absence-role-impact.mjs serve|report …')
  process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exitCode = 1 })
}
