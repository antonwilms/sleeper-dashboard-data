# Schedule ingest — operational runbook

Manual operation of the nflverse schedule ingest that feeds `nflverse/schedule/<year>.json`
(consumed app-side by `src/api/nflSchedule.js`). The loader + consumer are shipped but inert
until the data side is backfilled and published.

## Entrypoint (naming ambiguity resolved)

The real entrypoint is **`node bin/update.mjs schedule`**.

- `bin/update.mjs` is the CLI dispatcher; its `schedule` case calls `updateSchedule()`.
- `scripts/update-schedule.mjs` is the **implementation module** (`export async function updateSchedule`),
  imported by the dispatcher — it is **not** a standalone runnable. Do not run it directly.

Confirmed flags (from `bin/update.mjs` arg parsing + `scripts/update-schedule.mjs` signature):

| Flag | Meaning | Notes |
|---|---|---|
| `--all` | Backfill every season ≥ `MIN_SCHEDULE_SEASON` (≥ 1999) | schedule subcommand only |
| `--year YYYY` | Write that one season | ignored if `--all` also passed (`--all` wins in `updateSchedule`) |
| (none) | Write current season only | the weekly Action's mode |
| `--dry-run` | Fetch + validate + print plan, **no writes** | |
| `--force` | Overwrite an existing **completed past-season** file (`year < currentSeason`) | only needed when a file already exists |

## How the pieces fit (no guessing — confirmed from source)

- **Manifest is written by the script itself.** `updateSchedule()` calls
  `updateManifestEntry({ path, recordCount, inProgress: false, schemaVersion: 1 })` after each
  file write (`scripts/update-schedule.mjs:104`). There is **no separate manifest step** — unlike
  `snapshots`, you do not run a second registration command.
- **Content-hash dedup.** Identical games for a season → no write, no manifest touch
  (`gamesHash` SHA-256 over gameId-sorted games).
- **Sparsity / not-published gates.** 0 rows → skip ("not published yet"); `< MIN_SCHEDULE_GAMES`
  (200) → skip ("preliminary"). See README → `nflverse/schedule/<year>.json`.
- **`inProgress: false` always** — CLAUDE.md invariant 5 (no app live fallback). Do not change.
- **Append-only.** CLAUDE.md invariant 1 governs completed past seasons; `--force` is the documented
  escape hatch and requires a committed diff explaining why.
- **`setStepOutput('season', …)` is single-season-mode only.** In `--all` mode the script does **not**
  emit a `season` output, so the Action-style single-season purge does not apply to a backfill — you
  must purge every file you actually wrote (see Step A6).

### Repo facts (this checkout)

- Remote: `git@github.com:antonwilms/sleeper-dashboard-data.git` (SSH push auth required).
- Default/published branch: `main` (jsDelivr serves `@main`).
- Repo owner for purge URLs: `antonwilms`.
- `nflverse/schedule/` does **not exist yet** — the historical backfill below is the first write.

---

## (A) ONE-TIME HISTORICAL BACKFILL — run now

> **Irreversible steps are A5 (commit) and A6 (push).** Pushing to `main` publishes to a CDN-backed,
> world-readable branch (jsDelivr may cache/index it). The local writes (A4) are reversible via git
> until you push. `--force` is **not** needed here because no schedule files exist yet (the
> `isPast && existing && !force` gate only fires when a file already exists).

### A1 — Preconditions

- Node ≥ 20 (`bin/update.mjs` uses native fetch).
- Clean working tree on `main` (so the backfill commit is isolated).
- SSH auth to `origin` working (push step). No token needed for the schedule ingest itself
  (unauthenticated nflverse fetch — `CFBD_API_KEY` is irrelevant to this subcommand).
- jsDelivr purge endpoint is an **unauthenticated public GET** — no token/auth.

```sh
cd "/Users/antonwilms/Claude Projects/Sleeper Dashboard/sleeper-dashboard-data"
```

```sh
git checkout main && git pull --ff-only && git status --porcelain
```

Expect no output from `git status --porcelain` (clean tree) before proceeding.

### A2 — Smoke (done-definition gate)

```sh
npm run smoke
```

