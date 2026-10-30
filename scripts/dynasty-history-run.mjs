/**
 * scripts/dynasty-history-run.mjs — S3b: the dynasty score's first historical test
 * (`bin/backtest.mjs --dynasty-history`). Task file: .claude/tasks/dynasty-history-backtest.md (Revision 4).
 *
 * Rebuilds every veteran's dynasty score at the end of each season S = 2015…2024 from S3a's as-of inputs and grades
 * it against the next three seasons on the pre-registration in §8 of the task file (hashed, pinned below). Offline
 * analysis only: no served file, no manifest entry, nothing reaches the app's scoring. It never proposes a weight,
 * a constant or a curve.
 *
 * Public exports:
 *   DYNASTY_HISTORY_LOAD, DYNASTY_HISTORY_PREREG_SHA256, preregHash(text), DynastyHistoryStop
 *   metricKey(parts), parseMetricKey(key)
 *   buildRows({ load, cohorts, log })              → { rows, exclusions, leftBC, checks, deliberateDifferences }
 *   computeMetrics(rows, { resamples, seed, log }) → { metrics, summary }
 *   runDynastyHistory({ load, log })               → result { meta, rows, metrics, summary }
 *   buildDynastyHistoryVerdictMarkdown(result)     → string
 *   writeDynastyHistoryArtifacts({ result, verdictMd, root }) → { panelPath, verdictPath, panelBytes }
 *   dynastyHistoryMain({ load, write, asJson, … }) → exit code
 * plus the pure statistics (cohortStats, hitRate, percentileBias, the label functions, perPositionSummary).
 */
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { execSync } from 'child_process';
import { repoPath } from '../lib/io.mjs';
import { spearman, rankTransform } from '../lib/backtest.mjs';
import { clusteredBootstrap } from '../lib/inSeasonEvidence.mjs';
import {
  dynastyScoreMirror, composeDynastyScore, DYNASTY_WEIGHTS, qbQualityByTeamMirror, applyQBQualityModifierMirror,
} from '../lib/dynastyMirror.mjs';
import { guardedAgeCurves, deltaAgeCurves, PEAK_GUARD_MIN_ROWS } from '../lib/ageCurveVariants.mjs';
import { leagueBasisLoad } from '../lib/leagueBasis.mjs';
import {
  DYNASTY_ASOF_LOAD, buildAsOfInputs, asOfLoad, outcomeLoad, readTeamS1, isChanger, normName, SKILL, FIRST_SEASON,
  LAST_COMPLETED_SEASON,
} from './dynasty-asof.mjs';
import { LEAGUE_SCORING_FIXTURE } from './panel-run.mjs';

export class DynastyHistoryStop extends Error {
  constructor(message) { super(message); this.name = 'DynastyHistoryStop'; }
}

export const TASK_FILE = '.claude/tasks/dynasty-history-backtest.md';
/** SHA-256 of §8 of the committed task file (data 80ea217), pinned before any result was computed. */
export const DYNASTY_HISTORY_PREREG_SHA256 = 'dbeff35595357a6390307683a2d504118bb8fd8af6b337d875544cfd2b8126cc';

export const COHORTS = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];
export const HEADLINE_COHORTS = COHORTS.filter(s => s <= 2022);
export const PS_COHORTS = [2018, 2019, 2020, 2021, 2022];
export const MODES = ['sleeper', 'snaps'];
export const MEASURES = ['M1', 'M2'];
export const POSITIONS = SKILL;
export const WINDOW = 3;
export const BOOTSTRAP = { resamples: 4000, seed: 12345 };
export const PANEL_MAX_BYTES = 15 * 1024 * 1024;
export const AGE_BANDS = ['le24', '25-27', '28-30', 'ge31'];
export const COMPONENTS = ['ageAdjusted', 'trajectory', 'currentLevel', 'reliability', 'opportunityQuality'];
export const LEVEL_SUBJECTS = [
  'H', 'B1', 'B2', ...COMPONENTS.map(c => `LOO-${c}`),
  'A-C1', 'A-AGE-APP', 'A-AGE-DELTA', 'A-ST-chg', 'A-ST-all', 'A-AV-d', 'A-AV-c', 'A-QB',
];
const SCORE_VARIANTS = LEVEL_SUBJECTS.filter(s => s !== 'B1' && s !== 'B2');
const ABLATIONS_VS_H = ['A-C1', 'A-AGE-DELTA', 'A-ST-chg', 'A-ST-all', 'A-AV-d', 'A-AV-c', 'A-QB'];
/** [a, b, family]: Δ = stat(a) − stat(b). */
export const DELTA_SPECS = [
  ['H', 'B1', 'baseline'], ['H', 'B2', 'baseline'],
  ...COMPONENTS.map(c => ['H', `LOO-${c}`, 'loo']),
  ...ABLATIONS_VS_H.map(a => [a, 'H', 'ablation']),
  ['H', 'A-AGE-APP', 'ablation'], ['A-AGE-DELTA', 'A-AGE-APP', 'ablation'],
];
export const STATS = ['rho', 'hr12', 'hr24'];
export const MIN_ROWS = { rho: 20, hr12: 36, hr24: 72 };
export const HEADLINE_MIN = { cohorts: 6, rows: 160 };
export const CELL_MIN_ROWS = 30;

export const AGE_APP_LABEL = "today's app curve error transported to S — contains post-S information; not the error the app had at S";
const PEAK_GUARD_SENTENCE = `H's age curve ignores age buckets with fewer than ${PEAK_GUARD_MIN_ROWS} rows when it derives the peak age (a deliberate difference from the app, which has no guard)`;

/** §8.11's measured table (data 605f132): S → position → [unguarded peak, guarded peak | 'fallback']. */
export const PEAK_TABLE = {
  2015: { QB: [32, 'fallback'], RB: [25, 25], WR: [28, 28], TE: [29, 26] },
  2016: { QB: [32, 'fallback'], RB: [20, 25], WR: [28, 28], TE: [29, 28] },
  2018: { QB: [32, 'fallback'], RB: [25, 21], WR: [28, 28], TE: [29, 29] },
  2020: { QB: [32, 'fallback'], RB: [25, 21], WR: [28, 28], TE: [29, 29] },
  2022: { QB: [32, 24], RB: [25, 21], WR: [28, 28], TE: [29, 29] },
  2024: { QB: [32, 24], RB: [20, 21], WR: [20, 28], TE: [29, 29] },
};

export const DYNASTY_HISTORY_LOAD = {
  ...DYNASTY_ASOF_LOAD,
  taskFileText: () => fs.readFileSync(repoPath(TASK_FILE), 'utf8'),
  gitRev: () => execSync('git rev-parse --short HEAD', { cwd: repoPath('.') }).toString().trim(),
  goldenSourceRev: () => JSON.parse(fs.readFileSync(repoPath('test/fixtures/dynasty-mirror-parity/expected-2019.json'), 'utf8')).sourceRev,
  now: () => new Date().toISOString(),
};

// ─── pre-registration hash (§8.10) ───────────────────────────────────────────────────────────────

/** SHA-256 over the LF-split lines strictly between the first `## 8. Pre-registration` line and the first later `## 9. Outputs` line. */
export function preregHash(text) {
  const lines = String(text).split('\n');
  const a = lines.findIndex(l => l === '## 8. Pre-registration');
  if (a < 0) throw new DynastyHistoryStop('[dynasty-history] the task file has no "## 8. Pre-registration" line');
  const b = lines.findIndex((l, i) => i > a && l === '## 9. Outputs');
  if (b < 0) throw new DynastyHistoryStop('[dynasty-history] the task file has no "## 9. Outputs" line after §8');
  return createHash('sha256').update(lines.slice(a + 1, b).join('\n'), 'utf8').digest('hex');
}

// ─── metric keys (§9) ────────────────────────────────────────────────────────────────────────────

export const KEY_FIELDS = ['horizon', 'measure', 'mode', 'kind', 'subject', 'statistic', 'position', 'cell'];
export function metricKey(parts) {
  return KEY_FIELDS.map(f => {
    const v = parts[f];
    if (v == null || v === '' || String(v).includes('|')) throw new Error(`[dynasty-history] metricKey: bad ${f} '${v}'`);
    return String(v);
  }).join('|');
}
export function parseMetricKey(key) {
  const seg = String(key).split('|');
  if (seg.length !== KEY_FIELDS.length) throw new Error(`[dynasty-history] parseMetricKey: '${key}' has ${seg.length} segments`);
  return Object.fromEntries(KEY_FIELDS.map((f, i) => [f, seg[i]]));
}

