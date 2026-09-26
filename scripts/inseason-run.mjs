/**
 * scripts/inseason-run.mjs — in-season evidence k-fit adapter (`bin/backtest.mjs --inseason`).
 * Task file: .claude/tasks/in-season-evidence-2a-backtest.md. Offline analysis only.
 *
 * Wires file loading (injectable, memoised, behind the in-progress guard), the gamelogs
 * reconciliation stop, the per-season reconstruction of the pre-season prior (veteran path via
 * attachFactorMultipliers; rookie path via lib/rookieMirror.mjs's SHIPPED projection), per-checkpoint
 * evidence, and the eight analyses. The pure fitting core is lib/inSeasonEvidence.mjs.
 *
 * Reaches lib/rookieMirror.mjs on purpose — outside bin/panel.mjs's closure (T-RM1). It fits no rookie
 * constant and never calls the fit path's rookie-panel assembler, so the CR-15 re-fit trap does not apply.
 *
 * Public exports:
 *   INSEASON_LOAD
 *   runReconciliation(load, opts)   → reconciliation report (throws ReconciliationStop below 0.99)
 *   runArmS({ load })               → study-reproduction ROS points k by position (no factor reconstruction)
 *   enumerateCandidates(...)        → per-season candidates with route + arm
 *   runInSeason({ load })           → result object (meta, reconciliation, coverage, excluded, q1…q8, constants)
 *   buildInSeasonVerdictMarkdown(result) → string
 *   writeInSeasonArtifacts({ result, verdictMd }) → { panelPath, constantsPath, verdictPath }
 */

import fs from 'fs';
import { readJson, repoPath } from '../lib/io.mjs';
import { isTeamAggregateId } from '../lib/backtest.mjs';
import { DEFAULT_LOAD, loadFactorInputs, buildFactorContext } from './panel-run.mjs';
import {
  attachFactorMultipliers, predictFullPipeline, rookiePathStateAt, resolvePosition,
  PANEL_POSITIONS, computeSeasonPoints, HISTORY_FLOOR,
} from '../lib/panel.mjs';
import { CURRENT_REGRESSION_MODEL } from '../lib/projectionFactors.mjs';
import { reconstructShippedRookieProjection } from '../lib/rookieMirror.mjs';
import {
  IN_SEASON_DEFAULTS, STUDY_K, PHASE1_K, opportunities, reconcileOpportunities, buildCheckpoints,
  depthOrderIndex, confidenceTier, median, blend, suffStats, fitK, pinK, analyzeKCell, loso, bySeason,
  losoGroupedK, pairedDelta, compareLabel, errorSummary, fitCK, bootstrapKDiff, bootstrapPairedMean,
  fitVE, predictVE, fitG, predictG, classifyArm, sd, topMixGap, spearman, cellVerdict, mulberry32,
} from '../lib/inSeasonEvidence.mjs';

const POSITIONS = PANEL_POSITIONS;

export const INSEASON_LOAD = {
  ...DEFAULT_LOAD,
  loadGameLogs: (year) => readJson(`nflverse/gamelogs/${year}.json`),
  loadSchedule: (year) => readJson(`nflverse/schedule/${year}.json`),
  loadManifest: () => readJson('manifest.json'),
};

export class ReconciliationStop extends Error {
  constructor(message, reconciliation) { super(message); this.name = 'ReconciliationStop'; this.reconciliation = reconciliation; }
}

// ─── Loader plumbing: memoise, and refuse in-progress / above-ceiling seasons (§4.1 step 0) ────────────

const GUARDED = { loadSeasonTotals: (y) => `nfl/season-totals/${y}.json`, loadGameLogs: (y) => `nflverse/gamelogs/${y}.json` };

export function guardLoad(load, { maxLoadSeason = IN_SEASON_DEFAULTS.maxLoadSeason } = {}) {
  const manifest = typeof load.loadManifest === 'function' ? load.loadManifest() : undefined;
  if (manifest === null) throw new Error('[inseason] manifest.json not found — cannot verify inProgress flags');
  const cache = new Map();
  const wrapped = { ...load };
  for (const [name, fn] of Object.entries(load)) {
    if (typeof fn !== 'function' || name === 'loadManifest' || name === 'loadRookiePinArtifact') continue;
    wrapped[name] = (arg) => {
      const key = `${name}:${arg}`;
      if (cache.has(key)) return cache.get(key);
      if (GUARDED[name] && arg != null) {
        if (arg > maxLoadSeason) throw new Error(`[inseason] refusing to read ${name}(${arg}): above maxLoadSeason ${maxLoadSeason}`);
        const file = GUARDED[name](arg);
        if (manifest?.files?.[file]?.inProgress === true) {
          throw new Error(`[inseason] ${file} is inProgress: true — a live season must never be an outcome or evidence source here (CR-21)`);
        }
      }
      const v = fn(arg);
      cache.set(key, v);
      return v;
    };
  }
  return wrapped;
}

function crosswalkFrom(playerIds) {
  const crosswalk = {};
  for (const entry of Object.values(playerIds?.ids ?? {})) {
    if (entry?.sleeperId && entry?.position) crosswalk[entry.sleeperId] = entry.position;
  }
  return crosswalk;
}

// ─── Reconciliation (§3.2) ────────────────────────────────────────────────────

export function runReconciliation(load, { fromYear = 2012, toYear = IN_SEASON_DEFAULTS.maxLoadSeason, minRate = 0.99 } = {}) {
  const crosswalk = crosswalkFrom(typeof load.loadPlayerIds === 'function' ? load.loadPlayerIds() : null);
  let population = 0, pass = 0;
  const failures = [];
  const absentFromGamelogs = {};
  const unmapped = {};
  for (let y = fromYear; y <= toYear; y++) {
    const st = load.loadSeasonTotals(y);
    if (!st) continue;
    const gl = load.loadGameLogs(y);
    const adv = typeof load.loadAdvstats === 'function' ? load.loadAdvstats(y) : null;
    const roster = typeof load.loadRoster === 'function' ? load.loadRoster(y) : null;
    unmapped[y] = gl?.unmapped ?? null;
    absentFromGamelogs[y] = 0;
    for (const [pid, rec] of Object.entries(st)) {
      if (isTeamAggregateId(pid)) continue;
      const position = resolvePosition(pid, adv, roster, crosswalk);
      if (!POSITIONS.includes(position)) continue;
      if ((rec.gamesPlayed ?? 0) < 4) continue;
      const glp = gl?.players?.[pid];
      if (!glp) { absentFromGamelogs[y]++; continue; }
      const r = reconcileOpportunities(glp, rec, position);
      population++;
      if (r.ok) pass++;
      else if (failures.length < 25) failures.push({ season: y, sleeperId: pid, position, gamelogs: r.sum, seasonTotals: r.total, diff: r.diff });
    }
  }
  const rate = population > 0 ? pass / population : 0;
  const result = {
    population, pass, rate, minRate, ok: rate >= minRate, failures, absentFromGamelogs, unmapped,
    tolerance: 'max(2, 3%) of season-totals opportunities, REG games only',
  };
  if (!result.ok) {
    throw new ReconciliationStop(
      `gamelogs↔season-totals opportunity reconciliation FAILED: ${pass}/${population} = ${rate.toFixed(4)} < ${minRate}`, result);
  }
  return result;
}

// ─── Arm S — the study reproduction (§3.3) ────────────────────────────────────

/** Rows for arm S: S-1 gp >= 8, crosswalk position only, first n played games (n = 1..8) vs the rest (>= 4 left). */
export function armSRows({ load = INSEASON_LOAD, from = 2013, to = 2025 } = {}) {
  const crosswalk = crosswalkFrom(load.loadPlayerIds());
  const rows = [];
  for (let S = from; S <= to; S++) {
    const tot = load.loadSeasonTotals(S);
    const prev = load.loadSeasonTotals(S - 1);
    if (!tot || !prev) continue;
    for (const [pid, rec] of Object.entries(tot)) {
      if (isTeamAggregateId(pid)) continue;
      const position = crosswalk[pid];
      if (!POSITIONS.includes(position)) continue;
      const p = prev[pid];
      const pgp = p?.gamesPlayed ?? 0;
      if (pgp < IN_SEASON_DEFAULTS.minPriorGames || !Number.isFinite(p?.fantasyPoints)) continue;
      const prior = p.fantasyPoints / pgp;
      const weeks = Object.keys(rec.weeklyPoints ?? {}).map(Number).sort((a, b) => a - b);
      const pts = weeks.map(w => rec.weeklyPoints[w]);
      for (let n = 1; n <= 8; n++) {
        if (pts.length < n + 4) break;
        const obs = pts.slice(0, n).reduce((a, v) => a + v, 0) / n;
        const rest = pts.slice(n);
        rows.push({ sleeperId: pid, S, W: n, n, position, prior, obs, outcome: rest.reduce((a, v) => a + v, 0) / rest.length });
      }
    }
  }
  return rows;
}

const ARM_S_SPEC = { prior: 'prior', obs: 'obs', outcome: 'outcome' };

/** ROS points k by position under arm S's exact definition — the regression pin (§7 test 3). No bootstrap. */
export function runArmS({ load = INSEASON_LOAD } = {}) {
  const rows = armSRows({ load });
  const byPosition = {};
  for (const position of POSITIONS) {
    const rs = rows.filter(r => r.position === position);
    const f = fitK(suffStats(rs, ARM_S_SPEC));
    byPosition[position] = { k: f?.k ?? null, rows: rs.length, players: new Set(rs.map(r => r.sleeperId)).size };
  }
  return { byPosition, rows: rows.length };
}

// ─── Candidates and priors (§4.1) ─────────────────────────────────────────────

/** Every non-TEAM_ pid in season-totals S with gp >= 1 and a panel position, routed and armed. */
export function enumerateCandidates({ S, totalsByYear, ppgByYear, positionOf }) {
  const out = [];
  for (const [pid, rec] of Object.entries(totalsByYear[S] ?? {})) {
    if (isTeamAggregateId(pid)) continue;
    if ((rec?.gamesPlayed ?? 0) < 1) continue;
    const position = positionOf(pid);
    if (!POSITIONS.includes(position)) continue;
    const state = rookiePathStateAt(pid, S - 1, { totalsByYear, ppgByYear });
    const sm1 = computeSeasonPoints(pid, ppgByYear[S - 1]);
    let earlierAppearance = false;
    for (let s = HISTORY_FLOOR; s <= S - 1; s++) if (totalsByYear[s]?.[pid] != null) { earlierAppearance = true; break; }
    const route = state.isRookiePath ? 'rookie' : 'veteran';
    out.push({
      pid, position, route, sm1Games: sm1.gamesPlayed, sm1PPG: sm1.ppg, inR: sm1.gamesPlayed >= IN_SEASON_DEFAULTS.minPriorGames,
      arm: classifyArm({ route, sm1Games: sm1.gamesPlayed, earlierAppearance }),
    });
  }
  return out;
}

/** The SHIPPED rookie projection (CR-15 mapping note: no entry → unknown, undrafted → undrafted, else matched). */
export function rookiePriorFor(pid, position, S, playerIds) {
  const b = playerIds?.bySleeper?.[pid];
  const draftCapitalStatus = !b ? 'unknown' : b.undrafted === true ? 'undrafted' : 'matched';
  const birthYear = typeof b?.birthdate === 'string' ? parseInt(b.birthdate.slice(0, 4), 10) : null;
  const ageAtDraft = (b?.draftYear != null && birthYear != null) ? b.draftYear - birthYear : null;
  const yearsExp = (b?.draftYear != null && b.draftYear > 0) ? S - b.draftYear : null;
  return reconstructShippedRookieProjection({
    position, ageAtDraft, draftRound: b?.draftRound ?? null, draftPick: b?.draftPick ?? null, draftCapitalStatus, yearsExp,
  }).projectedPPG;
}

function oppPerGame(rec, position) {
  const gp = rec?.gamesPlayed ?? 0;
  if (gp <= 0) return null;
  const s = rec.stats ?? {};
  return ((position === 'QB' ? (s.pass_att ?? 0) : (s.rec_tgt ?? 0)) + (s.rush_att ?? 0)) / gp;
}

// gamelogs index per season: team target sums per (team, week) in gamelogs' own team domain (CR-16).
function makeGamelogsIndex(load) {
  const cache = new Map();
  return (year) => {
    if (cache.has(year)) return cache.get(year);
    const gl = load.loadGameLogs(year);
    let idx = null;
    if (gl?.players) {
      const teamTargets = new Map();
      for (const p of Object.values(gl.players)) {
        for (const g of p.games ?? []) {
          if (g.seasonType !== 'REG') continue;
          const key = `${g.team}|${g.week}`;
          teamTargets.set(key, (teamTargets.get(key) ?? 0) + (g.targets ?? 0));
        }
      }
      idx = { players: gl.players, teamTargets, unmapped: gl.unmapped ?? 0 };
    }
    cache.set(year, idx);
    return idx;
  };
}

function makeScheduleIndex(load) {
  const cache = new Map();
  return (year) => {
    if (cache.has(year)) return cache.get(year);
    const sc = load.loadSchedule(year);
    let idx = null;
    if (sc?.games) {
      idx = new Map();
      for (const g of sc.games) {
        if (g.gameType !== 'REG') continue;
        for (const t of [g.homeTeam, g.awayTeam]) {
          if (!idx.has(t)) idx.set(t, new Set());
          idx.get(t).add(g.week);
        }
      }
    }
    cache.set(year, idx);
    return idx;
  };
}

/** Whole-season target share from gamelogs (own REG games / team targets in the same (team, week)). */
function seasonShare(gIdx, pid) {
  const games = (gIdx?.players?.[pid]?.games ?? []).filter(g => g.seasonType === 'REG');
  if (!games.length) return { games: 0, share: null };
  let tgt = 0, team = 0;
  for (const g of games) { tgt += g.targets ?? 0; team += gIdx.teamTargets.get(`${g.team}|${g.week}`) ?? 0; }
  return { games: games.length, share: team > 0 ? tgt / team : null };
}

// ─── Per-season assembly ──────────────────────────────────────────────────────

