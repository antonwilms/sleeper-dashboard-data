/**
 * scripts/weekly-basis-run.mjs — `bin/backtest.mjs --weekly-basis` (weekly-scoring-keys A3, D-47).
 * Offline analysis, never a test (it reads the current store and the network); writes nothing to nfl/.
 *
 * Graded before/after of serving per-week scoring keys:
 *   T (truth)  = scoreSeasonStats(first-seen RAW week stats, league ss, …) — nothing excluded
 *   B (before) = stored weeklyPoints[w] × the app's season ratio (port of sleeperStats.js:326-330,
 *                @ 0f13091), rounded to 2 dp
 *   A (after)  = scoreSeasonStats(weeklyStats[w] ?? {}, …) for the rows the migration's own guard
 *                (attachWeeklyStats) would attach; refused rows score as B (what the app would show)
 *
 * HONEST FRAMING: T comes from the same Sleeper API as A, so this grade is NOT an independent truth. It
 * is independent of the exclusion list and of the aggregation — those are what can be wrong. It
 * mainly tests that the denylist drops nothing a league scores and that the migration attaches the
 * right weeks; it also re-measures the ratio error on all 14 seasons.
 *
 * League basis: scoringSettings of snapshots/2026-10-14.json (date pinned in the output). Position:
 * raw/-players-nfl.json `position` (the app's playersMap source), else null. deriveFirstDowns per
 * season: !seasonEmitsFirstDownBonus(stored rows).
 *
 * Flags (via bin/backtest.mjs): --weeks-cache <dir> (required, outside the repo), --json, --write.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { readJson, repoPath } from '../lib/io.mjs';
import { scoreSeasonStats, seasonEmitsFirstDownBonus, calculateFantasyPoints } from '../lib/fantasyPoints.mjs';
import { fetchSeasonWeeks, aggregateWeeks, firstSeenEntries } from '../lib/sleeper.mjs';
import { attachWeeklyStats, isMigrationRow } from './migrate-weekly-stats.mjs';

export const SEASONS = Array.from({ length: 14 }, (_, i) => 2012 + i);
export const SNAPSHOT_DATE = '2026-10-14';
export const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'other'];

// Pre-registered decision (task file §3). Written into the verdict ahead of the results table.
export const DECISION = Object.freeze({
  a_share: 0.999, a_tol: 0.011, a_p99: 0.05,
  b_median_rel: 0.01,
  c_coverage: 0.995,
  d_sumcheck: 0.995,
  e_gz_kb: 400,
});
export const DECISION_TEXT = [
  '`wire` iff ALL hold:',
  '- (a) |A−T| ≤ 0.011 on ≥ 99.9% of weeks, and A\'s p99 ≤ 0.05;',
  '- (b) B\'s median relative error (weeks with T ≥ 5) ≥ 1%, so there is something to fix;',
  '- (c) coverage (rows given `weeklyStats` ÷ played rows) ≥ 99.5% in every season;',
  '- (d) the season-sum check passes on ≥ 99.5% of covered rows;',
  '- (e) the added gzip size is ≤ 400 KB in every season.',
  'Otherwise `do-not-wire`, naming the failed criterion. If (a) fails, the top keys by contributed |A−T| are',
  'listed (an excluded key a league scores is the expected cause) and the run stops — the exclusion list is',
  'NOT edited inside this run.',
];

const round2 = v => Math.round(v * 100) / 100;

/** Nearest-rank percentile of an unsorted array (p in 0..1); null when empty. */
export function pct(arr, p) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.max(0, Math.ceil(p * s.length) - 1)];
}

/** The app's ratio rules (src/api/sleeperStats.js:326-330 @ 0f13091), ported. */
export function appRatio(scored, source) {
  if (Number.isFinite(source) && source > 0) return scored / source;
  if (source === 0 && scored === 0) return 1;
  return null;
}

const posBucket = p => (POSITIONS.includes(p) && p !== 'other' ? p : 'other');