// ─── pure statistics ─────────────────────────────────────────────────────────────────────────────

const byPidSlot = (a, b) => (a.pid < b.pid ? -1 : a.pid > b.pid ? 1 : 0) || a.slot - b.slot;
const orderBy = (key) => (a, b) => (b[key] - a[key]) || byPidSlot(a, b);
const idOf = (i) => `${i.pid}#${i.slot}`;

/** HR@K over items { pid, slot, s, v }: |top-K by s ∩ top-K by v| / K; ties by pid then slot (row identity = pid + slot). */
export function hitRate(items, K) {
  const top = (key) => new Set([...items].sort(orderBy(key)).slice(0, K).map(idOf));
  const A = top('s'), B = top('v');
  let hit = 0;
  for (const x of A) if (B.has(x)) hit++;
  return hit / K;
}

/** One cohort's statistics; a statistic below its minimum sample is null (the cohort does not contribute to it). */
export function cohortStats(items) {
  const n = items.length;
  const out = { n, rho: null, hr12: null, hr24: null };
  if (n >= MIN_ROWS.rho) out.rho = spearman(items.map(i => i.s), items.map(i => i.v));
  if (n >= MIN_ROWS.hr12) out.hr12 = hitRate(items, 12);
  if (n >= MIN_ROWS.hr24) out.hr24 = hitRate(items, 24);
  return out;
}

/** §8.4: p(x) = (average rank − 0.5) / n × 100; bias = p(score) − p(value). One number per item, in order. */
export function percentileBias(items) {
  const n = items.length;
  if (n === 0) return [];
  const rs = rankTransform(items.map(i => i.s));
  const rv = rankTransform(items.map(i => i.v));
  return items.map((_, i) => ((rs[i] - 0.5) / n) * 100 - ((rv[i] - 0.5) / n) * 100);
}

export const labelRho = (ci) => (!ci ? 'insufficient' : ci[0] > 0 ? 'predictive' : ci[1] < 0 ? 'inversely-predictive' : 'not-shown-predictive');
export const labelBaseline = (ci, id) => (!ci ? 'insufficient' : ci[0] > 0 ? `beats-${id}` : ci[1] < 0 ? `loses-to-${id}` : 'no-difference');
export const labelLoo = (ci) => (!ci ? 'insufficient' : ci[0] > 0 ? 'component-helps' : ci[1] < 0 ? 'component-hurts' : 'no-detectable-contribution');
export const labelAblation = (ci) => (!ci ? 'insufficient' : ci[0] > 0 ? 'ablation-better' : ci[1] < 0 ? 'ablation-worse' : 'no-difference');
export const labelBias = (ci) => (!ci ? 'insufficient' : ci[0] > 0 ? 'overrates' : ci[1] < 0 ? 'underrates' : 'no-detectable-bias');
export const labelPs = (ci) => (!ci ? 'insufficient' : ci[1] < 0 ? 'ps-underperforms-score' : ci[0] > 0 ? 'ps-outperforms-score' : 'no-detectable-signal');

/** §8.9 per-position summary; r1 / r2 are the labels versus B1 / B2. Rules in order, first match wins. */
export function perPositionSummary(r1, r2) {
  if (r1 === 'insufficient' || r2 === 'insufficient') return 'insufficient';
  const l1 = r1 === 'loses-to-B1', l2 = r2 === 'loses-to-B2';
  if (l1 && l2) return 'loses-to-both';
  if (l1) return 'loses-to-B1';
  if (l2) return 'loses-to-B2';
  const b1 = r1 === 'beats-B1', b2 = r2 === 'beats-B2';
  if (b1 && b2) return 'beats-both';
  if (b1) return 'beats-B1-only';
  if (b2) return 'beats-B2-only';
  return 'matches';
}

// ─── as-of rows ──────────────────────────────────────────────────────────────────────────────────

const regWeeks = (S) => (S <= 2020 ? 17 : 18);
const round6 = (x) => (x == null ? null : Math.round(x * 1e6) / 1e6);

export function pathOf(res) {
  if (!res || res.score == null) return 'no-position';
  if (res.components) return res.confidence === 'low' ? 'B' : 'C';
  const s = res.signals ?? {};
  if (s.isProspect) return 'A';
  if (s.isUnprovenVet) return 'A2';
  if (s.isStaleData) return 'A3';
  if (s.isDataGap) return 'A4';
  if (s.isNonFinite) return 'non-finite';
  return 'other';
}
const REASON = { A: 'prospect', A2: 'unproven', A3: 'stale', A4: 'data-gap', 'non-finite': 'non-finite', 'no-position': 'no-position', other: 'other' };
const isBC = (p) => p === 'B' || p === 'C';

function mirrorCall(inputs, bundle, options = {}) {
  return (pid) => dynastyScoreMirror(
    pid, inputs.playersMap, inputs.careerStats, bundle.curves, bundle.positionPeakPPG, null, inputs.scoringSettings, null,
    inputs.teamContext, inputs.depthMap, inputs.historicalShares, bundle.positionPeakAge, bundle.positionBasisScale, null, null, options,
  );
}

function looWeights(c) {
  const w = {};
  for (const k of COMPONENTS) w[k] = k === c ? 0 : DYNASTY_WEIGHTS[k] / (1 - DYNASTY_WEIGHTS[c]);
  return w;
}

/** The per-(S, mode) bundle set: H (guarded), A-AGE-APP, A-AGE-DELTA. */
function cohortContext(load, S, mode) {
  const H = buildAsOfInputs(load, S, { curveAgeMode: 'birthdate', gamesMode: mode });
  const guard = guardedAgeCurves(H.careerStats, H.playersMap, { currentYear: S + 1 });
  const app = buildAsOfInputs(load, S, { curveAgeMode: 'app-sleeper', gamesMode: mode });
  const delta = deltaAgeCurves(H.careerStats, H.playersMap, { currentYear: S + 1, anchor: guard });
  return { H, guard, app, delta };
}

/** Every variant's mirror result for `pids`; QB rows for A-QB are scored over every QB with an S row. */
function scoreVariants(load, S, ctx, pids) {
  const { H, guard, app, delta } = ctx;
  const bundleH = guard.bundle;
  const out = {};
  const run = (id, fn) => { out[id] = new Map(pids.map(pid => [pid, fn(pid)])); };

  run('H', mirrorCall(H, bundleH));
  for (const c of COMPONENTS) {
    const w = looWeights(c);
    run(`LOO-${c}`, (pid) => {
      const h = out.H.get(pid);
      return h.components ? { ...h, score: composeDynastyScore(h.raw, w), signals: h.signals } : h;
    });
  }

  // A-C1: advstats targetShare replaces an existing WR/TE reception share
  const adv = asOfLoad(load, S).loadAdvstats(S)?.players ?? {};
  const override = new Map();
  for (const pid of pids) {
    const pos = H.playersMap[pid]?.position;
    const ts = adv[pid]?.targetShare;
    if ((pos === 'WR' || pos === 'TE') && Number.isFinite(ts)) override.set(pid, ts);
  }
  run('A-C1', mirrorCall(H, bundleH, { targetShareOverride: override }));
  run('A-AGE-APP', mirrorCall(H, app.curveBundle));
  run('A-AGE-DELTA', mirrorCall(H, delta.bundle));
  const changer = new Map(pids.map(pid => [pid, isChanger(H.playersMap[pid]?.team ?? null, readTeamS1(load, S, pid))]));
  run('A-ST-chg', mirrorCall(H, bundleH, { shareTrendBoostOff: (pid) => changer.get(pid) === true }));
  run('A-ST-all', mirrorCall(H, bundleH, { shareTrendBoostOff: () => true }));
  run('A-AV-d', mirrorCall(H, bundleH, { reliabilityMix: { consistency: 0, durability: 1 } }));
  run('A-AV-c', mirrorCall(H, bundleH, { reliabilityMix: { consistency: 1, durability: 0 } }));

  // A-QB: the QB-quality modifier without look-ahead
  const scoreH = mirrorCall(H, bundleH);
  const seasonRows = H.careerStats[S] ?? {};
  const qbRows = [];
  for (const pid of H.skillPids) {
    if (H.playersMap[pid].position !== 'QB') continue;
    const r = seasonRows[pid];
    if (!r || !((r.gamesPlayed ?? 0) >= 1) || r.team == null) continue;
    qbRows.push({
      player_id: pid, position: 'QB', nfl_team: r.team, dynastyScore: scoreH(pid),
      currentSeasonPPG: r.fantasyPoints / r.gamesPlayed, ownerTeamName: null, ktcValue: null,
    });
  }
  const qbMap = qbQualityByTeamMirror(qbRows, H.depthMap, true);
  run('A-QB', (pid) => {
    const h = out.H.get(pid);
    const modded = applyQBQualityModifierMirror({
      player_id: pid, position: H.playersMap[pid].position, nfl_team: H.playersMap[pid].team, dynastyScore: h,
    }, qbMap);
    return modded.dynastyScore;
  });
  return out;
}

