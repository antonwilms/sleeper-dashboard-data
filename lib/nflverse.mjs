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

/**
 * Minimum emitted player rows (WR/TE/RB) for an advstats file to ship.
 * Observed RB-inclusive count is ~470–530 per recent season; 250 ≈ 50% floor,
 * high enough to catch truncated fetches while tolerating sparse early seasons.
 */
export const MIN_ADVSTATS_ROWS = 250;

/** Earliest NFL season present in nfldata games.csv; floor guard for parseSchedulesCsv. */
export const MIN_SCHEDULE_SEASON = 1999;

/**
 * Minimum game rows for a season's schedule file to ship. A fully-published season
 * has its whole slate at once (≈256–285 games incl. playoffs); 200 catches a
 * truncated fetch while passing any published season. The app re-asserts this on rowCount.
 */
export const MIN_SCHEDULE_GAMES = 200;

// ─── Source URLs ──────────────────────────────────────────────────────────────

const ROSTER_BASE   = 'https://github.com/nflverse/nflverse-data/releases/download/rosters';
const DRAFT_BASE    = 'https://github.com/nflverse/nflverse-data/releases/download/draft_picks';
const PLAYERIDS_URL = 'https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv';
const STATS_BASE    = 'https://github.com/nflverse/nflverse-data/releases/download/player_stats';
const SCHEDULES_URL = 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv';

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

/**
 * Coerce a CSV cell to a finite number or null. Empty string and the literal 'NA'
 * → null; otherwise Number(x). Returns null (not NaN) for unparseable values.
 * NOTE: '0' → 0 (preserve tie-game result / zero scores), never null.
 * @param {string|undefined} raw
 * @returns {number|null}
 */
