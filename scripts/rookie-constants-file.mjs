/**
 * scripts/rookie-constants-file.mjs — reads the league rookie-constants file (D-45 §4.5,
 * `backtests/<date>-rookie-league-constants.json`) into what the harnesses pass to
 * `reconstructShippedRookieProjection` / `prospectPriorPPG` (the `league-refit` constants model, A2).
 *
 * The file records `families.{F1…F5} = { verdict, constants, provenance }` for EVERY family; only a family whose
 * `verdict` is `wire` is read — an unwired family's constants are recorded, never used (as the app would do). The
 * constants keys per family: F1 `{ baselinePPG, calibration }`, F2 `{ ceiling }`, F3 `{ qbStarterPPG }`,
 * F4 `{ totalFactor }`, F5 `{ positionPriorPPG, wirePositions }` (only the decided positions are read).
 *
 * Pure parsing is `wiredConstantsOf`; `loadRookieConstants` adds the file read and the `<path> @ <sha1>` reference
 * recorded under `basisDetail.rookieConstants`. Reached from the harness scripts only (never from `bin/panel.mjs`'s closure).
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const FAMILY_KEYS = Object.freeze({
  F1: ['baselinePPG', 'calibration'], F2: ['ceiling'], F3: ['qbStarterPPG'], F4: ['totalFactor'],
});

/**
 * file → { rookieConstantsModel: 'league-refit', leagueConstants, positionPriorPPG, wiredFamilies }.
 * `leagueConstants` carries the keys of the wired F1–F4; `positionPriorPPG` is `{ <pos>: league prior }` for F5's decided
 * positions, or null. Throws on a malformed file or a wired family missing a constants key.
 */
export function wiredConstantsOf(file) {
  if (file == null || typeof file !== 'object' || file.basis !== 'league') {
    throw new Error(`[rookie-constants] expected a league constants file (top-level basis 'league'), got basis '${file?.basis}'`);
  }
  const families = file.families;
  if (families == null || typeof families !== 'object') throw new Error('[rookie-constants] the file has no families');
  const leagueConstants = {};
  const wiredFamilies = [];
  let positionPriorPPG = null;
  for (const f of ['F1', 'F2', 'F3', 'F4', 'F5']) {
    const fam = families[f];
    if (fam == null || typeof fam !== 'object') throw new Error(`[rookie-constants] families.${f} is absent`);
    if (fam.verdict !== 'wire') continue;
    wiredFamilies.push(f);
    const c = fam.constants;
    if (f === 'F5') {
      const positions = c?.wirePositions;
      if (!Array.isArray(positions) || positions.length === 0 || c?.positionPriorPPG == null) {
        throw new Error('[rookie-constants] a wired F5 needs constants.positionPriorPPG and a non-empty constants.wirePositions');
      }
      positionPriorPPG = {};
      for (const pos of positions) {
        if (!Number.isFinite(c.positionPriorPPG[pos])) throw new Error(`[rookie-constants] F5 positionPriorPPG.${pos} is not a number`);
        positionPriorPPG[pos] = c.positionPriorPPG[pos];
      }
      continue;
    }
    for (const key of FAMILY_KEYS[f]) {
      if (c?.[key] == null) throw new Error(`[rookie-constants] a wired ${f} needs constants.${key}`);
      leagueConstants[key] = c[key];
    }
  }
  return { rookieConstantsModel: 'league-refit', leagueConstants, positionPriorPPG, wiredFamilies };
}

/** Reads `pathArg` (absolute or cwd-relative) → `wiredConstantsOf` plus `ref` = `<path> @ <sha1 of the file bytes>`. */
export function loadRookieConstants(pathArg) {
  const abs = path.resolve(pathArg);
  const bytes = fs.readFileSync(abs);
  const sha1 = crypto.createHash('sha1').update(bytes).digest('hex');
  return { ...wiredConstantsOf(JSON.parse(bytes.toString('utf8'))), ref: `${pathArg} @ ${sha1}` };
}

/** The pair of arguments the harness hands the mirror: `{ rookieConstantsModel, leagueConstants }` (or `{}` for none). */
export function mirrorArgsOf(rc) {
  return rc ? { rookieConstantsModel: rc.rookieConstantsModel, leagueConstants: rc.leagueConstants } : {};
}
