/**
 * lib/snapshot-capture.mjs — D1b pure extraction/validation for the daily snapshot capture.
 *
 * Given the IndexedDB cache *record* read from a headless run of the app (the shape returned
 * by the app's own `getCacheRecord` — `{ data, expiresAt, ... }`, see app
 * `src/utils/cache.js:39-53`), decide whether the snapshot it holds is safe to register, or
 * reject it with a distinguishable reason. No I/O, no Playwright import — `scripts/
 * capture-snapshot.mjs` owns the browser and calls this with what it read.
 *
 * The commit gate this backs is the reason D1b exists: the app's own write gate
 * (`shouldWriteProjectionSnapshot`) intentionally never refuses to write — a snapshot with a
 * failed input is still written, only *labelled* (D1a, app schemaVersion 3). This module is
 * the second, stricter gate that decides whether THIS repo's series accepts that snapshot.
 * Rejecting here never mutates app state; it only stops `snapshots/<date>.json` from being
 * written and committed.
 */

// ─── Floors ────────────────────────────────────────────────────────────────────────────────
//
// NOT pinned from an observed workflow_dispatch run — the task file's own instruction ("pin
// every floor from one observed run, don't invent them") could not be honored: KTC's live
// fetch is currently broken app-wide (`src/api/ktc.js`'s `corsproxy.io` fallback returns 403
// — the anonymous legacy proxy URL format was deprecated service-side; confirmed via plain
// `curl`, not CI-specific), so `ktcMap` never populates and the app's own write gate
// (`shouldWriteProjectionSnapshot`, which hard-requires a non-null `ktcMap`) never lets ANY
// snapshot get written, on any capture path, until that app-side bug is fixed. Two dispatch
// attempts (one against this repo's `main`, one against a throwaway branch with today's file
// removed to force a non-idempotent run) both confirmed this — see the D1b hand-back.
// These floors are instead taken from the task file's own cited ranges (its Design §C, itself
// sourced from recent pre-existing app snapshots) as the least-bad starting point. Replace
// with a real observed-run number the first time this workflow actually produces a snapshot,
// and update this comment when that happens.

/**
 * Minimum matched-KTC-player count (`inputStatus.ktc.count`). KTC is scraped live from a
 * third-party page inside the same headless run — the input most likely to come back empty
 * on a CI runner (a blocked request, a changed page, no dev proxy) even once the corsproxy.io
 * bug above is fixed. Task file: recent app snapshots range 436–464; 400 sits under that whole
 * band while still well above zero.
 */
export const KTC_COUNT_FLOOR = 400;

/**
 * Minimum `inputStatus.depthChart.count` — cheap; a zero here means the roster/depth-chart
 * load degraded. No cited range exists for this one in the task file; 500 is a conservative
 * fraction of the player-count floor below, pending a real observed run.
 */
export const DEPTH_CHART_COUNT_FLOOR = 500;

/**
 * Minimum `Object.keys(players).length` in the snapshot envelope. Task file: recent app
 * snapshots range 715–832; 500 sits under that whole band while still well above zero.
 */
export const PLAYERS_COUNT_FLOOR = 500;

/** Snapshot schemaVersion below which there is no `inputStatus` to gate on at all (D1a). */
const MIN_SCHEMA_VERSION = 3;

/**
 * `nflverse-draft.yml` runs `0 12 1 5 *` (May 1, 12:00 UTC) — the ingest that puts the
 * upcoming class's picks in the store. Before that date the class does not exist yet, so
 * `inputStatus.nflDraft.detail.years` correctly omits `targetSeason`; that is the documented
 * pre-draft exception (D1a task file, app), not a defect. This capture job runs at 16:29 UTC
 * (Step 0), safely after the May-1 ingest's commit, so May itself is already on the
 * "assert" side of the boundary. Skip the assertion for UTC months January–April; assert it
 * from May (month index 4, 0-based `getUTCMonth()`) onward.
 */
const PRE_DRAFT_LAST_UTC_MONTH = 3 // April, 0-based (Jan=0 .. Apr=3)

/**
 * Evaluates one IndexedDB cache record against the commit gate (D1b Design §C).
 *
 * @param {object|null} record   The cache record as read from IndexedDB (`{ data, ... }`), or
 *   null/undefined if no record exists at the expected key. NOT the snapshot itself — the
 *   snapshot is `record.data` (app `src/utils/cache.js:39-53`, `projectionSnapshot.js` `writeProjectionSnapshot`'s `setCache` call).
 * @param {object} [opts]
 * @param {Date}   [opts.now]    Override for tests; defaults to `new Date()`. Only used to
 *   decide the pre-draft exception's UTC month — never to recompute `targetSeason`, which
 *   comes from the snapshot itself.
 * @returns {{ ok: true, snapshot: object } | { ok: false, reason: string }}
 */
