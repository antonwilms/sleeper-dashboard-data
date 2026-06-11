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

// ─── finiteness ───────────────────────────────────────────────────────────────

/**
 * Recursively finds the first non-finite numeric in a value tree.
 * Only typeof === 'number' values are checked; strings/booleans/null and object
 * keys are ignored. Returns { path, value } for the first number that fails
 * Number.isFinite, or null if all numerics are finite.
 *
 * @param {*} value
 * @param {string} path  dotted/bracketed path accumulator for error messages
 * @returns {{ path: string, value: number } | null}
 */
export function findNonFinite(value, path = '') {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? null : { path: path || '(root)', value };
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findNonFinite(value[i], `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) {
      const hit = findNonFinite(value[k], path ? `${path}.${k}` : k);
      if (hit) return hit;
    }
    return null;
  }
  return null;
}

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
    const nf = findNonFinite(p);
    if (nf) {
      throw new Error(
        `[validate] NFL ${year}: player ${playerId} has non-finite numeric at ` +
        `${nf.path} (=${String(nf.value)}). Aggregation produced a corrupt value — ` +
        `refusing to publish.`
      );
    }

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

// ─── nflverse roster ─────────────────────────────────────────────────────────

import { MIN_ROSTER_IDS } from './nflverse.mjs';

/**
 * Validates a parsed nflverse roster players object.
 * Called after the sparsity gate in scripts/update-roster.mjs; this is
 * defence-in-depth (throws on clearly bad data that somehow passed the gate).
 *
 * @param {object} players  { [sleeper_id]: { team, position, status, fullName } }
 * @param {object} opts
 * @param {number} opts.year
 */
export function validateRoster(players, { year }) {
  const count = Object.keys(players).length;

  if (count < MIN_ROSTER_IDS) {
    throw new Error(
      `[validate] roster ${year}: only ${count} id-bearing players — ` +
      `expected ≥ ${MIN_ROSTER_IDS}. Possible sparse/preliminary file.`
    );
  }

  // Format-drift guard: if >50% of players lack a status field, the CSV
  // column mapping has changed (upstream format change).
  let missingStatus = 0;
  for (const p of Object.values(players)) {
    if (!p.status) missingStatus++;
  }
  if (missingStatus > count * 0.5) {
    throw new Error(
      `[validate] roster ${year}: ${missingStatus}/${count} players missing status — ` +
      `possible upstream CSV format change.`
    );
  }
}

// ─── nflverse draft ───────────────────────────────────────────────────────────

/**
 * Validates a parsed nflverse draft picksByYear object.
 * Throws if empty or if any pick is missing required numeric fields.
 *
 * @param {object} picksByYear  { [year]: DraftPick[] }
 */
export function validateDraft(picksByYear) {
  const years = Object.keys(picksByYear);
  if (years.length === 0) {
    throw new Error('[validate] draft: picksByYear is empty — possible empty parse.');
  }

  const count = Object.values(picksByYear).reduce((s, arr) => s + arr.length, 0);
  if (count === 0) {
    throw new Error('[validate] draft: zero picks total.');
  }

  // Required fields check: every pick must have numeric round and pick
  for (const [year, picks] of Object.entries(picksByYear)) {
    for (const p of picks) {
      if (typeof p.round !== 'number' || typeof p.pick !== 'number') {
        throw new Error(
          `[validate] draft ${year}: pick missing required numeric round/pick fields.`
        );
      }
    }
  }
}

// ─── Enrichment shape ─────────────────────────────────────────────────────────

/**
 * Validates the top-level shape of an enrichment payload.
 * Used by the app at read time — only checks the wrapper, not individual entries.
 * Throws with a descriptive message if shape fails.
 *
 * For full per-entry validation see lib/enrichment.mjs validateAll() (CLI / CI only).
 *
 * @param {unknown} payload  Parsed JSON from enrichment/<type>.json
 * @param {string}  type     'coaching'|'scheme'|'injuries'|'notes' (for error messages)
 */
export function validateEnrichmentShape(payload, type) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`[validate] enrichment/${type}: expected object, got ${typeof payload}`);
  }
  if (!Number.isInteger(payload.schemaVersion)) {
    throw new Error(`[validate] enrichment/${type}: missing or invalid schemaVersion`);
  }
  if (!Array.isArray(payload.entries)) {
    throw new Error(`[validate] enrichment/${type}: entries must be an array`);
  }
}