/** Sleeper-name of a raw players entry (the D-77 name guard's second side). */
const sleeperNameOf = (raw) => (raw ? (raw.full_name ?? `${raw.first_name} ${raw.last_name}`) : null);

function guardedManifestCheck(load, years) {
  const files = load.loadManifest()?.files ?? {};
  for (const y of years) {
    const e = files[`nfl/season-totals/${y}.json`];
    if (!e || e.inProgress !== false) {
      throw new DynastyHistoryStop(`[dynasty-history] outcome season ${y} is not a completed season (manifest nfl/season-totals/${y}.json inProgress !== false)`);
    }
  }
}

/** M1 / M2 for one row from league-rescored outcome season rows. */
export function realisedValue(windowSeasons, gamesAndPoints) {
  const ppgs = [];
  for (const y of windowSeasons) {
    const g = gamesAndPoints(y);
    if (g && g.games >= 8 && Number.isFinite(g.fp) && Number.isFinite(g.games)) ppgs.push(g.fp / g.games);
  }
  const h = windowSeasons.length;
  return {
    M1: ppgs.length ? ppgs.reduce((a, b) => a + b, 0) / ppgs.length : null,
    M2: h ? ppgs.reduce((a, b) => a + b, 0) / h : null,
    h,
  };
}

function practiceSquadWeeks(guarded, S, pid) {
  let n = 0;
  for (const y of [S - 1, S]) {
    const rw = guarded.loadRosterWeekly(y)?.players?.[pid];
    if (!rw) continue;
    for (let w = 1; w <= regWeeks(y); w++) {
      const pairs = rw[w];
      if (Array.isArray(pairs) && pairs.some(p => String(p?.[1] ?? '').split('+').includes('DEV'))) n++;
    }
  }
  return n;
}

export function checkPeakTable(S, position, unguarded, guarded, fallback) {
  const exp = PEAK_TABLE[S]?.[position];
  if (!exp) return;
  const [u, g] = exp;
  const ok = unguarded === u && (g === 'fallback' ? (fallback === true && guarded === u) : (fallback === false && guarded === g));
  if (!ok) {
    throw new DynastyHistoryStop(
      `[dynasty-history] measured guarded peak differs from §8.11's table: S ${S} ${position} measured ${unguarded} → ${fallback ? 'fallback' : guarded}, table ${u} → ${g}`);
  }
}

/**
 * The row set (fixed by H under 'sleeper'), every variant's score under both games modes, baselines, outcomes.
 * Returns { rows, exclusions, leftBC, checks, deliberateDifferences }.
 */
export function buildRows({ load = DYNASTY_HISTORY_LOAD, cohorts = COHORTS, log = () => {} } = {}) {
  const scoringSettings = load.loadLeagueScoring();
  const positionOf = load.loadLeaguePositionOf();
  const rawPlayers = load.loadRawPlayers();
  const og = leagueBasisLoad(outcomeLoad(load), { scoringSettings, positionOf });

  const rows = [];
  const exclusions = {};
  const leftBC = {};
  const checks = { sleeper: {}, snaps: {} };
  let diffs = null;
  const gapTotals = { n: 0, sum: 0, off1: 0 };

  for (const S of cohorts) {
    log(`cohort ${S}`);
    const guarded = asOfLoad(load, S);
    const winSeasons = [];
    for (let y = S + 1; y <= Math.min(S + WINDOW, LAST_COMPLETED_SEASON); y++) winSeasons.push(y);
    guardedManifestCheck(load, winSeasons);

    const ctxs = { sleeper: cohortContext(load, S, 'sleeper') };
    const hRes = new Map();
    const pathHSleeper = {};
    exclusions[S] = {};
    const excl = (pos, reason) => {
      exclusions[S][pos] ??= {};
      exclusions[S][pos][reason] = (exclusions[S][pos][reason] ?? 0) + 1;
    };
    const scoreAll = mirrorCall(ctxs.sleeper.H, ctxs.sleeper.guard.bundle);
    for (const pid of ctxs.sleeper.H.skillPids) {
      const res = scoreAll(pid);
      hRes.set(pid, res);
      const p = pathOf(res);
      pathHSleeper[pid] = p;
      const pos = ctxs.sleeper.H.playersMap[pid].position;
      if (!isBC(p)) excl(pos, REASON[p]);
    }
    // non-skill S rows (kickers, defences…) are outside the universe by construction; counted for the record
    let noPos = 0;
    for (const [pid, r] of Object.entries(ctxs.sleeper.H.careerStats[S] ?? {})) {
      if (pid.startsWith('TEAM_') || !((r?.gamesPlayed ?? 0) > 0)) continue;
      if (!SKILL.includes(positionOf(pid))) noPos++;
    }
    if (noPos) { exclusions[S].NONE = { 'no-position': noPos }; }

    const rowPids = ctxs.sleeper.H.skillPids.filter(pid => isBC(pathHSleeper[pid])).sort();
    for (const pid of rowPids) {
      const ye = ctxs.sleeper.H.playersMap[pid].years_exp;
      if (!(ye >= 2)) throw new DynastyHistoryStop(`[dynasty-history] ${S} pid ${pid}: a Path B/C row with years_exp ${ye} — the file does not say how to treat it`);
    }

    // birthdate coverage (stop in a headline cohort below 95%)
    const coverage = {};
    let missing = 0;
    for (const pid of rowPids) {
      const pm = ctxs.sleeper.H.playersMap[pid];
      coverage[pm.position] ??= { rows: 0, withBirthdate: 0 };
      coverage[pm.position].rows++;
      if (pm.age != null) coverage[pm.position].withBirthdate++;
      else { missing++; excl(pm.position, 'no-birthdate'); }
    }
    if (HEADLINE_COHORTS.includes(S) && rowPids.length && missing / rowPids.length > 0.05) {
      throw new DynastyHistoryStop(`[dynasty-history] birthdate coverage in cohort ${S} is ${(100 * (1 - missing / rowPids.length)).toFixed(1)}% (< 95%)`);
    }

    // peak-age table check (sleeper, H)
    for (const pos of SKILL) {
      checkPeakTable(S, pos, ctxs.sleeper.H.curveBundle.positionPeakAge[pos], ctxs.sleeper.guard.bundle.positionPeakAge[pos], ctxs.sleeper.guard.fallback[pos]);
    }

    ctxs.snaps = cohortContext(load, S, 'snaps');
    const results = {};
    for (const mode of MODES) results[mode] = scoreVariants(load, S, ctxs[mode], rowPids);

    // advstats missing for A-C1
    const adv = guarded.loadAdvstats(S)?.players ?? {};
    const advMissing = {};
    for (const pid of rowPids) {
      const pos = ctxs.sleeper.H.playersMap[pid].position;
      if (pos !== 'WR' && pos !== 'TE') continue;
      advMissing[pos] ??= 0;
      if (!Number.isFinite(adv[pid]?.targetShare)) advMissing[pos]++;
    }

    // per-mode checks and peak / late-career records
    for (const mode of MODES) {
      const c = ctxs[mode];
      const peakAge = { H: {}, 'A-AGE-APP': {}, 'A-AGE-DELTA': {} };
      const late = { H: {}, 'A-AGE-APP': {}, 'A-AGE-DELTA': {} };
      for (const pos of SKILL) {
        peakAge.H[pos] = c.guard.bundle.positionPeakAge[pos];
        peakAge['A-AGE-APP'][pos] = c.app.curveBundle.positionPeakAge[pos];
        peakAge['A-AGE-DELTA'][pos] = c.delta.bundle.positionPeakAge[pos];
        for (const v of ['H', 'A-AGE-APP', 'A-AGE-DELTA']) {
          const rs = rowPids.filter(pid => c.H.playersMap[pid].position === pos).map(pid => results[mode][v].get(pid)).filter(r => r.components);
          late[v][pos] = rs.length ? rs.filter(r => r.signals.isLateCareer).length / rs.length : null;
        }
      }
      checks[mode][S] = {
        ...c.H.meta.checks,
        birthdateCoverage: coverage,
        advstatsMissingA1: advMissing,
        peakAge, lateCareerShare: late,
        peakGuardFallback: { ...c.guard.fallback },
        deltaFallback: { ...c.delta.fallback },
        deltaFloored: { ...c.delta.floored },
      };
    }
    const g = ctxs.sleeper.H.meta.checks.ageGap[S];
    gapTotals.n += g.n; gapTotals.sum += (g.mean ?? 0) * g.n; gapTotals.off1 += g.off1;
    diffs ??= ctxs.sleeper.H.meta.deliberateDifferences;

    // leftBC counts
    for (const v of SCORE_VARIANTS) {
      for (const mode of MODES) {
        for (const pid of rowPids) {
          const pos = ctxs.sleeper.H.playersMap[pid].position;
          const ok = isBC(pathOf(results[mode][v].get(pid)));
          const slot = ((leftBC[v] ??= {})[mode] ??= {});
          ((slot[S] ??= {})[pos] ??= 0);
          if (!ok) slot[S][pos]++;
        }
      }
    }

    // outcomes, baselines, team, practice squad
    const gamesIn = (mode, y, pid, row) => {
      if (mode === 'snaps' && y >= 2013) {
        const e = og.loadSnapShare(y)?.players?.[pid];
        if (e && e.games > 0 && normName(e.name) === normName(sleeperNameOf(rawPlayers?.[pid]))) return e.games;
      }
      return row.gamesPlayed;
    };
    for (const pid of rowPids) {
      const pm = ctxs.sleeper.H.playersMap[pid];
      const teamS1 = readTeamS1(load, S, pid);
      const row = {
        pid, S, position: pm.position,
        path: {}, age: pm.age, ageSleeper: rawPlayers?.[pid]?.age ?? null, yearsExp: pm.years_exp,
        teamS: pm.team ?? null, teamS1, changer: isChanger(pm.team ?? null, teamS1),
        psWeeks: PS_COHORTS.includes(S) ? practiceSquadWeeks(guarded, S, pid) : null,
        scores: {}, raw: null, B1: {}, B2: {}, outcome: {},
      };
      for (const mode of MODES) {
        row.path[mode] = pathOf(results[mode].H.get(pid));
        for (const v of SCORE_VARIANTS) {
          const r = results[mode][v].get(pid);
          (row.scores[v] ??= {})[mode] = isBC(pathOf(r)) ? r.score : null;
        }
        const cs = ctxs[mode].H.careerStats;
        const ppgAt = (y) => {
          const d = cs[y]?.[pid];
          if (!d || !(d.gamesPlayed >= 8) || !Number.isFinite(d.fantasyPoints)) return null;
          return d.fantasyPoints / d.gamesPlayed;
        };
        const pS = ppgAt(S), pS1 = ppgAt(S - 1);
        row.B1[mode] = pS ?? pS1;
        const q = [pS1, pS].filter(x => x != null);
        row.B2[mode] = q.length ? q.reduce((a, b) => a + b, 0) / q.length : null;
        row.outcome[mode] = realisedValue(winSeasons, (y) => {
          const r = og.loadSeasonTotals(y)?.[pid];
          if (!r) return null;
          return { games: gamesIn(mode, y, pid, r), fp: r.fantasyPoints };
        });
      }
      const hs = results.sleeper.H.get(pid);
      row.raw = hs.raw ?? null;
      rows.push(row);
    }
  }

  const gapMean = gapTotals.n ? gapTotals.sum / gapTotals.n : null;
  const deliberateDifferences = [
    ...(diffs ?? []).map(d => (d.startsWith('ages are true ages')
      ? `${d.split('; measured over')[0]}; measured over all cohorts' curve-input rows: n=${gapTotals.n}, ${gapMean == null ? 'mean n/a' : `mean Sleeper − true ${gapMean.toFixed(2)} y`}, ${gapTotals.off1} off by > 1 y`
      : d)),
    'gamesPlayed under the snaps mode is the nflverse season-level snaps count (D-77 definition (c)) under the D-87 name guard; outcomes use the same definition',
    PEAK_GUARD_SENTENCE,
    `A-AGE-APP: ${AGE_APP_LABEL}`,
  ];
  return { rows, exclusions, leftBC, checks, deliberateDifferences };
}