export function evaluateSnapshotRecord(record, { now = new Date() } = {}) {
  const snapshot = record?.data
  if (snapshot == null) {
    return { ok: false, reason: 'missing-record' }
  }

  if (!Number.isFinite(snapshot.schemaVersion) || snapshot.schemaVersion < MIN_SCHEMA_VERSION) {
    return { ok: false, reason: 'schema-version-below-3' }
  }

  const inputStatus = snapshot.inputStatus ?? {}

  if (inputStatus.college?.loaded !== true) {
    return { ok: false, reason: 'college-not-loaded' }
  }

  if (inputStatus.nflDraft?.loaded !== true) {
    return { ok: false, reason: 'nfldraft-not-loaded' }
  }

  // Pre-draft exception: skip the target-year assertion Jan–Apr (see PRE_DRAFT_LAST_UTC_MONTH).
  if (now.getUTCMonth() > PRE_DRAFT_LAST_UTC_MONTH) {
    const years = inputStatus.nflDraft?.detail?.years ?? []
    if (!years.includes(snapshot.targetSeason)) {
      return { ok: false, reason: 'nfldraft-target-year-missing' }
    }
  }

  if (inputStatus.ktc?.loaded !== true) {
    return { ok: false, reason: 'ktc-not-loaded' }
  }
  if (!Number.isFinite(inputStatus.ktc?.count) || inputStatus.ktc.count < KTC_COUNT_FLOOR) {
    return { ok: false, reason: 'ktc-below-floor' }
  }

  // priorSnapshotTeams.loaded is false on EVERY run — a fresh CI runner has no prior snapshot
  // in IndexedDB, ever. Do not gate on it (D1b Design §C) — this is deliberate, not an omission.

  if (!Number.isFinite(inputStatus.depthChart?.count) || inputStatus.depthChart.count < DEPTH_CHART_COUNT_FLOOR) {
    return { ok: false, reason: 'depthchart-below-floor' }
  }

  const playerCount = typeof snapshot.players === 'object' && snapshot.players !== null
    ? Object.keys(snapshot.players).length
    : 0
  if (playerCount < PLAYERS_COUNT_FLOOR) {
    return { ok: false, reason: 'players-below-floor' }
  }

  return { ok: true, snapshot }
}

/**
 * Lists the completed seasons in a snapshot's careerStats provenance that were not read from
 * the data store — the input to the capture's non-fatal provenance warning
 * (data-store-cdn-limit Revision 1, D3). It never gates; `evaluateSnapshotRecord` is the gate.
 *
 * Vocabulary (CR-01): `inputStatus.careerStats.detail.provenance[<season>]` is
 * `'data-store'|'cache-hit'|'live-api'|null`, emitted by `getSeasonTotals`'s `onPath`
 * (`../sleeper-dashboard/src/api/sleeperStats.js`) and assembled by `buildCareerStatsStatus`
 * (`src/utils/projectionSnapshot.js`), which writes numeric `seasons` and string `provenance`
 * keys. Every value other than `'data-store'` is listed — including a missing key, and every
 * season when `provenance` itself is missing. `'cache-hit'` is listed because it hides the
 * original source; a fresh CI runner has no IndexedDB, so on the daily job it should not occur.
 *
 * Scope limit: `detail.seasons` is 2012…the envelope's `currentSeason` (= Sleeper
 * `nflState.season − 1`). From a season's last game until Sleeper rolls `nflState.season` over,
 * the just-completed season is read as the in-progress file, outside `seasons`, and is not
 * covered here — the in-progress read records no provenance at all (data-store-cdn-limit §2.2).
 * A known limit, not a bug to fix here.
 *
 * Pure: no I/O, no mutation. Any non-object input, or a missing/non-array `seasons`, → `[]`.
 *
 * @param {object} snapshot  The snapshot envelope (`record.data`).
 * @returns {Array<{ season: unknown, provenance: unknown }>}  In `seasons` order.
 */
export function nonDataStoreSeasons(snapshot) {
  const detail = snapshot?.inputStatus?.careerStats?.detail
  if (!Array.isArray(detail?.seasons)) return []
  const out = []
  for (const season of detail.seasons) {
    const provenance = detail.provenance?.[String(season)]
    if (provenance !== 'data-store') out.push({ season, provenance })
  }
  return out
}

// GitHub workflow-command data escape — `%` first, so the later escapes are not re-escaped.
function escapeData(s) {
  return s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
}

/**
 * The single `::warning::` workflow-command line for a snapshot whose completed seasons were
 * not all read from the data store, or `null` when there is nothing to warn about. Never
 * throws — any failure (including in `find`) yields `null`, so the warning can never fail a
 * capture.
 *
 * @param {object} snapshot  The snapshot envelope (`record.data`).
 * @param {string} dateKey   The capture's date key, used as-is.
 * @param {function} [find]  Injectable only so a test can make it throw.
 * @returns {string|null}
 */
export function provenanceWarningLine(snapshot, dateKey, find = nonDataStoreSeasons) {
  try {
    const list = find(snapshot)
    if (!Array.isArray(list) || list.length === 0) return null
    const seasons = list
      .map(({ season, provenance }) => `${season} (${provenance === undefined ? 'missing' : String(provenance)})`)
      .join(', ')
    const message = escapeData(`${dateKey}: completed seasons not from the data store — ${seasons}`)
    return `::warning title=careerStats provenance::${message}`
  } catch {
    return null
  }
}
