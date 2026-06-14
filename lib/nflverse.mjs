/**
 * lib/nflverse.mjs — nflverse release-asset fetch + CSV-parse helpers (Node-only).
 *
 * These parsers mirror the app's nflRoster.js / nflDraft.js parsers; the code
 * is intentionally duplicated (zero shared code across repos), exactly as
 * lib/sleeper.mjs mirrors the app's aggregation logic.
 *
 * All network calls use Node native fetch (no CORS constraints server-side).
 * Release-asset URLs redirect 302 → signed release-assets.githubusercontent.com;
 * native fetch follows redirects by default.
 */

// ─── Shared constants (cross-repo contract — if you change these, change the app too) ──

/** Minimum id-bearing rows required for a roster file to be considered complete. */
export const MIN_ROSTER_IDS = 1500;

/**
 * Oldest draft year to include in draft_picks.json.
 * A generous superset of the app's DRAFT_YEARS so the app can widen its
 * window without a re-ingest.
 */
export const MIN_DRAFT_YEAR = 2010;

/** Minimum gsis↔sleeper crosswalk rows required for playerids.json to ship. */
export const MIN_PLAYERID_ROWS = 5000;

// ─── Source URLs ──────────────────────────────────────────────────────────────

const ROSTER_BASE   = 'https://github.com/nflverse/nflverse-data/releases/download/rosters';
const DRAFT_BASE    = 'https://github.com/nflverse/nflverse-data/releases/download/draft_picks';
const PLAYERIDS_URL = 'https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv';

// ─── Quote-aware CSV splitter ─────────────────────────────────────────────────
// Mirrors the app's splitCsvLine; handles quoted fields with embedded commas
// and escaped double-quotes (""). Outer quotes are stripped from the result.

/**
 * Split a single CSV line into fields, respecting double-quoted fields.
 * @param {string} line
 * @returns {string[]}
 */
export function splitCsvLine(line) {
  const fields = [];
  let current  = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped double-quote inside a quoted field
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
        // Don't append the quote character itself — outer quotes are stripped
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

// ─── Internal fetch helper ────────────────────────────────────────────────────

/**
 * Fetch a release-asset URL. Returns the response text on success;
 * returns null on 404/504 (file not yet published); throws on other errors.
 */
async function fetchRelease(url) {
  const res = await fetch(url);
  if (res.status === 404 || res.status === 504) return null;
  if (!res.ok) {
    throw new Error(`[nflverse] HTTP ${res.status} fetching ${url}`);
  }
  return res.text();
}

// ─── Roster ───────────────────────────────────────────────────────────────────

/**
 * Fetch `roster_<year>.csv` from the nflverse rosters release asset.
 * Returns the CSV text, or null if the file is not yet published (404/504).
 *
 * @param {number} year  NFL season year, e.g. 2025
 * @returns {Promise<string|null>}
 */
export async function fetchRosterCsv(year) {
  const url = `${ROSTER_BASE}/roster_${year}.csv`;
  return fetchRelease(url);
}

/**
 * Parse a nflverse roster CSV into the data-store player shape.
 *
 * The output `players` object is keyed by `sleeper_id`; rows without a
 * `sleeper_id` are silently skipped. If the `sleeper_id` or `status` columns
 * are missing from the CSV header, throws (fail-loud — indicates upstream
 * format change, should be red CI).
 *
 * @param {string} csv  Raw CSV text from fetchRosterCsv
 * @returns {{ season: number|null, players: object, rowCount: number }}
 */
export function parseRosterCsv(csv) {
  // Normalize line endings
  const lines = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .split('\n')
    .filter(l => l.trim());

  if (lines.length < 2) {
    return { season: null, players: {}, rowCount: 0 };
  }

  const header    = splitCsvLine(lines[0]);
  const iSleeperId = header.indexOf('sleeper_id');
  const iStatus    = header.indexOf('status');
  const iTeam      = header.indexOf('team');
  const iPosition  = header.indexOf('position');
  const iFullName  = header.indexOf('full_name');
  const iSeason    = header.indexOf('season');

  if (iSleeperId === -1 || iStatus === -1) {
    throw new Error(
      `[nflverse] parseRosterCsv: required columns missing — ` +
      `sleeper_id=${iSleeperId !== -1}, status=${iStatus !== -1}. ` +
      `Possible upstream CSV format change.`
    );
  }

  const players = {};
  let season = null;

  for (let i = 1; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i]);

    const sleeperId = fields[iSleeperId]?.trim() ?? '';
    if (!sleeperId) continue; // skip rows without a sleeper_id

    // Capture season from the first id-bearing row
    if (season === null && iSeason !== -1) {
      const s = parseInt(fields[iSeason], 10);
      if (!isNaN(s)) season = s;
    }

    // keep-last rule for any duplicate sleeper_id rows (per spec: zero duplicates
    // confirmed in 2024, but keep-last is safe if a future file regresses)
    players[sleeperId] = {
      team:     fields[iTeam]?.trim()     || null,
      position: fields[iPosition]?.trim() || null,
      status:   fields[iStatus]?.trim()   || null,
      fullName: fields[iFullName]?.trim() || null,
    };
  }

  return { season, players, rowCount: Object.keys(players).length };
}