// ─── metrics ─────────────────────────────────────────────────────────────────────────────────────

const sc = (row, m, s) => (s === 'B1' ? row.B1[m] : s === 'B2' ? row.B2[m] : (row.scores[s]?.[m] ?? null));
const val = (row, m, k) => row.outcome[m][k];
const ageBand = (a) => (a == null ? null : a <= 24 ? 'le24' : a <= 27 ? '25-27' : a <= 30 ? '28-30' : 'ge31');

/** Evaluation context over one sample: entries grouped by cohort key; per-sample cache of cohort statistics. */
function makeCtx(entriesByGroup) { return { ebc: entriesByGroup, cache: new Map() }; }

function validItems(ents, m, k, a, b, filt) {
  const items = [];
  for (const e of ents) {
    const s = sc(e.row, m, a);
    if (s == null) continue;
    if (b != null && sc(e.row, m, b) == null) continue;
    if (filt && e.row.path[m] !== filt) continue;
    const v = val(e.row, m, k);
    if (v == null) continue;
    items.push({ pid: e.row.pid, slot: e.slot, s, v, row: e.row });
  }
  return items;
}

function cohortMap(ctx, m, k, a, b = null, filt = null) {
  const key = `${m}|${k}|${a}|${b ?? ''}|${filt ?? ''}`;
  let out = ctx.cache.get(key);
  if (out) return out;
  out = new Map();
  for (const [g, ents] of ctx.ebc) out.set(g, cohortStats(validItems(ents, m, k, a, b, filt)));
  ctx.cache.set(key, out);
  return out;
}

function combine(mapA, mapB, stat) {
  let sum = 0, c = 0, n = 0;
  for (const [g, sa] of mapA) {
    n += sa.n;
    const x = sa[stat];
    if (x == null) continue;
    if (mapB) {
      const y = mapB.get(g)?.[stat];
      if (y == null) continue;
      sum += x - y;
    } else sum += x;
    c++;
  }
  return { v: c ? sum / c : null, c, n };
}

function biasItems(ctx, m, k, groupFilter = null) {
  const key = `bias|${m}|${k}`;
  let out = ctx.cache.get(key);
  if (!out) {
    out = [];
    for (const [g, ents] of ctx.ebc) {
      const items = validItems(ents, m, k, 'H', null, null);
      const b = percentileBias(items);
      items.forEach((it, i) => out.push({ g, row: it.row, bias: b[i] }));
    }
    ctx.cache.set(key, out);
  }
  return groupFilter ? out.filter(groupFilter) : out;
}

const meanOf = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

function ciOf(vals) {
  const R = vals.length;
  if (!R) return null;
  const s = [...vals].sort((a, b) => a - b);
  return { ci95: [s[Math.floor(0.025 * R)], s[Math.ceil(0.975 * R) - 1]], used: R };
}

/** Evaluate `specs` on the point sample and on `resamples` clustered resamples (one shared draw sequence). */
function bootstrapSpecs({ rows, groupKey, specs, resamples, seed }) {
  const entriesOf = (list) => {
    const m = new Map();
    for (const e of list) {
      const g = groupKey(e.row);
      if (!m.has(g)) m.set(g, []);
      m.get(g).push(e);
    }
    return m;
  };
  const point = makeCtx(entriesOf(rows.map(row => ({ row, slot: 0 }))));
  const pointRes = specs.map(sp => sp.eval(point));

  const clusterMap = new Map();
  for (const row of rows) {
    if (!clusterMap.has(row.pid)) clusterMap.set(row.pid, { pid: row.pid, rows: [] });
    clusterMap.get(row.pid).rows.push(row);
  }
  const clusters = [...clusterMap.values()];
  const stash = specs.map(() => []);
  if (clusters.length) {
    clusteredBootstrap(clusters, (sample) => {
      const list = [];
      for (let c = 0; c < sample.length; c++) for (const row of sample[c].rows) list.push({ row, slot: c });
      const ctx = makeCtx(entriesOf(list));
      for (let i = 0; i < specs.length; i++) {
        if (specs[i].skipBoot) continue;
        const r = specs[i].eval(ctx);
        if (r.v != null && Number.isFinite(r.v) && r.c >= specs[i].minC) stash[i].push(r.v);
      }
      return 0;
    }, { resamples, seed });
  }
  return specs.map((sp, i) => ({ point: pointRes[i], boot: sp.skipBoot ? null : ciOf(stash[i]) }));
}