function popSd(xs) {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}

class ErrAcc {
  constructor() { this.abs = []; this.rel = []; this.within = 0; this.n = 0; }
  add(est, truth) {
    const e = Math.abs(est - truth);
    this.abs.push(e);
    this.n++;
    if (e <= DECISION.a_tol) this.within++;
    if (truth >= 5) this.rel.push(e / truth);
  }
  summary() {
    return {
      n: this.n,
      absMedian: pct(this.abs, 0.5), absP90: pct(this.abs, 0.9), absP99: pct(this.abs, 0.99),
      absMax: this.abs.reduce((m, v) => (v > m ? v : m), this.abs.length ? -Infinity : null),
      relMedian: pct(this.rel, 0.5), relP90: pct(this.rel, 0.9), relN: this.rel.length,
      shareWithinTol: this.n ? this.within / this.n : null,
    };
  }
}

const sizeOf = rows => {
  const json = JSON.stringify(rows);
  return { raw: Buffer.byteLength(json), gz: zlib.gzipSync(json).length };
};

export const DEFAULT_LOAD = {
  readStored: year => readJson(`nfl/season-totals/${year}.json`),
  readSnapshot: () => readJson(`snapshots/${SNAPSHOT_DATE}.json`),
  readPlayers: () => readJson('raw/-players-nfl.json'),
  fetchWeeks: (year, opts) => fetchSeasonWeeks(year, { dryRun: true, ...opts }),
};

/**
 * @param {{ weeksCache: string, seasons?: number[], load?: typeof DEFAULT_LOAD }} opts
 * @returns {Promise<object>} panel
 */
