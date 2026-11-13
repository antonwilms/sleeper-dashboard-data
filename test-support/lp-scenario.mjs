/**
 * test-support/lp-scenario.mjs — LP-1b's hand-built scenario (task .claude/tasks/learned-projection-1b-weekly-bench.md §4.8).
 * Used by scripts/fixtures/build-inseason-routing-parity.mjs (builds the committed parity fixture) and test/learned-bench.test.mjs.
 * No I/O (Invariant 10). `SCENARIO` is plain JSON: the fixture embeds it.
 *
 * Season 2023; six synthetic teams TA–TF. TA–TD play 17 REG games over weeks 1–18 (one bye each: TA/TB week 5, TC/TD week 6);
 * TE and TF play 16 (a bye in week 7 and the TE–TF game cancelled in week 12) — a cancelled game removes a game from BOTH
 * teams, so the task's "five teams of 17, one of 16" (101 team-games, odd) cannot be built; this is the nearest consistent
 * scenario (100 team-games) and the one deviation of the scenario (hand-back). Checkpoints w ∈ {1, 4, 9}.
 *
 * Cases (each named in the task file §4.8; the id is the pid):
 *  qA1 original (a finite starterPPG ≠ ppg, so a wrong prior choice shows) · qA2 stale veteran backup (exactly 8 starts in S−2, S−1 has 3 games); TA's week-4 chart is swapped (a week-w
 *  chart that differs from the previous game's) · qB1 original → backup who started game 1 · qB2 backup → starter after the
 *  change (and a relief appearance) · qB3 app-rookie-route QB with order 3 and 10 starts · qC1 original · qC2 rookie backup with
 *  capital (starterPPG ≠ ppg) · qC3 uncharted first-game-universe QB · qC4 routeMismatch QB (arm X-rookie1p, population standard,
 *  order 3, 16 starts) · qCnt no team until week 6 · qD1 rookie, injured game-1 starter (live-chain `original`; no preseason
 *  chain) · qD2 starter; TD's week-8 game has no primary passer (so qD1's live-chain row has no state) · qE1/qE2/qM: qE2 an
 *  `original` in the preseason chain set; qM moves TE→TB in week 4 while TE's chart still lists him at slot 1 · qF1/qF2 on the
 *  16-game team (`backup`, `starter`); qF1's S−1 prior (224/16 = 14.0) is below 0.85 × the median of the preseason incumbents' priors
 *  (18.75), so the league-wide median is visible on his room's `backup` (iq 1 league-wide, 0 on TF alone). One non-QB per population × position (RB/WR/TE), the standard WR with S−1 gamesPlayed exactly 8.
 */
import {
  qbContextAt, preseasonChain, liveChainAt, appPopulationAsOf,
} from '../lib/learnedBench.mjs';
import { indexSchedule } from '../lib/learnedPanel.mjs';

export const SEASON = 2023;
export const CHECKPOINTS = Object.freeze([1, 4, 9]);
const TEAMS = ['TA', 'TB', 'TC', 'TD', 'TE', 'TF'];
const WEEKS = Array.from({ length: 18 }, (_, i) => i + 1);

function buildSchedule() {
  const games = [];
  const pairsFor = (w) => {
    const all = [['TA', 'TB'], ['TC', 'TD'], ['TE', 'TF']];
    if (w === 5) return [['TC', 'TD'], ['TE', 'TF']];
    if (w === 6) return [['TA', 'TB'], ['TE', 'TF']];
    if (w === 7) return [['TA', 'TB'], ['TC', 'TD']];
    if (w === 12) return [['TA', 'TB'], ['TC', 'TD']];
    return all;
  };
  for (const w of WEEKS) {
    pairsFor(w).forEach(([a, b], i) => {
      const [home, away] = (w + i) % 2 ? [a, b] : [b, a];
      games.push({ gameId: `${SEASON}_${String(w).padStart(2, '0')}_${away}_${home}`, season: SEASON, week: w, gameType: 'REG', homeTeam: home, awayTeam: away });
    });
  }
  games.push({ gameId: `${SEASON}_19_TB_TA`, season: SEASON, week: 19, gameType: 'POST', homeTeam: 'TA', awayTeam: 'TB' });
  return games;
}

