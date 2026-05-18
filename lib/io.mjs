/**
 * lib/io.mjs — JSON read/write helpers with stable formatting.
 *
 * writeJsonStable uses 2-space indent and a trailing newline, matching
 * the existing data files in this repo.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// fileURLToPath handles URL-encoded characters (e.g. spaces → %20) correctly.
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Resolves a repo-relative path to an absolute path. */
export function repoPath(...parts) {
  return path.join(REPO_ROOT, ...parts);
}

/**
 * Reads a JSON file at a repo-relative path.
 * Returns the parsed value, or null if the file does not exist.
 */
export function readJson(relPath) {
  const abs = repoPath(relPath);
  if (!fs.existsSync(abs)) return null;
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

/**
 * Writes a value as formatted JSON to a repo-relative path.
 * Creates parent directories if needed.
 * Uses 2-space indentation and a trailing newline.
 */
export function writeJsonStable(relPath, value) {
  const abs = repoPath(relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

/**
 * Lists files in a repo-relative directory.
 * Returns an empty array if the directory doesn't exist.
 */
export function listDir(relDir) {
  const abs = repoPath(relDir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs);
}

/**
 * Computes a simple diff summary between two NFL season total objects.
 * Both are { [player_id]: { fantasyPoints, gamesPlayed, ... } }.
 * Returns { identical: boolean, text: string }.
 */
export function diffSummary(existing, updated) {
  const existingIds = new Set(Object.keys(existing));
  const updatedIds = new Set(Object.keys(updated));

  const added = [...updatedIds].filter(id => !existingIds.has(id));
  const removed = [...existingIds].filter(id => !updatedIds.has(id));

  const changed = [];
  for (const id of existingIds) {
    if (!updatedIds.has(id)) continue;
    const oldPts = existing[id].fantasyPoints ?? 0;
    const newPts = updated[id].fantasyPoints ?? 0;
    const delta = Math.abs(newPts - oldPts);
    if (delta > 0.01) changed.push({ id, oldPts, newPts, delta });
  }
  changed.sort((a, b) => b.delta - a.delta);

  if (added.length === 0 && removed.length === 0 && changed.length === 0) {
    return { identical: true, text: 'no change' };
  }

  const top5 = changed.slice(0, 5).map(
    c => `  player ${c.id}: ${c.oldPts.toFixed(2)} → ${c.newPts.toFixed(2)} (Δ${c.delta.toFixed(2)})`
  );
  const parts = [];
  if (added.length) parts.push(`${added.length} added`);
  if (removed.length) parts.push(`${removed.length} removed`);
  if (changed.length) parts.push(`${changed.length} changed`);

  const text = parts.join(', ') + (top5.length ? `\nTop diffs:\n${top5.join('\n')}` : '');
  return { identical: false, text };
}
