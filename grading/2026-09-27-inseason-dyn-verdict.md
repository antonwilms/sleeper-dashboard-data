# In-season evidence — Phase 2c: dynasty-side (rookies and SHORT veterans) verdict

**Q1 — prospect prior.** YE0: arm B (ΔAB BEATS, mean -0.1369, CI [-0.2389, -0.0393]). YE1: arm B (ΔAB BEATS, mean -0.1224, CI [-0.2023, -0.0408]).

**Q2 — SHORT-recent prior.** History prior (ΔHP NO-GAIN, mean -0.0850, CI [-0.1933, 0.0221]).

**Q3 — the KTC anchor.** Measured (pooled): rows=14994, model-share update=12.94, left on table=7.76 (31.6% of realised movement), captured share=0.192, rank agreement=0.475, peak-clamp share (xn/y)=0.398/0.464, cap-of-35 row share=0.836 [upper bound: KTC unknown historically]. Not measurable yet: whether KTC itself moves with in-season evidence (KTC history starts 2026-05-18).

## Constants / reuse

| name | pos | k | ci95 | basis |
|---|---|---|---|---|
| K_DYN_PROSPECT_B_YE0 | QB | 6.5 | — | reuse (K_DYN_POINTS_ROOKIE0) |
| K_DYN_PROSPECT_B_YE0 | RB | 6.5 | — | reuse (K_DYN_POINTS_ROOKIE0) |
| K_DYN_PROSPECT_B_YE0 | WR | 6.5 | — | reuse (K_DYN_POINTS_ROOKIE0) |
| K_DYN_PROSPECT_B_YE0 | TE | 6.5 | — | reuse (K_DYN_POINTS_ROOKIE0) |
| K_DYN_PROSPECT_B_YE1 | QB | 3.5 | — | reuse (K_DYN_POINTS_ROOKIE1P) |
| K_DYN_PROSPECT_B_YE1 | RB | 3.5/6.5 | — | reuse (K_DYN_POINTS_ROOKIE1P, K_DYN_POINTS_ROOKIE0) |
| K_DYN_PROSPECT_B_YE1 | WR | 3.5/6.5 | — | reuse (K_DYN_POINTS_ROOKIE1P, K_DYN_POINTS_ROOKIE0) |
| K_DYN_PROSPECT_B_YE1 | TE | 3.5/6.5 | — | reuse (K_DYN_POINTS_ROOKIE1P, K_DYN_POINTS_ROOKIE0) |
| K_DYN_POINTS_SHORT_HISTORY | QB | 7.5 | — | reuse (K_DYN_POINTS_HISTORY) |
| K_DYN_POINTS_SHORT_HISTORY | RB | 4.0 | — | reuse (K_DYN_POINTS_HISTORY) |
| K_DYN_POINTS_SHORT_HISTORY | WR | 6.0 | — | reuse (K_DYN_POINTS_HISTORY) |
| K_DYN_POINTS_SHORT_HISTORY | TE | 5.5 | — | reuse (K_DYN_POINTS_HISTORY) |

## §Prior calibration (read before using these k)

Each k is fitted against its prior's miscalibration: re-fit if POSITION_PRIOR_PPG/the age or draft multipliers (arm A), the rookie calibration (arm B), or the projection (Q2 projection prior) change.

| arm | c | k with c | k without c |
|---|---|---|---|
| A_YE0 | 0.88 | 3.3 | 2.4 |
| B_YE0 | 1.32 | 5.1 | 6.3 |
| A_YE1 | 1.00 | 3.6 | 3.6 |
| B_YE1 | 1.16 | 3.9 | 3.7 |
| hist | 0.72 | 8.8 | 3.9 |
| proj | 0.72 | 7.2 | 3.6 |

> c > 1 means the prior runs **pessimistic** on these rows (outcomes exceed it). For the rookie arms that is partly survivorship: busts have no S+1 outcome and are excluded.

## §Q1

**YE0** — A: k=2.4 (OK, rows=7411), prior-only MAE=4.24. B: k=6.3 (OK, rows=7411), prior-only MAE=2.96, Δ vs 2a pinned=NO-GAIN (mean 0.0040, CI [-0.0003, 0.0084]). ΔAB=BEATS (mean -0.1369, CI [-0.2389, -0.0393]).
  - A-nullpick: k=2.1, MAE=2.79 vs A MAE=2.71, Δ=WORSE (mean 0.0793, CI [0.0250, 0.1332]).
