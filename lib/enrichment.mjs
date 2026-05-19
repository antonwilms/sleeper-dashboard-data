/**
 * lib/enrichment.mjs — Hand-curated enrichment overlay helpers.
 *
 * Provides read/write/validate/add/remove helpers for the four enrichment
 * types (coaching, scheme, injuries, notes).  Each type lives in a single
 * flat file at enrichment/<type>.json.
 *
 * ID format: <type-prefix>-<year>-<key>-<6hex>
 *   where key = team (coaching/scheme), playerId (injuries/notes with player),
 *               team (notes with team), and hex = sha1(JSON.stringify(rest))[0..6]
 *   This makes IDs deterministic: the same inputs always produce the same ID.
 *
 * Performance note on findAbsenceSegment / validateAll:
 *   Linear scan over entries is fine at current scale (<500 entries).
 *   If entry count grows past ~5000, build an index keyed by
 *   `${playerId}-${year}` instead.
 */

import crypto from 'crypto';
import { readJson, writeJsonStable } from './io.mjs';
import { readManifest, updateManifestEntry } from './manifest.mjs';

// ─── Constants ────────────────────────────────────────────────────────────────

export const NFL_TEAMS = [
  'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE',
  'DAL', 'DEN', 'DET', 'GB',  'HOU', 'IND', 'JAX', 'KC',
  'LAC', 'LAR', 'LV',  'MIA', 'MIN', 'NE',  'NO',  'NYG',
  'NYJ', 'PHI', 'PIT', 'SEA', 'SF',  'TB',  'TEN', 'WAS',
];

const ENRICHMENT_TYPES = ['coaching', 'scheme', 'injuries', 'notes'];

const COACHING_ROLES = ['HC', 'OC', 'DC'];

/** Repo-relative paths for each type. */
function enrichmentPath(type) {
  return `enrichment/${type}.json`;
}

// ─── Read / write ─────────────────────────────────────────────────────────────

/**
 * Reads an enrichment file for a given type.
 * Returns the parsed payload, or an empty wrapper if the file does not exist.
 *
 * @param {'coaching'|'scheme'|'injuries'|'notes'} type
 * @returns {{ schemaVersion: number, updatedAt: string, entries: object[] }}
 */
export function readEnrichment(type) {
  assertType(type);
  const existing = readJson(enrichmentPath(type));
  if (existing) return existing;
  return { schemaVersion: 1, updatedAt: new Date().toISOString(), entries: [] };
}

/**
 * Writes an enrichment payload and updates manifest.json.
 * Sets updatedAt to now before writing.
 *
 * @param {'coaching'|'scheme'|'injuries'|'notes'} type
 * @param {{ schemaVersion: number, entries: object[] }} payload
 */
export function writeEnrichment(type, payload) {
  assertType(type);
  const toWrite = {
    ...payload,
    updatedAt: new Date().toISOString(),
  };
  writeJsonStable(enrichmentPath(type), toWrite);
  updateManifestEntry({
    path: enrichmentPath(type),
    recordCount: toWrite.entries.length,
    inProgress: false,
    schemaVersion: 1,
  });
}

// ─── ID generation ────────────────────────────────────────────────────────────

/**
 * Generates a deterministic stable ID for an enrichment entry.
 *
 * Format: <prefix>-<year>-<key>-<6hex>
 *   where hex is sha1(JSON.stringify(rest of fields, sorted))[0..6]
 *
 * @param {'coaching'|'scheme'|'injuries'|'notes'} type
 * @param {object} fields  All fields for the entry (year, team/playerId, etc.)
 * @returns {string}
 */
export function generateId(type, fields) {
  assertType(type);

  const year = fields.year;
  let key;

  switch (type) {
    case 'coaching':
      key = `${fields.team}-${fields.role}`;
      break;
    case 'scheme':
      key = String(fields.team);
      break;
    case 'injuries':
      key = `${fields.playerId}-w${fields.segmentStartWeek}`;
      break;
    case 'notes':
      if (fields.playerId) key = String(fields.playerId);
      else if (fields.team) key = String(fields.team);
      else key = 'unknown';
      break;
  }

  // Exclude id itself from hash; sort keys for stability
  const { id: _id, ...rest } = fields;
  const sorted = Object.fromEntries(
    Object.entries(rest).sort(([a], [b]) => a.localeCompare(b))
  );
  const hash = crypto
    .createHash('sha1')
    .update(JSON.stringify(sorted))
    .digest('hex')
    .slice(0, 6);

  const prefix = type === 'coaching' ? 'coach' :
                 type === 'scheme'   ? 'scheme' :
                 type === 'injuries' ? 'inj' : 'note';

  if (year != null) {
    return `${prefix}-${year}-${key}-${hash}`;
  }
  return `${prefix}-${key}-${hash}`;
}

