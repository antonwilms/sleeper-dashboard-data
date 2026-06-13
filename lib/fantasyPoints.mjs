/**
 * lib/fantasyPoints.mjs — port of the app's scoring dot-product.
 * MUST mirror sleeper-dashboard/src/utils/fantasyPoints.js calculateFantasyPoints
 * (Cross-repo contract). Iterates scoringSettings keys, so non-additive rate
 * stats in `stats` are never read unless the league scores them.
 */

/** Faithful mirror — do not add rate-stripping here (keep it identical to the app). */
export function calculateFantasyPoints(stats, scoringSettings) {
  let total = 0;
  for (const [key, multiplier] of Object.entries(scoringSettings)) {
    if (multiplier == null) continue;
    const statValue = stats?.[key];
    if (statValue == null) continue;
    total += statValue * multiplier;
  }
  return Math.round(total * 100) / 100;
}

/** Non-additive stat keys that must never enter a dot-product (defensive guard). */
export const RATE_KEYS = new Set([
  'cmp_pct', 'def_kr_ypa', 'def_pr_ypa', 'down_3_pct', 'down_4_pct', 'fgm_pct',
  'g2g_pct', 'kr_ypa', 'pass_rtg', 'pass_ypa', 'pass_ypc', 'pos_rank_half_ppr',
  'pos_rank_ppr', 'pos_rank_std', 'pr_ypa', 'rec_ypr', 'rush_ypa', 'rz_pct',
]);
