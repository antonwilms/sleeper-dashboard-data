/**
 * lib/rookieTotalPoints.mjs — D-13 (research-arms-w3): the composed rookie total points (the shipped calibrated,
 * ceiled PPG × the availability ladder's games) against realised total points. Pure, no I/O.
 *
 * Sits OUTSIDE `bin/panel.mjs`'s closure: it reaches `lib/rookieMirror.mjs` (T-RM1), so nothing the grader or the
 * fit path imports may import it. Specified in .claude/tasks/research-arms-w3-d13.md §7.
 */

import { reconstructShippedRookieProjection } from './rookieMirror.mjs';
import { reconstructRookieProjection } from './projectionFactors.mjs';
import { clusteredBootstrap, bootstrapPairedMean, compareLabel, IN_SEASON_DEFAULTS } from './inSeasonEvidence.mjs';

export const ROOKIE_TOTAL = Object.freeze({
  decisionGroups: ['day3', 'undrafted'],
  decisionPositions: ['RB', 'WR', 'TE'],
  materiality: 0.05,
  groups: ['r1', 'day2', 'day3', 'undrafted'],
  bootstrap: IN_SEASON_DEFAULTS.bootstrap,
});

const sum = (xs) => xs.reduce((a, v) => a + v, 0);

/**
 * One panel row → the shipped composition. `parity` = the uncorrected reconstruction reproduces the row's own
 * projectedPPG (the panel is the population the shipped composition is defined on). Inputs follow §7.1.
 */
export function composeRookieRow(row, ageAtDraft) {
  const parity = reconstructRookieProjection({
    position: row.position, ageAtDraft, draftRound: row.draftRound, draftPick: row.draftPick,
  }).projectedPPG === row.projectedPPG;
  const shipped = reconstructShippedRookieProjection({
    position: row.position, ageAtDraft, draftRound: row.draftRound, draftPick: row.draftPick,
    draftCapitalStatus: row.draftGroup === 'undrafted' ? 'undrafted' : 'matched', yearsExp: row.experienceYears,
    rookieTotalModel: 'legacy', // the composition the D-13 verdict measured (rookie-total-wiring: the factor is the verdict's output)
  });
  return {
    parity, predTotal: shipped.projectedTotalPts, predPPG: shipped.projectedPPG,
    predGames: shipped.projectedGames, gamesBasis: shipped.rookieGamesBasis,
  };
}

/** rows: { sleeperId, predTotal, predPPG, outcomeTotalPts, outcomeGames }. */
export function biasSummary(rows) {
  const n = rows.length;
  const byPlayer = new Map();
  for (const r of rows) {
    let c = byPlayer.get(r.sleeperId);
    if (!c) { c = { p: 0, a: 0 }; byPlayer.set(r.sleeperId, c); }
    c.p += r.predTotal; c.a += r.outcomeTotalPts;
  }
  const sp = sum(rows.map(r => r.predTotal)), sa = sum(rows.map(r => r.outcomeTotalPts));
  const boot = clusteredBootstrap([...byPlayer.values()], (sample) => {
    let p = 0, a = 0;
    for (const c of sample) { p += c.p; a += c.a; }
    return a > 0 ? p / a : null;
  }, ROOKIE_TOTAL.bootstrap);
  const held = sum(rows.map(r => r.predPPG * r.outcomeGames));
  const ppgRatio = (pick) => {
    const rs = rows.filter(pick);
    const d = sum(rs.map(r => r.predPPG * r.outcomeGames));
    return d > 0 ? sum(rs.map(r => r.outcomeTotalPts)) / d : null;
  };
  return {
    n, players: byPlayer.size,
    meanPred: n ? sp / n : null, meanReal: n ? sa / n : null,
    ratio: sa > 0 ? sp / sa : null, ci95: boot?.ci95 ?? null,
    gamesHeldRatio: sa > 0 ? held / sa : null,
    ppgRealOverPred: { gp6: ppgRatio(r => r.outcomeGames >= 6), gp1to5: ppgRatio(r => r.outcomeGames >= 1 && r.outcomeGames <= 5) },
  };
}

/**
 * Leave-one-target-season-out multiplier. Per season S, m[key] = Σreal / Σpred over the OTHER seasons' rows of that
 * key (1 when Σpred is 0), applied to S's rows. `fullSample` is the same ratio over all rows.
 */
export function losoMultiplier(rows, keyFn) {
  const seasons = [...new Set(rows.map(r => r.targetSeason))].sort((a, b) => a - b);
  const ratio = (rs) => {
    const m = {};
    const keys = new Set(rs.map(keyFn));
    for (const k of keys) {
      const ks = rs.filter(r => keyFn(r) === k);
      const p = sum(ks.map(r => r.predTotal));
      m[k] = p > 0 ? sum(ks.map(r => r.outcomeTotalPts)) / p : 1;
    }
    return m;
  };
  const preds = new Array(rows.length);
  const folds = [];
  for (const S of seasons) {
    const m = ratio(rows.filter(r => r.targetSeason !== S));
    folds.push({ S, m });
    rows.forEach((r, i) => { if (r.targetSeason === S) preds[i] = r.predTotal * (m[keyFn(r)] ?? 1); });
  }
  return { preds, folds, fullSample: ratio(rows) };
}

/** Paired MAE delta (corrected − shipped) on realised total points, player-clustered. */
export function maeDelta(rows, shipped, corrected) {
  const real = rows.map(r => r.outcomeTotalPts);
  const diffs = rows.map((r, i) => Math.abs(corrected[i] - real[i]) - Math.abs(shipped[i] - real[i]));
  const b = bootstrapPairedMean(rows.map(r => r.sleeperId), diffs, ROOKIE_TOTAL.bootstrap);
  const valid = diffs.filter(Number.isFinite);
  const mae = (ps) => (rows.length ? sum(ps.map((p, i) => Math.abs(p - real[i]))) / rows.length : null);
  return {
    maeShipped: mae(shipped), maeCorrected: mae(corrected),
    mean: valid.length ? sum(valid) / valid.length : null, ci95: b?.ci95 ?? null, label: b ? compareLabel(b.ci95) : null,
  };
}

/** §7.2. `decisionByGroup`: { day3: { bias, loso }, undrafted: … } — bias = biasSummary, loso = maeDelta. */
export function decideRookieTotal(decisionByGroup) {
  const perGroup = {};
  for (const g of ROOKIE_TOTAL.decisionGroups) {
    const d = decisionByGroup[g];
    const ratio = d?.bias?.ratio, ci = d?.bias?.ci95;
    const hi = 1 + ROOKIE_TOTAL.materiality, lo = 1 - ROOKIE_TOTAL.materiality;
    const biased = Number.isFinite(ratio) && ci != null && ((ratio >= hi && ci[0] > 1) || (ratio <= lo && ci[1] < 1));
    perGroup[g] = biased && d.loso?.label === 'BEATS' ? 'correct' : 'none';
  }
  return { perGroup, verdict: Object.values(perGroup).some(v => v === 'correct') ? 'recommend' : 'close' };
}
