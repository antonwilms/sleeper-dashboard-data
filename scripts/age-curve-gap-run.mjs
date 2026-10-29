/**
 * scripts/age-curve-gap-run.mjs — the age-curve gap report (S3a §5). Report-only; reads no outcome season.
 *
 * The app builds its age curves, and scores every player, from Sleeper's `age` — stale for players without
 * a team. This report measures that against true ages from birthdates: today's APP curves vs BIRTH curves,
 * the row-level age gap, and how many current players' age-adjusted component (and total score) would move.
 * Inputs: completed season-totals 2012–2025 (league-rescored, via buildAsOfInputs at S = 2025, which refuses
 * 2026.json), raw/-players-nfl.json (Sleeper's ages, captured 2026-05-18), nflverse/playerids.json birthdates.
 * It sets the priority of the fix; it recommends nothing.
 *
 * Exports:
 *   REFERENCE_DATE, REFERENCE_YEAR
 *   runAgeCurveGap({ load })                          → result
 *   buildAgeCurveGapMarkdown(result)                  → string
 *   writeAgeCurveGapReport({ markdown, date, root })  → path
 *   ageCurveGapMain({ load, write, asJson, … })       → exit code
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { repoPath } from '../lib/io.mjs';
import { empiricalAgeCurvesMirror, dynastyScoreMirror } from '../lib/dynastyMirror.mjs';
import { DYNASTY_ASOF_LOAD, buildAsOfInputs, ageOn, curveInputRows, rowGapStats, SKILL } from './dynasty-asof.mjs';

/** The Sleeper capture's date: the reference date D for true ages. */
export const REFERENCE_DATE = '2026-05-18';
export const REFERENCE_YEAR = 2026;
export const AS_OF_SEASON = 2025;

export const AGE_GAP_LOAD = {
  ...DYNASTY_ASOF_LOAD,
  gitRev: () => execSync('git rev-parse --short HEAD', { cwd: repoPath('.') }).toString().trim(),
};

const round2 = (x) => (x == null ? null : Math.round(x * 100) / 100);
const round3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);

// ─── bucket counts (the rows behind each age bucket — dynastyScore.js:72-102's filters) ──────────

function bucketCounts(careerStats, playersMap, currentYear) {
  const counts = { QB: {}, RB: {}, WR: {}, TE: {} };
  for (const [season, seasonData] of Object.entries(careerStats)) {
    for (const [pid, data] of Object.entries(seasonData)) {
      if ((data.gamesPlayed ?? 0) < 10) continue;
      const p = playersMap[pid];
      if (!p || !counts[p.position]) continue;
      if (p.age == null) continue;
      const a = Math.round(p.age - (currentYear - Number(season)));
      if (a < 18 || a > 42) continue;
      if (!Number.isFinite(data.fantasyPoints / data.gamesPlayed)) continue;
      counts[p.position][a] = (counts[p.position][a] ?? 0) + 1;
    }
  }
  return counts;
}

// ─── distribution helpers ─────────────────────────────────────────────────────────────────────────

/** { min, p10, median, mean, p90, max }: p-th = sorted[round(p·(n−1))]; median = mean of the middle pair. */
export function distribution(xs) {
  if (!xs.length) return { min: null, p10: null, median: null, mean: null, p90: null, max: null };
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  const at = (p) => s[Math.round(p * (n - 1))];
  const median = n % 2 === 0 ? (s[n / 2 - 1] + s[n / 2]) / 2 : s[(n - 1) / 2];
  return { min: s[0], p10: at(0.10), median, mean: s.reduce((a, b) => a + b, 0) / n, p90: at(0.90), max: s[n - 1] };
}

function deltaSummary(rows, getA, getB) {
  const d = rows.map(r => getB(r) - getA(r));
  return {
    rows: rows.length,
    changed: d.filter(x => x !== 0).length,
    abs5: d.filter(x => Math.abs(x) >= 5).length,
    dist: distribution(d),
  };
}

function pathOf(res) {
  if (!res || res.score == null) return 'N/A';
  if (res.components) return 'B/C';
  const s = res.signals ?? {};
  if (s.isProspect) return 'A';
  if (s.isUnprovenVet) return 'A2';
  if (s.isStaleData) return 'A3';
  if (s.isDataGap) return 'A4';
  if (s.isNonFinite) return 'nonFinite';
  return 'other';
}

// ─── the run ─────────────────────────────────────────────────────────────────────────────────────

