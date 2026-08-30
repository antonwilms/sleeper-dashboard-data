/**
 * scripts/grade-snapshot.mjs — Snapshot adapter + grading orchestration.
 *
 * This is the only layer that knows the snapshot and season-totals file shapes.
 * The pure scorer (lib/grade.mjs) sees only GradeInput — it's source-agnostic.
 *
 * Public exports:
 *   deriveTargetSeason(capturedAtISO)           → number
 *   buildPositionMap(snapshot)                  → Map<playerId, pos>
 *   loadOutcomes(targetSeason)                  → Map<id, OutcomeRecord> | null
 *   buildGradeInputFromSnapshot(snap, out, opts) → GradeInput
 *   gradeSnapshot(opts)                         → GradeReport | null
 *   runSelfTest()                               → void (throws on mismatch)
 *   formatHumanReport(report)                   → string
 */

import { readJson, writeJsonStable } from '../lib/io.mjs';
import { updateManifestEntry }       from '../lib/manifest.mjs';
import { scoreProjections }          from '../lib/grade.mjs';
import { calculateFantasyPoints, RATE_KEYS } from '../lib/fantasyPoints.mjs';

// ─── deriveTargetSeason ───────────────────────────────────────────────────────

/**
 * Heuristic: project targets the following season.
 * Jan–Aug: "offseason capture" → target = year of capturedAt.
 * Sep–Dec: "in-season capture"  → target = year + 1.
 *
 * This is fragile; prefer an explicit snapshot.targetSeason when available.
 *
 * @param {string} capturedAtISO  ISO date-time string.
 * @returns {number}
 */
export function deriveTargetSeason(capturedAtISO) {
  const d = new Date(capturedAtISO);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;  // 1–12
  return m >= 9 ? y + 1 : y;
}

// ─── buildPositionMap ─────────────────────────────────────────────────────────

/**
 * Build a Map<playerId, 'QB'|'RB'|'WR'|'TE'> from snapshot.teamDepthCharts.
 * Players not found in any depth chart remain absent from the map; the
 * adapter assigns them 'UNK'.
 *
 * @param {object} snapshot
 * @returns {Map<string, string>}
 */
export function buildPositionMap(snapshot) {
  const map = new Map();
  const charts = snapshot.teamDepthCharts ?? {};
  for (const teamChart of Object.values(charts)) {
    for (const pos of ['QB', 'RB', 'WR', 'TE']) {
      const entries = teamChart[pos] ?? [];
      for (const entry of entries) {
        if (entry.playerId != null) {
          map.set(String(entry.playerId), pos);
        }
      }
    }
  }
  return map;
}

// ─── Outcome builders ─────────────────────────────────────────────────────────

/** Existing half_ppr logic, factored out unchanged. seasonTotals = parsed file. */
export function buildHalfPprOutcomes(seasonTotals) {
  const map = new Map();
  for (const [id, rec] of Object.entries(seasonTotals)) {
    const gp = rec.gamesPlayed ?? 0;
    const fp = rec.fantasyPoints ?? 0;
    map.set(String(id), {
      actualGames: gp, actualTotalPts: fp,
      actualPPG: gp > 0 ? fp / gp : null, played: gp > 0,
    });
  }
  return map;
}

/**
 * In-basis: actual points = calculateFantasyPoints(stats, sanitizedScoring) per player.
 * @returns {{ outcomes: Map, droppedTerms: string[], excludedRateKeys: string[], scoredKeyCount: number }}
 */
export function buildInBasisOutcomes(seasonTotals, scoringSettings) {
  // 1. exclude non-additive rate keys (weight ≠ 0)
  const excludedRateKeys = Object.keys(scoringSettings)
    .filter(k => RATE_KEYS.has(k) && scoringSettings[k]);
  const scoring = { ...scoringSettings };
  for (const k of excludedRateKeys) delete scoring[k];

  // 2. stats universe across the whole file
  const universe = new Set();
  for (const rec of Object.values(seasonTotals))
    for (const k in (rec.stats ?? {})) universe.add(k);

  // 3. dropped terms = scored (non-zero, non-rate) keys absent from the universe
  const droppedTerms = Object.keys(scoring)
    .filter(k => scoring[k] && !universe.has(k));
  const scoredKeyCount = Object.keys(scoring)
    .filter(k => scoring[k] && universe.has(k)).length;

  // 4. per-player in-basis points (divisor + 0-GP rule unchanged)
  const map = new Map();
  for (const [id, rec] of Object.entries(seasonTotals)) {
    const gp  = rec.gamesPlayed ?? 0;
    const pts = calculateFantasyPoints(rec.stats ?? {}, scoring);
    map.set(String(id), {
      actualGames: gp, actualTotalPts: pts,
      actualPPG: gp > 0 ? pts / gp : null, played: gp > 0,
    });
  }
  return { outcomes: map, droppedTerms, excludedRateKeys, scoredKeyCount };
}

