/**
 * lib/panel.mjs — E-0a grading-panel machinery. Pure: no I/O, no console.
 *
 * Feature builders, the attribution-mode seam (teamKeyResolver — see CLAUDE.md
 * Cross-repo / roadmap R2-REANCHOR), season-blocked forward-chaining CV, ridge
 * fit/eval, and candidate verdict rules. Consumed by scripts/panel-run.mjs,
 * which supplies file-backed inputs; this module never reads a file.
 */

import { DEFAULT_GATES, TEAM_DENOM_MIN, isTeamAggregateId, solveOLS, spearman, isCorruptPredictorSeason } from './backtest.mjs';
import {
  reconstructMomentumFactor, reconstructRegressionFactor, reconstructTrajectoryFactor,
  reconstructShareTrendMultiplier, reconstructShareSeries,
  reconstructSnapShareFactor, reconstructRzUsageFactor, reconstructTeamRzShareFactor,
  reconstructBasePPG,
  reconstructAgeCurves, reconstructAgeFactor, ageAtSeason,
  reconstructDepthFactor,
  reconstructTeamOffenseFactor,
  reconstructQbQualityFactor,
  reconstructEfficiencyFactor, EFFICIENCY_METRICS, EFFICIENCY_MIN_COHORT_OPPS,
  buildCareerArcVector, findReconstructedCareerComps, reconstructCompBlendFactor,
} from './projectionFactors.mjs';

// ─── Constants ────────────────────────────────────────────────────────────────

export const PANEL_DEFAULTS = {
  // R1-SNAPS landed (D6a, finding 3): fromYear widened 2020->2013 now that
  // DEFAULT_LOAD.loadSnapShare (scripts/panel-run.mjs) is re-pointed at
  // nflverse/snaps/<year>.json (D4) instead of season-totals off_snp/tm_off_snp
  // (never populated pre-2020). See CORRUPT_PREDICTOR_SEASONS in ./backtest.mjs
  // if a served season is ever found unfit for grading.
  fromYear: 2013, toYear: 2024,
  minOutcomeGames: 6, minPredictorGames: 6,
  minTrainSeasons: 2,
  ridgeLambda: 1.0, ridgeSweep: [0, 0.5, 1, 2, 4],
};

export const PANEL_POSITIONS = ['QB', 'RB', 'WR', 'TE'];

// RB/WR/TE inherited verbatim from lib/backtest.mjs DEFAULT_GATES; QB is new (panel-only).
export const PANEL_GATES = { ...DEFAULT_GATES, QB: { pass_att: 100 } };

export const ATTRIBUTION_MODES = ['current-team', 'per-season-team'];

const SHARE_FAMILY = ['basePPG', 'momentum', 'gamesPlayedY', 'consistencyCV', 'shareTrend', 'snapShare', 'rzOwnRate', 'teamRzShare', 'ypt'];

export const BASELINE_FEATURES = {
  QB: ['basePPG', 'momentum', 'gamesPlayedY', 'consistencyCV', 'ypa', 'tdRate', 'intRate', 'rushYd'],
  RB: SHARE_FAMILY.slice(),
  WR: SHARE_FAMILY.slice(),
  TE: SHARE_FAMILY.slice(),
};

export const CANDIDATES = {
  airYardsShare: { positions: ['WR', 'TE'], diagnosticPositions: ['RB'], source: 'advstats' },
  shareLevel:    { positions: ['WR', 'TE', 'RB'], diagnosticPositions: [], source: 'derived' },
};

const RECENCY_WEIGHTS = { 0: 0.5, 1: 0.3, 2: 0.2 }; // offset from anchor year Y

// ─── THE R2 SEAM (roadmap R2-REANCHOR) ─────────────────────────────────────────
// Sole team-resolution point for share/team features. Internal call sites pass
// (pid, season). Two modes: 'current-team' ignores season and always resolves
// the anchor-year team — the panel's stand-in for the app's live "current team"
// applied uniformly to every season of a player-season row (this deliberately
// reproduces the app's mis-attribution mechanism, undercount included).
// 'per-season-team' resolves each season's own v3 team (era-accurate) — used by
// the R2-REANCHOR flip gate to measure what correct attribution changes; see
// .claude/tasks/r2-flip-gate.md for the gate semantics.
export function teamKeyResolver(mode, totalsByYear, anchorYear) {
  if (mode === 'current-team') {
    return (pid, _season) => totalsByYear[anchorYear]?.[pid]?.team ?? null;
  }
  if (mode === 'per-season-team') {
    return (pid, season) => totalsByYear[season]?.[pid]?.team ?? null;
  }
  throw new Error(`[panel] unknown attribution mode '${mode}'`);
}

// Sums rec_tgt/rush_att/rec_rz_tgt/rush_rz_att over every record in totalsSeason,
// grouped by teamOf(pid, season). `TEAM_<abbr>` whole-team aggregate pseudo-rows
// are excluded (isTeamAggregateId) — unfiltered they'd double every team
// denominator on top of the summed real players. Records where teamOf returns
// null are skipped and counted in `unattributed` (this is how the app's
// retired-player undercount reproduces under current-team mode — see plan §2.3).
export function buildTeamTotalsForSeason(totalsSeason, season, teamOf) {
  const totals = {};
  let unattributed = 0;
  let aggregateRowsExcluded = 0;
  for (const [pid, rec] of Object.entries(totalsSeason)) {
    if (isTeamAggregateId(pid)) { aggregateRowsExcluded++; continue; }  // TEAM_* pseudo-rows double the denominator
    const team = teamOf(pid, season);
    if (team == null) { unattributed++; continue; }
    if (!totals[team]) totals[team] = { recTgt: 0, rushAtt: 0, recRzTgt: 0, rushRzAtt: 0, rec: 0, fantasyPts: 0 };
    const s = rec?.stats ?? {};
    totals[team].recTgt     += s.rec_tgt     || 0;
    totals[team].rushAtt    += s.rush_att    || 0;
    totals[team].recRzTgt   += s.rec_rz_tgt  || 0;
    totals[team].rushRzAtt  += s.rush_rz_att || 0;
    totals[team].rec        += s.rec         || 0; // R3-FIT: WR/TE shareTrend rec_tgt-fallback denominator (teamContext.js:252)
    totals[team].fantasyPts += rec?.fantasyPoints || 0; // D6a: team-offense rank input (teamContext.js:154-225)
  }
  return { totals, unattributed, aggregateRowsExcluded };
}

// D6a Step 7 — computeTeamContext's rank branch (teamContext.js:175-187): a
// 1-based descending sort of team total fantasyPoints among that season's
// teams. teamTotalsSeason is one season's buildTeamTotalsForSeason result.
export function buildTeamOffenseRanks(teamTotalsSeason) {
  const entries = Object.entries(teamTotalsSeason?.totals ?? {});
  entries.sort(([, a], [, b]) => b.fantasyPts - a.fantasyPts);
  const ranks = {};
  entries.forEach(([team], i) => { ranks[team] = i + 1; });
  return ranks;
}

// ppg/gamesPlayed lookup wrapper over a prebuilt outcome map (Map<pid, OutcomeRecord>
// from buildInBasisOutcomes/buildHalfPprOutcomes — scripts/grade-snapshot.mjs shape).
export function computeSeasonPoints(pid, outcomesForYear) {
  if (!outcomesForYear) return { ppg: null, gamesPlayed: 0 };
  const rec = outcomesForYear.get(String(pid));
  if (!rec) return { ppg: null, gamesPlayed: 0 };
  return { ppg: rec.actualPPG, gamesPlayed: rec.actualGames ?? 0 };
}

// ─── Position resolution (advstats WR/TE/RB → roster QB fallback; FB excluded) ─

// finding 2: advstats carries WR/TE/RB only and roster starts 2016 — a
// 2013-2015 panel resolves NO quarterbacks at all through the first two
// sources and fails silently into an UNK bucket (readJson returns null on a
// missing file rather than throwing). `crosswalk` — a pid -> position|null
// map built from nflverse/playerids.json's season-independent `bySleeper`
// entries — is season-independent so it needs no per-year load; it is the
// third fallback, never the first two, so it changes nothing for any row
// advstats/roster already resolved. Prefer the crosswalk over D5 depth (also
// season-independent-ish but narrower and per-season) per finding 2.
export function resolvePosition(pid, advstatsY, rosterY, crosswalk = null) {
  const advPos = advstatsY?.players?.[pid]?.position;
  if (advPos) return PANEL_POSITIONS.includes(advPos) ? advPos : null;
  const rosterPos = rosterY?.players?.[pid]?.position;
  if (rosterPos) return PANEL_POSITIONS.includes(rosterPos) ? rosterPos : null;
  const crosswalkPos = crosswalk?.[pid];
  if (crosswalkPos) return PANEL_POSITIONS.includes(crosswalkPos) ? crosswalkPos : null;
  return null;
}

// ─── Feature builders (§2.2) ───────────────────────────────────────────────────

export function computeBasePPG(pid, anchorYear, ppgByYear, minGames) {
  let weightedSum = 0, totalWeight = 0;
  for (const offset of [0, 1, 2]) {
    const { ppg, gamesPlayed } = computeSeasonPoints(pid, ppgByYear[anchorYear - offset]);
    if (ppg != null && gamesPlayed >= minGames) {
      weightedSum += RECENCY_WEIGHTS[offset] * ppg;
      totalWeight += RECENCY_WEIGHTS[offset];
    }
  }
  return totalWeight > 0 ? weightedSum / totalWeight : null;
}

export function computeMomentum(pid, anchorYear, ppgByYear, minGames) {
  const cur = computeSeasonPoints(pid, ppgByYear[anchorYear]);
  const prev = computeSeasonPoints(pid, ppgByYear[anchorYear - 1]);
  if (prev.ppg != null && prev.gamesPlayed >= minGames && cur.ppg != null) {
    return cur.ppg - prev.ppg;
  }
  return 0;
}

// Population SD ÷ mean of season-Y weeklyPoints, played weeks only. weeklyPoints
// (nfl/season-totals v3) is a 1-based-week-keyed object holding ONLY played weeks —
// iterate its values directly. (weeklyStatus is a separate 0-based dense array;
// indexing it by a weeklyPoints week-key would be off-by-one, so it is not used here.)
export function computeConsistencyCV(rec) {
  const values = Object.values(rec?.weeklyPoints ?? {});
  const n = values.length;
  if (n < 4) return null;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  if (mean <= 0) return null;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n; // population SD
  return Math.sqrt(variance) / mean;
}

// Attribution-independent ground truth (direct v3 read — see §2.2 mover flag).
export function computeMover(pid, anchorYear, totalsByYear) {
  const teamY   = totalsByYear[anchorYear]?.[pid]?.team ?? null;
  const teamYm1 = totalsByYear[anchorYear - 1]?.[pid]?.team ?? null;
  if (teamY == null || teamYm1 == null) return false;
  return teamY !== teamYm1;
}

// share(s) — WR/TE: rec_tgt / teamTotals(s)[T].recTgt; RB: rush_att / teamTotals(s)[T].rushAtt.
// Null if the team denominator < TEAM_DENOM_MIN. `season` selects both the player's own-stat
// season and (via teamOf) the team-bucket season; under current-team mode teamOf ignores
// `season` and always resolves the anchor-year team (the R2 seam — see teamKeyResolver above).
export function computeShare(pid, position, season, totalsByYear, teamTotalsByYear, teamOf) {
  const rec = totalsByYear[season]?.[pid];
  if (!rec) return null;
  const team = teamOf(pid, season);
  if (team == null) return null;
  const tt = teamTotalsByYear[season]?.totals?.[team];
  const s = rec.stats ?? {};
  if (position === 'RB') {
    const d = tt?.rushAtt ?? 0;
    return d >= TEAM_DENOM_MIN ? (s.rush_att || 0) / d : null;
  }
  const d = tt?.recTgt ?? 0;
  return d >= TEAM_DENOM_MIN ? (s.rec_tgt || 0) / d : null;
}

