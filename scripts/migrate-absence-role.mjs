/**
 * scripts/migrate-absence-role.mjs — Invariant-1 correction #5 — d76-absence-role.md (D-76).
 *
 * Rewrites `weeklyStatus`/`dnpWeeks`/`availability` of completed season-totals in place; never
 * re-fetches (a re-fetch would also pull unrelated Sleeper stat corrections and re-run the CR-02
 * dominant-team rule). For every completed (`inProgress: false`) nfl/season-totals/<year>.json from
 * MIN_ABSENCE_CLASSIFY_SEASON (2016) on it runs the ingest's own classifyAbsences against
 * nflverse/rosterweekly/<year>.json: a Sleeper 'D' whose roster listing that week has no
 * ACT/INA/RES/PUP on a team that played (practice squad, cut, exempt, transfer — a role week, not a
 * missed game) becomes 'X' (CR-28). No new code; 'X' already means "no game recorded".
 *
 * An in-place rewrite of a completed `nfl/season-totals` file triggers CR-30 — bump the app's
 * `SEASON_TOTALS_CACHE_REVISION` and push it after the purge verifies; a new season-totals `migrate-*`
 * adds itself to CR-30's Data field. (This script's entry point `migrateAbsenceRole` is that field.)
 *
 * Guards (assertRoleGuards, each a throw naming season, id and slot): row id set unchanged; every
 * field other than weeklyStatus/dnpWeeks/availability deep-equal; every changed slot 'D' → 'X' (zero
 * 'X' → 'D'); an independent re-derivation of each changed slot from the roster file; dnpWeeks delta
 * equals the changed-slot count; availability equals computeAvailability(weeklyStatus) with
 * firstWeek/lastWeek/absenceCause unchanged; validateNflSeason passes; idempotent.
 *
 * Modes (exactly three; `--report <basePath>` is required in every mode and names <basePath>.md +
 * <basePath>.json — relative: under verification/ in the repo; absolute: outside the repo):
 *   --dry-run --out-dir <abs dir outside repo> --report <base>   would-be season files → out dir
 *   --report <base>                                              write in place (Stage B)
 *   --report-only --before-rev <rev> --report <base>             report only; before = git show
 */

import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readJson, writeJsonStable, writeJsonStableAt, repoPath } from '../lib/io.mjs';
import { readManifest, updateManifestEntry } from '../lib/manifest.mjs';
import { validateNflSeason } from '../lib/validate.mjs';
import { computeAvailability } from '../lib/sleeper.mjs';
import {
  classifyAbsences, teamPlayedWeeks, MISSED_ROSTER_STATUSES, MIN_ABSENCE_CLASSIFY_SEASON,
} from '../lib/absence.mjs';

const SEASON_RE = /^nfl\/season-totals\/(\d{4})\.json$/;
const REWRITTEN = new Set(['weeklyStatus', 'dnpWeeks', 'availability']);
const AVAILABILITY_CHANGEABLE = new Set(['absenceSegments', 'longestAbsence', 'returnedFromAbsence']);
const AVAILABILITY_FIXED = ['firstWeek', 'lastWeek', 'absenceCause'];
const SKILL = new Set(['QB', 'RB', 'WR', 'TE']);
const PLAYERS_PATH = 'raw/-players-nfl.json';
const TOOL_VERSION = 1;
const SPOT_ROWS = [{ year: 2021, id: '2944' }, { year: 2020, id: '7496' }];

const sha256 = text => crypto.createHash('sha256').update(text).digest('hex');
const byteLen = text => Buffer.byteLength(text, 'utf8');
const serialize = value => JSON.stringify(value) + '\n';   // the minified writeJsonStable shape

const isUnder = (root, target) => {
  const rel = path.relative(root, target);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
};

