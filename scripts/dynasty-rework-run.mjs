/**
 * scripts/dynasty-rework-run.mjs — S4a: the veteran dynasty score rework (`bin/backtest.mjs --dynasty-rework`).
 * Task file: .claude/tasks/dynasty-rework-s4a.md (Revision 2; §4–§5 hashed, pinned below).
 *
 * Offline research only: builds S3's H rows for S = 2015…2024 on the pinned inputs, checks them against the S3
 * history panel, fits four fixed candidate reworks out of sample (buffered leave-one-cohort-out folds), and issues the
 * pre-registered S4A-WIN / S4A-NO-WIN verdict. No served file, no manifest entry, nothing reaches the app.
 *
 * Public exports:
 *   DynastyReworkStop, TASK_FILE, DYNASTY_REWORK_PREREG_SHA256, PINNED_REV, preregHash(text), assertPrereg(load)
 *   makeGitShow(exec), makeReworkLoad({ gitShow }), DYNASTY_REWORK_LOAD
 *   readQbFloor(load), buildReworkRows({ load, cohorts, log }), checkS3Parity(rows, panel, cohorts)
 *   runFolds({ rows, plan, slot, log }), runFinal({ rows, log }), viewRows(rows, horizon), buildSpecs(hz, pos)
 *   computeReworkMetrics(rows, { resamples, seed, log }), runDynastyRework({ load, log }), runProbe({ load, print })
 *   buildDynastyReworkVerdictMarkdown(result), writeDynastyReworkArtifacts({ result, verdictMd, root }), dynastyReworkMain(…)
 * plus the statistics copied from scripts/dynasty-history-run.mjs (bootstrapSpecs, assemble, biasItems, …).
 */
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { execFileSync, execSync } from 'child_process';
import { repoPath } from '../lib/io.mjs';
import { clusteredBootstrap } from '../lib/inSeasonEvidence.mjs';
import { dynastyScoreMirror, pickDynastyLabelMirror } from '../lib/dynastyMirror.mjs';
import { guardedAgeCurves } from '../lib/ageCurveVariants.mjs';
import { leagueBasisLoad } from '../lib/leagueBasis.mjs';
import {
  POSITIONS, CANDIDATES, SELECTABLE, BETA_GRID, QB_B2_DELTA_FLOOR, K3_REPORT_ONLY_SENTENCE, ageBand, level2Of, level2Pool,
  currentLevel2Score, ageAdj2Score, curveRatios, foldPlan, fitCandidate, selectCandidate, scoreWithFit, gridSize, ageTilt,
  tiltLabel, decide, HEADLINE_FIT_COHORTS, COHORT_ARRAY,
} from '../lib/dynastyRework.mjs';
import {
  DYNASTY_ASOF_LOAD, buildAsOfInputs, outcomeLoad, readTeamS1, isChanger, LAST_COMPLETED_SEASON,
} from './dynasty-asof.mjs';
import {
  realisedValue, cohortStats, percentileBias, labelBaseline, labelBias, labelRho, pathOf, metricKey, parseMetricKey,
} from './dynasty-history-run.mjs';

export class DynastyReworkStop extends Error {
  constructor(message, count = null) { super(message); this.name = 'DynastyReworkStop'; this.count = count; }
}

export const TASK_FILE = '.claude/tasks/dynasty-rework-s4a.md';
/** SHA-256 of §4–§5 of the committed task file (data a4f2294), pinned before any real-data result was computed. */
export const DYNASTY_REWORK_PREREG_SHA256 = 'ef68a7696f150182dad86e6b4008c8f7b63d14db9e7ba213c8da976689df2d91';
export const PINNED_REV = 'a791db0';
export const S3_PANEL_PATH = 'backtests/2026-10-30-dynasty-history-panel.json';
export const QB_FLOOR_KEY = 'h3|M1|sleeper|delta|H~B2|rho|QB|all';

export const COHORTS = COHORT_ARRAY(2015, 2024);
export const HEADLINE_COHORTS = HEADLINE_FIT_COHORTS;
export const PREVIEW_COHORT = 2025;
export const WINDOW = 3;
export const BOOTSTRAP = { resamples: 4000, seed: 12345 };
export const PANEL_MAX_BYTES = 15 * 1024 * 1024;
export const AGE_BANDS = ['le24', '25-27', '28-30', 'ge31'];
export const CELL_MIN_ROWS = 30;
export const TILT_MIN_USED = 2000;
export const OOF_KS = CANDIDATES.map(K => `${K}-oof`);
export const OOF_IDS = ['P', ...OOF_KS];
export const COMPONENT_NAMES = {
  K0: ['ageAdj', 'trajectory', 'currentLevel', 'reliability', 'opportunity'],
  K1: ['ageAdj2', 'currentLevel2', 'reliability', 'opportunity'],
  K2: ['ageFwd', 'currentLevel2', 'reliability', 'opportunity'],
  K3: ['ageFwd', 'currentLevel2', 'reliability', 'opportunityChg'],
};
export const NO_WIN_LAST_LINE = 'Per the S4 brief, Session 1 proposes the display-only fallback; no rework is forced.';

/** Horizons of the metrics (§6). `slot` = which out-of-fold score set (runFolds) the view reads. */
export const HORIZONS = [
  { id: 'h3', cohorts: HEADLINE_COHORTS, slot: 'loco', minC: 6, minN: 160 },
  { id: 'h3-fwd', cohorts: COHORT_ARRAY(2018, 2022), slot: 'forward', minC: 4, minN: 100 },
  { id: 'h2-2023', cohorts: [2023], slot: 'short', minC: 1, minN: 0 },
  { id: 'h1-2024', cohorts: [2024], slot: 'short', minC: 1, minN: 0 },
];

// ─── loaders ─────────────────────────────────────────────────────────────────────────────────────

/** `git show <rev>:<path>` through an injectable exec seam (precedent: scripts/migrate-absence-role.mjs:75-76). */
export function makeGitShow(exec = execFileSync) {
  return (rev, relPath) => exec('git', ['show', `${rev}:${relPath}`], { cwd: repoPath('.'), maxBuffer: 1 << 30 }).toString();
}

/**
 * DYNASTY_ASOF_LOAD plus the task-file/clock seams, the S3 panel, and — for parity — playerids and the raw players
 * parsed once from rev a791db0 (the playerids workflow refreshes on Wednesdays; one birthdate change would move the
 * guarded curves and many H scores).
 */
export function makeReworkLoad({ gitShow = makeGitShow(), base = DYNASTY_ASOF_LOAD } = {}) {
  let ids = null, rawPlayers = null, panel = null;
  return {
    ...base,
    taskFileText: () => fs.readFileSync(repoPath(TASK_FILE), 'utf8'),
    gitRev: () => execSync('git rev-parse --short HEAD', { cwd: repoPath('.') }).toString().trim(),
    now: () => new Date().toISOString(),
    clock: () => performance.now(),
    gitShow,
    loadS3Panel: () => (panel ??= JSON.parse(fs.readFileSync(repoPath(S3_PANEL_PATH), 'utf8'))),
    loadPlayerIds: () => (ids ??= JSON.parse(gitShow(PINNED_REV, 'nflverse/playerids.json'))),
    loadRawPlayers: () => (rawPlayers ??= JSON.parse(gitShow(PINNED_REV, 'raw/-players-nfl.json'))),
  };
}
export const DYNASTY_REWORK_LOAD = makeReworkLoad();

