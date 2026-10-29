/**
 * scripts/dynasty-asof.mjs — the as-of-season-S input builder for lib/dynastyMirror.mjs (S3a, CR-32).
 *
 * Reconstructs, for a past season S, the inputs the app would have had at the end of S, with a look-ahead
 * guard: every season-keyed read goes through `asOfLoad(load, S)`, which throws `LookAheadError` for a year
 * above S. Two reads sit outside the guard on purpose and never feed `buildAsOfInputs`: S3b's outcomes
 * (`outcomeLoad`), and — after the inputs are built — the S+1 season-totals row's `team` string only
 * (`readTeamS1`). Nothing here reads an outcome season or grades anything.
 *
 * Exports:
 *   DYNASTY_ASOF_LOAD                           injectable loaders (the shapes tests stub)
 *   LookAheadError, DynastyAsOfStop
 *   asOfLoad(load, S), outcomeLoad(load)
 *   readTeamS1(load, S, pid)                    → the S+1 row's `team` string (or null), nothing else
 *   franchise(code), isChanger(teamS, teamS1)
 *   normName(s), ageOn(birthdate, isoDate)
 *   curveInputRows(...), rowGapStats(rows)      the age-gap measurement shared with the gap report
 *   buildAsOfInputs(load, S, { curveAgeMode, gamesMode }) → inputs for dynastyScoreMirror + meta
 */
import { readJson } from '../lib/io.mjs';
import { leagueBasisLoad, loadLeaguePositions } from '../lib/leagueBasis.mjs';
import { depthOrderIndex, ageOnDate } from '../lib/inSeasonEvidence.mjs';
import {
  empiricalAgeCurvesMirror, teamContextMirror, historicalTeamTotalsMirror, historicalSharesMirror,
  countSharesAboveOne,
} from '../lib/dynastyMirror.mjs';
import { LEAGUE_SCORING_FIXTURE } from './panel-run.mjs';

export const FIRST_SEASON = 2012;
/** The newest completed season; 2026.json is in progress and is never an input (CR-21). */
export const LAST_COMPLETED_SEASON = 2025;
export const SLEEPER_CAPTURE_YEAR = 2026;
export const SKILL = ['QB', 'RB', 'WR', 'TE'];
const SKILL_SET = new Set(SKILL);

/** Season-keyed loaders: a call with a year above S is look-ahead. */
export const SEASON_KEYED_LOADERS = ['loadSeasonTotals', 'loadDepth', 'loadAdvstats', 'loadSnapShare', 'loadRosterWeekly'];

export const DYNASTY_ASOF_LOAD = {
  loadSeasonTotals: (y) => readJson(`nfl/season-totals/${y}.json`),
  loadDepth: (y) => readJson(`nflverse/depth/${y}.json`),
  loadAdvstats: (y) => readJson(`nflverse/advstats/${y}.json`),
  loadSnapShare: (y) => readJson(`nflverse/snaps/${y}.json`),
  loadRosterWeekly: (y) => readJson(`nflverse/rosterweekly/${y}.json`),
  loadPlayerIds: () => readJson('nflverse/playerids.json'),
  loadRawPlayers: () => readJson('raw/-players-nfl.json'),
  loadLeaguePositionOf: () => loadLeaguePositions(),
  loadLeagueScoring: () => readJson(LEAGUE_SCORING_FIXTURE),
  loadManifest: () => readJson('manifest.json'),
};

export class LookAheadError extends Error {
  constructor(message) { super(message); this.name = 'LookAheadError'; }
}
export class DynastyAsOfStop extends Error {
  constructor(message) { super(message); this.name = 'DynastyAsOfStop'; }
}

/**
 * A copy of `load` whose season-keyed loaders throw `LookAheadError` for a year > S, and memoise otherwise.
 * Non-season-keyed loaders pass through.
 */
export function asOfLoad(load, S) {
  const wrapped = { ...load };
  for (const name of SEASON_KEYED_LOADERS) {
    if (typeof load[name] !== 'function') continue;
    const cache = new Map();
    wrapped[name] = (y) => {
      if (Number(y) > S) throw new LookAheadError(`[dynasty-asof] ${name}(${y}) is look-ahead for as-of season ${S}`);
      if (!cache.has(y)) cache.set(y, load[name](y));
      return cache.get(y);
    };
  }
  return wrapped;
}

/** The unguarded loader, for S3b's outcome reads only. It never feeds buildAsOfInputs. */
export function outcomeLoad(load) {
  return { ...load };
}

/** The S+1 season-totals row's `team` field for one pid — a string or null; no other field escapes. */
export function readTeamS1(load, S, pid) {
  const rows = outcomeLoad(load).loadSeasonTotals(S + 1);
  const team = rows?.[pid]?.team;
  return typeof team === 'string' ? team : null;
}

