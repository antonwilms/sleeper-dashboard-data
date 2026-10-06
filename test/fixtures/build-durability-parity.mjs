/**
 * test/fixtures/build-durability-parity.mjs — builds durability-parity-2026-10-04.json (DM-0,
 * absence-classification-b.md §3). Reads ONLY through `git show <SOURCE_REV>:<path>` for the
 * season totals and the crosswalk, so the fixture holds the PRE-correction inputs even after the
 * served files are rewritten (absence-classification-c). The snapshot is read from the working
 * tree: it is immutable and date-keyed.
 *
 * Run: node test/fixtures/build-durability-parity.mjs
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SOURCE_REV = '4f469cc';
export const SNAPSHOT_DATE = '2026-10-04';
const FROM = 2012, TO = 2025;
const KEEP_STATS = ['off_snp', 'tm_off_snp', 'pass_att', 'rush_att', 'rec_tgt'];

const gitShowJson = (rel) => JSON.parse(execFileSync('git', ['show', `${SOURCE_REV}:${rel}`], { cwd: ROOT, maxBuffer: 1 << 30 }).toString());

export function buildFixture() {
  const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'snapshots', `${SNAPSHOT_DATE}.json`), 'utf8'));
  const ids = gitShowJson('nflverse/playerids.json').ids;
  const positionOf = {};
  for (const e of Object.values(ids)) if (e?.sleeperId && e?.position) positionOf[e.sleeperId] = e.position;

  const snapshotRows = {};
  const positions = {};
  for (const [id, p] of Object.entries(snapshot.players)) {
    const pr = p?.projection;
    if (!pr || pr.confidence === 'rookie') continue;
    const f = pr.factors ?? {};
    snapshotRows[id] = {
      projectedGames: pr.projectedGames, injurySeasons: f.injurySeasons ?? null,
      absenceShapeFactor: f.absenceShapeFactor ?? null, isBounceBack: f.isBounceBack ?? null,
    };
    if (positionOf[id]) positions[id] = positionOf[id];
  }

  const seasons = {};
  for (let y = FROM; y <= TO; y++) {
    const totals = gitShowJson(`nfl/season-totals/${y}.json`);
    const out = {};
    for (const id of Object.keys(snapshotRows)) {
      const r = totals[id];
      if (!r) continue;
      const stats = {};
      for (const k of KEEP_STATS) if (r.stats?.[k] !== undefined) stats[k] = r.stats[k];
      out[id] = {
        gamesPlayed: r.gamesPlayed, gamesStarted: r.gamesStarted, fantasyPoints: r.fantasyPoints,
        dnpWeeks: r.dnpWeeks, availability: r.availability, stats,
      };
    }
    seasons[y] = out;
  }
  return { sourceRev: SOURCE_REV, snapshot: SNAPSHOT_DATE, positions, snapshotRows, seasons };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const fx = buildFixture();
  const out = path.join(ROOT, 'test', 'fixtures', `durability-parity-${SNAPSHOT_DATE}.json`);
  fs.writeFileSync(out, JSON.stringify(fx) + '\n');
  console.log(`wrote ${out} — ${Object.keys(fx.snapshotRows).length} veteran rows, ${fs.statSync(out).size} bytes`);
}