export async function runWeeklyBasis({ weeksCache, seasons = SEASONS, load = DEFAULT_LOAD } = {}) {
  if (!weeksCache) throw new Error('[weekly-basis] --weeks-cache <dir> is required');
  const snap = load.readSnapshot();
  const ss = snap?.scoringSettings;
  if (!ss || !Object.keys(ss).length) throw new Error(`[weekly-basis] snapshots/${SNAPSHOT_DATE}.json has no scoringSettings`);
  const players = load.readPlayers() ?? {};

  const total = { B: new ErrAcc(), A: new ErrAcc() };
  const byPos = Object.fromEntries(POSITIONS.map(p => [p, { B: new ErrAcc(), A: new ErrAcc() }]));
  const bySeason = {};
  const coverage = {};
  const size = {};
  const sdDiffs = [];
  const keyContrib = {};
  let bNullWeeks = 0;
  const omittedByReason = {};
  let sumPass = 0;
  let sumCovered = 0;

  for (const year of seasons) {
    const stored = load.readStored(year);
    if (!stored) throw new Error(`[weekly-basis] nfl/season-totals/${year}.json missing`);
    const weekData = await load.fetchWeeks(year, { cacheDir: weeksCache });
    const failed = weekData.filter(w => w.failed).map(w => w.week);
    if (failed.length) throw new Error(`[weekly-basis] ${year}: week(s) ${failed.join(', ')} failed to fetch`);
    const fresh = aggregateWeeks(weekData);
    const raw = {};   // week → Map(pid → first-seen raw stats), the same dedup aggregateWeeks applies
    for (const { week, entries } of weekData) {
      raw[week] = new Map(firstSeenEntries(entries).uniqueEntries.map(e => [e.player_id, e.stats]));
    }
    const deriveFirstDowns = !seasonEmitsFirstDownBonus(stored);
    const sAcc = { B: new ErrAcc(), A: new ErrAcc() };
    bySeason[year] = sAcc;
    omittedByReason[year] = { missing: 0, weeks: 0, points: 0, sums: 0 };
    let played = 0;
    let covered = 0;
    const after = {};

    for (const [id, row] of Object.entries(stored)) {
      if (!isMigrationRow(id, row)) { after[id] = row; continue; }
      played++;
      const position = players[id]?.position ?? null;
      const bucket = byPos[posBucket(position)];
      const att = attachWeeklyStats(row, fresh[id]);
      after[id] = att.row;
      const isAtt = att.reason === null;
      if (isAtt) covered++; else omittedByReason[year][att.reason]++;

      const scored = scoreSeasonStats(row.stats ?? {}, ss, { position, deriveFirstDowns });
      const ratio = appRatio(scored, row.fantasyPoints);
      const weeks = Object.keys(row.weeklyPoints ?? {});
      const aSeries = [];
      const bSeries = [];
      let aSum = 0;
      for (const w of weeks) {
        const rawStats = raw[Number(w)]?.get(id);
        if (!rawStats) throw new Error(`[weekly-basis] ${year} ${id}: no raw entry for played week ${w}`);
        const T = scoreSeasonStats(rawStats, ss, { position, deriveFirstDowns });
        const v = row.weeklyPoints[w];
        const B = ratio != null && Number.isFinite(v) ? round2(v * ratio) : null;
        const weekStats = isAtt ? (att.row.weeklyStats[w] ?? {}) : null;
        const A = isAtt ? scoreSeasonStats(weekStats, ss, { position, deriveFirstDowns }) : B;
        if (B == null) bNullWeeks++;
        else { total.B.add(B, T); bucket.B.add(B, T); sAcc.B.add(B, T); bSeries.push(B); }
        if (A != null) { total.A.add(A, T); bucket.A.add(A, T); sAcc.A.add(A, T); aSeries.push(A); }
        if (isAtt) aSum += A;
        if (isAtt && A != null && Math.abs(A - T) > DECISION.a_tol) {
          for (const [k, mult] of Object.entries(ss)) {
            if (mult == null) continue;
            const d = Math.abs(((rawStats[k] ?? 0) - (weekStats[k] ?? 0)) * mult);
            if (d > 0) keyContrib[k] = (keyContrib[k] ?? 0) + d;
          }
        }
      }
      if (isAtt) {
        sumCovered++;
        if (Math.abs(aSum - scored) <= 0.005 * weeks.length + 0.01) sumPass++;
      }
      if (weeks.length >= 8 && aSeries.length === weeks.length && bSeries.length === weeks.length) {
        sdDiffs.push(Math.abs(popSd(aSeries) - popSd(bSeries)));
      }
    }
    coverage[year] = { played, covered, share: played ? covered / played : null, omitted: omittedByReason[year] };
    const sb = sizeOf(stored);
    const sa = sizeOf(after);
    size[year] = { rawBefore: sb.raw, rawAfter: sa.raw, rawAdded: sa.raw - sb.raw, gzBefore: sb.gz, gzAfter: sa.gz, gzAdded: sa.gz - sb.gz };
  }

  const topKeys = Object.entries(keyContrib).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([key, absContribution]) => ({ key, absContribution: round2(absContribution) }));
  const panel = {
    generatedBy: 'bin/backtest.mjs --weekly-basis',
    snapshotDate: SNAPSHOT_DATE,
    seasons,
    framing: 'T is scored from the same Sleeper API as A: the grade tests the exclusion list and the aggregation, not independent truth.',
    decision: DECISION,
    nWeeks: total.A.n,
    bNullWeeks,
    overall: { B: total.B.summary(), A: total.A.summary() },
    byPosition: Object.fromEntries(POSITIONS.map(p => [p, { B: byPos[p].B.summary(), A: byPos[p].A.summary() }])),
    bySeason: Object.fromEntries(seasons.map(y => [y, { B: bySeason[y].B.summary(), A: bySeason[y].A.summary() }])),
    seasonSumCheck: { covered: sumCovered, pass: sumPass, share: sumCovered ? sumPass / sumCovered : null },
    coverage,
    size,
    sdReportOnly: { n: sdDiffs.length, median: pct(sdDiffs, 0.5), p90: pct(sdDiffs, 0.9) },
    topKeysByAbsErrorContribution: topKeys,
  };
  panel.criteria = evaluateCriteria(panel);
  panel.verdict = panel.criteria.every(c => c.pass) ? 'wire' : 'do-not-wire';
  return panel;
}