// R1-SNAPS fallback (D6a, finding 3): season-totals' own off_snp/tm_off_snp are
// only populated 2020+ (never tracked upstream before). nflverse/snaps/<year>.json
// (D4) supplies the same ratio 2013-2025, keyed by sleeperId, cross-validated at
// r>=0.998 per position over the 2020-2024 overlap (data-catalog.md). Prefer the
// season-totals native fields when present (byte-identical to pre-D6a behaviour
// on every row that already had them); fall back to the D4 family only when
// season-totals carries none — this never overrides a real 2020+ value.
export function resolveSnapCounts(pid, rec, snapsSeasonFile) {
  const s = rec?.stats ?? {};
  const offSnp = s.off_snp, tmOffSnp = s.tm_off_snp;
  if (offSnp != null && offSnp > 0 && tmOffSnp != null && tmOffSnp > 0) return { offSnp, tmOffSnp };
  const fallback = snapsSeasonFile?.players?.[pid];
  if (fallback && fallback.offSnaps != null && fallback.teamOffSnaps > 0) {
    return { offSnp: fallback.offSnaps, tmOffSnp: fallback.teamOffSnaps };
  }
  return { offSnp: null, tmOffSnp: null };
}

export function computeSnapShare(rec, pid = null, snapsSeasonFile = null) {
  const { offSnp, tmOffSnp } = resolveSnapCounts(pid, rec, snapsSeasonFile);
  if (offSnp != null && offSnp > 0 && tmOffSnp != null && tmOffSnp > 0) return offSnp / tmOffSnp;
  return null;
}

export function computeRzOwnRate(position, rec) {
  const s = rec?.stats ?? {};
  if (position === 'RB') {
    const d = s.rush_att || 0;
    return d > 0 ? (s.rush_rz_att || 0) / d : null;
  }
  const d = s.rec_tgt || 0;
  return d > 0 ? (s.rec_rz_tgt || 0) / d : null;
}

export function computeTeamRzShare(pid, position, season, totalsByYear, teamTotalsByYear, teamOf) {
  const rec = totalsByYear[season]?.[pid];
  if (!rec) return null;
  const team = teamOf(pid, season);
  if (team == null) return null;
  const tt = teamTotalsByYear[season]?.totals?.[team];
  const s = rec.stats ?? {};
  if (position === 'RB') {
    const d = tt?.rushRzAtt ?? 0;
    return d >= TEAM_DENOM_MIN ? (s.rush_rz_att || 0) / d : null;
  }
  const d = tt?.recRzTgt ?? 0;
  return d >= TEAM_DENOM_MIN ? (s.rec_rz_tgt || 0) / d : null;
}

export function computeYpt(position, rec) {
  const s = rec?.stats ?? {};
  if (position === 'RB') {
    const denom = (s.rush_att || 0) + (s.rec || 0);
    return denom > 0 ? ((s.rush_yd || 0) + (s.rec_yd || 0)) / denom : null;
  }
  const denom = s.rec_tgt || 0;
  return denom > 0 ? (s.rec_yd || 0) / denom : null;
}

export function computeQBFeatures(rec) {
  const s = rec?.stats ?? {};
  const passAtt = s.pass_att || 0;
  return {
    ypa:     passAtt > 0 ? (s.pass_yd  || 0) / passAtt : null,
    tdRate:  passAtt > 0 ? (s.pass_td  || 0) / passAtt : null,
    intRate: passAtt > 0 ? (s.pass_int || 0) / passAtt : null,
    rushYd:  s.rush_yd ?? 0,
  };
}

// ─── Row builder (§2.2/§2.4) ───────────────────────────────────────────────────

// Builds one PanelRow for (pid, position, anchorYear), or reports a dropReason.
// Raw (pre-imputation) feature values are returned — imputation happens inside
// folds (fold-dependent by design; see standardizeTrainApply).
export function buildPanelRow({ pid, position, anchorYear, totalsByYear, ppgByYear, advstatsY, teamOf, teamTotalsByYear, config, snapsSeasonFile = null }) {
  const minPredictorGames = config?.minPredictorGames ?? PANEL_DEFAULTS.minPredictorGames;
  const minOutcomeGames   = config?.minOutcomeGames   ?? PANEL_DEFAULTS.minOutcomeGames;

  const recY = totalsByYear[anchorYear]?.[pid];
  if (!recY) return { dropReason: 'belowGates' };

  const gamesPlayedY = recY.gamesPlayed ?? 0;
  if (gamesPlayedY < minPredictorGames) return { dropReason: 'belowGates' };

  const gates = PANEL_GATES[position] ?? {};
  const s = recY.stats ?? {};
  for (const [key, min] of Object.entries(gates)) {
    if ((s[key] || 0) < min) return { dropReason: 'belowGates' };
  }

  const outcomeYear = anchorYear + 1;
  const outcomeLookup = computeSeasonPoints(pid, ppgByYear[outcomeYear]);
  if (outcomeLookup.ppg == null) return { dropReason: 'noOutcome' };
  if (outcomeLookup.gamesPlayed < minOutcomeGames || !Number.isFinite(outcomeLookup.ppg)) {
    return { dropReason: 'outcomeBelowMinGames' };
  }
  const outcomePPG = outcomeLookup.ppg;

  const basePPG = computeBasePPG(pid, anchorYear, ppgByYear, minPredictorGames);
  if (basePPG == null) return { dropReason: 'belowGates' };

  const momentum      = computeMomentum(pid, anchorYear, ppgByYear, minPredictorGames);
  const consistencyCV = computeConsistencyCV(recY);
  const mover          = computeMover(pid, anchorYear, totalsByYear);

  const features = { basePPG, momentum, gamesPlayedY, consistencyCV };
  const candidates = {};

  if (position === 'QB') {
    Object.assign(features, computeQBFeatures(recY));
  } else {
    const team = totalsByYear[anchorYear]?.[pid]?.team ?? null;
    if (team == null) return { dropReason: 'noTeam' };

    const shareY = computeShare(pid, position, anchorYear, totalsByYear, teamTotalsByYear, teamOf);
    if (shareY == null) return { dropReason: 'noTeamDenominator' };
    const shareYm1 = computeShare(pid, position, anchorYear - 1, totalsByYear, teamTotalsByYear, teamOf);
    const shareTrend = shareYm1 != null ? (shareY - shareYm1) : 0;

    const snapShare = computeSnapShare(recY, pid, snapsSeasonFile);
    if (snapShare == null) return { dropReason: 'missingSnap' };

    const teamRzShare = computeTeamRzShare(pid, position, anchorYear, totalsByYear, teamTotalsByYear, teamOf);
    if (teamRzShare == null) return { dropReason: 'noTeamDenominator' };

    const rzOwnRate = computeRzOwnRate(position, recY);
    const ypt        = computeYpt(position, recY);

    Object.assign(features, { shareTrend, snapShare, rzOwnRate, teamRzShare, ypt });

    candidates.shareLevel = shareY;
    candidates.airYardsShare = isCorruptPredictorSeason('airYardsShare', anchorYear)
      ? null
      : (advstatsY?.players?.[pid]?.airYardsShare ?? null);
  }

  return {
    row: {
      sleeperId: pid,
      position,
      predictorYear: anchorYear,
      team: totalsByYear[anchorYear]?.[pid]?.team ?? null,
      mover,
      features,
      candidates,
      outcomePPG,
    },
  };
}

// ─── Panel assembly (§2.5 coverage) ────────────────────────────────────────────

// inputsByYear: { [year]: { seasonTotals, outcomes (Map), advstats, roster } }.
// advstats/roster may be null/absent for years outside [fromYear..toYear] (not needed there).
export function assemblePanelRows(inputsByYear, config) {
  const fromYear          = config.fromYear;
  const toYear            = config.toYear;
  const minPredictorGames = config.minPredictorGames ?? PANEL_DEFAULTS.minPredictorGames;
  const minOutcomeGames   = config.minOutcomeGames   ?? PANEL_DEFAULTS.minOutcomeGames;
  const attribution       = config.attribution ?? 'current-team';
  const crosswalk         = config.crosswalk ?? null;         // finding 2 — pid -> position|null
  const snapsByYear       = config.snapsByYear ?? {};          // finding 3 — year -> nflverse/snaps file|null

  const totalsByYear = {};
  const ppgByYear = {};
  for (const [yr, input] of Object.entries(inputsByYear)) {
    totalsByYear[yr] = input?.seasonTotals ?? {};
    ppgByYear[yr] = input?.outcomes ?? new Map();
  }

  const rows = [];
  const coverage = {};
  const skippedYears = [];
  const unattributedByYear = {};
  const aggregateRowsExcludedByYear = {};

  const bucket = (position, year) => {
    const key = `${position}-${year}`;
    if (!coverage[key]) coverage[key] = { position, year, assembled: 0, surviving: 0, drops: {}, movers: 0 };
    return coverage[key];
  };

  for (let Y = fromYear; Y <= toYear; Y++) {
    const yearInput = inputsByYear[Y];
    // Missing season-totals OR missing advstats (the primary WR/TE/RB position
    // source) both warn+skip the whole predictor year — same convention as
    // scripts/backtest-run.mjs assembleCohort.
    if (!yearInput || !yearInput.seasonTotals || Object.keys(yearInput.seasonTotals).length === 0 || !yearInput.advstats) {
      skippedYears.push(Y);
      continue;
    }

    const teamOf = teamKeyResolver(attribution, totalsByYear, Y);
    const teamTotalsByYear = {};
    if (totalsByYear[Y])     teamTotalsByYear[Y]     = buildTeamTotalsForSeason(totalsByYear[Y], Y, teamOf);
    if (totalsByYear[Y - 1]) teamTotalsByYear[Y - 1] = buildTeamTotalsForSeason(totalsByYear[Y - 1], Y - 1, teamOf);
    unattributedByYear[Y] = {
      thisYear: teamTotalsByYear[Y]?.unattributed ?? 0,
      priorYear: teamTotalsByYear[Y - 1]?.unattributed ?? 0,
    };
    aggregateRowsExcludedByYear[Y] = {
      thisYear: teamTotalsByYear[Y]?.aggregateRowsExcluded ?? 0,
      priorYear: teamTotalsByYear[Y - 1]?.aggregateRowsExcluded ?? 0,
    };

    const advstatsY = yearInput.advstats;
    const rosterY = yearInput.roster;

    for (const pid of Object.keys(totalsByYear[Y])) {
      const position = resolvePosition(pid, advstatsY, rosterY, crosswalk);
      if (position == null) {
        bucket('UNK', Y).assembled++;
        bucket('UNK', Y).drops.noPositionSource = (bucket('UNK', Y).drops.noPositionSource ?? 0) + 1;
        continue;
      }

      const cov = bucket(position, Y);
      cov.assembled++;

      const result = buildPanelRow({
        pid, position, anchorYear: Y,
        totalsByYear, ppgByYear, advstatsY, teamOf, teamTotalsByYear,
        config: { minPredictorGames, minOutcomeGames },
        snapsSeasonFile: snapsByYear[Y] ?? null,
      });

      if (result.dropReason) {
        cov.drops[result.dropReason] = (cov.drops[result.dropReason] ?? 0) + 1;
        continue;
      }

      cov.surviving++;
      if (result.row.mover) cov.movers++;
      rows.push(result.row);
    }
  }

  return {
    rows,
    coverage: {
      perPositionYear: Object.values(coverage).sort((a, b) => a.year - b.year || a.position.localeCompare(b.position)),
      skippedYears,
      unattributedByYear,
      aggregateRowsExcludedByYear,
    },
  };
}

// ─── Forward-chaining CV folds (§3) ────────────────────────────────────────────

export function forwardChainFolds(years, minTrainSeasons) {
  const sorted = [...new Set(years)].sort((a, b) => a - b);
  const folds = [];
  for (let i = 0; i < sorted.length; i++) {
    const trainYears = sorted.slice(0, i);
    if (trainYears.length >= minTrainSeasons) {
      folds.push({ trainYears, evalYear: sorted[i] });
    }
  }
  return folds;
}

// ─── Training-only standardization + imputation (§2.4/§3 leakage guard) ───────

