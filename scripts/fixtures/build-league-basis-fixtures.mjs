/**
 * scripts/fixtures/build-league-basis-fixtures.mjs — builds D-46's two slim parity fixtures from snapshots/2026-10-14.json:
 *   test/fixtures/rookie-mirror-parity/snapshot-2026-10-14.slim.json     (T-RM16: the rookie-path rows, ROOKIE_PARITY_KEYS)
 *   test/fixtures/r3fit-parity-2025/league-2026-10-14/career-seasons.json
 *   test/fixtures/r3fit-parity-2025/league-2026-10-14/snapshot-2026-10-14.slim.json      (T-F10L: veteran candidates)
 * The career seasons carry league `fantasyPoints` from `rescoreSeasonRowsLeague` (settings: test/fixtures/league-scoring-2026-10-14.json,
 * positions: raw/-players-nfl.json) beside the served half-PPR `sourceFantasyPoints`, so the same rows can be scored under either basis.
 *
 * Run (from the repo root): node scripts/fixtures/build-league-basis-fixtures.mjs
 * Regenerate only if snapshots/2026-10-14.json, nfl/season-totals/{2012..2025}.json or the pinned scoring fixture change.
 * Tests read ONLY these committed fixtures (Invariant 10) — never snapshots/.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { rescoreSeasonRowsLeague, loadLeaguePositions } from '../../lib/leagueBasis.mjs';
import { slimRookieSnapshot, veteranCandidatePids } from '../league-basis-run.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const write = (rel, obj) => {
  const abs = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(obj, null, 2) + '\n');
  console.log(`wrote ${rel}`);
};

const CAPTURE = '2026-10-14';
const snapshot = readJson(`snapshots/${CAPTURE}.json`);

write(`test/fixtures/rookie-mirror-parity/snapshot-${CAPTURE}.slim.json`, slimRookieSnapshot(snapshot));

const settings = readJson('test/fixtures/league-scoring-2026-10-14.json');
const positionOf = loadLeaguePositions();
const rescored = {};
for (let y = 2012; y <= 2025; y++) rescored[y] = rescoreSeasonRowsLeague(readJson(`nfl/season-totals/${y}.json`), settings, positionOf);

const pids = veteranCandidatePids(snapshot);
const career = {};
for (const pid of pids) {
  const seasons = {};
  for (let y = 2012; y <= 2025; y++) {
    const r = rescored[y]?.[pid];
    if (!r) continue;
    seasons[y] = { gamesPlayed: r.gamesPlayed ?? 0, fantasyPoints: r.fantasyPoints, sourceFantasyPoints: r.sourceFantasyPoints, sourceScoringBasis: r.sourceScoringBasis };
  }
  career[pid] = seasons;
}
write(`test/fixtures/r3fit-parity-2025/league-${CAPTURE}/career-seasons.json`, career);

const VET_KEYS = ['basePPG', 'consistencyScore', 'outlierRatio', 'isTdReliant'];
const slim = { targetSeason: snapshot.targetSeason, currentSeason: snapshot.currentSeason, projectionBasis: snapshot.projectionBasis ?? null, players: {} };
for (const pid of pids) {
  const f = snapshot.players[pid].projection.factors;
  slim.players[pid] = { projection: { factors: Object.fromEntries(VET_KEYS.filter(k => f[k] !== undefined).map(k => [k, f[k]])) } };
}
write(`test/fixtures/r3fit-parity-2025/league-${CAPTURE}/snapshot-${CAPTURE}.slim.json`, slim);
