# Registry drift-check repair (+ D-17's remaining registry corrections, + CR-24)

**Repo:** `sleeper-dashboard-data`, with one app-repo apply step first (§5). No served data file, schema, manifest entry, `lib/`, `scripts/` or `bin/` change. Branch `registry-driftcheck-repair` + PR, because the change touches `test/` and `.github/workflows/`.

**Session 1:** 2026-09-13/14, planning only. Planned against data `origin/main` `750ab78` and app `origin/main` `a61d938`. The app tree has one untracked file, `.claude/tasks/portfolio-b-starting-ten.md`; nothing is modified. Plan review ran once and all 5 flags were applied (§10).

**Inputs:**
- App `docs/cross-repo-registry.md`, including *Drift check* `:264-281`
- App `.claude/tasks/data-repo-backlog.md` D-17
- `.claude/tasks/step4-mirror-version.md` §4.2 (the route precedent) and §4.4 (where F1 was first recorded)
- `lib/registry.mjs`, `test/registry.test.mjs`, `scripts/check-crons.mjs`, and `.github/workflows/{smoke-test,daily-snapshot}.yml`

---

## 0. Findings, re-verified against live source

| # | Brief / backlog says | Live source says |
|---|---|---|
| F1 | The documented check diffs against `../sleeper-dashboard-data/README.md` | **Confirmed.** App `docs/cross-repo-registry.md:269-270`. `README.md` has 0 sentinel lines, so its span is empty; the app span is 244 lines, and `diff` prints 245. The same stale path is also in the app prose at `:9`, `:13` and `:266`. The registry left `README.md` in `b44304e`. |
| F2 | One line of real drift: CR-01 `Triggers` | **Confirmed, and it is the only drift.** The corrected line-anchored diff shows exactly one changed line (span line 34): the app copy appends `` `src/utils/lineup.js` `buildLeagueLineups` (`proj` accessor) `` after `` `src/App.jsx:603` ``. It was added in app `83a4326` and never synced. Live `lineup.js:181-182` reads `seasonProjections?.[id]?.projectedPPG`. |
| F3 | D-17: `rec_air_yd` reads at `:734`/`:742` | **Stale again.** At app `a61d938` the reads are `seasonProjection.js:748`/`:756` (with `rec_tgt` at `:747`/`:755`). The registry (CR-13 App side) still says `:445`/`:453`. |
| F4 | D-17: `resolveAttributedTeam` at `:777` | **Stale again.** The call is at `:791`. The registry (CR-02 Triggers) says `seasonProjection.js:488`. |
| F5 | D-17: `computeKtcSignals` at `:596` | **Stale again.** The call is at `:602` (the import `:11` is right). The registry (CR-17 App side) says `` `:11`/`:307` ``. |
| F6 | D-17: CR-01 unlisted consumers | **All confirmed at `a61d938`:** `PlayerDetailModal.jsx:119-120,147-152,275,299,580`; `MyTeamView.jsx:19-21`; `App.jsx:602-604`; `usePlayerProfile.js:151`. The currently listed CR-01 anchors (`:179`, `:278`, `:25`, `:603`, `Market.jsx:439-446,537`, `PlayerDetailTabs.jsx:111`, `marketFilters.js:152`, `Portfolio.jsx:366-367`, `PlayerCard.jsx:42`) all still hold. |
| F7 | — | The registry has exactly three `seasonProjection.js:NNN` anchors (CR-02, CR-13, CR-17); all are stale and all are corrected here. |
| F8 | — | `lib/registry.mjs` `extractRegistryRegion` finds sentinels with `indexOf`, not line-anchored. On the app file it would pick the inline mention at `:15` before the real sentinel at `:19`. It is correct on the data file only because no sentinel literal appears there inline, and **that includes inside the span**: an inline END literal inside any entry would truncate the region. The new test does not reuse it for comparison, RM-S3 guards the hazard, and CR-24 (§4) avoids writing the literals. **No `lib/` change is needed.** |
| F9 | — | `smoke-test.yml` runs only on PRs touching `bin/`, `lib/`, `scripts/`, `package.json`, `enrichment/` or `.github/workflows/`. A registry-only PR runs **no CI at all**. |
| F10 | — | `daily-snapshot.yml` already checks out `antonwilms/sleeper-dashboard` (public) with the default token, succeeding daily. Cross-repo checkout in CI is proven. |
| F11 | — | `scripts/check-crons.mjs` enrolls every workflow with a `cron:` line and reports `failed` when the **latest run of any event** did not succeed (`:186`, `:163-169`). |
| F12 | — | `CLAUDE.md` is 24,954 / 25,000 bytes; §7c nets +17. "all 23 `CR-NN` entries" appears in data `CLAUDE.md:116`, data `README.md:1499` and app `CLAUDE.md:143`. |
| F13 | — | App `docs/cross-repo-registry.md:279` records the opposite design: the drift check is "not a CI gate — adding one would mean giving a build step cross-repo access, which is the coupling this design avoids". No other doc in either repo states this. |

---

## 1. Design: how a byte-identity test avoids being green by default