export function assembleSeason(S, env) {
  const { load, defaults, gamelogsIdx, scheduleIdx, playerIds } = env;
  const inputs = loadFactorInputs({
    fromYear: S - 1, toYear: S - 1, basis: 'half_ppr', withFactorMultipliers: true, historyFloor: HISTORY_FLOOR, load,
  });
  const totalsByYear = {}, ppgByYear = {};
  for (const y of inputs.years) { totalsByYear[y] = inputs.inputsByYear[y].seasonTotals; ppgByYear[y] = inputs.inputsByYear[y].outcomes; }
  const advY = inputs.inputsByYear[S - 1].advstats, rosterY = inputs.inputsByYear[S - 1].roster;
  const positionOf = (pid) => resolvePosition(pid, advY, rosterY, inputs.crosswalk);
  const candidates = enumerateCandidates({ S, totalsByYear, ppgByYear, positionOf });

  // Veteran priors: frozen (S week 1) depth chart; live depth per distinct order for arm L.
  const ctx = buildFactorContext(inputs, {
    attribution: 'per-season-team', fromYear: S - 1, toYear: S, regressionModel: CURRENT_REGRESSION_MODEL, load,
  });
  const depthFile = load.loadDepth(S);
  const depthWeeks = Object.keys(depthFile?.weeks ?? {}).map(Number);
  const lastWeek = depthWeeks.length ? Math.max(...depthWeeks) : 1;
  const idxByWeek = new Map();
  const depthIndex = (wk) => { if (!idxByWeek.has(wk)) idxByWeek.set(wk, depthOrderIndex(depthFile, wk)); return idxByWeek.get(wk); };
  const week1 = depthIndex(1);

  const vets = candidates.filter(c => c.route === 'veteran');
  const vetRows = vets.map(c => ({ sleeperId: c.pid, position: c.position, predictorYear: S - 1, outcomePPG: null }));
  const attach = (rows, depthOrderOf) => attachFactorMultipliers(rows, { ...ctx, requirePositiveOutcome: false, depthOrderOf });
  const frozen = attach(vetRows, (pid, position) => week1.get(`${position}|${pid}`) ?? null);
  const drifted = Object.keys(frozen.fitCoverage.droppedByReason).filter(k => k.startsWith('rookiePath'));
  if (drifted.length) {
    throw new Error(`[inseason] rookiePath* drop on a veteran-routed row (S=${S}: ${drifted.join(', ')}) — rookiePathStateAt and attachFactorMultipliers have drifted`);
  }
  const frozenBy = new Map(frozen.rows.map(r => [r.sleeperId, r]));

  // Arm L: only orders that differ from week 1 need a re-run; the prior depends on the order alone.
  const armPPids = vets.filter(c => c.arm === 'P' && frozenBy.has(c.pid)).map(c => c.pid);
  const liveOrder = (pid, position, W) => depthIndex(Math.min(W + 1, lastWeek)).get(`${position}|${pid}`) ?? null;
  const posOf = new Map(vets.map(c => [c.pid, c.position]));
  const need = new Map();   // order (or 'null') → Set<pid>
  for (const pid of armPPids) {
    const w1 = week1.get(`${posOf.get(pid)}|${pid}`) ?? null;
    for (const W of defaults.checkpoints) {
      const live = liveOrder(pid, posOf.get(pid), W);
      if (live !== w1) { const k = live == null ? 'null' : String(live); if (!need.has(k)) need.set(k, new Set()); need.get(k).add(pid); }
    }
  }
  const livePriorBy = new Map();   // `${pid}|${orderKey}` → predicted
  for (const [orderKey, pids] of need) {
    const order = orderKey === 'null' ? null : Number(orderKey);
    const res = attach(vetRows.filter(r => pids.has(r.sleeperId)), () => order);
    for (const r of res.rows) livePriorBy.set(`${r.sleeperId}|${orderKey}`, predictFullPipeline(r).predicted);
  }

  const gIdx = gamelogsIdx(S);
  const sched = scheduleIdx(S);
  const totalsS = totalsByYear[S];
  const totalsM1 = totalsByYear[S - 1];
  const nextTotals = S <= defaults.nextTo ? load.loadSeasonTotals(S + 1) : null;
  const nextIdx = S <= defaults.nextTo ? gamelogsIdx(S + 1) : null;
  const plus2Totals = S <= defaults.plus2To ? load.loadSeasonTotals(S + 2) : null;

  // Band medians: S-1 opp/g among S-1 players with gp >= 8 (Phase 1's definition), per position.
  const bandVals = { QB: [], RB: [], WR: [], TE: [] };
  for (const [pid, rec] of Object.entries(totalsM1 ?? {})) {
    if (isTeamAggregateId(pid) || (rec.gamesPlayed ?? 0) < defaults.minPriorGames) continue;
    const pos = positionOf(pid);
    if (!POSITIONS.includes(pos)) continue;
    const v = oppPerGame(rec, pos);
    if (v != null) bandVals[pos].push(v);
  }
  const bandMedian = Object.fromEntries(POSITIONS.map(p => [p, median(bandVals[p])]));

  const rows = [], playerSeasons = [], noPrior = [];
  let movers = 0;
  for (const c of candidates) {
    const { pid, position } = c;
    const rec = totalsS[pid];
    let pointsPrior = null, confidence = null;
    if (c.route === 'rookie') pointsPrior = rookiePriorFor(pid, position, S, playerIds);
    else {
      const fr = frozenBy.get(pid);
      if (fr) { pointsPrior = predictFullPipeline(fr).predicted; confidence = confidenceTier(fr.qualifyingSeasons.length); }
    }

    // Evidence for season S.
    const glp = gIdx?.players?.[pid];
    const regGames = (glp?.games ?? []).filter(g => g.seasonType === 'REG');
    const oppByWeek = {}, targetsByWeek = {}, teamTargetsByWeek = {};
    const teamsSeen = new Set();
    for (const g of regGames) {
      oppByWeek[g.week] = opportunities(g, position);
      targetsByWeek[g.week] = g.targets ?? 0;
      teamTargetsByWeek[g.week] = gIdx.teamTargets.get(`${g.team}|${g.week}`) ?? 0;
      teamsSeen.add(g.team);
    }
    const mover = teamsSeen.size > 1;
    if (mover) movers++;
    const teamGameWeeks = rec.team && sched ? (sched.get(rec.team) ?? null) : null;
    const cps = buildCheckpoints({
      weeklyPoints: rec.weeklyPoints, teamGameWeeks, oppByWeek, targetsByWeek, teamTargetsByWeek,
      checkpoints: defaults.checkpoints, mover,
    });

    // Opportunity / share baselines (season-totals S-1 for opp; gamelogs S-1 for share).
    let oppPrior = null, oppPriorB = null, sharePrior = null;
    const recM1 = totalsM1?.[pid];
    const a = oppPerGame(recM1, position);
    if ((recM1?.gamesPlayed ?? 0) >= defaults.minBaselineGames && a != null && a >= defaults.minBaselineOpp) oppPrior = a;
    for (let y = S - 1; y >= S - defaults.lookbackSeasons; y--) {
      const r = totalsByYear[y]?.[pid];
      if ((r?.gamesPlayed ?? 0) >= defaults.minBaselineGames) {
        const b = oppPerGame(r, position);
        if (b != null && b >= defaults.minBaselineOpp) oppPriorB = b;
        break;
      }
    }
    const shareM1 = (position === 'WR' || position === 'TE') && oppPrior != null ? seasonShare(gamelogsIdx(S - 1), pid) : { games: 0, share: null };
    if (shareM1.games >= defaults.minBaselineGames && shareM1.share != null) sharePrior = shareM1.share;
    const band = position !== 'QB' && a != null && bandMedian[position] != null ? (a < bandMedian[position] ? 'weak' : 'strong') : null;

    // Next-season / S+2 outcomes.
    let nextPPG = null, nextOpp = null, nextShare = null, nextPPG2 = null;
    const nrec = nextTotals?.[pid];
    if ((nrec?.gamesPlayed ?? 0) >= defaults.nextMinGames && Number.isFinite(nrec.fantasyPoints)) {
      nextPPG = nrec.fantasyPoints / nrec.gamesPlayed;
      nextOpp = oppPerGame(nrec, position);
      if (position === 'WR' || position === 'TE') nextShare = seasonShare(nextIdx, pid).share;
    }
    const p2rec = plus2Totals?.[pid];
    if ((p2rec?.gamesPlayed ?? 0) >= defaults.nextMinGames && Number.isFinite(p2rec.fantasyPoints)) nextPPG2 = p2rec.fantasyPoints / p2rec.gamesPlayed;

    const w1Order = c.arm === 'P' ? (week1.get(`${position}|${pid}`) ?? null) : null;
    playerSeasons.push({
      sleeperId: pid, S, position, arm: c.arm, inR: c.inR, hasPrior: pointsPrior != null, mover, inGamelogs: !!glp,
      anyGamesThroughW12: cps[cps.length - 1].n > 0, oppPrior, oppPriorB, sm1Games: c.sm1Games, pointsPrior,
    });
    if (pointsPrior == null && c.arm !== 'P' && c.route === 'rookie') { /* rookie prior always resolves */ }
    if (pointsPrior == null) noPrior.push({ sleeperId: pid, S, position, arm: c.arm });

    for (const cp of cps) {
      if (cp.n === 0) continue;
      const rosOk = cp.rosGames >= defaults.minRosGames;
      let pointsPriorLive = pointsPrior, orderLive = w1Order;
      if (c.arm === 'P' && pointsPrior != null) {
        orderLive = liveOrder(pid, position, cp.W);
        if (orderLive !== w1Order) {
          const key = `${pid}|${orderLive == null ? 'null' : orderLive}`;
          pointsPriorLive = livePriorBy.get(key) ?? null;
        }
      }
      rows.push({
        sleeperId: pid, S, W: cp.W, n: cp.n, position, arm: c.arm, inR: c.inR, sm1Games: c.sm1Games,
        pointsPrior, pointsPriorLive, orderWeek1: w1Order, orderLive, rawPrior: c.inR ? c.sm1PPG : null,
        confidence, band, oppPrior, oppPriorB, sharePrior, hasBaseline: oppPrior != null,
        obsPPG: cp.obsPPG, obsOpp: cp.obsOpp, O: cp.O, obsShare: cp.obsShare,
        missedInWindow: cp.missedInWindow, oppMissingWeeks: cp.oppMissingWeeks, mover,
        rosGames: cp.rosGames, lastPlayedWeek: cp.lastPlayedWeek,
        rosPPG: rosOk ? cp.rosPPG : null, rosOpp: rosOk ? cp.rosOpp : null, rosShare: rosOk ? cp.rosShare : null,
        nextPPG, nextOpp, nextShare, nextPPG2, hasNextSeason: S <= defaults.nextTo,
      });
    }
  }
  return { rows, playerSeasons, noPrior, movers, dropsByReason: frozen.fitCoverage.droppedByReason, bandMedian, candidates: candidates.length };
}

export { makeGamelogsIndex, makeScheduleIndex };

// ─── Analysis plumbing ────────────────────────────────────────────────────────

const SPEC = {
  pointsRos:  { prior: 'pointsPrior', obs: 'obsPPG',   outcome: 'rosPPG' },
  pointsNext: { prior: 'pointsPrior', obs: 'obsPPG',   outcome: 'nextPPG' },
  rawRos:     { prior: 'rawPrior',    obs: 'obsPPG',   outcome: 'rosPPG' },
  rawNext:    { prior: 'rawPrior',    obs: 'obsPPG',   outcome: 'nextPPG' },
  oppRos:     { prior: 'oppPrior',    obs: 'obsOpp',   outcome: 'rosOpp' },
  oppNext:    { prior: 'oppPrior',    obs: 'obsOpp',   outcome: 'nextOpp' },
  shareRos:   { prior: 'sharePrior',  obs: 'obsShare', outcome: 'rosShare' },
  shareNext:  { prior: 'sharePrior',  obs: 'obsShare', outcome: 'nextShare' },
};
const GRID_POSITIONS = [...POSITIONS, 'ALL'];
const r1 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10);
const r4 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 1e4) / 1e4);
const mean = (xs) => (xs.length ? xs.reduce((a, v) => a + v, 0) / xs.length : null);

const studyFor = (table, pos) => {
  if (!table) return null;
  if (pos === 'ALL') return (r) => table[r.position];
  return table[pos] ?? null;
};

/** JSON-safe view of an analyzeKCell result. */
function slimCell(a) {
  if (!a) return null;
  const out = { rows: a.rows, players: a.players, verdict: a.verdict };
  if (a.verdict === 'INSUFFICIENT') return out;
  Object.assign(out, {
    kFit: a.kFit.k, kTenths: a.kFit.kTenths, boundary: a.kFit.boundary, kPin: a.kPin, ci95: a.ci95 ? a.ci95.map(r1) : null,
    foldKRange: a.foldKRange, folds: a.folds.map(f => ({ S: f.S, k: f.k, n: f.n, mae: r4(f.mae), rmse: r4(f.rmse) })),
    error: Object.fromEntries(Object.entries(a.error).map(([k, v]) => [k, { n: v.n, mae: r4(v.mae), rmse: r4(v.rmse) }])),
  });
  if (a.studyK !== undefined) out.studyK = a.studyK;
  if (a.delta) out.delta = { mean: r4(a.delta.mean), ci95: a.delta.ci95.map(r4), label: a.delta.label };
  return out;
}

/** Q1 pin rule (§4.5). `studyKNum` = the study/Phase 1 value this cell is compared to (number) or null. */
export function pinDecision(a, studyKNum = null) {
  if (!a || a.verdict === 'INSUFFICIENT') return { k: null, kFit: null, ci95: null, rows: a?.rows ?? 0, players: a?.players ?? 0, basis: 'insufficient' };
  const base = { kFit: a.kFit.k, ci95: a.ci95 ? a.ci95.map(r1) : null, rows: a.rows, players: a.players };
  if (a.kFit.boundary === 'high') return { ...base, k: null, basis: 'prior-only' };
  if (a.kFit.boundary === 'low') return { ...base, k: 0, basis: 'observed-only' };
  if (a.delta?.label === 'WORSE' && typeof studyKNum === 'number') return { ...base, k: studyKNum, basis: 'study' };
  return { ...base, k: a.kPin, basis: 'fitted' };
}

const cellsByName = new Map();  // per-run store of full analyses, keyed by `${NAME}|${cell}` (fixture source)

