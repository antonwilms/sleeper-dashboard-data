# registry-slim (data side) — delete the mirrored registry copy and its drift machinery

**Session 1:** opus, 2026-10-17, planned from the parent folder. **Session 2: sonnet**, medium
effort, **in the same parent-folder session that just ran the app twin** —
`../sleeper-dashboard/.claude/tasks/registry-slim.md` — and only **after** its steps A1–A8 are
committed. Not scoring-affecting: no constant, projection, served file or manifest change.

**Decision (Anton, 2026-10-17):** replace the cross-repo contract registry with the minimum safe
bookkeeping. The single index now lives in the app repo at `docs/cross-repo-registry.md`.

**Decisions after the first plan review (Anton, 2026-10-17):** (1) **delete** `lib/registry.mjs` and
`scripts/registry-audit.mjs` in this PR (D4 — the one sanctioned `lib/`/`scripts/` touch); (2) D-74
closed as obsolete (app twin A6); (3) app index cap 12,000 bytes; (4) sibling reads: a read-only
`Read(...)` allow rule in `.claude/settings.json` (D9b) **and** reviewer text that treats an absent,
refused or erroring sibling read as NOT VERIFIED (D9). The CR-24 `[cross-repo]` review flag is
accepted as format-only: this change retires CR-24, so no `## Cross-repo impact` section is written.

## Constraints (from Anton, binding)

- Every change here is on a **branch + PR** (it deletes and edits `.github/workflows/` files);
  `smoke-test.yml` must pass on the PR. Do not push to `main`; Anton merges.
- **Never run, trigger or edit pipeline scripts** in `bin/`, `lib/`, `scripts/` — the single
  exception is D4's deletion of `lib/registry.mjs` and `scripts/registry-audit.mjs` (approved by
  Anton 2026-10-17); no other file under those directories is touched. Never run `npm run smoke` (it runs
  `bin/update.mjs` dry-runs); the PR's `smoke-test.yml` runs it in CI instead. `npm test` is the
  local gate.
- Capture-only invariant untouched: no capture workflow changes beyond the two comment lines in D7.
- All existing `*-mirror` / constant-equality tests stay unchanged (`step4-mirror`, `rookie-mirror`,
  `qb-mirror`, `durability-mirror`, `league-basis` part (e), …).

## Precondition check (stop and report if any fails)