export function runAgeCurveGap({ load = AGE_GAP_LOAD } = {}) {
  const inputs = buildAsOfInputs(load, AS_OF_SEASON, { curveAgeMode: 'birthdate', gamesMode: 'sleeper' });
  const { careerStats, playersMap, teamContext, historicalShares, depthMap, scoringSettings } = inputs;
  const rawPlayers = load.loadRawPlayers();
  const playerIds = load.loadPlayerIds();
  const bySleeper = playerIds?.bySleeper ?? {};

  // Two age maps over the as-of universe (positions as in the app's playersMap).
  const sleeperAge = (pid) => rawPlayers?.[pid]?.age ?? null;
  const birthAge = (pid) => ageOn(bySleeper[pid]?.birthdate, REFERENCE_DATE);
  const mapWith = (ageOf) => {
    const m = {};
    for (const [pid, p] of Object.entries(playersMap)) m[pid] = { ...p, age: ageOf(pid) };
    return m;
  };
  const appMap = mapWith(sleeperAge);
  const birthMap = mapWith(birthAge);

  const APP = empiricalAgeCurvesMirror(careerStats, appMap, { currentYear: REFERENCE_YEAR });
  const BIRTH = empiricalAgeCurvesMirror(careerStats, birthMap, { currentYear: REFERENCE_YEAR });
  const appCounts = bucketCounts(careerStats, appMap, REFERENCE_YEAR);
  const birthCounts = bucketCounts(careerStats, birthMap, REFERENCE_YEAR);

  // §5.1 tables
  const curves = {};
  for (const pos of SKILL) {
    const ageSet = new Set([...APP.curves[pos].map(p => p.age), ...BIRTH.curves[pos].map(p => p.age)]);
    const ppgAt = (curve, age) => curve.find(p => p.age === age)?.medianPPG ?? null;
    const rows = [...ageSet].sort((a, b) => a - b).map(age => {
      const a = ppgAt(APP.curves[pos], age), b = ppgAt(BIRTH.curves[pos], age);
      return {
        age, appN: appCounts[pos][age] ?? 0, birthN: birthCounts[pos][age] ?? 0,
        appPPG: round3(a), birthPPG: round3(b), delta: a != null && b != null ? round3(b - a) : null,
      };
    });
    curves[pos] = {
      rows,
      peakAge: { app: APP.positionPeakAge[pos], birth: BIRTH.positionPeakAge[pos] },
      peakPPG: { app: round3(APP.positionPeakPPG[pos]), birth: round3(BIRTH.positionPeakPPG[pos]) },
      basisScale: { app: APP.positionBasisScale[pos], birth: BIRTH.positionBasisScale[pos] },
    };
  }
  const basisScaleEqual = SKILL.every(pos => APP.positionBasisScale[pos] === BIRTH.positionBasisScale[pos]);

  // Row-level gap
  const posOf = (pid) => playersMap[pid]?.position ?? null;
  const gapRows = curveInputRows(careerStats, posOf, sleeperAge, birthAge, { appYear: REFERENCE_YEAR, birthYear: REFERENCE_YEAR, maxSeason: AS_OF_SEASON });
  const hasTeam = (pid) => rawPlayers?.[pid]?.team != null;
  const rowGap = {
    all: rowGapStats(gapRows),
    withTeam: rowGapStats(gapRows.filter(r => hasTeam(r.pid))),
    noTeam: rowGapStats(gapRows.filter(r => !hasTeam(r.pid))),
    season2015: rowGapStats(gapRows.filter(r => r.season === 2015)),
    planReview2015: { mean: -4.26, off1: 315, n: 349 },
  };

  // §5.2 population and settings
  const population = [];
  const excluded = { notInAsOfUniverse: 0 };
  const rawSkillWithTeam = Object.entries(rawPlayers ?? {})
    .filter(([, p]) => p?.team != null && SKILL.includes(p.position))
    .map(([pid]) => pid).sort();
  const score = (pid, map, bundle) => dynastyScoreMirror(
    pid, map, careerStats, bundle.curves, bundle.positionPeakPPG, null, scoringSettings, null,
    teamContext, depthMap, historicalShares, bundle.positionPeakAge, bundle.positionBasisScale, null, null, {},
  );
  for (const pid of rawSkillWithTeam) {
    if (!playersMap[pid]) { excluded.notInAsOfUniverse++; continue; }
    const a = score(pid, appMap, APP);
    const p = pathOf(a);
    if (p !== 'B/C') { excluded[p] = (excluded[p] ?? 0) + 1; continue; }
    population.push({ pid, a });
  }
  const rows = population.map(({ pid, a }) => {
    const b = score(pid, appMap, BIRTH);
    const c = score(pid, birthMap, BIRTH);
    return {
      pid, position: playersMap[pid].position, name: rawPlayers[pid].full_name ?? pid,
      sleeperAge: sleeperAge(pid), birthAge: birthAge(pid),
      ageAdj: { a: a.components.ageAdjusted.value, b: b.components.ageAdjusted.value, c: c.components.ageAdjusted.value },
      score: { a: a.score, b: b.score, c: c.score },
      label: { a: a.label, b: b.label, c: c.label },
    };
  });
  const byPosition = {};
  const countByPosition = {};
  for (const pos of SKILL) {
    const sub = rows.filter(r => r.position === pos);
    countByPosition[pos] = sub.length;
    byPosition[pos] = summarise(sub);
  }
  const pooled = summarise(rows);
  const top = [...rows]
    .sort((x, y) => Math.abs(y.ageAdj.c - y.ageAdj.a) - Math.abs(x.ageAdj.c - x.ageAdj.a) || (x.pid < y.pid ? -1 : 1))
    .slice(0, 15);

  return {
    referenceDate: REFERENCE_DATE, asOfSeason: AS_OF_SEASON,
    dataRev: typeof load.gitRev === 'function' ? load.gitRev() : null,
    curves, basisScaleEqual, rowGap,
    population: { total: rows.length, byPosition: countByPosition, excluded },
    byPosition, pooled, top,
    inputsChecks: inputs.meta.checks,
  };
}

