# Schedule ingest — operations guide

Manual operation of the nflverse schedule ingest that feeds `nflverse/schedule/<year>.json`
(consumed app-side by `src/api/nflSchedule.js`). The loader + its consumer are shipped but
**inert** until the data side is backfilled and published.

**When you run this:**
- **Once, now** — the historical `--all` backfill (procedure A). Until it lands, the app's
  schedule loader returns the empty shape.
- **Rarely, after** — only for a missed/failed weekly Action or a past-season correction
  (procedure B). The weekly Action handles the normal current-season refresh automatically.

---

## Entrypoint

The real entrypoint is **`node bin/update.mjs schedule`**.

- `bin/update.mjs` is the CLI dispatcher; its `schedule` case calls `updateSchedule()`.
- `scripts/update-schedule.mjs` is the **implementation module** (`export async function updateSchedule`),
  imported by the dispatcher — **not** standalone-runnable. Do not run it directly. (The app docs
  reference `scripts/update-schedule.mjs` because that's where the impl lives, not because it's a CLI.)

Flags (confirmed from `bin/update.mjs` arg parsing + `scripts/update-schedule.mjs`):

| Flag | Meaning | Notes |
|---|---|---|
| `--all` | Backfill every season ≥ `MIN_SCHEDULE_SEASON` (≥ 1999) | schedule subcommand only |
| `--year YYYY` | Write that one season | ignored if `--all` also passed (`--all` wins) |
| (none) | Write current season only | the weekly Action's mode |
| `--dry-run` | Fetch + validate + print plan, **no writes** | the gate before any real run |
| `--force` | Overwrite an existing **completed past-season** file (`year < currentSeason`) | only when a file already exists |

---

## How the pieces fit

- **The script writes the manifest itself.** `updateSchedule()` calls `updateManifestEntry({ path,
  recordCount, inProgress: false, schemaVersion: 1 })` after each file write
  (`scripts/update-schedule.mjs:104`). There is **no separate registration step** — unlike
  `snapshots`, you do not run a second command.
- **Content-hash dedup.** Identical games for a season → no write, no manifest touch
  (`gamesHash` = SHA-256 over gameId-sorted games).
- **Sparsity / not-published gates.** 0 rows → skip ("not published yet"); `< MIN_SCHEDULE_GAMES`
  (200) → skip ("preliminary"). See README → `nflverse/schedule/<year>.json`.
- **`inProgress: false` always** (CLAUDE.md invariant 5 — no app live fallback). Do not change.
- **Append-only** (CLAUDE.md invariant 1) governs completed past seasons; `--force` is the
  documented escape hatch and requires a committed diff explaining why.
- **`--all` does not emit a `season` step-output.** `setStepOutput('season', …)` is single-season-mode
  only (`update-schedule.mjs:61`), so the Action-style single-file purge does **not** cover a backfill —
  purge every file you actually wrote (Step A6).

### Repo facts (this checkout)

- Remote: `git@github.com:antonwilms/sleeper-dashboard-data.git` (SSH push auth required).
- Published branch: `main` (jsDelivr serves `@main`). Owner for purge URLs: `antonwilms`.
- `nflverse/schedule/` does **not exist yet** — the historical backfill is the first write.

---

## (A) One-time historical backfill — run now

> **Irreversible steps are A6 (push) and the purge.** Pushing to `main` publishes to a CDN-backed,
> world-readable branch. Local writes (A4) and the commit (A5) are reversible until you push — see
> A4 for the revert, which is non-obvious because the new season files are *untracked*.
> `--force` is **not** needed here — no schedule files exist yet, so the force gate
> (`isPast && existing && !force`) never fires.

### A1 — Preconditions

- Node ≥ 20 (`bin/update.mjs` uses native fetch).
- Clean working tree on `main` (so the backfill commit is isolated).
- SSH auth to `origin` working. No API token needed for the ingest (unauthenticated nflverse fetch;
  `CFBD_API_KEY` is irrelevant here). jsDelivr purge is an unauthenticated public GET.

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

