/**
 * test/migrate-absence-role.test.mjs — d76-absence-role.md §A4 (MR-1..MR-5).
 * Injected I/O over a small in-memory repo; the real classifyAbsences is used except where a
 * doctored result is the point. Nothing here touches the real repo, verification/ or the disk.
 *
 * Run with: node --test  (or npm test)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  migrateAbsenceRole, assertRoleGuards, fieldDiff, assertDiffScope, parseArgs,
} from '../scripts/migrate-absence-role.mjs';
import { classifyAbsences } from '../lib/absence.mjs';
import { computeAvailability } from '../lib/sleeper.mjs';

const W = (...idx) => { const a = Array(18).fill('X'); idx.forEach(i => { a[i] = 'P'; }); return a; };
const row = (team, ws, dnp = ws.filter(s => s === 'D').length) => ({
  team, weeklyStatus: ws, gamesPlayed: ws.filter(s => s === 'P').length, byeWeeks: 0, dnpWeeks: dnp,
  availability: computeAvailability(ws), weeklyPoints: {}, stats: { rec: 1 }, fantasyPoints: 1,
});

/** KC plays weeks 1–4. Player 'a' (WR): week 2 'D' (DEV listed → role week), week 3 'D' (ACT → real). */
function dirtySeason() {
  const ws = W(0, 3); ws[1] = 'D'; ws[2] = 'D';
  return { TEAM_KC: row('KC', W(0, 1, 2, 3)), a: row('KC', ws), b: row('KC', W(0, 1, 2, 3)) };
}
const ROSTER = { a: { 2: [['KC', 'DEV']], 3: [['KC', 'ACT']] } };
const rosterFile = { players: ROSTER };
const clean = () => { const s = dirtySeason(); s.a = row('KC', W(0, 1, 2, 3)); return s; };
const PLAYERS = { a: { position: 'WR', full_name: 'Alpha A' }, b: { position: 'OL', full_name: 'Bee B' } };

const ROOT = '/repo';
const text = v => JSON.stringify(v) + '\n';

function memRepo({ inProgress2022 = false } = {}) {
  const files = {
    'nfl/season-totals/2015.json': dirtySeason(),
    'nfl/season-totals/2022.json': dirtySeason(),
    'nfl/season-totals/2023.json': clean(),
    'nfl/season-totals/2026.json': dirtySeason(),
    'nflverse/rosterweekly/2022.json': rosterFile,
    'nflverse/rosterweekly/2023.json': rosterFile,
    'nflverse/rosterweekly/2026.json': rosterFile,
    'raw/-players-nfl.json': PLAYERS,
  };
  const manifest = { files: {
    'nfl/season-totals/2015.json': { inProgress: false },
    'nfl/season-totals/2022.json': { inProgress: inProgress2022 },
    'nfl/season-totals/2023.json': { inProgress: false },
    'nfl/season-totals/2026.json': { inProgress: true },
  } };
  const repoWrites = [];
  const manifestWrites = [];
  const atWrites = {};     // absolute path → value
  const textWrites = {};   // absolute path → text
  const gitFiles = {};     // `${rev}:${path}` → text
  const o = {
    files, repoWrites, manifestWrites, atWrites, textWrites, gitFiles,
    deps: {
      repoRoot: ROOT,
      readManifest: () => manifest,
      readJson: p => (files[p] ? JSON.parse(JSON.stringify(files[p])) : null),
      readText: p => (files[p] ? text(files[p]) : null),
      writeJsonStable: (p, v, opts) => { repoWrites.push([p, opts]); files[p] = JSON.parse(JSON.stringify(v)); },
      writeJsonStableAt: (abs, v, opts) => { atWrites[abs] = { value: JSON.parse(JSON.stringify(v)), opts }; },
      writeText: (abs, t) => { textWrites[abs] = t; },
      exists: abs => abs in atWrites || abs in textWrites,
      gitShow: (rev, p) => { const t = gitFiles[`${rev}:${p}`]; if (t == null) throw new Error(`no ${rev}:${p}`); return t; },
      updateManifestEntry: e => manifestWrites.push(e),
      validateNflSeason: () => {},   // fixtures are far below the 400-player floor
    },
    now: () => new Date('2026-10-19T00:00:00Z'),
  };
  return o;
}

const run = (o, args) => migrateAbsenceRole({ ...args, deps: o.deps, now: o.now });
const afterOf = before => classifyAbsences(before, ROSTER, { season: 2022 }).totals;
const guards = (before, after, roster = ROSTER, deps = {}) =>
  assertRoleGuards(before, after, roster, { relPath: 'nfl/season-totals/2022.json', year: 2022 },
    { validateNflSeason: () => {}, classifyAbsences, ...deps });

