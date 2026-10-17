/**
 * scripts/rookie-total-run.mjs — D-13 adapter (research-arms-w3, .claude/tasks/research-arms-w3-d13.md §7):
 * composes the SHIPPED per-row rookie projection (calibrated, ceiled PPG × the availability ladder's games) on W2's
 * committed availability panel and measures it against realised total points. Offline analysis only; changes no
 * score. Reaches lib/rookieMirror.mjs, so it sits outside bin/panel.mjs's closure (T-RM1).
 *
 *   runRookieTotal({ load, pin })                 → result (no per-row data)
 *   buildRookieTotalVerdictMarkdown(result)       → string
 *   writeRookieTotalArtifacts({ result, verdictMd, root }) → { panelPath, verdictPath, panelBytes }
 *   rookieTotalMain({ load, write, asJson, … })   → exit code
 */

import fs from 'fs';
import path from 'path';
import { readJson, repoPath } from '../lib/io.mjs';
import { leagueBasisLoad, basisScaleOf, loadLeaguePositions, SCORING_BASIS_MODELS } from '../lib/leagueBasis.mjs';
import { leagueLoadArgs, LEAGUE_SCORING_FIXTURE } from './panel-run.mjs';
import {
  ROOKIE_TOTAL, composeRookieRow, biasSummary, losoMultiplier, maeDelta, decideRookieTotal,
} from '../lib/rookieTotalPoints.mjs';

export const ROOKIE_TOTAL_PIN = Object.freeze({
  path: 'backtests/2026-10-10-rookie-panel.json',
  commit: '7e900fc5c45ca223cfb8eeb4892f8c53b1195c03',
  rows: 3848,
});

export const ROOKIE_TOTAL_LOAD = {
  loadPanel: () => readJson(ROOKIE_TOTAL_PIN.path),
  loadPlayerIds: () => readJson('nflverse/playerids.json'),
  // D-45 — used only to build a league-wrapped load for the as-of basis scale (the league panel already carries league outcomes).
  loadSeasonTotals: (year) => readJson(`nfl/season-totals/${year}.json`),
  loadLeagueScoring: () => readJson(LEAGUE_SCORING_FIXTURE),
  loadLeaguePositionOf: () => loadLeaguePositions(),
  // D-45 — the league `--rookie` panel a league run reads (an absolute or cwd-relative path; never a repo-relative readJson).
  loadLeaguePanel: (panelPath) => JSON.parse(fs.readFileSync(path.resolve(panelPath), 'utf8')),
};

const r3 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 1e3) / 1e3);
const r4 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 1e4) / 1e4);
const roundSummary = (s) => ({
  n: s.n, players: s.players, meanPred: r3(s.meanPred), meanReal: r3(s.meanReal), ratio: r3(s.ratio),
  ci95: s.ci95 ? s.ci95.map(r3) : null, gamesHeldRatio: r3(s.gamesHeldRatio),
  ppgRealOverPred: { gp6: r3(s.ppgRealOverPred.gp6), gp1to5: r3(s.ppgRealOverPred.gp1to5) },
});
const roundDelta = (d) => ({
  maeShipped: r3(d.maeShipped), maeCorrected: r3(d.maeCorrected), mean: r3(d.mean), ci95: d.ci95 ? d.ci95.map(r3) : null, label: d.label,
});

/**
 * `basis` half_ppr (default) reads the committed pin panel (rows pinned) and is byte-identical to every committed run.
 * `basis` league (D-45) reads `panelPath` — a league `--rookie` result — whose realised totals are league points, and
 * composes each row at `basisScaleOf(wrappedLoad, targetSeason, pos)` (the interim: half constants × the as-of scale);
 * `rookieConstants` ({ rookieConstantsModel, leagueConstants }) swaps in the league-refit constants for the families present.
 */
