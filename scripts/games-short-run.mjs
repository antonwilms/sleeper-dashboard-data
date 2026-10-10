/**
 * scripts/games-short-run.mjs — projected-games calibration, short-season-only candidates (L6c;
 * `bin/backtest.mjs --games-calibration --short`). Task file: .claude/tasks/games-calibration-short-only.md.
 * Extends L6b (.claude/tasks/games-calibration-cause-split.md). Offline analysis only: no served file, no manifest
 * entry. The pure core is lib/gamesCalibration.mjs (L6c section); rows, cause states and the 2026 veterans come from
 * scripts/games-cause-run.mjs (`buildCauseRows`, `causeVeterans`).
 *
 * Qualifying S-seasons keep the app prediction; k is fitted on non-qualifying rows only (D5, D6).
 *
 * Public exports:
 *   runGamesShort({ load, defaults, causeDefaults, log })        → result
 *   buildGamesShortVerdictMarkdown(result)                       → string
 *   writeGamesShortArtifacts({ result, verdictMd, root })        → { panelPath, constantsPath, verdictPath, panelBytes }
 *   gamesShortMain({ load, defaults, causeDefaults, write, asJson, writeArtifacts, log, logErr }) → exit code
 */

import fs from 'fs';
import path from 'path';
import { repoPath } from '../lib/io.mjs';
import { forwardChainFolds } from '../lib/panel.mjs';
import { GAMES_CAL_LOAD } from './games-calibration-run.mjs';
import {
  buildCauseRows, causeVeterans, cellMetrics, cellTable, ParityStop, SnapshotStop,
} from './games-cause-run.mjs';
import {
  GAMES_CAL_DEFAULTS, CAUSE_CANDIDATES, CAUSE_DEFAULTS, SHORT_CANDIDATES, SHORT_CANDIDATE_IDS, SHORT_REFERENCE_IDS,
  SHORT_ALL_IDS, isShortFitRow, fitCandidate, fitShortCandidate, shortPred, kFor, candidatePred, foldTrainRows,
  deltaStats, decideShort, shortEligibility,
} from '../lib/gamesCalibration.mjs';

export { ParityStop, SnapshotStop };

const POSITIONS = ['QB', 'RB', 'WR', 'TE'];
const REF_AND_CAND = [...SHORT_REFERENCE_IDS, ...SHORT_CANDIDATE_IDS];

const round3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const rawMean = (rows, id) => mean(rows.map((r) => r.p[id] - r.outcome));
const rawMae = (rows, id) => mean(rows.map((r) => Math.abs(r.p[id] - r.outcome)));
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// ─── held-out fit (step 3, 4) ────────────────────────────────────────────────

function boundaryOf(model, kGrid) {
  const out = [];
  for (const [level, cells] of Object.entries(model.cells)) {
    for (const [key, c] of Object.entries(cells)) if (c.k === kGrid.from) out.push(`${level}|${key}`);
  }
  return out;
}