// ─── MR-1 guards ─────────────────────────────────────────────────────────────

test("MR-1 assertRoleGuards: the real classifier's output passes", () => {
  const before = dirtySeason();
  assert.doesNotThrow(() => guards(before, afterOf(before)));
});

test('MR-1 assertRoleGuards: each of guards 1–8 throws on a doctored result', () => {
  const before = dirtySeason();
  const good = () => JSON.parse(JSON.stringify(afterOf(before)));
  const cases = [
    ['1 id set', a => { delete a.b; return a; }, /row id set changed/],
    ['2 stats change', a => { a.a.stats.rec = 9; return a; }, /field "stats" changed/],
    ["3 'P'→'X'", a => { a.b.weeklyStatus[0] = 'X'; return a; }, /'P' → 'X'/],
    ["3 'X'→'D'", a => { a.b.weeklyStatus[5] = 'D'; return a; }, /'X' → 'D'.*rosterweekly file changed/],
    ['5 dnpWeeks mismatch', a => { a.a.dnpWeeks = 5; return a; }, /dnpWeeks/],
    ['6 stale availability', a => { a.a.availability = before.a.availability; return a; }, /availability is not computeAvailability/],
  ];
  for (const [label, doctor, re] of cases) {
    assert.throws(() => guards(before, doctor(good())), re, label);
  }
  // 4 — a demotion whose roster pair is ACT on a team that played
  assert.throws(() => guards(before, good(), { a: { 2: [['KC', 'ACT']], 3: [['KC', 'ACT']] } }), /roster lists KC\/ACT/);
  // 4 — a demotion with no roster listing at all
  assert.throws(() => guards(before, good(), {}), /does not list the player/);
  // 6 — a fixed availability subfield changed: the derived-availability check is the one that fires
  // (the per-subfield AVAILABILITY_FIXED loop is defence in depth, unreachable while guard 3 holds)
  const fixed = good();
  fixed.a.availability = { ...fixed.a.availability, firstWeek: 9 };
  assert.throws(() => guards(before, fixed), /availability is not computeAvailability/);
  // 7 — the schema validator
  assert.throws(() => guards(before, good(), ROSTER, { validateNflSeason: () => { throw new Error('schema boom'); } }), /schema boom/);
  // 8 — not idempotent
  assert.throws(() => guards(before, good(), ROSTER, { classifyAbsences: () => ({ changedSlots: 1 }) }), /not idempotent/);
});

// ─── MR-2 write mode ─────────────────────────────────────────────────────────

test('MR-2 write mode: only the changed completed season and its manifest entry; skips inProgress and pre-2016; second run writes nothing', () => {
  const o = memRepo();
  const { report } = run(o, { mode: 'write', report: 'verification/x-diff' });
  assert.deepEqual(o.repoWrites, [['nfl/season-totals/2022.json', { minify: true }]]);
  assert.deepEqual(o.manifestWrites, [{ path: 'nfl/season-totals/2022.json', recordCount: 3, inProgress: false, schemaVersion: 4 }]);
  assert.deepEqual(Object.keys(report.seasons), ['2022', '2023']);
  assert.equal(o.files['nfl/season-totals/2022.json'].a.weeklyStatus[1], 'X');
  assert.equal(o.files['nfl/season-totals/2022.json'].a.dnpWeeks, 1);
  assert.equal(o.files['nfl/season-totals/2026.json'].a.weeklyStatus[1], 'D', 'inProgress untouched');
  assert.equal(o.files['nfl/season-totals/2015.json'].a.weeklyStatus[1], 'D', 'pre-2016 untouched');
  // the report goes through the injected report writers only
  assert.deepEqual(Object.keys(o.atWrites), [`${ROOT}/verification/x-diff.json`]);
  assert.deepEqual(Object.keys(o.textWrites), [`${ROOT}/verification/x-diff.md`]);
  // write mode: afterSha256 is the working-tree file's
  assert.equal(report.seasons[2022].afterSha256 !== report.seasons[2022].beforeSha256, true);

  const again = memRepoWith(o);
  run(again, { mode: 'write', report: 'verification/x-diff2' });
  assert.equal(again.repoWrites.length, 0);
  assert.equal(again.manifestWrites.length, 0);
});

// ─── MR-6 guards run before any write ────────────────────────────────────────

