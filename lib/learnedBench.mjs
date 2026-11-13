/**
 * lib/learnedBench.mjs — LP-1a season-benchmark rules (pure, no I/O) and LP-1b's weekly current-model benchmark (`benchw`).
 * LP-1a: task file §4.3 (bench.jsonl) and §6 (the one copied definition: the B2 qualifying predicate).
 * LP-1b: task .claude/tasks/learned-projection-1b-weekly-bench.md §4 — replays the app's in-season scoring week by week;
 * its copied definitions (§6) are each headed with the app original and the tests that pin them.
 */
import { projectedGamesFor } from './durabilityMirror.mjs';
import { twoYearAveragePPG } from './dynastyBacktest.mjs';
import { expectedStarts, incPPG, priorPPG, dpCode, iqCode, primaryPassers } from './qbTakeover.mjs';
import { reconstructQbPreseasonShares } from './projectionFactors.mjs';
import { indexSchedule, depthSlot, modalTeamGames } from './learnedPanel.mjs';

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

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// LP-1b — the weekly current-model benchmark (task .claude/tasks/learned-projection-1b-weekly-bench.md §4)
// ═════════════════════════════════════════════════════════════════════════════════════════════════

const KEEP_STATUSES = new Set(['RES', 'INA', 'PUP']);
const INJURED_FROM_SEASON = 2016;   // 2012–2015 rosterweekly `status` reflects later-season state (LP-1a F4)

/** The population each `b1.arm` implies (the data classifier's routing); the app's own routing is `appPopulationAsOf`. */
export const ARM_POPULATION = Object.freeze({ P: 'standard', 'X-short': 'SHORT', 'X-rookie0': 'ROOKIE0', 'X-rookie1p': 'ROOKIE1P' });

/**
 * COPY (CR-25): the app's `classifyInSeasonPopulation` with dataSeason = S − 1. Original: app src/utils/inSeasonScoring.js
 * `classifyInSeasonPopulation`; equality pinned by T-LP-9 (data) and T-APP-1 (app) on the shared fixture.
 */
export function appPopulationAsOf({ pid, careerStats, S, yearsExp }) {
  let anyRow = false;
  let qualifying = 0;
  for (const s of Object.keys(careerStats ?? {})) {
    const d = careerStats[s]?.[pid];
    if (d == null) continue;
    anyRow = true;
    if (Number.isFinite(d.gamesPlayed) && d.gamesPlayed >= 8 && Number.isFinite(d.fantasyPoints)) qualifying++;
  }
  if (qualifying === 0 || (yearsExp != null && yearsExp <= 1)) return anyRow ? 'ROOKIE1P' : 'ROOKIE0';
  const gp = careerStats?.[S - 1]?.[pid]?.gamesPlayed;
  return Number.isFinite(gp) && gp >= 8 ? 'standard' : 'SHORT';
}

/**
 * COPY (CR-25): the keying of the app's private `ROS_K` (inSeasonScoring.js). Seen through
 * `buildScoringPosteriors(...).ros.k`; equality pinned by T-LP-9 · T-APP-1.
 */
export const ROS_TABLE = Object.freeze({
  standard: 'K_ROS_POINTS', SHORT: 'K_ROS_POINTS_SHORT', ROOKIE0: 'K_ROS_POINTS_ROOKIE0', ROOKIE1P: 'K_ROS_POINTS_ROOKIE1P',
});

/** The ROS k of a population × position from the pinned constants file (throws when it is not finite). */
export function rosK(constantsFile, population, position) {
  const table = ROS_TABLE[population];
  const k = constantsFile?.constants?.[table]?.[position]?.k;
  if (!Number.isFinite(k)) throw new Error(`[learnedBench] no finite ${table}.${position}.k in the constants file`);
  return k;
}

/**
 * COPY (CR-25): the app's `posteriorOf(prior, obs, n, k).value`. Original: inSeasonScoring.js `posteriorOf`;
 * equality pinned by T-LP-9 · T-APP-1. Null rules, in order: prior non-finite → null; n not an integer ≥ 0 or k not finite ≥ 0
 * → null; n = 0 → prior; obs non-finite → null; else (prior·k + obs·n)/(k + n).
 */
