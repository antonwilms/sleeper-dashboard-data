/**
 * test-support/spy-deps.mjs — shared `deps` spy for the six season-keyed updaters' branch-
 * matrix nets (season-ingest-net.md §5 program; extracted in season-ingest-gamelogs.md §2.1).
 *
 * Lives outside test/ deliberately: Node's test runner auto-discovers every .mjs file under
 * any `test/` path segment (recursively) as its own runnable file, and a file with zero
 * `test()` calls still reports as one implicit passing "test" — so `test/helpers/spy-deps.mjs`
 * (the location named in the original plan) silently inflates `npm test`'s count by one. This
 * plan explicitly holds that count fixed as its verification signal, so the file moved here
 * instead; every test file below still imports it the same way, just from `../test-support/`.
 *
 * Every one of the six test files duplicated this — same three recorded calls
 * (writeJsonStable, updateManifestEntry, setStepOutput), same `readJson: () => null` default
 * — with no shared helper. This is that helper, plus console capture: `lib/seasonIngest.mjs`
 * emits every message via a direct `console.log` (or throw), and until now nothing asserted
 * any of that text — `spyDeps` recorded only the three keys above. `t.mock.method(console,
 * 'log', …)` is *method* mocking (not module mocking) and needs no experimental Node flag.
 *
 * Pass the test's `t` to get console capture into `logs`; omit it for tests that don't need
 * log assertions (the mock still auto-restores after the test either way, so passing it
 * unconditionally is harmless — omit only where it's clearly irrelevant, e.g. topology-only
 * assertions).
 *
 * The two families with an input-injection seam (advstats, gamelogs) keep their own local
 * `spyDeps` wrapper that builds a crosswalk-dispatching `readJson` and passes it through as
 * an override — that is the only difference between them and the other four's direct use of
 * this helper.
 *
 * @param {object} overrides  Deps to override (fetchers, readJson, etc).
 * @param {object} [t]        The test's context (`node:test`'s `TestContext`), for
 *   `t.mock.method(console, 'log', …)`. Omit to skip console capture.
 * @returns {{ deps: object, calls: object, logs: string[] }}
 */
export function spyDeps(overrides = {}, t) {
  const calls = { writeJsonStable: [], updateManifestEntry: [], setStepOutput: [] };
  const logs = [];
  if (t) {
    t.mock.method(console, 'log', (...args) => { logs.push(args.join(' ')); });
  }
  return {
    deps: {
      fetchCurrentNflSeason: async () => 2026,
      setStepOutput: (...args) => calls.setStepOutput.push(args),
      writeJsonStable: (...args) => calls.writeJsonStable.push(args),
      updateManifestEntry: (...args) => calls.updateManifestEntry.push(args),
      readJson: () => null,
      ...overrides,
    },
    calls,
    logs,
  };
}
