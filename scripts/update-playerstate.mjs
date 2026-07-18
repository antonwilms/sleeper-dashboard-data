/**
 * scripts/update-playerstate.mjs — Weekly Sleeper players-state capture.
 *
 * Sleeper's /v1/players/nfl endpoint is current-state only — Sleeper serves no
 * history and nothing server-side snapshots it. This writes a date-keyed,
 * append-only capture of status/injury/depth-chart state so each week's state
 * is not permanently lost. Capture-only: nothing downstream reads this family.
 *
 * Deduplication:
 *   - Compares a content hash of the new build vs the most recent existing
 *     snapshot file's players. The hash excludes `newsUpdated` and `searchRank`
 *     (both change nearly continuously) so dedup fires on real state changes,
 *     not incidental churn — both fields are still written to the snapshot.
 *   - If identical: logs "no change" and returns — no write, no manifest
 *     update, no marker file (run-evidence liveness is the A2 detector's job,
 *     a deliberate deviation from the KTC/roster last-checked convention).
 *
 * @param {object} opts
 * @param {boolean} opts.dryRun  Fetch + validate but don't write files
 */

import crypto from 'crypto';
import { fetchPlayersMap } from '../lib/sleeper.mjs';
import { readJson, writeJsonStable, listDir } from '../lib/io.mjs';
import { updateManifestEntry } from '../lib/manifest.mjs';
import { validatePlayersState } from '../lib/validate.mjs';

export const SKILL_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'FB', 'K'];
const SKILL_SET = new Set(SKILL_POSITIONS);

function todayDateString() {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

/**
 * Membership filter — active, rostered, skill-position player.
 * @param {object} p  Raw Sleeper player record
 * @returns {boolean}
 */
export function isCapturedPlayer(p) {
  if (p.active !== true) return false;
  if (!p.team) return false;
  const fantasyPositions = Array.isArray(p.fantasy_positions) ? p.fantasy_positions : [];
  return SKILL_SET.has(p.position) || fantasyPositions.some(fp => SKILL_SET.has(fp));
}

/**
 * Maps one raw Sleeper record to the captured shape. Every key explicit,
 * `null` when upstream is null/absent — absence never means "not captured".
 * @param {object} p  Raw Sleeper player record
 * @returns {object}
 */
export function pickPlayerState(p) {
  return {
    name: p.full_name ?? null,
    team: p.team ?? null,
    position: p.position ?? null,
    fantasyPositions: Array.isArray(p.fantasy_positions) ? p.fantasy_positions : [],
    status: p.status ?? null,
    injuryStatus: p.injury_status ?? null,
    injuryBodyPart: p.injury_body_part ?? null,
    injuryStartDate: p.injury_start_date ?? null,
    injuryNotes: p.injury_notes ?? null,
    practiceParticipation: p.practice_participation ?? null,
    practiceDescription: p.practice_description ?? null,
    depthChartPosition: p.depth_chart_position ?? null,
    depthChartOrder: p.depth_chart_order ?? null,
    active: p.active ?? null,
    teamChangedAt: p.team_changed_at ?? null,
    newsUpdated: p.news_updated ?? null,
    searchRank: p.search_rank ?? null,
  };
}

/**
 * Filter + pick + sort keys (stable diffs + stable content hash).
 * @param {object} rawPlayersMap  { [sleeper_id]: rawRecord }
 * @returns {object}  { [sleeper_id]: pickedState }, keys sorted
 */
export function buildPlayersState(rawPlayersMap) {
  const ids = Object.keys(rawPlayersMap)
    .filter(id => isCapturedPlayer(rawPlayersMap[id]))
    .sort();
  const out = {};
  for (const id of ids) out[id] = pickPlayerState(rawPlayersMap[id]);
  return out;
}

/** Drops the churning newsUpdated/searchRank fields before hashing. */
function stripHashFields(players) {
  const out = {};
  for (const id of Object.keys(players)) {
    const { newsUpdated, searchRank, ...rest } = players[id];
    out[id] = rest;
  }
  return out;
}

/**
 * sha256 of the hash-relevant player state (keys already sorted by
 * construction). Excludes newsUpdated/searchRank — see module doc.
 * @param {object} players
 * @returns {string}  hex digest
 */
export function playersHash(players) {
  return crypto.createHash('sha256').update(JSON.stringify(stripHashFields(players))).digest('hex');
}

function findLastSnapshot() {
  const files = listDir('nfl/players-state')
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort(); // lexicographic = chronological for YYYY-MM-DD names
  if (!files.length) return null;
  return files[files.length - 1]; // most recent
}

export async function updatePlayerState({ dryRun = false } = {}) {
  const today = todayDateString();
  const snapshotPath = `nfl/players-state/${today}.json`;

  // 1. Fetch
  console.log('[playerstate] Fetching Sleeper players map…');
  const raw = await fetchPlayersMap({ dryRun });

  // 2. Build
  const players = buildPlayersState(raw);
  console.log(`[playerstate] Built ${Object.keys(players).length} players`);

  // 3. Validate — drops malformed per-record entries with a warning in place;
  //    hard-throws only when the whole snapshot is unusable (lib/validate.mjs).
  validatePlayersState(players);
  const playerCount = Object.keys(players).length;
  console.log(`[playerstate] Validation passed (${playerCount} players)`);

  // 4. Dedup check
  const lastFile = findLastSnapshot();
  const lastEnvelope = lastFile ? readJson(`nfl/players-state/${lastFile}`) : null;
  const newHash = playersHash(players);
  const lastHash = lastEnvelope ? playersHash(lastEnvelope.players) : null;

  if (newHash === lastHash) {
    console.log(`[playerstate] Content identical to ${lastFile} — no new snapshot needed.`);
    return;
  }

  // 5. Dry-run exit
  if (dryRun) {
    console.log(`[playerstate] [dry-run] would write ${snapshotPath}: ${playerCount} players`);
    return;
  }

  // 6. Write snapshot
  const envelope = {
    schemaVersion: 1,
    date: today,
    capturedAt: new Date().toISOString(),
    source: 'sleeper:v1/players/nfl',
    positions: SKILL_POSITIONS,
    playerCount,
    players,
  };
  writeJsonStable(snapshotPath, envelope);
  console.log(`[playerstate] Wrote ${snapshotPath} (${playerCount} players)`);

  // 7. Update manifest — inProgress: false; each dated file is a completed,
  //    immutable capture, never re-exported (see Invariant 5 note).
  updateManifestEntry({
    path: snapshotPath,
    recordCount: playerCount,
    inProgress: false,
  });
  console.log('[playerstate] Manifest updated');
}