// ─── Draft ────────────────────────────────────────────────────────────────────

/**
 * Fetch `draft_picks.csv` from the nflverse draft_picks release asset.
 * Returns the CSV text, or null if not available (404/504).
 *
 * @returns {Promise<string|null>}
 */
export async function fetchDraftCsv() {
  return fetchRelease(`${DRAFT_BASE}/draft_picks.csv`);
}

/**
 * Fetch the draft picks `timestamp.json` for source-freshness metadata.
 * Returns the `last_updated` string, or null on any failure (best-effort only).
 *
 * @returns {Promise<string|null>}
 */
export async function fetchDraftTimestamp() {
  try {
    const res = await fetch(`${DRAFT_BASE}/timestamp.json`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.last_updated ?? null;
  } catch {
    return null;
  }
}

/**
 * Parse the combined nflverse draft picks CSV.
 *
 * Filters to seasons >= MIN_DRAFT_YEAR; skips rows with non-integer rounds
 * (supplemental picks, header artifacts, NA values). Groups results by year.
 *
 * @param {string} csv  Raw CSV text from fetchDraftCsv
 * @returns {{ picksByYear: object, count: number }}
 *   picksByYear: { [year: string]: DraftPick[] }
 *   DraftPick: { year, round, pick, team, fullName, position, college, age|null }
 */
export function parseDraftCsv(csv) {
  // Normalize line endings
  const lines = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .split('\n')
    .filter(l => l.trim());

  if (lines.length < 2) {
    return { picksByYear: {}, count: 0 };
  }

  const header    = splitCsvLine(lines[0]);
  const iSeason   = header.indexOf('season');
  const iRound    = header.indexOf('round');
  const iPick     = header.indexOf('pick');
  const iTeam     = header.indexOf('team');
  const iName     = header.indexOf('pfr_player_name');
  const iPosition = header.indexOf('position');
  const iCollege  = header.indexOf('college');
  const iAge      = header.indexOf('age');

  const picksByYear = {};

  for (let i = 1; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i]);

    // Filter by year
    const year = parseInt(fields[iSeason], 10);
    if (isNaN(year) || year < MIN_DRAFT_YEAR) continue;

    // Skip supplemental / NA / non-integer rounds
    const roundRaw = fields[iRound]?.trim() ?? '';
    const round    = parseInt(roundRaw, 10);
    if (isNaN(round)) continue; // covers 'NA', 'supplemental', empty, etc.

    // Skip non-integer picks
    const pickRaw = fields[iPick]?.trim() ?? '';
    const pick    = parseInt(pickRaw, 10);
    if (isNaN(pick)) continue;

    // age: 'NA' or empty → null; otherwise parse as float
    const ageRaw = fields[iAge]?.trim() ?? '';
    const age    = (ageRaw && ageRaw !== 'NA') ? parseFloat(ageRaw) : null;

    const entry = {
      year,
      round,
      pick,
      team:     fields[iTeam]?.trim()     || null,
      fullName: iName !== -1 ? (fields[iName]?.trim() || null) : null,
      position: iPosition !== -1 ? (fields[iPosition]?.trim() || null) : null,
      college:  iCollege !== -1 ? (fields[iCollege]?.trim() || null) : null,
      age,
    };

    const key = String(year);
    if (!picksByYear[key]) picksByYear[key] = [];
    picksByYear[key].push(entry);
  }

  const count = Object.values(picksByYear).reduce((s, arr) => s + arr.length, 0);
  return { picksByYear, count };
}

