# D-76 absence-role — impact verdict (2026-10-22)

- **capturedAt (before / after):** 2026-10-22T16:09:29.254Z / 2026-10-22T16:12:29.813Z

## Noise floor (before vs before2)

Empty on every compared field (741 rows compared, no one-sided rows).

## Rows moved (before vs after)

Rows compared: 741; only in before: 0; only in after: 0.

| field | rows moved |
|---|---|
| projectedGames | 2 |
| projectedPPG | 1 |
| projectedTotalPts | 3 |
| injurySeasons | 5 |
| absenceShapeFactor | 9 |
| isBounceBack | 1 |
| dynastyScore | 5 |
| dynastyLabel | 2 |

## Distribution of each move

### projectedGames

| move | rows |
|---|---|
| +1 | 2 |

### projectedPPG

| move | rows |
|---|---|
| -0.1 | 1 |

### projectedTotalPts

| move | rows |
|---|---|
| +0.7 | 1 |
| +1.5 | 1 |
| -0.8 | 1 |

### injurySeasons

| move | rows |
|---|---|
| -1 | 5 |

### absenceShapeFactor

| move | rows |
|---|---|
| +0.03 | 4 |
| +0.05 | 4 |
| +0.04 | 1 |

### isBounceBack

| move | rows |
|---|---|
| true → false | 1 |

### dynastyScore

| move | rows |
|---|---|
| +1 | 5 |

### dynastyLabel

| move | rows |
|---|---|
| Sell Now → Managed Decline | 1 |
| Solid Floor → Sell Now | 1 |

## Label transitions

| move | rows |
|---|---|
| Sell Now → Managed Decline | 1 |
| Solid Floor → Sell Now | 1 |

## 20 largest movers by |Δ dynasty score|

| # | player | pos | team | dynastyScore before → after | Δ | injurySeasons before → after |
|---|---|---|---|---|---|---|
| 1 | David Moore | WR | CAR | 39 → 40 | +1 | 0 (unchanged) |
| 2 | Pharaoh Brown | TE | IND | 20 → 21 | +1 | 1 (unchanged) |
| 3 | Robert Tonyan | TE | PIT | 7 → 8 | +1 | 1 (unchanged) |
| 4 | David Sills | WR | TB | 36 → 37 | +1 | 1 (unchanged) |
| 5 | K.J. Osborn | WR | TEN | 21 → 22 | +1 | 2 (unchanged) |

## 20 largest movers by |Δ projectedTotalPts|

| # | player | pos | team | projectedTotalPts before → after | Δ | injurySeasons before → after |
|---|---|---|---|---|---|---|
| 1 | Cody White | WR | LV | 16.2 → 17.7 | +1.5 | 0 (unchanged) |
| 2 | David Sills | WR | TB | 28.3 → 27.5 | -0.8 | 1 (unchanged) |
| 3 | Josiah Deguara | TE | PHI | 8.9 → 9.6 | +0.7 | 0 (unchanged) |

## In-season healthy-cut rows

Live 2026 `nfl/season-totals/2026.json` as stored (committed in both trees; `<after>` is not regenerated — `update.mjs nfl --dry-run` writes nothing, so the reclassification was computed **in memory** with `classifyAbsences(stored 2026, nflverse/rosterweekly/2026.json players, { season: 2026 })`: 1446 slots demoted `'D'`→`'X'` over 388 rows — DEV 1421, EXE 19, CUT 6 — 0 promoted). Rows are the 2026-10-22 capture's (`before.json`) short-season-cut rows (`factors.shortSeasonK` set); the 2026-10-18 committed snapshot gives the same picture.

