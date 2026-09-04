# Tier 0 capture-gap slices — ordering & unit boundaries

**Repo SHAs (verified against origin/main via GitHub MCP, 2026-07-18):**
data `a62b522092faf2cc848ad3e9917744e47527dfd4` · app `2185ef2f143cecb89b2e6b28d86cc8b3863958f3`.

Task files: `tier0-a4-players-state.md` · `tier0-a2-deadman.md` · `tier0-oline.md`.
All three are capture-only (A4/oline) or monitoring-only (A2); nothing downstream consumes the
new data.

## Recommended implementation order

**1. A4 (players-state) → 2. A2 (dead-man) → 3. oline.**

Rationale under loss-clock-first:
- **A4 first — the only hard loss clock.** Sleeper serves current state only; every uncaptured
  week is permanently gone. Nothing else in the set loses irrecoverable data by waiting.
- **A2 second.** It protects all captures (including A4's new cron and the KTC cron that already
  lost two Mondays) from silent loss, so it outranks oline; but it captures nothing itself, so
  the expected loss from a few days without it is a *risk* of undetected loss, not a certain
  loss like A4's.
- **oline third — soft clock, verified.** Upstream nflverse depth_charts retains every dated
  state inside its yearly files (2025 file: 221 distinct capture days; 2026 file live through
  2026-07-18), so missed weeks are recoverable from upstream. Forward capture starts now for
  insurance and convenience, not because data is bleeding.

**The register-vs-protect tension is dissolved, not traded off:** A2 reads its expected-job set
from the `.github/workflows/*.yml` cron lines themselves (plus the Actions API for run
evidence) — there is no registration step. Whichever order lands, A2 covers A4/oline the moment
their workflow files reach main, and covers them with a bootstrap grace (`ok-bootstrap`) until
their first scheduled window elapses. So A2 neither blocks nor is blocked by the captures; it is
sequenced second purely on the loss-clock argument above.

All three units are mutually independent — no shared new code, no ordering hazard if the
implementer lands them in one session or in any order; the recommendation only optimizes
loss-minutes if sessions get split.

## Scaffolding to build once and share

**None required, deliberately.** A4 reuses the existing KTC scaffolding pattern (date-keyed
append-only snapshot + content-hash dedup + `weekly-ktc.yml` skeleton); oline reuses the
teamcontext scaffolding pattern (year-keyed TEAM-keyed rebuild + `nflverse-teamcontext.yml`
skeleton incl. the Invariant 8 season-output purge); A2 is standalone (one new `lib/io.mjs`
helper, `appendStepSummary`, used only by it for now). The shared substrate — `lib/io.mjs`,
`lib/manifest.mjs`, rebase-retry + purge workflow conventions — already exists; inventing a new
shared capture framework for two units with different key conventions would be speculative
abstraction.

## Unit boundaries (one line each)

- **A4 — `tier0-a4-players-state.md`:** the Sleeper-sourced, date-keyed, hard-loss-clock capture;
  merges nothing (Sleeper verifiably cannot express OL composition: 0 of 510 OL records carry
  `depth_chart_order`, so no shared fetch or payload with oline exists).
- **oline — `tier0-oline.md`:** the nflverse-sourced, year-keyed, TEAM-keyed, soft-clock capture
  (ESPN-era `depth_charts`, 2025+); different source, key convention, and precedent than A4.
- **A2 — `tier0-a2-deadman.md`:** monitoring, its own unit regardless (per the session brief);
  zero-config schedule-driven detector — shares no fetch/schema/manifest surface with the
  captures it protects.

## Cadence map after landing (for reference)

Mon KTC 13:17 · Tue roster 13:23 · Wed playerids 13:29 · Thu advstats 13:41 · Fri schedule 13:35
· Sat gamelogs 13:47, **playerstate 14:11 (new)**, **oline 14:37 (new)** · Sun teamcontext 13:53
· daily **cron-deadman 05:19 (new)** · yearly draft May 1 12:00.