// ─── Segment lookup ───────────────────────────────────────────────────────────

/**
 * Loads absence segments for a player/year from nfl/season-totals/<year>.json.
 * Returns an array of { start, end, length } objects, or null if not found.
 *
 * @param {string} playerId
 * @param {number} year
 * @returns {Array<{start:number,end:number,length:number}>|null}
 */
export function loadAbsenceSegments(playerId, year) {
  const totals = readJson(`nfl/season-totals/${year}.json`);
  if (!totals) return null;
  const p = totals[playerId];
  if (!p) return null;
  return p.availability?.absenceSegments ?? [];
}

// ─── Per-type field validation ────────────────────────────────────────────────

/**
 * Validates a single entry for the given type.
 * Throws with a descriptive message if required fields are missing or invalid.
 *
 * @param {'coaching'|'scheme'|'injuries'|'notes'} type
 * @param {object} entry
 * @param {{ playerMap?: object, careerStats?: object }} context  Optional validation context
 */
export function validateEntry(type, entry, context = {}) {
  const { playerMap } = context;

  if (!entry || typeof entry !== 'object') {
    throw new Error(`[enrichment] Entry must be an object (got ${typeof entry})`);
  }
  if (!entry.id || typeof entry.id !== 'string') {
    throw new Error(`[enrichment] Entry missing required field: id`);
  }

  switch (type) {
    case 'coaching': {
      requireFields(entry, ['year', 'team', 'role', 'name']);
      assertValidTeam(entry.team);
      assertValidYear(entry.year);
      if (!COACHING_ROLES.includes(entry.role)) {
        throw new Error(
          `[enrichment] coaching: role must be one of ${COACHING_ROLES.join(', ')} (got "${entry.role}")`
        );
      }
      break;
    }
    case 'scheme': {
      requireFields(entry, ['year', 'team']);
      assertValidTeam(entry.team);
      assertValidYear(entry.year);
      const hasContent = entry.offense || entry.defense || entry.tempo;
      if (!hasContent) {
        throw new Error(
          '[enrichment] scheme: at least one of offense / defense / tempo must be set'
        );
      }
      break;
    }
    case 'injuries': {
      requireFields(entry, ['playerId', 'year', 'segmentStartWeek']);
      assertValidYear(entry.year);
      if (playerMap && !playerMap[entry.playerId]) {
        throw new Error(
          `[enrichment] injuries: playerId "${entry.playerId}" not found in player map`
        );
      }
      // Validate segment exists in season-totals
      const segments = loadAbsenceSegments(String(entry.playerId), entry.year);
      if (segments === null) {
        throw new Error(
          `[enrichment] injuries: no season-totals data found for player ${entry.playerId} in ${entry.year}`
        );
      }
      const hasSegment = segments.some(s => s.start === entry.segmentStartWeek);
      if (!hasSegment) {
        throw new Error(
          `[enrichment] injuries: no absence segment starting at week ${entry.segmentStartWeek} ` +
          `for player ${entry.playerId} in ${entry.year}. ` +
          `Available segments: ${segments.length > 0 ? segments.map(s => `w${s.start}`).join(', ') : 'none'}`
        );
      }
      break;
    }
    case 'notes': {
      requireFields(entry, ['body']);
      const hasPlayer = entry.playerId != null;
      const hasTeam = entry.team != null;
      if (hasPlayer && hasTeam) {
        throw new Error('[enrichment] notes: must set exactly one of playerId / team, not both');
      }
      if (!hasPlayer && !hasTeam) {
        throw new Error('[enrichment] notes: must set exactly one of playerId / team');
      }
      if (hasTeam) assertValidTeam(entry.team);
      if (playerMap && hasPlayer && !playerMap[entry.playerId]) {
        throw new Error(
          `[enrichment] notes: playerId "${entry.playerId}" not found in player map`
        );
      }
      if (entry.year != null) assertValidYear(entry.year);
      if (!entry.body || typeof entry.body !== 'string' || entry.body.trim() === '') {
        throw new Error('[enrichment] notes: body must be a non-empty string');
      }
      break;
    }
  }
}

// ─── validateAll ─────────────────────────────────────────────────────────────

