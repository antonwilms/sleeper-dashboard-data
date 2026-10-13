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
- On a throttle with `throttlingReset`, sit the window out once per path (cap `THROTTLE_WAIT_CAP_MS`
  = 60 min) before the next purge instead of re-purging immediately.
- 3 tests added (throttled+fresh, throttled+stale, wait-then-repurge).

## Open

jsDelivr's limit is undocumented; the 60 min cap and wait-once rule are estimates. Watch the next
colliding run's `purge … throttled, waiting` log line.
