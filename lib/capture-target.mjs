/**
 * lib/capture-target.mjs — where `scripts/capture-snapshot.mjs` writes the accepted snapshot.
 *
 * Pure and Playwright-free so it can be unit-tested (the script imports `playwright` and runs
 * `main()` on import). Unset/empty `SNAPSHOT_OUT_PATH` is the daily workflow's path and must stay
 * byte-identical to the pre-existing behaviour; a set value is the D-76 C1 impact measurement's
 * out-of-tree capture.
 *
 * Out-of-repo check is lexical (path.relative segments). Symlinked directories and
 * case-folding filesystems are out of scope.
 */

import path from 'path'

/**
 * @param {{ env: Record<string, string|undefined>, repoRoot: string, dateKey: string }} args
 * @returns {{ mode: 'committed', relPath: string } | { mode: 'out', absPath: string }}
 */
export function resolveCaptureTarget({ env, repoRoot, dateKey }) {
  const out = env.SNAPSHOT_OUT_PATH
  if (out === undefined || out === '') {
    return { mode: 'committed', relPath: `snapshots/${dateKey}.json` }
  }
  if (!path.isAbsolute(out)) {
    throw new Error(`SNAPSHOT_OUT_PATH must be absolute (got "${out}")`)
  }
  const rel = path.relative(repoRoot, out)
  const outside = path.isAbsolute(rel) || rel === '..' || rel.startsWith('..' + path.sep)
  if (!outside) {
    throw new Error(`SNAPSHOT_OUT_PATH must resolve outside the repo working tree (got "${out}")`)
  }
  return { mode: 'out', absPath: out }
}

/**
 * Step outputs (`wrote`, `snapshotPath`) are emitted only on the daily-workflow path, i.e. when
 * `SNAPSHOT_OUT_PATH` is unset or empty. One predicate for every site in capture-snapshot.mjs.
 *
 * @param {Record<string, string|undefined>} env
 */
export function emitsStepOutputs(env) {
  return !env.SNAPSHOT_OUT_PATH
}

/**
 * Skip-if-committed: only a committed target whose file already exists.
 *
 * @param {ReturnType<typeof resolveCaptureTarget>} target
 * @param {(relPath: string) => boolean} exists
 */
export function shouldSkipCommitted(target, exists) {
  return target.mode === 'committed' && exists(target.relPath)
}

/**
 * Writes the accepted snapshot to the resolved target. `committed` reproduces the original
 * write block exactly (same call, same step outputs, same order); `out` writes at the absolute
 * path and sets no step outputs.
 *
 * @param {ReturnType<typeof resolveCaptureTarget>} target
 * @param {object} snapshot
 * @param {{ writeJsonStable: Function, writeJsonStableAt: Function, setStepOutput: Function }} deps
 */
export function writeCapturedSnapshot(target, snapshot, deps) {
  if (target.mode === 'committed') {
    deps.writeJsonStable(target.relPath, snapshot)
    deps.setStepOutput('wrote', 'true')
    deps.setStepOutput('snapshotPath', target.relPath)
    return
  }
  deps.writeJsonStableAt(target.absPath, snapshot)
}