// ─── pre-registration hash (§5.13) ───────────────────────────────────────────────────────────────

/** SHA-256 over the LF-split lines strictly between the first `## 4. Row set and S3 parity` line and the first later `## 6. Outputs` line. */
export function preregHash(text) {
  const lines = String(text).split('\n');
  const a = lines.findIndex(l => l === '## 4. Row set and S3 parity');
  if (a < 0) throw new DynastyReworkStop('[dynasty-rework] the task file has no "## 4. Row set and S3 parity" line');
  const b = lines.findIndex((l, i) => i > a && l === '## 6. Outputs');
  if (b < 0) throw new DynastyReworkStop('[dynasty-rework] the task file has no "## 6. Outputs" line after §4');
  return createHash('sha256').update(lines.slice(a + 1, b).join('\n'), 'utf8').digest('hex');
}

/** The first statement of runProbe and runDynastyRework: it calls no loader but `taskFileText`. */
export function assertPrereg(load) {
  const h = preregHash(load.taskFileText());
  if (h !== DYNASTY_REWORK_PREREG_SHA256) {
    throw new DynastyReworkStop(`[dynasty-rework] §4–§5 of the task file hash to ${h}, not the pinned ${DYNASTY_REWORK_PREREG_SHA256} — the pre-registration changed`);
  }
  return h;
}

/** The S3 panel's stored `h3|M1|sleeper|delta|H~B2|rho|QB|all` value must be exactly −0.052245 (§5.10). */
export function readQbFloor(load) {
  const v = load.loadS3Panel()?.metrics?.[QB_FLOOR_KEY]?.value;
  if (v !== QB_B2_DELTA_FLOOR) {
    throw new DynastyReworkStop(`[dynasty-rework] the S3 panel's ${QB_FLOOR_KEY} is ${v}, not ${QB_B2_DELTA_FLOOR}`);
  }
  return v;
}

// ─── metric keys (§6) ────────────────────────────────────────────────────────────────────────────

export const KEY_FIELDS = ['horizon', 'measure', 'mode', 'kind', 'subject', 'statistic', 'position', 'cell'];
export { metricKey, parseMetricKey };

// ─── copies of S3 privates (scripts/dynasty-history-run.mjs; verbatim except as noted) ───────────

const round6 = (x) => (x == null ? null : Math.round(x * 1e6) / 1e6);

/** Copy of scripts/dynasty-history-run.mjs:199 `mirrorCall`. */
function mirrorCall(inputs, bundle, options = {}) {
  return (pid) => dynastyScoreMirror(
    pid, inputs.playersMap, inputs.careerStats, bundle.curves, bundle.positionPeakPPG, null, inputs.scoringSettings, null,
    inputs.teamContext, inputs.depthMap, inputs.historicalShares, bundle.positionPeakAge, bundle.positionBasisScale, null, null, options,
  );
}

/** Copy of scripts/dynasty-history-run.mjs:281 `guardedManifestCheck` (the in-progress-season stop). */
function guardedManifestCheck(load, years) {
  const files = load.loadManifest()?.files ?? {};
  for (const y of years) {
    const e = files[`nfl/season-totals/${y}.json`];
    if (!e || e.inProgress !== false) {
      throw new DynastyReworkStop(`[dynasty-rework] outcome season ${y} is not a completed season (manifest nfl/season-totals/${y}.json inProgress !== false)`);
    }
  }
}

const isBC = (p) => p === 'B' || p === 'C';

// Copies of scripts/dynasty-history-run.mjs:519-521 (`sc`, `val`; `ageBand` is imported from lib/dynastyRework.mjs).
export const sc = (row, m, s) => (s === 'B1' ? row.B1[m] : s === 'B2' ? row.B2[m] : (row.scores[s]?.[m] ?? null));
export const val = (row, m, k) => row.outcome[m][k];

/** Copy of :524 `makeCtx`. */
export function makeCtx(entriesByGroup) { return { ebc: entriesByGroup, cache: new Map() }; }

