/**
 * lib/seasonIngest.mjs — shared per-season control-flow spine for the season-keyed ingest
 * families (season-ingest-net.md §10 program; slice 2 extracted it, slice 3
 * (season-ingest-teamcontext.md) moved log text out of the helper — see below).
 *
 * Pure control flow: imports nothing from lib/nflverse.mjs, lib/validate.mjs, or any family
 * module — only `deps` and the callbacks a caller supplies. This is deliberate (§2.1): it has
 * no opinion about any family, so it stays reusable across the very different derive/validate/
 * hash/envelope shapes each one has. It is also key-agnostic by construction (CR-10,
 * season-ingest-teamcontext.md §6) — it never inspects the derived value's shape, only counts
 * it via `rowCount` and hands it to the caller's own `hash`/`envelope`/`manifestRecordCount`/
 * `messages` callbacks. Keep it that way: no helper code may assume `players`, `sleeper_id`,
 * or any row identity.
 *
 * What this helper NEVER does, on purpose:
 *   - fetch anything — schedule fetches ONCE before the season loop and splits an already-
 *     parsed map in memory; gamelogs/teamcontext/oline fetch per season; roster/advstats are
 *     single-season. Three topologies. `derive(season)` already returns derived rows, so the
 *     helper is agnostic to which one produced them.
 *   - resolve which seasons to process — `--all` vs `--year` vs default differs per family.
 *   - call setStepOutput — placement and condition differ per family; pulling it in here would
 *     flatten a real divergence into a false uniformity.
 *   - own any log or throw TEXT — season-ingest-teamcontext.md §1.2 found that not one log
 *     line matches between schedule and teamcontext (different separators, nouns, prefixes,
 *     and even the force-gate throw's wording), plus a structural difference in when the
 *     success log fires relative to the manifest write. So every string is a caller-supplied
 *     `messages` builder (§2.1); the helper only decides WHEN each one fires, never WHAT it
 *     says. The preamble, fetch, and post-derive/post-validate logs that don't correspond to
 *     one of the helper's own branches live directly in the caller's `derive`/`validate`
 *     callbacks — they need no hook here.
 *
 * `inProgress: false` and `schemaVersion: 1` are hard-coded for the manifest entry (step 8) —
 * every family converted so far passes exactly those values, and `inProgress: false` is a
 * documented invariant (no app live fallback) for this whole family group. A future family
 * that needs otherwise takes a parameter then, not speculatively now.
 *
 * @param {object}   opts
 * @param {string}   opts.family              Log prefix only, e.g. 'schedule'. Also passed to
 *   every `messages` builder for convenience, though most families close over it instead.
 * @param {number[]} opts.seasons             Already-resolved season list (caller's job).
 * @param {number}   opts.currentSeason       For isPast = season < currentSeason.
 * @param {boolean}  opts.dryRun
 * @param {boolean}  opts.force
 * @param {object}   opts.deps                { readJson, writeJsonStable, updateManifestEntry }.
 * @param {(season: number) => string} opts.dataPath
 * @param {(season: number) => Promise<*>} opts.derive
 *   Already-derived rows for `season`, or null/empty (rowCount(derived) === 0) when not yet
 *   published upstream — both mean the same "not published" skip. Also where the caller's own
 *   preamble/fetch/"Derived …" logging lives (§2.1) — the helper never fetches.
 * @param {(derived: *) => number} opts.rowCount
 * @param {number} opts.minRows
 * @param {(derived: *, opts: { year: number }) => void} opts.validate  Throws on failure; also
 *   where the caller's own "Validation passed"-style logging lives.
 * @param {(derived: *) => string} opts.hash
 * @param {(existing: *) => string|null} opts.existingHash
 * @param {(season: number, derived: *) => object} opts.envelope       Full data-file body.
 * @param {(derived: *) => number} opts.manifestRecordCount
 * @param {object} opts.messages   The six/seven log-text builders this helper's own branches
 *   fire (season-ingest-teamcontext.md §2.1):
 *     notPublished(season) => string
 *     sparsity(season, rowCount) => string
 *     dedup(season, path) => string
 *     dryRun(season, path, derived, needsForce) => string
 *     forceGate(season, path) => string                      — the throw message
 *     afterWrite(season, path, derived) => string|null        — logged between write and
 *       manifest; null means "log nothing here" (e.g. schedule, which logs once after both)
 *     afterManifest(season, path, derived) => string|null     — logged after the manifest
 *       write; null means "log nothing here"
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
  validate,
  hash,
  existingHash,
  envelope,
  manifestRecordCount,
  messages,
}) {
  for (const season of seasons) {
    const isPast = season < currentSeason;

    // 1. Not published — null or an empty derive is the same "nothing to do yet" case.
    const derived = await derive(season);
    // `rc` is the PRE-VALIDATE gate count ONLY — it feeds the sparsity gate below and nothing
    // else. `manifestRecordCount(derived)` and `envelope(season, derived)` are called
    // separately, after `validate` (season-ingest-gamelogs.md §1.2/§2.3), and MUST recompute
    // from `derived` rather than reuse `rc`: oline's `validateOline` mutates `teams` in place
    // (rc is pre-drop, the manifest must carry the post-drop count), and gamelogs' `rc` is
    // `parsedRowCount` (pre-crosswalk) while its envelope `rowCount` is the post-crosswalk
    // total from `players` — a different number by design. Reusing `rc` for the manifest would
    // corrupt both families' recordCount silently and permanently, since both are append-only.
    // This is deliberately a comment, not a guard — for schedule and teamcontext the two counts
    // are legitimately equal, so an assertion that they differ would be wrong for those two.
    const rc = derived === null ? 0 : rowCount(derived);
    if (derived === null || rc === 0) {
      console.log(messages.notPublished(season));
      continue;
    }

    // 2. Sparsity gate
    if (rc < minRows) {
      console.log(messages.sparsity(season, rc));
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
      console.log(messages.dedup(season, path));
      continue;
    }

    // 5. Dry-run exit (before the force gate — the majority order; season-ingest-net.md §1.1
    // axis 3 pins roster's inversion of this deliberately, so this helper does not implement it)
    if (dryRun) {
      const needsForce = isPast && existing && !force;
      console.log(messages.dryRun(season, path, derived, needsForce));
      continue;
    }

    // 6. Force gate: completed past seasons need --force to overwrite
    if (isPast && existing && !force) {
      throw new Error(messages.forceGate(season, path));
    }

    // 7. Write data file
    deps.writeJsonStable(path, envelope(season, derived));

    // 7a. Optional log between write and manifest (teamcontext) — null logs nothing.
    const afterWriteMsg = messages.afterWrite(season, path, derived);
    if (afterWriteMsg) console.log(afterWriteMsg);

    // 8. Update manifest
    deps.updateManifestEntry({
      path,
      recordCount: manifestRecordCount(derived),
      inProgress: false,
      schemaVersion: 1,
    });

    // 8a. Optional log after the manifest write (schedule's single trailing success log lives
    // here; teamcontext's separate "Manifest updated" also lives here) — null logs nothing.
    const afterManifestMsg = messages.afterManifest(season, path, derived);
    if (afterManifestMsg) console.log(afterManifestMsg);
  }
}