export const DEFAULT_DEPS = {
  repoRoot: path.resolve(repoPath()),
  readManifest, readJson, writeJsonStable, writeJsonStableAt, updateManifestEntry,
  validateNflSeason, classifyAbsences,
  readText: relPath => {
    const abs = repoPath(relPath);
    return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
  },
  writeText: (absPath, text) => {
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, text, 'utf8');
  },
  exists: absPath => fs.existsSync(absPath),
  gitShow: (rev, relPath) => execFileSync('git', ['show', `${rev}:${relPath}`],
    { cwd: repoPath(), maxBuffer: 1 << 30 }).toString(),
};

// ── guards ───────────────────────────────────────────────────────────────────────────────────────

/** Throws unless `after` is a pure role-week 'D' → 'X' correction of `before` (see header). */
export function assertRoleGuards(before, after, rosterPlayers, { relPath, year }, d = DEFAULT_DEPS) {
  const fail = (id, why) => { throw new Error(`[migrate-absence-role] ${relPath} (${year}) ${id}: ${why} — refusing to proceed.`); };
  // 1. id set
  const idsBefore = Object.keys(before).sort();
  const idsAfter = Object.keys(after).sort();
  if (idsBefore.length !== idsAfter.length || idsBefore.some((id, i) => id !== idsAfter[i])) {
    fail('*', 'row id set changed');
  }
  const played = teamPlayedWeeks(before);
  for (const id of idsBefore) {
    const b = before[id];
    const a = after[id];
    // 2. every other field deep-equal
    for (const k of new Set([...Object.keys(b), ...Object.keys(a)])) {
      if (REWRITTEN.has(k)) continue;
      if (!isDeepStrictEqual(b[k], a[k])) fail(id, `field "${k}" changed`);
    }
    const sb = b.weeklyStatus;
    const sa = a.weeklyStatus;
    if (!Array.isArray(sb) || !Array.isArray(sa) || sb.length !== sa.length) fail(id, 'weeklyStatus shape changed');
    let n = 0;
    sb.forEach((s, i) => {
      if (s === sa[i]) return;
      // 3. only 'D' → 'X'
      if (s !== 'D' || sa[i] !== 'X') {
        fail(id, `slot ${i + 1} went '${s}' → '${sa[i]}' (only 'D' → 'X' allowed${s === 'X' && sa[i] === 'D' ? '; a promotion means a rosterweekly file changed after rewrite #3' : ''})`);
      }
      // 4. independent re-derivation from the roster file
      const pairs = rosterPlayers?.[id]?.[String(i + 1)] ?? [];
      if (pairs.length === 0) fail(id, `slot ${i + 1} demoted but the roster does not list the player that week`);
      const missed = pairs.find(([team, status]) => MISSED_ROSTER_STATUSES.has(status) && played.get(team)?.has(i));
      if (missed) fail(id, `slot ${i + 1} demoted but the roster lists ${missed[0]}/${missed[1]} on a team that played`);
      n++;
    });
    // 5. dnpWeeks delta
    if ((b.dnpWeeks ?? 0) - (a.dnpWeeks ?? 0) !== n) {
      fail(id, `dnpWeeks ${b.dnpWeeks} → ${a.dnpWeeks} does not match ${n} changed slot(s)`);
    }
    // 6. availability derived, fixed subfields unchanged
    if (!isDeepStrictEqual(a.availability, computeAvailability(sa))) fail(id, 'availability is not computeAvailability(weeklyStatus)');
    // defence in depth — unreachable while guard 3 holds (firstWeek/lastWeek derive from 'P' slots, absenceCause is constant)
    for (const k of AVAILABILITY_FIXED) {
      if (!isDeepStrictEqual(a.availability?.[k], b.availability?.[k])) fail(id, `availability.${k} changed`);
    }
  }
  // 7. schema validator
  d.validateNflSeason(after, { year });
  // 8. idempotent
  const again = d.classifyAbsences(after, rosterPlayers, { season: year });
  if (again.changedSlots !== 0) {
    throw new Error(`[migrate-absence-role] ${relPath} (${year}): classifyAbsences(after) still changes ${again.changedSlots} slot(s) — not idempotent.`);
  }
}

// ── field diff ───────────────────────────────────────────────────────────────────────────────────

