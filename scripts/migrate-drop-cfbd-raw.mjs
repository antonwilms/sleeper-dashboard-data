/**
 * scripts/migrate-drop-cfbd-raw.mjs — one-shot manifest prune (E1).
 *
 * Removes the eight `raw/cfbd-players-<year>.json` manifest entries (2017–2024) after the
 * corresponding files are `git rm`'d. Nothing reads these files (data repo or app repo) and
 * the seven raw CFBD categories they hold with no ingest path stay permanently recoverable
 * from commit 82235d2, so the deletion is safe even though most of the content cannot be
 * re-fetched. See .claude/tasks/repo-weight.md §1.3 for the full justification and the
 * recovery command.
 *
 * `lib/manifest.mjs` has no delete helper — `updateManifestEntry` is a single-path upsert —
 * so this mutates the manifest object directly: readManifest(), delete the eight entries,
 * writeJsonStable('manifest.json', manifest). Follows scripts/migrate-manifest-truth.mjs for
 * structure (one-shot, --dry-run, explicit before/after guards, left in the tree).
 *
 * Selects strictly on the `raw/cfbd-players-` key prefix — never a line range, never
 * `originalKey` — so a future entry with a different name never gets silently swept in.
 *
 * generatedAt is bumped: the manifest genuinely changes (eight entries removed), and every
 * other manifest writer in this repo (updateManifestEntry, setManifestInProgress,
 * migrate-manifest-truth.mjs) bumps it on a write.
 *
 * Usage:
 *   node scripts/migrate-drop-cfbd-raw.mjs            # rewrite + commit-ready write
 *   node scripts/migrate-drop-cfbd-raw.mjs --dry-run   # report only, no writes
 */

import { readManifest } from '../lib/manifest.mjs';
import { writeJsonStable } from '../lib/io.mjs';

const KEY_PREFIX = 'raw/cfbd-players-';
const EXPECTED_REMOVED = 8;

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const manifest = readManifest();

  const entryCountBefore = Object.keys(manifest.files).length;
  const before = JSON.parse(JSON.stringify(manifest.files));

  const targets = Object.keys(manifest.files).filter(k => k.startsWith(KEY_PREFIX));
  console.log(`[migrate-drop-cfbd-raw] Found ${targets.length} entries with prefix "${KEY_PREFIX}".`);

  if (targets.length !== EXPECTED_REMOVED) {
    throw new Error(`[migrate-drop-cfbd-raw] expected exactly ${EXPECTED_REMOVED} matching entries, found ${targets.length} — refusing to write.`);
  }

  for (const path of targets) {
    delete manifest.files[path];
    if (dryRun) {
      console.log(`[migrate-drop-cfbd-raw] [dry-run] would remove ${path}`);
    }
  }

  // Guards — enforced whether or not this is a dry run, against the in-memory result.
  const entryCountAfter = Object.keys(manifest.files).length;
  if (entryCountAfter !== entryCountBefore - EXPECTED_REMOVED) {
    throw new Error(`[migrate-drop-cfbd-raw] entry count ${entryCountBefore} → ${entryCountAfter}, expected ${entryCountBefore - EXPECTED_REMOVED} — refusing to write.`);
  }

  for (const [path, entry] of Object.entries(manifest.files)) {
    if (JSON.stringify(entry) !== JSON.stringify(before[path])) {
      throw new Error(`[migrate-drop-cfbd-raw] ${path}: surviving entry changed — refusing to write.`);
    }
  }

  console.log(
    `[migrate-drop-cfbd-raw] ${targets.length} entries removed. Entry count ${entryCountBefore} → ${entryCountAfter}.`
  );

  if (dryRun) {
    console.log('[migrate-drop-cfbd-raw] [dry-run] no write performed.');
    return;
  }

  manifest.generatedAt = new Date().toISOString();
  writeJsonStable('manifest.json', manifest);
  console.log('[migrate-drop-cfbd-raw] manifest.json written.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
