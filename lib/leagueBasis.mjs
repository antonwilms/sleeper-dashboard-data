/**
 * lib/leagueBasis.mjs — the `league` scoring-basis model (D-46, CR-15 mirror).
 *
 * Mirrors the app's load-time season rescore, `rescoreSeasonTotals`
 * (sleeper-dashboard src/api/sleeperStats.js:314-370), and the basis block of
 * `computeEmpiricalAgeCurves` (src/utils/dynastyScore.js:40-47, 59, 69, 73-81, 141-146), both @ app
 * `2267d33`. Imports only lib/fantasyPoints.mjs — it must never import lib/rookieMirror.mjs
 * (T-RM1's import-closure check gets this module as a seed's dependency).
 *
 * Two models, never an overwrite (CR-15): `half_ppr` = the served rows verbatim, scale 1 — byte-identical
 * to every committed artifact; `league` = rows through `rescoreSeasonRowsLeague`, scale from
 * `reconstructPositionBasisScale`. The harness default is `CURRENT_FIT_BASIS_MODEL` (plan D5: the basis of
 * the constants the app pins).
 *
 * Position source: the app passes the live `/players/nfl` map to both the rescore and the age curves; the
 * data side reads `raw/-players-nfl.json` (D3) — see `loadLeaguePositions`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreSeasonStats, seasonEmitsFirstDownBonus } from './fantasyPoints.mjs';

export const SCORING_BASIS_MODELS = Object.freeze(['half_ppr', 'league']);
export const CURRENT_FIT_BASIS_MODEL = 'half_ppr';

/** First season whose rows feed the measured scale (the app loads career history from 2012). */
export const BASIS_SCALE_FROM_SEASON = 2012;

// dynastyScore.js:59 — a per-position scale needs at least this many rescored gp >= 10 rows, else 1.
export const MIN_BASIS_SCALE_ROWS = 30;

const SKILL_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

const WRAPPED = Symbol('leagueBasisLoad');

// dynastyScore.js:40-47 — an even-length median averages the middle pair; empty → 0.
function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Verbatim port of rescoreSeasonTotals (sleeperStats.js:314-370). `positionOf(pid)` stands for
 * `playersMap?.[id]?.position ?? null`. Returns a new object; never mutates `rows`. TEAM_* rows pass
 * through exactly as in the app (no skip).
 */
export function rescoreSeasonRowsLeague(rows, scoringSettings, positionOf) {
  if (rows == null || typeof rows !== 'object') return rows;                                   // :315
  if (scoringSettings == null || Object.keys(scoringSettings).length === 0) return rows;      // :316

  const deriveFirstDowns = !seasonEmitsFirstDownBonus(rows);                                   // :318
  const out = {};
  for (const [id, row] of Object.entries(rows)) {                                              // :320
    if (row == null || typeof row !== 'object' || row.sourceFantasyPoints !== undefined || row.sourceWeeklyPoints !== undefined) {
      out[id] = row;                                                                           // :321-324
      continue;
    }
    const position = positionOf?.(id) ?? null;                                                 // :326
    const scored = scoreSeasonStats(row.stats ?? {}, scoringSettings, { position, deriveFirstDowns });   // :327
    const source = row.fantasyPoints;                                                          // :328
    let ratio = null;
    if (Number.isFinite(source) && source > 0) ratio = scored / source;                        // :330
    else if (source === 0 && scored === 0) ratio = 1;                                          // :331

    const scale = (v) => (ratio != null && Number.isFinite(v) ? Math.round(v * ratio * 100) / 100 : null);   // :333
    let weeklyPoints = row.weeklyPoints;                                                       // :334
    let method = null;
    if (weeklyPoints != null) {                                                                // :336
      method = 'scaled';
      const isPlain = (o) => o != null && typeof o === 'object' && !Array.isArray(o);          // :338
      if (isPlain(row.weeklyStats) && isPlain(weeklyPoints)) {                                 // :339
        const exact = {};
        let sum = 0;
        for (const w of Object.keys(weeklyPoints)) {
          exact[w] = scoreSeasonStats(row.weeklyStats[w] ?? {}, scoringSettings, { position, deriveFirstDowns });
          sum += exact[w];
        }
        const n = Object.keys(exact).length;
        if (Math.abs(sum - scored) <= 0.005 * n + 0.01) { weeklyPoints = exact; method = 'exact'; }   // :348
      }
      if (method === 'scaled') {                                                               // :350
        if (Array.isArray(weeklyPoints)) {
          weeklyPoints = weeklyPoints.map(scale);
        } else {
          const scaled = {};
          for (const [k, v] of Object.entries(weeklyPoints)) scaled[k] = scale(v);
          weeklyPoints = scaled;
        }
      }
    }

    out[id] = {                                                                                // :359
      ...row,
      fantasyPoints: scored,
      weeklyPoints,
      weeklyPointsMethod: method,
      scoringBasis: 'league',
      sourceFantasyPoints: Number.isFinite(source) ? source : null,
      sourceScoringBasis: typeof row.scoringBasis === 'string' ? row.scoringBasis : null,
      sourceWeeklyPoints: row.weeklyPoints ?? null,
    };
  }
  return out;
}

