/**
 * scripts/learned-panel-run.mjs — LP-1a exporter adapter: assembles the per-player-week research panel and the season
 * benchmarks from files already on disk and writes them to the git-ignored research cache.
 *
 * Offline, read-only against every served folder; the only writes are under research/learned-projection/.cache/.
 * Injectable loaders (`load`, `outDir`). Task file: .claude/tasks/learned-projection-1a-harness.md §4.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { readJson, repoPath } from '../lib/io.mjs';
import { INSEASON_LOAD, guardLoad, runReconciliation, assembleSeason, makeGamelogsIndex, makeScheduleIndex, loadQbChainModels, rookieRecordFor, assertPrimaryCoverage } from './inseason-run.mjs';
import { leagueLoadArgs, LEAGUE_SCORING_FIXTURE } from './panel-run.mjs';
import { leagueBasisLoad, basisScaleOf } from '../lib/leagueBasis.mjs';
import { mirrorArgsOf } from './rookie-constants-file.mjs';
import { seasonEmitsFirstDownBonus } from '../lib/fantasyPoints.mjs';
import { IN_SEASON_DEFAULTS } from '../lib/inSeasonEvidence.mjs';
import { b2Benchmark, seasonBench, buildBenchwSeason } from '../lib/learnedBench.mjs';
import { primaryPassers, coverageFor } from '../lib/qbTakeover.mjs';
import { createHash } from 'node:crypto';
import {
  LearnedLookAheadError, SKILL_POSITIONS, indexSchedule, seasonUniverse, buildWeekRows, buildTeamRows,
  labelCohorts, buildSeasonRows, seasonMeanOs, computeSpikeSd, collectNonZeroKeys, finalizeKeys, SPIKE_SEASONS, weekPoints, modalTeamGames,
} from '../lib/learnedPanel.mjs';

export { LearnedLookAheadError };

const SKILL = new Set(SKILL_POSITIONS);
export const MAX_SEASON = 2025;
export const CACHE_ROOT = 'research/learned-projection/.cache';
export const PANEL_DIR = `${CACHE_ROOT}/panel`;
export const INSEASON_CONSTANTS_FILE = 'backtests/2026-10-07-inseason-constants.json';

export const LEARNED_LOAD = {
  ...INSEASON_LOAD,
  loadRosterWeekly: (y) => readJson(`nflverse/rosterweekly/${y}.json`),
  loadTeamContext: (y) => readJson(`nflverse/teamcontext/${y}.json`),
  // LP-1b: the pinned in-season k file (never the 2026-10-16 league file). Takes no season.
  loadInSeasonConstants: () => readJson(INSEASON_CONSTANTS_FILE),
};

/** Loaders that take a season: a call above `maxSeason` is look-ahead (T-LP-2 asserts this list is complete). */
export const SEASON_KEYED_LOADERS = Object.freeze([
  'loadSeasonTotals', 'loadGameLogs', 'loadSchedule', 'loadDepth', 'loadAdvstats', 'loadSnapShare', 'loadRoster',
  'loadRosterWeekly', 'loadTeamContext',
]);
/** Every other function on the load object — takes no season (or a date / scoring-free key). */
export const NOT_SEASON_KEYED = Object.freeze([
  'loadPlayerIds', 'loadManifest', 'loadSnapshot', 'loadLeagueScoring', 'loadLeaguePositionOf', 'loadQbTakeoverConstants',
  'basisScaleAsOf', 'loadRookiePinArtifact', 'loadRookiePinCrosswalk', 'loadRookieTotalCrosswalk', 'loadInSeasonConstants',
]);

/** Wraps EVERY season-keyed loader: a year above maxSeason throws LearnedLookAheadError. */
export function yearGuard(load, { maxSeason = MAX_SEASON } = {}) {
  const wrapped = { ...load };
  for (const name of SEASON_KEYED_LOADERS) {
    if (typeof load[name] !== 'function') continue;
    wrapped[name] = (y) => {
      if (Number(y) > maxSeason) throw new LearnedLookAheadError(`[learned] ${name}(${y}) is look-ahead: above maxSeason ${maxSeason}`);
      return load[name](y);
    };
  }
  return wrapped;
}

