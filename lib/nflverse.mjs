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

import zlib from 'zlib';

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

/**
 * Season-level air-yards-per-target plausibility band for validateAdvStats (a validation
 * band, not a coverage floor — do not treat as family coverage). Archive range across all
 * 14 served seasons is 7.80–9.07; [6, 11] flags exactly the corrupt 2016 season (measured
 * 3.96) with ≥1.8 of margin on each side. See advstats-2016-gate.md §1.1/§3.1.
 */
export const AY_PER_TARGET_MIN = 6;
export const AY_PER_TARGET_MAX = 11;

/** Earliest NFL season present in nfldata games.csv; floor guard for parseSchedulesCsv. */
export const MIN_SCHEDULE_SEASON = 1999;

/**
 * Minimum game rows for a season's schedule file to ship. A fully-published season
 * has its whole slate at once (≈256–285 games incl. playoffs); 200 catches a
 * truncated fetch while passing any published season. The app re-asserts this on rowCount.
 */
export const MIN_SCHEDULE_GAMES = 200;

/** Minimum per-game rows for a gamelogs season file to ship (≈50% of a ~6000-row season). */
export const MIN_PLAYERGAME_ROWS = 3000;
/** Earliest season to ingest gamelogs (charting era; aligns with nfl/season-totals + advstats). */
export const MIN_GAMELOG_SEASON = 2012;

/** Minimum team-game rows for a teamcontext file to ship (≈2 full weeks × 32; gz CRC catches truncation). */
export const MIN_TEAMCONTEXT_ROWS = 60;
/** Earliest season to derive teamcontext (aligns with season-totals/advstats/gamelogs join floor; pbp reaches 1999, xpass 2006). */
export const MIN_TEAMCONTEXT_SEASON = 2012;

/** Minimum ol[] entries for an oline file to ship (~430 OL entries per full week across 32 teams; 160 ≈ one thin week). */
export const MIN_OLINE_ROWS = 160;
/** Earliest season to ingest oline (ESPN dt-schema era only — 2024- files use the legacy NFL-feed schema). */
export const MIN_OLINE_SEASON = 2025;

// ─── Source URLs ──────────────────────────────────────────────────────────────

const ROSTER_BASE      = 'https://github.com/nflverse/nflverse-data/releases/download/rosters';
const DRAFT_BASE       = 'https://github.com/nflverse/nflverse-data/releases/download/draft_picks';
const PLAYERIDS_URL    = 'https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv';
// stats_player is the CURRENT release tag; the legacy player_stats tag is frozen
// (2019 asset broken "starter" upload, 2025+ never mirrored) — do not revert.
const STATS_BASE       = 'https://github.com/nflverse/nflverse-data/releases/download/stats_player';
const SCHEDULES_URL    = 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv';
const PBP_BASE         = 'https://github.com/nflverse/nflverse-data/releases/download/pbp';
const DEPTHCHARTS_BASE = 'https://github.com/nflverse/nflverse-data/releases/download/depth_charts';

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
 * Fetch `stats_player_week_<year>.csv` from the nflverse stats_player release asset.
 * Returns the CSV text, or null on 404/504 (year not yet published).
 *
 * @param {number} year  NFL season year, e.g. 2023
 * @returns {Promise<string|null>}
 */
export async function fetchPlayerStatsCsv(year) {
  return fetchRelease(`${STATS_BASE}/stats_player_week_${year}.csv`);
}

/**
 * Fetch a gzipped release asset. Returns the decompressed text on success; null on 404/504
 * (asset not yet published); throws on other errors. fetchRelease() (above) calls res.text()
 * and cannot be reused here — gz assets need the raw arrayBuffer + zlib.gunzipSync.
 * @param {string} url
 * @returns {Promise<string|null>}
 */