export function numOrNull(raw) {
  const s = (raw ?? '').trim();
  if (s === '' || s === 'NA') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
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

// ─── Advanced receiving stats ──────────────────────────────────────────────────

/**
 * Fetch `stats_player_week_<year>.csv` from the nflverse player_stats release asset.
 * Returns the CSV text, or null on 404/504 (year not yet published).
 *
 * @param {number} year  NFL season year, e.g. 2023
 * @returns {Promise<string|null>}
 */
export async function fetchPlayerStatsCsv(year) {
  return fetchRelease(`${STATS_BASE}/stats_player_week_${year}.csv`);
}

/**
 * Aggregate nflverse weekly player stats into season-level advanced receiving ratios.
 *
 * Ratios are RECOMPUTED from summed components (never aggregated from weekly columns)
 * to avoid the ratio-aggregation trap. Team denominators use WEEK-RESTRICTED totals
 * for traded players (only the weeks the player was on each team).
 *
 * Position scope: WR, TE, RB (configurable via `positions`).
 * Team denominators include ALL positions' targets/air-yards.
 *
 * RB notes:
 *  - `racr` is null when season receiving_air_yards ≤ 0 (behind-LOS targets can
 *    produce net-negative air yards, making the ratio nonsensical).
 *  - `air_yards_share` and `wopr` are emitted as computed even when negative
 *    (mathematically defined; capture-only).
 *
 * @param {string} csv   Raw CSV text from fetchPlayerStatsCsv
 * @param {object} opts
 * @param {string[]} opts.positions  Positions to emit (default: ['WR','TE','RB'])
 * @returns {{ byGsis: object, season: number|null, rowCount: number }}
 *   byGsis: { [gsis_id]: { gsisId, name, position, team, [traded, teams,]
 *             targetShare, airYardsShare, wopr, racr, components } }
 */
export function aggregateAdvReceiving(csv, { positions = ['WR', 'TE', 'RB'] } = {}) {
  const lines = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .split('\n')
    .filter(l => l.trim());

  if (lines.length < 2) return { byGsis: {}, season: null, rowCount: 0 };

  const header   = splitCsvLine(lines[0]);
  const iGsis    = header.indexOf('player_id');
  const iTeam    = header.indexOf('team');
  const iTargets = header.indexOf('targets');
  const iSeason  = header.indexOf('season');
  const iWeek    = header.indexOf('week');
  const iPos     = header.indexOf('position');
  const iName    = header.indexOf('player_display_name');
  const iAirYds  = header.indexOf('receiving_air_yards');
  const iRecYds  = header.indexOf('receiving_yards');
  const iRec     = header.indexOf('receptions');

  if (iGsis === -1 || iTeam === -1 || iTargets === -1) {
    throw new Error(
      `[nflverse] aggregateAdvReceiving: required columns missing — ` +
      `player_id=${iGsis !== -1}, team=${iTeam !== -1}, targets=${iTargets !== -1}. ` +
      `Possible upstream CSV format change.`
    );
  }

  // Per-week team totals for ALL positions (basis for week-restricted denominators)
  const weeklyTeamTargets  = {}; // { [team]: { [week]: number } }
  const weeklyTeamAirYards = {}; // { [team]: { [week]: number } }
  // Full-season team totals (fallback when week column absent)
  const fullTeamTargets  = {};
  const fullTeamAirYards = {};

  // Per-player accumulation keyed by gsis_id
  const gsisByPlayer = {};
  let season = null;

  // ── Single pass: accumulate stats from all rows ────────────────────────────
  for (let i = 1; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i]);
    const gsis = fields[iGsis]?.trim() ?? '';
    const team = fields[iTeam]?.trim() ?? '';
    if (!gsis || !team) continue;

    const weekVal = iWeek !== -1 ? parseInt(fields[iWeek]?.trim(), 10) : NaN;
    const week    = isNaN(weekVal) ? null : weekVal;
    const tgts    = parseFloat(fields[iTargets]?.trim()) || 0;
    const airYds  = iAirYds !== -1 ? (parseFloat(fields[iAirYds]?.trim()) || 0) : 0;
    const recYds  = iRecYds !== -1 ? (parseFloat(fields[iRecYds]?.trim()) || 0) : 0;
    const recs    = iRec    !== -1 ? (parseFloat(fields[iRec]?.trim())    || 0) : 0;

    // Team totals — ALL positions (denominators include every position's opportunity)
    fullTeamTargets[team]  = (fullTeamTargets[team]  || 0) + tgts;
    fullTeamAirYards[team] = (fullTeamAirYards[team] || 0) + airYds;
    if (week !== null) {
      if (!weeklyTeamTargets[team])  weeklyTeamTargets[team]  = {};
      if (!weeklyTeamAirYards[team]) weeklyTeamAirYards[team] = {};
      weeklyTeamTargets[team][week]  = (weeklyTeamTargets[team][week]  || 0) + tgts;
      weeklyTeamAirYards[team][week] = (weeklyTeamAirYards[team][week] || 0) + airYds;
    }

    // Capture season from first parseable row
    if (season === null && iSeason !== -1) {
      const s = parseInt(fields[iSeason]?.trim(), 10);
      if (!isNaN(s)) season = s;
    }

    // Per-player accumulation (all positions — filter happens in second pass)
    if (!gsisByPlayer[gsis]) {
      gsisByPlayer[gsis] = { name: null, position: null, recYards: 0, recAirYards: 0, receptions: 0, byTeam: {} };
    }
    const p = gsisByPlayer[gsis];

    if (iName !== -1 && fields[iName]?.trim()) p.name     = fields[iName].trim();
    if (iPos  !== -1 && fields[iPos]?.trim())  p.position = fields[iPos].trim();
    p.recYards    += recYds;
    p.recAirYards += airYds;
    p.receptions  += recs;

    if (!p.byTeam[team]) p.byTeam[team] = { targets: 0, airYards: 0, weeks: new Set() };
    p.byTeam[team].targets  += tgts;
    p.byTeam[team].airYards += airYds;
    if (week !== null) p.byTeam[team].weeks.add(week);
  }

  // ── Second pass: emit ratios for players with position ∈ positions ─────────
  const posSet = new Set(positions);
  const byGsis = {};

  for (const [gsis, p] of Object.entries(gsisByPlayer)) {
    if (!posSet.has(p.position)) continue;

    const teamEntries = Object.entries(p.byTeam);

    // Week-restricted team denominators per team (fall back to full season when week col absent)
    const tgtsRestricted = {};
    const airRestricted  = {};
    for (const [team, pTeam] of teamEntries) {
      if (pTeam.weeks.size > 0) {
        let tSum = 0, aSum = 0;
        for (const w of pTeam.weeks) {
          tSum += weeklyTeamTargets[team]?.[w] ?? 0;
          aSum += weeklyTeamAirYards[team]?.[w] ?? 0;
        }
        tgtsRestricted[team] = tSum;
        airRestricted[team]  = aSum;
      } else {
        tgtsRestricted[team] = fullTeamTargets[team] ?? 0;
        airRestricted[team]  = fullTeamAirYards[team] ?? 0;
      }
    }

    // targetShare — volume-weighted average of per-team shares (decision 1 + 2)
    // null if any relevant team denominator ≤ 0, or player had no targets
    const totalPlayerTgts = teamEntries.reduce((s, [, v]) => s + v.targets, 0);
    let tgtNumer = 0, tgtOk = true;
    for (const [team, pTeam] of teamEntries) {
      if (pTeam.targets === 0) continue;
      if (tgtsRestricted[team] <= 0) { tgtOk = false; break; }
      tgtNumer += (pTeam.targets / tgtsRestricted[team]) * pTeam.targets;
    }
    const targetShare = (tgtOk && totalPlayerTgts > 0)
      ? Math.round(tgtNumer / totalPlayerTgts * 1000) / 1000
      : null;

    // airYardsShare — same formula; null if team denom ≤ 0 or player total = 0
    // Negative results are emitted for RBs (behind-LOS targets → net-negative air yards)
    let airNumer = 0, airOk = true;
    for (const [team, pTeam] of teamEntries) {
      const denomAir = airRestricted[team];
      if (pTeam.airYards !== 0 && denomAir <= 0) { airOk = false; break; }
      if (denomAir <= 0) continue; // player also had 0 air yards on this team
      airNumer += (pTeam.airYards / denomAir) * pTeam.airYards;
    }
    const airYardsShare = (airOk && p.recAirYards !== 0)
      ? Math.round(airNumer / p.recAirYards * 1000) / 1000
      : null;

    // wopr — null if either component is null
    const wopr = (targetShare != null && airYardsShare != null)
      ? Math.round((1.5 * targetShare + 0.7 * airYardsShare) * 1000) / 1000
      : null;

    // racr — null if season receiving_air_yards ≤ 0 (guard extended to cover RBs with
    // net-negative air yards from behind-LOS targets, where the ratio is nonsensical)
    const racr = p.recAirYards > 0
      ? Math.round(p.recYards / p.recAirYards * 1000) / 1000
      : null;

    // Primary team: max targets; tie → max air yards; tie → alphabetical (first)
    const primaryTeamEntry = teamEntries.reduce((best, cur) => {
      if (!best) return cur;
      const [bt, bv] = best;
      const [ct, cv] = cur;
      if (cv.targets > bv.targets) return cur;
      if (cv.targets === bv.targets) {
        if (cv.airYards > bv.airYards) return cur;
        if (cv.airYards === bv.airYards && ct < bt) return cur;
      }
      return best;
    }, null);
    const primaryTeam = primaryTeamEntry?.[0] ?? null;

    // Distinct weeks across all teams
    const allWeeks = new Set(teamEntries.flatMap(([, v]) => [...v.weeks]));

    const entry = {
      gsisId:        gsis,
      name:          p.name,
      position:      p.position,
      team:          primaryTeam,
      targetShare,
      airYardsShare,
      wopr,
      racr,
      components: {
        targets:    totalPlayerTgts,
        airYards:   p.recAirYards,
        recYards:   p.recYards,
        receptions: p.receptions,
        weeks:      allWeeks.size,
      },
    };

    if (teamEntries.length > 1) {
      entry.traded = true;
      // Sorted by player targets desc for the teams array
      entry.teams = teamEntries
        .slice()
        .sort((a, b) => b[1].targets - a[1].targets)
        .map(([t]) => t);
    }

    byGsis[gsis] = entry;
  }

  return { byGsis, season, rowCount: Object.keys(byGsis).length };
}

