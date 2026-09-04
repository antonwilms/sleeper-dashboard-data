# F-24 (field prune) + D-1 (byes) — post-review

Last items in the post-dp-v2 batch. D-4, D-3 and the app's schema ceiling have landed
(`02cf41d`, app `c72e170` / data `f3f10c8`, app `dad8c49` / data `6aacf15`); registry drift resynced
(`0b5294d`).

**Two rounds of measurement changed this item substantially.** Planning first over-reported the
prune's value by comparing pretty-printed against minified (44% — wrong), corrected to 5.6%, and then
review found the wire figures were taken at gzip -9 while jsDelivr serves **brotli**. §2 carries the
numbers at the encoding actually used. §5 is now a different shape than the tracker row implies.

---

## 1. Verified facts

| Fact | Evidence |
|---|---|
| **jsDelivr serves `content-encoding: br`, 346,819 B for the 2025 file.** Local brotli **q4** reproduces that byte count **exactly** (0.0% off), so q4 is the served setting | live `curl -I` + local `brotli` |
| At **brotli q4**: prune −8.1%, minify −19.5%, **both −26.1%** | measured, 2025 |
| The ordering is encoder-dependent — at q11 the prune would win (7.8% vs 4.7%) — but **q11 is not what is served**, so q4 governs | measured |
| **Season-totals files carry NO in-file `schemaVersion`.** They are a bare flat player map; the version lives **only** in the manifest entry | `nfl/season-totals/2025.json`, `manifest.json` |
| `scripts/update-nfl.mjs:96` **hard-codes `schemaVersion: 3`** in its `updateManifestEntry` call | measured |
| Served files are pretty-printed — `writeJsonStable` uses `JSON.stringify(v, null, 2)`, deliberately *"matching the existing data files"* | `lib/io.mjs:4-5,38` |
| Prune is 5.6% of the corpus **minified** (25.2 → 23.8 MB) — far less than the 12.9% occurrence share, because `idp_*` values are short integers while the bulk is `weeklyPoints`/`weeklyStatus`/`availability` | measured, 14 seasons |
| Sleeper's weekly payload: `gp` is `1` or **absent** (never `0`); all 786 non-playing entries carry a team, and **every one belongs to a team that played** | live `api.sleeper.com/stats/nfl/2025/6` (needs a User-Agent) |
| So `aggregateWeeks`' bye branch (`lib/sleeper.mjs:227-229`) is **unreachable** — bye-team players are omitted entirely | same |
| **`teamTracking.playedCounts` is a transient local of `aggregateWeeks`** and is never serialized — the served row keeps only the dominant `team` | `lib/sleeper.mjs:153` |
| **~76% of season-totals rows are single-team**, not 96% — planning measured on `gamelogs` (607 players who appeared) instead of the 2832-row season-totals population. Live recount: **2025 → 2142/2832 = 75.6%** (580 never played, 110 multi-team); 2023 → 76.6% | live Sleeper, per-week |
| **14 single-team rows in 2025 (20 in 2023) already hold `'D'` at their own team's bye week** — they appeared as a DNP under a different team that week | live Sleeper |
| `validateNflSeason` asserts **both** `byeWeeks === count('B')` **and** `dnpWeeks === count('D')` | `lib/validate.mjs:151-159` |
| **62 single-team 2025 rows are `LAR`** — the one divergence from the schedule domain | measured |
| 2012–2020 have **17** REG weeks; 2021–2025 have **18**. `weeklyStatus` is a fixed length-18 array. Field is `gameType` (**not** `game_type`) | `nflverse/schedule/*.json` |
| Four row-level fields plus the flat-map shape are load-bearing for app acceptance — `gamesPlayed`, `fantasyPoints`, `dnpWeeks`, `weeklyStatus` | `.claude/tasks/schema-ceiling-v4.md` §3a |

---

## 2. What each lever is actually worth (brotli q4, as served)

| Change | Wire | Schema bump | Invariant-1 carve-out | CR entries |
|---|---|---|---|---|
| **Minify** | **−19.5%** | no | **no** | **none** |
| **Prune** (F-24 as written) | −8.1% | yes (v4) | **yes** | **7** |
| Both | −26.1% | yes | yes | 7 |