function runFit(rows, defaults, log) {
  const years = [];
  for (let y = defaults.predictorSeasons.from; y <= defaults.predictorSeasons.to; y++) years.push(y);
  const folds = forwardChainFolds(years, defaults.minTrainSeasons);
  const oos = [];
  const foldInfo = [];
  const opts = { minCellTrainPlayers: defaults.minCellTrainPlayers, kGrid: defaults.kGrid };
  let qualRowsChecked = 0;
  for (const fold of folds) {
    const train = foldTrainRows(rows, fold);
    const evalRows = rows.filter((r) => r.S === fold.evalYear);
    const refModels = Object.fromEntries(SHORT_REFERENCE_IDS.map((id) => [id, fitCandidate(train, id, { ...opts, candidates: CAUSE_CANDIDATES })]));
    const candModels = Object.fromEntries(SHORT_CANDIDATE_IDS.map((id) => [id, fitShortCandidate(train, id, opts)]));
    const fb = {};
    const foldOos = evalRows.map((r) => {
      const p = { C0: r.pred };
      for (const id of SHORT_REFERENCE_IDS) p[id] = candidatePred(r.avgGames, kFor(refModels[id], r).k, CAUSE_CANDIDATES[id].floor);
      for (const id of SHORT_CANDIDATE_IDS) {
        const sp = shortPred(candModels[id], r);
        p[id] = sp.p;
        if (r.sState !== 'qual' && sp.fallback) {
          const m = (fb[id] ??= {});
          const key = `${sp.requested}->${sp.used}`;
          m[key] = (m[key] ?? 0) + 1;
        }
      }
      if (r.sState === 'qual') {
        qualRowsChecked++;
        if (p.SOf0 !== p.C0 || p.SOK1f0 !== p.C0) {
          throw new Error(`[games-short] qualifying-row invariant broken: ${r.id} S=${r.S} (SOf0 ${p.SOf0}, SOK1f0 ${p.SOK1f0}, C0 ${p.C0})`);
        }
      }
      return { id: r.id, S: r.S, position: r.position, sState: r.sState, k1: r.k1, relevant: r.relevant, star: r.star, outcome: r.outcome, p };
    });
    oos.push(...foldOos);
    foldInfo.push({
      evalYear: fold.evalYear, trainYears: [fold.trainYears[0], fold.trainYears[fold.trainYears.length - 1]],
      trainRows: train.length, trainShortRows: train.filter(isShortFitRow).length,
      evalRows: evalRows.length, evalShortRows: evalRows.filter(isShortFitRow).length,
      fallbackRows: Object.fromEntries(Object.entries(fb).map(([id, m]) => [id, Object.values(m).reduce((a, b) => a + b, 0)])),
      fallbackCells: fb,
      thinTrainCells: Object.fromEntries(SHORT_CANDIDATE_IDS.map((id) => [id, candModels[id].thin])),
      boundaryCells: Object.fromEntries(SHORT_CANDIDATE_IDS.map((id) => [id, boundaryOf(candModels[id], defaults.kGrid)])),
    });
    log(`fold eval ${fold.evalYear}: train ${train.length}, eval ${evalRows.length}`);
  }

  const bs = defaults.bootstrap;
  const mk = (rs) => cellMetrics(rs, bs, SHORT_ALL_IDS);
  const relevantRows = oos.filter((r) => r.relevant);
  const starRows = oos.filter((r) => r.star);
  const rStarRows = oos.filter((r) => r.relevant || r.star);
  const nonQualRows = oos.filter((r) => r.sState !== 'qual');
  const tables = {
    relevant: mk(relevantRows), star: mk(starRows), rStar: mk(rStarRows), pooled: mk(oos),
    nonQual: mk(nonQualRows), notRelevant: mk(oos.filter((r) => !r.relevant)),
    byPosition: {}, relevantByPosition: {}, starByK1: {}, era2020: mk(oos.filter((r) => r.S >= 2020)),
  };
  for (const p of POSITIONS) {
    tables.byPosition[p] = mk(oos.filter((r) => r.position === p));
    tables.relevantByPosition[p] = mk(relevantRows.filter((r) => r.position === p));
  }
  for (const s of [...new Set(starRows.map((r) => r.k1))].sort()) tables.starByK1[s] = mk(starRows.filter((r) => r.k1 === s));

  return { folds: foldInfo, oos, tables, relevantRows, starRows, rStarRows, nonQualRows, qualRowsChecked };
}

// ─── outcomes (step 5) ───────────────────────────────────────────────────────

function outcomeTable(rows) {
  const groups = { all: rows };
  for (const s of [...new Set(rows.map((r) => r.k1))].sort()) groups[s] = rows.filter((r) => r.k1 === s);
  const out = {};
  for (const [name, rs] of Object.entries(groups)) {
    out[name] = {
      n: rs.length, actualMean: round3(mean(rs.map((r) => r.outcome))), actualMedian: median(rs.map((r) => r.outcome)),
      byId: Object.fromEntries(SHORT_ALL_IDS.map((id) => [id, { meanPred: round3(mean(rs.map((r) => r.p[id]))), mae: round3(rawMae(rs, id)) }])),
    };
  }
  return out;
}

// ─── decisions (step 6) ──────────────────────────────────────────────────────

