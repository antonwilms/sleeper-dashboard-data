/**
 * test/fixtures/build-rookie-pin-crosswalk.mjs — builds rookie-pin-crosswalk-2026-09-06.json, the
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
 * Run: node test/fixtures/build-rookie-pin-crosswalk.mjs
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

const gitShowJson = (rel) => JSON.parse(execFileSync('git', ['show', `${SOURCE_REV}:${rel}`], { cwd: ROOT, maxBuffer: 1 << 30 }).toString());

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

// Bare `node --test` matches every .mjs under test/, so it runs this file too: skip the write
// there (NODE_TEST_CONTEXT is set by the runner) — a test run must not rewrite fixtures, and a
// shallow CI checkout has no SOURCE_REV for `git show` to read.
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain && !process.env.NODE_TEST_CONTEXT) {
  const fx = buildFixture();
  const out = path.join(ROOT, 'test', 'fixtures', `rookie-pin-crosswalk-${ARTIFACT_DATE}.json`);
  fs.writeFileSync(out, JSON.stringify(fx) + '\n');
  console.log(`wrote ${out} — ${Object.keys(fx.bySleeper).length} bySleeper, ${Object.keys(fx.ids).length} ids, ${fs.statSync(out).size} bytes`);
}