| definition | rows | live `dnpWeeks === 0` now | after reclassification | newly healthy |
|---|---|---|---|---|
| `isHealthyCutRow` as coded (`shortSeasonK` set, finite `projectedGamesBase`, `inSeason.n ≥ 1`) — rows whose displayed games would change | 54 | 20 | 29 | **9** |
| every `shortSeasonK` row (the D9 pre-estimate's basis) | 100 | 20 | 53 | **33** |
| (2026-10-18 snapshot, same two definitions) | 52 / 102 | 19 / 20 | 28 / 56 | 9 / 36 |

D9 pre-estimate "35 of 102 read healthy" matches the second definition (36 newly healthy at 102 rows). Only the first definition changes a displayed number; 2026 is not regenerated in `<after>` (that is C3 step 2), so this effect is **not** part of the before/after capture diff above; it lands with the release.

## V2.12 re-measure

`vite-node scripts/verify/computed-stats.mjs -- --data <tree> --out <tree>/verification --only v2 --no-fetch --date 2026-10-18` (app `main` @ `11c2b53`; the Sleeper `/players/nfl` response came from the app checkout's existing 2026-10-18 harness cache since `--no-fetch` has no network; harness output stayed in the temporary worktrees, nothing copied back). Run on both trees, 4615 player-season rows each.

| | `<before>` (48ad260) | `<after>` (db0e087) |
|---|---|---|
| V2.12 mismatches | 1387 / 4615 = **30.05%** | **110 / 4615 = 2.38%** |
| signed Δ (negative / zero / positive) | 48 / 3228 / 1339 | 65 / 4505 / 45 |
| `dnpWeeks` mismatch by season 2021→2025 | 293, 277, 266, 277, 254 (of 812/789/784/781/780) | 37, 16, 10, 14, 14 |
| DEV weeks marked `'D'` (2021–2025) | 96.9–99.9% | 0.0% |

Status stays `defect` by threshold but falls from 30% to 2.4%. The residual 110 rows (65 negative: the app undercounts a miss) are not interpreted here — the V2.12 no-snaps item (data `app-repo-backlog.md`) owns them.

## Stage A --absence §3 / §5 (reference)

Source: the Stage A `--absence` run notes, kept outside the repository (machine-local); the numbers needed for later checks are reproduced in this file (Stage A `--absence` run, 2026-10-19; pre-migration measurement, kept verbatim for reference).

### 3. Primary result

Mean absolute error of projected games vs next-season games played (MAE), mean signed error (bias = prediction − outcome), and ΔMAE = after − before with a player-clustered paired bootstrap 95% CI.

| cell | n | players | MAE before | MAE after | ΔMAE [95% CI] | bias before | bias after |
|---|---|---|---|---|---|---|---|
| all rows | 4362 | 1277 | 4.872 | 4.874 | 0.002 [0, 0.004] | 3.426 | 3.429 |
| QB | 530 | 113 | 5.347 | 5.347 | 0 [0, 0] | 4.46 | 4.46 |
| RB | 1139 | 365 | 4.804 | 4.807 | 0.003 [0, 0.007] | 3.162 | 3.167 |
| WR | 1654 | 493 | 5.058 | 5.059 | 0.001 [-0.002, 0.005] | 3.653 | 3.657 |
| TE | 1039 | 306 | 4.408 | 4.41 | 0.002 [0, 0.006] | 2.826 | 2.828 |
| S 2015 | 451 | 451 | 5.361 | 5.361 | 0 [0, 0] | 4.288 | 4.288 |
| S 2016-2020 | 2060 | 769 | 4.531 | 4.531 | 0 [0, 0] | 3.077 | 3.077 |
| S 2021-2024 | 1851 | 754 | 5.133 | 5.137 | 0.004 [0, 0.009] | 3.604 | 3.611 |
| changed rows only | 13 | 9 | 6.308 | 6.846 | 0.538 [0, 1] | 4.462 | 5.462 |

Spearman ρ (prediction vs outcome): before 0.336, after 0.335.

### 5. 2026 impact

Today's veterans (431 QB/RB/WR/TE rows in the 2026-10-04 snapshot): 2 change `projectedGames`; mean change 0.005 over all, 1 over the changed. Largest movers:

| player | pos | games before → after | injurySeasons before → after |
|---|---|---|---|
| Cody White | WR | 11 → 12 | 0 → 0 |
| Josiah Deguara | TE | 13 → 14 | 0 → 0 |

Bounce-back flips among today's veterans: David Sills (WR) on→off.

## Comparison with D9 and method

Counts are rows moved of 741 compared (no row on one side only). D9 pre-estimate column: 435 veterans, 2026-10-18 snapshot; the 3× stop bound is not approached on any field. Dynasty injury-season counts, measured as rows whose `dynasty.components.reliability.value` moved between `before` and `after` (ids 3155, 4274, 4443, 4602, 6154, 6659, 7039, 7066, 8122, 8204, 12062): 11 against the estimate of 30; the 3× check passes (11 ≤ 90).

| field | measured | D9 pre-estimate |
|---|---|---|
| `projectedGames` | 2 | 2 |
| `injurySeasons` | 5 | 6 |
| `absenceShapeFactor` | 9 | 8 |
| bounce-back flips | 1 | 1 |
| dynasty injury-season counts (rows whose `dynasty.components.reliability.value` moves) | 11 | 30 |

Method: both captures `scripts/capture-snapshot.mjs` with `SNAPSHOT_OUT_PATH`, one Chromium session sequence (before → after → before2, ~3 min each), app built from a detached worktree of app `main` @ `11c2b53` with `VITE_DATA_STORE_URL=http://localhost:8787` and `VITE_CFBD_API_KEY` forced empty (as `daily-snapshot.yml`, which sets none — the linked `.env.local` would otherwise inject the key; same build for all three captures). Data trees: `<before>` = `git merge-base d76-absence-role origin/main` = `48ad260` (no fetch), `<after>` = `db0e087`; `git diff --name-only` between them touches served data only in `nfl/season-totals/{2017,2018,2020–2025}.json` and `manifest.json` (the new `lastModified` entries). `projectionModelFrom` is `2026-10-14` in both captures. All three captured 741 players with `dynasty` present.

## Rows moved — reference for the D-83 cross-check

15 player rows (of 741 compared) where `projectedGames`, `factors.injurySeasons`, `factors.absenceShapeFactor` or `factors.isBounceBack` moved between `before` and `after`; an unchanged field is shown once with "(unchanged)". Generated with `diffCaptures` + `moverRows` from `scripts/absence-role-impact.mjs` over the same two captures. The captures themselves are kept outside the repository (machine-local); the numbers needed for later checks are reproduced in this file.

| player id | name | pos | projectedGames | injurySeasons | absenceShapeFactor | isBounceBack |
|---|---|---|---|---|---|---|
| 10212 | Josh Whyle | TE | 11 (unchanged) | 1 → 0 | 1 (unchanged) | false (unchanged) |
| 10219 | Chris Rodriguez Jr. | RB | 12 (unchanged) | 1 → 0 | 1 (unchanged) | true (unchanged) |
| 10224 | Brayden Willis | TE | 5 (unchanged) | 0 (unchanged) | 0.97 → 1 | null (unchanged) |
| 11201 | Blake Whiteheart | TE | 15 (unchanged) | 0 (unchanged) | 0.97 → 1 | false (unchanged) |
| 11304 | E.J. Jenkins | TE | 4 (unchanged) | 0 (unchanged) | 0.95 → 1 | null (unchanged) |
| 11508 | Princeton Fant | TE | 4 (unchanged) | 0 (unchanged) | 0.95 → 1 | null (unchanged) |
| 12062 | Cam Grandy | TE | 4 (unchanged) | 1 → 0 | 1 (unchanged) | null (unchanged) |
| 3258 | Nick Vannett | TE | 8 (unchanged) | 4 → 3 | 0.9 (unchanged) | false (unchanged) |
| 5086 | Marquez Valdes-Scantling | WR | 12 (unchanged) | 0 (unchanged) | 0.93 → 0.97 | false (unchanged) |
| 6154 | David Sills | WR | 15 (unchanged) | 1 (unchanged) | 1 (unchanged) | true → false |
| 7039 | Cody White | WR | 11 → 12 | 0 (unchanged) | 0.97 → 1 | false (unchanged) |
| 7050 | Josiah Deguara | TE | 13 → 14 | 0 (unchanged) | 0.97 → 1 | false (unchanged) |
| 7559 | Ihmir Smith-Marsette | WR | 7 (unchanged) | 0 (unchanged) | 0.9 → 0.95 | false (unchanged) |
| 7596 | Elijah Moore | WR | 13 (unchanged) | 1 → 0 | 1 (unchanged) | false (unchanged) |
| 7597 | Kenny Yeboah | TE | 5 (unchanged) | 0 (unchanged) | 0.95 → 1 | false (unchanged) |