const SCHEDULE = buildSchedule();
const gameWeeks = (team) => SCHEDULE.filter(g => g.gameType === 'REG' && (g.homeTeam === team || g.awayTeam === team)).map(g => g.week).sort((a, b) => a - b);

// pts patterns are multiples of 0.25 (exact in binary); the app rounds weekly points to 2 dp
const qbPts = (w, i) => 18 + ((w * 7 + i * 3) % 9) * 0.75;
const skillPts = (w, i) => 6 + ((w * 5 + i * 2) % 11) * 0.5;

/**
 * Week rows of one player: `team` per game week (a function of w; null → no row), `play(w)` → null (not played) or
 * { att, sack, pts } for a QB / { pts } for a skill player; `extra(w)` → optional overrides (inUniverse, status).
 */
function rowsFor({ teamOf, play, extra }) {
  const rows = [];
  for (const w of WEEKS) {
    const team = teamOf(w);
    if (team == null || !gameWeeks(team).includes(w)) continue;
    const pl = play(w);
    const ex = extra?.(w) ?? {};
    rows.push({
      w, team, played: pl != null, pts: pl?.pts ?? null, att: pl?.att ?? 0, sack: pl?.sack ?? 0, inUniverse: ex.inUniverse ?? true,
      ...(ex.status ? { status: ex.status } : {}),
    });
  }
  return rows;
}

const only = (team) => () => team;
const starter = (from, to, i, att = 30) => (w) => (w >= from && w <= to ? { att: att + (w % 5), sack: w % 3, pts: qbPts(w, i) } : null);

function qb(id, { team, draftYear, m1 = null, m2 = null, b1, rows }) {
  return { id, pos: 'QB', draftYear, m1, m2, b1, rows };
}

