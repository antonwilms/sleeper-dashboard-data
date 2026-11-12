/**
 * lib/learnedBench.mjs — LP-1a season-benchmark rules (pure, no I/O). Slice 1b extends it with the weekly benchmark.
 * Task file §4.3 (bench.jsonl) and §6 (the one copied definition: the B2 qualifying predicate).
 */
import { projectedGamesFor } from './durabilityMirror.mjs';
import { twoYearAveragePPG } from './dynastyBacktest.mjs';

/** Arms the in-season classifier labels rookie-routed (`classifyArm`: 'X-rookie0' | 'X-rookie1p'). */
export const isRookieArm = (arm) => typeof arm === 'string' && arm.startsWith('X-rookie');

/**
 * COPY (§6, CR-33): the seasons `twoYearAveragePPG(careerStats, pid, S − 1)` averages — the forecast season's S−2 and S−1 with
 * gamesPlayed ≥ 8 and finite fantasyPoints. Original: lib/dynastyBacktest.mjs `twoYearAveragePPG`; equality pinned by T-LP-11.
 * `S` is the FORECAST season.
 */
export function b2QualifyingSeasons(careerStats, pid, S) {
  const out = [];
  for (const y of [S - 2, S - 1]) {
    const d = careerStats?.[y]?.[pid];
    if (!d || !(d.gamesPlayed >= 8) || !Number.isFinite(d.fantasyPoints)) continue;
    out.push({ season: y, gamesPlayed: d.gamesPlayed, ppg: d.fantasyPoints / d.gamesPlayed });
  }
  return out;
}

/**
 * B2: `ppg` = the imported `twoYearAveragePPG(careerStats, pid, S − 1)`; `total` = ppg × mean over the qualifying seasons of
 * gamesPlayed × teamGamesS / teamGames(season) (`b2QualifyingSeasons` serves only that games scaling).
 * `teamGamesOf(season)` → the player's team's REG game count in that season. null when no season qualifies.
 */
export function b2Benchmark(careerStats, pid, S, { teamGamesS, teamGamesOf }) {
  const q = b2QualifyingSeasons(careerStats, pid, S);
  if (!q.length) return { ppg: null, total: null };
  const ppg = twoYearAveragePPG(careerStats, pid, S - 1);
  if (ppg == null) return { ppg: null, total: null };
  const scaled = q.map(s => s.gamesPlayed * teamGamesS / teamGamesOf(s.season));
  return { ppg, total: ppg * (scaled.reduce((a, v) => a + v, 0) / scaled.length) };
}

/**
 * B1 season fields for one (pid, S) of `assembleSeason(...).playerSeasons`:
 *  - veteran-routed: `g = projectedGamesFor(careerStats, pid, position, { throughSeason: S−1, rule: 'l6c' })`; null → games = total =
 *    null, `noGames: true` (row kept); else games = g.projectedGames, total = ppg × games.
 *  - rookie-routed (`rookieRec` = rookieRecordFor(...)): games = rec.projectedGames, total = rec.projectedTotalPts, and the SEASON
 *    ppg is rec.projectedPPG (the level the total is built from); `ppgWeekly` stays `pointsPrior` (for a non-game-1 first-year QB
 *    with capital that is rec.qbStarterPPG via rookieRosPrior).
 *  - QB rows carry `qbChainApprox: true` on the season total (the app totals a preseason-chain row as starter PPG × start share × games).
 */
export function seasonBench({ pid, position, S, arm, pointsPrior, careerStats, rookieRec = null }) {
  const covered = pointsPrior != null;
  const out = {
    covered, arm: arm ?? null, ppg: pointsPrior ?? null, games: null, total: null, noGames: false,
    ppgWeekly: pointsPrior ?? null, starterPPG: null, qbChainApprox: false,
  };
  if (!covered) return out;
  if (isRookieArm(arm)) {
    if (!rookieRec) throw new Error(`[learnedBench] rookie-routed ${pid} (${S}) needs rookieRec`);
    out.ppg = rookieRec.projectedPPG ?? null;
    out.games = rookieRec.projectedGames ?? null;
    out.total = rookieRec.projectedTotalPts ?? null;
    out.starterPPG = Number.isFinite(rookieRec.qbStarterPPG) ? rookieRec.qbStarterPPG : null;
  } else {
    const g = projectedGamesFor(careerStats, pid, position, { throughSeason: S - 1, rule: 'l6c' });
    if (g == null) out.noGames = true;
    else { out.games = g.projectedGames; out.total = out.ppg * out.games; }
  }
  if (position === 'QB' && out.total != null) out.qbChainApprox = true;
  return out;
}