function runCell(store, name, rows, spec, opts = {}) {
  const a = analyzeKCell(rows, spec, { studyK: opts.studyK ?? null, ci: opts.ci ?? true });
  store.set(name, a);
  return a;
}

export function fixtureFrom(a) {
  if (!a || a.verdict === 'INSUFFICIENT') return null;
  const out = {};
  for (const [S, stats] of [...a.statsBySeason].sort((x, y) => x[0] - y[0])) {
    out[S] = {};
    for (const [n, st] of [...stats].sort((x, y) => x[0] - y[0])) out[S][n] = [st.count, r4(st.Saa), r4(st.Sab), r4(st.Sbb)];
  }
  return out;
}

// ─── The analyses ─────────────────────────────────────────────────────────────

function analyze(rows, playerSeasons, defaults, armSRowsList) {
  const D = defaults;
  const store = new Map();
  const isFin = Number.isFinite;

  const popP = rows.filter(r => r.arm === 'P');
  const popR = rows.filter(r => r.inR);
  const popOpp = rows.filter(r => r.hasBaseline);
  const popShare = popOpp.filter(r => r.position === 'WR' || r.position === 'TE');
  const inPos = (rs, pos) => (pos === 'ALL' ? rs : rs.filter(r => r.position === pos));

  // ── Q1 ──
  const q1 = { cells: {}, armS: {}, diagnostics: {} };
  const defs = [
    { id: 'pointsP_ros',  pop: popP,   spec: SPEC.pointsRos,  study: STUDY_K.ros.points,  positions: GRID_POSITIONS },
    { id: 'pointsP_next', pop: popP,   spec: SPEC.pointsNext, study: STUDY_K.next.points, positions: GRID_POSITIONS },
    { id: 'pointsR_ros',  pop: popR,   spec: SPEC.rawRos,     study: STUDY_K.ros.points,  positions: GRID_POSITIONS },
    { id: 'pointsR_next', pop: popR,   spec: SPEC.rawNext,    study: STUDY_K.next.points, positions: GRID_POSITIONS },
    { id: 'opp_ros',      pop: popOpp, spec: SPEC.oppRos,     study: STUDY_K.ros.opp,     positions: GRID_POSITIONS },
    { id: 'opp_next',     pop: popOpp, spec: SPEC.oppNext,    study: STUDY_K.next.opp,    positions: GRID_POSITIONS },
    { id: 'share_ros',    pop: popShare, spec: SPEC.shareRos, study: STUDY_K.ros.share,   positions: ['WR', 'TE', 'ALL'] },
    { id: 'share_next',   pop: popShare, spec: SPEC.shareNext, study: null,               positions: ['WR', 'TE', 'ALL'] },
  ];
  for (const d of defs) {
    q1.cells[d.id] = {};
    for (const pos of d.positions) {
      const key = `${d.id}|${pos}`;
      const a = runCell(store, key, inPos(d.pop, pos), d.spec, { studyK: studyFor(d.study, pos) });
      q1.cells[d.id][pos] = slimCell(a);
    }
  }
  // arm S (study reproduction) beside it
  for (const pos of POSITIONS) {
    const a = analyzeKCell(armSRowsList.filter(r => r.position === pos), ARM_S_SPEC, { studyK: STUDY_K.ros.points[pos] });
    q1.armS[pos] = slimCell(a);
  }

  // diagnostics (arm P ROS points, per position)
  const diagA = {}, diagB = {}, diagC = {};
  for (const pos of POSITIONS) {
    const rs = popP.filter(r => r.position === pos && isFin(r.pointsPrior) && isFin(r.obsPPG) && isFin(r.rosPPG));
    // (a) functional form: k by n bin
    diagA[pos] = {};
    for (const [label, lo, hi] of [['1-2', 1, 2], ['3-4', 3, 4], ['5-6', 5, 6], ['7+', 7, 99]]) {
      const sub = rs.filter(r => r.n >= lo && r.n <= hi);
      const f = sub.length ? fitK(suffStats(sub, SPEC.pointsRos)) : null;
      diagA[pos][label] = { rows: sub.length, k: f?.k ?? null, boundary: f?.boundary ?? null };
    }
    // (b) prior optimism: joint (c, k)
    const joint = fitCK(rs, SPEC.pointsRos);
    const seasons = bySeason(rs);
    const lo = loso(seasons, {
      fit: (train) => fitCK(train, SPEC.pointsRos),
      predict: (m, r) => blend(m.c * r.pointsPrior, r.obsPPG, r.n, m.k),
      actual: (r) => r.rosPPG,
    });
    const base = store.get(`pointsP_ros|${pos}`);
    diagB[pos] = {
      rows: rs.length, pooled: joint ? { c: joint.c, k: joint.k } : null,
      kOnly: base?.kFit?.k ?? null,
      foldK: [Math.min(...lo.folds.map(f => f.fitted.k)), Math.max(...lo.folds.map(f => f.fitted.k))],
      foldC: [Math.min(...lo.folds.map(f => f.fitted.c)), Math.max(...lo.folds.map(f => f.fitted.c))],
      heldOutMae: { joint: r4(lo.pooled.mae), kOnly: r4(base?.error?.fitted?.mae ?? null) },
      kMoves: joint && base?.kFit ? r1(joint.k - base.kFit.k) : null,
    };
    // (c) exclusion bias
    const eligible = rs.filter(r => r.missedInWindow === true || r.missedInWindow === false);
    const clean = eligible.filter(r => r.missedInWindow === false);
    const kAll = eligible.length ? fitK(suffStats(eligible, SPEC.pointsRos)) : null;
    const kClean = clean.length ? fitK(suffStats(clean, SPEC.pointsRos)) : null;
    const bd = kAll && kClean ? bootstrapKDiff(eligible, clean, SPEC.pointsRos) : null;
    diagC[pos] = {
      rowsAll: eligible.length, rowsWithoutMiss: clean.length, kAll: kAll?.k ?? null, kWithoutMiss: kClean?.k ?? null,
      diff: kAll && kClean ? r1(kAll.k - kClean.k) : null, ci95: bd ? bd.ci95.map(r1) : null,
      missedShare: eligible.length ? r4(1 - clean.length / eligible.length) : null,
    };
  }
  q1.diagnostics = { functionalForm: diagA, priorOptimism: diagB, exclusionBias: diagC };

  // ── Q7 (before pins that depend on it) ──
  const q7 = runQ7(store, popP);

  // ── Q2 ──
  const q2 = runQ2(popP, D);

  // ── Q3 ──
  const q3 = runQ3(store, popP);

  // ── Q4 ──
  const q4 = runQ4(store, rows);

  // ── Q5 ──
  const q5 = runQ5(store, rows, popOpp);

  // ── pins: constants ──
  const pinned = buildConstants({ store, q3, q4, q5, q7, popP });

  // ── Q6 (sort measure) — uses the pinned ROS opportunity k ──
  const q6 = runQ6(rows, pinned.constants.K_ROS_OPP ?? {});

  // ── Q8 ──
  const q8 = runQ8(store, popP, popR);

  return { q1, q2, q3, q4, q5, q6, q7, q8, pinned, store, popP };
}

// Q7 — live vs frozen depth prior, points ROS, arm P.
function runQ7(store, popP) {
  const rows = popP.filter(r => Number.isFinite(r.pointsPrior) && Number.isFinite(r.pointsPriorLive) && Number.isFinite(r.obsPPG) && Number.isFinite(r.rosPPG));
  const out = { pooled: null, byPosition: {}, decision: null };
  const promoted = (r) => (r.orderWeek1 == null ? r.orderLive != null : r.orderLive != null && r.orderLive < r.orderWeek1);
  const demoted = (r) => (r.orderWeek1 != null && (r.orderLive == null || r.orderLive > r.orderWeek1));
  const measure = (rs, spec, label, studyPos) => {
    const pa = runCell(store, `q7_P|${label}`, rs, SPEC.pointsRos, { studyK: studyPos });
    const la = runCell(store, `q7_L|${label}`, rs, { prior: 'pointsPriorLive', obs: 'obsPPG', outcome: 'rosPPG' }, { studyK: studyPos });
    if (pa.verdict === 'INSUFFICIENT' || la.verdict === 'INSUFFICIENT') return { rows: pa.rows, players: pa.players, verdict: 'INSUFFICIENT' };
    const delta = pairedDelta(pa.orderedRows, pa.heldOut, la.heldOut);
    const changed = pa.orderedRows.filter((r, i) => r.orderLive !== r.orderWeek1).length;
    const resid = (a, pred) => {
      const res = {};
      for (const [name, fn] of [['promoted', promoted], ['demoted', demoted]]) {
        const idx = a.orderedRows.map((r, i) => (fn(r) ? i : -1)).filter(i => i >= 0);
        const vals = idx.map(i => pred[i].pred - pred[i].actual);
        const b = vals.length ? bootstrapPairedMean(idx.map(i => a.orderedRows[i].sleeperId), vals) : null;
        res[name] = { rows: vals.length, mean: r4(mean(vals)), ci95: b ? b.ci95.map(r4) : null, includesZero: b ? (b.ci95[0] <= 0 && b.ci95[1] >= 0) : null };
      }
      return res;
    };
    return {
      rows: pa.rows, players: pa.players, verdict: 'OK', changedRows: changed, changedShare: r4(changed / pa.rows),
      kP: pa.kFit.k, kL: la.kFit.k, boundaryP: pa.kFit.boundary, boundaryL: la.kFit.boundary,
      maeP: r4(pa.error.fitted.mae), maeL: r4(la.error.fitted.mae),
      delta: delta ? { mean: r4(delta.mean), ci95: delta.ci95.map(r4), label: delta.label } : null,
      residuals: { P: resid(pa, pa.heldOut), L: resid(la, la.heldOut) },
    };
  };
  out.pooled = measure(rows, null, 'ALL', (r) => STUDY_K.ros.points[r.position]);
  for (const pos of POSITIONS) out.byPosition[pos] = measure(rows.filter(r => r.position === pos), null, pos, STUDY_K.ros.points[pos]);
  const pl = out.pooled;
  const accept = pl.verdict === 'OK' && pl.delta?.label === 'BEATS' && pl.residuals.L.promoted.includesZero === true;
  out.decision = {
    rule: 'ACCEPT only if L BEATS P on held-out MAE AND L\'s promoted-row mean residual CI includes 0; else FREEZE',
    result: accept ? 'ACCEPT' : 'FREEZE',
  };
  return out;
}

// Q2 — does opportunity add to points out of sample (VE, G vs points-only).
function runQ2(popP, D) {
  const out = { horizons: {} };
  for (const horizon of ['ros', 'next']) {
    const pointsOutcome = horizon === 'ros' ? 'rosPPG' : 'nextPPG';
    const oppOutcome = horizon === 'ros' ? 'rosOpp' : 'nextOpp';
    out.horizons[horizon] = {};
    for (const pos of POSITIONS) {
      const all = popP.filter(r => r.position === pos);
      const eligible = all.filter(r => r.hasBaseline && Number.isFinite(r.pointsPrior) && Number.isFinite(r.obsPPG) && Number.isFinite(r.obsOpp) &&
        Number.isFinite(r.O) && Number.isFinite(r[pointsOutcome]) && Number.isFinite(r[oppOutcome]));
      const players = new Set(eligible.map(r => r.sleeperId)).size;
      const v = cellVerdict({ rows: eligible.length, players });
      const cell = { positionRows: all.length, eligibleRows: eligible.length, eligibleShare: r4(all.length ? eligible.length / all.length : null), players, verdict: v };
      if (v === 'INSUFFICIENT') { out.horizons[horizon][pos] = cell; continue; }
      const seasons = bySeason(eligible);
      const run = (fit, predict) => loso(seasons, { fit, predict, actual: (r) => r[pointsOutcome] });
      const pts = run((train) => ({ k: fitK(suffStats(train, { prior: 'pointsPrior', obs: 'obsPPG', outcome: pointsOutcome })).k }),
        (m, r) => blend(r.pointsPrior, r.obsPPG, r.n, m.k));
      const ve = run((train) => fitVE(train, pointsOutcome), (m, r) => predictVE(r, m.kOpp, m.kEff));
      const g = run((train) => fitG(train, { pointsOutcome, oppOutcome }), (m, r) => predictG(r, m));
      const rowsOrdered = [];
      for (const [, rs] of [...seasons].sort((a, b) => a[0] - b[0])) rowsOrdered.push(...rs);
      const cmp = (other, idx) => {
        const rs = idx ? idx.map(i => rowsOrdered[i]) : rowsOrdered;
        const a = idx ? idx.map(i => pts.predictions[i]) : pts.predictions;
        const b = idx ? idx.map(i => other.predictions[i]) : other.predictions;
        const d = rs.length >= 30 ? pairedDelta(rs, a, b) : null;
        return d ? { rows: rs.length, mean: r4(d.mean), ci95: d.ci95.map(r4), label: d.label } : { rows: rs.length, label: 'INSUFFICIENT' };
      };
      const roleIdx = rowsOrdered.map((r, i) => (r.n >= 2 && Math.abs(r.obsOpp - r.oppPrior) / r.oppPrior >= D.roleChangeRel ? i : -1)).filter(i => i >= 0);
      const foldParams = (m) => m.folds.map(f => f.fitted);
      cell.mae = { pointsOnly: r4(pts.pooled.mae), VE: r4(ve.pooled.mae), G: r4(g.pooled.mae) };
      cell.primary = { VE: cmp(ve), G: cmp(g) };
      cell.roleChange = { VE: cmp(ve, roleIdx), G: cmp(g, roleIdx), rows: roleIdx.length };
      cell.foldParams = { VE: foldParams(ve), G: foldParams(g) };
      const beats = ['VE', 'G'].filter(f => cell.primary[f].label === 'BEATS');
      cell.adopt = beats.length === 0 ? null : beats.length === 1 ? beats[0] : (cell.mae.VE <= cell.mae.G ? 'VE' : 'G');
      // full-data fit of the adopted form (parameters; CI left to the runner)
      if (cell.adopt === 'VE') cell.fit = fitVE(eligible, pointsOutcome);
      if (cell.adopt === 'G') cell.fit = fitG(eligible, { pointsOutcome, oppOutcome });
      cell._eligible = eligible;
      out.horizons[horizon][pos] = cell;
    }
  }
  return out;
}

