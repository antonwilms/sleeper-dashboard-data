/**
 * lib/learnedPanel.mjs — LP-1a research panel: pure builders (no I/O).
 *
 * Key vector, per-player-week rows, weekly/season universes, depth slot, line sign, cohort labels and
 * the spike SD. The adapter (scripts/learned-panel-run.mjs) feeds it files; nothing here reads disk.
 * Task file: .claude/tasks/learned-projection-1a-harness.md §4.2–§5.5. Research only — never imported by
 * a served path.
 */
import {
  scoreSeasonStats, withFirstDownBonus, seasonEmitsFirstDownBonus, NON_ADDITIVE_KEYS,
} from './fantasyPoints.mjs';
import { MISSED_ROSTER_STATUSES } from './absence.mjs';
import { resolveSnapCounts } from './panel.mjs';
import { cohortAge } from './dynastyBacktest.mjs';

export const SKILL_POSITIONS = Object.freeze(['QB', 'RB', 'WR', 'TE']);
const SKILL = new Set(SKILL_POSITIONS);
/** §5.1 ADMIT — a listing with any other status admits nothing. */
export const ADMIT = MISSED_ROSTER_STATUSES;
/** F4: 2012–2015 rosterweekly `status` is a season-level value reflecting later-season state. */
export const ORACLE_MAX_SEASON = 2015;
export const RAW_KEYS = Object.freeze([
  'pass_att', 'pass_cmp', 'rush_att', 'rec_tgt', 'rec_air_yd', 'rec_rz_tgt', 'rush_rz_att', 'pass_rz_att', 'pass_sack',
]);
export const SPIKE_SEASONS = Object.freeze([2012, 2013]);
export const OS_RISE = 0.06;
export const SPIKE_OS_BAND = 0.03;
const EPS = 1e-9;

export class LearnedLookAheadError extends Error {
  constructor(message) { super(message); this.name = 'LearnedLookAheadError'; }
}

// ─── Key vector / scoring ────────────────────────────────────────────────────────────────────────

/** The stats object a week's scoring reads: first downs derived when the season does not emit them. */
export function scoredStats(statsWeek, position, deriveFirstDowns) {
  return deriveFirstDowns ? withFirstDownBonus(statsWeek ?? {}, position) : (statsWeek ?? {});
}

/** Adds to `seen` every scored key that is non-zero in this week (derived first downs included). */
export function collectNonZeroKeys(seen, statsWeek, position, deriveFirstDowns, scoring) {
  const s = scoredStats(statsWeek, position, deriveFirstDowns);
  for (const [k, w] of Object.entries(scoring)) {
    if (!w || NON_ADDITIVE_KEYS.has(k)) continue;
    if (s[k]) seen.add(k);
  }
}

/** meta.keys: non-zero-weight scored keys that appear non-zero in ≥ 1 skill player-week, minus NON_ADDITIVE_KEYS, sorted. */
export function finalizeKeys(seen, scoring) {
  return [...seen].filter(k => scoring[k] && !NON_ADDITIVE_KEYS.has(k)).sort();
}

/** x aligned to `keys`: the week's value of each key after first-down derivation, 0 for an absent key. */
export function weekVector(statsWeek, position, deriveFirstDowns, keys) {
  const s = scoredStats(statsWeek, position, deriveFirstDowns);
  return keys.map(k => s[k] ?? 0);
}

export function weekPoints(statsWeek, scoring, position, deriveFirstDowns) {
  return scoreSeasonStats(statsWeek ?? {}, scoring, { position, deriveFirstDowns });
}

/** Round to 2 dp the way the scorer does. */
export function dot(x, keys, scoring) {
  let t = 0;
  keys.forEach((k, i) => { t += x[i] * scoring[k]; });
  return Math.round(t * 100) / 100;
}

// ─── Schedule ────────────────────────────────────────────────────────────────────────────────────

