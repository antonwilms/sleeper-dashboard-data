# KTC integrity guard — replace count-based change guard with two-layer integrity check

**Session model:** opus plan only (this file). Implementation by sonnet in a separate
session. Do not edit source from the planning session. See
`[[sleeper_two_session_pattern]]`.

**Status:** planned 2026-06-23, awaiting sonnet impl.

---

## 1. Problem & diagnosis

A scheduled `ktc` run aborted with:

> `[ktc] 484/500 players changed value (96.8%) — exceeds 70% threshold. Possible selector breakage. Aborting.`

The scrape was healthy (`validateKtc` passed, 499–500 players). The values were a real
offseason recalibration. The guard false-positived, and because the run hard-aborts
(`throw` → `process.exit(1)`), the valid snapshot was discarded. KTC has no historical
backfill API, so under append-only + first-of-day-wins (Invariant 5) that day is
**permanently lost**.

**Root cause:** the guard at `scripts/update-ktc.mjs:60-87` (`largeDeltaGuard`) is
**count-based** — it counts players whose value changed *at all*. KTC values fluctuate
constantly, so any broad recalibration trips a count threshold even when the data is
perfect. Wrong metric.

### Empirical calibration (measured against the 3 committed snapshots)

Computed directly from `ktc/snapshot-2026-05-18/06-01/06-15.json` (499/500/500 rows,
integer values, range 489–9999, 36 legitimately-null positions per file = RDP rookie
picks, no duplicate names):

| Comparison | Count-guard "% changed" | **Spearman ρ** (join on `name`) |
|---|---|---|
| 05-18 → 06-01 (real, 14 days apart) | 96.8% (trips ❌) | **0.9985** (passes ✓) |
| 06-01 → 06-15 (real) | 98.0% (trips ❌) | **0.9988** (passes ✓) |

Simulated breakage (baseline 06-01):

| Breakage mode | Spearman ρ |
|---|---|
| full value shuffle | 0.07 |
| reversed ordering | −0.999 |
| 30% of values corrupted to a constant | 0.66 |
| value column = descending rank # (1..N) | −0.999 |
| block shift by 50 rows | 0.53 |
| block shift by 100 rows | 0.09 |
| block shift by 10 rows | 0.95 |
| **block shift by 1 row** | **0.9988** (NOT caught — see §3.3) |

**Conclusion:** rank-order correlation cleanly separates legitimate recalibration
(ρ ≥ 0.998) from breakage (ρ ≤ 0.66), with a wide empty gap. The count metric cannot —
it sees ~97% either way.

---

## 2. Design overview

Two layers, mapped onto the existing ingest so we **strengthen, not duplicate**:

- **Layer 1 — per-row + count validity:** strengthen the existing `validateKtc`
  (`lib/validate.mjs:220-263`). Stays a **hard-throw** — these failures are unambiguous
  structural corruption with nothing worth preserving. (Already enforces count band
  `[250,600]`, value range `[0,9999]`, ≥5 per skill position, top-10 QB sentinels.)
- **Layer 2 — aggregate ordering guard:** replace `largeDeltaGuard` with a Spearman
  rank-correlation guard keyed on player identity (`name`). On a trip → **quarantine,
  not hard-abort** (see §4). This is the layer that was false-positiving and the one
  where real data could be wrongly rejected, so it gets the recoverable failure mode.

Division of labour (what each layer uniquely catches):

| Failure | Caught by |
|---|---|
| partial fetch / count drop, missing name selector | Layer 1 count band (`< 250`) |
| non-integer / out-of-range / negative value | Layer 1 per-row range + integer check |
| value selector → constant (zero variance) | Layer 2 (`pearson` returns `null`) |
| value selector → wrong same-scale field, order scrambled | Layer 2 (ρ collapse) |
| reversed / rank-number column | Layer 2 (ρ ≈ −1) |
| legitimate broad recalibration | **neither** — both pass (the fix) |

---

## 3. Edits grouped by file

### 3.1 `scripts/update-ktc.mjs`