// Q3 — does a weak/strong band or a projection-confidence tier scale k out of sample.
function runQ3(store, popP) {
  const out = { horizons: {} };
  for (const horizon of ['ros', 'next']) {
    const spec = horizon === 'ros' ? SPEC.pointsRos : SPEC.pointsNext;
    out.horizons[horizon] = {};
    for (const pos of POSITIONS) {
      const rs = popP.filter(r => r.position === pos && Number.isFinite(r.pointsPrior) && Number.isFinite(r.obsPPG) && Number.isFinite(r[spec.outcome]) &&
        r.confidence != null && (pos === 'QB' || r.band != null));
      const cell = { rows: rs.length };
      const groupsOk = (keyFn) => {
        const g = new Map();
        for (const r of rs) { const k = keyFn(r); if (!g.has(k)) g.set(k, []); g.get(k).push(r); }
        const detail = {};
        let ok = g.size > 1;
        for (const [k, list] of g) {
          const players = new Set(list.map(r => r.sleeperId)).size;
          const v = cellVerdict({ rows: list.length, players });
          detail[k] = { rows: list.length, players, verdict: v };
          if (v === 'INSUFFICIENT') ok = false;
        }
        return { ok, detail };
      };
      if (cellVerdict({ rows: rs.length, players: new Set(rs.map(r => r.sleeperId)).size }) === 'INSUFFICIENT') { cell.verdict = 'INSUFFICIENT'; out.horizons[horizon][pos] = cell; continue; }
      cell.verdict = 'OK';
      const m0 = losoGroupedK(rs, () => 'all', spec);
      cell.M0 = { mae: r4(m0.pooled.mae), k: r1(fitK(suffStats(rs, spec)).k) };
      for (const [name, keyFn, eligibleFor] of [['M1', (r) => r.band, pos !== 'QB'], ['M2', (r) => r.confidence, true]]) {
        if (!eligibleFor) { cell[name] = null; continue; }
        const g = groupsOk(keyFn);
        const m = losoGroupedK(rs, keyFn, spec);
        const d = pairedDelta(m0.rows, m0.predictions, m.predictions);
        const ks = {};
        for (const k of Object.keys(g.detail)) ks[k] = r1(fitK(suffStats(rs.filter(r => keyFn(r) === k), spec))?.k);
        cell[name] = { mae: r4(m.pooled.mae), groups: g.detail, ks, allGroupsSufficient: g.ok, delta: d ? { mean: r4(d.mean), ci95: d.ci95.map(r4), label: d.label } : null };
      }
      const cand = ['M1', 'M2'].filter(k => cell[k] && cell[k].allGroupsSufficient && cell[k].delta?.label === 'BEATS');
      cell.adopt = cand.length === 0 ? null : cand.length === 1 ? cand[0] : (cell.M1.mae <= cell.M2.mae ? 'M1' : 'M2');
      out.horizons[horizon][pos] = cell;
    }
  }
  return out;
}

// Q4 — rookies / short-history players: prior = rookie-path (or frozen) projection, vs Phase 1's rule.
const phase1RosK = (r) => {
  if (r.position === 'QB') return PHASE1_K.rosPoints.QB;
  if (r.sm1Games >= IN_SEASON_DEFAULTS.minPriorGames) return r.band === 'strong' ? PHASE1_K.rosStrong[r.position] : PHASE1_K.rosWeak[r.position];
  return PHASE1_K.rosWeak[r.position];
};
const phase1NextK = (r) => PHASE1_K.dynPoints[r.position];
const PHASE1_SUBGROUP_VALUE = { ros: (pos) => (pos === 'QB' ? PHASE1_K.rosPoints.QB : PHASE1_K.rosWeak[pos]), next: (pos) => PHASE1_K.dynPoints[pos] };

function runQ4(store, rows) {
  const out = { groups: {} };
  for (const group of ['X-rookie0', 'X-rookie1p', 'X-short']) {
    out.groups[group] = {};
    for (const horizon of ['ros', 'next']) {
      const spec = horizon === 'ros' ? SPEC.pointsRos : SPEC.pointsNext;
      const pop = rows.filter(r => r.arm === group);
      out.groups[group][horizon] = {};
      for (const pos of GRID_POSITIONS) {
        const a = runCell(store, `q4|${group}|${horizon}|${pos}`, pos === 'ALL' ? pop : pop.filter(r => r.position === pos), spec,
          { studyK: horizon === 'ros' ? phase1RosK : phase1NextK });
        const slim = slimCell(a);
        if (slim) slim.phase1Note = 'studyK = Phase 1 per-row rule (PHASE1_K)';
        out.groups[group][horizon][pos] = slim;
      }
      // opportunity has no prior the app holds for these players (D5)
      out.groups[group][horizon].opportunity = 'not measurable — the app holds no projected-volume prior for these players (D5)';
    }
  }
  return out;
}

// Q5 — opportunity baseline lookback: arm A = S-1, arm B = most recent of S-1..S-3 with gp >= 4.
function runQ5(store, rows, popOpp) {
  const rosOppPos = {};
  const foldK = {};   // pos → Map<S, k> fitted on hasBaseline rows of the other seasons
  for (const pos of POSITIONS) {
    const rs = popOpp.filter(r => r.position === pos && Number.isFinite(r.obsOpp) && Number.isFinite(r.rosOpp));
    foldK[pos] = new Map();
    const seasons = [...new Set(rs.map(r => r.S))];
    for (const S of seasons) foldK[pos].set(S, fitK(suffStats(rs.filter(r => r.S !== S), SPEC.oppRos))?.k ?? null);
    rosOppPos[pos] = rs.length;
  }
  const pop = rows.filter(r => r.oppPrior == null && r.oppPriorB != null && Number.isFinite(r.obsOpp) && Number.isFinite(r.rosOpp) && foldK[r.position]?.get(r.S) != null);
  const out = { rows: pop.length, players: new Set(pop.map(r => r.sleeperId)).size, playerSeasons: new Set(pop.map(r => `${r.sleeperId}|${r.S}`)).size, byPosition: {}, pooled: null };
  const evaluate = (rs) => {
    if (rs.length < 30) return { rows: rs.length, verdict: 'INSUFFICIENT' };
    const ordered = [...rs].sort((a, b) => a.S - b.S);
    const predA = ordered.map(r => { const k = foldK[r.position].get(r.S); return { pred: (r.n / (r.n + k)) * r.obsOpp, actual: r.rosOpp }; });
    const predB = ordered.map(r => { const k = foldK[r.position].get(r.S); return { pred: blend(r.oppPriorB, r.obsOpp, r.n, k), actual: r.rosOpp }; });
    const d = pairedDelta(ordered, predA, predB);
    return {
      rows: ordered.length, players: new Set(ordered.map(r => r.sleeperId)).size, verdict: 'OK',
      maeA: r4(errorSummary(predA).mae), maeB: r4(errorSummary(predB).mae),
      delta: d ? { mean: r4(d.mean), ci95: d.ci95.map(r4), label: d.label } : null,
    };
  };
  out.pooled = evaluate(pop);
  for (const pos of POSITIONS) out.byPosition[pos] = evaluate(pop.filter(r => r.position === pos));
  // stale-baseline k vs pooled k on those rows
  out.stale = {};
  for (const pos of [...POSITIONS, 'ALL']) {
    const rs = pos === 'ALL' ? pop : pop.filter(r => r.position === pos);
    const a = runCell(store, `q5_stale|${pos}`, rs, { prior: 'oppPriorB', obs: 'obsOpp', outcome: 'rosOpp' });
    const slim = slimCell(a);
    if (a.verdict === 'OK') {
      const pooledPreds = a.orderedRows.map(r => ({ pred: blend(r.oppPriorB, r.obsOpp, r.n, foldK[r.position].get(r.S)), actual: r.rosOpp }));
      const d = pairedDelta(a.orderedRows, pooledPreds, a.heldOut);
      slim.vsPooledK = d ? { mean: r4(d.mean), ci95: d.ci95.map(r4), label: d.label } : null;
      a.vsPooledLabel = d?.label ?? null;
    }
    out.stale[pos] = slim;
  }
  const label = out.pooled.delta?.label;
  out.decision = { arm: label === 'WORSE' ? 'A' : 'B', pooledLabel: label ?? null,
    newRoleFlagsRemoved: { playerSeasons: out.playerSeasons, players: out.players } };
  return out;
}

// Q6 — a cross-position-fair usage-shift sort measure at W ∈ {3,4,5,6}.
function runQ6(rows, kRosOpp) {
  const kFor = (pos) => {
    const e = kRosOpp?.[pos];
    return e && typeof e.k === 'number' ? e.k : PHASE1_K.rosOpp[pos];
  };
  const pop = rows.filter(r => IN_SEASON_DEFAULTS.q6Checkpoints.includes(r.W) && r.hasBaseline && Number.isFinite(r.pointsPrior) &&
    Number.isFinite(r.obsOpp) && Number.isFinite(r.rosPPG));
  for (const r of pop) {
    const k = kFor(r.position);
    const post = blend(r.oppPrior, r.obsOpp, r.n, k);
    r.q6raw = post - r.oppPrior;
    r.q6rel = r.q6raw / r.oppPrior;
    r.q6pts = r.q6raw * (r.pointsPrior / r.oppPrior);
    r.q6target = r.rosPPG - r.pointsPrior;
  }
  // z: raw / in-fold SD of raw shift at the same (position, n), from the OTHER seasons
  const sdBy = new Map();
  const key = (pos, n, S) => `${pos}|${n}|${S}`;
  const seasons = [...new Set(pop.map(r => r.S))];
  const groups = new Map();
  for (const r of pop) { const g = `${r.position}|${r.n}`; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r); }
  for (const [g, list] of groups) {
    const [pos, n] = g.split('|');
    for (const S of seasons) sdBy.set(key(pos, Number(n), S), sd(list.filter(r => r.S !== S).map(r => r.q6raw)));
  }
  for (const r of pop) { const s = sdBy.get(key(r.position, r.n, r.S)); r.q6z = s ? r.q6raw / s : null; }
  const measures = { raw: 'q6raw', relative: 'q6rel', z: 'q6z', pointsEquivalent: 'q6pts' };
  const out = { rows: pop.length, k: Object.fromEntries(POSITIONS.map(p => [p, kFor(p)])), measures: {} };
  for (const [name, field] of Object.entries(measures)) {
    const rs = pop.filter(r => Number.isFinite(r[field]));
    const sp = spearman(rs.map(r => r[field]), rs.map(r => r.q6target));
    const gaps = [];
    const cellsSW = new Map();
    for (const r of rs) { const c = `${r.S}|${r.W}`; if (!cellsSW.has(c)) cellsSW.set(c, []); cellsSW.get(c).push(r); }
    for (const list of cellsSW.values()) { const g = topMixGap(list, field, 'q6target', 50); if (g != null) gaps.push(g); }
    out.measures[name] = { rows: rs.length, spearman: r4(sp), meanMixGap: r4(mean(gaps)), groups: gaps.length };
  }
  const ranked = Object.entries(out.measures).sort((a, b) => b[1].spearman - a[1].spearman);
  const best = ranked[0];
  const near = ranked.filter(([, v]) => best[1].spearman - v.spearman <= 0.01);
  const winner = near.length === 1 ? best[0] : near.sort((a, b) => a[1].meanMixGap - b[1].meanMixGap)[0][0];
  out.answer = { measure: winner, byRule: near.length === 1 ? 'highest Spearman' : 'within 0.01 of the best Spearman → smaller mix gap', candidatesWithin001: near.map(([n]) => n) };
  return out;
}

// Q8 — which k drives the dynasty score, which the season projection (cross-application matrix).
function runQ8(store, popP, popR) {
  const out = { byPosition: {}, plus2: {}, armRNext: {} };
  for (const pos of POSITIONS) {
    const ros = popP.filter(r => r.position === pos && [r.pointsPrior, r.obsPPG, r.rosPPG].every(Number.isFinite));
    const nxt = popP.filter(r => r.position === pos && [r.pointsPrior, r.obsPPG, r.nextPPG].every(Number.isFinite));
    const seasons = [...new Set([...ros, ...nxt].map(r => r.S))].sort((a, b) => a - b);
    const acc = { rosNative: [], rosCross: [], nextNative: [], nextCross: [] };
    for (const S of seasons) {
      const kR = fitK(suffStats(ros.filter(r => r.S !== S), SPEC.pointsRos))?.k;
      const kN = fitK(suffStats(nxt.filter(r => r.S !== S), SPEC.pointsNext))?.k;
      if (kR == null || kN == null) continue;
      for (const r of ros.filter(x => x.S === S)) {
        acc.rosNative.push({ pred: blend(r.pointsPrior, r.obsPPG, r.n, kR), actual: r.rosPPG });
        acc.rosCross.push({ pred: blend(r.pointsPrior, r.obsPPG, r.n, kN), actual: r.rosPPG });
      }
      for (const r of nxt.filter(x => x.S === S)) {
        acc.nextNative.push({ pred: blend(r.pointsPrior, r.obsPPG, r.n, kN), actual: r.nextPPG });
        acc.nextCross.push({ pred: blend(r.pointsPrior, r.obsPPG, r.n, kR), actual: r.nextPPG });
      }
    }
    const m = Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, errorSummary(v).mae]));
    const pen = (cross, native) => (native ? cross / native - 1 : null);
    out.byPosition[pos] = {
      kRos: store.get(`pointsP_ros|${pos}`)?.kFit?.k ?? null, kNext: store.get(`pointsP_next|${pos}`)?.kFit?.k ?? null,
      heldOutMae: Object.fromEntries(Object.entries(m).map(([k, v]) => [k, r4(v)])),
      penalty: { kNextOnRos: r4(pen(m.rosCross, m.rosNative)), kRosOnNext: r4(pen(m.nextCross, m.nextNative)) },
      rowsRos: ros.length, rowsNext: nxt.length,
    };
    const pp = out.byPosition[pos].penalty;
    out.byPosition[pos].oneSetWouldDo = pp.kNextOnRos != null && pp.kRosOnNext != null && pp.kNextOnRos < 0.01 && pp.kRosOnNext < 0.01;
    // S+2 diagnostic k and arm R's next-season k
    const p2 = popP.filter(r => r.position === pos && [r.pointsPrior, r.obsPPG, r.nextPPG2].every(Number.isFinite));
    const f2 = p2.length ? fitK(suffStats(p2, { prior: 'pointsPrior', obs: 'obsPPG', outcome: 'nextPPG2' })) : null;
    out.plus2[pos] = { rows: p2.length, k: f2?.k ?? null, boundary: f2?.boundary ?? null };
    out.armRNext[pos] = store.get(`pointsR_next|${pos}`)?.kFit?.k ?? null;
  }
  const pens = POSITIONS.flatMap(p => [out.byPosition[p].penalty.kNextOnRos, out.byPosition[p].penalty.kRosOnNext]).filter(v => v != null);
  out.oneSetWouldDo = pens.length > 0 && pens.every(v => v < 0.01);
  out.rule = 'season projection → kROS; dynasty → kNext; if both cross-application penalties < 1%, one set would do';
  return out;
}