// Only consistencyCV can carry a raw null into a surviving row (all other null
// classes either listwise-drop the row or are imputed to 0 at row-build time).
// Its "degenerate" nulls are imputed to the training-fold mean, recomputed per
// fold from training rows only.
export function standardizeTrainApply(trainRows, evalRows, featureNames) {
  const imputeMean = {};
  for (const f of featureNames) {
    const vals = trainRows.map(r => r.features[f]).filter(v => v != null && Number.isFinite(v));
    imputeMean[f] = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  }
  const resolve = (row, f) => {
    const v = row.features[f];
    return (v == null || !Number.isFinite(v)) ? imputeMean[f] : v;
  };

  const means = {}, sds = {};
  for (const f of featureNames) {
    const vals = trainRows.map(r => resolve(r, f));
    const n = vals.length;
    const mean = n > 0 ? vals.reduce((s, v) => s + v, 0) / n : 0;
    const variance = n > 1 ? vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1) : 0;
    means[f] = mean;
    sds[f] = Math.sqrt(variance);
  }

  const outcomeVals = trainRows.map(r => r.outcomePPG);
  const outcomeMean = outcomeVals.length > 0 ? outcomeVals.reduce((s, v) => s + v, 0) / outcomeVals.length : 0;
  const outcomeVariance = outcomeVals.length > 1
    ? outcomeVals.reduce((s, v) => s + (v - outcomeMean) ** 2, 0) / (outcomeVals.length - 1) : 0;
  const outcomeSd = Math.sqrt(outcomeVariance);

  const zRow = row => featureNames.map(f => (sds[f] > 0 ? (resolve(row, f) - means[f]) / sds[f] : 0));

  const XTrain = trainRows.map(zRow);
  const yTrain = trainRows.map(r => (outcomeSd > 0 ? (r.outcomePPG - outcomeMean) / outcomeSd : 0));
  const XEval = evalRows.map(zRow);
  const yEval = evalRows.map(r => r.outcomePPG); // raw PPG — MAE computed after de-standardizing predictions

  return { XTrain, yTrain, XEval, yEval, scaler: { means, sds, imputeMean, outcomeMean, outcomeSd } };
}

// ─── Fit + score one fold ──────────────────────────────────────────────────────

export function fitAndScoreFold(trainRows, evalRows, featureNames, { ridgeLambda = PANEL_DEFAULTS.ridgeLambda } = {}) {
  const { XTrain, yTrain, XEval, yEval, scaler } = standardizeTrainApply(trainRows, evalRows, featureNames);
  const evalYear = evalRows[0]?.predictorYear ?? null;
  const { beta, singular } = solveOLS(XTrain, yTrain, { ridgeLambda });

  if (singular || beta === null) {
    return { evalYear, n: 0, mae: null, spearman: null, coefficients: {}, predictions: [] };
  }

  const predictions = XEval.map((xRow, i) => {
    const zPred = xRow.reduce((s, x, j) => s + x * beta[j], 0);
    const predicted = zPred * scaler.outcomeSd + scaler.outcomeMean;
    const row = evalRows[i];
    return { pid: row.sleeperId, predicted, actual: yEval[i], mover: row.mover };
  });

  const n = predictions.length;
  const mae = n > 0 ? predictions.reduce((s, p) => s + Math.abs(p.predicted - p.actual), 0) / n : null;
  const sp = spearman(predictions.map(p => p.predicted), predictions.map(p => p.actual));
  const coefficients = Object.fromEntries(featureNames.map((f, j) => [f, beta[j]]));

  return { evalYear, n, mae, spearman: sp, coefficients, predictions };
}

// ─── Full evaluation across folds (§3 metrics) ────────────────────────────────

export function evaluateModel(rows, folds, featureNames, opts = {}) {
  const { ridgeLambda = PANEL_DEFAULTS.ridgeLambda } = opts;

  const perEvalYear = [];
  const allPredictions = [];
  for (const { trainYears, evalYear } of folds) {
    const trainRows = rows.filter(r => trainYears.includes(r.predictorYear));
    const evalRows = rows.filter(r => r.predictorYear === evalYear);
    if (trainRows.length === 0 || evalRows.length === 0) {
      perEvalYear.push({ evalYear, n: 0, mae: null, spearman: null, coefficients: {}, predictions: [] });
      continue;
    }
    const foldResult = fitAndScoreFold(trainRows, evalRows, featureNames, { ridgeLambda });
    perEvalYear.push(foldResult);
    for (const p of foldResult.predictions) allPredictions.push({ ...p, evalYear });
  }

  const n = allPredictions.length;
  const mae = n > 0 ? allPredictions.reduce((s, p) => s + Math.abs(p.predicted - p.actual), 0) / n : null;

  const yearsWithSpearman = perEvalYear.filter(f => f.spearman != null && f.n > 0);
  const spearmanWeight = yearsWithSpearman.reduce((s, f) => s + f.n, 0);
  const spearmanMean = spearmanWeight > 0
    ? yearsWithSpearman.reduce((s, f) => s + f.spearman * f.n, 0) / spearmanWeight
    : null;

  const moverPreds = allPredictions.filter(p => p.mover);
  const moverN = moverPreds.length;
  const moverMae = moverN > 0 ? moverPreds.reduce((s, p) => s + Math.abs(p.predicted - p.actual), 0) / moverN : null;
  const spearmanByYear = {};
  for (const { evalYear } of folds) {
    const yearMovers = moverPreds.filter(p => p.evalYear === evalYear);
    spearmanByYear[evalYear] = yearMovers.length >= 10
      ? spearman(yearMovers.map(p => p.predicted), yearMovers.map(p => p.actual))
      : null;
  }

  const describeFit = fitDescriptive(rows, featureNames, ridgeLambda);

  return {
    perEvalYear,
    pooled: { n, mae, spearmanMean },
    movers: { n: moverN, mae: moverMae, spearmanByYear },
    describeFit,
  };
}

// Final descriptive fit on all rows (no holdout) — reported coefficients only, not scored.
function fitDescriptive(rows, featureNames, ridgeLambda) {
  if (rows.length === 0) return { coefficients: {} };
  const { XTrain, yTrain } = standardizeTrainApply(rows, [], featureNames);
  const { beta, singular } = solveOLS(XTrain, yTrain, { ridgeLambda });
  if (singular || beta === null) return { coefficients: {} };
  return { coefficients: Object.fromEntries(featureNames.map((f, j) => [f, beta[j]])) };
}

// ─── Candidate grading (§3) ─────────────────────────────────────────────────────

// Fits baseline and baseline+candidate on identical rows/folds (rows must survive
// listwise for the candidate too, so baseline is re-fit on the candidate-complete
// row set — deltas are apples-to-apples).
export function gradeCandidate(rows, folds, position, candidateName, candidateFeature, opts = {}) {
  const { ridgeLambda = PANEL_DEFAULTS.ridgeLambda, ridgeSweep = PANEL_DEFAULTS.ridgeSweep } = opts;
  const baselineFeatures = BASELINE_FEATURES[position];
  const augmentedFeatures = [...baselineFeatures, candidateFeature];

  const posRows = rows.filter(r => r.position === position);
  const fullBaselineN = posRows.length;
  const candidateRows = posRows.filter(r => {
    const v = r.candidates?.[candidateName];
    return v != null && Number.isFinite(v);
  });
  const nCandidateComplete = candidateRows.length;

  const shimRows = candidateRows.map(r => ({
    ...r,
    features: { ...r.features, [candidateFeature]: r.candidates[candidateName] },
  }));

  const fitAt = (lambda) => ({
    baseline:  evaluateModel(shimRows, folds, baselineFeatures, { ridgeLambda: lambda }),
    augmented: evaluateModel(shimRows, folds, augmentedFeatures, { ridgeLambda: lambda }),
  });

  const { baseline, augmented } = fitAt(ridgeLambda);

  const maePooled = (augmented.pooled.mae != null && baseline.pooled.mae != null)
    ? augmented.pooled.mae - baseline.pooled.mae : null;
  const maePerYear = augmented.perEvalYear.map((f, i) => {
    const b = baseline.perEvalYear[i];
    return {
      evalYear: f.evalYear,
      dMae: (f.mae != null && b?.mae != null) ? f.mae - b.mae : null,
    };
  });
  const spearmanDelta = (augmented.pooled.spearmanMean != null && baseline.pooled.spearmanMean != null)
    ? augmented.pooled.spearmanMean - baseline.pooled.spearmanMean : null;

  const coefficient = {
    perFold: augmented.perEvalYear.map(f => ({ evalYear: f.evalYear, coefficient: f.coefficients[candidateFeature] ?? null })),
    allYears: augmented.describeFit.coefficients[candidateFeature] ?? null,
  };

  const sweep = ridgeSweep.map(lambda => {
    const { baseline: b, augmented: a } = fitAt(lambda);
    const dMae = (a.pooled.mae != null && b.pooled.mae != null) ? a.pooled.mae - b.pooled.mae : null;
    const dSpearman = (a.pooled.spearmanMean != null && b.pooled.spearmanMean != null)
      ? a.pooled.spearmanMean - b.pooled.spearmanMean : null;
    return { lambda, dMae, dSpearman };
  });

  const deltas = { maePooled, maePerYear, spearmanMean: spearmanDelta };
  const verdict = decideVerdict(deltas, sweep, baseline.pooled.mae);

  return {
    position, candidate: candidateName,
    nCandidateComplete, fullBaselineN,
    baseline, augmented,
    deltas, coefficient, sweep,
    verdict,
  };
}

// ─── Verdict rules (§3, ordered) ───────────────────────────────────────────────

export function decideVerdict(deltas, sweep, baselineMae) {
  const { maePooled, maePerYear, spearmanMean } = deltas;
  if (maePooled == null) return 'UNSTABLE';
  if (maePooled > 0) return 'DEGRADES';

  const yearsImproved = maePerYear.filter(y => y.dMae != null && y.dMae < 0).length;
  const sweepStable = [0.5, 1, 2].every(lambda => {
    const entry = sweep.find(s => s.lambda === lambda);
    return entry && entry.dMae != null && entry.dMae < 0;
  });
  const clears = maePooled < 0 && spearmanMean != null && spearmanMean >= 0 &&
    yearsImproved >= 2 && sweepStable;
  if (clears) return 'CLEARS';

  if (baselineMae != null && baselineMae > 0 && Math.abs(maePooled) / baselineMae < 0.005) return 'NO-GAIN';

  return 'UNSTABLE';
}

// ─── R2 flip-gate pure layer (roadmap R2-REANCHOR — see .claude/tasks/r2-flip-gate.md) ──
// Cohort classification, prediction pairing, and delta-summary helpers consumed by
// scripts/panel-run.mjs's runFlipGate/buildFlipReport. Pure; no I/O.

export const FLIP_VERDICTS = ['FLIP-CLEARS', 'FLIP-DEGRADES', 'UNDERPOWERED'];
export const FLIP_THRESHOLDS = {
  nMinSensitivePooled: 60, overallRelMaeTol: 0.005,
  overallSpearmanTol: -0.01, cohortRelMaeTol: 0.02,
};

// Row-grain attribution segments (§2.2) from a lite team lookup
// { [year]: { [pid]: { team } } } built from v3 season-totals — ground truth,
// attribution-independent (same convention as computeMover). `historical-mover`
// is equivalent to computeMover's true case (both require team(Y-1)/team(Y)
// non-null and different); this function additionally distinguishes a null-team
// Y-1 record (ym1-team-null) from no Y-1 record at all (no-ym1-record).
export function classifyAttributionCohort(pid, anchorYear, teamsByYear) {
  const teamY = teamsByYear[anchorYear]?.[pid]?.team ?? null;
  const recYm1 = teamsByYear[anchorYear - 1]?.[pid];

  let segment;
  if (recYm1 === undefined) {
    segment = 'no-ym1-record';
  } else {
    const teamYm1 = recYm1.team ?? null;
    if (teamYm1 == null) {
      segment = 'ym1-team-null';
    } else if (teamY != null && teamYm1 !== teamY) {
      segment = 'historical-mover';
    } else {
      segment = 'single-team';
    }
  }

  const sensitive = segment === 'historical-mover' || segment === 'ym1-team-null';

  const teamYp1 = teamsByYear[anchorYear + 1]?.[pid]?.team ?? null;
  const forwardMover = teamY != null && teamYp1 != null && teamY !== teamYp1;

  return { segment, sensitive, forwardMover };
}

