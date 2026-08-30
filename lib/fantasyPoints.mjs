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

/**
 * Non-additive stat keys that must never enter a dot-product (defensive guard).
 * Explicit list, not a suffix match — greppable, diffable, and cannot silently
 * swallow a future key that merely happens to end `_lng` but is additive.
 * The `_lng` family (rate-keys-lng.md, C4) is complete as of these 11: any
 * served `*_lng` key belongs here by construction — a longest-play stat is a
 * per-play maximum, never additive across a season, exactly like the ratio/
 * rank keys above it.
 */
export const RATE_KEYS = new Set([
  'cmp_pct', 'def_kr_lng', 'def_kr_ypa', 'def_pr_lng', 'def_pr_ypa', 'down_3_pct',
  'down_4_pct', 'fgm_lng', 'fgm_pct', 'g2g_pct', 'kr_lng', 'kr_ypa', 'pass_lng',
  'pass_rtg', 'pass_td_lng', 'pass_ypa', 'pass_ypc', 'pos_rank_half_ppr',
  'pos_rank_ppr', 'pos_rank_std', 'pr_lng', 'pr_ypa', 'rec_lng', 'rec_td_lng',
  'rec_ypr', 'rush_lng', 'rush_td_lng', 'rush_ypa', 'rz_pct',
]);