/** The pre-registered decision applied to a panel → five criteria with values. */
export function evaluateCriteria(panel) {
  const A = panel.overall.A;
  const covShares = Object.entries(panel.coverage).map(([y, c]) => [y, c.share]);
  const minCov = covShares.reduce((m, [y, s]) => (s < m.share ? { year: y, share: s } : m), { year: null, share: Infinity });
  const gz = Object.entries(panel.size).map(([y, s]) => [y, s.gzAdded]);
  const maxGz = gz.reduce((m, [y, g]) => (g > m.gz ? { year: y, gz: g } : m), { year: null, gz: -Infinity });
  return [
    { id: 'a', pass: A.shareWithinTol >= DECISION.a_share && A.absP99 <= DECISION.a_p99,
      value: { shareWithinTol: A.shareWithinTol, absP99: A.absP99 }, rule: '≥99.9% within 0.011 and p99 ≤ 0.05' },
    { id: 'b', pass: panel.overall.B.relMedian >= DECISION.b_median_rel,
      value: { relMedianB: panel.overall.B.relMedian }, rule: 'B median relative error ≥ 1%' },
    { id: 'c', pass: minCov.share >= DECISION.c_coverage,
      value: { minCoverage: minCov.share, atSeason: minCov.year }, rule: 'coverage ≥ 99.5% every season' },
    { id: 'd', pass: panel.seasonSumCheck.share >= DECISION.d_sumcheck,
      value: { share: panel.seasonSumCheck.share }, rule: 'season-sum check ≥ 99.5% of covered rows' },
    { id: 'e', pass: maxGz.gz <= DECISION.e_gz_kb * 1024,
      value: { maxGzAddedBytes: maxGz.gz, atSeason: maxGz.year }, rule: 'added gzip ≤ 400 KB every season' },
  ];
}

const f = (v, d = 4) => (v == null ? 'n/a' : Number.isFinite(v) ? v.toFixed(d) : String(v));
const pc = v => (v == null ? 'n/a' : `${(100 * v).toFixed(2)}%`);
const kb = b => `${(b / 1024).toFixed(0)} KB`;

