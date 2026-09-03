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
   `ktc/`, `nfl/`, `college/`, `snapshots/`, plus `manifest.json`). Purge exactly the changed
   files, **`manifest.json` first**, then the data files, so the app sees fresh data instead of
   stale cache. Method: [README → How the data is consumed](README.md#how-the-data-is-consumed).