export function posteriorValue(prior, obs, n, k) {
  if (!Number.isFinite(prior)) return null;
  if (!Number.isInteger(n) || n < 0 || !Number.isFinite(k) || k < 0) return null;
  if (n === 0) return prior;
  if (!Number.isFinite(obs)) return null;
  const value = (prior * k + obs * n) / (k + n);
  return Number.isFinite(value) ? value : null;
}

/**
 * COPY (CR-27): the app's `qbTakeoverBasis` with its `depthStale` gate. Originals: app src/utils/seasonProjection.js
 * (`depthStale`, `qbTakeoverBasis`; the veteran path only — the rookie path has no stale case); equality pinned by T-LP-13 · T-APP-2.
 * `appVet` = population ∈ {standard, SHORT}; `lastQualGamesStarted` = gamesStarted of the most recent qualifying season.
 */
export function chainBasis({ role, order, appVet, lastQualGamesStarted }) {
  if (appVet && order != null && order >= 2 && lastQualGamesStarted >= 8) return 'stale';
  if (role == null) return 'not-evaluated';
  if (role !== 'backup') return role;
  return 'chain';
}

/** gamesStarted ?? 0 of the most recent season ≤ S − 1 with finite gamesPlayed ≥ 8 and finite fantasyPoints (the app's `lastQ`). */
export function lastQualifyingGamesStarted(careerStats, pid, S) {
  const years = Object.keys(careerStats ?? {}).map(Number).filter(y => y <= S - 1).sort((a, b) => b - a);
  for (const y of years) {
    const d = careerStats[y]?.[pid];
    if (d && Number.isFinite(d.gamesPlayed) && d.gamesPlayed >= 8 && Number.isFinite(d.fantasyPoints)) return d.gamesStarted ?? 0;
  }
  return 0;
}

