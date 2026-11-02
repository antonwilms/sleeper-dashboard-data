/**
 * lib/dynastyBacktest.mjs — shared pure helpers of the dynasty backtests (S3b `--dynasty-history`, S4a `--dynasty-rework`,
 * S5). Moved verbatim from scripts/dynasty-history-run.mjs at b3f2d05 (post S3b Fix pass 1), so F7 (`insufficient` takes
 * precedence over `variant-identical`) and F9 (`combine` counts contributing cohorts only) reach every consumer by import.
 * No I/O: `guardedManifestCheck` reads only through the injected `load`. Imports nothing from lib/dynastyRework.mjs or scripts/.
 */
import { spearman, rankTransform } from './backtest.mjs';
import { clusteredBootstrap } from './inSeasonEvidence.mjs';
import { dynastyScoreMirror } from './dynastyMirror.mjs';

export const MIN_ROWS = { rho: 20, hr12: 36, hr24: 72 };

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

export const round6 = (x) => (x == null ? null : Math.round(x * 1e6) / 1e6);
export const isBC = (p) => p === 'B' || p === 'C';

export function mirrorCall(inputs, bundle, options = {}) {
  return (pid) => dynastyScoreMirror(
    pid, inputs.playersMap, inputs.careerStats, bundle.curves, bundle.positionPeakPPG, null, inputs.scoringSettings, null,
    inputs.teamContext, inputs.depthMap, inputs.historicalShares, bundle.positionPeakAge, bundle.positionBasisScale, null, null, options,
  );
}

/** The in-progress-season stop; `Stop` is the caller's error class and `tag` its message prefix. */
export function guardedManifestCheck(load, years, { Stop, tag }) {
  const files = load.loadManifest()?.files ?? {};
  for (const y of years) {
    const e = files[`nfl/season-totals/${y}.json`];
    if (!e || e.inProgress !== false) {
      throw new Stop(`[${tag}] outcome season ${y} is not a completed season (manifest nfl/season-totals/${y}.json inProgress !== false)`);
    }
  }
}

export const sc = (row, m, s) => (s === 'B1' ? row.B1[m] : s === 'B2' ? row.B2[m] : (row.scores[s]?.[m] ?? null));
export const val = (row, m, k) => row.outcome[m][k];

/** Evaluation context over one sample: entries grouped by cohort key; per-sample cache of cohort statistics. */
export function makeCtx(entriesByGroup) { return { ebc: entriesByGroup, cache: new Map() }; }

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

export function cohortMap(ctx, m, k, a, b = null, filt = null) {
  const key = `${m}|${k}|${a}|${b ?? ''}|${filt ?? ''}`;
  let out = ctx.cache.get(key);
  if (out) return out;
  out = new Map();
  for (const [g, ents] of ctx.ebc) out.set(g, cohortStats(validItems(ents, m, k, a, b, filt)));
  ctx.cache.set(key, out);
  return out;
}

export function combine(mapA, mapB, stat) {
  let sum = 0, c = 0, n = 0;
  for (const [g, sa] of mapA) {
    const x = sa[stat];
    if (x == null) continue;
    if (mapB) {
      const y = mapB.get(g)?.[stat];
      if (y == null) continue;
      sum += x - y;
    } else sum += x;
    c++;
    n += sa.n; // rows of contributing cohorts only (the >= 160 / >= 30 checks count contributing rows)
  }
  return { v: c ? sum / c : null, c, n };
}

/** `subject` names the score variant whose bias is measured (S3b passes 'H'). */
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

export const meanOf = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function ciOf(vals) {
  const R = vals.length;
  if (!R) return null;
  const s = [...vals].sort((a, b) => a - b);
  return { ci95: [s[Math.floor(0.025 * R)], s[Math.ceil(0.975 * R) - 1]], used: R };
}

/** Evaluate `specs` on the point sample and on `resamples` clustered resamples (one shared draw sequence). */
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

export function assemble(sp, res, put) {
  const { v, c, n } = res.point;
  const enough = n >= sp.minN && c >= sp.minC && v != null;
  const thin = sp.minUsed != null && res.boot != null && res.boot.used < sp.minUsed; // S4a §5.9 tilt rule
  let ci95 = null, used = null, label;
  if (!enough || thin) {
    label = 'insufficient'; // §8.9: any cell below its minimum is insufficient, even when every row is identical
    if (res.boot) { ci95 = res.boot.ci95; used = res.boot.used; }
  } else if (sp.identical) {
    label = 'variant-identical';
  } else if (!res.boot) {
    label = 'insufficient';
  } else {
    ci95 = res.boot.ci95; used = res.boot.used;
    label = sp.label(ci95);
  }
  put(sp.parts, { value: round6(v), ci95: ci95 ? ci95.map(round6) : null, used, n, cohortsUsed: c, label });
}
