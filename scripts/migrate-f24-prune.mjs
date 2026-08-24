/**
 * scripts/migrate-f24-prune.mjs — F-24 one-shot historical rewrite.
 *
 * Rewrites every completed nfl/season-totals/<year>.json file: drops idp_ and
 * punt-prefixed keys from every non-TEAM_ row's `stats` (the same denylist the
 * forward ingest path applies, lib/sleeper.mjs prunePlayerStats), writes the
 * result minified, and bumps the manifest entry to schemaVersion 4.
 *
 * In-place field delete only — never re-derives from Sleeper. A re-derivation
 * re-runs the dominant-team resolution against today's Sleeper and can silently
 * move a row's `team` (CR-02: scoring-load-bearing, no app-side diff), which is
 * exactly what this script must not risk. Guards enforce that:
 *   - row count and id set are unchanged
 *   - every row's `team` field is byte-identical before/after
 *   - validateNflSeason still passes
 *
 * Does NOT write a `schemaVersion` key into the season file itself — season-totals
 * files are a bare flat player map and the version lives only in the manifest
 * entry (Invariant 2 / Invariant 4). Does NOT apply D-1 bye inference — D-1 is
 * forward-only; history keeps 'X' (task file §5).
 *
 * Usage:
 *   node scripts/migrate-f24-prune.mjs            # rewrite + commit-ready write
 *   node scripts/migrate-f24-prune.mjs --dry-run   # report only, no writes
 */

import { readJson, writeJsonStable, listDir } from '../lib/io.mjs';
import { readManifest, updateManifestEntry } from '../lib/manifest.mjs';
import { validateNflSeason } from '../lib/validate.mjs';
import { prunePlayerStats } from '../lib/sleeper.mjs';

const SEASON_DIR = 'nfl/season-totals';

/**
 * @param {object} before
 * @param {object} after
 * @returns {Array<{ id: string, teamBefore: *, teamAfter: * }>}
 */
export function teamDiff(before, after) {
  const diffs = [];
  for (const [id, row] of Object.entries(before)) {
    const teamBefore = row.team ?? null;
    const teamAfter = after[id]?.team ?? null;
    if (teamBefore !== teamAfter) diffs.push({ id, teamBefore, teamAfter });
  }
  return diffs;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const manifest = readManifest();

  const files = listDir(SEASON_DIR).filter(f => f.endsWith('.json')).sort();
  console.log(`[migrate-f24-prune] Found ${files.length} season file(s) in ${SEASON_DIR}/.`);

  let totalDroppedKeys = 0;

  for (const file of files) {
    const relPath = `${SEASON_DIR}/${file}`;
    const before = readJson(relPath);
    if (!before) {
      console.warn(`[migrate-f24-prune] ${relPath} missing — skipping`);
      continue;
    }

    const after = JSON.parse(JSON.stringify(before));
    prunePlayerStats(after);

    const idsBefore = Object.keys(before).sort();
    const idsAfter = Object.keys(after).sort();
    if (idsBefore.length !== idsAfter.length || idsBefore.some((id, i) => id !== idsAfter[i])) {
      throw new Error(`[migrate-f24-prune] ${relPath}: row id set changed — refusing to write.`);
    }

    const diffs = teamDiff(before, after);
    if (diffs.length > 0) {
      throw new Error(
        `[migrate-f24-prune] ${relPath}: team field changed for ${diffs.length} row(s) — ` +
        `an in-place prune must never move team. First: ${JSON.stringify(diffs[0])}`
      );
    }

    let droppedKeys = 0;
    for (const [id, row] of Object.entries(before)) {
      const beforeKeys = Object.keys(row.stats ?? {}).length;
      const afterKeys = Object.keys(after[id].stats ?? {}).length;
      droppedKeys += beforeKeys - afterKeys;
    }
    totalDroppedKeys += droppedKeys;

    const year = Number(file.replace('.json', ''));
    validateNflSeason(after, { year });

    if (dryRun) {
      console.log(`[migrate-f24-prune] [dry-run] ${relPath}: would drop ${droppedKeys} keys across ${idsAfter.length} rows`);
      continue;
    }

    writeJsonStable(relPath, after, { minify: true });

    const existingEntry = manifest.files[relPath] ?? {};
    updateManifestEntry({
      path: relPath,
      recordCount: idsAfter.length,
      inProgress: existingEntry.inProgress ?? false,
      schemaVersion: 4,
    });

    console.log(`[migrate-f24-prune] ${relPath}: dropped ${droppedKeys} keys, schemaVersion → 4`);
  }

  console.log(`[migrate-f24-prune] Done. ${totalDroppedKeys} key(s) dropped total across ${files.length} file(s).`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