const FRANCHISE = { STL: 'LA', SD: 'LAC', OAK: 'LV' };
/** Era code → current franchise code (STL/SD/OAK → LA/LAC/LV). */
export function franchise(code) {
  return FRANCHISE[code] ?? code;
}
/** True when the S row's franchise differs from the S+1 row's (an era rename is not a move). */
export function isChanger(teamS, teamS1) {
  if (teamS == null || teamS1 == null) return false;
  return franchise(teamS) !== franchise(teamS1);
}

const SUFFIXES = ['iii', 'ii', 'iv', 'jr', 'sr'];
/** D-77 name guard normaliser: lowercase, a–z only, then at most one trailing suffix (iii first). */
export function normName(s) {
  let n = String(s ?? '').toLowerCase().replace(/[^a-z]/g, '');
  for (const suf of SUFFIXES) {
    if (n.length > suf.length && n.endsWith(suf)) { n = n.slice(0, -suf.length); break; }
  }
  return n;
}

/** Whole years completed on `isoDate` ('YYYY-MM-DD') from `birthdate`; missing/unparsable → null. */
export function ageOn(birthdate, isoDate) {
  return ageOnDate(birthdate, isoDate);
}

const regWeeks = (S) => (S <= 2020 ? 17 : 18);

function sleeperNameOf(raw) {
  if (!raw) return null;
  return raw.full_name ?? `${raw.first_name} ${raw.last_name}`;
}

// ─── age-gap measurement (shared with the age-curve gap report) ──────────────────────────────────

/**
 * The curve's input rows (gp >= 10 skill rows through `maxSeason`, both ages non-null) with the age each
 * curve would assign at the season: round(age − (year − season)).
 *   appAge(pid) / birthAge(pid): the age map each curve uses; appYear / birthYear: that curve's currentYear.
 */
export function curveInputRows(careerStats, positionOf, appAge, birthAge, { appYear, birthYear, maxSeason = Infinity }) {
  const out = [];
  for (const [season, seasonData] of Object.entries(careerStats)) {
    const y = Number(season);
    if (y > maxSeason) continue;
    for (const [pid, data] of Object.entries(seasonData)) {
      if ((data.gamesPlayed ?? 0) < 10) continue;
      const position = positionOf(pid);
      if (!SKILL_SET.has(position)) continue;
      const a = appAge(pid), b = birthAge(pid);
      if (a == null || b == null) continue;
      const appAtSeason = Math.round(a - (appYear - y));
      const birthAtSeason = Math.round(b - (birthYear - y));
      out.push({ season: y, pid, position, appAge: appAtSeason, birthAge: birthAtSeason, gap: appAtSeason - birthAtSeason });
    }
  }
  return out;
}

/** { n, mean, off1 } — row count, mean gap, count with |gap| > 1. */
export function rowGapStats(rows) {
  const n = rows.length;
  const mean = n ? rows.reduce((s, r) => s + r.gap, 0) / n : null;
  return { n, mean, off1: rows.filter(r => Math.abs(r.gap) > 1).length };
}

// ─── years_exp agreement (stop check) ────────────────────────────────────────────────────────────

/** On active skill players in the raw map (non-null team, draftYear >= 2013): years_exp === 2026 − draftYear. */
export function yearsExpAgreement(rawPlayers, playerIds) {
  let n = 0, ok = 0;
  for (const [pid, p] of Object.entries(rawPlayers ?? {})) {
    if (p?.team == null || !SKILL_SET.has(p.position)) continue;
    const dy = playerIds?.bySleeper?.[pid]?.draftYear;
    if (!(dy >= 2013)) continue;
    n++;
    if (p.years_exp === SLEEPER_CAPTURE_YEAR - dy) ok++;
  }
  return { n, ok, rate: n ? ok / n : null };
}

