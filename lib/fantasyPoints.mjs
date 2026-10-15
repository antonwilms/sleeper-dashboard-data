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

// ─── Season-scoring ports (weekly-scoring-keys D-47 / D-45 prerequisite; CR-14) ───────────────
// Verbatim ports of the app's season scoring, src/utils/fantasyPoints.js @ 0f13091. A change to
// scoreSeasonStats/withFirstDownBonus app-side re-ports these.

/**
 * Port of NON_ADDITIVE_KEYS (src/utils/fantasyPoints.js:26 @ 0f13091). An alias of RATE_KEYS — the
 * CR-14 Mirror requires the two lists to be identical.
 */
export const NON_ADDITIVE_KEYS = RATE_KEYS;

const FIRST_DOWN_BONUS_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

/**
 * Port of seasonEmitsFirstDownBonus (src/utils/fantasyPoints.js:37 @ 0f13091). True iff any row's
 * stats carries a key starting 'bonus_fd_' (Sleeper emits it 2022+; detected per season).
 */
export function seasonEmitsFirstDownBonus(rows) {
  if (rows == null || typeof rows !== 'object') return false;
  for (const row of Object.values(rows)) {
    const stats = row?.stats;
    if (stats == null || typeof stats !== 'object') continue;
    for (const key of Object.keys(stats)) {
      if (key.startsWith('bonus_fd_')) return true;
    }
  }
  return false;
}

/**
 * Port of withFirstDownBonus (src/utils/fantasyPoints.js:52 @ 0f13091). bonus_fd_<pos> =
 * pass_fd + rec_fd + rush_fd for QB/RB/WR/TE; returns a NEW object, or `stats` itself when nothing
 * applies. Never mutates.
 */
export function withFirstDownBonus(stats, position) {
  if (stats == null || typeof position !== 'string') return stats;
  const pos = position.toUpperCase();
  if (!FIRST_DOWN_BONUS_POSITIONS.has(pos)) return stats;
  for (const key of Object.keys(stats)) {
    if (key.startsWith('bonus_fd_')) return stats;
  }
  return {
    ...stats,
    [`bonus_fd_${pos.toLowerCase()}`]: (stats.pass_fd ?? 0) + (stats.rec_fd ?? 0) + (stats.rush_fd ?? 0),
  };
}

/**
 * Port of scoreSeasonStats (src/utils/fantasyPoints.js:68 @ 0f13091). NON_ADDITIVE_KEYS are removed
 * from the settings; first-downs derived when `deriveFirstDowns`. Never mutates its inputs.
 */
export function scoreSeasonStats(stats, scoringSettings, { position = null, deriveFirstDowns = false } = {}) {
  const filtered = {};
  for (const [key, multiplier] of Object.entries(scoringSettings ?? {})) {
    if (!NON_ADDITIVE_KEYS.has(key)) filtered[key] = multiplier;
  }
  const scored = deriveFirstDowns ? withFirstDownBonus(stats, position) : stats;
  return calculateFantasyPoints(scored ?? {}, filtered);
}