function identicalScores(rows, m, k, a, b) {
  let any = false;
  for (const r of rows) {
    const x = sc(r, m, a), y = sc(r, m, b);
    if (x == null || y == null || val(r, m, k) == null) continue;
    any = true;
    if (x !== y) return false;
  }
  return any;
}

function sameMask(rows, m, a, b) {
  for (const r of rows) if ((sc(r, m, a) == null) !== (sc(r, m, b) == null)) return false;
  return true;
}

/**
 * All metric cells for the panel. `rows` are panel rows (buildRows). Returns { metrics, summary }.
 * Cell: { value, ci95, used, n, cohortsUsed, label }.
 */
export function computeMetrics(rows, { resamples = BOOTSTRAP.resamples, seed = BOOTSTRAP.seed, log = () => {} } = {}) {
  const metrics = {};
  const put = (parts, cell) => { metrics[metricKey(parts)] = cell; };
  const HORIZONS = [
    { id: 'h3', cohorts: HEADLINE_COHORTS, minC: HEADLINE_MIN.cohorts, minN: HEADLINE_MIN.rows },
    { id: 'h2-2023', cohorts: [2023], minC: 1, minN: 0 },
    { id: 'h1-2024', cohorts: [2024], minC: 1, minN: 0 },
  ];

  // per-cohort ρ (H), point only
  for (const S of COHORTS) {
    const horizon = S <= 2022 ? 'h3' : S === 2023 ? 'h2-2023' : 'h1-2024';
    for (const pos of POSITIONS) {
      const posRows = rows.filter(r => r.position === pos && r.S === S);
      for (const m of MODES) for (const k of MEASURES) {
        const st = cohortStats(validItems(posRows.map(row => ({ row, slot: 0 })), m, k, 'H', null, null));
        put({ horizon, measure: k, mode: m, kind: 'cohort', subject: 'H', statistic: 'rho', position: pos, cell: String(S) },
          { value: round6(st.rho), ci95: null, used: null, n: st.n, cohortsUsed: st.rho == null ? 0 : 1, label: st.rho == null ? 'insufficient' : null });
      }
    }
  }

  for (const hz of HORIZONS) {
    for (const pos of POSITIONS) {
      log(`metrics ${hz.id} ${pos}`);
      const prow = rows.filter(r => r.position === pos && hz.cohorts.includes(r.S));
      const specs = [];
      const base = (extra) => ({ horizon: hz.id, position: pos, cell: 'all', ...extra });
      const addLevelDelta = (m, k) => {
        for (const subj of LEVEL_SUBJECTS) {
          for (const st of STATS) {
            specs.push({
              parts: base({ measure: k, mode: m, kind: 'level', subject: subj, statistic: st }), minC: hz.minC, minN: hz.minN,
              eval: (ctx) => combine(cohortMap(ctx, m, k, subj), null, st),
              label: (ci, cell) => (st === 'rho' ? labelRho(ci) : null),
            });
          }
        }
        for (const [a, b, fam] of DELTA_SPECS) {
          const same = sameMask(prow, m, a, b);
          const ident = fam === 'ablation' && identicalScores(prow, m, k, a, b);
          for (const st of STATS) {
            specs.push({
              parts: base({ measure: k, mode: m, kind: 'delta', subject: `${a}~${b}`, statistic: st }), minC: hz.minC, minN: hz.minN,
              identical: ident,
              eval: (ctx) => (same
                ? combine(cohortMap(ctx, m, k, a), cohortMap(ctx, m, k, b), st)
                : combine(cohortMap(ctx, m, k, a, b), cohortMap(ctx, m, k, b, a), st)),
              label: (ci) => {
                if (fam === 'baseline') return labelBaseline(ci, b);
                if (fam === 'loo') return labelLoo(ci);
                return labelAblation(ci);
              },
            });
          }
        }
      };
      for (const m of MODES) for (const k of MEASURES) addLevelDelta(m, k);

      if (hz.id === 'h3') {
        for (const m of MODES) for (const k of MEASURES) {
          for (const band of AGE_BANDS) {
            specs.push({
              parts: base({ measure: k, mode: m, kind: 'bias', subject: 'H', statistic: 'bias', cell: band }), minC: 1, minN: CELL_MIN_ROWS,
              eval: (ctx) => {
                const xs = biasItems(ctx, m, k, (x) => ageBand(x.row.age) === band).map(x => x.bias);
                return { v: xs.length ? meanOf(xs) : null, c: xs.length ? 1 : 0, n: xs.length };
              },
              label: labelBias,
            });
          }
          for (const pc of ['B', 'C']) {
            specs.push({
              parts: base({ measure: k, mode: m, kind: 'path', subject: 'H', statistic: 'rho', cell: pc }), minC: 1, minN: CELL_MIN_ROWS,
              eval: (ctx) => combine(cohortMap(ctx, m, k, 'H', null, pc), null, 'rho'),
              label: labelRho,
            });
          }
          specs.push(psSpec({ parts: base({ measure: k, mode: m, kind: 'ps', subject: 'ps4~ps0', statistic: 'bias' }), m, k }));
        }
      }

      const out = bootstrapSpecs({ rows: prow, groupKey: (r) => r.S, specs, resamples, seed });
      specs.forEach((sp, i) => assemble(sp, out[i]));
    }
  }

  // pooled-over-positions practice-squad diagnostic
  {
    log('metrics ps ALL');
    const prow = rows.filter(r => HEADLINE_COHORTS.includes(r.S));
    const specs = [];
    for (const m of MODES) for (const k of MEASURES) {
      specs.push(psSpec({ parts: { horizon: 'h3', measure: k, mode: m, kind: 'ps', subject: 'ps4~ps0', statistic: 'bias', position: 'ALL', cell: 'all' }, m, k }));
    }
    const out = bootstrapSpecs({ rows: prow, groupKey: (r) => `${r.position}|${r.S}`, specs, resamples, seed });
    specs.forEach((sp, i) => assemble(sp, out[i]));
  }

  function psSpec({ parts, m, k }) {
    return {
      parts, minC: 1, minN: CELL_MIN_ROWS,
      eval: (ctx) => {
        const items = biasItems(ctx, m, k, (x) => PS_COHORTS.includes(x.row.S) && x.row.psWeeks != null);
        const g4 = items.filter(x => x.row.psWeeks >= 4).map(x => x.bias);
        const g0 = items.filter(x => x.row.psWeeks === 0).map(x => x.bias);
        return { v: g4.length && g0.length ? meanOf(g4) - meanOf(g0) : null, c: g4.length && g0.length ? 1 : 0, n: g4.length };
      },
      label: labelPs,
    };
  }

  function assemble(sp, res) {
    const { v, c, n } = res.point;
    const enough = n >= sp.minN && c >= sp.minC && v != null;
    let ci95 = null, used = null, label;
    if (sp.identical) {
      label = 'variant-identical';
    } else if (!enough || !res.boot) {
      label = 'insufficient';
      if (res.boot) { ci95 = res.boot.ci95; used = res.boot.used; }
    } else {
      ci95 = res.boot.ci95; used = res.boot.used;
      label = sp.label(ci95);
    }
    put(sp.parts, { value: round6(v), ci95: ci95 ? ci95.map(round6) : null, used, n, cohortsUsed: c, label });
  }

  const summary = {};
  for (const pos of POSITIONS) {
    const g = (b) => metrics[metricKey({ horizon: 'h3', measure: 'M1', mode: 'sleeper', kind: 'delta', subject: `H~${b}`, statistic: 'rho', position: pos, cell: 'all' })].label;
    summary[pos] = perPositionSummary(g('B1'), g('B2'));
  }
  return { metrics, summary };
}

// ─── run ─────────────────────────────────────────────────────────────────────────────────────────

function assertPreregistered(load) {
  const h = preregHash(load.taskFileText());
  if (h !== DYNASTY_HISTORY_PREREG_SHA256) {
    throw new DynastyHistoryStop(`[dynasty-history] §8 of the task file hashes to ${h}, not the pinned ${DYNASTY_HISTORY_PREREG_SHA256} — the pre-registration changed`);
  }
  return h;
}
function assertSnapsPresent(load) {
  for (let y = 2013; y <= LAST_COMPLETED_SEASON; y++) {
    if (load.loadSnapShare(y) == null) throw new DynastyHistoryStop(`[dynasty-history] nflverse/snaps/${y}.json is missing (the snaps games mode needs 2013–${LAST_COMPLETED_SEASON})`);
  }
}

