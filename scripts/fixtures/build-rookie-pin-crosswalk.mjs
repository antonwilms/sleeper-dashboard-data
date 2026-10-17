/**
 * scripts/fixtures/build-rookie-pin-crosswalk.mjs — builds rookie-pin-crosswalk-2026-09-06.json, the
 * crosswalk input to panel-fit.test.mjs's rookie-outcome-panels §6 test 1 reproduction pin.
 *
 * backtests/2026-09-06-fullpipeline-panel.json was generated (282546a) against the crosswalk as of
 * f27bc71. nflverse/playerids.json is rewritten weekly by the playerids cron, and a refresh that
 * newly resolves a position for an id already in a 2013–2024 season-totals file changes the
 * candidate set: the 2026-10-07 refresh (cde2d06) added 12079 (TE, NO 2024 practice squad, 0 games)
 * and moved `assembled` 2563 → 2564 / `noOutcome` 1507 → 1508 with surviving rows unchanged. The pin
 * reproduces a frozen artifact, so it reads its crosswalk frozen too. Reads ONLY through
 * `git show <SOURCE_REV>:<path>`, slimmed to ids present in the 2013–2024 season totals at that rev
 * (the only ids positionOf / draftInfoOf / birthdateOf are ever asked about) and to the fields the
 * test reads.
 *
 * Run: node scripts/fixtures/build-rookie-pin-crosswalk.mjs
 *
 * D-45 Fix pass 1: `--rev <rev> --out <path>` builds the UN-slimmed variant (every bySleeper entry and every ids
 * entry with a sleeperId, so the `rookiePathAll` entrant enumeration is complete), recording the command and rev in
 * the header. Used for test/fixtures/rookie-total-crosswalk-2026-10-07.json:
 *   node scripts/fixtures/build-rookie-pin-crosswalk.mjs --rev cde2d06 --out test/fixtures/rookie-total-crosswalk-2026-10-07.json
 * With no arguments the output is byte-identical to before.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SOURCE_REV = 'f27bc71';
export const ARTIFACT_DATE = '2026-09-06';
const FROM = 2013, TO = 2024;
const KEEP_BY_SLEEPER = ['birthdate', 'draftYear', 'draftRound', 'draftPick', 'undrafted'];

const gitShowJson = (rel, rev = SOURCE_REV) => JSON.parse(execFileSync('git', ['show', `${rev}:${rel}`], { cwd: ROOT, maxBuffer: 1 << 30 }).toString());

/** Un-slimmed variant at `rev`: all bySleeper entries (the five fields) and all ids entries that carry a sleeperId. */
export function buildFullFixture(rev, command) {
  const playerIds = gitShowJson('nflverse/playerids.json', rev);
  const bySleeper = {};
  for (const [id, e] of Object.entries(playerIds.bySleeper ?? {})) {
    const out = {};
    for (const k of KEEP_BY_SLEEPER) if (e?.[k] !== undefined) out[k] = e[k];
    bySleeper[id] = out;
  }
  const ids = {};
  for (const [gsis, e] of Object.entries(playerIds.ids ?? {})) {
    if (e?.sleeperId) ids[gsis] = { sleeperId: e.sleeperId, position: e.position ?? null };
  }
  return { sourceRev: rev, command, note: 'nflverse/playerids.json at sourceRev, un-slimmed, fields the rookie panel reads', bySleeper, ids };
}

export function buildFixture() {
  const wanted = new Set();
  for (let y = FROM; y <= TO; y++) for (const id of Object.keys(gitShowJson(`nfl/season-totals/${y}.json`))) wanted.add(id);

  const playerIds = gitShowJson('nflverse/playerids.json');
  const bySleeper = {};
  for (const [id, e] of Object.entries(playerIds.bySleeper ?? {})) {
    if (!wanted.has(id)) continue;
    const out = {};
    for (const k of KEEP_BY_SLEEPER) if (e?.[k] !== undefined) out[k] = e[k];
    bySleeper[id] = out;
  }
  const ids = {};
  for (const [gsis, e] of Object.entries(playerIds.ids ?? {})) {
    if (e?.sleeperId && wanted.has(e.sleeperId)) ids[gsis] = { sleeperId: e.sleeperId, position: e.position ?? null };
  }
  return { sourceRev: SOURCE_REV, artifact: ARTIFACT_DATE, bySleeper, ids };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const argOf = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
if (isMain && argOf('--rev')) {
  const rev = argOf('--rev'), outRel = argOf('--out');
  if (!outRel) throw new Error('--rev needs --out <path>');
  const fx = buildFullFixture(rev, `node scripts/fixtures/build-rookie-pin-crosswalk.mjs --rev ${rev} --out ${outRel}`);
  const out = path.resolve(ROOT, outRel);
  fs.writeFileSync(out, JSON.stringify(fx) + '\n');
  console.log(`wrote ${out} — ${Object.keys(fx.bySleeper).length} bySleeper, ${Object.keys(fx.ids).length} ids, ${fs.statSync(out).size} bytes`);
} else if (isMain) {
  const fx = buildFixture();
  const out = path.join(ROOT, 'test', 'fixtures', `rookie-pin-crosswalk-${ARTIFACT_DATE}.json`);
  fs.writeFileSync(out, JSON.stringify(fx) + '\n');
  console.log(`wrote ${out} — ${Object.keys(fx.bySleeper).length} bySleeper, ${Object.keys(fx.ids).length} ids, ${fs.statSync(out).size} bytes`);
}