/**
 * Re-key an advstats byGsis map to sleeper_id using the local playerids crosswalk.
 * Pure function (no I/O) — unit-testable.
 *
 * @param {object} byGsis        { [gsis_id]: player }  from aggregateAdvReceiving
 * @param {object} crosswalkIds  { [gsis_id]: { sleeperId, ... } }  from playerids.json `.ids`
 * @returns {{ players: object, unmapped: number }}
 *   players: { [sleeper_id]: player }
 *   unmapped: count of gsis ids with no crosswalk entry
 */
export function rekeyBySleeper(byGsis, crosswalkIds) {
  const players = {};
  let unmapped = 0;
  for (const [gsis, player] of Object.entries(byGsis)) {
    const sleeperId = crosswalkIds[gsis]?.sleeperId;
    if (!sleeperId) {
      unmapped++;
      continue;
    }
    // player already carries gsisId; keep-last on the rare sleeper collision
    players[sleeperId] = player;
  }
  return { players, unmapped };
}

// ─── Schedules ────────────────────────────────────────────────────────────────

/**
 * Fetch the combined nfldata games.csv (all seasons 1999→present).
 * Returns CSV text, or null on 404/504 (same convention as fetchRelease).
 * @returns {Promise<string|null>}
 */
export async function fetchSchedulesCsv() {
  return fetchRelease(SCHEDULES_URL);
}