function summariesFor(fit) {
  const { tables, relevantRows, rStarRows } = fit;
  const s = {};
  for (const id of REF_AND_CAND) {
    s[id] = {
      relevant: { dMae: tables.relevant[id].dMae, bias: rawMean(relevantRows, id), c0Bias: rawMean(relevantRows, 'C0') },
      star: { dMae: tables.star[id].dMae },
      pooled: { dMse: tables.pooled[id].dMse },
      rStar: { mae: rawMae(rStarRows, id) },
      relevantByPosition: Object.fromEntries(POSITIONS.map((p) => [p, { dMae: tables.relevantByPosition[p][id].dMae }])),
    };
  }
  return s;
}

// ─── full-sample constants (step 7) ──────────────────────────────────────────

function fullSample(rows, defaults) {
  const opts = { minCellTrainPlayers: defaults.minCellTrainPlayers, kGrid: defaults.kGrid };
  const full = {};
  for (const id of SHORT_REFERENCE_IDS) full[id] = fitCandidate(rows, id, { ...opts, candidates: CAUSE_CANDIDATES });
  for (const id of SHORT_CANDIDATE_IDS) full[id] = fitShortCandidate(rows, id, opts);
  const constants = {};
  for (const id of REF_AND_CAND) {
    const k = {};
    for (const [level, cells] of Object.entries(full[id].cells)) {
      k[level] = {};
      for (const [key, c] of Object.entries(cells)) k[level][key] = c.k;
    }
    constants[id] = {
      floor: full[id].floor, fitRows: SHORT_CANDIDATE_IDS.includes(id) ? 'non-qual' : 'all', k,
      thinCells: full[id].thin, boundaryCells: boundaryOf(full[id], defaults.kGrid),
    };
  }
  return { full, constants };
}

// ─── 2026 impact (step 8) ────────────────────────────────────────────────────

function impactAll({ full, people0, causeDefaults }) {
  const people = people0.map((x) => {
    const games = { C0: x.projectedGames };
    for (const id of SHORT_REFERENCE_IDS) games[id] = candidatePred(x.avgGames, kFor(full[id], x).k, CAUSE_CANDIDATES[id].floor);
    for (const id of SHORT_CANDIDATE_IDS) games[id] = shortPred(full[id], { ...x, pred: x.projectedGames }).p;
    return { ...x, games };
  });
  const byCandidate = {};
  for (const id of REF_AND_CAND) {
    const meanChange = Object.fromEntries(POSITIONS.map((p) => [p, round3(mean(people.filter((x) => x.position === p).map((x) => x.games[id] - x.games.C0)))]));
    const rankChanged = {};
    for (const p of POSITIONS) {
      const list = people.filter((x) => x.position === p && Number.isFinite(x.ppg));
      const rank = (key) => {
        const m = new Map();
        [...list].sort((a, b) => b.ppg * b.games[key] - a.ppg * a.games[key] || (a.id < b.id ? -1 : 1)).forEach((x, i) => m.set(x.id, i + 1));
        return m;
      };
      const rb = rank('C0'), ra = rank(id);
      rankChanged[p] = { players: list.length, changed: list.filter((x) => rb.get(x.id) !== ra.get(x.id)).length };
    }
    byCandidate[id] = {
      veterans: people.length, changed: people.filter((x) => x.games[id] !== x.games.C0).length,
      nonQual: people.filter((x) => x.sState !== 'qual').length, meanChange, rankChanged,
      rel3Cut: people.filter((x) => x.rel3 && x.games.C0 - x.games[id] >= causeDefaults.starCutGames).length,
    };
  }
  const rowOf = (x) => ({ id: x.id, name: x.name, position: x.position, sState: x.sState, k1: x.k1, rel3: x.rel3, games: x.games });
  const names = Object.fromEntries(people0.map((x) => [x.id, x.name]));
  const pinned = causeDefaults.pinned.map((id) => {
    const x = people.find((q) => q.id === id);
    return x ? rowOf(x) : { id, name: names[id] ?? id, notVeteran: true };
  });
  const maxAbs = (x) => Math.max(...SHORT_CANDIDATE_IDS.map((c) => Math.abs(x.games[c] - x.games.C0)));
  const autoAll = people.filter((x) => x.rel3 && !causeDefaults.pinned.includes(x.id) && maxAbs(x) >= causeDefaults.autoStarMinDelta)
    .sort((a, b) => maxAbs(b) - maxAbs(a) || a.name.localeCompare(b.name));
  return {
    veterans: people.length, byCandidate,
    namedStars: { pinned, auto: autoAll.slice(0, causeDefaults.autoStarCap).map(rowOf), autoOverflow: Math.max(0, autoAll.length - causeDefaults.autoStarCap) },
  };
}

