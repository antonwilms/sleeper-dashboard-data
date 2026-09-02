/**
 * lib/seasonIngest.mjs — shared per-season control-flow spine for the season-keyed ingest
 * families (season-ingest-net.md §10 program, slice 2: season-ingest-extract.md).
 *
 * Pure control flow: imports nothing from lib/nflverse.mjs, lib/validate.mjs, or any family
 * module — only `deps` and the callbacks a caller supplies. This is deliberate (§2.1): it has
 * no opinion about any family, so it stays reusable across the very different derive/validate/
 * hash/envelope shapes each one has.
 *
 * What this helper NEVER does, on purpose:
 *   - fetch anything — schedule fetches ONCE before the season loop and splits an already-
 *     parsed map in memory; gamelogs/teamcontext/oline fetch per season; roster/advstats are
 *     single-season. Three topologies. `derive(season)` already returns derived rows, so the
 *     helper is agnostic to which one produced them.
 *   - resolve which seasons to process — `--all` vs `--year` vs default differs per family.
 *   - call setStepOutput — placement and condition differ per family; pulling it in here would
 *     flatten a real divergence into a false uniformity.
 *
 * `inProgress: false` and `schemaVersion: 1` are hard-coded for the manifest entry (step 8) —
 * every family converted so far passes exactly those values, and `inProgress: false` is a
 * documented invariant (no app live fallback) for this whole family group. A future family
 * that needs otherwise takes a parameter then, not speculatively now.
 *
 * @param {object}   opts
 * @param {string}   opts.family              Log prefix only, e.g. 'schedule'.
 * @param {number[]} opts.seasons             Already-resolved season list (caller's job).
 * @param {number}   opts.currentSeason       For isPast = season < currentSeason.
 * @param {boolean}  opts.dryRun
 * @param {boolean}  opts.force
 * @param {object}   opts.deps                { readJson, writeJsonStable, updateManifestEntry }.
 * @param {(season: number) => string} opts.dataPath
 * @param {(season: number) => Promise<*>} opts.derive
 *   Already-derived rows for `season`, or null/empty (rowCount(derived) === 0) when not yet
 *   published upstream — both mean the same "not published" skip.
 * @param {(derived: *) => number} opts.rowCount
 * @param {number} opts.minRows
 * @param {string} opts.minRowsLabel           Count noun for both the sparsity-gate log and
 *   the dry-run plan log, e.g. 'games'. Schedule-shaped — see season-ingest-net.md §10.2; not
 *   expected to survive a family whose log needs more than one templated count.
 * @param {(derived: *, opts: { year: number }) => void} opts.validate  Throws on failure.
 * @param {(derived: *) => string} opts.hash
 * @param {(existing: *) => string|null} opts.existingHash
 * @param {(season: number, derived: *) => object} opts.envelope       Full data-file body.
 * @param {(derived: *) => number} opts.manifestRecordCount
 */
export async function runSeasonKeyedIngest({
  family,
  seasons,
  currentSeason,
  dryRun = false,
  force = false,
  deps,
  dataPath,
  derive,
  rowCount,
  minRows,
  minRowsLabel,
  validate,
  hash,
  existingHash,
  envelope,
  manifestRecordCount,
}) {
  for (const season of seasons) {
    const isPast = season < currentSeason;

    // 1. Not published — null or an empty derive is the same "nothing to do yet" case.
    const derived = await derive(season);
    const rc = derived === null ? 0 : rowCount(derived);
    if (derived === null || rc === 0) {
      console.log(`[${family}] season ${season} not published yet — skipping`);
      continue;
    }

    // 2. Sparsity gate
    if (rc < minRows) {
      console.log(
        `[${family}] season ${season} only ${rc} ${minRowsLabel} (< ${minRows}) — preliminary, skipping`
      );
      continue;
    }

    // 3. Validate (throws on format drift / wrong-asset mismatch → red CI)
    validate(derived, { year: season });

    const path = dataPath(season);
    const existing = deps.readJson(path);

    // 4. Content-hash dedup
    const newHash  = hash(derived);
    const lastHash = existingHash(existing);
    if (newHash === lastHash) {
      console.log(`[${family}] season ${season}: identical to ${path} — no change.`);
      continue;
    }

    // 5. Dry-run exit (before the force gate — the majority order; season-ingest-net.md §1.1
    // axis 3 pins roster's inversion of this deliberately, so this helper does not implement it)
    if (dryRun) {
      const needsForce = isPast && existing && !force;
      console.log(
        `[${family}] [dry-run] would write ${path}: ${rc} ${minRowsLabel}` +
        (needsForce ? ' (past season — needs --force to write for real)' : '')
      );
      continue;
    }

    // 6. Force gate: completed past seasons need --force to overwrite
    if (isPast && existing && !force) {
      throw new Error(`[${family}] ${path} exists for completed season ${season}. Use --force to overwrite.`);
    }

    // 7. Write data file
    deps.writeJsonStable(path, envelope(season, derived));

    // 8. Update manifest
    deps.updateManifestEntry({
      path,
      recordCount: manifestRecordCount(derived),
      inProgress: false,
      schemaVersion: 1,
    });

    // 9. Trailing success log — the one line the net cannot see (spyDeps captures no console
    // output). This is what an operator reads when the weekly Action misbehaves.
    console.log(`[${family}] Wrote ${path} (${rc} ${minRowsLabel}) + manifest`);
  }
}