// ─── builder ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Inputs for dynastyScoreMirror as of the end of season S (S in 2013…2025; 2026 is refused).
 *   curveAgeMode: 'birthdate' (H) | 'app-sleeper' (S3b's A-AGE-APP)    gamesMode: 'sleeper' | 'snaps'
 * Returns { S, currentYear, scoringSettings, playersMap, curvePlayersMap, careerStats, curveBundle,
 *   teamContext, historicalShares, depthMap, dynastyDraftPick, ktcMap, skillPids, meta }.
 */
export function buildAsOfInputs(load, S, { curveAgeMode = 'birthdate', gamesMode = 'sleeper' } = {}) {
  if (!Number.isInteger(S) || S < FIRST_SEASON || S > LAST_COMPLETED_SEASON) {
    throw new DynastyAsOfStop(`[dynasty-asof] as-of season ${S} is outside ${FIRST_SEASON}…${LAST_COMPLETED_SEASON} (2026 is in progress)`);
  }
  if (!['birthdate', 'app-sleeper'].includes(curveAgeMode)) throw new Error(`[dynasty-asof] unknown curveAgeMode '${curveAgeMode}'`);
  if (!['sleeper', 'snaps'].includes(gamesMode)) throw new Error(`[dynasty-asof] unknown gamesMode '${gamesMode}'`);

  const guarded = asOfLoad(load, S);
  const scoringSettings = guarded.loadLeagueScoring();
  if (!scoringSettings) throw new DynastyAsOfStop('[dynasty-asof] league scoring fixture not found');
  const positionOf = guarded.loadLeaguePositionOf();
  const g = leagueBasisLoad(guarded, { scoringSettings, positionOf });
  const playerIds = guarded.loadPlayerIds();
  const rawPlayers = guarded.loadRawPlayers();
  const bySleeper = playerIds?.bySleeper ?? {};
  const currentYear = S + 1;
  const refDate = `${S + 1}-06-01`;
  const checks = {};

  // careerStats 2012…S (league-rescored)
  const rowsBySeason = {};
  for (let y = FIRST_SEASON; y <= S; y++) {
    const rows = g.loadSeasonTotals(y);
    if (rows == null) throw new DynastyAsOfStop(`[dynasty-asof] nfl/season-totals/${y}.json not found`);
    rowsBySeason[y] = rows;
  }
  let rescored = 0;
  for (const rows of Object.values(rowsBySeason)) {
    for (const r of Object.values(rows)) if (r && r.sourceScoringBasis === 'half_ppr' && Number.isFinite(r.sourceFantasyPoints)) rescored++;
  }
  if (rescored === 0) throw new DynastyAsOfStop('[dynasty-asof] the league rescore left no sourceScoringBasis/sourceFantasyPoints on any row');

  // years_exp agreement (stop < 90%)
  const yx = yearsExpAgreement(rawPlayers, playerIds);
  checks.yearsExpAgreement = yx;
  if (yx.rate != null && yx.rate < 0.90) {
    throw new DynastyAsOfStop(`[dynasty-asof] years_exp === ${SLEEPER_CAPTURE_YEAR} − draftYear holds for ${yx.ok}/${yx.n} (${(yx.rate * 100).toFixed(1)}%) < 90%`);
  }

  // Skill players: every non-TEAM pid with a row <= S whose 2026 position is a skill position.
  const firstSeasonOf = new Map();
  const seen = new Set();
  for (let y = FIRST_SEASON; y <= S; y++) {
    for (const [pid, r] of Object.entries(rowsBySeason[y])) {
      if (pid.startsWith('TEAM_')) continue;
      if (!SKILL_SET.has(positionOf(pid))) continue;
      seen.add(pid);
      if (!firstSeasonOf.has(pid) && (r?.gamesPlayed ?? 0) > 0) firstSeasonOf.set(pid, y);
    }
  }

  // years_exp / age / team
  const yxChecks = { fromDraftYear: 0, draftYearZero: 0, noCrosswalk: 0, noFirstSeason: 0 };
  const playersMap = {};
  for (const pid of [...seen].sort()) {
    const entry = bySleeper[pid] ?? null;
    let yearsExp;
    if (entry && entry.draftYear != null && entry.draftYear !== 0) {
      yearsExp = currentYear - entry.draftYear;
      yxChecks.fromDraftYear++;
    } else {
      if (!entry) yxChecks.noCrosswalk++; else yxChecks.draftYearZero++;
      const fs = firstSeasonOf.get(pid);
      if (fs == null) { yearsExp = null; yxChecks.noFirstSeason++; } else yearsExp = currentYear - fs;
    }
    playersMap[pid] = {
      position: positionOf(pid),
      age: ageOn(entry?.birthdate, refDate),
      years_exp: yearsExp,
      team: rowsBySeason[S][pid]?.team ?? null,
    };
  }
  checks.yearsExp = yxChecks;

  // games mode — snaps substitution (D-77 definition (c) at season level)
  const careerStats = {};
  const snapsNameGuardSkips = {};
  const snapsGamesDiffer = {};
  for (let y = FIRST_SEASON; y <= S; y++) {
    const rows = rowsBySeason[y];
    const snaps = gamesMode === 'snaps' && y >= 2013 ? g.loadSnapShare(y)?.players : null;
    if (!snaps) { careerStats[y] = rows; continue; }
    const out = {};
    snapsNameGuardSkips[y] = 0;
    snapsGamesDiffer[y] = 0;
    for (const [pid, row] of Object.entries(rows)) {
      const e = snaps[pid];
      if (!e || !(e.games > 0)) { out[pid] = row; continue; }
      if (normName(e.name) !== normName(sleeperNameOf(rawPlayers?.[pid]))) {
        snapsNameGuardSkips[y]++;
        out[pid] = row;
        continue;
      }
      if (e.games !== row.gamesPlayed) snapsGamesDiffer[y]++;
      out[pid] = { ...row, gamesPlayed: e.games };
    }
    careerStats[y] = out;
  }
  if (gamesMode === 'snaps') { checks.snapsNameGuardSkips = snapsNameGuardSkips; checks.snapsGamesDiffer = snapsGamesDiffer; }

  // curves
  let curvePlayersMap, curveYear;
  if (curveAgeMode === 'birthdate') {
    curvePlayersMap = playersMap;
    curveYear = currentYear;
  } else {
    curvePlayersMap = {};
    for (const [pid, p] of Object.entries(playersMap)) {
      const a = rawPlayers?.[pid]?.age;
      curvePlayersMap[pid] = { position: p.position, age: a == null ? null : a };
    }
    curveYear = SLEEPER_CAPTURE_YEAR;
  }
  const curveBundle = empiricalAgeCurvesMirror(careerStats, curvePlayersMap, { currentYear: curveYear });

  // age gap (APP vs BIRTH) over this S's curve-input rows
  const gapRows = curveInputRows(
    careerStats, (pid) => playersMap[pid]?.position ?? null,
    (pid) => rawPlayers?.[pid]?.age ?? null, (pid) => playersMap[pid]?.age ?? null,
    { appYear: SLEEPER_CAPTURE_YEAR, birthYear: currentYear },
  );
  const gap = rowGapStats(gapRows);
  checks.ageGap = { [S]: gap };

  // team context + shares, per-season-team attribution
  const attribution = 'per-season-team';
  const teamContext = teamContextMirror(careerStats, playersMap, S, { attribution });
  const totals = historicalTeamTotalsMirror(careerStats, playersMap, { attribution });
  const historicalShares = historicalSharesMirror(careerStats, playersMap, totals, { attribution });
  checks.sharesAboveOne = countSharesAboveOne(historicalShares);

  // depthMap: end-of-regular-season chart
  const depthFile = guarded.loadDepth(S);
  if (depthFile == null) throw new DynastyAsOfStop(`[dynasty-asof] nflverse/depth/${S}.json not found`);
  const weekKeys = Object.keys(depthFile.weeks ?? {}).map(Number).filter(w => Number.isFinite(w) && w <= regWeeks(S));
  const W = weekKeys.length ? Math.max(...weekKeys) : null;
  const nTeams = W == null ? 0 : Object.keys(depthFile.weeks[W] ?? {}).length;
  if (W == null || nTeams < 30) throw new DynastyAsOfStop(`[dynasty-asof] depth week ${W} of ${S} has ${nTeams} teams (< 30)`);
  const idx = depthOrderIndex(depthFile, W);
  const depthMap = {};
  for (const [pid, p] of Object.entries(playersMap)) {
    const d = idx.get(`${p.position}|${pid}`);
    if (d != null) depthMap[pid] = { depthOrder: d };
  }
  if (Object.keys(depthMap).length === 0) throw new DynastyAsOfStop(`[dynasty-asof] the depthMap for ${S} has 0 entries`);
  checks.depth = { week: W, teams: nTeams, entries: Object.keys(depthMap).length };

  const deliberateDifferences = [
    'left-truncated history (careerStats begins 2012; early cohorts see only 2012…S)',
    'positions are the 2026-05-18 positions applied to every S',
    `ages are true ages on ${refDate} from birthdates (Sleeper's age is stale for players without a team)`,
    'years_exp is derived from draftYear / first season, not Sleeper years_exp',
    'per-season-team attribution instead of the app\'s current-team',
    'depth chart is the end-of-regular-season chart, not the offseason chart',
    'dynastyDraftPick null, no KTC, no live level (offseason state)',
    ...(curveAgeMode === 'app-sleeper'
      ? ["curves from the 2026-05-18 Sleeper ages (A-AGE-APP): today's app curve error transported to S — it contains post-S information and is not the error the app had at S"]
      : []),
    ...(gamesMode === 'snaps' ? ['gamesPlayed from nflverse snaps (D-77 definition (c) at season level) under the name guard'] : []),
  ];

  return {
    S, currentYear, curveAgeMode, gamesMode, scoringSettings, playersMap, curvePlayersMap, careerStats, curveBundle,
    teamContext, historicalShares, depthMap, dynastyDraftPick: null, ktcMap: null,
    skillPids: Object.keys(playersMap),
    meta: { checks, deliberateDifferences },
  };
}
