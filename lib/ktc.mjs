/**
 * lib/ktc.mjs — KeepTradeCut scraper for Node.js using cheerio.
 *
 * Ports the browser-side scraper from the app (src/api/ktc.js) to Node,
 * replacing DOMParser with cheerio. Selector logic is identical.
 *
 * Output shape per player: { name, team, value, position }
 * Matches the shape already stored in ktc/snapshot-*.json.
 *
 * Polite-scraping rules:
 *   - User-Agent identifies this tool (not a generic browser)
 *   - 1.5s sleep between page requests
 *   - Pages 0–9 (50 players/page), stops on partial page or dedup
 */

import * as cheerio from 'cheerio';

const KTC_BASE = 'https://keeptradecut.com';
const ALL_FILTERS = 'QB%7CRB%7CWR%7CTE%7CRDP';
const UA = 'sleeper-dashboard-data/1.0 (+https://github.com/antonwilms/sleeper-dashboard-data)';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetches one KTC page and returns parsed player objects.
 * Returns null if the page has no `.onePlayer` elements.
 *
 * @param {number} page  Page index (0-based)
 * @returns {Promise<Array|null>}
 */
async function fetchPage(page) {
  const url = `${KTC_BASE}/dynasty-rankings?filters=${ALL_FILTERS}&format=2&page=${page}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html',
    },
  });

  if (!res.ok) throw new Error(`KTC HTTP ${res.status} for page ${page}`);
  const html = await res.text();

  const $ = cheerio.load(html);
  const rows = $('div.onePlayer');
  console.log(`[ktc] Page ${page}: ${rows.length} div.onePlayer elements`);

  if (!rows.length) return null;

  const players = [];
  rows.each((i, el) => {
    const name  = $(el).find('.player-name p a').first().text().trim();
    const team  = $(el).find('.player-team').first().text().trim() || null;
    const rawVal = $(el).find('.value p').first().text().trim();
    const value = rawVal ? parseInt(rawVal.replace(/,/g, ''), 10) : null;

    if (!name || value == null || isNaN(value)) return; // skip invalid entries

    const posRaw   = $(el).find('.position-team').first().text().trim();
    const posMatch = posRaw.match(/\b(QB|RB|WR|TE|K)/i);
    const position = posMatch ? posMatch[1].toUpperCase() : null;

    players.push({ name, team, value, position });
  });

  return players.length > 0 ? players : null;
}

/**
 * Fetches all KTC dynasty pages (0–9) with 1.5s delay between pages.
 * Stops on partial page (< 50 players) or no new players (dedup).
 *
 * @returns {Promise<Array>}  Array of { name, team, value, position }
 */
export async function fetchKtcSnapshot() {
  const allPlayers = [];
  const seen = new Set(); // dedup key: "name|team"

  for (let page = 0; page <= 9; page++) {
    if (page > 0) await delay(1500); // polite gap between requests

    let players;
    try {
      players = await fetchPage(page);
    } catch (err) {
      console.warn(`[ktc] Page ${page} failed: ${err.message} — stopping`);
      break;
    }

    if (!players) {
      console.log(`[ktc] Page ${page}: no data — stopping`);
      break;
    }

    let newCount = 0;
    for (const p of players) {
      const key = `${p.name}|${p.team}`;
      if (!seen.has(key)) {
        seen.add(key);
        allPlayers.push(p);
        newCount++;
      }
    }

    console.log(`[ktc] Page ${page}: ${players.length} rows, ${newCount} new — total ${allPlayers.length}`);

    if (newCount === 0) { console.log('[ktc] No new players — stopping early'); break; }
    if (players.length < 50) { console.log('[ktc] Partial page — done'); break; }
  }

  return allPlayers;
}