const QBS = [
  // ── TA
  qb('qA1', { team: 'TA', draftYear: 2016, m1: { gp: 17, gs: 17, fp: 340 }, m2: { gp: 17, gs: 17, fp: 300 }, b1: { arm: 'P', ppg: 19, starterPPG: 21.5 },
    rows: rowsFor({ teamOf: only('TA'), play: starter(1, 18, 1) }) }),
  qb('qA2', { team: 'TA', draftYear: 2017, m1: { gp: 3, gs: 0, fp: 20 }, m2: { gp: 16, gs: 8, fp: 210 }, b1: { arm: 'X-short', ppg: 11, starterPPG: null },
    rows: rowsFor({ teamOf: only('TA'), play: () => null }) }),
  // ── TB
  qb('qB1', { team: 'TB', draftYear: 2015, m1: { gp: 16, gs: 16, fp: 300 }, m2: { gp: 16, gs: 16, fp: 280 }, b1: { arm: 'P', ppg: 17.5, starterPPG: null },
    rows: rowsFor({ teamOf: only('TB'), play: starter(1, 3, 2, 28) }) }),
  qb('qB2', { team: 'TB', draftYear: 2018, m1: { gp: 10, gs: 2, fp: 120 }, m2: { gp: 6, gs: 0, fp: 40 }, b1: { arm: 'P', ppg: 11.5, starterPPG: null },
    rows: rowsFor({ teamOf: only('TB'), play: (w) => (w === 2 ? { att: 3, sack: 0, pts: 1.5 } : starter(4, 18, 3)(w)) }) }),
  qb('qB3', { team: 'TB', draftYear: 2022, m1: { gp: 16, gs: 10, fp: 180 }, m2: null, b1: { arm: 'X-rookie1p', ppg: 12, starterPPG: 14 },
    rows: rowsFor({ teamOf: only('TB'), play: () => null }) }),
  // ── TC
  qb('qC1', { team: 'TC', draftYear: 2014, m1: { gp: 16, gs: 16, fp: 320 }, m2: { gp: 16, gs: 16, fp: 310 }, b1: { arm: 'P', ppg: 18.5, starterPPG: null },
    rows: rowsFor({ teamOf: only('TC'), play: starter(1, 18, 4) }) }),
  qb('qC2', { team: 'TC', draftYear: 2023, b1: { arm: 'X-rookie0', ppg: 8, starterPPG: 14 },
    rows: rowsFor({ teamOf: only('TC'), play: () => null }) }),
  qb('qC3', { team: 'TC', draftYear: 2020, m1: { gp: 4, gs: 0, fp: 40 }, b1: { arm: 'X-rookie1p', ppg: 6, starterPPG: null },
    rows: rowsFor({ teamOf: only('TC'), play: () => null }) }),
  qb('qC4', { team: 'TC', draftYear: 2016, m1: { gp: 16, gs: 16, fp: 250 }, m2: { gp: 16, gs: 16, fp: 240 }, b1: { arm: 'X-rookie1p', ppg: 13, starterPPG: 15 },
    rows: rowsFor({ teamOf: only('TC'), play: () => null }) }),
  qb('qCnt', { team: 'TC', draftYear: 2022, b1: { arm: 'X-rookie0', ppg: 5, starterPPG: null },
    rows: rowsFor({ teamOf: (w) => (w >= 6 ? 'TC' : null), play: () => null }) }),
  // ── TD
  qb('qD1', { team: 'TD', draftYear: 2023, b1: { arm: 'X-rookie0', ppg: 9, starterPPG: 15 },
    rows: rowsFor({
      teamOf: only('TD'), play: starter(1, 1, 5, 25),
      extra: (w) => (w >= 2 && w <= 3 ? { status: 'RES' } : {}),
    }) }),
  qb('qD2', { team: 'TD', draftYear: 2016, m1: { gp: 14, gs: 14, fp: 260 }, m2: { gp: 15, gs: 15, fp: 270 }, b1: { arm: 'P', ppg: 17, starterPPG: null },
    // week 8: played with no dropbacks — TD's week-8 game has no primary passer
    rows: rowsFor({ teamOf: only('TD'), play: (w) => (w === 8 ? { att: 0, sack: 0, pts: 0 } : starter(2, 18, 6)(w)) }) }),
  // ── TE (16 games)
  qb('qE1', { team: 'TE', draftYear: 2015, m1: { gp: 16, gs: 16, fp: 290 }, m2: { gp: 16, gs: 16, fp: 285 }, b1: { arm: 'P', ppg: 18, starterPPG: null },
    rows: rowsFor({ teamOf: only('TE'), play: () => null }) }),
  qb('qE2', { team: 'TE', draftYear: 2022, m1: { gp: 9, gs: 3, fp: 100 }, b1: { arm: 'X-rookie1p', ppg: 10, starterPPG: 13 },
    rows: rowsFor({ teamOf: only('TE'), play: starter(1, 18, 7) }) }),
  qb('qM', { team: 'TE', draftYear: 2019, m1: { gp: 6, gs: 2, fp: 60 }, m2: { gp: 12, gs: 6, fp: 140 }, b1: { arm: 'X-short', ppg: 9, starterPPG: null },
    rows: rowsFor({ teamOf: (w) => (w <= 3 ? 'TE' : 'TB'), play: () => null }) }),
  // ── TF (16 games)
  qb('qF1', { team: 'TF', draftYear: 2015, m1: { gp: 16, gs: 14, fp: 224 }, m2: { gp: 16, gs: 16, fp: 280 }, b1: { arm: 'P', ppg: 16, starterPPG: null },
    rows: rowsFor({ teamOf: only('TF'), play: starter(1, 2, 8) }) }),
  qb('qF2', { team: 'TF', draftYear: 2018, m1: { gp: 10, gs: 3, fp: 130 }, b1: { arm: 'P', ppg: 12, starterPPG: null },
    rows: rowsFor({ teamOf: only('TF'), play: starter(3, 18, 9) }) }),
];

const POPULATIONS = ['std', 'short', 'r0', 'r1p'];
const POS = ['RB', 'WR', 'TE'];