// Paired join of two modes' prediction lists on (pid, evalYear); throws on set
// mismatch (parity gate §3.2 at prediction grain). Inputs are flattened
// { pid, evalYear, actual, predicted } records (one mode each).
export function pairPredictions(predsCT, predsPS) {
  const keyOf = (p) => `${p.pid}|${p.evalYear}`;
  const ctKeys = predsCT.map(keyOf);
  const psKeys = predsPS.map(keyOf);
  const ctSet = new Set(ctKeys);
  const psSet = new Set(psKeys);
  if (ctKeys.length !== ctSet.size || psKeys.length !== psSet.size) {
    throw new Error('[panel] pairPredictions: duplicate (pid, evalYear) key within one mode');
  }
  if (ctSet.size !== psSet.size || [...ctSet].some(k => !psSet.has(k))) {
    throw new Error('[panel] pairPredictions: prediction sets diverge between modes — parity violated');
  }

  const psByKey = new Map(predsPS.map(p => [keyOf(p), p]));
  return predsCT.map(ct => {
    const ps = psByKey.get(keyOf(ct));
    return {
      pid: ct.pid,
      evalYear: ct.evalYear,
      actual: ct.actual,
      predCT: ct.predicted,
      predPS: ps.predicted,
      deltaAbsErr: Math.abs(ps.predicted - ps.actual) - Math.abs(ct.predicted - ct.actual),
      predShift: ps.predicted - ct.predicted,
    };
  });
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function p90(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(0.9 * sorted.length) - 1));
  return sorted[idx];
}

// MAE/paired/Spearman summary over one already-filtered paired subset (pairPredictions
// output). Within-year Spearman per mode via the existing spearman() with the n≥10 rule.
export function summarizeModeDelta(pairedRows) {
  const n = pairedRows.length;
  if (n === 0) {
    return {
      n: 0,
      mae: { currentTeam: null, perSeasonTeam: null, delta: null, relDelta: null },
      paired: { meanDeltaAbsErr: null, medianDeltaAbsErr: null, pctImproved: null, maxAbsPredShift: null },
      spearmanByYear: {},
    };
  }

  const maeCT = pairedRows.reduce((s, r) => s + Math.abs(r.predCT - r.actual), 0) / n;
  const maePS = pairedRows.reduce((s, r) => s + Math.abs(r.predPS - r.actual), 0) / n;
  const maeDelta = maePS - maeCT;
  const maeRelDelta = maeCT > 0 ? maeDelta / maeCT : null;

  const deltaAbsErrs = pairedRows.map(r => r.deltaAbsErr);
  const meanDeltaAbsErr = deltaAbsErrs.reduce((s, v) => s + v, 0) / n;
  const medianDeltaAbsErr = median(deltaAbsErrs);
  const pctImproved = (pairedRows.filter(r => r.deltaAbsErr < 0).length / n) * 100;
  const maxAbsPredShift = Math.max(...pairedRows.map(r => Math.abs(r.predShift)));

  const years = [...new Set(pairedRows.map(r => r.evalYear))].sort((a, b) => a - b);
  const spearmanByYear = {};
  for (const year of years) {
    const yearRows = pairedRows.filter(r => r.evalYear === year);
    const yn = yearRows.length;
    spearmanByYear[year] = {
      n: yn,
      currentTeam: yn >= 10 ? spearman(yearRows.map(r => r.predCT), yearRows.map(r => r.actual)) : null,
      perSeasonTeam: yn >= 10 ? spearman(yearRows.map(r => r.predPS), yearRows.map(r => r.actual)) : null,
    };
  }

  return {
    n,
    mae: { currentTeam: maeCT, perSeasonTeam: maePS, delta: maeDelta, relDelta: maeRelDelta },
    paired: { meanDeltaAbsErr, medianDeltaAbsErr, pctImproved, maxAbsPredShift },
    spearmanByYear,
  };
}

// shareTrend_ps − shareTrend_ct distribution per segment (§3.3 mechanism evidence) over
// rows joined by (sleeperId, predictorYear). cohortByKey: Map('pid|year' → classifyAttributionCohort result).
export function summarizeFeatureDelta(rowsCT, rowsPS, cohortByKey) {
  const psByKey = new Map(rowsPS.map(r => [`${r.sleeperId}|${r.predictorYear}`, r]));
  const bySegment = {};
  for (const ct of rowsCT) {
    const key = `${ct.sleeperId}|${ct.predictorYear}`;
    const ps = psByKey.get(key);
    if (!ps) continue;
    const cohort = cohortByKey.get(key);
    const segment = cohort?.segment ?? 'no-ym1-record';
    const delta = ps.features.shareTrend - ct.features.shareTrend;
    (bySegment[segment] ??= []).push(Math.abs(delta));
  }

  const perSegment = {};
  for (const [segment, absDeltas] of Object.entries(bySegment)) {
    perSegment[segment] = {
      n: absDeltas.length,
      meanAbsDelta: absDeltas.reduce((s, v) => s + v, 0) / absDeltas.length,
      p90AbsDelta: p90(absDeltas),
      maxAbsDelta: Math.max(...absDeltas),
    };
  }

  return { perSegment, asymmetricImputationN: perSegment['ym1-team-null']?.n ?? 0 };
}

// §3.4 ordered rules. Pure, table-tested (T-F6). perPosition: [{ position,
// overallRelDMae, dSpearman }] — share positions only.
export function decideFlipVerdict({ sensitivePooledN, perPosition, cohortPooledRelDMae }, thresholds = FLIP_THRESHOLDS) {
  if (sensitivePooledN < thresholds.nMinSensitivePooled) return 'UNDERPOWERED';

  const degrades = perPosition.some(p => p.overallRelDMae != null && p.overallRelDMae > thresholds.overallRelMaeTol) ||
    perPosition.some(p => p.dSpearman != null && p.dSpearman < thresholds.overallSpearmanTol) ||
    (cohortPooledRelDMae != null && cohortPooledRelDMae > thresholds.cohortRelMaeTol);
  if (degrades) return 'FLIP-DEGRADES';

  return 'FLIP-CLEARS';
}

// ─── R3-FIT — fitted per-position factor exponents ─────────────────────────────
// (.claude/tasks/r3fit-exponent-harness.md). Offline analysis extending the E-0a
// panel harness with a log-space exponent fit over reconstructed app factor
// multipliers (lib/projectionFactors.mjs). No served-asset/manifest/scoring
// change — the fitted exponents are findings; shipping them is a separate
// app-repo unit (r3fit-activation.md), gated on the committed verdict this
// produces. Pure; no I/O.

// Product set F_p^full — every member contributes to BOTH predHand and
// predFitted (§1, §2). QB excludes shareTrend/snapShare/teamRzShare
// structurally (the app itself neutralizes them for QB — three structural
// sentinels, §5) and includes rzUsage (HELD-IN-ARM — the app applies it to
// QB unposition-gated, §0.3 item 48).
export const FULL_FACTORS = {
  QB: ['momentum', 'regression', 'trajectory', 'rzUsage'],
  RB: ['shareTrend', 'regression', 'momentum', 'trajectory', 'snapShare', 'rzUsage', 'teamRzShare'],
  WR: ['shareTrend', 'regression', 'momentum', 'trajectory', 'snapShare', 'rzUsage', 'teamRzShare'],
  TE: ['shareTrend', 'regression', 'momentum', 'trajectory', 'snapShare', 'rzUsage', 'teamRzShare'],
  // Synthetic pooled position (assessment §B.4, §4) — WR and TE share an
  // identical factor set, so a WR+TE pool reuses gradeExponentFit/
  // selectFitFactors unchanged by relabelling pooled rows' `position` to
  // 'WRTE'; cohorts stay position-separate because each row's multipliers
  // were already computed under its TRUE position's cohort pools, upstream
  // of pooling (§4 "WR+TE pool fallback").
  WRTE: ['shareTrend', 'regression', 'momentum', 'trajectory', 'snapShare', 'rzUsage', 'teamRzShare'],
};

// Estimable subset — FULL_FACTORS minus the config-level HELD-IN-ARM factors
// (v1: exactly QB rzUsage). selectFitFactors further prunes this per position,
// at run time, into F_p^fit (rule 0b, data-driven — §1, §4).
export const FIT_CANDIDATES = {
  QB: ['momentum', 'regression', 'trajectory'],
  RB: FULL_FACTORS.RB.slice(),
  WR: FULL_FACTORS.WR.slice(),
  TE: FULL_FACTORS.TE.slice(),
  WRTE: FULL_FACTORS.WRTE.slice(),
};

// The app's combinedNewFactorRaw membership, restricted to the 7 fitted
// factors (5 of 7; the other 5 combinedNewFactorRaw members are HELD-OMITTED
// — seasonProjection.js:594-597, §0.3 item 54). shareTrend/regression sit
// OUTSIDE the envelope and multiply directly into rawPPG (:599).
export const ENVELOPE_FACTORS = ['momentum', 'trajectory', 'snapShare', 'rzUsage', 'teamRzShare'];

// ─── D6a — six additional reconstructions (fullpipeline-harness.md §Design/A) ──
//
// DELIBERATE DEVIATION, stated plainly (see the task hand-back): finding 1
// says each new factor gets "a FULL_FACTORS entry" — this does NOT extend the
// FULL_FACTORS/FIT_CANDIDATES/ENVELOPE_FACTORS constants above. Those three are
// read directly by the R3-FIT CALIBRATION engine this slice is explicitly
// forbidden from touching (fitExponents/evaluateExponentModel/gradeExponentFit/
// decideFitVerdict/predictWithExponents/selectFitFactors) — D6a is
// capture-and-measure only; D6b builds the calibration sweep. Two independent
// reasons block folding compBlend into that engine today, not just test
// churn: (1) compBlend is NOT a Π f_i^w_i multiplicative term — it is the
// app's post-hoc convex blend applied AFTER pipelinePPG's own [0,40] clamp
// (compsIntegration.js:27-66), and predictWithExponents has no third
// post-outer-clamp stage to compose it correctly; feeding it through the
// existing inner/outer split would silently compute the WRONG number. (2) the
// existing calibration engine's ~15 call sites and their test fixtures
// (test/panel-fit.test.mjs) assume the 7-factor product set; mutating the
// shared constants would break that suite for reasons unrelated to this
// slice's actual deliverable. D6b is where FULL_FACTORS genuinely grows to
// thirteen (CR-15) — once it also fixes predictWithExponents' clamp
// composition for compBlend and re-validates the calibration suite against
// the wider set. Until then, this constant is `attachFactorMultipliers`' own
// dispatch list for the six NEW branches only — additive, and it changes
// nothing about what the existing --fit CLI mode computes or grades.
export const D6_NEW_FACTORS = {
  QB: ['age', 'depth', 'teamOffense', 'efficiency', 'compBlend'],       // no qbQuality — app gates position!=='QB'
  RB: ['age', 'depth', 'teamOffense', 'qbQuality', 'efficiency', 'compBlend'],
  WR: ['age', 'depth', 'teamOffense', 'qbQuality', 'efficiency', 'compBlend'],
  TE: ['age', 'depth', 'teamOffense', 'qbQuality', 'efficiency', 'compBlend'],
};

// Documentation only (mirrors FACTOR_RECONSTRUCTORS' own disposition, finding
// 1) — the full thirteen-factor product set CR-15 names, for reference. NOT
// read by any dispatch or calibration code; do not import this expecting it to
// drive behaviour.
export const FULL_FACTORS_D6 = {
  QB: [...FULL_FACTORS.QB, ...D6_NEW_FACTORS.QB],
  RB: [...FULL_FACTORS.RB, ...D6_NEW_FACTORS.RB],
  WR: [...FULL_FACTORS.WR, ...D6_NEW_FACTORS.WR],
  TE: [...FULL_FACTORS.TE, ...D6_NEW_FACTORS.TE],
};

// Of the six, only qbQuality and efficiency sit inside the app's
// combinedNewFactorRaw envelope (seasonProjection.js:576,594-597); age/depth/
// teamOffense multiply directly into rawPPG like shareTrend/regression;
// compBlend sits entirely outside and after pipelinePPG's own clamp (see the
// deviation note above). Documentation only, same disposition as
// FULL_FACTORS_D6 — not consumed by predictWithExponents today.
export const ENVELOPE_FACTORS_D6_ADDITIONS = ['qbQuality', 'efficiency'];

// seasonProjection.js:598/:601.
export const FIT_COMBINED_CLAMP = [0.67, 1.50];
export const FIT_OUTER_CLAMP = [0, 40];