export function runRookieTotal({ load = ROOKIE_TOTAL_LOAD, pin = ROOKIE_TOTAL_PIN, basis = 'half_ppr', panelPath = null, rookieConstants = null } = {}) {
  if (!SCORING_BASIS_MODELS.includes(basis)) throw new Error(`[rookie-total] unknown basis '${basis}' — use ${SCORING_BASIS_MODELS.join('|')}`);
  if (basis === 'league' && !panelPath) throw new Error('[rookie-total] --basis league needs --rookie-panel <path> (the league --rookie panel)');
  if (basis !== 'league' && panelPath) throw new Error('[rookie-total] --rookie-panel applies only with --basis league');
  if (basis !== 'league' && rookieConstants) throw new Error('[rookie-total] rookieConstants apply only with --basis league');
  const panel = basis === 'league' ? load.loadLeaguePanel(panelPath) : load.loadPanel();
  const panelRows = panel.rookiePathAll.rows;
  if (basis === 'half_ppr' && panelRows.length !== pin.rows) throw new Error(`[rookie-total] ${pin.path}: ${panelRows.length} rows, pin says ${pin.rows}`);
  if (basis === 'league' && panel.meta?.basis !== 'league') throw new Error(`[rookie-total] ${panelPath}: panel meta.basis is '${panel.meta?.basis}', not 'league'`);
  const bySleeper = load.loadPlayerIds()?.bySleeper ?? {};
  const leagueLoad = basis === 'league' ? leagueBasisLoad(load, leagueLoadArgs(load)) : null;

  const rows = panelRows.map((r) => {
    const b = bySleeper[r.sleeperId];
    const birthYear = typeof b?.birthdate === 'string' ? parseInt(b.birthdate.slice(0, 4), 10) : null;
    if (!Number.isFinite(birthYear)) throw new Error(`[rookie-total] sleeperId ${r.sleeperId} has no birthdate in nflverse/playerids.json`);
    const opts = basis === 'league'
      ? { basisScale: basisScaleOf(leagueLoad, r.targetSeason, r.position), ...(rookieConstants ?? {}) }
      : undefined;
    return { ...r, ...composeRookieRow(r, r.draftYear - birthYear, opts) };
  });
  const parityFails = rows.filter(r => !r.parity).length;
  if (parityFails) throw new Error(`[rookie-total] parity: ${parityFails} of ${rows.length} rows — the uncorrected reconstruction does not reproduce the panel's projectedPPG`);

  const nonQB = rows.filter(r => r.position !== 'QB');
  const decisionRows = (g) => rows.filter(r => r.draftGroup === g && ROOKIE_TOTAL.decisionPositions.includes(r.position));

  const byGroup = {}, byGroupNonQB = {}, byGroupPosition = {}, byExperience = {};
  for (const g of ROOKIE_TOTAL.groups) {
    byGroup[g] = roundSummary(biasSummary(rows.filter(r => r.draftGroup === g)));
    byGroupNonQB[g] = roundSummary(biasSummary(nonQB.filter(r => r.draftGroup === g)));
    for (const pos of ['QB', 'RB', 'WR', 'TE']) {
      const rs = rows.filter(r => r.draftGroup === g && r.position === pos);
      if (rs.length) byGroupPosition[`${g}|${pos}`] = roundSummary(biasSummary(rs));
    }
  }
  for (const e of ['0', '1', '2+']) byExperience[e] = roundSummary(biasSummary(rows.filter(r => r.experienceBucket === e)));
  const t25 = rows.filter(r => r.targetSeason === 2025);
  const bias = {
    all: roundSummary(biasSummary(rows)), byGroup, byGroupNonQB, byGroupPosition, byExperience,
    qb: roundSummary(biasSummary(rows.filter(r => r.position === 'QB'))),
    target2025: {
      label: 'in-sample (the games ladder and the PPG calibration were fitted on overlapping rows, target seasons <= 2025)',
      all: roundSummary(biasSummary(t25)),
      byGroupNonQB: Object.fromEntries(ROOKIE_TOTAL.groups.map(g => [g, roundSummary(biasSummary(t25.filter(r => r.position !== 'QB' && r.draftGroup === g)))])),
    },
  };

  // LOSO over all rows (all positions), keyed by group — the §7.1 table.
  const lAll = losoMultiplier(rows, r => r.draftGroup);
  const byGroupAll = {};
  for (const g of ROOKIE_TOTAL.groups) {
    const idx = rows.map((r, i) => (r.draftGroup === g ? i : -1)).filter(i => i >= 0);
    byGroupAll[g] = { ...roundDelta(maeDelta(idx.map(i => rows[i]), idx.map(i => rows[i].predTotal), idx.map(i => lAll.preds[i]))), fullSample: r3(lAll.fullSample[g]) };
  }
  // LOSO on the decision rows, per decision group (§7.2).
  const losoDecision = {}, decisionInput = {};
  for (const g of ROOKIE_TOTAL.decisionGroups) {
    const rs = decisionRows(g);
    const l = losoMultiplier(rs, () => g);
    const d = maeDelta(rs, rs.map(r => r.predTotal), l.preds);
    losoDecision[g] = { ...roundDelta(d), rows: rs.length, fullSample: r3(l.fullSample[g]), folds: l.folds.map(f => ({ S: f.S, m: r3(f.m[g]) })) };
    decisionInput[g] = { bias: biasSummary(rs), loso: d };
  }
  const decision = { rule: '§7.2', population: `non-QB (${ROOKIE_TOTAL.decisionPositions.join('/')}) rows of ${ROOKIE_TOTAL.decisionGroups.join(' and ')}`, ...decideRookieTotal(decisionInput) };

  const lNonQB = losoMultiplier(nonQB, r => r.draftGroup);
  const candidateMultipliers = {
    note: 'not pinned anywhere',
    byGroup: Object.fromEntries(ROOKIE_TOTAL.groups.map(g => [g, r3(lNonQB.fullSample[g])])),
  };

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      panel: basis === 'league' ? `${panelPath} (league --rookie panel)` : `${pin.path} @ ${pin.commit}`,
      rows: rows.length, basis,
    },
    bias, loso: { byGroupAll, decision: losoDecision }, decision, candidateMultipliers,
  };
}