**YE1** — A: k=3.6 (OK, rows=7583), prior-only MAE=3.29. B: k=3.7 (OK, rows=7583), prior-only MAE=3.16, Δ vs 2a pinned=NO-GAIN (mean 0.0044, CI [-0.0030, 0.0116]). ΔAB=BEATS (mean -0.1224, CI [-0.2023, -0.0408]).
  - A-nullpick: k=3.6, MAE=2.66 vs A MAE=2.66, Δ=NO-GAIN (mean 0.0000, CI [0.0000, 0.0000]).
  - A-YE1-withPick: k=4.1, MAE=2.64 vs A MAE=2.66, Δ=NO-GAIN (mean -0.0124, CI [-0.0430, 0.0175]).

## §Q2

Hist: k=3.9 (OK, rows=2133), Δ vs K_DYN_POINTS_HISTORY=NO-GAIN (mean 0.0258, CI [-0.0227, 0.0805]). Proj: k=3.6 (OK, rows=2133), Δ vs K_DYN_POINTS_SHORT=NO-GAIN (mean 0.0241, CI [-0.0237, 0.0743]). ΔHP=NO-GAIN (mean -0.0850, CI [-0.1933, 0.0221]).

## §Q3

**Measured:** the model-share numbers below. **Not measurable yet:** whether KTC itself moves with in-season evidence (so the anchored 60% is not really lost) — untestable until ~Jan 2027 (rest-of-season) / ~Jan 2028 (S+1 graded). **Do not propose changing the anchor.**

Pooled (YE0+YE1): rows=14994, model-share update=12.94, left on table=7.76 (31.6% of realised movement), captured share=0.192, rank agreement=0.475, peak-clamp share (xn/y)=0.398/0.464, cap-of-35 row share=0.836 [upper bound: KTC unknown historically].
YE0: rows=7411, model-share update=11.21, left on table=6.73 (28.4% of realised movement), captured share=0.177, rank agreement=0.458, peak-clamp share (xn/y)=0.369/0.462, cap-of-35 row share=0.667 [upper bound: KTC unknown historically].
YE1: rows=7583, model-share update=14.63, left on table=8.78 (34.6% of realised movement), captured share=0.206, rank agreement=0.497, peak-clamp share (xn/y)=0.427/0.466, cap-of-35 row share=1.000 [upper bound: KTC unknown historically].
n∈1-4: rows=6975, model-share update=10.04, left on table=6.02 (23.2% of realised movement), captured share=0.124, rank agreement=0.350, peak-clamp share (xn/y)=0.359/0.418, cap-of-35 row share=0.848 [upper bound: KTC unknown historically].
n∈5-8: rows=5416, model-share update=15.27, left on table=9.16 (38.5% of realised movement), captured share=0.236, rank agreement=0.547, peak-clamp share (xn/y)=0.411/0.483, cap-of-35 row share=0.827 [upper bound: KTC unknown historically].
n∈9-40: rows=2603, model-share update=15.87, left on table=9.52 (43.0% of realised movement), captured share=0.306, rank agreement=0.639, peak-clamp share (xn/y)=0.477/0.549, cap-of-35 row share=0.819 [upper bound: KTC unknown historically].

## Excluded population

Q1: YE<=1 player-seasons 2046 (rows 20928, players 1310). No S+1 outcome — absent: player-seasons 390 (rows 3310); gp<6: player-seasons 274 (rows 2624). draftYear unusable: player-seasons 5 (rows 54). routeMismatch: player-seasons 0 (rows 0, rate 0.00%). YE1-in-rookie0: player-seasons 50 (rows 511). YE2-3 no qualifying season: player-seasons 344 (rows 3211).
Q2: SHORT-recent player-seasons 195 (rows 2133), SHORT-stale player-seasons 59 (rows 574), SHORT-noL player-seasons 0 (rows 0). No S+1 outcome — absent: player-seasons 262 (rows 2484, includes retirements); gp<6: player-seasons 123 (rows 1131). Without a projPrior: player-seasons 9 (rows 93).

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