| Option | Catches | Misses |
|---|---|---|
| **A. Skip if the sibling is absent** (compare by default when `../sleeper-dashboard` exists) | Drift between the two local checkouts, whenever `npm test` runs | **All of CI:** `smoke-test.yml` skips it on every run. It also gives **false reds** from a local app checkout on a feature branch, not pulled, or mid two-session window, which recreates the cry-wolf failure. |
| **B. Committed hash of the app span** | A data-only span edit that did not also update the hash, on PRs that run CI (per F9, a registry-only PR runs none) | **Every app-side edit, including today's F2.** It is circular: the hash is refreshed either from this copy, which proves nothing, or from the app copy, which is the sync itself, trusted. It misses app-side moves. It proves internal consistency, not identity. |
| **C. CI job that checks out both repos** | Drift in either direction against app `main`; a move or rename of either registry file; the documented command pointing at the wrong file (RM-X4, F1's regression); registry-only PRs here (own path filter) | An app-only edit waits for the next scheduled run (≤ 24 h). It reds during the two-session window, which is correct. It depends on the app staying checkout-able, the same dependency as `daily-snapshot.yml`. |
| **D. Local-only script** | Whatever it is run on, when it is run | Everything otherwise. That is the current design, which decayed silently from `b44304e` to now. |

**Choice: C enforces; the same test file is opt-in locally. B is rejected (blind to F2), and A's default-on comparison is rejected (false reds).**
- **Structural half** (the data file exists at its path and has exactly one line-anchored sentinel pair): runs in every `npm test`, locally and in `smoke-test.yml`.
- **Cross-repo half:** runs only with `REGISTRY_MIRROR=1`, and then a missing sibling **fails**. `registry-mirror.yml` sets it. Without it, those tests are skipped with a visible `# SKIP` reason, and **the sibling is never read** (§10 flag 4).

**Decision reversal (Anton, 2026-09-14).** C reverses F13's recorded "not a CI gate" design. The reason it gave, avoiding cross-repo access from a build step, was already superseded by `daily-snapshot.yml` (CR-22), and the manual-only design demonstrably failed. §5 A5 rewrites that paragraph, and CR-24 (§4) registers the new coupling.

---

## 2. Sequencing: the app repo applies first

**Route: two-session** (Anton, 2026-09-13, PR #10; the parent folder has no `CLAUDE.md` and no review gate).
1. **This session** emits the exact text (§4, §5).
2. **An app-repo session applies it first:**
   - (a) Every in-span correction (F2–F6) and CR-24's App side are app-side facts, verifiable only against live `src/`/`docs/`.
   - (b) RM-X4 cannot pass until the app's documented command is fixed (A4), so a data-first landing would ship the test red or weakened.
   - (c) The data sync then copies an app-verified span, and the test is green on its first CI run.
3. **Data Session 2**, once step 2 is on app `origin/main`: syncs byte-for-byte, then adds the test, workflow and docs, and proves red → green (§8).

**Transient state:** between steps 2 and 3, the copies differ by exactly the §4 edits. Nothing reds, because the workflow does not exist yet. After this slice, any future window reds the daily run, and that red is the sync owed.

---

## 3. Overview

| Where | What | Section |
|---|---|---|
| App `docs/cross-repo-registry.md`, inside sentinels | E1–E4 anchors; E5 new CR-24 | §4 |
| App `docs/cross-repo-registry.md`, outside sentinels | A1–A5 | §5 |
| App `CLAUDE.md`, `.claude/tasks/data-repo-backlog.md` | A6 (entry count), A7 (D-17 note) | §5 |
| Data `cross-repo-registry.md`, inside sentinels | Byte-for-byte sync from the app span | §8 step 2 |
| `test/registry-mirror.test.mjs`, `.github/workflows/registry-mirror.yml` | New | §6 |
| Data docs | Pointers, counts, Actions table | §7 |

---

## 4. Cross-repo impact

### 4.1 Entries touched

- **CR-01, CR-02, CR-13, CR-17** — app-side cache corrections only (E1–E4). No data-side trigger is touched, so no `Mirror` obligation fires; they land in both copies because they are inside the span.
- **CR-18 · Signal registry rows — trigger touched, no row edit owed.** §7d edits `data-catalog.md`, a data-side trigger. The edits retarget three "registry lives in README.md" pointers and change no field, stat key, source, coverage, or reconstructable-vs-ephemeral status. **No `docs/signal-registry.md` row edit is owed**, and no family row changes.
  > **Mirror (verbatim):** This entry's data side is the one genuinely open set in the registry — a brand-new ingest adds a script the list above cannot already name. The listed sites are every one that exists today; a *new* one is caught by the near-side re-verification duty (the data repo's reviewer re-derives its own side against live `scripts/` and `lib/` on every review), not by this list. When a data-repo change adds, removes or reclassifies an ingested field, stat key or source — or alters its historical coverage or reconstructable-vs-ephemeral status — emit the exact `docs/signal-registry.md` row edit the app must make (layer · source · coverage · reconstructable-vs-ephemeral · current use), and update the family's `data-catalog.md` row on the data side in the same change. **Nothing fails in either repo when this drifts** — the registry simply becomes wrong, and since it is the inventory that governs snapshot-capture and grading-inclusion decisions, a stale row misroutes those decisions months later. The data repo cannot edit `docs/signal-registry.md`; the emitted row edit is the whole deliverable.
- **CR-24 · new** (E5). It registers the coupling `registry-mirror.yml` creates (§10 flag 2).
  - **Precedent:** CR-22, the data repo's CI depending on app surfaces.
  - **Routing:** kept in-repo rather than sent to the Claude.ai project (Anton, 2026-09-14). Both sides were read during this planning, and the coupling is the registry's own guard.

### 4.2 Emitted in-span text (the app session applies; data Session 2 syncs)

Each `old` occurs exactly once in the data copy (`grep -oF … | wc -l`). **The applying session re-checks that each `old` occurs exactly once in the app file, and stops on any other count.**

**E1 · CR-01 `Triggers` (F6).**
- **E1a**
  - old: ``its live consumers `src/hooks/usePlayerProfile.js:179`, `src/components/market/Market.jsx:439-446,537`, `src/components/dp/PlayerDetailModal.jsx:278`,``
  - new: ``its live consumers `src/hooks/usePlayerProfile.js:151,179`, `src/components/market/Market.jsx:439-446,537`, `src/components/dp/PlayerDetailModal.jsx:119-120,147-152,275,278,299,580`,``
  - (`usePlayerProfile.js:179` alone also occurs in CR-11, hence the long `old`.)
- **E1b** old: `` `src/components/roster/MyTeamView.jsx:25` `` → new: `` `src/components/roster/MyTeamView.jsx:19-21,25` ``
- **E1c** old: `` `src/App.jsx:603` `` → new: `` `src/App.jsx:602-604` ``

**E2 · CR-02 `Triggers` (F4).** old: `` `src/utils/seasonProjection.js:488` `` → new: `` `src/utils/seasonProjection.js:791` ``

**E3 · CR-13 `App side` (F3).** old: `` `src/utils/seasonProjection.js:445`/`:453` `` → new: `` `src/utils/seasonProjection.js:748`/`:756` ``

**E4 · CR-17 `App side` (F5).** old: `` `src/utils/seasonProjection.js:11`/`:307` `` → new: `` `src/utils/seasonProjection.js:11`/`:602` ``

**E5 · CR-24, a new entry.** Insert after CR-23's `- **Mirror:**` line: one blank line, then these 7 lines (heading + 6 fields). The existing blank line before the END sentinel stays. **This is exactly 8 inserted lines.**
- **Hard rule: the entry must contain no sentinel literal and no `sed` range literal** (F8, RM-X4).

```text
#### CR-24 · Registry mirror drift check *(new — registry-driftcheck-repair.md, 2026-09-14)*
- **App side:** `docs/cross-repo-registry.md` — its path, its one line-anchored sentinel pair, and the two `sed` range lines in its *Drift check* section, which name `docs/cross-repo-registry.md` and `../sleeper-dashboard-data/cross-repo-registry.md` from the app repo root
- **Data side:** `test/registry-mirror.test.mjs` (`APP_REGISTRY_REL`, `DATA_REGISTRY_REL`, `parseDocumentedDiffPaths`, `extractMirroredSpan`), `.github/workflows/registry-mirror.yml` (checks out the app's `main` beside this repo and runs that test with `REGISTRY_MIRROR=1`, daily and on registry changes here)
- **Invariant:** the mirrored span is byte-identical in both registry files; each registry file lives at the path the test names and carries exactly one line-anchored sentinel pair; and the app's documented drift command resolves to exactly those two files.
- **Direction:** both
- **Triggers:** `docs/cross-repo-registry.md`'s path and the two `sed` range lines of its *Drift check* section  ‖  `test/registry-mirror.test.mjs` (`APP_REGISTRY_REL`, `DATA_REGISTRY_REL`, `parseDocumentedDiffPaths`), `.github/workflows/registry-mirror.yml`
- **Mirror:** Moving or renaming either registry file, changing either file's sentinel lines, or rewording or removing the two `sed` range lines in the app's *Drift check* section must update `APP_REGISTRY_REL`/`DATA_REGISTRY_REL`/`parseDocumentedDiffPaths` in `test/registry-mirror.test.mjs` and the app's documented command in the same cycle. **Nothing app-side fails when this drifts** — the data repo's scheduled `registry-mirror.yml` reds on its next daily run, naming the missing file or the unparseable command. Never write the sentinel literals or a `sed` range literal inside any registry entry: the data repo's `indexOf`-based extractor and the documented-command parser would both misread it. Adding, editing or retiring an ordinary entry does not fire this entry — that is the byte-identical rule every entry already follows, and this check is what enforces it.
```

**Anchor drift before apply.** E1–E4 are true at app `a61d938`. If app commits land first (Portfolio Slice B touches `App.jsx`/`Portfolio.jsx`):
1. The applying session recomputes each **new** anchor against its live `HEAD`, for the same statement described in F3–F6. App-side anchors are its near side.
2. It applies the recomputed value.
3. It reports every value that differs from this file.

If a CR-01 anchor this slice does *not* change has moved, it **stops and reports**.

**Out of scope:** every other app-side anchor in these entries (e.g. CR-17's `ktcHistory.js`/`dataStore.js`/`ktcMatch.js`, CR-13's `outlookPositionStats.js`).

**Data-side effect:** `test/registry.test.mjs` resolves CR-24's data-side symbol claims against `test/registry-mirror.test.mjs`. That is why §8 writes the test (step 1) before the sync (step 2).

---

## 5. App-repo apply step (runs first) — exact text

One commit, `docs: registry drift-check repair — D-17 anchors, CR-24, drift command path`, to app `main` (`git pull --rebase origin main` first, never `--force`).

**Before the commit, the session:**
1. Applies E1–E5 and A1–A7. Each `old` must occur exactly once; stop otherwise.
2. From the app root, runs the corrected command (A4). The output must be exactly:
   - four one-line `c` hunks: CR-01 `Triggers`, CR-02 `Triggers`, CR-13 `App side`, CR-17 `App side`; F2's line is the same line as E1's, so this is 4, not 5;
   - plus one hunk adding the 8 CR-24 lines.
   Paste it into the hand-back.
3. Confirms `grep -c` of the BEGIN sentinel string in `docs/cross-repo-registry.md` is still 2 (the `:15` inline mention plus the real line), so CR-24 added no literal.
4. Runs `npm test`.

**A1 · `:9`.** old: `` in its own `README.md` (it has no `docs/` tree) `` → new: `` in its own top-level `cross-repo-registry.md` (it has no `docs/` tree) ``

**A2 · `:13`.** old: `` corresponding region of `sleeper-dashboard-data/README.md` `` → new: `` corresponding region of `sleeper-dashboard-data/cross-repo-registry.md` ``

**A3 · `:266`.** old: `` (this file; `sleeper-dashboard-data/README.md`) `` → new: `` (this file; `sleeper-dashboard-data/cross-repo-registry.md`) ``

**A4 · `:270`.** old: `../sleeper-dashboard-data/README.md)` → new: `../sleeper-dashboard-data/cross-repo-registry.md)`. The two lines must then read exactly as follows; their shape is load-bearing (RM-X4, CR-24):
```text
diff <(sed -n '/^<!-- CR-REGISTRY-BEGIN -->$/,/^<!-- CR-REGISTRY-END -->$/p' docs/cross-repo-registry.md) \
     <(sed -n '/^<!-- CR-REGISTRY-BEGIN -->$/,/^<!-- CR-REGISTRY-END -->$/p' ../sleeper-dashboard-data/cross-repo-registry.md)
```

**A5 · `:279`, last paragraph of *Drift check*.** This reverses F13, per Anton's 2026-09-14 decision.
- old:
  ```text
  This is a manual check for the human, **not** something either subagent can run (neither can read the other tree) and not a CI gate — adding one would mean giving a build step cross-repo access, which is the coupling this design avoids.
  ```
- new:
  ```text
  Neither subagent can run this command (neither can read the other tree). **It is also enforced in CI from the data repo (CR-24):** `test/registry-mirror.test.mjs` extracts both spans with the same line-anchored rule, asserts them byte-identical, and asserts that the two paths in the command above resolve to the two files it compares — so moving or renaming either registry file, or this command drifting to the wrong file, reds the check instead of silently emptying one span. `.github/workflows/registry-mirror.yml` runs it daily and on data-repo registry changes, with both repos checked out side by side. An earlier version of this section rejected a CI gate to avoid giving a build step cross-repo access; `daily-snapshot.yml` (CR-22) had already crossed that line, and the manual-only check went unrun and broken for months. A one-sided edit in this repo reds the data repo's next scheduled run; that red is the sync owed, not a flake. Locally, from the data repo root: `REGISTRY_MIRROR=1 node --test test/registry-mirror.test.mjs` (it compares working trees, so both checkouts should be on `main`).
  ```
- A5 describes the data workflow before it merges; that window is accepted (§2).

**A6 · app `CLAUDE.md:143`.** old: ``all 23 `CR-NN` entries`` → new: ``all 24 `CR-NN` entries`` (0 bytes).

**A7 · backlog D-17.** Append after the third bullet of "Also carries three registry corrections…":
```text
  **Applied app-side <app SHA> (CR-01 consumers, CR-02/CR-13/CR-17 anchors, recomputed at that commit; plus new CR-24); data sync + repaired drift check tracked in the data repo's `.claude/tasks/registry-driftcheck-repair.md`.**
```

**App hand-back:** the SHA, the step 2 output, and every anchor value that differs from §4.

---

## 6. Tests to add

### 6.1 `test/registry-mirror.test.mjs` — layout

Imports: `node:test`, `node:assert/strict`, `fs`, `path`, `url`, and `REGISTRY_BEGIN`, `REGISTRY_END`, `extractRegistryRegion`, `parseEntries` from `../lib/registry.mjs`. Nothing else, so CI needs no `npm ci`.

```js
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_REGISTRY_REL = 'cross-repo-registry.md';
const APP_REGISTRY_REL = 'docs/cross-repo-registry.md';
const APP_PACKAGE_NAME = 'sleeper-dashboard';
const appDir = path.resolve(repoRoot, '..', 'sleeper-dashboard');
```
These names must match CR-24's `Data side` exactly, because `registry.test.mjs` resolves them. The helpers are test-local; **do not move them to `lib/`**.

1. **`extractMirroredSpan(text, label)`** → `string`.
   - Split on `'\n'`, then collect indices of lines **exactly equal** to `REGISTRY_BEGIN` / `REGISTRY_END`. No trim and no `\r` strip: `sed` `^…$` semantics.
   - Unless both counts are 1, throw `` `${label}: expected exactly one BEGIN and one END sentinel line, found BEGIN×${b} END×${e}` ``.
   - If END precedes BEGIN, throw `` `${label}: END sentinel (line ${e+1}) precedes BEGIN (line ${b+1})` ``.
   - Otherwise return `lines.slice(b, e + 1).join('\n')`.
   - **Never returns `''`.**
2. **`firstDifference(a, b)`** → `null` if `a === b`.
   - Otherwise `{ line, a, b, entry }`: `line` is the 1-based span line of the first differing line; a missing line is `'<missing>'`.
   - `entry` is the nearest `/^#### (CR-\d+)/` id at or above that line in `a`, else `'(entry format block)'`.
   - Texts are truncated to 300 chars.
3. **`parseDocumentedDiffPaths(text)`** → `[appPath, dataPath]`.
   - All matches of `/sed -n '\/\^<!-- CR-REGISTRY-BEGIN -->\$\/,\/\^<!-- CR-REGISTRY-END -->\$\/p' ([^\s)]+)/g`, in document order.
   - Unless exactly 2, throw `` `documented drift command: expected exactly 2 sed range lines, found ${n}` ``.
4. **`siblingDecision({ mode, readPackageName })`** → `{ kind: 'skip'|'fail', reason }` or `{ kind: 'compare' }`.
   - `mode` is `process.env.REGISTRY_MIRROR`.
   - `readPackageName` is a **thunk**, `() => string | null` (the `name` from `appDir/package.json`; `null` on any read or JSON error). **It is called only when `mode === '1'`**, so a plain `npm test` never touches the sibling tree.

   | `mode` | Thunk called? | Result |
   |---|---|---|
   | `undefined` / `''` | **no** | `skip`: `REGISTRY_MIRROR not set — cross-repo span comparison not run. Run: REGISTRY_MIRROR=1 node --test test/registry-mirror.test.mjs` |
   | any other non-`'1'` (`'true'`, `'0'`) | **no** | `fail`: `REGISTRY_MIRROR must be "1" or unset, got "<mode>"` |
   | `'1'`, returns `null` | yes | `fail`: `REGISTRY_MIRROR=1 but no sibling app repo at <appDir> (no readable package.json)` |
   | `'1'`, returns another name | yes | `fail`: `REGISTRY_MIRROR=1 but <appDir> is package "<name>", not "sleeper-dashboard"` |
   | `'1'`, returns `APP_PACKAGE_NAME` | yes | `compare` |

**Wiring.**
- Compute `const decision = siblingDecision({ mode: process.env.REGISTRY_MIRROR, readPackageName: () => readPackageName(appDir) })` once at module load.
- Each RM-X test is `test(name, { skip: decision.kind === 'skip' ? decision.reason : false }, () => { if (decision.kind === 'fail') assert.fail(decision.reason); … })`.
- Under `fail`, every RM-X fails; none skips.
- **No sibling path is read anywhere outside the RM-X test bodies and the thunk.**

### 6.2 Always-on tests (no sibling access)

| Id | Input | Expected |
|---|---|---|
| RM-U1 | `'intro\n<!-- CR-REGISTRY-BEGIN -->\nbody\n<!-- CR-REGISTRY-END -->\nouter'` | `'<!-- CR-REGISTRY-BEGIN -->\nbody\n<!-- CR-REGISTRY-END -->'` |
| RM-U2 | U1 with a line ``Prose mentions `<!-- CR-REGISTRY-BEGIN -->` inline.`` before the real BEGIN (app `:15` shape) | Same as U1 |
| RM-U3 | `'# README\nno sentinels here\n'` (F1 shape); also a second, different sentinel-less text | Both throw `/BEGIN×0 END×0/`; never `'' === ''` |
| RM-U4 | Two BEGIN lines, one END | Throws `/BEGIN×2 END×1/` |
| RM-U5 | END before BEGIN | Throws `/precedes BEGIN/` |
| RM-U6 | U1 with `\n` → `\r\n` | Throws `/BEGIN×0 END×0/` |
| RM-U7 | `firstDifference(x, x)` | `null` |
| RM-U8 | `a` = one format-block line, `#### CR-01 · X`, `- **Triggers:** foo`; `b` the same with a trailing space on line 3 | `{ line: 3, entry: 'CR-01' }` |
| RM-U9 | `a` has one extra final line | `line` = `b`'s line count + 1; `b === '<missing>'` |
| RM-U10 | A difference above the first `#### CR-` line | `entry === '(entry format block)'` |
| RM-U11 | The A4 two-line block | `['docs/cross-repo-registry.md', '../sleeper-dashboard-data/cross-repo-registry.md']` |
| RM-U12 | The pre-A4 block (`…/README.md)`) | Returns the README path (RM-X4 is what rejects it) |
| RM-U13 | 0, 1 or 3 `sed` range lines | Each throws `/expected exactly 2/` |
| RM-U14 | `siblingDecision` over every §6.1 row, with a **spy thunk** counting calls | Results and reasons as tabled. **The spy's call count is 0 for `undefined`, `''` and `'true'`**, and 1 for each `'1'` row. The skip reason contains `REGISTRY_MIRROR=1 node --test` |

**On the real data file:**

| Id | Asserts | Fails loudly when |
|---|---|---|
| RM-S1 | `readFileSync(repoRoot/DATA_REGISTRY_REL)` succeeds; `extractMirroredSpan` does not throw; `parseEntries(span).length >= 20` | The data registry moves or is renamed (ENOENT names the path); a sentinel is deleted, duplicated or bared; the parser breaks |
| RM-S2 | No other top-level `*.md` file in `repoRoot` has a line exactly equal to either sentinel; the message lists offenders | A second copy appears (e.g. pasted back into `README.md`) |
| RM-S3 | `extractRegistryRegion(text) === extractMirroredSpan(text, DATA_REGISTRY_REL)` | A sentinel literal is written inline anywhere in the data file, framing or entries: `lib/registry.mjs`'s `indexOf` extraction would misread the region (F8). **This pins the file, not the extractor.** |

### 6.3 Cross-repo tests (`REGISTRY_MIRROR=1`)

| Id | Asserts | Failure message must include |
|---|---|---|
| RM-X1 | `appDir/APP_REGISTRY_REL` exists and is readable | `sibling present at <appDir> but <APP_REGISTRY_REL> is missing — registry moved or renamed? Update this test and both registry docs together (CR-24)` |
| RM-X2 | `extractMirroredSpan(appText, 'app ' + APP_REGISTRY_REL)` does not throw; ≥ 20 entries | The helper's message, labelled `app` |
| RM-X3 | `firstDifference(dataSpan, appSpan) === null` | `mirrored span differs at span line <line> (<entry>):\n  data: <a>\n  app:  <b>\nSync the data copy from the app copy via the two-session route — never edit one side alone.` |
| RM-X4 | `parseDocumentedDiffPaths(appText)` → `[p1, p2]`. `realpath(resolve(appDir, p1)) === realpath(appDir/APP_REGISTRY_REL)` and `realpath(resolve(appDir, p2)) === realpath(repoRoot/DATA_REGISTRY_REL)`. Check existence **before** `realpathSync` | `app drift command path "<p>" resolves to <abs> which does not exist`, or `…resolves to <abs>, but this test compares <abs2>`. **F1's regression test** |

**Edge cases:**
- **Sibling absent, flag unset** (fresh clone, `smoke-test.yml`): RM-X skipped with the reason; the sibling is not read.
- **Sibling absent, flag set**: all RM-X fail with `no sibling app repo`.
- **Flag `true`/`0`**: all RM-X fail.
- **Sibling is a different repo**: all RM-X fail.
- **Data file renamed**: RM-S1 reds in every `npm test`, and `registry-mirror.yml`'s path filter also matches the old path.
- **App file renamed**: RM-X1 reds on the next daily run.
- **Command drifts**: RM-X4.
- **Non-standard local layout**: RM-X4 reds with the resolved paths shown. Accepted; CI reproduces the standard layout.

### 6.4 `.github/workflows/registry-mirror.yml` (new), exact content

```yaml
name: Registry mirror drift check

# CR-24. The cross-repo registry's mirrored span (between the CR-REGISTRY sentinel lines) must be
# byte-identical in cross-repo-registry.md here and docs/cross-repo-registry.md in
# antonwilms/sleeper-dashboard. Both repos are checked out SIDE BY SIDE under the workspace, so the
# test's default sibling path (../sleeper-dashboard) and the app doc's documented diff paths resolve
# exactly as they do locally. REGISTRY_MIRROR=1 turns "sibling absent" from a skip into a failure —
# without it this job would pass with nothing compared, the hole this workflow exists to close.
# The app repo is public; daily-snapshot.yml already checks it out with the default token.
# No npm ci: the test imports only node builtins and lib/registry.mjs, which has no dependencies.

on:
  schedule:
    # Daily 06:41 UTC — the only trigger that sees a one-sided app-repo edit (this repo cannot
    # observe app pushes). Commits nothing, so it cannot race the capture jobs' pushes to main.
    # Having a cron line enrolls this workflow in scripts/check-crons.mjs (cron-deadman.yml).
    - cron: "41 6 * * *"
  pull_request:
    paths:
      - "cross-repo-registry.md"
      - "lib/registry.mjs"
      - "test/registry-mirror.test.mjs"
      - ".github/workflows/registry-mirror.yml"
  push:
    branches: [main]
    paths:
      - "cross-repo-registry.md"
      - "lib/registry.mjs"
      - "test/registry-mirror.test.mjs"
      - ".github/workflows/registry-mirror.yml"
  workflow_dispatch: {}

permissions:
  contents: read

jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout data repo
        uses: actions/checkout@v4
        with:
          path: sleeper-dashboard-data

      - name: Checkout app repo (main)
        uses: actions/checkout@v4
        with:
          repository: antonwilms/sleeper-dashboard
          ref: main
          path: sleeper-dashboard

      - uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Compare mirrored spans
        working-directory: sleeper-dashboard-data
        env:
          REGISTRY_MIRROR: "1"
        run: node --test test/registry-mirror.test.mjs
```

---

## 7. Docs/README updates (data repo)

**a. `cross-repo-registry.md`, outside the sentinels.** Append to the paragraph ending ``…stays outside the sentinels.``:
```text
 The drift check is `test/registry-mirror.test.mjs` (CR-24), run in CI by `.github/workflows/registry-mirror.yml` (daily, and on changes to this file) against the app's `main`; locally, `REGISTRY_MIRROR=1 node --test test/registry-mirror.test.mjs` with `../sleeper-dashboard` checked out on `main`. The app copy documents the equivalent manual `diff`.
```

**b. `README.md`.**
- **GitHub Actions table**, after the `daily-snapshot.yml` row:
  ```text
  | `registry-mirror.yml` | Daily 06:41 UTC + PR/push to `main` touching `cross-repo-registry.md`, `lib/registry.mjs`, `test/registry-mirror.test.mjs` or itself + `workflow_dispatch` | Checks out this repo and `antonwilms/sleeper-dashboard` side by side and runs `test/registry-mirror.test.mjs` with `REGISTRY_MIRROR=1` (CR-24) — the mirrored registry span must be byte-identical and the app's documented drift command must point at both files; read-only, no writes |
  ```
- **"Why five workflows are standalone":** "five" → "six", plus the bullet `` - `registry-mirror.yml` — a read-only cross-repo check, not ingest. It writes no data file. ``
- **`:1499`:** `all 23 `→`all 24 `, then append ` Drift between this copy and the app's is checked by `test/registry-mirror.test.mjs` (CI: `registry-mirror.yml`).`

**c. `CLAUDE.md` (net +17 → 24,971 bytes).**
- `:52`: ``the mirrored `<!-- CR-REGISTRY-BEGIN -->` region in README.md`` → ``the mirrored registry region in `cross-repo-registry.md` `` (−5). The row then reads ``…for the mirrored registry region in `cross-repo-registry.md`; reports…``, with no space before `;`.
- `:70`: `Five are deliberately **not** callers:` → `Six are deliberately **not** callers:`, and insert `` `registry-mirror.yml`, `` before `` `daily-snapshot.yml` `` (+22).
- `:116`: `all 23 ` → `all 24 ` (0).
- If `claudeMdSize.test.mjs` reds, **stop and report**; do not prune.

**d. Stale README-as-registry pointers** (CR-18 disposition: no row edit, §4.1):
- `data-catalog.md:9`: `registry (README.md)` → `registry ([cross-repo-registry.md](cross-repo-registry.md))`
- `data-catalog.md:44`: `(see README.md → Cross-repo contract registry)` → `(see cross-repo-registry.md, CR-02)`
- `data-catalog.md:229`: `(internal — see README.md → Cross-repo contract registry note; no app counterpart)` → `(internal — see the non-entry note in cross-repo-registry.md; no app counterpart)`
- `snapshot-workflow.md:9`: `registry](README.md#cross-repo-contract-registry-with-sleeper-dashboard)` → `registry](cross-repo-registry.md)`
- `.claude/agents/implementation-reviewer.md:23`: ``region of `README.md`.`` → ``region of `cross-repo-registry.md`.``

**e. Not changed:**
- `store-audit-2026-08-25.md`: dated record.
- README `daily-snapshot.yml` row ("phase 1"): stale, unrelated.
- `plan-reviewer.md` ("21 entries", "gitignored"): stale, unrelated.
- `lib/registry.mjs`: F8.

---

## 8. Session 2 — steps (data repo)

**Step 0 · Preconditions (stop if any fails).**
1. `git -C ../sleeper-dashboard fetch origin`. The latest `origin/main` commit touching `docs/cross-repo-registry.md` is the §5 commit.
2. `git -C ../sleeper-dashboard status -sb` shows `## main...origin/main` with no ahead/behind and no modified tracked files. **Never switch, pull or reset the sibling**; ask instead.
3. From the data root, run the command below. The output must be exactly four one-line `c` hunks (CR-01 `Triggers`, CR-02 `Triggers`, CR-13 `App side`, CR-17 `App side`) plus one hunk adding the 8 CR-24 lines. Anything else means an unannounced app registry change: **stop**.
   ```sh
   diff <(sed -n '/^<!-- CR-REGISTRY-BEGIN -->$/,/^<!-- CR-REGISTRY-END -->$/p' cross-repo-registry.md) <(sed -n '/^<!-- CR-REGISTRY-BEGIN -->$/,/^<!-- CR-REGISTRY-END -->$/p' ../sleeper-dashboard/docs/cross-repo-registry.md)
   ```
4. `git switch main && git pull --rebase origin main && git switch -c registry-driftcheck-repair`.

**Step 1 · Test first, red on real drift.** Write §6.1–6.3.
- `npm test`: RM-U/RM-S pass, and the 4 RM-X are skipped.
- `REGISTRY_MIRROR=1 node --test test/registry-mirror.test.mjs`: RM-X3 **fails** at the first differing line (CR-01); RM-X1/X2/X4 pass.
- Record the output.

**Step 2 · Sync.** A scratchpad script (outside the repo) replaces the data span (BEGIN through END, inclusive) with the app span byte-for-byte, using exact-line extraction and touching nothing outside.
- `git diff --numstat cross-repo-registry.md` must print **`12	4`**: 4 changed field lines, plus the 8 CR-24 lines.
- `git diff -U0` hunks lie only in those fields and the CR-24 insertion.
- Then `REGISTRY_MIRROR=1 node --test test/registry-mirror.test.mjs` is all green, and `npm test` is green, including `registry.test.mjs` resolving CR-24's data-side claims.

**Step 3 · Workflow and docs.** §6.4, §7.

**Step 4 · Local mutation proofs** (each reverted; paste outputs):
- **a.** A trailing space on the data span's CR-17 `App side` line → `REGISTRY_MIRROR=1 …` reds RM-X3 naming CR-17.
- **b.** `mv cross-repo-registry.md cross-repo-registry.moved.md` → plain `npm test` reds RM-S1. Move it back.
- **c.** `REGISTRY_MIRROR=true node --test test/registry-mirror.test.mjs` → all RM-X fail with the "must be" reason.
- **d.** Plain `node --test test/registry-mirror.test.mjs` → 4 skipped, reason shown.

**Step 5 · Done-definition and commits.** `npm test`, `npm run smoke` and `REGISTRY_MIRROR=1 node --test test/registry-mirror.test.mjs` are green; no `manifest.json` or served-file change.
- Commit 1: `test: registry mirror drift check (repair README.md path)` — this task file, the test, the workflow.
- Commit 2: `docs: sync registry span from app (CR-01/02/13/17 anchors, CR-24) + drift-check docs`.
- Push the branch; open PR `fix: registry drift check — line-anchored, CI-enforced (CR-24, D-17 anchors)`, naming the app SHA.

**Step 6 · CI green proof.** `gh run list --branch registry-driftcheck-repair`, then `gh run view <id> --log`:
- `Registry mirror drift check` ran; its log shows all RM tests passing and `skipped 0`.
- `Smoke test` ran (the workflow path matches), with the 4 RM-X skipped.

**Step 7 · CI red proof.**
1. Push one commit adding a trailing space on the data CR-17 `App side` line (`test: TEMP prove registry-mirror reds`).
2. Confirm red on RM-X3 naming CR-17.
3. `git revert`, push, and confirm green.
4. Record both run ids.

The green run must land before the next 05:19 UTC `cron-deadman` run (F11).

**Step 8 · Hand-back.**
- The SHAs, the PR URL, and the files touched with any deviations.
- Step 1's red output, Step 2's numstat, and Step 4 a–d.
- The Step 6–7 run ids.
- What each RM test asserts.

**Do not merge** before verification and sign-off.

**Step 9 · After merge (Session 1).**
1. `gh workflow run registry-mirror.yml` on `main` → green.
2. Then one app hygiene commit strikes D-17's two remaining registry bullets, citing both SHAs.

---

## 9. Risks and deliberate gaps

| Risk / gap | Handling |
|---|---|
| App-only edit invisible ≤ 24 h | Accepted; closing it needs app-repo CI (separate decision) |
| App repo goes private / token scope changes | RM-X fail loudly under `REGISTRY_MIRROR=1`; never skip |
| Scheduled red during a future two-session window | Intended (the sync owed); also appears in the dead-man report |
| Anchors shift before apply | §4.2 recompute rule; Session 2 syncs from the app copy and checks the changed-field set, not values |
| Node 20 (CI) vs 24 (local) reporter output | Step 6 reads CI's own log |

---

## 10. Review record — plan-reviewer, 2026-09-13 (39,401-byte draft)

All 5 flags were verified against live source. All 5 applied (Anton, 2026-09-14: "apply them").

| # | Flag | Verified | Disposition |
|---|---|---|---|
| 1 | cross-repo — §7d edits `data-catalog.md`, a CR-18 data-side trigger, with no quote | Correct (CR-18 `Triggers` right of `‖` lists `data-catalog.md`) | **Fixed.** §4.1 quotes CR-18's Mirror verbatim; disposition: no row edit owed |
| 2 | registry-gap — `registry-mirror.yml` creates an unregistered coupling to the app's registry path and *Drift check* `sed` lines | Correct (precedent: CR-22) | **Fixed.** New CR-24 (E5), emitted and landing in both copies. Kept in-repo rather than routed to the Claude.ai project (Anton): both sides were read in planning, and the coupling is the registry's own guard. The entry must never contain sentinel or `sed` literals (F8) |
| 3 | strategy — A5 silently reverses the app doc's "not a CI gate" decision | Correct (F13) | **Surfaced and decided.** Anton approved the reversal; §1 records it and A5's new text states the reason |
| 4 | edge-case — the package name is read at module load, so plain `npm test` reads the sibling | Correct | **Fixed.** `readPackageName` is a thunk called only when `mode === '1'`; RM-U14 asserts 0 calls otherwise |
| 5 | mechanical — "§4 lines plus F2's line" should be 4, and `--stat` wording | Correct | **Fixed.** §5 says 4 (+ CR-24's 8); Step 2 uses `--numstat` = `12	4` |