1. `../sleeper-dashboard/docs/cross-repo-registry.md` exists, is ≤ 12,000 bytes, and starts with
   `# Cross-repo contract index` (the app twin's A1 is done).
2. `git status` here is clean on `main` **except** for this task file,
   `.claude/tasks/registry-slim.md` (untracked; it is committed in D11.3). Any other change: stop.
   `git pull --rebase origin main` succeeds (use `--autostash` only if git refuses because of the
   untracked task file; it should not).

---

## Verified context (2026-10-17, live files)

- `cross-repo-registry.md` (185,537 B): data copy of the app registry; framing prose, the mirrored
  span, and two `> *Note:*` non-entry paragraphs (playerids, oline — now the app index preamble's
  "Not contracts" clause).
- `test/registry-mirror.test.mjs` (CR-24): RM-U/RM-S always-on structural tests on the data copy;
  RM-X1–X4 cross-repo byte-identity, run only under `REGISTRY_MIRROR=1` by
  `.github/workflows/registry-mirror.yml` (daily 06:41 UTC + PR/push on registry paths).
- `test/registry.test.mjs`: resolves every symbol claimed in each entry's `Data side` + data half of
  `Triggers` against the file named (via `lib/registry.mjs` heuristics, >50 claims), plus a
  file-scoped resolution regression (STATS_BASE in `lib/nflverse.mjs` vs `lib/sleeper.mjs`).
- `lib/registry.mjs` is imported only by those two tests and by `scripts/registry-audit.mjs` (a
  read-only CLI over `cross-repo-registry.md`; not in `package.json`, not run by any workflow).
- `scripts/check-crons.mjs` discovers scheduled workflows from the files on disk, so deleting
  `registry-mirror.yml` removes it from `cron-deadman` with no other change.
- `npm test` (`node --test`) runs in CI only in `smoke-test.yml`, which checks out this repo alone.
- `test/league-basis.test.mjs` part (e) reuses the `REGISTRY_MIRROR=1` gate name for its own
  app-parity check. It is a mirror test — **unchanged**; its comment at :249 naming
  `test/registry-mirror.test.mjs` goes stale, accepted.

### Disposition of each existing registry test (the "keep or retire, justified" ask)

| Test | Checks | Disposition | Why |
|---|---|---|---|
| `registry-mirror.test.mjs` RM-U1–U14 | span extraction, diff locator, documented-command parser, sibling gate | **retire** | helpers for a mirror that no longer exists |
| RM-S1–S3 | data copy has one sentinel pair, ≥20 entries, no stray sentinels | **retire** | the data copy is deleted |
| RM-X1–X4 | app↔data byte-identity, documented drift command paths | **retire** (CR-24) | the mirror is retired |
| `registry.test.mjs` main case | every data-side symbol resolves in its named file | **keep, re-point** at the app index's `Data` field | this is the "definition sites still exist in its own repo" check |
| `registry.test.mjs` STATS_BASE case | resolution is file-scoped, not tree-wide | **keep** (unchanged logic) | still the property the re-pointed check depends on |

---

## D1 · Branch

`git checkout -b registry-slim` from the freshly rebased `main`.

## D2 · Delete

- `cross-repo-registry.md`
- `test/registry-mirror.test.mjs`
- `.github/workflows/registry-mirror.yml`

## D3 · Rewrite `test/registry.test.mjs` (whole file)

Self-contained: it no longer imports `lib/registry.mjs` (that parser's heuristics were for the old
prose-heavy fields; the index has a strict grammar). Uses the same grammar as the app's
`src/__tests__/crossRepoIndex.test.js`.

```js
/**
 * test/registry.test.mjs — the data half of the cross-repo contract index check.
 *
 * The index is the app repo's docs/cross-repo-registry.md (../CLAUDE.md → Cross-repo rule). Every
 * symbol an entry's `Data` field names must resolve — appear as a whole word — in the data-repo
 * file it is grouped under, every `Data` file must exist, and every `test/` path in a `Tests`
 * field must exist. Asserts symbols, never line numbers. The app's
 * src/__tests__/crossRepoIndex.test.js checks the App half, the ids and the size cap.
 *
 * The index lives in the sibling checkout. Locally an absent sibling FAILS — say so, never assume.
 * In GitHub Actions (smoke-test.yml checks out this repo only) it skips with that reason.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.resolve(repoRoot, '..', 'sleeper-dashboard', 'docs', 'cross-repo-registry.md');
const GROUP_RE = /^`([^`]+)`(?: \((`[^`]+`(?:, `[^`]+`)*)\))?$/;
const isRetired = (e) => / — retired \d{4}-\d{2}-\d{2}$/.test(e.title);

export function parseIndex(text) {
  const entries = [];
  let current = null;
  for (const line of text.split('\n')) {
    const header = line.match(/^#### (CR-\d+) · (.+)$/);
    if (header) {
      current = { id: header[1], title: header[2], fields: {} };
      entries.push(current);
      continue;
    }
    const field = current && line.match(/^- \*\*([A-Za-z]+):\*\* (.+)$/);
    if (field) current.fields[field[1]] = field[2];
  }
  return entries;
}

export function parseGroups(value) {
  if (value === 'none') return [];
  return value.split('; ').map((group) => {
    const m = group.match(GROUP_RE);
    if (!m) throw new Error(`malformed site group: ${group}`);
    const symbols = m[2] ? [...m[2].matchAll(/`([^`]+)`/g)].map((s) => s[1]) : [];
    return { file: m[1], symbols };
  });
}

/** Whole-word match: does `symbol` appear anywhere in `source`? (declaration or reference.) */
export function symbolResolvesIn(symbol, source) {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`).test(source);
}

/** Check, skip (CI without the sibling) or fail (local without the sibling). */
export function siblingDecision({ exists, inActions }) {
  if (exists) return { kind: 'check' };
  if (inActions) {
    return { kind: 'skip', reason: 'app index not checked out in GitHub Actions — Data sites are verified by local npm test only' };
  }
  return {
    kind: 'fail',
    reason: `sibling app repo not on disk (no ${indexPath}) — say so in the hand-back; never assume its contents (../CLAUDE.md → Cross-repo rule)`,
  };
}

// ---------------------------------------------------------------------------
// Always-on unit tests (no sibling access)
// ---------------------------------------------------------------------------

test('registry: siblingDecision checks when present, skips only in Actions, fails locally', () => {
  assert.equal(siblingDecision({ exists: true, inActions: false }).kind, 'check');
  assert.equal(siblingDecision({ exists: true, inActions: true }).kind, 'check');
  assert.equal(siblingDecision({ exists: false, inActions: true }).kind, 'skip');
  assert.equal(siblingDecision({ exists: false, inActions: false }).kind, 'fail');
});

test('registry: parses only the documented site grammar', () => {
  assert.deepEqual(parseGroups('none'), []);
  assert.deepEqual(parseGroups('`a.mjs` (`x`, `y`); `b.md`'), [
    { file: 'a.mjs', symbols: ['x', 'y'] },
    { file: 'b.md', symbols: [] },
  ]);
  assert.throws(() => parseGroups('`a.mjs` (x)'), /malformed/);
  assert.throws(() => parseGroups('see `a.mjs`'), /malformed/);
});

test('registry guard: file-scoped resolution catches a symbol present in a sibling file but deleted from its own (STATS_BASE regression)', () => {
  // STATS_BASE is declared independently in both lib/sleeper.mjs and lib/nflverse.mjs. A tree-wide
  // grep would still pass if STATS_BASE were deleted from lib/nflverse.mjs alone (it survives in
  // lib/sleeper.mjs) — this proves the guard checks the NAMED file, not the whole tree.
  const nflverseSrc = fs.readFileSync(path.join(repoRoot, 'lib/nflverse.mjs'), 'utf8');
  const sleeperSrc = fs.readFileSync(path.join(repoRoot, 'lib/sleeper.mjs'), 'utf8');

  assert.ok(symbolResolvesIn('STATS_BASE', nflverseSrc), 'sanity: STATS_BASE currently resolves in lib/nflverse.mjs');
  assert.ok(symbolResolvesIn('STATS_BASE', sleeperSrc), 'sanity: STATS_BASE also exists in lib/sleeper.mjs');

  const nflverseSrcWithoutStatsBase = nflverseSrc.replace(/STATS_BASE/g, 'RENAMED_BASE');
  assert.equal(
    symbolResolvesIn('STATS_BASE', nflverseSrcWithoutStatsBase),
    false,
    'guard must red when STATS_BASE is renamed/deleted from its own file, even though it survives in lib/sleeper.mjs'
  );
});

// ---------------------------------------------------------------------------
// Index checks (read the sibling app repo's index — read-only)
// ---------------------------------------------------------------------------

const decision = siblingDecision({ exists: fs.existsSync(indexPath), inActions: process.env.GITHUB_ACTIONS === 'true' });
const indexOpts = { skip: decision.kind === 'skip' ? decision.reason : false };

function liveEntries() {
  return parseIndex(fs.readFileSync(indexPath, 'utf8')).filter((e) => !isRetired(e));
}

test('registry: every Data site in the cross-repo index resolves in this repo', indexOpts, () => {
  if (decision.kind === 'fail') return assert.fail(decision.reason);
  const entries = liveEntries();
  assert.ok(entries.length >= 25, `expected at least 25 live entries, got ${entries.length} — parser may be broken`);

  const failures = [];
  let checkedClaims = 0;
  for (const entry of entries) {
    if (entry.fields.Data === undefined) {
      failures.push(`${entry.id}: no Data field`);
      continue;
    }
    for (const { file, symbols } of parseGroups(entry.fields.Data)) {
      const full = path.join(repoRoot, file);
      if (!fs.existsSync(full)) {
        failures.push(`${entry.id}: file not found — ${file}`);
        continue;
      }
      const src = fs.readFileSync(full, 'utf8');
      for (const symbol of symbols) {
        checkedClaims++;
        if (!symbolResolvesIn(symbol, src)) failures.push(`${entry.id}: \`${symbol}\` does not resolve in ${file}`);
      }
    }
  }

  assert.ok(checkedClaims >= 25, `expected >=25 resolvable claims, got ${checkedClaims} — guard may be vacuous`);
  assert.deepEqual(failures, [], `${failures.length} Data site(s) failed to resolve:\n${failures.join('\n')}`);
});

test('registry: every data test the cross-repo index names exists', indexOpts, () => {
  if (decision.kind === 'fail') return assert.fail(decision.reason);
  const missing = liveEntries()
    .flatMap((e) => (e.fields.Tests ? parseGroups(e.fields.Tests).map((g) => `${e.id}: ${g.file}`) : []))
    .filter((s) => s.split(': ')[1].startsWith('test/'))
    .filter((s) => !fs.existsSync(path.join(repoRoot, s.split(': ')[1])));
  assert.deepEqual(missing, []);
});
```

Expected locally: the index names 30 Data symbols and 27 live entries today — both floors pass.
If any Data symbol fails, **stop and report**; do not edit the app index from this step (fix it
in the app commit, re-run, and record it as a deviation).

## D4 · Delete `lib/registry.mjs` and `scripts/registry-audit.mjs` (approved, Anton 2026-10-17)

After D3 nothing imports `lib/registry.mjs` except `scripts/registry-audit.mjs`, and that CLI reads
`cross-repo-registry.md`, which D2 deletes. `git rm lib/registry.mjs scripts/registry-audit.mjs`.
Before deleting, confirm with `git grep -n "registry.mjs\|registry-audit"` that no other code
imports either (expected hits: docs/agents being edited in this task, `.claude/tasks/*`, dated
records). Any import from `bin/`, `lib/`, `scripts/` or `test/` other than the two files themselves
and the old `test/registry*.test.mjs`: stop and report. This deletion changes `lib/**`/`scripts/**`,
which also triggers `smoke-test.yml` on the PR (it already triggers on the workflow change).

## D5 · `README.md`

1. Three README sentences point at a `> *Note:*` that exists only in the deleted data registry.
   Reword each the same way ("not a cross-repo contract"):
   - Line 498: `(see the` / `` `> *Note:*` below and CR-18 in the Cross-repo contract registry). `` →
     `(see CR-18 in the` / `[cross-repo index](../sleeper-dashboard/docs/cross-repo-registry.md); it is not itself a cross-repo contract).`
   - Line 509: `gate to keep in sync since there is no app loader (see the \`> *Note:*\` below). Two further internal`
     → `gate to keep in sync since there is no app loader (not a cross-repo contract). Two further internal`
   - Lines 515–516: `` internal-only family — there is no app loader to keep in sync (see the `` /
     `` `> *Note:*` below). Content-hash dedup … `` → `internal-only family — there is no app loader
     to keep in sync (not a cross-repo contract). Content-hash dedup …` (re-wrap the paragraph's
     first two lines only; the rest unchanged).
   Then `grep -n 'Note:\*. below' README.md` must return nothing.
2. GitHub Actions table (line 1593): delete the whole `| \`registry-mirror.yml\` | … |` row.
3. Line 1602: `**Why six workflows are standalone rather than \`_ingest.yml\` callers.**` → `five`.
4. Line 1612: delete the bullet `- \`registry-mirror.yml\` — a read-only cross-repo check, not ingest. It writes no data file.`
5. Section `## Cross-repo contract registry (with sleeper-dashboard)` (lines 1695–1697): keep the
   heading, replace the paragraph with the one-line pointer:
   `Shared contracts are indexed in the app repo: [../sleeper-dashboard/docs/cross-repo-registry.md](../sleeper-dashboard/docs/cross-repo-registry.md).`

## D6 · `CLAUDE.md` (data)

1. Navigation-map row (line 54): delete the whole row `` | `lib/registry.mjs`, `scripts/registry-audit.mjs` | … | `` (D4 deletes both files).
2. Line 72 (`.github/workflows/` row): `Six are deliberately **not** callers (\`nflverse-playerstats\`,
   \`weekly-ktc\`, \`cron-deadman\`, \`smoke-test\`, \`registry-mirror\`, \`daily-snapshot\` — …)` →
   `Five are …` and drop `` `registry-mirror`, ``. Nothing else in the row changes.
3. Line 92 (Invariant 3): `(see Cross-repo contract registry)` → `(CR-04 in the cross-repo index)`.
4. Replace the whole section from `## Cross-repo contract registry (with sleeper-dashboard)`
   (line 114) through the line `**A coupling that is not listed there does not exist for review
   purposes.**` (line 124) — keep the `---` that follows — with:
   ```
   ## Cross-repo contracts (with sleeper-dashboard)

   Contracts shared with the app are indexed in the app repo at [`../sleeper-dashboard/docs/cross-repo-registry.md`](../sleeper-dashboard/docs/cross-repo-registry.md); `test/registry.test.mjs` checks its Data sites resolve here. The rule for changing one is `../CLAUDE.md` → *Cross-repo rule*.
   ```
5. Line 181 (Self-maintenance): `Contract changes follow the mirror rule in [Cross-repo contract
   registry](#cross-repo-contract-registry-with-sleeper-dashboard) — including the new-coupling
   case, which lands in both repos in the same change.` → `Contract changes follow \`../CLAUDE.md\`
   → *Cross-repo rule*, including the index entry for a new coupling.`
6. Every other `CR-NN` citation stays as is. The file shrinks; `claudeMdSize.test.mjs` stays green.

## D7 · Workflow comments (comment-only; no YAML key, value or step changes)

- `.github/workflows/nfl-season-totals.yml` lines 10–11:
  `# Mon, roster 13:23 Tue, schedule 13:35 Fri); cron-deadman (05:19) and registry-mirror (06:41)`
  / `# commit nothing. Reads nflverse/schedule/<year>.json …` →
  `# Mon, roster 13:23 Tue, schedule 13:35 Fri); cron-deadman (05:19) commits nothing.`
  / `# Reads nflverse/schedule/<year>.json …` (rest of that line and the following lines unchanged).
- `.github/workflows/nflverse-rosterweekly.yml` line 10:
  `# (06:13) and registry-mirror (06:41, commits nothing).` → `# (06:13).`

Verify with `git diff -U0 .github/workflows/` that only `#` lines changed in these two files.

## D8 · Other data docs (links to the deleted file)

- `snapshot-workflow.md` lines 8–9: `(see the [Cross-repo contract\nregistry](cross-repo-registry.md))`
  → `(see the [cross-repo\nindex](../sleeper-dashboard/docs/cross-repo-registry.md))`. Leave the
  rest of that historical sentence ("landed in both repos' registries") as is.
- `data-catalog.md` line 9: `([cross-repo-registry.md](cross-repo-registry.md))` →
  `([cross-repo index](../sleeper-dashboard/docs/cross-repo-registry.md))`.
- `data-catalog.md` line 39 (`weeklyStats` coverage bullet): replace its tail
  `; keys, exclusion rule and CR-02/CR-14 mirrors in \`cross-repo-registry.md\`` with
  `; contracts CR-02/CR-14 in the [cross-repo index](../sleeper-dashboard/docs/cross-repo-registry.md).`
  Then insert this new bullet directly after it (the facts the deleted registry held and the slim
  index does not — moved here, one line):
  ```
  - **`weeklyStats` keys and exclusion rule (CR-02/CR-14):** a played (`'P'`) week carries that week's non-zero values of every key except the denylist applied by `isWeeklyStatsExcluded` in `lib/sleeper.mjs` (exact keys in `WEEKLY_STATS_EXCLUDED_EXACT`, incl. its frozen `RATE_KEYS` copy, plus the prefix/suffix rules: `idp_*`/`punt*`, `*_lng`, `pts_half_ppr`/`pts_ppr`/`pts_std`/`pts_idp`, `pos_rank_*`, `fan_pts_allow*`, `gp`/`gs`/`gms_active`/`snp`, `*_snp`, `rec_ypt`; `weeklyScoringStats` keeps the finite non-zero values); a played week with no such value is omitted; every kept key's weeks sum to the season `stats` value; the app scores each week with `scoreSeasonStats` under the season's first-down emission flag. Adding a key to the denylist, or dropping or zero-filling one, silently reverts that row's displayed weeks and ±SD to ratio scaling.
  ```
- `data-catalog.md` line 46 (`team` bullet): `(see cross-repo-registry.md, CR-02)` →
  `(CR-02 in the [cross-repo index](../sleeper-dashboard/docs/cross-repo-registry.md); the rule: most played weeks, ties → later stint, zero played → last seen, then schedule-domain normalization — any edit changes app projections with no app-side diff)`.
- `data-catalog.md` line 162: `(see README.md\n  Cross-repo contract registry CR-18)` →
  `(see CR-18 in the\n  cross-repo index)`.
- `data-catalog.md` line 231: `(internal — see the non-entry note in cross-repo-registry.md; no app counterpart)`
  → `(internal — not a cross-repo contract; no app counterpart)`.
- `store-audit-2026-08-25.md` and `grading/*` are dated records — **unchanged**.

## D9 · Reviewer subagents (data)

### `.claude/agents/plan-reviewer.md`

1. Frontmatter `description`: `against the cross-repo contract registry.` → `against the cross-repo contract index.`
2. Leave the HTML changelog comment as is (history).
3. `full` depth list (line ~26): `or edit\nthe mirrored registry region.` → `or change\na site listed in the cross-repo index.`
4. `scoped` depth: delete the two bullets `- Trust a fire list the invocation supplies …` (incl. its
   `sh` code block) and `- Verify quoted \`Mirror\` texts …`; insert in their place
   `- Read only the cross-repo index entries whose Data sites the change touches.`
   Keep `- Spend the saved effort …`.
5. Replace the whole `## 3. Cross-repo intent` section (heading through the `[registry-gap]`
   paragraph, up to but not including `## 4. Slice size`) with:
   ```
   ## 3. Cross-repo

   Read `../sleeper-dashboard/docs/cross-repo-registry.md` — the cross-repo contract index, one block per `CR-NN` (the rule is in `../CLAUDE.md` → *Cross-repo rule*). For every entry whose **Data** site the plan touches — the file, or a listed symbol, changed, renamed, moved or deleted — or whose contract the planned change reads or writes:

   - Read that entry's **App** sites live under `../sleeper-dashboard/`. Read-only: never write there. If the sibling repo is absent OR a read of it is refused or errors, report the touched contract as NOT VERIFIED (`cross-repo` flag) — never as verified, and never infer its contents.
   - Flag the plan if it leaves the two sides inconsistent. It must either change the app side (and the index) in the same piece of work (a parent-folder session) or add a line to `.claude/tasks/app-repo-backlog.md` and name it for the hand-back.
   - Flag a renamed, moved or deleted listed site whose index entry the plan does not update in the same piece of work, and a new cross-repo coupling the plan does not add to the index.

   `npm test` includes `test/registry.test.mjs`, which reds when a listed Data site no longer resolves; run it and report red. It cannot see a coupling the index never listed — that one is yours.

   **Bash is for reading only.** Use it to run `npm test` and read-only inspection (`git show`, `git log`, `sed -n`, `grep`). Never edit, stage, commit, write a file, or run an ingest command that writes. You are a review gate, not an implementer.

   Tag each cross-repo finding `cross-repo`, naming the `CR-NN` id and the `file:symbol` on each side. Do not apply fixes; report and let the human decide.
   ```
6. `## Output`: replace from the ```` ``` ```` block through the end of the file with:
   ````
   ```
   FLAGS
   FLAG [category]: <one-line problem> — <file:symbol or line anchor>
   …
   ```

   Categories: `mechanical`, `shape`, `ordering`, `edge-case`, `invariant`, `strategy`, `cross-repo`, `slice-size`. If there are no flags, output exactly "No blocking issues found." and nothing else.
   ````

### `.claude/agents/implementation-reviewer.md`

1. `full` depth list: `or edit the mirrored registry region of \`cross-repo-registry.md\`.` →
   `or change a site listed in the cross-repo index.`
2. `Your mandate has three parts. Run all three on every diff.` → `four parts. Run all four`.
3. Insert, immediately before `## Bash is for reading only`:
   ```
   ## 4. Cross-repo

   Read `../sleeper-dashboard/docs/cross-repo-registry.md`. For every entry whose **Data** site the diff touches:

   - Read that entry's **App** sites live under `../sleeper-dashboard/` (read-only — never write there). If the sibling repo is absent OR a read of it is refused or errors, report the touched contract as NOT VERIFIED (`cross-repo` flag) — never as verified, and never infer its contents. Flag the diff if the two sides are now inconsistent and neither the same piece of work changed the app side nor `.claude/tasks/app-repo-backlog.md` gained a line for it.
   - A renamed, moved or deleted listed site must be updated in the index in the same piece of work. `test/registry.test.mjs` reds on a dangling Data site; it cannot see a coupling the index never listed — that one is yours.

   ```
4. Categories line: append `` `cross-repo` `` after `` `coverage-gap` ``.

## D9b · `.claude/settings.json` (data) — read-only sibling allow rule

Merge a `permissions` key into the existing object; keep `env` exactly as it is. Result:
```json
{
  "env": {
    "CLAUDE_CODE_SUBAGENT_MODEL": "sonnet"
  },
  "permissions": { "allow": ["Read(~/Claude Projects/Sleeper Dashboard/sleeper-dashboard/**)"] }
}
```
Read-only by construction: `Read(...)` only — no `Edit`, `Write`, `Bash` or `additionalDirectories`.
Validate with `node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8'))"`.

## D10 · New `.claude/tasks/app-repo-backlog.md`

The data-side counterpart of the app's `.claude/tasks/data-repo-backlog.md`, named by the new
`../CLAUDE.md` → *Cross-repo rule*. Content exactly:
```
# App-repo backlog — asks discovered from the data side

Work that belongs in `sleeper-dashboard`, found by a session scoped to this repo (which cannot write the app). Add a line in the same change, with the commit that found it and whether it blocks; flag it in the hand-back. Strike through and note the app commit when done.

## Open
```

## D11 · Done-definition, commit, PR

1. `npm test` — green (includes the rewritten `registry.test.mjs`; `registry-mirror.test.mjs` is
   gone). **Do not run `npm run smoke`** (constraint above) — say so in the hand-back.
2. Stale-reference grep, excluding the new expected links to the app index:
   `git grep -n "registry-mirror\|cross-repo-registry.md\|REGISTRY_MIRROR\|lib/registry.mjs\|registry-audit" | grep -v "sleeper-dashboard/docs/cross-repo-registry.md"`
   and report every remaining hit. Expected and accepted: `test/league-basis.test.mjs` (mirror
   test, unchanged), `test/registry.test.mjs` (the D3 rewrite: its header comment and its
   `path.resolve(…, 'sleeper-dashboard', 'docs', 'cross-repo-registry.md')` are the new index path —
   do not edit D3's code to quiet this grep), `store-audit-2026-08-25.md`, `grading/*`, and
   `.claude/tasks/*` (history).
   Anything else: fix it if this task file names it, otherwise report it as a deviation.
3. One commit on `registry-slim`: stage with `git add -A` so it includes every new file (this task
   file `.claude/tasks/registry-slim.md`, the D10 `.claude/tasks/app-repo-backlog.md`), every edit
   and every deletion (D2, D4) — not `git commit -a`, which skips untracked files. Message:
   `chore: retire registry mirror; point at app cross-repo index (registry-slim, CR-24)`.
   `git status` must be clean before the push in step 4.
4. `git push -u origin registry-slim`; open a PR to `main` titled the same; body lists the
   deletions and links the app commit SHA (unpushed — say so). Wait for `smoke-test.yml`; report
   its result. Do not merge.
5. Do not push app `main` — that happens after Anton merges this PR (app twin, A8.6).

---

## Tests to add / change / retire (data)

| Test | Change | Asserts |
|---|---|---|
| `test/registry-mirror.test.mjs` | **retired** (deleted) | — (CR-24 retired) |
| `lib/registry.mjs` (+ `scripts/registry-audit.mjs`) | **deleted** (D4) | — no test imports it after D3 |
| `test/registry.test.mjs` | **rewritten** | siblingDecision: check/skip-in-Actions/fail-locally; grammar parser rejects prose; STATS_BASE file-scoped resolution (kept); every live index entry has a Data field, every Data file exists, every listed symbol resolves whole-word in it (≥25 checked, ≥25 live entries); every `test/` path in Tests exists |
| every `*-mirror`, `league-basis`, constant-equality test | **unchanged** | — |

**Coverage change to state plainly:** the data-site check no longer runs in CI (smoke-test checks
out this repo only, so it skips there with a reason); it runs in every local `npm test`. Before,
CI checked the data-local copy. The skip is explicit, never silent-pass.

## Cross-repo

This file is the data half of one two-sided change; the app half is the twin task file (run first,
same session). CR-24 is retired in the app index (A1) and its machinery deleted here (D2). No
other entry's sites change.

## Hand-back (to Session 1)

Branch, commit SHA, PR URL and `smoke-test.yml` result; the D4 import check output; every file
touched; every deviation; the D7 comment-only `git diff -U0` output; the
D11.2 grep output; what each new/changed test asserts; and that `npm run smoke` was not run.