/**
 * Validates all four enrichment files.
 * Throws on the first failure with a descriptive message.
 *
 * @param {{ playerMap?: object, careerStats?: object }} context
 */
export function validateAll(context = {}) {
  for (const type of ENRICHMENT_TYPES) {
    const payload = readEnrichment(type);

    // Top-level shape
    if (typeof payload.schemaVersion !== 'number') {
      throw new Error(`[enrichment] ${type}: missing schemaVersion`);
    }
    if (!Array.isArray(payload.entries)) {
      throw new Error(`[enrichment] ${type}: entries must be an array`);
    }

    // Duplicate IDs
    const ids = new Set();
    for (const entry of payload.entries) {
      if (ids.has(entry.id)) {
        throw new Error(`[enrichment] ${type}: duplicate id "${entry.id}"`);
      }
      ids.add(entry.id);
    }

    // Per-type uniqueness constraints
    if (type === 'coaching') {
      const keys = new Set();
      for (const e of payload.entries) {
        const k = `${e.year}-${e.team}-${e.role}`;
        if (keys.has(k)) {
          throw new Error(`[enrichment] coaching: duplicate (year, team, role) triple: ${k}`);
        }
        keys.add(k);
      }
    }
    if (type === 'scheme') {
      const keys = new Set();
      for (const e of payload.entries) {
        const k = `${e.year}-${e.team}`;
        if (keys.has(k)) {
          throw new Error(`[enrichment] scheme: duplicate (year, team) pair: ${k}`);
        }
        keys.add(k);
      }
    }

    // Per-entry validation
    for (const entry of payload.entries) {
      validateEntry(type, entry, context);
    }

    console.log(`[enrichment] ${type}: ${payload.entries.length} entries — OK`);
  }
}

// ─── Natural-key extractors ───────────────────────────────────────────────────

/**
 * Returns a string key identifying the entry's natural uniqueness slot.
 * Used by addEntry to detect "same natural key, different content" conflicts
 * (e.g. updating a coach's name means same year/team/role but different hash).
 */
function naturalKey(type, entry) {
  switch (type) {
    case 'coaching':  return `${entry.year}|${entry.team}|${entry.role}`;
    case 'scheme':    return `${entry.year}|${entry.team}`;
    case 'injuries':  return `${entry.playerId}|${entry.year}|${entry.segmentStartWeek}`;
    case 'notes':
      // Notes don't enforce a strict uniqueness key — allow multiples with same player/year.
      // Use the generated ID as the natural key so it falls through to ID-match only.
      return null;
  }
}

// ─── addEntry ─────────────────────────────────────────────────────────────────

/**
 * Upserts an enrichment entry.
 *
 * Behaviour:
 *   - Computes the deterministic ID from fields.
 *   - Checks for a natural-key match (year+team+role for coaching, etc.) to
 *     detect "same slot, different content" conflicts (e.g. name change).
 *   - If an exact ID match exists and fields are identical: no-op.
 *   - If a natural-key match exists but fields differ and force===false: exits 1 with diff.
 *   - If force===true or entry is new: writes.
 *
 * Validates the entry (including segment existence for injuries) before writing.
 *
 * @param {'coaching'|'scheme'|'injuries'|'notes'} type
 * @param {object} fields  Entry fields (id will be generated)
 * @param {{ force?: boolean, dryRun?: boolean, playerMap?: object }} opts
 * @returns {{ id: string, action: 'no-op'|'added'|'updated' }}
 */
export function addEntry(type, fields, { force = false, dryRun = false, playerMap } = {}) {
  assertType(type);

  const id = generateId(type, fields);
  const entry = { id, ...fields };

  // Validate before anything else
  validateEntry(type, entry, { playerMap });

  const payload = readEnrichment(type);

  // 1. Check natural-key match first (detects content-field changes)
  const nk = naturalKey(type, entry);
  const naturalIdx = nk != null
    ? payload.entries.findIndex(e => naturalKey(type, e) === nk)
    : -1;

  // 2. Fall back to ID match (covers notes and re-adds with identical fields)
  const idIdx = naturalIdx === -1
    ? payload.entries.findIndex(e => e.id === id)
    : naturalIdx;

  if (idIdx !== -1) {
    const existing = payload.entries[idIdx];
    const diff = computeEntryDiff(existing, entry);

    if (diff.identical) {
      console.log(`[enrichment] ${type}: no-op — identical entry already exists (id: ${existing.id})`);
      return { id: existing.id, action: 'no-op' };
    }

    if (!force) {
      console.error(`[enrichment] ${type}: entry ${existing.id} already exists with different fields:\n${diff.text}`);
      console.error('Pass --force to overwrite.');
      process.exit(1);
    }

    if (dryRun) {
      console.log(`[enrichment] [dry-run] ${type}: would update entry ${existing.id}\n${diff.text}`);
      return { id, action: 'updated' };
    }

    // Update in-place; replace with new entry (new ID if content changed)
    payload.entries[idIdx] = entry;
    console.log(`[enrichment] ${type}: updated entry ${existing.id} → ${id}\n${diff.text}`);
  } else {
    if (dryRun) {
      console.log(`[enrichment] [dry-run] ${type}: would add entry ${id}`);
      return { id, action: 'added' };
    }

    payload.entries.push(entry);
    console.log(`[enrichment] ${type}: added entry ${id}`);
  }

  writeEnrichment(type, payload);
  return { id, action: idIdx !== -1 ? 'updated' : 'added' };
}