// ─── Constants table (§5.2) ───────────────────────────────────────────────────

function entryOf(pin) {
  return { k: pin.k, kFit: pin.kFit, ci95: pin.ci95, rows: pin.rows, players: pin.players, basis: pin.basis };
}

export function makePut() {
  const constants = {}, fixture = {}, pinnedFrom = {};
  const put = (name, cellKey, pin, fixtureCell, from, note = null) => {
    constants[name] ??= {};
    const e = entryOf(pin);
    if (note) e.note = note;
    constants[name][cellKey] = e;
    const fx = fixtureFrom(fixtureCell);
    if (fx) fixture[`${name}|${cellKey}`] = fx;
    pinnedFrom[`${name}|${cellKey}`] = from;
  };
  // Falls back to the pooled-positions cell of the same group (basis 'pooled'), else null / 'insufficient'.
  const putWithPooled = (name, cellKey, own, pooled, studyNum, from, pooledFrom) => {
    if (own && own.verdict !== 'INSUFFICIENT') return put(name, cellKey, pinDecision(own, studyNum), own, from);
    if (pooled && pooled.verdict !== 'INSUFFICIENT') {
      const p = pinDecision(pooled, studyNum);
      const e = { ...p, basis: p.basis === 'fitted' ? 'pooled' : p.basis };
      constants[name] ??= {};
      constants[name][cellKey] = { ...entryOf(e), fixtureKey: `${name}|ALL` };
      const fx = fixtureFrom(pooled);
      if (fx) fixture[`${name}|ALL`] = fx;
      pinnedFrom[`${name}|${cellKey}`] = `${pooledFrom} (pooled positions; own cell INSUFFICIENT)`;
      return;
    }
    put(name, cellKey, { k: null, kFit: null, ci95: null, rows: own?.rows ?? 0, players: own?.players ?? 0, basis: 'insufficient' }, null, `${from} INSUFFICIENT`);
  };
  return { constants, fixture, pinnedFrom, put, putWithPooled };
}

function buildConstants({ store, q3, q4, q5, q7, popP }) {
  const P = makePut();
  const { put, putWithPooled } = P;
  const pos1 = (id, name, positions, studyTable) => {
    for (const pos of positions) {
      putWithPooled(name, pos, store.get(`${id}|${pos}`), store.get(`${id}|ALL`),
        typeof studyTable?.[pos] === 'number' ? studyTable[pos] : null, `${id}|${pos}`, `${id}|ALL`);
    }
  };

  // K_ROS_POINTS — arm P; Q7 ACCEPT swaps in arm L's cell.
  const accept = q7.decision.result === 'ACCEPT';
  for (const pos of POSITIONS) {
    const l = accept ? store.get(`q7_L|${pos}`) : null;
    if (l && l.verdict !== 'INSUFFICIENT') put('K_ROS_POINTS', pos, pinDecision(l, STUDY_K.ros.points[pos]), l, `q7_L|${pos} (Q7 ACCEPT: live prior)`);
    else pos1('pointsP_ros', 'K_ROS_POINTS', [pos], STUDY_K.ros.points);
  }
  pos1('pointsP_next', 'K_DYN_POINTS', POSITIONS, STUDY_K.next.points);
  pos1('pointsR_next', 'K_DYN_POINTS_HISTORY', POSITIONS, STUDY_K.next.points);
  pos1('opp_ros', 'K_ROS_OPP', POSITIONS, STUDY_K.ros.opp);
  pos1('opp_next', 'K_DYN_OPP', POSITIONS, STUDY_K.next.opp);
  pos1('share_ros', 'K_ROS_SHARE', ['WR', 'TE'], STUDY_K.ros.share);

  // Q5 — K_ROS_OPP_STALE only when the stale-baseline k BEATS the pooled k on those rows.
  for (const pos of POSITIONS) {
    const own = store.get(`q5_stale|${pos}`);
    const pooled = store.get(`q5_stale|ALL`);
    if (own && own.verdict === 'OK' && own.vsPooledLabel === 'BEATS') put('K_ROS_OPP_STALE', pos, pinDecision(own, null), own, `q5_stale|${pos}`);
    else if (own?.verdict === 'INSUFFICIENT' && pooled?.verdict === 'OK' && pooled.vsPooledLabel === 'BEATS') {
      putWithPooled('K_ROS_OPP_STALE', pos, own, pooled, null, `q5_stale|${pos}`, 'q5_stale|ALL');
    }
  }

  // Q3 — adopted splits, re-run with CI so the pin rule and the fixture have full cells.
  for (const horizon of ['ros', 'next']) {
    const H = horizon === 'ros' ? 'ROS' : 'DYN';
    for (const pos of POSITIONS) {
      const c = q3.horizons[horizon][pos];
      if (!c?.adopt) continue;
      const spec = horizon === 'ros' ? SPEC.pointsRos : SPEC.pointsNext;
      const rs = popP.filter(r => r.position === pos && r.confidence != null && (pos === 'QB' || r.band != null));
      if (c.adopt === 'M1') {
        for (const band of ['weak', 'strong']) {
          const studyNum = horizon === 'ros' ? STUDY_K.ros[band === 'weak' ? 'pointsWeak' : 'pointsStrong'][pos] : STUDY_K.next.points[pos];
          const a = runCell(store, `q3|${horizon}|${pos}|${band}`, rs.filter(r => r.band === band), spec, { studyK: studyNum });
          put(`K_${H}_POINTS_${band.toUpperCase()}`, pos, pinDecision(a, studyNum), a, `q3|${horizon}|${pos}|${band} (Q3 M1 BEATS)`);
        }
      } else {
        for (const tier of ['low', 'medium', 'high']) {
          const studyNum = horizon === 'ros' ? STUDY_K.ros.points[pos] : STUDY_K.next.points[pos];
          const a = runCell(store, `q3|${horizon}|${pos}|${tier}`, rs.filter(r => r.confidence === tier), spec, { studyK: studyNum });
          put(`K_${H}_POINTS_CONF`, `${pos}|${tier}`, pinDecision(a, studyNum), a, `q3|${horizon}|${pos}|${tier} (Q3 M2 BEATS)`);
        }
      }
    }
  }

  // Q4 — rookie / short-history subgroups vs Phase 1's rule.
  const groupName = { 'X-rookie0': 'ROOKIE0', 'X-rookie1p': 'ROOKIE1P', 'X-short': 'SHORT' };
  for (const group of Object.keys(groupName)) {
    for (const horizon of ['ros', 'next']) {
      const H = horizon === 'ros' ? 'ROS' : 'DYN';
      for (const pos of POSITIONS) {
        const own = store.get(`q4|${group}|${horizon}|${pos}`);
        const pooled = store.get(`q4|${group}|${horizon}|ALL`);
        const p1 = PHASE1_SUBGROUP_VALUE[horizon](pos);
        const name = `K_${H}_POINTS_${groupName[group]}`;
        putWithPooled(name, pos, own, pooled, p1, `q4|${group}|${horizon}|${pos}`, `q4|${group}|${horizon}|ALL`);
        const e = P.constants[name][pos];
        const ref = own && own.verdict !== 'INSUFFICIENT' ? own : pooled;
        if (ref?.delta?.label === 'NO-GAIN' && e.basis !== 'insufficient') e.note = 'NO-GAIN vs Phase 1: fitted k pinned anyway (measured, where Phase 1\'s was not)';
        if (e.basis === 'study') e.note = 'WORSE vs Phase 1: Phase 1 value pinned';
      }
    }
  }
  return { constants: P.constants, fixture: P.fixture, pinnedFrom: P.pinnedFrom };
}

// ─── Constants verification (§7 test 11) ──────────────────────────────────────

function statsMapFrom(cellFixture, dropSeason = null) {
  const m = new Map();
  for (const [S, byN] of Object.entries(cellFixture)) {
    if (dropSeason != null && Number(S) === dropSeason) continue;
    for (const [n, [count, Saa, Sab, Sbb]] of Object.entries(byN)) {
      const cur = m.get(Number(n)) ?? { count: 0, Saa: 0, Sab: 0, Sbb: 0 };
      cur.count += count; cur.Saa += Saa; cur.Sab += Sab; cur.Sbb += Sbb;
      m.set(Number(n), cur);
    }
  }
  return m;
}

/** Every `kFit` in `constants` must re-derive from `fixture` by the `fit` rule (pooled; and per LOSO fold by dropping a season). */
export function verifyConstants(file) {
  const bad = [];
  for (const [name, cells] of Object.entries(file.constants)) {
    for (const [cellKey, e] of Object.entries(cells)) {
      if (e.kFit == null) continue;
      const fx = file.fixture[e.fixtureKey ?? `${name}|${cellKey}`];
      if (!fx) { bad.push({ name, cellKey, problem: 'no fixture' }); continue; }
      const pooled = fitK(statsMapFrom(fx));
      if (!pooled || pooled.k !== e.kFit) bad.push({ name, cellKey, problem: `kFit ${e.kFit} != re-derived ${pooled?.k}` });
      for (const S of Object.keys(fx)) {
        const fold = fitK(statsMapFrom(fx, Number(S)));
        if (!fold || !Number.isFinite(fold.k)) bad.push({ name, cellKey, problem: `fold ${S} does not fit` });
      }
    }
  }
  return bad;
}

// ─── Coverage and the excluded-population report (§4.3) ───────────────────────

function excludedStat(rs, prior = (r) => r.pointsPrior) {
  const pri = rs.map(prior).filter(Number.isFinite);
  const dif = rs.filter(r => Number.isFinite(prior(r)) && Number.isFinite(r.obsPPG)).map(r => r.obsPPG - prior(r));
  return {
    count: rs.length, players: new Set(rs.map(r => r.sleeperId)).size,
    meanPrior: r4(mean(pri)), meanN: r4(mean(rs.map(r => r.n).filter(Number.isFinite))), meanObsMinusPrior: r4(mean(dif)),
  };
}

function buildExcluded(rows, playerSeasons, noPrior, defaults) {
  const armPos = (rs) => {
    const out = {};
    for (const arm of ['P', 'X-rookie0', 'X-rookie1p', 'X-short']) {
      out[arm] = {};
      for (const pos of POSITIONS) out[arm][pos] = rs.filter(r => r.arm === arm && r.position === pos);
    }
    return out;
  };
  const summarize = (rs, prior) => {
    const g = armPos(rs), out = {};
    for (const arm of Object.keys(g)) { out[arm] = {}; for (const pos of POSITIONS) out[arm][pos] = excludedStat(g[arm][pos], prior); }
    return out;
  };
  const n0 = playerSeasons.filter(p => !p.anyGamesThroughW12).map(p => ({ ...p, n: 0 }));
  const rosDrop = rows.filter(r => r.rosGames < defaults.minRosGames);
  const isEarly = (r) => r.lastPlayedWeek != null && r.lastPlayedWeek <= r.W + 2;
  return {
    definition: 'count = rows (pid, S, W with n >= 1) unless noted; player-season rows for n0/attachDropped/absentFromGamelogs; mean prior = pointsPrior where one exists',
    n0AllCheckpoints: summarize(n0, (r) => r.pointsPrior),
    rosGamesLt4SeasonEndedEarly: summarize(rosDrop.filter(isEarly)),
    rosGamesLt4Other: summarize(rosDrop.filter(r => !isEarly(r))),
    noNextSeasonOutcome: summarize(rows.filter(r => r.hasNextSeason && r.nextPPG == null)),
    missedInWindow: summarize(rows.filter(r => r.missedInWindow === true)),
    attachDropped: summarize(noPrior.map(p => ({ ...p, n: null, pointsPrior: null, obsPPG: null }))),
    absentFromGamelogs: summarize(playerSeasons.filter(p => !p.inGamelogs).map(p => ({ ...p, n: null, obsPPG: null }))),
  };
}

function buildCoverage(perSeason, rows, playerSeasons, reconciliation) {
  const byArmPos = {};
  for (const p of playerSeasons) {
    const k = `${p.arm}|${p.position}`;
    byArmPos[k] = (byArmPos[k] ?? 0) + 1;
  }
  const armPSeasons = playerSeasons.filter(p => p.arm === 'P');
  const movers = armPSeasons.filter(p => p.mover);
  return {
    seasons: perSeason,
    playerSeasonsByArmPosition: byArmPos,
    rowsTotal: rows.length,
    rowsByArm: rows.reduce((a, r) => { a[r.arm] = (a[r.arm] ?? 0) + 1; return a; }, {}),
    armP: { playerSeasons: armPSeasons.length, movers: movers.length, moverShare: r4(armPSeasons.length ? movers.length / armPSeasons.length : null) },
    rowsWithOppMissingWeeks: rows.filter(r => r.oppMissingWeeks > 0).length,
    gamelogsUnmappedBySeason: reconciliation.unmapped,
    skillPlayerSeasonsAbsentFromGamelogs: reconciliation.absentFromGamelogs,
  };
}

