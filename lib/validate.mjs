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

// Schedule team-abbr domain that a normalized season-totals `team` must fall in.
// = the current 32 + historical relocated abbrs present in the 2012–2025 backfill
// range (SD ≤2016, STL ≤2015, OAK ≤2019). Derived from nflverse/schedule/<year>.json.
// Update at relocation/expansion (see Yearly maintenance, Invariant 7).
const SCHEDULE_TEAMS = new Set([
  'ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND',
  'JAX','KC','LA','LAC','LV','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SEA','SF',
  'TB','TEN','WAS', /* historical: */ 'SD','STL','OAK',
]);

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

  // Self-calibrating floor (in-season-season-totals.md §2.1): a fixed `gamesPlayed >= 14` floor
  // is arithmetically unsatisfiable before week 14, so a weekly in-season job would throw on
  // every run for ~15 of 18 weeks. Derive the threshold from the season's OWN observed maximum
  // instead. Mid-season maxGames = 5 → threshold = 2 — still catches a genuinely broken scrape,
  // which yields a few scattered players, not thirty clustered near the current leader.
  //
  // NOT numerically identical to the old fixed 14 — the plan claimed it was and that was wrong.
  // Measured: 2025/2024 maxGames = 18 → threshold 15; 2016 (16-game era) → 13. maxGames exceeds
  // the 17 a single-team player can reach because a TRADED player catches two different byes
  // (exactly 2 such players in 2025). The guard is unaffected in practice — 1042 players clear
  // the 2025 threshold against a floor of 30 — but the threshold does ride on a 2-player outlier,
  // so do not treat it as a precise "full season" definition; it is a scrape-integrity check.
  const maxGames = Object.values(totals).reduce((m, p) => Math.max(m, p.gamesPlayed ?? 0), 0);
  const fullSeasonThreshold = Math.max(1, maxGames - 3);
  const fullSeasonPlayers = Object.values(totals).filter(p => p.gamesPlayed >= fullSeasonThreshold);
  if (fullSeasonPlayers.length < 30) {
    throw new Error(
      `[validate] NFL ${year}: only ${fullSeasonPlayers.length} players with gamesPlayed ≥ ${fullSeasonThreshold} ` +
      `(maxGames=${maxGames}) — expected ≥ 30. Possible incomplete data.`
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

    if (p.team !== null && p.team !== undefined && !SCHEDULE_TEAMS.has(p.team)) {
      throw new Error(
        `[validate] NFL ${year}: player ${playerId} has team "${p.team}" outside the schedule abbreviation domain — ` +
        `update SCHEDULE_TEAMS or SCHEDULE_TEAM_ALIAS.`
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

// ─── CFBD per-category (pivoted envelope) ─────────────────────────────────────

// Confirmed, stable statType sets per category (college-pivot-phase-b.md §1.1) — dense in
// every file: every player carries the full set for its category, so this is a set-equality
// check, not a subset check (a subset check would pass on a file that silently lost a stat —
// CR-05's whole invariant is that the stored set is exactly what the app's pivot expects).
const CFBD_STAT_TYPES = {
  passing:   ['ATT', 'COMPLETIONS', 'INT', 'PCT', 'TD', 'YDS', 'YPA'],
  receiving: ['LONG', 'REC', 'TD', 'YDS', 'YPR'],
  rushing:   ['CAR', 'LONG', 'TD', 'YDS', 'YPC'],
};

const CFBD_META_FIELDS = new Set(['playerId', 'player', 'team', 'position', 'conference']);

// Per-category distinct-player floors, roughly half the observed minimum across all 27 files
// (college-pivot-phase-b.md §2.3) — replaces the old single `distinctPlayers < 200` floor,
// which the categories' real spread (467–4,251, a 4–9x range) makes too loose for receiving/
// rushing to actually catch a truncated fetch. Passing's floor keeps that check's original
// intent; the other two get a floor that would.
const CFBD_PLAYER_FLOORS = {
  passing:   230,
  rushing:   700,
  receiving: 950,
};

/**
 * Validates a pivoted CFBD player envelope for one category (college-pivot-phase-b.md §1.3/§2.3).
 * Throws with a descriptive message if any check fails.
 *
 * @param {object} pivoted   { schemaVersion, season, category, generatedAt, rowCount,
 *                             playerCount, players } — players keyed by playerId
 * @param {string} category  'receiving' | 'rushing' | 'passing'
 * @param {number} year
 */
export function validateCfbdCategory(pivoted, category, year) {
  if (!pivoted || typeof pivoted !== 'object' || Array.isArray(pivoted)) {
    throw new Error(
      `[validate] CFBD ${category} ${year}: expected a pivoted envelope object, got ${Array.isArray(pivoted) ? 'array' : typeof pivoted}`
    );
  }

  if (typeof pivoted.players !== 'object' || pivoted.players === null || Object.keys(pivoted.players).length === 0) {
    throw new Error(`[validate] CFBD ${category} ${year}: players must be a non-empty object.`);
  }

  const players = pivoted.players;
  const playerCount = Object.keys(players).length;
  if (typeof pivoted.playerCount !== 'number' || pivoted.playerCount !== playerCount) {
    throw new Error(
      `[validate] CFBD ${category} ${year}: playerCount (${pivoted.playerCount}) does not match the players map size (${playerCount}).`
    );
  }

  const floor = CFBD_PLAYER_FLOORS[category];
  if (floor == null) {
    throw new Error(`[validate] CFBD ${category} ${year}: unknown category "${category}".`);
  }
  if (playerCount < floor) {
    throw new Error(
      `[validate] CFBD ${category} ${year}: only ${playerCount} distinct players — expected ≥ ${floor}.`
    );
  }

  const expectedStatTypes = CFBD_STAT_TYPES[category];
  for (const [playerId, rec] of Object.entries(players)) {
    const statTypes = Object.keys(rec).filter(k => !CFBD_META_FIELDS.has(k)).sort();
    const expectedSorted = [...expectedStatTypes].sort();
    const setMatches = statTypes.length === expectedSorted.length
      && statTypes.every((k, i) => k === expectedSorted[i]);
    if (!setMatches) {
      throw new Error(
        `[validate] CFBD ${category} ${year}: player ${playerId} has statType set [${statTypes.join(',')}] — expected exactly [${expectedSorted.join(',')}].`
      );
    }
    for (const statType of expectedStatTypes) {
      const v = rec[statType];
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new Error(
          `[validate] CFBD ${category} ${year}: player ${playerId} stat ${statType} is not a finite number (${v}).`
        );
      }
    }
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

  const badNames = players.filter(p => typeof p.name !== 'string' || p.name.trim() === '');
  if (badNames.length > 0) {
    throw new Error(`[validate] KTC: ${badNames.length} players have an empty/non-string name — possible name-selector break.`);
  }

  const badValues = players.filter(p => !Number.isInteger(p.value) || p.value < 0 || p.value > 9999);
  if (badValues.length > 0) {
    throw new Error(
      `[validate] KTC: ${badValues.length} players have value outside [0, 9999]: ` +
      badValues.slice(0, 3).map(p => `${p.name}=${p.value}`).join(', ')
    );
  }

  // Draft-pick rows (e.g. "2026 Early 1st") price picks in Portfolio's headline
  // roster value. Row count is upstream-controlled (KTC may add a draft class),
  // so this is a floor, never an equality — an exact-count check would fail on
  // good data the year KTC publishes a fourth class.
  const PICK_ROW_RE = /^(20\d\d) (Early|Mid|Late) (1st|2nd|3rd|4th)$/;
  const pickRounds = { '1st': 0, '2nd': 0, '3rd': 0, '4th': 0 };
  for (const p of players) {
    const m = typeof p.name === 'string' ? p.name.match(PICK_ROW_RE) : null;
    if (m) pickRounds[m[3]]++;
  }
  const pickRowCount = Object.values(pickRounds).reduce((a, b) => a + b, 0);
  for (const round of ['1st', '2nd', '3rd', '4th']) {
    if (pickRounds[round] < 1) {
      throw new Error(
        `[validate] KTC: 0 draft-pick rows for round ${round} (${pickRowCount} pick rows total). Possible scrape failure.`
      );
    }
  }
  if (pickRowCount < 24) {
    throw new Error(`[validate] KTC: only ${pickRowCount} draft-pick rows — expected ≥ 24. Possible scrape failure.`);
  }

  const KNOWN_POS = new Set(['QB', 'RB', 'WR', 'TE', 'K', null]);
  const badPos = players.filter(p => !KNOWN_POS.has(p.position));
  if (badPos.length > players.length * 0.5) {
    throw new Error(`[validate] KTC: ${badPos.length}/${players.length} players have an unrecognized position — possible position-selector break.`);
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

import { MIN_ROSTER_IDS, MIN_PLAYERID_ROWS, MIN_ADVSTATS_ROWS, MIN_SCHEDULE_GAMES,
         MIN_PLAYERGAME_ROWS, MIN_TEAMCONTEXT_ROWS, MIN_OLINE_ROWS,
         AY_PER_TARGET_MIN, AY_PER_TARGET_MAX } from './nflverse.mjs';

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

// ─── nflverse playerids crosswalk ────────────────────────────────────────────

/** bySleeper fill-rate floors — see lib/validate.mjs validatePlayerIds doc. */
const MIN_BIRTHDATE_FILL_RATE = 0.95; // measured 0.998 (2026-09-05)
const MIN_PFR_ID_FILL_RATE    = 0.85; // measured 0.944 (2026-09-05)

// NOTE (Fix pass 1 item 3, NOT applied — see fix-applier hand-back): the spec
// asked for a ceiling here (throw when the undrafted rate exceeds 0.75), but
// that directly conflicts with the pre-existing regression test
// 'validatePlayerIds: a fixture where every draft_round is null still passes
// (finding 2 regression)' (test/nflverse.test.mjs), which asserts a 100%
// undrafted fixture must NOT throw. Reconciling the two needs a call the
// section doesn't make, so this item was left unimplemented rather than
// guessed at.

/**
 * Validates a parsed nflverse playerids crosswalk object.
 * Called after the sparsity gate in scripts/update-playerids.mjs; this is
 * defence-in-depth (throws on clearly bad data that somehow passed the gate).
 *
 * Deliberately NOT gated: `draft_round`/`draft_pick`/`draft_ovr` are null for
 * every undrafted player (42% of bySleeper, verified against draft_picks.json
 * — see parsePlayerIdsCsv doc), so a fill-rate floor on any of them would fire
 * on correct data forever. `ktc_id` is 7% populated upstream (measured
 * 2026-09-05) — real, not a parser fault — so it is served but never gated.
 *
 * @param {object} ids        { [gsis_id]: { sleeperId, name, position } }
 * @param {object} bySleeper  { [sleeper_id]: { gsisId, pfrId, ktcId, cfbrefId,
 *   birthdate, draftYear, draftRound, draftPick, draftOvr, undrafted, espnId,
 *   college, team } } — the two new fill-rate gates are pinned to this
 *   population (6,392 measured rows with a sleeper_id), not to `ids` (6,193,
 *   gsis-keyed only).
 */
export function validatePlayerIds(ids, bySleeper) {
  const count = Object.keys(ids).length;
  if (count < MIN_PLAYERID_ROWS) {
    throw new Error(
      `[validate] playerids: only ${count} crosswalk rows — ` +
      `expected ≥ ${MIN_PLAYERID_ROWS}. Possible truncated/partial source.`
    );
  }
  // Every emitted entry must carry a sleeperId (parser guarantees it; this catches parser regressions).
  let missingSleeper = 0, missingName = 0;
  for (const v of Object.values(ids)) {
    if (!v.sleeperId) missingSleeper++;
    if (!v.name)      missingName++;
  }
  if (missingSleeper > 0) {
    throw new Error(`[validate] playerids: ${missingSleeper}/${count} rows missing sleeperId — parser regression.`);
  }
  // Format-drift guard (mirrors roster's >50% missing-status guard).
  if (missingName > count * 0.5) {
    throw new Error(
      `[validate] playerids: ${missingName}/${count} rows missing name — possible upstream CSV format change.`
    );
  }

  const sleeperCount = Object.keys(bySleeper).length;
  let withBirthdate = 0, withPfrId = 0;
  for (const v of Object.values(bySleeper)) {
    if (v.birthdate) withBirthdate++;
    if (v.pfrId)     withPfrId++;
  }
  const birthdateRate = sleeperCount ? withBirthdate / sleeperCount : 0;
  const pfrIdRate     = sleeperCount ? withPfrId / sleeperCount : 0;

  if (birthdateRate < MIN_BIRTHDATE_FILL_RATE) {
    throw new Error(
      `[validate] playerids: birthdate fill rate ${birthdateRate.toFixed(3)} below floor ` +
      `${MIN_BIRTHDATE_FILL_RATE} (${withBirthdate}/${sleeperCount}) — possible upstream CSV format change.`
    );
  }
  if (pfrIdRate < MIN_PFR_ID_FILL_RATE) {
    throw new Error(
      `[validate] playerids: pfr_id fill rate ${pfrIdRate.toFixed(3)} below floor ` +
      `${MIN_PFR_ID_FILL_RATE} (${withPfrId}/${sleeperCount}) — possible upstream CSV format change.`
    );
  }
}

// ─── nflverse advanced receiving stats ───────────────────────────────────────

/**
 * Validates a re-keyed advstats players object.
 * Called after the sparsity gate in scripts/update-advstats.mjs; this is
 * defence-in-depth (throws on clearly bad data that somehow passed the gate).
 *
 * @param {object} players  { [sleeper_id]: { targetShare, airYardsShare, wopr, racr, ... } }
 * @param {object} opts
 * @param {number} opts.year
 */
export function validateAdvStats(players, { year }) {
  const count = Object.keys(players).length;
  if (count < MIN_ADVSTATS_ROWS) {
    throw new Error(`[validate] advstats ${year}: only ${count} players — expected ≥ ${MIN_ADVSTATS_ROWS}. Possible truncated fetch.`);
  }
  // Format-drift guard: if >50% have all-null ratios, components/columns likely drifted.
  let allNull = 0;
  let sumAirYards = 0;
  let sumTargets = 0;
  for (const p of Object.values(players)) {
    if (p.targetShare == null && p.airYardsShare == null && p.wopr == null && p.racr == null) allNull++;
    if (p.targetShare != null && (p.targetShare < 0 || p.targetShare > 1)) {
      throw new Error(`[validate] advstats ${year}: targetShare out of [0,1] for ${p.gsisId} (=${p.targetShare}).`);
    }
    if (p.airYardsShare != null && Math.abs(p.airYardsShare) > 1) {
      throw new Error(`[validate] advstats ${year}: |airYardsShare| > 1 for ${p.gsisId} (=${p.airYardsShare}).`);
    }
    sumAirYards += p.components?.airYards ?? 0;
    sumTargets  += p.components?.targets ?? 0;
  }
  if (allNull > count * 0.5) {
    throw new Error(`[validate] advstats ${year}: ${allNull}/${count} players all-null ratios — possible component/column drift.`);
  }
  // Season-level air-yards-per-target plausibility band (advstats-2016-gate.md §3.1).
  // Skip when Σtargets === 0 — an empty/near-empty season is already caught by the
  // MIN_ADVSTATS_ROWS floor above, and dividing here would be a NaN comparison that
  // silently passes rather than throwing. This skip is SAFE here and only here:
  // aggregateAdvReceiving hard-throws when the `targets` CSV column is missing, so by
  // the time this validator runs targets is guaranteed present — a corrupted/renamed
  // column can never reach this Σtargets===0 branch. validateGameLogs shares this band
  // but does NOT share this skip (gamelogs-airyards-gate.md §2) — parsePlayerGameLogs
  // has no such guarantee, so the same precondition does not transfer. Do not
  // "harmonise" the two functions by copying this skip into validateGameLogs.
  if (sumTargets > 0) {
    const ayPerTarget = sumAirYards / sumTargets;
    if (ayPerTarget < AY_PER_TARGET_MIN || ayPerTarget > AY_PER_TARGET_MAX) {
      throw new Error(
        `[validate] advstats ${year}: Σ airYards ÷ Σ targets = ${ayPerTarget.toFixed(2)} — outside plausible ` +
        `[${AY_PER_TARGET_MIN}, ${AY_PER_TARGET_MAX}] range. Possible upstream air-yards corruption.`
      );
    }
  }
}

// ─── nflverse schedule ────────────────────────────────────────────────────────

/**
 * Validates a parsed schedule games array for one season (defence-in-depth after the
 * sparsity gate in scripts/update-schedule.mjs). Throws on clearly bad data.
 *
 * @param {Array} games  Game[] from parseSchedulesCsv (one season)
 * @param {object} opts
 * @param {number} opts.year
 */
export function validateSchedule(games, { year }) {
  if (!Array.isArray(games)) {
    throw new Error(`[validate] schedule ${year}: expected array, got ${typeof games}`);
  }
  if (games.length < MIN_SCHEDULE_GAMES) {
    throw new Error(
      `[validate] schedule ${year}: only ${games.length} games — ` +
      `expected ≥ ${MIN_SCHEDULE_GAMES}. Possible truncated/preliminary fetch.`
    );
  }
  // Format-drift guard: every game needs a gameId + both teams. >50% missing → column drift.
  let missing = 0;
  for (const g of games) {
    if (!g.gameId || !g.homeTeam || !g.awayTeam) missing++;
  }
  if (missing > games.length * 0.5) {
    throw new Error(
      `[validate] schedule ${year}: ${missing}/${games.length} games missing gameId/home/away — ` +
      `possible upstream CSV format change.`
    );
  }
}

// ─── nflverse gamelogs (per-game player stats) ───────────────────────────────

/**
 * Validates a re-keyed gamelogs players object (defence-in-depth after sparsity gate).
 *
 * @param {object} players  { [sleeper_id]: { gsisId, name, position, games[] } }
 * @param {object} opts
 * @param {number} opts.year
 */
export function validateGameLogs(players, { year }) {
  const entries = Object.values(players);
  const totalRows = entries.reduce((s, p) => s + (p.games?.length || 0), 0);
  if (totalRows < MIN_PLAYERGAME_ROWS)
    throw new Error(`[validate] gamelogs ${year}: only ${totalRows} game rows — expected ≥ ${MIN_PLAYERGAME_ROWS}. Possible truncated fetch.`);

  // format-drift guard: if <50% of game rows carry any stat key beyond the 4 identity keys,
  // upstream stat columns likely dropped (e.g. CSV renamed) — real drift signal, not empty-games.
  const IDENTITY_KEYS = new Set(['week', 'seasonType', 'team', 'opponent']);
  let rowsWithStats = 0;
  for (const p of entries) {
    for (const g of (p.games || [])) {
      if (Object.keys(g).some(k => !IDENTITY_KEYS.has(k))) rowsWithStats++;
    }
  }
  if (rowsWithStats < totalRows * 0.5)
    throw new Error(`[validate] gamelogs ${year}: only ${rowsWithStats}/${totalRows} game rows carry stat keys — possible column drift upstream.`);

  // finiteness (numOrNull never yields NaN, but defend in depth)
  const nf = findNonFinite(players);
  if (nf) throw new Error(`[validate] gamelogs ${year}: non-finite numeric at ${nf.path} (=${String(nf.value)}).`);

  // per-game targetShare must be in [0,1] where present. airYardsShare may be negative
  // AND may legitimately exceed 1 in absolute value — skip, deliberately, not an
  // omission: the per-game denominator is the team's NET air yards for that single
  // game, which can be near zero or negative when passes are thrown behind the line, so
  // a receiver with positive air yards can exceed a 100% share. Verified live (2026-08-30):
  // five rows do exceed 1, all legitimate — 2015 wk9 Sammy Watkins 1.021, 2022 wk6
  // D.J. Moore 1.842, 2025 wk10 Garrett Wilson 1.316, 2025 wk17 Tetairoa McMillan 1.140,
  // 2025 wk18 Evan Engram 1.154. A hard |airYardsShare|<=1 bound (advstats has one; see
  // validateAdvStats) would reject 2015/2022/2025 on re-ingest — do not add it here
  // (gamelogs-airyards-gate.md §1.3/§2.1; test/nflverse.test.mjs pins D.J. Moore's 1.842
  // as a passing regression case).
  for (const p of entries) for (const g of (p.games || []))
    if (g.targetShare != null && (g.targetShare < 0 || g.targetShare > 1))
      throw new Error(`[validate] gamelogs ${year}: targetShare out of [0,1] for ${p.gsisId} wk${g.week} (=${g.targetShare}).`);

  // Season-level air-yards-per-target plausibility band, shared with validateAdvStats
  // (gamelogs-airyards-gate.md §2). Accumulated across ALL rows (REG+POST), not REG-only —
  // the two measures differ by <=0.09 across all 14 served seasons and both fit the band,
  // so an all-rows check keeps working even if `seasonType` ever drifts, which a REG-only
  // filter would not (REG-only measured and gives the same verdict).
  let sumAirYards = 0;
  let sumTargets = 0;
  for (const p of entries) for (const g of (p.games || [])) {
    sumAirYards += g.receivingAirYards ?? 0;
    sumTargets  += g.targets ?? 0;
  }
  // THROW on Σtargets === 0 — the deliberate inversion of validateAdvStats' skip.
  // parsePlayerGameLogs requires only player_id/position/season/week; `targets` is not a
  // required column, so a renamed/dropped `targets` column would parse fine, pass the row
  // floor and the format-drift guard (rows still carry receptions/receivingYards), and
  // land here with Σtargets===0. MIN_PLAYERGAME_ROWS guarantees >=3,000 rows spanning
  // QB/RB/WR/TE, so a zero target-sum across that many rows is not an empty season — it
  // is definitionally column drift, and skipping (as validateAdvStats safely does) would
  // silently disable this gate. Do not copy that skip here.
  if (sumTargets === 0) {
    throw new Error(`[validate] gamelogs ${year}: Σ targets = 0 across ${totalRows} game rows — possible column drift upstream (targets renamed or dropped).`);
  }
  const ayPerTarget = sumAirYards / sumTargets;
  if (ayPerTarget < AY_PER_TARGET_MIN || ayPerTarget > AY_PER_TARGET_MAX) {
    throw new Error(
      `[validate] gamelogs ${year}: Σ receivingAirYards ÷ Σ targets = ${ayPerTarget.toFixed(2)} — outside plausible ` +
      `[${AY_PER_TARGET_MIN}, ${AY_PER_TARGET_MAX}] range. Possible upstream air-yards corruption.`
    );
  }
}

// ─── nflverse teamcontext (pbp-derived team/game context) ────────────────────

/**
 * Validates a derived teamcontext teams object (defence-in-depth after the sparsity gate).
 *
 * @param {object} teams  { [teamAbbr]: { games: [...] } }  from aggregateTeamContext
 * @param {object} opts
 * @param {number} opts.year
 */
export function validateTeamContext(teams, { year }) {
  const teamKeys = Object.keys(teams);
  const totalRows = teamKeys.reduce((s, k) => s + (teams[k].games?.length || 0), 0);

  if (totalRows < MIN_TEAMCONTEXT_ROWS) {
    throw new Error(`[validate] teamcontext ${year}: only ${totalRows} team-game rows — expected ≥ ${MIN_TEAMCONTEXT_ROWS}. Possible truncated/preliminary fetch.`);
  }
  if (teamKeys.length > 32) {
    throw new Error(`[validate] teamcontext ${year}: ${teamKeys.length} teams — expected ≤ 32.`);
  }

  // Era-domain guard (the eraTeam regression trap, both directions — silent wrong-team context
  // for 2012–2019 STL/SD/OAK is this slice's highest-severity correctness risk).
  if (year <= 2015 && teamKeys.includes('LA'))
    throw new Error(`[validate] teamcontext ${year}: key 'LA' present — should be era-remapped to 'STL' at year ≤ 2015.`);
  if (year >= 2016 && teamKeys.includes('STL'))
    throw new Error(`[validate] teamcontext ${year}: key 'STL' present — Rams are 'LA' from 2016 on.`);
  if (year <= 2016 && teamKeys.includes('LAC'))
    throw new Error(`[validate] teamcontext ${year}: key 'LAC' present — should be era-remapped to 'SD' at year ≤ 2016.`);
  if (year >= 2017 && teamKeys.includes('SD'))
    throw new Error(`[validate] teamcontext ${year}: key 'SD' present — Chargers are 'LAC' from 2017 on.`);
  if (year <= 2019 && teamKeys.includes('LV'))
    throw new Error(`[validate] teamcontext ${year}: key 'LV' present — should be era-remapped to 'OAK' at year ≤ 2019.`);
  if (year >= 2020 && teamKeys.includes('OAK'))
    throw new Error(`[validate] teamcontext ${year}: key 'OAK' present — Raiders are 'LV' from 2020 on.`);

  for (const key of teamKeys) {
    for (const g of teams[key].games || []) {
      // Honest-null guard: PROE is dormant before the 2006 xpass boundary (dormant at the
      // repo's 2012 floor; guards a future widening from silently fabricating PROE).
      if (year < 2006 && g.off?.proe != null) {
        throw new Error(`[validate] teamcontext ${year}: off.proe is non-null (=${g.off.proe}) for ${key} wk${g.week} — PROE should be null before the 2006 xpass boundary.`);
      }
      // Rate ranges where non-null (plausibility).
      if (g.off?.passRate != null && (g.off.passRate < 0 || g.off.passRate > 1))
        throw new Error(`[validate] teamcontext ${year}: off.passRate out of [0,1] for ${key} wk${g.week} (=${g.off.passRate}).`);
      if (g.off?.successRate != null && (g.off.successRate < 0 || g.off.successRate > 1))
        throw new Error(`[validate] teamcontext ${year}: off.successRate out of [0,1] for ${key} wk${g.week} (=${g.off.successRate}).`);
      if (g.def?.successRate != null && (g.def.successRate < 0 || g.def.successRate > 1))
        throw new Error(`[validate] teamcontext ${year}: def.successRate out of [0,1] for ${key} wk${g.week} (=${g.def.successRate}).`);
      if (g.off?.rzPassRate != null && (g.off.rzPassRate < 0 || g.off.rzPassRate > 1))
        throw new Error(`[validate] teamcontext ${year}: off.rzPassRate out of [0,1] for ${key} wk${g.week} (=${g.off.rzPassRate}).`);
      // proe = (proePassPlays − proeXpassSum) / proePlays is mathematically bounded to
      // [-1,1] by construction (both passRate and avg xpass live in [0,1]) — this is that
      // true bound, not a tighter "typical" one. A tighter band (e.g. [-0.5,0.5], sized for
      // SEASON-level PROE variance) trips on real single-game extremes: discovered via the
      // 2021 NE @ BUF week-13 game (27mph wind, 3 pass attempts all game) → off.proe = -0.567,
      // a verified-legitimate value (cross-checked against nflverse/gamelogs), not a bug.
      if (g.off?.proe != null && (g.off.proe < -1 || g.off.proe > 1))
        throw new Error(`[validate] teamcontext ${year}: off.proe out of [-1,1] for ${key} wk${g.week} (=${g.off.proe}).`);
      if (g.off?.neutralSecPerPlay != null && (g.off.neutralSecPerPlay < 5 || g.off.neutralSecPerPlay > 45))
        throw new Error(`[validate] teamcontext ${year}: off.neutralSecPerPlay out of [5,45] for ${key} wk${g.week} (=${g.off.neutralSecPerPlay}).`);
      // Plausibility bound: OFFENSIVE plays only. def.plays (opponent countable plays faced) is
      // a distinct value that can legitimately sit lower in a one-sided/low-possession game
      // (e.g. a run-out-the-clock blowout) — deliberately left ungated rather than reusing this
      // bound for both sides.
      if (g.off?.plays != null && (g.off.plays < 25 || g.off.plays > 120))
        throw new Error(`[validate] teamcontext ${year}: off.plays out of [25,120] for ${key} wk${g.week} (=${g.off.plays}).`);
    }
  }

  const nf = findNonFinite(teams);
  if (nf) throw new Error(`[validate] teamcontext ${year}: non-finite numeric at ${nf.path} (=${String(nf.value)}).`);
}

// ─── nflverse oline (ESPN depth-chart OL composition) ────────────────────────

// Current 32-team schedule-domain codes. ESPN-era depth_charts asset (MIN_OLINE_SEASON = 2025
// onward) never needs the historical relocated codes (SD/STL/OAK) that SCHEDULE_TEAMS above
// carries for the pbp era — a fresh domain set, not a shared one (no reusable schedule-domain
// export exists to import).
const OLINE_TEAM_DOMAIN = new Set([
  'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND',
  'JAX', 'KC', 'LA', 'LAC', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG', 'NYJ', 'PHI', 'PIT', 'SEA', 'SF',
  'TB', 'TEN', 'WAS',
]);

const OLINE_SLOT_SET = new Set(['LT', 'LG', 'C', 'RG', 'RT']);

/**
 * Validates an aggregated oline teams object (defence-in-depth after the sparsity gate).
 *
 * Per-record defects (empty/missing player `name`; invalid `slot`; non-integer/`< 1` `rank`;
 * a duplicate `(slot, rank)` within a state) are dropped from that state's `ol[]` in place with
 * a `console.warn`, rather than hard-thrown — mirrors `validatePlayersState`. A single ragged
 * upstream depth-chart record (observed: an ESPN row carrying an `espn_id` but empty
 * `player_name`/`gsis_id`) must never forfeit the whole capture week. Only whole-snapshot
 * defects hard-throw: a malformed top-level shape, an empty team set, a team key outside the
 * 32-team domain, more than 32 teams, a state missing week/date/dt (an aggregator-shape
 * invariant, not upstream raggedness), or too few surviving ol rows (< MIN_OLINE_ROWS) after
 * drops — the sparsity gate remains the backstop against a capture gutted by drops.
 *
 * Does NOT validate gsisId/espnId formats — UDFAs carry non-gsis placeholder ids upstream
 * (observed e.g. "WIL597533"); those are real data, not a defect.
 *
 * @param {object} teams  { [teamAbbr]: { states: [...] } }  from aggregateOlineStates, mutated in place
 * @param {object} opts
 * @param {number} opts.year
 */
export function validateOline(teams, { year }) {
  if (!teams || typeof teams !== 'object' || Array.isArray(teams)) {
    throw new Error(`[validate] oline ${year}: expected object, got ${teams === null ? 'null' : typeof teams}`);
  }

  const teamKeys = Object.keys(teams);
  if (teamKeys.length === 0) {
    throw new Error(`[validate] oline ${year}: empty team set — refusing to write an empty snapshot`);
  }

  for (const key of teamKeys) {
    if (!OLINE_TEAM_DOMAIN.has(key)) {
      throw new Error(`[validate] oline ${year}: team key '${key}' outside the 32-team schedule domain.`);
    }
  }
  if (teamKeys.length > 32) {
    throw new Error(`[validate] oline ${year}: ${teamKeys.length} teams — expected ≤ 32.`);
  }

  let rowCount = 0;
  for (const key of teamKeys) {
    for (const state of teams[key].states || []) {
      if (!state.week || !state.date || !state.dt) {
        throw new Error(`[validate] oline ${year}: ${key} state missing week/date/dt.`);
      }

      const seenSlotRank = new Set();
      const kept = [];
      for (const entry of state.ol || []) {
        if (!entry || typeof entry.name !== 'string' || entry.name.length === 0) {
          console.warn(`[validate] oline ${year}: ${key} ${state.week} — dropping ${entry?.slot ?? '?'} rank ${entry?.rank ?? '?'} (espnId=${entry?.espnId ?? 'null'}) — empty/missing player name`);
          continue;
        }
        if (!OLINE_SLOT_SET.has(entry.slot)) {
          console.warn(`[validate] oline ${year}: ${key} ${state.week} — dropping ${entry.name} — invalid slot '${entry.slot}'`);
          continue;
        }
        if (!Number.isInteger(entry.rank) || entry.rank < 1) {
          console.warn(`[validate] oline ${year}: ${key} ${state.week} — dropping ${entry.name} (${entry.slot}) — invalid rank (=${entry.rank})`);
          continue;
        }
        const slotRankKey = `${entry.slot}|${entry.rank}`;
        if (seenSlotRank.has(slotRankKey)) {
          console.warn(`[validate] oline ${year}: ${key} ${state.week} — dropping ${entry.name} — duplicate (slot,rank) ${slotRankKey}`);
          continue;
        }
        seenSlotRank.add(slotRankKey);
        kept.push(entry);
      }
      state.ol = kept;
      rowCount += kept.length;
    }
  }

  if (rowCount < MIN_OLINE_ROWS) {
    throw new Error(`[validate] oline ${year}: only ${rowCount} ol rows after dropping malformed records — expected ≥ ${MIN_OLINE_ROWS}. Possible truncated/broken fetch.`);
  }
}

// ─── Sleeper players-state (weekly status/injury/depth capture) ─────────────

export const MIN_PLAYERSTATE_ROWS = 600;   // observed 1,012 offseason / ~800 in-season

/**
 * Validates a built players-state map (defence-in-depth after the membership
 * filter in scripts/update-playerstate.mjs).
 *
 * Per-record defects (empty/null `name`, `team`, or `position`; `active !== true`;
 * a present-but-invalid `depthChartOrder`) are dropped from `players` in place
 * with a `console.warn` rather than hard-thrown — a single malformed record must
 * never forfeit the whole capture week (this endpoint has no history; a thrown
 * validation loses the week permanently). Only whole-snapshot defects hard-throw:
 * a malformed top-level shape, an empty player set, too few surviving records
 * (< MIN_PLAYERSTATE_ROWS), or too few distinct teams (< 28).
 *
 * Does NOT enum-validate `status`/`injuryStatus` values (forward-stability, see
 * the players-state schema doc).
 *
 * @param {object} players  { [sleeper_id]: pickedState }, mutated in place
 */
export function validatePlayersState(players) {
  if (!players || typeof players !== 'object' || Array.isArray(players)) {
    throw new Error(`[validate] playerstate: expected object, got ${players === null ? 'null' : typeof players}`);
  }

  const ids = Object.keys(players);
  if (ids.length === 0) {
    throw new Error('[validate] playerstate: empty player set — refusing to write an empty snapshot');
  }

  const teams = new Set();
  for (const id of ids) {
    const p = players[id];

    if (typeof p.name !== 'string' || p.name.length === 0) {
      console.warn(`[validate] playerstate: dropping ${id} — empty/null name`);
      delete players[id];
      continue;
    }
    if (typeof p.team !== 'string' || p.team.length === 0) {
      console.warn(`[validate] playerstate: dropping ${id} (${p.name}) — empty/null team`);
      delete players[id];
      continue;
    }
    if (typeof p.position !== 'string' || p.position.length === 0) {
      console.warn(`[validate] playerstate: dropping ${id} (${p.name}) — empty/null position`);
      delete players[id];
      continue;
    }
    if (p.active !== true) {
      console.warn(`[validate] playerstate: dropping ${id} (${p.name}) — active !== true`);
      delete players[id];
      continue;
    }
    if (p.depthChartOrder != null && !(Number.isInteger(p.depthChartOrder) && p.depthChartOrder > 0)) {
      console.warn(`[validate] playerstate: dropping ${id} (${p.name}) — depthChartOrder present but not a positive integer (=${p.depthChartOrder})`);
      delete players[id];
      continue;
    }

    teams.add(p.team);
  }

  const remaining = Object.keys(players).length;
  if (remaining < MIN_PLAYERSTATE_ROWS) {
    throw new Error(`[validate] playerstate: only ${remaining} valid records — expected ≥ ${MIN_PLAYERSTATE_ROWS}. Possible truncated/broken fetch.`);
  }
  if (teams.size < 28) {
    throw new Error(`[validate] playerstate: only ${teams.size} distinct teams — expected ≥ 28. Possible broken team field.`);
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
