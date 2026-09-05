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

// ─── Floors — each pinned from one observed workflow_dispatch run, not invented ───────────
//
// See the run linked in the task hand-back for the observed numbers behind each of these.

/**
 * Minimum matched-KTC-player count (`inputStatus.ktc.count`). KTC is scraped live from a
 * third-party page inside the same headless run — the input most likely to come back empty
 * on a CI runner (a blocked request, a changed page, no dev proxy). Observed run
 * 2026-09-06: ktc.count = 441. Recent app snapshots (docs/task file) range 436–464; 400 sits
 * under that whole observed band while still well above zero.
 */
export const KTC_COUNT_FLOOR = 400;

/**
 * Minimum `inputStatus.depthChart.count` — cheap; a zero here means the roster/depth-chart
 * load degraded. Observed run 2026-09-06: depthChart.count = 671.
 */
export const DEPTH_CHART_COUNT_FLOOR = 500;

/**
 * Minimum `Object.keys(players).length` in the snapshot envelope. Observed run 2026-09-06:
 * 715 players. Recent app snapshots (task file) range 715–832.
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
 *   snapshot is `record.data` (app `src/utils/cache.js:39-53`, `projectionSnapshot.js:371`).
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