Current shape: header docstring (1-21), imports (23-27), helpers `todayDateString`
(29-31), `snapshotHash` (33-39), `findLastSnapshot` (41-47), `snapshotAgeDays` (49-58),
`largeDeltaGuard` (60-87), `updateKtc` (89-147).

**Edit A — imports (lines 23-27).** Add `pearson` (reuse the correlation math already
shared by `lib/backtest.mjs`) and `setStepOutput` (for the CI alert hand-off):

```js
import { fetchKtcSnapshot } from '../lib/ktc.mjs';
import { readJson, writeJsonStable, listDir, setStepOutput } from '../lib/io.mjs';
import { updateManifestEntry } from '../lib/manifest.mjs';
import { validateKtc } from '../lib/validate.mjs';
import { pearson } from '../lib/grade.mjs';   // Spearman = Pearson on ranks; reused per CLAUDE.md nav map
```

`pearson` (`lib/grade.mjs:90`) already returns `null` on zero variance (`dx2===0 || dy2===0`)
— this gives constant-value breakage detection for free; do not reimplement it.

**Edit B — delete `snapshotAgeDays` (49-58) and `largeDeltaGuard` (60-87).** Both go
away. `snapshotAgeDays` is only used by `largeDeltaGuard`; the 8-day staleness skip it
implemented is **no longer needed** — Spearman is robust to baseline age (the 05-18→06-01
pair is 14 days apart and still ρ=0.9985), so dropping the skip actually *strengthens*
the guard: it now runs even against a month-old baseline instead of silently disabling
itself exactly when a long gap could hide breakage.

