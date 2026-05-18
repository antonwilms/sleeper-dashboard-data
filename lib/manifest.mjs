/**
 * lib/manifest.mjs — Read and update manifest.json.
 *
 * The manifest is the contract between writer (these scripts) and reader
 * (the app's dataStore.js). Scripts call updateManifestEntry() once per run,
 * after all data files are written and validated.
 *
 * updateManifestEntry adds `lastModified` to each file entry so the app
 * can detect when the data store has been updated since the user's last
 * cache fill. schemaVersion: 1 is written per file entry so the app's
 * MAX_SUPPORTED_SCHEMA gate can skip files it doesn't understand.
 */

import { readJson, writeJsonStable } from './io.mjs';

const MANIFEST_PATH = 'manifest.json';

/** Returns the parsed manifest object. */
export function readManifest() {
  const m = readJson(MANIFEST_PATH);
  if (!m) throw new Error('manifest.json not found — run from the repo root');
  return m;
}

/**
 * Updates a single file entry in manifest.json and writes it back.
 *
 * @param {object} opts
 * @param {string}  opts.path          Repo-relative data path, e.g. 'nfl/season-totals/2023.json'
 * @param {number}  opts.recordCount   Number of records (players or rows)
 * @param {boolean} opts.inProgress    True if this file covers an in-progress season
 */
export function updateManifestEntry({ path, recordCount, inProgress }) {
  const manifest = readManifest();

  manifest.schemaVersion ??= 1;
  manifest.generatedAt = new Date().toISOString();

  // Preserve any existing fields on the entry (e.g. originalKey from legacy exports)
  const existing = manifest.files[path] ?? {};
  manifest.files[path] = {
    ...existing,
    schemaVersion: 1,
    recordCount,
    inProgress,
    lastModified: new Date().toISOString(),
  };

  writeJsonStable(MANIFEST_PATH, manifest);
}