/**
 * Injectable I/O surface, mirroring scripts/panel-run.mjs's DEFAULT_LOAD.
 */
export const DEFAULT_LOAD = {
  loadSeasonTotals: (year) => readJson(`nfl/season-totals/${year}.json`),
  loadSnapshot:     (date) => readJson(`snapshots/${date}.json`),
};

/**
 * Load nfl/season-totals/<targetSeason>.json and build outcomes.
 * Returns null if the file does not exist.
 * When scoringSettings is provided, builds in-basis outcomes; otherwise half_ppr.
 *
 * @param {number} targetSeason
 * @param {object|null} scoringSettings  v2 snapshot scoringSettings, or null for v1
 * @param {object} load  injectable loaders, defaults to DEFAULT_LOAD
 * @returns {{ outcomes: Map, inBasis: boolean, droppedTerms: string[], excludedRateKeys: string[], scoredKeyCount: number|null } | null}
 */
export function loadOutcomes(targetSeason, scoringSettings = null, load = DEFAULT_LOAD) {
  const data = load.loadSeasonTotals(targetSeason);
  if (!data) return null;
  if (scoringSettings) {
    return { ...buildInBasisOutcomes(data, scoringSettings), inBasis: true };
  }
  return {
    outcomes: buildHalfPprOutcomes(data),
    inBasis: false,
    droppedTerms: [],
    excludedRateKeys: [],
    scoredKeyCount: null,
  };
}

// ─── buildGradeInputFromSnapshot ─────────────────────────────────────────────

/**
 * Adapter: transform a raw snapshot + outcomes Map into a GradeInput.
 * This is the ONLY place that knows the snapshot player shape.
 *
 * @param {object} snapshot    Parsed snapshots/<date>.json
 * @param {Map}    outcomes    Map<playerId, OutcomeRecord> — from loadOutcomes
 * @param {object} opts
 * @param {number}      opts.targetSeason
 * @param {string|null} opts.snapshotDate
 * @param {string}      opts.source      'snapshot' | 'self-test' | …
 * @returns {object}  GradeInput
 */
export function buildGradeInputFromSnapshot(snapshot, outcomes, {
  targetSeason, snapshotDate = null, source = 'snapshot',
  inBasis = false, droppedTerms = [], excludedRateKeys = [], scoredKeyCount = null,
}) {
  const posMap       = buildPositionMap(snapshot);
  const scoringBasis = snapshot.scoringBasis ?? 'unknown';
  const inBasisFlag  = !!inBasis;
  const outcomeBasis = inBasisFlag ? scoringBasis : 'half_ppr';
  const basisMatch   = inBasisFlag ? true : (scoringBasis === outcomeBasis);

  const projections = [];
  for (const [playerId, player] of Object.entries(snapshot.players ?? {})) {
    const proj = player.projection;
    if (!proj) continue;

    projections.push({
      playerId:          String(playerId),
      position:          posMap.get(String(playerId)) ?? 'UNK',
      projectedPPG:      proj.projectedPPG,
      projectedGames:    proj.projectedGames    ?? null,
      projectedTotalPts: proj.projectedTotalPts ?? null,
      confidence:        proj.confidence,
      factors:           proj.factors           ?? null,
    });
  }

  return {
    meta: {
      targetSeason,
      snapshotDate,
      capturedAt:       snapshot.capturedAt ?? null,
      scoringBasis,
      outcomeBasis,
      basisMatch,
      inBasis:          inBasisFlag,
      droppedTerms,
      excludedRateKeys,
      scoredKeyCount,
      source,
    },
    projections,
    outcomes: outcomes ?? new Map(),
  };
}

