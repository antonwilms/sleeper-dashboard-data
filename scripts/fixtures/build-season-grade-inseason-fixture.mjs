/**
 * scripts/fixtures/build-season-grade-inseason-fixture.mjs — builds test/fixtures/season-grade/snap-2026-10-06.json, a
 * trimmed completed capture (c = 4's `ok` checkpoint capture, not the newest) that pins the REAL field names of the
 * per-player `inSeason` block for P3 Slice B's `buildRosRows` (.claude/tasks/january-grading-run-b.md §11).
 *
 * Keeps the envelope scalars and `scoringSettings`, 8 `start` rows + 32 per-game rows (lowest sleeper ids first, so the
 * selection is deterministic), each player's `nfl_team` / `status` / `inSeason` / a minimal `projection`, and the depth
 * chart entries of those players only. Run once; the output is committed.
 *
 * Run: node scripts/fixtures/build-season-grade-inseason-fixture.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(ROOT, 'snapshots/2026-10-06.json');
const OUT = path.join(ROOT, 'test/fixtures/season-grade/snap-2026-10-06.json');

const snap = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const withIn = Object.keys(snap.players).filter(id => snap.players[id].inSeason?.season === 2026).sort((a, b) => (a.length - b.length) || (a < b ? -1 : 1));
const start = withIn.filter(id => snap.players[id].inSeason.start).slice(0, 8);
const plain = withIn.filter(id => !snap.players[id].inSeason.start).slice(0, 32);
const keep = new Set([...start, ...plain]);

const players = {};
for (const id of [...keep]) {
  const p = snap.players[id];
  players[id] = { nfl_team: p.nfl_team ?? null, status: p.status ?? null, projection: { projectedPPG: p.projection?.projectedPPG ?? null }, inSeason: p.inSeason };
}
const teamDepthCharts = {};
for (const [team, byPos] of Object.entries(snap.teamDepthCharts ?? {})) {
  for (const [pos, list] of Object.entries(byPos)) {
    const kept = list.filter(e => keep.has(String(e.playerId)));
    if (kept.length) (teamDepthCharts[team] ??= {})[pos] = kept;
  }
}
const out = {
  schemaVersion: snap.schemaVersion, capturedAt: snap.capturedAt, targetSeason: snap.targetSeason, currentSeason: snap.currentSeason,
  scoringBasis: snap.scoringBasis, projectionBasis: snap.projectionBasis, scoringSettings: snap.scoringSettings,
  teamDepthCharts, players,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n', 'utf8');
console.log(`wrote ${path.relative(ROOT, OUT)}: ${Object.keys(players).length} players (${start.length} start rows)`);