async function fetchReleaseGz(url) {
  const res = await fetch(url);
  if (res.status === 404 || res.status === 504) return null;
  if (!res.ok) {
    throw new Error(`[nflverse] HTTP ${res.status} fetching ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return zlib.gunzipSync(buf).toString('utf8');
}

/**
 * Fetch `play_by_play_<year>.csv.gz` from the nflverse `pbp` release asset.
 * Returns the decompressed CSV text, or null on 404/504 (year not yet published).
 * @param {number} year  NFL season year, e.g. 2023
 * @returns {Promise<string|null>}
 */
export async function fetchPbpCsv(year) {
  return fetchReleaseGz(`${PBP_BASE}/play_by_play_${year}.csv.gz`);
}

/**
 * Fetch `depth_charts_<year>.csv` from the nflverse `depth_charts` release asset (ESPN-fed,
 * plain CSV — not gz). Returns the CSV text, or null on 404/504 (year not yet published).
 * @param {number} year  NFL season year, e.g. 2025
 * @returns {Promise<string|null>}
 */
export async function fetchDepthChartsCsv(year) {
  return fetchRelease(`${DEPTHCHARTS_BASE}/depth_charts_${year}.csv`);
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
  const iType    = header.indexOf('season_type');

  if (iGsis === -1 || iTeam === -1 || iTargets === -1) {
    throw new Error(
      `[nflverse] aggregateAdvReceiving: required columns missing — ` +
      `player_id=${iGsis !== -1}, team=${iTeam !== -1}, targets=${iTargets !== -1}. ` +
      `Possible upstream CSV format change.`
    );
  }
  if (iType === -1) {
    throw new Error(
      `[nflverse] aggregateAdvReceiving: required columns missing — season_type=false. ` +
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
    // REG-only: skip postseason rows before team-total accumulation, so playoff volume
    // leaves the denominators too, not just the player rows (advstats-grain-and-share.md §3.1).
    if (fields[iType]?.trim() !== 'REG') continue;

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

    // airYardsShare — magnitude-weighted average of per-team shares, weight = |airYards|
    // rather than airYards itself (advstats-grain-and-share.md §2.2/§3.1). Weighting by the
    // signed value squares it into a non-negative numerator against a signed denominator
    // (Σaₜ), which explodes near cancellation (small |Σaₜ|, large Σaₜ²/dₜ) — e.g. a player
    // split +50/−49 across two teams. Weighting by |airYards| with its own magnitude
    // denominator (Σ|aₜ|) cannot cancel, so the explosion is gone by construction; for a
    // single-team player with aₜ ≥ 0 it reduces to the original a/d exactly (no regression).
    // Negative results are still emitted for RBs (behind-LOS targets → net-negative air yards).
    let airNumer = 0, airDenom = 0, airOk = true;
    for (const [team, pTeam] of teamEntries) {
      const denomAir = airRestricted[team];
      if (pTeam.airYards !== 0 && denomAir <= 0) { airOk = false; break; }
      if (denomAir <= 0) continue; // player also had 0 air yards on this team
      airNumer += (pTeam.airYards / denomAir) * Math.abs(pTeam.airYards);
      airDenom += Math.abs(pTeam.airYards);
    }
    const airYardsShare = (airOk && airDenom > 0)
      ? Math.round(airNumer / airDenom * 1000) / 1000
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

// ─── Per-game player stats (gamelogs) ────────────────────────────────────────
// Source: stats_player_week_<year>.csv (same as advstats — reuses fetchPlayerStatsCsv).
// Scope: QB/RB/WR/TE/FB (offensive skill positions). def_*/ST/kicking out of scope.
// Per-game grain: one games[] element per row. Honest nulls via omit-on-null.
// Per-game RATE fields (targetShare, wopr, etc.) are stored verbatim — never sum them.
// fantasyPoints* are nflverse default scoring — NOT Sleeper/app scoring; never feed grading.

const GAMELOG_STAT_COLS = {
  completions: 'completions', attempts: 'attempts', passing_yards: 'passingYards',
  passing_tds: 'passingTds', passing_interceptions: 'passingInterceptions',
  sacks_suffered: 'sacksSuffered', sack_yards_lost: 'sackYardsLost',
  sack_fumbles: 'sackFumbles', sack_fumbles_lost: 'sackFumblesLost',
  passing_air_yards: 'passingAirYards', passing_yards_after_catch: 'passingYardsAfterCatch',
  passing_first_downs: 'passingFirstDowns', passing_epa: 'passingEpa',
  passing_cpoe: 'passingCpoe', passing_2pt_conversions: 'passing2ptConversions', pacr: 'pacr',
  carries: 'carries', rushing_yards: 'rushingYards', rushing_tds: 'rushingTds',
  rushing_fumbles: 'rushingFumbles', rushing_fumbles_lost: 'rushingFumblesLost',
  rushing_first_downs: 'rushingFirstDowns', rushing_epa: 'rushingEpa',
  rushing_2pt_conversions: 'rushing2ptConversions',
  receptions: 'receptions', targets: 'targets', receiving_yards: 'receivingYards',
  receiving_tds: 'receivingTds', receiving_fumbles: 'receivingFumbles',
  receiving_fumbles_lost: 'receivingFumblesLost', receiving_air_yards: 'receivingAirYards',
  receiving_yards_after_catch: 'receivingYardsAfterCatch',
  receiving_first_downs: 'receivingFirstDowns', receiving_epa: 'receivingEpa',
  receiving_2pt_conversions: 'receiving2ptConversions', racr: 'racr',
  target_share: 'targetShare', air_yards_share: 'airYardsShare', wopr: 'wopr',
  fantasy_points: 'fantasyPoints', fantasy_points_ppr: 'fantasyPointsPpr',
};

/**
 * Parse stats_player_week_<year>.csv into per-game logs grouped by gsis id.
 * Offensive positions only (default QB/RB/WR/TE/FB). One games[] element per row.
 * Honest nulls: each stat cell → numOrNull; null-valued keys are OMITTED (empty-vs-zero rule).
 * Throws if required columns missing (fail-loud on upstream format change).
 *
 * @param {string} csv
 * @param {{positions?: string[]}} [opts]
 * @returns {{ byGsis: Record<string, {gsisId,name,position,games:object[]}>,
 *             season: number|null, rowCount: number }}  rowCount = total game rows
 */
export function parsePlayerGameLogs(csv, { positions = ['QB', 'RB', 'WR', 'TE', 'FB'] } = {}) {
  const lines = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .split('\n')
    .filter(l => l.trim());

  if (lines.length < 2) return { byGsis: {}, season: null, rowCount: 0 };

  const header = splitCsvLine(lines[0]);
  const iGsis   = header.indexOf('player_id');
  const iPos    = header.indexOf('position');
  const iSeason = header.indexOf('season');
  const iWeek   = header.indexOf('week');

  if (iGsis === -1 || iPos === -1 || iSeason === -1 || iWeek === -1) {
    const cols = { player_id: iGsis, position: iPos, season: iSeason, week: iWeek };
    const missing = Object.entries(cols).filter(([, v]) => v === -1).map(([k]) => k);
    throw new Error(
      `[nflverse] parsePlayerGameLogs: required columns missing — ${missing.join(', ')}. ` +
      'Possible upstream CSV format change.'
    );
  }

  const iSeasonType = header.indexOf('season_type');
  const iTeam       = header.indexOf('team');
  const iOpponent   = header.indexOf('opponent_team');
  const iName       = header.indexOf('player_display_name');

  // Resolve stat column indexes once; skip columns absent from header gracefully
  const statColMap = [];
  for (const [src, dst] of Object.entries(GAMELOG_STAT_COLS)) {
    const idx = header.indexOf(src);
    if (idx !== -1) statColMap.push({ dst, idx });
  }

  const posSet = new Set(positions);
  const byGsis = {};
  let season = null;

  for (let i = 1; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i]);
    const gsis = fields[iGsis]?.trim() ?? '';
    if (!gsis) continue;

    const pos = fields[iPos]?.trim() ?? '';
    if (!posSet.has(pos)) continue;

    if (season === null) {
      const s = parseInt(fields[iSeason]?.trim(), 10);
      if (!isNaN(s)) season = s;
    }

    const weekVal = parseInt(fields[iWeek]?.trim(), 10);
    const game = {
      week:       isNaN(weekVal) ? null : weekVal,
      seasonType: (iSeasonType !== -1 ? fields[iSeasonType]?.trim() : null) || null,
      team:       (iTeam      !== -1 ? fields[iTeam]?.trim()      : null) || null,
      opponent:   (iOpponent  !== -1 ? fields[iOpponent]?.trim()  : null) || null,
    };

    for (const { dst, idx } of statColMap) {
      const v = numOrNull(fields[idx]);
      if (v !== null) game[dst] = v;
    }

    if (!byGsis[gsis]) byGsis[gsis] = { gsisId: gsis, name: null, position: null, games: [] };
    const p = byGsis[gsis];
    if (iName !== -1 && fields[iName]?.trim()) p.name     = fields[iName].trim();
    if (fields[iPos]?.trim())                  p.position = fields[iPos].trim();
    p.games.push(game);
  }

  const rowCount = Object.values(byGsis).reduce((s, p) => s + p.games.length, 0);
  return { byGsis, season, rowCount };
}

/**
 * Re-key gamelogs byGsis → sleeper_id via crosswalk .ids. Returns { players, unmapped }.
 * unmapped counts DISTINCT gsis ids with no mapping (whole player dropped).
 *
 * @param {object} byGsis        { [gsis_id]: {gsisId, name, position, games[]} }
 * @param {object} crosswalkIds  { [gsis_id]: { sleeperId, ... } }  from playerids.json `.ids`
 * @returns {{ players: object, unmapped: number }}
 */
export function rekeyGameLogsBySleeper(byGsis, crosswalkIds) {
  const players = {};
  let unmapped = 0;
  for (const [gsis, player] of Object.entries(byGsis)) {
    const sleeperId = crosswalkIds[gsis]?.sleeperId;
    if (!sleeperId) {
      unmapped++;
      continue;
    }
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

// ─── Team context (pbp-derived team/game context) ────────────────────────────
// Source: play_by_play_<year>.csv.gz (nflverse pbp release; fetchPbpCsv above).
// Derived features only — PROE, pace, red-zone tendencies, defense-faced, game script.
// Team-week grain: one row per (team, gameId); each game emits an offense-view row
// (posteam) and a defense-view row (defteam) sharing the same underlying plays.
// C4 discipline: every rate is stored alongside its raw components; season figures
// are consumer-side recomputations from summed components (README §teamcontext),
// never averaged/summed per-game rates.

const TEAMCONTEXT_REQUIRED_COLS = [
  'game_id', 'season', 'week', 'season_type', 'posteam', 'defteam', 'home_team', 'away_team',
  'pass', 'rush', 'play_type', 'two_point_attempt', 'xpass', 'epa', 'success', 'wp', 'qtr',
  'half_seconds_remaining', 'game_seconds_remaining', 'yardline_100', 'fixed_drive',
  'fixed_drive_result', 'total_home_score', 'total_away_score',
];

/**
 * Remap a pbp team column to the era-accurate abbr used by this repo's schedule /
 * season-totals join domain. pbp normalizes posteam/defteam/home_team/away_team to the
 * CURRENT franchise code in every season (verified: 2013 pbp shows LA/LAC/LV, never
 * STL/SD/OAK) — this is the INVERSE of the gamelogs per-season `team` decision, which
 * deliberately keeps the nflverse (current-franchise) domain. The two families have
 * different join targets (this pack joins to schedule/season-totals, which are
 * era-accurate) — do not "fix" one to match the other.
 * @param {string} abbr
 * @param {number} season
 * @returns {string}
 */
export function eraTeam(abbr, season) {
  if (abbr === 'LA'  && season <= 2015) return 'STL';
  if (abbr === 'LAC' && season <= 2016) return 'SD';
  if (abbr === 'LV'  && season <= 2019) return 'OAK';
  return abbr;
}

function round3(x) {
  return x == null ? null : Math.round(x * 1000) / 1000;
}

function newTeamGameAcc() {
  return {
    off: {
      plays: 0, passPlays: 0, rushPlays: 0,
      epaSum: 0, epaPlays: 0,
      passEpaSum: 0, passEpaPlays: 0,
      rushEpaSum: 0, rushEpaPlays: 0,
      successes: 0, successPlays: 0,
      proePlays: 0, proePassPlays: 0, proeXpassSum: 0,
      rzDrives: new Set(), rzPlays: 0, rzPassPlays: 0, rzRushPlays: 0,
      neutralSeconds: 0, neutralGaps: 0,
      pointsScored: null,
    },
    def: {
      plays: 0, passPlays: 0, rushPlays: 0,
      epaSum: 0, epaPlays: 0,
      passEpaSum: 0, passEpaPlays: 0,
      rushEpaSum: 0, rushEpaPlays: 0,
      successes: 0, successPlays: 0,
      rzDrives: new Set(),
      pointsAllowed: null,
    },
  };
}

/**
 * Derive the team-week context pack from a season's pbp CSV.
 * Pure function — fetch/validate/write live in the caller (scripts/update-teamcontext.mjs).
 *
 * Throws if required header columns are missing (fail-loud on upstream format change) or if
 * the CSV's own `season` column (first parsed row) contradicts `season` (wrong-asset guard —
 * eraTeam() correctness depends on the season being right; stronger than gamelogs' `parsed ??
 * season` fallback since a silent wrong-season adoption here would corrupt the era remap).
 *
 * Basis: a "scrimmage row" is posteam present AND (pass==1 OR rush==1). A "countable play" is
 * a scrimmage row that is not play_type=='no_play' and not two_point_attempt==1 — the
 * denominator for every feature below. Every numeric cell is honest-null (numOrNull): a null
 * cell never contributes to a numerator, denominator, or sum.
 *
 * @param {string} csv
 * @param {{season: number}} opts
 * @returns {{ teams: object, season: number, rowCount: number, teamCount: number }}
 */
export function aggregateTeamContext(csv, { season }) {
  const lines = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) return { teams: {}, season, rowCount: 0, teamCount: 0 };

  const header = splitCsvLine(lines[0]);
  const idx = {};
  for (const col of TEAMCONTEXT_REQUIRED_COLS) idx[col] = header.indexOf(col);
  const missing = TEAMCONTEXT_REQUIRED_COLS.filter(col => idx[col] === -1);
  if (missing.length) {
    throw new Error(
      `[nflverse] aggregateTeamContext: required columns missing — ${missing.join(', ')}. ` +
      'Possible upstream CSV format change.'
    );
  }

  const acc          = new Map(); // `${team}|${gameId}` -> team-game accumulator
  const paceState     = new Map(); // `${gameId}|${posteam}|${fixedDrive}` -> { gsr, neutral, active }
  const driveResults = new Map(); // `${gameId}|${fixedDrive}` -> fixed_drive_result
  const gameScores   = new Map(); // gameId -> { homeTeam, awayTeam, homeScore, awayScore } (last write wins)

  function getEntry(team, gameId, week, seasonType, opponent) {
    const key = `${team}|${gameId}`;
    let e = acc.get(key);
    if (!e) {
      e = { team, gameId, week, seasonType, opponent, ...newTeamGameAcc() };
      acc.set(key, e);
    } else if (e.opponent == null && opponent != null) {
      e.opponent = opponent;
    }
    return e;
  }

  for (let i = 1; i < lines.length; i++) {
    const f = splitCsvLine(lines[i]);

    if (i === 1) {
      const rowSeason = parseInt(f[idx.season], 10);
      if (!isNaN(rowSeason) && rowSeason !== season) {
        throw new Error(
          `[nflverse] aggregateTeamContext: CSV season column (${rowSeason}) does not match ` +
          `requested season (${season}) — wrong asset; the era remap would be wrong.`
        );
      }
    }

    const gameId           = f[idx.game_id]?.trim() || null;
    if (!gameId) continue;

    const weekVal          = parseInt(f[idx.week], 10);
    const week              = isNaN(weekVal) ? null : weekVal;
    const seasonType        = f[idx.season_type]?.trim() || null;
    const posteamRaw        = f[idx.posteam]?.trim() || null;
    const defteamRaw        = f[idx.defteam]?.trim() || null;
    const homeTeamRaw       = f[idx.home_team]?.trim() || null;
    const awayTeamRaw       = f[idx.away_team]?.trim() || null;
    const passVal           = numOrNull(f[idx.pass]);
    const rushVal           = numOrNull(f[idx.rush]);
    const playType          = f[idx.play_type]?.trim() || null;
    const twoPointAttempt   = numOrNull(f[idx.two_point_attempt]);
    const xpass              = numOrNull(f[idx.xpass]);
    const epa                = numOrNull(f[idx.epa]);
    const success            = numOrNull(f[idx.success]);
    const wp                 = numOrNull(f[idx.wp]);
    const qtr                = numOrNull(f[idx.qtr]);
    const halfSecondsRemaining = numOrNull(f[idx.half_seconds_remaining]);
    const gameSecondsRemaining = numOrNull(f[idx.game_seconds_remaining]);
    const yardline100        = numOrNull(f[idx.yardline_100]);
    const fixedDrive          = f[idx.fixed_drive]?.trim() || null;
    const fixedDriveResult    = f[idx.fixed_drive_result]?.trim() || null;
    const totalHomeScore      = numOrNull(f[idx.total_home_score]);
    const totalAwayScore      = numOrNull(f[idx.total_away_score]);

    const posteam  = posteamRaw  ? eraTeam(posteamRaw, season)  : null;
    const defteam  = defteamRaw  ? eraTeam(defteamRaw, season)  : null;
    const homeTeam = homeTeamRaw ? eraTeam(homeTeamRaw, season) : null;
    const awayTeam = awayTeamRaw ? eraTeam(awayTeamRaw, season) : null;

    // Final score — every row carries the running total; the chronologically last row of the
    // game (last write, in CSV row order) holds the final score.
    if (homeTeam && awayTeam) {
      gameScores.set(gameId, { homeTeam, awayTeam, homeScore: totalHomeScore, awayScore: totalAwayScore });
    }

    // Drive outcome — 100% filled on scrimmage rows; stable within a drive (last write wins).
    if (fixedDrive != null && fixedDriveResult != null) {
      driveResults.set(`${gameId}|${fixedDrive}`, fixedDriveResult);
    }

    if (posteam) getEntry(posteam, gameId, week, seasonType, defteam);
    if (defteam) getEntry(defteam, gameId, week, seasonType, posteam);

    const isScrimmage = posteam != null && (passVal === 1 || rushVal === 1);
    const countable   = isScrimmage && playType !== 'no_play' && twoPointAttempt !== 1;

    // Pace chain — offense side only, keyed per (gameId, posteam, fixed_drive). Any intervening
    // non-countable row for this key (penalty no_play, timeout row, etc.) breaks the chain —
    // deliberate, so stoppage-contaminated gaps never enter.
    if (posteam && fixedDrive != null) {
      const paceKey = `${gameId}|${posteam}|${fixedDrive}`;
      const isNeutral = wp != null && wp >= 0.2 && wp <= 0.8 &&
        qtr != null && qtr <= 3 &&
        halfSecondsRemaining != null && halfSecondsRemaining > 120;

      if (countable && gameSecondsRemaining != null) {
        const prev = paceState.get(paceKey);
        if (prev && prev.active) {
          const gap = prev.gsr - gameSecondsRemaining;
          if (prev.neutral && isNeutral && gap >= 5 && gap <= 45) {
            const off = getEntry(posteam, gameId, week, seasonType, defteam).off;
            off.neutralSeconds += gap;
            off.neutralGaps += 1;
          }
        }
        paceState.set(paceKey, { gsr: gameSecondsRemaining, neutral: isNeutral, active: true });
      } else {
        const prev = paceState.get(paceKey);
        if (prev) prev.active = false;
      }
    }

    if (!countable) continue;

    const isPass = passVal === 1;
    const isRush = rushVal === 1;

    // Offense-side components
    {
      const off = getEntry(posteam, gameId, week, seasonType, defteam).off;
      off.plays += 1;
      if (isPass) off.passPlays += 1;
      if (isRush) off.rushPlays += 1;
      if (epa != null) {
        off.epaSum += epa; off.epaPlays += 1;
        if (isPass) { off.passEpaSum += epa; off.passEpaPlays += 1; }
        if (isRush) { off.rushEpaSum += epa; off.rushEpaPlays += 1; }
      }
      if (success != null) { off.successes += success; off.successPlays += 1; }
      if (xpass != null) {
        off.proePlays += 1;
        if (isPass) off.proePassPlays += 1;
        off.proeXpassSum += xpass;
      }
      if (yardline100 != null && yardline100 <= 20) {
        off.rzPlays += 1;
        if (isPass) off.rzPassPlays += 1;
        if (isRush) off.rzRushPlays += 1;
        if (fixedDrive != null) off.rzDrives.add(fixedDrive);
      }
    }

    // Defense-side components — same plays, attributed to the opponent's def block ("faced"/"allowed").
    if (defteam) {
      const def = getEntry(defteam, gameId, week, seasonType, posteam).def;
      def.plays += 1;
      if (isPass) def.passPlays += 1;
      if (isRush) def.rushPlays += 1;
      if (epa != null) {
        def.epaSum += epa; def.epaPlays += 1;
        if (isPass) { def.passEpaSum += epa; def.passEpaPlays += 1; }
        if (isRush) { def.rushEpaSum += epa; def.rushEpaPlays += 1; }
      }
      if (success != null) { def.successes += success; def.successPlays += 1; }
      if (yardline100 != null && yardline100 <= 20 && fixedDrive != null) {
        def.rzDrives.add(fixedDrive);
      }
    }
  }

  // Finalize: RZ trip TD/FG settle counts, final scores, rates (all computed once at emission).
  const teams = {};
  for (const e of acc.values()) {
    const { off, def } = e;

    let rzTdTrips = 0, rzFgTrips = 0;
    for (const drive of off.rzDrives) {
      const result = driveResults.get(`${e.gameId}|${drive}`);
      if (result === 'Touchdown') rzTdTrips += 1;
      else if (result === 'Field goal') rzFgTrips += 1;
    }

    let rzTdTripsAllowed = 0;
    for (const drive of def.rzDrives) {
      if (driveResults.get(`${e.gameId}|${drive}`) === 'Touchdown') rzTdTripsAllowed += 1;
    }

    const score = gameScores.get(e.gameId);
    let pointsScored = null, pointsAllowed = null;
    if (score && (e.team === score.homeTeam || e.team === score.awayTeam)) {
      const isHome = e.team === score.homeTeam;
      pointsScored  = isHome ? score.homeScore : score.awayScore;
      pointsAllowed = isHome ? score.awayScore : score.homeScore;
    }

    const row = {
      week: e.week,
      seasonType: e.seasonType,
      gameId: e.gameId,
      opponent: e.opponent,
      off: {
        plays: off.plays, passPlays: off.passPlays, rushPlays: off.rushPlays,
        passRate: off.plays ? round3(off.passPlays / off.plays) : null,
        epaSum: round3(off.epaSum), epaPlays: off.epaPlays,
        epaPerPlay: off.epaPlays ? round3(off.epaSum / off.epaPlays) : null,
        passEpaSum: round3(off.passEpaSum), passEpaPlays: off.passEpaPlays,
        passEpaPerPlay: off.passEpaPlays ? round3(off.passEpaSum / off.passEpaPlays) : null,
        rushEpaSum: round3(off.rushEpaSum), rushEpaPlays: off.rushEpaPlays,
        rushEpaPerPlay: off.rushEpaPlays ? round3(off.rushEpaSum / off.rushEpaPlays) : null,
        successes: off.successes, successPlays: off.successPlays,
        successRate: off.successPlays ? round3(off.successes / off.successPlays) : null,
        proePlays: off.proePlays, proePassPlays: off.proePassPlays,
        proeXpassSum: round3(off.proeXpassSum),
        proe: off.proePlays ? round3((off.proePassPlays - off.proeXpassSum) / off.proePlays) : null,
        rzTrips: off.rzDrives.size, rzPlays: off.rzPlays,
        rzPassPlays: off.rzPassPlays, rzRushPlays: off.rzRushPlays,
        rzPassRate: (off.rzPassPlays + off.rzRushPlays)
          ? round3(off.rzPassPlays / (off.rzPassPlays + off.rzRushPlays)) : null,
        rzTdTrips, rzFgTrips,
        neutralSeconds: off.neutralSeconds, neutralGaps: off.neutralGaps,
        neutralSecPerPlay: off.neutralGaps ? round3(off.neutralSeconds / off.neutralGaps) : null,
        pointsScored,
      },
      def: {
        plays: def.plays, passPlays: def.passPlays, rushPlays: def.rushPlays,
        epaSum: round3(def.epaSum), epaPlays: def.epaPlays,
        epaPerPlay: def.epaPlays ? round3(def.epaSum / def.epaPlays) : null,
        passEpaSum: round3(def.passEpaSum), passEpaPlays: def.passEpaPlays,
        passEpaPerPlay: def.passEpaPlays ? round3(def.passEpaSum / def.passEpaPlays) : null,
        rushEpaSum: round3(def.rushEpaSum), rushEpaPlays: def.rushEpaPlays,
        rushEpaPerPlay: def.rushEpaPlays ? round3(def.rushEpaSum / def.rushEpaPlays) : null,
        successes: def.successes, successPlays: def.successPlays,
        successRate: def.successPlays ? round3(def.successes / def.successPlays) : null,
        rzTripsAllowed: def.rzDrives.size, rzTdTripsAllowed,
        pointsAllowed,
      },
    };

    (teams[e.team] ??= { games: [] }).games.push(row);
  }

  for (const t of Object.values(teams)) t.games.sort((a, b) => a.week - b.week);
  const sortedTeams = {};
  for (const key of Object.keys(teams).sort()) sortedTeams[key] = teams[key];

  const rowCount  = Object.values(sortedTeams).reduce((s, t) => s + t.games.length, 0);
  const teamCount = Object.keys(sortedTeams).length;

  return { teams: sortedTeams, season, rowCount, teamCount };
}

// ─── OL composition (nflverse depth_charts, ESPN feed) ───────────────────────
// Source: depth_charts_<year>.csv (nflverse depth_charts release; fetchDepthChartsCsv above).
// ESPN dt-schema era only (2025+) — 2024 and earlier assets use a different legacy NFL-feed
// schema and are deliberately unparsed (MIN_OLINE_SEASON).

export const OLINE_SLOTS = ['LT', 'LG', 'C', 'RG', 'RT'];

const OLINE_REQUIRED_COLS = ['dt', 'team', 'player_name', 'espn_id', 'gsis_id', 'pos_abb', 'pos_rank'];

/**
 * ISO-8601 week key for a YYYY-MM-DD or ISO timestamp string, e.g. '2026-W29'. Pure.
 * @param {string} dateStr
 * @returns {string}
 */
export function isoWeekKey(dateStr) {
  const d = new Date(dateStr);
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7; // Mon=1..Sun=7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum); // Thursday of this ISO week
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/** Normalize a raw `dt` cell (space- or T-separated, with/without zone) to a canonical UTC ISO string (no ms). */
function normalizeDt(raw) {
  const trimmed = raw.trim();
  const iso = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  const withZone = /Z$|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`;
  const d = new Date(withZone);
  return { d, dt: isNaN(d.getTime()) ? null : d.toISOString().replace(/\.\d{3}Z$/, 'Z') };
}

/**
 * Parse depth_charts CSV (ESPN dt schema) → { teams, rowCount, teamCount, stateCount }.
 * - Header lookup BY NAME (drift-safe); hard-throws if any of OLINE_REQUIRED_COLS is missing
 *   (header-drift tripwire; also trips on a legacy-schema asset).
 * - Hard-throws if any row's dt year ∉ {season, season+1} (wrong-asset guard — mirrors
 *   aggregateTeamContext's season assertion; season is asserted, not adopted).
 * - Keeps rows with pos_abb ∈ OLINE_SLOTS (all ranks kept — starters and depth); buckets per
 *   (team, isoWeekKey(dt)); keeps only rows from the bucket's max dt (weekly reduction — the
 *   week's latest chart); states sorted ascending by dt, ol sorted slot-then-rank.
 * @param {string} csv
 * @param {{season: number}} opts
 * @returns {{ teams: object, rowCount: number, teamCount: number, stateCount: number }}
 */
export function aggregateOlineStates(csv, { season }) {
  const lines = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) return { teams: {}, rowCount: 0, teamCount: 0, stateCount: 0 };

  const header = splitCsvLine(lines[0]);
  const idx = {};
  for (const col of OLINE_REQUIRED_COLS) idx[col] = header.indexOf(col);
  const missing = OLINE_REQUIRED_COLS.filter(col => idx[col] === -1);
  if (missing.length) {
    throw new Error(
      `[nflverse] aggregateOlineStates: required columns missing — ${missing.join(', ')}. ` +
      'Possible upstream CSV format change (or a pre-2025 legacy-schema asset).'
    );
  }

  // bucketKey `${team}|${isoWeekKey}` -> { team, week, dtMs, date, dt, rows[] }
  const buckets = new Map();

  for (let i = 1; i < lines.length; i++) {
    const f = splitCsvLine(lines[i]);

    const team   = f[idx.team]?.trim() || null;
    const rawDt  = f[idx.dt];
    if (!team || !rawDt || !rawDt.trim()) continue;

    const { d, dt } = normalizeDt(rawDt);
    if (dt === null) continue;

    const dtYear = d.getUTCFullYear();
    if (dtYear !== season && dtYear !== season + 1) {
      throw new Error(
        `[nflverse] aggregateOlineStates: dt year (${dtYear}) outside {${season}, ${season + 1}} ` +
        `for requested season ${season} — wrong asset.`
      );
    }

    const posAbb = f[idx.pos_abb]?.trim() || null;
    if (!OLINE_SLOTS.includes(posAbb)) continue;

    const rankVal  = parseInt(f[idx.pos_rank], 10);
    const rank     = isNaN(rankVal) ? null : rankVal;
    const name     = f[idx.player_name]?.trim() || null;
    const espnIdRaw = f[idx.espn_id];
    const gsisIdRaw = f[idx.gsis_id];
    const espnId   = espnIdRaw != null && espnIdRaw.trim() !== '' ? espnIdRaw.trim() : null;
    const gsisId   = gsisIdRaw != null && gsisIdRaw.trim() !== '' ? gsisIdRaw.trim() : null;

    const weekKey   = isoWeekKey(dt);
    const bucketKey = `${team}|${weekKey}`;
    const dtMs      = d.getTime();

    let bucket = buckets.get(bucketKey);
    if (!bucket || dtMs > bucket.dtMs) {
      bucket = { team, week: weekKey, dtMs, date: dt.slice(0, 10), dt, rows: [] };
      buckets.set(bucketKey, bucket);
    }
    if (dtMs === bucket.dtMs) {
      bucket.rows.push({ slot: posAbb, rank, name, gsisId, espnId });
    }
  }

  const teams = {};
  for (const bucket of buckets.values()) {
    const ol = bucket.rows.slice().sort((a, b) => {
      const sa = OLINE_SLOTS.indexOf(a.slot), sb = OLINE_SLOTS.indexOf(b.slot);
      if (sa !== sb) return sa - sb;
      return (a.rank ?? 0) - (b.rank ?? 0);
    });
    (teams[bucket.team] ??= { states: [] }).states.push({
      week: bucket.week, date: bucket.date, dt: bucket.dt, ol,
    });
  }

  for (const t of Object.values(teams)) {
    t.states.sort((a, b) => (a.dt < b.dt ? -1 : a.dt > b.dt ? 1 : 0));
  }

  const sortedTeams = {};
  for (const key of Object.keys(teams).sort()) sortedTeams[key] = teams[key];

  const stateCount = Object.values(sortedTeams).reduce((s, t) => s + t.states.length, 0);
  const rowCount = Object.values(sortedTeams).reduce(
    (s, t) => s + t.states.reduce((s2, st) => s2 + st.ol.length, 0), 0
  );
  const teamCount = Object.keys(sortedTeams).length;

  return { teams: sortedTeams, rowCount, teamCount, stateCount };
}
