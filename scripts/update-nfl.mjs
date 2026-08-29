/**
 * scripts/update-nfl.mjs — Annual/weekly NFL season totals writer.
 *
 * Fetches all 18 regular-season weeks from Sleeper, aggregates into
 * per-player season totals, validates, and writes to
 * nfl/season-totals/<year>.json.
 *
 * Safe-by-default:
 *   - Preseason (no data yet): logs and exits cleanly, no throw (§2.2).
 *   - Completed season, scheduled path (no --force, no --dry-run): SKIPS — logs and exits
 *     cleanly, no write (§2.3). --force stays for a deliberate interactive correction.
 *   - Identical output: no-op (full SHA-256 content hash; no write, no manifest touch).
 *   - --dry-run: fetch + validate + print diff, no writes (works against a completed season
 *     too, without --force — the completed-season skip is scoped OUT of dry-run on purpose,
 *     see shouldSkipCompletedSeason).
 *
 * @param {object} opts
 * @param {number}  [opts.year]     NFL season year — defaults to the live season
 *                                  (fetchCurrentNflSeason()) when omitted, mirroring
 *                                  update-teamcontext.mjs / update-schedule.mjs.
 * @param {boolean} opts.force      Overwrite completed-season files
 * @param {boolean} opts.dryRun     Fetch/validate but don't write
 * @param {object}  [opts.deps]     Injectable I/O + fetch surface for tests — see DEFAULT_DEPS.
 */

import crypto from 'crypto';
import { fetchSeasonWeeks, aggregateWeeks, fetchCurrentNflSeason } from '../lib/sleeper.mjs';
import { readJson, writeJsonStable, diffSummary, setStepOutput } from '../lib/io.mjs';
import { updateManifestEntry, setManifestInProgress } from '../lib/manifest.mjs';
import { validateNflSeason } from '../lib/validate.mjs';

