# P3 January grading run — plan-review record

The flag map for Slice A (`january-grading-run-a.md`) and Slice B (`january-grading-run-b.md`). § numbers are shared by both files: §6–§9 are in B; everything else is in A.

Round 3 (light, Rev 2; scoped to G-MECH, Q, M10): no blocking flags. Resolved on 2026-10-24 (Anton):
- the skipped-M10 caveat (A §5.4, §13) and the M10 follow-up (A §14.3);
- position source, unrounded `p_R` and `UNK` handling (A §5.4);
- the `G_B = G_A` assertion (A §5.4);
- Q-cross relabelled and its start derived from L2 (A §5.4);
- the re-open rule for a new boundary (A §5.2).

## Rounds 1–2

Round 1 (rev 0 → rev 1; in the reviewer's order):

| # | sev | flag | resolved in |
|---|---|---|---|
| 1-1 | blocking | §1.4 live-input list incomplete; G4(b) fails | §1.4 (full list), §5.3 sourcing rule; rev 2 §5.4 G-MECH + Q |
| 1-2 | should-fix | `teamFactor` from S leaks in-season rosters | §5.3 (K's table), §13 sensitivity (S's table) |
| 1-3 | should-fix | Invariant 10: tests need `playerids.json` | §11 (trimmed fixtures + fixture birthdate map; byte-identity on memLoad) |
| 1-4 | should-fix | QB-chain rookie flag wrong | §5.3 QB row (`draftYear === 2026`); rev 2 refines G5 (round-2 flag 3) |
| 1-5 | should-fix | stop can't see a newer unpinned boundary | §5.2 classification stops (i)–(iii) |
| 1-6 | should-fix | D-44 breaks three `loadOutcomes` tests; `basisMatch` seam | §4 (`outcomeBasis` option), §11 (four declared rewrites) |
| 1-7 | should-fix | position-heterogeneity rule unsound | §5.5 (a) vs pooled, (b) permutation; §13 |
| 1-8 | should-fix | segment ⇔ anchor-policy test not implementable | §5.2 literal JSON block + detector vocabulary; §11 |
| 1-9 | should-fix | ROS calendar underspecified | §6.1 (close time, `late`, c = 3…17, empty cells, degenerate frozen split) |
| 1-10 | should-fix | app-side asks have no backlog line | §12, §16 |
| 1-11 | nit | CR-01 reader claim; CR-15 App sites | §12, §16.2–3 |
| 1-12 | nit | stale fix-site anchor | §4 (:136-149, :256-259) |
| 1-13 | nit | identity count, week-7 count | §1.5 (421/422, max 0.102), §1.1 (95) |
| 1-14 | nit | D-75 arms | §7 (`predTotal × factor`; `families.F4.constants.totalFactor`) |
| 1-15 | nit | chain `blended'`, qbQ factor source, ρ per resample | §5.3 |
| 1-16 | nit | `positionOf` seam; `guardLoad` :1068; §8 stop | §4, §8 |
| 1-17 | nit | b10 test read the newest capture | §11 (trimmed fixture copy) |

Round 2 (rev 1 → rev 2):

| # | sev | flag | resolved in |
|---|---|---|---|
| 2-1 | blocking | G-AGG mixes mechanics and drift; 0.005 fails on drift days; 0.05 PPG ≈ 0.3% at QB | §5.4 G-MECH (decides; comps + ageDelta from A; row rule + 0.003 backstop; M1–M9 today), Q (never decides). The PPG-mean criterion is dropped |
| 2-2 | blocking | pair (4) undefined in January | §5.4 M10 (≤ first + 9 days, < 2027-01-01, `skipped` rule) |
| 2-3 | should-fix | G5 rookie rule fails on crosswalk gaps | §5.4 G5 (veteran rows only; T-QB-3 rk on S), §5.3 QB row; constants file named |
| 2-4 | should-fix | shares/cohort factors are not live (premise mis-cited); wrong CR-15 App site | §1.4 correction, §5.3 (now S), §12, §16.2 |
| 2-5 | should-fix | depth branch forked | §3 (`reconstructDepthFactor` + `qbRole`), §5.3 |
| 2-6 | should-fix | no re-audit when a new boundary lands | §5.2 boundary-equality guard (a)–(c) |
| 2-7 | should-fix | Q only within the last segment | §5.4 Q-cross (`2026-09-25` → first capture of the last segment) |
| 2-8 | should-fix | JSON block not literal | §5.2 (literal JSON, vocabulary, precedence) |
| 2-9 | should-fix | S is not one capture | §5.2 (S composite, no grading file), §10 |
| 2-10 | nit | age-table ties; G6 metric | §5.3 (mode, smallest on tie), §5.4 G6 (share-in-mode ≥ 0.98) |
| 2-11 | nit | whose chain role excludes | §5.4 G-MECH rows (chain in A or B, counted) |
| 2-12 | nit | K guard key; absent `loadPositionOf` | §5.1, §4 |
| 2-13 | nit | no flag mapping | this section |

## Slice B plan revisions (moved from `january-grading-run-b.md` in Revision 3)

### Revision 2 (2026-10-24) — Anton's answers to Q1–Q3 and the full-depth review of Rev 1 folded in

| Item | Resolution | Where |
|---|---|---|
| Q1 → (b) | D-60 leaves the January run. `stepD60` returns normally with `counted: false` and never throws. Option (a) is removed, and so is all `countSatLongerFlagged` plumbing: no edit to `scripts/inseason-dyn-run.mjs`, no Q5 tests. Nothing else needed it. The post-rollover recount goes in a deferred app-side backlog edit | §8, §3, §11, §16 |
| Q2 | Veteran backup QBs dropped by a failed G5 are excluded from the games grades too, and counted separately | §6.2, §6.3 |
| Q3 | (b) start rows' observed-to-date = the player's league points over his team's games to date ÷ that count (team-game basis) | §6.1 |
| No-throw rule (Anton) | Nothing in B may throw in a way that blocks A's aggregate write (`scripts/season-grade-run.mjs:643`). Every check prints and counts. Audited per step | §10a |
| Flag 1 (blocking) | `d60` never throws | §8, §10a |
| Flag 2 (blocking) | `rookieTotalArms` moves to `scripts/season-grade-run.mjs`; `lib/seasonGrade.mjs` keeps only the pure `d75Label` and stays free of `lib/rookieTotalPoints.mjs`/`lib/rookieMirror.mjs` | §3, §7 |
| Flags 3, 4 (Q5 memLoad; vacuous Q5 identity) | moot: the D-60 code is removed | §11 |
| Flag 4 (rookie panels) | the byte-identity checks compare against golden outputs captured **before** the edit, not default ≡ explicit | §11 |
| Flag 5 | the `entryToYear` growth case uses 2026 on a local memLoad variant with a 2026 season and entrant | §11 |
| Flag 6 | `missingField` rows: count and exclude; no stop | §6.2 |
| Flag 7 | the frozen/live split keys on `inSeason.frozen`; frozen rows carry `priorSource: 'snapshot:<dateKey>'` | §6.1, §11 |
| Flag 8 | `rel3Of` takes `position: crosswalkPositionOf[id]`, as `games-cause-run` does | §6.2 |
| Flag 9 | §12's backlog line also covers §6.2's value reads of `projectedGames`, `factors.projectedGamesBase` and `factors.shortSeasonState` | §12 |
| Flag 10 | D-16 (iii) `classes ≠ 14` is print-only | §7 |
| Flag 11 | touch list adds the fixture builder `scripts/fixtures/build-season-grade-inseason-fixture.mjs` | §3 |
| Flag 12 (nit) | the `--only games-l6` test runs with `rehearse: true` | §11 |
| Flag 13 (nit) | the guard anchor is `scripts/inseason-run.mjs:91-92`; it is no longer used (D-60 removed) | §8 |
| Flag 14 (nit) | `import { DEFAULT_LOAD as PANEL_DEFAULT_LOAD } from './panel-run.mjs'` | §5a |
| Flag 15 (nit) | `ctx.shared` already holds `inventory`, `leaguePos`, `roster` and `seasonGate` before `vet-calibration`; the dependency check keys on `ctx.shared.S` | §5a, §6.2 |
| Flag 16 (nit) | moot (Q1(a) removed) | — |
| Flag 17 (nit) | a start row with `nfl_team` null is counted `no-team`, separately from `schedule-short` | §6.1 |
| Flag 18 (nit) | moot (D-60 basis wording removed) | — |

**Revision 1 (commit `7cf2dd5`; its 19-row table is in git history)** fitted rev 0 to A's real seams. It added §5a, `steps[].data` aggregates, step-written artifacts, the corrected `rescoreSeasonRowsLeague` call, `sRef` scoring, `SCHEDULE_TEAM_ALIAS`, the literal week-1 Thursday, the S(i) lookup, D-75's `result.evaluate` split, the imported shipped factor and 21.90, the new LOCO helper, the `-rookie-league-panel` naming, the touch list, fixtures, §12 and Q1–Q3. In every revision the rule text of §6–§9 and §13 is rev 0's. Revision 2's only rule change is Anton's Q1 decision, which takes D-60 out of January. New material sits under **Seams** headings or in §3, §5a, §10–§12, §14 and §16.


### Round 4 — full re-review of Slice B Revision 2 (run from the P3 Session 1, 2026-10-25)

No blocking flags; 4 should-fix, 7 nits. All resolved in Revision 3 (see that file's Revision 3 table).

### Slice B Revision 3 — change table (moved from the task file)

#### Revision 3 (2026-10-25) — Anton's answers to the Revision 2 review; no further plan-review round (Anton reviews)

| Item | Resolution | Where |
|---|---|---|
| Answer 1 — no-throw | Each B step body runs inside a step-local catch-all. A caught error returns `{ section, data: { computed: false, error } }`, printed prominently. It **degrades only when `ctx.write === true`** (the real January `--write` run). Otherwise (`--rehearse`, a plain run, tests) it **re-throws**, so A's isolation fails the step and the exit is non-zero: bugs surface now. Plus the six specific null guards | §10a |
| Answer 2 — start-row comparator | (b) start rows drop the `inSeason.n ≥ 1` requirement (`n = 0` → comparator 0). This is a **dated pre-registration amendment**, decided on row counts only, with no outcomes seen; the hash changes are shown. The "n" wording is split into cell size vs `inSeason.n` | §6.1, §13a |
| R4-1: A's registry test | `test/season-grade.test.mjs:315` expects the ten step ids in order | §3, §11 |
| R4-2: throw paths | covered by Answer 1 and the six guards | §10a |
| R4-3: Q3 × `n ≥ 1` | Answer 2 | §6.1 |
| R4-4: D-60 backlog order | Session 2 **amends A's open app-repo-backlog entry**: it drops D-60 from that entry's item (1) and points to B §16 | §3, §16 |
| R4-5 (nit): registry entry | single entry **CR-01**, with reading sites `buildRosRows` (the `inSeason` fields) and `stepGamesL6` (the projection fields) | §12 |
| R4-6 (nit): D-60 recipe | the §16.1 text carries the recount recipe | §16 |
| R4-7 (nit): alias import | the caller (`stepRos`) applies `SCHEDULE_TEAM_ALIAS`, so `lib/seasonGrade.mjs` still imports only `lib/inSeasonEvidence.mjs` | §6.1 |
| R4-8 (nit): `UNK`/null | `makePositionOf` returns null and B treats null as UNK; §6.2's cells have no position dimension | §6.1, §6.2 |
| R4-9 (nit): golden mechanics | hoist the test helpers, then a committed one-off generator, committed before the adapter edits | §3, §11 |
| R4-10 (nit): vacuous calendar test | replaced by `rosCalendar()[0].thursday === '2026-09-10'` | §11 |
| R4-11 (nit): stale text | the stale §10 bullets and §14 item 5 are deleted; the anchor is corrected to :309 | §5a, §10, §14 |
| Size | the Revision 1/2 notes and the Round-4 record moved to `january-grading-run-reviews.md` | — |

The history (Revisions 1–2, Rounds 1–4) is in `january-grading-run-reviews.md`. In every revision the rule text of §6–§9 and §13 is rev 0's, with two exceptions: the Q1 decision (§8, Revision 2) and the 2026-10-25 amendment (§13a).