// ─── Verdict markdown ─────────────────────────────────────────────────────────

const f = (v, d = 3) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(d));
const ci = (c) => (c ? `[${f(c[0])}, ${f(c[1])}]` : '—');

function biasTable(entries) {
  const L = ['| slice | rows | players | mean pred | mean real | Σpred / Σreal | 95% CI (player-clustered) | Σ(predPPG × real games) / Σreal |', '|---|---|---|---|---|---|---|---|'];
  for (const [name, s] of entries) L.push(`| ${name.replace('|', '\\|')} | ${s.n} | ${s.players} | ${f(s.meanPred, 2)} | ${f(s.meanReal, 2)} | ${f(s.ratio)} | ${ci(s.ci95)} | ${f(s.gamesHeldRatio)} |`);
  return L;
}

export function buildRookieTotalVerdictMarkdown(result) {
  const { meta, bias, loso, decision, candidateMultipliers } = result;
  const L = [];
  L.push('# D-13 — composed rookie total points (shipped PPG × availability games) vs realised', '');
  L.push(`Generated ${meta.generatedAt}. Offline analysis only: no score, constant or served file moves. Basis ${meta.basis}.`, '');

  L.push('## §A Population and parity', '');
  L.push(`Panel \`${meta.panel}\` — \`rookiePathAll.rows\`, ${meta.rows} rows (W2's committed availability panel, the population the app's games ladder reproduces). Prediction: \`reconstructShippedRookieProjection(...).projectedTotalPts\` (calibrated, ceiled PPG × the ladder's games, rounded as the app rounds). Outcome: \`outcomeTotalPts\`; absent rows count as zero. Parity: the uncorrected reconstruction reproduces the row's own \`projectedPPG\` on ${meta.rows} of ${meta.rows} rows (the run stops otherwise).`, '');

  L.push('## §B Bias — Σpred / Σreal', '');
  L.push(...biasTable([['all rows', bias.all]]), '');
  L.push('**By draft group (all positions)**', '', ...biasTable(Object.entries(bias.byGroup)), '');
  L.push('**By draft group, non-QB**', '', ...biasTable(Object.entries(bias.byGroupNonQB)), '');
  L.push('**QB, all groups**', '', ...biasTable([['QB', bias.qb]]), '');
  L.push('**By draft group × position**', '', ...biasTable(Object.entries(bias.byGroupPosition)), '');
  L.push('**By experience**', '', ...biasTable(Object.entries(bias.byExperience)), '');
  L.push(`**Target season 2025 — ${bias.target2025.label}**`, '', ...biasTable([['2025, all', bias.target2025.all], ...Object.entries(bias.target2025.byGroupNonQB).map(([g, s]) => [`2025, ${g} non-QB`, s])]), '');

  L.push('## §C Decomposition — where the bias comes from', '');
  L.push('`Σ(predPPG × real games) / Σreal` holds the games side at its realised value: a ratio near the total ratio says the per-game level carries the bias; a ratio near 1 says the games carry it. Realised PPG over predicted PPG, split by how many games the rookie went on to play:', '');
  L.push('| slice | real PPG / predicted PPG, ≥ 6 games | real PPG / predicted PPG, 1–5 games |', '|---|---|---|');
  for (const [name, s] of [['all rows', bias.all], ...Object.entries(bias.byGroupNonQB).map(([g, s]) => [`${g}, non-QB`, s]), ['QB', bias.qb]]) {
    L.push(`| ${name} | ${f(s.ppgRealOverPred.gp6)} | ${f(s.ppgRealOverPred.gp1to5)} |`);
  }
  L.push('');

  L.push('## §D Leave-one-target-season-out (LOSO)', '');
  L.push('A per-group multiplier (Σreal / Σpred over the other seasons) is fitted for each held-out target season and applied to it. Δ = MAE(corrected) − MAE(shipped) on realised total points, player-clustered; BEATS means the correction lowers MAE with the CI below 0.', '');
  L.push('**All positions, keyed by draft group**', '', '| group | full-sample multiplier | MAE shipped | MAE corrected | Δ | label |', '|---|---|---|---|---|---|');
  for (const [g, d] of Object.entries(loso.byGroupAll)) L.push(`| ${g} | ${f(d.fullSample)} | ${f(d.maeShipped, 2)} | ${f(d.maeCorrected, 2)} | ${f(d.mean, 2)} ${ci(d.ci95)} | ${d.label ?? '—'} |`);
  L.push('', '**Decision rows (non-QB RB/WR/TE of the two calibrated groups), the multiplier fitted on those rows**', '', '| group | rows | full-sample multiplier | MAE shipped | MAE corrected | Δ | label |', '|---|---|---|---|---|---|---|');
  for (const [g, d] of Object.entries(loso.decision)) L.push(`| ${g} | ${d.rows} | ${f(d.fullSample)} | ${f(d.maeShipped, 2)} | ${f(d.maeCorrected, 2)} | ${f(d.mean, 2)} ${ci(d.ci95)} | ${d.label ?? '—'} |`);
  L.push('', `Candidate multipliers (full sample, non-QB rows, per group; ${candidateMultipliers.note}): ${Object.entries(candidateMultipliers.byGroup).map(([g, m]) => `${g} ${f(m)}`).join(', ')}.`, '');

  L.push('## §E Decision', '');
  L.push('Rule (pre-registered; not tuned in this run):', '');
  L.push('- **Decision population:** non-QB rows of the two calibrated groups, `day3` and `undrafted`.');
  L.push('  - r1 and day2 are reported only. They carry no PPG calibration (`ROOKIE_CALIBRATION`\'s own scope), because the neutral reconstruction understates them.');
  L.push('  - QB is reported only. A live backup rookie QB\'s total is the chain\'s, which this reconstruction does not compose (CR-15 Mirror).');
  L.push('- **A group is `correct`** when all three hold:');
  L.push('  - ρ = Σpred / Σreal ≥ 1.05 with CI lower bound > 1, or ρ ≤ 0.95 with CI upper bound < 1;');
  L.push('  - **and** its LOSO multiplier (fitted on that group\'s decision rows, folds by `targetSeason`) gives a ΔMAE labelled `BEATS`.');
  L.push('- **Verdict:** `recommend` when either group is `correct`, else `close`.');
  L.push('- **Primary metric:** bias. MAE rewards shrinking toward the median on a zero-heavy outcome, so it only confirms that the correction does not hurt out of sample.', '');
  L.push('| group | ρ | CI | LOSO Δ | label | result |', '|---|---|---|---|---|---|');
  for (const g of ROOKIE_TOTAL.decisionGroups) {
    const d = loso.decision[g];
    const b = bias.byGroupNonQB[g];
    L.push(`| ${g} | ${f(b.ratio)} | ${ci(b.ci95)} | ${f(d.mean, 2)} ${ci(d.ci95)} | ${d.label ?? '—'} | ${decision.perGroup[g]} |`);
  }
  L.push('', `**Verdict: \`${decision.verdict}\`** — ${decision.verdict === 'recommend' ? 'a recommendation for Anton, not a change.' : 'no change.'}`, '');

  L.push('## §F Limitations', '');
  L.push('- **KTC and college are neutral.** The live season projection multiplies by `ktcMult` (0.70–1.30) and `collegeContribution`, which history cannot reconstruct; KTC history starts 2026-05-18. The measured bias belongs to the neutral composition, which is the composition the PPG calibration itself was fitted on.');
  L.push('- **QB is not composed.** A `chain` row\'s total is the starter level × share × team games (CR-15).');
  L.push('- **Not out of sample.** The games ladder and the PPG calibration were fitted on overlapping rows, target seasons ≤ 2025. 2025 is shown but is in-sample; 2026 is the first clean season, once it completes (D-16\'s trigger).');
  L.push('- **MAE favours shrinkage** on a zero-heavy outcome. Bias is the primary metric.', '');

  L.push('## §G What a correction would move', '');
  L.push('- It moves `projectedTotalPts` of day-3 and undrafted RB/WR/TE rookie-path rows, by about −20%.');
  L.push('- It does not move `projectedPPG`, `projectedGames`, the dynasty score or the in-season k.');
  L.push('- The consumers that read `projectedTotalPts` are app `App.jsx`, `inSeasonScoring.js`, `PlayerCard.jsx` and `MyTeamView.jsx`.');
  L.push('- It would be an app slice: re-mirror in CR-15, a new rookie anchor-policy boundary, and the slice decides whether it touches `PRIOR_MODEL_FROM`.');
  L.push('- The proper fix stays D-13\'s original two-part model (PPG given a real season × probability of playing). The multiplier is the cheap version.', '');

  L.push(`**Reproduce:** \`node bin/backtest.mjs --rookie-total${meta.basis === 'league' ? ' --basis league --rookie-panel <path>' : ''} --write\``, '');
  return L.join('\n');
}