// ─── runGamesShort ───────────────────────────────────────────────────────────

export function runGamesShort({ load = GAMES_CAL_LOAD, defaults = GAMES_CAL_DEFAULTS, causeDefaults = CAUSE_DEFAULTS, log = () => {} } = {}) {
  // step 1 — rows
  const c = buildCauseRows({ load, defaults, log });
  const { rows } = c;

  // steps 3–4 — held-out fit and tables (step 2's out-of-sample counts need them)
  const fit = runFit(rows, defaults, log);

  // step 2 — descriptives
  const countBy = (rs, key) => Object.fromEntries([...new Set(rs.map((r) => r[key]))].sort().map((k) => [k, rs.filter((r) => r[key] === k).length]));
  const nonQualPanel = rows.filter(isShortFitRow);
  const qualLow = rows.filter((r) => r.sState === 'qual' && r.avgGames < 8);
  const descriptives = {
    panelBySState: countBy(rows, 'sState'),
    nonQualByK1: countBy(nonQualPanel, 'k1'),
    relevantNonQual: { all: nonQualPanel.filter((r) => r.relevant).length, oos: fit.relevantRows.filter((r) => r.sState !== 'qual').length },
    star: { all: rows.filter((r) => r.star).length, oos: fit.starRows.length },
    qualAvgGamesBelow8: { n: qualLow.length, predChanges: qualLow.filter((r) => r.pred !== Math.round(clamp(r.avgGames, 0, 17))).length },
    qualInvariant: `held for all ${fit.qualRowsChecked} out-of-sample qualifying rows`,
  };

  // step 5 — outcomes
  const outcomes = { star: outcomeTable(fit.starRows), nonQual: outcomeTable(fit.nonQualRows) };

  // step 6 — decisions
  const summaries = summariesFor(fit);
  const pairedCache = new Map();
  const paired = (hi, lo) => {
    const key = `${hi}|${lo}`;
    if (!pairedCache.has(key)) pairedCache.set(key, deltaStats(fit.rStarRows, (r) => r.p[hi], (r) => r.p[lo], 'mae', defaults.bootstrap).ci95);
    return pairedCache.get(key);
  };
  const decisions = {};
  for (const delta of causeDefaults.deltas) {
    const d = decideShort({ summaries, paired, delta, recon: { mean: c.reconMean }, tolerance: defaults.reconcileTolerance });
    d.eligibility = Object.fromEntries(Object.keys(summaries).map((id) => [id, d.eligibility[id] ?? shortEligibility(summaries[id], delta)]));
    decisions[delta] = d;
  }
  const relevantBias = Object.fromEntries(SHORT_ALL_IDS.map((id) => [id, rawMean(fit.relevantRows, id)]));

  // step 7 — full-sample constants
  const { full, constants } = fullSample(rows, defaults);

  // step 8 — 2026 impact
  const names = c.g.loadPlayersRaw?.() ?? {};
  const people0 = causeVeterans({ store: c.store, rosterByYear: c.rosterByYear, snapshot: c.snapshot, positionOf: c.positionOf, bySleeper: c.bySleeper, names, defaults, rankIndex: c.rankIndex, to: c.to });
  const impact = impactAll({ full, people0, causeDefaults });

  const panelRev = c.g.gitRev?.() ?? null;
  const generatedAt = new Date().toISOString();
  return {
    meta: { generatedAt, panelRev, seasons: defaults.seasons, predictorSeasons: defaults.predictorSeasons, snapshot: defaults.snapshotDate,
      bootstrap: defaults.bootstrap, minTrainSeasons: defaults.minTrainSeasons, parityFixture: 'test/fixtures/durability-parity-2026-10-04.json', parityFixtureRev: c.fixture.sourceRev,
      basis: 'half_ppr (served fantasyPoints)', primaryDelta: causeDefaults.primaryDelta, deltas: causeDefaults.deltas,
      kGrid: defaults.kGrid, candidates: { ...SHORT_CANDIDATES, references: SHORT_REFERENCE_IDS } },
    parity: { dm1: { rows: c.parity.rows, matched: c.parity.matched, rate: round3(c.parity.rate), mismatches: c.parity.mismatches.length }, avgGamesAssertion: `all ${rows.length} panel rows` },
    panelCounts: c.panelCounts, recon: c.reconInfo, descriptives,
    qb: { folds: fit.folds, tables: fit.tables },
    outcomes,
    constants: { generatedAt, panelRev, candidates: constants, fallbacks: fit.folds.map((f) => ({ evalYear: f.evalYear, rows: f.fallbackRows, cells: f.fallbackCells })) },
    decisions, relevantBias, impact,
    rows: fit.oos,
  };
}