function bootstrapParams(rows, fitFn, names, { resamples, seed }) {
  const byId = new Map();
  for (const r of rows) { if (!byId.has(r.sleeperId)) byId.set(r.sleeperId, []); byId.get(r.sleeperId).push(r); }
  const clusters = [...byId.values()];
  const rng = mulberry32(seed);
  const samples = Object.fromEntries(names.map(n => [n, []]));
  for (let i = 0; i < resamples; i++) {
    const sample = [];
    for (let c = 0; c < clusters.length; c++) sample.push(...clusters[Math.floor(rng() * clusters.length)]);
    const m = fitFn(sample);
    for (const n of names) samples[n].push(m[n]);
  }
  const out = {};
  for (const n of names) {
    const v = samples[n].sort((a, b) => a - b), R = v.length;
    out[n] = [v[Math.floor(0.025 * R)], v[Math.ceil(0.975 * R) - 1]];
  }
  return { resamples, seed, ci95: out };
}

function buildCombination(q2) {
  const out = { ros: {}, next: {}, note: 'fitted on all eligible arm-P rows; ΔMAE evidence is LOSO (q2)' };
  let any = false;
  for (const horizon of ['ros', 'next']) {
    for (const pos of POSITIONS) {
      const c = q2.horizons[horizon][pos];
      if (!c?.adopt) continue;
      any = true;
      const pointsOutcome = horizon === 'ros' ? 'rosPPG' : 'nextPPG';
      const oppOutcome = horizon === 'ros' ? 'rosOpp' : 'nextOpp';
      if (c.adopt === 'G') {
        const b = bootstrapParams(c._eligible, (rs) => fitG(rs, { pointsOutcome, oppOutcome }), ['kPts', 'kOpp', 'gamma'], IN_SEASON_DEFAULTS.bootstrap);
        out[horizon][pos] = { form: 'G', params: c.fit, ci95: b.ci95, resamples: b.resamples, rows: c._eligible.length };
      } else {
        // VE's 2-D grid makes a 4000-resample refit ~10^10 evaluations; 200 resamples, stated.
        const b = bootstrapParams(c._eligible, (rs) => fitVE(rs, pointsOutcome), ['kOpp', 'kEff'], { resamples: 200, seed: IN_SEASON_DEFAULTS.bootstrap.seed });
        out[horizon][pos] = { form: 'VE', params: { kOpp: c.fit.kOpp, kEff: c.fit.kEff }, ci95: b.ci95, resamples: b.resamples, rows: c._eligible.length };
      }
    }
  }
  return any ? out : null;
}

// ─── runInSeason ──────────────────────────────────────────────────────────────

export function runInSeason({ load = INSEASON_LOAD, defaults = IN_SEASON_DEFAULTS, log = () => {} } = {}) {
  const t0 = Date.now();
  const g = guardLoad(load, { maxLoadSeason: defaults.maxLoadSeason });
  const reconciliation = runReconciliation(g, { fromYear: 2012, toYear: defaults.maxLoadSeason });   // throws ReconciliationStop below 0.99
  log(`reconciliation ${reconciliation.pass}/${reconciliation.population} (${reconciliation.rate.toFixed(4)})`);

  const env = { load: g, defaults, gamelogsIdx: makeGamelogsIndex(g), scheduleIdx: makeScheduleIndex(g), playerIds: g.loadPlayerIds() };
  const rows = [], playerSeasons = [], noPrior = [], perSeason = [];
  for (let S = defaults.seasons.from; S <= defaults.seasons.to; S++) {
    const a = assembleSeason(S, env);
    rows.push(...a.rows); playerSeasons.push(...a.playerSeasons); noPrior.push(...a.noPrior);
    const byArm = a.playerSeasons.reduce((m, p) => { m[p.arm] = (m[p.arm] ?? 0) + 1; return m; }, {});
    const armP = a.playerSeasons.filter(p => p.arm === 'P');
    perSeason.push({
      S, candidates: a.candidates, byArm, rows: a.rows.length, movers: a.movers,
      armPMovers: armP.filter(p => p.mover).length, armPPlayerSeasons: armP.length,
      attachDrops: a.dropsByReason, bandMedian: Object.fromEntries(Object.entries(a.bandMedian).map(([k, v]) => [k, r4(v)])),
    });
    log(`S=${S}: ${a.rows.length} rows, ${a.playerSeasons.length} player-seasons`);
  }

  const armSList = armSRows({ load: g });
  const an = analyze(rows, playerSeasons, defaults, armSList);
  const generatedAt = new Date().toISOString();
  const date = generatedAt.slice(0, 10);
  const combination = buildCombination(an.q2);
  for (const h of Object.values(an.q2.horizons)) for (const c of Object.values(h)) { delete c._eligible; delete c.fit; }
  const q5arm = an.q5.decision.arm;

  const constantsFile = {
    source: `sleeper-dashboard-data backtests/${date}-inseason-constants.json (node bin/backtest.mjs --inseason --write)`,
    generatedAt, basis: 'half_ppr',
    fit: {
      kTenths: [0, 400], loss: 'sum of squared error, rows equal weight', tie: 'smaller k', pin: 'Math.round(k*2)/2',
      checkpoints: 'calendar weeks 1-12, n = games played', minRosGames: defaults.minRosGames, nextMinGames: defaults.nextMinGames,
      prior: an.q7.decision.result === 'ACCEPT' ? 'live' : 'frozen', opportunityBaseline: q5arm,
    },
    constants: an.pinned.constants,
    combination,
    sortMeasure: { name: an.q6.answer.measure, params: { kRosOppByPosition: an.q6.k, checkpoints: defaults.q6Checkpoints, target: 'rosPPG - pointsPrior' } },
    fixture: an.pinned.fixture,
  };
  const bad = verifyConstants(constantsFile);
  if (bad.length) throw new Error(`[inseason] constants do not re-derive from their fixture: ${JSON.stringify(bad.slice(0, 5))}`);

  const excluded = buildExcluded(rows, playerSeasons, noPrior, defaults);
  const coverage = buildCoverage(perSeason, rows, playerSeasons, reconciliation);
  const meta = {
    generatedAt, basis: 'half_ppr', seasons: defaults.seasons, checkpoints: defaults.checkpoints,
    nextTo: defaults.nextTo, plus2To: defaults.plus2To, bootstrap: defaults.bootstrap, kGridTenths: [0, defaults.kGridMaxTenths],
    minRosGames: defaults.minRosGames, nextMinGames: defaults.nextMinGames, minCell: { players: defaults.minCellPlayers, rows: defaults.minCellRows },
    regressionModel: CURRENT_REGRESSION_MODEL, runtimeMs: Date.now() - t0,
  };
  return {
    meta, reconciliation, coverage, excluded,
    q1: an.q1, q2: an.q2, q3: an.q3, q4: an.q4, q5: an.q5, q6: an.q6, q7: an.q7, q8: an.q8,
    pinnedFrom: an.pinned.pinnedFrom, constants: constantsFile,
  };
}

// ─── Verdict markdown (§5.3) ──────────────────────────────────────────────────

const f = (v, d = 2) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(d));
const ci = (c, d = 1) => (c ? `[${f(c[0], d)}, ${f(c[1], d)}]` : '—');
const tbl = (headers, rows) => [
  `| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`, ...rows.map(r => `| ${r.join(' | ')} |`),
];
const labelCounts = (labels) => {
  const c = {};
  for (const l of labels) if (l) c[l] = (c[l] ?? 0) + 1;
  return c;
};

const STUDY_TABLES = {
  K_ROS_POINTS: (pos) => STUDY_K.ros.points[pos], K_DYN_POINTS: (pos) => STUDY_K.next.points[pos],
  K_DYN_POINTS_HISTORY: (pos) => STUDY_K.next.points[pos], K_ROS_OPP: (pos) => STUDY_K.ros.opp[pos],
  K_DYN_OPP: (pos) => STUDY_K.next.opp[pos], K_ROS_SHARE: (pos) => STUDY_K.ros.share[pos], K_ROS_OPP_STALE: (pos) => STUDY_K.ros.opp[pos],
  K_ROS_POINTS_WEAK: (pos) => STUDY_K.ros.pointsWeak[pos], K_ROS_POINTS_STRONG: (pos) => STUDY_K.ros.pointsStrong[pos],
  K_DYN_POINTS_WEAK: (pos) => STUDY_K.next.points[pos], K_DYN_POINTS_STRONG: (pos) => STUDY_K.next.points[pos],
};
function studyValueOf(name, cellKey) {
  const pos = cellKey.split('|')[0];
  if (STUDY_TABLES[name]) return STUDY_TABLES[name](pos);
  if (/^K_ROS_POINTS_CONF$/.test(name)) return STUDY_K.ros.points[pos];
  if (/^K_DYN_POINTS_CONF$/.test(name)) return STUDY_K.next.points[pos];
  if (/^K_ROS_POINTS_(ROOKIE0|ROOKIE1P|SHORT)$/.test(name)) return PHASE1_SUBGROUP_VALUE.ros(pos);
  if (/^K_DYN_POINTS_(ROOKIE0|ROOKIE1P|SHORT)$/.test(name)) return PHASE1_SUBGROUP_VALUE.next(pos);
  return null;
}

