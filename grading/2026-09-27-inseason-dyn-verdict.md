# In-season evidence — Phase 2c: dynasty-side (rookies and SHORT veterans) verdict

**Q1 — prospect prior.** YE0: arm B (ΔAB BEATS, mean -0.137, CI [-0.2, -0.0]). YE1: arm B (ΔAB BEATS, mean -0.122, CI [-0.2, -0.0]).

**Q2 — SHORT-recent prior.** History prior (ΔHP NO-GAIN, mean -0.085, CI [-0.2, 0.0]).

**Q3 — the KTC anchor.** Report only; see §Q3 below. Not measurable yet: whether KTC itself moves with in-season evidence (KTC history starts 2026-05-18).

## Constants / reuse

| name | pos | k | ci95 | basis |
|---|---|---|---|---|
| K_DYN_PROSPECT_B_YE0 | QB | 6.5 | — | reuse (K_DYN_POINTS_ROOKIE0) |
| K_DYN_PROSPECT_B_YE0 | RB | 6.5 | — | reuse (K_DYN_POINTS_ROOKIE0) |
| K_DYN_PROSPECT_B_YE0 | WR | 6.5 | — | reuse (K_DYN_POINTS_ROOKIE0) |
| K_DYN_PROSPECT_B_YE0 | TE | 6.5 | — | reuse (K_DYN_POINTS_ROOKIE0) |
| K_DYN_PROSPECT_B_YE1 | QB | 3.5/6.5 | — | reuse (K_DYN_POINTS_ROOKIE1P, K_DYN_POINTS_ROOKIE0) |
| K_DYN_PROSPECT_B_YE1 | RB | 3.5/6.5 | — | reuse (K_DYN_POINTS_ROOKIE1P, K_DYN_POINTS_ROOKIE0) |
| K_DYN_PROSPECT_B_YE1 | WR | 3.5/6.5 | — | reuse (K_DYN_POINTS_ROOKIE1P, K_DYN_POINTS_ROOKIE0) |
| K_DYN_PROSPECT_B_YE1 | TE | 3.5/6.5 | — | reuse (K_DYN_POINTS_ROOKIE1P, K_DYN_POINTS_ROOKIE0) |
| K_DYN_POINTS_SHORT_HISTORY | QB | 2.5 | — | reuse (K_DYN_POINTS_HISTORY) |
| K_DYN_POINTS_SHORT_HISTORY | RB | 2.5 | — | reuse (K_DYN_POINTS_HISTORY) |
| K_DYN_POINTS_SHORT_HISTORY | WR | 2.5 | — | reuse (K_DYN_POINTS_HISTORY) |
| K_DYN_POINTS_SHORT_HISTORY | TE | 2.5 | — | reuse (K_DYN_POINTS_HISTORY) |

## §Prior calibration (read before using these k)

Each k is fitted against its prior's miscalibration: re-fit if POSITION_PRIOR_PPG/the age or draft multipliers (arm A), the rookie calibration (arm B), or the projection (Q2 projection prior) change.

## §Q1

**YE0** — A: k=2.4 (OK, rows=7411), prior-only MAE=4.24. B: k=6.3 (OK, rows=7411), prior-only MAE=2.96. ΔAB=BEATS.
**YE1** — A: k=3.6 (OK, rows=7583), prior-only MAE=3.29. B: k=3.7 (OK, rows=7583), prior-only MAE=3.16. ΔAB=BEATS.

## §Q2

Hist: k=3.9 (OK, rows=2133). Proj: k=3.6 (OK, rows=2133). ΔHP=NO-GAIN.

## §Q3

**YE0** (arm B, rows=7411): realised movement=23.68, model-share update=11.41, left on table=6.84 (28.9% of realised movement), captured share=0.176, rank agreement=0.457, cap-of-35 row share=0.667.
**YE1** (arm B, rows=7583): realised movement=25.38, model-share update=14.70, left on table=8.82 (34.8% of realised movement), captured share=0.205, rank agreement=0.496, cap-of-35 row share=1.000.

## Excluded population

Q1: YE<=1 player-seasons 14994 (players 888). routeMismatch 0 (rate 0.00%). draftYear unusable 12. YE1-in-rookie0 511. Without S+1 outcome 5934.
Q2: SHORT-recent 2133, SHORT-stale 574. Without S+1 outcome 3615.

## Limitations

- **Basis:** pinned half_ppr — k is dimensionless; a league-basis refit stays with backlog D-45.
- **D4 pick proxy:** a 12-team, 5-round league shape applied to any league; the actual league draft is not reconstructable.
- **D5 YE1 quirk:** the app's `selectRookieDraft` reads only the most recent rookie draft, so every second-year player gets `draftMultiplier(null) = 0.75` and loses the premium-pick exemption. Reported, not fixed here.
- **D6 age date:** whole years on `${S}-09-01` from `birthdate`; `player.age ?? 23` is the app default when null.
- **Survivorship:** more than half of SHORT player-seasons and a large share of rookie-path player-seasons have no S+1 outcome (busts vanish from every fitted number).
- **KTC unmeasurable:** KTC snapshot history starts 2026-05-18; whether KTC itself reacts to in-season evidence is untestable until ~Jan 2027 (rest-of-season) / ~Jan 2028 (S+1 graded).
- The prospect score's other inputs (the KTC anchor at 60%, the peak clamp, the cap of 35) are reported (§Q3), not fitted.
- **Fixed-rung leakage:** a ladder rung that reuses a 2a-pinned or `K_DYN_POINTS_HISTORY` k was fitted on other rows, including rows from the held-out season — this favours the fixed rung, the conservative direction.

**Reproduce:** `node bin/backtest.mjs --inseason --dynasty --write`
