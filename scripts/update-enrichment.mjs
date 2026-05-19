/**
 * scripts/update-enrichment.mjs — Enrichment overlay CLI logic.
 *
 * Implements add/remove/list/validate actions for all four enrichment types.
 * Called by bin/enrich.mjs with a parsed opts object.
 *
 * @param {object} opts
 * @param {string}   opts.type      'coaching'|'scheme'|'injuries'|'notes'|undefined
 * @param {string}   opts.action    'add'|'remove'|'list'|'validate'
 * @param {boolean}  opts.force     Overwrite existing entry with same id but different fields
 * @param {boolean}  opts.dryRun    Validate + print diff, no writes
 * @param {object}   opts.fields    Parsed entry fields from CLI flags
 */

import { readJson } from '../lib/io.mjs';
import {
  addEntry,
  removeEntry,
  listEntries,
  validateAll,
} from '../lib/enrichment.mjs';

export async function updateEnrichment({ type, action, force, dryRun, fields }) {
  switch (action) {
    case 'validate':
      return runValidate();

    case 'list':
      return runList({ type, fields });

    case 'remove':
      return runRemove({ fields, dryRun });

    case 'add':
      return runAdd({ type, fields, force, dryRun });

    default:
      console.error(`[enrichment] Unknown action: ${action}`);
      process.exit(2);
  }
}

// ─── validate ─────────────────────────────────────────────────────────────────

function runValidate() {
  // Load the player map for playerId resolution.
  // Failure to load is non-fatal: validateAll degrades gracefully to skipping
  // player-map checks (the CLI will warn but not block validation if the file
  // is absent — useful in CI environments that don't have raw/ cached).
  const playerMap = readJson('raw/-players-nfl.json');
  if (!playerMap) {
    console.warn('[enrichment] validate: raw/-players-nfl.json not found — skipping playerId checks');
  }

  validateAll({ playerMap: playerMap ?? {} });
  console.log('[enrichment] All files valid.');
}

// ─── list ─────────────────────────────────────────────────────────────────────

function runList({ type, fields }) {
  if (!type) {
    console.error('[enrichment] list requires a type: coaching | scheme | injuries | notes');
    process.exit(2);
  }
  listEntries(type, { year: fields.year });
}

// ─── remove ───────────────────────────────────────────────────────────────────

function runRemove({ fields, dryRun }) {
  const id = fields.id;
  if (!id) {
    console.error('[enrichment] remove requires --id <entry-id>');
    process.exit(2);
  }
  removeEntry(id, { dryRun });
}

// ─── add ──────────────────────────────────────────────────────────────────────

function runAdd({ type, fields, force, dryRun }) {
  if (!type) {
    console.error('[enrichment] add requires a type: coaching | scheme | injuries | notes');
    process.exit(2);
  }

  // Load player map for playerId resolution in injuries/notes
  const playerMap = readJson('raw/-players-nfl.json') ?? {};

  const entryFields = buildEntryFields(type, fields);
  addEntry(type, entryFields, { force, dryRun, playerMap });
}

/**
 * Maps parsed CLI flags to the entry fields shape expected by addEntry.
 * Omits undefined/null values to keep entries sparse.
 *
 * @param {string} type
 * @param {object} flags  Raw flag values from bin/enrich.mjs
 * @returns {object}
 */
function buildEntryFields(type, flags) {
  const f = (v) => v != null ? v : undefined;

  switch (type) {
    case 'coaching':
      return compact({
        year:         f(flags.year),
        team:         f(flags.team),
        role:         f(flags.role),
        name:         f(flags.name),
        tenureStart:  f(flags.tenureStart),
        isNew:        f(flags.isNew),
        predecessor:  f(flags.predecessor),
        source:       f(flags.source),
        notes:        f(flags.notes),
      });

    case 'scheme':
      return compact({
        year:            f(flags.year),
        team:            f(flags.team),
        offense:         f(flags.offense),
        defense:         f(flags.defense),
        tempo:           f(flags.tempo),
        changedFromPrev: f(flags.changedFromPrev),
        source:          f(flags.source),
        notes:           f(flags.notes),
      });

    case 'injuries':
      return compact({
        playerId:         String(flags.player),
        year:             f(flags.year),
        segmentStartWeek: f(flags.segmentStart),
        segmentEndWeek:   f(flags.segmentEnd),
        type:             f(flags.type),
        bodyPart:         f(flags.bodyPart),
        severity:         f(flags.severity),
        dateInjured:      f(flags.dateInjured),
        dateReturned:     f(flags.dateReturned),
        source:           f(flags.source),
        notes:            f(flags.notes),
      });

    case 'notes':
      return compact({
        playerId: flags.player ? String(flags.player) : undefined,
        team:     f(flags.team),
        year:     f(flags.year),
        tag:      f(flags.tag),
        body:     f(flags.body),
        source:   f(flags.source),
      });

    default:
      throw new Error(`[enrichment] Unknown type: ${type}`);
  }
}

/** Removes keys with undefined values. */
function compact(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  );
}