/** yearGuard → guardLoad → leagueBasisLoad (the order of task §4.2). */
export function buildLearnedLoad(base = LEARNED_LOAD, { maxSeason = MAX_SEASON } = {}) {
  const yg = yearGuard(base, { maxSeason });
  const guarded = guardLoad(yg, { maxLoadSeason: maxSeason });
  return leagueBasisLoad(guarded, leagueLoadArgs(guarded));
}

export class LearnedCheckStop extends Error {
  constructor(message, detail) { super(message); this.name = 'LearnedCheckStop'; this.detail = detail; }
}

const r4 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 1e4) / 1e4);

function gitRev() {
  try { return execSync('git rev-parse HEAD', { cwd: repoPath('.'), stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return null; }
}

function appendJsonl(fd, rows) {
  if (!rows.length) return;
  let buf = '';
  for (const r of rows) { buf += JSON.stringify(r) + '\n'; if (buf.length > 1 << 22) { fs.writeSync(fd, buf); buf = ''; } }
  if (buf) fs.writeSync(fd, buf);
}

/** The pre-pass: meta.keys and the 2012–2013 spike material, from every skill player-week 2012–2025. */
export function prePass(g, scoring, positionOf) {
  const seen = new Set();
  const spikeInput = [];
  for (let S = 2012; S <= MAX_SEASON; S++) {
    const totals = g.loadSeasonTotals(S);
    if (!totals) continue;
    const derive = !seasonEmitsFirstDownBonus(totals);
    for (const [pid, row] of Object.entries(totals)) {
      if (pid.startsWith('TEAM_')) continue;
      const position = positionOf(pid);
      if (!SKILL.has(position) || !Array.isArray(row.weeklyStatus)) continue;
      row.weeklyStatus.forEach((st, i) => {
        if (st !== 'P') return;
        const sw = row.weeklyStats?.[String(i + 1)] ?? {};
        collectNonZeroKeys(seen, sw, position, derive, scoring);
      });
      if (SPIKE_SEASONS.includes(S)) spikeInput.push({ season: S, position, pid, weeks: row.weeklyStatus.map((st, i) => (st === 'P' ? i + 1 : null)).filter(Boolean), row, derive });
    }
  }
  return { keys: finalizeKeys(seen, scoring), spikeInput };
}

/** The cache's meta.json object (pure). `weights` keep the scoring file's key order: the float sum order of calculateFantasyPoints. */
export function buildMeta({ generatedAt, dataRev, from, to, keys, scoring, spikeSd, counts, checks, reconciliation, runtimeMs }) {
  return {
    generatedAt, dataRev, from, to, scoringFixture: LEAGUE_SCORING_FIXTURE,
    keys, weights: Object.fromEntries(Object.keys(scoring).filter(k => keys.includes(k)).map(k => [k, scoring[k]])),
    positionsFile: 'raw/-players-nfl.json',
    spikeSd: Object.fromEntries(Object.entries(spikeSd).map(([k, v]) => [k, v])),
    counts, checks, reconciliation: { population: reconciliation.population, pass: reconciliation.pass, rate: reconciliation.rate },
    runtimeMs,
  };
}

export function runExport({ load = buildLearnedLoad(), from = 2014, to = 2025, outDir = PANEL_DIR, log = () => {}, now = () => new Date() } = {}) {
  if (to > MAX_SEASON) throw new LearnedLookAheadError(`[learned] --to ${to} exceeds maxSeason ${MAX_SEASON}`);
  const t0 = Date.now();
  const g = load;
  const reconciliation = runReconciliation(g, { fromYear: 2012, toYear: MAX_SEASON });
  log(`reconciliation ${reconciliation.pass}/${reconciliation.population}`);
  const scoring = g.loadLeagueScoring();
  const positionOf = g.loadLeaguePositionOf();
  const playerIds = g.loadPlayerIds();

  // ── pre-pass: keys + spike SD
  const pre = prePass(g, scoring, positionOf);
  const { keys } = pre;
  // pts for the spike seasons need the scorer; computed here to keep prePass free of it
  const spikeSd = computeSpikeSd(pre.spikeInput.map(({ season, position, row, derive, weeks }) => ({
    season, position, pts: weeks.map(w => weekPointsOf(row, w, scoring, position, derive)),
  })));
  log(`keys ${keys.length}; spikeSd ${JSON.stringify(Object.fromEntries(Object.entries(spikeSd).map(([k, v]) => [k, r4(v)])))}`);

  const tmp = `${outDir}.tmp`;
  fs.rmSync(repoPath(tmp), { recursive: true, force: true });
  fs.mkdirSync(repoPath(tmp), { recursive: true });
  const fd = Object.fromEntries(['weeks', 'teams', 'seasons', 'bench'].map(n => [n, fs.openSync(repoPath(`${tmp}/${n}.jsonl`), 'w')]));

  const firstS = Math.max(2012, from - 2);
  const counts = { weeks: 0, weeksInUniverse: 0, weeksPlayed: 0, teams: 0, seasons: 0, bench: 0, noGames: 0, bySeason: {} };
  const checks = { c2: { players: 0, ok: 0, misses: [] }, c3: { bySeason: {}, bySource: {}, byFallback: {}, played: 0, withGame: 0, firstChoice: 0 }, c4: {}, c5: {} };
  const seasonsIdx = new Map();      // `${pid}|${S}` → seasons row
  const prevOsBySeason = new Map();  // S → Map(pid → mean os)
  const schedByS = new Map();

  try {
    // ── per season: weeks, teams, seasons
    for (let S = firstS; S <= to; S++) {
      const totals = g.loadSeasonTotals(S);
      const rosterFile = g.loadRosterWeekly(S);
      const sched = indexSchedule(g.loadSchedule(S));
      schedByS.set(S, sched);
      const depthFile = g.loadDepth(S);
      const rosterPlayers = rosterFile?.players ?? {};
      const rows = buildWeekRows({ S, positionOf, totals, rosterPlayers, sched, depthFile, keys, scoring });
      labelCohorts(rows, { spikeSd, prevOs: prevOsBySeason.get(S - 1) ?? new Map() });
      prevOsBySeason.set(S, seasonMeanOs(rows));
      prevOsBySeason.delete(S - 2);
      const teamRows = buildTeamRows({ S, teamcontext: g.loadTeamContext(S), rows });
      appendJsonl(fd.weeks, rows); appendJsonl(fd.teams, teamRows);
      counts.weeks += rows.length; counts.teams += teamRows.length;
      counts.weeksInUniverse += rows.filter(r => r.inUniverse).length;
      counts.weeksPlayed += rows.filter(r => r.played).length;
      counts.bySeason[S] = { weekRows: rows.length, played: rows.filter(r => r.played).length, teamRows: teamRows.length };

      // check 3 (played rows with a schedule game for their team)
      const played = rows.filter(r => r.played);
      const c3 = checks.c3.bySeason[S] = {
        played: played.length, withGame: played.filter(r => !r.noGame).length, firstChoice: played.filter(r => r.teamFirstChoice).length,
      };
      checks.c3.played += c3.played; checks.c3.withGame += c3.withGame; checks.c3.firstChoice += c3.firstChoice;
      for (const r of played) {
        const b = checks.c3.bySource[r.teamSource] ??= { played: 0, withGame: 0, firstChoice: 0 };
        b.played++; if (!r.noGame) b.withGame++; if (r.teamFirstChoice) b.firstChoice++;
        if (!r.teamFirstChoice) checks.c3.byFallback[r.teamSource] = (checks.c3.byFallback[r.teamSource] ?? 0) + 1;
      }
      // check 2 (Σ weekly pts == league season points)
      const sumBy = new Map();
      for (const r of played) sumBy.set(r.pid, (sumBy.get(r.pid) ?? 0) + r.pts);
      const snaps = g.loadSnapShare(S);
      const seasonRows = buildSeasonRows({ S, positionOf, totals, rosterPlayers, sched, playerIds, snaps });
      for (const sr of seasonRows) {
        if (!sr.hasRow) continue;
        checks.c2.players++;
        const d = Math.abs((sumBy.get(sr.pid) ?? 0) - sr.fantasyPoints);
        if (d <= 0.05) checks.c2.ok++; else if (checks.c2.misses.length < 25) checks.c2.misses.push({ S, pid: sr.pid, sum: r4(sumBy.get(sr.pid) ?? 0), season: sr.fantasyPoints });
      }
      for (const r of seasonRows) seasonsIdx.set(`${r.pid}|${S}`, r);
      appendJsonl(fd.seasons, seasonRows);
      counts.seasons += seasonRows.length;
      // check 5 material
      const vocab = {};
      for (const byWeek of Object.values(rosterPlayers)) for (const pairs of Object.values(byWeek)) for (const [, s] of pairs) vocab[s] = (vocab[s] ?? 0) + 1;
      let tw = 0, twDt = 0;
      for (const teams of Object.values(depthFile?.weeks ?? {})) for (const t of Object.values(teams)) { tw++; if (t?.dt) twDt++; }
      checks.c5[S] = { rosterweeklyStatusVocabulary: vocab, depthTeamWeeks: tw, depthTeamWeeksWithDt: twDt };
      log(`S=${S}: ${rows.length} week rows, ${seasonRows.length} season rows`);
    }

    const c2rate = checks.c2.players ? checks.c2.ok / checks.c2.players : 0;
    checks.c2.rate = c2rate;
    if (c2rate < 0.995) throw new LearnedCheckStop(`§9.2 Σ weekly pts == league season points on ${(c2rate * 100).toFixed(2)}% < 99.5%`, checks.c2);
    const c3rate = checks.c3.played ? checks.c3.firstChoice / checks.c3.played : 0;
    checks.c3.rate = c3rate;
    if (c3rate < 0.99) throw new LearnedCheckStop(`§9.3 played rows on the §4.3 first-choice team with a schedule game ${(c3rate * 100).toFixed(2)}% < 99%`, checks.c3);

    // ── bench (S ∈ [from, to])
    const env = {
      load: g, defaults: IN_SEASON_DEFAULTS, gamelogsIdx: makeGamelogsIndex(g), scheduleIdx: makeScheduleIndex(g),
      playerIds, qbPrior: 'starter', basis: 'league', qbChainModels: loadQbChainModels(g),
    };
    const stop4 = [];
    for (let S = from; S <= to; S++) {
      const a = assembleSeason(S, env);
      const bySleeper = new Map(a.playerSeasons.map(p => [p.sleeperId, p]));
      const careerStats = {};
      for (let y = 2012; y <= S - 1; y++) careerStats[y] = g.loadSeasonTotals(y);
      const seasonRows = [...seasonsIdx.values()].filter(r => r.S === S);
      const benchRows = [];
      for (const sr of seasonRows) {
        const ps = bySleeper.get(sr.pid) ?? null;
        const rookie = ps && typeof ps.arm === 'string' && ps.arm.startsWith('X-rookie') && ps.pointsPrior != null
          ? rookieRecordFor(sr.pid, sr.position, S, playerIds, { rookieQbModel: 'rookie-qb-level', basisScale: basisScaleOf(g, S, sr.position), ...mirrorArgsOf(null) })
          : null;
        const b1 = seasonBench({ pid: sr.pid, position: sr.position, S, arm: ps?.arm ?? null, pointsPrior: ps?.pointsPrior ?? null, careerStats, rookieRec: rookie });
        if (b1.noGames) counts.noGames++;
        const b2 = b2Benchmark(careerStats, sr.pid, S, {
          teamGamesS: sr.teamGames,
          teamGamesOf: (y) => seasonsIdx.get(`${sr.pid}|${y}`)?.teamGames ?? modalTeamGames(y),
        });
        benchRows.push({ pid: sr.pid, S, position: sr.position, b1, b2 });
      }
      appendJsonl(fd.bench, benchRows);
      counts.bench += benchRows.length;
      // check 4 — b1.covered share of the season headline set (stratum V ∪ drafted in S rounds 1–3), per position, test folds
      if (S >= 2019) {
        const bySrId = new Map(benchRows.map(b => [b.pid, b]));
        const c4 = checks.c4[S] = {};
        for (const pos of SKILL_POSITIONS) {
          const head = seasonRows.filter(r => r.position === pos && r.inSeasonUniverse && (bySrId.get(r.pid).b2.ppg != null || (r.draftYear === S && r.draftRound >= 1 && r.draftRound <= 3)));
          const cov = head.filter(r => bySrId.get(r.pid).b1.covered).length;
          c4[pos] = { n: head.length, covered: cov, share: head.length ? r4(cov / head.length) : null };
          if (!(head.length && cov / head.length >= 0.6)) stop4.push(`${S} ${pos}: ${cov}/${head.length}`);
        }
      }
      log(`bench S=${S}: ${benchRows.length} rows`);
    }
    if (stop4.length) throw new LearnedCheckStop(`§9.4 b1.covered share of the season headline set < 60% in: ${stop4.join('; ')}`, checks.c4);
  } catch (e) {
    for (const f of Object.values(fd)) fs.closeSync(f);
    fs.rmSync(repoPath(tmp), { recursive: true, force: true });
    throw e;
  }
  for (const f of Object.values(fd)) fs.closeSync(f);

  const meta = buildMeta({
    generatedAt: now().toISOString(), dataRev: gitRev(), from, to, keys, scoring, spikeSd, counts, checks, reconciliation, runtimeMs: Date.now() - t0,
  });
  fs.writeFileSync(repoPath(`${tmp}/meta.json`), JSON.stringify(meta, null, 1));
  fs.rmSync(repoPath(outDir), { recursive: true, force: true });
  fs.renameSync(repoPath(tmp), repoPath(outDir));
  return meta;
}

function weekPointsOf(row, w, scoring, position, derive) {
  return weekPoints(row.weeklyStats?.[String(w)] ?? {}, scoring, position, derive);
}


// ─── LP-1b: the weekly current-model benchmark (task .claude/tasks/learned-projection-1b-weekly-bench.md §4.7) ────────────

const readJsonl = (rel, keep = () => true) => {
  const out = [];
  for (const line of fs.readFileSync(repoPath(rel), 'utf8').split('\n')) {
    if (!line) continue;
    const r = JSON.parse(line);
    if (keep(r)) out.push(r);
  }
  return out;
};

/**
 * Replays the app's in-season logic week by week for `seasons` and writes `benchw.jsonl` + `benchw.meta.json` next to the panel
 * (the only writes; atomic). `panelDir` is repo-relative. Requires meta.from === 2014 && meta.to === 2025. A season whose
 * primary-passer coverage is below the app's floor throws (the app refuses a season with a missing week).
 */
export function runExportWeekly({ load = buildLearnedLoad(), panelDir = PANEL_DIR, seasons = Array.from({ length: 12 }, (_, i) => 2014 + i), log = () => {}, now = () => new Date() } = {}) {
  const t0 = Date.now();
  const meta = readJson(`${panelDir}/meta.json`);
  if (!(meta?.from === 2014 && meta?.to === 2025)) throw new LearnedCheckStop(`[learned] ${panelDir}/meta.json covers ${meta?.from}–${meta?.to}, not 2014–2025 — benchw does not re-export the panel`, { from: meta?.from, to: meta?.to });
  const g = load;
  const models = loadQbChainModels(g);
  const constantsFile = g.loadInSeasonConstants();
  const constantsSha256 = createHash('sha256').update(fs.readFileSync(repoPath(INSEASON_CONSTANTS_FILE))).digest('hex');
  const want = new Set(seasons);
  const weeksBy = new Map();
  for (const r of readJsonl(`${panelDir}/weeks.jsonl`, (x) => want.has(x.S))) {
    if (!weeksBy.has(r.S)) weeksBy.set(r.S, []);
    weeksBy.get(r.S).push({ pid: r.pid, S: r.S, w: r.w, position: r.position, team: r.team, played: r.played, pts: r.pts, inUniverse: r.inUniverse });
  }
  const benchBy = new Map();
  for (const b of readJsonl(`${panelDir}/bench.jsonl`, (x) => want.has(x.S))) { if (!benchBy.has(b.S)) benchBy.set(b.S, []); benchBy.get(b.S).push(b); }
  const seasonsBy = new Map();
  for (const s of readJsonl(`${panelDir}/seasons.jsonl`, (x) => want.has(x.S))) { if (!seasonsBy.has(s.S)) seasonsBy.set(s.S, []); seasonsBy.get(s.S).push({ pid: s.pid, S: s.S, draftYear: s.draftYear }); }

  const tmp = `${panelDir}/benchw.jsonl.tmp`;
  const fd = fs.openSync(repoPath(tmp), 'w');
  const counts = { rows: 0, condNull: 0, byKind: {}, qbOmitted: 0, routeMismatch: 0 };
  const c2 = { n: 0, agree: 0, byPosition: {}, cells: {} };
  const c3 = { fractionBad: 0, massBad: 0, massMaxDev: 0, kinds: {}, omitted: 0, bySeason: {} };
  const c6 = { bySeason: {} };
  try {
    for (const S of [...seasons].sort((a, b) => a - b)) {
      const sched = g.loadSchedule(S);
      const gamelogsFile = g.loadGameLogs(S);
      const cov = assertPrimaryCoverage(S, coverageFor(sched, primaryPassers(gamelogsFile, S)));
      c6.bySeason[S] = cov;
      const careerStats = {};
      for (let y = 2012; y <= S - 1; y++) careerStats[y] = g.loadSeasonTotals(y);
      const { rows, checks } = buildBenchwSeason({
        S, weekRows: weeksBy.get(S) ?? [], bench: benchBy.get(S) ?? [], seasons: seasonsBy.get(S) ?? [], gamelogsFile, scheduleFile: sched,
        depthFile: g.loadDepth(S), rosterweeklyFile: g.loadRosterWeekly(S), careerStats, constantsFile, models,
      });
      appendJsonl(fd, rows);
      for (const r of rows) {
        counts.rows++;
        if (r.cond == null) counts.condNull++;
        if (r.routeMismatch) counts.routeMismatch++;
        if (r.position === 'QB') { if (r.omitted) counts.qbOmitted++; counts.byKind[r.kind] = (counts.byKind[r.kind] ?? 0) + 1; }
      }
      c2.n += checks.c2.n; c2.agree += checks.c2.agree;
      for (const [pos, v] of Object.entries(checks.c2.byPosition)) { const b = c2.byPosition[pos] ??= { n: 0, agree: 0 }; b.n += v.n; b.agree += v.agree; }
      for (const [cell, n] of Object.entries(checks.c2.cells)) c2.cells[cell] = (c2.cells[cell] ?? 0) + n;
      c3.fractionBad += checks.c3.fractionBad; c3.massBad += checks.c3.massBad; c3.massMaxDev = Math.max(c3.massMaxDev, checks.c3.massMaxDev); c3.omitted += checks.c3.omitted;
      for (const [k, n] of Object.entries(checks.c3.kinds)) c3.kinds[k] = (c3.kinds[k] ?? 0) + n;
      c3.bySeason[S] = checks.c3.kinds;
      log(`benchw S=${S}: ${rows.length} rows (coverage ${cov.withPrimary}/${cov.teamGames})`);
    }
  } catch (e) {
    fs.closeSync(fd);
    fs.rmSync(repoPath(tmp), { force: true });
    throw e;
  }
  fs.closeSync(fd);

  c2.rate = c2.n ? c2.agree / c2.n : null;
  for (const v of Object.values(c2.byPosition)) v.rate = v.n ? v.agree / v.n : null;
  c2.pass = c2.rate != null && c2.rate >= 0.98 && Object.values(c2.byPosition).every(v => v.rate >= 0.95);
  c3.pass = c3.fractionBad === 0 && c3.massBad === 0;
  c6.pass = true;                                   // assertPrimaryCoverage threw otherwise
  const benchwMeta = {
    generatedAt: now().toISOString(), dataRev: gitRev(), panelGeneratedAt: meta.generatedAt, constantsFile: INSEASON_CONSTANTS_FILE, constantsSha256,
    qbChainSource: models.source, seasons: [...seasons].sort((a, b) => a - b), counts, checks: { c2, c3, c6 }, runtimeMs: Date.now() - t0,
  };
  fs.writeFileSync(repoPath(`${panelDir}/benchw.meta.json.tmp`), JSON.stringify(benchwMeta, null, 1));
  fs.renameSync(repoPath(tmp), repoPath(`${panelDir}/benchw.jsonl`));
  fs.renameSync(repoPath(`${panelDir}/benchw.meta.json.tmp`), repoPath(`${panelDir}/benchw.meta.json`));
  return benchwMeta;
}