function skill(pos, kind, idx) {
  const id = `${pos.toLowerCase()}${kind[0].toUpperCase()}${kind.slice(1)}`;
  const team = TEAMS[idx % TEAMS.length];
  const base = { id, pos, rows: null };
  const careers = {
    std: { draftYear: 2019, m1: { gp: 15, gs: 12, fp: 150 }, m2: { gp: 16, gs: 14, fp: 160 }, b1: { arm: 'P', ppg: 9 + idx * 0.25, starterPPG: null } },
    std8: { draftYear: 2019, m1: { gp: 8, gs: 4, fp: 80 }, m2: { gp: 16, gs: 14, fp: 170 }, b1: { arm: 'P', ppg: 10, starterPPG: null } },
    short: { draftYear: 2019, m1: { gp: 3, gs: 1, fp: 20 }, m2: { gp: 14, gs: 10, fp: 150 }, b1: { arm: 'X-short', ppg: 7 + idx * 0.25, starterPPG: null } },
    r0: { draftYear: 2023, m1: null, m2: null, b1: { arm: 'X-rookie0', ppg: 5 + idx * 0.25, starterPPG: null } },
    r1p: { draftYear: 2022, m1: { gp: 10, gs: 4, fp: 60 }, m2: null, b1: { arm: 'X-rookie1p', ppg: 6 + idx * 0.25, starterPPG: null } },
  }[kind];
  // plays weeks 1–3 and 6–8: n = 0 at w = 1, 3 at w = 4, 6 at w = 9
  const rows = rowsFor({ teamOf: only(team), play: (w) => ([1, 2, 3, 6, 7, 8].includes(w) ? { pts: skillPts(w, idx) } : null) });
  return { ...base, ...careers, rows };
}

const SKILLS = [];
{
  let idx = 0;
  for (const kind of POPULATIONS) for (const pos of POS) SKILLS.push(skill(pos, kind, idx++));
  SKILLS.push(skill('WR', 'std8', idx++));
}

function buildCharts() {
  const charts = {};
  const chart = (T, w) => {
    switch (T) {
      case 'TA': return w === 4 ? ['qA2', 'qA1'] : ['qA1', 'qA2'];
      case 'TB': return w <= 3 ? ['qB1', 'qB2', 'qB3'] : ['qB2', 'qB1', 'qB3'];
      case 'TC': return ['qC1', 'qC2', 'qC4'];
      case 'TD': return w === 1 ? ['qD1', 'qD2'] : ['qD2', 'qD1'];
      case 'TE': return w <= 3 ? ['qE1', 'qE2', 'qM'] : ['qM', 'qE1', 'qE2'];
      case 'TF': return w <= 2 ? ['qF1', 'qF2'] : ['qF2', 'qF1'];
      default: return null;
    }
  };
  for (const T of TEAMS) for (const w of gameWeeks(T)) (charts[w] ??= {})[T] = chart(T, w);
  return charts;
}

export const SCENARIO = JSON.parse(JSON.stringify({
  season: SEASON,
  checkpoints: CHECKPOINTS,
  teams: TEAMS,
  schedule: SCHEDULE,
  charts: buildCharts(),
  players: [...QBS, ...SKILLS],
}));

// ─── scenario → the data replay's inputs ─────────────────────────────────────────────────────────

const careerRow = (c) => ({ gamesPlayed: c.gp, gamesStarted: c.gs, fantasyPoints: c.fp });

/** careerStats in the app's / the loader's shape: { [season]: { [pid]: { gamesPlayed, gamesStarted, fantasyPoints } } }. */
export function scenarioCareerStats(scenario) {
  const S = scenario.season;
  const out = { [S - 2]: {}, [S - 1]: {} };
  for (const p of scenario.players) {
    if (p.m2) out[S - 2][p.id] = careerRow(p.m2);
    if (p.m1) out[S - 1][p.id] = careerRow(p.m1);
  }
  return out;
}