test('MR-6 a doctored classifier result throws (guard 2) before any write, in write and dry-run modes', () => {
  for (const mode of ['write', 'dry-run']) {
    const o = memRepo();
    o.deps.classifyAbsences = (...a) => {
      const r = classifyAbsences(...a);
      if (r.changedSlots > 0) r.totals.a.stats = { ...r.totals.a.stats, rec: 9 };
      return r;
    };
    const args = mode === 'write'
      ? { mode, report: 'verification/m6-diff' }
      : { mode, outDir: '/scratch/out', report: 'verification/m6-diff' };
    assert.throws(() => run(o, args), /field "stats" changed/, mode);
    assert.equal(o.repoWrites.length, 0, `${mode}: writeJsonStable called`);
    assert.equal(o.manifestWrites.length, 0, `${mode}: updateManifestEntry called`);
    assert.deepEqual(Object.keys(o.atWrites), [], `${mode}: writeJsonStableAt called`);
    assert.deepEqual(Object.keys(o.textWrites), [], `${mode}: writeText called`);
  }
});

/** A fresh harness over the same (already rewritten) files. */
function memRepoWith(prev) {
  const o = memRepo();
  Object.assign(o.files, prev.files);
  return o;
}

// ─── MR-3 dry-run and path rules ─────────────────────────────────────────────

test('MR-3 --dry-run --out-dir writes the would-be season under the out dir only; the repo writer and manifest are never called', () => {
  const o = memRepo();
  const { report } = run(o, { mode: 'dry-run', outDir: '/scratch/out', report: 'verification/d-diff' });
  assert.equal(o.repoWrites.length, 0);
  assert.equal(o.manifestWrites.length, 0);
  assert.deepEqual(Object.keys(o.atWrites).sort(), [
    '/scratch/out/nfl/season-totals/2022.json', `${ROOT}/verification/d-diff.json`].sort());
  assert.deepEqual(o.atWrites['/scratch/out/nfl/season-totals/2022.json'].opts, { minify: true });
  assert.equal(o.atWrites['/scratch/out/nfl/season-totals/2022.json'].value.a.weeklyStatus[1], 'X');
  // afterSha256 is the would-be file's bytes
  const wouldBe = o.atWrites['/scratch/out/nfl/season-totals/2022.json'].value;
  assert.equal(report.seasons[2022].afterBytes, Buffer.byteLength(text(wouldBe)));
  assert.equal(o.files['nfl/season-totals/2022.json'].a.weeklyStatus[1], 'D', 'stored file untouched');
});

