# Session git workflow

Every session that modifies tracked files ends by committing and pushing its own work — no
uncommitted work is left between sessions. Uncommitted local work colliding with a scheduled
Action's push to `main` (the Invariant 8 workflows) is the known failure mode this sequence
exists to prevent. Read-only sessions — planning that produces no tracked change — do nothing
here.

The rules themselves are in [CLAUDE.md → Session git workflow](CLAUDE.md#session-git-workflow).
This file is the procedure.

## End-of-session sequence

1. **Commit.** Stage this session's changes with a descriptive message — planning:
   `plan: <feature>`; implementation: `feat: <feature>` / `fix: <feature>`.

2. **Rebase before pushing.**

   ```sh
   git pull --rebase origin main
   ```

   The weekly and scheduled Actions push to `main` on cron and will reject a stale push.

3. **Resolve conflicts.** They are almost always machine-generated bookkeeping files.

   - **`manifest.json` — resolve as a union.** Keep every entry from both sides. Never resolve
     by preferring one side wholesale: that silently drops the other side's entries, a real
     data-visibility loss even though the file still parses. After resolving, verify both:

     ```sh
     python3 -m json.tool manifest.json > /dev/null && echo "parses"
     ```

     and that the entries this session wrote are still present — grep their **full-path keys
     with extension** (e.g. `nflverse/advstats/2019.json`), not a bare fragment.

   - **A session whose purpose is *removing* entries resolves as union-of-additions minus its
     own deletions.** The plain union rule is written for concurrent additions and will
     silently resurrect a deletion that lands in the same rebase window. Verify by grepping
     that the removed keys are **absent** — not by eye.

   - **Watermark files** (`nflverse/last-checked-*.json` and similar): keep the later
     timestamp.

   - **Anything that is not a clean union** — the same entry edited incompatibly on both sides
     — stop and report for a human decision. Do not guess.

4. **Push.**

   ```sh
   git push origin main
   ```

   Plain push, **never `--force`**. If it is still rejected, an Action pushed during the
   rebase: `git pull --rebase origin main` again and retry. Never force.

5. **Purge the CDN** if this session wrote served data files (anything under `nflverse/`,
   `ktc/`, `nfl/`, `college/`, `snapshots/`). Purge exactly the changed data files, so the app
   sees fresh data instead of stale cache; `manifest.json` needs no purge (the app reads it from
   raw GitHub, CR-29, and the CLI rejects it). Method:
   `GITHUB_REPOSITORY=antonwilms/sleeper-dashboard-data node bin/purge-cdn.mjs <paths>`.

   **CR-30 releases.** For an in-place rewrite of a completed season-totals file, also confirm raw
   GitHub serves the new bytes before pushing the app's `SEASON_TOTALS_CACHE_REVISION` bump. Run this
   for every rewritten path; each must print `match`. Raw caches for up to 5 minutes, so if one
   differs, wait and re-run. Do not push the app until every path matches.

   ```sh
   for p in nfl/season-totals/2025.json; do   # list every rewritten path
     raw=$(curl -sfL "https://raw.githubusercontent.com/antonwilms/sleeper-dashboard-data/main/$p" | shasum -a 256 | cut -d' ' -f1)
     loc=$(shasum -a 256 "$p" | cut -d' ' -f1)
     [ "$raw" = "$loc" ] && echo "match $p" || echo "DIFFERS $p"
   done
   ```