export function buildInSeasonVerdictMarkdown(result) {
  const { meta, reconciliation, coverage, excluded, q1, q2, q3, q4, q5, q6, q7, q8, constants } = result;
  const C = constants.constants;
  const cellOf = (id, pos) => q1.cells[id][pos];
  const posRow = (id, key) => POSITIONS.map(p => cellOf(id, p)?.verdict === 'OK' ? `${p} ${f(cellOf(id, p)[key], 1)}` : `${p} n/a`).join(' · ');

  // one-line answers
  const q1Cells = Object.entries(q1.cells).flatMap(([id, cs]) => POSITIONS.filter(p => cs[p]).map(p => ({ id, p, c: cs[p] })));
  const q1Labels = labelCounts(q1Cells.filter(x => x.c.delta).map(x => x.c.delta.label));
  const q1Worse = q1Cells.filter(x => x.c.delta?.label === 'WORSE').map(x => `${x.id} ${x.p}`);
  const q1Beats = q1Cells.filter(x => x.c.delta?.label === 'BEATS').map(x => `${x.id} ${x.p}`);
  const boundaryHits = q1Cells.filter(x => x.c.boundary).map(x => `${x.id} ${x.p} (${x.c.boundary})`);
  const q2Adopt = [];
  const q2BeatsSecondary = [];
  for (const h of ['ros', 'next']) for (const p of POSITIONS) {
    const c = q2.horizons[h][p];
    if (c.adopt) q2Adopt.push(`${p} ${h} (${c.adopt})`);
    for (const form of ['VE', 'G']) if (c.roleChange?.[form]?.label === 'BEATS') q2BeatsSecondary.push(`${p} ${h} ${form}`);
  }
  const q3Adopt = [];
  for (const h of ['ros', 'next']) for (const p of POSITIONS) { const c = q3.horizons[h][p]; if (c.adopt) q3Adopt.push(`${p} ${h} (${c.adopt === 'M1' ? 'band' : 'tier'})`); }
  const q4Cells = [];
  for (const [g, hs] of Object.entries(q4.groups)) for (const [h, cs] of Object.entries(hs)) for (const p of POSITIONS) { const c = cs[p]; if (c?.verdict === 'OK' && c.delta) q4Cells.push({ g, h, p, label: c.delta.label }); }
  const q4Labels = labelCounts(q4Cells.map(x => x.label));
  const q4Insufficient = Object.entries(q4.groups).flatMap(([g, hs]) => Object.entries(hs).flatMap(([h, cs]) => POSITIONS.filter(p => cs[p]?.verdict === 'INSUFFICIENT').map(p => `${g} ${h} ${p}`)));
  const q6m = q6.measures;
  const q7p = q7.pooled;
  const oneSetPos = POSITIONS.filter(p => q8.byPosition[p].oneSetWouldDo);

  const lines = [];
  lines.push(
    '# In-season evidence — Phase 2a graded backtest',
    '',
    `Generated ${meta.generatedAt}. Basis **half_ppr** (pinned; a league-basis refit belongs to the custom-basis backlog item). ` +
      `Outcome seasons ${meta.seasons.from}–${meta.seasons.to}, calendar checkpoints W = 1–12, n = games played, leave-one-season-out, ` +
      `player-clustered bootstrap (${meta.bootstrap.resamples} resamples, seed ${meta.bootstrap.seed}, mulberry32), k grid ${meta.kGridTenths[0] / 10}–${meta.kGridTenths[1] / 10} in tenths.`,
    '',
    '## Answers',
    '',
    `- **Q1 — k with the real reconstructed projection as prior.** ROS points (arm P): ${posRow('pointsP_ros', 'kFit')} ` +
      `(study 6 · 3 · 4.5 · 5.5; arm S reproduces the study's own ${POSITIONS.map(p => `${p} ${f(q1.armS[p].kFit, 1)}`).join(' · ')}). ` +
      `Next-season points (arm P): ${posRow('pointsP_next', 'kFit')} (study 7.5 · 4.5 · 6.5 · 6.5). ` +
      `Fitted k vs study k over the single-position cells: ${Object.entries(q1Labels).map(([k, v]) => `${v} ${k}`).join(', ')}; ` +
      `BEATS: ${q1Beats.join(', ') || 'none'}; WORSE: ${q1Worse.join(', ') || 'none'}. ` +
      `Grid-boundary fits: ${boundaryHits.join(', ') || 'none'}.`,
    `- **Q2 — opportunity + points vs points-only (out of sample).** ${q2Adopt.length
      ? `VE/G BEATS points-only on the primary population for: ${q2Adopt.join(', ')}.`
      : 'Neither VE nor G BEATS points-only on the primary population in any of the 8 position × horizon cells — opportunity stays display-only.'} ` +
      `Secondary (role-change rows) BEATS: ${q2BeatsSecondary.join(', ') || 'none'}.`,
    `- **Q3 — weak/strong split and projection confidence.** ${q3Adopt.length ? `Adopted: ${q3Adopt.join(', ')}.` : 'No band or tier split BEATS the per-position k in any position × horizon cell — none adopted.'} ` +
      `See §Q3 for each label.`,
    `- **Q4 — rookies and players without a ≥ 8-game prior season.** Fitted k vs Phase 1's rule over the position cells: ${Object.entries(q4Labels).map(([k, v]) => `${v} ${k}`).join(', ')}` +
      `${q4Insufficient.length ? `; INSUFFICIENT position cells (pooled fallback): ${q4Insufficient.join(', ')}` : ''}. Opportunity for these players: not measurable (no projected-volume prior).`,
    `- **Q5 — baseline lookback.** Arm ${q5.decision.arm} (${q5.decision.arm === 'B' ? 'last season with ≥ 4 games' : 'last season only'}): pooled ROS-opportunity ΔMAE (B − A) ${f(q5.pooled.delta?.mean, 3)} ${ci(q5.pooled.delta?.ci95, 3)} → ${q5.pooled.delta?.label}, ` +
      `on ${q5.rows} rows / ${q5.playerSeasons} player-seasons that Phase 1 would flag "new role" and arm B removes. ` +
      `K_ROS_OPP_STALE: ${C.K_ROS_OPP_STALE ? 'adopted' : 'not adopted (a separate k does not BEAT the pooled k on those rows)'}.`,
    `- **Q6 — cross-position usage-shift sort measure.** Winner: **${q6.answer.measure}** (${q6.answer.byRule}). Spearman vs realised ROS − prior: ` +
      `${Object.entries(q6m).map(([k, v]) => `${k} ${f(v.spearman, 3)}`).join(' · ')}; mean top-50 position-mix gap: ${Object.entries(q6m).map(([k, v]) => `${k} ${f(v.meanMixGap, 3)}`).join(' · ')}.`,
    `- **Q7 — depth-chart double count.** **${q7.decision.result}**: live-depth prior vs frozen ΔMAE ${f(q7p.delta?.mean, 4)} ${ci(q7p.delta?.ci95, 4)} → ${q7p.delta?.label}; ` +
      `arm L's promoted-row mean residual ${f(q7p.residuals.L.promoted.mean, 3)} ${ci(q7p.residuals.L.promoted.ci95, 3)} (${q7p.residuals.L.promoted.includesZero ? 'includes' : 'excludes'} 0). ` +
      `Fitted k: P ${f(q7p.kP, 1)}, L ${f(q7p.kL, 1)}; ${(q7p.changedShare * 100).toFixed(0)}% of arm-P rows have a different depth order at their checkpoint.`,
    `- **Q8 — which k drives which.** Season projection → kROS ${POSITIONS.map(p => `${p} ${f(q8.byPosition[p].kRos, 1)}`).join(' · ')}; dynasty → kNext ${POSITIONS.map(p => `${p} ${f(q8.byPosition[p].kNext, 1)}`).join(' · ')}. ` +
      `Cross-application MAE penalty (kNext on ROS / kROS on next): ${POSITIONS.map(p => `${p} ${f(q8.byPosition[p].penalty.kNextOnRos * 100, 2)}% / ${f(q8.byPosition[p].penalty.kRosOnNext * 100, 2)}%`).join(' · ')}. ` +
      `${q8.oneSetWouldDo ? 'Both penalties are < 1% at every position: one k set would do.' : `Both penalties < 1% for ${oneSetPos.join(', ') || 'no position'}; not at every position, so the two sets stay separate.`} ` +
      `S+2 diagnostic k: ${POSITIONS.map(p => `${p} ${f(q8.plus2[p].k, 1)}`).join(' · ')}; arm R next-season k (K_DYN_POINTS_HISTORY): ${POSITIONS.map(p => `${p} ${f(q8.armRNext[p], 1)}`).join(' · ')}.`,
    '',
    '## Constants table',
    '',
    'What Phase 2b pins. `k` is the pinned value (fitted k rounded to 0.5, or the §4.5 fallback); `basis` says which. Study / Phase 1 column: the study k for the single-signal constants, Phase 1\'s per-row rule value for the rookie / short-history subgroups.',
    '',
  );
  const crow = [];
  for (const [name, cells] of Object.entries(C)) {
    for (const [cellKey, e] of Object.entries(cells)) {
      crow.push([`\`${name}\``, cellKey, e.k == null ? 'null' : f(e.k, 1), e.kFit == null ? '—' : f(e.kFit, 1), ci(e.ci95), `${e.rows} / ${e.players}`, e.basis + (e.note ? ` — ${e.note}` : ''), f(studyValueOf(name, cellKey), 1)]);
    }
  }
  lines.push(...tbl(['name', 'cell', 'k', 'kFit', '95% CI', 'rows / players', 'basis', 'study / Phase 1'], crow), '');
  lines.push(
    `Also in the constants file: \`combination\` = ${constants.combination ? 'filled (see file)' : 'null (Q2 adopted nothing)'}; \`sortMeasure\` = \`${constants.sortMeasure.name}\` with the pinned K_ROS_OPP by position as its shrink parameters; ` +
      `\`fit.prior\` = ${constants.fit.prior}; \`fit.opportunityBaseline\` = ${constants.fit.opportunityBaseline}.`,
    '',
  );

  // ── Q1 detail ──
  lines.push('## Q1 — k per signal × position × horizon', '',
    'Prior: arm P = the frozen reconstructed projection (S week-1 depth chart); arm R = raw S-1 PPG; opportunity and target share = raw S-1 baseline (the app holds no projected-volume prior). ' +
      'MAE columns are held-out (LOSO); prior-only / observed-only / study-k are computed on the same rows. ΔMAE = fitted − study (negative = fitted better).', '');
  const q1rows = [];
  for (const [id, cs] of Object.entries(q1.cells)) {
    for (const [pos, c] of Object.entries(cs)) {
      if (c.verdict === 'INSUFFICIENT') { q1rows.push([id, pos, 'INSUFFICIENT', '', '', `${c.rows} / ${c.players}`, '', '', '', '', '', '']); continue; }
      q1rows.push([id, pos, f(c.kFit, 1), f(c.kPin, 1), ci(c.ci95), `${c.rows} / ${c.players}`, c.boundary ?? '—', `${f(c.foldKRange[0], 1)}–${f(c.foldKRange[1], 1)}`,
        `${f(c.error.priorOnly.mae, 3)} / ${f(c.error.observedOnly.mae, 3)} / ${c.error.study ? f(c.error.study.mae, 3) : '—'} / ${f(c.error.fitted.mae, 3)}`,
        c.error.fitted.rmse != null ? f(c.error.fitted.rmse, 3) : '—',
        c.delta ? `${f(c.delta.mean, 4)} ${ci(c.delta.ci95, 4)}` : '—', c.delta ? c.delta.label : '—']);
    }
  }
  lines.push(...tbl(['cell', 'pos', 'k (0.1)', 'pinned (0.5)', '95% CI', 'rows / players', 'boundary', 'fold k range', 'MAE prior / obs / study / fitted', 'RMSE fitted', 'ΔMAE vs study [CI]', 'label'], q1rows), '');
  lines.push('Arm S (study reproduction: first n played games, S-1 gp ≥ 8, crosswalk position):', '',
    ...tbl(['pos', 'k', '95% CI', 'rows / players', 'study'], POSITIONS.map(p => [p, f(q1.armS[p].kFit, 1), ci(q1.armS[p].ci95), `${q1.armS[p].rows} / ${q1.armS[p].players}`, f(STUDY_K.ros.points[p], 1)])), '');
  lines.push('**Diagnostics (reported, never pinned; arm P ROS points)**', '', 'Functional form — k fitted separately by n:', '',
    ...tbl(['pos', 'n 1–2', 'n 3–4', 'n 5–6', 'n 7+'], POSITIONS.map(p => [p, ...['1-2', '3-4', '5-6', '7+'].map(b => `${f(q1.diagnostics.functionalForm[p][b].k, 1)} (${q1.diagnostics.functionalForm[p][b].rows})`)])), '',
    'Prior optimism — joint (c, k) with prior × c, c ∈ 0.80…1.10:', '',
    ...tbl(['pos', 'c*', 'k* (joint)', 'k (alone)', 'k moves', 'fold k', 'fold c', 'held-out MAE joint / k-only'], POSITIONS.map(p => {
      const d = q1.diagnostics.priorOptimism[p];
      return [p, f(d.pooled?.c, 2), f(d.pooled?.k, 1), f(d.kOnly, 1), f(d.kMoves, 1), `${f(d.foldK[0], 1)}–${f(d.foldK[1], 1)}`, `${f(d.foldC[0], 2)}–${f(d.foldC[1], 2)}`, `${f(d.heldOutMae.joint, 3)} / ${f(d.heldOutMae.kOnly, 3)}`];
    })), '',
    'Exclusion bias — k on rows without a missed game in the window vs all rows (paired bootstrap of the difference):', '',
    ...tbl(['pos', 'rows all / without miss', 'k all', 'k without miss', 'difference [95% CI]', 'share of rows with a miss'], POSITIONS.map(p => {
      const d = q1.diagnostics.exclusionBias[p];
      return [p, `${d.rowsAll} / ${d.rowsWithoutMiss}`, f(d.kAll, 1), f(d.kWithoutMiss, 1), `${f(d.diff, 1)} ${ci(d.ci95)}`, f(d.missedShare, 3)];
    })), '');

  // ── Q2 ──
  lines.push('## Q2 — does opportunity + points beat points-only?', '',
    'Arm P, `hasBaseline` rows. VE = volume × efficiency; G = points posterior + γ × opportunity increment. ΔMAE = form − points-only (negative = better), LOSO, clustered bootstrap. Decision: combine only where VE or G is BEATS on the primary population.', '',
    ...tbl(['horizon', 'pos', 'eligible rows (share of arm P)', 'MAE points-only / VE / G', 'VE Δ [CI]', 'VE', 'G Δ [CI]', 'G', 'role-change rows: VE / G', 'adopt'],
      ['ros', 'next'].flatMap(h => POSITIONS.map(p => {
        const c = q2.horizons[h][p];
        if (c.verdict === 'INSUFFICIENT') return [h, p, `${c.eligibleRows} — INSUFFICIENT`, '', '', '', '', '', '', ''];
        return [h, p, `${c.eligibleRows} (${f(c.eligibleShare, 2)})`, `${f(c.mae.pointsOnly, 3)} / ${f(c.mae.VE, 3)} / ${f(c.mae.G, 3)}`,
          `${f(c.primary.VE.mean, 4)} ${ci(c.primary.VE.ci95, 4)}`, c.primary.VE.label, `${f(c.primary.G.mean, 4)} ${ci(c.primary.G.ci95, 4)}`, c.primary.G.label,
          `${c.roleChange.rows}: ${c.roleChange.VE.label} / ${c.roleChange.G.label}`, c.adopt ?? 'none (display-only)'];
      }))), '');

  // ── Q3 ──
  lines.push('## Q3 — weak/strong split and projection confidence as the scaling variable', '',
    'Arm P, points. M0 = k per position; M1 = k per position × band (S-1 opp/g below/above the position median over S-1 players with gp ≥ 8; RB/WR/TE); M2 = k per position × confidence tier (qualifying seasons: ≥ 5 high, ≥ 3 medium, else low). Held-out MAE; ΔMAE vs M0.', '',
    ...tbl(['horizon', 'pos', 'M0 k / MAE', 'M1 band k (MAE) Δ [CI] label', 'M2 tier k (MAE) Δ [CI] label', 'adopt'],
      ['ros', 'next'].flatMap(h => POSITIONS.map(p => {
        const c = q3.horizons[h][p];
        const cellTxt = (m) => (m ? `${Object.entries(m.ks).map(([k, v]) => `${k} ${f(v, 1)}`).join(' / ')} (${f(m.mae, 3)}) ${m.delta ? `${f(m.delta.mean, 4)} ${ci(m.delta.ci95, 4)} ${m.delta.label}` : ''}${m.allGroupsSufficient ? '' : ' — a sub-cell INSUFFICIENT'}` : 'n/a (QB)');
        return [h, p, `${f(c.M0.k, 1)} / ${f(c.M0.mae, 3)}`, cellTxt(c.M1), cellTxt(c.M2), c.adopt ?? 'none'];
      }))), '');

  // ── Q4 ──
  lines.push('## Q4 — rookies and players without a ≥ 8-game prior season', '',
    'Prior: rookie-path players use the SHIPPED rookie projection (calibration + games ladder + ceiling; no KTC multiplier historically); veteran-path X-short players use the frozen projection. Comparator: Phase 1\'s per-row k rule (`PHASE1_K`). ΔMAE = fitted − Phase 1 (negative = better).', '',
    ...tbl(['group', 'horizon', 'pos', 'k (0.1)', '95% CI', 'rows / players', 'MAE fitted / Phase 1', 'ΔMAE [CI]', 'label'],
      Object.entries(q4.groups).flatMap(([g, hs]) => Object.entries(hs).flatMap(([h, cs]) => GRID_POSITIONS.map(p => {
        const c = cs[p];
        if (c.verdict === 'INSUFFICIENT') return [g, h, p, 'INSUFFICIENT', '', `${c.rows} / ${c.players}`, '', '', ''];
        return [g, h, p, f(c.kFit, 1), ci(c.ci95), `${c.rows} / ${c.players}`, `${f(c.error.fitted.mae, 3)} / ${f(c.error.study.mae, 3)}`, `${f(c.delta.mean, 4)} ${ci(c.delta.ci95, 4)}`, c.delta.label];
      })))), '',
    'Opportunity for these players: **not measurable** — the app holds no projected-volume prior for them (D5).', '');

  // ── Q5 ──
  lines.push('## Q5 — opportunity baseline lookback', '',
    `Population: rows where arm A (S-1, gp ≥ 4, opp/g ≥ 2.0) has no baseline but arm B (most recent of S-1…S-3 with gp ≥ 4) does — ${q5.rows} rows, ${q5.playerSeasons} player-seasons, ${q5.players} players. ` +
      'Arm A predicts by Phase 1\'s new-role shrink toward 0, `(n/(n+k))·obsOpp`; arm B blends with the older baseline. k is the in-fold pooled ROS-opportunity k per position. ΔMAE = B − A.', '',
    ...tbl(['scope', 'rows / players', 'MAE A / B', 'ΔMAE [CI]', 'label'], [
      ['pooled', `${q5.pooled.rows} / ${q5.pooled.players}`, `${f(q5.pooled.maeA, 3)} / ${f(q5.pooled.maeB, 3)}`, `${f(q5.pooled.delta?.mean, 3)} ${ci(q5.pooled.delta?.ci95, 3)}`, q5.pooled.delta?.label ?? '—'],
      ...POSITIONS.map(p => { const c = q5.byPosition[p]; return c.verdict === 'INSUFFICIENT' ? [p, `${c.rows}`, 'INSUFFICIENT', '', ''] : [p, `${c.rows} / ${c.players}`, `${f(c.maeA, 3)} / ${f(c.maeB, 3)}`, `${f(c.delta?.mean, 3)} ${ci(c.delta?.ci95, 3)}`, c.delta?.label ?? '—']; }),
    ]), '',
    'Stale-baseline k (fitted on the arm-B-only rows) vs the pooled k on those same rows:', '',
    ...tbl(['scope', 'rows / players', 'k (0.1)', '95% CI', 'ΔMAE stale-k − pooled-k [CI]', 'label'], [...POSITIONS, 'ALL'].map(p => {
      const c = q5.stale[p];
      return c.verdict === 'INSUFFICIENT' ? [p, `${c.rows} / ${c.players}`, 'INSUFFICIENT', '', '', ''] : [p, `${c.rows} / ${c.players}`, f(c.kFit, 1), ci(c.ci95), c.vsPooledK ? `${f(c.vsPooledK.mean, 4)} ${ci(c.vsPooledK.ci95, 4)}` : '—', c.vsPooledK?.label ?? '—'];
    })), '');

  // ── Q6 ──
  lines.push('## Q6 — cross-position-fair usage-shift sort measure', '',
    `Rows at W ∈ {${IN_SEASON_DEFAULTS.q6Checkpoints.join(', ')}} with a baseline and a points prior (${q6.rows} rows). Shift = posterior ROS opportunity − baseline, with the pinned K_ROS_OPP by position (${POSITIONS.map(p => `${p} ${f(q6.k[p], 1)}`).join(', ')}). ` +
      'Target = ROS PPG − points prior. Spearman is pooled across positions; the mix gap is the mean absolute position-share gap between the top 50 by the measure and the top 50 by the target, per (S, W). Highest Spearman wins; within 0.01, the smaller mix gap.', '',
    ...tbl(['measure', 'Spearman', 'mean top-50 mix gap', '(S, W) groups'], Object.entries(q6.measures).map(([k, v]) => [k, f(v.spearman, 4), f(v.meanMixGap, 4), String(v.groups)])), '',
    `Answer: **${q6.answer.measure}** — ${q6.answer.byRule}; within 0.01 of the best: ${q6.answer.candidatesWithin001.join(', ')}.`, '');

  // ── Q7 ──
  lines.push('## Q7 — depth-chart double count: freeze the prior or accept the live one', '',
    'Arm P frozen at the S week-1 depth chart vs arm L re-derived with the depth chart of S week min(W+1, last). Each arm uses its own in-fold k. Residual = prediction − actual on held-out rows; promoted = live order < week-1 order or newly listed; demoted = live order > week-1 order or dropped from the chart.', '',
    ...tbl(['scope', 'rows / changed', 'k P / L', 'MAE P / L', 'ΔMAE (L − P) [CI]', 'label', 'L promoted mean resid [CI]', 'L demoted mean resid [CI]', 'P promoted [CI]', 'P demoted [CI]'],
      [['pooled', q7.pooled], ...POSITIONS.map(p => [p, q7.byPosition[p]])].map(([name, c]) => c.verdict === 'INSUFFICIENT'
        ? [name, `${c.rows}`, '', '', '', '', '', '', '', '']
        : [name, `${c.rows} / ${c.changedRows}`, `${f(c.kP, 1)} / ${f(c.kL, 1)}`, `${f(c.maeP, 4)} / ${f(c.maeL, 4)}`, `${f(c.delta?.mean, 4)} ${ci(c.delta?.ci95, 4)}`, c.delta?.label ?? '—',
          `${f(c.residuals.L.promoted.mean, 3)} ${ci(c.residuals.L.promoted.ci95, 3)}`, `${f(c.residuals.L.demoted.mean, 3)} ${ci(c.residuals.L.demoted.ci95, 3)}`,
          `${f(c.residuals.P.promoted.mean, 3)} ${ci(c.residuals.P.promoted.ci95, 3)}`, `${f(c.residuals.P.demoted.mean, 3)} ${ci(c.residuals.P.demoted.ci95, 3)}`])), '',
    `Rule (pre-registered): ${q7.decision.rule}. Decision on the pooled population: **${q7.decision.result}**.`, '');

  // ── Q8 ──
  lines.push('## Q8 — which k set drives the dynasty score, which the season projection', '',
    'Arm P. Each k is the LOSO-fitted value for its own horizon; "cross" applies the other horizon\'s fitted k to the same held-out rows. Penalty = cross MAE / native MAE − 1.', '',
    ...tbl(['pos', 'kROS', 'kNext', 'ROS rows: native / kNext MAE', 'penalty', 'next rows: native / kROS MAE', 'penalty', 'both < 1%', 'S+2 k (rows)', 'arm R next k'],
      POSITIONS.map(p => {
        const c = q8.byPosition[p];
        return [p, f(c.kRos, 1), f(c.kNext, 1), `${f(c.heldOutMae.rosNative, 4)} / ${f(c.heldOutMae.rosCross, 4)}`, `${f(c.penalty.kNextOnRos * 100, 2)}%`,
          `${f(c.heldOutMae.nextNative, 4)} / ${f(c.heldOutMae.nextCross, 4)}`, `${f(c.penalty.kRosOnNext * 100, 2)}%`, c.oneSetWouldDo ? 'yes' : 'no',
          `${f(q8.plus2[p].k, 1)} (${q8.plus2[p].rows})`, f(q8.armRNext[p], 1)];
      })), '',
    `Rule: ${q8.rule}. ${q8.oneSetWouldDo ? 'One set would do at every position.' : 'Not every position clears 1% on both, so the two sets stay separate.'}`, '');

  // ── reconciliation, coverage, excluded ──
  lines.push('## Reconciliation (gamelogs ↔ season-totals)', '',
    `Gate population: season-totals rows 2012–2025, non-\`TEAM_\`, QB/RB/WR/TE via the panel position resolver, gp ≥ 4, present in that season's gamelogs. ` +
      `${reconciliation.pass} of ${reconciliation.population} reconcile (${f(reconciliation.rate, 5)}; stop below ${reconciliation.minRate}); tolerance ${reconciliation.tolerance}.`, '',
    ...(reconciliation.failures.length ? ['Failing player-seasons:', '', ...tbl(['season', 'sleeperId', 'pos', 'gamelogs', 'season-totals', 'diff'], reconciliation.failures.map(x => [String(x.season), x.sleeperId, x.position, String(x.gamelogs), String(x.seasonTotals), String(x.diff)])), ''] : []),
    'Skill player-seasons (gp ≥ 4) absent from gamelogs (their opportunity / share cells are null) and each season\'s gamelogs `unmapped` count (team-target denominators omit those rows — a stated limitation):', '',
    ...tbl(['season', 'absent from gamelogs', 'gamelogs unmapped'], Object.keys(reconciliation.absentFromGamelogs).map(y => [y, String(reconciliation.absentFromGamelogs[y]), String(reconciliation.unmapped[y])])), '');

  lines.push('## Coverage', '',
    `${coverage.rowsTotal} evidence rows (n ≥ 1). Mid-season movers (> 1 distinct gamelogs team) are ${coverage.armP.movers} of ${coverage.armP.playerSeasons} arm-P player-seasons (${f(coverage.armP.moverShare, 3)}). ` +
      `Rows with a played week lacking a gamelogs row: ${coverage.rowsWithOppMissingWeeks}.`, '',
    ...tbl(['S', 'candidates', 'arm P', 'X-rookie0', 'X-rookie1p', 'X-short', 'rows', 'movers (all / arm P)', 'attach drops'], coverage.seasons.map(s => [String(s.S), String(s.candidates), String(s.byArm.P ?? 0), String(s.byArm['X-rookie0'] ?? 0), String(s.byArm['X-rookie1p'] ?? 0), String(s.byArm['X-short'] ?? 0), String(s.rows), `${s.movers} / ${s.armPMovers}`, JSON.stringify(s.attachDrops)])), '');

  lines.push('## Excluded-population report', '', excluded.definition, '');
  const catNames = {
    n0AllCheckpoints: 'Player-seasons with n = 0 at every checkpoint (no game in weeks 1–12)',
    rosGamesLt4SeasonEndedEarly: 'Rows dropped for rosGames < 4 — season ended early (last played week ≤ W+2)',
    rosGamesLt4Other: 'Rows dropped for rosGames < 4 — other',
    noNextSeasonOutcome: 'Rows with no next-season outcome (S+1 absent or gp < 6; S ≤ 2024)',
    missedInWindow: 'Rows with a missed game in the window (kept; used in the Q1(c) diagnostic)',
    attachDropped: 'Veteran-path player-seasons dropped by attachFactorMultipliers (no points prior)',
    absentFromGamelogs: 'Player-seasons absent from gamelogs (opportunity / share cells null)',
  };
  for (const [cat, title] of Object.entries(catNames)) {
    const rows = [];
    for (const arm of Object.keys(excluded[cat])) for (const pos of POSITIONS) {
      const e = excluded[cat][arm][pos];
      if (e.count > 0) rows.push([arm, pos, String(e.count), String(e.players), f(e.meanPrior, 2), f(e.meanN, 2), f(e.meanObsMinusPrior, 2)]);
    }
    lines.push(`**${title}**`, '', ...(rows.length ? tbl(['arm', 'pos', 'count', 'players', 'mean prior', 'mean n', 'mean obs − prior'], rows) : ['none']), '');
  }

  lines.push('## Limitations', '',
    '- **Basis is half_ppr.** A dimensionless k fitted on the half-PPR panel is acceptable here; a league-basis refit belongs to the existing custom-basis backlog item.',
    '- **The prior is the reconstruction, not the app\'s live number.** It is faithful in 9 of 13 steps, with the divergences documented in `grading/2026-09-06-fullpipeline-verdict.md`. The depth factor uses the S week-1 chart as a stand-in for a pre-season capture; qbQuality is a flat 50.',
    '- **The rookie prior has no KTC multiplier historically** (KTC history starts 2026-05-18).',
    `- **Season-totals S \`team\` is the season's dominant team.** It reaches teamOffense's current-team resolution and the forward-mover neutralization (\`classifyAttributionCohort\` reads \`teamsByYear[S]\`), so a player traded after W leaks future information into the prior. Accepted, not fixed: ${coverage.armP.movers} of ${coverage.armP.playerSeasons} arm-P player-seasons are movers (${f(coverage.armP.moverShare, 3)}).`,
    '- **Team-target denominators omit gamelogs `unmapped` rows** (per-season counts above), so target shares are slightly overstated in those seasons.',
    '- **No injury-severity model.** `missedInWindow` is schedule-based and says only that a game was missed, not why; the Q1(c) diagnostic reports how much k moves when those rows are dropped.',
    '- **Opportunity and target-share cells are gamelogs-derived** (weekly split only, behind the reconciliation gate); the S-1 opportunity baseline comes from season-totals.',
    '- **The Q2 arm-P population is the primary population** (frozen projection prior, `hasBaseline`); the eligible-row share is reported per cell.',
    '',
    '**Reproduce:** `node bin/backtest.mjs --inseason --write`', '');
  return lines.join('\n');
}