**Edit C — add the new constants + pure functions** (in place of B, so the export
surface mirrors `update-schedule.mjs`'s exported `gamesHash` used by tests):

```js
// Abort below this rank-order correlation. Calibrated empirically: legitimate
// recalibration sits at ρ ≥ 0.998; every breakage mode tested is ≤ 0.66 (see
// .claude/tasks/ktc-integrity-guard.md §1). 0.90 sits in the empty gap with ~0.10
// margin below real data and ~0.24 above the highest breakage.
export const KTC_ORDERING_THRESHOLD = 0.90;

// Below this many common players the correlation is not meaningful — skip (don't
// abort). Normal snapshot-to-snapshot overlap is ~490; a value-only selector break
// keeps names intact (names come from a different selector), so low overlap means
// genuine roster churn, not breakage. A name-selector break drops the count below
// 250 and is caught by Layer 1 instead.
export const KTC_MIN_OVERLAP = 100;

/** Average-rank transform with tie handling (ties → mean of their rank span). */
function rankTransform(values) {
  const order = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const ranks = new Array(values.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    const avg = (i + j) / 2 + 1;            // 1-based average rank
    for (let k = i; k <= j; k++) ranks[order[k][1]] = avg;
    i = j + 1;
  }
  return ranks;
}

/**
 * Spearman rank correlation between two snapshots, joined on player `name`
 * (intersection only). Returns { rho, n }. rho is null when undefined
 * (n < 2, or zero variance on either side — e.g. a constant-value break).
 *
 * @param {Array<{name,value}>} prevPlayers
 * @param {Array<{name,value}>} newPlayers
 * @returns {{ rho: number|null, n: number }}
 */
export function spearmanRho(prevPlayers, newPlayers) {
  const prevByName = new Map(prevPlayers.map(p => [p.name, p.value]));
  const xs = [], ys = [];
  for (const np of newPlayers) {
    if (prevByName.has(np.name)) { xs.push(prevByName.get(np.name)); ys.push(np.value); }
  }
  const n = xs.length;
  if (n < 2) return { rho: null, n };
  return { rho: pearson(rankTransform(xs), rankTransform(ys)), n };
}

/**
 * Aggregate breakage guard. Never throws — returns a verdict the caller acts on.
 *   { ok: true,  skipped: true, reason }      no prior / insufficient overlap
 *   { ok: true,  rho, n }                      ordering preserved
 *   { ok: false, rho, n, reason }              ordering collapsed → quarantine
 *
 * @param {Array|null} prevPlayers  last good snapshot, or null/[] if none
 * @param {Array}      newPlayers   freshly scraped snapshot
 * @param {object}     [opts]
 * @param {number}     [opts.threshold=KTC_ORDERING_THRESHOLD]
 */
export function ktcOrderingGuard(prevPlayers, newPlayers, { threshold = KTC_ORDERING_THRESHOLD } = {}) {
  if (!prevPlayers || prevPlayers.length === 0) {
    return { ok: true, skipped: true, reason: 'no prior snapshot' };
  }
  const { rho, n } = spearmanRho(prevPlayers, newPlayers);
  if (n < KTC_MIN_OVERLAP) {
    return { ok: true, skipped: true, reason: `only ${n} common players (< ${KTC_MIN_OVERLAP}) — roster churn, not breakage` };
  }
  if (rho === null) {
    return { ok: false, rho, n, reason: 'undefined rank correlation (zero variance) — likely constant-value selector break' };
  }
  if (rho < threshold) {
    return { ok: false, rho, n, reason: `Spearman ρ=${rho.toFixed(4)} < ${threshold} — ordering collapsed` };
  }
  return { ok: true, rho, n };
}
```

**Edit D — header docstring (lines 14-21).** Replace the "Fail-loud guard" paragraph:

> _before_
> ```
>  * Fail-loud guard:
>  *   - Throws if player count < 250 or > 30% of players changed vs last
>  *     snapshot (catches selector breakage masquerading as data).
> ```
> _after_
> ```
>  * Integrity guards (two layers):
>  *   - Layer 1 (validateKtc, lib/validate.mjs): per-row + count validity. Hard-throws.
>  *   - Layer 2 (ktcOrderingGuard, this file): Spearman rank correlation vs the last
>  *     good snapshot, keyed on name. Recalibration preserves ordering (ρ≥0.998);
>  *     breakage collapses it (ρ≤0.66). Below KTC_ORDERING_THRESHOLD the snapshot is
>  *     QUARANTINED to ktc/quarantine/ (not committed to ktc/, not registered in the
>  *     manifest) and the run signals CI via setStepOutput — data is never lost to a
>  *     false trip. See .claude/tasks/ktc-integrity-guard.md.
> ```

**Edit E — `updateKtc`, replace step 3 (lines 103-110).** The baseline-loading lines
(`lastFile` / `lastPlayers` / `hasRunBefore`) stay; replace the `largeDeltaGuard` call
with the ordering guard + quarantine branch. Run it **after** `validateKtc` (step 2,
line 100) and **before** the dedup hash check (step 4, line 113):

```js
  // 3. Aggregate ordering guard vs last good snapshot.
  //    Skipped in dry-run (production write safety net) and on the first ever run
  //    (no last-checked.json → the only existing snapshots came from IndexedDB export,
  //    not this script, so they are not a trustworthy baseline).
  const lastFile     = findLastSnapshot();
  const lastPlayers  = lastFile ? readJson(`ktc/${lastFile}`) : null;
  const hasRunBefore = readJson(lastCheckedPath) !== null;

  if (!dryRun && hasRunBefore) {
    const guard = ktcOrderingGuard(lastPlayers, players);
    if (!guard.ok) {
      // Quarantine instead of hard-abort: preserve the rejected snapshot for manual
      // review so a false trip never permanently loses a day. Exit 0 so the workflow's
      // commit step persists the quarantine file; a trailing workflow step turns CI red.
      const quarantinePath = `ktc/quarantine/snapshot-${today}.json`;
      writeJsonStable(quarantinePath, players);
      writeJsonStable(`ktc/quarantine/snapshot-${today}.reason.json`, {
        quarantinedAt: new Date().toISOString(),
        reason: guard.reason,
        rho: guard.rho, n: guard.n, threshold: KTC_ORDERING_THRESHOLD,
        lastGood: lastFile, recordCount: players.length,
      });
      writeJsonStable(lastCheckedPath, {
        checkedAt: new Date().toISOString(), quarantined: true,
        file: quarantinePath, rho: guard.rho, reason: guard.reason,
      });
      setStepOutput('quarantined', 'true');
      setStepOutput('quarantine_reason', guard.reason);
      console.error(`[ktc] ORDERING GUARD TRIPPED — ${guard.reason}. Quarantined to ${quarantinePath}; NOT committed to ktc/. Review and promote manually if legitimate.`);
      return;
    }
    if (guard.skipped)        console.warn(`[ktc] Ordering guard skipped: ${guard.reason}`);
    else                      console.log(`[ktc] Ordering guard passed (ρ=${guard.rho.toFixed(4)}, n=${guard.n})`);
  }
```

The rest of `updateKtc` (dedup at 112-125, dry-run exit 127-131, write 133-146) is
**unchanged**. The success path still calls `updateManifestEntry` (140-145); the
quarantine path deliberately does **not** — so the app, which reads only manifest-listed
files, never sees a quarantined snapshot.

> Optional (nice-to-have, not required): in the dry-run branch, compute and log
> `ktcOrderingGuard(lastPlayers, players)` ρ for observability without writing/quarantining.
> Keeps `npm run smoke` green (it skips the guard) while surfacing the live ρ.

### 3.2 `lib/validate.mjs` — strengthen `validateKtc` (lines 220-263)

Three targeted strengthenings; **do not** add a second count/range check elsewhere.

**Edit F — integer enforcement in the value check (line 240).** Current check accepts
any number in `[0,9999]`, so a parse that yields `88.5` slips through:

> _before_ `const badValues = players.filter(p => typeof p.value !== 'number' || p.value < 0 || p.value > 9999);`
> _after_  `const badValues = players.filter(p => !Number.isInteger(p.value) || p.value < 0 || p.value > 9999);`

`Number.isInteger` also rejects `NaN`/`Infinity`/non-numbers, so it subsumes the old
`typeof` clause. Keep the `[0,9999]` bound: it is KTC's documented index domain (README
`ktc/snapshot-<date>.json` section, line 162). **Do not** tighten the floor to the
observed min (489) — that is just the lowest-ranked of ~500 captured players, and the
low end churns as rookies enter; a 489 floor would risk a future false reject.