test('MR-3 refuses: an out dir inside the repo, a relative out dir, a missing --report, an existing report, bad base paths', () => {
  const o = memRepo();
  assert.throws(() => run(o, { mode: 'dry-run', outDir: '/repo/out', report: 'verification/r' }), /inside the repo/);
  assert.throws(() => run(o, { mode: 'dry-run', outDir: 'out', report: 'verification/r' }), /absolute/);
  assert.throws(() => run(o, { mode: 'dry-run', outDir: '/scratch/o' }), /--report <basePath> is required/);
  assert.throws(() => run(o, { mode: 'write', report: 'elsewhere/r' }), /under verification\//);
  assert.throws(() => run(o, { mode: 'write', report: '../verification/r' }), /under verification\//);
  assert.throws(() => run(o, { mode: 'write', report: '/repo/verification/r' }), /outside the repo/);
  assert.equal(o.repoWrites.length, 0);

  o.atWrites[`${ROOT}/verification/dup.json`] = { value: {} };
  assert.throws(() => run(o, { mode: 'write', report: 'verification/dup' }), /already exists/);
});

test('MR-3 report location: an absolute base outside the repo is written at exactly that path; a relative one under <repo>/verification/', () => {
  const o = memRepo();
  run(o, { mode: 'dry-run', outDir: '/scratch/o', report: '/scratch/reports/abs-r' });
  assert.ok('/scratch/reports/abs-r.json' in o.atWrites);
  assert.ok('/scratch/reports/abs-r.md' in o.textWrites);
  run(o, { mode: 'dry-run', outDir: '/scratch/o', report: 'verification/rel-r' });
  assert.ok(`${ROOT}/verification/rel-r.json` in o.atWrites);
  assert.ok(`${ROOT}/verification/rel-r.md` in o.textWrites);
});

test('parseArgs: exactly three modes; unknown flags and combinations throw', () => {
  assert.deepEqual(parseArgs(['--dry-run', '--out-dir', '/o', '--report', 'verification/r']),
    { mode: 'dry-run', outDir: '/o', beforeRev: undefined, report: 'verification/r' });
  assert.equal(parseArgs(['--report', 'verification/r']).mode, 'write');
  assert.equal(parseArgs(['--report-only', '--before-rev', 'abc', '--report', 'verification/r']).mode, 'report-only');
  assert.throws(() => parseArgs(['--force']), /unknown argument/);
  assert.throws(() => parseArgs(['--dry-run', '--report-only']), /exclusive/);
  assert.throws(() => parseArgs(['--report']), /needs a value/);
});

// ─── MR-5 report-only ────────────────────────────────────────────────────────

test('MR-5 --report-only --before-rev reports the same counts as the dry-run and writes nothing but the report', () => {
  const dry = memRepo();
  const dryReport = run(dry, { mode: 'dry-run', outDir: '/scratch/o', report: 'verification/d' }).report;

  // "after" = a working tree that already carries the rewrite; "before" = the pre-rewrite rev.
  const o = memRepo();
  o.gitFiles['abc123:nfl/season-totals/2022.json'] = text(dirtySeason());
  o.gitFiles['abc123:nfl/season-totals/2023.json'] = text(clean());
  o.files['nfl/season-totals/2022.json'] = afterOf(dirtySeason());
  const { report } = run(o, { mode: 'report-only', beforeRev: 'abc123', report: 'verification/ro' });

  assert.deepEqual(report.seasons, dryReport.seasons);
  assert.deepEqual(report.totals, dryReport.totals);
  assert.equal(report.meta.idempotentChangedSlots, 0);
  assert.equal(report.meta.beforeRev, 'abc123');
  assert.equal(o.repoWrites.length, 0);
  assert.equal(o.manifestWrites.length, 0);
  assert.deepEqual(Object.keys(o.atWrites), [`${ROOT}/verification/ro.json`]);
  assert.deepEqual(Object.keys(o.textWrites), [`${ROOT}/verification/ro.md`]);

  assert.throws(() => run(memRepo(), { mode: 'report-only', report: 'verification/q' }), /--before-rev/);
});

test('MR-5 report content: counts, skill split, residual, spot-row shape', () => {
  const { report } = run(memRepo(), { mode: 'dry-run', outDir: '/scratch/o', report: 'verification/c' });
  const s = report.seasons[2022];
  assert.equal(s.demotedSlots, 1);
  assert.equal(s.demotedSkillSlots, 1);
  assert.equal(s.changedRows, 1);
  assert.equal(s.changedSkillRows, 1);
  assert.deepEqual(s.demotedByStatus, { DEV: 1 });
  assert.deepEqual(s.dnpDeltaHistogram, { '-1': 1 });
  assert.deepEqual(s.leafChangesByField.dnpWeeks, 1);
  assert.deepEqual(s.topSkillRows, [{ id: 'a', name: 'Alpha A', position: 'WR', team: 'KC', dnpBefore: 2, dnpAfter: 1 }]);
  assert.deepEqual(Object.keys(report), ['meta', 'seasons', 'totals']);
  assert.equal(report.totals.demotedSlots, 1);
  assert.equal(report.seasons[2023].demotedSlots, 0);
});

// ─── MR-4 fieldDiff ──────────────────────────────────────────────────────────

test('MR-4 fieldDiff reports exactly the changed leaves of a two-row fixture', () => {
  const before = { a: { x: 1, w: ['P', 'D', 'X'], s: { k: 1 } }, b: { x: 2, w: ['P'] } };
  const after = { a: { x: 1, w: ['P', 'X', 'X'], s: { k: 1 } }, b: { x: 3, w: ['P', 'D'] } };
  assert.deepEqual(fieldDiff(before, after), [
    { id: 'a', path: ['w', 1], before: 'D', after: 'X' },
    { id: 'b', path: ['x'], before: 2, after: 3 },
    { id: 'b', path: ['w', 1], before: undefined, after: 'D' },
  ]);
  assert.deepEqual(fieldDiff(before, before), []);
});

test('MR-4 assertDiffScope throws when a fixture changes stats or an unchangeable availability subfield', () => {
  const ctx = { relPath: 'nfl/season-totals/2022.json', year: 2022 };
  assert.doesNotThrow(() => assertDiffScope(fieldDiff({ a: { dnpWeeks: 2, availability: { longestAbsence: 2 } } }, { a: { dnpWeeks: 1, availability: { longestAbsence: 1 } } }), ctx));
  assert.throws(() => assertDiffScope(fieldDiff({ a: { stats: { rec: 1 } } }, { a: { stats: { rec: 2 } } }), ctx), /"stats" changed/);
  assert.throws(() => assertDiffScope(fieldDiff({ a: { availability: { firstWeek: 1 } } }, { a: { availability: { firstWeek: 2 } } }), ctx), /availability\.firstWeek/);
});
