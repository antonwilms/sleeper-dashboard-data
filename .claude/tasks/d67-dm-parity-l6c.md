# D-67 · DM parity on the short-season rule (report-only)

Source: app `.claude/tasks/data-repo-backlog.md` → D-67 (Watch; append 2026-11-02).
Review depth: light — report-only; no constant, served file, manifest entry, mirror rule or cross-repo contract changes. `lib/durabilityMirror.mjs` (CR-28 mirror) is read, not edited.

## Goal

1. Rebuild a DM parity fixture from a post-boundary-10 capture, inputs pinned at a post-`76b5ddf` data rev.
2. Run DM-1 under `rule: 'l6c'`; expect ≥ 99%.
3. Confirm `grading/anchor-policy.md` boundary 8's cross-check: every `'short'`/`'none'` veteran row equals the mirror's `rule: 'l6c'`.

Nothing changes served output. The existing DM-0 fixture (`durability-parity-2026-10-04.json`, rev `4f469cc`) and every consumer of it (`absence-run`, `games-cause-run`, `games-calibration-run`, `games-short-run`, `test/durability-mirror.test.mjs`) stay untouched.

## Inputs (pinned)

- Snapshot: `snapshots/2026-10-30.json` — newest capture on disk; `capturedAt` 2026-10-30T20:58:36Z, `projectionModelFrom` `2026-10-28` (≥ boundary 10's `2026-10-23`), schemaVersion 3. `shortSeasonState` counts on non-rookie rows: qual 336, short 95, none 2. If a newer capture exists at build time with `projectionModelFrom` ≥ `2026-10-23`, still use 2026-10-30 (pinned here so the plan and verdict agree); do not substitute.
- Source rev: `297315f` (HEAD at planning; `nfl/season-totals/2025.json` last changed at `76b5ddf`, so it carries the D-76 correction). Read via `git show`, as the existing builder does.
- Positions rev (plan-review flag 1): `nflverse/playerids.json` is read at `git rev-list -1 --before=2026-10-30T20:58:36Z HEAD` (the last commit at or before the capture), not at 297315f — playerids refreshes on schedule. Builder takes it as `--positions-rev` (default = `sourceRev`, so the 2026-10-04 build is unchanged); fixture records `positionsRev`. Verdict names both revs.

## Changes

### 1. `scripts/fixtures/build-durability-parity.mjs` — parameterise, default unchanged

- `buildFixture({ sourceRev = SOURCE_REV, snapshotDate = SNAPSHOT_DATE } = {})`; `gitShowJson` takes the rev. Defaults reproduce today's output byte-for-byte (verify: rebuild the 2026-10-04 fixture to scratch and `cmp` with the committed file).
- Additionally capture per snapshot row: `shortSeasonState: f.shortSeasonState ?? null`, `projectedGamesBase: f.projectedGamesBase ?? null`. **Only when `snapshotDate !== '2026-10-04'`**, so the default build stays byte-identical (simplest: add the two fields only if `f.shortSeasonState !== undefined` — the 2026-10-04 capture predates boundary 8 and has none; confirm by the `cmp`).
- CLI: `node scripts/fixtures/build-durability-parity.mjs [--rev <rev>] [--snapshot <YYYY-MM-DD>]`; output `test/fixtures/durability-parity-<snapshot>.json`. Update the header comment.

### 2. Build the new fixture

`node scripts/fixtures/build-durability-parity.mjs --rev 297315f --snapshot 2026-10-30` → `test/fixtures/durability-parity-2026-10-30.json` (expect ~650–700 KB; record size and veteran row count). Not manifest-registered (test fixture, like the existing one).

### 3. `scripts/absence-run.mjs` `parityReport` — optional rule

`parityReport(fixture, { rule = 'pre-l6c' } = {})`; pass `rule` into `projectedGamesFor`. Return additionally `rule` and, when `rule === 'l6c'`, `shortSeason: { rows, matched, mismatches }` over rows whose snapshot `shortSeasonState` is `'short'` or `'none'`, comparing mirror `{ projectedGames, shortSeasonState, projectedGamesBase }` to the snapshot's. Existing callers pass no option → identical result object except the added `rule: 'pre-l6c'` field (check no caller serialises the whole object; `games-short-run`/`games-calibration-run` pick fields — confirm).

`bounceBackFlag` stays as is (rule-independent).

### 4. Test — `test/durability-parity-l6c.test.mjs` (new file; reads only `test/fixtures/`, Invariant 10)

- **DM-0 (l6c)**: fixture `sourceRev === '297315f'`, `snapshot === '2026-10-30'`, row count equals the build's recorded count, seasons 2012–2025. Fails if the fixture was rebuilt from another rev/snapshot.
- **DM-1 (l6c)**: `parityReport(FX, { rule: 'l6c' }).rate >= ABSENCE_DEFAULTS.parityMin` and `rows >= 400`; logs mismatches. Fails if the mirror's l6c branch diverges from the app (e.g. a wrong `SHORT_SEASON_K` cell or state threshold).
- **State agreement (plan-review flag 3)**: on every compared row (any state), mirror `shortSeasonState` === snapshot `shortSeasonState`; `parityReport` returns `stateMismatches` for this. Fails if a snapshot-`qual` row is mirror-`short` but rounds to the same games.
- **Boundary-8 cross-check (plan-review flag 2)**: `shortSeason.rows` equals the count, computed in the test from the fixture, of rows with snapshot state short/none, skill position and a qualifying season (≤ 97; record the actual in the verdict), `shortSeason.rows >= 90`, and `shortSeason.matched === shortSeason.rows` (exact; the policy's wording is "equal"). Fails if any `'short'`/`'none'` row's `projectedGames`, state or base differs.
- **Rule matters**: `parityReport(FX)` (default pre-l6c) rate is strictly lower than the l6c rate. Fails if the `rule` option is not threaded into `projectedGamesFor`.

Show-it-fails (Done-definition 1): (a) temporarily drop `rule` from the `projectedGamesFor` call in `parityReport` → DM-1(l6c) and cross-check red; (b) temporarily change one `SHORT_SEASON_K` cell in `lib/durabilityMirror.mjs` → cross-check red. Revert both.

If DM-1 (l6c) < 99% or the cross-check is not exact: **stop and report** with the mismatch list; do not adjust the mirror, constants or thresholds, and do not commit a red test.

### 5. Verdict — `grading/2026-11-02-dm-parity-l6c-verdict.md` (hand-written from test output; unregistered like other verdicts)

Sections: inputs (snapshot, `capturedAt`, `projectionModelFrom`, rev, fixture path/size/rows); DM-1 l6c `matched/rows = %`, mismatches listed; DM-1 pre-l6c on the same fixture for contrast; DM-2 bounce-back agreement (reported); boundary-8 cross-check `matched/rows` with per-state/position counts; conclusion line ("D-67 closed" or the stop).

### 6. Docs

- `grading/anchor-policy.md` boundary 8: replace "**Cross-check (to be confirmed, D-67):**" bullet with "**Cross-check — closed (2026-11-02).**" + one-line result citing the verdict and fixture (mirror boundary 11's wording).
- Cross-repo: add a line to `.claude/tasks/app-repo-backlog.md` asking the app session to mark D-67 resolved in `data-repo-backlog.md`, citing the data commit. Flag in hand-back.
- No CLAUDE.md / data-catalog / manifest change (no served family touched).

## Touch list

`scripts/fixtures/build-durability-parity.mjs`, `scripts/absence-run.mjs`, `test/fixtures/durability-parity-2026-10-30.json` (new), `test/durability-parity-l6c.test.mjs` (new), `grading/2026-11-02-dm-parity-l6c-verdict.md` (new), `grading/anchor-policy.md`, `.claude/tasks/app-repo-backlog.md`.

## Done-definition

`npm run smoke` and `npm test` green; byte-identical rebuild of the 2026-10-04 fixture shown; show-it-fails (a)/(b) shown; commit + `git pull --rebase` + push per git-workflow.md. Hand back SHA, files, deviations, test evidence. Session 2 runs on **sonnet**.
