/**
 * scripts/update-ktc.mjs — Weekly KTC dynasty value snapshot writer.
 *
 * Scrapes keeptradecut.com/dynasty-rankings (public, no auth) and writes
 * today's snapshot to ktc/snapshot-YYYY-MM-DD.json.
 *
 * Deduplication:
 *   - Compares normalized content hash of new snapshot vs the most recent
 *     existing snapshot file.
 *   - If identical: writes ktc/last-checked.json (so "ran, no change" is
 *     distinguishable from "didn't run") but does NOT write a new snapshot
 *     or touch the manifest. CI will see no changed data files → no commit.
 *   - If changed: writes the snapshot file and updates the manifest.
 *
 * Integrity guards (two layers):
 *   - Layer 1 (validateKtc, lib/validate.mjs): per-row + count validity. Hard-throws.
 *   - Layer 2 (ktcOrderingGuard, this file): Spearman rank correlation vs the last
 *     good snapshot, keyed on name. Recalibration preserves ordering (ρ≥0.998);
 *     breakage collapses it (ρ≤0.66). Below KTC_ORDERING_THRESHOLD the snapshot is
 *     QUARANTINED to ktc/quarantine/ (not committed to ktc/, not registered in the
 *     manifest) and the run signals CI via setStepOutput — data is never lost to a
 *     false trip. See .claude/tasks/ktc-integrity-guard.md.
 *
 * @param {object} opts
 * @param {boolean} opts.dryRun  Fetch + validate but don't write files
 */

import crypto from 'crypto';
import { fetchKtcSnapshot } from '../lib/ktc.mjs';
import { readJson, writeJsonStable, listDir, setStepOutput } from '../lib/io.mjs';
import { updateManifestEntry } from '../lib/manifest.mjs';
import { validateKtc } from '../lib/validate.mjs';
import { pearson } from '../lib/grade.mjs';   // Spearman = Pearson on ranks; reused per CLAUDE.md nav map