const isContainer = v => v !== null && typeof v === 'object';

/**
 * Generic recursive leaf diff: every { id, path, before, after } whose value differs (arrays by
 * index; a key present on one side only is one leaf at that key). Independent of the guards.
 */
export function fieldDiff(before, after) {
  const out = [];
  const walk = (a, b, id, p) => {
    if (a === b) return;
    if (isContainer(a) && isContainer(b) && Array.isArray(a) === Array.isArray(b)) {
      const keys = Array.isArray(a)
        ? Array.from({ length: Math.max(a.length, b.length) }, (_, i) => i)
        : [...new Set([...Object.keys(a), ...Object.keys(b)])];
      for (const k of keys) walk(a[k], b[k], id, [...p, k]);
      return;
    }
    if (!isDeepStrictEqual(a, b)) out.push({ id, path: p, before: a, after: b });
  };
  for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) walk(before[id], after[id], id, []);
  return out;
}

/** Throws unless the diff stays inside weeklyStatus/dnpWeeks/availability.{segments,longest,returned}. */
export function assertDiffScope(diffs, { relPath, year }) {
  for (const { id, path: p } of diffs) {
    if (!REWRITTEN.has(String(p[0]))) {
      throw new Error(`[migrate-absence-role] ${relPath} (${year}) ${id}: field "${p[0]}" changed — outside weeklyStatus/dnpWeeks/availability.`);
    }
    if (p[0] === 'availability' && !AVAILABILITY_CHANGEABLE.has(String(p[1]))) {
      throw new Error(`[migrate-absence-role] ${relPath} (${year}) ${id}: availability.${p[1]} changed — only absenceSegments/longestAbsence/returnedFromAbsence may.`);
    }
  }
}

// ── per-season report ────────────────────────────────────────────────────────────────────────────

const bump = (obj, key, n = 1) => { obj[key] = (obj[key] ?? 0) + n; };
const sortKeys = o => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

function playerLookup(players) {
  const get = id => players?.[id] ?? null;
  return {
    position: id => get(id)?.position ?? null,
    name: id => {
      const p = get(id);
      return p ? (p.full_name ?? [p.first_name, p.last_name].filter(Boolean).join(' ')) || null : null;
    },
    isSkill: id => SKILL.has(get(id)?.position),
  };
}

const emptySeason = () => ({
  beforeSha256: null, afterSha256: null, beforeBytes: 0, afterBytes: 0,
  rows: { before: 0, after: 0 },
  leafChangesByField: {}, availabilityChangesBySubfield: {},
  demotedSlots: 0, demotedSkillSlots: 0, changedRows: 0, changedSkillRows: 0,
  demotedByStatus: {}, dnpDeltaHistogram: {}, segmentShapeChanges: 0,
  topSkillRows: [], residual: {
    noEntry: { all: 0, skill: 0 }, otherWeeksOnly: { all: 0, skill: 0 },
  }, spotRows: {},
});

/**
 * Builds one season's report entry from a before/after pair and the roster file's `players` map.
 * Everything is derived from the pair (never from the classifier's own counters).
 */