**Minification is ~2.4× the prune's win and carries none of its cost.** The content is byte-identical;
only whitespace differs, so no consumer in either repo can observe it and no contract is touched.

The prune is still worth doing — the carve-out is approved, the app ceiling is already at 4, and 8.1%
plus a legible schema are real. But the tracker row's implied payoff was overstated, and **the larger
lever is one nobody asked for.**

**SETTLED (Anton, 2026-08-24): minify AND prune — the −26.1% path.**

**Minification's one real cost:** git diffs on those files become one line each. For append-only
season files that is close to free. **Scope it to `nfl/season-totals/` only** — never `manifest.json`,
which the session git workflow requires resolving as a hand-merged **union** during rebases.

**Two mechanics that make this safe, both verified:**
- **`writeJsonStable` has ~50 call sites across 18 files.** Do **not** change its default. Add an
  opt-in parameter (e.g. `writeJsonStable(path, value, { minify: true })`) and pass it only from the
  season-totals writer and the migration script. Every other family keeps 2-space indent.
- **`nflHash` hashes the parsed object, not the file bytes** (`JSON.stringify` over a sorted-key
  copy, `:26-30`). So minification does **not** perturb the idempotency skip or the content-hash
  dedup — a re-run against minified files still correctly reports "no change." Confirm this holds
  after the migration by re-running `bin/update.mjs nfl --year 2024 --dry-run` and seeing the
  skip fire.

---

## 3. The prune

Drop from **player rows only**: `idp_*` (17 keys) and `punt*` (6 keys).

**Not kicking** — all nine kicking keys appear in the `scoringSettings` of all 26 snapshots, and
`buildInBasisOutcomes` scores key-agnostically, so pruning them moves every one to `droppedTerms`.
**Not `bonus_*`** — same class of risk.

**A DENYLIST, never an allowlist.** CR-11's Invariant says its keys are *"never stripped or filtered by
any schema operation"*; an allowlist would strip exactly the keys CR-11/12/13/19 exist to protect,
which are load-bearing *with no visible consumer*. Filter on
`k.startsWith('idp_') || k.startsWith('punt')` and nothing else.

**Preserve:** the flat player map; `gamesPlayed`/`fantasyPoints`/`dnpWeeks`/`weeklyStatus`; every
`kr_*`/`pr_*`; all 32 `<abbr>` DEF rows entire (58 KB, and every `fan_pts_allow*` key lives there);
all 32 `TEAM_*` rows; CR-11/12/13/19's keys.

**Placement:** at the end of `aggregateWeeks`, after the sum loop — not inside it. The loop is the
named trigger of four CR entries and should stay a faithful sum.

---

## 4. The rewrite pass

A one-shot migration script (`scripts/migrate-f24-prune.mjs` — script-produced, so Invariant 2 holds):
read each season file → delete `idp_*`/`punt*` from every row's `stats` → write **minified** (§2,
settled) → update the manifest entry.

**`schemaVersion` is a MANIFEST-ONLY field.** Do **not** write a `schemaVersion` key into the season
files. Planning said "in every rewritten file" — that was wrong and would have broken the app: the
files are a bare flat map, and `isValidSeasonTotals` reads `Object.values(parsed)[0]` while
`validateNflSeason` iterates every top-level key as a player row. A stray `schemaVersion: 4` becomes a
"player" whose value is the number 4.

**Three other places carry the version and all must move to 4:**
- `scripts/update-nfl.mjs:96` — hard-codes `schemaVersion: 3`; without this the next forward `nfl`
  run silently regresses the manifest entry to v3 against v4 content.
- `CLAUDE.md:223` (Invariant 4, "NFL season-totals are at v3").
- `CLAUDE.md:179` (navigation map row, "schemaVersion 3").

**Guards, all required:**
- **`team`-field diff across all 14 seasons must be empty** — assert per-row equality before/after.
- **Row count and key set unchanged** except the two removed families.
- **`validateNflSeason` passes** on every rewritten file.
- **Do not `--force` re-derive.** A re-derivation re-runs the dominant-team resolution against today's
  Sleeper, and CR-02's Mirror is explicit that per-season `team` changes projections **with no
  app-side diff**. An in-place field delete cannot move `team` at all, which is why it is preferred.