// ─── gradeSnapshot (orchestration) ───────────────────────────────────────────

/**
 * Full pipeline: load snapshot → resolve season → load outcomes → score → output.
 *
 * Returns the GradeReport, or null if the outcome file is missing or a
 * --strict-basis skip occurs (both are exit-0 conditions, not errors).
 *
 * @param {object} opts
 * @param {string}       opts.snapshotDate   e.g. '2026-06-06'
 * @param {number|null}  opts.targetSeason   override; null = auto-derive
 * @param {boolean}      opts.write          persist grading/<date>.json + manifest
 * @param {boolean}      opts.json           emit JSON to stdout instead of human report
 * @param {boolean}      opts.strictBasis    skip non-half_ppr snapshots
 * @param {boolean}      opts.dryRun         suppress writes even if --write is set
 * @param {object}       opts.load           injectable loaders, defaults to DEFAULT_LOAD
 * @returns {object|null}
 */
export function gradeSnapshot({ snapshotDate, targetSeason: targetSeasonOpt = null, write = false, json = false, strictBasis = false, dryRun = false, load = DEFAULT_LOAD }) {
  // 1. Load snapshot
  const snapshot = load.loadSnapshot(snapshotDate);
  if (!snapshot) {
    throw new Error(
      `snapshots/${snapshotDate}.json not found. ` +
      `Run npm run import:snapshot first to import the export ZIP.`
    );
  }

  // 2. Resolve target season (explicit > snapshot field > heuristic)
  const seasonDerived = targetSeasonOpt == null && snapshot.targetSeason == null;
  const targetSeason  = targetSeasonOpt
    ?? (snapshot.targetSeason != null ? snapshot.targetSeason : deriveTargetSeason(snapshot.capturedAt));

  if (seasonDerived) {
    console.log(`[grade] targetSeason ${targetSeason} derived from capturedAt (${snapshot.capturedAt}) — use --target-season to override.`);
  }

  // 3. Strict-basis check (v1 only — v2 uses in-basis, making strict-basis moot)
  if (strictBasis && snapshot.scoringSettings == null && snapshot.scoringBasis !== 'half_ppr') {
    console.log(
      `[grade] Skipping: --strict-basis set and snapshot scoringBasis is ` +
      `'${snapshot.scoringBasis}' (not half_ppr).`
    );
    return null;
  }

  // 4. Load outcomes (in-basis for v2, half_ppr for v1)
  const scoringSettings = snapshot.scoringSettings ?? null;
  const loaded = loadOutcomes(targetSeason, scoringSettings, load);
  if (!loaded) {
    console.log(
      `[grade] nfl/season-totals/${targetSeason}.json not found — ` +
      `outcome not available yet (expected before the season completes).`
    );
    return null;
  }
  const { outcomes, inBasis, droppedTerms, excludedRateKeys, scoredKeyCount } = loaded;

  // 5. Build GradeInput and score
  const gradeInput = buildGradeInputFromSnapshot(snapshot, outcomes, {
    targetSeason,
    snapshotDate,
    source: 'snapshot',
    inBasis,
    droppedTerms,
    excludedRateKeys,
    scoredKeyCount,
  });

  const report = scoreProjections(gradeInput);

  // Decorate meta with runtime fields
  report.meta.gradedAt      = new Date().toISOString();
  report.meta.harnessVersion = 1;
  if (seasonDerived) report.meta.targetSeasonDerived = true;

  // 6. Output
  if (json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    process.stdout.write(formatHumanReport(report) + '\n');
  }

  // 7. Persist (if --write and not --dry-run)
  if (write && !dryRun) {
    const outPath = `grading/${snapshotDate}.json`;
    writeJsonStable(outPath, report);
    updateManifestEntry({
      path:         outPath,
      recordCount:  report.counts.graded,
      inProgress:   false,
      schemaVersion: 1,
    });
    console.log(`[grade] Written → ${outPath}`);
  } else if (write && dryRun) {
    console.log(`[grade] --dry-run: would write grading/${snapshotDate}.json (suppressed).`);
  }

  return report;
}