/** Copy of :526 `validItems` — the paired-row mask lives in its `b` argument. */
export function validItems(ents, m, k, a, b, filt) {
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

/** Copy of :540 `cohortMap`. */
export function cohortMap(ctx, m, k, a, b = null, filt = null) {
  const key = `${m}|${k}|${a}|${b ?? ''}|${filt ?? ''}`;
  let out = ctx.cache.get(key);
  if (out) return out;
  out = new Map();
  for (const [g, ents] of ctx.ebc) out.set(g, cohortStats(validItems(ents, m, k, a, b, filt)));
  ctx.cache.set(key, out);
  return out;
}

/** Copy of :550 `combine` — averages per-cohort statistics over cohorts and counts `n`; no masking of its own. */
export function combine(mapA, mapB, stat) {
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

/** Copy of :566 `biasItems` — one permitted change: a `subject` parameter replaces the literal 'H' in its `validItems` call (and joins its cache key). */
export function biasItems(ctx, m, k, subject, groupFilter = null) {
  const key = `bias|${m}|${k}|${subject}`;
  let out = ctx.cache.get(key);
  if (!out) {
    out = [];
    for (const [g, ents] of ctx.ebc) {
      const items = validItems(ents, m, k, subject, null, null);
      const b = percentileBias(items);
      items.forEach((it, i) => out.push({ g, row: it.row, bias: b[i] }));
    }
    ctx.cache.set(key, out);
  }
  return groupFilter ? out.filter(groupFilter) : out;
}

/** Copy of :581 `meanOf`. */
export const meanOf = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Copy of :583 `ciOf`. */
export function ciOf(vals) {
  const R = vals.length;
  if (!R) return null;
  const s = [...vals].sort((a, b) => a - b);
  return { ci95: [s[Math.floor(0.025 * R)], s[Math.ceil(0.975 * R) - 1]], used: R };
}

/** Copy of :591 `bootstrapSpecs` — one shared draw sequence across specs, which "paired on the same resample" depends on. */
export function bootstrapSpecs({ rows, groupKey, specs, resamples, seed }) {
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

/**
 * The `assemble` closure of `computeMetrics` (:759) lifted to module level (`put` is now a parameter). Additions: the
 * `identical` branch (S3's ablations only) is dropped, and `sp.minUsed` makes a cell `insufficient` when fewer
 * resamples survive (§5.9 tilt rule).
 */
export function assemble(sp, res, put) {
  const { v, c, n } = res.point;
  const enough = n >= sp.minN && c >= sp.minC && v != null;
  const thin = sp.minUsed != null && res.boot != null && res.boot.used < sp.minUsed;
  let ci95 = null, used = null, label;
  if (!enough || !res.boot || thin) {
    label = 'insufficient';
    if (res.boot) { ci95 = res.boot.ci95; used = res.boot.used; }
  } else {
    ci95 = res.boot.ci95; used = res.boot.used;
    label = sp.label(ci95);
  }
  put(sp.parts, { value: round6(v), ci95: ci95 ? ci95.map(round6) : null, used, n, cohortsUsed: c, label });
}

// ─── rows ────────────────────────────────────────────────────────────────────────────────────────

/** Trimmed copy of S3's `cohortContext`: only H (sleeper games, birthdate ages, guarded curves). */
function cohortContext(load, S) {
  const H = buildAsOfInputs(load, S, { curveAgeMode: 'birthdate', gamesMode: 'sleeper' });
  const guard = guardedAgeCurves(H.careerStats, H.playersMap, { currentYear: S + 1 });
  return { H, guard };
}

/**
 * S3's H configuration under `sleeper` games for each S (§4), plus the §5.2 per-row quantities. S = 2025 is the
 * outcome-free preview cohort (no outcome, changer = false, no manifest check, no S+1 read).
 * Returns { rows, counts } — counts[S][position].
 */
export function buildReworkRows({ load = DYNASTY_REWORK_LOAD, cohorts = COHORTS, log = () => {} } = {}) {
  const scoringSettings = load.loadLeagueScoring();
  const positionOf = load.loadLeaguePositionOf();
  const og = leagueBasisLoad(outcomeLoad(load), { scoringSettings, positionOf });

  const rows = [];
  const counts = {};
  for (const S of cohorts) {
    log(`cohort ${S}`);
    const preview = S === PREVIEW_COHORT;
    const winSeasons = [];
    for (let y = S + 1; y <= Math.min(S + WINDOW, LAST_COMPLETED_SEASON); y++) winSeasons.push(y);
    guardedManifestCheck(load, winSeasons);

    const { H, guard } = cohortContext(load, S);
    const bundle = guard.bundle;
    const scoreAll = mirrorCall(H, bundle);
    const hRes = new Map();
    for (const pid of H.skillPids) {
      const res = scoreAll(pid);
      if (isBC(pathOf(res))) hRes.set(pid, res);
    }
    const rowPids = H.skillPids.filter(pid => hRes.has(pid)).sort();
    for (const pid of rowPids) {
      const ye = H.playersMap[pid].years_exp;
      if (!(ye >= 2)) throw new DynastyReworkStop(`[dynasty-rework] ${S} pid ${pid}: a Path B/C row with years_exp ${ye} — the file does not say how to treat it`);
    }

    // birthdate coverage (stop in a headline cohort below 95%)
    let missing = 0;
    for (const pid of rowPids) if (H.playersMap[pid].age == null) missing++;
    if (HEADLINE_COHORTS.includes(S) && rowPids.length && missing / rowPids.length > 0.05) {
      throw new DynastyReworkStop(`[dynasty-rework] birthdate coverage in cohort ${S} is ${(100 * (1 - missing / rowPids.length)).toFixed(1)}% (< 95%)`);
    }

    // A-ST-chg rule: the S+1 team string only; the preview cohort never reads 2026
    const teamS1Of = new Map(rowPids.map(pid => [pid, preview ? null : readTeamS1(load, S, pid)]));
    const changerOf = new Map(rowPids.map(pid => [pid, isChanger(H.playersMap[pid].team ?? null, teamS1Of.get(pid))]));
    const chgScore = mirrorCall(H, bundle, { shareTrendBoostOff: (pid) => changerOf.get(pid) === true });

    const pools = {};
    counts[S] = {};
    for (const pid of rowPids) {
      const pm = H.playersMap[pid];
      const hs = hRes.get(pid);
      const cs = H.careerStats;
      const ppgAt = (y) => {
        const d = cs[y]?.[pid];
        if (!d || !(d.gamesPlayed >= 8) || !Number.isFinite(d.fantasyPoints)) return null;
        return d.fantasyPoints / d.gamesPlayed;
      };
      const pS = ppgAt(S), pS1 = ppgAt(S - 1);
      const B1 = pS ?? pS1;
      const q = [pS1, pS].filter(x => x != null);
      const B2 = q.length ? q.reduce((a, b) => a + b, 0) / q.length : null;

      const level2 = level2Of(cs, pid, S);
      if (level2 !== B2) throw new DynastyReworkStop(`[dynasty-rework] ${S} pid ${pid}: level2 differs from B2`);
      const pos = pm.position;
      const pool = (pools[pos] ??= level2Pool(cs, H.playersMap, S, pos));
      const curve = bundle.curves?.[pos] ?? [];
      const peakPPG = bundle.positionPeakPPG?.[pos] ?? 20;
      const chg = chgScore(pid);
      if (!chg.raw) throw new DynastyReworkStop(`[dynasty-rework] ${S} pid ${pid}: the share-trend-off call left Path B/C`);

      let outcome = null;
      if (!preview) {
        outcome = {
          sleeper: realisedValue(winSeasons, (y) => {
            const r = og.loadSeasonTotals(y)?.[pid];
            if (!r) return null;
            return { games: r.gamesPlayed, fp: r.fantasyPoints };
          }),
        };
      }
      rows.push({
        pid, S, position: pos, age: pm.age, path: { sleeper: pathOf(hs) },
        scores: { H: { sleeper: hs.score } }, raw: hs.raw, signals: hs.signals,
        B1: { sleeper: B1 }, B2: { sleeper: B2 }, outcome,
        teamS: pm.team ?? null, teamS1: teamS1Of.get(pid), changer: changerOf.get(pid),
        level2, currentLevel2Score: currentLevel2Score(pool, level2),
        ageAdj2Score: ageAdj2Score({ level2, age: pm.age, curve, peakPPG }),
        r: curveRatios(curve, pm.age), peakPPG, opportunityScoreChg: chg.raw.opportunityScore,
      });
      counts[S][pos] = (counts[S][pos] ?? 0) + 1;
    }
  }
  return { rows, counts };
}

// ─── S3 parity (§4) ──────────────────────────────────────────────────────────────────────────────

const PARITY_FIELDS = [
  ['H', (r) => r.scores?.H?.sleeper], ['B1', (r) => r.B1?.sleeper], ['B2', (r) => r.B2?.sleeper],
  ['M1', (r) => r.outcome?.sleeper?.M1], ['M2', (r) => r.outcome?.sleeper?.M2], ['h', (r) => r.outcome?.sleeper?.h],
  ['age', (r) => r.age], ['changer', (r) => r.changer],
];

/**
 * For every S in `cohorts` the row set (pid, S) equals the S3 panel's rows with path.sleeper ∈ {B, C}, and per row H,
 * B1, B2, M1, M2, h, age and changer are equal. Throws DynastyReworkStop with counts per cohort × field only.
 */
export function checkS3Parity(rows, panel, cohorts) {
  const want = new Set(cohorts);
  const mine = new Map(rows.filter(r => want.has(r.S)).map(r => [`${r.S}|${r.pid}`, r]));
  const theirs = new Map();
  for (const r of panel?.rows ?? []) {
    if (!want.has(r.S) || !isBC(r.path?.sleeper)) continue;
    theirs.set(`${r.S}|${r.pid}`, r);
  }
  const bad = {};
  const hit = (S, field) => { const k = `${S} ${field}`; bad[k] = (bad[k] ?? 0) + 1; };
  let checked = 0;
  for (const [key, r] of mine) {
    const p = theirs.get(key);
    if (!p) { hit(r.S, 'rowset'); continue; }
    checked++;
    for (const [field, get] of PARITY_FIELDS) if ((get(r) ?? null) !== (get(p) ?? null)) hit(r.S, field);
  }
  for (const [key, p] of theirs) if (!mine.has(key)) hit(p.S, 'rowset');
  const total = Object.values(bad).reduce((a, b) => a + b, 0);
  if (total) {
    throw new DynastyReworkStop(`[dynasty-rework] S3 parity failed (${total} differences; cohort × field counts): ${Object.entries(bad).map(([k, n]) => `${k}: ${n}`).join(', ')}`, total);
  }
  return { rowsChecked: checked, mismatches: 0 };
}

// ─── folds and the final model (§5.3–§5.5, §5.11) ────────────────────────────────────────────────

/**
 * Per fold: fit all four candidates per position on the fit cohorts, choose among K0–K2 by summed objective, and
 * score the fold's test-cohort rows. The scores go to `row.oofSets[slot]` { P, 'K0-oof' … 'K3-oof' } (null where the
 * fold × position fit is `insufficient`). Returns the fold records.
 */
export function runFolds({ rows, plan, slot, log = () => {} }) {
  const out = [];
  for (const fold of plan) {
    log(`fold ${slot} T=${fold.T}`);
    const perCandidate = {};
    for (const K of CANDIDATES) {
      perCandidate[K] = {};
      for (const pos of POSITIONS) perCandidate[K][pos] = fitCandidate(rows, K, fold.fit, pos);
    }
    const { chosen, sums } = selectCandidate(perCandidate);
    for (const r of rows) {
      if (r.S !== fold.T) continue;
      const set = ((r.oofSets ??= {})[slot] ??= {});
      set.P = scoreWithFit(r, chosen, perCandidate[chosen][r.position]);
      for (const K of CANDIDATES) set[`${K}-oof`] = scoreWithFit(r, K, perCandidate[K][r.position]);
    }
    out.push({ T: fold.T, fit: fold.fit, perCandidate, chosen, sums });
  }
  return out;
}

/** The procedure applied to all eight headline cohorts as one fit set (§5.11; in-sample; not evidence). */
export function runFinal({ rows, log = () => {} }) {
  log('final model');
  const perCandidate = {};
  for (const K of CANDIDATES) {
    perCandidate[K] = {};
    for (const pos of POSITIONS) perCandidate[K][pos] = fitCandidate(rows, K, HEADLINE_FIT_COHORTS, pos);
  }
  const { chosen, sums } = selectCandidate(perCandidate);
  return { fit: HEADLINE_FIT_COHORTS, perCandidate, chosen, sums };
}

/** §5.11 2025 preview: final-model score vs H on the outcome-free S = 2025 rows. */
export function computePreview(previewRows, final) {
  const out = {};
  for (const pos of POSITIONS) {
    const rs = previewRows.filter(r => r.position === pos);
    const fit = final.perCandidate[final.chosen][pos];
    const s = { n: rs.length, scored: 0, abs5: 0, abs10: 0, labelChanges: 0, insufficient: fit === 'insufficient' };
    if (fit !== 'insufficient') {
      for (const r of rs) {
        const next = scoreWithFit(r, final.chosen, fit);
        const h = r.scores.H.sleeper;
        const sg = r.signals ?? {};
        const lab = (score) => pickDynastyLabelMirror({
          score, isLateCareer: sg.isLateCareer, isBreakout: sg.isBreakout, isBounceBack: sg.isBounceBack,
          slope: sg.slopeRaw, age: sg.age, depthOrder: sg.depthOrder,
        });
        s.scored++;
        if (Math.abs(next - h) >= 5) s.abs5++;
        if (Math.abs(next - h) >= 10) s.abs10++;
        if (lab(next) !== lab(h)) s.labelChanges++;
      }
    }
    out[pos] = s;
  }
  return out;
}

// ─── metric views and specs (§5.6–§5.9) ──────────────────────────────────────────────────────────

/**
 * Rows of a horizon with their out-of-fold scores installed as `scores.P`, `scores['K*-oof']`, plus the paired-mask
 * copies the bias and tilt cells read: `Hp` / `B2p` are H / B2 only where P is non-null (§5.7: tilt(H) is not taken over rows P lacks).
 */
export function viewRows(rows, horizon) {
  const hz = typeof horizon === 'string' ? HORIZONS.find(h => h.id === horizon) : horizon;
  const out = [];
  for (const r of rows) {
    if (!hz.cohorts.includes(r.S)) continue;
    const set = r.oofSets?.[hz.slot] ?? {};
    const scores = { H: r.scores.H };
    for (const id of OOF_IDS) scores[id] = { sleeper: set[id] ?? null };
    const hasP = scores.P.sleeper != null;
    scores.Hp = { sleeper: hasP ? r.scores.H.sleeper : null };
    scores.B2p = { sleeper: hasP ? r.B2.sleeper : null };
    out.push({ ...r, scores });
  }
  return out;
}

const BIAS_SUBJECT = { P: 'P', H: 'Hp', B2: 'B2p' };
const labelNone = () => null;

/** The spec list for one horizon × position. `primary` marks the specs the probe times (ρ levels, P deltas, tilt). */
export function buildSpecs(hz, pos) {
  const m = 'sleeper', k = 'M1';
  const specs = [];
  const base = (extra) => ({ horizon: hz.id, measure: 'M1', mode: m, position: pos, cell: 'all', ...extra });
  const level = (subj, st, primary) => specs.push({
    parts: base({ kind: 'level', subject: subj, statistic: st }), minC: hz.minC, minN: hz.minN, primary,
    eval: (ctx) => combine(cohortMap(ctx, m, k, subj), null, st),
    label: st === 'rho' ? labelRho : labelNone,
  });
  for (const subj of ['P', 'H', 'B1', 'B2', ...OOF_KS]) level(subj, 'rho', ['P', 'H', 'B1', 'B2'].includes(subj));
  if (hz.id === 'h3') for (const subj of ['P', 'H', 'B2']) for (const st of ['hr12', 'hr24']) level(subj, st, false);
  const delta = (a, b, id, primary) => specs.push({
    parts: base({ kind: 'delta', subject: `${a}~${b}`, statistic: 'rho' }), minC: hz.minC, minN: hz.minN, primary,
    eval: (ctx) => combine(cohortMap(ctx, m, k, a, b), cohortMap(ctx, m, k, b, a), 'rho'),
    label: (ci) => labelBaseline(ci, id),
  });
  delta('P', 'B2', 'B2', true); delta('P', 'B1', 'B1', true); delta('P', 'H', 'H', true);
  for (const K of OOF_KS) { delta(K, 'B2', 'B2', false); delta(K, 'H', 'H', false); }

  if (hz.id === 'h3') {
    for (const subj of ['P', 'H', 'B2']) {
      for (const band of AGE_BANDS) {
        specs.push({
          parts: base({ measure: 'M2', kind: 'bias', subject: subj, statistic: 'bias', cell: band }), minC: 1, minN: CELL_MIN_ROWS, primary: false,
          eval: (ctx) => {
            const xs = biasItems(ctx, m, 'M2', BIAS_SUBJECT[subj], (x) => ageBand(x.row.age) === band).map(x => x.bias);
            return { v: xs.length ? meanOf(xs) : null, c: xs.length ? 1 : 0, n: xs.length };
          },
          label: labelBias,
        });
      }
    }
    const tiltOf = (ctx, internal) => ageTilt(biasItems(ctx, m, 'M2', internal).map(x => ({ age: x.row.age, bias: x.bias })), { minBand: CELL_MIN_ROWS });
    for (const subj of ['P', 'H', 'B2']) {
      specs.push({
        parts: base({ measure: 'M2', kind: 'tilt', subject: subj, statistic: 'tilt' }), minC: 0, minN: CELL_MIN_ROWS, minUsed: TILT_MIN_USED, primary: subj !== 'B2',
        eval: (ctx) => { const t = tiltOf(ctx, BIAS_SUBJECT[subj]); return { v: t.tilt, c: t.tilt == null ? 0 : 1, n: t.n }; },
        label: labelBias,
      });
    }
    specs.push({
      parts: base({ measure: 'M2', kind: 'tilt', subject: 'H~P', statistic: 'tilt' }), minC: 0, minN: CELL_MIN_ROWS, minUsed: TILT_MIN_USED, primary: true,
      eval: (ctx) => {
        const tH = tiltOf(ctx, 'Hp'), tP = tiltOf(ctx, 'P');
        const ok = tH.tilt != null && tP.tilt != null;
        return { v: ok ? tH.tilt - tP.tilt : null, c: ok ? 1 : 0, n: Math.min(tH.n, tP.n) };
      },
      label: labelNone,
    });
  }
  return specs;
}

/** Number of specs in the whole run (all horizons × positions) — the projection's `specs in the run`. */
export function countRunSpecs() {
  let n = 0;
  for (const hz of HORIZONS) for (const pos of POSITIONS) n += buildSpecs(hz, pos).length;
  return n;
}

/** All metric cells and the per-position summary + decision (§5.10). */
export function computeReworkMetrics(rows, { resamples = BOOTSTRAP.resamples, seed = BOOTSTRAP.seed, log = () => {} } = {}) {
  const metrics = {};
  const put = (parts, cell) => { metrics[metricKey(parts)] = cell; };
  for (const hz of HORIZONS) {
    const view = viewRows(rows, hz);
    for (const pos of POSITIONS) {
      log(`metrics ${hz.id} ${pos}`);
      const prow = view.filter(r => r.position === pos);
      const specs = buildSpecs(hz, pos);
      const out = bootstrapSpecs({ rows: prow, groupKey: (r) => r.S, specs, resamples, seed });
      specs.forEach((sp, i) => assemble(sp, out[i], put));
    }
  }
  const cell = (parts) => metrics[metricKey({ horizon: 'h3', measure: 'M1', mode: 'sleeper', cell: 'all', ...parts })];
  const summary = {};
  for (const pos of POSITIONS) {
    const b2 = cell({ kind: 'delta', subject: 'P~B2', statistic: 'rho', position: pos });
    const b1 = cell({ kind: 'delta', subject: 'P~B1', statistic: 'rho', position: pos });
    const tP = cell({ measure: 'M2', kind: 'tilt', subject: 'P', statistic: 'tilt', position: pos });
    const hp = cell({ measure: 'M2', kind: 'tilt', subject: 'H~P', statistic: 'tilt', position: pos });
    summary[pos] = { b2Label: b2.label, b1Label: b1.label, b2Delta: b2.value, tiltLabel: tiltLabel(tP, hp) };
  }
  const d = decide(summary);
  for (const pos of POSITIONS) summary[pos].pass = d.positions[pos].pass;
  return { metrics, summary, decision: d.decision, conditions: Object.fromEntries(POSITIONS.map(p => [p, d.positions[p].conditions])) };
}

// ─── run ─────────────────────────────────────────────────────────────────────────────────────────

const clockOf = (load) => load.clock ?? (() => performance.now());

/** The whole pinned run. `assertPrereg` is the first statement: a placeholder or edited hash blocks every real-data run. */
export function runDynastyRework({ load = DYNASTY_REWORK_LOAD, log = () => {}, resamples = BOOTSTRAP.resamples } = {}) {
  const preregSha256 = assertPrereg(load);
  const clock = clockOf(load);
  const t0 = clock();
  const qbB2DeltaFloor = readQbFloor(load);
  const panel = load.loadS3Panel();

  const built = buildReworkRows({ load, cohorts: COHORTS, log });
  const parity = checkS3Parity(built.rows, panel, COHORTS);
  const previewBuilt = buildReworkRows({ load, cohorts: [PREVIEW_COHORT], log });

  const locoPlan = foldPlan('loco'), forwardPlan = foldPlan('forward'), shortPlan = foldPlan('short');
  const folds = runFolds({ rows: built.rows, plan: locoPlan, slot: 'loco', log });
  const forwardFolds = runFolds({ rows: built.rows, plan: forwardPlan, slot: 'forward', log });
  const shortFolds = runFolds({ rows: built.rows, plan: shortPlan, slot: 'short', log });
  const final = runFinal({ rows: built.rows, log });
  const m = computeReworkMetrics(built.rows, { resamples, seed: BOOTSTRAP.seed, log });
  const preview2025 = computePreview(previewBuilt.rows, final);

  const meta = {
    generatedAt: load.now(), dataRev: load.gitRev(), pinnedInputsRev: PINNED_REV,
    s3Panel: { path: S3_PANEL_PATH, preregSha256: panel.meta?.preregSha256 ?? null },
    preregSha256, foldPlan: locoPlan, forwardFoldPlan: forwardPlan,
    parity: { rowsChecked: parity.rowsChecked, mismatches: parity.mismatches },
    gridSizes: Object.fromEntries(CANDIDATES.map(K => [K, gridSize(K)])),
    bootstrap: { resamples, seed: BOOTSTRAP.seed },
    rowCounts: built.counts, previewRowCounts: previewBuilt.counts,
    runtimeMs: Math.round(clock() - t0),
  };
  return {
    meta, rows: built.rows, folds, forwardFolds, shortFolds, final, metrics: m.metrics, summary: m.summary,
    qbB2DeltaFloor, decision: m.decision, conditions: m.conditions, preview2025,
  };
}

// ─── probe (§7.2): prints counts and timings only ────────────────────────────────────────────────

const PROBE_COHORTS = [2015, 2018];
export const PROBE_LINE = /^[A-Za-z0-9_.-]+: \d+( ms)?$/;

/**
 * Builds rows for S = 2015 and S = 2018, runs the parity check on them, times one fit (K0, WR, fit set {2015, 2018})
 * and 50 bootstrap resamples of the primary ρ and tilt specs, and prints `projected_total`. Prints only lines matching
 * PROBE_LINE; any error prints `stop_<ErrorClassName>: 1` (no message text) and is re-thrown.
 * The projection reads the other cohorts' row counts from the two probe cohorts: every cohort is taken to have the
 * probe cohorts' mean row count per position (the probe cannot see the others).
 */
export function runProbe({ load = DYNASTY_REWORK_LOAD, print = console.log } = {}) {
  try {
    assertPrereg(load);
    const emit = (key, value, ms = false) => print(`${key}: ${Math.round(value)}${ms ? ' ms' : ''}`);
    const clock = clockOf(load);
    const { rows, counts } = buildReworkRows({ load, cohorts: PROBE_COHORTS });
    for (const S of PROBE_COHORTS) {
      emit(`rows_${S}`, POSITIONS.reduce((a, p) => a + (counts[S][p] ?? 0), 0));
      for (const pos of POSITIONS) emit(`rows_${S}_${pos}`, counts[S][pos] ?? 0);
    }
    try {
      const par = checkS3Parity(rows, load.loadS3Panel(), PROBE_COHORTS);
      emit('parity_rows_checked', par.rowsChecked);
      emit('parity_mismatches', par.mismatches);
    } catch (e) {
      if (e instanceof DynastyReworkStop && e.count != null) emit('parity_mismatches', e.count);
      throw e;
    }
    for (const K of CANDIDATES) emit(`grid_size_${K}`, gridSize(K));

    const t1 = clock();
    fitCandidate(rows, 'K0', PROBE_COHORTS, 'WR');
    const fitMs = clock() - t1;
    emit('fit_k0_wr_ms', fitMs, true);

    // bootstrap timing on the two cohorts' rows; P is a stand-in copy of H (timing only, never printed or kept)
    const view = rows.map(r => ({
      ...r, scores: { H: r.scores.H, P: r.scores.H, Hp: r.scores.H, B2p: { sleeper: r.B2.sleeper } },
    }));
    const hz = { ...HORIZONS[0], cohorts: PROBE_COHORTS };
    const t2 = clock();
    let specsProbe = 0;
    for (const pos of POSITIONS) {
      const specs = buildSpecs(hz, pos).filter(s => s.primary);
      specsProbe += specs.length;
      bootstrapSpecs({ rows: view.filter(r => r.position === pos), groupKey: (r) => r.S, specs, resamples: 50, seed: BOOTSTRAP.seed });
    }
    const bootMs = clock() - t2;
    emit('bootstrap_50_ms', bootMs, true);
    emit('specs_probe', specsProbe);
    const specsRun = countRunSpecs();
    emit('specs_run', specsRun);

    const nProbe = PROBE_COHORTS.length;
    const fitSets = [...foldPlan('loco'), ...foldPlan('forward'), ...foldPlan('short')].map(f => f.fit.length).concat([HEADLINE_COHORTS.length]);
    emit('fit_sets', fitSets.length);
    const gridFactor = CANDIDATES.reduce((a, K) => a + gridSize(K) / 10626, 0);
    const fitTerm = fitMs * fitSets.reduce((a, n) => a + n / nProbe, 0) * POSITIONS.length * gridFactor;
    const bootTerm = bootMs * (BOOTSTRAP.resamples / 50) * (HEADLINE_COHORTS.length / nProbe) * (specsRun / Math.max(1, specsProbe));
    emit('projected_total', fitTerm + bootTerm, true);
    return 0;
  } catch (e) {
    print(`stop_${String(e?.name ?? 'Error').replace(/[^A-Za-z0-9_.-]/g, '_')}: 1`);
    throw e;
  }
}

// ─── verdict (§6) ────────────────────────────────────────────────────────────────────────────────

const f3 = (x) => (x == null ? 'n/a' : x.toFixed(3));
const sg = (x) => (x == null ? 'n/a' : `${x >= 0 ? '+' : ''}${x.toFixed(3)}`);
const ciStr = (c) => (c.ci95 ? `[${sg(c.ci95[0])}, ${sg(c.ci95[1])}]` : 'n/a');
const cellTxt = (c) => `${f3(c.value)} ${ciStr(c)} (n=${c.n}, cohorts=${c.cohortsUsed}) ${c.label ?? ''}`.trim();
const dTxt = (c) => `${sg(c.value)} ${ciStr(c)} (n=${c.n}, cohorts=${c.cohortsUsed}) ${c.label ?? ''}`.trim();

/** Fetch a cell; a missing key throws (T-KEYS). */
export function cellOf(metrics, parts, seen = null) {
  const key = metricKey(parts);
  const c = metrics[key];
  if (!c) throw new Error(`[dynasty-rework] verdict reads a metric with no panel key: ${key}`);
  seen?.add(key);
  return c;
}

const wTxt = (fit) => (fit === 'insufficient' ? 'insufficient' : `[${fit.weights.join(', ')}]/20${fit.beta != null ? `, β ${fit.beta}` : ''}, objective ${f3(fit.objective)}`);

export function buildDynastyReworkVerdictMarkdown(result, { seen = null } = {}) {
  const { meta, metrics, summary, decision, conditions } = result;
  const out = [];
  const w = (...l) => out.push(...l);
  const C = (p) => cellOf(metrics, { measure: 'M1', mode: 'sleeper', cell: 'all', ...p }, seen);
  const date = meta.generatedAt.slice(0, 10);
  const lvl = (hz, subject, position, statistic = 'rho') => C({ horizon: hz, kind: 'level', subject, statistic, position });
  const dlt = (hz, subject, position) => C({ horizon: hz, kind: 'delta', subject, statistic: 'rho', position });
  const bias = (subject, position, band) => C({ horizon: 'h3', measure: 'M2', kind: 'bias', subject, statistic: 'bias', position, cell: band });
  const tilt = (subject, position) => C({ horizon: 'h3', measure: 'M2', kind: 'tilt', subject, statistic: 'tilt', position });

  // 1
  w(`# Dynasty score rework — out-of-sample verdict (S4a) · ${date}`, '',
    `- Date: ${date} · data rev \`${meta.dataRev}\` · pinned-inputs rev \`${meta.pinnedInputsRev}\``,
    `- S3 history panel: \`${meta.s3Panel.path}\` (its pre-registration hash \`${meta.s3Panel.preregSha256}\`)`,
    `- Pre-registration hash (task file §4–§5): \`${meta.preregSha256}\``,
    `- Headline cohorts S = 2015–2022 (h = 3), buffered leave-one-cohort-out folds; bootstrap ${meta.bootstrap.resamples} player-clustered resamples, seed ${meta.bootstrap.seed}; \`sleeper\` games only.`,
    '- **Offline research; nothing ships.** Nothing here reaches the app\'s scoring.', '');

  // 2
  w('## 2. Decision', '', `**${decision}**`, '');
  for (const pos of POSITIONS) {
    const rho = lvl('h3', 'P', pos), rhoH = lvl('h3', 'H', pos), rhoB2 = lvl('h3', 'B2', pos);
    const d2 = dlt('h3', 'P~B2', pos), d1 = dlt('h3', 'P~B1', pos);
    const tP = tilt('P', pos), tHP = tilt('H~P', pos);
    const cnd = conditions[pos];
    const passTxt = Object.entries(cnd).map(([k, v]) => `${k} ${v ? 'passed' : 'failed'}`).join(', ');
    let s = `**${pos}** — ${summary[pos].pass ? 'passes' : 'does not pass'} (${passTxt}). The procedure's out-of-fold rank correlation with realised value is ${cellTxt(rho)}, against H ${f3(rhoH.value)} and the two-year average (B2) ${f3(rhoB2.value)}. ` +
      `Pre-specified test 1: P vs B2 ${dTxt(d2)}. `;
    if (pos === 'QB') s += `P vs B1 ${dTxt(d1)}; the P vs B2 point estimate ${sg(d2.value)} against the floor ${sg(result.qbB2DeltaFloor)}. `;
    s += `Pre-specified test 2: age tilt (mean bias at 31+ minus at ≤ 24, percentile points) of P ${sg(tP.value)} ${ciStr(tP)} (n=${tP.n}, used=${tP.used}) ${tP.label ?? ''}, reduction versus H ${sg(tHP.value)} ${ciStr(tHP)}: \`${summary[pos].tiltLabel}\`.`;
    w(s, '');
  }
  {
    const parts = [];
    for (const K of CANDIDATES) {
      const per = POSITIONS.map(pos => {
        const b = dlt('h3', `${K}-oof~B2`, pos), h = dlt('h3', `${K}-oof~H`, pos);
        return `${pos} vs B2 ${sg(b.value)} \`${b.label}\`, vs H ${sg(h.value)} \`${h.label}\``;
      });
      parts.push(`${K}-oof: ${per.join('; ')}`);
    }
    w(`**Exploratory — each candidate's own out-of-fold score (no selection).** ${parts.join('. ')}. ${K3_REPORT_ONLY_SENTENCE}.`, '');
  }
  w('**Caveats.**',
    '- The candidates were designed after reading S3\'s results on all eight cohorts. The fold design keeps the fitting and choosing off the judged seasons; it cannot un-see S3. No completed-season cohort is untouched; the only truly fresh test is forward (captured 2026+ scores), which this slice does not do.',
    '- When a test cohort comes before its fit cohorts (e.g. test 2015, fit 2018–2022), the fit cohorts\' inputs and their age curves include the test cohort\'s outcome seasons. No test outcome is ever a fit target, but the fit has seen those seasons as inputs.',
    '- The bootstrap holds each fold\'s fitted weights fixed, so the CIs leave out fit variance.',
    '- `sleeper` games only (S3 gave identical labels under both games definitions).',
    `- ${K3_REPORT_ONLY_SENTENCE[0].toUpperCase()}${K3_REPORT_ONLY_SENTENCE.slice(1)} (§5.2).`, '');

  // 3
  w('## 3. Primary table (M1, `sleeper` games, S = 2015–2022; ρ = equal-weight cohort average)', '',
    '| position | ρ(P) | ρ(H) | ρ(B1) | ρ(B2) | P−B2 | P−B1 | P−H |', '|---|---|---|---|---|---|---|---|');
  for (const pos of POSITIONS) {
    w(`| ${pos} | ${cellTxt(lvl('h3', 'P', pos))} | ${cellTxt(lvl('h3', 'H', pos))} | ${cellTxt(lvl('h3', 'B1', pos))} | ${cellTxt(lvl('h3', 'B2', pos))} | ${dTxt(dlt('h3', 'P~B2', pos))} | ${dTxt(dlt('h3', 'P~B1', pos))} | ${dTxt(dlt('h3', 'P~H', pos))} |`);
  }
  w('');

  // 4
  w('## 4. Age tilt and band means (M2; bias in percentile points, positive = the score rates him higher than he turned out; rows where P is non-null)', '',
    '| position | subject | tilt (31+ minus ≤ 24) | ' + AGE_BANDS.join(' | ') + ' |', '|---|---|---|' + AGE_BANDS.map(() => '---').join('|') + '|');
  for (const pos of POSITIONS) for (const subj of ['P', 'H', 'B2']) {
    const t = tilt(subj, pos);
    w(`| ${pos} | ${subj} | ${sg(t.value)} ${ciStr(t)} (n=${t.n}) ${t.label ?? ''} | ${AGE_BANDS.map(b => { const c = bias(subj, pos, b); return `${sg(c.value)} ${ciStr(c)} n=${c.n} ${c.label}`; }).join(' | ')} |`);
  }
  w('');
  w('| position | tilt(H) − tilt(P) (CI) | label |', '|---|---|---|');
  for (const pos of POSITIONS) { const t = tilt('H~P', pos); w(`| ${pos} | ${sg(t.value)} ${ciStr(t)} (used=${t.used}) | \`${summary[pos].tiltLabel}\` |`); }
  w('');

  // 5
  w('## 5. Exploratory: each candidate\'s own out-of-fold score and hit rates', '',
    '| position | score | ρ | vs B2 | vs H |', '|---|---|---|---|---|');
  for (const pos of POSITIONS) for (const K of OOF_KS) {
    w(`| ${pos} | ${K}${K === 'K3-oof' ? ' (report-only)' : ''} | ${cellTxt(lvl('h3', K, pos))} | ${dTxt(dlt('h3', `${K}~B2`, pos))} | ${dTxt(dlt('h3', `${K}~H`, pos))} |`);
  }
  w('', 'HR@12 / HR@24 (not gating):', '', '| position | subject | HR@12 | HR@24 |', '|---|---|---|---|');
  for (const pos of POSITIONS) for (const subj of ['P', 'H', 'B2']) {
    w(`| ${pos} | ${subj} | ${cellTxt(lvl('h3', subj, pos, 'hr12'))} | ${cellTxt(lvl('h3', subj, pos, 'hr24'))} |`);
  }
  w('');

  // 6
  w('## 6. Fold table (chosen candidate and fitted weights per fold; weights are integers of 20)', '');
  for (const [title, list] of [['Primary folds', result.folds]]) {
    w(`**${title}**`, '', '| T | fit cohorts | chosen | ' + POSITIONS.join(' | ') + ' |', '|---|---|---|' + POSITIONS.map(() => '---').join('|') + '|');
    for (const f of list) {
      w(`| ${f.T} | ${f.fit.join(', ')} | ${f.chosen} | ${POSITIONS.map(p => `${COMPONENT_NAMES[f.chosen].join('/')}: ${wTxt(f.perCandidate[f.chosen][p])}`).join(' | ')} |`);
    }
    w('');
  }

  // 7
  w('## 7. Final model — in-sample; the specification S4b would wire on `S4A-WIN`; not evidence', '',
    `Procedure applied to all eight headline cohorts as one fit set. Chosen candidate: **${result.final.chosen}** (component order ${COMPONENT_NAMES[result.final.chosen].join(', ')}).`, '',
    '| position | weights, β, in-sample objective |', '|---|---|');
  for (const pos of POSITIONS) w(`| ${pos} | ${wTxt(result.final.perCandidate[result.final.chosen][pos])} |`);
  w('');

  // 8
  w('## 8. Forward-only robustness (T = 2018–2022, fit {2015 … T−3}; report-only)', '',
    '| position | ρ(P) | ρ(H) | ρ(B2) | P−B2 | P−B1 | P−H |', '|---|---|---|---|---|---|---|');
  for (const pos of POSITIONS) {
    w(`| ${pos} | ${cellTxt(lvl('h3-fwd', 'P', pos))} | ${cellTxt(lvl('h3-fwd', 'H', pos))} | ${cellTxt(lvl('h3-fwd', 'B2', pos))} | ${dTxt(dlt('h3-fwd', 'P~B2', pos))} | ${dTxt(dlt('h3-fwd', 'P~B1', pos))} | ${dTxt(dlt('h3-fwd', 'P~H', pos))} |`);
  }
  w('');

  // 9
  w('## 9. Short horizons — not pooled with the headline', '');
  for (const [hz, title] of [['h2-2023', 'S = 2023 (h = 2; fit 2015–2020)'], ['h1-2024', 'S = 2024 (h = 1; fit 2015–2021)']]) {
    w(`### ${title} — not pooled`, '', '| position | ρ(P) | ρ(H) | ρ(B2) | P−B2 | P−B1 |', '|---|---|---|---|---|---|');
    for (const pos of POSITIONS) {
      w(`| ${pos} | ${cellTxt(lvl(hz, 'P', pos))} | ${cellTxt(lvl(hz, 'H', pos))} | ${cellTxt(lvl(hz, 'B2', pos))} | ${dTxt(dlt(hz, 'P~B2', pos))} | ${dTxt(dlt(hz, 'P~B1', pos))} |`);
    }
    w('');
  }

  // 10
  w('## 10. 2025 preview (outcome-free; final-model score vs H; birthdate ages; not the app\'s current scores)', '',
    '| position | rows | scored | \\|Δ\\| ≥ 5 | \\|Δ\\| ≥ 10 | label changes |', '|---|---|---|---|---|---|');
  for (const pos of POSITIONS) {
    const p = result.preview2025[pos];
    w(`| ${pos} | ${p.n} | ${p.scored} | ${p.abs5} | ${p.abs10} | ${p.labelChanges} |`);
  }
  w('');

  // 11
  w('## 11. Parity record and row counts', '',
    `S3 parity: ${meta.parity.rowsChecked} rows checked across S = 2015–2024, ${meta.parity.mismatches} mismatches (row set, H, B1, B2, M1, M2, h, age, changer).`, '',
    '| S | ' + POSITIONS.join(' | ') + ' |', '|---|' + POSITIONS.map(() => '---').join('|') + '|');
  for (const S of COHORTS) w(`| ${S} | ${POSITIONS.map(p => meta.rowCounts[S]?.[p] ?? 0).join(' | ')} |`);
  w('', `S = 2025 preview rows: ${POSITIONS.map(p => `${p} ${meta.previewRowCounts[2025]?.[p] ?? 0}`).join(', ')}.`, '');

  if (decision === 'S4A-NO-WIN') w(NO_WIN_LAST_LINE);
  return out.join('\n');
}

// ─── artifacts / main ────────────────────────────────────────────────────────────────────────────

function panelRow(r) {
  const o = r.oofSets ?? {};
  const first = (k) => o.loco?.[k] ?? o.short?.[k] ?? null;
  return {
    pid: r.pid, S: r.S, position: r.position, age: r.age, path: r.path.sleeper,
    H: r.scores.H.sleeper, B1: r.B1.sleeper, B2: r.B2.sleeper, outcome: r.outcome.sleeper, changer: r.changer,
    level2: r.level2, currentLevel2Score: r.currentLevel2Score, ageAdj2Score: r.ageAdj2Score, r: r.r,
    opportunityScoreChg: r.opportunityScoreChg,
    P: first('P'), oof: Object.fromEntries(CANDIDATES.map(K => [K, first(`${K}-oof`)])),
    Pfwd: o.forward?.P ?? null, ooffwd: o.forward ? Object.fromEntries(CANDIDATES.map(K => [K, o.forward[`${K}-oof`]])) : null,
  };
}

export function serializePanel(result) {
  const { meta, rows, folds, forwardFolds, shortFolds, final, metrics, summary, qbB2DeltaFloor, decision, preview2025 } = result;
  const head = JSON.stringify({ meta }, null, 2).slice(0, -2);
  const tail = JSON.stringify({ folds, forwardFolds, shortFolds, final, metrics, summary, qbB2DeltaFloor, decision, preview2025 }, null, 1).slice(1, -2);
  return `${head},\n"rows": [\n${rows.map(r => JSON.stringify(panelRow(r))).join(',\n')}\n],${tail}\n}\n`;
}

export function writeDynastyReworkArtifacts({ result, verdictMd, root = null }) {
  const date = result.meta.generatedAt.slice(0, 10);
  const panelPath = `backtests/${date}-dynasty-rework-panel.json`;
  const verdictPath = `grading/${date}-dynasty-rework-verdict.md`;
  const panelJson = serializePanel(result);
  const panelBytes = Buffer.byteLength(panelJson);
  if (panelBytes > PANEL_MAX_BYTES) throw new DynastyReworkStop(`[dynasty-rework] the panel is ${panelBytes} bytes (> 15 MB)`);
  const abs = (rel) => (root ? path.join(root, rel) : repoPath(rel));
  fs.mkdirSync(abs('backtests'), { recursive: true });
  fs.mkdirSync(abs('grading'), { recursive: true });
  fs.writeFileSync(abs(panelPath), panelJson, 'utf8');
  fs.writeFileSync(abs(verdictPath), verdictMd.endsWith('\n') ? verdictMd : verdictMd + '\n', 'utf8');
  return { panelPath, verdictPath, panelBytes };
}

/** The `--dynasty-rework` branch body of `bin/backtest.mjs`. Exit 1 on a stop (nothing written; in probe mode, no message text). */
export function dynastyReworkMain({
  load = DYNASTY_REWORK_LOAD, write = false, asJson = false, probe = false, writeArtifacts = writeDynastyReworkArtifacts,
  log = console.log, logErr = console.error, print = console.log,
} = {}) {
  if (probe) {
    try { runProbe({ load, print }); return 0; } catch { return 1; }
  }
  try {
    const result = runDynastyRework({ load, log: (m) => logErr(`[backtest] ${m}`) });
    const verdictMd = buildDynastyReworkVerdictMarkdown(result);
    if (write) {
      const wr = writeArtifacts({ result, verdictMd });
      logErr(`[backtest] Wrote ${wr.panelPath} (${wr.panelBytes} B), ${wr.verdictPath}`);
    }
    log(asJson ? JSON.stringify({ meta: result.meta, metrics: result.metrics, summary: result.summary, decision: result.decision }, null, 2) : verdictMd);
    return 0;
  } catch (err) {
    if (err instanceof DynastyReworkStop) {
      logErr(`[backtest] ${err.message}`);
      return 1;
    }
    throw err;
  }
}