**The Invariant-1 exception is not implicit** — state it in the commit **and** write it into
Invariant 1 itself:

> *Exception (F-24, 2026-08-24): completed seasons were rewritten once to drop `idp_*` and `punt*`
> fields. No reader in either repo consumed them. Rationale in commit `<sha>`.*

---

## 5. D-1 — forward-only, and why the backfill is dropped

**The backfill cannot execute D-1, and review proved it.** The mechanism planning specified —
`teamTracking.playedCounts` — is a **transient local of `aggregateWeeks`** that is never serialized.
A migration reading served files has only the season-grain dominant `team`, which §5 itself forbids
using (it produces phantom byes for traded players). The only way to recover per-week team during a
backfill is a **full re-derivation from Sleeper**, which is precisely the operation §4 avoids because
it can silently move `team`.

**Decision: D-1 lands forward-only, at ingest, and history keeps `'X'`.** This is a real scope
reduction from "pair it with F-24's pass," and it is the right trade: D-1 is cosmetic (proven —
`computeAvailability` builds segments only from `'D'`), while the backfill that would carry it is the
single riskiest operation in this batch. Do not spend the Invariant-1 carve-out on a cosmetic fix that
requires the dangerous path.

**Forward mechanism, at ingest:**

- Thread the schedule into `aggregateWeeks` (today it takes only `weekData`, `lib/sleeper.mjs:151`)
  and read each team's bye week(s) from `gameType === 'REG'`.
- Emit `'B'` **only when `playedCounts` holds exactly one team** — ~76% of rows. Multi-team and
  never-played rows keep `'X'`.
- **Write `'B'` only into a slot currently holding `'X'`.** Measured: 14 single-team rows in 2025 (20
  in 2023) already hold `'D'` at their own team's bye week, having appeared as a DNP under another
  team. Overwriting a `'D'` without decrementing `dnpWeeks` trips `validateNflSeason`; decrementing it
  invents a bye. Leave those alone.
- **Increment `byeWeeks`** alongside every flip, or validation throws.
- **Normalize the team through `normalizeTeamForSchedule`** before joining to the schedule — `LAR` is
  the one divergence, and **62 single-team 2025 rows are Rams** that would otherwise silently get no
  bye. This is a **CR-16** trigger.
- **Never write index 17 (week 18) for a 17-week season.** Derive the REG week count from the
  schedule; do not hard-code. `validateNflSeason` would not catch a phantom week-18 bye.
- **No schedule → no byes, no throw.** `bin/update.mjs nfl --year Y` does not own
  `nflverse/schedule/Y.json` (separate Friday Action), so a new season's ingest can legitimately run
  before it exists. Degrade silently rather than going red on the first run of a season.

---

## 6. Tests

- **Denylist** — a row carrying one key from each of CR-11/12/13/19 plus kicking, `bonus_*`,
  `kr_*`/`pr_*` survives untouched; only `idp_*`/`punt*` go.
- **Shape** — output is still a flat player map with no top-level non-player key; the four
  app-acceptance fields survive.
- **`team` unchanged** — fixture including a traded player.
- **D-1 single-team** — `'B'` written at the team's bye, `byeWeeks` incremented.
- **D-1 multi-team / never-played** — `'X'` kept, `byeWeeks` stays 0.
- **D-1 `'D'` collision** — a single-team row already `'D'` at its bye week is left as `'D'`, and
  `dnpWeeks` is unchanged.
- **D-1 `LAR`** — a Rams row joins the schedule and gets its bye.
- **D-1 week count** — a 17-week-season fixture never sets index 17.
- **`validateNflSeason`** passes on a fully migrated fixture, including both count assertions.

---

## 7. Cross-repo impact

**Seven entries fire, not five.** Review found three the draft missed. **Do not source the Mirror
texts from `post-dp-v2-data-batch.md` §8** — that file's CR-11 text is stale against live `README.md`
(it omits the dp-v2 Slice 5b clause) and it contains no CR-19, CR-08 or CR-16 at all. Take every
Mirror from the live registry region.