export function runDynastyHistory({ load = DYNASTY_HISTORY_LOAD, log = () => {}, cohorts = COHORTS, resamples = BOOTSTRAP.resamples } = {}) {
  const preregSha256 = assertPreregistered(load);
  assertSnapsPresent(load);
  const built = buildRows({ load, cohorts, log });
  const { metrics, summary } = computeMetrics(built.rows, { resamples, seed: BOOTSTRAP.seed, log });
  const meta = {
    generatedAt: load.now(), dataRev: load.gitRev(), goldenSourceRev: load.goldenSourceRev(), preregSha256,
    cohorts, headlineCohorts: HEADLINE_COHORTS, asOfDate: '(S+1)-06-01',
    scoringFixture: LEAGUE_SCORING_FIXTURE, positionFile: 'raw/-players-nfl.json',
    bootstrap: { resamples, seed: BOOTSTRAP.seed },
    exclusions: built.exclusions, leftBC: built.leftBC, checks: built.checks,
    deliberateDifferences: built.deliberateDifferences,
  };
  return { meta, rows: built.rows, metrics, summary };
}

// ─── verdict ─────────────────────────────────────────────────────────────────────────────────────

const f3 = (x) => (x == null ? 'n/a' : (x >= 0 ? '' : '') + x.toFixed(3));
const sg = (x) => (x == null ? 'n/a' : `${x >= 0 ? '+' : ''}${x.toFixed(3)}`);
const ciStr = (c) => (c.ci95 ? `[${sg(c.ci95[0])}, ${sg(c.ci95[1])}]` : 'n/a');
const cellTxt = (c, signed = false) => `${signed ? sg(c.value) : f3(c.value)} ${ciStr(c)} (n=${c.n}, cohorts=${c.cohortsUsed}) ${c.label ?? ''}`.trim();

/** Fetch a cell; a missing key throws (T-KEYS). */
export function cellOf(metrics, parts, seen = null) {
  const key = metricKey(parts);
  const c = metrics[key];
  if (!c) throw new Error(`[dynasty-history] verdict reads a metric with no panel key: ${key}`);
  seen?.add(key);
  return c;
}

