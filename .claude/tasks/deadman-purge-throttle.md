# deadman-purge-throttle — depth/oline/rosterweekly red since 10-03

Source: `../future_plans/in-season-notes-plan.md` § "Sign-off 2026-10-13 16:35", "deadman alert fatigue".
Session 1, 2026-10-13. Data `da67c04`.

## Finding

Deadman was right: depth (10-03, 10-10), oline (10-03, 10-10) and rosterweekly (10-10, 10-12, 10-13)
really failed. Data was committed and the family file verified fresh; the job died on
`cdn-purge: manifest.json not verified … throttled=true`. jsDelivr throttles purges per path
(`throttlingReset` ~1500 s seen) and every workflow shares `manifest.json`, so runs landing within
~an hour of another capture collide (depth/oline after playerstats/playerstate; rosterweekly after
season-totals). `runPhase` verified only paths whose purge succeeded, so a throttled path was never
checked, and its five immediate re-purges only burned the allowance. The CDN manifest was genuinely
stale on some edges (14:05 vs 14:24 local), and the app reads it. Depth's 09-12..09-26 reds were a
different cause (row-count validation), already past. Rosterweekly 10-10 also showed purges
"finished" while the CDN stayed stale for ~4 attempts.

## Change (scripts/purge-cdn.mjs, test/purge-cdn.test.mjs)

- `checkPurgeResponse` throttled result carries `throttled: true` and `resetMs`.
- `runPhase` verifies a throttled path anyway (fresh ⇒ verified); stale after all attempts still fails.
- 2 tests added (throttled+fresh, throttled+stale).
- A throttle wait (sit out `throttlingReset`, cap 60 min) was tried in 654b9d1 and REVERTED: the
  dispatched depth run waited 59 min, the next purge was "finished", and the CDN still served an old
  manifest.

## Finding 2 (2026-10-13 16:12 UTC)

jsDelivr's `@main/manifest.json` can stay stale for hours across edges (14:05 and 14:24 copies served
while 15:07 was pushed) regardless of purge success; query strings are ignored. Pinned-SHA URLs,
`raw.githubusercontent.com` and the no-ref `/gh/user/repo/manifest.json` path were fresh. Other data
files verify fresh first time. So the purge script cannot fix manifest staleness.

## Open

Decision (Anton): serve the manifest from a source that stays fresh, scoped to manifest.json only.
That is an app change (`src/api/dataStore.js` manifest URL) plus registry/two-session route; not
done here. Until then manifest.json verify failures keep the three captures red.

Resolved by `.claude/tasks/manifest-raw-source.md` (2026-10-15): the app reads the manifest from raw GitHub and no workflow purges it (CR-29).
