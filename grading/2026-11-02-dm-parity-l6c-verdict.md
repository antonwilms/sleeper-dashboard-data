# D-67 — DM parity on the short-season rule (`l6c`) — verdict (2026-11-02)

Plan: `.claude/tasks/d67-dm-parity-l6c.md`. Report-only; no constant, served file, manifest entry or mirror rule changed.

## Inputs

- Snapshot `snapshots/2026-10-30.json`: `capturedAt` 2026-10-30T20:58:36Z, `projectionModelFrom` 2026-10-28 (≥ boundary 10's 2026-10-23), schemaVersion 3.
- Season totals read at data `3b92712` (originally pinned as `297315f`, rewritten by a push-time rebase; identical season totals; carries the D-76 correction from `76b5ddf`); `nflverse/playerids.json` (positions) at `d36b184`, the last commit at or before the capture.
- Fixture `test/fixtures/durability-parity-2026-10-30.json`: 719,176 bytes, 433 veteran (non-rookie) rows, seasons 2012–2025. Snapshot `shortSeasonState`: qual 336, short 95, none 2.
- Comparable rows: 432 (1 non-skill LB row skipped; 0 without a qualifying season).

## DM-1 under `rule: 'l6c'`

**432/432 = 100%** (floor 99%). No mismatches. Mirror `shortSeasonState` equals the snapshot's on all 432 rows (0 state mismatches).

Contrast, same fixture, default `pre-l6c`: 336/432 = 77.8% (96 mismatches — exactly the short/none rows).

## DM-2 bounce-back

429/432 = 99.3% agreement (reported, not asserted; rule-independent).

## Boundary 8 cross-check (`grading/anchor-policy.md`)

**96/96 exact**: every `'short'`/`'none'` skill-position veteran row equals the mirror on `projectedGames`, `shortSeasonState` and `projectedGamesBase`.
By state/position: short QB 25, RB 19, WR 33, TE 17; none QB 1, WR 1 (the 97th short/none row is the non-skill LB, not compared).

## Conclusion

D-67 closed: the mirror's `l6c` rule reproduces the shipped short-season rule exactly on the first post-boundary-10 capture.