const pidLess = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function medianOfValues(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * COPY (CR-27): the preseason chain set — the frozen capture's `qbChain`. Originals: app src/utils/qbTakeover.js
 * `buildPreseasonQbShares` (composed through the imported `reconstructQbPreseasonShares` port) and seasonProjection.js's
 * `qbTakeoverBasis` / `projectedPPG = qbStarterPPG × qbStartShare`; pinned by T-LP-13 · T-APP-2.
 * qbs = every non-null pid of each team's week-1 QB chart (1-based slot, nulls keep their slot, first team wins) plus every
 * `firstGameQbs` entry ({ id, team }) on no week-1 chart (order null). One league-wide call → Map<pid, { basis, share, order }>.
 */
export function preseasonChain({ S, depthFile, firstGameQbs = [], careerStats, draftYearOf, populationOf, models, games = modalTeamGames(S) }) {
  const qbs = [];
  const seen = new Set();
  const teams = depthFile?.weeks?.[1] ?? {};
  for (const T of Object.keys(teams)) {
    const arr = teams[T]?.QB;
    if (!Array.isArray(arr)) continue;
    arr.forEach((pid, i) => {
      if (pid == null || seen.has(pid)) return;
      seen.add(pid);
      qbs.push({ id: pid, team: T, order: i + 1, rookie: draftYearOf(pid) === S });
    });
  }
  for (const q of firstGameQbs) {
    if (seen.has(q.id)) continue;
    seen.add(q.id);
    qbs.push({ id: q.id, team: q.team, order: null, rookie: draftYearOf(q.id) === S });
  }
  const shares = reconstructQbPreseasonShares({ qbs, priorOf: (id) => priorPPG(careerStats?.[S - 1]?.[id]), models, games });
  const out = new Map();
  for (const q of qbs) {
    const r = shares[q.id];
    const pop = populationOf(q.id);
    const basis = chainBasis({
      role: r?.role, order: q.order, appVet: pop === 'standard' || pop === 'SHORT', lastQualGamesStarted: lastQualifyingGamesStarted(careerStats, q.id, S),
    });
    out.set(q.id, { basis, role: r?.role ?? null, share: r?.role === 'backup' ? r.share : null, order: q.order });
  }
  return out;
}

/**
 * COPY (CR-27): the live `qbTakeoverBasis` at week w (R5) — the same room roles, one league-wide call over every QB of
 * `qbIds` with `teamOf(id)` (§4.4's T, null when none) and `orderOf(id)` (§4.5). Originals as `preseasonChain`; pinned by
 * T-LP-13 · T-APP-2. → Map<pid, basis>.
 */
export function liveChainAt({ S, qbIds, teamOf, orderOf, careerStats, draftYearOf, populationOf, models }) {
  const qbs = qbIds.map(id => ({ id, team: teamOf(id) ?? null, order: orderOf(id) ?? null, rookie: draftYearOf(id) === S }));
  const shares = reconstructQbPreseasonShares({ qbs, priorOf: (id) => priorPPG(careerStats?.[S - 1]?.[id]), models });
  const out = new Map();
  for (const q of qbs) {
    const pop = populationOf(q.id);
    out.set(q.id, chainBasis({
      role: shares[q.id]?.role, order: q.order, appVet: pop === 'standard' || pop === 'SHORT', lastQualGamesStarted: lastQualifyingGamesStarted(careerStats, q.id, S),
    }));
  }
  return out;
}

/**
 * The QB's identity at week w as the replay reads it (§4.4–§4.5): T = team of his week-w row when that row is inUniverse, else the team
 * of his latest earlier row, else null; G = T's REG game weeks before w; order = 1-based slot on the chart of the previous game week
 * (the week-1 chart when g = 0); injured = a RES/INA/PUP rosterweekly pair on the previous game week (false for S ≤ 2015).
 * `rowsOf(pid)` → the pid's season weeks rows sorted by w.
 */
export function qbContextAt({ S, w, x, rowsOf, sched, depthFile, rosterPlayers }) {
  const rows = rowsOf(x);
  let T = null;
  const cur = rows.find(r => r.w === w);
  if (cur && cur.inUniverse) T = cur.team ?? null;
  else for (let i = rows.length - 1; i >= 0; i--) if (rows[i].w < w) { T = rows[i].team ?? null; break; }
  const G = T == null ? [] : sched.weeks(T).filter(v => v < w);
  const g = G.length;
  const order = T == null ? null : depthSlot(depthFile, g > 0 ? G[g - 1] : 1, T, 'QB', x);
  const injured = g > 0 && S >= INJURED_FROM_SEASON
    && (rosterPlayers?.[x]?.[String(G[g - 1])] ?? []).some(([, st]) => KEEP_STATUSES.has(st));
  return { T, G, g, order, injured };
}

/**
 * COPY (CR-27): the app's `buildQbLiveStates` replayed as of week w. Original: app src/utils/inSeasonScoring.js
 * `buildQbLiveStates`; pinned by T-LP-10 · T-APP-1. `primaries` is the WHOLE-season map; every key of week ≥ w is ignored.
 * `rowsOf(pid)` → his season weeks rows sorted by w; `careerM1` = careerStats[S − 1]. → Map<pid, state> for the QBs with one.
 * Departure (R5): remaining = the team's real REG games − g (the app uses 17 − g).
 */
export function qbLiveStatesAsOf({ S, w, qbIds, rowsOf, sched, primaries, careerM1, depthFile, rosterPlayers, draftYearOf, models }) {
  const prim = new Map();                                  // `${T}|${week}` → pid, weeks < w only
  const startsOf = new Map();                              // pid → weeks (ascending) he was any team's primary
  for (const [key, v] of primaries) {
    const week = Number(key.slice(key.lastIndexOf('|') + 1));
    if (!(week < w)) continue;
    prim.set(key, v.pid);
  }
  const startRows = [...prim].map(([key, pid]) => ({ pid, week: Number(key.slice(key.lastIndexOf('|') + 1)) })).sort((a, b) => a.week - b.week);
  for (const { pid, week } of startRows) {
    if (!startsOf.has(pid)) startsOf.set(pid, []);
    startsOf.get(pid).push(week);
  }
  const primaryOf = (T, wk) => prim.get(`${T}|${wk}`) ?? null;
  const ptsAt = (pid, wk) => { const r = rowsOf(pid).find(v => v.w === wk); return r && Number.isFinite(r.pts) ? r.pts : 0; };

  const incByTeam = new Map();
  const incPPGByTeam = new Map();
  for (const T of sched.teams()) {
    const G = sched.weeks(T).filter(v => v < w);
    if (!G.length) continue;
    const inc = primaryOf(T, G[G.length - 1]);
    if (inc == null) continue;
    incByTeam.set(T, inc);
    const obs = rowsOf(inc).filter(r => r.played && r.w < w).map(r => r.pts);
    incPPGByTeam.set(T, incPPG({ prior: priorPPG(careerM1?.[inc]), obs }));
  }
  const median = medianOfValues([...incPPGByTeam.values()].filter(v => v != null));

  const out = new Map();
  for (const x of qbIds) {
    const { T, G, g, order, injured } = qbContextAt({ S, w, x, rowsOf, sched, depthFile, rosterPlayers });
    if (T == null || g === 0) continue;
    const inc = incByTeam.get(T);
    if (inc == null) continue;
    const remaining = sched.teamGames(T) - g;
    if (!(remaining > 0)) continue;
    const P1 = primaryOf(T, G[0]);
    const yearsExp = draftYearOf(x) != null ? S - draftYearOf(x) : null;
    const rk = yearsExp === 0 ? 1 : 0;
    const xStarts = startsOf.get(x) ?? [];
    let startPoints = 0;
    for (const wk of xStarts) startPoints += ptsAt(x, wk);

    let kind, r = null;
    if (x === inc && x === P1) kind = 'original';
    else if (x === P1 && x !== inc && injured) kind = 'original';
    else if (x === inc) {
      kind = 'starter';
      let s = 0;
      for (let i = G.length - 1; i >= 0 && primaryOf(T, G[i]) === x; i--) s++;
      r = expectedStarts({
        hazard: models.hazard, stick: models.stick,
        start: { role: 'S', ps: 1, c: 0, s, g: g + 1, hazardCodes: { dp: 0, og: 0, rk, iq: 3 }, stickCodes: {} }, remaining,
      });
    } else {
      kind = 'backup';
      const hazardCodes = { dp: dpCode(order), og: x === P1 ? 1 : 0, rk, iq: iqCode(incPPGByTeam.get(T), median) };
      r = expectedStarts({
        hazard: models.hazard, stick: models.stick,
        start: { role: 'B', ps: xStarts.length > 0 ? 1 : 0, c: 0, g: g + 1, hazardCodes, stickCodes: {} }, remaining,
      });
    }
    out.set(x, {
      kind, team: T, g, remaining, expected: r ? r.expected : null, fraction: r ? r.fraction : null,
      starts: xStarts.length, startPoints, order, injured,
      massDev: r ? Math.max(...r.massPerGame.map(m => Math.abs(m - 1))) : null,
    });
  }
  return out;
}

/**
 * COPY (CR-27): the app's `buildScoringPosteriors` QB branch composed with the frozen capture's rules. Original: app
 * src/utils/inSeasonScoring.js `buildScoringPosteriors` (the `projectedPPG = qbStarterPPG × qbStartShare` product of the
 * `'preseason'` kind: seasonProjection.js); pinned by T-LP-16 · T-APP-1 and T-LP-13 · T-APP-2. → { kind, cond, uncond, omitted }.
 */
export function b1wValue({ position, K, projPrior, starterPrior, n, obsPPG, teamKnown, g, state, preChain, preShare, liveChain }) {
  if (position !== 'QB') return { kind: null, cond: posteriorValue(projPrior, obsPPG, n, K), uncond: null, omitted: null };
  if (teamKnown && g === 0) {
    return {
      kind: 'preseason', cond: preChain ? starterPrior : projPrior,
      uncond: preChain && preShare != null ? starterPrior * preShare : null, omitted: null,
    };
  }
  if (state && (state.kind === 'starter' || state.kind === 'backup')) {
    const p = posteriorValue(starterPrior, state.starts > 0 ? state.startPoints / state.starts : null, state.starts, K);
    return { kind: state.kind, cond: p, uncond: p == null ? null : p * state.fraction, omitted: null };
  }
  if (state && state.kind === 'original') {
    return { kind: 'original', cond: posteriorValue(preChain || liveChain ? starterPrior : projPrior, obsPPG, n, K), uncond: null, omitted: null };
  }
  if (liveChain) return { kind: 'none', cond: null, uncond: null, omitted: 'chain-no-state' };
  return { kind: 'none', cond: posteriorValue(preChain ? starterPrior : projPrior, obsPPG, n, K), uncond: null, omitted: null };
}

/**
 * One season of `benchw` rows (pure). `weekRows`/`bench`/`seasons` are that season's table rows (weeks.jsonl / bench.jsonl /
 * seasons.jsonl); the files are the season's gamelogs / schedule / depth / rosterweekly; `careerStats` = league-rescored
 * season-totals through S − 1. → { rows, checks } (checks = this season's §9 tallies).
 */
export function buildBenchwSeason({ S, weekRows, bench, seasons, gamelogsFile, scheduleFile, depthFile, rosterweeklyFile, careerStats, constantsFile, models }) {
  const sched = indexSchedule(scheduleFile);
  const primaries = primaryPassers(gamelogsFile, S);
  const rosterPlayers = rosterweeklyFile?.players ?? {};
  const benchOf = new Map(bench.map(b => [b.pid, b]));
  const draftYears = new Map(seasons.map(r => [r.pid, r.draftYear]));
  const draftYearOf = (pid) => { const d = draftYears.get(pid); return Number.isFinite(d) && d > 0 ? d : null; };
  const popMemo = new Map();
  const populationOf = (pid) => {
    if (!popMemo.has(pid)) {
      const dy = draftYearOf(pid);
      popMemo.set(pid, appPopulationAsOf({ pid, careerStats, S, yearsExp: dy != null ? S - dy : null }));
    }
    return popMemo.get(pid);
  };

  const byPid = new Map();
  for (const r of weekRows) {
    if (!byPid.has(r.pid)) byPid.set(r.pid, []);
    byPid.get(r.pid).push(r);
  }
  const normRows = new Map();
  for (const [pid, list] of byPid) normRows.set(pid, list.map(r => ({ ...r, w: r.w })).sort((a, b) => a.w - b.w));
  const rowsOf = (pid) => normRows.get(pid) ?? [];
  const qbIds = [...byPid.keys()].filter(pid => byPid.get(pid)[0].position === 'QB').sort(pidLess);
  const weeks = [...new Set(weekRows.map(r => r.w))].sort((a, b) => a - b);
  const careerM1 = careerStats?.[S - 1] ?? {};

  // first-game universe QBs: an inUniverse row on T in T's first REG game week
  const firstGameQbs = [];
  for (const T of sched.teams()) {
    const W1 = sched.weeks(T)[0];
    for (const pid of qbIds) {
      if (rowsOf(pid).some(r => r.w === W1 && r.inUniverse && r.team === T)) firstGameQbs.push({ id: pid, team: T });
    }
  }
  const pre = preseasonChain({ S, depthFile, firstGameQbs, careerStats, draftYearOf, populationOf, models });

  // per-week QB identity, live chain and live states
  const perWeek = new Map();
  for (const w of weeks) {
    const ctx = new Map(qbIds.map(x => [x, qbContextAt({ S, w, x, rowsOf, sched, depthFile, rosterPlayers })]));
    const live = liveChainAt({
      S, qbIds, teamOf: (id) => ctx.get(id).T, orderOf: (id) => ctx.get(id).order, careerStats, draftYearOf, populationOf, models,
    });
    const states = qbLiveStatesAsOf({ S, w, qbIds, rowsOf, sched, primaries, careerM1, depthFile, rosterPlayers, draftYearOf, models });
    perWeek.set(w, { ctx, live, states });
  }

  const rows = [];
  const checks = {
    c2: { n: 0, agree: 0, byPosition: {}, cells: {} },
    c3: { fractionBad: 0, massBad: 0, massMaxDev: 0, kinds: {}, omitted: 0 },
  };
  for (const b of bench) {
    if (!b.b1?.covered) continue;
    const pop = populationOf(b.pid);
    const agree = ARM_POPULATION[b.b1.arm] === pop;
    checks.c2.n++; if (agree) checks.c2.agree++;
    const bp = checks.c2.byPosition[b.position] ??= { n: 0, agree: 0 };
    bp.n++; if (agree) bp.agree++;
    if (!agree) { const cell = `${b.b1.arm}->${pop}`; checks.c2.cells[cell] = (checks.c2.cells[cell] ?? 0) + 1; }
  }

  // prefix tallies of played points
  const prefix = new Map();                       // pid → Map(w → { n, sum }) of played rows with week < w
  const prefixAt = (pid, w) => {
    if (!prefix.has(pid)) prefix.set(pid, new Map());
    const m = prefix.get(pid);
    if (!m.has(w)) {
      let n = 0, sum = 0;
      for (const r of rowsOf(pid)) if (r.played && r.w < w) { n++; sum += r.pts; }
      m.set(w, { n, obs: n > 0 ? sum / n : null });
    }
    return m.get(w);
  };

  for (const r of weekRows) {
    const b = benchOf.get(r.pid);
    if (!b?.b1?.covered) continue;
    const position = r.position;
    const population = populationOf(r.pid);
    const K = rosK(constantsFile, population, position);
    const routeMismatch = ARM_POPULATION[b.b1.arm] !== population;
    const { n, obs } = prefixAt(r.pid, r.w);
    const projPrior = b.b1.ppg;
    const starterPrior = Number.isFinite(b.b1.starterPPG) ? b.b1.starterPPG : projPrior;
    let out;
    if (position !== 'QB') {
      const v = b1wValue({ position, K, projPrior, starterPrior, n, obsPPG: obs, teamKnown: true, g: 0, state: null, preChain: false, preShare: null, liveChain: false });
      out = {
        pid: r.pid, S, w: r.w, position, population, k: K, routeMismatch, kind: null, cond: v.cond, uncond: null, n,
        starts: null, fraction: null, team: r.team ?? null, order: null, injured: null, preChain: null, liveChain: null, omitted: null,
      };
    } else {
      const pw = perWeek.get(r.w);
      const c = pw.ctx.get(r.pid);
      const state = pw.states.get(r.pid) ?? null;
      const p = pre.get(r.pid);
      const preChain = p?.basis === 'chain';
      const liveChain = c.g >= 1 && pw.live.get(r.pid) === 'chain';
      const v = b1wValue({
        position, K, projPrior, starterPrior, n, obsPPG: obs, teamKnown: c.T != null, g: c.g, state, preChain, preShare: p?.share ?? null, liveChain,
      });
      out = {
        pid: r.pid, S, w: r.w, position, population, k: K, routeMismatch, kind: v.kind, cond: v.cond, uncond: v.uncond, n,
        starts: state ? state.starts : null, fraction: state ? state.fraction : null, team: c.T, order: c.order, injured: c.injured,
        preChain, liveChain, omitted: v.omitted,
      };
      if (state?.fraction != null && !(state.fraction >= 0 && state.fraction <= 1)) checks.c3.fractionBad++;
      if (state?.massDev != null) { if (state.massDev > 1e-9) checks.c3.massBad++; checks.c3.massMaxDev = Math.max(checks.c3.massMaxDev, state.massDev); }
      if (v.omitted) checks.c3.omitted++;
      else checks.c3.kinds[v.kind] = (checks.c3.kinds[v.kind] ?? 0) + 1;
    }
    rows.push(out);
  }
  return { rows, checks };
}
