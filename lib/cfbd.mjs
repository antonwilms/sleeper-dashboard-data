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