export function buildSeasonReport({ before, after, rosterPlayers, players, year, relPath, beforeText, afterText }) {
  const lookup = playerLookup(players);
  const diffs = fieldDiff(before, after);
  assertDiffScope(diffs, { relPath, year });

  const s = emptySeason();
  s.beforeSha256 = sha256(beforeText);
  s.afterSha256 = sha256(afterText);
  s.beforeBytes = byteLen(beforeText);
  s.afterBytes = byteLen(afterText);
  s.rows = { before: Object.keys(before).length, after: Object.keys(after).length };

  for (const { path: p } of diffs) {
    bump(s.leafChangesByField, String(p[0]));
    if (p[0] === 'availability') bump(s.availabilityChangesBySubfield, String(p[1]));
  }

  const changedIds = new Set();
  const skillRows = [];
  for (const id of Object.keys(before)) {
    const b = before[id];
    const a = after[id];
    if (b === a || !Array.isArray(b.weeklyStatus)) continue;
    let n = 0;
    b.weeklyStatus.forEach((st, i) => {
      if (st === a.weeklyStatus[i] || st !== 'D' || a.weeklyStatus[i] !== 'X') return;
      n++;
      const pairs = rosterPlayers?.[id]?.[String(i + 1)] ?? [];
      bump(s.demotedByStatus, [...new Set(pairs.map(([, status]) => status))].sort().join('+'));
      s.demotedSlots++;
      if (lookup.isSkill(id)) s.demotedSkillSlots++;
    });
    if (n === 0 && isDeepStrictEqual(b.availability, a.availability) && b.dnpWeeks === a.dnpWeeks) continue;
    changedIds.add(id);
    s.changedRows++;
    const skill = lookup.isSkill(id);
    if (skill) s.changedSkillRows++;
    bump(s.dnpDeltaHistogram, String((a.dnpWeeks ?? 0) - (b.dnpWeeks ?? 0)));
    if (!isDeepStrictEqual(b.availability?.absenceSegments, a.availability?.absenceSegments)) s.segmentShapeChanges++;
    if (skill) {
      skillRows.push({
        id, name: lookup.name(id), position: lookup.position(id), team: b.team ?? null,
        dnpBefore: b.dnpWeeks ?? 0, dnpAfter: a.dnpWeeks ?? 0,
      });
    }
  }
  s.dnpDeltaHistogram = Object.fromEntries(
    Object.entries(s.dnpDeltaHistogram).sort(([x], [y]) => Number(x) - Number(y)));
  s.demotedByStatus = sortKeys(s.demotedByStatus);
  s.topSkillRows = skillRows
    .sort((x, y) => (x.dnpAfter - x.dnpBefore) - (y.dnpAfter - y.dnpBefore) || (x.id < y.id ? -1 : 1))
    .slice(0, 20);

  // Residual: 'D' slots left in `after` with no roster listing that week.
  for (const [id, row] of Object.entries(after)) {
    if (id.startsWith('TEAM_') || !Array.isArray(row?.weeklyStatus)) continue;
    const listed = rosterPlayers?.[id];
    const hasAny = listed && Object.keys(listed).length > 0;
    row.weeklyStatus.forEach((st, i) => {
      if (st !== 'D' || (listed?.[String(i + 1)] ?? []).length > 0) return;
      const bucket = hasAny ? s.residual.otherWeeksOnly : s.residual.noEntry;
      bucket.all++;
      if (lookup.isSkill(id)) bucket.skill++;
    });
  }

  for (const spot of SPOT_ROWS) {
    if (spot.year !== year || !before[spot.id]) continue;
    s.spotRows[spot.id] = {
      dnpBefore: before[spot.id].dnpWeeks ?? 0, dnpAfter: after[spot.id]?.dnpWeeks ?? 0,
      statusBefore: before[spot.id].weeklyStatus.join(''), statusAfter: after[spot.id].weeklyStatus.join(''),
    };
  }
  return s;
}

function sumTotals(seasons) {
  const t = emptySeason();
  delete t.beforeSha256; delete t.afterSha256; delete t.spotRows;
  const all = [];
  for (const [year, s] of Object.entries(seasons)) {
    t.beforeBytes += s.beforeBytes; t.afterBytes += s.afterBytes;
    t.rows.before += s.rows.before; t.rows.after += s.rows.after;
    for (const k of ['demotedSlots', 'demotedSkillSlots', 'changedRows', 'changedSkillRows', 'segmentShapeChanges']) t[k] += s[k];
    for (const k of ['leafChangesByField', 'availabilityChangesBySubfield', 'demotedByStatus', 'dnpDeltaHistogram']) {
      for (const [key, n] of Object.entries(s[k])) bump(t[k], key, n);
    }
    for (const b of ['noEntry', 'otherWeeksOnly']) {
      t.residual[b].all += s.residual[b].all; t.residual[b].skill += s.residual[b].skill;
    }
    all.push(...s.topSkillRows.map(r => ({ year: Number(year), ...r })));
  }
  t.demotedByStatus = sortKeys(t.demotedByStatus);
  t.dnpDeltaHistogram = Object.fromEntries(
    Object.entries(t.dnpDeltaHistogram).sort(([x], [y]) => Number(x) - Number(y)));
  t.topSkillRows = all
    .sort((x, y) => (x.dnpAfter - x.dnpBefore) - (y.dnpAfter - y.dnpBefore) || x.year - y.year || (x.id < y.id ? -1 : 1))
    .slice(0, 20);
  return t;
}

