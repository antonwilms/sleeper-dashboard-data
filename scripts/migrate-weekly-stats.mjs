/**
 * scripts/migrate-weekly-stats.mjs — Invariant-1 rewrite #4 — weekly-scoring-keys (D-47) C1:
 * adds `weeklyStats` (and ONLY `weeklyStats`) to the completed seasons 2012–2025 of
 * nfl/season-totals/<year>.json by RE-FETCHING the weeks (through a raw-week cache), so the history
 * carries the same per-week scoring keys the forward ingest now writes.
 *
 * This is an enrichment, not an error correction — Invariant 1 names corrections — and is recorded as
 * the same kind of named exception as F-24 (#1). Confirmed by Anton 2026-10-15. Every other field
 * must be deep-equal before/after, so CR-02's dominant-team rule and CR-28's absence state cannot
 * move; a row whose fresh fetch disagrees with the stored row simply gets no field (it is NOT
 * "corrected"; the app ratio-scales such a row).
 *
 * Per season: fetch the weeks (cache), aggregateWeeks(weekData) with NO schedule, use it only as the
 * source of `weeklyStats`. attachWeeklyStats (pure, exported) attaches iff the fresh row exists, its
 * 'P' week set and weeklyPoints equal the stored ones, and Σ weeks === stored stats[k] for every key
 * in the union of kept stored-stats keys and fresh weeklyStats keys. TEAM_* and gamesPlayed 0 rows
 * are skipped. Guards (each a throw naming season and id): id set unchanged; every field other than
 * weeklyStats deep-equal; omitted ÷ played ≤ 0.5%; validateNflSeason passes (requireWeeklyStats
 * false — omitted rows legitimately lack the field); idempotent (a row already carrying weeklyStats
 * must re-derive to a deep-equal value).
 *
 * `--weeks-cache <dir>` is required and must resolve outside the repo (fetchSeasonWeeks enforces it);
 * the grade (bin/backtest.mjs --weekly-basis) uses the same dir, so both score the same bytes.
 *
 * Usage:
 *   node scripts/migrate-weekly-stats.mjs --weeks-cache <dir> --dry-run   # report only
 *   node scripts/migrate-weekly-stats.mjs --weeks-cache <dir>             # rewrite (Stage C1)
 */

import zlib from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { readJson, writeJsonStable } from '../lib/io.mjs';
import { readManifest, updateManifestEntry } from '../lib/manifest.mjs';
import { validateNflSeason } from '../lib/validate.mjs';
import { fetchSeasonWeeks, aggregateWeeks, isWeeklyStatsExcluded } from '../lib/sleeper.mjs';

const SEASON_RE = /^nfl\/season-totals\/(\d{4})\.json$/;
export const MIN_MIGRATE_SEASON = 2012;
export const MAX_OMITTED_SHARE = 0.005;
export const OMIT_REASONS = ['missing', 'weeks', 'points', 'sums'];

export const DEFAULT_DEPS = {
  readManifest, readJson, writeJsonStable, updateManifestEntry, validateNflSeason, fetchSeasonWeeks,
};

/** True for rows the migration considers: non-TEAM_* with gamesPlayed > 0. */
export function isMigrationRow(id, row) {
  return !id.startsWith('TEAM_') && row != null && row.gamesPlayed > 0;
}

const playedWeeks = row => (row.weeklyStatus ?? []).flatMap((s, i) => (s === 'P' ? [String(i + 1)] : []));

/**
 * Pure per-row guard. Returns `{ row, reason }`: `row` is the stored row with `weeklyStats` added and
 * `reason: null`, or the stored row unchanged with the reason it was refused
 * (`missing` / `weeks` / `points` / `sums`).
 */
export function attachWeeklyStats(storedRow, freshRow) {
  if (!freshRow) return { row: storedRow, reason: 'missing' };
  const sp = playedWeeks(storedRow);
  const fp = playedWeeks(freshRow);
  if (sp.length !== fp.length || sp.some((w, i) => w !== fp[i])) return { row: storedRow, reason: 'weeks' };
  if (!isDeepStrictEqual(freshRow.weeklyPoints, storedRow.weeklyPoints)) return { row: storedRow, reason: 'points' };
  const ws = freshRow.weeklyStats ?? {};
  const keys = new Set();
  for (const k of Object.keys(storedRow.stats ?? {})) if (!isWeeklyStatsExcluded(k)) keys.add(k);
  for (const wk of Object.values(ws)) for (const k of Object.keys(wk)) keys.add(k);
  for (const k of keys) {
    let sum = 0;
    for (const wk of Object.values(ws)) sum += wk[k] ?? 0;
    if (Math.abs(sum - (storedRow.stats?.[k] ?? 0)) > 1e-6) return { row: storedRow, reason: 'sums' };
  }
  return { row: { ...storedRow, weeklyStats: ws }, reason: null };
}

const byteSize = rows => {
  const json = JSON.stringify(rows);
  return { raw: Buffer.byteLength(json), gz: zlib.gzipSync(json).length };
};

/**
 * Builds the migrated season. Throws on any guard violation.
 * @returns {{ after, attached, omitted: {missing,weeks,points,sums}, played }}
 */