// ─── runSelfTest ──────────────────────────────────────────────────────────────

/**
 * Fixture self-test. Loads test/fixtures/grade-snapshot.json +
 * test/fixtures/grade-outcomes-<year>.json, runs the full pipeline, and
 * asserts the hand-computed expected metrics. Throws on any mismatch.
 *
 * Also runs the basis-mismatch regression: confirms that setting
 * scoringBasis='custom' (basisMatch=false) produces an identical games block
 * and injects the basis caveat.
 */
export function runSelfTest() {
  const snapshot = readJson('test/fixtures/grade-snapshot.json');
  if (!snapshot) throw new Error('[self-test] test/fixtures/grade-snapshot.json not found');

  const targetSeason  = deriveTargetSeason(snapshot.capturedAt);
  const rawOutcomes   = readJson(`test/fixtures/grade-outcomes-${targetSeason}.json`);
  if (!rawOutcomes) {
    throw new Error(`[self-test] test/fixtures/grade-outcomes-${targetSeason}.json not found`);
  }

  // Convert raw outcomes to Map<id, OutcomeRecord>
  const outcomes = new Map();
  for (const [id, rec] of Object.entries(rawOutcomes)) {
    const gp  = rec.gamesPlayed   ?? 0;
    const fp  = rec.fantasyPoints ?? 0;
    outcomes.set(String(id), {
      actualGames:    gp,
      actualTotalPts: fp,
      actualPPG:      gp > 0 ? fp / gp : null,
      played:         gp > 0,
    });
  }

  const gradeInput = buildGradeInputFromSnapshot(snapshot, outcomes, {
    targetSeason,
    snapshotDate: 'fixture',
    source:       'self-test',
  });

  const report = scoreProjections(gradeInput);

  // ── Assertion helpers ──────────────────────────────────────────────────────
  function assert(condition, message) {
    if (!condition) throw new Error(`[self-test] FAILED: ${message}`);
  }
  function close(a, b, msg, tol = 1e-9) {
    if (a == null || b == null || Math.abs(a - b) > tol) {
      throw new Error(`[self-test] FAILED: ${msg}: got ${a}, expected ${b}`);
    }
  }

  // counts
  assert(report.counts.projected === 5, 'counts.projected === 5');
  assert(report.counts.graded    === 3, 'counts.graded === 3');
  assert(report.counts.dnp       === 1, 'counts.dnp === 1');
  assert(report.counts.absent    === 1, 'counts.absent === 1');

  // byPosition.QB  (p1 only)
  assert(report.byPosition.QB.n === 1, 'QB n === 1');
  close(report.byPosition.QB.maePPG,  2.0, 'QB maePPG');
  close(report.byPosition.QB.biasPPG, 2.0, 'QB biasPPG');

  // byPosition.RB  (p2, p3)
  assert(report.byPosition.RB.n === 2, 'RB n === 2');
  close(report.byPosition.RB.maePPG,  2.0, 'RB maePPG');
  close(report.byPosition.RB.biasPPG, 2.0, 'RB biasPPG');

  // byConfidence.high  (p1, p2)
  assert(report.byConfidence.high.n === 2, 'high n === 2');
  close(report.byConfidence.high.maePPG,  2.5, 'high maePPG');
  close(report.byConfidence.high.biasPPG, 2.5, 'high biasPPG');

  // byConfidence.low  (p3)
  assert(report.byConfidence.low.n === 1, 'low n === 1');
  close(report.byConfidence.low.maePPG,  1.0, 'low maePPG');
  close(report.byConfidence.low.biasPPG, 1.0, 'low biasPPG');

  // byConfidence.medium (p4 dnp → n=0)
  assert(report.byConfidence.medium.n === 0, 'medium n === 0');

  // calibration
  close(report.calibration.maeByBucket.high, 2.5, 'calib high mae');
  assert(report.calibration.maeByBucket.medium === null, 'calib medium mae === null');
  close(report.calibration.maeByBucket.low, 1.0, 'calib low mae');
  assert(report.calibration.monotonic === false, 'calibration not monotonic (high 2.5 > low 1.0)');

  // games  (p1=0, p2=−1, p3=+1, p4=0 → mae=0.5, bias=0, n=4)
  assert(report.games.n === 4, 'games.n === 4');
  close(report.games.mae,  0.5, 'games.mae');
  close(report.games.bias, 0,   'games.bias');

  // factor diagnostics: durabilityFactor (varies → r ≠ null), regressionFactor (constant → r = null)
  const duraDiag = report.factorDiagnostics.find(d => d.factor === 'durabilityFactor');
  assert(duraDiag !== undefined, 'durabilityFactor diag present');
  assert(duraDiag.n === 3, 'durabilityFactor n === 3');
  assert(duraDiag.r !== null, 'durabilityFactor r not null');
  assert(typeof duraDiag.r === 'number' && duraDiag.r >= -1 && duraDiag.r <= 1,
    'durabilityFactor r in [-1, 1]');
  assert(duraDiag.note.includes('low-n'), 'durabilityFactor note includes low-n');

  const regDiag = report.factorDiagnostics.find(d => d.factor === 'regressionFactor');
  assert(regDiag !== undefined, 'regressionFactor diag present');
  assert(regDiag.r === null, 'regressionFactor r === null (zero variance)');

  // ── Basis-mismatch regression ──────────────────────────────────────────────
  const customInput = {
    ...gradeInput,
    meta: { ...gradeInput.meta, scoringBasis: 'custom', basisMatch: false },
  };
  const customReport = scoreProjections(customInput);

  assert(customReport.meta.basisMatch === false, 'custom basisMatch === false');
  assert(
    customReport.caveats.some(c => c.toLowerCase().includes('basis')),
    'basis caveat present in custom report'
  );
  // games block must be byte-identical (basis-independent)
  assert(customReport.games.mae  === report.games.mae,  'games.mae basis-independent');
  assert(customReport.games.bias === report.games.bias, 'games.bias basis-independent');
  assert(customReport.games.n    === report.games.n,    'games.n basis-independent');

  // ── In-basis (v2) section ─────────────────────────────────────────────────
  const v2Snapshot = readJson('test/fixtures/grade-snapshot-v2.json');
  if (!v2Snapshot) throw new Error('[self-test] test/fixtures/grade-snapshot-v2.json not found');

  const v2SeasonTotals = readJson('test/fixtures/grade-season-totals-v2.json');
  if (!v2SeasonTotals) throw new Error('[self-test] test/fixtures/grade-season-totals-v2.json not found');

  // Pure-builder unit: proves dot-product, rate exclusion, dropped terms
  const builderResult = buildInBasisOutcomes(v2SeasonTotals, v2Snapshot.scoringSettings);
  assert(builderResult.droppedTerms.includes('bonus_xyz'), 'v2 droppedTerms includes bonus_xyz');
  assert(builderResult.excludedRateKeys.includes('rec_ypr'), 'v2 excludedRateKeys includes rec_ypr');
  assert(builderResult.scoredKeyCount === 5, 'v2 scoredKeyCount === 5');
  const p1outcome = builderResult.outcomes.get('p1');
  close(p1outcome.actualPPG, 7.0, 'v2 p1 actualPPG (in-basis, not decoy)');

  // Full pipeline
  const v2GradeInput = buildGradeInputFromSnapshot(v2Snapshot, builderResult.outcomes, {
    targetSeason:     v2Snapshot.targetSeason,
    snapshotDate:     'fixture-v2',
    source:           'self-test',
    inBasis:          true,
    droppedTerms:     builderResult.droppedTerms,
    excludedRateKeys: builderResult.excludedRateKeys,
    scoredKeyCount:   builderResult.scoredKeyCount,
  });
  const v2Report = scoreProjections(v2GradeInput);

  // counts
  assert(v2Report.counts.projected === 5, 'v2 counts.projected === 5');
  assert(v2Report.counts.graded    === 3, 'v2 counts.graded === 3');
  assert(v2Report.counts.dnp       === 1, 'v2 counts.dnp === 1');
  assert(v2Report.counts.absent    === 1, 'v2 counts.absent === 1');

  // meta
  assert(v2Report.meta.inBasis     === true,     'v2 meta.inBasis === true');
  assert(v2Report.meta.basisMatch  === true,     'v2 meta.basisMatch === true');
  assert(v2Report.meta.outcomeBasis === 'custom', 'v2 meta.outcomeBasis === custom');
  assert(v2Report.meta.excludedRateKeys.includes('rec_ypr'), 'v2 meta.excludedRateKeys has rec_ypr');
  assert(v2Report.meta.droppedTerms.includes('bonus_xyz'),   'v2 meta.droppedTerms has bonus_xyz');
  assert(v2Report.meta.scoredKeyCount === 5, 'v2 meta.scoredKeyCount === 5');

  // byPosition
  assert(v2Report.byPosition.QB.n === 1, 'v2 QB n === 1');
  close(v2Report.byPosition.QB.maePPG,  2.0, 'v2 QB maePPG');
  close(v2Report.byPosition.QB.biasPPG, 2.0, 'v2 QB biasPPG');

  assert(v2Report.byPosition.RB.n === 2, 'v2 RB n === 2');
  close(v2Report.byPosition.RB.maePPG,  2.0, 'v2 RB maePPG');
  close(v2Report.byPosition.RB.biasPPG, 2.0, 'v2 RB biasPPG');

  // byConfidence
  assert(v2Report.byConfidence.high.n   === 2, 'v2 high n === 2');
  close(v2Report.byConfidence.high.maePPG,  2.5, 'v2 high maePPG');
  close(v2Report.byConfidence.high.biasPPG, 2.5, 'v2 high biasPPG');

  assert(v2Report.byConfidence.low.n    === 1, 'v2 low n === 1');
  close(v2Report.byConfidence.low.maePPG,  1.0, 'v2 low maePPG');
  close(v2Report.byConfidence.low.biasPPG, 1.0, 'v2 low biasPPG');

  assert(v2Report.byConfidence.medium.n === 0, 'v2 medium n === 0');
  assert(v2Report.byConfidence.rookie.n === 0, 'v2 rookie n === 0');

  // calibration
  assert(v2Report.calibration.monotonic === false, 'v2 calibration not monotonic');

  // games
  assert(v2Report.games.n === 4, 'v2 games.n === 4');
  close(v2Report.games.mae,  0.5, 'v2 games.mae');
  close(v2Report.games.bias, 0,   'v2 games.bias');

  // caveats: no basis-mismatch; one dropped-term; one rate-excluded
  assert(
    !v2Report.caveats.some(c => c.toLowerCase().includes('basis mismatch')),
    'v2 no basis-mismatch caveat'
  );
  assert(
    v2Report.caveats.some(c => c.includes('bonus_xyz')),
    'v2 dropped-term caveat mentions bonus_xyz'
  );
  assert(
    v2Report.caveats.some(c => c.includes('rec_ypr')),
    'v2 rate-excluded caveat mentions rec_ypr'
  );

  console.log('[grade] Self-test passed ✓');
}