// ─── Artifacts / CLI ──────────────────────────────────────────────────────────

export function writeRookieTotalArtifacts({ result, verdictMd, root = null }) {
  const date = result.meta.generatedAt.slice(0, 10);
  const tag = result.meta.basis === 'league' ? '-league' : '';
  const panelPath = `backtests/${date}-rookie-total${tag}-panel.json`;
  const verdictPath = `grading/${date}-rookie-total${tag}-verdict.md`;
  const panelJson = JSON.stringify(result, null, 2) + '\n';
  const abs = (rel) => (root ? path.join(root, rel) : repoPath(rel));
  fs.mkdirSync(abs('backtests'), { recursive: true });
  fs.mkdirSync(abs('grading'), { recursive: true });
  fs.writeFileSync(abs(panelPath), panelJson, 'utf8');
  fs.writeFileSync(abs(verdictPath), verdictMd.endsWith('\n') ? verdictMd : verdictMd + '\n', 'utf8');
  return { panelPath, verdictPath, panelBytes: Buffer.byteLength(panelJson) };
}

/** The `--rookie-total` branch body of `bin/backtest.mjs`. */
export function rookieTotalMain({
  load = ROOKIE_TOTAL_LOAD, write = false, asJson = false, writeArtifacts = writeRookieTotalArtifacts,
  log = console.log, logErr = console.error, basis = 'half_ppr', panelPath = null,
} = {}) {
  const result = runRookieTotal({ load, basis, panelPath });
  const verdictMd = buildRookieTotalVerdictMarkdown(result);
  if (write) {
    const w = writeArtifacts({ result, verdictMd });
    logErr(`[backtest] Wrote ${w.panelPath} (${w.panelBytes} B), ${w.verdictPath}`);
  }
  log(asJson ? JSON.stringify(result, null, 2) : verdictMd);
  return 0;
}