/** → buildBenchwSeason's inputs minus `constantsFile` / `models`, in the real files' shapes. */
export function scenarioToDataInputs(scenario) {
  const S = scenario.season;
  const weekRows = [];
  const bench = [];
  const seasons = [];
  const gl = {};
  const roster = {};
  for (const p of scenario.players) {
    bench.push({ pid: p.id, S, position: p.pos, b1: { covered: true, arm: p.b1.arm, ppg: p.b1.ppg, ppgWeekly: p.b1.ppg, starterPPG: p.b1.starterPPG } });
    seasons.push({ pid: p.id, S, position: p.pos, draftYear: p.draftYear });
    for (const r of p.rows) {
      weekRows.push({ pid: p.id, S, w: r.w, position: p.pos, team: r.team, played: r.played, pts: r.pts, inUniverse: r.inUniverse });
      (roster[p.id] ??= {})[String(r.w)] = [[r.team, r.status ?? 'ACT']];
      if (p.pos === 'QB' && (r.att > 0 || r.sack > 0)) {
        (gl[p.id] ??= { gsisId: `g-${p.id}`, name: p.id, position: 'QB', games: [] }).games.push({ week: r.w, seasonType: 'REG', team: r.team, attempts: r.att, sacksSuffered: r.sack });
      }
    }
  }
  // a postseason line must never reach a primary (the REG filter)
  (gl.qB1 ??= { gsisId: 'g-qB1', name: 'qB1', position: 'QB', games: [] }).games.push({ week: 19, seasonType: 'POST', team: 'TB', attempts: 40, sacksSuffered: 0 });
  return {
    S, weekRows, bench, seasons,
    gamelogsFile: { season: S, players: gl },
    scheduleFile: { season: S, games: scenario.schedule },
    depthFile: { season: S, weeks: JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(scenario.charts).map(([w, byTeam]) => [w, Object.fromEntries(Object.entries(byTeam).map(([T, qbs]) => [T, { QB: qbs }]))])))) },
    rosterweeklyFile: { season: S, players: roster },
    careerStats: scenarioCareerStats(scenario),
  };
}

// ─── the chain values (derived by the DATA functions; T-APP-2 proves them against the app) ───────

/** → { pre, pre16, live: { w: {…} } } in the fixture's `chain` shape, from the data functions, plus the inputs the app is fed. */
export function scenarioChains(scenario, models) {
  const d = scenarioToDataInputs(scenario);
  const S = scenario.season;
  const dyOf = new Map(d.seasons.map(r => [r.pid, r.draftYear]));
  const draftYearOf = (pid) => dyOf.get(pid) ?? null;
  const populationOf = (pid) => appPopulationAsOf({ pid, careerStats: d.careerStats, S, yearsExp: draftYearOf(pid) != null ? S - draftYearOf(pid) : null });
  const sched = indexSchedule(d.scheduleFile);
  const byPid = new Map();
  for (const r of d.weekRows) { if (!byPid.has(r.pid)) byPid.set(r.pid, []); byPid.get(r.pid).push(r); }
  for (const rows of byPid.values()) rows.sort((a, b) => a.w - b.w);
  const rowsOf = (pid) => byPid.get(pid) ?? [];
  const qbIds = scenario.players.filter(p => p.pos === 'QB').map(p => p.id);
  const firstGameQbs = [];
  for (const T of sched.teams()) {
    const W1 = sched.weeks(T)[0];
    for (const pid of qbIds) if (rowsOf(pid).some(r => r.w === W1 && r.inUniverse && r.team === T)) firstGameQbs.push({ id: pid, team: T });
  }
  const preArgs = { S, depthFile: d.depthFile, firstGameQbs, careerStats: d.careerStats, draftYearOf, populationOf, models };
  const toObj = (m) => Object.fromEntries([...m].map(([id, v]) => [id, { basis: v.basis, role: v.role, share: v.role === 'backup' ? v.share : null }]));
  const pre = preseasonChain(preArgs);
  const pre16 = preseasonChain({ ...preArgs, games: 16 });
  const live = {};
  const ctxAt = {};
  for (const w of scenario.checkpoints) {
    const ctx = new Map(qbIds.map(x => [x, qbContextAt({ S, w, x, rowsOf, sched, depthFile: d.depthFile, rosterPlayers: d.rosterweeklyFile.players })]));
    ctxAt[w] = ctx;
    live[w] = Object.fromEntries(liveChainAt({
      S, qbIds, teamOf: (id) => ctx.get(id).T, orderOf: (id) => ctx.get(id).order, careerStats: d.careerStats, draftYearOf, populationOf, models,
    }));
  }
  // chart team and week-1 slot of the preseason room, for the app's playerMap
  const preRoom = new Map();
  for (const [T, byPos] of Object.entries(d.depthFile.weeks[1] ?? {})) byPos.QB.forEach((pid, i) => { if (pid != null && !preRoom.has(pid)) preRoom.set(pid, { team: T, order: i + 1 }); });
  for (const q of firstGameQbs) if (!preRoom.has(q.id)) preRoom.set(q.id, { team: q.team, order: null });
  return { pre: toObj(pre), pre16: toObj(pre16), live, preRoom, ctxAt, draftYearOf, populationOf, d };
}

