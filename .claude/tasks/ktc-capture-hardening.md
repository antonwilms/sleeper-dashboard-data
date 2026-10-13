# KTC capture hardening — the lost 10-05 snapshot and the sentinel guard

**Source:** `future_plans/in-season-notes-plan.md`, sign-off 2026-10-13 13:30, "Found while checking" items 1–2.
**Mode:** planned and implemented in one session at Anton's request (2026-10-13), not the two-session split.

## 1. Why the 2026-10-05 snapshot is missing

Run [37373816902](https://github.com/antonwilms/sleeper-dashboard-data/actions/runs/37373816902)
(scheduled, created 2026-10-05 21:06 UTC, ~8 h after the 13:17 cron) ended `failure` after 15 min
with the annotation *"The job was not acquired by Runner of type hosted even after multiple attempts"*.
No step ran and there is no log: a GitHub-hosted-runner outage, not our code. Nothing retried it, so the
week was lost (KTC is capture-only).

**Did cron-deadman fire? Yes, and nobody saw it.** Every daily deadman run from 2026-10-06 to 10-12
printed `weekly-ktc.yml: failed — Latest run conclusion is "failure"`. But deadman has been red on every
run since 2026-10-03 because of `nflverse-depth.yml` and `nflverse-oline.yml` (and since 10-12
`nflverse-rosterweekly.yml`), so a new KTC line inside an already-red run changed nothing anyone sees.

### Fix
1. **Retries.** `weekly-ktc.yml` gains Tuesday and Wednesday 13:17 crons. A pre-step
   (`ktcWeekStep` → `ktcCapturedThisWeek`) skips a scheduled run when `ktc/last-checked.json` shows a
   non-quarantined check since this week's Monday 00:00 UTC (a new snapshot *or* an identical-content
   check both count). A Monday run never skips (last check is last week); a quarantined or crashed
   Monday is retried; `workflow_dispatch` never skips. A Tue/Wed snapshot is just a dated snapshot
   (non-Monday dates already exist, e.g. 06-23).
2. **Loud.** A capture-only workflow (`CAPTURE_ONLY_WORKFLOWS = {weekly-ktc.yml}` in
   `scripts/check-crons.mjs`) that deadman finds unhealthy (failed, stale, disabled, …) opens a GitHub
   issue titled `Capture missed: weekly-ktc.yml`, once — skipped while one with that title is open. An
   issue is a separate notification, not one more line in a run that is red anyway. Not auto-closed:
   a lost week needs a human to acknowledge it. `cron-deadman.yml` gains `issues: write`.
   Covers the runner-outage case (no step of the KTC job runs, so the job itself can't raise anything).

Not fixed here: the standing deadman red (depth / oline / rosterweekly). That noise is the reason the
alert was missed; depth already has its own task (`depth-inseason-floor`).

## 2. The sentinel guard

`checkKtcLandscape` required ≥ 3 of 6 hand-kept names in the top 15. On 10-12 only 3 were there. Its
purpose (README, `ktc-integrity-guard.md`) is catching a broken scrape the per-row checks and the
Spearman guard miss; the one realistic case is the **wrong format**: a 1QB page instead of superflex
(`format=2`), where QBs drop down the board but ordering among everyone else is intact.

**Replacement:** ≥ `KTC_MIN_TOP_QBS` = 8 QBs (by the scraped `position`) in the top
`KTC_LANDSCAPE_TOP_N` = 50 by value. No names to maintain.

Measured 2026-10-13:
- All 19 committed snapshots (05-18 … 10-12): 13–16 QBs in the top 50 (10-12: 14).
- Live KTC page 0, `format=2` (superflex): 14. `format=1` (1QB): **3**.
- 8 leaves 5 of headroom either side. A position-selector break (all positions null) gives 0 and trips too.

Name lists elsewhere: `NFL_SENTINELS` is unchanged. Invariant 7 drops `KTC_TOP_QB_SENTINELS`.

## Registry

CR-17's Data side named `KTC_TOP_QB_SENTINELS`, and `test/registry.test.mjs` requires every named symbol to
resolve, so the one-token edit (`KTC_TOP_QB_SENTINELS` → `checkKtcLandscape`) landed in this slice: app copy
first, data copy synced byte-for-byte; `REGISTRY_MIRROR=1` mirror test green.

## Verification
- `npm test`, `npm run smoke` green.
- `checkKtcLandscape` over every committed snapshot passes; a synthetic 1QB-shaped board fails.
- `updateKtc` quarantine path unchanged apart from the reason fields.