// ─── removeEntry ──────────────────────────────────────────────────────────────

/**
 * Removes an entry by ID, scanning all four types.
 * Prints which type it was removed from and the entry that was removed.
 * Exits 1 if not found.
 *
 * @param {string} id
 * @param {{ dryRun?: boolean }} opts
 */
export function removeEntry(id, { dryRun = false } = {}) {
  if (!id) {
    console.error('[enrichment] remove: id is required');
    process.exit(2);
  }

  for (const type of ENRICHMENT_TYPES) {
    const payload = readEnrichment(type);
    const idx = payload.entries.findIndex(e => e.id === id);
    if (idx === -1) continue;

    const removed = payload.entries[idx];
    if (dryRun) {
      console.log(`[enrichment] [dry-run] would remove from ${type}: ${JSON.stringify(removed, null, 2)}`);
      return;
    }

    payload.entries.splice(idx, 1);
    writeEnrichment(type, payload);
    console.log(`[enrichment] removed from ${type}: ${JSON.stringify(removed, null, 2)}`);
    return;
  }

  console.error(`[enrichment] remove: id "${id}" not found in any enrichment file`);
  process.exit(1);
}

// ─── listEntries ──────────────────────────────────────────────────────────────

/**
 * Lists entries for a given type, optionally filtered by year.
 *
 * @param {'coaching'|'scheme'|'injuries'|'notes'} type
 * @param {{ year?: number }} opts
 */
export function listEntries(type, { year } = {}) {
  assertType(type);
  const payload = readEnrichment(type);
  let entries = payload.entries;
  if (year != null) entries = entries.filter(e => e.year === year);

  if (entries.length === 0) {
    console.log(`[enrichment] ${type}: no entries${year != null ? ` for year ${year}` : ''}`);
    return;
  }

  console.log(`[enrichment] ${type}: ${entries.length} entries${year != null ? ` for year ${year}` : ''}:`);
  for (const e of entries) {
    console.log(JSON.stringify(e));
  }
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function assertType(type) {
  if (!ENRICHMENT_TYPES.includes(type)) {
    throw new Error(`[enrichment] unknown type "${type}". Must be one of: ${ENRICHMENT_TYPES.join(', ')}`);
  }
}

function assertValidTeam(team) {
  if (!NFL_TEAMS.includes(team)) {
    throw new Error(
      `[enrichment] invalid NFL team abbreviation: "${team}". Valid: ${NFL_TEAMS.join(', ')}`
    );
  }
}

const MIN_YEAR = 2012;

function assertValidYear(year) {
  const current = new Date().getFullYear();
  if (!Number.isInteger(year) || year < MIN_YEAR || year > current + 1) {
    throw new Error(
      `[enrichment] year must be an integer in [${MIN_YEAR}, ${current + 1}] (got ${year})`
    );
  }
}

function requireFields(entry, fields) {
  for (const f of fields) {
    if (entry[f] == null) {
      throw new Error(`[enrichment] missing required field: ${f}`);
    }
  }
}

function computeEntryDiff(existing, updated) {
  const allKeys = new Set([...Object.keys(existing), ...Object.keys(updated)]);
  const diffs = [];

  for (const key of [...allKeys].sort()) {
    const oval = existing[key];
    const nval = updated[key];
    if (JSON.stringify(oval) !== JSON.stringify(nval)) {
      diffs.push(`  ${key}: ${JSON.stringify(oval)} → ${JSON.stringify(nval)}`);
    }
  }

  if (diffs.length === 0) return { identical: true, text: '' };
  return { identical: false, text: diffs.join('\n') };
}