/**
 * Parse the combined schedules CSV into per-season game arrays.
 *
 * Required columns (throws if any missing — fail-loud on upstream format change):
 *   game_id, season, home_team, away_team.
 * Rows with NaN season or season < minSeason are skipped.
 * Numeric fields (scores, result, lines, temp, wind) use numOrNull: empty/'NA' → null,
 * '0' preserved as 0. String fields (gameType, roof, surface) → trimmed string or null.
 *
 * @param {string} csv  Raw CSV text from fetchSchedulesCsv
 * @param {object} [opts]
 * @param {number} [opts.minSeason=MIN_SCHEDULE_SEASON]
 * @returns {{ gamesBySeason: object, count: number }}
 *   gamesBySeason: { [year: string]: Game[] }
 *   Game: { gameId, season, week, gameType, homeTeam, awayTeam, homeScore, awayScore,
 *           result, spreadLine, totalLine, roof, surface, temp, wind }
 */
export function parseSchedulesCsv(csv, { minSeason = MIN_SCHEDULE_SEASON } = {}) {
  const lines = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) return { gamesBySeason: {}, count: 0 };

  const header   = splitCsvLine(lines[0]);
  const iGameId  = header.indexOf('game_id');
  const iSeason  = header.indexOf('season');
  const iWeek    = header.indexOf('week');
  const iType    = header.indexOf('game_type');
  const iHome    = header.indexOf('home_team');
  const iAway    = header.indexOf('away_team');
  const iHomeSc  = header.indexOf('home_score');
  const iAwaySc  = header.indexOf('away_score');
  const iResult  = header.indexOf('result');
  const iSpread  = header.indexOf('spread_line');
  const iTotal   = header.indexOf('total_line');
  const iRoof    = header.indexOf('roof');
  const iSurface = header.indexOf('surface');
  const iTemp    = header.indexOf('temp');
  const iWind    = header.indexOf('wind');

  if (iGameId === -1 || iSeason === -1 || iHome === -1 || iAway === -1) {
    throw new Error(
      `[nflverse] parseSchedulesCsv: required columns missing — ` +
      `game_id=${iGameId !== -1}, season=${iSeason !== -1}, ` +
      `home_team=${iHome !== -1}, away_team=${iAway !== -1}. Possible upstream CSV format change.`
    );
  }

  const str = (f, i) => (i !== -1 ? (f[i]?.trim() || null) : null);
  const gamesBySeason = {};

  for (let i = 1; i < lines.length; i++) {
    const f = splitCsvLine(lines[i]);
    const season = parseInt(f[iSeason], 10);
    if (isNaN(season) || season < minSeason) continue;

    const game = {
      gameId:    f[iGameId]?.trim() || null,
      season,
      week:      iWeek !== -1 ? (parseInt(f[iWeek], 10) || null) : null,
      gameType:  str(f, iType),
      homeTeam:  str(f, iHome),
      awayTeam:  str(f, iAway),
      homeScore: numOrNull(f[iHomeSc]),
      awayScore: numOrNull(f[iAwaySc]),
      result:    numOrNull(f[iResult]),
      spreadLine: numOrNull(f[iSpread]),
      totalLine:  numOrNull(f[iTotal]),
      roof:      str(f, iRoof),
      surface:   str(f, iSurface),
      temp:      numOrNull(f[iTemp]),
      wind:      numOrNull(f[iWind]),
    };
    if (!game.gameId || !game.homeTeam || !game.awayTeam) continue; // skip malformed rows

    const key = String(season);
    (gamesBySeason[key] ??= []).push(game);
  }

  const count = Object.values(gamesBySeason).reduce((s, arr) => s + arr.length, 0);
  return { gamesBySeason, count };
}