export const FIT_VERDICT_LABELS = ['CLEARS', 'NO-GAIN', 'DEGRADES', 'UNSTABLE', 'INSUFFICIENT-POWER'];

export const HISTORY_FLOOR = 2012;
export const FIT_ALPHA_DEFAULT = 0.5;
export const FIT_ALPHA_SWEEP = [0.1, 0.25, 0.5, 1, 2];
// The sign-stability guard's two reference points (decideFitVerdict rule 2) —
// 0.5 doubles as the shipped α, so wByAlpha[0.5] === wFinal (Overrides §1).
export const FIT_SIGN_STABILITY_ALPHAS = [0.5, 2];
export const FIT_MIN_N_TO_PARAM = 20;
export const FIT_MAX_FLAT_ONE_RATE = 0.90;
export const FIT_FLAT_ONE_EPS = 1e-12;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// rzKey/oppKey/minOpp per position — mirrors usageMetrics.js RZ_CONFIG
// (:58-64). Shared by buildCohortPools (pool membership) and
// attachFactorMultipliers (per-row rzUsage input extraction) — one constant,
// two call sites, per the app's own module boundary.
const RZ_OWN_KEYS = {
  QB: { rzKey: 'pass_rz_att', oppKey: 'pass_att', minOpp: 50 },
  RB: { rzKey: 'rush_rz_att', oppKey: 'rush_att', minOpp: 30 },
  WR: { rzKey: 'rec_rz_tgt', oppKey: 'rec_tgt', minOpp: 20 },
  TE: { rzKey: 'rec_rz_tgt', oppKey: 'rec_tgt', minOpp: 20 },
};

// rzKey/oppKey/minOpp/denomKey per position — mirrors teamRzShare.js
// RZ_SHARE_CONFIG (:44-49). QB has no entry: F_QB^full excludes teamRzShare
// structurally (§5) — callers never look this up for QB.
const RZ_SHARE_KEYS = {
  RB: { rzKey: 'rush_rz_att', oppKey: 'rush_att', minOpp: 30, denomKey: 'rushRzAtt' },
  WR: { rzKey: 'rec_rz_tgt', oppKey: 'rec_tgt', minOpp: 20, denomKey: 'recRzTgt' },
  TE: { rzKey: 'rec_rz_tgt', oppKey: 'rec_tgt', minOpp: 20, denomKey: 'recRzTgt' },
};

// ── §3.2 step 2 / §6.2 — cohort pools, named+exported so attachFactorMultipliers,
// T-F8, and the T-F10 fidelity gate all call the same production code. Built from
// EVERY player in totalsSeason (position via positionOf), under the app's own
// gates — never the outcome-conditioned survivors. positionOf: pid → position|null.
// teamTotalsSeason: one season's buildTeamTotalsForSeason result (used for the
// teamRz pool's denominator only). snapsSeasonFile (D6a, finding 3): one
// season's nflverse/snaps/<year>.json, or null — R1-SNAPS fallback for the
// snap pool on pre-2020 seasons where season-totals' own off_snp/tm_off_snp
// are unpopulated (resolveSnapCounts, additive: never overrides a real value).
export function buildCohortPools(totalsSeason, positionOf, teamTotalsSeason, snapsSeasonFile = null) {
  const pools = {
    QB: { snap: [], rz: [], teamRz: [], efficiency: {} },
    RB: { snap: [], rz: [], teamRz: [], efficiency: {} },
    WR: { snap: [], rz: [], teamRz: [], efficiency: {} },
    TE: { snap: [], rz: [], teamRz: [], efficiency: {} },
  };

  for (const [pid, rec] of Object.entries(totalsSeason ?? {})) {
    if (isTeamAggregateId(pid)) continue;
    const position = positionOf(pid);
    if (!pools[position]) continue;
    const s = rec?.stats ?? {};

    // Snap pool — RB/WR/TE only; QB's stays empty by construction (usageMetrics.js:75/86).
    if (position !== 'QB') {
      const { offSnp, tmOffSnp } = resolveSnapCounts(pid, rec, snapsSeasonFile);
      const snaps = offSnp ?? 0;
      const teamSnaps = tmOffSnp ?? 0;
      if (snaps >= 100 && teamSnaps > 0) pools[position].snap.push(snaps / teamSnaps);
    }

    // RZ own-rate pool — all four positions, QB included (held-in-arm still needs a pool).
    const rzCfg = RZ_OWN_KEYS[position];
    const opp = s[rzCfg.oppKey] ?? 0;
    if (opp >= rzCfg.minOpp) {
      pools[position].rz.push((s[rzCfg.rzKey] ?? 0) / opp);

      // teamRz pool — RB/WR/TE only; denominator from the entity-filtered,
      // per-season-team totals at this same season (teamRzShare.js:83/88).
      const teamRzCfg = RZ_SHARE_KEYS[position];
      if (teamRzCfg) {
        const team = rec?.team ?? null; // per-season-team at this season — no fallback
        if (team != null) {
          const denom = teamTotalsSeason?.totals?.[team]?.[teamRzCfg.denomKey] ?? 0;
          if (denom >= TEAM_DENOM_MIN) {
            pools[position].teamRz.push((s[teamRzCfg.rzKey] ?? 0) / denom);
          }
        }
      }
    }

    // D6a — efficiency pools, one array per metric name (efficiencyMetrics.js
    // MIN_COHORT_OPPS opportunity floor, keyed by oppKey — one floor per
    // oppKey, shared by every metric using it).
    for (const m of EFFICIENCY_METRICS[position] ?? []) {
      const metricOpp = s[m.oppKey] ?? 0;
      const floor = EFFICIENCY_MIN_COHORT_OPPS[m.oppKey] ?? 0;
      if (metricOpp < floor) continue;
      const raw = m.ratio(s);
      if (raw == null || !Number.isFinite(raw)) continue;
      (pools[position].efficiency[m.name] ??= []).push(raw);
    }
  }

  for (const position of Object.keys(pools)) {
    pools[position].snap.sort((a, b) => a - b);
    pools[position].rz.sort((a, b) => a - b);
    pools[position].teamRz.sort((a, b) => a - b);
    for (const arr of Object.values(pools[position].efficiency)) arr.sort((a, b) => a - b);
  }
  return pools;
}

// ── §1 / Overrides §3 — the shared clamp prediction form. Both predHand
// (exponents={}) and predFitted (exponents=w) call this SAME function — T-F1
// asserts against it directly rather than reimplementing the clamp logic.
// fullFactors is F_p^full for row.position (the product set — pinned and
// held-in-arm members included, at their multiplier value); exponents carries
// w_i for estimated factors only, any factor absent from it (pinned,
// held-in-arm, or the hand arm's {}) defaults to w=1.
//
// KNOWN LIMITATION (state in verdict/README, do not "fix"): this reconstructs
// a REDUCED 5-factor inner product (ENVELOPE_FACTORS) against the app's real
// 10-factor combinedNewFactorRaw — the other 5 envelope members are
// HELD-OMITTED. The reduced hand inner maxes out well inside [0.67,1.50]
// (~1.35 at the extreme), so clampHits.hand is 0 by construction, not because
// production's envelope is inert — it is a conservative approximation of the
// app's clamp, not a faithful reconstruction. It still catches the fitted
// arm's own inflation (the risk item 54 identifies), which is what it exists
// for.
export function predictWithExponents(row, exponents, fullFactors, envelopeFactors) {
  let innerLogSum = 0;
  let outerLogSum = 0;
  for (const factor of fullFactors) {
    const f = row.multipliers[factor];
    const w = exponents[factor] ?? 1;
    const term = w * Math.log(f);
    if (envelopeFactors.includes(factor)) innerLogSum += term;
    else outerLogSum += term;
  }

  const innerRaw = Math.exp(innerLogSum);
  const inner = clamp(innerRaw, FIT_COMBINED_CLAMP[0], FIT_COMBINED_CLAMP[1]);
  const innerClamped = inner !== innerRaw;

  const outer = Math.exp(outerLogSum);
  const rawPPG = row.anchorBasePPG * outer * inner;
  const predicted = clamp(rawPPG, FIT_OUTER_CLAMP[0], FIT_OUTER_CLAMP[1]);

  return { predicted, innerClamped };
}