export function buildDynastyHistoryVerdictMarkdown(result, { seen = null } = {}) {
  const { meta, metrics, summary } = result;
  const out = [];
  const w = (...l) => out.push(...l);
  const C = (p) => cellOf(metrics, { cell: 'all', ...p }, seen);
  const NOTE = (id) => (id === 'A-AGE-APP' || String(id).includes('A-AGE-APP') ? AGE_APP_LABEL : '');
  const date = meta.generatedAt.slice(0, 10);

  w(`# Dynasty score — first historical test (S3b) · ${date}`, '',
    `- Date: ${date} · data rev \`${meta.dataRev}\` · golden app rev \`${meta.goldenSourceRev}\``,
    `- Pre-registration hash (task file §8): \`${meta.preregSha256}\``,
    `- Cohorts S = ${meta.cohorts[0]}…${meta.cohorts[meta.cohorts.length - 1]} (headline S = ${meta.headlineCohorts[0]}–${meta.headlineCohorts[meta.headlineCohorts.length - 1]}, h = 3); ages as of ${meta.asOfDate}; bootstrap ${meta.bootstrap.resamples} player-clustered resamples, seed ${meta.bootstrap.seed}.`,
    '- **Offline research; nothing ships.** Nothing here reaches the app\'s scoring.', '');

  // 2
  w('## 2. What the evidence supports, and what it does not', '',
    'Every sentence uses only the pre-registered labels with their numbers. Primary measure M1 (mean points per game over the seasons he qualified), games as Sleeper counts them, headline cohorts 2015–2022. The baseline comparison per position is the pre-specified test; everything else is exploratory (no multiplicity correction).', '');
  for (const pos of POSITIONS) {
    const rho = C({ horizon: 'h3', measure: 'M1', mode: 'sleeper', kind: 'level', subject: 'H', statistic: 'rho', position: pos });
    const d1 = C({ horizon: 'h3', measure: 'M1', mode: 'sleeper', kind: 'delta', subject: 'H~B1', statistic: 'rho', position: pos });
    const d2 = C({ horizon: 'h3', measure: 'M1', mode: 'sleeper', kind: 'delta', subject: 'H~B2', statistic: 'rho', position: pos });
    const rs = C({ horizon: 'h3', measure: 'M1', mode: 'snaps', kind: 'level', subject: 'H', statistic: 'rho', position: pos });
    const ds1 = C({ horizon: 'h3', measure: 'M1', mode: 'snaps', kind: 'delta', subject: 'H~B1', statistic: 'rho', position: pos });
    const ds2 = C({ horizon: 'h3', measure: 'M1', mode: 'snaps', kind: 'delta', subject: 'H~B2', statistic: 'rho', position: pos });
    let s = `**${pos}.** The score's rank correlation with realised value is ${f3(rho.value)} ${ciStr(rho)} over ${rho.cohortsUsed} cohorts and ${rho.n} rows: \`${rho.label}\`. ` +
      `Against last season's points per game (B1) the difference is ${sg(d1.value)} ${ciStr(d1)}: \`${d1.label}\`; against the two-year average (B2) ${sg(d2.value)} ${ciStr(d2)}: \`${d2.label}\`. Per-position summary: \`${summary[pos]}\`.`;
    const differs = rs.label !== rho.label || ds1.label !== d1.label || ds2.label !== d2.label;
    s += differs
      ? ` Under snaps-based games the labels differ: ρ ${f3(rs.value)} ${ciStr(rs)} \`${rs.label}\`; vs B1 \`${ds1.label}\`; vs B2 \`${ds2.label}\`.`
      : ' Snaps-based games give the same labels.';
    w(s, '');
  }
  {
    const lines = [];
    for (const pos of POSITIONS) for (const band of AGE_BANDS) {
      const c = C({ horizon: 'h3', measure: 'M2', mode: 'sleeper', kind: 'bias', subject: 'H', statistic: 'bias', position: pos, cell: band });
      if (c.label !== 'no-detectable-bias') lines.push(`${pos} ${band}: ${sg(c.value)} ${ciStr(c)} (n=${c.n}) \`${c.label}\``);
    }
    w(`**Age bias** (M2, Sleeper games; bias in percentile points, positive = the score rates him higher than he turned out). ${lines.length ? `Cells with a label other than \`no-detectable-bias\`: ${lines.join('; ')}.` : 'Every cell is `no-detectable-bias` or `insufficient` (see §5).'}`, '');
  }
  {
    const cnt = {};
    const flagged = [];
    for (const pos of POSITIONS) for (const c of COMPONENTS) {
      const x = C({ horizon: 'h3', measure: 'M1', mode: 'sleeper', kind: 'delta', subject: `H~LOO-${c}`, statistic: 'rho', position: pos });
      cnt[x.label] = (cnt[x.label] ?? 0) + 1;
      if (x.label === 'component-helps' || x.label === 'component-hurts') flagged.push(`${pos} ${c} ${sg(x.value)} ${ciStr(x)} \`${x.label}\``);
    }
    const abl = [];
    for (const [a, b, fam] of DELTA_SPECS) {
      if (fam !== 'ablation') continue;
      for (const pos of POSITIONS) {
        const x = C({ horizon: 'h3', measure: 'M1', mode: 'sleeper', kind: 'delta', subject: `${a}~${b}`, statistic: 'rho', position: pos });
        if (x.label === 'ablation-better' || x.label === 'ablation-worse') abl.push(`${a}~${b} ${pos} ${sg(x.value)} ${ciStr(x)} \`${x.label}\`${b === 'A-AGE-APP' ? ` — ${AGE_APP_LABEL}` : ''}`);
      }
    }
    w(`**Components and ablations** (exploratory; ρ, M1, Sleeper games). Leave-one-component-out labels over 20 cells: ${Object.entries(cnt).map(([k, v]) => `${v} × \`${k}\``).join(', ')}. ${flagged.length ? `Labelled cells: ${flagged.join('; ')}.` : ''} ` +
      `${abl.length ? `Ablation cells labelled better or worse: ${abl.join('; ')}.` : 'No ablation cell is labelled better or worse.'}`, '');
  }

  // 3
  w('## 3. Headline ρ (H score vs realised value, equal-weight cohort average, S = 2015–2022)', '',
    '| position | measure | games | ρ | 95% CI | n | cohorts | label |', '|---|---|---|---|---|---|---|---|');
  for (const pos of POSITIONS) for (const k of MEASURES) for (const m of MODES) {
    const c = C({ horizon: 'h3', measure: k, mode: m, kind: 'level', subject: 'H', statistic: 'rho', position: pos });
    w(`| ${pos} | ${k} | ${m} | ${f3(c.value)} | ${ciStr(c)} | ${c.n} | ${c.cohortsUsed} | ${c.label} |`);
  }
  w('');

  // 4
  w('## 4. Baselines the score must beat', '', 'B1 = last qualifying season\'s PPG; B2 = mean PPG of the qualifying seasons among {S−1, S}. Δ = H − baseline.', '');
  for (const k of MEASURES) for (const m of MODES) {
    w(`**${k}, ${m} games**`, '', '| position | statistic | H | B1 | B2 | H−B1 (CI) label | H−B2 (CI) label |', '|---|---|---|---|---|---|---|');
    for (const pos of POSITIONS) for (const st of STATS) {
      const lv = (subject) => C({ horizon: 'h3', measure: k, mode: m, kind: 'level', subject, statistic: st, position: pos });
      const dl = (b) => C({ horizon: 'h3', measure: k, mode: m, kind: 'delta', subject: `H~${b}`, statistic: st, position: pos });
      w(`| ${pos} | ${st} | ${f3(lv('H').value)} | ${f3(lv('B1').value)} | ${f3(lv('B2').value)} | ${sg(dl('B1').value)} ${ciStr(dl('B1'))} ${dl('B1').label} | ${sg(dl('B2').value)} ${ciStr(dl('B2'))} ${dl('B2').label} |`);
    }
    w('');
  }
  w('Per-position summary (ρ, M1, Sleeper games only): ' + POSITIONS.map(p => `${p} \`${summary[p]}\``).join(', ') + '.', '');

  // 5
  w('## 5. Age-band bias (H age on 1 June after S; percentile points; pooled over headline cohorts)', '');
  for (const k of MEASURES) for (const m of MODES) {
    w(`**${k}, ${m} games**`, '', `| position | ${AGE_BANDS.join(' | ')} |`, `|---|${AGE_BANDS.map(() => '---').join('|')}|`);
    for (const pos of POSITIONS) {
      w(`| ${pos} | ${AGE_BANDS.map(b => { const c = C({ horizon: 'h3', measure: k, mode: m, kind: 'bias', subject: 'H', statistic: 'bias', position: pos, cell: b }); return `${sg(c.value)} ${ciStr(c)} n=${c.n} ${c.label}`; }).join(' | ')} |`);
    }
    w('');
  }

  // 6
  w('## 6. Leave-one-component-out (Δρ = ρ(H) − ρ(LOO); positive = the component helps)', '');
  for (const k of MEASURES) for (const m of MODES) {
    w(`**${k}, ${m} games**`, '', `| position | ${COMPONENTS.join(' | ')} |`, `|---|${COMPONENTS.map(() => '---').join('|')}|`);
    for (const pos of POSITIONS) {
      w(`| ${pos} | ${COMPONENTS.map(c => { const x = C({ horizon: 'h3', measure: k, mode: m, kind: 'delta', subject: `H~LOO-${c}`, statistic: 'rho', position: pos }); return `${sg(x.value)} ${ciStr(x)} ${x.label}`; }).join(' | ')} |`);
    }
    w('');
  }

  // 7
  w('## 7. Ablations (Δρ = ρ(variant) − ρ(H))', '');
  for (const k of MEASURES) for (const m of MODES) {
    w(`**${k}, ${m} games**`, '', '| position | ablation | Δρ | 95% CI | n | label | note |', '|---|---|---|---|---|---|---|');
    for (const pos of POSITIONS) for (const a of ABLATIONS_VS_H.filter(x => x !== 'A-AGE-DELTA')) {
      const x = C({ horizon: 'h3', measure: k, mode: m, kind: 'delta', subject: `${a}~H`, statistic: 'rho', position: pos });
      w(`| ${pos} | ${a} | ${sg(x.value)} | ${ciStr(x)} | ${x.n} | ${x.label} | |`);
    }
    w('');
  }
  w('### 7.1 Age-curve comparisons (§8.11; first-named side is judged; exploratory)', '',
    '| measure | games | position | comparison | Δρ | 95% CI | n | label | note |', '|---|---|---|---|---|---|---|---|---|');
  for (const k of MEASURES) for (const m of MODES) for (const pos of POSITIONS) {
    for (const subj of ['H~A-AGE-APP', 'A-AGE-DELTA~A-AGE-APP', 'A-AGE-DELTA~H']) {
      const x = C({ horizon: 'h3', measure: k, mode: m, kind: 'delta', subject: subj, statistic: 'rho', position: pos });
      w(`| ${k} | ${m} | ${pos} | ${subj} | ${sg(x.value)} | ${ciStr(x)} | ${x.n} | ${x.label} | ${NOTE(subj)} |`);
    }
  }
  w('', '### 7.2 Peak ages and late-career shares by cohort (Sleeper games)', '',
    '| S | variant | QB peak / late | RB peak / late | WR peak / late | TE peak / late | H fallback (QB RB WR TE) | delta fallback / floored | note |', '|---|---|---|---|---|---|---|---|---|');
  for (const S of meta.cohorts) {
    const ck = meta.checks.sleeper[S];
    for (const v of ['H', 'A-AGE-APP', 'A-AGE-DELTA']) {
      const cells = POSITIONS.map(p => `${ck.peakAge[v][p] ?? 'n/a'} / ${ck.lateCareerShare[v][p] == null ? 'n/a' : (100 * ck.lateCareerShare[v][p]).toFixed(0) + '%'}`);
      const fb = v === 'H' ? POSITIONS.map(p => (ck.peakGuardFallback[p] ? 'F' : '-')).join(' ') : '';
      const dl = v === 'A-AGE-DELTA' ? POSITIONS.map(p => `${ck.deltaFallback[p] ? 'F' : '-'}/${ck.deltaFloored[p]}`).join(' ') : '';
      w(`| ${S} | ${v} | ${cells.join(' | ')} | ${fb} | ${dl} | ${NOTE(v)} |`);
    }
  }
  w('');

  // 8
  w('## 8. Practice-squad diagnostic (D-79; S = 2018–2022; diagnostic only — no input added)', '',
    'Δ = mean bias of rows with ≥ 4 practice-squad weeks (S−1 and S) minus rows with 0. Bias = percentile(score) − percentile(realised), so a negative Δ means the score rated the practice-squad group lower than they turned out. **The label words are the pre-registered ones (§8.9): `ps-underperforms-score` is attached to CI upper < 0 and `ps-outperforms-score` to CI lower > 0 — read the sign of Δ, not the word.**', '',
    '| measure | games | position | Δ bias | 95% CI | n (≥4 weeks) | label |', '|---|---|---|---|---|---|---|');
  for (const k of MEASURES) for (const m of MODES) for (const pos of [...POSITIONS, 'ALL']) {
    const c = C({ horizon: 'h3', measure: k, mode: m, kind: 'ps', subject: 'ps4~ps0', statistic: 'bias', position: pos });
    w(`| ${k} | ${m} | ${pos} | ${sg(c.value)} | ${ciStr(c)} | ${c.n} | ${c.label} |`);
  }
  w('');

  // 9
  w('## 9. Path B-only and C-only ρ (descriptive, not headline)', '', '| measure | games | position | path | ρ | 95% CI | n | cohorts | label |', '|---|---|---|---|---|---|---|---|---|');
  for (const k of MEASURES) for (const m of MODES) for (const pos of POSITIONS) for (const pc of ['B', 'C']) {
    const c = C({ horizon: 'h3', measure: k, mode: m, kind: 'path', subject: 'H', statistic: 'rho', position: pos, cell: pc });
    w(`| ${k} | ${m} | ${pos} | ${pc} | ${f3(c.value)} | ${ciStr(c)} | ${c.n} | ${c.cohortsUsed} | ${c.label} |`);
  }
  w('');

  // 10
  w('## 10. Short horizons — not pooled with the headline', '');
  for (const [hz, title] of [['h2-2023', 'S = 2023 (h = 2)'], ['h1-2024', 'S = 2024 (h = 1)']]) {
    w(`### ${title} — not pooled with the headline`, '', '| position | measure | games | ρ(H) | ρ(B1) | ρ(B2) | H−B1 label | H−B2 label |', '|---|---|---|---|---|---|---|---|');
    for (const pos of POSITIONS) for (const k of MEASURES) for (const m of MODES) {
      const lv = (subject) => C({ horizon: hz, measure: k, mode: m, kind: 'level', subject, statistic: 'rho', position: pos });
      const dl = (b) => C({ horizon: hz, measure: k, mode: m, kind: 'delta', subject: `H~${b}`, statistic: 'rho', position: pos });
      w(`| ${pos} | ${k} | ${m} | ${f3(lv('H').value)} ${ciStr(lv('H'))} ${lv('H').label} | ${f3(lv('B1').value)} | ${f3(lv('B2').value)} | ${sg(dl('B1').value)} ${ciStr(dl('B1'))} ${dl('B1').label} | ${sg(dl('B2').value)} ${ciStr(dl('B2'))} ${dl('B2').label} |`);
    }
    w('');
  }

  // 11
  w('## 11. Per-cohort ρ (H) — left-truncation in early cohorts is visible here', '');
  for (const k of MEASURES) for (const m of MODES) {
    w(`**${k}, ${m} games**`, '', `| position | ${meta.cohorts.join(' | ')} |`, `|---|${meta.cohorts.map(() => '---').join('|')}|`);
    for (const pos of POSITIONS) {
      w(`| ${pos} | ${meta.cohorts.map(S => {
        const horizon = S <= 2022 ? 'h3' : S === 2023 ? 'h2-2023' : 'h1-2024';
        const c = cellOf(metrics, { horizon, measure: k, mode: m, kind: 'cohort', subject: 'H', statistic: 'rho', position: pos, cell: String(S) }, seen);
        return `${c.value == null ? 'n/a' : f3(c.value)} (n=${c.n})`;
      }).join(' | ')} |`);
    }
    w('');
  }

  // 12
  w('## 12. Exclusions and deliberate differences', '', '**Exclusions** (rows removed from the scored population, per cohort × position × reason; `no-birthdate` rows are kept and only counted):', '',
    '| S | position | reasons |', '|---|---|---|');
  for (const S of meta.cohorts) for (const [pos, reasons] of Object.entries(meta.exclusions[S] ?? {})) {
    w(`| ${S} | ${pos} | ${Object.entries(reasons).map(([r, n]) => `${r} ${n}`).join(', ')} |`);
  }
  w('', '**Rows leaving Path B/C under a variant or games mode** (`meta.leftBC`, total over cohorts): ' +
    (() => {
      const parts = [];
      for (const [v, byMode] of Object.entries(meta.leftBC)) for (const [m, byS] of Object.entries(byMode)) {
        const tot = Object.values(byS).reduce((a, byPos) => a + Object.values(byPos).reduce((x, y) => x + y, 0), 0);
        if (tot) parts.push(`${v}/${m} ${tot}`);
      }
      return parts.length ? parts.join(', ') + '.' : 'none.';
    })(), '');
  w('**Measured Sleeper-vs-birthdate age gap per S** (Sleeper − true, over the curve-input rows):', '', '| S | n | mean (y) | off by > 1 y |', '|---|---|---|---|');
  for (const S of meta.cohorts) {
    const g = meta.checks.sleeper[S].ageGap[S];
    w(`| ${S} | ${g.n} | ${g.mean == null ? 'n/a' : g.mean.toFixed(2)} | ${g.off1} |`);
  }
  w('', '**Deliberate differences from the app:**', '');
  for (const d of meta.deliberateDifferences) w(`- ${d}`);
  w('', '**Not in this test:** prospects (first- and second-year players); everything KTC-based (no KTC history before 2026-05); the league rookie-draft pick; the in-season live level; and, in the headline, the QB-quality modifier (tested separately as A-QB).', '');

  // 13
  w('## 13. Never output', '',
    'This report prints no weight, no constant, no multiplier, no fitted parameter and no recommendation to change or wire anything. A label is evidence for S4, not a decision.');

  // A-AGE-APP: every non-table line that names it carries the label sentence
  return out.map(l => (l.includes('A-AGE-APP') && !l.includes(AGE_APP_LABEL) && !l.startsWith('|') ? `${l} — ${AGE_APP_LABEL}` : l)).join('\n');
}