**Edit G — assert `name` present and non-empty (new check, after the count band ~line 230).**
The fetcher already skips empty-name rows, but validate should assert the invariant:

```js
  const badNames = players.filter(p => typeof p.name !== 'string' || p.name.trim() === '');
  if (badNames.length > 0) {
    throw new Error(`[validate] KTC: ${badNames.length} players have an empty/non-string name — possible name-selector break.`);
  }
```

**Edit H — `position` must be a known label OR null (new check).** ⚠️ **Deliberate
deviation from the task's literal "position present and non-empty":** every observed
snapshot has **36 legitimately-null positions** (RDP rookie draft picks — the scrape
filter includes `RDP`). Requiring non-null position would hard-fail on every real
snapshot. Instead assert position is null or one of the known labels (catches a
position-selector break that yields garbage strings without rejecting RDP rows):

```js
  const KNOWN_POS = new Set(['QB', 'RB', 'WR', 'TE', 'K', null]);
  const badPos = players.filter(p => !KNOWN_POS.has(p.position));
  if (badPos.length > players.length * 0.5) {
    throw new Error(`[validate] KTC: ${badPos.length}/${players.length} players have an unrecognized position — possible position-selector break.`);
  }
```

(>50% threshold mirrors the roster/playerids/advstats format-drift guards in this file;
RDP nulls are *known*, so they're whitelisted, not counted as bad.)

### 3.3 `.github/workflows/weekly-ktc.yml`

The quarantine mechanism needs two small workflow edits because the current job
(a) `git add ktc/` wholesale and (b) stops on the first non-zero exit. The script
exits **0** on quarantine (so the commit step still runs and persists the quarantine
file under `ktc/quarantine/`), and a new trailing step converts the quarantine signal
into a red run *after* the data is safely committed.

**Edit I — give the capture step an id** (so its `setStepOutput` values are addressable):

> _before_
> ```yaml
>       - name: Capture KTC snapshot
>         run: node bin/update.mjs ktc
> ```
> _after_
> ```yaml
>       - name: Capture KTC snapshot
>         id: capture
>         run: node bin/update.mjs ktc
> ```

**Edit J — add a trailing alert step** (after the existing "Commit and purge if changed"
step, which already `git add ktc/` → commits the quarantine file, and whose CDN purge of
the non-existent `snapshot-DATE.json` is already tolerated by its `|| true`):

```yaml
      - name: Fail if snapshot was quarantined
        if: steps.capture.outputs.quarantined == 'true'
        run: |
          echo "::error::KTC snapshot quarantined for review: ${{ steps.capture.outputs.quarantine_reason }}"
          exit 1
```

> Optional polish: make the commit message reflect a quarantine
> (`if [[ "${{ steps.capture.outputs.quarantined }}" == "true" ]]; then MSG="ktc: quarantine ${SNAPSHOT_DATE} (ordering guard)"; else MSG="ktc: snapshot ${SNAPSHOT_DATE}"; fi`).
> Not required for correctness.

**Promotion path (manual ops, document only — no code this task):** if review confirms a
quarantined snapshot is legitimate, an operator moves it into place and registers it:
`git mv ktc/quarantine/snapshot-<date>.json ktc/snapshot-<date>.json`, deletes the
`.reason.json` sidecar, then adds the manifest entry (e.g. a one-off
`node -e "import('./lib/manifest.mjs').then(m => m.updateManifestEntry({ path: 'ktc/snapshot-<date>.json', recordCount: <n>, inProgress: true }))"`),
and commits. A dedicated `ktc --promote <date>` subcommand is a possible follow-up but is
**out of scope** here.

### 3.4 `package.json`

**No change.** `smoke` already runs `node bin/update.mjs ktc --dry-run` (guard skipped in
dry-run by design) and `test` is `node --test`. Guard coverage lives in the new unit test
file (§Tests), which `node --test` picks up automatically.

---

## 4. Capture-only failure mode — recommendation: **quarantine, not hard-abort**

**Recommend quarantine.** Justification:

- The incident *was* a false positive that permanently destroyed valid data. Under the
  new design the original incident (broad recalibration, ρ=0.998) no longer trips at all
  — so a Layer-2 trip is now a genuinely rare/unforeseen event. For that rare case,
  quarantine is cheap insurance that removes the "permanent loss" failure mode entirely.
- **True breakage stays contained:** quarantined files are written to `ktc/quarantine/`,
  are **not** registered in `manifest.json`, and are **not** under the app-consumed
  `ktc/snapshot-*.json` path. The app reads only manifest-listed files (Cross-repo
  "Manifest contract"), so bad data is never served — same protection as a hard-abort.
- **CI still goes red:** the trailing workflow step (Edit J) fails the run, so a human is
  alerted exactly as before. The only behavioural change is that the rejected bytes are
  preserved (committed to git history under `ktc/quarantine/`) instead of vaporised.
- **Asymmetry of errors:** a false abort loses irreplaceable data (no KTC backfill); a
  false quarantine costs one manual review. Quarantine dominates.

**Layer 1 (`validateKtc`) stays a hard-abort** — count/range/integer/name failures are
unambiguous structural corruption (nothing worth promoting), and a throw there exits the
capture step non-zero → red CI directly, with no quarantine file written. Only the
order-sensitive Layer 2 — the false-positive-prone one — gets the recoverable path.

---

## 5. Docs updates

### `README.md`

The current README does **not** document the old delta guard at all (no "70%"/"guard"
text in the KTC sections), so this is additive.

1. **`ktc/snapshot-<date>.json` section (after line 162).** Append a short paragraph:

   > **Integrity guards.** Each scrape is validated per-row (finite integer value in
   > 0–9999, non-empty name, known position or null for rookie picks, count 250–600) and
   > checked for aggregate breakage via a Spearman rank correlation against the last good
   > snapshot (joined on player name). Legitimate market recalibration preserves ordering
   > (ρ ≈ 0.998); a selector/parse break collapses it. Below ρ = 0.90 the snapshot is
   > **quarantined** to `ktc/quarantine/` (committed for review but not registered in the
   > manifest, so the app never reads it) and the weekly workflow fails for manual review —
   > a false trip never permanently loses a day.

2. **Workflows table, `weekly-ktc.yml` row (line 608).** Replace the description:

   > _before_ `Runs node bin/update.mjs ktc, commits new snapshot if values changed, purges jsDelivr CDN cache for changed files`
   > _after_  `Runs node bin/update.mjs ktc; per-row + Spearman-ordering integrity guards; commits the new snapshot (or a quarantined one under ktc/quarantine/ for review) if changed, purges jsDelivr CDN cache; fails the run if a snapshot was quarantined`

3. **Automation note near line 616** (the "commits only when content changes" paragraph).
   Append one sentence:

   > If the ordering guard trips, the scrape is written to `ktc/quarantine/` with a
   > `.reason.json` sidecar instead of `ktc/`, and the run fails so it can be reviewed and
   > promoted manually.

### `CLAUDE.md`

1. **Navigation map (line 114), `scripts/update-ktc.mjs` row.** Replace purpose text:

   > `KTC snapshot capture logic; exports spearmanRho / ktcOrderingGuard (Spearman ordering guard) + KTC_ORDERING_THRESHOLD`

2. **Navigation map — add a row under the `ktc/` row (after line 134):**

   > `| ktc/quarantine/ | Snapshots rejected by the ordering guard (script-produced, NOT manifest-registered, NOT app-read); review + promote manually |`

3. **Invariant 5 (line 165).** Append one sentence to the KTC clause:

   > A scrape that fails the Spearman ordering guard is written to `ktc/quarantine/`
   > (script-produced, unregistered, app-ignored) rather than `ktc/`, so a false trip
   > never permanently loses data; it is not "primary data" under Invariant 2.

No other CLAUDE.md sections need edits: no new `bin/` subcommand, no new `package.json`
script, no manifest field change, no schema change (see §6). Signal-registry note: this
change does **not** add/remove/alter ingested-field historical coverage — KTC's captured
fields and coverage are unchanged — so no `docs/signal-registry.md` flag is needed.

---

## 6. Tests to add

New file **`test/update-ktc.test.mjs`** (`node --test`, imported by `npm test`; pattern
mirrors `test/update-schedule.test.mjs` importing `gamesHash`). Imports:
`spearmanRho`, `ktcOrderingGuard`, `KTC_ORDERING_THRESHOLD`, `KTC_MIN_OVERLAP` from
`../scripts/update-ktc.mjs`; `validateKtc` from `../lib/validate.mjs`; `readJson`,
`listDir` from `../lib/io.mjs`.

Helper: `mk(name, value, pos='WR') => ({ name, value, position: pos, team: 'X' })`.
A `validBase()` builder producing ≥300 rows passing `validateKtc` (≥5 each QB/RB/WR/TE,
≥3 of `KTC_TOP_QB_SENTINELS` in the top 10 — include `Josh Allen`, `Drake Maye`,
`Caleb Williams` at the top — values strictly decreasing integers in `[500, 9999]`).

### `spearmanRho` units
| # | Input | Expected |
|---|---|---|
| 1 | identical arrays (N≥3) | `rho` ≈ 1 (assert `> 0.9999`), `n` = N |
| 2 | new = old with values reversed (rank-inverted) | `rho` ≈ −1 (assert `< -0.9999`) |
| 3 | new values all equal (constant) | `rho === null` (zero variance via `pearson`) |
| 4 | new shares only 2 of 50 names | `n === 2` (intersection-only join) |
| 5 | new has < 2 common names | `rho === null`, small `n` |

### `ktcOrderingGuard` units
| # | Scenario | Input | Expected |
|---|---|---|---|
| 6 | **legit recalibration passes** | base, then new = each value jittered ±3% keeping order | `ok:true`, `rho > KTC_ORDERING_THRESHOLD` |
| 7 | **selector breakage aborts** | base vs values shuffled (Fisher-Yates) | `ok:false`, reason matches `/ordering collapsed/` |
| 8 | **constant-value breakage aborts** | base vs all-equal new | `ok:false`, reason matches `/zero variance/` |
| 9 | **row-misalignment aborts** | base vs new with values block-rotated by `floor(N/2)` (gross misalignment; ρ→negative) | `ok:false` |
| 10 | **no prior snapshot** | `prevPlayers = null` (and `[]`) | `ok:true`, `skipped:true`, reason `/no prior/` |
| 11 | **player churn / low overlap** | prev & new share < `KTC_MIN_OVERLAP` names | `ok:true`, `skipped:true`, reason `/common players/` |
| 12 | **threshold boundary** | `ktcOrderingGuard(prev, new, { threshold: 0.99 })` on the case-6 data so ρ lands just under 0.99 | `ok:false` (asserts the threshold is actually applied) |

> ⚠️ **Row-misalignment note (informs case 9):** a **1-row** shift leaves ρ ≈ 0.9988 and
> does **not** trip — Spearman is insensitive to a single-position offset, and that mode
> is structurally near-impossible here anyway (this scraper reads `name`+`value`+`position`
> from the *same* `div.onePlayer` element, `lib/ktc.mjs:52-65`, so name and value cannot
> drift apart by one). The realistic "misalignment"/parse breaks (wrong column → constant,
> rank-number column, gross block shift) all collapse ρ and are covered by cases 7–9.
> The fixture in case 9 must therefore use a *gross* misalignment, not a 1-row shift.

### `validateKtc` units (Layer 1 strengthenings)
| # | Scenario | Expected |
|---|---|---|
| 13 | clean `validBase()` | `doesNotThrow` |
| 14 | one value = `88.5` (non-integer) | `throws` `/value outside|integer/` (Edit F) |
| 15 | 36 rows with `position: null` (RDP) + rest valid | `doesNotThrow` (Edit H regression — the deviation) |
| 16 | one row `name: ''` | `throws` `/empty.*name/` (Edit G) |
| 17 | >50% positions set to `'XYZ'` | `throws` `/unrecognized position/` (Edit H) |

### Real-snapshot regression (the incident, as a living test)
| # | Scenario | Expected |
|---|---|---|
| 18 | `listDir('ktc')` → take the two lexicographically-latest `snapshot-*.json`, `readJson` both, run `ktcOrderingGuard(older, newer)` | `ok:true`, `rho > 0.99` — proves the real recalibration that the old count guard rejected now passes. Dynamic file pick (no hardcoded dates) so it stays valid as snapshots accrue. |

**Smoke (`npm run smoke`)**: unchanged. `ktc --dry-run` skips the guard by design, so
smoke does not exercise Layer 2 — that is exactly why the unit tests above (run by
`npm test` in the `smoke-test.yml` CI job) are the coverage. Confirm `npm run smoke` and
`npm test` both pass in the done-definition.

---

## 7. Cross-repo impact

**None.** The committed KTC snapshot shape (`{ name, team, value, position }`,
README line 151-160) is unchanged; the manifest entry shape is unchanged; no
`schemaVersion` bump (Invariant 4). Quarantined files are written to a new
`ktc/quarantine/` path that is **not** manifest-registered and **not** under the
app-consumed `ktc/snapshot-*.json` glob, so the app (`src/api/ktc.js`, `ktcMatch.js`,
reads via manifest per the "Manifest contract" row) is unaffected. No Cross-repo
contract in CLAUDE.md is touched. No `docs/signal-registry.md` change (coverage of
ingested fields is unchanged).