export function buildVerdictMarkdown(panel, { date }) {
  const L = [];
  L.push(`# Weekly-basis grade — ${date} (weekly-scoring-keys, D-47)`);
  L.push('');
  L.push('## Pre-registered decision (written before the results were read)');
  L.push(...DECISION_TEXT);
  L.push('');
  L.push('## Honest framing');
  L.push(panel.framing + ` League basis: \`snapshots/${panel.snapshotDate}.json\` scoringSettings.`);
  L.push('');
  L.push(`## Verdict: **${panel.verdict}**`);
  L.push('');
  L.push('| criterion | rule | value | pass |');
  L.push('|---|---|---|---|');
  for (const c of panel.criteria) L.push(`| (${c.id}) | ${c.rule} | ${JSON.stringify(c.value)} | ${c.pass ? 'yes' : '**NO**'} |`);
  L.push('');
  L.push(`Weeks graded: ${panel.nWeeks} (B undefined for ${panel.bNullWeeks} weeks — ratio null, excluded from B stats).`);
  L.push('');
  L.push('## Error vs truth T');
  L.push('| | n | abs median | abs p90 | abs p99 | abs max | rel median (T≥5) | rel p90 (T≥5) | within 0.011 |');
  L.push('|---|---|---|---|---|---|---|---|---|');
  for (const k of ['B', 'A']) {
    const s = panel.overall[k];
    L.push(`| ${k} | ${s.n} | ${f(s.absMedian)} | ${f(s.absP90)} | ${f(s.absP99)} | ${f(s.absMax)} | ${pc(s.relMedian)} | ${pc(s.relP90)} | ${pc(s.shareWithinTol)} |`);
  }
  L.push('');
  L.push('## By position');
  L.push('| pos | B rel med | B rel p90 | A rel med | A rel p90 | A within 0.011 | n |');
  L.push('|---|---|---|---|---|---|---|');
  for (const p of POSITIONS) {
    const { B, A } = panel.byPosition[p];
    L.push(`| ${p} | ${pc(B.relMedian)} | ${pc(B.relP90)} | ${pc(A.relMedian)} | ${pc(A.relP90)} | ${pc(A.shareWithinTol)} | ${A.n} |`);
  }
  L.push('');
  L.push('## By season');
  L.push('| season | B rel med | B rel p90 | A within 0.011 | A abs p99 | coverage | omitted (missing/weeks/points/sums) | +raw | +gz |');
  L.push('|---|---|---|---|---|---|---|---|---|');
  for (const y of panel.seasons) {
    const { B, A } = panel.bySeason[y];
    const c = panel.coverage[y];
    const o = c.omitted;
    const z = panel.size[y];
    L.push(`| ${y} | ${pc(B.relMedian)} | ${pc(B.relP90)} | ${pc(A.shareWithinTol)} | ${f(A.absP99)} | ${pc(c.share)} (${c.covered}/${c.played}) | ${o.missing}/${o.weeks}/${o.points}/${o.sums} | ${kb(z.rawAdded)} | ${kb(z.gzAdded)} |`);
  }
  L.push('');
  L.push(`Season-sum check: ${panel.seasonSumCheck.pass}/${panel.seasonSumCheck.covered} covered rows (${pc(panel.seasonSumCheck.share)}).`);
  L.push(`Report-only SD gap |SD_A − SD_B| (≥ 8 games, n=${panel.sdReportOnly.n}): median ${f(panel.sdReportOnly.median)}, p90 ${f(panel.sdReportOnly.p90)}.`);
  if (panel.topKeysByAbsErrorContribution.length) {
    L.push('');
    L.push('## Top keys by contributed |A−T| (weeks over tolerance)');
    for (const k of panel.topKeysByAbsErrorContribution) L.push(`- \`${k.key}\`: ${k.absContribution}`);
  }
  return L.join('\n') + '\n';
}

export function writeWeeklyBasisArtifacts({ panel, verdictMd, date, root = null }) {
  const panelPath = `backtests/${date}-weekly-basis-panel.json`;
  const verdictPath = `grading/${date}-weekly-basis-verdict.md`;
  const abs = rel => (root ? path.join(root, rel) : repoPath(rel));
  const panelJson = JSON.stringify(panel, null, 2) + '\n';
  fs.mkdirSync(path.dirname(abs(panelPath)), { recursive: true });
  fs.mkdirSync(path.dirname(abs(verdictPath)), { recursive: true });
  fs.writeFileSync(abs(panelPath), panelJson, 'utf8');
  fs.writeFileSync(abs(verdictPath), verdictMd, 'utf8');
  return { panelPath, verdictPath, panelBytes: Buffer.byteLength(panelJson) };
}

/** The `--weekly-basis` branch body of `bin/backtest.mjs`. */
export async function weeklyBasisMain({
  weeksCache, write = false, asJson = false, load = DEFAULT_LOAD, date = new Date().toISOString().slice(0, 10),
  writeArtifacts = writeWeeklyBasisArtifacts, log = console.log, logErr = console.error,
} = {}) {
  const panel = await runWeeklyBasis({ weeksCache, load });
  const verdictMd = buildVerdictMarkdown(panel, { date });
  if (write) {
    const w = writeArtifacts({ panel, verdictMd, date });
    logErr(`[backtest] Wrote ${w.panelPath} (${w.panelBytes} B), ${w.verdictPath}`);
  }
  log(asJson ? JSON.stringify(panel, null, 2) : verdictMd);
  return 0;
}
