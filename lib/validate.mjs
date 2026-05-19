/**
 * lib/validate.mjs — Sanity checks for all three data types.
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  YEARLY MAINTENANCE NOTE — update at the start of each season  ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║  NFL_SENTINELS: 2-3 high-usage players per year who can be     ║
 * ║  verified to have played the full (or near-full) season.       ║
 * ║  player_id → Sleeper player ID (string).                       ║
 * ║  minGames  → minimum gamesPlayed expected.                     ║
 * ║                                                                 ║
 * ║  KTC_TOP_QB_SENTINELS: top dynasty QBs at time of writing.    ║
 * ║  At least 3 of these should appear in the top-10 by value.    ║
 * ║  Update when the dynasty QB landscape shifts significantly.    ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

// Key: year (number). Value: array of { playerId, minGames, name }.
const NFL_SENTINELS = {
  2024: [
    { playerId: '6783', minGames: 15, name: 'Lamar Jackson' },
    { playerId: '4866',  minGames: 14, name: 'Tyreek Hill' },
    { playerId: '6794',  minGames: 14, name: 'Justin Jefferson' },
  ],
  2023: [
    { playerId: '6783', minGames: 16, name: 'Lamar Jackson' },  // MVP season, 16 games
    { playerId: '4866',  minGames: 14, name: 'Tyreek Hill' },
    // Jefferson missed 6 games with hamstring in 2023 — sentinel lowered accordingly
    { playerId: '6794',  minGames: 8,  name: 'Justin Jefferson' },
  ],
  // Add entries for each new season before running the NFL update script.
};

// At least 3 of these should appear in the KTC top-10 by dynasty value.
// Updated 2026-05-19: the top-10 is now dominated by skill players and
// young QBs (Drake Maye, Caleb Williams) rather than veteran QBs.
// Josh Allen remains #1; Mahomes/Jackson/Burrow have dropped to 11-20 range.
const KTC_TOP_QB_SENTINELS = [
  'Josh Allen',
  'Drake Maye',
  'Caleb Williams',
  'Jalen Hurts',
  'Jayden Daniels',
  'Patrick Mahomes',
];

// ─── NFL season totals ────────────────────────────────────────────────────────

/**
 * Validates an aggregated NFL season totals object.
 * Throws with a descriptive message if any check fails.
 *
 * @param {object} totals  { [player_id]: { gamesPlayed, fantasyPoints, ... } }
 * @param {object} opts
 * @param {number} opts.year  Season year (used to look up sentinels)
 */
export function validateNflSeason(totals, { year }) {
  const playerCount = Object.keys(totals).length;

  if (playerCount < 400) {
    throw new Error(
      `[validate] NFL ${year}: only ${playerCount} players — expected ≥ 400. ` +
      'Possible partial fetch.'
    );
  }

  const fullSeasonPlayers = Object.values(totals).filter(p => p.gamesPlayed >= 14);
  if (fullSeasonPlayers.length < 30) {
    throw new Error(
      `[validate] NFL ${year}: only ${fullSeasonPlayers.length} players with gamesPlayed ≥ 14 — ` +
      'expected ≥ 30. Possible incomplete data.'
    );
  }

  // Phase 5: every player must have a length-18 weeklyStatus and an availability object,
  // and the per-week counts must agree with the existing aggregate fields.
  for (const [playerId, p] of Object.entries(totals)) {
    if (!Array.isArray(p.weeklyStatus) || p.weeklyStatus.length !== 18) {
      throw new Error(
        `[validate] NFL ${year}: player ${playerId} missing weeklyStatus or wrong length ` +
        `(got ${Array.isArray(p.weeklyStatus) ? p.weeklyStatus.length : typeof p.weeklyStatus}).`
      );
    }
    if (!p.availability || typeof p.availability !== 'object') {
      throw new Error(
        `[validate] NFL ${year}: player ${playerId} missing availability object.`
      );
    }

    const countP = p.weeklyStatus.filter(s => s === 'P').length;
    const countD = p.weeklyStatus.filter(s => s === 'D').length;
    const countB = p.weeklyStatus.filter(s => s === 'B').length;

    if (p.gamesPlayed !== countP) {
      throw new Error(
        `[validate] NFL ${year}: player ${playerId} gamesPlayed=${p.gamesPlayed} ≠ count('P')=${countP}.`
      );
    }
    if (p.byeWeeks !== countB) {
      throw new Error(
        `[validate] NFL ${year}: player ${playerId} byeWeeks=${p.byeWeeks} ≠ count('B')=${countB}.`
      );
    }
    if (p.dnpWeeks !== countD) {
      throw new Error(
        `[validate] NFL ${year}: player ${playerId} dnpWeeks=${p.dnpWeeks} ≠ count('D')=${countD}.`
      );
    }
    if (Object.keys(p.weeklyPoints ?? {}).length !== countP) {
      throw new Error(
        `[validate] NFL ${year}: player ${playerId} weeklyPoints keys=${Object.keys(p.weeklyPoints ?? {}).length} ≠ count('P')=${countP}.`
      );
    }
  }

  // Sentinel checks
  const sentinels = NFL_SENTINELS[year];
  if (sentinels) {
    for (const s of sentinels) {
      const p = totals[s.playerId];
      if (!p) {
        throw new Error(`[validate] NFL ${year}: sentinel player ${s.name} (${s.playerId}) not found.`);
      }
      if (p.gamesPlayed < s.minGames) {
        throw new Error(
          `[validate] NFL ${year}: ${s.name} has gamesPlayed=${p.gamesPlayed}, expected ≥ ${s.minGames}.`
        );
      }
    }
  } else {
    console.warn(`[validate] No NFL sentinels configured for year ${year} — skipping sentinel check.`);
  }
}

