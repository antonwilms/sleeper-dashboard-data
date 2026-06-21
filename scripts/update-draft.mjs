/**
 * scripts/update-draft.mjs — nflverse combined draft picks writer.
 *
 * Fetches the single combined draft_picks.csv from the nflverse draft_picks
 * release asset, normalises to a by-year JSON, and writes to
 * nflverse/draft/draft_picks.json.
 *
 * Key behaviours:
 *   - Content-hash dedup: if picksByYear identical to existing file → no write.
 *   - --dry-run: fetch + validate, print plan, no writes.
 *   - inProgress: false (cross-repo contract — app reads it unconditionally).
 *
 * @param {object} opts
 * @param {boolean} opts.dryRun  Fetch + validate, print plan, no writes
 * @param {boolean} opts.force   (accepted for API consistency; not used — no past-season gate)
 */

import crypto from 'crypto';
import { fetchDraftCsv, parseDraftCsv, fetchDraftTimestamp } from '../lib/nflverse.mjs';
import { readJson, writeJsonStable } from '../lib/io.mjs';
import { updateManifestEntry } from '../lib/manifest.mjs';
import { validateDraft } from '../lib/validate.mjs';

const DRAFT_PATH = 'nflverse/draft/draft_picks.json';

export function picksByYearHash(picksByYear) {
  // Sort years and picks within each year for a stable hash regardless of CSV row order.
  const years = Object.keys(picksByYear).sort();
  const stable = Object.fromEntries(
    years.map(yr => [
      yr,
      [...picksByYear[yr]].sort((a, b) => a.round - b.round || a.pick - b.pick),
    ])
  );
  return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

export async function updateDraft({ dryRun = false, force = false } = {}) {
  // 1. Fetch CSV (draft file always exists — 404 is unexpected, throw)
  console.log('[draft] Fetching draft_picks.csv…');
  const csv = await fetchDraftCsv();

  if (csv === null) {
    throw new Error(
      '[draft] draft_picks.csv returned 404/504 — unexpected (file should always be published). ' +
      'Check https://github.com/nflverse/nflverse-data/releases/tag/draft_picks'
    );
  }

  // Fetch timestamp for sourceLastUpdated metadata (best-effort, non-fatal)
  const sourceLastUpdated = await fetchDraftTimestamp();
  if (sourceLastUpdated) {
    console.log(`[draft] Source last updated: ${sourceLastUpdated}`);
  }

  // 2. Parse
  const { picksByYear, count } = parseDraftCsv(csv);
  console.log(`[draft] Parsed ${count} picks across ${Object.keys(picksByYear).length} years`);

  // 3. Validate
  validateDraft(picksByYear);
  console.log('[draft] Validation passed');

  // 4. Content-hash dedup
  const existing = readJson(DRAFT_PATH);
  const newHash  = picksByYearHash(picksByYear);
  const lastHash = existing?.picksByYear ? picksByYearHash(existing.picksByYear) : null;

  if (newHash === lastHash) {
    console.log(`[draft] Content identical to existing ${DRAFT_PATH} — no change.`);
    return;
  }

  // 5. Dry-run exit
  if (dryRun) {
    console.log(`[draft] [dry-run] would write ${DRAFT_PATH}: ${count} picks`);
    return;
  }

  // 6. Write
  const output = {
    schemaVersion:      1,
    generatedAt:        new Date().toISOString(),
    sourceLastUpdated:  sourceLastUpdated ?? null,
    count,
    picksByYear,
  };
  writeJsonStable(DRAFT_PATH, output);
  console.log(`[draft] Wrote ${DRAFT_PATH} (${count} picks)`);

  // 7. Update manifest (inProgress: false — cross-repo contract)
  updateManifestEntry({
    path:         DRAFT_PATH,
    recordCount:  count,
    inProgress:   false,
    schemaVersion: 1,
  });
  console.log('[draft] Manifest updated');
}