// ── §3.2 — the reconstruction pass. Pure; called from assemblePanel behind
// withFactorMultipliers (§6.3). Takes the ALREADY-ASSEMBLED E-0a rows (from
// assemblePanelRows, unmodified — buildPanelRow's own edit was withdrawn,
// §6.2) and augments each SURVIVING row with qualifyingSeasons/lastQSeason/
// multipliers/anchorBasePPG/shareSeries/forwardMover, applying R1 rookie
// exclusion and the §3.2 step-4a positivity drop on top of the panel's
// existing gates.
//
// advstatsByYear/rosterByYear are an addition beyond the task file's literal
// 5-key ctx (totalsByYear/teamTotalsByYear/ppgByYear/fromYear/toYear):
// buildCohortPools' positionOf callback has no other source for resolving an
// arbitrary pid's position at season Y (resolvePosition needs that year's
// advstats/roster, which the standard [fromYear..toYear] load already has —
// §3.3 only widens totalsByYear/ppgByYear, not advstats/roster).
export function attachFactorMultipliers(rows, ctx) {
  const {
    totalsByYear, teamTotalsByYear, ppgByYear, advstatsByYear = {}, rosterByYear = {},
    // D6a additions — finding 2 (position crosswalk), finding 3 (snap fallback
    // pools), §Design/A (age birthdate crosswalk, D5 depth-order lookup).
    crosswalk = null, snapsByYear = {}, birthdateOf = () => null, depthByYear = {},
  } = ctx;

  const fitCoverage = {
    droppedByReason: {},
    sentinelCounts: {},
    flatOneCounts: {},
    seriesDrops: { belowGp8: 0, nullTeam: 0, noTeamEntry: 0, zeroOwnVolume: 0, nonFinite: 0 },
    seriesLengths: {},
    recFallbackUsed: 0,
    subMinDenomKept: 0,
    shareGtOne: 0,
    zeroGpWithStats: 0,
    nonFiniteFantasyPoints: 0,
    truncatedAt2012: 0,
    forwardMoverNeutralized: 0,
    nullSeasonTeam: 0,
    debutYMinus1: 0,
    nonPositiveOutcome: 0,
    nonPositiveAnchor: 0,
  };

  const drop = (reason) => { fitCoverage.droppedByReason[reason] = (fitCoverage.droppedByReason[reason] ?? 0) + 1; };
  const bump = (obj, position, factor) => {
    if (!obj[position]) obj[position] = {};
    obj[position][factor] = (obj[position][factor] ?? 0) + 1;
  };

  // §3.0-C4 / T-F18b: gamesPlayed===0 contributor inertness, over the whole
  // loaded population (not just fit rows). §3.0-C6 / T-F18c: absent/non-finite
  // fantasyPoints at gp>=8, same population. Both certified-inert-style —
  // expect 0, report, never gate the hot path on them.
  for (const yearTotals of Object.values(totalsByYear)) {
    for (const rec of Object.values(yearTotals ?? {})) {
      const gp = rec?.gamesPlayed ?? 0;
      const s = rec?.stats ?? {};
      if (gp === 0 && ((s.rush_att || 0) > 0 || (s.rec_tgt || 0) > 0 || (s.rec || 0) > 0 || (s.rush_rz_att || 0) > 0 || (s.rec_rz_tgt || 0) > 0)) {
        fitCoverage.zeroGpWithStats++;
      }
      if (gp >= 8) {
        const fp = rec?.fantasyPoints;
        if (fp == null || !Number.isFinite(fp)) fitCoverage.nonFiniteFantasyPoints++;
      }
    }
  }

  // Lite team lookup (loadTeamLookup's shape) for classifyAttributionCohort's
  // forwardMover proxy — reused, not forked (§3.6).
  const teamsByYear = {};
  for (const [yr, yearTotals] of Object.entries(totalsByYear)) {
    const yearLookup = {};
    for (const [pid, rec] of Object.entries(yearTotals ?? {})) {
      yearLookup[pid] = { team: rec?.team ?? null };
    }
    teamsByYear[yr] = yearLookup;
  }

  const allYears = Object.keys(totalsByYear).map(Number).sort((a, b) => a - b);
  const positionOfYear = (pid, Y) => resolvePosition(pid, advstatsByYear[Y], rosterByYear[Y], crosswalk);
  const poolsByYear = {};
  const getPools = (Y) => {
    if (!poolsByYear[Y]) {
      const positionOf = (pid) => positionOfYear(pid, Y);
      poolsByYear[Y] = buildCohortPools(totalsByYear[Y], positionOf, teamTotalsByYear[Y], snapsByYear[Y] ?? null);
    }
    return poolsByYear[Y];
  };

  // D6a — the <=Y population age curves (Step 2) and comp-blend career-arc
  // pool (Step 9) are both built once per predictor year Y (data-catalog.md's
  // own convention for per-Y caches, matching poolsByYear above) since both
  // read the SAME <=Y qualifying-season population, just grouped differently.
  // Position is resolved ONCE per player at Y (mirrors §3.4's own
  // once-at-Y convention for the share series, §3.0-C2) — via
  // positionOfYear, which now also carries the finding-2 crosswalk fallback,
  // essential here since most of [HISTORY_FLOOR..Y] falls outside the
  // [fromYear..toYear] advstats/roster load window.
  const yearPopulationByY = {};
  const getYearPopulation = (Y) => {
    if (yearPopulationByY[Y]) return yearPopulationByY[Y];
    const ageRows = [];
    const compPopulation = { QB: {}, RB: {}, WR: {}, TE: {} };
    const positionCache = {};
    for (let s = HISTORY_FLOOR; s <= Y; s++) {
      const seasonTotals = totalsByYear[s];
      if (!seasonTotals) continue;
      for (const candPid of Object.keys(seasonTotals)) {
        if (isTeamAggregateId(candPid)) continue;
        let candPosition = positionCache[candPid];
        if (candPosition === undefined) {
          candPosition = positionOfYear(candPid, Y);
          positionCache[candPid] = candPosition;
        }
        if (!candPosition) continue;
        const { ppg, gamesPlayed } = computeSeasonPoints(candPid, ppgByYear[s]);
        if (!Number.isFinite(ppg)) continue;
        ageRows.push({ pid: candPid, position: candPosition, season: s, ppg, gamesPlayed });
        if (gamesPlayed >= 8) {
          (compPopulation[candPosition][candPid] ??= []).push(ppg);
        }
      }
    }
    const { curves, positionPeakPPG } = reconstructAgeCurves(ageRows, birthdateOf);
    const compCandidatesByPosition = {};
    for (const position of Object.keys(compPopulation)) {
      compCandidatesByPosition[position] = Object.entries(compPopulation[position])
        .map(([candPid, ppgs]) => ({ pid: candPid, vector: buildCareerArcVector(ppgs, positionPeakPPG[position]) }));
    }
    yearPopulationByY[Y] = { curves, positionPeakPPG, compCandidatesByPosition };
    return yearPopulationByY[Y];
  };

  // D6a Step 7b — QB1 identity+quality, cached per (lastQSeason, team) since
  // many rows on the same team in the same season share an answer. D5
  // (nflverse/depth) latest-available-week depth-1 QB, else the app's own
  // PPG-based fallback among that team's QBs in that season (teamContext.js:
  // 70-73). Quality is always the app's dynastyScore-absent fallback (KTC
  // join not wired this slice — coverage note in the hand-back; effectively
  // neutral 50 for the entire 2013-2025 panel since KTC history starts
  // 2026-05-18).
  const qb1CacheBySeason = {};
  const resolveQb1 = (season, team) => {
    if (!team) return { qb1Pid: null, quality: null };
    if (!qb1CacheBySeason[season]) qb1CacheBySeason[season] = {};
    if (qb1CacheBySeason[season][team]) return qb1CacheBySeason[season][team];

    const depthFile = depthByYear[season];
    const weeks = depthFile?.weeks ?? {};
    const weekNums = Object.keys(weeks).map(Number);
    let qb1Pid = null;
    if (weekNums.length > 0) {
      const latestWeek = Math.max(...weekNums);
      const arr = weeks[latestWeek]?.[team]?.QB;
      if (Array.isArray(arr) && arr[0] != null) qb1Pid = arr[0];
    }
    if (qb1Pid == null) {
      let bestPid = null, bestPpg = -Infinity;
      for (const [candPid, rec] of Object.entries(totalsByYear[season] ?? {})) {
        if (isTeamAggregateId(candPid)) continue;
        if ((rec?.team ?? null) !== team) continue;
        if (positionOfYear(candPid, season) !== 'QB') continue;
        const gp = rec?.gamesPlayed ?? 0;
        if (gp <= 0) continue;
        const ppg = (rec?.fantasyPoints ?? 0) / gp;
        if (ppg > bestPpg) { bestPpg = ppg; bestPid = candPid; }
      }
      qb1Pid = bestPid;
    }
    const result = { qb1Pid, quality: qb1Pid != null ? 50 : null }; // dynastyScore/KTC unportable -> app's own absent-fallback default
    qb1CacheBySeason[season][team] = result;
    return result;
  };

  // D6a Step 8 — D5 latest-available-week depth order for (season, team,
  // position, pid). null on any unresolved step (no file, no team entry, no
  // position entry, pid not found) -> neutral; NEVER re-indexed (finding 11).
  const resolveDepthOrder = (season, team, position_, pid_) => {
    if (!team) return null;
    const depthFile = depthByYear[season];
    const weeks = depthFile?.weeks ?? {};
    const weekNums = Object.keys(weeks).map(Number);
    if (weekNums.length === 0) return null;
    const latestWeek = Math.max(...weekNums);
    const arr = weeks[latestWeek]?.[team]?.[position_];
    if (!Array.isArray(arr)) return null;
    const idx = arr.indexOf(pid_);
    return idx === -1 ? null : idx + 1;
  };

  const teamOffenseRanksByYear = {};
  const getTeamOffenseRanks = (Y) => {
    if (!teamOffenseRanksByYear[Y]) teamOffenseRanksByYear[Y] = buildTeamOffenseRanks(teamTotalsByYear[Y]);
    return teamOffenseRanksByYear[Y];
  };

  fitCoverage.age = { birthdateMissing: 0, curveEmpty: 0, eligible: 0, byYear: {} };
  fitCoverage.depth = { nullOrder: 0, resolved: 0, byYear: {} };
  fitCoverage.teamOffense = { missingRank: 0, resolved: 0, byYear: {} };
  fitCoverage.qbQuality = { notApplicable: 0, noQb1: 0, resolved: 0, byYear: {} };
  fitCoverage.efficiency = { noMetrics: 0, resolved: 0, byYear: {} };
  fitCoverage.compBlend = { ineligible: 0, eligible: 0, byYear: {} };
  // D6a — per-year eligible/total counters for age + each of the six new
  // factors (task hand-back requirement: "coverage rate per year for age and
  // for each factor's eligible window"). bumpYear(counter, Y, eligible)
  // increments total always, eligible only when true.
  const bumpYear = (counter, Y, eligible) => {
    const y = (counter.byYear[Y] ??= { total: 0, eligible: 0 });
    y.total++;
    if (eligible) y.eligible++;
  };

  const fitRows = [];

  for (const row of rows) {
    const { sleeperId: pid, position, predictorYear: Y } = row;
    const fullFactors = FULL_FACTORS[position];
    const d6Factors = D6_NEW_FACTORS[position] ?? [];

    // ── Step 1: qualifyingSeasons (HISTORY_FLOOR..Y) + R1 exclusion ────────
    const qualifyingSeasons = [];
    for (let s = HISTORY_FLOOR; s <= Y; s++) {
      const { ppg, gamesPlayed } = computeSeasonPoints(pid, ppgByYear[s]);
      if (Number.isFinite(ppg) && gamesPlayed >= 8) qualifyingSeasons.push({ season: s, ppg, gamesPlayed });
    }
    if (qualifyingSeasons.length > 0 && qualifyingSeasons[0].season === HISTORY_FLOOR) {
      fitCoverage.truncatedAt2012++;
    }
    if (qualifyingSeasons.length === 0) { drop('rookiePathNoQualifying'); continue; }

    let earliestAppearanceYear = null;
    for (const yr of allYears) {
      if (yr < Y && totalsByYear[yr]?.[pid] != null) { earliestAppearanceYear = yr; break; }
    }
    if (earliestAppearanceYear == null) { drop('rookiePathYearsExpProxy'); continue; }
    const isDebutYMinus1 = earliestAppearanceYear === Y - 1;
    if (isDebutYMinus1) fitCoverage.debutYMinus1++;

    const meanPPG = qualifyingSeasons.reduce((a, s) => a + s.ppg, 0) / qualifyingSeasons.length;
    const ppgs = qualifyingSeasons.map(s => s.ppg);
    const lastQ = qualifyingSeasons[qualifyingSeasons.length - 1];
    const lastQSeason = lastQ.season;
    const lastQRec = totalsByYear[lastQSeason]?.[pid];
    const lastQStats = lastQRec?.stats ?? {};

    // ── Step 2 + 3: cohort pools (cached per Y) + per-row multipliers ──────
    const pools = getPools(Y);
    const multipliers = {};
    const sentinelHit = {};
    let shareSeriesResult = null;

    if (fullFactors.includes('momentum')) {
      sentinelHit.momentum = ppgs.length < 4;
      multipliers.momentum = reconstructMomentumFactor(ppgs, meanPPG);
    }
    if (fullFactors.includes('regression')) {
      sentinelHit.regression = false; // row 2: no sentinel — always computed
      multipliers.regression = reconstructRegressionFactor(ppgs, meanPPG, lastQ.ppg);
    }
    if (fullFactors.includes('trajectory')) {
      sentinelHit.trajectory = ppgs.length < 2;
      multipliers.trajectory = reconstructTrajectoryFactor(ppgs);
    }
    if (fullFactors.includes('shareTrend')) {
      const seasonsRange = [];
      for (let s = HISTORY_FLOOR; s <= Y; s++) seasonsRange.push(s);
      shareSeriesResult = reconstructShareSeries({ pid, position, seasons: seasonsRange, totalsByYear, teamTotalsByYear });
      sentinelHit.shareTrend = shareSeriesResult.series.length < 2;
      multipliers.shareTrend = reconstructShareTrendMultiplier(shareSeriesResult.series);

      for (const reason of Object.keys(fitCoverage.seriesDrops)) {
        fitCoverage.seriesDrops[reason] += shareSeriesResult.dropped[reason] ?? 0;
      }
      fitCoverage.recFallbackUsed += shareSeriesResult.recFallbackUsed;
      fitCoverage.subMinDenomKept += shareSeriesResult.subMinDenomKept;
      fitCoverage.shareGtOne += shareSeriesResult.shareGtOne;
      (fitCoverage.seriesLengths[position] ??= []).push(shareSeriesResult.series.length);
    }
    if (fullFactors.includes('snapShare')) {
      const offSnp = lastQStats.off_snp ?? null;
      const tmOffSnp = lastQStats.tm_off_snp ?? null;
      sentinelHit.snapShare = offSnp == null || tmOffSnp == null || tmOffSnp <= 0;
      multipliers.snapShare = reconstructSnapShareFactor({ offSnp, tmOffSnp }, pools[position]?.snap ?? []);
    }
    if (fullFactors.includes('rzUsage')) {
      const rzCfg = RZ_OWN_KEYS[position];
      const opp = lastQStats[rzCfg.oppKey] ?? null;
      sentinelHit.rzUsage = opp == null || opp <= 0;
      multipliers.rzUsage = reconstructRzUsageFactor(
        { rzOwn: lastQStats[rzCfg.rzKey] ?? 0, opp }, pools[position]?.rz ?? [], position,
      );
    }
    if (fullFactors.includes('teamRzShare')) {
      const teamRzCfg = RZ_SHARE_KEYS[position];
      const lastQTeam = lastQRec?.team ?? null; // per-season-team; no current-team fallback (§3.0-C1)
      let teamDenom = null;
      if (lastQTeam == null) {
        fitCoverage.nullSeasonTeam++;
      } else {
        teamDenom = teamTotalsByYear[lastQSeason]?.totals?.[lastQTeam]?.[teamRzCfg.denomKey] ?? null;
      }
      const opp = lastQStats[teamRzCfg.oppKey] ?? null;
      sentinelHit.teamRzShare = teamDenom == null || teamDenom < TEAM_DENOM_MIN || opp == null || opp < teamRzCfg.minOpp;
      multipliers.teamRzShare = reconstructTeamRzShareFactor(
        { rzOwn: lastQStats[teamRzCfg.rzKey] ?? 0, opp, teamDenom }, pools[position]?.teamRz ?? [], position,
      );
    }

    // ── Step 4 (moved ahead of the D6a branches — compBlend needs it as an
    // input): anchorBasePPG. null is structurally unreachable once R1
    // disjunct 1 passed (qualifyingSeasons.length>0) — kept as an explicit
    // guard per §3.2 step 4, consistent with R1.
    const anchorBasePPG = reconstructBasePPG(qualifyingSeasons);
    if (anchorBasePPG == null) { drop('nullAnchorBasePPG'); continue; }

    // ── D6a — six additional branches, dispatched off D6_NEW_FACTORS (see the
    // deviation note on that constant: NOT FULL_FACTORS). Same per-row anchor
    // (lastQSeason for own counts, season Y for cohort pools) as the original
    // seven, per the established §3.2 convention. compBlend is computed LAST
    // (it is order-dependent on every other factor's value for this row).
    const lastQTeam = lastQRec?.team ?? null; // per-season-team; no current-team fallback (same §3.0-C1 residual)

    if (d6Factors.includes('age')) {
      const yearPop = getYearPopulation(Y);
      const birthdate = birthdateOf(pid);
      const age = ageAtSeason(birthdate, lastQSeason);
      if (birthdate == null) fitCoverage.age.birthdateMissing++;
      const curve = yearPop.curves[position] ?? [];
      if (curve.length === 0) fitCoverage.age.curveEmpty++;
      sentinelHit.age = age == null || curve.length === 0;
      multipliers.age = reconstructAgeFactor(age, curve, yearPop.positionPeakPPG[position]);
      if (!sentinelHit.age) fitCoverage.age.eligible++;
      bumpYear(fitCoverage.age, Y, !sentinelHit.age);
    }

    if (d6Factors.includes('depth')) {
      const depthOrder = resolveDepthOrder(lastQSeason, lastQTeam, position, pid);
      const recentStarterEvidence = (lastQRec?.gamesStarted ?? 0) >= 8;
      sentinelHit.depth = depthOrder == null;
      multipliers.depth = reconstructDepthFactor(depthOrder, recentStarterEvidence);
      if (depthOrder == null) fitCoverage.depth.nullOrder++; else fitCoverage.depth.resolved++;
      bumpYear(fitCoverage.depth, Y, depthOrder != null);
    }

    if (d6Factors.includes('teamOffense')) {
      const ranks = getTeamOffenseRanks(Y);
      const rowTeamY = row.team ?? null; // per-season-team at Y (already on the row)
      const teamRank = rowTeamY != null ? ranks[rowTeamY] ?? null : null;
      sentinelHit.teamOffense = teamRank == null;
      multipliers.teamOffense = reconstructTeamOffenseFactor(teamRank);
      if (teamRank == null) fitCoverage.teamOffense.missingRank++; else fitCoverage.teamOffense.resolved++;
      bumpYear(fitCoverage.teamOffense, Y, teamRank != null);
    }

    if (d6Factors.includes('qbQuality')) {
      // Never applies to QB rows (app gates position!=='QB') — d6Factors
      // already excludes 'qbQuality' for QB (D6_NEW_FACTORS.QB), so this
      // branch is unreachable for QB by construction.
      const { qb1Pid, quality } = resolveQb1(lastQSeason, lastQTeam);
      sentinelHit.qbQuality = quality == null;
      multipliers.qbQuality = reconstructQbQualityFactor(quality);
      if (qb1Pid == null) fitCoverage.qbQuality.noQb1++; else fitCoverage.qbQuality.resolved++;
      bumpYear(fitCoverage.qbQuality, Y, !sentinelHit.qbQuality);
    }

    if (d6Factors.includes('efficiency')) {
      const pools = getPools(Y);
      const effPools = pools[position]?.efficiency ?? {};
      const config = EFFICIENCY_METRICS[position];
      const hasAnyMetric = !!config && config.some(m => (lastQStats[m.oppKey] ?? 0) > 0);
      sentinelHit.efficiency = !hasAnyMetric;
      multipliers.efficiency = reconstructEfficiencyFactor(position, lastQStats, effPools);
      if (hasAnyMetric) fitCoverage.efficiency.resolved++; else fitCoverage.efficiency.noMetrics++;
      bumpYear(fitCoverage.efficiency, Y, hasAnyMetric);
    }

    if (d6Factors.includes('compBlend')) {
      const yearPop = getYearPopulation(Y);
      const peakPPG = yearPop.positionPeakPPG[position];
      const targetVector = buildCareerArcVector(ppgs, peakPPG);
      const candidates = (yearPop.compCandidatesByPosition[position] ?? []).filter(c => c.pid !== pid);
      const comps = findReconstructedCareerComps(targetVector, candidates);

      // pipelinePPG — the row's fully-reconstructed product of every OTHER
      // factor (age/depth/teamOffense outside the envelope; the original
      // seven plus qbQuality/efficiency inside it — ENVELOPE_FACTORS_D6_ADDITIONS).
      // This is compBlend's own input, so it must be computed from
      // `multipliers` as it stands BEFORE compBlend is assigned — order-
      // dependent, hence computed last.
      const envelopeMembers = new Set([...ENVELOPE_FACTORS, ...ENVELOPE_FACTORS_D6_ADDITIONS]);
      const priorFactors = [...fullFactors, ...d6Factors.filter(f => f !== 'compBlend')];
      let innerLogSum = 0, outerLogSum = 0;
      for (const factor of priorFactors) {
        const f = multipliers[factor];
        if (f == null) continue; // defensive — every prior factor is computed above
        const term = Math.log(f);
        if (envelopeMembers.has(factor)) innerLogSum += term; else outerLogSum += term;
      }
      const inner = Math.max(FIT_COMBINED_CLAMP[0], Math.min(FIT_COMBINED_CLAMP[1], Math.exp(innerLogSum)));
      const outerClamped = Math.max(FIT_OUTER_CLAMP[0], Math.min(FIT_OUTER_CLAMP[1], anchorBasePPG * Math.exp(outerLogSum) * inner));

      const cbResult = reconstructCompBlendFactor(comps, peakPPG, outerClamped);
      sentinelHit.compBlend = cbResult.compBlendWeight === 0;
      multipliers.compBlend = cbResult.factor;
      if (cbResult.compBlendWeight > 0) fitCoverage.compBlend.eligible++; else fitCoverage.compBlend.ineligible++;
      bumpYear(fitCoverage.compBlend, Y, cbResult.compBlendWeight > 0);
    }

    // ── Step 4a: positivity drop, before any log is taken (§1, §0.3 item 55) ─
    if (!(row.outcomePPG > 0)) { drop('nonPositiveOutcome'); continue; }
    if (!(anchorBasePPG > 0)) { drop('nonPositiveAnchor'); continue; }

    // ── Step 5: forward-mover neutralization (§3.6) — reuses classifyAttributionCohort ─
    const { forwardMover } = classifyAttributionCohort(pid, Y, teamsByYear);
    if (forwardMover) {
      let neutralizedSomething = false;
      if ('shareTrend' in multipliers) { multipliers.shareTrend = 1.0; sentinelHit.shareTrend = true; neutralizedSomething = true; }
      if ('teamRzShare' in multipliers) { multipliers.teamRzShare = 1.0; sentinelHit.teamRzShare = true; neutralizedSomething = true; }
      if (neutralizedSomething) fitCoverage.forwardMoverNeutralized++;
    }

    // ── Step 6: reporting-only diagnostics — sentinels are computed 1.0s, ──
    // never drops; the row stays in the fit regardless of any sentinelHit. ──
    // D6a's six new factors get the identical counters, keyed the same way.
    for (const factor of [...fullFactors, ...d6Factors]) {
      if (sentinelHit[factor]) bump(fitCoverage.sentinelCounts, position, factor);
      if (Math.abs(Math.log(multipliers[factor])) < FIT_FLAT_ONE_EPS) bump(fitCoverage.flatOneCounts, position, factor);
    }

    fitRows.push({
      ...row,
      qualifyingSeasons, lastQSeason, multipliers, anchorBasePPG,
      shareSeries: shareSeriesResult?.series ?? null,
      forwardMover, debutYMinus1: isDebutYMinus1,
    });
  }

  fitCoverage.nonPositiveOutcome = fitCoverage.droppedByReason.nonPositiveOutcome ?? 0;
  fitCoverage.nonPositiveAnchor = fitCoverage.droppedByReason.nonPositiveAnchor ?? 0;

  return { rows: fitRows, fitCoverage };
}