function todayDateString() {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

export function snapshotHash(players) {
  // Sort by name for stable hash regardless of fetch order
  const sorted = players
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  return crypto.createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

function findLastSnapshot() {
  const files = listDir('ktc')
    .filter(f => f.startsWith('snapshot-') && f.endsWith('.json'))
    .sort(); // lexicographic = chronological for YYYY-MM-DD names
  if (!files.length) return null;
  return files[files.length - 1]; // most recent
}

// Abort below this rank-order correlation. Calibrated empirically: legitimate
// recalibration sits at ρ ≥ 0.998; every breakage mode tested is ≤ 0.66 (see
// .claude/tasks/ktc-integrity-guard.md §1). 0.90 sits in the empty gap with ~0.10
// margin below real data and ~0.24 above the highest breakage.
export const KTC_ORDERING_THRESHOLD = 0.90;

// Below this many common players the correlation is not meaningful — skip (don't
// abort). Normal snapshot-to-snapshot overlap is ~490; a value-only selector break
// keeps names intact (names come from a different selector), so low overlap means
// genuine roster churn, not breakage. A name-selector break drops the count below
// 250 and is caught by Layer 1 instead.
export const KTC_MIN_OVERLAP = 100;

/** Average-rank transform with tie handling (ties → mean of their rank span). */
function rankTransform(values) {
  const order = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const ranks = new Array(values.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    const avg = (i + j) / 2 + 1;            // 1-based average rank
    for (let k = i; k <= j; k++) ranks[order[k][1]] = avg;
    i = j + 1;
  }
  return ranks;
}

/**
 * Spearman rank correlation between two snapshots, joined on player `name`
 * (intersection only). Returns { rho, n }. rho is null when undefined
 * (n < 2, or zero variance on either side — e.g. a constant-value break).
 *
 * @param {Array<{name,value}>} prevPlayers
 * @param {Array<{name,value}>} newPlayers
 * @returns {{ rho: number|null, n: number }}
 */
export function spearmanRho(prevPlayers, newPlayers) {
  const prevByName = new Map(prevPlayers.map(p => [p.name, p.value]));
  const xs = [], ys = [];
  for (const np of newPlayers) {
    if (prevByName.has(np.name)) { xs.push(prevByName.get(np.name)); ys.push(np.value); }
  }
  const n = xs.length;
  if (n < 2) return { rho: null, n };
  return { rho: pearson(rankTransform(xs), rankTransform(ys)), n };
}

/**
 * Aggregate breakage guard. Never throws — returns a verdict the caller acts on.
 *   { ok: true,  skipped: true, reason }      no prior / insufficient overlap
 *   { ok: true,  rho, n }                      ordering preserved
 *   { ok: false, rho, n, reason }              ordering collapsed → quarantine
 *
 * @param {Array|null} prevPlayers  last good snapshot, or null/[] if none
 * @param {Array}      newPlayers   freshly scraped snapshot
 * @param {object}     [opts]
 * @param {number}     [opts.threshold=KTC_ORDERING_THRESHOLD]
 */
export function ktcOrderingGuard(prevPlayers, newPlayers, { threshold = KTC_ORDERING_THRESHOLD } = {}) {
  if (!prevPlayers || prevPlayers.length === 0) {
    return { ok: true, skipped: true, reason: 'no prior snapshot' };
  }
  const { rho, n } = spearmanRho(prevPlayers, newPlayers);
  if (n < KTC_MIN_OVERLAP) {
    return { ok: true, skipped: true, reason: `only ${n} common players (< ${KTC_MIN_OVERLAP}) — roster churn, not breakage` };
  }
  if (rho === null) {
    return { ok: false, rho, n, reason: 'undefined rank correlation (zero variance) — likely constant-value selector break' };
  }
  if (rho < threshold) {
    return { ok: false, rho, n, reason: `Spearman ρ=${rho.toFixed(4)} < ${threshold} — ordering collapsed` };
  }
  return { ok: true, rho, n };
}

export async function updateKtc({ dryRun }) {
  const today = todayDateString();
  const snapshotPath = `ktc/snapshot-${today}.json`;
  const lastCheckedPath = 'ktc/last-checked.json';

  // 1. Fetch
  console.log('[ktc] Starting KTC snapshot fetch…');
  const players = await fetchKtcSnapshot({ dryRun });
  console.log(`[ktc] Fetched ${players.length} players`);

  // 2. Validate
  validateKtc(players);
  console.log('[ktc] Validation passed');

  // 3. Aggregate ordering guard vs last good snapshot.
  //    Skipped in dry-run (production write safety net) and on the first ever run
  //    (no last-checked.json → the only existing snapshots came from IndexedDB export,
  //    not this script, so they are not a trustworthy baseline).
  const lastFile     = findLastSnapshot();
  const lastPlayers  = lastFile ? readJson(`ktc/${lastFile}`) : null;
  const hasRunBefore = readJson(lastCheckedPath) !== null;

  if (!dryRun && hasRunBefore) {
    const guard = ktcOrderingGuard(lastPlayers, players);
    if (!guard.ok) {
      // Quarantine instead of hard-abort: preserve the rejected snapshot for manual
      // review so a false trip never permanently loses a day. Exit 0 so the workflow's
      // commit step persists the quarantine file; a trailing workflow step turns CI red.
      const quarantinePath = `ktc/quarantine/snapshot-${today}.json`;
      writeJsonStable(quarantinePath, players);
      writeJsonStable(`ktc/quarantine/snapshot-${today}.reason.json`, {
        quarantinedAt: new Date().toISOString(),
        reason: guard.reason,
        rho: guard.rho, n: guard.n, threshold: KTC_ORDERING_THRESHOLD,
        lastGood: lastFile, recordCount: players.length,
      });
      writeJsonStable(lastCheckedPath, {
        checkedAt: new Date().toISOString(), quarantined: true,
        file: quarantinePath, rho: guard.rho, reason: guard.reason,
      });
      setStepOutput('quarantined', 'true');
      setStepOutput('quarantine_reason', guard.reason);
      console.error(`[ktc] ORDERING GUARD TRIPPED — ${guard.reason}. Quarantined to ${quarantinePath}; NOT committed to ktc/. Review and promote manually if legitimate.`);
      return;
    }
    if (guard.skipped)        console.warn(`[ktc] Ordering guard skipped: ${guard.reason}`);
    else                      console.log(`[ktc] Ordering guard passed (ρ=${guard.rho.toFixed(4)}, n=${guard.n})`);
  }

  // 4. Dedup check
  const newHash = snapshotHash(players);
  const lastHash = lastPlayers ? snapshotHash(lastPlayers) : null;

  if (newHash === lastHash) {
    console.log(`[ktc] Content identical to ${lastFile} — no new snapshot needed.`);
    if (!dryRun) {
      writeJsonStable(lastCheckedPath, { checkedAt: new Date().toISOString(), identical: true });
      console.log('[ktc] Wrote last-checked.json (no change)');
    } else {
      console.log('[ktc] [dry-run] would write last-checked.json (no change)');
    }
    return;
  }

  // 5. Dry-run exit
  if (dryRun) {
    console.log(`[ktc] [dry-run] would write ${snapshotPath}: ${players.length} players`);
    return;
  }

  // 6. Write snapshot
  writeJsonStable(snapshotPath, players);
  console.log(`[ktc] Wrote ${snapshotPath} (${players.length} players)`);

  // 7. Write last-checked marker
  writeJsonStable(lastCheckedPath, { checkedAt: new Date().toISOString(), identical: false, file: snapshotPath });

  // 8. Update manifest
  updateManifestEntry({
    path: snapshotPath,
    recordCount: players.length,
    inProgress: true, // KTC snapshot is always "current value" data
  });
  console.log('[ktc] Manifest updated');
}