| Entry | Why it fires |
|---|---|
| **CR-02** | schemaVersion 3→4 and row composition |
| **CR-11 / CR-12 / CR-13 / CR-19** | the prune inserts the repo's **first write-side key filter** into the `Object.entries(stats)` loop at `lib/sleeper.mjs:216` that all four name as their data-side trigger |
| **CR-16** | D-1's `normalizeTeamForSchedule` join is exactly the schedule-domain composition this entry governs |
| **CR-08** | D-1's forward path makes `lib/sleeper.mjs` / `update-nfl.mjs` a live consumer of the served schedule's `gameType`/`homeTeam`/`awayTeam` shape — read by no season-totals code today |
| **CR-18** | 23 removed stat keys + `weeklyStatus` coverage change; the `docs/signal-registry.md` row edit is the deliverable |

**Two things belong in CR-02's mirror that the draft omitted:**
- **D-1 falsifies a written app-side assumption with no app-side diff.**
  `sleeper-dashboard/src/utils/availabilityGrid.js:4` states *"The SERVED (data-store) season-totals
  never emit `'B'`"*, and `src/utils/gameLog.js:130-160` emits a `kind: 'bye'` row straight off served
  `weeklyStatus` — so once forward seasons carry byes, **~2100 rows/season gain a bye row** in
  `dp/GameLogSection.jsx`. The app comment must be corrected in the same change.
- CR-02's Data side still reads *"written v3"*.

**Registry staleness to fix in passing:**
- CR-08's data-side triggers name only `update-schedule.mjs` / `MIN_SCHEDULE_GAMES` /
  `validateSchedule`; after §5 they must also name `aggregateWeeks` and `scripts/update-nfl.mjs`.
- **CR-11/12/13/19 all describe `RATE_KEYS` as *"the one key filter that exists on this data today"***
  — false the moment §3 lands. Four entries need that sentence corrected.
- Anchors: CR-02 gives `buildTeamTotalsForSeason` as `lib/panel.mjs:80` (live `:75`); CR-16 gives the
  era-domain guard as `lib/validate.mjs:515` (live `:537`).

**Ordering:** CR-02's Data side sits **inside** the `CR-REGISTRY-BEGIN`/`END` mirrored region, which
the drift check diffs byte-for-byte. Editing it here alone guarantees drift — **the identical edit
must land in the app repo in the same change.** Re-run the drift check afterwards.

---

## 8. Done-definition

- [ ] `writeJsonStable` default UNCHANGED; minify is opt-in and applied to `nfl/season-totals/` only
- [ ] `nflHash` skip still fires after migration (`--dry-run` on an unchanged season)
- [ ] Prune is a denylist of `idp_*`/`punt*`; kicking, `bonus_*`, returns, DEF/`TEAM_` rows and every
      CR-11/12/13/19 key verified present after the pass
- [ ] **No `schemaVersion` key written into any season file** — manifest only
- [ ] `schemaVersion: 4` in the manifest, `update-nfl.mjs:96`, `CLAUDE.md:179` and `CLAUDE.md:223`
- [ ] `team` diff across all 14 seasons is **empty**; row counts and key sets unchanged
- [ ] Invariant-1 exception written into Invariant 1 itself, not just the commit
- [ ] D-1 is **forward-only**; history untouched; `'B'` never overwrites `'D'`; `byeWeeks` matches
      `count('B')`; `normalizeTeamForSchedule` applied; index 17 never written for a 17-week season;
      missing schedule degrades silently
- [ ] `npm run smoke` green; `npm test` green; `manifest.json` parses
- [ ] Seven mirrors carried out **from the live registry**, not from the batch file; the four
      `RATE_KEYS` sentences corrected; CR-08 triggers extended; two anchors fixed
- [ ] CR-02's edit landed in **both** repos; drift check reports nothing
- [ ] App's `availabilityGrid.js:4` comment corrected in the app repo
- [ ] CDN purge for every rewritten file, manifest first
- [ ] App's full suite green against the rewritten files

---

## 9. Settled decisions

- **Minify + prune** (Anton, 2026-08-24) — the −26.1% path. Mechanics in §2.
- **Invariant-1 carve-out** for the one-time historical rewrite (Anton, earlier) — §4.
- **schemaVersion 3→4**, app ceiling already raised (`dad8c49`) — §4.
- **D-1 forward-only**, history keeps `'X'` — §5, forced by the transient-`playedCounts` finding.
- **Kicking and `bonus_*` stay unpruned** — §3.