// ─── Player IDs crosswalk ─────────────────────────────────────────────────────

/**
 * Fetch `db_playerids.csv` from the DynastyProcess data repository.
 * Returns the CSV text, or null on 404/504; throws on other errors.
 * This file should always be published; null signals an unexpected outage.
 *
 * @returns {Promise<string|null>}
 */
export async function fetchPlayerIdsCsv() {
  return fetchRelease(PLAYERIDS_URL);
}

/**
 * Parse the DynastyProcess db_playerids CSV into a gsis_id-keyed crosswalk.
 *
 * Only rows where both `gsis_id` and `sleeper_id` are non-empty and not the
 * literal string 'NA' are emitted (rows that can't join are unusable).
 * Duplicate `gsis_id` keys use keep-last (confirmed lossless — colliding rows
 * share the same `sleeper_id` in the source data).
 *
 * If `gsis_id` or `sleeper_id` is missing from the header, throws (fail-loud —
 * indicates an upstream format change, should produce red CI).
 *
 * @param {string} csv  Raw CSV text from fetchPlayerIdsCsv
 * @returns {{ ids: object, rowCount: number, sourceSeason: number|null }}
 *   ids: { [gsis_id]: { sleeperId, name, position } }
 *   sourceSeason: modal db_season value from CSV (best-effort staleness field)
 */
export function parsePlayerIdsCsv(csv) {
  // Normalize line endings
  const lines = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .split('\n')
    .filter(l => l.trim());

  if (lines.length < 2) {
    return { ids: {}, rowCount: 0, sourceSeason: null };
  }

  const header   = splitCsvLine(lines[0]);
  const iGsis    = header.indexOf('gsis_id');
  const iSleeper = header.indexOf('sleeper_id');
  const iName    = header.indexOf('name');
  const iPos     = header.indexOf('position');
  const iSeason  = header.indexOf('db_season');

  if (iGsis === -1 || iSleeper === -1) {
    throw new Error(
      `[nflverse] parsePlayerIdsCsv: required columns missing — ` +
      `gsis_id=${iGsis !== -1}, sleeper_id=${iSleeper !== -1}. ` +
      `Possible upstream CSV format change.`
    );
  }

  const ids = {};
  let sourceSeason = null;

  for (let i = 1; i < lines.length; i++) {
    const fields    = splitCsvLine(lines[i]);
    const gsis      = fields[iGsis]?.trim()    ?? '';
    const sleeperId = fields[iSleeper]?.trim() ?? '';

    // Skip rows where either join key is absent or the literal sentinel 'NA'
    if (!gsis || gsis === 'NA' || !sleeperId || sleeperId === 'NA') continue;

    // Capture sourceSeason from the first row with a parseable db_season
    if (sourceSeason === null && iSeason !== -1) {
      const s = parseInt(fields[iSeason], 10);
      if (!isNaN(s)) sourceSeason = s;
    }

    // Keep-last on duplicate gsis_id (confirmed lossless — duplicate rows share same sleeper_id)
    ids[gsis] = {
      sleeperId,
      name:     fields[iName]?.trim() || null,
      position: fields[iPos]?.trim()  || null,
    };
  }

  return { ids, rowCount: Object.keys(ids).length, sourceSeason };
}