// ─── Verdict markdown ────────────────────────────────────────────────────────

const f2 = (x) => (x == null ? 'n/a' : Number(x).toFixed(2));
const sgn = (x) => (x == null ? 'n/a' : `${x >= 0 ? '+' : ''}${Number(x).toFixed(2)}`);

export function buildGamesShortVerdictMarkdown(r) {
  const out = [];
  const w = (...l) => out.push(...l);
  const { meta, parity, panelCounts: pc, recon, descriptives: d, qb, outcomes, constants, decisions, relevantBias, impact } = r;
  const T = qb.tables;
  const deltas = meta.deltas;
  const ct = (t) => cellTable(t, SHORT_ALL_IDS);
  w(`# Projected-games calibration — short-season-only candidates (L6c) — ${meta.generatedAt.slice(0, 10)}`, '');

  w('## 1. What was compared', '',
    `Panel: L6b's (\`buildCauseRows\`, unchanged), data \`${(meta.panelRev ?? 'n/a').slice(0, 7)}\`: ${Object.values(d.panelBySState).reduce((a, b) => a + b, 0)} player-seasons, ` +
    `predictor seasons S = ${meta.predictorSeasons.from}–${meta.predictorSeasons.to}, outcome S+1 \`gamesPlayed\`. Folds: forward-chaining, ≥ ${meta.minTrainSeasons} training seasons — eval S = ${qb.folds.map((f) => f.evalYear).join(', ')}. ` +
    '**D1:** each cell\'s k minimises training SSE. **Qualifying S-seasons keep the app prediction (`r.pred`); k is fitted and applied only to non-qualifying ones (floor 0).**', '',
    '- **SOf0:** k by position × S-state (`short` / `none`), floor 0, fitted on non-qualifying training rows.',
    '- **SOK1f0:** the same with L6b\'s app-native K1 cause split (`short-inj` / `short-oth` / `none`).',
    '- **References** (refitted on all rows in the same folds; tabled, never walked): C3f0 (L6\'s pick) and K1f0.', '',
    `Cohorts: \`relevant\` ${T.relevant.C0.n} out-of-sample rows; \`star\` (rel3 ∧ S-state ≠ qual) ${T.star.C0.n}; R\\* ${T.rStar.C0.n}; all veterans ${T.pooled.C0.n}; non-qualifying ${T.nonQual.C0.n}. ` +
    `\`relevant\` holds only ${d.relevantNonQual.oos} non-qualifying out-of-sample rows, so G1 mainly confirms that relevant players are left alone; the star cohort carries the evidence.`, '',
    `δ (games of relevant MAE): ${deltas.join(' / ')}; default ${meta.primaryDelta}. All three are computed.`, '');

  w('## 2. Parity and reconciliation', '',
    `- DM-1 (asserted ≥ 99%): **${parity.dm1.matched}/${parity.dm1.rows} = ${(parity.dm1.rate * 100).toFixed(1)}%**.`,
    `- \`avgGames\` assertion: held for ${parity.avgGamesAssertion}.`,
    `- Reconciliation: mean ${recon.mean}, ${recon.nonZero} rows ≠ 0; \`accountingSkipped\` ${recon.accountingSkipped}.`,
    `- Panel counts: ${pc.included} included (${pc.includedZeroOutcome} at outcome 0), ${pc.excludedNoRowNoReserve} excluded, ${pc.notVeteran} not yet veterans, ${pc.noQualifying} with no qualifying season.`,
    `- Panel rows by S-state: ${Object.entries(d.panelBySState).map(([k, v]) => `${k} ${v}`).join(', ')}; non-qualifying by K1: ${Object.entries(d.nonQualByK1).map(([k, v]) => `${k} ${v}`).join(', ')}.`,
    `- Relevant non-qualifying rows: ${d.relevantNonQual.all} (${d.relevantNonQual.oos} out-of-sample); star rows: ${d.star.all} (${d.star.oos} out-of-sample).`,
    `- D5 evidence: ${d.qualAvgGamesBelow8.n} qualifying rows have \`avgGames < 8\`; for ${d.qualAvgGamesBelow8.predChanges} of them the app prediction differs from a floor-0 prediction (\`pred !== round(clamp(avgGames, 0, 17))\`).`,
    `- Qualifying-row invariant (\`p.SOf0 === p.SOK1f0 === p.C0\`): ${d.qualInvariant}.`, '');

  w('## 3. Held-out results', '', 'ΔMSE / ΔMAE are candidate − C0 with player-clustered paired-bootstrap 95% CIs (n/a under 30 players).', '');
  const sub = (title, obj) => { w(`### ${title}`, ''); for (const [name, t] of Object.entries(obj)) w(`**${name}**`, '', ct(t), ''); };
  sub('3.1 Relevant', { relevant: T.relevant });
  sub('3.2 Star (rel3 ∧ S-state ≠ qual)', { star: T.star });
  sub('3.3 R* (relevant ∪ star)', { 'R*': T.rStar });
  sub('3.4 All veterans', { pooled: T.pooled });
  sub('3.5 Non-qualifying rows', { 'non-qualifying': T.nonQual });
  sub('3.6 Not relevant', { 'not relevant': T.notRelevant });
  sub('3.7 By position', T.byPosition);
  sub('3.8 Relevant, by position', T.relevantByPosition);
  sub('3.9 Star, by K1 state', T.starByK1);
  sub('3.10 Eval S 2020–2024', { 'eval S ≥ 2020': T.era2020 });
  w('### 3.11 Fallbacks', '', '| eval S | train rows (non-qual) | eval rows (non-qual) | non-qual rows on a parent k | cells at the grid floor |', '|---|---|---|---|---|');
  for (const f of qb.folds) {
    w(`| ${f.evalYear} | ${f.trainRows} (${f.trainShortRows}) | ${f.evalRows} (${f.evalShortRows}) | ${Object.entries(f.fallbackRows).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'} | ` +
      `${SHORT_CANDIDATE_IDS.map((id) => `${id} ${f.boundaryCells[id].length}`).join(', ')} |`);
  }
  w('');

  w('## 4. What short-season stars actually played', '', 'Out-of-sample rows by K1 state: actual outcome and each rule\'s mean prediction / MAE.', '');
  for (const [title, t] of [['Star rows', outcomes.star], ['All non-qualifying rows', outcomes.nonQual]]) {
    w(`**${title}**`, '', `| K1 state | n | actual mean | actual median | ${SHORT_ALL_IDS.map((id) => `${id} pred / MAE`).join(' | ')} |`, `|---|---|---|---|${SHORT_ALL_IDS.map(() => '---').join('|')}|`);
    for (const [name, g] of Object.entries(t)) w(`| ${name} | ${g.n} | ${f2(g.actualMean)} | ${g.actualMedian == null ? 'n/a' : g.actualMedian} | ${SHORT_ALL_IDS.map((id) => `${f2(g.byId[id].meanPred)} / ${f2(g.byId[id].mae)}`).join(' | ')} |`);
    w('');
  }

  w('## 5. Full-sample k tables', '', 'Fitted once more on the full panel (S 2015–2024), nested by level. SOf0 and SOK1f0 fit on **non-qualifying rows only**; the references fit on all rows. Written to `backtests/<date>-games-short-constants.json`.', '');
  for (const id of REF_AND_CAND) {
    const c = constants.candidates[id];
    const edge = new Set(c.boundaryCells);
    w(`- **${id}** (floor ${c.floor}, fit rows: ${c.fitRows}): ${Object.entries(c.k).map(([lvl, cells]) => `\`${lvl}\` { ${Object.entries(cells).map(([k, v]) => `${k} ${v}${edge.has(`${lvl}|${k}`) ? ` (at grid floor ${meta.kGrid.from.toFixed(2)})` : ''}`).join(', ')} }`).join('; ')}${c.thinCells.length ? `; thin → parent: ${c.thinCells.map((t) => `${t.cell} (${t.players})`).join(', ')}` : ''}`);
  }
  w('');

  w('## 6. Decision', '',
    'Eligible when: **G1** relevant ΔMAE CI upper bound ≤ δ; **G3** star ΔMAE CI upper bound < 0 (improved, strict); **G4** all-veteran ΔMSE CI upper bound < 0; **G5** no position whose relevant ΔMAE CI lower bound > δ. A null CI fails G1/G3/G4 and does not fail G5. ' +
    '**G2 (relevant bias) is reported, not gated** — the candidates leave qualifying rows, and therefore the relevant bias, unchanged. ' +
    'Tier order: SOf0 < SOK1f0; SOK1f0 replaces SOf0 only when its paired R\\* ΔMAE CI upper bound is below 0. The references are scored and never picked.', '',
    `| candidate | ${deltas.map((x) => `δ = ${x}`).join(' | ')} |`, `|---|${deltas.map(() => '---').join('|')}|`);
  for (const id of REF_AND_CAND) {
    const label = SHORT_REFERENCE_IDS.includes(id) ? `${id} (reference)` : id;
    w(`| ${label} | ${deltas.map((x) => { const e = decisions[x].eligibility[id]; return !e ? 'n/a' : e.eligible ? 'eligible' : `fails ${e.failed.join(', ')}`; }).join(' | ')} |`);
  }
  w('', `Relevant bias (raw mean pred − outcome): ${SHORT_ALL_IDS.map((id) => `${id} ${sgn(relevantBias[id])}`).join(', ')}.`, '');
  for (const x of deltas) w(`- ${x === meta.primaryDelta ? '**' : ''}δ = ${x}: ${decisions[x].text}${x === meta.primaryDelta ? '**' : ''}`);
  w('', 'The choice is Anton\'s.', '');

  w('## 7. 2026 impact and named stars', '',
    `Veterans in the ${meta.snapshot} snapshot: ${impact.veterans}. Games change vs C0; rank change = projectedPPG × games.`, '',
    '| id | changed | non-qual | mean Δ QB | RB | WR | TE | rel3 cut ≥ 4 | rank changes (QB / RB / WR / TE) |', '|---|---|---|---|---|---|---|---|---|');
  for (const [id, c] of Object.entries(impact.byCandidate)) {
    w(`| ${id} | ${c.changed} | ${c.nonQual} | ${POSITIONS.map((p) => sgn(c.meanChange[p])).join(' | ')} | ${c.rel3Cut} | ${POSITIONS.map((p) => `${c.rankChanged[p].changed}/${c.rankChanged[p].players}`).join(' / ')} |`);
  }
  const cols = SHORT_ALL_IDS;
  w('', '**Named stars** (guardrail for Anton, not a gate): pinned first, then every rel3 veteran whose games change by ≥ 3 under a candidate.', '',
    `| player | pos | S-state | K1 | rel3 | ${cols.join(' | ')} |`, `|---|---|---|---|---|${cols.map(() => '---').join('|')}|`);
  for (const x of [...impact.namedStars.pinned, ...impact.namedStars.auto]) {
    if (x.notVeteran) { w(`| ${x.name} (${x.id}) | not a 2026 veteran | | | | ${cols.map(() => '').join(' | ')} |`); continue; }
    w(`| ${x.name} | ${x.position} | ${x.sState} | ${x.k1} | ${x.rel3 ? 'yes' : 'no'} | ${cols.map((c) => x.games[c]).join(' | ')} |`);
  }
  if (impact.namedStars.autoOverflow) w('', `(${impact.namedStars.autoOverflow} further auto-selected veterans omitted by the cap.)`);
  w('');

  w('## 8. Limits', '',
    `- The ${meta.kGrid.from.toFixed(2)} grid floor binds for the cells marked in §5. The fitted cuts are therefore conservative; the grid is pre-registered and was not widened.`,
    '- **This is not an independent confirmation.** The candidates were chosen from L6b §5\'s out-of-sample breakdown. The gates were set after a Session 1 probe of this exact run: G2 was dropped and G3 tightened. These held-out CIs re-score the same panel, folds and seed that suggested the candidates, so a (W) carries that selection effect. The first clean test is forward grading (2026 outcomes).',
    `- \`relevant\` has few non-qualifying out-of-sample rows (${d.relevantNonQual.oos}); see §1.`,
    '- Qualifying-row bias (+1.6 relevant) is left in place by design.',
    '- Ranks use half-PPR; the app uses league scoring. §7\'s rank impact uses the snapshot\'s league-scored `projectedPPG`.',
    '- Floor 0 applies to non-qualifying rows only, and needs an app clamp change for those rows.',
    '- L6b\'s limits carry over: `chain` QB totals do not read `projectedGames`; historical rows cannot be routed to `chain`; snapshot scoring; rookies are out of scope.',
    '- **Wireability:** SOf0 needs only last-season gp and position. SOK1f0 also needs `classifyInjurySeason`, which is CR-28-mirrored and app-native. Both would wire as an app `seasonProjection.js` Step 6 change under CR-28, with a `grading/anchor-policy.md` boundary.');
  return out.join('\n');
}