// ─── formatHumanReport ───────────────────────────────────────────────────────

/**
 * Render a GradeReport as a human-readable string.
 * @param {object} report  GradeReport
 * @returns {string}
 */
export function formatHumanReport(report) {
  const { meta, counts, overall, byPosition, byConfidence, calibration, games, factorDiagnostics, caveats } = report;

  const lines = [];

  lines.push('');
  lines.push('┌─────────────────────────────────────────────────────────────┐');
  lines.push(`│  Projection Grading Report                                  │`);
  lines.push(`│  Snapshot:  ${(meta.snapshotDate ?? 'synthetic').padEnd(49)}│`);
  lines.push(`│  Season:    ${String(meta.targetSeason).padEnd(49)}│`);
  if (meta.targetSeasonDerived) {
    lines.push(`│  (season derived from capturedAt — use --target-season to   │`);
    lines.push(`│   override if the heuristic is wrong for this capture)      │`);
  }
  if (meta.inBasis) {
    const basisStr   = `in-basis (${meta.scoringBasis}) — authoritative`;
    lines.push(`│  Basis:     ${basisStr.padEnd(48)}│`);
    const scoringStr = `Scored keys: ${meta.scoredKeyCount ?? 'n/a'}  dropped: ${meta.droppedTerms?.length ?? 0}  rate-excluded: ${meta.excludedRateKeys?.length ?? 0}`;
    lines.push(`│  ${scoringStr.padEnd(59)}│`);
  } else {
    lines.push(`│  Basis:     outcomes=half_ppr, snapshot=${meta.scoringBasis}${meta.basisMatch ? '' : '  ⚠ MISMATCH'}${' '.repeat(Math.max(0, 18 - (meta.scoringBasis ?? '').length - (meta.basisMatch ? 0 : 10)))}│`);
  }
  if (meta.gradedAt) {
    lines.push(`│  Graded:    ${meta.gradedAt.padEnd(49)}│`);
  }
  lines.push('└─────────────────────────────────────────────────────────────┘');
  lines.push('');
  lines.push(`  Players:  projected=${counts.projected}  graded=${counts.graded}  dnp=${counts.dnp}  absent=${counts.absent}`);
  lines.push('');

  // Overall
  lines.push('── Overall ──────────────────────────────────────────────────');
  lines.push(metricHeader());
  lines.push(metricRow('(all)', overall));
  lines.push('');

  // By position
  lines.push('── By Position ──────────────────────────────────────────────');
  lines.push(metricHeader());
  for (const pos of ['QB', 'RB', 'WR', 'TE', 'UNK']) {
    const b = byPosition[pos];
    if (b && b.n > 0) lines.push(metricRow(pos, b));
  }
  lines.push('');

  // By confidence + calibration
  lines.push('── By Confidence ────────────────────────────────────────────');
  lines.push(metricHeader());
  for (const conf of ['high', 'medium', 'low', 'rookie']) {
    const b = byConfidence[conf];
    if (b && b.n > 0) lines.push(metricRow(conf, b));
  }
  lines.push('');

  const calibParts = calibration.order
    .filter(b => calibration.maeByBucket[b] !== null)
    .map(b => `${b}=${calibration.maeByBucket[b].toFixed(2)}`);
  const calibVerdict = calibration.monotonic ? '✓ monotonic' : '✗ NOT monotonic (high confidence less accurate than expected)';
  lines.push(`  Calibration: [${calibParts.join(' → ')}] — ${calibVerdict}`);
  lines.push(`  Note: ${calibration.note}`);
  lines.push('');

  // Games block
  lines.push('── Games (projectedGames vs actualGames — basis-independent) ─');
  if (games.n > 0) {
    lines.push(`  n=${games.n}  MAE=${fmt(games.mae)}  bias=${fmt(games.bias)}`);
  } else {
    lines.push('  No data (no players with projectedGames and an outcome record).');
  }
  lines.push('');

  // Factor correlations
  const diagsWithR = factorDiagnostics
    .filter(d => d.r !== null)
    .sort((a, b) => Math.abs(b.r) - Math.abs(a.r));

  if (diagsWithR.length > 0) {
    lines.push('── Top Factor Correlations (residual = actualPPG − projectedPPG) ─');
    lines.push('  Note: diagnostic only — collinearity between factors limits causal interpretation.');
    lines.push('  factor                           n       r   note');
    for (const d of diagsWithR.slice(0, 10)) {
      const noteStr = d.note ? `  [${d.note}]` : '';
      lines.push(
        `  ${d.factor.padEnd(32)} ${String(d.n).padStart(3)}  ${d.r.toFixed(3).padStart(6)}${noteStr}`
      );
    }
    lines.push('');
  }

  // Caveats
  if (caveats.length > 0) {
    lines.push('── Caveats ──────────────────────────────────────────────────');
    for (const c of caveats) {
      lines.push(`  ⚠  ${c}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function metricHeader() {
  return '  label                   n   maePPG  biasPPG  maeTotal  biasTotal';
}

function metricRow(label, b) {
  if (b.n === 0) return `  ${label.padEnd(23)} ${String(b.n).padStart(3)}  (no data)`;
  return [
    `  ${label.padEnd(23)}`,
    String(b.n).padStart(3),
    fmt(b.maePPG).padStart(9),
    fmt(b.biasPPG).padStart(9),
    b.maeTotal  != null ? fmt(b.maeTotal).padStart(10)  : '       n/a',
    b.biasTotal != null ? fmt(b.biasTotal).padStart(10) : '       n/a',
  ].join(' ');
}

function fmt(n) {
  if (n == null) return 'n/a';
  return n.toFixed(2);
}