Must be green before you write anything. (CLAUDE.md Done-definition #1.)

### A3 — Dry-run the full backfill (the gate before the irreversible run)

```sh
node bin/update.mjs schedule --all --dry-run
```

**What it prints / what to eyeball before committing to the real run:**

- One `[schedule] [dry-run] would write nflverse/schedule/<season>.json: <N> games` line per
  season from ~1999 through the current season.
- Seasons skipped with `not published yet` (0 rows) or `only <N> games (< 200) — preliminary,
  skipping` are **expected** for an unpublished/truncated future season — confirm only the
  current/future edge is skipped, not a historical year.
- Per-season `<N> games` should look sane (~256–285 for modern seasons incl. playoffs; older
  seasons fewer). A season showing a tiny count that is **not** skipped would indicate a parse
  problem — stop and investigate, do not push.
- No `(needs --force …)` notes are expected on a first backfill (no existing files).
- It must complete without throwing. A throw on `games.csv returned 404/504` means the source is
  unavailable — retry later; do not work around it.

If anything looks off, **stop here.** Nothing has been written.

### A4 — Real backfill (local writes only — still reversible)

```sh
node bin/update.mjs schedule --all
```

Writes `nflverse/schedule/<year>.json` for every qualifying season and updates `manifest.json`
in the same run (one `updateManifestEntry` per file). Review before committing:

```sh
git status --short nflverse/ manifest.json && ls nflverse/schedule/
```

Optional sanity check on the manifest registrations:

```sh
git --no-pager diff -- manifest.json | grep -i schedule
```

### A5 — Commit  ⚠️ first half of the irreversible publish

```sh
git add nflverse/ manifest.json
git commit -m "nflverse: schedule historical backfill ($(date -u +%Y-%m-%d))"
```

### A6 — Push + manual jsDelivr purge  ⚠️ irreversible (publishes to CDN)

```sh
git push
```

Then purge the CDN. For a backfill you wrote **many** files, so purge `manifest.json` plus
**every** season file you just wrote (the single-season Action purge does not cover `--all`).
This loop derives the list from the files on disk — no manual season list to get wrong:

```sh
curl -sf "https://purge.jsdelivr.net/gh/antonwilms/sleeper-dashboard-data@main/manifest.json"
for f in nflverse/schedule/*.json; do
  curl -sf "https://purge.jsdelivr.net/gh/antonwilms/sleeper-dashboard-data@main/$f" && echo "  purged $f"
done
```

(jsDelivr also expires on its own TTL; the purge just makes the new data visible immediately.)

### A7 — Verify the app now sees real games

- **Manifest entries** — confirm one entry per backfilled season, each with
  `inProgress: false`, `schemaVersion: 1`, a non-zero `recordCount`, and a fresh `lastModified`:

  ```sh
  curl -s "https://cdn.jsdelivr.net/gh/antonwilms/sleeper-dashboard-data@main/manifest.json" | grep -i "schedule/"
  ```

- **CDN file** — fetch a representative season and confirm a real `rowCount` + populated `games[]`:

  ```sh
  curl -s "https://cdn.jsdelivr.net/gh/antonwilms/sleeper-dashboard-data@main/nflverse/schedule/2023.json" | head -c 400
  ```

- App-side: `src/api/nflSchedule.js` resolves via `tryDataStore`/`getManifestEntry` and re-asserts
  the `MIN_SCHEDULE_GAMES = 200` gate on `rowCount`. Once the manifest + CDN files are live and
  purged, the shipped loader/consumer go from inert to populated.

---

## (B) FUTURE MANUAL RUN — rare

The weekly Action `nflverse-schedule.yml` (Friday 13:35 UTC, default/current-season mode) normally
handles everything: ingest current season → commit if content-hash changed → purge `manifest.json`
+ the single season file (built from the `season` step-output, **not** `date -u +%Y` — CLAUDE.md
invariant 8). You only run by hand in these cases:

**B1 — Missed / failed Friday Action (just re-run the Action's job).**
Preferred: re-trigger the workflow (`workflow_dispatch` is enabled) so the commit+purge logic runs
exactly as designed. If you must do it locally, it's the **current-season** path, not `--all`:

```sh
node bin/update.mjs schedule --dry-run      # eyeball the single current-season plan
node bin/update.mjs schedule                # writes current season only (if hash changed)
git add nflverse/ manifest.json && git commit -m "nflverse: schedule $(date -u +%Y-%m-%d)" && git push
```

Purge **only** the two files the current-season run touches (don't loop all seasons — avoids
double-purging static historical files):

```sh
SEASON=2026   # the NFL season the run wrote — confirm from the written filename, not the calendar year
curl -sf "https://purge.jsdelivr.net/gh/antonwilms/sleeper-dashboard-data@main/manifest.json"
curl -sf "https://purge.jsdelivr.net/gh/antonwilms/sleeper-dashboard-data@main/nflverse/schedule/${SEASON}.json"
```

> Jan–Feb caveat: the file is keyed by the **resolved NFL season**, not the calendar year. Read the
> actual filename `update-schedule` wrote and purge that — never assume `date +%Y`.

**B2 — Correcting / re-backfilling a completed past season.** This is the only case needing
`--force`, and it is **irreversible + violates append-only (CLAUDE.md invariant 1)** unless the
commit diff explains the correction.

```sh
node bin/update.mjs schedule --year 2022 --dry-run   # confirms "(past season — needs --force …)"
node bin/update.mjs schedule --year 2022 --force      # overwrites the existing file
git add nflverse/schedule/2022.json manifest.json
git commit -m "nflverse: schedule 2022 correction — <reason>"
git push
curl -sf "https://purge.jsdelivr.net/gh/antonwilms/sleeper-dashboard-data@main/manifest.json"
curl -sf "https://purge.jsdelivr.net/gh/antonwilms/sleeper-dashboard-data@main/nflverse/schedule/2022.json"
```

**How (B) differs from (A) / what not to clobber:**

- (A) is once, `--all`, writes ~25+ seasons, purges all of them. (B) is single-season.
- The weekly Action already commits + purges the current season. Don't run `--all` routinely —
  content-hash dedup makes a re-`--all` a no-op for unchanged seasons (safe but pointless), and you'd
  needlessly purge static historical files.
- Never set `inProgress: true` (invariant 5). Never hand-edit `nflverse/schedule/*.json` or
  `manifest.json` (invariant 2/3) — always go through the subcommand.

---

## Irreversible-step / precondition summary

- **Irreversible:** `git push` to `main` (publishes to jsDelivr — cached/indexable) and any
  `--force` overwrite of a completed season (append-only, invariant 1).
- **Reversible until push:** local `--all` writes (A4) and the commit (A5, amendable/resettable
  before push).
- **Preconditions:** Node ≥ 20; clean tree on `main`; SSH push auth to `origin`. No API token for
  the ingest; jsDelivr purge is unauthenticated. `--force` is *not* needed for the first backfill.
- **Done-definition (CLAUDE.md):** `npm run smoke` green; `manifest.json` updated (handled
  automatically by the script for every written file).