// ─── scenario → the app's arguments (weeks < w only) ─────────────────────────────────────────────

/**
 * → { qbLiveStatesArgs, scoringArgs } for the app's `buildQbLiveStates` / `buildScoringPosteriors` at checkpoint w.
 * `chain` = the fixture's `chain` ({ pre: { id: { basis } }, live: { w: { id: basis } } }); `ctx` = Map<qbPid, qbContextAt(...)>.
 */
export function scenarioToAppInputs(scenario, w, chain, ctx) {
  const S = scenario.season;
  const d = scenarioToDataInputs(scenario);
  const sched = indexSchedule(d.scheduleFile);
  const weeksOut = [];
  for (let wk = 1; wk < w; wk++) {
    const rows = {};
    for (const T of scenario.teams) {
      const g = sched.game(T, wk);
      if (g) rows[`TEAM_${T}`] = { team: T, opponent: g.homeTeam === T ? g.awayTeam : g.homeTeam };
    }
    for (const p of scenario.players) {
      const r = p.rows.find(v => v.w === wk);
      if (!r || !r.played) continue;
      rows[p.id] = { team: r.team, stats: { pass_att: r.att, pass_sack: r.sack, gp: 1, fx: r.pts } };
    }
    weeksOut.push({ week: wk, rows });
  }
  const careerStats = scenarioCareerStats(scenario);
  const playerMap = {};
  const seasonProjections = {};
  const players = {};
  const frozenPlayers = {};
  const starterPPG = {};
  const qbChain = {};
  for (const p of scenario.players) {
    const rows = p.rows.filter(r => r.w < w);
    const played = rows.filter(r => r.played);
    let team, order = null, injured = false;
    if (p.pos === 'QB') ({ T: team, order, injured } = ctx.get(p.id));
    else {
      const cur = p.rows.find(r => r.w === w);
      team = cur && cur.inUniverse ? cur.team : ([...rows].reverse()[0]?.team ?? null);
    }
    playerMap[p.id] = {
      position: p.pos, team, years_exp: p.draftYear != null ? S - p.draftYear : null, depth_chart_order: order, injury_status: injured ? 'IR' : null,
    };
    seasonProjections[p.id] = { projectedPPG: p.b1.ppg, ...(p.pos === 'QB' ? { factors: { qbTakeoverBasis: chain.live[w]?.[p.id] ?? 'not-evaluated' } } : {}) };
    frozenPlayers[p.id] = p.b1.ppg;
    if (p.pos === 'QB') {
      if (Number.isFinite(p.b1.starterPPG)) starterPPG[p.id] = p.b1.starterPPG;
      if (chain.pre[p.id]?.basis === 'chain') qbChain[p.id] = true;
    }
    if (played.length) players[p.id] = { gamesPlayed: played.length, fantasyPoints: played.reduce((a, r) => a + r.pts, 0), scoringBasis: 'league' };
  }
  return {
    qbLiveStatesArgs: {
      qbWeekly: { complete: true, failedWeeks: [], weeks: weeksOut }, playerMap, careerStats, dataSeason: S - 1, scoringSettings: { fx: 1 }, preseason: {},
    },
    scoringArgs: {
      seasonProjections, careerStats, dataSeason: S - 1, playerMap,
      currentSeasonTotals: { season: S, complete: true, players },
      projectionBasis: 'league',
      frozenPrior: { status: 'ok', dateKey: 'fixture', players: frozenPlayers, starterPPG, qbChain },
    },
  };
}
