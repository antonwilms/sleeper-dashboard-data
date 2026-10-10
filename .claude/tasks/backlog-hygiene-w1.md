# W1 — Backlog hygiene: verify, close or watch; anchor-policy order; Offences-you-own logos

**Session 1, 2026-10-10 (opus), parent-folder read of both repos.** Baselines: app `59fc51d`, data `539b50d`
(both clean, level with `origin/main`). Source: `../future_plans/in-season-notes-plan.md` → "Close-out programme
(2026-10-10)" → W1; input list `../sleeper-dashboard/.claude/tasks/data-repo-backlog.md` (the app repo holds the
backlog).

**Type:** bookkeeping, docs, registry text, plus one view-only UI change (a logo in `/week`'s Offences you own).
No `lib/`, `scripts/`, `bin/`, `test/` or data-file change in the data repo (the registry edits are text about them). **Model:** sonnet for both stages.

**Route** (memory: the two-session registry route, CR-24). **Stage A**: an app-repo session applies §A (logo), §B
(registry, 10 lines) and §C (backlog), and commits. **Stage B**: a data-repo session applies §D (anchor policy) and §E
(registry byte copy), and commits. Push after Anton's sign-off: app first, then data **the same day**. Between the
two pushes the daily `registry-mirror.yml` run is red, and that red is the sync still owed.

---

## 1. Triage — every entry W1 lists, verified against live source

| id | verdict | evidence (verified 2026-10-10) |
|---|---|---|
| D-1 byes | **close** | Served `nfl/season-totals/2026.json` (manifest `lastModified` 2026-10-09T13:09Z): 1,807 `'B'` slots on 1,807 rows with `byeWeeks > 0` (1,743 player rows + 32 `TEAM_*` + 32 bare-abbr DEF rows). 2024 and 2025 have zero `'B'` (`P`/`D`/`X` only); that is the forward-only decision already recorded. Writer: `lib/sleeper.mjs:323,364` (data `2b06c5b`). |
| D-5 `inProgress` re-seal | **close** (already marked RESOLVED; title not struck) | `scripts/update-nfl.mjs:104` seals `year − 1` and `:109` seals the skip path, both through `setManifestInProgress` (data `c66ff88`). Manifest `nfl/season-totals/2025.json` reads `inProgress: false`. |
| D-6 snapshot v3 mirroring | **close** | All five asks hold. `scripts/register-snapshots.mjs:65` only checks that `schemaVersion` is a number, and `:92` records it. `scripts/grade-snapshot.mjs` and `lib/panel.mjs` never read `schemaVersion`. README `:260-329` has the v3 envelope and an `inputStatus` section (data `d14405b`). Fixture `test/fixtures/grade-snapshot-v3.json` exists (data `be514ca`). `data-catalog.md:80` says v3 (`d14405b`). Data CLAUDE.md Invariant 4 says "projection snapshots **v3**". |
| D-7 retroactive Mirror record | **close** (sits under Done; title not struck) | No data action, as the entry says. On its open question (retire the export ZIP's `college/` route or record it as dormant): the route is still live (`src/utils/exportData.js:16-24`), and CR-05's App side has described it accurately since app `969a6ef` ("an unlisted producer … an export now writes pivoted objects into that ZIP path"). So it is recorded as dormant, and nothing more is owed. |
| D-15 anchor-policy, 3 dates | **close** | `grading/anchor-policy.md` was written with the three rookie dates at data `be514ca`. Today it has eight boundaries (latest data `9927921`). |
| D-17 CR-15 versioned mirror | **close** (already marked RESOLVED; title not struck) | `lib/projectionFactors.mjs:97-98` has `REGRESSION_MODELS = ['legacy','step4-upside']` and `CURRENT_REGRESSION_MODEL`. Data `e802e73` (PR #10) and `85fd906` (PR #12). |
| D-18 anchor-policy, boundary 4 | **close** | All five content items are in the file: the retitle ("mechanism-version segmentation"), the path-scoped veteran rule, date-table row 4, the verified veteran segments, and "Boundaries by path". Data `0161e2d`, fix `7b4894e`. |
| D-19 + D-20 registry sync | **close**, including its optional residue (§B) | Data `cf7d1fb` (already RESOLVED). The "optional wording" residue is still open in live source. CR-02's Mirror still says `availabilityGrid.js:4` *states* "never emit `'B'`", but that comment was corrected (`:3-8` now describes the forward `'B'`), and `gameLog.js:130-160` is now `:154-157`. CR-11's Mirror blast-radius sentence names Market's `SNAP%` column but not My Team's `SNAP` (`Portfolio.jsx:404`). §B fixes both. |
| D-22 stored `TEAM_*` pruning | **close**: premise no longer holds | No app module reads **stored** `TEAM_*` rows. Every `TEAM_*` read is of Sleeper weekly live-API rows: `weeklyUsage.js:26,165`; `opponentStrength.js:88` (via `api/defenceWeekly.js`); `inSeasonScoring.js:384,421` (via `api/qbWeekly.js`); `liveSeasonLog.js:23,107`; `weeklyRanks.js:76` (a skip). Store-path code only excludes them (`teamContext.js:36`). The `isDefenseRowId` the entry cites (`opponentStrength.js:39`) no longer exists. So a data-side prune of stored `TEAM_*` rows breaks no app surface. If an app module ever reads stored `TEAM_*` rows, it is a CR-02 Triggers addition at that point, not this entry. |
| D-40 `teamcontext/2026.json` absent | **close** | First committed at data `4896b29` (2026-09-27). Manifest: 98 rows, 32 teams, `lastModified` 2026-10-04 (weekly cron, Sun 13:53 UTC). The panel's empty state gates on `liveTeamContext.complete` (`OffencesOwned.jsx:48,76`), so it now fills. |
| D-42 Phase 1 registry sync | **close** | Data `4ebb68d` ("mirror registry D-42 (app 0b22ea7)"). The CR-18 check: `data-catalog.md`'s season-totals row lists no app consumers, so nothing is added there. The `[registry-stale]` residual is moot. CR-01 was rewritten by 2b-2 (app `963447b`) and names Market's In-season GP/ROS cells. Its Market anchors `:509,577` are current (`factors` / `proj` reads), and `inSeasonEvidence.js` no longer reads `projectedPPG`. The span is byte-identical today (`REGISTRY_MIRROR=1` registry-mirror 21/21; last CR-24 run green, 2026-10-10 14:02 UTC). |
| D-16 2026-class debut append | **watch** | Calendar. See §C.3. |
| D-44 regime-aware grading | **watch** | Calendar: the first grade of a 2026-target snapshot. See §C.3. |
| D-52 rest-of-season grader | **watch** | Calendar: a full ROS outcome and 2026 actual games need the season to end. See §C.3. |
| D-60 Q5 sample floor | **watch** | The flagged-with-S+1 sample is 13 of 20. It grows only when a rookie class's S+1 season completes (2025 rookies → after 2026). See §C.3. |
| D-66 registry staleness list | **close** (filed and struck in the same commit; §B items 1, 2, 5, 6, 9–11) | Never filed. Queued as "pending D-66" by `projected-games-calibration.md:560`, `games-calibration-cause-split.md:616` and `games-calibration-short-only.md:394` (data), and named by app `short-season-wiring.md:270`. Short-season C1 (`9927921`) already landed part of it: CR-28 Triggers gained `games-short-run.mjs`, `accountWeeks` and `causeVeterans`. Still stale in live source: CR-01 omits the snapshot readers `scripts/absence-run.mjs:267`, `scripts/games-calibration-run.mjs:248` and `causeVeterans` (`scripts/games-cause-run.mjs:229,234`). CR-28's Data side says `lib/durabilityMirror.mjs` is "for `--absence`" only, though it is imported at `lib/gamesCalibration.mjs:35`, `scripts/games-calibration-run.mjs:25` and `scripts/games-cause-run.mjs:22`. CR-28 omits the status classifiers `statusClass` (`lib/gamesCalibration.mjs:81`), `causeStates`/`rosterCause` (`:423,408`) and `hasReserveListing` (`scripts/absence-run.mjs:125`, `scripts/games-calibration-run.mjs:56`). Also (review flag 3): CR-11 omits `lib/durabilityMirror.mjs` `activeSnapShare` (`:49-51`, `off_snp`/`tm_off_snp`). |
| D-67 DM parity, short-season | **watch** | The first post-boundary-8 capture has not landed. `snapshots/2026-10-09.json` is the latest; daily runs land around 21:00–21:25 UTC. See §C.3 and decision D4. |

**Found in passing.** The boundary-7 cross-check (`anchor-policy.md`, "Cross-check (to be confirmed)": Stage B's
2026 impact movers in the first post-push capture) has **no backlog entry**. The plan's L5 sign-off lists it as open,
and post-push captures (`snapshots/2026-10-07.json` onward) exist. §C.4 appends it as **D-68**. The id D-66 was reserved for the pending registry list (the next row in the table) and is used for it.

**Remaining open (not W1):** D-2, D-65 (W5); D-9, D-10, D-12, D-14, D-50, D-54, D-68 (W2); D-13, D-55, D-56 (W3);
D-45, D-46, D-47 (W4). None was re-verified beyond the L2 triage (2026-10-04), because W1 does not change them.

## 2. Decisions

- **D1: Offences-you-own logos: add them.** The change is one import line in `OffencesOwned.jsx`, and it shifts
  exactly two registry anchors: CR-10 Triggers `:24,49,52,55` → `:25,50,53,56` and CR-16 App side `:52` → `:53`. No
  other doc anchors that file by line (checked `docs/`, CLAUDE.md; the signal-registry row names the file without
  lines). W1 already owes a registry edit and a data byte copy for D-19's stale CR-02 sentence, so the two anchors
  ride the same sync at no extra session or red-window cost. That meets "trivial". If Anton would rather not take the
  logo, drop §A, §A.5's nav-doc line and §B items 4 and 8. The sync still runs for the D-19 residue and D-66, with 8
  lines instead of 10.
- **D2: D-19's optional wording is applied, not closed as won't-do.** The CR-02 sentence is factually stale: it
  asserts what an app comment *states*, and that comment now says the opposite. CR-11's clause is a one-clause
  addition to a line W1 already touches. Both are Mirror text, so they belong to both repos (§B, §E).
- **D3: re-section the backlog.** Today 14 open entries sit under `## Done` (D-44 … D-67), and 5 closed ones sit under
  `## Open`. W1 makes the headings true: `## Open` (work owed), a new `## Watch` (dated, with a named trigger), then
  `## Done`. Moves are verbatim block moves, gated by a sorted-line diff (§C.6).
- **D4: D-67's trigger is a rule, not a date.** It is "the first daily capture whose `capturedAt` is after the
  boundary-8 app push (2026-10-10T12:45:38Z)". That is expected to be `snapshots/2026-10-10.json` tonight. The plan's
  "on or after 2026-10-11" is one day conservative: tonight's capture is post-push. The fix pass `59fc51d` (pushed
  13:06:03Z) is display-only (§D.2), so it does not move the trigger.
- **D5: carry D-66 in this sync (plan-gate flags 2–3).** Every source that queued it says "owed at the next
  registry sync", and W1 is that sync. The six lines add no session and no red window. They are data-side Trigger
  and Data-side text only, about files that already exist. The text was checked by the repo's own symbol resolver (§B).
- **D6: no wave tags on the remaining entries.** The plan file maps them to waves. Writing that mapping into 15
  entries would add churn for no reader.

## Cross-repo impact

- **CR-02, CR-11 (Mirror text):** §B items 3 and 7. Both repos, two-session route, Stage B byte copy.
- **CR-01, CR-11, CR-28 (Data side / Triggers, data half):** §B items 1, 2, 5, 6, 9, 10, 11 (D-66). These record
  existing data-side readers; no data code changes, so no data Mirror action follows. `test/registry.test.mjs`
  resolves the new symbol claims after the Stage B byte copy.
- **CR-10 (Triggers), CR-16 (App side):** line-anchor refresh after §A (§B items 4 and 8). App side only in meaning; the
  span is byte-mirrored.
- **CR-18:** no change. The logo is not a signal, and `docs/signal-registry.md`'s team-context row names
  `OffencesOwned.jsx` without line anchors.
- **CR-24:** red from the app push until Stage B's byte copy lands the same day.
- **Mirror text owed to the data side:** exactly the §B replacement strings, carried by the byte copy. No data
  logic is affected: CR-02's corrected sentence describes app comments, and CR-11's adds a consumer to the blast radius.

---

## §A. Offences-you-own logo (Stage A, app repo)

File `src/components/week/OffencesOwned.jsx` (132 lines at `59fc51d`).

1. After line 10 (`import { normalizeTeamForSchedule } from '../../utils/nflStats'`), insert one line:
   `import { TeamLogo } from '../dp/SleeperImages'`. This is the same import `DefencesFaced.jsx:15` uses. Keep the
   blank line that follows.
2. Replace the TEAM cell (line 100 before the insert) with the `DefencesFaced.jsx:115-120` pattern:
   ```jsx
   <td className="px-[18px] py-2.5 font-dp-mono font-semibold text-dp-text">
     <span className="inline-flex items-center gap-1.5">
       <TeamLogo team={r.team} size={14} />
       {r.eraTeam}
     </span>
   </td>
   ```
   **`r.team`, never `r.eraTeam`.** `teamLogoUrl` accepts only the Sleeper domain (`sleeperImages.js:3-4`, CR-16),
   so `LA` would render no logo for the Rams. `r.team` is the roster team (Sleeper domain, never `'FA'`; `:39`).
   The visible code stays `r.eraTeam`, as today.
3. Check: `sed -n '25p;50p;53p;56p'` shows `getTeamSeasonRows`, `buildTeamMetricsTable`, `normalizeTeamForSchedule`
   and `getTeamWeekRow` respectively. If any line differs, stop: §B items 4 and 8 would be wrong.
4. Test (`OffencesOwned.test.jsx`, new `it`). A `LAR`-rostered row renders one `team-logo` img inside
   `offences-owned-LAR` whose `src` ends `/team_logos/nfl/lar.png`, and that `<td>`'s `textContent.trim()` is exactly `'LA'`. A `toContain('LA')` would also pass on `LAR`, the trap the
   file's first test already warns about (`:39-41`). Run it
   red first (before step 2) and then green.
5. **Nav doc** (`docs/nav/components.md:13`, the `week/OffencesOwned.jsx` row). After "CR-16 hop via
   `normalizeTeamForSchedule` on each roster team before lookup.", insert: "TEAM cell: `dp/SleeperImages.jsx`'s
   `TeamLogo` on the roster (Sleeper-domain) team, beside the era-accurate code." This follows the `:12` DefencesFaced
   precedent.
6. Smoke-test `/week` with the dev server (CLAUDE.md → Workflow convention recipe). Every Offences-you-own row shows a
   logo beside its code, the Rams row included. Screenshot for the hand-back. A missing logo on a CDN 403/404 is the
   documented fallback, not a defect.

## §B. Registry (Stage A, app repo `docs/cross-repo-registry.md`, mirrored span only)

Line numbers are at `59fc51d`. Every item is one substring replacement inside one physical line; nothing gains a line
break. Items 9 and 10 both touch line 312. The `>` quote markers are not part of the text. Session 1 applied all 11 to a
scratch copy: each old string occurs exactly once on its line, 10 physical lines change, and the data repo's symbol-claim
check (`extractSymbolFileClaims` + `symbolResolvesIn` from `lib/registry.mjs`, the same check `test/registry.test.mjs`
runs) resolves all 444 data-side claims in the edited span (429 before; the 15 new claims resolve too).

1. **CR-01 Data side (line 49; D-66).** Replace, verbatim (exactly one occurrence on that line):
   > renaming `qbTakeoverBasis` in `lib/qbRookieLevel.mjs`'s read of the same snapshot

   with:
   > renaming `qbTakeoverBasis` in `lib/qbRookieLevel.mjs`'s read of the same snapshot. The offline `--absence`/`--games-calibration` runners read one pinned snapshot's `players[id].projection` (`confidence` to select veterans; `projectedPPG` for the rank-impact sections): `scripts/absence-run.mjs`, `scripts/games-calibration-run.mjs`, and `causeVeterans` in `scripts/games-cause-run.mjs` (also called by `scripts/games-short-run.mjs`)

2. **CR-01 Triggers (line 52; D-66).** Replace, verbatim (exactly one occurrence on that line):
   > `lib/snapshot-capture.mjs`, `scripts/capture-snapshot.mjs`

   with:
   > `lib/snapshot-capture.mjs`, `scripts/capture-snapshot.mjs`, `scripts/absence-run.mjs`, `scripts/games-calibration-run.mjs`, `causeVeterans` in `scripts/games-cause-run.mjs`

3. **CR-02 Mirror (line 61; D-19 residue).** Replace, verbatim (exactly one occurrence on that line):
   > — this **falsifies a written app-side assumption with no app-side diff**: `src/utils/availabilityGrid.js:4` states the served season-totals *"never emit `'B'`"*, and `src/utils/gameLog.js:130-160` already renders a `kind: 'bye'` row straight off served `weeklyStatus` — so forward seasons now produce real bye rows in `dp/GameLogSection.jsx` with no app-side code change at all. Correct the app comment in the same change.

   with:
   > — this **falsified a written app-side assumption with no app-side diff**: `src/utils/availabilityGrid.js`'s header then said the served season-totals *"never emit `'B'`"* (since corrected, `:3-8`), and `src/utils/gameLog.js:154-157` renders a `kind: 'bye'` row straight off served `weeklyStatus` — so forward seasons produce real bye rows in `dp/GameLogSection.jsx` with no app-side code change (served 2026 carries `'B'`; 2012–2025 keep `'X'` at every bye).

4. **CR-10 Triggers (line 124; logo).** Replace, verbatim (exactly one occurrence on that line):
   > `src/components/week/OffencesOwned.jsx:24,49,52,55`

   with:
   > `src/components/week/OffencesOwned.jsx:25,50,53,56`

5. **CR-11 Data side (line 129; D-66 / review flag 3).** Replace, verbatim (exactly one occurrence on that line):
   > `lib/backtest.mjs` (`computeTeamTotals`, `buildCohortRows`), `lib/projectionFactors.mjs`

   with:
   > `lib/backtest.mjs` (`computeTeamTotals`, `buildCohortRows`), `lib/projectionFactors.mjs`, `lib/durabilityMirror.mjs` (`activeSnapShare` — `off_snp`/`tm_off_snp`, the contributor-season test)

6. **CR-11 Triggers (line 132; D-66 / review flag 3).** Replace, verbatim (exactly one occurrence on that line):
   > `lib/panel.mjs`, `lib/backtest.mjs`, `lib/projectionFactors.mjs`

   with:
   > `lib/panel.mjs`, `lib/backtest.mjs`, `lib/projectionFactors.mjs`, `activeSnapShare` in `lib/durabilityMirror.mjs`

7. **CR-11 Mirror (line 133; D-19 residue).** Replace, verbatim (exactly one occurrence on that line):
   > Market's Efficiency `SNAP%`/`RZ SH` columns go blank the same way, and

   with:
   > Market's Efficiency `SNAP%`/`RZ SH` columns go blank the same way, as does My Team's `SNAP` column (`portfolio/Portfolio.jsx`'s `buildUsageHistory` call), and

8. **CR-16 App side (line 168; logo).** Replace, verbatim (exactly one occurrence on that line):
   > `src/components/week/OffencesOwned.jsx:52`

   with:
   > `src/components/week/OffencesOwned.jsx:53`

9. **CR-28 Data side (line 312; D-66).** Replace, verbatim (exactly one occurrence on that line):
   > (offline mirror of the app readers, for `bin/backtest.mjs --absence`, parity-pinned to

   with:
   > (offline mirror of the app readers, for `bin/backtest.mjs --absence` and every `--games-calibration` mode — imported by `lib/gamesCalibration.mjs`, `scripts/games-calibration-run.mjs` and `scripts/games-cause-run.mjs`, and reached by `scripts/games-short-run.mjs` through the last — parity-pinned to

10. **CR-28 Data side (line 312; D-66).** Replace, verbatim (exactly one occurrence on that line):
   > holds its fit and the in-season override check.

   with:
   > holds its fit and the in-season override check. Offline readers that classify rosterweekly statuses themselves: `statusClass` / `accountWeeks` / `causeStates` / `rosterCause` in `lib/gamesCalibration.mjs`, and `hasReserveListing` in `scripts/absence-run.mjs` and in `scripts/games-calibration-run.mjs`.

11. **CR-28 Triggers (line 324; D-66).** Replace, verbatim (exactly one occurrence on that line):
   > `SHORT_CANDIDATES` / `enrichRow` / `accountWeeks` in `lib/gamesCalibration.mjs`, `causeVeterans` in `scripts/games-cause-run.mjs`

   with:
   > `SHORT_CANDIDATES` / `enrichRow` / `accountWeeks` / `statusClass` / `causeStates` / `rosterCause` in `lib/gamesCalibration.mjs`, `causeVeterans` in `scripts/games-cause-run.mjs`, `hasReserveListing` in `scripts/absence-run.mjs`, `hasReserveListing` in `scripts/games-calibration-run.mjs`

**Gates.** (a) `git diff -U0 docs/cross-repo-registry.md | grep -c '^+[^+]'` = **10**, and the changed lines are 49,
52, 61, 124, 129, 132, 133, 168, 312 and 324. (b) No sentinel literal and no `sed` range literal appear in any new text.
(c) The span md5, taken from the line *equal to* `<!-- CR-REGISTRY-BEGIN -->` through the line equal to
`<!-- CR-REGISTRY-END -->`, joined with `\n` and with no trailing newline, is `e0b83c4ae4571d72a9af56d359ab2394`
(Session 1's scratch result). The file also names the sentinels in prose, so a substring match over-extracts. Hand
the md5 back. (d) `npm test`, `npm run lint`, `npm run build`.

## §C. Backlog (Stage A, app repo `.claude/tasks/data-repo-backlog.md`)

Convention: strike the title (`### ~~D-n · …~~`) and add a bold **✅ RESOLVED** or **✅ CLOSED** line directly under
it. Never delete an entry's body.

1. **Strike and close** (the line under the title; keep any existing RESOLVED line below it):
   - **D-1**: "**✅ RESOLVED — verified 2026-10-10 (backlog-hygiene-w1).** Served `nfl/season-totals/2026.json`
     carries 1,807 `'B'` slots (1,743 player rows + 32 `TEAM_*` + 32 DEF rows, each with `byeWeeks > 0`); 2024/2025 carry none, by the forward-only
     decision below. Writer `lib/sleeper.mjs:323,364` (data `2b06c5b`)."
   - **D-5**: title strike only; then append to its RESOLVED line: " Verified 2026-10-10: `scripts/update-nfl.mjs:104,109`
     seal via `setManifestInProgress`; manifest 2025 reads `inProgress: false`."
   - **D-6**: "**✅ RESOLVED — verified 2026-10-10 (backlog-hygiene-w1).** Every ask holds: the registrar gates only on
     a numeric `schemaVersion` (`scripts/register-snapshots.mjs:65,92`); `grade-snapshot.mjs`/`lib/panel.mjs` never
     read it; README v3 envelope + `inputStatus` (data `d14405b`); fixture `test/fixtures/grade-snapshot-v3.json`
     (data `be514ca`); `data-catalog.md` snapshots row v3 (`d14405b`); data CLAUDE.md Invariant 4 names v3."
   - **D-7**: "**✅ CLOSED 2026-10-10 (backlog-hygiene-w1)** — no data action, as recorded. The `college/` export route
     stays as deliberately dormant: still live (`src/utils/exportData.js:16-24`) and described accurately in
     CR-05's App side since `969a6ef`."
   - **D-15**: "**✅ RESOLVED** — `grading/anchor-policy.md` written at data `be514ca` with all three rookie dates;
     superseded by the boundary 1–8 table (latest data `9927921`)."
   - **D-17**: title strike only.
   - **D-18**: "**✅ RESOLVED** — data `0161e2d` (fix `7b4894e`): retitled to mechanism-version segmentation,
     path-scoped veteran rule, row 4, verified veteran segments, Boundaries by path."
   - **D-19 + D-20**: title strike; then append to the end of its "Optional wording" list: "**✅ Both applied
     2026-10-10 by backlog-hygiene-w1 Stage A** (the commit carrying this line): the CR-02 sentence now reads in
     the past tense with current anchors (`availabilityGrid.js:3-8`, `gameLog.js:154-157`), and CR-11's
     blast-radius sentence names My Team's `SNAP`. Data byte copy: data task `backlog-hygiene-w1.md` §E."
   - **D-22**: "**✅ CLOSED 2026-10-10 (backlog-hygiene-w1) — premise no longer holds.** No app module reads stored
     `TEAM_*` rows; every read is of Sleeper weekly live-API rows (`weeklyUsage.js`, `opponentStrength.js` via
     `defenceWeekly.js`, `inSeasonScoring.js` via `qbWeekly.js`, `liveSeasonLog.js`, `weeklyRanks.js`), and
     store-path code only excludes them (`teamContext.js:36`). A data-side prune of stored `TEAM_*` therefore
     breaks no app surface. A future stored-path reader is a CR-02 Triggers addition, not this entry."
   - **D-40**: "**✅ RESOLVED** — `nflverse/teamcontext/2026.json` committed from data `4896b29` (2026-09-27);
     weekly refresh (Sun 13:53 UTC). The panel fills as specified."
   - **D-42**: "**✅ RESOLVED** — data `4ebb68d` mirrored app `0b22ea7`. CR-18: `data-catalog.md`'s season-totals
     row lists no app consumers, so nothing to add. The CR-01 residual is moot: 2b-2 (`963447b`) rewrote CR-01
     (Market In-season cells; `:509,577` current) and `inSeasonEvidence.js` no longer reads `projectedPPG`."
2. **Open → title unchanged:** D-2, D-9, D-10, D-12, D-13, D-14, D-45, D-46, D-47, D-50, D-54, D-55, D-56, D-65.
3. **Watch.** Add this line directly under each title (the body is unchanged):
   - **D-16**: "**Watch (dated 2026-10-10).** Trigger: the 2026 regular season is complete, at the first
     season-totals run on or after **2027-01-05** (week 18 ends 2027-01-03). Then append the 2026 class's debut
     outcomes and re-check the QB asymptote."
   - **D-44**: "**Watch (dated 2026-10-10).** Trigger: the first grade of a 2026-target snapshot, which cannot happen
     before the 2026 regular season completes (≥ **2027-01-05**). This entry blocks that grade."
   - **D-52**: "**Watch (dated 2026-10-10).** Trigger: 2026 regular season complete (≥ **2027-01-05**). Then run the
     full ROS grade, the S+1 `inSeason.next` grade (later, once 2027 completes), and the L6c games check. An interim
     checkpoint grade is optional and not owed."
   - **D-60**: "**Watch (dated 2026-10-10).** Trigger: once the 2026 season completes (≥ **2027-01-05**), recount the
     flagged-with-S+1 sample (13 today; the 2025 class adds its S+1 then). Re-run only at ≥ 20 players."
   - **D-67**: "**Watch (dated 2026-10-10).** Trigger: the first daily capture whose `capturedAt` is after
     **2026-10-10T12:45:38Z** (the boundary-8 app push). That is expected to be `snapshots/2026-10-10.json` tonight,
     or else the next one. Display-only fix `59fc51d` (13:06:03Z) does not move it."
4. **Append D-68** at the end of `## Open`:
   ```
   ### D-68 · Confirm anchor-policy boundary 7's cross-check
   **Found:** backlog-hygiene-w1 (untracked since absence-classification Stage C, data `0866b8c`) · **Blocking:** no · **Size:** small — runnable now

   `grading/anchor-policy.md` "Veteran rows — boundary 7" carries "Cross-check (to be confirmed)": for Stage B's 2026
   impact movers (`grading/2026-10-06-absence-verdict.md`), the first capture after the 2026-10-07 06:50 UTC data
   push and its CDN purge must show `projection.projectedGames` and `factors.injurySeasons` equal to the verdict's
   "after" values. Captures from `snapshots/2026-10-07.json` on exist. Note: boundary 8 (2026-10-10 12:45 UTC) moves
   `projectedGames` again on `'short'`/`'none'` rows, so check a capture before it (2026-10-07 … 2026-10-09).
   Replace "to be confirmed" with a confirmed line (counts), as D-62 did for boundaries 5 and 6.
   ```
   **And file D-66, already struck**, at the top of `## Done` (above the 11 entries from item 1):
   ```
   ### ~~D-66 · Registry staleness from the games-calibration slices (CR-01, CR-11, CR-28 data side)~~
   **✅ RESOLVED 2026-10-10 by backlog-hygiene-w1 Stage A** (the commit carrying this entry; data byte copy per data task `backlog-hygiene-w1.md` §E).
   **Found:** data `projected-games-calibration.md`, `games-calibration-cause-split.md`, `games-calibration-short-only.md` (queued as "pending D-66", never filed) · **Blocking:** no · **Size:** small

   CR-01 Data side and Triggers name the offline snapshot readers `scripts/absence-run.mjs`,
   `scripts/games-calibration-run.mjs` and `causeVeterans` (`scripts/games-cause-run.mjs`, also reached by
   `games-short-run.mjs`). CR-28 Data side names every importer of `lib/durabilityMirror.mjs` and the offline status
   classifiers; its Triggers add `statusClass`/`causeStates`/`rosterCause` and both `hasReserveListing` copies. CR-11
   names `lib/durabilityMirror.mjs` `activeSnapShare` (`off_snp`/`tm_off_snp`). Part of the list had already landed
   with short-season C1 (data `9927921`).
   ```
5. **Re-section (D3).** The final order is `## Open`, `## Watch`, then the unchanged `## Pre-existing data-repo
   backlog — recorded there, not here`, then `## Done`. Open holds the 14 ids in item 2 plus D-68, in ascending id
   order. Watch holds the 5 ids in item 3, in ascending order. Done holds every struck entry: the existing Done order
   stays; D-66 (item 4) then the 11 entries closed in item 1 go at its top, the 11 in descending id order (D-42 first). Each `---` separator
   stays where it is relative to its section.
6. **Structure.** `## Watch` gets the same framing as the other sections: a blank line, then the heading, then a
   blank line before its first entry, and a `---` line plus a blank line before the next `##` heading, as `## Open`
   ends today.
7. **Gate.** Compare non-blank, non-separator lines only:
   `diff <(git show HEAD:.claude/tasks/data-repo-backlog.md | grep -v '^[[:space:]]*$' | grep -vx -- '---' | sort) <(grep -v '^[[:space:]]*$' .claude/tasks/data-repo-backlog.md | grep -vx -- '---' | sort)`.
   It must list only these: the 11 struck titles (old `<`, new `>` pairs; D-17's is the only change on its line);
   the D-5 RESOLVED line (old/new pair, text appended); the D-19 + D-20 "Optional wording" appended line; the 8 new
   RESOLVED/CLOSED lines (D-1, D-6, D-7, D-15, D-18, D-22, D-40, D-42); the 5 Watch lines;
   D-68's and D-66's non-blank lines; and `## Watch`. Any other line means a block was altered in transit. Also,
   `grep -c '^### '` must equal the pre-edit count + 2 (D-68, D-66), and `grep -c -- '^---$'` must equal the
   pre-edit count + 1.

**Stage A commit** (one): `backlog-hygiene-w1 A: Offences-you-own logos; registry CR-02/CR-11 Mirror text, CR-01/11/28 data-side readers (D-66), CR-10/CR-16 anchors; backlog close/watch/re-section, D-66, D-68`.
Hand back the SHA, the span md5, the gate outputs and the screenshot. **Do not push.**

---

## §D. Anchor policy (Stage B, data repo `grading/anchor-policy.md`)

1. **Section order.** Move the whole `### Veteran rows — boundary 7 (input correction)` section (from its heading
   through the line before `## Boundaries by path`) verbatim so that it sits **before** `### Veteran rows — boundary 8
   (short-season rule)`. Boundaries then read 5, 6, 7, 8. Gate: the sorted-line diff of the file before and after this
   step is empty.
2. **Boundary-8 note.** In the boundary-8 section, after the bullet "The in-season healthy override lives only in the
   app's displayed copy, never in a snapshot `projection`.", insert:
   > - **Post-push display fix, not a boundary:** app `59fc51d` (pushed 2026-10-10 13:06:03 UTC, 20 min after the
   >   boundary push) extends the healthy override to the QB start-chain branch of `applyInSeasonProjection`
   >   (displayed `projectedGames` only; the chain total never reads games). `writeProjectionSnapshot` reads the raw
   >   `seasonProjections`, so no capture differs on it and nothing segments on it.
3. Commit: `anchor-policy: boundary 7 before 8; boundary-8 note on the display-only fix 59fc51d (backlog-hygiene-w1)`.

## §E. Registry byte copy (Stage B, data repo)

Precondition: Stage A's commit is in the sibling checkout (`git -C ../sleeper-dashboard log -1`), and its span md5
equals the one Stage A handed back.

1. Replace the data span with the app span byte for byte: the sentinel lines and everything between them. Nothing
   outside the span changes.
2. Gates: the span md5 equals Stage A's. `git diff -U0 cross-repo-registry.md | grep -c '^+[^+]'` = **10** (CR-01 Data side
   and Triggers; CR-02 Mirror; CR-10 Triggers; CR-11 Data side, Triggers and Mirror; CR-16 App side; CR-28 Data side
   and Triggers). Data-file line numbers differ from the app's, but the count does not. `REGISTRY_MIRROR=1 node --test test/registry-mirror.test.mjs` passes
   21/21. `node --test test/registry.test.mjs` (this resolves the 15 new symbol claims), `npm test` and `npm run smoke` are all green.
3. Commit: `Registry span byte copy from app <A> (CR-02/CR-11 Mirror text, CR-01/11/28 data-side readers, CR-10/CR-16 anchors; backlog-hygiene-w1)`.
4. Commit this task file: `Task file: backlog-hygiene-w1 (W1) — plan, review record`.

## Done-definition

- **A:** §A test red→green, smoke screenshot, §B gates (10 lines, md5), §C gates (sorted diff, heading count), one
  commit, no push.
- **B:** §D gate (empty sorted diff for the move), §E gates, three commits, no push.
- Push after sign-off: app, then data, the same day.

## Files touched

App: `src/components/week/OffencesOwned.jsx`, `src/components/week/OffencesOwned.test.jsx`, `docs/nav/components.md`,
`docs/cross-repo-registry.md` (span, 10 lines), `.claude/tasks/data-repo-backlog.md`. Data: `grading/anchor-policy.md`,
`cross-repo-registry.md` (span, 10 lines), this task file.

## Review record — plan gate round 1 (2026-10-10)

plan-reviewer (full depth; it ran as general-purpose on opus with the agent's mandate inlined, because the
`plan-reviewer` type is not registered in parent-folder sessions) returned 6 flags and no MIRROR block. Each was
verified against live source, and all 6 are applied.

| # | flag | decision |
|---|---|---|
| 1 | D-1 "1,743 'B' slots" is wrong; the file has 1,807 (64 `TEAM_*`/DEF rows) | Applied. Session 1 had counted numeric-id rows only. Both lines now give 1,807 with the split. |
| 2 | The pending D-66 list was never filed, and parts are still stale (CR-01 snapshot readers; CR-28 `durabilityMirror` "for `--absence`" only) | Applied as D5. Re-derived against live source; C1 had already landed part of it. §B items 1, 2, 9–11; filed and struck in §C.4. |
| 3 | CR-11 omits `lib/durabilityMirror.mjs` (`off_snp`/`tm_off_snp` at `:50-51`) | Applied: §B items 5–6 (Data side + Triggers, symbol `activeSnapShare`). The Mirror's "panel/backtest reconstructions" already covers it in meaning, so the Mirror text is not widened. |
| 4 | The §C.6 sorted-diff gate does not allow for added blank / `---` lines | Applied. The gate now filters blank and `---` lines, the Watch framing is stated (§C.6), and the `---` count is gated separately. |
| 5 | The §A.4 test "contains `LA`" passes on `LAR` | Applied: exact `textContent.trim() === 'LA'`. |
| 6 | `docs/nav/components.md:13` not updated for the logo | Applied: §A.5, and Files touched. |

Re-check after the fixes: §B's 11 replacements were re-run on a scratch copy of the app registry (10 lines change; all
444 data-side symbol claims resolve). The task file is about 34 KB.

## Verification — Stage A (2026-10-10)

App `c318487` (one commit on `59fc51d`, unpushed). Session 1 read the diff, not the hand-back:
- The registry file at `c318487` is byte-identical to Session 1's scratch result of §B. Span md5 `e0b83c4a…` matches.
- The backlog's sorted non-blank, non-`---` diff removes exactly the 12 expected lines. Headings and section order
  follow §C.5.
- `OffencesOwned.jsx` and its test follow §A. The test asserts the exact `'LA'` text and the `lar.png` src.

implementation-reviewer (run as general-purpose on opus with its mandate inlined) found **no blocking issues**. It
independently re-applied the 11 replacements and got the same file. It also compared every moved backlog entry block
by block: they differ only by the inserted status lines and D-5's appended text. The declared deviation (trailing
blank lines trimmed, so D-42's double blank line is gone) changed no content.

Not covered live: this roster has no Rams player, so the `LAR` → `lar.png` path is covered by the unit test only.