function summarise(rows) {
  return {
    bMinusA: { ageAdjusted: deltaSummary(rows, r => r.ageAdj.a, r => r.ageAdj.b), score: deltaSummary(rows, r => r.score.a, r => r.score.b) },
    cMinusA: { ageAdjusted: deltaSummary(rows, r => r.ageAdj.a, r => r.ageAdj.c), score: deltaSummary(rows, r => r.score.a, r => r.score.c) },
  };
}

// ─── markdown ────────────────────────────────────────────────────────────────────────────────────

const f = (x, d = 2) => (x == null ? '—' : Number.isFinite(x) ? x.toFixed(d) : String(x));

function distCells(d) {
  return [d.min, d.p10, d.median, d.mean, d.p90, d.max].map(x => f(x, 2)).join(' | ');
}

/** The pooled (c − a) line the hand-back quotes. */
export function pooledLine(result) {
  const c = result.pooled.cMinusA;
  const a = c.ageAdjusted, s = c.score;
  return `Pooled (c − a): ${a.rows} rows; ageAdjusted changed ${a.changed}, |Δ| ≥ 5 on ${a.abs5}; ` +
    `ageAdjusted Δ min/p10/median/mean/p90/max ${[a.dist.min, a.dist.p10, a.dist.median, a.dist.mean, a.dist.p90, a.dist.max].map(x => f(x, 2)).join('/')}; ` +
    `score changed ${s.changed}, |Δ| ≥ 5 on ${s.abs5}; score Δ ${[s.dist.min, s.dist.p10, s.dist.median, s.dist.mean, s.dist.p90, s.dist.max].map(x => f(x, 2)).join('/')}`;
}

export function rowGapLine(result) {
  const g = result.rowGap.season2015, p = result.rowGap.planReview2015;
  return `2015 row-gap check: measured n=${g.n}, mean ${f(g.mean, 2)} y, ${g.off1} off by > 1 y; plan review: n=${p.n}, mean ${p.mean} y, ${p.off1} off by > 1 y (a check, not a gate)`;
}

