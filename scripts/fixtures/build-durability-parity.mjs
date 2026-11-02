/**
 * scripts/fixtures/build-durability-parity.mjs — builds durability-parity-2026-10-04.json (DM-0,
 * absence-classification-b.md §3). Reads ONLY through `git show <SOURCE_REV>:<path>` for the
 * season totals and the crosswalk, so the fixture holds the PRE-correction inputs even after the
 * served files are rewritten (absence-classification-c). The snapshot is read from the working
 * tree: it is immutable and date-keyed.
 *
 * Run: node scripts/fixtures/build-durability-parity.mjs [--rev <rev>] [--positions-rev <rev>] [--snapshot <YYYY-MM-DD>]
 * (D-67: --rev 3b92712 --snapshot 2026-10-30 --positions-rev <last commit at or before the capture>;
 * defaults reproduce the 2026-10-04 fixture byte-for-byte. Output: test/fixtures/durability-parity-<snapshot>.json.)
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

const gitShowJson = (rev, rel) => JSON.parse(execFileSync('git', ['show', `${rev}:${rel}`], { cwd: ROOT, maxBuffer: 1 << 30 }).toString());

export function buildFixture({ sourceRev = SOURCE_REV, snapshotDate = SNAPSHOT_DATE, positionsRev = sourceRev } = {}) {
  const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'snapshots', `${snapshotDate}.json`), 'utf8'));
  const ids = gitShowJson(positionsRev, 'nflverse/playerids.json').ids;
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
    // Post-boundary-8 captures carry the short-season state; the 2026-10-04 capture predates it.
    if (f.shortSeasonState !== undefined) {
      snapshotRows[id].shortSeasonState = f.shortSeasonState;
      snapshotRows[id].projectedGamesBase = f.projectedGamesBase ?? null;
    }
    if (positionOf[id]) positions[id] = positionOf[id];
  }

  const seasons = {};
  for (let y = FROM; y <= TO; y++) {
    const totals = gitShowJson(sourceRev, `nfl/season-totals/${y}.json`);
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
  return { sourceRev, ...(positionsRev !== sourceRev ? { positionsRev } : {}), snapshot: snapshotDate, positions, snapshotRows, seasons };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
  const snapshotDate = arg('--snapshot') ?? SNAPSHOT_DATE;
  const fx = buildFixture({ sourceRev: arg('--rev') ?? SOURCE_REV, snapshotDate, positionsRev: arg('--positions-rev') });
  const out = path.join(ROOT, 'test', 'fixtures', `durability-parity-${snapshotDate}.json`);
  fs.writeFileSync(out, JSON.stringify(fx) + '\n');
  console.log(`wrote ${out} — ${Object.keys(fx.snapshotRows).length} veteran rows, ${fs.statSync(out).size} bytes`);
}
