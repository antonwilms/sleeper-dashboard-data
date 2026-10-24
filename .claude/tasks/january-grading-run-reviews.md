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