export function buildAgeCurveGapMarkdown(result) {
  const L = [];
  L.push('# Age-curve gap report (S3a §5)');
  L.push('');
  L.push(`- Reference date D: ${result.referenceDate} (the Sleeper capture's date); currentYear ${REFERENCE_YEAR}; as-of season ${result.asOfSeason}.`);
  L.push(`- Data rev: ${result.dataRev ?? 'n/a'}.`);
  L.push('- Inputs: completed season-totals 2012–2025 (league-rescored), `raw/-players-nfl.json` (Sleeper ages), `nflverse/playerids.json` birthdates, the S = 2025 as-of inputs of `scripts/dynasty-asof.mjs`. No outcome season is read.');
  L.push('- APP = the live app\'s curve (Sleeper `age`); BIRTH = the same builder on true ages from birthdates (whole years on D).');
  L.push('');
  L.push('## 5.1 Curves');
  L.push('');
  L.push(`positionBasisScale ${result.basisScaleEqual ? 'is equal' : '**DIFFERS**'} between APP and BIRTH, as expected (basis ratios do not depend on age).`);
  for (const pos of SKILL) {
    const c = result.curves[pos];
    L.push('');
    L.push(`### ${pos}`);
    L.push('');
    L.push('| age | APP n | BIRTH n | APP medianPPG | BIRTH medianPPG | Δ (BIRTH − APP) |');
    L.push('|---:|---:|---:|---:|---:|---:|');
    for (const r of c.rows) L.push(`| ${r.age} | ${r.appN} | ${r.birthN} | ${f(r.appPPG, 3)} | ${f(r.birthPPG, 3)} | ${f(r.delta, 3)} |`);
    L.push('');
    L.push(`Capped peak age: APP ${c.peakAge.app ?? '—'}, BIRTH ${c.peakAge.birth ?? '—'}. positionPeakPPG: APP ${f(c.peakPPG.app, 3)}, BIRTH ${f(c.peakPPG.birth, 3)}. positionBasisScale: APP ${c.basisScale.app}, BIRTH ${c.basisScale.birth}.`);
  }
  L.push('');
  L.push('### Row-level age gap');
  L.push('');
  L.push('Curve-input rows: gp ≥ 10 skill rows 2012–2025 with both ages non-null; gap = APP age at the season − BIRTH age at the season.');
  L.push('');
  L.push('| rows | n | mean gap (y) | \\|gap\\| > 1 y |');
  L.push('|---|---:|---:|---:|');
  for (const [label, g] of [['all', result.rowGap.all], ['player has a team', result.rowGap.withTeam], ['player has no team', result.rowGap.noTeam], ['season 2015 only', result.rowGap.season2015]]) {
    L.push(`| ${label} | ${g.n} | ${f(g.mean, 2)} | ${g.off1} |`);
  }
  L.push('');
  L.push(rowGapLine(result));
  L.push('');
  L.push('## 5.2 Current players\' age-adjusted component');
  L.push('');
  L.push('Population: skill pids with a non-null `team` in `raw/-players-nfl.json` whose mirror score at S = 2025 is Path B or C under setting (a). Settings: (a) app today — Sleeper ages, APP curves; (b) curve fix only — Sleeper ages, BIRTH curves; (c) full fix — birthdate ages on D, BIRTH curves. All on the S = 2025 as-of inputs (offseason state: no live level, no KTC, per-season-team attribution).');
  L.push('');
  L.push(`Population ${result.population.total}: ${SKILL.map(p => `${p} ${result.population.byPosition[p]}`).join(', ')}. Excluded: ${Object.entries(result.population.excluded).map(([k, v]) => `${k} ${v}`).join(', ')}.`);
  const block = (title, key) => {
    L.push('');
    L.push(`### ${title}`);
    for (const [what, field] of [['ageAdjusted component', 'ageAdjusted'], ['total score (this mirror\'s offseason score, not the live app score (no KTC, live level, QB modifier; per-season-team attribution))', 'score']]) {
      L.push('');
      L.push(`${what}:`);
      L.push('');
      L.push('| position | rows | changed | \\|Δ\\| ≥ 5 | min | p10 | median | mean | p90 | max |');
      L.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
      for (const pos of [...SKILL, 'pooled']) {
        const s = (pos === 'pooled' ? result.pooled : result.byPosition[pos])[key][field];
        L.push(`| ${pos} | ${s.rows} | ${s.changed} | ${s.abs5} | ${distCells(s.dist)} |`);
      }
    }
  };
  block('(b − a): curve fix only', 'bMinusA');
  block('(c − a): full fix', 'cMinusA');
  L.push('');
  L.push(pooledLine(result));
  L.push('');
  L.push('### The 15 largest |Δ ageAdjusted| under (c − a)');
  L.push('');
  L.push('| name | pos | Sleeper age | birthdate age | ageAdj (a) | ageAdj (c) | label (a → c) |');
  L.push('|---|---|---:|---:|---:|---:|---|');
  for (const r of result.top) {
    const lab = r.label.a === r.label.c ? r.label.a : `${r.label.a} → ${r.label.c}`;
    L.push(`| ${r.name} | ${r.position} | ${r.sleeperAge ?? '—'} | ${r.birthAge ?? '—'} | ${r.ageAdj.a} | ${r.ageAdj.c} | ${lab} |`);
  }
  L.push('');
  L.push("Report-only. The priority of the age fix is Anton's decision (backlog: 'Age curves and age inputs read stale Sleeper ages').");
  L.push('');
  return L.join('\n');
}

// ─── artifacts and entry ─────────────────────────────────────────────────────────────────────────

export function writeAgeCurveGapReport({ markdown, date, root = repoPath('.') }) {
  const rel = path.join('grading', `${date}-age-curve-gap.md`);
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, markdown, 'utf8');
  return rel;
}

/** The `--age-curve-gap` branch body of `bin/backtest.mjs`. */
export function ageCurveGapMain({
  load = AGE_GAP_LOAD, write = false, asJson = false, writeReport = writeAgeCurveGapReport,
  date = new Date().toISOString().slice(0, 10), log = console.log, logErr = console.error,
} = {}) {
  const result = runAgeCurveGap({ load });
  const markdown = buildAgeCurveGapMarkdown(result);
  if (write) {
    const rel = writeReport({ markdown, date });
    logErr(`[backtest] Wrote ${rel}`);
  }
  log(asJson ? JSON.stringify(result, null, 2) : markdown);
  return 0;
}