export function buildReportMarkdown(report) {
  const { meta, seasons, totals } = report;
  const L = [];
  L.push(`# D-76 absence-role — field-level diff report`, '');
  L.push(`Mode \`${meta.mode}\` · generated ${meta.generatedAt}${meta.beforeRev ? ` · before = \`${meta.beforeRev}\`` : ''}${meta.outDir ? ` · out dir \`${meta.outDir}\`` : ''}.`);
  if (meta.idempotentChangedSlots != null) L.push(`Idempotency check on the after state: ${meta.idempotentChangedSlots} slot(s) would change.`);
  L.push('', '## Per season', '');
  L.push('| season | demoted slots | skill | changed rows | skill rows | by status | segment-shape changes |');
  L.push('|---|---|---|---|---|---|---|');
  for (const [y, s] of Object.entries(seasons)) {
    L.push(`| ${y} | ${s.demotedSlots} | ${s.demotedSkillSlots} | ${s.changedRows} | ${s.changedSkillRows} | ${JSON.stringify(s.demotedByStatus)} | ${s.segmentShapeChanges} |`);
  }
  L.push(`| **total** | **${totals.demotedSlots}** | **${totals.demotedSkillSlots}** | **${totals.changedRows}** | **${totals.changedSkillRows}** | ${JSON.stringify(totals.demotedByStatus)} | ${totals.segmentShapeChanges} |`, '');
  L.push('## Files', '', '| season | rows | before bytes | after bytes | before sha256 | after sha256 |', '|---|---|---|---|---|---|');
  for (const [y, s] of Object.entries(seasons)) {
    L.push(`| ${y} | ${s.rows.before}→${s.rows.after} | ${s.beforeBytes} | ${s.afterBytes} | \`${s.beforeSha256.slice(0, 12)}\` | \`${s.afterSha256.slice(0, 12)}\` |`);
  }
  L.push('', '## Leaf changes', '', '| season | by top-level field | availability subfield |', '|---|---|---|');
  for (const [y, s] of Object.entries(seasons)) {
    L.push(`| ${y} | ${JSON.stringify(s.leafChangesByField)} | ${JSON.stringify(s.availabilityChangesBySubfield)} |`);
  }
  L.push('', '## `dnpWeeks` delta histogram (rows per delta)', '');
  for (const [y, s] of Object.entries(seasons)) L.push(`- ${y}: ${JSON.stringify(s.dnpDeltaHistogram)}`);
  L.push('', '## Residual `D` slots with no roster listing (all / skill)', '',
    '| season | player has no rosterweekly entry | listed in other weeks only |', '|---|---|---|');
  for (const [y, s] of Object.entries(seasons)) {
    L.push(`| ${y} | ${s.residual.noEntry.all} / ${s.residual.noEntry.skill} | ${s.residual.otherWeeksOnly.all} / ${s.residual.otherWeeksOnly.skill} |`);
  }
  L.push('', '## Largest skill-row `dnpWeeks` drops (top 20, all seasons)', '',
    '| season | id | name | pos | team | before → after |', '|---|---|---|---|---|---|');
  for (const r of totals.topSkillRows) L.push(`| ${r.year} | ${r.id} | ${r.name ?? ''} | ${r.position ?? ''} | ${r.team ?? ''} | ${r.dnpBefore} → ${r.dnpAfter} |`);
  L.push('', '## Spot rows', '');
  for (const [y, s] of Object.entries(seasons)) {
    for (const [id, r] of Object.entries(s.spotRows)) L.push(`- ${y} pid ${id}: dnpWeeks ${r.dnpBefore} → ${r.dnpAfter} (\`${r.statusBefore}\` → \`${r.statusAfter}\`)`);
  }
  return L.join('\n') + '\n';
}