// ─── CFBD per-category rows ───────────────────────────────────────────────────

/**
 * Validates a CFBD stat rows array for one category.
 * Throws with a descriptive message if any check fails.
 *
 * @param {Array}  rows      Array of CFBD row objects
 * @param {string} category  'receiving' | 'rushing' | 'passing'
 * @param {number} year
 */
export function validateCfbdCategory(rows, category, year) {
  if (!Array.isArray(rows)) {
    throw new Error(`[validate] CFBD ${category} ${year}: expected array, got ${typeof rows}`);
  }
  if (rows.length < 500) {
    throw new Error(
      `[validate] CFBD ${category} ${year}: ${rows.length} rows — expected ≥ 500.`
    );
  }

  const badRows = rows.filter(r => r.playerId == null || r.statType == null || r.stat == null);
  if (badRows.length > 0) {
    throw new Error(
      `[validate] CFBD ${category} ${year}: ${badRows.length} rows missing required fields (playerId/statType/stat).`
    );
  }

  const distinctPlayers = new Set(rows.map(r => r.playerId)).size;
  if (distinctPlayers < 200) {
    throw new Error(
      `[validate] CFBD ${category} ${year}: only ${distinctPlayers} distinct players — expected ≥ 200.`
    );
  }
}

// ─── KTC snapshot ─────────────────────────────────────────────────────────────

/**
 * Validates a KTC player snapshot array.
 * Throws with a descriptive message if any check fails.
 *
 * @param {Array} players  Array of { name, team, value, position }
 */
export function validateKtc(players) {
  if (!Array.isArray(players)) {
    throw new Error(`[validate] KTC: expected array, got ${typeof players}`);
  }

  if (players.length < 250) {
    throw new Error(`[validate] KTC: only ${players.length} players — expected ≥ 250. Possible scrape failure.`);
  }
  if (players.length > 600) {
    throw new Error(`[validate] KTC: ${players.length} players — expected ≤ 600. Possible duplicate data.`);
  }

  const positions = new Set(players.map(p => p.position));
  for (const pos of ['QB', 'RB', 'WR', 'TE']) {
    const count = players.filter(p => p.position === pos).length;
    if (count < 5) {
      throw new Error(`[validate] KTC: only ${count} ${pos} players — expected ≥ 5.`);
    }
  }

  const badValues = players.filter(p => typeof p.value !== 'number' || p.value < 0 || p.value > 9999);
  if (badValues.length > 0) {
    throw new Error(
      `[validate] KTC: ${badValues.length} players have value outside [0, 9999]: ` +
      badValues.slice(0, 3).map(p => `${p.name}=${p.value}`).join(', ')
    );
  }

  // Top-10 sentinel: at least 3 known dynasty QBs should appear
  const top10 = players
    .slice()
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)
    .map(p => p.name);

  const matches = KTC_TOP_QB_SENTINELS.filter(name => top10.includes(name));
  if (matches.length < 3) {
    throw new Error(
      `[validate] KTC: only ${matches.length} sentinel QBs in top 10 (${top10.join(', ')}). ` +
      'Expected ≥ 3 of: ' + KTC_TOP_QB_SENTINELS.join(', ') + '. ' +
      'Update KTC_TOP_QB_SENTINELS in lib/validate.mjs if the dynasty QB landscape has shifted.'
    );
  }
}
