/**
 * lib/cfbd.mjs — College Football Data API fetch.
 *
 * Fetches /stats/player/season?year=X&category=Y and returns the raw
 * JSON array, which matches the on-disk format used by the app.
 *
 * Each row shape: { season, playerId, player, position, team, conference,
 *                   category, statType, stat }
 * This is the exact format the app's getBulkPlayerStats() expects.
 *
 * The CFBD API key is read from the CFBD_API_KEY environment variable
 * (set in .env locally; set as a repo secret in GitHub Actions).
 */

const CFBD_BASE = 'https://api.collegefootballdata.com';

function getHeaders() {
  const key = process.env.CFBD_API_KEY;
  if (!key) {
    throw new Error(
      'CFBD_API_KEY environment variable is not set. ' +
      'Copy .env.example to .env and add your key.'
    );
  }
  return {
    'Authorization': `Bearer ${key}`,
    'Accept': 'application/json',
  };
}

/**
 * Fetches all stat rows for one category/year combination.
 *
 * @param {number} year      e.g. 2023
 * @param {string} category  'receiving' | 'rushing' | 'passing'
 * @returns {Promise<Array>} Raw CFBD row array
 */
export async function fetchCfbdCategory(year, category) {
  const url = `${CFBD_BASE}/stats/player/season?year=${year}&category=${category}`;
  console.log(`[cfbd] Fetching ${category} ${year}…`);

  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) {
    throw new Error(`CFBD API error ${res.status} for ${url}`);
  }

  const data = await res.json();
  console.log(`[cfbd] ${category} ${year}: ${data.length} rows`);
  return data;
}

/**
 * Pivots a long-form CFBD row array into the app's served player shape:
 *   { [playerId]: { playerId, player, team, position, conference, ...statTypes } }
 * Stat values are parseFloat'd (they arrive as strings). This is the app's
 * src/api/cfbd.js `pivotStatRows` logic, ported exactly — field order and the
 * `conference ?? null` behaviour must match, so the served bytes match what the
 * app has always built from these rows (college-pivot-phase-b.md §3.1).
 *
 * Shared by scripts/migrate-college-pivot.mjs and scripts/update-cfbd.mjs — one
 * implementation, so the migrated files and future ingests cannot drift apart.
 *
 * The returned object's players are re-keyed in ascending-numeric playerId order
 * so the written bytes are deterministic regardless of the input rows' order
 * (§2.2 — a byte-identical dataset fetched in a different row order must not
 * trigger a spurious rewrite/commit/CDN purge).
 *
 * @param {Array} rows  Long-form CFBD row array
 * @returns {Object}    Pivoted player map
 */
export function pivotCfbdRows(rows) {
  const result = {};
  for (const row of rows) {
    if (!result[row.playerId]) {
      result[row.playerId] = {
        playerId:   row.playerId,
        player:     row.player,
        team:       row.team,
        position:   row.position,
        conference: row.conference ?? null,
      };
    }
    result[row.playerId][row.statType] = parseFloat(row.stat);
  }

  const sorted = {};
  for (const id of Object.keys(result).sort((a, b) => Number(a) - Number(b))) {
    sorted[id] = result[id];
  }
  return sorted;
}
