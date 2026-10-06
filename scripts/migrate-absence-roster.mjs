/**
 * scripts/migrate-absence-roster.mjs — Invariant-1 correction #3 — absence-classification-c.md
 * C-D1: rewrites `weeklyStatus`/`dnpWeeks`/`availability` of completed seasons in place; never
 * re-fetches.
 *
 * For every completed (`inProgress: false`) nfl/season-totals/<year>.json from
 * MIN_ABSENCE_CLASSIFY_SEASON (2016) on, runs classifyAbsences against
 * nflverse/rosterweekly/<year>.json and turns `'X'` weeks into `'D'` where the weekly roster lists
 * the player ACT/INA/RES/PUP on a team that played (CR-28). A re-fetch would also pull every
 * unrelated Sleeper stat correction since the season was sealed and re-run the dominant-team rule
 * (CR-02: scoring-load-bearing, no app-side diff), so this script only rewrites in place.
 *
 * Guards (each a throw naming the season and id): id set unchanged; every field other than
 * weeklyStatus/dnpWeeks/availability deep-equal; every changed slot 'X' → 'D'; dnpWeeks delta equals
 * the changed-slot count; validateNflSeason passes. One-way: 'D' never goes back to 'X' here, and
 * the Sleeper-only baseline is not kept — see CR-28's Mirror. Idempotent: a second run changes
 * nothing. Does not write a `schemaVersion` key into the season file (manifest-only).
 *
 * Usage:
 *   node scripts/migrate-absence-roster.mjs            # rewrite
 *   node scripts/migrate-absence-roster.mjs --dry-run  # report only, no writes
 */

import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { readJson, writeJsonStable } from '../lib/io.mjs';
import { readManifest, updateManifestEntry } from '../lib/manifest.mjs';
import { validateNflSeason } from '../lib/validate.mjs';
import { classifyAbsences, MIN_ABSENCE_CLASSIFY_SEASON } from '../lib/absence.mjs';

const SEASON_RE = /^nfl\/season-totals\/(\d{4})\.json$/;
const REWRITTEN = new Set(['weeklyStatus', 'dnpWeeks', 'availability']);

export const DEFAULT_DEPS = {
  readManifest, readJson, writeJsonStable, updateManifestEntry, validateNflSeason, classifyAbsences,
};

/** Throws unless `after` is a pure 'X' → 'D' correction of `before` (see header). */
export function assertCorrectionGuards(before, after, { relPath, year }, d = DEFAULT_DEPS) {
  const fail = (id, why) => { throw new Error(`[migrate-absence-roster] ${relPath} (${year}) ${id}: ${why} — refusing to write.`); };
  const idsBefore = Object.keys(before).sort();
  const idsAfter = Object.keys(after).sort();
  if (idsBefore.length !== idsAfter.length || idsBefore.some((id, i) => id !== idsAfter[i])) {
    fail('*', 'row id set changed');
  }
  for (const id of idsBefore) {
    const b = before[id];
    const a = after[id];
    const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
    for (const k of keys) {
      if (REWRITTEN.has(k)) continue;
      if (!isDeepStrictEqual(b[k], a[k])) fail(id, `field "${k}" changed`);
    }
    const sb = b.weeklyStatus;
    const sa = a.weeklyStatus;
    if (!Array.isArray(sb) || !Array.isArray(sa) || sb.length !== sa.length) fail(id, 'weeklyStatus shape changed');
    let n = 0;
    sb.forEach((s, i) => {
      if (s === sa[i]) return;
      if (s !== 'X' || sa[i] !== 'D') fail(id, `slot ${i + 1} went '${s}' → '${sa[i]}' (only 'X' → 'D' allowed)`);
      n++;
    });
    if ((a.dnpWeeks ?? 0) - (b.dnpWeeks ?? 0) !== n) {
      fail(id, `dnpWeeks ${b.dnpWeeks} → ${a.dnpWeeks} does not match ${n} changed slot(s)`);
    }
  }
  d.validateNflSeason(after, { year });
}

/**
 * @returns {Array<{ year, relPath, changedSlots, changedRows, byStatus, written }>} one row per
 *   in-scope season, in ascending year order.
 */
export function migrateAbsenceRoster({ dryRun = false, deps = {} } = {}) {
  const d = { ...DEFAULT_DEPS, ...deps };
  const manifest = d.readManifest();
  const seasons = Object.entries(manifest.files)
    .map(([relPath, entry]) => ({ relPath, entry, m: SEASON_RE.exec(relPath) }))
    .filter(x => x.m)
    .map(x => ({ ...x, year: Number(x.m[1]) }))
    .filter(x => x.entry.inProgress === false && x.year >= MIN_ABSENCE_CLASSIFY_SEASON)
    .sort((a, b) => a.year - b.year);

  const table = [];
  for (const { relPath, year } of seasons) {
    const before = d.readJson(relPath);
    if (!before) throw new Error(`[migrate-absence-roster] ${relPath} is in the manifest but missing.`);
    const rosterPath = `nflverse/rosterweekly/${year}.json`;
    const roster = d.readJson(rosterPath);
    if (!roster?.players) throw new Error(`[migrate-absence-roster] ${rosterPath} missing — run 'node bin/update.mjs rosterweekly --year ${year}' first.`);

    const r = d.classifyAbsences(before, roster.players, { season: year });
    assertCorrectionGuards(before, r.totals, { relPath, year }, d);

    let written = false;
    if (r.changedSlots > 0 && !dryRun) {
      d.writeJsonStable(relPath, r.totals, { minify: true });
      d.updateManifestEntry({ path: relPath, recordCount: Object.keys(r.totals).length, inProgress: false, schemaVersion: 4 });
      written = true;
    }
    table.push({ year, relPath, changedSlots: r.changedSlots, changedRows: r.changedRows, byStatus: r.byStatus, written });
  }
  return table;
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const table = migrateAbsenceRoster({ dryRun });
  console.log(`[migrate-absence-roster] ${dryRun ? '[dry-run] ' : ''}season | changedSlots | changedRows | byStatus`);
  for (const t of table) console.log(`${t.year} | ${t.changedSlots} | ${t.changedRows} | ${JSON.stringify(t.byStatus)}`);
  const slots = table.reduce((s, t) => s + t.changedSlots, 0);
  const rows = table.reduce((s, t) => s + t.changedRows, 0);
  console.log(`[migrate-absence-roster] Total: ${slots} slot(s) in ${rows} row(s) across ${table.length} season(s)${dryRun ? ' (not written)' : ''}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { main(); } catch (err) { console.error(err); process.exit(1); }
}
