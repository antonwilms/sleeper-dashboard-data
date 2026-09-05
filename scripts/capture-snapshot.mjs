/**
 * scripts/capture-snapshot.mjs — D1b orchestrator: drives a headless build of the app,
 * reads the projection snapshot it wrote to IndexedDB, runs it through the pure commit gate
 * (`lib/snapshot-capture.mjs`), and writes `snapshots/<date>.json` on acceptance.
 *
 * Every selector, timeout and `page.evaluate` lives here — `lib/snapshot-capture.mjs` stays
 * pure and Playwright-free so it can be unit-tested without a browser.
 *
 * Env:
 *   APP_PREVIEW_URL     Base URL of the running `vite preview` server (default http://localhost:4173)
 *   SNAPSHOT_LEAGUE_ID  Sleeper league id to seed into localStorage (required)
 *
 * Exit codes: 0 on acceptance OR on a legitimate already-committed skip; 1 on any capture
 * failure (marker timeout, missing record) or commit-gate rejection. The caller (the
 * workflow's commit step) treats both non-zero paths as "do not commit" and treats the
 * `wrote` step output as the discriminator between "nothing to do" (skip) and "should have
 * produced a file" — see .github/workflows/daily-snapshot.yml.
 */

import { chromium } from 'playwright'
import fs from 'fs'

import { evaluateSnapshotRecord } from '../lib/snapshot-capture.mjs'
import { writeJsonStable, repoPath, setStepOutput } from '../lib/io.mjs'

const APP_URL = process.env.APP_PREVIEW_URL ?? 'http://localhost:4173'
const LEAGUE_ID = process.env.SNAPSHOT_LEAGUE_ID
const MARKER_TIMEOUT_MS = 180_000

// storedUser.username is never validated against the Sleeper API on the boot path (only
// storedLeague.league_id drives a real fetch — D1b task file, Step 0 correction 2), so any
// non-empty string is fine here.
const SEED_USERNAME = 'snapshot-capture-bot'
const LS_USER_KEY = 'sleeper-user'
const LS_LEAGUE_KEY = 'sleeper-league'

function utcDateKey(now = new Date()) {
  return now.toISOString().slice(0, 10)
}

async function readSnapshotRecord(page, cacheKey) {
  return page.evaluate((key) => new Promise((resolve, reject) => {
    const req = indexedDB.open('sleeper-dashboard')
    req.onerror = () => reject(req.error)
    req.onsuccess = () => {
      const db = req.result
      const tx = db.transaction('cache', 'readonly')
      const getReq = tx.objectStore('cache').get(key)
      getReq.onsuccess = () => resolve(getReq.result ?? null)
      getReq.onerror = () => reject(getReq.error)
    }
  }), cacheKey)
}

async function main() {
  if (!LEAGUE_ID) {
    throw new Error('SNAPSHOT_LEAGUE_ID is required')
  }

  const dateKey = utcDateKey()
  const snapshotRelPath = `snapshots/${dateKey}.json`

  // Design D — skip-if-committed. Check before driving the browser at all, so a manual
  // import earlier in the day wins and this run is a cheap no-op.
  if (fs.existsSync(repoPath(snapshotRelPath))) {
    console.log(`[capture] ${snapshotRelPath} already committed — skipping browser run.`)
    setStepOutput('wrote', 'false')
    return
  }

  const browser = await chromium.launch()
  const context = await browser.newContext()

  // Seed localStorage before first navigation — the app's boot effect auto-loads from these
  // two keys and re-fetches the league by id, needing no UI driving at all (Step 0 correction 2).
  await context.addInitScript(([userKey, leagueKey, username, leagueId]) => {
    window.localStorage.setItem(userKey, JSON.stringify({ username }))
    window.localStorage.setItem(leagueKey, JSON.stringify({ league_id: leagueId }))
  }, [LS_USER_KEY, LS_LEAGUE_KEY, SEED_USERNAME, LEAGUE_ID])

  const page = await context.newPage()

  // Pipe the page's console to the job log from the start — when this breaks unattended at
  // 16:29 UTC, this is the only evidence there will be (Design A).
  page.on('console', msg => console.log(`[app console] ${msg.text()}`))
  page.on('pageerror', err => console.log(`[app pageerror] ${err.message}`))

  let markerText = null
  const markerPromise = new Promise((resolve) => {
    page.on('console', msg => {
      if (markerText) return
      const text = msg.text()
      if (/^\[snapshot] (wrote|skipped)/.test(text)) {
        markerText = text
        resolve(text)
      }
    })
  })

  try {
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })

    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(
        `Timed out after ${MARKER_TIMEOUT_MS}ms waiting for the [snapshot] console marker`
      )), MARKER_TIMEOUT_MS)
    })
    await Promise.race([markerPromise, timeout])
    console.log(`[capture] console marker: ${markerText}`)

    const cacheKey = `projection-snapshots/${dateKey}`
    const record = await readSnapshotRecord(page, cacheKey)

    const result = evaluateSnapshotRecord(record)
    if (!result.ok) {
      console.error(`::error::Snapshot rejected — ${result.reason}`)
      setStepOutput('wrote', 'false')
      process.exitCode = 1
      return
    }

    const playerCount = Object.keys(result.snapshot.players ?? {}).length
    writeJsonStable(snapshotRelPath, result.snapshot)
    console.log(`[capture] wrote ${snapshotRelPath} (${playerCount} players, ktc.count=${result.snapshot.inputStatus.ktc.count}, depthChart.count=${result.snapshot.inputStatus.depthChart.count})`)
    setStepOutput('wrote', 'true')
  } finally {
    await browser.close()
  }
}

main().catch(err => {
  console.error(err)
  setStepOutput('wrote', 'false')
  process.exitCode = 1
})