/**
 * The qualifying ratios behind the scale (dynastyScore.js:69, 73-81): per skill position, fantasyPoints /
 * sourceFantasyPoints over gp >= 10 rows rescored from a 'half_ppr' source. rescoredBySeason = { [season]: rows }.
 */
export function basisRatiosByPosition(rescoredBySeason, positionOf) {
  const basisRatios = { QB: [], RB: [], WR: [], TE: [] };
  for (const seasonData of Object.values(rescoredBySeason ?? {})) {
    for (const [playerId, data] of Object.entries(seasonData ?? {})) {
      if (data == null) continue;
      if ((data.gamesPlayed ?? 0) < 10) continue;
      const position = positionOf?.(playerId) ?? null;
      if (!SKILL_POSITIONS.has(position)) continue;
      if (data.sourceScoringBasis === 'half_ppr'
        && Number.isFinite(data.fantasyPoints) && Number.isFinite(data.sourceFantasyPoints)
        && data.sourceFantasyPoints > 0) {
        basisRatios[position].push(data.fantasyPoints / data.sourceFantasyPoints);
      }
    }
  }
  return basisRatios;
}

/**
 * Port of computeEmpiricalAgeCurves' basis block (dynastyScore.js:141-146): the median of each position's ratios,
 * rounded to 3 dp; fewer than MIN_BASIS_SCALE_ROWS rows → 1.
 */
export function reconstructPositionBasisScale(rescoredBySeason, positionOf) {
  const basisRatios = basisRatiosByPosition(rescoredBySeason, positionOf);
  const scale = {};
  for (const pos of Object.keys(basisRatios)) {
    scale[pos] = basisRatios[pos].length >= MIN_BASIS_SCALE_ROWS
      ? Math.round(median(basisRatios[pos]) * 1000) / 1000
      : 1;
  }
  return scale;
}

/**
 * Wraps a loader so every season-totals read is the app's rescored row set. `loadSeasonTotals(y)` is
 * memoised per year (`null` passes through); `basisScaleAsOf(S)` is the scale measured on seasons
 * 2012…S−1 (plan D4: what the app loads with `currentSeason` S, sleeperStats.js:417), memoised. Every
 * other loader passes through. An already-wrapped load is returned unchanged, so the harness and
 * `loadFactorInputs` share one instance.
 */
export function leagueBasisLoad(load, { scoringSettings, positionOf }) {
  if (load?.[WRAPPED]) return load;
  const rescored = new Map();
  const loadSeasonTotals = (y) => {
    if (rescored.has(y)) return rescored.get(y);
    const rows = load.loadSeasonTotals(y);
    const v = rows == null ? rows : rescoreSeasonRowsLeague(rows, scoringSettings, positionOf);
    rescored.set(y, v);
    return v;
  };
  const scales = new Map();
  const basisScaleAsOf = (S) => {
    if (scales.has(S)) return scales.get(S);
    const bySeason = {};
    for (let y = BASIS_SCALE_FROM_SEASON; y <= S - 1; y++) {
      const rows = loadSeasonTotals(y);
      if (rows != null) bySeason[y] = rows;
    }
    const scale = reconstructPositionBasisScale(bySeason, positionOf);
    scales.set(S, scale);
    return scale;
  };
  const wrapped = { ...load, loadSeasonTotals, basisScaleAsOf };
  Object.defineProperty(wrapped, WRAPPED, { value: true, enumerable: false });
  return wrapped;
}

/** The scale a `position` row of season S's prior uses: 1 on a load with no `basisScaleAsOf` (model `half_ppr`). */
export function basisScaleOf(load, S, position) {
  if (typeof load?.basisScaleAsOf !== 'function') return 1;
  return load.basisScaleAsOf(S)?.[position] ?? 1;
}

const PLAYERS_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'raw', '-players-nfl.json');

/** D3: positionOf(pid) from `raw/-players-nfl.json` (a 2026-05-18 copy of the map the app passes). Read once. */
export function loadLeaguePositions({ file = PLAYERS_FILE } = {}) {
  const map = JSON.parse(fs.readFileSync(file, 'utf8'));
  return (pid) => map?.[pid]?.position ?? null;
}

/** Pids in `rows` (any season) absent from the players map — reported by the run (D3). */
export function pidsAbsentFromPlayers(rowsBySeason, { file = PLAYERS_FILE } = {}) {
  const map = JSON.parse(fs.readFileSync(file, 'utf8'));
  const absent = new Set();
  for (const rows of Object.values(rowsBySeason)) {
    for (const pid of Object.keys(rows ?? {})) if (map[pid] == null) absent.add(pid);
  }
  return absent;
}