/** REG-game index: `game(team, w)`, sorted game weeks per team, game counts. */
export function indexSchedule(scheduleFile) {
  const byTeamWeek = new Map();
  const weeksByTeam = new Map();
  let maxWeek = 0;
  for (const g of scheduleFile?.games ?? []) {
    if (g.gameType !== 'REG') continue;
    maxWeek = Math.max(maxWeek, g.week);
    for (const t of [g.homeTeam, g.awayTeam]) {
      byTeamWeek.set(`${t}|${g.week}`, g);
      if (!weeksByTeam.has(t)) weeksByTeam.set(t, []);
      weeksByTeam.get(t).push(g.week);
    }
  }
  for (const arr of weeksByTeam.values()) arr.sort((a, b) => a - b);
  return {
    maxWeek,
    game: (team, w) => byTeamWeek.get(`${team}|${w}`) ?? null,
    weeks: (team) => weeksByTeam.get(team) ?? [],
    teams: () => [...weeksByTeam.keys()],
    teamGames: (team) => (weeksByTeam.get(team) ?? []).length,
  };
}

/**
 * opp / home / roof and the line re-signed toward `team`. F1: the stored `spreadLine` is positive when the HOME team is
 * favoured, so it is kept for the home team and negated for the away team (2016_01_CAR_DEN stores −3: CAR row +3, DEN row −3).
 */
export function gameContext(game, team) {
  if (!game) return { opp: null, home: null, roof: null, spreadLine: null, totalLine: null, gameId: null };
  const home = game.homeTeam === team;
  const sp = game.spreadLine;
  return {
    opp: home ? game.awayTeam : game.homeTeam,
    home,
    roof: game.roof ?? null,
    spreadLine: Number.isFinite(sp) ? (home ? sp : -sp) : null,
    totalLine: Number.isFinite(game.totalLine) ? game.totalLine : null,
    gameId: game.gameId ?? null,
  };
}

/** The team's previous REG game week before `w`; a bye is skipped; its first game → w itself (kickoff roster). */
export function previousGameWeek(weeks, w) {
  let prev = null;
  for (const x of weeks) { if (x < w) prev = x; else break; }
  return prev ?? w;
}

// ─── Depth ───────────────────────────────────────────────────────────────────────────────────────

/** 1-based index of pid in depth weeks[w][team][position]; null slots KEEP their place; null if absent. */
export function depthSlot(depthFile, w, team, position, pid) {
  const arr = depthFile?.weeks?.[w]?.[team]?.[position];
  if (!Array.isArray(arr)) return null;
  const i = arr.indexOf(pid);
  return i < 0 ? null : i + 1;
}

export function depthStamp(depthFile, w, team) {
  return depthFile?.weeks?.[w]?.[team]?.dt ?? null;
}

// ─── Universes (§5.1) ────────────────────────────────────────────────────────────────────────────

const admitted = (pairs, team) => (pairs ?? []).some(([t, s]) => t === team && ADMIT.has(s));

/**
 * Weekly universe: Map `${team}|${w}` → Set(pid) for every team with a REG game in w. Member = a skill pid with an ADMIT listing on
 * the team in the team's previous game week w′ (kickoff roster for the first game), or whose season-totals row has that team and
 * status 'P' in w′. Membership uses presence in the admitted set only, never which status.
 */
export function weeklyUniverse({ sched, rosterPlayers, totals, positionOf }) {
  const admitIdx = new Map();   // `${w}|${team}` → Set(pid)
  const add = (w, team, pid) => {
    const k = `${w}|${team}`;
    if (!admitIdx.has(k)) admitIdx.set(k, new Set());
    admitIdx.get(k).add(pid);
  };
  for (const [pid, byWeek] of Object.entries(rosterPlayers ?? {})) {
    if (!SKILL.has(positionOf(pid))) continue;
    for (const [w, pairs] of Object.entries(byWeek)) {
      for (const [t, s] of pairs) if (ADMIT.has(s)) add(Number(w), t, pid);
    }
  }
  for (const [pid, row] of Object.entries(totals ?? {})) {
    if (pid.startsWith('TEAM_') || !SKILL.has(positionOf(pid)) || !row?.team || !Array.isArray(row.weeklyStatus)) continue;
    row.weeklyStatus.forEach((s, i) => { if (s === 'P') add(i + 1, row.team, pid); });
  }
  const out = new Map();
  for (const team of sched.teams()) {
    const weeks = sched.weeks(team);
    for (const w of weeks) {
      const wp = previousGameWeek(weeks, w);
      out.set(`${team}|${w}`, admitIdx.get(`${wp}|${team}`) ?? new Set());
    }
  }
  return out;
}