// ── §4 rule 0b — the identifiability guard. ONE call per position, over that
// position's full fit-row set, ranging over FIT_CANDIDATES (not F_p^full —
// held-in-arm factors are never candidates). Pure; α-independent,
// fold-independent — the returned fitFactors are FIXED for every downstream
// fit (§0.3 item 39). flatOneRate is a design-matrix-only statistic (never
// reads outcomePPG) — computing it globally leaks nothing about the target.
export function selectFitFactors(rows, position, { maxFlatOneRate = FIT_MAX_FLAT_ONE_RATE, eps = FIT_FLAT_ONE_EPS } = {}) {
  const candidates = FIT_CANDIDATES[position];
  const heldInArm = FULL_FACTORS[position].filter(f => !candidates.includes(f));
  const n = rows.length;

  const flatOneRates = {};
  const pinned = [];
  const fitFactors = [];

  for (const factor of candidates) {
    let flatCount = 0;
    for (const row of rows) {
      if (Math.abs(Math.log(row.multipliers[factor])) < eps) flatCount++;
    }
    const rate = n > 0 ? flatCount / n : 0;
    flatOneRates[factor] = rate;
    if (rate >= maxFlatOneRate) pinned.push(factor);
    else fitFactors.push(factor);
  }

  return { fitFactors, pinned, heldInArm, flatOneRates, n };
}

// ── §1 / §4 — one ridge fit over trainRows, for the fixed `fitFactors`
// support. Target y is the hand-stack log-residual over F_p^full (ALWAYS the
// full product set, independent of which subset is being estimated — pinned
// and held-in-arm terms are part of the hand baseline the residual measures
// against). Per-fold RMS scaling + graceful degenerate-scale neutralization
// (§0.3 items 47/57) — never throws; a neutralized factor is excluded from
// this fold's design matrix and fixed at w=1.
export function fitExponents(trainRows, position, { alpha, fitFactors }) {
  const fullFactors = FULL_FACTORS[position];
  const nTrain = trainRows.length;

  const yValues = trainRows.map(row => {
    let logResidual = Math.log(row.outcomePPG) - Math.log(row.anchorBasePPG);
    for (const factor of fullFactors) logResidual -= Math.log(row.multipliers[factor]);
    return logResidual;
  });
  const meanLogResidual = yValues.length > 0 ? yValues.reduce((a, b) => a + b, 0) / yValues.length : 0;

  const neutralized = [];
  const scales = {};
  const estimatedFactors = [];
  for (const factor of fitFactors) {
    const xVals = trainRows.map(row => Math.log(row.multipliers[factor]));
    const flatCount = xVals.filter(x => Math.abs(x) < FIT_FLAT_ONE_EPS).length;
    const flatRate = nTrain > 0 ? flatCount / nTrain : 0;

    if (flatRate >= FIT_MAX_FLAT_ONE_RATE) {
      neutralized.push({ factor, reason: 'flatOnTrain', flatRate, s: null });
      continue;
    }

    const s = Math.sqrt(xVals.reduce((sum, x) => sum + x * x, 0) / Math.max(nTrain, 1));
    if (!Number.isFinite(s) || s <= 0) {
      neutralized.push({ factor, reason: 'nonFiniteScale', flatRate, s });
      continue;
    }

    scales[factor] = s;
    estimatedFactors.push(factor);
  }

  const X = trainRows.map(row => estimatedFactors.map(factor => Math.log(row.multipliers[factor]) / scales[factor]));
  const { beta, singular } = solveOLS(X, yValues, { ridgeLambda: alpha * nTrain });

  const w = {};
  for (const factor of fullFactors) w[factor] = 1; // pinned / held-in-arm / neutralized default
  let maxAbsWMinus1 = 0;
  if (!singular && beta !== null) {
    estimatedFactors.forEach((factor, j) => {
      const wi = 1 + beta[j] / scales[factor];
      w[factor] = wi;
      maxAbsWMinus1 = Math.max(maxAbsWMinus1, Math.abs(wi - 1));
    });
  }

  return { w, scales, estimatedFactors, neutralized, maxAbsWMinus1, meanLogResidual, nTrain, singular };
}