// ─── Artifacts (§5) ───────────────────────────────────────────────────────────

/** Top-level keys one per line, constants one cell per line, fixture one cell-key per line (keeps the file under its cap). */
export function formatConstantsJson(file) {
  const { constants, fixture, ...rest } = file;
  const out = ['{'];
  const restKeys = Object.keys(rest);
  restKeys.forEach((k) => out.push(`  ${JSON.stringify(k)}: ${JSON.stringify(rest[k])},`));
  out.push('  "constants": {');
  const names = Object.keys(constants);
  names.forEach((name, i) => {
    out.push(`    ${JSON.stringify(name)}: {`);
    const cells = Object.keys(constants[name]);
    cells.forEach((c, j) => out.push(`      ${JSON.stringify(c)}: ${JSON.stringify(constants[name][c])}${j < cells.length - 1 ? ',' : ''}`));
    out.push(`    }${i < names.length - 1 ? ',' : ''}`);
  });
  out.push('  },');
  out.push('  "fixture": {');
  const keys = Object.keys(fixture);
  keys.forEach((k, i) => out.push(`    ${JSON.stringify(k)}: ${JSON.stringify(fixture[k])}${i < keys.length - 1 ? ',' : ''}`));
  out.push('  }', '}');
  return out.join('\n') + '\n';
}

export const ARTIFACT_CAPS = { panelBytes: 5 * 1024 * 1024, constantsBytes: 300 * 1024 };

export function writeInSeasonArtifacts({ result, verdictMd }) {
  const date = result.meta.generatedAt.slice(0, 10);
  const panelPath = `backtests/${date}-inseason-panel.json`;
  const constantsPath = `backtests/${date}-inseason-constants.json`;
  const verdictPath = `grading/${date}-inseason-verdict.md`;
  const { constants, ...panel } = result;
  const panelJson = JSON.stringify({ ...panel, pinnedFrom: result.pinnedFrom }, null, 2) + '\n';
  const constantsJson = formatConstantsJson(constants);
  if (Buffer.byteLength(panelJson) > ARTIFACT_CAPS.panelBytes) throw new Error(`[inseason] panel artifact ${Buffer.byteLength(panelJson)} B exceeds the ${ARTIFACT_CAPS.panelBytes} B cap`);
  if (Buffer.byteLength(constantsJson) > ARTIFACT_CAPS.constantsBytes) throw new Error(`[inseason] constants artifact ${Buffer.byteLength(constantsJson)} B exceeds the ${ARTIFACT_CAPS.constantsBytes} B cap`);
  fs.mkdirSync(repoPath('backtests'), { recursive: true });
  fs.mkdirSync(repoPath('grading'), { recursive: true });
  fs.writeFileSync(repoPath(panelPath), panelJson, 'utf8');
  fs.writeFileSync(repoPath(constantsPath), constantsJson, 'utf8');
  fs.writeFileSync(repoPath(verdictPath), verdictMd.endsWith('\n') ? verdictMd : verdictMd + '\n', 'utf8');
  return { panelPath, constantsPath, verdictPath, panelBytes: Buffer.byteLength(panelJson), constantsBytes: Buffer.byteLength(constantsJson) };
}