/** Season universe: skill pids with an ADMIT listing in week 1 of S (any team). */
export function seasonUniverse({ rosterPlayers, positionOf }) {
  const out = new Set();
  for (const [pid, byWeek] of Object.entries(rosterPlayers ?? {})) {
    if (!SKILL.has(positionOf(pid))) continue;
    if ((byWeek['1'] ?? []).some(([, s]) => ADMIT.has(s))) out.add(pid);
  }
  return out;
}

// ─── Weekly rows (§4.3 weeks.jsonl; cohort filled by labelCohorts) ───────────────────────────────

/**
 * All (pid, w) rows of season S: every REG week in which the player's team has a game AND (he is in the weekly universe OR he
 * played). A played week is always a row; `inUniverse` carries membership. → rows[] (cohort = []).
 */
export function buildWeekRows({ S, positionOf, totals, rosterPlayers, sched, depthFile, keys, scoring }) {
  const deriveFirstDowns = !seasonEmitsFirstDownBonus(totals);
  const universe = weeklyUniverse({ sched, rosterPlayers, totals, positionOf });
  const oracle = S <= ORACLE_MAX_SEASON;
  const memberTeams = new Map();   // `${w}|${pid}` → [team]
  for (const [k, set] of universe) {
    const [team, w] = k.split('|');
    for (const pid of set) {
      const mk = `${w}|${pid}`;
      if (!memberTeams.has(mk)) memberTeams.set(mk, []);
      memberTeams.get(mk).push(team);
    }
  }
  const candidates = new Map();   // w → Set(pid)
  const addCand = (w, pid) => { if (!candidates.has(w)) candidates.set(w, new Set()); candidates.get(w).add(pid); };
  for (const mk of memberTeams.keys()) { const [w, pid] = mk.split('|'); addCand(Number(w), pid); }
  for (const [pid, row] of Object.entries(totals ?? {})) {
    if (pid.startsWith('TEAM_') || !SKILL.has(positionOf(pid)) || !Array.isArray(row?.weeklyStatus)) continue;
    row.weeklyStatus.forEach((s, i) => { if (s === 'P') addCand(i + 1, pid); });
  }
  const rows = [];
  for (let w = 1; w <= sched.maxWeek; w++) {
    for (const pid of candidates.get(w) ?? []) {
      const position = positionOf(pid);
      const trow = totals?.[pid] ?? null;
      const status = Array.isArray(trow?.weeklyStatus) ? (trow.weeklyStatus[w - 1] ?? null) : null;
      const played = status === 'P';
      const rwPairs = rosterPlayers?.[pid]?.[String(w)] ?? null;
      const rwTeam = rwPairs?.[0]?.[0] ?? null;
      let team = null, teamSource = null, game = null;
      if (rwTeam && sched.game(rwTeam, w)) { team = rwTeam; teamSource = 'rosterweekly'; }
      else if (trow?.team && sched.game(trow.team, w)) { team = trow.team; teamSource = 'season-totals'; }
      else {
        const t = (memberTeams.get(`${w}|${pid}`) ?? [])[0];
        if (t) { team = t; teamSource = 'universe'; }
        else if (played) { team = rwTeam ?? trow?.team ?? null; teamSource = rwTeam ? 'rosterweekly' : 'season-totals'; }
      }
      if (team == null) continue;
      game = sched.game(team, w);
      // F7: true when the team used is the §4.3 first choice (the rosterweekly team if listed, else the season-totals team) and it has a game in w.
      const teamFirstChoice = game != null && team === (rwTeam ?? trow?.team ?? null);
      const inUniverse = (universe.get(`${team}|${w}`) ?? new Set()).has(pid);
      if (!inUniverse && !played) continue;
      const ctx = gameContext(game, team);
      const sw = played ? (trow.weeklyStats?.[String(w)] ?? {}) : null;
      let raw = null;
      if (played) { raw = {}; for (const k of RAW_KEYS) if (sw[k] !== undefined) raw[k] = sw[k]; }
      rows.push({
        pid, S, w, position, team, teamSource, teamFirstChoice, noGame: game == null,
        opp: ctx.opp, home: ctx.home, roof: ctx.roof, spreadLine: ctx.spreadLine, totalLine: ctx.totalLine,
        status, played,
        x: played ? weekVector(sw, position, deriveFirstDowns, keys) : null,
        pts: played ? weekPoints(sw, scoring, position, deriveFirstDowns) : null,
        raw,
        rw: rwPairs, rwOracle: oracle,
        depthOrder: depthSlot(depthFile, w, team, position, pid), depthDt: depthStamp(depthFile, w, team),
        inUniverse, cohort: [],
      });
    }
  }
  return rows;
}