function summarizeExponentFold(evalYear, predictions) {
  const n = predictions.length;
  const mae = n > 0 ? predictions.reduce((s, p) => s + Math.abs(p.predicted - p.actual), 0) / n : null;
  const sp = spearman(predictions.map(p => p.predicted), predictions.map(p => p.actual));
  return { evalYear, n, mae, spearman: sp };
}

function summarizeExponentPooled(predictions) {
  const n = predictions.length;
  const mae = n > 0 ? predictions.reduce((s, p) => s + Math.abs(p.predicted - p.actual), 0) / n : null;
  const years = [...new Set(predictions.map(p => p.evalYear))];
  const perYear = years
    .map(y => {
      const yp = predictions.filter(p => p.evalYear === y);
      return { n: yp.length, spearman: spearman(yp.map(p => p.predicted), yp.map(p => p.actual)) };
    })
    .filter(y => y.spearman != null && y.n > 0);
  const weight = perYear.reduce((s, y) => s + y.n, 0);
  const spearmanMean = weight > 0 ? perYear.reduce((s, y) => s + y.spearman * y.n, 0) / weight : null;
  return { n, mae, spearmanMean };
}

// ── §4 — CV scorer only, for one α over the fixed fitFactors support. Does
// NOT produce wFinal (gradeExponentFit owns the all-rows shipped refit,
// Overrides §1 / §0.3 item 59). Mirrors evaluateModel:487-489's fold-row
// filtering exactly.
export function evaluateExponentModel(rows, folds, position, { alpha, fitFactors }) {
  const fullFactors = FULL_FACTORS[position];
  const wByFold = [];
  let clampHitsFitted = 0;
  let clampHitsHand = 0;
  const fittedPerEvalYear = [];
  const handPerEvalYear = [];
  const fittedAll = [];
  const handAll = [];
  let logResidualWeightedSum = 0;
  let logResidualWeightTotal = 0;

  for (const { trainYears, evalYear } of folds) {
    const trainRows = rows.filter(r => trainYears.includes(r.predictorYear));
    const evalRows = rows.filter(r => r.predictorYear === evalYear);
    if (trainRows.length === 0 || evalRows.length === 0) {
      fittedPerEvalYear.push({ evalYear, n: 0, mae: null, spearman: null });
      handPerEvalYear.push({ evalYear, n: 0, mae: null, spearman: null });
      continue;
    }

    const fit = fitExponents(trainRows, position, { alpha, fitFactors });
    wByFold.push({
      evalYear, w: fit.w, scales: fit.scales,
      estimatedFactors: fit.estimatedFactors, neutralized: fit.neutralized,
      maxAbsWMinus1: fit.maxAbsWMinus1,
    });
    logResidualWeightedSum += fit.meanLogResidual * fit.nTrain;
    logResidualWeightTotal += fit.nTrain;

    const fittedPreds = [];
    const handPreds = [];
    for (const row of evalRows) {
      const fittedResult = predictWithExponents(row, fit.w, fullFactors, ENVELOPE_FACTORS);
      const handResult = predictWithExponents(row, {}, fullFactors, ENVELOPE_FACTORS);
      if (fittedResult.innerClamped) clampHitsFitted++;
      if (handResult.innerClamped) clampHitsHand++;
      fittedPreds.push({ pid: row.sleeperId, predicted: fittedResult.predicted, actual: row.outcomePPG, mover: row.mover });
      handPreds.push({ pid: row.sleeperId, predicted: handResult.predicted, actual: row.outcomePPG, mover: row.mover });
    }

    fittedPerEvalYear.push(summarizeExponentFold(evalYear, fittedPreds));
    handPerEvalYear.push(summarizeExponentFold(evalYear, handPreds));
    for (const p of fittedPreds) fittedAll.push({ ...p, evalYear });
    for (const p of handPreds) handAll.push({ ...p, evalYear });
  }

  const meanLogResidual = logResidualWeightTotal > 0 ? logResidualWeightedSum / logResidualWeightTotal : 0;

  return {
    fitted: { pooled: summarizeExponentPooled(fittedAll), perEvalYear: fittedPerEvalYear, predictions: fittedAll },
    hand: { pooled: summarizeExponentPooled(handAll), perEvalYear: handPerEvalYear, predictions: handAll },
    wByFold,
    clampHits: { fitted: clampHitsFitted, hand: clampHitsHand },
    meanLogResidual,
  };
}

// ── §4 — orchestrator. One selectFitFactors call, the α-sweep (CV scoring
// only), the shipped + sign-stability all-rows refits (the sole producer of
// wFinal / wByAlpha / shippedRefitNeutralized — Overrides §1), and the base
// verdict. Guard diagnostics (clampHits, foldNeutralization,
// maxAbsWMinus1ByFold) describe the SHIPPED model (α=0.5) only — NOT
// aggregated across the α-sweep (Overrides §2): aggregating would inflate
// neutralization counts (the trigger is α-independent, so every α would
// re-count the same folds) and mix six models' clamp incidence into one
// number that describes none of them.
export function gradeExponentFit(rows, folds, position, { alpha = FIT_ALPHA_DEFAULT, alphaSweep = FIT_ALPHA_SWEEP } = {}) {
  const posRows = rows.filter(r => r.position === position);
  const sel = selectFitFactors(posRows, position);

  const evalYearSet = new Set(folds.map(f => f.evalYear));
  const nEvalRows = posRows.filter(r => evalYearSet.has(r.predictorYear)).length;
  const nFitRows = posRows.length;
  const params = sel.fitFactors.length;
  const nToParam = params > 0 ? nEvalRows / params : Infinity;

  const baseReport = {
    position, nFitRows, nEvalRows,
    fitFactorsFull: FULL_FACTORS[position], fitFactorsEstimated: sel.fitFactors,
    pinnedFactors: sel.pinned, heldInArmFactors: sel.heldInArm,
    flatOneRates: sel.flatOneRates, params, nToParam,
  };

  // Rule 0 — deferral default. Short-circuits BEFORE any fit; decideFitVerdict
  // is never called (§0.3 item 49).
  if (nToParam < FIT_MIN_N_TO_PARAM) {
    return {
      ...baseReport,
      fitted: null, hand: null, deltas: null, wFinal: null, wByAlpha: null,
      sweep: [], meanLogResidual: null, foldNeutralization: {}, maxAbsWMinus1ByFold: [],
      clampHits: null, shippedRefitNeutralized: [], verdict: 'INSUFFICIENT-POWER',
    };
  }

  const alphas = [...new Set([FIT_ALPHA_DEFAULT, ...alphaSweep])];
  let shippedEval = null;
  const sweep = [];
  for (const a of alphas) {
    const evalResult = evaluateExponentModel(posRows, folds, position, { alpha: a, fitFactors: sel.fitFactors });
    if (a === FIT_ALPHA_DEFAULT) shippedEval = evalResult;
    const dMae = (evalResult.fitted.pooled.mae != null && evalResult.hand.pooled.mae != null)
      ? evalResult.fitted.pooled.mae - evalResult.hand.pooled.mae : null;
    const dSpearman = (evalResult.fitted.pooled.spearmanMean != null && evalResult.hand.pooled.spearmanMean != null)
      ? evalResult.fitted.pooled.spearmanMean - evalResult.hand.pooled.spearmanMean : null;
    sweep.push({ alpha: a, dMae, dSpearman });
  }

  const deltas = {
    maePooled: (shippedEval.fitted.pooled.mae != null && shippedEval.hand.pooled.mae != null)
      ? shippedEval.fitted.pooled.mae - shippedEval.hand.pooled.mae : null,
    maePerYear: shippedEval.fitted.perEvalYear.map((f, i) => {
      const h = shippedEval.hand.perEvalYear[i];
      return { evalYear: f.evalYear, dMae: (f.mae != null && h?.mae != null) ? f.mae - h.mae : null };
    }),
    spearmanMean: (shippedEval.fitted.pooled.spearmanMean != null && shippedEval.hand.pooled.spearmanMean != null)
      ? shippedEval.fitted.pooled.spearmanMean - shippedEval.hand.pooled.spearmanMean : null,
  };

  // Overrides §1 — gradeExponentFit is the ONE producer of wFinal, wByAlpha,
  // and shippedRefitNeutralized: an all-rows refit at each α in the
  // sign-stability set {0.5, 2}. wFinal is exactly the α=0.5 all-rows refit.
  const shippedRefit = fitExponents(posRows, position, { alpha: FIT_ALPHA_DEFAULT, fitFactors: sel.fitFactors });
  const signRefit2 = fitExponents(posRows, position, { alpha: 2, fitFactors: sel.fitFactors });
  const wFinal = shippedRefit.w;
  const wByAlpha = { 0.5: shippedRefit.w, 2: signRefit2.w };
  const shippedRefitNeutralized = shippedRefit.neutralized; // expect [] — non-empty is a hard stop-and-investigate, not a degradation

  const foldNeutralization = {};
  for (const fold of shippedEval.wByFold) {
    for (const { factor, reason } of fold.neutralized) {
      if (!foldNeutralization[factor]) foldNeutralization[factor] = { folds: 0, reasons: { flatOnTrain: 0, nonFiniteScale: 0 } };
      foldNeutralization[factor].folds++;
      foldNeutralization[factor].reasons[reason]++;
    }
  }
  const maxAbsWMinus1ByFold = shippedEval.wByFold.map(f => f.maxAbsWMinus1);

  const handMae = shippedEval.hand.pooled.mae;
  const verdict = decideFitVerdict({ deltas, sweep, handMae, wByAlpha }, position);

  return {
    ...baseReport,
    fitted: shippedEval.fitted, hand: shippedEval.hand,
    deltas, wFinal, wByAlpha, sweep,
    meanLogResidual: shippedRefit.meanLogResidual,
    foldNeutralization, maxAbsWMinus1ByFold,
    clampHits: shippedEval.clampHits,
    shippedRefitNeutralized,
    verdict,
  };
}

// ── §4 — BASE label only (rules 1-4). Never sees an under-powered position
// (rule 0 short-circuits inside gradeExponentFit, before this is called) and
// never sees the sensitivity re-run (runFit owns that override, §6.3) — so
// nToParam and a sensitivity label are both absent from this signature by
// design (§0.3 item 49). The thin-position CLEARS guard checks sign(w−1)
// agreement over every key in wByAlpha[0.5] (= F_p^full): pinned/held-in-arm
// entries are exactly 1 in both α arms (sign 0 === 0), so they can never
// cause a false disagreement — checking all of F_p^full and checking only the
// estimated subset give the identical result.
export function decideFitVerdict({ deltas, sweep, handMae, wByAlpha }, _position) {
  const { maePooled, maePerYear, spearmanMean } = deltas;
  if (maePooled == null) return 'UNSTABLE';
  if (maePooled > 0) return 'DEGRADES';

  const yearsImproved = maePerYear.filter(y => y.dMae != null && y.dMae < 0).length;
  const sweepStable = [0.25, 0.5, 1].every(a => {
    const entry = sweep.find(s => s.alpha === a);
    return entry && entry.dMae != null && entry.dMae < 0;
  });

  const wLow = wByAlpha[0.5] ?? {};
  const wHigh = wByAlpha[2] ?? {};
  const signAgrees = Object.keys(wLow).every(factor => Math.sign(wLow[factor] - 1) === Math.sign((wHigh[factor] ?? 1) - 1));

  const clears = maePooled < 0 && spearmanMean != null && spearmanMean >= 0 &&
    yearsImproved >= 2 && sweepStable && signAgrees;
  if (clears) return 'CLEARS';

  if (handMae != null && handMae > 0 && Math.abs(maePooled) / handMae < 0.005) return 'NO-GAIN';

  return 'UNSTABLE';
}