// ── path resolution ──────────────────────────────────────────────────────────────────────────────

/** Resolves `--report` to an absolute base path (see header); throws on an illegal location. */
export function resolveReportBase(basePath, repoRoot) {
  if (!basePath) throw new Error('[migrate-absence-role] --report <basePath> is required in every mode.');
  if (path.isAbsolute(basePath)) {
    const abs = path.resolve(basePath);
    if (abs === path.resolve(repoRoot) || isUnder(repoRoot, abs)) {
      throw new Error(`[migrate-absence-role] absolute --report ${abs} must resolve outside the repo working tree.`);
    }
    return abs;
  }
  const abs = path.resolve(repoRoot, basePath);
  if (!isUnder(path.join(repoRoot, 'verification'), abs)) {
    throw new Error(`[migrate-absence-role] relative --report ${basePath} must lie under verification/.`);
  }
  return abs;
}

function resolveOutDir(outDir, repoRoot) {
  if (!outDir || !path.isAbsolute(outDir)) throw new Error('[migrate-absence-role] --out-dir must be an absolute path.');
  const abs = path.resolve(outDir);
  if (abs === path.resolve(repoRoot) || isUnder(repoRoot, abs)) {
    throw new Error(`[migrate-absence-role] --out-dir ${abs} is inside the repo working tree — refusing.`);
  }
  return abs;
}

// ── migration ────────────────────────────────────────────────────────────────────────────────────

/**
 * @param {{ mode: 'dry-run'|'write'|'report-only', outDir?: string, beforeRev?: string,
 *   report: string, deps?: object, now?: () => Date }} opts
 * @returns {{ report: object, jsonPath: string, mdPath: string }}
 */