// ─── Season rows (§4.3 seasons.jsonl) ───────────────────────────────────────────────────────────

/** Schedule games of the modal team: 16 through 2020, 17 after (used when a player has no team). */
export const modalTeamGames = (S) => (S <= 2020 ? 16 : 17);

/**
 * One row per (pid, S) for every skill pid with a season-totals row OR in the season universe (an ADMIT week-1 listing). A pid with
 * no S row gets outcome 0 points, 0 games. `team` = the S row's team, else the rosterweekly week-1 team, else null; `teamGames` =
 * the REG games of that team in the schedule (null team → the season's modal count).
 */
export function buildSeasonRows({ S, positionOf, totals, rosterPlayers, sched, playerIds, snaps }) {
  const univ = seasonUniverse({ rosterPlayers, positionOf });
  const pids = new Set(univ);
  for (const pid of Object.keys(totals ?? {})) if (!pid.startsWith('TEAM_') && SKILL.has(positionOf(pid))) pids.add(pid);
  const out = [];
  for (const pid of [...pids].sort()) {
    const trow = totals?.[pid] ?? null;
    const team = trow?.team ?? rosterPlayers?.[pid]?.['1']?.[0]?.[0] ?? null;
    const tg = team != null ? sched.teamGames(team) : 0;
    const b = playerIds?.bySleeper?.[pid] ?? null;
    const sc = resolveSnapCounts(pid, trow, snaps);
    out.push({
      pid, S, position: positionOf(pid), hasRow: !!trow, gamesPlayed: trow?.gamesPlayed ?? 0,
      fantasyPoints: trow ? (trow.fantasyPoints ?? 0) : 0,
      team, teamGames: tg > 0 ? tg : modalTeamGames(S), age: cohortAge(b?.birthdate, S - 1),
      draftYear: b?.draftYear ?? null, draftRound: b?.draftRound ?? null, draftOvr: b?.draftOvr ?? b?.draftPick ?? null,
      undrafted: b?.undrafted ?? null,
      offPct: sc.offSnp != null && sc.tmOffSnp != null && sc.tmOffSnp > 0 ? sc.offSnp / sc.tmOffSnp : null,
      inSeasonUniverse: univ.has(pid),
    });
  }
  return out;
}

// ─── Team sums ───────────────────────────────────────────────────────────────────────────────────

export const TEAM_SUM_KEYS = Object.freeze(['rec_tgt', 'rush_att', 'pass_att', 'rec_rz_tgt', 'rush_rz_att']);

/** Map `${team}|${w}` → sums of TEAM_SUM_KEYS over the played rows of that team-week. */
export function teamSums(rows) {
  const m = new Map();
  for (const r of rows) {
    if (!r.played || !r.raw) continue;
    const k = `${r.team}|${r.w}`;
    if (!m.has(k)) m.set(k, Object.fromEntries(TEAM_SUM_KEYS.map(x => [x, 0])));
    const t = m.get(k);
    for (const key of TEAM_SUM_KEYS) t[key] += r.raw[key] ?? 0;
  }
  return m;
}

const RATE_FIELD = /(PerPlay|Rate|rate)$|^proe$/;
/** teamcontext off/def: component fields only — stored rates are dropped (CR-10). */
export function componentFields(o) {
  const out = {};
  for (const [k, v] of Object.entries(o ?? {})) if (!RATE_FIELD.test(k)) out[k] = v;
  return out;
}