// ─── backlog appends (§14) ───────────────────────────────────────────────────────────────────────

export function buildBacklogAppends(result, sha) {
  const { metrics, meta } = result;
  const date = meta.generatedAt.slice(0, 10);
  const parts = POSITIONS.map(pos => {
    const c = cellOf(metrics, { horizon: 'h3', measure: 'M1', mode: 'sleeper', kind: 'delta', subject: 'H~A-AGE-APP', statistic: 'rho', position: pos, cell: 'all' });
    return `${pos} ${sg(c.value)} ${ciStr(c)} ${c.label}`;
  });
  let differ = 0, skips = 0;
  const last = meta.checks.snaps[meta.cohorts[meta.cohorts.length - 1]] ?? {};
  for (const v of Object.values(last.snapsGamesDiffer ?? {})) differ += v;
  for (const v of Object.values(last.snapsNameGuardSkips ?? {})) skips += v;
  const ps = cellOf(metrics, { horizon: 'h3', measure: 'M1', mode: 'sleeper', kind: 'ps', subject: 'ps4~ps0', statistic: 'bias', position: 'ALL', cell: 'all' });
  return {
    staleAge: `Append (S3b, ${date}, data \`${sha}\`): A-AGE-APP vs H, Δρ per position (M1, sleeper games; H − A-AGE-APP, first-named side judged): ${parts.join('; ')}. This is ${AGE_APP_LABEL}. Verdict §7.`,
    d77: `Append (S3b, ${date}, data \`${sha}\`): the dynasty history test reports every metric under Sleeper \`gamesPlayed\` and a season-level snaps count (definition (c), with the D-87 name guard); ${differ} player-seasons differ, ${skips} name-guard skips (seasons 2013–${meta.cohorts[meta.cohorts.length - 1]}); verdict \`grading/${date}-dynasty-history-verdict.md\` §3. The D-77 build is unchanged.`,
    d79: `Append (S3b, ${date}, data \`${sha}\`): practice-squad history as a dynasty-score role input — diagnostic only, cohorts 2018–2022, label ${ps.label} (verdict §8). No input added.`,
  };
}

// ─── artifacts / main ────────────────────────────────────────────────────────────────────────────

export function serializePanel(result) {
  const { rows, ...rest } = result;
  const head = JSON.stringify({ meta: rest.meta }, null, 2).slice(0, -2);
  const tail = JSON.stringify({ metrics: rest.metrics, summary: rest.summary }, null, 1).slice(1, -2);
  return `${head},\n"rows": [\n${rows.map(r => JSON.stringify(r)).join(',\n')}\n],${tail}\n}\n`;
}

export function writeDynastyHistoryArtifacts({ result, verdictMd, root = null }) {
  const date = result.meta.generatedAt.slice(0, 10);
  const panelPath = `backtests/${date}-dynasty-history-panel.json`;
  const verdictPath = `grading/${date}-dynasty-history-verdict.md`;
  const panelJson = serializePanel(result);
  const panelBytes = Buffer.byteLength(panelJson);
  if (panelBytes > PANEL_MAX_BYTES) throw new DynastyHistoryStop(`[dynasty-history] the panel is ${panelBytes} bytes (> 15 MB)`);
  const abs = (rel) => (root ? path.join(root, rel) : repoPath(rel));
  fs.mkdirSync(abs('backtests'), { recursive: true });
  fs.mkdirSync(abs('grading'), { recursive: true });
  fs.writeFileSync(abs(panelPath), panelJson, 'utf8');
  fs.writeFileSync(abs(verdictPath), verdictMd.endsWith('\n') ? verdictMd : verdictMd + '\n', 'utf8');
  return { panelPath, verdictPath, panelBytes };
}

/** The `--dynasty-history` branch body of `bin/backtest.mjs`. Exit 1 on a DynastyHistoryStop (nothing written). */
export function dynastyHistoryMain({
  load = DYNASTY_HISTORY_LOAD, write = false, asJson = false, writeArtifacts = writeDynastyHistoryArtifacts,
  log = console.log, logErr = console.error,
} = {}) {
  try {
    const result = runDynastyHistory({ load, log: (m) => logErr(`[backtest] ${m}`) });
    const verdictMd = buildDynastyHistoryVerdictMarkdown(result);
    if (write) {
      const wr = writeArtifacts({ result, verdictMd });
      logErr(`[backtest] Wrote ${wr.panelPath} (${wr.panelBytes} B), ${wr.verdictPath}`);
    }
    log(asJson ? JSON.stringify({ meta: result.meta, metrics: result.metrics, summary: result.summary }, null, 2) : verdictMd);
    return 0;
  } catch (err) {
    if (err instanceof DynastyHistoryStop) {
      logErr(`[backtest] ${err.message}`);
      return 1;
    }
    throw err;
  }
}