Must be green before you write anything (CLAUDE.md done-definition #1).

### A3 — Dry-run the full backfill (the gate before the irreversible run)

```sh
node bin/update.mjs schedule --all --dry-run
```

**What to eyeball before committing to the real run:**

- One `[schedule] [dry-run] would write nflverse/schedule/<season>.json: <N> games` line per
  season from ~1999 through the current season.
- Seasons skipped with `not published yet` (0 rows) or `only <N> games (< 200) — preliminary,
  skipping` are **expected** only at the current/future edge — confirm no *historical* year is skipped.
- Per-season `<N> games` should look sane (~256–285 for modern seasons incl. playoffs; older
  seasons fewer, but every season ≥ 1999 clears the 200 floor). A non-skipped season with a tiny
  count signals a parse problem — **stop and investigate, do not push.**
- No `(needs --force …)` notes expected on a first backfill (no existing files).
- Must complete without throwing. A throw on `games.csv returned 404/504` means the source is
  down — retry later, don't work around it.

If anything looks off, **stop here.** Nothing has been written.

### A4 — Real backfill (local writes only — reversible)

```sh
node bin/update.mjs schedule --all
```

Writes `nflverse/schedule/<year>.json` for every qualifying season and updates `manifest.json`
in the same run. Review before committing:

```sh
git status --short nflverse/ manifest.json && ls nflverse/schedule/
```

```sh
git --no-pager diff -- manifest.json | grep -i schedule
```

**To bail out before committing:** the season files are brand-new and therefore *untracked*, so
`git checkout` / `git reset --hard` will **not** remove them. Use:

```sh
git checkout -- manifest.json        # revert the tracked manifest change
git clean -fd nflverse/schedule/     # remove the new untracked season files
```

(After A5, once the files are tracked, `git reset --hard HEAD~1` cleans them instead.)

### A5 — Commit  ⚠️ first half of the irreversible publish

```sh
git add nflverse/ manifest.json
git commit -m "nflverse: schedule historical backfill ($(date -u +%Y-%m-%d))"
```

### A6 — Push + manual jsDelivr purge  ⚠️ irreversible (publishes to CDN)

```sh
git push
```

For a backfill you wrote **many** files, so purge `manifest.json` **plus every** season file
you just wrote (the single-season Action purge doesn't cover `--all`). This loop derives the list
from disk — no manual season list to get wrong:

```sh
curl -sf "https://purge.jsdelivr.net/gh/antonwilms/sleeper-dashboard-data@main/manifest.json"
for f in nflverse/schedule/*.json; do
  curl -sf "https://purge.jsdelivr.net/gh/antonwilms/sleeper-dashboard-data@main/$f" && echo "  purged $f"
done
```

(jsDelivr also expires on its own TTL; the purge just makes new data visible immediately.)

### A7 — Verify the app now sees real games

```sh
curl -s "https://cdn.jsdelivr.net/gh/antonwilms/sleeper-dashboard-data@main/manifest.json" | grep -i "schedule/"
```

Confirm one entry per backfilled season: `inProgress: false`, `schemaVersion: 1`, non-zero
`recordCount`, fresh `lastModified`.

```sh
curl -s "https://cdn.jsdelivr.net/gh/antonwilms/sleeper-dashboard-data@main/nflverse/schedule/2023.json" | head -c 400
```

Confirm a real `rowCount` + populated `games[]`. App-side, `src/api/nflSchedule.js` resolves via
`tryDataStore`/`getManifestEntry` and re-asserts the `MIN_SCHEDULE_GAMES = 200` floor on `rowCount`;
once the manifest + CDN files are live and purged, the shipped loader/consumer go from inert to populated.

---

## (B) Future manual run — rare

The weekly Action `nflverse-schedule.yml` (Friday 13:35 UTC, current-season mode) normally handles
everything: ingest current season → commit if content-hash changed → purge `manifest.json` + the
single season file (built from the `season` step-output, **not** `date -u +%Y` — CLAUDE.md
invariant 8). Run by hand only in these cases:

### B1 — Missed / failed Friday Action

Preferred: re-trigger the workflow (`workflow_dispatch` is enabled) so the commit+purge logic runs
as designed. If you must do it locally, it's the **current-season** path, not `--all`:

```sh
node bin/update.mjs schedule --dry-run      # eyeball the single current-season plan
node bin/update.mjs schedule                # writes current season only (if hash changed)
git add nflverse/ manifest.json && git commit -m "nflverse: schedule $(date -u +%Y-%m-%d)" && git push
```

Purge **only** the two files the current-season run touches (don't loop all seasons):

```sh
SEASON=2026   # the NFL season the run wrote — read it from the written filename, not the calendar year
curl -sf "https://purge.jsdelivr.net/gh/antonwilms/sleeper-dashboard-data@main/manifest.json"
curl -sf "https://purge.jsdelivr.net/gh/antonwilms/sleeper-dashboard-data@main/nflverse/schedule/${SEASON}.json"
```

> **Jan–Feb caveat:** the file is keyed by the **resolved NFL season**, not the calendar year. Read
> the actual filename the run wrote and purge that — never assume `date +%Y`.

### B2 — Correcting / re-backfilling a completed past season

The only case needing `--force`. **Irreversible + violates append-only (invariant 1)** unless the
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

### How (B) differs from (A) / what not to clobber

- (A) is once, `--all`, ~25+ seasons, purges all of them. (B) is single-season.
- The weekly Action already commits + purges the current season. Don't run `--all` routinely —
  content-hash dedup makes a re-`--all` a no-op for unchanged seasons (safe but pointless) and would
  needlessly purge static historical files.
- Never set `inProgress: true` (invariant 5). Never hand-edit `nflverse/schedule/*.json` or
  `manifest.json` (invariants 2/3) — always go through the subcommand.

---

## Irreversible-step / precondition summary

- **Irreversible:** `git push` to `main` (publishes to jsDelivr) and any `--force` overwrite of a
  completed season (append-only, invariant 1).
- **Reversible until push:** local `--all` writes (A4 — revert with `git checkout -- manifest.json`
  + `git clean -fd nflverse/schedule/`, since new files are untracked) and the commit (A5).
- **Preconditions:** Node ≥ 20; clean tree on `main`; SSH push auth. No API token for the ingest;
  jsDelivr purge is unauthenticated. `--force` not needed for the first backfill.
- **Done-definition (CLAUDE.md):** `npm run smoke` green; `manifest.json` updated (automatic per
  written file).