export function buildTeamRows({ S, teamcontext, rows }) {
  const sums = teamSums(rows);
  const out = [];
  for (const [team, t] of Object.entries(teamcontext?.teams ?? {})) {
    for (const g of t.games ?? []) {
      if (g.seasonType !== 'REG') continue;
      out.push({
        team, S, w: g.week, opp: g.opponent, off: componentFields(g.off), def: componentFields(g.def),
        sums: sums.get(`${team}|${g.week}`) ?? Object.fromEntries(TEAM_SUM_KEYS.map(x => [x, 0])),
      });
    }
  }
  return out;
}

// ─── Cohorts (§5.5; labels from actuals only) ────────────────────────────────────────────────────

/** Opportunity share os(w) = (rec_tgt + rush_att) / team sum, RB/WR/TE played weeks. */
export function opportunityShares(rows) {
  const sums = teamSums(rows);
  const os = new Map();   // `${pid}|${w}` → os
  for (const r of rows) {
    if (!r.played || !r.raw || r.position === 'QB') continue;
    const den = (sums.get(`${r.team}|${r.w}`)?.rec_tgt ?? 0) + (sums.get(`${r.team}|${r.w}`)?.rush_att ?? 0);
    if (den > 0) os.set(`${r.pid}|${r.w}`, ((r.raw.rec_tgt ?? 0) + (r.raw.rush_att ?? 0)) / den);
  }
  return os;
}