export function nflHash(players) {
  const sorted = Object.keys(players).sort();
  const stable = Object.fromEntries(sorted.map(k => [k, players[k]]));
  return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

// Injectable I/O + fetch surface — mirrors scripts/panel-run.mjs's DEFAULT_LOAD pattern, so the
// §2.2/§2.3 control-flow branches (in-season-season-totals.md) are unit-testable without
// touching the network or the real repo file tree.
export const DEFAULT_DEPS = {
  fetchCurrentNflSeason,
  fetchSeasonWeeks,
  readJson,
  writeJsonStable,
  updateManifestEntry,
  setManifestInProgress,
  diffSummary,
  setStepOutput,
};

// §2.2 — Sleeper returns 0 entries across all 18 weeks for a season that hasn't started yet
// (verified live for 2026 today). Pure, so it's directly unit-testable.
export function hasNoData(weekData) {
  return weekData.every(w => w.entries.length === 0);
}

// §2.3 — a completed season on the SCHEDULED path (no --force, no --dry-run) is a SKIP, not a
// write attempt. `inProgress` here must be the FRESHLY-computed value (year >= currentSeason via
// fetchCurrentNflSeason()), never the manifest's stored value — that staleness was the bug: the
// old refusal guard tested existingEntry.inProgress, which can still read true on the very first
// run after state.season rolls past `year`, letting the write proceed with the schedule read
// dropped (D-1 bye inference) and silently regressing the already-sealed file. --dry-run stays
// exempt so a completed season can still be previewed without --force (smoke's own use). Pure,
// so it's directly unit-testable.
export function shouldSkipCompletedSeason({ inProgress, force, dryRun }) {
  return !inProgress && !force && !dryRun;
}

export async function updateNfl({ year: yearOpt = null, force, dryRun, deps = {} } = {}) {
  const d = { ...DEFAULT_DEPS, ...deps };

  const currentSeason = await d.fetchCurrentNflSeason();
  // §2.4 — the nfl subcommand had no current-season default and threw `--year is required`
  // when omitted, unlike schedule/teamcontext. Resolve it here, the same way those two do.
  const year = yearOpt ?? currentSeason;
  // §2.4 — surfaces the resolved season to the Actions purge step, per Invariant 8. Called
  // unconditionally (even on a later skip/no-op) so the step output is always present — mirrors
  // update-teamcontext.mjs/update-roster.mjs, whose purge step is itself gated on there being a
  // git diff to commit, not on this output existing.
  d.setStepOutput('season', year);

  const inProgress = year >= currentSeason;
  console.log(`[nfl] Year: ${year} | inProgress: ${inProgress} | currentSeason: ${currentSeason}`);

  // §2.4 option (B) — the scheduled path never revisits a season once it rolls off `currentSeason`
  // (the skip below is unreachable from cron, since `year` always resolves to `currentSeason`), so
  // the season that just closed would otherwise keep `inProgress: true` forever. Seal it here, on
  // every normal scheduled run, immediately after rollover. No-ops on every other run (§2.2
  // contract 1/2: already false, or no entry yet). --dry-run stays exempt — this is not the
  // skip-path's structural exemption, so it needs its own guard.
  if (inProgress && !dryRun) {
    const sealed = d.setManifestInProgress({ path: `nfl/season-totals/${year - 1}.json`, inProgress: false });
    if (sealed) console.log(`[nfl] Sealed nfl/season-totals/${year - 1}.json (inProgress → false)`);
  }

  if (shouldSkipCompletedSeason({ inProgress, force, dryRun })) {
    const skipSealed = d.setManifestInProgress({ path: `nfl/season-totals/${year}.json`, inProgress: false });
    if (skipSealed) console.log(`[nfl] Sealed nfl/season-totals/${year}.json (inProgress → false)`);
    console.log(
      `[nfl] nfl/season-totals/${year}.json: ${year} is a completed season (currentSeason=${currentSeason}) — ` +
      'skipping on the scheduled path. Pass --force to overwrite deliberately.'
    );
    return;
  }

  const dataPath = `nfl/season-totals/${year}.json`;
  const existing = d.readJson(dataPath);

  // 1. Fetch 18 weeks from Sleeper
  const weekData = await d.fetchSeasonWeeks(year, { dryRun });

  // §2.2 — detect "no data yet" BEFORE validating: the <400-player floor would otherwise throw
  // on every run from merge until week 1 settles, turning a normal preseason state into a red job.
  if (hasNoData(weekData)) {
    console.log(`[nfl] No data yet for ${year} (0 entries across all 18 weeks) — season hasn't started. Exiting cleanly.`);
    return;
  }

  // 2. Aggregate into player totals. D-1 bye inference (lib/sleeper.mjs) is forward-only:
  // only thread the schedule in while this season is still in-progress. A completed season
  // re-aggregated later (dry-run or --force) must reproduce the once-migrated on-disk file
  // bit-for-bit, including its untouched 'X' history — passing the schedule there would
  // silently diverge the aggregation and break the nflHash skip.
  const schedule = inProgress ? d.readJson(`nflverse/schedule/${year}.json`) : null;
  const totals = aggregateWeeks(weekData, schedule?.games ?? null);
  console.log(`[nfl] Aggregated: ${Object.keys(totals).length} players`);

  // 3. Validate (throws on failure → non-zero exit → red CI)
  validateNflSeason(totals, { year });
  console.log('[nfl] Validation passed');

  // 4. Idempotency / dry-run checks
  if (existing) {
    if (nflHash(totals) === nflHash(existing)) {
      console.log(`[nfl] No change for ${dataPath} — skipping write.`);
      return;
    }

    // Show diff summary for human-readable info (points-neutral changes still detected above)
    const summary = d.diffSummary(existing, totals);
    console.log(`[nfl] Diff vs existing:\n${summary.text}`);

    // Dry-run: show what we would do and exit cleanly (bypass force requirement)
    if (dryRun) {
      console.log(`[nfl] [dry-run] would write ${dataPath}: ${Object.keys(totals).length} players`);
      return;
    }
  }

  // 5. Dry-run exit (no existing file case)
  if (dryRun) {
    console.log(`[nfl] [dry-run] would write ${dataPath}: ${Object.keys(totals).length} players`);
    return;
  }

  // 6. Write (minified — F-24; nfl/season-totals/ only, manifest.json stays pretty-printed)
  d.writeJsonStable(dataPath, totals, { minify: true });
  console.log(`[nfl] Wrote ${dataPath} (${Object.keys(totals).length} players)`);

  // 7. Update manifest (F-24: schemaVersion 4 — idp_*/punt* pruned from stats)
  d.updateManifestEntry({
    path: dataPath,
    recordCount: Object.keys(totals).length,
    inProgress,
    schemaVersion: 4,
  });
  console.log(`[nfl] Manifest updated (inProgress=${inProgress})`);
}