// ─── Artifacts ───────────────────────────────────────────────────────────────

export function writeGamesShortArtifacts({ result, verdictMd, root = null }) {
  const date = result.meta.generatedAt.slice(0, 10);
  const panelPath = `backtests/${date}-games-short-panel.json`;
  const constantsPath = `backtests/${date}-games-short-constants.json`;
  const verdictPath = `grading/${date}-games-short-verdict.md`;
  const { constants, ...panel } = result;
  const panelJson = JSON.stringify(panel, null, 2) + '\n';
  const abs = (rel) => (root ? path.join(root, rel) : repoPath(rel));
  fs.mkdirSync(abs('backtests'), { recursive: true });
  fs.mkdirSync(abs('grading'), { recursive: true });
  fs.writeFileSync(abs(panelPath), panelJson, 'utf8');
  fs.writeFileSync(abs(constantsPath), JSON.stringify(constants, null, 2) + '\n', 'utf8');
  fs.writeFileSync(abs(verdictPath), verdictMd.endsWith('\n') ? verdictMd : verdictMd + '\n', 'utf8');
  return { panelPath, constantsPath, verdictPath, panelBytes: Buffer.byteLength(panelJson) };
}

/** The `--games-calibration --short` branch body of `bin/backtest.mjs`. Exit 1 on ParityStop/SnapshotStop (nothing written). */
export function gamesShortMain({
  load = GAMES_CAL_LOAD, defaults = GAMES_CAL_DEFAULTS, causeDefaults = CAUSE_DEFAULTS, write = false, asJson = false,
  writeArtifacts = writeGamesShortArtifacts, log = console.log, logErr = console.error,
} = {}) {
  try {
    const result = runGamesShort({ load, defaults, causeDefaults, log: (m) => logErr(`[backtest] ${m}`) });
    const verdictMd = buildGamesShortVerdictMarkdown(result);
    if (write) {
      const w = writeArtifacts({ result, verdictMd });
      logErr(`[backtest] Wrote ${w.panelPath} (${w.panelBytes} B), ${w.constantsPath}, ${w.verdictPath}`);
    }
    log(asJson ? JSON.stringify(result, null, 2) : verdictMd);
    return 0;
  } catch (err) {
    if (err instanceof ParityStop || err instanceof SnapshotStop) {
      logErr(`[backtest] ${err.message}`);
      return 1;
    }
    throw err;
  }
}