/** Mean os of a player's played weeks of the season (used as the next season's `prevOs` fallback). */
export function seasonMeanOs(rows) {
  const os = opportunityShares(rows);
  const acc = new Map();
  for (const [k, v] of os) {
    const pid = k.split('|')[0];
    const a = acc.get(pid) ?? [0, 0];
    a[0] += v; a[1] += 1;
    acc.set(pid, a);
  }
  return new Map([...acc].map(([pid, [s, n]]) => [pid, s / n]));
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

/**
 * Labels the rows of ONE season in place: `cohort` ⊆ ['a','b','c'].
 * a — role riser: the FIRST week w0 starting three consecutive played weeks with os ≥ os0 + 0.06 each, no higher-os0 same-team
 *     same-position teammate missing any of the three. The label sits on the w0 row.
 * b — injury fill-in: a higher-os0 teammate is 'D' for ≥ 1 game week then 'P'; the fill-in's mean os while it lasted ≥ os0 + 0.06;
 *     the label sits on the fill-in's first two played rows at/after the return week.
 * c — one-week spike: pts ≥ own mean over ≥ 3 prior played weeks + 2 × spikeSd[position] and (RB/WR/TE) os within ±0.03 of os0.
 *     The label sits on the spike row. QBs have no os (→ no os0 → no label, §5.5), so a QB is never labelled (c).
 * os0 = mean os over the player's played weeks BEFORE the window; fewer than 2 → `prevOs` (his previous season's mean os); none → no label.
 * `spikeSd` is the caller's pre-computed constant (never a function of the labelled season).
 */
export function labelCohorts(rows, { spikeSd, prevOs = new Map() }) {
  const os = opportunityShares(rows);
  const byPid = new Map();
  for (const r of rows) { if (!byPid.has(r.pid)) byPid.set(r.pid, []); byPid.get(r.pid).push(r); }
  for (const arr of byPid.values()) arr.sort((a, b) => a.w - b.w);
  const rowAt = (pid, w) => byPid.get(pid)?.find(r => r.w === w) ?? null;

  const os0 = (pid, before) => {
    const vals = [];
    for (const r of byPid.get(pid) ?? []) {
      if (r.w >= before) break;
      const v = os.get(`${pid}|${r.w}`);
      if (v != null) vals.push(v);
    }
    if (vals.length >= 2) return mean(vals);
    return prevOs.get(pid) ?? null;
  };
  const flag = (row, c) => { if (row && !row.cohort.includes(c)) row.cohort.push(c); };

  // team|position → players (rows)
  const groups = new Map();
  for (const r of rows) {
    if (r.position === 'QB') continue;
    const k = `${r.team}|${r.position}`;
    if (!groups.has(k)) groups.set(k, new Set());
    groups.get(k).add(r.pid);
  }
  const mates = (pid, w) => {
    const r = rowAt(pid, w);
    return r ? [...(groups.get(`${r.team}|${r.position}`) ?? [])].filter(p => p !== pid) : [];
  };

  // (a) role riser
  for (const [pid, arr] of byPid) {
    if (arr[0].position === 'QB') continue;
    for (const r0 of arr) {
      const w0 = r0.w;
      const trio = [0, 1, 2].map(d => rowAt(pid, w0 + d));
      if (trio.some(r => !r || !r.played || os.get(`${pid}|${r.w}`) == null)) continue;
      const base = os0(pid, w0);
      if (base == null) continue;
      if (!trio.every(r => os.get(`${pid}|${r.w}`) >= base + OS_RISE - EPS)) continue;
      let blocked = false;
      for (const t of mates(pid, w0)) {
        const tb = os0(t, w0);
        if (tb == null || !(tb > base)) continue;
        const tr = [0, 1, 2].map(d => rowAt(t, w0 + d));
        if (tr.every(x => !x)) continue;                        // not on the team at all in the window: not a teammate then
        if (tr.some(x => !x || !x.played)) { blocked = true; break; }   // a higher-share teammate missed part of it
      }
      if (blocked) continue;
      flag(r0, 'a');
      break;
    }
  }

  // (b) injury fill-in
  for (const [tid, arr] of byPid) {
    if (arr[0].position === 'QB') continue;
    let i = 0;
    while (i < arr.length) {
      if (arr[i].status !== 'D') { i++; continue; }
      let j = i;
      while (j + 1 < arr.length && arr[j + 1].status === 'D' && arr[j + 1].w === arr[j].w + 1) j++;
      const ret = arr[j + 1];
      if (ret && ret.status === 'P') {
        const s = arr[i].w, e = arr[j].w, rw = ret.w;
        const tbase = os0(tid, s);
        for (const f of mates(tid, s)) {
          const fb = os0(f, s);
          if (tbase == null || fb == null || !(tbase > fb)) continue;
          const during = [];
          for (let w = s; w <= e; w++) { const v = os.get(`${f}|${w}`); if (v != null) during.push(v); }
          if (!during.length || !(mean(during) >= fb + OS_RISE - EPS)) continue;
          let n = 0;
          for (const r of byPid.get(f)) { if (r.w >= rw && r.played) { flag(r, 'b'); if (++n === 2) break; } }
        }
      }
      i = j + 1;
    }
  }

  // (c) one-week spike
  for (const [pid, arr] of byPid) {
    const sd = spikeSd?.[arr[0].position];
    if (!Number.isFinite(sd)) continue;
    const prior = [];
    for (const r of arr) {
      if (!r.played) continue;
      if (prior.length >= 3 && r.pts >= mean(prior) + 2 * sd - EPS) {
        const base = os0(pid, r.w), cur = os.get(`${pid}|${r.w}`);
        if (base != null && cur != null && Math.abs(cur - base) <= SPIKE_OS_BAND + EPS) flag(r, 'c');
      }
      prior.push(r.pts);
    }
  }
  return rows;
}

/**
 * Per-position SD of (pts − the player-season's mean pts) over played weeks, pooled, player-seasons with ≥ 8 played weeks, from
 * seasons 2012–2013 ONLY. `playerSeasons` = [{ season, position, pts: number[] }] — any other season is ignored (never a training
 * or test season). Population SD (ddof 0) of the pooled deviations.
 */
export function computeSpikeSd(playerSeasons) {
  const ss = { QB: 0, RB: 0, WR: 0, TE: 0 }, n = { QB: 0, RB: 0, WR: 0, TE: 0 };
  for (const ps of playerSeasons) {
    if (!SPIKE_SEASONS.includes(ps.season) || !SKILL.has(ps.position) || ps.pts.length < 8) continue;
    const m = mean(ps.pts);
    for (const v of ps.pts) { ss[ps.position] += (v - m) ** 2; n[ps.position] += 1; }
  }
  return Object.fromEntries(SKILL_POSITIONS.map(p => [p, n[p] > 0 ? Math.sqrt(ss[p] / n[p]) : null]));
}