export function migrateAbsenceRole({ mode, outDir, beforeRev, report: reportArg, deps = {}, now = () => new Date() }) {
  const d = { ...DEFAULT_DEPS, ...deps };
  if (!['dry-run', 'write', 'report-only'].includes(mode)) throw new Error(`[migrate-absence-role] unknown mode "${mode}".`);
  const base = resolveReportBase(reportArg, d.repoRoot);
  const jsonPath = `${base}.json`;
  const mdPath = `${base}.md`;
  if (d.exists(jsonPath) || d.exists(mdPath)) {
    throw new Error(`[migrate-absence-role] ${base}.{json,md} already exists — refusing to overwrite.`);
  }
  let outAbs = null;
  if (mode === 'dry-run') outAbs = resolveOutDir(outDir, d.repoRoot);
  else if (outDir) throw new Error('[migrate-absence-role] --out-dir is only valid with --dry-run.');
  if (mode === 'report-only' && !beforeRev) throw new Error('[migrate-absence-role] --report-only needs --before-rev <rev>.');
  if (mode !== 'report-only' && beforeRev) throw new Error('[migrate-absence-role] --before-rev is only valid with --report-only.');

  const manifest = d.readManifest();
  const seasonsList = Object.entries(manifest.files)
    .map(([relPath, entry]) => ({ relPath, entry, m: SEASON_RE.exec(relPath) }))
    .filter(x => x.m)
    .map(x => ({ ...x, year: Number(x.m[1]) }))
    .filter(x => x.entry.inProgress === false && x.year >= MIN_ABSENCE_CLASSIFY_SEASON)
    .sort((a, b) => a.year - b.year);

  const players = d.readJson(PLAYERS_PATH);
  const seasons = {};
  let idempotentChangedSlots = 0;

  for (const { relPath, year } of seasonsList) {
    const rosterPath = `nflverse/rosterweekly/${year}.json`;
    const roster = d.readJson(rosterPath);
    if (!roster?.players) throw new Error(`[migrate-absence-role] ${rosterPath} missing — run 'node bin/update.mjs rosterweekly --year ${year}' first.`);

    let before;
    let beforeText;
    let after;
    let afterText;
    let changed = false;

    if (mode === 'report-only') {
      beforeText = d.gitShow(beforeRev, relPath);
      before = JSON.parse(beforeText);
      after = d.readJson(relPath);
      afterText = d.readText(relPath);
      if (!after || afterText == null) throw new Error(`[migrate-absence-role] ${relPath} is in the manifest but missing.`);
      idempotentChangedSlots += d.classifyAbsences(after, roster.players, { season: year }).changedSlots;
      changed = beforeText !== afterText;
    } else {
      before = d.readJson(relPath);
      beforeText = d.readText(relPath);
      if (!before || beforeText == null) throw new Error(`[migrate-absence-role] ${relPath} is in the manifest but missing.`);
      const r = d.classifyAbsences(before, roster.players, { season: year });
      after = r.totals;
      changed = r.changedSlots > 0;
      afterText = changed ? serialize(after) : beforeText;
    }
    assertRoleGuards(before, after, roster.players, { relPath, year }, d);

    if (mode === 'dry-run' && changed) {
      d.writeJsonStableAt(path.join(outAbs, relPath), after, { minify: true });
    } else if (mode === 'write' && changed) {
      d.writeJsonStable(relPath, after, { minify: true });
      d.updateManifestEntry({ path: relPath, recordCount: Object.keys(after).length, inProgress: false, schemaVersion: 4 });
      afterText = d.readText(relPath) ?? afterText;   // working-tree bytes, not the would-be ones
    }
    seasons[year] = buildSeasonReport({
      before, after, rosterPlayers: roster.players, players, year, relPath, beforeText, afterText,
    });
  }

  const report = {
    meta: {
      generatedAt: now().toISOString(), mode, outDir: outAbs, beforeRev: beforeRev ?? null,
      idempotentChangedSlots: mode === 'report-only' ? idempotentChangedSlots : null,
      toolVersion: TOOL_VERSION,
    },
    seasons,
    totals: sumTotals(seasons),
  };
  d.writeJsonStableAt(jsonPath, report);
  d.writeText(mdPath, buildReportMarkdown(report));
  return { report, jsonPath, mdPath };
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const opts = {};
  const flags = new Set();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (['--dry-run', '--report-only'].includes(a)) flags.add(a);
    else if (['--out-dir', '--before-rev', '--report'].includes(a)) {
      if (argv[i + 1] == null || argv[i + 1].startsWith('--')) throw new Error(`[migrate-absence-role] ${a} needs a value.`);
      opts[a] = argv[++i];
    } else throw new Error(`[migrate-absence-role] unknown argument ${a}`);
  }
  if (flags.has('--dry-run') && flags.has('--report-only')) throw new Error('[migrate-absence-role] --dry-run and --report-only are exclusive.');
  const mode = flags.has('--dry-run') ? 'dry-run' : flags.has('--report-only') ? 'report-only' : 'write';
  return { mode, outDir: opts['--out-dir'], beforeRev: opts['--before-rev'], report: opts['--report'] };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { report, jsonPath, mdPath } = migrateAbsenceRole(args);
  console.log(`[migrate-absence-role] ${args.mode}: season | demotedSlots | skill | changedRows | skillRows`);
  for (const [y, s] of Object.entries(report.seasons)) {
    console.log(`${y} | ${s.demotedSlots} | ${s.demotedSkillSlots} | ${s.changedRows} | ${s.changedSkillRows}`);
  }
  const t = report.totals;
  console.log(`[migrate-absence-role] Total: ${t.demotedSlots} slot(s) (${t.demotedSkillSlots} skill) in ${t.changedRows} row(s) (${t.changedSkillRows} skill).`);
  console.log(`[migrate-absence-role] Report: ${jsonPath} , ${mdPath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { main(); } catch (err) { console.error(err); process.exit(1); }
}