export function migrateSeasonRows(before, fresh, { relPath, year }, d = DEFAULT_DEPS) {
  const fail = (id, why) => { throw new Error(`[migrate-weekly-stats] ${relPath} (${year}) ${id}: ${why} — refusing to write.`); };
  const after = {};
  const omitted = { missing: 0, weeks: 0, points: 0, sums: 0 };
  let attached = 0;
  let played = 0;
  for (const [id, row] of Object.entries(before)) {
    if (!isMigrationRow(id, row)) { after[id] = row; continue; }
    played++;
    const r = attachWeeklyStats(row, fresh[id]);
    if (row.weeklyStats !== undefined) {   // idempotency: an existing field must re-derive identically
      if (r.reason !== null || !isDeepStrictEqual(r.row.weeklyStats, row.weeklyStats)) {
        fail(id, 'already carries weeklyStats that does not re-derive to a deep-equal value');
      }
    }
    after[id] = r.row;
    if (r.reason === null) attached++; else omitted[r.reason]++;
  }

  const idsBefore = Object.keys(before).sort();
  const idsAfter = Object.keys(after).sort();
  if (idsBefore.length !== idsAfter.length || idsBefore.some((id, i) => id !== idsAfter[i])) fail('*', 'row id set changed');
  for (const id of idsBefore) {
    const b = before[id];
    const a = after[id];
    for (const k of new Set([...Object.keys(b), ...Object.keys(a)])) {
      if (k === 'weeklyStats') continue;
      if (!isDeepStrictEqual(b[k], a[k])) fail(id, `field "${k}" changed`);
    }
  }
  const omittedTotal = Object.values(omitted).reduce((s, n) => s + n, 0);
  if (played > 0 && omittedTotal / played > MAX_OMITTED_SHARE) {
    fail('*', `omitted ${omittedTotal}/${played} played rows (${(100 * omittedTotal / played).toFixed(2)}%) exceeds ${MAX_OMITTED_SHARE * 100}%`);
  }
  d.validateNflSeason(after, { year });
  return { after, attached, omitted, played };
}

/**
 * @returns {Promise<Array<{ year, relPath, attached, omitted, played, bytes:{before,after}, written }>>}
 */
export async function migrateWeeklyStats({ weeksCache, dryRun = false, deps = {} } = {}) {
  if (!weeksCache) throw new Error('[migrate-weekly-stats] --weeks-cache <dir> is required');
  const d = { ...DEFAULT_DEPS, ...deps };
  const manifest = d.readManifest();
  const seasons = Object.entries(manifest.files)
    .map(([relPath, entry]) => ({ relPath, entry, m: SEASON_RE.exec(relPath) }))
    .filter(x => x.m)
    .map(x => ({ ...x, year: Number(x.m[1]) }))
    .filter(x => x.entry.inProgress === false && x.year >= MIN_MIGRATE_SEASON)
    .sort((a, b) => a.year - b.year);

  const table = [];
  for (const { relPath, year } of seasons) {
    const before = d.readJson(relPath);
    if (!before) throw new Error(`[migrate-weekly-stats] ${relPath} is in the manifest but missing.`);
    const weekData = await d.fetchSeasonWeeks(year, { dryRun: true, cacheDir: weeksCache });
    const failedWeeks = weekData.filter(w => w.failed).map(w => w.week);
    if (failedWeeks.length) throw new Error(`[migrate-weekly-stats] ${year}: week(s) ${failedWeeks.join(', ')} failed to fetch — refusing to write.`);
    const fresh = aggregateWeeks(weekData);   // no schedule: used only as the source of weeklyStats
    const { after, attached, omitted, played } = migrateSeasonRows(before, fresh, { relPath, year }, d);

    let written = false;
    if (!dryRun) {
      d.writeJsonStable(relPath, after, { minify: true });
      d.updateManifestEntry({ path: relPath, recordCount: Object.keys(after).length, inProgress: false, schemaVersion: 4 });
      written = true;
    }
    table.push({ year, relPath, attached, omitted, played, bytes: { before: byteSize(before), after: byteSize(after) }, written });
  }
  return table;
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const i = argv.indexOf('--weeks-cache');
  const weeksCache = i !== -1 ? argv[i + 1] : null;
  const table = await migrateWeeklyStats({ weeksCache, dryRun });
  console.log(`[migrate-weekly-stats] ${dryRun ? '[dry-run] ' : ''}season | attached/played | omitted (missing/weeks/points/sums) | raw B before→after | gz B before→after`);
  for (const t of table) {
    const o = t.omitted;
    console.log(`${t.year} | ${t.attached}/${t.played} | ${o.missing}/${o.weeks}/${o.points}/${o.sums} | ${t.bytes.before.raw}→${t.bytes.after.raw} | ${t.bytes.before.gz}→${t.bytes.after.gz}`);
  }
  const att = table.reduce((s, t) => s + t.attached, 0);
  const pl = table.reduce((s, t) => s + t.played, 0);
  console.log(`[migrate-weekly-stats] Total: ${att}/${pl} played rows attached across ${table.length} season(s)${dryRun ? ' (not written)' : ''}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err); process.exit(1); });
}
